/* Interactive tutorial: builds a "Tutorial" campaign the user can keep and build on (or
   discard), then walks through the app step by step with a spotlight and a card.

   KEEP THIS IN STEP WITH THE APP. Every step names the element it points at (`target`,
   a CSS selector — an id from index.html wherever possible). `node tools/tutorialcheck.js`
   verifies each static target still exists and the release script refuses to build when
   one is missing; at run time a step whose target is absent is skipped with a console
   warning, so a renamed button never strands the user. When a feature moves or a new one
   ships, edit STEPS (and the demo content in buildTutorialCampaign) in the same change.
   TUTORIAL_VERSION is shown on the Help pane so a stale tour is easy to spot. */

import { state } from './state.js';
import { createNewCampaign, createNewMap, createNewPlanner, getActiveCampaign } from './models.js';
import { save, toast } from './io.js';
import { updateCampaignSelect, updateSidebarNav, navigateToMap } from './sidebar.js';
import { showConfirm } from './dialogs.js';

var TUTORIAL_VERSION = '1.4.6';          // bump when STEPS or the demo campaign change
var TUTORIAL_CAMP_ID = 'camp_tutorial';  // one Tutorial campaign per save
var TUTORIAL_NAME = 'Tutorial';

function render() { if (window.appRender) window.appRender(); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/* ---------- the demo campaign ---------- */
// Ids are fixed so the tour can find its pieces and a rebuild replaces the old copy cleanly.
function buildTutorialCampaign() {
    var camp = createNewCampaign(TUTORIAL_NAME);
    camp.id = TUTORIAL_CAMP_ID;

    var valley = createNewMap('Greywater Valley');
    valley.id = 'map_tut_valley';
    valley.meta.homeX = 15300; valley.meta.homeY = 15200; valley.meta.lastView = 'data';
    valley.cats = {
        town:   { label: 'Town',        color: '#e0a54f' },
        wild:   { label: 'Wilderness',  color: '#5cb87a' },
        danger: { label: 'Danger',      color: '#d9534f' }
    };
    valley.rooms = [
        { id: 'tut_millbrook', name: 'Millbrook', cat: 'town', x: 15000, y: 15200, notes: 'A river town with a mill, a shrine and one very nervous mayor.\nThe party starts here.', characters: [{ id: 'tut_c_mayor', name: 'Mayor Ostra', info: 'Hiding that the town sold grain to the raiders.' }] },
        { id: 'tut_oldroad',  name: 'Old Road',  cat: 'wild', x: 15260, y: 15060, notes: 'Half a day on foot. A dashed line on the map means a route — travel, not a doorway.', characters: [] },
        { id: 'tut_woods',    name: 'Blackpine Woods', cat: 'wild', x: 15520, y: 15200, notes: 'Dark, quiet, and full of shortcuts only the locals know.', characters: [{ id: 'tut_c_hermit', name: 'Hermit Pell', info: 'Knows the hidden path to the cave.' }] },
        { id: 'tut_cave',     name: "Wyrm's Cave", cat: 'danger', x: 15520, y: 15400, notes: 'Double-click this node to travel into the cave map. The dotted line into it is a secret path.', characters: [], targetMapId: 'map_tut_cave', icon: 'Cave' }
    ];
    valley.links = [
        ['tut_millbrook', 'tut_oldroad', '', { label: 'Half a day on foot', notes: 'Safe by day. At night the raiders watch the ford.' }],
        ['tut_oldroad', 'tut_woods', 'route', { label: 'Cart track', notes: 'A route, not a doorway: travel takes time. Random encounter on a 1.' }],
        ['tut_woods', 'tut_cave', 'secret', { label: "Pell's path", notes: 'Only Hermit Pell knows it. Survival DC 15 to find it without him.' }],
        ['tut_millbrook', 'tut_woods', 'oneway', { label: 'Downstream ferry', notes: 'The ferry only runs downstream; the way back is the Old Road.' }]
    ];

    var cave = createNewMap("Wyrm's Cave");
    cave.id = 'map_tut_cave';
    cave.meta.parentId = valley.id;
    cave.meta.homeX = 15150; cave.meta.homeY = 15100; cave.meta.lastView = 'visual'; cave.meta.gridType = 'hex';
    cave.cats = { cave: { label: 'Cave', color: '#4db3d3' }, danger: { label: 'Danger', color: '#d9534f' } };
    cave.rooms = [
        { id: 'tut_entrance', name: 'Entrance', cat: 'cave', x: 15000, y: 15100, notes: 'Cold air, old bones, claw marks on the rock.', characters: [] },
        { id: 'tut_hoard',    name: "Wyrm's Hoard", cat: 'danger', x: 15300, y: 15100, notes: 'The wyrm sleeps on a bed of coin. Roll for stealth.', characters: [{ id: 'tut_c_wyrm', name: 'Cave Wyrm', info: 'Old, half-blind, hoards more than gold.' }] }
    ];
    cave.links = [['tut_entrance', 'tut_hoard']];
    // Hex-cell items sit on the flat-top lattice: cell centres at x = 45q + 15, y = 52(r + q/2)
    // (see CAMPAIGN_INTEGRATION.md); a 60×52 item's top-left is the centre minus (30, 26).
    function hexAt(q, r, props) { return Object.assign({ x: 45 * q + 15 - 30, y: 52 * (r + q / 2) - 26, w: 60, h: 52 }, props); }
    var q0 = 333, r0 = 124;   // the cell near (15000, 15106)
    cave.whiteboard = [
        { id: 'tut_wb_floor',  type: 'rect', x: 14790, y: 14934, w: 420, h: 312, color: '#262633', layer: 'back', nodeId: 'tut_entrance', name: 'Entrance floor' },
        { id: 'tut_wb_hoard',  type: 'rect', x: 15240, y: 14934, w: 420, h: 312, color: '#2a2230', layer: 'back', nodeId: 'tut_hoard', name: 'Hoard floor' },
        { id: 'tut_wb_label',  type: 'text', x: 14800, y: 14860, w: 360, h: 40, color: 'transparent', text: '<b>Wyrm\'s Cave</b> — drag the tokens, hover them, right-click one', fontSize: 14, layer: 'front' },
        hexAt(q0, r0,          { id: 'tut_wb_hero', type: 'circle', color: '#4db3d3', layer: 'middle', isChar: true, charName: 'Hero', name: 'Hero', charStats: 'Your character — drag me. Right-click for conditions, posture, elevation.' }),
        hexAt(q0 + 2, r0,      { id: 'tut_wb_ally', type: 'circle', color: '#5cb87a', layer: 'middle', isChar: true, charName: 'Torvin', name: 'Torvin', charStats: 'A friend with a lantern.' }),
        hexAt(q0 + 14, r0 - 7, { id: 'tut_wb_wyrm', type: 'circle', color: '#d9534f', layer: 'middle', isChar: true, charName: 'Cave Wyrm', name: 'Cave Wyrm', charStats: 'Old and half-blind. Hidden from players until you reveal it.', hidden: true, posture: 'lying-prone' }),
        hexAt(q0 + 6, r0 - 4,  { id: 'tut_wb_ledge', type: 'hexagon', color: '#3a3a4a', layer: 'back-mid', name: 'Ledge' }),
        hexAt(q0 + 8, r0 - 3,  { id: 'tut_wb_trap', type: 'trigger', shape: 'hexagon', color: 'transparent', eventMessage: 'The floor gives way — a pit trap! The wyrm stirs.', name: 'Pit trap' })
    ];

    var plan = createNewPlanner('Session 1 — Into the Cave');
    plan.id = 'plan_tut_session1';
    plan.meta.status = 'next';
    plan.blocks = [
        { type: 'h1', title: 'Session 1 — Into the Cave', sub: 'A one-evening tutorial adventure' },
        { type: 'lede', content: 'The mayor of Millbrook hires the party to find out what is taking the sheep. The trail leads through Blackpine Woods to the Wyrm\'s Cave.' },
        { type: 'h2', title: 'Beats' },
        { type: 'node', title: 'The hermit\'s bargain', tag: 'social', must: 'The party learns the secret path.', cols: ['Check', 'DC', 'On success'], rows: [{ col1: 'Persuade Pell', col2: '12', col3: 'He marks the path on their map.' }, { col1: 'Intimidate', col2: '15', col3: 'He talks, then warns the wyrm.' }] },
        { type: 'callout', content: 'Planners are yours alone — players never receive them, so put the twist here, not in a room name.' },
        { type: 'h2', title: 'The cave' },
        { type: 'text', content: 'Switch to the <b>Wyrm\'s Cave</b> map and its Play Map. The wyrm token is hidden from players until you reveal it (select it → Visible to players).' }
    ];

    camp.items[valley.id] = valley;
    camp.items[cave.id] = cave;
    camp.items[plan.id] = plan;
    camp.activeItemId = valley.id;
    return camp;
}

function tutorialCampaign() { return state.appState.campaigns[TUTORIAL_CAMP_ID] || null; }

// Creates the Tutorial campaign (or rebuilds it when asked) and makes it active
function ensureTutorialCampaign(rebuild) {
    var camp = tutorialCampaign();
    if (!camp || rebuild) {
        camp = buildTutorialCampaign();
        state.appState.campaigns[TUTORIAL_CAMP_ID] = camp;
    }
    state.appState.activeCampaignId = TUTORIAL_CAMP_ID;
    state.selId = null; state.selWbId = null; state.selWbIds = []; state.linkStart = null;
    updateCampaignSelect(); updateSidebarNav(); render(); save(true);
    return camp;
}

function discardTutorialCampaign(done) {
    var camp = tutorialCampaign();
    if (!camp) { toast('There is no Tutorial campaign to discard.'); if (done) done(false); return; }
    showConfirm('Discard the Tutorial campaign? Everything in it is deleted — including anything you built on top of it. This cannot be undone.', function(yes) {
        if (!yes) { if (done) done(false); return; }
        delete state.appState.campaigns[TUTORIAL_CAMP_ID];
        var rest = Object.keys(state.appState.campaigns);
        if (!rest.length) {   // it was the only campaign: leave the user with a fresh one, never an empty app
            var fresh = createNewCampaign('New Campaign');
            var first = createNewMap('New Map');
            fresh.items[first.id] = first; fresh.activeItemId = first.id;
            state.appState.campaigns[fresh.id] = fresh;
            rest = [fresh.id];
        }
        if (state.appState.activeCampaignId === TUTORIAL_CAMP_ID || !state.appState.campaigns[state.appState.activeCampaignId]) state.appState.activeCampaignId = rest[0];
        state.selId = null; state.selWbId = null; state.selWbIds = []; state.linkStart = null;
        updateCampaignSelect(); updateSidebarNav(); render(); save(true);
        toast('Tutorial campaign discarded.');
        if (done) done(true);
    });
}

/* ---------- the tour ---------- */
// Each step: target (selector or null for a centred card), title, html, before() to put the
// app in the right state first. Targets are ids from index.html wherever possible.
function goView(mode) { var b = document.querySelector('#viewModeSelect .seg-btn[data-mode="' + mode + '"]'); if (b && !b.classList.contains('active')) b.click(); }
function openItem(id) { var camp = getActiveCampaign(); if (!camp || !camp.items[id]) return; if (camp.items[id].type === 'map') navigateToMap(id); else { camp.activeItemId = id; state.selId = null; state.selWbId = null; state.selWbIds = []; updateSidebarNav(); render(); } }
function openLeft() { var sb = document.getElementById('campaignSidebar'); if (sb && sb.classList.contains('collapsed')) { var t = document.getElementById('toggleLeftBtn'); if (t) t.click(); } }

var STEPS = [
    { target: null, title: 'Welcome to Waypoint',
      html: 'This tour uses a small campaign called <b>Tutorial</b> that was just added to your save: a valley, a cave under it, and a session plan. It is a real campaign — <b>keep it and build on it</b>, or discard it at the end (or any time from Help → Tutorial). Use <b>Next</b> and <b>Back</b>; <b>Esc</b> leaves the tour.',
      before: function() { ensureTutorialCampaign(false); openLeft(); openItem('map_tut_valley'); goView('data'); } },
    { target: '#campaignSelect', title: 'Campaigns',
      html: 'Everything belongs to a campaign. This picker switches between them; the buttons beside it add, rename, search and delete campaigns. Your own campaigns are untouched by the tutorial.' },
    { target: '#mapNavList', title: 'Maps nest like places',
      html: '<b>Greywater Valley</b> holds <b>Wyrm\'s Cave</b>: world → region → building → room, as deep as you like. Drag a map onto another to nest it. Right-click a map for <b>New Child Map</b> (a map inside it) or <b>New Parent Map</b> (a new map that wraps it, with a portal node already placed).' },
    { target: '#viewModeSelect', title: 'Two faces of every map',
      html: 'The <b>Data Map</b> is the node view for your notes and connections; the <b>Play Map</b> is the battle map with tokens. This switch flips between them, and each map remembers which face you left it on.',
      before: function() { openItem('map_tut_valley'); goView('data'); } },
    { target: '#dataFloatingToolbar', title: 'Data map tools',
      html: '<b>Add Room</b> drops a node. <b>↔ Link Mode</b> connects two rooms — pick the line type first: a solid <b>path</b>, a dashed <b>route</b>, a dotted <b>secret</b> way or a <b>one-way</b> arrow. Hover a line and a small chip appears at its middle (a labelled line keeps its chip). Click the line or the chip to open it in <b>Properties</b>: a label that is drawn on the line (players see it), GM-only notes about the journey (never sent), the type, a swap for the direction, and Remove. <kbd>Delete</kbd> removes the selected link; right-click the chip for a quick type menu. The valley\'s lines are already labelled.' },
    { target: '#canvasWrap', title: 'Rooms and portals',
      html: 'Drag rooms around; click one to edit it on the right. <b>Wyrm\'s Cave</b> carries a cave icon because it is a <b>portal</b>: double-click it to travel into the cave map, and use the breadcrumb at the top to climb back out. In multiplayer, players travel by dropping their token on a portal.',
      before: function() { openItem('map_tut_valley'); goView('data'); } },
    { target: '#sidebar', title: 'The Properties panel',
      html: 'Whatever you select is edited here: a room\'s name, category colour, GM-only notes and the characters found there. Room notes and character info are <b>never sent to players</b>. The panel opens with a selection and closes when it clears; the arrow on its edge toggles it by hand.',
      before: function() { openItem('map_tut_valley'); goView('data'); state.selId = 'tut_millbrook'; render(); if (window.wpSyncRightPanel) window.wpSyncRightPanel(); } },
    { target: '#wbFloatingToolbar', title: 'Play map tools',
      html: 'Now inside the cave, on its Play Map. Left to right: centre, undo, grid and snap, then the tools — move, pan, draw, erase, <b>measure</b> (rulers; between two tokens at different heights it also prints the 3D figure) and <b>blast</b> (click a cell to drop a grenade radius: tokens in range light up with their distance, height included; drag a blast to move it, right-click it to remove it), then text, shapes, images and the picture library, and <b>Import Character</b> for a shadow-base.com sheet. <i>The blast button is a stopgap: blasts will be thrown from the VTT character sheets once those are in, and the preset explosive types are not permanent, names and radii alike &mdash; they will be set per campaign, from its own weapons, and customizable.</i>',
      before: function() { openItem('map_tut_cave'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); } },
    { target: '#whiteboardWrap', title: 'Tokens',
      html: 'Any shape or image with <b>Is Character</b> set is a token: hover it for its name and stats, drag it (it seats itself in a hex), <b>right-click</b> it for conditions, posture and elevation — the chips at its foot show height (<b>+3</b>) and posture (<b>KNL</b>, <b>PRN</b>…), and the switches for both live in Settings → Table. In a session a player can right-click <i>their own</i> token for the same posture and elevation rows, and your switches decide what they see. The <b>Cave Wyrm</b> is hidden from players — you see it dimmed — until you tick <b>Visible to players</b>. The hex trigger zone fires its message when a token is dropped on it.',
      before: function() { openItem('map_tut_cave'); goView('visual'); } },
    { target: '#plannerNavList', title: 'Planners',
      html: 'Document pages for session plans, encounter tables, and flowcharts — nest them like maps. <b>Session 1</b> is marked as the <b>next scene</b>, so it shows up in the play map\'s right-click menu during a game. Planners are yours alone; players never receive them.',
      before: function() { openItem('plan_tut_session1'); } },
    { target: '#plannerTools', title: 'Writing a planner',
      html: 'Add blocks from the toolbar: headings, prose, callouts, titled tables and flowcharts. <b>Render</b> shows the finished page; <b>Export As</b> turns it into an image, PDF or HTML.',
      before: function() { openItem('plan_tut_session1'); } },
    { target: '#netBtn', title: 'Multiplayer',
      html: 'Host a table from here: players join with a room code, follow the map you are on, move only their own tokens, and receive a <b>sanitised</b> copy of the campaign — no notes, no planners, no hidden items. Pause, whisper, summon, run combat and hand out handouts from the same place.' },
    { target: '#settingsBtn', title: 'Settings',
      html: 'Your name and table picture, light or dark theme, measurement units, the minimap and rulers, the <b>Token elevation</b> and <b>Token posture</b> switches, journal options and updates. Table settings travel with your saves folder.' },
    { target: '#helpBtn', title: 'Help is always here',
      html: 'Every topic in more depth, keyboard shortcuts, and this tour again whenever you want it. <b>Ctrl + K</b> jumps to any map, planner or room by name.' },
    { target: null, title: 'That\'s the tour', finish: true,
      html: 'The <b>Tutorial</b> campaign stays in your save so you can keep building on it — rename it, add maps, run a session. Or discard it now; your other campaigns are untouched either way.' }
];

var tour = { i: -1, overlay: null, spot: null, card: null, active: false };

function ensureDom() {
    if (tour.overlay) return;
    var ov = document.createElement('div'); ov.id = 'tourOverlay';
    ov.innerHTML = '<div id="tourSpot"></div><div id="tourCard"></div>';
    document.body.appendChild(ov);
    tour.overlay = ov; tour.spot = ov.querySelector('#tourSpot'); tour.card = ov.querySelector('#tourCard');
    window.addEventListener('resize', function() { if (tour.active) place(); });
    document.addEventListener('keydown', function(e) {
        if (!tour.active) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTour(); }
        else if (e.key === 'ArrowRight' || e.key === 'Enter') { if (!e.target.closest || !e.target.closest('input, textarea, select, [contenteditable="true"]')) { e.preventDefault(); next(1); } }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); next(-1); }
    }, true);
}

