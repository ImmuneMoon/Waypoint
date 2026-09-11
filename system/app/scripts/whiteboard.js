function setZoom(n, x, y) { if(window.appSetZoom) window.appSetZoom(n, x, y); }

function toast(msg) { if(window.appToast) window.appToast(msg); }



function render() { if(window.appRender) window.appRender(); }



var wbWrap = document.getElementById('whiteboardWrap');

var wb = document.getElementById('whiteboard');

var _lastMeasureMapId = null;

/* ---- token stance: elevation (yards) + posture (handbook ch. 9) ----
   Two viewer toggles (Settings → Table: wp_elevation / wp_posture, both ON from first launch)
   decide whether the chips draw and whether the blast template measures in 3D. The
   values stay on the token either way, so switching a toggle back on restores them.
   In a session the GM's toggles govern the player copy: net.stance arrives with the
   snapshot and again whenever the GM flips one. */
// The ids are the website's (shadow-base.com details.posture); the 1.4.6 pre-release ids
// prone / supine and the handbook's long names are still accepted on read.
var POSTURES = ['standing', 'crouching', 'sitting', 'kneeling', 'crawling', 'lying-prone', 'lying-face-up'];
var POSTURE_LABEL = { standing: 'Standing', crouching: 'Crouching', sitting: 'Sitting', kneeling: 'Kneeling', crawling: 'Crawling', 'lying-prone': 'Lying prone', 'lying-face-up': 'Lying face up' };
var POSTURE_CHIP = { crouching: 'CRO', sitting: 'SIT', kneeling: 'KNL', crawling: 'CRW', 'lying-prone': 'PRN', 'lying-face-up': 'SUP' };
function normalizePosture(v) {
    var s = String(v || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim();
    if (!s || s === 'standing' || s === 'stand') return 'standing';
    if (/face ?up|supine|on (the|their) back/.test(s)) return 'lying-face-up';
    if (/prone|face ?down/.test(s)) return 'lying-prone';
    if (/crouch/.test(s)) return 'crouching';
    if (/sit/.test(s)) return 'sitting';
    if (/kneel/.test(s)) return 'kneeling';
    if (/crawl/.test(s)) return 'crawling';
    return 'standing';
}
function tokenElevation(it) { var e = Number(it && it.elevation); return isFinite(e) ? e : 0; }
function tokenPosture(it) { return normalizePosture(it && it.posture); }
function stanceOn(which) {   // 'elevation' | 'posture'
    var n = window.wpNet;
    if (n && n.active && n.role === 'client' && n.stance) return !!n.stance[which];
    try { return localStorage.getItem('wp_' + which) !== 'off'; } catch (e) { return true; }   // on until switched off
}
function setTokenElevation(it, v) { v = Math.round(Number(v) * 10) / 10; if (!isFinite(v) || v === 0) delete it.elevation; else it.elevation = Math.max(-999, Math.min(999, v)); }
function setTokenPosture(it, v) { v = normalizePosture(v); if (v === 'standing') delete it.posture; else it.posture = v; }
function fmtElev(e) { return (e > 0 ? '+' : e < 0 ? '\u2212' : '') + (Math.round(Math.abs(e) * 10) / 10); }
window.wpStance = { POSTURES: POSTURES, POSTURE_LABEL: POSTURE_LABEL, normalizePosture: normalizePosture, tokenElevation: tokenElevation, tokenPosture: tokenPosture, on: stanceOn, setElevation: setTokenElevation, setPosture: setTokenPosture, fmtElev: fmtElev };

// Context-menu rows for elevation (− / value / +) and posture (select); shared by the GM's
// item menu and the player's own-token menu. Rows carry cm-stance so the menu stays open.
function stanceMenuHtml(it) {
    var eOn = stanceOn('elevation'), pOn = stanceOn('posture');
    if (!eOn && !pOn) return '';
    var ctl = 'padding:2px 4px; background:var(--panel); color:var(--ink); border:1px solid var(--edge); border-radius:4px;';
    var html = '<div class="menu-divider"></div>';
    if (eOn) html += '<div class="menu-item cm-stance" style="display:flex; align-items:center; gap:6px; cursor:default;"><span class="cm-stance" style="flex:1;">Elevation</span>'
        + '<button class="cm-stance align-btn stance-elev" data-d="-1" title="Down one yard">&minus;</button>'
        + '<input class="cm-stance stance-elev-in" type="number" step="1" value="' + tokenElevation(it) + '" style="width:54px; ' + ctl + '">'
        + '<span class="cm-stance" style="color:var(--dim);">yd</span>'
        + '<button class="cm-stance align-btn stance-elev" data-d="1" title="Up one yard">+</button></div>';
    if (pOn) html += '<div class="menu-item cm-stance" style="display:flex; align-items:center; gap:6px; cursor:default;"><span class="cm-stance" style="flex:1;">Posture</span>'
        + '<select class="cm-stance stance-post" style="' + ctl + '">' + POSTURES.map(function(p) { return '<option value="' + p + '"' + (tokenPosture(it) === p ? ' selected' : '') + '>' + POSTURE_LABEL[p] + '</option>'; }).join('') + '</select></div>';
    return html;
}
function wireStanceMenu(cMenu, items, onChange) {
    items = (items || []).filter(function(t) { return t && t.isChar; });
    if (!items.length) return;
    var inp = cMenu.querySelector('.stance-elev-in');
    function setAll(v) { items.forEach(function(t) { setTokenElevation(t, v); }); if (inp) inp.value = tokenElevation(items[0]); onChange(); }
    Array.prototype.forEach.call(cMenu.querySelectorAll('.stance-elev'), function(b) {
        b.addEventListener('click', function(ce) { ce.stopPropagation(); setAll(tokenElevation(items[0]) + parseInt(b.dataset.d, 10)); });
    });
    if (inp) { inp.addEventListener('click', function(ce) { ce.stopPropagation(); }); inp.addEventListener('change', function() { setAll(this.value); }); }
    var sel = cMenu.querySelector('.stance-post');
    if (sel) { sel.addEventListener('click', function(ce) { ce.stopPropagation(); }); sel.addEventListener('change', function() { var v = this.value; items.forEach(function(t) { setTokenPosture(t, v); }); onChange(); }); }
}
// A player's own token: the one edit menu they get (same permission line as moving it)
function showStanceMenu(e, tok) {
    var cMenu = document.getElementById('contextMenu'); if (!cMenu) return;
    var rows = stanceMenuHtml(tok); if (!rows) return;
    cMenu.innerHTML = '<div class="menu-item" style="color:var(--dim); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; cursor:default;">' + esc(tok.charName || 'Your token') + '</div>' + rows.replace('<div class="menu-divider"></div>', '');
    cMenu.style.display = 'flex';
    placeMenu(cMenu, e);
    wireStanceMenu(cMenu, [tok], function() { save(); render(); });
}

// In a session, clients resolve campaign images through the host-fed cache
// A text box with no colour of its own: light ink on a dark plate, dark ink on a light one,
// the theme's ink when the plate is missing or nearly clear (so both themes stay readable).
// A colour at a given opacity, for the text / background opacity sliders. color-mix keeps any
// CSS colour intact (names, var(--ink), rgba); an older engine falls back to a canvas parse.
function withAlpha(c, a) {
    a = Number(a); if (!isFinite(a) || a >= 1) return c;
    if (!c || c === 'transparent') return c;
    a = Math.max(0, Math.min(1, a));
    try { if (window.CSS && CSS.supports && CSS.supports('color', 'color-mix(in srgb, red 50%, transparent)')) return 'color-mix(in srgb, ' + c + ' ' + Math.round(a * 100) + '%, transparent)'; } catch (e) {}
    var probe = c;
    if (/^var\(/.test(c)) { try { probe = getComputedStyle(document.documentElement).getPropertyValue(c.slice(4, -1).trim()).trim() || c; } catch (e) {} }
    try {
        var cv = withAlpha._cv || (withAlpha._cv = document.createElement('canvas').getContext('2d'));
        cv.fillStyle = '#000'; cv.fillStyle = probe; var s = cv.fillStyle;
        var m = /^#([0-9a-f]{6})$/i.exec(s);
        if (m) return 'rgba(' + parseInt(m[1].slice(0, 2), 16) + ',' + parseInt(m[1].slice(2, 4), 16) + ',' + parseInt(m[1].slice(4, 6), 16) + ',' + a + ')';
        var m2 = /^rgba\(([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)$/.exec(s);
        if (m2) return 'rgba(' + m2[1] + ',' + m2[2] + ',' + m2[3] + ',' + (a * +m2[4]) + ')';
    } catch (e) {}
    return c;
}
window.wpWithAlpha = withAlpha;
function plateInk(bg) {
    if (!bg || bg === 'transparent') return '';
    var r, g, b, a = 1, m;
    if ((m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(bg).trim()))) {
        var x = m[1].length === 3 ? m[1].split('').map(function(c) { return c + c; }).join('') : m[1];
        r = parseInt(x.slice(0, 2), 16); g = parseInt(x.slice(2, 4), 16); b = parseInt(x.slice(4, 6), 16);
    } else if ((m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(String(bg).trim()))) {
        r = +m[1]; g = +m[2]; b = +m[3]; if (m[4] !== undefined) a = +m[4];
    } else return '';
    if (a < 0.35) return '';
    var lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum < 128 ? '#f2f2f7' : '#1f1d24';
}
function resolveImg(src) {
    return (window.wpNet && window.wpNet.assetSrc) ? window.wpNet.assetSrc(src) : src;
}
function fixEmbeddedImgs(el) {
    if (!(window.wpNet && window.wpNet.active && window.wpNet.role === 'client')) return;
    el.querySelectorAll('img').forEach(function(im) {
        var orig = im.dataset.origSrc || im.getAttribute('src');
        if (!orig || orig.indexOf('/saves/images/') !== 0) return;
        im.dataset.origSrc = orig;
        var want = resolveImg(orig);
        if (im.getAttribute('src') !== want) im.setAttribute('src', want);
    });
}

import { state, dom } from './state.js';

import { uid, clone, createNewCampaign, createNewMap, createNewPlanner, getActiveCampaign, getActiveMap, findLandingRoom, characterList, locateCharacter } from './models.js';

import { load, updateUndoBtn, pushHistory, undo, redo, save, download, getBase64Image } from './io.js';

import { updateCampaignSelect, updateSidebarNav, navigateToMap } from './sidebar.js';

import { showPrompt, showConfirm, isCampaignNameTaken, getUniqueCampaignTitle, promptForCampaignName, isItemNameTaken, getUniqueItemTitle, promptForItemName } from './dialogs.js';

import { renderPlanner, renderPlannerPreview } from './planner.js';

import { renderDataMap, clearSnaps, drawSnap, doSmartSnapping, attachDrag, attachPanning, isLinkMode, setLinkMode, removeLinkAt, snapToHex, getSnapCoords } from './datamap.js';

import { getRoomInspectorHtml, attachRoomInspectorEvents, renderInspector,  renderElementList, esc } from './inspector.js';



  function renderWhiteboard() {
      if (window.wpRenderPartyStrip) window.wpRenderPartyStrip();
      if (window.wpRenderCombatStrip) window.wpRenderCombatStrip();

      var activeMap = getActiveMap();

      if(!activeMap || !activeMap.whiteboard) return;

      // Restore this map's saved grid choice

      var mapGrid = (activeMap.meta && activeMap.meta.gridType) || 'off';

      if (mapGrid !== state.gridType) applyGridType(mapGrid);

      // Placed rulers are per-scene: clear them when the map changes

      if (activeMap.id !== _lastMeasureMapId) {

          _lastMeasureMapId = activeMap.id;

          if (typeof clearMeasures === 'function') clearMeasures();
          if (typeof clearBlasts === 'function') clearBlasts();

      }



      var seen = {};

      var selItem = null;

      activeMap.whiteboard.forEach(function(item) {

          seen[item.id] = 1;

          var el = state.wbEls[item.id];
          if (el && el.dataset.type && el.dataset.type !== item.type) {
              // Same id, different kind of item — a player's grey placeholder (a locked rect)
              // becoming the real token when the GM reveals it. Rebuild the box so the new
              // kind's styling applies; otherwise the picture ignores the 'image' sizing rule
              // and draws at its full pixel size inside a rect-styled frame.
              el.classList.remove(el.dataset.type);
              el.classList.add(item.type);
              el.dataset.type = item.type;
              el.innerHTML = '';
              delete el.dataset.ph;
          }
          if(!el) {
              el = document.createElement('div');
              el.className = 'wb-item ' + item.type;
              el.dataset.type = item.type;
              el.dataset.id = item.id;

              wb.appendChild(el);

              state.wbEls[item.id] = el;

              attachDrag(el, 'visual');

              

              if(item.type !== 'text') {

                  // Portal travel: double-click an item linked to a room with a Linked Map

                  el.addEventListener('dblclick', function(e) {

                      e.stopPropagation();

                      var wItem = getActiveMap().whiteboard.find(x => x.id === item.id);

                      if(!wItem || !(wItem.nodeId || wItem.targetMapId)) return;

                      var r = wItem.nodeId ? getActiveMap().rooms.find(x => x.id === wItem.nodeId) : null;

                      // The item's own portal target wins over its room's
                      if (wItem.targetMapId) r = { targetMapId: wItem.targetMapId };

                      if(r && r.targetMapId) {

                          // Players travel individually through portals (host validates);
                          // the rest of the table stays where it is.

                          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') {

                              if (!wItem.hidden) { window.wpNet.requestTravel(wItem.id); toast('Traveling...'); }

                              return;

                          }

                          var srcForLand = (wItem.nodeId && r.id) ? r : { id: null, name: wItem.name, targetRoomId: wItem.targetRoomId };
                          var landW = findLandingRoom(srcForLand, getActiveCampaign().items[r.targetMapId]);
                          if (navigateToMap(r.targetMapId, landW && landW.id)) toast(landW ? 'Traveled to ' + (landW.name || 'the linked room') + '.' : 'Traveled to linked map.');

                      }

                  });

              }

              if(item.type === 'text') {

                  el.addEventListener('dblclick', function(e) {

                      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return;

                      el.contentEditable = "true"; el.classList.add('editing');

                      el.style.cursor = 'text';

                      el.focus();

                  });

                  el.addEventListener('blur', function(e) {

                      el.contentEditable = "false"; el.classList.remove('editing');

                      el.style.cursor = 'grab';

                      item.text = el.innerHTML;

                      save(true);

                  });

              }

              

              el.addEventListener('pointerenter', function(e) {

                  var wItem = getActiveMap().whiteboard.find(x => x.id === item.id);

                  if(!wItem) return;

                  // no info leaks from hidden items on the player side

                  if (wItem.hidden && window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return;

                  

                  var tt = document.getElementById('wbTooltip');

                  

                  if(wItem.isChar) {

                      var cname = wItem.charName || 'Unnamed Character';

                      var cstats = wItem.charStats || '';
                      var stanceBits = [];
                      if (stanceOn('elevation') && tokenElevation(wItem)) stanceBits.push('Elevation ' + fmtElev(tokenElevation(wItem)) + ' yd');
                      if (stanceOn('posture') && tokenPosture(wItem) !== 'standing') stanceBits.push(POSTURE_LABEL[tokenPosture(wItem)]);
                      var stanceLine = stanceBits.length ? '<div class="rc" style="color:var(--gold); font-size:11px;">' + stanceBits.join(' \u00b7 ') + '</div>' : '';

                      // GM only: the roster entry's notes ride along (players never get `info`)
                      var isClientC = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
                      if (!isClientC && wItem.charRef) {
                          var amC = getActiveMap();
                          var entry = null;
                          (amC.rooms || []).some(function(rm) { entry = (rm.characters || []).find(function(c) { return c.id === wItem.charRef; }); return !!entry; });
                          if (entry && entry.info) cstats = (cstats ? cstats + '\n' : '') + entry.info;
                      }

                      tt.innerHTML = '<div class="room" style="border-left-color:var(--gold); margin:0; pointer-events:none;">' +

                                     '<div class="rn">'+esc(cname)+'</div>' +

                                     '<div class="rc" style="color:var(--ink); font-size:11px; white-space:pre-wrap;">'+esc(cstats)+'</div>' + stanceLine +

                                     '</div>';

                      tt.style.display = 'block';

                      return;

                  }

                  

                  if (wItem.type === 'trigger' && !wItem.nodeId) {
                      // a trigger zone is GM prep: its card shows the name and the message it fires; players get nothing
                      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return;
                      tt.innerHTML = '<div class="room" style="border-left-color:var(--gold); margin:0; pointer-events:none;">' +
                                     '<div class="rn">' + esc(wItem.name || 'Trigger zone') + '</div>' +
                                     '<div class="rc" style="color:var(--ink); font-size:11px; white-space:pre-wrap; text-transform:none; letter-spacing:0;">' + esc(wItem.eventMessage || 'No event message yet \u2014 write one in Properties.') + '</div>' +
                                     '<div class="rc" style="color:var(--dim); font-size:11px; text-transform:none; letter-spacing:0;">Trigger zone \u00b7 fires when a character token is dropped here</div></div>';
                      tt.style.display = 'block';
                      return;
                  }
                  if (wItem.type === 'text' && !wItem.nodeId) {
                      var plain = (wItem.text || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
                      var wordCount = plain ? plain.split(' ').length : 0;
                      var isClient = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
                      tt.innerHTML = '<div class="room" style="border-left-color:var(--blue); margin:0; pointer-events:none;">' +
                                     '<div class="rn">Text box</div>' +
                                     '<div class="rc" style="color:var(--dim); font-size:11px;">' + wordCount + ' word' + (wordCount === 1 ? '' : 's') +
                                     (wItem.hidden ? ' &middot; hidden from players' : '') + '</div>' +
                                     (isClient ? '' : '<div class="rc" style="color:var(--gold); font-size:11px;">Double-click to edit &middot; color swatch sets the text color</div>') +
                                     '</div>';
                      tt.style.display = 'block';
                      return;
                  }

                  if (!wItem.nodeId && wItem.targetMapId) {
                      // A direct portal: say where it leads
                      var campP = getActiveCampaign();
                      var destP = campP && campP.items[wItem.targetMapId];
                      var isClientP = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
                      tt.innerHTML = '<div class="room" style="border-left-color:var(--gold); margin:0; pointer-events:none;">' +
                                     '<div class="rn">' + esc(wItem.name || (wItem.type === 'trigger' ? 'Portal zone' : 'Portal')) + '</div>' +
                                     '<div class="rc" style="color:var(--gold)">&rarr; ' + esc(destP && destP.meta && destP.meta.title || 'another map') + '</div>' +
                                     '<div class="rc" style="color:var(--dim); font-size:11px;">' + (isClientP ? 'Drop your token here (or double-click) to travel' : 'Double-click to travel · drop a player\'s token here to send them through') + '</div>' +
                                     '</div>';
                      tt.style.display = 'block';
                      return;
                  }

                  if(!wItem.nodeId) return;

                  var r = getActiveMap().rooms.find(x => x.id === wItem.nodeId);

                  if(!r) return;

                  

                  var activeMap = getActiveMap();

                  var defaultCat = Object.keys(activeMap.cats)[0];

                  var c = activeMap.cats[r.cat] || activeMap.cats[defaultCat] || {label:'Unknown',color:'#000'};

                  var badgesHtml = r.characters && r.characters.length > 0 ? '<div class="badge-char">'+r.characters.length+'</div>' : '';

                  

                  var isClientTT = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
                  var destTT = r.targetMapId && getActiveCampaign() ? getActiveCampaign().items[r.targetMapId] : null;
                  var destRoomTT = destTT && r.targetRoomId ? (destTT.rooms || []).find(function(x) { return x.id === r.targetRoomId; }) : null;
                  var lockTT = destTT && destTT.meta && destTT.meta.playerLock ? ' \u00b7 \uD83D\uDD12 ' + (isClientTT ? 'closed for now' : 'locked for players') : '';
                  var destLine = destTT ? '<div class="rn" style="color:var(--gold);">\u2192 ' + esc(destTT.meta && destTT.meta.title || r.targetMapId) + (destRoomTT ? ' \u00b7 ' + esc(destRoomTT.name || '') : '') + lockTT + '</div>' : '';
                  var travelHint = r.targetMapId ? destLine + '<div class="rc" style="color:var(--gold)">' + (isClientTT ? 'Drop your token here (or double-click) to travel' : 'Double-click to travel · drop a player\'s token here to send them through') + '</div>' : '';

                  var thumb = r.image ? '<img src="'+esc(resolveImg(r.image))+'" loading="lazy" decoding="async" style="width:100%; max-height:90px; object-fit:cover; border-radius:4px; margin-bottom:6px; display:block;">' : '';

                  tt.innerHTML = '<div class="room" style="border-left-color:'+c.color+'; margin:0; pointer-events:none;">' +

                                 thumb +

                                 '<div class="rn">'+esc(r.name||'(unnamed)')+'</div>' +

                                 '<div class="rc" style="color:'+c.color+'">'+esc(c.label)+'</div>' +
                                 (!isClientTT && r.notes ? '<div class="rc" style="color:var(--ink); font-size:11px; white-space:pre-wrap; margin-top:4px; text-transform:none; letter-spacing:0;">' + esc(String(r.notes).slice(0, 320)) + (String(r.notes).length > 320 ? '\u2026' : '') + '</div>' : '') +   // GM only: the room's notes ride the hover card

                                 travelHint +

                                 '<div class="badges">'+badgesHtml+'</div>' +

                                 '</div>';

                  

                  tt.style.display = 'block';

              });

              

              el.addEventListener('pointermove', function(e) {

                  var tt = document.getElementById('wbTooltip');

                  if (tt.style.display === 'block') {

                      var wrapBox = document.getElementById('whiteboardWrap').getBoundingClientRect();

                      tt.style.left = (e.clientX - wrapBox.left + document.getElementById('whiteboardWrap').scrollLeft + 20) + 'px';   // clear of the pointer (a hand cursor is ~24px)

                      tt.style.top = (e.clientY - wrapBox.top + document.getElementById('whiteboardWrap').scrollTop + 28) + 'px';
                      // keep the card on screen: flip to the left of the pointer, or above it, when the edge is near
                      var ttR = tt.getBoundingClientRect(), ttW = window.innerWidth, ttH = window.innerHeight;
                      if (ttR.right > ttW - 8) tt.style.left = (e.clientX - wrapBox.left + document.getElementById('whiteboardWrap').scrollLeft - ttR.width - 14) + 'px';
                      if (ttR.bottom > ttH - 8) tt.style.top = (e.clientY - wrapBox.top + document.getElementById('whiteboardWrap').scrollTop - ttR.height - 14) + 'px';

                  }

              });

              

              el.addEventListener('pointerleave', function(e) {

                  document.getElementById('wbTooltip').style.display = 'none';

              });

          }

          

          el.style.left = item.x + 'px';

          el.style.top = item.y + 'px';

          el.style.width = item.w + 'px';

          el.style.height = item.h + 'px';

          var z = item.z || 10;

          var layerZ = { 'back': 10, 'back-mid': 15, 'middle': 20, 'front-mid': 25, 'front': 30 };

          if (item.layer && layerZ[item.layer]) z = layerZ[item.layer];
          // Drawings ride above tokens (a GM's arrows and a player's marks must stay readable),
          // and their box passes clicks through — only the stroke itself is clickable (CSS).
          if (item.type === 'path' && !item.layer) z = Math.max(z, 35);

          // Per-item exception: render above the grid overlay (z 15000)
          if (item.aboveGrid) z += 15020;

          el.style.zIndex = z;

          var isHexTrigger = item.type === 'trigger' && item.shape === 'hexagon';

          el.classList.toggle('hex-trigger', isHexTrigger);
          // Triggers come in any shape; clipped shapes get a tint instead of the dashed border
          el.classList.toggle('trigger-circle', item.type === 'trigger' && item.shape === 'circle');
          el.classList.toggle('trigger-diamond', item.type === 'trigger' && item.shape === 'diamond');

          if (isHexTrigger || (item.type === 'trigger' && item.shape === 'diamond')) {

              el.style.background = 'rgba(224,165,79,0.3)';

          } else {

              el.style.background = (item.type === 'path' || item.type === 'image' || item.type === 'text' || item.type === 'trigger') ? 'transparent' : (item.color || '');

          }

          // Text boxes: the color swatch is the text color, not a fill; the box
          // has its own background, font, size, and alignment.
          if (item.type === 'text') {
              // Text and background each carry their own opacity (textOpacity / bgOpacity), on top of the whole-item opacity
              var inkT = (item.color && item.color !== 'transparent' && item.color !== 'var(--panel2)') ? item.color : (plateInk(item.bg) || 'var(--ink)');
              el.style.color = withAlpha(inkT, item.textOpacity == null ? 1 : item.textOpacity);
              el.style.background = (item.bg && item.bg !== 'transparent') ? withAlpha(item.bg, item.bgOpacity == null ? 1 : item.bgOpacity) : 'transparent';
              el.style.fontFamily = item.font || '';
              el.style.fontSize = item.fontSize ? item.fontSize + 'px' : '';
              var al = item.align || 'center';
              el.style.textAlign = al;
              var va = item.valign || 'middle';
              el.style.justifyContent = va === 'top' ? 'flex-start' : va === 'bottom' ? 'flex-end' : 'center';
              el.style.alignItems = 'stretch';
              el.style.borderRadius = (item.bg && item.bg !== 'transparent') ? '4px' : '';
          }

          el.style.transform = item.rot ? 'rotate('+item.rot+'deg)' : 'none';

          el.style.border = (item.type === 'trigger' && !isHexTrigger && item.shape !== 'diamond') ? '3px dashed var(--gold)' : '';

          // Portal marker: the item is a portal itself (targetMapId) or is linked
          // to a room that links to another map

          var portalIcon = '';
          var ICON_GLYPH = {'Stairs Up':'\u{1FA9C}','Stairs Down':'\u{1FA9C}','Door':'\u{1F6AA}','Gate':'⛩️','Cave':'\u{1F987}','Tower':'\u{1F5FC}','Camp':'⛺'};

          if (item.targetMapId) {

              portalIcon = ICON_GLYPH[item.portalIcon] || '\u{1F6AA}';

          } else if (item.nodeId) {

              var pRoom = activeMap.rooms.find(x => x.id === item.nodeId);

              if (pRoom && pRoom.targetMapId) {

                  portalIcon = ICON_GLYPH[pRoom.icon] || '\u{1F6AA}';

              }

          }

          if (portalIcon) { el.dataset.portal = 'true'; el.dataset.portalIcon = portalIcon; }

          else { delete el.dataset.portal; delete el.dataset.portalIcon; }

          el.classList.toggle('gm-note', !!item.gmNoteFor);

          // GM-hidden items: the GM sees them ghosted with an eye badge; players see a grey cloud box

          var clientView = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';

          var hideFromMe = !!item.hidden && clientView;

          el.classList.toggle('wb-hidden-gm', !!item.hidden && !clientView);

          el.classList.toggle('wb-hidden-ph', hideFromMe);

          if (hideFromMe && !el.dataset.ph) { el.innerHTML = '<span class="ph-cloud">&#9729;&#65039;</span>'; el.dataset.ph = '1'; }

          if (!hideFromMe && el.dataset.ph) { el.innerHTML = ''; delete el.dataset.ph; }

          // Presence: another player's token only shows where that player actually is.

          var absentOwner = false;

          if (item.isChar && item.ownerId && window.wpNet && window.wpNet.active) {

              absentOwner = !window.wpNet.isPresent(item.ownerId, activeMap.id);

          }

          if (clientView) { el.style.display = absentOwner ? 'none' : ''; }

          else { el.style.display = ''; el.classList.toggle('wb-absent', absentOwner); }
          var combatR = window.wpNet && window.wpNet.active && window.wpNet.combats && window.wpNet.combats[activeMap.id];
          el.classList.toggle('wb-turn', !!(combatR && combatR.rows[combatR.turn] && combatR.rows[combatR.turn].tokId === item.id));
          if (state.selWbIds && state.selWbIds.includes(item.id) && state.selWbIds.length > 1) { el.style.boxShadow = '0 0 0 2px var(--gold)'; } else { el.style.boxShadow = 'none'; }

          

          // Final opacity = the item's own opacity setting combined with the
          // trigger/locked dimming (absence dimming is CSS, .wb-absent !important)
          var itemOp = (item.opacity != null && item.opacity < 1) ? item.opacity : 1;

          if (item.type === 'trigger') {

              el.style.opacity = ((state.selWbIds && state.selWbIds.includes(item.id)) ? 1 : 0.5) * itemOp;

          } else {

              el.style.opacity = (item.locked && !(state.selWbIds && state.selWbIds.includes(item.id)) ? 0.85 : 1) * itemOp;

          }

          

          if(hideFromMe) {

              // placeholder content already set; skip normal content rendering

          } else if(item.type === 'image') {

              if(!el.querySelector('img')) {

                  var img = document.createElement('img');
                  img.decoding = 'async';          // decode off the main thread: a map of many pictures opens sooner
                  img.loading = 'lazy';            // pictures far outside the view load when scrolled to

                  // The frame must be the picture: once the image's real proportions are
                  // known, the box adopts them (width kept) so the resize handle and the
                  // selection outline hug the visible art instead of letterbox space.
                  img.addEventListener('load', function() { fitImageBox(el.dataset.id, img); });

                  el.appendChild(img);

              }

              var wantSrc = resolveImg(item.src);

              var imEl = el.querySelector('img');

              if (imEl.getAttribute('src') !== wantSrc) imEl.src = wantSrc;

          } else if(item.type === 'text') {

              if(el.contentEditable !== "true") {

                  el.innerHTML = item.text || 'Text...';

                  fixEmbeddedImgs(el);

              }

          } else if (item.isChar && (item.type === 'circle' || item.type === 'rect' || item.type === 'diamond' || item.type === 'hexagon')) {

              // Stand-in token: initials until a portrait arrives
              var ini = String(item.charName || '?').trim().split(/\s+/).map(function(s) { return s[0] || ''; }).join('').slice(0, 2).toUpperCase() || '?';
              if (el.dataset.ini !== ini) { el.innerHTML = '<span class="token-initials">' + ini + '</span>'; el.dataset.ini = ini; }

          } else if(item.type === 'path') {

              if(!el.querySelector('svg')) {

                  el.innerHTML = '<svg width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible;"><path fill="none" stroke-width="' + (item.strokeWidth || 3) + '" stroke-linecap="round" stroke-linejoin="round" /></svg>';

              }

              var svg = el.querySelector('svg');

              var bw = item.baseW || item.w;

              var bh = item.baseH || item.h;

              svg.setAttribute('viewBox', '0 0 ' + bw + ' ' + bh);

              

              var pathD = 'M ' + item.pts.map(p => p[0]+' '+p[1]).join(' L ');

              var pathEl = svg.querySelector('path');

              pathEl.setAttribute('d', pathD);

              pathEl.style.stroke = item.color || 'var(--ink)';

          }

          

          

          // Tokens carry a small front-side arrow (which side of the art is "forward")
          var fw = el.querySelector(':scope > .token-front');
          if (item.isChar) {
              if (!fw) { fw = document.createElement('div'); fw.className = 'token-front'; fw.innerHTML = '<i></i>'; el.appendChild(fw); }
              // Grids are square or flat-top hex, so the chosen side is always a face:
              // the arrow points straight across it at the neighbouring cell.
              fw.style.transform = item.front ? 'rotate(' + item.front + 'deg)' : '';
              // The arrow itself turns the token (click / drag) when you may move it:
              // the GM's selected token, or a player's own token.
              var clientV = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
              fw.classList.toggle('turnable', clientV ? (item.ownerId === window.wpNet.myId && !window.wpNet.paused) : (state.selWbId === item.id));
          } else if (fw) fw.remove();
          // Target marks: everyone targeting this token, shown as small copies of their own
          // tokens, centred in a row that wraps into rows and never leaves the token's edges.
          var tgs = (item.isChar && window.wpNet && window.wpNet.active && window.wpNet.targetersOf) ? window.wpNet.targetersOf(item.id, activeMap.id) : [];
          var marksEl = el.querySelector(':scope > .target-marks');
          if (tgs.length) {
              if (!marksEl) { marksEl = document.createElement('div'); marksEl.className = 'target-marks'; el.appendChild(marksEl); }
              var tsig = tgs.map(function(t) { return t.id; }).join(',');
              if (marksEl.dataset.sig !== tsig) {
                  marksEl.dataset.sig = tsig;
                  var n = tgs.length, side = Math.min(item.w || 60, item.h || 52);
                  // one row of up to 3, two rows to 8, three rows to 15, then as small as it takes
                  var size = n <= 3 ? Math.round(side * 0.34) : n <= 8 ? Math.round(side * 0.26) : n <= 15 ? Math.round(side * 0.2) : Math.round(side * 0.15);
                  marksEl.style.setProperty('--mark', size + 'px');
                  marksEl.title = 'Targeted by ' + tgs.map(function(t) { return t.name; }).join(', ');
                  marksEl.innerHTML = tgs.map(function(t) {
                      var mine = targeterToken(t.id);
                      var ini = String(t.name).trim().split(/\s+/).map(function(s) { return s[0] || ''; }).join('').slice(0, 2).toUpperCase();
                      if (mine && mine.src) return '<img class="target-mark" src="' + esc(resolveImg(mine.src)) + '" alt="" title="' + esc(t.name) + '" style="border-color:hsl(' + t.hue + ',75%,55%);">';
                      return '<span class="target-mark target-mark-ini" title="' + esc(t.name) + '" style="background:hsl(' + t.hue + ',75%,55%);">' + esc(ini) + '</span>';
                  }).join('');
              }
              el.classList.toggle('targeted-by-me', tgs.some(function(t) { return t.id === window.wpNet.myId; }));
          } else if (marksEl) { marksEl.remove(); el.classList.remove('targeted-by-me'); }
          // Condition overlay: 'down' = red X over the token, 'dead' = skull + darkened art
          var stv = item.isChar && (item.status === 'down' || item.status === 'dead') ? item.status : '';
          var stEl = el.querySelector(':scope > .token-status');
          if (stv) {
              if (!stEl) { stEl = document.createElement('div'); stEl.className = 'token-status'; el.appendChild(stEl); }
              if (stEl.dataset.s !== stv) { stEl.dataset.s = stv; stEl.innerHTML = stv === 'dead' ? TOKEN_SKULL : TOKEN_X; }
          } else if (stEl) stEl.remove();
          el.classList.toggle('tok-dead', stv === 'dead');
          el.classList.toggle('tok-down', stv === 'down');
          // Stance chips (Settings → Table toggles): a small row at the bottom of the token,
          // inside its own cell so one-token-per-hex still reads at grid scale.
          var elevV = item.isChar && stanceOn('elevation') ? tokenElevation(item) : 0;
          var postV = item.isChar && stanceOn('posture') ? tokenPosture(item) : 'standing';
          var stanceHtml = '';
          if (elevV) stanceHtml += '<span class="chip elev' + (elevV < 0 ? ' below' : '') + '" title="Elevation ' + fmtElev(elevV) + ' yd">' + fmtElev(elevV) + '</span>';
          if (postV !== 'standing') stanceHtml += '<span class="chip post" title="' + POSTURE_LABEL[postV] + '">' + POSTURE_CHIP[postV] + '</span>';
          var stanceEl = el.querySelector(':scope > .token-stance');
          if (stanceHtml) {
              if (!stanceEl) { stanceEl = document.createElement('div'); stanceEl.className = 'token-stance'; el.appendChild(stanceEl); }
              if (stanceEl.dataset.sig !== stanceHtml) { stanceEl.dataset.sig = stanceHtml; stanceEl.innerHTML = stanceHtml; }
          } else if (stanceEl) stanceEl.remove();
          if (item.id === state.selWbId && (!state.selWbIds || state.selWbIds.length === 1) && !item.locked) {

              el.classList.add('sel');

              if (item.locked) el.classList.add('locked');

              else el.classList.remove('locked');

              selItem = item;

          } else {

              el.classList.remove('sel');

              el.classList.remove('locked');

          }

      });

      

      var rHandle = document.getElementById('globalResizeHandle');

      var rotHandle = document.getElementById('globalRotateHandle');

      positionHandles(activeMap);
      if (window.wpRefreshBlasts) window.wpRefreshBlasts();   // tokens moved: re-check who is in a blast

      

      Object.keys(state.wbEls).forEach(function(id){

          if(!seen[id]) {

              state.wbEls[id].remove(); delete state.wbEls[id];

          }

      });

      updateSelToolbar(activeMap);

  }

  /* ---------- floating mini-toolbar over the selection ---------- */

  // Lives inside the scaled #whiteboard: native pan/zoom keep it anchored to
  // the selection, and a counter-scale keeps it a constant screen size.
  // Drags, resizes and zooms call wpUpdateSelToolbar per frame so it follows live.
  window.wpUpdateSelToolbar = function() {
      var am = getActiveMap();
      if (am && am.type === 'map') { updateSelToolbar(am); positionHandles(am); }
  };
  window.wpUpdateHandles = function() { var am = getActiveMap(); if (am && am.type === 'map') positionHandles(am); };

  /* The resize (gold) and rotate (blue) dots. Placed from the live item
     geometry every time anything moves — drag, resize, rotate, zoom — and
     counter-scaled by 1/zoom so they stay the same size on screen.
     A multi-selection gets one resize dot on its corner and no rotate dot. */
  function positionHandles(am) {
      var rHandle = document.getElementById('globalResizeHandle');
      var rotHandle = document.getElementById('globalRotateHandle');
      if (!rHandle || !rotHandle) return;
      var z = state.zoomLevel || 1;
      var tf = 'translate(-50%, -50%) scale(' + (1 / z) + ')';
      rHandle.style.transform = tf; rotHandle.style.transform = tf;
      var hide = function() { rHandle.style.display = 'none'; rotHandle.style.display = 'none'; };
      if (!am || am.type !== 'map' || state.viewMode !== 'visual') { hide(); return; }
      var clientView = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
      var multiSel = state.selWbIds && state.selWbIds.length > 1
          ? state.selWbIds.map(function(id) { return am.whiteboard.find(function(x) { return x.id === id; }); }).filter(function(x) { return x && !x.locked; })
          : [];
      if (multiSel.length > 1 && !clientView) {
          var mxR = Math.max.apply(null, multiSel.map(function(i) { return i.x + (i.w || 100); }));
          var myB = Math.max.apply(null, multiSel.map(function(i) { return i.y + (i.h || 100); }));
          rHandle.style.display = 'block';
          rHandle.style.left = mxR + 'px'; rHandle.style.top = myB + 'px';
          rotHandle.style.display = 'none';
          return;
      }
      var selItem = (state.selWbId && !(state.selWbIds && state.selWbIds.length > 1)) ? am.whiteboard.find(function(x) { return x.id === state.selWbId; }) : null;
      if (!selItem || selItem.locked) { hide(); return; }
      rHandle.style.display = 'block';
      rotHandle.style.display = 'block';
      var rot = selItem.rot || 0;
      var cx = selItem.x + (selItem.w || 100) / 2;
      var cy = selItem.y + (selItem.h || 100) / 2;
      var rx = selItem.x + (selItem.w || 100), ry = selItem.y + (selItem.h || 100);
      var ox = cx, oy = selItem.y - 15 / z;   // the blue dot floats a constant screen distance above
      if (rot) {
          var rad = rot * Math.PI / 180, cos = Math.cos(rad), sin = Math.sin(rad);
          var dxR = rx - cx, dyR = ry - cy;
          rx = cx + dxR * cos - dyR * sin; ry = cy + dxR * sin + dyR * cos;
          var dxO = ox - cx, dyO = oy - cy;
          ox = cx + dxO * cos - dyO * sin; oy = cy + dxO * sin + dyO * cos;
      }
      rHandle.style.left = rx + 'px'; rHandle.style.top = ry + 'px';
      rotHandle.style.left = ox + 'px'; rotHandle.style.top = oy + 'px';
  }
  function updateSelToolbar(am) {
      var bar = document.getElementById('selToolbar');
      if (!bar) return;
      var clientView = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
      var ids = (state.selWbIds && state.selWbIds.length) ? state.selWbIds : (state.selWbId ? [state.selWbId] : []);
      var its = ids.map(function(id) { return am.whiteboard.find(function(x) { return x.id === id; }); }).filter(Boolean);
      if (clientView || state.viewMode !== 'visual' || !its.length || window.isDrawingMode || window.isEraserMode) {
          bar.style.display = 'none';
          return;
      }
      var minX = Math.min.apply(null, its.map(function(i) { return i.x; }));
      var maxR = Math.max.apply(null, its.map(function(i) { return i.x + i.w; }));
      var minY = Math.min.apply(null, its.map(function(i) { return i.y; }));
      var z = state.zoomLevel || 1;
      var anyUnlocked = its.some(function(i) { return !i.locked; });
      var anyVisible = its.some(function(i) { return !i.hidden; });
      // Group button: a toggle — lit when the selection IS a group (click ungroups),
      // plain when several ungrouped/mixed items are selected (click groups them),
      // hidden for a single ungrouped item where it can't do anything.
      var grpBtn = bar.querySelector('.st-group');
      if (grpBtn) {
          var gids = its.map(function(i) { return i.groupId; }).filter(Boolean);
          var isGroup = gids.length === its.length && gids.length > 0 && gids.every(function(g) { return g === gids[0]; });
          if (isGroup) {
              grpBtn.style.display = '';
              grpBtn.classList.add('on');
              grpBtn.title = 'Ungroup';
          } else if (its.length > 1) {
              grpBtn.style.display = '';
              grpBtn.classList.remove('on');
              grpBtn.title = 'Group';
          } else {
              grpBtn.style.display = 'none';
          }
      }
      // The padlock shows the item's STATE (closed = locked), not the action
      var lockBtn = bar.querySelector('.st-lock');
      lockBtn.textContent = anyUnlocked ? '🔓' : '🔒';
      lockBtn.classList.toggle('on', !anyUnlocked);
      lockBtn.title = anyUnlocked ? 'Unlocked — click to lock (no drag or resize)' : 'Locked — click to unlock';
      var visBtn = bar.querySelector('.st-vis');
      visBtn.textContent = anyVisible ? '👁' : '🚫';
      visBtn.classList.toggle('st-hidden', !anyVisible);
      visBtn.title = anyVisible ? 'Visible to players — click to hide from them (GM still sees it dimmed)' : 'HIDDEN from players — click to show it to them';
      var fitBtn = bar.querySelector('.st-fit');
      if (fitBtn) {
          var gridOn = state.gridType && state.gridType !== 'off';
          fitBtn.style.display = gridOn ? '' : 'none';
          fitBtn.title = gridOn ? 'Fit to grid cells — size to whole ' + state.gridType + ' cells and seat it' : '';
      }
      var ratioBtn = bar.querySelector('.st-ratio');
      if (ratioBtn) {
          var allRatio = its.every(function(i) { return i.lockRatio; });
          ratioBtn.classList.toggle('on', allRatio);
          ratioBtn.title = allRatio ? 'Proportions locked — resizing keeps the width/height ratio (click to unlock)' : 'Lock proportions while resizing (or hold Shift while dragging)';
      }
      // Color button: its chip mirrors the selection's color and the kind of
      // thing it colors (text ink, pen, or fill); the palette pops on click.
      var colBtn = bar.querySelector('.st-color');
      var kind = selColorKind(its);
      if (colBtn) {
          colBtn.title = kind === 'text' ? 'Text color' : kind === 'pen' ? 'Pen color' : 'Fill color';
          colBtn.classList.toggle('st-text-color', kind === 'text');
          var chip = colBtn.querySelector('.st-color-chip');
          var cur = its[0] && its[0].color;
          if (chip) chip.style.background = (cur && cur !== 'transparent') ? cur : (kind === 'text' ? 'var(--ink)' : 'transparent');
          if (chip) chip.classList.toggle('none', !cur || cur === 'transparent');
      }
      var pop = bar.querySelector('.st-color-pop');
      if (pop && !pop.hidden) {
          var key = its.map(function(i) { return i.id; }).join(',');
          if (pop.dataset.sel !== key) pop.hidden = true; else renderColorPop(pop, its);
      }
      // The bar lives in the UNSCALED wrap (moved there at startup), so zoom can never change its size:
      // board coords × zoom = wrap coords, and it scrolls with the content like everything else in the wrap.
      bar.style.left = (((minX + maxR) / 2) * z) + 'px';
      bar.style.top = (minY * z) + 'px';
      bar.style.transformOrigin = 'top left';
      bar.style.transform = 'translate(-50%, calc(-100% - 36px))';   // clears the blue rotate dot (15px above the item, ~14px tall)
      bar.style.display = 'flex';
  }

  /* Fit to grid: size the selection to whole cells and seat it. Hex maps —
     tokens and hex shapes become exactly one cell; anything else rounds to
     whole columns/rows of cells and centres on a cell. Square grids — width,
     height and position round to the 50px lattice. */
  function fitToGrid(its) {
      var g = state.gridType;
      if (!g || g === 'off') { toast('Turn on a grid first (square or hex) — the grid button in the toolbar.'); return; }
      var n = 0;
      its.forEach(function(it) {
          if (it.locked || it.type === 'path') return;
          if (g === 'hex') {
              if (it.isChar || it.type === 'hexagon' || it.shape === 'hexagon') { it.w = 60; it.h = 52; }
              else {
                  var rows = Math.max(1, Math.round((it.h || 100) / 52)), cols = Math.max(1, Math.round(((it.w || 100) - 15) / 45));
                  it.w = cols * 45 + 15; it.h = rows * 52;
              }
              if (window.wpSeatHex) window.wpSeatHex(it, null, true);
          } else {
              it.w = Math.max(50, Math.round((it.w || 100) / 50) * 50);
              it.h = Math.max(50, Math.round((it.h || 100) / 50) * 50);
              it.x = Math.round(it.x / 50) * 50; it.y = Math.round(it.y / 50) * 50;
          }
          n++;
      });
      save(); render();
      toast(n ? 'Fitted ' + n + ' item' + (n === 1 ? '' : 's') + ' to the ' + g + ' grid.' : 'Nothing to fit — locked items and drawings are left alone.');
  }
  window.wpFitToGrid = fitToGrid;

  /* Duplicate: a full copy of every selected item — every field it carries
     (sheet, stats, portal target, styling, opacity, layer, lock…) rides along.
     Fresh ids; a group is copied as a new group; `ownerId` is dropped so a
     copied player token isn't remote-controlled; hex tokens/shapes land one
     cell to the right and seat, everything else offsets by 25px. The copies
     become the selection. */
  function duplicateWbItems(its) {
      var am = getActiveMap();
      if (!am || am.type !== 'map' || !its.length) return [];
      var gidMap = {}, copies = [];
      its.forEach(function(src) {
          var it = JSON.parse(JSON.stringify(src));
          it.id = 'wb' + uid() + Math.random().toString(36).slice(2, 5);
          delete it.ownerId;
          if (it.groupId) {
              if (!gidMap[it.groupId]) gidMap[it.groupId] = 'group_' + Date.now() + Math.random().toString(36).slice(2, 6);
              it.groupId = gidMap[it.groupId];
          }
          var hexy = state.gridType === 'hex' && (it.isChar || it.type === 'hexagon' || it.shape === 'hexagon');
          if (hexy) { it.x += 45; it.y += 26; if (window.wpSeatHex) window.wpSeatHex(it, am); }   // the next cell over (flat-top: down-right)
          else { it.x += 25; it.y += 25; }
          am.whiteboard.push(it);
          copies.push(it);
      });
      state.selWbIds = copies.map(function(c) { return c.id; });
      state.selWbId = state.selWbIds[0] || null;
      save(); render();
      toast('Duplicated ' + copies.length + ' item' + (copies.length === 1 ? '' : 's') + '.');
      return copies;
  }
  window.wpDuplicateWb = duplicateWbItems;

  function selColorKind(its) {
      if (its.length && its.every(function(i) { return i.type === 'text'; })) return 'text';
      if (its.length && its.every(function(i) { return i.type === 'path'; })) return 'pen';
      return 'fill';
  }
  var ST_PEN = { '#e9e9f0': 'White', '#1a1a1a': 'Black', '#d9534f': 'Red', '#e0a54f': 'Gold', '#5cb87a': 'Green', '#4db3d3': 'Blue', '#b98cff': 'Violet' };
  var ST_FILL = { 'var(--panel2)': 'Dark Panel', 'rgba(217, 83, 79, 0.3)': 'Red Tint', 'rgba(92, 184, 122, 0.3)': 'Green Tint', 'rgba(77, 179, 211, 0.3)': 'Blue Tint', 'rgba(224, 165, 79, 0.3)': 'Gold Tint', 'transparent': 'Transparent' };
  function applySelColor(its, v) {
      its.forEach(function(i) {
          i.color = v;
          var el = state.wbEls[i.id];
          if (!el) return;
          if (i.type === 'text') el.style.color = (v && v !== 'transparent') ? v : '';
          else if (i.type === 'path') { var p = el.querySelector('path'); if (p) p.style.stroke = v; }
          else if (i.type !== 'image' && i.type !== 'trigger') el.style.background = v;
      });
  }
  // The palette matches the selection: text and drawings get the pen inks,
  // shapes get the fills plus the inks; everyone gets a custom picker.
  function renderColorPop(pop, its) {
      var kind = selColorKind(its);
      var cur = (its[0] && its[0].color || '').toLowerCase();
      var sets = kind === 'fill' ? [ST_FILL, ST_PEN] : [ST_PEN];
      var html = '<div class="stc-title">' + (kind === 'text' ? 'Text color' : kind === 'pen' ? 'Pen color' : 'Fill color') + '</div><div class="stc-grid">';
      sets.forEach(function(set) {
          Object.keys(set).forEach(function(k) {
              html += '<button class="stc-sw' + (k.toLowerCase() === cur ? ' on' : '') + (k === 'transparent' ? ' clear' : '') + '" data-c="' + k + '" title="' + set[k] + '" style="background:' + k + '"></button>';
          });
      });
      html += '<label class="stc-sw custom" title="Custom color"><input type="color" value="' + (/^#[0-9a-f]{6}$/i.test(cur) ? cur : '#e9e9f0') + '"></label></div>';
      pop.innerHTML = html;
      pop.dataset.sel = its.map(function(i) { return i.id; }).join(',');
      pop.querySelectorAll('.stc-sw[data-c]').forEach(function(b) {
          b.addEventListener('click', function(e) {
              e.stopPropagation();
              applySelColor(selToolbarItems(), this.dataset.c);
              save();
              if (window.appRender) window.appRender();
          });
      });
      var ci = pop.querySelector('input[type="color"]');
      if (ci) {
          ci.addEventListener('input', function() { applySelColor(selToolbarItems(), this.value); });
          ci.addEventListener('change', function() { save(); if (window.appRender) window.appRender(); });
          ['click', 'pointerdown'].forEach(function(ev) { ci.addEventListener(ev, function(e) { e.stopPropagation(); }); });
      }
  }

  function selToolbarItems() {
      var am = getActiveMap();
      if (!am || am.type !== 'map') return [];
      var ids = (state.selWbIds && state.selWbIds.length) ? state.selWbIds : (state.selWbId ? [state.selWbId] : []);
      return ids.map(function(id) { return am.whiteboard.find(function(x) { return x.id === id; }); }).filter(Boolean);
  }

  (function wireSelToolbar() {
      var bar = document.getElementById('selToolbar');
      if (!bar) return;
      // Keep toolbar interactions from reaching the canvas (pan/box-select/deselect)
      ['pointerdown', 'mousedown', 'click', 'dblclick'].forEach(function(ev) {
          bar.addEventListener(ev, function(e) { e.stopPropagation(); });
      });
      var LAYERS = ['back', 'back-mid', 'middle', 'front-mid', 'front'];
      bar.addEventListener('click', function(e) {
          var btn = e.target.closest('[data-st]');
          if (!btn) return;
          var act = btn.dataset.st;
          var its = selToolbarItems();
          if (!its.length) return;
          if (act === 'color') {
              // Second click on the swatch closes the palette
              var pop = bar.querySelector('.st-color-pop');
              if (!pop) return;
              if (pop.hidden) { renderColorPop(pop, its); pop.hidden = false; }
              else pop.hidden = true;
              return;
          }
          if (act === 'group') {
              var gids2 = its.map(function(i) { return i.groupId; }).filter(Boolean);
              var isGroup2 = gids2.length === its.length && gids2.length > 0 && gids2.every(function(g) { return g === gids2[0]; });
              if (isGroup2) {
                  var g0 = gids2[0];
                  var am2 = getActiveMap();
                  am2.whiteboard.forEach(function(w) { if (w.groupId === g0) delete w.groupId; });
                  import('./io.js').then(function(m) { m.toast('Ungrouped.'); });
              } else if (its.length > 1) {
                  var newGid = 'group_' + Date.now();
                  its.forEach(function(i) { i.groupId = newGid; });
                  import('./io.js').then(function(m) { m.toast('Grouped ' + its.length + ' items.'); });
              } else return;
          } else if (act === 'lock') {
              var lockThem = its.some(function(i) { return !i.locked; });
              its.forEach(function(i) { i.locked = lockThem; });
          } else if (act === 'vis') {
              var hideThem = its.some(function(i) { return !i.hidden; });
              its.forEach(function(i) { i.hidden = hideThem; });
              import('./io.js').then(function(m) { m.toast(hideThem ? 'Hidden from players. You still see it dimmed; they see nothing.' : 'Now visible to players.'); });
          } else if (act === 'dup') {
              duplicateWbItems(its);
              return;   // duplicateWbItems saves and renders itself
          } else if (act === 'fit') {
              fitToGrid(its);
              return;   // fitToGrid saves and renders itself
          } else if (act === 'ratio') {
              var lockThemR = its.some(function(i) { return !i.lockRatio; });
              its.forEach(function(i) { if (lockThemR) i.lockRatio = true; else delete i.lockRatio; });
          } else if (act === 'up' || act === 'down') {
              its.forEach(function(i) {
                  var idx = LAYERS.indexOf(i.layer || 'middle');
                  i.layer = LAYERS[act === 'up' ? Math.min(LAYERS.length - 1, idx + 1) : Math.max(0, idx - 1)];
              });
          } else if (act === 'del') {
              var am = getActiveMap();
              var ids = its.map(function(i) { return i.id; });
              am.whiteboard = am.whiteboard.filter(function(x) { return ids.indexOf(x.id) === -1; });
              state.selWbIds = []; state.selWbId = null;
          } else return;
          save();
          if (window.appRender) window.appRender();
      });
      // Clicking anywhere off the toolbar closes the palette
      document.addEventListener('pointerdown', function(e) {
          var pop = bar.querySelector('.st-color-pop');
          if (pop && !pop.hidden && !e.target.closest('#selToolbar')) pop.hidden = true;
      }, true);
      document.addEventListener('keydown', function(e) {
          var pop = bar.querySelector('.st-color-pop');
          if (e.key === 'Escape' && pop && !pop.hidden) pop.hidden = true;
      });
  })();



  /* ---------- inspector helpers ---------- */

  function attachResizeHandle() {

      var handle = document.getElementById('globalResizeHandle');

      if(!handle) return;

      var isResizing = false, startX, startY, startW, startH, item;
      // Group resize: every member of the primary's group (or multi-selection)
      // scales with it, anchored at the group's top-left corner.
      var groupMembers = null, gbx = 0, gby = 0, gbw = 1, gbh = 1;

      handle.addEventListener('pointerdown', function(e) {

          if (!state.selWbId || state.viewMode !== 'visual') return;

          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return;

          item = getActiveMap().whiteboard.find(x => x.id === state.selWbId);

          if (!item) return;

          isResizing = true;

          doSmartSnapping.resizeMatch = { w: null, h: null };   // fresh resize: no sticky matches yet

          startX = e.clientX; startY = e.clientY;

          startW = item.w; startH = item.h;

          groupMembers = null;
          var wbAll = getActiveMap().whiteboard;
          var mates = item.groupId
              ? wbAll.filter(function(o) { return o.groupId === item.groupId; })
              : ((state.selWbIds || []).length > 1 && (state.selWbIds || []).indexOf(item.id) !== -1
                  ? wbAll.filter(function(o) { return (state.selWbIds || []).indexOf(o.id) !== -1; }) : []);
          mates = mates.filter(function(o) { return !o.locked; });
          if (mates.length > 1) {
              gbx = Math.min.apply(null, mates.map(function(o) { return o.x; }));
              gby = Math.min.apply(null, mates.map(function(o) { return o.y; }));
              gbw = Math.max(1, Math.max.apply(null, mates.map(function(o) { return o.x + (o.w || 100); })) - gbx);
              gbh = Math.max(1, Math.max.apply(null, mates.map(function(o) { return o.y + (o.h || 100); })) - gby);
              groupMembers = mates.map(function(o) { return { it: o, x0: o.x, y0: o.y, w0: o.w || 100, h0: o.h || 100 }; });
          }

          try { handle.setPointerCapture(e.pointerId); } catch(_) {}

          e.preventDefault(); e.stopPropagation();

      });

      handle.addEventListener('pointermove', function(e) {

          if (!isResizing) return;

      var dx = (e.clientX - startX) / state.zoomLevel;
      var dy = (e.clientY - startY) / state.zoomLevel;
      if (groupMembers) {
          // The handle sits on the selection's corner: dragging it scales the
          // whole box from its top-left, every member along with it.
          var gsx = Math.max(0.05, (gbw + dx) / gbw), gsy = Math.max(0.05, (gbh + dy) / gbh);
          if (e.shiftKey || groupMembers.some(function(g) { return g.it.lockRatio; })) { var u = Math.abs(dx) >= Math.abs(dy) ? gsx : gsy; gsx = u; gsy = u; }
          groupMembers.forEach(function(g) {
              g.it.x = gbx + (g.x0 - gbx) * gsx;
              g.it.y = gby + (g.y0 - gby) * gsy;
              g.it.w = Math.max(10, g.w0 * gsx);
              g.it.h = Math.max(10, g.h0 * gsy);
              var gel = state.wbEls[g.it.id];
              if (gel) { gel.style.left = g.it.x + 'px'; gel.style.top = g.it.y + 'px'; gel.style.width = g.it.w + 'px'; gel.style.height = g.it.h + 'px'; }
          });
          if (window.wpUpdateSelToolbar) window.wpUpdateSelToolbar();   // toolbar + dots follow the box
          return;
      }
      var rot = item.rot || 0;
      if (rot) {
          var rad = -rot * Math.PI / 180;
          var cos = Math.cos(rad), sin = Math.sin(rad);
          var ldx = dx * cos - dy * sin;
          var ldy = dx * sin + dy * cos;
          dx = ldx; dy = ldy;
      }
      item.w = Math.max(10, startW + dx);
      item.h = Math.max(10, startH + dy);
      // Proportional resize: the item's ratio lock, or holding Shift while dragging
      if ((item.lockRatio || e.shiftKey) && startW > 0 && startH > 0) {
          var ratio = startW / startH;
          if (Math.abs(dx) >= Math.abs(dy)) item.h = Math.max(10, item.w / ratio);
          else item.w = Math.max(10, item.h * ratio);
      }



          // Size matching runs even with the ratio locked: whichever axis pauses
          // on a neighbour's size, the other follows the ratio.
          var wBefore = item.w, hBefore = item.h;
          doSmartSnapping(item, true);
          if ((item.lockRatio || e.shiftKey) && startW > 0 && startH > 0) {
              var ratioL = startW / startH;
              if (item.w !== wBefore) item.h = Math.max(10, item.w / ratioL);
              else if (item.h !== hBefore) item.w = Math.max(10, item.h * ratioL);
          }



          var el = state.wbEls[item.id];

          if(el) {

              el.style.width = item.w + 'px';

              el.style.height = item.h + 'px';

          }

          if (window.wpUpdateSelToolbar) window.wpUpdateSelToolbar();   // toolbar and both dots track the growing box

      });

      handle.addEventListener('pointerup', function(e) {

          if(!isResizing) return;

          isResizing = false;

          clearSnaps();

          try { handle.releasePointerCapture(e.pointerId); } catch(e){}

          save();

      });

  }



  /* Tokens turn in grid steps: a square grid has 4 facings (0, ±90, 180), a
     hex grid has 6 (0, ±60, ±120, 180 — one per face of a flat-top hex, so
     straight up is a facing and tokens never sit tilted).
     Hold Shift for free 15° steps. With no grid, tokens turn freely; applying
     a grid turns every token to its nearest facing (see setGridType). */
  function facingStepFor(gridType, item) {
      if (!item || !item.isChar) return 0;
      if (gridType === 'square') return 90;
      if (gridType === 'hex') return 60;
      return 0;
  }
  function facingStep(item) {
      if (!state.snap || state.snapMode === 'items') return 0;
      return facingStepFor(state.gridType, item);
  }
  function snapFacing(rot, step, front) {
      // `front` = which side of the art is the token's front (0 top, 90 right…);
      // that side is what turns to face a cell side.
      front = front || 0;
      var off = 0;   // flat-top hex faces sit at 0, ±60, ±120, 180 — straight up is a face
      var r = Math.round((rot + front - off) / step) * step + off - front;
      if (r <= -180) r += 360;
      if (r > 180) r -= 360;
      return r;
  }
  window.wpSnapFacing = function(item, rot) { var s = facingStep(item); return s ? snapFacing(rot, s, item.front || 0) : rot; };
  /* Turn every token on the map to its nearest facing for `gridType`. Returns
     how many changed. */
  function seatFacings(map, gridType) {
      var n = 0;
      if (!map || !map.whiteboard) return 0;
      map.whiteboard.forEach(function(it) {
          var st = facingStepFor(gridType, it);
          if (!st) return;
          var r = snapFacing(it.rot || 0, st, it.front || 0);
          if (r !== (it.rot || 0)) { it.rot = r; n++; }
      });
      return n;
  }
  window.wpSeatFacings = seatFacings;
  /* Turn a token from its own arrow. Click = next facing clockwise (Shift =
     counter-clockwise); drag = point the arrow at the pointer, snapped to the
     grid's facings (Shift = 15° steps). item.faceMode 'arrow' turns only the
     arrow (front) and leaves the art upright; otherwise the art turns with it
     (rot). The arrow's world direction is always rot + front. */
  var TOKEN_X = '<svg viewBox="0 0 100 100"><path d="M20 20 L80 80 M80 20 L20 80" stroke="#111" stroke-width="20" stroke-linecap="round" fill="none"/><path d="M20 20 L80 80 M80 20 L20 80" stroke="#e53935" stroke-width="12" stroke-linecap="round" fill="none"/></svg>';
  var TOKEN_SKULL = '<svg viewBox="0 0 100 100"><path fill="#f4f4f4" stroke="#111" stroke-width="4" stroke-linejoin="round" d="M50 8 C24 8 12 26 12 46 C12 58 18 66 26 70 L26 84 L38 84 L38 76 L46 76 L46 84 L54 84 L54 76 L62 76 L62 84 L74 84 L74 70 C82 66 88 58 88 46 C88 26 76 8 50 8 Z"/><ellipse cx="36" cy="46" rx="9" ry="11" fill="#111"/><ellipse cx="64" cy="46" rx="9" ry="11" fill="#111"/><path d="M45 61 L50 68 L55 61 Z" fill="#111"/></svg>';
  function normDeg(v) { v = Math.round(v) % 360; if (v <= -180) v += 360; if (v > 180) v -= 360; return v; }
  function applyFacing(item, worldDeg, shift) {
      var step = shift ? 15 : facingStep(item);
      var target = step ? snapFacing(worldDeg, step, 0) : Math.round(worldDeg);
      if (item.faceMode === 'arrow') item.front = ((Math.round(target - (item.rot || 0)) % 360) + 360) % 360;
      else item.rot = normDeg(target - (item.front || 0));
  }
  function refreshTokenDom(item) {
      var el = state.wbEls[item.id];
      if (el) {
          el.style.transform = item.rot ? 'rotate(' + item.rot + 'deg)' : 'none';
          var fw = el.querySelector(':scope > .token-front');
          if (fw) fw.style.transform = item.front ? 'rotate(' + item.front + 'deg)' : '';
      }
      var rRange = document.getElementById('wbRot'), rNum = document.getElementById('wbRotNum');
      if (rRange && rNum) { rRange.value = item.rot || 0; rNum.value = item.rot || 0; }
      if (window.wpUpdateHandles) window.wpUpdateHandles();
      if (window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(item);
  }
  window.wpTurnToken = function(item, steps) {   // programmatic / keyboard: +1 = clockwise
      var st = facingStep(item) || (state.gridType === 'hex' ? 60 : 90);
      applyFacing(item, (item.rot || 0) + (item.front || 0) + steps * st, false);
      refreshTokenDom(item);
  };
  function attachArrowTurn() {
      var turning = null;
      function boardPt(e) {
          var wrap = document.getElementById('whiteboardWrap'); var b = wrap.getBoundingClientRect(); var z = state.zoomLevel || 1;
          return { x: (e.clientX - b.left + wrap.scrollLeft) / z, y: (e.clientY - b.top + wrap.scrollTop) / z };
      }
      document.addEventListener('pointerdown', function(e) {
          if (e.button !== 0 || !e.target || !e.target.closest) return;
          var ar = e.target.closest('.token-front.turnable');
          if (!ar) return;
          var el = ar.closest('.wb-item'); if (!el) return;
          var am = getActiveMap(); if (!am || am.type !== 'map' || state.viewMode !== 'visual') return;
          var item = am.whiteboard.find(function(x) { return x.id === el.dataset.id; });
          if (!item || !item.isChar) return;
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client' && (window.wpNet.paused || item.ownerId !== window.wpNet.myId)) return;
          e.preventDefault(); e.stopPropagation();
          turning = { item: item, sx: e.clientX, sy: e.clientY, moved: false, shift: e.shiftKey };
      }, true);
      document.addEventListener('pointermove', function(e) {
          if (!turning) return;
          if (!turning.moved && Math.hypot(e.clientX - turning.sx, e.clientY - turning.sy) < 5) return;
          turning.moved = true;
          var it = turning.item, p = boardPt(e);
          var cx = it.x + (it.w || 60) / 2, cy = it.y + (it.h || 52) / 2;
          var deg = Math.atan2(p.y - cy, p.x - cx) * 180 / Math.PI + 90;   // 0 = up, clockwise
          applyFacing(it, deg, e.shiftKey);
          refreshTokenDom(it);
      });
      document.addEventListener('pointerup', function(e) {
          if (!turning) return;
          var it = turning.item;
          if (!turning.moved) window.wpTurnToken(it, turning.shift ? -1 : 1);
          turning = null;
          refreshTokenDom(it);
          if (window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(it, true);
          save(); render();
      });
  }
  function attachRotateHandle() {

      var handle = document.getElementById('globalRotateHandle');

      if(!handle) return;

      var isRotating = false, item, startAngle, startRot, cx, cy;

      handle.addEventListener('pointerdown', function(e) {

          if (!state.selWbId || state.viewMode !== 'visual') return;

          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') { var ownTok = getActiveMap().whiteboard.find(x => x.id === state.selWbId); if (window.wpNet.paused || !ownTok || !ownTok.isChar || ownTok.ownerId !== window.wpNet.myId) return; }   // players may turn their own token

          item = getActiveMap().whiteboard.find(x => x.id === state.selWbId);

          if (!item) return;

          isRotating = true;

          cx = item.x + (item.w||100)/2;
          cy = item.y + (item.h||100)/2;

          

          var wrapBox = document.getElementById('whiteboardWrap').getBoundingClientRect();

          var mouseX = (e.clientX - wrapBox.left + document.getElementById('whiteboardWrap').scrollLeft) / state.zoomLevel;

          var mouseY = (e.clientY - wrapBox.top + document.getElementById('whiteboardWrap').scrollTop) / state.zoomLevel;

          

          startAngle = Math.atan2(mouseY - cy, mouseX - cx) * 180 / Math.PI;

          startRot = item.rot || 0;

          

          try { handle.setPointerCapture(e.pointerId); } catch(_) {}

          e.preventDefault(); e.stopPropagation();

      });

      handle.addEventListener('pointermove', function(e) {

          if (!isRotating) return;

          var wrapBox = document.getElementById('whiteboardWrap').getBoundingClientRect();

          var mouseX = (e.clientX - wrapBox.left + document.getElementById('whiteboardWrap').scrollLeft) / state.zoomLevel;

          var mouseY = (e.clientY - wrapBox.top + document.getElementById('whiteboardWrap').scrollTop) / state.zoomLevel;

          

          var currentAngle = Math.atan2(mouseY - cy, mouseX - cx) * 180 / Math.PI;

          var diff = currentAngle - startAngle;

          

          var newRot = Math.round(startRot + diff);

          if (e.shiftKey) newRot = Math.round(newRot / 15) * 15; // state.snap to 15 degrees if shift held
          else { var fstep = facingStep(item); if (fstep) newRot = snapFacing(newRot, fstep, item.front || 0); }   // tokens face cell sides

          if (newRot <= -180) newRot += 360;

          if (newRot > 180) newRot -= 360;

          

          item.rot = newRot;
          if (window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(item);   // remote tables see it turn

          

          var el = state.wbEls[item.id];

          if(el) el.style.transform = 'rotate(' + item.rot + 'deg)';

          

          // update inspector if open

          var rRange = document.getElementById('wbRot');

          var rNum = document.getElementById('wbRotNum');

          if (rRange && rNum) {

              rRange.value = item.rot;

              rNum.value = item.rot;

          }

          if (window.wpUpdateHandles) window.wpUpdateHandles();   // the gold dot swings round with the item

      });

      handle.addEventListener('pointerup', function(e) {

          if(!isRotating) return;

          isRotating = false;

          try { handle.releasePointerCapture(e.pointerId); } catch(e){}

          if (window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(item, true);   // final facing
          save(); render();

      });

  }



  // Default opacity for newly created items (shapes, drawings, images) —
  // set from the Opacity sliders in the shape/draw menus, persisted per install.
  state.newOpacity = (function() { var v = parseFloat(localStorage.getItem('wp_newOpacity')); return (v >= 0.1 && v < 1) ? v : 1; })();

  function newOpacityProps() {
      return (state.newOpacity != null && state.newOpacity < 1) ? { opacity: state.newOpacity } : {};
  }
  window.wpNewOpacityProps = newOpacityProps;

  // The shape menu and draw menu each carry an opacity slider; both drive the
  // same new-item default and stay in sync with each other.
  (function() {
      var sliders = Array.prototype.slice.call(document.querySelectorAll('.new-opacity-slider'));
      function syncNewOpacityUI() {
          var pct = Math.round(state.newOpacity * 100);
          sliders.forEach(function(s) { s.value = pct; });
          var a = document.getElementById('shapeOpacityVal');
          var b = document.getElementById('drawOpacityVal');
          if (a) a.textContent = pct + '%';
          if (b) b.textContent = pct + '%';
      }
      sliders.forEach(function(s) {
          s.addEventListener('input', function() {
              state.newOpacity = Math.max(0.1, Math.min(1, parseInt(this.value, 10) / 100));
              localStorage.setItem('wp_newOpacity', state.newOpacity);
              syncNewOpacityUI();
          });
          // Keep clicks on the slider from triggering menu-wide handlers
          s.addEventListener('click', function(e) { e.stopPropagation(); });
      });
      syncNewOpacityUI();
  })();

  function addWbItem(type, props) {

      var cx = (wbWrap.scrollLeft + wbWrap.clientWidth/2) / state.zoomLevel - (props.w||100)/2;

      var cy = (wbWrap.scrollTop + wbWrap.clientHeight/2) / state.zoomLevel - (props.h||100)/2;

      var item = Object.assign({

          id: 'wb'+uid(), type: type,

          x: Math.max(10,Math.round(cx)), y: Math.max(10,Math.round(cy)),

          w: 100, h: 100, z: 10, color: 'var(--panel2)'

      }, newOpacityProps(), props);

      getActiveMap().whiteboard.push(item);

      state.selWbId = item.id;

      save(); render();

  }

  window.isDrawingMode = false;
  window.isEraserMode = false;
  window.isPanMode = false;
  var _el_drawModeBtn = document.getElementById('drawModeBtn');
  var _el_moveModeBtn = document.getElementById('moveModeBtn');
  var _el_panModeBtn = document.getElementById('panModeBtn');
  var _el_eraserModeBtn = document.getElementById('eraserModeBtn');

  function updateWbToolbar(activeId) {
      ['moveModeBtn', 'panModeBtn', 'drawModeBtn', 'eraserModeBtn', 'measureModeBtn', 'blastModeBtn'].forEach(id => {
          var el = document.getElementById(id);
          if (el) el.classList.remove('active');
      });
      var el = document.getElementById(activeId);
      if (el) el.classList.add('active');
      // The hand tool pans no matter what it grabs — items are untouchable while it's active
      window.isPanMode = (activeId === 'panModeBtn');
      if (activeId !== 'eraserModeBtn' && window.wpEraserCursorHide) window.wpEraserCursorHide();
      // Per-tool cursors (style.css `body.mode-*`): the class beats every item's own cursor
      ['mode-move', 'mode-pan', 'mode-draw', 'mode-eraser', 'mode-measure', 'mode-blast'].forEach(function(c) { document.body.classList.remove(c); });
      document.body.classList.add('mode-' + String(activeId || 'moveModeBtn').replace('ModeBtn', ''));
  }

  var _el_drawMenu = document.getElementById('drawMenu');

  function closeDrawMenu() {
      if(_el_drawMenu) _el_drawMenu.classList.remove('show');
  }

  function syncDrawMenu() {
      var indicator = document.getElementById('drawColorIndicator');
      if(indicator) indicator.style.background = state.drawColor;
      var presetMatch = false;
      document.querySelectorAll('#drawColorRow .draw-swatch[data-color]').forEach(function(sw) {
          var on = sw.dataset.color.toLowerCase() === (state.drawColor || '').toLowerCase();
          sw.classList.toggle('active', on);
          if(on) presetMatch = true;
      });
      var customSw = document.querySelector('#drawColorRow .draw-swatch.custom');
      if(customSw) {
          customSw.classList.toggle('active', !presetMatch);
          if(!presetMatch) customSw.style.background = state.drawColor;
          else customSw.style.background = '';
      }
      document.querySelectorAll('#drawSizeRow .draw-size-btn').forEach(function(btn) {
          btn.classList.toggle('active', parseInt(btn.dataset.size) === state.drawStrokeWidth);
      });
      document.querySelectorAll('#drawStyleRow .draw-style-btn').forEach(function(btn) {
          btn.classList.toggle('active', (btn.dataset.straight === 'true') === !!state.drawStraight);
      });
  }

  if(_el_moveModeBtn) _el_moveModeBtn.addEventListener('click', function() {
      window.isDrawingMode = false;
      window.isEraserMode = false;
      window.isMeasureMode = false;
      var wbWrap = document.getElementById('whiteboardWrap');
      if(wbWrap) wbWrap.style.cursor = 'default';
      updateWbToolbar('moveModeBtn');
      closeDrawMenu();
  });

  if(_el_panModeBtn) _el_panModeBtn.addEventListener('click', function() {
      window.isDrawingMode = false;
      window.isEraserMode = false;
      window.isMeasureMode = false;
      var wbWrap = document.getElementById('whiteboardWrap');
      if(wbWrap) wbWrap.style.cursor = 'grab';
      updateWbToolbar('panModeBtn');
      closeDrawMenu();
      var bar = document.getElementById('selToolbar');
      if (bar) bar.style.display = 'none';
  });

  if(_el_drawModeBtn) _el_drawModeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if(!window.isDrawingMode) {
          window.isDrawingMode = true;
          window.isEraserMode = false;
          window.isMeasureMode = false;
          var wbWrap = document.getElementById('whiteboardWrap');
          if(wbWrap) wbWrap.style.cursor = 'crosshair';
          updateWbToolbar('drawModeBtn');
          state.selWbId = null; render();
          if(_el_drawMenu) { syncDrawMenu(); _el_drawMenu.classList.add('show'); }
      } else if(_el_drawMenu) {
          syncDrawMenu();
          _el_drawMenu.classList.toggle('show');
      }
  });

  /* Eraser size (radius, board px) is a local preference; the circle that
     follows the pointer in eraser mode shows exactly what a click will touch. */
  var _el_eraserMenu = document.getElementById('eraserMenu');
  try { var _es = parseInt(localStorage.getItem('wp_eraserSize'), 10); state.eraserSize = (_es >= 2 && _es <= 40) ? _es : 6; } catch (e) { state.eraserSize = 6; }
  try { var _em = localStorage.getItem('wp_eraserMode'); state.eraserMode = (_em === 'segment') ? 'segment' : 'precise'; } catch (e) { state.eraserMode = 'precise'; }
  function syncEraserMenu() {
      var r = document.getElementById('eraserSize'), v = document.getElementById('eraserSizeVal');
      if (r) r.value = state.eraserSize;
      if (v) v.textContent = state.eraserSize + ' px';
      document.querySelectorAll('.eraser-mode-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.emode === state.eraserMode); });
  }
  document.querySelectorAll('.eraser-mode-btn').forEach(function(b) {
      b.addEventListener('click', function(e) {
          e.stopPropagation();
          state.eraserMode = this.dataset.emode === 'segment' ? 'segment' : 'precise';
          try { localStorage.setItem('wp_eraserMode', state.eraserMode); } catch (err) {}
          syncEraserMenu();
          toast(state.eraserMode === 'precise' ? 'Precise eraser: trims strokes exactly to the circle.' : 'Segment eraser: removes whole segments it touches.');
      });
  });
  var _el_eraserSize = document.getElementById('eraserSize');
  if (_el_eraserSize) {
      _el_eraserSize.addEventListener('input', function() {
          state.eraserSize = Math.max(2, Math.min(40, parseInt(this.value, 10) || 6));
          try { localStorage.setItem('wp_eraserSize', state.eraserSize); } catch (e) {}
          syncEraserMenu();
          eraserCursorAt(null, null, true);
      });
      ['pointerdown', 'click'].forEach(function(ev) { _el_eraserMenu && _el_eraserMenu.addEventListener(ev, function(e) { e.stopPropagation(); }); });
  }
  document.addEventListener('click', function(e) {
      if (_el_eraserMenu && _el_eraserMenu.classList.contains('show') && !e.target.closest('#eraserMenu') && !e.target.closest('#eraserModeBtn')) _el_eraserMenu.classList.remove('show');
  });

  if(_el_eraserModeBtn) _el_eraserModeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!window.isEraserMode) {
          window.isDrawingMode = false;
          window.isEraserMode = true;
          window.isMeasureMode = false;
          var wbWrap = document.getElementById('whiteboardWrap');
          if(wbWrap) wbWrap.style.cursor = 'none';   // the size circle is the cursor
          updateWbToolbar('eraserModeBtn');
          closeDrawMenu();
          state.selWbId = null; state.selWbIds = []; render();
          syncEraserMenu();
          if (_el_eraserMenu) _el_eraserMenu.classList.add('show');
      } else if (_el_eraserMenu) {
          syncEraserMenu();
          _el_eraserMenu.classList.toggle('show');
      }
  });

  // The eraser circle lives inside the scaled whiteboard so it tracks zoom.
  var _eraserCursor = null, _eraserLast = null;
  function eraserCursorAt(wx, wy, keep) {
      var wbEl = document.getElementById('whiteboard');
      if (!wbEl) return;
      if (!_eraserCursor) {
          _eraserCursor = document.createElement('div');
          _eraserCursor.id = 'eraserCursor';
          wbEl.appendChild(_eraserCursor);
      } else if (_eraserCursor.parentNode !== wbEl) wbEl.appendChild(_eraserCursor);
      if (wx == null) { if (!keep || !_eraserLast) { _eraserCursor.style.display = 'none'; return; } wx = _eraserLast[0]; wy = _eraserLast[1]; }
      _eraserLast = [wx, wy];
      var r = state.eraserSize || 6;
      _eraserCursor.style.display = window.isEraserMode ? 'block' : 'none';
      _eraserCursor.style.left = (wx - r) + 'px';
      _eraserCursor.style.top = (wy - r) + 'px';
      _eraserCursor.style.width = (r * 2) + 'px';
      _eraserCursor.style.height = (r * 2) + 'px';
      _eraserCursor.style.borderWidth = (1.5 / (state.zoomLevel || 1)) + 'px';
  }
  window.wpEraserCursorHide = function() { if (_eraserCursor) _eraserCursor.style.display = 'none'; };
  if (wbWrap) {
      wbWrap.addEventListener('pointermove', function(e) {
          if (!window.isEraserMode) { if (_eraserCursor && _eraserCursor.style.display !== 'none') _eraserCursor.style.display = 'none'; return; }
          var box = wbWrap.getBoundingClientRect();
          eraserCursorAt((e.clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel, (e.clientY - box.top + wbWrap.scrollTop) / state.zoomLevel);
      });
      wbWrap.addEventListener('pointerleave', function() { if (_eraserCursor) _eraserCursor.style.display = 'none'; });
  }

  /* ---- image frame fitting ----
     Images draw with object-fit: contain, so a box with the wrong proportions
     leaves invisible margins the handles still measure. On load, a non-token
     image whose box is off by more than 1.5% gets its height corrected once
     (`fit` flag) and proportion lock switched on, unless the GM already chose. */
  function fitImageBox(id, img) {
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return;
      var am = getActiveMap();
      var it = am && am.type === 'map' && (am.whiteboard || []).find(function(x) { return x.id === id; });
      if (!it || it.type !== 'image' || it.fit || it.isChar || !img.naturalWidth || !img.naturalHeight) return;
      var want = img.naturalWidth / img.naturalHeight;
      var have = (it.w || 100) / (it.h || 100);
      it.fit = true;
      if (Math.abs(have - want) / want > 0.015) {
          it.h = Math.max(10, Math.round((it.w || 100) / want));
          if (it.lockRatio === undefined) it.lockRatio = true;
          save(); render();
      }
  }

  // The token the table assigned to a player: on the current map if they have one here, else
  // wherever it is in the campaign (a player targeting from another map still shows their face).
  function targeterToken(pid) {
      var camp = getActiveCampaign(); if (!camp) return null;
      var am = getActiveMap();
      var find = function(m) { return m && m.type === 'map' && (m.whiteboard || []).find(function(w) { return w.isChar && w.ownerId === pid && w.type === 'image' && w.src; }); };
      var t = find(am);
      if (!t) { var ids = Object.keys(camp.items); for (var i = 0; i < ids.length && !t; i++) t = find(camp.items[ids[i]]); }
      return t ? { src: t.src, name: t.charName || t.name || '' } : null;
  }
  /* ---- party strip ----
     Every player's character as a small token in the corner of the play map. The ones on the
     map you are viewing are highlighted; while hosting, a player who is not connected is dimmed.
     Click one to jump to that character: their map (if different), centred on them at 150%. */
  var FOCUS_ZOOM = 1.5;
  function renderPartyStrip() {
      var strip = document.getElementById('partyStrip'); if (!strip) return;
      var camp = getActiveCampaign(), am = getActiveMap();
      if (!camp || !am || am.type !== 'map' || state.viewMode !== 'visual') { strip.innerHTML = ''; strip.dataset.sig = ''; return; }
      var list = characterList(camp, true, am.id);
      var hosting = window.wpNet && window.wpNet.active && window.wpNet.role === 'host';
      var atTable = window.wpNet && window.wpNet.active && (hosting || window.wpNet.role === 'client');   // players see the party too, read-only
      var present = {};
      if (atTable) Object.values(window.wpNet.roster || {}).forEach(function(p) { if (p && p.id) present[p.id] = true; });
      strip.title = atTable && !hosting
          ? 'The party — everyone at the table. The highlighted ones are on this map: click to find them, right-click to target.'
          : 'Your players\' characters. Click one to jump to them; right-click for more (summon). The highlighted ones are on this map.';
      // Connected players without a token yet: their table picture, or a chip with their name
      if (atTable) {
          var owned = {}; list.forEach(function(c) { if (c.ownerId) owned[c.ownerId] = true; });
          Object.values(window.wpNet.roster || {}).forEach(function(p) {
              if (!p || !p.id || owned[p.id]) return;
              var avOk = typeof p.avatar === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,/.test(p.avatar) && p.avatar.length <= 200000;
              var locMap = p.location && camp.items[p.location];
              list.push({ key: 'p:' + p.id, ownerId: p.id, tokId: null, name: p.name || 'Player', src: avOk ? p.avatar : null, avatar: true,
                          mapId: p.location || null, map: locMap && locMap.meta && locMap.meta.title || 'no map yet', noToken: true });
          });
      }
      var sig = list.map(function(c) { return c.key + '|' + c.name + '|' + c.mapId + '|' + (c.src ? c.src.length + c.src.slice(-16) : '') + '|' + (atTable ? (present[c.ownerId] ? 1 : 0) : 2); }).join(';') + '#' + am.id;
      if (strip.dataset.sig === sig) return;
      strip.dataset.sig = sig;
      strip.innerHTML = list.map(function(c) {
          var here = c.mapId === am.id;
          var away = atTable && c.ownerId && !present[c.ownerId];
          var cls = 'party-tok' + (here ? ' here' : '') + (away ? ' away' : '');
          var tip = c.name + (here ? ' \u2014 on this map' : ' \u2014 on ' + c.map) + (away ? ' (player not connected)' : '') + (c.noToken ? ' \u2014 no token yet' : '') + (atTable && !hosting ? (here ? '. Click to find them.' : '') : '. Click to jump to them.');
          if (c.src) return '<img class="' + cls + (c.noToken ? ' party-face' : '') + '" data-key="' + esc(c.key) + '" src="' + esc(c.avatar ? c.src : resolveImg(c.src)) + '" alt="" title="' + esc(tip) + '">';
          var ini = String(c.name).trim().split(/\s+/).map(function(s) { return s[0] || ''; }).join('').slice(0, 2).toUpperCase();
          return '<span class="' + cls + ' party-ini" data-key="' + esc(c.key) + '" title="' + esc(tip) + '">' + esc(ini) + '</span>';
      }).join('');
  }
  window.wpRenderPartyStrip = renderPartyStrip;
  function focusCharacter(key) {
      var camp = getActiveCampaign(); if (!camp) return;
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client' && !window.wpStream) {
          var amC = getActiveMap(), locC = locateCharacter(camp, key, camp.activeItemId);
          if (!locC) {
              var plC = Object.values(window.wpNet.roster || {}).find(function(p) { return p && p.id === key.slice(2); });
              var whereC = plC && plC.location && camp.items[plC.location] ? (camp.items[plC.location].meta || {}).title : null;
              toast((plC && plC.name || 'They') + (whereC ? ' is on ' + whereC + '.' : ' is not on any map right now.'));
              return;
          }
          var nameC = locC.tok.charName || locC.tok.name || 'They';
          if (!amC || locC.map.id !== amC.id) { toast(nameC + ' is on ' + ((locC.map.meta || {}).title || 'another map') + '.'); return; }
          amC.meta = amC.meta || {};
          amC.meta.lastWbX = locC.tok.x + (locC.tok.w || 60) / 2; amC.meta.lastWbY = locC.tok.y + (locC.tok.h || 52) / 2; amC.meta.lastWbZoom = FOCUS_ZOOM;
          render();
          if (window.appRestoreCamera) window.appRestoreCamera();
          toast('Found ' + nameC + '.');
          return;
      }
      if (key.charAt(0) === 'p') {
          // a player with no token yet: go to the map they are on
          var pl = Object.values((window.wpNet && window.wpNet.roster) || {}).find(function(p) { return p && p.id === key.slice(2); });
          if (!pl || !pl.location || !camp.items[pl.location]) { toast((pl && pl.name || 'That player') + ' has no token and no map yet.'); return; }
          if (camp.activeItemId !== pl.location) { camp.activeItemId = pl.location; updateSidebarNav(); }
          state.viewMode = 'visual'; render();
          if (window.appRestoreCamera) window.appRestoreCamera();
          save();
          toast(pl.name + ' is on this map but has no token yet \u2014 give them one from a character token\'s Properties.');
          return;
      }
      var loc = locateCharacter(camp, key, camp.activeItemId);
      if (!loc) { toast('That character is not on any map right now.'); return; }
      if (camp.activeItemId !== loc.map.id) { camp.activeItemId = loc.map.id; updateSidebarNav(); }
      state.viewMode = 'visual';
      loc.map.meta = loc.map.meta || {};
      loc.map.meta.lastWbX = loc.tok.x + (loc.tok.w || 60) / 2;
      loc.map.meta.lastWbY = loc.tok.y + (loc.tok.h || 52) / 2;
      loc.map.meta.lastWbZoom = FOCUS_ZOOM;
      state.selWbId = loc.tok.id; state.selWbIds = [loc.tok.id];
      render();
      if (window.appRestoreCamera) window.appRestoreCamera();
      save();
      toast('Focused on ' + (loc.tok.charName || loc.tok.name || 'the character') + '.');
  }
  window.wpFocusCharacter = focusCharacter;
  (function wirePartyStrip() {
      var strip = document.getElementById('partyStrip'); if (!strip) return;
      strip.addEventListener('click', function(e) {
          var tok = e.target.closest && e.target.closest('.party-tok'); if (!tok) return;
          if (strip.dataset.justDragged) return;   // that was a drag onto the map, not a click
          e.stopPropagation();
          if (window.wpStream && window.wpStreamFocusChar) { window.wpStreamFocusChar(tok.dataset.key); return; }
          focusCharacter(tok.dataset.key);
      });
      strip.addEventListener('pointerdown', function(e) { e.stopPropagation(); });   // never starts a pan or a selection box
      // Right-click: the character's actions
      // Bring a strip entry to a point on the active map: a player's character (o:/p: keys) through
      // bringPlayerHere, a GM-run character (i: key) by moving its token.
      function bringKeyHere(key, x, y) {
          var kind = key.charAt(0), camp = getActiveCampaign(), am = getActiveMap();
          if (!camp || !am || am.type !== 'map') { toast('Open a play map first.'); return; }
          if (kind === 'o' || kind === 'p') { window.wpNet.bringPlayerHere(key.slice(2), x, y); return; }
          var loc = locateCharacter(camp, key, camp.activeItemId); if (!loc) return;
          var tok = loc.tok;
          if (loc.map !== am) { loc.map.whiteboard = (loc.map.whiteboard || []).filter(function(w) { return w !== tok; }); am.whiteboard = am.whiteboard || []; am.whiteboard.push(tok); }
          tok.x = x - (tok.w || 60) / 2; tok.y = y - (tok.h || 52) / 2;
          if (window.wpSeatHex) window.wpSeatHex(tok, am);
          import('./io.js').then(function(m) { m.save(true); if (window.appRender) window.appRender(); m.toast((tok.charName || tok.name || 'Character') + (loc.map !== am ? ' brought over.' : ' moved.')); });
      }
      var pDrag = null;   // { key, sx, sy, ghost, moved }
      strip.addEventListener('pointerdown', function(e) {
          var tok = e.target.closest && e.target.closest('.party-tok'); if (!tok || e.button !== 0) return;
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') return;
          e.preventDefault();   // no native image drag (it would cancel the pointer sequence)
          pDrag = { key: tok.dataset.key, sx: e.clientX, sy: e.clientY, src: tok.tagName === 'IMG' ? tok.getAttribute('src') : null, label: tok.textContent, ghost: null, moved: false };
      });
      document.addEventListener('pointermove', function(e) {
          if (!pDrag) return;
          if (!pDrag.moved && Math.hypot(e.clientX - pDrag.sx, e.clientY - pDrag.sy) < 6) return;
          if (!pDrag.ghost) {
              var g = document.createElement(pDrag.src ? 'img' : 'span');
              if (pDrag.src) g.src = pDrag.src; else g.textContent = pDrag.label;
              g.className = 'party-drag-ghost';
              document.body.appendChild(g); pDrag.ghost = g; pDrag.moved = true;
              document.body.classList.add('party-dragging');
          }
          pDrag.ghost.style.left = (e.clientX - 18) + 'px'; pDrag.ghost.style.top = (e.clientY - 18) + 'px';
      });
      document.addEventListener('pointercancel', function() { if (!pDrag) return; if (pDrag.ghost) pDrag.ghost.remove(); pDrag = null; document.body.classList.remove('party-dragging'); });
      document.addEventListener('pointerup', function(e) {
          if (!pDrag) return;
          var d = pDrag; pDrag = null;
          if (d.ghost) d.ghost.remove();
          document.body.classList.remove('party-dragging');
          if (!d.moved) return;   // a plain click: the click handler jumps
          var wrap = document.getElementById('whiteboardWrap'); if (!wrap) return;
          var wr = wrap.getBoundingClientRect();
          if (e.clientX < wr.left || e.clientX > wr.right || e.clientY < wr.top || e.clientY > wr.bottom) return;
          var z = state.zoomLevel || 1;
          bringKeyHere(d.key, (e.clientX - wr.left + wrap.scrollLeft) / z, (e.clientY - wr.top + wrap.scrollTop) / z);
          strip.dataset.justDragged = '1'; setTimeout(function() { delete strip.dataset.justDragged; }, 300);
      });
      var menu = document.getElementById('partyMenu');
      function closePartyMenu() { if (menu) menu.classList.remove('show'); }
      strip.addEventListener('contextmenu', function(e) {
          var tok = e.target.closest && e.target.closest('.party-tok'); if (!tok || !menu) return;
          e.preventDefault(); e.stopPropagation();
          var camp = getActiveCampaign(); var am = getActiveMap();
          var isPlayerOnly = tok.dataset.key.charAt(0) === 'p';
          var loc = isPlayerOnly ? null : locateCharacter(camp, tok.dataset.key, camp && camp.activeItemId);
          var ownerId = (tok.dataset.key.charAt(0) === 'o' || isPlayerOnly) ? tok.dataset.key.slice(2) : null;
          var rosterP = ownerId && window.wpNet && Object.values(window.wpNet.roster || {}).find(function(p) { return p && p.id === ownerId; });
          var name = loc ? (loc.tok.charName || loc.tok.name || 'this character') : (rosterP && rosterP.name) || 'this player';
          var hosting = window.wpNet && window.wpNet.active && window.wpNet.role === 'host';
          var connected = hosting && ownerId && window.wpNet.isConnected(ownerId);
          var here = loc && am && loc.map.id === am.id;
          var items = [];
          var whereName = loc ? (loc.map.meta && loc.map.meta.title || 'their map') : (rosterP && rosterP.location && camp.items[rosterP.location] && camp.items[rosterP.location].meta.title) || 'their map';
          var isClientM = window.wpNet && window.wpNet.active && window.wpNet.role === 'client' && !window.wpStream;
          if (isClientM && !here) items.push({ act: 'none', label: name + ' \u2014 on ' + whereName, dim: true });
          else items.push({ act: 'jump', label: '\uD83C\uDFAF ' + (isClientM ? 'Find ' : 'Jump to ') + name + (here ? '' : ' (' + whereName + ')') });
          if (hosting && ownerId) {
              items.push(connected
                  ? { act: 'summon', label: '\uD83D\uDCE3 Summon ' + name + ' to the table\'s map' }
                  : { act: 'none', label: '\uD83D\uDCE3 Summon ' + name + ' \u2014 not connected', dim: true });
              items.push({ act: 'summonAll', label: '\uD83D\uDCE3 Summon everyone to the table\'s map' });
          }
          var isClient = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
          if (!isClient && am && am.type === 'map' && !(hosting && connected)) items.push({ act: 'bring', label: '\u27A4 Bring ' + name + ' here (this map)' });
          if (window.wpNet && window.wpNet.active && !hosting && !window.wpStream) items.push({ act: 'target', label: '\u25CE Target ' + name });
          menu.innerHTML = items.map(function(i) {
              return '<button class="wb-tool-btn party-menu-item' + (i.dim ? ' dim' : '') + '" data-act="' + i.act + '" data-key="' + esc(tok.dataset.key) + '" style="width:100%; border-radius:0; font-size:12px; height:auto; padding:8px 10px; text-align:left;">' + esc(i.label) + '</button>';
          }).join('');
          menu.classList.add('show');
          window.wpClampMenu(menu, e.clientX, e.clientY);
      });
      if (menu) menu.addEventListener('click', function(e) {
          var b = e.target.closest && e.target.closest('.party-menu-item'); if (!b) return;
          e.stopPropagation();
          var key = b.dataset.key, act = b.dataset.act;
          closePartyMenu();
          if (act === 'jump') { if (window.wpStream && window.wpStreamFocusChar) window.wpStreamFocusChar(key); else focusCharacter(key); }
          else if (act === 'summon') { window.wpNet.summonPlayerById(key.slice(2)); }
          else if (act === 'summonAll') { window.wpNet.summonAll(); }
          else if (act === 'bring') { var ctrB = viewCentre(); bringKeyHere(key, ctrB.x, ctrB.y); }
          else if (act === 'target') {
              var camp = getActiveCampaign(); var loc = locateCharacter(camp, key, camp && camp.activeItemId);
              var am = getActiveMap();
              if (loc && am && loc.map.id === am.id && loc.tok.ownerId !== window.wpNet.myId) window.wpNet.setTarget(loc.tok.id, am.id, loc.tok.charName || loc.tok.name);
              else toast('You can only target a character on the map you are on.');
          }
      });
      document.addEventListener('pointerdown', function(e) { if (menu && menu.classList.contains('show') && !e.target.closest('#partyMenu')) closePartyMenu(); }, true);
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closePartyMenu(); });
  })();
  /* ---- targeting (players) ----
     A click — not a drag — on a character token that isn't yours marks it as your target;
     the table sees a ring in your colour. Same token again, or Esc, clears it. */
  (function wireTargeting() {
      var down = null;
      document.addEventListener('pointerdown', function(e) {
          down = null;
          if (e.button !== 0 || !e.target || !e.target.closest) return;
          if (!(window.wpNet && window.wpNet.active && window.wpNet.role === 'client')) return;
          if (window.isDrawingMode || window.isEraserMode || window.isMeasureMode || window.isPanMode) return;
          var el = e.target.closest('#whiteboard .wb-item'); if (!el) return;
          var am = getActiveMap(); if (!am || am.type !== 'map' || state.viewMode !== 'visual') return;
          var item = am.whiteboard.find(function(x) { return x.id === el.dataset.id; });
          if (!item || !item.isChar || item.hidden || item.ownerId === window.wpNet.myId) return;
          down = { id: item.id, name: item.charName || item.name || 'that token', x: e.clientX, y: e.clientY, mapId: am.id };
      }, true);
      document.addEventListener('pointerup', function(e) {
          if (!down) return;
          var d = down; down = null;
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;   // a drag (of your own token underneath), not a click
          var el = e.target && e.target.closest && e.target.closest('#whiteboard .wb-item');
          if (!el || el.dataset.id !== d.id) return;
          window.wpNet.setTarget(d.id, d.mapId, d.name);
      }, true);
      document.addEventListener('keydown', function(e) {
          if (e.key !== 'Escape') return;
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client' && window.wpNet.targets && window.wpNet.targets[window.wpNet.myId]) window.wpNet.clearMyTarget();
      });
  })();
  /* ---- click-away deselect ----
     Clicking anywhere that isn't the board, the Properties/Elements sidebar,
     the selection toolbar, a menu, or a dialog drops the selection, so the
     floating toolbar never lingers over an item you've moved on from. */
  document.addEventListener('pointerdown', function(e) {
      if (state.viewMode !== 'visual') return;
      if (!state.selWbId && !(state.selWbIds && state.selWbIds.length)) return;
      var t = e.target;
      if (!t || !t.closest) return;
      if (t.closest('#whiteboardWrap, #sidebar, #selToolbar, #contextMenu, .floating-toolbar, .shape-menu, .dropdown, .menu-item, [id$="Modal"], #cmdkModal, input, select, textarea, [contenteditable="true"]')) return;
      state.selWbId = null; state.selWbIds = [];
      if (window.appRender) window.appRender();
  }, true);

  /* ---- hover tooltip hygiene: it must never outlive the hover ----
     The per-item pointerleave can be missed (element re-rendered under the
     cursor, pointer captured by a drag, view switch), so any pointer activity
     that isn't a hover over a board item hides it. */
  (function wireTooltipHygiene() {
      var tt = document.getElementById('wbTooltip');
      if (!tt) return;
      function hide() { if (tt.style.display !== 'none') tt.style.display = 'none'; }
      document.addEventListener('pointermove', function(e) {
          if (tt.style.display !== 'block') return;
          var over = e.target && e.target.closest && e.target.closest('.wb-item');
          if (!over) hide();
      }, true);
      document.addEventListener('pointerdown', hide, true);
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape') hide(); });
      window.addEventListener('blur', hide);
      window.wpHideTooltip = hide;
  })();

  /* ---- eraser: delete drawn paths under the pointer ---- */
  var isErasing = false;

  function distToSegSq(px, py, x1, y1, x2, y2) {
      var dx = x2 - x1, dy = y2 - y1;
      if (dx === 0 && dy === 0) { dx = px - x1; dy = py - y1; return dx*dx + dy*dy; }
      var t = ((px - x1) * dx + (py - y1) * dy) / (dx*dx + dy*dy);
      t = Math.max(0, Math.min(1, t));
      var cx = x1 + t * dx, cy = y1 + t * dy;
      var ddx = px - cx, ddy = py - cy;
      return ddx*ddx + ddy*ddy;
  }

  var lastErasePt = null;

  function eraseAt(clientX, clientY) {
      var box = wbWrap.getBoundingClientRect();
      var x = (clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel;
      var y = (clientY - box.top + wbWrap.scrollTop) / state.zoomLevel;
      // Interpolate from the previous sample so fast swipes don't skip over strokes
      if (lastErasePt) {
          var dist = Math.hypot(x - lastErasePt[0], y - lastErasePt[1]);
          var steps = Math.min(60, Math.max(1, Math.ceil(dist / 6)));
          for (var i = 1; i <= steps; i++) {
              eraseWorldPoint(lastErasePt[0] + (x - lastErasePt[0]) * i / steps,
                              lastErasePt[1] + (y - lastErasePt[1]) * i / steps);
          }
      } else {
          eraseWorldPoint(x, y);
      }
      lastErasePt = [x, y];
  }

  // Erase only the SEGMENTS under the pointer: a touched segment is cut out and
  // its two neighbours keep their endpoints, so a small eraser removes exactly
  // one segment. What remains on either side becomes its own path item.
  function eraseWorldPoint(x, y) {
      var m = getActiveMap();
      if(!m || !m.whiteboard) return;
      var changed = false;
      var out = [];
      var eraserClient = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
      m.whiteboard.forEach(function(item) {
          if (item.type !== 'path' || !item.pts || item.locked) { out.push(item); return; }
          if (eraserClient && item.ownerId !== window.wpNet.myId) { out.push(item); return; }   // players erase only their own marks
          var sx = item.w / (item.baseW || item.w || 1);
          var sy = item.h / (item.baseH || item.h || 1);
          var reach = (state.eraserSize || 6) + (item.strokeWidth || 3) / 2;
          var reachSq = reach * reach;
          var abs = item.pts.map(function(p) { return [item.x + p[0] * sx, item.y + p[1] * sy]; });
          if (abs.length === 1) {
              var ddx = x - abs[0][0], ddy = y - abs[0][1];
              if (ddx*ddx + ddy*ddy <= reachSq) { changed = true; return; }
              out.push(item); return;
          }
          var cut = [];
          var any = false;
          for (var i = 0; i + 1 < abs.length; i++) {
              cut[i] = distToSegSq(x, y, abs[i][0], abs[i][1], abs[i+1][0], abs[i+1][1]) <= reachSq;
              if (cut[i]) any = true;
          }
          if (!any) { out.push(item); return; }
          changed = true;
          // Runs of consecutive intact segments become the surviving pieces
          var run = [];
          if (state.eraserMode !== 'segment') {
              // PRECISE: clip each segment against the circle and keep only the
              // parts outside it, so exactly what the circle passed over is gone.
              for (var s = 0; s + 1 < abs.length; s++) {
                  var A = abs[s], B = abs[s+1];
                  if (!cut[s]) { if (!run.length) run.push(A); run.push(B); continue; }
                  var dxs = B[0] - A[0], dys = B[1] - A[1];
                  var fx = A[0] - x, fy = A[1] - y;
                  var qa = dxs*dxs + dys*dys, qb = 2 * (fx*dxs + fy*dys), qc = fx*fx + fy*fy - reachSq;
                  var t0 = 0, t1 = 1;
                  if (qa > 0) {
                      var disc = qb*qb - 4*qa*qc;
                      if (disc < 0) { t0 = 0; t1 = 1; }   // touched by proximity only: treat as inside
                      else { var sq = Math.sqrt(disc); t0 = Math.max(0, (-qb - sq) / (2*qa)); t1 = Math.min(1, (-qb + sq) / (2*qa)); }
                  }
                  if (t0 > 0.001) { if (!run.length) run.push(A); run.push([A[0] + dxs*t0, A[1] + dys*t0]); }
                  flush();
                  if (t1 < 0.999) { run.push([A[0] + dxs*t1, A[1] + dys*t1]); run.push(B); }
              }
              flush();
              return;
          }
          function flush() {
              if (run.length < 2) { run = []; return; }
              var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
              run.forEach(function(p) { minX = Math.min(minX, p[0]); minY = Math.min(minY, p[1]); maxX = Math.max(maxX, p[0]); maxY = Math.max(maxY, p[1]); });
              var w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
              var piece = Object.assign({}, item, {
                  id: 'wb' + uid(),
                  x: minX, y: minY, w: w, h: h, baseW: w, baseH: h,
                  pts: run.map(function(p) { return [p[0] - minX, p[1] - minY]; })
              });
              delete piece.groupId;
              out.push(piece);
              run = [];
          }
          for (var j = 0; j + 1 < abs.length; j++) {
              if (cut[j]) flush();   // the run already ends at abs[j]
              else { if (!run.length) run.push(abs[j]); run.push(abs[j+1]); }
          }
          flush();
      });
      if (changed) {
          m.whiteboard = out;
          if (state.selWbId && !out.some(function(i) { return i.id === state.selWbId; })) { state.selWbId = null; state.selWbIds = []; }
          save(); render();
      }
  }

  if(wbWrap) {
      wbWrap.addEventListener('pointerdown', function(e) {
          if (!window.isEraserMode || e.button !== 0) return;
          isErasing = true;
          lastErasePt = null;
          if (_eraserCursor) _eraserCursor.classList.add('pressed');
          eraseAt(e.clientX, e.clientY);
          e.preventDefault();
      });
      wbWrap.addEventListener('pointermove', function(e) {
          if (isErasing && window.isEraserMode) eraseAt(e.clientX, e.clientY);
      });
  }
  document.addEventListener('pointerup', function() { isErasing = false; lastErasePt = null; if (_eraserCursor) _eraserCursor.classList.remove('pressed'); });

  /* ---- measure tool: place unit-aware rulers on the board ---- */

  window.isMeasureMode = false;

  var measures = [];

  var activeMeasure = null;

  var isMeasuring = false;

  try { var _mu = localStorage.getItem('wp_measureUnit'); if (_mu) state.measureUnit = _mu; } catch (e) {}

  function _r1(n) { return Math.round(n * 10) / 10; }

  // Per-map scale: default 1 yd per hex / 5 ft per square, overridable in the
  // measure menu (meta.cellValue + meta.cellUnit) — e.g. 100 yd or 5 mi per cell.

  function mapMeasureConfig() {

      var m = getActiveMap();

      var meta = (m && m.meta) || {};

      var hex = state.gridType === 'hex';

      return {

          cellPx: hex ? 52 : 50,

          cellName: hex ? 'hex' : 'sq',

          per: (typeof meta.cellValue === 'number' && meta.cellValue > 0) ? meta.cellValue : (hex ? 1 : 5),

          unit: meta.cellUnit || (hex ? 'yd' : 'ft')

      };

  }

  function measureLabel(dist) {

      var cfg = mapMeasureConfig();

      var cells = dist / cfg.cellPx;

      var val = cells * cfg.per;

      var unit = cfg.unit;

      var metric = (state.measureUnit === 'metric');

      var toMetric = { yd: ['m', 0.9144], ft: ['m', 0.3048], mi: ['km', 1.60934] };

      var toImperial = { m: ['yd', 1.09361], km: ['mi', 0.621371] };

      if (metric && toMetric[unit]) { val *= toMetric[unit][1]; unit = toMetric[unit][0]; }

      else if (!metric && toImperial[unit]) { val *= toImperial[unit][1]; unit = toImperial[unit][0]; }

      return _r1(cells) + ' ' + cfg.cellName + ' · ' + _r1(val) + ' ' + unit;

  }

  function renderMeasures() {

      var layer = document.getElementById('measureLayer');

      if (!layer) return;

      var all = activeMeasure ? measures.concat([activeMeasure]) : measures;

      var html = '';

      all.forEach(function(m, idx) {

          var dist = Math.hypot(m.x2 - m.x1, m.y2 - m.y1);

          var mx = (m.x1 + m.x2) / 2, my = (m.y1 + m.y2) / 2;

          // Each placed ruler is its own clickable group (a fat invisible hit line
          // makes it easy to grab); the one being dragged is inert.
          html += '<g class="measure' + (m === activeMeasure ? ' live' : '') + '" data-i="' + idx + '"><title>Click to remove this ruler</title>';

          html += '<line class="hit" x1="' + m.x1 + '" y1="' + m.y1 + '" x2="' + m.x2 + '" y2="' + m.y2 + '"></line>';

          html += '<line x1="' + m.x1 + '" y1="' + m.y1 + '" x2="' + m.x2 + '" y2="' + m.y2 + '"></line>';

          html += '<circle cx="' + m.x1 + '" cy="' + m.y1 + '" r="4"></circle><circle cx="' + m.x2 + '" cy="' + m.y2 + '" r="4"></circle>';

          // Elevation on + both ends on tokens at different heights: the straight-line 3D figure too
          var lab3 = '';
          if (stanceOn('elevation')) {
              var amR = getActiveMap(), tA = amR && tokenAtPoint(amR, m.x1, m.y1), tB = amR && tokenAtPoint(amR, m.x2, m.y2);
              if (tA && tB && tA !== tB && tokenElevation(tA) !== tokenElevation(tB)) {
                  var hY = boardYards(m.x1, m.y1, m.x2, m.y2), vY = tokenElevation(tB) - tokenElevation(tA);
                  lab3 = '3D ' + _r1(Math.sqrt(hY * hY + vY * vY)) + ' yd \u00b7 ' + fmtElev(vY) + ' yd';
              }
          }
          html += '<text x="' + (mx + 8) + '" y="' + (my - 8) + '">' + measureLabel(dist) + '</text>';
          if (lab3) html += '<text x="' + (mx + 8) + '" y="' + (my + 11) + '">' + lab3 + '</text>';
          html += '</g>';

      });

      layer.innerHTML = html + blastSvg();
      applyBlastHits();

  }

  (function wireMeasureClicks() {
      var layer = document.getElementById('measureLayer');
      if (!layer) return;
      layer.addEventListener('pointerdown', function(e) {
          if (!e.target.closest || window.isPanMode) return;
          var gbd = e.target.closest('g.blast');
          if (gbd && e.button === 0) {   // drag a blast to move it (a plain click does nothing)
              var bi0 = parseInt(gbd.dataset.i, 10);
              if (bi0 >= 0 && bi0 < blasts.length) { blastDrag = { i: bi0, sx: e.clientX, sy: e.clientY, ox: blasts[bi0].x, oy: blasts[bi0].y, moved: false }; e.preventDefault(); }
              e.stopPropagation(); return;
          }
          if (e.target.closest('g.measure') || gbd) e.stopPropagation();
      });
      // Right-click a blast to remove it
      layer.addEventListener('contextmenu', function(e) {
          var gbc = e.target.closest && e.target.closest('g.blast'); if (!gbc) return;
          e.preventDefault(); e.stopPropagation();
          var bic = parseInt(gbc.dataset.i, 10);
          if (bic >= 0 && bic < blasts.length) { blasts.splice(bic, 1); renderMeasures(); syncBlastMenu(); toast('Blast removed.'); }
      });
      document.addEventListener('pointermove', function(e) {
          if (!blastDrag) return;
          var bm = blasts[blastDrag.i]; if (!bm) { blastDrag = null; return; }
          if (!blastDrag.moved && Math.hypot(e.clientX - blastDrag.sx, e.clientY - blastDrag.sy) < 4) return;
          blastDrag.moved = true;
          bm.x = blastDrag.ox + (e.clientX - blastDrag.sx) / state.zoomLevel;
          bm.y = blastDrag.oy + (e.clientY - blastDrag.sy) / state.zoomLevel;
          renderMeasures();
      });
      document.addEventListener('pointerup', function() {
          if (!blastDrag) return;
          var bu = blasts[blastDrag.i], movedU = blastDrag.moved; blastDrag = null;
          if (!bu || !movedU) return;
          seatBlast(bu); renderMeasures(); syncBlastMenu();
      });
      layer.addEventListener('click', function(e) {
          if (e.target.closest && e.target.closest('g.blast')) { e.stopPropagation(); return; }   // blasts: drag moves, right-click removes
          var g = e.target.closest && e.target.closest('g.measure');
          if (!g || g.classList.contains('live')) return;
          var i = parseInt(g.dataset.i, 10);
          if (i >= 0 && i < measures.length) { measures.splice(i, 1); renderMeasures(); toast('Ruler removed.'); }
          e.stopPropagation();
      });
  })();

  function clearMeasures() { measures = []; activeMeasure = null; renderMeasures(); }

  window.appClearMeasures = clearMeasures;

  function measurePoint(e) {

      var box = wbWrap.getBoundingClientRect();

      var x = (e.clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel;

      var y = (e.clientY - box.top + wbWrap.scrollTop) / state.zoomLevel;

      return getSnapCoords(x, y);

  }

  var _el_measureModeBtn = document.getElementById('measureModeBtn');

  var _el_measureMenu = document.getElementById('measureMenu');

  function syncMeasureMenu() {

      document.querySelectorAll('#measureUnitRow .draw-style-btn').forEach(function(b) {

          b.classList.toggle('active', b.dataset.unit === (state.measureUnit || 'imperial'));

      });

      var cfg = mapMeasureConfig();

      var vEl = document.getElementById('measureCellValue');

      var uEl = document.getElementById('measureCellUnit');

      if (vEl && document.activeElement !== vEl) vEl.value = cfg.per;

      if (uEl && document.activeElement !== uEl) uEl.value = cfg.unit;

  }



  // GM: per-map measurement scale, stored on the map so it persists

  ['measureCellValue', 'measureCellUnit'].forEach(function(id) {

      var el = document.getElementById(id);

      if (!el) return;

      el.addEventListener('change', function() {

          var m = getActiveMap();

          if (!m || !m.meta) return;

          var v = parseFloat(document.getElementById('measureCellValue').value);

          if (!isNaN(v) && v > 0) m.meta.cellValue = v;

          m.meta.cellUnit = document.getElementById('measureCellUnit').value;

          save();

          renderMeasures();

          toast('Map scale: 1 cell = ' + (m.meta.cellValue || mapMeasureConfig().per) + ' ' + m.meta.cellUnit + '.');

      });

      el.addEventListener('keydown', function(e) { e.stopPropagation(); });

  });

  if(_el_measureModeBtn) _el_measureModeBtn.addEventListener('click', function(e) {

      e.stopPropagation();

      if (!window.isMeasureMode || window.wpMeasureKind !== 'ruler') {
          window.wpMeasureKind = 'ruler'; closeBlastMenu();

          window.isMeasureMode = true;

          window.isDrawingMode = false;

          window.isEraserMode = false;

          if(wbWrap) wbWrap.style.cursor = 'crosshair';

          updateWbToolbar('measureModeBtn');

          closeDrawMenu();

          state.selWbId = null; state.selWbIds = []; render();

          if(_el_measureMenu) { syncMeasureMenu(); _el_measureMenu.classList.add('show'); }

      } else if(_el_measureMenu) {

          syncMeasureMenu();

          _el_measureMenu.classList.toggle('show');

      }

  });

  document.querySelectorAll('#measureUnitRow .draw-style-btn').forEach(function(b) {

      b.addEventListener('click', function() {

          state.measureUnit = this.dataset.unit;

          try { localStorage.setItem('wp_measureUnit', state.measureUnit); } catch (e) {}

          syncMeasureMenu(); renderMeasures();

      });

  });

  var _el_measureClearBtn = document.getElementById('measureClearBtn');

  if(_el_measureClearBtn) _el_measureClearBtn.addEventListener('click', clearMeasures);

  document.addEventListener('click', function(e) {

      if(_el_measureMenu && _el_measureMenu.classList.contains('show') &&

         !e.target.closest('#measureMenu') && !e.target.closest('#measureModeBtn')) {

          _el_measureMenu.classList.remove('show');

      }

  });

  if (wbWrap) {

      wbWrap.addEventListener('pointerdown', function(e) {

          if (!window.isMeasureMode || e.button !== 0) return;
          if (window.wpMeasureKind === 'blast') { placeBlast(e); e.preventDefault(); return; }

          var p = measurePoint(e);

          activeMeasure = { x1: p.x, y1: p.y, x2: p.x, y2: p.y };

          isMeasuring = true;

          renderMeasures();

          e.preventDefault();

      });

      wbWrap.addEventListener('pointermove', function(e) {

          if (!isMeasuring || !activeMeasure) return;

          var p = measurePoint(e);

          activeMeasure.x2 = p.x; activeMeasure.y2 = p.y;

          renderMeasures();

      });

  }

  document.addEventListener('pointerup', function() {

      if (isMeasuring && activeMeasure) {

          if (Math.hypot(activeMeasure.x2 - activeMeasure.x1, activeMeasure.y2 - activeMeasure.y1) > 2) measures.push(activeMeasure);

          activeMeasure = null;

          renderMeasures();

      }

      isMeasuring = false;

  });

  /* ---- blast template: a grenade's area effect on the board (handbook ch. 7 / ch. 11) ----
     A sub-mode of Measure (window.wpMeasureKind = 'blast'): click a cell to drop a template.
     Radius is the weapon's area effect in feet (÷3 → yards). Every token within it lights up
     with its distance printed, so the GM applies damage ÷ (3 × d) by hand — Waypoint never
     rolls. Horizontal distance is hex distance in yards (one hex = one yard unless the map's
     scale says otherwise; squares and gridless maps fall back to straight pixels); with the
     Elevation toggle on, the vertical difference between the token and the template's own
     height joins it straight-line: d = sqrt(h² + v²). Templates are local, like rulers —
     never saved, never sent. */
  window.wpMeasureKind = 'ruler';
  var blasts = [];
  var blastDefaults = { ft: 12, name: 'Frag' };
  try { var _bf = JSON.parse(localStorage.getItem('wp_blast') || 'null'); if (_bf && _bf.ft > 0) blastDefaults = { ft: _bf.ft, name: _bf.name || '' }; } catch (e) {}
  var _blastHitIds = [];
  var blastDrag = null;   // { i, sx, sy, ox, oy, moved } while a blast is being dragged
  function unitToYd(u) { return { yd: 1, ft: 1 / 3, m: 1.09361, km: 1093.61, mi: 1760 }[u] || 1; }
  function cellYards() { var cfg = mapMeasureConfig(); return cfg.per * unitToYd(cfg.unit); }
  function hexCellOf(x, y) {   // same rounding as datamap.js snapToHex (flat-top, s = 30, 52 px rows)
      var s = 30, h = 52, q = (x - s / 2) / (1.5 * s), r = y / h - q / 2;
      var rx = Math.round(q), ry = Math.round(r), rz = Math.round(-q - r);
      var dx = Math.abs(rx - q), dy = Math.abs(ry - r), dz = Math.abs(rz - (-q - r));
      if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz;
      return { q: rx, r: ry };
  }
  function hexDist(a, b) { var dq = a.q - b.q, dr = a.r - b.r; return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)); }
  function tokenCentre(t) { return { x: t.x + (t.w || 60) / 2, y: t.y + (t.h || 52) / 2 }; }
  function tokenAtPoint(map, x, y) {   // topmost character token whose box holds the point
      var hit = null;
      (map.whiteboard || []).forEach(function(t) { if (t.isChar && x >= t.x && x <= t.x + (t.w || 60) && y >= t.y && y <= t.y + (t.h || 52)) hit = t; });
      return hit;
  }
  // Horizontal distance in yards between two board points, the way the handbook counts it
  function boardYards(ax, ay, bx, by) {
      if (state.gridType === 'hex') return hexDist(hexCellOf(ax, ay), hexCellOf(bx, by)) * cellYards();
      return Math.hypot(bx - ax, by - ay) / mapMeasureConfig().cellPx * cellYards();
  }
  function blastRadiusYd(b) { return b.ft / 3; }
  function blastDistances(b, map) {   // every character token (hidden ones too — the GM is the only viewer)
      var elevOn = stanceOn('elevation');
      return (map.whiteboard || []).filter(function(t) { return t.isChar; }).map(function(t) {
          var c = tokenCentre(t);
          var h = boardYards(b.x, b.y, c.x, c.y);
          var v = elevOn ? tokenElevation(t) - (b.elev || 0) : 0;
          return { tok: t, h: h, v: v, d: Math.sqrt(h * h + v * v) };
      });
  }
  function blastSvg() {
      var map = getActiveMap(); if (!map || !blasts.length) return '';
      var pxPerYd = mapMeasureConfig().cellPx / cellYards(), elevOn = stanceOn('elevation'), html = '';
      blasts.forEach(function(b, i) {
          var rYd = blastRadiusYd(b), rPx = rYd * pxPerYd;
          html += '<g class="blast" data-i="' + i + '"><title>Drag to move \u00b7 right-click to remove</title>';
          html += '<circle class="area" cx="' + b.x + '" cy="' + b.y + '" r="' + rPx + '"></circle><circle class="ring" cx="' + b.x + '" cy="' + b.y + '" r="' + rPx + '"></circle><circle class="dot" cx="' + b.x + '" cy="' + b.y + '" r="6"></circle>';
          var lbl = (b.name ? esc(b.name) + ' ' : '') + b.ft + ' ft \u00b7 r ' + _r1(rYd) + ' yd' + (elevOn ? ' \u00b7 at ' + fmtElev(b.elev || 0) + ' yd' : '');
          html += '<text x="' + (b.x + 8) + '" y="' + (b.y - rPx - 8) + '">' + lbl + '</text>';
          blastDistances(b, map).forEach(function(r) {
              if (r.d > rYd + 1e-9) return;
              html += '<text class="hit" x="' + (r.tok.x + (r.tok.w || 60) / 2) + '" y="' + (r.tok.y - 5) + '" text-anchor="middle">' + _r1(r.d) + ' yd' + (elevOn && r.v ? ' (' + (r.v > 0 ? '\u2191' : '\u2193') + _r1(Math.abs(r.v)) + ')' : '') + '</text>';
          });
          html += '</g>';
      });
      return html;
  }
  function applyBlastHits() {
      var map = getActiveMap(), hit = {};
      if (map && blasts.length) blasts.forEach(function(b) { var rYd = blastRadiusYd(b); blastDistances(b, map).forEach(function(r) { if (r.d <= rYd + 1e-9) hit[r.tok.id] = true; }); });
      _blastHitIds.forEach(function(id) { if (!hit[id] && state.wbEls[id]) state.wbEls[id].classList.remove('blast-hit'); });
      _blastHitIds = Object.keys(hit);
      _blastHitIds.forEach(function(id) { if (state.wbEls[id]) state.wbEls[id].classList.add('blast-hit'); });
  }
  window.wpRefreshBlasts = function() { if (blasts.length || _blastHitIds.length) renderMeasures(); };
  window.wpBlasts = function() { return blasts; };   // sandbox testing hook
  function clearBlasts() { blasts = []; renderMeasures(); }
  // Seat a blast in its grid cell; a blast whose height was never edited follows the token standing there
  function seatBlast(b) {
      if (state.gridType === 'hex') { var hc = snapToHex(b.x, b.y, 30, 'center'); b.x = hc.x; b.y = hc.y; }
      else if (state.gridType === 'square') { b.x = Math.floor(b.x / 50) * 50 + 25; b.y = Math.floor(b.y / 50) * 50 + 25; }
      if (b.autoElev) { var mapS = getActiveMap(), under = mapS && tokenAtPoint(mapS, b.x, b.y); b.elev = under ? tokenElevation(under) : 0; }
  }
  function placeBlast(e) {
      var map = getActiveMap(); if (!map) return;
      var box = wbWrap.getBoundingClientRect();
      var x = (e.clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel;
      var y = (e.clientY - box.top + wbWrap.scrollTop) / state.zoomLevel;
      // A grenade lands in a cell, at the height of whoever stands there (a token on a catwalk), else the ground
      var b = { x: x, y: y, ft: blastDefaults.ft, name: blastDefaults.name, elev: 0, autoElev: true };
      seatBlast(b);
      blasts.push(b);
      renderMeasures(); syncBlastMenu();
      var n = blastDistances(b, map).filter(function(r) { return r.d <= blastRadiusYd(b) + 1e-9; }).length;
      toast((b.name ? b.name + ' ' : 'Blast ') + b.ft + ' ft placed' + (stanceOn('elevation') ? ' at ' + fmtElev(b.elev) + ' yd' : '') + ' \u2014 ' + n + ' token' + (n === 1 ? '' : 's') + ' in range. Drag it to move, right-click to remove.');
  }
  var _el_blastModeBtn = document.getElementById('blastModeBtn');
  var _el_blastMenu = document.getElementById('blastMenu');
  function closeBlastMenu() { if (_el_blastMenu) _el_blastMenu.classList.remove('show'); }
  function lastBlast() { return blasts.length ? blasts[blasts.length - 1] : null; }
  function syncBlastMenu() {
      if (!_el_blastMenu) return;
      var b = lastBlast(), ft = b ? b.ft : blastDefaults.ft, nm = b ? b.name : blastDefaults.name;
      document.querySelectorAll('#blastPresetRow .draw-style-btn').forEach(function(x) { x.classList.toggle('active', parseInt(x.dataset.ft, 10) === ft && x.dataset.name === nm); });
      var ftIn = document.getElementById('blastFt'); if (ftIn && document.activeElement !== ftIn) ftIn.value = ft;
      var elIn = document.getElementById('blastElev'); if (elIn && document.activeElement !== elIn) elIn.value = b ? (b.elev || 0) : 0;
      var elRow = document.getElementById('blastElevRow'); if (elRow) elRow.style.display = stanceOn('elevation') ? '' : 'none';
      var flat = document.getElementById('blastFlatNote'); if (flat) flat.style.display = stanceOn('elevation') ? 'none' : '';
      var which = document.getElementById('blastWhich'); if (which) which.textContent = b ? 'Changes apply to the last blast placed (' + blasts.length + ' on this map).' : 'Click a cell on the map to place a blast.';
  }
  function setBlastShape(ft, name) {
      ft = Math.round(Number(ft) || 0);
      if (!(ft > 0)) { syncBlastMenu(); return; }
      ft = Math.min(3000, ft);
      blastDefaults = { ft: ft, name: name || '' };
      try { localStorage.setItem('wp_blast', JSON.stringify(blastDefaults)); } catch (e) {}
      var b = lastBlast(); if (b) { b.ft = ft; b.name = name || ''; renderMeasures(); }
      syncBlastMenu();
  }
  if (_el_blastModeBtn) _el_blastModeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!window.isMeasureMode || window.wpMeasureKind !== 'blast') {
          window.isMeasureMode = true; window.wpMeasureKind = 'blast';
          window.isDrawingMode = false; window.isEraserMode = false;
          if (wbWrap) wbWrap.style.cursor = 'crosshair';
          updateWbToolbar('blastModeBtn');
          closeDrawMenu(); if (_el_measureMenu) _el_measureMenu.classList.remove('show');
          state.selWbId = null; state.selWbIds = []; render();
          if (_el_blastMenu) { syncBlastMenu(); _el_blastMenu.classList.add('show'); }
      } else if (_el_blastMenu) { syncBlastMenu(); _el_blastMenu.classList.toggle('show'); }
  });
  document.querySelectorAll('#blastPresetRow .draw-style-btn').forEach(function(b) { b.addEventListener('click', function() { setBlastShape(this.dataset.ft, this.dataset.name); }); });
  var _el_blastFt = document.getElementById('blastFt');
  if (_el_blastFt) _el_blastFt.addEventListener('change', function() { setBlastShape(this.value, ''); });
  var _el_blastElev = document.getElementById('blastElev');
  if (_el_blastElev) _el_blastElev.addEventListener('input', function() { var b = lastBlast(); if (!b) return; var v = Number(this.value); b.elev = isFinite(v) ? Math.max(-999, Math.min(999, v)) : 0; b.autoElev = false; renderMeasures(); });
  var _el_blastClearBtn = document.getElementById('blastClearBtn');
  if (_el_blastClearBtn) _el_blastClearBtn.addEventListener('click', function() { clearBlasts(); syncBlastMenu(); });
  if (_el_blastMenu) ['pointerdown', 'click'].forEach(function(ev) { _el_blastMenu.addEventListener(ev, function(e) { e.stopPropagation(); }); });
  document.addEventListener('click', function(e) {
      if (_el_blastMenu && _el_blastMenu.classList.contains('show') && !e.target.closest('#blastMenu') && !e.target.closest('#blastModeBtn')) closeBlastMenu();
  });

  // Pen preferences survive restarts: colour, width, freehand/line (wp_drawColor / wp_drawWidth / wp_drawStraight)
  try { var _dc0 = localStorage.getItem('wp_drawColor'); if (_dc0 && /^#[0-9a-f]{6}$/i.test(_dc0)) state.drawColor = _dc0; } catch (e) {}
  try { var _dw0 = parseInt(localStorage.getItem('wp_drawWidth'), 10); if ([2, 3, 6, 10, 16].indexOf(_dw0) !== -1) state.drawStrokeWidth = _dw0; } catch (e) {}
  try { if (localStorage.getItem('wp_drawStraight') !== null) state.drawStraight = localStorage.getItem('wp_drawStraight') === '1'; } catch (e) {}
  var _dci0 = document.getElementById('drawColorInput'); if (_dci0 && /^#[0-9a-f]{6}$/i.test(state.drawColor || '')) _dci0.value = state.drawColor;
  function saveDrawPrefs() { try { localStorage.setItem('wp_drawColor', state.drawColor); localStorage.setItem('wp_drawWidth', String(state.drawStrokeWidth)); localStorage.setItem('wp_drawStraight', state.drawStraight ? '1' : '0'); } catch (e) {} }
  syncDrawMenu();
  document.querySelectorAll('#drawColorRow .draw-swatch[data-color]').forEach(function(sw) {
      sw.addEventListener('click', function() {
          state.drawColor = this.dataset.color;
          saveDrawPrefs();
          var input = document.getElementById('drawColorInput');
          if(input) input.value = this.dataset.color;
          syncDrawMenu();
      });
  });

  var drawColorInput = document.getElementById('drawColorInput');
  if(drawColorInput) drawColorInput.addEventListener('input', function() {
      state.drawColor = this.value;
      saveDrawPrefs();
      syncDrawMenu();
  });

  document.querySelectorAll('#drawSizeRow .draw-size-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
          state.drawStrokeWidth = parseInt(this.dataset.size);
          saveDrawPrefs();
          syncDrawMenu();
      });
  });

  document.querySelectorAll('#drawStyleRow .draw-style-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
          state.drawStraight = this.dataset.straight === 'true';
          saveDrawPrefs();
          syncDrawMenu();
      });
  });

  // Close the pen options when drawing starts on the board
  if(wbWrap) wbWrap.addEventListener('pointerdown', closeDrawMenu);

  // Close the pen options when clicking outside the menu
  document.addEventListener('click', function(e) {
      if(_el_drawMenu && _el_drawMenu.classList.contains('show') &&
         !e.target.closest('#drawMenu') && e.target !== _el_drawModeBtn && !e.target.closest('#drawModeBtn')) {
          closeDrawMenu();
      }
  });

  syncDrawMenu();

  var _el_addImageBtn = document.getElementById('addImageBtn');

