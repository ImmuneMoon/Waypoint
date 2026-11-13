function setZoom(n, x, y) { if(window.appSetZoom) window.appSetZoom(n, x, y); }

function toast(msg) { if(window.appToast) window.appToast(msg); }
function escA(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }   // a room's icon text lands in an attribute



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



var wrap = document.getElementById('canvasWrap');

var wbWrap = document.getElementById('whiteboardWrap');

var canvas = document.getElementById('canvas');

var svg = document.getElementById('edges');

import { state, dom } from './state.js';
// [view:helpers-start]
// 1.6.2 (backlog 82b, fold 1; the owner, 2026-11-07, by prompt: "In folds, starting now"): a pointer read on a map, in board pixels. Every reading
// goes through these, so a view that turns has one place to undo its turn (window.wpView, the view module). cx, cy: the pointer on screen; r: the
// wrap's box; w: the wrap that scrolls. Unturned they give exactly what the reading always gave. A drag's step goes through wbDX / wbDY
function wbX(cx, cy, r, w) { var V = typeof window !== 'undefined' ? window.wpView : null; return V && V.turned && V.turned(w) ? V.bx(cx, cy, r, w) : (cx - r.left + w.scrollLeft) / state.zoomLevel; }
function wbY(cx, cy, r, w) { var V = typeof window !== 'undefined' ? window.wpView : null; return V && V.turned && V.turned(w) ? V.by(cx, cy, r, w) : (cy - r.top + w.scrollTop) / state.zoomLevel; }
function wbDX(dx, dy) { var V = typeof window !== 'undefined' ? window.wpView : null; return V && V.turned && V.turned() ? V.dx(dx, dy) : dx / state.zoomLevel; }
function wbDY(dx, dy) { var V = typeof window !== 'undefined' ? window.wpView : null; return V && V.turned && V.turned() ? V.dy(dx, dy) : dy / state.zoomLevel; }
// [view:helpers-end]

import { uid, clone, createNewCampaign, createNewMap, createNewPlanner, getActiveCampaign, getActiveMap, findLandingRoom } from './models.js';

import { load, updateUndoBtn, pushHistory, undo, redo, save, download, getBase64Image } from './io.js';

import { updateCampaignSelect, updateSidebarNav } from './sidebar.js';

import { showPrompt, showConfirm, isCampaignNameTaken, getUniqueCampaignTitle, promptForCampaignName, isItemNameTaken, getUniqueItemTitle, promptForItemName } from './dialogs.js';

import { renderPlanner, renderPlannerPreview } from './planner.js';

import { renderWhiteboard, attachResizeHandle, attachRotateHandle, addWbItem, uploadImageFile } from './whiteboard.js';

