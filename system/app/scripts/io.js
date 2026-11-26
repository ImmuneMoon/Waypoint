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
import './objcore.js';   // 1.6.0: the map objects' cleaner (window.wpObjCore), there before the first load
import './boxcore.js';   // 1.6.2 (backlog 42): the containers' cleaner (window.wpBoxCore), there before the first load
import './trackcore.js';   // 1.6.0 backlog 29: the trackers' cleaner (window.wpTrackCore), there before the first load
import './imgtagcore.js';   // 1.6.0 backlog 34: the Image Library tags' cleaner (window.wpImgTagCore), there before the first load
import './soundoncore.js';   // 1.6.2: the cleaner of the sounds on actions (window.wpSoundOnCore), there before the first load
import * as Share from './sharecore.js';   // 1.6.0 backlog 34: the share sheet's pure half (what an export leaves out, and its card)
import { flatFollow, flatKids, flatRemap } from './flatten.js';   // 1.6.3 (finding 16): a flattened picture's pieces move with it, in the save that moves it, and are copied with it (the review of 87d9b6e0)
import { delWb, delRooms, delSaid } from './delask.js';   // 1.6.3 (findings 15 and 16): Delete asks first where it takes locked structure, a token, a room or a flattened picture's pieces

import { uid, clone, createNewCampaign, createNewMap, createNewPlanner, getActiveCampaign, getActiveMap } from './models.js';



import { updateCampaignSelect, updateSidebarNav } from './sidebar.js';

import { showPrompt, showConfirm, isCampaignNameTaken, getUniqueCampaignTitle, promptForCampaignName, isItemNameTaken, getUniqueItemTitle, promptForItemName } from './dialogs.js';

import { renderPlanner, renderPlannerPreview } from './planner.js';

import { renderDataMap, clearSnaps, drawSnap, doSmartSnapping, attachDrag, attachPanning, isLinkMode, setLinkMode, removeLinkAt } from './datamap.js';

import { renderWhiteboard, attachResizeHandle, attachRotateHandle, addWbItem, uploadImageFile } from './whiteboard.js';

import { getRoomInspectorHtml, attachRoomInspectorEvents, renderInspector,  renderElementList, esc } from './inspector.js';

