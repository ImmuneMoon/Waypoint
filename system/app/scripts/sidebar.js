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

import { uid, clone, createNewCampaign, createNewMap, createNewPlanner, getActiveCampaign, getActiveMap, getMapParentId, getMapChildren, getMapAncestors, isMapDescendantOf, isTreeItem, findLandingRoom, landingPoint } from './models.js';

import { load, updateUndoBtn, pushHistory, undo, save, saveSwitch, download, getBase64Image } from './io.js';

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

  // Manual sibling order for maps / planners. When a user drags one above/below another, renumber every
  // sibling so the moved one lands in the right slot; siblings without an index up to that point pick one up.
  function reorderMap(dragId, targetId, position) {
      var camp = getActiveCampaign(); if (!camp) return;
      var it = camp.items[dragId], target = camp.items[targetId];
      if (!it || !target || it === target) return;
      if (it.type !== target.type) { toast('Maps re-order among maps, planners among planners.'); return; }
      if (isMapDescendantOf(camp, targetId, dragId)) { toast("An item can't be moved into its own child."); return; }
      var parentId = getMapParentId(camp, target);   // normalized: matches how getMapChildren groups, so a dangling/cross-type raw parentId on the neighbor can't desync the two
      it.meta.parentId = parentId;
      var sibs = getMapChildren(camp, parentId, it.type).filter(function(x) { return x !== it; });
      var at = sibs.indexOf(target);
      if (at < 0) return;
      var insertAt = position === 'after' ? at + 1 : at;
      sibs.splice(insertAt, 0, it);
      sibs.forEach(function(s, i) { s.meta.sortIndex = (i + 1) * 10; });
      save(true); updateSidebarNav();
  }

  // Move a map or planner one slot up (dir -1) or down (dir +1) among its same-type siblings.
  // Reuses reorderMap, so the whole nest under the moved row travels with it and the order is saved.
  function moveItem(id, dir) {
      var camp = getActiveCampaign(); if (!camp) return;
      var it = camp.items[id]; if (!isTreeItem(it)) return;
      var sibs = getMapChildren(camp, getMapParentId(camp, it), it.type);
      var at = sibs.indexOf(it); if (at < 0) return;
      var swap = sibs[at + dir];
      if (!swap) { toast(dir < 0 ? 'Already at the top.' : 'Already at the bottom.'); return; }
      reorderMap(id, swap.id, dir < 0 ? 'before' : 'after');
  }

  function reparentMap(id, newParentId) {

      var camp = getActiveCampaign();

      if (!camp) return;

      var item = camp.items[id];

      if (!isTreeItem(item)) return;

      newParentId = newParentId || null;

      var curParent = (item.meta && item.meta.parentId) || null;

      if (id === newParentId || curParent === newParentId) return;

      if (newParentId) {

          var target = camp.items[newParentId];

          if (!target || target.type !== item.type) { toast('Maps nest under maps, planners under planners, pages under pages.'); return; }

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
      if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) return;   // another table's map ids never reach preferences.json
      var it = camp.items[camp.activeItemId]; if (!it || it.type !== 'map') return;
      try {
          var list = JSON.parse(localStorage.getItem(recentKey(camp)) || '[]').filter(function(id) { return id !== it.id && camp.items[id]; });
          list.unshift(it.id);
          localStorage.setItem(recentKey(camp), JSON.stringify(list.slice(0, 8)));
      } catch (e) {}
  }
  function mapQuickHtml(camp) {
      noteRecent(camp);
      var pinned = (Array.isArray(camp.pinnedMaps) ? camp.pinnedMaps : []).filter(function(id) { return camp.items[id] && camp.items[id].type === 'map'; });
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
              toast((it.meta.title || 'Planner') + (st === 'next' ? ' is the planner you play next.' : st === 'played' ? ' marked played.' : st === 'skipped' ? ' marked skipped.' : ': status cleared.'));
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
      var su = document.getElementById('ctxSetups'); if (su) su.addEventListener('click', function() { if (!menu) return; var sid = menu.dataset.id; menu.style.display = 'none'; if (window.wpSetups) window.wpSetups.open(sid); });   // backlog 31: the map's set-ups
  })();
  // [lookcheck:opensmenu-start]
  // Right-click → Opens on (1.6.2, backlog 221): the map's own choice of view, read by io.js opensOf. The campaign's choice row names
  // the view Settings gives the campaign; the row in use is marked on. A map that takes the campaign's keeps no key.
  var OPENS_WORDS = { visual: 'Play Map', data: 'Data Map', last: 'As last left' };
  function opensMark(menu, camp, it) {
      var own = it && it.meta && typeof it.meta === 'object' ? it.meta.opensOn : null;
      if (own !== 'visual' && own !== 'data' && own !== 'last') own = '';
      var cv = camp && (camp.opensOn === 'visual' || camp.opensOn === 'data') ? camp.opensOn : 'last';
      menu.querySelectorAll('.ctx-opens').forEach(function(x) { x.classList.toggle('on', x.dataset.opens === own); });
      var now = menu.querySelector('.ctx-opens-now'); if (now) now.textContent = '(' + OPENS_WORDS[cv] + ')';
  }
  function opensSet(id, v) {
      var camp = getActiveCampaign(), it = camp && camp.items[id]; if (!it || it.type !== 'map') return;
      it.meta = it.meta && typeof it.meta === 'object' ? it.meta : {};
      var was = it.meta.opensOn === 'visual' || it.meta.opensOn === 'data' || it.meta.opensOn === 'last' ? it.meta.opensOn : '';
      if (v !== 'visual' && v !== 'data' && v !== 'last') v = '';
      if (v === was) return;
      if (v) it.meta.opensOn = v; else delete it.meta.opensOn;
      save(true);
      var cv = camp.opensOn === 'visual' || camp.opensOn === 'data' ? camp.opensOn : 'last';
      toast((it.meta.title || 'This map') + (v ? ' opens on ' + (v === 'last' ? 'the view it was last left in.' : 'its ' + OPENS_WORDS[v] + '.') : ' opens on the campaign’s choice, ' + (cv === 'last' ? 'the view it was last left in.' : 'its ' + OPENS_WORDS[cv] + '.')));
  }
  (function wireOpensMenu() {
      var menu = document.getElementById('sidebarContextMenu'); if (!menu) return;
      menu.querySelectorAll('.ctx-opens').forEach(function(x) {
          x.addEventListener('click', function() { var id = menu.dataset.id; menu.style.display = 'none'; opensSet(id, this.dataset.opens); });
      });
  })();
  // [lookcheck:opensmenu-end]
  // Right-click → Move Up / Move Down. Wired once to the static menu items; the open handler
  // in updateSidebarNav decides which are shown and grays out the ends of a list.
  (function wireMoveMenu() {
      var up = document.getElementById('ctxMoveUp'), down = document.getElementById('ctxMoveDown'), menu = document.getElementById('sidebarContextMenu');
      function go(dir) {
          return function() {
              if (!menu) return;
              menu.style.display = 'none';   // close on any click, like every other menu item
              if (this.classList.contains('disabled')) return;   // grayed at the end of a list: no-op
              moveItem(menu.dataset.id, dir);
          };
      }
      if (up) up.addEventListener('click', go(-1));
      if (down) down.addEventListener('click', go(1));
  })();
