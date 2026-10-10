/* The left panel folded to a rail (1.5.4, backlog 107, step R4).
   The owner, of the left panel on the play map: "folded to a rail". The passed mock-up says of it: Handbook, Planners, Maps, unchanged. On
   the play map it starts folded to a rail. A press opens it, and a pin keeps it open.

   The panel is in one of three states, on every view:
     docked   as it always was: beside the map, with its grip.
     rail     folded: a narrow column of icons stands in its place (Handbook, Planners, Maps, Search, and a pin).
     open     opened from the rail: it lies over the map beside the rail, showing the section its icon names and no other, and a press
              anywhere else folds it again. The other sections are folded for that time and put back as they were afterwards.
   Arriving at the play map folds a docked panel to the rail, unless it was pinned there, and leaving the play map opens again what folded
   by itself. The arrow at the panel's edge works as it did: it folds a docked panel and docks a folded one, which on the play map is the
   same as the pin. Whether the panel is pinned on the play map is this computer's own (wp_leftPin). Nothing of the panel is changed: its
   sections, lists and buttons are the ones they were, each still in the page once, and the tour opens it through the same arrow. */
import { getActiveMap } from './models.js';
import { state } from './state.js';

// [lookcheck:leftrail-start]
var RAIL_SECS = ['handbook', 'planners', 'maps'];   // the panel's sections, as their titles name them (data-section)
// The panel's state after something happened. st: { mode: 'docked' | 'rail' | 'open', sec, auto, play, pin }: sec is the section it was
// opened at, auto says it folded by itself, play that the play map is on screen, pin that it is pinned there. ev: { t: 'view', play } the
// view changed, { t: 'icon', sec } a press on an icon of the rail, { t: 'away' } a press anywhere else or Esc, { t: 'pin' } the rail's pin,
// { t: 'toggle' } the arrow at the panel's edge. Always answers a new state
function railNext(st, ev) {
    var s = { mode: st && (st.mode === 'rail' || st.mode === 'open') ? st.mode : 'docked', sec: st && RAIL_SECS.indexOf(st.sec) >= 0 ? st.sec : '', auto: !!st && st.auto === true, play: !!st && st.play === true, pin: !!st && st.pin === true };
    var t = ev ? ev.t : '';
    if (t === 'view') {
        var play = ev.play === true;
        if (play !== s.play && s.mode === 'open') s.mode = 'rail';   // a panel that was only opened does not follow to or from the play map
        if (play && !s.play && !s.pin && s.mode === 'docked') { s.mode = 'rail'; s.auto = true; }   // arriving at the play map: folded, unless it is pinned there
        else if (!play && s.play && s.auto) { s.mode = 'docked'; s.auto = false; }                   // leaving it: what folded by itself opens again
        s.play = play;
    } else if (t === 'icon') {
        var sec = RAIL_SECS.indexOf(ev.sec) >= 0 ? ev.sec : '';
        if (sec && s.mode !== 'docked') { if (s.mode === 'open' && s.sec === sec) s.mode = 'rail'; else { s.mode = 'open'; s.sec = sec; } }   // the icon of the section it is open at folds it again
    } else if (t === 'away') { if (s.mode === 'open') s.mode = 'rail'; }
    else if (t === 'pin') { if (s.mode !== 'docked') { s.mode = 'docked'; s.auto = false; if (s.play) s.pin = true; } }
    else if (t === 'settle') { if (s.play && !s.pin && s.mode === 'docked') { s.mode = 'rail'; s.auto = true; } }   // as an arrival at the play map would leave it (the tour's end)
    else if (t === 'toggle') { var fold = s.mode === 'docked'; s.mode = fold ? 'rail' : 'docked'; s.auto = fold && s.play; if (s.play) s.pin = !fold; }   // on the play map the arrow is the pin's other half: folded there, it is the play map's fold, and opens again on another view
    if (s.mode !== 'open') s.sec = '';
    return s;
}
// The state, written to the page: the panel folded, open over the map or docked, the rail shown unless it is docked, the icon of the open
// section lit, and the arrow at the panel's edge saying what a press does now
function railApply(doc, s) {
    var sb = doc.getElementById('campaignSidebar'), rail = doc.getElementById('leftRail'), tg = doc.getElementById('toggleLeftBtn'); if (!sb || !rail) return false;
    sb.classList.toggle('collapsed', s.mode === 'rail'); sb.classList.toggle('floating', s.mode === 'open'); rail.hidden = s.mode === 'docked';
    RAIL_SECS.forEach(function(sec) { var b = rail.querySelector('[data-rail="' + sec + '"]'); if (b) { var on = s.mode === 'open' && s.sec === sec; b.classList.toggle('on', on); b.setAttribute('aria-expanded', on ? 'true' : 'false'); } });
    if (tg) { tg.textContent = s.mode === 'docked' ? '\u25c0' : '\u25b6'; tg.dataset.tip = s.mode === 'docked' ? 'Hide the left panel' : 'Show the left panel'; tg.removeAttribute('title'); }
    return true;
}
// Opened from the rail, the panel shows the section its icon names and no other (the owner, 2026-10-10: "these buttons should open just their
// section and leave the others collapsed if used"). railOnly unfolds that section and folds the others, each through its own title, so the
// panel's own folding stays the one place a section folds. It answers what it changed, { section: [folded before, folded now] }, added to
// what an earlier icon changed. railBack puts back what railOnly changed and nobody changed again since. A section is folded when its list is
// put away
function railSecOf(doc, sec) {
    var title = doc.querySelector('#campaignSidebar .section-title[data-section="' + sec + '"]'), box = title && title.closest ? title.closest('.sidebar-section') : null, nav = box ? box.querySelector('[id$="NavList"]') : null;
    return title && nav ? { title: title, box: box, nav: nav } : null;
}
// A title pressed by the rail wears a mark for that press: sidebar.js folds the section and keeps nothing of it, so a window closed while the
// panel is open from the rail comes back with the user's own folds (the review of 2026-10-10: they were written to this computer for good)
function railClick(title) { if (title.dataset) title.dataset.rail = '1'; try { title.click(); } finally { if (title.dataset) delete title.dataset.rail; } }
function railOnly(doc, sec, kept) {
    var k = kept && typeof kept === 'object' ? kept : {};
    if (RAIL_SECS.indexOf(sec) < 0) return k;
    RAIL_SECS.forEach(function(s2) {
        var p = railSecOf(doc, s2); if (!p) return;
        var folded = p.nav.style.display === 'none', want = s2 !== sec;
        if (folded === want) return;
        railClick(p.title);
        k[s2] = [k[s2] ? k[s2][0] : folded, want];
    });
    return k;
}
function railBack(doc, kept) {
    if (!kept || typeof kept !== 'object') return 0;
    var n = 0;
    RAIL_SECS.forEach(function(s2) {
        var rec = Array.isArray(kept[s2]) ? kept[s2] : null, p = rec ? railSecOf(doc, s2) : null; if (!p) return;
        var folded = p.nav.style.display === 'none';
        if (folded === rec[1] && folded !== rec[0]) { railClick(p.title); n++; }   // still as the rail left it, and not as it was before
    });
    return n;
}
function railPinRead(store) { try { return store.getItem('wp_leftPin') === '1'; } catch (e) { return false; } }
function railPinKeep(store, pin) { try { if (pin === true) store.setItem('wp_leftPin', '1'); else store.removeItem('wp_leftPin'); return true; } catch (e) { return false; } }
// [lookcheck:leftrail-end]

