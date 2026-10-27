/* The top row's state pills (1.5.4, backlog 107, step R3).
   The owner passed the mock-up of the slim row "as drawn". Of its pills it says: what is going on, in a few words. A pill shows only
   while it has something to say. Outlined means on. Filled means it wants you. A press opens its thing.

   Four pills are made here, each a button that is in the page and put away until it has something to say (1.5.8, the owner: "we probably
   dont need this second fog button in the top of the app": the Fog pill is gone, and the toolbar's fog button says this map's fog):
     Table and a number   you are hosting, and how many players are connected. A press opens Multiplayer.
     Paused               the table is paused. It is filled, so it cannot be missed. A press resumes the table.
     Round and a name     the fight on the map on screen, and whose turn it is. A press opens the turn order.
     Viewing as a player  the fog is shown as a player sees it. A press ends the preview.
   The clock, a player's video, Review and Update were in the row before and stay the controls they were.

   A pill stores nothing and decides nothing: each says what another module already knows, and its press presses that module's own
   control. All five are the GM's. A player's app has none: its row says the table's campaign and map, as before. A name on a pill (whose
   turn it is, whom the fog is previewed for) is set as text: a player's name comes from the wire and a row's name can come from a file. */
import { getActiveMap } from './models.js';
import { state } from './state.js';