function targetEl(step) { return step.target ? document.querySelector(step.target) : null; }

function place() {
    var step = STEPS[tour.i]; if (!step) return;
    var el = targetEl(step), card = tour.card, spot = tour.spot;
    var W = window.innerWidth, H = window.innerHeight, pad = 6;
    if (el) {
        var r = el.getBoundingClientRect();
        spot.style.display = 'block'; spot.className = '';
        spot.style.left = (r.left - pad) + 'px'; spot.style.top = (r.top - pad) + 'px';
        spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';
        // the card sits beside the target on whichever side has room
        var cw = Math.min(380, W - 24), ch = card.offsetHeight || 200, x, y;
        if (r.right + 16 + cw <= W) { x = r.right + 16; y = r.top; }
        else if (r.left - 16 - cw >= 0) { x = r.left - 16 - cw; y = r.top; }
        else if (r.bottom + 16 + ch <= H) { x = r.left; y = r.bottom + 16; }
        else { x = r.left; y = r.top - 16 - ch; }
        x = Math.max(12, Math.min(x, W - cw - 12)); y = Math.max(12, Math.min(y, H - ch - 12));
        card.style.width = cw + 'px'; card.style.left = x + 'px'; card.style.top = y + 'px';
    } else {
        // no target: a zero-size spot in the middle still dims the whole screen
        spot.style.display = 'block'; spot.className = 'nospot';
        spot.style.left = Math.round(W / 2) + 'px'; spot.style.top = Math.round(H / 2) + 'px'; spot.style.width = '0px'; spot.style.height = '0px';
        var cw2 = Math.min(460, W - 24);
        card.style.width = cw2 + 'px';
        card.style.left = Math.round((W - cw2) / 2) + 'px';
        card.style.top = Math.round(Math.max(12, (H - (card.offsetHeight || 240)) / 2)) + 'px';
    }
}

