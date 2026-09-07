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

import { uid, clone, createNewCampaign, createNewMap, createNewPlanner, getActiveCampaign, getActiveMap } from './models.js';

import { load, updateUndoBtn, pushHistory, undo, save, download, getBase64Image } from './io.js';

import { updateCampaignSelect, updateSidebarNav } from './sidebar.js';

import { renderPlanner, renderPlannerPreview } from './planner.js';

import { renderDataMap, clearSnaps, drawSnap, doSmartSnapping, attachDrag, attachPanning, isLinkMode, setLinkMode, removeLinkAt } from './datamap.js';

import { renderWhiteboard, attachResizeHandle, attachRotateHandle, addWbItem, uploadImageFile } from './whiteboard.js';

import { getRoomInspectorHtml, attachRoomInspectorEvents, renderInspector,  renderElementList, esc } from './inspector.js';



  function showPrompt(title, defaultText, callback) {

      var p = document.getElementById('customPrompt');

      document.getElementById('customPromptTitle').textContent = title;

      var inp = document.getElementById('customPromptInput');

      inp.value = defaultText || '';

      p.style.display = 'flex';

      inp.focus();

      inp.select();

      

      var okBtn = document.getElementById('customPromptOk');

      var cancelBtn = document.getElementById('customPromptCancel');

      

      function cleanup() {

          p.style.display = 'none';

          okBtn.onclick = null;

          cancelBtn.onclick = null;

          inp.onkeydown = null;

      }

      

      okBtn.onclick = function() {

          cleanup();

          callback(inp.value);

      };

      

      cancelBtn.onclick = function() {

          cleanup();

          callback(null);

      };

      

      inp.onkeydown = function(e) {

          if (e.key === 'Enter') okBtn.onclick();

          if (e.key === 'Escape') cancelBtn.onclick();

      };

  }



  function showConfirm(title, callback) {

      var p = document.getElementById('customConfirm');

      document.getElementById('customConfirmTitle').textContent = title;

      p.style.display = 'flex';

      

      var okBtn = document.getElementById('customConfirmOk');

      var cancelBtn = document.getElementById('customConfirmCancel');

      

      function cleanup() {

          p.style.display = 'none';

          okBtn.onclick = null;

          cancelBtn.onclick = null;

          document.removeEventListener('keydown', handleKey);

      }

      

      okBtn.onclick = function() { cleanup(); callback(true); };

      cancelBtn.onclick = function() { cleanup(); callback(false); };

      

      function handleKey(e) {

          if (e.key === 'Enter') okBtn.onclick();

          if (e.key === 'Escape') cancelBtn.onclick();

      }

      document.addEventListener('keydown', handleKey);

  }



  // One-button variant of showConfirm, for event messages and notices.

  function showAlert(message, callback) {

      var cancelBtn = document.getElementById('customConfirmCancel');

      cancelBtn.style.display = 'none';

      showConfirm(message, function(ok) {

          cancelBtn.style.display = '';

          if (callback) callback(ok);

      });

  }





  function isCampaignNameTaken(name, ignoreId) {

      for(var k in state.appState.campaigns) {

          if (k !== ignoreId && state.appState.campaigns[k].name.toLowerCase() === name.trim().toLowerCase()) return true;

      }

      return false;

  }

  

  function getUniqueCampaignTitle(baseTitle, ignoreId) {

      if (!isCampaignNameTaken(baseTitle, ignoreId)) return baseTitle;

      var counter = 2;

      while (isCampaignNameTaken(baseTitle + ' (' + counter + ')', ignoreId)) {

          counter++;

      }

      return baseTitle + ' (' + counter + ')';

  }



  function promptForCampaignName(initialTitle, promptMsg, ignoreId, callback) {

      showPrompt(promptMsg, initialTitle, function(title) {

          if (!title) return;

          title = title.trim();

          if (isCampaignNameTaken(title, ignoreId)) {

              var unique = getUniqueCampaignTitle(title, ignoreId);

              promptForCampaignName(unique, "Name exists! Try this instead:", ignoreId, callback);

          } else {

              callback(title);

          }

      });

  }



  function isItemNameTaken(name, ignoreId) {

      var camp = getActiveCampaign();

      if(!camp) return false;

      for(var k in camp.items) {

          if (k !== ignoreId && camp.items[k].meta.title.toLowerCase() === name.trim().toLowerCase()) return true;

      }

      return false;

  }

  

  function getUniqueItemTitle(baseTitle, ignoreId) {

      if (!isItemNameTaken(baseTitle, ignoreId)) return baseTitle;

      var counter = 2;

      while (isItemNameTaken(baseTitle + ' (' + counter + ')', ignoreId)) {

          counter++;

      }

      return baseTitle + ' (' + counter + ')';

  }



  function promptForItemName(initialTitle, promptMsg, ignoreId, callback) {

      showPrompt(promptMsg, initialTitle, function(title) {

          if (!title) return;

          title = title.trim();

          if (isItemNameTaken(title, ignoreId)) {

              var unique = getUniqueItemTitle(title, ignoreId);

              promptForItemName(unique, "Name exists! Try this instead:", ignoreId, callback);

          } else {

              callback(title);

          }

      });

  }



  campaignSelect.addEventListener('change', function() {

      state.appState.activeCampaignId = this.value;

      state.selId = null; state.selWbId = null; state.linkStart = null;

      updateSidebarNav(); render(); save(true);

      setTimeout(function(){ document.getElementById('centerBtn').click(); }, 10);

  });



  var _el_newCampBtn = document.getElementById('newCampBtn');