// [lookcheck:pills-start]
var PILLS = ['tablePill', 'pausedPill', 'roundPill', 'viewPill', 'scenePill', 'trialPill'];   // every pill made here, by its id, in the order the row has them
var PILL_NAME = 24;   // a name on a pill is cut to this many characters
function pillCut(s) { var a = Array.from(typeof s === 'string' ? s.trim() : ''); return a.length > PILL_NAME ? a.slice(0, PILL_NAME - 1).join('') + '\u2026' : a.join(''); }
function pillCount(v) { return typeof v === 'number' && isFinite(v) && v > 0 ? Math.min(Math.floor(v), 9999) : 0; }
// What each pill says, for the state the row is in. st: { gm, play, fog: 'on' | 'off' | none, hosting, players, paused, round, turn, preview,
// previewName }. A pill that has nothing to say is null. Nothing shows on a screen that is not the GM's
function pillsModel(st) {
    var out = { tablePill: null, pausedPill: null, roundPill: null, viewPill: null, scenePill: null, trialPill: null }; if (!st || st.gm !== true) return out;
    if (st.trial === true) out.trialPill = { text: 'Trial run', tip: 'A trial run is on for this campaign. Press to end it: keep the changes or put the campaign back as it was.' };   // 1.6.0 (campsafe.js)
    var play = st.play === true, hosting = st.hosting === true;
    if (hosting) { var n = pillCount(st.players); out.tablePill = { text: 'Table \u00b7 ' + n, tip: 'You are hosting. ' + (n === 1 ? '1 player is' : (n ? n : 'No') + ' players are') + ' connected. Opens Multiplayer.' }; }
    if (hosting && st.paused === true) out.pausedPill = { text: 'Paused', tip: 'The table is paused. Press to resume it.' };
    var r = pillCount(st.round), who = pillCut(st.turn);
    if (hosting && r) out.roundPill = { text: 'Round ' + r + (who ? ' \u00b7 ' + who : ''), tip: 'A fight is on this map' + (who ? ', and it is the turn of ' + who : '') + '. Opens the turn order.' };
    if (hosting && st.scene && typeof st.scene === 'object') { var sn = pillCut(st.scene.title) || 'a picture', sw = typeof st.scene.who === 'string' && st.scene.who ? st.scene.who : 'the table';   // backlog 181 (scene.js)
        out.scenePill = { text: 'Scene \u00b7 ' + sn, tip: 'Showing ' + sn + ' to ' + sw + (st.scene.hold === true ? '. It stays up until you close it' : '') + '. Press to show it again or close it for everyone.' }; }
    if (play && typeof st.preview === 'string' && st.preview !== '' && st.preview !== 'off') {
        var as = st.preview === 'party' ? 'the party' : (pillCut(st.previewName) || 'a player');
        out.viewPill = { text: 'Viewing as ' + as, tip: 'The fog is drawn as ' + as + ' sees it. Press to end the preview.' };
    }
    return out;
}
// The pills as the page shows them: each put away or shown, with its words as text and its tooltip
function pillsDraw(doc, model) {
    var shown = 0;
    PILLS.forEach(function(id) {
        var el = doc.getElementById(id), p = model ? model[id] : null; if (!el) return;
        el.hidden = !p; if (!p) return; shown++;
        var t = el.querySelector('.pill-txt'); if (t && t.textContent !== p.text) t.textContent = p.text;
        if (el.title !== p.tip) el.title = p.tip;
    });
    return shown;
}
// The state the row is in, read from what the other modules already hold. w: the window, am: the item on screen, view: the view's name,
// fogBtn: the toolbar's fog button, which fog.js keeps in step with this map's fog
function pillsState(w, am, view, fogBtn) {
    var net = w.wpNet || null, fog = w.wpFog || null, vtt = w.wpVtt || null, isMap = !!am && am.type === 'map' && typeof am.id === 'string';
    var st = { gm: !(net && ((net.active && net.role === 'client') || net.foreign)), play: isMap && view === 'visual', hosting: !!net && net.active === true && net.role === 'host' };
    if (fogBtn && vtt && typeof vtt.on === 'function' && vtt.on('fog')) st.fog = fogBtn.classList.contains('fog-on') ? 'on' : 'off';
    var ros = st.hosting && net.roster ? net.roster : {};
    st.players = Object.keys(ros).filter(function(k) { return !!ros[k] && typeof ros[k].id === 'string'; }).length;
    st.paused = st.hosting && net.paused === true;
    st.scene = st.hosting && w.wpScene && typeof w.wpScene.now === 'function' ? w.wpScene.now() : null;   // backlog 181: the scene up, as scene.js says it
    st.trial = !!(w.wpCampSafe && typeof w.wpCampSafe.trialOn === 'function' && w.wpCampSafe.trialOn() === true);   // 1.6.0: a trial run of the campaign on screen
    var c = !st.hosting || !isMap ? null : typeof w.wpStripFight === 'function' ? w.wpStripFight(am.id) : (typeof net.combatFor === 'function' ? net.combatFor(am.id) : null);   // fold 2 (backlog 152): the fight the strip shows on this map
    if (c && Array.isArray(c.rows)) { var cur = c.rows[c.turn]; st.round = c.round; st.turn = cur && typeof cur.name === 'string' ? cur.name : ''; }
    st.preview = fog && typeof fog.preview === 'function' ? fog.preview() : 'off';
    if (typeof st.preview === 'string' && st.preview !== 'off' && st.preview !== 'party') Object.keys(ros).forEach(function(k) { if (ros[k] && ros[k].id === st.preview && typeof ros[k].name === 'string') st.previewName = ros[k].name; });
    return st;
}
// What a press on a pill does: it presses the control that owns the thing, or asks the module that does. Answers what it did
function pillPress(id, doc, w, am) {
    var press = function(ctl) { var b = doc.getElementById(ctl); if (!b) return ''; b.click(); return ctl; };
    if (id === 'tablePill') return press('netBtn');
    if (id === 'pausedPill') return w.wpNet && w.wpNet.paused === true ? press('sessionPauseBtn') : '';   // never a press that would pause a table that runs
    if (id === 'roundPill') { if (!am || typeof w.wpOpenCombat !== 'function') return ''; w.wpOpenCombat(am.id, {}); return 'combat'; }
    if (id === 'scenePill') { if (!w.wpScene || typeof w.wpScene.open !== 'function') return ''; w.wpScene.open(); return 'scene'; }
    if (id === 'trialPill') { if (!w.wpCampSafe || typeof w.wpCampSafe.endTrial !== 'function') return ''; w.wpCampSafe.endTrial(); return 'trial'; }
    if (id === 'viewPill') { if (!w.wpFog || typeof w.wpFog.setPreview !== 'function') return ''; w.wpFog.setPreview('off'); var sel = doc.getElementById('fogPreview'); if (sel) sel.value = 'off'; return 'preview'; }
    return '';
}
// [lookcheck:pills-end]

function pillsSync() { return pillsDraw(document, pillsModel(pillsState(window, getActiveMap(), state.viewMode, document.getElementById('fogModeBtn')))); }
function wire() {
    var box = document.getElementById('rowPills');
    if (box) box.addEventListener('click', function(e) {
        var b = e.target && e.target.closest ? e.target.closest('.pill') : null; if (!b || PILLS.indexOf(b.id) < 0) return;
        var id = b.id; setTimeout(function() { pillPress(id, document, window, getActiveMap()); pillsSync(); }, 0);   // after this press is over: a menu that closes at a press elsewhere would close the one just opened
    });
    pillsSync();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
window.wpPills = { sync: pillsSync };
