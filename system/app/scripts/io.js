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
  function migrateAppState(data) {
    var changed = false;
    function fix(reason) { changed = true; }

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
            if (typeof m.meta.title !== 'string' || !m.meta.title) { m.meta.title = m.title || m.name || (m.type === 'planner' ? 'Planner' : 'Map'); fix('title defaulted'); }
            if ('gridFront' in m.meta) { delete m.meta.gridFront; fix('obsolete gridFront removed'); }
            if (m.type === 'planner') {
                if (!Array.isArray(m.blocks)) { m.blocks = []; fix('planner blocks created'); }
                return;
            }
            if (!Array.isArray(m.rooms)) { m.rooms = []; fix('rooms created'); }
            if (!Array.isArray(m.links)) { m.links = []; fix('links created'); }
            if (!Array.isArray(m.whiteboard)) { m.whiteboard = []; fix('play map created'); }
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
            });
            m.whiteboard.forEach(function(w) {
                if (!w.id) { w.id = 'wb' + Math.random().toString(36).slice(2, 10); fix('wb id generated'); }
                if (typeof w.x !== 'number') { w.x = 15000; fix('wb x defaulted'); }
                if (typeof w.y !== 'number') { w.y = 15000; fix('wb y defaulted'); }
                if (typeof w.w !== 'number' || w.w <= 0) { w.w = 100; fix('wb w defaulted'); }
                if (typeof w.h !== 'number' || w.h <= 0) { w.h = 100; fix('wb h defaulted'); }
            });
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
    });

    if (!data.activeCampaignId || !data.campaigns[data.activeCampaignId]) {
        data.activeCampaignId = Object.keys(data.campaigns)[0] || null;
        if (data.activeCampaignId) fix('activeCampaignId repaired');
    }
    if (data._schema !== CURRENT_SCHEMA) { data._schema = CURRENT_SCHEMA; /* stamp only; not itself a change worth announcing */ }

    return { data: data, changed: changed };
  }

  function load() {

    fetch('/api/data')

      .then(res => res.json())

      .then(data => {

        var migrated = { changed: false };
        if(Object.keys(data).length > 0) {
            migrated = migrateAppState(data);
            state.appState = migrated.data;
        }
        if (window.wpStream && window.wpNet && window.wpNet.sanitizeAppState) state.appState = window.wpNet.sanitizeAppState(state.appState);   // stream window: players' view only
        if (window.wpNet) window.wpNet.foreign = !!window.wpStream;   // our own campaign again (the stream window never owns one)

        

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

        render();
        // Restore the camera once layout has real dimensions (retries cover slow first paint)
        var _restoreTries = 0;
        (function tryRestore() {
            var wrapEl = state.viewMode === 'visual' ? document.getElementById('whiteboardWrap') : document.getElementById('canvasWrap');
            if ((!wrapEl || wrapEl.clientWidth === 0) && _restoreTries++ < 40) return setTimeout(tryRestore, 100);
            restoreCameraPosition();
        })();

        lastHistoryState = JSON.stringify(state.appState);

        updateUndoBtn();

        if (migrated.changed) {

            // Persist the upgraded shape once; the launch backup holds the original
            save(true);

            toast('Save upgraded from an older Waypoint version ✓ (original kept in saves/backups)');

        }

      })

      .catch(err => {

        console.error(err);

        saveNote.innerHTML = 'Error loading data.';

      });

  }



  var undoStack = [];

  var redoStack = [];

  var lastHistoryState = null;

  var isUndoing = false;



  function setHistoryBtn(id, enabled) {

      var btn = document.getElementById(id);

      if(!btn) return;

      btn.style.opacity = enabled ? '1' : '0.5';

      btn.style.pointerEvents = enabled ? 'auto' : 'none';

  }

  function updateUndoBtn() {

      setHistoryBtn('dataUndoBtn', undoStack.length > 0);

      setHistoryBtn('wbUndoBtn', undoStack.length > 0);

      setHistoryBtn('dataRedoBtn', redoStack.length > 0);

      setHistoryBtn('wbRedoBtn', redoStack.length > 0);

  }



  function pushHistory() {

      if (isUndoing || !lastHistoryState) return;

      var currentStr = JSON.stringify(state.appState);

      if (currentStr !== lastHistoryState) {

          undoStack.push(lastHistoryState);

          if (undoStack.length > 20) undoStack.shift();

          redoStack = [];

          lastHistoryState = currentStr;

          updateUndoBtn();

      }

  }



  function applyHistoryState(stateStr, msg) {

      isUndoing = true;

      state.appState = JSON.parse(stateStr);

      lastHistoryState = stateStr;

      updateUndoBtn();



      // Update UI

      updateCampaignSelect();

      updateSidebarNav();

      state.selId = null; state.selWbId = null; state.selWbIds = []; state.linkStart = null;

      render();



      // Save the restored state to disk immediately without pushing to history

      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') { toast(msg); setTimeout(function(){ isUndoing = false; }, 100); return; }

      fetch('/api/data', {

          method: 'POST',

          headers: { 'Content-Type': 'application/json' },

          body: stateStr

      })

      .then(res => {

          if(res.ok) saveNote.innerHTML = 'Saved to disk <b>&#10003;</b>';

      })

      .catch(() => { saveNote.innerHTML = 'Network error saving.'; });



      toast(msg);

      setTimeout(function(){ isUndoing = false; }, 100);

  }



  function undo() {

      if (undoStack.length === 0) return;

      redoStack.push(JSON.stringify(state.appState));

      applyHistoryState(undoStack.pop(), 'Undo successful.');

  }



  function redo() {

      if (redoStack.length === 0) return;

      undoStack.push(JSON.stringify(state.appState));

      applyHistoryState(redoStack.pop(), 'Redo successful.');

  }



  var saveTimeout;

  function save(immediate) {

    var activeMap = getActiveMap();

    if(activeMap) { activeMap.meta.updated = Date.now(); }

    saveNote.innerHTML = 'Saving...';

    

    var doSave = function() {

        pushHistory();

        // Multiplayer: clients don't touch their own disk — edits go to the host. And a campaign
        // that came from a host (wpNet.foreign) never reaches this disk even after the link drops:
        // between reconnect attempts the client is briefly "inactive" but still holds the GM's table.
        if (window.wpNet && (window.wpNet.foreign || (window.wpNet.active && window.wpNet.role === 'client'))) {
            if (window.wpNet.active && window.wpNet.role === 'client') {
                window.wpNet.onLocalSave();
                saveNote.innerHTML = 'Synced to host <b>&#10003;</b>';
            } else {
                saveNote.innerHTML = 'GM\'s campaign &mdash; not saved here';
            }
            return;
        }

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

    }

  }



  /* ---------- mode toggling ---------- */

  var _segBtns = modeSelect ? Array.prototype.slice.call(modeSelect.querySelectorAll('.seg-btn')) : [];

  function setViewMode(mode) {

      if (state.viewMode === mode) return;

      state.viewMode = mode;

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
      wbClipboard = ids.map(function(id) { return m.whiteboard.find(function(x) { return x.id === id; }); }).filter(Boolean).map(clone);
      wbPasteCount = 0;
      if (cut) {
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
          delete it.ownerId;
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

      if (typing) return;

      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return; // spectators: no edit shortcuts

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
                  var hexToken = state.gridType === 'hex' && (it.isChar || it.type === 'hexagon' || it.shape === 'hexagon');
                  if (hexToken) {
                      // On a hex grid a token hops cell to cell: ↑/↓ one row, ←/→ one
                      // column along the diagonal (Shift takes the other diagonal)
                      if (dy) { it.y += Math.sign(dy) * 52; }
                      else { it.x += Math.sign(dx) * 45; it.y += (e.shiftKey ? -1 : 1) * Math.sign(dx) * -26; }
                      if (window.wpSeatHex) window.wpSeatHex(it, m2);
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

              m.whiteboard = m.whiteboard.filter(x => !ids.includes(x.id));

              state.selWbIds = []; state.selWbId = null;

              save(); render(); toast('Deleted.');

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

      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return;

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
          setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
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

  async function buildExport(scope) {
      var camp = getActiveCampaign();
      if (!camp) { toast('No campaign selected.'); return null; }
      function mergeShell(items) {
          var c = {}; c[camp.id] = { id: camp.id, name: camp.name, items: items };
          return { activeCampaignId: camp.id, campaigns: c };
      }
      var payload = null, base = '';
      if (scope === 'all') {
          payload = state.appState;
          base = 'waypoint-everything';
      } else if (scope === 'item') {
          var it = camp.items[camp.activeItemId];
          if (!it) { toast('Nothing is open.'); return null; }
          var one = {}; one[it.id] = clone(it);
          payload = mergeShell(one);
          base = slugName(it.meta && it.meta.title);
      } else if (scope === 'maps' || scope === 'planners') {
          var t = scope === 'maps' ? 'map' : 'planner';
          var items = {};
          Object.values(camp.items).forEach(function(i) { if (i.type === t) items[i.id] = clone(i); });
          if (!Object.keys(items).length) { toast('This campaign has no ' + scope + '.'); return null; }
          payload = mergeShell(items);
          base = slugName(camp.name) + '-' + scope;
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

      var json = JSON.stringify(payload, null, 2);
      var paths = collectImagePaths(payload);
      if (!paths.length) return { name: base + '.json', text: json };

      toast('Bundling ' + paths.length + ' image(s)\u2026');
      var enc = new TextEncoder();
      var entries = [{ name: 'data.json', data: enc.encode(json) }];
      var missing = 0;
      for (var k = 0; k < paths.length; k++) {
          try {
              var r = await fetch(encodeURI(paths[k]));
              if (!r.ok) { missing++; continue; }
              entries.push({ name: paths[k].replace(/^\/saves\//, ''), data: new Uint8Array(await r.arrayBuffer()) });
          } catch(e) { missing++; }
      }
      var zip = await import('./zip.js');
      return { name: base + '.zip', blob: zip.zipCreate(entries), images: entries.length - 1, missing: missing };
  }
  window.wpBuildExport = buildExport;

  async function exportScope(scope) {
      var r = await buildExport(scope);
      if (!r) return;
      if (r.text) { download(r.name, r.text); toast('Exported ' + r.name); }
      else {
          downloadBlob(r.name, r.blob);
          toast('Exported ' + r.name + ' (' + r.images + ' image(s)' + (r.missing ? ', ' + r.missing + ' missing' : '') + ').');
      }
  }

  var _exportScopeBtns = { exportItemBtn: 'item', exportMapsBtn: 'maps', exportWbsBtn: 'whiteboards', exportPlannersBtn: 'planners', exportBtn: 'all' };
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
      if (it) row.innerHTML = '&#128190; Export This ' + (it.type === 'planner' ? 'Planner' : 'Map');
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

      window.print();

  });

  

export {

    load,

    updateUndoBtn,

    pushHistory,

    undo,

    redo,

    save,

    download,

    getBase64Image

};



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