import { getRoomInspectorHtml, attachRoomInspectorEvents, renderInspector,  renderElementList, esc } from './inspector.js';
import * as RC from './roomcore.js';   // 1.6.2 (backlog 45): the rooms' pure half
import { cssColor, picRef } from './safecore.js';   // a category's colour from a file, checked



  function renderDataMap(){

    var activeMap = getActiveMap();

    if(!activeMap || !activeMap.rooms) return;

    

    var seen={}, placed = RC.roomsPlaced(activeMap);   // 1.6.2 (backlog 45, fold 3): the rooms with a place on the play map
    var hereAll = RC.roomsHere(activeMap), campF = getActiveCampaign(), followed = false, sheetOf = function(id) { return campF && campF.chars && Object.prototype.hasOwnProperty.call(campF.chars, id) ? campF.chars[id] : null; };   // fold 4: who stands in each room, read from the map

    activeMap.rooms.forEach(function(r){

      seen[r.id]=1;

      var el=state.els[r.id];

      if(!el){

        el=document.createElement('div');

        el.className='room'; el.dataset.id=r.id;

        el.innerHTML='<div class="rn"></div><div class="rc"></div><div class="badges"></div><div class="rlink" title="Drag to another room to link them. Let go on empty ground for a new linked room." aria-hidden="true"></div>';
        el.insertAdjacentHTML('beforeend', '<div class="rnp"><span>No place</span><button type="button" class="rnp-go" title="Drag a box on the play map where this room is">Place it</button></div>'); roomNpWire(el);   // 1.6.2 (backlog 45, fold 3): Place it; the line before it, the handle a link is dragged from (fold 1)

        canvas.appendChild(el);

        state.els[r.id]=el;

        attachDrag(el, 'data');

        el.addEventListener('dblclick', function(e) {

            e.stopPropagation();

            var am = getActiveMap();

            var rd = am.rooms.find(x=>x.id===this.dataset.id);

            if (rd && rd.targetMapId) {

                import('./sidebar.js').then(function(m) {

                    var landR = findLandingRoom(rd, getActiveCampaign().items[rd.targetMapId]);
                    if (m.navigateToMap(rd.targetMapId, landR && landR.id)) toast(landR ? 'Traveled to ' + (landR.name || 'the linked room') + '.' : 'Traveled to linked map.');

                });

            }

        });

      }

      var defaultCat = Object.keys(activeMap.cats)[0];

      var c=(activeMap.cats && Object.prototype.hasOwnProperty.call(activeMap.cats, RC.roomCatOf(r, activeMap.cats)) ? activeMap.cats[RC.roomCatOf(r, activeMap.cats)] : null)||{label:'Unknown',color:'#000'};   // 1.6.2 (backlog 45): the category by roomcore's one rule, as the chips and the list read it

      el.style.left=r.x+'px'; el.style.top=r.y+'px';

      el.style.borderLeftColor=c.color;

      el.querySelector('.rn').textContent=r.name||'(unnamed)';

      var rc=el.querySelector('.rc'); rc.textContent=c.label; rc.style.color=c.color;

      el.classList.toggle('sel', r.id===state.selId);

      el.classList.toggle('linkstart', r.id===state.linkStart);
      el.classList.toggle('no-place', !placed[r.id]);   // a room with no place on the play map: a dashed edge, and selected it offers Place it

      

      var badges = el.querySelector('.badges');

      badges.innerHTML = '';

      if (r.icon) {

          var em = {'Stairs Up':'stairs-up', 'Stairs Down':'stairs-down', 'Door':'door', 'Gate':'gate', 'Cave':'cave', 'Tower':'tower', 'Camp':'camp'}[r.icon];

          badges.innerHTML += '<div class="badge-char" style="background:var(--blue); font-size:12px; margin-right:4px;" title="'+escA(r.icon)+'">'+(em ? '<i class="wib wi-'+em+'"></i>' : escA(String(r.icon).substring(0,2)))+'</div>';

      }

      (r.characters || []).forEach(function(c) { if (c && c.sheet && sheetOf(c.sheet)) { var sn = RC.entryName(c, sheetOf); if (sn && c.name !== sn) { c.name = sn; followed = true; } } });   // the review: a sheet renamed since, followed by the entry's own name, which players are sent
      roomFacesDraw(el, RC.roomFaces(r, hereAll[r.id], sheetOf));   // 1.6.2 (backlog 45, fold 4; the owner: "A. Faces, then +N"): who is there, those here now first

    });

    Object.keys(state.els).forEach(function(id){ if(!seen[id]){ state.els[id].remove(); delete state.els[id]; } });
    if (followed && window.wpCanPersistLocal && window.wpCanPersistLocal()) save(true);   // fold 4: an entry followed its sheet's new name

    

    // edges

    while(svg.firstChild) svg.removeChild(svg.firstChild);

    document.querySelectorAll('.edge-del').forEach(function(n){n.remove();});

    svg.setAttribute('width', canvas.offsetWidth);

    svg.setAttribute('height', canvas.offsetHeight);

    activeMap.links.forEach(function(lk, i){

      var a=state.els[lk[0]], b=state.els[lk[1]];

      var rA = activeMap.rooms.find(x=>x.id===lk[0]), rB = activeMap.rooms.find(x=>x.id===lk[1]);

      if(!a||!b||!rA||!rB) return;

      var cA = {x: rA.x + a.offsetWidth/2, y: rA.y + a.offsetHeight/2};

      var cB = {x: rB.x + b.offsetWidth/2, y: rB.y + b.offsetHeight/2};

      

      // A fat invisible twin takes the clicks: click selects the link, right-click opens the quick menu
      var hit=document.createElementNS('http://www.w3.org/2000/svg','line');
      hit.setAttribute('x1',cA.x);hit.setAttribute('y1',cA.y);hit.setAttribute('x2',cB.x);hit.setAttribute('y2',cB.y);
      hit.setAttribute('class','hit'); hit.setAttribute('data-a', lk[0]); hit.setAttribute('data-b', lk[1]);
      hit.addEventListener('click', function(ev){ ev.stopPropagation(); selectLink(i); });
      hit.addEventListener('contextmenu', function(ev){ ev.preventDefault(); ev.stopPropagation(); openEdgeMenu(ev, i); });
      svg.appendChild(hit);
      var ln=document.createElementNS('http://www.w3.org/2000/svg','line');

      ln.setAttribute('x1',cA.x);ln.setAttribute('y1',cA.y);

      ln.setAttribute('x2',cB.x);ln.setAttribute('y2',cB.y);

      var lt = LINK_TYPES[lk[2]] ? (lk[2] || '') : '';
      ln.setAttribute('class', 'edge' + (lt ? ' ' + lt : '') + (state.selLink === i ? ' sel' : '')); ln.setAttribute('data-a', lk[0]); ln.setAttribute('data-b', lk[1]);   // 1.6.2 (backlog 45): which rooms it joins, for the Find strip
      if (lt === 'oneway') {   // stop at the card's edge so the arrowhead shows
          ensureArrowMarker(svg);
          var dxA = cB.x - cA.x, dyA = cB.y - cA.y, hwA = b.offsetWidth / 2 + 4, hhA = b.offsetHeight / 2 + 4;
          var tA = Math.min(dxA ? Math.abs(hwA / dxA) : Infinity, dyA ? Math.abs(hhA / dyA) : Infinity);
          if (isFinite(tA) && tA < 1) { ln.setAttribute('x2', cB.x - dxA * tA); ln.setAttribute('y2', cB.y - dyA * tA); }
          ln.setAttribute('marker-end', 'url(#edgeArrow)');
      }

      svg.appendChild(ln);

      

      var del=document.createElement('div');

      var lmeta = linkMeta(lk);
      del.className='edge-del' + (lt ? ' t-' + lt : '') + (lmeta.label ? ' labelled' : '') + (state.selLink === i ? ' sel' : '');
      del.textContent = LINK_TYPES[lt].glyph + (lmeta.label ? '\u2002' + lmeta.label : '');

      del.style.left=((cA.x+cB.x)/2)+'px'; del.style.top=((cA.y+cB.y)/2)+'px';

      del.title = LINK_TYPES[lt].label + (lmeta.notes ? ' \u2014 ' + lmeta.notes : '') + ' \u2014 click to open in Properties, right-click for the quick menu';

      del.addEventListener('pointerdown', function(ev){ ev.stopPropagation(); });
      del.addEventListener('click', function(ev){ ev.stopPropagation(); selectLink(i); });
      del.addEventListener('contextmenu', function(ev){ ev.preventDefault(); ev.stopPropagation(); openEdgeMenu(ev, i); });
      // the chip only shows while the line is hovered (a labelled or selected line keeps it)
      hit.addEventListener('pointerenter', function(){ del.classList.add('near'); });
      hit.addEventListener('pointerleave', function(){ del.classList.remove('near'); });

      del.setAttribute('data-a', lk[0]); del.setAttribute('data-b', lk[1]);
      canvas.appendChild(del);

    });
    if (typeof dataFindSync === 'function') dataFindSync();   // 1.6.2 (backlog 45): the Find strip follows every drawing of the Data Map
  }



  // --- Whiteboard specific ---



  function clearSnaps() {
      var sg = document.getElementById('snapGuides');
      if(sg) sg.innerHTML = '';
      document.querySelectorAll('.wb-item.size-match').forEach(function(el) { el.classList.remove('size-match'); });
  }

  // The floating "size matched" pill shown beside the resize corner
  function drawMatchBadge(item, wOn, hOn, wOther, hOther) {
      var sg = document.getElementById('snapGuides');
      if (!sg) return;
      var z = state.zoomLevel || 1;
      var label = function(o) { return o ? escA(o.name || o.charName || (o.type === 'image' ? 'image' : o.type)) : ''; };   // a name from a file lands in innerHTML
      // Bars along the matched edge of BOTH items, so the match reads as a pair
      var bar = function(x, y, w, h) {
          var el = document.createElement('div');
          el.className = 'match-bar';
          el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px';
          sg.appendChild(el);
      };
      var t = Math.max(3, 4 / z);
      if (wOn) {
          bar(item.x, item.y + item.h - t / 2, item.w, t);
          if (wOther) bar(wOther.x, wOther.y + wOther.h - t / 2, wOther.w, t);
      }
      if (hOn) {
          bar(item.x + item.w - t / 2, item.y, t, item.h);
          if (hOther) bar(hOther.x + hOther.w - t / 2, hOther.y, t, hOther.h);
      }
      // Glow the neighbour(s) whose size was matched
      [wOther, hOther].forEach(function(o) { var el = o && ((state.wbEls && state.wbEls[o.id]) || document.querySelector('.wb-item[data-id="' + o.id + '"]')); if (el) el.classList.add('size-match'); });
      // The badge: one line per matched axis, naming the neighbour
      var b = document.createElement('div');
      b.className = 'match-badge';
      var lines = [];
      if (wOn) lines.push('<span class="mb-axis">&#8596; WIDTH</span> ' + Math.round(item.w) + (wOther ? ' <span class="mb-of">= ' + label(wOther) + '</span>' : ''));
      if (hOn) lines.push('<span class="mb-axis">&#8597; HEIGHT</span> ' + Math.round(item.h) + (hOther ? ' <span class="mb-of">= ' + label(hOther) + '</span>' : ''));
      b.innerHTML = lines.join('<br>');
      b.style.left = (item.x + item.w + 16 / z) + 'px';
      b.style.top = (item.y + item.h + 16 / z) + 'px';
      b.style.transform = 'scale(' + (1 / z) + ')';
      b.style.transformOrigin = 'top left';
      sg.appendChild(b);
  }

  function drawSnap(type, v, v2, label, labelX, labelY) {

      var sg = document.getElementById('snapGuides');

      if(!sg) return;

      var d = document.createElement('div');

      d.className = 'snap-line ' + type;   // (was 'state.snap-line' — a stray find/replace left every guide line unstyled)

      if (type === 'v') { d.style.left = v + 'px'; d.style.top = Math.min(v2[0], v2[1]) + 'px'; d.style.height = Math.abs(v2[0]-v2[1]) + 'px'; }

      if (type === 'h') { d.style.top = v + 'px'; d.style.left = Math.min(v2[0], v2[1]) + 'px'; d.style.width = Math.abs(v2[0]-v2[1]) + 'px'; }

      sg.appendChild(d);

      

      if(label) {

          var L = document.createElement('div');

          L.className = 'snap-label';   // (same stray find/replace as the guide lines)

          L.textContent = label;

          L.style.left = labelX + 'px'; L.style.top = labelY + 'px';

          sg.appendChild(L);

      }

  }




  /* ---- link (edge) types ----
     A link is [roomA, roomB] or [roomA, roomB, type]. The type picked in the Link menu applies
     to new links; the chip on each line changes or removes that one link. */
  var LINK_TYPES = {
      '':     { label: 'Path',    glyph: '\u2014',  hint: 'a plain connection' },
      route:  { label: 'Route',   glyph: '- -',     hint: 'dashed: travel between places' },
      secret: { label: 'Secret',  glyph: '\u00b7\u00b7\u00b7', hint: 'dotted: a hidden way' },
      oneway: { label: 'One-way', glyph: '\u2192',  hint: 'an arrow from the first room to the second' }
  };
  state.linkType = '';
  try { var _lt0 = localStorage.getItem('wp_linkType'); if (_lt0 && Object.prototype.hasOwnProperty.call(LINK_TYPES, _lt0)) state.linkType = _lt0; } catch (e) {}
  function ensureArrowMarker(svg) {
      if (svg.querySelector('#edgeArrow')) return;
      svg.insertAdjacentHTML('afterbegin', '<defs><marker id="edgeArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" class="edge-arrow"></path></marker></defs>');
  }
  function linkMeta(lk) { return (lk && lk[3] && typeof lk[3] === 'object') ? lk[3] : {}; }
  // Select a line: the Properties panel shows its type, label, notes and endpoints
  function selectLink(i) {
      state.selLink = i; state.selId = null; state.linkStart = null;
      render();
      if (window.wpSyncRightPanel) window.wpSyncRightPanel();
  }
  window.wpLinkTypes = LINK_TYPES;
  window.wpSelectLink = selectLink;
  // [lookcheck:linktype-start]
  // The Link menu lists the four line types by name, a row each. The row of the type new links take is `on`
  function syncLinkMenu() {
      document.querySelectorAll('#linkTypeRow [data-type]').forEach(function(b) { b.classList.toggle('on', (b.dataset.type || '') === (state.linkType || '')); });
  }
  function setLinkType(t) {
      state.linkType = Object.prototype.hasOwnProperty.call(LINK_TYPES, t) ? t : '';
      try { localStorage.setItem('wp_linkType', state.linkType); } catch (e) {}
      syncLinkMenu();
  }
  // [lookcheck:linktype-end]
  // The chip on a line: change its type, or remove it
  function openEdgeMenu(ev, i) {
      var menu = document.getElementById('edgeMenu'), am = getActiveMap();
      if (!menu || !am || !am.links[i]) return;
      var cur = LINK_TYPES[am.links[i][2]] ? (am.links[i][2] || '') : '';
      var item = 'padding:8px 16px; cursor:pointer;';
      menu.innerHTML = '<div class="menu-item" style="color:var(--dim); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; cursor:default; padding:6px 16px 2px;">Line type</div>'
          + Object.keys(LINK_TYPES).map(function(t) { return '<div class="menu-item edge-type" data-type="' + t + '" style="' + item + (t === cur ? ' color:var(--gold);' : '') + '" title="' + LINK_TYPES[t].hint + '">' + (t === cur ? '\u2713 ' : '') + LINK_TYPES[t].glyph + '\u2002' + LINK_TYPES[t].label + '</div>'; }).join('')
          + '<div class="menu-divider" style="height:1px; background:var(--border); margin:4px 0;"></div>'
          + '<div class="menu-item danger edge-remove" style="' + item + ' color:var(--red);">Remove link</div>';
      menu.style.display = 'block';
      window.wpClampMenu(menu, ev.clientX, ev.clientY);
      menu.querySelectorAll('.edge-type').forEach(function(x) {
          x.addEventListener('click', function(ce) {
              ce.stopPropagation(); menu.style.display = 'none';
              var lk = am.links[i]; if (!lk) return;
              var t = this.dataset.type || '';
              if (t) lk[2] = t; else lk.length = 2;
              save(); render(); toast('Link: ' + LINK_TYPES[t].label + '.');
          });
      });
      var rm = menu.querySelector('.edge-remove');
      if (rm) rm.addEventListener('click', function(ce) { ce.stopPropagation(); menu.style.display = 'none'; removeLinkAt(i); });
  }
  document.addEventListener('click', function(e) {
      var menu = document.getElementById('edgeMenu');
      if (menu && menu.style.display !== 'none' && !e.target.closest('#edgeMenu')) menu.style.display = 'none';
  });
  document.querySelectorAll('#linkTypeRow [data-type]').forEach(function(b) { b.addEventListener('click', function(e) { e.stopPropagation(); setLinkType(this.dataset.type || ''); }); });
  var _el_linkDoneBtn = document.getElementById('linkDoneBtn');
  if (_el_linkDoneBtn) _el_linkDoneBtn.addEventListener('click', function(e) { e.stopPropagation(); setDataTool('dataMoveBtn'); render(); });
  var _el_linkMenu0 = document.getElementById('linkMenu');
  if (_el_linkMenu0) ['pointerdown', 'click'].forEach(function(ev) { _el_linkMenu0.addEventListener(ev, function(e) { e.stopPropagation(); }); });
  document.addEventListener('click', function(e) {
      var lm = document.getElementById('linkMenu');
      if (lm && lm.classList.contains('show') && !e.target.closest('#linkMenu') && !e.target.closest('#linkBtn')) lm.classList.remove('show');
  });
  syncLinkMenu();

  function snapToHex(x, y, s, mode, grid) {
      var LG = grid && grid.type === 'hex' ? grid : (typeof latticeOf === 'function' ? latticeOf() : null);   // 1.6.2 (backlog 38): the lattice of the map asked for, else of the map on screen
      if (LG && LG.type === 'hex') s = LG.s;
      // FLAT-TOP hexes (a flat side faces up), size s = 30: a cell is 2s = 60 wide
      // and sqrt(3)*s = 51.96 tall. The drawn tile uses a whole 52 px row pitch:
      // Chrome tiles repeated backgrounds at whole pixels, so a fractional tile
      // drifts ~0.04px per row and tokens would sit visibly off-cell mid-canvas.
      // Columns are 1.5s = 45 apart; each column is shifted half a row from the
      // last. Cell centres: x = 45q + 15, y = 52(r + q/2).
      var h = LG && LG.type === 'hex' ? LG.h : 52;
      var offsetX = s / 2 + (LG && LG.type === 'hex' ? LG.ox || 0 : 0);
      var offsetY = LG && LG.type === 'hex' ? LG.oy || 0 : 0;
      var tx = x - offsetX;
      var ty = y - offsetY;
      var q = tx / (1.5 * s);
      var r = ty / h - q / 2;
      var rx = Math.round(q);
      var ry = Math.round(r);
      var rz = Math.round(-q-r);
      var xDiff = Math.abs(rx - q);
      var yDiff = Math.abs(ry - r);
      var zDiff = Math.abs(rz - (-q-r));
      if (xDiff > yDiff && xDiff > zDiff) { rx = -ry - rz; }
      else if (yDiff > zDiff) { ry = -rx - rz; }
      var cx = 1.5 * s * rx + offsetX;
      var cy = h * (ry + rx/2) + offsetY;
      if (mode === 'center') { return {x: cx, y: cy}; }
      else {
          // Exact tile-space vertices of this cell (flat-top: corners at left and right)
          var verts = [[cx - s, cy], [cx - s/2, cy - h/2], [cx + s/2, cy - h/2], [cx + s, cy], [cx + s/2, cy + h/2], [cx - s/2, cy + h/2]];
          var bestDist = Infinity, bx = x, by = y;
          for (var i = 0; i < 6; i++) {
              var d = (x - verts[i][0]) * (x - verts[i][0]) + (y - verts[i][1]) * (y - verts[i][1]);
              if (d < bestDist) { bestDist = d; bx = verts[i][0]; by = verts[i][1]; }
          }
          return {x: bx, y: by};
      }
  }
  // The room a character token came into when it was dropped inside a piece linked to a room, so a caller can say so. It changes nothing:
  // since 1.6.2 (backlog 45, fold 4) a room's typed list stays as the GM wrote it, and who stands there is read from the map.
  window.wpAutoRoom = function(item, map, from) {   // from: { x, y }, where the drag began, where the caller knows it
      if (!item || !item.isChar || !item.charName) return null;
      // Hidden tokens are lurking NPCs staged for a reveal: never let a drag
      // surface them in a room's (player-visible) character list. Revealing the
      // token and dropping it again is the deliberate way in.
      if (item.hidden) return null;
      map = map || getActiveMap();
      if (!map || !map.rooms || !map.whiteboard) return null;
      var cx = item.x + (item.w || 100) / 2, cy = item.y + (item.h || 100) / 2;
      var best = null, bestArea = Infinity;
      map.whiteboard.forEach(function(o) {
          if (o.id === item.id || !o.nodeId) return;
          var ow = o.w || 100, oh = o.h || 100;
          if (cx < o.x || cx > o.x + ow || cy < o.y || cy > o.y + oh) return;
          if (ow * oh < bestArea) { bestArea = ow * oh; best = o; }
      });
      if (!best) { _tokRoom[item.id] = null; return null; }
      var room = map.rooms.find(function(r) { return r.id === best.nodeId; });
      if (!room) { _tokRoom[item.id] = null; return null; }
      // 1.6.2 (backlog 45, fold 4; the owner: "A. Here now, then Expected"): the typed list is the GM's own, Expected here, and stays as written; who
      // stands in a room is read from the map (roomcore roomsHere). A drop says the room a token came into, once, from this machine's memory
      var wasRoom = _tokRoom[item.id]; _tokRoom[item.id] = room.id;
      if (from && isFinite(from.x) && isFinite(from.y)) {   // the review: judged where the drag began, so the first drop after a load says nothing for a move inside the same room
          var fx = from.x + (item.w || 100) / 2, fy = from.y + (item.h || 100) / 2, fb = null, fa = Infinity;
          map.whiteboard.forEach(function(o) { if (o.id === item.id || !o.nodeId) return; var ow = o.w || 100, oh = o.h || 100; if (fx < o.x || fx > o.x + ow || fy < o.y || fy > o.y + oh) return; if (ow * oh < fa) { fa = ow * oh; fb = o; } });
          wasRoom = fb ? fb.nodeId : null;
      }
      return wasRoom === room.id ? null : room;
  };
  var _tokRoom = Object.create(null);   // the room each token was last seen in, this machine's memory alone

  // Seat a character token / hex-shaped item into the nearest hex cell by its
  // center, on any map whose grid is hex. Used everywhere a token can land —
  // drag release (every member of a multi-drag), arrow nudges, paste, player
  // drops arriving over the network, spawned player tokens — so nothing ends
  // up straddling a cell boundary. Returns true when the position changed.
  window.wpSeatHex = function(item, map, force) {
      if (!item) return false;
      map = map || getActiveMap();
      var g = map && map.meta && map.meta.gridType;
      if (!g && map === getActiveMap()) g = state.gridType;
      if (g !== 'hex') return false;
      if (!force && !(item.isChar || item.waiting || item.type === 'hexagon' || item.shape === 'hexagon')) return false;
      var w = item.w || 0, h = item.h || 0;
      var hc = snapToHex(item.x + w / 2, item.y + h / 2, 30, 'center', (typeof latticeOf === 'function' ? latticeOf(map) : null));
      var nx = hc.x - w / 2, ny = hc.y - h / 2;
      if (Math.abs(nx - item.x) < 0.01 && Math.abs(ny - item.y) < 0.01) return false;
      item.x = nx; item.y = ny;
      return true;
  };
  // Grid-shaped tokens (2026-09-27): seat a token the app places in its cell on either grid — hex through wpSeatHex, a square grid by centring
  // it in its 50 px cell (a 50x50 token lands on the lattice). Returns true when the position changed
  window.wpSeatCell = function(item, map) {
      if (!item) return false;
      map = map || getActiveMap();
      var g = map && map.meta && map.meta.gridType;
      if (!g && map === getActiveMap()) g = state.gridType;
      if (g === 'hex') return window.wpSeatHex(item, map);
      if (g !== 'square' || !(item.isChar || item.waiting)) return false;
      var G = (typeof latticeOf === 'function' ? latticeOf(map) : null) || { type: 'square', size: 50 }, w = item.w || 0, h = item.h || 0, one = Math.max(w, h) <= G.size * 1.28;   // one cell: centred in it; sized up: its corner on the lattice, as a drag release and Fit to grid put it
      var nx = one ? (Math.floor((item.x + w / 2 - (G.ox || 0)) / G.size) * G.size + G.size / 2 + (G.ox || 0) - w / 2) : (Math.round((item.x - (G.ox || 0)) / G.size) * G.size + (G.ox || 0)), ny = one ? (Math.floor((item.y + h / 2 - (G.oy || 0)) / G.size) * G.size + G.size / 2 + (G.oy || 0) - h / 2) : (Math.round((item.y - (G.oy || 0)) / G.size) * G.size + (G.oy || 0));
      if (Math.abs(nx - item.x) < 0.01 && Math.abs(ny - item.y) < 0.01) return false;
      item.x = nx; item.y = ny;
      return true;
  };
  // [systemcheck:snaprule-start]
  // 1.6.2 (backlog 38, a map's own cell size): the lattice a map's pieces seat on, fogcore gridFor with the map's own cell (map.meta.cell);
  // today's (a 50 px square, a hex of s 30 and 52 px rows, from the board's 0,0) where it sets none. Null for a map with no grid
  function latticeOf(map) {
      map = map || getActiveMap();
      var g = map && map.meta && map.meta.gridType;
      if (!g && map === getActiveMap()) g = state.gridType;
      if (g !== 'square' && g !== 'hex') return null;
      var FC = window.wpFogCore, G = FC && typeof FC.gridFor === 'function' ? FC.gridFor(g, null, map && map.meta ? map.meta.cell : null) : null;
      return G || (g === 'hex' ? { type: 'hex', s: 30, h: 52 } : { type: 'square', size: 50 });
  }
  window.wpLatticeOf = latticeOf;
  // The snap rule (the owner, 2026-09-29): Snap decides where a token dropped by hand lands, on every grid — on, in a cell (on hex centred in
  // it, on a square grid on the lattice, with no grid on a dot of the background); off, exactly where it was dropped. A player's drop follows
  // the GM's Snap (net.js sends it to the table: net.tableSnapOn); Snap to other items only is no grid seat. A token fitted to the grid
  // (gridFit) stays fitted, Snap or not; the app's own placements (a waiting token, a portal, a paste) seat as before
  window.wpSnapOn = function() {
      var N = window.wpNet; if (N && N.active && N.role === 'client') return N.tableSnapOn === true;
      return !!state.snap && state.snapMode !== 'items';
  };
  // a map with no grid: a one-cell token's centre onto the nearest dot of the background (every 50 px, at 25), a sized-up one's corner on the lattice
  window.wpSeatDot = function(item) {
      if (!item) return false;
      var w = item.w || 0, h = item.h || 0, one = Math.max(w, h) <= 64;
      var nx = one ? Math.floor((item.x + w / 2) / 50) * 50 + 25 - w / 2 : Math.round(item.x / 50) * 50, ny = one ? Math.floor((item.y + h / 2) / 50) * 50 + 25 - h / 2 : Math.round(item.y / 50) * 50;
      if (Math.abs(nx - item.x) < 0.01 && Math.abs(ny - item.y) < 0.01) return false;
      item.x = nx; item.y = ny;
      return true;
  };
  // a token's drop by hand, as Snap decides (the host seats a player's drop with it: its own Snap is the table's). force: a grid-fitted token
  window.wpSeatDrop = function(item, map, force) {
      if (!item || !(item.isChar || item.waiting || force)) return false;
      if (!force && !window.wpSnapOn()) return false;
      map = map || getActiveMap();
      var g = map && map.meta && map.meta.gridType;
      if (!g && map === getActiveMap()) g = state.gridType;
      if (g === 'hex') return window.wpSeatHex(item, map, force);
      if (g === 'square') {
          var GS = (typeof latticeOf === 'function' ? latticeOf(map) : null) || { type: 'square', size: 50 }, nx = (Math.round((item.x - (GS.ox || 0)) / GS.size) * GS.size + (GS.ox || 0)), ny = (Math.round((item.y - (GS.oy || 0)) / GS.size) * GS.size + (GS.oy || 0));   // the lattice, as a drag release puts it
          if (Math.abs(nx - item.x) < 0.01 && Math.abs(ny - item.y) < 0.01) return false;
          item.x = nx; item.y = ny; return true;
      }
      return !force && window.wpSeatDot(item);
  };
  // A picture or a plain shape the size of ONE hex cell seats in its cell by its centre, as a token does (the owner, 2026-10-03: "images when
  // resized to the correct hex size or square size sit slightly off of center in the x axis if theyre not tokens"). Its drop used to put its
  // CORNER on a hex vertex, and a cell's box has no vertex at its corner: the nearest is 15 px along. About one cell: 39 to 64 px each way
  // (three quarters of a cell's height, up to the app's own bound for one cell). A bar or a railing, thinner, and anything larger keep
  // their corner on a vertex, where walls and floors line up; a text, a pen line, a trigger and a light are no pieces of this kind
  window.wpHexCellSized = function(it, map) {
      if (!it || ['image', 'rect', 'circle', 'diamond'].indexOf(it.type) < 0) return false;
      var LH = (typeof latticeOf === 'function' ? latticeOf(map) : null), k = LH && LH.type === 'hex' ? LH.h / 52 : 1;   // a map's own hex cell: the same bounds at its scale
      return typeof it.w === 'number' && typeof it.h === 'number' && it.w >= 39 * k && it.w <= 64 * k && it.h >= 39 * k && it.h <= 64 * k;
  };
  // …and when a piece is RESIZED to that size (it pauses at a token's beside it): it seats in its cell at once. true when it moved
  window.wpSeatSized = function(item, map) {
      map = map || getActiveMap();
      var g = map && map.meta && map.meta.gridType;
      if (!g && map === getActiveMap()) g = state.gridType;
      if (g !== 'hex' || !window.wpSnapOn() || !window.wpHexCellSized(item, map)) return false;
      return window.wpSeatHex(item, map, true);
  };
  // [systemcheck:snaprule-end]

  // The map builder (fold B1c): a Wall line is drawn with the pen under the Build tool's preset (window.wpPenPreset). Its points always ride
  // the lattice, a hex grid's corners or a square grid's crossings, whatever Snap says, so the stroke walks cell edges exactly as the snapped
  // pen does (the thin wall of item 18). With no grid, as Snap says
  function snapLattice(x, y) {
      if (state.gridType === 'hex') { var ph = snapToHex(x, y, 30, 'vertex'); return { x: ph.x, y: ph.y }; }
      if (state.gridType === 'square') { var GL = (typeof latticeOf === 'function' ? latticeOf() : null) || { type: 'square', size: 50 }; return { x: (Math.round((x - (GL.ox || 0)) / GL.size) * GL.size + (GL.ox || 0)), y: (Math.round((y - (GL.oy || 0)) / GL.size) * GL.size + (GL.oy || 0)) }; }
      return getSnapCoords(x, y);
  }
  function penSnap(x, y) { return window.wpPenPreset ? snapLattice(x, y) : getSnapCoords(x, y); }
  function penSnapOn() { return !!(state.snap || window.wpPenPreset); }
  // [buildcheck:texseat-start]
  // The map builder (fold B1): a textured piece's tile stays seated on the board's lattice while the piece moves. A box shape's background
  // position, or a filled region's svg pattern (its x and y in tile units: the next full redraw builds it again from the item). Nothing for
  // anything else
  function texSeatEl(el, x, y) {
      var BC = window.wpBuildCore; if (!BC || !el || !el.dataset) return;
      if (el.dataset.pic) { if (typeof BC.picPos === 'function') el.style.backgroundPosition = BC.picPos(x, y, el.dataset.pic); return; }   // fold B3: a picture's own repeat ('whole' sits at the piece's corner)
      if (el.dataset.tex) { el.style.backgroundPosition = BC.texPos(x, y, el.dataset.tex); return; }
      var svg = el.dataset.type === 'path' ? el.querySelector(':scope > svg') : null, pat = svg && svg.dataset.texId ? svg.querySelector(':scope > defs > pattern') : null;
      if (!pat || pat.getAttribute('data-whole')) return;   // a picture stretched over the whole region moves with it
      var w = Number(pat.getAttribute('width')) || 50, h = Number(pat.getAttribute('height')) || 50, fx = isFinite(x) ? x : 0, fy = isFinite(y) ? y : 0;
      pat.setAttribute('x', String(-(((fx % w) + w) % w))); pat.setAttribute('y', String(-(((fy % h) + h) % h)));
      svg.dataset.texKey = '';   // the next full redraw builds the pattern again from the item, whatever it was built for before
  }
  window.wpTexSeat = texSeatEl;   // a move from the table moves a piece with no redraw too (net.js applyPosToDom)
  // [buildcheck:texseat-end]
  function getSnapCoords(x, y) {
      if (typeof state !== 'undefined' && state.snap) {
          if (state.gridType === 'hex') {
              var p = snapToHex(x, y, 30, 'vertex');
              return {x: p.x, y: p.y};
          } else {
              var GQ = (typeof latticeOf === 'function' ? latticeOf() : null); return GQ && GQ.type === 'square' ? { x: (Math.round((x - (GQ.ox || 0)) / GQ.size) * GQ.size + (GQ.ox || 0)), y: (Math.round((y - (GQ.oy || 0)) / GQ.size) * GQ.size + (GQ.oy || 0)) } : {x: Math.round(x/50)*50, y: Math.round(y/50)*50};
          }
      }
      return {x: x, y: y};
  }

  function doSmartSnapping(item, isResize) {

      clearSnaps();

      if(state.viewMode !== 'visual') return;

      // Position snapping honours the Snap toggle; size matching while resizing
      // is always on (it's a soft pause you can push through, never a constraint).
      // …and the snap MODE: item magnetism is off in 'grid' mode
      if(!isResize && (!state.snap || state.snapMode === 'grid')) return;

      var activeMap = getActiveMap();

      if(!activeMap) return;

      

      var threshold = 20;

      var snappedX = false, snappedY = false, snappedW = false, snappedH = false;

      var adjX = null, adjY = null;   // the neighbor an edge glued to, for the alignment assist

      

      activeMap.whiteboard.forEach(function(other) {

          if (other.id === item.id) return;

          

          if (isResize) {

              // Size matching (Microsoft-Whiteboard style): while resizing, the
              // item pauses at another nearby item's width/height. Hysteresis
              // makes the pause sticky — engaging takes 20px, escaping takes 34.
              var RR = 600;
              var nearR = !(item.x + item.w + RR < other.x || other.x + other.w + RR < item.x ||
                            item.y + item.h + RR < other.y || other.y + other.h + RR < item.y);
              if (!nearR) return;

              var rm = doSmartSnapping.resizeMatch || (doSmartSnapping.resizeMatch = { w: null, h: null });
              var tW = (rm.w === other.id) ? threshold * 1.7 : threshold;
              var tH = (rm.h === other.id) ? threshold * 1.7 : threshold;

              if (!snappedW && Math.abs(item.w - other.w) < tW) {

                  item.w = other.w; snappedW = true; rm.w = other.id;

                  drawSnap('v', item.x + item.w, [item.y, other.y]);

              }

              if (!snappedH && Math.abs(item.h - other.h) < tH) {

                  item.h = other.h; snappedH = true; rm.h = other.id;

                  drawSnap('h', item.y + item.h, [item.x, other.x]);

              }

          } else {

              // Position snapping — only against NEARBY items, so a matching
              // edge on the far side of the board can't grab the drag.
              var R = 300;
              var near = !(item.x + item.w + R < other.x || other.x + other.w + R < item.x ||
                           item.y + item.h + R < other.y || other.y + other.h + R < item.y);
              if (!near) return;

              // X — adjacency first (flush sides make rows), then edge alignment, then centers
              if (!snappedX && Math.abs(item.x - (other.x + other.w)) < threshold) {
                  item.x = other.x + other.w; snappedX = true; adjX = other;         // my left against their right
                  drawSnap('v', item.x, [item.y, other.y]);
              }
              if (!snappedX && Math.abs((item.x + item.w) - other.x) < threshold) {
                  item.x = other.x - item.w; snappedX = true; adjX = other;         // my right against their left
                  drawSnap('v', item.x + item.w, [item.y, other.y]);
              }
              if (!snappedX && Math.abs(item.x - other.x) < threshold) {
                  item.x = other.x; snappedX = true;                                // left edges aligned
                  drawSnap('v', item.x, [item.y, other.y]);
              }
              if (!snappedX && Math.abs((item.x + item.w) - (other.x + other.w)) < threshold) {
                  item.x = other.x + other.w - item.w; snappedX = true;             // right edges aligned
                  drawSnap('v', item.x + item.w, [item.y, other.y]);
              }
              if (!snappedX && Math.abs((item.x + item.w/2) - (other.x + other.w/2)) < threshold) {
                  item.x = other.x + other.w/2 - item.w/2; snappedX = true;         // centers aligned
                  drawSnap('v', item.x + item.w/2, [item.y, other.y]);
              }

              // Y — adjacency first (flush stacking makes columns), then edges, then centers
              if (!snappedY && Math.abs(item.y - (other.y + other.h)) < threshold) {
                  item.y = other.y + other.h; snappedY = true; adjY = other;         // my top against their bottom
                  drawSnap('h', item.y, [item.x, other.x]);
              }
              if (!snappedY && Math.abs((item.y + item.h) - other.y) < threshold) {
                  item.y = other.y - item.h; snappedY = true; adjY = other;         // my bottom against their top
                  drawSnap('h', item.y + item.h, [item.x, other.x]);
              }
              if (!snappedY && Math.abs(item.y - other.y) < threshold) {
                  item.y = other.y; snappedY = true;                                // tops aligned
                  drawSnap('h', item.y, [item.x, other.x]);
              }
              if (!snappedY && Math.abs((item.y + item.h) - (other.y + other.h)) < threshold) {
                  item.y = other.y + other.h - item.h; snappedY = true;             // bottoms aligned
                  drawSnap('h', item.y + item.h, [item.x, other.x]);
              }
              if (!snappedY && Math.abs((item.y + item.h/2) - (other.y + other.h/2)) < threshold) {
                  item.y = other.y + other.h/2 - item.h/2; snappedY = true;         // centers aligned
                  drawSnap('h', item.y + item.h/2, [item.x, other.x]);
              }

          }

      });

      if (isResize) {
          var rm2 = doSmartSnapping.resizeMatch;
          if (rm2) {
              if (!snappedW) rm2.w = null;   // drifted out of the sticky zone
              if (!snappedH) rm2.h = null;
          }
          if (snappedW || snappedH) {
              var rmB = doSmartSnapping.resizeMatch || {};
              drawMatchBadge(item, snappedW, snappedH,
                  snappedW ? activeMap.whiteboard.find(function(o) { return o.id === rmB.w; }) : null,
                  snappedH ? activeMap.whiteboard.find(function(o) { return o.id === rmB.h; }) : null);
          }
          doSmartSnapping.last = { x: false, y: false };
          return;
      }

      // Alignment assist: once a side is flush against a neighbor, pull the
      // OTHER axis into line with that same neighbor from much further away —
      // sliding an image next to another one seats it as a clean row/column.
      var BOOST = 45;
      if (adjX && !snappedY) {
          var oA = adjX;
          if (Math.abs(item.y - oA.y) < BOOST) { item.y = oA.y; snappedY = true; drawSnap('h', item.y, [item.x, oA.x]); }
          else if (Math.abs((item.y + item.h) - (oA.y + oA.h)) < BOOST) { item.y = oA.y + oA.h - item.h; snappedY = true; drawSnap('h', item.y + item.h, [item.x, oA.x]); }
          else if (Math.abs((item.y + item.h/2) - (oA.y + oA.h/2)) < BOOST) { item.y = oA.y + oA.h/2 - item.h/2; snappedY = true; drawSnap('h', item.y + item.h/2, [item.x, oA.x]); }
      }
      if (adjY && !snappedX) {
          var oB = adjY;
          if (Math.abs(item.x - oB.x) < BOOST) { item.x = oB.x; snappedX = true; drawSnap('v', item.x, [item.y, oB.y]); }
          else if (Math.abs((item.x + item.w) - (oB.x + oB.w)) < BOOST) { item.x = oB.x + oB.w - item.w; snappedX = true; drawSnap('v', item.x + item.w, [item.y, oB.y]); }
          else if (Math.abs((item.x + item.w/2) - (oB.x + oB.w/2)) < BOOST) { item.x = oB.x + oB.w/2 - item.w/2; snappedX = true; drawSnap('v', item.x + item.w/2, [item.y, oB.y]); }
      }

      // Remembered per axis so the release-time grid seat doesn't undo an
      // item-to-item snap (grid still applies on axes that didn't glue).
      doSmartSnapping.last = { x: snappedX, y: snappedY };

  }



  /* ---------- drag shared ---------- */

  // Select every item whose CENTRE falls inside the marquee box (world coords). Shared by the empty-board
  // marquee and the locked-item marquee. A modifier adds to the current selection; an empty sweep clears it.
  function selectItemsInMarquee(mx, my, mw, mh, e) {
      if (!(mw > 5 && mh > 5)) { render(); return; }
      var activeMap = getActiveMap(); if (!activeMap) return;
      var selected = [], nM = window.wpNet, onlyOwn = !!(nM && nM.active && nM.role === 'client');   // fold M8: a player's marquee takes only what they may move
      activeMap.whiteboard.forEach(function(w) {
          if (onlyOwn && !(w && (w.isChar || w.waiting) && w.ownerId === nM.myId && !w.hidden && !w.locked)) return;
          if (!onlyOwn && window.wpILayers && window.wpILayers.through(w)) return;   // backlog 43: a marquee passes over a kind that takes no clicks
          var cx = w.x + (w.w || 100) / 2, cy = w.y + (w.h || 100) / 2;
          if (cx >= mx && cx <= mx + mw && cy >= my && cy <= my + mh) selected.push(w.id);
      });
      if (selected.length > 0) {
          if (e.shiftKey || e.ctrlKey || e.metaKey) state.selWbIds = Array.from(new Set([...(state.selWbIds || []), ...selected]));
          else state.selWbIds = selected;
          state.selWbId = state.selWbIds[state.selWbIds.length - 1];
      } else if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
          state.selWbIds = []; state.selWbId = null;
      }
      render();
  }

  // A press handed on to another piece (the three hand-overs of the drag below). No chain of them is longer than three: two hand-overs
  // that each answer the other would otherwise pass one press back and forth without end
  var handDepth = 0;
  function handOn(toEl, e) {
      if (handDepth >= 3) return false;
      handDepth++;
      try { toEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY })); }
      finally { handDepth--; }
      return true;
  }
  // A piece's level as the board stacks it (systemcore stackZ: a level a file wrote as text is read as its number, a layer only by the app's own words)
  function handZ(cand) {
      var SC = window.wpSystemCore;
      if (SC && typeof SC.stackZ === 'function') return SC.stackZ(cand);
      var LZ = { back: 10, 'back-mid': 15, middle: 20, 'front-mid': 25, front: 30 }, n = Number(cand.z), z = Object.prototype.hasOwnProperty.call(LZ, cand.layer) ? LZ[cand.layer] : (isFinite(n) && n ? n : (cand.isChar ? 20 : 10));
      var bk = cand.type === 'path' && (cand.tip === 'fill' || cand.blocksSight === true || cand.barrier === true || (typeof cand.texture === 'string' && cand.texture !== '') || (typeof cand.texSrc === 'string' && cand.texSrc !== ''));   // 1.6.2: systemcore pathBack and stackLift, read alike where no core is at hand
      return z + (cand.aboveGrid ? 15100 : cand.isChar || cand.waiting ? 15020 : cand.type === 'path' ? (!bk && (!cand.layer || z > 20) ? 15020 : 0) : (z > 20 ? 15020 : 0));
  }
  // The topmost unlocked character token under a press on a piece that is no token (1.6.0, found by hand: the press handed the token on, and a double-click then opened the picture over it)
  function tokenUnder(map, item, e) {
      if (!map || !Array.isArray(map.whiteboard) || !item || item.isChar || item.waiting || e.shiftKey || e.ctrlKey || e.metaKey) return null;
      var wr = wbWrap.getBoundingClientRect(), px = wbX(e.clientX, e.clientY, wr, wbWrap), py = wbY(e.clientX, e.clientY, wr, wbWrap), tok = null, tz = -Infinity, at = -1;
      map.whiteboard.forEach(function(c, i) {
          if (!c.isChar || c.locked || c.id === item.id || (typeof window !== 'undefined' && window.wpILayers && window.wpILayers.through(c)) || px < c.x || px > c.x + (c.w || 0) || py < c.y || py > c.y + (c.h || 0)) return;
          var z = handZ(c); if (z > tz || (z === tz && i > at)) { tok = c; tz = z; at = i; }
      });
      return tok;
  }
  // [systemcheck:wallpick-start]
  // A wall or a door drawn as a line is easy for the GM to pick (the owner, at the table on 2026-10-25: "id like to be able to more easily
  // erase, or delete a drawn wall. i couldnt select it for delete either from what I could tell"). A line takes a press on its stroke alone,
  // and a floor laid after the walls lies over it. On the GM's own screen a press within WALL_REACH board pixels of the stroke of a wall's or
  // a door's line goes to that line, before a floor, a plain shape, a picture or a text box under the pointer: the nearest line, then the
  // topmost (handZ), then the later in the list. A token, a waiting token and a GM note card keep their own press, and an unlocked token
  // under the pointer still wins. A locked line is not picked: a locked piece hands its press on. Never on a player's app or at someone else's
  // table, and never where this screen may not write the campaign (the stream window, a window of its own). The press itself goes on
  // through handOn, so the bound on hand-overs holds; a right-click and a double-click ask wallPickAt for the same answer
  var WALL_REACH = 8;
  function wallLine(c) { return !!c && typeof c === 'object' && c.type === 'path' && c.tip !== 'fill' && Array.isArray(c.pts) && (c.blocksSight === true || c.barrier === true); }
  function wallPickGm() { var n = window.wpNet; return !(n && (n.foreign || (n.active && n.role === 'client'))) && !!(window.wpCanPersistLocal && window.wpCanPersistLocal()); }
  // how far a point lies outside a line's drawn stroke, in board pixels (0 or less on it); Infinity for a line with no stretch
  function wallGap(c, px, py) {
      var num = function(v) { return typeof v === 'number' && isFinite(v); };
      if (!num(c.x) || !num(c.y) || !num(px) || !num(py)) return Infinity;
      var ww = num(c.w) && c.w > 0 ? c.w : 0, hh = num(c.h) && c.h > 0 ? c.h : 0, bw = num(c.baseW) && c.baseW > 0 ? c.baseW : (ww || 1), bh = num(c.baseH) && c.baseH > 0 ? c.baseH : (hh || 1);
      var sx = ww ? ww / bw : 1, sy = hh ? hh / bh : 1, rot = num(c.rot) ? c.rot % 360 : 0, cx = c.x + ww / 2, cy = c.y + hh / 2;
      if (rot) { var ra = -rot * Math.PI / 180, co = Math.cos(ra), si = Math.sin(ra), rx = px - cx, ry = py - cy; px = cx + rx * co - ry * si; py = cy + rx * si + ry * co; }   // the board turns a line about its box's centre: the point is turned back
      var sw = typeof c.strokeWidth === 'number' ? c.strokeWidth : parseFloat(c.strokeWidth), half = Math.min(200, (num(sw) && sw > 0 ? sw : 3) * Math.max(sx, sy) / 2), far = half + WALL_REACH + 1;
      if (ww && hh && (px < c.x - far || px > c.x + ww + far || py < c.y - far || py > c.y + hh + far)) return Infinity;   // a line far from the pointer is passed over by its box alone
      var best = Infinity, prev = null, n = Math.min(c.pts.length, 4000);
      for (var i = 0; i < n; i++) {
          var p = c.pts[i]; if (!Array.isArray(p) || !num(p[0]) || !num(p[1])) continue;
          var q = [c.x + p[0] * sx, c.y + p[1] * sy];
          if (prev) {
              var dx = q[0] - prev[0], dy = q[1] - prev[1], L = dx * dx + dy * dy, t = L > 0 ? ((px - prev[0]) * dx + (py - prev[1]) * dy) / L : 0;
              t = Math.max(0, Math.min(1, t));
              var ex = px - (prev[0] + t * dx), ey = py - (prev[1] + t * dy), d = Math.sqrt(ex * ex + ey * ey);
              if (d < best) best = d;
          } else if (n === 1) { best = Math.hypot(px - q[0], py - q[1]); }
          prev = q;
      }
      return best - half;
  }
  // the wall or door line a press on `pressed` at (px, py) goes to, or null
  function wallPick(list, pressed, px, py) {
      if (!Array.isArray(list) || !pressed || typeof pressed !== 'object' || pressed.isChar || pressed.waiting || pressed.gmNoteFor || wallLine(pressed)) return null;
      var best = null, bestD = Infinity, bestZ = -Infinity, bestI = -1, inTok = false;
      list.forEach(function(c, idx) {
          if (!c || typeof c !== 'object' || c === pressed || c.id === pressed.id) return;
          if ((c.isChar || c.waiting) && !c.locked && px >= c.x && px <= c.x + (c.w || 0) && py >= c.y && py <= c.y + (c.h || 0)) { inTok = true; return; }
          if (!wallLine(c) || (c.locked && !pressed.locked) || (typeof window !== 'undefined' && window.wpILayers && window.wpILayers.through(c))) return;   // 231: a locked line is picked from a locked piece (a map whose structure is locked); from a free one it is not, or the two would hand the press back and forth   // backlog 43: a wall set to take no clicks is never picked
          var d = wallGap(c, px, py); if (!(d <= WALL_REACH)) return;
          d = Math.max(0, d);   // on the stroke is on it, however deep
          var z = handZ(c);
          if (d < bestD || (d === bestD && (z > bestZ || (z === bestZ && idx > bestI)))) { best = c; bestD = d; bestZ = z; bestI = idx; }
      });
      return inTok ? null : best;
  }
  // a press of the pointer event e on the piece `pressed` of the map: the element of the line it goes to, or null
  function wallPickEl(map, pressed, e) {
      if (!map || !Array.isArray(map.whiteboard) || !wallPickGm()) return null;
      var wr = wbWrap.getBoundingClientRect(), px = wbX(e.clientX, e.clientY, wr, wbWrap), py = wbY(e.clientX, e.clientY, wr, wbWrap);
      var w = wallPick(map.whiteboard, pressed, px, py), wEl = w && document.querySelector('.wb-item[data-id="' + w.id + '"]');
      return wEl && wEl.style.display !== 'none' ? wEl : null;
  }
  // for the right-click menu and a double-click: the id of the line a press at (clientX, clientY) on the piece of that id goes to, or null
  function wallPickAt(id, clientX, clientY) {
      var map = getActiveMap(); if (!map || !Array.isArray(map.whiteboard)) return null;
      var pressed = map.whiteboard.find(function(x) { return x && x.id === id; }); if (!pressed) return null;
      var wEl = wallPickEl(map, pressed, { clientX: clientX, clientY: clientY });
      return wEl ? wEl.dataset.id : null;
  }
  window.wpWallPick = wallPickAt;
  // [systemcheck:wallpick-end]
  function attachDrag(el, modeStr){
      var startX,startY,moved,dragging=false,item;
      var multiDrag = [];
      var lastPX = 0, lastPY = 0;   // where the pointer last was, for a drag that ends without a pointerup
      var dragMapId = null, lastDx = 0, lastDy = 0;   // fold M8: the map the drag began on, and how far it went at its last move
      var lockedMq = null;   // set while a drag on a LOCKED item is (maybe) becoming a marquee — {item, box?}; null on every normal drag, so the drag path below is untouched

      el.addEventListener('pointerdown',function(e){
        if(e.button!==undefined && e.button!==0) return;
        if(typeof window.isDrawingMode !== 'undefined' && window.isDrawingMode) return;
        if((window.isEraserMode || window.isMeasureMode || window.isFogMode || window.isFillMode || window.isEnvMode) && modeStr !== 'data') return; // Eraser/measure/fog/fill/environment handle their own input
        if((modeStr === 'data' ? !!(document.body && document.body.classList.contains('data-pan')) : window.isPanMode) || window.wpSpacePan) return; // hand tool (each view its own: the Data Map's body.data-pan, the play map's flag) OR held Space: the wrap pans, items never drag
        if(e.target.contentEditable === "true") return; // Let user select text
        // if clicking on resize handle native area (bottom right corner approx)
        var rect = el.getBoundingClientRect();
        var hz = Math.min(15, rect.width * 0.33, rect.height * 0.33);   // resize-handle zone scaled to the item's ON-SCREEN size (capped 15px) — a fixed 15px swallowed small tokens at low zoom and made them ungrabbable
        if (e.clientX > rect.right - hz && e.clientY > rect.bottom - hz) return; 

        var activeMap = getActiveMap(); if (!activeMap) return;
        if(modeStr === 'data') item = activeMap.rooms.find(x=>x.id===el.dataset.id);
        else item = activeMap.whiteboard.find(x=>x.id===el.dataset.id);

        if(!item) return;

        // Players may only drag tokens the GM assigned to them — and nothing while paused
        if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') {
            if (modeStr !== 'visual') return;
            if (window.wpNet.paused || window.wpNet.selfPaused || window.wpNet.selfHeld) return;   // table paused, the GM paused me specifically, or held for a new sheet
            if (!((item.isChar || item.waiting) && item.ownerId === window.wpNet.myId)) {   // Onboarding F1a: their waiting token moves too
                // Nothing else is draggable for a player, so anything covering their
                // token (a text box, a note card, a trigger zone) must not trap it:
                // hand the drag to their own token under the pointer, if there is one.
                var wrC = wbWrap.getBoundingClientRect();
                var cpx = wbX(e.clientX, e.clientY, wrC, wbWrap);
                var cpy = wbY(e.clientX, e.clientY, wrC, wbWrap);
                var mine = activeMap.whiteboard.find(function(cand) {
                    return (cand.isChar || cand.waiting) && cand.ownerId === window.wpNet.myId && cand.id !== item.id &&
                           cpx >= cand.x && cpx <= cand.x + (cand.w || 0) && cpy >= cand.y && cpy <= cand.y + (cand.h || 0);
                });
                var mineEl = mine && document.querySelector('.wb-item[data-id="' + mine.id + '"]');
                if (mineEl && mineEl.style.display !== 'none' && handOn(mineEl, e)) e.preventDefault();
                return;
            }
        }
        if(item.locked) {
            // A locked item must not shield the items under it: hand the drag to
            // the topmost UNLOCKED item beneath the pointer, if there is one. On a
            // player's app only to a token of their own: a player drags nothing else,
            // and a press on a piece that is not theirs is handed back to their own
            // token (above), so the two hand-overs passed a press on their own locked
            // token back and forth without end.
            var asPlayer = !!(window.wpNet && window.wpNet.active && window.wpNet.role === 'client');
            if (modeStr === 'visual' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                var wrB = wbWrap.getBoundingClientRect();
                var wpx = wbX(e.clientX, e.clientY, wrB, wbWrap);
                var wpy = wbY(e.clientX, e.clientY, wrB, wbWrap);
                var best = null, bestZ = -Infinity, bestIdx = -1;
                activeMap.whiteboard.forEach(function(cand, idx) {
                    if (cand.locked || cand.id === item.id) return;
                    if (typeof window !== 'undefined' && window.wpILayers && window.wpILayers.through(cand)) return;   // backlog 43
                    if (asPlayer && !((cand.isChar || cand.waiting) && cand.ownerId === window.wpNet.myId)) return;
                    if (wpx < cand.x || wpx > cand.x + (cand.w || 0) || wpy < cand.y || wpy > cand.y + (cand.h || 0)) return;
                    var cz = handZ(cand);
                    if (cz > bestZ || (cz === bestZ && idx > bestIdx)) { best = cand; bestZ = cz; bestIdx = idx; }
                });
                if (best) {
                    var underEl = document.querySelector('.wb-item[data-id="' + best.id + '"]');
                    if (underEl && underEl.style.display !== 'none' && handOn(underEl, e)) { e.preventDefault(); return; }
                } else {   // nothing unlocked under the pointer: a wall's or a door's line near it takes the press, on the GM's own screen
                    var wallLk = wallPickEl(activeMap, item, e);
                    if (wallLk && handOn(wallLk, e)) { e.preventDefault(); return; }
                }
            }
            if (modeStr === 'visual') {
                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                    if (!state.selWbIds) state.selWbIds = [];
                    if (!state.selWbIds.includes(item.id)) state.selWbIds.push(item.id);
                    else state.selWbIds = state.selWbIds.filter(id => id !== item.id);
                    state.selWbId = state.selWbIds[state.selWbIds.length - 1] || null;
                    render();
                    return;
                }
                // No modifier, nothing unlocked beneath: a plain CLICK selects the locked item (+ toolbar);
                // a DRAG sweeps a marquee over the items on top/behind it (click-vs-drag decided in pointermove/up).
                lockedMq = { item: item };
                dragging = true; moved = false;
                startX = e.clientX; startY = e.clientY;
                try { el.setPointerCapture(e.pointerId); } catch(_) {}
                e.preventDefault();
                return;
            }
            return;
        }
        
        // Token grab priority: a character token UNDER an unlocked non-token item (a label, note, prop, backdrop)
        // wins the grab/select — the creature is what you're reaching for. Hand the pointer to the topmost token
        // beneath, without touching layer/z. A modifier-click still selects the item on top; token-on-token grabs
        // the top one (this only fires when the grabbed item is not itself a token, and a WAITING token is a token: it
        // has no isChar, and handed on from it a press on a player's own waiting token over another token came back
        // to it without end). The locked branch above already hands a locked cover-item's drag to whatever is beneath it.
        if (modeStr === 'visual' && !item.isChar && !item.waiting && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            var wrT = wbWrap.getBoundingClientRect();
            var tpx = wbX(e.clientX, e.clientY, wrT, wbWrap);
            var tpy = wbY(e.clientX, e.clientY, wrT, wbWrap);
            var tok = null, tokZ = -Infinity, tokIdx = -1;
            activeMap.whiteboard.forEach(function(cand, idx) {
                if (!cand.isChar || cand.locked || cand.id === item.id) return;
                if (typeof window !== 'undefined' && window.wpILayers && window.wpILayers.through(cand)) return;   // backlog 43
                if (tpx < cand.x || tpx > cand.x + (cand.w || 0) || tpy < cand.y || tpy > cand.y + (cand.h || 0)) return;
                var cz = handZ(cand);
                if (cz > tokZ || (cz === tokZ && idx > tokIdx)) { tok = cand; tokZ = cz; tokIdx = idx; }
            });
            if (tok) {
                var tokEl = document.querySelector('.wb-item[data-id="' + tok.id + '"]');
                if (tokEl && tokEl.style.display !== 'none' && handOn(tokEl, e)) { e.preventDefault(); return; }
            }
        }
        // A wall's or a door's line near the pointer takes the press before a floor, a shape, a picture or a text box over it (the GM's own screen; see wallPick)
        if (modeStr === 'visual' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            var wallEl = wallPickEl(activeMap, item, e);
            if (wallEl && handOn(wallEl, e)) { e.preventDefault(); return; }
        }

        if (modeStr === 'visual') {
            var groupItems = [];
            if (item.groupId) {
                groupItems = activeMap.whiteboard.filter(x => x.groupId === item.groupId).map(x => x.id);
            }
            if (e.shiftKey || e.ctrlKey || e.metaKey) {
                if (!state.selWbIds) state.selWbIds = [];
                if (groupItems.length > 0) {
                    groupItems.forEach(id => { if (!state.selWbIds.includes(id)) state.selWbIds.push(id); });
                } else {
                    if (!state.selWbIds.includes(item.id)) state.selWbIds.push(item.id);
                    else state.selWbIds = state.selWbIds.filter(id => id !== item.id);
                }
                state.selWbId = state.selWbIds[state.selWbIds.length - 1] || null;
            } else {
                if (!state.selWbIds || !state.selWbIds.includes(item.id)) {
                    if (groupItems.length > 0) {
                        state.selWbIds = groupItems;
                    } else {
                        state.selWbIds = [item.id];
                    }
                    state.selWbId = item.id;
                }
            }
            
            multiDrag = [];
            var nD = window.wpNet, ownOnly = !!(nD && nD.active && nD.role === 'client');   // fold M8: a player's drag holds only what they may move
            state.selWbIds.forEach(id => {
                var it = activeMap.whiteboard.find(x => x.id === id);
                if (it && !it.locked && (!ownOnly || ((it.isChar || it.waiting) && it.ownerId === nD.myId && !it.hidden))) {
                    var itEl = document.querySelector('.wb-item[data-id="'+id+'"]');
                    multiDrag.push({item: it, ox: it.x, oy: it.y, el: itEl});
                }
            });
        } else {
            multiDrag = [{item: item, ox: item.x, oy: item.y, el: el}];
        }

        dragging=true; moved=false;
        doSmartSnapping.last = null;   // fresh drag: no item-snap memory yet
        startX=e.clientX; startY=e.clientY;
        try { el.setPointerCapture(e.pointerId); } catch(_) {} el.classList.add('dragging');
        if (modeStr === 'visual' && window.wpHostGestureStart) window.wpHostGestureStart();   // fold M6: a drag that writes items is open
        dragMapId = activeMap.id; lastDx = 0; lastDy = 0;
        e.preventDefault();
      });

      el.addEventListener('pointermove',function(e){
        if(!dragging) return;
        lastPX = e.clientX; lastPY = e.clientY;
        if (lockedMq) {   // a drag that began on a locked item → sweep a marquee over what's on top/behind it
            if (Math.abs(e.clientX - startX) > 3 || Math.abs(e.clientY - startY) > 3) moved = true;
            if (moved) {
                var wrLM = wbWrap.getBoundingClientRect();
                var lsx = (startX - wrLM.left + wbWrap.scrollLeft) / state.zoomLevel, lsy = (startY - wrLM.top + wbWrap.scrollTop) / state.zoomLevel;
                var lcx = wbX(e.clientX, e.clientY, wrLM, wbWrap), lcy = wbY(e.clientX, e.clientY, wrLM, wbWrap);
                if (!lockedMq.box) { lockedMq.box = document.createElement('div'); lockedMq.box.className = 'marquee-selection'; document.getElementById('whiteboard').appendChild(lockedMq.box); }
                lockedMq.box.style.left = Math.min(lsx, lcx) + 'px'; lockedMq.box.style.top = Math.min(lsy, lcy) + 'px';
                lockedMq.box.style.width = Math.abs(lcx - lsx) + 'px'; lockedMq.box.style.height = Math.abs(lcy - lsy) + 'px';
            }
            return;
        }
        var dx = wbDX(e.clientX - startX, e.clientY - startY);
        var dy = wbDY(e.clientX - startX, e.clientY - startY);
        if(Math.abs(e.clientX - startX)>3||Math.abs(e.clientY - startY)>3) moved=true;   // click-vs-drag slop in SCREEN px so it stays 3px at any zoom (dx/dy are world px = screen/zoom)
        
        var clientVis = modeStr === 'visual' && window.wpNet && window.wpNet.active && window.wpNet.role === 'client' && window.wpOwnTokenNow;
        if (clientVis) {   // fold M8: the drag follows the live map (a whole copy may have landed): each member found again by id, only while it is theirs
            var liveP = window.wpOwnTokenNow(dragMapId, item.id); if (!liveP) return;   // the token under the pointer is no longer theirs: nothing more is written
            item = liveP;
            multiDrag.forEach(function(m) { var lt = window.wpOwnTokenNow(dragMapId, m.item.id); m.lost = !lt; if (lt) m.item = lt; });
        }
        var primaryDrag = multiDrag.find(m => m.item.id === item.id) || multiDrag[0];
        if(!primaryDrag) return;

        var tempX = primaryDrag.ox + dx;
        var tempY = primaryDrag.oy + dy;
        
        // Smart snapping only works on the primary item
        var snapItem = { id: item.id, x: tempX, y: tempY, w: item.w, h: item.h };
        if(modeStr === 'visual') doSmartSnapping(snapItem, false);
        
        var actualDx = snapItem.x - primaryDrag.ox;
        var actualDy = snapItem.y - primaryDrag.oy;
        lastDx = actualDx; lastDy = actualDy;

        multiDrag.forEach(m => {
            if (m.lost) return;
            m.item.x = m.ox + actualDx;
            m.item.y = m.oy + actualDy;
            var mEl = (clientVis && state.wbEls && state.wbEls[m.item.id]) || m.el;
            if (mEl) {
                mEl.style.left = m.item.x + 'px';
                mEl.style.top = m.item.y + 'px';
                texSeatEl(mEl, m.item.x, m.item.y);   // the map builder: the tile stays seated on the board while the piece moves
            }
        });
        
        if(modeStr==='data') renderDataMap(); // update edges
        if(modeStr==='visual' && window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(item, false, dragMapId); // live token motion for remote players (fold M8: on the map the drag began on)
        if(modeStr==='visual' && window.wpUpdateSelToolbar) window.wpUpdateSelToolbar();   // toolbar rides along with the drag
        if (modeStr === 'visual' && window.wpUpdateHandles) window.wpUpdateHandles();   // dots follow the drag (single or multi)
        if (modeStr === 'visual' && window.wpCircleFollow) window.wpCircleFollow();   // 128: a circle of the Radius tool that sits on a token goes with it
        if (modeStr === 'visual' && window.wpMoveTip) window.wpMoveTip(item, dragMapId, primaryDrag.ox, primaryDrag.oy, e.clientX, e.clientY);   // 1.5.7: the turn's move, live
      });

      // A drag can lose its pointer without a pointerup: the cursor leaves the window, the
      // window loses focus, the OS cancels the gesture. The item then stayed "held" and jumped
      // to the pointer whenever it passed by. End the drag where the pointer last was instead.
      function abortDrag(e) {
          if (!dragging) return;
          el.dispatchEvent(new PointerEvent('pointerup', { pointerId: (e && e.pointerId) || 1, clientX: lastPX, clientY: lastPY, button: 0 }));
      }
      el.addEventListener('pointercancel', abortDrag);
      el.addEventListener('lostpointercapture', function(e) { if (dragging) abortDrag(e); });
      window.addEventListener('blur', function() { abortDrag(null); });
      el.addEventListener('dblclick', function(e) {
          if (modeStr !== 'visual') return;
          if (window.wpMouse && typeof window.wpMouse.gesture === 'function' && window.wpMouse.gesture('open') === 'shiftdbl' && !e.shiftKey) return;   // 1.6.2: a piece opens on Shift + double-click where the player picked it
          var am2 = getActiveMap(); var it2 = am2 && am2.whiteboard.find(function(x){ return x.id === el.dataset.id; }); if (!it2) return;
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') { if (it2.isChar && it2.charId && it2.ownerId === window.wpNet.myId && window.wpSheets && window.wpSheets.openSheet) { e.stopPropagation(); window.wpSheets.openSheet(it2.charId); } return; }   // 1.6.0: a player's double-click on their own token opens its sheet, the first thing a player tries (found live, 2026-10-30)
          var wallD = wallPickEl(am2, it2, e), wallDi = wallD && am2.whiteboard.find(function(x){ return x.id === wallD.dataset.id; });   // a double-click near a wall's line opens the wall, as its press picked it
          if (wallDi) { e.stopImmediatePropagation(); it2 = wallDi; }
          else if (it2.type === 'text' || it2.nodeId || it2.targetMapId) return;   // text boxes edit and portals travel on double-click — leave those to their own handlers
          else { var tokD = typeof tokenUnder === 'function' ? tokenUnder(am2, it2, e) : null; if (tokD) { e.stopImmediatePropagation(); it2 = tokD; } }
          e.stopPropagation();   // 1.6.2 (backlog 229; the owner, by prompt: "Row only, no double-click"): a double-click opens no Properties. The right-click menu and the selection bar do
      });
      el.addEventListener('pointerup',function(e){
        if (window.wpMoveTip) window.wpMoveTip(null);   // 1.5.7: the live move label goes with the drag
        if(!dragging) return;
        if (window.wpHostGestureEnd) window.wpHostGestureEnd();   // fold M6: whatever it was, the gesture is over (abortDrag ends here too)
        if (lockedMq) {   // finish a locked-item interaction: a drag became a marquee, a still click selects the locked item
            dragging = false;
            try { el.releasePointerCapture(e.pointerId); } catch(_) {}
            var lmBox = lockedMq.box, lmItem = lockedMq.item; lockedMq = null;
            if (lmBox) {
                var lmx = parseFloat(lmBox.style.left), lmy = parseFloat(lmBox.style.top), lmw = parseFloat(lmBox.style.width), lmh = parseFloat(lmBox.style.height);
                lmBox.remove();
                selectItemsInMarquee(lmx, lmy, lmw, lmh, e);
            } else {
                if (!state.selWbIds || !state.selWbIds.includes(lmItem.id)) { state.selWbIds = [lmItem.id]; state.selWbId = lmItem.id; }
                render();
            }
            return;
        }
        dragging=false; el.classList.remove('dragging');
        clearSnaps();
        try{el.releasePointerCapture(e.pointerId);}catch(_){}
        if(moved){
          if (modeStr === 'visual' && window.wpNet && window.wpNet.active && window.wpNet.role === 'client' && window.wpRegrabDrag) {
              // fold M8: the drop lands on the live map at the pointer's place, whatever copy of the map arrived since the last move. The map
              // left meanwhile (summoned, travelled): no drop, and the map it began on is asked for whole. The token under the pointer no
              // longer theirs: nothing lands and the others go back where they were (the host never moved them); another member no longer
              // theirs is left as the host has it and the rest land
              var campU = getActiveCampaign();
              if (!campU || campU.activeItemId !== dragMapId) { if (campU && window.wpNet.needItem) window.wpNet.needItem(campU.id, dragMapId); render(); return; }
              var survivors = window.wpRegrabDrag(multiDrag, dragMapId, lastDx, lastDy), liveI = window.wpOwnTokenNow(dragMapId, item.id);
              if (!liveI) { survivors.forEach(function(md) { md.item.x = md.ox; md.item.y = md.oy; }); render(); return; }
              item = liveI; multiDrag = survivors;
          }
          if(state.snap && modeStr === 'data'){
              // snap the dragged room, and carry every other dragged room by the same amount
              var snD = getSnapCoords(item.x, item.y), sdxD = snD.x - item.x, sdyD = snD.y - item.y;
              multiDrag.forEach(function(md) { md.item.x += sdxD; md.item.y += sdyD; var melD = md.el || state.els[md.item.id]; if (melD) { melD.style.left = md.item.x + 'px'; melD.style.top = md.item.y + 'px'; } });
              renderDataMap();
          }
          var snapOn = window.wpSnapOn(), fitDrag = multiDrag.some(function(md) { return md.item.gridFit; });   // the snap rule: Snap decides on every grid (a player's is the GM's); a fitted item stays fitted
          var cellRef = snapOn && window.wpHexCellSized(item);   // the piece under the pointer is a picture or a shape the size of one hex cell: it seats in its cell, as a token does (it is the reference below; any other such piece in the drag follows it, so a group never loosens)
          if (modeStr === 'visual' && state.gridType === 'hex' && (cellRef || multiDrag.some(function(md) { return md.item.gridFit || (snapOn && (md.item.isChar || md.item.waiting || md.item.type === 'hexagon' || md.item.shape === 'hexagon')); }))) {
              // With Snap on, hex-shaped items and character tokens seat into a cell on hex
              // maps — every one in the drag, not just the one under the pointer.
              // One hex item in the drag is the reference (the one under the pointer if it is one, else the
              // first): it seats into its cell, every non-hex member (a text box grouped with a teleport
              // point, a floor, a prop) follows by the same correction, and the other hex items seat
              // into their own cells. The group never loosens, whichever member was dragged.
              var isHexy = function(it) { return it.gridFit || (snapOn && (it.isChar || it.waiting || it.type === 'hexagon' || it.shape === 'hexagon')); };   // gridFit images seat by centre too (forced below)
              var refMd = multiDrag.find(function(md) { return md.item === item && (cellRef || isHexy(item)); }) || multiDrag.find(function(md) { return isHexy(md.item); });
              var seatBefore = { x: refMd.item.x, y: refMd.item.y };
              window.wpSeatHex(refMd.item, null, true);   // force: a fitted (non-char) image centres on its hex cell too
              var seatDx = refMd.item.x - seatBefore.x, seatDy = refMd.item.y - seatBefore.y;
              multiDrag.forEach(function(md) {
                  if (md !== refMd) { if (isHexy(md.item)) window.wpSeatHex(md.item, null, true); else { md.item.x += seatDx; md.item.y += seatDy; } }
                  var mel = md.el || state.wbEls[md.item.id];
                  if (mel) { mel.style.left = md.item.x + 'px'; mel.style.top = md.item.y + 'px'; }
              });
              el.style.left=item.x+'px'; el.style.top=item.y+'px';
          } else if((snapOn || fitDrag) && modeStr === 'visual' && state.gridType && state.gridType !== 'off'){   // grid seat: grid / both modes only (snapOn), or a fitted item
              // Item-to-item snaps beat the grid: an axis that glued to a
              // neighbor mid-drag keeps its flush/aligned position on release.
              var glued = doSmartSnapping.last || {};
              var sn = (state.gridType === 'hex') ? getSnapCoords(item.x, item.y) : (function(GR) { return GR && GR.type === 'square' ? { x: (Math.round((item.x - (GR.ox || 0)) / GR.size) * GR.size + (GR.ox || 0)), y: (Math.round((item.y - (GR.oy || 0)) / GR.size) * GR.size + (GR.oy || 0)) } : { x: Math.round(item.x / 50) * 50, y: Math.round(item.y / 50) * 50 }; })((typeof latticeOf === 'function' ? latticeOf() : null));   // square: round to the lattice's cell even with Snap off (a gridFit item stays fitted)
              // the same correction for every item in the drag: a group never loosens on release
              var sdx = glued.x && !fitDrag ? 0 : sn.x - item.x, sdy = glued.y && !fitDrag ? 0 : sn.y - item.y;   // 1.6.2, found by the owner: a piece fitted to the grid lands in its cells, whatever it glued to on the way
              multiDrag.forEach(function(md) { md.item.x += sdx; md.item.y += sdy; var melG = md.el || state.wbEls[md.item.id]; if (melG) { melG.style.left = md.item.x + 'px'; melG.style.top = md.item.y + 'px'; } });
              el.style.left=item.x+'px'; el.style.top=item.y+'px';
          } else if (snapOn && modeStr === 'visual' && (!state.gridType || state.gridType === 'off') && multiDrag.some(function(md) { return md.item.isChar || md.item.waiting; })) {
              // the snap rule: a map with no grid — the tokens in the drag land on dots of the background, everything else following the one
              // under the pointer (or the first token) by its correction, so a group never loosens
              var isTok = function(it) { return it.isChar || it.waiting; }, refT = multiDrag.find(function(md) { return md.item === item && isTok(item); }) || multiDrag.find(function(md) { return isTok(md.item); });
              var dotBefore = { x: refT.item.x, y: refT.item.y }; window.wpSeatDot(refT.item);
              var dotDx = refT.item.x - dotBefore.x, dotDy = refT.item.y - dotBefore.y;
              multiDrag.forEach(function(md) {
                  if (md !== refT) { if (isTok(md.item)) window.wpSeatDot(md.item); else { md.item.x += dotDx; md.item.y += dotDy; } }
                  var melD2 = md.el || state.wbEls[md.item.id]; if (melD2) { melD2.style.left = md.item.x + 'px'; melD2.style.top = md.item.y + 'px'; }
              });
              el.style.left=item.x+'px'; el.style.top=item.y+'px';
          }
          // fold M9: every other dragged token's drop lands as well, on any grid (a character or a waiting token, not a hidden one; a player's drag
          // holds only their own): before, only a hex map's seat sent them, and elsewhere they reached the table with the next save
          if (modeStr === 'visual' && window.wpNet && window.wpNet.active && window.wpNet.streamPos) multiDrag.forEach(function(md) { if (md.item !== item && (md.item.isChar || md.item.waiting) && !md.item.hidden) window.wpNet.streamPos(md.item, true, dragMapId); });
          if(modeStr === 'visual' && window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(item, true, dragMapId); // final, post-snap position
          if(modeStr === 'visual' && item.isChar) {
              var am = getActiveMap();
              var cx = item.x + (item.w||100)/2;
              var cy = item.y + (item.h||100)/2;
              var triggers = am.whiteboard.filter(function(x) { return x.type === 'trigger'; });
              for(var i=0; i<triggers.length; i++) {
                  var t = triggers[i];
                  var tw = t.w || 100; var th = t.h || 100;
                  if(cx >= t.x && cx <= t.x+tw && cy >= t.y && cy <= t.y+th) {
                      if (t.eventMessage) {
                          import('./dialogs.js').then(d => d.showAlert(t.eventMessage, function(){}));
                      }
                      break;
                  }
              }
              if (window.wpMineCheck) { var mdM = multiDrag.filter(function(m) { return m.item === item; })[0]; try { window.wpMineCheck(am, item, mdM ? { x: mdM.ox, y: mdM.oy } : null); } catch (e) { console.error(e); } }   // 1.5.8 explosives: a mine the token stepped into goes off (the GM's own drag; never a player's app)
              if (window.wpSoundOn) { var mdZ = multiDrag.filter(function(m) { return m.item === item; })[0]; try { window.wpSoundOn.zoneDrop(am, item, mdZ ? { x: mdZ.ox, y: mdZ.oy } : null); } catch (e) { console.error(e); } }   // 1.6.2: a sound on a zone the GM's own drag carried a token into
              if (window.wpNet && window.wpNet.holdsMoved && item.isChar) { var mdH = multiDrag.filter(function(m) { return m.item === item; })[0]; try { if (mdH) window.wpNet.holdsMoved(am, item, { x: mdH.ox, y: mdH.oy }); } catch (e) { console.error(e); } }   // 1.6.0 Who holds whom: the GM's own drop drags, or lets go
              // A portal under the token? Travel first, so the room note below only fires when the token actually stays put.
              var traveled = !!(window.wpNet && window.wpNet.tokenDropped && window.wpNet.tokenDropped(item, am, true));   // true: this machine's own hand — on the host, the GM's (a portal locked for players does not stop it); a player's app travels nobody from here
              var mdR = multiDrag.filter(function(m) { return m.item === item; })[0], toRoom = window.wpAutoRoom ? window.wpAutoRoom(item, am, mdR ? { x: mdR.ox, y: mdR.oy } : null) : null;   // judged where its drag began
              if (toRoom && !traveled) import('./io.js').then(function(m) { m.toast((item.charName || 'Character') + ' is now in ' + (toRoom.name || 'that room') + '.'); });
          }
          multiDrag.forEach(function(md) { texSeatEl(md.el || (state.wbEls && state.wbEls[md.item.id]), md.item.x, md.item.y); });   // the map builder: seated again where the release snapped the pieces
          save();
          if (modeStr === 'visual' && window.wpNet && window.wpNet.active && window.wpNet.targets && Object.keys(window.wpNet.targets).length && multiDrag.some(function(md) { return md.item.isChar; })) render();   // range penalties R1: a target mark's tags (cover, light, range) read where the tokens stand, so the mover's own screen draws them again once the drop lands
          if (modeStr === 'visual' && window.wpStanceChips) window.wpStanceChips();   // item 19b H5: a token dropped on or off a ground piece, or a ground piece dropped under one, reads its height where it now stands (no redraw follows a drop)
          if (modeStr === 'visual' && window.wpRefreshBlasts) window.wpRefreshBlasts();   // 128: who stands in a circle or a blast is read again where the token was dropped (no redraw follows a drop)
        } else {
          if(modeStr==='data'){
              if(isLinkMode()){
                if(!state.linkStart){ state.linkStart=el.dataset.id; render(); import('./io.js').then(m=>m.toast('Now click the room to connect to.')); }
                else if(state.linkStart===el.dataset.id){ state.linkStart=null; render(); }
                else { 
                    var activeMap=getActiveMap();
                    var a=state.linkStart, b=el.dataset.id; state.linkStart=null;
                    var existing = activeMap.links.findIndex(l=> (l[0]===a&&l[1]===b)||(l[0]===b&&l[1]===a));
                    if(existing>=0) { activeMap.links.splice(existing,1); import('./io.js').then(m=>m.toast('Link removed.')); }
                    else { activeMap.links.push(state.linkType ? [a, b, state.linkType] : [a, b]); state.selLink = activeMap.links.length - 1; if (window.wpSyncRightPanel) setTimeout(window.wpSyncRightPanel, 0); import('./io.js').then(m=>m.toast((LINK_TYPES[state.linkType || ''] || LINK_TYPES['']).label + ' link added. Label it in Properties.')); }
                    render(); save();
                }
              } else {
                state.selId=el.dataset.id; state.selLink = null; render();
              }
          } else {
              // Clicked without moving in visual mode
              if (e.shiftKey || e.ctrlKey || e.metaKey) { render(); }   // a modifier: the pointerdown already toggled the multi-selection — just repaint it (Ctrl/Cmd used to fall through and COLLAPSE the selection here, and Shift added to state but never repainted)
              else {
                  var activeMap = getActiveMap();
                  var groupItems = [];
                  if (item.groupId) groupItems = activeMap.whiteboard.filter(x => x.groupId === item.groupId).map(x => x.id);
                  if (groupItems.length > 0) state.selWbIds = groupItems;
                  else state.selWbIds = [item.id];
                  state.selWbId = item.id;
                  render();
              }
          }
        }
      });
    }

  // 1.6.2 (the owner, 2026-11-05, by prompt: "A short list each"): the mouse button that pans the map, the middle one where no module says
  function panBtnNow(e) { return window.wpMouse && typeof window.wpMouse.panButton === 'function' ? window.wpMouse.panButton() : 1; }
  function attachPanning(wrapEl) {

      wrapEl.addEventListener('mousedown', function(e) { if (e.button === 1) e.preventDefault(); });   // the middle button pans: never the browser's own scroll anchor

      var isPanning = false, startX, startY, scrollLeft, scrollTop;

      var currentDrawItem = null;

      var drawPoints = [];

      var drawMinX, drawMinY, drawMaxX, drawMaxY;

      var isMarquee = false, marqueeBox = null, marqueeStartX, marqueeStartY;

      wrapEl.addEventListener('pointerdown', function(e) {

          if (e.button !== undefined && e.button !== 0 && e.button !== 1 && !(e.button === 2 && panBtnNow(e) === 2)) return; // Only left or middle click, or the right where it pans

          // Space held: pan from any tool over any target, reusing the shared pan closure below
          // (pointermove/pointerup already consume isPanning/startX/startY/scrollLeft/scrollTop). This
          // runs before the eraser/draw/marquee/place branches so Space overrides whatever tool is active.
          // The middle button pans the same way, whatever tool is active (fog, fill, draw, measure, the eraser): the tool's own gesture never
          // starts for it, and nothing is deselected.
          if ((window.wpSpacePan && e.button === 0) || (e.button === panBtnNow(e) && e.button > 0)) {   // 1.6.2: the button that pans is the player's to pick (mousemap.js), the middle one as it comes
              isPanning = true;
              startX = e.pageX - wrapEl.offsetLeft; startY = e.pageY - wrapEl.offsetTop;
              scrollLeft = wrapEl.scrollLeft; scrollTop = wrapEl.scrollTop;
              wrapEl.classList.add('dragging-pan'); e.preventDefault();
              return;
          }

          if ((window.isFogMode || window.isFillMode || window.isEnvMode) && wrapEl === wbWrap) return; // fog/fill/environment paint cells themselves — never pan, select or drag
          if ((window.isEraserMode || window.isMeasureMode) && wrapEl === wbWrap && e.button === 0) return; // Eraser/measure handle left-drags themselves

          if (e.button !== 1 && e.target !== wrapEl && e.target.id !== 'canvas' && e.target.id !== 'edges' && e.target.id !== 'whiteboard') { if (!((window.isDrawingMode && wrapEl === wbWrap) || (wrapEl === wrap ? document.body.classList.contains('data-pan') : window.isPanMode))) return; }

          if (wrapEl === wrap) { state.selId = null; state.selLink = null; state.linkStart = null; }

          else { state.selWbId = null; state.selWbIds = []; }   // empty-board click clears a multi-selection too

          render();

          // Shape/text placement: a shape was picked from the menu — click places it,
          // drag draws the box it should fill.
          if (e.button === 0 && wrapEl === wbWrap && window.wpPlace && !window.isDrawingMode) {
              if (window.wpPlace.type === 'text') {
                  // the text tool on an existing text box edits it instead of stacking a new one
                  var tbT = wrapEl.getBoundingClientRect();
                  var txT = wbX(e.clientX, e.clientY, tbT, wrapEl), tyT = wbY(e.clientX, e.clientY, tbT, wrapEl);
                  var amT = getActiveMap(), hitT = null, hitZ = -Infinity;
                  ((amT && amT.whiteboard) || []).forEach(function(w) {
                      if (w.type !== 'text' || w.locked) return;
                      if (txT < w.x || tyT < w.y || txT > w.x + (w.w || 100) || tyT > w.y + (w.h || 40)) return;
                      var elT = state.wbEls[w.id], zT = elT ? (parseInt(elT.style.zIndex, 10) || 0) : 0;
                      if (zT >= hitZ) { hitZ = zT; hitT = w; }
                  });
                  if (hitT) {
                      if (window.wpPlaceDisarm) window.wpPlaceDisarm();
                      e.preventDefault();
                      setTimeout(function() { if (window.wpEditTextBox) window.wpEditTextBox(hitT.id); }, 0);
                      return;
                  }
              }
              var pb = wrapEl.getBoundingClientRect();
              var P = window.__place = {
                  on: true,
                  sx: wbX(e.clientX, e.clientY, pb, wrapEl),
                  sy: wbY(e.clientX, e.clientY, pb, wrapEl),
                  box: document.createElement('div')
              };
              P.box.className = 'marquee-selection';
              P.box.style.left = P.sx + 'px'; P.box.style.top = P.sy + 'px';
              P.box.style.width = '0px'; P.box.style.height = '0px';
              document.getElementById('whiteboard').appendChild(P.box);
              try { wrapEl.setPointerCapture(e.pointerId); } catch(_) {}
              e.preventDefault();
              return;
          }

          var _el_moveModeBtn = document.getElementById('moveModeBtn');
          var isMoveMode = _el_moveModeBtn && _el_moveModeBtn.classList.contains('active');
          if (e.button === 0 && wrapEl === wbWrap && !window.isDrawingMode && isMoveMode) {
              isMarquee = true;
              marqueeStartX = (e.clientX - wrapEl.getBoundingClientRect().left + wrapEl.scrollLeft) / state.zoomLevel;
              marqueeStartY = (e.clientY - wrapEl.getBoundingClientRect().top + wrapEl.scrollTop) / state.zoomLevel;
              marqueeBox = document.createElement('div');
              marqueeBox.className = 'marquee-selection';
              marqueeBox.style.left = marqueeStartX + 'px';
              marqueeBox.style.top = marqueeStartY + 'px';
              marqueeBox.style.width = '0px';
              marqueeBox.style.height = '0px';
              document.getElementById('whiteboard').appendChild(marqueeBox);
              try { wrapEl.setPointerCapture(e.pointerId); } catch(_) {}
              e.preventDefault();
              return;
          }

          if (e.button === 0 && typeof window.isDrawingMode !== 'undefined' && window.isDrawingMode && wrapEl === wbWrap) {

              var wrapBox = wrapEl.getBoundingClientRect();

              var mouseX = wbX(e.clientX, e.clientY, wrapBox, wrapEl);

              var mouseY = wbY(e.clientX, e.clientY, wrapBox, wrapEl);

              var snapped = penSnap(mouseX, mouseY);

              mouseX = snapped.x; mouseY = snapped.y;



              drawPoints = [[mouseX, mouseY]];

              drawMinX = mouseX; drawMaxX = mouseX;

              drawMinY = mouseY; drawMaxY = mouseY;

              

              currentDrawItem = document.createElement('div');

              currentDrawItem.className = 'wb-item path';
              currentDrawItem.style.pointerEvents = 'none';
              currentDrawItem.style.zIndex = '35';

              currentDrawItem.style.zIndex = 40;

              if (window.wpDrawShow && window.wpDrawShow.penOn()) currentDrawItem.classList.add('wb-toshow');   // 1.6.2: a drawing to show is drawn over the fog as it is being drawn too

              wb.appendChild(currentDrawItem);

              e.preventDefault();

              return;

          }

          

          isPanning = true;

          startX = e.pageX - wrapEl.offsetLeft;

          startY = e.pageY - wrapEl.offsetTop;

          scrollLeft = wrapEl.scrollLeft;

          scrollTop = wrapEl.scrollTop;

          if (!window.isDrawingMode) { wrapEl.style.cursor = 'grabbing'; wrapEl.classList.add('dragging-pan'); }

          e.preventDefault();

      });

      wrapEl.addEventListener('pointermove', function(e) {

          if (currentDrawItem && typeof window.isDrawingMode !== 'undefined' && window.isDrawingMode && wrapEl === wbWrap) {

              var wrapBox = wrapEl.getBoundingClientRect();

              var mouseX = wbX(e.clientX, e.clientY, wrapBox, wrapEl);

              var mouseY = wbY(e.clientX, e.clientY, wrapBox, wrapEl);

              var rawX = mouseX, rawY = mouseY;

              var snapped = penSnap(mouseX, mouseY);

              mouseX = snapped.x; mouseY = snapped.y;

              if (typeof state !== 'undefined' && penSnapOn()) {

                  if (drawPoints.length > 0 && drawPoints[drawPoints.length-1][0] === mouseX && drawPoints[drawPoints.length-1][1] === mouseY) {

                      e.preventDefault(); return;

                  }

              }

              if (state.drawStraight) {

                  // Straight-line mode: one clean segment from the anchor to the cursor

                  drawPoints = [drawPoints[0], [mouseX, mouseY]];

                  drawMinX = Math.min(drawPoints[0][0], mouseX); drawMaxX = Math.max(drawPoints[0][0], mouseX);

                  drawMinY = Math.min(drawPoints[0][1], mouseY); drawMaxY = Math.max(drawPoints[0][1], mouseY);

              } else {

                  // With a grid + snap the stroke must ride the grid LINES, not just
                  // touch vertices: a fast swipe samples two far-apart vertices and a
                  // straight segment between them cuts through cells. Walk from the
                  // last vertex to the new one along grid edges (greedy neighbor that
                  // closes on the target), adding every vertex on the way.
                  if (penSnapOn() && state.gridType && state.gridType !== 'off' && drawPoints.length) {
                      var lastP = drawPoints[drawPoints.length - 1];
                      var cur = [lastP[0], lastP[1]];
                      var guard = 0;
                      while ((Math.abs(cur[0] - mouseX) > 0.5 || Math.abs(cur[1] - mouseY) > 0.5) && guard++ < 400) {
                          var nbrs;
                          if (state.gridType === 'hex') {
                              // Flat-top lattice (90×52 tile): vertices with x ≡ 0 (mod 45) branch
                              // up-left / down-left / right; those with x ≡ 30 branch up-right / down-right / left
                              var PG = (typeof latticeOf === 'function' ? latticeOf() : null), ps = PG && PG.type === 'hex' ? PG.s : 30, ph = PG && PG.type === 'hex' ? PG.h / 2 : 26, pt = 1.5 * ps, xm = (((cur[0] - (PG && PG.ox || 0)) % pt) + pt) % pt;   // the map's own hex (backlog 38): today's 45, 15, 26 and 30 where it sets none
                              nbrs = Math.min(xm, pt - xm) < ps / 4
                                  ? [[cur[0] - ps / 2, cur[1] - ph], [cur[0] - ps / 2, cur[1] + ph], [cur[0] + ps, cur[1]]]
                                  : [[cur[0] + ps / 2, cur[1] - ph], [cur[0] + ps / 2, cur[1] + ph], [cur[0] - ps, cur[1]]];
                          } else {
                              var PQ = (typeof latticeOf === 'function' ? latticeOf() : null), pq = PQ && PQ.type === 'square' ? PQ.size : 50;
                              nbrs = [[cur[0] + pq, cur[1]], [cur[0] - pq, cur[1]], [cur[0], cur[1] + pq], [cur[0], cur[1] - pq]];
                          }
                          var best = null, bestD = Infinity;
                          for (var ni = 0; ni < nbrs.length; ni++) {
                              var d = Math.hypot(nbrs[ni][0] - mouseX, nbrs[ni][1] - mouseY);
                              if (d < bestD) { bestD = d; best = nbrs[ni]; }
                          }
                          if (!best || bestD >= Math.hypot(cur[0] - mouseX, cur[1] - mouseY) + 0.01) break;   // no progress: give up on the walk
                          cur = best;
                          if (Math.abs(cur[0] - mouseX) <= 0.5 && Math.abs(cur[1] - mouseY) <= 0.5) break;   // the target itself is pushed below
                          drawPoints.push([cur[0], cur[1]]);
                          if (cur[0] < drawMinX) drawMinX = cur[0]; if (cur[0] > drawMaxX) drawMaxX = cur[0];
                          if (cur[1] < drawMinY) drawMinY = cur[1]; if (cur[1] > drawMaxY) drawMaxY = cur[1];
                      }
                  }

                  drawPoints.push([mouseX, mouseY]);

                  if(mouseX < drawMinX) drawMinX = mouseX;

                  if(mouseX > drawMaxX) drawMaxX = mouseX;

                  if(mouseY < drawMinY) drawMinY = mouseY;

                  if(mouseY > drawMaxY) drawMaxY = mouseY;

              }



              var w = Math.max(10, drawMaxX - drawMinX);

              var h = Math.max(10, drawMaxY - drawMinY);

              currentDrawItem.style.left = drawMinX + 'px';

              currentDrawItem.style.top = drawMinY + 'px';

              currentDrawItem.style.width = w + 'px';

              currentDrawItem.style.height = h + 'px';



              var normPts = drawPoints.map(function(p){ return [p[0] - drawMinX, p[1] - drawMinY]; });
              var _PPd = window.wpPenPreset, _dtip = _PPd ? _PPd.tip : state.drawTip;   // the map builder: a Wall line previews as it will land
              var _dcol = _PPd ? _PPd.color : (state.drawColor || 'var(--ink)');
              var _dw = _PPd ? _PPd.strokeWidth : (state.drawStrokeWidth || 3);
              var _sp = window.wpBuildStrokePath ? window.wpBuildStrokePath(normPts, _dtip, _dw) : null;
              var _inner;
              if (_sp && _sp.fill) {
                  _inner = '<path fill="' + _dcol + '" stroke="none" d="' + _sp.d + '" />';
              } else if (_sp) {
                  _inner = '<path fill="none" stroke="' + _dcol + '" stroke-width="' + _sp.width + '" stroke-linecap="' + _sp.linecap + '" stroke-linejoin="' + _sp.linejoin + '" d="' + _sp.d + '" />';
              } else {
                  var pathD = 'M ' + normPts.map(function(p){ return p[0] + ' ' + p[1]; }).join(' L ');
                  _inner = '<path fill="none" stroke="' + _dcol + '" stroke-width="' + _dw + '" stroke-linecap="' + (_dtip === 'square' ? 'square' : 'round') + '" stroke-linejoin="' + (_dtip === 'square' ? 'miter' : 'round') + '" d="' + pathD + '" />';
              }
              currentDrawItem.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="overflow:visible;">' + _inner + '</svg>';

              e.preventDefault();

              return;

          }

          

          var P0 = window.__place;
          if (P0 && P0.on && P0.box) {
              var pb0 = wrapEl.getBoundingClientRect();
              var mx0 = wbX(e.clientX, e.clientY, pb0, wrapEl);
              var my0 = wbY(e.clientX, e.clientY, pb0, wrapEl);
              P0.box.style.left = Math.min(mx0, P0.sx) + 'px';
              P0.box.style.top = Math.min(my0, P0.sy) + 'px';
              P0.box.style.width = Math.abs(mx0 - P0.sx) + 'px';
              P0.box.style.height = Math.abs(my0 - P0.sy) + 'px';
              e.preventDefault();
              return;
          }
          if (isMarquee && marqueeBox) {
              var wrapBox = wrapEl.getBoundingClientRect();
              var mouseX = wbX(e.clientX, e.clientY, wrapBox, wrapEl);
              var mouseY = wbY(e.clientX, e.clientY, wrapBox, wrapEl);

              var x = Math.min(mouseX, marqueeStartX);
              var y = Math.min(mouseY, marqueeStartY);
              var w = Math.abs(mouseX - marqueeStartX);
              var h = Math.abs(mouseY - marqueeStartY);
              
              marqueeBox.style.left = x + 'px';
              marqueeBox.style.top = y + 'px';
              marqueeBox.style.width = w + 'px';
              marqueeBox.style.height = h + 'px';
              e.preventDefault();
              return;
          }
          if (!isPanning) return;

          var x = e.pageX - wrapEl.offsetLeft;

          var y = e.pageY - wrapEl.offsetTop;

          wrapEl.scrollLeft = scrollLeft - (x - startX);

          wrapEl.scrollTop = scrollTop - (y - startY);

          e.preventDefault();

      });

      window.addEventListener('pointerup', function(e) {
          var P1 = window.__place;
          if (P1 && P1.on) {
              var pw = parseFloat(P1.box.style.width) || 0, ph = parseFloat(P1.box.style.height) || 0;
              var px = parseFloat(P1.box.style.left) || P1.sx, py = parseFloat(P1.box.style.top) || P1.sy;
              P1.box.remove();
              window.__place = null;
              if (window.wpPlaceCommit) window.wpPlaceCommit(px, py, pw, ph, P1.sx, P1.sy);
              return;
          }
          if (isMarquee && marqueeBox) {
              isMarquee = false;
              var rect = marqueeBox.getBoundingClientRect();
              var mx = parseFloat(marqueeBox.style.left);
              var my = parseFloat(marqueeBox.style.top);
              var mw = parseFloat(marqueeBox.style.width);
              var mh = parseFloat(marqueeBox.style.height);
              marqueeBox.remove();
              marqueeBox = null;
              
              if (mw > 5 && mh > 5) selectItemsInMarquee(mx, my, mw, mh, e);   // 1.6.0 (found by hand): the one rule, so a player's sweep takes only what they may move
              return;
          }

          if (currentDrawItem && typeof window.isDrawingMode !== 'undefined' && window.isDrawingMode) {

              var allSame = drawPoints.every(p => p[0] === drawPoints[0][0] && p[1] === drawPoints[0][1]);

              if (drawPoints.length < 2 || allSame) {

                  currentDrawItem.remove();

                  currentDrawItem = null;

                  isPanning = false;

                  return;

              }

              var w = Math.max(10, drawMaxX - drawMinX);

              var h = Math.max(10, drawMaxY - drawMinY);

              var normalized = drawPoints.map(p => [(p[0] - drawMinX), (p[1] - drawMinY)]);

              

              var item = Object.assign({ id: 'wb'+uid(), type: 'path', x: drawMinX, y: drawMinY, w: w, h: h, baseW: w, baseH: h, z: 10, pts: normalized, color: (state.drawColor || 'var(--ink)'), strokeWidth: (state.drawStrokeWidth || 3), tip: (state.drawTip || 'round') }, (window.wpNewOpacityProps ? window.wpNewOpacityProps() : {}));
              if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') {
                  // a player's drawing: signed with their id so the host accepts it and only they (or the GM) can erase it
                  item.ownerId = window.wpNet.myId; item.byPlayer = true;
              }
              // [buildcheck:penpreset-start]
              // The map builder (fold B1c): a Wall line. The GM's stroke takes the Build tool's preset (its width, square tip, colour, layer and name,
              // and blocks sight as a wall or a door) on the machine that owns the campaign only. A player's stroke never does, whatever their window holds
              var PPw = window.wpPenPreset;
              if (PPw && !item.byPlayer && window.wpCanPersistLocal && window.wpCanPersistLocal()) {
                  item.strokeWidth = PPw.strokeWidth; item.tip = PPw.tip; item.color = PPw.color; item.layer = PPw.layer; item.name = PPw.name;
                  if (PPw.blocksSight === true) { item.blocksSight = true; item.sightType = PPw.sightType === 'door' ? 'door' : 'wall'; }
                  else if (PPw.barrier === true) item.barrier = true;   // backlog 23c: glass, chain-link and a force field drawn as a line
                  if (window.wpStructLaid) window.wpStructLaid([item]);   // 231: a wall, door or barrier line is locked in place as it is drawn
              }
              // [buildcheck:penpreset-end]
              if (PPw && item.sightType === 'door' && item.blocksSight === true && !item.byPlayer && typeof window.wpDoorCut === 'function') window.wpDoorCut(getActiveMap(), item);   // the map builder: a door drawn along a wall line cuts its doorway, in this stroke's own save
              getActiveMap().whiteboard.push(item);
              if (window.wpDrawShow) window.wpDrawShow.stamp(item, getActiveMap());   // 1.6.2: On the map or To show, as the pen says; never a Wall line of the Build tool, which stamp asks itself (a player's stroke is judged again by the host)

              currentDrawItem.remove();

              currentDrawItem = null;

              save(!!(window.wpNet && window.wpNet.active && window.wpNet.role === 'client')); render();   // fold M8: a player's stroke goes to the host at once
              if (item.blocksSight && window.wpFog && window.wpFog.invalidateVision) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }   // the map builder: a wall line blocks at once

          }

          

          isPanning = false;

          wrapEl.classList.remove('dragging-pan');

          if (typeof window.isDrawingMode === 'undefined' || !window.isDrawingMode) {

              // Hand tool keeps its grab; every other tool goes back to its own cursor
              wrapEl.style.cursor = window.isPanMode ? 'grab' : '';

          }

      });

      // The wheel zooms (toward the pointer); hold Shift to scroll the board instead.
      // Pan with the hand tool or middle-drag.
      wrapEl.addEventListener('wheel', function(e) {

          if (e.shiftKey && !e.ctrlKey) return;   // native scroll
          if (window.wpMouse && typeof window.wpMouse.gesture === 'function' && window.wpMouse.gesture('zoom') === 'ctrl' && !(e.ctrlKey || e.metaKey)) { e.preventDefault(); var wk = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? wrapEl.clientHeight : 1; wrapEl.scrollLeft += (e.shiftKey ? e.deltaY : e.deltaX) * wk; if (!e.shiftKey) wrapEl.scrollTop += e.deltaY * wk; return; }   // 1.6.2: zoom by Ctrl + wheel, and the plain wheel moves the map (the board has no scroll of its own)

          e.preventDefault();

          var zoomDelta = e.deltaY < 0 ? 0.05 : -0.05;

          setZoom(Math.round((state.zoomLevel + zoomDelta) * 100) / 100, e.clientX, e.clientY);

      }, {passive: false});

  }



  attachPanning(wrap);

  attachPanning(wbWrap);

  // Hold Space to pan from any tool (Figma/Photoshop-style): a temporary hand that grabs the board,
  // not its items — release restores the current tool and selection. Middle-drag and the hand tool
  // still pan too; this just makes a left-button pan reachable without leaving Select/Move (which
  // trackpads and two-button mice otherwise can't do over a busy map). CSS drives the grab cursor.
  window.wpSpacePan = false;
  window.addEventListener('keydown', function(e) {
      if (e.code !== 'Space' || e.repeat || window.wpSpacePan) return;
      var t = e.target;   // don't hijack Space from typing or a focused control (button activation, checkbox…)
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.tagName === 'BUTTON' || t.tagName === 'A' || t.isContentEditable)) return;
      var modalUp = Array.prototype.some.call(document.querySelectorAll('[id$="Modal"]'), function(m){ return m.style.display && m.style.display !== 'none'; });
      if (modalUp) return;   // a dialog is open; leave Space to it
      window.wpSpacePan = true; document.body.classList.add('space-pan'); e.preventDefault();   // no page scroll
  });
  window.addEventListener('keyup', function(e) {
      if (e.code !== 'Space' || !window.wpSpacePan) return;
      window.wpSpacePan = false; document.body.classList.remove('space-pan');
  });
  window.addEventListener('blur', function() { window.wpSpacePan = false; document.body.classList.remove('space-pan'); });   // never get stuck if focus leaves mid-hold





  /* ---------- Data Map Tools ---------- */

  // [roomcheck:page-start]
  // 1.6.2 (backlog 45, fold 1; the owner, 2026-11-11, by prompt: "Name ready, drag to link (Recommended)", "Double-click adds a room"). A room added
  // on the Data Map comes up selected with its name ready to type on its own box (roomRename: Enter or leaving keeps what was typed, Escape keeps
  // the name it had). A drag from the small handle on a room's right edge links it to the room it is let go on, or makes a new linked room where it
  // is let go on empty ground; a double-click on empty ground adds a room there. Each change is one save, so one Undo takes it back; a name typed
  // and kept within the half second a save waits joins that step, and one typed later is a step of its own. Only in the Data Map's Select tool, on
  // the machine that owns the campaign
  function roomMay() { return !(window.wpCanPersistLocal && !window.wpCanPersistLocal()) && !(window.wpNet && window.wpNet.foreign) && !window.wpStream; }
  function roomTool() { return !isLinkMode() && !document.body.classList.contains('data-pan') && !window.wpSpacePan && state.viewMode === 'data'; }   // the Data Map's own Pan (body.data-pan), never the play map's flag (the review)
  function dataPt(e) { var rb = wrap.getBoundingClientRect(); return { x: wbX(e.clientX, e.clientY, rb, wrap), y: wbY(e.clientX, e.clientY, rb, wrap) }; }   // the board's one reading of a pointer
  function roomOf(am, id) { return am && Array.isArray(am.rooms) ? am.rooms.find(function(x) { return x && x.id === id; }) || null : null; }
  function roomAddAt(x, y, from) {
      var am = getActiveMap(); if (!am || am.type !== 'map' || !roomMay()) return null;
      if (!Array.isArray(am.rooms)) am.rooms = []; if (!Array.isArray(am.links)) am.links = [];
      var p = { x: x, y: y };
      if (state.snap) for (var k = 0; k < 40; k++) {   // Snap: the first place on the grid, stepping down and right, that no room stands on (the review: a step of 24 left it off the grid)
          var q = getSnapCoords(x + k * 24, y + k * 24); if (q.x < 10 || q.y < 10) continue;   // the check: a grid point the room could not stand on
          p = q; var f = RC.freeSpot(am.rooms, q.x, q.y);
          if (f.x === Math.round(q.x) && f.y === Math.round(q.y)) break;   // none clear in 40 steps: the last grid point tried
      }
      var rm = RC.newRoom(uid(), am.rooms, am.cats, p.x, p.y);
      am.rooms.push(rm);
      var lk = from && roomOf(am, from) ? RC.linkAdd(am.links, from, rm.id, state.linkType) : null;
      state.selId = rm.id; state.selLink = null; state.linkStart = null;
      save(); render();
      roomRename(rm.id);
      return { room: rm, link: lk };
  }
  function roomRename(id) {
      var el = state.els && state.els[id], am = getActiveMap(), rm = roomOf(am, id);
      if (!el || !rm || !roomMay()) return null;
      var had = el.querySelector('.rn-edit'); if (had) { had.focus(); return had; }
      var inp = document.createElement('input'), mapId = am.id, done = false;
      inp.type = 'text'; inp.className = 'rn-edit'; inp.value = rm.name || ''; inp.maxLength = RC.NAME_MAX; inp.spellcheck = false; inp.setAttribute('aria-label', 'Room name');
      el.classList.add('renaming'); var rc = el.querySelector('.rc'); if (rc && rc.parentNode === el) el.insertBefore(inp, rc); else el.appendChild(inp);   // in the name's own place, above the category
      // blur: a press elsewhere moved the focus. The whole app is not drawn again then (the review): Properties would be rebuilt under the press and
      // lose it, leaving the focus on the page, where Backspace deletes the room selected. Only the room's box and the name field follow
      function end(keep, blur) {
          if (done) return; done = true;
          el.classList.remove('renaming'); if (inp.parentNode) inp.parentNode.removeChild(inp);
          var am2 = getActiveMap(), rr = am2 && am2.id === mapId ? roomOf(am2, id) : null;
          if (keep && rr) { var nm = RC.roomNameOf(inp.value, rr.name); if (nm !== rr.name) { rr.name = nm; save(); } }
          if (!blur) { render(); return; }
          var rnE = el.querySelector('.rn'); if (rnE && rr) rnE.textContent = rr.name || '(unnamed)';   // the check: never renderDataMap here either, which builds every link again under a press on one
          var fN = document.getElementById('fName'); if (fN && rr && state.selId === id) fN.value = rr.name;
          if (window.wpDataFind && typeof window.wpDataFind.apply === 'function') window.wpDataFind.apply();   // fold 2: a name typed may now be found (classes only, nothing built again)
      }
      inp.addEventListener('keydown', function(e) { e.stopPropagation(); if (e.isComposing) return; if (e.key === 'Enter') { e.preventDefault(); end(true); } else if (e.key === 'Escape') { e.preventDefault(); end(false); } });   // Enter that ends a composition is the composition's
      inp.addEventListener('blur', function() { if (typeof document.hasFocus === 'function' && !document.hasFocus()) return; end(true, true); });   // the window losing the focus leaves the box open: the focus comes back to it
      ['pointerdown', 'mousedown', 'click', 'dblclick', 'contextmenu'].forEach(function(ev) { inp.addEventListener(ev, function(e) { e.stopPropagation(); }); });
      inp.focus(); if (typeof inp.select === 'function') inp.select();
      return inp;
  }
  // [roomcheck:faces-start]
  function roomFacesDraw(box, f) {   // under the room's name, as the owner's picked mock-up drew it; the box's last strip goes first
      var old = box && box.querySelector ? box.querySelector('.room-faces') : null; if (old && old.parentNode) old.parentNode.removeChild(old);
      if (!box || !f || !f.faces || !f.faces.length) return;
      var strip = document.createElement('div'); strip.className = 'room-faces';
      var names = [];
      f.faces.forEach(function(x) {
          var s = document.createElement('span'); s.className = 'rf' + (x.here ? ' rf-here' : '') + (x.hidden ? ' rf-hidden' : '');
          var src = typeof picRef === 'function' && !(typeof window !== 'undefined' && window.wpNet && window.wpNet.foreign) ? picRef(x.pic) : '';   // the review: a player's app has no file of the GM's
          if (src) { var im = document.createElement('img'); im.src = src; im.alt = ''; s.appendChild(im); }
          else s.textContent = String(x.name || '?').trim().charAt(0).toUpperCase() || '?';
          strip.appendChild(s); names.push(x.name + (x.here ? '' : ' (expected)'));
      });
      if (f.more > 0) { var m = document.createElement('span'); m.className = 'rf-more'; m.textContent = '+' + f.more; strip.appendChild(m); names.push(f.more + ' more'); }
      strip.dataset.tip = names.join(', ');
      box.appendChild(strip);
  }
  // [roomcheck:faces-end]
  // [roomcheck:place-start]
  // 1.6.2 (backlog 45, fold 3): Place it on a room with no place. A press on it is no press on the room: nothing is dragged or selected again
  function roomNpWire(el) {
      var b = el.querySelector('.rnp-go'); if (!b) return;
      ['pointerdown', 'mousedown', 'dblclick'].forEach(function(ev) { b.addEventListener(ev, function(e) { e.stopPropagation(); }); });
      b.addEventListener('click', function(e) { e.stopPropagation(); e.preventDefault(); if (window.wpRoomPlace) window.wpRoomPlace(el.dataset.id); });
  }
  // From the Data Map to the play map: the view switched, the room's place selected and in the middle of the view. Answers what was said
  function roomShowPlay(roomId) {
      var am = getActiveMap(); if (!am || am.type !== 'map') return '';
      var room = (am.rooms || []).find(function(r) { return r.id === roomId; }); if (!room) return '';
      var w = RC.roomPlaceOf(am, roomId); if (!w) return 'This room has no place on the play map yet. Press Place it to draw one.';
      am.meta = am.meta || {}; am.meta.lastWbX = w.x + (w.w || 100) / 2; am.meta.lastWbY = w.y + (w.h || 100) / 2;
      if (window.wpSetViewMode) window.wpSetViewMode('visual');
      state.selId = null; state.selWbId = w.id; state.selWbIds = [w.id];
      if (window.appRender) window.appRender(); if (window.appRestoreCamera) window.appRestoreCamera();
      return '';
  }
  // From the play map to the Data Map: the piece's room selected and in the middle of the view
  function roomShowData(pieceId) {
      var am = getActiveMap(); if (!am || am.type !== 'map') return '';
      var w = (am.whiteboard || []).find(function(x) { return x.id === pieceId; }), room = w && w.nodeId ? (am.rooms || []).find(function(r) { return r.id === w.nodeId; }) : null;
      if (!room) return 'That piece names no room on the Data Map.';
      am.meta = am.meta || {}; am.meta.lastX = (room.x || 0) + 70; am.meta.lastY = (room.y || 0) + 30;
      if (window.wpSetViewMode) window.wpSetViewMode('data');
      state.selWbId = null; state.selWbIds = []; state.selId = room.id;
      if (window.appRender) window.appRender(); if (window.appRestoreCamera) window.appRestoreCamera();
      return '';
  }
  // From a room's Here now to the token itself: the play map, the token selected and in the middle
  function tokShowPlay(tokId) {
      var am = getActiveMap(); if (!am || am.type !== 'map') return '';
      var w = (am.whiteboard || []).find(function(x) { return x.id === tokId; }); if (!w) return 'That token is no longer on this map.';
      am.meta = am.meta || {}; am.meta.lastWbX = w.x + (w.w || 100) / 2; am.meta.lastWbY = w.y + (w.h || 100) / 2;
      if (window.wpSetViewMode) window.wpSetViewMode('visual');
      state.selId = null; state.selWbId = w.id; state.selWbIds = [w.id];
      if (window.appRender) window.appRender(); if (window.appRestoreCamera) window.appRestoreCamera();
      return '';
  }
  window.wpRoomShowPlay = roomShowPlay; window.wpRoomShowData = roomShowData; window.wpTokShowPlay = tokShowPlay;
  // [roomcheck:place-end]
  var _rlink = null;   // the link being dragged from a room's handle: { from, mapId, sx, sy, moved, line }
  function roomLinkStart(id, e) {
      if (_rlink || !roomTool() || !roomMay()) return false;
      var am = getActiveMap(), rm = roomOf(am, id); if (!rm) return false;
      var el = state.els && state.els[id], cw = el && el.offsetWidth ? el.offsetWidth : RC.ROOM_W, ch = el && el.offsetHeight ? el.offsetHeight : RC.ROOM_H;
      var ln = document.createElementNS('http://www.w3.org/2000/svg', 'line'), ox = rm.x + cw, oy = rm.y + ch / 2;
      ln.setAttribute('class', 'link-draft'); ln.setAttribute('x1', ox); ln.setAttribute('y1', oy); ln.setAttribute('x2', ox); ln.setAttribute('y2', oy);
      _rlink = { from: id, mapId: am.id, sx: e.clientX, sy: e.clientY, moved: false, line: ln };
      svg.appendChild(ln);
      document.body.classList.add('room-linking');
      if (el) el.classList.add('linkstart');
      return true;
  }
  function roomLinkMove(e) {
      var d = _rlink; if (!d) return;
      if (e.buttons === 0) { roomLinkEnd(e, true); return; }   // the check: no button held any more, so a release the page never heard let it go
      if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
      d.moved = true;
      var p = dataPt(e);
      if (!d.line.parentNode) svg.appendChild(d.line);   // the board was drawn again meanwhile: the line goes back on it
      d.line.setAttribute('x2', p.x); d.line.setAttribute('y2', p.y);
      var t = document.elementFromPoint(e.clientX, e.clientY), over = t && t.closest ? t.closest('#canvas .room') : null;
      if (over && over.dataset.id === d.from) over = null;
      if (d.over && d.over !== over) d.over.classList.remove('room-target');
      if (over) over.classList.add('room-target');
      d.over = over;
  }
  function roomOnLink(t) { var c = !!t && !!t.closest ? t.closest('.edge-del') : null; return !!c && ['near', 'labelled', 'sel'].some(function(k) { return c.classList.contains(k); }); }   // a link's chip in sight (the check: the wide hit stroke along a line, and a chip not shown, are ground)
  function roomGround(t) { return !!t && !roomOnLink(t) && (t === wrap || t === canvas || t === svg || (!!t.closest && !!t.closest('#canvasWrap') && !t.closest('.room'))); }
  function roomLinkEnd(e, cancel) {
      var d = _rlink; if (!d) return ''; _rlink = null;
      if (d.line.parentNode) d.line.parentNode.removeChild(d.line);
      if (d.over) d.over.classList.remove('room-target');
      document.body.classList.remove('room-linking');
      var am = getActiveMap();
      if (cancel || !am || am.id !== d.mapId || !roomOf(am, d.from)) { render(); return 'none'; }
      if (!d.moved) { state.selId = d.from; state.selLink = null; render(); return 'picked'; }   // a press that dragged nothing picks the room, as a click on it does
      var t = document.elementFromPoint(e.clientX, e.clientY), roomEl = t && t.closest ? t.closest('#canvas .room') : null;
      if (roomEl && roomEl.dataset.id === d.from) { render(); return 'none'; }
      if (roomEl && roomOf(am, roomEl.dataset.id)) {
          if (!Array.isArray(am.links)) am.links = [];
          var lk = RC.linkAdd(am.links, d.from, roomEl.dataset.id, state.linkType);
          if (!lk) { render(); return 'none'; }
          if (lk.had) { selectLink(lk.at); toast('These rooms are already linked.'); return 'had'; }
          state.selLink = lk.at; state.selId = null; save(); render(); if (window.wpSyncRightPanel) setTimeout(window.wpSyncRightPanel, 0);
          toast('Rooms linked: ' + (LINK_TYPES[state.linkType] || LINK_TYPES['']).label + '.');
          return 'linked';
      }
      if (roomGround(t)) { var p = dataPt(e); roomAddAt(p.x - RC.ROOM_W / 2, p.y - RC.ROOM_H / 2, d.from); return 'new'; }
      if (roomOnLink(t)) { render(); toast('Let go on a room to link it, or on empty ground for a new room.'); return 'none'; }
      render(); return 'none';
  }
  canvas.addEventListener('pointerdown', function(e) {   // the capture phase: the room under the handle never starts its own drag
      var h = e.target && e.target.closest ? e.target.closest('.rlink') : null; if (!h) return;
      if (e.button !== undefined && e.button !== 0) return;
      var el = h.closest('.room'); if (!el) return;
      if (roomLinkStart(el.dataset.id, e)) { e.stopPropagation(); e.preventDefault(); }
  }, true);
  document.addEventListener('pointermove', roomLinkMove);
  document.addEventListener('pointerup', function(e) { if (_rlink) roomLinkEnd(e, false); });
  document.addEventListener('pointercancel', function(e) { if (_rlink) roomLinkEnd(e, true); });
  document.addEventListener('keydown', function(e) { if (_rlink && e.key === 'Escape' && (!window.wpEsc || window.wpEsc.free(e))) { e.preventDefault(); roomLinkEnd(e, true); } });
  window.addEventListener('blur', function() { if (_rlink) roomLinkEnd({ clientX: 0, clientY: 0 }, true); });   // the window lost mid-drag: the release is never heard, so the drag is let go
  wrap.addEventListener('dblclick', function(e) {
      var t = e.target; if (!(t === wrap || t === canvas || t === svg) || !roomTool()) return;
      e.preventDefault();
      var p = dataPt(e); roomAddAt(p.x - RC.ROOM_W / 2, p.y - RC.ROOM_H / 2);
  });
  window.wpRoomAdd = { at: roomAddAt, rename: roomRename };
  // [roomcheck:page-end]
  // [roomcheck:find-start]
  // 1.6.2 (backlog 45, fold 2; the owner, 2026-11-11, by prompt: "A. Strip along the top (Recommended)", "Dimmed, still usable (Recommended)"):
  // one strip along the top of the Data Map, the GM's, between the minimap and the zoom box. Its Find box reads each room's name, notes and who is
  // there (roomcore roomMatch); a chip a category (catsUsed) shows only the rooms of the chips pressed. A room that does not stand out is dimmed and
  // stays usable, its links fade with it, and a room the words find is lit. Enter goes to the next one found, selects it and centres it. Nothing
  // of it is stored: the words and the chips are this screen's, let go when another map is on screen
  var _df = { mapId: null, q: '', picked: [], at: -1, sig: '' };
  function dataFindMay() { return state.viewMode === 'data' && !window.wpStream && !(window.wpNet && window.wpNet.foreign); }
  // The strip stands in the row of the minimap and the zoom box, between them, past the left ruler; where that leaves it too little room (a
  // narrow area, the minimap under the zoom box) it takes a row of its own under the zoom box, as wide as the area (the review: it slid under the
  // zoom box). Its top row follows the style sheet (26 px, 8 with no rulers, under a hidden top row's bar)
  var DF_MIN = 220;
  function dataFindPlace() {
      var bar = document.getElementById('dataFind'), main = document.getElementById('main'); if (!bar || !main || bar.hidden) return;
      var body = document.body, mb = main.getBoundingClientRect(), mm = document.getElementById('minimap'), zb = document.getElementById('zoomBox');
      var base = body && body.classList && body.classList.contains('no-rulers') ? 8 : 44, left = base, right = 8;
      var box = function(el) { if (!el) return null; var rr = el.getBoundingClientRect(); return rr.width > 0 && rr.height > 0 ? rr : null; };
      var zr = box(zb), mr = box(mm), row = zr ? zr.top : mb.top + 26;
      if (mr && Math.abs(mr.top - row) < 20) left = Math.max(left, Math.round(mr.right - mb.left + 8));   // only a minimap in the strip's own row
      if (zr) right = Math.max(right, Math.round(mb.right - zr.left + 8));
      bar.style.top = '';
      if (mb.width - left - right < DF_MIN && (zr || mr)) {   // a row of its own under the zoom box, and under an open minimap that stands in that row (main.js cornerFit's mm-under: the review)
          var top = (zr || mr).bottom + 8; left = base; right = 8;
          if (mr && mr.bottom > top - 4 && mr.top < top + 40) {   // an open minimap in that row: beside it where there is room, else under it
              if (mb.right - mr.right - 16 >= DF_MIN) left = Math.round(mr.right - mb.left + 8); else top = mr.bottom + 8;
          }
          bar.style.top = Math.round(top - mb.top) + 'px';
      }
      bar.style.left = left + 'px'; bar.style.right = right + 'px';
      dataFindMore();
  }
  function dataFindMore() {   // the chips past the strip's end are faded at its edge, so the GM sees there are more (the review)
      var ch = document.getElementById('dataFindChips'); if (!ch || !ch.classList) return;
      ch.classList.toggle('df-more-r', ch.scrollWidth - ch.scrollLeft - ch.clientWidth > 2); ch.classList.toggle('df-more-l', ch.scrollLeft > 2);
  }
  function dataFindSync() {
      var bar = document.getElementById('dataFind'), box = document.getElementById('dataFindBox'), chips = document.getElementById('dataFindChips'), am = getActiveMap();
      if (!bar || !box || !chips) return;
      var on = dataFindMay() && !!am && am.type === 'map' && Array.isArray(am.rooms) && am.rooms.length > 0;
      if (am && am.id !== _df.mapId) { _df = { mapId: am.id, q: '', picked: [], at: -1, sig: '' }; box.value = ''; }
      var was = bar.hidden; bar.hidden = !on;
      if (!on) return;
      var used = RC.catsUsed(am.rooms, am.cats), keys = used.map(function(c) { return c.key; });
      _df.picked = _df.picked.filter(function(k) { return keys.indexOf(k) >= 0; });
      var sig = JSON.stringify(used) + '|' + _df.picked.join(',');
      if (sig !== _df.sig) {   // the chips are made again only when the categories or their counts change
          _df.sig = sig; chips.textContent = '';
          if (used.length > 1) used.forEach(function(c) {
              var b = document.createElement('button'), dot = document.createElement('span'), nm = document.createElement('span'), n = document.createElement('span');
              b.type = 'button'; b.className = 'df-chip' + (_df.picked.indexOf(c.key) >= 0 ? ' on' : ''); b.dataset.cat = c.key; b.setAttribute('aria-pressed', _df.picked.indexOf(c.key) >= 0 ? 'true' : 'false');
              b.title = 'Dims every room of another category. Press another chip to keep its rooms too.'; b.setAttribute('aria-label', c.label + ', ' + c.n + (c.n === 1 ? ' room' : ' rooms'));
              dot.className = 'df-dot'; dot.style.backgroundColor = cssColor(c.color, '#888'); nm.textContent = c.label; n.className = 'df-n'; n.textContent = String(c.n);   // the review: a colour from a file, checked
              b.appendChild(dot); b.appendChild(nm); b.appendChild(n); chips.appendChild(b);
          });
      }
      dataFindApply();
      if (was) dataFindPlace();   // its place is measured as it shows, and again when a box beside it changes (observers below), never at each drawing of a drag
      else dataFindMore();
  }
  function dataFindApply() {
      var am = getActiveMap(), nEl = document.getElementById('dataFindN'); if (!am || !Array.isArray(am.rooms)) return { hits: [] };
      var busy = !!RC.queryWords(_df.q).length || _df.picked.length > 0, hits = [], shownIds = {};
      am.rooms.forEach(function(rm) {
          if (!rm) return;
          var st = RC.roomShown(rm, _df.q, _df.picked, am.cats), el = state.els && state.els[rm.id];
          if (st.shown) shownIds[rm.id] = 1;
          if (st.hit) hits.push(rm);
          if (el) { el.classList.toggle('df-dim', busy && !st.shown); el.classList.toggle('df-hit', st.hit); }
      });
      document.querySelectorAll('#edges [data-a], #canvas .edge-del[data-a]').forEach(function(e) { e.classList.toggle('df-dim', busy && !(shownIds[e.getAttribute('data-a')] && shownIds[e.getAttribute('data-b')])); });
      if (nEl) { nEl.textContent = RC.queryWords(_df.q).length ? hits.length + ' of ' + am.rooms.length : ''; nEl.setAttribute('aria-label', nEl.textContent ? nEl.textContent + ' rooms found' : ''); }
      return { hits: hits };
  }
  function dataFindNext(back) {   // Enter: the next room found, in reading order, selected and centred
      var am = getActiveMap(); if (!am) return null;
      var hits = dataFindApply().hits.slice().sort(function(a, b) { return (a.y - b.y) || (a.x - b.x); }); if (!hits.length) return null;
      _df.at = _df.at < 0 && back ? hits.length - 1 : (_df.at + (back ? -1 : 1) + hits.length) % hits.length;   // the review: Shift+Enter first goes to the last
      var rm = hits[_df.at], say = document.getElementById('dataFindSay'); if (say) say.textContent = (rm.name || 'A room') + ', ' + (_df.at + 1) + ' of ' + hits.length;
      var el = state.els && state.els[rm.id], z = state.zoomLevel || 1;
      var w = el && el.offsetWidth ? el.offsetWidth : RC.ROOM_W, h = el && el.offsetHeight ? el.offsetHeight : RC.ROOM_H;
      wrap.scrollLeft = (rm.x + w / 2) * z - wrap.clientWidth / 2; wrap.scrollTop = (rm.y + h / 2) * z - wrap.clientHeight / 2;
      state.selId = rm.id; state.selLink = null; render();
      return rm;
  }
  (function dataFindWire() {
      var box = document.getElementById('dataFindBox'), chips = document.getElementById('dataFindChips'), t = 0;
      if (box) {
          box.addEventListener('input', function() { clearTimeout(t); t = setTimeout(function() { _df.q = box.value; _df.at = -1; dataFindApply(); }, 120); });
          box.addEventListener('keydown', function(e) {
              if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'k') return;   // quick jump opens from here as from any field (the review)
              e.stopPropagation();   // keys typed here are the box's: never the page's Delete or a command's letter
              if (e.isComposing) return;
              if (e.key === 'Enter') { e.preventDefault(); clearTimeout(t); if (box.value !== _df.q) { _df.q = box.value; _df.at = -1; } dataFindNext(e.shiftKey); }   // new words start from their first room (the review)
              else if (e.key === 'Escape') { e.preventDefault(); if (box.value) { box.value = ''; _df.q = ''; _df.at = -1; dataFindApply(); } else box.blur(); }
          });
      }
      if (chips) chips.addEventListener('click', function(e) {
          var b = e.target && e.target.closest ? e.target.closest('.df-chip') : null; if (!b) return;
          var k = b.dataset.cat, i = _df.picked.indexOf(k);
          if (i >= 0) _df.picked.splice(i, 1); else _df.picked.push(k);
          _df.at = -1; dataFindSync();
          var nb = chips.querySelector('.df-chip[data-cat="' + (window.CSS && CSS.escape ? CSS.escape(k) : k) + '"]'); if (nb) nb.focus();   // the chips are made again: the focus stays on the one pressed
      });
      if (window.ResizeObserver) { var ro = new ResizeObserver(function() { dataFindPlace(); }); ['minimap', 'zoomBox', 'main'].forEach(function(id) { var el = document.getElementById(id); if (el) ro.observe(el); }); }
      if (window.MutationObserver && document.body) new MutationObserver(function() { dataFindPlace(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] });   // the minimap moved under the zoom box, the rulers or the top row hidden: a class of the body, with no size changed
      window.addEventListener('resize', dataFindPlace);
      if (chips) {
          chips.addEventListener('wheel', function(e) { if (chips.scrollWidth <= chips.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; chips.scrollLeft += e.deltaY; e.preventDefault(); dataFindMore(); }, { passive: false });   // a mouse wheel moves the chips sideways (the review)
          chips.addEventListener('scroll', dataFindMore);
      }
  })();
  window.wpDataFind = { sync: dataFindSync, apply: dataFindApply, next: dataFindNext, place: dataFindPlace };
  // [roomcheck:find-end]
  var _el_addBtn = document.getElementById('addBtn');