// [lookcheck:panelbare-start]
// What a joined player's left panel holds (1.5.4). With nothing to read and no character of their own the whole panel steps aside
// (style.css body.net-client.no-handbook). With a character and no page the Handbook section and its rail icon alone step aside: a player
// writes no pages, so the words of an empty Handbook are not theirs. The GM's own panel is never touched. chN: how many characters the
// Characters section lists on this screen
function panelBare(foreign, chN, hasDoc) { return !!foreign && !(chN > 0) && !hasDoc; }
function panelHasDoc(items) { return !!items && typeof items === 'object' && Object.keys(items).some(function(k) { var it = items[k]; return !!it && typeof it === 'object' && it.type === 'doc'; }); }
function panelHeld(doc, foreign, chN, hasDoc) {
    var dn = doc.getElementById('docNavList'), hs = dn && dn.closest ? dn.closest('.sidebar-section') : null, rh = doc.getElementById('railHandbook'), off = !!foreign && !hasDoc;
    if (hs) hs.hidden = off;
    if (rh) rh.hidden = off;
    doc.body.classList.toggle('no-handbook', panelBare(foreign, chN, hasDoc));
    return off;
}
// [lookcheck:panelbare-end]
// The one place the class and the Handbook's own stepping aside are written: asked by the Characters section's sync (charlist.js), which
// runs at every redraw of the panel and of the board, and by the panel itself while that module is not there yet
// [lookcheck:prespop-start]
// 1.6.2 (the owner: a map's faces overlap, a few on the row and the rest in a list over the panel, sorted by who arrived last or first, a press
// in the list jumping to that player on that map). Four faces show (PRES_SHOWN); the order is this computer's own (wp_presOrder: 'first', else
// newest first). Players there now come before those last seen there, and a time the app does not know comes last in either order
var PRES_SHOWN = 4;
function presOrder() { try { return localStorage.getItem('wp_presOrder') === 'first' ? 'first' : 'new'; } catch (e) { return 'new'; } }
function presSort(list, order) {
    var l = (Array.isArray(list) ? list : []).filter(function(p) { return p && typeof p === 'object'; }).map(function(p, i) { return { p: p, i: i }; });
    l.sort(function(a, b) {
        if (!!a.p.connected !== !!b.p.connected) return a.p.connected ? -1 : 1;
        var x = Number(a.p.at) > 0 ? Number(a.p.at) : 0, y = Number(b.p.at) > 0 ? Number(b.p.at) : 0;
        if (x !== y) { if (!x || !y) return x ? -1 : 1; return order === 'first' ? x - y : y - x; }
        return a.i - b.i;
    });
    return l.map(function(e) { return e.p; });
}
var _presPop = null, _presFor = null, _presT = 0;
function presPopEl() {
    if (_presPop) return _presPop;
    var d = document.createElement('div'); d.id = 'presPop'; d.className = 'pres-pop'; d.setAttribute('role', 'menu'); d.style.display = 'none';
    document.body.appendChild(d);
    d.addEventListener('mouseenter', function() { clearTimeout(_presT); });
    d.addEventListener('mouseleave', presLater);
    d.addEventListener('click', function(e) {
        var b = e.target && e.target.closest ? e.target.closest('.pres-row') : null; if (!b) return;
        presHide();
        if (window.wpFocusPlayerOn) window.wpFocusPlayerOn(b.dataset.pid, b.dataset.map, b.dataset.name);
    });
    d.addEventListener('keydown', function(e) {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
        var rows = Array.prototype.slice.call(d.querySelectorAll('.pres-row')), at = rows.indexOf(document.activeElement);
        var n = rows[(at + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length]; if (n) { n.focus(); e.preventDefault(); }
    });
    return (_presPop = d);
}
function presHide() { clearTimeout(_presT); if (_presPop) _presPop.style.display = 'none'; _presFor = null; }
function presLater() { clearTimeout(_presT); _presT = setTimeout(presHide, 200); }
function presShow(box, focus) {
    var net = window.wpNet, mapId = box && box.dataset ? box.dataset.map : '';
    if (!net || !mapId || typeof net.playersOnMap !== 'function') return;
    var list = presSort(net.playersOnMap(mapId) || [], presOrder()); if (!list.length) return;
    var d = presPopEl(), camp = getActiveCampaign(), m = camp && camp.items ? camp.items[mapId] : null;
    clearTimeout(_presT); _presFor = box; d.textContent = '';
    var h = document.createElement('div'); h.className = 'pres-head';
    h.textContent = 'On ' + ((m && m.meta && m.meta.title) || 'this map') + ' \u00b7 ' + list.length; d.appendChild(h);
    list.forEach(function(p) {
        var nm = String(p.name || ''), b = document.createElement('button');
        b.type = 'button'; b.className = 'pres-row' + (p.connected ? '' : ' off'); b.setAttribute('role', 'menuitem');
        b.dataset.pid = String(p.id || ''); b.dataset.map = mapId; b.dataset.name = nm; b.title = 'Jump to ' + (nm || 'this player') + ' on this map';
        var img = document.createElement('img'); img.alt = '';
        img.src = net.safeAvatar && net.safeAvatar(p.avatar) ? p.avatar : (window.wpDefaultAvatar ? window.wpDefaultAvatar(p.color || ('hsl(' + (p.hue || 0) + ',55%,55%)')) : '');
        var t = document.createElement('span'); t.className = 'pres-name'; t.textContent = nm || 'A player';
        var s = document.createElement('small'); s.textContent = p.connected ? 'Here now' : 'Last seen here';
        b.appendChild(img); b.appendChild(t); b.appendChild(s); d.appendChild(b);
    });
    d.style.display = 'flex';
    var r = box.getBoundingClientRect(), w = d.offsetWidth, ht = d.offsetHeight;
    var left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8)), top = r.bottom + 4;
    // 1.6.4 window bar: kept below the strip the desktop app draws at the window's top (wpWinBarH, 0 in a browser)
    if (top + ht > window.innerHeight - 8) top = Math.max(8 + (window.wpWinBarH ? window.wpWinBarH() : 0), r.top - ht - 4);
    d.style.left = Math.round(left) + 'px'; d.style.top = Math.round(top) + 'px';
    if (focus) { var f = d.querySelector('.pres-row'); if (f) f.focus(); }
}
(function presWire() {
    if (typeof document === 'undefined' || !document.addEventListener) return;
    var boxOf = function(e) { return e.target && e.target.closest ? e.target.closest('.si-presence') : null; };
    document.addEventListener('mouseover', function(e) { var b = boxOf(e); if (!b) return; if (b !== _presFor) presShow(b); else clearTimeout(_presT); });
    document.addEventListener('mouseout', function(e) { var b = boxOf(e); if (b && !(e.relatedTarget && b.contains(e.relatedTarget))) presLater(); });
    document.addEventListener('click', function(e) {   // the faces open their list, never the map's row under them
        var b = boxOf(e); if (!b) return;
        e.stopPropagation(); e.preventDefault();
        if (_presFor === b && _presPop && _presPop.style.display !== 'none') presHide(); else presShow(b);
    }, true);
    document.addEventListener('keydown', function(e) {
        var b = boxOf(e); if (!b || (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'ArrowDown')) return;
        e.preventDefault(); e.stopPropagation(); presShow(b, true);
    }, true);
    document.addEventListener('pointerdown', function(e) {
        if (!_presPop || _presPop.style.display === 'none') return;
        if (_presPop.contains(e.target) || boxOf(e)) return;
        presHide();
    }, true);
})();
// [lookcheck:prespop-end]
function panelJudge(chN) { var camp = getActiveCampaign(); return panelHeld(document, !!(window.wpNet && window.wpNet.foreign), chN, panelHasDoc(camp && camp.items)); }