if(_el_newCampBtn) _el_newCampBtn.addEventListener('click', function() {

      var initial = getUniqueCampaignTitle("My New Campaign", null);

      promptForCampaignName(initial, "Enter new campaign name:", null, function(title) {

          var newCamp = createNewCampaign(title);

          state.appState.campaigns[newCamp.id] = newCamp;

          state.appState.activeCampaignId = newCamp.id;

          state.selId = null; state.selWbId = null; state.linkStart = null;

          updateCampaignSelect(); updateSidebarNav(); render(); save(true);

      });

  });



  var _el_renameCampBtn = document.getElementById('renameCampBtn');

if(_el_renameCampBtn) _el_renameCampBtn.addEventListener('click', function() {

      var camp = getActiveCampaign();

      if(!camp) return;

      promptForCampaignName(camp.name, "Rename campaign:", camp.id, function(title) {

          camp.name = title;

          updateCampaignSelect(); save(true);

      });

  });



  var _el_delCampBtn = document.getElementById('delCampBtn');

if(_el_delCampBtn) _el_delCampBtn.addEventListener('click', function() {

      var keys = Object.keys(state.appState.campaigns);

      if(keys.length <= 1) { toast("Cannot delete the last campaign."); return; }

      showConfirm("Are you sure you want to delete this campaign? This cannot be undone.", function(yes) {

          if(yes) {

              delete state.appState.campaigns[state.appState.activeCampaignId];

              state.appState.activeCampaignId = Object.keys(state.appState.campaigns)[0];

              state.selId = null; state.selWbId = null; state.linkStart = null;

              updateCampaignSelect(); updateSidebarNav(); render(); save(true);

          }

      });

  });

  

  var _el_newMapSidebarBtn = document.getElementById('newMapSidebarBtn');

if(_el_newMapSidebarBtn) _el_newMapSidebarBtn.addEventListener('click', function() {

      var initial = getUniqueItemTitle("My New Map", null);

      promptForItemName(initial, "Enter new map name:", null, function(title) {

          var newMap = createNewMap(title);

          var camp = getActiveCampaign();

          camp.items[newMap.id] = newMap;

          camp.activeItemId = newMap.id;

          state.selId = null; state.selWbId = null; state.linkStart = null;

          updateSidebarNav(); render(); save(true);

      });

  });



  var _el_newPlannerBtn = document.getElementById('newPlannerBtn');

if(_el_newPlannerBtn) _el_newPlannerBtn.addEventListener('click', function() {

      var initial = getUniqueItemTitle("My New Planner", null);

      promptForItemName(initial, "Enter new planner name:", null, function(title) {

          var newPlan = createNewPlanner(title);

          var camp = getActiveCampaign();

          camp.items[newPlan.id] = newPlan;

          camp.activeItemId = newPlan.id;

          state.selId = null; state.selWbId = null; state.linkStart = null;

          updateSidebarNav(); render(); save(true);

      });

  });



  var _el_ctxNewChildItem = document.getElementById('ctxNewChildItem');
if(_el_ctxNewChildItem) _el_ctxNewChildItem.addEventListener('click', function() {
      var menu = document.getElementById('sidebarContextMenu');
      menu.style.display = 'none';
      var camp = getActiveCampaign();
      if(!camp) return;
      var parentId = menu.dataset.id;
      var parent = camp.items[parentId];
      if(!parent || (parent.type !== 'map' && parent.type !== 'planner')) return;
      var isPlannerParent = parent.type === 'planner';
      var initial = getUniqueItemTitle(isPlannerParent ? "New Page" : "New Area", null);
      promptForItemName(initial, "Enter a name for the new nested " + (isPlannerParent ? "planner" : "map") + ":", null, function(title) {
          var newItem = isPlannerParent ? createNewPlanner(title) : createNewMap(title);
          newItem.meta.parentId = parentId;
          parent.meta.collapsed = false;
          camp.items[newItem.id] = newItem;
          camp.activeItemId = newItem.id;
          state.selId = null; state.selWbId = null; state.linkStart = null;
          updateSidebarNav(); render(); save(true);
      });
  });

  var _el_ctxRenameItem = document.getElementById('ctxRenameItem');
