function setZoom(n, x, y) { if(window.appSetZoom) window.appSetZoom(n, x, y); }

function toast(msg) { if(window.appToast) window.appToast(msg); }



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



import { state, dom } from './state.js';

import { uid, clone, createNewCampaign, createNewMap, createNewPlanner, getActiveCampaign, getActiveMap, getMapChildren, getMapAncestors, isMapDescendantOf, findLandingRoom, landingPoint } from './models.js';

import { load, updateUndoBtn, pushHistory, undo, save, download, getBase64Image } from './io.js';

import { showPrompt, showConfirm, isCampaignNameTaken, getUniqueCampaignTitle, promptForCampaignName, isItemNameTaken, getUniqueItemTitle, promptForItemName } from './dialogs.js';

import { renderPlanner, renderPlannerPreview } from './planner.js';

import { renderDataMap, clearSnaps, drawSnap, doSmartSnapping, attachDrag, attachPanning, isLinkMode, setLinkMode, removeLinkAt } from './datamap.js';

import { renderWhiteboard, attachResizeHandle, attachRotateHandle, addWbItem, uploadImageFile } from './whiteboard.js';

import { getRoomInspectorHtml, attachRoomInspectorEvents, renderInspector,  renderElementList, esc } from './inspector.js';



  function updateCampaignSelect() {

      if (campaignSelect) {

          campaignSelect.innerHTML = '';

          for (var k in state.appState.campaigns) {

              var opt = document.createElement('option');

              opt.value = k;

              opt.textContent = state.appState.campaigns[k].name || 'Unnamed Campaign';

              if (k === state.appState.activeCampaignId) opt.selected = true;

              campaignSelect.appendChild(opt);

          }

      }

  }



  // Move a map or planner under a new same-type parent (or to top level with null).

  function reparentMap(id, newParentId) {

      var camp = getActiveCampaign();

      if (!camp) return;

      var item = camp.items[id];

      if (!item || (item.type !== 'map' && item.type !== 'planner')) return;

      newParentId = newParentId || null;

      var curParent = (item.meta && item.meta.parentId) || null;

      if (id === newParentId || curParent === newParentId) return;

      if (newParentId) {

          var target = camp.items[newParentId];

          if (!target || target.type !== item.type) { toast('Maps nest under maps, planners under planners.'); return; }

          if (isMapDescendantOf(camp, newParentId, id)) { toast("An item can't be nested inside its own child."); return; }

          target.meta.collapsed = false;

      }

      item.meta.parentId = newParentId;

      save(true); updateSidebarNav();

      toast(newParentId ? 'Nested.' : 'Moved to top level.');

  }



  var _lastActiveId = null;

  // Pinned and recent maps, shown above the Maps tree. Recent is per campaign on this computer.
  function recentKey(camp) { return 'wp_recent_' + camp.id; }
  function noteRecent(camp) {
      var it = camp.items[camp.activeItemId]; if (!it || it.type !== 'map') return;
      try {
          var list = JSON.parse(localStorage.getItem(recentKey(camp)) || '[]').filter(function(id) { return id !== it.id && camp.items[id]; });
          list.unshift(it.id);
          localStorage.setItem(recentKey(camp), JSON.stringify(list.slice(0, 8)));
      } catch (e) {}
  }
  function mapQuickHtml(camp) {
      noteRecent(camp);
      var pinned = (camp.pinnedMaps || []).filter(function(id) { return camp.items[id] && camp.items[id].type === 'map'; });
      var recent = [];
      try { recent = JSON.parse(localStorage.getItem(recentKey(camp)) || '[]'); } catch (e) {}
      recent = recent.filter(function(id) { return camp.items[id] && camp.items[id].type === 'map' && id !== camp.activeItemId && pinned.indexOf(id) < 0; }).slice(0, 5);
      function chip(id, cls) { var m = camp.items[id]; var t = (m.meta && m.meta.title) || id; return '<button class="mq-chip' + (cls ? ' ' + cls : '') + '" data-id="' + esc(id) + '" title="' + esc(t) + '">' + esc(t) + '</button>'; }
      if (!pinned.length && !recent.length) return '';
      var html = '<div id="mapQuick">';
      if (pinned.length) html += '<div class="mq-row"><span class="mq-label" title="Pinned from the play-map right-click menu">Pinned</span>' + pinned.map(function(id) { return chip(id, 'pinned'); }).join('') + '</div>';
      if (recent.length) html += '<div class="mq-row"><span class="mq-label" title="The last maps you opened">Recent</span>' + recent.map(function(id) { return chip(id); }).join('') + '</div>';
      return html + '</div>';
  }
  var _mqNav = document.getElementById('mapNavList');
  if (_mqNav) _mqNav.addEventListener('click', function(e) {
      var chip = e.target.closest && e.target.closest('.mq-chip'); if (!chip) return;
      e.stopPropagation();
      navigateToMap(chip.dataset.id);
  });
  // Lock or unlock a map (and, for a nest, every map under it) for players
  function mapNest(camp, id) {
      var out = [id];
      Object.values(camp.items).forEach(function(it) { if (it.type === 'map' && it.id !== id && isMapDescendantOf(camp, it.id, id)) out.push(it.id); });
      return out;
  }
  function setPlayerLock(ids, on) {
      var camp = getActiveCampaign(); if (!camp) return;
      var names = [];
      var changed = 0;
      ids.forEach(function(id) {
          var m = camp.items[id]; if (!m || m.type !== 'map') return;
          m.meta = m.meta || {};
          if (!!m.meta.playerLock !== !!on) changed++;
          if (on) m.meta.playerLock = true; else delete m.meta.playerLock;
          names.push(m.meta.title || id);
      });
      if (!changed) { toast(on ? 'Already locked for players.' : 'Already open to players.'); updateSidebarNav(); return; }
      save(true); updateSidebarNav();
      var n = window.wpNet;
      if (n && n.pushItems) n.pushItems(ids);
      if (n && n.logEvent) n.logEvent('table', (on ? 'Locked ' : 'Unlocked ') + (names.length === 1 ? names[0] : names.length + ' maps (' + names[0] + '…)') + (on ? ' for players' : ' for players'));
      toast((on ? 'Locked for players: ' : 'Open to players again: ') + (names.length === 1 ? names[0] : names[0] + ' and ' + (names.length - 1) + ' map' + (names.length === 2 ? '' : 's') + ' under it') + '.');
  }
  // Right-click → scene status (the same rule as the toolbar picker: one Next at a time)
  (function wireStatusMenu() {
      var menu = document.getElementById('sidebarContextMenu'); if (!menu) return;
      menu.querySelectorAll('.ctx-status').forEach(function(x) {
          x.addEventListener('click', function() {
              var id = menu.dataset.id; menu.style.display = 'none';
              var camp = getActiveCampaign(), it = camp && camp.items[id]; if (!it || it.type !== 'planner') return;
              var st = this.dataset.status;
              it.meta = it.meta || {};
              if (st) it.meta.status = st; else delete it.meta.status;
              if (st === 'next') Object.values(camp.items).forEach(function(o) { if (o !== it && o.type === 'planner' && o.meta && o.meta.status === 'next') delete o.meta.status; });
              save(true); updateSidebarNav();
              var sel = document.getElementById('plannerStatus'); if (sel && camp.activeItemId === id) sel.value = st;
              toast((it.meta.title || 'Planner') + (st === 'next' ? ' is the next scene.' : st === 'played' ? ' marked played.' : st === 'skipped' ? ' marked skipped.' : ': status cleared.'));
          });
      });
  })();
  (function wireLockMenu() {
      var one = document.getElementById('ctxLockItem'), nest = document.getElementById('ctxLockNest'), unnest = document.getElementById('ctxUnlockNest'), menu = document.getElementById('sidebarContextMenu');
      function go(all, force) {
          if (!menu) return; var id = menu.dataset.id; menu.style.display = 'none';
          var camp = getActiveCampaign(), it = camp && camp.items[id]; if (!it || it.type !== 'map') return;
          var on = force !== undefined ? force : !(it.meta && it.meta.playerLock);
          setPlayerLock(all ? mapNest(camp, id) : [id], on);
      }
      if (one) one.addEventListener('click', function() { go(false); });
      if (nest) nest.addEventListener('click', function() { go(true, true); });
      if (unnest) unnest.addEventListener('click', function() { go(true, false); });
  })();
  function updateSidebarNav() {

      var camp = getActiveCampaign();

      if (!camp) return;



      var pNav = document.getElementById('plannerNavList');

      var mNav = document.getElementById('mapNavList');

      if (!pNav || !mNav) return;



      // When the active item changes (sidebar click, warp, breadcrumb), reveal it:

      // expand any collapsed ancestors now, scroll its row into view after render.

      var activeChanged = camp.activeItemId !== _lastActiveId;

      _lastActiveId = camp.activeItemId;

      if (activeChanged && camp.items[camp.activeItemId]) {

          getMapAncestors(camp, camp.activeItemId).forEach(function(a) {

              if (a.meta) a.meta.collapsed = false;

          });

      }



      function rowHtml(item, depth, hasKids, collapsed) {

          var isActive = (item.id === camp.activeItemId);

          var caret = hasKids

              ? '<span class="caret' + (collapsed ? '' : ' down') + '" data-id="' + item.id + '" title="' + (collapsed ? 'Expand' : 'Collapse') + '">&#9654;</span>'

              : '<span class="caret-spacer"></span>';

          var guides = '';
          for (var g = 1; g <= depth; g++) guides += '<span class="tree-guide" style="left:' + (10 + (g - 1) * 14 + 5) + 'px;"></span>';   // under the parent's caret
          return '<div class="sidebar-item' + (isActive ? ' active' : '') + (depth === 0 ? ' tree-root' : '') + '" data-id="' + item.id + '" data-depth="' + depth + '" draggable="true"' +

                 ' style="position:relative; padding-left:' + (10 + depth * 14) + 'px;">' +

                 guides + caret + (item.type === 'planner' && item.meta.status ? '<span class="si-status si-' + item.meta.status + '" title="' + (item.meta.status === 'next' ? 'Next scene' : item.meta.status === 'played' ? 'Played' : 'Skipped') + '">' + (item.meta.status === 'next' ? '▶' : item.meta.status === 'played' ? '✅' : '⏭') + '</span>' : '') +
                 (item.type === 'map' && item.meta.playerLock ? '<span class="si-status si-lock" title="Locked for players — they cannot travel here until you unlock it">&#128274;</span>' : '') +
                 '<span class="si-title">' + esc(item.meta.title || 'Unnamed') + '</span>' +

                 '</div>';

      }



      // Both lists render as nested trees (collapse state lives in meta.collapsed)

      function treeHtml(type) {

          var html = '';

          (function walk(parentId, depth) {

              getMapChildren(camp, parentId, type).forEach(function(m) {

                  var kids = getMapChildren(camp, m.id, type);

                  var collapsed = !!(m.meta && m.meta.collapsed);

                  html += rowHtml(m, depth, kids.length > 0, collapsed);

                  if (kids.length > 0 && !collapsed) walk(m.id, depth + 1);

              });

          })(null, 0);

          return html;

      }

      pNav.innerHTML = treeHtml('planner') || '<div class="nav-empty">No planners yet — press + above to write your first session plan.</div>';

      mNav.innerHTML = mapQuickHtml(camp) + (treeHtml('map') || '<div class="nav-empty">No maps yet — press + above to create your first location.</div>');



      if (activeChanged) {

          var act = document.querySelector('.sidebar-item.active');

          if (act) act.scrollIntoView({ block: 'nearest' });

      }



        document.querySelectorAll('.sidebar-item').forEach(el => {
            el.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                var menu = document.getElementById('sidebarContextMenu');
                if(!menu) return;
                menu.style.display = 'block';
                window.wpClampMenu(menu, e.clientX, e.clientY);   // above the pointer when the bottom is near
                menu.dataset.id = this.dataset.id;
                var activeC = getActiveCampaign();
                var it = activeC && activeC.items[this.dataset.id];
                var isMapCtx = !!(it && it.type === 'map'), lockedCtx = !!(it && it.meta && it.meta.playerLock);
                menu.querySelectorAll('.ctx-map-only').forEach(function(x) { x.style.display = isMapCtx ? 'block' : 'none'; });
                var isPlCtx = !!(it && it.type === 'planner'), stCtx = (it && it.meta && it.meta.status) || '';
                menu.querySelectorAll('.ctx-planner-only').forEach(function(x) { x.style.display = isPlCtx ? 'block' : 'none'; });
                menu.querySelectorAll('.ctx-status').forEach(function(x) { x.classList.toggle('on', x.dataset.status === stCtx && !!stCtx); if (x.dataset.status === '') x.style.display = isPlCtx && stCtx ? 'block' : 'none'; });
                var lockOne = document.getElementById('ctxLockItem'), lockNest = document.getElementById('ctxLockNest'), unlockNest = document.getElementById('ctxUnlockNest');
                if (lockOne) lockOne.innerHTML = lockedCtx ? '&#128275; Unlock for players' : '&#128274; Lock for players';
                if (isMapCtx && lockNest && unlockNest) {
                    // the nest entries follow the whole nest: offer Lock while any map under it is open, Unlock while any is locked
                    var nestIds = mapNest(activeC, it.id), nLocked = nestIds.filter(function(id) { var m = activeC.items[id]; return m && m.meta && m.meta.playerLock; }).length;
                    var hasKids = nestIds.length > 1;
                    lockNest.style.display = hasKids && nLocked < nestIds.length ? 'block' : 'none';
                    unlockNest.style.display = hasKids && nLocked > 0 ? 'block' : 'none';
                    lockNest.innerHTML = '&#128274; Lock this and every map under it' + (nLocked && nLocked < nestIds.length ? ' <span style="color:var(--dim); font-size:11px;">(' + (nestIds.length - nLocked) + ' still open)</span>' : '');
                    unlockNest.innerHTML = '&#128275; Unlock this and every map under it' + (nLocked && nLocked < nestIds.length ? ' <span style="color:var(--dim); font-size:11px;">(' + nLocked + ' locked)</span>' : '');
                }
                var childBtn = document.getElementById('ctxNewChildItem');
                if (childBtn) {
                    childBtn.style.display = (it && (it.type === 'map' || it.type === 'planner')) ? 'block' : 'none';
                    if (it) childBtn.textContent = it.type === 'planner' ? '+ New Child Planner' : '+ New Child Map';
                }
            });
            el.addEventListener('click', function(e) {

                if (e.target.closest('.caret')) {
                    var activeC = getActiveCampaign();
                    var it = activeC && activeC.items[this.dataset.id];
                    if (it && it.meta) { it.meta.collapsed = !it.meta.collapsed; save(); updateSidebarNav(); }
                    return;
                }

                var activeC = getActiveCampaign();
                if (activeC) {
                    activeC.activeItemId = this.dataset.id;
                    state.selId = null; state.selWbId = null; state.linkStart = null;
                    if (window.wpApplyRememberedView) window.wpApplyRememberedView();
                    updateSidebarNav();
                    render(); save(true);
                    restoreCameraPosition();
                }
            });
            // Double-click a name to rename the map or planner in place
            el.addEventListener('dblclick', function(e) {
                if (e.target.closest('.caret')) return;
                e.preventDefault(); e.stopPropagation();
                var activeC = getActiveCampaign();
                var it = activeC && activeC.items[this.dataset.id];
                if (!it || !it.meta) return;
                promptForItemName(it.meta.title || '', 'Rename ' + (it.type === 'planner' ? 'planner' : 'map') + ':', it.id, function(title) {
                    it.meta.title = title;
                    it.meta.updated = Date.now();
                    save(); updateSidebarNav(); render();
                    toast('Renamed to “' + title + '”.');
                });
            });
        });

        // Drag an item onto another (same-type) item to nest it there
        document.querySelectorAll('#mapNavList .sidebar-item, #plannerNavList .sidebar-item').forEach(el => {
            el.addEventListener('dragstart', function(e) {
                e.dataTransfer.setData('text/plain', this.dataset.id);
                e.dataTransfer.effectAllowed = 'move';
            });
            el.addEventListener('dragover', function(e) { e.preventDefault(); this.classList.add('drag-over'); });
            el.addEventListener('dragleave', function() { this.classList.remove('drag-over'); });
            el.addEventListener('drop', function(e) {
                e.preventDefault(); e.stopPropagation();
                this.classList.remove('drag-over');
                reparentMap(e.dataTransfer.getData('text/plain'), this.dataset.id);
            });
        });

  }



  // Section folding: hide/show a whole section without touching per-item collapse state.

  (function() {

      [['planners', 'plannerNavList'], ['maps', 'mapNavList']].forEach(function(pair) {

          var key = pair[0], nav = document.getElementById(pair[1]);

          var title = document.querySelector('.section-title[data-section="' + key + '"]');

          if (!title || !nav) return;

          var folded = false;

          try { folded = localStorage.getItem('wp_fold_' + key) === '1'; } catch (e) {}

          function apply() {

              nav.style.display = folded ? 'none' : '';

              title.textContent = (folded ? '▸ ' : '▾ ') + title.dataset.label;

          }

          apply();

          title.addEventListener('click', function() {

              folded = !folded;

              try { localStorage.setItem('wp_fold_' + key, folded ? '1' : '0'); } catch (e) {}

              apply();

          });

      });

      // Collapse-all / expand-all for the nested accordions inside each section

      [['collapseAllPlannersBtn', 'planner'], ['collapseAllMapsBtn', 'map']].forEach(function(pair) {

          var btn = document.getElementById(pair[0]), type = pair[1];

          if (!btn) return;

          btn.addEventListener('click', function() {

              var camp = getActiveCampaign();

              if (!camp) return;

              var parents = Object.values(camp.items).filter(function(i) {

                  return i.type === type && getMapChildren(camp, i.id, type).length > 0;

              });

              if (parents.length === 0) return;

              var anyExpanded = parents.some(function(p) { return !(p.meta && p.meta.collapsed); });

              parents.forEach(function(p) { if (p.meta) p.meta.collapsed = anyExpanded; });

              save(); updateSidebarNav();

          });

      });

  })();



  // Dropping on a list background un-nests (moves the item to top level).

  ['mapNavList', 'plannerNavList'].forEach(function(navId) {

      var nav = document.getElementById(navId);

      if (!nav) return;

      nav.addEventListener('dragover', function(e) { e.preventDefault(); this.classList.add('drag-over'); });

      nav.addEventListener('dragleave', function() { this.classList.remove('drag-over'); });

      nav.addEventListener('drop', function(e) {

          e.preventDefault();

          this.classList.remove('drag-over');

          reparentMap(e.dataTransfer.getData('text/plain'), null);

      });

  });



  // Switch the active item of the current campaign (used by sidebar clicks and map portals).

  function navigateToMap(mapId, landRoomId) {

      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return false; // the GM drives the stage

      var camp = getActiveCampaign();

      if (!camp || !camp.items[mapId]) return false;

      camp.activeItemId = mapId;
      state.selId = null; state.selWbId = null; state.selWbIds = []; state.linkStart = null;
      if (!landRoomId && window.wpApplyRememberedView) window.wpApplyRememberedView();   // a landing room picks its own view below

      // Arrive ON the landing room, not at the map's saved home: the camera
      // targets the room card (data view) or its linked whiteboard item, and
      // the room / item comes up selected so the Properties panel shows it.
      var dest = camp.items[mapId];
      var land = landRoomId && (dest.rooms || []).find(function(r) { return r.id === landRoomId; });
      if (land) {
          var pt = landingPoint(dest, land);
          dest.meta = dest.meta || {};
          dest.meta.lastX = pt.dataX; dest.meta.lastY = pt.dataY;
          if (pt.wbX != null) { dest.meta.lastWbX = pt.wbX; dest.meta.lastWbY = pt.wbY; }
          if (state.viewMode === 'data') state.selId = land.id;
          else if (pt.wbItemId) { state.selWbId = pt.wbItemId; state.selWbIds = [pt.wbItemId]; }
      }

      updateSidebarNav();

      render(); save(true);

      restoreCameraPosition();

      return true;

  }



export {

    updateCampaignSelect,

    updateSidebarNav,

    navigateToMap

};