if(_el_addBtn) _el_addBtn.addEventListener('click', function(){
      var cx = (wrap.scrollLeft + wrap.clientWidth/2) / state.zoomLevel - 60;
      var cy = (wrap.scrollTop + wrap.clientHeight/2) / state.zoomLevel - 20;
      roomAddAt(cx, cy);   // 1.6.2 (backlog 45): selected, its name ready to type, never on top of the last one
  });

  function isLinkMode(){ return document.body.classList.contains('linkmode'); }

  // Data-map tools are one exclusive group: Select/Move (default), Pan, Link.
  function setDataTool(id) {
      ['dataMoveBtn', 'dataPanBtn', 'linkBtn'].forEach(function(b) {
          var el = document.getElementById(b);
          if (el) el.classList.toggle('active', b === id);
      });
      window.isPanMode = (id === 'dataPanBtn');
      document.body.classList.toggle('linkmode', id === 'linkBtn');
      if (id !== 'linkBtn') { state.linkStart = null; var lmT = document.getElementById('linkMenu'); if (lmT) lmT.classList.remove('show'); }
      var cw = document.getElementById('canvasWrap');
      if (cw) cw.style.cursor = (id === 'dataPanBtn') ? 'grab' : 'default';
      document.body.classList.toggle('data-pan', id === 'dataPanBtn');
  }
  function setLinkMode(on){ setDataTool(on ? 'linkBtn' : 'dataMoveBtn'); }

  var _el_linkBtn = document.getElementById('linkBtn');