if(_el_addImageBtn) _el_addImageBtn.addEventListener('click', () => document.getElementById('imgFileIn').click());

  /* ---------- image library ---------- */

  var _imgLibCache = null;
  /* ---- library categories ----
     Metadata in the save (appState.imageCats = { list: [names], by: { path: name } }), never file
     moves, so nothing that uses a picture is touched. '' = All, '__none' = No category. */
  var _imgLibCat = '';
  var _imgLibMap = '';   // '' = every map; else a folder key
  function renderImgMaps(folderLabel) {
      var row = document.getElementById('imgLibMaps'); if (!row) return;
      var counts = {}, labels = {};
      (_imgLibCache || []).forEach(function(im) { var f = im.folder || ''; counts[f] = (counts[f] || 0) + 1; labels[f] = folderLabel(f); });
      var keys = Object.keys(counts).sort(function(a, b) { return labels[a].localeCompare(labels[b]); });
      if (_imgLibMap && !counts[_imgLibMap]) _imgLibMap = '';
      row.innerHTML = '<span class="journal-chip-label">Map</span>'
          + '<button class="journal-from' + (!_imgLibMap ? ' active' : '') + '" data-map="">All</button>'
          + keys.map(function(k) { return '<button class="journal-from' + (_imgLibMap === k ? ' active' : '') + '" data-map="' + esc(k) + '" title="' + esc(labels[k]) + '">' + esc(labels[k]) + ' <span class="journal-count">' + counts[k] + '</span></button>'; }).join('');
  }
  (function wireImgMaps() {
      var row = document.getElementById('imgLibMaps'); if (!row) return;
      row.addEventListener('click', function(e) {
          var b = e.target.closest && e.target.closest('button[data-map]'); if (!b) return;
          _imgLibMap = b.dataset.map || ''; renderImgLib(document.getElementById('imgLibSearch').value);
      });
  })();
  function imgCats() {
      var s = state.appState; if (!s) return { list: [], by: {} };
      if (!s.imageCats || typeof s.imageCats !== 'object') s.imageCats = { list: [], by: {} };
      if (!Array.isArray(s.imageCats.list)) s.imageCats.list = [];
      if (!s.imageCats.by || typeof s.imageCats.by !== 'object') s.imageCats.by = {};
      if (!s.imageCats.shelf || typeof s.imageCats.shelf !== 'object') s.imageCats.shelf = {};   // categories kept out of All ("own shelf")
      return s.imageCats;
  }
  function imgCatsOf(path) {   // every category this picture is in (old saves stored one name)
      var c = imgCats(); var v = c.by[path]; if (!v) return [];
      var arr = Array.isArray(v) ? v : [v];
      return arr.filter(function(n) { return c.list.indexOf(n) >= 0; });
  }
  function imgCatOf(path) { var a = imgCatsOf(path); return a.length ? a.join(', ') : ''; }
  function imgCatHas(path, name) { return imgCatsOf(path).indexOf(name) >= 0; }
  function imgCatWrite(path, arr) { var c = imgCats(); if (arr.length) c.by[path] = arr; else delete c.by[path]; }
  function imgCatsSave() { import('./io.js').then(function(m) { m.save(true); }); }
  // Tag a set of pictures with a category (creating it), optionally on its own shelf — the tutorial uses it
  window.wpImgCatEnsure = function(name, paths, shelf) {
      var c = imgCats();
      if (c.list.indexOf(name) < 0) c.list.push(name);
      (paths || []).forEach(function(p) { var a = imgCatsOf(p); if (a.indexOf(name) < 0) { a.push(name); imgCatWrite(p, a); } });
      if (shelf) c.shelf[name] = true;
  };
  // Rename a category everywhere (list, tags, shelf); a no-op when it does not exist or the new name is taken
  window.wpImgCatRename = function(oldName, newName) {
      var c = imgCats(); if (c.list.indexOf(oldName) < 0 || c.list.indexOf(newName) >= 0) return false;
      c.list[c.list.indexOf(oldName)] = newName;
      Object.keys(c.by).forEach(function(p) { var arr = Array.isArray(c.by[p]) ? c.by[p] : [c.by[p]]; c.by[p] = arr.map(function(n) { return n === oldName ? newName : n; }); });
      if (c.shelf[oldName]) { delete c.shelf[oldName]; c.shelf[newName] = true; }
      return true;
  };
  // Where a picture is used: play-map items, room scenes, portraits, handouts — across every campaign
  function imgUsage(src) {
      var n = 0, maps = {};
      Object.values(state.appState.campaigns || {}).forEach(function(camp) {
          Object.values(camp.items || {}).forEach(function(it) {
              (it.whiteboard || []).forEach(function(w) { if (w.src === src) { n++; maps[it.meta && it.meta.title || it.id] = 1; } });
              (it.rooms || []).forEach(function(r) { if (r.image === src) { n++; maps[it.meta && it.meta.title || it.id] = 1; } (r.characters || []).forEach(function(ch) { if (ch.portrait === src) { n++; maps[it.meta && it.meta.title || it.id] = 1; } }); });
          });
          Object.values(camp.handouts || {}).forEach(function(h) { if (h.src === src) { n++; maps['handouts'] = 1; } });
      });
      return { count: n, maps: Object.keys(maps) };
  }
  function renderImgCats() {
      var row = document.getElementById('imgLibCats'); if (!row) return;
      var c = imgCats(), counts = {}, none = 0;
      (_imgLibCache || []).forEach(function(im) { var ns = imgCatsOf(im.path); if (ns.length) ns.forEach(function(n) { counts[n] = (counts[n] || 0) + 1; }); else none++; });
      if (_imgLibCat && _imgLibCat !== '__none' && _imgLibCat !== '__bymap' && c.list.indexOf(_imgLibCat) < 0) _imgLibCat = '';
      var html = '<span class="journal-chip-label">Show</span>'
          + '<button class="journal-from' + (!_imgLibCat ? ' active' : '') + '" data-cat="">All <span class="journal-count">' + (_imgLibCache || []).filter(function(im) { return !imgCatsOf(im.path).some(function(n) { return c.shelf[n]; }); }).length + '</span></button>'
          + '<button class="journal-from' + (_imgLibCat === '__bymap' ? ' active' : '') + '" data-cat="__bymap" title="Every picture, grouped under the map it belongs to">By map</button>'
          + c.list.map(function(n) { return '<button class="journal-from' + (_imgLibCat === n ? ' active' : '') + '" data-cat="' + esc(n) + '">' + esc(n) + ' <span class="journal-count">' + (counts[n] || 0) + '</span></button>'; }).join('')
          + '<button class="journal-from' + (_imgLibCat === '__none' ? ' active' : '') + '" data-cat="__none">No category <span class="journal-count">' + none + '</span></button>'
          + '<button class="journal-from img-cat-new" data-act="new" title="Make a category">+ New</button>'
          + (_imgLibCat && _imgLibCat !== '__none' && _imgLibCat !== '__bymap' ? '<button class="journal-from img-cat-tool" data-act="shelf" title="Own shelf: its pictures show here only, not under All">' + (imgCats().shelf[_imgLibCat] ? 'Own shelf: on' : 'Own shelf: off') + '</button><button class="journal-from img-cat-tool" data-act="rename" title="Rename this category">Rename</button><button class="journal-from img-cat-tool danger" data-act="delete" title="Remove this category — its pictures stay, just untagged">Delete</button>' : '');
      row.innerHTML = html;
  }
  // act: 'add' (tag with another), 'move' (drop the current view's category, tag with the chosen one), 'remove'
  function imgCatChange(path, act, name) {
      var cur = imgCatsOf(path), from = (_imgLibCat && _imgLibCat !== '__none' && _imgLibCat !== '__bymap') ? _imgLibCat : '';
      if (act === 'remove') cur = cur.filter(function(n) { return n !== name; });
      else {
          if (act === 'move' && from) cur = cur.filter(function(n) { return n !== from; });
          if (name && cur.indexOf(name) < 0) cur.push(name);
      }
      imgCatWrite(path, cur);
      imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
      var pv = document.getElementById('imgLibPreview');
      if (pv && pv.style.display !== 'none' && pv.dataset.src === path) openImgPreview(path);
  }
  function imgCatAssign(path, name) { imgCatChange(path, 'add', name); }   // kept for older callers
  function imgCatNew(cb) {
      showPrompt('New category:', '', function(name) {
          name = String(name || '').trim().slice(0, 40); if (!name) return;
          var c = imgCats();
          if (c.list.indexOf(name) < 0) c.list.push(name);
          imgCatsSave(); if (cb) cb(name); else renderImgLib(document.getElementById('imgLibSearch').value);
      });
  }
  // The category menu for one picture. Inside a category view it offers Move (out of this one, into
  // another) and Remove; everywhere it offers Add (a picture can be in several categories).
  function openImgCatMenu(src, x, y) {
      var menu = document.getElementById('imgCatMenu'); if (!menu) return;
      var c = imgCats(), mine = imgCatsOf(src);
      var from = (_imgLibCat && _imgLibCat !== '__none' && _imgLibCat !== '__bymap') ? _imgLibCat : '';
      var others = c.list.filter(function(n) { return mine.indexOf(n) < 0; });
      var html = '<div class="party-menu-head">Add to category</div>'
          + others.map(function(n) { return '<button class="wb-tool-btn party-menu-item" data-act="add" data-cat="' + esc(n) + '">' + esc(n) + '</button>'; }).join('')
          + '<button class="wb-tool-btn party-menu-item" data-act="new-add">+ New category\u2026</button>';
      if (from && mine.indexOf(from) >= 0) {
          html += '<div class="party-menu-head">Move from ' + esc(from) + ' to</div>'
              + others.map(function(n) { return '<button class="wb-tool-btn party-menu-item" data-act="move" data-cat="' + esc(n) + '">' + esc(n) + '</button>'; }).join('')
              + '<button class="wb-tool-btn party-menu-item" data-act="new-move">+ New category\u2026</button>'
              + '<button class="wb-tool-btn party-menu-item danger" data-act="remove" data-cat="' + esc(from) + '">Remove from ' + esc(from) + '</button>';
      }   // in All, By map and No category only Add is offered
      menu.dataset.src = src;
      menu.innerHTML = html;
      menu.style.display = 'flex'; menu.classList.add('show');
      window.wpClampMenu(menu, x, y);
  }
  function hideImgCatMenu() { var m = document.getElementById('imgCatMenu'); if (m) m.classList.remove('show'), m.style.display = 'none'; }
  (function wireImgCats() {
      var row = document.getElementById('imgLibCats'), grid = document.getElementById('imgLibGrid'), menu = document.getElementById('imgCatMenu');
      if (!row || !grid || !menu) return;
      row.addEventListener('click', function(e) {
          var b = e.target.closest && e.target.closest('button'); if (!b) return;
          var act = b.dataset.act;
          if (act === 'new') { imgCatNew(function(name) { _imgLibCat = name; renderImgLib(document.getElementById('imgLibSearch').value); }); return; }
          if (act === 'shelf') {
              var cs = imgCats(); if (cs.shelf[_imgLibCat]) delete cs.shelf[_imgLibCat]; else cs.shelf[_imgLibCat] = true;
              imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
              toast(cs.shelf[_imgLibCat] ? '"' + _imgLibCat + '" is on its own shelf: its pictures no longer appear under All.' : '"' + _imgLibCat + '" shows under All again.');
              return;
          }
          if (act === 'rename') {
              var old = _imgLibCat, c = imgCats();
              showPrompt('Rename category:', old, function(name) {
                  name = String(name || '').trim().slice(0, 40); if (!name || name === old) return;
                  var i = c.list.indexOf(old); if (i >= 0) c.list[i] = name;
                  Object.keys(c.by).forEach(function(p) { var arr = Array.isArray(c.by[p]) ? c.by[p] : [c.by[p]]; c.by[p] = arr.map(function(n) { return n === old ? name : n; }); });
                  _imgLibCat = name; imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
              });
              return;
          }
          if (act === 'delete') {
              var del = _imgLibCat, cc = imgCats(), n = Object.keys(cc.by).filter(function(p) { return imgCatHas(p, del); }).length;
              showConfirm('Delete the category "' + del + '"? ' + (n ? n + ' picture' + (n === 1 ? ' loses' : 's lose') + ' that tag — nothing is deleted.' : 'It is empty.'), function(yes) {
                  if (!yes) return;
                  var wasShelf = !!cc.shelf[del], members = Object.keys(cc.by).filter(function(p) { return imgCatHas(p, del) && p.indexOf('/saves/images/') === 0; });
                  cc.list = cc.list.filter(function(x) { return x !== del; }); delete cc.shelf[del];
                  Object.keys(cc.by).forEach(function(p) { imgCatWrite(p, imgCatsOf(p).filter(function(x) { return x !== del; })); });
                  _imgLibCat = ''; imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
                  // Offer to remove the pictures' files as well (the category itself is only a tag)
                  if (members.length) {
                      var used = members.filter(function(p) { return imgUsage(p).count > 0; }).length;
                      showConfirm('Also delete the ' + members.length + ' picture file' + (members.length === 1 ? '' : 's') + ' that were in "' + del + '" from your saves folder? This cannot be undone.' + (used ? '\n\n' + used + ' of them ' + (used === 1 ? 'is' : 'are') + ' still used on a map or in a handout and would show as broken pictures there.' : '\n\nNone of them is used anywhere.'), function(yesFiles) {
                          if (!yesFiles) return;
                          var i = 0, gone = 0, oldCore = false;
                          function next() {
                              if (i >= members.length) {
                                  var goneSet = {}; members.slice(0, gone).forEach(function(p) { goneSet[p] = 1; });
                                  _imgLibCache = (_imgLibCache || []).filter(function(im) { return !goneSet[im.path]; });
                                  members.forEach(function(p) { delete cc.by[p]; }); imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
                                  toast(oldCore ? 'Deleting pictures needs the 1.4.6 core \u2014 run the installer from Settings \u2192 Updates & about.' : 'Deleted ' + gone + ' picture file' + (gone === 1 ? '' : 's') + '.');
                                  return;
                              }
                              var batch = members.slice(i, i + 4); i += 4;
                              Promise.all(batch.map(function(src) { return fetch('/api/delete-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: src }) }).then(function(r) { if (r.status === 404 && !r.headers.get('content-type')) oldCore = true; else if (r.ok) gone++; }).catch(function() {}); })).then(next);
                          }
                          next();
                      });
                  }
              });
              return;
          }
          if (b.dataset.cat !== undefined) { _imgLibCat = b.dataset.cat; renderImgLib(document.getElementById('imgLibSearch').value); }
      });
      // right-click a picture: add it to a category (and, inside a category, move it or take it out)
      grid.addEventListener('contextmenu', function(e) {
          var cell = e.target.closest && e.target.closest('.img-lib-cell'); if (!cell || cell.classList.contains('cast-cell')) return;
          e.preventDefault(); e.stopPropagation();
          openImgCatMenu(cell.dataset.src, e.clientX, e.clientY);
      });
      menu.addEventListener('click', function(e) {
          var b = e.target.closest && e.target.closest('button'); if (!b) return;
          e.stopPropagation();
          var src = menu.dataset.src, act = b.dataset.act, cat = b.dataset.cat || ''; hideImgCatMenu();
          if (act === 'new-add' || act === 'new-move') { imgCatNew(function(name) { imgCatChange(src, act === 'new-move' ? 'move' : 'add', name); }); return; }
          if (act === 'add' || act === 'move' || act === 'remove') imgCatChange(src, act, cat);
      });
      document.addEventListener('pointerdown', function(e) { if (menu.style.display !== 'none' && !e.target.closest('#imgCatMenu')) hideImgCatMenu(); }, true);
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape') hideImgCatMenu(); });
  })();

  function renderImgLib(filter) {
      var grid = document.getElementById('imgLibGrid');
      if (!grid || !_imgLibCache) return;
      // The Campaign Cast shows inside a shelf category (the tutorial's "Default") and nowhere else
      grid.dataset.cast = (!_imgLibPick && state.viewMode === 'visual' && !!(_imgLibCat && imgCats().shelf[_imgLibCat])) ? '1' : '';
      var q = (filter || '').toLowerCase();
      var camp = getActiveCampaign();
      // players' journals live under images/journal/ — not campaign art, keep them out of the library
      _imgLibCache = _imgLibCache.filter(function(i) { return !/^journal(\/|$)/.test(i.folder || ''); });
      function folderLabel(folder) {
          var it = camp && camp.items[folder];
          return (it && it.meta && it.meta.title) ? it.meta.title : folder;
      }
      renderImgCats(); renderImgMaps(folderLabel);
      var byFolder = {};
      _imgLibCache.forEach(function(im) {
          var label = folderLabel(im.folder), cat = imgCatOf(im.path);
          var byMap = _imgLibCat === '__bymap';
          if (_imgLibCat === '__none' ? cat : (_imgLibCat && !byMap && !imgCatHas(im.path, _imgLibCat))) return;
          if ((!_imgLibCat || byMap) && imgCatsOf(im.path).some(function(n) { return imgCats().shelf[n]; })) return;   // shelved pictures show under their own category only
          if (q && im.name.toLowerCase().indexOf(q) === -1 && label.toLowerCase().indexOf(q) === -1 && (cat || '').toLowerCase().indexOf(q) === -1) return;
          var key = byMap ? label : '';
          (byFolder[key] = byFolder[key] || []).push(im);
      });
      var html = '';
      Object.keys(byFolder).sort().forEach(function(label) {
          if (label) html += '<div style="color:var(--gold); font-size:11px; text-transform:uppercase; letter-spacing:.06em; margin:12px 0 6px;">' + label + ' <span style="color:var(--dim);">(' + byFolder[label].length + ')</span></div>';
          html += '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(96px, 1fr)); gap:8px;">';
          byFolder[label].forEach(function(im) {
              var catTag = (!_imgLibCat || _imgLibCat === '__bymap') && imgCatOf(im.path) ? '<span class="img-lib-tag">' + esc(imgCatOf(im.path)) + '</span>' : '';
              html += '<div class="img-lib-cell" data-src="' + im.path + '" title="' + im.name + (imgCatOf(im.path) ? ' \u00b7 ' + esc(imgCatOf(im.path)) : '') + ' \u2014 right-click to add it to a category">' +
                  '<img src="' + encodeURI(im.path) + '" loading="lazy">' + catTag +
                  '<div class="img-lib-name">' + im.name + '</div></div>';
          });
          html += '</div>';
      });
      grid.innerHTML = (grid.dataset.cast ? castLibraryHtml(filter) : '') + html || '<div style="color:var(--dim); padding:20px; text-align:center;">' + (_imgLibCat && _imgLibCat !== '__bymap' ? 'Nothing in this category yet — right-click a picture under All and add it here.' : 'No images match.') + '</div>';
  }

  var _el_importCharBtn = document.getElementById('importCharBtn');

  if (_el_importCharBtn) _el_importCharBtn.addEventListener('click', function() {
      var fi = document.getElementById('sheetFileIn');
      if (!fi) return;
      fi.onchange = function() {
          var f = this.files[0];
          this.value = '';
          import('./shadowbase.js').then(function(m) { m.importCharacterToken(f); });
      };
      fi.click();
  });

  var _el_sheetViewClose = document.getElementById('sheetViewCloseBtn');
  if (_el_sheetViewClose) _el_sheetViewClose.addEventListener('click', function() {
      document.getElementById('sheetViewModal').style.display = 'none';
  });

  var _imgLibPick = null;   // a callback waiting for a picture (planner image block)
  window.wpPickImage = async function(cb) {
      _imgLibPick = cb;
      document.getElementById('imgLibModal').style.display = 'flex';
      document.getElementById('imgLibGrid').innerHTML = '<div style="color:var(--dim); padding:20px;">Loading…</div>';
      try { _imgLibCache = await (await fetch('/api/list-images')).json(); } catch (e) { _imgLibCache = []; }
      renderImgLib(document.getElementById('imgLibSearch').value);
  };
  var _el_imgLibBtn = document.getElementById('imgLibBtn');

  if (_el_imgLibBtn) _el_imgLibBtn.addEventListener('click', async function() {
      document.getElementById('imgLibModal').style.display = 'flex';
      document.getElementById('imgLibGrid').innerHTML = '<div style="color:var(--dim); padding:20px;">Loading…</div>';
      try {
          _imgLibCache = await (await fetch('/api/list-images')).json();
      } catch(e) { _imgLibCache = []; }
      renderImgLib(document.getElementById('imgLibSearch').value);
  });

  var _el_imgLibClose = document.getElementById('imgLibCloseBtn');

  if (_el_imgLibClose) _el_imgLibClose.addEventListener('click', function() {
      _imgLibPick = null; closeImgPreview();
      document.getElementById('imgLibModal').style.display = 'none';
  });

  var _el_imgLibSearch = document.getElementById('imgLibSearch');

  if (_el_imgLibSearch) _el_imgLibSearch.addEventListener('input', function() { renderImgLib(this.value); });

  var _el_imgLibGrid = document.getElementById('imgLibGrid');

  if (_el_imgLibGrid) _el_imgLibGrid.addEventListener('click', function(e) {
      var cell = e.target.closest('.img-lib-cell');
      if (!cell) return;
      if (cell.classList.contains('cast-cell')) {
          var five = e.target.closest('.cast-cell-five');
          var amC = getActiveMap();
          if (!amC || amC.type !== 'map' || state.viewMode !== 'visual') { toast('Open a play map first.'); return; }
          var ctr = viewCentre();
          castPlace(cell.dataset.cid, ctr.x, ctr.y, five ? 5 : 1);
          document.getElementById('imgLibModal').style.display = 'none';
          return;
      }
      openImgPreview(cell.dataset.src);   // a large look first; Add to map (or Use this picture) is a deliberate press
  });
  /* ---- library preview ---- */
  function imgLibEntry(src) { return (_imgLibCache || []).find(function(i) { return i.path === src; }) || null; }
  function openImgPreview(src) {
      var pv = document.getElementById('imgLibPreview'), grid = document.getElementById('imgLibGrid'); if (!pv || !grid) return;
      var im = imgLibEntry(src), camp = getActiveCampaign();
      var folder = im ? im.folder : '', mapIt = camp && camp.items[folder], mapName = (mapIt && mapIt.meta && mapIt.meta.title) || folder || '';
      document.getElementById('imgLibPreviewImg').src = encodeURI(src);
      document.getElementById('imgLibPreviewName').textContent = im ? im.name : src.split('/').pop();
      var cat = imgCatOf(src);
      document.getElementById('imgLibPreviewMeta').innerHTML = (mapName ? '<div>Map: <b>' + esc(mapName) + '</b></div>' : '') + '<div>Categor' + (imgCatsOf(src).length === 1 ? 'y' : 'ies') + ': <b>' + (cat ? esc(cat) : 'none') + '</b></div>';
      var catBtn = document.getElementById('imgLibPreviewCat'), fromV = (_imgLibCat && _imgLibCat !== '__none' && _imgLibCat !== '__bymap') ? _imgLibCat : '';
      if (catBtn) { catBtn.innerHTML = fromV ? 'Add / move category\u2026' : 'Add to category\u2026'; catBtn.title = fromV ? 'Add another category, move it out of ' + fromV + ', or take it out' : 'Tag this picture with a category (it can be in several)'; }
      var add = document.getElementById('imgLibPreviewAdd');
      add.textContent = _imgLibPick ? 'Use this picture' : 'Add to map';
      add.title = _imgLibPick ? 'Put this picture in the block' : 'Place it on the current play map';
      pv.dataset.src = src;
      grid.style.display = 'none'; pv.style.display = 'flex';
      // arrows step through the pictures in the order the grid shows them
      var listN = imgPreviewList(), at = listN.indexOf(src);
      var prevB = document.getElementById('imgLibPrevBtn'), nextB = document.getElementById('imgLibNextBtn'), cnt = document.getElementById('imgLibPreviewCount');
      if (prevB) prevB.disabled = at <= 0;
      if (nextB) nextB.disabled = at < 0 || at >= listN.length - 1;
      if (cnt) cnt.textContent = at >= 0 ? (at + 1) + ' / ' + listN.length : '';
  }
  // The pictures currently in the grid (the search / category filter applied), in grid order
  function imgPreviewList() {
      var grid = document.getElementById('imgLibGrid'); if (!grid) return [];
      return Array.prototype.map.call(grid.querySelectorAll('.img-lib-cell[data-src]'), function(c) { return c.dataset.src; });
  }
  function imgPreviewStep(dir) {
      var pv = document.getElementById('imgLibPreview'); if (!pv || pv.style.display === 'none') return;
      var list = imgPreviewList(), at = list.indexOf(pv.dataset.src), to = at + dir;
      if (at < 0 || to < 0 || to >= list.length) return;
      openImgPreview(list[to]);
  }
  function closeImgPreview() {
      var pv = document.getElementById('imgLibPreview'), grid = document.getElementById('imgLibGrid'); if (!pv || !grid) return;
      pv.style.display = 'none'; grid.style.display = '';
      document.getElementById('imgLibPreviewImg').removeAttribute('src');
  }
  window.wpCloseImgPreview = closeImgPreview;
  (function wireImgPreview() {
      var pv = document.getElementById('imgLibPreview'); if (!pv) return;
      document.getElementById('imgLibPreviewBack').addEventListener('click', closeImgPreview);
      // Delete the picture file itself (saves/images only; the shell must have /api/delete-image — 1.4.6 core)
      var delB = document.getElementById('imgLibPreviewDel');
      if (delB) delB.addEventListener('click', function() {
          var src = pv.dataset.src; if (!src || src.indexOf('/saves/images/') !== 0) { toast('Only pictures in your saves folder can be deleted here.'); return; }
          var use = imgUsage(src), name = src.split('/').pop();
          var msg = 'Delete the picture file "' + name + '" from your saves folder? This cannot be undone.' + (use.count ? '\n\nIt is used ' + use.count + ' time' + (use.count === 1 ? '' : 's') + ' (' + use.maps.join(', ') + '); those places will show a broken picture until you give them another.' : '\n\nNothing in your campaigns uses it.');
          showConfirm(msg, function(yes) {
              if (!yes) return;
              fetch('/api/delete-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: src }) }).then(function(r) {
                  if (r.status === 404 && !r.headers.get('content-type')) throw new Error('old-core');
                  if (!r.ok) throw new Error('failed');
                  return r.json();
              }).then(function() {
                  _imgLibCache = (_imgLibCache || []).filter(function(i) { return i.path !== src; });
                  var c = imgCats(); delete c.by[src]; imgCatsSave();
                  closeImgPreview(); renderImgLib(document.getElementById('imgLibSearch').value);
                  toast('Deleted ' + name + '.');
              }).catch(function(e) {
                  toast(e && e.message === 'old-core' ? 'Deleting pictures needs the 1.4.6 core — run the installer from Settings \u2192 Updates & about.' : 'Could not delete that picture.');
              });
          });
      });
      var prevB = document.getElementById('imgLibPrevBtn'), nextB = document.getElementById('imgLibNextBtn');
      if (prevB) prevB.addEventListener('click', function() { imgPreviewStep(-1); });
      if (nextB) nextB.addEventListener('click', function() { imgPreviewStep(1); });
      document.addEventListener('keydown', function(e) {
          if (pv.style.display === 'none') return;
          if (e.target && e.target.closest && e.target.closest('input, textarea, select')) return;
          if (e.key === 'ArrowLeft') { e.preventDefault(); imgPreviewStep(-1); }
          else if (e.key === 'ArrowRight') { e.preventDefault(); imgPreviewStep(1); }
      });
      document.getElementById('imgLibPreviewAdd').addEventListener('click', function() {
          var src = pv.dataset.src; if (!src) return;
          if (_imgLibPick) { var cb = _imgLibPick; _imgLibPick = null; closeImgPreview(); document.getElementById('imgLibModal').style.display = 'none'; cb(src); return; }
          var am = getActiveMap();
          if (!am || am.type !== 'map' || state.viewMode !== 'visual') { toast('Open a play map first.'); return; }
          addWbItem('image', { w: 300, h: 300, src: src, color: 'transparent' });
          closeImgPreview();
          document.getElementById('imgLibModal').style.display = 'none';
          toast('Image placed.');
      });
      document.getElementById('imgLibPreviewCat').addEventListener('click', function(e) {
          var src = pv.dataset.src; if (!src) return;
          var r = this.getBoundingClientRect();
          openImgCatMenu(src, r.left, r.bottom + 4);
      });
      // Escape steps back from the preview before it would close the library
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && pv.style.display !== 'none') { e.stopPropagation(); closeImgPreview(); } }, true);
  })();

  function uploadImageFile(f, cx, cy) {

      if(!f || !f.type.startsWith('image/')) return;

      toast('Uploading image...');

      fetch('/api/upload?mapId=' + encodeURIComponent(getActiveCampaign().activeItemId) + '&filename=' + encodeURIComponent(f.name), {

          method: 'POST', body: f

      })

      .then(res => res.json())

      .then(data => {

          if (data.url) {

              if (cx !== undefined && cy !== undefined) {

                  var item = Object.assign({ id: 'wb'+uid(), type: 'image', x: cx, y: cy, w: 300, h: 300, z: 10, src: data.url, color: 'transparent' }, newOpacityProps());

                  getActiveMap().whiteboard.push(item);

                  state.selWbId = item.id;

                  save(); render();

              } else {

                  addWbItem('image', {w:300, h:300, src: data.url, color:'transparent'});

              }

              toast('Image added!');

          }

      })

      .catch(err => toast('Error uploading image.'));

  }



  var _el_imgFileIn = document.getElementById('imgFileIn');