if(_el_ctxRenameItem) _el_ctxRenameItem.addEventListener('click', function() {
      var menu = document.getElementById('sidebarContextMenu');
      menu.style.display = 'none';
      var camp = getActiveCampaign();
      if(!camp) return;
      var id = menu.dataset.id;
      var item = camp.items[id];
      if(!item) return;
      promptForItemName(item.meta.title, "Rename item:", id, function(title) {
          item.meta.title = title;
          updateSidebarNav(); render(); save(true);
      });
  });
  

  var _el_ctxDeleteItem = document.getElementById('ctxDeleteItem');
  if(_el_ctxDeleteItem) _el_ctxDeleteItem.addEventListener('click', function() {
      var menu = document.getElementById('sidebarContextMenu');
      menu.style.display = 'none';
      var camp = getActiveCampaign();
      if(!camp) return;
      var id = menu.dataset.id;
      
      var keys = Object.keys(camp.items);
      if(keys.length <= 1) { toast("Cannot delete the last item in a campaign."); return; }
      
      showConfirm("Are you sure you want to delete this item? This cannot be undone.", function(yes) {
          if(yes) {
              // Promote any nested children to the deleted item's parent
              var removed = camp.items[id];
              if (removed) {
                  var newParent = (removed.meta && removed.meta.parentId) || null;
                  Object.values(camp.items).forEach(function(it) {
                      if (it.meta && it.meta.parentId === id) it.meta.parentId = newParent;
                  });
              }
              delete camp.items[id];
              if (camp.activeItemId === id) { camp.activeItemId = Object.keys(camp.items)[0] || null; state.viewMode = 'data'; }
              updateSidebarNav(); render(); save(true);
              if (window.appRestoreCamera) window.appRestoreCamera();
          }
      });
  });
  
  // Close context menu on document click
  document.addEventListener('click', function(e) {
      var menu = document.getElementById('sidebarContextMenu');
      if(menu && menu.style.display !== 'none' && e.target.id !== 'sidebarContextMenu' && !e.target.closest('#sidebarContextMenu')) {
          menu.style.display = 'none';
      }
  });



  var _el_delItemBtn = document.getElementById('delItemBtn');

if(_el_delItemBtn) _el_delItemBtn.addEventListener('click', function() {

      var camp = getActiveCampaign();

      var keys = Object.keys(camp.items);

      if(keys.length <= 1) { toast("Cannot delete the last item in a campaign."); return; }

      showConfirm("Are you sure you want to delete this item? This cannot be undone.", function(yes) {

          if(yes) {

              delete camp.items[camp.activeItemId];

              camp.activeItemId = Object.keys(camp.items)[0];

              state.selId = null; state.selWbId = null; state.linkStart = null;

              updateSidebarNav(); render(); save(true);

          }

      });

  });



  
  var _el_searchPlannersBtn = document.getElementById('searchPlannersBtn');
  if(_el_searchPlannersBtn) _el_searchPlannersBtn.addEventListener('click', function() {
      var camp = getActiveCampaign();
      if(!camp) return;
      var m = document.getElementById('plannerSearchModal');
      var inp = document.getElementById('plannerSearchInput');
      var res = document.getElementById('plannerSearchResults');
      m.style.display = 'flex';
      inp.value = '';
      inp.focus();
      function updateList() {
          var q = inp.value.toLowerCase();
          var html = '';
          var plannerKeys = Object.keys(camp.items).filter(k => camp.items[k].type === 'planner');
          plannerKeys.sort((a,b) => camp.items[a].meta.title.localeCompare(camp.items[b].meta.title));
          plannerKeys.forEach(k => {
              var p = camp.items[k];
              var title = p.meta.title || '';
              if (title.toLowerCase().indexOf(q) !== -1 || q === '') {
                  html += '<button class="tool ghost" style="text-align:left; padding:8px;" data-id="'+k+'">' + esc(title) + '</button>';
              }
          });
          if (!html) html = '<div class="muted">No items found.</div>';
          res.innerHTML = html;
          res.querySelectorAll('button').forEach(btn => {
              btn.addEventListener('click', function() {
                  m.style.display = 'none';
                  camp.activeItemId = this.dataset.id;
                  state.selId = null; state.selWbId = null; state.linkStart = null;
                  updateSidebarNav(); render(); save(true);
                  setTimeout(function(){ if(document.getElementById('centerBtn')) document.getElementById('centerBtn').click(); }, 10);
              });
          });
      }
      inp.onkeyup = updateList;
      updateList();
      var closeBtn = document.getElementById('plannerSearchClose');
      if(closeBtn) closeBtn.onclick = function() { m.style.display = 'none'; };
  });

  var _el_searchMapsBtn = document.getElementById('searchMapsSidebarBtn');