if(_el_linkBtn) _el_linkBtn.addEventListener('click',function(e){
      e.stopPropagation();
      var lm = document.getElementById('linkMenu');
      if (!isLinkMode()) { setLinkMode(true); render(); if (lm) { syncLinkMenu(); lm.classList.add('show'); } }
      else if (lm) { syncLinkMenu(); lm.classList.toggle('show'); }   // the Select tool (or Done linking) leaves link mode
  });

  var _el_dataMoveBtn = document.getElementById('dataMoveBtn');
  if (_el_dataMoveBtn) _el_dataMoveBtn.addEventListener('click', function() { setDataTool('dataMoveBtn'); render(); });
  var _el_dataPanBtn = document.getElementById('dataPanBtn');
  if (_el_dataPanBtn) _el_dataPanBtn.addEventListener('click', function() { setDataTool('dataPanBtn'); render(); });
  setDataTool('dataMoveBtn');   // never start in Link mode

  var _el_dataClearBtn = document.getElementById('dataClearBtn');
  if (_el_dataClearBtn) _el_dataClearBtn.addEventListener('click', function() {
      var m = getActiveMap();
      if (!m || m.type !== 'map') return;
      showConfirm('Clear every node and link on this data map? (Undo can bring them back.)', function(yes) {
          if (!yes) return;
          pushHistory();
          m.rooms = []; m.links = []; state.selId = null; state.linkStart = null;
          save(); render();
          import('./io.js').then(function(io) { io.toast('Data map cleared.'); });
      });
  });

  var _el_snapBtn = document.getElementById('snapBtn');