if(_el_imgFileIn) _el_imgFileIn.addEventListener('change', function(e) {

      uploadImageFile(e.target.files[0]);

      e.target.value = '';

  });



  var _el_clearWbBtn = document.getElementById('clearWbBtn');

if(_el_clearWbBtn) _el_clearWbBtn.addEventListener('click', function() {

      showConfirm('Are you sure you want to clear the entire play map? This cannot be undone.', function(yes) {

          if(yes) {

              getActiveMap().whiteboard = [];

              state.selWbId = null;

              save(); render();

          }

      });

  });



  wbWrap.addEventListener('dragover', function(e) { e.preventDefault(); e.stopPropagation(); });

  wbWrap.addEventListener('drop', function(e) {

      e.preventDefault(); e.stopPropagation();

      if(state.viewMode !== 'visual') return;

      var f = e.dataTransfer.files[0];

      if(f) {

          var cx = (wbWrap.scrollLeft + e.clientX - wbWrap.getBoundingClientRect().left) / state.zoomLevel - 150;

          var cy = (wbWrap.scrollTop + e.clientY - wbWrap.getBoundingClientRect().top) / state.zoomLevel - 150;

          uploadImageFile(f, Math.max(10, Math.round(cx)), Math.max(10, Math.round(cy)));

      }

  });



  /* ---------- Global Tools ---------- */

  var _el_wbCenterBtn = document.getElementById('wbCenterBtn');
  var _el_wbCenterMenu = document.getElementById('wbCenterMenu');
  var _el_wbCenterCanvasBtn = document.getElementById('wbCenterCanvasBtn');
  var _el_wbCenterItemsBtn = document.getElementById('wbCenterItemsBtn');

  if(_el_wbCenterBtn) _el_wbCenterBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var m = getActiveMap(); if(!m || m.type === 'planner') return;
      var items = (state.viewMode === 'data' ? m.rooms : m.whiteboard) || [];
      var hasItems = items.length > 0;
      if(!hasItems) {
          if(_el_wbCenterItemsBtn) {
              _el_wbCenterItemsBtn.style.opacity = '0.5';
              _el_wbCenterItemsBtn.style.pointerEvents = 'none';
          }
      } else {
          if(_el_wbCenterItemsBtn) {
              _el_wbCenterItemsBtn.style.opacity = '1';
              _el_wbCenterItemsBtn.style.pointerEvents = 'auto';
          }
      }
      var charBtn = document.getElementById('wbCenterCharBtn');
      if (charBtn) {
          var tok = myCharacterToken(m);
          var isClientC = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
          charBtn.style.display = (state.viewMode === 'visual') ? '' : 'none';
          charBtn.style.opacity = tok ? '1' : '0.5';
          charBtn.style.pointerEvents = tok ? 'auto' : 'none';
          charBtn.textContent = isClientC ? 'Center on My Character' : (tok ? 'Center on ' + (tok.charName || 'Character') : 'Center on Character');
      }
      if(_el_wbCenterMenu) _el_wbCenterMenu.classList.toggle('show');
  });

  // Players: their own token. GM: the selected character, else their own, else the first one.
  function myCharacterToken(m) {
      var my = null;
      try { my = JSON.parse(localStorage.getItem('wp_profile') || 'null'); } catch (e) {}
      var myId = my && my.id;
      var toks = (m && m.whiteboard || []).filter(function(i) { return i.isChar; });
      var isClient = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
      if (isClient) return toks.find(function(i) { return i.ownerId === myId; }) || null;
      return toks.find(function(i) { return i.id === state.selWbId; }) || toks.find(function(i) { return i.ownerId === myId; }) || toks[0] || null;
  }

  var _el_wbCenterCharBtn = document.getElementById('wbCenterCharBtn');
  if (_el_wbCenterCharBtn) _el_wbCenterCharBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var m = getActiveMap(); if (!m || m.type !== 'map') return;
      var tok = myCharacterToken(m);
      if (!tok) { toast('No character token of yours on this map.'); return; }
      var wrap = document.getElementById('whiteboardWrap');
      wrap.scrollLeft = ((tok.x + (tok.w || 100) / 2) * state.zoomLevel) - wrap.clientWidth / 2;
      wrap.scrollTop = ((tok.y + (tok.h || 100) / 2) * state.zoomLevel) - wrap.clientHeight / 2;
      if (!(window.wpNet && window.wpNet.active && window.wpNet.role === 'client')) { state.selWbId = tok.id; state.selWbIds = [tok.id]; render(); }
      if (_el_wbCenterMenu) _el_wbCenterMenu.classList.remove('show');
      toast('Centered on ' + (tok.charName || 'your character') + '.');
  });

  if(_el_wbCenterCanvasBtn) _el_wbCenterCanvasBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var wrap = state.viewMode === 'data' ? document.getElementById('canvasWrap') : document.getElementById('whiteboardWrap');
      wrap.scrollLeft = (15000 * state.zoomLevel) - wrap.clientWidth/2;
      wrap.scrollTop = (15000 * state.zoomLevel) - wrap.clientHeight/2;
      if(_el_wbCenterMenu) _el_wbCenterMenu.classList.remove('show');
      toast('Camera centered on canvas.');
  });

  if(_el_wbCenterItemsBtn) _el_wbCenterItemsBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var m = getActiveMap(); if(!m || m.type === 'planner') return;
      var items = (state.viewMode === 'data' ? m.rooms : m.whiteboard) || [];
      var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      items.forEach(function(i) {
          if(i.x < minX) minX = i.x;
          if(i.y < minY) minY = i.y;
          if(i.x + (i.w||100) > maxX) maxX = i.x + (i.w||100);
          if(i.y + (i.h||100) > maxY) maxY = i.y + (i.h||100);
      });
      if(minX !== Infinity) {
          var wrap = state.viewMode === 'data' ? document.getElementById('canvasWrap') : document.getElementById('whiteboardWrap');
          var curCenterX = minX + (maxX - minX)/2;
          var curCenterY = minY + (maxY - minY)/2;
          wrap.scrollLeft = (curCenterX * state.zoomLevel) - wrap.clientWidth/2;
          wrap.scrollTop = (curCenterY * state.zoomLevel) - wrap.clientHeight/2;
          toast('Camera centered on items.');
      }
      if(_el_wbCenterMenu) _el_wbCenterMenu.classList.remove('show');
  });

  document.addEventListener('click', function(e) {
      if(_el_wbCenterMenu && e.target !== _el_wbCenterBtn && !e.target.closest('#wbCenterMenu')) {
          _el_wbCenterMenu.classList.remove('show');
      }
  });

  var _el_wbUndoBtn = document.getElementById('wbUndoBtn');

