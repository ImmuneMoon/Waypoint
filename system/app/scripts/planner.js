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

import { showPrompt, showConfirm, isCampaignNameTaken, getUniqueCampaignTitle, promptForCampaignName, isItemNameTaken, getUniqueItemTitle, promptForItemName } from './dialogs.js';

import { renderDataMap, clearSnaps, drawSnap, doSmartSnapping, attachDrag, attachPanning, isLinkMode, setLinkMode, removeLinkAt } from './datamap.js';

import { renderWhiteboard, attachResizeHandle, attachRotateHandle, addWbItem, uploadImageFile } from './whiteboard.js';

import { getRoomInspectorHtml, attachRoomInspectorEvents, renderInspector,  renderElementList, esc } from './inspector.js';



  function renderPlanner() {

      var activeMap = getActiveMap();

      if (!activeMap) return;

      

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

          html += '<div class="block-head"><span>' + b.type.toUpperCase() + '</span>';

          html += '<div class="block-tools"><button class="tool ghost mv-up" data-idx="'+idx+'">▲</button><button class="tool ghost mv-dn" data-idx="'+idx+'">▼</button><button class="tool ghost danger del-blk" data-idx="'+idx+'">✖</button></div></div>';

          

          if (b.type === 'h1') {

              html += '<input type="text" class="field b-title" value="'+esc(b.title||'')+'" placeholder="Title" data-idx="'+idx+'" style="margin-bottom:6px; width:100%;">';

              html += '<input type="text" class="field b-sub" value="'+esc(b.sub||'')+'" placeholder="Subtitle" data-idx="'+idx+'" style="width:100%;">';

          } else if (b.type === 'h2') {

              html += '<input type="text" class="field b-title" value="'+esc(b.title||'')+'" placeholder="Section Header" data-idx="'+idx+'" style="width:100%;">';

          } else if (b.type === 'oneline' || b.type === 'lede' || b.type === 'text' || b.type === 'callout' || b.type === 'flare') {

              html += '<textarea class="field b-content" placeholder="Content (HTML allowed)..." data-idx="'+idx+'" style="width:100%; height:60px;">'+esc(b.content||'')+'</textarea>';

          } else if (b.type === 'raw') {

              html += '<textarea class="field b-content" placeholder="Raw HTML..." data-idx="'+idx+'" style="width:100%; height:120px; font-family:monospace;">'+esc(b.content||'')+'</textarea>';

          } else if (b.type === 'diagram') {

              html += '<textarea class="field b-content" placeholder="Mermaid flowchart code..." data-idx="'+idx+'" style="width:100%; height:150px; font-family:monospace;">'+esc(b.content||'')+'</textarea>';

          } else if (b.type === 'node') {

              html += '<input type="text" class="field b-title" value="'+esc(b.title||'')+'" placeholder="Node Title" data-idx="'+idx+'" style="margin-bottom:6px; width:100%;">';

              html += '<input type="text" class="field b-sub" value="'+esc(b.tag||'')+'" placeholder="Tag (optional)" data-idx="'+idx+'" style="margin-bottom:6px; width:100%;">';

              html += '<input type="text" class="field b-must" value="'+esc(b.must||'')+'" placeholder="Must Resolve... (optional)" data-idx="'+idx+'" style="margin-bottom:10px; width:100%;">';

              html += '<input type="text" class="field b-cols" value="'+esc((b.cols||[]).join(', '))+'" placeholder="Column headers, comma-separated (blank = Action, Why, Cost, Returns via)" data-idx="'+idx+'" style="margin-bottom:10px; width:100%;">';



              var colNames = (Array.isArray(b.cols) && b.cols.length > 0) ? b.cols.slice(0, 4) : ['Action', 'Why', 'Cost', 'Returns via'];

              if (!b.rows) b.rows = [];

              html += '<div><strong>Rows:</strong></div>';

              b.rows.forEach(function(r, ri) {

                  html += '<div class="grouped-fields">';

                  html += '<div class="row-h">';

                  html += '<input type="text" placeholder="'+esc(colNames[0]||'—')+'" value="'+esc(r.col1||'')+'" data-idx="'+idx+'" data-ri="'+ri+'" class="r-col1">';

                  html += '<input type="text" placeholder="'+esc(colNames[1]||'—')+'" value="'+esc(r.col2||'')+'" data-idx="'+idx+'" data-ri="'+ri+'" class="r-col2">';

                  html += '<button class="tool ghost danger del-row x-btn" data-idx="'+idx+'" data-ri="'+ri+'">✖</button>';

                  html += '</div><div class="row-h">';

                  html += '<input type="text" placeholder="'+esc(colNames[2]||'—')+'" value="'+esc(r.col3||'')+'" data-idx="'+idx+'" data-ri="'+ri+'" class="r-col3">';

                  html += '<input type="text" placeholder="'+esc(colNames[3]||'—')+'" value="'+esc(r.col4||'')+'" data-idx="'+idx+'" data-ri="'+ri+'" class="r-col4">';

                  html += '<div style="width:31px; height:31px; flex:0 0 31px;"></div>'; // spacer to align inputs

                  html += '</div></div>';

              });

              html += '<button class="tool ghost add-row" data-idx="'+idx+'">+ Add Row</button>';

          } else if (b.type === 'flowchart') {

              if (!b.nodes) b.nodes = [];

              if (!b.edges) b.edges = [];

              html += '<div style="margin-bottom:5px;"><strong>Nodes:</strong></div>';

              b.nodes.forEach(function(n, ni) {

                  html += '<div class="grouped-fields">';

                  html += '<div class="row-h">';

                  html += '<input type="text" value="'+esc(n.id||'')+'" placeholder="ID (n1)" data-idx="'+idx+'" data-ni="'+ni+'" class="fc-n-id" style="flex: 0 0 60px;">';

                  html += '<input type="text" value="'+esc(n.text||'')+'" placeholder="Label" data-idx="'+idx+'" data-ni="'+ni+'" class="fc-n-text" style="flex: 1;">';

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

      Array.from(blockContainer.querySelectorAll('.b-sub')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx][activeMap.blocks[this.dataset.idx].type==='node'?'tag':'sub'] = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.b-must')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].must = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.b-cols')).forEach(el => el.addEventListener('input', function() {
          var v = this.value.split(',').map(function(s) { return s.trim(); }).filter(Boolean);
          if (v.length > 0) activeMap.blocks[this.dataset.idx].cols = v;
          else delete activeMap.blocks[this.dataset.idx].cols;
          save(false); renderPlannerPreview();
      }));

      Array.from(blockContainer.querySelectorAll('.b-content')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].content = this.value; save(false); if(activeMap.blocks[this.dataset.idx].type !== 'diagram') renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.r-col1')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].rows[this.dataset.ri].col1 = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.r-col2')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].rows[this.dataset.ri].col2 = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.r-col3')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].rows[this.dataset.ri].col3 = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.r-col4')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].rows[this.dataset.ri].col4 = this.value; save(false); renderPlannerPreview(); }));

      

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

  function applyPlannerFullscreen() {

      var ed = document.getElementById('plannerEditorWrap');

      var pw = document.getElementById('plannerPreviewWrap');

      var btn = document.getElementById('renderPlannerBtn');

      if (!ed || !pw) return;

      ed.style.display = plannerFullscreen ? 'none' : 'flex';

      pw.style.width = plannerFullscreen ? '100%' : '50%';

      if (btn) btn.innerHTML = plannerFullscreen ? '&#9998; Edit' : '&#9654; Render Preview';

  }



  // Typed text keeps its line breaks: a blank line starts a new paragraph, a single Enter a
  // line break. Content that already uses block HTML (<p>, <br>, lists, headings…) is left as is.
  function nl(content, para) {
      var c = String(content || '');
      if (!/\n/.test(c) || /<(p|br|div|ul|ol|li|h[1-6]|table|pre|blockquote)\b/i.test(c)) return c;
      c = c.replace(/\r/g, '');
      if (para) return c.split(/\n{2,}/).map(function(x) { return x.replace(/\n/g, '<br>'); }).join('</p><p>');
      return c.replace(/\n/g, '<br>');
  }
  function renderPlannerPreview() {

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

              html += '<p>' + nl(b.content, true) + '</p>';

          } else if (b.type === 'flare') {

              html += '<div class="flare">' + nl(b.content) + '</div>';

          } else if (b.type === 'callout') {

              html += '<div class="callout">' + nl(b.content) + '</div>';

          } else if (b.type === 'diagram') {

              html += '<div class="diagram"><pre class="mermaid">' + (b.content||'') + '</pre></div>';

          } else if (b.type === 'raw') {

              html += (b.content||'');

          } else if (b.type === 'node') {

              html += '<div class="node"><h3>' + (b.title||'');

              if (b.tag) html += ' <span class="tag">'+b.tag+'</span>';

              html += '</h3>';

              if (b.must) html += '<p class="must"><b>Must resolve:</b> '+b.must+'</p>';

              if (b.rows && b.rows.length > 0) {

                  var cols = (Array.isArray(b.cols) && b.cols.length > 0) ? b.cols.slice(0, 4) : ['Action', 'Why', 'Cost', 'Returns via'];

                  html += '<table><thead><tr>' + cols.map(function(c) { return '<th>' + c + '</th>'; }).join('') + '</tr></thead><tbody>';

                  b.rows.forEach(function(r) {

                      html += '<tr>' + cols.map(function(c, ci) { return '<td>' + (r['col' + (ci + 1)] || '') + '</td>'; }).join('') + '</tr>';

                  });

                  html += '</tbody></table>';

              }

              html += '</div>';

          } else if (b.type === 'flowchart') {

              var m = 'flowchart TD\n';

              m += 'classDef gold fill:#302517,stroke:#e0a54f,color:#fff\n';

              m += 'classDef blue fill:#1a272e,stroke:#4db3d3,color:#fff\n';

              m += 'classDef green fill:#1a3022,stroke:#5cb87a,color:#fff\n';

              m += 'classDef red fill:#361f1e,stroke:#d9534f,color:#fff\n';

              m += 'classDef violet fill:#281f3b,stroke:#b98cff,color:#fff\n';

              m += 'classDef neutral fill:#26262a,stroke:#c9c9d4,color:#fff\n';

              

              if (b.nodes) {

                  b.nodes.forEach(function(n) {

                      var id = n.id || ('n' + Math.random().toString(36).substr(2,5));

                      var txt = n.text || 'Node';

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

                      if (e.text) {

                          if (e.style === 'dotted') line = '-. ' + e.text + ' .->';

                          else line = '-- ' + e.text + ' -->';

                      }

                      m += e.from + ' ' + line + ' ' + e.to + '\n';

                  });

              }

              html += '<div class="diagram"><pre class="mermaid">' + m + '</pre></div>';

          }

          html += '</div>';

      });

      html += '</div>';

      

      preview.innerHTML = html;

      

      if (window.mermaid) {

          try { mermaid.run({ querySelector: '.mermaid' }); } catch(e) { }

      }

  }

  

  var _el_renderPlannerBtn = document.getElementById('renderPlannerBtn');

if(_el_renderPlannerBtn) _el_renderPlannerBtn.addEventListener('click', function() {

    plannerFullscreen = !plannerFullscreen;

    renderPlannerPreview();

    applyPlannerFullscreen();

});



  // Double-click anywhere in the rendered preview to jump the editor to that block

  var _el_plannerPreviewEl = document.getElementById('plannerPreview');

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

      activeMap.blocks.push({ id: 'b_'+uid(), type: this.value });

      this.value = '';

      save(true);

      renderPlanner();

  });



export {

    renderPlanner,

    renderPlannerPreview

};