if(_el_snapBtn) {
    // Snap is one preference for both boards (wp_snap); this button shows and saves it too
    try { state.snap = localStorage.getItem('wp_snap') === '1'; } catch(e) {}
    var syncDataSnap = function() {
        _el_snapBtn.title = state.snap ? 'Snap to grid: on' : 'Snap to grid: off';   // keep the magnet icon; state shows as the active highlight + tooltip
        _el_snapBtn.classList.toggle('on', !!state.snap);
        _el_snapBtn.classList.toggle('active', !!state.snap);
        var wb = document.getElementById('wbSnapBtn'); if (wb) wb.classList.toggle('active', !!state.snap);
    };
    syncDataSnap();
    _el_snapBtn.addEventListener('click', function() {
        state.snap = !state.snap;
        try { localStorage.setItem('wp_snap', state.snap ? '1' : '0'); } catch(e) {}
        syncDataSnap();
        if (window.wpNet && window.wpNet.syncSnap) window.wpNet.syncSnap();   // the snap rule: a host's Snap is the table's
    });
}

  function removeLinkAt(i) {

      getActiveMap().links.splice(i,1); state.selLink = null; save(); render(); toast('Link removed');

  }



  /* ---------- Whiteboard Tools ---------- */

export {

    renderDataMap,

    clearSnaps,

    drawSnap,

    doSmartSnapping,

    attachDrag,

    attachPanning,

    isLinkMode,

    setLinkMode,

    removeLinkAt,

    snapToHex,

    getSnapCoords

};