if(_el_wbUndoBtn) _el_wbUndoBtn.addEventListener('click', function() {

      undo();

  });

  var _el_wbRedoBtn = document.getElementById('wbRedoBtn');

if(_el_wbRedoBtn) _el_wbRedoBtn.addEventListener('click', function() {

      redo();

  });



  var _el_toggleLeftBtn = document.getElementById('toggleLeftBtn');

if(_el_toggleLeftBtn) _el_toggleLeftBtn.addEventListener('click', function() {

      var sb = document.getElementById('campaignSidebar');

      sb.classList.toggle('collapsed');

      this.textContent = sb.classList.contains('collapsed') ? '▶' : '◀';

  });



  /* Properties sidebar: closed by default, opens when something is selected (a
     room on the data map, an item on the play map) and closes again when the
     selection clears. A hand toggle (the ▶/◀ button) wins until the selection changes. */
  window.wpSelKey = function() { return state.viewMode === 'data' ? (state.selId ? 'r:' + state.selId : (state.selLink != null ? 'l:' + state.selLink : '')) : (state.selWbId ? 'w:' + state.selWbId : ''); };
  window.wpSyncRightPanel = function() {
      var sb = document.getElementById('sidebar'), btn = document.getElementById('toggleRightBtn');
      if (!sb || !btn || btn.style.display === 'none') return;
      var key = window.wpSelKey();
      if (state.rightManualKey !== undefined && state.rightManualKey !== key) state.rightManualKey = undefined;   // selection moved on: automation resumes
      if (state.rightManualKey !== undefined) return;
      if (key) { if (sb.classList.contains('collapsed')) { sb.classList.remove('collapsed'); state.rightAuto = true; } }
      else if (state.rightAuto || !state.rightEverSynced) { sb.classList.add('collapsed'); state.rightAuto = false; }
      state.rightEverSynced = true;
      btn.textContent = sb.classList.contains('collapsed') ? '◀' : '▶';
  };
  var _el_toggleRightBtn = document.getElementById('toggleRightBtn');

