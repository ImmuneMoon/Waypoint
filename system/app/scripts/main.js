import { state, dom } from './state.js';

import { uid, clone, createNewCampaign, createNewMap, createNewPlanner, getActiveCampaign, getActiveMap, getMapAncestors } from './models.js';

import { load, updateUndoBtn, pushHistory, undo, save, download, getBase64Image, toast } from './io.js';

import { updateCampaignSelect, updateSidebarNav, navigateToMap } from './sidebar.js';

import { showPrompt, showConfirm, isCampaignNameTaken, getUniqueCampaignTitle, promptForCampaignName, isItemNameTaken, getUniqueItemTitle, promptForItemName } from './dialogs.js';

import { renderPlanner, renderPlannerPreview } from './planner.js';

import { renderDataMap, clearSnaps, drawSnap, doSmartSnapping, attachDrag, attachPanning, isLinkMode, setLinkMode, removeLinkAt } from './datamap.js';

import { renderWhiteboard, attachResizeHandle, attachRotateHandle, addWbItem, uploadImageFile } from './whiteboard.js';

import { getRoomInspectorHtml, attachRoomInspectorEvents, renderInspector,  renderElementList, esc } from './inspector.js';



  export function setZoom(newZoom, mouseX, mouseY) {

      if(newZoom < 0.1) newZoom = 0.1;

      if(newZoom > 4) newZoom = 4;

      

      var wrap = state.viewMode === 'data' ? document.getElementById('canvasWrap') : document.getElementById('whiteboardWrap');

      if(!mouseX) mouseX = wrap.offsetWidth / 2;

      if(!mouseY) mouseY = wrap.offsetHeight / 2;

      

      // Calculate where the mouse is in the scaled universe right now

      var mapX = (wrap.scrollLeft + mouseX) / state.zoomLevel;

      var mapY = (wrap.scrollTop + mouseY) / state.zoomLevel;

      

      state.zoomLevel = newZoom;

      

      document.getElementById('canvas').style.transform = 'scale('+state.zoomLevel+')';

      document.getElementById('whiteboard').style.transform = 'scale('+state.zoomLevel+')';

      document.getElementById('zoomLbl').value = Math.round(state.zoomLevel * 100) + '%';

      // Scroll to keep the mouse anchored

      wrap.scrollLeft = (mapX * state.zoomLevel) - mouseX;

      wrap.scrollTop = (mapY * state.zoomLevel) - mouseY;

      renderRulers();

      if (window.wpUpdateSelToolbar) window.wpUpdateSelToolbar();   // re-counter-scale the selection toolbar

  }

  

  var _el_zoomInBtn = document.getElementById('zoomInBtn');

if(_el_zoomInBtn) _el_zoomInBtn.addEventListener('click', function() { setZoom(Math.round((state.zoomLevel + 0.05) * 100) / 100); });

  var _el_zoomOutBtn = document.getElementById('zoomOutBtn');