var _el_dataCenterBtn = document.getElementById('dataCenterBtn');
var _el_dataCenterMenu = document.getElementById('dataCenterMenu');
var _el_dataCenterCanvasBtn = document.getElementById('dataCenterCanvasBtn');
var _el_dataCenterItemsBtn = document.getElementById('dataCenterItemsBtn');

if(_el_dataCenterBtn) _el_dataCenterBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    var m = getActiveMap(); if(!m) return;
    var hasItems = m.rooms && m.rooms.length > 0;
    if(!hasItems) {
        _el_dataCenterItemsBtn.style.opacity = '0.5';
        _el_dataCenterItemsBtn.style.pointerEvents = 'none';
    } else {
        _el_dataCenterItemsBtn.style.opacity = '1';
        _el_dataCenterItemsBtn.style.pointerEvents = 'auto';
    }
    if(_el_dataCenterMenu) _el_dataCenterMenu.classList.toggle('show');
});

if(_el_dataCenterCanvasBtn) _el_dataCenterCanvasBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    var wrap = document.getElementById('canvasWrap');
    wrap.scrollLeft = (15000 * state.zoomLevel) - wrap.clientWidth/2;
    wrap.scrollTop = (15000 * state.zoomLevel) - wrap.clientHeight/2;
    if(_el_dataCenterMenu) _el_dataCenterMenu.classList.remove('show');
    toast('Camera centered on canvas.');
});

