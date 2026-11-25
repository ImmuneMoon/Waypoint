/* The left panel and its rail (1.5.4, backlog 107, step R4; reworked in 1.6.2).
   The owner, of the left panel on the play map: "folded to a rail". In 1.6.2, at the click test of the layout editor: "keeping the panel's
   buttons on the rail might be a good solution to there being so much on the panel, showing only whats clicked, then placing the hide button
   on that side bar", and "the buttons that you click to show their part should only show that part, and we can have a show all button too
   for people that want it all in the side panel".

   The rail stands at the window's left edge on every view: an icon for each section of the panel, All, Search, and at its foot the button
   that hides and shows the panel (the arrow that stood at the panel's edge until 1.6.2). The panel is in one of three states:
     docked   beside the rail and the map, with its grip.
     rail     hidden: the rail alone.
     open     opened from the rail: it lies over the map beside the rail, and a press anywhere else hides it again. The pin docks it.
   The panel shows ONE section, the one whose icon was pressed last, or every section one under another while All is on. Which it shows is
   this computer's own (wp_leftShow), and with none kept it shows the first section this screen has. While the tour's card is up every
   section shows, as the tour's steps point into them. Arriving at the play map hides a docked panel unless it was pinned there (wp_leftPin),
   and leaving the play map shows again what hid by itself. Nothing of the panel is changed: its sections, lists and buttons are the ones they
   were, each still in the page once, a section that is not shown is only put away, and the tour opens the panel through the same arrow. */
import { getActiveMap } from './models.js';
import { state } from './state.js';