import { onLoad as cleanupOnLoad, sweepRecents, dropWaiting } from './cleanup.js';
import { webReady } from './webmode.js';
import { saveStart, saved as saveDone, downloadNow, saySet } from './savefile.js';   // 1.6.4: the one rule for saving a file the person names (a save dialog where the window has one), which says a failure through this module's notice
saySet(toast);
import './uiparts.js';   // 1.6.2: the app's own controls, window.wpUi (a counter and a slider with a value you type in)   // 1.5.5: what a website's plan allows, read once before load() decides anything



  /* ---------- save-format migration ----------
     Upgrades a save from ANY prior Waypoint version to the current shape,
     touching nothing it doesn't have to. Runs on every load; if it changed
     anything the upgraded save is written back once (the shell snapshots the
     original into saves/backups on launch, so the pre-migration file survives). */
  var CURRENT_SCHEMA = 2;

  // Nearest flat-top hex cell center (mirrors snapToHex in datamap.js; s = 30,
  // 45 px columns, 52 px rows, centers at x = 45q + 15, y = 52(r + q/2)).
  function hexCenterFlat(x, y) {
      var s = 30, h = 52;
      var q = (x - s / 2) / (1.5 * s), r = y / h - q / 2;
      var rx = Math.round(q), ry = Math.round(r), rz = Math.round(-q - r);
      var xd = Math.abs(rx - q), yd = Math.abs(ry - r), zd = Math.abs(rz - (-q - r));
      if (xd > yd && xd > zd) rx = -ry - rz; else if (yd > zd) ry = -rx - rz;
      return { x: 1.5 * s * rx + s / 2, y: h * (ry + rx / 2) };
  }
  var _dropNotes = [];   // 1.6.0: what the normaliser left out of a campaign's system (droppedCounts), for load()'s one-time notice, as _bindNotes
  var _bindNotes = [];   // Onboarding F0: what the normaliser bound, for load()'s one-time notice (never from migrateAppState itself: it also runs in the stream window, pop-outs and cleanup copies)
  function migrateAppState(data) {
    var changed = false;
    _bindNotes = []; _dropNotes = [];
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
            else if (m.type !== 'map' && m.type !== 'planner' && m.type !== 'doc') { m.type = 'map'; fix('unknown item type read as a map'); }   // as the app draws it: every reader that asks for a map by its type then finds it (the owed review, 2026-10-09)
            if (!m.meta || typeof m.meta !== 'object') { m.meta = {}; fix('meta created'); }
            if (typeof m.meta.title !== 'string' || !m.meta.title) { m.meta.title = m.title || m.name || (m.type === 'planner' ? 'Planner' : m.type === 'doc' ? 'Page' : 'Map'); fix('title defaulted'); }
            if ('gridFront' in m.meta) { delete m.meta.gridFront; fix('obsolete gridFront removed'); }
            if (m.type === 'planner') {
                if (!Array.isArray(m.blocks)) { m.blocks = []; fix('planner blocks created'); }
                if (!m.blocks.every(isPlain)) { m.blocks = m.blocks.filter(isPlain); fix('corrupt planner block dropped'); }
                m.blocks.forEach(function(b) { if (b && typeof b === 'object' && !b.id) { b.id = 'b_' + Math.random().toString(36).slice(2, 8); fix('block id added'); } });   // 1.5.6: as a page's, so a link may name a section of a planner (pageshelf.js)
                if (window.wpDocRender && window.wpDocRender.cleanBlockFmts) m.blocks.forEach(window.wpDocRender.cleanBlockFmts);   // text style (1.5.0): the look of a block's plain fields, cleaned against their texts on load (with the cleaner not loaded left as it is: every draw cleans again)
                return;
            }
            if (m.type === 'doc') {   // a handbook page: blocks only, never the map arrays (the cleanup classifier tests !m.rooms)
                if (!Array.isArray(m.blocks)) { m.blocks = []; fix('page blocks created'); }
                if (!m.blocks.every(isPlain)) { m.blocks = m.blocks.filter(isPlain); fix('corrupt page block dropped'); }
                m.blocks.forEach(function(b) { if (b && typeof b === 'object' && !b.id) { b.id = 'b_' + Math.random().toString(36).slice(2, 8); fix('block id added'); } });
                if (window.wpDocRender && window.wpDocRender.cleanBlockFmts) m.blocks.forEach(window.wpDocRender.cleanBlockFmts);   // text style (1.5.0): as a planner's
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
            var aiFirst = Object.keys(c.items)[0] || null;   // a campaign with no item keeps null: only a real change is a repair, or every load of it upgrades the save again
            if (c.activeItemId !== aiFirst) { c.activeItemId = aiFirst; fix('activeItemId repaired'); }
        }

        // VTT features (1.4.9): a save from before them gets its per-campaign set once, from the default
        // at this moment (the 1.4.6 keys for an upgrading user). Not a fix(): no "save upgraded" toast,
        // the fill persists with the next ordinary save.
        if (window.wpVtt) window.wpVtt.fill(c);
        if (c.uploads !== undefined && window.wpSystemCore && window.wpSystemCore.cleanUploads) { var cups = window.wpSystemCore.cleanUploads(c.uploads); if (cups.length) c.uploads = cups; else delete c.uploads; }   // Stage 6 U2: players' sheet uploads waiting for the GM (the review reads them the same way)
        if (c.library !== undefined && window.wpLibraryCore && window.wpLibraryCore.cleanManifest) { var lman = window.wpLibraryCore.cleanManifest(c.library); if (lman) c.library = lman; else delete c.library; }   // Stage 6 library L1c: the manifest of the pack files beside the save (librarycore; never dropped for want of the cleaner)
        if (c.system !== undefined && window.wpSystemCore && window.wpFormula) {   // character sheets (1.5.0): a system from a file is cleaned like one off the wire
            var csys = c.system ? window.wpSystemCore.cleanSystem(c.system, { F: window.wpFormula, gmView: true }) : null;
            if (csys && window.wpSystemCore.droppedCounts) { var sdr = window.wpSystemCore.droppedCounts(c.system, csys); if (Object.keys(sdr).length) _dropNotes.push({ camp: c, dr: sdr }); }   // 1.6.0: what was left out, over the limits or not valid, is said, never cut silently
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
        if (c.music !== undefined && window.wpMusicCore && window.wpMusicCore.musicView) { var muL = window.wpMusicCore.musicView(c.music); if (muL.tracks.length || muL.playlists.length) c.music = muL; else delete c.music; }   // the campaign's music library, cleaned on load as the app reads it (a list, a hostile track, a playlist naming a track that is not there); none when nothing cleans; without the cleaner left as it is
        if (c.trackers !== undefined) { var TKl = window.wpTrackCore, tkM = Object.create(null); Object.keys(c.items && typeof c.items === 'object' ? c.items : {}).forEach(function(id) { if (c.items[id] && c.items[id].type === 'map') tkM[id] = 1; }); var tkL = TKl && TKl.cleanTrackers ? TKl.cleanTrackers(c.trackers, { maps: tkM }) : []; if (tkL.length) c.trackers = tkL; else delete c.trackers; }   // 1.6.0 backlog 29: the table trackers, cleaned on load and import (trackcore cleanTrackers; a tracker of a map that is gone goes with it; none without the cleaner)
        if (c.boxes !== undefined) { var BXl = window.wpBoxCore, bxL = BXl && BXl.cleanBoxes ? BXl.cleanBoxes(c.boxes, c.system) : null; if (bxL && Object.keys(bxL).length) c.boxes = bxL; else delete c.boxes; }
        if (window.wpBoxCore && window.wpBoxCore.boxesTidy) window.wpBoxCore.boxesTidy(c);   // 1.6.2 (backlog 42, the review): a container no piece names goes, a piece naming none holds none   // 1.6.2 (backlog 42): what containers hold, cleaned as sheets with no player
        if (c.furnPacks !== undefined) { var FUl = window.wpFurnCore, FCp = window.wpFogCore, fpL = FUl && FUl.cleanPacks && FCp && FCp.cleanTexSrc ? FUl.cleanPacks(c.furnPacks, FCp.cleanTexSrc) : []; if (fpL.length) c.furnPacks = fpL; else delete c.furnPacks; }   // 1.6.2 (backlog 222): the campaign's furnishing packs
        if (c.objects !== undefined) { var OCl = window.wpObjCore, ocL = OCl && OCl.cleanObjects ? OCl.cleanObjects(c.objects) : []; if (ocL.length) c.objects = ocL; else delete c.objects; }   // 1.6.0: the GM's own map objects
        if (c.soundOn !== undefined) { var soL = window.wpSoundOnCore && window.wpSoundOnCore.cleanSoundOn ? window.wpSoundOnCore.cleanSoundOn(c.soundOn) : []; if (soL.length) c.soundOn = soL; else delete c.soundOn; }   // 1.6.2: the sounds the GM ties to actions (a line whose roll or sound is gone stays: the list says so; none without the cleaner)
        if (c.trkHide !== undefined) { var tkH = window.wpTrackCore && window.wpTrackCore.cleanHide ? window.wpTrackCore.cleanHide(c.trkHide) : []; if (tkH.length) c.trkHide = tkH; else delete c.trkHide; }   // the players the GM keeps them from (profile ids; none without the cleaner)
        if (c.clock !== undefined) { var ckL = window.wpCalendarCore && window.wpCalendarCore.cleanClock ? window.wpCalendarCore.cleanClock(c.clock) : null; if (ckL) c.clock = ckL; else delete c.clock; }   // item 20 K2: the campaign's clock, cleaned on load (none without the cleaner)   // fog of war (1.5.0): campaign sight-field mapping + default, cleaned on load
    });

    // The Image Library's tags (1.6.0, backlog 34), the shared store and each campaign's, cleaned on load and import (imgtagcore cleanStore:
    // names as text, unique, a picture's tags named by its store, and a campaign's saved filters); what is no store goes, an empty one stays (the cleanup reads a shared one as a mark). Not a fix(): it persists with the next save.
    if (window.wpImgTagCore) {
        var ITC = window.wpImgTagCore;
        if (data.imageCats !== undefined) { var itA = ITC.cleanStore(data.imageCats); if (itA) data.imageCats = itA; else delete data.imageCats; }
        Object.keys(data.campaigns).forEach(function(cid) { var cc = data.campaigns[cid]; if (!cc || typeof cc !== 'object' || cc.imageCats === undefined) return; var itC = ITC.cleanStore(cc.imageCats, { filters: true }); if (itC) cc.imageCats = itC; else delete cc.imageCats; });
    }
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
  // toast, and in each campaign's Game Record a line for each guess and each player who owns several characters (one in play, the others kept)
  function noteBindings(list) {
      var bound = 0, linked = 0;
      list.forEach(function(n) {
          var c = n.camp, r = n.r, ps = c.players || {}, cs = c.chars || {};
          bound += r.bound; linked += r.linked;
          var nm = function(pid) { return (Object.prototype.hasOwnProperty.call(ps, pid) && ps[pid] && ps[pid].name) || 'A player'; };
          var cn = function(id) { return (Object.prototype.hasOwnProperty.call(cs, id) && cs[id] && cs[id].name) || 'a character'; };
          c.sessionLog = Array.isArray(c.sessionLog) ? c.sessionLog : [];
          r.several.forEach(function(s) { c.sessionLog.push({ at: Date.now(), kind: 'char', text: (nm(s.pid) + ' plays ' + cn(s.id) + (r.guesses.some(function(g) { return g.pid === s.pid; }) ? ' (a guess)' : '') + '; ' + s.kept.map(cn).join(', ') + (s.kept.length === 1 ? ' is' : ' are') + ' kept. Change it in System \u25B8 Characters').slice(0, 400) }); });
          if (c.sessionLog.length > 3000) c.sessionLog.splice(0, c.sessionLog.length - 3000);
      });
      setTimeout(function() { toast('Players now follow their characters by id: ' + bound + ' bound' + (linked ? ', ' + linked + ' token' + (linked === 1 ? '' : 's') + ' linked by name' : '') + '. The Game Record lists anyone with more than one character.'); }, 1200);
  }

  // 1.6.0 (the owner, 2026-10-28, of a section cut at the limit with no word: "count dropped sections and placements, sheet and HUD, with what is
  // said today, and warn in the System editor too"): a campaign's system that held more than Waypoint keeps is said once in a notice, logged as
  // a step, and kept by campaign id for the System editor's note (window.wpSysDrops, this machine's memory alone)
  function noteDrops(list) {
      var SC = window.wpSystemCore; window.wpSysDrops = window.wpSysDrops || Object.create(null);
      list.forEach(function(n) {
          var c = n.camp, w = SC && SC.droppedWords ? SC.droppedWords(n.dr) : ''; if (!c || !w) return;
          if (typeof c.id === 'string') window.wpSysDrops[c.id] = n.dr;
          if (window.wpStepLog) { var f = {}; Object.keys(n.dr).forEach(function(k) { f[k.replace(/[^a-z]/gi, '')] = n.dr[k]; }); window.wpStepLog('system v1', 'dropped', f); }
          setTimeout(function() { toast((c.name || 'A campaign') + ': its system held more than Waypoint keeps, so this was left out: ' + w + '. The System editor says what is at its limit.'); }, 0);
      });
  }
  window.wpTakeBindNotes = function() { var n = _bindNotes; _bindNotes = []; return n; };   // main.js: what the normaliser bound in a file it shaped for a Merge, taken once
  window.wpNoteBindings = noteBindings;   // main.js: an import's bindings get the same notice

  // [netcheck:webload-start]
  // 1.5.5: Waypoint on a website whose plan joins tables and nothing else (webmode.js). load() is where the player's own campaign comes back,
  // at the start and whenever a table is left or lost. There is none on such a website and none is made: nothing is fetched, seeded or sent.
  // The table on screen is let go of as load() lets it go, and the welcome's Join a game comes up, with the words of a table just lost still
  // in its line (net.js setStatus writes them there). The Multiplayer window a lost table opened is put away: its words are in that line too
  function loadJoinOnly(overtaken) {
      if (overtaken()) return;   // a join's snapshot landed meanwhile: the table stays
      state.appState = { activeCampaignId: null, campaigns: {} };
      state.selId = null; state.selWbId = null; state.selWbIds = [];
      var n = window.wpNet;
      if (n) { n.foreign = !!window.wpStream; n.stance = null; n.stanceCamps = null; n.gmId = ''; n.sounds = null; n.soundNow = null; }
      if (window.wpDocForeign) window.wpDocForeign(!!(n && n.foreign));
      if (window.wpSound) window.wpSound.foreign(!!(n && n.foreign));
      if (window.wpFx) window.wpFx.foreign(!!(n && n.foreign));
      updateCampaignSelect();
      updateSidebarNav();
      render();
      if (n && n.refreshUi) n.refreshUi();
      updateUndoBtn();
      var nm = document.getElementById('netModal'); if (nm) nm.style.display = 'none';
      if (!window.wpStream && !window.wpPopout && window.wpShowWelcome) window.wpShowWelcome();
  }
  // [netcheck:webload-end]

  function load() {

    resetHistory();   // before the fetch: a Ctrl+Z while the disk is being read finds nothing to pop

    // Ownership epoch: a snapshot that lands while the disk is being read bumps it past this value, and
    // this load then stands down instead of putting the player's own campaign over a live table.
    if (window.wpNet) window.wpNet.snapshotGen = (window.wpNet.snapshotGen || 0) + 1;
    var _loadGen = window.wpNet ? window.wpNet.snapshotGen : 0;
    var overtaken = function() { var n = window.wpNet; return !!(n && n.active && n.role === 'client' && (n.snapshotGen || 0) > _loadGen); };

    webReady.then(function(web) {   // 1.5.5: the site's word first (webmode.js). A desktop's answer has no web key, and the load below runs as it always did
      if (web && web.mode === 'join-only') { loadJoinOnly(overtaken); return; }
      return fetch('/api/data')

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
        if (typeof _dropNotes !== 'undefined') { if (_dropNotes.length && canPersistLocal() && typeof noteDrops === 'function') noteDrops(_dropNotes); _dropNotes = []; }   // 1.6.0: only on the GM's own save, never in the stream window, a pop-out or a player's app (typeof: a suite runs load alone)
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

           // 1.6.3 (the review of the click test settings): the welcome's Start a campaign may take away the campaign seeded here, and only
           // this one. It is noted in this window's memory alone, so a campaign seeded by an earlier launch, or a save that already had
           // campaigns, is never named (main.js wcSeedDrops reads it)
           window.wpSeededId = seedCamp.id;

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

  // [textcheck:history-start]
  var histories = {};   // key -> { campId, itemId, undo:[], redo:[], last:string, bytes:number, lru:number }

  var isUndoing = false;

  var savePending = false;   // a debounced save() is waiting: set in save(), cleared in doSave after pushHistory read it

  var typeSlot = { el: null, key: null, lastT: 0, chunkStart: 0 };   // the one text field whose keystrokes fold into a step

  var nativeProbe = null;    // the planner field whose Ctrl+Z / Ctrl+Y was handed to the browser first (one per document, like its undo stack)

  var nativeEdit = false;    // the browser's own text undo / redo changed a field of the planner editor: the next pass moves the baseline, never records a step

  var foldNext = false;      // the next pass folds the open item's change into the step before it (stepFold)

  var selNote = null;        // the selection around the open planner field's pending edit: { before, after } (stepSel) — the next pass takes it

  // 1.6.3 (the improvement week's review, finding 25): the projection pushHistory works out for each item of the active campaign (project, the
  // item's content as JSON), kept for the ONE save that ran that pass, by the item object. save's doSave takes it with passTake right after its
  // pushHistory and hands it to saveBody, which then knows that an item whose projection, keys and live meta are as they were when its piece of
  // the save was last written needs no new JSON. pushHistory empties it first thing whatever it does, so a pass that returned early (an undo
  // under way, someone else's campaign) leaves none, and none outlives the save it was made for
  var _passP = null;
  function passTake() { var p = _passP; _passP = null; return p; }

  var HIST_BUDGET_BYTES = 64 * 1024 * 1024;
    // Undo/redo depth per map & per planner: user-configurable via wp_undoDepth (Settings), default 100 (doubled from the old 50), clamped 10..500. The 64 MB byte budget above still caps total memory.
    function histDepth() { var v = 0; try { v = parseInt(localStorage.getItem('wp_undoDepth'), 10); } catch (e) {} return (v >= 10 && v <= 500) ? v : 100; }

  // Meta keys that are never in a snapshot — always taken from the live item. A new content key is
  // undoable by default; a new view, structure or governance key (a per-map table toggle, say) goes HERE.
  var META_LIVE = { title: 1, updated: 1, parentId: 1, sortIndex: 1, collapsed: 1, playerLock: 1, status: 1, players: 1,
                    lastX: 1, lastY: 1, lastZoom: 1, lastWbX: 1, lastWbY: 1, lastWbZoom: 1, lastView: 1, readerView: 1 };

  var HIST_BTN_IDS = { dataUndoBtn: 1, dataRedoBtn: 1, wbUndoBtn: 1, wbRedoBtn: 1, plannerUndoBtn: 1, plannerRedoBtn: 1 };

  // "May this window write to this disk right now?" One answer for every write to disk.
  // [cleanupcheck:bkspheld-start]
  // 1.5.6: whether Backspace leaves the selection alone: the focus on a button, a link or anything that says it is a button (the selection
  // toolbar's trash among them), never the page itself, the board or a box that is no field
  function bkspHeld(el) { return !!(el && el.nodeType === 1 && typeof el.closest === 'function' && el.closest('button, a[href], [role="button"]')); }
  // [cleanupcheck:bkspheld-end]
  // [shelfcheck:menuheld-start]
  // 1.6.2: a menu that holds the focus keeps its own keys. The arrows walk its rows, and neither they nor Delete nor Backspace reach what is
  // selected on the map behind it (found on the Outline menu, whose arrows moved a selected token; every menu now, by its role). Only a menu
  // that shows holds them: the focus can still rest on a row of a menu that was put away, since the board keeps a click from moving the focus.
  // 1.6.3 (the review of pages, finding 4): so does a row of the left panel's tree, which walks its rows by the arrows: Delete or Backspace on a
  // row of it never deletes what is selected on the map
  function menuHeld(el) { var m = el && el.nodeType === 1 && typeof el.closest === 'function' ? el.closest('[role="menu"], [role="listbox"], [role="tree"]') : null; return !!(m && (typeof m.getClientRects !== 'function' || [].some.call(m.getClientRects(), function(r) { return !!r && r.width > 0; }))); }   // shown: some box of it has a width (the review of pages finding, 4: the tree in a panel folded to its rail has a box of no width, and it held the map's keys)
  // [shelfcheck:menuheld-end]
  function askHeld() { var up = function(id) { var e = document.getElementById(id); return !!(e && e.style && e.style.display === 'flex'); }; return up('customConfirm') || up('customPrompt'); }   // the app's own question or prompt is up, as commands.js hotkeyHeld reads it ('asking')
  // [sysedcheck:winheld-start]
  // 1.6.3 (the release click test): a window of the app's is up over the map, so no key reaches the map behind it. A click on a blank part of the
  // System editor left the focus on the page's body, and the arrows moved the token selected behind it, Ctrl+Z undid the map and Delete would have
  // deleted it. A window is an element whose id ends in Modal and that shows, as commands.js hotkeyHeld reads one ('window'). A player's page
  // reader (docReaderModal) is no window: it stands beside the map as a floating box, and the arrows still move their token while it is open
  function winHeld(doc) {
      var wins = doc && typeof doc.querySelectorAll === 'function' ? doc.querySelectorAll('[id$="Modal"]') : [];
      for (var i = 0; i < wins.length; i++) { var w = wins[i]; if (w.id !== 'docReaderModal' && typeof w.getClientRects === 'function' && w.getClientRects().length > 0) return true; }
      return false;
  }
  // [sysedcheck:winheld-end]
  function canPersistLocal() {
      var n = window.wpNet, W = window.wpWebMode;
      if (W && typeof W.joinOnly === 'function' && W.joinOnly() === true) return false;   // 1.5.5: a website's plan that joins tables alone keeps nothing of the player's (webmode.js): the site answers a save with 403
      if (window.__wpNoSave) return false;                              // a restore is deciding
      if (window.wpStream || window.wpPopout) return false;             // the stream / pop-out windows never own a save
      if (n && (n.foreign || (n.active && n.role === 'client'))) return false;
      if (state.appState && state.appState._foreign) return false;      // origin marker: this state came from someone else's table
      return true;
  }

  // R2 security (cluster E): a join the GM has not yet let in (no snapshot, no synced host) still shows this machine's own campaign, so a save of it
  // goes to this disk as ever — never to the host it is waiting on — and nothing the player draws or moves while they wait is lost. False the
  // moment a snapshot lands (net.foreign, the state's origin marker), between a reconnect's attempts, in the stream and pop-out windows, and
  // while a restore decides. Only save() reads it: every other write stays behind canPersistLocal.
  function ownWhileWaiting() {
      var n = window.wpNet, W = window.wpWebMode;
      if (W && typeof W.joinOnly === 'function' && W.joinOnly() === true) return false;   // 1.5.5: and no campaign of the player's own waits with them on such a website
      if (window.__wpNoSave || window.wpStream || window.wpPopout) return false;
      if (!n || !n.active || n.role !== 'client' || n.foreign || n.stream || n.syncedPeer) return false;
      if (state.appState && state.appState._foreign) return false;
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

  // cur: the selection that goes with the state the item is in now — { made, left }: as the step that made the state left it (a redo back to
  // the state puts that one back), and as the step that left the state found it (an undo back to it puts that one back). Only a planner's
  // styled fields note one (stepSel); a state with none is stored exactly as before.
  function seed(cur, campId, itemId) { return { campId: campId, itemId: itemId, undo: [], redo: [], last: cur, bytes: 0, lru: 0, cur: null }; }

  // A stored state with its selection beside its content ("s", read back by stepHistory; the content is untouched)
  function withSel(snap, s) { return s && typeof s === 'object' && (s.made || s.left) ? snap.slice(0, -1) + ',"s":' + JSON.stringify({ made: s.made || undefined, left: s.left || undefined }) + '}' : snap; }

  // 127: the host's count of the drawings players have added and redrawn (net.js strokeSeq: a number that only goes up), read when a baseline is taken and

  // kept beside a stored state ("q"). A restore reads it to tell a drawing a player added after that state was taken, which stays, from one

  // that was there and that a step of the GM's removed, which goes again on a redo; and a redraw its player made since, which stays, from one

  // the state already holds. With nothing drawn by a player yet the count is 0 and a state is stored exactly as before. Read as a whole

  // number above 0 that a number holds exactly, or as 0: what is stored beside a state must always read back

  function strokeSeq() { var n = window.wpNet, v = 0; try { v = n && typeof n.strokeSeq === 'function' ? Number(n.strokeSeq()) : 0; } catch (e) { v = 0; } return v > 0 && v <= Number.MAX_SAFE_INTEGER ? Math.floor(v) : 0; }

  function withQ(snap, q) { return q > 0 ? snap.slice(0, -1) + ',"q":' + q + '}' : snap; }

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

  // An edit that must be one undo step of its own while a text field has the focus (a press of the bar on a planner field's box; a paste, a
  // line break or a symbol there; typing after the caret moved): typing still on the debounce timer becomes its step first, and the chunk
  // closes, so the save that follows is never folded into it. el: the field a new run of typing begins in — the step that follows opens its chunk.
  function stepBoundary(el) { if (savePending) pushHistory(); closeChunk(); if (el) typeSlot.el = el; }

  // The selection around the open planner field's edit, for the step it lands in: before the step's first edit and after its last. An undo
  // of the step puts the first back, a redo the second (stepHistory). Noted only where the save that follows is recorded.
  function stepSel(before, after) { if (!canPersistLocal()) return; if (selNote) selNote.after = after; else selNote = { before: before, after: after }; }

  // The save that follows belongs to the step before it: the open item's baseline moves and no step is added, so one undo takes the whole
  // run back (the Size list of the bar on a planner field's box stepped through by its arrow keys: every size on the way is applied, the run of them is one
  // step). One shot — the next pass reads and clears it, whatever that pass decides — and armed only where the save that follows is recorded
  // (this window may write to this disk), so it can never be left waiting for some later, unrelated pass.
  function stepFold() { foldNext = canPersistLocal(); }

  // Wipe every history (no argument) or one campaign's; nothing can be popped until the next pass seeds again
  function resetHistory(campId) {

      if (campId) Object.keys(histories).forEach(function(k) { if (histories[k].campId === campId) delete histories[k]; });

      else histories = {};

      savePending = false;

      nativeEdit = false;

      foldNext = false;

      selNote = null;

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

      _passP = null;   // 1.6.3 (finding 25): what an earlier pass worked out is never taken for this one's

      if (isUndoing) return;

      var native = nativeEdit;   // read once per pass, whatever the pass decides

      nativeEdit = false;

      var fold = foldNext;

      foldNext = false;

      var note = selNote;   // one shot too: the selection around the open planner field's edit

      selNote = null;

      if (!canPersistLocal()) return;   // someone else's campaign is never recorded

      var camp = getActiveCampaign();

      if (!camp || !camp.items) return;

      var remote = !!(window.wpNet && window.wpNet.applyingRemote), now = Date.now(), sq = strokeSeq();   // 127: sq, the host's count of what players drew and redrew, as this pass begins

      pruneDeadKeys();

      var passMap = typeof Map === 'function' ? new Map() : null;   // 1.6.3 (finding 25): item -> the projection this pass made of it

      Object.keys(camp.items).forEach(function(id) {

          var item = camp.items[id];

          if (!item) return;

          var key = itemKey(camp, id), cur = project(item), h = histories[key];
          if (passMap && typeof item === 'object') passMap.set(item, cur);

          if (!h) { histories[key] = seed(cur, camp.id, id); if (sq) histories[key].lastQ = sq; return; }   // lazy seed: new, imported, first seen

          if (cur === h.last) { if (sq) h.lastQ = sq; return; }   // 127: the same content, so every drawing a player has added by now is in it

          var wasQ = h.lastQ || 0; if (sq) h.lastQ = sq;   // 127: the count the state being left was taken at; every branch below makes cur the baseline

          // A player's change is never a GM step: move the baseline, keep redo. The one exception is the
          // GM's own debounced edit on the open item that a remote save is flushing (savePending still set).
          if (remote && !(savePending && id === camp.activeItemId)) { h.last = cur; return; }

          // The browser took back (or re-did) typing in the open planner's field: that is the user's undo,
          // not new work — the baseline moves, redo is kept, and the field's chunk stays open for what follows
          if (native && id === camp.activeItemId) { h.last = cur; if (typeSlot.el) { typeSlot.key = key; typeSlot.lastT = now; typeSlot.chunkStart = now; } return; }

          var mine = id === camp.activeItemId ? note : null;

          if (fold && id === camp.activeItemId && h.undo.length) { h.last = cur; if (mine) h.cur = { made: mine.after, left: h.cur ? h.cur.left : undefined }; return; }   // stepFold: part of the step before it (with no step to join, an ordinary one)

          if (canCoalesce(key, now)) { h.last = cur; typeSlot.lastT = now; if (mine) h.cur = { made: mine.after, left: h.cur ? h.cur.left : undefined }; return; }

          h.redo = [];

          pushStep(h, withQ(withSel(h.last, { made: h.cur ? h.cur.made : undefined, left: mine ? mine.before : undefined }), wasQ));   // the state being left, with the selection this step found (and, 127, the count it was taken at)

          h.cur = mine ? { made: mine.after } : null;

          h.last = cur;

          if (typeSlot.el) { typeSlot.key = key; typeSlot.lastT = now; typeSlot.chunkStart = now; }   // a typing step opens a chunk; a drag or a click does not

          else typeSlot.key = null;

      });

      _passP = passMap;   // the save that ran this pass takes it (passTake) for its body

      enforceBudget();

      updateUndoBtn();

  }
  // [textcheck:history-end]



  // Move an item's baseline to its current content without a step — for render-time clean-ups (legacy
  // planner upgrades, block defaults, flowchart layout resets). Pending typing is recorded first so it
  // is never folded into the clean-up.
  function setBaseline(item) {

      var camp = item ? campOf(item) : null;

      if (!camp) return;

      var key = itemKey(camp, item.id), cur = project(item);

      if (histories[key]) histories[key].last = cur; else histories[key] = seed(cur, camp.id, item.id);

      var sqB = strokeSeq(); if (sqB) histories[key].lastQ = sqB;   // 127: the count this baseline was taken at

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
  function mergeLivePlayerState(snapC, live, acts, q) {

      // 127 (the owner, by prompt, 2026-10-06: the GM's Undo takes back what the GM did to a player's drawing, "and still never moves or erases

      // what the player did themselves"). acts: the host's count of what players did to their own drawings on this map (net.js strokeActs:

      // addedAt, redrawnAt, erased, each asked about an id); q: the count the state being restored was taken at (withQ). With them a player's

      // drawing is no longer kept whole as it is now:

      //   in the state and on the map — it comes back as the state has it, so the GM's ticks, lock, hiding and place are undone; what its

      //     player redrew since stays theirs (OWN, the keys a player may hand the host);

      //   in the state only — one its player erased stays erased; one the GM removed comes back;

      //   on the map only — one a player added after the state was taken stays; a piece the GM's eraser cut from one, a copy the GM pasted,

      //     and one a later step of the GM's had removed (a redo) go.

      // With no count (acts absent) every case is as it was before

      var OWN = ['x', 'y', 'w', 'h', 'baseW', 'baseH', 'pts', 'color', 'strokeWidth', 'opacity', 'tip'];

      var isStroke = function(w) { return !!(w && w.type === 'path' && w.byPlayer); };

      if (!(acts && typeof acts.addedAt === 'function' && typeof acts.redrawnAt === 'function' && typeof acts.erased === 'function')) acts = null;   // a count that is not its three questions is no count

      var qn = typeof q === 'number' && q > 0 ? q : 0;

      // each question, answered in the player's favor when it cannot be asked or its answer is no answer (no number for when, anything but a

      // plain no for erased): their erase stays an erase, their drawing stays, their redraw stays

      var since = function(n) { return !(typeof n === 'number' && n <= qn); };   // after this state was taken (a number the state was taken at, or before it, is not)

      var erasedBy = function(id) { try { return acts.erased(id) !== false; } catch (e) { return true; } };

      var addedSince = function(id) { try { return since(acts.addedAt(id)); } catch (e) { return true; } };

      var redrewIt = function(id) { try { return since(acts.redrawnAt(id)); } catch (e) { return true; } };

      var liveList = live.whiteboard || [];

      var snapList = Array.isArray(snapC.whiteboard) ? snapC.whiteboard : [];

      var liveById = {}, snapById = {}, liveOwned = {}, out = [], back = [];

      var grp = function(w) { return w.charId ? 'c:' + w.charId : 'n:' + w.ownerId + '|' + String(w.charName || ''); };   // Onboarding F0: the chooser's groups (a character, or a pet by name)
      liveList.forEach(function(w) { if (w && w.id) { liveById[w.id] = w; if (w.isChar && w.ownerId) liveOwned[grp(w)] = 1; } });

      snapList.forEach(function(w) { if (w && w.id) snapById[w.id] = w; });

      snapList.forEach(function(s) {

          var l = s && s.id ? liveById[s.id] : null;

          // The owed review, 2026-10-09: an id that names two things is no match. A new drawing can be handed in under any id that is not on the

          // map, the id of a piece the GM deleted among them: matched by id alone, the GM's Undo gave the restored piece (a wall, a door, another

          // player's drawing) to whoever sent the line. Two things: the state's piece against a drawing on the map; and, where the count can say

          // what happened since, the state's drawing against a piece that is none or against a drawing signed by another player. The state's own

          // then comes back as a delete of the GM's undone, its owner as the state has it, and the other goes with the step

          if (l && (isStroke(s) ? !!acts && (!isStroke(l) || (typeof l.ownerId === 'string' && typeof s.ownerId === 'string' && l.ownerId !== s.ownerId)) : isStroke(l))) l = null;

          if (!l) {

              if (isStroke(s) && (!acts || erasedBy(s.id))) return;   // the player erased it: stays erased (127: told by the host's count of what players erased — one the GM removed is no such thing, and comes back below; with no count every missing drawing of a player's reads as erased, as before)

              // A GM-deleted token whose player has since been given another one on this map comes back
              // under GM control (sheet intact): a player never ends up with two tokens they both own
              if (s && s.isChar && s.ownerId && liveOwned[grp(s)]) delete s.ownerId;

              if (isStroke(s) && typeof s.ownerId === 'string') back.push({ id: s.id, ownerId: s.ownerId });   // a player's drawing this step brings back: no copy of theirs holds it yet, so a copy of theirs without it is no erase (net.js strokesBack)

              out.push(s);   // anything else absent live was a GM delete: it comes back (a token with its sheet)

              return;

          }

          if (l.ownerId) s.ownerId = l.ownerId; else delete s.ownerId;

          if (l.ownerId) {

              if (l.type === 'path' && l.byPlayer) {   // a player's drawing

                  if (!acts) { out.push(JSON.parse(JSON.stringify(l))); return; }   // no count: their stroke as they have it now, whole (as before)

                  if (redrewIt(s.id)) OWN.forEach(function(k) { if (l[k] !== undefined) s[k] = JSON.parse(JSON.stringify(l[k])); else delete s[k]; });   // 127: what its player redrew since is theirs, and stays

                  out.push(s); return;   // 127: all else comes back as the state has it — the GM's ticks, lock, hiding and place are what the step undoes

              }

              ['x', 'y', 'rot', 'front', 'elevation', 'posture'].forEach(function(k) { if (l[k] !== undefined) s[k] = l[k]; else delete s[k]; });

              if (l.light !== undefined) s.light = JSON.parse(JSON.stringify(l.light)); else delete s.light;   // lighting L5 (owner answer 9): a player's own light stays as it is now (theirs to switch: net.js tok-light); the lock on it (lightLock) is the GM's and follows the snapshot

          }

          out.push(s);

      });

      // Owned elements that arrived since the snapshot (spawned, drawn) stay, at their live index
      liveList.forEach(function(l, i) {

          if (!l || !l.id || snapById[l.id] || !l.ownerId) return;

          if (acts && isStroke(l) && !addedSince(l.id)) return;   // 127: a player's drawing by its marks that no player added after this state was taken — a piece the GM's eraser cut from one, a copy the GM pasted, one a later step of the GM's had removed — is the GM's doing, and goes with the step

          out.splice(Math.min(i, out.length), 0, JSON.parse(JSON.stringify(l)));

      });

      snapC.whiteboard = out;

      return back;   // the players' drawings that came back with this state: [{ id, ownerId }]

  }

  // [textcheck:steps-start]
  // Where the planner was being looked at, so a restore lands the eye and the caret back where they were
  function rememberPlannerSpot() {

      var ed = document.getElementById('plannerEditorWrap'), pw = document.getElementById('plannerPreviewWrap');

      var a = document.activeElement, spot = { ed: ed ? ed.scrollTop : 0, pw: pw ? pw.scrollTop : 0, field: null };

      if (a && a.dataset && a.dataset.idx !== undefined && a.closest && a.closest('#plannerBlocks')) {

          spot.field = { idx: a.dataset.idx, cls: a.className, ri: a.dataset.ri, ci: a.dataset.ci, ni: a.dataset.ni, ei: a.dataset.ei, sel: (typeof a.selectionStart === 'number') ? a.selectionStart : null,
                         ts: window.wpTextBox ? window.wpTextBox.selOf(a) : null };   // a styled field's box (planner.js): its selection as offsets into its text

      }

      return spot;

  }

  // sel: the selection the step that was undone or redone noted (a styled field's box): it goes back where it was — only when the focus was
  // in the editor (the toolbar's buttons leave the focus alone)
  function restorePlannerSpot(spot, sel) {

      var ed = document.getElementById('plannerEditorWrap'), pw = document.getElementById('plannerPreviewWrap');

      var pwTop = function() { if (pw) pw.scrollTop = spot.pw; };

      pwTop(); setTimeout(pwTop, 300);   // again once mermaid has re-laid out the preview

      if (ed) ed.scrollTop = spot.ed;

      var f = spot.field;

      if (!f) return;

      if (sel && window.wpTextBox && window.wpTextBox.restore(sel)) return;

      var el = Array.prototype.find.call(document.querySelectorAll('#plannerBlocks [data-idx="' + f.idx + '"]'), function(x) {

          return x.className === f.cls && x.dataset.ri === f.ri && x.dataset.ci === f.ci && x.dataset.ni === f.ni && x.dataset.ei === f.ei;

      });

      if (!el) return;

      try {

          el.focus({ preventScroll: true });

          if (f.ts && window.wpTextBox) window.wpTextBox.select(el, f.ts.s, f.ts.e);   // a styled field's box: the same characters, as far as its text now reaches

          else if (f.sel !== null && typeof el.setSelectionRange === 'function') { var p = Math.min(f.sel, (el.value || '').length); el.setSelectionRange(p, p); }

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

      // the flushed edit still has to reach disk (Ctrl+Y right after typing). 1.6.3: with nothing flushed and nothing to step, a notice says
      // so, since a history emptied by a traveller crossing a portal (historyBarrier) looked like a key that never arrived
      if (!from || !from.length) { if (flushed) save(true); else toast(dir === 'undo' ? 'Nothing to undo.' : 'Nothing to redo.'); return; }

      var snap = from.pop();

      if (dir === 'undo') h.redo.push(withQ(withSel(h.last, h.cur), h.lastQ || 0)); else pushStep(h, withQ(withSel(h.last, h.cur), h.lastQ || 0));   // 127: with the count the state being left was taken at

      var parsed = JSON.parse(snap);

      if (item.type === 'map' && parsed && parsed.c && Array.isArray(parsed.c.whiteboard)) parsed.c.whiteboard = parsed.c.whiteboard.filter(function(w) { return !(w && w.waiting); });   // Onboarding F1a: an undo never brings a waiting token back (while hosting, the merge keeps the live one)

      var hosting = !!(window.wpNet && window.wpNet.active && window.wpNet.role === 'host');

      var backS = hosting && item.type === 'map' ? mergeLivePlayerState(parsed.c, item, typeof window.wpNet.strokeActs === 'function' ? window.wpNet.strokeActs(camp.id, item.id) : null, typeof parsed.q === 'number' ? parsed.q : 0) : null;   // 127: with the host's count of what players did to their own drawings here, and the count this state was taken at

      h.cur = parsed && parsed.s && typeof parsed.s === 'object' ? parsed.s : null;   // the selection that goes with the state come back to (a planner's styled fields)

      var selBack = h.cur ? (dir === 'undo' ? h.cur.left : h.cur.made) : null;   // an undo: the selection the step found; a redo: the one it left

      var spot = (item.type === 'planner' || item.type === 'doc') ? rememberPlannerSpot() : null;

      applyContent(item, parsed);

      if (item.type === 'map' && window.wpSheets && window.wpSheets.syncOwners) window.wpSheets.syncOwners(camp);   // Onboarding F0 'tidy': one owned token per character, never an adopt, copy or spawn

      var wUndo = hosting && item.type === 'map' && window.wpNet && window.wpNet.tidyWaiting ? window.wpNet.tidyWaiting({ quiet: true, mapId: item.id }) : [];   // Onboarding F1a: a token the undo gave back takes the place of a waiting one
      if (hosting && item.type === 'map' && window.wpAutoRoom) (item.whiteboard || []).forEach(function(w) { if (w.isChar && w.ownerId) window.wpAutoRoom(w, item); });   // room membership follows the token

      closeChunk();

      state.selId = null; state.selWbId = null; state.selWbIds = []; state.linkStart = null;

      if (typeof window !== 'undefined' && window.wpPlannerRedrawNext) window.wpPlannerRedrawNext();   // 1.6.3: an undo draws a planner's editor again even with the focus in it (planner.js plannerApp)
      render();

      isUndoing = true;

      try {

          if (hosting) { window.wpNet.applyingRemote = true; save(true); window.wpNet.applyingRemote = false; if (window.wpFog) window.wpFog.invalidateVision(); if (backS && backS.length && typeof window.wpNet.strokesBack === 'function') window.wpNet.strokesBack(item.id, backS); if (window.wpNet.sendItem) window.wpNet.sendItem(camp.id, item.id); wUndo.forEach(function(id) { if (id !== item.id && window.wpNet.broadcastItemFiltered) window.wpNet.broadcastItemFiltered(camp.id, id); }); if (window.wpNet.syncCombatHidden) window.wpNet.syncCombatHidden(); }

          else save(true);

      } finally { isUndoing = false; }

      h.last = project(item);   // taken AFTER render + save, so a render-time clean-up can never differ from the baseline

      var sqS = strokeSeq(); if (sqS) h.lastQ = sqS;   // 127: the count this baseline was taken at

      histBytes(h);

      if (spot) restorePlannerSpot(spot, selBack);

      updateUndoBtn();

      toast(dir === 'undo' ? 'Undo' : 'Redo');

  }

  function undo() { stepHistory('undo'); }

  function redo() { stepHistory('redo'); }
  // [textcheck:steps-end]

  // [textcheck:undochord-start]
  // Ctrl+Z / Ctrl+Y with a planner field focused. The browser's own text undo runs while the field has
  // typing to take back; when it has none — nothing typed since the editor was last rebuilt, or the
  // native stack just ran dry — the chord reaches the planner's history instead. Returns true when the
  // chord was taken over (callers that stop propagation check it first). A styled field's box (planner.js: a title, a cell, a label — an
  // editable element the app draws from the field's runs) has no undo of the browser's at all: drawing it again breaks that, and it would put
  // text back without its look. In a box every chord is the planner's history, which records its typing in steps with their selections.
  function fieldUndoChord(e) {

      if (!(e.ctrlKey || e.metaKey) || e.altKey) return false;

      var k = String(e.key || '').toLowerCase();

      var dir = (k === 'z' && !e.shiftKey) ? 'undo' : (k === 'y' || (k === 'z' && e.shiftKey)) ? 'redo' : null;

      if (!dir) return false;

      var t = e.target;

      if (!t || !t.closest || !t.closest('#plannerBlocks')) return false;

      if (!canPersistLocal()) return false;

      var own = !!(t.classList && t.classList.contains('ts-box'));   // a styled field's box: never the browser's own undo

      // 1.6.3 (the review of pages, finding 9): a text block written on the page itself (Edit mode: its form stands in the editor's layer over
      // the page, planner.js pgLayout) never uses the browser's own undo either. Laying the form again as the page under it is drawn split the
      // browser's run of typing, so a Ctrl+Z there took back one character or a few at a time; the planner's history takes back the whole run
      // of typing in one step, as it does in a styled field's box

      if (!own && t.classList && t.classList.contains('rte-body') && t.closest('.pbe-layer')) own = true;

      if (t._wpNativeDirty && !own) {

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

  // The browser's own undo or redo landed on a styled field's box. Its undo stack is one per document, so a Ctrl+Z left to the browser in a
  // text block (or any field with typing of its own) reaches a box's typing once that field's own has run out. The box cancels it
  // (planner.js tsBefore) and calls this: the planner's history takes ONE step, and the probe waiting for a browser that stays silent is
  // answered here — no 'input' follows a canceled edit — so its timer takes no second step. The field that asked is spent, as when the
  // browser stays silent: its next Ctrl+Z is the planner's at once (a redo leaves it, as there).
  function boxUndo(dir) {

      var t = nativeProbe;

      nativeProbe = null;

      if (t && dir !== 'redo') t._wpNativeDirty = false;

      stepHistory(dir === 'redo' ? 'redo' : 'undo');

  }
  // [textcheck:undochord-end]

  // [textcheck:chunks-start]
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

      if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {

          nativeProbe = null;   // the browser answered the chord, whichever field it landed on

          // Only a field of the planner editor saves what the browser's undo did to it, and only that save is "the user's undo, not new
          // work". Anywhere else (the Find box, the chat) nothing is saved, and a flag set there would wait for the next save of all — and
          // swallow real work: typing in a styled field's box, which has no undo but the planner's history. A box's typing still on its
          // save timer (it noted its selection: selNote) becomes its own step first, so it is never folded into the baseline either.
          if (t.closest && t.closest('#plannerBlocks')) { if (selNote && savePending) pushHistory(); nativeEdit = true; }

      }

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
  // [textcheck:chunks-end]

  // A safety copy before something that cannot be undone (an item or campaign delete); Settings ▸ Advanced ▸
  // Snapshots lists it. Resolves either way — a core older than 1.3.6 has no such route and answers 404,
  // which is fine — and within 3 s regardless, so a core that never answers cannot hold the delete up.
  function takeSafetyCopy() {

      if (!canPersistLocal()) return Promise.resolve();

      var timer = new Promise(function(done) { setTimeout(done, 3000); });

      try { return Promise.race([fetch('/api/backup-now', { method: 'POST' }).then(function() {}, function() {}), timer]); } catch (e) { return Promise.resolve(); }

  }



  // [netcheck:savebody-start]
  // 1.6.3 (the improvement week's review, finding 25): a save sent JSON.stringify(state.appState), the whole campaign as one string (17.8 MB on
  // the owner's campaign), and the browser encoded all of it again for the request at every save, on the page's own thread: each drop, fog
  // stroke and door at the table ended in a hitch of about 190 ms. saveBody makes the very same bytes as a Blob put together from parts: each
  // item of every campaign (a map, a planner, a page) is its own part, kept by the item object (_bodyKept) with the JSON it was written as, and an
  // item whose JSON is the same as last time hands back the part it already has, so the browser encodes only the items that changed and the rest
  // of the state around them. Whether an item changed is known without writing its JSON again where the pass that ran this very save worked out
  // its projection (pp, from passTake) and that projection, the item's keys, its id, its type and its live meta (bodySig) are all what they were:
  // those say every byte of the item's JSON. Where there is no such projection (a host's save, whose table sync runs between the pass and the
  // body and may write into an item; another campaign; saveView) the projection is worked out here and judged the same way, so only the
  // encoding is saved. What is kept per item is its Blob (the item's bytes, held by the browser's blob store: about the size of the state on
  // disk, 17.8 MB on the owner's campaign) and its projection, which is the undo baseline's own string wherever it reads the same (bodyPart's
  // last), so it costs nothing of its own; only the items of a campaign the undo history has not seen this session keep a projection apart
  // (1.6.3, the review of finding 25: the first cut also kept each item's whole JSON, 36 to 54 MB more on that campaign).
  // The text is JSON.stringify(state.appState) itself: the state is written once with each item swapped for a mark that holds a random word of
  // this save's own, and each mark, found once and in order, is cut out for the item's part. Anything the mark cannot stand for (an item that
  // is no plain object or reads itself through toJSON, a campaign or a list of items that is no plain object, no Blob in this browser) is written
  // as it always was, and where the marks are not all found exactly once the whole save is the plain string. The server reads the same bytes
  var _bodyKept = typeof WeakMap === 'function' ? new WeakMap() : null;   // item object -> { p: projection, sig: bodySig, blob: its part }
  // The review of 1.6.3 (finding 13): a campaign's fogMem (the players' explored ground the host keeps, fog.js) may hold hundreds of thousands
  // of cells, and it stood in the skeleton, which is written whole at every save. It is a part of its own: its JSON is made again only where
  // fog.js says it was written since (wpFog.memVer, which moves at every write into any fogMem) or it is another object, else the part kept
  // for it is used. Where fog.js is not there to say, it stays in the skeleton, as before. The bytes are the same either way
  var _fogMemKept = typeof WeakMap === 'function' ? new WeakMap() : null;   // fogMem object -> { ver, blob }
  function fogMemPart(fm) {
      var F = window.wpFog, ver = F && typeof F.memVer === 'function' ? F.memVer() : null;
      if (typeof ver !== 'number' || !_fogMemKept) return null;
      var k = _fogMemKept.get(fm); if (k && k.ver === ver) return k.blob;
      var b = new Blob([JSON.stringify(fm)]); _fogMemKept.set(fm, { ver: ver, blob: b }); return b;
  }
  // what of an item its projection does not say, as one string, or null where the item cannot be judged that way: its own keys and its meta's
  // keys in order (the order JSON writes them in), its id and type, and its live meta values (project leaves META_LIVE out), each with its type,
  // since JSON writes undefined and a function as nothing and null as null. A key named __proto__ is no own key of the object project builds, so
  // an item or a meta that holds one is never judged by its projection
  function bodySig(item) {
      var meta = item.meta, ik = Object.keys(item);
      if (meta !== undefined && (meta === null || typeof meta !== 'object' || Array.isArray(meta) || typeof meta.toJSON === 'function')) return null;
      var mk = meta ? Object.keys(meta) : [];
      if (ik.indexOf('__proto__') >= 0 || mk.indexOf('__proto__') >= 0) return null;
      var live = []; mk.forEach(function(k) { if (META_LIVE[k]) live.push(k, typeof meta[k], meta[k]); });
      try { return JSON.stringify([ik, mk, typeof item.id, item.id, typeof item.type, item.type, live]); } catch (e) { return null; }
  }
  // one item's part of the body: the part kept for it where its projection, keys and live meta are as they were (its JSON is then as it was),
  // else a new one, kept. The projection is the one this save's pass made (pp) where there is one, else it is worked out here (a host's save,
  // saveView, an item of a campaign the pass does not walk). last: the item's undo baseline (histories[...].last), the string pushHistory keeps
  // of this very projection; where the projection reads the same, that string is the one kept, so the kept projection holds no memory of its own.
  // Called by saveBody alone, once an item, for every plain item of every campaign
  function bodyPart(item, pp, last) {
      var k = _bodyKept.get(item), p = pp ? pp.get(item) : undefined;
      if (p === undefined) { try { p = project(item); } catch (e) { p = undefined; } }   // a value that cannot be written: the item is written as it is below (and fails there as the plain string would)
      var sig = p !== undefined ? bodySig(item) : null;
      if (sig !== null && typeof last === 'string' && last === p) p = last;   // the baseline's own string, where it reads the same
      if (k && sig !== null && k.sig === sig && k.p === p) { k.p = p; return k.blob; }   // the projection, the keys and the live meta as they were: the JSON is as it was
      var b = new Blob([JSON.stringify(item)]); _bodyKept.set(item, { p: sig !== null ? p : undefined, sig: sig, blob: b }); return b;   // an item that cannot be judged keeps no projection, so it is written each time
  }
  // the save's body: a Blob holding exactly JSON.stringify(state.appState), or that string itself where it cannot be put together from parts
  function saveBody(pp) {
      var all = state.appState, plain = function(o) { return !!o && typeof o === 'object' && !Array.isArray(o) && typeof o.toJSON !== 'function'; };
      if (typeof Blob !== 'function' || !_bodyKept || !plain(all) || !plain(all.campaigns)) return JSON.stringify(all);
      if (!pp || typeof pp.get !== 'function') pp = null;
      // 1.6.3 (the review of finding 25): an own key named __proto__ (JSON.parse of a file makes one) on the state, its list of campaigns, a
      // campaign or a campaign's list of items is lost when the skeleton below is built (Object.assign and an assignment go through the
      // __proto__ setter, which drops it or, for a value that is no object, does nothing), and the count of marks does not always show it. The
      // body is then the plain string, which writes the key as it stands. bodyProto is the one test, asked before anything is built
      var bodyProto = function(o) { return Object.keys(o).indexOf('__proto__') >= 0; };
      if (bodyProto(all) || bodyProto(all.campaigns)) return JSON.stringify(all);
      var cids = Object.keys(all.campaigns);
      for (var q = 0; q < cids.length; q++) { var cq = all.campaigns[cids[q]]; if (plain(cq) && (bodyProto(cq) || (plain(cq.items) && bodyProto(cq.items)))) return JSON.stringify(all); }
      // the undo baseline of an item of a campaign, for bodyPart's last (none outside the history, or where the history holds none for it)
      var lastOf = function(camp, id) { var h = typeof histories === 'object' && histories && typeof itemKey === 'function' ? histories[itemKey(camp, id)] : null; return h && typeof h.last === 'string' ? h.last : undefined; };
      try {
          var word = '\u0001wpb' + Math.random().toString(36).slice(2) + Date.now().toString(36) + ':', parts = [], camps = {};
          Object.keys(all.campaigns).forEach(function(cid) {
              var camp = all.campaigns[cid];
              if (!plain(camp) || !plain(camp.items)) { camps[cid] = camp; return; }
              var items = {};
              Object.keys(camp.items).forEach(function(id) {
                  var it = camp.items[id];
                  if (!plain(it)) { items[id] = it; return; }
                  items[id] = word + parts.length; parts.push(bodyPart(it, pp, lastOf(camp, id)));
              });
              camps[cid] = Object.assign({}, camp, { items: items });   // the campaign's keys in their own order, its items swapped for marks
              var fmB = plain(camp.fogMem) && Object.keys(camp.fogMem).indexOf('__proto__') < 0 ? fogMemPart(camp.fogMem) : null;
              if (fmB) { camps[cid].fogMem = word + parts.length; parts.push(fmB); }   // the review of 1.6.3: the players' explored ground, a part of its own (fogMemPart)
          });
          var skel = JSON.stringify(Object.assign({}, all, { campaigns: camps })), wordJ = JSON.stringify(word).slice(1, -1);
          if (skel.split(wordJ).length - 1 !== parts.length) return JSON.stringify(all);   // a mark found more or fewer times than it was put in
          // each mark found in the order the text holds them (a campaign's fogMem may stand before or after its items), each number once
          var out = [], at = 0, open = '"' + wordJ, used = Object.create(null);
          for (var n = 0; n < parts.length; n++) {
              var i = skel.indexOf(open, at), j = i < 0 ? -1 : skel.indexOf('"', i + open.length), num = j < 0 ? NaN : Number(skel.slice(i + open.length, j));
              if (i < 0 || !(num >= 0 && num < parts.length && num % 1 === 0) || used[num] || skel.slice(i, j + 1) !== JSON.stringify(word + num)) return JSON.stringify(all);
              used[num] = 1; out.push(skel.slice(at, i), parts[num]); at = j + 1;
          }
          out.push(skel.slice(at));
          return new Blob(out);
      } catch (e) { return JSON.stringify(all); }
  }
  // [netcheck:savebody-end]

  var saveTimeout;

  // A failed save was said only in the row's saved note, which is out of sight while the row is hidden (the owed review, 2026-10-09): it is
  // said in a notice too, once when saving begins to fail, and again only after a save has gone through in between
  var _saveFailSaid = false, _saveFailAt = 0, SAVE_FAIL_AGAIN = 60000, _saveSeq = 0;   // ... and once a minute while it goes on failing: a notice is on screen for three seconds
  // 1.6.2 backlog 235: a save's answer for whoever waits on it (an import on a website's page): { status, why, max }, the reason read only on a
  // website's page (medialimit.js readRefusal), from a copy taken before the save's own note reads the answer. The desktop app reads the status alone
  function saveAnswer(raw) {
      var W = window.wpWebMode, IS = window.wpImportSay, web = !!(W && typeof W.web === 'function' && W.web() === true && IS && typeof IS.read === 'function');
      if (!raw || typeof raw.then !== 'function') return undefined;
      return raw.then(function(res) { return web ? IS.read(res) : { status: res.status, why: '', max: 0 }; }, function() { return { status: 0, why: '', max: 0 }; });
  }
  var _saveLimit = 0;   // 1.6.2: when a website's day of uploads is renewed, where the last save was refused for it
  function saveFailed(bad) {
      if (!bad) { if (_saveFailSaid) toast('Saving works again. The campaign is on the disk.'); _saveFailSaid = false; return; }
      var nowF = Date.now();
      if (_saveFailSaid && nowF - _saveFailAt < SAVE_FAIL_AGAIN) return;
      _saveFailSaid = true; _saveFailAt = nowF;
      if (_saveLimit > 0) { var dL = new Date(_saveLimit); toast('Today’s saves to the website are used up, so changes are not kept. Saving starts again at ' + dL.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' on ' + dL.toLocaleDateString() + '.'); return; }
      toast('Saving failed. The campaign is not reaching the disk.');
  }
  // [netcheck:saveswitch-start]
  // 1.6.3 (the review of finding 26): the save after a map switch. sidebar.js navigateToMap asked save() so that it would wait the usual half
  // second, but save() sets savePending, and pushHistory reads savePending as "the GM's own edit is waiting on the open item": a player's change
  // to the map just opened, saved by the table within that half second (net.js saveRemoteSoon), was then recorded as a step of the GM's undo and
  // emptied that map's redo list. A switch is no edit, so saveSwitch waits on a timer of its own (switchTimeout) and never sets savePending:
  //   * where the GM's own edit is already waiting (savePending), the switch saves at once, as every switch did before 1.6.3, so that edit is
  //     its own step and the window that pushHistory reads ends now;
  //   * where the map opened has no undo history yet (a map just made: pushHistory seeds a map the first time a pass sees it), at once too, so
  //     the map takes its baseline before anything is laid on it and the GM's first change there is an undo step;
  //   * otherwise the map opened is stamped (as save() stamps it) and the save runs half a second later, save(true) on the timer. Any save()
  //     before then carries the switch and cancels the timer (switchClear, asked by save()), and pagehide writes a switch still waiting, so a
  //     switch made just before the app closes reaches the disk as it did when it saved at once
  var switchTimeout = null;
  function switchClear() { if (switchTimeout) { clearTimeout(switchTimeout); switchTimeout = null; } }
  function saveSwitch() {
      if (window.__wpNoSave) return;   // a snapshot is being restored: nothing is written
      var camp = getActiveCampaign(), map = getActiveMap();
      var seen = !!(camp && map && typeof map.id === 'string' && histories[itemKey(camp, map.id)]);
      if (savePending || !seen) { switchClear(); save(true); return; }
      if (map.meta && typeof map.meta === 'object') map.meta.updated = Date.now();   // the map opened is stamped now, as save() would stamp it
      switchClear();
      switchTimeout = setTimeout(function() { switchTimeout = null; save(true); }, 500);
  }
  if (typeof window.addEventListener === 'function') window.addEventListener('pagehide', function() { if (switchTimeout) { switchClear(); save(true); } });
  // [netcheck:saveswitch-end]

  function save(immediate) {
    if (typeof window !== 'undefined') window.wpSaveN = (window.wpSaveN | 0) + 1;   // 1.6.3: how many changes were saved, a cheap stamp the page panel and the Prep column compare before they work anything out
    if (window.__wpNoSave) return;   // a snapshot is being restored: the in-memory copy must not win

    if (typeof switchClear === 'function') switchClear();   // 1.6.3: a save carries a map switch still waiting (saveSwitch)

    var activeMap = getActiveMap();

    if(activeMap && activeMap.meta && typeof activeMap.meta === 'object') { activeMap.meta.updated = Date.now(); }   // an item from a file may have no meta

    // 1.6.3, the review of 87d9b6e0: a flattened picture's pieces are placed beside it at once, as save() is called, on the machine that owns the
    // campaign: a drag's release, a nudge, a resize or a turn that ends in save() then never leaves its walls where the picture stood while the
    // debounced save below waits, so the host's fog and the table's catch-ups read them where they are drawn. flatFollow is idempotent, so the
    // call before the step is recorded below stays as the net for a change that reached the map some other way
    if (typeof flatFollow === 'function' && activeMap && canPersistLocal()) { try { flatFollow(activeMap); } catch (e) {} }

    saveNote.innerHTML = 'Saving...';

    

    var doSave = function() {

        // Multiplayer: clients don't touch their own disk — edits go to the host. And a campaign
        // that came from a host (wpNet.foreign) never reaches this disk even after the link drops:
        // between reconnect attempts the client is briefly "inactive" but still holds the GM's table.
        if (!canPersistLocal() && !ownWhileWaiting()) {   // (a client waiting for the GM's Allow writes its own campaign to its own disk below)
            if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') {
                window.wpNet.onLocalSave();
                saveNote.innerHTML = 'Synced to host <b>&#10003;</b>';
            } else {
                saveNote.innerHTML = 'GM\'s campaign, not saved here';
            }
            savePending = false;
            return;
        }

        // 1.6.3 (Fulllion's ruling of 2026-11-17 on finding 16, "move with it"): a flattened picture that moved since its last save brings the
        // pieces drawn into it along, keeping their place beside it, before the step is recorded, so one Undo takes the picture and its pieces back
        if (typeof flatFollow === 'function' && activeMap) { try { flatFollow(activeMap); } catch (e) {} }
        pushHistory();   // below the return: a GM's table is never recorded

        var passP = typeof passTake === 'function' ? passTake() : null;   // 1.6.3 (finding 25): the projections this pass made, for the body below
        if (window.wpFog && typeof window.wpFog.memFlush === 'function') { try { window.wpFog.memFlush(true); } catch (e) {} }   // the review of 1.6.3 (finding 13): the players' explored ground still waiting rides on this save, with no quiet save of its own

        savePending = false;   // cleared AFTER the pass: pushHistory reads it (a remote save flushing the GM's own pending edit)

        if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host') {

            window.wpNet.onLocalSave();
            passP = null;   // the table's sync may write into an item after the pass: every item's projection is worked out again for the body and compared

        }

        var docTold = typeof window !== 'undefined' && typeof window.wpDocWatchSnap === 'function' ? window.wpDocWatchSnap() : null;   // 1.6.3 (finding 3): the pages windows of their own watch, as this very save holds them (planner.js docWatchSnap)
        var rawS = fetch('/api/data', {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: typeof saveBody === 'function' ? saveBody(passP) : JSON.stringify(state.appState)   // 1.6.3 (finding 25): the same bytes, from parts that did not change kept as they were

        });
        var answerS = saveAnswer(rawS);   // 1.6.2 backlog 235: taken first, so a copy of the answer is read before the note below reads it
        var sent = rawS

        .then(res => {

            if (res.status === 429) return res.json().then(function(j) { _saveLimit = j && j.error === 'daily-upload' && j.resetsAt > 0 ? j.resetsAt : 0; saveNote.innerHTML = 'Error saving.'; }, function() { _saveLimit = 0; saveNote.innerHTML = 'Error saving.'; });   // 1.6.2: a GM's page on the website whose day of uploads is used up (website 1.0.9)
            _saveLimit = 0;
            if(res.ok) saveNote.innerHTML = 'Saved to disk <b>&#10003;</b>';

            else saveNote.innerHTML = 'Error saving.';
            if (res.ok && docTold) { try { docTold(); } catch (e) {} }   // and each window whose page changed is told, once that save is on disk
            if (res.ok && typeof saveTold === 'function') saveTold();   // 1.6.3 (the multiplayer review, finding 25): the stream window reads the save only once one is written

        })

        .catch(err => saveNote.innerHTML = 'Network error saving.');
        if (sent && typeof sent.then === 'function') { var seqS = ++_saveSeq; sent.then(function() { if (seqS === _saveSeq && typeof saveFailed === 'function') saveFailed(/rror saving/.test(String(saveNote.innerHTML))); }); }   // the newest save's word alone: an older one that answers late says nothing of where the disk stands
        return answerS;

    };

    

    if(immediate) {

        clearTimeout(saveTimeout);

        return doSave();   // 1.6.2 backlog 235: the save's answer, for an import that waits on it (none where nothing is written here)

    } else {

        clearTimeout(saveTimeout);

        saveTimeout = setTimeout(doSave, 500);

        savePending = true;

    }

  }



  // The camera: where a map was last looked at, and how close. It is no change to the campaign. A pan or a zoom used to go through save(): every
  // scroll step stamped the map as changed (meta.updated: the fog then built its walls and its play area again on its next frame, many times a
  // second while the view moved), and half a second after the view came to rest the whole pipeline ran: the undo pass over every item, the
  // table's sync, the file. saveView stamps nothing, records nothing and tells no one. The view reaches the disk with the next real save, or by
  // itself a moment after it comes to rest, on a machine that owns this save; a player's app, the stream window and a pop-out write nothing.
  var viewTimeout;
  // 1.6.3 (the multiplayer review, finding 25): every save this machine writes says so on the app's own channel ('save-done'), which the stream
  // window reads in place of reading the whole save every second. The channel is made at the first save (declared with no value: a module io.js
  // imports may call into io.js before its top level has run). Nothing of the save travels: only that one was written
  var _saveChan;
  function saveTold() {
    try { if (!_saveChan && typeof BroadcastChannel === 'function') _saveChan = new BroadcastChannel('waypoint'); if (_saveChan) _saveChan.postMessage({ type: 'save-done' }); } catch (e) {}
  }

  function saveView() {
    clearTimeout(viewTimeout);
    if (!canPersistLocal()) return;
    viewTimeout = setTimeout(function() {
        if (savePending || !canPersistLocal()) return;   // a real save is on its way and carries the view; or the table changed hands meanwhile
        fetch('/api/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: typeof saveBody === 'function' ? saveBody(null) : JSON.stringify(state.appState) }).then(function(r) { if (r && r.ok && typeof saveTold === 'function') saveTold(); }, function() {});   // 1.6.3 (finding 25): the same bytes, its unchanged items' parts kept
    }, 2000);
  }

  /* ---------- mode toggling ---------- */

  var _segBtns = modeSelect ? Array.prototype.slice.call(modeSelect.querySelectorAll('.seg-btn')) : [];

  // [lookcheck:opens-start]
  // Which view a map opens on (1.6.2, backlog 221; the owner, 2026-11-12, by prompt: "B. Campaign, and each map (Recommended)"). A map's own
  // choice (meta.opensOn: 'visual' the Play Map, 'data' the Data Map, 'last' as last left) wins, else the campaign's (camp.opensOn: 'visual'
  // or 'data'), else as last left, which is how maps behaved before. Both are read only here and are the GM's own: net.js keeps them off the wire.
  function opensOf(camp, map) {
      var m = map && map.meta && typeof map.meta === 'object' ? map.meta.opensOn : null;
      if (m === 'visual' || m === 'data' || m === 'last') return m;
      var c = camp && typeof camp === 'object' ? camp.opensOn : null;
      return c === 'visual' || c === 'data' ? c : 'last';
  }
  var _opensNext = null;   // a view a caller names for the next map opened, over every choice (the generators land on the Play Map they laid)
  function opensNext(v) { _opensNext = v === 'visual' || v === 'data' ? v : null; }
  function opensTake() { var v = _opensNext; _opensNext = null; return v; }
  // [lookcheck:opens-end]
  window.wpOpensOf = opensOf; window.wpOpensNext = opensNext;
  // A map remembers which view it was last shown in; applied whenever that map becomes active
  function applyRememberedView() {
      var named = arguments[0];   // 'named': only a view the map or the campaign names (a campaign switch, a map just made), never the one it was last left in
      var am = getActiveMap();
      if (!am || am.type !== 'map' || !am.meta) return;
      var v = am.meta.lastView;
      var o = 'last', again = false;
      if (typeof opensOf === 'function' && !(window.wpNet && window.wpNet.role === 'client')) { var nx = opensTake(); again = !nx && state.viewMapId === am.id; o = nx || opensOf(getActiveCampaign(), am); }   // a player's app as before; asked through typeof, since a suite runs this function alone. The map on screen is the one render() last drew (main.js viewMapId), whatever path opened it
      if (o === 'last' && named === 'named') return;
      if (o !== 'last') { if (again) return; v = o; }   // backlog 221: a view the map or the campaign names, each time the map is opened
      if (v !== 'data' && v !== 'visual' && (state.viewMode === 'data' || state.viewMode === 'visual') && !(window.wpNet && window.wpNet.role === 'client')) { am.meta.lastView = state.viewMode; return; }   // 1.6.0, found by hand: a map reached in Play and never switched had no view to come back to after a reload
      if ((v === 'data' || v === 'visual') && state.viewMode !== v) {
          state.viewMode = v;
          _segBtns.forEach(function(b){ b.classList.toggle('active', b.dataset.mode === v); });
      }
  }
  window.wpApplyRememberedView = applyRememberedView;
  window.wpSetViewMode = function(m) { setViewMode(m); };
  window.wpViewButtons = function() { _segBtns.forEach(function(b){ b.classList.toggle('active', b.dataset.mode === state.viewMode); }); };   // 1.6.2 (backlog 45, fold 4): a caller that set the view with a landing room shows it   // 1.6.2 (backlog 45, fold 3): Show on the play map, Show on the Data Map
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
      var picked = ids.map(function(id) { return m.whiteboard.find(function(x) { return x.id === id; }); }).filter(function(x) { return x && !x.waiting; }).map(clone);   // Onboarding F1a: a waiting token is never copied
      // 1.6.3, the review of 87d9b6e0: a flattened picture is copied with the pieces drawn into it (flatten.js flatKids), so that a paste of it
      // holds them too, its walls among them; pasteWbClipboard names them again for the copy of the picture (flatRemap)
      var kids = typeof flatKids === 'function' ? flatKids(m.whiteboard, picked).map(clone) : [];
      if (cut) {
          // Cut takes what is picked as Delete does (delask.js delWb): it asks where Delete asks (a locked piece, a token, a flattened picture's
          // pieces), takes a waiting token away for the session (Onboarding F1a), and never strands what is drawn into a flattened picture. The
          // clipboard is filled once the pieces have gone, and holds the pieces drawn into a picture only where they went with it (Delete them
          // too); where they were put back, the picture is pasted as a plain picture. Nothing is cut, and the clipboard is as it was, on Cancel
          delWb(m, ids.slice(), showConfirm, function(out, how) {
              wbClipboard = how === 'all' ? picked.concat(kids) : picked;
              wbPasteCount = 0;
              state.selWbIds = []; state.selWbId = null;
              save(); render();
              toast('Cut ' + picked.length + ' item(s).' + (out && out.back ? delSaid(out).slice('Deleted.'.length) : ''));
          }, getActiveMap);
          return true;
      }
      wbClipboard = picked.concat(kids);
      wbPasteCount = 0;
      toast('Copied ' + picked.length + ' item(s).');
      return true;
  }

  function pasteWbClipboard() {
      var m = getActiveMap();
      if (!m || m.type !== 'map' || !wbClipboard || !wbClipboard.length) return false;
      wbPasteCount++;
      var off = 25 * wbPasteCount;
      var gidMap = {}, newIds = [], pairs = [];
      wbClipboard.forEach(function(src) {
          var it = clone(src);
          it.id = 'wb' + uid() + Math.random().toString(36).slice(2, 5);
          delete it.ownerId; delete it.charId;   // pasted tokens are new creatures
          if (it.box !== undefined) { if (window.wpBoxes && window.wpBoxes.copyFor) window.wpBoxes.copyFor(it); else delete it.box; }   // 1.6.2 (backlog 42): a pasted container holds a copy of its own
          if (it.groupId) {
              if (!gidMap[it.groupId]) gidMap[it.groupId] = 'group_' + Date.now() + Math.random().toString(36).slice(2, 6);
              it.groupId = gidMap[it.groupId];
          }
          it.x += off; it.y += off;
          if (window.wpSeatHex) window.wpSeatHex(it, m);   // pasted tokens land in a cell, not beside one
          m.whiteboard.push(it);
          pairs.push({ old: src.id, it: it });
      });
      // 1.6.3, the review of 87d9b6e0: the copies of a flattened picture and of the pieces drawn into it name each other (flatten.js flatRemap),
      // never the picture they were copied from; a piece whose picture was not copied gets its own look back, and a picture whose pieces were
      // not copied is a plain picture. The pieces drawn into a pasted picture stay out of sight, so they are not picked
      var kidsP = typeof flatRemap === 'function' ? flatRemap(pairs) : {};
      pairs.forEach(function(p) { if (kidsP[p.it.id] !== 1) newIds.push(p.it.id); });
      state.selWbIds = newIds; state.selWbId = newIds[0] || null;
      save(); render();
      toast('Pasted ' + newIds.length + ' item(s).');
      return true;
  }

  // 1.6.2, backlog 202: the selection moved one step, by a key (the handler below) or a controller (gamepad.js, through wpNudge). shift: bigger
  // steps, or the other diagonal on a hex map. Answers whether anything moved
  function nudgeSel(mvDir, shift) {
      var m2 = getActiveMap();
      if (!m2 || m2.type !== 'map') return false;
      var step = shift ? 10 : 1;
      var dx = mvDir[0] * step, dy = mvDir[1] * step;
      if (state.viewMode === 'visual') {
          var ids2 = selectedWbIds(), sent = [];
          if (!ids2.length) return false;
              ids2.forEach(function(id) {
                  var it = m2.whiteboard.find(function(x) { return x.id === id; });
                  if (!it || it.locked) return;
                  var snapN = window.wpSnapOn ? window.wpSnapOn() : !!state.snap;   // the snap rule: with Snap on a token hops cell to cell, off it moves by pixels like anything else
                  var hexToken = snapN && state.gridType === 'hex' && (it.isChar || it.type === 'hexagon' || it.shape === 'hexagon');
                  if (hexToken) {
                      // On a hex grid a token hops cell to cell: ↑/↓ one row, ←/→ one
                      // column along the diagonal (Shift takes the other diagonal)
                      var NH = (typeof window !== 'undefined' && window.wpLatticeOf ? window.wpLatticeOf(m2) : null), nh = NH && NH.type === 'hex' ? NH.h : 52, ns = NH && NH.type === 'hex' ? NH.s : 30;   // the map's own cell (backlog 38)
                      if (dy) { it.y += Math.sign(dy) * nh; }
                      else { it.x += Math.sign(dx) * 1.5 * ns; it.y += (shift ? -1 : 1) * Math.sign(dx) * -nh / 2; }
                      if (window.wpSeatHex) window.wpSeatHex(it, m2);
                  } else if (snapN && (it.isChar || it.waiting) && window.wpSeatDrop) {   // a square grid or a map with no grid: one cell (one dot) at a time
                      var NQ = (typeof window !== 'undefined' && window.wpLatticeOf ? window.wpLatticeOf(m2) : null), nq = NQ && NQ.type === 'square' ? NQ.size : 50;
                      it.x += Math.sign(dx) * nq; it.y += Math.sign(dy) * nq;
                      window.wpSeatDrop(it, m2);
                  } else { it.x += dx; it.y += dy; }
                  sent.push(it);
              });
          // 1.6.3, the review of 87d9b6e0: a flattened picture's pieces are placed beside it before any move is told to the table, so the host
          // judges a token's new place against the walls where they are drawn (flatten.js flatFollow; only on the machine that owns the campaign)
          if (typeof flatFollow === 'function' && canPersistLocal()) { try { flatFollow(m2); } catch (e) {} }
          sent.forEach(function(it) { if (window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(it, true); });
          save(); render(); return true;
      } else if (state.viewMode === 'data' && state.selId) {
          var room = m2.rooms.find(function(r) { return r.id === state.selId; });
          if (room) { room.x += dx; room.y += dy; save(); render(); return true; }
      }
      return false;
  }
  window.wpNudge = function(dir, shift) { return Array.isArray(dir) && dir.length === 2 && canPersistLocal() ? nudgeSel(dir, shift === true) : false; };
  // [cleanupcheck:mapchord-start]
  // 1.6.3 (Fulllion: "ctrl z should undo, ctrl y should redo"): Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z undo and redo the map wherever the user is,
  // unless the focus is in a field the user is typing in, which keeps its own undo while it has typing to take back. Three things kept the
  // chord from the map before. The board keeps a click from moving the focus (datamap.js stops a press's default), so the focus stayed on the
  // last control used in Properties, a tool's options or a sheet. The key handler below then took ANY input, select or checkbox for typing and
  // handed the chord to that field, which had nothing of its own to undo. And the floating boxes (the sheet, a HUD, Effects, Table Chat) stop
  // every key at themselves, so the handler never heard it while the focus was in one of them.
  // Now a field holds the chord only while it has typing of its own: text typed into it since it got the focus and since the last press on
  // the map (_wpTypedHere, kept by the three listeners below). A select, a checkbox, a range, a color, a button and a box nobody typed in hand
  // the chord to the map's history, as a planner field with nothing of its own to undo hands it to the planner's (fieldUndoChord).

  // 'undo' for Ctrl+Z, 'redo' for Ctrl+Y and Ctrl+Shift+Z (the command key for Ctrl on a Mac), else null
  function chordDirOf(e) {
      if (!e || !(e.ctrlKey || e.metaKey) || e.altKey) return null;
      var k = String(e.key || '').toLowerCase();
      return (k === 'z' && !e.shiftKey) ? 'undo' : (k === 'y' || (k === 'z' && e.shiftKey)) ? 'redo' : null;
  }

  // Whether a field has typing of its own to take back: a text box or a text area the user typed in since it got the focus. A box of any
  // other kind (a checkbox, a range, a color, a button) has no text undo, whatever was done to it
  function fieldHolds(t) {
      if (!t || t._wpTypedHere !== true) return false;
      if (t.tagName === 'TEXTAREA') return true;
      return t.tagName === 'INPUT' && !/^(checkbox|radio|button|submit|reset|color|range|file|image|hidden)$/i.test(t.type || 'text');
  }

  // Whether the chord on the focused element t goes to the map's history (true) or stays where it is (false). It stays in a planner's field,
  // which fieldUndoChord judges, and in a box of styled text (contentEditable), whose host or editor keeps steps of its own. A field with
  // typing of its own lets the browser try first; where the browser's undo has nothing left there (no 'input' follows: the chunks listener
  // above clears nativeProbe when one does) the map's history takes the press a moment later, and the field is spent, as in fieldUndoChord
  function chordToMap(e, t) {
      var dir = chordDirOf(e);
      if (!dir || !t || t.nodeType !== 1) return false;
      if (typeof t.closest === 'function' && t.closest('#plannerBlocks')) return false;
      // a field of a window that covers the map (Settings, the Library, the Calendar, a generator's dialog: every such window's id ends in
      // Modal) keeps the chord as before, so a Ctrl+Z there never takes back a step of the map out of sight behind it (the review of 2026-11-22)
      if (typeof t.closest === 'function' && t.closest('[id$="Modal"]')) return false;
      if (t.isContentEditable) return false;
      if (fieldHolds(t)) {
          nativeProbe = t;
          setTimeout(function() { if (nativeProbe !== t) return; nativeProbe = null; if (dir === 'undo') t._wpTypedHere = false; if (!askHeld()) stepHistory(dir); }, 0);
          return false;
      }
      return true;
  }

  // The floating box (floats.js) that holds t, if any
  function chordBoxOf(t) {
      var F = typeof window !== 'undefined' && window.wpFloats && typeof window.wpFloats.boxes === 'function' ? window.wpFloats.boxes() : [];
      for (var i = 0; i < F.length; i++) if (F[i] && typeof F[i].contains === 'function' && F[i].contains(t)) return F[i];
      return null;
  }

  // Typing marks a text field, by an input that puts text in or takes it out (never a change a script makes, which names no inputType)
  document.addEventListener('input', function(e) { var t = e.target; if (t && t.nodeType === 1 && /^(insert|delete)/.test(String(e.inputType || ''))) t._wpTypedHere = true; }, true);
  // a field that gets the focus has typed nothing yet, but for the very field that had it last: the focus coming back to it as the window
  // comes back from another program (the review of 2026-11-22) keeps its typing, which the browser can still take back
  var chordLastFocus = null;
  document.addEventListener('focusin', function(e) { var t = e.target; if (t && t.nodeType === 1) { if (t !== chordLastFocus) t._wpTypedHere = false; chordLastFocus = t; } }, true);
  // a press on the play map or the Data Map means the user is back on the map, so the field that still holds the focus is no longer typed in
  // Whether the user's last press was on the map, rather than in a floating box (the review of 2026-11-22: with the focus left in a sheet, a
  // Ctrl+Z meant for the sheet's own last change moved a token back instead). A press on the map sets it; a press, or any key but the chord
  // itself, inside a floating box clears it. The floating boxes' capture listener below acts only while it is true
  var chordOnMap = false;
  document.addEventListener('pointerdown', function(e) {
      var t = e.target;
      if (t && typeof t.closest === 'function' && t.closest('#whiteboardWrap, #canvasWrap')) chordOnMap = true;
      else if (t && t.nodeType === 1 && chordBoxOf(t)) chordOnMap = false;
  }, true);
  document.addEventListener('keydown', function(e) { if (!chordDirOf(e) && e.target && e.target.nodeType === 1 && chordBoxOf(e.target)) chordOnMap = false; }, true);
  document.addEventListener('pointerdown', function(e) {
      var t = e.target, ae = document.activeElement;
      if (!ae || ae._wpTypedHere !== true || !t || typeof t.closest !== 'function' || !t.closest('#whiteboardWrap, #canvasWrap')) return;
      if (typeof ae.contains === 'function' && ae.contains(t)) return;   // a press inside the very box being typed in (a text box on the map)
      ae._wpTypedHere = false;
  }, true);

  // The floating boxes stop every key at themselves, so the chord is taken here, in the capture phase, before their listeners hear it. Only
  // for a target inside one of them: everywhere else the key handler below judges it as it always did, and the windows with an undo of their
  // own (the System editor, the paint window) keep it. The same guards as the handler's: never while the layout is edited or a question or a
  // prompt is up, never on a window that may not write. And only after a press on the map since the user last pressed or typed in a box
  // (chordOnMap): a Ctrl+Z pressed while working in the sheet stays the sheet's, which keeps its own Revert, and does nothing to the map
  document.addEventListener('keydown', function(e) {
      var t = e.target, dir = chordDirOf(e);
      if (!dir || !chordBoxOf(t) || !chordOnMap) return;
      if (typeof winHeld === 'function' && winHeld(document)) return;   // a window of the app's up over the map holds the chord too (the click test's rule)
      if (document.body && document.body.classList.contains('lay-edit')) return;
      if (askHeld()) return;
      if (!chordToMap(e, t) || !canPersistLocal()) return;
      e.preventDefault(); e.stopPropagation();
      stepHistory(dir);
  }, true);
  // [cleanupcheck:mapchord-end]
  // [cleanupcheck:mapkeys-start]
  document.addEventListener('keydown', function(e) {

      var t = e.target;

      if (document.body && document.body.classList.contains('lay-edit')) return;   // 1.6.2 (backlog 224): while the layout is edited no key moves, deletes, copies or undoes anything of the map
      if (askHeld()) return;   // 1.6.2 (the review of a new room's map): while the app's own question or prompt is up no key moves, deletes or undoes what stands behind it

      var typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);

      // a planner field with nothing of its own to undo hands the chord to the planner's history (fieldUndoChord); any other field with nothing
      // of its own to undo hands it to the map's (chordToMap, 1.6.3), and the chord goes on to the undo and redo below
      if (typing && (fieldUndoChord(e) || !chordToMap(e, t))) return;

      if (winHeld(document)) return;   // 1.6.3 (the release click test): a window of the app's is up, so no key moves, deletes, copies or undoes the map behind it

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

      if (menuHeld(t)) return;   // 1.6.2: the arrows, Delete and Backspace are a menu's own while it holds the focus

      // Arrow keys nudge the selection (Shift = 10px steps)
      var ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };

      var mvDir = typeof window.wpMoveDir === 'function' ? window.wpMoveDir(e) : ARROWS[e.key];   // 1.6.2, backlog 202: the keys the four moves have now (commands.js), the arrows at first
      if (mvDir) { if (nudgeSel(mvDir, e.shiftKey)) e.preventDefault(); return; }

      // [cleanupcheck:bksp-start]
      // 1.5.6 (the sweep of 2026-10-17, seen live): Backspace deletes nothing while a button or a link has the focus. Shift+Tab out of
      // Properties' first field lands on the selection toolbar's trash button, and the Backspace that kept on correcting a typo deleted the
      // piece. Delete still deletes, wherever the focus is
      if (e.key === 'Backspace' && bkspHeld(document.activeElement)) return;
      // [cleanupcheck:bksp-end]
      if (e.key === 'Delete' || e.key === 'Backspace') {

          var m = getActiveMap();

          if (!m || m.type === 'planner') return;

          if (state.viewMode === 'visual') {

              var ids = (state.selWbIds && state.selWbIds.length) ? state.selWbIds : (state.selWbId ? [state.selWbId] : []);

              if (!ids.length) return;

              e.preventDefault();

              // 1.6.3 (findings 15 and 16): delask.js asks first where the selection holds a locked piece, a token or a flattened picture's pieces,
              // and takes everything picked on a yes (a waiting token that goes stays away this session, Onboarding F1a). A plain piece goes at once
              delWb(m, ids.slice(), showConfirm, function(out) { state.selWbIds = []; state.selWbId = null; save(); render(); toast(delSaid(out)); }, getActiveMap);

          } else if (state.viewMode === 'data' && state.selLink != null && m.links && m.links[state.selLink]) {
              m.links.splice(state.selLink, 1); state.selLink = null;
              save(); render(); toast('Link removed.');
              e.preventDefault();
          } else if (state.viewMode === 'data' && state.selId) {

              e.preventDefault();

              // 1.6.3 (finding 15): a room takes its links with it, so the Data Map asks first (delask.js)
              var roomId = state.selId;
              delRooms(m, [roomId], showConfirm, function() { if (state.selId === roomId) state.selId = null; save(); render(); toast('Room deleted.'); }, getActiveMap);

          }

      }

  });
  // [cleanupcheck:mapkeys-end]



  // Track the cursor in whiteboard world coordinates so pasted images land
  // where the mouse is (falls back to the viewport center).
  var wbMouse = null;

  if (wbWrap) wbWrap.addEventListener('pointermove', function(e) {
      var r = wbWrap.getBoundingClientRect();
      var z = state.zoomLevel || 1;
      wbMouse = window.wpView && window.wpView.pointAt ? window.wpView.pointAt(wbWrap, e.clientX - r.left, e.clientY - r.top) : { x: (wbWrap.scrollLeft + e.clientX - r.left) / z, y: (wbWrap.scrollTop + e.clientY - r.top) / z };   // 1.6.3 (the review, finding 7): the board point under the pointer on a turned view too
  });

  document.addEventListener('paste', function(e) {

      var t = e.target;

      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;

      // 1.6.3 (the review of the release click test): a window of the app's up over the map holds a paste too, as it holds every key. A click on a
      // blank part of the System editor or the Library gives the window the focus, so Ctrl+V's paste reached here with the window as its target,
      // and the pieces copied earlier, or a picture on the clipboard, were laid on the map behind the window and saved
      if (winHeld(document)) return;

      if (!canPersistLocal()) return;

      if (state.viewMode !== 'visual') return;

      var m = getActiveMap();

      if (!m || m.type !== 'map') return;

      var items = (e.clipboardData && e.clipboardData.items) ? Array.prototype.slice.call(e.clipboardData.items) : [];

      var imgItem = items.find(function(i) { return i.type && i.type.indexOf('image/') === 0; });

      if (imgItem && window.wpUploadImage) {

          e.preventDefault();

          var f = imgItem.getAsFile();

          var pos = wbMouse || (window.wpView && window.wpView.pointAt ? window.wpView.pointAt(wbWrap, wbWrap.clientWidth / 2, wbWrap.clientHeight / 2) : null) || {   // 1.6.3 (the review, finding 7)
              x: (wbWrap.scrollLeft + wbWrap.clientWidth / 2) / (state.zoomLevel || 1),
              y: (wbWrap.scrollTop + wbWrap.clientHeight / 2) / (state.zoomLevel || 1)
          };

          window.wpUploadImage(f, Math.round(pos.x - 150), Math.round(pos.y - 150));

          return;

      }

      if (pasteWbClipboard()) e.preventDefault();

  });

  // A text file handed to the browser as a download (savefile.js downloadNow), with the words it always said: exportScope's way where the
  // window has no save dialog
  function download(name, text){
    if (downloadNow(name, new Blob([text],{type:'application/json'}))) toast('Exported '+name);
    else toast('Export blocked here.');
  }

  

  /* ---------- scoped JSON/zip exports ----------
     Every scope produces a valid merge file ({activeCampaignId, campaigns})
     so anything exported here round-trips through Import → Merge. Exports
     that reference images become a .zip bundling data.json + the images. */

  // Hands a file to the browser as a download (savefile.js downloadNow, the one rule, which keeps a large archive's address while it is still
  // being written). It says a failure itself ('Export failed.') and answers false then, true once the file was handed over. exportScope asks
  // it where no save dialog was had
  function downloadBlob(name, blob) {
      if (downloadNow(name, blob)) return true;
      toast('Export failed.'); return false;
  }

  function slugName(s) {
      return String(s || 'export').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'export';
  }

  // Scan the serialized payload for /saves/images/ references (room images,
  // portraits, whiteboard images, and <img> tags embedded in text HTML).
  function collectImagePaths(payload) {
      var found = {};
      JSON.stringify(payload).replace(/\/saves\/images\/[^"\\]+/g, function(m) {
          var p = m.replace(/['")>,;]+$/, '');
          if (exportPathOk(p)) found[p] = 1;
          return m;
      });
      return Object.keys(found);
  }
  // Is this string a file to bundle? Any text in a campaign can hold "/saves/images/…" (a player's name is enough), and the export fetches
  // what it names — so only a plain path under saves/images counts: no segment that walks or is empty (the browser collapses dot segments:
  // "/saves/images/../data.json" would fetch the save itself, with every table key), no query, fragment, drive or stream, and nothing in a
  // player's Journal (images/journal/, in any spelling the disk reads as it), which no export carries
  function exportPathOk(p) {
      if (typeof p !== 'string' || p.indexOf('/saves/images/') !== 0 || /[\\:?#\x00-\x1f]/.test(p)) return false;
      var segs = p.slice(14).split('/');
      if (segs.some(function(s) { return s === '' || /^[. ]+$/.test(s); })) return false;
      return !/^journal[. ]*$/i.test(segs[0]);
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
  function exportMediaBytes(scope, leave) {
      if (scope !== 'campaign' && scope !== 'all') return 0;
      var camps = scope === 'all' ? Object.values((state.appState && state.appState.campaigns) || {}) : [getActiveCampaign()], n = 0;
      var add = function(v) { if (v && typeof v.size === 'number' && isFinite(v.size) && v.size > 0) n += v.size; };
      var out = function(k) { return Array.isArray(leave) && leave.indexOf(k) >= 0; };   // the share sheet's kinds left out (1.6.0 backlog 34)
      camps.forEach(function(c) {
          if (!out('videos')) (c && Array.isArray(c.videos) ? c.videos : []).forEach(add);
          if (!out('music')) (c && c.music && typeof c.music === 'object' && Array.isArray(c.music.tracks) ? c.music.tracks : []).forEach(add);
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
  // 1.6.3 (the release click test): a count said in real words, "1 picture" and "3 pictures", never "image(s)"
  function exportCount(n, one, many) { return n + ' ' + (n === 1 ? one : many); }
  function exportDoneWords(r) { return 'Exported ' + r.name + ' (' + exportCount(r.images, 'picture', 'pictures') + (r.videos ? ', ' + exportCount(r.videos, 'video', 'videos') : '') + (r.missing ? ', ' + r.missing + ' missing' : '') + ').' + exportLeftWords(r); }
  // ... and what could not be read at all: a library pack the campaign pins, or the list of the campaign's pictures that no map uses yet
  function exportLeftWords(r) {
      var n = r && r.libMissing > 0 ? Math.floor(r.libMissing) : 0;
      return (n === 1 ? ' One library pack could not be read and was left out.' : n > 1 ? ' ' + n + ' library packs could not be read and were left out.' : '') + (r && r.unlisted === true ? ' The pictures no map uses yet could not be listed and were left out.' : '');
  }
  // What becomes of the picked file when a large export fails. An unfinished file is aborted: nothing reached the file you picked. A finished
  // one found wrong is taken away again. One that was never opened for writing is left as it was: the export wrote none of it, and it may be
  // last week's export (the owed review, 2026-10-09: it was removed). Answers whether a file that is not to be trusted was left behind
  async function exportFailTidy(handle, w, closed) {
      if (w) { try { await w.abort(); } catch (e2) {} return false; }
      if (!closed) return false;
      if (handle && typeof handle.remove === 'function') { try { await handle.remove(); return false; } catch (e3) { return true; } }
      return true;
  }
  // [zipcheck:exportfile-end]

  // A campaign file that leaves this machine carries the players' names and history, never their table keys
  // (the secret each player proves their identity with at THIS table — a file handed to another GM must not carry it).
  function stripTableKeys(payload) {
      Object.values((payload && payload.campaigns) || {}).forEach(function(c) { if (c && c.players && typeof c.players === 'object') Object.keys(c.players).forEach(function(pid) { var p = c.players[pid]; if (p && typeof p === 'object') delete p.key; }); });
      return payload;
  }
  // A campaign's own pictures travel even when nothing references them yet: those the saves folder lists in the folder of one of its items
  // (every folder but the Journal's, for everything) are added to paths. sizes (optional) takes each listed picture's size by its path (the
  // share sheet's count). Answers false when the list could not be read
  async function exportListed(scope, payload, paths, sizes) {
      try {
          var listed = await (await fetch('/api/list-images')).json();
          var own = {}; Object.values(payload.campaigns || {}).forEach(function(c) { Object.keys(c.items || {}).forEach(function(id) { own[id] = 1; }); });
          (Array.isArray(listed) ? listed : []).forEach(function(im) {
              if (!im || !im.path) return;
              if (sizes && typeof im.size === 'number' && isFinite(im.size)) sizes[im.path] = im.size;
              if (!/^journal(\/|$)/.test(im.folder || '') && (scope === 'all' || own[im.folder]) && paths.indexOf(im.path) < 0) paths.push(im.path);
          });
          return true;
      } catch (e) { return false; }
  }
  // 1.6.0 backlog 34: what Export this campaign or Export everything would carry, for the share sheet (share.js) to count before anything is
  // written: the payload as the export makes it, the files it names with the campaign's own pictures, and each listed picture's size
  async function exportPlan(scope) {
      if (!canPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return null; }
      var camp = getActiveCampaign();
      if (!camp) { toast('No campaign selected.'); return null; }
      if (scope !== 'campaign' && scope !== 'all') return null;
      var cc = {}; cc[camp.id] = clone(camp);
      var payload = scope === 'all' ? stripTableKeys(clone(state.appState)) : stripTableKeys({ activeCampaignId: camp.id, campaigns: cc });
      Object.values(payload.campaigns || {}).forEach(function(c) { if (c) dropWaiting(c); });
      var paths = collectImagePaths(payload), sizes = {};
      var ok = await exportListed(scope, payload, paths, sizes);
      return { payload: payload, paths: paths, sizes: sizes, unlisted: !ok, campId: camp.id, name: scope === 'all' ? '' : String(camp.name || ''), camps: Object.keys(payload.campaigns || {}).length };
  }
  window.wpExportPlan = exportPlan;
  // What an export of this scope holds, made at once with nothing waited for (1.6.4): exportScope asks it at the press, so that it knows
  // whether the file will be a .json or a .zip before the save dialog opens, and hands it to buildExport, which asks it itself where it was
  // handed none. share (optional, 1.6.0 backlog 34): the share sheet's { card, cover, leave, sizes }: the kinds it leaves out go before
  // anything is counted. Answers { camp, payload, base, shareSets }, { say: the words for why there is nothing to export }, or null for a
  // scope that is none. It says nothing itself: buildExport says the words
  function exportPayload(scope, share) {
      if (!canPersistLocal()) return { say: 'Not while you\'re at someone else\'s table.' };
      var camp = getActiveCampaign();
      if (!camp) return { say: 'No campaign selected.' };
      function mergeShell(items) {
          var c = {}; c[camp.id] = { id: camp.id, name: camp.name, items: items };
          var bxS = window.wpBoxCore && window.wpBoxCore.boxesOf ? window.wpBoxCore.boxesOf(camp.boxes, items) : null; if (bxS && Object.keys(bxS).length) c[camp.id].boxes = bxS;   // 1.6.2 (backlog 42): what its containers hold comes with them
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
          if (!it) return { say: 'Nothing is open.' };
          var one = {}; one[it.id] = clone(it);
          payload = mergeShell(one);
          base = slugName(it.meta && it.meta.title);
      } else if (scope === 'maps' || scope === 'planners' || scope === 'docs') {
          var t = scope === 'maps' ? 'map' : scope === 'planners' ? 'planner' : 'doc';
          var items = {};
          Object.values(camp.items).forEach(function(i) { if (i.type === t) items[i.id] = clone(i); });
          if (!Object.keys(items).length) return { say: 'This campaign has no ' + (scope === 'docs' ? 'handbook pages' : scope) + '.' };
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
          if (!Object.keys(wbs).length) return { say: 'This campaign has no play maps.' };
          payload = mergeShell(wbs);
          base = slugName(camp.name) + '-whiteboards';
      } else return null;

      // Bookkeeping keys never travel: the origin marker and the cleanup's own notes
      delete payload._foreign; delete payload._keptByUser; delete payload._cleanup;
      Object.values(payload.campaigns || {}).forEach(function(c) { delete c._foreign; delete c._keptByUser; delete c._cleanup; dropWaiting(c); });   // Onboarding F1a: nor a waiting token
      var shareSets = null;   // the files each list named before a kind was left out: a file of a kind left out stays out, wherever else it is named
      if (share && share.leave) { shareSets = Share.fileSets(payload); Share.leaveOut(payload, share.leave); }
      // the review of backlog 227: a Full export is made to hand to someone else, and a private mark stays on this computer (Help says so):
      // the private tags and their marks, and which pictures wore them, leave data.json (sharecore stripPrivate). A backup export keeps them
      if (share && share.full === true && typeof Share.stripPrivate === 'function') Share.stripPrivate(payload, [state.appState && state.appState.imageCats]);
      if (share && typeof Share.stripTable === 'function') Share.stripTable(payload);   // the review of 1.6.3 (finding 13): the players' explored ground is this table's, never in a share or a Full export (sharecore stripTable)
      return { camp: camp, payload: payload, base: base, shareSets: shareSets };
  }
  // handle (optional): a file to write the archive straight to (exportScope hands one when a .zip's file was picked in the save dialog); without
  // it the archive is a Blob, as ever. share (optional, 1.6.0 backlog 34): the share sheet's { card, cover, leave, sizes }: its card is written
  // as share.json beside data.json. A sheet left as it came hands none. pre (optional, 1.6.4): what exportPayload made at the press
  async function buildExport(scope, handle, share, pre) {
      var pl = pre || exportPayload(scope, share);
      if (!pl) return null;
      if (pl.say) { toast(pl.say); return null; }
      var payload = pl.payload, base = pl.base, shareSets = pl.shareSets;

      var json = JSON.stringify(payload, null, 2);
      var libMissing = 0, unlisted = false;   // what could not be read is said at the end, never passed over (the owed review, 2026-10-09)
      var paths = collectImagePaths(payload);   // item 21: a campaign's videos travel too — the archive is made of the files as they lie on disk, of any size (zip.js)
      if (scope === 'campaign' || scope === 'all') {   // a campaign's own pictures travel even when nothing references them yet
          if (!(await exportListed(scope, payload, paths))) unlisted = true;
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
                  try { var lr = await fetch('/api/library?dir=' + encodeURIComponent(lm.dir) + '&pack=' + encodeURIComponent(pk.id) + '&rev=' + pk.rev); if (lr.ok) libFiles.push({ name: 'library/' + lm.dir + '/' + pk.id + '.' + pk.rev + '.json', data: new Uint8Array(await lr.arrayBuffer()) }); else libMissing++; } catch (e) { libMissing++; }
              }
          }
      }
      // the share sheet's card (1.6.0 backlog 34): its cover is one of the campaign's pictures and always comes along, even with Pictures left out;
      // the contents it counts are the file's as it is made. A file with a card is always a .zip
      var shareCover = share && typeof share.cover === 'string' && exportPathOk(share.cover) && Share.coverName(share.cover.replace(/^\/saves\//, '')) ? share.cover : '';
      if (shareSets) paths = Share.keepPaths(paths, share.leave, shareSets, shareCover, share.pics);   // 1.6.2 (backlog 227): and the single pictures the sheet left out
      else if (shareCover && paths.indexOf(shareCover) < 0) paths.push(shareCover);
      // 1.6.2 (backlog 227): a picture left out keeps its path everywhere it is used, and the card names those places (share.json leftPics)
      var shareNamed = shareSets ? collectImagePaths(payload) : [], shareLeftPics = shareNamed.filter(function(p) { return Share.kindOf(p, shareSets) === 'pictures' && paths.indexOf(p) < 0; });
      var shareE = null;
      if (share && share.card) {
          var shareCard = Share.cardFor(Object.assign({}, share.card, { cover: shareCover.replace(/^\/saves\//, ''), leave: share.leave, leftPics: shareLeftPics }), Share.tally(payload, paths, share.sizes), scope === 'all' ? 'all' : 'campaign');
          if (shareCard) shareE = { name: 'share.json', data: new TextEncoder().encode(JSON.stringify(shareCard, null, 2)) };
      }
      if (!paths.length && !libFiles.length && !handle && !shareE) return { name: base + '.json', text: json, libMissing: libMissing, unlisted: unlisted };

      var isVideo = function(p) { return p.indexOf('/saves/images/video/') === 0; };
      var nVid = paths.filter(isVideo).length, nImg = paths.length - nVid;
      toast('Bundling ' + exportCount(nImg, 'picture', 'pictures') + (nVid ? ', ' + exportCount(nVid, 'video', 'videos') : '') + (libFiles.length ? ' and ' + exportCount(libFiles.length, 'library pack', 'library packs') : '') + '\u2026');
      var zip = await import('./zip.js');
      var enc = new TextEncoder();
      var entries = [{ name: 'data.json', data: enc.encode(json) }].concat(libFiles);
      if (shareE) entries.splice(1, 0, shareE);   // share.json right after data.json
      var skipped = [], vidAt = 0;
      if (handle) {
          // straight to the file: each entry is read part by part and written as it comes (never held whole), its checksum written back
          // into its header; then the file is opened again and every entry checked against its checksum before the export is called done
          var total = 0, done = 0, lastSaid = 0;
          var say = function(n) { done += n; var now = Date.now(); if (now - lastSaid < 1000) return; lastSaid = now; toast('Writing the export' + (total ? ' ' + Math.min(99, Math.floor(done / total * 100)) + '%' : '') + '\u2026'); };
          var sEntries = entries.map(function(en) { return { name: en.name, size: en.data.length, pull: async function(emit) { await emit(en.data); } }; });
          paths.forEach(function(p) { sEntries.push({ name: p.replace(/^\/saves\//, ''), open: function() { return exportOpen(encodeURI(p)); } }); });
          total = exportMediaBytes(scope);
          var w = null, res = null, closed = false;
          try {
              w = await handle.createWritable();
              res = await zip.zipWrite({ write: function(pos, data) { return w.write({ type: 'write', position: pos, data: data }); }, truncate: function(n) { return w.truncate(n); } }, sEntries, say);
              await w.close(); w = null; closed = true;
              toast('Checking the export\u2026');
              var zfile = await handle.getFile(), zread = await zip.zipOpen(zfile);
              if (zfile.size !== res.size || zread.entries.length !== res.count) throw new Error('the file did not read back as it was written');
              for (var zi = 0; zi < zread.entries.length; zi++) await zread.entries[zi].check();
          } catch (e) {
              var left = await exportFailTidy(handle, w, closed);
              toast('The export could not be written: ' + (e && e.message || 'the file could not be made') + '.' + (left ? ' The file it left is not to be trusted: delete it.' : ''));
              return null;
          }
          var tallyS = exportTally(nImg, nVid, res.skipped);
          return { name: handle.name || (base + '.zip'), saved: true, images: tallyS.images, videos: tallyS.videos, library: libFiles.length, missing: tallyS.missing, libMissing: libMissing, unlisted: unlisted };
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
      return { name: base + '.zip', blob: zblob, images: tallyB.images, videos: tallyB.videos, library: libFiles.length, missing: tallyB.missing, libMissing: libMissing, unlisted: unlisted };
  }
  window.wpBuildExport = buildExport;
  // Whether an export will be a .zip or a .json, told at the press from what exportPayload made (1.6.4), so the save dialog suggests the
  // right file before anything is waited for, by buildExport's own rule: a share card, a big export (its videos and music past EXPORT_BIG), a
  // picture or a video it names, or a campaign's library pack makes a .zip. A campaign's own pictures that nothing names are known only from
  // the share sheet's count of the files it would carry (files, a number: exportPlan's paths); without that count the answer is '' (not known
  // now: no dialog, and the file goes as a download, as before)
  function exportKindNow(scope, share, pl, files) {
      if (!pl || !pl.payload) return '';
      if (share && share.card) return '.zip';
      if (exportMediaBytes(scope, share && share.leave) > EXPORT_BIG) return '.zip';
      if (collectImagePaths(pl.payload).length) return '.zip';
      if (scope !== 'campaign' && scope !== 'all') return '.json';
      var packs = Object.values(pl.payload.campaigns || {}).some(function(c) { return c && c.library && typeof c.library.dir === 'string' && Array.isArray(c.library.packs) && c.library.packs.some(function(pk) { return pk && pk.rev; }); });
      if (packs) return '.zip';
      if (typeof files === 'number' && isFinite(files)) return files > 0 ? '.zip' : '.json';
      return '';
  }

  // The .zip an export turned out to be after a .json was picked at the press (the review of a92c0d93, finding 1): saved only from a press of
  // its own, the notice's button, which may open the save dialog again. Never a second dialog that comes up by itself. exportScope's notice
  // calls it
  function exportSaveZip(r) {
      var t = saveStart({ name: r.name, type: 'application/zip', desc: 'Waypoint export', fail: 'Export failed.' });
      return t.save(r.blob).then(function(how) { if (saveDone(how)) toast(exportDoneWords(r)); return how; });
  }
  // The words said where a .json was picked and the export came out a .zip (a picture listed or added since the share sheet counted). empty:
  // the picked file could not be taken away and stays empty
  function exportZipWords(empty) {
      return 'This export holds pictures, so it is a .zip file. Nothing was saved yet.' + (empty ? ' The .json file you named was left empty.' : '');
  }
  // files (optional): the share sheet's count of the files the export would carry (exportKindNow)
  async function exportScope(scope, share, files) {
      if (!canPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return; }
      // 1.6.4 (Fulllion: "Yes, wait for the save"): the export's contents are made at once and the save dialog opens while the press still
      // counts (savefile.js), naming a .json or a .zip as the export will be. A .zip whose file was picked is written straight to it, never
      // held in this window's memory (a large export's videos and music past 1 GB always were); a .json is written once it is made. It says
      // it was exported only once it was: a cancel says nothing. Where no dialog can be had the file goes as a download, as ever
      var pl = exportPayload(scope, share), kind = exportKindNow(scope, share, pl, files);
      var ticket = kind ? saveStart({ name: pl.base + kind, type: kind === '.zip' ? 'application/zip' : 'application/json', desc: 'Waypoint export', fail: 'Export failed.' }) : null;
      var st = ticket ? await ticket.ready : 'none';
      if (st === 'cancel') return;   // canceled: no export
      var handle = st === 'picked' && kind === '.zip' ? ticket.handle : null;
      var r = await buildExport(scope, handle, share, pl);
      if (!r) { if (ticket) ticket.drop(); return null; }
      if (r.text) {
          if (st === 'picked') {
              var how = await ticket.save(new Blob([r.text], { type: 'application/json' }));
              if (!saveDone(how)) return null;
              r.name = ticket.handle.name || r.name;
          } else download(r.name, r.text);
          toast('Exported ' + r.name + '.' + exportLeftWords(r));
      }
      else if (st === 'picked' && !r.saved) {
          // a .json was picked for what turned out a .zip: the picked file is taken away where it is still empty, and the .zip waits for a
          // press of the notice's button, where the dialog may open again for it
          var dropped = await ticket.drop({ quiet: true });
          toastAction(exportZipWords(dropped === 'empty'), 'Save the .zip', function() { exportSaveZip(r); }, 20000);
      }
      else {
          if (!r.saved) downloadBlob(r.name, r.blob);   // no dialog in this window: a download, as ever
          toast(exportDoneWords(r));
      }
      return r;
  }
  window.wpExportScope = exportScope;   // the share sheet's Export (share.js)

  var _exportScopeBtns = { exportItemBtn: 'item', exportMapsBtn: 'maps', exportWbsBtn: 'whiteboards', exportPlannersBtn: 'planners', exportDocsBtn: 'docs', exportCampaignBtn: 'campaign', exportBtn: 'all' };
  Object.keys(_exportScopeBtns).forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function() {
          var sc = _exportScopeBtns[id];
          if ((sc === 'campaign' || sc === 'all') && window.wpShare && typeof window.wpShare.open === 'function') window.wpShare.open(sc, false);   // 1.6.0 backlog 34: the share sheet first
          else exportScope(sc);
      });
  });
  // Share this campaign: the same sheet, with Players unticked (the owner, 2026-10-29: "Yes, Share starts Players unticked (Recommended)")
  var _el_exportShareBtn = document.getElementById('exportShareBtn');
  if (_el_exportShareBtn) _el_exportShareBtn.addEventListener('click', function() { if (window.wpShare && typeof window.wpShare.open === 'function') window.wpShare.open('campaign', true); else exportScope('campaign'); });

  // "Export this …" reflects whatever is open when the menu drops down, in sentence case as every other row (1.6.3, the review of pages, finding 43)
  var _el_saveAsBtn2 = document.getElementById('saveAsBtn');
  if (_el_saveAsBtn2) _el_saveAsBtn2.addEventListener('click', function() {
      var camp = getActiveCampaign();
      var it = camp && camp.items[camp.activeItemId];
      var row = document.getElementById('exportItemBtn');
      if (!row) return;
      row.style.display = it ? '' : 'none';
      var rowName = row.querySelector('span'); if (it && rowName) rowName.textContent = 'Export this ' + (it.type === 'planner' ? 'planner' : it.type === 'doc' ? 'page' : 'map');   // the row keeps its drawing: only its words change
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
      // [pagecheck:keptpdf-start]
      // the review of pages reveal (finding 3): a page with a block kept back asks first (keptAsk). As players read it prints with the body's
      // print-players word, under which the style sheet leaves every kept block off the paper; the word goes again once the dialog is closed
      keptAsk(getActiveMap(), showConfirm, function(players) {
          var nP = window.wpNet, go = function() { if (nP && nP.holdPeers) nP.holdPeers(180000); try { window.print(); } finally { if (nP && nP.heldDone) nP.heldDone(); } };   // F2b: the table waits out the print dialog (it freezes this page)
          var bd = document.body, goP = function() { if (players === true && bd) bd.classList.add('print-players'); try { go(); } finally { if (players === true && bd) bd.classList.remove('print-players'); } };
          if (window.wpWithRenderedPlanner) window.wpWithRenderedPlanner(goP);   // a planner prints as its rendered document
          else goP();
      });
      // [pagecheck:keptpdf-end]
  });

  // [pagecheck:keptexport-start]
  // 1.6.3 (the review of pages reveal, finding 3): a page's Save PDF and Save HTML once saved exactly what players read. Since a block may be
  // kept back from players, the GM's drawn page holds those blocks too, so a page that holds one asks how to save it, by its buttons alone.
  // As players read it, the first answer, leaves every kept block out, as the stream window gets the page, so no player a block names is
  // assumed, and keeps a link to a kept block only as its page. With what I kept back keeps them, marked on paper as on screen. A page with
  // no kept block, a planner and a player's app, which never holds one, save as before with no question. ask is dialogs.js showConfirm, and
  // then(players) runs the save, players true for the players' copy. main.js's Save HTML reaches these two through window.wpKeptExport
  function keptAsk(it, ask, then) {
      var R = typeof window !== 'undefined' ? window.wpDocRender : null;
      if (!(it && it.type === 'doc' && R && typeof R.docKept === 'function' && R.docKept(it)) || typeof ask !== 'function') { then(false); return; }
      ask('This page holds blocks you kept back from your players. Save it as they read it, or with everything?', function(a) { if (a === 'alt') then(false); else if (a) then(true); }, { noEnter: true, yes: 'As players read it', alt: 'With what I kept back' });
  }
  // the drawn page's markup as players read it: a copy of root with every kept block (its class pv-kept) taken out, and each link or mention
  // that leads to a kept block keeping only its page (docrender.js unlinkKept, judged over the campaign's items). root itself is never changed
  function keptCut(root, items) {
      var c = root.cloneNode(true);
      Array.prototype.forEach.call(c.querySelectorAll('.pv-kept'), function(x) { if (x.parentNode) x.parentNode.removeChild(x); });
      var h = c.innerHTML, R = typeof window !== 'undefined' ? window.wpDocRender : null;
      return R && typeof R.unlinkKept === 'function' && typeof R.keptIn === 'function' ? R.unlinkKept(h, R.keptIn(items || {})) : h;
  }
  // [pagecheck:keptexport-end]
  if (typeof window !== 'undefined') window.wpKeptExport = { ask: keptAsk, cut: keptCut };

  

export {

    load,

    updateUndoBtn,

    pushHistory,

    undo,

    redo,

    save,

    saveSwitch,   // sidebar.js navigateToMap: the save after a map switch, which is no edit (1.6.3)

    saveView,

    download,

    getBase64Image,

    canPersistLocal,

    resetHistory,

    historyDepth,

    historyBarrier,

    rebaseHistory,

    withoutHistory,

    fieldUndoChord,

    boxUndo,

    stepBoundary,

    stepFold,

    stepSel,

    takeSafetyCopy,

    downloadBlob,   // a file handed to the browser as a download (savefile.js downloadNow), with the words exports always said

    migrateAppState   // main.js: an import is shaped by the load's own normaliser (cleanup.js cleanImport)

};

// Modules without an import edge to io.js (net, sidebar, planner, inspector) reach the gate here
window.wpCanPersistLocal = canPersistLocal;
window.wpResetHistory = resetHistory;
window.wpHistFlush = flushHistory;     // net.js: before a player's change lands in a map
window.wpHistBarrier = historyBarrier; // net.js / whiteboard.js: after a write that spans two maps
// Dev/console: the per-item undo picture, { 'campId/itemId': { undo, redo, bytes } }, for sandbox checks
window.wpHist = { refs: function(s) { s = String(s || ''); if (!s) return false; var inS = function(x) { return typeof x === 'string' && x.indexOf(s) >= 0; }; return Object.keys(histories).some(function(k) { var h = histories[k]; return inS(h.last) || h.undo.some(inS) || h.redo.some(inS); }); }, peek: function() { var out = {}; Object.keys(histories).forEach(function(k) { var h = histories[k]; out[k] = { undo: h.undo.length, redo: h.redo.length, bytes: h.bytes }; }); return out; } };



// [lookcheck:presshold-start]
// A box that draws itself again when a field says its change loses the press that made the field say it: the field speaks as the pointer goes down, the
// row is drawn anew and the pointer comes up on another element, so no click comes (found live, 2026-10-30: a tick in the fight's roster, Confirm in a
// trade). pressHold(el, win) answers a hold: busy() while a press that began in el is down, then(fn) runs fn once it has ended, after its click
// 1.6.2: a window hears the end of a press through ONE pair of listeners, however many holds were made (a box that is drawn anew at each
// draw asks for a hold each time, and each used to add its own pair for good). A hold is known to its window only while its press is down,
// and a box asked twice gets the hold it had. The two maps are made at the first ask and are given no value here: a module this one imports
// wires its box while this one is still loading, before a value written on this line would be there, and that value would then wipe the maps
var _holdWins, _holdEls;
export function pressHold(el, win) {
    if (!_holdWins) { _holdWins = new WeakMap(); _holdEls = new WeakMap(); }
    var had = _holdEls.get(el); if (had && had.win === win) return had.hold;
    var reg = _holdWins.get(win);
    if (!reg) {
        reg = { downs: [] }; _holdWins.set(win, reg);
        var endAll = function() { var ds = reg.downs; reg.downs = []; ds.forEach(function(e) { e(); }); };
        win.addEventListener('pointerup', endAll, true); win.addEventListener('pointercancel', endAll, true);
    }
    var down = false, todo = null;
    var end = function() { if (!down) return; down = false; win.setTimeout(function() { var f = todo; todo = null; if (f) f(); }, 0); };
    el.addEventListener('pointerdown', function() { if (!down) reg.downs.push(end); down = true; });
    var hold = { busy: function() { return down; }, then: function(fn) { todo = fn; } };
    _holdEls.set(el, { win: win, hold: hold });
    return hold;
}
// [lookcheck:presshold-end]
// [lookcheck:keepplace-start]
// 1.6.2, found by hand (the owner: "the whole menu jumps to the top every time"): a box drawn again while one of its own controls holds the
// focus lost its place. The pressed control is taken off the page, the focus falls to the page, and the box and every box around it that
// scrolls go back to their top. keepPlace(root, draw, idOf) keeps the scroll of root and of each box around it, and gives the focus back
// to the control that now stands where the pressed one stood (idOf(el), else its tag, first class and data-* words and its place among
// the controls alike), with no scroll of its own. A list that is drawn anew on a press asks it
var KEEP_STATE = { on: 1, open: 1, sel: 1, active: 1, current: 1, 'is-open': 1, 'hk-picking': 1 };
export function keepPlace(root, draw, idOf) {
    if (!root || typeof draw !== 'function') return typeof draw === 'function' ? draw() : undefined;
    var doc = root.ownerDocument || document, boxes = [], n = root;
    while (n && n.nodeType === 1) { if (n.scrollTop || n.scrollLeft) boxes.push([n, n.scrollTop, n.scrollLeft]); n = n.parentElement; }
    var sel = 'button, input, select, textarea, a[href], [tabindex]';
    var sig = function(el) {
        if (typeof idOf === 'function') { var k = idOf(el); if (k != null) return String(k); }
        var w = [el.tagName, String(el.className || '').split(/\s+/).filter(function(c) { return c && !KEEP_STATE[c]; }).join(' ')];   // a class that says a state may change with the redraw
        Array.prototype.forEach.call(el.attributes || [], function(at) { if (/^data-/.test(at.name)) w.push(at.name + '=' + at.value); });
        return w.join('|');
    };
    var a = doc.activeElement, key = null, nth = 0;
    if (a && a !== root && root.contains(a)) {
        key = sig(a); var all = root.querySelectorAll(sel);
        for (var i = 0; i < all.length; i++) { if (all[i] === a) break; if (sig(all[i]) === key) nth++; }
    }
    try { return draw(); } finally {
        boxes.forEach(function(b) { b[0].scrollTop = b[1]; b[0].scrollLeft = b[2]; });
        if (key != null) {
            var now = Array.prototype.filter.call(root.querySelectorAll(sel), function(el) { return sig(el) === key; }), to = now[Math.min(nth, now.length - 1)];
            if (to && to.disabled) { var row = to.parentElement; to = row ? Array.prototype.filter.call(row.querySelectorAll(sel), function(x) { return !x.disabled; })[0] : null; }   // a control the press turned off: its row's next one
            if (to && doc.activeElement !== to && typeof to.focus === 'function') { try { to.focus({ preventScroll: true }); } catch (e) {} }
        }
    }
}
if (typeof window !== 'undefined') window.wpKeepPlace = keepPlace;
// [lookcheck:keepplace-end]

// 1.6.2: lv 'warn' says something went wrong, as words that say so do (notices.js noteWarn)
export function toast(msg, lv) {

    var tb = document.getElementById('toastBtn');

    if (tb) {

        document.getElementById('toastMsg').textContent = msg;

        var wn = !!(window.wpNotices && typeof window.wpNotices.warn === 'function' && window.wpNotices.warn(String(msg == null ? '' : msg), lv));

        document.getElementById('toast').className = wn ? 'show warn' : 'show';

        tb.hidden = true; _toastAct = null; ++_toastGen;   // 1.5.8: a plain notice wears no button, and takes the place of one that did (toastAction)

        setTimeout(function(){ document.getElementById('toast').className=''; }, 3000);

    }

    if (window.wpNotices && typeof window.wpNotices.add === 'function') { try { window.wpNotices.add(msg, undefined, lv); } catch (e) {} }   // 160: every notice is kept in the bell's list as well (notices.js)

}

// Every module's local toast() shim delegates to window.appToast. Hook it up here.

window.appToast = toast;

// 1.5.8: a notice with one button (Undo), up for ms (10 s by default): a press runs fn once and puts the notice away; a newer notice takes its place
var _toastGen = 0, _toastAct = null, _toastWired = false;
export function toastAction(msg, label, fn, ms) {
    toast(msg);
    var tb = document.getElementById('toastBtn'), te = document.getElementById('toast'); if (!tb || !te || typeof fn !== 'function') return;
    if (!_toastWired) { _toastWired = true; tb.addEventListener('click', function() { var a = _toastAct; _toastAct = null; tb.hidden = true; te.className = ''; ++_toastGen; if (a) a(); }); }
    var tg = ++_toastGen; _toastAct = fn; tb.textContent = label || 'Undo'; tb.hidden = false;
    var iv = setInterval(function() { if (tg !== _toastGen) { clearInterval(iv); return; } te.className = 'show'; }, 250);   // held up past a plain notice's own 3 s, until a newer notice or its time
    setTimeout(function() { clearInterval(iv); if (tg === _toastGen) { te.className = ''; tb.hidden = true; _toastAct = null; } }, typeof ms === 'number' && ms > 0 ? ms : 10000);
}

// Dev/power-user: drop any queued autosave and re-read data.json from disk via the existing load()
// path, so an externally rebuilt save appears without the stop/write/restart dance. Clearing the
// debounce first is what makes disk win — otherwise the pending in-memory POST re-clobbers the file
// you just read. Any unsaved in-memory edit is intentionally discarded. (Works in the packaged shell too.)
window.wpReloadFromDisk = function() {
    var n = window.wpNet;
    if (n && n.active && n.role === 'client') { toast('Not while you\'re at someone else\'s table.'); return false; }   // still joined: your own save would replace the table
    if (n && n.active && n.role === 'host') { toast('Not while you\'re hosting. End the session first.'); return false; }   // the load's normaliser and cleanup would run under the live table
    clearTimeout(saveTimeout); load(); return true;
};

// Dev/console: force an immediate save now, skipping the ~500ms debounce (io.js save(true)).
window.wpSave = save;
window.wpSaveView = saveView;   // 1.6.3 (finding 13): the quiet save, for what is no change of the GM's own (fog.js hostMemFlush: the players' explored ground)