if(_el_dataCenterItemsBtn) _el_dataCenterItemsBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    var m = getActiveMap(); if(!m) return;
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    (m.rooms||[]).forEach(function(i) {
        if(i.x < minX) minX = i.x;
        if(i.y < minY) minY = i.y;
        if(i.x + (i.w||100) > maxX) maxX = i.x + (i.w||100);
        if(i.y + (i.h||100) > maxY) maxY = i.y + (i.h||100);
    });
    if(minX !== Infinity) {
        var wrap = document.getElementById('canvasWrap');
        var curCenterX = minX + (maxX - minX)/2;
        var curCenterY = minY + (maxY - minY)/2;
        wrap.scrollLeft = (curCenterX * state.zoomLevel) - wrap.clientWidth/2;
        wrap.scrollTop = (curCenterY * state.zoomLevel) - wrap.clientHeight/2;
        toast('Camera centered on items.');
    }
    if(_el_dataCenterMenu) _el_dataCenterMenu.classList.remove('show');
});

var _el_dataFitBtn = document.getElementById('dataFitBtn');
if(_el_dataFitBtn) _el_dataFitBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if(window.wpFitView) window.wpFitView(false);   // frame every room (zoom + pan)
    if(_el_dataCenterMenu) _el_dataCenterMenu.classList.remove('show');
});

document.addEventListener('click', function(e) {
    if(_el_dataCenterMenu && e.target !== _el_dataCenterBtn && !e.target.closest('#dataCenterMenu')) {
        _el_dataCenterMenu.classList.remove('show');
    }
});

var _el_dataUndoBtn = document.getElementById('dataUndoBtn');

if(_el_dataUndoBtn) _el_dataUndoBtn.addEventListener('click', function() { undo(); });

var _el_dataRedoBtn = document.getElementById('dataRedoBtn');

if(_el_dataRedoBtn) _el_dataRedoBtn.addEventListener('click', function() { redo(); });

