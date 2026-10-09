/* Character sheets (1.5.0) — the UI half: the System editor (#systemModal — fields, rolls, characters, Start from a
   preset, export / import), the sheet panel over the play map (#sheetPanel), the hover-card and party-strip lines,
   token links (charId, write-through ownership), the feature switch `sheets` (wpSheetsSync), and the hooks net.js
   calls (playerSystem, charChanged, charGone, editResult). The pure half is systemcore.js; the wire is net.js;
   the engine formula.js. Design of record: docs/SHEET_BUILDER_PLAN.md. */
import { state } from './state.js';
import { getActiveCampaign } from './models.js';
import { save, toast } from './io.js';
import { picRef } from './safecore.js';
import { showConfirm, showPrompt } from './dialogs.js';
import { timeRuleRun, droppedCounts, validPageId, LIMITS, KINDS, showsIf, rowRollNames, gmOnlyNames, applyAct, applyScope, applyRound, dueActs, combatChars, roundSecs, fxLeftNow, lastsSecs, APPLY_KINDS, TURN_UNITS, LIGHT_UNITS, RANGE_UNITS, HEIGHT_UNITS, TIME_WORDS, STORED, DEF_PROP, BAND_KINDS, IDENTITY_KINDS, LEDGER_KINDS, headerEntry, captionParts, emptySystem, uid, validKey, cleanSystem, cleanChar, validateSystem, resolveAll, hoverLines, autoLayout, applyEdit, applyEffectOp, fxText, fmtNum, budgetsOf, budgetWatch, budgetSays, needsMet, needsSays, initRoll, aliasFromShadowBase, sbRowOps, sbApplyProposal, cleanUploads, sideOf, threatArc, facingCtx, stanceCtx, tokenCtx, POSTURE_IDS, POSTURE_NAMES, DEFAULT_POSTURES, postureList, postureAt, autoEffectsOn, initTie, charTokenOn, cycleThreat, valueTone, TONES, activeCharOf, playableChars, ownedTokenPlan, applyOwnerOps, migrateBindings, capExpr, cleanValue, fieldById, valueOpts, applyRowOp, rowIdOf, rowDef, orphanRows, stampRows, cleanRowDef, projectRows, STAT_KEY, PALETTE_KEYS, GLYPHS, glyphPath, headerEdits, pinTargets, pinTargetsAll, hudView, hudHasContent, resetTargets, cleanListSpec, statKey, rowStat, rowPaid, itemReach, gmDerivedNames, labelGmNames, gmEffectNames, labelNames, withRound, rangeCtx, withRange, rowLvl, rowOn, cleanItemKey, charForView, secretFieldIds, gmViewFields } from './systemcore.js';
import { fileBase, charToJson, charFromJson, sheetToMarkdown, isCharFile } from './sheetexport.js';
import { cleanCalendar, fmtWhen, fmtDate, timeOf, calPreset, CAL_LIMITS } from './calendarcore.js';

var ui = function(id) { return document.getElementById(id); };
var NL = String.fromCharCode(10);
function F() { return window.wpFormula || null; }
function net() { return window.wpNet || null; }
function featureOn() { return window.wpVtt ? !!window.wpVtt.on('sheets') : true; }
function canWrite() { return !!(window.wpCanPersistLocal && window.wpCanPersistLocal()) && !window.wpStream; }
function isClient() { var n = net(); return !!(n && n.active && n.role === 'client' && !n.stream); }
// Item 20 K5b ("reset drained attributes if the GM allows"): at a table whose GM fills pools themselves (camp.turnRules.fill: 'gm'), a player's
// Fill button and a section's Reset all stay inert — their pools still move by − and + as the system lets them
function fillBarred() { var camp = getActiveCampaign(); return isClient() && !!camp && !!camp.turnRules && typeof camp.turnRules === 'object' && camp.turnRules.fill === 'gm'; }
function myId() { var n = net(); return n ? n.myId : null; }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function opt(value, text, selected) { var o = el('option', null, text); o.value = value; if (selected) o.selected = true; return o; }
function pref(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
function setPref(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
// [sinkcheck:sheetimg-start]
function imgSrc(p) { var n = net(), out = n && n.assetSrc ? n.assetSrc(p) : p; return out === p ? picRef(p) : out; }   // unchanged (the GM; a bundled asset): the app's own pictures only — a web address from a file never loads
// [sinkcheck:sheetimg-end]

/* ---------- the campaign's system and characters ---------- */
function systemOf(camp) { camp = camp || getActiveCampaign(); return camp && camp.system && typeof camp.system === 'object' ? camp.system : null; }
// Stage 6 library L1d: the players' view is worked out once per exact system and page set (a library core makes it dearer), and handed
// out as a copy; the key is the system's whole text, so no two systems can ever share a view
var _pvMemo = { key: null, text: null };
function playerSystem(camp) {
    camp = camp || getActiveCampaign(); if (!camp || !camp.system || !F()) return null;
    var LBc = window.wpLibrary, lcs = isClient() ? {} : LBc && LBc.catsFor ? LBc.catsFor(camp) : null;   // a list's categories: the library's on the GM's machine; a client's copy is the host's view (nothing GM-only to hide)
    var pages = readablePages(camp), key = JSON.stringify(camp.system) + '\n' + pages.join(',') + '\n' + JSON.stringify(lcs);
    var nsh = isClient() ? true : LBc && LBc.needShown ? LBc.needShown : null;   // 126b: which entries players may see, for a need that names one: the library's own judge on the GM's machine; a client's copy is the host's view
    if (typeof nsh === 'function') (Array.isArray(camp.system.items) ? camp.system.items : []).concat(Array.isArray(camp.system.core) ? camp.system.core : []).forEach(function(it) { if (it && Array.isArray(it.needs)) it.needs.forEach(function(n) { key += n && nsh(n.id) === true ? '1' : '0'; }); });   // ... and the kept view follows it
    var rsh = !isClient() && LBc && LBc.needRuleShown ? LBc.needRuleShown : null;   // ... and whether players may read an entry's rule (the library's judge, which also knows its own GM-only keys; without it the core judges by the system alone)
    if (rsh) (Array.isArray(camp.system.items) ? camp.system.items : []).concat(Array.isArray(camp.system.core) ? camp.system.core : []).forEach(function(it) { if (it && typeof it.needsIf === 'string' && it.needsIf) key += rsh(it.needsIf) === true ? 'R' : 'r'; });
    if (_pvMemo.key !== key) { var v = cleanSystem(camp.system, { F: F(), gmView: false, pages: pages, libCats: lcs, needShown: nsh, ruleShown: rsh }); _pvMemo = { key: key, text: v ? JSON.stringify(v) : null }; }
    return _pvMemo.text === null ? null : JSON.parse(_pvMemo.text);
}
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
    var dp = ui('docPanel'), sp = frontView();   // HUD frame (HF2a): the sheet or a HUD, whichever is in front
    if (dp && sp) {   // the doc panel opens where the sheet is by default: put it beside the view instead
        var a = dp.getBoundingClientRect(), b = sp.getBoundingClientRect();
        var ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)), oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
        if (ox > 0 && oy > 0) {   // any overlap: beside the sheet, left if it fits, else right; where neither fits it stays (it is on top anyway)
            var left = b.left - a.width - 12; if (left < 8) left = (b.right + 12 + a.width <= window.innerWidth - 8) ? b.right + 12 : null;
            if (left !== null) { dp.style.left = Math.round(left) + 'px'; dp.style.right = 'auto'; dp.style.top = Math.round(Math.max(8, b.top)) + 'px'; }
        }
    }
    raisePanel(dp);   // HF2a: over the HUDs too (a no-op while none is open)
    var si = ui('docPanelSearchInput'); if (si) { try { si.focus({ preventScroll: true }); } catch (e) {} }   // so Esc closes the page before the sheet
}
// What the open sheet's chips and links show (each referenced page: here or not, its title, GM-only), recorded at every live render;
// net.js redraws the sheet only when a page's arrival, change or removal would change it — never for a page the sheet doesn't name,
// and never for a content edit (a rebuild mid-typing would fire the focused input's change)
var _sheetRefSig = '';
function refSig(sys) {
    var ids = [], sh = sys && sys.sheet; if (!sh || !Array.isArray(sh.sections)) return '';
    var secs = sh.sections.concat(sh.hud && Array.isArray(sh.hud.sections) ? sh.hud.sections : []);   // HUD frame (HF2a): the HUD's chips and links too
    secs.forEach(function(s) { if (s.chip) ids.push(s.chip); (s.fields || []).forEach(function(p) { if (p && p.kind === 'link' && p.page) ids.push(p.page); }); });
    return ids.map(function(id) { var r = pageRef(id); return id + '=' + (r ? (r.gmOnly ? 'g:' : 'p:') + r.title : '-'); }).join('\n');
}
function sheetRefsChanged() {
    if (!sheetOpen && !Object.keys(huds).length) return false;   // HF2a: the sheet or a HUD
    var camp = getActiveCampaign(); return refSig(systemOf(camp)) !== _sheetRefSig;
}
// A handbook chip for a section header (the owner's Foundry chips): a span, not a button, inside the <summary> of a collapsible
// section — the click must not fold the section, so it prevents the default as well as stopping the bubble.
function pageChip(id, c) {   // c (H12b): the character whose view shows it — a HUD search of theirs opens the page
    var ref = pageRef(id); if (!ref) return null;
    var ch = el('span', 'sheet-sec-chip' + (ref.gmOnly ? ' sheet-chip-gm' : '')); ch.setAttribute('role', 'button'); ch.tabIndex = 0;
    ch.title = 'Open \u201c' + ref.title + '\u201d' + (ref.gmOnly ? ' \u2014 GM only: players don\u2019t see this chip' : ''); ch.setAttribute('aria-label', ch.title);
    ch.appendChild(el('span', 'sheet-chip-ico', '\ud83d\udcd6')); ch.appendChild(el('span', 'sheet-chip-txt', ref.title));
    var go = function(e) { e.preventDefault(); e.stopPropagation(); if (ch.closest('#systemModal')) return; openPageFor(c, id); };
    ch.addEventListener('click', go); ch.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') go(e); });
    return ch;
}
/* Stage 6 HUD H12: the handbook search placement (the reference's Handbook tab). The viewer's own pages — the GM's all (GM-only marked),
   a player's the ones shared with them — listed, then searched by heading as they type; in the text on Enter, on the button, or by itself
   450 ms after the headings come up empty (3+ characters). A hit opens its page right here, at its heading, in the reader's own render;
   Open in reader opens it there. What it shows is kept per view and placement for the session, across repaints. Text nodes only. */
var _hb = Object.create(null), HB_DEEP_MS = 450;
function hbKey(vctx, c, sec, i) { return ((vctx && vctx.preview) ? 'p' : (vctx && vctx.view === 'hud') ? 'h' : 's') + '-' + String((c && c.id) || 'x').replace(/[^A-Za-z0-9_]/g, '') + '-' + String((sec && sec.id) || 'x').replace(/[^A-Za-z0-9_]/g, '') + '-' + (i | 0); }
function hbState(key) { return _hb[key] || (_hb[key] = { q: '', deep: null, view: null, more: Object.create(null), timer: 0, go: false }); }
function hbPages() {
    var camp = getActiveCampaign(), items = (camp && camp.items) || {}, out = [];
    Object.keys(items).forEach(function(id) { var it = items[id]; if (!it || it.type !== 'doc') return; out.push({ id: id, title: String((it.meta && it.meta.title) || 'Page'), doc: it, gmOnly: !!(it.meta && it.meta.players === false) }); });
    out.sort(function(a, b) { return a.title.localeCompare(b.title); });
    return out;
}
function hbNode(key) { var box = el('div', 'sheet-field sheet-kind-search sheet-hb'); box.dataset.hb = key; hbDraw(box, key); return box; }
function hbLive(key) { var b = document.querySelector('.sheet-hb[data-hb="' + key + '"]'); return b && b.isConnected !== false ? b : null; }   // the box this key draws in now (a repaint makes a new one)
function hbDraw(box, key) {
    var st = hbState(key); box.textContent = '';
    if (st.view) { hbReader(box, key, st); return; }
    var bar = el('div', 'sheet-hb-bar'), inp = el('input', 'field sheet-hb-q'); inp.type = 'search'; inp.placeholder = 'Search the handbook'; inp.value = st.q; inp.dataset.fid = key; inp.dataset.part = 'q'; inp.setAttribute('aria-label', 'Search the handbook'); inp.maxLength = 120;
    var deep = el('button', 'tool ghost sheet-hb-deep', 'Search inside pages'); deep.type = 'button'; deep.title = 'Look for the words in the pages\u2019 text (Enter)';
    var res = el('div', 'sheet-hb-res');
    inp.addEventListener('input', function() { st.q = inp.value.slice(0, 120); st.deep = null; st.more = Object.create(null); clearTimeout(st.timer); hbResults(res, key, st); deep.disabled = st.q.trim().length < 2; });
    inp.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); hbDeep(key, st); } else if (e.key === 'Escape' && st.q) { e.preventDefault(); e.stopPropagation(); st.q = ''; st.deep = null; inp.value = ''; clearTimeout(st.timer); hbResults(res, key, st); } });
    deep.disabled = st.q.trim().length < 2; deep.addEventListener('click', function() { hbDeep(key, st); });
    bar.appendChild(inp); bar.appendChild(deep); box.appendChild(bar); box.appendChild(res);
    hbResults(res, key, st);
}
function hbDeep(key, st) { var DR = window.wpDocRender, q = st.q.trim(); clearTimeout(st.timer); if (!DR || !DR.hbText || q.length < 2) return; st.deep = DR.hbText(hbPages(), q); var b = hbLive(key); if (b) hbResults(b.querySelector('.sheet-hb-res'), key, st); }
function hbOpen(key, st, id, bi) { st.view = { id: id, bi: typeof bi === 'number' ? bi : -1 }; st.go = true; var b = hbLive(key); if (b) hbDraw(b, key); }
function hbPageRow(p, key, st) {
    var r = el('button', 'sheet-hb-page-row'); r.type = 'button'; r.appendChild(iconNode('icon:book-open', 'sheet-hb-ico')); r.appendChild(el('span', 'sheet-hb-ptitle', p.title));
    if (p.gmOnly) r.appendChild(el('span', 'sheet-chip sheet-chip-gm', 'GM only'));
    r.title = 'Open \u201c' + p.title + '\u201d here'; r.addEventListener('click', function() { hbOpen(key, st, p.id, -1); });
    return r;
}
function hbResults(res, key, st) {
    if (!res) return; res.textContent = '';
    var DR = window.wpDocRender, pages = hbPages(), q = st.q.trim(), byId = Object.create(null); pages.forEach(function(p) { byId[p.id] = p; });
    if (!pages.length) { res.appendChild(el('div', 'sheet-hb-empty notepad-who', 'No handbook pages here yet.')); return; }
    if (!q || !DR || !DR.hbHeadings) { pages.forEach(function(p) { res.appendChild(hbPageRow(p, key, st)); }); return; }
    var heads = DR.hbHeadings(pages, q);
    heads.forEach(function(h) {
        var p = byId[h.id]; if (!p) return; var grp = el('div', 'sheet-hb-group'); grp.appendChild(hbPageRow(p, key, st));
        var all = !!st.more[h.id], shown = all ? h.heads : h.heads.slice(0, 3);
        shown.forEach(function(x) { var hr = el('button', 'sheet-hb-head', x.title); hr.type = 'button'; hr.title = 'Open \u201c' + p.title + '\u201d here, at this heading'; hr.addEventListener('click', function() { hbOpen(key, st, h.id, x.bi); }); grp.appendChild(hr); });
        if (!all && h.heads.length > 3) { var mo = el('button', 'tool ghost sheet-hb-more', '+' + (h.heads.length - 3) + ' more'); mo.type = 'button'; mo.addEventListener('click', function() { st.more[h.id] = true; hbResults(res, key, st); }); grp.appendChild(mo); }
        res.appendChild(grp);
    });
    if (st.deep) {
        var dh = st.deep.hits || []; res.appendChild(el('div', 'sheet-hb-sub', dh.length ? 'In the text: ' + (st.deep.over ? dh.length + '+' : dh.length) + (dh.length === 1 && !st.deep.over ? ' place' : ' places') : 'Nothing in the text either.'));
        dh.forEach(function(x) {
            var hit = el('button', 'sheet-hb-hit'); hit.type = 'button'; hit.appendChild(el('span', 'sheet-hb-where', x.page + (x.head && x.head !== x.page ? ' \u203a ' + x.head : '')));   // a page titled by its own first heading names it once
            var sn = el('span', 'sheet-hb-snip'); sn.appendChild(document.createTextNode(x.before)); if (x.hit) sn.appendChild(el('mark', null, x.hit)); sn.appendChild(document.createTextNode(x.after)); hit.appendChild(sn);
            hit.addEventListener('click', function() { hbOpen(key, st, x.id, x.bi); }); res.appendChild(hit);
        });
    } else if (!heads.length) {
        res.appendChild(el('div', 'sheet-hb-empty notepad-who', q.length >= 3 ? 'No heading matches \u2014 looking in the text\u2026' : 'No heading matches. Press Enter to look in the text.'));
        if (q.length >= 3) { clearTimeout(st.timer); st.timer = setTimeout(function() { if (st.q.trim() === q && !st.deep && !st.view) hbDeep(key, st); }, HB_DEEP_MS); }   // no dead ends: the text by itself
    }
}
// H12b (the reference's openHandbook): where a character's HUD searches the handbook — the first Handbook search in the HUD this viewer
// holds ({ tab, key }), or null (no HUD of theirs, no search in it). A chip or a Handbook link then opens its page there, else as before
function hbHudTarget(c) {
    if (!c || !hudFor(c.id)) return null;
    var sys = systemOf(getActiveCampaign()), h = sys && sys.sheet && sys.sheet.hud, secs = h && Array.isArray(h.sections) ? h.sections : [];
    for (var s = 0; s < secs.length; s++) { var fl = secs[s] && Array.isArray(secs[s].fields) ? secs[s].fields : []; for (var i = 0; i < fl.length; i++) if (fl[i] && fl[i].kind === 'search') return { tab: typeof secs[s].tab === 'string' ? secs[s].tab : '', key: hbKey({ view: 'hud' }, c, secs[s], i) }; }
    return null;
}
function openPageFor(c, id) {
    var t = window.wpPopout ? null : hbHudTarget(c);   // a pop-out sheet hands pages to the main window, as before
    if (!t) { openPage(id); return; }
    var st = hbState(t.key); st.view = { id: id, bi: -1 }; st.go = true;
    openHud(c.id, t.tab ? { tab: t.tab } : null);
}
function hbReader(box, key, st) {
    var camp = getActiveCampaign(), items = (camp && camp.items) || {}, it = Object.prototype.hasOwnProperty.call(items, st.view.id) ? items[st.view.id] : null;
    if (!it || it.type !== 'doc') { st.view = null; hbDraw(box, key); return; }   // gone, or hidden from this player since
    var bar = el('div', 'sheet-hb-bar'), back = el('button', 'tool ghost sheet-hb-back', '\u2190 Results'); back.type = 'button'; back.dataset.fid = key; back.dataset.part = 'back';
    back.addEventListener('click', function() { st.view = null; hbDraw(box, key); var q = box.querySelector('.sheet-hb-q'); if (q) { try { q.focus({ preventScroll: true }); } catch (e) {} } });
    var id = st.view.id, ttl = el('span', 'sheet-hb-rtitle', String((it.meta && it.meta.title) || 'Page')), open = el('button', 'tool ghost sheet-hb-open', 'Open in reader'); open.type = 'button'; open.title = 'Open this page in the reader, full size';
    open.addEventListener('click', function() { openPage(id); });
    bar.appendChild(back); bar.appendChild(ttl); bar.appendChild(open); box.appendChild(bar);
    var page = el('div', 'doc-view sheet-hb-page'); box.appendChild(page);
    if (window.wpDocRenderPage) window.wpDocRenderPage(page, it);
    var bi = st.view.bi, go = st.go; st.go = false;   // to the heading once, when it is opened (a repaint keeps where the reader scrolled)
    if (go && bi >= 0) setTimeout(function() {
        var t = page.querySelector('[data-blk="' + bi + '"]'); if (!t) return;
        var sc = page.closest ? page.closest('.hud-body, #sheetBody') : null, fr = sc && sc.querySelector('.sheet-frame'), off = fr && fr.getBoundingClientRect ? fr.getBoundingClientRect().height : 0;
        if (t.style) t.style.scrollMarginTop = Math.round(off + 8) + 'px';   // clear of the sticky band and tab strip
        try { t.scrollIntoView({ block: 'start' }); } catch (e) {} t.classList.add('sheet-hb-here');
    }, 0);
}
/* Stage 6 HUD H9: a custom roller (the reference's Custom Roll): a formula box, a name and Roll — rolled as this character through the dice
   engine, as the dice panel rolls as one (the host judges a player's roll like any other). The box starts with the GM's formula (one naming a
   GM-only value never reaches players); what the viewer types is kept for the session. Enter rolls; shift- or alt-click adds a modifier */
var _rl = Object.create(null);
function rollerNode(pl, c, key) {
    var st = _rl[key] || (_rl[key] = { expr: pl.formula || '', label: '' }), can = canRoll(c);
    var box = el('div', 'sheet-field sheet-kind-roller'), row = el('div', 'sheet-roller-row');
    var fx = input('field sheet-roller-expr', st.expr, 'A formula with dice: 2d6 + 3, or 3d6 <= a number to roll against', pl.formula || '2d6 + 3'); fx.dataset.fid = key; fx.dataset.part = 'expr'; fx.maxLength = LIMITS.formula;
    var lb = input('field sheet-roller-label', st.label, 'What it is for (shown on its card)', pl.text || 'Custom roll'); lb.dataset.fid = key; lb.dataset.part = 'label'; lb.maxLength = LIMITS.label;
    var go = el('button', 'tool sheet-roll sheet-roller-go', 'Roll'); go.type = 'button'; go.disabled = !can; go.title = can ? 'Roll it as ' + c.name + ' \u00b7 shift-click to add a modifier' : '(dice are off here, or this is not your character)';
    fx.addEventListener('input', function() { st.expr = fx.value.slice(0, LIMITS.formula); });
    lb.addEventListener('input', function() { st.label = lb.value.slice(0, LIMITS.label); });
    var doRoll = function(e) {
        if ((box.closest && box.closest('#systemModal')) || !canRoll(c)) return;
        var ex = st.expr.trim(); if (!ex) { toast('Type a formula to roll, for example 2d6 + 3.'); return; }
        var lab = st.label.trim() || pl.text || 'Custom roll';
        if (e && (e.shiftKey || e.altKey) && window.wpDice.rollWithMod) window.wpDice.rollWithMod(c.id, ex, lab, { source: 'sheet' }, go); else window.wpDice.rollFor(c.id, ex, lab, { source: 'sheet' });
    };
    go.addEventListener('click', doRoll);
    fx.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); doRoll(e); } });
    row.appendChild(fx); row.appendChild(lb); row.appendChild(go); box.appendChild(row);
    return box;
}
// A handbook link placement: a button that opens its page; nothing at all when the page is not here
function linkNode(pl, c) {
    var ref = pl.page ? pageRef(pl.page) : null; if (!ref) return null;
    var b = el('button', 'tool sheet-roll sheet-link' + (ref.gmOnly ? ' sheet-chip-gm' : ''), '\ud83d\udcd6 ' + (pl.text || ref.title)); b.type = 'button';
    b.title = 'Open \u201c' + ref.title + '\u201d ' + (hbHudTarget(c) ? 'in the HUD\u2019s handbook search' : 'over the map') + (ref.gmOnly ? ' \u2014 GM only: players don\u2019t see this button' : '');   // H12b: where it will open
    b.addEventListener('click', function(e) { e.preventDefault(); if (b.closest('#systemModal')) return; openPageFor(c, pl.page); });
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
function charById(id, camp) { var cs = charsOf(camp); return typeof id === 'string' && id && Object.prototype.hasOwnProperty.call(cs, id) && cs[id] && typeof cs[id] === 'object' ? cs[id] : null; }   // own keys only: a '__proto__' charId from a file is no character
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
// write-through: a character's owner holds its tokens (moves, arrival and the party strip keep reading the token) — through ONE rule
// (systemcore ownedTokenPlan) that the loader and every arrival path share: one token per map, and only for the character IN PLAY (the
// others are kept: their tokens pass to the GM, still linked). First the binding is healed: a player whose record names no character they
// still own has the one they play written down (their only one, or a guess, which goes in the Session Log). keep: the token that wins a give.
function syncOwners(camp, keep) {
    camp = camp || getActiveCampaign(); if (!camp) return 0;
    var heal = migrateBindings(camp, { link: false }), n = net();
    heal.guesses.forEach(function(g) { var ch = charsOf(camp)[g.id]; if (ch && n && n.logEvent) n.logEvent('char', (playerNames(camp)[g.pid] || 'A player') + ' plays ' + ch.name + ' (their other characters are kept) \u2014 change it in System \u25B8 Characters'); });
    var maps = applyOwnerOps(camp, ownedTokenPlan(camp, { keep: keep || '', all: !sheetsOnIn(camp) }));
    if (maps.length && n && n.active && n.role === 'host' && n.pushItems && camp === getActiveCampaign()) n.pushItems(maps);   // a host save sends only the open item
    return maps.length;
}
// Is the sheets feature on for this campaign? Off, characters do not drive tokens: every owned one counts as in play and none is made on arrival
function sheetsOnIn(camp) { return !window.wpVtt || !window.wpVtt.campaignOn || window.wpVtt.campaignOn('sheets', camp) !== false; }
function okPid(pid) { return typeof pid === 'string' && /^[A-Za-z0-9_.:-]{1,80}$/.test(pid) && !(pid in Object.prototype); }
function playerRecOf(camp, pid, make) { if (!okPid(pid)) return null; camp.players = camp.players || {}; if (!Object.prototype.hasOwnProperty.call(camp.players, pid)) { if (!make) return null; camp.players[pid] = { name: pid }; } return camp.players[pid]; }
// The character a player plays from now on (host-only record; the old name binding kept in step for older builds and generated campaigns)
function setInPlay(camp, c) { var r = playerRecOf(camp, c.ownerId, true); if (!r) return; r.charId = c.id; r.charName = c.name; delete r.charMade; }
// A renamed character keeps its player's name binding in step, but only when it is the one they play (renaming a kept one re-points nothing)
function nameInStep(camp, c) { var r = c.ownerId ? playerRecOf(camp, c.ownerId, false) : null; if (r && r.charId === c.id) r.charName = c.name; }
function ownsTokenNamed(camp, pid, name) { return Object.values(camp.items || {}).some(function(m) { return m && m.type === 'map' && (m.whiteboard || []).some(function(w) { return w && w.isChar && w.ownerId === pid && w.charName === name; }); }); }
// A character left its player (reassigned, unassigned, made an NPC, deleted, taken by the GM): their record stops naming it, and their old name
// binding goes too once they hold no token of that name (so a stale name never hands them a token the GM took back). Runs AFTER the chooser.
function unbindStale(camp, pid, c) { var r = playerRecOf(camp, pid, false); if (!r) return; if (r.charId === c.id) delete r.charId; unbindName(camp, pid, c.name); }
function unbindName(camp, pid, name) { var r = playerRecOf(camp, pid, false); if (r && r.charName === name && !ownsTokenNamed(camp, pid, name)) { delete r.charName; delete r.charMade; } }
// Onboarding F3: a name its player chose never binds them to a token by name once that character is gone from them (even one they still hold)
function unbindMade(camp, pid, name) { var r = playerRecOf(camp, pid, false); if (r && r.charName === name) { delete r.charName; delete r.charMade; } }
// Where a player's token stood on their current map, so a new one appears beside it
function tokenSpotOf(camp, pid, charId) {
    var n = net(), p = n && n.active && n.role === 'host' ? Object.values(n.roster || {}).find(function(x) { return x && x.id === pid; }) : null;
    var m = p && p.location && camp.items[p.location]; if (!m || m.type !== 'map') return null;
    var w = (m.whiteboard || []).find(function(x) { return x && x.isChar && (charId ? x.charId === charId : x.ownerId === pid); });
    return w ? { x: (w.x || 0) + (w.w || 60) / 2, y: (w.y || 0) + (w.h || 52) / 2 } : null;
}
// EVERY path that gives a character an owner (the Characters tab's owner select and In play, token Properties' Player Owner, linking a
// player's token, a new character from one, the ShadowBase bridge) comes here, and so does taking one away (pid ''). o: { play (default on:
// the newly given character is the one they play, the one they played before is kept), keep (the token that wins) }. GM side only.
function giveCharacter(pid, charId, o) {
    var camp = getActiveCampaign(), c = charById(charId, camp); if (!camp || !c) return false;
    o = o || {}; pid = pid && okPid(pid) ? pid : '';
    var prev = c.ownerId || '', was = pid ? activeCharOf(camp, pid).id : null, wasMade = c.made === 1;
    if (prev !== pid) { delete c.making; delete c.unlocked; delete c.review; delete c.made; }   // Onboarding F3: a new owner gets a finished, locked character of their own (no one else's unfinished one)
    var nearNew = pid && o.nearTok ? spotOnPlayersMap(camp, pid, o.nearTok) : pid && was && was !== c.id ? tokenSpotOf(camp, pid, was) : null, nearPrev = prev && prev !== pid ? tokenSpotOf(camp, prev, c.id) : null;
    c.ownerId = pid; if (pid) c.npc = false;
    if (pid && o.play !== false) setInPlay(camp, c);
    if (pid && o.play !== false) Object.keys(charsOf(camp)).forEach(function(k) { var x = charsOf(camp)[k]; if (x && x.id !== c.id && x.ownerId === pid && x.invited === 1) { delete x.invited; var nI = net(); if (nI && nI.active && nI.role === 'host' && nI.syncChar) nI.syncChar(x.id); } });   // Onboarding F3b: the GM's newer word — one they were asked to make is then kept on Done
    syncOwners(camp, o.keep);
    if (prev && prev !== pid) { unbindStale(camp, prev, c); if (wasMade) unbindMade(camp, prev, c.name); }
    afterCharChange(c, true);
    var n = net();
    if (pid && n && n.allowWaiting) n.allowWaiting(pid);   // Onboarding F1a: a give ends a Remove of their waiting token
    if (n && n.reconcilePresence) {
        if (pid) n.reconcilePresence(pid, { mode: 'give', keep: o.keep, near: nearNew });
        if (prev && prev !== pid) n.reconcilePresence(prev, { mode: 'give', near: nearPrev });
    }
    if (pid && o.pic !== false && !c.portrait && !c.face && n && n.charFacePlan) { var rpF = Object.values(n.roster || {}).find(function(x) { return x && x.id === pid; }); if (rpF) applyCharFace(c.id, n.charFacePlan(rpF.face, rpF.avatar), false); }   // Onboarding F1c: a character with no picture takes a copy of its player's face (the GM can untick it in the Give list)
    if (prev !== pid && n && n.logEvent) n.logEvent('char', c.name + ': ' + (prev ? playerNames(camp)[prev] || 'a player' : 'unassigned') + ' \u2192 ' + (pid ? playerNames(camp)[pid] || 'a player' : 'unassigned'));
    else if (pid && o.play !== false && was && was !== c.id && n && n.logEvent) { var wasC = charById(was, camp); n.logEvent('char', (playerNames(camp)[pid] || 'A player') + ' plays ' + c.name + (wasC ? '; ' + wasC.name + ' is kept' : '')); }   // a switch within one player
    return true;
}
// A token's centre when it stands on the map that player is on now (else nothing: it never places a token on a map they are not on)
function spotOnPlayersMap(camp, pid, w) {
    var n = net(), p = n && n.active && n.role === 'host' ? Object.values(n.roster || {}).find(function(x) { return x && x.id === pid; }) : null;
    var m = p && typeof p.location === 'string' && camp.items[p.location]; if (!m || m.type !== 'map' || (m.whiteboard || []).indexOf(w) < 0) return null;
    return { x: (w.x || 0) + (w.w || 60) / 2, y: (w.y || 0) + (w.h || 52) / 2 };
}
// A character made from (or linked to) a player's token: it comes into play only when they have none in play. When they already play one, the
// new character is kept — its token passes to you — and the toast says so; the character they play is never switched by a Sheet… click on a pet.
function giveTokenChar(camp, w, c) {
    var pid = w.ownerId, playing = activeCharOf(camp, pid).id, play = !playing;
    giveCharacter(pid, c.id, { keep: w.id, play: play, nearTok: w });
    if (!play) { var cur = charById(playing, camp); toast(c.name + ' is kept: ' + (playerNames(camp)[pid] || 'the player') + ' plays ' + (cur ? cur.name : 'another character') + ', so you move its token. Switch with In play in System \u25B8 Characters.'); }
}
function newCharacter(o) {
    var camp = getActiveCampaign(); if (!camp) return null;
    var c = { id: uid('c_'), name: String(o && o.name || 'New character').slice(0, LIMITS.charName), ownerId: '', portrait: o && o.portrait || '', npc: !!(o && o.npc), values: {}, updated: Date.now() };
    charsOf(camp)[c.id] = c;   // born unassigned: an owner is given through giveCharacter
    return c;
}
function afterCharChange(c, whole, values) {
    var camp = getActiveCampaign(); if (!camp) return;
    c.updated = Date.now();
    if (typeof window !== 'undefined' && window.wpFog && window.wpFog.sensesForget) window.wpFog.sensesForget();   // the fog's kept senses are read again from the sheet
    syncOwners(camp);
    save(true);
    var n = net();
    if (n && n.active && n.role === 'host') { if (whole || !values) n.syncChar(c.id); else n.syncCharDelta(c.id, values); }
    if (window.appRender) window.appRender();
    renderViews(c.id);   // HUD frame (HF2a): the sheet and every HUD of this character
}
// [systemcheck:sheetdelete-start]
// Delete on the sheet itself (the owner, 2026-10-04: a player who joined from a second computer had two sheets under one name and the only
// Delete was a small x on a row of the System editor's Characters tab: "both I and the player should be able to just delete these"). The GM
// deletes any sheet; a player asks the host to delete one of their own, and the host judges it (one still being made, or one they do not
// play). Asked first, both ways.
function askDeleteSheet(charId) {
    var camp = getActiveCampaign(), c = charById(charId, camp); if (!c) return;
    var gm = !isClient();
    if (gm ? !canWrite() : !(c.ownerId && c.ownerId === myId() && !c.partial)) return;
    showConfirm('Delete ' + c.name + (c.making === 1 ? ' (still being made)' : '') + '? Its values are gone; tokens keep their name and lose the link.', function(yes) {
        if (!yes) return;
        if (gm) { deleteCharacter(c.id); renderAll(); return; }
        var n = net(); if (!n || !n.charDelete) return;
        var r = n.charDelete(c.id, function(a) { toast(a && a.ok ? 'Deleted.' : (a && a.error) || 'The GM could not do that.'); });
        if (r && r.error) toast(r.error);
    });
}
// The Characters tab's filter: rows whose name holds the letters typed (113 rows in the owner's campaign)
function charFilter() {
    var f = ui('sysCharFilter'), cr = ui('sysCharRows'); if (!cr) return;
    var q = String((f && f.value) || '').trim().toLowerCase();
    Array.prototype.forEach.call(cr.children, function(row) { var nm = row.querySelector ? row.querySelector('.sys-char-name') : null; row.style.display = !q || !nm || String(nm.value || '').toLowerCase().indexOf(q) >= 0 ? '' : 'none'; });
}
// [systemcheck:sheetdelete-end]
function deleteCharacter(id) {
    var camp = getActiveCampaign(), c = charById(id, camp); if (!c) return;
    var prev = c.ownerId || '';
    delete charsOf(camp)[id];
    Object.values(camp.items || {}).forEach(function(m) { if (m && m.type === 'map') (m.whiteboard || []).forEach(function(w) { if (w && w.charId === id) delete w.charId; }); });
    if (prev) { unbindStale(camp, prev, c); if (c.made === 1) unbindMade(camp, prev, c.name); syncOwners(camp); var nD = net(); if (nD && nD.logEvent) nD.logEvent('char', c.name + ' deleted (played by ' + (playerNames(camp)[prev] || 'a player') + '; they keep its tokens)'); }   // their leftover tokens stay theirs (by name); another character of theirs may now be in play
    save(true);
    var n = net(); if (n && n.active && n.role === 'host') n.syncCharGone(id, c.making === 1 ? prev : '');   // Onboarding F3: one in the making was its player's alone
    if (n && n.active && n.role === 'host' && n.sensesMoved) n.sensesMoved(null);   // Senses S0: its tokens now see by the campaign's default
    if (prev && n && n.reconcilePresence) n.reconcilePresence(prev, { mode: 'give' });
    if (sheetOpen === id) closeSheet();
    closeHud(id);
    if (window.appRender) window.appRender();
}
// Link a token to a character (GM): the token adopts the character's owner, or an ownerless character adopts the token's
function linkToken(w, charId) {
    var camp = getActiveCampaign(); if (!camp || !w) return;
    if (!charId) { delete w.charId; save(true); return; }
    var c = charById(charId, camp); if (!c) return;
    w.charId = c.id;
    if (!w.charName) w.charName = c.name;
    if (!c.ownerId && w.ownerId && !c.npc) { giveTokenChar(camp, w, c); return; }
    syncOwners(camp); save(true);
}
function newFromToken(w) {
    var camp = getActiveCampaign(); if (!camp || !w) return null;
    var c = newCharacter({ name: w.charName || w.name || 'Character', portrait: w.src && /^[/]saves[/]images[/]/.test(w.src) ? w.src : '' });
    var frN = window.wpSystemCore && window.wpSystemCore.cleanFrame ? window.wpSystemCore.cleanFrame(w.frame) : null; if (frN && c.portrait && frN.of === c.portrait) c.frame = frN;   // the token creator: the token's kept original goes with its picture
    w.charId = c.id;
    if (w.ownerId) giveTokenChar(camp, w, c); else afterCharChange(c, true);
    return c;
}
function charSelectHtml(w) {
    var camp = getActiveCampaign(); if (!camp) return '';
    var esc = function(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
    var cur = w.charId && charById(w.charId, camp) ? w.charId : '';
    var opts = '<option value=""' + (cur ? '' : ' selected') + '>' + (w.charId && !cur ? '(missing character)' : '&mdash; none &mdash;') + '</option>';
    charList(camp).forEach(function(c) { opts += '<option value="' + esc(c.id) + '"' + (c.id === cur ? ' selected' : '') + '>' + esc(c.name) + (c.npc ? ' (NPC)' : c.ownerId ? ' (' + esc(ownerName(c, camp)) + ')' : '') + '</option>'; });
    opts += '<option value="__new">New character from this token&hellip;</option>';
    return '<div class="field"><label for="wbCharSel">Character (sheet)</label><select id="wbCharSel">' + opts + '</select>' + (cur ? '<button class="tool ghost" id="wbCharOpen" style="width:100%; margin-top:4px;" title="Open this character\'s sheet over the play map">Open sheet</button>' : '') + (cur && hudFor(cur) ? '<button class="tool ghost" id="wbHudOpen" style="width:100%; margin-top:4px;" title="Open this character\'s HUD over the play map">Open HUD</button>' : '') + '</div>';
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
    var hob = ui('wbHudOpen'); if (hob) hob.addEventListener('click', function() { openHud(w.charId); });   // HUD frame (HF2b)
}

/* ---------- hover lines ---------- */
function hoverLinesForToken(w, camp, mapId) {   // mapId: the map the token stands on (the party strip finds it on any map); the viewed map when absent (the map's own hover card)
    if (!w || !w.charId || !featureOn() || !F()) return [];
    camp = camp || getActiveCampaign(); var sys = systemOf(camp), c = charById(w.charId, camp);
    if (!sys || !c) return [];
    if (c.npc && isClient()) return [];
    if (c.partial && Array.isArray(c.lines)) return c.lines.slice();   // 5h: a teammate's copy shows the host's lines (it lacks the fields their formulas read)
    try { var midH = typeof mapId === 'string' && camp.items && Object.prototype.hasOwnProperty.call(camp.items, mapId) ? mapId : camp.activeItemId, amH = camp.items && camp.items[midH]; return hoverLines(sys, c, F(), withRange(withRound(tokenCtx(amH, w, tokenFlags()), combatOn(midH)), rangeFor(c, midH, amH, w, camp))); } catch (e) { return []; }   // 5h Fold 3 / Stage 6: this token's own facing and stance; HF5b: the combat on its map (HF5 review: the map it stands on, as its sheet reads it)
}
// [sinkcheck:tokenfxlist-start]
// Conditions C1 (docs/CONDITIONS_PLAN.md): the effects a character token shows on this screen — the GM's worked out from its character, a
// GM-only one marked; a player's (and the GM's campaign on a player's screen) as the host sent them on the token (fxb); none while
// character sheets are off
function tokenFx(w) {
    if (!w || !w.isChar || (window.wpVtt && !window.wpVtt.on('sheets'))) return [];
    var n = window.wpNet; if (n && (n.foreign || (n.active && n.role === 'client'))) return Array.isArray(w.fxb) ? w.fxb : [];
    var S = window.wpSystemCore, camp = getActiveCampaign(), sys = systemOf(camp), c = charById(w.charId, camp); if (!S || !sys) return [];
    if (c) return S.tokenEffects ? S.tokenEffects(sys, c, true, F()) : [];   // conditions C4: its automatic effects too
    return Array.isArray(w.fx) && S.tokenOwnEffects ? S.tokenOwnEffects(sys, w.fx, true) : [];   // C2: a token with no sheet, its own
}
// Conditions C2: what a token's Effects menu offers on this screen, or null — { char: the character's id ('' for a token with no sheet),
// field: its effects list's id, rows: [{ ref, rowId, name, icon, tone, gm, on }] } — each effect of the system's library (rowId: the row
// that applies it, on: applied and switched on), then those made on the spot that it carries. The GM: a character token whose sheet has an
// effects list, or a token with no sheet (its own effects); a player: their own character's token, where its sheet lets them change them
function tokenFxModel(w) {
    if (!w || !w.isChar || w.waiting || (window.wpVtt && !window.wpVtt.on('sheets'))) return null;
    var camp = getActiveCampaign(), sys = systemOf(camp); if (!sys) return null;
    var gm = !isClient() && canWrite(), c = charById(w.charId, camp), f = null, rows, out = [];
    if (c) {
        f = (Array.isArray(sys.fields) ? sys.fields : []).find(function(x) { return x && x.kind === 'effects' && typeof x.id === 'string'; }) || null; if (!f || c.partial) return null;
        var mine = !!myId() && c.ownerId === myId();
        if (!(gm || (mine && f.vis === 'all' && (f.edit === 'owner' || c.making === 1 || c.unlocked === 1)))) return null;
        rows = c.values && Array.isArray(c.values[f.id]) ? c.values[f.id] : [];
    } else {
        if (!gm) return null;
        var FC = window.wpFogCore; rows = (FC && FC.cleanTokFx ? FC.cleanTokFx(w.fx) : null) || [];
    }
    var autoOn = {}; if (c) autoEffectsOn(sys, c, F()).forEach(function(d) { autoOn[d.id] = 1; });   // conditions C4: an automatic effect on shows ticked and tagged, and never ends from here
    (Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) {
        if (!d || typeof d.id !== 'string') return;
        var r = rows.find(function(x) { return x && x.ref === d.id && typeof x.id === 'string'; }), au = autoOn[d.id] === 1;
        var row = { ref: d.id, rowId: r ? r.id : '', name: d.name || 'Effect', icon: d.icon || '', tone: d.tone || '', gm: d.vis === 'gm', on: (!!r && r.on !== false) || au }; if (au) row.auto = true;
        out.push(row);
    });
    rows.forEach(function(r) { if (r && typeof r.id === 'string' && typeof r.ref !== 'string') out.push({ ref: '', rowId: r.id, name: r.name || 'Effect', icon: r.icon || '', tone: r.tone || '', gm: false, on: r.on !== false }); });
    return { char: c ? c.id : '', field: f ? f.id : '', rows: out };
}
function tokenFxCharOp(charId, fieldId, q) {   // a character token's menu: the sheet's own path (the GM's edit, or the host asked)
    var camp = getActiveCampaign(), sys = systemOf(camp), c = charById(charId, camp), f = sys && Array.isArray(sys.fields) ? sys.fields.find(function(x) { return x && x.id === fieldId && x.kind === 'effects'; }) : null;
    if (!c || !f || !q) return;
    if (q.op === 'add' && typeof q.ref === 'string') commitEffect(c, f, { op: 'add', rowId: uid('x_'), ref: q.ref });
    else if (q.op === 'remove' && typeof q.rowId === 'string') commitEffect(c, f, { op: 'remove', rowId: q.rowId });
}
// [sinkcheck:tokenfxlist-end]
function hoverLinesForTokenId(camp, tokId) {
    if (!camp || !tokId) return [];
    var w = null, onMap = null; Object.keys(camp.items || {}).some(function(id) { var m = camp.items[id]; if (!m || m.type !== 'map') return false; w = (m.whiteboard || []).find(function(x) { return x && x.id === tokId; }) || null; if (w) onMap = id; return !!w; });
    return w ? hoverLinesForToken(w, camp, onMap) : [];
}

/* ---------- the facing dial (Stage 5h Fold 3): a view of the token's own facing, with threat marks formulas read as Arc / Threats ---------- */
var SVGNS = 'http://www.w3.org/2000/svg', _dialSig = '', _dialStale = false, _dialRedraw = null, _dialOn = null, _roundSig = '', _rangeSig = '';   // HF5b: _roundSig, the sheet's combat round; range R2: _rangeSig, its range to the target
function turningOn() { return window.wpVtt ? !!window.wpVtt.on('turning') : true; }
function vttOn(which) { return window.wpVtt ? !!window.wpVtt.on(which) : true; }
function ruleOn(which) { var v = window.wpVtt; return !v || (v.rulesOn ? v.rulesOn(which) : v.on(which)); }   // Stage 6: the table's setting (a player's "off for me" only hides a control)
function tokenFlags() { return { turning: ruleOn('turning'), posture: ruleOn('posture'), elevation: ruleOn('elevation') }; }   // Stage 6: the features the token names read through — the same gate as the host's rolls
function stanceSigOf(c, camp) {   // what the stance control shows: its rows, the token, its values, who may use it
    var fl = tokenFlags(), t = c ? facingTarget(c, camp) : null, st = t ? stanceCtx(t.tok, fl) : null, n = net();
    return [vttOn('posture'), vttOn('elevation'), t ? t.mapId + '|' + t.tok.id + '|' + (t.tok.ownerId || '') + '|' + (t.tok.locked ? 1 : 0) : '', st ? st.posture + '|' + (st.pid || '') + '|' + st.elevation : '', !!(n && (n.paused || n.selfPaused))].join('#');   // conditions C3: the posture as stored (a posture of the system's own list)
}
function mapOk(m) { return !!(m && m.type === 'map' && Array.isArray(m.whiteboard)); }
// Which token the dial (and every facing name on the sheet and in rolls) reads:
// - a player: their own shown token on the map they are on — the token the host reads for their rolls;
// - the GM: the selected token when it is this character's (a hidden one only for an NPC: a player's rolls never read a token they cannot
//   see); else, for a player's character while they are connected, their own token on the map they are on, as their rolls read it (none
//   when they are on no map); else the character's token on the GM's map (an NPC's hidden one too)
function facingTarget(c, camp) {
    camp = camp || getActiveCampaign(); if (!camp || !c || !camp.items) return null;
    var items = camp.items, amId = camp.activeItemId, am = amId && Object.prototype.hasOwnProperty.call(items, amId) ? items[amId] : null, pc = !!(c.ownerId && !c.npc);
    var hit = function(mapId, m, t) { return t ? { mapId: mapId, map: m, tok: t } : null; };
    if (isClient()) return mapOk(am) ? hit(amId, am, charTokenOn(am, c.id, myId(), { strict: true })) : null;
    if (mapOk(am) && state.selWbId) { var sel = am.whiteboard.find(function(w) { return w && w.id === state.selWbId; }); if (sel && sel.isChar && sel.charId === c.id && (!sel.hidden || !pc)) return hit(amId, am, sel); }
    var n = net(), inSession = false, loc = null;
    if (pc && n && n.active && n.role === 'host' && n.roster) Object.keys(n.roster).forEach(function(k) { var r = n.roster[k]; if (r && r.id === c.ownerId) { inSession = true; if (typeof r.location === 'string') loc = r.location; } });
    if (inSession) return (loc && Object.prototype.hasOwnProperty.call(items, loc) && mapOk(items[loc])) ? hit(loc, items[loc], charTokenOn(items[loc], c.id, c.ownerId, { strict: true })) : null;
    return mapOk(am) ? hit(amId, am, charTokenOn(am, c.id, c.ownerId, { hidden: !pc })) : null;
}
function combatOn(mapId) { var n = net(); return n && n.combatFor && typeof mapId === 'string' ? n.combatFor(mapId) : null; }   // HUD frame (HF5b): the combat on a map, while a table is up (null offline)
// Range penalties R2 (docs/RANGE_PLAN.md 3): what RangeMod and TargetDistance read for a character's token, worked out on this screen from
// its own copy — to its player's pointer (a player's character, whoever looks at the sheet) or the GM's own (an NPC, a character with no
// player), while a table is up: a character token on the same map, never the token itself; for a player's character never one the GM hid,
// and on the GM's screen never one that player's sight drops on a fogged map (the host judges their rolls the same, net.js rangeTo). null:
// the names read 0
// [sinkcheck:rangefor-start]
function rangeFor(c, mapId, map, tok, camp) {
    var n = net(); if (!c || !tok || !map || !n || !n.active || !n.targets || typeof mapId !== 'string') return null;
    var pc = !!(c.ownerId && !c.npc), pid = isClient() ? myId() : pc ? c.ownerId : myId();
    var tg = typeof pid === 'string' && Object.prototype.hasOwnProperty.call(n.targets, pid) ? n.targets[pid] : null;
    if (!tg || typeof tg !== 'object' || tg.mapId !== mapId || typeof tg.id !== 'string') return null;
    var w = Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return !!x && x.id === tg.id; }) : null;
    if (!w || !w.isChar || w === tok || (w.hidden && pc)) return null;
    if (pc && !isClient() && window.wpFog && typeof window.wpFog.fogDropIds === 'function') { var drop = window.wpFog.fogDropIds(c.ownerId, camp, map); if (drop && drop[w.id]) return null; }
    var gOf = function(t) { var St = window.wpStance; return St && St.tokenGround ? St.tokenGround(t, map, pc) : 0; };   // item 19b H5: each on the ground it stands on; a player's character as its player's copy reads it (never a piece the GM hid)
    var rc = rangeCtx(systemOf(camp), map, tok, w, { F: F(), elev: !!tokenFlags().elevation, groundOf: gOf }); if (rc) { rc.tid = w.id; rc.mapId = mapId; }   // R3: which target, for the GM's privacy check
    return rc;
}
// [sinkcheck:rangefor-end]
function tokenCtxFor(charId, camp) { var c = charById(charId, camp), t = c ? facingTarget(c, camp) : null; return t ? withRange(withRound(tokenCtx(t.map, t.tok, tokenFlags()), combatOn(t.mapId)), rangeFor(c, t.mapId, t.map, t.tok, camp)) : null; }   // Stage 6: { facing, stance } of the token the sheet reads; HF5b: and the round of the combat on its map
function rangeSigOf(c, camp) { var t = c ? facingTarget(c, camp) : null, r = t ? rangeFor(c, t.mapId, t.map, t.tok, camp) : null; return r ? r.mod + '|' + r.dist + '|' + (r.hmod || 0) + '|' + (r.hdiff || 0) : ''; }   // range R2: what RangeMod and TargetDistance read for this character, so a new target or a move redraws the view (item 19 H2: HeightMod and HeightDiff too)
function roundSigOf(c, camp) { var t = c ? facingTarget(c, camp) : null, cb = t ? combatOn(t.mapId) : null; return cb && typeof cb.round === 'number' ? String(cb.round) : ''; }   // HF5b: what CombatRound reads for this character, so a round change redraws the view
function dialSigOf(c, camp) {
    var fl = tokenFlags(), t = c ? facingTarget(c, camp) : null, fc = t ? facingCtx(t.map, t.tok, fl.turning) : null, st = t ? stanceCtx(t.tok, fl) : null, n = net();
    return [JSON.stringify(fl), t ? t.mapId + '|' + t.tok.id + '|' + (t.tok.ownerId || '') + '|' + (t.tok.locked ? 1 : 0) : '', fc ? fc.deg + '|' + fc.sides + '|' + fc.threats.join(',') : '', st ? st.posture + '|' + st.elevation : '', !!(n && (n.paused || n.selfPaused))].join('#');
}
function namesFacing(sys) {   // does a formula on the sheet (or a {formula} in a caption) name a built-in facing name, so a finished turn redraws its numbers?
    var Fm = F(); if (!sys || !Array.isArray(sys.fields) || !Fm || !Fm.names) return false;
    var own = {}; sys.fields.forEach(function(f) { own[String(f.key).toLowerCase()] = 1; });
    var hit = function(text) {
        if (typeof text !== 'string' || !text) return false;
        var ns = []; try { ns = Fm.names(text) || []; } catch (e) {}
        return ns.some(function(nm) { var fam = String(nm).toLowerCase().split('.')[0]; return (fam === 'facing' || fam === 'arc' || fam === 'threats' || fam === 'posture' || fam === 'elevation' || fam === 'combatround' || fam === 'rangemod' || fam === 'targetdistance' || fam === 'heightmod' || fam === 'heightdiff') && own[fam] !== 1; });   // a field of that name keeps it (Stage 6: the stance names too; HF5b: CombatRound)
    };
    return sys.fields.some(function(f) {
        if (hit(f.formula) || hit(f.maxFormula) || hit(f.base)) return true;
        var re = /\{([^{}]{1,300})\}/g, m, cap = typeof f.caption === 'string' ? f.caption : '';
        while ((m = re.exec(cap))) if (hit(capExpr(m[1]).expr)) return true;   // Stage 6: a {\u00b1\u2026} too
        return false;
    }) || (Array.isArray(sys.rolls) && sys.rolls.some(function(r) {   // HUD frame (HF5a): a roll's label that shows such a value
        var lre = /\{([^{}]{1,300})\}/g, lm, lb = r && typeof r.label === 'string' ? r.label : '';
        while ((lm = lre.exec(lb))) if (hit(capExpr(lm[1]).expr)) return true;
        return false;
    }));
}
// A finished turn redraws the numbers that read facing — never under someone's typing (a redraw commits a half-typed value): while a box
// on the sheet has focus, the redraw waits for it to lose focus
function redrawForFacing(v) {   // v: a HUD's record (HUD frame HF2a), each with its own timer; none: the sheet
    clearTimeout(v ? v.redraw : _dialRedraw);
    var tmr = setTimeout(function() {
        if (v) v.redraw = null; else _dialRedraw = null;
        var body = v ? v.body : ui('sheetBody'), ae = document.activeElement;
        var inStance = ae && ae.closest && ae.closest('.sheet-stance'), committed = inStance && (ae.tagName === 'SELECT' || ae.value === ae.getAttribute('data-cur'));   // the stance control's own value is already on the token
        if (body && ae && body.contains(ae) && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && !committed) { ae.addEventListener('blur', function() { setTimeout(function() { redrawForFacing(v); }, 0); }, { once: true }); return; }
        if (v) { if (huds[v.charId] === v) renderHud(v.charId); } else renderSheet();
    }, 150);
    if (v) v.redraw = tmr; else _dialRedraw = tmr;
}
function facingNode(c, gm) {
    var wrap = el('div', 'sheet-dial'), on = turningOn();
    if (!on) { if (!gm) { wrap.hidden = true; return wrap; } wrap.appendChild(el('div', 'sheet-dial-note', 'Token facing is off (Settings \u25b8 VTT features).')); return wrap; }
    var t = facingTarget(c, getActiveCampaign()), fc = t ? facingCtx(t.map, t.tok, true) : null;
    if (!fc) { wrap.appendChild(el('div', 'sheet-dial-note', t ? 'This token\u2019s facing cannot be read.' : 'No token on this map.')); return wrap; }
    var n = net(), live = _fxLive && (gm || (t.tok.ownerId === myId() && !t.tok.locked && !(n && (n.paused || n.selfPaused))));   // a token the GM locked is frozen for its player
    if (live) wrap.classList.add('sheet-dial-live');
    var N = fc.sides, step = 360 / N, half = step / 2, C0 = 66, ARC = ['front', 'side', 'rear'];
    var xy = function(deg, r) { var a = deg * Math.PI / 180; return [(C0 + r * Math.sin(a)).toFixed(2), (C0 - r * Math.cos(a)).toFixed(2)]; }, pt = function(deg, r) { return xy(deg, r).join(' '); };
    var segOf = function(b) { return sideOf(b, N); };
    var faceSide = segOf(fc.deg), th = fc.threats, active = th.length ? segOf(th[0]) : -1, marked = {}; th.forEach(function(b) { marked[segOf(b)] = 1; });
    var mk = function(tag, attrs, cls) { var e = document.createElementNS(SVGNS, tag); Object.keys(attrs).forEach(function(k) { e.setAttribute(k, attrs[k]); }); if (cls) e.setAttribute('class', cls); return e; };
    var tip = function(node, text) { var tt = mk('title', {}); tt.textContent = text; node.appendChild(tt); };
    var svg = mk('svg', { viewBox: '0 0 132 132', role: 'group' }, 'sheet-dial-svg');
    for (var i = 0; i < N; i++) (function(i) {
        var b = i * step, a = threatArc(fc, b);
        // the outer ring: where a threat comes from, coloured by the arc it falls in against the token's facing
        var seg = mk('path', { d: 'M ' + pt(b - half + 3, 60) + ' A 60 60 0 0 1 ' + pt(b + half - 3, 60) + ' L ' + pt(b + half - 3, 44) + ' A 44 44 0 0 0 ' + pt(b - half + 3, 44) + ' Z', 'data-dk': 'seg' + i },
            'sheet-dial-seg sheet-arc-' + ARC[a] + (marked[i] ? ' sheet-dial-threat' : '') + (i === active ? ' sheet-dial-active' : ''));
        var what = (i === active ? 'Active threat' : marked[i] ? 'Queued threat' : 'No threat') + ' from side ' + (i + 1) + ' (' + ARC[a] + ')';
        tip(seg, what);
        if (live) {
            seg.setAttribute('tabindex', '0'); seg.setAttribute('role', 'button'); seg.setAttribute('aria-label', what + (i === active ? ': clear it' : marked[i] ? ': make it the active threat' : ': mark a threat here'));
            var cyc = function() { if (window.wpSetTokenThreats) window.wpSetTokenThreats(t.mapId, t.tok.id, cycleThreat(th, b, N)); };
            seg.addEventListener('click', cyc);
            seg.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cyc(); } });
        }
        svg.appendChild(seg);
        if (i === active) svg.appendChild(mk('path', { d: 'M ' + pt(b, 47) + ' L ' + pt(b - 7, 57) + ' L ' + pt(b + 7, 57) + ' Z' }, 'sheet-dial-arrow'));   // points in at the token
        // the inner shape: one wedge per side, the one the token faces filled
        var wedge = mk('path', { d: 'M ' + C0 + ' ' + C0 + ' L ' + pt(b - half, 36) + ' L ' + pt(b + half, 36) + ' Z' }, 'sheet-dial-side' + (i === faceSide ? ' sheet-dial-facing' : ''));
        tip(wedge, (i === faceSide ? 'Facing side ' : 'Turn to side ') + (i + 1));
        if (live) wedge.addEventListener('click', function() { if (window.wpSetTokenFacing) window.wpSetTokenFacing(t.mapId, t.tok.id, b); });
        svg.appendChild(wedge);
        var lp = xy(b, 24), lb = mk('text', { x: lp[0], y: lp[1], 'text-anchor': 'middle', 'dominant-baseline': 'central' }, 'sheet-dial-num' + (i === faceSide ? ' sheet-dial-num-on' : '')); lb.textContent = String(i + 1); svg.appendChild(lb);
    })(i);
    var np = xy(fc.deg, 40); svg.appendChild(mk('line', { x1: C0, y1: C0, x2: np[0], y2: np[1] }, 'sheet-dial-needle'));   // the exact facing (a free-angle token sits between sides)
    if (live) {
        svg.setAttribute('tabindex', '0'); svg.setAttribute('data-dk', 'dial'); svg.setAttribute('aria-label', 'Facing side ' + (faceSide + 1) + ' of ' + N + '. Left and right arrow keys turn it.');
        svg.addEventListener('keydown', function(e) { if (e.target !== svg) return; var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return; e.preventDefault(); if (window.wpSetTokenFacing) window.wpSetTokenFacing(t.mapId, t.tok.id, (faceSide + d) * step); });
    } else svg.setAttribute('aria-label', 'Facing side ' + (faceSide + 1) + ' of ' + N);
    var info = el('div', 'sheet-dial-info'), a0 = th.length ? threatArc(fc, th[0]) : -1;
    info.appendChild(el('span', 'sheet-dial-state', 'Facing ' + (faceSide + 1) + (th.length ? ' \u00b7 threat from the ' + ARC[a0] + (th.length > 1 ? ' (+' + (th.length - 1) + ' queued)' : '') : ' \u00b7 no threat marked')));
    var mt = t.map.meta && typeof t.map.meta.title === 'string' ? t.map.meta.title.slice(0, 60) : ''; if (mt) info.appendChild(el('span', 'sheet-dial-map', 'on ' + mt));
    if (!gm && t.tok.locked) info.appendChild(el('span', 'sheet-dial-map', '\uD83D\uDD12 Locked by the GM'));
    if (live) {
        var btns = el('div', 'sheet-dial-btns');
        var tf = el('button', 'tool ghost sys-btn', 'Turn to face'); tf.title = 'Turn toward the active threat'; tf.dataset.dk = 'face'; tf.disabled = !th.length || Math.abs(((th[0] - fc.deg) % 360 + 540) % 360 - 180) < 0.5;   // already facing it exactly (a free-angle token between sides may still turn to it)
        tf.addEventListener('click', function() { if (th.length && window.wpSetTokenFacing) window.wpSetTokenFacing(t.mapId, t.tok.id, th[0]); });
        var cl = el('button', 'tool ghost sys-btn', 'Clear threats'); cl.dataset.dk = 'clear'; cl.disabled = !th.length;
        cl.addEventListener('click', function() { if (window.wpSetTokenThreats) window.wpSetTokenThreats(t.mapId, t.tok.id, []); });
        btns.appendChild(tf); btns.appendChild(cl); info.appendChild(btns);
    }
    wrap.appendChild(svg); wrap.appendChild(info);
    return wrap;
}
// Stage 6: the token's posture and elevation on the sheet — the same values as the token's chip and menu, set from either (a player: their own
// token, not paused; each part only while its VTT feature is on). With both features off a player sees nothing and the GM a note.
function stanceNode(c, gm) {
    var wrap = el('div', 'sheet-stance'), pOn = vttOn('posture'), eOn = vttOn('elevation'); wrap.dataset.sig = stanceSigOf(c, getActiveCampaign());
    if (!pOn && !eOn) { if (!gm) { wrap.hidden = true; return wrap; } wrap.appendChild(el('div', 'sheet-dial-note', 'Token posture and elevation are off (Settings \u25b8 VTT features).')); return wrap; }
    var t = facingTarget(c, getActiveCampaign()), st = t ? stanceCtx(t.tok, tokenFlags()) : null;   // the values are the table's (a hidden row is only a display choice)
    if (!st) { wrap.appendChild(el('div', 'sheet-dial-note', 'No token on this map.')); return wrap; }
    var n = net(), live = _fxLive && (gm || (t.tok.ownerId === myId() && !t.tok.locked && !(n && (n.paused || n.selfPaused))));   // a token the GM locked is frozen for its player
    var setSt = function(v) { if (window.wpSetTokenStance) window.wpSetTokenStance(t.mapId, t.tok.id, v); };
    if (pOn) {
        var pr = el('label', 'sheet-stance-row'); pr.appendChild(el('span', 'sheet-label', 'Posture'));
        var ps = el('select', 'field sheet-select'); ps.dataset.dk = 'posture';
        var sysS = systemOf(), atS = postureAt(sysS, st.pid);   // conditions C3: the postures in use (the system's own list, else the seven)
        postureList(sysS).forEach(function(p, i) { ps.appendChild(opt(p.id, p.name, atS.i === i)); });
        ps.disabled = !live; ps.addEventListener('change', function() { setSt({ posture: ps.value }); });
        pr.appendChild(ps); wrap.appendChild(pr);
        var pw = postureWords(sysS, atS); if (pw) wrap.appendChild(el('div', 'sheet-dial-note sheet-stance-fx', pw));
    }
    if (eOn) {
        var er = el('div', 'sheet-stance-row'); er.appendChild(el('span', 'sheet-label', 'Elevation'));
        var em = el('button', 'tool ghost sheet-pm', '\u2212'); em.dataset.dk = 'elevm'; em.title = 'Down one yard'; em.disabled = !live;
        var ei = el('input', 'field sheet-num sheet-cur num-stepped'); ei.type = 'number'; ei.step = '1'; ei.value = String(st.elevation); ei.dataset.dk = 'elev'; ei.dataset.cur = String(st.elevation); ei.disabled = !live; ei.title = 'Height above the ground, in yards';
        var ep = el('button', 'tool ghost sheet-pm', '+'); ep.dataset.dk = 'elevp'; ep.title = 'Up one yard'; ep.disabled = !live;
        var stepBy = function(d) { var cur = ei.value !== '' && isFinite(Number(ei.value)) ? Number(ei.value) : st.elevation; setSt({ elevation: cur + d }); };   // from what the box shows (a typed 2.5 then + is 3.5)
        [em, ep].forEach(function(b) { b.addEventListener('mousedown', function(ev) { ev.preventDefault(); }); });   // the box keeps focus: no blur commit racing the click
        em.addEventListener('click', function() { stepBy(-1); });
        ep.addEventListener('click', function() { stepBy(1); });
        ei.addEventListener('change', function() { if (isFinite(Number(ei.value))) setSt({ elevation: Number(ei.value) }); });
        er.appendChild(em); er.appendChild(ei); er.appendChild(ep); er.appendChild(el('span', 'sheet-unit', 'yd')); wrap.appendChild(er);
    }
    var mt = t.map.meta && typeof t.map.meta.title === 'string' ? t.map.meta.title.slice(0, 60) : ''; if (mt) wrap.appendChild(el('span', 'sheet-dial-map', 'on ' + mt));
    if (!gm && t.tok.locked) wrap.appendChild(el('span', 'sheet-dial-map', '\uD83D\uDD12 Locked by the GM'));
    return wrap;
}
// [sinkcheck:posturewords-start]
// Conditions C3: what the token's posture does, under the stance control as the Foundry sheet shows a posture's effect — its changes, a smaller
// target's -2 (in the website's words), its notes; nothing for the first posture. Text only (a text node)
function postureWords(sys, at) {
    if (!at || !(at.i > 0) || !at.p || typeof at.p !== 'object') return '';
    var labels = {}; ((sys && Array.isArray(sys.fields)) ? sys.fields : []).forEach(function(x) { if (x && typeof x.id === 'string') labels[x.id] = x.label || x.key; });
    var out = (Array.isArray(at.p.mods) ? at.p.mods : []).map(function(m) { return fxChangeText(m, labels); });
    if (at.p.small === true) out.push('Ranged attacks against you are at \u22122 (their roll, not yours)');
    if (typeof at.p.notes === 'string' && at.p.notes) out.push(at.p.notes);
    return out.join(' \u00b7 ');
}
// [sinkcheck:posturewords-end]
// whiteboard.js / net.js / main.js: a token turned or its threat marks changed. The dial follows in place (focus kept); a sheet whose
// numbers read a facing name redraws once the turn is final, debounced (a drag's stream never redraws a sheet someone is typing in)
// The dial and stance controls in one panel (the sheet's or a HUD's) follow the token in place, keeping focus
function swapTokenControls(p, c, camp) {
    var gm = !isClient();
    Array.prototype.forEach.call(p.querySelectorAll('.sheet-dial, .sheet-stance'), function(d) {
        var ae = document.activeElement, fk = ae && d.contains(ae) && ae.getAttribute ? ae.getAttribute('data-dk') : null;
        if (d.classList.contains('sheet-stance')) {   // its own signature: a turn of the token never rebuilds it, and a half-typed elevation is never replaced
            if (d.dataset.sig === stanceSigOf(c, camp)) return;
            var fe = d.querySelector('[data-dk="elev"]'); if (fe && ae === fe && fe.value !== fe.getAttribute('data-cur')) return;
        }
        var nd = d.classList.contains('sheet-stance') ? stanceNode(c, gm) : facingNode(c, gm); if (d.classList.contains('sheet-row')) nd.classList.add('sheet-row');
        d.replaceWith(nd);
        if (fk && /^[a-z0-9]{1,8}$/.test(fk)) { var q = nd.querySelector('[data-dk="' + fk + '"]'); if (q && q.disabled) q = nd.querySelector('[data-dk="dial"]'); if (q) { try { q.focus({ preventScroll: true }); } catch (e) {} } }   // a button now disabled hands focus to the dial
    });
}
function tokenTurned(tokId, final) {
    try { Object.keys(huds).forEach(function(id) { turnView(huds[id], final); }); } catch (e) {}   // HUD frame (HF2a): every HUD, whether or not a sheet is open
    try {
        if (!sheetOpen) return;
        var p = ui('sheetPanel'); if (!p || p.style.display === 'none') return;
        var camp = getActiveCampaign(), c = charById(sheetOpen, camp); if (!c) return;
        var sig = dialSigOf(c, camp), on = JSON.stringify(tokenFlags());
        if (sig !== _dialSig) {
            _dialSig = sig; _dialStale = true;
            if (_dialOn !== null && on !== _dialOn) { _dialOn = on; _dialStale = false; redrawForFacing(); return; }   // a token feature switched on or off: the whole sheet (a player's dial or stance control comes and goes with it)
            swapTokenControls(p, c, camp);
        }
        var rsS = roundSigOf(c, camp); if (rsS !== _roundSig) { _roundSig = rsS; _dialStale = true; }
        var rgS = typeof rangeSigOf === 'function' ? rangeSigOf(c, camp) : ''; if (rgS !== _rangeSig) { _rangeSig = rgS; _dialStale = true; }   // range R2: a new target or a move redraws what reads RangeMod or TargetDistance   // HUD frame (HF5b): a round change (Next turn) redraws what reads CombatRound
        if (final && _dialStale) { _dialStale = false; if (namesFacing(systemOf(camp))) redrawForFacing(); }
    } catch (e) {}   // it runs at the end of every render: a sheet problem never stops the map
    try { syncEndTurn(); } catch (e) {}   // turn-based combat T2
}
// Turn-based combat T2: End turn in the head of the sheet and of each HUD — shown to the player whose character's token has the turn
function syncEndTurn() {
    var n = net(), t = n && n.myTurnTok ? n.myTurnTok() : null, who = t && typeof t.tok.charId === 'string' ? t.tok.charId : '';
    var sb = ui('sheetEndTurn'); if (sb) sb.style.display = who && sheetOpen === who ? '' : 'none';
    Object.keys(huds).forEach(function(id) { var b = huds[id].panel.querySelector('.hud-endturn'); if (b) b.style.display = who && id === who ? '' : 'none'; });
}
function endTurn() { var n = net(), r = n && n.turnEnd ? n.turnEnd() : { error: 'Not at a table.' }; if (r && r.error) toast(r.error); }

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
    if (sheetOpen !== charId) { closeDownloadMenu(); _sheetEdit = null; }   // Onboarding F2a: its menu names the character it was opened for; another character's sheet opens locked
    sheetOpen = charId;
    var p = ui('sheetPanel'); if (!p) return;
    p.style.display = 'flex'; if (window.wpFloats) window.wpFloats.reveal(p);   // 1.5.4 (floats.js): asked for here, so it shows on this view
    placeSheet(); raisePanel(p); renderSheet();
}
function closeSheet() { closeDownloadMenu(); sheetOpen = null; _sheetEdit = null; var p = ui('sheetPanel'); if (p) p.style.display = 'none'; }
function placeSheet() { var p = ui('sheetPanel'); if (!p) return; try { var pos = JSON.parse(pref('wp_sheetPanel', 'null')); if (pos && isFinite(pos.x) && isFinite(pos.y)) { p.style.left = Math.max(0, Math.min(window.innerWidth - 160, pos.x)) + 'px'; p.style.top = Math.max(0, Math.min(window.innerHeight - 80, pos.y)) + 'px'; p.style.right = 'auto'; } if (pos && isFinite(pos.w) && isFinite(pos.h)) sizePanel(p, pos.w, pos.h); } catch (e) {} }
// Fold B: the panel's own size (its corner grip), clamped to the window; the saved record keeps the position and the size together
function sizePanel(p, w, h) { var r = p.getBoundingClientRect(); w = Math.max(360, Math.min(window.innerWidth - Math.max(0, r.left) - 8, Math.round(w))); h = Math.max(240, Math.min(window.innerHeight - Math.max(0, r.top) - 8, Math.round(h))); p.style.width = w + 'px'; p.style.height = h + 'px'; p.classList.add('sheet-sized'); }   // clamped to the room left of/below where the panel is, so the grip and the last rows stay on screen
function panelPref() { try { var o = JSON.parse(pref('wp_sheetPanel', 'null')); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; } catch (e) { return {}; } }
function focusKeyOf(root) { var ae = document.activeElement; if (!ae || !root.contains(ae)) return null; if (ae.dataset && typeof ae.dataset.pin === 'string' && PIN_GID.test(ae.dataset.pin)) return { pin: ae.dataset.pin, where: ae.closest('.sheet-band') ? 'band' : ae.closest('.sheet-sec-title') ? 'head' : 'sec' }; if (ae.dataset && typeof ae.dataset.reset === 'string' && /^s_[A-Za-z0-9_]{1,24}$/.test(ae.dataset.reset)) return { reset: ae.dataset.reset }; var dk = ae.closest && ae.closest('.sheet-dial, .sheet-stance') && ae.getAttribute ? ae.getAttribute('data-dk') : null; if (dk && /^[a-z0-9]{1,8}$/.test(dk)) return { dk: dk }; if (!ae.dataset || !ae.dataset.fid) return null; var k = { fid: ae.dataset.fid, part: ae.dataset.part || '', band: !!ae.dataset.band }; try { k.sel = [ae.selectionStart, ae.selectionEnd]; } catch (e) {} return k; }   // band: the pinned band's copy of a field, told from the section's (Stage 5c)
function restoreFocus(root, k) { if (!k) return; if (k.reset) { if (!/^s_[A-Za-z0-9_]{1,24}$/.test(k.reset)) return; var qx = root.querySelector('.sheet-sec-title [data-reset="' + k.reset + '"]'); if (qx) { try { qx.focus({ preventScroll: true }); } catch (e) {} } return; } if (k.pin) { if (!PIN_GID.test(k.pin)) return; var ps = '[data-pin="' + k.pin + '"]', pp = k.where === 'band' ? '.sheet-band ' : k.where === 'head' ? '.sheet-sec-title ' : '.sheet-section .sheet-field ', qp = root.querySelector(pp + ps) || root.querySelector(ps); if (qp) { try { qp.focus({ preventScroll: true }); } catch (e) {} } return; } if (k.dk) { var qd = root.querySelector('.sheet-dial [data-dk="' + k.dk + '"], .sheet-stance [data-dk="' + k.dk + '"]'); if (qd && qd.disabled) qd = root.querySelector('.sheet-dial [data-dk="dial"]'); if (qd) { try { qd.focus({ preventScroll: true }); } catch (e) {} } return; } var q = root.querySelector('[data-fid="' + k.fid + '"]' + (k.part ? '[data-part="' + k.part + '"]' : ':not([data-part])') + (k.band ? '[data-band]' : ':not([data-band])')); if (q && q.disabled && k.part) q = root.querySelector('[data-fid="' + k.fid + '"]:not([data-part])' + (k.band ? '[data-band]' : ':not([data-band])')); if (q) { try { q.focus({ preventScroll: true }); if (k.sel && k.sel[0] != null && q.setSelectionRange) q.setSelectionRange(k.sel[0], k.sel[1]); } catch (e) {} } }
function renderSheet() {
    var p = ui('sheetPanel'); if (!p || p.style.display === 'none') return;
    var camp = getActiveCampaign(), sys = systemOf(camp), c = charById(sheetOpen, camp);
    var body = ui('sheetBody'), head = ui('sheetTitle'), sub = ui('sheetSub'), fk = focusKeyOf(body), st0 = body ? body.scrollTop : 0;
    if (!c || !sys || !F()) { closeSheet(); return; }
    var gm = !isClient(), own = !!(c.ownerId && c.ownerId === myId()), lockedS = viewLocked(c, { view: 'sheet' });   // the sheet's lock, as buildSections will read it
    head.textContent = c.name;
    sub.textContent = (c.npc ? 'NPC' : c.ownerId ? ownerName(c, camp) : 'unassigned') + (c.partial ? ' · hover fields only' : '') + (c.making === 1 ? ' · making' : c.unlocked === 1 ? (gm ? ' · open to its player' : ' · yours to fill in') : '') + (gm && c.review === 1 ? ' · new' : '');   // Onboarding F3: its state
    var revert = ui('sheetRevert'); if (revert) revert.style.display = gm && lastChange && lastChange.charId === c.id ? '' : 'none';
    var pick = ui('sheetPick'); if (pick) { pick.textContent = ''; var pickL = gm ? charList(camp) : charList(camp).filter(function(x) { return !x.partial && x.ownerId === myId(); }); if (gm || pickL.length > 1) { pickL.forEach(function(x) { pick.appendChild(opt(x.id, x.name + (x.npc ? ' (NPC)' : '') + (x.making === 1 ? ' (being made)' : ''), x.id === c.id)); }); pick.style.display = ''; } else pick.style.display = 'none'; }
    var por = ui('sheetPortrait'); if (por) { if (c.portrait) { por.src = imgSrc(c.portrait); por.style.display = ''; } else por.style.display = 'none'; }
    var upB = ui('sheetUpload'); if (upB) { var gmUp = gm && canWrite(); upB.style.display = !lockedS && (gmUp || (isClient() && own && !c.partial && (c.making !== 1 || fillOk()))) ? '' : 'none'; upB.title = gmUp ? 'Import JSON: fill or update this sheet from a ShadowBase character file. You review what changes before anything is applied' : c.making === 1 ? 'Fill this character from a file: your own sheet download (.wpchar.json) or a ShadowBase sheet' : 'Import JSON: send your ShadowBase sheet file to the GM, who approves what changes'; }   // Stage 6 U3: the owner's Import JSON (to the GM, as proposed changes); Onboarding F4: while making, a file fills it
    var picB = ui('sheetPic'); if (picB) picB.style.display = !lockedS && isClient() && own && !c.partial ? '' : 'none';   // Onboarding F1c: the owner's own picture for it
    var dlB = ui('sheetDownload'); if (dlB) dlB.style.display = canOpen(c.id) && !c.partial ? '' : 'none';   // Onboarding F2a: whoever may open it takes it away
    var dnB = ui('sheetDone'); if (dnB) { var dnOn = isClient() && own && !c.partial && (c.making === 1 || c.unlocked === 1); dnB.style.display = dnOn ? '' : 'none'; }   // Onboarding F3: the owner's Done
    var nmB = ui('sheetName'); if (nmB) nmB.style.display = isClient() && own && !c.partial && c.making === 1 ? '' : 'none';   // renamed only while in the making (owner)
    var ulB = ui('sheetUnlock'); if (ulB) { var ulOn = gm && !!c.ownerId && !c.npc && c.making !== 1 && c.review !== 1; ulB.style.display = ulOn ? '' : 'none'; if (ulOn) { ulB.textContent = c.unlocked === 1 ? 'Lock for player' : 'Unlock for player'; ulB.title = c.unlocked === 1 ? 'Lock it again: its player keeps only the fields they may always change' : 'Let its player fill in every field they can see (they press Done when finished)'; } }
    // [systemcheck:sheetedit-start]
    var edB = ui('sheetEdit'); if (edB) { var edOn = !c.partial && c.making !== 1 && (gm ? canWrite() : own); edB.style.display = edOn ? '' : 'none'; if (edOn) { edB.textContent = lockedS ? 'Edit sheet' : 'Lock sheet'; edB.classList.toggle('on', !lockedS); edB.title = lockedS ? 'This sheet is locked. Rolls, pools, switches, effects and what you carry still work. Edit sheet lets you change its stats, levels, lists and notes' : 'Lock the sheet again, so that a slip while you play changes none of its stats'; } }
    p.classList.toggle('sheet-editing', !lockedS);
    // [systemcheck:sheetedit-end]
    var dlX = ui('sheetDelete'); if (dlX) { var mineX = isClient() && own && !c.partial && charList(camp).filter(function(x) { return !x.partial && x.ownerId === myId(); }).length > 1; dlX.style.display = (gm && canWrite()) || mineX ? '' : 'none'; dlX.title = gm ? 'Delete this sheet: its values are gone; its tokens keep their name and lose the link' : 'Delete this sheet of yours: one you are still making, or one you do not play (your GM is told)'; }
    renderReviewBar(c, camp, gm);
    var bdB = ui('sheetBudgets'); if (bdB) bdB.style.display = !c.partial && budgetBar(bdB, sys, c) ? '' : 'none';   // 126: the point budgets, under the head
    var rvB = ui('sheetReview'), rvN = gm ? uploadsOf(camp, c.id) : []; if (rvB) { rvB.style.display = rvN.length ? '' : 'none'; if (rvN.length) rvB.textContent = 'Review (' + rvN[0].changes.length + ')'; }   // U3: the GM's review of it
    var hb = ui('sheetHud'); if (hb) { var hOn = hudHasContent(sys) && canOpen(c.id); hb.style.display = hOn ? '' : 'none'; if (hOn) hb.title = 'Open ' + (sys.sheet.hud.title || 'the HUD'); }   // HUD frame (HF2a): only when the saved system has a HUD they can see
    p.classList.toggle('sheet-has-headportrait', !!(sys.sheet && sys.sheet.look && sys.sheet.look.portrait));   // Stage 5g: the header block carries the portrait, so the title bar's small one steps aside
    var all = resolveAll(sys, c, F(), tokenCtxFor(c.id, camp));   // 5h Fold 3 / Stage 6: the token names read this character's token
    _dialSig = dialSigOf(c, camp); _dialStale = false; _dialOn = JSON.stringify(tokenFlags()); _roundSig = roundSigOf(c, camp); _rangeSig = rangeSigOf(c, camp);
    _sheetRefSig = refSig(sys);
    buildSections(body, sys, c, all, gm, own, renderSheet, { campId: camp.id, view: 'sheet', preview: false });
    applyPaletteTo(p, sys.sheet && sys.sheet.look);   // Stage 6 look fold: the palette also dresses the panel's own head, border and grip
    try { syncEndTurn(); } catch (e) {}   // turn-based combat T2: a sheet opened on its turn
    p.classList.toggle('sheet-has-table', !!body.querySelector('.sheet-itemtable'));   // Stage 4: a rich item table gets a wider, responsive panel so its columns fit
    // document appearance (1.5.0): the campaign default themes the sheet too. Reset first so turning it off restores the app style.
    applySheetLookTo(body, sheetLook(camp, sys));
    syncFramePad(body);   // the width (and the look's font) may have changed the sticky frame's height
    if (body.scrollTop !== st0) body.scrollTop = st0;   // a redraw never moves the sheet: where it was read is where it stays
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
function sheetLook(camp, sys) {
    var DR = window.wpDocRender; if (!DR || !DR.cleanDocStyle) return null;
    var st = DR.cleanDocStyle(DR.mergeDocStyle ? DR.mergeDocStyle(camp && camp.docStyle, sys && sys.sheetStyle) : (camp && camp.docStyle));
    if (st && paletteOf(sys && sys.sheet && sys.sheet.look)) { st = Object.assign({}, st); delete st.textColor; delete st.bgColor; }   // Stage 6: a palette wins over page colours (the font and the picture still apply)
    return st;
}
function applySheetLookTo(node, style) {
    node.style.fontFamily = ''; node.style.color = ''; node.style.backgroundColor = '';   // reset first so turning a look off restores the app style
    if (style) { var DF = (window.wpDocRender && window.wpDocRender.DOC_FONTS) || {}; if (style.font && DF[style.font]) node.style.fontFamily = DF[style.font]; if (style.textColor) node.style.color = style.textColor; if (style.bgColor) node.style.backgroundColor = style.bgColor; }
    // Stage 5g: the header block and the frame are opaque panels over the body. They wear the look's colours only as a PAIR (a text
    // colour AND a panel colour, plus a muted ink mixed from the two for labels); a look with just one of them leaves both panels in the
    // app theme's own colours, as before — a text colour alone over the app panel (or theme text over a look panel) could be unreadable
    var HEXC = /^#[0-9a-fA-F]{6}$/, pair = !!(style && HEXC.test(style.textColor || '') && HEXC.test(style.bgColor || ''));
    if (pair) { node.style.setProperty('--sheet-ink', style.textColor); node.style.setProperty('--sheet-bg', style.bgColor); node.style.setProperty('--sheet-dim', 'color-mix(in srgb, ' + style.textColor + ' 62%, ' + style.bgColor + ')'); }
    else { node.style.removeProperty('--sheet-ink'); node.style.removeProperty('--sheet-bg'); node.style.removeProperty('--sheet-dim'); }
    if (style && style.bgColor) node.style.setProperty('--sheet-canvas', style.bgColor); else node.style.removeProperty('--sheet-canvas');   // Stage 6 look fold (L5): what a sticky title is painted with
    applySheetBg(node, style);
}
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function() { var b = ui('sheetBody'); if (b && sheetOpen) syncFramePad(b); Object.keys(huds).forEach(function(id) { syncFramePad(huds[id].body); }); var pv = ui('sysLayoutPreview'); if (pv) syncFramePad(pv); });   // Stage 6: a look font arriving late changes the frame's height
document.addEventListener('wp-asset', function(e) {
    var p = e.detail && e.detail.path, DR = window.wpDocRender; if (!p || !DR || !DR.docBgImage) return;
    document.querySelectorAll('[data-bgpath]:not(.wrap)').forEach(function(node) {   // sheet bodies (the live panel + a pop-out); page wraps are handbook.js's
        if (node.dataset.bgpath === p) node.style.backgroundImage = DR.docBgImage({ bgImage: p, bgDim: parseFloat(node.dataset.bgdim) || 0 }, imgSrc);
    });
});
// Render a character sheet READ-ONLY into an arbitrary container (the pop-out window; the pop-out never owns
// the save — window.wpPopout no-ops it — so nothing here can write data.json). GM view (full sheet), fields disabled.
var _lastInto = null;   // Stage 6: the pop-out's last render (it redraws when a pin changes in another window)
window.addEventListener('storage', function(e) { if (!e || e.key !== PIN_KEY) return; renderViews(null); if (_lastInto && _lastInto.container && _lastInto.container.isConnected) renderSheetInto(_lastInto.container, _lastInto.charId, _lastInto.camp); });
function renderSheetInto(container, charId, camp) {
    camp = camp || getActiveCampaign(); _lastInto = { container: container, charId: charId, camp: camp };
    var raw = systemOf(camp), c0 = charById(charId, camp);
    if (!container || !c0 || !raw || !F()) return null;
    // the pop-out renders the RAW save (popout.js reads /api/data unsanitised): clean the system and the character here, as a load does,
    // so every sink below (the look's accent, section colours, icons, the portrait) sees validated values
    var sys = cleanSystem(raw, { F: F(), gmView: true }), c = sys ? cleanChar(c0, sys) : null;
    if (!sys || !c) return null;
    _fxLive = false; try { buildSections(container, sys, c, resolveAll(sys, c, F(), tokenCtxFor(c.id, camp)), true, false, function() { renderSheetInto(container, charId, camp); }, { campId: camp.id, view: 'sheet', preview: false }); } finally { _fxLive = true; }   // 5h: a pop-out's effect controls act on nothing
    var bdP = el('div', 'sheet-budgets'); if (budgetBar(bdP, sys, c)) container.insertBefore(bdP, container.firstChild);   // 126: a sheet in a window of its own shows its point budgets too, at its top
    container.querySelectorAll('input, select, textarea').forEach(function(el) { el.disabled = true; });
    container.querySelectorAll('[data-part="up"], [data-part="down"]').forEach(function(el) { el.disabled = true; });   // Stage 6 look fold (L8): arrows inside a box look live otherwise
    container.querySelectorAll('[contenteditable]').forEach(function(el) { el.setAttribute('contenteditable', 'false'); });
    container.classList.toggle('sheet-has-table', !!container.querySelector('.sheet-itemtable'));
    applySheetLookTo(container, sheetLook(camp, sys));
    syncFramePad(container);   // measured in the look's own font
    return { title: c.name || 'Character' };
}
// [systemcheck:hud-start]
/* ---------- the HUD (Stage 6 HUD frame, HF2a): a second window per character, drawn from the system's HUD layout (sys.sheet.hud, through
   hudView) by the same section renderer as the sheet — the reference's Tactical HUD made generic. One window per character, several at
   once; drag the head, resize from the corner, click to bring it forward; the place and size are ONE record for every HUD (wp_hudPanel,
   as the reference keeps one per user). Everything drawn here is text or goes through the sheet's own tested setters. ---------- */
var huds = Object.create(null), HUD_CAP = 8, HUD_CID = /^c_[A-Za-z0-9_]{1,24}$/, HUD_TAB = /^t_[A-Za-z0-9_]{1,24}$/;   // charId -> { charId, panel, head, body, name, sub, por, dialSig, dialStale, dialOn, redraw }
function hudFor(charId) { var camp = getActiveCampaign(); return !!(HUD_CID.test(String(charId)) && canOpen(charId) && hudHasContent(systemOf(camp))); }
function openHud(charId, opts) {
    if (!HUD_CID.test(String(charId))) return;
    if (!canOpen(charId)) { toast(featureOn() ? 'That HUD is not yours to open.' : 'Character sheets are off here.'); return; }
    if (!hudHasContent(systemOf(getActiveCampaign()))) { toast('This system has no HUD yet (System editor \u25b8 Layout \u25b8 HUD, then Save).'); return; }
    var existed = !!huds[charId];
    var v = huds[charId];
    if (!v) { var ids = Object.keys(huds); if (ids.length >= HUD_CAP) closeHud(ids[0]); v = makeHud(charId); if (!v) return; huds[charId] = v; placeHud(v); }   // opening it again brings it forward (the reference's open())
    var was = v.body.dataset.wpTab || '', stuck = existed && v.body.scrollTop > frameFlowTop(v.body);   // HF2b: measured before the tab changes
    if (opts && typeof opts.tab === 'string' && HUD_TAB.test(opts.tab)) v.body.dataset.wpTab = opts.tab;   // buildSections falls back to the first tab if it is not one
    if (typeof window !== 'undefined' && window.wpFloats) window.wpFloats.reveal(v.panel);   // 1.5.4 (floats.js): asked for here, so it shows on this view
    raisePanel(v.panel); renderHud(charId);
    if (stuck && huds[charId] === v && v.body.dataset.wpTab !== was) v.body.scrollTop = frameFlowTop(v.body);   // another tab asked of an open, scrolled HUD starts at its own top, as the HUD's own strip does
}
function makeHud(charId) {
    var tpl = ui('hudTpl'), layer = ui('hudLayer'); if (!tpl || !tpl.content || !tpl.content.firstElementChild || !layer || !HUD_CID.test(String(charId))) return null;
    var p = tpl.content.firstElementChild.cloneNode(true); p.dataset.cid = charId;
    var q = function(cls) { return p.querySelector('.' + cls); };
    var v = { charId: charId, panel: p, head: q('hud-head'), body: q('hud-body'), name: q('hud-name'), sub: q('hud-sub'), por: q('hud-portrait'), dialSig: '', dialStale: false, dialOn: null, roundSig: '', rangeSig: '', redraw: null };
    v.foot = q('hud-foot'); v.histOpen = false; v.bellOpen = false;   // HF3: the roll history drawer, closed on a new window (as the reference)
    layer.appendChild(p);
    p.addEventListener('keydown', function(e) { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); closeHud(charId); } });
    p.addEventListener('pointerdown', function() { raisePanel(p); }, true);
    q('hud-sheet').addEventListener('click', function() { openSheet(charId); });
    q('hud-endturn').addEventListener('click', endTurn);   // turn-based combat T2
    q('hud-close').addEventListener('click', function() { closeHud(charId); });
    var head = v.head, drag = null;
    head.addEventListener('pointerdown', function(e) { if (e.target.closest('button, select, input')) return; var r = p.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
    head.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = (e.clientX - drag.dx) + 'px'; p.style.top = (e.clientY - drag.dy) + 'px'; });
    head.addEventListener('pointerup', function() { if (!drag) return; drag = null; var sized = p.classList.contains('sheet-sized'); if (sized) sizePanel(p, p.offsetWidth, p.offsetHeight); saveHudPref(p, sized); });
    var grip = q('hud-resize'), rz = null;
    grip.addEventListener('pointerdown', function(e) { e.preventDefault(); e.stopPropagation(); var r = p.getBoundingClientRect(); p.style.left = r.left + 'px'; p.style.top = r.top + 'px'; rz = { x: e.clientX, y: e.clientY, w: r.width, h: r.height }; grip.setPointerCapture(e.pointerId); });
    grip.addEventListener('pointermove', function(e) { if (!rz || (e.clientX === rz.x && e.clientY === rz.y)) return; rz.moved = true; sizePanel(p, rz.w + e.clientX - rz.x, rz.h + e.clientY - rz.y); syncFramePad(v.body); });
    grip.addEventListener('pointerup', function() { if (!rz) return; var moved = rz.moved; rz = null; if (moved) saveHudPref(p, true); });   // a click never saves
    grip.addEventListener('dblclick', function() { p.style.width = ''; p.style.height = ''; p.classList.remove('sheet-sized'); var o = hudPref(); delete o.w; delete o.h; setPref('wp_hudPanel', JSON.stringify(o)); syncFramePad(v.body); });
    return v;
}
function hudPref() { try { var o = JSON.parse(pref('wp_hudPanel', 'null')); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; } catch (e) { return {}; } }
function saveHudPref(p, sized) { var r = p.getBoundingClientRect(), o = hudPref(); o.x = Math.round(r.left); o.y = Math.round(r.top); if (sized) { o.w = Math.round(r.width); o.h = Math.round(r.height); } setPref('wp_hudPanel', JSON.stringify(o)); }
// The first HUD opens in the middle of the window (the owner's Q4, as the reference); after that, wherever a HUD was last left. A second one
// opened onto the same spot steps down and right (at most five times), so it never hides the first.
function placeHud(v) {
    var p = v.panel, o = hudPref(), W = window.innerWidth, H = window.innerHeight, num = function(x) { return typeof x === 'number' && isFinite(x); };
    var sized = num(o.w) && num(o.h), w = sized ? Math.min(W - 16, Math.max(360, o.w)) : (p.offsetWidth || 470), h = sized ? Math.min(H - 16, Math.max(240, o.h)) : (p.offsetHeight || 700), x, y;
    if (num(o.x) && num(o.y)) { x = o.x; y = o.y; } else { x = (W - w) / 2; y = (H - h) / 2; }
    var near = function() { return Object.keys(huds).some(function(id) { var u = huds[id]; if (!u || u === v) return false; var r = u.panel.getBoundingClientRect(); return Math.abs(r.left - x) <= 8 && Math.abs(r.top - y) <= 8; }); };
    for (var k = 0; k < 5 && near(); k++) { x += 24; y += 24; }
    p.style.left = Math.round(Math.max(0, Math.min(W - 160, x))) + 'px'; p.style.top = Math.round(Math.max(0, Math.min(H - 80, y))) + 'px';
    if (sized) sizePanel(p, o.w, o.h);
}
function closeHud(charId) { var v = huds[charId]; if (!v) return; clearTimeout(v.redraw); delete huds[charId]; if (v.panel && v.panel.parentNode) v.panel.parentNode.removeChild(v.panel); if (!Object.keys(huds).length) resetZ(); }
function closeHuds() { Object.keys(huds).forEach(function(id) { closeHud(id); }); }
// The HUD's twin of renderSheet: its head (portrait, name, the HUD's title), then the HUD's own layout in the sheet's look
function renderHud(charId) {
    var v = huds[charId]; if (!v) return;
    var camp = getActiveCampaign(), full = systemOf(camp), c = charById(charId, camp);
    if (!c || !full || !F() || !canOpen(charId) || !hudHasContent(full)) { closeHud(charId); return; }   // the HUD removed, the feature off, the character gone or no longer theirs
    var sys = hudView(full), fk = focusKeyOf(v.body), stH = v.body.scrollTop, gm = !isClient(), own = !!(c.ownerId && c.ownerId === myId());
    v.name.textContent = c.name; v.sub.textContent = (full.sheet.hud.title || 'HUD') + (c.npc ? ' \u00b7 NPC' : '');
    v.panel.setAttribute('aria-label', 'HUD: ' + c.name);
    if (c.portrait) { v.por.src = imgSrc(c.portrait); v.por.style.display = ''; } else { v.por.removeAttribute('src'); v.por.style.display = 'none'; }
    var all = resolveAll(sys, c, F(), tokenCtxFor(c.id, camp));
    v.dialSig = dialSigOf(c, camp); v.dialStale = false; v.dialOn = JSON.stringify(tokenFlags()); v.roundSig = roundSigOf(c, camp); v.rangeSig = rangeSigOf(c, camp);
    _sheetRefSig = refSig(full);
    buildSections(v.body, sys, c, all, gm, own, function() { renderHud(charId); }, { campId: camp.id, view: 'hud', preview: false, targets: pinTargetsAll(full.sheet) });
    applyPaletteTo(v.panel, sys.sheet && sys.sheet.look);
    applySheetLookTo(v.body, sheetLook(camp, sys));
    syncFramePad(v.body);
    ['--sheet-accent', '--sheet-accent-ink'].forEach(function(k) { var a = v.body.style.getPropertyValue(k); if (a) v.panel.style.setProperty(k, a); else v.panel.style.removeProperty(k); });   // HF3: the foot (the body's sibling) wears the look's accent too (applyLook set a checked hex or nothing)
    if (v.body.scrollTop !== stH) v.body.scrollTop = stH;   // as the sheet: a redraw never moves the HUD
    restoreFocus(v.body, fk);
    renderHudFoot(v);
    try { syncEndTurn(); } catch (e) {}   // turn-based combat T2: a HUD opened on its turn
}
/* The bell (the reference's footer bell, 2026-09-26): a character's notes this session on THIS machine — apply-action results, effects
   applied, suspended, resumed or ended, start-of-turn reminders — newest first, kept to a depth (a pref: 12, 25 or 50); pinned notes are
   never dropped and float to the top (at most depth \u2212 1); one can be removed; Clear keeps the pins. Pins are saved here, per campaign
   and character (owner, 2026-09-26: never on the character, so a GM's pin of a private line never reaches a player). Text only. */
var BELL_DEPTHS = [12, 25, 50], _bell = Object.create(null), _fxSeen = Object.create(null);
function bellDepth() { var d = parseInt(pref('wp_hudBellDepth', '12'), 10); return BELL_DEPTHS.indexOf(d) >= 0 ? d : 12; }
function bellText(s, n) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); }
function bellPinsRead(campId) {   // this machine's saved pins for a campaign: { charId: [note] }, each checked (a hand-edited store is read like any file)
    var out = Object.create(null), raw = null;
    try { raw = JSON.parse(pref('wp_bellPins.' + campId, 'null')); } catch (e) { raw = null; }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).slice(0, 500).forEach(function(cid) {
        if (!HUD_CID.test(cid) || !Array.isArray(raw[cid])) return;
        var list = [];
        raw[cid].slice(0, BELL_DEPTHS[BELL_DEPTHS.length - 1] - 1).forEach(function(p) {
            if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !/^n[0-9]{1,9}$/.test(p.id) || typeof p.at !== 'number' || !isFinite(p.at)) return;
            var t = bellText(p.title, 60), x = bellText(p.text, 300); if (!t && !x) return;
            list.push({ id: p.id, title: t, text: x, bad: p.bad === 1 ? 1 : 0, at: p.at, pinned: true });
        });
        if (list.length) out[cid] = list;
    });
    return out;
}
function bellPinsWrite(campId, cid, log) {
    var all = bellPinsRead(campId), store = {}, shape = function(r) { var o = { id: r.id, title: r.title, text: r.text, at: r.at }; if (r.bad) o.bad = 1; return o; };
    all[cid] = log.recs.filter(function(r) { return r.pinned; });
    Object.keys(all).forEach(function(k) { if (all[k].length) store[k] = all[k].map(shape); });
    setPref('wp_bellPins.' + campId, JSON.stringify(store));
}
function bellLog(cid) {   // this session's log for a character of the campaign on screen, its saved pins restored the first time
    var camp = getActiveCampaign(); if (!camp || !HUD_CID.test(String(cid))) return null;
    var k = camp.id + '|' + cid, log = _bell[k];
    if (!log) {
        var pins = (bellPinsRead(camp.id)[cid] || []).slice(0, bellDepth() - 1), seq = 0;
        pins.forEach(function(p) { var n = parseInt(p.id.slice(1), 10); if (n > seq) seq = n; });
        log = _bell[k] = { campId: camp.id, recs: pins, seq: seq };
    }
    return log;
}
function bellCap(log) { var lim = bellDepth(); for (var i = log.recs.length - 1; i >= 0 && log.recs.length > lim; i--) if (!log.recs[i].pinned) log.recs.splice(i, 1); }
// a note for a character's bell: { title, text, bad } or a card ({ apply } / { due }); cid '' finds the one character of this player's named as
// (an apply card carries a name). Only a character whose HUD this viewer can open; its HUD's foot repaints
function bellNote(cid, note, as) {
    if (!note || typeof note !== 'object') return null;
    var camp = getActiveCampaign(), DCb = window.wpDiceCore; if (!camp) return null;
    if (!cid) {
        if (!isClient() || typeof as !== 'string' || !as) return null;
        var mine = Object.keys(camp.chars || {}).filter(function(id) { var x = camp.chars[id]; return x && !x.partial && x.ownerId === myId() && rollName(x) === as; });
        if (mine.length !== 1) return null; cid = mine[0];
    }
    if (!HUD_CID.test(String(cid)) || !canOpen(cid)) return null;
    var t = note.title, x = note.text, bad = !!note.bad;
    if (note.apply) { t = note.apply.label || 'Applied'; x = DCb && DCb.applyChanges ? DCb.applyChanges(note.apply) : ''; bad = false; }
    else if (note.due) { t = 'Reminder'; x = DCb && DCb.dueText ? DCb.dueText(note.due) : ''; bad = false; }
    t = bellText(t, 60); x = bellText(x, 300); if (!t && !x) return null;
    var log = bellLog(cid); if (!log) return null;
    var rec = { id: 'n' + (++log.seq), title: t, text: x, bad: bad ? 1 : 0, at: Date.now(), pinned: false };
    log.recs.unshift(rec); bellCap(log);
    if (huds[cid]) renderHudFoot(huds[cid]);
    return rec;
}
function bellPin(cid, id) {   // true pinned, false refused (the limit), null not there
    var log = bellLog(cid); if (!log) return null;
    var r = log.recs.filter(function(x) { return x.id === id; })[0]; if (!r) return null;
    if (!r.pinned && log.recs.filter(function(x) { return x.pinned; }).length >= bellDepth() - 1) { toast('At most ' + (bellDepth() - 1) + ' notes can be pinned.'); return false; }
    r.pinned = !r.pinned; bellPinsWrite(log.campId, cid, log);
    return r.pinned;
}
function bellDrop(cid, id) { var log = bellLog(cid); if (!log) return; var was = log.recs.some(function(x) { return x.id === id && x.pinned; }); log.recs = log.recs.filter(function(x) { return x.id !== id; }); if (was) bellPinsWrite(log.campId, cid, log); }
function bellClear(cid) { var log = bellLog(cid); if (log) log.recs = log.recs.filter(function(x) { return x.pinned; }); }
function bellAgo(at, now) { var s = Math.max(0, Math.round((now - at) / 1000)); if (s < 45) return 'just now'; var m = Math.round(s / 60); if (m < 60) return m + 'm ago'; var h = Math.round(m / 60); if (h < 24) return h + 'h ago'; return Math.round(h / 24) + 'd ago'; }
function bellBtn(v, log) {
    var n = log.recs.length, pc = log.recs.filter(function(r) { return r.pinned; }).length, b = el('button', 'tool ghost hud-bell-btn'); b.type = 'button';
    b.setAttribute('aria-expanded', v.bellOpen ? 'true' : 'false');
    b.title = n ? n + (n === 1 ? ' note' : ' notes') + ' kept' + (pc ? ', ' + pc + ' pinned' : '') : 'Notes: none yet this session';
    b.appendChild(iconNode('icon:bell', 'hud-bell-ico'));
    if (n) b.appendChild(el('span', 'hud-bell-count', String(n)));
    b.addEventListener('click', function() { v.bellOpen = !v.bellOpen; renderHudFoot(v); });
    return b;
}
function bellPanel(v, c, log, top) {   // opens above the bar (the reference's), newest first with the pinned on top
    var p = el('div', 'hud-bell'), head = el('div', 'hud-bell-head'), pc = log.recs.filter(function(r) { return r.pinned; }).length, lim = bellDepth() - 1, now = Date.now();
    head.appendChild(el('span', 'hud-bell-title', 'Notes'));
    head.appendChild(el('span', 'hud-bell-pins notepad-who', pc + ' of ' + lim + ' pinned'));
    if (log.recs.length > pc) { var clr = el('button', 'tool ghost hud-bell-clear', 'Clear'); clr.type = 'button'; clr.title = 'Remove the notes that are not pinned'; clr.addEventListener('click', function() { bellClear(v.charId); renderHudFoot(v); }); head.appendChild(clr); }
    var sel = el('select', 'field hud-bell-depth'); sel.title = 'How many notes to keep';
    BELL_DEPTHS.forEach(function(d) { var o = el('option', null, String(d)); o.value = String(d); sel.appendChild(o); });
    sel.value = String(bellDepth());
    sel.addEventListener('change', function() { var d = parseInt(sel.value, 10); if (BELL_DEPTHS.indexOf(d) < 0) return; setPref('wp_hudBellDepth', d); Object.keys(_bell).forEach(function(k) { bellCap(_bell[k]); }); Object.keys(huds).forEach(function(id) { renderHudFoot(huds[id]); }); });
    head.appendChild(sel);
    p.appendChild(head);
    var list = el('div', 'hud-bell-list');
    if (!log.recs.length) list.appendChild(el('div', 'hud-bell-empty notepad-who', 'No notes for ' + c.name + ' yet this session.'));
    log.recs.filter(function(r) { return r.pinned; }).concat(log.recs.filter(function(r) { return !r.pinned; })).forEach(function(r) {
        var it = el('div', 'hud-bell-note' + (r.pinned ? ' hud-bell-pinned' : '') + (r.bad ? ' hud-bell-bad' : '')), row = el('div', 'hud-bell-row');
        row.appendChild(el('span', 'hud-bell-ntitle', r.title || 'Note'));
        row.appendChild(el('span', 'hud-bell-ago', bellAgo(r.at, now)));
        var pin = el('button', 'tool ghost hud-bell-pin'); pin.type = 'button'; pin.appendChild(iconNode(r.pinned ? 'icon:thumbtack-slash' : 'icon:thumbtack', 'hud-bell-pico'));
        pin.title = r.pinned ? 'Unpin' : pc >= lim ? 'At most ' + lim + ' notes can be pinned' : 'Pin: kept here, on this computer, until you unpin it';
        if (!r.pinned && pc >= lim) pin.disabled = true;
        pin.addEventListener('click', function() { bellPin(v.charId, r.id); renderHudFoot(v); });
        var rm = el('button', 'tool ghost hud-bell-rm'); rm.type = 'button'; rm.appendChild(iconNode('icon:xmark', 'hud-bell-pico')); rm.title = 'Remove this note';
        rm.addEventListener('click', function() { bellDrop(v.charId, r.id); renderHudFoot(v); });
        row.appendChild(pin); row.appendChild(rm); it.appendChild(row);
        if (r.text) it.appendChild(el('div', 'hud-bell-text', r.text));
        list.appendChild(it);
    });
    p.appendChild(list); list.scrollTop = top || 0;
    return p;
}
// The bell's effects feed: every character's effect rows as last seen here, compared at each repaint of a character's views (and each
// second) — one applied, suspended, resumed or ended makes a note, whoever did it (the GM, its player, a timer). The first sight of a
// character only records what it has
function bellFx(charId) {
    var camp = getActiveCampaign(), sys = systemOf(camp); if (!camp || !sys || !featureOn()) return;
    var fx = (sys.fields || []).filter(function(f) { return f && f.kind === 'effects'; }); if (!fx.length) return;
    var lib = Object.create(null); (sys.effects || []).forEach(function(d) { if (d && typeof d.id === 'string') lib[d.id] = d; });
    (charId == null ? Object.keys(camp.chars || {}) : [charId]).forEach(function(id) {
        var c = charById(id, camp); if (!c) return;
        var k = camp.id + '|' + id, was = _fxSeen[k], now = Object.create(null);
        fx.forEach(function(f) { var rows = c.values && Array.isArray(c.values[f.id]) ? c.values[f.id] : []; rows.forEach(function(r) { if (!r || typeof r.id !== 'string') return; var d = typeof r.ref === 'string' ? lib[r.ref] : r; now[f.id + ':' + r.id] = { n: String((d && d.name) || r.name || 'An effect'), on: r.on !== false, bad: !!(d && d.tone === 'debuff') }; }); });
        _fxSeen[k] = now;
        if (!was || !canOpen(id)) return;
        Object.keys(now).forEach(function(rk) { var a = was[rk], b = now[rk]; if (!a) bellNote(id, { title: 'Effect applied', text: b.n, bad: b.bad }); else if (a.on !== b.on) bellNote(id, { title: b.on ? 'Effect resumed' : 'Effect suspended', text: b.n }); });
        Object.keys(was).forEach(function(rk) { if (!now[rk]) bellNote(id, { title: 'Effect ended', text: was[rk].n }); });
    });
}
/* HF3: the docked roll history at the HUD's foot — the reference's footer drawer. It lists what THIS machine saw of the rolls made as the
   character this session (net.rollsFor: tagged locally, or another machine's roll made as its name), newest first, drawn by the dice's
   own textContent-only card. Nothing is built (the foot hides) when the table cannot roll or the system the viewer holds has nothing to
   roll. Clear is this viewer's alone (a seq mark, for the session); the depth is a pref, 10/25/50/100. The body is never rebuilt here. */
var _histCleared = Object.create(null), HIST_DEPTHS = [10, 25, 50, 100];
function histDepth() { var d = parseInt(pref('wp_hudHistDepth', '10'), 10); return HIST_DEPTHS.indexOf(d) >= 0 ? d : 10; }
function sysRolls(sys) { return !!sys && ((Array.isArray(sys.rolls) && sys.rolls.length > 0) || (Array.isArray(sys.fields) && sys.fields.some(function(f) { return f && f.roll; }))); }
function rollName(c) { var DL = window.wpDiceCore && window.wpDiceCore.LIMITS; return String((c && c.name) || '').slice(0, (DL && DL.label) || 60); }   // as a roll's "as" carries it
function renderHudFoot(v) {
    var foot = v && v.foot; if (!foot) return;
    var fa = document.activeElement, fcls = fa && foot.contains(fa) ? ['hud-hist-toggle', 'hud-hist-clear', 'hud-hist-depth', 'hud-bell-btn', 'hud-bell-clear', 'hud-bell-depth'].filter(function(k) { return fa.classList.contains(k); })[0] || '' : '';
    var old = foot.querySelector('.hud-hist-list'), top = old ? old.scrollTop : 0, oldB = foot.querySelector('.hud-bell-list'), topB = oldB ? oldB.scrollTop : 0;
    foot.textContent = '';
    var camp = getActiveCampaign(), c = charById(v.charId, camp), n = net(), D = window.wpDice;
    var canRoll = !!(n && typeof n.rollsFor === 'function' && D && typeof D.renderCard === 'function' && !(window.wpVtt && !window.wpVtt.on('dice')) && sysRolls(systemOf(camp)));
    var bl = c && typeof bellLog === 'function' ? bellLog(v.charId) : null;   // the bell: always beside the history, alone once it holds a note
    if (!c || (!canRoll && !(bl && bl.recs.length))) return;
    var bar = el('div', 'hud-hist-bar');
    if (canRoll) {
    var rolls = n.rollsFor(v.charId, rollName(c), _histCleared[v.charId] || 0, histDepth());
    var tg = el('button', 'hud-hist-toggle'); tg.type = 'button';
    tg.setAttribute('aria-expanded', v.histOpen ? 'true' : 'false'); tg.title = v.histOpen ? 'Hide the roll history' : 'Show this session\u2019s rolls as ' + c.name;
    var ib = el('span', 'hud-hist-icobox'); ib.appendChild(iconNode('icon:clock-rotate-left', 'hud-hist-ico')); tg.appendChild(ib);
    tg.appendChild(el('span', 'hud-hist-title', 'Roll history'));
    if (!v.histOpen && rolls.length) tg.appendChild(el('span', 'hud-hist-new', 'NEW'));   // the reference's pulse: closed, with rolls in it
    tg.appendChild(iconNode(v.histOpen ? 'icon:chevron-down' : 'icon:chevron-up', 'hud-hist-chev'));
    tg.addEventListener('click', function() { v.histOpen = !v.histOpen; renderHudFoot(v); });
    bar.appendChild(tg);
    if (v.histOpen) {
        var tools = el('div', 'hud-hist-tools');
        if (rolls.length) {
            var clr = el('button', 'tool ghost hud-hist-clear', 'Clear'); clr.type = 'button'; clr.title = 'Empty this history for you (the chat keeps every roll)';
            clr.addEventListener('click', function() { _histCleared[v.charId] = n.rollSeq(); renderHudFoot(v); });
            tools.appendChild(clr);
        }
        var sel = el('select', 'field hud-hist-depth'); sel.title = 'How many rolls to list';
        HIST_DEPTHS.forEach(function(d) { var o = el('option', null, String(d)); o.value = String(d); sel.appendChild(o); });
        sel.value = String(histDepth());
        sel.addEventListener('change', function() { var d = parseInt(sel.value, 10); if (HIST_DEPTHS.indexOf(d) < 0) return; setPref('wp_hudHistDepth', d); Object.keys(huds).forEach(function(id) { renderHudFoot(huds[id]); }); });
        tools.appendChild(sel);
        bar.appendChild(tools);
    }
    }
    if (bl) bar.appendChild(bellBtn(v, bl));
    if (bl && v.bellOpen) foot.appendChild(bellPanel(v, c, bl, topB));
    foot.appendChild(bar);
    if (canRoll && v.histOpen) {
        var list = el('div', 'hud-hist-list');
        if (rolls.length) rolls.forEach(function(m) { list.appendChild(D.renderCard(m)); });
        else list.appendChild(el('div', 'hud-hist-empty notepad-who', 'No rolls as ' + c.name + ' yet this session.'));
        foot.appendChild(list); list.scrollTop = top;
    }
    if (fcls) { var back = foot.querySelector('.' + fcls) || foot.querySelector('.hud-hist-toggle') || foot.querySelector('.hud-bell-btn'); if (back) back.focus(); }
}
// net.js's hook: a roll landed (m) made as cid (its local tag; '' when this machine cannot tell) — repaint the FOOT of each HUD of that
// character (by tag, or untagged by name for the GM's roll or this machine's own, as net.rollsFor lists it); m null (the join's history,
// a session reset, a new table): every HUD's foot
function rolled(m, cid) {
    var me = (net() || {}).myId;
    Object.keys(huds).forEach(function(id) {
        var v = huds[id]; if (!v) return;
        if (m && m.roll) { if (cid ? id !== cid : !(m.roll.as && m.roll.as === rollName(charById(id)) && m.from && (m.from.gm === true || m.from.id === me))) return; }
        renderHudFoot(v);
    });
}
// One refresh path for every view of a character: the sheet when it shows charId (any when null), then every HUD of it (all when null) —
// never the body that just painted itself (skip)
function renderViews(charId, skip) {
    if (typeof bellFx === 'function') { try { bellFx(charId); } catch (e) { console.error(e); } }   // the bell's effects feed: what changed since this machine last looked
    var any = charId == null;
    if (sheetOpen && (any || sheetOpen === charId) && ui('sheetBody') !== skip) renderSheet();
    Object.keys(huds).forEach(function(id) { var v = huds[id]; if (v && (any || id === charId) && v.body !== skip) renderHud(id); });
}
// A token turned (tokenTurned): a HUD's dial and stance follow in place; its numbers that read a facing name redraw once the turn is final
function turnView(v, final) {
    var camp = getActiveCampaign(), c = charById(v.charId, camp); if (!c) return;
    var sig = dialSigOf(c, camp), on = JSON.stringify(tokenFlags());
    if (sig !== v.dialSig) {
        v.dialSig = sig; v.dialStale = true;
        if (v.dialOn !== null && on !== v.dialOn) { v.dialOn = on; v.dialStale = false; redrawForFacing(v); return; }   // a token feature switched: the whole HUD
        swapTokenControls(v.panel, c, camp);
    }
    var rs = roundSigOf(c, camp); if (rs !== v.roundSig) { v.roundSig = rs; v.dialStale = true; }
    var rg = typeof rangeSigOf === 'function' ? rangeSigOf(c, camp) : ''; if (rg !== v.rangeSig) { v.rangeSig = rg; v.dialStale = true; }   // range R2: what reads RangeMod or TargetDistance   // HF5b: a round change redraws what reads CombatRound
    if (final && v.dialStale) { v.dialStale = false; if (namesFacing(systemOf(camp))) redrawForFacing(v); }
}
// The floating panels (the sheet, every HUD, the doc panel) come to the front when clicked or opened — only while a HUD is open (with none,
// the sheet and the doc panel stack by DOM order as before): z from 9001, renumbered in order before it passes 9400 (the map tooltip is at
// 20000, the context menu at 100000, chat at 90000, modals above)
var _zTop = 9000;
function floatPanels() { var l = [ui('sheetPanel'), ui('docPanel')]; Object.keys(huds).forEach(function(id) { l.push(huds[id].panel); }); return l.filter(Boolean); }
function raisePanel(p) {
    if (!p || !Object.keys(huds).length || String(p.style.zIndex) === String(_zTop)) return;
    if (_zTop >= 9400) { var ps = floatPanels().filter(function(x) { return x !== p; }).sort(function(a, b) { return (+a.style.zIndex || 9000) - (+b.style.zIndex || 9000); }); _zTop = 9000; ps.forEach(function(x) { x.style.zIndex = String(++_zTop); }); }
    p.style.zIndex = String(++_zTop);
}
function resetZ() { [ui('sheetPanel'), ui('docPanel')].forEach(function(x) { if (x) x.style.zIndex = ''; }); _zTop = 9000; }   // the last HUD closed: today's stacking again
// Where a handbook page opens beside: the view in front (the most recently raised of the open sheet and the HUDs)
function frontView() {
    var l = []; var sp = ui('sheetPanel'); if (sp && sp.style.display !== 'none') l.push(sp);
    Object.keys(huds).forEach(function(id) { l.push(huds[id].panel); });
    l.sort(function(a, b) { return (+b.style.zIndex || 9000) - (+a.style.zIndex || 9000); });
    return l[0] || null;
}
// The 'hud' placement (HF2b): a button on the sheet that opens this character's HUD, at one of its tabs when it names one — the reference's
// in-sheet HUD buttons (Active Effects, Damage Processor) made generic. Live only on the real sheet (never in the Layout preview or a pop-out)
// and only while a HUD can be opened for this character; decided when drawn, as the dial is.
function hudButton(pl, c, sys, vctx) {
    var live = _fxLive && !(vctx && vctx.preview) && !window.wpPopout, h = sys && sys.sheet && sys.sheet.hud, name = (h && h.title) || 'the HUD';
    var tb = pl.tab && h && Array.isArray(h.tabs) ? h.tabs.find(function(x) { return x && x.id === pl.tab; }) : null, ok = live && hudFor(c.id);
    var b = el('button', 'tool sheet-roll sheet-hud-link'); b.type = 'button'; b.disabled = !ok;
    b.appendChild(iconNode('icon:wave-square', 'sheet-hud-icon')); b.appendChild(el('span', 'sheet-hud-text', pl.text || ('Open ' + name)));
    b.title = ok ? 'Open ' + name + (tb ? ' at its ' + (tb.label || 'chosen') + ' tab' : '') : (live ? 'No HUD to open here' : 'Opens ' + name + ' (on the sheet itself)');
    if (ok) b.addEventListener('click', function(e) { e.preventDefault(); if (b.closest('#systemModal')) return; openHud(c.id, pl.tab ? { tab: pl.tab } : null); });
    var box = el('div', 'sheet-field sheet-kind-hud'); box.appendChild(b); return box;
}
// [systemcheck:hud-end]
var _secOpen = {};   // remembered collapse state of collapsible sections, keyed by section id (survives re-renders within a session; native <details> handles the visual toggle)
// Where the sticky frame (band + tab strip) sits in the body's flow, in the body's scroll coordinates: the scrollTop at which it
// just starts to stick. Infinity when there is no frame (so nothing counts as stuck).
// The stuck frame covers the top of the scrollport: reserve its height for the browser's scroll-into-view, so a control reached by
// keyboard is scrolled clear of it instead of staying hidden underneath. Re-run when the panel's width changes the frame's height.
function syncFramePad(body) {
    var fr = body.querySelector(':scope > .sheet-frame');
    if (fr) body.style.scrollPaddingTop = fr.offsetHeight + 'px'; else if (body.style.scrollPaddingTop) body.style.scrollPaddingTop = '';
    if (fr && body.classList.contains('sheet-sticky-titles')) body.style.setProperty('--sheet-frame-h', fr.offsetHeight + 'px'); else body.style.removeProperty('--sheet-frame-h');   // Stage 6 look fold (L5): a sticky title stops under the frame
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
    var IDN_EDIT = { text: 1, select: 1, number: 1, toggle: 1 };   // Stage 6 look fold: identity rows edited in place
    var openF = function(f) { return typeof fieldOpen !== 'function' || fieldOpen(f); };   // the sheet's lock (through typeof, as in fieldNodeBody)
    var idnOk = function(f) { return !c.partial && openF(f) && (gm || (own && f.vis === 'all' && (f.edit === 'owner' || c.making === 1 || c.unlocked === 1))); };   // the section's own rule, under the sheet's lock
    function block(list, cls, itemCls, ledger) {
        if (!Array.isArray(list) || !list.length) return;
        var box = el('div', cls);
        list.forEach(function(q) {
            var f = q && q.id ? byId[q.id] : null; if (!f) return;
            if (c.partial && !f.hover) return;
            var en = headerEntry(f, all[f.id]); if (!en) { if (ledger || f.kind !== 'toggle' || !idnOk(f)) return; en = { text: f.label }; }   // an off toggle shows as a chip only while on — unless it can be switched on here
            var it = el('div', itemCls + (f.vis === 'gm' ? ' sheet-gm' : ''));
            var lab = el('span', 'sheet-label', f.label); lab.title = f.key; it.appendChild(lab);
            var tone = en.neg ? ' sheet-hdr-neg' : en.pos ? ' sheet-hdr-pos' : '';
            if (ledger && f.kind === 'number' && !f.labels && !en.error && !c.partial && openF(f) && (gm || (own && f.vis === 'all' && (f.edit === 'owner' || c.making === 1 || c.unlocked === 1)))) {
                var raw = c.values ? c.values[f.id] : undefined;
                var inp = el('input', 'field sheet-num sheet-hdr-input' + tone); inp.type = 'number'; inp.dataset.fid = f.id; inp.dataset.part = 'hdr';
                inp.value = raw === undefined ? String(f.def) : String(raw); inp.step = String(f.step || 1); inp.title = f.label + (f.unit ? ' (' + f.unit + ')' : '');
                if (f.min !== undefined) inp.min = String(f.min); if (f.max !== undefined) inp.max = String(f.max);
                inp.addEventListener('change', function() { commit(c, f, Number(inp.value)); });
                var rawN = Number(inp.value); inp.className = inp.className.replace(/ sheet-hdr-(neg|pos)/g, '') + (rawN < 0 ? ' sheet-hdr-neg' : f.sign && rawN > 0 ? ' sheet-hdr-pos' : '');   // 5h: toned by the number the box shows
                var ed = el('span', 'sheet-hdr-val sheet-hdr-edit'); ed.appendChild(inp); if (f.unit) ed.appendChild(el('span', 'sheet-unit', f.unit));
                var eL = all[f.id]; if (eL && eL.mods && eL.mods.length) { var fbL = fxMark(eL); if (fbL) { fbL.textContent = '\u2192 ' + fmtNum(eL.value); ed.appendChild(fbL); } }   // 5h: the effective value beside the base
                it.appendChild(ed); box.appendChild(it); return;
            }
            if (!ledger && IDN_EDIT[f.kind] === 1 && !en.error && idnOk(f)) { it.appendChild(idnControl(f, c, all[f.id], tone)); box.appendChild(it); return; }   // Stage 6: changed right here, so the field needs no second copy
            var v = el('span', 'sheet-hdr-val' + (en.chip ? ' sheet-hdr-chip' : '') + (en.error ? ' sheet-err' : '') + tone + (en.empty ? ' sheet-hdr-empty' : ''), en.chip ? 'on' : en.text);
            v.title = en.error ? en.error : en.empty ? f.label + ': not set' : en.why ? en.text + '\n' + en.why : en.text;   // a long value is ellipsised in its box: the tooltip carries the whole of it (the error's reason when there is one)
            it.appendChild(v); box.appendChild(it);
        });
        if (box.childNodes.length) main.appendChild(box);
    }
    block(sh.identity, 'sheet-identity', 'sheet-identity-item', false);
    block(sh.ledger, 'sheet-ledger', 'sheet-ledger-fig', true);
}
// Stage 6 look fold (L3): an identity row edited in place — text, a select, a number (or its value names) and a toggle — for whoever may
// edit the field. data-part 'idn' keeps it apart from a section's copy for focus; the host judges every change (char-edit), as everywhere.
function idnControl(f, c, e, tone) {
    var raw = c.values ? c.values[f.id] : undefined, wrap = el('span', 'sheet-hdr-val sheet-hdr-edit sheet-idn-edit'), ctl;
    var named = f.kind === 'number' && Array.isArray(f.labels) && f.labels.length;
    if (f.kind === 'text') { ctl = el('input', 'field sheet-text sheet-idn-input'); ctl.type = 'text'; ctl.maxLength = f.max || 200; ctl.value = raw === undefined ? String(f.def || '') : String(raw); ctl.addEventListener('change', function() { commit(c, f, ctl.value); }); }
    else if (f.kind === 'select') { ctl = el('select', 'field sheet-select sheet-idn-input'); var sv = raw === undefined ? f.def : raw; (f.options || []).forEach(function(o) { ctl.appendChild(opt(o, o, sv === o)); }); ctl.addEventListener('change', function() { commit(c, f, ctl.value); }); }
    else if (f.kind === 'toggle') { ctl = el('input', 'sheet-idn-check'); ctl.type = 'checkbox'; ctl.checked = raw === undefined ? f.def === true : raw === true; ctl.addEventListener('change', function() { commit(c, f, ctl.checked); }); }
    else if (named) {
        ctl = el('select', 'field sheet-select sheet-idn-input'); var nv = raw === undefined ? f.def : raw;
        f.labels.forEach(function(nm, i) { ctl.appendChild(opt(String(i), nm, nv === i)); });
        if (typeof nv === 'number' && !(nv >= 0 && nv < f.labels.length && nv === Math.floor(nv))) { var xo = opt(String(nv), String(nv), true); xo.disabled = true; ctl.appendChild(xo); }   // a stored value past the names, as the section shows it
        ctl.addEventListener('change', function() { commit(c, f, Number(ctl.value)); });
    } else {
        ctl = el('input', 'field sheet-num sheet-idn-input' + tone); ctl.type = 'number'; ctl.value = raw === undefined ? String(f.def) : String(raw); ctl.step = String(f.step || 1);
        if (f.min !== undefined) ctl.min = String(f.min); if (f.max !== undefined) ctl.max = String(f.max);
        ctl.addEventListener('change', function() { commit(c, f, Number(ctl.value)); });
    }
    ctl.dataset.fid = f.id; ctl.dataset.part = 'idn'; ctl.title = f.label + (f.unit && f.kind === 'number' && !named ? ' (' + f.unit + ')' : '');
    wrap.appendChild(ctl);
    if (f.kind === 'number' && !named) { if (f.unit) wrap.appendChild(el('span', 'sheet-unit', f.unit)); if (e && e.mods && e.mods.length) { var fb = fxMark(e); if (fb) { fb.textContent = '\u2192 ' + fmtNum(e.value); wrap.appendChild(fb); } } }   // 5h: the effective value beside the base
    return wrap;
}
// Stage 5g: the text colour for a label on a filled accent (the open filled tab) — near-black or white, whichever reads better
function accentInk(hex) {
    var lin = function(i) { var v = parseInt(hex.substr(i, 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    var L = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
    return (L + 0.05) / 0.0567 >= 1.05 / (L + 0.05) ? '#111318' : '#ffffff';
}
// [systemcheck:palette-start]
// Stage 6 look fold (L1): a sheet palette remaps the theme's own variables on the sheet (and the panel around it), so every rule
// that already reads them — labels, values, inputs, edges, buttons, tiles, chips — takes the palette at once; absent, nothing is set
// and the sheet is exactly the theme's. Re-checked here: the live panel draws the campaign's raw system, so only a whole palette of
// plain hex colours ever reaches a style property.
var PAL_VARS = { text: ['--ink', '--text'], muted: ['--dim', '--muted'], panel: ['--panel2', '--surface'], card: ['--sheet-card'], field: ['--panel'], edge: ['--edge', '--border'], primary: ['--sheet-primary'], danger: ['--red', '--danger'], good: ['--green'], warn: ['--sheet-warn'] };
var PAL_ALL = ['--ink', '--text', '--dim', '--muted', '--panel2', '--surface', '--sheet-card', '--panel', '--edge', '--border', '--sheet-primary', '--sheet-primary-ink', '--red', '--danger', '--sheet-danger-ink', '--green', '--sheet-warn', '--gold', '--scroll', '--scroll-hover'];
function paletteOf(look) {
    var HEX = /^#[0-9a-fA-F]{6}$/, pal = look && look.palette && typeof look.palette === 'object' ? look.palette : null; if (!pal) return null;
    for (var k in PAL_VARS) if (Object.prototype.hasOwnProperty.call(PAL_VARS, k) && (typeof pal[k] !== 'string' || !HEX.test(pal[k]))) return null;
    return pal;
}
function applyPaletteTo(node, look) {
    var HEX = /^#[0-9a-fA-F]{6}$/, pal = paletteOf(look);
    PAL_ALL.forEach(function(v) { node.style.removeProperty(v); }); if (node.style.colorScheme) node.style.colorScheme = '';
    if (pal) {
        Object.keys(PAL_VARS).forEach(function(k) { PAL_VARS[k].forEach(function(v) { node.style.setProperty(v, pal[k]); }); });
        node.style.setProperty('--sheet-primary-ink', accentInk(pal.primary)); node.style.setProperty('--sheet-danger-ink', accentInk(pal.danger));
        node.style.setProperty('--gold', look && typeof look.accent === 'string' && HEX.test(look.accent) ? look.accent : pal.primary);   // hover and focus borders follow the palette under either theme
        var dark = accentInk(pal.panel) === '#ffffff'; node.style.colorScheme = dark ? 'dark' : 'light';
        node.style.setProperty('--scroll', dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.18)'); node.style.setProperty('--scroll-hover', dark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.32)');
    }
    node.classList.toggle('sheet-paletted', !!pal);
    return !!pal;
}
// [systemcheck:palette-end]
// The sheet's look on a container (the live body, the Layout preview, a pop-out): the palette now; later look options add their
// classes here. vctx = { campId, view, preview } — the options object a second view of the sheet extends.
function applyLook(body, look, vctx) {
    var L = look || {};
    body.classList.toggle('sheet-titles-accordion', L.titles === 'accordion'); body.classList.toggle('sheet-sticky-titles', L.sticky === true);   // Stage 6 look fold (L5)
    body.classList.toggle('sheet-fx-cards', L.effects === 'cards');   // L6
    body.classList.toggle('sheet-num-mono', L.numbers === 'mono'); body.classList.toggle('sheet-steppers-inside', L.steppers === 'inside');   // L8
    body.classList.toggle('sheet-values-boxed', L.values === 'boxed'); body.classList.toggle('sheet-rows-cards', L.rows === 'cards');
    applyPaletteTo(body, L);
}
// Stage 6 look fold: the palette presets in the System editor (never data: picking one writes its colours into the look)
var LOOK_PRESETS = {
    graphite: { name: 'Graphite', accent: '#ab94b3', font: 'inter', palette: { text: '#add8e6', muted: '#8c8c8c', panel: '#1a1a1a', card: '#212121', field: '#1a1a1a', edge: '#333333', primary: '#add8e6', danger: '#cc3333', good: '#4ade80', warn: '#f59e0b' } },
    parchment: { name: 'Parchment', accent: '#7a2e1f', palette: { text: '#2b2118', muted: '#6b5a48', panel: '#f3ead6', card: '#e8dcc0', field: '#fbf6ea', edge: '#c4b393', primary: '#7a2e1f', danger: '#a3261b', good: '#2f7a3b', warn: '#9a6410' } }
};
var PAL_CAPS = { text: 'Text', muted: 'Muted', panel: 'Panel', card: 'Card', field: 'Field', edge: 'Edge', primary: 'Primary', danger: 'Danger', good: 'Good', warn: 'Warning' };
// Stage 6 look fold (L2): an icon on the sheet — a bundled glyph drawn as a mask in the text's colour (so a palette or a theme colours it),
// or text (an emoji or a symbol, as always). The URL is built ONLY from glyphPath's answer, a value from the fixed table, never from the
// stored string. Path-absolute, so the panel, the preview and a pop-out resolve it alike.
var GLYPH_BASE = '/assets/icons/fa/';
function iconNode(v, cls) {
    var p = glyphPath(v); if (!p) return el('span', cls, v);
    var s = el('span', cls + ' wp-glyph'); s.setAttribute('aria-hidden', 'true');
    var u = 'url("' + GLYPH_BASE + p + '.svg")'; s.style.webkitMaskImage = u; s.style.maskImage = u;
    return s;
}
function iconText(v) { return glyphPath(v) ? '' : (v || ''); }   // text-only sinks (an <option>): a glyph shows nothing there
// The System editor's icon picker: two tabs, the bundled icons and common emoji (an emoji is stored as typed, as always)
var PICKER_HIDE = { 'minus-circle': 1, 'file-magnifying-glass': 1 };   // duplicates of circle-minus and magnifying-glass (still accepted)
var GLYPH_WORDS = { sword: ['khanda'], blade: ['khanda'], weapon: ['khanda', 'hand-fist', 'crosshairs', 'bomb'], attack: ['hand-fist', 'crosshairs', 'burst'], spell: ['wand-magic-sparkles', 'wand-sparkles', 'scroll', 'hat-wizard', 'hand-sparkles'], magic: ['wand-magic-sparkles', 'wand-sparkles', 'hat-wizard', 'hand-sparkles'], hp: ['heart', 'heart-pulse'], health: ['heart', 'heart-pulse', 'shield-heart', 'stethoscope'], damage: ['burst', 'bomb', 'skull'], armour: ['shield', 'shield-halved'], armor: ['shield', 'shield-halved'], defence: ['shield', 'shield-halved'], defense: ['shield', 'shield-halved'], money: ['coins', 'wallet', 'gem'], gold: ['coins', 'crown'], coin: ['coins'], rest: ['moon', 'bed', 'campground'], sleep: ['bed', 'moon'], speed: ['person-running', 'shoe-prints'], move: ['person-running', 'person-walking', 'shoe-prints'], time: ['hourglass-half', 'clock', 'stopwatch'], duration: ['hourglass-half', 'clock'], dice: ['dice', 'dice-d20', 'dice-d6'], roll: ['dice', 'dice-d20', 'dice-d6'], death: ['skull', 'skull-crossbones'], poison: ['skull-crossbones', 'flask'], potion: ['flask'], alchemy: ['flask'], lore: ['book', 'book-open', 'scroll', 'book-skull'], dungeon: ['dungeon'], beast: ['paw', 'dragon'], animal: ['paw'], nature: ['leaf'], camp: ['campground'], treasure: ['gem', 'coins', 'crown', 'ring'], jewel: ['gem', 'ring'], king: ['crown'], noble: ['crown'], track: ['shoe-prints'], write: ['feather-pointed', 'pen', 'pencil'], quill: ['feather-pointed'], droid: ['robot', 'microchip'], tech: ['microchip', 'gear'], vehicle: ['car', 'truck', 'rocket', 'ship'], energy: ['bolt'], fatigue: ['bolt'], mind: ['brain'], perception: ['eye'], sight: ['eye', 'glasses'], skill: ['graduation-cap'], weight: ['weight-hanging', 'scale-balanced'], load: ['weight-hanging'], fist: ['hand-fist'], unarmed: ['hand-fist'], target: ['crosshairs', 'bullseye'], aim: ['crosshairs', 'bullseye'], fire: ['fire'], cold: ['temperature-half'], luck: ['star', 'dice'] };
var EMOJI_SET = [
    ['\u2694\uFE0F', 'swords weapon fight attack melee'], ['\uD83D\uDDE1\uFE0F', 'dagger knife blade weapon'], ['\uD83C\uDFF9', 'bow arrow ranged weapon'], ['\uD83E\uDE93', 'axe weapon'], ['\uD83D\uDD28', 'hammer weapon tool'], ['\uD83D\uDD2B', 'pistol blaster gun ranged weapon'],
    ['\uD83D\uDCA3', 'bomb explosive grenade damage'], ['\uD83D\uDEE1\uFE0F', 'shield armour armor defence defense'], ['\uD83E\uDE96', 'helmet armour armor'], ['\u2764\uFE0F', 'heart hp health life'], ['\uD83D\uDC94', 'broken heart wound injury'], ['\uD83E\uDE78', 'blood bleeding wound'],
    ['\uD83E\uDE79', 'bandage heal first aid'], ['\uD83D\uDC8A', 'pill medicine drug'], ['\u2695\uFE0F', 'medicine heal medic'], ['\u26A1', 'bolt energy lightning fatigue'], ['\u2728', 'sparkles magic spell'], ['\uD83D\uDD2E', 'crystal ball magic scry divination'],
    ['\uD83E\uDE84', 'wand magic spell'], ['\uD83D\uDCDC', 'scroll spell document lore'], ['\uD83D\uDCD6', 'book lore knowledge'], ['\uD83C\uDFB2', 'dice roll luck'], ['\uD83C\uDFAF', 'target aim bullseye'], ['\uD83E\uDDEA', 'potion flask alchemy'],
    ['\u2620\uFE0F', 'skull crossbones poison death'], ['\uD83D\uDC80', 'skull death undead'], ['\uD83D\uDD25', 'fire burn flame'], ['\u2744\uFE0F', 'ice cold frost'], ['\uD83D\uDCA7', 'water drop'], ['\uD83C\uDF2A\uFE0F', 'wind storm tornado'],
    ['\uD83C\uDF19', 'moon night rest'], ['\u2600\uFE0F', 'sun day light'], ['\u2B50', 'star favour inspiration'], ['\uD83C\uDF40', 'clover luck'], ['\uD83C\uDF92', 'backpack bag gear inventory'], ['\uD83D\uDCB0', 'money bag gold coins treasure'],
    ['\uD83E\uDE99', 'coin money'], ['\uD83D\uDC8E', 'gem jewel treasure'], ['\uD83D\uDC51', 'crown king noble'], ['\uD83D\uDC8D', 'ring jewellery jewelry'], ['\uD83D\uDDDD\uFE0F', 'key lock'], ['\uD83D\uDD12', 'lock locked'],
    ['\uD83C\uDFF0', 'castle keep'], ['\u26FA', 'tent camp rest'], ['\uD83D\uDDFA\uFE0F', 'map travel'], ['\uD83E\uDDED', 'compass navigation'], ['\uD83D\uDC09', 'dragon beast'], ['\uD83D\uDC3A', 'wolf beast animal'],
    ['\uD83D\uDC0E', 'horse mount'], ['\uD83E\uDDE0', 'brain mind intelligence'], ['\uD83D\uDC41\uFE0F', 'eye perception sight'], ['\uD83D\uDC42', 'ear hearing'], ['\uD83C\uDFC3', 'runner speed move'], ['\uD83E\uDDB6', 'foot move'],
    ['\u270A', 'fist punch unarmed'], ['\uD83E\uDD3A', 'fencer fencing'], ['\uD83E\uDDD8', 'meditation focus will'], ['\uD83C\uDFAD', 'masks theatre charisma'], ['\uD83C\uDFB5', 'music song bard'], ['\u2696\uFE0F', 'scales balance law'],
    ['\u262F\uFE0F', 'balance alignment'], ['\uD83D\uDD6F\uFE0F', 'candle light'], ['\uD83C\uDF56', 'food ration meat'], ['\uD83C\uDF7A', 'drink ale'], ['\u23F3', 'hourglass time duration'], ['\u2699\uFE0F', 'gear settings tech'],
    ['\uD83D\uDD27', 'wrench repair tool'], ['\uD83E\uDD16', 'robot droid'], ['\uD83D\uDE80', 'rocket ship space'], ['\uD83E\uDDEC', 'dna species biology'], ['\uD83D\uDCCD', 'pin location']
];
// [systemcheck:pins-start]
// Stage 6 look fold (L4): a viewer's pins — which band groups they keep on the band, per campaign and per character, on their own machine
// (never on the wire). { "c:<campId>": { "<charId>": { "<groupId>": 1 | 0 } } }; every read re-checks the shape (the prefs mirror is
// another source), and the stores are capped: 16 groups a character, 60 characters a campaign, 40 campaigns.
var PIN_KEY = 'wp_sheetPins', PIN_GID = /^g_[A-Za-z0-9_]{1,24}$/, PIN_CHAR = /^c_[A-Za-z0-9_]{1,24}$/;
function pinStore() { try { var o = JSON.parse(pref(PIN_KEY, '{}')); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; } catch (e) { return {}; } }
function pinCamp(id) { return (typeof id === 'string' && id.length <= 80 && !/[\u0000-\u001f]/.test(id)) ? 'c:' + id : 'c:'; }   // the "c:" prefix: never a prototype name
function pinState(campId, charId) {
    var out = Object.create(null); if (typeof charId !== 'string' || !PIN_CHAR.test(charId)) return out;
    var camp = pinStore()[pinCamp(campId)]; if (!camp || typeof camp !== 'object' || Array.isArray(camp) || !Object.prototype.hasOwnProperty.call(camp, charId)) return out;
    var raw = camp[charId]; if (raw && typeof raw === 'object' && !Array.isArray(raw)) Object.keys(raw).slice(0, 16).forEach(function(g) { if (PIN_GID.test(g) && (raw[g] === 1 || raw[g] === 0)) out[g] = raw[g]; });
    return out;
}
function isPinned(campId, charId, gid) { return pinState(campId, charId)[gid] === 1; }   // hidden until pinned, as the reference website
function setPinned(campId, charId, gid, on) {
    if (typeof gid !== 'string' || !PIN_GID.test(gid) || typeof charId !== 'string' || !PIN_CHAR.test(charId)) return;
    var all = pinStore(), k = pinCamp(campId), camp = (all[k] && typeof all[k] === 'object' && !Array.isArray(all[k])) ? all[k] : {}, cur = pinState(campId, charId), next = {};
    Object.keys(cur).forEach(function(g) { if (g !== gid) next[g] = cur[g]; }); next[gid] = on ? 1 : 0;
    var gk = Object.keys(next); gk.slice(0, Math.max(0, gk.length - 16)).forEach(function(g) { delete next[g]; });
    var nc = {}; Object.keys(camp).forEach(function(cid) { if (PIN_CHAR.test(cid) && cid !== charId) nc[cid] = camp[cid]; }); nc[charId] = next;   // this character last: the oldest fall away first
    var ck = Object.keys(nc); ck.slice(0, Math.max(0, ck.length - 60)).forEach(function(cid) { delete nc[cid]; });
    delete all[k]; all[k] = nc;
    var cs = Object.keys(all); cs.slice(0, Math.max(0, cs.length - 40)).forEach(function(c0) { delete all[c0]; });
    setPref(PIN_KEY, JSON.stringify(all));
}
// A group shows on the band when its viewer pinned it — and always in the Layout preview, and always when it has no Pin button anywhere
function groupShown(g, targets, vctx, charId) { return !!(vctx && vctx.preview) || targets[g.id] !== 1 || isPinned(vctx && vctx.campId, charId, g.id); }
// [systemcheck:pins-end]
// A Pin button: pinning (or unpinning) redraws the sheet without moving what the viewer is looking at — the button that was clicked stays
// where it was (for the band's own unpin, which goes away, the first section under the frame does)
function pinToggle(g, ctx, btn) {
    if (!g || !ctx || !ctx.c || (ctx.vctx && ctx.vctx.preview) || !PIN_GID.test(g.id)) return;
    var body = ctx.body, inBand = !!btn.closest('.sheet-band'), where = inBand ? 'band' : btn.closest('.sheet-sec-title') ? 'head' : 'sec';
    var anchor0 = inBand ? body.querySelector(':scope > .sheet-section') : btn, top0 = anchor0 ? anchor0.getBoundingClientRect().top : null;
    setPinned(ctx.vctx && ctx.vctx.campId, ctx.c.id, g.id, !isPinned(ctx.vctx && ctx.vctx.campId, ctx.c.id, g.id));
    (ctx.rerender || renderSheet)();
    if (!(ctx.vctx && ctx.vctx.preview)) renderViews(ctx.c.id, ctx.body);   // HUD frame (HF2a): the sheet and the HUDs of this character follow
    var sel = '[data-pin="' + g.id + '"]', pre = where === 'head' ? '.sheet-sec-title ' : '.sheet-section .sheet-field ';
    var nb = inBand ? body.querySelector(':scope > .sheet-section') : (body.querySelector(pre + sel) || body.querySelector(sel));
    if (nb && top0 !== null) { body.scrollTop += nb.getBoundingClientRect().top - top0; syncFramePad(body); }
    var fb = inBand ? null : (body.querySelector(pre + sel) || body.querySelector(sel)); if (fb) { try { fb.focus({ preventScroll: true }); } catch (er) {} }
}
function pinOn(g, ctx) { return !(ctx.vctx && ctx.vctx.preview) && isPinned(ctx.vctx && ctx.vctx.campId, ctx.c.id, g.id); }
function pinNode(pl, g, ctx) {   // the Pin placement: a button beside the figures it pins
    if (!g) return null;
    var on = pinOn(g, ctx), b = el('button', 'tool sheet-pin'); b.type = 'button'; b.dataset.pin = g.id; b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.appendChild(iconNode(on ? 'icon:thumbtack-slash' : 'icon:thumbtack', 'sheet-pin-icon')); b.appendChild(el('span', 'sheet-pin-label', pl.text || ((on ? 'Unpin ' : 'Pin ') + g.label)));
    b.title = on ? 'Take ' + g.label + ' off the band' : 'Keep ' + g.label + ' on the band while you scroll';
    b.addEventListener('click', function(e) { e.preventDefault(); pinToggle(g, ctx, b); });
    var box = el('div', 'sheet-field sheet-kind-pin'); box.appendChild(b); return box;
}
function pinChip(g, ctx) {   // a Pin in a section's header (like a handbook chip: it never folds the section)
    if (!g) return null;
    var on = pinOn(g, ctx), ch = el('span', 'sheet-sec-chip sheet-sec-pin'); ch.setAttribute('role', 'button'); ch.tabIndex = 0; ch.dataset.pin = g.id; ch.setAttribute('aria-pressed', on ? 'true' : 'false');
    ch.title = on ? 'Take ' + g.label + ' off the band' : 'Keep ' + g.label + ' on the band while you scroll';
    ch.appendChild(iconNode(on ? 'icon:thumbtack-slash' : 'icon:thumbtack', 'sheet-chip-ico')); ch.appendChild(el('span', 'sheet-chip-txt', (on ? 'Unpin ' : 'Pin ') + g.label));
    var go = function(e) { e.preventDefault(); e.stopPropagation(); if (ch.closest('#systemModal')) return; pinToggle(g, ctx, ch); };
    ch.addEventListener('click', go); ch.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') go(e); });
    return ch;
}
// HUD frame (HF4b, H13): a section's Reset all — a chip in its header (its own words, e.g. Long rest) that fills the section's pools back to full
// and sets its counters back to their start, as ONE change (commitMany). Live only on the real sheet or HUD (decided when drawn, as the dial is),
// inert when there is nothing to reset; null when the section places no pool and no counter
function resetChip(sec, ctx) {
    var who = { gm: ctx.gm, own: ctx.own }, rt = resetTargets(ctx.sys, ctx.c, sec, F(), who); if (!rt.any) return null;
    var live = _fxLive && !(ctx.vctx && ctx.vctx.preview) && !window.wpPopout, targets = rt.targets, barred = typeof fillBarred === 'function' && fillBarred(), on = live && targets.length > 0 && !barred;   // K5b: the GM fills pools at this table
    var ch = el('span', 'sheet-sec-chip sheet-sec-reset'); ch.setAttribute('role', 'button'); ch.tabIndex = 0; ch.dataset.reset = sec.id; ch.setAttribute('aria-disabled', on ? 'false' : 'true');   // focusable even when inert (it says why); data-reset keeps the focus across a redraw
    ch.appendChild(iconNode('icon:rotate-left', 'sheet-chip-ico')); ch.appendChild(el('span', 'sheet-chip-txt', sec.resetText || 'Reset all'));
    ch.title = !live ? 'Resets this section\u2019s pools and counters (on the sheet itself)' : barred ? 'The GM resets pools at this table' : !rt.allowed ? 'Only the GM resets these' : targets.length ? 'Resets ' + targets.map(function(t) { return t.label; }).join(', ') : 'Nothing to reset: every pool is full and every counter at its start';
    var go = function(e) {
        e.preventDefault(); e.stopPropagation(); if (!on || ch.closest('#systemModal')) return;
        sec.fields.forEach(function(pl) { var pk = pl && typeof pl.id === 'string' ? ctx.c.id + '|' + pl.id : ''; if (pk && _stepPend[pk]) { clearTimeout(_stepPend[pk].timer); delete _stepPend[pk]; } });   // the reset is the later action: a minus/plus burst still waiting on this section's counters is dropped
        var now = resetTargets(ctx.sys, ctx.c, sec, F(), who).targets;   // worked out again at the click
        if (now.length) commitMany(ctx.c, now.map(function(t) { return { fieldId: t.fieldId, value: t.value }; })); else renderViews(ctx.c.id);
    };
    ch.addEventListener('click', go); ch.addEventListener('keydown', function(e) { if (e.key === 'Enter' || e.key === ' ') go(e); });
    return ch;
}
// Stage 5c / Stage 6 (L4): the pinned band — built by the same node factories as a section (a field's rights, its −/+ and its roll behave as
// they do below; data-band tells the copies apart for focus). An entry of a group shows while its viewer has the group pinned (or the group
// has no Pin anywhere); a band with no groups is exactly what it was.
function bandInto(frame, bandDef, ctx) {
    if (!bandDef || !bandDef.length) return;
    var c = ctx.c, all = ctx.all, gm = ctx.gm, own = ctx.own, sys = ctx.sys, byId = ctx.byId, rollById = ctx.rollById;
    var bandEl = el('div', 'sheet-band'), boxes = {};
    var lkB = (sys && sys.sheet && sys.sheet.look) || {}; if (lkB.band === 'inline') bandEl.classList.add('sheet-band-inline'); else if (lkB.band === 'chips') bandEl.classList.add('sheet-band-chips');   // Stage 6 look fold (L8)
    bandDef.forEach(function(q) {
        var g = typeof q.g === 'string' && PIN_GID.test(q.g) && Object.prototype.hasOwnProperty.call(ctx.grpById, q.g) ? ctx.grpById[q.g] : null;
        if (g && !groupShown(g, ctx.targets, ctx.vctx, c.id)) return;
        var node = (q.id && byId[q.id]) ? fieldNode(byId[q.id], c, all[q.id], gm, own, sys) : (q.roll && rollById[q.roll]) ? rollNode(rollById[q.roll], c, sys, all.vars) : null;
        if (!node) return;
        node.classList.add('sheet-band-item'); node.classList.remove('sheet-tile');   // the band has its own compact look; a stat tile's column layout (and hidden bar) would out-specify it
        node.querySelectorAll('[data-fid]').forEach(function(x) { x.dataset.band = '1'; });
        if (!g) { bandEl.appendChild(node); return; }
        var box = boxes[g.id]; if (!box) { box = boxes[g.id] = el('div', 'sheet-band-grp'); box.dataset.g = g.id; bandEl.appendChild(box); }
        box.appendChild(node);
    });
    Object.keys(boxes).forEach(function(gid) {   // a pinned group can be unpinned right there (only one that has a Pin to put it back with)
        if (ctx.targets[gid] !== 1 || (ctx.vctx && ctx.vctx.preview)) return;
        var g = ctx.grpById[gid], ub = el('button', 'tool ghost sheet-band-unpin'); ub.type = 'button'; ub.dataset.pin = gid; ub.title = 'Unpin ' + g.label; ub.appendChild(iconNode('icon:thumbtack-slash', 'sheet-pin-icon'));
        ub.addEventListener('click', function(e) { e.preventDefault(); pinToggle(g, ctx, ub); }); boxes[gid].appendChild(ub);
    });
    if (bandEl.childNodes.length) frame.appendChild(bandEl);
}
var _glyphPop = null;
function closeGlyphPicker() { if (_glyphPop) { _glyphPop.remove(); _glyphPop = null; document.removeEventListener('mousedown', glyphOutside, true); } }
function glyphOutside(e) { if (_glyphPop && !_glyphPop.contains(e.target) && !(e.target.closest && e.target.closest('.sys-glyph-btn'))) closeGlyphPicker(); }
// The picker's button, right after an icon box: it shows the box's current icon, so it doubles as the preview
function glyphButton(inp) {
    var b = el('button', 'tool ghost sys-btn sys-glyph-btn'); b.type = 'button'; b.title = 'Pick an icon (or type an emoji)';
    var paint = function() { b.textContent = ''; var v = inp.value.trim(); b.appendChild(v ? iconNode(v, 'sys-glyph-cur') : el('span', 'sys-glyph-cur', '\u2026')); };
    paint();
    b.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); glyphPicker(inp, b, paint); });
    inp.addEventListener('input', paint);
    return b;
}
function glyphPicker(inp, anchor, repaint) {
    closeGlyphPicker();
    var host = ui('systemModal') || document.body, pop = el('div', 'sys-glyph-pop'); _glyphPop = pop;
    var tabsRow = el('div', 'sys-glyph-tabs'), tIcons = el('button', 'tool ghost sys-btn sys-glyph-tab', 'Icons'), tEmoji = el('button', 'tool ghost sys-btn sys-glyph-tab', 'Emoji');
    tIcons.type = 'button'; tEmoji.type = 'button'; tabsRow.appendChild(tIcons); tabsRow.appendChild(tEmoji); pop.appendChild(tabsRow);
    var q = el('input', 'field sys-glyph-q'); q.type = 'text'; q.spellcheck = false; q.autocomplete = 'off'; pop.appendChild(q);
    var grid = el('div', 'sys-glyph-grid'); pop.appendChild(grid);
    var none = el('button', 'tool ghost sys-btn sys-glyph-none', 'No icon'); none.type = 'button'; pop.appendChild(none);
    var mode = 'icons';
    var pick = function(val) { inp.value = val; inp.dispatchEvent(new Event('input', { bubbles: true })); if (repaint) repaint(); closeGlyphPicker(); try { inp.focus(); } catch (er) {} };   // the editor's own input handlers store it
    var matches = function() {
        var s = q.value.trim().toLowerCase();
        if (mode === 'emoji') return EMOJI_SET.filter(function(x) { return !s || x[1].indexOf(s) >= 0 || x[0] === s; }).map(function(x) { return { v: x[0], t: x[1].split(' ')[0] }; });
        var all = Object.keys(GLYPHS).filter(function(n) { return !PICKER_HIDE[n]; }).sort(); if (!s) return all.map(function(n) { return { v: 'icon:' + n, t: n }; });
        var hit = {}; all.forEach(function(n) { if (n.indexOf(s) >= 0) hit[n] = 1; });
        Object.keys(GLYPH_WORDS).forEach(function(w) { if (w.indexOf(s) === 0) GLYPH_WORDS[w].forEach(function(n) { if (typeof GLYPHS[n] === 'string') hit[n] = 1; }); });
        return all.filter(function(n) { return hit[n] === 1; }).map(function(n) { return { v: 'icon:' + n, t: n }; });
    };
    var draw = function() {
        grid.textContent = ''; var list = matches();
        list.forEach(function(m) { var o = el('button', 'tool ghost sys-glyph-opt'); o.type = 'button'; o.title = m.t; o.appendChild(mode === 'emoji' ? el('span', 'sys-glyph-emoji', m.v) : iconNode(m.v, 'sys-glyph-ico')); o.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); pick(m.v); }); grid.appendChild(o); });
        if (!list.length) grid.appendChild(el('div', 'sys-hint', 'Nothing matches.'));
    };
    var setMode = function(mo) { mode = mo; tIcons.classList.toggle('on', mo === 'icons'); tEmoji.classList.toggle('on', mo === 'emoji'); q.placeholder = mo === 'emoji' ? 'Search emoji' : 'Search icons'; draw(); };
    tIcons.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); setMode('icons'); try { q.focus(); } catch (er) {} });
    tEmoji.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); setMode('emoji'); try { q.focus(); } catch (er) {} });
    none.addEventListener('click', function(e) { e.preventDefault(); e.stopPropagation(); pick(''); });
    q.addEventListener('input', function(e) { e.stopPropagation(); draw(); }); q.addEventListener('change', function(e) { e.stopPropagation(); });   // never read as an edit by the editor's delegated handlers
    pop.addEventListener('keydown', function(e) {   // the editor closes on Escape: the picker keeps its keys to itself
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeGlyphPicker(); try { anchor.focus(); } catch (er) {} }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); var first = matches()[0]; if (first) pick(first.v); }
    });
    pop.addEventListener('click', function(e) { e.stopPropagation(); }); pop.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    var cur = inp.value.trim(); setMode(!cur || /^icon:/i.test(cur) ? 'icons' : 'emoji');
    host.appendChild(pop);
    var r = anchor.getBoundingClientRect(); pop.style.left = Math.max(8, Math.min(window.innerWidth - 340, r.left)) + 'px'; pop.style.top = Math.max(8, Math.min(window.innerHeight - 340, r.bottom + 4)) + 'px';
    document.addEventListener('mousedown', glyphOutside, true);
    try { q.focus(); } catch (er) {}
}
function buildSections(body, sys, c, all, gm, own, rerender, vctx) {   // rerender: the caller's own render fn (renderSheet for the live panel, renderPreview for the Layout preview) so a tab click repaints THIS container, not the wrong one
    var previewV = !!(vctx && vctx.preview);   // Stage 6 HUD C8: the Layout preview draws a part whose show-if is false, dimmed (the sheet leaves it out)
    var hudV = !!(vctx && vctx.view === 'hud'); _fxView = hudV ? 'hud' : 'sheet';   // Stage 6 HUD frame (HF1): which view this draws (sys is then hudView's projection)
    _lockNow = viewLocked(c, vctx);   // the sheet's lock: the HUD always, the sheet until Edit sheet
    var printV = !!(vctx && vctx.print);   // Onboarding F2b: printed — every tab in turn, every section open, nothing that only works on screen
    var sheet = (hudV || (sys.sheet && sys.sheet.sections && sys.sheet.sections.length)) ? sys.sheet : autoLayout(sys);   // the HUD has no automatic layout of its own
    var layout = sheet.sections || [];
    var tabs = (sheet.tabs && sheet.tabs.length) ? sheet.tabs : null;   // the auto layout has no tabs
    var byId = {}; sys.fields.forEach(function(f) { byId[f.id] = f; }); var rollById = {}; sys.rolls.forEach(function(r) { rollById[r.id] = r; });
    _rfClearing = true; try { body.textContent = ''; } finally { _rfClearing = false; }   // F4c2 review: clearing blurs a focused box — its change must not commit half-typed (the form keeps it)
    _fxView = hudV ? 'hud' : 'sheet'; _lockNow = viewLocked(c, vctx);   // ...and a redraw that blur started (another view) leaves this one's view, and its lock, as they were
    body.classList.toggle('sheet-locked', _lockNow);   // a stat that needs Edit sheet reads as a value, not as a greyed box (style.css)
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
    var grpById = {}; ((sys.sheet && Array.isArray(sys.sheet.bandGroups)) ? sys.sheet.bandGroups : []).forEach(function(g) { if (g && typeof g.id === 'string' && PIN_GID.test(g.id)) grpById[g.id] = g; });   // Stage 6: band groups (built even with no band: a Pin in a section still draws)
    var pctx = { byId: byId, rollById: rollById, c: c, all: all, gm: gm, own: own, sys: sys, grpById: grpById, targets: (vctx && vctx.targets) || pinTargetsAll(sys.sheet), vctx: vctx, rerender: rerender, body: body };   // the targets: the Pins in the layout actually drawn (the automatic one has none, so every group shows)
    bandInto(frame, bandDef, pctx);
    var tabIds = tabs ? tabs.map(function(t) { return t.id; }) : null;
    var active = '', stripEl = null;   // active tab lives on the container (body.dataset.wpTab) so the live sheet and the builder preview never bleed into each other; the strip is appended after the dashboard sections
    if (tabs && !printV) {
        active = body.dataset.wpTab || '';
        if (tabIds.indexOf(active) < 0) { active = tabIds[0]; body.dataset.wpTab = active; }
        var strip = el('div', 'sheet-tabs' + (look.tabs === 'filled' ? ' sheet-tabs-filled' : ''));   // Stage 5g: angled tabs, the open one filled in the accent
        if (look.tabs === 'angular') strip.classList.add('sheet-tabs-angular');   // Stage 6 look fold (L5): cut-corner tabs across the strip
        tabs.forEach(function(t) {
            var tb = el('button', 'sheet-tab' + (t.id === active ? ' active' : '')); if (look.tabs === 'filled' || look.tabs === 'angular') tb.title = t.label || 'Tab';   // a filled or angular tab can ellipsise a long label
            if (t.icon) tb.appendChild(iconNode(t.icon, 'sheet-tab-icon'));   // Stage 5g (Stage 6: or a bundled glyph)
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
        var secOff = !!sec.showIf && !showsIf(sec.showIf, all.vars, F());   // Stage 6 HUD C8: its show-if is false for this character
        if (secOff && !previewV) return null;
        var collap = !!sec.collapsible && !printV;   // printed: open (and never written back to the live sheet's memory)
        var s = el(collap ? 'details' : 'div', 'sheet-section' + (collap ? ' sheet-collap' : '') + (isChild ? ' sheet-subsection' : '') + (sec.inline === true ? ' sheet-inline' : ''));
        var secKey = (hudV ? 'h:' : '') + sec.id;   // HF1: remembered per view (sheet keys unchanged)
        if (collap) { s.open = (secKey in _secOpen) ? _secOpen[secKey] : (sec.open !== false); s.addEventListener('toggle', function () { _secOpen[secKey] = s.open; }); }
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
        var chipNode = sec.chip ? pageChip(sec.chip, c) : null;   // Stage 5f: a handbook chip
        var pinCh = !printV && sec.pin && Object.prototype.hasOwnProperty.call(grpById, sec.pin) ? pinChip(grpById[sec.pin], pctx) : null;   // Stage 6: a band group's Pin in the header
        var rsCh = !printV && sec.resetAll === true ? resetChip(sec, pctx) : null;   // HUD frame (HF4b): its Reset all
        if (sec.title || sec.icon || metaText || collap || chipNode || pinCh || rsCh) {   // a collapsible section always needs a summary to toggle from
            var head = el(collap ? 'summary' : 'div', 'sheet-sec-title');
            if (sec.icon) head.appendChild(iconNode(sec.icon, 'sheet-sec-icon'));   // Stage 5g (Stage 6: or a bundled glyph)
            var nameSpan = el('span', 'sheet-sec-name', sec.title || ''); if (sec.style && sec.style.accent) nameSpan.style.color = sec.style.accent;
            head.appendChild(nameSpan);
            if (metaText) head.appendChild(el('span', 'sheet-sec-meta', metaText));
            if (chipNode) head.appendChild(chipNode);
            if (pinCh) head.appendChild(pinCh);
            if (rsCh) head.appendChild(rsCh);
            s.appendChild(head);
        }
        var grid = el('div', 'sheet-grid'); grid.style.gridTemplateColumns = 'repeat(' + Math.max(1, Math.min(4, sec.cols || 1)) + ', minmax(0, 1fr))';
        (sec.fields || []).forEach(function(pl, pli) {
            var plOff = !!pl.showIf && !showsIf(pl.showIf, all.vars, F());   // C8: a placement's own show-if
            if (plOff && !previewV) return;
            var node = null;
            if (pl.id && byId[pl.id]) node = fieldNode(byId[pl.id], c, all[pl.id], gm, own, sys, all.vars, pl);   // pl (F4b): an item list's "only switched on"
            else if (pl.roll && rollById[pl.roll]) node = rollNode(rollById[pl.roll], c, sys, all.vars);
            else if (pl.kind === 'heading') node = el('div', 'sheet-heading', pl.text || '');
            else if (pl.kind === 'text') node = pl.text && pl.text.trim() ? el('div', 'sheet-ruletext', pl.text) : null;   // Stage 6 HUD H11: rules text, as text
            else if (pl.kind === 'roller') node = printV ? null : rollerNode(pl, c, hbKey(vctx, c, sec, pli));   // Stage 6 HUD H9
            else if (pl.kind === 'divider') node = el('div', 'sheet-divider');
            else if (pl.kind === 'link') node = linkNode(pl, c);   // Stage 5f
            else if (pl.kind === 'search') node = printV ? null : hbNode(hbKey(vctx, c, sec, pli));   // Stage 6 HUD H12
            else if (pl.kind === 'hud') node = printV ? null : hudButton(pl, c, sys, vctx);   // HUD frame (HF2b): opens this character's HUD
            else if (pl.kind === 'facing') node = printV && vctx.noToken ? null : facingNode(c, gm);   // 5h Fold 3
            else if (pl.kind === 'stance') node = printV && vctx.noToken ? null : stanceNode(c, gm);   // Stage 6
            else if (pl.kind === 'pin') node = !printV && pl.g && Object.prototype.hasOwnProperty.call(grpById, pl.g) ? pinNode(pl, grpById[pl.g], pctx) : null;   // Stage 6: a band group's Pin button
            else if (pl.kind === 'portrait') { node = el('div', 'sheet-portrait-slot'); if (c.portrait) { var im = el('img'); im.src = imgSrc(c.portrait); im.alt = ''; node.appendChild(im); } }
            if (!node) return;
            if (sec.inline === true && pl.id && byId[pl.id]) inlineRow(node, byId[pl.id]);   // HUD frame (HF4a, H2)
            if (pl.w === 'row') node.classList.add('sheet-row');
            if (plOff) node.classList.add('sheet-showif-off');
            grid.appendChild(node);
        });
        var hasOwn = Array.prototype.some.call(grid.childNodes, function(n) { return !n.hidden; });   // 5h: a player's dial with facing off is a hidden placeholder
        if (hasOwn) s.appendChild(grid);
        var kids = 0;
        if (!isChild && children[sec.id]) children[sec.id].forEach(function(ch) { var ce = renderOneSection(ch, true); if (ce) { s.appendChild(ce); kids++; } });   // sub-sections after the parent's own fields
        if (secOff) s.classList.add('sheet-showif-off');
        return (hasOwn || kids) ? s : null;
    }
    (printV && tabs ? tabs : [null]).forEach(function(pt) {   // Onboarding F2b: printed, each tab in turn under its own heading (a tab with nothing drawn has none)
        var tabHead = null, had = 0;
        if (pt) { tabHead = el('div', 'sheet-print-tab'); if (pt.icon) tabHead.appendChild(iconNode(pt.icon, 'sheet-tab-icon')); tabHead.appendChild(el('span', 'sheet-tab-label', pt.label || 'Tab')); }
        var want = pt ? pt.id : active;
    layout.forEach(function(sec) {
        if (sec.pinned || childParent(sec)) return;   // a dashboard section (already above the strip) or a sub-section (rendered under its parent)
        if (tabs) { var stab = (sec.tab && tabIds.indexOf(sec.tab) >= 0) ? sec.tab : tabIds[0]; if (stab !== want) return; }   // untabbed/unknown → first tab
        var secEl = renderOneSection(sec, false);
        if (secEl) { if (tabHead && !had) body.appendChild(tabHead); body.appendChild(secEl); secN++; tabN++; had++; }
    });
    });
    applyLook(body, look, vctx);   // Stage 6 look fold
    syncFramePad(body);
    if (tabs ? !tabN : !secN) { var emT = tabs ? 'Nothing on this tab yet.' : hudV ? (((sheet.band && sheet.band.length) || (sheet.ledger && sheet.ledger.length)) ? '' : 'Nothing in this view yet.') : (sys.fields.length ? 'Nothing placed on the sheet yet.' : 'The system has no fields yet. Open the System editor.'); if (emT) body.appendChild(el('div', 'sys-empty', emT)); }   // HF1: a band-only HUD shows no empty text under its chips
}
/* ---------- the Layout tab (SB4): sections, columns, placements, a live preview ---------- */
// Stage 6 HUD frame (HF1): the Layout tab edits the sheet's layout or the HUD's (the Sheet | HUD switch). A HUD made by merely looking at
// it is dropped by the cleaner on Save (nothing set).
function layoutRoot() { if (!draft.sheet) draft.sheet = {}; if (layoutView !== 'hud') return draft.sheet; if (!draft.sheet.hud || typeof draft.sheet.hud !== 'object' || Array.isArray(draft.sheet.hud)) draft.sheet.hud = { tabs: [], sections: [] }; return draft.sheet.hud; }
function draftHasHud() { var h = draft && draft.sheet && draft.sheet.hud, ln = function(k) { return !!(h && Array.isArray(h[k]) && h[k].length); }; return !!(h && typeof h === 'object' && (h.title || ln('tabs') || ln('sections') || ln('band') || ln('ledger'))); }   // HF2b: the draft has a HUD with something set
function layoutSections() { var r = layoutRoot(); if (!Array.isArray(r.sections)) r.sections = []; return r.sections; }
function layoutTabs() { var r = layoutRoot(); if (!Array.isArray(r.tabs)) r.tabs = []; return r.tabs; }
function sheetList(key) { return (draft && draft.sheet && Array.isArray(draft.sheet[key])) ? draft.sheet[key].slice() : []; }   // a copy of one of the sheet's id lists (identity / ledger / band), [] when absent
// Stage 6 HUD C8: the validator's own words for one show-if, over the draft as Save reads it (the Layout tab shows them under the box)
function showIfNote(text) {
    if (typeof text !== 'string' || !text.trim() || !F()) return '';
    var clean = cleanSystem(draft, { F: F(), gmView: true }); if (!clean) return '';
    clean.sheet = { sections: [{ id: 's_probe', cols: 1, fields: [], showIf: text.trim() }] };
    var w = validateSystem(clean, F()).warnings.filter(function(x) { return x.id === 's_probe' && x.prop === 'showIf'; });
    return w.map(function(x) { return x.message; }).join(' ');
}
function placementLabel(pl, byId, rollById) {
    if (pl.id) { var f = byId[pl.id]; return f ? (f.label || f.key || '(field)') + (f.key && f.label ? ' (' + f.key + ')' : '') : null; }
    if (pl.roll) { var r = rollById[pl.roll]; return r ? rollPick(r) : null; }
    if (pl.kind === 'heading') return 'Heading'; if (pl.kind === 'divider') return 'Divider'; if (pl.kind === 'portrait') return 'Portrait'; if (pl.kind === 'link') return 'Handbook link'; if (pl.kind === 'search') return 'Handbook search'; if (pl.kind === 'text') return 'Rules text'; if (pl.kind === 'roller') return 'Custom roller'; if (pl.kind === 'facing') return 'Facing dial'; if (pl.kind === 'stance') return 'Stance (posture & elevation)'; if (pl.kind === 'pin') return 'Pin button'; if (pl.kind === 'hud') return 'HUD button';
    return null;
}
function renderLayout() {
    var root = ui('sysLayoutSecs'); if (!root || !draft) return;
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
    if (tbNote) { if (!tbNote.dataset.sheetText) tbNote.dataset.sheetText = tbNote.textContent; tbNote.textContent = hudOn ? 'The HUD is a second window for each character, with its own tabs, sections, band and ledger. A field can be on the sheet and here; within the HUD it appears once. Players get a HUD button once it holds something they can see.' : tbNote.dataset.sheetText; }
    if (hudOn) {
        var hudBox = el('div', 'sys-tabmgr sys-hudbox'); hudBox.appendChild(el('div', 'sys-tabmgr-head', 'HUD title (optional)'));
        hudBox.appendChild(input('sys-hud-title field', layoutRoot().title, 'Shown under the name in the HUD\u2019s head (e.g. Combat HUD)', 'HUD'));
        root.appendChild(hudBox);
    }
    // Tabs (optional, Stage 1): group sections into a tab strip on the sheet. No tabs = one stacked page.
    var tabs = layoutTabs();
    var tabBox = el('div', 'sys-tabmgr');
    tabBox.appendChild(el('div', 'sys-tabmgr-head', 'Tabs (optional)'));
    if (!tabs.length) tabBox.appendChild(el('div', 'sys-hint', 'No tabs — the sections stack as one page. Add a tab to group them into a tab strip on the sheet; each section then picks its tab.'));
    tabs.forEach(function(tb) {
        var tr = el('div', 'sys-row sys-tab'); tr.dataset.tid = tb.id;
        var tmain = el('div', 'sys-row-main');
        var tIcoIn = input('sys-tab-icon field', tb.icon, 'An icon before the label on the sheet \u2014 an emoji or a bundled icon (optional)', 'Icon'); tmain.appendChild(tIcoIn); tmain.appendChild(glyphButton(tIcoIn));   // Stage 5g (Stage 6: the picker)
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
    if (hudOn) lookBox.appendChild(el('div', 'sys-note', 'Shared by the sheet and the HUD (the HUD leaves out sticky titles and the header portrait; its head has its own).'));   // HUD frame HF1
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
    var titlesSel = select('sys-look-titles', [['', 'Small titles'], ['headline', 'Headline titles'], ['accordion', 'Accordion titles']], shape.titles || '', 'Section titles: small capitals (as now), bigger headline titles, or accordion titles (a line under each section, a chevron on the ones that fold)');
    var tabsSel = select('sys-look-tabs', [['', 'Underlined tabs'], ['filled', 'Filled tabs'], ['angular', 'Angular tabs']], shape.tabs || '', 'The tab strip: an underline under the open tab (as now), angled tabs with the open one filled in the accent, or angular tabs across the whole strip');
    var labelsSel = select('sys-look-labels', [['', 'Plain labels'], ['caps', 'Capital labels']], shape.labels || '', 'Field labels: as they are, or small bold capitals like a printed sheet');
    shapeRow.appendChild(titlesSel); shapeRow.appendChild(tabsSel); shapeRow.appendChild(labelsSel);
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
    [numSel, bandSel, stepSel, valSel, fxSel, rowSel].forEach(function(s) { detRow.appendChild(s); });
    detRow.appendChild(stickyLbl); lookBox.appendChild(detRow);
    // Stage 6 look fold (L1): a palette — ten colours for every part of the sheet, from a preset or the GM's own swatches
    var pal = paletteOf(shape);
    var presetOf = function(p0) { if (!p0) return ''; var hit = 'custom'; Object.keys(LOOK_PRESETS).forEach(function(pn) { if (hit === 'custom' && PALETTE_KEYS.every(function(k) { return LOOK_PRESETS[pn].palette[k] === p0[k]; })) hit = pn; }); return hit; };
    var curPreset = presetOf(pal), presetOpts = [['', 'No palette']].concat(Object.keys(LOOK_PRESETS).map(function(pn) { return [pn, LOOK_PRESETS[pn].name]; })); if (curPreset === 'custom') presetOpts.push(['custom', 'Custom']);
    var palRow = el('div', 'sys-sec-style sys-lookpalette');
    palRow.appendChild(el('span', 'sys-sec-style-lbl', 'Palette'));
    var presetSel = select('sys-look-preset', presetOpts, curPreset, 'Colour every part of the sheet at once: pick a preset, then change any swatch'); palRow.appendChild(presetSel);
    if (pal) {
        PALETTE_KEYS.forEach(function(k) {
            var lb = el('label', 'sys-look-palsw'), sw = el('input', 'sys-look-pal'); sw.type = 'color'; sw.value = pal[k]; sw.dataset.key = k; sw.title = PAL_CAPS[k];
            lb.appendChild(el('span', 'sys-sec-style-lbl', PAL_CAPS[k])); lb.appendChild(sw); palRow.appendChild(lb);
            sw.addEventListener('input', function() { setPalette(k, sw.value); });
            sw.addEventListener('change', function() { renderLayout(); });   // the preset select turns to Custom
        });
        var pclr = el('button', 'tool ghost sys-btn', 'Clear palette'); pclr.title = 'Back to the Text and Panel colours above, and the theme'; pclr.addEventListener('click', function() { setShape('palette', null); renderLayout(); }); palRow.appendChild(pclr);
        Array.prototype.forEach.call(lookRow.querySelectorAll('.sys-look-color'), function(ci) { ci.disabled = true; ci.title = 'The palette sets the sheet\u2019s colours; clear it to use these'; });
    }
    lookBox.appendChild(palRow);
    lookBox.appendChild(el('div', 'sys-hint', 'A palette colours every part of the sheet at once, in place of the Text and Panel colours above and the campaign\u2019s page colours (the font and picture still apply). Players see the same colours, under either theme.'));
    var setPalette = function(k, v) { if (!/^#[0-9a-fA-F]{6}$/.test(v)) return; var lk = (draft.sheet && draft.sheet.look && typeof draft.sheet.look === 'object') ? draft.sheet.look : {}; var np = Object.assign({}, lk.palette || {}); np[k] = v.toLowerCase(); setShape('palette', np); };
    presetSel.addEventListener('change', function() { var pv = presetSel.value; if (pv === 'custom') return; if (!pv) setShape('palette', null); else { var pr = LOOK_PRESETS[pv]; if (!pr) return; setShape('palette', Object.assign({}, pr.palette)); setShape('accent', pr.accent); if (pr.font) setLook('font', pr.font); } renderLayout(); });
    root.appendChild(lookBox);
    var setShape = function(key, val) { if (!draft.sheet) draft.sheet = {}; var lk = (draft.sheet.look && typeof draft.sheet.look === 'object') ? draft.sheet.look : {}; if (val === null || val === '' || val === false || val === undefined) delete lk[key]; else lk[key] = val; if (Object.keys(lk).length) draft.sheet.look = lk; else delete draft.sheet.look; markDirty(); renderPreview(); };
    titlesSel.addEventListener('change', function() { setShape('titles', titlesSel.value); });
    tabsSel.addEventListener('change', function() { setShape('tabs', tabsSel.value); });
    labelsSel.addEventListener('change', function() { setShape('labels', labelsSel.value); });
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
                var gl = input('sys-bgrp-label field', g.label, 'The group\u2019s name (on its Pin button: \u201cPin <name>\u201d)', 'Group name'); gl.addEventListener('input', function(e) { e.stopPropagation(); g.label = gl.value.slice(0, LIMITS.label); markDirty(); renderPreview(); }); gl.addEventListener('change', function(e) { e.stopPropagation(); }); gr.appendChild(gl);
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
        draft.fields.forEach(function(f) { if (cfg.kinds[f.kind] === 1 && !on[f.id]) opts.push(['f:' + f.id, (f.label || f.key || '(field)') + (f.key ? ' (' + f.key + ')' : '')]); });
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
    if (!hudOn) pinBox({ key: 'identity', boxId: 'sysIdentityBox', title: 'Identity rows (optional)', kinds: IDENTITY_KINDS, rolls: false, limit: LIMITS.identity,
        hintFull: 'Under the name, in columns: a small label over each value; they scroll away with the sheet, leaving the band and the tabs at the top. Text, select, number and yes/no rows are changed right here by whoever may edit them, so they need no second copy in a section; formulas, skills and resources are read-only here. Players see the same rows.',
        hintEmpty: 'No identity rows \u2014 pick the fields that say who this is (ancestry, class, level, homeworld\u2026) and they read as labelled values under the name, in columns.',
        addLabel: 'Add an identity row\u2026', addTitle: 'A text, select, number or toggle (changed right there) or a formula, skill or resource (read-only) to show under the name', delTitle: 'Take off the identity rows (the field stays wherever else it is)', clearTitle: 'Take every identity row off', capMsg: 'At most ' + LIMITS.identity + ' identity rows.' });
    pinBox({ key: 'ledger', boxId: 'sysLedgerBox', title: 'Ledger figures (optional)', kinds: LEDGER_KINDS, rolls: false, limit: LIMITS.ledger,
        hintFull: 'Figures under the identity rows: a small label over a bold value (a negative reads red). A number is a box whoever may edit it can change right there; formulas, skills and resources are edited in the sections.',
        hintEmpty: 'No ledger \u2014 pick a few numbers (points spent, remaining, a total) and they read as bold figures under the name.',
        addLabel: 'Add a figure\u2026', addTitle: 'A number, formula, skill or resource to show as a figure (a number stays editable there)', delTitle: 'Take off the ledger (the field stays wherever else it is)', clearTitle: 'Take every figure off', capMsg: 'At most ' + LIMITS.ledger + ' ledger figures.' });
    pinBox({ key: 'band', boxId: 'sysBandBox', title: 'Pinned band (optional)', kinds: BAND_KINDS, rolls: true, limit: LIMITS.band, groups: true,
        hintFull: 'Shown on every tab, just above the tab strip, and it stays at the top with the strip while the sheet scrolls. A field can be here and in a section too.',
        hintEmpty: 'No band \u2014 pin a few numbers, resources, toggles or rolls and they stay under the name on every tab, above the tab strip.',
        addLabel: 'Pin to the band\u2026', addTitle: 'A number, formula, skill, resource, toggle or roll to keep in view on every tab', delTitle: 'Take off the band (it stays wherever else it is on the sheet)', clearTitle: 'Take everything off the band', capMsg: 'The band holds at most ' + LIMITS.band + ' items.' });
    if (!secs.length) root.appendChild(el('div', 'sys-empty', hudOn ? 'No HUD yet \u2014 add a section, a band figure or a ledger figure.' : 'No layout of your own yet: the sheet shows the automatic layout (one section per kind, then the rolls). Start from it, or add a section.'));
    secs.forEach(function(sec) {
        var row = el('div', 'sys-row sys-sec'); row.dataset.sid = sec.id;
        var top = el('div', 'sys-row-main');
        var sIcoIn = input('sys-sec-icon field', sec.icon, 'An icon before the title \u2014 an emoji or a bundled icon (optional)', 'Icon'); top.appendChild(sIcoIn); top.appendChild(glyphButton(sIcoIn));   // Stage 5g (Stage 6: the picker)
        top.appendChild(input('sys-sec-title field', sec.title, 'The section\'s title on the sheet (empty = none)', 'Section title'));
        top.appendChild(select('sys-sec-cols', [[1, '1 column'], [2, '2 columns'], [3, '3 columns'], [4, '4 columns']], Math.max(1, Math.min(4, sec.cols || 1)), 'Fields per row in this section'));
        if (tabs.length) top.appendChild(select('sys-sec-tab', [['', 'No tab']].concat(tabs.map(function(t) { return [t.id, t.label || 'Tab']; })), sec.tab || '', 'Which tab this section appears on'));
        top.appendChild(select('sys-sec-collap', [['', 'Fixed'], ['1', 'Collapsible']], sec.collapsible ? '1' : '', 'A collapsible section the reader can fold away'));
        top.appendChild(select('sys-sec-inline', [['', 'Stacked fields'], ['1', 'Inline rows']], sec.inline ? '1' : '', 'Each field on one line: label and value on the left, its Roll on the right (numbers, formulas, skills, toggles, selects, text); their stat tiles draw as rows here (a pool and a slider keep their own look)'));   // HUD frame (HF4a)
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
        sifRow.appendChild(input('sys-sec-showif field', sec.showIf || '', 'Show this section only while the formula is true (a number other than 0, or yes): Stun > 0, Station == 2, not(Droid). Empty: always. It only hides \u2014 the values still reach the player (GM only keeps a secret)', 'Always (e.g. Stun > 0)'));
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
            if (pl.kind === 'text') { var rta = el('textarea', 'sys-pl-rtext field'); rta.value = pl.text || ''; rta.rows = 4; rta.maxLength = LIMITS.ruleText; rta.placeholder = 'The rules, as plain text (line breaks kept)'; rta.title = 'Shown as written, up to ' + LIMITS.ruleText + ' characters; players see it too'; rta.spellcheck = true; pr.appendChild(rta); }   // Stage 6 HUD H11
            if (pl.kind === 'pin') {   // Stage 6: which group it pins, and an optional label (blank = "Pin <group>")
                pr.appendChild(select('sys-pl-group', grpList.map(function(g) { return [g.id, g.label || 'Group']; }), pl.g || '', 'The band group this button pins'));
                var pgl = grpList.find(function(g) { return g.id === pl.g; }); pr.appendChild(input('sys-pl-text field', pl.text, 'The button\u2019s label (blank = \u201cPin\u201d and the group\u2019s name)', pgl ? 'Pin ' + (pgl.label || 'Group') : 'Label (optional)'));
            }
            if (pl.kind === 'link') {   // Stage 5f: which page, and an optional label (blank = the page's own title)
                pr.appendChild(select('sys-pl-page', pageOptions(pl.page, pl.page ? null : 'Choose a page\u2026'), pl.page || '', 'The handbook page this button opens'));
                pr.appendChild(input('sys-pl-text field', pl.text, 'The button\'s label (blank = the page\'s title)', 'Label (optional)'));
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
            var wb = el('button', 'tool ghost sys-btn sys-pl-w', pl.w === 'row' ? 'Full row' : '1 column'); wb.dataset.act = 'plw'; wb.title = 'Width: one column of the section, or the full row'; pr.appendChild(wb);
            var plf = pl.id ? (draft.fields || []).find(function(x) { return x.id === pl.id; }) : null, plOn = plf && plf.kind === 'item-list' && plf.list && plf.list.on && typeof plf.list.on === 'object' ? plf.list.on : null;
            if (plOn || (pl.on && plf && plf.kind === 'item-list')) { var ob = el('button', 'tool ghost sys-btn sys-pl-on', pl.on ? 'Only ' + (plOn ? String(plOn.label || 'on').toLowerCase() : 'switched on') : 'All rows'); ob.dataset.act = 'plon'; ob.title = plOn ? 'Every row of the list, or only the rows switched on (' + (plOn.label || 'On') + '), e.g. the HUD\u2019s readied weapons' : 'Its list has no switch now, so every row shows: click to clear it'; pr.appendChild(ob); }   // F4b (review: kept while set, so it can be cleared)
            pr.appendChild(btnRow([['plup', 'Move up', '&#9650;'], ['pldown', 'Move down', '&#9660;'], ['pldel', 'Take off the sheet (the field stays defined)', '&times;']]));
            list.appendChild(pr);
        });
        row.appendChild(list);
        var addRow = el('div', 'sys-row-main sys-pl-addrow'), opts = [['', 'Add to this section\u2026']], inHdr = headerEdits(draft, hudOn ? (draft.sheet && draft.sheet.hud) || null : undefined);
        draft.fields.forEach(function(f) { if (!placed[f.id]) opts.push(['f:' + f.id, (f.label || f.key || '(field)') + (f.key ? ' (' + f.key + ')' : '') + (inHdr[f.id] === 1 ? ' (in the header)' : '') + (hudOn && onSheet[f.id] ? ' (on the sheet)' : '')]); });   // Stage 6: the GM is told a field is already edited in the header
        draft.rolls.forEach(function(r) { opts.push(['r:' + r.id, rollPick(r)]); });
        opts.push(['k:heading', 'Heading'], ['k:text', 'Rules text'], ['k:roller', 'Custom roller'], ['k:divider', 'Divider'], ['k:portrait', 'Portrait'], ['k:facing', 'Facing dial'], ['k:stance', 'Stance (posture & elevation)']);
        grpList.forEach(function(g) { opts.push(['p:' + g.id, 'Pin button: ' + (g.label || 'Group')]); });   // Stage 6: a band group's Pin, beside its figures
        if (pageOptions('', null).length) opts.push(['k:link', 'Handbook link'], ['k:search', 'Handbook search']);   // Stage 5f: only when the campaign has pages; H12: a search over them
        if (!hudOn && draftHasHud()) opts.push(['k:hud', 'HUD button']);   // HUD frame (HF2b): on the sheet, once there is a HUD to open
        addRow.appendChild(select('sys-pl-add', opts, '', 'A field not yet on the sheet, a roll button, a heading, a divider, the portrait, a facing dial, a stance control or a handbook link'));
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
    var pv = layoutView === 'hud' ? hudView(clean) : clean;   // Stage 6 HUD frame (HF1): the HUD's own layout, in the shared look
    box.classList.toggle('sys-layout-preview-hud', layoutView === 'hud');
    if (!pv) { box.textContent = ''; box.appendChild(el('div', 'sys-empty', 'No HUD yet: add a section, a band figure or a ledger figure on the left.')); return; }
    _fxLive = false; try { buildSections(box, pv, pc, resolveAll(pv, pc, F(), pc && pc.id ? tokenCtxFor(pc.id, camp) : null), true, false, renderPreview, { campId: camp && camp.id, view: layoutView, preview: true, targets: pinTargetsAll(clean.sheet) }); } finally { _fxLive = true; }   // 5h: the preview's effect controls would act on the saved system, not the draft
    applySheetLookTo(box, sheetLook(camp, clean));   // the preview wears the sheet's look too
    syncFramePad(box);
    Array.prototype.forEach.call(box.children, function(ch) { ch.inert = true; });   // Stage 6: the preview draws a real character's values as the GM — no keyboard edit may reach it (the box itself stays the scroller)
}
function onLayoutInput(t) {
    var c = t.className || '';
    if (c.indexOf('sys-tab-icon') >= 0) { var itr = t.closest && t.closest('.sys-row.sys-tab'); if (itr) { var tbi = layoutTabs().find(function(x) { return x.id === itr.dataset.tid; }); if (tbi) { if (t.value.trim()) tbi.icon = t.value.slice(0, 32); else delete tbi.icon; markDirty(); renderPreview(); } } return true; }   // Stage 5g (Save trims it to a few code points)
    if (c.indexOf('sys-tab-label') >= 0) { var ltr = t.closest && t.closest('.sys-tab'); if (ltr) { var tb0 = layoutTabs().find(function(x) { return x.id === ltr.dataset.tid; }); if (tb0) { tb0.label = t.value.slice(0, LIMITS.label); markDirty(); renderPreview(); } } return true; }
    if (t.classList && t.classList.contains('sys-hud-title')) { var hr = layoutRoot(); if (t.value.trim()) hr.title = t.value.slice(0, LIMITS.label); else delete hr.title; markDirty(); renderPreview(); return true; }   // HUD frame HF1 (before the section lookup: the title row is outside a section)
    var lsec = t.closest && t.closest('.sys-sec'); if (!lsec) return false;
    var sec = layoutSections().find(function(s) { return s.id === lsec.dataset.sid; }); if (!sec) return true;
    var plr = t.closest('.sys-pl');
    if (plr && c.indexOf('sys-pl-text') >= 0) { var pl = (sec.fields || [])[+plr.dataset.pi]; if (pl) pl.text = t.value.slice(0, LIMITS.label); }
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
    if (t.classList.contains('sys-sec-tab')) { if (t.value) sec.tab = t.value; else delete sec.tab; markDirty(); renderPreview(); return true; }
    if (t.classList.contains('sys-sec-collap')) { if (t.value) sec.collapsible = true; else delete sec.collapsible; markDirty(); renderPreview(); return true; }
    if (t.classList.contains('sys-sec-inline')) { if (t.value) sec.inline = true; else delete sec.inline; markDirty(); renderPreview(); return true; }   // HUD frame (HF4a)
    if (t.classList.contains('sys-sec-resetall')) { if (t.checked) sec.resetAll = true; else delete sec.resetAll; markDirty(); renderLayout(); return true; }   // HUD frame (HF4b): its text box comes and goes
    if (t.classList.contains('sys-sec-chip')) { if (t.value) sec.chip = t.value; else delete sec.chip; markDirty(); renderPreview(); return true; }   // Stage 5f
    if (t.classList.contains('sys-sec-pin')) { if (t.value && PIN_GID.test(t.value)) sec.pin = t.value; else delete sec.pin; markDirty(); renderLayout(); return true; }   // Stage 6 (HUD frame HF0: exact class tokens — "sys-sec-pinned" contains "sys-sec-pin", so the Above-the-tabs select used to land here)
    if (c.indexOf('sys-pl-group') >= 0) { var plg = t.closest('.sys-pl'), plq = plg ? (sec.fields || [])[+plg.dataset.pi] : null; if (plq && plq.kind === 'pin' && PIN_GID.test(t.value)) { plq.g = t.value; markDirty(); renderLayout(); } return true; }   // Stage 6: a Pin button's group
    if (t.classList.contains('sys-pl-hudtab')) { var plh = t.closest('.sys-pl'), plx = plh ? (sec.fields || [])[+plh.dataset.pi] : null; if (plx && plx.kind === 'hud') { if (/^t_[A-Za-z0-9_]{1,24}$/.test(t.value)) plx.tab = t.value; else delete plx.tab; markDirty(); renderPreview(); } return true; }   // HF2b: a HUD button's tab
    if (c.indexOf('sys-pl-page') >= 0) { var plp = t.closest('.sys-pl'), plk = plp ? (sec.fields || [])[+plp.dataset.pi] : null; if (plk && plk.kind === 'link') { plk.page = t.value; markDirty(); renderLayout(); } return true; }   // Stage 5f: a link's page
    if (t.classList.contains('sys-sec-pinned')) { if (t.value) sec.pinned = true; else delete sec.pinned; markDirty(); renderPreview(); return true; }
    if (t.classList.contains('sys-sec-meta')) { if (t.value) sec.meta = t.value; else delete sec.meta; markDirty(); renderPreview(); return true; }
    if (t.classList.contains('sys-sec-parent')) { if (t.value) sec.parent = t.value; else delete sec.parent; markDirty(); renderPreview(); return true; }
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
        if (pl) { sec.fields.push(pl); markDirty(); renderLayout(); }
        return true;
    }
    return false;
}
function onLayoutClick(b) {
    if (b.closest && b.closest('#sysLayoutView') && (b.dataset.view === 'sheet' || b.dataset.view === 'hud')) { if (layoutView !== b.dataset.view) { layoutView = b.dataset.view; var pvb = ui('sysLayoutPreview'); if (pvb) delete pvb.dataset.wpTab; renderLayout(); } return true; }   // HUD frame HF1: the Sheet | HUD switch (never marks the draft dirty)
    if (b.id === 'sysLayoutAuto' && layoutView === 'hud') {   // HF1: copy the sheet's sections (or the automatic layout's) onto the HUD's first tab — fresh ids, parents remapped, no tab
        var clH = cleanSystem(draft, { F: F(), gmView: true }) || draft, srcS = (clH.sheet && Array.isArray(clH.sheet.sections) && clH.sheet.sections.length) ? clH.sheet.sections : autoLayout(clH).sections;
        var doCopy = function() {
            var idMap = {}, copies = [];
            srcS.slice(0, LIMITS.sections).forEach(function(s0) { idMap[s0.id] = uid('s_'); });
            srcS.slice(0, LIMITS.sections).forEach(function(s0) { var cp = clone(s0); cp.id = idMap[s0.id]; delete cp.tab; if (cp.parent) { if (idMap[cp.parent]) cp.parent = idMap[cp.parent]; else delete cp.parent; } cp.fields = (cp.fields || []).filter(function(p) { return !(p && p.kind === 'hud'); }); copies.push(cp); });
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
    else if (act === 'secdel') { secs.splice(si, 1); }
    else if (act === 'secstyleclr') { delete sec.style; }   // Stage 3: remove the section's colors
    else if (plr) {
        var list = sec.fields || [], pi = +plr.dataset.pi, pl = list[pi]; if (!pl) return true;
        if (act === 'plw') pl.w = pl.w === 'row' ? 1 : 'row';
        else if (act === 'plif') { if (typeof pl.showIf === 'string') delete pl.showIf; else pl.showIf = ''; }   // Stage 6 HUD C8: a show-if box for this placement
        else if (act === 'plon') { if (pl.on) delete pl.on; else pl.on = true; }   // F4b: only the rows switched on
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
// [systemcheck:needpick-start]
// 126b: why a player's character may not take one of the system's own items yet, in the core's words ('' while it may). Asked for a player's
// own picker only: the GM is never stopped. A needed entry is named only where this player may read its name: an item of their view that is
// not GM-only, then a library row their app has been sent. One it cannot name is said as something else
function needName(sys, id, gm) {   // gm: the GM's own sheet, which names every entry
    var its = (sys && Array.isArray(sys.items) ? sys.items : []).concat(sys && Array.isArray(sys.core) ? sys.core : []);
    for (var i = 0; i < its.length; i++) if (its[i] && its[i].id === id) return (gm === true || its[i].vis !== 'gm') && typeof its[i].name === 'string' ? its[i].name : null;
    if (gm === true) { var LBn = window.wpLibrary, en = LBn && LBn.entry ? LBn.entry(id) : null; return en && typeof en.name === 'string' ? en.name : null; }
    var N = net(), man = N && N.libManifest ? N.libManifest() : null, packs = man && Array.isArray(man.packs) ? man.packs : [];
    for (var p = 0; p < packs.length; p++) {
        var rows = packs[p] && N.libRows ? N.libRows(packs[p].id) : [];
        for (var r = 0; r < rows.length; r++) if (Array.isArray(rows[r]) && rows[r][0] === id) return typeof rows[r][2] === 'string' ? rows[r][2] : null;
    }
    return null;
}
function cantTake(sys, c, it) {
    if (!it || !c || ((!Array.isArray(it.needs) || !it.needs.length) && (typeof it.needsIf !== 'string' || !it.needsIf))) return '';
    var nm = needsMet(sys, c, it, true, typeof F === 'function' ? F() : null); if (nm.ok) return '';
    return needsSays(it, nm.missing, function(id) { return needName(sys, id); });
}
// [systemcheck:needpick-end]
// ---- item-list widgets (Stage 4: the plain list and the rich table share these) ----
var ITEM_COL_LABEL = { category: 'Category', cost: 'Cost', damage: 'Damage', area: 'Area', notes: 'Notes' };
function itemThrowBtn(def, c, f, rid) {   // Stage 6 F4a: the throw names the carried row (the host reads its definition). A GM-only item, or one on a GM-only list: its damage and its blast's name stay the GM's
    var tb = el('button', 'tool ghost sheet-item-throw', '💥 Throw'); tb.title = 'Throw ' + def.name + ' — then click the map';
    tb.addEventListener('click', function() { if (window.wpArmBlast) { window.wpArmBlast(def.area.ft, def.area.name || def.name, { charId: c.id, fieldId: f.id, rowId: rid, by: c.name, damage: def.damage || '', gmOnly: def.vis === 'gm' || f.vis === 'gm' }); var hp = tb.closest('.hud-panel'); if (hp) closeHud(hp.dataset.cid); else closeSheet(); } });
    return tb;
}
function itemQtyCell(entry, c, f) {   // Stage 6 F4a: by row id. Every item has the same controls on a player's sheet (a bound or cursed one never shows it)
    var qc = el('span', 'sheet-item-qty');
    var mn = el('button', 'tool ghost sheet-pm', '−'); mn.title = 'One less (removes at zero)'; mn.addEventListener('click', function() { commitItem(c, f, { op: 'setQty', rowId: rowIdOf(entry), qty: entry.qty - 1 }); });
    qc.appendChild(mn); qc.appendChild(el('span', 'sheet-item-qtyn', '×' + entry.qty));
    var pl = el('button', 'tool ghost sheet-pm', '+'); pl.title = 'One more'; pl.addEventListener('click', function() { commitItem(c, f, { op: 'setQty', rowId: rowIdOf(entry), qty: entry.qty + 1 }); });
    qc.appendChild(pl); return qc;
}
function itemRmBtn(entry, def, c, f) {
    var rm = el('button', 'tool ghost sheet-item-rm', '×'); rm.title = entry.hid === 1 ? 'Dispel: remove ' + def.name + ' from the character' : 'Remove ' + def.name;
    rm.addEventListener('click', function() { commitItem(c, f, { op: 'remove', rowId: rowIdOf(entry) }); }); return rm;
}
function itemCellText(col, def) {
    if (col === 'category') return def.category || '';
    if (col === 'cost') return def.cost || '';
    if (col === 'damage') return def.damage || '';
    if (col === 'area') return def.area ? (def.area.ft + ' ft' + (def.area.shape && def.area.shape !== 'circle' ? ' ' + def.area.shape : '')) : '';
    return '';
}
// Stage 6 F6b: what a row's item changes on its character, as chips on the row ("DEX −2", "HP max +5", "Inspiration on") — a change per level
// times the row's level; dimmed while an item that works only while switched on is off. The viewer's own fields only (their copy holds no other)
function modsBits(host, def, entry, spec, sysI) {
    if (!def || !Array.isArray(def.mods) || !def.mods.length) return;
    var byId = Object.create(null); ((sysI && sysI.fields) || []).forEach(function(x) { if (x && typeof x.id === 'string') byId[x.id] = x; });
    var off = def.modsOn === true && !!(spec && spec.on && typeof spec.on === 'object') && !rowOn(spec, entry), lv = rowLvl(spec, entry, def);
    def.mods.forEach(function(m) {
        var fx = m && byId[m.f]; if (!fx) return;
        var nm = fx.label || fx.key, t;
        if (m.op === 'on') t = nm + ' on';
        else { var v = (typeof m.v === 'number' ? m.v : 0) * (m.lvl === true ? (typeof lv === 'number' && isFinite(lv) ? lv : 0) : 1); t = nm + (m.part === 'max' ? ' max' : '') + ' ' + (v >= 0 ? '+' : '\u2212') + fmtNum(Math.abs(v)); }
        var ch = el('span', 'sheet-chip sheet-item-mod' + (off ? ' off' : ''), t); ch.title = off ? 'Counts while switched on' : m.lvl === true ? 'Per level (times its level)' : 'While carried'; host.appendChild(ch);
    });
}
// Stage 6: what only the GM sees on a row — a bound or cursed item, and a curse the player dropped (kept here, out of their sight)
function gmItemBits(host, def, entry, gm, sw) {   // sw (F4b): the list has a switch — the equip lock's chips
    if (!gm) return;
    if (entry.hid === 1) { var hc = el('span', 'sheet-chip sheet-item-kept', 'hidden from player'); hc.title = 'The player dropped it; it stays on this character, out of their sight, until you remove it'; host.appendChild(hc); }
    else if (def.rm === 'bound') { var bc = el('span', 'sheet-chip sheet-item-bound', 'bound'); bc.title = 'Only you can remove it: a player\u2019s attempt fails' + (def.rmMsg ? ' with \u201c' + def.rmMsg + '\u201d' : ''); host.appendChild(bc); }
    else if (def.rm === 'curse') { var cc = el('span', 'sheet-chip sheet-item-curse', 'curse'); cc.title = 'Curse on contact: if the player drops it, it stays on this character, out of their sight'; host.appendChild(cc); }
    if (!sw) return;
    if (entry.keptOn === 1) { var kc = el('span', 'sheet-chip sheet-item-kept', 'kept on'); kc.title = 'The player switched it off: it looks off to them but stays on, out of their sight, until you switch it off'; host.appendChild(kc); }
    else if (def.eq === 'bound') { var eb = el('span', 'sheet-chip sheet-item-bound', 'stays on'); eb.title = 'Only you switch it off: a player\u2019s attempt fails' + (def.eqMsg ? ' with \u201c' + def.eqMsg + '\u201d' : '') + ' (just after it goes on, it still comes off)'; host.appendChild(eb); }
    else if (def.eq === 'curse') { var ec = el('span', 'sheet-chip sheet-item-curse', 'curse (on)'); ec.title = 'Curse on contact: if the player switches it off, it looks off to them and stays on, out of their sight'; host.appendChild(ec); }
}
// Stage 6 F4b: a row's level — a number box, or a dropdown when the level has names (they count from its minimum); text when it cannot be
// changed. One set op per change (the host judges it again)
function lvlCtl(entry, def, c, f, spec, editable) {
    var L = spec.lvl; if (!L || typeof L !== 'object') return null;
    var lv = rowLvl(spec, entry, def), w = el('span', 'sheet-item-lvl'), rid = rowIdOf(entry); w.title = L.label;
    if (!editable) { w.appendChild(el('span', 'sheet-item-lvln', lvlText(L, lv))); return w; }
    if (Array.isArray(L.labels) && L.labels.length) {
        var s = el('select', 'field sheet-item-lvlsel'); s.title = L.label; s.dataset.fid = f.id; s.dataset.part = 'lvl-' + rid;
        L.labels.forEach(function(t, i) { var v = (L.min || 0) + i; s.appendChild(opt(String(v), t || String(v), v === lv)); });
        if (L.labels.every(function(t, i) { return (L.min || 0) + i !== lv; })) { var xo = opt(String(lv), fmtNum(lv), true); xo.disabled = true; s.appendChild(xo); }   // a stored level past the names
        s.addEventListener('change', function() { commitItem(c, f, { op: 'set', rowId: rid, facts: { lvl: Number(s.value) } }); });
        w.appendChild(s); return w;
    }
    var i = el('input', 'field sheet-item-lvlin'); i.type = 'number'; i.value = String(lv); i.title = L.label; i.dataset.fid = f.id; i.dataset.part = 'lvl-' + rid;
    if (L.min !== undefined) i.min = String(L.min); if (L.max !== undefined) i.max = String(L.max); i.step = String(L.step || 1);
    i.addEventListener('change', function() { var n = Number(i.value); if (String(i.value).trim() === '' || !isFinite(n)) { i.value = String(lv); return; } commitItem(c, f, { op: 'set', rowId: rid, facts: { lvl: n } }); });
    w.appendChild(i); return w;
}
function lvlText(L, lv) { var i = lv - (L.min || 0); return Array.isArray(L.labels) && i >= 0 && i === Math.floor(i) && i < L.labels.length && L.labels[i] ? L.labels[i] : fmtNum(lv); }
// F4b: a row's switch — a checkbox with the list's label (in a table the header carries it); read-only, a chip while it is on
function onCtl(entry, c, f, spec, editable, labelled) {
    var S = spec.on; if (!S || typeof S !== 'object') return null;
    var on = rowOn(spec, entry);
    if (!editable) return on ? el('span', 'sheet-chip sheet-item-onc', labelled ? S.label : '\u2713') : null;
    var cb = el('input', 'sheet-item-on'); cb.type = 'checkbox'; cb.checked = on; cb.title = S.label; cb.dataset.fid = f.id; cb.dataset.part = 'on-' + rowIdOf(entry);
    cb.addEventListener('change', function() { commitItem(c, f, { op: 'set', rowId: rowIdOf(entry), facts: { on: cb.checked } }); });
    if (!labelled) return cb;
    var l = el('label', 'sheet-item-onl'); l.appendChild(cb); l.appendChild(el('span', 'sheet-item-onn', S.label)); return l;
}
// F4b: 📝 — the item's notes and the row's own note (a box for whoever may change the row); null when there is nothing to show
function noteBits(entry, def, c, f, editable, ovc) {   // ovc (F4c2): what the copy holds of its own (ovCtx), for the dots
    var box = el('div', 'sheet-item-noteline'), spec = f.list || null;
    if (spec && Array.isArray(spec.stats) && spec.stats.length) { var sln = statLineNode(entry, def, spec, ovc); if (sln) box.appendChild(sln); }   // F4c1: every stat (1.5.4: but a Hidden one), and what one cost
    var ab = descBits(entry, def, spec);   // 1.5.4: what the entry does, and what each of its levels gives
    if (def.notes && !(ab && noteInDesc(def.notes, def.desc))) box.appendChild(el('div', 'sheet-item-notes', def.notes));   // a note that only begins the description is not said twice
    if (ab) box.appendChild(ab);
    if (editable) { var ni = el('input', 'field sheet-item-note'); ni.type = 'text'; ni.dataset.fid = f.id; ni.dataset.part = 'note-' + rowIdOf(entry); ni.maxLength = LIMITS.rowNote; ni.placeholder = 'A note on this one'; ni.value = entry.note || ''; ni.addEventListener('change', function() { commitItem(c, f, { op: 'set', rowId: rowIdOf(entry), facts: { note: ni.value } }); }); box.appendChild(ni); }
    else if (entry.note) box.appendChild(el('div', 'sheet-item-rownote', entry.note));
    return box.childNodes.length ? box : null;
}
// 1.5.4 (the owner, of a power's details: "theres no actually useful info here about the ability"; by prompt: "On the row itself"): what
// the entry does, read in a row's details on the sheet — its description, and what each of its levels gives as a small table with the
// row's own level marked. Text nodes only. The HUD's rows have no details line, so none of it is ever drawn there
function noteInDesc(note, desc) {   // the note is the description's own beginning (white space aside, and the dots a cut note ends with)
    var n = String(note || '').replace(/\s+/g, ' ').trim().replace(/(\.\.\.|\u2026)$/, '').trim(), d = typeof desc === 'string' ? desc.replace(/\s+/g, ' ').trim() : '';
    return !!n && !!d && d.indexOf(n) === 0;
}
function descBits(entry, def, spec) {
    var d = typeof def.desc === 'string' && def.desc.trim() ? def.desc : '', L = (Array.isArray(def.lvls) ? def.lvls : []).filter(function(r) { return !!r && typeof r === 'object' && typeof r.lvl === 'number' && typeof r.text === 'string' && !!r.text; });
    if (!d && !L.length) return null;
    var box = el('div', 'sheet-item-about'), LS = spec && spec.lvl && typeof spec.lvl === 'object' ? spec.lvl : null;
    if (d) box.appendChild(el('div', 'sheet-item-desc', d));
    if (L.length) {
        var at = LS ? rowLvl(spec, entry, def) : null, t = el('table', 'sheet-item-lvls'), hd = el('thead'), hr = el('tr'), tb = el('tbody');
        hr.appendChild(el('th', null, (LS && LS.label) || 'Level')); hr.appendChild(el('th', null, 'What it gives')); hd.appendChild(hr); t.appendChild(hd);
        L.forEach(function(r) {
            var tr = el('tr', at !== null && r.lvl === at ? 'is-now' : null), td = el('td');
            tr.appendChild(el('th', null, LS ? lvlText(LS, r.lvl) : fmtNum(r.lvl)));
            if (typeof r.tag === 'string' && r.tag) td.appendChild(el('span', 'sheet-item-lvltag', r.tag));
            td.appendChild(el('span', 'sheet-item-lvltext', r.text)); tr.appendChild(td); tb.appendChild(tr);
        });
        t.appendChild(tb); box.appendChild(t);
    }
    return box;
}
var _noteOpen = Object.create(null);   // F4b: the rows whose 📝 line is open (kept across a redraw)
function noteToggle(line, entry, c, f) {
    var k = c.id + '|' + f.id + '|' + rowIdOf(entry), b = el('button', 'tool ghost sheet-item-notes-t', '📝'); b.title = entry.note ? 'Notes \u00b7 ' + entry.note : 'Notes';
    line.style.display = _noteOpen[k] ? '' : 'none';
    b.addEventListener('click', function() { if (_noteOpen[k]) delete _noteOpen[k]; else _noteOpen[k] = 1; line.style.display = _noteOpen[k] ? '' : 'none'; });
    return b;
}
// F4b: a list's picker — the items of its categories (every one when it names none), a group per category; on a list with no quantity that
// holds an item once, one already carried is greyed. Returns how many it offers
function pickerInto(sel, items, spec, carried, cantOf) {   // cantOf (126b): why this character may not take an item yet, in words; none, or no words: it may
    var cats = Array.isArray(spec.cats) ? spec.cats.map(function(x) { return String(x).toLowerCase(); }) : null, groups = [], byCat = Object.create(null), loose = [], have = Object.create(null), n = 0;
    if (spec.noQty && !spec.multi) carried.forEach(function(r) { if (r && typeof r.defId === 'string' && r.hid !== 1) have[r.defId] = 1; });
    items.forEach(function(it) {
        var cat = String(it.category || '').trim(), lc = cat.toLowerCase();
        if (cats && cats.indexOf(lc) < 0) return;
        var o = opt(it.id, (iconText(it.icon) ? iconText(it.icon) + ' ' : '') + it.name); if (have[it.id] === 1) { o.disabled = true; o.title = 'Already on the list'; }
        else { var why = typeof cantOf === 'function' ? cantOf(it) : ''; if (typeof why === 'string' && why) { o.disabled = true; o.title = why; } }
        n++;
        if (!cat) { loose.push(o); return; }
        if (!byCat[lc]) { byCat[lc] = el('optgroup'); byCat[lc].label = cat; groups.push(byCat[lc]); }
        byCat[lc].appendChild(o);
    });
    loose.forEach(function(o) { sel.appendChild(o); }); groups.forEach(function(g) { sel.appendChild(g); });
    return n;
}
// Stage 6: a pickup's Undo — for a moment after an item is picked up (added, or its + pressed), an Undo sits on its row, every item alike so
// it tells nothing. It takes back what those pickups added; the host judges it by its own count and keeps its window a little longer (the
// round trip). Each pickup extends the window on both sides; a drop meanwhile takes the Undo down by as much.
var _undo = {};
function undoKey(c, f, rid) { return c.id + '|' + f.id + '|' + rid; }
function noteUndo(c, f, res) {
    if (!res || typeof res.row !== 'string' || !(res.added > 0)) return;
    var k = undoKey(c, f, res.row), now = Date.now(), u = _undo[k];
    if (u && u.until > now) { u.added += res.added; u.until = now + LIMITS.undoMs; } else _undo[k] = { until: now + LIMITS.undoMs, added: res.added };
    setTimeout(function() { if (_undo[k] && _undo[k].until <= Date.now()) { delete _undo[k]; renderViews(c.id); } }, LIMITS.undoMs + 50);
}
function takeBack(c, f, rid, n) { var k = undoKey(c, f, rid), u = _undo[k]; if (!u || !(n > 0)) return; u.added -= n; if (u.added <= 0) delete _undo[k]; }
function undoBtn(entry, c, f) {
    var rid = rowIdOf(entry), k = undoKey(c, f, rid), u = _undo[k]; if (!u || u.until <= Date.now()) return null;
    var b = el('button', 'tool ghost sheet-item-undo', '\u21b6 Undo'); b.title = 'Put it back (just after picking it up)';
    b.addEventListener('click', function() { var n = u.added; delete _undo[k]; commitItem(c, f, { op: 'undo', rowId: rid, qty: n }); });
    return b;
}
function rowQty(c, f, rid) { var v = c && c.values && Array.isArray(c.values[f.id]) ? c.values[f.id] : [], r = v.find(function(x) { return rowIdOf(x) === rid; }); return r ? (r.qty | 0) : 0; }
// 126b: a row whose entry needs something the character does not carry is marked (the owner, of a prerequisite that stops being true: "Mark
// it on the sheet"). Nothing is taken off the sheet. The GM's sheet judges by every need of the entry; a player's own by the needs their
// copy names, so a need they may not see marks nothing for them. A row kept out of its player's sight is not judged. The words are text
function needBits(host, sys, c, entry, rd, gm) {
    if (typeof needsMet !== 'function' || typeof needsSays !== 'function' || !rd || !entry || entry.hid === 1) return;
    var nd = rd.src === 'inline' ? entry.needs : rd.src === 'lib' && rd.base ? rd.base.needs : null, rl = rd.src === 'inline' ? entry.needsIf : rd.src === 'lib' && rd.base ? rd.base.needsIf : null;
    nd = Array.isArray(nd) ? nd : []; rl = typeof rl === 'string' ? rl : ''; if (!nd.length && !rl) return;   // its needed entries, and its rule
    var rf = rd.src === 'inline' ? entry.needsFrom : rd.src === 'lib' && rd.base ? rd.base.needsFrom : undefined;   // a level's own needs: the rule's from-level, and the row judged at the level it has
    var nm = needsMet(sys, c, { needs: nd, needsIf: rl, needsFrom: typeof rf === 'number' ? rf : undefined }, !gm, typeof F === 'function' ? F() : null, null, typeof entry.lvl === 'number' ? entry.lvl : undefined); if (nm.ok) return;
    var chip = el('span', 'sheet-chip sheet-item-unmet', 'needs not met');
    chip.title = 'This character does not meet what it needs. ' + needsSays(null, nm.missing, function(id) { for (var i = 0; i < nd.length; i++) if (nd[i] && nd[i].id === id && typeof nd[i].name === 'string' && nd[i].name) return nd[i].name; return typeof needName === 'function' ? needName(sys, id, gm) : null; });   // the name an owner's copy carries, else what this app can read
    host.appendChild(chip);
}
// Stage 6 F4a: a copy of an entry deleted from the library — marked; the GM may make it the character's own item
function lostBits(host, rd, entry, c, f, gm, editable) {
    if (!rd || rd.src !== 'lost') return;
    var chip = el('span', 'sheet-chip sheet-item-lost', 'not in library'); chip.title = 'Deleted from the library; the character keeps their copy'; host.appendChild(chip);
    if (gm && editable) { var mk = el('button', 'tool ghost sheet-item-keep', 'Make custom'); mk.title = 'Make this copy the character\u2019s own item'; mk.addEventListener('click', function() { commitItem(c, f, { op: 'keep', rowId: rowIdOf(entry) }); }); host.appendChild(mk); }
}
// Stage 6 F4c1: a list's stats on a row. A number as it is: whole, two decimals from 1 up, three significant digits below (fmtNum would show
// 0.0001 lb as 0); a value name for a whole value inside a stat's names
function statFmt(v) { if (typeof v !== 'number' || !isFinite(v)) return ''; if (Math.floor(v) === v) return String(v); return Math.abs(v) >= 1 ? String(Number(v.toFixed(2))) : String(Number(v.toPrecision(3))); }
function statText(st, v) { if (typeof v === 'string') return v || '—'; var L = st && Array.isArray(st.labels) ? st.labels : null; return L && typeof v === 'number' && Math.floor(v) === v && v >= 0 && v < L.length && L[v] ? L[v] : statFmt(v); }
function statChips(host, def, spec, ovc) {   // the stats shown On the row: a chip each beside the name, its label small ("Acc 2"); F4c2: a dot on a value of the copy's own
    (Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) { if (s.show !== true) return; var ch = el('span', 'sheet-chip sheet-item-stat'); ch.appendChild(el('small', null, s.label)); ch.appendChild(document.createTextNode(' ' + statText(s, rowStat(spec, def, s.key)))); var dt = statDot(s, spec, ovc); if (dt) ch.appendChild(dt); host.appendChild(ch); });
}
function statLine(entry, def, spec) {   // every stat, then what one cost: "Acc 2 · Wt 0.0001 · Paid 500" (the 📝 line: a player reads every stat there)
    var parts = (Array.isArray(spec.stats) ? spec.stats : []).filter(function(s) { return s.hide !== true; }).map(function(s) { return s.label + ' ' + statText(s, rowStat(spec, def, s.key)); });   // 1.5.4: a Hidden stat is worked with, never listed
    if (spec.price) parts.push('Paid ' + statFmt(rowPaid(spec, entry, def)));
    return parts.join(' · ');
}
function statLineNode(entry, def, spec, ovc) {   // F4c2: the line as text (as before), with a dot after each value the copy holds of its own
    var sts = spec.stats.filter(function(s) { return s.hide !== true; }), dots = sts.map(function(s) { return statDot(s, spec, ovc); });   // 1.5.4: never a Hidden stat
    if (!sts.length && !spec.price) return null;   // every stat Hidden and nothing paid to say: no line
    if (!dots.some(Boolean)) return el('div', 'sheet-item-statline', statLine(entry, def, spec));
    var box = el('div', 'sheet-item-statline');
    sts.forEach(function(s, i) { if (i) box.appendChild(document.createTextNode(' · ')); box.appendChild(document.createTextNode(s.label + ' ' + statText(s, rowStat(spec, def, s.key)))); if (dots[i]) box.appendChild(dots[i]); });
    if (spec.price) box.appendChild(document.createTextNode(' · Paid ' + statFmt(rowPaid(spec, entry, def))));   // a dot sits on a listed stat, so one comes before
    return box;
}
// F4c1: what one of a row cost — the GM's box (blank: the list price, shown faintly; one set op per change, the host judges it again); text for
// the owner, and for the GM where nothing can be changed (the Layout preview, a pop-out). labelled: "Paid" before it (a table's header says it)
function paidCtl(entry, def, c, f, spec, editable, gm, labelled) {
    if (!spec.price) return null;
    var lp = Math.max(0, rowStat(spec, def, spec.price)), has = typeof entry.paid === 'number', rid = rowIdOf(entry);
    if (gm && editable) {
        var pi = el('input', 'field sheet-item-paid'); pi.type = 'number'; pi.min = '0'; pi.step = 'any'; pi.dataset.fid = f.id; pi.dataset.part = 'paid-' + rid; pi.value = has ? String(entry.paid) : ''; pi.placeholder = statFmt(lp); pi.title = 'Paid for one (blank: the list price, ' + statFmt(lp) + ')';
        pi.addEventListener('change', function() { if (pi.validity && pi.validity.badInput) { pi.value = has ? String(entry.paid) : ''; return; } var s = String(pi.value).trim(), n = Number(s); if (s === '') { commitItem(c, f, { op: 'set', rowId: rid, facts: { paid: null } }); return; } if (!isFinite(n) || n < 0 || n > LIMITS.statAbs) { pi.value = has ? String(entry.paid) : ''; return; } commitItem(c, f, { op: 'set', rowId: rid, facts: { paid: n } }); });
        if (!labelled) return pi;
        var pl = el('label', 'sheet-item-paidl'); pl.appendChild(el('span', 'sheet-item-paidn', 'Paid')); pl.appendChild(pi); return pl;
    }
    var pc = el('span', 'sheet-chip sheet-item-paid', (labelled ? 'Paid ' : '') + statFmt(has ? entry.paid : lp)); pc.title = has ? 'Price paid for one (list price ' + statFmt(lp) + ')' : 'Not recorded: the list price';
    return pc;
}
function itemListInto(wrap, f, c, carried, sysI, canThrow, editable, gm, empty, res, edit) {   // empty (F4b): the note when nothing shows; res (F5a1): the field's resolved entry (its columns' cells and totals); edit (the sheet's lock): may the character be CHANGED here — a level, a note, a row made, removed or given values of its own (absent: as editable) — where editable is what is used in play: the switch, a count, a use
    editable = editable && _fxLive; canThrow = canThrow && _fxLive;   // the Layout preview and a pop-out draw their controls inert
    var chg = edit === undefined ? editable : !!edit && _fxLive, hudRow = _fxView === 'hud';   // hudRow (the owner, 2026-10-04): the HUD's rows stay short — a description is read on the sheet
    var spec = f.list || null, seenCat = Object.create(null), nCat = 0, unseenL = gm ? unseenKeys(c, f, carried, sysI) : null;   // F4b: a list with options draws its rows' facts, and a category chip while its rows span more than one; F4c3: the keys of rows its owner cannot see (the GM's sheet)
    if (spec) carried.forEach(function(r) { var d0 = rowDef(sysI, r), cc = d0 && d0.def && d0.def.category ? String(d0.def.category).toLowerCase() : ''; if (cc && !seenCat[cc]) { seenCat[cc] = 1; nCat++; } });
    var chips = nCat > 1;
    carried.forEach(function(entry) {
        var rd = rowDef(sysI, entry), def = rd ? rd.def : null; if (!def) return;
        var rid = rowIdOf(entry);
        var line = el('div', 'sheet-item' + (entry.hid === 1 ? ' sheet-item-hid' : ''));
        if (def.icon) line.appendChild(iconNode(def.icon, 'sheet-item-icon'));
        var ovc = ovCtx(entry, rd, gm);   // F4c2: what this copy holds of its own (a dot on each)
        var nm = el('span', 'sheet-item-name', def.name); if (def.area) nm.appendChild(el('span', 'sheet-item-area-tag', ' ' + def.area.ft + ' ft')); if (def.notes) nm.title = def.notes; ovNameDot(nm, ovc, true); line.appendChild(nm);
        if (chips && def.category) line.appendChild(el('span', 'sheet-chip', def.category));
        lostBits(line, rd, entry, c, f, gm, chg); needBits(line, sysI, c, entry, rd, gm); gmItemBits(line, def, entry, gm, !!(spec && spec.on)); keyShareChip(line, entry, rd, unseenL); modsBits(line, def, entry, spec, sysI);
        var noteLn = null;
        if (spec) { statChips(line, def, spec, ovc); colChips(line, spec, res && res.cells ? res.cells[rid] : null); ctCtl(line, entry, c, f, spec, editable, res && res.cts ? res.cts[rid] : null); var lc = lvlCtl(entry, def, c, f, spec, chg); if (lc) line.appendChild(lc); var oc = onCtl(entry, c, f, spec, editable, true); if (oc) line.appendChild(oc); var pcL = paidCtl(entry, def, c, f, spec, chg, gm, true); if (pcL) line.appendChild(pcL); noteLn = hudRow ? null : noteBits(entry, def, c, f, chg, ovc); }   // F4c1: the stats shown On the row, what one cost
        if (def.area && canThrow && (gm || def.vis !== 'gm') && entry.hid !== 1) line.appendChild(itemThrowBtn(def, c, f, rid));   // a GM-only item: the GM's throw only (a player's copy never carries its area)
        rowRollBtns(line, spec, entry, def, c, f, res);   // F5b: the list's rolls on this row
        if (noteLn) line.appendChild(noteToggle(noteLn, entry, c, f));
        var rr = chg ? rowRights(entry, rd, spec, gm, sysI) : ''; if (rr) line.appendChild(editBtn(entry, c, f, rr, rd.src === 'custom'));   // F4c2: ✎ — on a list shaped in the Lists tab, where the row can be changed (never the Layout preview or a pop-out)
        if (editable) { var ub = undoBtn(entry, c, f); if (ub) line.appendChild(ub); if (!(spec && spec.noQty)) line.appendChild(itemQtyCell(entry, c, f)); if (chg) line.appendChild(itemRmBtn(entry, def, c, f)); }
        else if (!(spec && spec.noQty)) line.appendChild(el('span', 'sheet-item-qtyn', '×' + entry.qty));
        wrap.appendChild(line);
        if (noteLn) wrap.appendChild(noteLn);
        if (rr && rfOpen(c, f, rid)) wrap.appendChild(rowForm(entry, rd, c, f, spec, sysI, rr));   // F4c2: its form, under the row (one at a time, in the view it was opened in)
    });
    if (carried.length && spec && res && res.foot) totalsLine(wrap, spec, res.foot);   // F5a1: the list's totals under its rows
    if (!carried.length) wrap.appendChild(el('div', 'sheet-empty-note', empty || 'No items.'));
}
// Stage 6 F5b: a list's rolls on a row — a button each, rolled with the row's own names (Row.lvl, Row.<stat>, a column) through the dice path (the
// host resolves them; a roll on a GM-only item stays private); inert in the Layout preview and a pop-out, and for a viewer who cannot roll for it
function rowRollBtns(host, spec, entry, def, c, f, res) {   // res (R2b): the field's resolved entry (each row's needs)
    if (!spec || !Array.isArray(spec.rolls) || !spec.rolls.length || !(_fxLive || window.wpPrintCopy === true) || entry.hid === 1) return;   // F2b: a print copy draws a row's rolls as the live sheet does
    var rid = rowIdOf(entry), nm = (def && def.name) || 'Item', rollOk = canRoll(c), applyOk = null;
    spec.rolls.forEach(function(r, ri) {
        if (r && Array.isArray(r.apply)) {   // Stage 6 HUD H7b: an apply action on this row (Apply costs on a power), for a viewer who may change the character
            if (applyOk === null) applyOk = canApply(c);
            if (!applyOk || !r.apply.length) return;
            var al = r.label || 'Apply', ab = el('button', 'tool ghost sheet-item-roll sheet-item-apply', al); ab.type = 'button'; ab.title = nm + ' \u00b7 ' + al + ': ' + applyTitle(r, systemOf(getActiveCampaign()));
            var cbA = typeof costBlock === 'function' ? costBlock(c, r.cost) : ''; if (cbA) { ab.disabled = true; ab.title = cbA + ' \u2014 ' + ab.title; }   // turn-based combat T4
            ab.addEventListener('click', function() { var campN = getActiveCampaign(), cN = charById(c.id, campN); if (cN) applyAction(r, cN, nm + ' \u00b7 ' + al, { f: f.id, r: rid, i: ri }); });
            host.appendChild(ab); return;
        }
        if (!rollOk || !r || typeof r.formula !== 'string' || !r.formula) return;
        var lb = r.label || 'Roll', b = el('button', 'tool ghost sheet-item-roll', lb); b.type = 'button'; b.title = nm + ' \u00b7 ' + lb + ': ' + r.formula + ' (shift-click adds a modifier)';
        var nOk = !r.needs || !(res && res.rn && res.rn[rid]) || res.rn[rid][ri] !== false, withE = !!(Array.isArray(r.then) && r.then.length) || !!r.needs || !!r.malf || !!r.cost || !!r.dmg;   // Stage 6 HUD R2b: its needs for this row; a roll with consequences or needs names its index
        if (!nOk) { b.disabled = true; b.title = (r.needsText || 'Not now') + ' \u2014 it needs ' + r.needs; }
        var cbL = typeof costBlock === 'function' ? costBlock(c, r.cost) : ''; if (cbL) { b.disabled = true; b.title = cbL + ' \u2014 ' + nm + ' \u00b7 ' + lb; }   // turn-based combat T4
        b.addEventListener('click', function(e) { sheetRoll(e, c.id, r.formula, nm + ' \u00b7 ' + lb, { row: withE ? { f: f.id, r: rid, i: ri } : { f: f.id, r: rid } }); });
        host.appendChild(b);
    });
}
// Stage 6 HUD R2: a row's counters — a chip each (Charges 12/20); −/+ for whoever may change the row's facts (one set op a click, the host judges it)
function ctCtl(host, entry, c, f, spec, editable, cells) {
    if (!spec || !Array.isArray(spec.counters) || !spec.counters.length || entry.hid === 1) return;
    var rid = rowIdOf(entry), byKey = {}; (Array.isArray(cells) ? cells : []).forEach(function(x) { if (x && typeof x.key === 'string') byKey[x.key] = x; });
    spec.counters.forEach(function(t) {
        if (!t || typeof t.key !== 'string') return;
        var cell = byKey[t.key], v = cell && typeof cell.value === 'number' ? cell.value : (entry.ct && typeof entry.ct[t.key] === 'number' ? entry.ct[t.key] : (t.def || 0)), mx = cell && typeof cell.max === 'number' ? cell.max : null;
        var w = el('span', 'sheet-chip sheet-item-ct'); w.title = t.label || t.key;
        w.appendChild(el('span', 'sheet-item-ctl', (t.label || t.key) + ' '));
        var set = function(n) { var o = {}; o[t.key] = n; commitItem(c, f, { op: 'set', rowId: rid, facts: { ct: o } }); };
        if (editable) { var mb = el('button', 'tool ghost sheet-item-ctb', '\u2212'); mb.type = 'button'; mb.title = 'One less'; mb.disabled = v <= 0; mb.addEventListener('click', function() { set(v - 1); }); w.appendChild(mb); }
        w.appendChild(el('b', 'sheet-item-ctv', fmtNum(v) + (mx !== null ? '/' + fmtNum(mx) : '')));
        if (editable) { var pb = el('button', 'tool ghost sheet-item-ctb', '+'); pb.type = 'button'; pb.title = 'One more'; pb.disabled = mx !== null && v >= mx; pb.addEventListener('click', function() { set(v + 1); }); w.appendChild(pb); }
        host.appendChild(w);
    });
}
// Stage 6 F5a1: the columns shown on a row — a chip each, its label small ("Cost 11 pts"); an error reads "\u2014" with the message on hover
function colChips(host, spec, cells) {
    if (!cells || !Array.isArray(spec.cols)) return;
    spec.cols.forEach(function(cc, i) { var v = cells[i]; if (cc.hide === true || !v) return; var ch = el('span', 'sheet-chip sheet-item-col' + (v.error ? ' sheet-item-colerr' : '')); ch.appendChild(el('small', null, cc.label)); ch.appendChild(document.createTextNode(' ' + v.text + (cc.unit && !v.error ? ' ' + cc.unit : ''))); if (v.error) ch.title = v.error; host.appendChild(ch); });
}
// F5a1: the totals under a list — each stat shown on the row and each column marked Total, summed over the rows carried (a kept curse is not)
function totalsLine(wrap, spec, foot) {
    var parts = [];
    (Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) { if (foot[s.key]) parts.push({ lab: s.label, t: foot[s.key] }); });
    (Array.isArray(spec.cols) ? spec.cols : []).forEach(function(cc) { if (foot[cc.key]) parts.push({ lab: cc.label, t: foot[cc.key], unit: cc.unit }); });
    if (!parts.length) return;
    var tl = el('div', 'sheet-item-totals'); tl.appendChild(el('span', 'sheet-item-totals-cap', 'Total'));
    parts.forEach(function(p) { var sp = el('span', 'sheet-chip sheet-item-total'); sp.appendChild(el('small', null, p.lab)); sp.appendChild(document.createTextNode(' ' + p.t.text + (p.unit && !p.t.error ? ' ' + p.unit : ''))); if (p.t.error) sp.title = p.t.error; tl.appendChild(sp); });
    wrap.appendChild(tl);
}
function itemTableInto(wrap, f, c, carried, sysI, canThrow, editable, gm, empty, res, edit) {   // res (F5a1): the field's resolved entry; edit (the sheet's lock): as itemListInto's
    editable = editable && _fxLive; canThrow = canThrow && _fxLive;   // the Layout preview and a pop-out draw their controls inert
    var chg = edit === undefined ? editable : !!edit && _fxLive, hudRow = _fxView === 'hud';
    var tbl = f.table, cols = (tbl.columns || []).slice(), spec = f.list || null, hasL = !!(spec && spec.lvl), hasO = !!(spec && spec.on), hasQ = !(spec && spec.noQty);   // F4b: a level and a switch column; no quantity
    var shownSt = spec && Array.isArray(spec.stats) ? spec.stats.filter(function(s) { return s && s.show === true; }) : [], nStat = shownSt.length, hasP = !!(spec && spec.price);   // F4c1: a column per stat shown On the row, and Paid
    var shownCl = spec && Array.isArray(spec.cols) ? spec.cols.map(function(cc, i) { return { c: cc, i: i }; }).filter(function(x) { return x.c && x.c.hide !== true; }) : [], nCol = shownCl.length;   // F5a1: a column per list column not Hidden
    var unseenT = gm ? unseenKeys(c, f, carried, sysI) : null;   // F4c3: the keys of rows its owner cannot see (the GM's sheet)
    if (tbl.chips) cols = cols.filter(function(x) { return x !== 'category'; });   // a chip beside the name replaces the column
    var wantNotes = cols.indexOf('notes') >= 0; cols = cols.filter(function(x) { return x !== 'notes'; });   // notes render as an expandable row, not a column
    var hasAct = editable || canThrow || wantNotes || !!spec, span = 1 + cols.length + nStat + nCol + (hasL ? 1 : 0) + (hasO ? 1 : 0) + (hasQ ? 1 : 0) + (hasP ? 1 : 0) + (hasAct ? 1 : 0);
    var table = el('table', 'sheet-itemtable'), thead = el('thead'), htr = el('tr');
    htr.appendChild(el('th', 'sheet-itcol-name', 'Item'));
    cols.forEach(function(col) { htr.appendChild(el('th', 'sheet-itcol-' + col, ITEM_COL_LABEL[col] || col)); });
    shownSt.forEach(function(s) { htr.appendChild(el('th', 'sheet-itcol-stat', s.label)); });
    shownCl.forEach(function(x) { htr.appendChild(el('th', 'sheet-itcol-col', x.c.label + (x.c.unit ? ' (' + x.c.unit + ')' : ''))); });   // F5a1
    if (hasL) htr.appendChild(el('th', 'sheet-itcol-lvl', spec.lvl.label));
    if (hasO) htr.appendChild(el('th', 'sheet-itcol-on', spec.on.label));
    if (hasQ) htr.appendChild(el('th', 'sheet-itcol-qty', 'Qty'));
    if (hasP) htr.appendChild(el('th', 'sheet-itcol-paid', 'Paid'));
    if (hasAct) htr.appendChild(el('th', 'sheet-itcol-act', ''));
    thead.appendChild(htr); table.appendChild(thead);
    var tbody = el('tbody'), shown = 0, totalQty = 0;
    carried.forEach(function(entry) {
        var rd = rowDef(sysI, entry), def = rd ? rd.def : null; if (!def) return;
        var rid = rowIdOf(entry);
        shown++; totalQty += entry.qty;
        var tr = el('tr', entry.hid === 1 ? 'sheet-item-hid' : null), nameTd = el('td', 'sheet-itcol-name');
        if (def.icon) nameTd.appendChild(iconNode(def.icon, 'sheet-item-icon'));
        nameTd.appendChild(document.createTextNode(def.name));
        if (def.area) nameTd.appendChild(el('span', 'sheet-item-area-tag', ' ' + def.area.ft + ' ft'));
        var ovT = ovCtx(entry, rd, gm); ovNameDot(nameTd, ovT);   // F4c2: a dot when the copy holds values of its own
        if (tbl.chips && def.category) nameTd.appendChild(el('span', 'sheet-chip', def.category));
        lostBits(nameTd, rd, entry, c, f, gm, chg); needBits(nameTd, sysI, c, entry, rd, gm); gmItemBits(nameTd, def, entry, gm, hasO); keyShareChip(nameTd, entry, rd, unseenT); modsBits(nameTd, def, entry, spec, sysI);
        tr.appendChild(nameTd);
        cols.forEach(function(col) { tr.appendChild(el('td', 'sheet-itcol-' + col, itemCellText(col, def))); });
        shownSt.forEach(function(s) { var sTd = el('td', 'sheet-itcol-stat', statText(s, rowStat(spec, def, s.key))), sDt = statDot(s, spec, ovT); if (sDt) sTd.appendChild(sDt); tr.appendChild(sTd); });
        var cellsT = res && res.cells ? res.cells[rid] : null; shownCl.forEach(function(x) { var v = cellsT ? cellsT[x.i] : null, cTd = el('td', 'sheet-itcol-col' + (v && v.error ? ' sheet-item-colerr' : ''), v ? v.text + (x.c.unit && !v.error ? ' ' + x.c.unit : '') : ''); if (v && v.error) cTd.title = v.error; tr.appendChild(cTd); });   // F5a1: its columns
        if (hasL) { var lTd = el('td', 'sheet-itcol-lvl'), lcT = lvlCtl(entry, def, c, f, spec, chg); if (lcT) lTd.appendChild(lcT); tr.appendChild(lTd); }
        if (hasO) { var oTd = el('td', 'sheet-itcol-on'), ocT = onCtl(entry, c, f, spec, editable, false); if (ocT) oTd.appendChild(ocT); tr.appendChild(oTd); }
        if (hasQ) {
            var qtyTd = el('td', 'sheet-itcol-qty');
            qtyTd.appendChild(editable ? itemQtyCell(entry, c, f) : el('span', 'sheet-item-qtyn', '×' + entry.qty));
            tr.appendChild(qtyTd);
        }
        if (hasP) { var pTd = el('td', 'sheet-itcol-paid'), pcT = paidCtl(entry, def, c, f, spec, chg, gm, false); if (pcT) pTd.appendChild(pcT); tr.appendChild(pTd); }
        var notesRow = null, rrT = chg ? rowRights(entry, rd, spec, gm, sysI) : '';   // F4c2: who may change this copy's own values here
        if (hasAct) {
            var actTd = el('td', 'sheet-itcol-act');
            if (def.area && canThrow && (gm || def.vis !== 'gm') && entry.hid !== 1) actTd.appendChild(itemThrowBtn(def, c, f, rid));
            if (hudRow) { /* no details line in the HUD */ } else if (spec) {   // F4b: 📝 — the item's notes and the row's own note
                var nbT = noteBits(entry, def, c, f, chg, ovT);
                if (nbT) { notesRow = el('tr', 'sheet-itemtable-notes'); var ntdS = el('td'); ntdS.colSpan = span; ntdS.appendChild(nbT); notesRow.appendChild(ntdS); actTd.appendChild(noteToggle(notesRow, entry, c, f)); }
            } else if (wantNotes && def.notes) {
                notesRow = el('tr', 'sheet-itemtable-notes'); var ntd = el('td', null, def.notes); ntd.colSpan = span; notesRow.appendChild(ntd); notesRow.style.display = 'none';
                var nt = el('button', 'tool ghost sheet-item-notes-t', '📝'); nt.title = 'Notes';
                nt.addEventListener('click', function() { notesRow.style.display = notesRow.style.display === 'none' ? '' : 'none'; });
                actTd.appendChild(nt);
            }
            ctCtl(actTd, entry, c, f, spec, editable, res && res.cts ? res.cts[rowIdOf(entry)] : null);   // Stage 6 HUD R2: its counters
            rowRollBtns(actTd, spec, entry, def, c, f, res);   // F5b: the list's rolls
            if (rrT) actTd.appendChild(editBtn(entry, c, f, rrT, rd.src === 'custom'));   // F4c2: ✎
            if (editable) { var ubT = undoBtn(entry, c, f); if (ubT) actTd.appendChild(ubT); if (chg) actTd.appendChild(itemRmBtn(entry, def, c, f)); }
            tr.appendChild(actTd);
        }
        tbody.appendChild(tr);
        if (notesRow) tbody.appendChild(notesRow);
        if (rrT && rfOpen(c, f, rid)) { var fTr = el('tr', 'sheet-itemtable-form'), fTd = el('td'); fTd.colSpan = span; fTd.appendChild(rowForm(entry, rd, c, f, spec, sysI, rrT)); fTr.appendChild(fTd); tbody.appendChild(fTr); }   // F4c2: its form, across the table
    });
    if (!shown) { var er = el('tr'), ec = el('td', 'sheet-empty-note', empty || 'No items.'); ec.colSpan = span; er.appendChild(ec); tbody.appendChild(er); }
    table.appendChild(tbody);
    if (tbl.footer && shown) {
        var tfoot = el('tfoot'), ftr = el('tr'), fc = el('td', 'sheet-itft', shown + (shown === 1 ? ' item' : ' items')), ftT = res && res.foot ? res.foot : null;
        if (!ftT) { fc.colSpan = 1 + cols.length + nStat + nCol + (hasL ? 1 : 0) + (hasO ? 1 : 0); ftr.appendChild(fc); }
        else {   // F5a1: the totals under their columns (a stat shown on the row, a column marked Total)
            fc.colSpan = 1 + cols.length; ftr.appendChild(fc);
            var ftd = function(t) { var td = el('td', 'sheet-itft-sum', t ? t.text : ''); if (t && t.error) td.title = t.error; return td; };
            shownSt.forEach(function(s) { ftr.appendChild(ftd(ftT[s.key])); }); shownCl.forEach(function(x) { ftr.appendChild(ftd(ftT[x.c.key])); });
            if (hasL) ftr.appendChild(el('td', null, '')); if (hasO) ftr.appendChild(el('td', null, ''));
        }
        if (hasQ) ftr.appendChild(el('td', 'sheet-itft-qty', '×' + totalQty));
        if (hasP) ftr.appendChild(el('td', null, ''));   // F4c1: under Paid (F5a totals it)
        if (hasAct) ftr.appendChild(el('td', null, ''));
        tfoot.appendChild(ftr); table.appendChild(tfoot);
    }
    wrap.appendChild(table);
}
// Stage 6 F4c2: a copy's own values (ov). ✎ on a row of a list shaped in the Lists tab (a plain list draws as before) opens its form under the
// row: the GM changes a linked copy (the library's, or a deleted one's copy); its owner changes its stats while the system lets players (the
// Lists tab's Rules: Setting A), never one the GM set. Each box commits on change; an empty box follows the library, whose value shows faintly;
// ↺ takes one back, Follow the library all of them. One form at a time, in the view it was opened in; what is typed survives a redraw. Text
// reaches the page only as textContent, value, placeholder and title; a part (focus after the redraw) is built from a row id and a stat key only
var _rowForm = null;   // { charId, fieldId, rowId, view, typed: { part: text } }
var OV_WORD = { name: 'name', icon: 'icon', category: 'category', notes: 'notes', area: 'blast', damage: 'damage', cost: 'cost formula', rm: 'removal', rmMsg: 'removal message', eq: 'switch-off', eqMsg: 'switch-off message' }, SK_RE = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
function rowRights(entry, rd, spec, gm, sysI) {   // who may change this copy's own values here: 'gm', 'stats' (its owner, Setting A) or '' (no ✎); F4c3: a custom row itself — 'gm', or 'own' (its owner, on a row they made, while the list takes custom rows)
    if (!spec || !rd) return '';
    if (gm) return rd.src === 'lib' || rd.src === 'lost' || rd.src === 'custom' ? 'gm' : '';
    if (rd.src === 'custom') return entry.own === 1 && spec.custom === true && !(rd.def && rd.def.vis === 'gm') ? 'own' : '';
    return rd.src === 'lib' && !!(sysI && sysI.listRules && sysI.listRules.ownerStats === true) && Array.isArray(spec.stats) && spec.stats.length > 0 ? 'stats' : '';
}
function rfOpen(c, f, rid, view) { return !!(_rowForm && _rowForm.charId === c.id && _rowForm.fieldId === f.id && _rowForm.rowId === rid && (_rowForm.view || 'sheet') === (view || _fxView)); }
function editBtn(entry, c, f, mode, cust) {   // ✎ opens this row's form (or closes it), in the view it is drawn in (kept now: another view may be drawn before the click); cust (F4c3): a custom row
    var rid = rowIdOf(entry), vw = _fxView, b = el('button', 'tool ghost sheet-item-edit', '✎'); b.type = 'button';
    b.title = cust ? 'Change it' : mode === 'gm' ? 'Change this copy' : 'Change this copy’s stats'; b.dataset.fid = f.id; b.dataset.part = 'ed-' + rid;
    b.addEventListener('click', function() { _rowForm = rfOpen(c, f, rid, vw) ? null : { charId: c.id, fieldId: f.id, rowId: rid, view: vw, typed: {} }; renderViews(c.id); });
    return b;
}
// F4c3 (critic 7): the keys of the rows of a list its owner cannot see (GM-only, or a curse kept out of their sight), worked out once a draw and only
// when a custom row asks. A custom row its owner sees whose key one of those has gets a mark on the GM's sheet: their sheet (and the host's roll
// path) see only theirs, so F5a's addressed lookup reads the rows its owner can see first, on every machine
function unseenKeys(c, f, carried, sysI) {
    var m = null, dup = null, all = function() { return c && c.values && Array.isArray(c.values[f.id]) ? c.values[f.id] : carried; };
    var get = function() {
        if (m) return m; m = Object.create(null);
        all().forEach(function(r) { var d = r && typeof r === 'object' ? rowDef(sysI, r) : null, k = d && d.def && typeof d.def.key === 'string' ? d.def.key.toLowerCase() : ''; if (k && (r.hid === 1 || d.def.vis === 'gm')) m[k] = 1; });
        return m;
    };
    get.dup = function() {   // owed review F4c3#3: a key two of its visible rows hold, or a row and an item or core entry of the list (taken after the custom row had it)
        if (dup) return dup; dup = Object.create(null); var n = Object.create(null), cats = f.list && Array.isArray(f.list.cats) && f.list.cats.length ? f.list.cats.map(function(x) { return String(x).toLowerCase(); }) : null;
        all().forEach(function(r) { var d = r && typeof r === 'object' ? rowDef(sysI, r) : null, k = d && d.def && typeof d.def.key === 'string' ? d.def.key.toLowerCase() : ''; if (k && r.hid !== 1 && d.def.vis !== 'gm' && d.src !== 'lib' && d.src !== 'item') n[k] = (n[k] | 0) + 1; });
        ((sysI && sysI.items) || []).concat((sysI && sysI.core) || []).forEach(function(it) { var k = it && typeof it.key === 'string' ? it.key.toLowerCase() : ''; if (k && (!cats || cats.indexOf(String(it.category || '').toLowerCase()) >= 0)) n[k] = (n[k] | 0) + 1; });
        Object.keys(n).forEach(function(k) { if (n[k] > 1) dup[k] = 1; });
        return dup;
    };
    return get;
}
function keyShareChip(host, entry, rd, unseen) {
    var d = rd && rd.src === 'custom' ? rd.def : null, k = d && typeof d.key === 'string' ? d.key.toLowerCase() : '';
    if (!unseen || !k || entry.hid === 1 || d.vis === 'gm') return;
    if (unseen()[k] !== 1) { if (unseen.dup && unseen.dup()[k] === 1) { var cd = el('span', 'sheet-chip sheet-item-keyshare', 'key shared with another row or item'); cd.title = 'Another row or an item of this list has the key ' + d.key + ' too; formulas that read the key (List.key.lvl) find this row first'; host.appendChild(cd); } return; }
    var ch = el('span', 'sheet-chip sheet-item-keyshare', 'key shared with a GM-only row'); ch.title = 'A row its player cannot see (GM-only, or kept out of their sight) on this list has the key ' + d.key + ' too; formulas that read the key (List.key.lvl) find this row on their sheet'; host.appendChild(ch);
}
function ovDot(title) { var d = el('span', 'sheet-ov', '•'); d.title = title; return d; }
function ovCtx(entry, rd, gm) {   // what a copy holds of its own, for its dots: null when nothing (a row with no ov draws as before)
    var o = entry && entry.ov && typeof entry.ov === 'object' ? entry.ov : null; if (!o || !rd) return null;
    var st = Object.create(null), hd = Object.create(null);
    if (o.stats && typeof o.stats === 'object') Object.keys(o.stats).forEach(function(k) { st[k.toLowerCase()] = 1; });
    if (Array.isArray(o.held)) o.held.forEach(function(k) { if (typeof k === 'string') hd[k.toLowerCase()] = 1; });
    return { ov: o, st: st, held: hd, base: rd.base || {}, lost: rd.src === 'lost', gm: !!gm };
}
function ovBaseText(k, b) {
    var v = b[k];
    if (k === 'area') return v && typeof v === 'object' && v.ft ? v.ft + ' ft' : '(none)';
    if (k === 'rm' || k === 'eq') return v === 'bound' ? 'bound' : v === 'curse' ? 'curse on contact' : 'free';
    return typeof v === 'string' && v ? v : '(none)';
}
function ovNameDot(host, ovc, first) {   // the name's dot: one clause per field of its own ("Changed on this copy · name, library: Blaster"); first: before the name (a list row's name is cut short at its end)
    if (!ovc) return;
    var parts = []; Object.keys(OV_WORD).forEach(function(k) { if (ovc.ov[k] !== undefined) parts.push(OV_WORD[k] + ', ' + (ovc.lost ? 'its copy: ' : 'library: ') + ovBaseText(k, ovc.base)); });
    if (!parts.length) return; var d = ovDot('Changed on this copy · ' + parts.join(' · ')); if (first) host.insertBefore(d, host.firstChild); else host.appendChild(d);
}
function statDot(s, spec, ovc) {   // a stat's dot ("Changed on this copy · library: 3"; its owner reads which the GM set)
    var lk = s && typeof s.key === 'string' ? s.key.toLowerCase() : ''; if (!ovc || !lk || ovc.st[lk] !== 1) return null;
    return ovDot('Changed on this copy' + (!ovc.gm && ovc.held[lk] === 1 ? ' by the GM' : '') + ' · ' + (ovc.lost ? 'its copy: ' : 'library: ') + statText(s, rowStat(spec, ovc.base, s.key)));
}
var _rfClearing = false;   // F4c2 review: true while buildSections clears a view (a blur there fires change: the form keeps what was typed instead)
// The form: mode 'gm' — a linked copy's own name, icon, category, notes, stats, blast, formulas and its removal and switch locks; mode 'stats' —
// its owner's own stats (one the GM set is read-only, "Set by the GM"). Drawn only where ✎ is (editable, rowRights)
// A list naming no categories: the categories of the items and core entries in sight, and on the GM's machine the library's (owed review
// F4c3#9: once the items moved into the library, a custom row found none); a player never gets the library's hidden ones
function catChoices(sysI) {
    var out = []; ((sysI && sysI.items) || []).concat((sysI && sysI.core) || []).forEach(function(it) { if (it && it.category) out.push(it.category); });
    var LBk = window.wpLibrary; if (typeof isClient === 'function' && !isClient() && LBk && LBk.catsFor) { var lcs = LBk.catsFor(); if (lcs) out = out.concat(lcs.show || [], lcs.hide || []); }
    return out;
}
function rowForm(entry, rd, c, f, spec, sysI, mode) {
    if (rd.src === 'custom') return customForm(entry, rd, c, f, spec, sysI, mode);   // F4c3: a custom row's own form (its values are its own: nothing behind them)
    var rid = rowIdOf(entry), ov = entry.ov && typeof entry.ov === 'object' ? entry.ov : {}, base = rd.base || {}, lost = rd.src === 'lost', stRef = _rowForm, typed = stRef && stRef.typed ? stRef.typed : {};
    var lib = lost ? 'Its copy: ' : 'Library: ', ovS = ov.stats && typeof ov.stats === 'object' ? ov.stats : {}, heldL = (Array.isArray(ov.held) ? ov.held : []).map(function(k) { return String(k).toLowerCase(); });
    var form = el('div', 'sheet-row-form'), head = el('div', 'sheet-rf-head'), grid = el('div', 'sheet-rf-grid');
    var send = function(p) { commitItem(c, f, { op: 'ov', rowId: rid, ov: p }); }, one = function(k, v) { var p = {}; p[k] = v; send(p); }, partOf = function(name) { return 'rf-' + rid + '-' + name; };
    var keepTyped = function(ctl, part) { if (typeof typed[part] === 'string') ctl.value = typed[part]; ctl.addEventListener('input', function() { if (stRef && stRef.typed) stRef.typed[part] = ctl.value; }); };
    var took = function(part) { if (stRef && stRef.typed) delete stRef.typed[part]; };
    var hold = function(part, v) { if (!_rfClearing) return false; if (stRef && stRef.typed) stRef.typed[part] = v; return true; };   // the view is being cleared: keep it typed, commit nothing
    var add = function(cap, ctl, name, over, back, title) {   // a caption, the control, and ↺ while this copy holds a value of its own
        var l = el('label', 'sheet-rf-f'), part = partOf(name); l.appendChild(el('span', 'sheet-rf-cap', cap)); ctl.dataset.fid = f.id; ctl.dataset.part = part; if (title) ctl.title = title; l.appendChild(ctl);
        if (over) { var bk = el('button', 'tool ghost sheet-rf-back', '↺'); bk.type = 'button'; bk.title = lost ? 'Back to its copy’s' : 'Back to the library’s'; bk.dataset.fid = f.id; bk.dataset.part = part; bk.addEventListener('click', function() { back(); }); l.appendChild(bk); }
        grid.appendChild(l);
    };
    var text = function(k, cap, max, ph) {   // a text of the copy's own; empty follows the base
        var i = el('input', 'field sheet-rf-in'); i.type = 'text'; i.maxLength = max; i.value = typeof ov[k] === 'string' ? ov[k] : ''; i.placeholder = ph; keepTyped(i, partOf(k));
        i.addEventListener('change', function() { if (hold(partOf(k), i.value)) return; took(partOf(k)); one(k, i.value.trim() ? i.value : null); });
        add(cap, i, k, ov[k] !== undefined, function() { one(k, null); });
    };
    var lockSel = function(k, cap, w) {   // a lock of the copy's own: none (free), bound, curse on contact; '' follows the base
        var s = el('select', 'field sheet-rf-sel'); s.appendChild(opt('', lib + (base[k] === 'bound' ? w.bound : base[k] === 'curse' ? w.curse : w.none), ov[k] === undefined));
        [['none', w.none], ['bound', w.bound], ['curse', w.curse]].forEach(function(o) { s.appendChild(opt(o[0], o[1], ov[k] === o[0])); });
        s.addEventListener('change', function() { one(k, s.value || null); });
        add(cap, s, k, ov[k] !== undefined, function() { one(k, null); });
    };
    var ownS = Object.keys(ovS).filter(function(k) { return heldL.indexOf(k.toLowerCase()) < 0; });
    if (mode === 'gm' ? Object.keys(ov).length > 0 : ownS.length > 0) {
        var fb = el('button', 'tool ghost sys-btn sheet-rf-follow', lost ? 'Back to its copy' : 'Follow the library'); fb.type = 'button'; fb.dataset.fid = f.id; fb.dataset.part = 'ed-' + rid;
        fb.title = mode === 'gm' ? (lost ? 'Every value of this copy back to the copy kept when the item left the library' : 'Every value of this copy back to the library’s') : 'Your own stats back to the library’s (a stat the GM set stays)';
        fb.addEventListener('click', function() { send(mode === 'gm' ? null : { stats: null }); }); head.appendChild(fb);
    }
    var dn = el('button', 'tool ghost sys-btn sheet-rf-done', 'Done'); dn.type = 'button'; dn.dataset.fid = f.id; dn.dataset.part = 'ed-' + rid;
    dn.addEventListener('click', function() { _rowForm = null; renderViews(c.id); }); head.appendChild(dn);
    form.appendChild(head); form.appendChild(grid);
    if (mode === 'gm') {
        text('name', 'Name', LIMITS.name, base.name || '');
        text('icon', 'Icon', 48, base.icon || 'An emoji, or icon:name');
        var cats = [], seenC = Object.create(null), pushC = function(x) { var t = String(x || '').trim(); if (t && !seenC[t.toLowerCase()]) { seenC[t.toLowerCase()] = 1; cats.push(t); } };
        if (spec && Array.isArray(spec.cats) && spec.cats.length) spec.cats.forEach(pushC); else catChoices(sysI).forEach(pushC);
        if (typeof ov.category === 'string' && ov.category && cats.indexOf(ov.category) < 0) cats.push(ov.category);   // its own spelling (blade where the list says Blade) is an option of its own, chosen
        var cs = el('select', 'field sheet-rf-sel'); cs.appendChild(opt('', lib + (base.category || '(none)'), ov.category === undefined)); cats.forEach(function(x) { cs.appendChild(opt(x, x, ov.category === x)); });
        cs.addEventListener('change', function() { one('category', cs.value || null); });
        add('Category', cs, 'category', ov.category !== undefined, function() { one('category', null); });
        text('notes', 'Notes', LIMITS.text, base.notes || '');
    }
    (spec && Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) {
        if (!s || typeof s.key !== 'string' || !SK_RE.test(s.key)) return;
        var k = s.key, lk = k.toLowerCase(), mine, name = 's-' + k, part = partOf(name), bv = rowStat(spec, base, k), lock = mode === 'stats' && heldL.indexOf(lk) >= 0, ctl;
        Object.keys(ovS).forEach(function(x) { if (mine === undefined && x.toLowerCase() === lk && (typeof ovS[x] === 'number' || (s.kind === 'pick' && typeof ovS[x] === 'string'))) mine = ovS[x]; });
        var put = function(n) { var p = {}; p[k] = n; send({ stats: p }); }, shown = typeof mine === 'number' ? String(mine) : '';
        if (s.kind === 'pick') {   // F5a2: a choice — its labels
            ctl = el('select', 'field sheet-rf-sel'); ctl.appendChild(opt('', lib + statText(s, bv), mine === undefined));
            (s.opts || []).forEach(function(o) { ctl.appendChild(opt(o.label, o.label, typeof mine === 'string' && mine.toLowerCase() === o.label.toLowerCase())); });
            ctl.addEventListener('change', function() { put(ctl.value === '' ? null : ctl.value); });
        } else if (Array.isArray(s.labels) && s.labels.length) {
            ctl = el('select', 'field sheet-rf-sel'); ctl.appendChild(opt('', lib + statText(s, bv), mine === undefined));
            s.labels.forEach(function(t, i) { ctl.appendChild(opt(String(i), t || String(i), mine === i)); });
            if (typeof mine === 'number' && !(mine >= 0 && mine < s.labels.length && Math.floor(mine) === mine)) { var xo = opt(shown, statFmt(mine), true); xo.disabled = true; ctl.appendChild(xo); }   // a value past the names
            ctl.addEventListener('change', function() { put(ctl.value === '' ? null : Number(ctl.value)); });
        } else {
            ctl = el('input', 'field sheet-rf-num'); ctl.type = 'number'; ctl.step = 'any'; ctl.value = shown; ctl.placeholder = statFmt(bv); keepTyped(ctl, part);
            ctl.addEventListener('change', function() { if (hold(part, ctl.value)) return; took(part); var sv = String(ctl.value).trim(), n = Number(sv); if (ctl.validity && ctl.validity.badInput) { ctl.value = shown; return; } if (sv === '') { put(null); return; } if (!isFinite(n) || Math.abs(n) > LIMITS.statAbs) { ctl.value = shown; return; } put(n); });
        }
        if (lock) ctl.disabled = true;
        add(s.label || k, ctl, name, mine !== undefined && !lock, function() { put(null); }, lock ? 'Set by the GM' : lib + statText(s, bv));
    });
    if (mode === 'gm') {
        var bi = el('input', 'field sheet-rf-num'), bShown = ov.area && typeof ov.area === 'object' && ov.area.ft ? String(ov.area.ft) : ''; bi.type = 'number'; bi.min = '0'; bi.max = String(LIMITS.maxBlastFt); bi.step = '1'; bi.value = bShown; bi.placeholder = base.area && base.area.ft ? String(base.area.ft) : 'none'; keepTyped(bi, partOf('ft'));
        bi.addEventListener('change', function() { if (hold(partOf('ft'), bi.value)) return; took(partOf('ft')); var sv = String(bi.value).trim(), n = Math.round(Number(sv)); if (bi.validity && bi.validity.badInput) { bi.value = bShown; return; } if (sv === '') { one('area', null); return; } if (!isFinite(n) || n > LIMITS.maxBlastFt) { bi.value = bShown; return; } one('area', n > 0 ? { ft: n, name: base.area && base.area.name ? base.area.name : '' } : null); });
        add('Blast ft', bi, 'ft', ov.area !== undefined, function() { one('area', null); }, 'A blast of this copy’s own (empty: ' + (base.area && base.area.ft ? base.area.ft + ' ft' : 'none') + ')');
        text('damage', 'Damage', LIMITS.formula, base.damage || 'A roll: 2d6 + STRmod');
        text('cost', 'Cost formula', LIMITS.formula, base.cost || 'No dice');
        lockSel('rm', 'When a player removes it', { none: 'A player may remove it', bound: 'Bound: only you remove it', curse: 'Curse on contact' });
        text('rmMsg', 'Message on removal', LIMITS.rmMsg, base.rmMsg || '');
        if (spec && spec.on && typeof spec.on === 'object') { lockSel('eq', 'When a player switches it off', { none: 'A player may switch it off', bound: 'Bound: it stays on', curse: 'Curse on contact: you keep it on' }); text('eqMsg', 'Message on switching off', LIMITS.rmMsg, base.eqMsg || ''); }
    }
    return form;
}
// Stage 6 F4c3: a custom row's form (the character's own item) — its values as they are, nothing behind them (no placeholders, no ↺): name, icon,
// category (the list's categories, else those of the items drawn from, plus its own; or none), notes, key and stats, for its owner ('own') and
// the GM ('gm'); the GM's also a blast, the damage and cost formulas, the two locks (a message while one holds) and GM only. Each box commits
// on change (a custom op of that one field) and what is typed survives a redraw. A new row's form puts the cursor in its name, once
function customForm(entry, rd, c, f, spec, sysI, mode) {
    var rid = rowIdOf(entry), d = rd.def && typeof rd.def === 'object' ? rd.def : {}, stRef = _rowForm, typed = stRef && stRef.typed ? stRef.typed : {}, gmF = mode === 'gm';
    var form = el('div', 'sheet-row-form sheet-row-custom'), head = el('div', 'sheet-rf-head'), grid = el('div', 'sheet-rf-grid');
    var one = function(k, v) { var p = {}; p[k] = v; commitItem(c, f, { op: 'custom', rowId: rid, def: p }); }, partOf = function(name) { return 'rf-' + rid + '-' + name; };
    var keepTyped = function(ctl, part) { if (typeof typed[part] === 'string') ctl.value = typed[part]; ctl.addEventListener('input', function() { if (stRef && stRef.typed) stRef.typed[part] = ctl.value; }); };
    var took = function(part) { if (stRef && stRef.typed) delete stRef.typed[part]; };
    var hold = function(part, v) { if (!_rfClearing) return false; if (stRef && stRef.typed) stRef.typed[part] = v; return true; };   // the view is being cleared: keep it typed, commit nothing
    var add = function(cap, ctl, name, title) { var l = el('label', 'sheet-rf-f'); l.appendChild(el('span', 'sheet-rf-cap', cap)); ctl.dataset.fid = f.id; ctl.dataset.part = partOf(name); if (title) ctl.title = title; l.appendChild(ctl); grid.appendChild(l); return ctl; };
    var text = function(k, cap, max, val, title, trim) {   // a text of its own; blank clears it (a blank name keeps the name)
        var i = el('input', 'field sheet-rf-in'); i.type = 'text'; i.maxLength = max; i.value = val; keepTyped(i, partOf(k));
        i.addEventListener('change', function() { if (hold(partOf(k), i.value)) return; took(partOf(k)); var s = trim ? i.value.trim() : i.value; one(k, s.trim() ? s : null); });
        return add(cap, i, k, title);
    };
    var lockSel = function(k, cap, w) {   // a lock: none, bound, curse on contact
        var s = el('select', 'field sheet-rf-sel'), now = d[k] === 'bound' || d[k] === 'curse' ? d[k] : '';
        [['', w.none], ['bound', w.bound], ['curse', w.curse]].forEach(function(o) { s.appendChild(opt(o[0], o[1], now === o[0])); });
        s.addEventListener('change', function() { one(k, s.value || null); }); add(cap, s, k);
    };
    var dn = el('button', 'tool ghost sys-btn sheet-rf-done', 'Done'); dn.type = 'button'; dn.dataset.fid = f.id; dn.dataset.part = 'ed-' + rid;
    dn.addEventListener('click', function() { _rowForm = null; renderViews(c.id); }); head.appendChild(dn);
    form.appendChild(head); form.appendChild(grid);
    var nb = text('name', 'Name', LIMITS.name, d.name || '', 'Its name (blank keeps it)');
    text('icon', 'Icon', 48, d.icon || '', 'An emoji, or icon:name');
    var cats = [], seenC = Object.create(null), curC = typeof d.category === 'string' ? d.category : '', pushC = function(x) { var t = String(x || '').trim(); if (t && !seenC[t.toLowerCase()]) { seenC[t.toLowerCase()] = 1; cats.push(t); } };
    if (spec && Array.isArray(spec.cats)) spec.cats.forEach(pushC); else catChoices(sysI).forEach(pushC);   // owed review F5a1#7: a players' view's empty list (every category GM-only) offers none
    if (curC && cats.indexOf(curC) < 0) cats.push(curC);   // its own (a spelling the list does not have) stays chosen
    var cs = el('select', 'field sheet-rf-sel'); cs.appendChild(opt('', '(none)', !curC)); cats.forEach(function(x) { cs.appendChild(opt(x, x, x === curC)); });
    cs.addEventListener('change', function() { one('category', cs.value || null); }); add('Category', cs, 'category');
    text('notes', 'Notes', LIMITS.text, d.notes || '');
    text('key', 'Key', 40, d.key || '', 'A short fixed name your formulas read this row by (List.Key.lvl): a letter, then letters, digits and _ (up to 40); no other row or item of this list may have it. A GM-only row is read by its key only on a GM-only list', true);
    (spec && Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) {
        if (!s || typeof s.key !== 'string' || !SK_RE.test(s.key)) return;
        var k = s.key, lk = k.toLowerCase(), mine, ds = d.stats && typeof d.stats === 'object' ? d.stats : {}, name = 's-' + k, part = partOf(name), ctl;
        Object.keys(ds).forEach(function(x) { if (mine === undefined && x.toLowerCase() === lk && (typeof ds[x] === 'number' || (s.kind === 'pick' && typeof ds[x] === 'string'))) mine = ds[x]; });
        var put = function(n) { var p = {}; p[k] = n; one('stats', p); }, shown = typeof mine === 'number' ? String(mine) : '', dv = typeof s.def === 'number' ? s.def : 0;
        if (s.kind === 'pick') {   // F5a2: a choice — its labels
            ctl = el('select', 'field sheet-rf-sel'); ctl.appendChild(opt('', '—', mine === undefined));
            (s.opts || []).forEach(function(o) { ctl.appendChild(opt(o.label, o.label, typeof mine === 'string' && mine.toLowerCase() === o.label.toLowerCase())); });
            ctl.addEventListener('change', function() { put(ctl.value === '' ? null : ctl.value); });
        } else if (Array.isArray(s.labels) && s.labels.length) {
            ctl = el('select', 'field sheet-rf-sel'); ctl.appendChild(opt('', '—', mine === undefined));
            s.labels.forEach(function(t, i) { ctl.appendChild(opt(String(i), t || String(i), mine === i)); });
            if (typeof mine === 'number' && !(mine >= 0 && mine < s.labels.length && Math.floor(mine) === mine)) { var xo = opt(shown, statFmt(mine), true); xo.disabled = true; ctl.appendChild(xo); }   // a value past the names
            ctl.addEventListener('change', function() { put(ctl.value === '' ? null : Number(ctl.value)); });
        } else {
            ctl = el('input', 'field sheet-rf-num'); ctl.type = 'number'; ctl.step = 'any'; ctl.value = shown; keepTyped(ctl, part);
            ctl.addEventListener('change', function() { if (hold(part, ctl.value)) return; took(part); var sv = String(ctl.value).trim(), n = Number(sv); if (ctl.validity && ctl.validity.badInput) { ctl.value = shown; return; } if (sv === '') { put(null); return; } if (!isFinite(n) || Math.abs(n) > LIMITS.statAbs) { ctl.value = shown; return; } put(n); });
        }
        add(s.label || k, ctl, name, 'Blank: ' + statText(s, dv) + ' (the list’s default)');
    });
    // Stage 6 F6b: its changes to the character — the fields of the system this sheet draws (a player's: their own view); the whole list goes
    // with each change, and the host judges it again
    var mTg = typeof fxTargets === 'function' ? fxTargets(sysI) : [], mCur = Array.isArray(d.mods) ? d.mods : [];   // (a slice run on its own has no targets)
    if (mTg.length) {
        var mw = el('div', 'sheet-rf-mods'), sendM = function(arr) { one('mods', arr.length ? arr : null); }, cpM = function() { return JSON.parse(JSON.stringify(mCur)); };
        mw.appendChild(el('span', 'sheet-rf-cap', 'Changes to the character'));
        mCur.forEach(function(m, mi) {
            var ln = el('div', 'sheet-rf-mod'), val = m.f + '|' + (m.op === 'on' ? 'on' : m.part === 'max' ? 'max' : 'add'), opsM = mTg.slice(); if (!opsM.some(function(o) { return o[0] === val; })) opsM.unshift([val, '(a field that is gone)']);
            var ms = el('select', 'field sheet-rf-sel'); opsM.forEach(function(o) { ms.appendChild(opt(o[0], o[1], o[0] === val)); }); ms.title = 'What this change affects';
            ms.addEventListener('change', function() { var nx = cpM(), tp = ms.value.split('|'), nm = nx[mi]; nm.f = tp[0]; if (tp[1] === 'on') { nm.op = 'on'; delete nm.v; delete nm.part; delete nm.lvl; } else { nm.op = 'add'; if (typeof nm.v !== 'number') nm.v = 1; if (tp[1] === 'max') nm.part = 'max'; else delete nm.part; } sendM(nx); });
            ln.appendChild(ms);
            if (m.op !== 'on') {
                var ma = el('input', 'field sheet-rf-num'); ma.type = 'number'; ma.step = 'any'; ma.value = String(m.v); ma.title = 'How much it adds (negative to take away)'; ma.dataset.fid = f.id; ma.dataset.part = partOf('m' + mi);
                ma.addEventListener('change', function() { var n = Number(ma.value); if (String(ma.value).trim() === '' || !isFinite(n)) { ma.value = String(m.v); return; } var nx = cpM(); nx[mi].v = n; sendM(nx); });
                ln.appendChild(ma);
                if (spec && spec.lvl && typeof spec.lvl === 'object') { var ml = el('label', 'sheet-rf-lvl'), mc = el('input'); mc.type = 'checkbox'; mc.checked = m.lvl === true; ml.appendChild(mc); ml.appendChild(document.createTextNode(' per level')); ml.title = 'Times the row\u2019s level'; mc.addEventListener('change', function() { var nx = cpM(); if (mc.checked) nx[mi].lvl = true; else delete nx[mi].lvl; sendM(nx); }); ln.appendChild(ml); }
            }
            var mx = el('button', 'tool ghost sys-btn', '\u00d7'); mx.type = 'button'; mx.title = 'Remove this change'; mx.addEventListener('click', function() { var nx = cpM(); nx.splice(mi, 1); sendM(nx); }); ln.appendChild(mx);
            mw.appendChild(ln);
        });
        if (mCur.length < LIMITS.effectMods) { var mAdd = el('button', 'tool ghost sys-btn', '+ Change'); mAdd.type = 'button'; mAdd.title = 'Add a number to a field, or switch a toggle on, while the character carries it'; mAdd.addEventListener('click', function() { var tp = mTg[0][0].split('|'), nm = { f: tp[0], op: tp[1] === 'on' ? 'on' : 'add' }; if (nm.op === 'add') { nm.v = 1; if (tp[1] === 'max') nm.part = 'max'; } sendM(cpM().concat([nm])); }); mw.appendChild(mAdd); }
        if (spec && spec.on && typeof spec.on === 'object' && mCur.length) { var mo = el('label', 'sheet-rf-lvl'), moc = el('input'); moc.type = 'checkbox'; moc.checked = d.modsOn === true; mo.appendChild(moc); mo.appendChild(document.createTextNode(' Only while switched on')); moc.addEventListener('change', function() { one('modsOn', moc.checked ? true : null); }); mw.appendChild(mo); }
        form.appendChild(mw);
    }
    if (gmF) {
        var ba = d.area && typeof d.area === 'object' && d.area.ft ? d.area : null, bShown = ba ? String(ba.ft) : '', bi = el('input', 'field sheet-rf-num'); bi.type = 'number'; bi.min = '0'; bi.max = String(LIMITS.maxBlastFt); bi.step = '1'; bi.value = bShown; keepTyped(bi, partOf('ft'));
        bi.addEventListener('change', function() { if (hold(partOf('ft'), bi.value)) return; took(partOf('ft')); var sv = String(bi.value).trim(), n = Math.round(Number(sv)); if (bi.validity && bi.validity.badInput) { bi.value = bShown; return; } if (sv === '') { one('area', null); return; } if (!isFinite(n) || n > LIMITS.maxBlastFt) { bi.value = bShown; return; } one('area', n > 0 ? { ft: n, name: ba && ba.name ? ba.name : '' } : null); });
        add('Blast ft', bi, 'ft', 'A blast in feet (empty or 0: none)');
        text('damage', 'Damage', LIMITS.formula, d.damage || '', 'A roll: 2d6 + STRmod');
        text('cost', 'Cost formula', LIMITS.formula, d.cost || '', 'No dice');
        lockSel('rm', 'When a player removes it', { none: 'A player may remove it', bound: 'Bound: only you remove it', curse: 'Curse on contact' });
        if (d.rm === 'bound' || d.rm === 'curse') text('rmMsg', 'Message on removal', LIMITS.rmMsg, d.rmMsg || '');
        if (spec && spec.on && typeof spec.on === 'object') { lockSel('eq', 'When a player switches it off', { none: 'A player may switch it off', bound: 'Bound: it stays on', curse: 'Curse on contact: you keep it on' }); if (d.eq === 'bound' || d.eq === 'curse') text('eqMsg', 'Message on switching off', LIMITS.rmMsg, d.eqMsg || ''); }
        var gv = el('input', 'sheet-rf-gm'); gv.type = 'checkbox'; gv.checked = d.vis === 'gm'; gv.addEventListener('change', function() { one('vis', gv.checked ? 'gm' : 'all'); });
        add('GM only', gv, 'vis', 'Secret: its player still has it (its name, notes and stats), never its key, blast or formulas; they can no longer change it. On a list players can see, formulas do not read a GM-only row by its key (their sheet could not work out the same number): for a hidden thing that should count, carry a GM-only library item, or use a GM-only list');
    }
    if (stRef && stRef.focus === 'name') { delete stRef.focus; setTimeout(function() { try { nb.focus(); } catch (e) {} }, 0); }   // a new row: its name first
    return form;
}
// 5h: an effect's changes as short text, with the field labels ("+2 ST · HP max +5 · Prone on")
function fxChangeText(m, labels) { var nm = labels[m.f] || '?'; if (m.op === 'on') return nm + ' on'; return nm + (m.part === 'max' ? ' max ' : ' ') + (m.v >= 0 ? '+' : '\u2212') + fmtNum(Math.abs(m.v)); }
// 5h: what an effect can change, for a picker: [value, label] with value "fieldId|add" / "fieldId|max" / "fieldId|on"
function fxTargets(sys) {
    var out = [];
    ((sys && sys.fields) || []).forEach(function(x) {
        var nm = x.label || x.key || '(field)';
        if (x.kind === 'number' || x.kind === 'formula') out.push([x.id + '|add', nm]);
        else if (x.kind === 'skill') out.push([x.id + '|add', nm + ' (total)']);
        else if (x.kind === 'resource') out.push([x.id + '|max', nm + ' max']);
        else if (x.kind === 'toggle') out.push([x.id + '|on', nm + ' \u2014 switch on']);
    });
    return out;
}
// 5h: a ▲ / ▼ beside a value an effect touched, its tooltip the breakdown ("12 = 10 base · Rage +2"); null when nothing touched it
function fxMark(e, max) {
    if (!e) return null; var why = fxText(e, max); if (!why) return null;
    var v = max ? e.max : e.value, b = max ? e.maxBase : e.base;
    var dir = (typeof v === 'number' && typeof b === 'number') ? (v > b ? 'up' : v < b ? 'down' : 'same') : 'same';   // the shown value against its value with no effect
    var s = el('span', 'sheet-eff sheet-eff-' + dir, dir === 'up' ? '\u25b2' : dir === 'down' ? '\u25bc' : '\u25c6'); s.title = why; return s;
}
// 5h: a character's status effects — each row with its switch, icon, name, tone, duration and what it changes; add one from the library
// in a click, or make one on the spot (New…). Rights are the list field's (the host judges every change again).
// [systemcheck:sheetlock-start]
/* The sheet's lock (the owner, 2026-10-04 and 05; backlog 115 and 116): "lets not let characters edit their sheet in the tactical hud" and
   "an edit sheet and lock sheet button that keeps you from changing the characters stats at all unless editing is active". By prompt:
   "Play stays live" and "Players and you". A sheet opens LOCKED on every screen, the GM's too, and the HUD is always locked. Locked,
   what a character does in play still works; what a character IS needs Edit sheet. The lock is each viewer's own switch: the host still
   judges every change by the field's rights, exactly as before. */
var _sheetEdit = null, _lockNow = false;   // the character whose sheet is in editing in the panel; whether the view being drawn is locked (buildSections sets it, as it sets _fxView)
// A view is locked unless it is the Layout preview or a print (they act on nothing, and draw as they always did), a character still being
// made, or the sheet panel after Edit sheet (_sheetEdit is null or the id of the sheet that is open)
function viewLocked(c, vctx) {
    if (vctx && (vctx.preview || vctx.print)) return false;
    if (vctx && vctx.view === 'hud') return true;
    return !(c && (c.making === 1 || _sheetEdit === c.id));
}
// What stays live while locked: what changes in play — a pool, a switch, a counter, a named state (a number with value names) — unless the
// system says otherwise for that field (live: true | false, the System editor's On a locked sheet)
function liveField(f) {
    if (!f) return false; if (f.live === true) return true; if (f.live === false) return false;
    return f.kind === 'resource' || f.kind === 'toggle' || (f.kind === 'number' && (f.counter === true || (Array.isArray(f.labels) && f.labels.length > 0)));
}
function fieldOpen(f) { return !_lockNow || liveField(f); }   // may this field's own control be used in the view being drawn (its rights are the caller's)
function lockedNow() { return _lockNow; }
// [systemcheck:sheetlock-end]
var _fxLive = true, _fxForm = null, _fxView = 'sheet';   // _fxView (HUD frame HF1): the view being drawn, so an open New… form shows in one view only   // live: false while drawing the Layout preview or a pop-out (their controls act on nothing real); the open New… form's state
// Turn-based combat T5a: what a timed effect has left — in a combat (its clock stopped) the rounds its character's turns will take, out of it
// the time by the clock (a ticker keeps each such chip current), paused: the time, held
function fxLeftText(t, sys) {
    if (!t || typeof t.left !== 'number') return '';
    var rs = roundSecs(sys), left = fxLeftNow(t, Date.now()); if (!(left > 0)) return 'ending';
    if (!(t.at > 0) && t.p !== 1 && left <= rs * 100) { var nR = Math.ceil(left / rs - 1e-6); return nR + (nR === 1 ? ' round left' : ' rounds left'); }
    var s = Math.ceil(left), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60, txt = h ? h + 'h ' + m + 'm' : m ? m + ':' + (sec < 10 ? '0' : '') + sec : sec + 's';
    return (t.p === 1 ? 'paused, ' : '') + txt + ' left';
}
var _fxTicker = null;
// T5b: pause or resume, reset and dismiss a timed effect's countdown — whoever may change the list, a player unless the campaign keeps timers the GM's
function fxTimerCtl(r, d, f, c, sys, editable) {
    var camp = getActiveCampaign();
    if (!editable || (isClient() && camp && camp.turnRules && camp.turnRules.timers === 'gm') || !(lastsSecs(d, sys) > 0)) return null;
    var box = el('span', 'sheet-fx-timer'), t = r.t;
    var mk = function(act, txt, tip) { var b = el('button', 'tool ghost sheet-pm sheet-fx-tbtn', txt); b.type = 'button'; b.title = tip; b.addEventListener('click', function(e) { e.stopPropagation(); commitEffect(c, f, { op: 'timer', rowId: r.id, act: act }); }); box.appendChild(b); };
    if (t && t.p === 1) mk('resume', '\u25b6', 'Resume the countdown'); else if (t) mk('pause', '\u23f8', 'Pause the countdown (what is left is held)');
    mk('reset', '\u21bb', 'Start its full time again');
    if (t) mk('dismiss', '\u23f9', 'Stop the countdown: it stays until someone ends it');
    return box;
}
function fxLeftChip(t, sys) {
    var chip = el('span', 'sheet-fx-left', fxLeftText(t, sys)); chip.title = 'Runs out by itself: in a combat on its character\u2019s turns, out of one by the clock';
    chip._t = t; chip._sys = sys;
    if (!_fxTicker && typeof window !== 'undefined' && window.requestAnimationFrame) _fxTicker = setInterval(function() { document.querySelectorAll('.sheet-fx-left').forEach(function(x) { if (x._t) x.textContent = fxLeftText(x._t, x._sys); }); }, 1000);
    return chip;
}
// [sinkcheck:autofx-start]
// Conditions C4: the automatic effects on for this character, after its rows in the system's first effects list — each as a row that says
// Automatic, with its changes; no switch and no end (it follows its formula, as the Foundry sheet's automatic effects do). One a row of the
// list already applies is not drawn twice. Text nodes only
function autoFxInto(wrap, f, c, rows, sys, labels) {
    var first = sys && Array.isArray(sys.fields) ? sys.fields.find(function(x) { return x && x.kind === 'effects'; }) : null; if (!first || first.id !== f.id) return;
    var applied = {}; (Array.isArray(rows) ? rows : []).forEach(function(r) { if (r && r.on !== false && typeof r.ref === 'string') applied[r.ref] = 1; });
    autoEffectsOn(sys, c, F()).forEach(function(d) {
        if (applied[d.id] === 1) return;
        var line = el('div', 'sheet-fx sheet-fx-auto' + (d.tone === 'buff' || d.tone === 'debuff' ? ' sheet-fx-' + d.tone : ''));
        if (d.icon) line.appendChild(iconNode(d.icon, 'sheet-fx-icon'));
        var nm = el('span', 'sheet-fx-name', d.name || 'Effect'); if (d.notes) nm.title = d.notes; line.appendChild(nm);
        var tg = el('span', 'sheet-fx-autotag', 'Automatic'); tg.title = 'On while ' + d.auto; line.appendChild(tg);
        var mods = (d.mods || []).map(function(m) { return fxChangeText(m, labels); }); if (mods.length) line.appendChild(el('div', 'sheet-fx-mods', mods.join(' \u00b7 ')));
        wrap.appendChild(line);
    });
}
// [sinkcheck:autofx-end]
function effectsInto(wrap, f, c, rows, sys, editable, edit) {   // edit (the sheet's lock): may an effect be MADE here (New…); editable is what play needs: one applied from the system's list, switched, timed and ended
    editable = editable && _fxLive;
    var mk = edit === undefined ? editable : !!edit && _fxLive;
    var lib = {}, labels = {};
    ((sys && sys.effects) || []).forEach(function(d) { lib[d.id] = d; });
    ((sys && sys.fields) || []).forEach(function(x) { labels[x.id] = x.label || x.key; });
    var cards = !!(sys && sys.sheet && sys.sheet.look && sys.sheet.look.effects === 'cards');
    var fxV = _fxView;   // HUD frame HF1: the view this list is drawn in   // Stage 6 look fold (L6): a card per effect
    rows.forEach(function(r) {
        var d = typeof r.ref === 'string' ? lib[r.ref] : r; if (!d) return;
        var line = el('div', 'sheet-fx' + (r.on === false ? ' sheet-fx-off' : '') + (d.tone === 'buff' || d.tone === 'debuff' ? ' sheet-fx-' + d.tone : ''));
        var sw = el('input'); sw.type = 'checkbox'; sw.checked = r.on !== false; sw.disabled = !editable; sw.dataset.fid = f.id; sw.dataset.part = 'fx-' + r.id;
        sw.title = r.on === false ? 'Suspended \u2014 tick to apply it again' : 'Applied \u2014 untick to suspend it';
        sw.addEventListener('change', function() { commitEffect(c, f, { op: 'on', rowId: r.id, on: sw.checked }); });
        if (cards) { wrap.appendChild(fxCard(line, sw, r, d, f, c, labels, editable, sys)); return; }
        line.appendChild(sw);
        if (d.icon) line.appendChild(iconNode(d.icon, 'sheet-fx-icon'));
        var nm = el('span', 'sheet-fx-name', d.name || 'Effect'); if (d.notes) nm.title = d.notes; line.appendChild(nm);
        if (d.tone === 'buff' || d.tone === 'debuff') line.appendChild(el('span', 'sheet-fx-tone', d.tone === 'buff' ? 'Buff' : 'Debuff'));
        if (d.dur) line.appendChild(el('span', 'sheet-fx-dur', d.dur));
        if (r.t) line.appendChild(fxLeftChip(r.t, sys));   // T5a
        var tcL = fxTimerCtl(r, d, f, c, sys, editable); if (tcL) line.appendChild(tcL);   // T5b
        if (editable) { var rm = el('button', 'tool ghost sheet-pm sheet-fx-rm', '\u00d7'); rm.title = 'End this effect'; rm.addEventListener('click', function() { commitEffect(c, f, { op: 'remove', rowId: r.id }); }); line.appendChild(rm); }
        var mods = (d.mods || []).map(function(m) { return fxChangeText(m, labels); }); if (mods.length) line.appendChild(el('div', 'sheet-fx-mods', mods.join(' \u00b7 ')));
        wrap.appendChild(line);
    });
    autoFxInto(wrap, f, c, rows, sys, labels);
    if (!wrap.childNodes.length) wrap.appendChild(el('div', 'sheet-empty-note', 'No effects.'));
    if (!editable) return;
    var bar = el('div', 'sheet-fx-add-row'), defs = (sys && sys.effects) || [];
    if (defs.length) {
        var add = el('select', 'field sheet-fx-add'); add.appendChild(opt('', '+ Add effect\u2026', true));
        defs.forEach(function(d2) { add.appendChild(opt(d2.id, (iconText(d2.icon) ? iconText(d2.icon) + ' ' : '') + d2.name + (d2.tone ? ' (' + d2.tone + ')' : ''))); });
        add.addEventListener('change', function() { if (add.value) commitEffect(c, f, { op: 'add', rowId: uid('x_'), ref: add.value }); });
        bar.appendChild(add);
    }
    if (!mk) { if (defs.length) wrap.appendChild(bar); return; }   // a locked view: an effect made on the spot needs Edit sheet
    var nb = el('button', 'tool ghost sys-btn sheet-fx-new', 'New\u2026'); nb.title = 'An effect made on the spot, with its own numbers';
    nb.addEventListener('click', function() { _fxForm = { charId: c.id, fieldId: f.id, name: '', tone: '', dur: '', lines: null, view: fxV }; nb.style.display = 'none'; wrap.appendChild(effectForm(f, c, sys, function() { nb.style.display = ''; })); });
    bar.appendChild(nb);
    wrap.appendChild(bar);
    if (_fxForm && _fxForm.charId === c.id && _fxForm.fieldId === f.id) { if ((_fxForm.view || 'sheet') === fxV) { nb.style.display = 'none'; wrap.appendChild(effectForm(f, c, sys, function() { nb.style.display = ''; })); } }   // reopened with what was typed (in the view it was opened in)
}
// Stage 6 look fold (L6): one effect as a card — the switch, icon, name, then its tone and duration (with the hourglass); the notes as text; a
// pill per change ("+2 ST", "−5 HP max", or the name of what it switches on); the × in the corner for whoever may end it
function fxCard(line, sw, r, d, f, c, labels, editable, sys) {   // sys (T5a): a timed effect's round length
    line.classList.add('sheet-fx-card');
    var head = el('div', 'sheet-fx-head'); head.appendChild(sw);
    if (d.icon) head.appendChild(iconNode(d.icon, 'sheet-fx-icon'));
    head.appendChild(el('span', 'sheet-fx-name', d.name || 'Effect'));
    var meta = el('span', 'sheet-fx-meta');
    if (d.tone === 'buff' || d.tone === 'debuff') meta.appendChild(el('span', 'sheet-fx-tone', d.tone === 'buff' ? 'Buff' : 'Debuff'));
    if (d.dur) { var du = el('span', 'sheet-fx-dur'); du.appendChild(iconNode('icon:hourglass-half', 'sheet-fx-durico')); du.appendChild(document.createTextNode(' ' + d.dur)); meta.appendChild(du); }
    if (r.t) meta.appendChild(fxLeftChip(r.t, sys));   // T5a
    var tcC = fxTimerCtl(r, d, f, c, sys, editable); if (tcC) meta.appendChild(tcC);   // T5b
    if (meta.childNodes.length) head.appendChild(meta);
    line.appendChild(head);
    if (d.notes) line.appendChild(el('div', 'sheet-fx-notes', d.notes));
    var mods = d.mods || [];
    if (mods.length) { var pills = el('div', 'sheet-fx-pills'); mods.forEach(function(m) { pills.appendChild(el('span', 'sheet-fx-mod ' + (m.op === 'on' ? 'sheet-fx-mod-on' : m.v >= 0 ? 'sheet-fx-mod-pos' : 'sheet-fx-mod-neg'), fxPillText(m, labels))); }); line.appendChild(pills); }
    if (editable) { var rm = el('button', 'tool ghost sheet-pm sheet-fx-rm sheet-fx-x', '\u00d7'); rm.title = 'End this effect'; rm.addEventListener('click', function() { commitEffect(c, f, { op: 'remove', rowId: r.id }); }); line.appendChild(rm); }
    return line;
}
// L6: a pill's text, the amount first (the owner's Q10): "+2 ST", "−5 HP max"; a switch reads as the name of what it turns on
function fxPillText(m, labels) { var nm = labels[m.f] || '?'; if (m.op === 'on') return nm; return (m.v >= 0 ? '+' : '\u2212') + fmtNum(Math.abs(m.v)) + ' ' + nm + (m.part === 'max' ? ' max' : ''); }
// 5h: the New… form: a name, a tone, a duration note and up to LIMITS.effectMods changes (a field and an amount, or a toggle switched on)
function effectForm(f, c, sys, onClose) {
    var form = el('div', 'sheet-fx-form');
    var st = _fxForm || { name: '', tone: '', dur: '', lines: null };
    var nameI = el('input', 'field sheet-fx-fname'); nameI.type = 'text'; nameI.placeholder = 'Name (Blessed, Shaken\u2026)'; nameI.maxLength = 60; nameI.value = st.name || '';
    var toneS = el('select', 'field sheet-fx-ftone'); [['', 'Neutral'], ['buff', 'Buff'], ['debuff', 'Debuff']].forEach(function(o) { toneS.appendChild(opt(o[0], o[1])); }); toneS.value = st.tone || '';
    var durI = el('input', 'field sheet-fx-fdur'); durI.type = 'text'; durI.placeholder = 'Duration (3 rounds)'; durI.maxLength = 40; durI.value = st.dur || '';
    var keep = function() { if (!_fxForm) return; _fxForm.name = nameI.value; _fxForm.tone = toneS.value; _fxForm.dur = durI.value; _fxForm.lines = Array.prototype.map.call(form.querySelectorAll('.sheet-fx-fline'), function(ln) { return [ln.querySelector('.sheet-fx-ftarget').value, ln.querySelector('.sheet-fx-famt').value]; }); };
    form.addEventListener('input', keep); form.addEventListener('change', keep);
    form.appendChild(nameI); form.appendChild(toneS); form.appendChild(durI);
    var lines = el('div', 'sheet-fx-flines'), targets = fxTargets(sys); form.appendChild(lines);
    var addLine = function(init) {
        if (lines.childNodes.length >= LIMITS.effectMods || !targets.length) return;
        var ln = el('div', 'sheet-fx-fline'), ts = el('select', 'field sheet-fx-ftarget'); targets.forEach(function(tg) { ts.appendChild(opt(tg[0], tg[1])); });
        var am = el('input', 'field sheet-num sheet-fx-famt'); am.type = 'number'; am.value = '1'; am.step = 'any'; am.title = 'How much it adds (negative to take away)';
        if (Array.isArray(init)) { ts.value = init[0]; am.value = init[1]; }
        var sync = function() { am.style.display = /\|on$/.test(ts.value) ? 'none' : ''; }; ts.addEventListener('change', sync); sync();
        var x = el('button', 'tool ghost sheet-pm', '\u00d7'); x.title = 'Remove this change'; x.addEventListener('click', function() { ln.remove(); keep(); });
        ln.appendChild(ts); ln.appendChild(am); ln.appendChild(x); lines.appendChild(ln);
    };
    if (Array.isArray(st.lines)) st.lines.forEach(function(l0) { addLine(l0); }); else addLine();
    if (targets.length) { var more = el('button', 'tool ghost sys-btn', '+ Change'); more.addEventListener('click', function() { addLine(); keep(); }); form.appendChild(more); }
    var ok = el('button', 'tool sys-btn', 'Add'), cancel = el('button', 'tool ghost sys-btn', 'Cancel');
    ok.addEventListener('click', function() {
        var mods = [];
        lines.querySelectorAll('.sheet-fx-fline').forEach(function(ln) {
            var parts = ln.querySelector('.sheet-fx-ftarget').value.split('|'), amt = Number(ln.querySelector('.sheet-fx-famt').value); if (!parts[0]) return;
            if (parts[1] === 'on') mods.push({ f: parts[0], op: 'on' });
            else if (isFinite(amt) && amt !== 0) { var m = { f: parts[0], op: 'add', v: amt }; if (parts[1] === 'max') m.part = 'max'; mods.push(m); }
        });
        _fxForm = null; form.remove(); onClose();
        commitEffect(c, f, { op: 'adhoc', row: { id: uid('x_'), name: nameI.value.trim() || 'Effect', icon: '', tone: toneS.value, dur: durI.value.trim(), notes: '', on: true, mods: mods } });
    });
    cancel.addEventListener('click', function() { _fxForm = null; form.remove(); onClose(); });
    var btns = el('div', 'sheet-fx-fbtns'); btns.appendChild(ok); btns.appendChild(cancel); form.appendChild(btns);
    if (!st.name) setTimeout(function() { try { nameI.focus(); } catch (e) {} }, 0);   // a reopened form keeps the page's focus where it is
    return form;
}
// HUD frame (HF4a, H2): a field drawn as one line in an "Inline rows" section — label and value on the left, its own Roll on the right, a
// caption on its own line below. The section's flag beats the field's stat tile (as the band does), so one field can be a tile on the sheet
// and a row in the HUD. Only the kinds a line can hold: a pool (its bar and reset) and a drawn slider keep their own look. A roll placement
// stays a button.
var INLINE_KINDS = Object.freeze({ number: 1, formula: 1, skill: 1, toggle: 1, select: 1, text: 1 });
function inlineRow(node, f) {
    if (!Object.prototype.hasOwnProperty.call(INLINE_KINDS, f.kind) || node.classList.contains('sheet-has-slider')) return;   // a drawn slider keeps its track
    node.classList.add('sheet-inline-row'); node.classList.remove('sheet-tile');
    var rb = node.querySelector('.sheet-field-roll'); if (!rb) return;
    var cap = null; Array.prototype.forEach.call(node.children, function(k) { if (!cap && k.classList.contains('sheet-caption')) cap = k; });
    rb.textContent = 'Roll'; rb.classList.add('sheet-inline-roll'); node.insertBefore(rb, cap);
}
// Stage 6 look fold (L8): a number box with its up and down arrows inside its right edge. The box changes at once; one commit goes about 200 ms
// after the last click, none when the value is back where it started (unbatched clicks would hit the host's rate gate), as the slider does.
// HUD frame (HF4a, H8) flank: a counter — minus and plus either side of the box (span.sheet-counter: [down, box, up]), the same single commit.
// A burst of clicks is kept by character and field (_stepPend), not in the box: a redraw in the middle of it (a player's own edit comes back
// as an ack and a delta within a round trip) shows the pending value, and the next click carries on from it under the ONE timer — so a
// burst is one commit and never loses a click, from the band and from a section alike. A value typed into the box ends the burst and is
// committed by the box itself (the new start).
function stepWrap(inp, f, c, editable, flank) {
    var pk = c.id + '|' + f.id;
    if (_stepPend[pk]) inp.value = _stepPend[pk].value;   // a burst in flight: the redrawn box shows it
    var wrap = el('span', flank ? 'sheet-counter' : 'sheet-numwrap'); inp.classList.add('num-stepped'); if (!flank) wrap.appendChild(inp);
    var steps = flank ? null : el('span', 'sheet-steps'), side = {};
    inp.addEventListener('change', function() { var p = _stepPend[pk]; if (p) { clearTimeout(p.timer); delete _stepPend[pk]; } });
    [['up', 1, '+', flank ? 'One more' : 'Up one'], ['down', -1, '\u2212', flank ? 'One less' : 'Down one']].forEach(function(d) {
        var b = el('button', flank ? 'tool ghost sheet-count' : 'tool ghost sheet-step', d[2]); b.type = 'button'; b.dataset.fid = f.id; b.dataset.part = d[0]; b.title = d[3]; b.disabled = !editable;
        b.addEventListener('click', function() {
            var p = _stepPend[pk], at = p ? p.value : inp.value, s0 = Number(f.step) > 0 ? Number(f.step) : 1, v = (Number(at) || 0) + d[1] * s0;
            if (f.min !== undefined) v = Math.max(f.min, v); if (f.max !== undefined) v = Math.min(f.max, v);
            if (!p) p = _stepPend[pk] = { from: inp.value, value: '', timer: null };
            inp.value = p.value = String(+v.toFixed(6));
            clearTimeout(p.timer); p.timer = setTimeout(function() { if (_stepPend[pk] === p) delete _stepPend[pk]; if (p.value === p.from) return; commit(c, f, Number(p.value)); }, 200);
        });
        if (flank) side[d[0]] = b; else steps.appendChild(b);
    });
    if (flank) { wrap.appendChild(side.down); wrap.appendChild(inp); wrap.appendChild(side.up); } else wrap.appendChild(steps);
    return wrap;
}
var _stepPend = Object.create(null);   // charId|fieldId -> { from, value, timer }: a counter's (or the arrows') burst in flight
// Stage 6 look fold (L7): a badge's colour class, looked up from a constant map (never built from a stored string)
var TONE_CLASS = Object.freeze({ good: ' sheet-tone-good', warn: ' sheet-tone-warn', danger: ' sheet-tone-danger', accent: ' sheet-tone-accent', primary: ' sheet-tone-primary' });
// Stage 5g: a value coloured by its sign — only on a field that asks (green above zero, red below; zero and errors stay plain)
function signTone(f, e) { if (!f.sign || !e || e.error || e.label || typeof e.value !== 'number') return ''; return e.value < 0 ? ' sheet-neg' : e.value > 0 ? ' sheet-pos' : ''; }
// A field on the sheet: its control, then (Fold B) its caption line — text, with each {formula} worked out for this character, drawn as text
function fieldNode(f, c, e, gm, own, sysArg, vars, plc) {   // vars: the render's resolver (sections pass it; the band shows no captions); plc (F4b): the placement
    var box = fieldNodeBody(f, c, e, gm, own, sysArg, plc);
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
function fieldNodeBody(f, c, e, gm, own, sysArg, plc) {   // plc (F4b): the section placement drawn (an item list may show only its rows switched on); sysArg: the system being drawn (the pop-out's cleaned copy, the Layout preview's draft); the item list resolves its defs from it
    var box = el('div', 'sheet-field sheet-kind-' + f.kind);
    if (f.tile) box.classList.add('sheet-tile');   // Stage 3: compact stat tile (value big, label small)
    if (f.vis === 'gm') box.classList.add('sheet-gm');
    var lab = el('label', 'sheet-label', f.label); lab.title = f.key + (f.vis === 'gm' ? ' (GM only)' : ''); box.appendChild(lab);
    if (f.roll) { var rb = el('button', 'tool ghost sheet-field-roll', String.fromCharCode(55356, 57266)); rb.title = 'Roll ' + f.roll + ' · shift-click to add a modifier'; rb.disabled = !canRoll(c); rb.addEventListener('click', function(e) { sheetRoll(e, c.id, f.roll, f.label || f.key, f.vis === 'gm' ? { gmOnly: true } : undefined); }); lab.appendChild(rb); }   // the field's own roll (1.5.0); a GM-only field's stays the GM's
    var editable = gm || (own && f.vis === 'all' && (f.edit === 'owner' || c.making === 1 || c.unlocked === 1));
    var lk = typeof lockedNow === 'function' && lockedNow(), use = editable && (typeof fieldOpen !== 'function' || fieldOpen(f));   // the sheet's lock: this field's own control in the view being drawn (locked, only what changes in play). Asked through typeof: a harness that slices this function alone draws it unlocked
    var playOk = editable && (!lk || f.live !== false), editOk = editable && (!lk || f.live === true);   // a list's two halves: what is used in play (a switch, a count, a use), and what changes the character (a level, a row, a note)
    var raw = c.values ? c.values[f.id] : undefined;
    var k = f.kind;
    if (k === 'formula') { var v = el('div', 'sheet-value' + (e && e.error ? ' sheet-err' : '') + signTone(f, e), e && e.error ? '—' : e ? e.text + (f.unit && e.text !== '' && !e.label ? ' ' + f.unit : '') : ''); v.title = e && e.error ? e.error : f.formula || ''; if (f.badge && e && !e.error) { var tnB = valueTone(f, e), bd = el('span', 'sheet-badge' + (Object.prototype.hasOwnProperty.call(TONE_CLASS, tnB) ? TONE_CLASS[tnB] : ''), v.textContent); v.textContent = ''; v.appendChild(bd); } var fmF = fxMark(e); if (fmF) { v.appendChild(fmF); v.title += '\n' + fmF.title; } box.appendChild(v); return box; }
    if (k === 'number' && Array.isArray(f.labels) && f.labels.length) {   // Stage 6: a number with value names — a dropdown that stores the position (formulas read the number)
        var rowL = el('div', 'sheet-ctl'), ls = el('select', 'field sheet-select'), curL = Number(raw === undefined ? f.def : raw);
        ls.dataset.fid = f.id; f.labels.forEach(function(t, i) { ls.appendChild(opt(String(i), t || String(i), curL === i)); });
        if (!(curL === Math.floor(curL) && curL >= 0 && curL < f.labels.length)) { var ob = opt(String(curL), fmtNum(curL), true); ob.disabled = true; ls.insertBefore(ob, ls.firstChild); }   // a stored value past the names shows as its number (what formulas read) until a name is picked
        ls.disabled = !use; ls.addEventListener('change', function() { commit(c, f, Number(ls.value)); });
        rowL.appendChild(ls);
        if (e && e.mods && e.mods.length) { var fbL0 = fxMark(e); if (fbL0) { fbL0.textContent = '\u2192 ' + (e.text || fmtNum(e.value)); rowL.appendChild(fbL0); } }   // 5h: an effect moved it — the effective value beside the choice
        box.appendChild(rowL); return box;
    }
    if (k === 'number' || k === 'skill') {
        var row = el('div', 'sheet-ctl');
        var inp = el('input', 'field sheet-num'); inp.type = 'number'; inp.dataset.fid = f.id; inp.value = raw === undefined ? String(f.def) : String(raw);
        if (f.min !== undefined) inp.min = String(f.min); if (f.max !== undefined) inp.max = String(f.max); inp.step = String(f.step || 1); inp.disabled = !use;
        inp.addEventListener('change', function() { commit(c, f, Number(inp.value)); });
        if (k === 'number' && f.slider && f.min !== undefined && f.max !== undefined) {   // Stage 5e: a gradient slider — the same number as a range on a two-colour track with end labels
            var sw = el('div', 'sheet-slider'); box.classList.add('sheet-has-slider');
            var ends = el('div', 'sheet-slider-ends'); ends.appendChild(el('span', 'sheet-slider-low', f.slider.low || '')); ends.appendChild(el('span', 'sheet-slider-high', f.slider.high || '')); sw.appendChild(ends);
            var rg = el('input', 'sheet-range'); rg.type = 'range'; rg.min = String(f.min); rg.max = String(f.max); rg.step = String(f.step || 1); rg.value = inp.value; rg.disabled = !use; rg.dataset.fid = f.id; rg.dataset.part = 'range';
            rg.style.background = 'linear-gradient(90deg, ' + (f.slider.lowColor || 'var(--blue)') + ', ' + (f.slider.highColor || 'var(--gold)') + ')';   // colours are hex-validated by cleanSlider
            rg.title = (f.slider.low || String(f.min)) + ' \u2026 ' + (f.slider.high || String(f.max));   // "Dark Side … Light Side", or "-100 … 100"
            // arrow keys fire a change per step: one commit after the last step, so a player's nudges reach the GM as one edit (inside the
            // host's rate gate) and a drag still commits once on release; an unchanged value is never re-sent
            var rgTimer = null, rgSent = rg.value;
            rg.addEventListener('input', function() { inp.value = rg.value; });
            rg.addEventListener('change', function() { clearTimeout(rgTimer); rgTimer = setTimeout(function() { if (rg.value === rgSent) return; rgSent = rg.value; commit(c, f, Number(rg.value)); }, 200); });
            sw.appendChild(rg); row.appendChild(sw);
        }
        if (k === 'number') inp.className += signTone(f, { value: Number(inp.value) });   // Stage 5g (a skill colours its total instead); 5h: by the number the box shows
        var lkS = (sysArg && sysArg.sheet && sysArg.sheet.look) || {};
        if (f.counter) row.appendChild(stepWrap(inp, f, c, use, true));   // HUD frame (HF4a, H8): a counter, minus and plus either side (the cleaner never keeps one with value names or a slider)
        else if (lkS.steppers === 'inside' && !(k === 'number' && f.slider && f.min !== undefined && f.max !== undefined)) row.appendChild(stepWrap(inp, f, c, use));   // Stage 6 look fold (L8)
        else row.appendChild(inp);
        if (k === 'number' && e && e.mods && e.mods.length) { var fb = fxMark(e); if (fb) { fb.textContent = '\u2192 ' + fmtNum(e.value); row.appendChild(fb); } }   // 5h: the box edits the base; the effective value beside it
        if (k === 'skill') { var tot = el('span', 'sheet-total' + (e && e.error ? ' sheet-err' : '') + signTone(f, e), e && e.error ? '—' : '= ' + (e ? e.text : '')); tot.title = e && e.error ? e.error : (f.base ? 'ranks + ' + f.base : 'ranks'); row.appendChild(tot); var fmS = fxMark(e); if (fmS) { row.appendChild(fmS); tot.title += '\n' + fmS.title; } }
        if (f.unit) row.appendChild(el('span', 'sheet-unit', f.unit));   // Stage 5g
        box.appendChild(row); return box;
    }
    if (k === 'resource') {
        var cur = e && typeof e.value === 'number' ? e.value : 0, max = e && typeof e.max === 'number' ? e.max : null;
        var r = el('div', 'sheet-ctl');
        if (typeof f.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(f.color)) { box.classList.add('sheet-pool-colored'); box.style.setProperty('--sheet-pool', f.color); }   // Stage 6 look fold (L7): the pool's own colour
        if (f.icon) r.appendChild(iconNode(f.icon, 'sheet-pool-icon'));   // Fold B (Stage 6: or a bundled glyph)
        if (f.icon || f.reset) r.classList.add('sheet-ctl-wrap');   // the extra controls wrap to a second line in a narrow cell, never into the next column
        var minus = el('button', 'tool ghost sheet-pm', '−'); minus.dataset.fid = f.id; minus.dataset.part = 'minus'; minus.title = 'One less'; minus.disabled = !use;
        var ci = el('input', 'field sheet-num sheet-cur num-stepped'); ci.type = 'number'; ci.dataset.fid = f.id; ci.value = String(cur); ci.disabled = !use; if (f.min !== undefined) ci.min = String(f.min); if (max !== null) ci.max = String(max);
        var plus = el('button', 'tool ghost sheet-pm', '+'); plus.dataset.fid = f.id; plus.dataset.part = 'plus'; plus.title = 'One more'; plus.disabled = !use;
        var mx = el('span', 'sheet-total' + (e && e.error ? ' sheet-err' : ''), '/ ' + (max === null ? '—' : fmtNum(max)) + (f.unit ? ' ' + f.unit : '')); mx.title = e && e.error ? e.error : (f.maxFormula || 'no max'); var fmR = fxMark(e, true); if (fmR) mx.title += '\n' + fmR.title;
        minus.addEventListener('click', function() { commit(c, f, { cur: cur - 1 }); });
        plus.addEventListener('click', function() { commit(c, f, { cur: cur + 1 }); });
        ci.addEventListener('change', function() { commit(c, f, { cur: Number(ci.value) }); });
        r.appendChild(minus); r.appendChild(ci); r.appendChild(plus); r.appendChild(mx);
        if (f.reset) {   // Fold B: fill back to the max (the host clamps it like any edit)
            var rs = el('button', 'tool ghost sheet-pm sheet-reset', '\u21bb'); rs.dataset.fid = f.id; rs.dataset.part = 'reset';
            var fb = typeof fillBarred === 'function' && fillBarred(); rs.title = fb ? 'The GM fills pools at this table' : max === null ? 'No max to fill to' : 'Back to full (' + fmtNum(max) + ')'; rs.disabled = !use || max === null || cur === max || fb;   // K5b
            rs.addEventListener('click', function() { if (max !== null) commit(c, f, { cur: max }); });
            r.appendChild(rs);
        }
        box.appendChild(r);
        if (f.bar === false) return box;   // Fold B: no bar
        var bar = el('div', 'sheet-bar'); var fill = el('div', 'sheet-bar-fill'); var pct = max ? Math.max(0, Math.min(100, (cur - (f.min || 0)) / Math.max(1, max - (f.min || 0)) * 100)) : 0; fill.style.width = pct + '%'; bar.appendChild(fill); box.appendChild(bar);
        return box;
    }
    if (k === 'toggle') { var lb = el('label', 'sheet-toggle'); var cb = el('input'); cb.type = 'checkbox'; cb.dataset.fid = f.id; cb.checked = raw === undefined ? f.def === true : raw === true; cb.disabled = !use; cb.addEventListener('change', function() { commit(c, f, cb.checked); }); lb.appendChild(cb); lb.appendChild(document.createTextNode(' ' + (cb.checked ? 'on' : 'off'))); box.appendChild(lb); if (e && e.value === true && !cb.checked && e.mods && e.mods.length) { var ft = el('span', 'sheet-eff sheet-eff-same', 'on (' + e.mods.map(function(m) { return m.name; }).join(', ') + ')'); ft.title = 'Switched on by ' + e.mods.map(function(m) { return m.name; }).join(', '); box.appendChild(ft); } return box; }
    if (k === 'text') { var ti = el('input', 'field sheet-text'); ti.type = 'text'; ti.dataset.fid = f.id; ti.maxLength = f.max || 200; ti.value = raw === undefined ? String(f.def || '') : String(raw); ti.disabled = !use; ti.addEventListener('change', function() { commit(c, f, ti.value); }); box.appendChild(ti); return box; }
    if (k === 'notes') { var ta = el('textarea', 'field sheet-notes'); ta.dataset.fid = f.id; ta.rows = 4; ta.value = raw === undefined ? '' : String(raw); ta.disabled = !use; var tmr = null; ta.addEventListener('input', function() { clearTimeout(tmr); tmr = setTimeout(function() { commit(c, f, ta.value); }, 600); }); ta.addEventListener('change', function() { clearTimeout(tmr); commit(c, f, ta.value); }); box.appendChild(ta); return box; }
    if (k === 'select') { var se = el('select', 'field sheet-select'); se.dataset.fid = f.id; (f.options || []).forEach(function(o) { se.appendChild(opt(o, o, (raw === undefined ? f.def : raw) === o)); }); se.disabled = !use; se.addEventListener('change', function() { commit(c, f, se.value); }); box.appendChild(se); return box; }
    if (k === 'effects') {   // 5h: status effects (the host judges every change; a teammate's copy is names only)
        var wrapE = el('div', 'sheet-fx-list');
        effectsInto(wrapE, f, c, Array.isArray(raw) ? raw : [], sysArg || systemOf(getActiveCampaign()), playOk && !c.partial, editOk && !c.partial);
        box.appendChild(wrapE); return box;
    }
    if (k === 'item-list') {
        var sysI = sysArg || systemOf(getActiveCampaign()), carried = Array.isArray(raw) ? raw : [];
        var specI = f.list || null, onOnly = !!(plc && plc.on === true && specI && specI.on), emptyI = onOnly ? 'Nothing ' + String(specI.on.label || 'on').toLowerCase() + '.' : '';   // F4b: a placement that shows only the rows switched on (the HUD's readied weapons)
        if (onOnly) carried = carried.filter(function(r) { return rowOn(specI, r); });
        var gmThrows = sysI && sysI.combat && sysI.combat.blastRoller === 'gm';
        var canThrow = (gm || (own && !gmThrows && !!facingTarget(c))) && !c.partial;   // who-rolls='gm' means only the GM throws; a player throws from the character whose token they hold here (never a kept one)
        var wrap = el('div', 'sheet-items' + (f.table ? ' sheet-items-table' : ''));
        if (f.table) itemTableInto(wrap, f, c, carried, sysI, canThrow, playOk, gm, emptyI, e, editOk);   // Stage 4: rich table (F5a1: e, its columns' cells and totals)
        else itemListInto(wrap, f, c, carried, sysI, canThrow, playOk, gm, emptyI, e, editOk);            // the plain carried list (as before)
        var custOK = !!specI && (gm || specI.custom === true);   // F4c3: + Custom… — the GM's on any list shaped in the Lists tab, a player's where it takes custom rows
        var libOK = gm && !!window.wpLibPicker && !!(window.wpLibrary && window.wpLibrary.size && window.wpLibrary.size() > 0);   // Stage 6 library L2c: the GM's machine offers the campaign's library too
        if (!gm && window.wpLibPicker && window.wpNet && window.wpNet.libManifest) { var lmP = window.wpNet.libManifest(); libOK = !!lmP && lmP.packs.some(function(p) { return p.count > 0; }); }   // L3b: a player, the packs the host lets them see
        if (editOk && _fxLive && sysI && ((sysI.items && sysI.items.length) || custOK || libOK) && !onOnly) {
            var add = el('select', 'field sheet-item-add'), nPick = -1, vwP = _fxView; add.appendChild(opt('', '+ Add item…', true));
            var cantI = !gm && typeof cantTake === 'function' ? function(it) { return cantTake(sysI, c, it); } : null;   // 126b: an item this character may not take yet is greyed out for its player and says why; the GM is never stopped
            if (specI) nPick = pickerInto(add, sysI.items || [], specI, carried, cantI);   // F4b: the list's categories, grouped
            else sysI.items.forEach(function(it) { var oI = opt(it.id, (iconText(it.icon) ? iconText(it.icon) + ' ' : '') + it.name + (it.category ? ' — ' + it.category : '')), whyI = cantI ? cantI(it) : ''; if (whyI) { oI.disabled = true; oI.title = whyI; } add.appendChild(oI); });
            if (libOK) add.appendChild(opt('__lib', '📚 From the library…'));   // L2c: the picker (libpicker.js)
            if (custOK) add.appendChild(opt('__custom', '+ Custom…'));   // F4c3: a blank row of the character's own, its form open on its name (in the view it was chosen in)
            add.addEventListener('change', function() { if (add.value === '__lib') { add.value = ''; openLibPicker(add, c, f, specI, carried); return; } if (add.value === '__custom') { var nr = uid('w_'); _rowForm = { charId: c.id, fieldId: f.id, rowId: nr, view: vwP, typed: {}, focus: 'name' }; commitItem(c, f, { op: 'custom', rowId: nr, def: {} }); return; } if (add.value) commitItem(c, f, { op: 'add', defId: add.value, rowId: uid('w_'), qty: 1 }); });   // Stage 6 F4a: a new row's id from here (the host never mints)
            if (nPick !== 0 || custOK || libOK) wrap.appendChild(add);   // F4b: none of the list's categories has an item: no picker (F4c3: unless it takes custom rows)
        }
        box.appendChild(wrap); return box;
    }
    return box;
}
// Stage 6 library L2c: "From the library…" on the GM's machine — the picker over the campaign's packs (libpicker.js), filtered to the list's
// categories; each pick is an ordinary add, the character and the field looked up again (the picker can stay open across renders)
function openLibPicker(anchor, c, f, spec, carried) {
    if (isClient()) { openLibPickerPlayer(anchor, c, f, spec); return; }
    var LB = window.wpLibrary, LP = window.wpLibPicker, camp = getActiveCampaign(); if (!LB || !LP || !camp || !camp.library) return;
    var once = null; if (spec && spec.noQty && !spec.multi) { once = Object.create(null); carried.forEach(function(r) { if (r && typeof r.defId === 'string' && r.hid !== 1) once[r.defId] = 1; }); }
    var labels = {}; (spec && Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) { if (s && typeof s.key === 'string' && s.hide !== true) labels[s.key] = s.label || s.key; });
    LP.open({ anchor: anchor, title: 'Add to ' + (f.label || f.key || 'the list'), cats: spec && Array.isArray(spec.cats) && spec.cats.length ? spec.cats : null, once: once, noQty: !!(spec && spec.noQty), labels: labels, gm: true, needs: function(e) { var cpN = getActiveCampaign(), chN = cpN && cpN.chars ? cpN.chars[c.id] : null, syN = systemOf(cpN); return chN && syN ? needsMet(syN, chN, e, false, F()).missing : []; },   // 126b: the GM is told, never stopped
        source: { packs: function() { return (camp.library && camp.library.packs) || []; }, entries: function(pid) { return LB.entriesOf(pid); } },
        onAdd: function(ids, qty) { var cp = getActiveCampaign(), ch = cp && cp.chars ? cp.chars[c.id] : null, sy = systemOf(cp), ff = sy ? fieldById(sy, f.id) : null; if (cp !== camp || !ch || !ff) return; ids.forEach(function(id) { commitItem(ch, ff, { op: 'add', defId: id, rowId: uid('w_'), qty: qty }); }); } });
}
// Stage 6 library L3b: a player's "From the library…" — the same picker over the packs the host lets them see, loaded over the wire a page at
// a time (wpNet.libLoad), an entry fetched in full for the preview and before it is added (the pick is judged by the host; what the player
// predicts reads the entry fetched). The rows a player holds carry no library id, so a list that holds each once is left to the host
function openLibPickerPlayer(anchor, c, f, spec) {
    var N = window.wpNet, LP = window.wpLibPicker, camp = getActiveCampaign(), man = N && N.libManifest ? N.libManifest() : null; if (!LP || !camp || !man) return;
    var packs = man.packs.filter(function(p) { return p.count > 0; }), total = packs.reduce(function(n, p) { return n + p.count; }, 0), done = false;
    var labels = {}; (spec && Array.isArray(spec.stats) ? spec.stats : []).forEach(function(s) { if (s && typeof s.key === 'string' && s.hide !== true) labels[s.key] = s.label || s.key; });
    var asEntry = function(r) { var o = { id: r[0], key: r[1], name: r[2], category: r[3], icon: r[4], tags: r[5] }; if (Array.isArray(r[7])) o.needs = r[7]; if (typeof r[8] === 'string') o.needsIf = r[8]; return o; };   // 126b: a row's needs, so the picker greys it before the entry is opened
    LP.open({ anchor: anchor, title: 'Add to ' + (f.label || f.key || 'the list'), cats: spec && Array.isArray(spec.cats) ? spec.cats : null, once: null, noQty: !!(spec && spec.noQty), labels: labels, gm: false, needs: function(e) { var cpN = getActiveCampaign(), chN = charById(c.id, cpN), syN = systemOf(cpN); return chN && syN ? needsMet(syN, chN, e, true, F()).missing : []; },   // 126b: what their character does not meet, by the needs their copy of the entry names (the host judges the rest)
        source: {
            packs: function() { return packs; },
            entries: function(pid) { return N.libRows(pid).map(asEntry); },
            load: async function(progress) { for (var i = 0; i < packs.length; i++) await N.libLoad(packs[i].id, progress); done = true; },
            status: function() { if (done) return ''; var have = packs.reduce(function(n, p) { return n + N.libLoaded(p.id); }, 0); return 'Loading ' + have.toLocaleString() + ' of ' + total.toLocaleString() + '…'; },
            get: function(e, p, back) { var hit = N.libEntry(e.id); if (hit) { back(hit); return; } N.libGet(p.id, [e.id]).then(function() { back(N.libEntry(e.id)); }); }
        },
        onAdd: async function(ids, qty, packOf) {
            var byPack = {}; ids.forEach(function(id) { var pid = packOf && packOf[id]; if (pid) (byPack[pid] = byPack[pid] || []).push(id); });
            for (var pid in byPack) await N.libGet(pid, byPack[pid]);
            var cp = getActiveCampaign(), ch = cp && cp.chars ? cp.chars[c.id] : null, sy = systemOf(cp), ff = sy ? fieldById(sy, f.id) : null; if (cp !== camp || !ch || !ff) return;
            var miss = 0; ids.forEach(function(id) { if (!N.libEntry(id)) { miss++; return; } commitItem(ch, ff, { op: 'add', defId: id, rowId: uid('w_'), qty: qty }); });
            if (miss) toast(miss === 1 ? 'That entry could not be fetched from the GM.' : miss + ' entries could not be fetched from the GM.');
        } });
}
// A roll from a sheet button: shift/alt-click opens the situational-modifier popover (Stage 5a); a plain click rolls straight away.
function sheetRoll(e, charId, expr, label, opts) {
    if (!window.wpDice) return;
    if ((e.shiftKey || e.altKey) && window.wpDice.rollWithMod) window.wpDice.rollWithMod(charId, expr, label, opts, e.currentTarget);
    else if (window.wpDice.rollFor) window.wpDice.rollFor(charId, expr, label, opts);
}
var ROLL_TONE_CLS = { primary: ' sheet-roll-primary', danger: ' sheet-roll-danger', neutral: ' sheet-roll-neutral', outline: ' sheet-roll-outline' };   // Stage 6 look fold: literal classes, looked up by own key
// HUD frame (HF5a, H3): a roll's label with each {formula} worked out for this character, as a caption is (text only; a value that fails
// prints a dash); the label as written when there is no resolver. Cut to the dice path's 60 without splitting a surrogate pair (a lone one is dropped)
var LABEL_CTRL_G = new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']', 'g'), LONE_SURR = new RegExp('^[' + String.fromCharCode(55296) + '-' + String.fromCharCode(57343) + ']$');
function rollLabel(r, sys, c, vars) {
    if (!r.label || r.label.indexOf('{') < 0 || !sys || typeof vars !== 'function' || !F()) return r.label;
    var s = captionParts(sys, c, F(), r.label, vars).map(function(p) { return p.error ? '\u2014' : p.text; }).join('').replace(LABEL_CTRL_G, ' ').trim();   // the engine yields numbers and booleans only (a text value prints the dash); the dice path's no-control rule, kept cheaply
    var out = ''; Array.from(s).some(function(ch) { if (LONE_SURR.test(ch)) return false; if (out.length + ch.length > 60) return true; out += ch; return false; });
    return out.trim() || 'Roll';
}
// A public roll never carries a GM-only value: on the host, in a session, a roll whose label shows one (a GM-only field named anywhere in it,
// as the players' view scrubs it, a value worked out from one, or a value a GM-only effect changed) goes to the GM alone, as its formula would.
// The last two read the names the drawn values actually read (vars: the resolver the label is worked out with), as a roll's breakdown does.
// The names, each once, joined for the toast, or ''
function labelSecret(sys, vars, text) {
    var n = net(), Fm = F(); if (isClient() || !(n && n.active && n.role === 'host') || !Fm || typeof text !== 'string' || text.indexOf('{') < 0) return '';
    var ns = labelNames(Fm, text, vars), hit = labelGmNames(sys, Fm, text).concat(gmDerivedNames(sys, Fm, ns), gmEffectNames(vars, ns)), low = hit.map(function(x) { return String(x).toLowerCase(); });
    hit = hit.filter(function(x, i) { return low.indexOf(low[i]) === i; }); return hit.length ? hit.join(', ') : '';
}
function rollNode(r, c, sys, vars) {   // sys, vars: the system drawn and the render's resolver, for the label (HF5a)
    if (Array.isArray(r.apply)) return applyNode(r, c, sys, vars);   // Stage 6 HUD H7: an apply action draws as a roll's button
    var label = rollLabel(r, sys, c, vars), b = el('button', 'tool sheet-roll' + (Object.prototype.hasOwnProperty.call(ROLL_TONE_CLS, r.tone) ? ROLL_TONE_CLS[r.tone] : ''), label); var can = canRoll(c);
    if (r.icon) b.insertBefore(iconNode(r.icon, 'sheet-roll-icon'), b.firstChild); b.title = r.formula + (can ? ' · shift-click to add a modifier' : ' (dice are off here, or this is not your character)'); b.disabled = !can;
    var cbR = can && typeof costBlock === 'function' ? costBlock(c, r.cost) : ''; if (cbR) { b.disabled = true; b.title = cbR + ' \u2014 ' + r.formula; }   // turn-based combat T4
    b.addEventListener('click', function(e) {
        var lb = label, vv = vars;
        if (sys && typeof vars === 'function' && r.label && r.label.indexOf('{') >= 0 && F()) { try { var campN = getActiveCampaign(), cN = charById(c.id, campN) || c; vv = resolveAll(sys, cN, F(), tokenCtxFor(c.id, campN)).vars; lb = rollLabel(r, sys, cN, vv); } catch (err) { lb = label; vv = vars; } }   // HF5 review: the values as they are at the click, as the roll reads them (a redraw may still wait on a focused box)
        var why = labelSecret(sys, vv, r.label); if (why) toast('Kept private: its label shows a GM-only value (' + why + ').'); var oR = why ? { priv: true } : r.vis === 'gm' ? { gmOnly: true } : undefined; if ((Array.isArray(r.then) && r.then.length) || r.malf || r.cost || r.dmg || r.init === true) { oR = oR || {}; oR.act = r.id; } sheetRoll(e, c.id, r.formula, lb, oR);   // R1: a roll with consequences names itself (initiative O1: the initiative roll too, so the host can trust its number into the fight)   // a GM-only roll stays the GM's
    });
    var box = el('div', 'sheet-field sheet-kind-roll'); box.appendChild(b); return box;
}
// A roll from this character's sheet: the dice feature on, and for a player their own character
// Turn-based combat T4: why a button that costs an action cannot be pressed now — none of it left this turn, as the host last told this player
// ('' when it can; a warn table never greys, the note says so). The host judges every press; this only spares the player a refusal
function costBlock(c, cost) {
    var n = net(), al = cost && c && n && n.actsLeft ? n.actsLeft[c.id] : null; if (!al || al.mode !== 'refuse' || typeof al.left[cost] !== 'number' || al.left[cost] > 0) return '';
    return 'No ' + cost + ' left this turn';
}
function canRoll(c) { if (!c || !window.wpDice || !window.wpDice.rollFor) return false; if (window.wpVtt && !window.wpVtt.on('dice')) return false; if (isClient()) return !!(c.ownerId && c.ownerId === myId() && !c.partial && !c.npc && c.making !== 1); return true; }
// Stage 6 HUD H7: a viewer who may press an apply action on this character — the GM (who may write here), a player on their own character; the
// sheets feature on (an apply moves the sheet, no dice)
function canApply(c) { if (!c || !F()) return false; if (window.wpVtt && !window.wpVtt.on('sheets')) return false; if (isClient()) return !!(c.ownerId && c.ownerId === myId() && !c.partial && !c.npc && c.making !== 1); return canWrite(); }
function applyTitle(r, sys) { return (Array.isArray(r.apply) ? r.apply : []).map(function(ch) { var f = sys && ch && ch.f ? fieldById(sys, ch.f) : null; return (ch && ch.c ? ch.c : f ? (f.label || f.key) : 'a value') + (ch && ch.set ? ' = ' : ch && ch.add ? ' + ' : ' \u2212 ') + ((ch && ch.formula) || '?'); }).join('; '); }
function rollPick(r) { return Array.isArray(r.apply) ? 'Apply: ' + (r.label || 'Apply') : 'Roll: ' + (r.label || r.formula); }   // Stage 6 HUD H7: the Layout tab's name for a roll entry
// Stage 6 HUD H7: an apply action's button — its label and look as a roll's; pressed, it moves its pools or numbers (applyAction). Inert in the
// Layout preview and a pop-out, and for a viewer who may not change this character
function applyNode(r, c, sys, vars) {
    var label = rollLabel(r, sys, c, vars), can = (_fxLive || window.wpPrintCopy === true) && canApply(c), b = el('button', 'tool sheet-roll sheet-apply' + (Object.prototype.hasOwnProperty.call(ROLL_TONE_CLS, r.tone) ? ROLL_TONE_CLS[r.tone] : ''), label);
    if (r.icon) b.insertBefore(iconNode(r.icon, 'sheet-roll-icon'), b.firstChild);
    b.title = applyTitle(r, sys) + (r.each ? ' \u2014 also ' + (r.by ? 'due' : 'by itself') + (r.each === 'turn' ? ' at the start of its character\u2019s turn' : ' on every new round of a combat') + (r.by ? ' (a reminder for ' + (r.by === 'gm' ? 'the GM' : 'its player') + ' to press)' : '') : '') + (can ? '' : ' (not here: this is a preview or a pop-out, or not your character)'); b.disabled = !can;
    b.addEventListener('click', function() {
        var campN = getActiveCampaign(), cN = charById(c.id, campN); if (!cN) return;
        var lb = label; if (sys && r.label && r.label.indexOf('{') >= 0) { try { lb = rollLabel(r, sys, cN, resolveAll(sys, cN, F(), tokenCtxFor(cN.id, campN)).vars); } catch (err) { lb = label; } }   // the label as it reads at the press
        applyAction(r, cN, lb);
    });
    var box = el('div', 'sheet-field sheet-kind-roll'); box.appendChild(b); return box;
}
// Stage 6 HUD H7: an apply action pressed — a player asks the host (the new values come back as its delta, the card as its record); the GM
// works it out here with the saved system (the sheet's own resolver, token and round included), stores it as ONE change (one Revert brings
// every value back) and posts the card to whoever may see it (applyScope); a card that would carry a GM-only value is kept private, with a toast
function applyAction(r, c, label, row) {   // row (H7b): { f, r, i } — a list's action on one of the character's rows
    var n = net(), camp = getActiveCampaign(), sys = systemOf(camp); if (!camp || !sys || !F()) return;
    if (isClient()) { if (!n || !n.charApply) return; var q = row ? n.charApply(c.id, null, label, row) : n.charApply(c.id, r.id, label); if (q && q.error) toast(q.error); return; }
    if (!canWrite()) return;
    var act = null;
    if (row) { var lfR = fieldById(sys, row.f), lrR = lfR && lfR.kind === 'item-list' && lfR.list && Array.isArray(lfR.list.rolls) ? lfR.list.rolls[row.i] : null; if (lrR && Array.isArray(lrR.apply)) act = lrR; }   // H7b: the saved list's action
    else (sys.rolls || []).forEach(function(x) { if (x && x.id === r.id && Array.isArray(x.apply)) act = x; });
    if (!act) return;   // the saved action, never a draft's
    var tc = tokenCtxFor(c.id, camp), vv = resolveAll(sys, c, F(), tc).vars;
    if (row) { vv = vv && typeof vv.row === 'function' ? vv.row(row.f, row.r) : null; if (!vv) { toast('That row cannot be used now.'); return; } }   // H7b: the row's own names (Row.*)
    var res = applyAct(sys, c, act, vv, F(), tc, row ? { f: row.f, r: row.r } : null);   // R2b: a list's action may move its row's counters
    if (!res.ok) { toast(res.reason === 'none' ? 'Nothing to apply.' : res.reason === 'error' ? (res.message || 'That amount could not be worked out.') : 'That action cannot change those values now.'); return; }
    var ids = Object.keys(res.values), prevs = {}, extra = null;
    ids.forEach(function(fid) { prevs[fid] = c.values && Object.prototype.hasOwnProperty.call(c.values, fid) ? clone(c.values[fid]) : undefined; });
    ids.slice(1).forEach(function(fid) { (extra = extra || {})[fid] = prevs[fid]; });
    lastChange = { charId: c.id, fieldId: ids[0], prev: prevs[ids[0]], extra: extra };
    c.values = c.values || {}; ids.forEach(function(fid) { c.values[fid] = res.values[fid]; });
    afterCharChange(c, false, res.values);
    var hit = [], low = [], keep = function(x) { var l = String(x).toLowerCase(); if (low.indexOf(l) < 0) { low.push(l); hit.push(String(x)); } };
    var rowP = row ? rowRollNames(sys, c, row.f, row.r, res.names, F()) : null, nmA = rowP ? rowP.names : res.names, gmRow = !!(rowP && rowP.gm), keptRow = !!(rowP && rowP.kept);   // owed review F5b#2: a curse the GM keeps on (its owner sees it off)   // H7b: what Row.* read (a column's own names, a choice's option) and a GM-only row
    if (n && n.active && n.role === 'host' && act.vis !== 'gm') { gmOnlyNames(sys, nmA).concat(gmDerivedNames(sys, F(), nmA), gmEffectNames(vv, nmA)).forEach(keep); var ls = row ? '' : labelSecret(sys, vv, act.label); if (ls) keep(ls); }
    var scope = applyScope(sys, c, act, hit.length > 0 || gmRow || keptRow, F()), pub = applyScope(sys, c, act, false, F()) !== 'gm';
    if (gmRow && pub) toast('Kept private: that is on a GM-only item or list.');
    else if (keptRow && pub) toast('Kept private: its owner sees that item switched off.');
    else if (hit.length && pub) toast('Kept private: that amount uses a GM-only value (' + hit.join(', ') + ').');
    if (n && n.postApplyCard) n.postApplyCard(c, label, res.lines, scope);
}
// Stage 6 HUD G10: the host's round hook — on every new round of a combat (net.js combatStep / combatSet), each Each round action on every
// character with a token in it, worked out with the GM's full view and the round just begun (Turn := CombatRound), as his sweep runs on the
// GM's client alone. No card (his sweep posts one only when something expired); one save, one delta per character. Turn-based combat T2b:
// the same for 'turn' — the character whose turn begins, its actions ticked at its turn's start; an action set to wait for a press posts its
// reminder instead (the GM's, or its player's while that player is at the table and the action is theirs to see)
function timedHook(mapId, combat, kind) {
    var camp = getActiveCampaign(), sys = systemOf(camp), n = net(); if (!camp || !sys || !F() || !n || n.role !== 'host') return 0;
    if (window.wpVtt && !window.wpVtt.on('sheets')) return 0;
    var mp = typeof mapId === 'string' && camp.items && Object.prototype.hasOwnProperty.call(camp.items, mapId) ? camp.items[mapId] : null, done = 0, dues = dueActs(sys, kind);
    var who = kind === 'turn' ? { rows: combat && Array.isArray(combat.rows) && combat.rows[combat.turn] ? [combat.rows[combat.turn]] : [] } : combat;
    combatChars(mp, who, charsOf(camp)).forEach(function(e) {
        var c = charById(e.charId, camp); if (!c) return;
        dues.forEach(function(a) { if (n.postDue) n.postDue(c, a, kind, combat.round, a.by === 'owner' && a.vis !== 'gm'); });
        var tc = withRound(tokenCtx(mp, e.tok, tokenFlags()), combat);
        var res = applyRound(sys, c, function(w) { return resolveAll(sys, w, F(), tc).vars; }, F(), tc, kind), ids = Object.keys(res.values);
        if (!ids.length) return;
        c.values = c.values || {}; ids.forEach(function(fid) { c.values[fid] = res.values[fid]; }); c.updated = Date.now();
        if (n.active) n.syncCharDelta(c.id, res.values);
        renderViews(c.id); done++;
    });
    if (done) { save(true); if (window.appRender) window.appRender(); }
    return done;
}
// [sinkcheck:timerules-start]
// Item 20 K5: the time rules a stretch of the campaign's clock fired (calendar.js: after the GM's Apply, or at once when Automatic) — each fire
// { c: charId, r: ruleId, n } run n times with the GM's full view and no token (systemcore timeRuleRun: the host makes every roll), stored, one
// delta per character, its views redrawn; then one summary per character (net.timeCard: its player and the GM, or the GM alone for an NPC or a
// rule that moves or reads what its player cannot see) and the Session Log's line. words: the stretch ("8 hours of rest"). Returns how many
// characters changed
function runTimeRules(fires, words) {
    var camp = getActiveCampaign(), sys = systemOf(camp), n = net(), D = window.wpDiceCore; if (!camp || !sys || !F() || !Array.isArray(fires)) return 0;
    var byChar = Object.create(null), order = [], changed = 0;
    fires.forEach(function(fi) { if (!fi || typeof fi.c !== 'string' || typeof fi.r !== 'string') return; if (!byChar[fi.c]) { byChar[fi.c] = []; order.push(fi.c); } byChar[fi.c].push(fi); });
    order.forEach(function(cid) {
        var c = charById(cid, camp); if (!c) return;
        var parts = [], all = {}, gm = false;
        byChar[cid].forEach(function(fi) {
            var rule = (Array.isArray(sys.rolls) ? sys.rolls : []).filter(function(r) { return r && r.id === fi.r && r.every; })[0]; if (!rule) return;
            var res = timeRuleRun(sys, c, rule, fi.n, F(), D), ks = Object.keys(res.values);
            if (ks.length) { c.values = c.values || {}; ks.forEach(function(k) { if (JSON.stringify(c.values[k]) === JSON.stringify(res.values[k])) return; c.values[k] = res.values[k]; all[k] = res.values[k]; }); }   // only what really moved is stored and sent
            var acts = Array.isArray(rule.apply) ? rule : { apply: Array.isArray(rule.then) ? rule.then : [] }, reads = typeof rule.formula === 'string' ? gmOnlyNames(sys, F().names(rule.formula).map(function(x) { return { name: x }; })).length > 0 : false;
            if (rule.vis === 'gm' || applyScope(sys, c, acts, reads, F()) === 'gm') gm = true;
            var head = (rule.label || 'A rule') + ' \u00d7' + fi.n + (res.rolls.made ? ' (' + res.rolls.pass + ' of ' + res.rolls.made + ' succeeded)' : '');
            var moved = res.lines.filter(function(l) { return l.d !== 0; });   // a full pool says no change
            parts.push(head + (moved.length ? ': ' + moved.map(function(l) { return l.n + ' ' + (l.d >= 0 ? '+' : '') + l.d + ' \u2192 ' + l.v; }).join(', ') : ': no change'));
        });
        if (!parts.length) return;
        if (Object.keys(all).length) { c.updated = Date.now(); if (n && n.active && n.role === 'host' && n.syncCharDelta) n.syncCharDelta(c.id, all); renderViews(c.id); changed++; }
        if (n && n.timeCard) n.timeCard(c, (words ? words + ' \u2014 ' : '') + (c.name || 'A character') + ': ' + parts.join('; '), gm);
    });
    if (changed) { save(true); if (window.appRender) window.appRender(); }
    return changed;
}
// [sinkcheck:timerules-end]
function roundHook(mapId, combat) { return timedHook(mapId, combat, 'round'); }
function turnHook(mapId, combat) { return timedHook(mapId, combat, 'turn'); }
// Turn-based combat T2b: a reminder's Run — this character's saved action as this viewer's system has it, pressed as its button is (the
// GM's own press, or the player's through the host). false when it is not there to press
function runDue(charId, actId) {
    var camp = getActiveCampaign(), sys = systemOf(camp), c = charById(charId, camp), r = null;
    (sys && Array.isArray(sys.rolls) ? sys.rolls : []).forEach(function(x) { if (x && x.id === actId && Array.isArray(x.apply)) r = x; });
    if (!c || !r) { toast('That action is not on the sheet any more.'); return false; }
    if (!canApply(c)) { toast('That character is not yours to change here.'); return false; }
    applyAction(r, c, r.label.indexOf('{') < 0 ? r.label : 'Apply');
    return true;
}
// The combat roster (whiteboard.js): initiative from the system's init roll, made at the table like any roll
function hasInitRoll() { var sys = systemOf(getActiveCampaign()); return !!(sys && initRoll(sys)); }
function initTieNow() { var camp = getActiveCampaign(), sys = systemOf(camp); return sys && F() ? initTie(sys, F(), function(r) { return r && typeof r.charId === 'string' ? charById(r.charId, camp) : null; }) : null; }   // initiative O2: the tie steps for the roster's sort (its rows name their character)
function rollInit(charId, opts) {   // opts.priv: rolled in private whatever the label shows (the roster's re-roll for a creature the GM hid)
    var camp = getActiveCampaign(), sys = systemOf(camp), c = charById(charId, camp), r = sys ? initRoll(sys) : null;
    if (!c || !r) return { error: 'No initiative roll in this system (tick Initiative on a roll in the System editor).' };
    if (!window.wpDice || !window.wpDice.rollFor) return { error: 'Dice are not available.' };
    if (window.wpVtt && !window.wpVtt.on('dice')) return { error: 'Dice are off for this campaign (Settings > VTT features).' };
    var allI = F() ? resolveAll(sys, c, F(), tokenCtxFor(c.id, camp)) : null, lbI = allI ? rollLabel(r, sys, c, allI.vars) : r.label, whyI = allI ? labelSecret(sys, allI.vars, r.label) : '';   // HF5a: the label's value, and the GM's privacy rule
    if (whyI) toast('Kept private: its label shows a GM-only value (' + whyI + ').');
    return window.wpDice.rollFor(charId, r.formula, lbI || 'Initiative', { source: 'combat', priv: !!whyI || !!(opts && opts.priv === true), gmOnly: r.vis === 'gm' });
}
// One value changed on the open sheet: the GM applies it here; a player asks the host and shows it meanwhile
function commit(c, f, value) {
    var camp = getActiveCampaign(), sys = systemOf(camp); if (!camp || !sys) return;
    if (isClient()) {
        var n = net(); if (!n || !n.charEdit) return;
        var r = n.charEdit(c.id, f.id, value);
        if (r && r.error) toast(r.error);
        renderViews(c.id);
        return;
    }
    if (!canWrite()) return;
    var res = applyEdit(sys, c, f.id, value, F(), {});
    if (!res.ok) { toast(res.reason === 'field' ? 'That field cannot be edited.' : 'That value is not allowed here.'); renderViews(c.id); return; }
    var prev = c.values && Object.prototype.hasOwnProperty.call(c.values, f.id) ? clone(c.values[f.id]) : undefined;
    lastChange = { charId: c.id, fieldId: f.id, prev: prev };
    if (typeof budgetNote === 'function') budgetNote(sys, c, f.id, res.value);   // 126: the GM's own change is never refused; a notice says when it takes the character over a budget
    c.values = c.values || {}; c.values[f.id] = res.value;
    var d = {}; d[f.id] = res.value;
    afterCharChange(c, false, d);
}
// HUD frame (HF4b): several values of one character as ONE change (a section's Reset all). The GM's is one delta, and one Revert undoes it all
// (lastChange.extra); a player's is one char-edits message the host judges all-or-nothing. At most LIMITS.editBatch values
function commitMany(c, list) {
    var camp = getActiveCampaign(), sys = systemOf(camp); if (!camp || !sys || !Array.isArray(list) || !list.length) return;
    list = list.slice(0, LIMITS.editBatch);
    if (isClient()) { var n = net(); if (!n || !n.charEdits) return; var r = n.charEdits(c.id, list); if (r && r.error) toast(r.error); renderViews(c.id); return; }
    if (!canWrite()) return;
    var work = Object.assign({}, c, { values: clone(c.values || {}) }), d = {}, prevs = {}, ids = [];   // judged in order on a working copy, all or none
    for (var i = 0; i < list.length; i++) {
        var q = list[i]; if (!q || typeof q.fieldId !== 'string' || Object.prototype.hasOwnProperty.call(d, q.fieldId)) continue;
        var res = applyEdit(sys, work, q.fieldId, q.value, F(), {});
        if (!res.ok) { toast(res.reason === 'field' ? 'That field cannot be edited.' : 'That value is not allowed here.'); renderViews(c.id); return; }
        prevs[q.fieldId] = c.values && Object.prototype.hasOwnProperty.call(c.values, q.fieldId) ? clone(c.values[q.fieldId]) : undefined;
        work.values[q.fieldId] = res.value; d[q.fieldId] = res.value; ids.push(q.fieldId);
    }
    if (!ids.length) return;
    var extra = null; ids.slice(1).forEach(function(fid) { (extra = extra || {})[fid] = prevs[fid]; });
    lastChange = { charId: c.id, fieldId: ids[0], prev: prevs[ids[0]], extra: extra };   // one Revert brings every value back
    if (typeof budgetNote === 'function') budgetNote(sys, c, d);   // 126
    c.values = c.values || {}; ids.forEach(function(fid) { c.values[fid] = d[fid]; });
    afterCharChange(c, false, d);
}
// One inventory change on the open sheet (add / remove / setQty). Like commit, but for the item-list kind, which
// travels its own per-entry op (arrays can't ride the scalar char-edit path).
// 5h: one change to a character's status effects: a player asks the host (shown at once, undone on a refusal); the GM applies it here,
// with any pool an effect's end brought down to its new max in the same change
function commitEffect(c, f, q) {
    var camp = getActiveCampaign(), sys = systemOf(camp); if (!camp || !sys) return;
    if (isClient()) { var n = net(); if (!n || !n.charEffect) return; var r = n.charEffect(c.id, f.id, q); if (r && r.error) toast(r.error); renderViews(c.id); return; }
    if (!canWrite()) return;
    var nC = net(), res = applyEffectOp(sys, c, f.id, q, F(), { now: Date.now(), inCombat: !!(nC && nC.charInCombat && nC.charInCombat(c.id)) });   // T5a: a timed effect starts its timer
    if (!res.ok) { toast(res.reason === 'field' ? 'That list cannot be changed.' : res.reason === 'missing' ? 'That effect is gone.' : 'That change is not allowed.'); renderViews(c.id); return; }
    var prev = c.values && Object.prototype.hasOwnProperty.call(c.values, f.id) ? clone(c.values[f.id]) : undefined, extra = null;
    if (res.clamp) { extra = {}; Object.keys(res.clamp).forEach(function(fid) { extra[fid] = c.values && Object.prototype.hasOwnProperty.call(c.values, fid) ? clone(c.values[fid]) : undefined; }); }
    lastChange = { charId: c.id, fieldId: f.id, prev: prev, extra: extra };   // revert brings a clamped pool back too
    c.values = c.values || {}; c.values[f.id] = res.value;
    var d = {}; d[f.id] = res.value;
    if (res.clamp) Object.keys(res.clamp).forEach(function(fid) { c.values[fid] = res.clamp[fid]; d[fid] = res.clamp[fid]; });
    afterCharChange(c, false, d);
}
function commitItem(c, f, q) {   // Stage 6 F4a: a row op q = { op: add|remove|setQty|keep|undo, defId?, rowId, qty? }; F4b set (facts: lvl, on, note; F4c1 paid); F4c2 ov (a copy's own values); F4c3 custom (def: a custom row's patch)
    var camp = getActiveCampaign(), sys = systemOf(camp); if (!camp || !sys) return;
    var before = q.rowId ? rowQty(c, f, q.rowId) : 0;
    var undoFollow = function(r) { if (!r || !r.ok) return; if (r.added > 0) noteUndo(c, f, r); else if (q.rowId && q.op !== 'undo' && before > (r.qty | 0)) takeBack(c, f, q.rowId, before - (r.qty | 0)); };   // Stage 6: a pickup opens the Undo; a drop takes it down
    if (isClient()) {
        var n = net(); if (!n || !n.charItem) return;
        var r = n.charItem(c.id, f.id, q);
        if (r && r.error) toast(r.error); else undoFollow(r);
        renderViews(c.id);
        return;
    }
    if (!canWrite()) return;
    var res = applyRowOp(sys, c, f.id, q, F(), {});
    if (!res.ok) { toast(res.why === 'formula' ? 'Not a formula this sheet can roll.' : res.why === 'key' ? 'That key is already used in this list.' : res.why === 'badkey' ? 'Not a usable key: a letter, then letters, digits and _ (up to 40).' : res.reason === 'field' ? 'That list cannot be changed that way.' : res.reason === 'missing' ? 'That item is gone.' : 'That change is not allowed.'); renderViews(c.id); return; }   // why (F4c2, F4c3 key / badkey): the GM's own, never on the wire
    undoFollow(res);
    var prev = c.values && Object.prototype.hasOwnProperty.call(c.values, f.id) ? clone(c.values[f.id]) : undefined;
    lastChange = { charId: c.id, fieldId: f.id, prev: prev };
    if (typeof budgetNote === 'function') budgetNote(sys, c, f.id, res.value);   // 126: the GM's own change is never refused; a notice says when it takes the character over a budget
    c.values = c.values || {}; c.values[f.id] = res.value;
    var d = {}; d[f.id] = res.value;
    if (ownerSeesSame(camp, sys, prev, res.value, f.id)) d = {};   // Stage 6: a change only to a row its owner never holds (a kept curse) is saved and never sent — even an unchanged copy would tell them
    afterCharChange(c, false, d);
}
// Stage 6: whether the owner's copy of a list is the same before and after (the players' view, the full library for GM-only inline rows)
function ownerSeesSame(camp, sys, a, b, fid) {
    var pv = playerSystem(camp); if (!pv) return false;
    var lib = {}; (sys.items || []).forEach(function(it) { if (it && typeof it.id === 'string') lib[it.id] = it; });
    var pf = null; (pv.fields || []).forEach(function(x) { if (x && x.id === fid) pf = x; }); var sp = pf && pf.list ? pf.list : true;   // owed review F5a2#4: the list as its owner gets it (a choice's secret label narrowed away); not in their view: every stat (fail closed toward sending)
    return JSON.stringify(projectRows(Array.isArray(a) ? a : [], pv, lib, sp)) === JSON.stringify(projectRows(Array.isArray(b) ? b : [], pv, lib, sp));   // F4c1 (critic 1): damage, cost and locks never
}
function revertLast() {
    if (!lastChange || isClient()) return;
    var camp = getActiveCampaign(), c = charById(lastChange.charId, camp); if (!c) { lastChange = null; return; }
    var d = {}, fidR = lastChange.fieldId, sysR = systemOf(camp), fR = sysR ? fieldById(sysR, fidR) : null, curR = c.values && Object.prototype.hasOwnProperty.call(c.values, fidR) ? clone(c.values[fidR]) : undefined;
    if (lastChange.prev === undefined) { delete c.values[lastChange.fieldId]; d[lastChange.fieldId] = null; }
    else { c.values[lastChange.fieldId] = lastChange.prev; d[lastChange.fieldId] = lastChange.prev; }
    if (lastChange.extra) Object.keys(lastChange.extra).forEach(function(fid) { var pv = lastChange.extra[fid]; if (pv === undefined) { delete c.values[fid]; d[fid] = null; } else { c.values[fid] = pv; d[fid] = pv; } });   // 5h: a pool an effect's end brought down
    if (fR && fR.kind === 'item-list' && ownerSeesSame(camp, sysR, curR, lastChange.prev, fidR)) delete d[fidR];   // F4b review: taking back a change its owner never held (a kept curse, a kept-on switch) tells them nothing
    lastChange = null;
    afterCharChange(c, d[Object.keys(d)[0]] === null, d);
    toast('Reverted.');
}
// The ShadowBase bridge (decision 10g, copy once): the sheet attached to a token gives its attributes, resources and
// skills to a campaign character through the alias table; a token without a character gets one named after it
/* ---------- Onboarding F1c: a character's own picture ---------- */
// The picture of a character comes from a plan (net.js charFacePlan): a picture is saved into the campaign's pictures — a PNG made from the
// player's photo (a square of at most 256 pixels), or a bundled picture copied into the tutorial folder where the Image Library already keeps
// them — and becomes its portrait and the art of every token of it; a face (an emoji, the default) is kept on the character and drawn on its
// tokens. From then on the picture is the character's own: changing a profile never rewrites it. replace: also when it already has a picture
// or a face (the owner's own change); a give never overwrites one.
function tokensOfChar(camp, cid) { var out = []; if (typeof cid !== 'string' || !cid) return out; Object.keys(camp.items || {}).forEach(function(k) { var m = camp.items[k]; if (m && m.type === 'map' && Array.isArray(m.whiteboard)) m.whiteboard.forEach(function(w) { if (w && w.isChar && w.charId === cid) out.push({ m: m, w: w }); }); }); return out; }
// [sinkcheck:charpng-start]
function pngOf(dataUrl) {   // a square PNG of at most 256 pixels, cropped from the middle: a picture from the wire is never drawn larger, nor at all past 4096 a side
    return new Promise(function(res, rej) {
        var im = new Image();
        im.onload = function() {
            try {
                var w = im.naturalWidth, h = im.naturalHeight; if (!(w > 0 && h > 0) || w > 4096 || h > 4096) { rej(new Error('size')); return; }
                var s = Math.min(w, h), side = Math.min(256, s), cv = document.createElement('canvas'); cv.width = side; cv.height = side;
                cv.getContext('2d').drawImage(im, Math.floor((w - s) / 2), Math.floor((h - s) / 2), s, s, 0, 0, side, side);
                cv.toBlob(function(b) { if (b) res(b); else rej(new Error('png')); }, 'image/png');
            } catch (e) { rej(e); }
        };
        im.onerror = function() { rej(new Error('image')); };
        im.src = dataUrl;
    });
}
// [sinkcheck:charpng-end]
function uploadExact(rel, body) {   // a file saved at exactly images/<...> (the server keeps it inside saves/images); resolves to its address in the app
    return fetch('/api/upload-exact?path=' + encodeURIComponent(rel), { method: 'POST', body: body }).then(function(r) { if (!r.ok) throw new Error('upload'); return '/saves/' + rel; });
}
function copyBundled(name) {
    var fs2 = [name + '_sq.jpg'];   // grid-shaped tokens: one square picture, portrait and token art alike (each map's cell shape cuts it)
    return Promise.all(fs2.map(function(f) { return fetch('assets/tutorial/' + f).then(function(r) { if (!r.ok) throw new Error('asset'); return r.blob(); }).then(function(b) { return uploadExact('images/tutorial/' + f, b); }); }))
        .then(function(u) { return { portrait: u[0], token: u[0] }; });
}
// [sinkcheck:prunepics-start]
// Every new picture takes a fresh name (above), so each character's pictures (portrait-<id>-...) and each plain token's (token-<id>-...) are
// kept few: the two newest files (one may still be on its way onto the token), the one it wears, the one before it, and any a campaign or a
// step of the GM's undo still shows stay; the rest are deleted. The host's own saves folder only; a failure never fails the change. Resolves
// to how many went
function prunePics(prefix, keep) {
    try {
        if (isClient() || !/^(?:portrait|token)-[A-Za-z0-9_-]{1,40}$/.test(String(prefix))) return Promise.resolve(0);
        var re = new RegExp('^/saves/images/portraits/' + prefix + '-[a-z0-9]{1,12}\\.png$'), hold = (Array.isArray(keep) ? keep : []).filter(function(k) { return typeof k === 'string' && k; });
        return fetch('/api/list-images').then(function(r) { return r.ok ? r.json() : []; }).then(function(list) {
            var mine = (Array.isArray(list) ? list : []).filter(function(im) { return im && typeof im.path === 'string' && re.test(im.path); });
            mine.sort(function(a, b) { return (Number(b.mtime) || 0) - (Number(a.mtime) || 0); });
            var used = JSON.stringify(state.appState || {}), refs = window.wpHist && window.wpHist.refs ? window.wpHist.refs : function() { return true; };   // no undo to ask: nothing goes
            var go = mine.slice(2).map(function(im) { return im.path; }).filter(function(p) { var nm = p.slice(p.lastIndexOf('/') + 1); return hold.indexOf(p) < 0 && used.indexOf(nm) < 0 && !refs(nm); });
            return Promise.all(go.map(function(p) { return fetch('/api/delete-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: p }) }).then(function(r) { return r.ok ? 1 : 0; }, function() { return 0; }); }))
                .then(function(a) { return a.reduce(function(s, x) { return s + x; }, 0); });
        }).catch(function() { return 0; });
    } catch (e) { return Promise.resolve(0); }
}
// [sinkcheck:prunepics-end]
// [sinkcheck:charface-start]
function applyCharFace(charId, plan, replace) {
    var camp = getActiveCampaign(), c = charById(charId, camp); if (!camp || !c || !plan || typeof plan.kind !== 'string') return Promise.resolve(false);
    var toks = tokensOfChar(camp, c.id);
    if (!replace && (c.portrait || c.face || toks.some(function(t) { return !!t.w.src || !!t.w.face; }))) return Promise.resolve(false);   // it has a picture or a face of its own: kept
    var owner = c.ownerId && net() ? Object.values(net().roster || {}).find(function(p) { return p && p.id === c.ownerId; }) : null;
    var col = owner && typeof owner.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(owner.color) ? owner.color : '#4db3d3';
    var dress = function(portrait, art, face) {
        var camp2 = getActiveCampaign(), c2 = charById(charId, camp2); if (!c2 || camp2 !== camp) return false;   // the campaign changed while a picture was saved
        if (window.wpHistFlush) window.wpHistFlush();   // the GM's pending edit is its own step first
        c2.portrait = portrait || '';
        if (face) c2.face = face; else delete c2.face;   // the face is the character's own: a token made later wears it too
        var maps = [];
        tokensOfChar(camp2, c2.id).forEach(function(t) {
            var w = t.w;
            if (art) { w.type = 'image'; w.src = art; w.color = 'transparent'; delete w.face; }
            else { if (w.type === 'image') { w.type = 'circle'; delete w.src; delete w.shape; w.color = col; } w.face = face; }
            if (window.wpSystemCore && window.wpSystemCore.shapeStandIn && window.wpSystemCore.shapeStandIn(w, t.m)) { if (window.wpSeatCell) window.wpSeatCell(w, t.m); else if (window.wpSeatHex) window.wpSeatHex(w, t.m); }   // grid-shaped tokens: its map's cell shape (a picture cut to it), seated in its cell
            if (maps.indexOf(t.m.id) < 0) maps.push(t.m.id);
        });
        var n = net(), wasR = n ? n.applyingRemote : false;
        if (n) n.applyingRemote = true;   // never a step of the GM's undo (a player's change, or what a give brought)
        try { afterCharChange(c2, true); } finally { if (n) n.applyingRemote = wasR; }
        if (n && n.active && n.role === 'host' && n.broadcastItemFiltered) maps.forEach(function(id) { n.broadcastItemFiltered(camp2.id, id); });
        return true;
    };
    if (plan.kind === 'face') { var fcl = net() && net().cleanFace ? net().cleanFace(plan.face) : ''; return Promise.resolve(fcl ? dress('', null, fcl) : false); }
    if (plan.kind === 'bundled') return (net() && net().FACE_PICS && net().FACE_PICS.indexOf(plan.name) >= 0 ? copyBundled(plan.name) : Promise.reject(new Error('name'))).then(function(u) { return dress(u.portrait, u.token, null); }).catch(function() { toast('That picture could not be copied.'); return false; });
    if (plan.kind === 'picture') {
        var nmP = 'portrait-' + c.id + '-' + Date.now().toString(36) + '.png', prevP = typeof c.portrait === 'string' ? c.portrait : '';   // a fresh name each time: a player's machine keeps a picture per address for the session, so a reused name would show them the old one
        return (net() && net().safeAvatar && net().safeAvatar(plan.data) ? pngOf(plan.data) : Promise.reject(new Error('picture'))).then(function(b) { return uploadExact('images/portraits/' + nmP, b); })
            .then(function(url) { if (!/^[/]saves[/]images[/]/.test(String(url))) return false; var okP = dress(url, url, null); if (okP) prunePics('portrait-' + c.id, [url, prevP]); return okP; }).catch(function() { toast('That picture could not be saved.'); return false; });
    }
    return Promise.resolve(false);
}
// [sinkcheck:charface-end]
// [sinkcheck:charframe-start]
// The token creator, the GM's side: a framed picture (a PNG blob) for a character, saved under a fresh name — from Portrait… (scope
// 'portrait': its portrait; a token that wore the old portrait follows) or Frame picture… on one of its tokens (scope 'tokens': every token
// of it, a character's tokens change together, while one still wears what was framed (was); the portrait follows when it was that picture
// or it had none). frame: the kept original ({ src, x, y, s }, GM-only) or null — a kept original its tokens still wear stays when Portrait…
// moved none of them. Never a step of the GM's undo, and a barrier on the maps it changed: no earlier step brings the old picture back
function applyCharFrame(charId, plan) {
    var camp = getActiveCampaign(), c = charById(charId, camp);
    if (isClient() || !canWrite() || !camp || !c || c.id !== charId || !plan || typeof Blob === 'undefined' || !(plan.blob instanceof Blob) || (plan.scope !== 'portrait' && plan.scope !== 'tokens')) return Promise.resolve(false);
    var was = typeof plan.was === 'string' ? plan.was : '', prevP = typeof c.portrait === 'string' ? c.portrait : '';
    if (plan.scope === 'tokens' && !(was && tokensOfChar(camp, c.id).some(function(t) { return t.w.src === was; }))) return Promise.resolve(false);
    return uploadExact('images/portraits/portrait-' + c.id + '-' + Date.now().toString(36) + '.png', plan.blob).then(function(url) {
        var camp2 = getActiveCampaign(), c2 = charById(charId, camp2); if (!c2 || camp2 !== camp || !/^[/]saves[/]images[/]/.test(String(url))) return false;
        if (plan.scope === 'tokens' && !tokensOfChar(camp2, c2.id).some(function(t) { return t.w.src === was; })) return false;   // a token changed while the picture was saved (as applyTokenFrame picks again)
        if (window.wpHistFlush) window.wpHistFlush();
        var old = typeof c2.portrait === 'string' ? c2.portrait : '', maps = [];
        tokensOfChar(camp2, c2.id).forEach(function(t) {
            var w = t.w; if (plan.scope === 'portrait' && !(old && w.type === 'image' && w.src === old)) return;
            w.type = 'image'; w.src = url; w.color = 'transparent'; delete w.face;
            if (window.wpSystemCore && window.wpSystemCore.shapeStandIn && window.wpSystemCore.shapeStandIn(w, t.m)) { if (window.wpSeatCell) window.wpSeatCell(w, t.m); else if (window.wpSeatHex) window.wpSeatHex(w, t.m); }
            if (maps.indexOf(t.m.id) < 0) maps.push(t.m.id);
        });
        if (maps.length && window.wpHistBarrier) window.wpHistBarrier(maps);   // an undo or a redo never brings the old picture back on one map only (the change spans maps and the portrait)
        if (plan.scope === 'portrait' || !old || old === was) { c2.portrait = url; delete c2.face; }
        var SC = window.wpSystemCore, fr = plan.frame && SC && SC.cleanFrame ? SC.cleanFrame(Object.assign({}, plan.frame, { of: url })) : null, frOld = SC && SC.cleanFrame ? SC.cleanFrame(c2.frame) : null;
        if (!(frOld && frOld.of !== url && tokensOfChar(camp2, c2.id).some(function(t) { return t.w.src === frOld.of; }))) { if (fr) c2.frame = fr; else delete c2.frame; }   // a kept original its tokens still wear stays (Portrait… none of them followed)
        var n = net(), wasR = n ? n.applyingRemote : false;
        if (n) n.applyingRemote = true;
        try { afterCharChange(c2, true); } finally { if (n) n.applyingRemote = wasR; }
        if (n && n.active && n.role === 'host' && n.broadcastItemFiltered) maps.forEach(function(id) { n.broadcastItemFiltered(camp2.id, id); });
        prunePics('portrait-' + c2.id, [url, prevP, was]);
        return true;
    }).catch(function() { toast('That picture could not be saved.'); return false; });
}
// [sinkcheck:charframe-end]
// [sinkcheck:tokframe-start]
// ... and for plain tokens (Frame picture…): the selected ones still wearing what was framed (was) take the framed picture (one file, named
// after the first); frame: the kept original (GM-only) or null. A step of the GM's undo, like any edit of theirs
function applyTokenFrame(mapId, ids, plan) {
    var camp = getActiveCampaign(), idOk = function(v) { return typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v); };
    if (isClient() || !canWrite() || !camp || !plan || typeof Blob === 'undefined' || !(plan.blob instanceof Blob) || typeof plan.was !== 'string' || !plan.was || !Array.isArray(ids) || !idOk(ids[0])) return Promise.resolve(false);
    var pick = function(m) { return m && m.type === 'map' && Array.isArray(m.whiteboard) ? m.whiteboard.filter(function(w) { return w && idOk(w.id) && ids.indexOf(w.id) >= 0 && w.type === 'image' && w.src === plan.was && !w.charId && !w.waiting; }) : []; };
    var m0 = Object.prototype.hasOwnProperty.call(camp.items || {}, mapId) ? camp.items[mapId] : null; if (!pick(m0).length) return Promise.resolve(false);
    return uploadExact('images/portraits/token-' + ids[0] + '-' + Date.now().toString(36) + '.png', plan.blob).then(function(url) {
        var camp2 = getActiveCampaign(); if (camp2 !== camp || !/^[/]saves[/]images[/]/.test(String(url))) return false;
        var hit = pick(Object.prototype.hasOwnProperty.call(camp2.items || {}, mapId) ? camp2.items[mapId] : null); if (!hit.length) return false;
        var SC = window.wpSystemCore, fr = plan.frame && SC && SC.cleanFrame ? SC.cleanFrame(Object.assign({}, plan.frame, { of: url })) : null;
        hit.forEach(function(w) { w.src = url; if (fr) w.frame = Object.assign({}, fr); else delete w.frame; });
        save();
        if (window.appRender) window.appRender();
        prunePics('token-' + ids[0], [url, plan.was]);
        return true;
    }).catch(function() { toast('That picture could not be saved.'); return false; });
}
// [sinkcheck:tokframe-end]
// Portrait… (the Characters tab): the chosen library picture is framed first (at the square chosen last when it is the kept original)
function framePortrait(ch, src) {
    if (!window.wpFrame) { ch.portrait = src; delete ch.face; afterCharChange(ch, true); renderAll(); }   // no creator here: as before
    else {
        var SC = window.wpSystemCore, fr = SC && SC.cleanFrame ? SC.cleanFrame(ch.frame) : null, id = ch.id;
        window.wpFrame.open(src, { px: 256, as: 'blob', title: 'Frame the portrait', start: fr && fr.src === src ? { x: fr.x, y: fr.y, s: fr.s } : null, keep: true }, function(res) {
            applyCharFrame(id, { blob: res.blob, scope: 'portrait', frame: res.keep ? { src: src, x: res.rect.x, y: res.rect.y, s: res.rect.s } : null }).then(function(ok) { if (ok) { toast('The portrait is framed.'); renderAll(); } });
        });
    }
}
// The owner's "Picture…" on their own sheet: the face picker, with a picture of their own to upload (a second click closes it)
function pickCharPicture(anchor) {
    var c = sheetOpen ? charById(sheetOpen) : null, n = net(); if (!c || !isClient() || c.partial || c.ownerId !== myId() || !window.wpFaces || !n || !n.charPic) return;
    if (window.wpFaces.isOpen && window.wpFaces.isOpen()) { window.wpFaces.close(); return; }
    var prof = n.getProfile ? n.getProfile() : {};
    var send = function(face, img) {
        if (face === 'photo' && !img && n.safeAvatar && n.safeAvatar(prof.avatar)) img = prof.avatar;   // "My picture" is the one they see here (the GM's copy of it may be older)
        var r = n.charPic(c.id, face || '', img || '', function(a) { toast(a.error || 'Your character\u2019s picture is changed.'); }); if (r && r.error) toast(r.error);
    };
    window.wpFaces.open(anchor, '', prof, function(face, img) { send(face, img); }, { upload: true });
}
/* ---------- Onboarding F3a: a character a player makes ---------- */
// The player's side: start one (the host mints it in the making — theirs alone, every field they can see theirs to set — and sends it here; its
// sheet opens), name it while it is (owner, 2026-09-27: only then), say it is done (it goes into play; an unlocked one locks again)
function startMaking() {
    var n = net(); if (!isClient() || !n || !n.charMake) return;
    var prof = n.getProfile ? n.getProfile() : {};
    showPrompt('A name for your character', (prof && typeof prof.name === 'string' && prof.name) || '', function(nm) {
        if (nm === null || nm === undefined) return;
        var r = n.charMake(String(nm), function(a) { if (a.error) { toast(a.error); return; } if (a.charId) openSheet(a.charId); });
        if (r && r.error) toast(r.error);
    });
}
function renameMaking() {
    var c = sheetOpen ? charById(sheetOpen) : null, n = net(); if (!c || !isClient() || c.making !== 1 || !n || !n.charName) return;
    showPrompt('Your character\u2019s name', c.name, function(nm) { if (nm === null || nm === undefined || !String(nm).trim()) return; var r = n.charName(c.id, String(nm), function(a) { if (a.error) toast(a.error); }); if (r && r.error) toast(r.error); });
}
function doneMaking() {
    var c = sheetOpen ? charById(sheetOpen) : null, n = net(); if (!c || !isClient() || !(c.making === 1 || c.unlocked === 1) || !n || !n.charDone) return;
    var id = c.id, nm = c.name, mk = c.making === 1, inv = c.invited === 1, cs = charsOf(), me = myId(), other = Object.keys(cs).some(function(k) { var x = cs[k]; return x && x.id !== id && x.ownerId === me && !x.npc && !x.partial && x.making !== 1; });   // the GM gave them one meanwhile: it stays in play
    showConfirm(mk ? 'Finished with ' + nm + '? ' + (other && !inv ? 'It is kept (you go on playing the character your GM gave you)' : other ? 'It goes into play now (the character you play now is kept)' : 'It goes into play now') + ', and your GM is told (they may send it back to you).' : 'Done with ' + nm + '\u2019s sheet? It locks again, and your GM is told.', function(y) {
        if (!y) return;
        var r = n.charDone(id, function(a) { toast(a.error || (mk ? (a.kept ? nm + ' is finished and kept: you go on playing the character your GM gave you.' : nm + ' is in play.') : nm + ' is done.')); }); if (r && r.error) toast(r.error);
    });
}
// The GM's side: a character a player made (or finished) waits for Keep it (owner, 2026-09-27); Send back unlocks it for them to fill in, with a
// note; Remove (one a player made) deletes it with its tokens and gives them a waiting token where it stood; Unlock / Lock on any player's character
// [sinkcheck:reviewbar-start]
// [systemcheck:budgetbar-start]
// 126, point budgets on the sheet (the owner: "the sheet shows spent of total"): one chip a budget, its name, "spent of has", and what is
// left or by how much it is over. A budget whose figures cannot be worked out for this character shows a dash. A budget's name comes from
// the system, which can come from a file: every word here is a text node. true: it drew a chip
function budgetBar(box, sys, c) {
    if (!box) return false; box.textContent = '';
    var list = sys && c && F() ? budgetsOf(sys, c, F()) : [];
    list.forEach(function(b) {
        var chip = el('span', 'sheet-budget' + (b.over ? ' over' : ''));
        chip.appendChild(el('b', '', b.name));
        if (b.left === null) { chip.appendChild(el('span', 'sheet-budget-fig', '—')); chip.title = 'This budget could not be worked out for this character'; }
        else { chip.appendChild(el('span', 'sheet-budget-fig', fmtNum(b.spent) + ' of ' + fmtNum(b.has))); chip.appendChild(el('span', 'sheet-budget-left', b.over ? fmtNum(b.spent - b.has) + ' over' : fmtNum(b.left) + ' left')); }
        box.appendChild(chip);
    });
    return list.length > 0;
}
// The GM's own change is never refused by a budget: a notice says when it takes the character over, or further over. Asked before the
// change is stored, with the new value by its field (one field and its value, or a map of them)
function budgetNote(sys, c, a, v) {
    var d = a; if (typeof a === 'string') { d = {}; d[a] = v; }
    var w = budgetWatch(sys, c, d, F()), hit = w.refuse || w.warn[0];
    if (hit) toast((c && c.name ? c.name : 'This character') + (hit.lost === true ? ': ' : ' is over. ') + budgetSays(hit));
}
// [systemcheck:budgetbar-end]
function renderReviewBar(c, camp, gm) {
    var bar = ui('sheetReviewBar'); if (!bar) return;
    bar.textContent = '';
    if (!gm || !c || c.review !== 1) { bar.style.display = 'none'; return; }
    var S = window.wpSystemCore, cl = S && S.charClash ? S.charClash(camp, c.name, c.id) : [], CLW = { character: 'another character\u2019s', token: 'a token\u2019s', room: 'a room character\u2019s' };
    var who = (c.ownerId && playerNames(camp)[c.ownerId]) || 'A player';
    bar.appendChild(el('span', 'sheet-rv-text', who + (c.made === 1 ? ' made this character' : ' finished this sheet') + (cl.length ? ' \u00b7 the name is also ' + cl.map(function(k) { return CLW[k]; }).join(' and ') : '') + '.'));
    var bt = function(label, title, fn, cls) { var b = el('button', 'tool ghost notepad-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.title = title; b.addEventListener('click', function() { fn(c.id); }); bar.appendChild(b); };
    bt('Keep it', 'It stays as it is (Remove goes; Unlock is still on its sheet)', keepMade);
    bt('Send back\u2026', 'Unlock it for its player to fill in, with a note', sendBackMade);
    if (c.made === 1) bt('Remove\u2026', 'Delete it and its tokens; its player gets a waiting token where it stood', removeMadeAsk, 'danger');
    bar.style.display = '';
}
// [sinkcheck:reviewbar-end]
// Onboarding F3b: the GM asks a player to make a character (where making is not off; also a replacement for one they play — it goes into play
// when they press Done, unless the GM gives them another meanwhile). It starts in the making, theirs alone, under their name
function inviteMaking(pid) {
    var camp = getActiveCampaign(), S = window.wpSystemCore, n = net(); if (!camp || isClient() || !okPid(pid) || !camp.system || !S || !S.newCharRules) return false;
    if (S.newCharRules(camp, sheetsOnIn(camp)).create === 'off') return false;
    var cs = charsOf(camp), had = Object.keys(cs).filter(function(k) { return cs[k] && cs[k].ownerId === pid && cs[k].making === 1; })[0];
    if (had) { toast('They are making ' + cs[had].name + ' already.'); return false; }
    var raw = playerNames(camp)[pid] || '', nm = (n && n.cleanCharName ? n.cleanCharName(raw) : String(raw).slice(0, 60)) || 'Character', id = S.uid('c_');
    while (Object.prototype.hasOwnProperty.call(cs, id)) id = S.uid('c_');
    cs[id] = { id: id, name: nm, ownerId: pid, portrait: '', npc: false, values: {}, updated: Date.now(), making: 1, made: 1, invited: 1 };
    save(true);
    if (n && n.active && n.role === 'host') { if (n.sendCharTo) n.sendCharTo(pid, id); if (n.charReview) n.charReview(pid, id, nm, 'invited', ''); }
    if (n && n.logEvent) n.logEvent('char', 'Asked ' + (raw || 'a player') + ' to make a character');
    toast((raw || 'The player') + ' is asked to make a character' + (n && n.isConnected && n.isConnected(pid) ? '.' : ' (they see it when they join).'));
    if (window.appRender) window.appRender();
    if (window.wpRenderPartyStrip) window.wpRenderPartyStrip();
    return true;
}
// Onboarding F3b: a plain token a player took (Just a token, no sheets): its picture from their face — a bundled one copied, their photo saved
// as a PNG — put on it when saved (it wears the silhouette until then); never on a token that has a picture meanwhile
function applyTokenFace(mapId, wbId, plan, replace) {   // replace (the token creator: a player's new picture for their own token): over a picture it has
    var n = net(); if (isClient() || !plan || (plan.kind !== 'bundled' && plan.kind !== 'picture') || !/^[A-Za-z0-9_-]{1,40}$/.test(String(wbId))) return Promise.resolve(false);
    var camp = getActiveCampaign();
    var p = plan.kind === 'bundled' ? (n && n.FACE_PICS && n.FACE_PICS.indexOf(plan.name) >= 0 ? copyBundled(plan.name).then(function(u) { return u.token; }) : Promise.reject(new Error('name')))
        : (n && n.safeAvatar && n.safeAvatar(plan.data) ? pngOf(plan.data).then(function(b) { return uploadExact('images/portraits/token-' + wbId + '-' + Date.now().toString(36) + '.png', b); }) : Promise.reject(new Error('picture')));
    return p.then(function(url) {
        var camp2 = getActiveCampaign(); if (!camp2 || camp2 !== camp || !/^[/]saves[/]images[/]/.test(String(url))) return false;
        var m = Object.prototype.hasOwnProperty.call(camp2.items, mapId) ? camp2.items[mapId] : null, w = m && Array.isArray(m.whiteboard) ? m.whiteboard.find(function(x) { return x && x.id === wbId; }) : null;
        if (!w || !w.isChar || (w.src && !replace)) return false;
        if (window.wpHistFlush) window.wpHistFlush();
        var prevT = typeof w.src === 'string' ? w.src : '';
        w.type = 'image'; w.src = url; w.color = 'transparent'; delete w.face;
        if (window.wpSystemCore && window.wpSystemCore.shapeStandIn && window.wpSystemCore.shapeStandIn(w, m)) { if (window.wpSeatCell) window.wpSeatCell(w, m); else if (window.wpSeatHex) window.wpSeatHex(w, m); }   // its map's cell shape (the picture cut to it), seated in its cell
        var wasR = n ? n.applyingRemote : false; if (n) n.applyingRemote = true;   // never a step of the GM's undo
        try { save(true); } finally { if (n) n.applyingRemote = wasR; }
        if (n && n.active && n.role === 'host' && n.broadcastItemFiltered) n.broadcastItemFiltered(camp2.id, mapId);
        if (window.appRender) window.appRender();
        if (plan.kind === 'picture') prunePics('token-' + wbId, [url, prevT]);
        return true;
    }).catch(function() { toast('That picture could not be saved.'); return false; });
}
function keepMade(id) { var camp = getActiveCampaign(), c = charById(id, camp); if (!c || isClient()) return; delete c.review; save(true); var n = net(); if (n && n.logEvent) n.logEvent('char', 'Kept ' + c.name); renderSheet(); if (window.appRender) window.appRender(); if (window.wpRenderPartyStrip) window.wpRenderPartyStrip(); }
function sendBackMade(id) {
    var c0 = charById(id); if (!c0 || isClient()) return;
    showPrompt('Send ' + c0.name + ' back to its player? A note for them (optional):', '', function(note) {
        if (note === null || note === undefined) return;
        var camp = getActiveCampaign(), c = charById(id, camp); if (!c || !c.ownerId) return;
        delete c.review; c.unlocked = 1; afterCharChange(c, true);
        var n = net(); if (n && n.charReview) n.charReview(c.ownerId, c.id, c.name, 'back', note); if (n && n.logEvent) n.logEvent('char', 'Sent ' + c.name + ' back to ' + (playerNames(camp)[c.ownerId] || 'its player'));
        if (window.wpRenderPartyStrip) window.wpRenderPartyStrip();
    });
}
function unlockChar(id) {
    var camp = getActiveCampaign(), c = charById(id, camp), n = net(); if (!c || isClient() || !c.ownerId || c.npc || c.making === 1) return;
    if (c.unlocked === 1) { delete c.unlocked; afterCharChange(c, true); if (n && n.charReview) n.charReview(c.ownerId, c.id, c.name, 'locked', ''); if (n && n.logEvent) n.logEvent('char', 'Locked ' + c.name); if (window.wpRenderPartyStrip) window.wpRenderPartyStrip(); return; }
    sendBackMade(id);
}
function removeMadeAsk(id) { var c0 = charById(id); if (!c0 || isClient()) return; showPrompt('Remove ' + c0.name + '? It goes with its tokens, and its player gets a waiting token where it stood. A note for them (optional):', '', function(note) { if (note === null || note === undefined) return; removeMade(id, note); }); }
function removeMade(id, note) {
    var camp = getActiveCampaign(), c = charById(id, camp), n = net(); if (!camp || !c || isClient()) return false;
    var pid = c.ownerId || '', spot = pid ? tokenSpotOf(camp, pid, id) : null, maps = [];   // where its token stood on their current map
    if (window.wpHistFlush) window.wpHistFlush();
    Object.keys(camp.items || {}).forEach(function(k) {
        var m = camp.items[k]; if (!m || m.type !== 'map' || !Array.isArray(m.whiteboard)) return;
        var before = m.whiteboard.length;
        m.whiteboard = m.whiteboard.filter(function(w) { return !(w && w.isChar && w.charId === id); });
        m.whiteboard.forEach(function(w) { if (w && w.charId === id) delete w.charId; });
        if (m.whiteboard.length !== before) maps.push(m.id);
    });
    delete charsOf(camp)[id];
    if (pid) { unbindStale(camp, pid, c); unbindMade(camp, pid, c.name); syncOwners(camp); }   // its name binds nothing of theirs any more; their other character may now be in play
    if (maps.length && window.wpHistBarrier) window.wpHistBarrier(maps);   // an undo never brings its tokens back
    save(true);
    if (n && n.active && n.role === 'host') { if (n.pushItems && maps.length) n.pushItems(maps); n.syncCharGone(id); if (n.charReview) n.charReview(pid, id, c.name, 'removed', note); }
    if (n && n.logEvent) n.logEvent('char', 'Removed ' + c.name + ' (made by ' + (playerNames(camp)[pid] || 'a player') + ') and its tokens');
    if (pid && n && n.allowWaiting) n.allowWaiting(pid);
    if (pid && n && n.reconcilePresence) n.reconcilePresence(pid, { near: spot });   // a waiting token where it stood (or their other character's token)
    if (sheetOpen === id) closeSheet();
    closeHud(id);
    if (window.appRender) window.appRender();
    return true;
}
/* ---------- Onboarding F2a: take a sheet away — a character file (.wpchar.json) and a readable page (.md) ---------- */
// What a download holds (sheetexport.js writes it): a player — their own whole copy as their sheet shows it; the GM — the players' view of any
// character (the owner's projection, as the host sends it; an NPC or an unassigned one too), or with "Include GM-only fields" their full copy
function fxLibOf(sys) { var lib = {}; (sys && Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (d && typeof d.id === 'string' && /^e_[A-Za-z0-9_]{1,24}$/.test(d.id)) lib[d.id] = d; }); return lib; }   // net.js fxLib, alike
function itemLibOf(sys) { var lib = {}; (sys && Array.isArray(sys.items) ? sys.items : []).forEach(function(d) { if (d && typeof d.id === 'string' && /^i_[A-Za-z0-9_]{1,24}$/.test(d.id)) lib[d.id] = d; }); var L = window.wpLibrary; return L && typeof L.size === 'function' && L.size() > 0 ? function(id) { return Object.prototype.hasOwnProperty.call(lib, id) ? lib[id] : (L.entryFor || L.entry)(id); } : lib; }   // net.js itemLib, alike (a GM-only pack's entry reads GM-only: owed review F4c3#2)
function exportView(charId, gmAll) {
    var camp = getActiveCampaign(), c0 = camp ? charById(charId, camp) : null; if (!camp || !c0 || c0.partial || !canOpen(c0.id)) return null;
    var sys = null, view = null, gm = false;
    if (isClient()) { sys = playerSystem(camp); view = sys ? cleanChar(c0, sys) : null; }   // their own copy (a client holds no other whole one)
    else if (gmAll === true) { sys = F() ? cleanSystem(camp.system, { F: F(), gmView: true }) : null; view = sys ? cleanChar(c0, sys) : null; gm = true; }
    else { sys = playerSystem(camp); view = sys ? charForView(c0, sys, { lib: fxLibOf(camp.system), items: itemLibOf(camp.system), full: camp.system }) : null; }
    if (!sys || !view) return null;
    var readTok = !!(gm || isClient() || (c0.ownerId && !c0.npc)), tctx = readTok ? tokenCtxFor(c0.id, camp) : null;   // the players' view of an NPC or an unassigned character reads no token (the GM's pick could be a hidden one)
    return { camp: camp, sys: sys, view: view, gm: gm, tctx: tctx, noToken: !readTok, npc: !!c0.npc, ownerId: c0.ownerId || '', all: resolveAll(sys, view, F(), tctx) };   // the numbers on that same view: nothing worked out from what it hides
}
function saveTextFile(name, text, type) {   // the anchor download every export uses (a save dialog in the app)
    try { var url = URL.createObjectURL(new Blob([text], { type: type })), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function() { URL.revokeObjectURL(url); }, 1000); return true; }
    catch (e) { toast('The file could not be saved here.'); return false; }
}
// The portrait for the file: a square of at most 256 pixels (a JPEG when a PNG runs past 200,000 characters); '' when there is none, or a
// player's copy of it has not arrived within four seconds
function pictureData(path) {
    return new Promise(function(res) {
        var done = false, finish = function(v) { if (!done) { done = true; res(typeof v === 'string' ? v : ''); } };
        if (typeof path !== 'string' || !path) { finish(''); return; }
        setTimeout(function() { finish(''); }, 4000);
        var draw = function(src) {
            var im = new Image();
            im.onload = function() {
                try {
                    var w = im.naturalWidth, h = im.naturalHeight; if (!(w > 1 && h > 1) || w > 4096 || h > 4096) { finish(''); return; }
                    var s = Math.min(w, h), side = Math.min(256, s), cv = document.createElement('canvas'); cv.width = side; cv.height = side;
                    cv.getContext('2d').drawImage(im, Math.floor((w - s) / 2), Math.floor((h - s) / 2), s, s, 0, 0, side, side);
                    var d = cv.toDataURL('image/png'); if (d.length > 200000) d = cv.toDataURL('image/jpeg', 0.85);
                    finish(d.length <= 200000 ? d : '');
                } catch (e) { finish(''); }
            };
            im.onerror = function() { finish(''); };
            im.src = src;
        };
        var n = net(), ph = n ? n.ASSET_PLACEHOLDER : null, src = imgSrc(path);
        if (ph && src === ph) {   // a player's copy of the picture is still on its way (a refused one never comes: the timeout)
            var onA = function(ev) { if (ev && ev.detail && ev.detail.path === path) { document.removeEventListener('wp-asset', onA); draw(imgSrc(path)); } };
            document.addEventListener('wp-asset', onA); setTimeout(function() { document.removeEventListener('wp-asset', onA); }, 4000);
            return;
        }
        if (src) draw(src); else finish('');
    });
}
function downloadChar(charId, kind, gmAll) {
    var X = exportView(charId, gmAll); if (!X) { toast('This sheet cannot be downloaded here.'); return; }
    var base = fileBase(X.view.name) + (X.gm ? '-gm' : '');
    if (kind === 'md') {
        var md = sheetToMarkdown(X.sys, X.view, X.all, { F: F(), gm: X.gm, sub: String(X.sys.name || ''), tctx: X.tctx, pageTitle: function(id) { var r = pageRef(id); return r && (X.gm || !r.gmOnly) ? r.title : null; } });
        if (saveTextFile(base + '.md', md, 'text/markdown')) toast('Saved ' + base + '.md');
        return;
    }
    pictureData(X.view.portrait).then(function(pic) {
        var j = charToJson(X.sys, X.view, X.all, { exported: new Date().toISOString(), gm: X.gm, picture: pic });
        if (saveTextFile(base + '.wpchar.json', JSON.stringify(j, null, 1), 'application/json')) toast('Saved ' + base + '.wpchar.json');
    });
}
// Onboarding F2b (D7 = (c), print exactly as on screen): the sheet as the panel draws it — its look, palette and background picture (on every
// page), the header, the dashboard and the band, then every tab in turn under its heading, every section open, notes and long text in full,
// a list's notes rows shown — through the print dialog (a PDF printer saves it). The same view as the files: a player's own; the GM's players'
// view of any character, or ticked their own copy. Built off screen in #sheetPrint (shown only while printing), gone after.
function printify(root) {   // a box keeps only what fits in it on paper: text and notes boxes become their text; rows the sheet folds away are shown
    Array.prototype.forEach.call(root.querySelectorAll('textarea'), function(t) { t.replaceWith(el('div', (t.className || '') + ' sheet-print-text', t.value)); });
    Array.prototype.forEach.call(root.querySelectorAll('input[type="text"], input:not([type])'), function(i) { i.replaceWith(el('span', (i.className || '') + ' sheet-print-text', i.value)); });
    Array.prototype.forEach.call(root.querySelectorAll('.sheet-item-noteline, tr.sheet-itemtable-notes'), function(n) { n.style.display = ''; });
    Array.prototype.forEach.call(root.querySelectorAll('.sheet-fx .sheet-fx-name[title]'), function(n) { var row = n.closest('.sheet-fx'); if (row && n.title) row.appendChild(el('div', 'sheet-print-note', n.title)); });   // an effect's notes: a tooltip on screen, a line on paper
}
function printSheet(charId, gmAll) {
    var X = exportView(charId, gmAll); if (!X) { toast('This sheet cannot be printed here.'); return; }
    var old = ui('sheetPrint'); if (old) old.remove();
    var look = (X.sys.sheet && X.sys.sheet.look) || {}, panel = ui('sheetPanel'), pw = panel && panel.offsetWidth ? panel.offsetWidth : 680;
    var pr = el('div'); pr.id = 'sheetPrint'; pr.style.width = Math.max(360, Math.min(900, pw)) + 'px';   // the panel's own width (the page shrinks it to fit)
    var bg = el('div', 'sheet-print-bg'), head = el('div', 'sheet-print-head'), body = el('div', 'sheet-print-body'); body.id = 'sheetPrintBody';
    var pim = null; if (X.view.portrait && !look.portrait) { pim = el('img'); pim.alt = ''; pim.src = imgSrc(X.view.portrait); head.appendChild(pim); }   // the head's own portrait carries it otherwise
    var tt = el('div', 'sheet-print-titles'); if (!look.portrait) tt.appendChild(el('div', 'sheet-print-name', X.view.name || 'Character'));   // the header block carries the name when the look puts the portrait there (as the panel's title bar steps aside)
    var sub = [X.gm ? 'The GM\u2019s copy' : '', X.npc ? 'NPC' : X.ownerId ? ownerName({ id: X.view.id, ownerId: X.ownerId }, X.camp) : 'unassigned', X.sys.name || ''].filter(Boolean).join(' \u00b7 '); if (sub) tt.appendChild(el('div', 'sheet-print-sub', sub));   // as the title bar says it (the stored character's, not the view's)
    head.appendChild(tt); pr.appendChild(bg); if (pim || tt.childNodes.length) pr.appendChild(head); pr.appendChild(body); pr.inert = true; pr.setAttribute('aria-hidden', 'true'); document.body.appendChild(pr);   // laid out off screen (its pictures and glyphs load), never focused
    var wasLive = _fxLive; _fxLive = false; window.wpPrintCopy = true;   // inert (no pickers, forms or live dials), yet what the live sheet shows is drawn (a row's rolls, Apply at full strength)
    try { buildSections(body, X.sys, X.view, X.all, X.gm, !X.gm, function() {}, { campId: X.camp.id, view: 'sheet', preview: false, print: true, noToken: X.noToken }); }
    finally { _fxLive = wasLive; window.wpPrintCopy = false; }
    printify(body);
    applyPaletteTo(pr, look); applySheetLookTo(pr, sheetLook(X.camp, X.sys));
    bg.style.backgroundImage = pr.style.backgroundImage; bg.style.backgroundColor = pr.style.backgroundColor;   // the picture on a layer each printed page repeats (cover on the whole sheet would stretch it over every page)
    if (pr.dataset.bgpath) { bg.dataset.bgpath = pr.dataset.bgpath; bg.dataset.bgdim = pr.dataset.bgdim || ''; delete pr.dataset.bgpath; delete pr.dataset.bgdim; }   // a player's picture arriving late lands on the layer
    pr.style.backgroundImage = ''; pr.style.backgroundColor = 'transparent';
    var ims = Array.prototype.slice.call(pr.querySelectorAll('img')).map(function(im) { return im.complete ? null : new Promise(function(r) { im.addEventListener('load', r); im.addEventListener('error', r); }); }).filter(Boolean);
    var bgm = /url\(["']?([^"')]+)["']?\)/.exec(bg.style.backgroundImage || ''); if (bgm) ims.push(new Promise(function(r) { var bi = new Image(); bi.onload = r; bi.onerror = r; bi.src = bgm[1]; }));
    var glyphU = {}; Array.prototype.forEach.call(pr.querySelectorAll('.wp-glyph'), function(g) { var gm2 = /url\(["']?([^"')]+)["']?\)/.exec(g.style.maskImage || g.style.webkitMaskImage || ''); if (gm2) glyphU[gm2[1]] = 1; });   // glyphs on tabs never opened: fetched now, not first at print time
    Object.keys(glyphU).forEach(function(u) { ims.push(new Promise(function(r) { var gi = new Image(); gi.onload = r; gi.onerror = r; gi.src = u; })); });
    var nA = net(), phA = nA ? nA.ASSET_PLACEHOLDER : null;   // a player's copy of a picture still on its way: waited for, then drawn
    [X.view.portrait, bg.dataset.bgpath].forEach(function(p) {
        if (!phA || typeof p !== 'string' || !p || imgSrc(p) !== phA) return;
        ims.push(new Promise(function(r) { var onA = function(ev) { if (!ev || !ev.detail || ev.detail.path !== p) return; document.removeEventListener('wp-asset', onA); Array.prototype.forEach.call(pr.querySelectorAll('img'), function(im) { if (im.getAttribute('src') === phA) im.src = imgSrc(p); }); r(); }; document.addEventListener('wp-asset', onA); setTimeout(function() { document.removeEventListener('wp-asset', onA); r(); }, 3000); }));
    });
    if (document.fonts && document.fonts.ready) ims.push(document.fonts.ready);
    Promise.race([Promise.all(ims), new Promise(function(r) { setTimeout(r, 3000); })]).then(function() {   // the pictures and fonts in, or three seconds
        if (ui('sheetPrint') !== pr) return;   // another print started meanwhile
        var done = false, clean = function() { if (done) return; done = true; window.removeEventListener('afterprint', clean); document.documentElement.classList.remove('print-sheet'); document.body.classList.remove('print-sheet'); if (pr.parentNode) pr.remove(); };
        document.documentElement.classList.add('print-sheet'); document.body.classList.add('print-sheet');
        window.addEventListener('afterprint', clean);
        var nH = net(); if (nH && nH.holdPeers) nH.holdPeers(180000);   // the print dialog freezes this page: the table waits for it
        try { window.print(); } catch (e) {}
        clean();   // print() returns once its dialog is done (Chromium, Electron): nothing of the copy stays, whether afterprint fired or not (a later Save PDF would print it)
        if (nH && nH.heldDone) nH.heldDone();
    });
}
// [systemcheck:sbexport-start]
/* ---------- Export for ShadowBase: the way back to the website ---------- */
// The owner, 2026-10-04: "waypoint takes the shadowbase json and exports it in a way shadowbase can read it". The character's own ShadowBase
// file, picked here, with what the table changed written into a copy of it (systemcore sbWriteBack): the copy is a whole file the website's
// Import Character reads. Worked out on this machine from the viewer's own copy of the character (the GM's whole copy, a player's own);
// nothing is stored, sent or changed in the campaign. What a file holds reaches the page only as text nodes (sbExportBody).
// 85 (the owner, 2026-10-04: "i just need to be able to let them download their characters and save them to shadowbase easily"): the
// character's ShadowBase file is remembered once it has been read on this machine, by Import or by a pick here, so For ShadowBase needs no
// second pick. In memory only, until the app closes: never stored and never sent, since a file kept from another day could put old figures
// back on the website. By campaign and character, the newest SB_KEEP files
var _sbKept = Object.create(null), SB_KEEP = 8, SB_KEEP_MAX = 8 * 1024 * 1024;
function sbIsSheet(j) { return !!j && typeof j === 'object' && !Array.isArray(j) && !isCharFile(j) && (!j.type || j.type === 'character') && !!(j.name || j.attributes || j.points); }
function sbKeepKey(campId, charId) { return typeof campId === 'string' && campId && typeof charId === 'string' && charId ? campId + '|' + charId : ''; }
function sbKeep(campId, charId, text, name, at) {
    var k = sbKeepKey(campId, charId); if (!k || typeof text !== 'string' || !text || text.length > SB_KEEP_MAX) return false;
    delete _sbKept[k]; _sbKept[k] = { text: text, name: typeof name === 'string' ? name : '', at: typeof at === 'number' && isFinite(at) ? at : Date.now() };
    var ks = Object.keys(_sbKept); while (ks.length > SB_KEEP) delete _sbKept[ks.shift()];   // the one read longest ago goes first
    return true;
}
function sbKept(campId, charId) { var k = sbKeepKey(campId, charId); return k && _sbKept[k] ? _sbKept[k] : null; }
// how long ago a file was read, in plain words (worked out from the two times alone, so it reads the same on every machine)
function sbKeptAgo(at, now) {
    var m = Math.floor(((typeof now === 'number' ? now : Date.now()) - at) / 60000); if (!(m >= 1)) return 'just now';
    return m < 60 ? m + (m === 1 ? ' minute ago' : ' minutes ago') : m < 1440 ? Math.floor(m / 60) + (m < 120 ? ' hour ago' : ' hours ago') : 'more than a day ago';
}
function sbKeptName(name) { var s = String(name == null ? '' : name).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim(); return s ? (s.length > 48 ? s.slice(0, 48) + '\u2026' : s) : 'the file read here'; }
function sbExportPlan(charId, j) {   // { r, name } or { error: words }
    if (isCharFile(j)) return { error: 'That is a Waypoint character file. Pick the character\u2019s ShadowBase file (the website\u2019s Export JSON).' };
    var S = window.wpSystemCore, X = exportView(charId, !isClient()); if (!S || !S.sbWriteBack || !X) return { error: 'This sheet cannot be exported here.' };
    var c0 = charById(charId, X.camp), fl = tokenFlags(), t = c0 ? facingTarget(c0, X.camp) : null, tok = t ? {} : null;
    if (t && fl.posture) { var rawP = typeof t.tok.posture === 'string' ? t.tok.posture : '', atP = rawP && typeof S.postureAt === 'function' ? S.postureAt(X.sys, rawP) : null; tok.posture = atP && atP.p && typeof atP.p.id === 'string' ? atP.p.id : (rawP || 'standing'); }   // as the map and the sheet read it: one of the seven under an older spelling is that posture (the owed review, 2026-10-09)
    if (t && fl.elevation) { var st = stanceCtx(t.tok, fl); tok.elevation = st ? st.elevation : 0; }
    var r = S.sbWriteBack(j, X.sys, X.view, X.all, tok);
    if (!r || r.error) return { error: r && r.error === 'system' ? 'This campaign has no system to read the sheet by.' : 'That does not look like a ShadowBase character sheet (the website\u2019s Export JSON).' };
    return { r: r, name: typeof X.view.name === 'string' ? X.view.name : '' };
}
// the copy's text, laid out as the picked file was (its indent, its line ends, its closing line break), and the name it is saved under
function sbExportFile(text, name, json) {
    var src = typeof text === 'string' ? text : '', ind = /^\s*\{\r?\n([ \t]{1,8})"/.exec(src), crlf = /\r\n/.test(src), out = JSON.stringify(json, null, ind ? ind[1] : 0);
    if (crlf) out = out.replace(/\n/g, '\r\n');
    if (/\n$/.test(src)) out += crlf ? '\r\n' : '\n';
    var base = String(name == null ? '' : name).replace(/\.json$/i, '').replace(/[\u0000-\u001f\u007f\\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80).replace(/ ?\(from Waypoint\)$/, '').trim();
    return { text: out, name: (base || 'character') + ' (from Waypoint).json' };
}
function sbExportWords(v) { return typeof v === 'number' && isFinite(v) ? String(v) : typeof v === 'string' ? (v.length > 40 ? v.slice(0, 40) + '\u2026' : v) : typeof v === 'boolean' ? (v ? 'yes' : 'no') : v === null || v === undefined ? 'nothing' : 'something else'; }
function sbExportBody(r, sheetName, fileCharName, kept) {   // the question's list, as text nodes only; kept (85): the remembered file it was made from, said first
    var box = el('div', 'sb-export-list'), line = function(cls, t) { box.appendChild(el('div', cls, t)); }, cut = function(s) { s = String(s); return s.length > 60 ? s.slice(0, 60) + '\u2026' : s; };
    if (kept) line('sb-export-warn', 'From \u201c' + sbKeptName(kept.name) + '\u201d, read here ' + sbKeptAgo(kept.at) + '. If the character changed on the website since then, pick the newer file.');
    var nmS = String(sheetName || '').trim().toLowerCase(), nmF = typeof fileCharName === 'string' ? fileCharName.trim().toLowerCase() : '';   // a short name beside a full one ("Sahrhie", "Sahrhie Vosst") is the same character
    if (nmS && nmF && nmS.indexOf(nmF) < 0 && nmF.indexOf(nmS) < 0) line('sb-export-warn', 'The file is for \u201c' + cut(fileCharName.trim()) + '\u201d; this sheet is \u201c' + cut(sheetName || '') + '\u201d.');
    r.changes.forEach(function(c) { line('sb-export-row', cut(c.label) + ': ' + sbExportWords(c.from) + ' \u2192 ' + sbExportWords(c.to)); });
    if (r.same.length) line('sb-export-dim', 'Already the same: ' + r.same.map(cut).join(', ') + '.');
    if (r.left.length) line('sb-export-dim', 'Not written: ' + r.left.map(cut).join('; ') + '.');
    line('sb-export-dim', 'Everything else in the file stays as the website wrote it. Items, conditions, notes and character points are not carried: change those on the website.');
    return box;
}
// the copy made from one file's text and offered for saving; kept: the remembered file it came from, which the question then names
function sbExportRun(charId, txt, fileName, kept) {
    var j = null; try { j = JSON.parse(txt); } catch (e) { toast('That file is not valid JSON.'); return; }
    var P = sbExportPlan(charId, j); if (P.error) { toast(P.error); return; }
    if (!P.r.changes.length) { toast('Nothing to write: that file already holds what this sheet shows.'); return; }
    showConfirm('Write this session into a copy of that ShadowBase file?', function(yes) {
        if (!yes) return;
        var f = sbExportFile(txt, fileName, P.r.json);
        if (saveTextFile(f.name, f.text, 'application/json')) toast('Saved ' + f.name + '. On the website: Import Character.');
    }, { body: sbExportBody(P.r, P.name, typeof j.name === 'string' ? j.name : '', kept || null) });
}
function exportShadowBase(charId, useKept) {   // useKept (85): from the file remembered for this character, with no pick; none remembered: the pick, as ever
    var campK = getActiveCampaign(), kept = useKept === true ? sbKept(campK && campK.id, charId) : null;
    if (kept) { sbExportRun(charId, kept.text, kept.name, kept); return; }
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.addEventListener('change', function() {
        var file = inp.files && inp.files[0]; if (!file) return;
        if (file.size > 8 * 1024 * 1024) { toast('That file is too large.'); return; }
        file.text().then(function(txt) {
            var jP = null, campP = getActiveCampaign(); try { jP = JSON.parse(txt); } catch (e) { jP = null; }
            if (campP && sbIsSheet(jP)) sbKeep(campP.id, charId, txt, file.name);   // 85: a later For ShadowBase needs no pick
            sbExportRun(charId, txt, file.name, null);
        });
    });
    inp.click();
}
// [systemcheck:sbexport-end]
// The Download menu (the sheet's head ⤓): on the page, not in the panel (the panel clips what overflows it); Escape and a click elsewhere close it
var _dlPop = null, _dlGm = false;   // _dlGm: the GM's "Include GM-only fields", off each time the app starts
function closeDownloadMenu() { if (_dlPop) { _dlPop.remove(); _dlPop = null; document.removeEventListener('mousedown', dlOutside, true); document.removeEventListener('keydown', dlKey, true); } }
function dlOutside(e) { if (_dlPop && !_dlPop.contains(e.target) && !(_dlPop._anchor && _dlPop._anchor.contains(e.target))) closeDownloadMenu(); }
function dlKey(e) { if (_dlPop && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); var a = _dlPop._anchor; closeDownloadMenu(); try { if (a) a.focus(); } catch (er) {} } }
function openDownloadMenu(anchor) {
    if (_dlPop) { closeDownloadMenu(); return; }   // its button toggles it
    var c = sheetOpen ? charById(sheetOpen) : null; if (!c || c.partial || !canOpen(c.id)) return;
    var gm = !isClient(), cid = c.id, pop = el('div', 'sheet-dl-pop'); pop.setAttribute('role', 'menu'); pop._anchor = anchor;
    var item = function(label, sub, kind) { var b = el('button', 'sheet-dl-item'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.appendChild(el('span', 'sheet-dl-t', label)); b.appendChild(el('span', 'sheet-dl-s', sub)); b.addEventListener('click', function(e) { e.preventDefault(); closeDownloadMenu(); if (kind === 'print') printSheet(cid, gm && _dlGm); else if (kind === 'sb') exportShadowBase(cid); else if (kind === 'sbkept') exportShadowBase(cid, true); else downloadChar(cid, kind, gm && _dlGm); }); pop.appendChild(b); };
    item('Character file (.wpchar.json)', 'Every value on the sheet, to keep', 'json');
    item('Readable page (.md)', 'The sheet as text \u2014 it imports as a handbook page', 'md');
    item('Print or save as PDF\u2026', 'Exactly as it shows, every tab in turn', 'print');
    var campD = getActiveCampaign(), keptD = sbKept(campD && campD.id, cid);   // 85: the ShadowBase file read here for this character, if one was
    if (keptD) { item('For ShadowBase (.json)', 'From ' + sbKeptName(keptD.name) + ', read here ' + sbKeptAgo(keptD.at), 'sbkept'); item('For ShadowBase, from another file\u2026', 'Pick a newer export from the website', 'sb'); }
    else item('For ShadowBase (.json)\u2026', 'This session written into a copy of its ShadowBase file', 'sb');
    if (gm) { var lb = el('label', 'sheet-dl-gm'), cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = _dlGm; cb.addEventListener('change', function() { _dlGm = cb.checked; }); lb.appendChild(cb); lb.appendChild(document.createTextNode(' Include GM-only fields')); lb.title = 'Off: the sheet as its player sees it. On: your own copy, with every GM-only field and row (the file is named \u2026-gm)'; pop.appendChild(lb); }
    else pop.appendChild(el('div', 'sheet-dl-note', 'Your sheet as you see it.'));
    pop.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    pop.addEventListener('keydown', function(e) {   // its keys stay in it (on the page, arrows and Delete would act on the map's selection); the arrows move between its choices
        e.stopPropagation();
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        e.preventDefault(); var its = Array.prototype.slice.call(pop.querySelectorAll('.sheet-dl-item, .sheet-dl-gm input')), at = its.indexOf(document.activeElement), nx = its[(at + (e.key === 'ArrowDown' ? 1 : its.length - 1) + its.length) % its.length]; try { if (nx) nx.focus(); } catch (er) {}
    });
    document.body.appendChild(pop); _dlPop = pop;
    var r = anchor.getBoundingClientRect(); pop.style.left = Math.max(8, Math.min(window.innerWidth - 288, r.right - 280)) + 'px'; pop.style.top = Math.max(8, Math.min(window.innerHeight - (keptD ? 284 : 232), r.bottom + 6)) + 'px';
    document.addEventListener('mousedown', dlOutside, true); document.addEventListener('keydown', dlKey, true);   // Escape here first: the panel's own Escape closes the sheet
    var first = pop.querySelector('.sheet-dl-item'); try { if (first) first.focus(); } catch (er) {}
}
/* ---------- Stage 6 U3: a player's sheet upload — their Import JSON, the GM's review ---------- */
function uploadsOf(camp, charId) { return cleanUploads(camp && camp.uploads).filter(function(u) { return !charId || u.charId === charId; }); }
// Onboarding F4: whether this table lets a player start a character from a file (the rules the host sent)
function fillOk() { var camp = getActiveCampaign(), S = window.wpSystemCore; if (!camp || !S || !S.newCharRules) return false; return !!S.newCharRules(camp, !window.wpVtt || !window.wpVtt.rulesOn || window.wpVtt.rulesOn('sheets') !== false).fromFile; }
// [sinkcheck:fillnote-start]
// Onboarding F4: what came of a fill, in words — the host's counts, and what this campaign has no place for (worked out here, on this player's
// own view: the file's own labels, as text)
function fillNote(a, j) {
    var camp = getActiveCampaign(), view = camp && camp.system ? camp.system : null, miss = [];
    try { if (view && isCharFile(j)) miss = (charFromJson(view, j, null) || { unmatched: [] }).unmatched; else if (view && window.wpSystemCore && window.wpSystemCore.sbFill) miss = window.wpSystemCore.sbFill(j, view, F(), null).skipped; } catch (e) { miss = []; }
    var cut = miss.filter(function(s) { return /^amputated: /.test(s); }).map(function(s) { return s.slice(11); }); miss = miss.filter(function(s) { return !/^amputated: /.test(s); });
    var nN = function(n2, w) { return n2 + ' ' + w + (n2 === 1 ? '' : 's'); }, few = function(l) { return l.slice(0, 6).join(', ') + (l.length > 6 ? ' and ' + (l.length - 6) + ' more' : ''); };
    return (a.auto ? nN(a.auto, 'part') + ' filled in' : 'Nothing could be filled in') + (a.left ? '; ' + nN(a.left, 'part') + ' could not be taken' : '') + (miss.length ? '; not in this campaign: ' + few(miss) : '') + (cut.length ? '; left out as amputated: ' + few(cut) : '') + '.';
}
// [sinkcheck:fillnote-end]
// [sinkcheck:filepic-start]
// Onboarding F4b: a file's own picture (a character file's picture, a ShadowBase sheet's portrait — a PNG, JPEG or WebP data URL, never a web address
// or an SVG) offered through the token creator and sent as the character's picture (char-pic: the host checks it whole again); else a character
// file's own face (never "photo": a photo is saved as a picture). Nothing without one
var FILE_PIC = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/;
function filePicture(id, j) {
    var n = net(); if (!n || !n.charPic || !j || typeof j !== 'object') return false;
    var said = function(a) { toast(a.error || 'Your character\u2019s picture is set.'); };
    var pic = typeof j.picture === 'string' ? j.picture : typeof j.portrait === 'string' ? j.portrait : '';
    if (pic && pic.length <= 12 * 1024 * 1024 && FILE_PIC.test(pic) && window.wpFrame && window.wpFrame.open) {
        var mt = /^data:(image\/[a-z]+);/.exec(pic)[1], raw = null;
        try { var bin = atob(pic.slice(pic.indexOf(',') + 1)), u8 = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i); raw = new Blob([u8], { type: mt }); } catch (e) { raw = null; }
        if (raw) return window.wpFrame.open(raw, { px: 256, as: 'data', max: 200000, title: 'Frame your character\u2019s picture' }, function(res) { var r = n.charPic(id, '', res.data, said); if (r && r.error) toast(r.error); }) !== false;
    }
    var fc = typeof j.face === 'string' && n.cleanFace ? n.cleanFace(j.face) : '';
    if (fc && fc !== 'photo') { var r2 = n.charPic(id, fc, '', said); if (r2 && r2.error) toast(r2.error); return true; }
    return false;
}
// [sinkcheck:filepic-end]
// Onboarding F4b: start a character from a file (the join card): the file read here first (a character file or a ShadowBase sheet — a bad one never
// makes a character), a name (the file's to start with), the character made (char-make) and filled (char-upload); a refused fill leaves an empty
// one in the making that Import can fill later; its picture offered through the token creator
function startFromFile() {
    var n = net(); if (!isClient() || !n || !n.charMake || !n.charUpload) return;
    if (!fillOk()) { toast('Starting a character from a file is not open at this table.'); return; }
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.addEventListener('change', function() {
        var file = inp.files && inp.files[0]; if (!file) return;
        if (file.size > 8 * 1024 * 1024) { toast('That file is too large.'); return; }
        file.text().then(function(txt) {
            var j = null; try { j = JSON.parse(txt); } catch (e) { toast('That file is not valid JSON.'); return; }
            var isFile = isCharFile(j), isSb = !isFile && !!j && typeof j === 'object' && !Array.isArray(j) && (!j.type || j.type === 'character') && !!(j.name || j.attributes || j.points);
            if (!isFile && !isSb) { toast('That is neither a character file nor a ShadowBase character.'); return; }
            var prof = n.getProfile ? n.getProfile() : {}, nm0 = typeof j.name === 'string' && j.name.trim() ? j.name.trim().slice(0, 60) : ((prof && typeof prof.name === 'string' && prof.name) || '');
            showPrompt('A name for your character', nm0, function(nm) {
                if (nm === null || nm === undefined || !String(nm).trim()) return;
                var r = n.charMake(String(nm), function(a) {
                    if (a.error) { toast(a.error); return; }
                    if (!a.charId) return;
                    var id = a.charId; openSheet(id);
                    if (isSb && typeof sbKeep === 'function' && typeof getActiveCampaign === 'function') { var campS = getActiveCampaign(); if (campS) sbKeep(campS.id, id, txt, file.name); }   // 85: For ShadowBase then needs no pick
                    var rU = n.charUpload(id, j, function(b) { if (b.error) { toast(b.error + ' Your character is made: Import on its sheet can fill it later.'); return; } toast(fillNote(b, j)); filePicture(id, j); });
                    if (rU && rU.error) toast(rU.error + ' Your character is made: Import on its sheet can fill it later.');
                });
                if (r && r.error) toast(r.error);
            });
        });
    });
    inp.click();
}
// The GM's own Import, on any character's sheet (an NPC's too): the ShadowBase file is read on this machine and what it would change opens in
// the Review a player's upload opens, so nothing changes until Apply. It is never queued and nobody is told.
// [systemcheck:gmimport-start]
function gmImportRead(c, j) {   // { error } or { up }: the record the Review reads
    var camp = getActiveCampaign(), sys = systemOf(camp), SCo = window.wpSystemCore;
    if (isClient() || !canWrite()) return { error: 'Only the GM imports a file here.' };
    if (!c || !sys || !F() || !SCo || !SCo.sbProposal) return { error: 'The campaign has no system yet. Press the campaign\'s name in the top row, then System, to make one.' };
    if (isCharFile(j)) return { error: 'That is a Waypoint character file: it fills a character a player is still making. Import here reads a ShadowBase character JSON.' };
    if (!j || typeof j !== 'object' || Array.isArray(j) || (j.type && j.type !== 'character') || (!j.name && !j.attributes && !j.points)) return { error: 'That does not look like a ShadowBase character JSON.' };
    var pr = SCo.sbProposal(sys, c, j, F(), sbFinder(camp, sys));
    if (!pr || !Array.isArray(pr.changes) || !pr.changes.length) return { error: 'Nothing to change: the sheet already matches that file.' };
    return { up: { id: 'up_gm' + Date.now().toString(36), charId: c.id, from: '', name: 'Your file', at: Date.now(), changes: pr.changes, own: true } };
}
// [systemcheck:gmimport-end]
function gmImportJson(c) {
    var id = c.id, inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.addEventListener('change', function() {
        var file = inp.files && inp.files[0]; if (!file) return;
        if (file.size > 8 * 1024 * 1024) { toast('That file is too large.'); return; }
        file.text().then(function(txt) {
            var j = null; try { j = JSON.parse(txt); } catch (e) { toast('That file is not valid JSON.'); return; }
            var campG = typeof sbKeep === 'function' && typeof sbIsSheet === 'function' ? getActiveCampaign() : null; if (campG && charById(id) && sbIsSheet(j)) sbKeep(campG.id, id, txt, file.name);   // 85: For ShadowBase then needs no pick (kept whatever the review comes to)
            var cNow = charById(id), r = cNow ? gmImportRead(cNow, j) : { error: 'That character is no longer here.' };
            if (r.error) { toast(r.error); return; }
            openReview(id, r.up);
        });
    });
    inp.click();
}
function importJson() {   // the owner sends their sheet file to the GM (the GM approves what changes); Onboarding F4: while they are making it, the file fills it at once
    var c = sheetOpen ? charById(sheetOpen) : null; if (!c) return;
    if (!isClient()) { gmImportJson(c); return; }   // the GM's own Import: read and reviewed on this machine
    if (c.partial || c.ownerId !== myId()) return;
    var making = c.making === 1, id = c.id, nm = c.name;
    if (making && !fillOk()) { toast('Starting a character from a file is not open at this table.'); return; }
    var inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
    inp.addEventListener('change', function() {
        var file = inp.files && inp.files[0]; if (!file) return;
        if (file.size > 8 * 1024 * 1024) { toast('That file is too large.'); return; }
        file.text().then(function(txt) {
            var j = null; try { j = JSON.parse(txt); } catch (e) { toast('That file is not valid JSON.'); return; }
            var isFile = isCharFile(j);
            if (isFile && !making) { toast('A character file only fills a character you are still making.'); return; }   // Onboarding F2a: never sent as a dossier (owner, 2026-09-27: in play, Import stays as it was)
            if (!isFile && (!j || typeof j !== 'object' || Array.isArray(j) || (j.type && j.type !== 'character') || (!j.name && !j.attributes && !j.points))) { toast(making ? 'That is neither a character file nor a ShadowBase character.' : 'That does not look like a ShadowBase character JSON.'); return; }
            var n = net(); if (!n || !n.charUpload) return;
            if (!isFile && typeof sbKeep === 'function') { var campI = getActiveCampaign(); if (campI) sbKeep(campI.id, id, txt, file.name); }   // 85: For ShadowBase then needs no pick
            if (making) {
                showConfirm('Fill ' + nm + ' from this file? What it carries replaces what the sheet has.', function(y) {
                    if (!y) return;
                    var rM = n.charUpload(id, j, function(a) { toast(a.error || fillNote(a, j)); if (!a.error) filePicture(id, j); });   // F4b: its picture too, framed
                    if (rM && rM.error) toast(rM.error); else toast('Sending the file to your GM\u2026');
                });
                return;
            }
            var r = n.charUpload(c.id, j, function(a) {
                if (a.error) { toast(a.error); return; }
                toast(a.n ? 'Sent to the GM: ' + a.n + (a.n === 1 ? ' change' : ' changes') + ' to review' + (a.auto ? ' (' + a.auto + ' applied at once)' : '') + '.' : a.auto ? a.auto + (a.auto === 1 ? ' change' : ' changes') + ' applied.' : 'Nothing to change: your sheet already matches.');
            });
            if (r && r.error) toast(r.error); else toast('Sending your sheet to the GM\u2026');
        });
    });
    inp.click();
}
var _review = null;   // { upId }
function closeReview() { var m = ui('uploadModal'); if (m) m.style.display = 'none'; _review = null; renderReviewChip(); }
// [sinkcheck:uploadreview-start]
function openReview(charId, mine) {   // mine: the GM's own file, read on this machine (gmImportRead): never queued, nobody told
    var camp = getActiveCampaign(), up = mine && mine.own === true && mine.charId === charId ? mine : uploadsOf(camp, charId)[0], m = ui('uploadModal'); if (!up || !m || isClient()) return;
    var c = charById(up.charId, camp); if (!c) return;
    _review = { upId: up.id }; var ticks = {};
    up.changes.forEach(function(ch) { ticks[ch.id] = ch.accept === true; });
    var head = ui('uploadHead'), list = ui('uploadList'); head.textContent = (up.own === true ? 'Your file for ' : up.name + '\u2019s sheet update for ') + c.name + ' \u2014 ' + up.changes.length + (up.changes.length === 1 ? ' change' : ' changes');
    list.textContent = '';
    var KIND = { value: 'Value', add: 'New row', fact: 'Row', stat: 'Its own values', def: 'Its numbers', remove: 'Not in the file' };
    up.changes.forEach(function(ch) {
        var row = el('label', 'upl-row' + (ch.kind === 'remove' ? ' upl-remove' : '') + (ch.held ? ' upl-held' : ''));
        var box = el('input'); box.type = 'checkbox'; box.checked = ticks[ch.id]; box.addEventListener('change', function() { ticks[ch.id] = box.checked; count(); });
        row.appendChild(box);
        row.appendChild(el('span', 'upl-kind', KIND[ch.kind] || ch.kind));
        row.appendChild(el('span', 'upl-label', ch.label));
        row.appendChild(el('span', 'upl-from', ch.from || ''));
        row.appendChild(el('span', 'upl-arrow', '\u2192'));
        row.appendChild(el('span', 'upl-to', ch.to || ''));
        if (ch.held) row.appendChild(el('span', 'upl-note', 'you set this'));
        list.appendChild(row);
    });
    var apply = ui('uploadApply'), rej = ui('uploadReject');
    var count = function() { var n = Object.keys(ticks).filter(function(k) { return ticks[k]; }).length; apply.textContent = 'Apply ' + n + (n === 1 ? ' change' : ' changes'); apply.disabled = !n; };
    count();
    apply.onclick = function() {
        var cmp = getActiveCampaign(), sys = systemOf(cmp), ch2 = charById(up.charId, cmp); if (!sys || !ch2 || !F()) return;
        var acc = {}; Object.keys(ticks).forEach(function(k) { if (ticks[k]) acc[k] = true; });
        var r = sbApplyProposal(sys, ch2, up, acc, F());
        ch2.values = r.values; lastChange = null;   // the values are replaced whole: no single field to Revert
        cmp.uploads = (Array.isArray(cmp.uploads) ? cmp.uploads : []).filter(function(u) { return !u || u.id !== up.id; });
        afterCharChange(ch2, true);
        var n2 = net(); if (up.own !== true && n2 && n2.uploadDone) n2.uploadDone(up.charId, r.done, up.changes.length);
        toast(r.done + ' of ' + up.changes.length + ' changes applied to ' + ch2.name + (r.failed ? ' (' + r.failed + ' no longer applied)' : '') + '.');
        closeReview();
    };
    rej.onclick = function() {
        var cmp = getActiveCampaign(); cmp.uploads = (Array.isArray(cmp.uploads) ? cmp.uploads : []).filter(function(u) { return !u || u.id !== up.id; });
        save(true); var n2 = net(); if (up.own !== true && n2 && n2.uploadDone) n2.uploadDone(up.charId, 0, up.changes.length);
        toast('Kept ' + c.name + ' as it was.'); closeReview(); renderViews(c.id);
    };
    m.style.display = 'flex';
}
// [sinkcheck:uploadreview-end]
// [systemcheck:reviewchip-start]
// The header's Review button: there for as long as a player's sheet upload waits for the GM, whatever is open (the toast that tells of an
// upload fades). Its number is the uploads waiting; a press opens the oldest one's sheet and its Review. Never on a player's app.
function reviewWaiting() { var camp = getActiveCampaign(); return camp && canWrite() && !isClient() && featureOn() ? uploadsOf(camp, null).filter(function(u) { return !!charById(u.charId, camp); }) : []; }
function renderReviewChip() {
    var chip = ui('reviewChip'); if (!chip) return;
    var ups = reviewWaiting(), camp = getActiveCampaign();
    chip.style.display = ups.length ? '' : 'none';
    if (!ups.length) return;
    var nEl = ui('reviewChipN'); if (nEl) nEl.textContent = String(ups.length);
    chip.title = (ups.length === 1 ? 'A sheet update waits' : ups.length + ' sheet updates wait') + ' for your review: ' + ups.map(function(u) { var c = charById(u.charId, camp); return (c ? c.name : 'a character') + ' (' + u.changes.length + ')'; }).join(', ');
}
function reviewNext() { var up = reviewWaiting()[0]; if (!up) { renderReviewChip(); return; } openSheet(up.charId); openReview(up.charId); }
// [systemcheck:reviewchip-end]
function uploadsChanged(charId) { renderViews(typeof charId === 'string' ? charId : null); renderReviewChip(); }   // the Review button on its sheet, and the header's
// Stage 6 F7: the GM's own entries by name — the system's items, then the library's packs in their order (lower-case name -> entries)
function sbFinder(camp, sys) {
    var by = Object.create(null), add = function(e) { if (e && typeof e.name === 'string' && typeof e.id === 'string') { var k = e.name.trim().toLowerCase(); (by[k] = by[k] || []).push(e); } };
    (Array.isArray(sys.items) ? sys.items : []).forEach(add);
    var L = window.wpLibrary, packs = camp && camp.library && Array.isArray(camp.library.packs) ? camp.library.packs : [];
    if (L && L.entriesOf) packs.forEach(function(p) { (L.entriesOf(p.id) || []).forEach(function(e) { add(p && p.vis === 'gm' && e ? ((L.entryFor && L.entryFor(e.id)) || Object.assign({}, e, { vis: 'gm' })) : e); }); });   // F11b: a GM-only pack's entry as the GM-only copy the library hands out (the pack file keeps the entry's own vis)
    return function(name) { return by[String(name).trim().toLowerCase()] || []; };
}
// Onboarding F4: what a player may pick by name — the view's items (never a GM-only one) and the entries of the packs players may see, as players
// see them (the library's players' index, the GM's machine); lib: such an entry by id, the host's own copy (as char-item takes it)
// (worked out once: a fill looks up many names and ids). findKey: by an entry's key (a renamed library copy read back from a download)
function playerFinder(camp, view) {
    var by = Object.create(null), bk = Object.create(null), ids = Object.create(null);
    var add = function(e) { if (!e || typeof e.name !== 'string' || typeof e.id !== 'string' || e.vis === 'gm') return; var k = e.name.trim().toLowerCase(); (by[k] = by[k] || []).push(e); if (typeof e.key === 'string' && e.key) { var kk = e.key.trim().toLowerCase(); (bk[kk] = bk[kk] || []).push(e); } };
    (view && Array.isArray(view.items) ? view.items : []).forEach(add);
    var L = window.wpLibrary, packs = camp && camp.library && Array.isArray(camp.library.packs) ? camp.library.packs : [];
    if (L && L.playerIndexOf) packs.forEach(function(p) { var ix = p ? L.playerIndexOf(p.id, view) : null; if (ix && ix.byId) Object.keys(ix.byId).forEach(function(id) { ids[id] = 1; add(ix.byId[id]); }); });
    return { find: function(name) { return by[String(name).trim().toLowerCase()] || []; }, findKey: function(key) { return bk[String(key).trim().toLowerCase()] || []; },
        lib: L && L.entry ? function(id) { return typeof id === 'string' && ids[id] === 1 ? L.entry(id) : null; } : null };   // an entry of a pack players may see: the host's own copy
}
function fromShadowBase(w) {
    var camp = getActiveCampaign(), sys = systemOf(camp);
    if (!w || !w.sheet) return { error: 'No ShadowBase sheet on this token.' };
    if (!sys || !F()) return { error: 'The campaign has no system yet. Press the campaign\'s name in the top row, then System, to make one.' };
    var r = aliasFromShadowBase(w.sheet, sys, F()), ro = sbRowOps(w.sheet, sys, sbFinder(camp, sys));   // Stage 6 F7: its rows too
    if (!r.matched && !ro.rows) return { error: 'Nothing on the sheet matches the system\'s keys (ST or STR, DX or DEX, HT or CON, IQ or INT, HP, FP, Will, Per, Dodge, Parry, skills by name).' };
    var c = w.charId ? charById(w.charId, camp) : null;
    if (!c) { c = newCharacter({ name: w.charName || w.name || w.sheet.name || 'Character' }); linkToken(w, c.id); }
    c.values = c.values || {}; Object.keys(r.values).forEach(function(k) { c.values[k] = r.values[k]; });
    ro.lists.forEach(function(fid) { c.values[fid] = (Array.isArray(c.values[fid]) ? c.values[fid] : []).filter(function(x) { return x && x.hid === 1; }); });   // a list the sheet fills is replaced (a kept curse, the GM's secret, stays)
    var rowsIn = 0, rowsOut = 0;
    ro.ops.forEach(function(o) { var a = applyRowOp(sys, c, o.f, o.q, F(), {}); var mk = o.q.op === 'add' || o.q.op === 'custom'; if (a.ok) { c.values[o.f] = a.value; if (mk) rowsIn++; } else if (mk) rowsOut++; });   // as the GM's own hand makes them
    afterCharChange(c, true);
    var nN = function(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }, left = ro.skipped.slice(); if (rowsOut) left.unshift(nN(rowsOut, 'row'));
    toast(nN(r.matched, 'value') + (rowsIn ? ' and ' + nN(rowsIn, 'row') : '') + ' copied into ' + c.name + '\'s sheet' + (left.length ? '; not carried over: ' + left.join(', ') + ' (no such list here).' : '.'));
    return { ok: true, charId: c.id, matched: r.matched, rows: rowsIn, missed: rowsOut, skipped: ro.skipped };
}
// net.js hooks: a character arrived, changed or went
function charChanged(id) {
    if (typeof window !== 'undefined' && window.wpFog && window.wpFog.sensesForget) window.wpFog.sensesForget();   // the fog's kept senses are read again from the sheet
    var lost = {};   // HUD frame (HF2a): one notice per character, however many of its views close
    if (sheetOpen && isClient() && (id === null || sheetOpen === id)) { var gone = charById(sheetOpen); if (gone && (gone.partial || gone.ownerId !== myId())) { var nmG = gone.name; lost[gone.id] = 1; closeSheet(); toast(nmG + ' is no longer your character.'); var nG = net(); if (nG && nG.dropPending) nG.dropPending(gone.id); } }
    if (isClient()) Object.keys(huds).forEach(function(hid) { if (id !== null && id !== undefined && hid !== id) return; var gh = charById(hid); if (gh && !gh.partial && gh.ownerId === myId()) return; closeHud(hid); if (!lost[hid]) { lost[hid] = 1; toast((gh ? gh.name : 'That character') + ' is no longer your character.'); var nH = net(); if (nH && nH.dropPending) nH.dropPending(hid); } });
    renderViews(id); if (window.appRender) window.appRender(); if (window.wpRenderPartyStrip) window.wpRenderPartyStrip(); if (window.wpDice && window.wpDice.syncChars) window.wpDice.syncChars(); }
// the token's owner select moved (inspector.js): the character follows, and every token of it
function ownerFromToken(w) {
    var camp = getActiveCampaign(), c = w && w.charId ? charById(w.charId, camp) : null; if (!c || c.npc) return;
    if (!c.ownerId && !w.ownerId) return;
    if (!w.ownerId) { var nT = net(); if (nT && nT.noWaiting && !playableChars(camp, c.ownerId).some(function(x) { return x.id !== c.id; })) nT.noWaiting(c.ownerId); }   // Onboarding F1a: "GM controlled" is a takeover: no waiting token pops up for a player it leaves with nothing
    giveCharacter(w.ownerId || '', c.id, { keep: w.id });   // a same-owner pick on a kept character's token makes it the one in play, with its token placed where they stand
}
function charGone(id) { var shown = false; if (sheetOpen === id) { closeSheet(); shown = true; } if (typeof id === 'string' && huds[id]) { closeHud(id); shown = true; } if (shown) toast('That character is no longer shared with you.'); if (window.appRender) window.appRender(); }
function editResult(rid, ok, reason, msg, op) { if (!ok) toast(reason === 'none' ? 'Nothing to apply.' : reason === 'error' ? (msg || 'That amount could not be worked out.') : op === 'apply' && reason === 'field' ? 'That action is not on your sheet now.' : op === 'apply' && reason === 'timeout' ? 'No answer from the GM.' : reason === 'budget' ? (msg || 'That would take the character over a point budget.') : reason === 'needs' ? (msg || 'Your character does not meet what that needs.') : reason === 'stays' ? (msg || (op === 'set' ? 'It stays on.' : 'You can\u2019t get rid of it.')) : reason === 'field' && op === 'custom' ? 'Only the GM changes that row now.' : reason === 'field' && op === 'ov' ? 'Only the GM changes this copy’s stats now.' : reason === 'off' ? 'Character sheets are off here.' : reason === 'owner' ? 'That sheet is not yours.' : reason === 'field' ? 'That field cannot be edited.' : reason === 'slow' ? 'Slow down a little.' : reason === 'missing' ? 'That is no longer there.' : reason === 'timeout' ? 'No answer from the GM; the change was undone.' : reason === 'making' ? 'Finish the character first (press Done on its sheet).' : reason === 'paused' ? 'The table is paused.' : 'That value was not accepted.'); renderViews(null); }

/* ---------- the editor: fields, rolls, characters ---------- */
var draft = null, dirty = false, tab = 'fields', errorsById = {}, warningsById = {}, layoutView = 'sheet';   // layoutView (HUD frame HF1): 'sheet' | 'hud'
var KIND_LABEL = { number: 'Number', formula: 'Formula', resource: 'Resource', skill: 'Skill', toggle: 'Toggle', text: 'Text', notes: 'Notes', select: 'Select', 'item-list': 'Item list', effects: 'Status effects' };
var KIND_HELP = { number: 'A stored number (an attribute): default, min, max, step. With a min and a max it can show as a slider on a two-colour track.', formula: 'Computed from other fields; never stored, never edited.', resource: 'A current value with a formula for its max (HP): a bar with - and + on the sheet.', skill: 'Stored ranks plus a base formula; its value is ranks + base.', toggle: 'On or off (a condition); true or false in formulas.', text: 'A short text (up to 200 characters); not a number for formulas.', notes: 'A long text; never read by formulas.', select: 'One of a fixed list of options.', 'item-list': 'A list of items the character carries, filled from the Items library on the sheet.', effects: 'The status effects the character carries: added from the Effects library in one click, or made on the spot with their own numbers. Each changes its numbers everywhere they are used.' };
function open(which) {
    if (!canWrite()) { toast('Not while you are at someone else\'s table.'); return; }
    var camp = getActiveCampaign(); if (!camp) return;
    draft = clone(systemOf(camp) || emptySystem());
    if (!Array.isArray(draft.fields)) draft.fields = []; if (!Array.isArray(draft.rolls)) draft.rolls = []; if (!draft.sheet || !Array.isArray(draft.sheet.sections)) draft.sheet = { sections: [] };
    if (!Array.isArray(draft.items)) draft.items = []; if (!draft.combat || typeof draft.combat !== 'object') draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' };
    dirty = false; tab = which || 'fields'; layoutView = 'sheet';
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
// Stage 6: each stored value of a field the saved system still has, checked against it again (a value past new value names, a lowered max,
// a removed library entry) — what a reload does, at once, so the GM's sheet, their formulas and every player agree. Other ids stay as they are.
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
function saveDraft() {
    if (!draft || !canWrite()) return;
    var camp = getActiveCampaign(); if (!camp) return;
    draft.name = (ui('sysName').value || '').trim().slice(0, LIMITS.name);
    var snD = draft.combat && draft.combat.senses && typeof draft.combat.senses === 'object' && Array.isArray(draft.combat.senses.list) ? draft.combat.senses : null, pendS = snD ? snD.list.filter(function(s) { return !!s && s.unit === '?'; }) : [], src = draft;   // senses S2a: a sense still waiting for its unit is left out (never a silent yards), and stays in the editor
    if (pendS.length) src = Object.assign({}, draft, { combat: Object.assign({}, draft.combat, { senses: Object.assign({}, snD, { list: snD.list.filter(function(s) { return !(s && s.unit === '?'); }) }) }) });
    var clean = cleanSystem(src, { F: F(), gmView: true });
    if (!clean) { toast('The system could not be saved.'); return; }
    var dropped = draft.fields.length - clean.fields.length;
    clean.updated = Date.now();
    var prevSys = camp.system, orphaned = orphanRows(prevSys, clean, camp.chars || {});   // Stage 6 F4a: a copy of a deleted entry keeps it (before the re-check drops unknown rows)
    camp.system = clean;
    reCleanChars(camp, clean);   // Stage 6: before the save and the sync (syncSystem re-sends every character after the system)
    stampRows(clean, camp.chars || {});   // Stage 6: a legacy row of a GM-only item gets its own id (its derived one would name the item)
    var reach = itemReach(prevSys, clean, camp.chars || {}), nR = net(); if (nR && nR.logEvent) reach.lines.forEach(function(l) { nR.logEvent('items', l); });   // Stage 6 F4c2: how far an edit to carried items reaches (after the re-check, so a removed stat's own values are gone), into the session log before the save
    if (window.wpLibrary && window.wpLibrary.refreshCore) { try { if (window.wpLibrary.refreshCore(camp, true)) clean = camp.system; } catch (e) { console.error(e); } }   // Stage 6 library L1d: the core its formulas now address (the draft below carries it); true: the editor's Save
    draft = clone(clean); dirty = false; var s = ui('sysSaveBtn'); if (s) s.classList.remove('on');
    if (pendS.length) { var dc = draft.combat || (draft.combat = {}), dsn = dc.senses && typeof dc.senses === 'object' ? dc.senses : (dc.senses = {}); dsn.list = (Array.isArray(dsn.list) ? dsn.list : []).concat(clone(pendS)); markDirty(); }
    save(true);
    var n = net(); if (n && n.syncSystem) n.syncSystem();
    if (n && n.active && n.role === 'host' && n.sensesMoved) n.sensesMoved(null);   // Senses S0: a formula or a default only the GM sees may feed Sight, and moves neither view of the system
    if (n && n.active && n.role === 'host' && n.syncChars && gmFacing(prevSys) !== gmFacing(clean)) n.syncChars();   // Stage 6 F4a: an edit to a GM-only item or effect changes what its owner holds inline (the players' view alone would not resend it)
    var v = validateSystem(clean, F());
    toast((reach.text ? reach.text + ' ' : '') + (orphaned ? orphaned + ' carried cop' + (orphaned === 1 ? 'y' : 'ies') + ' of deleted items kept. ' : '') + 'System saved: ' + clean.fields.length + ' field' + (clean.fields.length === 1 ? '' : 's') + ', ' + clean.rolls.length + ' roll' + (clean.rolls.length === 1 ? '' : 's') + (dropped ? '; ' + dropped + ' with a bad key or kind dropped' : '') + (v.ok ? '.' : '; ' + v.errors.length + ' error' + (v.errors.length === 1 ? '' : 's') + ' to fix.'));
    renderAll(); renderViews(null);
    if (window.appRender) window.appRender();   // the board and the Properties panel read the system too (a light's presets, the light names): drawn afresh from what was saved
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
    (draft.items || []).forEach(function(it) { if (it && it.key && !cleanItemKey(String(it.key), F())) (errorsById[it.id] = errorsById[it.id] || []).push({ prop: 'key', message: 'Not a usable key: a letter, then letters, digits and _ (up to 40); not a word formulas already use (count, qty, on, has, lvl, paid, row; max, cur, ranks, base; a function or reserved word such as floor, and, true; constructor). Save drops it.' }); });   // Stage 6 F4b
    // Stage 6 F4c1: each list's stats as Save will read them (a key it drops, a repeat, past the cap, a price naming none, another list's spelling),
    // under the list's card; and what Save drops when a saved stat is renamed or removed (a stat's key is its identity)
    var capS = LIMITS.listStats, firstSp = Object.create(null), keptAll = Object.create(null), keptBy = Object.create(null), firstDef = Object.create(null);
    draft.fields.forEach(function(f) {
        if (!f || f.kind !== 'item-list') return;
        var sp = f.list && typeof f.list === 'object' ? f.list : {}, st = Array.isArray(sp.stats) ? sp.stats : [], errs = [], mine = Object.create(null), n = 0, nm = f.label || f.key || 'another list';
        st.forEach(function(s, i) {
            var k = s && typeof s === 'object' && typeof s.key === 'string' ? s.key : '';
            if (!k.trim()) { errs.push({ message: 'Stat ' + (i + 1) + ' needs a key: Save drops it.' }); return; }
            if (!statKey(k, F())) { errs.push({ message: 'Stat key "' + k + '" is not usable: a letter, then letters, digits and _ (up to 24, no spaces); not a word formulas already use (count, qty, on, has, lvl, paid, row; max, cur, ranks, base; a function or reserved word such as floor, and, true; constructor, toString). Save drops it.' }); return; }
            var l = k.toLowerCase(); if (mine[l]) { errs.push({ message: 'Stat key "' + k + '" repeats "' + mine[l] + '" (keys ignore case): Save keeps the first.' }); return; }
            mine[l] = k; if (++n > capS) return;
            if (typeof s.def === 'number' && isFinite(s.def) && Math.abs(s.def) > LIMITS.statAbs) errs.push({ message: 'Stat "' + k + '" has a default past ±1,000,000,000: Save drops it.' });
            keptAll[l] = 1; if (!firstDef[l]) firstDef[l] = s;
            if (!firstSp[l]) firstSp[l] = { key: k, list: nm }; else if (firstSp[l].key !== k) errs.push({ message: 'Stat "' + k + '" is spelled "' + firstSp[l].key + '" on ' + firstSp[l].list + ': Save uses that spelling here too (one key, one spelling).' });
        });
        if (n > capS) errs.push({ message: 'At most ' + capS + ' stats a list: Save keeps the first ' + capS + '.' });
        if (typeof sp.price === 'string' && sp.price && !mine[sp.price.toLowerCase()]) errs.push({ message: 'The price names no stat of this list: Save drops it.' });
        keptBy[f.id] = mine;
        if (errs.length) errorsById['list:' + f.id] = errs;
    });
    var camp0 = getActiveCampaign(), saved = systemOf(camp0), toldI = Object.create(null), hasKey = function(m, l) { return !!m && typeof m === 'object' && !Array.isArray(m) && Object.keys(m).some(function(k) { return k.toLowerCase() === l; }); };
    var valOf = function(m, l) { var out; if (m && typeof m === 'object' && !Array.isArray(m)) Object.keys(m).forEach(function(k) { if (k.toLowerCase() === l) out = m[k]; }); return out; };
    var misfits = function(ds, v) { return v !== undefined && v !== null && (ds.kind === 'pick' ? !(typeof v === 'string' && (Array.isArray(ds.opts) ? ds.opts : []).some(function(o) { return o && typeof o.label === 'string' && o.label.toLowerCase() === v.trim().toLowerCase(); })) : typeof v !== 'number'); };
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
    // F4c1 review: what Save drops of an item's stats with no word otherwise — a value past ±1e9, and past 16 an item (the first come are kept)
    var cleanById = Object.create(null); (clean.items || []).forEach(function(ci) { if (ci && ci.id) cleanById[ci.id] = ci; });
    (draft.items || []).forEach(function(it) {
        var ci = it && cleanById[it.id]; if (!ci || !it.stats || typeof it.stats !== 'object' || Array.isArray(it.stats)) return;
        var keptL = Object.create(null), big = [], over = [], mis = [];
        Object.keys(ci.stats || {}).forEach(function(k) { keptL[k.toLowerCase()] = 1; });
        Object.keys(it.stats).forEach(function(k) { var sv = it.stats[k], l = k.toLowerCase(); if (!keptAll[l] || keptL[l]) return; if (firstDef[l] && misfits(firstDef[l], sv)) { mis.push([k, firstDef[l], sv]); return; } if (typeof sv !== 'number' || !isFinite(sv)) return; if (Math.abs(sv) > LIMITS.statAbs) big.push(k); else over.push(k); });   // owed review F5a2#6: a value its stat no longer takes is said as that, never as past 16
        mis.forEach(function(x) { (errorsById[it.id] = errorsById[it.id] || []).push({ prop: 'stats', message: x[1].kind === 'pick' ? (typeof x[2] === 'string' ? '\u201c' + x[0] + '\u201d has no option \u201c' + x[2] + '\u201d now: Save drops it.' : '\u201c' + x[0] + '\u201d is a choice now: Save drops its number.') : '\u201c' + x[0] + '\u201d is a number now: Save drops its choice.' }); });
        big.forEach(function(k) { (errorsById[it.id] = errorsById[it.id] || []).push({ prop: 'stats', message: '“' + k + '” is past ±1,000,000,000: Save drops it.' }); });
        if (over.length) (errorsById[it.id] = errorsById[it.id] || []).push({ prop: 'stats', message: 'At most ' + LIMITS.entryStats + ' stats an item: Save drops ' + over.map(function(k) { return '“' + k + '”'; }).join(', ') + ' (the first ' + LIMITS.entryStats + ' are kept; clear the ones it does not need).' });
    });
    var v = validateSystem(clean, F());
    v.errors.forEach(function(e) { var eid = e.prop === 'list' ? 'list:' + e.id : e.id; (errorsById[eid] = errorsById[eid] || []).push(e); });   // F4c1: a list's own messages sit under its card in Lists
    v.warnings.forEach(function(w) { var wid = w.prop === 'list' ? 'list:' + w.id : w.id; (warningsById[wid] = warningsById[wid] || []).push(w); });
    var tnE = draft.combat && draft.combat.turn && typeof draft.combat.turn === 'object' ? draft.combat.turn : null, tErr = [];   // turn-based combat T1: what Save drops from the turn rules, under the Combat card
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
    var ltE = draft.combat && draft.combat.light && typeof draft.combat.light === 'object' ? draft.combat.light : null, lErr = [], lKept = 0;   // lighting L4: what Save drops from the light rules, under the Combat card's Light box — read as the cleaner reads (systemcore cleanLightRules): a name is what is left of it without control characters, a number is finite and no larger than the wire takes, the cap counts the presets kept
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
    // range penalties R1: what Save drops from the range rule, under the Combat card's Range box — read as the cleaner reads (systemcore
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
        else if (rfT.length > LIMITS.formula || /[\u0000-\u001f\u007f]/.test(rfT)) rErr.push({ message: 'Range: the formula is at most ' + LIMITS.formula + ' characters, on one line: Save drops the rule.' });
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
    if (rErr.length) errorsById.range = (errorsById.range || []).concat(rErr);
    // item 19 H2: what Save drops of the height modifier, said under the Height box — read as the cleaner reads it
    var hgE = draft.combat && draft.combat.height && typeof draft.combat.height === 'object' && !Array.isArray(draft.combat.height) ? draft.combat.height : null, hErr = [];
    var hbyE = !hgE ? '' : typeof hgE.formula === 'string' ? 'formula' : Array.isArray(hgE.steps) ? 'table' : '';
    if (hbyE === 'formula') {
        var hfT = typeof hgE.formula === 'string' ? hgE.formula.trim() : '', hfP = hfT && F() ? F().parse(hfT) : null, hfN = hfP && hfP.ok && Array.isArray(hfP.names) ? hfP.names.filter(function(n) { return String(n).toLowerCase() !== 'heightdiff'; }) : [];
        if (!hfT) hErr.push({ message: 'Height: type the formula (it reads HeightDiff), or Save drops it.' });
        else if (!hfP || !hfP.ok) hErr.push({ message: 'Height: ' + (hfP && hfP.error && hfP.error.message ? hfP.error.message : 'the formula cannot be read.') + ' Save drops it.' });
        else if (hfN.length) hErr.push({ message: 'Height: the formula reads only HeightDiff, not ' + hfN[0] + ': Save drops it.' });
        else if (rfDice(hfP.ast && hfP.ast.body)) hErr.push({ message: 'Height: the formula cannot roll dice: Save drops it.' });
        else if (hfT.length > LIMITS.formula || new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']').test(hfT)) hErr.push({ message: 'Height: the formula is at most ' + LIMITS.formula + ' characters, on one line: Save drops it.' });
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
        else if (hgE.eye > 100) hErr.push({ message: 'Standing height: at most 100 yards (91.44 metres), so Save keeps the nearest.' });
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
    }
    if (cErr.length) errorsById.calendar = cErr;
    // item 20 K5: what Save drops of a roll's clock rule, said under the roll (a unit the Combat card no longer has: it runs by nothing)
    var evUnits = Object.create(null); (draft.combat && draft.combat.turn && Array.isArray(draft.combat.turn.units) ? draft.combat.turn.units : []).forEach(function(u) { if (u && typeof u.key === 'string') evUnits[u.key.toLowerCase()] = 1; });
    (Array.isArray(draft.rolls) ? draft.rolls : []).forEach(function(r) {
        var ev = r && typeof r === 'object' && r.every && typeof r.every === 'object' && !Array.isArray(r.every) ? r.every : null, msg = ''; if (!ev) return;
        if (!(typeof ev.n === 'number' && isFinite(ev.n) && Math.floor(ev.n) === ev.n && ev.n >= 1 && ev.n <= 1000)) msg = 'By the clock: every 1 to 1000 (a whole number), or Save drops it.';
        else if (typeof ev.u !== 'string' || !ev.u) msg = 'By the clock: pick what it counts in, or Save drops it.';
        else if (['min', 'hour', 'day', 'week'].indexOf(ev.u) < 0 && evUnits[ev.u.toLowerCase()] !== 1) msg = 'By the clock: ' + ev.u + ' is no time unit of yours (the Combat card\u2019s Turns box), so it runs by nothing and players never see it.';
        if (msg) (errorsById[r.id] = Array.isArray(errorsById[r.id]) ? errorsById[r.id] : []).push({ message: msg });
    });
    // senses S2a: what Save drops or leaves out of the senses, under the Combat card's Senses box — read as the cleaner reads (systemcore
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
            else if (r.by !== 'field' && !(typeof r.n === 'number' && isFinite(r.n))) sErr.push({ message: nm + ' (' + s.name.trim() + ') needs its range: Save drops it.' });
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
    if (sErr.length) errorsById.senses = sErr;
    // conditions C4: what Save drops of an automatic effect's formula, under the effect's row — read as the cleaner reads it (systemcore
    // cleanEffectDef and the public rule: the owner's "Only public ones"); a token's name read there is 0, a warning
    var auFx = (draft.effects || []).filter(function(d) { return d && typeof d === 'object' && typeof d.id === 'string' && typeof d.auto === 'string' && d.auto.trim(); }), auSys = null, auTok = { posture: 1, elevation: 1, facing: 1, arc: 1, threats: 1, combatround: 1, rangemod: 1, targetdistance: 1 };
    auFx.forEach(function(d) {
        var t0 = d.auto.trim(), pa = F() ? F().parse(t0) : null, msg = null;
        if (d.vis === 'gm') msg = { message: 'Applies itself when: a GM-only effect cannot apply itself (its switching on would give it away): Save drops the formula.' };
        else if (t0.length > LIMITS.formula || new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']').test(t0)) msg = { message: 'Applies itself when: a formula is at most ' + LIMITS.formula + ' characters, on one line: Save drops it.' };
        else if (!pa || !pa.ok) msg = { message: 'Applies itself when: ' + (pa && pa.error && pa.error.message ? pa.error.message : 'the formula cannot be read.') + ' Save drops it.', prop: 'formula', pos: pa && pa.error ? pa.error.pos : undefined, len: pa && pa.error ? pa.error.len : undefined };
        else if (rfDice(pa.ast && pa.ast.body)) msg = { message: 'Applies itself when: the formula cannot roll dice: Save drops it.' };
        else {
            auSys = auSys || { fields: gmViewFields(draft, F()), items: draft.items, core: draft.core };
            var gmN = gmDerivedNames(auSys, F(), Array.isArray(pa.names) ? pa.names : []);
            if (gmN.length) msg = { message: 'Applies itself when: it reads ' + gmN[0] + ', which players cannot read (a GM-only value, or one worked out from one), so its switching on would give it away: Save drops the formula.' };
            else { var tokN = (Array.isArray(pa.names) ? pa.names : []).filter(function(n) { return typeof n === 'string' && auTok[n.toLowerCase().split('.')[0]] === 1 && !(draft.fields || []).some(function(f) { return f && typeof f.key === 'string' && f.key.toLowerCase() === n.toLowerCase().split('.')[0]; }); }); if (tokN.length) warningsById[d.id] = (warningsById[d.id] || []).concat([{ message: 'Applies itself when: ' + tokN[0] + ' reads 0 here: an automatic effect works from the character\u2019s own values, never a token\u2019s.' }]); }
        }
        if (msg) errorsById[d.id] = (errorsById[d.id] || []).concat([msg]);
    });
    // conditions C3: what Save drops or changes of the postures, under the Combat card's Postures box — read as systemcore cleanPostures reads
    var psE = draft.combat && Array.isArray(draft.combat.postures) ? draft.combat.postures : null, pErr = [], pKept = 0, pSeen = Object.create(null), kindsP = Object.create(null);
    if (psE && psE.length) {
        (draft.fields || []).forEach(function(f) { if (f && typeof f.id === 'string') kindsP[f.id] = f.kind; });
        psE.forEach(function(p, i) {
            if (!p || typeof p !== 'object') return;
            var nm = 'Posture ' + (i + 1), nmT = typeof p.name === 'string' ? p.name.slice(0, 256).replace(lCtl, ' ').trim() : '', lb = nmT ? ' (' + nmT + ')' : '';
            if (typeof p.id !== 'string' || pSeen[p.id] || !(/^p_[A-Za-z0-9_]{1,24}$/.test(p.id) || POSTURE_IDS.indexOf(p.id) >= 0)) { pErr.push({ message: nm + lb + ': its id is not one Save keeps, or another posture has it: Save drops it.' }); return; }
            if (pKept >= LIMITS.postures) { pErr.push({ message: nm + lb + ': at most ' + LIMITS.postures + ', so Save drops it.' }); return; }
            pSeen[p.id] = 1; pKept++;
            if (!nmT) pErr.push({ message: nm + ' has no name: Save calls it Posture.' });
            if (typeof p.tag === 'string' && Array.from(p.tag.replace(lCtl, ' ').trim()).length > LIMITS.postureTag) pErr.push({ message: nm + lb + ': a tag is at most ' + LIMITS.postureTag + ' characters, so Save cuts it.' });
            var mods = Array.isArray(p.mods) ? p.mods : [];
            if (pKept === 1) { if (p.small === true || mods.length) pErr.push({ message: nm + lb + ' is first, how a token stands with none set: Save drops its smaller-target tick and its changes.' }); return; }
            mods.forEach(function(m, mi) {
                var k = m && typeof m === 'object' && typeof m.f === 'string' ? kindsP[m.f] : '';
                var ok = !!k && (m.op === 'on' ? k === 'toggle' : m.op === 'add' && typeof m.v === 'number' && isFinite(m.v) && Math.abs(m.v) <= LIMITS.effectAmount && (m.part === 'max' ? k === 'resource' : (k === 'number' || k === 'skill' || k === 'formula')));
                if (mi >= LIMITS.effectMods) pErr.push({ message: nm + lb + ', change ' + (mi + 1) + ': at most ' + LIMITS.effectMods + ', so Save drops it.' });
                else if (!ok) pErr.push({ message: nm + lb + ', change ' + (mi + 1) + ': a field that is gone or changed kind, or an amount that is no number: Save drops it.' });
            });
        });
        if (pKept < 2) pErr.push({ message: 'A list of postures needs at least two: Save goes back to the seven.' });
    }
    if (pErr.length) errorsById.postures = pErr;
    // initiative O2: what Save drops of the tie steps, under the Initiative box — read as the cleaner reads them (a step that reads, of 300
    // characters at most, reading only what players can read)
    var irE = draft.combat && draft.combat.initiative && typeof draft.combat.initiative === 'object' && !Array.isArray(draft.combat.initiative) ? draft.combat.initiative : null, iErr = [], iSys = null;
    (irE && Array.isArray(irE.ties) ? irE.ties : []).slice(0, LIMITS.initTies).forEach(function(t, i) {
        if (typeof t !== 'string' || !t.trim()) return;
        var t0 = t.trim(), nm = 'Tie step ' + (i + 1), pa = F() ? F().parse(t0) : null;
        if (t0.length > LIMITS.formula || new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']').test(t0)) iErr.push({ message: nm + ': a formula is at most ' + LIMITS.formula + ' characters, on one line: Save drops it.' });
        else if (!pa || !pa.ok) iErr.push({ message: nm + ': ' + (pa && pa.error && pa.error.message ? pa.error.message : 'the formula cannot be read.') + ' Save drops it.' });
        else { iSys = iSys || { fields: gmViewFields(draft, F()), items: draft.items, core: draft.core }; var gmI = gmDerivedNames(iSys, F(), Array.isArray(pa.names) ? pa.names : []); if (gmI.length) iErr.push({ message: nm + ': it reads ' + gmI[0] + ', which players cannot read, and the order is public: Save drops it.' }); }
    });
    var sdE = irE && typeof irE.side === 'string' ? irE.side.trim() : '', paS = sdE && F() ? F().parse(sdE) : null;   // initiative O4: the sides' roll, read as the cleaner reads it
    if (sdE && (sdE.length > LIMITS.formula || new RegExp('[' + String.fromCharCode(0) + '-' + String.fromCharCode(31) + String.fromCharCode(127) + ']').test(sdE))) iErr.push({ message: 'Sides roll: a formula is at most ' + LIMITS.formula + ' characters, on one line: Save drops it.' });
    else if (sdE && (!paS || !paS.ok)) iErr.push({ message: 'Sides roll: ' + (paS && paS.error && paS.error.message ? paS.error.message : 'the formula cannot be read.') + ' Save drops it.' });
    else if (sdE && Array.isArray(paS.names) && paS.names.length) iErr.push({ message: 'Sides roll: it reads ' + paS.names[0] + ', but a side rolls it as one, never as one character: Save drops it.' });
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
            if (t.length > LIMITS.formula || bCtl.test(t)) { bErr.push({ message: at + 'a formula is at most ' + LIMITS.formula + ' characters, on one line. Save drops the budget.' }); return true; }
            var pa = F().parse(t);
            if (!pa || !pa.ok) { bErr.push({ message: at + (pa && pa.error && pa.error.message ? pa.error.message : 'the formula cannot be read.') + ' Save drops the budget.' }); return true; }
            if (rfDice(pa.ast && pa.ast.body)) { bErr.push({ message: at + 'a budget rolls no dice. Save drops the budget.' }); return true; }
            bSys = bSys || { fields: gmViewFields(draft, F()), items: draft.items, core: draft.core };
            var gmB = gmDerivedNames(bSys, F(), Array.isArray(pa.names) ? pa.names : []);
            if (gmB.length) { bErr.push({ message: at + 'it reads ' + gmB[0] + ', which players cannot read, and a player sees their own budget. Save drops the budget.' }); return true; }
            return false;
        });
    });
    if (bErr.length) errorsById.budgets = bErr;
}
function errorCell(id) {
    var cell = el('div', 'sys-err');
    (errorsById[id] || []).forEach(function(e) {
        cell.appendChild(el('div', 'sys-err-line', errPrefix(e.prop) + e.message));
        if (e.pos !== undefined && e.len > 0) { var src = formulaTextFor(id, e.prop); if (src) { var pre = el('pre', 'dice-caret'); pre.textContent = src + NL + new Array(Math.min(e.pos, src.length) + 1).join(' ') + new Array(Math.min(e.len, 200) + 1).join('^'); cell.appendChild(pre); } }
    });
    (warningsById[id] || []).forEach(function(w) { cell.appendChild(el('div', 'sys-warn-line', errPrefix(w.prop, true) + w.message)); });
    if (!cell.childNodes.length) cell.style.display = 'none';
    return cell;
}
function errPrefix(p, warn) { var m = /^(apply|then)\.(\d+)$/.exec(p || ''); if (m) return (m[1] === 'then' ? 'Then ' : 'Change ') + (+m[2] + 1) + ': '; if (p === 'turn.move') return 'Move per turn: '; if (p === 'has') return 'Has: '; if (p === 'spent') return 'Spent: '; if (p === 'cost') return 'Costs: '; if (warn || !p || p === 'formula' || p === 'rollFormula' || p === 'apply' || p === 'list') return ''; return p + ': '; }   // Stage 6 HUD H7: an apply action's change by its number
function formulaTextFor(id, prop) {
    if (id === 'combat' && prop === 'turn.move') return (draft.combat && draft.combat.turn && draft.combat.turn.move) || '';   // turn-based combat T1
    if (id === 'range') return prop === 'formula' && draft.combat && draft.combat.range && typeof draft.combat.range.formula === 'string' ? draft.combat.range.formula.trim() : '';   // range penalties R1: as refreshErrors read it
    if (/^b_/.test(id)) { var bdF = (draft.budgets || []).find(function(x) { return x && x.id === id; }); return bdF && (prop === 'has' || prop === 'spent') && typeof bdF[prop] === 'string' ? bdF[prop] : ''; }   // 126: a budget's formula, as the validator read it
    if (/^e_/.test(id)) { var dAu = (draft.effects || []).find(function(x) { return x && x.id === id; }); return prop === 'formula' && dAu && typeof dAu.auto === 'string' ? dAu.auto.trim() : ''; }   // conditions C4: an effect's automatic formula, as refreshErrors read it
    var f = draft.fields.find(function(x) { return x.id === id; });
    if (f) return prop === 'roll' ? f.roll || '' : f[DEF_PROP[f.kind]] || '';
    var r = draft.rolls.find(function(x) { return x.id === id; });
    if (r && prop === 'malf') return r.malf || '';   // R3
    if (r) { var amI = /^(apply|then)\.(\d+)$/.exec(prop || ''); return amI ? ((Array.isArray(r[amI[1]]) && r[amI[1]][+amI[2]] && r[amI[1]][+amI[2]].formula) || '') : (r.formula || ''); }   // H7: a change's amount
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
function numInput(cls, value, title, step) { var i = el('input', cls); i.type = 'number'; i.value = value === undefined || value === null ? '' : String(value); i.title = title || ''; if (step) i.step = step; return i; }   // step (F4c1): 'any' for a stat (0.0001, -0.5)
function numField(cls, value, title, cap, step) { var l = el('label', 'sys-num'); l.appendChild(el('span', 'sys-num-cap', cap)); l.appendChild(numInput(cls, value, title, step)); return l; }   // a captioned number (Default / Min / Max / Step) so the def row reads without hovering
function select(cls, options, value, title) { var s = el('select', cls); options.forEach(function(o) { s.appendChild(opt(o[0], o[1], o[0] === value)); }); if (title) s.title = title; return s; }
function btnRow(list) { var btns = el('span', 'sys-btns'); list.forEach(function(b) { var x = el('button', 'tool ghost sys-btn'); x.dataset.act = b[0]; x.title = b[1]; x.innerHTML = b[2]; btns.appendChild(x); }); return btns; }
function labeledSelect(cls, cap, options, value, title) { var l = el('label', 'sys-combat-item'); l.appendChild(el('span', 'sys-num-cap', cap)); l.appendChild(select(cls, options, value, title)); return l; }
// [lookcheck:lineunder-start]
// 107, options that say what they do: one grey line under the captioned list a box was just given. Fixed words, set as text
function lineUnder(box, text) { var l = box && box.lastChild; if (l) l.appendChild(el('small', 'sys-line', text)); }
// [lookcheck:lineunder-end]
function fieldRow(f) {
    var row = el('div', 'sys-row'); row.dataset.id = f.id;
    var top = el('div', 'sys-row-main');
    top.appendChild(input('sys-key field', f.key, 'The name formulas use: STR, Skill.Stealth. Letters, digits, _ and dots.', 'Key'));
    top.appendChild(input('sys-label field', f.label, 'Shown on the sheet', 'Label'));
    top.appendChild(select('sys-kind', Object.keys(KIND_LABEL).map(function(k) { return [k, KIND_LABEL[k]]; }), f.kind, KIND_HELP[f.kind] || ''));
    var def = el('div', 'sys-def'); top.appendChild(def); buildDefCell(def, f);
    var flags = el('div', 'sys-flags');
    if (STORED[f.kind]) flags.appendChild(select('sys-edit', [['owner', 'Player may edit'], ['gm', 'GM edits']], f.edit || 'owner', 'Who may change the value at the table'));
    if (f.kind !== 'effects') flags.appendChild(select('sys-vis', [['all', 'Visible to players'], ['gm', 'GM only']], f.vis || 'all', 'GM only: the field and its value never leave your machine'));
    var hov = el('label', 'sys-hover'); var hc = el('input'); hc.type = 'checkbox'; hc.checked = !!f.hover; hc.className = 'sys-hover-chk'; hov.appendChild(hc); hov.appendChild(document.createTextNode(' Hover')); hov.title = 'Show on the token\'s hover card and the party strip'; flags.appendChild(hov);
    if (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill' || f.kind === 'resource') { var tl = el('label', 'sys-hover'); var tc = el('input'); tc.type = 'checkbox'; tc.checked = !!f.tile; tc.className = 'sys-tile-chk'; tl.appendChild(tc); tl.appendChild(document.createTextNode(' Tile')); tl.title = 'Show this field as a stat tile (big value, small label)'; flags.appendChild(tl); }   // Stage 3
    if (f.kind === 'number' && (!f.counter || f.slider)) { var sl = el('label', 'sys-hover'); var sc = el('input'); sc.type = 'checkbox'; sc.checked = !!f.slider; sc.className = 'sys-slider-chk'; sl.appendChild(sc); sl.appendChild(document.createTextNode(' Slider')); sl.title = 'Show this number as a range on a two-colour track with end labels (needs a min and a max)'; flags.appendChild(sl); }   // Stage 5e (a counter is not a slider: hidden while Counter is on, shown while a slider is set so it can be turned off)
    if ((f.kind === 'number' && !f.slider && !(Array.isArray(f.labels) && f.labels.length)) || f.kind === 'skill') { var cnl = el('label', 'sys-hover'); var cnc = el('input'); cnc.type = 'checkbox'; cnc.checked = !!f.counter; cnc.className = 'sys-counter-chk'; cnl.appendChild(cnc); cnl.appendChild(document.createTextNode(' Counter')); cnl.title = 'Draw \u2212 and + either side of the box (a turn counter, death saves, ammo, slots used)'; flags.appendChild(cnl); }   // HUD frame (HF4a, H8): never with a slider or value names
    if (f.kind !== 'formula') { var lvL = el('label', 'sys-hover sys-live'); lvL.appendChild(document.createTextNode('Locked: ')); var lvS = el('select', 'sys-live-sel'); [['', 'automatic'], ['on', 'stays live'], ['off', 'needs Edit sheet']].forEach(function(o) { lvS.appendChild(opt(o[0], o[1], (f.live === true ? 'on' : f.live === false ? 'off' : '') === o[0])); }); lvL.appendChild(lvS); lvL.title = 'On a locked sheet and in the HUD. Automatic: a pool, a switch, a counter and a number with value names keep working, and everything else needs Edit sheet. Choose here to say otherwise for this field'; flags.appendChild(lvL); }   // the sheet's lock: this field's own word on it
    if (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill' || f.kind === 'resource') flags.appendChild(input('sys-unit field', f.unit, 'A short unit after the value, on the sheet and in the header (pts, kg, ft)', 'Unit'));   // Stage 5g
    if (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill') { var sgl = el('label', 'sys-hover'); var sgc = el('input'); sgc.type = 'checkbox'; sgc.checked = !!f.sign; sgc.className = 'sys-sign-chk'; sgl.appendChild(sgc); sgl.appendChild(document.createTextNode(' \u00b1 colour')); sgl.title = 'Colour the value by its sign: green above zero, red below (points remaining, a modifier)'; flags.appendChild(sgl); }   // Stage 5g
    if (f.kind !== 'notes' && f.kind !== 'text' && f.kind !== 'select' && f.kind !== 'item-list' && f.kind !== 'effects') flags.appendChild(input('sys-roll field', f.roll, 'A roll button for this field (dice allowed): d20 + ' + (f.key || 'Key'), 'Roll (optional)'));
    if (f.kind === 'number' || f.kind === 'formula') flags.appendChild(input('sys-vnames field', (f.labels || []).join(', '), 'Names for the values 0, 1, 2\u2026 separated by commas (Not stunned, Physical, Mental): a number becomes a dropdown, a formula shows the name for its value; formulas still read the number. A named value is a word: \u00b1 colour, unit and slider do not apply to it', 'Value names (optional)'));   // Stage 6
    if (f.kind === 'formula') { var bgl = el('label', 'sys-hover'), bgc = el('input'); bgc.type = 'checkbox'; bgc.checked = !!f.badge; bgc.className = 'sys-badge-chk'; bgl.appendChild(bgc); bgl.appendChild(document.createTextNode(' Badge')); bgl.title = 'Show the value as a small pill; with value names, each name can have its own colour'; flags.appendChild(bgl); }   // Stage 6 look fold (L7)
    flags.appendChild(input('sys-caption field', f.caption, 'A line under the field on the sheet \u2014 {formula} shows a value, {\u00b1formula} the value with its sign (+2), e.g. Base: {ST * 2}', 'Caption (optional)'));   // Fold B; Stage 6: {\u00b1\u2026}
    if (f.kind === 'resource') {   // Fold B: the pool's icon, a fill-to-max button, the bar
        var rIcoIn = input('sys-res-icon field', f.icon, 'An icon before the value \u2014 an emoji or a bundled icon', 'Icon'); flags.appendChild(rIcoIn); flags.appendChild(glyphButton(rIcoIn));
        var rsl = el('label', 'sys-hover'); var rsc = el('input'); rsc.type = 'checkbox'; rsc.checked = !!f.reset; rsc.className = 'sys-reset-chk'; rsl.appendChild(rsc); rsl.appendChild(document.createTextNode(' \u21bb Reset')); rsl.title = 'A button that fills the pool back to its max'; flags.appendChild(rsl);
        var rcl = el('label', 'sys-sec-color'), rci = el('input'); rci.type = 'color'; rci.className = 'sys-res-color'; rci.value = f.color || '#4db3d3'; rci.title = 'The pool\u2019s own colour: its icon, its bar and its value on the band'; rcl.appendChild(el('span', 'sys-sec-style-lbl', 'Colour')); rcl.appendChild(rci); flags.appendChild(rcl);   // L7
        if (f.color) { var rcc = el('button', 'tool ghost sys-btn', 'No colour'); rcc.dataset.act = 'rescolorclr'; rcc.title = 'Back to the theme\u2019s colours'; flags.appendChild(rcc); }
        var bcl = el('label', 'sys-hover'); var bcc = el('input'); bcc.type = 'checkbox'; bcc.checked = f.bar !== false; bcc.className = 'sys-bar-chk'; bcl.appendChild(bcc); bcl.appendChild(document.createTextNode(' Bar')); bcl.title = 'The bar under the value (untick for just the numbers)'; flags.appendChild(bcl);
    }
    flags.appendChild(btnRow([['up', 'Move up', '&#9650;'], ['down', 'Move down', '&#9660;'], ['dup', 'Duplicate', '&#10697;'], ['del', 'Delete this field', '&times;']]));
    row.appendChild(top); row.appendChild(flags);
    if (f.kind === 'formula' && f.badge && Array.isArray(f.labels) && f.labels.length) {   // Stage 6 look fold (L7): a colour per value name on the badge
        var trow = el('div', 'sys-sec-style sys-tones-row'); trow.appendChild(el('span', 'sys-sec-style-lbl', 'Colours'));
        f.labels.forEach(function(lbN, ti) {
            if (!lbN) return;
            var lab = el('label', 'sys-tone-lbl'); lab.appendChild(el('span', 'sys-sec-style-lbl', lbN));
            var ts = select('sys-tone-sel', [['', 'Plain'], ['good', 'Good (green)'], ['warn', 'Warning (amber)'], ['danger', 'Danger (red)'], ['accent', 'Accent'], ['primary', 'Primary']], (Array.isArray(f.tones) && f.tones[ti]) || '', 'The badge\u2019s colour when the value is ' + lbN);
            ts.dataset.ti = String(ti); lab.appendChild(ts); trow.appendChild(lab);
        });
        row.appendChild(trow);
    }
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
        if (k === 'number' && Array.isArray(f.labels) && f.labels.length) {   // Stage 6: a named number — its default is one of its names; the range is the names
            var dl = Math.max(0, Math.min(f.labels.length - 1, Math.round(Number(f.def) || 0)));
            def.appendChild(select('sys-def-lbl', f.labels.map(function(t, i) { return [String(i), t || String(i)]; }), String(dl), 'The value a new character starts with'));
            def.appendChild(el('span', 'sys-note', 'Values 0\u2013' + (f.labels.length - 1) + ', one per name'));
            return;
        }
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
    else if (k === 'effects') def.appendChild(el('span', 'sys-note', 'Status effects on the sheet; the library is the Effects tab. Who may change the list: the edit setting beside.'));
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
// Stage 6 HUD H7: an apply action's changes — each a pool or a number, Subtract or Add, and the amount (a formula, no dice); four at most
function applyEditor(r, key) {   // key (R1): 'apply' — an apply action's changes; 'then' — a roll's consequences (each with its When)
    key = key === 'then' ? 'then' : 'apply';
    var box = el('div', 'sys-apply' + (key === 'then' ? ' sys-then' : '')), list = Array.isArray(r[key]) ? r[key] : [];
    var targets = draft.fields.filter(function(f) { return f && APPLY_KINDS[f.kind] === 1; }).map(function(f) { return [f.id, (f.label || f.key || f.id) + (f.kind === 'resource' ? ' (pool)' : '')]; });
    list.forEach(function(ch0, i) {
        var ch = ch0 && typeof ch0 === 'object' ? ch0 : {}, rw = el('div', 'sys-flags sys-apply-row'); rw.dataset.ai = String(i); rw.dataset.k = key;
        if (key === 'then') rw.appendChild(select('sys-apply-when', [['', 'Always'], ['hit', 'On success'], ['miss', 'On failure'], ['malf', 'On malfunction']], ch.when || '', 'When the roll makes this change: always, or only when its test succeeds or fails'));
        var opts = [['', 'Pick a pool or number\u2026']].concat(targets); if (ch.f && !targets.some(function(o) { return o[0] === ch.f; })) opts.push([ch.f, 'A field that is gone']);
        rw.appendChild(select('sys-apply-target', opts, ch.f || '', 'What this change moves: a pool\u2019s current value, or a number'));
        rw.appendChild(select('sys-apply-op', [['sub', 'Subtract'], ['add', 'Add'], ['set', 'Set to']], ch.set ? 'set' : ch.add ? 'add' : 'sub', 'Subtract (a cost, a wound), add (rest, healing) or set it to the amount (back to 0); never past the field\u2019s min and max'));
        var fm = input('sys-apply-formula field', typeof ch.formula === 'string' ? ch.formula : '', 'The amount, worked out when pressed: no dice (3, FPCost, max(0, Incoming - DR)); below 0 counts as 0', 'Amount'); fm.maxLength = LIMITS.formula; rw.appendChild(fm);
        [['applyup', '\u25b2', 'Move up'], ['applydown', '\u25bc', 'Move down'], ['applydel', '\u00d7', 'Remove this change']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = bd[0]; bb.title = bd[2]; rw.appendChild(bb); });
        box.appendChild(rw);
    });
    var addB = el('button', 'tool ghost sys-btn sys-apply-add', key === 'then' ? '+ Then\u2026' : '+ Change'); addB.dataset.act = 'applyadd'; addB.dataset.k = key; addB.disabled = list.length >= LIMITS.applyChanges; addB.title = addB.disabled ? 'At most ' + LIMITS.applyChanges + ' changes' : key === 'then' ? 'A change this roll makes to the character: always, on success or on failure (a pending hit, spent ammo, a stun cleared)' : 'Another pool or number this button moves (Apply costs: FP and EP together)'; box.appendChild(addB);
    return box;
}
function applyChangeOf(t, r) { var rw = t.closest('.sys-apply-row'), i = rw ? +rw.dataset.ai : -1, k = rw && rw.dataset.k === 'then' ? 'then' : 'apply'; return r && Array.isArray(r[k]) && i >= 0 && i < r[k].length && r[k][i] && typeof r[k][i] === 'object' ? r[k][i] : null; }
function rollRow(r) {
    var row = el('div', 'sys-row'); row.dataset.id = r.id;
    var top = el('div', 'sys-row-main');
    top.appendChild(input('sys-label field', r.label, 'The button\u2019s label; {formula} shows a value: Attack ({\u00b1AtkBonus})', 'Label'));
    var isApply = Array.isArray(r.apply);   // Stage 6 HUD H7: the second kind — changes in place of a formula, never the initiative
    top.appendChild(select('sys-roll-kind', [['roll', 'Roll'], ['apply', 'Apply']], isApply ? 'apply' : 'roll', 'Roll: dice at the table. Apply: a button that moves pools or numbers by an amount (Apply costs, Apply wounds)'));
    if (!isApply) top.appendChild(input('sys-formula field', r.formula, 'The roll: d20 + STRmod, 3d6 <= Skill.Stealth', 'Roll formula'));
    if (!isApply) { var mfIn = input('sys-roll-malf field', r.malf || '', 'Malf: a natural total (the dice alone) at or past this malfunctions \u2014 a failure, and its On malfunction changes (no dice; empty: never)', 'Malf'); mfIn.maxLength = LIMITS.formula; top.appendChild(mfIn); }   // Stage 6 HUD R3
    top.appendChild(select('sys-vis', [['all', 'Visible to players'], ['gm', 'GM only']], r.vis || 'all', 'GM only: players never see this roll'));
    top.appendChild(select('sys-roll-tone', [['', 'Plain button'], ['primary', 'Filled'], ['danger', 'Red'], ['neutral', 'Grey'], ['outline', 'Outline']], r.tone || '', 'How the button looks on the sheet'));   // Stage 6 look fold
    var actsR = turnActs(); if (actsR.length || r.cost) top.appendChild(select('sys-roll-cost', costOptions(r.cost, actsR), r.cost || '', 'What one press costs in turn-based combat: one of the actions a turn allows (the Combat card, System \u25b8 Items)'));   // turn-based combat T1
    var roIcoIn = input('sys-roll-icon field', r.icon, 'An icon on the button \u2014 an emoji or a bundled icon (optional)', 'Icon'); top.appendChild(roIcoIn); top.appendChild(glyphButton(roIcoIn));
    if (isApply) { var ea0 = r.each === 'round' || r.each === 'turn' ? r.each : r.round === true ? 'round' : ''; top.appendChild(select('sys-roll-each', [['', 'Only when pressed'], ['round', 'Also each round'], ['turn', 'Also at its turn\u2019s start']], ea0, 'Runs during a combat as well: on every new round (every character in it: Turn = CombatRound, Parries = 0), or when its character\u2019s turn begins (a bleed, a reaction back); pressed, it runs now')); if (ea0) top.appendChild(select('sys-roll-by', [['', 'automatically'], ['gm', 'when the GM presses it'], ['owner', 'when its player presses it']], r.by === 'gm' || r.by === 'owner' ? r.by : '', 'Automatically, or as a reminder in chat with a Run button: for you, or for the character\u2019s player (yours when they are not at the table, or the action is GM only)')); }   // Stage 6 HUD G10 + turn-based combat T2b
    if (!isApply) { var il = el('label', 'sys-hover'); var ic = el('input'); ic.type = 'checkbox'; ic.className = 'sys-init-chk'; ic.checked = !!r.init; il.appendChild(ic); il.appendChild(document.createTextNode(' Initiative')); il.title = 'The combat roster rolls this for initiative'; top.appendChild(il); }
    if (!isApply) { var dl = el('label', 'sys-hover'); var dc = el('input'); dc.type = 'checkbox'; dc.className = 'sys-dmg-chk'; dc.checked = r.dmg === true; dl.appendChild(dc); dl.appendChild(document.createTextNode(' Damage')); dl.title = 'A damage roll: its card in Table Chat takes the damage colour, a larger total and a damage tag'; top.appendChild(dl); }   // chat cards (owner 2026-09-27)
    top.appendChild(btnRow([['up', 'Move up', '&#9650;'], ['down', 'Move down', '&#9660;'], ['del', 'Delete this roll', '&times;']]));
    row.appendChild(top);
    row.appendChild(everyRow(r));   // item 20 K5: by the campaign's clock
    row.appendChild(applyEditor(r, isApply ? 'apply' : 'then'));   // R1: a roll's consequences under it
    var err = errorCell(r.id); err.dataset.errFor = r.id; row.appendChild(err);
    return row;
}
function charRow(c, camp) {
    var row = el('div', 'sys-row sys-char-row'); row.dataset.cid = c.id;
    var top = el('div', 'sys-row-main');
    var nm = input('sys-char-name field', c.name, 'The character\'s name', 'Name'); top.appendChild(nm);
    var pn = playerNames(camp), ownOpts = [['', '— unassigned —']].concat(Object.keys(pn).map(function(pid) { return [pid, pn[pid]]; }));
    if (c.ownerId && !Object.prototype.hasOwnProperty.call(pn, c.ownerId)) ownOpts.push([c.ownerId, c.ownerId + ' (forgotten player)']);   // so unassigning them is a real change
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
    row.appendChild(el('div', 'sys-note', (c.making === 1 ? 'Still being made by its player \u00b7 ' : '') + (tokens ? tokens + ' token' + (tokens === 1 ? '' : 's') + ' on the maps' : 'No token yet: pick this character in a token\'s Properties, or drop it from the Cast') + (c.ownerId ? ' · played by ' + (pn[c.ownerId] || c.ownerId) + (several ? (active === c.id ? ' (in play)' : ' (kept: you move its tokens)') : '') : c.npc ? ' · NPC' : ' · unassigned (players cannot see it until a player is set)') + (c.making === 1 ? ' · being made by its player (theirs alone until Done)' : c.unlocked === 1 ? ' · unlocked for its player' : '') + (c.review === 1 ? ' · new: review it on its sheet' : '')));
    return row;
}
// 5h: one library effect in the editor: name, icon, tone, duration note, its changes (a field and an amount, or a toggle switched on),
// notes, visibility and the usual move / duplicate / delete
function effectRow(d) {
    var row = el('div', 'sys-row sys-fx-row'); row.dataset.eid = d.id;
    var top = el('div', 'sys-row-main');
    var xIcoIn = input('sys-fx-icon field', d.icon, 'An icon (an emoji or a bundled icon)', 'Icon'); top.appendChild(xIcoIn); top.appendChild(glyphButton(xIcoIn));
    top.appendChild(input('sys-fx-name field', d.name, 'The effect\u2019s name on the sheet (Rage, Prone, Blessed\u2026)', 'Name'));
    top.appendChild(select('sys-fx-tone', [['', 'Neutral'], ['buff', 'Buff'], ['debuff', 'Debuff']], d.tone || '', 'Buff or Debuff (a colour on the sheet)'));
    top.appendChild(input('sys-fx-dur field', d.dur, 'How long it lasts: 3 turns, 10 seconds, 1 minute, next turn, or your own unit (2 watches) \u2014 it then runs out by itself (in a combat on its character\u2019s turns, out of one by the clock); any other note (until dawn) you end by hand', 'Duration'));
    var mods = el('div', 'sys-fx-mods'), targets = fxTargets(draft);
    (d.mods || []).forEach(function(m, mi) {
        var ln = el('div', 'sys-fx-mod'); ln.dataset.mi = String(mi);
        var val = m.f + '|' + (m.op === 'on' ? 'on' : m.part === 'max' ? 'max' : 'add'), opts = targets.slice();
        if (!opts.some(function(o) { return o[0] === val; })) opts.unshift([val, '(a field that is gone or changed kind)']);
        ln.appendChild(select('sys-fx-target', opts, val, 'What this change affects'));
        if (m.op !== 'on') { var am = numInput('sys-fx-amt', m.v, 'How much it adds (negative to take away)'); am.step = 'any'; ln.appendChild(am); }
        ln.appendChild(btnRow([['fxmoddel', 'Remove this change', '&times;']]));
        mods.appendChild(ln);
    });
    var madd = el('button', 'tool ghost sys-btn', '+ Change'); madd.dataset.act = 'fxmodadd'; madd.title = 'Add a number to a field, or switch a toggle on'; if (!targets.length) madd.disabled = true; mods.appendChild(madd);
    var flags = el('div', 'sys-flags');
    flags.appendChild(input('sys-fx-notes field', d.notes, 'Notes shown as the effect\u2019s tooltip on the sheet', 'Notes'));
    flags.appendChild(select('sys-fx-vis', [['all', 'Visible to players'], ['gm', 'GM only']], d.vis || 'all', 'GM only: off the players\u2019 list until you apply it to their character'));
    flags.appendChild(btnRow([['up', 'Move up', '&#9650;'], ['down', 'Move down', '&#9660;'], ['dup', 'Duplicate', '&#10697;'], ['del', 'Delete this effect', '&times;']]));
    row.appendChild(top); row.appendChild(mods); row.appendChild(flags);
    var auR = el('div', 'sys-flags sys-fx-autorow'), auI = input('sys-fx-auto field', typeof d.auto === 'string' ? d.auto : '', 'A formula: while it is true, or a number other than 0, the effect is on by itself for every character, as HP <= 0 turns on Unconscious. It reads the character\u2019s own values with the effects applied by hand (never another automatic effect, and a token\u2019s names read 0). Only a visible effect reading only what players can read applies itself', 'Applies itself when\u2026 (e.g. HP <= 0)'); auI.maxLength = LIMITS.formula; auR.appendChild(auI); row.appendChild(auR);   // conditions C4
    var auE = errorCell(d.id); auE.dataset.errFor = d.id; row.appendChild(auE);
    return row;
}
function fxOfRow(target) { var row = target.closest && target.closest('.sys-fx-row'); if (!row) return null; return (draft.effects || []).find(function(x) { return x.id === row.dataset.eid; }) || null; }
function itemRow(it) {
    var row = el('div', 'sys-row sys-item-row'); row.dataset.iid = it.id;
    var top = el('div', 'sys-row-main');
    top.appendChild(input('sys-item-name field', it.name, 'The item name shown on the sheet', 'Name'));
    var catIn = input('sys-item-cat field', it.category, 'A group, e.g. Explosives, Sidearms', 'Category'), sDefs = itemStatDefs(it); catIn.dataset.scope = sDefs.map(function(s) { return s.key.toLowerCase(); }).join(','); top.appendChild(catIn);   // F4c1: the lists it can be on decide its stat boxes (a category that changes them redraws the row)
    var area = el('div', 'sys-item-area');
    area.appendChild(select('sys-item-shape', [['', 'No blast'], ['circle', 'Blast (circle)']], it.area ? (it.area.shape || 'circle') : '', 'A thrown blast: a circular area, thrown from the sheet'));
    var ftw = numField('sys-item-ft', it.area ? it.area.ft : '', 'Blast radius in feet', 'ft'); if (!it.area) ftw.style.opacity = '0.5'; area.appendChild(ftw);
    top.appendChild(area);
    top.appendChild(input('sys-item-damage field', it.damage, 'Damage roll (dice allowed): 3d6, 2d6 + STRmod', 'Damage (optional)'));
    var flags = el('div', 'sys-flags');
    flags.appendChild(input('sys-item-cost field', it.cost, 'Point/credit cost (a formula, no dice) — used by budgets in a later slice', 'Cost (optional)'));
    flags.appendChild(input('sys-item-throw field', it.throwSkill, 'Optional: a field whose roll is posted as the to-hit', 'Throw skill (optional)'));
    var iIcoIn = input('sys-item-icon field', it.icon, 'An emoji or a bundled icon shown on the row', 'Icon'); flags.appendChild(iIcoIn); flags.appendChild(glyphButton(iIcoIn));
    flags.appendChild(select('sys-item-vis', [['all', 'Visible to players'], ['gm', 'GM only']], it.vis || 'all', 'GM only: kept out of the players\u2019 list. One you give a character reaches its owner (name, icon, category and notes); its formulas never leave your machine'));
    flags.appendChild(select('sys-item-rmmode', [['', 'A player may remove it'], ['bound', 'Bound: only the GM removes it'], ['curse', 'Curse on contact: you keep it']], it.rm || '', 'When a player removes it from their character. Bound: it stays on their sheet and they see your message. Curse on contact: it leaves their sheet but stays on the character, out of their sight, until you remove it. Players never see this setting.'));   // Stage 6
    var rmIn = input('sys-item-rmtext field', it.rmMsg || '', 'Shown to the player when they try to remove it (optional)', 'Message on removal'); rmIn.maxLength = LIMITS.rmMsg; if (!it.rm) rmIn.style.opacity = '0.5'; flags.appendChild(rmIn);
    var anyL = (draft.fields || []).some(function(x) { return x.kind === 'item-list' && x.list && x.list.lvl; }), anyO = (draft.fields || []).some(function(x) { return x.kind === 'item-list' && x.list && x.list.on; });   // Stage 6 F4b
    if (anyO) {
        flags.appendChild(select('sys-item-eqmode', [['', 'A player may switch it off'], ['bound', 'Bound: it stays on'], ['curse', 'Curse on contact: you keep it on']], it.eq || '', 'When a player switches it off (Readied, Equipped\u2026). Bound: it stays on and they see your message; just after it goes on, it still comes off. Curse on contact: it looks off to them but stays on, out of their sight, until you switch it off. Players never see this setting.'));
        var eqIn = input('sys-item-eqtext field', it.eqMsg || '', 'Shown to the player when they try to switch it off (optional)', 'Message on switching off'); eqIn.maxLength = LIMITS.rmMsg; if (!it.eq) eqIn.style.opacity = '0.5'; flags.appendChild(eqIn);
    }
    flags.appendChild(input('sys-item-key field', it.key || '', 'A short fixed name for it, once in each list it can be on: a letter, then letters, digits and _. Formulas read its row by it: List.key.lvl, List.key.qty', 'Key (optional)'));
    if (anyL) flags.appendChild(numField('sys-item-lvl', it.lvl, 'The level a new row of it starts at (blank: the list\u2019s default)', 'Level'));
    flags.appendChild(btnRow([['up', 'Move up', '&#9650;'], ['down', 'Move down', '&#9660;'], ['dup', 'Duplicate', '&#10697;'], ['del', 'Delete this item', '&times;']]));
    row.appendChild(top); row.appendChild(flags);
    var stBox = itemStatsBox(it, sDefs); if (stBox) row.appendChild(stBox);   // F4c1
    var nrow = el('div', 'sys-item-notes-row'); nrow.appendChild(input('sys-item-notes field', it.notes, 'Notes shown on the sheet', 'Notes (optional)')); row.appendChild(nrow);
    row.appendChild(itemModsBox(it, anyL, anyO));   // Stage 6 F6
    var err = errorCell(it.id); err.dataset.errFor = it.id; row.appendChild(err);
    return row;
}
// Stage 6 F6: an item's changes to the character carrying it — a status effect's kind of change (a number, skill or formula up or down, a
// pool's max, a toggle switched on); per level once a list has levels, "only while switched on" once a list has a switch
function itemModsBox(it, anyL, anyO) {
    var box = el('div', 'sys-fx-mods sys-item-mods'), targets = fxTargets(draft);
    box.appendChild(el('span', 'sys-note', 'Changes to the character carrying it:'));
    (it.mods || []).forEach(function(m, mi) {
        var ln = el('div', 'sys-fx-mod sys-item-mod'); ln.dataset.mi = String(mi);
        var val = m.f + '|' + (m.op === 'on' ? 'on' : m.part === 'max' ? 'max' : 'add'), opts = targets.slice();
        if (!opts.some(function(o) { return o[0] === val; })) opts.unshift([val, '(a field that is gone or changed kind)']);
        ln.appendChild(select('sys-item-mtarget', opts, val, 'What this change affects'));
        if (m.op !== 'on') { var am = numInput('sys-item-mamt', m.v, 'How much it adds (negative to take away)'); am.step = 'any'; ln.appendChild(am); if (anyL) ln.appendChild(checkLabel('sys-item-mlvl', m.lvl === true, 'per level', 'Times the row\u2019s level (a trait at level 3: three times)')); }
        ln.appendChild(btnRow([['itemmoddel', 'Remove this change', '&times;']]));
        box.appendChild(ln);
    });
    var add = el('button', 'tool ghost sys-btn', '+ Change'); add.dataset.act = 'itemmodadd'; add.title = 'Add a number to a field, or switch a toggle on, while a character carries it'; if (!targets.length) add.disabled = true; box.appendChild(add);
    if (anyO && (it.mods || []).length) box.appendChild(checkLabel('sys-item-modson', it.modsOn === true, 'Only while switched on', 'Its changes count only while its row is switched on (Readied, Equipped\u2026)'));
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
            ctl = select('sys-item-stat', [['', '—' + (s.def ? ' (' + s.def + ')' : '')]].concat((s.opts || []).map(function(o) { return [o.label, o.label]; })), pv, s.label + ' (' + s.key + ')'); ctl.dataset.pick = '1';
        } else if (Array.isArray(s.labels) && s.labels.length) {   // a stat with value names: a dropdown (a value past them stays, greyed)
            ctl = select('sys-item-stat', [['', '—']].concat(s.labels.map(function(n, i) { return [String(i), n || String(i)]; })), typeof v === 'number' ? String(v) : '', s.label + ' (' + s.key + ')');
            if (typeof v === 'number' && !(v >= 0 && v < s.labels.length && Math.floor(v) === v)) { var xo = el('option', null, String(v)); xo.value = String(v); xo.selected = true; xo.disabled = true; ctl.appendChild(xo); }
        } else ctl = numInput('sys-item-stat', typeof v === 'number' ? v : '', s.label + ' (' + s.key + '; blank: ' + (typeof s.def === 'number' ? s.def : 0) + ')', 'any');
        ctl.dataset.sk = s.key; lb.appendChild(ctl); box.appendChild(lb);
    });
    Object.keys(have).forEach(function(k) {
        if (inScope[k.toLowerCase()] || !STAT_KEY.test(k) || (k in Object.prototype) || (k.toLowerCase() in Object.prototype)) return;
        var lb = el('label', 'sys-num sys-stat-off'); lb.appendChild(el('span', 'sys-num-cap', k + ' (not on its lists)'));
        var ni = numInput('sys-item-stat', typeof have[k] === 'number' ? have[k] : '', 'A value under a key no list it can be on has: clear it, or give it a category whose list has this stat (Save keeps it only while some list has it)', 'any'); ni.dataset.sk = k; lb.appendChild(ni); box.appendChild(lb);
    });
    return box.childNodes.length ? box : null;
}
// Stage 6 F4b: the Lists tab — one card per item-list field: the categories its picker offers, the same item more than once, no quantity, a
// level per row (names count from its minimum) and a switch per row. Changes go to the draft; Save cleans them
function renderLists() {
    var box = ui('sysListRows'); if (!box) return; box.textContent = '';
    var lists = (draft.fields || []).filter(function(f) { return f.kind === 'item-list'; }), rules = ui('sysListRules');
    if (rules) { rules.textContent = ''; if (lists.length) rules.appendChild(labeledSelect('sys-listrules-stats', 'Item stats on players’ sheets', [['', 'GM only'], ['owner', 'Players may change them']], draft.listRules && draft.listRules.ownerStats === true ? 'owner' : '', 'Players may change the stats of their own copies with ✎ (a dot marks each; Follow the library takes them back; a stat you set on a copy holds). Turning it off keeps what they set')); if (lists.length) rules.appendChild(labeledSelect('sys-listrules-upload', 'A player’s sheet upload', [['', 'Everything waits for you'], ['facts', 'Their row facts apply at once']], draft.listRules && draft.listRules.uploadFacts === true ? 'facts' : '', 'When a player sends their sheet file (Import JSON on their sheet): everything waits for your review, or the levels, switches and quantities of rows they already carry apply at once (the rest still waits)')); }   // Stage 6 F4c2: the Rules box (Setting A), per system
    if (!lists.length) { box.appendChild(el('div', 'sys-empty', 'No item lists yet. Add an Item list field in Fields (Skills, Weapons, Gear\u2026), then shape it here.')); return; }
    var cats = [], seen = Object.create(null);
    (draft.items || []).forEach(function(it) { var cc = String((it && it.category) || '').trim(); if (cc && !seen[cc.toLowerCase()]) { seen[cc.toLowerCase()] = 1; cats.push(cc); } });
    var tgL = draft.fields.filter(function(x) { return x && (x.kind === 'resource' || x.kind === 'number'); });   // R2b: what a list's actions may move (APPLY_KINDS)
    lists.forEach(function(f) { box.appendChild(listCard(f, cats, tgL, draft.combat && draft.combat.turn && Array.isArray(draft.combat.turn.acts) ? draft.combat.turn.acts.filter(function(a) { return a && typeof a.key === 'string' && a.key; }) : [])); var le = errorCell('list:' + f.id); le.dataset.errFor = 'list:' + f.id; box.appendChild(le); });   // F4c1: the list's stat messages under its card
}
// [systemcheck:stattick-start]
// A list stat's two ticks (1.5.4): On the row and Hidden are one or the other, in the draft and in the card's own boxes
function statTick(d, which, on, row) {
    if (!d || typeof d !== 'object' || (which !== 'show' && which !== 'hide')) return;
    if (!on) { delete d[which]; return; }
    var other = which === 'show' ? 'hide' : 'show';
    d[which] = true; delete d[other];
    var ob = row && typeof row.querySelector === 'function' ? row.querySelector('.sys-list-stat' + other) : null; if (ob) ob.checked = false;
}
// [systemcheck:stattick-end]
function listCard(f, allCats, targets, acts) {   // acts (turn-based combat T1): the actions a list roll may cost   // targets (R2b): the pools and numbers an action or a consequence may move
    var sp = f.list && typeof f.list === 'object' ? f.list : {}, card = el('div', 'sys-list-card'); card.dataset.lid = f.id;
    card.appendChild(el('div', 'sys-list-title', (f.label || f.key || 'Item list') + (f.key ? ' (' + f.key + ')' : '')));
    var cl = el('div', 'sys-list-cats'); cl.appendChild(el('span', 'sys-num-cap', 'Categories'));
    var mine = Array.isArray(sp.cats) ? sp.cats.map(String) : [], low = mine.map(function(x) { return x.toLowerCase(); }), shown = allCats.slice();
    mine.forEach(function(x) { if (!shown.some(function(y) { return y.toLowerCase() === x.toLowerCase(); })) shown.push(x); });   // one no item has any more stays tickable
    if (!shown.length) cl.appendChild(el('span', 'sys-note', 'Give items a category in Items to choose which ones this list offers.'));
    shown.forEach(function(x) { var lb = el('label', 'sys-list-cat'), cb = el('input', 'sys-list-catcb'); cb.type = 'checkbox'; cb.checked = low.indexOf(x.toLowerCase()) >= 0; cb.dataset.cat = x; if (!cb.checked && mine.length >= LIMITS.listCats) { cb.disabled = true; lb.title = 'At most ' + LIMITS.listCats + ' categories a list'; } lb.appendChild(cb); lb.appendChild(document.createTextNode(' ' + x)); cl.appendChild(lb); });   // review: the cap Save keeps, shown
    if (shown.length && !mine.length) cl.appendChild(el('span', 'sys-note', 'None ticked: every category.'));
    card.appendChild(cl);
    var fl = el('div', 'sys-flags');
    fl.appendChild(checkLabel('sys-list-multi', sp.multi === true, 'Same item more than once', 'Adding an item it already holds makes a new row (a skill twice, with two specialties) instead of raising the quantity'));
    fl.appendChild(checkLabel('sys-list-noqty', sp.noQty === true, 'No quantity', 'Rows have no quantity (skills, powers): the \u2212/+ and \u00d7n go, and an item is on the list once unless the same item may be there more than once. Quantities already stored come back if you untick it'));
    fl.appendChild(checkLabel('sys-list-custom', sp.custom === true, 'Custom rows', 'Players may add rows of their own with + Custom\u2026 on their sheet (a name, an icon, a category, notes, a key and stats) and change the ones they made; you can add them on any shaped list'));   // Stage 6 F4c3
    card.appendChild(fl);
    var lv = sp.lvl && typeof sp.lvl === 'object' ? sp.lvl : null, lr = el('div', 'sys-flags sys-list-lvl');
    lr.appendChild(checkLabel('sys-list-haslvl', !!lv, 'Rows have a level', 'Each row carries a level its owner sets: a skill\u2019s level, a power\u2019s rank, a language\u2019s fluency'));
    if (lv) {
        lr.appendChild(input('sys-list-lvllabel field', lv.label || '', 'The level\u2019s name on the sheet', 'Level'));
        lr.appendChild(numField('sys-list-lvlmin', lv.min, 'The lowest level (blank: none)', 'min'));
        lr.appendChild(numField('sys-list-lvlmax', lv.max, 'The highest level (blank: none; with value names, the names set it)', 'max'));
        lr.appendChild(numField('sys-list-lvlstep', lv.step, 'The step between levels', 'step'));
        lr.appendChild(numField('sys-list-lvldef', lv.def, 'The level a new row starts at (an item\u2019s own Level in Items comes first); a row with no level of its own reads it', 'default'));
        lr.appendChild(input('sys-list-lvlnames field', (lv.labels || []).join(', '), 'Names for the levels from the minimum up, separated by commas (Broken, Accented, Fluent): the level becomes a dropdown', 'Value names (optional)'));
    }
    card.appendChild(lr);
    var sw = sp.on && typeof sp.on === 'object' ? sp.on : null, orow = el('div', 'sys-flags sys-list-on');
    orow.appendChild(checkLabel('sys-list-hason', !!sw, 'Rows have a switch', 'Each row can be switched on and off: Readied, Equipped, Active, Stowed\u2026 In Layout a placement of the list can show only the rows switched on'));
    if (sw) {
        orow.appendChild(input('sys-list-onlabel field', sw.label || '', 'The switch\u2019s name on the sheet', 'On'));
        orow.appendChild(checkLabel('sys-list-ondef', sw.def === true, 'Starts on', 'A new row starts switched on; a row from before the list had its switch reads it until it is switched'));
    }
    card.appendChild(orow);
    // Stage 6 F4c1: the list's stats — a number every item of it carries (Acc, Wt, Cost), ten at most — and the one that is its price
    var sts = Array.isArray(sp.stats) ? sp.stats : [], sb = el('div', 'sys-list-stats');
    sb.appendChild(el('span', 'sys-num-cap', 'Stats'));
    sts.forEach(function(s0, si) {
        var s = s0 && typeof s0 === 'object' ? s0 : {}, sr = el('div', 'sys-flags sys-list-stat'); sr.dataset.si = String(si);
        var ki = input('sys-list-statkey field', typeof s.key === 'string' ? s.key : '', 'The stat’s key: a letter, then letters, digits and _ (up to 24); not a word formulas already use (count, qty, on, has, lvl, paid, row; max, cur, ranks, base; a function or reserved word such as floor, and, true). The key is the stat’s identity: renaming or removing it drops its values at Save. A column reads it as Row.key, any formula as List.key (the list\u2019s total)', 'Key'); ki.maxLength = 24; sr.appendChild(ki);
        sr.appendChild(input('sys-list-statlabel field', typeof s.label === 'string' ? s.label : '', 'The stat’s name on the sheet (blank: its key)', 'Label'));
        var kS = el('select', 'sys-list-statkind'); kS.title = 'Number: each item holds a number. Choice: each item picks one of named options (Strength = ST), and formulas read that option\u2019s value';   // Stage 6 F5a2
        [['', 'Number'], ['pick', 'Choice']].forEach(function(o) { var ko = el('option', null, o[1]); ko.value = o[0]; if ((s.kind === 'pick' ? 'pick' : '') === o[0]) ko.selected = true; kS.appendChild(ko); }); sr.appendChild(kS);
        if (s.kind === 'pick') {
            sr.appendChild(input('sys-list-statopts field', (Array.isArray(s.opts) ? s.opts : []).map(function(o) { return o && o.label === o.name ? o.label : (o ? o.label + ' = ' + o.name : ''); }).join(', '), 'The options, separated by commas: a label = the number it reads (Strength = ST, Dexterity = DX); a label alone reads the field of that key. An item stores the label, never the name', 'Options (Strength = ST, Dexterity = DX)'));
            var pdS = el('select', 'sys-list-statpdef'); pdS.title = 'What an item without its own choice reads'; var pd0 = el('option', null, 'No default'); pd0.value = ''; pdS.appendChild(pd0);
            (Array.isArray(s.opts) ? s.opts : []).forEach(function(o) { if (!o || typeof o.label !== 'string' || !o.label) return; var po = el('option', null, o.label); po.value = o.label; if (typeof s.def === 'string' && s.def.toLowerCase() === o.label.toLowerCase()) po.selected = true; pdS.appendChild(po); }); sr.appendChild(pdS);
        } else {
            sr.appendChild(numField('sys-list-statdef', typeof s.def === 'number' ? s.def : '', 'What an item without its own value reads (blank: 0)', 'default', 'any'));
            sr.appendChild(input('sys-list-statnames field', Array.isArray(s.labels) ? s.labels.join(', ') : '', 'Names for the values 0, 1, 2… separated by commas (E, A, H, VH): a row shows the name, Items a dropdown; the value stays a number', 'Value names (optional)'));
        }
        sr.appendChild(checkLabel('sys-list-statshow', s.show === true && s.hide !== true, 'On the row', 'Shown beside the name on each row (a column in a rich table); every stat that is not Hidden reads in the row’s 📝 line'));
        sr.appendChild(checkLabel('sys-list-stathide', s.hide === true, 'Hidden', 'A figure the row only works with, such as a cost per level. It is never shown on a row or in its 📝 details. Formulas still read it, and ✎ still shows it. It is no secret: use a GM-only list for that'));
        [['statup', '▲', 'Move up'], ['statdown', '▼', 'Move down'], ['statdel', '×', 'Remove this stat (Save drops its values)']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = bd[0]; bb.title = bd[2]; sr.appendChild(bb); });
        sb.appendChild(sr);
    });
    var sadd = el('button', 'tool ghost sys-btn sys-list-statadd', '+ Stat'); sadd.dataset.act = 'statadd'; sadd.disabled = sts.length >= LIMITS.listStats; sadd.title = sadd.disabled ? 'At most ' + LIMITS.listStats + ' stats a list' : 'A number each item of this list carries (Acc, Wt, Cost), set on the item in Items'; sb.appendChild(sadd);
    if (sts.length) { var pr = el('label', 'sys-num sys-price-box'), ps = el('select', 'sys-list-price'); pr.appendChild(el('span', 'sys-num-cap', 'Price')); ps.title = 'A row records it as Paid when added: what one cost (yours to correct on the sheet)'; priceOptions(ps, sp); pr.appendChild(ps); sb.appendChild(pr); }
    card.appendChild(sb);
    // Stage 6 F5a1: the list's columns — a formula worked out for each row (Row.lvl, Row.<stat>, another column), six at most — and the names it offers
    var cls = Array.isArray(sp.cols) ? sp.cols : [], cb2 = el('div', 'sys-list-cols');
    cb2.appendChild(el('span', 'sys-num-cap', 'Columns'));
    cls.forEach(function(c0, ci) {
        var cc = c0 && typeof c0 === 'object' ? c0 : {}, cr = el('div', 'sys-flags sys-list-col'); cr.dataset.ci = String(ci);
        var ckI = input('sys-list-colkey field', typeof cc.key === 'string' ? cc.key : '', 'The column\u2019s key, as a stat\u2019s: a letter, then letters, digits and _ (up to 24); not a stat\u2019s key of this list or a word formulas already use. Totals read it as List.key', 'Key'); ckI.maxLength = 24; cr.appendChild(ckI);
        cr.appendChild(input('sys-list-collabel field', typeof cc.label === 'string' ? cc.label : '', 'The column\u2019s name on the sheet (blank: its key)', 'Label'));
        var cfI = input('sys-list-colformula field', typeof cc.formula === 'string' ? cc.formula : '', 'Worked out for each row, no dice: Row.lvl, Row.qty, Row.on, Row.has, Row.paid, Row.<stat> and Row.<another column> read the row; any other name reads the character', 'Formula (Row.lvl * 2 + Row.Rel)'); cfI.maxLength = LIMITS.formula; cr.appendChild(cfI);
        var cuI = input('sys-list-colunit field', typeof cc.unit === 'string' ? cc.unit : '', 'A unit after the value (pts, lb)', 'Unit'); cuI.maxLength = LIMITS.unit; cr.appendChild(cuI);
        cr.appendChild(input('sys-list-colnames field', Array.isArray(cc.labels) ? cc.labels.join(', ') : '', 'Names for the values 0, 1, 2\u2026 separated by commas: the row shows the name, formulas read the number', 'Value names (optional)'));
        cr.appendChild(checkLabel('sys-list-colhide', cc.hide === true, 'Hidden', 'Worked out (for totals and other columns) but not shown on the row'));
        cr.appendChild(checkLabel('sys-list-colfoot', cc.foot === true, 'Total', 'Its total shows under the list'));
        [['colup', '\u25b2', 'Move up'], ['coldown', '\u25bc', 'Move down'], ['coldel', '\u00d7', 'Remove this column']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = bd[0]; bb.title = bd[2]; cr.appendChild(bb); });
        cb2.appendChild(cr);
    });
    var cadd = el('button', 'tool ghost sys-btn sys-list-coladd', '+ Column'); cadd.dataset.act = 'coladd'; cadd.disabled = cls.length >= LIMITS.listCols; cadd.title = cadd.disabled ? 'At most ' + LIMITS.listCols + ' columns a list' : 'A formula worked out for each row (a skill\u2019s cost from its level, a weapon\u2019s to-hit)'; cb2.appendChild(cadd);
    // Stage 6 HUD R2: the list's counters — a whole number each row keeps (Charges, Hits), four at most: its key (Row.<key>), label, start and most
    var ctsL = Array.isArray(sp.counters) ? sp.counters : [];
    cb2.appendChild(el('span', 'sys-num-cap', 'Counters'));
    ctsL.forEach(function(t0, ti) {
        var tt = t0 && typeof t0 === 'object' ? t0 : {}, rw = el('div', 'sys-flags sys-list-ct'); rw.dataset.ti = String(ti);
        var tk = input('sys-list-ctkey field', typeof tt.key === 'string' ? tt.key : '', 'Its name in formulas: Row.<key> (Charges, Hits)', 'Key'); tk.maxLength = 24; rw.appendChild(tk);
        var tl = input('sys-list-ctlabel field', typeof tt.label === 'string' ? tt.label : '', 'What the row shows (blank: the key)', 'Label'); tl.maxLength = LIMITS.label; rw.appendChild(tl);
        var tdf = el('input', 'field sys-list-ctdef'); tdf.type = 'number'; tdf.min = '0'; tdf.step = '1'; tdf.value = typeof tt.def === 'number' ? String(tt.def) : ''; tdf.placeholder = 'Starts at 0'; tdf.title = 'Where a new row starts'; rw.appendChild(tdf);
        var tmx = input('sys-list-ctmax field', typeof tt.max === 'string' ? tt.max : '', 'Its most, worked out for each row (no dice): 20, Row.Shots; empty: no most', 'Most (e.g. Row.Shots)'); tmx.maxLength = LIMITS.formula; rw.appendChild(tmx);
        [['ctup', '\u25b2', 'Move up'], ['ctdown', '\u25bc', 'Move down'], ['ctdel', '\u00d7', 'Remove this counter']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = bd[0]; bb.title = bd[2]; rw.appendChild(bb); });
        cb2.appendChild(rw);
    });
    var tadd = el('button', 'tool ghost sys-btn sys-list-ctadd', '+ Counter'); tadd.dataset.act = 'ctadd'; tadd.disabled = ctsL.length >= LIMITS.rowCounters; tadd.title = tadd.disabled ? 'At most ' + LIMITS.rowCounters + ' counters a list' : 'A number each row keeps and shows with \u2212 and + (a weapon\u2019s Charges, its Hits)'; cb2.appendChild(tadd);
    // Stage 6 F5b: the list's rolls — a button on each row, the formula rolled with the row's names (dice allowed), four at most
    var rls = Array.isArray(sp.rolls) ? sp.rolls : [];
    cb2.appendChild(el('span', 'sys-num-cap', 'Rolls'));
    rls.forEach(function(r0, ri) {
        var rr = r0 && typeof r0 === 'object' ? r0 : {}, rw = el('div', 'sys-flags sys-list-roll'); rw.dataset.ri = String(ri);
        var rl = input('sys-list-rolllabel field', typeof rr.label === 'string' ? rr.label : '', 'The button\u2019s name on each row (Attack, Check)', 'Label'); rl.maxLength = LIMITS.label; rw.appendChild(rl);
        var rApply = Array.isArray(rr.apply), rk = el('select', 'sys-list-rollkind'); rk.title = 'Roll: dice for the row. Apply: moves pools or numbers by an amount the row works out (Apply costs: FP \u2212 Row.FPCost)';   // Stage 6 HUD H7b
        [['roll', 'Roll'], ['apply', 'Apply']].forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; rk.appendChild(op); }); rk.value = rApply ? 'apply' : 'roll'; rw.appendChild(rk);
        var actsL = Array.isArray(acts) ? acts : [];   // turn-based combat T1: what one press costs
        if (actsL.length || rr.cost) { var rco = el('select', 'sys-list-rollcost'); rco.title = 'What one press costs in turn-based combat: one of the actions a turn allows'; var rcOpts = [['', 'Costs nothing']].concat(actsL.map(function(a) { return [a.key, 'Costs: ' + (a.label || a.key)]; })); if (rr.cost && !actsL.some(function(a) { return a.key.toLowerCase() === String(rr.cost).toLowerCase(); })) rcOpts.push([rr.cost, 'Costs: ' + rr.cost + ' (no such action)']); rcOpts.forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; rco.appendChild(op); }); rco.value = rr.cost || ''; rw.appendChild(rco); }
        if (rApply) { cb2.appendChild(rw); listApplyEditor(cb2, rr, ri, 'apply', sp, targets); return; }
        var rf = input('sys-list-rollformula field', typeof rr.formula === 'string' ? rr.formula : '', 'Rolled for the row: dice allowed; Row.lvl, Row.<stat>, Row.<column> read the row, any other name the character (3d6 <= Row.Skill, d20 + Row.Hit)', 'Formula (d20 + Row.Hit)'); rf.maxLength = LIMITS.formula; rw.appendChild(rf);
        rw.appendChild(checkLabel('sys-list-dmg', rr.dmg === true, 'Damage', 'A damage roll: its card in Table Chat takes the damage colour, a larger total and a damage tag'));   // chat cards (owner 2026-09-27)
        [['rollup', '\u25b2', 'Move up'], ['rolldown', '\u25bc', 'Move down'], ['rolldel', '\u00d7', 'Remove this roll']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = bd[0]; bb.title = bd[2]; rw.appendChild(bb); });
        cb2.appendChild(rw);
        var ndRow = el('div', 'sys-flags sys-list-needsrow'); ndRow.dataset.ri = String(ri);   // Stage 6 HUD R2b: what it needs, then its consequences
        var ndIn = input('sys-list-needs field', typeof rr.needs === 'string' ? rr.needs : '', 'Rolled only while this is true for the row (no dice): Row.Charges >= 1, Row.Hits > 0; empty: always', 'Needs (e.g. Row.Charges >= 1)'); ndIn.maxLength = LIMITS.formula; ndRow.appendChild(ndIn);
        var ndTx = input('sys-list-needstext field', typeof rr.needsText === 'string' ? rr.needsText : '', 'What the greyed button says when it cannot roll', 'Out of charges'); ndTx.maxLength = LIMITS.label; ndRow.appendChild(ndTx);
        var mfL = input('sys-list-malf field', typeof rr.malf === 'string' ? rr.malf : '', 'Malf: a natural total (the dice alone) at or past this malfunctions \u2014 a failure, and its On malfunction changes (no dice; Row.Malf reads the row)', 'Malf (Row.Malf)'); mfL.maxLength = LIMITS.formula; ndRow.appendChild(mfL);   // Stage 6 HUD R3
        cb2.appendChild(ndRow);
        listApplyEditor(cb2, rr, ri, 'then', sp, targets);
    });
    var radd = el('button', 'tool ghost sys-btn sys-list-rolladd', '+ Roll'); radd.dataset.act = 'rolladd'; radd.disabled = rls.length >= LIMITS.rowRolls; radd.title = radd.disabled ? 'At most ' + LIMITS.rowRolls + ' rolls a list' : 'A button on each row that rolls this formula with the row\u2019s names (a weapon\u2019s Attack, a skill\u2019s Check)'; cb2.appendChild(radd);
    cb2.appendChild(el('div', 'sys-note sys-list-names', listNamesText(f.key, sp)));
    card.appendChild(cb2);
    return card;
}
// F5a1: the names a list offers formulas, as one line of text for its card (its key as typed)
function listNamesText(key, sp) {
    var k = String(key || 'List'), own = [];
    if (k.indexOf('.') >= 0) return 'A list whose key has a dot has no names formulas can read (they would read ' + k.split('.')[0] + '.\u2026): give it a key without one.';   // owed review F5a1#6
    (Array.isArray(sp.stats) ? sp.stats : []).concat(Array.isArray(sp.cols) ? sp.cols : []).forEach(function(x) { if (x && typeof x.key === 'string' && x.key) own.push(x.key); });
    return 'Formulas read ' + k + '.count, ' + k + '.qty' + (sp.price ? ', ' + k + '.paid' : '') + own.map(function(w) { return ', ' + k + '.' + w; }).join('') + ' (the list\u2019s totals)' + (sp.on ? '; ' + k + '.on.\u2026 the same over the rows switched on' : '') + '; ' + k + '.<key>.lvl (and .qty, .on, .has' + (own.length ? ', a stat or a column' : '') + ') one row by its item\u2019s key. A column or a roll reads its row as Row.lvl, Row.qty, Row.on, Row.has, Row.paid' + (own.length ? ', Row.' + own.join(', Row.') : '') + '.';
}
function checkLabel(cls, on, text, title) { var l = el('label', 'sys-check'), cb = el('input', cls); cb.type = 'checkbox'; cb.checked = !!on; l.appendChild(cb); l.appendChild(document.createTextNode(' ' + text)); if (title) l.title = title; return l; }
function listOfCard(target) { var cd = target && target.closest ? target.closest('.sys-list-card') : null; if (!cd) return null; return (draft.fields || []).find(function(x) { return x.id === cd.dataset.lid; }) || null; }
// F4c1 review: a stat's key as it is typed. The price follows its OWN stat only (the first stat holding its key, as Save reads it), never another
// stat typed through its spelling (cr on the way to crit); the price stat's key cleared to retype it leaves the price blank and remembers which
// stat it was, until a price is chosen or a stat added, moved or removed
var _priceAt = new WeakMap();
function statKeyInput(lsp, stL, sti, raw) {
    var stD = stL[sti], pl = typeof lsp.price === 'string' ? lsp.price.toLowerCase() : '', own = -1;
    if (pl) { for (var q = 0; q < stL.length; q++) if (stL[q] && typeof stL[q].key === 'string' && stL[q].key.toLowerCase() === pl) { own = q; break; } }
    else if (lsp.price === '' && _priceAt.get(lsp) === sti) own = sti;
    stD.key = String(raw).trim().slice(0, 24);
    if (own === sti) { lsp.price = stD.key; _priceAt.set(lsp, sti); }
}
function priceOptions(sel, sp) {   // F4c1: the Price choices — No price, then each stat by its key (kept up to date as a key is typed)
    sel.textContent = '';
    var pl = typeof sp.price === 'string' ? sp.price.toLowerCase() : '', none = el('option', null, 'No price'); none.value = ''; sel.appendChild(none);
    (Array.isArray(sp.stats) ? sp.stats : []).forEach(function(s) { if (!s || typeof s !== 'object' || typeof s.key !== 'string' || !s.key || s.kind === 'pick') return; var o = el('option', null, s.label && s.label !== s.key ? s.label + ' (' + s.key + ')' : s.key); o.value = s.key; if (pl && s.key.toLowerCase() === pl) o.selected = true; sel.appendChild(o); });
}
// Stage 6 HUD H7b: a list roll of the Apply kind — its move/remove buttons, then its changes (as the Rolls tab's, the amount reading Row.*); the
// selects are built with el only (the Lists card's test slice injects no select helper)
function listApplyEditor(box, rr, ri, key, sp, targets) {   // key (R2b): 'apply' (an apply action's changes) or 'then' (a roll's consequences, each with its When); sp: the list's options (its counters join the targets); targets: the pools and numbers of the draft (renderLists)
    key = key === 'then' ? 'then' : 'apply';
    var rw0 = box.lastChild;
    if (key === 'apply') [['rollup', '\u25b2', 'Move up'], ['rolldown', '\u25bc', 'Move down'], ['rolldel', '\u00d7', 'Remove this action']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = bd[0]; bb.title = bd[2]; rw0.appendChild(bb); });
    targets = Array.isArray(targets) ? targets : []; var list = Array.isArray(rr[key]) ? rr[key] : [], ctrs = sp && Array.isArray(sp.counters) ? sp.counters.filter(function(t) { return t && typeof t.key === 'string' && t.key; }) : [];
    var sel = function(cls, opts, val, title) { var s = el('select', cls); s.title = title; opts.forEach(function(o) { var op = el('option', null, o[1]); op.value = o[0]; s.appendChild(op); }); s.value = val; return s; };
    list.forEach(function(ch0, ai) {
        var ch = ch0 && typeof ch0 === 'object' ? ch0 : {}, rw = el('div', 'sys-flags sys-list-applyrow'); rw.dataset.ri = String(ri); rw.dataset.ai = String(ai); rw.dataset.k = key;
        if (key === 'then') rw.appendChild(sel('sys-list-applywhen', [['', 'Always'], ['hit', 'On success'], ['miss', 'On failure'], ['malf', 'On malfunction']], ch.when || '', 'When the roll makes this change: always, or only when its test succeeds or fails'));
        var opts = [['', 'Pick a pool, number or counter\u2026']].concat(targets.map(function(f) { return [f.id, (f.label || f.key || f.id) + (f.kind === 'resource' ? ' (pool)' : '')]; }), ctrs.map(function(t) { return ['c:' + t.key, 'Counter: ' + (t.label || t.key)]; })); if (ch.f && !targets.some(function(f) { return f.id === ch.f; })) opts.push([ch.f, 'A field that is gone']); if (ch.c && !ctrs.some(function(t) { return t.key === ch.c; })) opts.push(['c:' + ch.c, 'A counter that is gone']);
        rw.appendChild(sel('sys-list-applytarget', opts, ch.c ? 'c:' + ch.c : (ch.f || ''), 'What this change moves: a pool\u2019s current value, a number, or one of the row\u2019s counters'));
        rw.appendChild(sel('sys-list-applyop', [['sub', 'Subtract'], ['add', 'Add'], ['set', 'Set to']], ch.set ? 'set' : ch.add ? 'add' : 'sub', 'Subtract (a cost) or add; never past the field\u2019s min and max'));
        var fm = input('sys-list-applyformula field', typeof ch.formula === 'string' ? ch.formula : '', 'The amount for the row: no dice; Row.lvl, Row.<stat>, Row.<column> read the row (Row.FPCost)', 'Amount (Row.FPCost)'); fm.maxLength = LIMITS.formula; rw.appendChild(fm);
        [['lapplyup', '\u25b2', 'Move up'], ['lapplydown', '\u25bc', 'Move down'], ['lapplydel', '\u00d7', 'Remove this change']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = bd[0]; bb.title = bd[2]; rw.appendChild(bb); });
        box.appendChild(rw);
    });
    var addB = el('button', 'tool ghost sys-btn sys-list-applyadd', key === 'then' ? '+ Then\u2026' : '+ Change'); addB.dataset.act = 'lapplyadd'; addB.dataset.ri = String(ri); addB.dataset.k = key; addB.disabled = list.length >= LIMITS.applyChanges; addB.title = addB.disabled ? 'At most ' + LIMITS.applyChanges + ' changes an action' : 'Another pool or number this button moves'; box.appendChild(addB);
}
function renderCombat() {
    var box = ui('sysCombatBox'); if (!box) return; box.textContent = '';
    var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' });
    if (!cm.cover || typeof cm.cover !== 'object') cm.cover = { on: false, style: 'graded' };
    box.appendChild(labeledSelect('sys-combat-auto', 'Blast automation', [['full', 'Full auto — roll & apply'], ['roll', 'Roll to chat; apply by hand'], ['measure', 'Measure only']], cm.blastAuto, 'What happens when a blast is thrown: full = roll damage and apply it to tokens in range; roll = post the roll for a human to apply; measure = area only.'));
    lineUnder(box, 'What happens when a blast is thrown.');
    box.appendChild(labeledSelect('sys-combat-roller', 'Who rolls', [['owner', 'The character\'s owner'], ['gm', 'Always the GM']], cm.blastRoller, 'Who makes a thrown blast\'s rolls: the owning player, or always the GM.'));
    lineUnder(box, 'Who makes a thrown blast\u2019s rolls.');
    var resFields = (draft.fields || []).filter(function(f) { return f.kind === 'resource'; });
    box.appendChild(labeledSelect('sys-combat-hp', 'Damage subtracts from', [['', resFields.length ? '— none —' : '— add a resource field —']].concat(resFields.map(function(f) { return [f.id, f.label || f.key]; })), cm.hpResource, 'Which resource full-auto damage reduces (the "health" resource).'));
    lineUnder(box, 'The pool that Full auto damage is taken from.');
    box.appendChild(labeledSelect('sys-combat-cover-on', 'Cover from blockers', [['off', 'Off'], ['on', 'On — the ruler, blasts and target marks']], cm.cover.on ? 'on' : 'off', 'When on, the ruler between two character tokens, a blast\'s labels and target marks show cover, read from the map\'s pieces: its sight-blockers (walls, pillars, closed doors, filled cells) and pieces set to give cover you can see over (a crate, a low wall). It changes no roll; with Full auto, the settings below say what a blast does behind each grade of cover, and a blast thrown into a wall or a closed door goes off in front of it.'));
    lineUnder(box, 'Cover is read from the map\u2019s walls and cover pieces. It changes no roll.');
    box.appendChild(labeledSelect('sys-combat-cover-style', 'Cover grades', [['graded', 'Graded — half / three-quarters / total'], ['binary', 'Simple — cover / none']], cm.cover.style === 'binary' ? 'binary' : 'graded', 'Graded uses the corner rule for D&D-style tiers; Simple reports only whether there is cover (for systems that treat cover as one flat penalty or DR). The tier names are built in; custom thresholds come later.'));
    if (cm.cover.on) box.appendChild(labeledSelect('sys-combat-height-rule', 'Height and cover', [['', 'Flat — height changes no cover'], ['clears', 'Height clears low cover — from above; from below it hides the target']], cm.height && typeof cm.height === 'object' && cm.height.rule === 'clears' ? 'clears' : '', 'With Token elevation on, looked at from higher than a see-over piece (a crate, a low wall), it gives no cover; from below the target it hides them (total cover). Walls block at any height. A piece\u2019s height is in its Properties; a see-over piece with none is 1 yard tall.'));   // item 19 H1 (the owner's answer: the handbook's rule, per system)
    if (cm.cover.on) lineUnder(box, 'This needs Token elevation on. A piece\u2019s height is in its Properties.');
    if (cm.cover.on) {   // cover follow-ups (owner 2026-09-28): what a full-auto blast does behind each grade
        var cgs = cm.cover.style === 'binary' ? [['cover', 'Blast behind cover'], ['total', 'Blast behind total cover']] : [['half', 'Blast behind half cover'], ['threeq', 'Blast behind three-quarters cover'], ['total', 'Blast behind total cover']];
        cgs.forEach(function(g) { var cur = cm.cover.area && typeof cm.cover.area === 'object' && Object.prototype.hasOwnProperty.call(cm.cover.area, g[0]) ? cm.cover.area[g[0]] : 'full'; var ls = labeledSelect('sys-combat-cover-area', g[1], [['full', 'Full damage'], ['half', 'Half damage'], ['none', 'No damage']], cur === 'half' || cur === 'none' ? cur : 'full', 'With Full auto blasts, what the rolled damage does to a token behind this much cover (measured from the blast\u2019s centre).'); ls.lastChild.dataset.grade = g[0]; box.appendChild(ls); });
    }
    box.appendChild(labeledSelect('sys-combat-checks', 'Roll outcomes', [['', 'Success or failure by the margin'], ['under3d6', '3d6 roll-under criticals']], cm.checks === 'under3d6' ? 'under3d6' : '', 'How a check reads. 3d6 roll-under (a roll of exactly 3d6 against a target): 3\u20134 are a critical success, 5 at a target of 15+, 6 at 16+; 17 fails (critically at 15 or less), 18 or failing by 10+ is a critical failure.'));   // Stage 6 F8
    lineUnder(box, 'How a check against a target reads its dice.');
    rangeBox(box, cm);   // range penalties R1: the system's range rule, under cover
    heightBox(box, cm);   // item 19 H2: the system's height modifier, under range
    lightBox(box, cm);   // lighting L4: the system's light rules
    sensesBox(box, cm);   // senses S2a: the system's senses
    turnBox(box, cm);   // turn-based combat T1: the system's turn rules, under the blast and cover settings
    initBox(box, cm);   // initiative O2: how ties of initiative break
    postureBox(box, cm);   // conditions C3: the system's own postures, at the card's foot
}
// Initiative O2 (docs/TURN_ORDER_PLAN.md; the owner's note: 3d6 systems order by Basic Speed and roll only to settle ties, d20 systems roll and
// roll again for ties): the Combat card's Initiative box — up to three tie steps, each a formula: with no dice a value (the higher first),
// with dice a roll made only for the rows still tied. Every text lands as a value or a text node. Save cleans them; refreshErrors says what
// it would drop
// [sinkcheck:initbox-start]
function initBox(box, cm) {
    var ir = cm.initiative && typeof cm.initiative === 'object' && !Array.isArray(cm.initiative) ? cm.initiative : {}, ties = Array.isArray(ir.ties) ? ir.ties : [], wrap = el('div', 'sys-init');
    wrap.appendChild(el('div', 'sys-light-head', 'Initiative'));
    wrap.appendChild(el('div', 'sys-note', 'The combat roster orders a fight by the roll you tick Initiative on (the Rolls tab): one with no dice is worked out (Basic Speed), one with dice rolled (d20 + DEX). When two tie, the steps below settle it in turn: a value puts the higher first (DX); a roll (1d6, d20) is made only for those still tied, and made again while they stay tied. They read only what players can read: the order is public. Rolled again every round has everyone roll it again when a new round begins; a Sides roll (1d6) plays the players against the rest each round, the higher side first.'));
    var r = el('div', 'sys-flags sys-init-ties'); r.appendChild(el('span', 'sys-num-cap', 'Ties go to the higher'));
    for (var i = 0; i < LIMITS.initTies; i++) { var ti = input('sys-init-tie field', typeof ties[i] === 'string' ? ties[i] : '', i === 0 ? 'The first step for a tie: a value (DX) or a roll (1d6)' : 'If still tied: a value or a roll', i === 0 ? 'e.g. DX' : i === 1 ? 'then, e.g. 1d6' : 'then\u2026'); ti.maxLength = LIMITS.formula; ti.dataset.ti = String(i); r.appendChild(ti); }
    wrap.appendChild(r);
    // initiative O4: rolled again every round (a tick), and a sides roll (the players' characters against everyone else, each round)
    var r2 = el('div', 'sys-flags sys-init-more'), evL = el('label', 'sys-hover'), evC = el('input', 'sys-init-every'); evC.type = 'checkbox'; evC.checked = ir.every === true; evL.appendChild(evC); evL.appendChild(document.createTextNode(' Rolled again every round')); evL.title = 'When a new round begins, everyone in the fight rolls the initiative roll again and the order re-sorts (a row with no character keeps its number)'; r2.appendChild(evL);
    r2.appendChild(el('span', 'sys-num-cap', 'Sides roll')); var sdI = input('sys-init-side field', typeof ir.side === 'string' ? ir.side : '', 'Side initiative: the players\u2019 characters and everyone else each roll this when the fight starts and at every new round, the higher side first, each side in its own order. It reads no one\u2019s values. Blank: no sides', 'e.g. 1d6'); sdI.maxLength = LIMITS.formula; r2.appendChild(sdI);
    wrap.appendChild(r2);
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
    if (c.indexOf('sys-init-every') >= 0) {
        var cmE = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }), irV = cmE.initiative && typeof cmE.initiative === 'object' && !Array.isArray(cmE.initiative) ? cmE.initiative : (cmE.initiative = {});
        if (t.checked === true) irV.every = true; else { delete irV.every; if (!Object.keys(irV).length) delete cmE.initiative; }
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
function budgetDraft() { return Array.isArray(draft.budgets) ? draft.budgets : (draft.budgets = []); }
function renderBudgets() {
    var box = ui('sysBudgets'); if (!box) return; box.textContent = '';
    var arr = Array.isArray(draft.budgets) ? draft.budgets : [], wrap = el('div', 'sys-budgets');
    wrap.appendChild(el('div', 'sys-light-head', 'Point budgets'));
    wrap.appendChild(el('div', 'sys-note', 'A budget holds the points a character has against the points it has spent. Each is a formula, such as Points, or Traits.paid + Skills.paid. The sheet shows spent of has under its head. When a player’s own change would take their character over, the budget refuses it, or lets it through with a note to them and to you. Your own changes are never refused.'));
    arr.forEach(function(b0, i) {
        var b = b0 && typeof b0 === 'object' ? b0 : {}, rw = el('div', 'sys-flags sys-bud-row'); rw.dataset.bi = String(i);
        var n = input('sys-bud-name field', typeof b.name === 'string' ? b.name : '', 'Its name on the sheet: Character points, Gear', 'Name'); n.maxLength = LIMITS.name; rw.appendChild(n);
        [['has', 'Has', 'The points a character has: a number or a formula, such as Points, or 100 + Flaws.paid', 'e.g. Points'], ['spent', 'Spent', 'The points a character has spent: a formula, such as Traits.paid + Skills.paid', 'e.g. Traits.paid']].forEach(function(g) {
            var l = el('label', 'sys-combat-item sys-bud-f'); l.appendChild(el('span', 'sys-num-cap', g[1]));
            var fi = input('sys-bud-' + g[0] + ' field', typeof b[g[0]] === 'string' ? b[g[0]] : '', g[2], g[3]); fi.maxLength = LIMITS.formula; l.appendChild(fi); rw.appendChild(l);
        });
        rw.appendChild(labeledSelect('sys-bud-over', 'When over', BUDGET_OVER_OPTS, b.over === 'warn' || b.over === 'off' ? b.over : 'refuse', 'What happens when a player’s own change would take their character over this budget. Refuse stops the change. Warn lets it through with a note to them and to you. Only show it does not check'));
        rw.appendChild(labeledSelect('sys-bud-when', 'Watched', BUDGET_WHEN_OPTS, b.when === 'making' || b.when === 'play' ? b.when : 'always', 'When the budget is watched: always, only while a player is making the character, or only once it is in play'));
        [['up', '▲', 'Move up'], ['down', '▼', 'Move down'], ['del', '×', 'Remove']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = 'bd' + bd[0]; bb.title = bd[2]; rw.appendChild(bb); });
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
// Conditions C3 (docs/CONDITIONS_PLAN.md): the system's own postures on the Combat card — how a token can stand, in order. None: the seven.
// Name your own starts from the seven (their ids kept, so a website sheet still sets them). Each row a name, its chip's tag, a "smaller target"
// tick (-2 to a foe's ranged roll, shown only: the owner's answer of 2026-09-30), notes and changes as an effect's; the first is how a token
// stands with none set and takes neither. Every text lands as a value or a text node. Save cleans them; refreshErrors says what it would drop
// [sinkcheck:posturebox-start]
function postureDraft() { var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }); return Array.isArray(cm.postures) ? cm.postures : (cm.postures = []); }
function postureBox(box, cm) {
    var arr = Array.isArray(cm.postures) ? cm.postures : [], wrap = el('div', 'sys-postures'), targets = fxTargets(draft);
    wrap.appendChild(el('div', 'sys-light-head', 'Postures'));
    wrap.appendChild(el('div', 'sys-note', arr.length ? 'How a token can stand, in order. The first is how a token stands with none set; formulas read Posture as each one\u2019s place (0 for the first), so moving one changes what they read. A posture\u2019s changes apply to the character while its token takes it; a smaller target shows \u22122 to a foe\u2019s ranged roll on the ruler and the token (never worked into a roll).' : 'Your tokens take the seven built-in postures: Standing, Crouching, Sitting, Kneeling, Crawling, Lying prone (face down) and Lying face up, each but Standing a smaller target (\u22122 to a foe\u2019s ranged roll, shown only). Name your own to rename, reorder or add to them, each with changes like an effect\u2019s.'));
    arr.forEach(function(p0, i) {
        var p = p0 && typeof p0 === 'object' ? p0 : {}, row = el('div', 'sys-row sys-posture-row'); row.dataset.pi = String(i);
        var top = el('div', 'sys-flags');
        var n = input('sys-posture-name field', typeof p.name === 'string' ? p.name : '', i === 0 ? 'How a token stands with no posture set (Standing)' : 'Its name on a token\u2019s menu and the sheet', 'Name'); n.maxLength = LIMITS.name; top.appendChild(n);
        var tg = input('sys-posture-tag field', typeof p.tag === 'string' ? p.tag : '', 'The chip on the token: up to ' + LIMITS.postureTag + ' characters (empty: the name\u2019s first three letters)', 'Tag'); tg.maxLength = 8; top.appendChild(tg);
        if (i > 0) { var sl = el('label', 'sys-hover'), sc = el('input', 'sys-posture-small'); sc.type = 'checkbox'; sc.checked = p.small === true; sl.appendChild(sc); sl.appendChild(document.createTextNode(' Smaller target')); sl.title = 'Ticked: \u22122 to a foe\u2019s ranged roll against a token in this posture, shown on the ruler that ends on it and in its tooltip (never worked into a roll)'; top.appendChild(sl); }
        [['up', '\u25b2', 'Move up'], ['down', '\u25bc', 'Move down'], ['del', '\u00d7', 'Remove this posture']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = 'ps' + bd[0]; bb.title = bd[2]; top.appendChild(bb); });
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
    if (!arr.length) { var own = el('button', 'tool ghost sys-btn sys-posture-own', 'Name your own postures'); own.dataset.act = 'psseven'; own.title = 'Start from the seven built-in postures, their ids kept (a website sheet still sets them): rename, reorder, add, give each changes'; bar.appendChild(own); }
    else {
        var ad = el('button', 'tool ghost sys-btn sys-posture-add', '+ Posture'); ad.dataset.act = 'psadd'; ad.disabled = arr.length >= LIMITS.postures; ad.title = ad.disabled ? 'At most ' + LIMITS.postures : 'Another way to stand, a smaller target to begin with'; bar.appendChild(ad);
        var bk = el('button', 'tool ghost sys-btn sys-posture-clear', 'Back to the seven'); bk.dataset.act = 'psclear'; bk.title = 'Drop this list: your tokens take the seven built-in postures again (a token in a posture of yours stands as the first)'; bar.appendChild(bk);
    }
    wrap.appendChild(bar);
    var err = errorCell('postures'); err.dataset.errFor = 'postures'; wrap.appendChild(err);
    box.appendChild(wrap);
}
function postureRowOf(t) { var arr = postureDraft(), row = t.closest && t.closest('.sys-posture-row'), i = row ? +row.dataset.pi : -1; return i >= 0 && i < arr.length && Math.floor(i) === i && arr[i] && typeof arr[i] === 'object' ? arr[i] : null; }
function onPostureInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-posture-') < 0) return false;
    if (c.indexOf('sys-posture-small') >= 0 || c.indexOf('sys-posture-target') >= 0) return true;   // their change events do the work
    var p = postureRowOf(t); if (!p) return true;
    if (c.indexOf('sys-posture-name') >= 0) p.name = t.value.slice(0, LIMITS.name);
    else if (c.indexOf('sys-posture-tag') >= 0) { if (t.value.trim()) p.tag = t.value.slice(0, 8); else delete p.tag; }
    else if (c.indexOf('sys-posture-notes') >= 0) { if (t.value.trim()) p.notes = t.value.slice(0, LIMITS.postureNotes); else delete p.notes; }
    else if (c.indexOf('sys-posture-amt') >= 0) { var ln = t.closest('.sys-posture-mod'), m = ln && Array.isArray(p.mods) ? p.mods[+ln.dataset.mi] : null; if (!m || typeof m !== 'object') return true; var nv = Number(t.value); m.v = t.value === '' || !isFinite(nv) ? 0 : nv; }
    else return true;
    markDirty(); patchErrors(); return true;
}
function onPostureChange(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-posture-') < 0) return false;
    if (c.indexOf('sys-posture-small') < 0 && c.indexOf('sys-posture-target') < 0) return true;   // the boxes' change events (their input events did the work)
    var p = postureRowOf(t); if (!p) return true;
    if (c.indexOf('sys-posture-small') >= 0) { if (t.checked) p.small = true; else delete p.small; markDirty(); patchErrors(); return true; }
    var ln = t.closest('.sys-posture-mod'), m = ln && Array.isArray(p.mods) ? p.mods[+ln.dataset.mi] : null; if (!m || typeof m !== 'object') return true;
    var tp = String(t.value).split('|'); m.f = tp[0];
    if (tp[1] === 'on') { m.op = 'on'; delete m.v; delete m.part; } else { m.op = 'add'; if (typeof m.v !== 'number') m.v = 1; if (tp[1] === 'max') m.part = 'max'; else delete m.part; }
    markDirty(); renderAll(); return true;
}
function postureClick(b) {
    var mt = /^ps(seven|add|clear|up|down|del|modadd|moddel)$/.exec(b.dataset.act || ''); if (!mt) return false;
    var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' });
    if (mt[1] === 'seven') { cm.postures = DEFAULT_POSTURES.map(function(d) { var o = { id: d.id, name: d.name, tag: d.tag }; if (d.small === true) o.small = true; return o; }); markDirty(); renderAll(); return true; }
    if (mt[1] === 'clear') { delete cm.postures; markDirty(); renderAll(); return true; }
    var arr = postureDraft();
    if (mt[1] === 'add') { if (arr.length >= LIMITS.postures) { toast('At most ' + LIMITS.postures + ' postures.'); return true; } arr.push({ id: uid('p_'), name: '', small: true }); markDirty(); renderAll(); return true; }
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
// Lighting L4: the system's light rules on the Combat card — what it calls a dim and a dark place (the ruler and a target mark show the names)
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
        var n = input('sys-light-pname field', typeof p.name === 'string' ? p.name : '', 'Its name: Torch, Lantern, Glow rod', 'Name'); n.maxLength = LIMITS.label; rw.appendChild(n);
        [['bright', 'Bright to', 'How far it lights brightly (0: a dim light only)'], ['dim', 'Dim to', 'Its outer edge: dim from the bright radius out to here (the same as bright: no dim fringe)']].forEach(function(g) {
            var nl = el('label', 'sys-num'); nl.appendChild(el('span', 'sys-num-cap', g[1]));
            var ni = el('input', 'field sys-light-p' + g[0]); ni.type = 'number'; ni.min = '0'; ni.max = '1000'; ni.step = 'any'; ni.value = typeof p[g[0]] === 'number' ? String(p[g[0]]) : ''; ni.title = g[2]; nl.appendChild(ni); rw.appendChild(nl);
        });
        rw.appendChild(select('sys-light-punit', [['yd', 'yards'], ['ft', 'feet'], ['m', 'metres'], ['cells', 'grid cells']], typeof p.unit === 'string' && Object.prototype.hasOwnProperty.call(LIGHT_UNITS, p.unit) ? p.unit : 'yd', 'What the two radii count in: each map\u2019s scale converts it (a 20 ft torch on 5 ft squares lights 4 squares)'));
        var pk = el('label', 'sys-hover'), pc = el('input', 'sys-light-ppick'); pc.type = 'checkbox'; pc.checked = p.pick === true; pk.appendChild(pc); pk.appendChild(document.createTextNode(' Players may pick')); pk.title = 'Ticked: a player may pick this light for their own token, from its right-click menu (your machine copies it from this list). Unticked: only you set it, in a token\u2019s Properties'; rw.appendChild(pk);
        [['up', '\u25b2', 'Move up'], ['down', '\u25bc', 'Move down'], ['del', '\u00d7', 'Remove']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = 'lp' + bd[0]; bb.title = bd[2]; rw.appendChild(bb); });
        wrap.appendChild(rw);
    });
    var ad = el('button', 'tool ghost sys-btn sys-light-add', '+ Light preset'); ad.dataset.act = 'lpadd'; ad.disabled = arr.length >= LIMITS.lightPresets; ad.title = ad.disabled ? 'At most ' + LIMITS.lightPresets : 'A light of your game: a torch, a lantern, a glow rod'; wrap.appendChild(ad);
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
// Range penalties R1 (docs/RANGE_PLAN.md): the system's range rule on the Combat card — none, a table of distance steps and their modifier, or
// a formula reading Distance — and the unit its distances count in. The ruler and a target mark show the modifier. A formula held as text
// (even empty) is the formula way, anything else the table; the draft keeps what the other way held (_f, _s) until Save, which keeps neither.
// Every text lands as a value or a text node. Save cleans it; refreshErrors says what it would drop
// [sinkcheck:rangebox-start]
function rangeDraft() { var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }); return cm.range && typeof cm.range === 'object' && !Array.isArray(cm.range) ? cm.range : (cm.range = {}); }
function rangeBy(rg) { return !rg || typeof rg !== 'object' || Array.isArray(rg) ? '' : typeof rg.formula === 'string' ? 'formula' : 'table'; }
function rangeBox(box, cm) {
    var rg = cm.range && typeof cm.range === 'object' && !Array.isArray(cm.range) ? cm.range : null, by = rangeBy(rg), wrap = el('div', 'sys-range');
    wrap.appendChild(el('div', 'sys-light-head', 'Range'));
    wrap.appendChild(el('div', 'sys-note', 'Your game\u2019s range penalty: a modifier by how far the target is. The ruler shows it, and each target mark beside its cover and light. A table gives each distance\u2019s modifier (up to that distance; past the last row, its modifier holds); a formula works it out from Distance, in the unit picked here.'));
    var r1 = el('div', 'sys-flags sys-range-top');
    r1.appendChild(labeledSelect('sys-range-by', 'Range penalty', [['', 'None'], ['table', 'By a table'], ['formula', 'By a formula']], by, 'None: no range penalty is shown. A table: a modifier for each distance. A formula: a modifier worked out from Distance.'));
    if (by) r1.appendChild(labeledSelect('sys-range-unit', 'Counts in', [['yd', 'yards'], ['ft', 'feet'], ['m', 'metres'], ['cells', 'grid cells']], typeof rg.unit === 'string' && Object.prototype.hasOwnProperty.call(RANGE_UNITS, rg.unit) ? rg.unit : 'yd', 'What its distances count in: each map\u2019s scale converts it (60 ft on 5 ft squares is 12 squares)'));
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
            var db = el('button', 'tool ghost sys-btn', '\u00d7'); db.dataset.act = 'rgdel'; db.title = 'Remove this step'; rw.appendChild(db);
            wrap.appendChild(rw);
        });
        var ad = el('button', 'tool ghost sys-btn sys-range-add', '+ Step'); ad.dataset.act = 'rgadd'; ad.disabled = st.length >= LIMITS.rangeSteps; ad.title = ad.disabled ? 'At most ' + LIMITS.rangeSteps : 'A distance and its modifier; Save puts the steps in order'; wrap.appendChild(ad);
    }
    var err = errorCell('range'); err.dataset.errFor = 'range'; wrap.appendChild(err);
    box.appendChild(wrap);
}
function onRangeInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-range-') < 0) return false;
    if (c.indexOf('sys-range-by') >= 0 || c.indexOf('sys-range-unit') >= 0) return true;   // their change events do the work
    var rg = rangeDraft();
    if (c.indexOf('sys-range-formula') >= 0) rg.formula = t.value.slice(0, LIMITS.formula);
    else {
        var rw = t.closest('.sys-range-row'), i = rw ? +rw.dataset.ri : -1, s = Array.isArray(rg.steps) && rg.steps[i] && typeof rg.steps[i] === 'object' ? rg.steps[i] : null; if (!s) return true;
        var key = c.indexOf('sys-range-sto') >= 0 ? 'to' : c.indexOf('sys-range-smod') >= 0 ? 'mod' : ''; if (!key) return true;
        var nv = Number(t.value); if (t.value.trim() && isFinite(nv)) s[key] = nv; else delete s[key];
    }
    markDirty(); patchErrors(); return true;
}
function onRangeChange(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-range-') < 0) return false;
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
// Item 19 H2 (the owner's answer, 2026-09-30: a table like the Range box): the Combat card's Height box — a modifier by how much higher the
// roller stands than the target (HeightDiff, negative looking up): a table of signed steps (up to that difference; below the first row its
// modifier, past the last row its modifier) or a formula reading HeightDiff, in yards, feet or metres. Rolls read HeightMod; the ruler and a
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
    wrap.appendChild(el('div', 'sys-note', 'Your game\u2019s height modifier: by how much higher the roller stands than the target (with Token elevation on). Rolls read HeightMod; the ruler between two character tokens and each target mark show it. A table gives each difference\u2019s modifier, lowest first: a difference below 0 is looking up (up to that difference; below the first row its modifier, past the last row its modifier); a formula works it out from HeightDiff.'));
    var r1 = el('div', 'sys-flags sys-height-top');
    r1.appendChild(labeledSelect('sys-height-by', 'Height modifier', [['', 'None'], ['table', 'By a table'], ['formula', 'By a formula']], by, 'None: no height modifier. A table: a modifier for each height difference. A formula: a modifier worked out from HeightDiff.'));
    if (by) r1.appendChild(labeledSelect('sys-height-unit', 'Counts in', [['yd', 'yards'], ['ft', 'feet'], ['m', 'metres']], typeof hg.unit === 'string' && Object.prototype.hasOwnProperty.call(HEIGHT_UNITS, hg.unit) ? hg.unit : 'yd', 'What its differences count in: a token\u2019s elevation is converted into it'));
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
        var n3 = el('label', 'sys-num'); n3.appendChild(el('span', 'sys-num-cap', 'Standing height (' + (St && St.lenUnit() === 'm' ? 'metres' : 'yards') + ')')); r3.appendChild(n3);
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
// [sinkcheck:calendarbox-start]
// Item 20 K1 (docs/CALENDAR_PLAN.md; the owner's answers of 2026-09-30): the system's calendar, the System editor's Calendar tab — a year's
// periods in order (a name, its days, whether it stands outside the month count: a festival week, a holiday), the week's days and which
// one day 1 is, the day's hours, minutes and seconds, the year of day 1 with the label after it and whether years count down, and a leap
// rule. Every text lands as a value or a text node; Save cleans it (calendarcore cleanCalendar) and refreshErrors says what it would drop
function calDraft() { if (!draft.calendar || typeof draft.calendar !== 'object' || Array.isArray(draft.calendar)) draft.calendar = {}; return draft.calendar; }
function calOf() { return draft && draft.calendar && typeof draft.calendar === 'object' && !Array.isArray(draft.calendar) ? draft.calendar : {}; }
function calNum(cls, value, title, min, max, cap) {
    var l = el('label', 'sys-num'); if (cap) l.appendChild(el('span', 'sys-num-cap', cap));
    var n = el('input', 'field ' + cls); n.type = 'number'; n.min = String(min); n.max = String(max); n.step = '1'; n.value = typeof value === 'number' && isFinite(value) ? String(value) : ''; n.title = title;
    l.appendChild(n); return l;
}
function calSums(cal) {   // [the year's length in words, day 1 and a year on as the clock reads them]: the calendar as Save would keep it
    var cc = cleanCalendar(cal), ps = cc && cc.periods ? cc.periods : [], base = 0; ps.forEach(function(p) { base += p.days; });
    if (!ps.length) return ['No periods: the clock counts days (Day 1, Day 2 \u2026).', 'Day 1 reads: ' + fmtWhen(cc, 0) + '.'];
    var ms = ps.filter(function(p) { return !p.extra; }).length, ex = ps.length - ms, lp = cc.leap ? cc.leap.days : 0, y2 = timeOf(cc, { yi: 1, period: 0, pday: 1 });
    return [base + ' days a year' + (lp ? ' (' + (base + lp) + ' in a leap year)' : '') + ': ' + ms + ' month' + (ms === 1 ? '' : 's') + (ex ? ' and ' + ex + ' period' + (ex === 1 ? '' : 's') + ' outside the month count' : '') + '.',
        'Day 1 reads: ' + fmtWhen(cc, 0) + (y2 !== null ? '. A year on: ' + fmtDate(cc, y2) : '') + '.'];
}
function renderCalendar() { var box = ui('sysCalendar'); if (!box) return; var st = box.scrollTop; box.textContent = ''; calendarBox(box, calOf()); box.scrollTop = st; }   // the pane scrolls: a redraw keeps its place
function calendarBox(box, cal) {
    var wrap = el('div', 'sys-cal');
    wrap.appendChild(el('div', 'sys-light-head', 'Calendar'));
    wrap.appendChild(el('div', 'sys-note', 'The calendar your game keeps: its months and other periods, its week, its day and how its years are numbered. With none, a plain count of days of 24 hours.'));
    var pr = el('div', 'sys-flags sys-cal-presets'); pr.appendChild(el('span', 'sys-num-cap', 'Start from'));
    [['twelve', 'Twelve months', 'The real-world year: twelve months, a seven-day week, a leap day in February every fourth year. It replaces what is here.'], ['days', 'A plain count of days', 'No calendar: the clock counts days (Day 1, Day 2 \u2026). It clears what is here.']].forEach(function(p) {
        var b = el('button', 'tool ghost sys-btn sys-cal-preset', p[1]); b.dataset.act = 'calpreset'; b.dataset.preset = p[0]; b.title = p[2]; pr.appendChild(b);
    });
    wrap.appendChild(pr);
    wrap.appendChild(el('div', 'sys-cal-sub', 'Periods, in year order'));
    var ps = Array.isArray(cal.periods) ? cal.periods : [];
    ps.forEach(function(p0, i) {
        var p = p0 && typeof p0 === 'object' ? p0 : {}, rw = el('div', 'sys-flags sys-cal-prow'); rw.dataset.ci = String(i);
        var nm = input('sys-cal-pname field', typeof p.name === 'string' ? p.name : '', 'This period\u2019s name: a month (First, January), a festival week or a holiday', 'Name'); nm.maxLength = CAL_LIMITS.name; rw.appendChild(nm);
        rw.appendChild(calNum('sys-cal-pdays', p.days, 'How many days it holds (1 to ' + CAL_LIMITS.periodDays + ')', 1, CAL_LIMITS.periodDays, i === 0 ? 'Days' : ''));
        var xl = el('label', 'sys-cal-tick'), xc = el('input', 'sys-cal-pextra'); xc.type = 'checkbox'; xc.checked = p.extra === true; xc.title = 'Outside the month count: a festival week or a holiday between months, never numbered as a month';
        xl.appendChild(xc); xl.appendChild(document.createTextNode(' Outside the month count')); rw.appendChild(xl);
        [['up', '\u25b2', 'Move up'], ['down', '\u25bc', 'Move down'], ['del', '\u00d7', 'Remove']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = 'calp' + bd[0]; bb.title = bd[2]; rw.appendChild(bb); });
        wrap.appendChild(rw);
    });
    var pa = el('button', 'tool ghost sys-btn sys-cal-padd', '+ Period'); pa.dataset.act = 'calpadd'; pa.disabled = ps.length >= CAL_LIMITS.periods; pa.title = pa.disabled ? 'At most ' + CAL_LIMITS.periods : 'A month, a festival week or a holiday, at the end of the year'; wrap.appendChild(pa);
    wrap.appendChild(el('div', 'sys-cal-sub', 'The week'));
    var wk = Array.isArray(cal.week) ? cal.week : [];
    wk.forEach(function(w, i) {
        var rw = el('div', 'sys-flags sys-cal-wrow'); rw.dataset.wi = String(i);
        var wi = input('sys-cal-wname field', typeof w === 'string' ? w : '', 'This weekday\u2019s name', 'Day ' + (i + 1)); wi.maxLength = CAL_LIMITS.name; rw.appendChild(wi);
        [['up', '\u25b2', 'Move up'], ['down', '\u25bc', 'Move down'], ['del', '\u00d7', 'Remove']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = 'calw' + bd[0]; bb.title = bd[2]; rw.appendChild(bb); });
        wrap.appendChild(rw);
    });
    var wa = el('button', 'tool ghost sys-btn sys-cal-wadd', '+ Weekday'); wa.dataset.act = 'calwadd'; wa.disabled = wk.length >= CAL_LIMITS.week; wa.title = wa.disabled ? 'At most ' + CAL_LIMITS.week : 'A day of the week, at its end; the week runs on across months and years'; wrap.appendChild(wa);
    if (wk.length) wrap.appendChild(labeledSelect('sys-cal-first', 'Day 1 is a', wk.map(function(w, i) { return [String(i), typeof w === 'string' && w.trim() ? w : 'Day ' + (i + 1)]; }), String(typeof cal.first === 'number' ? cal.first : 0), 'The weekday of the very first day; the week runs on from it'));
    wrap.appendChild(el('div', 'sys-cal-sub', 'The day'));
    var dr = el('div', 'sys-flags sys-cal-day');
    dr.appendChild(calNum('sys-cal-hours', typeof cal.hours === 'number' ? cal.hours : 24, 'Hours in a day (1 to ' + CAL_LIMITS.hours + ')', 1, CAL_LIMITS.hours, 'Hours a day'));
    dr.appendChild(calNum('sys-cal-minutes', typeof cal.minutes === 'number' ? cal.minutes : 60, 'Minutes in an hour (1 to ' + CAL_LIMITS.minutes + ')', 1, CAL_LIMITS.minutes, 'Minutes an hour'));
    dr.appendChild(calNum('sys-cal-seconds', typeof cal.seconds === 'number' ? cal.seconds : 60, 'Seconds in a minute (1 to ' + CAL_LIMITS.seconds + ')', 1, CAL_LIMITS.seconds, 'Seconds a minute'));
    wrap.appendChild(dr);
    wrap.appendChild(el('div', 'sys-cal-sub', 'Years'));
    var yr = el('div', 'sys-flags sys-cal-years');
    yr.appendChild(calNum('sys-cal-one', typeof cal.one === 'number' ? cal.one : 1, 'The year the very first day falls in', -CAL_LIMITS.year, CAL_LIMITS.year, 'Day 1 is in year'));
    var eraL = el('label', 'sys-num'); eraL.appendChild(el('span', 'sys-num-cap', 'After the year'));
    var eraI = input('sys-cal-era field', typeof cal.era === 'string' ? cal.era : '', 'A label after the year\u2019s number (BBY, AR); empty: none', 'e.g. BBY'); eraI.maxLength = CAL_LIMITS.era; eraL.appendChild(eraI); yr.appendChild(eraL);
    var dnL = el('label', 'sys-cal-tick'), dnC = el('input', 'sys-cal-down'); dnC.type = 'checkbox'; dnC.checked = cal.down === true; dnC.title = 'Years count down, as a count before an event does: 3964, then 3963';
    dnL.appendChild(dnC); dnL.appendChild(document.createTextNode(' Years count down')); yr.appendChild(dnL);
    wrap.appendChild(yr);
    var lp = cal.leap && typeof cal.leap === 'object' && !Array.isArray(cal.leap) ? cal.leap : null, lr = el('div', 'sys-flags sys-cal-leap');
    var lpL = el('label', 'sys-cal-tick'), lpC = el('input', 'sys-cal-leapon'); lpC.type = 'checkbox'; lpC.checked = !!lp; lpC.disabled = !ps.length && !lp; lpC.title = ps.length ? 'Some years are longer: a period gains days every so many years' : 'Add a period first: a leap year\u2019s days go into one';
    lpL.appendChild(lpC); lpL.appendChild(document.createTextNode(' Leap years')); lr.appendChild(lpL);
    if (lp) {
        lr.appendChild(calNum('sys-cal-levery', lp.every, 'Every how many years (2 to ' + CAL_LIMITS.leapEvery + ')', 2, CAL_LIMITS.leapEvery, 'Every (years)'));
        lr.appendChild(calNum('sys-cal-lfrom', lp.from, 'A leap year, as the calendar numbers it: the rule counts from it both ways', -CAL_LIMITS.year, CAL_LIMITS.year, 'Counting from year'));
        lr.appendChild(calNum('sys-cal-ldays', lp.days, 'How many days a leap year adds (1 to ' + CAL_LIMITS.leapDays + ')', 1, CAL_LIMITS.leapDays, 'Days more'));
        if (ps.length) lr.appendChild(labeledSelect('sys-cal-lperiod', 'In', ps.map(function(p, i) { return [String(i), p && typeof p.name === 'string' && p.name.trim() ? p.name : 'Period ' + (i + 1)]; }), String(lp.period), 'The period that gains the days'));
    }
    wrap.appendChild(lr);
    var sm = calSums(cal), s1 = el('div', 'sys-note sys-cal-sum', sm[0]), s2 = el('div', 'sys-note sys-cal-preview', sm[1]); s1.id = 'sysCalSum'; s2.id = 'sysCalPreview';
    wrap.appendChild(s1); wrap.appendChild(s2);
    var err = errorCell('calendar'); err.dataset.errFor = 'calendar'; wrap.appendChild(err);
    box.appendChild(wrap);
}
function calRefreshText() { var sm = calSums(calOf()), a = ui('sysCalSum'), b = ui('sysCalPreview'); if (a) a.textContent = sm[0]; if (b) b.textContent = sm[1]; }
function onCalendarInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-cal-') < 0) return false;
    var cal = calDraft(), numV = function() { var v = Number(t.value); return String(t.value).trim() !== '' && isFinite(v) ? v : null; };
    if (c.indexOf('sys-cal-pname') >= 0 || c.indexOf('sys-cal-pdays') >= 0) {
        var prw = t.closest ? t.closest('.sys-cal-prow') : null, i = prw ? +prw.dataset.ci : -1, p = Array.isArray(cal.periods) && i >= 0 && Math.floor(i) === i && cal.periods[i] && typeof cal.periods[i] === 'object' ? cal.periods[i] : null; if (!p) return true;
        if (c.indexOf('sys-cal-pname') >= 0) p.name = String(t.value).slice(0, CAL_LIMITS.name * 2); else { var d = numV(); if (d === null) delete p.days; else p.days = d; }
    } else if (c.indexOf('sys-cal-wname') >= 0) {
        var wrw = t.closest ? t.closest('.sys-cal-wrow') : null, k = wrw ? +wrw.dataset.wi : -1; if (!(Array.isArray(cal.week) && k >= 0 && k < cal.week.length && Math.floor(k) === k)) return true;
        cal.week[k] = String(t.value).slice(0, CAL_LIMITS.name * 2);
    } else {
        var key = ['hours', 'minutes', 'seconds', 'one'].filter(function(k0) { return c.indexOf('sys-cal-' + k0) >= 0; })[0];
        if (key) { var n = numV(); if (n === null) delete cal[key]; else cal[key] = n; }
        else if (c.indexOf('sys-cal-era') >= 0) { if (String(t.value).trim()) cal.era = String(t.value).slice(0, CAL_LIMITS.era * 2); else delete cal.era; }
        else if (c.indexOf('sys-cal-levery') >= 0 || c.indexOf('sys-cal-lfrom') >= 0 || c.indexOf('sys-cal-ldays') >= 0) {
            var lp = cal.leap && typeof cal.leap === 'object' && !Array.isArray(cal.leap) ? cal.leap : null; if (!lp) return true;
            var lk = c.indexOf('sys-cal-levery') >= 0 ? 'every' : c.indexOf('sys-cal-lfrom') >= 0 ? 'from' : 'days', ln = numV(); if (ln === null) delete lp[lk]; else lp[lk] = ln;
        } else return true;   // a tick's or a select's input event: its change event does the work
    }
    markDirty(); patchErrors(); calRefreshText(); return true;
}
function onCalendarChange(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-cal-') < 0) return false;
    var cal = calDraft();
    if (c.indexOf('sys-cal-pextra') >= 0) {
        var rw = t.closest ? t.closest('.sys-cal-prow') : null, i = rw ? +rw.dataset.ci : -1, p = Array.isArray(cal.periods) && i >= 0 && Math.floor(i) === i && cal.periods[i] && typeof cal.periods[i] === 'object' ? cal.periods[i] : null; if (!p) return true;
        if (t.checked === true) p.extra = true; else delete p.extra;
    }
    else if (c.indexOf('sys-cal-down') >= 0) { if (t.checked === true) cal.down = true; else delete cal.down; }
    else if (c.indexOf('sys-cal-first') >= 0) { var f = Number(t.value); if (f > 0 && Math.floor(f) === f && Array.isArray(cal.week) && f < cal.week.length) cal.first = f; else delete cal.first; }
    else if (c.indexOf('sys-cal-leapon') >= 0) {
        if (t.checked === true) { if (!cal.leap || typeof cal.leap !== 'object' || Array.isArray(cal.leap)) cal.leap = { every: 4, from: typeof cal.one === 'number' ? cal.one : 1, period: 0, days: 1 }; } else delete cal.leap;
        markDirty(); renderAll(); return true;
    }
    else if (c.indexOf('sys-cal-lperiod') >= 0) { var lp = cal.leap && typeof cal.leap === 'object' && !Array.isArray(cal.leap) ? cal.leap : null, v = Number(t.value); if (!lp || !(v >= 0 && Math.floor(v) === v && Array.isArray(cal.periods) && v < cal.periods.length)) return true; lp.period = v; }
    else return true;   // the boxes' change events (their input events did the work)
    markDirty(); patchErrors(); calRefreshText(); return true;
}
function calendarClick(b) {
    var act = b.dataset.act || '';
    if (act === 'calpreset') {
        var pid = b.dataset.preset;
        if (pid === 'days') delete draft.calendar; else { var pz = calPreset(pid); if (!pz) return true; draft.calendar = pz; }
        markDirty(); renderAll(); return true;
    }
    var m = /^cal(p|w)(add|up|down|del)$/.exec(act); if (!m) return false;
    var cal = calDraft(), isP = m[1] === 'p', key = isP ? 'periods' : 'week', cap = isP ? CAL_LIMITS.periods : CAL_LIMITS.week, arr = Array.isArray(cal[key]) ? cal[key] : (cal[key] = []);
    var rw = b.closest ? b.closest(isP ? '.sys-cal-prow' : '.sys-cal-wrow') : null, i = rw ? +(isP ? rw.dataset.ci : rw.dataset.wi) : -1;
    // the leap rule's period and the first weekday are places in these lists: they follow a move, and go with a remove of their own row
    var refOf = function() { return isP ? (cal.leap && typeof cal.leap === 'object' && typeof cal.leap.period === 'number' ? cal.leap.period : -1) : (typeof cal.first === 'number' ? cal.first : 0); };
    var setRef = function(v) { if (isP) { if (cal.leap && typeof cal.leap === 'object') { if (v < 0) delete cal.leap; else cal.leap.period = v; } } else if (v > 0) cal.first = v; else delete cal.first; };
    if (m[2] === 'add') { if (arr.length >= cap) { toast('At most ' + cap + '.'); return true; } arr.push(isP ? { name: '', days: 30 } : ''); }
    else if (!(i >= 0 && i < arr.length && Math.floor(i) === i)) return true;
    else {
        var r = refOf(), j = m[2] === 'up' ? i - 1 : m[2] === 'down' ? i + 1 : -1;
        if (m[2] === 'del') { arr.splice(i, 1); if (r === i) setRef(isP ? -1 : 0); else if (r > i) setRef(r - 1); }
        else if (j >= 0 && j < arr.length) { arr.splice(j, 0, arr.splice(i, 1)[0]); if (r === i) setRef(j); else if (r === j) setRef(i); }
    }
    markDirty(); renderAll(); return true;
}
// [sinkcheck:calendarbox-end]
// Senses S2a: the system's senses on the Combat card (docs/SENSES_PLAN.md 4.3) — each a name, where its range comes from (a field of the
// character, or a number every character has), what it counts in (never a silent yards: a new row takes the system's first light's unit,
// else the last picked here, else it waits for one and Save leaves it out), whether walls stop it, whether it sees all round and whether it
// sees the dark as dim; each row ends in one plain sentence of what it does. Every text lands as a value or a text node. Save cleans them (a
// sense on a value its owner cannot read is dropped for everyone); refreshErrors says what it would drop
// The eyes' arc (the owner's ruling of 2026-10-03): under the blind switch, "Sight arc from" names the number or formula field that gives a
// character's own sight arc in degrees (combat.senses.arc), or the map's arc for none, with its sentence (arcSentence)
// [sinkcheck:sensesbox-start]
var _senseUnit = '', SENSE_WORDS = { yd: 'yards', ft: 'feet', m: 'metres', cells: 'grid cells' };
// senses S4: a mark sense's mark, as its player sees it (the shape the fog draws, and the word shown while the pointer is on it); none: a presence
var SENSE_GLYPH_SAY = { sound: 'three arcs, “Heard”', tremor: 'a zigzag, “Felt”', presence: 'a ring round a dot, “Sensed”', heat: 'a teardrop, “Heat”' };
function senseGlyphOf(s) { return typeof s.glyph === 'string' && Object.prototype.hasOwnProperty.call(SENSE_GLYPH_SAY, s.glyph) ? s.glyph : 'presence'; }
function sensesDraft() { var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }); return cm.senses && typeof cm.senses === 'object' && !Array.isArray(cm.senses) ? cm.senses : (cm.senses = {}); }
function senseRangeFields() { return (draft.fields || []).filter(function(f) { return !!f && (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill' || f.kind === 'resource'); }); }
function senseSecrets() { try { return secretFieldIds({ fields: gmViewFields(draft, F()), items: draft.items, core: draft.core }, F()); } catch (e) { return null; } }
// senses S3: the fields a switch may read (a sense's off, the blind switch): toggles first, then numbers and formulas, as the cleaner takes them
function senseSwitchFields() { var fs = (draft.fields || []).filter(function(f) { return !!f && (f.kind === 'toggle' || f.kind === 'number' || f.kind === 'formula'); }); return fs.filter(function(f) { return f.kind === 'toggle'; }).concat(fs.filter(function(f) { return f.kind !== 'toggle'; })); }
function senseSwitchOf(v) { var id = v && typeof v === 'object' && typeof v.field === 'string' ? v.field : '', out = null; if (id) senseSwitchFields().forEach(function(f) { if (f.id === id) out = f; }); return out; }
function senseSentence(s, fieldsR, secret) {
    var r = s.range && typeof s.range === 'object' ? s.range : {}, how = (s.walls === 'pass' ? ', through walls' : '') + (s.arc === 'all' ? ', all round' : ''), word = SENSE_WORDS[Object.prototype.hasOwnProperty.call(LIGHT_UNITS, s.unit) ? s.unit : 'yd'];
    var mark = s.grade === 'mark', verb = mark ? 'Marks every creature within ' : 'Sees everything within ';   // senses S4
    if (s.unit === '?') return 'Pick what its range counts in: Save leaves this sense out until you do.';
    var out = [], sw = s.off !== undefined ? senseSwitchOf(s.off) : null, swName = sw ? sw.label || sw.key : '';
    if (sw && (!secret || secret[sw.id])) return 'Save drops this sense: its owner cannot read ' + swName + ', which switches it off (a GM-only value, or one worked out from one). Make that value visible to its owner, or have it never switched off.';
    if (r.by === 'field') {
        var f = null; fieldsR.forEach(function(x) { if (x.id === r.field) f = x; });
        if (!f) return 'Pick where its range comes from: Save drops this sense.';
        var nm = f.label || f.key;
        if (!secret || secret[f.id]) return 'Save drops this sense: its owner cannot read ' + nm + ' (a GM-only value, or one worked out from one). Make that value visible to its owner, or give the range as a number.';
        out.push(verb + 'the character’s ' + nm + ' (in ' + word + ')' + how + '.'); out.push('A value of 0 or less: that character does not have it.');
        if (f.edit === 'owner' && f.kind !== 'formula') out.push('Its owner can change this on their sheet.');
    } else {
        var n = typeof r.n === 'number' && isFinite(r.n) ? r.n : 0;
        if (!(n > 0)) return 'A range of 0: no one has it unless a token is given a range of its own in its Properties.';
        out.push(verb + n + ' ' + word + how + '.'); out.push('Every character has this sense.');
        if (s.unit === 'cells' && n > 60) out.push('60 cells is the most a sense reaches.');
    }
    if (s.eyes === true) out.push('A sense of the eyes: off while the character is blind.');
    if (s.veil === true) out.push('It sees through smoke.');   // senses S7b
    if (sw) out.push('Off while ' + swName + ' is ticked or above 0.' + (sw.edit === 'owner' && sw.kind !== 'formula' ? ' Its owner can change that on their sheet.' : ''));
    else if (s.off !== undefined) out.push('Its switch is no longer here: Save keeps the sense, never switched off.');
    if (mark) out.push('A creature it finds that the eyes do not see shows to its player as a nameless mark in its cell, never as itself: ' + SENSE_GLYPH_SAY[senseGlyphOf(s)] + '.');
    else out.push(s.shows === 'dim' ? 'What it sees in the dark it sees as dim.' : 'Seen clearly, light or none: no dim or dark name shows inside its range.');
    return out.join(' ');
}
// senses S3: the sentence under the blind switch
function blindSentence(sn) {
    var b = sn && typeof sn === 'object' ? sn.blind : undefined; if (b === undefined) return 'No field makes a character blind: the Blind tick in a token’s Properties still does.';
    var f = senseSwitchOf(b); if (!f) return 'Pick the field that makes a character blind: Save leaves the blind switch out.';
    var nm = f.label || f.key, secret = senseSecrets();
    if (!secret || secret[f.id]) return 'Save drops the blind switch: its owner cannot read ' + nm + ' (a GM-only value, or one worked out from one). Make that value visible to its owner.';
    return 'A character is blind while ' + nm + ' is ticked or above 0: its eyes see only its own cell, a sense of the eyes is off, and a sense that does not use the eyes still works.' + (f.edit === 'owner' && f.kind !== 'formula' ? ' Its owner can change this on their sheet.' : '');
}
// the eyes' arc: the fields it may read (a number or a formula, as the cleaner takes them) and the sentence under "Sight arc from"
function senseArcFields() { return (draft.fields || []).filter(function(f) { return !!f && (f.kind === 'number' || f.kind === 'formula'); }); }
function senseArcOf(v) { var id = v && typeof v === 'object' && typeof v.field === 'string' ? v.field : '', out = null; if (id) senseArcFields().forEach(function(f) { if (f.id === id) out = f; }); return out; }
function arcSentence(sn) {
    var a = sn && typeof sn === 'object' ? sn.arc : undefined; if (a === undefined) return 'Every character’s eyes see through the map’s vision arc (the fog menu’s Vision).';
    var f = senseArcOf(a); if (!f) return 'Pick the number or formula field that gives a character’s sight arc: Save leaves it out.';
    var nm = f.label || f.key, secret = senseSecrets();
    if (!secret || secret[f.id]) return 'Save drops the sight arc: its owner cannot read ' + nm + ' (a GM-only value, or one worked out from one). Make that value visible to its owner.';
    return 'A character sees through an arc of its own, the character’s ' + nm + ' in degrees (1 to 360), wherever the map’s Vision is a facing cone: wider or narrower than the map’s. A value of 0 or less: the map’s arc. A map set to All around still sees all round, as every token does while Token facing is off.' + (f.edit === 'owner' && f.kind !== 'formula' ? ' Its owner can change this on their sheet.' : '');
}
function sensesBox(box, cm) {
    var sn = cm.senses && typeof cm.senses === 'object' && !Array.isArray(cm.senses) ? cm.senses : {}, arr = Array.isArray(sn.list) ? sn.list : [], wrap = el('div', 'sys-light sys-senses');
    var fieldsR = senseRangeFields(), secret = senseSecrets(), swF = senseSwitchFields();
    wrap.appendChild(el('div', 'sys-light-head', 'Senses'));
    wrap.appendChild(el('div', 'sys-note', 'Senses besides the eyes, for fogged maps: a sense sees every cell within its range, and the creatures standing there reach its player as the eyes would show them, or it marks them: a creature it finds that the eyes do not see shows to its player as a nameless mark in its cell. Its range comes from a field of the character (one its player can read) or is one number every character has.'));
    arr.forEach(function(s0, i) {
        var s = s0 && typeof s0 === 'object' ? s0 : {}, r = s.range && typeof s.range === 'object' ? s.range : {}, byField = r.by === 'field', rw = el('div', 'sys-flags sys-light-row sys-sense-row'); rw.dataset.si = String(i);
        var n = input('sys-sense-name field', typeof s.name === 'string' ? s.name : '', 'Its name: Darkvision, Blindsight, Force Sight', 'Name'); n.maxLength = LIMITS.label; rw.appendChild(n);
        var mark = s.grade === 'mark';   // senses S4: what it shows, and a mark's own mark
        rw.appendChild(select('sys-sense-grade', [['full', 'Shows everything in range'], ['mark', 'A nameless mark']], mark ? 'mark' : 'full', 'Everything in range: its cells are seen and the creatures there appear as themselves. A nameless mark: a creature it finds that the eyes do not see shows to its player as a mark in its cell, never as itself'));
        if (mark) rw.appendChild(select('sys-sense-glyph', [['sound', 'Mark: a sound'], ['tremor', 'Mark: a tremor'], ['presence', 'Mark: a presence'], ['heat', 'Mark: heat']], senseGlyphOf(s), 'The mark its player sees, told apart by its shape: three arcs for a sound, a zigzag for a tremor, a ring for a presence, a teardrop for heat'));
        var ropts = [['#n', 'A number (every character)']].concat(fieldsR.map(function(f) { return [f.id, 'From ' + (f.label || f.key)]; }));
        if (byField && typeof r.field === 'string' && !fieldsR.some(function(f) { return f.id === r.field; })) ropts.push([r.field, 'From a field no longer here']);
        rw.appendChild(select('sys-sense-from', ropts, byField ? r.field : '#n', 'Where its range comes from: a field of the character (worked out for each character, effects and all) or one number every character has'));
        if (!byField) { var nl = el('label', 'sys-num'); nl.appendChild(el('span', 'sys-num-cap', 'Range')); var ni = el('input', 'field sys-sense-n'); ni.type = 'number'; ni.min = '0'; ni.max = '100000'; ni.step = 'any'; ni.value = typeof r.n === 'number' ? String(r.n) : ''; ni.title = 'How far it reaches, for every character (0: no one has it)'; nl.appendChild(ni); rw.appendChild(nl); }
        rw.appendChild(select('sys-sense-unit', (s.unit === '?' ? [['?', '— pick a unit —']] : []).concat([['yd', 'yards'], ['ft', 'feet'], ['m', 'metres'], ['cells', 'grid cells']]), s.unit === '?' ? '?' : (typeof s.unit === 'string' && Object.prototype.hasOwnProperty.call(LIGHT_UNITS, s.unit) ? s.unit : 'yd'), 'What its range counts in: each map’s scale converts it (60 ft on 5 ft squares is 12 squares)'));
        [['walls', 'Walls stop it', s.walls !== 'pass', 'Ticked: whatever blocks sight stops it, as it stops the eyes. Unticked: it passes walls'], ['arc', 'All round (ignores facing)', s.arc === 'all', 'Ticked: it sees in every direction, whatever arc its token’s eyes see through'], ['dim', 'What it sees in the dark it sees as dim', s.shows === 'dim', 'Ticked: in the dark it shows cells dim (the dim name shows on the ruler and at a target mark), in light as the light is. Unticked: clear'], ['eyes', 'Uses the eyes (off while blind)', s.eyes === true, 'Ticked: a sense of the eyes, off while the character is blind (darkvision, truesight). Unticked: it works blind (blindsight, a sense of the Force)'], ['veil', 'Sees through smoke', s.veil === true, 'Ticked: smoke hides nothing from it. Unticked: it does not see into or through smoke (a sense that passes walls always does)']].filter(function(g) { return !(mark && g[0] === 'dim'); }).forEach(function(g) {   // a mark sees no cells: no dim
            var tl = el('label', 'sys-hover'), tc = el('input', 'sys-sense-tick'); tc.type = 'checkbox'; tc.checked = g[2]; tc.dataset.tick = g[0]; tl.appendChild(tc); tl.appendChild(document.createTextNode(' ' + g[1])); tl.title = g[3]; rw.appendChild(tl);
        });
        var offId = s.off && typeof s.off === 'object' && typeof s.off.field === 'string' ? s.off.field : '', oopts = [['', 'Never switched off']].concat(swF.map(function(f) { return [f.id, 'Off while ' + (f.label || f.key)]; }));   // senses S3
        if (offId && !swF.some(function(f) { return f.id === offId; })) oopts.push([offId, 'Off by a field no longer here']);
        rw.appendChild(select('sys-sense-off', oopts, offId, 'A field of the character that switches this sense off while it is ticked or above 0 (Deafened for hearing): toggles first'));
        [['up', '▲', 'Move up'], ['down', '▼', 'Move down'], ['del', '×', 'Remove']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = 'sn' + bd[0]; bb.title = bd[2]; rw.appendChild(bb); });
        wrap.appendChild(rw);
        wrap.appendChild(el('div', 'sys-note sys-sense-says', senseSentence(s, fieldsR, secret)));
    });
    var full = arr.length >= LIMITS.senses, adds = el('div', 'sys-flags');
    [['dark', '+ Sees without light', 'A sense that sees in the dark, as dim: darkvision'], ['noeyes', '+ Sees without eyes', 'A sense that works blind, all round: blindsight, a sense of the Force'], ['hears', '+ Hears', 'A nameless mark for a sound, through walls, all round; off while the system’s Deafened toggle is ticked, if it has one'], ['feels', '+ Feels through the ground', 'A nameless mark for a tremor, through walls, all round: tremorsense'], ['near', '+ Senses what is near', 'A nameless mark for a presence, through walls, all round'], ['creature', '+ A creature’s sense (set per token)', 'A nameless mark with a range of 0: no one has it until a token is given a range of its own in its Properties (a beast’s vibration sense)'], ['custom', '+ Custom sense', 'A sense of your own']].forEach(function(g) { var b = el('button', 'tool ghost sys-btn sys-light-add', g[1]); b.dataset.act = 'snadd'; b.dataset.tpl = g[0]; b.disabled = full; b.title = full ? 'At most ' + LIMITS.senses : g[2]; adds.appendChild(b); });
    wrap.appendChild(adds);
    wrap.appendChild(el('div', 'sys-note', 'Sight is the eyes’ own range in the dark. A sense that sees without light adds to it; the longer of the two is what the token sees.'));
    var blId = sn.blind && typeof sn.blind === 'object' && typeof sn.blind.field === 'string' ? sn.blind.field : '', bopts = [['', 'No blind switch']].concat(swF.map(function(f) { return [f.id, 'Blind while ' + (f.label || f.key)]; }));   // senses S3: the system's blind switch
    if (blId && !swF.some(function(f) { return f.id === blId; })) bopts.push([blId, 'Blind by a field no longer here']);
    var brow = el('div', 'sys-flags'); brow.appendChild(el('span', 'sys-num-cap', 'Blind when')); brow.appendChild(select('sys-sense-blind', bopts, blId, 'A field of the character that makes it blind while it is ticked or above 0 (Blinded): its eyes see only its own cell, and a sense of the eyes is off; toggles first')); wrap.appendChild(brow);
    wrap.appendChild(el('div', 'sys-note sys-blind-says', blindSentence(sn)));
    var arF = senseArcFields(), arId = sn.arc && typeof sn.arc === 'object' && typeof sn.arc.field === 'string' ? sn.arc.field : '', aopts = [['', 'The map’s arc']].concat(arF.map(function(f) { return [f.id, 'From ' + (f.label || f.key)]; }));   // the eyes' arc, from the sheet
    if (arId && !arF.some(function(f) { return f.id === arId; })) aopts.push([arId, 'From a field no longer here']);
    var arow = el('div', 'sys-flags'); arow.appendChild(el('span', 'sys-num-cap', 'Sight arc from')); arow.appendChild(select('sys-sense-eyearc', aopts, arId, 'A number or formula field of the character that gives its own sight arc in degrees (1 to 360) on a map with a facing cone: 300 for one who sees to the sides, 360 for one who sees all round. The map’s arc: every character sees through the map’s')); wrap.appendChild(arow);
    wrap.appendChild(el('div', 'sys-note sys-arc-says', arcSentence(sn)));
    var err = errorCell('senses'); err.dataset.errFor = 'senses'; wrap.appendChild(err);
    box.appendChild(wrap);
}
function senseAt(t) { var rw = t.closest('.sys-sense-row'), i = rw ? +rw.dataset.si : -1, sn = sensesDraft(), arr = Array.isArray(sn.list) ? sn.list : []; return i >= 0 && arr[i] && typeof arr[i] === 'object' ? { s: arr[i], rw: rw } : null; }
function senseSays(at) { var say = at.rw.nextSibling; if (say && say.classList && say.classList.contains('sys-sense-says')) say.textContent = senseSentence(at.s, senseRangeFields(), senseSecrets()); }
function onSensesInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-sense-') < 0) return false;
    if (c.indexOf('sys-sense-name') < 0 && c.indexOf('sys-sense-n') < 0) return true;   // the selects' and the ticks' change events do the work
    var at = senseAt(t); if (!at) return true;
    if (c.indexOf('sys-sense-name') >= 0) at.s.name = t.value.slice(0, LIMITS.label);
    else { var r = at.s.range && typeof at.s.range === 'object' ? at.s.range : (at.s.range = { by: 'n' }), nv = Number(t.value); if (t.value.trim() && isFinite(nv)) r.n = nv; else delete r.n; }
    senseSays(at); markDirty(); patchErrors(); return true;
}
function onSensesChange(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-sense-') < 0) return false;
    if (c.indexOf('sys-sense-from') < 0 && c.indexOf('sys-sense-unit') < 0 && c.indexOf('sys-sense-tick') < 0 && c.indexOf('sys-sense-off') < 0 && c.indexOf('sys-sense-blind') < 0 && c.indexOf('sys-sense-eyearc') < 0 && c.indexOf('sys-sense-grade') < 0 && c.indexOf('sys-sense-glyph') < 0) return true;   // the boxes' change events (their input events did the work)
    if (c.indexOf('sys-sense-eyearc') >= 0) { var sna = sensesDraft(); if (t.value && typeof t.value === 'string') sna.arc = { field: t.value }; else delete sna.arc; markDirty(); renderAll(); return true; }   // the eyes' arc: the field it comes from, or the map's arc (its sentence redrawn)
    if (c.indexOf('sys-sense-blind') >= 0) { var snd = sensesDraft(); if (t.value) snd.blind = { field: t.value }; else delete snd.blind; markDirty(); renderAll(); return true; }   // senses S3: the blind switch (its sentence redrawn)
    var at = senseAt(t); if (!at) return true;
    var s = at.s;
    if (c.indexOf('sys-sense-off') >= 0) { if (t.value) s.off = { field: t.value }; else delete s.off; senseSays(at); markDirty(); patchErrors(); return true; }
    if (c.indexOf('sys-sense-grade') >= 0) {   // senses S4: everything in range or a mark (the glyph list and the dim tick come or go)
        if (t.value === 'mark') { s.grade = 'mark'; delete s.shows; s.glyph = senseGlyphOf(s); } else if (t.value === 'full') { s.grade = 'full'; delete s.glyph; } else return true;
        markDirty(); renderAll(); return true;
    }
    if (c.indexOf('sys-sense-glyph') >= 0) { if (s.grade !== 'mark' || typeof t.value !== 'string' || !Object.prototype.hasOwnProperty.call(SENSE_GLYPH_SAY, t.value)) return true; s.glyph = t.value; senseSays(at); markDirty(); patchErrors(); return true; }
    if (c.indexOf('sys-sense-from') >= 0) {
        s.range = t.value === '#n' ? { by: 'n', n: 0 } : { by: 'field', field: t.value };
        markDirty(); renderAll(); return true;   // the number box comes or goes
    }
    if (c.indexOf('sys-sense-unit') >= 0) { if (t.value === 'yd') { delete s.unit; _senseUnit = 'yd'; } else if (typeof t.value === 'string' && Object.prototype.hasOwnProperty.call(LIGHT_UNITS, t.value)) { s.unit = t.value; _senseUnit = t.value; } }
    else if (t.dataset.tick === 'walls') { if (t.checked) delete s.walls; else s.walls = 'pass'; }
    else if (t.dataset.tick === 'arc') { if (t.checked) s.arc = 'all'; else delete s.arc; }
    else if (t.dataset.tick === 'dim') { if (t.checked) s.shows = 'dim'; else delete s.shows; }
    else if (t.dataset.tick === 'eyes') { if (t.checked) s.eyes = true; else delete s.eyes; }
    else if (t.dataset.tick === 'veil') { if (t.checked) s.veil = true; else delete s.veil; }   // senses S7b
    senseSays(at); markDirty(); patchErrors(); return true;
}
function senseUnitFor() {   // a new row's unit: the system's first light's, else the last picked here, else none yet ('?': Save waits for one)
    var lt = draft.combat && draft.combat.light && typeof draft.combat.light === 'object' ? draft.combat.light : null, p = lt && Array.isArray(lt.presets) && lt.presets.length ? lt.presets[0] : null;
    if (p && typeof p === 'object') return typeof p.unit === 'string' && Object.prototype.hasOwnProperty.call(LIGHT_UNITS, p.unit) ? p.unit : 'yd';
    return _senseUnit || '?';
}
function sensesClick(b) {
    var m = /^sn(add|up|down|del)$/.exec(b.dataset.act || ''); if (!m) return false;
    var sn = sensesDraft(), arr = Array.isArray(sn.list) ? sn.list : (sn.list = []);
    var rw = b.closest('.sys-sense-row'), i = rw ? +rw.dataset.si : -1;
    if (m[1] === 'add') {
        if (arr.length >= LIMITS.senses) { toast('At most ' + LIMITS.senses + '.'); return true; }
        var id = ''; for (var k = 0; k < 20 && !(/^sn_[a-z0-9]{8}$/.test(id) && !arr.some(function(x) { return x && x.id === id; })); k++) id = uid('sn_');
        var tpl = b.dataset.tpl, mk = { hears: ['Hearing', 'sound'], feels: ['Tremorsense', 'tremor'], near: ['Presence', 'presence'], creature: ['A creature’s sense', 'tremor'] }, mt = Object.prototype.hasOwnProperty.call(mk, tpl) ? mk[tpl] : null;
        var u = senseUnitFor(), row = { id: id, name: tpl === 'dark' ? 'Sees in the dark' : tpl === 'noeyes' ? 'Sees without eyes' : mt ? mt[0] : '', range: { by: 'n', n: 0 }, grade: mt ? 'mark' : 'full' };
        if (u !== 'yd') row.unit = u;
        if (tpl === 'dark') { row.shows = 'dim'; row.eyes = true; }   // senses S3: darkvision is a sense of the eyes
        if (tpl === 'noeyes') row.arc = 'all';
        if (mt) { row.walls = 'pass'; row.arc = 'all'; row.glyph = mt[1]; }   // senses S4: the marks' templates pass walls and hear all round
        if (tpl === 'hears') { var sec = senseSecrets(), deaf = senseSwitchFields().filter(function(f) { return f.kind === 'toggle' && /^deaf/i.test(String(f.key || '')) && sec && !sec[f.id]; })[0]; if (deaf) row.off = { field: deaf.id }; }   // off while Deafened, one its owner can read
        arr.push(row);
    }
    else if (!(i >= 0 && i < arr.length && Math.floor(i) === i)) return true;
    else if (m[1] === 'up') { if (i > 0) arr.splice(i - 1, 0, arr.splice(i, 1)[0]); }
    else if (m[1] === 'down') { if (i < arr.length - 1) arr.splice(i + 1, 0, arr.splice(i, 1)[0]); }
    else arr.splice(i, 1);
    markDirty(); renderAll(); return true;
}
// [sinkcheck:sensesbox-end]
// Turn-based combat T1: the system's turn rules on the Combat card — how far a character moves in one turn (a formula and its unit), how a
// square grid counts a diagonal (the ruler follows it), how long a round is, the system's own time units and what one turn allows. Save
// cleans them; refreshErrors says what it would drop
// [sinkcheck:everyrow-start]
// Item 20 K5 (the owner's answers of 2026-09-30): a roll or an apply action may also run by the campaign's clock (the Calendar) — every n minutes,
// hours, days, weeks or the system's own time units (the Combat card's Turns box), during rest only or any time; the GM moves the clock as Rest
// or Active and says which characters' rules run. Its boxes land as values; Save cleans them (systemcore cleanEvery)
function everyRow(r) {
    var ev = r.every && typeof r.every === 'object' && !Array.isArray(r.every) ? r.every : null, row = el('div', 'sys-flags sys-roll-everyrow');
    row.appendChild(el('span', 'sys-num-cap', 'By the clock'));
    var n = el('input', 'field sys-roll-evn'); n.type = 'number'; n.min = '1'; n.max = '1000'; n.step = '1'; n.placeholder = 'Every'; n.value = ev && typeof ev.n === 'number' && isFinite(ev.n) ? String(ev.n) : ''; n.title = 'With the Calendar on, it also runs every so many of the unit beside as the clock moves on (empty: never by the clock)'; row.appendChild(n);
    var tn = draft && draft.combat && draft.combat.turn, tus = tn && typeof tn === 'object' && Array.isArray(tn.units) ? tn.units.filter(function(u) { return u && typeof u.key === 'string' && u.key; }) : [];
    var opts = [['min', 'minutes'], ['hour', 'hours'], ['day', 'days'], ['week', 'weeks']].concat(tus.map(function(u) { return [u.key, typeof u.label === 'string' && u.label ? u.label : u.key]; }));
    var cur = ev && typeof ev.u === 'string' && ev.u ? ev.u : 'day'; if (!opts.some(function(o) { return o[0] === cur; })) opts.push([cur, cur + ' (no such unit)']);
    row.appendChild(select('sys-roll-evu', opts, cur, 'What it counts in: the calendar\u2019s minutes, hours, days and weeks, or one of your time units (the Combat card\u2019s Turns box)'));
    var rl = el('label', 'sys-hover'), rc = el('input', 'sys-roll-evrest'); rc.type = 'checkbox'; rc.checked = !!(ev && ev.rest === true); rc.title = 'It counts rest only: time the GM moves on as Rest; activity starts its count again'; rl.appendChild(rc); rl.appendChild(document.createTextNode(' During rest only')); row.appendChild(rl);
    return row;
}
function everyEdit(r, c, t) {   // the three boxes' edits; a unit or the rest tick before any number keeps the shown unit
    if (c.indexOf('sys-roll-evn') >= 0) { var v = Number(t.value); r.every = Object.assign({ u: 'day' }, r.every && typeof r.every === 'object' && !Array.isArray(r.every) ? r.every : {}); if (String(t.value).trim() && isFinite(v)) r.every.n = v; else delete r.every; return true; }
    if (c.indexOf('sys-roll-evu') >= 0) { r.every = Object.assign({}, r.every && typeof r.every === 'object' && !Array.isArray(r.every) ? r.every : {}); r.every.u = String(t.value).slice(0, 24); return true; }
    if (c.indexOf('sys-roll-evrest') >= 0) { r.every = Object.assign({ u: 'day' }, r.every && typeof r.every === 'object' && !Array.isArray(r.every) ? r.every : {}); if (t.checked === true) r.every.rest = true; else delete r.every.rest; return true; }
    return false;
}
// [sinkcheck:everyrow-end]
function turnActs() { var tn = draft && draft.combat && draft.combat.turn; return tn && typeof tn === 'object' && Array.isArray(tn.acts) ? tn.acts.filter(function(a) { return a && typeof a === 'object' && typeof a.key === 'string' && a.key; }) : []; }
function turnDraft() { var cm = draft.combat || (draft.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: '' }); return cm.turn && typeof cm.turn === 'object' && !Array.isArray(cm.turn) ? cm.turn : (cm.turn = {}); }
function costOptions(cost, acts) {   // a roll's Costs menu: nothing, each action, and a cost naming none (kept until picked away)
    var o = [['', 'Costs nothing']].concat(acts.map(function(a) { return [a.key, 'Costs: ' + (a.label || a.key)]; }));
    if (cost && !acts.some(function(a) { return a.key.toLowerCase() === String(cost).toLowerCase(); })) o.push([cost, 'Costs: ' + cost + ' (no such action)']);
    return o;
}
function turnBox(box, cm) {
    var tn = cm.turn && typeof cm.turn === 'object' && !Array.isArray(cm.turn) ? cm.turn : {}, wrap = el('div', 'sys-turn');
    wrap.appendChild(el('div', 'sys-turn-head', 'Turns'));
    wrap.appendChild(el('div', 'sys-note', 'Your game\u2019s turn, for turn-based combat: how far a character moves, how diagonals count (the ruler follows it), how long a round is, and the actions a turn allows (a roll can cost one).'));
    var r1 = el('div', 'sys-flags sys-turn-row');
    var mv = input('sys-turn-mvf field', typeof tn.move === 'string' ? tn.move : '', 'How far a character moves in one turn, worked out for each character (no dice): BasicMove, Speed, floor(DX / 2); empty: no limit', 'Move per turn (e.g. Speed)'); mv.maxLength = LIMITS.formula; r1.appendChild(mv);
    r1.appendChild(select('sys-turn-mvu', [['cells', 'grid cells'], ['ft', 'feet'], ['yd', 'yards'], ['m', 'metres']], typeof tn.unit === 'string' && TURN_UNITS[tn.unit] === 1 ? tn.unit : 'cells', 'The unit the move counts in: each map\u2019s scale converts it (30 ft on 5 ft squares is 6 squares; 5 yd on 1 yd hexes is 5 hexes)'));
    wrap.appendChild(r1);
    wrap.appendChild(labeledSelect('sys-turn-diag', 'Diagonals on squares', [['line', 'Straight line'], ['one', 'Every diagonal 1 square'], ['alt', 'Alternating 1\u20132 (5-10-5)']], tn.diag === 'one' || tn.diag === 'alt' ? tn.diag : 'line', 'How a diagonal step counts on a square grid, for the move and for the ruler; hexes are not affected'));
    var sl = el('label', 'sys-combat-item'); sl.appendChild(el('span', 'sys-num-cap', 'A round is (seconds)'));
    var sc = el('input', 'field sys-turn-secs'); sc.type = 'number'; sc.min = '0'; sc.step = 'any'; sc.value = typeof tn.secs === 'number' ? String(tn.secs) : ''; sc.placeholder = 'e.g. 6'; sc.title = 'How long one round lasts in the game (1 second GURPS-like, 6 seconds D&D-like): an effect that lasts seconds or minutes counts down by it'; sl.appendChild(sc); wrap.appendChild(sl);
    [['act', 'acts', 'Actions per turn', LIMITS.turnActs], ['tu', 'units', 'Time units', LIMITS.turnUnits]].forEach(function(g) {
        var arr = Array.isArray(tn[g[1]]) ? tn[g[1]] : [];
        wrap.appendChild(el('span', 'sys-num-cap', g[2]));
        arr.forEach(function(x0, i) {
            var x = x0 && typeof x0 === 'object' ? x0 : {}, rw = el('div', 'sys-flags sys-turn-' + g[0]); rw.dataset.ti = String(i);
            var k = input('sys-turn-' + g[0] + 'key field', typeof x.key === 'string' ? x.key : '', g[0] === 'act' ? 'Its name, which a roll costs: Action, Bonus, Reaction, Maneuver' : 'Its name in an effect\u2019s length: segment, watch (not a word the list already has: second, minute, hour, day, turn, round)', 'Key'); k.maxLength = 24; rw.appendChild(k);
            var l = input('sys-turn-' + g[0] + 'label field', typeof x.label === 'string' ? x.label : '', 'What the sheet shows (blank: the key)', 'Label'); l.maxLength = LIMITS.label; rw.appendChild(l);
            var n = el('input', 'field sys-turn-' + g[0] + 'n'); n.type = 'number';
            if (g[0] === 'act') { n.min = '1'; n.max = '9'; n.step = '1'; n.value = String(typeof x.n === 'number' ? x.n : 1); n.title = 'How many a turn allows (1 to 9)'; }
            else { n.min = '0'; n.step = 'any'; n.value = typeof x.secs === 'number' ? String(x.secs) : ''; n.placeholder = 'Seconds'; n.title = 'How long one lasts, in seconds (a watch: 14400)'; }
            rw.appendChild(n);
            [['up', '\u25b2', 'Move up'], ['down', '\u25bc', 'Move down'], ['del', '\u00d7', 'Remove']].forEach(function(bd) { var bb = el('button', 'tool ghost sys-btn', bd[1]); bb.dataset.act = 't' + g[0] + bd[0]; bb.title = bd[2]; rw.appendChild(bb); });
            wrap.appendChild(rw);
        });
        var ad = el('button', 'tool ghost sys-btn sys-turn-add', g[0] === 'act' ? '+ Action' : '+ Time unit'); ad.dataset.act = 't' + g[0] + 'add'; ad.disabled = arr.length >= g[3]; ad.title = ad.disabled ? 'At most ' + g[3] : g[0] === 'act' ? 'Something one turn allows (an Action, a Bonus action, a Maneuver)' : 'A time unit of your game, by its length in seconds'; wrap.appendChild(ad);
    });
    var err = errorCell('combat'); err.dataset.errFor = 'combat'; wrap.appendChild(err);
    box.appendChild(wrap);
}
function onTurnInput(t) {
    var c = t.className || ''; if (typeof c !== 'string' || c.indexOf('sys-turn-') < 0 || c.indexOf('sys-turn-mvu') >= 0 || c.indexOf('sys-turn-diag') >= 0) return false;
    var tn = turnDraft(), rw = t.closest('.sys-turn-act, .sys-turn-tu'), i = rw ? +rw.dataset.ti : -1;
    if (c.indexOf('sys-turn-mvf') >= 0) { if (t.value.trim()) tn.move = t.value.slice(0, LIMITS.formula); else delete tn.move; }
    else if (c.indexOf('sys-turn-secs') >= 0) { var sv = Number(t.value); if (t.value.trim() && isFinite(sv)) tn.secs = sv; else delete tn.secs; }
    else if (rw) {
        var g = rw.classList.contains('sys-turn-act') ? 'act' : 'tu', arr = tn[g === 'act' ? 'acts' : 'units'], x = Array.isArray(arr) && arr[i] && typeof arr[i] === 'object' ? arr[i] : null; if (!x) return true;
        if (c.indexOf('sys-turn-' + g + 'key') >= 0) x.key = t.value.slice(0, 24);
        else if (c.indexOf('sys-turn-' + g + 'label') >= 0) { if (t.value.trim()) x.label = t.value.slice(0, LIMITS.label); else delete x.label; }
        else if (c.indexOf('sys-turn-' + g + 'n') >= 0) { var nv = Number(t.value); if (g === 'act') x.n = nv; else if (t.value.trim() && isFinite(nv)) x.secs = nv; else delete x.secs; }
        else return true;
    } else return false;
    markDirty(); patchErrors(); return true;
}
function onTurnChange(t) {
    var c = t.className || ''; if (typeof c !== 'string') return false;
    if (c.indexOf('sys-turn-mvu') >= 0) turnDraft().unit = t.value;
    else if (c.indexOf('sys-turn-diag') >= 0) { var tn = turnDraft(); if (t.value === 'one' || t.value === 'alt') tn.diag = t.value; else delete tn.diag; }
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
    else arr.splice(i, 1);
    markDirty(); renderAll(); return true;
}
function renderAll() {
    closeGlyphPicker();   // Stage 6: the rows it was opened from are being redrawn
    if (!draft) return;
    refreshErrors();
    document.querySelectorAll('#systemModal .sys-tabs button').forEach(function(b) { b.classList.toggle('active', b.dataset.tab === tab); });
    ui('sysFields').style.display = tab === 'fields' ? '' : 'none';
    ui('sysRolls').style.display = tab === 'rolls' ? '' : 'none';
    var sc = ui('sysChars'); if (sc) sc.style.display = tab === 'chars' ? '' : 'none';
    var siEl = ui('sysItems'); if (siEl) siEl.style.display = tab === 'items' ? '' : 'none';
    var sfEl = ui('sysEffects'); if (sfEl) sfEl.style.display = tab === 'effects' ? '' : 'none';   // 5h
    var slEl = ui('sysLists'); if (slEl) { slEl.style.display = tab === 'lists' ? '' : 'none'; if (tab === 'lists') renderLists(); }   // Stage 6 F4b
    if (tab === 'lists') renderBudgets();   // 126: the Point budgets box, under the list rules
    var efr = ui('sysEffectRows'); if (efr) { efr.textContent = ''; if (!draft.effects || !draft.effects.length) efr.appendChild(el('div', 'sys-empty', 'No status effects yet. Add Rage, Prone, Blessed\u2026 each with the numbers it changes, then put a Status effects field on the sheet.')); (draft.effects || []).forEach(function(d) { efr.appendChild(effectRow(d)); }); }
    var sl = ui('sysLayout'); if (sl) { sl.style.display = tab === 'layout' ? '' : 'none'; if (tab === 'layout') renderLayout(); }
    var scal = ui('sysCalendar'); if (scal) { scal.style.display = tab === 'calendar' ? '' : 'none'; if (tab === 'calendar') renderCalendar(); }   // item 20 K1: the calendar
    var fr = ui('sysFieldRows'); fr.textContent = '';
    if (!draft.fields.length) fr.appendChild(el('div', 'sys-empty', 'No fields yet. Add one, or Start from a preset.'));
    draft.fields.forEach(function(f) { fr.appendChild(fieldRow(f)); });
    var rr = ui('sysRollRows'); rr.textContent = '';
    if (!draft.rolls.length) rr.appendChild(el('div', 'sys-empty', 'No rolls yet. A roll is a formula with dice, as a button on the sheet: d20 + STRmod. Set its Kind to Apply for a button that moves pools or numbers instead (Apply costs, Apply wounds).'));
    draft.rolls.forEach(function(r) { rr.appendChild(rollRow(r)); });
    var itr = ui('sysItemRows'); if (itr) { itr.textContent = ''; if (!draft.items || !draft.items.length) itr.appendChild(el('div', 'sys-empty', 'No items yet. Add weapons, gear or explosives your characters can carry — an item with a blast area can be thrown from the sheet.')); (draft.items || []).forEach(function(it) { itr.appendChild(itemRow(it)); }); renderCombat(); }
    var cr = ui('sysCharRows'); if (cr) { cr.textContent = ''; var camp = getActiveCampaign(), list = charList(camp); if (!list.length) cr.appendChild(el('div', 'sys-empty', 'No characters yet. New character here, or "New character from this token" in a token\'s Properties.')); list.forEach(function(c) { cr.appendChild(charRow(c, camp)); }); charFilter(); }
    var note = ui('sysFeatureNote'); if (note) note.style.display = featureOn() ? 'none' : '';
    patchErrors();
}
function fieldOfRow(target) { var row = target.closest('.sys-row'); if (!row || row.dataset.cid || row.dataset.iid || row.dataset.eid) return null; return { row: row, f: draft.fields.find(function(x) { return x.id === row.dataset.id; }), r: draft.rolls.find(function(x) { return x.id === row.dataset.id; }) }; }
function itemOfRow(target) { var row = target.closest && target.closest('.sys-item-row'); if (!row) return null; return (draft.items || []).find(function(x) { return x.id === row.dataset.iid; }) || null; }
function onInput(e) {
    if (!draft) return;
    var t = e.target; if (onLayoutInput(t)) return;
    if (onTurnInput(t)) return;   // turn-based combat T1
    if (onLightInput(t)) return;   // lighting L4
    if (onSensesInput(t)) return;   // senses S2a
    if (onRangeInput(t)) return;   // range penalties R1
    if (onPostureInput(t)) return;   // conditions C3
    if (onInitInput(t)) return;   // initiative O2
    if (onBudgetInput(t)) return;   // 126: the Lists tab's point budgets
    if (onHeightInput(t)) return;   // item 19 H2
    if (onCalendarInput(t)) return;   // item 20 K1
    var fxd = fxOfRow(t);   // 5h: a library effect's text boxes
    if (fxd) {
        var fc = t.className || '';
        if (fc.indexOf('sys-fx-name') >= 0) fxd.name = t.value.slice(0, LIMITS.name);
        else if (fc.indexOf('sys-fx-icon') >= 0) fxd.icon = t.value.slice(0, 32);
        else if (fc.indexOf('sys-fx-dur') >= 0) fxd.dur = t.value.slice(0, 200);
        else if (fc.indexOf('sys-fx-notes') >= 0) fxd.notes = t.value.slice(0, LIMITS.text);
        else if (fc.indexOf('sys-fx-auto') >= 0) { var auV = t.value.slice(0, LIMITS.formula); if (auV.trim()) fxd.auto = auV; else delete fxd.auto; }   // conditions C4: the automatic formula (emptied: the key goes)
        else if (fc.indexOf('sys-fx-amt') >= 0) { var mln = t.closest('.sys-fx-mod'), mm = mln ? (fxd.mods || [])[+mln.dataset.mi] : null; if (mm) mm.v = t.value === '' ? 0 : Number(t.value); }
        else return;
        markDirty(); patchErrors(); return;
    }
    var it = itemOfRow(t);
    if (it) {
        var ic = t.className || '';
        if (ic.indexOf('sys-item-name') >= 0) it.name = t.value.slice(0, LIMITS.name);
        else if (ic.indexOf('sys-item-cat') >= 0) it.category = t.value.slice(0, LIMITS.category);
        else if (ic.indexOf('sys-item-ft') >= 0) { if (it.area) it.area.ft = t.value === '' ? 0 : Number(t.value); }
        else if (ic.indexOf('sys-item-damage') >= 0) it.damage = t.value;
        else if (ic.indexOf('sys-item-cost') >= 0) it.cost = t.value;
        else if (ic.indexOf('sys-item-throw') >= 0) it.throwSkill = t.value.trim();
        else if (ic.indexOf('sys-item-icon') >= 0) it.icon = t.value.slice(0, 32);   // Save keeps an emoji's first 8 code points, or a bundled icon's name
        else if (ic.indexOf('sys-item-notes') >= 0) it.notes = t.value.slice(0, LIMITS.text);
        else if (ic.indexOf('sys-item-rmtext') >= 0) it.rmMsg = t.value.slice(0, LIMITS.rmMsg);   // Stage 6
        else if (ic.indexOf('sys-item-eqtext') >= 0) it.eqMsg = t.value.slice(0, LIMITS.rmMsg);   // F4b
        else if (ic.indexOf('sys-item-key') >= 0) { var ikv = t.value.trim().slice(0, 40); if (ikv) it.key = ikv; else delete it.key; }
        else if (ic.indexOf('sys-item-lvl') >= 0) { if (String(t.value).trim() === '') delete it.lvl; else it.lvl = Number(t.value); }
        else if (ic.indexOf('sys-item-mamt') >= 0) { var iml = t.closest('.sys-item-mod'), imm = iml ? (it.mods || [])[+iml.dataset.mi] : null; if (imm) imm.v = t.value === '' ? 0 : Number(t.value); }   // F6
        else if (ic.indexOf('sys-item-stat') >= 0) { var sk = t.dataset.sk || ''; if (!STAT_KEY.test(sk) || (sk in Object.prototype) || (sk.toLowerCase() in Object.prototype)) return; if (t.validity && t.validity.badInput) return; var ist = it.stats && typeof it.stats === 'object' && !Array.isArray(it.stats) ? it.stats : {}, sv = String(t.value).trim(); Object.keys(ist).forEach(function(k2) { if (k2 !== sk && k2.toLowerCase() === sk.toLowerCase()) delete ist[k2]; }); if (sv === '') delete ist[sk]; else if (t.dataset.pick === '1') ist[sk] = sv; else { var sn = Number(sv); if (!isFinite(sn)) return; ist[sk] = sn; } if (Object.keys(ist).length) it.stats = ist; else delete it.stats; }   // Stage 6 F4c1: a stat box (its key checked first: never a prototype name)
        else return;
        markDirty(); patchErrors(); return;
    }
    var lcd = listOfCard(t);
    if (lcd) {   // Stage 6 F4b: the Lists tab's boxes (Save cleans them)
        var lcc = t.className || '', lsp = lcd.list || (lcd.list = {}), lvD = lsp.lvl && typeof lsp.lvl === 'object' ? lsp.lvl : null, numOr = function(o, k) { if (t.validity && t.validity.badInput) return; if (String(t.value).trim() === '') delete o[k]; else o[k] = Number(t.value); };
        if (lcc.indexOf('sys-list-lvllabel') >= 0 && lvD) lvD.label = t.value.slice(0, LIMITS.label);
        else if (lcc.indexOf('sys-list-lvlmin') >= 0 && lvD) numOr(lvD, 'min');
        else if (lcc.indexOf('sys-list-lvlmax') >= 0 && lvD) numOr(lvD, 'max');
        else if (lcc.indexOf('sys-list-lvlstep') >= 0 && lvD) numOr(lvD, 'step');
        else if (lcc.indexOf('sys-list-lvldef') >= 0 && lvD) numOr(lvD, 'def');
        else if (lcc.indexOf('sys-list-lvlnames') >= 0 && lvD) { var lvn = t.value.split(',').map(function(s) { return s.trim(); }).slice(0, LIMITS.labels); while (lvn.length && !lvn[lvn.length - 1]) lvn.pop(); if (lvn.some(Boolean)) lvD.labels = lvn; else delete lvD.labels; }
        else if (lcc.indexOf('sys-list-onlabel') >= 0 && lsp.on && typeof lsp.on === 'object') lsp.on.label = t.value.slice(0, LIMITS.label);
        else if (lcc.indexOf('sys-list-malf') >= 0) {   // Stage 6 HUD R3: a list roll's Malf (Save cleans it)
            var mrw = t.closest('.sys-list-needsrow'), mL = Array.isArray(lsp.rolls) ? lsp.rolls : null, mR = mrw && mL ? mL[+mrw.dataset.ri] : null; if (!mR || typeof mR !== 'object') return;
            if (t.value.trim()) mR.malf = t.value.slice(0, LIMITS.formula); else delete mR.malf;
        }
        else if (lcc.indexOf('sys-list-needs') >= 0) {   // Stage 6 HUD R2b: a list roll's needs (Save cleans them)
            var nrw = t.closest('.sys-list-needsrow'), nL = Array.isArray(lsp.rolls) ? lsp.rolls : null, nR = nrw && nL ? nL[+nrw.dataset.ri] : null; if (!nR || typeof nR !== 'object') return;
            if (lcc.indexOf('sys-list-needstext') >= 0) { if (t.value.trim()) nR.needsText = t.value.slice(0, LIMITS.label); else delete nR.needsText; }
            else { if (t.value.trim()) nR.needs = t.value.slice(0, LIMITS.formula); else delete nR.needs; }
        }
        else if (lcc.indexOf('sys-list-ct') >= 0) {   // Stage 6 HUD R2: a counter's boxes (Save cleans them)
            var ctrw = t.closest('.sys-list-ct'), ctix = ctrw ? +ctrw.dataset.ti : -1, ctL = Array.isArray(lsp.counters) ? lsp.counters : null; if (!ctL || !(ctix >= 0 && ctix < ctL.length)) return;
            var ctD = ctL[ctix] && typeof ctL[ctix] === 'object' && !Array.isArray(ctL[ctix]) ? ctL[ctix] : (ctL[ctix] = {});
            if (lcc.indexOf('sys-list-ctkey') >= 0) ctD.key = t.value.trim().slice(0, 24);
            else if (lcc.indexOf('sys-list-ctlabel') >= 0) ctD.label = t.value.slice(0, LIMITS.label);
            else if (lcc.indexOf('sys-list-ctmax') >= 0) { if (t.value.trim()) ctD.max = t.value.slice(0, LIMITS.formula); else delete ctD.max; }
            else if (lcc.indexOf('sys-list-ctdef') >= 0) { var cdn = Number(t.value); if (String(t.value).trim() === '' || !isFinite(cdn)) delete ctD.def; else ctD.def = cdn; }
            else return;
        }
        else if (lcc.indexOf('sys-list-applyformula') >= 0) {   // Stage 6 HUD H7b: a list action's amount (Save cleans it)
            var arw = t.closest('.sys-list-applyrow'), aL = Array.isArray(lsp.rolls) ? lsp.rolls : null, aR = arw && aL ? aL[+arw.dataset.ri] : null, aKy = arw && arw.dataset.k === 'then' ? 'then' : 'apply', aC = aR && Array.isArray(aR[aKy]) ? aR[aKy][+arw.dataset.ai] : null;   // R2b: or a roll's consequence
            if (!aC || typeof aC !== 'object') return; aC.formula = t.value.slice(0, LIMITS.formula);
        }
        else if (lcc.indexOf('sys-list-roll') >= 0) {   // Stage 6 F5b: a roll's boxes (Save cleans them)
            var rrw = t.closest('.sys-list-roll'), rix = rrw ? +rrw.dataset.ri : -1, rL = Array.isArray(lsp.rolls) ? lsp.rolls : null; if (!rL || !(rix >= 0 && rix < rL.length)) return;
            var rD = rL[rix] && typeof rL[rix] === 'object' && !Array.isArray(rL[rix]) ? rL[rix] : (rL[rix] = {});
            if (lcc.indexOf('sys-list-rolllabel') >= 0) rD.label = t.value.slice(0, LIMITS.label);
            else if (lcc.indexOf('sys-list-rollformula') >= 0) rD.formula = t.value.slice(0, LIMITS.formula);
            else return;
        }
        else if (lcc.indexOf('sys-list-col') >= 0) {   // Stage 6 F5a1: a column's boxes (Save cleans them)
            var crw = t.closest('.sys-list-col'), cix = crw ? +crw.dataset.ci : -1, cL = Array.isArray(lsp.cols) ? lsp.cols : null; if (!cL || !(cix >= 0 && cix < cL.length)) return;
            var cD = cL[cix] && typeof cL[cix] === 'object' && !Array.isArray(cL[cix]) ? cL[cix] : (cL[cix] = {});
            if (lcc.indexOf('sys-list-colkey') >= 0) cD.key = t.value.trim().slice(0, 24);
            else if (lcc.indexOf('sys-list-collabel') >= 0) cD.label = t.value.slice(0, LIMITS.label);
            else if (lcc.indexOf('sys-list-colformula') >= 0) cD.formula = t.value.slice(0, LIMITS.formula);
            else if (lcc.indexOf('sys-list-colunit') >= 0) { if (t.value.trim()) cD.unit = t.value.slice(0, LIMITS.unit); else delete cD.unit; }
            else if (lcc.indexOf('sys-list-colnames') >= 0) { var cln = t.value.split(',').map(function(s) { return s.trim(); }).slice(0, LIMITS.labels); while (cln.length && !cln[cln.length - 1]) cln.pop(); if (cln.some(Boolean)) cD.labels = cln; else delete cD.labels; }
            else return;
            var nCard = t.closest('.sys-list-card'), nLine = nCard ? nCard.querySelector('.sys-list-names') : null; if (nLine) nLine.textContent = listNamesText(lcd.key, lsp);   // the names line follows a key as it is typed
        }
        else if (lcc.indexOf('sys-list-stat') >= 0) {   // Stage 6 F4c1: a stat's boxes
            var srw = t.closest('.sys-list-stat'), sti = srw ? +srw.dataset.si : -1, stL = Array.isArray(lsp.stats) ? lsp.stats : null; if (!stL || !(sti >= 0 && sti < stL.length)) return;
            var stD = stL[sti] && typeof stL[sti] === 'object' && !Array.isArray(stL[sti]) ? stL[sti] : (stL[sti] = {});
            if (lcc.indexOf('sys-list-statkey') >= 0) statKeyInput(lsp, stL, sti, t.value);   // the price follows its own stat's key
            else if (lcc.indexOf('sys-list-statopts') >= 0) stD.opts = t.value.split(',').map(function(p) { var q = p.split('='), lb = q[0].trim(), nm = (q.length > 1 ? q.slice(1).join('=') : q[0]).trim(); return { label: lb.slice(0, LIMITS.label), name: nm.slice(0, 64) }; }).filter(function(o) { return o.label && o.name; }).slice(0, LIMITS.pickOpts);   // Stage 6 F5a2: "Strength = ST, DX" (Save cleans them)
            else if (lcc.indexOf('sys-list-statlabel') >= 0) stD.label = t.value.slice(0, LIMITS.label);
            else if (lcc.indexOf('sys-list-statdef') >= 0) numOr(stD, 'def');
            else if (lcc.indexOf('sys-list-statnames') >= 0) { var stn = t.value.split(',').map(function(s) { return s.trim(); }).slice(0, LIMITS.labels); while (stn.length && !stn[stn.length - 1]) stn.pop(); if (stn.some(Boolean)) stD.labels = stn; else delete stD.labels; }
            else return;
            var pCard = t.closest('.sys-list-card'), pSel = pCard ? pCard.querySelector('.sys-list-price') : null; if (pSel) priceOptions(pSel, lsp);   // the Price choices follow a key or a label as it is typed
        }
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
        else if (c.indexOf('sys-vnames') >= 0) { var vn = t.value.split(',').map(function(s) { return s.trim(); }).slice(0, LIMITS.labels); while (vn.length && !vn[vn.length - 1]) vn.pop(); if (vn.some(Boolean)) f.labels = vn; else delete f.labels; }   // Stage 6: a blank between names keeps its place (every later name keeps its number)
        else if (c.indexOf('sys-res-icon') >= 0) { if (t.value.trim()) f.icon = t.value.slice(0, 32); else delete f.icon; }   // Fold B
        else if (c.indexOf('sys-res-color') >= 0) { if (/^#[0-9a-fA-F]{6}$/.test(t.value)) f.color = t.value.toLowerCase(); }   // Stage 6 look fold (L7)
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
        if (c.indexOf('sys-apply-formula') >= 0) { var chI = applyChangeOf(t, r); if (!chI) return; chI.formula = t.value.slice(0, LIMITS.formula); }   // Stage 6 HUD H7: a change's amount
        else if (c.indexOf('sys-label') >= 0) r.label = t.value.slice(0, LIMITS.label);
        else if (c.indexOf('sys-formula') >= 0) r.formula = t.value;
        else if (c.indexOf('sys-roll-icon') >= 0) { if (t.value.trim()) r.icon = t.value.slice(0, 32); else delete r.icon; }   // Stage 6 look fold
        else if (c.indexOf('sys-roll-malf') >= 0) { if (t.value.trim()) r.malf = t.value.slice(0, LIMITS.formula); else delete r.malf; }   // Stage 6 HUD R3
        else if (c.indexOf('sys-roll-evn') >= 0) everyEdit(r, c, t);   // item 20 K5
        else return;
    } else return;
    markDirty(); patchErrors();
}
function onChange(e) {
    if (!draft) return;
    var t = e.target, c = t.className || '';
    if (onLayoutChange(t)) return;
    if (onTurnChange(t)) return;   // turn-based combat T1
    if (onLightChange(t)) return;   // lighting L4
    if (onSensesChange(t)) return;   // senses S2a
    if (onRangeChange(t)) return;   // range penalties R1
    if (onPostureChange(t)) return;   // conditions C3
    if (onInitChange(t)) return;   // initiative O2
    if (onBudgetChange(t)) return;   // 126
    if (onHeightChange(t)) return;   // item 19 H2
    if (onCalendarChange(t)) return;   // item 20 K1
    if (c.indexOf('sys-combat-auto') >= 0) { draft.combat.blastAuto = t.value; markDirty(); patchErrors(); return; }
    if (c.indexOf('sys-combat-roller') >= 0) { draft.combat.blastRoller = t.value; markDirty(); patchErrors(); return; }
    if (c.indexOf('sys-combat-checks') >= 0) { if (t.value === 'under3d6') draft.combat.checks = 'under3d6'; else delete draft.combat.checks; markDirty(); patchErrors(); return; }   // Stage 6 F8
    if (c.indexOf('sys-combat-hp') >= 0) { draft.combat.hpResource = t.value; markDirty(); patchErrors(); return; }
    if (c.indexOf('sys-combat-cover-on') >= 0) { if (!draft.combat.cover) draft.combat.cover = { on: false, style: 'graded' }; draft.combat.cover.on = t.value === 'on'; markDirty(); patchErrors(); renderCombat(); return; }
    if (c.indexOf('sys-combat-height-rule') >= 0) { var hrD = draft.combat.height && typeof draft.combat.height === 'object' && !Array.isArray(draft.combat.height) ? draft.combat.height : null; if (t.value === 'clears') draft.combat.height = Object.assign({}, hrD || {}, { rule: 'clears' }); else if (hrD) { delete hrD.rule; if (!Object.keys(hrD).length) delete draft.combat.height; } markDirty(); patchErrors(); return; }   // item 19 H1
    if (c.indexOf('sys-combat-cover-style') >= 0) { if (!draft.combat.cover) draft.combat.cover = { on: false, style: 'graded' }; draft.combat.cover.style = t.value === 'binary' ? 'binary' : 'graded'; markDirty(); patchErrors(); renderCombat(); return; }
    if (c.indexOf('sys-combat-cover-area') >= 0) { var cvA = draft.combat.cover || (draft.combat.cover = { on: false, style: 'graded' }), gA = t.dataset.grade; if (['half', 'threeq', 'cover', 'total'].indexOf(gA) < 0) return; var arA = cvA.area && typeof cvA.area === 'object' ? cvA.area : {}; if (t.value === 'half' || t.value === 'none') arA[gA] = t.value; else delete arA[gA]; if (Object.keys(arA).length) cvA.area = arA; else delete cvA.area; markDirty(); patchErrors(); return; }   // cover follow-ups
    if (c.indexOf('sys-listrules-stats') >= 0 || c.indexOf('sys-listrules-upload') >= 0) { var lr = Object.assign({}, draft.listRules || {}); if (c.indexOf('sys-listrules-stats') >= 0) { if (t.value === 'owner') lr.ownerStats = true; else delete lr.ownerStats; } else { if (t.value === 'facts') lr.uploadFacts = true; else delete lr.uploadFacts; } if (Object.keys(lr).length) draft.listRules = lr; else delete draft.listRules; markDirty(); patchErrors(); return; }   // Stage 6: settings A and B   // Stage 6 F4c2: Setting A
    var fxc = fxOfRow(t);   // 5h: a library effect's selects
    if (fxc) {
        if (c.indexOf('sys-fx-tone') >= 0) { fxc.tone = t.value; markDirty(); patchErrors(); return; }
        if (c.indexOf('sys-fx-vis') >= 0) { fxc.vis = t.value; markDirty(); patchErrors(); return; }
        if (c.indexOf('sys-fx-target') >= 0) {
            var tln = t.closest('.sys-fx-mod'), tm = tln ? (fxc.mods || [])[+tln.dataset.mi] : null;
            if (tm) { var tp = t.value.split('|'); tm.f = tp[0]; if (tp[1] === 'on') { tm.op = 'on'; delete tm.v; delete tm.part; } else { tm.op = 'add'; if (typeof tm.v !== 'number') tm.v = 1; if (tp[1] === 'max') tm.part = 'max'; else delete tm.part; } markDirty(); renderAll(); }
            return;
        }
        return;
    }
    var iit = itemOfRow(t);
    if (iit) {
        if (c.indexOf('sys-item-vis') >= 0) { iit.vis = t.value; markDirty(); patchErrors(); return; }
        if (c.indexOf('sys-item-mtarget') >= 0) { var itl = t.closest('.sys-item-mod'), itm = itl ? (iit.mods || [])[+itl.dataset.mi] : null; if (itm) { var itp = t.value.split('|'); itm.f = itp[0]; if (itp[1] === 'on') { itm.op = 'on'; delete itm.v; delete itm.part; delete itm.lvl; } else { itm.op = 'add'; if (typeof itm.v !== 'number') itm.v = 1; if (itp[1] === 'max') itm.part = 'max'; else delete itm.part; } markDirty(); renderAll(); } return; }   // F6
        if (c.indexOf('sys-item-mlvl') >= 0) { var ivl = t.closest('.sys-item-mod'), ivm = ivl ? (iit.mods || [])[+ivl.dataset.mi] : null; if (ivm) { if (t.checked) ivm.lvl = true; else delete ivm.lvl; markDirty(); patchErrors(); } return; }
        if (c.indexOf('sys-item-modson') >= 0) { if (t.checked) iit.modsOn = true; else delete iit.modsOn; markDirty(); patchErrors(); return; }
        if (c.indexOf('sys-item-rmmode') >= 0) { if (t.value === 'bound' || t.value === 'curse') iit.rm = t.value; else delete iit.rm; markDirty(); renderAll(); return; }   // Stage 6
        if (c.indexOf('sys-item-eqmode') >= 0) { if (t.value === 'bound' || t.value === 'curse') iit.eq = t.value; else delete iit.eq; markDirty(); renderAll(); return; }   // F4b
        if (c.indexOf('sys-item-shape') >= 0) { if (t.value === '') iit.area = null; else iit.area = { ft: iit.area ? iit.area.ft : 12, shape: 'circle', name: iit.area ? iit.area.name : '' }; markDirty(); renderAll(); return; }
        if (c.indexOf('sys-item-cat') >= 0) { var nsc = itemStatDefs(iit).map(function(s) { return s.key.toLowerCase(); }).join(','); if (nsc !== (t.dataset.scope || '')) { markDirty(); renderAll(); } return; }   // F4c1: a category that changes which lists it can be on redraws its stat boxes
        return;
    }
    var lch = listOfCard(t);
    if (lch) {   // Stage 6 F4b: the Lists tab's ticks
        var lsc = lch.list || (lch.list = {});
        if (c.indexOf('sys-list-catcb') >= 0) { var cur = Array.isArray(lsc.cats) ? lsc.cats.slice() : [], cx = t.dataset.cat || '', ci = cur.findIndex(function(y) { return String(y).toLowerCase() === cx.toLowerCase(); }); if (t.checked && ci < 0) cur.push(cx); if (!t.checked && ci >= 0) cur.splice(ci, 1); if (cur.length) lsc.cats = cur; else delete lsc.cats; }
        else if (c.indexOf('sys-list-multi') >= 0) { if (t.checked) lsc.multi = true; else delete lsc.multi; }
        else if (c.indexOf('sys-list-noqty') >= 0) { if (t.checked) lsc.noQty = true; else delete lsc.noQty; }
        else if (c.indexOf('sys-list-custom') >= 0) { if (t.checked) lsc.custom = true; else delete lsc.custom; }   // Stage 6 F4c3
        else if (c.indexOf('sys-list-haslvl') >= 0) { if (t.checked) lsc.lvl = { label: 'Level', min: 0, step: 1, def: 0 }; else delete lsc.lvl; }
        else if (c.indexOf('sys-list-hason') >= 0) { if (t.checked) lsc.on = { label: 'On' }; else delete lsc.on; }
        else if (c.indexOf('sys-list-ondef') >= 0) { if (lsc.on && typeof lsc.on === 'object') { if (t.checked) lsc.on.def = true; else delete lsc.on.def; } }
        else if (c.indexOf('sys-list-colhide') >= 0 || c.indexOf('sys-list-colfoot') >= 0) { var chr = t.closest('.sys-list-col'), chD = chr && Array.isArray(lsc.cols) ? lsc.cols[+chr.dataset.ci] : null; if (!chD || typeof chD !== 'object') return; var chK = c.indexOf('sys-list-colhide') >= 0 ? 'hide' : 'foot'; if (t.checked) chD[chK] = true; else delete chD[chK]; }   // Stage 6 F5a1
        else if (c.indexOf('sys-list-statkind') >= 0) { var skr = t.closest('.sys-list-stat'), skD = skr && Array.isArray(lsc.stats) ? lsc.stats[+skr.dataset.si] : null; if (!skD || typeof skD !== 'object') return; delete skD.def; delete skD.labels; if (t.value === 'pick') { skD.kind = 'pick'; skD.opts = Array.isArray(skD.opts) ? skD.opts : []; if (typeof lsc.price === 'string' && skD.key && lsc.price.toLowerCase() === String(skD.key).toLowerCase()) delete lsc.price; } else { delete skD.kind; delete skD.opts; } markDirty(); renderAll(); return; }   // Stage 6 F5a2: a number or a choice (a choice is never the price)
        else if (c.indexOf('sys-list-statpdef') >= 0) { var spr = t.closest('.sys-list-stat'), spD = spr && Array.isArray(lsc.stats) ? lsc.stats[+spr.dataset.si] : null; if (!spD || typeof spD !== 'object') return; if (t.value) spD.def = t.value; else delete spD.def; }   // Stage 6 F5a2: a choice's default
        else if (c.indexOf('sys-list-statshow') >= 0 || c.indexOf('sys-list-stathide') >= 0) { var ssr = t.closest('.sys-list-stat'), ssD = ssr && Array.isArray(lsc.stats) ? lsc.stats[+ssr.dataset.si] : null; if (!ssD || typeof ssD !== 'object') return; statTick(ssD, c.indexOf('sys-list-stathide') >= 0 ? 'hide' : 'show', t.checked, ssr); }   // Stage 6 F4c1; 1.5.4: Hidden
        else if (c.indexOf('sys-list-dmg') >= 0) { var rdr = t.closest('.sys-list-roll'), rdD = rdr && Array.isArray(lsc.rolls) ? lsc.rolls[+rdr.dataset.ri] : null; if (!rdD || typeof rdD !== 'object') return; if (t.checked) rdD.dmg = true; else delete rdD.dmg; }   // chat cards: a damage roll
        else if (c.indexOf('sys-list-rollcost') >= 0) { var rcr = t.closest('.sys-list-roll'), rcD = rcr && Array.isArray(lsc.rolls) ? lsc.rolls[+rcr.dataset.ri] : null; if (!rcD || typeof rcD !== 'object') return; if (t.value) rcD.cost = t.value; else delete rcD.cost; }   // turn-based combat T1
        else if (c.indexOf('sys-list-rollkind') >= 0) { var rkr = t.closest('.sys-list-roll'), rkD = rkr && Array.isArray(lsc.rolls) ? lsc.rolls[+rkr.dataset.ri] : null; if (!rkD || typeof rkD !== 'object') return; if (t.value === 'apply') { if (!Array.isArray(rkD.apply)) rkD.apply = [{ f: '', formula: '' }]; } else delete rkD.apply; }   // Stage 6 HUD H7b: Roll | Apply (a formula typed before stays in the draft)
        else if (c.indexOf('sys-list-applytarget') >= 0 || c.indexOf('sys-list-applyop') >= 0 || c.indexOf('sys-list-applywhen') >= 0) { var atr = t.closest('.sys-list-applyrow'), atR = atr && Array.isArray(lsc.rolls) ? lsc.rolls[+atr.dataset.ri] : null, atK = atr && atr.dataset.k === 'then' ? 'then' : 'apply', atC = atR && Array.isArray(atR[atK]) ? atR[atK][+atr.dataset.ai] : null; if (!atC || typeof atC !== 'object') return; if (c.indexOf('sys-list-applytarget') >= 0) { if (t.value.indexOf('c:') === 0) { atC.c = t.value.slice(2); delete atC.f; } else { atC.f = t.value; delete atC.c; } } else if (c.indexOf('sys-list-applywhen') >= 0) { if (t.value === 'hit' || t.value === 'miss' || t.value === 'malf') atC.when = t.value; else delete atC.when; } else { delete atC.add; delete atC.set; if (t.value === 'add') atC.add = true; else if (t.value === 'set') atC.set = true; } }   // R2b: a counter, a consequence's When
        else if (c.indexOf('sys-list-price') >= 0) { _priceAt.delete(lsc); if (t.value) lsc.price = t.value; else delete lsc.price; }
        else return;
        markDirty(); renderAll(); return;
    }
    var crow = t.closest && t.closest('.sys-char-row');
    if (crow) {   // characters save as you go
        var camp = getActiveCampaign(), ch = charById(crow.dataset.cid, camp); if (!ch) return;
        if (c.indexOf('sys-char-name') >= 0) { ch.name = t.value.trim().slice(0, LIMITS.charName) || ch.name; t.value = ch.name; nameInStep(camp, ch); afterCharChange(ch, true); }
        else if (c.indexOf('sys-char-owner') >= 0) { giveCharacter(t.value, ch.id); renderAll(); }
        else if (c.indexOf('sys-char-plays') >= 0) { if (t.checked && ch.ownerId) giveCharacter(ch.ownerId, ch.id); renderAll(); }
        else if (c.indexOf('sys-char-npc') >= 0) { if (t.checked && ch.ownerId) giveCharacter('', ch.id); ch.npc = t.checked; afterCharChange(ch, true); renderAll(); }
        return;
    }
    var ctx = fieldOfRow(t); if (!ctx) return;
    var f = ctx.f, r = ctx.r;
    if (f) {
        if (c.indexOf('sys-kind') >= 0) { f.kind = t.value; delete f.formula; delete f.maxFormula; delete f.base; delete f.options; f.def = f.kind === 'toggle' ? false : f.kind === 'text' || f.kind === 'select' ? '' : f.kind === 'resource' ? 'max' : 0; if (f.kind === 'resource' && f.min === undefined) f.min = 0; markDirty(); renderAll(); return; }
        if (c.indexOf('sys-edit') >= 0) f.edit = t.value;
        else if (c.indexOf('sys-vis') >= 0) f.vis = t.value;
        else if (c.indexOf('sys-hover-chk') >= 0) f.hover = t.checked;
        else if (c.indexOf('sys-live-sel') >= 0) { if (t.value === 'on') f.live = true; else if (t.value === 'off') f.live = false; else delete f.live; }   // the sheet's lock
        else if (c.indexOf('sys-tile-chk') >= 0) { if (t.checked) f.tile = true; else delete f.tile; }   // Stage 3: stat-tile display
        else if (c.indexOf('sys-sign-chk') >= 0) { if (t.checked) f.sign = true; else delete f.sign; }   // Stage 5g: colour by sign
        else if (c.indexOf('sys-badge-chk') >= 0) { if (t.checked) f.badge = true; else delete f.badge; markDirty(); renderAll(); return; }   // L7: the tones row follows
        else if (c.indexOf('sys-tone-sel') >= 0) { var tiN = Number(t.dataset.ti), tArr = Array.isArray(f.tones) ? f.tones.slice() : []; if (isFinite(tiN) && tiN >= 0 && tiN < LIMITS.labels) { while (tArr.length <= tiN) tArr.push(''); tArr[tiN] = t.value; while (tArr.length && !tArr[tArr.length - 1]) tArr.pop(); if (tArr.length) f.tones = tArr; else delete f.tones; } }   // L7
        else if (c.indexOf('sys-res-color') >= 0) { markDirty(); renderAll(); return; }   // L7: a colour picked — "No colour" appears
        else if (c.indexOf('sys-reset-chk') >= 0) { if (t.checked) f.reset = true; else delete f.reset; }   // Fold B: fill-to-max button
        else if (c.indexOf('sys-bar-chk') >= 0) { if (t.checked) delete f.bar; else f.bar = false; }   // Fold B: the bar (absent = shown)
        else if (c.indexOf('sys-slider-chk') >= 0) { if (t.checked) { f.slider = f.slider || {}; delete f.counter; } else delete f.slider; markDirty(); renderAll(); return; }   // Stage 5e: slider on/off (its row of labels and colours appears)
        else if (c.indexOf('sys-counter-chk') >= 0) { if (t.checked) { f.counter = true; delete f.slider; } else delete f.counter; markDirty(); renderAll(); return; }   // HUD frame (HF4a): counter on/off — a number is a counter or a slider, never both (the other's box hides)
        else if (c.indexOf('sys-slider-lowColor') >= 0 || c.indexOf('sys-slider-highColor') >= 0) { markDirty(); renderAll(); return; }   // a colour picked (the input handler stored it): redraw so "Theme colours" appears
        else if (c.indexOf('sys-itbl-on') >= 0) { if (t.checked) f.table = f.table || { columns: ['category'] }; else delete f.table; markDirty(); renderAll(); return; }   // Stage 4: rich item table on/off (seed one column so it renders)
        else if (c.indexOf('sys-itbl-col-') >= 0) { var col = c.slice(c.indexOf('sys-itbl-col-') + 13).split(/\s/)[0]; f.table = f.table || {}; var arr = Array.isArray(f.table.columns) ? f.table.columns : []; if (t.checked) { if (arr.indexOf(col) < 0) arr.push(col); } else arr = arr.filter(function(x) { return x !== col; }); f.table.columns = arr; }
        else if (c.indexOf('sys-itbl-chips') >= 0) { f.table = f.table || {}; if (t.checked) f.table.chips = true; else delete f.table.chips; }
        else if (c.indexOf('sys-itbl-footer') >= 0) { f.table = f.table || {}; if (t.checked) f.table.footer = true; else delete f.table.footer; }
        else if (c.indexOf('sys-def-bool') >= 0) f.def = t.checked;
        else if (c.indexOf('sys-vnames') >= 0 && f.kind === 'formula' && f.badge) { markDirty(); renderAll(); return; }   // L7: the tones row follows the value names
        else if (c.indexOf('sys-vnames') >= 0) { if (f.kind === 'number') { var rwV = t.closest('.sys-row'), dcV = rwV && rwV.querySelector('.sys-def'), wantCnt = !f.slider && !(Array.isArray(f.labels) && f.labels.length); if (rwV && !!rwV.querySelector('.sys-counter-chk') !== wantCnt) { if (Array.isArray(f.labels) && f.labels.length) delete f.counter; markDirty(); renderAll(); return; } if (dcV) buildDefCell(dcV, f); } markDirty(); patchErrors(); return; }   // HF4a: names given or cleared — the Counter box comes or goes (a named number is never a counter)   // Stage 6: a number's default cell follows (a pick of the names, or its own range back when they are cleared); nothing else in the row moves, so focus stays
        else if (c.indexOf('sys-def-lbl') >= 0) f.def = Number(t.value);
        else return;
    } else if (r) {
        if (c.indexOf('sys-roll-kind') >= 0) { if (t.value === 'apply') { if (!Array.isArray(r.apply)) r.apply = [{ f: '', formula: '' }]; delete r.init; } else { delete r.apply; delete r.round; delete r.each; delete r.by; } markDirty(); renderAll(); return; }   // Stage 6 HUD H7: Roll | Apply (a formula typed before stays in the draft)
        else if (c.indexOf('sys-apply-target') >= 0) { var chT = applyChangeOf(t, r); if (!chT) return; chT.f = t.value; }
        else if (c.indexOf('sys-apply-op') >= 0) { var chO = applyChangeOf(t, r); if (!chO) return; delete chO.add; delete chO.set; if (t.value === 'add') chO.add = true; else if (t.value === 'set') chO.set = true; }
        else if (c.indexOf('sys-apply-when') >= 0) { var chW = applyChangeOf(t, r); if (!chW) return; if (t.value === 'hit' || t.value === 'miss' || t.value === 'malf') chW.when = t.value; else delete chW.when; }   // R1
        else if (c.indexOf('sys-vis') >= 0) r.vis = t.value;
        else if (c.indexOf('sys-roll-tone') >= 0) { if (t.value) r.tone = t.value; else delete r.tone; }   // Stage 6 look fold
        else if (c.indexOf('sys-roll-cost') >= 0) { if (t.value) r.cost = t.value; else delete r.cost; }   // turn-based combat T1
        else if (c.indexOf('sys-roll-each') >= 0) { delete r.round; if (t.value === 'round' || t.value === 'turn') r.each = t.value; else { delete r.each; delete r.by; } markDirty(); renderAll(); return; }   // Stage 6 HUD G10 + turn-based combat T2b
        else if (c.indexOf('sys-roll-by') >= 0) { if (t.value === 'gm' || t.value === 'owner') r.by = t.value; else delete r.by; }
        else if (c.indexOf('sys-roll-evu') >= 0 || c.indexOf('sys-roll-evrest') >= 0) everyEdit(r, c, t);   // item 20 K5
        else if (c.indexOf('sys-dmg-chk') >= 0) { if (t.checked) r.dmg = true; else delete r.dmg; }   // chat cards: a damage roll
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
    if (b.id === 'sysAddEffect') { if (!Array.isArray(draft.effects)) draft.effects = []; if (draft.effects.length >= LIMITS.effects) { toast('At most ' + LIMITS.effects + ' effects.'); return; } draft.effects.push({ id: uid('e_'), name: '', icon: '', tone: '', dur: '', notes: '', vis: 'all', mods: [] }); markDirty(); renderAll(); var lastE = ui('sysEffectRows') && ui('sysEffectRows').lastElementChild; if (lastE) { var ni = lastE.querySelector('.sys-fx-name'); if (ni) ni.focus(); } return; }   // 5h
    if (b.dataset.tab) { tab = b.dataset.tab; renderAll(); return; }
    if (onLayoutClick(b)) return;
    if (!b.dataset.act) return;
    if (turnClick(b)) return;   // turn-based combat T1: the Combat card's actions and time units
    if (lightClick(b)) return;   // lighting L4: the Combat card's light presets
    if (sensesClick(b)) return;   // senses S2a: the Combat card's senses
    if (rangeClick(b)) return;   // range penalties R1: the Combat card's range table
    if (postureClick(b)) return;   // conditions C3: the Combat card
    if (heightClick(b)) return;   // item 19 H2: the Combat card's height table
    if (calendarClick(b)) return;   // item 20 K1: the Calendar tab
    if (budgetClick(b)) return;   // 126: the Lists tab's point budgets
    var crow = b.closest('.sys-char-row');
    if (crow) {
        var camp = getActiveCampaign(), ch = charById(crow.dataset.cid, camp); if (!ch) return;
        if (b.dataset.act === 'open') { openSheet(ch.id); return; }
        if (b.dataset.act === 'hud') { openHud(ch.id); return; }
        if (b.dataset.act === 'delchar') { showConfirm('Delete ' + ch.name + '? Its values are gone; tokens keep their name and lose the link.', function(yes) { if (yes) { deleteCharacter(ch.id); renderAll(); } }); return; }
        if (b.dataset.act === 'portrait') { if (!window.wpPickImage) return; window.wpPickImage(function(src) { if (typeof src === 'string' && /^[/]saves[/]images[/]/.test(src)) framePortrait(ch, src); }); return; }   // the token creator frames it first
        return;
    }
    var erow = b.closest('.sys-fx-row');   // 5h: a library effect's buttons
    if (erow) {
        if (!b.dataset.act) return;
        var ed = (draft.effects || []).find(function(x) { return x.id === erow.dataset.eid; }); if (!ed) return;
        var ei = draft.effects.indexOf(ed), eact = b.dataset.act;
        if (eact === 'up' && ei > 0) { draft.effects.splice(ei, 1); draft.effects.splice(ei - 1, 0, ed); }
        else if (eact === 'down' && ei < draft.effects.length - 1) { draft.effects.splice(ei, 1); draft.effects.splice(ei + 1, 0, ed); }
        else if (eact === 'dup') { var dd = clone(ed); dd.id = uid('e_'); if (dd.name) dd.name = dd.name + ' copy'; draft.effects.splice(ei + 1, 0, dd); }
        else if (eact === 'del') { draft.effects.splice(ei, 1); }
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
        else if (iact === 'del') { draft.items.splice(ii, 1); }
        else if (iact === 'itemmodadd') {   // F6
            var tgI = fxTargets(draft)[0]; if (!tgI) return; iitem.mods = Array.isArray(iitem.mods) ? iitem.mods : [];
            if (iitem.mods.length >= LIMITS.effectMods) { toast('At most ' + LIMITS.effectMods + ' changes per item.'); return; }
            var tpI = tgI[0].split('|'), nmI = { f: tpI[0], op: tpI[1] === 'on' ? 'on' : 'add' }; if (nmI.op === 'add') { nmI.v = 1; if (tpI[1] === 'max') nmI.part = 'max'; }
            iitem.mods.push(nmI);
        }
        else if (iact === 'itemmoddel') { var dlI = b.closest('.sys-item-mod'); if (dlI) (iitem.mods || []).splice(+dlI.dataset.mi, 1); }
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
    if (lcb && /^roll(add|up|down|del)$/.test(b.dataset.act || '')) {   // Stage 6 F5b: a Lists card's roll buttons (add, move, remove)
        var lsr = lcb.list || (lcb.list = {}), rArr = Array.isArray(lsr.rolls) ? lsr.rolls : [], ract = b.dataset.act, rRow = b.closest('.sys-list-roll'), rI = rRow ? +rRow.dataset.ri : -1;
        if (ract === 'rolladd') { if (rArr.length >= LIMITS.rowRolls) { toast('At most ' + LIMITS.rowRolls + ' rolls a list.'); return; } rArr.push({ label: '', formula: '' }); lsr.rolls = rArr; }
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
    else if (act === 'dup') { var d = clone(item); d.id = uid(ctx.f ? 'f_' : 'r_'); if (d.key) d.key = d.key + '2'; list.splice(i + 1, 0, d); }
    else if (act === 'del') { list.splice(i, 1); }
    else if (act === 'slidercl' && item.slider) { delete item.slider.lowColor; delete item.slider.highColor; }   // Stage 5e: the track back to the theme's colours
    else if (act === 'rescolorclr') { delete item.color; }   // Stage 6 look fold (L7): the pool back to the theme's colours
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
        var dr = droppedCounts(j, c), drT = Object.keys(dr).map(function(k) { return dr[k] + ' ' + (dr[k] === 1 ? k.slice(0, -1) : k); }).join(', ');   // Stage 6 library L0: what the file had that was left out is counted, never cut silently
        var nN = function(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };
        toast('Imported ' + (c.name || 'a system') + ': ' + nN(c.fields.length, 'field') + ', ' + nN(c.rolls.length, 'roll') + (c.items && c.items.length ? ', ' + nN(c.items.length, 'item') : '') + (v.ok ? '.' : ', ' + v.errors.length + ' error' + (v.errors.length === 1 ? '' : 's') + ' to fix.') + (drT ? ' Left out (over the limits, or not valid): ' + drT + '.' : ''));
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
    var hdB = ui('sheetHud'); if (hdB) hdB.addEventListener('click', function() { if (sheetOpen) openHud(sheetOpen); });
    var upBt = ui('sheetUpload'); if (upBt) upBt.addEventListener('click', importJson);   // Stage 6 U3
    var picBt = ui('sheetPic'); if (picBt) picBt.addEventListener('click', function(e) { e.stopPropagation(); pickCharPicture(picBt); });   // Onboarding F1c
    var dlBt = ui('sheetDownload'); if (dlBt) dlBt.addEventListener('click', function(e) { e.stopPropagation(); openDownloadMenu(dlBt); });   // Onboarding F2a
    var dnBt = ui('sheetDone'); if (dnBt) dnBt.addEventListener('click', doneMaking);   // Onboarding F3
    var nmBt = ui('sheetName'); if (nmBt) nmBt.addEventListener('click', renameMaking);
    var ulBt = ui('sheetUnlock'); if (ulBt) ulBt.addEventListener('click', function() { if (sheetOpen) unlockChar(sheetOpen); });
    var edBt = ui('sheetEdit'); if (edBt) edBt.addEventListener('click', function() { if (!sheetOpen) return; _sheetEdit = _sheetEdit === sheetOpen ? null : sheetOpen; renderSheet(); });   // the sheet's lock: this viewer's own switch, for the sheet that is open
    var dlBt = ui('sheetDelete'); if (dlBt) dlBt.addEventListener('click', function() { if (sheetOpen) askDeleteSheet(sheetOpen); });
    var cfI = ui('sysCharFilter'); if (cfI) cfI.addEventListener('input', charFilter);
    var rvBt = ui('sheetReview'); if (rvBt) rvBt.addEventListener('click', function() { if (sheetOpen) openReview(sheetOpen); });
    var rvChip = ui('reviewChip'); if (rvChip) rvChip.addEventListener('click', reviewNext);
    var rvC = ui('uploadClose'); if (rvC) rvC.addEventListener('click', closeReview);
    var etB = ui('sheetEndTurn'); if (etB) etB.addEventListener('click', endTurn);   // turn-based combat T2: the player on turn ends it   // HUD frame (HF2a): the reference's header button
    p.addEventListener('pointerdown', function() { raisePanel(p); }, true);
    var dpn = ui('docPanel');   // the doc panel (docpanel.js, not edited here) comes forward when clicked or shown — only while a HUD is open
    if (dpn) { dpn.addEventListener('pointerdown', function() { raisePanel(dpn); }, true); if (window.MutationObserver) { var dpShown = dpn.style.display !== 'none'; new MutationObserver(function() { var now = dpn.style.display !== 'none'; if (now && !dpShown) raisePanel(dpn); dpShown = now; }).observe(dpn, { attributes: true, attributeFilter: ['style'] }); } }
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
    if (!featureOn()) { if (sheetOpen) closeSheet(); closeHuds(); }   // HUD frame (HF2a): each view on its own
    else renderViews(null);
    var chS = window.wpChat; if (chS && chS.lookSync) chS.lookSync();   // chat cards: their colours follow the system's look
}
var _lastCamp = null;
setInterval(function() { var c = getActiveCampaign(), id = c ? c.id : null; if (_lastCamp !== null && id !== _lastCamp) { if (sheetOpen) closeSheet(); closeHuds(); } _lastCamp = id; try { bellFx(null); } catch (e) { console.error(e); } try { renderReviewChip(); } catch (e) { console.error(e); } var chI = window.wpChat; if (chI && chI.lookSync) chI.lookSync(); }, 1000);   // (and the bell's effects feed, for a change no repaint followed)
window.wpSheetsSync = sync;
setTimeout(sync, 0);
window.wpSheets = { bellNote: bellNote, runTimeRules: runTimeRules, startMaking: startMaking, inviteMaking: inviteMaking, applyTokenFace: applyTokenFace, open: open, close: close, playerSystem: playerSystem, readablePages: readablePages, openPage: openPage, sheetRefsChanged: sheetRefsChanged, systemOf: systemOf, save: saveDraft, startFrom: startFrom, sync: sync, roundHook: roundHook, turnHook: turnHook, runDue: runDue, draft: function() { return draft; },
    sbFinder: sbFinder, uploadsChanged: uploadsChanged, openReview: openReview, emojiSet: EMOJI_SET, applyCharFace: applyCharFace, applyCharFrame: applyCharFrame, applyTokenFrame: applyTokenFrame,
    charsOf: charsOf, charList: charList, charById: charById, newCharacter: newCharacter, deleteCharacter: deleteCharacter, linkToken: linkToken, newFromToken: newFromToken, syncOwners: syncOwners, giveCharacter: giveCharacter, unbindName: unbindName, ownerFromToken: ownerFromToken,
    charSelectHtml: charSelectHtml, wireCharSelect: wireCharSelect, hoverLinesForToken: hoverLinesForToken, hoverLinesForTokenId: hoverLinesForTokenId, tokenFx: tokenFx, tokenFxModel: tokenFxModel, tokenFxCharOp: tokenFxCharOp,
    playerFinder: playerFinder, charFromJson: charFromJson, startFromFile: startFromFile,
    openSheet: openSheet, closeSheet: closeSheet, openHud: openHud, closeHud: closeHud, closeHuds: closeHuds, hudFor: hudFor, rolled: rolled, tokenTurned: tokenTurned, tokenCtxFor: tokenCtxFor, canOpen: canOpen, renderSheet: renderViews, renderSheetInto: renderSheetInto, charChanged: charChanged, charGone: charGone, editResult: editResult, sheetOpen: function() { return sheetOpen; }, canRoll: canRoll, hasInitRoll: hasInitRoll, rollInit: rollInit, initTieNow: initTieNow, fromShadowBase: fromShadowBase, LIMITS: LIMITS };

// Pop the open sheet out into its own window (like the doc panel); dock-back there reopens the in-app panel.
(function wireSheetPopout() {
    var pop = document.getElementById('sheetPop');
    if (pop) pop.addEventListener('click', function() {
        var camp = getActiveCampaign(); if (!camp || !sheetOpen || isClient()) return;   // it reads this machine's save: at someone else's table there is nothing to show
        window.open(location.origin + '/?popout=sheet:' + encodeURIComponent(camp.id) + '/' + encodeURIComponent(sheetOpen), 'wpPopout_sheet_' + sheetOpen, 'width=840,height=1000');
        closeSheet();
    });
    try { new BroadcastChannel('waypoint').addEventListener('message', function(e) {
        if (e.data && e.data.type === 'dock' && e.data.kind === 'sheet') { var a = e.data.arg || ''; openSheet(a.slice(a.indexOf('/') + 1)); }
    }); } catch (e) {}
})();