if(_el_toggleRightBtn) _el_toggleRightBtn.addEventListener('click', function() {

      var sb = document.getElementById('sidebar');

      sb.classList.toggle('collapsed');

      this.textContent = sb.classList.contains('collapsed') ? '◀' : '▶';
      // A hand toggle overrides the automatic open/close until the selection changes
      state.rightAuto = false;
      state.rightManualKey = window.wpSelKey ? window.wpSelKey() : '';

      // The button is pinned to the center pane's right edge (CSS right:0),
      // which already tracks the sidebar as it collapses — no inline offset.

      if (state.viewMode === 'data') renderDataMap();

  });



  var _el_helpBtn = document.getElementById('helpBtn');

if(_el_helpBtn) _el_helpBtn.addEventListener('click', function() {

      document.getElementById('helpModal').style.display = 'flex';

  });

  var _el_helpCloseBtn = document.getElementById('helpCloseBtn');

if(_el_helpCloseBtn) _el_helpCloseBtn.addEventListener('click', function() {

      document.getElementById('helpModal').style.display = 'none';

  });

  // Clicking a modal's dark backdrop closes it, routed through its own
  // close/cancel button so any teardown logic runs. A pointerdown check keeps
  // text-selection drags that end on the backdrop from closing the dialog.
  (function() {
      var overlayClose = {
          aboutModal: 'aboutCloseBtn',
          legalModal: 'legalCloseBtn',
          helpModal: 'helpCloseBtn',
          netModal: 'netCloseBtn',
          campSearchModal: 'campSearchClose',
          plannerSearchModal: 'plannerSearchClose',
          mapSearchModal: 'mapSearchClose',
          importChoiceModal: 'importCancelBtn',
          imgLibModal: 'imgLibCloseBtn',
          settingsModal: 'settingsCloseBtn',
          playersModal: 'playersCloseBtn',
          sheetViewModal: 'sheetViewCloseBtn'
      };
      Object.keys(overlayClose).forEach(function(oid) {
          var overlay = document.getElementById(oid);
          if (!overlay) return;
          var downOnBackdrop = false;
          overlay.addEventListener('pointerdown', function(e) { downOnBackdrop = (e.target === overlay); });
          overlay.addEventListener('click', function(e) {
              if (e.target !== overlay || !downOnBackdrop) return;
              var btn = document.getElementById(overlayClose[oid]);
              if (btn) btn.click(); else overlay.style.display = 'none';
          });
      });
  })();

  // The shape and grid dropdowns close on outside clicks like the other menus
  document.addEventListener('click', function(e) {
      var sm = document.getElementById('shapeMenu');
      if (sm && sm.classList.contains('show') && !e.target.closest('#shapeMenu') && !e.target.closest('#shapeMenuBtn')) sm.classList.remove('show');
      var gm = document.getElementById('gridMenu');
      if (gm && gm.classList.contains('show') && !e.target.closest('#gridMenu') && !e.target.closest('#wbGridBtn')) gm.classList.remove('show');
  });

  // Open Help on a topic, optionally scrolled to a heading (Settings links here)
  window.wpOpenHelp = function(pane, anchorId) {
      var modal = document.getElementById('helpModal'); if (!modal) return;
      modal.style.display = 'flex';
      var nav = document.getElementById('helpNav');
      if (nav) nav.querySelectorAll('[data-help]').forEach(function(b) { b.classList.toggle('active', b.dataset.help === pane); });
      document.querySelectorAll('#helpModal .help-pane').forEach(function(p) { p.style.display = (p.dataset.pane === pane) ? 'block' : 'none'; });
      var a = anchorId && document.getElementById(anchorId);
      if (a) setTimeout(function() { a.scrollIntoView({ block: 'start', behavior: 'auto' }); }, 60);
  };
  // Help tutorials — topic rail switches the visible pane
  var _el_helpNav = document.getElementById('helpNav');
  if (_el_helpNav) _el_helpNav.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-help]');
      if (!btn) return;
      _el_helpNav.querySelectorAll('[data-help]').forEach(function(b) { b.classList.toggle('active', b === btn); });
      document.querySelectorAll('#helpModal .help-pane').forEach(function(p) {
          p.style.display = (p.dataset.pane === btn.dataset.help) ? 'block' : 'none';
      });
  });

  var _el_aboutBtn = document.getElementById('aboutBtn');

