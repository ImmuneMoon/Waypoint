function setZoom(n, x, y) { if(window.appSetZoom) window.appSetZoom(n, x, y); }



function render() { if(window.appRender) window.appRender(); }
function restoreCameraPosition() { if(window.appRestoreCamera) window.appRestoreCamera(); }



var saveNote = document.getElementById('saveNote');

var campaignSelect = document.getElementById('campaignSelect');

var modeSelect = document.getElementById('viewModeSelect');

var inspector = document.getElementById('inspector');

var canvas = document.getElementById('canvas');

var svg = document.getElementById('edges');

var wrap = document.getElementById('canvasWrap');

var wbWrap = document.getElementById('whiteboardWrap');

var wb = document.getElementById('whiteboard');



import { state, dom, CATS } from './state.js';

import { uid, clone, createNewCampaign, createNewMap, createNewPlanner, getActiveCampaign, getActiveMap } from './models.js';



import { updateCampaignSelect, updateSidebarNav } from './sidebar.js';

import { showPrompt, showConfirm, isCampaignNameTaken, getUniqueCampaignTitle, promptForCampaignName, isItemNameTaken, getUniqueItemTitle, promptForItemName } from './dialogs.js';

import { renderPlanner, renderPlannerPreview } from './planner.js';

import { renderDataMap, clearSnaps, drawSnap, doSmartSnapping, attachDrag, attachPanning, isLinkMode, setLinkMode, removeLinkAt } from './datamap.js';

import { renderWhiteboard, attachResizeHandle, attachRotateHandle, addWbItem, uploadImageFile } from './whiteboard.js';

import { getRoomInspectorHtml, attachRoomInspectorEvents, renderInspector,  renderElementList, esc } from './inspector.js';