// [shelfcheck:treekeys-start]
/* 1.6.3 (the review of pages, finding 4): the left panel's three lists of the tree (Maps, Planners, the Handbook) are trees for the keyboard,
   as a file tree is. Each list is role tree and each row a treeitem with ONE tab stop a list (a roving tabindex): Tab reaches the row last
   used, or the one open, and the arrow keys go from there. Up and Down move a row, Home and End to the ends, Right opens a row's nest or goes
   into it, Left closes it or goes to the row above it, Enter or Space opens the row as a click does, F2 renames it (the GM's alone, as a
   double-click does) and Shift+F10 or the menu key opens its right-click menu. Nothing new happens: each key presses what a pointer already
   does there (the row's click, its caret's click, its right-click), so a player's read-only tree stays read only.
   The rows are drawn again on every change of the tree (updateSidebarNav writes each list whole), so the row that held the focus is found
   again by its id afterwards (treeFocusOf before the draw, treeSync after it).
   And a double-click to rename (finding 36, Fulllion, 2026-11-21: "A double-click on a tree row renames it and puts the view back where it
   was. A single click still opens at once."): the first click of a double-click has already opened the row, so the click notes what was on
   screen before it (treeOpenNote) and the double-click puts that back (treeBackFor) before it asks for the new name */
var TREE_LISTS = ['mapNavList', 'plannerNavList', 'docNavList'], TREE_NAMES = { mapNavList: 'Maps', plannerNavList: 'Planners', docNavList: 'Handbook pages' }, TREE_DBL_MS = 500;   // about the system's own double-click time: a click and a double-click further apart than this are two acts
/* The review of pages finding (4): the tree holds the keys only while the keyboard is using it. A row has a tabindex, so a press of the
   pointer on it gives it the focus, and the board keeps a later click from moving the focus away again: the arrows, Delete and Space then
   went to a hidden row and Space opened another map. So a pointer press marks its list (nav._wpTreePtr) and treeSync gives the focus back
   after a redraw only where the last thing done in the list was a key; a key in a list that is not shown (a panel folded to its rail has no
   width) is left to the page and the row lets the focus go; and a press anywhere outside the list lets the row's focus go (treePressAway). */