function show(i, dir) {
    dir = dir || 1;
    // skip steps whose target has gone missing (the app moved on; tutorialcheck.js should have caught it)
    while (i >= 0 && i < STEPS.length && STEPS[i].target && !document.querySelector(STEPS[i].target)) {
        console.warn('[tutorial] step target missing, skipped:', STEPS[i].target);
        i += dir;
    }
    if (i < 0) i = 0;
    if (i >= STEPS.length) { endTour(); return; }
    tour.i = i;
    var step = STEPS[i];
    try { if (step.before) step.before(); } catch (e) { console.warn('[tutorial] step setup failed', e); }
    var html = '<div class="tour-step">Step ' + (i + 1) + ' of ' + STEPS.length + '</div><h3>' + esc(step.title) + '</h3><div class="tour-body">' + step.html + '</div><div class="tour-btns">';
    if (step.finish) {
        html += '<button class="tool ghost" id="tourDiscardEnd">Discard the Tutorial campaign</button><button class="tool" id="tourKeepEnd">Keep it &amp; finish</button>';
    } else {
        html += '<button class="tool ghost" id="tourSkip">Skip tour</button><span style="flex:1"></span>' + (i > 0 ? '<button class="tool ghost" id="tourBack">&larr; Back</button>' : '') + '<button class="tool" id="tourNext">Next &rarr;</button>';
    }
    html += '</div>';
    tour.card.innerHTML = html;
    var q = function(id) { return tour.card.querySelector('#' + id); };
    if (q('tourNext')) q('tourNext').addEventListener('click', function() { next(1); });
    if (q('tourBack')) q('tourBack').addEventListener('click', function() { next(-1); });
    if (q('tourSkip')) q('tourSkip').addEventListener('click', endTour);
    if (q('tourKeepEnd')) q('tourKeepEnd').addEventListener('click', function() { endTour(); toast('The Tutorial campaign is yours to build on. Help → Tutorial can discard or rebuild it.'); });
    if (q('tourDiscardEnd')) q('tourDiscardEnd').addEventListener('click', function() { endTour(); discardTutorialCampaign(); });
    var el = targetEl(step);
    if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
    // two passes: the card's height is only known once its content is in the DOM
    place(); setTimeout(place, 30); setTimeout(place, 250);
}
function next(dir) { show(tour.i + dir, dir); }