import { onLoad as cleanupOnLoad, sweepRecents, dropWaiting } from './cleanup.js';



  /* ---------- save-format migration ----------
     Upgrades a save from ANY prior Waypoint version to the current shape,
     touching nothing it doesn't have to. Runs on every load; if it changed
     anything the upgraded save is written back once (the shell snapshots the
     original into saves/backups on launch, so the pre-migration file survives). */
  var CURRENT_SCHEMA = 2;

  // Nearest flat-top hex cell centre (mirrors snapToHex in datamap.js; s = 30,
  // 45 px columns, 52 px rows, centres at x = 45q + 15, y = 52(r + q/2)).
  function hexCenterFlat(x, y) {
      var s = 30, h = 52;
      var q = (x - s / 2) / (1.5 * s), r = y / h - q / 2;
      var rx = Math.round(q), ry = Math.round(r), rz = Math.round(-q - r);
      var xd = Math.abs(rx - q), yd = Math.abs(ry - r), zd = Math.abs(rz - (-q - r));
      if (xd > yd && xd > zd) rx = -ry - rz; else if (yd > zd) ry = -rx - rz;
      return { x: 1.5 * s * rx + s / 2, y: h * (ry + rx / 2) };
  }
  var _bindNotes = [];   // Onboarding F0: what the normaliser bound, for load()'s one-time notice (never from migrateAppState itself: it also runs in the stream window, pop-outs and cleanup copies)
  function migrateAppState(data) {
    var changed = false;
    _bindNotes = [];
    function fix(reason) { changed = true; }
    function isPlain(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }   // an entry the app reads fields from: a null, a number, a string or a list there (a hand-edited or generated file) is dropped

    // v0 (earliest builds): { maps: {...}, activeMapId } with no campaign layer
    if (data && data.maps && !data.campaigns) {
        var wrapped = createNewCampaign('My Campaign');
        wrapped.items = data.maps;
        wrapped.activeItemId = data.activeMapId;
        data = { activeCampaignId: wrapped.id, campaigns: {} };
        data.campaigns[wrapped.id] = wrapped;
        fix('legacy single-campaign save wrapped');
    }
    if (!data || typeof data !== 'object') { data = {}; fix('unreadable state reset'); }
    if (!data.campaigns || typeof data.campaigns !== 'object') { data.campaigns = {}; fix('campaigns dict created'); }

    Object.keys(data.campaigns).forEach(function(cid) {
        var c = data.campaigns[cid];
        if (!c || typeof c !== 'object') { delete data.campaigns[cid]; fix('dropped corrupt campaign'); return; }
        if (c.id !== cid) { c.id = cid; fix('campaign id repaired'); }
        if (typeof c.name !== 'string' || !c.name) { c.name = 'Campaign'; fix('campaign name defaulted'); }
        if (!c.items || typeof c.items !== 'object') { c.items = {}; fix('items dict created'); }

        Object.keys(c.items).forEach(function(id) {
            var m = c.items[id];
            if (!m || typeof m !== 'object') { delete c.items[id]; fix('dropped corrupt item'); return; }
            if (m.id !== id) { m.id = id; fix('item id repaired'); }
            if (!m.type) { m.type = Array.isArray(m.blocks) ? 'planner' : 'map'; fix('item type inferred'); }
            if (!m.meta || typeof m.meta !== 'object') { m.meta = {}; fix('meta created'); }
            if (typeof m.meta.title !== 'string' || !m.meta.title) { m.meta.title = m.title || m.name || (m.type === 'planner' ? 'Planner' : m.type === 'doc' ? 'Page' : 'Map'); fix('title defaulted'); }
            if ('gridFront' in m.meta) { delete m.meta.gridFront; fix('obsolete gridFront removed'); }
            if (m.type === 'planner') {
                if (!Array.isArray(m.blocks)) { m.blocks = []; fix('planner blocks created'); }
                if (!m.blocks.every(isPlain)) { m.blocks = m.blocks.filter(isPlain); fix('corrupt planner block dropped'); }
                return;
            }
            if (m.type === 'doc') {   // a handbook page: blocks only, never the map arrays (the cleanup classifier tests !m.rooms)
                if (!Array.isArray(m.blocks)) { m.blocks = []; fix('page blocks created'); }
                if (!m.blocks.every(isPlain)) { m.blocks = m.blocks.filter(isPlain); fix('corrupt page block dropped'); }
                m.blocks.forEach(function(b) { if (b && typeof b === 'object' && !b.id) { b.id = 'b_' + Math.random().toString(36).slice(2, 8); fix('block id added'); } });
                return;
            }
            if (!Array.isArray(m.rooms)) { m.rooms = []; fix('rooms created'); }
            if (!Array.isArray(m.links)) { m.links = []; fix('links created'); }
            if (!Array.isArray(m.whiteboard)) { m.whiteboard = []; fix('play map created'); }
            // before anything below (or the picture migration, the owners' stamp, the first draw) reads an entry's fields
            if (!m.rooms.every(isPlain)) { m.rooms = m.rooms.filter(isPlain); fix('corrupt room dropped'); }
            if (!m.links.every(Array.isArray)) { m.links = m.links.filter(Array.isArray); fix('corrupt link dropped'); }   // a link is [roomA, roomB, type?, { label }?]
            if (!m.whiteboard.every(isPlain)) { m.whiteboard = m.whiteboard.filter(isPlain); fix('corrupt play-map item dropped'); }
            // The hex grid went flat-top (1.1.1): cells are 60 wide × 52 tall. Tokens
            // and hex shapes saved at the old pointy-top cell size (52 × 60) are
            // resized and re-seated on the new lattice, once.
            if (m.meta.gridType === 'hex') m.whiteboard.forEach(function(w) {
                if (!w || !(w.isChar || w.type === 'hexagon' || w.shape === 'hexagon')) return;
                if (Math.abs((w.w || 0) - 52) < 0.1 && w.h === 60) {
                    var hc = hexCenterFlat(w.x + w.w / 2, w.y + w.h / 2);
                    w.w = 60; w.h = 52; w.x = hc.x - 30; w.y = hc.y - 26;
                    fix('hex item re-seated on the flat-top lattice');
                }
            });
            if (!m.cats || typeof m.cats !== 'object') { m.cats = JSON.parse(JSON.stringify(CATS)); fix('cats created'); }
            m.rooms.forEach(function(r) {
                if (!r.id) { r.id = 'r' + Math.random().toString(36).slice(2, 8); fix('room id generated'); }
                if (typeof r.x !== 'number') { r.x = 15000; fix('room x defaulted'); }
                if (typeof r.y !== 'number') { r.y = 15000; fix('room y defaulted'); }
                if (r.characters != null && !Array.isArray(r.characters)) { r.characters = []; fix('room characters created'); }
                if (Array.isArray(r.characters) && !r.characters.every(isPlain)) { r.characters = r.characters.filter(isPlain); fix('corrupt room character dropped'); }
            });
            m.whiteboard.forEach(function(w) {
                if (!w.id) { w.id = 'wb' + Math.random().toString(36).slice(2, 10); fix('wb id generated'); }
                if (typeof w.x !== 'number') { w.x = 15000; fix('wb x defaulted'); }
                if (typeof w.y !== 'number') { w.y = 15000; fix('wb y defaulted'); }
                if (typeof w.w !== 'number' || w.w <= 0) { w.w = 100; fix('wb w defaulted'); }
                if (typeof w.h !== 'number' || w.h <= 0) { w.h = 100; fix('wb h defaulted'); }
            });
            if (m.fog !== undefined && window.wpFogCore) { var cleanedFog = window.wpFogCore.cleanFog(m.fog); if (cleanedFog) m.fog = cleanedFog; else delete m.fog; }   // fog of war (1.5.0)
        });

        // parentId hygiene: orphans and cycles would hide items from the tree
        Object.keys(c.items).forEach(function(id) {
            var m = c.items[id];
            if (!m.meta.parentId) return;
            if (!c.items[m.meta.parentId] || c.items[m.meta.parentId].type !== m.type) {
                delete m.meta.parentId; fix('orphaned parentId removed'); return;
            }
            var seen = {}; var cur = id;
            while (cur && c.items[cur] && c.items[cur].meta && c.items[cur].meta.parentId) {
                if (seen[cur]) { delete m.meta.parentId; fix('parentId cycle broken'); break; }
                seen[cur] = true;
                cur = c.items[cur].meta.parentId;
            }
        });

        if (!c.activeItemId || !c.items[c.activeItemId]) {
            c.activeItemId = Object.keys(c.items)[0] || null;
            fix('activeItemId repaired');
        }

        // VTT features (1.4.9): a save from before them gets its per-campaign set once, from the default
        // at this moment (the 1.4.6 keys for an upgrading user). Not a fix(): no "save upgraded" toast,
        // the fill persists with the next ordinary save.
        if (window.wpVtt) window.wpVtt.fill(c);
        if (c.uploads !== undefined && window.wpSystemCore && window.wpSystemCore.cleanUploads) { var cups = window.wpSystemCore.cleanUploads(c.uploads); if (cups.length) c.uploads = cups; else delete c.uploads; }   // Stage 6 U2: players' sheet uploads waiting for the GM (the review reads them the same way)
        if (c.library !== undefined && window.wpLibraryCore && window.wpLibraryCore.cleanManifest) { var lman = window.wpLibraryCore.cleanManifest(c.library); if (lman) c.library = lman; else delete c.library; }   // Stage 6 library L1c: the manifest of the pack files beside the save (librarycore; never dropped for want of the cleaner)
        if (c.system !== undefined && window.wpSystemCore && window.wpFormula) {   // character sheets (1.5.0): a system from a file is cleaned like one off the wire
            var csys = c.system ? window.wpSystemCore.cleanSystem(c.system, { F: window.wpFormula, gmView: true }) : null;
            if (csys) c.system = csys; else delete c.system;
        }
        if (c.chars && typeof c.chars === 'object' && window.wpSystemCore) {   // characters (1.5.0): cleaned against the system, owners stamped on their tokens
            if (!c.system) delete c.chars;
            else {
                var outCh = {}; Object.keys(c.chars).forEach(function(id) { var cc = window.wpSystemCore.cleanChar(c.chars[id], c.system, { state: 'host' }); if (cc && cc.id === id) outCh[id] = cc; }); c.chars = outCh;
                // Onboarding F0: players follow their characters by id — the one in play written down once, tokens they hold bound only by name
                // linked (systemcore migrateBindings) — then ONE chooser (ownedTokenPlan, shared with syncOwners and every arrival path) says which
                // token each player holds: one per character per map, and a kept character's are the GM's. Persists with the next ordinary save.
                var SCm = window.wpSystemCore, sheetsOnM = !window.wpVtt || window.wpVtt.campaignOn('sheets', c) !== false;
                if (SCm.migrateBindings && !c._foreign) { var migB = SCm.migrateBindings(c); if (migB.bound || migB.linked) _bindNotes.push({ camp: c, r: migB }); }   // never a copy the cleanup marked as another GM's
                if (SCm.ownedTokenPlan) SCm.applyOwnerOps(c, SCm.ownedTokenPlan(c, { all: !sheetsOnM }));
            }
        }
        if (c.fog !== undefined && window.wpFogCore) c.fog = window.wpFogCore.cleanCampFog(c.fog);
        if (c.videos !== undefined && window.wpVideoCore) { var vdL = window.wpVideoCore.cleanVideos(c.videos); if (vdL.length) c.videos = vdL; else delete c.videos; }   // item 21 V1: the campaign's video library, cleaned on load (with its cleaner not loaded it stays as it is: never lost; the panel cleans it again as it reads)
        if (c.clock !== undefined) { var ckL = window.wpCalendarCore && window.wpCalendarCore.cleanClock ? window.wpCalendarCore.cleanClock(c.clock) : null; if (ckL) c.clock = ckL; else delete c.clock; }   // item 20 K2: the campaign's clock, cleaned on load (none without the cleaner)   // fog of war (1.5.0): campaign sight-field mapping + default, cleaned on load
    });

    // Picture categories (1.5.0): the app-wide ones move into the campaign that owns or uses most of each
    // category's pictures, once (whiteboard.js wpMigratePictures; the _picsV marker keeps it from running twice)
    if (window.wpMigratePictures && window.wpMigratePictures(data)) fix('picture categories moved into their campaigns');

    if (!data.activeCampaignId || !data.campaigns[data.activeCampaignId]) {
        data.activeCampaignId = Object.keys(data.campaigns)[0] || null;
        if (data.activeCampaignId) fix('activeCampaignId repaired');
    }
    if (data._schema !== CURRENT_SCHEMA) { data._schema = CURRENT_SCHEMA; /* stamp only; not itself a change worth announcing */ }

    return { data: data, changed: changed };
  }

  // What the cleanup (scripts/cleanup.js) may do to the live state after a load: put a campaign back, save, redraw
  var cleanupHooks = {
      toast: function(msg) { toast(msg); },
      save: function() { save(true); },
      getState: function() { return state.appState; },
      refresh: function() { updateCampaignSelect(); updateSidebarNav(); render(); },
      migrate: function(d) { return migrateAppState(d).data; }
  };

  // Onboarding F0: players now follow their characters by id. Once per campaign (the binding is written, so the next load finds nothing): a
  // toast, and in each campaign's Session Log a line for each guess and each player who owns several characters (one in play, the others kept)
  function noteBindings(list) {
      var bound = 0, linked = 0;
      list.forEach(function(n) {
          var c = n.camp, r = n.r, ps = c.players || {}, cs = c.chars || {};
          bound += r.bound; linked += r.linked;
          var nm = function(pid) { return (Object.prototype.hasOwnProperty.call(ps, pid) && ps[pid] && ps[pid].name) || 'A player'; };
          var cn = function(id) { return (Object.prototype.hasOwnProperty.call(cs, id) && cs[id] && cs[id].name) || 'a character'; };
          c.sessionLog = Array.isArray(c.sessionLog) ? c.sessionLog : [];
          r.several.forEach(function(s) { c.sessionLog.push({ at: Date.now(), kind: 'char', text: (nm(s.pid) + ' plays ' + cn(s.id) + (r.guesses.some(function(g) { return g.pid === s.pid; }) ? ' (a guess)' : '') + '; ' + s.kept.map(cn).join(', ') + (s.kept.length === 1 ? ' is' : ' are') + ' kept \u2014 change it in System \u25B8 Characters').slice(0, 400) }); });
          if (c.sessionLog.length > 3000) c.sessionLog.splice(0, c.sessionLog.length - 3000);
      });
      setTimeout(function() { toast('Players now follow their characters by id: ' + bound + ' bound' + (linked ? ', ' + linked + ' token' + (linked === 1 ? '' : 's') + ' linked by name' : '') + '. The Session Log lists anyone with more than one character.'); }, 1200);
  }

  window.wpNoteBindings = noteBindings;   // main.js: an import's bindings get the same notice

  function load() {

    resetHistory();   // before the fetch: a Ctrl+Z while the disk is being read finds nothing to pop

    // Ownership epoch: a snapshot that lands while the disk is being read bumps it past this value, and
    // this load then stands down instead of putting the player's own campaign over a live table.
    if (window.wpNet) window.wpNet.snapshotGen = (window.wpNet.snapshotGen || 0) + 1;
    var _loadGen = window.wpNet ? window.wpNet.snapshotGen : 0;
    var overtaken = function() { var n = window.wpNet; return !!(n && n.active && n.role === 'client' && (n.snapshotGen || 0) > _loadGen); };

    fetch('/api/data')

      .then(res => res.json())

      .then(data => cleanupOnLoad(data, cleanupHooks))   // the save is judged before anything renders; resolves to the same object when clean

      .then(data => {

        if (overtaken()) return;   // a fresh join's snapshot arrived mid-fetch: the table stays, this load is abandoned

        var migrated = { changed: false };
        if(Object.keys(data).length > 0) {
            migrated = migrateAppState(data);
            state.appState = migrated.data;
            Object.keys(state.appState.campaigns || {}).forEach(function(k) { dropWaiting(state.appState.campaigns[k]); });   // Onboarding F1a: a waiting token never outlives its session (a crash left one)
        }
        if (window.wpStream && window.wpNet && window.wpNet.sanitizeAppState) state.appState = window.wpNet.sanitizeAppState(state.appState);   // stream window: players' view only
        if (Object.keys(data).length === 0 && window.wpNet && window.wpNet.foreign && !window.wpStream) state.appState = { activeCampaignId: null, campaigns: {} };   // no save on disk: start fresh, never adopt the GM's table
        if (window.wpNet && !overtaken()) {   // our own campaign again (the stream window never owns one): the ceiling goes with the GM's campaign
            window.wpNet.foreign = !!window.wpStream; window.wpNet.stance = null; window.wpNet.stanceCamps = null; window.wpNet.gmId = '';
            window.wpNet.sounds = null; window.wpNet.soundNow = null;   // the table's sound list is transport memory too
        }
        if (window.wpDocForeign) window.wpDocForeign(!!(window.wpNet && window.wpNet.foreign));   // the handbook reader closes and mermaid goes back to the app's own mode
        if (_bindNotes.length && canPersistLocal()) { noteBindings(_bindNotes); setTimeout(function() { if (canPersistLocal()) save(true); }, 0); }   // Onboarding F0: the one-time notice, only on the GM's own save — and the binding saved now, so it is once
        _bindNotes = [];
        if (window.wpSound) window.wpSound.foreign(!!(window.wpNet && window.wpNet.foreign));
        if (window.wpFx) window.wpFx.foreign(!!(window.wpNet && window.wpNet.foreign));   // a table's loop stops when the player's own campaign comes back; a GM's own reload keeps his
        if (canPersistLocal()) sweepRecents(state.appState);   // recent-map keys for campaigns not in this save go (a joined table's ids never stay)



        if (!state.appState.campaigns || Object.keys(state.appState.campaigns).length === 0) {

           var seedCamp = createNewCampaign('Default Campaign');

           var seedMap = createNewMap('Default Map');

           seedCamp.items[seedMap.id] = seedMap;

           seedCamp.activeItemId = seedMap.id;

           state.appState.campaigns[seedCamp.id] = seedCamp;

           state.appState.activeCampaignId = seedCamp.id;

        }

        

        if(!state.appState.activeCampaignId || !state.appState.campaigns[state.appState.activeCampaignId]) {

          state.appState.activeCampaignId = Object.keys(state.appState.campaigns)[0];

        }

        

        // upgrade logic

        Object.keys(state.appState.campaigns).forEach(cId => {

            var c = state.appState.campaigns[cId];

            if (!c.activeItemId && Object.keys(c.items).length > 0) {

                c.activeItemId = Object.keys(c.items)[0];

            }

            Object.keys(c.items).forEach(k => {

                var m = c.items[k];

                if(!m.type) m.type = 'map';

                if(m.type === 'map') {

                    if(!m.whiteboard) m.whiteboard = [];

                    if(!m.cats) m.cats = JSON.parse(JSON.stringify(CATS));

                }

                

                // Auto-clean maps that are brand new/empty but inherited the 8 legacy CATS

                if (m.type === 'map' && m.rooms.length === 0 && Object.keys(m.cats).length === 8 && m.cats['surface']) {

                    m.cats = { 'default': { label: 'Default Category', color: '#c9c9d4' } };

                }

            });

        });

        

        updateCampaignSelect();
        updateSidebarNav();
        applyRememberedView();   // open the last map in the view it was left in
        render();
        if (window.wpNet && window.wpNet.refreshUi) window.wpNet.refreshUi();   // own campaign is back: spectator chrome off, party strip re-evaluated
        // Restore the camera once layout has real dimensions (retries cover slow first paint)
        var _restoreTries = 0;
        (function tryRestore() {
            var wrapEl = state.viewMode === 'visual' ? document.getElementById('whiteboardWrap') : document.getElementById('canvasWrap');
            if ((!wrapEl || wrapEl.clientWidth === 0) && _restoreTries++ < 40) return setTimeout(tryRestore, 100);
            restoreCameraPosition();
        })();

        pushHistory();   // seeds every item's baseline from the migrated, cleaned state; nothing is a step until something changes

        updateUndoBtn();

        if (migrated.changed) {

            // Persist the upgraded shape once; the launch backup holds the original. The baselines were
            // just taken from the upgraded shape, so this save records no step.
            save(true);

            toast('Save upgraded from an older Waypoint version ✓ (original kept in saves/backups)');

        }

      })

      .catch(err => {

        console.error(err);

        saveNote.innerHTML = 'Error loading data.';

      });

  }



  /* ---------- undo / redo: one history per map and per planner ----------
     Keyed campId + '/' + itemId, module-private, never on the item and never on the wire. An entry
     is the JSON of one item's CONTENT — rooms, links, whiteboard, cats, blocks and the content-ish
     meta keys; structure, view memory, governance and identity (META_LIVE) always come from the
     live item, and nothing campaign-level (players, handouts, session log, settings) is ever in it.
     pushHistory() diffs every item of the active campaign against its own baseline (h.last) and
     puts a step on the one that changed, so a pan, a click, a map switch or a save of the session
     log records nothing. A restore is applied in place on the same objects and persists through the
     normal save(). Nothing is recorded or restored while this window holds someone else's campaign. */

  var histories = {};   // key -> { campId, itemId, undo:[], redo:[], last:string, bytes:number, lru:number }

  var isUndoing = false;

  var savePending = false;   // a debounced save() is waiting: set in save(), cleared in doSave after pushHistory read it

  var typeSlot = { el: null, key: null, lastT: 0, chunkStart: 0 };   // the one text field whose keystrokes fold into a step

  var nativeProbe = null;    // the planner field whose Ctrl+Z / Ctrl+Y was handed to the browser first (one per document, like its undo stack)

  var nativeEdit = false;    // the browser's own text undo / redo changed a field: the next pass moves the baseline, never records a step

  var HIST_BUDGET_BYTES = 64 * 1024 * 1024;
    // Undo/redo depth per map & per planner: user-configurable via wp_undoDepth (Settings), default 100 (doubled from the old 50), clamped 10..500. The 64 MB byte budget above still caps total memory.
    function histDepth() { var v = 0; try { v = parseInt(localStorage.getItem('wp_undoDepth'), 10); } catch (e) {} return (v >= 10 && v <= 500) ? v : 100; }

  // Meta keys that are never in a snapshot — always taken from the live item. A new content key is
  // undoable by default; a new view, structure or governance key (a per-map table toggle, say) goes HERE.
  var META_LIVE = { title: 1, updated: 1, parentId: 1, sortIndex: 1, collapsed: 1, playerLock: 1, status: 1, players: 1,
                    lastX: 1, lastY: 1, lastZoom: 1, lastWbX: 1, lastWbY: 1, lastWbZoom: 1, lastView: 1, readerView: 1 };

  var HIST_BTN_IDS = { dataUndoBtn: 1, dataRedoBtn: 1, wbUndoBtn: 1, wbRedoBtn: 1, plannerUndoBtn: 1, plannerRedoBtn: 1 };

  // "May this window write to this disk right now?" One answer for every write to disk.
  function canPersistLocal() {
      var n = window.wpNet;
      if (window.__wpNoSave) return false;                              // a restore is deciding
      if (window.wpStream || window.wpPopout) return false;             // the stream / pop-out windows never own a save
      if (n && (n.foreign || (n.active && n.role === 'client'))) return false;
      if (state.appState && state.appState._foreign) return false;      // origin marker: this state came from someone else's table
      return true;
  }

  function itemKey(camp, id) { return camp.id + '/' + id; }

  // The content of one item as a string: every own key but id / type / meta, plus the meta keys not in META_LIVE
  function project(item) {

      var c = {}, m = {};

      Object.keys(item).forEach(function(k) { if (k !== 'id' && k !== 'type' && k !== 'meta') c[k] = item[k]; });

      Object.keys(item.meta || {}).forEach(function(k) { if (!META_LIVE[k]) m[k] = item.meta[k]; });

      return JSON.stringify({ c: c, m: m });

  }

  // Put a projection back on the SAME item and meta objects (planner handlers close over them)
  function applyContent(item, parsed) {

      Object.keys(item).forEach(function(k) { if (k !== 'id' && k !== 'type' && k !== 'meta' && !(k in parsed.c)) delete item[k]; });

      Object.keys(parsed.c).forEach(function(k) { item[k] = parsed.c[k]; });

      item.meta = item.meta || {};

      Object.keys(item.meta).forEach(function(k) { if (!META_LIVE[k] && !(k in parsed.m)) delete item.meta[k]; });

      Object.keys(parsed.m).forEach(function(k) { item.meta[k] = parsed.m[k]; });

  }

  function seed(cur, campId, itemId) { return { campId: campId, itemId: itemId, undo: [], redo: [], last: cur, bytes: 0, lru: 0 }; }

  // V8 keeps a string with any non-Latin-1 character at two bytes a character, and the save has plenty
  function histBytes(h) {

      var n = 0;

      h.undo.forEach(function(s) { n += s.length * 2; });

      h.redo.forEach(function(s) { n += s.length * 2; });

      h.bytes = n;

      return n;

  }

  function pushStep(h, snap) {

      h.undo.push(snap);

      while (h.undo.length > histDepth()) h.undo.shift();

      histBytes(h);

      h.lru = Date.now();

  }

  // The campaign an item belongs to — the active one nearly always
  function campOf(item) {

      var a = getActiveCampaign();

      if (a && a.items && a.items[item.id] === item) return a;

      var camps = (state.appState && state.appState.campaigns) || {}, found = null;

      Object.keys(camps).some(function(cid) { var c = camps[cid]; if (c && c.items && c.items[item.id] === item) { found = c; return true; } return false; });

      return found;

  }

  function activeHistory() {

      var camp = getActiveCampaign(), item = getActiveMap();

      return (camp && item) ? histories[itemKey(camp, item.id)] || null : null;

  }

  // Drop the histories of items and campaigns that no longer exist, so a discarded Tutorial's stacks can
  // never attach to a rebuilt one (its ids are fixed) and a deleted campaign leaves nothing behind
  function pruneDeadKeys() {

      var camps = (state.appState && state.appState.campaigns) || {};

      Object.keys(histories).forEach(function(key) {

          var h = histories[key], camp = camps[h.campId];

          if (!camp || !camp.items || !camp.items[h.itemId]) delete histories[key];

      });

  }

  // Over budget: evict the oldest entry (undo first, then redo) of the least recently pushed item that
  // is not the active one, falling back to the active one only when nothing else holds entries
  function enforceBudget() {

      var keys = Object.keys(histories), total = 0;

      keys.forEach(function(k) { total += histories[k].bytes; });

      if (total <= HIST_BUDGET_BYTES) return;

      var camp = getActiveCampaign(), activeKey = (camp && camp.activeItemId) ? itemKey(camp, camp.activeItemId) : null;

      while (total > HIST_BUDGET_BYTES) {

          var pick = null;

          keys.forEach(function(k) { var h = histories[k]; if (k === activeKey || !(h.undo.length || h.redo.length)) return; if (!pick || h.lru < pick.lru) pick = h; });

          if (!pick && activeKey && histories[activeKey] && (histories[activeKey].undo.length || histories[activeKey].redo.length)) pick = histories[activeKey];

          if (!pick) return;

          var gone = pick.undo.length ? pick.undo.shift() : pick.redo.shift();

          total -= gone.length * 2; pick.bytes -= gone.length * 2;

      }

  }

  // Keystrokes in one field fold into the same step for up to 2 s between them and 10 s in all
  function canCoalesce(key, now) {

      if (typeSlot.el && !typeSlot.el.isConnected) closeChunk();   // the editor was rebuilt: never pin a detached field

      return !!(typeSlot.el && typeSlot.key === key && now - typeSlot.lastT < 2000 && now - typeSlot.chunkStart < 10000);

  }

  function closeChunk() { typeSlot.el = null; typeSlot.key = null; }

  // Wipe every history (no argument) or one campaign's; nothing can be popped until the next pass seeds again
  function resetHistory(campId) {

      if (campId) Object.keys(histories).forEach(function(k) { if (histories[k].campId === campId) delete histories[k]; });

      else histories = {};

      savePending = false;

      nativeEdit = false;

      closeChunk();

      updateUndoBtn();

  }

  function historyDepth() { var h = activeHistory(); return { undo: h ? h.undo.length : 0, redo: h ? h.redo.length : 0 }; }

  function setHistoryBtn(id, enabled) {

      var btn = document.getElementById(id);

      if(!btn) return;

      btn.style.opacity = enabled ? '1' : '0.5';

      btn.style.pointerEvents = enabled ? 'auto' : 'none';

  }

  // The six buttons show the ACTIVE item's stacks
  function updateUndoBtn() {

      var h = activeHistory(), canUndo = !!(h && h.undo.length), canRedo = !!(h && h.redo.length);

      ['dataUndoBtn', 'wbUndoBtn', 'plannerUndoBtn'].forEach(function(id) { setHistoryBtn(id, canUndo); });

      ['dataRedoBtn', 'wbRedoBtn', 'plannerRedoBtn'].forEach(function(id) { setHistoryBtn(id, canRedo); });

  }



  // The diff pass, run by every save: whichever item's content moved since its baseline gets the step.
  // Every item of the campaign is looked at, not just the active one — the debounced save can fire
  // after a map switch, and a few sites (travel, spawn, handout sweeps) write into maps that are not open.
  function pushHistory() {

      if (isUndoing) return;

      var native = nativeEdit;   // read once per pass, whatever the pass decides

      nativeEdit = false;

      if (!canPersistLocal()) return;   // someone else's campaign is never recorded

      var camp = getActiveCampaign();

      if (!camp || !camp.items) return;

      var remote = !!(window.wpNet && window.wpNet.applyingRemote), now = Date.now();

      pruneDeadKeys();

      Object.keys(camp.items).forEach(function(id) {

          var item = camp.items[id];

          if (!item) return;

          var key = itemKey(camp, id), cur = project(item), h = histories[key];

          if (!h) { histories[key] = seed(cur, camp.id, id); return; }   // lazy seed: new, imported, first seen

          if (cur === h.last) return;

          // A player's change is never a GM step: move the baseline, keep redo. The one exception is the
          // GM's own debounced edit on the open item that a remote save is flushing (savePending still set).
          if (remote && !(savePending && id === camp.activeItemId)) { h.last = cur; return; }

          // The browser took back (or re-did) typing in the open planner's field: that is the user's undo,
          // not new work — the baseline moves, redo is kept, and the field's chunk stays open for what follows
          if (native && id === camp.activeItemId) { h.last = cur; if (typeSlot.el) { typeSlot.key = key; typeSlot.lastT = now; typeSlot.chunkStart = now; } return; }

          if (canCoalesce(key, now)) { h.last = cur; typeSlot.lastT = now; return; }

          h.redo = [];

          pushStep(h, h.last);

          h.last = cur;

          if (typeSlot.el) { typeSlot.key = key; typeSlot.lastT = now; typeSlot.chunkStart = now; }   // a typing step opens a chunk; a drag or a click does not

          else typeSlot.key = null;

      });

      enforceBudget();

      updateUndoBtn();

  }



  // Move an item's baseline to its current content without a step — for render-time clean-ups (legacy
  // planner upgrades, block defaults, flowchart layout resets). Pending typing is recorded first so it
  // is never folded into the clean-up.
  function setBaseline(item) {

      var camp = item ? campOf(item) : null;

      if (!camp) return;

      var key = itemKey(camp, item.id), cur = project(item);

      if (histories[key]) histories[key].last = cur; else histories[key] = seed(cur, camp.id, item.id);

  }

  function rebaseHistory(item) {

      if (!item) return;

      if (savePending) pushHistory();

      setBaseline(item);

  }

  // The pass before fn() records any pending typing; after fn() only the baseline moves — a second pass
  // here would see the clean-up itself as a diff while that save is still pending
  function withoutHistory(item, fn) { pushHistory(); fn(); setBaseline(item); }

  // A point you cannot undo past on those items: their stacks are wiped and their baselines taken now.
  // Called by the code that writes two maps at once (bring-over, portal travel, a handout sweep), after
  // the mutation and before its save.
  function historyBarrier(ids) {

      var camp = getActiveCampaign();

      if (!camp || !camp.items) return;

      closeChunk();   // typing that continues after the barrier is a fresh step, never folded into one that was wiped

      (ids || []).forEach(function(id) {

          var item = camp.items[id];

          if (item) histories[itemKey(camp, id)] = seed(project(item), camp.id, id);

      });

      updateUndoBtn();

  }

  // A debounced local save is waiting: record it as its own step and write it now. Called by net.js
  // before a player's change lands in a map, so no step ever holds a player's move.
  function flushHistory() {

      if (!savePending) return;

      clearTimeout(saveTimeout); savePending = false;

      pushHistory();

      save(true);   // the edit came off the debounce timer; nothing else guarantees it reaches disk

  }



  /* Host in session: a restore never moves a player's own token, never erases a drawing they made and
     never revives one they erased. Mirrors the client write whitelist in net.js applyClientItemFiltered.
     ownerId is the host's word, including its absence (ensurePlayerToken demotes duplicates by deleting
     it); hidden stays from the snapshot (a GM hide / unhide is undoable; players cannot write it). */
  function mergeLivePlayerState(snapC, live) {

      var liveList = live.whiteboard || [];

      var snapList = Array.isArray(snapC.whiteboard) ? snapC.whiteboard : [];

      var liveById = {}, snapById = {}, liveOwned = {}, out = [];

      var grp = function(w) { return w.charId ? 'c:' + w.charId : 'n:' + w.ownerId + '|' + String(w.charName || ''); };   // Onboarding F0: the chooser's groups (a character, or a pet by name)
      liveList.forEach(function(w) { if (w && w.id) { liveById[w.id] = w; if (w.isChar && w.ownerId) liveOwned[grp(w)] = 1; } });

      snapList.forEach(function(w) { if (w && w.id) snapById[w.id] = w; });

      snapList.forEach(function(s) {

          var l = s && s.id ? liveById[s.id] : null;

          if (!l) {

              if (s && s.type === 'path' && s.byPlayer) return;   // the player erased it: stays erased

              // A GM-deleted token whose player has since been given another one on this map comes back
              // under GM control (sheet intact): a player never ends up with two tokens they both own
              if (s && s.isChar && s.ownerId && liveOwned[grp(s)]) delete s.ownerId;

              out.push(s);   // anything else absent live was a GM delete: it comes back (a token with its sheet)

              return;

          }

          if (l.ownerId) s.ownerId = l.ownerId; else delete s.ownerId;

          if (l.ownerId) {

              if (l.type === 'path' && l.byPlayer) { out.push(JSON.parse(JSON.stringify(l))); return; }   // their stroke as they have it now

              ['x', 'y', 'rot', 'front', 'elevation', 'posture'].forEach(function(k) { if (l[k] !== undefined) s[k] = l[k]; else delete s[k]; });

              if (l.light !== undefined) s.light = JSON.parse(JSON.stringify(l.light)); else delete s.light;   // lighting L5 (owner answer 9): a player's own light stays as it is now (theirs to switch: net.js tok-light); the lock on it (lightLock) is the GM's and follows the snapshot

          }

          out.push(s);

      });

      // Owned elements that arrived since the snapshot (spawned, drawn) stay, at their live index
      liveList.forEach(function(l, i) {

          if (!l || !l.id || snapById[l.id] || !l.ownerId) return;

          out.splice(Math.min(i, out.length), 0, JSON.parse(JSON.stringify(l)));

      });

      snapC.whiteboard = out;

  }

  // Where the planner was being looked at, so a restore lands the eye and the caret back where they were
  function rememberPlannerSpot() {

      var ed = document.getElementById('plannerEditorWrap'), pw = document.getElementById('plannerPreviewWrap');

      var a = document.activeElement, spot = { ed: ed ? ed.scrollTop : 0, pw: pw ? pw.scrollTop : 0, field: null };

      if (a && a.dataset && a.dataset.idx !== undefined && a.closest && a.closest('#plannerBlocks')) {

          spot.field = { idx: a.dataset.idx, cls: a.className, ri: a.dataset.ri, ci: a.dataset.ci, ni: a.dataset.ni, sel: (typeof a.selectionStart === 'number') ? a.selectionStart : null };

      }

      return spot;

  }

  function restorePlannerSpot(spot) {

      var ed = document.getElementById('plannerEditorWrap'), pw = document.getElementById('plannerPreviewWrap');

      var pwTop = function() { if (pw) pw.scrollTop = spot.pw; };

      pwTop(); setTimeout(pwTop, 300);   // again once mermaid has re-laid out the preview

      if (ed) ed.scrollTop = spot.ed;

      var f = spot.field;

      if (!f) return;

      var el = Array.prototype.find.call(document.querySelectorAll('#plannerBlocks [data-idx="' + f.idx + '"]'), function(x) {

          return x.className === f.cls && x.dataset.ri === f.ri && x.dataset.ci === f.ci && x.dataset.ni === f.ni;

      });

      if (!el) return;

      try {

          el.focus({ preventScroll: true });

          if (f.sel !== null && typeof el.setSelectionRange === 'function') { var p = Math.min(f.sel, (el.value || '').length); el.setSelectionRange(p, p); }

          else if (el.isContentEditable) { var r = document.createRange(); r.selectNodeContents(el); r.collapse(false); var s = window.getSelection(); s.removeAllRanges(); s.addRange(r); }

      } catch (e) {}

      if (ed) ed.scrollTop = spot.ed;

  }



  // Undo or redo one step on the ACTIVE item. The restore goes through save(), so disk and (while
  // hosting) the table both get it; a hosting save is wrapped in applyingRemote so onLocalSave's
  // room-handout check cannot reveal a handout the restore re-attached, and the item is sent directly.
  function stepHistory(dir) {

      if (!canPersistLocal()) return;   // not while another table's campaign is on screen (the buttons come here too)

      var flushed = false;

      if (savePending) { clearTimeout(saveTimeout); savePending = false; pushHistory(); flushed = true; }   // real pending typing becomes its step; never a forced one

      var camp = getActiveCampaign(), item = getActiveMap();

      var h = (camp && item) ? histories[itemKey(camp, item.id)] : null;

      var from = h && h[dir];

      if (!from || !from.length) { if (flushed) save(true); return; }   // the flushed edit still has to reach disk (Ctrl+Y right after typing)

      var snap = from.pop();

      if (dir === 'undo') h.redo.push(h.last); else pushStep(h, h.last);

      var parsed = JSON.parse(snap);

      if (item.type === 'map' && parsed && parsed.c && Array.isArray(parsed.c.whiteboard)) parsed.c.whiteboard = parsed.c.whiteboard.filter(function(w) { return !(w && w.waiting); });   // Onboarding F1a: an undo never brings a waiting token back (while hosting, the merge keeps the live one)

      var hosting = !!(window.wpNet && window.wpNet.active && window.wpNet.role === 'host');

      if (hosting && item.type === 'map') mergeLivePlayerState(parsed.c, item);

      var spot = (item.type === 'planner' || item.type === 'doc') ? rememberPlannerSpot() : null;

      applyContent(item, parsed);

      if (item.type === 'map' && window.wpSheets && window.wpSheets.syncOwners) window.wpSheets.syncOwners(camp);   // Onboarding F0 'tidy': one owned token per character, never an adopt, copy or spawn

      var wUndo = hosting && item.type === 'map' && window.wpNet && window.wpNet.tidyWaiting ? window.wpNet.tidyWaiting({ quiet: true, mapId: item.id }) : [];   // Onboarding F1a: a token the undo gave back takes the place of a waiting one
      if (hosting && item.type === 'map' && window.wpAutoRoom) (item.whiteboard || []).forEach(function(w) { if (w.isChar && w.ownerId) window.wpAutoRoom(w, item); });   // room membership follows the token

      closeChunk();

      state.selId = null; state.selWbId = null; state.selWbIds = []; state.linkStart = null;

      render();

      isUndoing = true;

      try {

          if (hosting) { window.wpNet.applyingRemote = true; save(true); window.wpNet.applyingRemote = false; if (window.wpFog) window.wpFog.invalidateVision(); if (window.wpNet.sendItem) window.wpNet.sendItem(camp.id, item.id); wUndo.forEach(function(id) { if (id !== item.id && window.wpNet.broadcastItemFiltered) window.wpNet.broadcastItemFiltered(camp.id, id); }); if (window.wpNet.syncCombatHidden) window.wpNet.syncCombatHidden(); }

          else save(true);

      } finally { isUndoing = false; }

      h.last = project(item);   // taken AFTER render + save, so a render-time clean-up can never differ from the baseline

      histBytes(h);

      if (spot) restorePlannerSpot(spot);

      updateUndoBtn();

      toast(dir === 'undo' ? 'Undo' : 'Redo');

  }

  function undo() { stepHistory('undo'); }

  function redo() { stepHistory('redo'); }

  // Ctrl+Z / Ctrl+Y with a planner field focused. The browser's own text undo runs while the field has
  // typing to take back; when it has none — nothing typed since the editor was last rebuilt, or the
  // native stack just ran dry — the chord reaches the planner's history instead. Returns true when the
  // chord was taken over (callers that stop propagation check it first).
  function fieldUndoChord(e) {

      if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;

      var k = String(e.key || '').toLowerCase();

      var dir = (k === 'z' && !e.shiftKey) ? 'undo' : (k === 'y' || (k === 'z' && e.shiftKey)) ? 'redo' : null;

      if (!dir) return false;

      var t = e.target;

      if (!t || !t.closest || !t.closest('#plannerBlocks')) return false;

      if (!canPersistLocal()) return false;

      if (t._wpNativeDirty) {

          // let the browser try; if no text moved anywhere (its undo stack is one per document, so the
          // 'input' may land on another field) this field is spent and the press falls through. A dry
          // redo leaves the flag: the field's own undo is still there to take.
          nativeProbe = t;

          setTimeout(function() { if (nativeProbe !== t) return; nativeProbe = null; if (dir === 'undo') t._wpNativeDirty = false; stepHistory(dir); }, 0);

          return false;

      }

      e.preventDefault(); e.stopPropagation();

      stepHistory(dir);

      return true;

  }

  /* Text coalescing, seen in the capture phase so fields that stop propagation (rich text boxes, flowchart
     labels) count too: an 'input' on a text field makes it the typing slot; a pointer down elsewhere, the
     field losing focus, a change / cut / paste from another field or a drop anywhere closes the chunk, so
     the next edit is its own step. The history buttons are not edits and leave the chunk alone. */
  function isTextField(t) {

      if (!t || !t.tagName) return false;

      if (t.tagName === 'TEXTAREA' || t.isContentEditable) return true;

      return t.tagName === 'INPUT' && !/^(checkbox|radio|file|button|submit)$/i.test(t.type || 'text');

  }

  document.addEventListener('input', function(e) {

      var t = e.target;

      if (!t) return;

      if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') { nativeProbe = null; nativeEdit = true; }   // the browser answered the chord, whichever field it landed on

      if (!isTextField(t)) { closeChunk(); return; }

      if (e.inputType !== 'historyUndo' && e.inputType !== 'historyRedo') t._wpNativeDirty = true;

      if (typeSlot.el !== t) { typeSlot.el = t; typeSlot.key = null; }

  }, true);

  document.addEventListener('pointerdown', function(e) {

      var t = e.target, b = t && t.closest ? t.closest('button') : null;

      if (b && HIST_BTN_IDS[b.id]) return;

      if (typeSlot.el && t !== typeSlot.el && !(typeSlot.el.contains && typeSlot.el.contains(t))) {

          if (savePending) pushHistory();   // typing still on the debounce timer is its own step before whatever this click does (a block delete, say)

          closeChunk();

      }

  }, true);

  document.addEventListener('focusout', function(e) { if (typeSlot.el && e.target === typeSlot.el) closeChunk(); }, true);

  document.addEventListener('change', function(e) { if (e.target !== typeSlot.el) closeChunk(); }, true);

  ['cut', 'paste', 'drop'].forEach(function(ev) { document.addEventListener(ev, function() { closeChunk(); }, true); });

  // A safety copy before something that cannot be undone (an item or campaign delete); Settings ▸ Advanced ▸
  // Snapshots lists it. Resolves either way — a core older than 1.3.6 has no such route and answers 404,
  // which is fine — and within 3 s regardless, so a core that never answers cannot hold the delete up.
  function takeSafetyCopy() {

      if (!canPersistLocal()) return Promise.resolve();

      var timer = new Promise(function(done) { setTimeout(done, 3000); });

      try { return Promise.race([fetch('/api/backup-now', { method: 'POST' }).then(function() {}, function() {}), timer]); } catch (e) { return Promise.resolve(); }

  }



  var saveTimeout;

  function save(immediate) {
    if (window.__wpNoSave) return;   // a snapshot is being restored: the in-memory copy must not win

    var activeMap = getActiveMap();

    if(activeMap && activeMap.meta && typeof activeMap.meta === 'object') { activeMap.meta.updated = Date.now(); }   // an item from a file may have no meta

    saveNote.innerHTML = 'Saving...';

    

    var doSave = function() {

        // Multiplayer: clients don't touch their own disk — edits go to the host. And a campaign
        // that came from a host (wpNet.foreign) never reaches this disk even after the link drops:
        // between reconnect attempts the client is briefly "inactive" but still holds the GM's table.
        if (!canPersistLocal()) {
            if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') {
                window.wpNet.onLocalSave();
                saveNote.innerHTML = 'Synced to host <b>&#10003;</b>';
            } else {
                saveNote.innerHTML = 'GM\'s campaign &mdash; not saved here';
            }
            savePending = false;
            return;
        }

        pushHistory();   // below the return: a GM's table is never recorded

        savePending = false;   // cleared AFTER the pass: pushHistory reads it (a remote save flushing the GM's own pending edit)

        if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host') {

            window.wpNet.onLocalSave();

        }

        fetch('/api/data', {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: JSON.stringify(state.appState)

        })

        .then(res => {

            if(res.ok) saveNote.innerHTML = 'Saved to disk <b>&#10003;</b>';

            else saveNote.innerHTML = 'Error saving.';

        })

        .catch(err => saveNote.innerHTML = 'Network error saving.');

    };

    

    if(immediate) {

        clearTimeout(saveTimeout);

        doSave();

    } else {

        clearTimeout(saveTimeout);

        saveTimeout = setTimeout(doSave, 500);

        savePending = true;

    }

  }



  /* ---------- mode toggling ---------- */

  var _segBtns = modeSelect ? Array.prototype.slice.call(modeSelect.querySelectorAll('.seg-btn')) : [];

  // A map remembers which view it was last shown in; applied whenever that map becomes active
  function applyRememberedView() {
      var am = getActiveMap();
      if (!am || am.type !== 'map' || !am.meta) return;
      var v = am.meta.lastView;
      if ((v === 'data' || v === 'visual') && state.viewMode !== v) {
          state.viewMode = v;
          _segBtns.forEach(function(b){ b.classList.toggle('active', b.dataset.mode === v); });
      }
  }
  window.wpApplyRememberedView = applyRememberedView;
  function setViewMode(mode) {
      if (state.viewMode === mode) return;
      state.viewMode = mode;
      var amV = getActiveMap();
      if (amV && amV.type === 'map' && (mode === 'data' || mode === 'visual')) { amV.meta = amV.meta || {}; amV.meta.lastView = mode; save(); }   // remembered per map

      _segBtns.forEach(function(b){ b.classList.toggle('active', b.dataset.mode === mode); });

      state.selId = null; state.selWbId = null; state.linkStart = null;

      render();
      restoreCameraPosition();

  }

  _segBtns.forEach(function(b){ b.addEventListener('click', function(){ setViewMode(this.dataset.mode); }); });



  /* ---------- keyboard shortcuts ---------- */

  // Internal whiteboard clipboard (Ctrl+C/X/V). Pastes make fresh ids and
  // never inherit ownerId, so a copied player token can't be remote-controlled.
  var wbClipboard = null;

  var wbPasteCount = 0;

  function selectedWbIds() {
      return (state.selWbIds && state.selWbIds.length) ? state.selWbIds : (state.selWbId ? [state.selWbId] : []);
  }

  function copySelectedWb(cut) {
      if (state.viewMode !== 'visual') return false;
      var sel = window.getSelection();
      if (sel && String(sel).length) return false; // let normal text copy happen
      var m = getActiveMap();
      if (!m || m.type !== 'map') return false;
      var ids = selectedWbIds();
      if (!ids.length) return false;
      wbClipboard = ids.map(function(id) { return m.whiteboard.find(function(x) { return x.id === id; }); }).filter(function(x) { return x && !x.waiting; }).map(clone);   // Onboarding F1a: a waiting token is never copied
      wbPasteCount = 0;
      if (cut) {
          m.whiteboard.forEach(function(x) { if (ids.includes(x.id) && x.waiting && window.wpNet && window.wpNet.noWaiting) window.wpNet.noWaiting(x.ownerId); });   // Onboarding F1a: cut away, it stays away this session
          m.whiteboard = m.whiteboard.filter(function(x) { return !ids.includes(x.id); });
          state.selWbIds = []; state.selWbId = null;
          save(); render();
      }
      toast((cut ? 'Cut ' : 'Copied ') + wbClipboard.length + ' item(s).');
      return true;
  }

  function pasteWbClipboard() {
      var m = getActiveMap();
      if (!m || m.type !== 'map' || !wbClipboard || !wbClipboard.length) return false;
      wbPasteCount++;
      var off = 25 * wbPasteCount;
      var gidMap = {}, newIds = [];
      wbClipboard.forEach(function(src) {
          var it = clone(src);
          it.id = 'wb' + uid() + Math.random().toString(36).slice(2, 5);
          delete it.ownerId; delete it.charId;   // pasted tokens are new creatures
          if (it.groupId) {
              if (!gidMap[it.groupId]) gidMap[it.groupId] = 'group_' + Date.now() + Math.random().toString(36).slice(2, 6);
              it.groupId = gidMap[it.groupId];
          }
          it.x += off; it.y += off;
          if (window.wpSeatHex) window.wpSeatHex(it, m);   // pasted tokens land in a cell, not beside one
          m.whiteboard.push(it);
          newIds.push(it.id);
      });
      state.selWbIds = newIds; state.selWbId = newIds[0] || null;
      save(); render();
      toast('Pasted ' + newIds.length + ' item(s).');
      return true;
  }

  document.addEventListener('keydown', function(e) {

      var t = e.target;

      var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

      if (typing) { fieldUndoChord(e); return; }   // a planner field with nothing of its own to undo hands the chord to the planner's history

      // Shift+1 frames the content — the selection if there is one, else the whole map. This is
      // navigation, not an edit, so it sits ABOVE the spectator guard (players can frame too). With
      // Shift held e.key is the shifted glyph ('!'), so match the physical key via e.code.
      if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey && e.code === 'Digit1') {
          var anySelF = state.viewMode === 'data' ? !!state.selId : !!((state.selWbIds && state.selWbIds.length) || state.selWbId);
          if (window.wpFitView) { e.preventDefault(); window.wpFitView(anySelF); }
          return;
      }

      if (!canPersistLocal()) return; // no edit shortcuts unless this window may write

      if (e.ctrlKey || e.metaKey) {

          var k = e.key.toLowerCase();

          if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }

          if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); return; }

          if (k === 'd') {
              // Ctrl+D duplicates the whiteboard selection (and never bookmarks the page)
              if (state.viewMode === 'visual' && window.wpDuplicateWb) {
                  var mD = getActiveMap();
                  var itsD = mD && mD.type === 'map' ? selectedWbIds().map(function(id) { return mD.whiteboard.find(function(x) { return x.id === id; }); }).filter(Boolean) : [];
                  if (itsD.length) { e.preventDefault(); window.wpDuplicateWb(itsD); }
              }
              return;
          }
          if (k === 'c') { if (copySelectedWb(false)) e.preventDefault(); return; }

          if (k === 'x') { if (copySelectedWb(true)) e.preventDefault(); return; }

          // Ctrl+V is handled by the 'paste' event so system images win over the internal clipboard

          return;

      }

      // Arrow keys nudge the selection (Shift = 10px steps)
      var ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

      if (ARROWS[e.key]) {

          var m2 = getActiveMap();

          if (!m2 || m2.type !== 'map') return;

          var step = e.shiftKey ? 10 : 1;

          var dx = ARROWS[e.key][0] * step, dy = ARROWS[e.key][1] * step;

          if (state.viewMode === 'visual') {

              var ids2 = selectedWbIds();

              if (!ids2.length) return;

              ids2.forEach(function(id) {
                  var it = m2.whiteboard.find(function(x) { return x.id === id; });
                  if (!it || it.locked) return;
                  var snapN = window.wpSnapOn ? window.wpSnapOn() : !!state.snap;   // the snap rule: with Snap on a token hops cell to cell, off it moves by pixels like anything else
                  var hexToken = snapN && state.gridType === 'hex' && (it.isChar || it.type === 'hexagon' || it.shape === 'hexagon');
                  if (hexToken) {
                      // On a hex grid a token hops cell to cell: ↑/↓ one row, ←/→ one
                      // column along the diagonal (Shift takes the other diagonal)
                      if (dy) { it.y += Math.sign(dy) * 52; }
                      else { it.x += Math.sign(dx) * 45; it.y += (e.shiftKey ? -1 : 1) * Math.sign(dx) * -26; }
                      if (window.wpSeatHex) window.wpSeatHex(it, m2);
                  } else if (snapN && (it.isChar || it.waiting) && window.wpSeatDrop) {   // a square grid or a map with no grid: one cell (one dot) at a time
                      it.x += Math.sign(dx) * 50; it.y += Math.sign(dy) * 50;
                      window.wpSeatDrop(it, m2);
                  } else { it.x += dx; it.y += dy; }
                  if (window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(it, true);
              });

              save(); render(); e.preventDefault();

          } else if (state.viewMode === 'data' && state.selId) {

              var room = m2.rooms.find(function(r) { return r.id === state.selId; });

              if (room) { room.x += dx; room.y += dy; save(); render(); e.preventDefault(); }

          }

          return;

      }

      if (e.key === 'Delete' || e.key === 'Backspace') {

          var m = getActiveMap();

          if (!m || m.type === 'planner') return;

          if (state.viewMode === 'visual') {

              var ids = (state.selWbIds && state.selWbIds.length) ? state.selWbIds : (state.selWbId ? [state.selWbId] : []);

              if (!ids.length) return;

              m.whiteboard.forEach(x => { if (ids.includes(x.id) && x.waiting && window.wpNet && window.wpNet.noWaiting) window.wpNet.noWaiting(x.ownerId); });   // Onboarding F1a: a deleted waiting token stays away this session
              m.whiteboard = m.whiteboard.filter(x => !ids.includes(x.id));

              state.selWbIds = []; state.selWbId = null;

              save(); render(); toast('Deleted.');

              e.preventDefault();

          } else if (state.viewMode === 'data' && state.selLink != null && m.links && m.links[state.selLink]) {
              m.links.splice(state.selLink, 1); state.selLink = null;
              save(); render(); toast('Link removed.');
              e.preventDefault();
          } else if (state.viewMode === 'data' && state.selId) {

              m.rooms = m.rooms.filter(x => x.id !== state.selId);

              m.links = m.links.filter(l => l[0] !== state.selId && l[1] !== state.selId);

              state.selId = null;

              save(); render(); toast('Node deleted.');

              e.preventDefault();

          }

      }

  });



  // Track the cursor in whiteboard world coordinates so pasted images land
  // where the mouse is (falls back to the viewport center).
  var wbMouse = null;

  if (wbWrap) wbWrap.addEventListener('pointermove', function(e) {
      var r = wbWrap.getBoundingClientRect();
      var z = state.zoomLevel || 1;
      wbMouse = { x: (wbWrap.scrollLeft + e.clientX - r.left) / z, y: (wbWrap.scrollTop + e.clientY - r.top) / z };
  });

  document.addEventListener('paste', function(e) {

      var t = e.target;

      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      if (!canPersistLocal()) return;

      if (state.viewMode !== 'visual') return;

      var m = getActiveMap();

      if (!m || m.type !== 'map') return;

      var items = (e.clipboardData && e.clipboardData.items) ? Array.prototype.slice.call(e.clipboardData.items) : [];

      var imgItem = items.find(function(i) { return i.type && i.type.indexOf('image/') === 0; });

      if (imgItem && window.wpUploadImage) {

          e.preventDefault();

          var f = imgItem.getAsFile();

          var pos = wbMouse || {
              x: (wbWrap.scrollLeft + wbWrap.clientWidth / 2) / (state.zoomLevel || 1),
              y: (wbWrap.scrollTop + wbWrap.clientHeight / 2) / (state.zoomLevel || 1)
          };

          window.wpUploadImage(f, Math.round(pos.x - 150), Math.round(pos.y - 150));

          return;

      }

      if (pasteWbClipboard()) e.preventDefault();

  });

  function download(name, text){

    try{

      var blob=new Blob([text],{type:'application/json'});

      var url=URL.createObjectURL(blob);

      var a=document.createElement('a'); a.href=url; a.download=name;

      document.body.appendChild(a); a.click(); a.remove();

      setTimeout(function(){URL.revokeObjectURL(url);},1000);

      toast('Exported '+name);

    }catch(e){ toast('Export blocked here.'); }

  }

  

  /* ---------- scoped JSON/zip exports ----------
     Every scope produces a valid merge file ({activeCampaignId, campaigns})
     so anything exported here round-trips through Import → Merge. Exports
     that reference images become a .zip bundling data.json + the images. */

  function downloadBlob(name, blob) {
      try {
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a'); a.href = url; a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function() { URL.revokeObjectURL(url); }, blob && blob.size > 50 * 1024 * 1024 ? 600000 : 1000);   // a large archive is still being written a second later
      } catch(e) { toast('Export failed.'); }
  }

  function slugName(s) {
      return String(s || 'export').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'export';
  }

  // Scan the serialized payload for /saves/images/ references (room images,
  // portraits, whiteboard images, and <img> tags embedded in text HTML).
  function collectImagePaths(payload) {
      var found = {};
      JSON.stringify(payload).replace(/\/saves\/images\/[^"\\]+/g, function(m) {
          found[m.replace(/['")>,;]+$/, '')] = 1;
          return m;
      });
      return Object.keys(found);
  }

  // [zipcheck:exportfile-start]
  // One file of the saves folder, opened for an archive: its size (known from the first answer) and pull(emit), which hands its
  // bytes on in order — a file up to 32 MB in one piece, a larger one in byte ranges of 32 MB, never a whole large file in memory.
  // Null when the file is not there or its first answer does not say what it is; pull throws when a later range comes back wrong
  // (a file that changed while it was read is left out by the writer, not written wrong).
  var EXPORT_PART = 32 * 1024 * 1024;
  async function exportOpen(url, fetchFn, part) {
      var get = fetchFn || fetch, PART = part || EXPORT_PART;
      var one = function(u8) { return { size: u8.length, pull: async function(emit) { await emit(u8); } }; };
      var r = await get(url, { headers: { Range: 'bytes=0-' + (PART - 1) } });
      if (r.status === 416) { r = await get(url); if (!r.ok) return null; return one(new Uint8Array(await r.arrayBuffer())); }   // an empty file has no first range
      if (!r.ok) return null;
      var first = new Uint8Array(await r.arrayBuffer());
      if (r.status !== 206) return one(first);   // a server that sends it whole
      var cr = /^bytes 0-(\d+)\/(\d+)$/.exec(r.headers.get('Content-Range') || '');
      if (!cr) return null;
      var total = Number(cr[2]), firstLen = first.length;
      if (!(total >= firstLen) || Number(cr[1]) !== firstLen - 1) return null;
      return { size: total, pull: async function(emit) {
          await emit(first); first = null;
          var at = firstLen;
          while (at < total) {
              var end = Math.min(total, at + PART) - 1;
              var rr = await get(url, { headers: { Range: 'bytes=' + at + '-' + end } });
              if (rr.status !== 206 || (rr.headers.get('Content-Range') || '') !== 'bytes ' + at + '-' + end + '/' + total) throw new Error('the file changed while it was read');
              var u = new Uint8Array(await rr.arrayBuffer());
              if (u.length !== end - at + 1) throw new Error('the file changed while it was read');
              await emit(u); at += u.length;
          }
      } };
  }
  // The same file as an archive entry's data (a Blob: its bytes leave this page's memory at once) and its checksum, read once
  async function exportFile(url, zip, fetchFn, part) {
      var f = await exportOpen(url, fetchFn, part); if (!f) return null;
      var parts = [], c = -1, got = 0;
      try { await f.pull(async function(u8) { c = zip.crcUpdate(c, u8); parts.push(new Blob([u8])); got += u8.length; }); } catch (e) { return null; }
      if (got !== f.size) return null;
      return { data: new Blob(parts), crc: zip.crcDone(c) };
  }
  // How many bytes of video and music an export of this scope would carry (from each library's own sizes; a song two campaigns
  // list is counted for each, so this errs high): past EXPORT_BIG the archive is written straight to a file, since a window can
  // hold only so large a Blob
  var EXPORT_BIG = 1024 * 1024 * 1024;
  function exportMediaBytes(scope) {
      if (scope !== 'campaign' && scope !== 'all') return 0;
      var camps = scope === 'all' ? Object.values((state.appState && state.appState.campaigns) || {}) : [getActiveCampaign()], n = 0;
      var add = function(v) { if (v && typeof v.size === 'number' && isFinite(v.size) && v.size > 0) n += v.size; };
      camps.forEach(function(c) {
          (c && Array.isArray(c.videos) ? c.videos : []).forEach(add);
          (c && c.music && typeof c.music === 'object' && Array.isArray(c.music.tracks) ? c.music.tracks : []).forEach(add);
      });
      return n;
  }
  function exportBaseName(scope) { var c = getActiveCampaign(); return scope === 'all' ? 'waypoint-everything' : slugName(c && c.name) + '-campaign'; }
  // What an export says of itself: the pictures and the videos that went in (a file left out taken off the count of its kind) and
  // how many were left out — a file that was not there, or changed while it was read, is never passed over in silence
  function exportTally(nImg, nVid, skipped) {
      var v = skipped.filter(function(n) { return /^images\/video\//.test(n); }).length;
      return { images: nImg - (skipped.length - v), videos: nVid - v, missing: skipped.length };
  }
  function exportDoneWords(r) { return 'Exported ' + r.name + ' (' + r.images + ' image(s)' + (r.videos ? ', ' + r.videos + ' video(s)' : '') + (r.missing ? ', ' + r.missing + ' missing' : '') + ').'; }
  // [zipcheck:exportfile-end]

  // A campaign file that leaves this machine carries the players' names and history, never their table keys
  // (the secret each player proves their identity with at THIS table — a file handed to another GM must not carry it).
  function stripTableKeys(payload) {
      Object.values((payload && payload.campaigns) || {}).forEach(function(c) { if (c && c.players && typeof c.players === 'object') Object.keys(c.players).forEach(function(pid) { var p = c.players[pid]; if (p && typeof p === 'object') delete p.key; }); });
      return payload;
  }
  // handle (optional): a file to write the archive straight to (exportScope asks for one when the export is large); without it
  // the archive is a Blob, as ever
  async function buildExport(scope, handle) {
      if (!canPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return null; }
      var camp = getActiveCampaign();
      if (!camp) { toast('No campaign selected.'); return null; }
      function mergeShell(items) {
          var c = {}; c[camp.id] = { id: camp.id, name: camp.name, items: items };
          return { activeCampaignId: camp.id, campaigns: c };
      }
      var payload = null, base = '';
      if (scope === 'all') {
          payload = stripTableKeys(clone(state.appState));
          base = 'waypoint-everything';
      } else if (scope === 'campaign') {
          // this campaign on its own: every map and planner plus its players, handouts, delivery record, cast
          var cc = {}; cc[camp.id] = clone(camp);
          payload = stripTableKeys({ activeCampaignId: camp.id, campaigns: cc });
          base = slugName(camp.name) + '-campaign';
      } else if (scope === 'item') {
          var it = camp.items[camp.activeItemId];
          if (!it) { toast('Nothing is open.'); return null; }
          var one = {}; one[it.id] = clone(it);
          payload = mergeShell(one);
          base = slugName(it.meta && it.meta.title);
      } else if (scope === 'maps' || scope === 'planners' || scope === 'docs') {
          var t = scope === 'maps' ? 'map' : scope === 'planners' ? 'planner' : 'doc';
          var items = {};
          Object.values(camp.items).forEach(function(i) { if (i.type === t) items[i.id] = clone(i); });
          if (!Object.keys(items).length) { toast('This campaign has no ' + (scope === 'docs' ? 'handbook pages' : scope) + '.'); return null; }
          payload = mergeShell(items);
          base = slugName(camp.name) + '-' + (scope === 'docs' ? 'handbook' : scope);
      } else if (scope === 'whiteboards') {
          // Whiteboard-only copies: rooms/links stripped, ids suffixed _wb so a
          // merge-import never overwrites the full map they came from.
          var mapIds = {};
          Object.values(camp.items).forEach(function(i) { if (i.type === 'map') mapIds[i.id] = 1; });
          var wbs = {};
          Object.values(camp.items).forEach(function(i) {
              if (i.type !== 'map') return;
              var m = clone(i);
              m.id = i.id + '_wb';
              m.meta = Object.assign({}, m.meta, { title: ((m.meta && m.meta.title) || 'Map') + ' (Play Map)' });
              if (m.meta.parentId) {
                  if (mapIds[m.meta.parentId]) m.meta.parentId = m.meta.parentId + '_wb';
                  else delete m.meta.parentId;
              }
              m.rooms = []; m.links = []; m.cats = {};
              (m.whiteboard || []).forEach(function(w) { delete w.nodeId; });
              wbs[m.id] = m;
          });
          if (!Object.keys(wbs).length) { toast('This campaign has no play maps.'); return null; }
          payload = mergeShell(wbs);
          base = slugName(camp.name) + '-whiteboards';
      } else return null;

      // Bookkeeping keys never travel: the origin marker and the cleanup's own notes
      delete payload._foreign; delete payload._keptByUser; delete payload._cleanup;
      Object.values(payload.campaigns || {}).forEach(function(c) { delete c._foreign; delete c._keptByUser; delete c._cleanup; dropWaiting(c); });   // Onboarding F1a: nor a waiting token

      var json = JSON.stringify(payload, null, 2);
      var paths = collectImagePaths(payload);   // item 21: a campaign's videos travel too — the archive is made of the files as they lie on disk, of any size (zip.js)
      if (scope === 'campaign' || scope === 'all') {   // a campaign's own pictures travel even when nothing references them yet
          try {
              var listed = await (await fetch('/api/list-images')).json();
              var own = {}; Object.values(payload.campaigns || {}).forEach(function(c) { Object.keys(c.items || {}).forEach(function(id) { own[id] = 1; }); });
              (Array.isArray(listed) ? listed : []).forEach(function(im) { if (im && im.path && !/^journal(\/|$)/.test(im.folder || '') && (scope === 'all' || own[im.folder]) && paths.indexOf(im.path) < 0) paths.push(im.path); });
          } catch (e) {}
      }
      // Stage 6 library L1c2: a campaign export carries each pack file its manifest pins (library/<dir>/<id>.<rev>.json), so a campaign
      // with a library always travels as a zip
      var libFiles = [];
      if (scope === 'campaign' || scope === 'all') {
          var libCamps = Object.values(payload.campaigns || {}).filter(function(c) { return c && c.library && typeof c.library.dir === 'string' && Array.isArray(c.library.packs); });
          for (var lc = 0; lc < libCamps.length; lc++) {
              var lm = libCamps[lc].library;
              for (var lp = 0; lp < lm.packs.length; lp++) {
                  var pk = lm.packs[lp]; if (!pk || !pk.rev) continue;
                  try { var lr = await fetch('/api/library?dir=' + encodeURIComponent(lm.dir) + '&pack=' + encodeURIComponent(pk.id) + '&rev=' + pk.rev); if (lr.ok) libFiles.push({ name: 'library/' + lm.dir + '/' + pk.id + '.' + pk.rev + '.json', data: new Uint8Array(await lr.arrayBuffer()) }); } catch (e) {}
              }
          }
      }
      if (!paths.length && !libFiles.length && !handle) return { name: base + '.json', text: json };

      var isVideo = function(p) { return p.indexOf('/saves/images/video/') === 0; };
      var nVid = paths.filter(isVideo).length, nImg = paths.length - nVid;
      toast('Bundling ' + nImg + ' image(s)' + (nVid ? ', ' + nVid + ' video(s)' : '') + (libFiles.length ? ' and ' + libFiles.length + ' library pack(s)' : '') + '\u2026');
      var zip = await import('./zip.js');
      var enc = new TextEncoder();
      var entries = [{ name: 'data.json', data: enc.encode(json) }].concat(libFiles);
      var skipped = [], vidAt = 0;
      if (handle) {
          // straight to the file: each entry is read part by part and written as it comes (never held whole), its checksum written back
          // into its header; then the file is opened again and every entry checked against its checksum before the export is called done
          var total = 0, done = 0, lastSaid = 0;
          var say = function(n) { done += n; var now = Date.now(); if (now - lastSaid < 1000) return; lastSaid = now; toast('Writing the export' + (total ? ' ' + Math.min(99, Math.floor(done / total * 100)) + '%' : '') + '\u2026'); };
          var sEntries = entries.map(function(en) { return { name: en.name, size: en.data.length, pull: async function(emit) { await emit(en.data); } }; });
          paths.forEach(function(p) { sEntries.push({ name: p.replace(/^\/saves\//, ''), open: function() { return exportOpen(encodeURI(p)); } }); });
          total = exportMediaBytes(scope);
          var w = null, res = null;
          try {
              w = await handle.createWritable();
              res = await zip.zipWrite({ write: function(pos, data) { return w.write({ type: 'write', position: pos, data: data }); }, truncate: function(n) { return w.truncate(n); } }, sEntries, say);
              await w.close(); w = null;
              toast('Checking the export\u2026');
              var zfile = await handle.getFile(), zread = await zip.zipOpen(zfile);
              if (zfile.size !== res.size || zread.entries.length !== res.count) throw new Error('the file did not read back as it was written');
              for (var zi = 0; zi < zread.entries.length; zi++) await zread.entries[zi].check();
          } catch (e) {
              var left = false;
              if (w) { try { await w.abort(); } catch (e2) {} }   // not closed: nothing reached the file you picked
              else if (typeof handle.remove === 'function') { try { await handle.remove(); } catch (e3) { left = true; } } else left = true;   // written, then found wrong: taken away again
              toast('The export could not be written: ' + (e && e.message || 'the file could not be made') + '.' + (left ? ' The file it left is not to be trusted: delete it.' : ''));
              return null;
          }
          var tallyS = exportTally(nImg, nVid, res.skipped);
          return { name: handle.name || (base + '.zip'), saved: true, images: tallyS.images, videos: tallyS.videos, library: libFiles.length, missing: tallyS.missing };
      }
      for (var k = 0; k < paths.length; k++) {
          try {
              var vid = isVideo(paths[k]);
              if (vid) { vidAt++; toast('Bundling video ' + vidAt + ' of ' + nVid + '\u2026'); }
              var fe = await exportFile(encodeURI(paths[k]), zip);
              if (!fe) { skipped.push(paths[k].replace(/^\/saves\//, '')); continue; }
              entries.push({ name: paths[k].replace(/^\/saves\//, ''), data: fe.data, crc: fe.crc });
          } catch(e) { skipped.push(paths[k].replace(/^\/saves\//, '')); }
      }
      // refused, never a wrong file: the writer states every size exactly or throws, and the finished archive is opened again (its
      // end record and its list of files read back) before it is handed over
      var zblob = null;
      try {
          zblob = zip.zipCreate(entries);
          var zback = await zip.zipOpen(zblob);
          if (zback.entries.length !== entries.filter(function(en) { return !/\/$/.test(en.name); }).length) throw new Error('its list of files did not read back');
      } catch (e) {
          toast(e && e.name === 'NotReadableError' ? 'The export is too large for this window to hold in one piece. Nothing was written.' : 'The export could not be written: ' + (e && e.message || 'the archive could not be made') + '.');
          return null;
      }
      var tallyB = exportTally(nImg, nVid, skipped);
      return { name: base + '.zip', blob: zblob, images: tallyB.images, videos: tallyB.videos, library: libFiles.length, missing: tallyB.missing };
  }
  window.wpBuildExport = buildExport;

  async function exportScope(scope) {
      if (!canPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return; }
      // a large export (its videos and music past 1 GB) is written straight to a file you pick, never held in this window's memory; the
      // picker must open while the click still counts, so the size is judged first, from the library's own numbers
      var handle = null;
      if (typeof window.showSaveFilePicker === 'function' && exportMediaBytes(scope) > EXPORT_BIG) {
          try { handle = await window.showSaveFilePicker({ suggestedName: exportBaseName(scope) + '.zip', types: [{ description: 'Waypoint export', accept: { 'application/zip': ['.zip'] } }] }); }
          catch (e) { if (e && e.name === 'AbortError') return; handle = null; }   // cancelled: no export; a window that cannot ask: the archive as a download, as ever
      }
      var r = await buildExport(scope, handle);
      if (!r) return;
      if (r.text) { download(r.name, r.text); toast('Exported ' + r.name); }
      else {
          if (!r.saved) downloadBlob(r.name, r.blob);
          toast(exportDoneWords(r));
      }
  }

  var _exportScopeBtns = { exportItemBtn: 'item', exportMapsBtn: 'maps', exportWbsBtn: 'whiteboards', exportPlannersBtn: 'planners', exportDocsBtn: 'docs', exportCampaignBtn: 'campaign', exportBtn: 'all' };
  Object.keys(_exportScopeBtns).forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function() { exportScope(_exportScopeBtns[id]); });
  });

  // "Export This …" reflects whatever is open when the menu drops down
  var _el_saveAsBtn2 = document.getElementById('saveAsBtn');
  if (_el_saveAsBtn2) _el_saveAsBtn2.addEventListener('click', function() {
      var camp = getActiveCampaign();
      var it = camp && camp.items[camp.activeItemId];
      var row = document.getElementById('exportItemBtn');
      if (!row) return;
      row.style.display = it ? '' : 'none';
      if (it) row.innerHTML = '&#128190; Export This ' + (it.type === 'planner' ? 'Planner' : it.type === 'doc' ? 'Page' : 'Map');
  });

  

  function getBase64Image(imgEl) {

      var canvas = document.createElement("canvas");

      canvas.width = imgEl.naturalWidth || imgEl.width;

      canvas.height = imgEl.naturalHeight || imgEl.height;

      var ctx = canvas.getContext("2d");

      ctx.drawImage(imgEl, 0, 0);

      return canvas.toDataURL("image/png");

  }



  var _el_exportPdfBtn = document.getElementById('exportPdfBtn');

if(_el_exportPdfBtn) _el_exportPdfBtn.addEventListener('click', function() {
      var nP = window.wpNet, go = function() { if (nP && nP.holdPeers) nP.holdPeers(180000); try { window.print(); } finally { if (nP && nP.heldDone) nP.heldDone(); } };   // F2b: the table waits out the print dialog (it freezes this page)
      if (window.wpWithRenderedPlanner) window.wpWithRenderedPlanner(go);   // a planner prints as its rendered document
      else go();
  });

  

export {

    load,

    updateUndoBtn,

    pushHistory,

    undo,

    redo,

    save,

    download,

    getBase64Image,

    canPersistLocal,

    resetHistory,

    historyDepth,

    historyBarrier,

    rebaseHistory,

    withoutHistory,

    fieldUndoChord,

    takeSafetyCopy,

    migrateAppState   // main.js: an import is shaped by the load's own normaliser (cleanup.js cleanImport)

};

// Modules without an import edge to io.js (net, sidebar, planner, inspector, shadowbase) reach the gate here
window.wpCanPersistLocal = canPersistLocal;
window.wpResetHistory = resetHistory;
window.wpHistFlush = flushHistory;     // net.js: before a player's change lands in a map
window.wpHistBarrier = historyBarrier; // net.js / whiteboard.js: after a write that spans two maps
// Dev/console: the per-item undo picture, { 'campId/itemId': { undo, redo, bytes } }, for sandbox checks
window.wpHist = { refs: function(s) { s = String(s || ''); if (!s) return false; var inS = function(x) { return typeof x === 'string' && x.indexOf(s) >= 0; }; return Object.keys(histories).some(function(k) { var h = histories[k]; return inS(h.last) || h.undo.some(inS) || h.redo.some(inS); }); }, peek: function() { var out = {}; Object.keys(histories).forEach(function(k) { var h = histories[k]; out[k] = { undo: h.undo.length, redo: h.redo.length, bytes: h.bytes }; }); return out; } };



export function toast(msg) {

    var tb = document.getElementById('toastBtn');

    if (tb) {

        document.getElementById('toastMsg').textContent = msg;

        document.getElementById('toast').className = 'show';

        setTimeout(function(){ document.getElementById('toast').className=''; }, 3000);

    }

}

// Every module's local toast() shim delegates to window.appToast — hook it up here.

window.appToast = toast;

// Dev/power-user: drop any queued autosave and re-read data.json from disk via the existing load()
// path, so an externally rebuilt save appears without the stop/write/restart dance. Clearing the
// debounce first is what makes disk win — otherwise the pending in-memory POST re-clobbers the file
// you just read. Any unsaved in-memory edit is intentionally discarded. (Works in the packaged shell too.)
window.wpReloadFromDisk = function() {
    var n = window.wpNet;
    if (n && n.active && n.role === 'client') { toast('Not while you\'re at someone else\'s table.'); return false; }   // still joined: your own save would replace the table
    if (n && n.active && n.role === 'host') { toast('Not while you\'re hosting \u2014 end the session first.'); return false; }   // the load's normaliser and cleanup would run under the live table
    clearTimeout(saveTimeout); load(); return true;
};

// Dev/console: force an immediate save now, skipping the ~500ms debounce (io.js save(true)).
window.wpSave = save;