// Whether a list of the tree is shown: some box of it has a width. A list with no layout to ask (a suite's page of plain objects) counts as shown
function treeShown(nav) {
    if (!nav) return false;
    if (typeof nav.getClientRects !== 'function') return true;
    var rs = nav.getClientRects() || [];
    for (var i = 0; i < rs.length; i++) if (rs[i] && rs[i].width > 0) return true;
    return false;
}
// A press of the pointer at target t: where a row of the tree holds the focus and t is outside that row's list, the row lets the focus go,
// so the map's own keys reach the map again. Answers whether it did. Wired once on the document in the capture phase, below the slice
function treePressAway(doc, t) {
    var a = doc && doc.activeElement;
    if (!a || !a.classList || !a.classList.contains('sidebar-item') || !a.parentNode || TREE_LISTS.indexOf(a.parentNode.id) < 0) return false;
    if (t && typeof a.parentNode.contains === 'function' && a.parentNode.contains(t)) return false;
    if (typeof a.blur === 'function') a.blur();
    return true;
}
// What a key does on a row. rows: the rows of one list in order, each { d: depth, kids: has a nest, open: its nest is shown }. Answers
// { to: index } to move the focus, { act } for open, expand, collapse, rename or menu, or null for a key the tree leaves alone
function treeKeyAct(rows, i, key, shift) {
    var n = Array.isArray(rows) ? rows.length : 0; if (!n || !(i >= 0 && i < n)) return null;
    var r = rows[i] || {};
    if (key === 'ArrowDown') return { to: Math.min(n - 1, i + 1) };
    if (key === 'ArrowUp') return { to: Math.max(0, i - 1) };
    if (key === 'Home') return { to: 0 };
    if (key === 'End') return { to: n - 1 };
    if (key === 'ArrowRight') { if (!r.kids) return { to: i }; if (!r.open) return { act: 'expand' }; return { to: i + 1 < n && rows[i + 1].d > r.d ? i + 1 : i }; }
    if (key === 'ArrowLeft') { if (r.kids && r.open) return { act: 'collapse' }; for (var k = i - 1; k >= 0; k--) if (rows[k].d < r.d) return { to: k }; return { to: i }; }
    if (key === 'Enter' || key === ' ') return { act: 'open' };
    if (key === 'F2' && !shift) return { act: 'rename' };
    if (key === 'ContextMenu' || (key === 'F10' && shift)) return { act: 'menu' };
    return null;
}
// The rows of one list (its own children that are rows of the tree), and what treeKeyAct reads of each from the row as drawn
function treeRows(nav) { var out = [], ch = nav && nav.children ? nav.children : []; for (var i = 0; i < ch.length; i++) if (ch[i] && ch[i].classList && ch[i].classList.contains('sidebar-item')) out.push(ch[i]); return out; }
function treeRowInfo(row) { var c = row.querySelector ? row.querySelector('.caret') : null; return { d: parseInt(row.dataset && row.dataset.depth, 10) || 0, kids: !!c, open: !!(c && c.classList.contains('down')) }; }
// Which row of the tree holds the focus now, by its list and its id: { list, id } or null
function treeFocusOf(doc) {
    var a = doc && doc.activeElement; if (!a || !a.classList || !a.classList.contains('sidebar-item') || !a.parentNode) return null;
    var list = a.parentNode.id; return TREE_LISTS.indexOf(list) >= 0 && a.dataset && a.dataset.id ? { list: list, id: a.dataset.id } : null;
}
// After a list is drawn: it is a tree, and one row is its tab stop. The row that held the focus before the draw takes it back; else the
// row last moved to, else the row open, else the first
function treeSync(nav, foc) {
    if (!nav) return null;
    nav.setAttribute('role', 'tree'); if (TREE_NAMES[nav.id]) nav.setAttribute('aria-label', TREE_NAMES[nav.id]);
    var rows = treeRows(nav); if (!rows.length) return null;
    var want = foc && foc.list === nav.id ? foc.id : nav._wpTreeAt || '', stop = null;
    rows.forEach(function(r) { if (!stop && want && r.dataset.id === want) stop = r; });
    if (!stop) rows.forEach(function(r) { if (!stop && r.classList.contains('active')) stop = r; });
    if (!stop) stop = rows[0];
    rows.forEach(function(r) { r.tabIndex = r === stop ? 0 : -1; });
    // the focus comes back only to a row the keyboard was on, in a list that is shown: a row a pointer pressed keeps no focus past the redraw
    if (foc && foc.list === nav.id && stop.dataset.id === foc.id && !nav._wpTreePtr && treeShown(nav) && typeof stop.focus === 'function') stop.focus({ preventScroll: true });
    return stop;
}
// The focus to one row of a list: the one tab stop moves with it
function treeMove(nav, row) {
    treeRows(nav).forEach(function(r) { r.tabIndex = r === row ? 0 : -1; });
    nav._wpTreeAt = row.dataset.id || '';
    if (typeof row.focus === 'function') row.focus();
    if (typeof row.scrollIntoView === 'function') row.scrollIntoView({ block: 'nearest' });
}
// One key listener a list, put on once (the list stays; only its rows are drawn again). deps: rename(id) and menu(row), as the row's own
// double-click and right-click do. A key held with Ctrl, Alt or the command key is left to the page, and so is a key on a control inside a
// row (the faces of who is on a map have keys of their own)
function treeKeysWire(nav, deps) {
    if (!nav || nav._wpTreeKeys) return false;
    nav._wpTreeKeys = true;
    nav.addEventListener('pointerdown', function() { nav._wpTreePtr = true; }, true);   // a pointer press: the focus it gives a row is not the keyboard's
    nav.addEventListener('keydown', function(e) {
        nav._wpTreePtr = false;   // a key in the list: the keyboard is using it
        var row = e.target; if (!row || !row.classList || !row.classList.contains('sidebar-item') || row.parentNode !== nav) return;
        if (!treeShown(nav)) { if (typeof row.blur === 'function') row.blur(); return; }   // a hidden list holds no key: it goes on to the page, and the row lets the focus go
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        var rows = treeRows(nav), i = rows.indexOf(row), a = treeKeyAct(rows.map(treeRowInfo), i, e.key, e.shiftKey); if (!a) return;
        e.preventDefault(); e.stopPropagation();   // the page's own keys never hear it: its arrows would move a selected token, and Space would scroll the panel
        if (typeof a.to === 'number') { if (rows[a.to]) treeMove(nav, rows[a.to]); return; }
        nav._wpTreeAt = row.dataset.id || '';
        if (a.act === 'open') row.click();
        else if (a.act === 'expand' || a.act === 'collapse') { var c = row.querySelector('.caret'); if (c) c.click(); }
        else if (a.act === 'rename' && deps && typeof deps.rename === 'function') deps.rename(row.dataset.id);
        else if (a.act === 'menu' && deps && typeof deps.menu === 'function') deps.menu(row);
    });
    return true;
}
// What was on screen before a click opened a row: { id, prev, view, at }. A click on the row already open notes nothing, so the second click
// of a double-click leaves the first click's note as it is. But a single click on the row already open (detail 1, the click's own count)
// is a fresh act: the earlier open was not the first half of this double-click, so its note goes (the review of pages finding, 36: a
// deliberate open, a pause and then a double-click to rename sent the GM back to the map they had left on purpose)
var _treeWas = null;
function treeOpenNote(camp, id, view, now, detail) {
    if (camp && typeof id === 'string' && camp.activeItemId === id && detail === 1) { _treeWas = null; return false; }
    if (!camp || typeof id !== 'string' || camp.activeItemId === id) return false;
    _treeWas = { id: id, prev: camp.activeItemId, view: view, at: now };
    return true;
}
// For a double-click on a row: what to put back, { prev, view }, where that very row was opened by a click a moment before (TREE_DBL_MS) and
// what was on screen then is still in the campaign; else null. The note is used once
function treeBackFor(camp, id, now) {
    var w = _treeWas; _treeWas = null;
    if (!w || !camp || w.id !== id || camp.activeItemId !== id || !(now - w.at >= 0 && now - w.at < TREE_DBL_MS)) return null;
    if (typeof w.prev !== 'string' || !camp.items || !Object.prototype.hasOwnProperty.call(camp.items, w.prev) || !camp.items[w.prev]) return null;
    return { prev: w.prev, view: w.view };
}
// [shelfcheck:treekeys-end]
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') document.addEventListener('pointerdown', function(e) { treePressAway(document, e.target); }, true);   // the review of pages finding (4): a press elsewhere gives the map its keys back
// Rename a row's map, planner or page: the double-click's and F2's one way. The GM's alone: a received copy is never renamed
function renameTreeItem(id) {
    if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) return;
    var activeC = getActiveCampaign();
    var it = activeC && typeof id === 'string' && Object.prototype.hasOwnProperty.call(activeC.items, id) ? activeC.items[id] : null;
    if (!it || !it.meta) return;
    promptForItemName(it.meta.title || '', 'Rename ' + (it.type === 'planner' ? 'planner' : it.type === 'doc' ? 'page' : 'map') + ':', it.id, function(title) {
        it.meta.title = title;
        it.meta.updated = Date.now();
        save(); updateSidebarNav(); render();
        toast('Renamed to “' + title + '”.');
    });
}
// A row's right-click menu from the keyboard: the row's own contextmenu, at the row's left, a little under its top
function treeMenu(row) {
    var r = row.getBoundingClientRect ? row.getBoundingClientRect() : { left: 0, top: 0 };
    try { row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: Math.round(r.left + 24), clientY: Math.round(r.top + 18) })); } catch (e) {}
}

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



      // Presence dots on a Maps row: who is on that map. GM view only (players are locked to the
      // Handbook and their roster data is stripped). Connected = solid, last-seen-there = dimmed.
      function mapPresenceHtml(mapId) {
          var net = window.wpNet;
          if (!net || (net.active && net.role === 'client') || net.foreign || typeof net.playersOnMap !== 'function') return '';
          var players = presSort(net.playersOnMap(mapId) || [], presOrder());
          if (!players.length) return '';
          var chips = players.slice(0, PRES_SHOWN).map(function(p, pi) {
              var nm = String(p.name || '');
              var initials = (nm.trim().split(/\s+/).map(function(s) { return s[0] || ''; }).join('').slice(0, 2).toUpperCase()) || '?';
              var avOk = !!(net.safeAvatar && net.safeAvatar(p.avatar));   // the whole data URL (net.js), and escaped anyway
              var face = avOk
                  ? '<img src="' + esc(p.avatar) + '" alt="">'
                  : '<img src="' + (window.wpDefaultAvatar ? window.wpDefaultAvatar(p.color || ('hsl(' + (p.hue || 0) + ',55%,55%)')) : '') + '" alt="">';   // no photo → the color-tinted silhouette default
              return '<span class="si-pres' + (p.connected ? '' : ' off') + '" style="z-index:' + (PRES_SHOWN + 1 - pi) + '">' + face + '</span>';   // the first on top, each after it tucked under the one before
          }).join('');
          var extra = players.length > PRES_SHOWN ? '<span class="si-pres si-pres-more">+' + (players.length - PRES_SHOWN) + '</span>' : '';
          return '<span class="si-presence" tabindex="0" role="button" aria-haspopup="true" data-map="' + esc(mapId) + '" aria-label="' + players.length + ' player' + (players.length === 1 ? '' : 's') + ' on this map. Show them">' + chips + extra + '</span>';
      }
      function rowHtml(item, depth, hasKids, collapsed) {

          var isActive = (item.id === camp.activeItemId);

          var caret = hasKids

              ? '<span class="caret' + (collapsed ? '' : ' down') + '" data-id="' + esc(item.id) + '" title="' + (collapsed ? 'Expand' : 'Collapse') + '">&#9654;</span>'

              : '<span class="caret-spacer"></span>';

          var guides = '';
          for (var g = 1; g <= depth; g++) guides += '<span class="tree-guide" style="left:' + (10 + (g - 1) * 14 + 5) + 'px;"></span>';   // under the parent's caret
          return '<div class="sidebar-item tree-item' + (isActive ? ' active' : '') + (depth === 0 ? ' tree-root' : '') + '" data-id="' + esc(item.id) + '" data-depth="' + depth + '" draggable="true" role="treeitem" tabindex="-1" aria-level="' + (depth + 1) + '"' + (hasKids ? ' aria-expanded="' + (collapsed ? 'false' : 'true') + '"' : '') + ' aria-selected="' + (isActive ? 'true' : 'false') + '"' +   // 1.6.3 (finding 4): a row of a tree for the keyboard and a screen reader; treeSync gives one row of the list the tab stop

                 ' style="padding-left:' + (10 + depth * 14) + 'px;">' +

                 guides + caret + (item.type === 'planner' && /^(next|played|skipped)$/.test(item.meta.status) ? '<span class="si-status si-' + item.meta.status + '" title="' + (item.meta.status === 'next' ? 'Next scene' : item.meta.status === 'played' ? 'Played' : 'Skipped') + '">' + (item.meta.status === 'next' ? '▶' : item.meta.status === 'played' ? '<i class="wib wi-check"></i>' : '<i class="wib wi-next"></i>') + '</span>' : '') +
                 (item.type === 'map' && item.meta.playerLock ? '<span class="si-status si-lock" title="Locked for players. It is closed both ways until you unlock it: no player travels here, and no player who is here leaves through a portal (your summon and Bring still move them). A player who is not here holds only its name, nothing of what is on it"><i class="wib wi-lock"></i></span>' : '') +
                 (item.type === 'doc' && item.meta.players === false ? '<span class="si-status si-lock" title="GM only. Players cannot read this page"><i class="wib wi-unseen"></i></span>' : (item.type === 'doc' && window.wpDocRender && window.wpDocRender.pageHid && window.wpDocRender.pageHid(camp.items, item.id)) ? '<span class="si-status si-lock si-lock-under" title="GM only, because a page it is under is GM only. Players cannot read this page"><i class="wib wi-lock"></i></span>' : '') +
                 '<span class="si-title">' + esc(item.meta.title || 'Unnamed') + '</span>' +
                 (item.type === 'map' ? mapPresenceHtml(item.id) : '') +

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

      var treeFoc = treeFocusOf(document);   // 1.6.3 (finding 4): the row that holds the focus, found again once the lists are drawn
      pNav.innerHTML = treeHtml('planner') || '<div class="nav-empty">No planners yet. Press + above to write your first session plan.</div>';

      var dNav = document.getElementById('docNavList');
      if (dNav) dNav.innerHTML = treeHtml('doc') || '<div class="nav-empty">No pages yet. Press + above to write a rules or reference page your players can read.</div>';
      // The Characters section follows every redraw of the panel (charlist.js), and its sync asks panelJudge what a joined player's panel holds
      if (window.wpCharList) window.wpCharList.sync(); else panelJudge(0);
      if (window.wpPanelOrder) window.wpPanelOrder.sync();   // 1.6.2 (backlog 56): the sections in this campaign's own order (panelorder.js)
      if (window.wpDeckWin) window.wpDeckWin.sync();   // 1.6.2 (G9)

      if (window.wpPageShelf && window.wpPageShelf.noteActive) window.wpPageShelf.noteActive();   // 1.5.4 (pageshelf.js): a page that is the item on screen is one of the last pages opened
      mNav.innerHTML = mapQuickHtml(camp) + (treeHtml('map') || '<div class="nav-empty">No maps yet. Press + above to create your first location.</div>');
      TREE_LISTS.forEach(function(lid) { var nv = document.getElementById(lid); treeSync(nv, treeFoc); treeKeysWire(nv, { rename: renameTreeItem, menu: treeMenu }); });   // 1.6.3 (finding 4): each list a tree for the keyboard, with one tab stop
      if (window.wpMapTabs) window.wpMapTabs.sync();   // the top row's map tabs (maptabs.js) read the pins, the last maps opened (noted just above) and who is where
      if (window.wpPills) window.wpPills.sync();   // and its state pills (pills.js): a table opened or closed, a player come or gone



      if (activeChanged) {

          var act = document.querySelector('.sidebar-item.active');

          if (act) act.scrollIntoView({ block: 'nearest' });

      }



        // the tree's own rows, in its own three lists: a row of another section (a character's) is never the tree's to open, rename or nest
        document.querySelectorAll('#mapNavList .sidebar-item, #plannerNavList .sidebar-item, #docNavList .sidebar-item').forEach(el => {
            el.addEventListener('contextmenu', function(e) {
                e.preventDefault();
                if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) return;   // a joined player's tree is read-only
                var menu = document.getElementById('sidebarContextMenu');
                if(!menu) return;
                menu.style.display = 'block';
                menu.dataset.id = this.dataset.id;
                var activeC = getActiveCampaign();
                var it = activeC && activeC.items[this.dataset.id];
                var isMapCtx = !!(it && it.type === 'map'), lockedCtx = !!(it && it.meta && it.meta.playerLock);
                menu.querySelectorAll('.ctx-map-only').forEach(function(x) { x.style.display = isMapCtx ? 'block' : 'none'; });
                if (isMapCtx) opensMark(menu, activeC, it);   // backlog 221: which view this map opens on
                var isPlCtx = !!(it && it.type === 'planner'), stCtx = (it && it.meta && it.meta.status) || '';
                menu.querySelectorAll('.ctx-planner-only').forEach(function(x) { x.style.display = isPlCtx ? 'block' : 'none'; });
                menu.querySelectorAll('.ctx-status').forEach(function(x) { x.classList.toggle('on', x.dataset.status === stCtx && !!stCtx); if (x.dataset.status === '') x.style.display = isPlCtx && stCtx ? 'block' : 'none'; });
                var lockOne = document.getElementById('ctxLockItem'), lockNest = document.getElementById('ctxLockNest'), unlockNest = document.getElementById('ctxUnlockNest');
                if (lockOne) lockOne.innerHTML = lockedCtx ? '<i class="wib wi-lock"></i> Unlock for players' : '<i class="wib wi-unlock"></i> Lock for players';   // 1.6.2 (backlog 230): the padlock shows how the map stands now
                if (isMapCtx && lockNest && unlockNest) {
                    // the nest entries follow the whole nest: offer Lock while any map under it is open, Unlock while any is locked
                    var nestIds = mapNest(activeC, it.id), nLocked = nestIds.filter(function(id) { var m = activeC.items[id]; return m && m.meta && m.meta.playerLock; }).length;
                    var hasKids = nestIds.length > 1;
                    lockNest.style.display = hasKids && nLocked < nestIds.length ? 'block' : 'none';
                    unlockNest.style.display = hasKids && nLocked > 0 ? 'block' : 'none';
                    lockNest.innerHTML = '<i class="wib wi-unlock"></i> Lock this and every map under it' + (nLocked && nLocked < nestIds.length ? ' <span class="ctx-nest-count">(' + (nestIds.length - nLocked) + ' still open)</span>' : '');
                    unlockNest.innerHTML = '<i class="wib wi-lock"></i> Unlock this and every map under it' + (nLocked && nLocked < nestIds.length ? ' <span class="ctx-nest-count">(' + nLocked + ' locked)</span>' : '');
                }
                var childBtn = document.getElementById('ctxNewChildItem');
                if (childBtn) {
                    childBtn.style.display = isTreeItem(it) ? 'block' : 'none';
                    // 1.6.4 (Fulllion, 2026-11-25, "Use these drawings"): the row wears the plus drawing before its words, as the page writes it
                    if (it) childBtn.innerHTML = '<i class="wib wi-plus"></i> ' + (it.type === 'planner' ? 'New Child Planner' : it.type === 'doc' ? 'New Child Page' : 'New Child Map');
                }
                // Move Up / Move Down: shown for any map or planner, grayed at the ends of its sibling list.
                var isOrderable = isTreeItem(it);
                var moveUp = document.getElementById('ctxMoveUp'), moveDown = document.getElementById('ctxMoveDown');
                if (moveUp && moveDown) {
                    moveUp.style.display = moveDown.style.display = isOrderable ? 'block' : 'none';
                    if (isOrderable) {
                        var sibsCtx = getMapChildren(activeC, getMapParentId(activeC, it), it.type);
                        var atCtx = sibsCtx.indexOf(it);
                        moveUp.classList.toggle('disabled', atCtx <= 0);
                        moveDown.classList.toggle('disabled', atCtx < 0 || atCtx >= sibsCtx.length - 1);
                    }
                }
                var parentBtn = document.getElementById('ctxNewParentItem');
                if (parentBtn) {
                    parentBtn.style.display = isTreeItem(it) ? 'block' : 'none';
                    // 1.6.4 (Fulllion, 2026-11-25, "Use these drawings"): the stairs up drawing in place of the typed arrow, as the page writes it
                    if (it) parentBtn.innerHTML = '<i class="wib wi-stairs-up"></i> ' + (it.type === 'planner' ? 'New Parent Planner' : it.type === 'doc' ? 'New Parent Page' : 'New Parent Map');
                }
                // Handbook page: the players switch (the same flip as the editor's button)
                var isDocCtx = !!(it && it.type === 'doc');
                menu.querySelectorAll('.ctx-doc-only').forEach(function(x) { x.style.display = isDocCtx ? 'block' : 'none'; });
                menu.querySelectorAll('.ctx-docwin-only').forEach(function(x) { x.style.display = (isPlCtx || isDocCtx) ? 'block' : 'none'; }); var pinRowS = document.getElementById('ctxPinPage'); if (pinRowS && it && window.wpPageShelf && window.wpPageShelf.pinLabel) pinRowS.textContent = window.wpPageShelf.pinLabel(it.id);   // Open in new window — planners + handbook pages
                var plBtn = document.getElementById('ctxDocPlayers');
                if (plBtn && isDocCtx) {
                    // 1.6.3 (the review of pages, finding 26): a page under a GM-only page is hidden already; its row still sets its own switch, and says so
                    var campH = getActiveCampaign(), upH = campH && window.wpDocRender && window.wpDocRender.pageHidBy ? window.wpDocRender.pageHidBy(campH.items, it.id) : null;
                    plBtn.innerHTML = (it.meta && it.meta.players === false) ? '<i class="wib wi-seen"></i> Show to players' : upH ? '<i class="wib wi-unseen"></i> Hide from players too' : '<i class="wib wi-unseen"></i> Hide from players';
                    plBtn.removeAttribute('title'); plBtn.setAttribute('data-tip', upH ? 'Players do not get this page now, because the page it stands under, “' + String((upH.meta && upH.meta.title) || 'A page').slice(0, 80) + '”, is GM only. This keeps it hidden after that page is shared.' : 'Whether players at your table receive this page. Hidden pages never leave your machine; while hosting, hiding one removes it from every player at once.');
                }
                window.wpClampMenu(menu, e.clientX, e.clientY);   // placed once its rows are the item's own: above the pointer when the bottom is near
            });
            el.addEventListener('click', function(e) {

                if (e.target.closest('.caret')) {
                    var activeC = getActiveCampaign();
                    var it = activeC && activeC.items[this.dataset.id];
                    if (it && it.meta) { it.meta.collapsed = !it.meta.collapsed; save(); updateSidebarNav(); }
                    return;
                }

                var activeC = getActiveCampaign();
                var itC = activeC && activeC.items[this.dataset.id];
                if (itC && itC.type === 'doc' && window.wpNet && window.wpNet.foreign) { if (window.wpOpenDoc) window.wpOpenDoc(this.dataset.id); return; }   // a joined player reads a page in the panel; activeItemId stays on the map
                if (activeC && itC) {   // only an item of the campaign is opened: never an id that names nothing
                    treeOpenNote(activeC, this.dataset.id, state.viewMode, Date.now(), e.detail);   // 1.6.3 (finding 36): what was on screen, for a double-click that renames
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
                if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) return;   // never rename a received copy
                var activeC = getActiveCampaign();
                // 1.6.3 (finding 36): the double-click's first click opened this row; what was on screen before it comes back, then the name is asked
                var back = treeBackFor(activeC, this.dataset.id, Date.now());
                if (back) {
                    activeC.activeItemId = back.prev;
                    if (back.view) state.viewMode = back.view;
                    updateSidebarNav(); render(); save(true);
                    restoreCameraPosition();
                }
                renameTreeItem(this.dataset.id);
            });
        });

        // Drag an item onto another (same-type) item to nest it there
        document.querySelectorAll('#mapNavList .sidebar-item, #plannerNavList .sidebar-item, #docNavList .sidebar-item').forEach(el => {
            el.addEventListener('dragstart', function(e) {
                if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { e.preventDefault(); return; }   // a joined player's tree is read-only
                e.dataTransfer.setData('text/plain', this.dataset.id);
                e.dataTransfer.effectAllowed = 'move';
                this.classList.add('dragging');
            });
            el.addEventListener('dragend', function() { this.classList.remove('dragging'); document.querySelectorAll('.sidebar-item.drag-over, .sidebar-item.drag-before, .sidebar-item.drag-after').forEach(function(x) { x.classList.remove('drag-over', 'drag-before', 'drag-after'); }); });
            el.addEventListener('dragover', function(e) {
                e.preventDefault();
                var r = this.getBoundingClientRect(), y = e.clientY - r.top, h = r.height;
                var pos = y < h * 0.28 ? 'before' : y > h * 0.72 ? 'after' : 'inside';
                this.classList.toggle('drag-before', pos === 'before');
                this.classList.toggle('drag-after',  pos === 'after');
                this.classList.toggle('drag-over',   pos === 'inside');
                this.dataset.dropPos = pos;
            });
            el.addEventListener('dragleave', function() { this.classList.remove('drag-over', 'drag-before', 'drag-after'); delete this.dataset.dropPos; });
            el.addEventListener('drop', function(e) {
                e.preventDefault(); e.stopPropagation();
                if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) return;
                var pos = this.dataset.dropPos || 'inside';
                this.classList.remove('drag-over', 'drag-before', 'drag-after');
                delete this.dataset.dropPos;
                var dragId = e.dataTransfer.getData('text/plain');
                if (pos === 'inside') reparentMap(dragId, this.dataset.id);
                else reorderMap(dragId, this.dataset.id, pos);
            });
        });

  }



  // Section folding: hide/show a whole section without touching per-item collapse state.

  (function() {

      [['planners', 'plannerNavList'], ['handbook', 'docNavList'], ['maps', 'mapNavList'], ['characters', 'charNavList'], ['decks', 'deckNavList']].forEach(function(pair) {

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

              if (title.dataset.rail !== '1') { try { localStorage.setItem('wp_fold_' + key, folded ? '1' : '0'); } catch (e) {} }   // a fold the rail made for the section it shows is no choice of the user's: it is not kept (leftrail.js)

              apply();

          });

      });

      // Right-click a section header for its actions (kept out of the header so the title has room)
      function hideSectionActions() { document.querySelectorAll('.section-actions.show').forEach(function(a) { a.classList.remove('show'); a.style.left = ''; a.style.top = ''; }); }
      document.querySelectorAll('.sidebar-section h3').forEach(function(head) {
          head.addEventListener('contextmenu', function(e) {
              var acts = head.querySelector('.section-actions'); if (!acts) return;
              e.preventDefault();
              hideSectionActions();
              acts.classList.add('show');
              if (window.wpClampMenu) window.wpClampMenu(acts, e.clientX, e.clientY);
          });
      });
      document.addEventListener('pointerdown', function(e) { if (!(e.target.closest && e.target.closest('.section-actions'))) hideSectionActions(); }, true);
      document.querySelectorAll('.section-plus').forEach(function(b) { b.addEventListener('click', function() { var t = document.getElementById(b.dataset.press); if (t) t.click(); }); });   // 1.6.2: the empty sections say press +, so a + is in sight; the rest stay on a right-click
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && (!window.wpEsc || window.wpEsc.free(e))) hideSectionActions(); });   // 1.5.4: esckey.js puts them away, one thing a press
      document.querySelectorAll('.section-actions').forEach(function(a) { a.addEventListener('click', function() { setTimeout(hideSectionActions, 0); }); });
      (function() { var sb = document.getElementById('campaignSidebar'); if (sb) sb.addEventListener('scroll', hideSectionActions); })();

      // Collapse-all / expand-all for the nested accordions inside each section

      [['collapseAllPlannersBtn', 'planner'], ['collapseAllDocsBtn', 'doc'], ['collapseAllMapsBtn', 'map']].forEach(function(pair) {

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

  ['mapNavList', 'plannerNavList', 'docNavList'].forEach(function(navId) {

      var nav = document.getElementById(navId);

      if (!nav) return;

      nav.addEventListener('dragover', function(e) { e.preventDefault(); this.classList.add('drag-over'); });

      nav.addEventListener('dragleave', function() { this.classList.remove('drag-over'); });

      nav.addEventListener('drop', function(e) {

          e.preventDefault();

          this.classList.remove('drag-over');

          if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) return;

          reparentMap(e.dataTransfer.getData('text/plain'), null);

      });

  });



  // Switch the active item of the current campaign (used by sidebar clicks and map portals).

  function navigateToMap(mapId, landRoomId, now) {   // now: true only, a caller that needs the map's save pass at once (below)

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

      // 1.6.3 (the improvement week's review, finding 26): the save after a map switch waits half a second. It ran at once, so the whole
      // campaign was written while the switch was still drawing the new map, and a quick run of switches wrote it once each; the map opened is
      // stamped as before, and the next change or the timer writes it. It waits on io.js saveSwitch's own timer, never save()'s debounce: save()
      // marks the GM's own edit as waiting, and a player's change to this map saved by the table in that half second was then taken for a step
      // of the GM's undo (the review of finding 26). A caller that changes the map right after opening it and wants that change to be one step
      // of the map's undo passes now as true (the three generators on a map they just made: the pass at once gives the new map its baseline
      // before their pieces are laid, so one Undo takes them back)
      render(); if (now === true) save(true); else saveSwitch();

      restoreCameraPosition();

      return true;

  }



export {

    updateCampaignSelect,

    updateSidebarNav,

    panelJudge,

    navigateToMap

};