if(_el_aboutBtn) _el_aboutBtn.addEventListener('click', function() {

      document.getElementById('aboutModal').style.display = 'flex';

      var vEl = document.getElementById('aboutVersion');
      if (vEl && !vEl.dataset.click) {   // the version number itself opens the release notes
          vEl.dataset.click = '1'; vEl.style.cursor = 'pointer'; vEl.title = "Click to read what's new";
          vEl.addEventListener('click', function() { window.wpShowWhatsNew(vEl.textContent.replace('Version ', '').trim()); });
      }
      if (vEl && !vEl.dataset.loaded) {
          // The app folder's version wins over the shell's: a one-click update replaces only the app folder
          (window.wpVersionReady || fetch('/api/version').then(function(r) { return r.json(); }).then(function(v) { return v.version; })).then(function(ver) {
              vEl.textContent = 'Version ' + ver;
              vEl.dataset.loaded = '1';
          }).catch(function() { vEl.textContent = ''; });
      }

  });

  var _el_aboutCloseBtn = document.getElementById('aboutCloseBtn');

if(_el_aboutCloseBtn) _el_aboutCloseBtn.addEventListener('click', function() {

      document.getElementById('aboutModal').style.display = 'none';

  });

  // Legal viewer (Terms / Privacy) — text served from assets/legal.txt so the
  // About panel always shows the same document that ships as license.txt
  var _legalText = null;
  async function openLegal(which) {
      var body = document.getElementById('legalBody');
      var title = document.getElementById('legalTitle');
      title.textContent = which === 'privacy' ? 'Privacy Policy' : 'Terms of Use';
      body.style.textAlign = 'left';
      document.getElementById('legalModal').style.display = 'flex';
      if (_legalText === null) {
          try {
              var r = await fetch('assets/legal.txt');
              _legalText = r.ok ? await r.text() : '';
          } catch (e) { _legalText = ''; }
      }
      if (!_legalText) { body.textContent = 'The legal document could not be loaded. A copy ships with the app as license.txt in the install folder.'; return; }
      var tIdx = _legalText.indexOf('TERMS OF USE');
      var pIdx = _legalText.indexOf('PRIVACY POLICY');
      var section;
      if (which === 'privacy') {
          section = pIdx >= 0 ? _legalText.slice(pIdx) : _legalText;
      } else {
          section = (tIdx >= 0 && pIdx > tIdx) ? _legalText.slice(tIdx, pIdx) : _legalText;
          section = section.replace(/=+\s*$/, '').replace(/\s+$/, '');
          var cIdx = _legalText.indexOf('CONTACT & BUG REPORTS');
          if (cIdx >= 0) section += '\n\n' + _legalText.slice(cIdx).replace(/^=+\n/gm, '');
      }
      body.textContent = _legalText.split('\n', 2).join('\n') + '\n\n' + section.replace(/^=+\n/gm, '');
      body.scrollTop = 0;
  }
  // "What's New" — shows the release notes in the legal viewer. Also called
  // automatically on the first launch after an update (see settings.js).
  window.wpShowWhatsNew = function(versionLabel) {
      var body = document.getElementById('legalBody');
      var title = document.getElementById('legalTitle');
      if (!body || !title) return;
      title.textContent = "What's New" + (versionLabel ? ' — Waypoint ' + versionLabel : '');
      body.style.textAlign = 'center';   // release notes read centred; Terms/Privacy switch back to left in openLegal
      body.textContent = 'Loading…';
      document.getElementById('legalModal').style.display = 'flex';
      fetch('assets/whatsnew.txt').then(function(r) { return r.ok ? r.text() : ''; }).then(function(txt) {
          body.textContent = txt || 'No release notes found.';
          body.scrollTop = 0;
      }).catch(function() { body.textContent = 'No release notes found.'; });
  };
  var _el_aboutNotesBtn = document.getElementById('aboutNotesBtn');
  if (_el_aboutNotesBtn) _el_aboutNotesBtn.addEventListener('click', function() {
      var vEl = document.getElementById('aboutVersion');
      window.wpShowWhatsNew(vEl && vEl.textContent.replace('Version ', '').trim());
  });

  var _el_aboutTermsBtn = document.getElementById('aboutTermsBtn');
  if (_el_aboutTermsBtn) _el_aboutTermsBtn.addEventListener('click', function() { openLegal('terms'); });
  var _el_aboutPrivacyBtn = document.getElementById('aboutPrivacyBtn');
  if (_el_aboutPrivacyBtn) _el_aboutPrivacyBtn.addEventListener('click', function() { openLegal('privacy'); });
  var _el_legalCloseBtn = document.getElementById('legalCloseBtn');
  if (_el_legalCloseBtn) _el_legalCloseBtn.addEventListener('click', function() { document.getElementById('legalModal').style.display = 'none'; });
  var _el_aboutEmailCopy = document.getElementById('aboutEmailCopy');
  if (_el_aboutEmailCopy) _el_aboutEmailCopy.addEventListener('click', function() {
      var email = document.getElementById('aboutEmail').textContent;
      navigator.clipboard.writeText(email).then(function() {
          if (window.appToast) window.appToast('Email copied ✓');
      }, function() {
          if (window.appToast) window.appToast('Copy failed — select the address manually');
      });
  });



window.wpUploadImage = uploadImageFile; // clipboard paste (io.js) places images at the cursor

export {

    renderWhiteboard,

    attachResizeHandle,

    attachRotateHandle,

    addWbItem,

    uploadImageFile

};



var _el_shapeMenuBtn = document.getElementById('shapeMenuBtn');

if(_el_shapeMenuBtn) _el_shapeMenuBtn.addEventListener('click', function() {

    document.getElementById('shapeMenu').classList.toggle('show');

});

// Picking a shape arms placement: the next click on the board drops it there
// (default size), and a drag draws the exact box it should fill. Esc cancels.
window.wpPlace = null;
function armPlacement(type, props, label) {
    // Placement is a mode of its own: leave draw / erase / measure / pan first
    var mv = document.getElementById('moveModeBtn');
    if (mv && !mv.classList.contains('active')) mv.click();
    window.wpPlace = { type: type, props: props };
    document.getElementById('shapeMenu').classList.remove('show');
    if (wbWrap) wbWrap.style.cursor = 'crosshair';
    document.body.classList.add('placing');
    // The tool that armed placement stays lit until the shape lands or Esc
    ['shapeTextBtn', 'shapeMenuBtn'].forEach(function(id) { var b = document.getElementById(id); if (b) b.classList.toggle('active', id === (type === 'text' ? 'shapeTextBtn' : 'shapeMenuBtn')); });
    toast(type === 'text' ? 'Click the board to place a text box (drag to size it), or click an existing text box to edit it. Esc cancels.' : 'Click the board to place the ' + label + ', or drag to size it. Esc cancels.');
}
function disarmPlacement() {
    window.wpPlace = null;
    if (wbWrap) wbWrap.style.cursor = '';
    document.body.classList.remove('placing');
    ['shapeTextBtn', 'shapeMenuBtn'].forEach(function(id) { var b = document.getElementById(id); if (b) b.classList.remove('active'); });
}
// New-shape sizing: "free" = default size on click, exact box on drag (any shape,
// hexagons included); "cell" = every shape arrives the size of one grid cell
// and seats into it. Local preference.
function shapeSizeMode() {
    try { return localStorage.getItem('wp_shapeSize') === 'cell' ? 'cell' : 'free'; } catch (e) { return 'free'; }
}
function syncShapeSizeButtons() {
    var mode = shapeSizeMode();
    document.querySelectorAll('.shape-size-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.shapesize === mode); });
}
document.querySelectorAll('.shape-size-btn').forEach(function(b) {
    b.addEventListener('click', function(e) {
        e.stopPropagation();
        try { localStorage.setItem('wp_shapeSize', this.dataset.shapesize); } catch (err) {}
        syncShapeSizeButtons();
        toast(this.dataset.shapesize === 'cell' ? 'New shapes arrive one grid cell in size.' : 'New shapes are free-sized — click for the default, drag for an exact box.');
    });
});
syncShapeSizeButtons();

// The text tool on an existing text box edits it in place (datamap.js hit-tests the click)
window.wpPlaceDisarm = disarmPlacement;
window.wpEditTextBox = function(id) {
    if (!state.wbEls[id]) return false;
    state.selWbId = id; state.selWbIds = [id]; render();
    var el = state.wbEls[id]; if (!el) return false;
    el.contentEditable = 'true'; el.classList.add('editing'); el.style.cursor = 'text'; el.focus();
    try { var rg = document.createRange(); rg.selectNodeContents(el); rg.collapse(false); var sl = window.getSelection(); sl.removeAllRanges(); sl.addRange(rg); } catch (e) {}   // caret at the end
    return true;
};
window.wpPlaceCommit = function(px, py, pw, ph, sx, sy) {
    var P = window.wpPlace;
    disarmPlacement();
    if (!P) return;
    var props = Object.assign({}, P.props);
    var dragged = pw > 12 && ph > 12;
    var type = P.type;
    var isHexItem = (type === 'hexagon' || props.shape === 'hexagon');
    var cell = shapeSizeMode() === 'cell' && type !== 'text';
    var hexGrid = state.gridType === 'hex';
    if (cell) { props.w = hexGrid ? 60 : 50; props.h = hexGrid ? 52 : 50; }
    else if (dragged) { props.w = Math.round(pw); props.h = Math.round(ph); }
    var x = (dragged && !cell) ? px : sx - (props.w || 100) / 2;
    var y = (dragged && !cell) ? py : sy - (props.h || 100) / 2;
    addWbItemAt(type, props, x, y);
    if (cell) {
        // Cell-sized shapes always seat into a cell, whether or not Snap is on
        var ci = getActiveMap().whiteboard.find(function(i) { return i.id === state.selWbId; });
        if (ci && hexGrid) {
            var hc = snapToHex(ci.x + ci.w / 2, ci.y + ci.h / 2, 30, 'center');
            ci.x = hc.x - ci.w / 2; ci.y = hc.y - ci.h / 2; save(); render();
        } else if (ci && state.gridType === 'square') {
            ci.x = Math.round(ci.x / 50) * 50; ci.y = Math.round(ci.y / 50) * 50; save(); render();
        }
    } else if (isHexItem && hexGrid && !dragged) snapNewHexItem();
    if (type === 'trigger') toast(isHexItem ? 'Hex trigger added — it fills one grid cell; write its Event Message in Properties.' : 'Trigger zone added — write its Event Message in the Properties panel.');
    if (type === 'text') {
        var el = state.wbEls[state.selWbId];
        if (el && el.classList.contains('text')) { try { el.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); } catch(_) {} }
    }
};
function addWbItemAt(type, props, x, y) {
    var item = Object.assign({
        id: 'wb'+uid(), type: type,
        x: Math.max(10, Math.round(x)), y: Math.max(10, Math.round(y)),
        w: 100, h: 100, z: 10, color: 'var(--panel2)'
    }, newOpacityProps(), props);
    getActiveMap().whiteboard.push(item);
    state.selWbId = item.id; state.selWbIds = [];
    save(); render();
}
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && window.wpPlace) { disarmPlacement(); toast('Placement cancelled.'); }
});

