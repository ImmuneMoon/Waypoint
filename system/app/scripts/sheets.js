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
import { validPageId, LIMITS, KINDS, STORED, DEF_PROP, BAND_KINDS, IDENTITY_KINDS, LEDGER_KINDS, headerEntry, captionParts, emptySystem, uid, validKey, cleanSystem, cleanChar, validateSystem, resolveAll, hoverLines, autoLayout, applyEdit, applyEffectOp, fxText, fmtNum, initRoll, aliasFromShadowBase, sideOf, threatArc, facingCtx, stanceCtx, tokenCtx, POSTURE_IDS, POSTURE_NAMES, charTokenOn, cycleThreat, valueTone, TONES, activeCharOf, playableChars, ownedTokenPlan, applyOwnerOps, migrateBindings, capExpr, cleanValue, fieldById, valueOpts, applyRowOp, rowIdOf, rowDef, orphanRows, stampRows, cleanRowDef, projectRows, PALETTE_KEYS, GLYPHS, glyphPath, headerEdits, pinTargets, pinTargetsAll, hudView, hudHasContent, resetTargets, gmDerivedNames, labelGmNames, gmEffectNames, labelNames, withRound, rowLvl, rowOn, cleanItemKey } from './systemcore.js';

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
// [sinkcheck:sheetimg-start]
function imgSrc(p) { var n = net(), out = n && n.assetSrc ? n.assetSrc(p) : p; return out === p ? picRef(p) : out; }   // unchanged (the GM; a bundled asset): the app's own pictures only — a web address from a file never loads
// [sinkcheck:sheetimg-end]

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
function setInPlay(camp, c) { var r = playerRecOf(camp, c.ownerId, true); if (!r) return; r.charId = c.id; r.charName = c.name; }
// A renamed character keeps its player's name binding in step, but only when it is the one they play (renaming a kept one re-points nothing)
function nameInStep(camp, c) { var r = c.ownerId ? playerRecOf(camp, c.ownerId, false) : null; if (r && r.charId === c.id) r.charName = c.name; }
function ownsTokenNamed(camp, pid, name) { return Object.values(camp.items || {}).some(function(m) { return m && m.type === 'map' && (m.whiteboard || []).some(function(w) { return w && w.isChar && w.ownerId === pid && w.charName === name; }); }); }
// A character left its player (reassigned, unassigned, made an NPC, deleted, taken by the GM): their record stops naming it, and their old name
// binding goes too once they hold no token of that name (so a stale name never hands them a token the GM took back). Runs AFTER the chooser.
function unbindStale(camp, pid, c) { var r = playerRecOf(camp, pid, false); if (!r) return; if (r.charId === c.id) delete r.charId; unbindName(camp, pid, c.name); }
function unbindName(camp, pid, name) { var r = playerRecOf(camp, pid, false); if (r && r.charName === name && !ownsTokenNamed(camp, pid, name)) delete r.charName; }
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
    var prev = c.ownerId || '', was = pid ? activeCharOf(camp, pid).id : null;
    var nearNew = pid && o.nearTok ? spotOnPlayersMap(camp, pid, o.nearTok) : pid && was && was !== c.id ? tokenSpotOf(camp, pid, was) : null, nearPrev = prev && prev !== pid ? tokenSpotOf(camp, prev, c.id) : null;
    c.ownerId = pid; if (pid) c.npc = false;
    if (pid && o.play !== false) setInPlay(camp, c);
    syncOwners(camp, o.keep);
    if (prev && prev !== pid) unbindStale(camp, prev, c);
    afterCharChange(c, true);
    var n = net();
    if (n && n.reconcilePresence) {
        if (pid) n.reconcilePresence(pid, { mode: 'give', keep: o.keep, near: nearNew });
        if (prev && prev !== pid) n.reconcilePresence(prev, { mode: 'give', near: nearPrev });
    }
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
    syncOwners(camp);
    save(true);
    var n = net();
    if (n && n.active && n.role === 'host') { if (whole || !values) n.syncChar(c.id); else n.syncCharDelta(c.id, values); }
    if (window.appRender) window.appRender();
    renderViews(c.id);   // HUD frame (HF2a): the sheet and every HUD of this character
}
function deleteCharacter(id) {
    var camp = getActiveCampaign(), c = charById(id, camp); if (!c) return;
    var prev = c.ownerId || '';
    delete charsOf(camp)[id];
    Object.values(camp.items || {}).forEach(function(m) { if (m && m.type === 'map') (m.whiteboard || []).forEach(function(w) { if (w && w.charId === id) delete w.charId; }); });
    if (prev) { unbindStale(camp, prev, c); syncOwners(camp); var nD = net(); if (nD && nD.logEvent) nD.logEvent('char', c.name + ' deleted (played by ' + (playerNames(camp)[prev] || 'a player') + '; they keep its tokens)'); }   // their leftover tokens stay theirs (by name); another character of theirs may now be in play
    save(true);
    var n = net(); if (n && n.active && n.role === 'host') n.syncCharGone(id);
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
    try { var midH = typeof mapId === 'string' && camp.items && Object.prototype.hasOwnProperty.call(camp.items, mapId) ? mapId : camp.activeItemId, amH = camp.items && camp.items[midH]; return hoverLines(sys, c, F(), withRound(tokenCtx(amH, w, tokenFlags()), combatOn(midH))); } catch (e) { return []; }   // 5h Fold 3 / Stage 6: this token's own facing and stance; HF5b: the combat on its map (HF5 review: the map it stands on, as its sheet reads it)
}
function hoverLinesForTokenId(camp, tokId) {
    if (!camp || !tokId) return [];
    var w = null, onMap = null; Object.keys(camp.items || {}).some(function(id) { var m = camp.items[id]; if (!m || m.type !== 'map') return false; w = (m.whiteboard || []).find(function(x) { return x && x.id === tokId; }) || null; if (w) onMap = id; return !!w; });
    return w ? hoverLinesForToken(w, camp, onMap) : [];
}

