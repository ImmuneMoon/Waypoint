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



var wrap = document.getElementById('canvasWrap');

var wbWrap = document.getElementById('whiteboardWrap');

var canvas = document.getElementById('canvas');

var svg = document.getElementById('edges');

import { state, dom } from './state.js';

import { uid, clone, createNewCampaign, createNewMap, createNewPlanner, getActiveCampaign, getActiveMap, findLandingRoom } from './models.js';

import { load, updateUndoBtn, pushHistory, undo, redo, save, download, getBase64Image } from './io.js';

import { updateCampaignSelect, updateSidebarNav } from './sidebar.js';

import { showPrompt, showConfirm, isCampaignNameTaken, getUniqueCampaignTitle, promptForCampaignName, isItemNameTaken, getUniqueItemTitle, promptForItemName } from './dialogs.js';

import { renderPlanner, renderPlannerPreview } from './planner.js';

import { renderWhiteboard, attachResizeHandle, attachRotateHandle, addWbItem, uploadImageFile } from './whiteboard.js';

import { getRoomInspectorHtml, attachRoomInspectorEvents, renderInspector,  renderElementList, esc } from './inspector.js';



  function renderDataMap(){

    var activeMap = getActiveMap();

    if(!activeMap || !activeMap.rooms) return;

    

    var seen={};

    activeMap.rooms.forEach(function(r){

      seen[r.id]=1;

      var el=state.els[r.id];

      if(!el){

        el=document.createElement('div');

        el.className='room'; el.dataset.id=r.id;

        el.innerHTML='<div class="rn"></div><div class="rc"></div><div class="badges"></div>';

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

      var c=activeMap.cats[r.cat]||activeMap.cats[defaultCat]||{label:'Unknown',color:'#000'};

      el.style.left=r.x+'px'; el.style.top=r.y+'px';

      el.style.borderLeftColor=c.color;

      el.querySelector('.rn').textContent=r.name||'(unnamed)';

      var rc=el.querySelector('.rc'); rc.textContent=c.label; rc.style.color=c.color;

      el.classList.toggle('sel', r.id===state.selId);

      el.classList.toggle('linkstart', r.id===state.linkStart);

      

      var badges = el.querySelector('.badges');

      badges.innerHTML = '';

      if (r.icon) {

          var em = {'Stairs Up':'🪜↑', 'Stairs Down':'🪜↓', 'Door':'🚪', 'Gate':'⛩️', 'Cave':'🦇', 'Tower':'🗼', 'Camp':'⛺'}[r.icon] || r.icon.substring(0,2);

          badges.innerHTML += '<div class="badge-char" style="background:var(--blue); font-size:12px; margin-right:4px;" title="'+r.icon+'">'+em+'</div>';

      }

      if(r.characters && r.characters.length > 0) {

          badges.innerHTML += '<div class="badge-char" title="'+r.characters.length+' character(s)">'+r.characters.length+'</div>';

      }

    });

    Object.keys(state.els).forEach(function(id){ if(!seen[id]){ state.els[id].remove(); delete state.els[id]; } });

    

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

      

      var ln=document.createElementNS('http://www.w3.org/2000/svg','line');

      ln.setAttribute('x1',cA.x);ln.setAttribute('y1',cA.y);

      ln.setAttribute('x2',cB.x);ln.setAttribute('y2',cB.y);

      var lt = LINK_TYPES[lk[2]] ? (lk[2] || '') : '';
      ln.setAttribute('class', 'edge' + (lt ? ' ' + lt : ''));
      if (lt === 'oneway') {   // stop at the card's edge so the arrowhead shows
          ensureArrowMarker(svg);
          var dxA = cB.x - cA.x, dyA = cB.y - cA.y, hwA = b.offsetWidth / 2 + 4, hhA = b.offsetHeight / 2 + 4;
          var tA = Math.min(dxA ? Math.abs(hwA / dxA) : Infinity, dyA ? Math.abs(hhA / dyA) : Infinity);
          if (isFinite(tA) && tA < 1) { ln.setAttribute('x2', cB.x - dxA * tA); ln.setAttribute('y2', cB.y - dyA * tA); }
          ln.setAttribute('marker-end', 'url(#edgeArrow)');
      }

      svg.appendChild(ln);

      

      var del=document.createElement('div');

      del.className='edge-del' + (lt ? ' t-' + lt : ''); del.textContent = LINK_TYPES[lt].glyph;

      del.style.left=((cA.x+cB.x)/2)+'px'; del.style.top=((cA.y+cB.y)/2)+'px';

      del.title = LINK_TYPES[lt].label + ' \u2014 click to change the line type or remove the link';

      del.addEventListener('pointerdown', function(ev){ ev.stopPropagation(); });
      del.addEventListener('click', function(ev){ ev.stopPropagation(); openEdgeMenu(ev, i); });

      canvas.appendChild(del);

    });

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
      var label = function(o) { return o ? (o.name || o.charName || (o.type === 'image' ? 'image' : o.type)) : ''; };
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
  try { var _lt0 = localStorage.getItem('wp_linkType'); if (_lt0 && LINK_TYPES[_lt0]) state.linkType = _lt0; } catch (e) {}
  function ensureArrowMarker(svg) {
      if (svg.querySelector('#edgeArrow')) return;
      svg.insertAdjacentHTML('afterbegin', '<defs><marker id="edgeArrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" class="edge-arrow"></path></marker></defs>');
  }
  function syncLinkMenu() {
      document.querySelectorAll('#linkTypeRow .draw-style-btn').forEach(function(b) { b.classList.toggle('active', (b.dataset.type || '') === (state.linkType || '')); });
  }
  function setLinkType(t) {
      state.linkType = LINK_TYPES[t] ? t : '';
      try { localStorage.setItem('wp_linkType', state.linkType); } catch (e) {}
      syncLinkMenu();
  }
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
  document.querySelectorAll('#linkTypeRow .draw-style-btn').forEach(function(b) { b.addEventListener('click', function(e) { e.stopPropagation(); setLinkType(this.dataset.type || ''); }); });
  var _el_linkDoneBtn = document.getElementById('linkDoneBtn');
  if (_el_linkDoneBtn) _el_linkDoneBtn.addEventListener('click', function(e) { e.stopPropagation(); setDataTool('dataMoveBtn'); render(); });
  var _el_linkMenu0 = document.getElementById('linkMenu');
  if (_el_linkMenu0) ['pointerdown', 'click'].forEach(function(ev) { _el_linkMenu0.addEventListener(ev, function(e) { e.stopPropagation(); }); });
  document.addEventListener('click', function(e) {
      var lm = document.getElementById('linkMenu');
      if (lm && lm.classList.contains('show') && !e.target.closest('#linkMenu') && !e.target.closest('#linkBtn')) lm.classList.remove('show');
  });
  syncLinkMenu();

  function snapToHex(x, y, s, mode) {
      // FLAT-TOP hexes (a flat side faces up), size s = 30: a cell is 2s = 60 wide
      // and sqrt(3)*s = 51.96 tall. The drawn tile uses a whole 52 px row pitch:
      // Chrome tiles repeated backgrounds at whole pixels, so a fractional tile
      // drifts ~0.04px per row and tokens would sit visibly off-cell mid-canvas.
      // Columns are 1.5s = 45 apart; each column is shifted half a row from the
      // last. Cell centres: x = 45q + 15, y = 52(r + q/2).
      var h = 52;
      var offsetX = s / 2;
      var offsetY = 0;
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
  // Tokens follow their room: when a character token is dropped inside a
  // whiteboard item that's linked to a room, the character's dossier entry
  // moves into that room (out of whichever room it was in). Returns the room
  // when something changed, so callers can announce it.
  window.wpAutoRoom = function(item, map) {
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
      if (!best) return null;
      var room = map.rooms.find(function(r) { return r.id === best.nodeId; });
      if (!room) return null;
      var key = item.charName.trim().toLowerCase();
      var entry = null, changed = false;
      map.rooms.forEach(function(r) {
          if (!r.characters) return;
          for (var i = r.characters.length - 1; i >= 0; i--) {
              var c = r.characters[i];
              if ((c.name || '').trim().toLowerCase() !== key) continue;
              if (r.id === room.id) { entry = entry || c; }
              else { r.characters.splice(i, 1); entry = entry || c; changed = true; }
          }
      });
      room.characters = room.characters || [];
      if (!room.characters.some(function(c) { return (c.name || '').trim().toLowerCase() === key; })) {
          room.characters.push(entry || { id: uid(), name: item.charName, info: '' });
          changed = true;
      }
      return changed ? room : null;
  };

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
      if (!force && !(item.isChar || item.type === 'hexagon' || item.shape === 'hexagon')) return false;
      var w = item.w || 0, h = item.h || 0;
      var hc = snapToHex(item.x + w / 2, item.y + h / 2, 30, 'center');
      var nx = hc.x - w / 2, ny = hc.y - h / 2;
      if (Math.abs(nx - item.x) < 0.01 && Math.abs(ny - item.y) < 0.01) return false;
      item.x = nx; item.y = ny;
      return true;
  };

  function getSnapCoords(x, y) {
      if (typeof state !== 'undefined' && state.snap) {
          if (state.gridType === 'hex') {
              var p = snapToHex(x, y, 30, 'vertex');
              return {x: p.x, y: p.y};
          } else {
              return {x: Math.round(x/50)*50, y: Math.round(y/50)*50};
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

  function attachDrag(el, modeStr){
      var startX,startY,moved,dragging=false,item;
      var multiDrag = [];
      var lastPX = 0, lastPY = 0;   // where the pointer last was, for a drag that ends without a pointerup

      el.addEventListener('pointerdown',function(e){
        if(e.button!==undefined && e.button!==0) return;
        if(typeof window.isDrawingMode !== 'undefined' && window.isDrawingMode) return;
        if((window.isEraserMode || window.isMeasureMode) && modeStr !== 'data') return; // Eraser/measure handle their own input
        if(window.isPanMode) return; // hand tool (either view): the wrap pans, items never drag
        if(e.target.contentEditable === "true") return; // Let user select text
        // if clicking on resize handle native area (bottom right corner approx)
        var rect = el.getBoundingClientRect();
        if (e.clientX > rect.right - 15 && e.clientY > rect.bottom - 15) return; 

        var activeMap = getActiveMap();
        if(modeStr === 'data') item = activeMap.rooms.find(x=>x.id===el.dataset.id);
        else item = activeMap.whiteboard.find(x=>x.id===el.dataset.id);

        if(!item) return;

        // Players may only drag tokens the GM assigned to them — and nothing while paused
        if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') {
            if (modeStr !== 'visual') return;
            if (window.wpNet.paused) return;
            if (!(item.isChar && item.ownerId === window.wpNet.myId)) {
                // Nothing else is draggable for a player, so anything covering their
                // token (a text box, a note card, a trigger zone) must not trap it:
                // hand the drag to their own token under the pointer, if there is one.
                var wrC = wbWrap.getBoundingClientRect();
                var cpx = (e.clientX - wrC.left + wbWrap.scrollLeft) / state.zoomLevel;
                var cpy = (e.clientY - wrC.top + wbWrap.scrollTop) / state.zoomLevel;
                var mine = activeMap.whiteboard.find(function(cand) {
                    return cand.isChar && cand.ownerId === window.wpNet.myId && cand.id !== item.id &&
                           cpx >= cand.x && cpx <= cand.x + (cand.w || 0) && cpy >= cand.y && cpy <= cand.y + (cand.h || 0);
                });
                var mineEl = mine && document.querySelector('.wb-item[data-id="' + mine.id + '"]');
                if (mineEl && mineEl.style.display !== 'none') {
                    mineEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY }));
                    e.preventDefault();
                }
                return;
            }
        }
        if(item.locked) {
            // A locked item must not shield the items under it: hand the drag to
            // the topmost UNLOCKED item beneath the pointer, if there is one.
            if (modeStr === 'visual' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                var wrB = wbWrap.getBoundingClientRect();
                var wpx = (e.clientX - wrB.left + wbWrap.scrollLeft) / state.zoomLevel;
                var wpy = (e.clientY - wrB.top + wbWrap.scrollTop) / state.zoomLevel;
                var LZ = { back: 10, 'back-mid': 15, middle: 20, 'front-mid': 25, front: 30 };
                var best = null, bestZ = -1, bestIdx = -1;
                activeMap.whiteboard.forEach(function(cand, idx) {
                    if (cand.locked || cand.id === item.id) return;
                    if (wpx < cand.x || wpx > cand.x + (cand.w || 0) || wpy < cand.y || wpy > cand.y + (cand.h || 0)) return;
                    var cz = (cand.layer && LZ[cand.layer]) || cand.z || 10;
                    if (cand.aboveGrid) cz += 15020;
                    if (cz > bestZ || (cz === bestZ && idx > bestIdx)) { best = cand; bestZ = cz; bestIdx = idx; }
                });
                if (best) {
                    var underEl = document.querySelector('.wb-item[data-id="' + best.id + '"]');
                    if (underEl && underEl.style.display !== 'none') {
                        underEl.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY }));
                        e.preventDefault();
                        return;
                    }
                }
            }
            if (modeStr === 'visual') {
                if (e.shiftKey || e.ctrlKey || e.metaKey) {
                    if (!state.selWbIds) state.selWbIds = [];
                    if (!state.selWbIds.includes(item.id)) state.selWbIds.push(item.id);
                    else state.selWbIds = state.selWbIds.filter(id => id !== item.id);
                    state.selWbId = state.selWbIds[state.selWbIds.length - 1] || null;
                } else {
                    if (!state.selWbIds || !state.selWbIds.includes(item.id)) {
                        state.selWbIds = [item.id];
                        state.selWbId = item.id;
                    }
                }
                render();
            }
            return;
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
            state.selWbIds.forEach(id => {
                var it = activeMap.whiteboard.find(x => x.id === id);
                if (it && !it.locked) {
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
        e.preventDefault();
      });

      el.addEventListener('pointermove',function(e){
        if(!dragging) return;
        lastPX = e.clientX; lastPY = e.clientY;
        var dx = (e.clientX - startX) / state.zoomLevel;
        var dy = (e.clientY - startY) / state.zoomLevel;
        if(Math.abs(dx)>3||Math.abs(dy)>3) moved=true;
        
        var primaryDrag = multiDrag.find(m => m.item.id === item.id) || multiDrag[0];
        if(!primaryDrag) return;

        var tempX = primaryDrag.ox + dx;
        var tempY = primaryDrag.oy + dy;
        
        // Smart snapping only works on the primary item
        var snapItem = { id: item.id, x: tempX, y: tempY, w: item.w, h: item.h };
        if(modeStr === 'visual') doSmartSnapping(snapItem, false);
        
        var actualDx = snapItem.x - primaryDrag.ox;
        var actualDy = snapItem.y - primaryDrag.oy;

        multiDrag.forEach(m => {
            m.item.x = m.ox + actualDx;
            m.item.y = m.oy + actualDy;
            if (m.el) {
                m.el.style.left = m.item.x + 'px';
                m.el.style.top = m.item.y + 'px';
            }
        });
        
        if(modeStr==='data') renderDataMap(); // update edges
        if(modeStr==='visual' && window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(item); // live token motion for remote players
        if(modeStr==='visual' && window.wpUpdateSelToolbar) window.wpUpdateSelToolbar();   // toolbar rides along with the drag
        if (modeStr === 'visual' && window.wpUpdateHandles) window.wpUpdateHandles();   // dots follow the drag (single or multi)
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
      el.addEventListener('pointerup',function(e){
        if(!dragging) return;
        dragging=false; el.classList.remove('dragging');
        clearSnaps();
        try{el.releasePointerCapture(e.pointerId);}catch(_){}
        if(moved){
          if(state.snap && modeStr === 'data'){
              var sn = getSnapCoords(item.x, item.y); item.x=sn.x; item.y=sn.y;
              el.style.left=item.x+'px'; el.style.top=item.y+'px';
              renderDataMap();
          }
          if (modeStr === 'visual' && state.gridType === 'hex' && (item.type === 'hexagon' || item.shape === 'hexagon' || item.isChar)) {
              // Hex-shaped items and character tokens ALWAYS seat into a cell on hex
              // maps — every one in the drag, not just the one under the pointer.
              multiDrag.forEach(function(md) {
                  if (window.wpSeatHex(md.item) || md.item === item) {
                      var mel = md.el || state.wbEls[md.item.id];
                      if (mel) { mel.style.left = md.item.x + 'px'; mel.style.top = md.item.y + 'px'; }
                  }
                  if (md.item !== item && modeStr === 'visual' && window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(md.item, true);
              });
              el.style.left=item.x+'px'; el.style.top=item.y+'px';
          } else if(state.snap && state.snapMode !== 'items' && modeStr === 'visual' && state.gridType && state.gridType !== 'off'){   // grid seat: grid / both modes only
              // Item-to-item snaps beat the grid: an axis that glued to a
              // neighbor mid-drag keeps its flush/aligned position on release.
              var glued = doSmartSnapping.last || {};
              var sn = getSnapCoords(item.x, item.y);
              if (!glued.x) item.x = sn.x;
              if (!glued.y) item.y = sn.y;
              el.style.left=item.x+'px'; el.style.top=item.y+'px';
          }
          if(modeStr === 'visual' && window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(item, true); // final, post-snap position
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
              // A portal under the token? Travel first, so the room note below only fires when the token actually stays put.
              var traveled = !!(window.wpNet && window.wpNet.tokenDropped && window.wpNet.tokenDropped(item, am));
              var toRoom = window.wpAutoRoom ? window.wpAutoRoom(item, am) : null;
              if (toRoom && !traveled) import('./io.js').then(function(m) { m.toast((item.charName || 'Character') + ' is now in ' + (toRoom.name || 'that room') + '.'); });
          }
          save();
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
                    else { activeMap.links.push(state.linkType ? [a, b, state.linkType] : [a, b]); import('./io.js').then(m=>m.toast((LINK_TYPES[state.linkType || ''] || LINK_TYPES['']).label + ' link added.')); }
                    render(); save();
                }
              } else {
                state.selId=el.dataset.id; render();
              }
          } else {
              // Clicked without moving in visual mode
              if (!e.shiftKey) {
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

  function attachPanning(wrapEl) {

      var isPanning = false, startX, startY, scrollLeft, scrollTop;

      var currentDrawItem = null;

      var drawPoints = [];

      var drawMinX, drawMinY, drawMaxX, drawMaxY;

      var isMarquee = false, marqueeBox = null, marqueeStartX, marqueeStartY;

      wrapEl.addEventListener('pointerdown', function(e) {

          if (e.button !== undefined && e.button !== 0 && e.button !== 1) return; // Only left or middle click

          if ((window.isEraserMode || window.isMeasureMode) && wrapEl === wbWrap && e.button === 0) return; // Eraser/measure handle left-drags themselves

          if (e.button !== 1 && e.target !== wrapEl && e.target.id !== 'canvas' && e.target.id !== 'edges' && e.target.id !== 'whiteboard') { if (!((window.isDrawingMode && wrapEl === wbWrap) || window.isPanMode)) return; }

          if (wrapEl === wrap) { state.selId = null; state.linkStart = null; }

          else { state.selWbId = null; state.selWbIds = []; }   // empty-board click clears a multi-selection too

          render();

          // Shape/text placement: a shape was picked from the menu — click places it,
          // drag draws the box it should fill.
          if (e.button === 0 && wrapEl === wbWrap && window.wpPlace && !window.isDrawingMode) {
              var pb = wrapEl.getBoundingClientRect();
              var P = window.__place = {
                  on: true,
                  sx: (e.clientX - pb.left + wrapEl.scrollLeft) / state.zoomLevel,
                  sy: (e.clientY - pb.top + wrapEl.scrollTop) / state.zoomLevel,
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

              var mouseX = (e.clientX - wrapBox.left + wrapEl.scrollLeft) / state.zoomLevel;

              var mouseY = (e.clientY - wrapBox.top + wrapEl.scrollTop) / state.zoomLevel;

              var snapped = getSnapCoords(mouseX, mouseY);

              mouseX = snapped.x; mouseY = snapped.y;



              drawPoints = [[mouseX, mouseY]];

              drawMinX = mouseX; drawMaxX = mouseX;

              drawMinY = mouseY; drawMaxY = mouseY;

              

              currentDrawItem = document.createElement('div');

              currentDrawItem.className = 'wb-item path';
              currentDrawItem.style.pointerEvents = 'none';
              currentDrawItem.style.zIndex = '35';

              currentDrawItem.style.zIndex = 40;

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

              var mouseX = (e.clientX - wrapBox.left + wrapEl.scrollLeft) / state.zoomLevel;

              var mouseY = (e.clientY - wrapBox.top + wrapEl.scrollTop) / state.zoomLevel;

              var rawX = mouseX, rawY = mouseY;

              var snapped = getSnapCoords(mouseX, mouseY);

              mouseX = snapped.x; mouseY = snapped.y;

              if (typeof state !== 'undefined' && state.snap) {

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
                  if (state.snap && state.gridType && state.gridType !== 'off' && drawPoints.length) {
                      var lastP = drawPoints[drawPoints.length - 1];
                      var cur = [lastP[0], lastP[1]];
                      var guard = 0;
                      while ((Math.abs(cur[0] - mouseX) > 0.5 || Math.abs(cur[1] - mouseY) > 0.5) && guard++ < 400) {
                          var nbrs;
                          if (state.gridType === 'hex') {
                              // Flat-top lattice (90×52 tile): vertices with x ≡ 0 (mod 45) branch
                              // up-left / down-left / right; those with x ≡ 30 branch up-right / down-right / left
                              var xm = ((Math.round(cur[0]) % 45) + 45) % 45;
                              nbrs = xm === 0
                                  ? [[cur[0] - 15, cur[1] - 26], [cur[0] - 15, cur[1] + 26], [cur[0] + 30, cur[1]]]
                                  : [[cur[0] + 15, cur[1] - 26], [cur[0] + 15, cur[1] + 26], [cur[0] - 30, cur[1]]];
                          } else {
                              nbrs = [[cur[0] + 50, cur[1]], [cur[0] - 50, cur[1]], [cur[0], cur[1] + 50], [cur[0], cur[1] - 50]];
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



              var pathD = 'M ' + drawPoints.map(p => (p[0] - drawMinX) + ' ' + (p[1] - drawMinY)).join(' L ');

              currentDrawItem.innerHTML = '<svg width="100%" height="100%" viewBox="0 0 '+w+' '+h+'" preserveAspectRatio="none" style="overflow:visible;"><path fill="none" stroke="'+(state.drawColor || 'var(--ink)')+'" stroke-width="'+(state.drawStrokeWidth || 3)+'" stroke-linecap="round" stroke-linejoin="round" d="'+pathD+'" /></svg>';

              e.preventDefault();

              return;

          }

          

          var P0 = window.__place;
          if (P0 && P0.on && P0.box) {
              var pb0 = wrapEl.getBoundingClientRect();
              var mx0 = (e.clientX - pb0.left + wrapEl.scrollLeft) / state.zoomLevel;
              var my0 = (e.clientY - pb0.top + wrapEl.scrollTop) / state.zoomLevel;
              P0.box.style.left = Math.min(mx0, P0.sx) + 'px';
              P0.box.style.top = Math.min(my0, P0.sy) + 'px';
              P0.box.style.width = Math.abs(mx0 - P0.sx) + 'px';
              P0.box.style.height = Math.abs(my0 - P0.sy) + 'px';
              e.preventDefault();
              return;
          }
          if (isMarquee && marqueeBox) {
              var wrapBox = wrapEl.getBoundingClientRect();
              var mouseX = (e.clientX - wrapBox.left + wrapEl.scrollLeft) / state.zoomLevel;
              var mouseY = (e.clientY - wrapBox.top + wrapEl.scrollTop) / state.zoomLevel;

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
              
              if (mw > 5 && mh > 5) {
                  var activeMap = getActiveMap();
                  var selected = [];
                  activeMap.whiteboard.forEach(w => {
                      var cx = w.x + (w.w||100)/2;
                      var cy = w.y + (w.h||100)/2;
                      if (cx >= mx && cx <= mx + mw && cy >= my && cy <= my + mh) {
                          selected.push(w.id);
                      }
                  });
                  if (selected.length > 0) {
                      if (e.shiftKey || e.ctrlKey || e.metaKey) {
                          state.selWbIds = Array.from(new Set([...(state.selWbIds||[]), ...selected]));
                      } else {
                          state.selWbIds = selected;
                      }
                      state.selWbId = state.selWbIds[state.selWbIds.length - 1];
                  } else if (!(e.shiftKey || e.ctrlKey || e.metaKey)) {
                      state.selWbIds = [];
                      state.selWbId = null;
                  }
                  render();
              }
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

              

              var item = Object.assign({ id: 'wb'+uid(), type: 'path', x: drawMinX, y: drawMinY, w: w, h: h, baseW: w, baseH: h, z: 10, pts: normalized, color: (state.drawColor || 'var(--ink)'), strokeWidth: (state.drawStrokeWidth || 3) }, (window.wpNewOpacityProps ? window.wpNewOpacityProps() : {}));
              if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') {
                  // a player's drawing: signed with their id so the host accepts it and only they (or the GM) can erase it
                  item.ownerId = window.wpNet.myId; item.byPlayer = true;
              }
              getActiveMap().whiteboard.push(item);

              currentDrawItem.remove();

              currentDrawItem = null;

              save(); render();

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

          e.preventDefault();

          var zoomDelta = e.deltaY < 0 ? 0.05 : -0.05;

          setZoom(Math.round((state.zoomLevel + zoomDelta) * 100) / 100, e.clientX, e.clientY);

      }, {passive: false});

  }



  attachPanning(wrap);

  attachPanning(wbWrap);





  /* ---------- Data Map Tools ---------- */

  var _el_addBtn = document.getElementById('addBtn');

if(_el_addBtn) _el_addBtn.addEventListener('click', function(){

      var cx = (wrap.scrollLeft + wrap.clientWidth/2) / state.zoomLevel - 60;

      var cy = (wrap.scrollTop + wrap.clientHeight/2) / state.zoomLevel - 20;

      var am = getActiveMap();

      var defaultCat = Object.keys(am.cats)[0];

      am.rooms.push({id:uid(), name:'New room', cat:defaultCat, x:Math.max(10,Math.round(cx)), y:Math.max(10,Math.round(cy)), notes:'', characters:[]});

      save(); render();

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
    });
}

  function removeLinkAt(i) {

      getActiveMap().links.splice(i,1); save(); render(); toast('Link removed');

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

document.addEventListener('click', function(e) {
    if(_el_dataCenterMenu && e.target !== _el_dataCenterBtn && !e.target.closest('#dataCenterMenu')) {
        _el_dataCenterMenu.classList.remove('show');
    }
});

var _el_dataUndoBtn = document.getElementById('dataUndoBtn');

if(_el_dataUndoBtn) _el_dataUndoBtn.addEventListener('click', function() { undo(); });

var _el_dataRedoBtn = document.getElementById('dataRedoBtn');

if(_el_dataRedoBtn) _el_dataRedoBtn.addEventListener('click', function() { redo(); });