var _el_shapeTextBtn = document.getElementById('shapeTextBtn');

if(_el_shapeTextBtn) _el_shapeTextBtn.addEventListener('click', function() {

    armPlacement('text', {w:200, h:60, color:'transparent', text:'Double click to edit text'}, 'text box');

});

var _el_shapeRectBtn = document.getElementById('shapeRectBtn');

if(_el_shapeRectBtn) _el_shapeRectBtn.addEventListener('click', function() {

    armPlacement('rect', {w:150, h:100}, 'rectangle');

});

var _el_shapeCircBtn = document.getElementById('shapeCircBtn');

if(_el_shapeCircBtn) _el_shapeCircBtn.addEventListener('click', function() {

    armPlacement('circle', {w:120, h:120, borderRadius:'50%'}, 'circle');

});

var _el_shapeDiaBtn = document.getElementById('shapeDiaBtn');

if(_el_shapeDiaBtn) _el_shapeDiaBtn.addEventListener('click', function() {

    armPlacement('diamond', {w:100, h:100}, 'diamond');

});

var _el_shapeTriggerBtn = document.getElementById('shapeTriggerBtn');

if(_el_shapeTriggerBtn) _el_shapeTriggerBtn.addEventListener('click', function() {

    // The trigger's shape follows the grid: hex cells get hex zones, square
    // grids get square zones; no grid gets a plain rectangle. Change it later
    // in Properties → Trigger Shape.
    if (state.gridType === 'hex') armPlacement('trigger', {shape: 'hexagon', w: 120, h: 104, color: 'transparent', eventMessage: ''}, 'hex trigger zone');
    else if (state.gridType === 'square') armPlacement('trigger', {shape: 'rect', w: 100, h: 100, color: 'transparent', eventMessage: ''}, 'square trigger zone');
    else armPlacement('trigger', {w:200, h:200, color:'transparent', eventMessage:''}, 'trigger zone');

});

// After creating a hex-shaped item, pull it onto the nearest hex cell (if hex grid + snap active)

function snapNewHexItem() {

    if (!(state.snap && state.gridType === 'hex' && state.selWbId)) return;

    var item = getActiveMap().whiteboard.find(x => x.id === state.selWbId);

    if (!item) return;

    var hc = snapToHex(item.x + item.w/2, item.y + item.h/2, 30, 'center');

    item.x = hc.x - item.w/2; item.y = hc.y - item.h/2;

    save(); render();

}
window.wpSnapNewHexItem = snapNewHexItem;

var _el_shapeHexBtn = document.getElementById('shapeHexBtn');

if(_el_shapeHexBtn) _el_shapeHexBtn.addEventListener('click', function() {

    armPlacement('hexagon', {w: 120, h: 104}, 'hexagon');

});

var _el_shapeHexTriggerBtn = document.getElementById('shapeHexTriggerBtn');

if(_el_shapeHexTriggerBtn) _el_shapeHexTriggerBtn.addEventListener('click', function() {

    armPlacement('trigger', {shape: 'hexagon', w: 120, h: 104, color: 'transparent', eventMessage: ''}, 'hex trigger');

});

  // Flat-top hex tile (a flat side faces up): 90x52 covers two half-offset columns

  function hexBgCss(alpha) {

      // Dual-stroke: a dark line with a light line offset beside it reads on any backdrop

      // 90×52 whole-pixel tile (see snapToHex): fractional tiles drift in Chrome
      var paths = "<path d='M 30 26 L 0 26'/><path d='M 30 26 L 45 0'/><path d='M 30 26 L 45 52'/><path d='M 75 0 L 45 0'/><path d='M 75 0 L 90 26'/><path d='M 75 52 L 45 52'/><path d='M 75 52 L 90 26'/>";

      var svg = "<svg xmlns='http://www.w3.org/2000/svg' width='90' height='52' viewBox='0 0 90 52'>" +

          "<g stroke='rgba(0,0,0," + alpha + ")' stroke-width='3' fill='none'>" + paths + "</g>" +

          "<g stroke='rgba(255,255,255," + alpha + ")' stroke-width='1.2' fill='none'>" + paths + "</g></svg>";

      return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")';

  }



  // The grid lives on an overlay inside the (scaled) whiteboard, so it pans and

  // zooms with the content, always layered above the items.

  function applyGridType(type) {

      var overlay = document.getElementById('gridOverlay');

      if(!overlay) return;

      // Text items lift above the grid (see .grid-active CSS) so labels stay legible
      var wbEl = document.getElementById('whiteboard');

      if (wbEl) wbEl.classList.toggle('grid-active', type === 'square' || type === 'hex');

      // Grids always draw over the content — every line is a dark stroke with a
      // light stroke offset 1px beside it, so cells read over bright art, dark
      // art, and anything mid-tone, even while images move underneath.

      var alpha = 0.55;

      // Viewer's own grid strength (Settings → Table); local only, never synced
      if (window.wpApplyGridOpacity) window.wpApplyGridOpacity();

      if (type === 'square') {

          // Centered outline stroke: 3px dark halo under a 1px light core, both
          // symmetric around the true cell boundary.

          overlay.style.backgroundImage =

              'linear-gradient(rgba(0,0,0,' + alpha + ') 3px, transparent 3px), linear-gradient(90deg, rgba(0,0,0,' + alpha + ') 3px, transparent 3px), ' +

              'linear-gradient(rgba(255,255,255,' + alpha + ') 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,' + alpha + ') 1px, transparent 1px)';

          overlay.style.backgroundSize = '50px 50px';

          overlay.style.backgroundPosition = '0 -1.5px, -1.5px 0, 0 -0.5px, -0.5px 0';

          overlay.style.display = 'block';

      } else if (type === 'hex') {

          overlay.style.backgroundImage = hexBgCss(alpha);

          overlay.style.backgroundSize = '90px 52px';

          overlay.style.backgroundPosition = '0 0';

          overlay.style.display = 'block';

      } else {

          type = 'off';

          overlay.style.display = 'none';

      }

      overlay.style.zIndex = 15000;

      // Hide the default dot texture while a grid is active

      var wbEl = document.getElementById('whiteboard');

      if (wbEl) wbEl.style.backgroundImage = (type === 'off') ? '' : 'none';

      state.gridType = type;

      var gb = document.getElementById('wbGridBtn');

      if (gb) gb.classList.toggle('active', type !== 'off');

  }

  function setGridType(type) {

      applyGridType(type);

      var m = getActiveMap();

      if (m && m.meta) {
          m.meta.gridType = state.gridType;
          var turned = seatFacings(m, state.gridType);   // tokens turn to the nearest cell-side facing
          if (turned) toast(turned + (turned === 1 ? ' token turned' : ' tokens turned') + ' to face the ' + state.gridType + ' grid.');
          save();
      }

      document.getElementById('gridMenu').classList.remove('show');

  }






  var _el_wbGridBtn = document.getElementById('wbGridBtn');

  if(_el_wbGridBtn) _el_wbGridBtn.addEventListener('click', function() {

      document.getElementById('gridMenu').classList.toggle('show');

  });

  var _el_gridOffBtn = document.getElementById('gridOffBtn');
    if(_el_gridOffBtn) _el_gridOffBtn.addEventListener('click', function() { setGridType('off'); });

    var _el_gridSqBtn = document.getElementById('gridSqBtn');
    if(_el_gridSqBtn) _el_gridSqBtn.addEventListener('click', function() { setGridType('square'); });

    var _el_gridHexBtn = document.getElementById('gridHexBtn');
    if(_el_gridHexBtn) _el_gridHexBtn.addEventListener('click', function() { setGridType('hex'); });

var _el_wbSnapBtn = document.getElementById('wbSnapBtn');
if(_el_wbSnapBtn) {
    // Snap preference survives restarts
    try { state.snap = localStorage.getItem('wp_snap') === '1'; } catch(e) {}
    _el_wbSnapBtn.classList.toggle('active', !!state.snap);
    var _dataSnapBtn = document.getElementById('snapBtn');
    if (_dataSnapBtn) _dataSnapBtn.classList.toggle('active', !!state.snap);
    /* Snap has a MODE: what a dragged item aligns to while Snap is on.
         grid  — cells only (drops seat to the lattice; no magnetism to neighbours)
         items — neighbours only (edges glue/align; drops stay where the magnet left them)
         both  — the old behaviour (magnet first, grid takes open-space drops)
       Local preference (wp_snapMode). Size-matching on resize is separate and always on. */
    try { var _sm = localStorage.getItem('wp_snapMode'); state.snapMode = (_sm === 'items' || _sm === 'both') ? _sm : 'grid'; } catch(e) { state.snapMode = 'grid'; }
    var _el_snapMenu = document.getElementById('snapMenu');
    function syncSnapMenu() {
        document.querySelectorAll('.snap-mode-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.mode === state.snapMode); });
        var off = document.getElementById('snapOffBtn');
        if (off) off.textContent = state.snap ? '\u23FB Turn snapping off' : '\u23FB Turn snapping on';
        _el_wbSnapBtn.classList.toggle('active', !!state.snap);
        var ds = document.getElementById('snapBtn');
        if (ds) ds.classList.toggle('active', !!state.snap);
        _el_wbSnapBtn.title = state.snap
            ? 'Snap is on — aligning to ' + ({ grid: 'grid cells', items: 'other items', both: 'grid cells and other items' })[state.snapMode] + ' (click for options)'
            : 'Snap is off — click to turn on';
    }
    function setSnap(on) {
        state.snap = !!on;
        try { localStorage.setItem('wp_snap', state.snap ? '1' : '0'); } catch(e) {}
        syncSnapMenu();
    }
    _el_wbSnapBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        if (!state.snap) { setSnap(true); if (_el_snapMenu) _el_snapMenu.classList.add('show'); }
        else if (_el_snapMenu) { syncSnapMenu(); _el_snapMenu.classList.toggle('show'); }
    });
    document.querySelectorAll('.snap-mode-btn').forEach(function(b) {
        b.addEventListener('click', function(e) {
            e.stopPropagation();
            state.snapMode = this.dataset.mode;
            try { localStorage.setItem('wp_snapMode', state.snapMode); } catch(err) {}
            if (!state.snap) setSnap(true);
            syncSnapMenu();
            toast(({ grid: 'Snapping to grid cells only.', items: 'Snapping to other items only.', both: 'Snapping to the grid and to other items.' })[state.snapMode]);
        });
    });
    var _snapOff = document.getElementById('snapOffBtn');
    if (_snapOff) _snapOff.addEventListener('click', function(e) { e.stopPropagation(); setSnap(!state.snap); if (!state.snap && _el_snapMenu) _el_snapMenu.classList.remove('show'); toast(state.snap ? 'Snapping on.' : 'Snapping off.'); });
    if (_el_snapMenu) ['pointerdown', 'click'].forEach(function(ev) { _el_snapMenu.addEventListener(ev, function(e) { e.stopPropagation(); }); });
    document.addEventListener('click', function(e) {
        if (_el_snapMenu && _el_snapMenu.classList.contains('show') && !e.target.closest('#snapMenu') && !e.target.closest('#wbSnapBtn')) _el_snapMenu.classList.remove('show');
    });
    syncSnapMenu();
}

// Initialize global handles
attachResizeHandle();
attachRotateHandle();
attachArrowTurn();
// Selection toolbar: out of the scaled #whiteboard, into the wrap, so it keeps one screen size at every zoom
(function() { var bar = document.getElementById('selToolbar'), wrap = document.getElementById('whiteboardWrap'); if (bar && wrap && bar.parentElement !== wrap) wrap.appendChild(bar); })();

// Context Menu
/* ---------- Campaign Cast: saved characters, dropped as copies ---------- */
function castOf(camp) { camp.cast = camp.cast || {}; return camp.cast; }
function castSave(items) {
    var camp = getActiveCampaign(); if (!camp) return;
    var cast = castOf(camp), n = 0;
    items.forEach(function(it) {
        if (!it || !(it.isChar || it.charName)) return;   // only character tokens belong in the cast
        var cid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        cast[cid] = { id: cid, name: it.charName || 'Character', kind: it.type || 'image', src: it.src || '', w: it.w || 60, h: it.h || 52, color: it.color || 'transparent', charStats: it.charStats || '', shape: it.shape || '', savedAt: Date.now() };
        n++;
    });
    if (!n) { import('./io.js').then(function(m) { m.toast('Select a character token to save.'); }); return; }
    import('./io.js').then(function(m) { m.save(true); m.toast(n === 1 ? 'Saved to the campaign cast.' : n + ' saved to the campaign cast.'); });
}
window.wpCastSaveCharacter = function(c) {
    var camp = getActiveCampaign(); if (!camp || !c) return false;
    var cid = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    castOf(camp)[cid] = { id: cid, name: c.name || 'Character', kind: c.portrait ? 'image' : 'circle', src: c.portrait || '', w: 60, h: 52, color: c.portrait ? 'transparent' : '#4db3d3', charStats: '', shape: '', savedAt: Date.now() };
    import('./io.js').then(function(m) { m.save(true); m.toast((c.name || 'Character') + ' saved to the campaign cast.'); });
    return true;
};
function castPlace(cid, x, y, count) {
    var camp = getActiveCampaign(), am = getActiveMap();
    if (!camp || !am || am.type !== 'map') return;
    var c = castOf(camp)[cid]; if (!c) return;
    am.whiteboard = am.whiteboard || [];
    count = Math.max(1, count || 1);
    var cols = Math.ceil(Math.sqrt(count)), gap = 10;
    for (var i = 0; i < count; i++) {
        var col = i % cols, row = Math.floor(i / cols);
        var it = { id: 'wb' + Math.random().toString(36).slice(2, 10), type: c.kind || (c.src ? 'image' : 'circle'), x: x - c.w / 2 + col * (c.w + gap), y: y - c.h / 2 + row * (c.h + gap), w: c.w, h: c.h, z: 10, color: c.color, isChar: true, charName: count > 1 ? c.name + ' ' + (i + 1) : c.name, name: count > 1 ? c.name + ' ' + (i + 1) : c.name, charStats: c.charStats, layer: 'front' };
        if (c.src) it.src = c.src;
        if (c.shape) it.shape = c.shape;
        if (window.wpSeatHex) window.wpSeatHex(it, am);
        am.whiteboard.push(it);
    }
    import('./io.js').then(function(m) { m.save(true); if (window.appRender) window.appRender(); m.toast(count === 1 ? c.name + ' placed.' : count + ' × ' + c.name + ' placed.'); });
}
// Cast cells at the top of the image library (new-token flow)
function castLibraryHtml(filter) {
    var camp = getActiveCampaign(); if (!camp) return '';
    var q = (filter || '').toLowerCase();
    var list = Object.values(castOf(camp)).filter(function(c) { return !q || (c.name || '').toLowerCase().indexOf(q) >= 0; }).sort(function(a, b) { return a.name.localeCompare(b.name); });
    if (!list.length) return q ? '' : '<div class="img-lib-folder" style="color:var(--dim); font-size:11px;">&#9733; Campaign Cast — empty. Right-click a character token on a play map and choose Save to Campaign Cast; it will show here for quick re-use.</div>';
    return '<div class="img-lib-folder" style="color:var(--gold);">&#9733; Campaign Cast <span style="color:var(--dim); font-weight:normal;">— click to place a copy at the centre of your view</span></div>'
        + '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(96px, 1fr)); gap:8px;">' + list.map(function(c) { return '<div class="img-lib-cell cast-cell" data-cid="' + esc(c.id) + '" title="' + esc(c.name) + (c.charStats ? ' — ' + esc(c.charStats) : '') + '">' + (c.src ? '<img src="' + encodeURI(c.src) + '" loading="lazy" alt="">' : '<div style="height:100%; display:flex; align-items:center; justify-content:center; color:var(--gold); font-size:24px;">&#9733;</div>') + '<div class="img-lib-name">&#9733; ' + esc(c.name) + '</div><button class="tool ghost cast-cell-five" data-cid="' + esc(c.id) + '" title="Drop five copies">&times;5</button></div>'; }).join('') + '</div>'
        + '<div class="img-lib-folder" style="margin-top:8px;">Pictures</div>';
}
function viewCentre() {
    var wrap = document.getElementById('whiteboardWrap'), z = state.zoomLevel || 1;
    if (!wrap) return { x: 15000, y: 15000 };
    return { x: (wrap.scrollLeft + wrap.clientWidth / 2) / z, y: (wrap.scrollTop + wrap.clientHeight / 2) / z };
}
function castMenuHtml(camp) {
    var list = Object.values(castOf(camp)).sort(function(a, b) { return a.name.localeCompare(b.name); });
    // One row; the members live in a flyout so the rest of the menu keeps its size whatever the cast holds
    if (!list.length) return '<div class="menu-item cm-session" data-act="cast-manage" title="Right-click a character token and choose Save to Campaign Cast to fill it">&#9733; Campaign Cast <span style="color:var(--dim); font-size:11px;">— empty</span></div>';
    var html = '<div class="menu-item cm-cast-open" title="Click a member to place a copy here, ×5 for five"><span>&#9733; Campaign Cast</span><span style="color:var(--dim); font-size:11px;">' + list.length + '</span><span style="margin-left:auto; color:var(--dim);">&#8250;</span><div class="cm-sub">';
    if (list.length > 8) html += '<input type="text" class="cm-filter" placeholder="Filter the cast\u2026">';
    list.forEach(function(c) {
        html += '<div class="menu-item cm-session cm-cast-row" data-act="cast" data-cid="' + esc(c.id) + '" data-name="' + esc((c.name || '').toLowerCase()) + '" style="display:flex; align-items:center; gap:8px;">'
              + (c.src ? '<img src="' + esc(c.src) + '" alt="" style="width:20px; height:20px; object-fit:cover; border-radius:4px;">' : '&#9733;')
              + '<span style="flex:1;">' + esc(c.name) + '</span>'
              + '<button class="tool ghost cm-cast-five" data-cid="' + esc(c.id) + '" title="Drop five copies here" style="padding:1px 7px; font-size:10.5px;">&times;5</button></div>';
    });
    html += '<div class="menu-divider"></div><div class="menu-item cm-session" data-act="cast-manage">&#9998; Manage Cast…</div></div></div>';
    return html;
}
/* ---------- combat: roster panel (GM) and the turn strip (everyone) ---------- */
var combatDraft = null;   // { mapId, rows:[{id,name,tokId,init,src,on}], running }
function combatRowsFor(mapId, opts) {
    var camp = getActiveCampaign(), map = camp && camp.items[mapId]; if (!map) return [];
    var n = window.wpNet, running = n.combats && n.combats[mapId];
    var byTok = {}; (running ? running.rows : []).forEach(function(r) { if (r.tokId) byTok[r.tokId] = r; });
    // live target pairs on this map: whoever is targeting (their own token) and whoever they target
    var pair = {}; ((opts && opts.pre) || []).forEach(function(id) { pair[id] = 'targeted'; });
    Object.keys((n && n.targets) || {}).forEach(function(pid) {
        var t = n.targets[pid]; if (!t || t.mapId !== mapId) return;
        pair[t.id] = 'targeted';
        var mine = (map.whiteboard || []).find(function(w) { return w.isChar && !w.hidden && w.ownerId === pid; });
        if (mine) pair[mine.id] = pair[mine.id] || 'targeting';
    });
    var rows = (map.whiteboard || []).filter(function(w) { return w.isChar && !w.hidden; }).map(function(w) {
        var was = byTok[w.id];
        var on = !!was || !!pair[w.id];   // only a running combat's rows and the tokens in a target pair start ticked
        return { id: was ? was.id : 'r' + w.id, name: w.charName || w.name || 'Unnamed', tokId: w.id, init: was ? was.init : 0, src: w.src || null, on: on, party: !!w.ownerId, targeted: pair[w.id] || '' };
    });
    // custom rows of a running combat (no token) stay
    (running ? running.rows : []).forEach(function(r) { if (!r.tokId) rows.push({ id: r.id, name: r.name, tokId: null, init: r.init, src: null, on: true, custom: true }); });
    if (running) {   // keep the running order first, newcomers after
        var order = {}; running.rows.forEach(function(r, i) { order[r.id] = i; });
        rows.sort(function(a, b) { var x = order[a.id] !== undefined ? order[a.id] : 999 + rows.indexOf(a), y = order[b.id] !== undefined ? order[b.id] : 999 + rows.indexOf(b); return x - y; });
    } else rows.sort(function(a, b) { return (b.targeted ? 1 : 0) - (a.targeted ? 1 : 0) || (b.party ? 1 : 0) - (a.party ? 1 : 0) || a.name.localeCompare(b.name); });
    return rows;
}
function combatSortByInit(rows) {   // high to low, ties keep their place
    return rows.map(function(r, i) { return { r: r, i: i }; }).sort(function(a, b) { return (b.r.init - a.r.init) || (a.i - b.i); }).map(function(x) { return x.r; });
}
function renderCombatModal() {
    var m = document.getElementById('combatModal'), list = document.getElementById('combatRows'); if (!m || !list || !combatDraft) return;
    var camp = getActiveCampaign(), map = camp && camp.items[combatDraft.mapId];
    document.getElementById('combatMapName').textContent = map && map.meta && map.meta.title || combatDraft.mapId;
    var running = combatDraft.running;
    document.getElementById('combatStartBtn').textContent = running ? 'Update Combat' : 'Start Combat';
    list.innerHTML = combatDraft.rows.map(function(r, i) {
        return '<div class="combat-row' + (r.on ? '' : ' off') + '" draggable="true" data-i="' + i + '">'
            + '<span class="combat-grip" title="Drag to reorder">&#8942;</span>'
            + '<input type="checkbox" class="combat-on"' + (r.on ? ' checked' : '') + ' title="In the fight">'
            + (r.src ? '<img class="combat-face" src="' + esc(resolveImg(r.src)) + '" alt="">' : '<span class="combat-face combat-face-empty">' + (r.custom ? '&#10022;' : '&#9733;') + '</span>')
            + '<span class="combat-name">' + esc(r.name) + (r.party ? ' <span class="combat-tag">party</span>' : '') + (r.targeted ? ' <span class="combat-tag" style="color:var(--gold); border-color:var(--gold);">' + r.targeted + '</span>' : '') + (r.custom ? ' <span class="combat-tag">custom</span>' : '') + '</span>'
            + '<input type="number" class="combat-init field" value="' + (r.init || 0) + '" title="Initiative — higher goes first">'
            + '<button class="tool ghost combat-up" title="Move up">&#9650;</button><button class="tool ghost combat-down" title="Move down">&#9660;</button>'
            + (r.custom ? '<button class="tool ghost danger combat-del" title="Remove this row">&times;</button>' : '')
            + '</div>';
    }).join('') || '<div style="color:var(--dim); padding:8px;">No character tokens on this map. Add a custom row below, or place tokens first.</div>';
    m.style.display = 'flex';
}
function openCombatModal(mapId, opts) {
    var n = window.wpNet; if (!(n && n.active && n.role === 'host')) { toast('Combat runs at the table — host a session first.'); return; }
    var running = n.combats && n.combats[mapId];
    combatDraft = { mapId: mapId, rows: combatRowsFor(mapId, opts), running: !!running };
    renderCombatModal();
}
window.wpOpenCombat = openCombatModal;
(function wireCombatModal() {
    var m = document.getElementById('combatModal'), list = document.getElementById('combatRows'); if (!m || !list) return;
    function rowOf(e) { var r = e.target.closest && e.target.closest('.combat-row'); return r ? +r.dataset.i : -1; }
    list.addEventListener('change', function(e) {
        var i = rowOf(e); if (i < 0) return;
        if (e.target.classList.contains('combat-on')) { combatDraft.rows[i].on = e.target.checked; renderCombatModal(); }
        if (e.target.classList.contains('combat-init')) { combatDraft.rows[i].init = Number(e.target.value) || 0; combatDraft.rows = combatSortByInit(combatDraft.rows); renderCombatModal(); }
    });
    list.addEventListener('keydown', function(e) { e.stopPropagation(); });
    list.addEventListener('click', function(e) {
        var i = rowOf(e); if (i < 0) return;
        var rows = combatDraft.rows;
        if (e.target.closest('.combat-up') && i > 0) { rows.splice(i - 1, 0, rows.splice(i, 1)[0]); renderCombatModal(); }
        else if (e.target.closest('.combat-down') && i < rows.length - 1) { rows.splice(i + 1, 0, rows.splice(i, 1)[0]); renderCombatModal(); }
        else if (e.target.closest('.combat-del')) { rows.splice(i, 1); renderCombatModal(); }
    });
    var dragI = -1;
    list.addEventListener('dragstart', function(e) { dragI = rowOf(e); if (dragI < 0) { e.preventDefault(); return; } e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(dragI)); } catch (err) {} });
    list.addEventListener('dragover', function(e) { if (dragI < 0) return; e.preventDefault(); var r = e.target.closest && e.target.closest('.combat-row'); list.querySelectorAll('.combat-row').forEach(function(x) { x.classList.toggle('drop-before', x === r); }); });
    list.addEventListener('drop', function(e) {
        e.preventDefault(); var j = rowOf(e); if (dragI < 0 || j < 0 || j === dragI) { dragI = -1; renderCombatModal(); return; }
        var rows = combatDraft.rows, mv = rows.splice(dragI, 1)[0]; rows.splice(j, 0, mv); dragI = -1; renderCombatModal();
    });
    list.addEventListener('dragend', function() { dragI = -1; list.querySelectorAll('.drop-before').forEach(function(x) { x.classList.remove('drop-before'); }); });
    var addBtn = document.getElementById('combatAddBtn'), addName = document.getElementById('combatAddName');
    function addCustom() {
        var name = (addName.value || '').trim(); if (!name) { addName.focus(); return; }
        combatDraft.rows.push({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name.slice(0, 60), tokId: null, init: 0, src: null, on: true, custom: true });
        addName.value = ''; renderCombatModal();
    }
    if (addBtn) addBtn.addEventListener('click', addCustom);
    if (addName) addName.addEventListener('keydown', function(e) { e.stopPropagation(); if (e.key === 'Enter') addCustom(); });
    document.getElementById('combatCancelBtn').addEventListener('click', function() { m.style.display = 'none'; combatDraft = null; });
    document.getElementById('combatCloseBtn').addEventListener('click', function() { m.style.display = 'none'; combatDraft = null; });
    document.getElementById('combatStartBtn').addEventListener('click', function() {
        var n = window.wpNet; if (!combatDraft || !n) return;
        var rows = combatDraft.rows.filter(function(r) { return r.on; }).map(function(r) { return { id: r.id, name: r.name, tokId: r.tokId, init: r.init, src: r.src }; });
        if (!rows.length) { toast('Tick at least one combatant.'); return; }
        var was = n.combats && n.combats[combatDraft.mapId];
        var turn = 0, round = 1;
        if (was) { round = was.round; var curId = (was.rows[was.turn] || {}).id; var at = rows.findIndex(function(r) { return r.id === curId; }); turn = at >= 0 ? at : 0; }
        n.combatSet(combatDraft.mapId, { mapId: combatDraft.mapId, round: round, turn: turn, rows: rows });
        m.style.display = 'none'; combatDraft = null;
    });
})();
function renderCombatStrip() {
    var strip = document.getElementById('combatStrip'); if (!strip) return;
    var n = window.wpNet, am = getActiveMap();
    var c = n && n.active && am && am.type === 'map' && state.viewMode === 'visual' && n.combats && n.combats[am.id];
    if (!c) { strip.innerHTML = ''; strip.style.display = 'none'; return; }
    var cur = c.rows[c.turn] || {}, nxt = c.rows[(c.turn + 1) % c.rows.length] || {};
    var host = n.role === 'host';
    strip.style.display = 'flex';
    strip.innerHTML = '<span class="combat-strip-round" title="Round">&#9876; R' + c.round + '</span>'
        + (host ? '<button class="combat-strip-btn" data-act="prev" title="Previous turn">&#9664;</button>' : '')
        + '<span class="combat-strip-cur" title="Whose turn it is">' + (cur.src ? '<img src="' + esc(resolveImg(cur.src)) + '" alt="">' : '') + esc(cur.name || '') + '</span>'
        + '<span class="combat-strip-next" title="Up next">next ' + esc(nxt.name || '') + '</span>'
        + (host ? '<button class="combat-strip-btn" data-act="next" title="Next turn">&#9654;</button><button class="combat-strip-btn" data-act="edit" title="Combat roster">&#9998;</button><button class="combat-strip-btn danger" data-act="end" title="End combat">&times;</button>' : '');
}
window.wpRenderCombatStrip = renderCombatStrip;
(function wireCombatStrip() {
    var strip = document.getElementById('combatStrip'); if (!strip) return;
    strip.addEventListener('pointerdown', function(e) { e.stopPropagation(); });
    strip.addEventListener('click', function(e) {
        var b = e.target.closest && e.target.closest('.combat-strip-btn'); if (!b) return;
        e.stopPropagation();
        var n = window.wpNet, am = getActiveMap(); if (!(n && n.role === 'host' && am)) return;
        if (b.dataset.act === 'next') n.combatStep(am.id, 1);
        else if (b.dataset.act === 'prev') n.combatStep(am.id, -1);
        else if (b.dataset.act === 'edit') openCombatModal(am.id, {});
        else if (b.dataset.act === 'end') n.combatEnd(am.id);
    });
})();
function openCastModal() {
    var m = document.getElementById('castModal'), list = document.getElementById('castList'); if (!m || !list) return;
    var camp = getActiveCampaign(); if (!camp) return;
    var entries = Object.values(castOf(camp)).sort(function(a, b) { return a.name.localeCompare(b.name); });
    list.innerHTML = entries.length ? entries.map(function(c) {
        return '<div class="cast-row" data-cid="' + esc(c.id) + '">' + (c.src ? '<img src="' + esc(c.src) + '" alt="">' : '<div class="cast-thumb-empty">&#9733;</div>')
             + '<div style="flex:1; min-width:0;"><input class="field cast-name" value="' + esc(c.name) + '" placeholder="Name"><input class="field cast-stats" value="' + esc(c.charStats || '') + '" placeholder="Line under the name (optional)" style="margin-top:4px; font-size:12px;"></div>'
             + '<button class="tool ghost danger cast-del" title="Remove from the cast (tokens already placed stay)">&times;</button></div>';
    }).join('') : '<div style="color:var(--dim); padding:12px; line-height:1.5;">Nothing saved yet. Right-click a character token on a play map and choose <b>Save to Campaign Cast</b>; then right-click empty space to drop copies.</div>';
    m.style.display = 'flex';
}
var _castList = document.getElementById('castList');
if (_castList) {
    _castList.addEventListener('input', function(e) {
        var row = e.target.closest('.cast-row'); if (!row) return;
        var camp = getActiveCampaign(); var c = camp && castOf(camp)[row.dataset.cid]; if (!c) return;
        if (e.target.classList.contains('cast-name')) c.name = e.target.value.slice(0, 80);
        if (e.target.classList.contains('cast-stats')) c.charStats = e.target.value.slice(0, 200);
        import('./io.js').then(function(m) { m.save(false); });
    });
    _castList.addEventListener('click', function(e) {
        var del = e.target.closest('.cast-del'); if (!del) return;
        var row = del.closest('.cast-row'); var camp = getActiveCampaign(); if (!camp) return;
        delete castOf(camp)[row.dataset.cid];
        import('./io.js').then(function(m) { m.save(true); });
        openCastModal();
    });
    _castList.addEventListener('keydown', function(e) { e.stopPropagation(); });
}
var _castClose = document.getElementById('castCloseBtn');
if (_castClose) _castClose.addEventListener('click', function() { document.getElementById('castModal').style.display = 'none'; });