/* ---------- the facing dial (Stage 5h Fold 3): a view of the token's own facing, with threat marks formulas read as Arc / Threats ---------- */
var SVGNS = 'http://www.w3.org/2000/svg', _dialSig = '', _dialStale = false, _dialRedraw = null, _dialOn = null, _roundSig = '';   // HF5b: _roundSig, the sheet's combat round
function turningOn() { return window.wpVtt ? !!window.wpVtt.on('turning') : true; }
function vttOn(which) { return window.wpVtt ? !!window.wpVtt.on(which) : true; }
function ruleOn(which) { var v = window.wpVtt; return !v || (v.rulesOn ? v.rulesOn(which) : v.on(which)); }   // Stage 6: the table's setting (a player's "off for me" only hides a control)
function tokenFlags() { return { turning: ruleOn('turning'), posture: ruleOn('posture'), elevation: ruleOn('elevation') }; }   // Stage 6: the features the token names read through — the same gate as the host's rolls
function stanceSigOf(c, camp) {   // what the stance control shows: its rows, the token, its values, who may use it
    var fl = tokenFlags(), t = c ? facingTarget(c, camp) : null, st = t ? stanceCtx(t.tok, fl) : null, n = net();
    return [vttOn('posture'), vttOn('elevation'), t ? t.mapId + '|' + t.tok.id + '|' + (t.tok.ownerId || '') + '|' + (t.tok.locked ? 1 : 0) : '', st ? st.posture + '|' + st.elevation : '', !!(n && (n.paused || n.selfPaused))].join('#');
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
function tokenCtxFor(charId, camp) { var c = charById(charId, camp), t = c ? facingTarget(c, camp) : null; return t ? withRound(tokenCtx(t.map, t.tok, tokenFlags()), combatOn(t.mapId)) : null; }   // Stage 6: { facing, stance } of the token the sheet reads; HF5b: and the round of the combat on its map
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
        return ns.some(function(nm) { var fam = String(nm).toLowerCase().split('.')[0]; return (fam === 'facing' || fam === 'arc' || fam === 'threats' || fam === 'posture' || fam === 'elevation' || fam === 'combatround') && own[fam] !== 1; });   // a field of that name keeps it (Stage 6: the stance names too; HF5b: CombatRound)
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
        POSTURE_IDS.forEach(function(p, i) { ps.appendChild(opt(p, POSTURE_NAMES[i], st.posture === i)); });
        ps.disabled = !live; ps.addEventListener('change', function() { setSt({ posture: ps.value }); });
        pr.appendChild(ps); wrap.appendChild(pr);
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
        var rsS = roundSigOf(c, camp); if (rsS !== _roundSig) { _roundSig = rsS; _dialStale = true; }   // HUD frame (HF5b): a round change (Next turn) redraws what reads CombatRound
        if (final && _dialStale) { _dialStale = false; if (namesFacing(systemOf(camp))) redrawForFacing(); }
    } catch (e) {}   // it runs at the end of every render: a sheet problem never stops the map
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
    p.style.display = 'flex'; placeSheet(); raisePanel(p); renderSheet();
}
function closeSheet() { sheetOpen = null; var p = ui('sheetPanel'); if (p) p.style.display = 'none'; }
function placeSheet() { var p = ui('sheetPanel'); if (!p) return; try { var pos = JSON.parse(pref('wp_sheetPanel', 'null')); if (pos && isFinite(pos.x) && isFinite(pos.y)) { p.style.left = Math.max(0, Math.min(window.innerWidth - 160, pos.x)) + 'px'; p.style.top = Math.max(0, Math.min(window.innerHeight - 80, pos.y)) + 'px'; p.style.right = 'auto'; } if (pos && isFinite(pos.w) && isFinite(pos.h)) sizePanel(p, pos.w, pos.h); } catch (e) {} }
// Fold B: the panel's own size (its corner grip), clamped to the window; the saved record keeps the position and the size together
function sizePanel(p, w, h) { var r = p.getBoundingClientRect(); w = Math.max(360, Math.min(window.innerWidth - Math.max(0, r.left) - 8, Math.round(w))); h = Math.max(240, Math.min(window.innerHeight - Math.max(0, r.top) - 8, Math.round(h))); p.style.width = w + 'px'; p.style.height = h + 'px'; p.classList.add('sheet-sized'); }   // clamped to the room left of/below where the panel is, so the grip and the last rows stay on screen
function panelPref() { try { var o = JSON.parse(pref('wp_sheetPanel', 'null')); return (o && typeof o === 'object' && !Array.isArray(o)) ? o : {}; } catch (e) { return {}; } }
function focusKeyOf(root) { var ae = document.activeElement; if (!ae || !root.contains(ae)) return null; if (ae.dataset && typeof ae.dataset.pin === 'string' && PIN_GID.test(ae.dataset.pin)) return { pin: ae.dataset.pin, where: ae.closest('.sheet-band') ? 'band' : ae.closest('.sheet-sec-title') ? 'head' : 'sec' }; if (ae.dataset && typeof ae.dataset.reset === 'string' && /^s_[A-Za-z0-9_]{1,24}$/.test(ae.dataset.reset)) return { reset: ae.dataset.reset }; var dk = ae.closest && ae.closest('.sheet-dial, .sheet-stance') && ae.getAttribute ? ae.getAttribute('data-dk') : null; if (dk && /^[a-z0-9]{1,8}$/.test(dk)) return { dk: dk }; if (!ae.dataset || !ae.dataset.fid) return null; var k = { fid: ae.dataset.fid, part: ae.dataset.part || '', band: !!ae.dataset.band }; try { k.sel = [ae.selectionStart, ae.selectionEnd]; } catch (e) {} return k; }   // band: the pinned band's copy of a field, told from the section's (Stage 5c)
function restoreFocus(root, k) { if (!k) return; if (k.reset) { if (!/^s_[A-Za-z0-9_]{1,24}$/.test(k.reset)) return; var qx = root.querySelector('.sheet-sec-title [data-reset="' + k.reset + '"]'); if (qx) { try { qx.focus({ preventScroll: true }); } catch (e) {} } return; } if (k.pin) { if (!PIN_GID.test(k.pin)) return; var ps = '[data-pin="' + k.pin + '"]', pp = k.where === 'band' ? '.sheet-band ' : k.where === 'head' ? '.sheet-sec-title ' : '.sheet-section .sheet-field ', qp = root.querySelector(pp + ps) || root.querySelector(ps); if (qp) { try { qp.focus({ preventScroll: true }); } catch (e) {} } return; } if (k.dk) { var qd = root.querySelector('.sheet-dial [data-dk="' + k.dk + '"], .sheet-stance [data-dk="' + k.dk + '"]'); if (qd && qd.disabled) qd = root.querySelector('.sheet-dial [data-dk="dial"]'); if (qd) { try { qd.focus({ preventScroll: true }); } catch (e) {} } return; } var q = root.querySelector('[data-fid="' + k.fid + '"]' + (k.part ? '[data-part="' + k.part + '"]' : ':not([data-part])') + (k.band ? '[data-band]' : ':not([data-band])')); if (q && q.disabled && k.part) q = root.querySelector('[data-fid="' + k.fid + '"]:not([data-part])' + (k.band ? '[data-band]' : ':not([data-band])')); if (q) { try { q.focus({ preventScroll: true }); if (k.sel && k.sel[0] != null && q.setSelectionRange) q.setSelectionRange(k.sel[0], k.sel[1]); } catch (e) {} } }
function renderSheet() {
    var p = ui('sheetPanel'); if (!p || p.style.display === 'none') return;
    var camp = getActiveCampaign(), sys = systemOf(camp), c = charById(sheetOpen, camp);
    var body = ui('sheetBody'), head = ui('sheetTitle'), sub = ui('sheetSub'), fk = focusKeyOf(body);
    if (!c || !sys || !F()) { closeSheet(); return; }
    var gm = !isClient(), own = !!(c.ownerId && c.ownerId === myId());
    head.textContent = c.name;
    sub.textContent = (c.npc ? 'NPC' : c.ownerId ? ownerName(c, camp) : 'unassigned') + (c.partial ? ' · hover fields only' : '') + (gm && lastChange && lastChange.charId === c.id ? '' : '');
    var revert = ui('sheetRevert'); if (revert) revert.style.display = gm && lastChange && lastChange.charId === c.id ? '' : 'none';
    var pick = ui('sheetPick'); if (pick) { pick.textContent = ''; var pickL = gm ? charList(camp) : charList(camp).filter(function(x) { return !x.partial && x.ownerId === myId(); }); if (gm || pickL.length > 1) { pickL.forEach(function(x) { pick.appendChild(opt(x.id, x.name + (x.npc ? ' (NPC)' : ''), x.id === c.id)); }); pick.style.display = ''; } else pick.style.display = 'none'; }
    var por = ui('sheetPortrait'); if (por) { if (c.portrait) { por.src = imgSrc(c.portrait); por.style.display = ''; } else por.style.display = 'none'; }
    var hb = ui('sheetHud'); if (hb) { var hOn = hudHasContent(sys) && canOpen(c.id); hb.style.display = hOn ? '' : 'none'; if (hOn) hb.title = 'Open ' + (sys.sheet.hud.title || 'the HUD'); }   // HUD frame (HF2a): only when the saved system has a HUD they can see
    p.classList.toggle('sheet-has-headportrait', !!(sys.sheet && sys.sheet.look && sys.sheet.look.portrait));   // Stage 5g: the header block carries the portrait, so the title bar's small one steps aside
    var all = resolveAll(sys, c, F(), tokenCtxFor(c.id, camp));   // 5h Fold 3 / Stage 6: the token names read this character's token
    _dialSig = dialSigOf(c, camp); _dialStale = false; _dialOn = JSON.stringify(tokenFlags()); _roundSig = roundSigOf(c, camp);
    _sheetRefSig = refSig(sys);
    buildSections(body, sys, c, all, gm, own, renderSheet, { campId: camp.id, view: 'sheet', preview: false });
    applyPaletteTo(p, sys.sheet && sys.sheet.look);   // Stage 6 look fold: the palette also dresses the panel's own head, border and grip
    p.classList.toggle('sheet-has-table', !!body.querySelector('.sheet-itemtable'));   // Stage 4: a rich item table gets a wider, responsive panel so its columns fit
    // document appearance (1.5.0): the campaign default themes the sheet too. Reset first so turning it off restores the app style.
    applySheetLookTo(body, sheetLook(camp, sys));
    syncFramePad(body);   // the width (and the look's font) may have changed the sticky frame's height
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
    raisePanel(v.panel); renderHud(charId);
    if (stuck && huds[charId] === v && v.body.dataset.wpTab !== was) v.body.scrollTop = frameFlowTop(v.body);   // another tab asked of an open, scrolled HUD starts at its own top, as the HUD's own strip does
}
function makeHud(charId) {
    var tpl = ui('hudTpl'), layer = ui('hudLayer'); if (!tpl || !tpl.content || !tpl.content.firstElementChild || !layer || !HUD_CID.test(String(charId))) return null;
    var p = tpl.content.firstElementChild.cloneNode(true); p.dataset.cid = charId;
    var q = function(cls) { return p.querySelector('.' + cls); };
    var v = { charId: charId, panel: p, head: q('hud-head'), body: q('hud-body'), name: q('hud-name'), sub: q('hud-sub'), por: q('hud-portrait'), dialSig: '', dialStale: false, dialOn: null, roundSig: '', redraw: null };
    v.foot = q('hud-foot'); v.histOpen = false;   // HF3: the roll history drawer, closed on a new window (as the reference)
    layer.appendChild(p);
    p.addEventListener('keydown', function(e) { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); closeHud(charId); } });
    p.addEventListener('pointerdown', function() { raisePanel(p); }, true);
    q('hud-sheet').addEventListener('click', function() { openSheet(charId); });
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
    var sys = hudView(full), fk = focusKeyOf(v.body), gm = !isClient(), own = !!(c.ownerId && c.ownerId === myId());
    v.name.textContent = c.name; v.sub.textContent = (full.sheet.hud.title || 'HUD') + (c.npc ? ' \u00b7 NPC' : '');
    v.panel.setAttribute('aria-label', 'HUD: ' + c.name);
    if (c.portrait) { v.por.src = imgSrc(c.portrait); v.por.style.display = ''; } else { v.por.removeAttribute('src'); v.por.style.display = 'none'; }
    var all = resolveAll(sys, c, F(), tokenCtxFor(c.id, camp));
    v.dialSig = dialSigOf(c, camp); v.dialStale = false; v.dialOn = JSON.stringify(tokenFlags()); v.roundSig = roundSigOf(c, camp);
    _sheetRefSig = refSig(full);
    buildSections(v.body, sys, c, all, gm, own, function() { renderHud(charId); }, { campId: camp.id, view: 'hud', preview: false, targets: pinTargetsAll(full.sheet) });
    applyPaletteTo(v.panel, sys.sheet && sys.sheet.look);
    applySheetLookTo(v.body, sheetLook(camp, sys));
    syncFramePad(v.body);
    ['--sheet-accent', '--sheet-accent-ink'].forEach(function(k) { var a = v.body.style.getPropertyValue(k); if (a) v.panel.style.setProperty(k, a); else v.panel.style.removeProperty(k); });   // HF3: the foot (the body's sibling) wears the look's accent too (applyLook set a checked hex or nothing)
    restoreFocus(v.body, fk);
    renderHudFoot(v);
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
    var fa = document.activeElement, fcls = fa && foot.contains(fa) ? ['hud-hist-toggle', 'hud-hist-clear', 'hud-hist-depth'].filter(function(k) { return fa.classList.contains(k); })[0] || '' : '';
    var old = foot.querySelector('.hud-hist-list'), top = old ? old.scrollTop : 0;
    foot.textContent = '';
    var camp = getActiveCampaign(), c = charById(v.charId, camp), n = net(), D = window.wpDice;
    if (!c || !n || typeof n.rollsFor !== 'function' || !D || typeof D.renderCard !== 'function' || (window.wpVtt && !window.wpVtt.on('dice')) || !sysRolls(systemOf(camp))) return;
    var rolls = n.rollsFor(v.charId, rollName(c), _histCleared[v.charId] || 0, histDepth());
    var bar = el('div', 'hud-hist-bar'), tg = el('button', 'hud-hist-toggle'); tg.type = 'button';
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
    foot.appendChild(bar);
    if (v.histOpen) {
        var list = el('div', 'hud-hist-list');
        if (rolls.length) rolls.forEach(function(m) { list.appendChild(D.renderCard(m)); });
        else list.appendChild(el('div', 'hud-hist-empty notepad-who', 'No rolls as ' + c.name + ' yet this session.'));
        foot.appendChild(list); list.scrollTop = top;
    }
    if (fcls) { var back = foot.querySelector('.' + fcls) || foot.querySelector('.hud-hist-toggle'); if (back) back.focus(); }
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
    var rs = roundSigOf(c, camp); if (rs !== v.roundSig) { v.roundSig = rs; v.dialStale = true; }   // HF5b: a round change redraws what reads CombatRound
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
    var idnOk = function(f) { return !c.partial && (gm || (own && f.edit === 'owner' && f.vis === 'all')); };   // the section's own rule
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
            if (ledger && f.kind === 'number' && !f.labels && !en.error && !c.partial && (gm || (own && f.edit === 'owner' && f.vis === 'all'))) {
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
    var live = _fxLive && !(ctx.vctx && ctx.vctx.preview) && !window.wpPopout, targets = rt.targets, on = live && targets.length > 0;
    var ch = el('span', 'sheet-sec-chip sheet-sec-reset'); ch.setAttribute('role', 'button'); ch.tabIndex = 0; ch.dataset.reset = sec.id; ch.setAttribute('aria-disabled', on ? 'false' : 'true');   // focusable even when inert (it says why); data-reset keeps the focus across a redraw
    ch.appendChild(iconNode('icon:rotate-left', 'sheet-chip-ico')); ch.appendChild(el('span', 'sheet-chip-txt', sec.resetText || 'Reset all'));
    ch.title = !live ? 'Resets this section\u2019s pools and counters (on the sheet itself)' : !rt.allowed ? 'Only the GM resets these' : targets.length ? 'Resets ' + targets.map(function(t) { return t.label; }).join(', ') : 'Nothing to reset: every pool is full and every counter at its start';
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
    var hudV = !!(vctx && vctx.view === 'hud'); _fxView = hudV ? 'hud' : 'sheet';   // Stage 6 HUD frame (HF1): which view this draws (sys is then hudView's projection)
    var sheet = (hudV || (sys.sheet && sys.sheet.sections && sys.sheet.sections.length)) ? sys.sheet : autoLayout(sys);   // the HUD has no automatic layout of its own
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
    var grpById = {}; ((sys.sheet && Array.isArray(sys.sheet.bandGroups)) ? sys.sheet.bandGroups : []).forEach(function(g) { if (g && typeof g.id === 'string' && PIN_GID.test(g.id)) grpById[g.id] = g; });   // Stage 6: band groups (built even with no band: a Pin in a section still draws)
    var pctx = { byId: byId, rollById: rollById, c: c, all: all, gm: gm, own: own, sys: sys, grpById: grpById, targets: (vctx && vctx.targets) || pinTargetsAll(sys.sheet), vctx: vctx, rerender: rerender, body: body };   // the targets: the Pins in the layout actually drawn (the automatic one has none, so every group shows)
    bandInto(frame, bandDef, pctx);
    var tabIds = tabs ? tabs.map(function(t) { return t.id; }) : null;
    var active = '', stripEl = null;   // active tab lives on the container (body.dataset.wpTab) so the live sheet and the builder preview never bleed into each other; the strip is appended after the dashboard sections
    if (tabs) {
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
        var collap = !!sec.collapsible;
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
        var chipNode = sec.chip ? pageChip(sec.chip) : null;   // Stage 5f: a handbook chip
        var pinCh = sec.pin && Object.prototype.hasOwnProperty.call(grpById, sec.pin) ? pinChip(grpById[sec.pin], pctx) : null;   // Stage 6: a band group's Pin in the header
        var rsCh = sec.resetAll === true ? resetChip(sec, pctx) : null;   // HUD frame (HF4b): its Reset all
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
        (sec.fields || []).forEach(function(pl) {
            var node = null;
            if (pl.id && byId[pl.id]) node = fieldNode(byId[pl.id], c, all[pl.id], gm, own, sys, all.vars, pl);   // pl (F4b): an item list's "only switched on"
            else if (pl.roll && rollById[pl.roll]) node = rollNode(rollById[pl.roll], c, sys, all.vars);
            else if (pl.kind === 'heading') node = el('div', 'sheet-heading', pl.text || '');
            else if (pl.kind === 'divider') node = el('div', 'sheet-divider');
            else if (pl.kind === 'link') node = linkNode(pl);   // Stage 5f
            else if (pl.kind === 'hud') node = hudButton(pl, c, sys, vctx);   // HUD frame (HF2b): opens this character's HUD
            else if (pl.kind === 'facing') node = facingNode(c, gm);   // 5h Fold 3
            else if (pl.kind === 'stance') node = stanceNode(c, gm);   // Stage 6
            else if (pl.kind === 'pin') node = pl.g && Object.prototype.hasOwnProperty.call(grpById, pl.g) ? pinNode(pl, grpById[pl.g], pctx) : null;   // Stage 6: a band group's Pin button
            else if (pl.kind === 'portrait') { node = el('div', 'sheet-portrait-slot'); if (c.portrait) { var im = el('img'); im.src = imgSrc(c.portrait); im.alt = ''; node.appendChild(im); } }
            if (!node) return;
            if (sec.inline === true && pl.id && byId[pl.id]) inlineRow(node, byId[pl.id]);   // HUD frame (HF4a, H2)
            if (pl.w === 'row') node.classList.add('sheet-row');
            grid.appendChild(node);
        });
        var hasOwn = Array.prototype.some.call(grid.childNodes, function(n) { return !n.hidden; });   // 5h: a player's dial with facing off is a hidden placeholder
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
function placementLabel(pl, byId, rollById) {
    if (pl.id) { var f = byId[pl.id]; return f ? (f.label || f.key || '(field)') + (f.key && f.label ? ' (' + f.key + ')' : '') : null; }
    if (pl.roll) { var r = rollById[pl.roll]; return r ? 'Roll: ' + (r.label || r.formula) : null; }
    if (pl.kind === 'heading') return 'Heading'; if (pl.kind === 'divider') return 'Divider'; if (pl.kind === 'portrait') return 'Portrait'; if (pl.kind === 'link') return 'Handbook link'; if (pl.kind === 'facing') return 'Facing dial'; if (pl.kind === 'stance') return 'Stance (posture & elevation)'; if (pl.kind === 'pin') return 'Pin button'; if (pl.kind === 'hud') return 'HUD button';
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
        if (cfg.rolls) draft.rolls.forEach(function(r) { if (!on[r.id]) opts.push(['r:' + r.id, 'Roll: ' + (r.label || r.formula)]); });
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
        var list = el('div', 'sys-pl-list'); list.dataset.sid = sec.id;
        (sec.fields || []).forEach(function(pl, pi) {
            var text = placementLabel(pl, byId, rollById); if (text === null) return;
            var pr = el('div', 'sys-pl'); pr.dataset.sid = sec.id; pr.dataset.pi = String(pi); pr.draggable = true;
            pr.appendChild(el('span', 'sys-pl-grip', String.fromCharCode(8942)));
            pr.appendChild(el('span', 'sys-pl-name', text));
            if (pl.kind === 'heading') pr.appendChild(input('sys-pl-text field', pl.text, 'The heading\'s text', 'Heading text'));
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
            var wb = el('button', 'tool ghost sys-btn sys-pl-w', pl.w === 'row' ? 'Full row' : '1 column'); wb.dataset.act = 'plw'; wb.title = 'Width: one column of the section, or the full row'; pr.appendChild(wb);
            var plf = pl.id ? (draft.fields || []).find(function(x) { return x.id === pl.id; }) : null, plOn = plf && plf.kind === 'item-list' && plf.list && plf.list.on && typeof plf.list.on === 'object' ? plf.list.on : null;
            if (plOn || (pl.on && plf && plf.kind === 'item-list')) { var ob = el('button', 'tool ghost sys-btn sys-pl-on', pl.on ? 'Only ' + (plOn ? String(plOn.label || 'on').toLowerCase() : 'switched on') : 'All rows'); ob.dataset.act = 'plon'; ob.title = plOn ? 'Every row of the list, or only the rows switched on (' + (plOn.label || 'On') + '), e.g. the HUD\u2019s readied weapons' : 'Its list has no switch now, so every row shows: click to clear it'; pr.appendChild(ob); }   // F4b (review: kept while set, so it can be cleared)
            pr.appendChild(btnRow([['plup', 'Move up', '&#9650;'], ['pldown', 'Move down', '&#9660;'], ['pldel', 'Take off the sheet (the field stays defined)', '&times;']]));
            list.appendChild(pr);
        });
        row.appendChild(list);
        var addRow = el('div', 'sys-row-main sys-pl-addrow'), opts = [['', 'Add to this section\u2026']], inHdr = headerEdits(draft, hudOn ? (draft.sheet && draft.sheet.hud) || null : undefined);
        draft.fields.forEach(function(f) { if (!placed[f.id]) opts.push(['f:' + f.id, (f.label || f.key || '(field)') + (f.key ? ' (' + f.key + ')' : '') + (inHdr[f.id] === 1 ? ' (in the header)' : '') + (hudOn && onSheet[f.id] ? ' (on the sheet)' : '')]); });   // Stage 6: the GM is told a field is already edited in the header
        draft.rolls.forEach(function(r) { opts.push(['r:' + r.id, 'Roll: ' + (r.label || r.formula)]); });
        opts.push(['k:heading', 'Heading'], ['k:divider', 'Divider'], ['k:portrait', 'Portrait'], ['k:facing', 'Facing dial'], ['k:stance', 'Stance (posture & elevation)']);
        grpList.forEach(function(g) { opts.push(['p:' + g.id, 'Pin button: ' + (g.label || 'Group')]); });   // Stage 6: a band group's Pin, beside its figures
        if (pageOptions('', null).length) opts.push(['k:link', 'Handbook link']);   // Stage 5f: only when the campaign has pages
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
    else if (t.classList.contains('sys-sec-title')) sec.title = t.value.slice(0, LIMITS.label);
    else if (t.classList.contains('sys-sec-icon')) { if (t.value.trim()) sec.icon = t.value.slice(0, 32); else delete sec.icon; }   // Stage 5g
    else if (t.classList.contains('sys-sec-resettext')) { if (t.value.trim()) sec.resetText = t.value.slice(0, LIMITS.label); else delete sec.resetText; }   // HUD frame (HF4b): the Reset all button's own words
    else return false;
    markDirty(); renderPreview(); return true;
}
function onLayoutChange(t) {
    var c = t.className || '', lsec = t.closest && t.closest('.sys-sec'); if (!lsec) return false;
    var sec = layoutSections().find(function(s) { return s.id === lsec.dataset.sid; }); if (!sec) return true;
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
        else if (kind === 'k') { pl = { kind: id, w: id === 'portrait' || id === 'link' || id === 'facing' || id === 'stance' || id === 'hud' ? 1 : 'row' }; if (id === 'heading' || id === 'hud') pl.text = ''; if (id === 'link') { var firstPage = pageOptions('', null)[0]; pl.text = ''; pl.page = firstPage ? firstPage[0] : ''; } }
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
function noteBits(entry, def, c, f, editable) {
    var box = el('div', 'sheet-item-noteline');
    if (def.notes) box.appendChild(el('div', 'sheet-item-notes', def.notes));
    if (editable) { var ni = el('input', 'field sheet-item-note'); ni.type = 'text'; ni.dataset.fid = f.id; ni.dataset.part = 'note-' + rowIdOf(entry); ni.maxLength = LIMITS.rowNote; ni.placeholder = 'A note on this one'; ni.value = entry.note || ''; ni.addEventListener('change', function() { commitItem(c, f, { op: 'set', rowId: rowIdOf(entry), facts: { note: ni.value } }); }); box.appendChild(ni); }
    else if (entry.note) box.appendChild(el('div', 'sheet-item-rownote', entry.note));
    return box.childNodes.length ? box : null;
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
function pickerInto(sel, items, spec, carried) {
    var cats = Array.isArray(spec.cats) ? spec.cats.map(function(x) { return String(x).toLowerCase(); }) : null, groups = [], byCat = Object.create(null), loose = [], have = Object.create(null), n = 0;
    if (spec.noQty && !spec.multi) carried.forEach(function(r) { if (r && typeof r.defId === 'string' && r.hid !== 1) have[r.defId] = 1; });
    items.forEach(function(it) {
        var cat = String(it.category || '').trim(), lc = cat.toLowerCase();
        if (cats && cats.indexOf(lc) < 0) return;
        var o = opt(it.id, (iconText(it.icon) ? iconText(it.icon) + ' ' : '') + it.name); if (have[it.id] === 1) { o.disabled = true; o.title = 'Already on the list'; }
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
// Stage 6 F4a: a copy of an entry deleted from the library — marked; the GM may make it the character's own item
function lostBits(host, rd, entry, c, f, gm, editable) {
    if (!rd || rd.src !== 'lost') return;
    var chip = el('span', 'sheet-chip sheet-item-lost', 'not in library'); chip.title = 'Deleted from the library; the character keeps their copy'; host.appendChild(chip);
    if (gm && editable) { var mk = el('button', 'tool ghost sheet-item-keep', 'Make custom'); mk.title = 'Make this copy the character\u2019s own item'; mk.addEventListener('click', function() { commitItem(c, f, { op: 'keep', rowId: rowIdOf(entry) }); }); host.appendChild(mk); }
}
function itemListInto(wrap, f, c, carried, sysI, canThrow, editable, gm, empty) {   // empty (F4b): the note when nothing shows
    editable = editable && _fxLive; canThrow = canThrow && _fxLive;   // the Layout preview and a pop-out draw their controls inert
    var spec = f.list || null, seenCat = Object.create(null), nCat = 0;   // F4b: a list with options draws its rows' facts, and a category chip while its rows span more than one
    if (spec) carried.forEach(function(r) { var d0 = rowDef(sysI, r), cc = d0 && d0.def && d0.def.category ? String(d0.def.category).toLowerCase() : ''; if (cc && !seenCat[cc]) { seenCat[cc] = 1; nCat++; } });
    var chips = nCat > 1;
    carried.forEach(function(entry) {
        var rd = rowDef(sysI, entry), def = rd ? rd.def : null; if (!def) return;
        var rid = rowIdOf(entry);
        var line = el('div', 'sheet-item' + (entry.hid === 1 ? ' sheet-item-hid' : ''));
        if (def.icon) line.appendChild(iconNode(def.icon, 'sheet-item-icon'));
        var nm = el('span', 'sheet-item-name', def.name); if (def.area) nm.appendChild(el('span', 'sheet-item-area-tag', ' ' + def.area.ft + ' ft')); if (def.notes) nm.title = def.notes; line.appendChild(nm);
        if (chips && def.category) line.appendChild(el('span', 'sheet-chip', def.category));
        lostBits(line, rd, entry, c, f, gm, editable); gmItemBits(line, def, entry, gm, !!(spec && spec.on));
        var noteLn = null;
        if (spec) { var lc = lvlCtl(entry, def, c, f, spec, editable); if (lc) line.appendChild(lc); var oc = onCtl(entry, c, f, spec, editable, true); if (oc) line.appendChild(oc); noteLn = noteBits(entry, def, c, f, editable); }
        if (def.area && canThrow && (gm || def.vis !== 'gm') && entry.hid !== 1) line.appendChild(itemThrowBtn(def, c, f, rid));   // a GM-only item: the GM's throw only (a player's copy never carries its area)
        if (noteLn) line.appendChild(noteToggle(noteLn, entry, c, f));
        if (editable) { var ub = undoBtn(entry, c, f); if (ub) line.appendChild(ub); if (!(spec && spec.noQty)) line.appendChild(itemQtyCell(entry, c, f)); line.appendChild(itemRmBtn(entry, def, c, f)); }
        else if (!(spec && spec.noQty)) line.appendChild(el('span', 'sheet-item-qtyn', '×' + entry.qty));
        wrap.appendChild(line);
        if (noteLn) wrap.appendChild(noteLn);
    });
    if (!carried.length) wrap.appendChild(el('div', 'sheet-empty-note', empty || 'No items.'));
}
function itemTableInto(wrap, f, c, carried, sysI, canThrow, editable, gm, empty) {
    editable = editable && _fxLive; canThrow = canThrow && _fxLive;   // the Layout preview and a pop-out draw their controls inert
    var tbl = f.table, cols = (tbl.columns || []).slice(), spec = f.list || null, hasL = !!(spec && spec.lvl), hasO = !!(spec && spec.on), hasQ = !(spec && spec.noQty);   // F4b: a level and a switch column; no quantity
    if (tbl.chips) cols = cols.filter(function(x) { return x !== 'category'; });   // a chip beside the name replaces the column
    var wantNotes = cols.indexOf('notes') >= 0; cols = cols.filter(function(x) { return x !== 'notes'; });   // notes render as an expandable row, not a column
    var hasAct = editable || canThrow || wantNotes || !!spec, span = 1 + cols.length + (hasL ? 1 : 0) + (hasO ? 1 : 0) + (hasQ ? 1 : 0) + (hasAct ? 1 : 0);
    var table = el('table', 'sheet-itemtable'), thead = el('thead'), htr = el('tr');
    htr.appendChild(el('th', 'sheet-itcol-name', 'Item'));
    cols.forEach(function(col) { htr.appendChild(el('th', 'sheet-itcol-' + col, ITEM_COL_LABEL[col] || col)); });
    if (hasL) htr.appendChild(el('th', 'sheet-itcol-lvl', spec.lvl.label));
    if (hasO) htr.appendChild(el('th', 'sheet-itcol-on', spec.on.label));
    if (hasQ) htr.appendChild(el('th', 'sheet-itcol-qty', 'Qty'));
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
        if (tbl.chips && def.category) nameTd.appendChild(el('span', 'sheet-chip', def.category));
        lostBits(nameTd, rd, entry, c, f, gm, editable); gmItemBits(nameTd, def, entry, gm, hasO);
        tr.appendChild(nameTd);
        cols.forEach(function(col) { tr.appendChild(el('td', 'sheet-itcol-' + col, itemCellText(col, def))); });
        if (hasL) { var lTd = el('td', 'sheet-itcol-lvl'), lcT = lvlCtl(entry, def, c, f, spec, editable); if (lcT) lTd.appendChild(lcT); tr.appendChild(lTd); }
        if (hasO) { var oTd = el('td', 'sheet-itcol-on'), ocT = onCtl(entry, c, f, spec, editable, false); if (ocT) oTd.appendChild(ocT); tr.appendChild(oTd); }
        if (hasQ) {
            var qtyTd = el('td', 'sheet-itcol-qty');
            qtyTd.appendChild(editable ? itemQtyCell(entry, c, f) : el('span', 'sheet-item-qtyn', '×' + entry.qty));
            tr.appendChild(qtyTd);
        }
        var notesRow = null;
        if (hasAct) {
            var actTd = el('td', 'sheet-itcol-act');
            if (def.area && canThrow && (gm || def.vis !== 'gm') && entry.hid !== 1) actTd.appendChild(itemThrowBtn(def, c, f, rid));
            if (spec) {   // F4b: 📝 — the item's notes and the row's own note
                var nbT = noteBits(entry, def, c, f, editable);
                if (nbT) { notesRow = el('tr', 'sheet-itemtable-notes'); var ntdS = el('td'); ntdS.colSpan = span; ntdS.appendChild(nbT); notesRow.appendChild(ntdS); actTd.appendChild(noteToggle(notesRow, entry, c, f)); }
            } else if (wantNotes && def.notes) {
                notesRow = el('tr', 'sheet-itemtable-notes'); var ntd = el('td', null, def.notes); ntd.colSpan = span; notesRow.appendChild(ntd); notesRow.style.display = 'none';
                var nt = el('button', 'tool ghost sheet-item-notes-t', '📝'); nt.title = 'Notes';
                nt.addEventListener('click', function() { notesRow.style.display = notesRow.style.display === 'none' ? '' : 'none'; });
                actTd.appendChild(nt);
            }
            if (editable) { var ubT = undoBtn(entry, c, f); if (ubT) actTd.appendChild(ubT); actTd.appendChild(itemRmBtn(entry, def, c, f)); }
            tr.appendChild(actTd);
        }
        tbody.appendChild(tr);
        if (notesRow) tbody.appendChild(notesRow);
    });
    if (!shown) { var er = el('tr'), ec = el('td', 'sheet-empty-note', empty || 'No items.'); ec.colSpan = span; er.appendChild(ec); tbody.appendChild(er); }
    table.appendChild(tbody);
    if (tbl.footer && shown) {
        var tfoot = el('tfoot'), ftr = el('tr'), fc = el('td', 'sheet-itft', shown + (shown === 1 ? ' item' : ' items')); fc.colSpan = 1 + cols.length + (hasL ? 1 : 0) + (hasO ? 1 : 0); ftr.appendChild(fc);
        if (hasQ) ftr.appendChild(el('td', 'sheet-itft-qty', '×' + totalQty));
        if (hasAct) ftr.appendChild(el('td', null, ''));
        tfoot.appendChild(ftr); table.appendChild(tfoot);
    }
    wrap.appendChild(table);
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
var _fxLive = true, _fxForm = null, _fxView = 'sheet';   // _fxView (HUD frame HF1): the view being drawn, so an open New… form shows in one view only   // live: false while drawing the Layout preview or a pop-out (their controls act on nothing real); the open New… form's state
function effectsInto(wrap, f, c, rows, sys, editable) {
    editable = editable && _fxLive;
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
        if (cards) { wrap.appendChild(fxCard(line, sw, r, d, f, c, labels, editable)); return; }
        line.appendChild(sw);
        if (d.icon) line.appendChild(iconNode(d.icon, 'sheet-fx-icon'));
        var nm = el('span', 'sheet-fx-name', d.name || 'Effect'); if (d.notes) nm.title = d.notes; line.appendChild(nm);
        if (d.tone === 'buff' || d.tone === 'debuff') line.appendChild(el('span', 'sheet-fx-tone', d.tone === 'buff' ? 'Buff' : 'Debuff'));
        if (d.dur) line.appendChild(el('span', 'sheet-fx-dur', d.dur));
        if (editable) { var rm = el('button', 'tool ghost sheet-pm sheet-fx-rm', '\u00d7'); rm.title = 'End this effect'; rm.addEventListener('click', function() { commitEffect(c, f, { op: 'remove', rowId: r.id }); }); line.appendChild(rm); }
        var mods = (d.mods || []).map(function(m) { return fxChangeText(m, labels); }); if (mods.length) line.appendChild(el('div', 'sheet-fx-mods', mods.join(' \u00b7 ')));
        wrap.appendChild(line);
    });
    if (!wrap.childNodes.length) wrap.appendChild(el('div', 'sheet-empty-note', 'No effects.'));
    if (!editable) return;
    var bar = el('div', 'sheet-fx-add-row'), defs = (sys && sys.effects) || [];
    if (defs.length) {
        var add = el('select', 'field sheet-fx-add'); add.appendChild(opt('', '+ Add effect\u2026', true));
        defs.forEach(function(d2) { add.appendChild(opt(d2.id, (iconText(d2.icon) ? iconText(d2.icon) + ' ' : '') + d2.name + (d2.tone ? ' (' + d2.tone + ')' : ''))); });
        add.addEventListener('change', function() { if (add.value) commitEffect(c, f, { op: 'add', rowId: uid('x_'), ref: add.value }); });
        bar.appendChild(add);
    }
    var nb = el('button', 'tool ghost sys-btn sheet-fx-new', 'New\u2026'); nb.title = 'An effect made on the spot, with its own numbers';
    nb.addEventListener('click', function() { _fxForm = { charId: c.id, fieldId: f.id, name: '', tone: '', dur: '', lines: null, view: fxV }; nb.style.display = 'none'; wrap.appendChild(effectForm(f, c, sys, function() { nb.style.display = ''; })); });
    bar.appendChild(nb);
    wrap.appendChild(bar);
    if (_fxForm && _fxForm.charId === c.id && _fxForm.fieldId === f.id) { if ((_fxForm.view || 'sheet') === fxV) { nb.style.display = 'none'; wrap.appendChild(effectForm(f, c, sys, function() { nb.style.display = ''; })); } }   // reopened with what was typed (in the view it was opened in)
}
// Stage 6 look fold (L6): one effect as a card — the switch, icon, name, then its tone and duration (with the hourglass); the notes as text; a
// pill per change ("+2 ST", "−5 HP max", or the name of what it switches on); the × in the corner for whoever may end it
function fxCard(line, sw, r, d, f, c, labels, editable) {
    line.classList.add('sheet-fx-card');
    var head = el('div', 'sheet-fx-head'); head.appendChild(sw);
    if (d.icon) head.appendChild(iconNode(d.icon, 'sheet-fx-icon'));
    head.appendChild(el('span', 'sheet-fx-name', d.name || 'Effect'));
    var meta = el('span', 'sheet-fx-meta');
    if (d.tone === 'buff' || d.tone === 'debuff') meta.appendChild(el('span', 'sheet-fx-tone', d.tone === 'buff' ? 'Buff' : 'Debuff'));
    if (d.dur) { var du = el('span', 'sheet-fx-dur'); du.appendChild(iconNode('icon:hourglass-half', 'sheet-fx-durico')); du.appendChild(document.createTextNode(' ' + d.dur)); meta.appendChild(du); }
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
    var editable = gm || (own && f.edit === 'owner' && f.vis === 'all');
    var raw = c.values ? c.values[f.id] : undefined;
    var k = f.kind;
    if (k === 'formula') { var v = el('div', 'sheet-value' + (e && e.error ? ' sheet-err' : '') + signTone(f, e), e && e.error ? '—' : e ? e.text + (f.unit && e.text !== '' && !e.label ? ' ' + f.unit : '') : ''); v.title = e && e.error ? e.error : f.formula || ''; if (f.badge && e && !e.error) { var tnB = valueTone(f, e), bd = el('span', 'sheet-badge' + (Object.prototype.hasOwnProperty.call(TONE_CLASS, tnB) ? TONE_CLASS[tnB] : ''), v.textContent); v.textContent = ''; v.appendChild(bd); } var fmF = fxMark(e); if (fmF) { v.appendChild(fmF); v.title += '\n' + fmF.title; } box.appendChild(v); return box; }
    if (k === 'number' && Array.isArray(f.labels) && f.labels.length) {   // Stage 6: a number with value names — a dropdown that stores the position (formulas read the number)
        var rowL = el('div', 'sheet-ctl'), ls = el('select', 'field sheet-select'), curL = Number(raw === undefined ? f.def : raw);
        ls.dataset.fid = f.id; f.labels.forEach(function(t, i) { ls.appendChild(opt(String(i), t || String(i), curL === i)); });
        if (!(curL === Math.floor(curL) && curL >= 0 && curL < f.labels.length)) { var ob = opt(String(curL), fmtNum(curL), true); ob.disabled = true; ls.insertBefore(ob, ls.firstChild); }   // a stored value past the names shows as its number (what formulas read) until a name is picked
        ls.disabled = !editable; ls.addEventListener('change', function() { commit(c, f, Number(ls.value)); });
        rowL.appendChild(ls);
        if (e && e.mods && e.mods.length) { var fbL0 = fxMark(e); if (fbL0) { fbL0.textContent = '\u2192 ' + (e.text || fmtNum(e.value)); rowL.appendChild(fbL0); } }   // 5h: an effect moved it — the effective value beside the choice
        box.appendChild(rowL); return box;
    }
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
        if (k === 'number') inp.className += signTone(f, { value: Number(inp.value) });   // Stage 5g (a skill colours its total instead); 5h: by the number the box shows
        var lkS = (sysArg && sysArg.sheet && sysArg.sheet.look) || {};
        if (f.counter) row.appendChild(stepWrap(inp, f, c, editable, true));   // HUD frame (HF4a, H8): a counter, minus and plus either side (the cleaner never keeps one with value names or a slider)
        else if (lkS.steppers === 'inside' && !(k === 'number' && f.slider && f.min !== undefined && f.max !== undefined)) row.appendChild(stepWrap(inp, f, c, editable));   // Stage 6 look fold (L8)
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
        var minus = el('button', 'tool ghost sheet-pm', '−'); minus.dataset.fid = f.id; minus.dataset.part = 'minus'; minus.title = 'One less'; minus.disabled = !editable;
        var ci = el('input', 'field sheet-num sheet-cur num-stepped'); ci.type = 'number'; ci.dataset.fid = f.id; ci.value = String(cur); ci.disabled = !editable; if (f.min !== undefined) ci.min = String(f.min); if (max !== null) ci.max = String(max);
        var plus = el('button', 'tool ghost sheet-pm', '+'); plus.dataset.fid = f.id; plus.dataset.part = 'plus'; plus.title = 'One more'; plus.disabled = !editable;
        var mx = el('span', 'sheet-total' + (e && e.error ? ' sheet-err' : ''), '/ ' + (max === null ? '—' : fmtNum(max)) + (f.unit ? ' ' + f.unit : '')); mx.title = e && e.error ? e.error : (f.maxFormula || 'no max'); var fmR = fxMark(e, true); if (fmR) mx.title += '\n' + fmR.title;
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
    if (k === 'toggle') { var lb = el('label', 'sheet-toggle'); var cb = el('input'); cb.type = 'checkbox'; cb.dataset.fid = f.id; cb.checked = raw === undefined ? f.def === true : raw === true; cb.disabled = !editable; cb.addEventListener('change', function() { commit(c, f, cb.checked); }); lb.appendChild(cb); lb.appendChild(document.createTextNode(' ' + (cb.checked ? 'on' : 'off'))); box.appendChild(lb); if (e && e.value === true && !cb.checked && e.mods && e.mods.length) { var ft = el('span', 'sheet-eff sheet-eff-same', 'on (' + e.mods.map(function(m) { return m.name; }).join(', ') + ')'); ft.title = 'Switched on by ' + e.mods.map(function(m) { return m.name; }).join(', '); box.appendChild(ft); } return box; }
    if (k === 'text') { var ti = el('input', 'field sheet-text'); ti.type = 'text'; ti.dataset.fid = f.id; ti.maxLength = f.max || 200; ti.value = raw === undefined ? String(f.def || '') : String(raw); ti.disabled = !editable; ti.addEventListener('change', function() { commit(c, f, ti.value); }); box.appendChild(ti); return box; }
    if (k === 'notes') { var ta = el('textarea', 'field sheet-notes'); ta.dataset.fid = f.id; ta.rows = 4; ta.value = raw === undefined ? '' : String(raw); ta.disabled = !editable; var tmr = null; ta.addEventListener('input', function() { clearTimeout(tmr); tmr = setTimeout(function() { commit(c, f, ta.value); }, 600); }); ta.addEventListener('change', function() { clearTimeout(tmr); commit(c, f, ta.value); }); box.appendChild(ta); return box; }
    if (k === 'select') { var se = el('select', 'field sheet-select'); se.dataset.fid = f.id; (f.options || []).forEach(function(o) { se.appendChild(opt(o, o, (raw === undefined ? f.def : raw) === o)); }); se.disabled = !editable; se.addEventListener('change', function() { commit(c, f, se.value); }); box.appendChild(se); return box; }
    if (k === 'effects') {   // 5h: status effects (the host judges every change; a teammate's copy is names only)
        var wrapE = el('div', 'sheet-fx-list');
        effectsInto(wrapE, f, c, Array.isArray(raw) ? raw : [], sysArg || systemOf(getActiveCampaign()), editable && !c.partial);
        box.appendChild(wrapE); return box;
    }
    if (k === 'item-list') {
        var sysI = sysArg || systemOf(getActiveCampaign()), carried = Array.isArray(raw) ? raw : [];
        var specI = f.list || null, onOnly = !!(plc && plc.on === true && specI && specI.on), emptyI = onOnly ? 'Nothing ' + String(specI.on.label || 'on').toLowerCase() + '.' : '';   // F4b: a placement that shows only the rows switched on (the HUD's readied weapons)
        if (onOnly) carried = carried.filter(function(r) { return rowOn(specI, r); });
        var gmThrows = sysI && sysI.combat && sysI.combat.blastRoller === 'gm';
        var canThrow = (gm || (own && !gmThrows && !!facingTarget(c))) && !c.partial;   // who-rolls='gm' means only the GM throws; a player throws from the character whose token they hold here (never a kept one)
        var wrap = el('div', 'sheet-items' + (f.table ? ' sheet-items-table' : ''));
        if (f.table) itemTableInto(wrap, f, c, carried, sysI, canThrow, editable, gm, emptyI);   // Stage 4: rich table
        else itemListInto(wrap, f, c, carried, sysI, canThrow, editable, gm, emptyI);            // the plain carried list (as before)
        if (editable && _fxLive && sysI && sysI.items && sysI.items.length && !onOnly) {
            var add = el('select', 'field sheet-item-add'), nPick = -1; add.appendChild(opt('', '+ Add item…', true));
            if (specI) nPick = pickerInto(add, sysI.items, specI, carried);   // F4b: the list's categories, grouped
            else sysI.items.forEach(function(it) { add.appendChild(opt(it.id, (iconText(it.icon) ? iconText(it.icon) + ' ' : '') + it.name + (it.category ? ' — ' + it.category : ''))); });
            add.addEventListener('change', function() { if (add.value) commitItem(c, f, { op: 'add', defId: add.value, rowId: uid('w_'), qty: 1 }); });   // Stage 6 F4a: a new row's id from here (the host never mints)
            if (nPick !== 0) wrap.appendChild(add);   // F4b: none of the list's categories has an item: no picker
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
    var label = rollLabel(r, sys, c, vars), b = el('button', 'tool sheet-roll' + (Object.prototype.hasOwnProperty.call(ROLL_TONE_CLS, r.tone) ? ROLL_TONE_CLS[r.tone] : ''), label); var can = canRoll(c);
    if (r.icon) b.insertBefore(iconNode(r.icon, 'sheet-roll-icon'), b.firstChild); b.title = r.formula + (can ? ' · shift-click to add a modifier' : ' (dice are off here, or this is not your character)'); b.disabled = !can;
    b.addEventListener('click', function(e) {
        var lb = label, vv = vars;
        if (sys && typeof vars === 'function' && r.label && r.label.indexOf('{') >= 0 && F()) { try { var campN = getActiveCampaign(), cN = charById(c.id, campN) || c; vv = resolveAll(sys, cN, F(), tokenCtxFor(c.id, campN)).vars; lb = rollLabel(r, sys, cN, vv); } catch (err) { lb = label; vv = vars; } }   // HF5 review: the values as they are at the click, as the roll reads them (a redraw may still wait on a focused box)
        var why = labelSecret(sys, vv, r.label); if (why) toast('Kept private: its label shows a GM-only value (' + why + ').'); sheetRoll(e, c.id, r.formula, lb, why ? { priv: true } : r.vis === 'gm' ? { gmOnly: true } : undefined);   // a GM-only roll stays the GM's
    });
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
    var allI = F() ? resolveAll(sys, c, F(), tokenCtxFor(c.id, camp)) : null, lbI = allI ? rollLabel(r, sys, c, allI.vars) : r.label, whyI = allI ? labelSecret(sys, allI.vars, r.label) : '';   // HF5a: the label's value, and the GM's privacy rule
    if (whyI) toast('Kept private: its label shows a GM-only value (' + whyI + ').');
    return window.wpDice.rollFor(charId, r.formula, lbI || 'Initiative', { source: 'combat', priv: !!whyI, gmOnly: r.vis === 'gm' });
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
    var res = applyEffectOp(sys, c, f.id, q, F(), {});
    if (!res.ok) { toast(res.reason === 'field' ? 'That list cannot be changed.' : res.reason === 'missing' ? 'That effect is gone.' : 'That change is not allowed.'); renderViews(c.id); return; }
    var prev = c.values && Object.prototype.hasOwnProperty.call(c.values, f.id) ? clone(c.values[f.id]) : undefined, extra = null;
    if (res.clamp) { extra = {}; Object.keys(res.clamp).forEach(function(fid) { extra[fid] = c.values && Object.prototype.hasOwnProperty.call(c.values, fid) ? clone(c.values[fid]) : undefined; }); }
    lastChange = { charId: c.id, fieldId: f.id, prev: prev, extra: extra };   // revert brings a clamped pool back too
    c.values = c.values || {}; c.values[f.id] = res.value;
    var d = {}; d[f.id] = res.value;
    if (res.clamp) Object.keys(res.clamp).forEach(function(fid) { c.values[fid] = res.clamp[fid]; d[fid] = res.clamp[fid]; });
    afterCharChange(c, false, d);
}
function commitItem(c, f, q) {   // Stage 6 F4a: a row op q = { op: add|remove|setQty|keep|undo, defId?, rowId, qty? }
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
    if (!res.ok) { toast(res.reason === 'field' ? 'That list cannot be changed that way.' : res.reason === 'missing' ? 'That item is gone.' : 'That change is not allowed.'); renderViews(c.id); return; }
    undoFollow(res);
    var prev = c.values && Object.prototype.hasOwnProperty.call(c.values, f.id) ? clone(c.values[f.id]) : undefined;
    lastChange = { charId: c.id, fieldId: f.id, prev: prev };
    c.values = c.values || {}; c.values[f.id] = res.value;
    var d = {}; d[f.id] = res.value;
    if (ownerSeesSame(camp, sys, prev, res.value)) d = {};   // Stage 6: a change only to a row its owner never holds (a kept curse) is saved and never sent — even an unchanged copy would tell them
    afterCharChange(c, false, d);
}
// Stage 6: whether the owner's copy of a list is the same before and after (the players' view, the full library for GM-only inline rows)
function ownerSeesSame(camp, sys, a, b) {
    var pv = playerSystem(camp); if (!pv) return false;
    var lib = {}; (sys.items || []).forEach(function(it) { if (it && typeof it.id === 'string') lib[it.id] = it; });
    return JSON.stringify(projectRows(Array.isArray(a) ? a : [], pv, lib)) === JSON.stringify(projectRows(Array.isArray(b) ? b : [], pv, lib));
}
function revertLast() {
    if (!lastChange || isClient()) return;
    var camp = getActiveCampaign(), c = charById(lastChange.charId, camp); if (!c) { lastChange = null; return; }
    var d = {}, fidR = lastChange.fieldId, sysR = systemOf(camp), fR = sysR ? fieldById(sysR, fidR) : null, curR = c.values && Object.prototype.hasOwnProperty.call(c.values, fidR) ? clone(c.values[fidR]) : undefined;
    if (lastChange.prev === undefined) { delete c.values[lastChange.fieldId]; d[lastChange.fieldId] = null; }
    else { c.values[lastChange.fieldId] = lastChange.prev; d[lastChange.fieldId] = lastChange.prev; }
    if (lastChange.extra) Object.keys(lastChange.extra).forEach(function(fid) { var pv = lastChange.extra[fid]; if (pv === undefined) { delete c.values[fid]; d[fid] = null; } else { c.values[fid] = pv; d[fid] = pv; } });   // 5h: a pool an effect's end brought down
    if (fR && fR.kind === 'item-list' && ownerSeesSame(camp, sysR, curR, lastChange.prev)) delete d[fidR];   // F4b review: taking back a change its owner never held (a kept curse, a kept-on switch) tells them nothing
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
    if (!c) { c = newCharacter({ name: w.charName || w.name || w.sheet.name || 'Character' }); linkToken(w, c.id); }
    c.values = c.values || {}; Object.keys(r.values).forEach(function(k) { c.values[k] = r.values[k]; });
    afterCharChange(c, true);
    toast(r.matched + ' value' + (r.matched === 1 ? '' : 's') + ' copied into ' + c.name + '\'s sheet.');
    return { ok: true, charId: c.id, matched: r.matched };
}
// net.js hooks: a character arrived, changed or went
function charChanged(id) {
    var lost = {};   // HUD frame (HF2a): one notice per character, however many of its views close
    if (sheetOpen && isClient() && (id === null || sheetOpen === id)) { var gone = charById(sheetOpen); if (gone && (gone.partial || gone.ownerId !== myId())) { var nmG = gone.name; lost[gone.id] = 1; closeSheet(); toast(nmG + ' is no longer your character.'); var nG = net(); if (nG && nG.dropPending) nG.dropPending(gone.id); } }
    if (isClient()) Object.keys(huds).forEach(function(hid) { if (id !== null && id !== undefined && hid !== id) return; var gh = charById(hid); if (gh && !gh.partial && gh.ownerId === myId()) return; closeHud(hid); if (!lost[hid]) { lost[hid] = 1; toast((gh ? gh.name : 'That character') + ' is no longer your character.'); var nH = net(); if (nH && nH.dropPending) nH.dropPending(hid); } });
    renderViews(id); if (window.appRender) window.appRender(); if (window.wpRenderPartyStrip) window.wpRenderPartyStrip(); if (window.wpDice && window.wpDice.syncChars) window.wpDice.syncChars(); }
// the token's owner select moved (inspector.js): the character follows, and every token of it
function ownerFromToken(w) {
    var camp = getActiveCampaign(), c = w && w.charId ? charById(w.charId, camp) : null; if (!c || c.npc) return;
    if (!c.ownerId && !w.ownerId) return;
    giveCharacter(w.ownerId || '', c.id, { keep: w.id });   // a same-owner pick on a kept character's token makes it the one in play, with its token placed where they stand
}
function charGone(id) { var shown = false; if (sheetOpen === id) { closeSheet(); shown = true; } if (typeof id === 'string' && huds[id]) { closeHud(id); shown = true; } if (shown) toast('That character is no longer shared with you.'); if (window.appRender) window.appRender(); }
function editResult(rid, ok, reason, msg, op) { if (!ok) toast(reason === 'stays' ? (msg || (op === 'set' ? 'It stays on.' : 'You can\u2019t get rid of it.')) : reason === 'off' ? 'Character sheets are off here.' : reason === 'owner' ? 'That sheet is not yours.' : reason === 'field' ? 'That field cannot be edited.' : reason === 'slow' ? 'Slow down a little.' : reason === 'missing' ? 'That is no longer there.' : reason === 'timeout' ? 'No answer from the GM; the change was undone.' : reason === 'paused' ? 'The table is paused.' : 'That value was not accepted.'); renderViews(null); }

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
    var its = (Array.isArray(sys.items) ? sys.items : []).filter(function(it) { return it && it.vis === 'gm'; }).map(function(it) { return [it.id, cleanRowDef(it, false)]; });
    var fx = (Array.isArray(sys.effects) ? sys.effects : []).filter(function(d) { return d && d.vis === 'gm'; });
    return JSON.stringify([its, fx]);
}
// [systemcheck:gmfacing-end]
function saveDraft() {
    if (!draft || !canWrite()) return;
    var camp = getActiveCampaign(); if (!camp) return;
    draft.name = (ui('sysName').value || '').trim().slice(0, LIMITS.name);
    var clean = cleanSystem(draft, { F: F(), gmView: true });
    if (!clean) { toast('The system could not be saved.'); return; }
    var dropped = draft.fields.length - clean.fields.length;
    clean.updated = Date.now();
    var prevSys = camp.system, orphaned = orphanRows(prevSys, clean, camp.chars || {});   // Stage 6 F4a: a copy of a deleted entry keeps it (before the re-check drops unknown rows)
    camp.system = clean;
    reCleanChars(camp, clean);   // Stage 6: before the save and the sync (syncSystem re-sends every character after the system)
    stampRows(clean, camp.chars || {});   // Stage 6: a legacy row of a GM-only item gets its own id (its derived one would name the item)
    draft = clone(clean); dirty = false; var s = ui('sysSaveBtn'); if (s) s.classList.remove('on');
    save(true);
    var n = net(); if (n && n.syncSystem) n.syncSystem();
    if (n && n.active && n.role === 'host' && n.syncChars && gmFacing(prevSys) !== gmFacing(clean)) n.syncChars();   // Stage 6 F4a: an edit to a GM-only item or effect changes what its owner holds inline (the players' view alone would not resend it)
    var v = validateSystem(clean, F());
    toast((orphaned ? orphaned + ' carried cop' + (orphaned === 1 ? 'y' : 'ies') + ' of deleted items kept. ' : '') + 'System saved: ' + clean.fields.length + ' field' + (clean.fields.length === 1 ? '' : 's') + ', ' + clean.rolls.length + ' roll' + (clean.rolls.length === 1 ? '' : 's') + (dropped ? '; ' + dropped + ' with a bad key or kind dropped' : '') + (v.ok ? '.' : '; ' + v.errors.length + ' error' + (v.errors.length === 1 ? '' : 's') + ' to fix.'));
    renderAll(); renderViews(null);
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
    if (f.kind !== 'effects') flags.appendChild(select('sys-vis', [['all', 'Visible to players'], ['gm', 'GM only']], f.vis || 'all', 'GM only: the field and its value never leave your machine'));
    var hov = el('label', 'sys-hover'); var hc = el('input'); hc.type = 'checkbox'; hc.checked = !!f.hover; hc.className = 'sys-hover-chk'; hov.appendChild(hc); hov.appendChild(document.createTextNode(' Hover')); hov.title = 'Show on the token\'s hover card and the party strip'; flags.appendChild(hov);
    if (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill' || f.kind === 'resource') { var tl = el('label', 'sys-hover'); var tc = el('input'); tc.type = 'checkbox'; tc.checked = !!f.tile; tc.className = 'sys-tile-chk'; tl.appendChild(tc); tl.appendChild(document.createTextNode(' Tile')); tl.title = 'Show this field as a stat tile (big value, small label)'; flags.appendChild(tl); }   // Stage 3
    if (f.kind === 'number' && (!f.counter || f.slider)) { var sl = el('label', 'sys-hover'); var sc = el('input'); sc.type = 'checkbox'; sc.checked = !!f.slider; sc.className = 'sys-slider-chk'; sl.appendChild(sc); sl.appendChild(document.createTextNode(' Slider')); sl.title = 'Show this number as a range on a two-colour track with end labels (needs a min and a max)'; flags.appendChild(sl); }   // Stage 5e (a counter is not a slider: hidden while Counter is on, shown while a slider is set so it can be turned off)
    if ((f.kind === 'number' && !f.slider && !(Array.isArray(f.labels) && f.labels.length)) || f.kind === 'skill') { var cnl = el('label', 'sys-hover'); var cnc = el('input'); cnc.type = 'checkbox'; cnc.checked = !!f.counter; cnc.className = 'sys-counter-chk'; cnl.appendChild(cnc); cnl.appendChild(document.createTextNode(' Counter')); cnl.title = 'Draw \u2212 and + either side of the box (a turn counter, death saves, ammo, slots used)'; flags.appendChild(cnl); }   // HUD frame (HF4a, H8): never with a slider or value names
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
function rollRow(r) {
    var row = el('div', 'sys-row'); row.dataset.id = r.id;
    var top = el('div', 'sys-row-main');
    top.appendChild(input('sys-label field', r.label, 'The button\u2019s label; {formula} shows a value: Attack ({\u00b1AtkBonus})', 'Label'));
    top.appendChild(input('sys-formula field', r.formula, 'The roll: d20 + STRmod, 3d6 <= Skill.Stealth', 'Roll formula'));
    top.appendChild(select('sys-vis', [['all', 'Visible to players'], ['gm', 'GM only']], r.vis || 'all', 'GM only: players never see this roll'));
    top.appendChild(select('sys-roll-tone', [['', 'Plain button'], ['primary', 'Filled'], ['danger', 'Red (damage)'], ['neutral', 'Grey'], ['outline', 'Outline']], r.tone || '', 'How the button looks on the sheet'));   // Stage 6 look fold
    var roIcoIn = input('sys-roll-icon field', r.icon, 'An icon on the button \u2014 an emoji or a bundled icon (optional)', 'Icon'); top.appendChild(roIcoIn); top.appendChild(glyphButton(roIcoIn));
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
    var pn = playerNames(camp), ownOpts = [['', '— unassigned —']].concat(Object.keys(pn).map(function(pid) { return [pid, pn[pid]]; }));
    if (c.ownerId && !Object.prototype.hasOwnProperty.call(pn, c.ownerId)) ownOpts.push([c.ownerId, c.ownerId + ' (forgotten player)']);   // so unassigning them is a real change
    var owner = select('sys-char-owner', ownOpts, c.ownerId || '', 'The player who plays this character (their token moves and their sheet edits)'); owner.disabled = !!c.npc; top.appendChild(owner);
    var active = c.ownerId && !c.npc ? activeCharOf(camp, c.ownerId).id : null, several = !!c.ownerId && !c.npc && playableChars(camp, c.ownerId).length > 1;
    if (several) { var plL = el('label', 'sys-hover sys-char-playsl'); var pl = el('input'); pl.type = 'radio'; pl.name = 'sys-plays-' + c.ownerId; pl.className = 'sys-char-plays'; pl.checked = active === c.id; plL.appendChild(pl); plL.appendChild(document.createTextNode(' In play')); plL.title = 'The character this player plays now: their token follows them from map to map. Their other characters are kept: the sheets stay theirs, and you move those tokens.'; top.appendChild(plL); }
    var npcL = el('label', 'sys-hover'); var npc = el('input'); npc.type = 'checkbox'; npc.className = 'sys-char-npc'; npc.checked = !!c.npc; npcL.appendChild(npc); npcL.appendChild(document.createTextNode(' NPC')); npcL.title = 'An NPC has no player and never reaches players'; top.appendChild(npcL);
    var por = el('button', 'tool ghost sys-btn sys-char-portrait', c.portrait ? 'Portrait ✓' : 'Portrait…'); por.title = c.portrait ? c.portrait + ' (click to change, right-click to clear)' : 'Pick a picture from the Image Library'; por.dataset.act = 'portrait'; top.appendChild(por);
    var openB = el('button', 'tool ghost sys-btn', 'Open sheet'); openB.dataset.act = 'open'; openB.title = 'Open this character\'s sheet over the play map'; top.appendChild(openB);
    if (hudFor(c.id)) { var hudB = el('button', 'tool ghost sys-btn', 'HUD'); hudB.dataset.act = 'hud'; hudB.title = 'Open this character\'s HUD over the play map (the saved system\'s)'; top.appendChild(hudB); }   // HUD frame (HF2b)
    top.appendChild(btnRow([['delchar', 'Delete this character (tokens keep their name, lose the link)', '&times;']]));
    row.appendChild(top);
    var tokens = 0; Object.values(camp.items || {}).forEach(function(m) { if (m && m.type === 'map') (m.whiteboard || []).forEach(function(w) { if (w && w.charId === c.id) tokens++; }); });
    row.appendChild(el('div', 'sys-note', (tokens ? tokens + ' token' + (tokens === 1 ? '' : 's') + ' on the maps' : 'No token yet: pick this character in a token\'s Properties, or drop it from the Cast') + (c.ownerId ? ' · played by ' + (pn[c.ownerId] || c.ownerId) + (several ? (active === c.id ? ' (in play)' : ' (kept: you move its tokens)') : '') : c.npc ? ' · NPC' : ' · unassigned (players cannot see it until a player is set)')));
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
    top.appendChild(input('sys-fx-dur field', d.dur, 'A duration note (3 rounds, until dawn) \u2014 you end the effect by hand', 'Duration'));
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
    return row;
}
function fxOfRow(target) { var row = target.closest && target.closest('.sys-fx-row'); if (!row) return null; return (draft.effects || []).find(function(x) { return x.id === row.dataset.eid; }) || null; }
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
    var iIcoIn = input('sys-item-icon field', it.icon, 'An emoji or a bundled icon shown on the row', 'Icon'); flags.appendChild(iIcoIn); flags.appendChild(glyphButton(iIcoIn));
    flags.appendChild(select('sys-item-vis', [['all', 'Visible to players'], ['gm', 'GM only']], it.vis || 'all', 'GM only: kept out of the players\u2019 list. One you give a character reaches its owner (name, icon, category and notes); its formulas never leave your machine'));
    flags.appendChild(select('sys-item-rmmode', [['', 'A player may remove it'], ['bound', 'Bound: only the GM removes it'], ['curse', 'Curse on contact: you keep it']], it.rm || '', 'When a player removes it from their character. Bound: it stays on their sheet and they see your message. Curse on contact: it leaves their sheet but stays on the character, out of their sight, until you remove it. Players never see this setting.'));   // Stage 6
    var rmIn = input('sys-item-rmtext field', it.rmMsg || '', 'Shown to the player when they try to remove it (optional)', 'Message on removal'); rmIn.maxLength = LIMITS.rmMsg; if (!it.rm) rmIn.style.opacity = '0.5'; flags.appendChild(rmIn);
    var anyL = (draft.fields || []).some(function(x) { return x.kind === 'item-list' && x.list && x.list.lvl; }), anyO = (draft.fields || []).some(function(x) { return x.kind === 'item-list' && x.list && x.list.on; });   // Stage 6 F4b
    if (anyO) {
        flags.appendChild(select('sys-item-eqmode', [['', 'A player may switch it off'], ['bound', 'Bound: it stays on'], ['curse', 'Curse on contact: you keep it on']], it.eq || '', 'When a player switches it off (Readied, Equipped\u2026). Bound: it stays on and they see your message; just after it goes on, it still comes off. Curse on contact: it looks off to them but stays on, out of their sight, until you switch it off. Players never see this setting.'));
        var eqIn = input('sys-item-eqtext field', it.eqMsg || '', 'Shown to the player when they try to switch it off (optional)', 'Message on switching off'); eqIn.maxLength = LIMITS.rmMsg; if (!it.eq) eqIn.style.opacity = '0.5'; flags.appendChild(eqIn);
    }
    flags.appendChild(input('sys-item-key field', it.key || '', 'A short fixed name for it, once in each list it can be on: a letter, then letters, digits and _. Formulas that read a list\u2019s rows will use it (they come in a later update)', 'Key (optional)'));
    if (anyL) flags.appendChild(numField('sys-item-lvl', it.lvl, 'The level a new row of it starts at (blank: the list\u2019s default)', 'Level'));
    flags.appendChild(btnRow([['up', 'Move up', '&#9650;'], ['down', 'Move down', '&#9660;'], ['dup', 'Duplicate', '&#10697;'], ['del', 'Delete this item', '&times;']]));
    row.appendChild(top); row.appendChild(flags);
    var nrow = el('div', 'sys-item-notes-row'); nrow.appendChild(input('sys-item-notes field', it.notes, 'Notes shown on the sheet', 'Notes (optional)')); row.appendChild(nrow);
    var err = errorCell(it.id); err.dataset.errFor = it.id; row.appendChild(err);
    return row;
}
// Stage 6 F4b: the Lists tab — one card per item-list field: the categories its picker offers, the same item more than once, no quantity, a
// level per row (names count from its minimum) and a switch per row. Changes go to the draft; Save cleans them
function renderLists() {
    var box = ui('sysListRows'); if (!box) return; box.textContent = '';
    var lists = (draft.fields || []).filter(function(f) { return f.kind === 'item-list'; });
    if (!lists.length) { box.appendChild(el('div', 'sys-empty', 'No item lists yet. Add an Item list field in Fields (Skills, Weapons, Gear\u2026), then shape it here.')); return; }
    var cats = [], seen = Object.create(null);
    (draft.items || []).forEach(function(it) { var cc = String((it && it.category) || '').trim(); if (cc && !seen[cc.toLowerCase()]) { seen[cc.toLowerCase()] = 1; cats.push(cc); } });
    lists.forEach(function(f) { box.appendChild(listCard(f, cats)); });
}
function listCard(f, allCats) {
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
    return card;
}
function checkLabel(cls, on, text, title) { var l = el('label', 'sys-check'), cb = el('input', cls); cb.type = 'checkbox'; cb.checked = !!on; l.appendChild(cb); l.appendChild(document.createTextNode(' ' + text)); if (title) l.title = title; return l; }
function listOfCard(target) { var cd = target && target.closest ? target.closest('.sys-list-card') : null; if (!cd) return null; return (draft.fields || []).find(function(x) { return x.id === cd.dataset.lid; }) || null; }
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
    var efr = ui('sysEffectRows'); if (efr) { efr.textContent = ''; if (!draft.effects || !draft.effects.length) efr.appendChild(el('div', 'sys-empty', 'No status effects yet. Add Rage, Prone, Blessed\u2026 each with the numbers it changes, then put a Status effects field on the sheet.')); (draft.effects || []).forEach(function(d) { efr.appendChild(effectRow(d)); }); }
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
function fieldOfRow(target) { var row = target.closest('.sys-row'); if (!row || row.dataset.cid || row.dataset.iid || row.dataset.eid) return null; return { row: row, f: draft.fields.find(function(x) { return x.id === row.dataset.id; }), r: draft.rolls.find(function(x) { return x.id === row.dataset.id; }) }; }
function itemOfRow(target) { var row = target.closest && target.closest('.sys-item-row'); if (!row) return null; return (draft.items || []).find(function(x) { return x.id === row.dataset.iid; }) || null; }
function onInput(e) {
    if (!draft) return;
    var t = e.target; if (onLayoutInput(t)) return;
    var fxd = fxOfRow(t);   // 5h: a library effect's text boxes
    if (fxd) {
        var fc = t.className || '';
        if (fc.indexOf('sys-fx-name') >= 0) fxd.name = t.value.slice(0, LIMITS.name);
        else if (fc.indexOf('sys-fx-icon') >= 0) fxd.icon = t.value.slice(0, 32);
        else if (fc.indexOf('sys-fx-dur') >= 0) fxd.dur = t.value.slice(0, 200);
        else if (fc.indexOf('sys-fx-notes') >= 0) fxd.notes = t.value.slice(0, LIMITS.text);
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
        else return;
        markDirty(); patchErrors(); return;
    }
    var lcd = listOfCard(t);
    if (lcd) {   // Stage 6 F4b: the Lists tab's boxes (Save cleans them)
        var lcc = t.className || '', lsp = lcd.list || (lcd.list = {}), lvD = lsp.lvl && typeof lsp.lvl === 'object' ? lsp.lvl : null, numOr = function(o, k) { if (String(t.value).trim() === '') delete o[k]; else o[k] = Number(t.value); };
        if (lcc.indexOf('sys-list-lvllabel') >= 0 && lvD) lvD.label = t.value.slice(0, LIMITS.label);
        else if (lcc.indexOf('sys-list-lvlmin') >= 0 && lvD) numOr(lvD, 'min');
        else if (lcc.indexOf('sys-list-lvlmax') >= 0 && lvD) numOr(lvD, 'max');
        else if (lcc.indexOf('sys-list-lvlstep') >= 0 && lvD) numOr(lvD, 'step');
        else if (lcc.indexOf('sys-list-lvldef') >= 0 && lvD) numOr(lvD, 'def');
        else if (lcc.indexOf('sys-list-lvlnames') >= 0 && lvD) { var lvn = t.value.split(',').map(function(s) { return s.trim(); }).slice(0, LIMITS.labels); while (lvn.length && !lvn[lvn.length - 1]) lvn.pop(); if (lvn.some(Boolean)) lvD.labels = lvn; else delete lvD.labels; }
        else if (lcc.indexOf('sys-list-onlabel') >= 0 && lsp.on && typeof lsp.on === 'object') lsp.on.label = t.value.slice(0, LIMITS.label);
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
        if (c.indexOf('sys-label') >= 0) r.label = t.value.slice(0, LIMITS.label);
        else if (c.indexOf('sys-formula') >= 0) r.formula = t.value;
        else if (c.indexOf('sys-roll-icon') >= 0) { if (t.value.trim()) r.icon = t.value.slice(0, 32); else delete r.icon; }   // Stage 6 look fold
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
        if (c.indexOf('sys-item-rmmode') >= 0) { if (t.value === 'bound' || t.value === 'curse') iit.rm = t.value; else delete iit.rm; markDirty(); renderAll(); return; }   // Stage 6
        if (c.indexOf('sys-item-eqmode') >= 0) { if (t.value === 'bound' || t.value === 'curse') iit.eq = t.value; else delete iit.eq; markDirty(); renderAll(); return; }   // F4b
        if (c.indexOf('sys-item-shape') >= 0) { if (t.value === '') iit.area = null; else iit.area = { ft: iit.area ? iit.area.ft : 12, shape: 'circle', name: iit.area ? iit.area.name : '' }; markDirty(); renderAll(); return; }
        return;
    }
    var lch = listOfCard(t);
    if (lch) {   // Stage 6 F4b: the Lists tab's ticks
        var lsc = lch.list || (lch.list = {});
        if (c.indexOf('sys-list-catcb') >= 0) { var cur = Array.isArray(lsc.cats) ? lsc.cats.slice() : [], cx = t.dataset.cat || '', ci = cur.findIndex(function(y) { return String(y).toLowerCase() === cx.toLowerCase(); }); if (t.checked && ci < 0) cur.push(cx); if (!t.checked && ci >= 0) cur.splice(ci, 1); if (cur.length) lsc.cats = cur; else delete lsc.cats; }
        else if (c.indexOf('sys-list-multi') >= 0) { if (t.checked) lsc.multi = true; else delete lsc.multi; }
        else if (c.indexOf('sys-list-noqty') >= 0) { if (t.checked) lsc.noQty = true; else delete lsc.noQty; }
        else if (c.indexOf('sys-list-haslvl') >= 0) { if (t.checked) lsc.lvl = { label: 'Level', min: 0, step: 1, def: 0 }; else delete lsc.lvl; }
        else if (c.indexOf('sys-list-hason') >= 0) { if (t.checked) lsc.on = { label: 'On' }; else delete lsc.on; }
        else if (c.indexOf('sys-list-ondef') >= 0) { if (lsc.on && typeof lsc.on === 'object') { if (t.checked) lsc.on.def = true; else delete lsc.on.def; } }
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
        if (c.indexOf('sys-vis') >= 0) r.vis = t.value;
        else if (c.indexOf('sys-roll-tone') >= 0) { if (t.value) r.tone = t.value; else delete r.tone; }   // Stage 6 look fold
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
    var crow = b.closest('.sys-char-row');
    if (crow) {
        var camp = getActiveCampaign(), ch = charById(crow.dataset.cid, camp); if (!ch) return;
        if (b.dataset.act === 'open') { openSheet(ch.id); return; }
        if (b.dataset.act === 'hud') { openHud(ch.id); return; }
        if (b.dataset.act === 'delchar') { showConfirm('Delete ' + ch.name + '? Its values are gone; tokens keep their name and lose the link.', function(yes) { if (yes) { deleteCharacter(ch.id); renderAll(); } }); return; }
        if (b.dataset.act === 'portrait') { if (!window.wpPickImage) return; window.wpPickImage(function(src) { if (typeof src === 'string' && /^[/]saves[/]images[/]/.test(src)) { ch.portrait = src; afterCharChange(ch, true); renderAll(); } }); return; }
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
    var hdB = ui('sheetHud'); if (hdB) hdB.addEventListener('click', function() { if (sheetOpen) openHud(sheetOpen); });   // HUD frame (HF2a): the reference's header button
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
}
var _lastCamp = null;
setInterval(function() { var c = getActiveCampaign(), id = c ? c.id : null; if (_lastCamp !== null && id !== _lastCamp) { if (sheetOpen) closeSheet(); closeHuds(); } _lastCamp = id; }, 1000);
window.wpSheetsSync = sync;
setTimeout(sync, 0);
window.wpSheets = { open: open, close: close, playerSystem: playerSystem, readablePages: readablePages, openPage: openPage, sheetRefsChanged: sheetRefsChanged, systemOf: systemOf, save: saveDraft, startFrom: startFrom, sync: sync, draft: function() { return draft; },
    charsOf: charsOf, charList: charList, charById: charById, newCharacter: newCharacter, deleteCharacter: deleteCharacter, linkToken: linkToken, newFromToken: newFromToken, syncOwners: syncOwners, giveCharacter: giveCharacter, unbindName: unbindName, ownerFromToken: ownerFromToken,
    charSelectHtml: charSelectHtml, wireCharSelect: wireCharSelect, hoverLinesForToken: hoverLinesForToken, hoverLinesForTokenId: hoverLinesForTokenId,
    openSheet: openSheet, closeSheet: closeSheet, openHud: openHud, closeHud: closeHud, closeHuds: closeHuds, hudFor: hudFor, rolled: rolled, tokenTurned: tokenTurned, tokenCtxFor: tokenCtxFor, canOpen: canOpen, renderSheet: renderViews, renderSheetInto: renderSheetInto, charChanged: charChanged, charGone: charGone, editResult: editResult, sheetOpen: function() { return sheetOpen; }, canRoll: canRoll, hasInitRoll: hasInitRoll, rollInit: rollInit, fromShadowBase: fromShadowBase, LIMITS: LIMITS };

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