if(_el_zoomOutBtn) _el_zoomOutBtn.addEventListener('click', function() { setZoom(Math.round((state.zoomLevel - 0.05) * 100) / 100); });

  // Zoom level is typed directly into the input; Enter/blur applies, Escape reverts.

  var _el_zoomLbl = document.getElementById('zoomLbl');

  if(_el_zoomLbl) {

      var applyZoomInput = function() {

          var v = parseFloat(_el_zoomLbl.value.replace('%', '').trim());

          if (!isNaN(v) && v > 0) setZoom(v / 100);

          else _el_zoomLbl.value = Math.round(state.zoomLevel * 100) + '%';

      };

      _el_zoomLbl.addEventListener('focus', function() { this.select(); });

      _el_zoomLbl.addEventListener('keydown', function(e) {

          e.stopPropagation();

          if (e.key === 'Enter') { applyZoomInput(); this.blur(); }

          if (e.key === 'Escape') { this.value = Math.round(state.zoomLevel * 100) + '%'; this.blur(); }

      });

      _el_zoomLbl.addEventListener('change', applyZoomInput);

      _el_zoomLbl.addEventListener('blur', applyZoomInput);

      // Canvas handlers preventDefault on pointerdown, which suppresses the

      // natural blur — commit the typed zoom on any press outside the control.

      document.addEventListener('pointerdown', function(e) {

          if (document.activeElement === _el_zoomLbl && !e.target.closest('#zoomBox')) {

              applyZoomInput();

              _el_zoomLbl.blur();

          }

      }, true);

  }



  state.appState = {

    activeCampaignId: null,

    campaigns: {}

  };

  

  export function render() {

      if (window.wpHideTooltip) window.wpHideTooltip();   // a re-render never leaves a stale hover card behind

      var activeMap = getActiveMap();

      if(!activeMap) return;

      

      var isPlanner = (activeMap.type === 'planner');

      

      // Top bar tool visibility

      document.getElementById('dataFloatingToolbar').style.display = (!isPlanner && state.viewMode === 'data') ? 'inline-flex' : 'none';

      document.getElementById('wbFloatingToolbar').style.display = (!isPlanner && state.viewMode === 'visual') ? 'inline-flex' : 'none';

      document.getElementById('plannerTools').style.display = isPlanner ? 'inline-flex' : 'none';

      

      // ViewMode dropdown visibility

      document.getElementById('viewModeSelect').style.display = isPlanner ? 'none' : 'inline-flex';

      

      // Main wrappers

      document.getElementById('canvasWrap').style.display = (!isPlanner && state.viewMode === 'data') ? 'flex' : 'none';

      document.getElementById('whiteboardWrap').style.display = (!isPlanner && state.viewMode === 'visual') ? 'flex' : 'none';
      document.getElementById('zoomBox').style.display = isPlanner ? 'none' : 'flex';
      renderRulers();

      document.getElementById('plannerWrap').style.display = isPlanner ? 'flex' : 'none';

      document.getElementById('sidebar').style.display = isPlanner ? 'none' : 'flex';

      document.getElementById('toggleRightBtn').style.display = isPlanner ? 'none' : 'flex';

      // Breadcrumb trail for nested maps (world > region > city > ...)

      var bc = document.getElementById('mapBreadcrumb');

      if (bc) {

          var chain = getMapAncestors(getActiveCampaign(), activeMap.id);

          if (chain.length === 0) {

              bc.style.display = 'none';

          } else {

              bc.style.display = 'flex';

              // Deep trees: keep the root and the last two ancestors; fold the rest into a "…" menu.
              var crumbHtml = function(m) { return '<button class="crumb" data-id="' + m.id + '" title="Go to ' + esc(m.meta.title || 'Untitled') + '">' + esc(m.meta.title || 'Untitled') + '</button>'; };
              var sep = '<span class="crumb-sep">&rsaquo;</span>';
              var shown = chain, hidden = [];
              if (chain.length > 3) { hidden = chain.slice(1, chain.length - 2); shown = [chain[0]].concat(chain.slice(chain.length - 2)); }
              var parts = shown.map(crumbHtml);
              if (hidden.length) parts.splice(1, 0, '<button class="crumb crumb-more" title="' + hidden.length + ' more level' + (hidden.length === 1 ? '' : 's') + ' — click to show">&hellip;</button>');
              bc.innerHTML = parts.join(sep) + sep + '<span class="crumb-current" title="' + esc(activeMap.meta.title || 'Untitled') + '">' + esc(activeMap.meta.title || 'Untitled') + '</span>';
              bc.querySelectorAll('.crumb[data-id]').forEach(function(b) {
                  b.addEventListener('click', function() { navigateToMap(this.dataset.id); });
              });
              var more = bc.querySelector('.crumb-more');
              if (more) more.addEventListener('click', function(e) {
                  e.stopPropagation();
                  var old = document.getElementById('crumbMoreMenu'); if (old) old.remove();
                  var menu = document.createElement('div'); menu.id = 'crumbMoreMenu'; menu.className = 'context-menu';
                  hidden.forEach(function(m) {
                      var it = document.createElement('button'); it.textContent = m.meta.title || 'Untitled'; it.title = 'Go to ' + (m.meta.title || 'Untitled');
                      it.addEventListener('click', function() { menu.remove(); navigateToMap(m.id); });
                      menu.appendChild(it);
                  });
                  var r = more.getBoundingClientRect();
                  menu.style.left = r.left + 'px'; menu.style.top = (r.bottom + 4) + 'px'; menu.style.display = 'flex';
                  document.body.appendChild(menu);
                  setTimeout(function() { document.addEventListener('click', function close() { menu.remove(); document.removeEventListener('click', close); }); }, 0);
              });

          }

      }

      

      if (isPlanner) {

          renderPlanner();

      } else {

          if(state.viewMode === 'data') renderDataMap();

          else renderWhiteboard();

          

          renderInspector();


          

          if (window.wpSyncRightPanel) window.wpSyncRightPanel();   // Properties panel follows the selection

          if(document.getElementById('elementList').style.display === 'block') {

              renderElementList();

          }

      }

  }

  

  var plannerEditorNeedsInit = true;

  /* ---------- exports ---------- */

  function downloadFile(name, blob) {

      var url = URL.createObjectURL(blob);

      var a = document.createElement('a'); a.href = url; a.download = name;

      document.body.appendChild(a); a.click(); a.remove();

      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);

  }

  function exportTitle() {

      var m = getActiveMap();

      var raw = (m && ((m.meta && m.meta.title) || m.name)) || 'waypoint-export';

      return String(raw).replace(/[\\/:*?"<>|]+/g, '').trim() || 'waypoint-export';

  }

  var _el_exportHtmlBtn = document.getElementById('exportHtmlBtn');

if(_el_exportHtmlBtn) _el_exportHtmlBtn.addEventListener('click', function() {

      var activeMap = getActiveMap();

      if(!activeMap) return;

      if(activeMap.type !== 'planner') {

          toast('HTML export is available for Planner documents.');

          return;

      }

      var title = exportTitle();

      fetch('style.css').then(r => r.text()).then(function(css) {

          var content = document.getElementById('plannerPreview').innerHTML;

          var htmlOutput = '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + title + '</title>' +

              '<style>' + css + '</style>' +

              '<style>body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;} #plannerPreviewWrap{width:auto;max-width:1020px;margin:0 auto;}</style>' +

              '</head><body><div id="plannerPreviewWrap">' + content + '</div></body></html>';

          downloadFile(title + '.html', new Blob([htmlOutput], {type: 'text/html'}));

          toast('HTML exported.');

      }).catch(function() { toast('HTML export failed.'); });

  });

  var _el_exportImgBtn = document.getElementById('exportImgBtn');

if(_el_exportImgBtn) _el_exportImgBtn.addEventListener('click', function() {

      var activeMap = getActiveMap();

      if(!activeMap) return;

      if(typeof html2canvas === 'undefined') {

          toast('Image export needs an internet connection to load its renderer.');

          return;

      }

      var title = exportTitle();

      var opts = { backgroundColor: '#15151c', logging: false, useCORS: true };

      var target;

      if(activeMap.type === 'planner') {

          target = document.getElementById('plannerPreviewWrap');

      } else {

          // Capture the visible region of the big inner canvas. html2canvas ignores the

          // root element's scale transform, so crop coordinates are in unscaled space.

          var wrapEl = state.viewMode === 'data' ? document.getElementById('canvasWrap') : document.getElementById('whiteboardWrap');

          target = state.viewMode === 'data' ? document.getElementById('canvas') : document.getElementById('whiteboard');

          var z = state.zoomLevel || 1;

          opts.x = wrapEl.scrollLeft / z; opts.y = wrapEl.scrollTop / z;

          opts.width = wrapEl.clientWidth / z; opts.height = wrapEl.clientHeight / z;

      }

      toast('Rendering image...');

      html2canvas(target, opts).then(function(cv) {

          cv.toBlob(function(blob) {

              if(!blob) { toast('Image export failed.'); return; }

              downloadFile(title + '.png', blob);

              toast('Image exported.');

          });

      }).catch(function() {

          toast('Image export failed.');

      });

  });



  var _el_importBtn = document.getElementById('importBtn');

if(_el_importBtn) _el_importBtn.addEventListener('click', function() {

      document.getElementById('fileIn').click();

  });

  

  var _el_fileIn = document.getElementById('fileIn');

  /* ---------- import (merge or replace) ---------- */

  var pendingImport = null;

  var pendingImportImages = null; // zip bundles: [{name:'images/<mapId>/<file>', data:Uint8Array}]

  function finishImport(msg) {

      pendingImport = null;

      var imgs = pendingImportImages || [];

      pendingImportImages = null;

      document.getElementById('importChoiceModal').style.display = 'none';

      save(true);

      updateCampaignSelect();

      updateSidebarNav();

      render();

      restoreCameraPosition();

      if (!imgs.length) { toast(msg); return; }

      // Copy the bundle's images into saves/ at their exact original paths so
      // the imported items' references resolve.
      toast(msg + ' Copying ' + imgs.length + ' image(s)…');

      (async function() {
          var ok = 0, fail = 0;
          for (var i = 0; i < imgs.length; i++) {
              var relPath = imgs[i].name;
              try { relPath = decodeURIComponent(relPath); } catch(e) {}
              try {
                  var r = await fetch('/api/upload-exact?path=' + encodeURIComponent(relPath), { method: 'POST', body: new Blob([imgs[i].data]) });
                  if (r.ok) ok++; else fail++;
              } catch(err) { fail++; }
          }
          toast('Images copied: ' + ok + (fail ? ', ' + fail + ' failed' : '') + '.');
          render();
      })();

  }

  // Merge by id: new campaigns are added; within an existing campaign,

  // imported items overwrite same-id items and new ones are added.

  function mergeAppState(imported) {

      var added = 0, updated = 0, newCamps = 0;

      Object.values(imported.campaigns).forEach(function(ic) {

          var existing = state.appState.campaigns[ic.id];

          if (!existing) {

              state.appState.campaigns[ic.id] = ic;

              Object.keys(ic.items).forEach(function(id) {
                  var it = ic.items[id];
                  if (it && it.meta && it.meta.parentId && !ic.items[it.meta.parentId]) delete it.meta.parentId;
              });

              newCamps++;

              return;

          }

          Object.keys(ic.items).forEach(function(id) {

              if (existing.items[id]) updated++; else added++;

              existing.items[id] = ic.items[id];

          });

          if (ic.name) existing.name = ic.name;

          if (ic.activeItemId && existing.items[ic.activeItemId]) existing.activeItemId = ic.activeItemId;

          // A single-item export can reference a parent that doesn't exist
          // here — orphaned parentIds would hide the item from the sidebar tree.
          Object.keys(ic.items).forEach(function(id) {
              var it = existing.items[id];
              if (it && it.meta && it.meta.parentId && !existing.items[it.meta.parentId]) delete it.meta.parentId;
          });

      });

      if (!state.appState.activeCampaignId || !state.appState.campaigns[state.appState.activeCampaignId]) {

          state.appState.activeCampaignId = Object.keys(state.appState.campaigns)[0] || null;

      }

      return { added: added, updated: updated, newCamps: newCamps };

  }

  var _el_importMergeBtn = document.getElementById('importMergeBtn');

  if(_el_importMergeBtn) _el_importMergeBtn.addEventListener('click', function() {

      if (!pendingImport) return;

      var r = mergeAppState(pendingImport);

      finishImport('Merged: ' + r.added + ' new, ' + r.updated + ' updated' + (r.newCamps ? ', ' + r.newCamps + ' new campaign(s)' : '') + '.');

  });

  var _el_importReplaceBtn = document.getElementById('importReplaceBtn');

  if(_el_importReplaceBtn) _el_importReplaceBtn.addEventListener('click', function() {

      if (!pendingImport) return;

      state.appState = pendingImport;

      finishImport('Imported (replaced all data).');

  });

  var _el_importCancelBtn = document.getElementById('importCancelBtn');

  if(_el_importCancelBtn) _el_importCancelBtn.addEventListener('click', function() {

      pendingImport = null;

      pendingImportImages = null;

      document.getElementById('importChoiceModal').style.display = 'none';

  });



if(_el_fileIn) _el_fileIn.addEventListener('change', function(e) {

      var file = e.target.files[0];

      if(!file) return;

      if (/\.zip$/i.test(file.name)) {

          // Export bundle: data.json + images/ inside a zip
          file.arrayBuffer().then(async function(buf) {
              try {
                  var zip = await import('./zip.js');
                  var entries = await zip.zipRead(buf);
                  var dj = entries.find(function(en) { return en.name === 'data.json'; });
                  if (!dj) { toast('This zip has no data.json — not a Waypoint export.'); return; }
                  pendingImportImages = entries.filter(function(en) { return /^images\//.test(en.name); });
                  handleImportedJson(new TextDecoder().decode(dj.data));
              } catch(err) {
                  console.error(err);
                  toast('Could not read zip: ' + err.message);
              }
          });

          this.value = '';

          return;

      }

      var reader = new FileReader();

      reader.onload = function(ev) {

          pendingImportImages = null;

          handleImportedJson(ev.target.result);

      };

      reader.readAsText(file);

      this.value = '';

  });

  function handleImportedJson(text) {

          try {

              var data = JSON.parse(text);

              if(!data || Object.keys(data).length === 0) return;

              if (data.maps && !data.campaigns) {

                  // Legacy single-campaign format: import as a fresh campaign alongside existing ones

                  var defaultCamp = createNewCampaign('Imported Campaign');

                  defaultCamp.items = data.maps;

                  defaultCamp.activeItemId = data.activeMapId;

                  state.appState.campaigns[defaultCamp.id] = defaultCamp;

                  state.appState.activeCampaignId = defaultCamp.id;

                  finishImport('Imported legacy campaign.');

              } else if (data.campaigns) {

                  pendingImport = data;

                  var nCamps = Object.keys(data.campaigns).length;

                  var nItems = Object.values(data.campaigns).reduce(function(n, c) { return n + Object.keys(c.items || {}).length; }, 0);

                  document.getElementById('importChoiceSummary').textContent =

                      'The file contains ' + nCamps + ' campaign(s) with ' + nItems + ' maps/planners. Merge adds and updates by id, keeping everything else you have. Replace discards ALL current data.';

                  document.getElementById('importChoiceModal').style.display = 'flex';

              } else {

                  toast('Unrecognized file format.');

              }

          } catch(err) {

              console.error(err);

              toast('Error reading file.');

          }

  }



  load();


    /* ---------- coordinate rulers ---------- */
    var RULER_STEPS = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

    function renderRulers() {
        var top = document.getElementById('rulerTop');
        var left = document.getElementById('rulerLeft');
        var xm = document.getElementById('rulerCursorX');
        var ym = document.getElementById('rulerCursorY');
        if(!top || !left) return;
        var activeMap = getActiveMap();
        var rulersOff = localStorage.getItem('wp_rulers') === 'off';
        var show = !rulersOff && activeMap && activeMap.type === 'map' && (state.viewMode === 'data' || state.viewMode === 'visual');
        [top, left, xm, ym].forEach(function(el) { if(el) el.style.display = show ? 'block' : 'none'; });
        document.body.classList.toggle('no-rulers', !show);
        if(!show) { if (typeof renderMinimap === 'function') renderMinimap(); return; }
        var wrap = state.viewMode === 'data' ? document.getElementById('canvasWrap') : document.getElementById('whiteboardWrap');
        if(!wrap || wrap.clientWidth === 0) return;
        var z = state.zoomLevel || 1;
        var W = wrap.clientWidth, H = wrap.clientHeight;
        if(top.width !== W) top.width = W;
        if(left.height !== H) left.height = H;

        var step = RULER_STEPS[RULER_STEPS.length - 1];
        for(var i = 0; i < RULER_STEPS.length; i++) {
            if(RULER_STEPS[i] * z >= 70) { step = RULER_STEPS[i]; break; }
        }

        var bg = 'rgba(21,21,28,0.85)', line = 'rgba(255,255,255,0.22)', txt = '#9a9aad';

        var ctxT = top.getContext('2d');
        ctxT.clearRect(0, 0, W, 18);
        ctxT.fillStyle = bg; ctxT.fillRect(0, 0, W, 18);
        ctxT.strokeStyle = line; ctxT.lineWidth = 1;
        ctxT.fillStyle = txt; ctxT.font = '9px monospace'; ctxT.textBaseline = 'top';
        ctxT.beginPath();
        var startX = Math.floor((wrap.scrollLeft / z) / step) * step;
        var endX = (wrap.scrollLeft + W) / z;
        for(var wx = startX; wx <= endX; wx += step) {
            var sx = Math.round(wx * z - wrap.scrollLeft) + 0.5;
            ctxT.moveTo(sx, 9); ctxT.lineTo(sx, 18);
            ctxT.fillText(String(wx), sx + 3, 3);
            for(var m = 1; m < 5; m++) {
                var mx = Math.round((wx + step * m / 5) * z - wrap.scrollLeft) + 0.5;
                ctxT.moveTo(mx, 14); ctxT.lineTo(mx, 18);
            }
        }
        ctxT.stroke();

        var ctxL = left.getContext('2d');
        ctxL.clearRect(0, 0, 36, H);
        ctxL.fillStyle = bg; ctxL.fillRect(0, 0, 36, H);
        ctxL.strokeStyle = line; ctxL.lineWidth = 1;
        ctxL.fillStyle = txt; ctxL.font = '9px monospace'; ctxL.textBaseline = 'bottom';
        ctxL.beginPath();
        var startY = Math.floor((wrap.scrollTop / z) / step) * step;
        var endY = (wrap.scrollTop + H) / z;
        for(var wy = startY; wy <= endY; wy += step) {
            var sy = Math.round(wy * z - wrap.scrollTop) + 0.5;
            ctxL.moveTo(27, sy); ctxL.lineTo(36, sy);
            ctxL.fillText(String(wy), 2, sy - 2);
            for(var n = 1; n < 5; n++) {
                var my = Math.round((wy + step * n / 5) * z - wrap.scrollTop) + 0.5;
                ctxL.moveTo(32, my); ctxL.lineTo(36, my);
            }
        }
        ctxL.stroke();
        if (typeof renderMinimap === 'function') renderMinimap();
    }
    window.addEventListener('resize', renderRulers);

    /* ---------- minimap ---------- */

    var _mm = { scale: 1, ox: 0, oy: 0 };
    var _mmFrozen = false;

    function renderMinimap() {
        var box = document.getElementById('minimap');
        var cv = document.getElementById('minimapCanvas');
        if (!box || !cv) return;
        var am = getActiveMap();
        var show = am && am.type === 'map' && (state.viewMode === 'data' || state.viewMode === 'visual');
        box.style.display = show ? 'block' : 'none';
        if (!show || box.classList.contains('mm-collapsed')) return;
        var wrap = state.viewMode === 'data' ? document.getElementById('canvasWrap') : document.getElementById('whiteboardWrap');
        if (!wrap || !wrap.clientWidth) return;
        var z = state.zoomLevel || 1;
        var items = state.viewMode === 'data'
            ? (am.rooms || []).map(function(r) { return { x: r.x, y: r.y, w: 140, h: 60, c: (am.cats && am.cats[r.cat] && am.cats[r.cat].color) || '#e0a54f' }; })
            : (am.whiteboard || []).map(function(w) { return { x: w.x, y: w.y, w: w.w || 50, h: w.h || 50, c: w.type === 'image' ? '#8a8a97' : (/^#/.test(w.color || '') ? w.color : '#4db3d3') }; });
        var vx = wrap.scrollLeft / z, vy = wrap.scrollTop / z, vw = wrap.clientWidth / z, vh = wrap.clientHeight / z;
        var W = cv.width, H = cv.height;
        var sc, ox, oy;
        if (_mmFrozen) {
            // Mid-drag on the minimap: keep the mapping fixed so the world doesn't
            // slide under the pointer as the viewport box moves.
            sc = _mm.scale; ox = _mm.ox; oy = _mm.oy;
        } else {
            // The frame is the content's bounding box; the viewport only widens it
            // when nothing is on the board yet.
            var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            items.forEach(function(i) {
                if (i.x < minX) minX = i.x;
                if (i.y < minY) minY = i.y;
                if (i.x + i.w > maxX) maxX = i.x + i.w;
                if (i.y + i.h > maxY) maxY = i.y + i.h;
            });
            if (!items.length) { minX = vx; minY = vy; maxX = vx + vw; maxY = vy + vh; }
            else {
                // Always keep the viewport at least partly in frame
                minX = Math.min(minX, vx + vw * 0.5); maxX = Math.max(maxX, vx + vw * 0.5);
                minY = Math.min(minY, vy + vh * 0.5); maxY = Math.max(maxY, vy + vh * 0.5);
            }
            var pad = Math.max((maxX - minX), (maxY - minY)) * 0.08 + 50;
            minX -= pad; minY -= pad; maxX += pad; maxY += pad;
            sc = Math.min(W / (maxX - minX), H / (maxY - minY));
            ox = (W - (maxX - minX) * sc) / 2 - minX * sc;
            oy = (H - (maxY - minY) * sc) / 2 - minY * sc;
            _mm = { scale: sc, ox: ox, oy: oy };
        }
        var ctx = cv.getContext('2d');
        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#15151c';
        ctx.fillRect(0, 0, W, H);
        items.forEach(function(i) {
            ctx.fillStyle = i.c;
            ctx.globalAlpha = 0.85;
            ctx.fillRect(i.x * sc + ox, i.y * sc + oy, Math.max(2, i.w * sc), Math.max(2, i.h * sc));
        });
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(vx * sc + ox, vy * sc + oy, vw * sc, vh * sc);
    }
    window.renderMinimap = renderMinimap;

    (function wireMinimap() {
        var box = document.getElementById('minimap');
        var cv = document.getElementById('minimapCanvas');
        var tog = document.getElementById('minimapToggle');
        if (!box || !cv) return;
        if (localStorage.getItem('wp_minimap') === 'closed') box.classList.add('mm-collapsed');
        if (tog) tog.addEventListener('click', function() {
            box.classList.toggle('mm-collapsed');
            localStorage.setItem('wp_minimap', box.classList.contains('mm-collapsed') ? 'closed' : 'open');
            this.textContent = box.classList.contains('mm-collapsed') ? '▴' : '▾';
            renderMinimap();
        });
        function jump(e) {
            var r = cv.getBoundingClientRect();
            var wx = (e.clientX - r.left - _mm.ox) / _mm.scale;
            var wy = (e.clientY - r.top - _mm.oy) / _mm.scale;
            var wrap = state.viewMode === 'data' ? document.getElementById('canvasWrap') : document.getElementById('whiteboardWrap');
            var z = state.zoomLevel || 1;
            wrap.scrollLeft = wx * z - wrap.clientWidth / 2;
            wrap.scrollTop = wy * z - wrap.clientHeight / 2;
        }
        var mmDrag = false;
        cv.addEventListener('pointerdown', function(e) { mmDrag = true; _mmFrozen = true; jump(e); try { cv.setPointerCapture(e.pointerId); } catch(err) {} });
        cv.addEventListener('pointermove', function(e) { if (mmDrag) jump(e); });
        function mmEnd() { if (!mmDrag) return; mmDrag = false; _mmFrozen = false; renderMinimap(); }
        cv.addEventListener('pointerup', mmEnd);
        cv.addEventListener('pointercancel', mmEnd);
        window.addEventListener('pointerup', mmEnd);
    })();

    /* ---------- Ctrl+K quick-jump ---------- */

    var _cmdkEntries = [], _cmdkShown = [], _cmdkIdx = 0;

    function cmdkBuild() {
        _cmdkEntries = [];
        Object.values(state.appState.campaigns).forEach(function(c) {
            Object.values(c.items).forEach(function(it) {
                var title = (it.meta && it.meta.title) || it.id;
                _cmdkEntries.push({ kind: it.type, label: title, sub: c.name, campId: c.id, itemId: it.id });
                if (it.type === 'map') (it.rooms || []).forEach(function(r) {
                    _cmdkEntries.push({ kind: 'room', label: r.name || r.id, sub: title, campId: c.id, itemId: it.id, roomId: r.id });
                });
            });
        });
    }

    function cmdkRender(q) {
        q = (q || '').toLowerCase().trim();
        var scored = [];
        _cmdkEntries.forEach(function(en) {
            var l = en.label.toLowerCase();
            var s = -1;
            if (!q) s = en.kind === 'room' ? 2 : 1;
            else if (l.indexOf(q) === 0) s = 0;
            else if (l.indexOf(q) !== -1) s = 1;
            else if (en.sub.toLowerCase().indexOf(q) !== -1) s = 2;
            if (s >= 0) scored.push([s, en]);
        });
        scored.sort(function(a, b) { return a[0] - b[0]; });
        _cmdkShown = scored.slice(0, 50).map(function(p) { return p[1]; });
        _cmdkIdx = 0;
        var icons = { map: '🗺️', planner: '📑', room: '📍' };
        var list = document.getElementById('cmdkList');
        list.innerHTML = _cmdkShown.length
            ? _cmdkShown.map(function(en, i) {
                return '<div class="cmdk-row' + (i === 0 ? ' active' : '') + '" data-i="' + i + '">' +
                    '<span>' + (icons[en.kind] || '•') + '</span><span>' + en.label + '</span>' +
                    '<span class="cmdk-sub">' + en.sub + '</span></div>';
              }).join('')
            : '<div class="cmdk-empty">No matches.</div>';
    }

    function cmdkOpen() {
        cmdkBuild();
        document.getElementById('cmdkModal').style.display = 'flex';
        var inp = document.getElementById('cmdkInput');
        inp.value = '';
        cmdkRender('');
        setTimeout(function() { inp.focus(); }, 30);
    }
    window.wpCmdkOpen = cmdkOpen;

    function cmdkClose() { document.getElementById('cmdkModal').style.display = 'none'; }

    function cmdkGo(en) {
        if (!en) return;
        cmdkClose();
        state.appState.activeCampaignId = en.campId;
        var camp = state.appState.campaigns[en.campId];
        camp.activeItemId = en.itemId;
        var it = camp.items[en.itemId];
        if (window.wpApplyRememberedView) window.wpApplyRememberedView();
        if (en.roomId && it.type === 'map') {
            state.viewMode = 'data';
            state.selId = en.roomId;
            var room = (it.rooms || []).find(function(r) { return r.id === en.roomId; });
            if (room) {
                it.meta.lastX = room.x; it.meta.lastY = room.y;
                if (it.meta.lastZoom === undefined) it.meta.lastZoom = 1;
            }
        }
        save();
        updateCampaignSelect();
        updateSidebarNav();
        render();
        restoreCameraPosition();
    }

    (function wireCmdk() {
        var inp = document.getElementById('cmdkInput');
        var list = document.getElementById('cmdkList');
        var modal = document.getElementById('cmdkModal');
        if (!inp) return;
        inp.addEventListener('input', function() { cmdkRender(this.value); });
        inp.addEventListener('keydown', function(e) {
            e.stopPropagation();
            if (e.key === 'Escape') { cmdkClose(); return; }
            if (e.key === 'Enter') { cmdkGo(_cmdkShown[_cmdkIdx]); return; }
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                _cmdkIdx = Math.max(0, Math.min(_cmdkShown.length - 1, _cmdkIdx + (e.key === 'ArrowDown' ? 1 : -1)));
                list.querySelectorAll('.cmdk-row').forEach(function(r, i) { r.classList.toggle('active', i === _cmdkIdx); });
                var act = list.querySelector('.cmdk-row.active');
                if (act) act.scrollIntoView({ block: 'nearest' });
            }
        });
        list.addEventListener('click', function(e) {
            var row = e.target.closest('.cmdk-row');
            if (row) cmdkGo(_cmdkShown[+row.dataset.i]);
        });
        modal.addEventListener('pointerdown', function(e) { if (e.target === modal) cmdkClose(); });
        document.addEventListener('keydown', function(e) {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return;
                e.preventDefault();
                cmdkOpen();
            }
        });
    })();

    /* ---------- resizable side panels ---------- */

    (function wireGrips() {
        var lw = parseInt(localStorage.getItem('wp_leftw'), 10);
        var rw = parseInt(localStorage.getItem('wp_rightw'), 10);
        if (lw >= 160 && lw <= 500) document.documentElement.style.setProperty('--leftw', lw + 'px');
        if (rw >= 220 && rw <= 600) document.documentElement.style.setProperty('--rightw', rw + 'px');
        function wire(gripId, cssVar, storeKey, min, max, fromLeft) {
            var grip = document.getElementById(gripId);
            if (!grip) return;
            grip.addEventListener('pointerdown', function(e) {
                e.preventDefault();
                grip.classList.add('dragging');
                try { grip.setPointerCapture(e.pointerId); } catch(err) {}
                function move(me) {
                    var w = fromLeft ? me.clientX : (window.innerWidth - me.clientX);
                    w = Math.max(min, Math.min(max, w));
                    document.documentElement.style.setProperty(cssVar, w + 'px');
                    localStorage.setItem(storeKey, w);
                }
                function up() {
                    grip.classList.remove('dragging');
                    grip.removeEventListener('pointermove', move);
                    grip.removeEventListener('pointerup', up);
                    renderRulers();
                }
                grip.addEventListener('pointermove', move);
                grip.addEventListener('pointerup', up);
            });
        }
        wire('leftGrip', '--leftw', 'wp_leftw', 160, 500, true);
        wire('rightGrip', '--rightw', 'wp_rightw', 220, 600, false);
    })();

    // Coords Tracker Logic
    function updateFocusCoord(fromScroll) {
        if (typeof state !== 'undefined' && state.viewMode !== 'undefined' && (state.viewMode === 'data' || state.viewMode === 'visual')) {
            var wrap = state.viewMode === 'data' ? document.getElementById('canvasWrap') : document.getElementById('whiteboardWrap');
            if(!wrap || wrap.clientWidth === 0) return;
            var cx = (wrap.scrollLeft + wrap.clientWidth/2) / state.zoomLevel;
            var cy = (wrap.scrollTop + wrap.clientHeight/2) / state.zoomLevel;
            renderRulers();
            if (fromScroll === true) {
                var am = typeof getActiveMap === 'function' ? getActiveMap() : null;
                if (am && typeof save === 'function' && !window.isAppLoading) {
                    if (state.viewMode === 'visual') {
                        am.meta.lastWbX = cx;
                        am.meta.lastWbY = cy;
                        am.meta.lastWbZoom = state.zoomLevel;
                    } else {
                        am.meta.lastX = cx;
                        am.meta.lastY = cy;
                        am.meta.lastZoom = state.zoomLevel;
                    }
                    save(false);
                }
            }
        }
    }
    document.getElementById('canvasWrap').addEventListener('scroll', function() { updateFocusCoord(true); });
    document.getElementById('whiteboardWrap').addEventListener('scroll', function() { updateFocusCoord(true); });
    
    // Track the cursor: gold markers on the rulers + live world-coordinate readout
    document.getElementById('main').addEventListener('pointermove', function(e) {
        if (typeof state !== 'undefined' && state.viewMode !== 'undefined' && (state.viewMode === 'data' || state.viewMode === 'visual')) {
            var mainBox = document.getElementById('main').getBoundingClientRect();
            var xm = document.getElementById('rulerCursorX');
            var ym = document.getElementById('rulerCursorY');
            if(xm) xm.style.left = (e.clientX - mainBox.left) + 'px';
            if(ym) ym.style.top = (e.clientY - mainBox.top) + 'px';
            var wrap = state.viewMode === 'data' ? document.getElementById('canvasWrap') : document.getElementById('whiteboardWrap');
            var pos = document.getElementById('cursorPos');
            if(wrap && pos) {
                var wrapBox = wrap.getBoundingClientRect();
                var wx = (e.clientX - wrapBox.left + wrap.scrollLeft) / state.zoomLevel;
                var wy = (e.clientY - wrapBox.top + wrap.scrollTop) / state.zoomLevel;
                pos.textContent = Math.round(wx) + ', ' + Math.round(wy);
            }
        }
    });

window.updateFocusCoord = updateFocusCoord;


window.appRender = render;
window.appRestoreCamera = restoreCameraPosition;

export function restoreCameraPosition() {
    var activeMap = typeof getActiveMap === 'function' ? getActiveMap() : null;
    if (!activeMap || activeMap.type !== 'map') return;
    
    var mode = state.viewMode;
    var wrap = mode === 'visual' ? document.getElementById('whiteboardWrap') : document.getElementById('canvasWrap');
    if (!wrap || wrap.clientWidth === 0) return;

    // The canvas is 30000×30000, so a map without a saved home starts at its true center
    var homeX = (typeof activeMap.meta.homeX === 'number') ? activeMap.meta.homeX : 15000;
    var homeY = (typeof activeMap.meta.homeY === 'number') ? activeMap.meta.homeY : 15000;
    var targetX = (mode === 'visual') ? (activeMap.meta.lastWbX !== undefined ? activeMap.meta.lastWbX : homeX) : (activeMap.meta.lastX !== undefined ? activeMap.meta.lastX : homeX);
    var targetY = (mode === 'visual') ? (activeMap.meta.lastWbY !== undefined ? activeMap.meta.lastWbY : homeY) : (activeMap.meta.lastY !== undefined ? activeMap.meta.lastY : homeY);
    var targetZoom = (mode === 'visual') ? (activeMap.meta.lastWbZoom !== undefined ? activeMap.meta.lastWbZoom : 1) : (activeMap.meta.lastZoom !== undefined ? activeMap.meta.lastZoom : 1);

    state.zoomLevel = targetZoom;
    document.getElementById('canvas').style.transform = 'scale('+state.zoomLevel+')';
    document.getElementById('whiteboard').style.transform = 'scale('+state.zoomLevel+')';
    var zLbl = document.getElementById('zoomLbl');
    if(zLbl) zLbl.value = Math.round(state.zoomLevel * 100) + '%';

    wrap.scrollLeft = (targetX * state.zoomLevel) - wrap.clientWidth/2;
    wrap.scrollTop = (targetY * state.zoomLevel) - wrap.clientHeight/2;
    renderRulers();
}





window.appSetZoom = setZoom;



var _el_saveAsBtn = document.getElementById('saveAsBtn');
if(_el_saveAsBtn) _el_saveAsBtn.addEventListener('click', function(e) {
    var menu = document.getElementById('saveAsMenu');
    menu.style.display = menu.style.display === 'none' ? 'flex' : 'none';
    e.stopPropagation();
});

document.addEventListener('click', function(e) {
    var menu = document.getElementById('saveAsMenu');
    if (menu && menu.style.display !== 'none') {
        if (!e.target.closest('#saveAsDropdownWrap') || e.target.closest('.menu-item')) {
            menu.style.display = 'none';
        }
    }
});



