function setZoom(n, x, y) { if(window.appSetZoom) window.appSetZoom(n, x, y); }

function toast(msg) { if(window.appToast) window.appToast(msg); }



function render() { if(window.appRender) window.appRender(); }



var saveNote = document.getElementById('saveNote');

var campaignSelect = document.getElementById('campaignSelect');

var modeSelect = document.getElementById('viewModeSelect');

var inspector = document.getElementById('inspector');

var canvas = document.getElementById('canvas');

var svg = document.getElementById('edges');

var wrap = document.getElementById('canvasWrap');

var wbWrap = document.getElementById('whiteboardWrap');

var wb = document.getElementById('whiteboard');



import { state, dom } from './state.js';

import { load, updateUndoBtn, pushHistory, undo, save, download, getBase64Image } from './io.js';

import { updateCampaignSelect, updateSidebarNav } from './sidebar.js';

import { showPrompt, showConfirm, isCampaignNameTaken, getUniqueCampaignTitle, promptForCampaignName, isItemNameTaken, getUniqueItemTitle, promptForItemName } from './dialogs.js';

import { renderPlanner, renderPlannerPreview } from './planner.js';

import { renderDataMap, clearSnaps, drawSnap, doSmartSnapping, attachDrag, attachPanning, isLinkMode, setLinkMode, removeLinkAt } from './datamap.js';

import { renderWhiteboard, attachResizeHandle, attachRotateHandle, addWbItem, uploadImageFile } from './whiteboard.js';

import { getRoomInspectorHtml, attachRoomInspectorEvents, renderInspector,  renderElementList, esc } from './inspector.js';



  function uid(){return 'r'+Math.random().toString(36).slice(2,8);}

  function clone(o){return JSON.parse(JSON.stringify(o));}



  function createNewCampaign(title) {

    return {

      id: 'camp_' + Date.now(),

      name: title || 'New Campaign',

      items: {},

      activeItemId: null

    };

  }



  function createNewMap(title) {

    return {

      type: 'map',

      id: 'map_' + Date.now(),

      meta: { title: title || 'New Map', updated: Date.now(), homeX: 15000, homeY: 15000 },

      rooms: [],

      links: [],

      whiteboard: [],

      cats: { 'default': { label: 'Default Category', color: '#c9c9d4' } }

    };

  }



  function createNewPlanner(title) {

    return {

      type: 'planner',

      id: 'plan_' + Date.now(),

      meta: { title: title || 'New Planner', updated: Date.now() },

      blocks: [

          { type: 'h1', title: title || 'New Planner', sub: '' },

          { type: 'text', content: 'Start writing...' }

      ]

    };

  }



  function getActiveCampaign() {

    return state.appState.campaigns[state.appState.activeCampaignId];

  }



  function getActiveMap() {

    var camp = getActiveCampaign();

    if (!camp) return null;

    return camp.items[camp.activeItemId];

  }



  /* ---------- item nesting helpers (maps and planners) ---------- */

  // An item's parent is stored as meta.parentId; nesting is within the same type,

  // and a dangling or cross-type reference counts as top-level.

  function getMapParentId(camp, item) {

      var pid = item && item.meta && item.meta.parentId;

      return (pid && camp.items[pid] && camp.items[pid].type === item.type) ? pid : null;

  }



  function getMapChildren(camp, parentId, type) {

      parentId = parentId || null;

      type = type || 'map';

      return Object.values(camp.items)

          .filter(function(it) { return it.type === type && getMapParentId(camp, it) === parentId; })

          .sort(function(a, b) { return (a.meta.title || '').localeCompare(b.meta.title || ''); });

  }



  // Ancestor chain from the topmost map down to the direct parent.

  function getMapAncestors(camp, id) {

      var chain = [], cur = camp.items[id], guard = 0;

      while (cur && guard++ < 100) {

          var pid = getMapParentId(camp, cur);

          if (!pid) break;

          cur = camp.items[pid];

          chain.unshift(cur);

      }

      return chain;

  }



  function isMapDescendantOf(camp, id, ancestorId) {

      var cur = camp.items[id], guard = 0;

      while (cur && guard++ < 100) {

          var pid = getMapParentId(camp, cur);

          if (!pid) return false;

          if (pid === ancestorId) return true;

          cur = camp.items[pid];

      }

      return false;

  }



/* ---------- warp landing rooms ----------
   A portal leads to a MAP; the traveller should arrive at the right ROOM on
   it. Resolution, in order: the source node's explicit targetRoomId; a room
   on the target map with the SAME id as the source node (the campaign
   convention — e.g. "belasoffice" on both the complex and the cellblock);
   a room with the same name (case/punctuation-insensitive); else nothing
   (the map opens at its saved home). */
export function findLandingRoom(src, targetMap) {
    if (!src || !targetMap || !Array.isArray(targetMap.rooms)) return null;
    var rooms = targetMap.rooms;
    if (src.targetRoomId) { var e = rooms.find(function(r) { return r.id === src.targetRoomId; }); if (e) return e; }
    if (src.id) { var same = rooms.find(function(r) { return r.id === src.id; }); if (same) return same; }
    var norm = function(s) { return String(s || '').toLowerCase().replace(/[’']/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim(); };
    var n = norm(src.name);
    if (n) { var byName = rooms.find(function(r) { return norm(r.name) === n; }); if (byName) return byName; }
    return null;
}
/* Where to put the camera (and a spawned token) for a landing room: the
   room card's centre on the data map, and the centre of the whiteboard item
   linked to it (if any) on the whiteboard. */
export function landingPoint(map, room) {
    if (!map || !room) return null;
    var wb = (map.whiteboard || []).find(function(w) { return w.nodeId === room.id && !w.isChar; });
    return {
        dataX: (room.x || 0) + 70, dataY: (room.y || 0) + 30,
        wbX: wb ? wb.x + (wb.w || 100) / 2 : null, wbY: wb ? wb.y + (wb.h || 100) / 2 : null,
        wbItemId: wb ? wb.id : null
    };
}

export {

    uid,

    clone,

    createNewCampaign,

    createNewMap,

    createNewPlanner,

    getActiveCampaign,

    getActiveMap,

    getMapParentId,

    getMapChildren,

    getMapAncestors,

    isMapDescendantOf

};

