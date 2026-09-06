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

          return '<div class="sidebar-item' + (isActive ? ' active' : '') + '" data-id="' + item.id + '" draggable="true"' +

                 ' style="position:relative; padding-left:' + (10 + depth * 14) + 'px;">' +

                 caret + '<span class="si-title">' + esc(item.meta.title || 'Unnamed') + '</span>' +

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

      mNav.innerHTML = treeHtml('map') || '<div class="nav-empty">No maps yet — press + above to create your first location.</div>';



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
                menu.style.left = e.pageX + 'px';
                menu.style.top = e.pageY + 'px';
                menu.dataset.id = this.dataset.id;
                var activeC = getActiveCampaign();
                var it = activeC && activeC.items[this.dataset.id];
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