var st = { mode: 'docked', sec: '', auto: false, play: false, pin: railPinRead(localStorage) };
function playNow() { var am = getActiveMap(); return !!am && am.type === 'map' && state.viewMode === 'visual'; }
function touring() { return document.body.classList.contains('tour-on'); }
function act(ev) {
    var was = st; st = railNext(st, ev);
    if (touring()) st.pin = was.pin;   // the tour opens the panel for a step: that is no choice of the user's, to keep or to play by (the owed review, 2026-10-09: the pin stayed in memory and disagreed with the one kept)
    else if (st.pin !== was.pin) railPinKeep(localStorage, st.pin);
    railApply(document, st);
    if (st.mode === 'open' && (was.mode !== 'open' || was.sec !== st.sec)) showSection(st.sec);
    else if (was.mode === 'open' && st.mode !== 'open') showSection('');   // no longer open from the rail: the sections as they were
    if (st.mode !== was.mode && window.wpFitBar) window.wpFitBar();   // the map has more or less room: the toolbar is fitted again
    return st.mode;
}
var _only = null, _top = null;   // what the rail folded and unfolded for the section it shows, and where the panel was scrolled to, to put back
function showSection(sec) {   // the section the icon names, alone, the panel at its top; '' once the panel is no longer open from the rail
    var side = document.getElementById('campaignSidebar');
    if (!sec) { railBack(document, _only); _only = null; if (side && _top !== null) side.scrollTop = _top; _top = null; return; }
    if (side && _top === null) _top = side.scrollTop;
    _only = railOnly(document, sec, _only);
    if (side) side.scrollTop = 0;   // the others are folded to their titles: the shown section is in sight from the top, and no other box is asked to scroll
}
function wire() {
    var rail = document.getElementById('leftRail'); if (!rail) return;
    rail.addEventListener('click', function(e) {
        var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b) return;
        if (b.id === 'railPin') act({ t: 'pin' });
        else if (b.id === 'railSearch') { act({ t: 'away' }); if (window.wpCmdkOpen) window.wpCmdkOpen(); }
        else if (b.getAttribute('data-rail')) act({ t: 'icon', sec: b.getAttribute('data-rail') });
    });
    document.addEventListener('pointerdown', function(e) {   // a press anywhere but the panel and the rail folds a panel that was only opened
        if (st.mode !== 'open') return;
        var t = e.target; if (t && t.closest && (t.closest('#campaignSidebar') || t.closest('#leftRail') || t.closest('.context-menu') || t.closest('#tourCard'))) return;
        act({ t: 'away' });
    }, true);
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && st.mode === 'open') act({ t: 'away' }); });
    sync();
}
function sync() { return act({ t: 'view', play: playNow() }); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
window.wpLeftRail = { sync: sync, toggled: function() { return act({ t: 'toggle' }); }, settle: function() { return act({ t: 'settle' }); }, mode: function() { return st.mode; } };