// [lookcheck:leftrail-start]
var RAIL_SECS = ['handbook', 'planners', 'maps', 'characters', 'decks'];   // the panel's sections, as their titles name them (data-section)
// The panel's state after something happened. st: { mode: 'docked' | 'rail' | 'open', show, auto, play, pin }: show is the section the panel
// shows alone, 'all' for every section, '' for the first this screen has; auto says it hid by itself, play that the play map is on screen,
// pin that it is pinned there. ev: { t: 'view', play } the view changed, { t: 'icon', sec } a press on an icon of the rail ('all' for All),
// { t: 'away' } a press anywhere else or Esc, { t: 'pin' } the rail's pin, { t: 'toggle' } the arrow at the rail's foot. Always answers a
// new state
function railNext(st, ev) {
    var s = { mode: st && (st.mode === 'rail' || st.mode === 'open') ? st.mode : 'docked', show: st && (st.show === 'all' || RAIL_SECS.indexOf(st.show) >= 0) ? st.show : '', auto: !!st && st.auto === true, play: !!st && st.play === true, pin: !!st && st.pin === true };
    var t = ev ? ev.t : '';
    if (t === 'view') {
        var play = ev.play === true;
        if (play !== s.play && s.mode === 'open') s.mode = 'rail';   // a panel that was only opened does not follow to or from the play map
        if (play && !s.play && !s.pin && s.mode === 'docked') { s.mode = 'rail'; s.auto = true; }   // arriving at the play map: hidden, unless it is pinned there
        else if (!play && s.play && s.auto) { s.mode = 'docked'; s.auto = false; }                   // leaving it: what hid by itself shows again
        s.play = play;
    } else if (t === 'icon') {
        var sec = ev.sec === 'all' || RAIL_SECS.indexOf(ev.sec) >= 0 ? ev.sec : '';
        if (sec) {
            if (s.mode === 'rail') { s.mode = 'open'; s.show = sec; }             // hidden: it opens over the map at that section
            else if (s.mode === 'open' && s.show === sec) s.mode = 'rail';        // the icon of the section it is open at hides it again
            else if (s.mode === 'docked' && (typeof ev.lit === 'string' ? ev.lit : s.show) === sec) { s.mode = 'rail'; s.auto = s.play; if (s.play) s.pin = false; }   // 1.6.4 (Fulllion, 2026-11-24): the lit icon pressed hides the panel, as its arrow does
            else s.show = sec;                                                     // shown: it shows that section instead
        }
    } else if (t === 'away') { if (s.mode === 'open') s.mode = 'rail'; }
    else if (t === 'pin') { if (s.mode !== 'docked') { s.mode = 'docked'; s.auto = false; if (s.play) s.pin = true; } }
    else if (t === 'settle') { if (s.play && !s.pin && s.mode === 'docked') { s.mode = 'rail'; s.auto = true; } }   // as an arrival at the play map would leave it (the tour's end)
    else if (t === 'toggle') { var hide = s.mode !== 'rail'; s.mode = hide ? 'rail' : 'docked'; s.auto = hide && s.play; if (s.play) s.pin = !hide; }   // on the play map the arrow is the pin's other half: hidden there, it is the play map's own, and shows again on another view
    return s;
}
// A section this screen has: its title and list in the panel, its box not put away, and its icon on the rail not put away (a player's app
// has no Planners or Maps, and the Characters and Decks sections are put away where there is nothing to list)
function railSecOf(doc, sec) {
    var title = doc.querySelector('#campaignSidebar .section-title[data-section="' + sec + '"]'), box = title && title.closest ? title.closest('.sidebar-section') : null, nav = box ? box.querySelector('[id$="NavList"]') : null;
    return title && nav ? { title: title, box: box, nav: nav } : null;
}
function railHas(doc, sec) {
    var p = railSecOf(doc, sec), rail = doc.getElementById('leftRail'), b = rail ? rail.querySelector('[data-rail="' + sec + '"]') : null;
    if (!p || p.box.hidden || !b || b.hidden) return false;
    return !(doc.body && doc.body.classList.contains('net-client') && b.classList.contains('gm-only'));
}
// The section the panel shows alone, or 'all': the one asked for where this screen has it, else the first it has in the panel's order
function railShows(doc, s) {
    if (!s || s.show === 'all') return 'all';
    if (s.show && railHas(doc, s.show)) return s.show;
    var sb = doc.getElementById('campaignSidebar'), titles = sb ? sb.querySelectorAll('.section-title[data-section]') : [];
    for (var i = 0; i < titles.length; i++) { var k = titles[i].getAttribute('data-section'); if (RAIL_SECS.indexOf(k) >= 0 && railHas(doc, k)) return k; }
    return 'all';
}
// The state, written to the page: the panel hidden, open over the map or docked, the rail always shown, the sections not shown put away, the
// icon of the section shown lit (All while every section shows), the pin only on a panel that was only opened, and the arrow at the rail's
// foot saying what a press does now. Nothing is written that is already so: the rail's watcher reads the page's own changes
function railSet(el, k, v) { if (el[k] !== v) el[k] = v; }
function railOn(b, on) { if (b.classList.contains('on') !== on) b.classList.toggle('on', on); if (b.getAttribute('aria-pressed') !== (on ? 'true' : 'false')) b.setAttribute('aria-pressed', on ? 'true' : 'false'); }
function railApply(doc, s) {
    var sb = doc.getElementById('campaignSidebar'), rail = doc.getElementById('leftRail'), tg = doc.getElementById('toggleLeftBtn'); if (!sb || !rail) return false;
    var seen = s.mode !== 'rail', only = railShows(doc, s);
    sb.classList.toggle('collapsed', s.mode === 'rail'); sb.classList.toggle('floating', s.mode === 'open'); railSet(rail, 'hidden', false);
    RAIL_SECS.forEach(function(sec) {
        var b = rail.querySelector('[data-rail="' + sec + '"]'); if (b) railOn(b, seen && only === sec);
        var p = railSecOf(doc, sec); if (p && p.box.classList.contains('rail-off') !== (only !== 'all' && only !== sec)) p.box.classList.toggle('rail-off', only !== 'all' && only !== sec);
    });
    var all = doc.getElementById('railAll'); if (all) railOn(all, seen && only === 'all');
    var pin = doc.getElementById('railPin'); if (pin) railSet(pin, 'hidden', s.mode !== 'open');
    if (tg) { tg.setAttribute('aria-expanded', seen ? 'true' : 'false'); tg.dataset.tip = seen ? 'Hide the left panel' : 'Show the left panel'; tg.removeAttribute('title'); }
    return true;
}
// The section shown alone is unfolded while it is shown, through its own title, so the panel's own folding stays the one place a section
// folds. railOnly answers what it changed, { section: [folded before, folded now] }, added to what was changed before. railBack puts back
// what railOnly changed and nobody changed again since. A section is folded when its list is put away
// A title pressed by the rail wears a mark for that press: sidebar.js folds the section and keeps nothing of it, so a fold the rail made is
// no choice of the user's (the review of 2026-10-10: they were written to this computer for good)
function railClick(title) { if (title.dataset) title.dataset.rail = '1'; try { title.click(); } finally { if (title.dataset) delete title.dataset.rail; } }
function railOnly(doc, sec, kept) {
    var k = kept && typeof kept === 'object' ? kept : {};
    var p = RAIL_SECS.indexOf(sec) >= 0 ? railSecOf(doc, sec) : null; if (!p) return k;
    if (p.nav.style.display === 'none') { railClick(p.title); k[sec] = [k[sec] ? k[sec][0] : true, false]; }
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
// Nothing kept yet is a first run, which shows every section, so a newcomer finds the planner, map or character they just made (the release
// click test of 1.6.3, finding 45: the first section alone, the Handbook, showed, with the rest behind the rail's icons). railShowKeep never
// keeps '' (it takes the key out), so a missing key only ever means nobody has picked yet, and a store this computer cannot read is the same.
// A word the rail does not know still reads as the first section.
function railShowRead(store) { try { var v = store.getItem('wp_leftShow'); if (v === null || v === undefined) return 'all'; return v === 'all' || RAIL_SECS.indexOf(v) >= 0 ? v : ''; } catch (e) { return 'all'; } }
function railShowKeep(store, show) { try { if (show === 'all' || RAIL_SECS.indexOf(show) >= 0) store.setItem('wp_leftShow', show); else store.removeItem('wp_leftShow'); return true; } catch (e) { return false; } }
// [lookcheck:leftrail-end]

var st = { mode: 'docked', show: railShowRead(localStorage), auto: false, play: false, pin: railPinRead(localStorage) };
function playNow() { var am = getActiveMap(); return !!am && am.type === 'map' && state.viewMode === 'visual'; }
function touring() { return document.body.classList.contains('tour-on'); }
function act(ev) {
    var was = st; st = railNext(st, ev);
    if (touring()) st.pin = was.pin;   // the tour opens the panel for a step: that is no choice of the user's, to keep or to play by (the owed review, 2026-10-09: the pin stayed in memory and disagreed with the one kept)
    else if (st.pin !== was.pin) railPinKeep(localStorage, st.pin);
    if (st.show !== was.show) railShowKeep(localStorage, st.show);
    drawn();
    if (st.mode !== was.mode && window.wpFitBar) window.wpFitBar();   // the map has more or less room: the toolbar is fitted again
    return st.mode;
}
var _only = null, _sec = '';   // what the rail unfolded for the section it shows alone, to put back, and that section
// The state written again, as the page has it now: a section that comes or goes (a character arrives, Decks is switched on) changes what
// the panel can show, and the section shown alone is unfolded, at the panel's top
function drawn() {
    railApply(document, st);
    var sec = st.mode === 'rail' ? '' : railShows(document, st); if (sec === 'all') sec = '';
    if (sec === _sec) return;
    railBack(document, _only); _only = null; _sec = sec;
    if (!sec) return;
    _only = railOnly(document, sec, null);
    var side = document.getElementById('campaignSidebar'); if (side) side.scrollTop = 0;
}
function wire() {
    var rail = document.getElementById('leftRail'), side = document.getElementById('campaignSidebar'); if (!rail) return;
    rail.addEventListener('click', function(e) {
        var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b) return;
        if (b.id === 'railPin') act({ t: 'pin' });
        else if (b.id === 'railAll') act({ t: 'icon', sec: 'all', lit: st.mode === 'rail' ? '' : railShows(document, st) });
        else if (b.id === 'railSearch') { act({ t: 'away' }); if (window.wpCmdkOpen) window.wpCmdkOpen(); }
        else if (b.getAttribute('data-rail')) act({ t: 'icon', sec: b.getAttribute('data-rail'), lit: st.mode === 'rail' ? '' : railShows(document, st) });   // lit: the icon lit now, whose press hides the panel
    });
    document.addEventListener('pointerdown', function(e) {   // a press anywhere but the panel, the rail and a menu of theirs hides a panel that was only opened (1.6.0, found by hand: hiding it took the row of the panel's own menu away from under the press)
        if (st.mode !== 'open') return;
        var t = e.target; if (t && t.closest && (t.closest('#campaignSidebar') || t.closest('#leftRail') || t.closest('.context-menu') || t.closest('#sidebarContextMenu') || t.closest('#tourCard'))) return;
        act({ t: 'away' });
    }, true);
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && st.mode === 'open' && (!window.wpEsc || window.wpEsc.free(e))) act({ t: 'away' }); });
    if (typeof MutationObserver === 'function') {   // a section or an icon put away or shown again, by whichever module: what the panel shows is written again
        var mo = new MutationObserver(drawn);
        mo.observe(rail, { attributes: true, attributeFilter: ['hidden'], subtree: true });
        if (side) mo.observe(side, { attributes: true, attributeFilter: ['hidden'], subtree: true });
    }
    sync();
}
function sync() { return act({ t: 'view', play: playNow() }); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
window.wpLeftRail = { sync: sync, toggled: function() { return act({ t: 'toggle' }); }, settle: function() { return act({ t: 'settle' }); }, mode: function() { return st.mode; }, shows: function() { return railShows(document, st); }, drawn: drawn, away: function() { return act({ t: 'away' }); } };
