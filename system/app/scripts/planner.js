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

import { updateCampaignSelect, updateSidebarNav, navigateToMap } from './sidebar.js';

import { showPrompt, showConfirm, isCampaignNameTaken, getUniqueCampaignTitle, promptForCampaignName, isItemNameTaken, getUniqueItemTitle, promptForItemName } from './dialogs.js';

import { renderDataMap, clearSnaps, drawSnap, doSmartSnapping, attachDrag, attachPanning, isLinkMode, setLinkMode, removeLinkAt } from './datamap.js';

import { renderWhiteboard, attachResizeHandle, attachRotateHandle, addWbItem, uploadImageFile } from './whiteboard.js';

import { getRoomInspectorHtml, attachRoomInspectorEvents, renderInspector,  renderElementList, esc } from './inspector.js';



  function renderPlanner() {
      var activeMap = getActiveMap();
      if (!activeMap) return;
      // This document remembers its own reading-view state
      if (activeMap.type === 'planner') {
          var rv = !!(activeMap.meta && activeMap.meta.readerView);
          if (rv !== plannerFullscreen) { plannerFullscreen = rv; applyPlannerFullscreen(); }
      }

      

      var blockContainer = document.getElementById('plannerBlocks');

      

      // Upgrade legacy

      if (activeMap.content && !activeMap.blocks) {

          activeMap.blocks = [{ id: 'b_'+uid(), type: 'raw', content: activeMap.content }];

          delete activeMap.content;

      }

      if (!activeMap.blocks) activeMap.blocks = [];

      

      // Convert accidental default raw blocks to h1+text

      if (activeMap.blocks.length === 1 && activeMap.blocks[0].type === 'raw') {

          var c = activeMap.blocks[0].content;

          if (c.indexOf('<h1>') === 0 && c.indexOf('</h1>\n<p>Start writing...</p>') !== -1) {

              var titleStr = c.substring(4, c.indexOf('</h1>'));

              activeMap.blocks = [

                  { id: 'b_'+uid(), type: 'h1', title: titleStr, sub: '' },

                  { id: 'b_'+uid(), type: 'text', content: 'Start writing...' }

              ];

          }

      }

      if (!activeMap.blocks) activeMap.blocks = [];

      

      // Render editor

      var html = '';

      activeMap.blocks.forEach(function(b, idx) {

          html += '<div class="planner-block-edit" data-idx="'+idx+'">';

          html += '<div class="block-head"><span>' + (b.type === 'node' ? (b.mode === 'table' ? 'TABLE' : 'SCENE NODE') : b.type.toUpperCase()) + '</span>';

          html += '<div class="block-tools"><button class="tool ghost mv-up" data-idx="'+idx+'">▲</button><button class="tool ghost mv-dn" data-idx="'+idx+'">▼</button><button class="tool ghost danger del-blk" data-idx="'+idx+'">✖</button></div></div>';

          

          if (b.type === 'h1') {

              html += '<input type="text" class="field b-title" value="'+esc(b.title||'')+'" placeholder="Title" data-idx="'+idx+'" style="margin-bottom:6px; width:100%;">';

              html += '<input type="text" class="field b-sub" value="'+esc(b.sub||'')+'" placeholder="Subtitle" data-idx="'+idx+'" style="width:100%;">';

          } else if (b.type === 'h2') {

              html += '<input type="text" class="field b-title" value="'+esc(b.title||'')+'" placeholder="Section Header" data-idx="'+idx+'" style="width:100%;">';

          } else if (b.type === 'oneline' || b.type === 'lede' || b.type === 'text' || b.type === 'callout' || b.type === 'flare') {

              html += rteHtml(idx, b);

          } else if (b.type === 'image') {
              html += '<div class="b-img-row"><div class="b-img-thumb">' + (b.src ? '<img src="' + esc(b.src) + '" alt="">' : '<span>No picture yet</span>') + '</div>'
                    + '<div class="b-img-ctl"><div class="fc-opts"><button class="tool ghost b-img-pick" data-idx="' + idx + '" title="Pick a picture already in this campaign">Choose from library…</button>'
                    + '<label class="tool ghost b-img-uplabel" title="Upload a picture from your computer">Upload…<input type="file" accept="image/*" class="b-img-upload" data-idx="' + idx + '" style="display:none;"></label>'
                    + '<label>Width <select class="b-imgw" data-idx="' + idx + '">' + [25, 33, 50, 66, 75, 100].map(function(w) { return '<option value="' + w + '"' + ((b.width || 100) === w ? ' selected' : '') + '>' + w + '%</option>'; }).join('') + '</select></label>'
                    + '<label>Align <select class="b-imga" data-idx="' + idx + '">' + [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']].map(function(o) { return '<option value="' + o[0] + '"' + ((b.align || 'center') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label></div>'
                    + '<input type="text" class="field b-caption" value="' + esc(b.caption || '') + '" placeholder="Caption (optional)" data-idx="' + idx + '" style="width:100%; margin-top:6px;"></div></div>';
          } else if (b.type === 'raw') {

              html += '<textarea class="field b-content" placeholder="Raw HTML..." data-idx="'+idx+'" style="width:100%; height:120px; font-family:monospace;">'+esc(b.content||'')+'</textarea>';

          } else if (b.type === 'diagram') {

              html += '<textarea class="field b-content" placeholder="Mermaid flowchart code..." data-idx="'+idx+'" style="width:100%; height:150px; font-family:monospace;">'+esc(b.content||'')+'</textarea>';

          } else if (b.type === 'node') {
              var plain = b.mode === 'table';
              html += '<div class="fc-opts" style="margin-bottom:6px;"><label>Mode <select class="b-mode" data-idx="'+idx+'" title="Scene node: a scene with what must be resolved and the routes out of it. Plain table: just a grid of information."><option value="node"'+(plain ? '' : ' selected')+'>Scene node</option><option value="table"'+(plain ? ' selected' : '')+'>Plain table</option></select></label></div>';
              html += '<input type="text" class="field b-title" value="'+esc(b.title||'')+'" placeholder="'+(plain ? 'Table title (optional)' : 'Node Title')+'" data-idx="'+idx+'" style="margin-bottom:6px; width:100%;">';
              if (!plain) {
                  html += '<input type="text" class="field b-sub" value="'+esc(b.tag||'')+'" placeholder="Tag (optional)" data-idx="'+idx+'" style="margin-bottom:6px; width:100%;">';
                  html += '<input type="text" class="field b-must" value="'+esc(b.must||'')+'" placeholder="Must Resolve... (optional)" data-idx="'+idx+'" style="margin-bottom:6px; width:100%;">';
                  var campL = getActiveCampaign();
                  var mapsL = campL ? Object.values(campL.items).filter(function(i) { return i.type === 'map'; }).sort(function(x, y) { return String(x.meta.title || '').localeCompare(String(y.meta.title || '')); }) : [];
                  var linkedMap = b.linkMapId && campL ? campL.items[b.linkMapId] : null;
                  html += '<div class="fc-opts" style="margin-bottom:10px;"><label>Map <select class="b-linkmap" data-idx="'+idx+'" title="The map this scene plays on; the preview gets an Open link"><option value="">(none)</option>' + mapsL.map(function(m) { return '<option value="'+esc(m.id)+'"'+(b.linkMapId === m.id ? ' selected' : '')+'>'+esc(m.meta.title || m.id)+'</option>'; }).join('') + '</select></label>';
                  if (linkedMap) html += '<label>Room <select class="b-linkroom" data-idx="'+idx+'" title="Land in this room"><option value="">(map as a whole)</option>' + (linkedMap.rooms || []).map(function(r) { return '<option value="'+esc(r.id)+'"'+(b.linkRoomId === r.id ? ' selected' : '')+'>'+esc(r.name || r.id)+'</option>'; }).join('') + '</select></label>';
                  html += '</div>';
              }
              var colNames = (Array.isArray(b.cols) && b.cols.length > 0) ? b.cols.slice() : (plain ? ['Item', 'Detail', 'Notes'] : ['Action', 'Why', 'Cost', 'Returns via']);
              if (!b.rows) b.rows = [];
              html += '<div class="fc-opts"><label>Columns <select class="b-ncols" data-idx="'+idx+'" title="How many columns the table has">' + [1,2,3,4,5,6,7,8].map(function(n) { return '<option value="'+n+'"'+(colNames.length === n ? ' selected' : '')+'>'+n+'</option>'; }).join('') + '</select></label><span style="color:var(--dim); font-size:11px;">Headers below, then one line of boxes per row.</span></div>';
              html += '<div class="grouped-fields b-table"><div class="row-h b-heads">';
              colNames.forEach(function(c, ci) { html += '<input type="text" class="b-colhead" placeholder="Column '+(ci+1)+'" value="'+esc(c)+'" data-idx="'+idx+'" data-ci="'+ci+'" title="Header of column '+(ci+1)+'">'; });
              html += '<div style="width:31px; height:31px; flex:0 0 31px;"></div></div>';
              b.rows.forEach(function(r, ri) {
                  html += '<div class="row-h">';
                  colNames.forEach(function(c, ci) { html += '<input type="text" class="r-col" placeholder="'+esc(c||'—')+'" value="'+esc(r['col'+(ci+1)]||'')+'" data-idx="'+idx+'" data-ri="'+ri+'" data-ci="'+ci+'">'; });
                  html += '<button class="tool ghost danger del-row x-btn" data-idx="'+idx+'" data-ri="'+ri+'" title="Remove this row">✖</button>';
                  html += '</div>';
              });
              html += '</div>';
              html += '<button class="tool ghost add-row" data-idx="'+idx+'">+ Add Row</button>';
          } else if (b.type === 'flowchart') {
              if (!b.nodes) b.nodes = [];
              if (!b.edges) b.edges = [];
              // Layout options: direction, spacing, zoom; nudges can be reset
              var fdir = b.dir || 'TD', fsp = b.space || 'normal', fz = Math.round((b.zoom || 1) * 100);
              html += '<div class="row-h fc-opts">';
              html += '<select data-idx="'+idx+'" class="fc-dir" title="Which way the chart flows"><option value="TD"'+(fdir==='TD'?' selected':'')+'>Top to bottom</option><option value="LR"'+(fdir==='LR'?' selected':'')+'>Left to right</option><option value="BT"'+(fdir==='BT'?' selected':'')+'>Bottom to top</option><option value="RL"'+(fdir==='RL'?' selected':'')+'>Right to left</option></select>';
              html += '<select data-idx="'+idx+'" class="fc-space" title="Room between nodes"><option value="compact"'+(fsp==='compact'?' selected':'')+'>Compact</option><option value="normal"'+(fsp==='normal'?' selected':'')+'>Normal spacing</option><option value="wide"'+(fsp==='wide'?' selected':'')+'>Wide spacing</option></select>';
              html += '<label style="display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--dim);">Zoom <input type="range" min="50" max="300" step="10" value="'+fz+'" data-idx="'+idx+'" class="fc-zoom" style="width:110px;"> <span class="fc-zoom-val">'+fz+'%</span></label>';
              html += '<button class="tool ghost fc-reset-pos" data-idx="'+idx+'" title="Put every node back to the size and place the chart gives it"'+((b.nodePos && Object.keys(b.nodePos).length) || (b.nodeSize && Object.keys(b.nodeSize).length) ? '' : ' style="display:none;"')+'>Reset tweaks</button>';
              html += '</div>';
              html += '<div style="font-size:11px; color:var(--dim); margin-bottom:8px;">In the preview: drag a node to nudge it, drag its corner square to resize it, drag the box\'s corner to resize the box. Enter in a label starts a new line.</div>';
              html += '<div style="margin-bottom:5px;"><strong>Nodes:</strong></div>';

              b.nodes.forEach(function(n, ni) {

                  html += '<div class="grouped-fields">';

                  html += '<div class="row-h">';

                  html += '<input type="text" value="'+esc(n.id||'')+'" placeholder="ID (n1)" data-idx="'+idx+'" data-ni="'+ni+'" class="fc-n-id" style="flex: 0 0 60px;">';

                  html += '<textarea rows="1" placeholder="Label (Enter for a new line)" data-idx="'+idx+'" data-ni="'+ni+'" class="field fc-n-text fc-grow" style="flex: 1; resize:none; min-height:31px; line-height:1.3; padding:6px 8px;">'+esc(n.text||'')+'</textarea>';

                  html += '<button class="tool ghost danger del-fc-n x-btn" data-idx="'+idx+'" data-ni="'+ni+'">✖</button>';

                  html += '</div><div class="row-h">';

                  html += '<select data-idx="'+idx+'" data-ni="'+ni+'" class="fc-n-shape"><option value="rect"'+(n.shape==='rect'?' selected':'')+'>Rectangle</option><option value="rounded"'+(n.shape==='rounded'?' selected':'')+'>Rounded</option><option value="pill"'+(n.shape==='pill'?' selected':'')+'>Pill</option><option value="diamond"'+(n.shape==='diamond'?' selected':'')+'>Diamond</option><option value="hex"'+(n.shape==='hex'?' selected':'')+'>Hexagon</option></select>';

                  html += '<select data-idx="'+idx+'" data-ni="'+ni+'" class="fc-n-color"><option value="gold"'+(n.color==='gold'?' selected':'')+'>Gold</option><option value="blue"'+(n.color==='blue'?' selected':'')+'>Blue</option><option value="green"'+(n.color==='green'?' selected':'')+'>Green</option><option value="red"'+(n.color==='red'?' selected':'')+'>Red</option><option value="violet"'+(n.color==='violet'?' selected':'')+'>Violet</option><option value="neutral"'+(n.color==='neutral'?' selected':'')+'>Neutral</option></select>';

                  html += '<div style="width:31px; height:31px; flex:0 0 31px;"></div>'; // spacer to align inputs

                  html += '</div></div>';

              });

              html += '<button class="tool ghost add-fc-n" data-idx="'+idx+'" style="margin-bottom:12px;">+ Add Node</button>';

              

              html += '<div style="margin-bottom:5px;"><strong>Arrows:</strong></div>';

              b.edges.forEach(function(e, ei) {

                  html += '<div class="grouped-fields">';

                  html += '<div class="row-h">';

                  html += '<input type="text" value="'+esc(e.from||'')+'" placeholder="From ID" data-idx="'+idx+'" data-ei="'+ei+'" class="fc-e-from" style="flex: 1;">';

                  html += '<input type="text" value="'+esc(e.to||'')+'" placeholder="To ID" data-idx="'+idx+'" data-ei="'+ei+'" class="fc-e-to" style="flex: 1;">';

                  html += '<button class="tool ghost danger del-fc-e x-btn" data-idx="'+idx+'" data-ei="'+ei+'">✖</button>';

                  html += '</div><div class="row-h">';

                  html += '<input type="text" value="'+esc(e.text||'')+'" placeholder="Label (optional)" data-idx="'+idx+'" data-ei="'+ei+'" class="fc-e-text" style="flex: 1;">';

                  html += '<select data-idx="'+idx+'" data-ei="'+ei+'" class="fc-e-style" style="flex: 1;"><option value="solid"'+(e.style==='solid'?' selected':'')+'>Solid Line</option><option value="dotted"'+(e.style==='dotted'?' selected':'')+'>Dotted Line</option></select>';

                  html += '<div style="width:31px; height:31px; flex:0 0 31px;"></div>'; // spacer to align inputs

                  html += '</div></div>';

              });

              html += '<button class="tool ghost add-fc-e" data-idx="'+idx+'">+ Add Arrow</button>';

          }

          html += '</div>';

      });

      blockContainer.innerHTML = html;

      

      // Attach listeners

      Array.from(blockContainer.querySelectorAll('.b-title')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].title = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.b-img-pick')).forEach(el => el.addEventListener('click', function() {
          var idx = +this.dataset.idx;
          if (!window.wpPickImage) { toast('The image library is not available here.'); return; }
          window.wpPickImage(function(src) { activeMap.blocks[idx].src = src; save(true); renderPlanner(); });
      }));
      Array.from(blockContainer.querySelectorAll('.b-img-upload')).forEach(el => el.addEventListener('change', function() {
          var idx = +this.dataset.idx, f = this.files && this.files[0]; if (!f || !f.type.startsWith('image/')) return;
          toast('Uploading picture…');
          fetch('/api/upload?mapId=' + encodeURIComponent(activeMap.id) + '&filename=' + encodeURIComponent(f.name), { method: 'POST', body: f })
              .then(function(r) { return r.json(); }).then(function(d) { if (d.url) { activeMap.blocks[idx].src = d.url; save(true); renderPlanner(); } else toast('Upload failed.'); })
              .catch(function() { toast('Upload failed.'); });
      }));
      Array.from(blockContainer.querySelectorAll('.b-imgw')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].width = +this.value; save(true); renderPlannerPreview(); }));
      Array.from(blockContainer.querySelectorAll('.b-imga')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].align = this.value; save(true); renderPlannerPreview(); }));
      Array.from(blockContainer.querySelectorAll('.b-caption')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].caption = this.value; save(true); renderPlannerPreview(); }));
      Array.from(blockContainer.querySelectorAll('.b-sub')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx][activeMap.blocks[this.dataset.idx].type==='node'?'tag':'sub'] = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.b-must')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].must = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.b-linkmap')).forEach(el => el.addEventListener('change', function() {
          var bb = activeMap.blocks[this.dataset.idx];
          if (this.value) bb.linkMapId = this.value; else delete bb.linkMapId;
          delete bb.linkRoomId;
          save(true); renderPlanner();
      }));
      Array.from(blockContainer.querySelectorAll('.b-linkroom')).forEach(el => el.addEventListener('change', function() {
          var bb = activeMap.blocks[this.dataset.idx];
          if (this.value) bb.linkRoomId = this.value; else delete bb.linkRoomId;
          save(false); renderPlannerPreview();
      }));
      Array.from(blockContainer.querySelectorAll('.b-mode')).forEach(el => el.addEventListener('change', function() {
          var bb = activeMap.blocks[this.dataset.idx];
          if (this.value === 'table') bb.mode = 'table'; else delete bb.mode;
          save(true); renderPlanner();
      }));
      Array.from(blockContainer.querySelectorAll('.b-ncols')).forEach(el => el.addEventListener('change', function() {
          var bb = activeMap.blocks[this.dataset.idx], n = Math.max(1, Math.min(8, parseInt(this.value, 10) || 1));
          var cols = (Array.isArray(bb.cols) && bb.cols.length > 0) ? bb.cols.slice() : (bb.mode === 'table' ? ['Item', 'Detail', 'Notes'] : ['Action', 'Why', 'Cost', 'Returns via']);
          while (cols.length < n) cols.push('Column ' + (cols.length + 1));
          cols = cols.slice(0, n);
          bb.cols = cols;
          save(true); renderPlanner();
      }));
      Array.from(blockContainer.querySelectorAll('.b-colhead')).forEach(el => el.addEventListener('input', function() {
          var bb = activeMap.blocks[this.dataset.idx];
          if (!Array.isArray(bb.cols) || !bb.cols.length) bb.cols = bb.mode === 'table' ? ['Item', 'Detail', 'Notes'] : ['Action', 'Why', 'Cost', 'Returns via'];
          bb.cols[this.dataset.ci] = this.value;
          save(false); renderPlannerPreview();
      }));
      Array.from(blockContainer.querySelectorAll('.b-content')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].content = this.value; save(false); if(activeMap.blocks[this.dataset.idx].type !== 'diagram') renderPlannerPreview(); }));
      wireRte(blockContainer);

      Array.from(blockContainer.querySelectorAll('.r-col')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].rows[this.dataset.ri]['col' + (parseInt(this.dataset.ci, 10) + 1)] = this.value; save(false); renderPlannerPreview(); }));

      

      Array.from(blockContainer.querySelectorAll('.mv-up')).forEach(el => el.addEventListener('click', function() { 

          var i = parseInt(this.dataset.idx); if (i>0) { var t=activeMap.blocks[i]; activeMap.blocks[i]=activeMap.blocks[i-1]; activeMap.blocks[i-1]=t; save(true); renderPlanner(); }

      }));

      Array.from(blockContainer.querySelectorAll('.mv-dn')).forEach(el => el.addEventListener('click', function() { 

          var i = parseInt(this.dataset.idx); if (i<activeMap.blocks.length-1) { var t=activeMap.blocks[i]; activeMap.blocks[i]=activeMap.blocks[i+1]; activeMap.blocks[i+1]=t; save(true); renderPlanner(); }

      }));

      Array.from(blockContainer.querySelectorAll('.del-blk')).forEach(el => el.addEventListener('click', function() { 

          activeMap.blocks.splice(this.dataset.idx, 1); save(true); renderPlanner(); 

      }));

      Array.from(blockContainer.querySelectorAll('.add-row')).forEach(el => el.addEventListener('click', function() { 

          activeMap.blocks[this.dataset.idx].rows.push({}); save(true); renderPlanner(); 

      }));

      Array.from(blockContainer.querySelectorAll('.del-row')).forEach(el => el.addEventListener('click', function() { 

          activeMap.blocks[this.dataset.idx].rows.splice(this.dataset.ri, 1); save(true); renderPlanner(); 

      }));

      Array.from(blockContainer.querySelectorAll('.fc-n-id')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].nodes[this.dataset.ni].id = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.fc-grow')).forEach(function(el) {
          var grow = function() { el.style.height = 'auto'; el.style.height = Math.max(31, el.scrollHeight) + 'px'; };
          el.addEventListener('input', grow); el.addEventListener('keydown', function(e) { e.stopPropagation(); }); grow();
      });
      Array.from(blockContainer.querySelectorAll('.fc-dir')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].dir = this.value; save(true); renderPlannerPreview(); }));
      Array.from(blockContainer.querySelectorAll('.fc-space')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].space = this.value; save(true); renderPlannerPreview(); }));
      Array.from(blockContainer.querySelectorAll('.fc-zoom')).forEach(el => el.addEventListener('input', function() {
          activeMap.blocks[this.dataset.idx].zoom = parseInt(this.value, 10) / 100;
          var v = this.parentElement.querySelector('.fc-zoom-val'); if (v) v.textContent = this.value + '%';
          fcApplyZoom(this.dataset.idx); save(true);
      }));
      Array.from(blockContainer.querySelectorAll('.fc-reset-pos')).forEach(el => el.addEventListener('click', function() {
          var bb = activeMap.blocks[this.dataset.idx]; delete bb.nodePos; delete bb.nodeSize; delete bb.nodePosSig; save(true); renderPlanner(); renderPlannerPreview();
      }));
      Array.from(blockContainer.querySelectorAll('.fc-n-text')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].nodes[this.dataset.ni].text = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.fc-n-shape')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].nodes[this.dataset.ni].shape = this.value; save(true); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.fc-n-color')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].nodes[this.dataset.ni].color = this.value; save(true); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.del-fc-n')).forEach(el => el.addEventListener('click', function() { activeMap.blocks[this.dataset.idx].nodes.splice(this.dataset.ni, 1); save(true); renderPlanner(); }));

      Array.from(blockContainer.querySelectorAll('.add-fc-n')).forEach(el => el.addEventListener('click', function() { activeMap.blocks[this.dataset.idx].nodes.push({id: 'n'+(activeMap.blocks[this.dataset.idx].nodes.length+1), text: 'Node', shape: 'rect', color: 'neutral'}); save(true); renderPlanner(); }));



      Array.from(blockContainer.querySelectorAll('.fc-e-from')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].edges[this.dataset.ei].from = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.fc-e-to')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].edges[this.dataset.ei].to = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.fc-e-text')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].edges[this.dataset.ei].text = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.fc-e-style')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].edges[this.dataset.ei].style = this.value; save(true); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.del-fc-e')).forEach(el => el.addEventListener('click', function() { activeMap.blocks[this.dataset.idx].edges.splice(this.dataset.ei, 1); save(true); renderPlanner(); }));

      Array.from(blockContainer.querySelectorAll('.add-fc-e')).forEach(el => el.addEventListener('click', function() { activeMap.blocks[this.dataset.idx].edges.push({from: '', to: '', text: '', style: 'solid'}); save(true); renderPlanner(); }));

      

      renderPlannerPreview();

      applyPlannerFullscreen();

  }



  // Render Preview toggles a fullscreen reading view: editor hidden, preview full-width

  var plannerFullscreen = false;
  // Exports always use the rendered document: switch to Render Preview if needed, re-render at
  // full width, run the export, then put the view back the way it was.
  window.wpWithRenderedPlanner = async function(fn) {
      var am = getActiveMap();
      if (!am || am.type !== 'planner') { await fn(); return; }
      var was = plannerFullscreen;
      if (!was) { plannerFullscreen = true; applyPlannerFullscreen(); renderPlannerPreview(); await new Promise(function(r) { setTimeout(r, 700); }); }
      try { await fn(); }
      finally { if (!was) { plannerFullscreen = false; applyPlannerFullscreen(); renderPlannerPreview(); } }
  };

  function applyPlannerFullscreen() {

      var ed = document.getElementById('plannerEditorWrap');

      var pw = document.getElementById('plannerPreviewWrap');

      var stSel = document.getElementById('plannerStatus');
      if (stSel) { var amS = getActiveMap(); stSel.value = (amS && amS.meta && amS.meta.status) || ''; }
      var btn = document.getElementById('renderPlannerBtn');

      if (!ed || !pw) return;

      ed.style.display = plannerFullscreen ? 'none' : 'flex';

      pw.style.width = plannerFullscreen ? '100%' : '50%';

      if (btn) btn.innerHTML = plannerFullscreen ? '&#9998; Edit' : '&#9654; Render Preview';

  }



  // Typed text keeps its line breaks: a blank line starts a new paragraph, a single Enter a
  // line break. Content that already uses block HTML (<p>, <br>, lists, headings…) is left as is.
  /* ---- rich text editor for text blocks ----
     A formatting bar over a contenteditable box. Buttons apply to the selection, or to what is
     typed next when nothing is selected (the browser's own toggle behaviour); Ctrl+B/I/U work as
     usual. The block keeps the box's HTML. Old content — raw newlines, or tags typed by hand —
     is shown as it always rendered. */
  var RTE_CMDS = [
      { c: 'bold', l: '<b>B</b>', t: 'Bold (Ctrl+B)' }, { c: 'italic', l: '<i>I</i>', t: 'Italic (Ctrl+I)' },
      { c: 'underline', l: '<u>U</u>', t: 'Underline (Ctrl+U)' }, { c: 'strikeThrough', l: '<s>S</s>', t: 'Strikethrough' },
      { sep: true },
      { c: 'insertUnorderedList', l: '&#8226; List', t: 'Bulleted list' }, { c: 'insertOrderedList', l: '1. List', t: 'Numbered list' },
      { sep: true },
      { c: 'removeFormat', l: 'T&#8339;', t: 'Clear formatting on the selection' },
      { sep: true },
      { sym: true, l: '&#937;', t: 'Insert a symbol — arrows, dashes, ellipsis, bullets, maths, checks, quotes' }
  ];
  // Symbols the bar can drop in at the cursor. Each entry: [character, name].
  var RTE_SYMS = [
      ['\u2192', 'right arrow'], ['\u2190', 'left arrow'], ['\u2194', 'both ways'], ['\u21D2', 'implies'], ['\u2191', 'up'], ['\u2193', 'down'], ['\u21B3', 'then'],
      ['\u2014', 'em dash'], ['\u2013', 'en dash'], ['\u2026', 'ellipsis'], ['\u2022', 'bullet'], ['\u00B7', 'middle dot'], ['\u25AA', 'small square'], ['\u25B8', 'small triangle'],
      ['\u00D7', 'times'], ['\u00F7', 'divide'], ['\u00B1', 'plus-minus'], ['\u2248', 'about'], ['\u2260', 'not equal'], ['\u2264', 'at most'], ['\u2265', 'at least'], ['\u221E', 'infinity'],
      ['\u00B0', 'degrees'], ['\u00BD', 'half'], ['\u00BC', 'quarter'], ['\u00BE', 'three quarters'], ['\u00B2', 'squared'],
      ['\u2713', 'check'], ['\u2717', 'cross'], ['\u2605', 'star'], ['\u2606', 'empty star'], ['\u2020', 'dagger'], ['\u2021', 'double dagger'], ['\u00A7', 'section'], ['\u00B6', 'pilcrow'],
      ['\u201C', 'open quote'], ['\u201D', 'close quote'], ['\u2018', 'open single'], ['\u2019', 'apostrophe'], ['\u00AB', 'guillemet open'], ['\u00BB', 'guillemet close'],
      ['\u2122', 'trademark'], ['\u00A9', 'copyright'], ['\u00AE', 'registered'], ['\u2699', 'gear'], ['\u2694', 'crossed swords'], ['\u2620', 'skull'], ['\u2691', 'flag'], ['\u2690', 'empty flag']
  ];
  function rteInitial(b) {
      var c = String(b.content || '');
      if (/<(p|br|div|ul|ol|li|h[1-6]|table|pre|blockquote)\b/i.test(c)) return c;   // already block HTML
      var body = nl(c, b.type === 'text');
      return b.type === 'text' && body ? '<p>' + body + '</p>' : body;
  }
  function rteHtml(idx, b) {
      var bar = RTE_CMDS.map(function(k) {
          if (k.sep) return '<span class="rte-sep"></span>';
          if (k.sym) return '<span class="rte-symwrap"><button type="button" class="rte-btn rte-symbtn" title="' + k.t + '" tabindex="-1">' + k.l + '</button><div class="rte-syms">' + RTE_SYMS.map(function(s) { return '<button type="button" class="rte-sym" data-sym="' + s[0] + '" title="' + s[1] + '" tabindex="-1">' + s[0] + '</button>'; }).join('') + '</div></span>';
          return '<button type="button" class="rte-btn" data-cmd="' + k.c + '" title="' + k.t + '" tabindex="-1">' + k.l + '</button>';
      }).join('');
      return '<div class="rte" data-idx="' + idx + '"><div class="rte-bar">' + bar + '</div>'
          + '<div class="field rte-body" contenteditable="true" data-idx="' + idx + '" data-placeholder="Write here — select text and use the bar, or Ctrl+B / I / U" spellcheck="true">' + rteInitial(b) + '</div></div>';
  }
  function rteSyncBar(body) {
      var bar = body.parentNode.querySelector('.rte-bar'); if (!bar) return;
      bar.querySelectorAll('.rte-btn').forEach(function(btn) {
          var on = false; try { on = document.queryCommandState(btn.dataset.cmd); } catch (e) {}
          btn.classList.toggle('on', !!on);
      });
  }
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); } catch (e) {}
  document.addEventListener('pointerdown', function(e) { if (!(e.target.closest && e.target.closest('.rte-symwrap'))) document.querySelectorAll('.rte-symwrap.open').forEach(function(w) { w.classList.remove('open'); }); }, true);
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape') document.querySelectorAll('.rte-symwrap.open').forEach(function(w) { w.classList.remove('open'); }); }, true);
  document.addEventListener('selectionchange', function() {
      var a = document.activeElement; if (a && a.classList && a.classList.contains('rte-body')) rteSyncBar(a);
  });
  function wireRte(container) {
      Array.from(container.querySelectorAll('.rte-body')).forEach(function(body) {
          body.addEventListener('input', function() {
              var am = getActiveMap(); if (!am || !am.blocks) return;
              am.blocks[this.dataset.idx].content = this.innerHTML;
              save(false); renderPlannerPreview(); rteSyncBar(this);
          });
          body.addEventListener('keydown', function(e) { e.stopPropagation(); });
          body.addEventListener('paste', function(e) {   // plain text only — no styles from elsewhere
              e.preventDefault();
              var t = (e.clipboardData || window.clipboardData).getData('text/plain');
              document.execCommand('insertText', false, t);
          });
          body.addEventListener('focus', function() { rteSyncBar(this); });
      });
      Array.from(container.querySelectorAll('.rte-bar')).forEach(function(bar) {
          bar.addEventListener('mousedown', function(e) { e.preventDefault(); });   // keep the selection in the box
          bar.addEventListener('click', function(e) {
              var body = bar.parentNode.querySelector('.rte-body');
              var sym = e.target.closest && e.target.closest('.rte-sym');
              if (sym) {   // drop the symbol in at the cursor (replacing a selection), close the tray
                  body.focus();
                  try { document.execCommand('insertText', false, sym.dataset.sym); } catch (err) {}
                  bar.querySelector('.rte-symwrap').classList.remove('open');
                  body.dispatchEvent(new Event('input', { bubbles: true }));
                  return;
              }
              var symBtn = e.target.closest && e.target.closest('.rte-symbtn');
              if (symBtn) { symBtn.parentNode.classList.toggle('open'); return; }
              var btn = e.target.closest && e.target.closest('.rte-btn'); if (!btn) return;
              body.focus();
              try { document.execCommand(btn.dataset.cmd, false, null); } catch (err) {}
              body.dispatchEvent(new Event('input', { bubbles: true }));
          });
      });
  }
  function nl(content, para) {
      var c = String(content || '');
      if (!/\n/.test(c) || /<(p|br|div|ul|ol|li|h[1-6]|table|pre|blockquote)\b/i.test(c)) return c;
      c = c.replace(/\r/g, '');
      if (para) return c.split(/\n{2,}/).map(function(x) { return x.replace(/\n/g, '<br>'); }).join('</p><p>');
      return c.replace(/\n/g, '<br>');
  }
  /* ---- flowchart post-processing ----
     Mermaid lays the chart out; on top of that the GM can zoom it, resize its box, and nudge
     nodes by hand. Nudges are stored on the block as absolute positions (in the SVG's own
     units) together with a signature of the node ids, and thrown away when the set of nodes
     changes, since the chart is laid out afresh then. Edges touching a nudged node are redrawn
     as straight lines between node centres. */
  function fcBlockOf(box) { var am = getActiveMap(); var i = parseInt(box.dataset.fc, 10); return am && am.blocks ? am.blocks[i] : null; }
  function fcNodeId(g) { return String(g.id || '').replace(/^flowchart-/, '').replace(/-\d+$/, ''); }
  function fcTranslate(g) { var m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(g.getAttribute('transform') || ''); return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 }; }
  function fcSig(b) { return (b.nodes || []).map(function(n) { return n.id; }).sort().join(','); }
  function fcApplyZoom(idx) {
      var box = document.querySelector('#plannerPreview .fc-box[data-fc="' + idx + '"]'); if (!box) return;
      var svg = box.querySelector('svg'); if (!svg) return;
      var b = fcBlockOf(box); var z = (b && b.zoom) || 1;
      var vb = (svg.getAttribute('viewBox') || '0 0 0 0').split(/[\s,]+/).map(Number);
      if (z === 1) { svg.style.width = ''; svg.style.maxWidth = svg.dataset.fitW ? svg.dataset.fitW + 'px' : ''; svg.removeAttribute('data-zoomed'); return; }
      svg.style.maxWidth = 'none'; svg.style.width = Math.round((vb[2] || svg.getBoundingClientRect().width) * z) + 'px'; svg.style.height = 'auto'; svg.dataset.zoomed = '1';
  }
  // The node's shape element (rect, polygon, circle…) — the first child that isn't the label
  function fcShape(g) { return g.querySelector(':scope > rect, :scope > polygon, :scope > circle, :scope > ellipse, :scope > path'); }
  function fcScaleOf(g) { var m = /scale\(\s*([-\d.]+)[ ,]*([-\d.]*)/.exec((fcShape(g) || g).getAttribute('transform') || ''); return m ? { x: parseFloat(m[1]), y: m[2] ? parseFloat(m[2]) : parseFloat(m[1]) } : { x: 1, y: 1 }; }
  // Half-extents of a node's box in SVG units, including any hand resize
  function fcHalf(g) {
      var sh = fcShape(g); var sc = fcScaleOf(g);
      try { var bb = sh ? sh.getBBox() : g.getBBox(); return { w: Math.max(4, bb.width / 2 * sc.x), h: Math.max(4, bb.height / 2 * sc.y) }; }
      catch (e) { return { w: 30, h: 20 }; }
  }
  // Where a line from this node's centre towards (tx,ty) leaves its box
  function fcEdgePoint(g, c, tx, ty) {
      var h = fcHalf(g), dx = tx - c.x, dy = ty - c.y;
      if (!dx && !dy) return c;
      var t = Math.min(dx ? h.w / Math.abs(dx) : Infinity, dy ? h.h / Math.abs(dy) : Infinity);
      return { x: c.x + dx * t, y: c.y + dy * t };
  }
  function fcRedrawEdges(svg, nid) {
      var links = Array.from(svg.querySelectorAll('path.flowchart-link'));
      var labels = Array.from(svg.querySelectorAll('g.edgeLabel'));
      var nodeOf = function(id) { return svg.querySelector('g.node[id^="flowchart-' + id + '-"]'); };
      links.forEach(function(p, i) {
          var cls = p.getAttribute('class') || '';
          var s = (/\bLS-([^\s]+)/.exec(cls) || [])[1], t = (/\bLE-([^\s]+)/.exec(cls) || [])[1];
          if (!s || !t || (s !== nid && t !== nid)) return;
          var gs = nodeOf(s), gt = nodeOf(t); if (!gs || !gt) return;
          var cs = fcTranslate(gs), ct = fcTranslate(gt);
          var a = fcEdgePoint(gs, cs, ct.x, ct.y), c = fcEdgePoint(gt, ct, cs.x, cs.y);
          p.setAttribute('d', 'M' + a.x + ',' + a.y + 'L' + c.x + ',' + c.y);
          var lab = labels[i]; if (lab) lab.setAttribute('transform', 'translate(' + ((a.x + c.x) / 2) + ',' + ((a.y + c.y) / 2) + ')');
      });
  }
  // Hand-resized nodes: the shape is scaled about the node's centre; the label keeps its size
  function fcApplySize(g, sx, sy) {
      var sh = fcShape(g); if (!sh) return;
      sh.setAttribute('transform', 'scale(' + sx + ',' + sy + ')');
      fcPlaceHandle(g);
  }
  function fcPlaceHandle(g) {
      var hd = g.querySelector(':scope > rect.fc-handle'); if (!hd) return;
      var h = fcHalf(g);
      hd.setAttribute('x', h.w - 5); hd.setAttribute('y', h.h - 5);
  }
  function fcApplySizes(svg, b) {
      if (!b.nodeSize) return;
      Object.keys(b.nodeSize).forEach(function(nid) {
          var g = svg.querySelector('g.node[id^="flowchart-' + nid + '-"]'); if (!g) return;
          var z = b.nodeSize[nid]; fcApplySize(g, z.x, z.y); fcRedrawEdges(svg, nid);
      });
  }
  function fcWireResizeHandles(box, svg, b) {
      var pt = svg.createSVGPoint();
      var inv = null;
      var toSvg = function(e) { pt.x = e.clientX; pt.y = e.clientY; return inv ? pt.matrixTransform(inv) : { x: 0, y: 0 }; };
      Array.from(svg.querySelectorAll('g.node')).forEach(function(g) {
          if (g.querySelector(':scope > rect.fc-handle')) return;
          var hd = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          hd.setAttribute('class', 'fc-handle'); hd.setAttribute('width', 10); hd.setAttribute('height', 10); hd.setAttribute('rx', 2);
          g.appendChild(hd); fcPlaceHandle(g);
          hd.addEventListener('pointerdown', function(e) {
              if (e.button !== 0) return;
              e.preventDefault(); e.stopPropagation();   // not a nudge
              var nid = fcNodeId(g), sh = fcShape(g); if (!sh) return;
              var m0 = svg.getScreenCTM(); if (!m0) return; inv = m0.inverse();
              svg.style.overflow = 'visible';
              var sc0 = fcScaleOf(g); var bb; try { bb = sh.getBBox(); } catch (err) { return; }
              var baseW = Math.max(4, bb.width / 2), baseH = Math.max(4, bb.height / 2), c = fcTranslate(g);
              var onMove = function(ev) {
                  var q = toSvg(ev);
                  var sx = Math.max(0.5, Math.min(6, (q.x - c.x) / baseW)), sy = Math.max(0.5, Math.min(6, (q.y - c.y) / baseH));
                  fcApplySize(g, Math.round(sx * 100) / 100, Math.round(sy * 100) / 100);
                  fcRedrawEdges(svg, nid);
              };
              var onUp = function() {
                  window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
                  svg.style.overflow = ''; inv = null;
                  var sc = fcScaleOf(g);
                  if (Math.abs(sc.x - sc0.x) < 0.01 && Math.abs(sc.y - sc0.y) < 0.01) return;
                  fcFitViewBox(svg); fcApplyZoom(box.dataset.fc);
                  b.nodeSize = b.nodeSize || {}; b.nodeSize[nid] = { x: sc.x, y: sc.y }; b.nodePosSig = fcSig(b);
                  save(true);
                  var rb = document.querySelector('.fc-reset-pos[data-idx="' + box.dataset.fc + '"]'); if (rb) rb.style.display = '';
              };
              window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
          });
      });
  }
  function fcApplyNudges(box, svg, b) {
      if (!b.nodePos && !b.nodeSize) return;
      if (!b.nodePos) b.nodePos = {};
      if (b.nodePosSig !== fcSig(b)) { delete b.nodePos; delete b.nodeSize; delete b.nodePosSig; save(true); return; }   // the chart changed shape: fresh layout
      Object.keys(b.nodePos).forEach(function(nid) {
          var g = svg.querySelector('g.node[id^="flowchart-' + nid + '-"]'); if (!g) return;
          var p = b.nodePos[nid]; g.setAttribute('transform', 'translate(' + p.x + ', ' + p.y + ')');
          fcRedrawEdges(svg, nid);
      });
  }
  function fcWireNudging(box, svg, b) {
      var pt = svg.createSVGPoint();
      var inv = null;   // screen→SVG matrix captured when a drag starts, so the mapping cannot shift under the pointer
      var toSvg = function(e) { pt.x = e.clientX; pt.y = e.clientY; return inv ? pt.matrixTransform(inv) : { x: 0, y: 0 }; };
      Array.from(svg.querySelectorAll('g.node')).forEach(function(g) {
          g.style.cursor = 'move';
          g.addEventListener('pointerdown', function(e) {
              if (e.button !== 0) return;
              e.preventDefault(); e.stopPropagation();
              var m0 = svg.getScreenCTM(); if (!m0) return; inv = m0.inverse();
              svg.style.overflow = 'visible';
              var nid = fcNodeId(g), start = toSvg(e), origin = fcTranslate(g), moved = false;
              var onMove = function(ev) {
                  var q = toSvg(ev); var nx = origin.x + (q.x - start.x), ny = origin.y + (q.y - start.y);
                  if (Math.abs(nx - origin.x) > 1 || Math.abs(ny - origin.y) > 1) moved = true;
                  g.setAttribute('transform', 'translate(' + nx + ', ' + ny + ')');
                  fcRedrawEdges(svg, nid);
              };
              var onUp = function(ev) {
                  window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
                  svg.style.overflow = ''; inv = null;
                  if (!moved) return;
                  fcFitViewBox(svg); fcApplyZoom(box.dataset.fc);
                  var p = fcTranslate(g);
                  b.nodePos = b.nodePos || {}; b.nodePos[nid] = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }; b.nodePosSig = fcSig(b);
                  save(true);
                  var rb = document.querySelector('.fc-reset-pos[data-idx="' + box.dataset.fc + '"]'); if (rb) rb.style.display = '';
              };
              window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
          });
      });
  }
  function fcWireResize(box, b) {
      if (!window.ResizeObserver || box.dataset.ro) return;
      box.dataset.ro = '1';
      var ro = new ResizeObserver(function() {
          // the corner handle writes inline width/height; remember those
          var w = parseInt(box.style.width, 10), h = parseInt(box.style.height, 10);
          if (!w && !h) return;
          if (w && w !== b.boxW) b.boxW = w;
          if (h && h !== b.boxH) b.boxH = h;
          clearTimeout(box._saveT); box._saveT = setTimeout(function() { save(true); }, 400);
      });
      ro.observe(box);
  }
  // Fit the SVG's view box to what is actually drawn (plus a small margin). Removes the empty
  // bands mermaid leaves when it measured labels in a pane that was not laid out yet, and keeps
  // nudged or resized nodes inside the picture.
  function fcFitViewBox(svg) {
      var root = svg.querySelector(':scope > g'); if (!root) return;
      var bb; try { bb = root.getBBox(); } catch (e) { return; }
      if (!bb || !(bb.width > 0) || !(bb.height > 0)) return;
      var pad = 12;
      var x = bb.x - pad, y = bb.y - pad, w = bb.width + pad * 2, h = bb.height + pad * 2;
      var vb = (svg.getAttribute('viewBox') || '0 0 0 0').split(/[\s,]+/).map(Number);
      if (Math.abs(vb[2] - w) < 2 && Math.abs(vb[3] - h) < 2 && Math.abs(vb[0] - x) < 2 && Math.abs(vb[1] - y) < 2) return;
      svg.setAttribute('viewBox', x + ' ' + y + ' ' + w + ' ' + h);
      svg.removeAttribute('height'); svg.style.height = 'auto';
      if (!svg.dataset.zoomed) { svg.style.maxWidth = Math.round(w) + 'px'; }
      svg.dataset.fitW = String(Math.round(w));
  }
  function fcPostProcess() {
      Array.from(document.querySelectorAll('#plannerPreview .fc-box')).forEach(function(box) {
          var svg = box.querySelector('svg'); var b = fcBlockOf(box); if (!svg || !b) return;
          fcFitViewBox(svg);
          fcApplyZoom(box.dataset.fc);
          fcWireResizeHandles(box, svg, b);
          fcApplySizes(svg, b);
          fcApplyNudges(box, svg, b);
          fcFitViewBox(svg);   // tweaks may have pushed nodes past the original bounds
          fcApplyZoom(box.dataset.fc);
          fcWireNudging(box, svg, b);
          fcWireResize(box, b);
      });
  }
  /* ---- find in planner ----
     Highlights in the rendered preview only (the editor boxes are left alone). Text nodes are
     matched on a normalised copy (lower case, accents stripped) with an index map back to the
     original, so "Selkath" is found by "selk" and "Sahrhie" by "sahr". The exact phrase wins;
     with no phrase hit, every word is matched at word starts. */
  var pfState = { q: '', hits: [], cur: -1 };
  function pfNorm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function pfClear() {
      var pv = document.getElementById('plannerPreview'); if (!pv) return;
      pv.querySelectorAll('mark.pf-hit').forEach(function(m) { var p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize(); });
      pfState.hits = []; pfState.cur = -1;
  }
  function pfTextNodes(root) {
      var out = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: function(n) {
          var p = n.parentNode; if (!p) return NodeFilter.FILTER_REJECT;
          var tag = p.nodeName; if (tag === 'SCRIPT' || tag === 'STYLE' || p.closest('svg')) return NodeFilter.FILTER_REJECT;
          return n.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      } });
      var n; while ((n = w.nextNode())) out.push(n);
      return out;
  }
  // ranges [start,end) in a text node's original string for a regex over its normalised form
  function pfRanges(node, re) {
      var orig = node.nodeValue, map = [], norm = '';
      for (var i = 0; i < orig.length; i++) { var ch = orig[i].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); for (var k = 0; k < ch.length; k++) map.push(i); norm += ch; }
      map.push(orig.length);
      var out = [], m; re.lastIndex = 0;
      while ((m = re.exec(norm))) { if (!m[0]) { re.lastIndex++; continue; } out.push([map[m.index], map[m.index + m[0].length - 1] + 1]); }
      return out;
  }
  function pfWrap(node, ranges) {
      var hits = [];
      for (var i = ranges.length - 1; i >= 0; i--) {   // from the end so earlier offsets stay valid
          var r = ranges[i], rest = node.splitText(r[0]), after = rest.splitText(r[1] - r[0]);
          var mk = document.createElement('mark'); mk.className = 'pf-hit'; rest.parentNode.insertBefore(mk, rest); mk.appendChild(rest);
          hits.unshift(mk); void after;
      }
      return hits;
  }
  function pfEsc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function plannerFindApply(keepCur) {
      var pv = document.getElementById('plannerPreview'), box = document.getElementById('plannerFind'), cnt = document.getElementById('plannerFindCount'); if (!pv || !box) return;
      var wasCur = keepCur ? pfState.cur : -1;
      pfClear();
      var q = pfNorm(box.value).trim(); pfState.q = q;
      if (!q) { if (cnt) cnt.textContent = ''; return; }
      var nodes = pfTextNodes(pv), hits = [];
      var phrase = new RegExp(pfEsc(q), 'g');
      nodes.forEach(function(n) { var rs = pfRanges(n, phrase); if (rs.length) hits = hits.concat(pfWrap(n, rs)); });
      if (!hits.length && /\s/.test(q)) {   // no phrase: every word, at word starts
          var words = q.split(/\s+/).filter(Boolean).map(pfEsc);
          var re = new RegExp('(?<![a-z0-9])(' + words.join('|') + ')[a-z0-9]*', 'g');
          nodes = pfTextNodes(pv);
          nodes.forEach(function(n) {
              var rs = pfRanges(n, re).map(function(r) { return r; });
              if (rs.length) hits = hits.concat(pfWrap(n, rs));
          });
      } else if (!hits.length) {   // one word: at word starts, any ending
          var re1 = new RegExp('(?<![a-z0-9])(' + pfEsc(q) + ')[a-z0-9]*', 'g');
          nodes = pfTextNodes(pv);
          nodes.forEach(function(n) { var rs = pfRanges(n, re1); if (rs.length) hits = hits.concat(pfWrap(n, rs)); });
      }
      pfState.hits = hits;
      if (!hits.length) { if (cnt) cnt.textContent = '0'; pfState.cur = -1; return; }
      pfGo(wasCur >= 0 && wasCur < hits.length ? wasCur : 0, true);
  }
  function pfGo(i, quiet) {
      var hits = pfState.hits, cnt = document.getElementById('plannerFindCount'); if (!hits.length) return;
      if (pfState.cur >= 0 && hits[pfState.cur]) hits[pfState.cur].classList.remove('pf-cur');
      pfState.cur = ((i % hits.length) + hits.length) % hits.length;
      var h = hits[pfState.cur]; h.classList.add('pf-cur');
      h.scrollIntoView({ block: 'center', behavior: quiet ? 'auto' : 'smooth' });
      if (cnt) cnt.textContent = (pfState.cur + 1) + ' / ' + hits.length;
  }
  (function wirePlannerFind() {
      var box = document.getElementById('plannerFind'); if (!box) return;
      var t = null;
      box.addEventListener('input', function() { clearTimeout(t); t = setTimeout(function() { plannerFindApply(false); }, 120); });
      box.addEventListener('keydown', function(e) {
          e.stopPropagation();
          if (e.key === 'Enter') { e.preventDefault(); pfGo(pfState.cur + (e.shiftKey ? -1 : 1)); }
          else if (e.key === 'Escape') { box.value = ''; plannerFindApply(false); box.blur(); }
      });
      var nx = document.getElementById('plannerFindNext'), pr = document.getElementById('plannerFindPrev');
      if (nx) nx.addEventListener('click', function() { pfGo(pfState.cur + 1); });
      if (pr) pr.addEventListener('click', function() { pfGo(pfState.cur - 1); });
      document.addEventListener('keydown', function(e) {
          if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'f') return;
          var am = getActiveMap(); if (!am || am.type !== 'planner') return;
          e.preventDefault(); box.focus(); box.select();
      });
  })();
  window.wpPlannerFind = plannerFindApply;
  function renderPlannerPreview() {
      renderPlannerPreviewCore();
      var box = document.getElementById('plannerFind');
      if (box && box.value.trim()) plannerFindApply(true);   // keep the hits lit through an edit
  }
  function renderPlannerPreviewCore() {

      var activeMap = getActiveMap();

      if (!activeMap || !activeMap.blocks) return;

      var preview = document.getElementById('plannerPreview');

      

      var html = '<div class="wrap">';

      if (activeMap.blocks.length === 0) {

          html += '<div style="color:var(--dim); font-style:italic; text-align:center; padding-top: 100px;">This is the live preview pane.<br><br>Add blocks in the editor on the left to start building your document.</div>';

      }

      activeMap.blocks.forEach(function(b, _bi) {

          html += '<div class="pv-blk" data-blk="' + _bi + '">';

          if (b.type === 'h1') {

              html += '<h1>' + (b.title||'') + (b.sub ? '<span class="sub">'+b.sub+'</span>' : '') + '</h1>';

          } else if (b.type === 'h2') {

              html += '<h2>' + (b.title||'') + '</h2>';

          } else if (b.type === 'lede') {

              html += '<p class="lede">' + nl(b.content) + '</p>';

          } else if (b.type === 'oneline') {

              html += '<div class="oneline">' + nl(b.content) + '</div>';

          } else if (b.type === 'text') {

              html += /<(p|div|ul|ol|h[1-6]|blockquote|pre|table)\b/i.test(String(b.content || '')) ? String(b.content) : '<p>' + nl(b.content, true) + '</p>';

          } else if (b.type === 'flare') {

              html += '<div class="flare">' + nl(b.content) + '</div>';

          } else if (b.type === 'callout') {

              html += '<div class="callout">' + nl(b.content) + '</div>';

          } else if (b.type === 'diagram') {

              html += '<div class="diagram"><pre class="mermaid">' + (b.content||'') + '</pre></div>';

          } else if (b.type === 'image') {
              html += b.src ? '<figure class="planner-img" style="width:' + (b.width || 100) + '%; margin-left:' + ((b.align || 'center') === 'left' ? '0' : 'auto') + '; margin-right:' + ((b.align || 'center') === 'right' ? '0' : 'auto') + ';"><img src="' + esc(b.src) + '" alt="' + esc(b.caption || '') + '">' + (b.caption ? '<figcaption>' + esc(b.caption) + '</figcaption>' : '') + '</figure>' : '';
          } else if (b.type === 'raw') {

              html += (b.content||'');

          } else if (b.type === 'node') {

              var plainPv = b.mode === 'table';
              html += '<div class="node' + (plainPv ? ' plain-table' : '') + '">';
              if (!plainPv || b.title) html += '<h3>' + (b.title||'') + (!plainPv && b.tag ? ' <span class="tag">'+b.tag+'</span>' : '') + '</h3>';
              if (!plainPv && b.must) html += '<p class="must"><b>Must resolve:</b> '+b.must+'</p>';
              if (!plainPv && b.linkMapId) {
                  var campP = getActiveCampaign(), mapP = campP && campP.items[b.linkMapId];
                  if (mapP) {
                      var roomP = b.linkRoomId ? (mapP.rooms || []).find(function(r) { return r.id === b.linkRoomId; }) : null;
                      html += '<p class="pv-linkrow"><a href="#" class="pv-link" data-map="' + esc(b.linkMapId) + '" data-room="' + esc(b.linkRoomId || '') + '" title="Open this map' + (roomP ? ' at ' + esc(roomP.name || '') : '') + '">&#128205; Open ' + esc(mapP.meta.title || 'map') + (roomP ? ' · ' + esc(roomP.name || '') : '') + '</a></p>';
                  }
              }
              if (b.rows && b.rows.length > 0) {
                  var cols = (Array.isArray(b.cols) && b.cols.length > 0) ? b.cols.slice() : (plainPv ? ['Item', 'Detail', 'Notes'] : ['Action', 'Why', 'Cost', 'Returns via']);

                  html += '<table><thead><tr>' + cols.map(function(c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>';

                  b.rows.forEach(function(r) {

                      html += '<tr>' + cols.map(function(c, ci) { return '<td>' + (r['col' + (ci + 1)] || '') + '</td>'; }).join('') + '</tr>';

                  });

                  html += '</tbody></table>';

              }

              html += '</div>';

          } else if (b.type === 'flowchart') {
              // Mermaid reads ( ) [ ] { } | as shape and edge markers, so free text goes inside
              // quotes; inside quotes only " and # need escaping (mermaid's #quot; / #35; entities).
              var mmText = function(t) { return '"' + String(t || '').replace(/#/g, '#35;').replace(/"/g, '#quot;').replace(/\r?\n/g, '<br>') + '"'; };
              var mmId = function(t) { var v = String(t || '').trim().replace(/[^A-Za-z0-9_]/g, '_'); return v || 'n'; };
              var spc = { compact: [18, 28], normal: [50, 50], wide: [90, 90] }[b.space || 'normal'] || [50, 50];
              var m = '%%{init: {"flowchart": {"nodeSpacing": ' + spc[0] + ', "rankSpacing": ' + spc[1] + ', "htmlLabels": true}}}%%\n';
              m += 'flowchart ' + (/^(TD|LR|BT|RL)$/.test(b.dir || '') ? b.dir : 'TD') + '\n';

              m += 'classDef gold fill:#302517,stroke:#e0a54f,color:#fff\n';

              m += 'classDef blue fill:#1a272e,stroke:#4db3d3,color:#fff\n';

              m += 'classDef green fill:#1a3022,stroke:#5cb87a,color:#fff\n';

              m += 'classDef red fill:#361f1e,stroke:#d9534f,color:#fff\n';

              m += 'classDef violet fill:#281f3b,stroke:#b98cff,color:#fff\n';

              m += 'classDef neutral fill:#26262a,stroke:#c9c9d4,color:#fff\n';

              

              if (b.nodes) {

                  b.nodes.forEach(function(n) {

                      var id = mmId(n.id || ('n' + Math.random().toString(36).substr(2,5)));
                      var txt = mmText(n.text || 'Node');

                      var s1 = '[', s2 = ']';

                      if (n.shape === 'rounded') { s1 = '('; s2 = ')'; }

                      else if (n.shape === 'pill') { s1 = '(['; s2 = '])'; }

                      else if (n.shape === 'diamond') { s1 = '{'; s2 = '}'; }

                      else if (n.shape === 'hex') { s1 = '{{'; s2 = '}}'; }

                      m += id + s1 + txt + s2 + ':::' + (n.color || 'neutral') + '\n';

                  });

              }

              if (b.edges) {

                  b.edges.forEach(function(e) {

                      if (!e.from || !e.to) return;

                      var line = e.style === 'dotted' ? '-.->' : '-->';
                      if (e.text) line += '|' + mmText(e.text) + '|';
                      m += mmId(e.from) + ' ' + line + ' ' + mmId(e.to) + '\n';

                  });

              }

              var boxStyle = (b.boxW ? 'width:' + b.boxW + 'px;' : '') + (b.boxH ? 'height:' + b.boxH + 'px;' : '');
              html += '<div class="diagram fc-box" data-fc="' + _bi + '" style="' + boxStyle + '"><pre class="mermaid">' + m + '</pre></div>';

          }

          html += '</div>';

      });

      html += '</div>';

      

      preview.innerHTML = html;

      

      if (window.mermaid) {
          var runMermaid = function(tries) {
              var pane = document.getElementById('plannerPreview');
              if (pane && pane.clientWidth === 0 && tries < 40) { setTimeout(function() { runMermaid(tries + 1); }, 60); return; }   // wait until laid out, else labels measure wrong
              try { Promise.resolve(mermaid.run({ querySelector: '.mermaid' })).then(fcPostProcess).catch(function() {}); } catch(e) { }
          };
          runMermaid(0);
      }

  }

  

  var _el_renderPlannerBtn = document.getElementById('renderPlannerBtn');

var _el_plannerStatus = document.getElementById('plannerStatus');
if (_el_plannerStatus) _el_plannerStatus.addEventListener('change', function() {
    var am = getActiveMap(); if (!am || am.type !== 'planner') return;
    am.meta = am.meta || {};
    if (this.value) am.meta.status = this.value; else delete am.meta.status;
    if (this.value === 'next') {   // only one scene is "next" at a time
        var camp = getActiveCampaign();
        Object.values(camp.items).forEach(function(it) { if (it !== am && it.type === 'planner' && it.meta && it.meta.status === 'next') delete it.meta.status; });
    }
    save(true); updateSidebarNav();
    toast(this.value === 'next' ? 'Marked as the next scene.' : this.value === 'played' ? 'Marked played.' : this.value === 'skipped' ? 'Marked skipped.' : 'Status cleared.');
});
if(_el_renderPlannerBtn) _el_renderPlannerBtn.addEventListener('click', function() {
    plannerFullscreen = !plannerFullscreen;
    var amR = getActiveMap();
    if (amR && amR.type === 'planner') { amR.meta = amR.meta || {}; amR.meta.readerView = plannerFullscreen; save(); }   // remembered per document

    renderPlannerPreview();

    applyPlannerFullscreen();

});



  // Double-click anywhere in the rendered preview to jump the editor to that block

  var _el_plannerPreviewEl = document.getElementById('plannerPreview');
  if (_el_plannerPreviewEl) _el_plannerPreviewEl.addEventListener('click', function(e) {
      var a = e.target.closest && e.target.closest('.pv-link'); if (!a) return;
      e.preventDefault(); e.stopPropagation();
      navigateToMap(a.dataset.map, a.dataset.room || null);
  });
  if (_el_plannerPreviewEl) _el_plannerPreviewEl.addEventListener('dblclick', function(e) {

      var blk = e.target.closest('.pv-blk');

      if (!blk) return;

      var editBlock = document.querySelector('.planner-block-edit[data-idx="' + blk.dataset.blk + '"]');

      if (!editBlock) return;

      if (plannerFullscreen) { plannerFullscreen = false; applyPlannerFullscreen(); }

      editBlock.scrollIntoView({ behavior: 'smooth', block: 'center' });

      editBlock.classList.add('blk-flash');

      setTimeout(function() { editBlock.classList.remove('blk-flash'); }, 1600);

  });

  

  var _el_addBlockSelect = document.getElementById('addBlockSelect');

if(_el_addBlockSelect) _el_addBlockSelect.addEventListener('change', function() {

      var activeMap = getActiveMap();

      if (!activeMap || !this.value) return;

      if (!activeMap.blocks) activeMap.blocks = [];

      activeMap.blocks.push(this.value === 'table' ? { id: 'b_'+uid(), type: 'node', mode: 'table' } : { id: 'b_'+uid(), type: this.value });

      this.value = '';

      save(true);

      renderPlanner();

  });



export {

    renderPlanner,

    renderPlannerPreview

};