function startTour() {
    if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') { toast('The tutorial runs on your own campaigns — leave the session first.'); return; }
    ensureDom();
    try { localStorage.setItem('wp_tourSeen', '1'); } catch (e) {}
    var hm = document.getElementById('helpModal'); if (hm) hm.style.display = 'none';
    tour.active = true;
    tour.overlay.style.display = 'block';
    document.body.classList.add('tour-on');
    show(0, 1);
}
function endTour() {
    if (!tour.active) return;
    tour.active = false; tour.i = -1;
    if (tour.overlay) tour.overlay.style.display = 'none';
    document.body.classList.remove('tour-on');
}

/* ---------- Help → Tutorial pane wiring ---------- */
function syncPane() {
    var has = !!tutorialCampaign();
    var st = document.getElementById('tourState');
    if (st) st.innerHTML = has
        ? 'The <b>Tutorial</b> campaign is in your save' + (state.appState.activeCampaignId === TUTORIAL_CAMP_ID ? ' and open now' : '') + '. Keep building on it, run the tour again, rebuild it fresh, or discard it.'
        : 'Starting the tour adds a small <b>Tutorial</b> campaign to your save (a valley, a cave, a session plan). Your own campaigns are not touched.';
    var d = document.getElementById('tourDiscardBtn'); if (d) d.style.display = has ? '' : 'none';
    var r = document.getElementById('tourRebuildBtn'); if (r) r.style.display = has ? '' : 'none';
    var o = document.getElementById('tourOpenBtn'); if (o) o.style.display = has ? '' : 'none';
    var v = document.getElementById('tourVersion'); if (v) v.textContent = 'Tour version ' + TUTORIAL_VERSION + ' · ' + STEPS.length + ' steps';
}
(function wire() {
    var s = document.getElementById('tourStartBtn'); if (s) s.addEventListener('click', startTour);
    var o = document.getElementById('tourOpenBtn'); if (o) o.addEventListener('click', function() { ensureTutorialCampaign(false); var hm = document.getElementById('helpModal'); if (hm) hm.style.display = 'none'; toast('Tutorial campaign opened.'); });
    var r = document.getElementById('tourRebuildBtn'); if (r) r.addEventListener('click', function() {
        showConfirm('Rebuild the Tutorial campaign from scratch? Anything you added to it is lost.', function(yes) { if (!yes) return; ensureTutorialCampaign(true); syncPane(); toast('Tutorial campaign rebuilt.'); });
    });
    var d = document.getElementById('tourDiscardBtn'); if (d) d.addEventListener('click', function() { discardTutorialCampaign(function() { syncPane(); }); });
    var nav = document.getElementById('helpNav'); if (nav) nav.addEventListener('click', function(e) { var b = e.target.closest('[data-help]'); if (b && b.dataset.help === 'tutorial') syncPane(); });
    var hb = document.getElementById('helpBtn'); if (hb) hb.addEventListener('click', function() { setTimeout(syncPane, 0); });
    syncPane();
})();

