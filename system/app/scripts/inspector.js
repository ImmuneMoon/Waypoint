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



import { state, dom, WB_COLORS } from './state.js';

import { uid, clone, createNewCampaign, createNewMap, createNewPlanner, getActiveCampaign, getActiveMap, getMapChildren, findLandingRoom } from './models.js';

import { load, updateUndoBtn, pushHistory, undo, save, download, getBase64Image } from './io.js';

import { updateCampaignSelect, updateSidebarNav } from './sidebar.js';

import { showPrompt, showConfirm, isCampaignNameTaken, getUniqueCampaignTitle, promptForCampaignName, isItemNameTaken, getUniqueItemTitle, promptForItemName } from './dialogs.js';

import { renderPlanner, renderPlannerPreview } from './planner.js';

import { renderDataMap, clearSnaps, drawSnap, doSmartSnapping, attachDrag, attachPanning, isLinkMode, setLinkMode, removeLinkAt } from './datamap.js';

import { renderWhiteboard, attachResizeHandle, attachRotateHandle, addWbItem, uploadImageFile } from './whiteboard.js';



  function getRoomInspectorHtml(r, activeMap) {

      activeMap = activeMap || getActiveMap();

      r.characters = r.characters || [];

      var opts = '<option value="">-- No Category --</option>';

      opts += Object.keys(activeMap.cats).map(function(k){

        var c = activeMap.cats[k];

        return '<option value="'+k+'"'+(k===r.cat?' selected':'')+' style="color:'+c.color+'; font-weight:bold;">'+esc(c.label)+'</option>';

      }).join('');

      opts += '<option value="__new__" style="font-style:italic;">+ Create New Category...</option>';



      var selColor = activeMap.cats[r.cat] ? activeMap.cats[r.cat].color : '#c9c9d4';

      var selName = activeMap.cats[r.cat] ? activeMap.cats[r.cat].label : '';

      

      var catEditorHtml = '';

      if (r.cat && activeMap.cats[r.cat]) {

          catEditorHtml = '<div style="display:flex; gap:5px; align-items:center; background:rgba(0,0,0,0.2); padding:6px; border-radius:6px; margin-top:5px; border:1px solid var(--edge);">' +

                          '<input type="color" id="fCatColor" value="'+selColor+'" aria-label="Edit Category Color" style="width:24px; height:24px; padding:0; border:none; background:none; cursor:pointer;" title="Category Color">' +

                          '<input type="text" id="fCatName" class="cat-label" value="'+esc(selName)+'" aria-label="Edit Category Name" style="flex:1; padding:4px 6px;" title="Category Name">' +

                          '</div>';

      }

      

      var charHtml = r.characters.map(function(c, i) {

          var portrait = c.portrait

              ? '<img class="char-portrait" src="'+esc(c.portrait)+'" alt="">'

              : '<div class="char-portrait char-portrait-empty">?</div>';

          return '<div class="character-card">' +

                 '<div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">' + portrait +

                 '<input type="text" aria-label="Character Name" placeholder="Name" value="'+esc(c.name)+'" data-idx="'+i+'" class="char-name" style="margin-bottom:0; flex:1;"></div>' +

                 '<div class="field"><textarea aria-label="Character Info" placeholder="Info / Background..." data-idx="'+i+'" class="char-info">'+esc(c.info)+'</textarea></div>' +

                 '<div class="field"><input type="text" aria-label="Character Reference" placeholder="Reference (dossier path or URL)" value="'+esc(c.ref||'')+'" data-idx="'+i+'" class="char-ref" style="font-weight:normal; font-size:11px;"></div>' +

                 '<div class="row"><button class="tool ghost char-portrait-btn" data-idx="'+i+'">'+(c.portrait?'Change Portrait':'Set Portrait')+'</button>' +

                 (c.portrait ? '<button class="tool ghost char-portrait-clear" title="Remove Portrait" data-idx="'+i+'" style="flex:0 0 auto;">&times;</button>' : '') +

                 '<button class="tool ghost char-cast-btn" title="Save this character to the campaign cast, to drop as a token on any play map" data-idx="'+i+'">&#9733; Save to Cast</button>' +
                 '<button class="tool ghost danger del-char" aria-label="Remove Character" data-idx="'+i+'">Remove</button></div>' +

                 '</div>';

      }).join('');



      var mapOpts = '<option value="">-- None --</option>';

      var activeCampaign = getActiveCampaign();

      if(activeCampaign && activeCampaign.items) {

          // List maps in tree order, indented to show nesting

          (function walk(parentId, depth) {

              getMapChildren(activeCampaign, parentId).forEach(function(item) {

                  if (item.id !== activeMap.id) {

                      var indent = new Array(depth + 1).join('\u00A0\u00A0\u00A0');

                      mapOpts += '<option value="'+item.id+'"'+(r.targetMapId===item.id?' selected':'')+'>'+indent+esc((item.meta && item.meta.title) || 'Untitled Map')+'</option>';

                  }

                  walk(item.id, depth + 1);

              });

          })(null, 0);

      }

      var iconOpts = '<option value="">-- None --</option>';

      ['Stairs Up', 'Stairs Down', 'Door', 'Gate', 'Cave', 'Tower', 'Camp'].forEach(function(ic) {

          iconOpts += '<option value="'+ic+'"'+(r.icon===ic?' selected':'')+'>'+ic+'</option>';

      });



      return '<h2>Data Node</h2>'+

             (r.image ? '<img class="room-image-preview" src="'+esc(r.image)+'" alt="Room image">' : '')+

             '<div class="row" style="margin-bottom:13px;"><button class="tool ghost" id="fImgBtn">&#128444;&#65039; '+(r.image?'Change Image':'Set Room Image')+'</button>'+(r.image?'<button class="tool ghost danger" id="fImgClearBtn">Remove</button>':'')+'</div>'+

             '<div class="field"><label for="fName">Name</label><input id="fName" value="'+esc(r.name)+'"></div>'+

             '<div class="field"><label for="fCat">Category</label><select id="fCat" style="border-left: 4px solid '+selColor+'; color: '+selColor+'; font-weight: bold;">'+opts+'</select>'+catEditorHtml+'</div>'+

             '<div class="field"><label for="fTargetMap">Linked Map</label><select id="fTargetMap">'+mapOpts+'</select></div>'+
             landingRoomFieldHtml(r, 'fLandRoom') +

             '<div class="field"><label for="fIcon">Node Icon</label><select id="fIcon">'+iconOpts+'</select></div>'+

             '<div class="field"><label for="fNotes">Notes / Room details</label><textarea id="fNotes">'+esc(r.notes||'')+'</textarea></div>'+
             '<div class="field"><label for="fHandout" title="A player whose token comes to rest in this room is shown the handout (once), and it goes into their Journal">Handout on entry</label><select id="fHandout"><option value="">&mdash; none &mdash;</option>'+((window.wpHandoutList?window.wpHandoutList():[]).map(function(h){ return '<option value="'+esc(h.id)+'"'+(r.handoutId===h.id?' selected':'')+'>'+esc(h.title||h.id)+'</option>'; }).join(''))+'</select></div>'+

             '<div class="row"><button class="tool ghost danger" id="delBtn">Delete node</button>'+

             (state.viewMode === 'data' ? '<button class="tool ghost" id="linkFrom">Link from here</button>' : '') + '</div>'+

             '<div class="row" style="margin-top:8px;"><button class="tool ghost" id="setHomeDataBtn" style="width:100%;">⌖ Set Map Center to Node</button></div>'+

             '<div class="divider"></div>' +

             '<h2>Characters <button id="addCharBtn" class="tool ghost" style="padding:2px 6px; float:right;">+ Add</button></h2>' +

             '<div id="charList">' + charHtml + '</div>';

  }



  function attachRoomInspectorEvents(r, activeMap) {

      var _el_fName = document.getElementById('fName');

// Typing must never rebuild the panel under the cursor (that dropped focus and
// scroll, and stray keystrokes then hit the board's shortcuts): live-update the
// node card only; the full re-render waits for the field to be committed.
if(_el_fName) _el_fName.addEventListener('input',function(){ r.name=this.value; save(); if (state.viewMode === 'data') renderDataMap(); });
if(_el_fName) _el_fName.addEventListener('change',function(){ render(); });

      var _el_fCat = document.getElementById('fCat');

if(_el_fCat) _el_fCat.addEventListener('change',function(){

          var activeMap = getActiveMap();

          if (this.value === '__new__') {

              var newId = 'cat_' + uid();

              activeMap.cats[newId] = { label: 'New Category', color: '#c9c9d4' };

              r.cat = newId;

              save(); renderInspector(); renderDataMap();

              return;

          }

          r.cat=this.value;

          save(); renderInspector(); renderDataMap();

      });

      

      var fCatColor = document.getElementById('fCatColor');

      if (fCatColor) {

          fCatColor.addEventListener('input', function() {

              var activeMap = getActiveMap();

              if(r.cat && activeMap.cats[r.cat]) {

                  activeMap.cats[r.cat].color = this.value;

                  document.getElementById('fCat').style.borderLeftColor = this.value;

                  document.getElementById('fCat').style.color = this.value;

                  renderDataMap(); save();

              }

          });

      }

      

      var fCatName = document.getElementById('fCatName');

      if (fCatName) {

          fCatName.addEventListener('input', function() {

              var activeMap = getActiveMap();

              if(r.cat && activeMap.cats[r.cat]) {

                  activeMap.cats[r.cat].label = this.value;

                  save();

              }

          });

          fCatName.addEventListener('blur', function() {

              renderInspector(); // refresh the dropdown to reflect new name

          });

      }

      var _el_fNotes = document.getElementById('fNotes');

if(_el_fNotes) _el_fNotes.addEventListener('input',function(){r.notes=this.value;save();});
      var _el_fHandout = document.getElementById('fHandout');
      if(_el_fHandout) _el_fHandout.addEventListener('change',function(){ if (this.value) r.handoutId = this.value; else delete r.handoutId; save(); });

      var fTargetMap = document.getElementById('fTargetMap');

      if(fTargetMap) {

          fTargetMap.addEventListener('change', function(){ r.targetMapId = this.value || null; delete r.targetRoomId; save(); renderInspector(); });

      }

      var fLandRoom = document.getElementById('fLandRoom');
      if (fLandRoom) fLandRoom.addEventListener('change', function() { if (this.value) r.targetRoomId = this.value; else delete r.targetRoomId; save(); });

      var fIcon = document.getElementById('fIcon');

      if(fIcon) {

          fIcon.addEventListener('change', function(){r.icon=this.value||null;save();renderDataMap();});

      }

      var fImgBtn = document.getElementById('fImgBtn');

      if (fImgBtn) fImgBtn.addEventListener('click', function() {

          var inp = document.createElement('input');

          inp.type = 'file'; inp.accept = 'image/*';

          inp.addEventListener('change', function() {

              var f = this.files[0];

              if (!f) return;

              toast('Uploading image...');

              fetch('/api/upload?mapId=' + encodeURIComponent(getActiveCampaign().activeItemId) + '&filename=' + encodeURIComponent(f.name), { method: 'POST', body: f })

              .then(function(res) { return res.json(); })

              .then(function(data) {

                  if (!data.url) return;
                  r.image = data.url;
                  save(); renderInspector(); toast('Room image set.');
                  // A node picture usually IS the place: build a child map from it
                  // (image on the whiteboard, locked, at the back) and link the node
                  // to it, unless the node already leads somewhere.
                  if (!r.targetMapId) createMapFromRoomImage(r, activeMap, data.url);

              })

              .catch(function() { toast('Image upload failed.'); });

          });

          inp.click();

      });

      var fImgClearBtn = document.getElementById('fImgClearBtn');

      if (fImgClearBtn) fImgClearBtn.addEventListener('click', function() {

          r.image = null; save(); renderInspector(); toast('Room image removed.');

      });

      var _el_delBtn = document.getElementById('delBtn');

if(_el_delBtn) _el_delBtn.addEventListener('click',function(){

          activeMap.rooms = activeMap.rooms.filter(x=>x.id!==r.id);

          activeMap.links = activeMap.links.filter(l=>l[0]!==r.id&&l[1]!==r.id);

          if (state.viewMode === 'data') state.selId = null;

          else {

              var w = activeMap.whiteboard.find(x=>x.id===state.selWbId);

              if(w) delete w.nodeId;

          }

          render(); save(true); toast('Node deleted.');

      });

      if(document.getElementById('linkFrom')) {

          var _el_linkFrom = document.getElementById('linkFrom');

if(_el_linkFrom) _el_linkFrom.addEventListener('click',function(){setLinkMode(true);state.linkStart=r.id;render();toast('Link mode: now click the room to connect to.');});

      }

      var setHomeData = document.getElementById('setHomeDataBtn');

      if (setHomeData) {

          setHomeData.addEventListener('click', function() {

              activeMap.meta.homeX = r.x;

              activeMap.meta.homeY = r.y;

              save(); toast('Map spawn point updated.');

          });

      }

      

      var _el_addCharBtn = document.getElementById('addCharBtn');

if(_el_addCharBtn) _el_addCharBtn.addEventListener('click', function() {

          var newChar = { id: uid(), name: 'New Character', info: '' };
          r.characters.push(newChar);
          // Every roster entry gets a token on the board right away — a stand-in
          // circle with initials until a portrait is set — kept in sync by charRef
          spawnTokenForCharacter(r, newChar, activeMap);

          save(); render();

      });

      

      var charList = document.getElementById('charList');

      charList.querySelectorAll('.char-name').forEach(function(inp) {

          inp.addEventListener('input', function() {
              var c = r.characters[this.dataset.idx];
              c.name = this.value;
              linkedTokens(c, activeMap).forEach(function(t) { t.charName = c.name; if (!t.name || t.name === t.charName || t.name === 'New Character') t.name = c.name; });
              save(); if (state.viewMode === 'data') renderDataMap();
          });
          inp.addEventListener('change', function() { render(); });

      });

      charList.querySelectorAll('.char-info').forEach(function(inp) {

          inp.addEventListener('input', function() { r.characters[this.dataset.idx].info = this.value; save(); });

      });

      charList.querySelectorAll('.char-cast-btn').forEach(function(btn) {
          btn.addEventListener('click', function() {
              var c = r.characters[this.dataset.idx];
              if (window.wpCastSaveCharacter) window.wpCastSaveCharacter(c);
          });
      });
      charList.querySelectorAll('.del-char').forEach(function(btn) {

          btn.addEventListener('click', function() {
              var gone = r.characters.splice(this.dataset.idx, 1)[0];
              // Its stand-in token goes too — unless a player owns it or a sheet is attached
              if (gone) activeMap.whiteboard = (activeMap.whiteboard || []).filter(function(t) { return !(t.charRef === gone.id && !t.ownerId && !t.sheet); });
              save(); render();
          });

      });

      charList.querySelectorAll('.char-ref').forEach(function(inp) {

          inp.addEventListener('input', function() { r.characters[this.dataset.idx].ref = this.value || undefined; save(); });

      });

      charList.querySelectorAll('.char-portrait-btn').forEach(function(btn) {

          btn.addEventListener('click', function() {

              var c = r.characters[this.dataset.idx];

              var inp = document.createElement('input');

              inp.type = 'file'; inp.accept = 'image/*';

              inp.addEventListener('change', function() {

                  var f = this.files[0];

                  if (!f) return;

                  toast('Uploading portrait...');

                  fetch('/api/upload?mapId=' + encodeURIComponent(getActiveCampaign().activeItemId) + '&filename=' + encodeURIComponent(f.name), { method: 'POST', body: f })

                  .then(function(res) { return res.json(); })

                  .then(function(data) {

                      if (!data.url) return;
                      c.portrait = data.url;
                      // The stand-in token becomes the portrait
                      linkedTokens(c, activeMap).forEach(function(t) { if (t.type !== 'image') { t.type = 'image'; t.color = 'transparent'; } t.src = data.url; });
                      save(); render(); toast('Portrait set' + (linkedTokens(c, activeMap).length ? ' — the token now wears it.' : '.'));

                  })

                  .catch(function() { toast('Portrait upload failed.'); });

              });

              inp.click();

          });

      });

      charList.querySelectorAll('.char-portrait-clear').forEach(function(btn) {

          btn.addEventListener('click', function() {

              var cc = r.characters[this.dataset.idx];
              delete cc.portrait;
              // Back to the stand-in circle
              linkedTokens(cc, activeMap).forEach(function(t) { if (t.type === 'image') { t.type = 'circle'; delete t.src; t.color = '#4db3d3'; } });

              save(); render();

          });

      });

  }



  /* ---------- inspector ---------- */

  // Rebuilding the panel keeps the user's place: scroll offset, and the focused
  // field (by id, or class + row index) with its caret, come back after the swap.
  function renderInspector(){
    var panel = inspector;
    var scrollTop = panel ? panel.scrollTop : 0;
    var ae = document.activeElement;
    var focusKey = null, caret = null;
    if (ae && panel && panel.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'SELECT')) {
        focusKey = ae.id ? '#' + ae.id : (ae.className && ae.dataset.idx != null ? '.' + String(ae.className).split(' ')[0] + '[data-idx="' + ae.dataset.idx + '"]' : null);
        try { caret = [ae.selectionStart, ae.selectionEnd]; } catch (e) {}
    }
    renderInspectorInner();
    if (!panel) return;
    panel.scrollTop = scrollTop;
    if (focusKey) {
        var again = panel.querySelector(focusKey);
        if (again && document.activeElement !== again) {
            try { again.focus({ preventScroll: true }); if (caret && caret[0] != null && again.setSelectionRange) again.setSelectionRange(caret[0], caret[1]); } catch (e) {}
            panel.scrollTop = scrollTop;
        }
    }
  }

  function renderInspectorInner(){

    var activeMap = getActiveMap();

    if(!activeMap) return;



    if (state.viewMode === 'data') {

        // Older saves can carry a map with no cats/rooms; never let that blank the panel
        if (!activeMap.rooms) activeMap.rooms = [];
        if (!activeMap.cats || !Object.keys(activeMap.cats).length) activeMap.cats = { 'default': { label: 'Default Category', color: '#c9c9d4' } };
        if (!activeMap.meta) activeMap.meta = { title: 'Map' };

        var r = state.selId ? activeMap.rooms.find(x=>x.id===state.selId) : null;

        if(r){

          inspector.innerHTML = getRoomInspectorHtml(r, activeMap);

          attachRoomInspectorEvents(r, activeMap);



        } else {

          // Campaign-wide category library: save a map's categories once, add
          // them to any other map. Matched by label (case-insensitive).
          var campL = getActiveCampaign();
          var lib = (campL && campL.catLibrary) || {};
          var inLib = function(label) { var l = String(label || '').trim().toLowerCase(); return Object.keys(lib).some(function(id) { return String(lib[id].label || '').trim().toLowerCase() === l; }); };
          var onMap = function(label) { var l = String(label || '').trim().toLowerCase(); return Object.keys(activeMap.cats).some(function(id) { return String(activeMap.cats[id].label || '').trim().toLowerCase() === l; }); };

          var catHtml = Object.keys(activeMap.cats).map(function(k) {

              var c = activeMap.cats[k];
              var saved = inLib(c.label);

              return '<div class="cat-row" style="display:flex; gap:5px; margin-bottom:5px; align-items:center;">' +

                     '<input type="color" aria-label="Category Color" class="cat-color" data-id="'+k+'" value="'+c.color+'" style="width:24px; height:24px; padding:0; cursor:pointer; border:none; background:none;">' +

                     '<input type="text" aria-label="Category Name" class="cat-label" data-id="'+k+'" value="'+esc(c.label)+'" style="flex:1;">' +

                     '<button class="tool ghost cat-save' + (saved ? ' on' : '') + '" aria-label="Save to library" title="' + (saved ? 'Saved in the campaign library (click to update its color)' : 'Save to the campaign library so other maps can add it') + '" data-id="'+k+'" style="padding:2px 6px;' + (saved ? ' color:var(--gold);' : '') + '">' + (saved ? '&#9733;' : '&#9734;') + '</button>' +

                     '<button class="tool ghost danger cat-del" aria-label="Delete Category" data-id="'+k+'" style="padding:2px 6px;">×</button>' +

                     '</div>';

          }).join('');

          var libMissing = Object.keys(lib).filter(function(id) { return !onMap(lib[id].label); }).sort(function(a, b) { return String(lib[a].label).localeCompare(String(lib[b].label)); });
          var libHtml = '<div class="field" style="margin-top:10px;"><label title="Categories saved from any map in this campaign. Pick one to add it here with its color.">Category Library <span class="muted">(' + Object.keys(lib).length + ' saved)</span></label>' +
              (Object.keys(lib).length
                  ? '<div style="display:flex; gap:5px; align-items:center;">' +
                    '<select id="catLibPick" style="flex:1;">' + (libMissing.length ? libMissing.map(function(id) { return '<option value="' + id + '">' + esc(lib[id].label) + '</option>'; }).join('') : '<option value="">All saved categories are on this map</option>') + '</select>' +
                    '<button class="tool ghost" id="catLibAdd" title="Add the chosen category to this map"' + (libMissing.length ? '' : ' disabled') + ' style="padding:2px 8px;">Add</button>' +
                    '</div>' +
                    '<div style="display:flex; gap:5px; margin-top:5px;">' +
                    '<button class="tool ghost" id="catLibAddAll" title="Add every saved category this map is missing"' + (libMissing.length ? '' : ' disabled') + ' style="flex:1;">Add all missing (' + libMissing.length + ')</button>' +
                    '<button class="tool ghost" id="catLibSaveAll" title="Save every category on this map to the library" style="flex:1;">Save all to library</button>' +
                    '</div>' +
                    '<details style="margin-top:6px;"><summary class="muted" style="cursor:pointer;">Manage library</summary><div id="catLibList" style="margin-top:5px;">' +
                    Object.keys(lib).sort(function(a, b) { return String(lib[a].label).localeCompare(String(lib[b].label)); }).map(function(id) {
                        return '<div style="display:flex; gap:5px; align-items:center; margin-bottom:3px;"><span style="width:14px; height:14px; border-radius:3px; background:' + lib[id].color + '; display:inline-block;"></span><span style="flex:1; font-size:12px;">' + esc(lib[id].label) + '</span><button class="tool ghost danger cat-lib-del" data-id="' + id + '" title="Remove from the library (maps keep their copies)" style="padding:0 6px; font-size:10px;">×</button></div>';
                    }).join('') + '</div></details>'
                  : '<div class="muted">Nothing saved yet. Press &#9734; on a category, or <b>Save all to library</b>, and other maps can add them in one click.</div>' +
                    '<button class="tool ghost" id="catLibSaveAll" title="Save every category on this map to the library" style="width:100%; margin-top:5px;">Save all to library</button>') +
              '</div>';

          

          inspector.innerHTML=

            '<h2>'+esc(activeMap.meta.title||'Map')+' · Data Map</h2>'+

            '<div class="help">'+

              '<p><b>Click</b> a room to edit it. <b>Drag</b> to move. <b>+ Add room</b> drops a new one.</p>'+

              '<p><b>↔ Link mode:</b> click two rooms to connect or disconnect them; the red <b>×</b> on a line removes it.</p>'+

            '</div>'+

            '<div class="divider"></div>'+

            '<h2>Categories <button id="addCatBtn" class="tool ghost" style="padding:2px 6px; float:right;">+ Add</button></h2>'+

            '<div id="catList">' + catHtml + '</div>' + libHtml;

          function saveCatToLib(c) {
              if (!campL) return;
              campL.catLibrary = campL.catLibrary || {};
              var l = String(c.label || '').trim().toLowerCase();
              var existing = Object.keys(campL.catLibrary).find(function(id) { return String(campL.catLibrary[id].label || '').trim().toLowerCase() === l; });
              if (existing) campL.catLibrary[existing].color = c.color;
              else campL.catLibrary['lib_' + uid()] = { label: c.label, color: c.color };
          }
          function addLibToMap(id) {
              var e = campL && campL.catLibrary && campL.catLibrary[id];
              if (!e || onMap(e.label)) return false;
              activeMap.cats['cat_' + uid()] = { label: e.label, color: e.color };
              return true;
          }
          inspector.querySelectorAll('.cat-save').forEach(function(b) {
              b.addEventListener('click', function() {
                  var c = activeMap.cats[this.dataset.id];
                  if (!c) return;
                  saveCatToLib(c); save(); renderInspector();
                  toast('“' + c.label + '” saved to the category library.');
              });
          });
          var _catLibAdd = document.getElementById('catLibAdd');
          if (_catLibAdd) _catLibAdd.addEventListener('click', function() {
              var pick = document.getElementById('catLibPick');
              if (pick && pick.value && addLibToMap(pick.value)) { save(); renderInspector(); renderDataMap(); toast('Category added to this map.'); }
          });
          var _catLibAddAll = document.getElementById('catLibAddAll');
          if (_catLibAddAll) _catLibAddAll.addEventListener('click', function() {
              var n = 0;
              Object.keys((campL && campL.catLibrary) || {}).forEach(function(id) { if (addLibToMap(id)) n++; });
              save(); renderInspector(); renderDataMap();
              toast(n ? 'Added ' + n + ' categor' + (n === 1 ? 'y' : 'ies') + ' from the library.' : 'Nothing to add — this map already has them all.');
          });
          var _catLibSaveAll = document.getElementById('catLibSaveAll');
          if (_catLibSaveAll) _catLibSaveAll.addEventListener('click', function() {
              Object.keys(activeMap.cats).forEach(function(k) { saveCatToLib(activeMap.cats[k]); });
              save(); renderInspector();
              toast('All categories on this map are in the library.');
          });
          inspector.querySelectorAll('.cat-lib-del').forEach(function(b) {
              b.addEventListener('click', function() {
                  if (campL && campL.catLibrary) delete campL.catLibrary[this.dataset.id];
                  save(); renderInspector();
              });
          });

          var _el_addCatBtn = document.getElementById('addCatBtn');

if(_el_addCatBtn) _el_addCatBtn.addEventListener('click', function() {

              var newId = 'cat_' + uid();

              activeMap.cats[newId] = { label: 'New Category', color: '#c9c9d4' };

              save(); render();

          });

          document.querySelectorAll('.cat-color').forEach(function(inp) {

              inp.addEventListener('input', function() {

                  activeMap.cats[this.dataset.id].color = this.value; renderDataMap(); save();

              });

          });

          document.querySelectorAll('.cat-label').forEach(function(inp) {

              inp.addEventListener('input', function() {

                  activeMap.cats[this.dataset.id].label = this.value; save();

              });

              inp.addEventListener('change', render);

          });

          document.querySelectorAll('.cat-del').forEach(function(btn) {

              btn.addEventListener('click', function() {

                  var id = this.dataset.id;

                  if(Object.keys(activeMap.cats).length <= 1) return toast("Must have at least one category.");

                  var fallbackId = Object.keys(activeMap.cats).find(k => k !== id);

                  activeMap.rooms.forEach(r => { if(r.cat === id) r.cat = fallbackId; });

                  delete activeMap.cats[id];

                  save(); render();

              });

          });

        }

    } else {

        // Visual Mode Inspector
        var selectedIds = state.selWbIds || (state.selWbId ? [state.selWbId] : []);
        
        if (selectedIds.length > 1) {
            var html = '<h2>Multiple Items Selected (' + selectedIds.length + ')</h2>';
            var firstItem = activeMap.whiteboard.find(x=>x.id===selectedIds[0]);
            var isGrouped = firstItem ? firstItem.groupId : undefined;
            var allSameGroup = isGrouped && selectedIds.every(id => {
                var it = activeMap.whiteboard.find(x=>x.id===id);
                return it && it.groupId === isGrouped;
            });
            
            if (allSameGroup) html += '<button id="ungroupMultiBtn" class="tool ghost danger" style="width:100%; margin-bottom:10px;">Ungroup</button>';
            else html += '<button id="groupMultiBtn" class="tool ghost" style="width:100%; margin-bottom:10px;">Group Elements</button>';
            
            html += '<div class="field" style="margin-top:15px"><label>Layering (All Selected)</label></div>';
            html += '<button id="multiBringFrontBtn" class="tool ghost" style="width:100%; margin-bottom:5px">Bring to Front</button>';
            html += '<button id="multiBringFwdBtn" class="tool ghost" style="width:100%; margin-bottom:5px">Bring Forward</button>';
            html += '<button id="multiSendBwdBtn" class="tool ghost" style="width:100%; margin-bottom:5px">Send Backward</button>';
            html += '<button id="multiSendBackBtn" class="tool ghost" style="width:100%; margin-bottom:15px">Send to Back</button>';
            
            html += '<div class="divider"></div><button class="tool ghost danger" id="wbDelMulti" style="width:100%">Delete All Selected</button>';
            
            inspector.innerHTML = html;
            
            var _groupMultiBtn = document.getElementById('groupMultiBtn');
            if(_groupMultiBtn) _groupMultiBtn.addEventListener('click', function() {
                var gid = 'group_' + Date.now();
                selectedIds.forEach(id => { var it = activeMap.whiteboard.find(x => x.id === id); if(it) it.groupId = gid; });
                save(); render(); import('./io.js').then(m=>m.toast('Items grouped.'));
            });
            var _ungroupMultiBtn = document.getElementById('ungroupMultiBtn');
            if(_ungroupMultiBtn) _ungroupMultiBtn.addEventListener('click', function() {
                selectedIds.forEach(id => { var it = activeMap.whiteboard.find(x => x.id === id); if(it) delete it.groupId; });
                save(); render(); import('./io.js').then(m=>m.toast('Items ungrouped.'));
            });
            var _wbDelMulti = document.getElementById('wbDelMulti');
            if(_wbDelMulti) _wbDelMulti.addEventListener('click', function() {
                activeMap.whiteboard = activeMap.whiteboard.filter(x => !selectedIds.includes(x.id));
                state.selWbIds = []; state.selWbId = null; save(); render();
            });
            ['multiBringFrontBtn', 'multiBringFwdBtn', 'multiSendBwdBtn', 'multiSendBackBtn'].forEach(btnId => {
                var btn = document.getElementById(btnId);
                if (btn) btn.addEventListener('click', function() {
                    selectedIds.forEach(id => {
                        var it = activeMap.whiteboard.find(x => x.id === id);
                        if (!it) return;
                        if (btnId === 'multiBringFrontBtn') it.layer = 'front';
                        else if (btnId === 'multiBringFwdBtn') it.layer = it.layer === 'back' ? 'middle' : 'front';
                        else if (btnId === 'multiSendBwdBtn') it.layer = it.layer === 'front' ? 'middle' : 'back';
                        else if (btnId === 'multiSendBackBtn') it.layer = 'back';
                    });
                    save(); render();
                });
            });
        } else if(selectedIds.length === 1) {
            var w = activeMap.whiteboard.find(x=>x.id===selectedIds[0]);
            if(w) {
            // Every color row ends in a custom picker (a real color wheel)
            var fillCur = (w.color || '').toLowerCase();
            var colorHtml = Object.keys(WB_COLORS).map(function(k) {
                return '<div class="color-btn' + (k.toLowerCase() === fillCur ? ' on' : '') + (k === 'transparent' ? ' clear' : '') + '" style="background:'+k+'" data-c="'+k+'" title="'+WB_COLORS[k]+'"></div>';
            }).join('') + '<label class="color-btn custom" title="Custom color"><input type="color" id="wbFillCustomColor" value="' + (/^#[0-9a-f]{6}$/i.test(w.color || '') ? w.color : '#4db3d3') + '"></label>';
            // Drawings use the pen's palette (solid inks + custom), not the shape tints
            var PEN_COLORS = { '#e9e9f0': 'White', '#1a1a1a': 'Black', '#d9534f': 'Red', '#e0a54f': 'Gold', '#5cb87a': 'Green', '#4db3d3': 'Blue', '#b98cff': 'Violet' };
            var penHtml = Object.keys(PEN_COLORS).map(function(k) {
                var on = (w.color || '').toLowerCase() === k;
                return '<div class="color-btn' + (on ? ' on' : '') + '" style="background:'+k+'" data-c="'+k+'" title="'+PEN_COLORS[k]+'"></div>';
            }).join('') + '<label class="color-btn custom" title="Custom color"><input type="color" id="wbStrokeCustomColor" value="' + (/^#[0-9a-f]{6}$/i.test(w.color || '') ? w.color : '#e9e9f0') + '"></label>';
            
            var nodeOpts = '<option value="">-- None --</option>' + activeMap.rooms.map(function(room) {
                return '<option value="'+room.id+'"'+(w.nodeId===room.id?' selected':'')+'>'+esc(room.name||'(unnamed)')+'</option>';
            }).join('');
            
            var typeLabel = w.type === 'text' ? 'Text Box' : w.type === 'path' ? 'Drawing' : w.type === 'image' ? 'Image' : w.type === 'trigger' ? 'Trigger Zone' : w.type.charAt(0).toUpperCase() + w.type.slice(1);
            var html =
              '<h2>' + esc(w.name ? w.name : typeLabel) + (w.name ? ' <span class="muted" style="font-weight:normal; font-size:11px;">' + esc(typeLabel) + '</span>' : '') + '</h2>' +
              '<div class="field"><label for="wbName">Name <span class="muted">(shown in the Elements list)</span></label><input type="text" id="wbName" maxlength="60" value="' + esc(w.name || '') + '" placeholder="' + esc(w.isChar && w.charName ? w.charName : typeLabel) + '"></div>' +
              // Player visibility up top — this is the setting testers kept missing
              '<div class="field vis-field' + (w.hidden ? ' is-hidden' : '') + '">' +
                '<label style="display:flex; align-items:center; gap:8px; margin:0; text-transform:none; cursor:pointer;">' +
                  '<input type="checkbox" id="wbVisible" ' + (w.hidden ? '' : 'checked') + '> ' +
                  '<span>' + (w.hidden ? '&#128683; <b>Hidden from players</b>' : '&#128065; <b>Visible to players</b>') + '</span>' +
                '</label>' +
                '<div class="muted" style="margin-top:4px;">' + (w.hidden
                  ? 'Players at your table cannot see this. You see it dimmed. Tick the box to reveal it.'
                  : 'Everyone at your table sees this. Untick to hide it (secret doors, unrevealed enemies, GM notes).') + '</div>' +
              '</div>';
              
            if (w.groupId) {
                html += '<button id="ungroupBtn" class="tool ghost danger" style="width:100%; margin-bottom:10px;">Ungroup</button>';
            }

            if (w.type === 'trigger') {
                html += '<div class="field"><label for="wbEventMsg">Event Message</label><textarea id="wbEventMsg" placeholder="Message when character drops here...">'+esc(w.eventMessage||'')+'</textarea></div>';
            } else {
                html += '<div class="field" style="display:flex; align-items:center; gap:5px; margin-bottom:10px;"><input type="checkbox" id="wbIsChar" '+(w.isChar?'checked':'')+'> <label for="wbIsChar" style="margin:0; text-transform:none;">Is Character</label></div>';
                if(w.isChar) {
                    html += '<div class="field"><label for="wbCharName">Character Name</label><input type="text" id="wbCharName" value="'+esc(w.charName||'')+'"></div>';
                    html += '<div class="field"><label for="wbCharStats">Stats / Notes</label><textarea id="wbCharStats">'+esc(w.charStats||'')+'</textarea></div>';
                    html += '<div class="field"><label for="wbFront">Front Side <span class="muted">(the little arrow)</span></label><select id="wbFront">' +
                        [[0, 'Top'], [90, 'Right'], [180, 'Bottom'], [270, 'Left']].concat((w.front && [0, 90, 180, 270].indexOf(w.front) < 0) ? [[w.front, w.front + '\u00b0 (turned)']] : []).map(function(o) { return '<option value="' + o[0] + '"' + ((w.front || 0) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>';
                    html += '<div class="field"><label for="wbFaceMode">Turning</label><select id="wbFaceMode"><option value="art"' + (w.faceMode !== 'arrow' ? ' selected' : '') + '>Art turns with the arrow</option><option value="arrow"' + (w.faceMode === 'arrow' ? ' selected' : '') + '>Arrow only (art stays upright)</option></select></div>';
                    html += '<div class="field"><label for="wbStatus">Condition</label><select id="wbStatus"><option value=""' + (!w.status ? ' selected' : '') + '>Alive</option><option value="down"' + (w.status === 'down' ? ' selected' : '') + '>Incapacitated (red X)</option><option value="dead"' + (w.status === 'dead' ? ' selected' : '') + '>Dead (skull, darkened)</option></select></div>';
                    // Multiplayer ownership: known players from this campaign + anyone connected now
                    var playersKnown = {};
                    var campNow = getActiveCampaign();
                    if (campNow && campNow.players) Object.keys(campNow.players).forEach(function(pid) { playersKnown[pid] = campNow.players[pid].name || pid; });
                    if (window.wpNet && window.wpNet.roster) Object.values(window.wpNet.roster).forEach(function(p) { if (p && p.id) playersKnown[p.id] = p.name || p.id; });
                    var ownerOpts = '<option value="">&mdash; GM controlled &mdash;</option>' + Object.keys(playersKnown).map(function(pid) {
                        return '<option value="'+pid+'"'+(w.ownerId===pid?' selected':'')+'>'+esc(playersKnown[pid])+'</option>';
                    }).join('');
                    html += '<div class="field"><label for="wbOwner">Player Owner (can move this token)</label><select id="wbOwner">'+ownerOpts+'</select></div>';
                    // ShadowBase sheet: attach the site's character JSON and this token
                    // round-trips it — Export re-emits it with the token's art as portrait
                    var sheetLabel = w.sheet
                        ? '&#128196; ' + esc(w.sheet.name || 'sheet') + (w.sheet.points && w.sheet.points.total ? ' &middot; ' + w.sheet.points.total + ' pts' : '')
                        : 'No sheet attached &mdash; Export still makes a starter file.';
                    html += '<div class="field"><label>ShadowBase Sheet (shadow-base.com)</label>'
                        + '<div class="muted" style="margin-bottom:5px;">' + sheetLabel + '</div>'
                        + '<div style="display:flex; gap:5px;">'
                        + (w.sheet ? '<button class="tool ghost" id="wbSheetView" style="flex:1;" title="Read the attached sheet — stats, traits, skills, inventory">View</button>' : '')
                        + '<button class="tool ghost" id="wbSheetAttach" style="flex:1;" title="Attach a ShadowBase character JSON to this token">' + (w.sheet ? 'Replace' : 'Attach JSON') + '</button>'
                        + '<button class="tool ghost" id="wbSheetExport" style="flex:1;" title="Download a site-ready character JSON with this token\'s art as the portrait">Export JSON</button>'
                        + (w.sheet ? '<button class="tool ghost danger" id="wbSheetDetach" style="padding:4px 10px;" title="Detach the sheet">&times;</button>' : '')
                        + '</div></div>';
                }
            }
              
            // Direct portal: any item can lead to another map without a helper node.
            // The parent map is offered first so a nested map gets its way back in one click.
            var portalOpts = '<option value="">-- None --</option>';
            var campP = getActiveCampaign();
            var parentIdP = activeMap.meta && activeMap.meta.parentId;
            if (campP && parentIdP && campP.items[parentIdP]) {
                portalOpts += '<option value="' + parentIdP + '"' + (w.targetMapId === parentIdP ? ' selected' : '') + '>&#11014; Back to ' + esc((campP.items[parentIdP].meta || {}).title || 'parent map') + ' (parent)</option>';
            }
            if (campP && campP.items) {
                (function walkP(pid, depth) {
                    getMapChildren(campP, pid).forEach(function(it) {
                        if (it.id !== activeMap.id && it.id !== parentIdP) {
                            portalOpts += '<option value="' + it.id + '"' + (w.targetMapId === it.id ? ' selected' : '') + '>' + new Array(depth + 1).join('   ') + esc((it.meta && it.meta.title) || 'Untitled Map') + '</option>';
                        }
                        walkP(it.id, depth + 1);
                    });
                })(null, 0);
            }
            var portalIconOpts = ['Door', 'Stairs Up', 'Stairs Down', 'Gate', 'Cave', 'Tower', 'Camp'].map(function(ic) {
                return '<option value="' + ic + '"' + ((w.portalIcon || 'Door') === ic ? ' selected' : '') + '>' + ic + '</option>';
            }).join('');
            if (w.type === 'trigger') {
                var shapeOpts = [['rect', 'Square / rectangle'], ['circle', 'Circle'], ['diamond', 'Diamond'], ['hexagon', 'Hexagon (fills a hex cell)']].map(function(s) {
                    return '<option value="' + s[0] + '"' + ((w.shape || 'rect') === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
                }).join('');
                html += '<div class="field"><label for="wbTrigShape">Trigger Shape</label><select id="wbTrigShape">' + shapeOpts + '</select></div>';
            }
            if (w.type !== 'text') {
                html += '<div class="field"><label for="wbPortalMap">Portal to Map</label><select id="wbPortalMap">' + portalOpts + '</select>' +
                        (w.targetMapId ? '<div style="display:flex; gap:6px; align-items:center; margin-top:5px;"><span class="muted" style="white-space:nowrap;">Marker</span><select id="wbPortalIcon" style="flex:1;">' + portalIconOpts + '</select></div>' : '') +
                        '</div>' +
                        (w.targetMapId ? landingRoomFieldHtml({ targetMapId: w.targetMapId, targetRoomId: w.targetRoomId, id: null, name: w.name }, 'wbPortalRoom') : '');
            }
            html += '<div class="field"><label for="wbNodeLink">Link Node</label><select id="wbNodeLink">'+nodeOpts+'</select></div>'+
              (w.type !== 'image' && w.type !== 'trigger' ? '<div class="field"><label>' + (w.type === 'text' ? 'Text Color' : w.type === 'path' ? 'Pen Color' : 'Fill Color') + '</label><div class="color-row">' + ((w.type === 'path' || w.type === 'text') ? penHtml : colorHtml) + '</div></div>' : '') +
              (w.type === 'text' ? textStyleHtml(w) : '') +
              (w.type !== 'path' && w.type !== 'text' ? '<div class="field" style="display:flex; align-items:center; gap:5px; margin-bottom:10px;"><input type="checkbox" id="wbLockRatio" '+(w.lockRatio?'checked':'')+'> <label for="wbLockRatio" style="margin:0; text-transform:none;">Lock proportions when resizing</label></div>' : '') +
              (w.type === 'path' ? '<div class="field"><label for="wbStrokeWidth">Pen Size <span class="muted" id="wbStrokeWidthVal">' + (w.strokeWidth||3) + ' px</span></label><div style="display:flex; gap:8px; align-items:center;"><input type="range" id="wbStrokeWidth" min="1" max="20" value="'+(w.strokeWidth||3)+'" style="flex:1"><input type="number" id="wbStrokeWidthNum" value="'+(w.strokeWidth||3)+'" min="1" max="20" style="width:56px" aria-label="Pen size in pixels"></div></div>' : '') +
              '<div class="field"><label for="wbRot">Rotation</label><div style="display:flex; gap:8px;"><input type="range" id="wbRot" min="-180" max="180" value="'+(w.rot||0)+'" style="flex:1"><input type="number" id="wbRotNum" value="'+(w.rot||0)+'" style="width:60px" aria-label="Rotation degrees"></div></div>'+
              '<div class="field"><label for="wbLayer">Layer</label>'+
              '<select id="wbLayer">'+
              '<option value="front"'+(w.layer==='front'?' selected':'')+'>Front Layer (Above all)</option>'+
              '<option value="front-mid"'+(w.layer==='front-mid'?' selected':'')+'>Front-Mid Layer</option>'+
              '<option value="middle"'+((w.layer||'middle')==='middle'?' selected':'')+'>Middle Layer (Default)</option>'+
              '<option value="back-mid"'+(w.layer==='back-mid'?' selected':'')+'>Back-Mid Layer</option>'+
              '<option value="back"'+(w.layer==='back'?' selected':'')+'>Back Layer (Background)</option>'+
              '</select></div>'+
              '<div class="field" style="display:flex; align-items:center; gap:5px; margin-bottom:15px;"><input type="checkbox" id="wbLock" '+(w.locked?'checked':'')+'> <label for="wbLock" style="margin:0; text-transform:none;">Locked (Prevent drag & resize)</label></div>'+
              '<div class="divider"></div>'+
              '<button class="tool ghost" id="wbDup" style="width:100%; margin-bottom:5px;" title="Make a full copy of this item, settings and data included (Ctrl+D)">&#10697; Duplicate</button>'+
              '<button class="tool ghost danger" id="wbDel" style="width:100%">Delete Shape</button>'+
              '<button class="tool ghost" id="setHomeVisualBtn" style="width:100%; margin-top:5px;">⌖ Set Map Center to Shape</button>'+
              (state.gridType && state.gridType !== 'off' && w.type !== 'path' ? '<button class="tool ghost" id="wbFitGrid" style="width:100%; margin-top:5px;" title="Size to whole grid cells and seat it in the grid">&#8862; Fit to Grid Cells</button>' : '') +
              (w.type==='text' ? '<div class="muted">Tip: Double-click the text box on the canvas to edit its words. The color above sets the text color.</div>' : '');
            
            var linkedRoom = w.nodeId ? activeMap.rooms.find(x=>x.id===w.nodeId) : null;
            if(linkedRoom) {
                html += '<button class="tool ghost" id="wbGenNotesBtn" style="width:100%; margin-top:5px;">&#128221; Generate GM Notes on Board</button>';
                html += '<div class="divider"></div>' + getRoomInspectorHtml(linkedRoom);
            }
            
            inspector.innerHTML = html;
              
            inspector.querySelectorAll('.color-btn').forEach(btn => btn.addEventListener('click', function() {
                w.color = this.dataset.c; save(); render();
            }));
            var _el_wbFillCustomColor = document.getElementById('wbFillCustomColor');
            if (_el_wbFillCustomColor) {
                _el_wbFillCustomColor.addEventListener('input', function() {
                    w.color = this.value;
                    var fel = state.wbEls && state.wbEls[w.id];
                    if (fel) fel.style.background = this.value;
                });
                _el_wbFillCustomColor.addEventListener('change', function() { save(); render(); });
            }
            var _el_wbName = document.getElementById('wbName');
            if (_el_wbName) _el_wbName.addEventListener('change', function() {
                var v = this.value.trim();
                if (v) w.name = v.slice(0, 60); else delete w.name;
                save(); render();
            });
            if (w.type === 'text') wireTextStyle(w, activeMap);
            var _el_wbVisible = document.getElementById('wbVisible');
            if (_el_wbVisible) _el_wbVisible.addEventListener('change', function() {
                if (this.checked) delete w.hidden; else w.hidden = true;
                save(); render();
                import('./io.js').then(m => m.toast(w.hidden ? 'Hidden from players. You still see it dimmed; they see nothing.' : 'Now visible to players.'));
            });
            var _el_wbLockRatio = document.getElementById('wbLockRatio');
            if (_el_wbLockRatio) _el_wbLockRatio.addEventListener('change', function() {
                if (this.checked) w.lockRatio = true; else delete w.lockRatio;
                save(); render();
            });
            
            var _el_ungroupBtn = document.getElementById('ungroupBtn');
            if (_el_ungroupBtn) _el_ungroupBtn.addEventListener('click', function() {
                var gid = w.groupId;
                activeMap.whiteboard.forEach(x => { if (x.groupId === gid) delete x.groupId; });
                save(); render(); import('./io.js').then(m=>m.toast('Group removed.'));
            });
            
            var _el_wbStrokeWidth = document.getElementById('wbStrokeWidth');
            var _el_wbStrokeWidthNum = document.getElementById('wbStrokeWidthNum');
            function applyStrokeWidth(v) {
                v = Math.max(1, Math.min(20, parseInt(v, 10) || 3));
                w.strokeWidth = v;
                if (_el_wbStrokeWidth) _el_wbStrokeWidth.value = v;
                if (_el_wbStrokeWidthNum) _el_wbStrokeWidthNum.value = v;
                var lbl = document.getElementById('wbStrokeWidthVal');
                if (lbl) lbl.textContent = v + ' px';
                var pel = state.wbEls && state.wbEls[w.id] && state.wbEls[w.id].querySelector('path');
                if (pel) pel.setAttribute('stroke-width', v);
            }
            if (_el_wbStrokeWidth) {
                _el_wbStrokeWidth.addEventListener('input', function() { applyStrokeWidth(this.value); });
                _el_wbStrokeWidth.addEventListener('change', function() { save(); renderWhiteboard(); });
            }
            if (_el_wbStrokeWidthNum) _el_wbStrokeWidthNum.addEventListener('change', function() { applyStrokeWidth(this.value); save(); renderWhiteboard(); });
            var _el_wbStrokeCustomColor = document.getElementById('wbStrokeCustomColor');
            if (_el_wbStrokeCustomColor) {
                _el_wbStrokeCustomColor.addEventListener('input', function() {
                    w.color = this.value;
                    var host = state.wbEls && state.wbEls[w.id];
                    if (!host) return;
                    if (w.type === 'text') { host.style.color = this.value; return; }
                    var pel = host.querySelector('path');
                    if (pel) pel.setAttribute('stroke', this.value);
                });
                _el_wbStrokeCustomColor.addEventListener('change', function() { save(); render(); });
            }

            var _el_wbNodeLink = document.getElementById('wbNodeLink');
            if(_el_wbNodeLink) _el_wbNodeLink.addEventListener('change', function() {
                w.nodeId = this.value || null; save(); render();
            });
            var _el_wbFitGrid = document.getElementById('wbFitGrid');
            if (_el_wbFitGrid) _el_wbFitGrid.addEventListener('click', function() { if (window.wpFitToGrid) window.wpFitToGrid([w]); });
            var _el_wbPortalMap = document.getElementById('wbPortalMap');
            if (_el_wbPortalMap) _el_wbPortalMap.addEventListener('change', function() {
                if (this.value) w.targetMapId = this.value; else { delete w.targetMapId; delete w.portalIcon; }
                save(); render();
                if (w.targetMapId) import('./io.js').then(function(io) { io.toast('Portal set — double-click it (or drop a player token on it) to travel.'); });
            });
            var _el_wbPortalIcon = document.getElementById('wbPortalIcon');
            if (_el_wbPortalIcon) _el_wbPortalIcon.addEventListener('change', function() { w.portalIcon = this.value; save(); render(); });
            var _el_wbPortalRoom = document.getElementById('wbPortalRoom');
            if (_el_wbPortalRoom) _el_wbPortalRoom.addEventListener('change', function() { if (this.value) w.targetRoomId = this.value; else delete w.targetRoomId; save(); });
            var _el_wbTrigShape = document.getElementById('wbTrigShape');
            if (_el_wbTrigShape) _el_wbTrigShape.addEventListener('change', function() {
                if (this.value === 'rect') delete w.shape; else w.shape = this.value;
                if (w.shape === 'hexagon' && window.wpSeatHex) window.wpSeatHex(w, activeMap);
                save(); render();
            });
            if (w.type === 'trigger') {
                var wbEventMsg = document.getElementById('wbEventMsg');
                if(wbEventMsg) wbEventMsg.addEventListener('input', function() { w.eventMessage = this.value; save(); });
            } else {
                var wbIsChar = document.getElementById('wbIsChar');
                if(wbIsChar) wbIsChar.addEventListener('change', function() { w.isChar = this.checked; save(); renderInspector(); });
                var wbCharName = document.getElementById('wbCharName');
                if(wbCharName) wbCharName.addEventListener('input', function() { w.charName = this.value; save(); });
                var wbCharStats = document.getElementById('wbCharStats');
                if(wbCharStats) wbCharStats.addEventListener('input', function() { w.charStats = this.value; save(); });
                var wbSheetView = document.getElementById('wbSheetView');
                if (wbSheetView) wbSheetView.addEventListener('click', function() {
                    import('./shadowbase.js').then(function(m) { m.showSheet(w); });
                });
                var wbSheetAttach = document.getElementById('wbSheetAttach');
                if (wbSheetAttach) wbSheetAttach.addEventListener('click', function() {
                    var fi = document.getElementById('sheetFileIn');
                    if (!fi) return;
                    fi.onchange = function() {
                        var f = this.files[0];
                        this.value = '';
                        import('./shadowbase.js').then(function(m) {
                            m.attachSheet(w, f, function() { save(); renderInspector(); });
                        });
                    };
                    fi.click();
                });
                var wbSheetExport = document.getElementById('wbSheetExport');
                if (wbSheetExport) wbSheetExport.addEventListener('click', function() {
                    var campX = getActiveCampaign();
                    import('./shadowbase.js').then(function(m) {
                        m.exportCharacterJson(w, campX ? campX.name : '');
                    });
                });
                var wbSheetDetach = document.getElementById('wbSheetDetach');
                if (wbSheetDetach) wbSheetDetach.addEventListener('click', function() {
                    delete w.sheet;
                    save(); renderInspector();
                    import('./io.js').then(function(m) { m.toast('Sheet detached.'); });
                });
                var wbOwner = document.getElementById('wbOwner');
                if(wbOwner) wbOwner.addEventListener('change', function() {
                    if (this.value) {
                        w.ownerId = this.value;
                        // bind the player to this CHARACTER so arrival on any map auto-adopts/spawns their token
                        var campO = getActiveCampaign();
                        if (campO && w.charName) {
                            campO.players = campO.players || {};
                            campO.players[this.value] = campO.players[this.value] || { name: this.value };
                            campO.players[this.value].charName = w.charName;
                        }
                    } else delete w.ownerId;
                    save(); toast(this.value ? 'Token assigned — this player now plays ' + (w.charName || 'this character') + ' everywhere.' : 'Token set to GM control.');
                });
            }
            var _el_wbStatus = document.getElementById('wbStatus');
            if (_el_wbStatus) _el_wbStatus.addEventListener('change', function() {
                if (this.value) w.status = this.value; else delete w.status;
                save(); renderWhiteboard();
            });
            var _el_wbFaceMode = document.getElementById('wbFaceMode');
            if (_el_wbFaceMode) _el_wbFaceMode.addEventListener('change', function() {
                if (this.value === 'arrow') w.faceMode = 'arrow'; else delete w.faceMode;
                save(); toast(this.value === 'arrow' ? 'Only the arrow turns on this token.' : 'The art turns with the arrow.');
            });
            var _el_wbFront = document.getElementById('wbFront');
            if (_el_wbFront) _el_wbFront.addEventListener('change', function() {
                w.front = parseInt(this.value, 10) || 0;
                if (window.wpSnapFacing) w.rot = window.wpSnapFacing(w, w.rot || 0);   // the new front turns to the nearest cell side
                renderWhiteboard(); save();
            });
            var rRange = document.getElementById('wbRot');
            var rNum = document.getElementById('wbRotNum');
            function updateRot(v) {
                w.rot = parseInt(v) || 0;
                if (w.isChar && window.wpSnapFacing) w.rot = window.wpSnapFacing(w, w.rot);   // tokens land on a grid facing while Snap is on
                rRange.value = w.rot;
                rNum.value = w.rot;
                renderWhiteboard(); save();
            }
            if (rRange) rRange.addEventListener('input', function() { updateRot(this.value); });
            if (rNum) rNum.addEventListener('input', function() { updateRot(this.value); });
            
            var _el_wbLayer = document.getElementById('wbLayer');
            if(_el_wbLayer) _el_wbLayer.addEventListener('change', function() {
                w.layer = this.value; save(); render();
            });
            var _el_wbLock = document.getElementById('wbLock');
            if(_el_wbLock) _el_wbLock.addEventListener('change', function() {
                w.locked = this.checked; save(); render();
            });
            var _el_wbDup = document.getElementById('wbDup');
            if (_el_wbDup) _el_wbDup.addEventListener('click', function() { if (window.wpDuplicateWb) window.wpDuplicateWb([w]); });
            var _el_wbDel = document.getElementById('wbDel');
            if(_el_wbDel) _el_wbDel.addEventListener('click', function() {
                activeMap.whiteboard = activeMap.whiteboard.filter(x=>x.id!==w.id);
                state.selWbIds = []; state.selWbId = null; save(); render();
            });

            var _el_setHomeVisualBtn = document.getElementById('setHomeVisualBtn');
            if(_el_setHomeVisualBtn) _el_setHomeVisualBtn.addEventListener('click', function() {
                activeMap.meta.homeX = w.x + (w.w||100)/2;
                activeMap.meta.homeY = w.y + (w.h||100)/2;
                save(); toast('Map spawn point updated.');
            });

            var _el_wbGenNotesBtn = document.getElementById('wbGenNotesBtn');
            if(_el_wbGenNotesBtn && linkedRoom) _el_wbGenNotesBtn.addEventListener('click', function() {
                var noteHtml = '';
                if (linkedRoom.image) noteHtml += '<img src="' + esc(linkedRoom.image) + '" style="width:100%; border-radius:6px; margin-bottom:8px; display:block;">';
                noteHtml += '<b>' + esc(linkedRoom.name || 'Unnamed Room') + '</b>';
                if (linkedRoom.notes) noteHtml += '<br>' + esc(linkedRoom.notes).replace(/\n/g, '<br>');
                if (linkedRoom.characters && linkedRoom.characters.length > 0) {
                    noteHtml += '<br><br><b>Characters</b>';
                    linkedRoom.characters.forEach(function(c) {
                        var bullet = c.portrait
                            ? '<img src="' + esc(c.portrait) + '" style="width:22px; height:22px; border-radius:50%; object-fit:cover; vertical-align:middle; margin-right:5px;">'
                            : '&bull; ';
                        noteHtml += '<br>' + bullet + '<b>' + esc(c.name || 'Unnamed') + '</b>';
                        if (c.info) noteHtml += ' &mdash; ' + esc(c.info).replace(/\n/g, '<br>&nbsp;&nbsp;&nbsp;');
                    });
                }
                var lineCount = (noteHtml.match(/<br>/g) || []).length + 1;
                var noteH = Math.max(90, 50 + lineCount * 30) + (linkedRoom.image ? 170 : 0);
                var existing = activeMap.whiteboard.find(x => x.type === 'text' && x.gmNoteFor === linkedRoom.id);
                if (existing) {
                    existing.text = noteHtml;
                    existing.h = noteH;
                    toast('GM notes updated.');
                } else {
                    activeMap.whiteboard.push({
                        id: 'wb' + uid(), type: 'text',
                        x: w.x + (w.w || 100) + 30, y: w.y,
                        w: 300, h: noteH,
                        z: 30, layer: 'front', color: 'transparent',
                        text: noteHtml, gmNoteFor: linkedRoom.id
                    });
                    toast('GM notes added to board.');
                }
                save(); render();
            });

            if(linkedRoom) attachRoomInspectorEvents(linkedRoom, activeMap);
            }
        } else {

            inspector.innerHTML=

              '<h2>'+(activeMap.meta.title||'Map')+' · Play Map</h2>'+

              '<div class="help">'+

                '<p>Use the buttons above to drop <b>Shapes</b>, <b>Text</b>, or <b>Images</b> onto the board.</p>'+

                '<p><b>Drag</b> from the center to move. <b>Drag</b> the bottom-right corner to resize.</p>'+

                '<p><b>Double-click</b> text blocks to edit them directly on the canvas.</p>'+

              '</div>';

        }

    }

  }



  function renderElementList() {

      var listEl = document.getElementById('elementList');

      if(!listEl) return;

      var activeMap = getActiveMap();

      if(!activeMap) return;

      

      var html = '<h2>' + (state.viewMode==='data' ? 'Data Nodes' : 'Visual Shapes') + '</h2>';

      html += '<input type="text" id="elementSearchInput" placeholder="Filter elements..." style="width:100%; box-sizing:border-box; margin-bottom:10px; padding: 4px;" />';

      

      var items = state.viewMode === 'data' ? activeMap.rooms : activeMap.whiteboard;

      if (items.length === 0) {

          html += '<div class="muted">No elements found.</div>';

          listEl.innerHTML = html;

          return;

      }

      

      html += '<div id="elementListItems" style="display:flex; flex-direction:column; gap:5px;">';

      // Visual list mirrors the stacking order: front layer at the top of the
      // list, back layer at the bottom; within a layer, later items paint on top.
      var LAYER_ORDER = ['front', 'front-mid', 'middle', 'back-mid', 'back'];
      var LAYER_LABEL = { 'front': 'Front', 'front-mid': 'Front-Mid', 'middle': 'Middle', 'back-mid': 'Back-Mid', 'back': 'Back' };
      var visual = state.viewMode === 'visual';
      var ordered = items.map(function(it, idx) { return { it: it, idx: idx }; });
      if (visual) ordered.sort(function(a, b) {
          var la = LAYER_ORDER.indexOf(a.it.layer || 'middle'), lb = LAYER_ORDER.indexOf(b.it.layer || 'middle');
          if (la !== lb) return la - lb;
          return b.idx - a.idx;
      });
      var lastLayer = null;

      ordered.forEach(function(entry) {
          var item = entry.it;
          var name = elementName(item);
          var htmlName = esc(name);

          if (item.locked) htmlName = '🔒 ' + htmlName;
          if (visual && item.hidden) htmlName = '🚫 ' + htmlName;

          if (visual) {
              var lay = item.layer || 'middle';
              if (lay !== lastLayer) {
                  html += '<div class="el-layer-head">' + LAYER_LABEL[lay] + ' layer</div>';
                  lastLayer = lay;
              }
          }

          var sel = (state.selWbIds || []).includes(item.id) || state.selWbId === item.id || state.selId === item.id;
          html += '<div class="element-list-item' + (sel ? ' sel' : '') + '" data-id="' + item.id + '">' +
                  '<div class="el-name" data-id="'+item.id+'" title="Click to jump to it · double-click to rename">' + htmlName + '</div>' +
                  '<button class="tool ghost el-rename" aria-label="Rename" title="Rename" data-id="'+item.id+'">&#9998;</button>' +
                  (visual ? '<button class="tool ghost el-up" aria-label="Move up a layer" title="Move up a layer (toward the front)" data-id="'+item.id+'">&#9650;</button>' +
                            '<button class="tool ghost el-down" aria-label="Move down a layer" title="Move down a layer (toward the back)" data-id="'+item.id+'">&#9660;</button>' : '') +
                  '<button class="tool ghost danger el-del" aria-label="Delete Element" title="Delete Element" data-id="'+item.id+'">X</button>' +
                  '</div>';
      });

      html += '</div>';

      listEl.innerHTML = html;

      function elementName(item) {
          if (!visual) return item.name || 'Unnamed Node';
          if (item.name) return item.name;
          if (item.isChar && item.charName) return item.charName;
          if (item.type === 'text') {
              var tmp = document.createElement('div'); tmp.innerHTML = item.text || 'Text';
              var plain = tmp.textContent.trim();
              return '"' + (plain.length > 20 ? plain.substring(0, 20) + '...' : plain) + '"';
          }
          if (item.type === 'image') return 'Image';
          if (item.type === 'trigger') return item.shape === 'hexagon' ? 'Hex trigger' : 'Trigger zone';
          if (item.type === 'path') return 'Drawing';
          return item.type.charAt(0).toUpperCase() + item.type.slice(1);
      }

      // Inline rename: the name cell becomes an input; Enter/blur commits, Esc cancels.
      // Visual items get a user label (`name`); rooms rename their real name.
      function startRename(id) {
          var cell = listEl.querySelector('.el-name[data-id="' + id + '"]');
          var target = items.find(function(x) { return x.id === id; });
          if (!cell || !target) return;
          var current = visual ? (target.name || '') : (target.name || '');
          var inp = document.createElement('input');
          inp.type = 'text'; inp.value = current; inp.className = 'el-rename-in';
          inp.placeholder = visual ? elementName(target) : 'Room name';
          cell.innerHTML = ''; cell.appendChild(inp); inp.focus(); inp.select();
          var done = false;
          function commit(cancel) {
              if (done) return; done = true;
              if (!cancel) {
                  var v = inp.value.trim();
                  if (visual) { if (v) target.name = v.slice(0, 60); else delete target.name; }
                  else target.name = v;
                  save();
              }
              render();
          }
          inp.addEventListener('keydown', function(e) {
              if (e.key === 'Enter') { e.preventDefault(); commit(false); }
              else if (e.key === 'Escape') { e.preventDefault(); commit(true); }
              e.stopPropagation();
          });
          inp.addEventListener('blur', function() { commit(false); });
          ['click', 'dblclick', 'pointerdown'].forEach(function(ev) { inp.addEventListener(ev, function(e) { e.stopPropagation(); }); });
      }
      listEl.querySelectorAll('.el-rename').forEach(function(b) {
          b.addEventListener('click', function(e) { e.stopPropagation(); startRename(this.dataset.id); });
      });
      listEl.querySelectorAll('.el-name').forEach(function(el) {
          el.addEventListener('dblclick', function(e) { e.stopPropagation(); startRename(this.dataset.id); });
      });
      listEl.querySelectorAll('.el-up, .el-down').forEach(function(b) {
          b.addEventListener('click', function(e) {
              e.stopPropagation();
              var it = items.find(function(x) { return x.id === b.dataset.id; });
              if (!it) return;
              var i = LAYER_ORDER.indexOf(it.layer || 'middle');
              var ni = b.classList.contains('el-up') ? Math.max(0, i - 1) : Math.min(LAYER_ORDER.length - 1, i + 1);
              if (ni === i) return;
              it.layer = LAYER_ORDER[ni];
              save(); render();
          });
      });

      

      // search filter

      var _el_elementSearchInput = document.getElementById('elementSearchInput');

if(_el_elementSearchInput) _el_elementSearchInput.addEventListener('input', function() {

          var q = this.value.toLowerCase();

          document.querySelectorAll('.element-list-item').forEach(function(row) {

              var txt = row.querySelector('.el-name').textContent.toLowerCase();

              row.style.display = (txt.indexOf(q) !== -1 || q === '') ? 'flex' : 'none';

          });
          document.querySelectorAll('.el-layer-head').forEach(function(h) { h.style.display = q ? 'none' : ''; });

      });

      

      listEl.querySelectorAll('.el-name').forEach(function(el) {

          el.addEventListener('click', function() {

              var id = this.dataset.id;

              var target = items.find(x => x.id === id);

              if(!target) return;

              

              if(state.viewMode === 'data') state.selId = id;

              else state.selWbId = id;

              

              var wrap = state.viewMode === 'data' ? document.getElementById('canvasWrap') : document.getElementById('whiteboardWrap');

              var cx = target.x + (target.w||100)/2;

              var cy = target.y + (target.h||100)/2;

              

              wrap.scrollLeft = (cx * state.zoomLevel) - wrap.clientWidth/2;

              wrap.scrollTop = (cy * state.zoomLevel) - wrap.clientHeight/2;

              render();

          });

      });

      

      listEl.querySelectorAll('.el-del').forEach(function(el) {

          el.addEventListener('click', function(e) {

              e.stopPropagation();

              var id = this.dataset.id;

              if (state.viewMode === 'data') {

                  activeMap.rooms = activeMap.rooms.filter(x => x.id !== id);

                  activeMap.links = activeMap.links.filter(l => l[0] !== id && l[1] !== id);

                  if (state.selId === id) state.selId = null;

              } else {

                  activeMap.whiteboard = activeMap.whiteboard.filter(x => x.id !== id);

                  if (state.selWbId === id) state.selWbId = null;

              }

              save(); render();

          });

      });

  }



  function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

  /* ---------- warp landing room field ----------
     Where a portal drops you on the far map. "Automatic" follows the app's
     rule (same room id → same name → map home) and says which room that
     resolves to right now; picking a room pins it. */
  function landingRoomFieldHtml(src, selectId) {
      if (!src || !src.targetMapId) return '';
      var campLR = getActiveCampaign();
      var dest = campLR && campLR.items[src.targetMapId];
      if (!dest || dest.type !== 'map') return '';
      var rooms = (dest.rooms || []).slice().sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
      var auto = findLandingRoom({ id: src.id, name: src.name, targetRoomId: null }, dest);
      var opts = '<option value="">Automatic' + (auto ? ' — ' + esc(auto.name || auto.id) : ' — map home') + '</option>' +
          rooms.map(function(rm) { return '<option value="' + rm.id + '"' + (src.targetRoomId === rm.id ? ' selected' : '') + '>' + esc(rm.name || rm.id) + '</option>'; }).join('');
      return '<div class="field"><label for="' + selectId + '" title="Which room on the far map you arrive at. Automatic = a room with the same id or name as this one, else the map\'s home point.">Landing Room</label><select id="' + selectId + '">' + opts + '</select></div>';
  }

  /* ---------- roster characters ↔ board tokens ----------
     A character added to a node's roster gets a token immediately: a stand-in
     circle showing initials, placed on the shape linked to that room (or at the
     map's home point), seated into a hex cell when the grid is hex. `charRef`
     ties the token to the roster entry so name and portrait changes flow to it. */
  function linkedTokens(c, map) {
      return ((map && map.whiteboard) || []).filter(function(t) { return t.isChar && t.charRef === c.id; });
  }
  function spawnTokenForCharacter(r, c, map) {
      map = map || getActiveMap();
      if (!map || map.type !== 'map') return null;
      map.whiteboard = map.whiteboard || [];
      var floor = map.whiteboard.filter(function(o) { return o.nodeId === r.id && !o.isChar; }).sort(function(a, b) { return (b.w || 0) * (b.h || 0) - (a.w || 0) * (a.h || 0); })[0];
      var n = map.whiteboard.filter(function(o) { return o.isChar; }).length;
      var cx = floor ? floor.x + (floor.w || 100) / 2 : ((map.meta && map.meta.homeX) || 15000) + (n % 6) * 60;
      var cy = floor ? floor.y + (floor.h || 100) / 2 : ((map.meta && map.meta.homeY) || 15000) + Math.floor(n / 6) * 70;
      if (floor) { cx += (n % 4) * 56 - 84; cy += Math.floor(n / 4) * 64 - 32; }
      var tok = {
          id: 'wb' + uid(), type: c.portrait ? 'image' : 'circle',
          x: Math.round(cx - 30), y: Math.round(cy - 26), w: 60, h: 52,
          color: c.portrait ? 'transparent' : '#4db3d3', layer: 'middle',
          isChar: true, charName: c.name || 'New Character', charRef: c.id, name: c.name || 'New Character',
          charStats: ''
      };
      if (c.portrait) tok.src = c.portrait;
      if (window.wpSeatHex) window.wpSeatHex(tok, map);
      map.whiteboard.push(tok);
      return tok;
  }
  window.wpSpawnTokenForCharacter = spawnTokenForCharacter;   // sandbox testing hook

  /* ---------- node image → child map ----------
     The image becomes the whole scene of a new map nested under the current
     one: placed at natural size (capped to 2400px on the long side), centered
     on the canvas, locked and on the back layer so tokens sit on top. The node
     links to it, so its whiteboard item turns into a portal. */
  function createMapFromRoomImage(r, parentMap, url) {
      var im = new Image();
      im.onload = function() {
          var camp = getActiveCampaign();
          if (!camp) return;
          var nw = im.naturalWidth || 1000, nh = im.naturalHeight || 1000;
          var scale = Math.min(1, 2400 / Math.max(nw, nh));
          var w = Math.round(nw * scale), h = Math.round(nh * scale);
          var title = getUniqueItemTitle((r.name || 'Room').trim() || 'Room', null);
          var nm = createNewMap(title);
          nm.id = 'map_' + uid();
          nm.meta.parentId = parentMap.id;
          nm.meta.gridType = parentMap.meta && parentMap.meta.gridType || 'off';
          nm.cats = { 'default': { label: 'Default Category', color: '#c9c9d4' } };
          nm.whiteboard = [{
              id: 'wb' + uid(), type: 'image', src: url,
              x: 15000 - w / 2, y: 15000 - h / 2, w: w, h: h,
              color: 'transparent', layer: 'back', locked: true, name: 'Scene art'
          }];
          camp.items[nm.id] = nm;
          r.targetMapId = nm.id;
          if (!r.icon) r.icon = 'Door';
          save(); updateSidebarNav(); render();
          toast('Created map “' + title + '” from the image — this node now leads to it. Double-click to visit.');
      };
      im.onerror = function() { /* image unreadable: keep the node picture, no map */ };
      im.src = url;
  }
  window.wpCreateMapFromRoomImage = createMapFromRoomImage;   // sandbox testing hook

  /* ---------- text box styling: font, size, alignment, background ---------- */
  // Fonts every Windows install ships with (plus the app's own UI font first)
  var TEXT_FONTS = ['', 'Segoe UI', 'Arial', 'Calibri', 'Cambria', 'Georgia', 'Times New Roman', 'Book Antiqua', 'Garamond', 'Palatino Linotype', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Century Gothic', 'Franklin Gothic Medium', 'Impact', 'Comic Sans MS', 'Consolas', 'Courier New', 'Lucida Console'];
  var TEXT_BG = { 'transparent': 'None', 'var(--panel2)': 'Dark Panel', '#15151c': 'Near Black', '#1a1a1a': 'Black', '#e9e9f0': 'White', 'rgba(0,0,0,0.55)': 'Shade', 'rgba(255,255,255,0.15)': 'Frost', 'rgba(217, 83, 79, 0.3)': 'Red Tint', 'rgba(92, 184, 122, 0.3)': 'Green Tint', 'rgba(77, 179, 211, 0.3)': 'Blue Tint', 'rgba(224, 165, 79, 0.3)': 'Gold Tint', '#e0a54f': 'Gold', '#4db3d3': 'Blue', '#d9534f': 'Red' };
  function textStyleHtml(w) {
      var fontOpts = TEXT_FONTS.map(function(f) {
          return '<option value="' + esc(f) + '"' + ((w.font || '') === f ? ' selected' : '') + (f ? ' style="font-family:\'' + esc(f) + '\'"' : '') + '>' + (f || 'App default') + '</option>';
      }).join('');
      var al = w.align || 'center', va = w.valign || 'middle';
      function ab(v, glyph, title) { return '<button class="tool ghost ts-align' + (al === v ? ' active' : '') + '" data-align="' + v + '" title="' + title + '" style="flex:1; padding:3px 0;">' + glyph + '</button>'; }
      function vb(v, glyph, title) { return '<button class="tool ghost ts-valign' + (va === v ? ' active' : '') + '" data-valign="' + v + '" title="' + title + '" style="flex:1; padding:3px 0;">' + glyph + '</button>'; }
      var bgCur = (w.bg || 'transparent').toLowerCase();
      var bgHtml = Object.keys(TEXT_BG).map(function(k) {
          return '<div class="color-btn' + (k.toLowerCase() === bgCur ? ' on' : '') + (k === 'transparent' ? ' clear' : '') + '" data-bg="' + k + '" title="' + TEXT_BG[k] + '" style="background:' + k + '"></div>';
      }).join('') + '<label class="color-btn custom" title="Custom background"><input type="color" id="wbTextBgCustom" value="' + (/^#[0-9a-f]{6}$/i.test(w.bg || '') ? w.bg : '#15151c') + '"></label>';
      return '<div class="field"><label for="wbTextFont">Font</label><select id="wbTextFont" style="width:100%;">' + fontOpts + '</select></div>' +
             '<div class="field"><label for="wbTextSize">Text Size <span class="muted" id="wbTextSizeVal">' + (w.fontSize || 16) + ' px</span></label><div style="display:flex; gap:8px; align-items:center;"><input type="range" id="wbTextSize" min="8" max="96" value="' + (w.fontSize || 16) + '" style="flex:1"><input type="number" id="wbTextSizeNum" min="8" max="200" value="' + (w.fontSize || 16) + '" style="width:56px" aria-label="Text size in pixels"></div></div>' +
             '<div class="field"><label>Alignment</label><div style="display:flex; gap:4px; margin-bottom:4px;">' + ab('left', '&#8676;', 'Align left') + ab('center', '&#8596;', 'Center') + ab('right', '&#8677;', 'Align right') + ab('justify', '&#8801;', 'Justify') + '</div>' +
             '<div style="display:flex; gap:4px;">' + vb('top', '&#8679;', 'Top') + vb('middle', '&#8597;', 'Middle') + vb('bottom', '&#8681;', 'Bottom') + '</div></div>' +
             '<div class="field"><label>Box Background</label><div class="color-row">' + bgHtml + '</div></div>';
  }
  function wireTextStyle(w) {
      var el = state.wbEls && state.wbEls[w.id];
      var fontSel = document.getElementById('wbTextFont');
      if (fontSel) fontSel.addEventListener('change', function() {
          if (this.value) w.font = this.value; else delete w.font;
          save(); render();
      });
      var sizeR = document.getElementById('wbTextSize'), sizeN = document.getElementById('wbTextSizeNum'), sizeV = document.getElementById('wbTextSizeVal');
      function applySize(v) {
          v = Math.max(8, Math.min(200, parseInt(v, 10) || 16));
          w.fontSize = v;
          if (sizeR) sizeR.value = Math.min(96, v);
          if (sizeN) sizeN.value = v;
          if (sizeV) sizeV.textContent = v + ' px';
          if (el) el.style.fontSize = v + 'px';
      }
      if (sizeR) { sizeR.addEventListener('input', function() { applySize(this.value); }); sizeR.addEventListener('change', function() { save(); render(); }); }
      if (sizeN) sizeN.addEventListener('change', function() { applySize(this.value); save(); render(); });
      inspector.querySelectorAll('.ts-align').forEach(function(b) {
          b.addEventListener('click', function() { w.align = this.dataset.align; save(); render(); });
      });
      inspector.querySelectorAll('.ts-valign').forEach(function(b) {
          b.addEventListener('click', function() { w.valign = this.dataset.valign; save(); render(); });
      });
      inspector.querySelectorAll('.color-btn[data-bg]').forEach(function(b) {
          b.addEventListener('click', function() {
              if (this.dataset.bg === 'transparent') delete w.bg; else w.bg = this.dataset.bg;
              save(); render();
          });
      });
      var bgC = document.getElementById('wbTextBgCustom');
      if (bgC) {
          bgC.addEventListener('input', function() { w.bg = this.value; if (el) el.style.background = this.value; });
          bgC.addEventListener('change', function() { save(); render(); });
      }
  }



  /* ---------- state.snap logic ---------- */

  var _el_tabProps = document.getElementById('tabProps');
  if (_el_tabProps) _el_tabProps.addEventListener('click', function() {
      this.classList.add('active');
      document.getElementById('tabList').classList.remove('active');
      document.getElementById('inspector').style.display = 'block';
      document.getElementById('elementList').style.display = 'none';
  });

  var _el_tabList = document.getElementById('tabList');
  if (_el_tabList) _el_tabList.addEventListener('click', function() {
      this.classList.add('active');
      document.getElementById('tabProps').classList.remove('active');
      document.getElementById('inspector').style.display = 'none';
      document.getElementById('elementList').style.display = 'block';
      renderElementList();
  });

export {
    getRoomInspectorHtml,
    attachRoomInspectorEvents,
    renderInspector,
    renderElementList,
    esc
};