if(_el_searchMapsBtn) _el_searchMapsBtn.addEventListener('click', function() {

      var camp = getActiveCampaign();

      if(!camp) return;

      

      var m = document.getElementById('mapSearchModal');

      var inp = document.getElementById('mapSearchInput');

      var res = document.getElementById('mapSearchResults');

      

      m.style.display = 'flex';

      inp.value = '';

      inp.focus();

      

      function updateList() {

          var q = inp.value.toLowerCase();

          var html = '';

          var mapKeys = Object.keys(camp.items).filter(k => camp.items[k].type === 'map');   // maps only; planners have their own search

          mapKeys.sort((a,b) => camp.items[a].meta.title.localeCompare(camp.items[b].meta.title));

          

          mapKeys.forEach(k => {

              var map = camp.items[k];

              var title = map.meta.title || '';

              if (title.toLowerCase().indexOf(q) !== -1 || q === '') {

                  html += '<button class="tool ghost" style="text-align:left; padding:8px;" data-id="'+k+'">' + esc(title) + '</button>';

              }

          });

          if (!html) html = '<div class="muted">No items found.</div>';

          res.innerHTML = html;

          

          res.querySelectorAll('button').forEach(btn => {

              btn.addEventListener('click', function() {

                  m.style.display = 'none';

                  camp.activeItemId = this.dataset.id;

                  state.selId = null; state.selWbId = null; state.linkStart = null;

                  updateSidebarNav(); render(); save(true);

                  setTimeout(function(){ document.getElementById('centerBtn').click(); }, 10);

              });

          });

      }

      

      updateList();

      inp.oninput = updateList;

  });

  

  var _el_mapSearchClose = document.getElementById('mapSearchClose');

if(_el_mapSearchClose) _el_mapSearchClose.addEventListener('click', function() {

      document.getElementById('mapSearchModal').style.display = 'none';

  });





  /* ---------- render ---------- */

export {

    showPrompt,

    showConfirm,

    showAlert,

    isCampaignNameTaken,

    getUniqueCampaignTitle,

    promptForCampaignName,

    isItemNameTaken,

    getUniqueItemTitle,

    promptForItemName

};



  /* Campaign search (the header magnifier): campaigns only — maps and planners have their own searches */
  var _el_searchCampBtn = document.getElementById('searchCampBtn');
  if (_el_searchCampBtn) _el_searchCampBtn.addEventListener('click', function() {
      var m = document.getElementById('campSearchModal'), inp = document.getElementById('campSearchInput'), res = document.getElementById('campSearchResults');
      if (!m || !inp || !res) return;
      m.style.display = 'flex';
      inp.value = '';
      inp.focus();
      function updateList() {
          var q = inp.value.toLowerCase();
          var keys = Object.keys(state.appState.campaigns || {});
          keys.sort(function(a, b) { return String(state.appState.campaigns[a].name || '').localeCompare(String(state.appState.campaigns[b].name || '')); });
          var html = '';
          keys.forEach(function(k) {
              var c = state.appState.campaigns[k], name = c.name || 'Unnamed Campaign';
              if (q && name.toLowerCase().indexOf(q) === -1) return;
              var nMaps = Object.values(c.items || {}).filter(function(i) { return i.type === 'map'; }).length, nPl = Object.values(c.items || {}).filter(function(i) { return i.type === 'planner'; }).length;
              html += '<button class="tool ghost" style="text-align:left; padding:8px;" data-id="' + k + '">' + esc(name) + (k === state.appState.activeCampaignId ? ' <span style="color:var(--gold); font-size:11px;">current</span>' : '') + '<span style="color:var(--dim); font-size:11px; float:right;">' + nMaps + ' map' + (nMaps === 1 ? '' : 's') + ' · ' + nPl + ' planner' + (nPl === 1 ? '' : 's') + '</span></button>';
          });
          if (!html) html = '<div class="muted">No campaigns match.</div>';
          res.innerHTML = html;
          res.querySelectorAll('button').forEach(function(btn) {
              btn.addEventListener('click', function() {
                  m.style.display = 'none';
                  if (this.dataset.id === state.appState.activeCampaignId) return;
                  state.appState.activeCampaignId = this.dataset.id;
                  state.selId = null; state.selWbId = null; state.linkStart = null;
                  updateCampaignSelect(); updateSidebarNav(); render(); save(true);
                  setTimeout(function() { var cb = document.getElementById('centerBtn'); if (cb) cb.click(); }, 10);
              });
          });
      }
      inp.onkeyup = updateList;
      updateList();
      var closeBtn = document.getElementById('campSearchClose');
      if (closeBtn) closeBtn.onclick = function() { m.style.display = 'none'; };
  });