// Session menu on empty play-map space (only while a session is running)
// Place the context menu under the pointer. It lives inside the scrolled whiteboard container, so
// page coordinates would put it thousands of pixels away; position relative to its offset parent.
function placeMenu(cMenu, e) {
    var op = cMenu.offsetParent || document.body, pr = op.getBoundingClientRect();
    var x = e.clientX - pr.left + op.scrollLeft, y = e.clientY - pr.top + op.scrollTop;
    cMenu.style.left = x + 'px'; cMenu.style.top = y + 'px';
    // keep it on screen
    var r = cMenu.getBoundingClientRect();
    if (r.right > window.innerWidth - 6) cMenu.style.left = (x - (r.right - window.innerWidth + 6)) + 'px';
    if (r.bottom > window.innerHeight - 6) cMenu.style.top = (y - (r.bottom - window.innerHeight + 6)) + 'px';
}
// The table menu: Campaign Cast, Players ("Bring here"), Session actions. Returns the html and a
// wire() for its items, so it can stand alone (empty space) or hang under an item menu.
function tableMenuParts(e, role) {
    var n = window.wpNet, camp = getActiveCampaign(), html = '';
    var wrap = document.getElementById('whiteboardWrap'), b = wrap ? wrap.getBoundingClientRect() : { left: 0, top: 0 }, z = state.zoomLevel || 1;
    var pt = { x: (e.clientX - b.left + (wrap ? wrap.scrollLeft : 0)) / z, y: (e.clientY - b.top + (wrap ? wrap.scrollTop : 0)) / z };
    var players = camp && camp.players ? Object.keys(camp.players).map(function(id) { return { id: id, name: camp.players[id].name || id }; }).sort(function(a, c) { return a.name.localeCompare(c.name); }).slice(0, 12) : [];
    function head(label) { return '<div class="menu-item" style="color:var(--dim); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; cursor:default;">' + label + '</div>'; }
    function bringItems() { return players.map(function(p) { return '<div class="menu-item cm-session" data-act="bring" data-pid="' + esc(p.id) + '">&#10148; Bring ' + esc(p.name) + ' here</div>'; }).join(''); }
    if (role === 'client') {
        html += head('Session') + '<div class="menu-item cm-session" data-act="leave" style="color:var(--danger)">Leave Session</div>';
    } else {
        var nextScene = camp ? Object.values(camp.items).find(function(it) { return it.type === 'planner' && it.meta && it.meta.status === 'next'; }) : null;
        if (nextScene) html += '<div class="menu-item cm-session" data-act="scene" data-id="' + esc(nextScene.id) + '" title="The planner marked Next">&#9654; Next scene: ' + esc(nextScene.meta.title || 'planner') + '</div><div class="menu-divider"></div>';
        var amPin = getActiveMap(), isPinned = !!(camp && amPin && (camp.pinnedMaps || []).indexOf(amPin.id) >= 0);
        if (amPin && amPin.type === 'map') html += '<div class="menu-item cm-session" data-act="pin" title="Pinned maps sit at the top of the Maps list">&#128204; ' + (isPinned ? 'Unpin this map' : 'Pin this map') + '</div>';
        if (role !== 'host') html += '<div class="menu-item cm-session" data-act="log">&#128220; Session Log\u2026</div>';
        html += '<div class="menu-divider"></div>';
        html += castMenuHtml(camp);
        if (role === 'host') {
            html += '<div class="menu-divider"></div>' + head('Session');
            var combatM = getActiveMap() && n.combats && n.combats[getActiveMap().id];
            if (combatM) {
                var curM = combatM.rows[combatM.turn] || {};
                html += '<div class="menu-item cm-session" data-act="combat-next" title="Round ' + combatM.round + ' — ' + esc(curM.name || '') + ' is up">&#9876; Next Turn</div>';
                html += '<div class="menu-item cm-session" data-act="combat-prev">&#9194; Previous Turn</div>';
                html += '<div class="menu-item cm-session" data-act="combat-edit">&#9998; Combat Roster\u2026</div>';
                html += '<div class="menu-item cm-session" data-act="combat-end" style="color:var(--danger)">End Combat</div>';
            } else html += '<div class="menu-item cm-session" data-act="combat" title="Pick who is in the fight, give initiative, run the turns">&#9876; Start Combat\u2026</div>';
            html += '<div class="menu-item cm-session" data-act="notepad">&#128221; ' + (n.notepad && n.notepad.on ? 'Put Away Table Notepad' : 'Open Table Notepad') + '</div>';
            html += '<div class="menu-divider"></div>';
            html += '<div class="menu-item cm-session" data-act="summon">&#128227; Summon Everyone Here</div>';
            html += '<div class="menu-item cm-session" data-act="travel">' + (n.travelLocked ? '&#128275; Allow Travel Between Maps' : '&#128274; Lock Travel Between Maps') + '</div>';
            html += '<div class="menu-item cm-session" data-act="pause">' + (n.paused ? '&#9654;&#65039; Resume the Table' : '&#9208;&#65039; Pause the Table') + '</div>';
            html += '<div class="menu-item cm-session" data-act="log">&#128220; Session Log\u2026</div>';
            html += '<div class="menu-item cm-session" data-act="end" style="color:var(--danger)">End Session for Everyone</div>';
        }
    }
    function wire(cMenu) {
        // The cast flyout: opens on hover or click, flips to the left / slides up when it would leave the window
        Array.prototype.forEach.call(cMenu.querySelectorAll('.cm-cast-open'), function(row) {
            var sub = row.querySelector('.cm-sub');
            function fit() {
                if (!sub) return;
                sub.classList.remove('flip'); sub.style.top = '';
                var r = sub.getBoundingClientRect();
                if (r.right > window.innerWidth - 6) sub.classList.add('flip');
                if (r.bottom > window.innerHeight - 6) sub.style.top = (-(r.bottom - window.innerHeight + 8)) + 'px';
            }
            row.addEventListener('mouseenter', fit);
            row.addEventListener('click', function(ce) { ce.stopPropagation(); row.classList.toggle('open'); fit(); });
            var filter = row.querySelector('.cm-filter');
            if (filter) {
                filter.addEventListener('click', function(ce) { ce.stopPropagation(); });
                filter.addEventListener('keydown', function(ce) { ce.stopPropagation(); });
                filter.addEventListener('input', function() {
                    var q = filter.value.trim().toLowerCase();
                    Array.prototype.forEach.call(sub.querySelectorAll('.cm-cast-row'), function(r2) { r2.style.display = (!q || (r2.dataset.name || '').indexOf(q) >= 0) ? '' : 'none'; });
                });
            }
        });
        Array.prototype.forEach.call(cMenu.querySelectorAll('.cm-cast-five'), function(b5) {
            b5.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; castPlace(b5.dataset.cid, pt.x, pt.y, 5); });
        });
        Array.prototype.forEach.call(cMenu.querySelectorAll('.cm-session'), function(it) {
            it.addEventListener('click', function(ce) {
                ce.stopPropagation();
                cMenu.style.display = 'none';
                var act = it.dataset.act;
                if (act === 'summon') n.summonAll();
                else if (act === 'cast') castPlace(it.dataset.cid, pt.x, pt.y, 1);
                else if (act === 'cast-manage') openCastModal();
                else if (act === 'log') n.openSessionLog();
                else if (act === 'notepad') n.notepadToggle();
                else if (act === 'combat' || act === 'combat-edit') { var amX = getActiveMap(); if (amX) openCombatModal(amX.id, {}); }
                else if (act === 'combat-next') { var amN = getActiveMap(); if (amN) n.combatStep(amN.id, 1); }
                else if (act === 'combat-prev') { var amP = getActiveMap(); if (amP) n.combatStep(amP.id, -1); }
                else if (act === 'combat-end') { var amE = getActiveMap(); if (amE) n.combatEnd(amE.id); }
                else if (act === 'pin') {
                    var campP = getActiveCampaign(), amP = getActiveMap(); if (!campP || !amP) return;
                    campP.pinnedMaps = (campP.pinnedMaps || []).filter(function(id) { return campP.items[id]; });
                    var atP = campP.pinnedMaps.indexOf(amP.id);
                    if (atP >= 0) campP.pinnedMaps.splice(atP, 1); else campP.pinnedMaps.push(amP.id);
                    import('./io.js').then(function(m) { m.save(true); m.toast(atP >= 0 ? 'Unpinned.' : 'Pinned — it sits at the top of the Maps list now.'); });
                    import('./sidebar.js').then(function(m) { m.updateSidebarNav(); });
                }
                else if (act === 'scene') { var campN = getActiveCampaign(); if (campN && campN.items[it.dataset.id]) { campN.activeItemId = it.dataset.id; state.selId = null; state.selWbId = null; import('./sidebar.js').then(function(m) { m.updateSidebarNav(); }); import('./io.js').then(function(m) { m.save(true); }); if (window.appRender) window.appRender(); } }
                else if (act === 'bring') n.bringPlayerHere(it.dataset.pid, pt.x, pt.y);
                else if (act === 'travel') n.toggleTravelLock();
                else if (act === 'pause') n.togglePause();
                else if (act === 'end') n.endSession();
                else if (act === 'leave') n.leaveSessionConfirm();
            });
        });
    }
    return { html: html, wire: wire };
}
function tableRole() { var n = window.wpNet; if (!n) return 'offline'; if (n.active && n.role === 'host') return 'host'; if (n.active && n.role === 'client') return 'client'; return 'offline'; }
// Standing alone, on empty play-map space
function showSessionMenu(e, role) {
    var cMenu = document.getElementById('contextMenu'); if (!cMenu) return;
    var parts = tableMenuParts(e, role);
    cMenu.innerHTML = parts.html;
    cMenu.style.display = 'flex';
    placeMenu(cMenu, e);
    parts.wire(cMenu);
}
// Hanging under an item menu (a right-click on a background picture counts as the table)
function appendTableMenu(cMenu, e) {
    var parts = tableMenuParts(e, tableRole());
    cMenu.insertAdjacentHTML('beforeend', '<div class="menu-divider"></div>' + parts.html);
    parts.wire(cMenu);
}
document.addEventListener('contextmenu', function(e) {
    if (state.viewMode !== 'visual' && state.viewMode !== 'data') return;
    if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') {
        // players get no edit menu — except elevation / posture on their own token (the
        // same permission line as moving it); empty play-map space offers Leave Session
        if (state.viewMode === 'visual' && e.target.closest('#whiteboardWrap')) {
            var ownEl = e.target.closest('.wb-item');
            if (ownEl) {
                var amO = getActiveMap(), tokO = amO && (amO.whiteboard || []).find(function(x) { return x.id === ownEl.dataset.id; });
                if (tokO && tokO.isChar && tokO.ownerId === window.wpNet.myId && !window.wpNet.paused && (stanceOn('elevation') || stanceOn('posture'))) { e.preventDefault(); showStanceMenu(e, tokO); }
            } else { e.preventDefault(); showSessionMenu(e, 'client'); }
        }
        return;
    }
    
    var isCanvasOrWb = false;
    var targetId = null;
    var isWb = false;
    
    if (e.target.closest('#whiteboardWrap') && state.viewMode === 'visual') {
        isCanvasOrWb = true; isWb = true;
        var itemEl = e.target.closest('.wb-item');
        if (itemEl) targetId = itemEl.dataset.id;
    } else if (e.target.closest('#canvasWrap') && state.viewMode === 'data') {
        isCanvasOrWb = true; isWb = false;
        var itemEl = e.target.closest('.room');
        if (itemEl) targetId = itemEl.dataset.id;
    } else if (e.target.closest('#elementList')) {
        isCanvasOrWb = true;
        isWb = (state.viewMode === 'visual');
        var listEl = e.target.closest('.el-name');
        if (listEl) targetId = listEl.dataset.id;
    }
    
    if (isCanvasOrWb) {
        e.preventDefault();
        
        var selectedIds = [];
        if (isWb) {
            selectedIds = state.selWbIds || (state.selWbId ? [state.selWbId] : []);
            if (targetId && !selectedIds.includes(targetId)) selectedIds = [targetId];   // the menu acts on the item under the pointer without selecting it (no side panel)
        } else {
            selectedIds = state.selId ? [state.selId] : [];
            if (targetId && state.selId !== targetId) {
                selectedIds = [targetId]; state.selId = targetId;
                if(window.appRender) window.appRender();
            }
        }
        
        var cMenu = document.getElementById('contextMenu');
        if (!cMenu) return;
        
        var am = getActiveMap();
        
        if (selectedIds.length === 0 || (isWb && !targetId)) {
            // The whiteboard background (nothing under the pointer): the table menu, whatever is selected
            if (isWb && window.wpNet && window.wpNet.active && window.wpNet.role === 'host') showSessionMenu(e, 'host');
            else if (isWb && window.wpNet && !window.wpNet.active) showSessionMenu(e, 'offline');   // between sessions: bring a player's token here
            else cMenu.style.display = 'none';
        } else {
            // Items selected
            var html = '';
            var firstItem = isWb ? am.whiteboard.find(x => x.id === selectedIds[0]) : am.rooms.find(x => x.id === selectedIds[0]);
            
            if (isWb) {
                if (selectedIds.length > 1) {
                    var isGrouped = firstItem ? firstItem.groupId : undefined;
                    var allSameGroup = isGrouped && selectedIds.every(id => {
                        var it = am.whiteboard.find(x=>x.id===id);
                        return it && it.groupId === isGrouped;
                    });
                    if (allSameGroup) html += '<div class="menu-item cm-ungroup">Ungroup</div>';
                    else html += '<div class="menu-item cm-group">Group</div>';
                } else if (firstItem && firstItem.groupId) {
                    html += '<div class="menu-item cm-ungroup">Ungroup</div>';
                }
                
                // Check if merge drawings is possible (all selected are paths)
                var allPaths = selectedIds.length > 1 && selectedIds.every(id => {
                    var it = am.whiteboard.find(x=>x.id===id);
                    return it && it.type === 'path';
                });
                if (allPaths) {
                    html += '<div class="menu-item cm-merge">Merge Drawings</div>';
                }
                if (selectedIds.length > 1) {
                    html += '<div class="menu-item cm-align-row" style="display:flex; align-items:center; gap:3px; cursor:default;">' +
                        '<span style="font-size:11px; color:var(--dim); margin-right:2px;">Align</span>' +
                        '<button class="align-btn" data-al="left" title="Align left edges">&#8676;</button>' +
                        '<button class="align-btn" data-al="ch" title="Align horizontal centers">&#8596;</button>' +
                        '<button class="align-btn" data-al="right" title="Align right edges">&#8677;</button>' +
                        '<button class="align-btn" data-al="top" title="Align top edges">&#8613;</button>' +
                        '<button class="align-btn" data-al="cv" title="Align vertical centers">&#8597;</button>' +
                        '<button class="align-btn" data-al="bottom" title="Align bottom edges">&#8615;</button>' +
                        (selectedIds.length > 2 ?
                        '<span style="font-size:11px; color:var(--dim); margin:0 2px 0 6px;">Space</span>' +
                        '<button class="align-btn" data-al="dh" title="Distribute evenly, horizontally">&#8644;</button>' +
                        '<button class="align-btn" data-al="dv" title="Distribute evenly, vertically">&#8645;</button>' : '') +
                        '</div>';
                }
                if (html !== '') html += '<div class="menu-divider"></div>';
            }
            
            if (isWb) {
                var anyUnlocked = selectedIds.some(function(sid) {
                    var it = am.whiteboard.find(function(x) { return x.id === sid; });
                    return it && !it.locked;
                });
                html += '<div class="menu-item cm-lock">' + (anyUnlocked ? '&#128274; Lock' : '&#128275; Unlock') + '</div>';
                var anyVisible = selectedIds.some(function(sid) {
                    var it = am.whiteboard.find(function(x) { return x.id === sid; });
                    return it && !it.hidden;
                });
                html += '<div class="menu-item cm-vis">' + (anyVisible ? '&#128441; Hide from Players' : '&#128065; Show to Players') + '</div>';
                var anyUnderGrid = selectedIds.some(function(sid) {
                    var it = am.whiteboard.find(function(x) { return x.id === sid; });
                    return it && !it.aboveGrid;
                });
                html += '<div class="menu-item cm-grid">' + (anyUnderGrid ? '&#9650; Show Above Grid' : '&#9660; Put Under Grid') + '</div>';
                html += '<div class="menu-divider"></div>';
            }
            html += '<div class="menu-item cm-front">Bring to Front</div>';
            html += '<div class="menu-item cm-fwd">Bring Forward</div>';
            html += '<div class="menu-item cm-bwd">Send Backward</div>';
            html += '<div class="menu-item cm-back">Send to Back</div>';

            if (isWb) {
                var curOp = Math.round(((firstItem && firstItem.opacity != null) ? firstItem.opacity : 1) * 100);
                html += '<div class="menu-divider"></div>';
                html += '<div class="menu-item cm-opacity" style="display:flex; align-items:center; gap:6px; cursor:default;">Opacity <input type="range" id="cmOpacitySlider" min="10" max="100" value="' + curOp + '" style="flex:1; min-width:80px;"> <span id="cmOpacityVal" style="min-width:34px; text-align:right;">' + curOp + '%</span></div>';
            }

            html += '<div class="menu-divider"></div>';
            if (isWb && firstItem && firstItem.isChar) {
                html += '<div class="menu-divider"></div>';
                html += '<div class="menu-item cm-status-alive">&#9825; Alive</div>';
                html += '<div class="menu-item cm-status-down">&#10006; Incapacitated</div>';
                html += '<div class="menu-item cm-status-dead">&#9760; Dead</div>';
                html += stanceMenuHtml(firstItem);
            }
            html += '<div class="menu-item cm-dup">&#10697; Duplicate</div>';
            if (isWb && firstItem && (firstItem.isChar || firstItem.charName)) html += '<div class="menu-item cm-cast-save">&#9733; Save to Campaign Cast</div>';
            html += '<div class="menu-item cm-del" style="color:var(--danger)">Delete</div>';

            cMenu.innerHTML = html;
            cMenu.style.display = 'flex';
            placeMenu(cMenu, e);

            // Elevation / posture rows (character tokens, when the toggles are on)
            if (isWb) wireStanceMenu(cMenu, selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }), function() { save(); render(); });

            // Opacity slider: live preview on input, persist on release; the
            // row never closes the menu (guarded in the click handler below).
            var opSlider = document.getElementById('cmOpacitySlider');
            if (opSlider) {
                opSlider.addEventListener('click', function(oe) { oe.stopPropagation(); });
                opSlider.addEventListener('input', function() {
                    var v = parseInt(this.value, 10) / 100;
                    var lbl = document.getElementById('cmOpacityVal');
                    if (lbl) lbl.textContent = Math.round(v * 100) + '%';
                    selectedIds.forEach(function(sid) {
                        var it = am.whiteboard.find(function(x) { return x.id === sid; });
                        if (!it) return;
                        if (v >= 1) delete it.opacity; else it.opacity = v;
                        var elp = document.querySelector('.wb-item[data-id="' + sid + '"]');
                        if (elp) elp.style.opacity = v < 1 ? v : '';
                    });
                });
                opSlider.addEventListener('change', function() {
                    save();
                    if (window.appRender) window.appRender();
                });
            }

            // Align / distribute buttons act on the unlocked items in the selection
            cMenu.querySelectorAll('.align-btn').forEach(function(ab) {
                ab.addEventListener('click', function(ae) {
                    ae.stopPropagation();
                    var mode = this.dataset.al;
                    var its = selectedIds.map(function(sid) {
                        return am.whiteboard.find(function(x) { return x.id === sid; });
                    }).filter(function(it) { return it && !it.locked; });
                    if (its.length < 2) return;
                    var minX = Math.min.apply(null, its.map(function(i) { return i.x; }));
                    var maxR = Math.max.apply(null, its.map(function(i) { return i.x + i.w; }));
                    var minY = Math.min.apply(null, its.map(function(i) { return i.y; }));
                    var maxB = Math.max.apply(null, its.map(function(i) { return i.y + i.h; }));
                    if (mode === 'left') its.forEach(function(i) { i.x = minX; });
                    else if (mode === 'right') its.forEach(function(i) { i.x = maxR - i.w; });
                    else if (mode === 'ch') { var cx = (minX + maxR) / 2; its.forEach(function(i) { i.x = cx - i.w / 2; }); }
                    else if (mode === 'top') its.forEach(function(i) { i.y = minY; });
                    else if (mode === 'bottom') its.forEach(function(i) { i.y = maxB - i.h; });
                    else if (mode === 'cv') { var cy = (minY + maxB) / 2; its.forEach(function(i) { i.y = cy - i.h / 2; }); }
                    else if (mode === 'dh' || mode === 'dv') {
                        var ax = mode === 'dh' ? 'x' : 'y', dim = mode === 'dh' ? 'w' : 'h';
                        var sorted = its.slice().sort(function(a, b) { return (a[ax] + a[dim] / 2) - (b[ax] + b[dim] / 2); });
                        var first = sorted[0][ax] + sorted[0][dim] / 2;
                        var last = sorted[sorted.length - 1][ax] + sorted[sorted.length - 1][dim] / 2;
                        var stepGap = (last - first) / (sorted.length - 1);
                        sorted.forEach(function(i, idx) { i[ax] = first + stepGap * idx - i[dim] / 2; });
                    }
                    save();
                    if (window.appRender) window.appRender();
                });
            });
        }

        cMenu.onclick = function(ce) {
            var action = ce.target.className;

            if (typeof action === 'string' && (action.includes('cm-opacity') || action.includes('cm-align-row') || action.includes('align-btn') || action.includes('cm-stance'))) return; // control rows keep the menu open

            if (isWb) {
                if (action.includes('cm-group')) {
                    var gid = 'group_' + Date.now();
                    selectedIds.forEach(id => { var it = am.whiteboard.find(x => x.id === id); if(it) it.groupId = gid; });
                    import('./io.js').then(m=>m.toast('Grouped.'));
                } else if (action.includes('cm-ungroup')) {
                    var gid = firstItem ? firstItem.groupId : null;
                    if (gid) am.whiteboard.forEach(x => { if (x.groupId === gid) delete x.groupId; });
                    else selectedIds.forEach(id => { var it = am.whiteboard.find(x => x.id === id); if(it) delete it.groupId; });
                    import('./io.js').then(m=>m.toast('Ungrouped.'));
                } else if (action.includes('cm-merge')) {
                    var newPts = [];
                    var minX=Infinity, minY=Infinity;
                    selectedIds.forEach(id => {
                        var it = am.whiteboard.find(x => x.id === id);
                        if (it && it.pts) {
                            var cx = it.x, cy = it.y;
                            it.pts.forEach(p => { 
                                var px = p[0] + cx; var py = p[1] + cy;
                                newPts.push([px, py]);
                                if (px < minX) minX = px;
                                if (py < minY) minY = py;
                            });
                        }
                    });
                    if (newPts.length > 0) {
                        var maxX = -Infinity, maxY = -Infinity;
                        newPts.forEach(p => {
                            p[0] -= minX;
                            p[1] -= minY;
                            if (p[0] > maxX) maxX = p[0];
                            if (p[1] > maxY) maxY = p[1];
                        });
                        var w = Math.max(10, maxX);
                        var h = Math.max(10, maxY);
                        var uid_str = 'wb'+Date.now();
                        am.whiteboard.push({ id: uid_str, type: 'path', x: minX, y: minY, w: w, h: h, baseW: w, baseH: h, z: 30, pts: newPts, layer:'middle' });
                        am.whiteboard = am.whiteboard.filter(x => !selectedIds.includes(x.id));
                        state.selWbIds = [uid_str];
                        state.selWbId = uid_str;
                        import('./io.js').then(m=>m.toast('Drawings merged.'));
                    }
                } else if (action.includes('cm-vis')) {
                    var hideThem = selectedIds.some(function(sid) {
                        var it = am.whiteboard.find(function(x) { return x.id === sid; });
                        return it && !it.hidden;
                    });
                    selectedIds.forEach(function(sid) {
                        var it = am.whiteboard.find(function(x) { return x.id === sid; });
                        if (it) it.hidden = hideThem;
                    });
                    import('./io.js').then(m => m.toast(hideThem ? 'Hidden from players.' : 'Visible to players.'));
                } else if (action.includes('cm-status-')) {
                    var stNew = action.includes('cm-status-dead') ? 'dead' : action.includes('cm-status-down') ? 'down' : '';
                    selectedIds.forEach(function(sid) {
                        var it = am.whiteboard.find(function(x) { return x.id === sid; });
                        if (it && it.isChar) { if (stNew) it.status = stNew; else delete it.status; }
                    });
                    import('./io.js').then(m => m.toast(stNew === 'dead' ? 'Marked dead.' : stNew === 'down' ? 'Marked incapacitated.' : 'Back on their feet.'));
                } else if (action.includes('cm-cast-save')) {
                    castSave(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }).filter(Boolean));
                    return;
                } else if (action.includes('cm-dup')) {
                    duplicateWbItems(selectedIds.map(function(sid) { return am.whiteboard.find(function(x) { return x.id === sid; }); }).filter(Boolean));
                    return;   // saved + rendered inside
                } else if (action.includes('cm-lock')) {
                    var lockThem = selectedIds.some(function(sid) {
                        var it = am.whiteboard.find(function(x) { return x.id === sid; });
                        return it && !it.locked;
                    });
                    selectedIds.forEach(function(sid) {
                        var it = am.whiteboard.find(function(x) { return x.id === sid; });
                        if (it) it.locked = lockThem;
                    });
                    import('./io.js').then(m => m.toast(lockThem ? 'Locked.' : 'Unlocked.'));
                } else if (action.includes('cm-grid')) {
                    var liftThem = selectedIds.some(function(sid) {
                        var it = am.whiteboard.find(function(x) { return x.id === sid; });
                        return it && !it.aboveGrid;
                    });
                    selectedIds.forEach(function(sid) {
                        var it = am.whiteboard.find(function(x) { return x.id === sid; });
                        if (!it) return;
                        if (liftThem) it.aboveGrid = true; else delete it.aboveGrid;
                    });
                    import('./io.js').then(m => m.toast(liftThem ? 'Rendering above the grid.' : 'Back under the grid.'));
                } else if (action.includes('cm-del')) {
                    am.whiteboard = am.whiteboard.filter(x => !selectedIds.includes(x.id));
                    state.selWbIds = []; state.selWbId = null;
                } else {
                    var layers = ['back', 'back-mid', 'middle', 'front-mid', 'front'];
                    selectedIds.forEach(id => {
                        var it = am.whiteboard.find(x => x.id === id);
                        if (!it) return;
                        var curIdx = layers.indexOf(it.layer || 'middle');
                        if (action.includes('cm-front')) it.layer = 'front';
                        else if (action.includes('cm-fwd')) it.layer = layers[Math.min(layers.length - 1, curIdx + 1)];
                        else if (action.includes('cm-bwd')) it.layer = layers[Math.max(0, curIdx - 1)];
                        else if (action.includes('cm-back')) it.layer = 'back';
                    });
                }
            } else {
                if (action.includes('cm-del')) {
                    am.rooms = am.rooms.filter(x => !selectedIds.includes(x.id));
                    state.selId = null;
                } else {
                    var layers = ['back', 'back-mid', 'middle', 'front-mid', 'front'];
                    selectedIds.forEach(id => {
                        var it = am.rooms.find(x => x.id === id);
                        if (!it) return;
                        var curIdx = layers.indexOf(it.layer || 'middle');
                        if (action.includes('cm-front')) it.layer = 'front';
                        else if (action.includes('cm-fwd')) it.layer = layers[Math.min(layers.length - 1, curIdx + 1)];
                        else if (action.includes('cm-bwd')) it.layer = layers[Math.max(0, curIdx - 1)];
                        else if (action.includes('cm-back')) it.layer = 'back';
                    });
                }
            }
            cMenu.style.display = 'none';
            if(window.appRender) { save(); window.appRender(); }
        };
    }
});

document.addEventListener('click', function(e) {
    var cMenu = document.getElementById('contextMenu');
    if (cMenu && cMenu.style.display === 'flex' && !e.target.closest('#contextMenu')) {
        cMenu.style.display = 'none';
    }
});