/* ---------- first launch ----------
   The tour starts by itself exactly once, and only for a new user: a save with nothing in it
   yet (no rooms, no play-map items, no planners, one campaign at most). wp_tourSeen is a
   table preference, so it lives in saves/preferences.json and follows the saves folder — an
   existing campaign updated to this version never sees the pop-up. Everyone else finds the
   tour under Help → Tutorial. */
function saveIsFresh() {
    var camps = Object.values(state.appState.campaigns || {});
    if (camps.length > 1) return false;
    return camps.every(function(c) {
        return Object.values(c.items || {}).every(function(it) {
            if (it.type === 'planner') return false;
            return !((it.rooms || []).length || (it.whiteboard || []).length);
        });
    });
}
(function autoStart() {
    if (/[?&]stream=1/.test(location.search)) return;
    var seen = false; try { seen = localStorage.getItem('wp_tourSeen') === '1'; } catch (e) {}
    if (seen) return;
    var tries = 0;
    var t = setInterval(function() {
        tries++;
        var loaded = Object.keys(state.appState.campaigns || {}).length > 0;
        if (!loaded && tries < 40) return;          // wait for load() (up to ~12 s), then give up quietly
        clearInterval(t);
        if (!loaded) return;
        if (window.wpNet && window.wpNet.active) return;
        if (!saveIsFresh()) { try { localStorage.setItem('wp_tourSeen', '1'); } catch (e) {} return; }   // an existing table: never pop up, Help → Tutorial has it
        try { localStorage.setItem('wp_tourSeen', '1'); } catch (e) {}
        setTimeout(startTour, 600);
    }, 300);
})();

window.wpTutorial = { start: startTour, fresh: saveIsFresh, end: endTour, steps: STEPS, version: TUTORIAL_VERSION, ensure: ensureTutorialCampaign, discard: discardTutorialCampaign, build: buildTutorialCampaign };
