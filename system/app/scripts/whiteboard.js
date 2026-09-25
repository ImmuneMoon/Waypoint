function setZoom(n, x, y) { if(window.appSetZoom) window.appSetZoom(n, x, y); }

function toast(msg) { if(window.appToast) window.appToast(msg); }



function render() { if(window.appRender) window.appRender(); }



var wbWrap = document.getElementById('whiteboardWrap');

var wb = document.getElementById('whiteboard');

var _lastMeasureMapId = null;

/* ---- token stance: elevation (yards) + posture (handbook ch. 9) ----
   Two VTT features (Settings ▸ VTT features, set per campaign — camp.vtt — and on from the
   first launch) decide whether the chips draw and whether the blast template measures in 3D.
   The values stay on the token either way, so switching a feature back on restores them.
   In a session the GM's campaign settings are the ceiling for the player copy: they arrive
   with the snapshot and again whenever the GM flips one, and a player may switch a feature
   off for themselves on top. stanceOn delegates to the one gate, window.wpVtt.on (vtt.js). */
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
    var v = window.wpVtt;
    if (v) return v.on(which);
    try { return localStorage.getItem('wp_' + which) !== 'off'; } catch (e) { return true; }   // vtt.js absent: the 1.4.6 keys, on until switched off
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
        + '<input class="cm-stance stance-elev-in num-stepped" type="number" step="1" value="' + tokenElevation(it) + '" style="width:54px; ' + ctl + '">'
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
    var rows = stanceMenuHtml(tok) || '';
    var sheetRow = tok.charId && window.wpSheets && window.wpSheets.canOpen(tok.charId) ? '<div class="menu-item cm-sheet-own">&#128203; Sheet&hellip;</div>' : '';
    if (!rows && !sheetRow) return;
    cMenu.innerHTML = '<div class="menu-item" style="color:var(--dim); font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; cursor:default;">' + esc(tok.charName || 'Your token') + '</div>' + sheetRow + rows.replace('<div class="menu-divider"></div>', '');
    cMenu.style.display = 'flex';
    placeMenu(cMenu, e);
    var ownSheet = cMenu.querySelector('.cm-sheet-own'); if (ownSheet) ownSheet.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; window.wpSheets.openSheet(tok.charId); });
    wireStanceMenu(cMenu, [tok], function() { save(); render(); });
}

// In a session, clients resolve campaign images through the host-fed cache
// A text box with no color of its own: light ink on a dark plate, dark ink on a light one,
// the theme's ink when the plate is missing or nearly clear (so both themes stay readable).
// A color at a given opacity, for the text / background opacity sliders. color-mix keeps any
// CSS color intact (names, var(--ink), rgba); an older engine falls back to a canvas parse.
function withAlpha(c, a) {
    c = cssColor(c);   // a colour from a file could be url(…) or a second property: none
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
// [sinkcheck:resolveimg-start]
function resolveImg(src) {
    var out = (window.wpNet && window.wpNet.assetSrc) ? window.wpNet.assetSrc(src) : src;
    return out === src ? picRef(src) : out;   // unchanged (the GM, solo or hosting; a bundled asset): the app's own pictures only — a web address from a file never loads
}
// [sinkcheck:resolveimg-end]
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

import { cssColor, picRef } from './safecore.js';   // a map from a file: colours that are colours, pictures that are the app's own



  function renderWhiteboard() {
      if (window.wpRenderPartyStrip) window.wpRenderPartyStrip();
      if (window.wpRenderCombatStrip) window.wpRenderCombatStrip();
      if (window.wpFogRedraw) window.wpFogRedraw();   // keep the fog overlay live whenever a fog map is on screen (any tool, during drags)

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

                      var _am = getActiveMap(); if (!_am) return; var wItem = _am.whiteboard.find(x => x.id === item.id);

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

                  var _am = getActiveMap(); if (!_am) return; var wItem = _am.whiteboard.find(x => x.id === item.id);

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
                          if (entry && entry.info) cstats = (cstats ? cstats + String.fromCharCode(10) : '') + entry.info;
                      }
                      // built from nodes (1.5.0): a portrait, the name, the (capped) stats line, the sheet's hover fields, the stance line
                      var ttRoot = document.createElement('div'); ttRoot.className = 'room'; ttRoot.style.cssText = 'border-left-color:var(--gold); margin:0; pointer-events:none;';
                      var ownerAv = (!wItem.src && wItem.ownerId && window.wpNet && window.wpNet.roster) ? (function() { var p = Object.keys(window.wpNet.roster).map(function(k) { return window.wpNet.roster[k]; }).find(function(x) { return x && x.id === wItem.ownerId; }); return p && window.wpNet.safeAvatar && window.wpNet.safeAvatar(p.avatar) ? p.avatar : null; })() : null;
                      var portrait = wItem.src ? resolveImg(wItem.src) : (ownerAv || (window.wpDefaultAvatar ? window.wpDefaultAvatar((wItem.color && wItem.color !== 'transparent') ? wItem.color : ('hsl(' + wbHashHue(wItem.charName || wItem.id) + ',55%,55%)')) : null));   // character image → owner profile picture → color-tinted silhouette default
                      if (portrait) { var ttImg = document.createElement('img'); ttImg.src = portrait; ttImg.loading = 'lazy'; ttImg.decoding = 'async'; ttImg.style.cssText = 'width:100%; height:90px; object-fit:cover; border-radius:4px; margin-bottom:6px; display:block;'; ttRoot.appendChild(ttImg); }   // fixed height so the card measures the same before/after the image loads (matches the room card)
                      var ttName = document.createElement('div'); ttName.className = 'rn'; ttName.textContent = cname; ttRoot.appendChild(ttName);
                      var ttStats = document.createElement('div'); ttStats.className = 'rc'; ttStats.style.cssText = 'color:var(--ink); font-size:11px; white-space:pre-wrap; text-transform:none; letter-spacing:0;'; ttStats.textContent = cstats.length > 400 ? cstats.slice(0, 400) + '…' : cstats; ttRoot.appendChild(ttStats);   // prose, not a label: no uppercase; capped for the hover peek (full text lives in the roster / Properties)
                      if (!isClientC && wItem.gmInfo) { var gmTxt = String(wItem.gmInfo); var ttGm = document.createElement('div'); ttGm.className = 'rc'; ttGm.style.cssText = 'color:var(--gold); font-size:11px; white-space:pre-wrap; margin-top:4px; border-top:1px solid var(--edge); padding-top:3px; text-transform:none; letter-spacing:0;'; ttGm.textContent = gmTxt.length > 300 ? gmTxt.slice(0, 300) + '…' : gmTxt; ttRoot.appendChild(ttGm); }   // per-token GM note / dialogue (GM only; stripped on the wire), capped
                      var sheetLines = window.wpSheets ? window.wpSheets.hoverLinesForToken(wItem) : [];
                      if (sheetLines.length) { var ttSheet = document.createElement('div'); ttSheet.className = 'rc'; ttSheet.style.cssText = 'color:var(--ink); font-size:11px;'; ttSheet.textContent = sheetLines.join(' · '); ttRoot.appendChild(ttSheet); }
                      if (stanceBits.length) { var ttStance = document.createElement('div'); ttStance.className = 'rc'; ttStance.style.cssText = 'color:var(--gold); font-size:11px;'; ttStance.textContent = stanceBits.join(' · '); ttRoot.appendChild(ttStance); }
                      tt.textContent = ''; tt.appendChild(ttRoot);

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

                  var thumb = r.image ? '<img src="'+esc(resolveImg(r.image))+'" loading="lazy" decoding="async" style="width:100%; height:90px; object-fit:cover; border-radius:4px; margin-bottom:6px; display:block;">' : '';

                  var ccol = /^(#[0-9a-fA-F]{3,8}|(rgb|hsl)a?\([\d.,\s%]+\)|[a-zA-Z]{1,20}|var\(--[\w-]+\))$/.test(String(c.color || '')) ? c.color : '#888';   // a category color is a color, never markup (it lands in a style attribute)
                  tt.innerHTML = '<div class="room" style="border-left-color:'+ccol+'; margin:0; pointer-events:none;">' +

                                 thumb +

                                 '<div class="rn">'+esc(r.name||'(unnamed)')+'</div>' +

                                 '<div class="rc" style="color:'+ccol+'">'+esc(c.label)+'</div>' +
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
                      // keep the card inside the board: cap its width+height to the visible board, then flip left/above and clamp when a BOARD edge is near (measured against the board, not the window). The portrait's height is reserved (height:90px) so this measure never goes stale when the image finishes loading.
                      var _card = tt.firstElementChild; if (_card) { _card.style.maxWidth = Math.min(320, wrapBox.width - 16) + 'px'; _card.style.maxHeight = (wrapBox.height - 16) + 'px'; } var ttR = tt.getBoundingClientRect();
                      var _sL = document.getElementById('whiteboardWrap').scrollLeft, _pX = e.clientX - wrapBox.left + _sL; var _cw = ttR.width; var _L = (_pX + 20 + _cw > _sL + wrapBox.width - 8) ? (_pX - _cw - 14) : (_pX + 20); tt.style.left = Math.max(_sL + 8, Math.min(_L, _sL + wrapBox.width - _cw - 8)) + 'px';   // flip near the right edge, then clamp into the VISIBLE content range (account for wrap scroll)
                      var _sT = document.getElementById('whiteboardWrap').scrollTop, _pY = e.clientY - wrapBox.top + _sT; var _ch = ttR.height; var _T = (_pY + 28 + _ch > _sT + wrapBox.height - 8) ? (_pY - _ch - 14) : (_pY + 28); tt.style.top = Math.max(_sT + 8, Math.min(_T, _sT + wrapBox.height - _ch - 8)) + 'px';   // clamp top into the visible board range (flips above the pointer when the bottom edge is near)

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

              // A PORTAL (links to another map) shows its destination color, bright, with a bold ring so it
              // reads clearly on a painted battle-map; a plain trigger zone keeps the faint gold tint.
              var _pRoom = item.nodeId ? activeMap.rooms.find(function (x) { return x.id === item.nodeId; }) : null;
              var _isPortal = !!item.targetMapId || !!(_pRoom && _pRoom.targetMapId);

              if (_isPortal) {

                  var _pc = cssColor(item.portalColor) || '#5ac8fa';
                  el.style.background = withAlpha(_pc, 0.55);
                  el.style.boxShadow = 'inset 0 0 0 4px ' + _pc;

              } else {

                  el.style.background = 'rgba(224,165,79,0.3)';
                  el.style.boxShadow = '';

              }

          } else {

              el.style.boxShadow = '';
              el.style.background = (item.type === 'path' || item.type === 'image' || item.type === 'text' || item.type === 'trigger') ? 'transparent' : cssColor(item.color);

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

          el.classList.toggle('wb-trap', !!item.trap && !!el.dataset.portal && !!item.hidden && !clientView);   // GM-only: an armed hidden trap portal
          el.classList.toggle('wb-blocks-sight', !!item.blocksSight && item.sightType !== 'door' && !clientView);
          el.classList.toggle('wb-door', item.blocksSight === true && item.sightType === 'door');
          el.classList.toggle('wb-door-open', item.blocksSight === true && item.sightType === 'door' && !!item.doorOpen);

          el.classList.toggle('wb-hidden-ph', hideFromMe);

          if (hideFromMe && !el.dataset.ph) { el.innerHTML = '<span class="ph-cloud">&#9729;&#65039;</span>'; el.dataset.ph = '1'; }

          if (!hideFromMe && el.dataset.ph) { el.innerHTML = ''; delete el.dataset.ph; }

          // Presence: another player's token only shows where that player actually is.

          var absentOwner = false;

          var presOwner = item.ownerId || keptOwnerOf(item);   // Onboarding F0: a kept character's token shows only where its player is, like their own

          if (item.isChar && presOwner && window.wpNet && window.wpNet.active) {

              absentOwner = !window.wpNet.isPresent(presOwner, activeMap.id);

          }

          if (clientView) { el.style.display = absentOwner ? 'none' : ''; }

          else { el.style.display = ''; el.classList.toggle('wb-absent', absentOwner); }
          var combatR = window.wpNet && window.wpNet.active && window.wpNet.combats && window.wpNet.combats[activeMap.id];
          el.classList.toggle('wb-turn', !!(combatR && combatR.rows[combatR.turn] && combatR.rows[combatR.turn].tokId === item.id));
          if (state.selWbIds && state.selWbIds.includes(item.id) && state.selWbIds.length > 1) { el.style.boxShadow = '0 0 0 2px var(--gold)'; } else { el.style.boxShadow = _isPortal ? ('inset 0 0 0 4px ' + _pc) : 'none'; }   // keep the portal ring when not multi-selected

          

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
              // A player's copy while the picture's bytes are still on their way (or never came): the character's
              // initials stand in, so a token is never an invisible box with a facing wedge and chips floating around it.
              var pendingPic = !!(item.isChar && window.wpNet && window.wpNet.ASSET_PLACEHOLDER && wantSrc === window.wpNet.ASSET_PLACEHOLDER);
              var iniEl = el.querySelector(':scope > .token-initials');
              if (pendingPic) {
                  var iniP = String(item.charName || item.name || '?').trim().split(/\s+/).map(function(s) { return s[0] || ''; }).join('').slice(0, 2).toUpperCase() || '?';
                  if (!iniEl) { iniEl = document.createElement('span'); iniEl.className = 'token-initials tok-pending'; el.appendChild(iniEl); }
                  if (iniEl.textContent !== iniP) iniEl.textContent = iniP;
              } else if (iniEl && iniEl.classList.contains('tok-pending')) iniEl.remove();

          } else if(item.type === 'text') {

              if(el.contentEditable !== "true") {

                  el.innerHTML = (clientView && window.wpNet && window.wpNet.sanitizeRichText) ? (window.wpNet.sanitizeRichText(item.text) || 'Text...') : (item.text || 'Text...');   // at a table someone else hosts the text is rebuilt (markup kept, nothing that runs): the wire did it once, the render does it again

                  fixEmbeddedImgs(el);

              }

          } else if (item.isChar && (item.type === 'circle' || item.type === 'rect' || item.type === 'diamond' || item.type === 'hexagon')) {

              // Stand-in token: initials until a portrait arrives
              var ini = String(item.charName || '?').trim().split(/\s+/).map(function(s) { return s[0] || ''; }).join('').slice(0, 2).toUpperCase() || '?';
              if (el.dataset.ini !== ini || !el.querySelector(':scope > .token-initials')) { el.textContent = ''; var iniS = document.createElement('span'); iniS.className = 'token-initials'; iniS.textContent = ini; el.appendChild(iniS); el.dataset.ini = ini; }

          } else if(item.type === 'path') {

              if(!el.querySelector('svg')) {

                  el.innerHTML = '<svg width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible;"><path /></svg>';

              }

              var svg = el.querySelector('svg');

              var bw = item.baseW || item.w;

              var bh = item.baseH || item.h;

              svg.setAttribute('viewBox', '0 0 ' + bw + ' ' + bh);

              

              var pathEl = svg.querySelector('path'), _tip = item.tip || 'round', _col = cssColor(item.color) || 'var(--ink)';
              var _sp = buildStrokePath(item.pts, _tip, item.strokeWidth || 3, item.holes);
              pathEl.setAttribute('d', _sp.d);
              if (_sp.fill) {
                  pathEl.setAttribute('fill', _col); pathEl.style.stroke = 'none'; pathEl.removeAttribute('stroke-width');
                  if (_sp.fillRule) pathEl.setAttribute('fill-rule', _sp.fillRule); else pathEl.removeAttribute('fill-rule');
              } else {
                  pathEl.setAttribute('fill', 'none'); pathEl.style.stroke = _col; pathEl.setAttribute('stroke-width', _sp.width);
                  pathEl.setAttribute('stroke-linecap', _sp.linecap); pathEl.setAttribute('stroke-linejoin', _sp.linejoin);
                  pathEl.removeAttribute('fill-rule');
              }

          }

          

          

          // Tokens carry a small front-side arrow (which side of the art is "forward")
          var fw = el.querySelector(':scope > .token-front');
          if (item.isChar && stanceOn('turning')) {   // token facing is a per-campaign VTT feature (Settings ▸ VTT features); when off there is no facing wedge
              if (!fw) { fw = document.createElement('div'); fw.className = 'token-front'; fw.innerHTML = '<i></i>'; el.appendChild(fw); }
              // Grids are square or flat-top hex, so the chosen side is always a face:
              // the arrow points straight across it at the neighbouring cell.
              fw.style.transform = item.front ? 'rotate(' + item.front + 'deg)' : '';
              // The arrow itself turns the token (click / drag) when you may move it:
              // the GM's selected token, or a player's own token.
              var clientV = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
              fw.classList.toggle('turnable', clientV ? (item.ownerId === window.wpNet.myId && !(window.wpNet.paused || window.wpNet.selfPaused)) : (state.selWbId === item.id));
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
          // Stance chips (Settings ▸ VTT features, per campaign): a small row at the bottom of the token,
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
      rotHandle.style.display = (selItem.isChar && !stanceOn('turning')) ? 'none' : 'block';   // a character token only turns when the facing feature is on; shapes/images still rotate
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
      // Play-area toggle: only for footprint items (images/shapes, not tokens), and only while the fog feature is on for this campaign
      var fogBtn = bar.querySelector('.st-fog');
      if (fogBtn) {
          var fogEligible = its.every(function(i) { return ['rect', 'hexagon', 'circle', 'diamond', 'image'].indexOf(i.type) >= 0 && !i.isChar; }) && (!window.wpVtt || window.wpVtt.on('fog'));
          fogBtn.style.display = fogEligible ? '' : 'none';
          var allFogged = its.length > 0 && its.every(function(i) { return i.fogged; });
          fogBtn.classList.toggle('on', allFogged);
          fogBtn.title = allFogged ? 'Play area — fog covers this. Click to unmark.' : 'Mark as a play area — with fog on, only marked items are fogged (scenes stay lit)';
      }
      var fitBtn = bar.querySelector('.st-fit');
      if (fitBtn) {
          var gridOn = state.gridType && state.gridType !== 'off';
          fitBtn.style.display = gridOn ? '' : 'none';
          var _fitChanges = gridOn && window.wpFitWouldChange && window.wpFitWouldChange(its);
          fitBtn.disabled = gridOn ? !_fitChanges : false;
          fitBtn.title = !gridOn ? '' : (_fitChanges ? 'Fit to grid cells — size to whole ' + state.gridType + ' cells and seat it' : 'Already aligned to the grid');
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
  function fitItemInPlace(it, g) {
    var ox = it.x, oy = it.y, ow = it.w, oh = it.h;
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
    return Math.abs(it.x - ox) > 0.01 || Math.abs(it.y - oy) > 0.01 || Math.abs(it.w - ow) > 0.01 || Math.abs(it.h - oh) > 0.01;
}
// Would fitToGrid change anything in this selection? Mirror the exact transform on clones; skip locked/path.
function fitWouldChange(its) {
    var g = state.gridType;
    if (!g || g === 'off') return false;
    for (var i = 0; i < its.length; i++) {
        var it = its[i];
        if (!it || it.locked || it.type === 'path') continue;
        if (fitItemInPlace({ x: it.x, y: it.y, w: it.w, h: it.h, isChar: it.isChar, type: it.type, shape: it.shape }, g)) return true;
    }
    return false;
}
function fitToGrid(its) {
    var g = state.gridType;
    if (!g || g === 'off') { toast('Turn on a grid first (square or hex) — the grid button in the toolbar.'); return; }
    var n = 0;
    its.forEach(function(it) {
        if (it.locked || it.type === 'path') return;
        it.gridFit = true;   // remember it's grid-fitted, so it re-seats to the cell CENTRE on every move (not just this one-shot) — a hex move used to leave it ~half a cell off in x
        if (fitItemInPlace(it, g)) n++;
    });
    if (n) { save(); render(); toast('Fitted ' + n + ' item' + (n === 1 ? '' : 's') + ' to the ' + g + ' grid.'); }
    else { toast('Already aligned to the grid.'); }
}
// One shared builder so the live draw preview and the committed stroke never drift.
function buildStrokePath(pts, tip, w, holes) {
    tip = tip || 'round'; w = w || 3;
    if (tip === 'fill') {   // a freeform filled region: pts is the closed outline; any holes are punched out with even-odd
        var _fd = 'M ' + pts.map(function(q){ return q[0] + ' ' + q[1]; }).join(' L ') + ' Z';
        if (holes && holes.length) {
            var _anyHole = false;
            holes.forEach(function(h){ if (h && h.length >= 3) { _fd += ' M ' + h.map(function(q){ return q[0] + ' ' + q[1]; }).join(' L ') + ' Z'; _anyHole = true; } });
            if (_anyHole) return { fill: true, d: _fd, fillRule: 'evenodd' };
        }
        return { fill: true, d: _fd };
    }
    if (tip === 'flat') {   // an angled calligraphy nib: a filled ribbon whose width varies with stroke direction
        var _w2 = w / 2, _ox = 0.70711 * _w2, _oy = 0.70711 * _w2;
        var _top = pts.map(function(q){ return (q[0] + _ox) + ' ' + (q[1] + _oy); });
        var _bot = pts.map(function(q){ return (q[0] - _ox) + ' ' + (q[1] - _oy); }).reverse();
        return { fill: true, d: 'M ' + _top.join(' L ') + ' L ' + _bot.join(' L ') + ' Z' };
    }
    return { fill: false, d: 'M ' + pts.map(function(q){ return q[0] + ' ' + q[1]; }).join(' L '),
             width: w, linecap: tip === 'square' ? 'square' : 'round', linejoin: tip === 'square' ? 'miter' : 'round' };
}
window.wpFitWouldChange = fitWouldChange;
window.wpBuildStrokePath = buildStrokePath;
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
          delete it.ownerId; delete it.charId; delete it.threats;   // a copy is a new creature, not a second token of the character (5h: nor its threat marks)
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
      if (its.length && its.every(function(i) { return i.type === 'path' && i.tip !== 'fill'; })) return 'pen';   // a tip:'fill' region takes the fill palette, not the pen inks
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
          else if (i.type === 'path') { var p = el.querySelector('path'); if (p) { if (i.tip === 'fill') p.style.fill = v; else p.style.stroke = v; } }
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
          } else if (act === 'fog') {
              var markThem = its.some(function(i) { return !i.fogged; });
              its.forEach(function(i) { if (markThem) i.fogged = true; else delete i.fogged; });
              if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }
              import('./io.js').then(function(m) { m.toast(markThem ? 'Marked as a play area — with fog on, only marked items are fogged.' : 'No longer a play area.'); });
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
      if (window.wpSheets && window.wpSheets.tokenTurned) window.wpSheets.tokenTurned(item.id, false);   // 5h Fold 3: a sheet's facing dial follows the arrow as it turns
  }
  window.wpTurnToken = function(item, steps) {   // programmatic / keyboard: +1 = clockwise
      var st = facingStep(item) || (state.gridType === 'hex' ? 60 : 90);
      applyFacing(item, (item.rot || 0) + (item.front || 0) + steps * st, false);
      refreshTokenDom(item);
  };
  /* Stage 5h Fold 3: the character sheet's facing dial. It turns a token on ITS OWN map (the step from that map's grid, never the
     viewer's Snap setting or the grid on screen) under the arrow's rule (a player turns their own token, while not paused; facing on),
     and ends like the arrow's release: a final pos (the host saves it), then save + render. A token on a map off screen (the GM's dial
     following a player elsewhere): save, and the host sends that map whole (a pos always names the map on screen). */
  function tokenOnMap(mapId, tokId, feature) {   // feature: the VTT feature the change needs ('turning' when left out; null = the caller checks its own)
      var camp = getActiveCampaign(), items = camp && camp.items;
      var map = items && typeof mapId === 'string' && Object.prototype.hasOwnProperty.call(items, mapId) ? items[mapId] : null;
      if (!map || map.type !== 'map' || !Array.isArray(map.whiteboard)) return null;
      var tok = map.whiteboard.find(function(x) { return x && x.id === tokId; });
      if (!tok || !tok.isChar || (feature !== null && window.wpVtt && !window.wpVtt.on(feature || 'turning'))) return null;
      var n = window.wpNet;
      if (n && n.active && n.role === 'client' && (n.paused || n.selfPaused || tok.ownerId !== n.myId)) return null;
      return { camp: camp, map: map, mapId: mapId, tok: tok, onScreen: camp.activeItemId === mapId };
  }
  function endDialTurn(t) {
      if (t.onScreen) {
          var el = state.wbEls[t.tok.id];
          if (el) { el.style.transform = t.tok.rot ? 'rotate(' + t.tok.rot + 'deg)' : 'none'; var fw = el.querySelector(':scope > .token-front'); if (fw) fw.style.transform = t.tok.front ? 'rotate(' + t.tok.front + 'deg)' : ''; }
          if (state.selWbId === t.tok.id) { var rRange = document.getElementById('wbRot'), rNum = document.getElementById('wbRotNum'); if (rRange && rNum) { rRange.value = t.tok.rot || 0; rNum.value = t.tok.rot || 0; } }
          if (window.wpUpdateHandles) window.wpUpdateHandles();
          if (window.wpNet && window.wpNet.active && window.wpNet.streamPos) window.wpNet.streamPos(t.tok, true);
      }
      save(); render();
      var n = window.wpNet;
      if (!t.onScreen && n && n.active && n.role === 'host' && n.broadcastItemFiltered) n.broadcastItemFiltered(t.camp.id, t.mapId);
      if (window.wpSheets && window.wpSheets.tokenTurned) window.wpSheets.tokenTurned(t.tok.id, true);
  }
  window.wpSetTokenFacing = function(mapId, tokId, worldDeg) {
      var t = tokenOnMap(mapId, tokId); if (!t || typeof worldDeg !== 'number' || !isFinite(worldDeg)) return false;
      var step = facingStepFor((t.map.meta && t.map.meta.gridType) || 'off', t.tok);
      var target = step ? snapFacing(worldDeg, step, 0) : Math.round(worldDeg);
      if (t.tok.faceMode === 'arrow') t.tok.front = ((Math.round(target - (t.tok.rot || 0)) % 360) + 360) % 360;
      else t.tok.rot = normDeg(target - (t.tok.front || 0));
      endDialTurn(t); return true;
  };
  // Stage 6: the sheet's stance control sets the token's posture / elevation, each only while its feature is on, the way the token's own
  // menu does (a player's goes to the host in their map patch, under the same owner gate); the GM's goes out with the map at once
  window.wpSetTokenStance = function(mapId, tokId, st) {
      var t = tokenOnMap(mapId, tokId, null); if (!t || !st || typeof st !== 'object') return false;
      var did = false;
      if (typeof st.posture === 'string' && stanceOn('posture')) { setTokenPosture(t.tok, st.posture); did = true; }
      if (st.elevation !== undefined && stanceOn('elevation') && isFinite(Number(st.elevation))) { setTokenElevation(t.tok, Number(st.elevation)); did = true; }
      if (!did) return false;
      save(); render();
      var n = window.wpNet;
      if (n && n.active && n.role === 'host') { if (t.onScreen && n.sendItem) n.sendItem(t.camp.id, mapId); else if (!t.onScreen && n.broadcastItemFiltered) n.broadcastItemFiltered(t.camp.id, mapId); }
      if (window.wpSheets && window.wpSheets.tokenTurned) window.wpSheets.tokenTurned(tokId, true);
      return true;
  };
  // Threat marks: a player's go to the host as their own message (a map patch never carries them, so a stale copy cannot undo the
  // GM's); the GM's go out with the map at once
  window.wpSetTokenThreats = function(mapId, tokId, list) {
      var t = tokenOnMap(mapId, tokId), S = window.wpSystemCore; if (!t || !S || !S.cleanThreats) return false;
      var th = S.cleanThreats(list); if (th.length) t.tok.threats = th; else delete t.tok.threats;
      var n = window.wpNet;
      if (n && n.active && n.role === 'client') { if (n.sendThreats) n.sendThreats(t.camp.id, mapId, tokId, th); render(); }
      else {
          save(); render();
          if (n && n.active && n.role === 'host') { if (t.onScreen && n.sendItem) n.sendItem(t.camp.id, mapId); else if (!t.onScreen && n.broadcastItemFiltered) n.broadcastItemFiltered(t.camp.id, mapId); }
      }
      if (window.wpSheets && window.wpSheets.tokenTurned) window.wpSheets.tokenTurned(tokId, true);
      return true;
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
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client' && (window.wpNet.paused || window.wpNet.selfPaused || item.ownerId !== window.wpNet.myId)) return;
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

          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') { var ownTok = getActiveMap().whiteboard.find(x => x.id === state.selWbId); if (window.wpNet.paused || window.wpNet.selfPaused || !ownTok || !ownTok.isChar || ownTok.ownerId !== window.wpNet.myId) return; }   // players may turn their own token

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
      ['moveModeBtn', 'panModeBtn', 'drawModeBtn', 'eraserModeBtn', 'measureModeBtn', 'blastModeBtn', 'fogModeBtn', 'fillModeBtn'].forEach(id => {
          var el = document.getElementById(id);
          if (el) el.classList.remove('active');
      });
      var el = document.getElementById(activeId);
      if (el) el.classList.add('active');
      // The hand tool pans no matter what it grabs — items are untouchable while it's active
      window.isPanMode = (activeId === 'panModeBtn');
      window.isFogMode = (activeId === 'fogModeBtn');   // fog paints on the board; other modes clear it
      window.isFillMode = (activeId === 'fillModeBtn');   // fill paints cells; other modes clear it
      if (activeId !== 'eraserModeBtn' && window.wpEraserCursorHide) window.wpEraserCursorHide();
      // Per-tool cursors (style.css `body.mode-*`): the class beats every item's own cursor
      ['mode-move', 'mode-pan', 'mode-draw', 'mode-eraser', 'mode-measure', 'mode-blast', 'mode-fog', 'mode-fill'].forEach(function(c) { document.body.classList.remove(c); });
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
      document.querySelectorAll('#drawTipRow .draw-style-btn').forEach(function(btn) { btn.classList.toggle('active', btn.dataset.tip === (state.drawTip || 'round')); });
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
      if (window.isPanMode) { var mv = document.getElementById('moveModeBtn'); if (mv) mv.click(); return; }   // second click on the active tool → back to the arrow
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
          if (_el_drawMenu.classList.contains('show')) { var mv = document.getElementById('moveModeBtn'); if (mv) mv.click(); }   // menu open → put the tool away (back to the arrow)
          else { syncDrawMenu(); _el_drawMenu.classList.add('show'); }   // menu hidden → reopen options
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
          if (_el_eraserMenu.classList.contains('show')) { var mv = document.getElementById('moveModeBtn'); if (mv) mv.click(); }   // menu open → back to the arrow
          else { syncEraserMenu(); _el_eraserMenu.classList.add('show'); }   // menu hidden → reopen options
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
  // The player of a kept character (its token has no owner: the GM moves it), for presence — never an NPC's or an unassigned character's
  function keptOwnerOf(w) {
      var camp = getActiveCampaign(), cs = camp && camp.chars, c = w && w.charId && cs && Object.prototype.hasOwnProperty.call(cs, w.charId) ? cs[w.charId] : null;
      return c && typeof c === 'object' && !c.npc && typeof c.ownerId === 'string' ? c.ownerId : '';
  }
  function targeterToken(pid) {
      var camp = getActiveCampaign(); if (!camp) return null;
      var am = getActiveMap();
      var find = function(m) { var wb = m && m.type === 'map' ? (m.whiteboard || []) : [], ok = function(w) { return w.isChar && w.ownerId === pid && w.type === 'image' && w.src; }; return wb.find(function(w) { return ok(w) && w.charId; }) || wb.find(ok); };   // their character before a pet
      var t = find(am);
      if (!t) { var ids = Object.keys(camp.items); for (var i = 0; i < ids.length && !t; i++) t = find(camp.items[ids[i]]); }
      return t ? { src: t.src, name: t.charName || t.name || '' } : null;
  }
  /* ---- party strip ----
     Every player's character as a small token in the corner of the play map. The ones on the
     map you are viewing are highlighted; while hosting, a player who is not connected is dimmed.
     Click one to jump to that character: their map (if different), centred on them at 150%. */
  var FOCUS_ZOOM = 1.5;
  function wbHashHue(s) { var h = 0, t = String(s); for (var i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) | 0; return ((h % 360) + 360) % 360; }   // a stable per-key hue for the no-picture silhouette default
  function renderPartyStrip() {
      var strip = document.getElementById('partyStrip'); if (!strip) return;
      var camp = getActiveCampaign(), am = getActiveMap();
      if (!camp || !am || am.type !== 'map' || state.viewMode !== 'visual') { strip.innerHTML = ''; strip.dataset.sig = ''; return; }
      var list = characterList(camp, true, am.id);
      var hosting = window.wpNet && window.wpNet.active && window.wpNet.role === 'host';
      var atTable = window.wpNet && window.wpNet.active && (hosting || window.wpNet.role === 'client');   // players see the party too, read-only
      var present = {};
      if (atTable) Object.values(window.wpNet.roster || {}).forEach(function(p) { if (p && p.id) present[p.id] = true; });
      strip.dataset.tip = atTable && !hosting
          ? 'The party — everyone at the table. The highlighted ones are on this map: click to find them, right-click to target.'
          : 'Your players\' characters. Click one to jump to them; right-click for more (summon). The highlighted ones are on this map.';
      // Connected players without a token yet: their table picture, or a chip with their name
      if (atTable) {
          var owned = {}; list.forEach(function(c) { if (c.ownerId) owned[c.ownerId] = true; });
          Object.values(window.wpNet.roster || {}).forEach(function(p) {
              if (!p || !p.id || owned[p.id]) return;
              var avOk = !!(window.wpNet && window.wpNet.safeAvatar && window.wpNet.safeAvatar(p.avatar));   // the whole data URL (net.js)
              var locMap = p.location && camp.items[p.location];
              list.push({ key: 'p:' + p.id, ownerId: p.id, tokId: null, name: p.name || 'Player', src: avOk ? p.avatar : null, avatar: true, color: p.color || null,
                          mapId: p.location || null, map: locMap && locMap.meta && locMap.meta.title || 'no map yet', noToken: true });
          });
      }
      var sig = list.map(function(c) { return c.key + '|' + c.name + '|' + c.mapId + '|' + (c.src ? c.src.length + c.src.slice(-16) : '') + '|' + (atTable ? (present[c.ownerId] ? 1 : 0) : 2) + '|' + (window.wpSheets && c.tokId ? window.wpSheets.hoverLinesForTokenId(camp, c.tokId).join(',') : '') + '|' + (hosting && c.ownerId && window.wpNet.isPlayerPaused && window.wpNet.isPlayerPaused(c.ownerId) ? 'P' : ''); }).join(';') + '#' + am.id;
      if (strip.dataset.sig === sig) return;
      strip.dataset.sig = sig;
      strip.innerHTML = list.map(function(c) {
          var here = c.mapId === am.id;
          var away = atTable && c.ownerId && !present[c.ownerId];
          var pausedC = hosting && c.ownerId && window.wpNet.isPlayerPaused && window.wpNet.isPlayerPaused(c.ownerId);
          var cls = 'party-tok' + (here ? ' here' : '') + (away ? ' away' : '') + (pausedC ? ' paused' : '');
          var tip = c.name + (here ? ' \u2014 on this map' : ' \u2014 on ' + c.map) + (away ? ' (player not connected)' : '') + (pausedC ? ' \u2014 PAUSED by you' : '') + (c.noToken ? ' \u2014 no token yet' : '') + (atTable && !hosting ? (here ? '. Click to find them.' : '') : '. Click to jump to them.');
          if (window.wpSheets && c.tokId) { var hlT = window.wpSheets.hoverLinesForTokenId(camp, c.tokId); if (hlT.length) tip += String.fromCharCode(10) + hlT.join(' · '); }
          if (c.src) return '<img class="' + cls + (c.noToken ? ' party-face' : '') + '" data-key="' + esc(c.key) + '" src="' + esc(c.avatar ? c.src : resolveImg(c.src)) + '" alt="" data-tip="' + esc(tip) + '">';
          var pcol = c.color || ('hsl(' + wbHashHue(c.key) + ',55%,55%)');   // no picture → the color-tinted silhouette default
          return '<img class="' + cls + (c.noToken ? ' party-face' : '') + '" data-key="' + esc(c.key) + '" src="' + (window.wpDefaultAvatar ? window.wpDefaultAvatar(pcol) : '') + '" alt="" data-tip="' + esc(tip) + '">';
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
          if (loc.map !== am && window.wpHistBarrier) window.wpHistBarrier([loc.map.id, am.id]);   // a move between two maps: neither side can be undone past it
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
          var whereName = loc ? (loc.map.meta && loc.map.meta.title || 'their map') : (rosterP && rosterP.location && camp.items[rosterP.location] && camp.items[rosterP.location].meta && camp.items[rosterP.location].meta.title) || 'their map';
          var isClientM = window.wpNet && window.wpNet.active && window.wpNet.role === 'client' && !window.wpStream;
          if (isClientM && !here) items.push({ act: 'none', label: name + ' \u2014 on ' + whereName, dim: true });
          else items.push({ act: 'jump', label: '\uD83C\uDFAF ' + (isClientM ? 'Find ' : 'Jump to ') + name + (here ? '' : ' (' + whereName + ')') });
          if (hosting && ownerId) {
              var stagedId = window.wpNet.stagedMapId ? window.wpNet.stagedMapId() : null;
              var viewingOther = am && am.type === 'map' && stagedId && stagedId !== am.id;   // GM is looking at a different map than the table's pinned one
              var amTitle = (am && am.meta && am.meta.title) || 'this map';
              var stagedTitle = (stagedId && camp.items[stagedId] && camp.items[stagedId].meta && camp.items[stagedId].meta.title) || null;
              var tableSfx = (viewingOther && stagedTitle) ? ' (' + stagedTitle + ')' : '';
              items.push(connected
                  ? { act: 'summon', label: '\uD83D\uDCE3 Summon ' + name + ' to the table\'s map' + tableSfx }
                  : { act: 'none', label: '\uD83D\uDCE3 Summon ' + name + ' \u2014 not connected', dim: true });
              if (viewingOther && connected) items.push({ act: 'summonHere', label: '\uD83D\uDCE3 Summon ' + name + ' to this map (' + amTitle + ')' });
              items.push({ act: 'summonAll', label: '\uD83D\uDCE3 Summon everyone to the table\'s map' + tableSfx });
              if (viewingOther) items.push({ act: 'summonAllHere', label: '\uD83D\uDCE3 Summon everyone to this map (' + amTitle + ')' });
              if (connected) {
                  var pausedP = window.wpNet.isPlayerPaused && window.wpNet.isPlayerPaused(ownerId);
                  items.push({ act: pausedP ? 'unpausePlayer' : 'pausePlayer', label: (pausedP ? '\u25B6\uFE0F Resume ' : '\u23F8\uFE0F Pause ') + name + ' (just this player)' });
              }
          }
          var isClient = window.wpNet && window.wpNet.active && window.wpNet.role === 'client';
          if (!isClient && am && am.type === 'map' && !(hosting && connected)) items.push({ act: 'bring', label: '\u27A4 Bring ' + name + ' here (this map)' });
          if (window.wpNet && window.wpNet.active && !hosting && !window.wpStream) items.push({ act: 'target', label: '\u25CE Target ' + name });
          if (loc && loc.tok && window.wpSheets && (!isClient ? true : (loc.tok.charId && window.wpSheets.canOpen(loc.tok.charId)))) items.push({ act: 'sheet', label: String.fromCharCode(55357, 56523) + ' ' + (loc.tok.charId ? 'Sheet\u2026' : 'New character sheet\u2026') });   // character sheets (1.5.0)
          if (!isClient && ownerId && window.wpSheets && window.wpSheets.giveCharacter && camp && camp.system && giveList(camp, ownerId).length) items.push({ act: 'give', label: '\uD83C\uDFAD Give a character\u2026' });   // Onboarding F0: give, switch the one in play, or put its token here
          if (!isClient && window.wpSheets) items.push({ act: 'chars', label: String.fromCharCode(55357, 56421) + ' Characters\u2026' });
          fillPartyMenu(items, tok.dataset.key);
          menu.classList.add('show');
          window.wpClampMenu(menu, e.clientX, e.clientY);
      });
      function fillPartyMenu(items, key) {
          menu.innerHTML = items.map(function(i) {
              return '<button class="wb-tool-btn party-menu-item' + (i.dim ? ' dim' : '') + '" data-act="' + i.act + '" data-key="' + esc(key) + '"' + (i.cid ? ' data-cid="' + esc(i.cid) + '"' : '') + ' style="width:100%; border-radius:0; font-size:12px; height:auto; padding:8px 10px; text-align:left;">' + esc(i.label) + '</button>';
          }).join('');
      }
      // Onboarding F0: what the GM can give a player — their own characters first (the one they play: its token onto their map; a kept one:
      // play it now), then the unassigned ones, then other players' (a reassignment). Never an NPC.
      function giveList(camp, pid) {
          var S = window.wpSystemCore; if (!S || !S.activeCharOf || !camp || !camp.chars) return [];
          var act = S.activeCharOf(camp, pid).id, names = {}, out = [];
          Object.keys(camp.players || {}).forEach(function(k) { var r = camp.players[k]; if (r && typeof r.name === 'string') names[k] = r.name; });
          var cs = Object.keys(camp.chars).map(function(k) { return camp.chars[k]; }).filter(function(c) { return c && typeof c === 'object' && !c.npc && !c.draft; }).sort(function(a, b) { return String(a.name).localeCompare(String(b.name)); });
          var live = !!(window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.isConnected && window.wpNet.isConnected(pid));
          cs.forEach(function(c) { if (c.ownerId !== pid) return; if (c.id !== act) out.push({ act: 'giveTo', cid: c.id, label: c.name + ' (theirs, kept) \u2014 play it now' }); else if (live) out.push({ act: 'giveTo', cid: c.id, label: c.name + ' (plays) \u2014 put its token on their map' }); });   // putting it back needs them at the table
          cs.forEach(function(c) { if (!c.ownerId) out.push({ act: 'giveTo', cid: c.id, label: c.name }); });
          cs.forEach(function(c) { if (c.ownerId && c.ownerId !== pid) out.push({ act: 'giveTo', cid: c.id, label: c.name + ' \u2014 from ' + (Object.prototype.hasOwnProperty.call(names, c.ownerId) ? names[c.ownerId] : 'another player'), from: true }); });
          return out;
      }
      if (menu) menu.addEventListener('click', function(e) {
          var b = e.target.closest && e.target.closest('.party-menu-item'); if (!b) return;
          e.stopPropagation();
          var key = b.dataset.key, act = b.dataset.act;
          if (act === 'give') { var campG = getActiveCampaign(); fillPartyMenu(giveList(campG, key.slice(2)).concat([{ act: 'none', label: 'The one you give is the one they play; the one they played before stays theirs (kept).', dim: true }]), key); var rG = menu.getBoundingClientRect(); if (rG.bottom > window.innerHeight - 6) menu.style.top = Math.max(6, window.innerHeight - rG.height - 6) + 'px'; if (rG.right > window.innerWidth - 6) menu.style.left = Math.max(6, window.innerWidth - rG.width - 6) + 'px'; return; }   // the list replaces the menu in place, kept inside the window
          closePartyMenu();
          if (act === 'giveTo') {
              var campT = getActiveCampaign(), pidT = key.slice(2), cidT = b.dataset.cid, chT = campT && campT.chars && Object.prototype.hasOwnProperty.call(campT.chars, cidT) ? campT.chars[cidT] : null;
              if (!chT || !window.wpSheets) return;
              var doGive = function() { if (window.wpSheets.giveCharacter(pidT, cidT)) toast(chT.name + ' given.'); if (window.wpRenderPartyStrip) window.wpRenderPartyStrip(); };
              if (chT.ownerId && chT.ownerId !== pidT) showConfirm('Give ' + chT.name + ' to this player? Their current player loses it: its sheet closes for them, and its tokens go to the new player.', function(yes) { if (yes) doGive(); });
              else doGive();
              return;
          }
          if (act === 'jump') { if (window.wpStream && window.wpStreamFocusChar) window.wpStreamFocusChar(key); else focusCharacter(key); }
          else if (act === 'summon') { window.wpNet.summonPlayerById(key.slice(2)); }
          else if (act === 'summonHere') { var amH = getActiveMap(); if (amH && amH.type === 'map' && window.wpNet.summonPlayerToMap) window.wpNet.summonPlayerToMap(key.slice(2), amH.id); }
          else if (act === 'summonAll') { window.wpNet.summonAll(); }
          else if (act === 'summonAllHere') { var amA = getActiveMap(); if (amA && amA.type === 'map' && window.wpNet.summonAllToMap) window.wpNet.summonAllToMap(amA.id); }
          else if (act === 'pausePlayer') { if (window.wpNet.pausePlayer) window.wpNet.pausePlayer(key.slice(2), true); }
          else if (act === 'unpausePlayer') { if (window.wpNet.pausePlayer) window.wpNet.pausePlayer(key.slice(2), false); }
          else if (act === 'bring') { var ctrB = viewCentre(); bringKeyHere(key, ctrB.x, ctrB.y); }
          else if (act === 'sheet') { var campS = getActiveCampaign(), locS = locateCharacter(campS, key, campS && campS.activeItemId); if (locS && locS.tok && window.wpSheets) { if (!locS.tok.charId && !(window.wpNet && window.wpNet.active && window.wpNet.role === 'client')) window.wpSheets.newFromToken(locS.tok); if (locS.tok.charId) window.wpSheets.openSheet(locS.tok.charId); } }
          else if (act === 'chars') { if (window.wpSheets) window.wpSheets.open('chars'); }
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
     the table sees a ring in your color. Same token again, or Esc, clears it. */
  (function wireTargeting() {
      var down = null;
      document.addEventListener('pointerdown', function(e) {
          down = null;
          if (e.button !== 0 || !e.target || !e.target.closest) return;
          if (!(window.wpNet && window.wpNet.active && window.wpNet.role === 'client')) return;
          if (window.isDrawingMode || window.isEraserMode || window.isMeasureMode || window.isPanMode || window.isFogMode) return;
          var el = e.target.closest('#whiteboard .wb-item'); if (!el) return;
          var am = getActiveMap(); if (!am || am.type !== 'map' || state.viewMode !== 'visual') return;
          var item = am.whiteboard.find(function(x) { return x.id === el.dataset.id; });
          if (item && item.blocksSight && item.sightType === 'door' && !item.hidden) { down = { doorId: item.id, mapId: am.id, x: e.clientX, y: e.clientY }; return; }   // a client clicks a door to request opening/closing it
          if (!item || !item.isChar || item.hidden || item.ownerId === window.wpNet.myId) return;
          down = { id: item.id, name: item.charName || item.name || 'that token', x: e.clientX, y: e.clientY, mapId: am.id };
      }, true);
      document.addEventListener('pointerup', function(e) {
          if (!down) return;
          var d = down; down = null;
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;   // a drag (of your own token underneath), not a click
          var el = e.target && e.target.closest && e.target.closest('#whiteboard .wb-item');
          if (!el) return;
          if (d.doorId) { if (el.dataset.id === d.doorId && window.wpNet.doorReq) window.wpNet.doorReq(d.mapId, d.doorId); return; }   // door open/close request (host validates adjacency + lock)
          if (el.dataset.id !== d.id) return;
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
      if (t.closest('#whiteboardWrap, #sidebar, #selToolbar, #contextMenu, .floating-toolbar, .shape-menu, .dropdown, .menu-item, [id$="Modal"], #sheetPanel, #soundPanel, #dicePanel, #cmdkModal, input, select, textarea, [contenteditable="true"]')) return;
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
          var isRegion = (item.type === 'path' && item.tip === 'fill');
          if ((item.fill || isRegion) && !item.locked) {   // a fill cell OR a freeform fill region erases as a whole item
              if (eraserClient) { out.push(item); return; }   // GM-only fills
              var _er = (state.eraserSize || 6);
              if (isRegion) {   // erase the whole region when the eraser is inside it (not in a punched hole), or touches its outline
                  var _rsx = item.w / (item.baseW || item.w || 1), _rsy = item.h / (item.baseH || item.h || 1);
                  var _hx = x, _hy = y;
                  if (item.rot) {   // render rotates the box about its centre; test in that same (un-rotated) frame
                      var _ra = -item.rot * Math.PI / 180, _rcos = Math.cos(_ra), _rsin = Math.sin(_ra);
                      var _rcx = item.x + item.w / 2, _rcy = item.y + item.h / 2, _rdx = x - _rcx, _rdy = y - _rcy;
                      _hx = _rcx + _rdx * _rcos - _rdy * _rsin; _hy = _rcy + _rdx * _rsin + _rdy * _rcos;
                  }
                  var _toAbs = function(p) { return [item.x + p[0] * _rsx, item.y + p[1] * _rsy]; };
                  var _poly = (item.pts || []).map(_toAbs);
                  var _hit = pointInPoly(_hx, _hy, _poly);
                  if (_hit && item.holes) {   // a click inside a punched-out hole is not on the fill
                      for (var _hi = 0; _hi < item.holes.length; _hi++) {
                          if (pointInPoly(_hx, _hy, item.holes[_hi].map(_toAbs))) { _hit = false; break; }
                      }
                  }
                  if (!_hit && _poly.length > 1) {
                      var _erSq = _er * _er;
                      for (var _pi = 0, _pj = _poly.length - 1; _pi < _poly.length; _pj = _pi++) {
                          if (distToSegSq(_hx, _hy, _poly[_pj][0], _poly[_pj][1], _poly[_pi][0], _poly[_pi][1]) <= _erSq) { _hit = true; break; }
                      }
                  }
                  if (_hit) { changed = true; return; }
                  out.push(item); return;
              }
              if (x >= item.x - _er && x <= item.x + item.w + _er && y >= item.y - _er && y <= item.y + item.h + _er) { changed = true; return; }
              out.push(item); return;
          }
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

  // [sinkcheck:measure-start]
  function mapMeasureConfig() {

      var m = getActiveMap();

      var meta = (m && m.meta) || {};

      var hex = state.gridType === 'hex';

      return {

          cellPx: hex ? 52 : 50,

          cellName: hex ? 'hex' : 'sq',

          per: (typeof meta.cellValue === 'number' && meta.cellValue > 0) ? meta.cellValue : (hex ? 1 : 5),

          unit: (typeof meta.cellUnit === 'string' && /^(yd|ft|m|km|mi)$/.test(meta.cellUnit)) ? meta.cellUnit : (hex ? 'yd' : 'ft')

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

  // [sinkcheck:measure-end]
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

          // Both ends on distinct character tokens: extra readout lines (3D elevation, and cover from the map's blockers)
          var lab3 = '', labCov = '';
          var amR = getActiveMap();
          var tA = amR && tokenAtPoint(amR, m.x1, m.y1), tB = amR && tokenAtPoint(amR, m.x2, m.y2);
          var bothTok = !!(tA && tB && tA !== tB);
          if (bothTok && stanceOn('elevation') && tokenElevation(tA) !== tokenElevation(tB)) {
              var hY = boardYards(m.x1, m.y1, m.x2, m.y2), vY = tokenElevation(tB) - tokenElevation(tA);
              lab3 = '3D ' + _r1(Math.sqrt(hY * hY + vY * vY)) + ' yd \u00b7 ' + fmtElev(vY) + ' yd';
          }
          if (bothTok && window.wpFog && window.wpFog.coverBetween) {
              var cv = window.wpFog.coverBetween(m.x1, m.y1, m.x2, m.y2);   // advisory: Waypoint estimates cover from the map's blockers; the GM makes the call
              if (cv && cv.name) labCov = 'Cover: ' + cv.name;
          }
          html += '<text x="' + (mx + 8) + '" y="' + (my - 8) + '">' + measureLabel(dist) + '</text>';
          var _covY = my + 11;
          if (lab3) { html += '<text x="' + (mx + 8) + '" y="' + _covY + '">' + lab3 + '</text>'; _covY += 19; }
          if (labCov) html += '<text x="' + (mx + 8) + '" y="' + _covY + '">' + labCov + '</text>';
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
          var _boom = e.target.closest('.blast-boom');
          if (_boom && e.button === 0) { var _bi = parseInt(_boom.dataset.i, 10); var _bb = blasts[_bi]; if (_bb && window.wpFx) { var _ppy = mapMeasureConfig().cellPx / cellYards(); window.wpFx.blastBoom(_bb.x, _bb.y, blastRadiusYd(_bb) * _ppy); } e.stopPropagation(); e.preventDefault(); return; }
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

          if (isFinite(v) && v > 0 && v <= 1e9) m.meta.cellValue = v;   // a sane scale (the wire refuses a whole number past 64 bits)

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

          if (_el_measureMenu.classList.contains('show')) { var mv = document.getElementById('moveModeBtn'); if (mv) mv.click(); }   // menu open → back to the arrow

          else { syncMeasureMenu(); _el_measureMenu.classList.add('show'); }   // menu hidden → reopen options

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
          if (window.wpMeasureKind === 'fx') { placeFx(e); e.preventDefault(); return; }

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
  window.isFogMode = false;
  var blasts = [];
  var BLAST_CAP = 40;   // blasts on screen per map: the oldest go as new ones land (a throw stream from a player never grows this, or every client's render, without bound)
  function pushBlast(b) { blasts.push(b); if (blasts.length > BLAST_CAP) blasts.splice(0, blasts.length - BLAST_CAP); }
  var blastDefaults = { ft: 12, name: '' };   // the toolbar quick-tool is unnamed; thrown blasts take their name from the item
  try { var _bf = JSON.parse(localStorage.getItem('wp_blast') || 'null'); if (_bf && _bf.ft > 0) blastDefaults = { ft: _bf.ft, name: '' }; } catch (e) {}
  var _blastHitIds = [];
  var blastDrag = null;   // { i, sx, sy, ox, oy, moved } while a blast is being dragged
  var _armedThrow = null;   // { charId, itemId, ft, name, by } while a sheet Throw is armed (one-shot)
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
          if (!window.wpNet || !window.wpNet.active || window.wpNet.role === 'host') html += '<text class="blast-boom" data-i="' + i + '" x="' + (b.x + 8) + '" y="' + (b.y - rPx - 26) + '">💥 Boom</text>';   // fires a burst everyone sees (1.5.0)
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
  function clearBlasts() { blasts = []; renderMeasures(); if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.broadcastBlastClear) { var mc = getActiveMap(); window.wpNet.broadcastBlastClear(mc ? mc.id : null); } }
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
      if (_armedThrow) {   // a throw from a character sheet: one-shot, host-authoritative, shared to the map
          var ctx = _armedThrow; _armedThrow = null; document.body.classList.remove('placing');
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') { if (window.wpNet.throwReq) window.wpNet.throwReq(ctx.charId, ctx.fieldId, ctx.rowId, x, y, map.id); }
          else placeThrownBlast({ x: x, y: y, ft: ctx.ft, name: ctx.name, by: ctx.by, charId: ctx.charId, damage: ctx.damage });
          var mvB = document.getElementById('moveModeBtn'); if (mvB) mvB.click();
          return;
      }
      // A grenade lands in a cell, at the height of whoever stands there (a token on a catwalk), else the ground
      var b = { x: x, y: y, ft: blastDefaults.ft, name: blastDefaults.name, elev: 0, autoElev: true };
      seatBlast(b);
      pushBlast(b);
      renderMeasures(); syncBlastMenu();
      var n = blastDistances(b, map).filter(function(r) { return r.d <= blastRadiusYd(b) + 1e-9; }).length;
      toast((b.name ? b.name + ' ' : 'Blast ') + b.ft + ' ft placed' + (stanceOn('elevation') ? ' at ' + fmtElev(b.elev) + ' yd' : '') + ' \u2014 ' + n + ' token' + (n === 1 ? '' : 's') + ' in range. Drag it to move, right-click to remove.');
  }
  // A blast thrown from a character sheet: placed on the host, shown to everyone on the map (never the personal quick-tool).
  function placeThrownBlast(opts) {
      var map = getActiveMap(); if (!map || !opts) return null;
      var ft = Math.max(1, Math.min(3000, Math.round(opts.ft || 0))) || 12;
      var b = { x: opts.x, y: opts.y, ft: ft, name: opts.name || '', elev: (opts.elev !== undefined ? opts.elev : 0), autoElev: opts.elev === undefined, thrown: true, by: opts.by || '' };
      seatBlast(b); pushBlast(b); renderMeasures(); syncBlastMenu();
      if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.broadcastBlast) window.wpNet.broadcastBlast({ x: b.x, y: b.y, ft: b.ft, name: b.name, elev: b.elev, by: b.by }, map.id);
      var n = blastDistances(b, map).filter(function(r) { return r.d <= blastRadiusYd(b) + 1e-9; }).length;
      toast((b.by ? b.by + ' throws ' : 'Thrown ') + (b.name ? b.name + ' ' : '') + b.ft + ' ft \u2014 ' + n + ' token' + (n === 1 ? '' : 's') + ' in range.');
      resolveThrow(b, opts, n);
      return b;
  }
  window.wpPlaceThrownBlast = placeThrownBlast;   // net.js calls this on the host after validating a player's throw-req
  // The damage half of a throw (host/solo only): roll the item's damage, and in full-auto subtract it from every
  // in-range token's health resource as one undoable transaction. blastAuto: full = roll+apply, roll = roll to chat, measure = neither.
  function resolveThrow(b, opts, nInRange) {
      var camp = getActiveCampaign(), sys = camp && camp.system; if (!sys || !opts || !opts.damage) return;
      var combat = sys.combat || {}, auto = combat.blastAuto || 'full';
      if (auto === 'measure') return;
      if (window.wpVtt && !window.wpVtt.on('dice')) return;
      if (!window.wpDice || !window.wpDice.rollFor) return;
      var dr = window.wpDice.rollFor(opts.charId, opts.damage, (opts.name || 'Blast') + ' damage');
      var total = dr && dr.ok && typeof dr.value === 'number' ? dr.value : null;
      if (auto !== 'full' || total === null) return;
      applyBlastDamage(b, total, combat.hpResource);
  }
  var _lastThrowTx = null;
  function applyBlastDamage(b, total, hpId) {
      var camp = getActiveCampaign(), sys = camp && camp.system, S = window.wpSystemCore, F = window.wpFormula, map = getActiveMap();
      if (!sys || !S || !F || !map) return;
      if (!hpId) { toast('Full auto is on, but no damage resource is set (System editor \u25b8 Items \u25b8 Damage subtracts from).'); return; }
      var rYd = blastRadiusYd(b), hits = [], applied = 0;
      blastDistances(b, map).forEach(function(r) {
          if (r.d > rYd + 1e-9 || !r.tok.charId) return;
          var ch = camp.chars && camp.chars[r.tok.charId]; if (!ch) return;
          var all = S.resolveAll(sys, ch, F), e = all[hpId]; if (!e) return;
          var cur = typeof e.value === 'number' ? e.value : 0;
          var res = S.applyEdit(sys, ch, hpId, { cur: cur - total }, F, {}); if (!res.ok) return;
          var prev = ch.values && Object.prototype.hasOwnProperty.call(ch.values, hpId) ? JSON.parse(JSON.stringify(ch.values[hpId])) : undefined;
          ch.values = ch.values || {}; ch.values[hpId] = res.value; ch.updated = Date.now();
          hits.push({ charId: r.tok.charId, hpId: hpId, prev: prev });
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.syncCharDelta) { var d = {}; d[hpId] = res.value; window.wpNet.syncCharDelta(r.tok.charId, d); }
          if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(r.tok.charId);
          applied++;
      });
      if (applied) { _lastThrowTx = { hits: hits }; save(); syncBlastMenu(); toast('\u2212' + total + ' to ' + applied + ' token' + (applied === 1 ? '' : 's') + '. Undo last throw in the \ud83d\udca5 menu.'); }
  }
  // Undo the last full-auto throw's damage: restore every affected character's health, host-synced.
  window.wpUndoThrow = function() {
      if (!_lastThrowTx || !_lastThrowTx.hits.length) { toast('Nothing to undo.'); return; }
      var camp = getActiveCampaign(); if (!camp) return;
      _lastThrowTx.hits.forEach(function(h) {
          var ch = camp.chars && camp.chars[h.charId]; if (!ch) return;
          ch.values = ch.values || {};
          if (h.prev === undefined) delete ch.values[h.hpId]; else ch.values[h.hpId] = h.prev;
          ch.updated = Date.now();
          if (window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.syncCharDelta) { var d = {}; d[h.hpId] = h.prev === undefined ? null : h.prev; window.wpNet.syncCharDelta(h.charId, d); }
          if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(h.charId);
      });
      var nn = _lastThrowTx.hits.length; _lastThrowTx = null; save(); syncBlastMenu();
      toast('Throw damage undone (' + nn + ' token' + (nn === 1 ? '' : 's') + ').');
  };
  window.wpHasThrowUndo = function() { return !!(_lastThrowTx && _lastThrowTx.hits.length); };
  // A sheet Throw button arms a one-shot blast placement (mirrors wpArmFxBurst); the next map click throws it.
  window.wpArmBlast = function(ft, name, ctx) {
      ft = Math.max(1, Math.min(3000, Math.round(ft || 0))); if (!(ft > 0)) return;
      _armedThrow = { charId: ctx && ctx.charId, fieldId: ctx && ctx.fieldId, rowId: ctx && ctx.rowId, ft: ft, name: name || '', by: (ctx && ctx.by) || '', damage: (ctx && ctx.damage) || '' };
      window.isDrawingMode = false; window.isEraserMode = false; window.isFogMode = false;
      window.isMeasureMode = true; window.wpMeasureKind = 'blast';
      if (wbWrap) wbWrap.style.cursor = 'crosshair'; document.body.classList.add('placing');
      toast('Click the map to throw' + (name ? ' the ' + name : '') + '. Esc cancels.');
  };
  // A client's received shared blast (from the host): rendered, never re-broadcast.
  window.wpRenderSharedBlast = function(bl) {
      if (!bl || typeof bl.x !== 'number' || typeof bl.y !== 'number') return;
      var ft = Math.max(1, Math.min(3000, Math.round(bl.ft || 0))) || 12;
      pushBlast({ x: bl.x, y: bl.y, ft: ft, name: typeof bl.name === 'string' ? bl.name.slice(0, 60) : '', elev: typeof bl.elev === 'number' ? bl.elev : 0, autoElev: false, thrown: true, by: typeof bl.by === 'string' ? bl.by.slice(0, 60) : '', shared: true });
      renderMeasures();
  };
  window.wpClearSharedBlasts = function() { var had = blasts.some(function(b) { return b.shared; }); blasts = blasts.filter(function(b) { return !b.shared; }); if (had) renderMeasures(); };
  // Visual effects (1.5.0): the ✨ panel arms a burst, a click on the map places it (its own Measure sub-mode)
  var _fxArm = null;
  window.wpArmFxBurst = function(look, rPx) { _fxArm = { look: look, r: Math.max(20, Math.min(6000, Math.round(rPx || 160))) }; window.isMeasureMode = true; window.wpMeasureKind = 'fx'; toast('Click the map to place the ' + look + ' burst.'); };
  function placeFx(e) {
      var map = getActiveMap(); if (!map || !_fxArm) { window.isMeasureMode = false; window.wpMeasureKind = 'ruler'; return; }
      var box = wbWrap.getBoundingClientRect();
      var x = (e.clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel;
      var y = (e.clientY - box.top + wbWrap.scrollTop) / state.zoomLevel;
      x = Math.max(0, Math.min(30000, x)); y = Math.max(0, Math.min(30000, y));
      var look = _fxArm.look, r = _fxArm.r; _fxArm = null; window.isMeasureMode = false; window.wpMeasureKind = 'ruler';
      if (window.wpFx) window.wpFx.placeBurst(x, y, look, r);
  }
  // Esc cancels an armed throw or FX burst and returns to the arrow
  document.addEventListener('keydown', function(e) {
      if (e.key !== 'Escape') return;
      if (_armedThrow || _fxArm) { _armedThrow = null; _fxArm = null; document.body.classList.remove('placing'); window.isMeasureMode = false; window.wpMeasureKind = 'ruler'; var mvE = document.getElementById('moveModeBtn'); if (mvE) mvE.click(); }
  });
  window.wpMeasure = { config: mapMeasureConfig, cellYards: cellYards, pxToYards: function(px) { var c = cellYards(), ppy = c ? mapMeasureConfig().cellPx / c : 0; return ppy ? Math.round(px / ppy * 10) / 10 : null; } };
  // Fog of war (1.5.0): a play-map mode. The button enters fog mode and opens its menu (fog.js owns the menu +
  // overlay); a click or drag paints reveal/hide cells. datamap.js suppresses token drag/pan/selection while
  // window.isFogMode is on. Right-click (or the Hide brush) paints the opposite of the current brush.
  var _el_fogModeBtn = document.getElementById('fogModeBtn');
  if (_el_fogModeBtn) _el_fogModeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!window.isFogMode) {
          window.isDrawingMode = false; window.isEraserMode = false; window.isMeasureMode = false;
          if (wbWrap) wbWrap.style.cursor = 'crosshair';
          updateWbToolbar('fogModeBtn');
          closeDrawMenu();
          state.selWbId = null; state.selWbIds = []; render();
          if (window.wpFog) window.wpFog.openMenu();
      } else {
          var fm = document.getElementById('fogMenu');
          if (fm && fm.classList.contains('show')) { if (window.wpFog) window.wpFog.closeMenu(); var mv = document.getElementById('moveModeBtn'); if (mv) mv.click(); }   // menu open → back to the arrow
          else if (window.wpFog) window.wpFog.openMenu();
      }
  });
  // fog.js calls this when the fog feature switches off while the GM is in fog mode
  window.wpExitFogMode = function() {
      window.isDrawingMode = false; window.isEraserMode = false; window.isMeasureMode = false;
      if (wbWrap) wbWrap.style.cursor = 'default';
      updateWbToolbar('moveModeBtn');
  };
  if (wbWrap) {
      var _fogPaintBtn = -1;
      var _fogBoard = function(e) { var box = wbWrap.getBoundingClientRect(); return { x: (e.clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel, y: (e.clientY - box.top + wbWrap.scrollTop) / state.zoomLevel }; };
      wbWrap.addEventListener('pointerdown', function(e) {
          if (!window.isFogMode || (e.button !== 0 && e.button !== 2)) return;
          var pt = _fogBoard(e);
          if (e.button === 0 && window.wpFog && window.wpFog.toggleDoorAt && window.wpFog.toggleDoorAt(pt.x, pt.y)) { _fogPaintBtn = -1; e.preventDefault(); return; }   // clicked a door -> toggled it, do not paint
          _fogPaintBtn = e.button;
          if (window.wpFog) window.wpFog.paintAt(pt.x, pt.y, e.button === 2);
          e.preventDefault();
      });
      wbWrap.addEventListener('pointermove', function(e) {
          if (!window.isFogMode || _fogPaintBtn < 0) return;
          var pt = _fogBoard(e); if (window.wpFog) window.wpFog.paintAt(pt.x, pt.y, _fogPaintBtn === 2);
      });
      wbWrap.addEventListener('contextmenu', function(e) { if (window.isFogMode) e.preventDefault(); });
      document.addEventListener('pointerup', function() { _fogPaintBtn = -1; });
  }
  // Fill bucket (1.5.0, GM): click or drag grid cells to drop a cell-sized colored shape (hexagon on hex maps,
  // square on square maps) seated in the cell at layer 'back' (below tokens); right-click a cell clears its fill.
  var _el_fillModeBtn = document.getElementById('fillModeBtn'), _el_fillMenu = document.getElementById('fillMenu');
  try { var _fc0 = localStorage.getItem('wp_fillColor'); if (_fc0 && /^#[0-9a-f]{6}$/i.test(_fc0)) state.fillColor = _fc0; } catch (e) {}
  var _fci0 = document.getElementById('fillColorInput'); if (_fci0 && /^#[0-9a-f]{6}$/i.test(state.fillColor || '')) _fci0.value = state.fillColor;
  function syncFillMenu() {
      document.querySelectorAll('#fillColorRow .draw-swatch[data-color]').forEach(function(sw) { sw.classList.toggle('active', sw.dataset.color.toLowerCase() === (state.fillColor || '').toLowerCase()); });
      var cs = document.querySelector('#fillColorRow .draw-swatch.custom'); if (cs) { var preset = document.querySelector('#fillColorRow .draw-swatch[data-color].active'); cs.classList.toggle('active', !preset); cs.style.background = preset ? '' : state.fillColor; }
      var _fi = document.getElementById('fillColorIndicator'); if (_fi) _fi.style.background = state.fillColor;
  }
  if (_el_fillModeBtn) _el_fillModeBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (!window.isFillMode) {
          window.isDrawingMode = false; window.isEraserMode = false; window.isMeasureMode = false; window.isFogMode = false;
          if (wbWrap) wbWrap.style.cursor = 'crosshair';
          updateWbToolbar('fillModeBtn'); closeDrawMenu();
          state.selWbId = null; state.selWbIds = []; render();
          syncFillMenu(); if (_el_fillMenu) _el_fillMenu.classList.add('show');
      } else if (_el_fillMenu) {
          if (_el_fillMenu.classList.contains('show')) { var mv = document.getElementById('moveModeBtn'); if (mv) mv.click(); }
          else { syncFillMenu(); _el_fillMenu.classList.add('show'); }
      }
  });
  document.querySelectorAll('#fillColorRow .draw-swatch[data-color]').forEach(function(sw) {
      sw.addEventListener('click', function() { state.fillColor = this.dataset.color; var fi = document.getElementById('fillColorInput'); if (fi) fi.value = this.dataset.color; try { localStorage.setItem('wp_fillColor', state.fillColor); } catch (e) {} syncFillMenu(); });
  });
  var _fillColorInput = document.getElementById('fillColorInput');
  if (_fillColorInput) _fillColorInput.addEventListener('input', function() { state.fillColor = this.value; try { localStorage.setItem('wp_fillColor', state.fillColor); } catch (e) {} syncFillMenu(); });
  syncFillMenu();   // show the loaded fill color on the toolbar button at startup
  document.addEventListener('click', function(e) { if (_el_fillMenu && _el_fillMenu.classList.contains('show') && !e.target.closest('#fillMenu') && !e.target.closest('#fillModeBtn')) _el_fillMenu.classList.remove('show'); });
  var _fillDirty = false;
  // Snap a board point to its grid cell (square 50px, or hex). One source of truth for fill + flood-fill.
  function cellSnap(x, y) {
      var cx, cy, w, h, type;
      if (state.gridType === 'hex') { var hc = snapToHex(x, y, 30, 'center'); cx = hc.x; cy = hc.y; w = 60; h = 52; type = 'hexagon'; }
      else { cx = Math.floor(x / 50) * 50 + 25; cy = Math.floor(y / 50) * 50 + 25; w = 50; h = 50; type = 'rect'; }
      return { cx: cx, cy: cy, w: w, h: h, type: type, px: Math.round(cx - w / 2), py: Math.round(cy - h / 2) };
  }
  function fillCellAt(x, y, remove) {
      var map = getActiveMap(); if (!map) return;
      if (!Array.isArray(map.whiteboard)) map.whiteboard = [];
      var c = cellSnap(x, y), px = c.px, py = c.py;
      var existing = map.whiteboard.find(function(it) { return it && it.fill && Math.abs(it.x - px) < 1 && Math.abs(it.y - py) < 1; });
      if (remove) { if (existing) { map.whiteboard = map.whiteboard.filter(function(it) { return it !== existing; }); _fillDirty = true; render(); } return; }
      if (existing) { if (existing.color !== state.fillColor) { existing.color = state.fillColor; _fillDirty = true; render(); } return; }
      var item = Object.assign({ id: 'wb' + uid(), type: c.type, x: px, y: py, w: c.w, h: c.h, baseW: c.w, baseH: c.h, z: 10, color: state.fillColor, fill: true, layer: 'back' }, (window.wpNewOpacityProps ? window.wpNewOpacityProps() : {}));
      map.whiteboard.push(item); _fillDirty = true; render();
  }
  // Add (or recolor) one fill cell WITHOUT save/render — for batch use by the flood-fill. Returns true if it changed anything.
  function fillCellCore(map, x, y) {
      var c = cellSnap(x, y), px = c.px, py = c.py;
      var existing = map.whiteboard.find(function(it) { return it && it.fill && Math.abs(it.x - px) < 1 && Math.abs(it.y - py) < 1; });
      if (existing) { if (existing.color !== state.fillColor) { existing.color = state.fillColor; return true; } return false; }
      map.whiteboard.push(Object.assign({ id: 'wb' + uid(), type: c.type, x: px, y: py, w: c.w, h: c.h, baseW: c.w, baseH: c.h, z: 10, color: state.fillColor, fill: true, layer: 'back' }, (window.wpNewOpacityProps ? window.wpNewOpacityProps() : {})));
      return true;
  }
  // Ramer–Douglas–Peucker polyline simplification (iterative, no recursion). Keeps endpoints; drops points within eps of a chord.
  function rdpSimplify(points, eps) {
      var n = points.length;
      if (n < 3) return points.slice();
      var keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
      var stack = [[0, n - 1]], epsSq = eps * eps;
      while (stack.length) {
          var seg = stack.pop(), s = seg[0], e = seg[1];
          if (e <= s + 1) continue;
          var ax = points[s][0], ay = points[s][1], bx = points[e][0], by = points[e][1];
          var maxD = -1, idx = -1;
          for (var i = s + 1; i < e; i++) {
              var dd = distToSegSq(points[i][0], points[i][1], ax, ay, bx, by);
              if (dd > maxD) { maxD = dd; idx = i; }
          }
          if (maxD > epsSq && idx > s) { keep[idx] = 1; stack.push([s, idx]); stack.push([idx, e]); }
      }
      var out = [];
      for (var k = 0; k < n; k++) if (keep[k]) out.push(points[k]);
      return out;
  }
  // Point-in-polygon (ray cast) — used to erase a freeform fill region as a whole item.
  function pointInPoly(x, y, poly) {
      var inside = false, n = poly.length;
      for (var i = 0, j = n - 1; i < n; j = i++) {
          var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
          if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) inside = !inside;
      }
      return inside;
  }
  // Moore-neighbour boundary trace (8-connected) from a component's top-left-most pixel. solid(x,y) => in-component.
  // Returns an ordered loop of pixel coords, or null. Bounded by maxSteps against a stray loop.
  function mooreTrace(solid, cw, ch, sx, sy) {
      var nb = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];   // clockwise from West
      var start = [sx, sy], startB = [sx - 1, sy];   // arrived from the west (empty: sx,sy is first in raster order for its component)
      var p = [sx, sy], b = [sx - 1, sy];
      var contour = [], maxSteps = cw * ch * 4 + 16, steps = 0;
      do {
          var dx = b[0] - p[0], dy = b[1] - p[1], idx = 0;
          for (var i = 0; i < 8; i++) { if (nb[i][0] === dx && nb[i][1] === dy) { idx = i; break; } }
          var found = false, j = 0, nx = 0, ny = 0;
          for (var k = 1; k <= 8; k++) { j = (idx + k) % 8; nx = p[0] + nb[j][0]; ny = p[1] + nb[j][1]; if (solid(nx, ny)) { found = true; break; } }
          if (!found) { contour.push([p[0], p[1]]); break; }   // isolated pixel
          b = [p[0] + nb[(j + 7) % 8][0], p[1] + nb[(j + 7) % 8][1]];
          p = [nx, ny];
          contour.push([p[0], p[1]]);
          steps++;
      } while ((p[0] !== start[0] || p[1] !== start[1] || b[0] !== startB[0] || b[1] !== startB[1]) && steps < maxSteps);
      return contour.length >= 3 ? contour : null;
  }
  // Trace the OUTER boundary of a flooded pixel region into a loop of pixel coords, or null.
  function traceRegionOutline(vis, cw, ch) {
      var sx = -1, sy = -1;
      for (var yy = 0; yy < ch && sy < 0; yy++) { for (var xx = 0; xx < cw; xx++) { if (vis[yy * cw + xx] === 1) { sx = xx; sy = yy; break; } } }
      if (sx < 0) return null;
      return mooreTrace(function(x, y) { return x >= 0 && y >= 0 && x < cw && y < ch && vis[y * cw + x] === 1; }, cw, ch, sx, sy);
  }
  /* Enclosed HOLES in the flooded region: pixels that are neither wall, nor flooded (visited), nor reachable
     from the raster border ("outside"). Returns one boundary loop per hole component (an interior island such
     as a pillar), so the freeform fill can punch them out and match the grid-on cell behaviour. Capped. */
  function traceHoles(vis, isWall, cw, ch) {
      var N = cw * ch, outside = new Uint8Array(N), st = new Int32Array(N), sp = 0;
      var pushOut = function(i) { if (!outside[i] && !isWall(i)) { outside[i] = 1; st[sp++] = i; } };
      for (var x = 0; x < cw; x++) { pushOut(x); pushOut((ch - 1) * cw + x); }
      for (var y = 0; y < ch; y++) { pushOut(y * cw); pushOut(y * cw + cw - 1); }
      while (sp > 0) {
          var oi = st[--sp], ox2 = oi % cw, oy2 = (oi - ox2) / cw;
          if (ox2 > 0) pushOut(oi - 1);
          if (ox2 < cw - 1) pushOut(oi + 1);
          if (oy2 > 0) pushOut(oi - cw);
          if (oy2 < ch - 1) pushOut(oi + cw);
      }
      var mask = new Uint8Array(N), any = false;
      for (var i2 = 0; i2 < N; i2++) { if (!isWall(i2) && vis[i2] !== 1 && !outside[i2]) { mask[i2] = 1; any = true; } }
      if (!any) return [];
      var solid = function(hx, hy) { return hx >= 0 && hy >= 0 && hx < cw && hy < ch && mask[hy * cw + hx] === 1; };
      var loops = [], st2 = new Int32Array(N);
      for (var seed = 0; seed < N && loops.length < 200; seed++) {
          if (mask[seed] !== 1) continue;
          var ssx = seed % cw, ssy = (seed - ssx) / cw;
          var loop = mooreTrace(solid, cw, ch, ssx, ssy);
          if (loop && loop.length >= 3) loops.push(loop);
          var q = 0; st2[q++] = seed; mask[seed] = 2;   // consume this component (4-connected) so it isn't re-traced
          while (q > 0) {
              var k = st2[--q], kx = k % cw, ky = (k - kx) / cw;
              if (kx > 0 && mask[k - 1] === 1) { mask[k - 1] = 2; st2[q++] = k - 1; }
              if (kx < cw - 1 && mask[k + 1] === 1) { mask[k + 1] = 2; st2[q++] = k + 1; }
              if (ky > 0 && mask[k - cw] === 1) { mask[k - cw] = 2; st2[q++] = k - cw; }
              if (ky < ch - 1 && mask[k + cw] === 1) { mask[k + cw] = 2; st2[q++] = k + cw; }
          }
      }
      return loops;
  }
  /* Flood-fill inside drawn lines: rasterize this map's pen strokes into an offscreen canvas as walls,
     flood outward from the click, and — if the flood is fully enclosed (never touches the padded edge) —
     GRID ON: paint every grid cell whose centre lands in the flooded region (grid-aligned);
     GRID OFF: trace the flooded outline into one smooth freeform filled region (a tip:'fill' path).
     Grid-aware per the owner's choice; capped both ways. */
  function floodFillWithin(x, y) {
      var map = getActiveMap(); if (!map) return;
      if (!Array.isArray(map.whiteboard)) map.whiteboard = [];
      var walls = [], minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      map.whiteboard.forEach(function(it) {
          if (!it || it.type !== 'path' || !it.pts || !it.pts.length) return;
          var sx = it.w / (it.baseW || it.w || 1), sy = it.h / (it.baseH || it.h || 1);
          var sw = Math.max(2, (it.strokeWidth || 3));
          var abs = it.pts.map(function(p) { return [it.x + p[0] * sx, it.y + p[1] * sy]; });
          abs.forEach(function(p) { if (p[0] < minX) minX = p[0]; if (p[0] > maxX) maxX = p[0]; if (p[1] < minY) minY = p[1]; if (p[1] > maxY) maxY = p[1]; });
          walls.push({ abs: abs, sw: sw });
      });
      if (!walls.length) { toast('Draw some lines first — flood-fill needs an outline to fill inside.'); return; }
      var PAD = 30;
      minX -= PAD; minY -= PAD; maxX += PAD; maxY += PAD;
      if (x < minX || x > maxX || y < minY || y > maxY) { toast('Click inside your drawn lines to flood-fill.'); return; }
      var wpx = Math.max(1, maxX - minX), hpx = Math.max(1, maxY - minY);
      var S = Math.min(1, Math.sqrt(1500000 / (wpx * hpx)));   // cap the raster at ~1.5M px
      var cw = Math.max(2, Math.round(wpx * S)), ch = Math.max(2, Math.round(hpx * S));
      var cvs = document.createElement('canvas'); cvs.width = cw; cvs.height = ch;
      var g = cvs.getContext('2d', { willReadFrequently: true }); if (!g) { toast('Flood-fill isn\'t available here.'); return; }
      g.setTransform(S, 0, 0, S, -minX * S, -minY * S);
      g.strokeStyle = '#000'; g.fillStyle = '#000'; g.lineJoin = 'round'; g.lineCap = 'round';
      var minWall = 1.6 / S;   // keep walls at least ~1.6 device px thick so a downscaled raster can't leak through thin seams
      walls.forEach(function(wl) {
          var lw = Math.max(wl.sw, minWall);
          g.lineWidth = lw; g.beginPath();
          wl.abs.forEach(function(p, i) { if (i === 0) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]); });
          if (wl.abs.length === 1) { g.arc(wl.abs[0][0], wl.abs[0][1], lw / 2, 0, 6.2832); g.fill(); }
          else g.stroke();
      });
      var img;
      try { img = g.getImageData(0, 0, cw, ch).data; } catch (e) { toast('Couldn\'t read the drawing to flood-fill.'); return; }
      var sxp = Math.round((x - minX) * S), syp = Math.round((y - minY) * S);
      if (sxp < 0 || sxp >= cw || syp < 0 || syp >= ch) { toast('Click inside your drawn lines to flood-fill.'); return; }
      var wall = function(i) { return img[i * 4 + 3] > 40; };   // any drawn (alpha) pixel is a wall
      var start = syp * cw + sxp;
      if (wall(start)) { toast('Click in an open space, not on a line.'); return; }
      var visited = new Uint8Array(cw * ch), stack = new Int32Array(cw * ch), sp = 0;
      stack[sp++] = start; visited[start] = 1;
      var touchedEdge = false;
      while (sp > 0) {
          var idx = stack[--sp], cxp = idx % cw, cyp = (idx - cxp) / cw;
          if (cxp === 0 || cyp === 0 || cxp === cw - 1 || cyp === ch - 1) touchedEdge = true;
          var l = idx - 1, r = idx + 1, u = idx - cw, d = idx + cw;
          if (cxp > 0 && !visited[l] && !wall(l)) { visited[l] = 1; stack[sp++] = l; }
          if (cxp < cw - 1 && !visited[r] && !wall(r)) { visited[r] = 1; stack[sp++] = r; }
          if (cyp > 0 && !visited[u] && !wall(u)) { visited[u] = 1; stack[sp++] = u; }
          if (cyp < ch - 1 && !visited[d] && !wall(d)) { visited[d] = 1; stack[sp++] = d; }
      }
      if (touchedEdge) { toast('That space isn\'t fully enclosed by your lines — close the gaps and try again.'); return; }
      if (state.gridType === 'hex' || state.gridType === 'square') {
          // GRID ON — fill whole cells whose centre lands in the flooded region (stays aligned with tokens + measurement).
          // Sample the bbox finer than any cell so none is skipped.
          var step = 20, seen = {}, added = 0, CAP = 20000;
          for (var yy = minY; yy <= maxY + step && added < CAP; yy += step) {
              for (var xx = minX; xx <= maxX + step && added < CAP; xx += step) {
                  var c = cellSnap(xx, yy), key = c.px + ',' + c.py;
                  if (seen[key]) continue; seen[key] = 1;
                  var pxc = Math.round((c.cx - minX) * S), pyc = Math.round((c.cy - minY) * S);
                  if (pxc < 0 || pxc >= cw || pyc < 0 || pyc >= ch) continue;
                  if (!visited[pyc * cw + pxc]) continue;   // this cell's centre isn't inside the flooded area
                  if (fillCellCore(map, c.cx, c.cy)) added++;
              }
          }
          if (added) { save(); render(); toast('Filled ' + added + ' cell' + (added === 1 ? '' : 's') + ' inside your lines.'); }
          else { toast('Nothing new to fill there.'); }
          return;
      }
      // GRID OFF — fill the enclosed area as one smooth freeform region: trace the flooded outline into a filled shape.
      var loopPx = traceRegionOutline(visited, cw, ch);
      if (!loopPx || loopPx.length < 3) { toast('Couldn\'t trace that area — try a cleaner outline.'); return; }
      var toBoard = function(p) { return [minX + (p[0] + 0.5) / S, minY + (p[1] + 0.5) / S]; };   // pixel centre → board coords
      var loopBd = loopPx.map(toBoard);
      // Simplify tolerance in board px — but never coarser than ~1/3 the region's own thickness, so a thin channel survives.
      var lx0 = Infinity, ly0 = Infinity, lx1 = -Infinity, ly1 = -Infinity;
      loopBd.forEach(function(p) { if (p[0] < lx0) lx0 = p[0]; if (p[0] > lx1) lx1 = p[0]; if (p[1] < ly0) ly0 = p[1]; if (p[1] > ly1) ly1 = p[1]; });
      var thin = Math.min(lx1 - lx0, ly1 - ly0);
      var eps = Math.max(2.5, 1.5 / S);
      if (thin < eps * 3) eps = Math.max(0.4, thin / 3);
      var simp = rdpSimplify(loopBd, eps), epsN = eps;
      while (simp.length > 6000 && epsN < 1e5) { epsN *= 2; simp = rdpSimplify(loopBd, epsN); }   // actually enforce the vertex ceiling
      if (simp.length < 3) { toast('Couldn\'t trace that area — try a cleaner outline.'); return; }
      var ox = Infinity, oy = Infinity, mx = -Infinity, my = -Infinity;
      simp.forEach(function(p) { if (p[0] < ox) ox = p[0]; if (p[0] > mx) mx = p[0]; if (p[1] < oy) oy = p[1]; if (p[1] > my) my = p[1]; });
      var rw = Math.max(10, mx - ox), rh = Math.max(10, my - oy);
      var toLocal = function(p) { return [+(p[0] - ox).toFixed(2), +(p[1] - oy).toFixed(2)]; };
      var local = simp.map(toLocal);
      // Punch interior islands (e.g. a pillar drawn inside the room) out of the fill, matching the grid-on cell behaviour.
      // Keep ONLY holes that lie inside THIS region's outer contour — other enclosed drawings elsewhere on the map are not ours.
      var holes = [];
      traceHoles(visited, wall, cw, ch).forEach(function(hl) {
          var hb = hl.map(toBoard);
          if (!pointInPoly(hb[0][0], hb[0][1], loopBd)) return;
          var hs = rdpSimplify(hb, epsN);
          if (hs.length >= 3) holes.push(hs.map(toLocal));
      });
      var region = Object.assign({ id: 'wb' + uid(), type: 'path', tip: 'fill', x: ox, y: oy, w: rw, h: rh, baseW: rw, baseH: rh,
          z: 10, pts: local, color: state.fillColor, layer: 'back' }, (window.wpNewOpacityProps ? window.wpNewOpacityProps() : {}));
      if (holes.length) region.holes = holes;
      map.whiteboard.push(region);
      save(); render();
      toast('Filled the area inside your lines.');
  }
  if (wbWrap) {
      var _fillPaintBtn = -1;
      var _fillBoard = function(e) { var box = wbWrap.getBoundingClientRect(); return { x: (e.clientX - box.left + wbWrap.scrollLeft) / state.zoomLevel, y: (e.clientY - box.top + wbWrap.scrollTop) / state.zoomLevel }; };
      wbWrap.addEventListener('pointerdown', function(e) {
          if (!window.isFillMode || (e.button !== 0 && e.button !== 2)) return;
          var pt = _fillBoard(e); e.preventDefault();
          var flood = document.getElementById('fillFloodChk');
          if (e.button === 0 && flood && flood.checked) { floodFillWithin(pt.x, pt.y); return; }   // flood is a single-click action (no paint-drag); right-click still erases one cell
          _fillPaintBtn = e.button; fillCellAt(pt.x, pt.y, e.button === 2);
      });
      wbWrap.addEventListener('pointermove', function(e) { if (!window.isFillMode || _fillPaintBtn < 0) return; var pt = _fillBoard(e); fillCellAt(pt.x, pt.y, _fillPaintBtn === 2); });
      wbWrap.addEventListener('contextmenu', function(e) { if (window.isFillMode) e.preventDefault(); });
      document.addEventListener('pointerup', function() { if (_fillPaintBtn >= 0 && _fillDirty) { save(); _fillDirty = false; } _fillPaintBtn = -1; });
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
      var flat = document.getElementById('blastFlatNote');
      if (flat) {
          flat.style.display = stanceOn('elevation') ? 'none' : '';
          var why = window.wpVtt ? window.wpVtt.whyOff('elevation') : 'own';   // whose setting keeps it flat
          flat.textContent = why === 'gm' ? 'Token elevation is off at this table (the GM\'s setting): flat hex distance.'
              : why === 'local' ? 'Token elevation is off for you at this table (⚙ Settings ▸ VTT features): flat hex distance.'
              : 'Token elevation is off for this campaign (⚙ Settings ▸ VTT features): flat hex distance.';
      }
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
      } else if (_el_blastMenu) { if (_el_blastMenu.classList.contains('show')) { var mv = document.getElementById('moveModeBtn'); if (mv) mv.click(); } else { syncBlastMenu(); _el_blastMenu.classList.add('show'); } }
  });
  document.querySelectorAll('#blastPresetRow .draw-style-btn').forEach(function(b) { b.addEventListener('click', function() { setBlastShape(this.dataset.ft, this.dataset.name); }); });
  var _el_blastFt = document.getElementById('blastFt');
  if (_el_blastFt) _el_blastFt.addEventListener('change', function() { setBlastShape(this.value, ''); });
  var _el_blastElev = document.getElementById('blastElev');
  if (_el_blastElev) _el_blastElev.addEventListener('input', function() { var b = lastBlast(); if (!b) return; var v = Number(this.value); b.elev = isFinite(v) ? Math.max(-999, Math.min(999, v)) : 0; b.autoElev = false; renderMeasures(); });
  var _el_blastClearBtn = document.getElementById('blastClearBtn');
  if (_el_blastClearBtn) _el_blastClearBtn.addEventListener('click', function() { clearBlasts(); syncBlastMenu(); });
  var _el_blastUndoThrow = document.getElementById('blastUndoThrow');
  if (_el_blastUndoThrow) _el_blastUndoThrow.addEventListener('click', function() { if (window.wpUndoThrow) window.wpUndoThrow(); });
  if (_el_blastMenu) ['pointerdown', 'click'].forEach(function(ev) { _el_blastMenu.addEventListener(ev, function(e) { e.stopPropagation(); }); });
  document.addEventListener('click', function(e) {
      if (_el_blastMenu && _el_blastMenu.classList.contains('show') && !e.target.closest('#blastMenu') && !e.target.closest('#blastModeBtn')) closeBlastMenu();
  });

  // Pen preferences survive restarts: color, width, freehand/line (wp_drawColor / wp_drawWidth / wp_drawStraight)
  try { var _dc0 = localStorage.getItem('wp_drawColor'); if (_dc0 && /^#[0-9a-f]{6}$/i.test(_dc0)) state.drawColor = _dc0; } catch (e) {}
  try { var _dw0 = parseInt(localStorage.getItem('wp_drawWidth'), 10); if ([2, 3, 6, 10, 16].indexOf(_dw0) !== -1) state.drawStrokeWidth = _dw0; } catch (e) {}
  try { if (localStorage.getItem('wp_drawStraight') !== null) state.drawStraight = localStorage.getItem('wp_drawStraight') === '1'; } catch (e) {}
  try { var _dt0 = localStorage.getItem('wp_drawTip'); if (['round', 'square', 'flat'].indexOf(_dt0) !== -1) state.drawTip = _dt0; } catch (e) {}
  var _dci0 = document.getElementById('drawColorInput'); if (_dci0 && /^#[0-9a-f]{6}$/i.test(state.drawColor || '')) _dci0.value = state.drawColor;
  function saveDrawPrefs() { try { localStorage.setItem('wp_drawColor', state.drawColor); localStorage.setItem('wp_drawWidth', String(state.drawStrokeWidth)); localStorage.setItem('wp_drawStraight', state.drawStraight ? '1' : '0'); localStorage.setItem('wp_drawTip', state.drawTip || 'round'); } catch (e) {} }
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
  document.querySelectorAll('#drawTipRow .draw-style-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
          state.drawTip = this.dataset.tip;
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
  /* ---- library scope and categories (1.5.0) ----
     Scope. A picture belongs to a campaign when one of the campaign's items owns the folder it was uploaded
     into (the folder is the uploading item's id) or when the campaign uses it (play-map items, room scenes,
     portraits, handouts, page and planner picture blocks, the cast) or brought it in (camp.pictures).
     tutorial/ is Shared, whatever uses it. A picture nobody owns or uses is Unfiled.
     Categories. Two stores of one shape { list: [names], by: { path: [names] }, shelf: { name: true } }:
     appState.imageCats holds the SHARED categories (every campaign sees them; the tutorial's Default),
     camp.imageCats the campaign's own — GM bookkeeping that never leaves the machine (net.js sanitizeAppState,
     cleanup.js STRIPPED). A name is unique across a campaign's list and the shared list. Readers never
     create a store (an empty shaped store would count as local work for the cleanup classifier). */
  var EMPTY_CATS = Object.freeze({ list: Object.freeze([]), by: Object.freeze({}), shelf: Object.freeze({}) });
  var _imgLibCat = '';          // '' = the whole view, '__bymap', '__none', or a category name
  var _imgLibCatCamp = null;    // the campaign the chip was chosen in: a switch resets it
  var _imgLibScope = 'camp';    // 'camp' | 'shared' | 'unfiled' | 'all'
  var _imgLibPicker = null;     // Import from another campaign…: the source ('<campId>' | 'shared' | 'unfiled'), else null
  var _imgLibStash = null;      // the main view's state while the picker is open
  var _imgIndex = null;         // built per open from the save: { refs: { path: [campIds] }, titles: { itemId: { title, campId, camp } } }
  function fixCats(c) { if (!Array.isArray(c.list)) c.list = []; if (!c.by || typeof c.by !== 'object') c.by = {}; if (!c.shelf || typeof c.shelf !== 'object') c.shelf = {}; return c; }
  function catStoreIn(data, store, create) {   // 'shared' or a campaign id; create only from a writer
      if (!data) return EMPTY_CATS;
      if (store === 'shared') {
          if (!data.imageCats || typeof data.imageCats !== 'object') { if (!create) return EMPTY_CATS; data.imageCats = { list: [], by: {}, shelf: {} }; }
          return fixCats(data.imageCats);
      }
      var camp = data.campaigns && data.campaigns[store]; if (!camp || typeof camp !== 'object') return EMPTY_CATS;
      if (!camp.imageCats || typeof camp.imageCats !== 'object') { if (!create) return EMPTY_CATS; camp.imageCats = { list: [], by: {}, shelf: {} }; }
      return fixCats(camp.imageCats);
  }
  function catStore(store, create) { return catStoreIn(state.appState, store, create); }
  function viewCampId() { if (_imgLibPicker && _imgLibPicker !== 'shared' && _imgLibPicker !== 'unfiled') return _imgLibPicker; var c = getActiveCampaign(); return c ? c.id : null; }
  // the stores a view reads: the viewed campaign's own, then the shared one
  function catStores() { var id = viewCampId(); var out = []; if (id) out.push({ key: id, c: catStore(id) }); out.push({ key: 'shared', c: catStore('shared') }); return out; }
  function catHome(name) { var id = viewCampId(); if (id && catStore(id).list.indexOf(name) >= 0) return id; if (catStore('shared').list.indexOf(name) >= 0) return 'shared'; return null; }
  function catList() { var out = []; catStores().forEach(function(s) { s.c.list.forEach(function(n) { out.push({ name: n, store: s.key }); }); }); return out; }
  function tagsIn(c, path) { var v = c.by[path]; if (!v) return []; return (Array.isArray(v) ? v : [v]).filter(function(n) { return c.list.indexOf(n) >= 0; }); }
  function imgCatsOf(path) { var out = []; catStores().forEach(function(s) { tagsIn(s.c, path).forEach(function(n) { if (out.indexOf(n) < 0) out.push(n); }); }); return out; }
  function imgCatOf(path) { var a = imgCatsOf(path); return a.length ? a.join(', ') : ''; }
  function imgCatHas(path, name) { return imgCatsOf(path).indexOf(name) >= 0; }
  function isShelved(name) { return catStores().some(function(s) { return !!s.c.shelf[name]; }); }
  // A picture's tags, written: each name goes to the store it lives in; an unknown name to the campaign's store
  function imgCatWrite(path, arr) {
      var byStore = {}, home = viewCampId() || 'shared';
      arr.forEach(function(n) { var h = catHome(n) || home; (byStore[h] = byStore[h] || []).push(n); });
      catStores().forEach(function(s) {
          if (byStore[s.key]) catStore(s.key, true).by[path] = byStore[s.key];
          else if (s.c.by[path]) delete s.c.by[path];
      });
  }
  function imgCatsSave() { import('./io.js').then(function(m) { m.save(true); }); }
  // Tag a set of pictures with a category (creating it), optionally on its own shelf; store = 'shared' or a campaign id (the tutorial uses 'shared')
  window.wpImgCatEnsure = function(name, paths, shelf, store) {
      var c = catStore(store || 'shared', true);
      if (c.list.indexOf(name) < 0) c.list.push(name);
      (paths || []).forEach(function(p) { var a = tagsIn(c, p); if (a.indexOf(name) < 0) { a.push(name); c.by[p] = a; } });
      if (shelf) c.shelf[name] = true;
  };
  // Rename a category in one store (list, tags, shelf); a no-op when it does not exist or the new name is taken
  window.wpImgCatRename = function(oldName, newName, store) {
      var c = catStore(store || 'shared'); if (c === EMPTY_CATS || c.list.indexOf(oldName) < 0 || c.list.indexOf(newName) >= 0) return false;
      c.list[c.list.indexOf(oldName)] = newName;
      Object.keys(c.by).forEach(function(p) { var arr = Array.isArray(c.by[p]) ? c.by[p] : [c.by[p]]; c.by[p] = arr.map(function(n) { return n === oldName ? newName : n; }); });
      if (c.shelf[oldName]) { delete c.shelf[oldName]; c.shelf[newName] = true; }
      return true;
  };
  /* ---- the scope index ---- */
  function pathKeys(p) { var out = [p]; try { var d = decodeURIComponent(p); if (d !== p) out.push(d); } catch (e) {} try { var en = encodeURI(p); if (en !== p) out.push(en); } catch (e) {} return out; }
  // Every campaign's item titles (first owner of an id wins) and every path each campaign uses
  function buildImgIndexFor(data) {
      var refs = {}, titles = {};
      var add = function(key, campId) { if (!key || typeof key !== 'string') return; pathKeys(key).forEach(function(k) { var a = refs[k] = refs[k] || []; if (a.indexOf(campId) < 0) a.push(campId); }); };
      Object.keys((data && data.campaigns) || {}).forEach(function(cid) {
          var camp = data.campaigns[cid]; if (!camp || typeof camp !== 'object') return;
          Object.keys(camp.items || {}).forEach(function(id) {
              var it = camp.items[id]; if (!it || typeof it !== 'object') return;
              if (!titles[id]) titles[id] = { title: (it.meta && it.meta.title) || id, campId: cid, camp: camp.name || cid };
              (it.whiteboard || []).forEach(function(w) { if (w) add(w.src, cid); });
              (it.rooms || []).forEach(function(r) { if (!r) return; add(r.image, cid); (r.characters || []).forEach(function(ch) { if (ch) add(ch.portrait, cid); }); });
              (it.blocks || []).forEach(function(b) { if (b) add(b.src, cid); });
          });
          Object.values(camp.handouts || {}).forEach(function(h) { if (h) add(h.src, cid); });
          Object.values(camp.cast || {}).forEach(function(c) { if (c) add(c.src, cid); });
          (Array.isArray(camp.pictures) ? camp.pictures : []).forEach(function(p) { add(p, cid); });
      });
      return { refs: refs, titles: titles };
  }
  function buildImgIndex() { _imgIndex = buildImgIndexFor(state.appState); return _imgIndex; }
  function folderOf(p) { return String(p || '').replace(/^\/saves\/images\//, '').split('/').slice(0, -1).join('/'); }
  // the campaigns a picture belongs to (folder owner first, then every campaign using it); 'shared' for the tutorial art; [] = Unfiled
  function imgCampsFor(idx, path, folder) {
      if (/^tutorial(\/|$)/.test(folder || '')) return 'shared';
      var out = [], t = idx.titles[folder];
      if (t) out.push(t.campId);
      (idx.refs[path] || []).forEach(function(cid) { if (out.indexOf(cid) < 0) out.push(cid); });
      return out;
  }
  function imgCamps(im) { if (!_imgIndex) buildImgIndex(); return imgCampsFor(_imgIndex, im.path, im.folder); }
  function inScope(im, scope, campId) {
      var c = imgCamps(im);
      if (scope === 'all') return true;
      if (scope === 'shared') return c === 'shared';
      if (scope === 'unfiled') return c !== 'shared' && c.length === 0;
      return c !== 'shared' && !!campId && c.indexOf(campId) >= 0;
  }
  function notJournal(i) { return !/^journal(\/|$)/.test(i.folder || ''); }
  // The pictures of one campaign, for other pickers (the handout picker): list = what /api/list-images answered
  window.wpImgScope = function(list, campId) { buildImgIndex(); return (list || []).filter(function(im) { return notJournal(im) && inScope(im, 'camp', campId); }); };
  function pickerScope() { return _imgLibPicker === 'shared' ? 'shared' : _imgLibPicker === 'unfiled' ? 'unfiled' : 'camp'; }
  function scopedCache() {   // what the current view (the scope, or the picker's source) holds
      var list = (_imgLibCache || []).filter(notJournal);
      if (_imgLibPicker) return list.filter(function(im) { return inScope(im, pickerScope(), _imgLibPicker); });
      var camp = getActiveCampaign();
      return list.filter(function(im) { return inScope(im, _imgLibScope, camp ? camp.id : null); });
  }
  function shelfApplies() { var sc = _imgLibPicker ? pickerScope() : _imgLibScope; return sc === 'camp' || sc === 'all'; }   // Shared and Unfiled show shelved pictures too (owner's rule)
  function folderLabel(folder) {
      if (!_imgIndex) buildImgIndex();
      var t = _imgIndex.titles[folder], camp = getActiveCampaign();
      if (t) return t.campId === (camp && camp.id) ? t.title : t.title + ' (' + t.camp + ')';
      if (folder === 'tutorial') return 'Tutorial art';
      if (!folder || folder === 'unknown' || folder === 'null') return 'no map';
      return folder;
  }
  /* ---- the one-time migration (io.js load repair calls it; a Replace import too): today's app-wide categories
     move whole into the campaign that owns or uses most of each category's pictures; Default and any category
     no campaign claims stay shared. Idempotent by the _picsV marker. Returns true when something moved. ---- */
  window.wpMigratePictures = function(data) {
      if (!data || typeof data !== 'object' || data._picsV >= 1) return false;
      data._picsV = 1;
      if (!data.imageCats || typeof data.imageCats !== 'object') return false;
      var shared = fixCats(data.imageCats), idx = buildImgIndexFor(data), moved = 0;
      var campsOf = {};
      Object.keys(shared.by).forEach(function(p) { campsOf[p] = imgCampsFor(idx, p, folderOf(p)); });
      shared.list.slice().forEach(function(name) {
          if (name === 'Default') return;   // the tutorial's shelf stays shared
          var votes = {};
          Object.keys(shared.by).forEach(function(p) { if (tagsIn(shared, p).indexOf(name) < 0) return; var cs = campsOf[p]; if (cs === 'shared') return; cs.forEach(function(c) { votes[c] = (votes[c] || 0) + 1; }); });
          var best = null; Object.keys(votes).forEach(function(c) { if (!best || votes[c] > votes[best]) best = c; });
          if (!best || !data.campaigns[best]) return;
          var dest = catStoreIn(data, best, true);
          if (dest.list.indexOf(name) < 0) dest.list.push(name);
          if (shared.shelf[name]) { dest.shelf[name] = true; delete shared.shelf[name]; }
          Object.keys(shared.by).forEach(function(p) {
              var arr = tagsIn(shared, p); if (arr.indexOf(name) < 0) return;
              var d = Array.isArray(dest.by[p]) ? dest.by[p] : (dest.by[p] ? [dest.by[p]] : []); if (d.indexOf(name) < 0) d.push(name); dest.by[p] = d;
              var rest = arr.filter(function(n) { return n !== name; }); if (rest.length) shared.by[p] = rest; else delete shared.by[p];
          });
          shared.list = shared.list.filter(function(n) { return n !== name; });
          moved++;
      });
      return moved > 0;
  };
  // A campaign is going (delete, discard, cleanup removal): its categories and tags move to the shared store so
  // the pictures, now Unfiled, keep their tags. A name the shared store already has takes the tags.
  window.wpReleaseCampaignTags = function(camp, data) {
      data = data || state.appState;
      if (!camp || !camp.imageCats || typeof camp.imageCats !== 'object') return false;
      var src = fixCats(camp.imageCats), dst = catStoreIn(data, 'shared', true), any = false;
      src.list.forEach(function(name) { if (dst.list.indexOf(name) < 0) dst.list.push(name); if (src.shelf[name]) dst.shelf[name] = true; });
      Object.keys(src.by).forEach(function(p) { var a = tagsIn(src, p); if (!a.length) return; var d = Array.isArray(dst.by[p]) ? dst.by[p] : (dst.by[p] ? [dst.by[p]] : []); a.forEach(function(n) { if (d.indexOf(n) < 0) d.push(n); }); dst.by[p] = d; any = true; });
      delete camp.imageCats;
      return any;
  };
  // A campaign came back from a safety copy taken before categories moved into campaigns: the copy's
  // app-level tags for pictures this campaign owns or uses become its own (the copy is never changed)
  window.wpAdoptTags = function(camp, sourceCats, data) {
      data = data || state.appState;
      if (!camp || !sourceCats || typeof sourceCats !== 'object' || !data.campaigns || !data.campaigns[camp.id]) return false;
      var src = fixCats(JSON.parse(JSON.stringify(sourceCats))), idx = buildImgIndexFor(data), any = false;
      Object.keys(src.by).forEach(function(p) {
          var cs = imgCampsFor(idx, p, folderOf(p)); if (cs === 'shared' || cs.indexOf(camp.id) < 0) return;
          var names = tagsIn(src, p).filter(function(n) { return n !== 'Default'; }); if (!names.length) return;
          var dest = catStoreIn(data, camp.id, true);
          names.forEach(function(n) { if (dest.list.indexOf(n) < 0) { dest.list.push(n); if (src.shelf[n]) dest.shelf[n] = true; } });
          var d = Array.isArray(dest.by[p]) ? dest.by[p] : []; names.forEach(function(n) { if (d.indexOf(n) < 0) d.push(n); }); dest.by[p] = d; any = true;
      });
      return any;
  };
  // Where a picture is used: play-map items, room scenes, portraits, handouts, page and planner pictures, the
  // cast, and campaigns that brought it in — across every campaign, encoded and plain spellings alike
  // [sinkcheck:catfiles-start]
  // Which of a category's pictures may lose their FILE with it (owner's rule, 2026-09-25): only the category's own. A picture another
  // campaign owns (its folder) or uses keeps its file and only loses the tag, so a category brought in by a file someone else made
  // can never take your other campaigns' pictures with it. store: the category's home ('shared' or a campaign id); owners(path) is
  // imgCampsFor: 'shared' for the tutorial art, else the campaigns that own or use the picture ([] = nobody's).
  function catFilesToDelete(paths, store, owners) {
      var go = [], kept = [];
      paths.forEach(function(p) {
          var c = owners(p);
          var mine = c === 'shared' ? store === 'shared' : Array.isArray(c) && c.every(function(id) { return id === store; });
          (mine ? go : kept).push(p);
      });
      return { go: go, kept: kept };
  }
  // [sinkcheck:catfiles-end]
  function imgUsage(src) {
      var n = 0, maps = {}, keys = pathKeys(src);
      var hit = function(v) { return !!v && keys.indexOf(v) >= 0; };
      Object.values(state.appState.campaigns || {}).forEach(function(camp) {
          Object.values(camp.items || {}).forEach(function(it) {
              var name = (it.meta && it.meta.title) || it.id;
              (it.whiteboard || []).forEach(function(w) { if (w && hit(w.src)) { n++; maps[name] = 1; } });
              (it.rooms || []).forEach(function(r) { if (hit(r.image)) { n++; maps[name] = 1; } (r.characters || []).forEach(function(ch) { if (hit(ch.portrait)) { n++; maps[name] = 1; } }); });
              (it.blocks || []).forEach(function(b) { if (b && hit(b.src)) { n++; maps[name] = 1; } });
          });
          Object.values(camp.handouts || {}).forEach(function(h) { if (hit(h.src)) { n++; maps['handouts'] = 1; } });
          Object.values(camp.cast || {}).forEach(function(c) { if (hit(c.src)) { n++; maps['the cast of ' + (camp.name || 'a campaign')] = 1; } });
          if ((Array.isArray(camp.pictures) ? camp.pictures : []).some(hit)) { n++; maps['brought into ' + (camp.name || 'a campaign')] = 1; }
      });
      return { count: n, maps: Object.keys(maps) };
  }
  function scopeChip(val, label, n, title) { return '<button class="journal-from' + (_imgLibScope === val ? ' active' : '') + '" data-scope="' + val + '" title="' + esc(title) + '">' + label + ' <span class="journal-count">' + n + '</span></button>'; }
  function renderImgCats() {
      var row = document.getElementById('imgLibCats'); if (!row) return;
      var camp = getActiveCampaign(), campId = camp ? camp.id : null;
      if (_imgLibCatCamp !== campId) { _imgLibCat = ''; _imgLibCatCamp = campId; }
      var list = scopedCache(), counts = {}, none = 0, shelf = shelfApplies();
      list.forEach(function(im) { var ns = imgCatsOf(im.path); if (ns.length) ns.forEach(function(n) { counts[n] = (counts[n] || 0) + 1; }); else none++; });
      var cats = catList();
      if (_imgLibCat && _imgLibCat !== '__none' && _imgLibCat !== '__bymap' && !cats.some(function(c) { return c.name === _imgLibCat; })) _imgLibCat = '';
      var allN = list.filter(function(im) { return !shelf || !imgCatsOf(im.path).some(isShelved); }).length;
      var html = '';
      if (!_imgLibPicker) {   // the scope row: which pictures
          var all = (_imgLibCache || []).filter(notJournal), nCamp = 0, nShared = 0, nUnf = 0;
          all.forEach(function(im) { if (inScope(im, 'camp', campId)) nCamp++; if (inScope(im, 'shared')) nShared++; if (inScope(im, 'unfiled')) nUnf++; });
          html += '<span class="journal-chip-label">Pictures</span>'
              + scopeChip('camp', camp ? esc(camp.name) : 'This campaign', nCamp, 'Pictures uploaded from this campaign\'s maps, planners and pages, used by them, or brought in')
              + scopeChip('shared', 'Shared', nShared, 'Pictures every campaign can use: the tutorial art')
              + scopeChip('unfiled', 'Unfiled', nUnf, 'Pictures whose map, planner or page is gone and that no campaign uses')
              + scopeChip('all', 'All campaigns', all.length, 'Every picture in your saves folder')
              + '<button class="journal-from img-lib-import" data-act="picker" title="Pick pictures from another campaign, Shared or Unfiled and bring them into this one">Import from another campaign\u2026</button>'
              + '<span class="img-scope-break"></span>';
      }
      html += '<span class="journal-chip-label">Show</span>'
          + '<button class="journal-from' + (!_imgLibCat ? ' active' : '') + '" data-cat="">All <span class="journal-count">' + allN + '</span></button>'
          + '<button class="journal-from' + (_imgLibCat === '__bymap' ? ' active' : '') + '" data-cat="__bymap" title="Grouped under the map, planner or page each picture was uploaded from">By map</button>'
          + cats.map(function(c) { return '<button class="journal-from' + (_imgLibCat === c.name ? ' active' : '') + (c.store === 'shared' ? ' img-cat-shared' : '') + '" data-cat="' + esc(c.name) + '" title="' + (c.store === 'shared' ? 'A shared category: every campaign sees it' : 'This campaign\'s category') + '">' + esc(c.name) + (c.store === 'shared' ? '<span class="img-cat-mark" aria-hidden="true">\u25C7</span>' : '') + ' <span class="journal-count">' + (counts[c.name] || 0) + '</span></button>'; }).join('')
          + '<button class="journal-from' + (_imgLibCat === '__none' ? ' active' : '') + '" data-cat="__none">No category <span class="journal-count">' + none + '</span></button>'
          + (_imgLibPicker ? '' : '<button class="journal-from img-cat-new" data-act="new" title="Make a category for this campaign">+ New</button><button class="journal-from img-cat-new" data-act="new-shared" title="Make a category every campaign sees">+ New shared</button>');
      if (!_imgLibPicker && _imgLibCat && _imgLibCat !== '__none' && _imgLibCat !== '__bymap') {
          var home = catHome(_imgLibCat), c = home ? catStore(home) : EMPTY_CATS;
          html += '<div class="img-cat-tools"><button class="journal-from img-cat-tool" data-act="shelf" title="Own shelf: its pictures show under this chip only, not under All">' + (c.shelf[_imgLibCat] ? 'Own shelf: on' : 'Own shelf: off') + '</button>'
              + '<button class="journal-from img-cat-tool" data-act="share" title="' + (home === 'shared' ? 'Make it this campaign\'s own: only this campaign sees it' : 'Make it shared: every campaign sees it') + '">' + (home === 'shared' ? 'Shared \u2192 this campaign\'s' : 'Make shared') + '</button>'
              + '<button class="journal-from img-cat-tool" data-act="rename" title="Rename this category">Rename</button>'
              + '<button class="journal-from img-cat-tool danger" data-act="delete" title="Delete this category (the pictures stay)">Delete category</button></div>';
      }
      row.innerHTML = html;
  }
  // act: 'add' (tag with another), 'move' (drop the current view's category, tag with the chosen one), 'remove'
  function imgCatApply(path, act, name) {
      var cur = imgCatsOf(path), from = (_imgLibCat && _imgLibCat !== '__none' && _imgLibCat !== '__bymap') ? _imgLibCat : '';
      if (act === 'remove') cur = cur.filter(function(n) { return n !== name; });
      else {
          if (act === 'move' && from) cur = cur.filter(function(n) { return n !== from; });
          if (name && cur.indexOf(name) < 0) cur.push(name);
      }
      imgCatWrite(path, cur);
  }
  function imgCatChange(path, act, name) {   // one path, or the picked set as an array
      var many = Array.isArray(path);
      (many ? path : [path]).forEach(function(p) { imgCatApply(p, act, name); });
      imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
      if (many) { toast(path.length + ' picture' + (path.length === 1 ? '' : 's') + (act === 'remove' ? ' taken out of ' : act === 'move' ? ' moved to ' : ' added to ') + '"' + name + '".'); return; }
      var pv = document.getElementById('imgLibPreview');
      if (pv && pv.style.display !== 'none' && pv.dataset.src === path) openImgPreview(path);
  }
  function imgCatAssign(path, name) { imgCatChange(path, 'add', name); }   // kept for older callers
  // A new category in this campaign's store (or the shared one); a name either store already has is refused
  function imgCatNew(cb, shared) {
      showPrompt(shared ? 'New shared category (every campaign sees it):' : 'New category:', '', function(name) {
          name = String(name || '').trim().slice(0, 40); if (!name) return;
          var home = catHome(name);
          if (home) { toast('"' + name + '" already exists' + (home === 'shared' ? ' as a shared category.' : ' in this campaign.')); return; }
          var c = catStore(shared ? 'shared' : (viewCampId() || 'shared'), true);
          c.list.push(name);
          imgCatsSave(); if (cb) cb(name); else renderImgLib(document.getElementById('imgLibSearch').value);
      });
  }
  // The category menu for one picture. Inside a category view it offers Move (out of this one, into
  // another) and Remove; everywhere it offers Add (a picture can be in several categories).
  function openImgCatMenu(src, x, y) {   // src: one path, or an array (the picked set)
      var menu = document.getElementById('imgCatMenu'); if (!menu) return;
      var many = Array.isArray(src), mine = many ? [] : imgCatsOf(src);
      var from = (_imgLibCat && _imgLibCat !== '__none' && _imgLibCat !== '__bymap') ? _imgLibCat : '';
      var others = catList().filter(function(c) { return mine.indexOf(c.name) < 0; });
      var opt = function(act) { return others.map(function(c) { return '<button class="wb-tool-btn party-menu-item" data-act="' + act + '" data-cat="' + esc(c.name) + '">' + esc(c.name) + (c.store === 'shared' ? ' \u25C7' : '') + '</button>'; }).join(''); };
      var html = '<div class="party-menu-head">' + (many ? 'Add ' + src.length + ' pictures to' : 'Add to category') + '</div>'
          + opt('add')
          + '<button class="wb-tool-btn party-menu-item" data-act="new-add">+ New category\u2026</button>';
      if (from && (many || mine.indexOf(from) >= 0)) {
          html += '<div class="party-menu-head">Move from ' + esc(from) + ' to</div>'
              + opt('move')
              + '<button class="wb-tool-btn party-menu-item" data-act="new-move">+ New category\u2026</button>'
              + '<button class="wb-tool-btn party-menu-item danger" data-act="remove" data-cat="' + esc(from) + '">Remove from ' + esc(from) + '</button>';
      }   // in All, By map and No category only Add is offered
      menu.dataset.src = many ? '' : src; menu.dataset.multi = many ? '1' : '';
      menu.innerHTML = html;
      menu.style.display = 'flex'; menu.classList.add('show');
      window.wpClampMenu(menu, x, y);
  }
  function hideImgCatMenu() { var m = document.getElementById('imgCatMenu'); if (m) m.classList.remove('show'), m.style.display = 'none'; }
  /* ---- the picker: Import from another campaign… ---- */
  function renderImgSource() {
      var wrap = document.getElementById('imgLibSourceWrap'), sel = document.getElementById('imgLibSource'); if (!wrap || !sel) return;
      if (!_imgLibPicker) { wrap.style.display = 'none'; return; }
      var s = state.appState, me = getActiveCampaign(), all = (_imgLibCache || []).filter(notJournal), opts = [];
      Object.keys((s && s.campaigns) || {}).forEach(function(cid) {
          if (me && cid === me.id) return;
          var n = all.filter(function(im) { return inScope(im, 'camp', cid); }).length;
          opts.push('<option value="' + esc(cid) + '"' + (_imgLibPicker === cid ? ' selected' : '') + '>' + esc(s.campaigns[cid].name || cid) + ' (' + n + ')</option>');
      });
      opts.push('<option value="shared"' + (_imgLibPicker === 'shared' ? ' selected' : '') + '>Shared (' + all.filter(function(im) { return inScope(im, 'shared'); }).length + ')</option>');
      opts.push('<option value="unfiled"' + (_imgLibPicker === 'unfiled' ? ' selected' : '') + '>Unfiled (' + all.filter(function(im) { return inScope(im, 'unfiled'); }).length + ')</option>');
      sel.innerHTML = opts.join('');
      wrap.style.display = 'inline-flex';
  }
  function enterPicker() {
      if (_imgLibPicker) return;
      var s = state.appState, me = getActiveCampaign();
      if (!me) return;
      var first = Object.keys((s && s.campaigns) || {}).filter(function(cid) { return cid !== me.id; })[0] || 'shared';
      var grid = document.getElementById('imgLibGrid'), search = document.getElementById('imgLibSearch');
      _imgLibStash = { scope: _imgLibScope, cat: _imgLibCat, search: search ? search.value : '', sel: _imgLibSel, last: _imgLibLastPick, scroll: grid ? grid.scrollTop : 0 };
      _imgLibSel = {}; _imgLibLastPick = null; _imgLibCat = '';
      if (search) search.value = '';
      closeImgPreview();
      _imgLibPicker = first;
      renderImgLib('');
  }
  function exitPicker(keepSel) {
      if (!_imgLibPicker) return;
      var st = _imgLibStash || {}; _imgLibPicker = null; _imgLibStash = null;
      _imgLibScope = st.scope || 'camp'; _imgLibCat = st.cat || ''; _imgLibSel = keepSel ? {} : (st.sel || {}); _imgLibLastPick = st.last || null;
      var search = document.getElementById('imgLibSearch'); if (search) search.value = st.search || '';
      closeImgPreview();
      renderImgLib(search ? search.value : '');
      var grid = document.getElementById('imgLibGrid'); if (grid) grid.scrollTop = st.scroll || 0;
  }
  // The picked pictures become this campaign's by reference (camp.pictures): no file is copied
  function bringPictures(paths) {
      var camp = getActiveCampaign(); if (!camp || !paths.length) return;
      if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return; }
      camp.pictures = Array.isArray(camp.pictures) ? camp.pictures : [];
      var n = 0; paths.forEach(function(p) { if (camp.pictures.indexOf(p) < 0) { camp.pictures.push(p); n++; } });
      _imgIndex = null;
      exitPicker(true);
      imgCatsSave();
      toast(n + ' picture' + (n === 1 ? '' : 's') + ' brought into ' + (camp.name || 'this campaign') + '. Tag ' + (n === 1 ? 'it' : 'them') + ' here as you like.');
  }
  (function wireImgCats() {
      var row = document.getElementById('imgLibCats'), grid = document.getElementById('imgLibGrid'), menu = document.getElementById('imgCatMenu');
      if (!row || !grid || !menu) return;
      var srcSel = document.getElementById('imgLibSource');
      if (srcSel) srcSel.addEventListener('change', function() { if (!_imgLibPicker) return; _imgLibPicker = this.value; _imgLibSel = {}; _imgLibLastPick = null; _imgLibCat = ''; closeImgPreview(); renderImgLib(document.getElementById('imgLibSearch').value); });
      row.addEventListener('click', function(e) {
          var b = e.target.closest && e.target.closest('button'); if (!b) return;
          var act = b.dataset.act;
          if (act === 'picker') { if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return; } enterPicker(); return; }
          if (b.dataset.scope !== undefined) { _imgLibScope = b.dataset.scope; _imgLibSel = {}; _imgLibLastPick = null; renderImgLib(document.getElementById('imgLibSearch').value); return; }
          if (act === 'new' || act === 'new-shared') { imgCatNew(function(name) { _imgLibCat = name; renderImgLib(document.getElementById('imgLibSearch').value); }, act === 'new-shared'); return; }
          if (act === 'shelf') {
              var home = catHome(_imgLibCat); if (!home) return;
              var cs = catStore(home, true); if (cs.shelf[_imgLibCat]) delete cs.shelf[_imgLibCat]; else cs.shelf[_imgLibCat] = true;
              imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
              toast(cs.shelf[_imgLibCat] ? '"' + _imgLibCat + '" is on its own shelf: its pictures no longer appear under All.' : '"' + _imgLibCat + '" shows under All again.');
              return;
          }
          if (act === 'share') {   // move a category with its tags between the campaign's store and the shared one
              var name = _imgLibCat, from = catHome(name), me = viewCampId(); if (!from || !me) return;
              var to = from === 'shared' ? me : 'shared';
              if (catStore(to).list.indexOf(name) >= 0) { toast('"' + name + '" already exists ' + (to === 'shared' ? 'as a shared category.' : 'in this campaign.')); return; }
              var a = catStore(from, true), z = catStore(to, true);
              z.list.push(name); if (a.shelf[name]) { z.shelf[name] = true; delete a.shelf[name]; }
              Object.keys(a.by).forEach(function(p) { var arr = tagsIn(a, p); if (arr.indexOf(name) < 0) return; var d = Array.isArray(z.by[p]) ? z.by[p] : []; if (d.indexOf(name) < 0) d.push(name); z.by[p] = d; var rest = arr.filter(function(n) { return n !== name; }); if (rest.length) a.by[p] = rest; else delete a.by[p]; });
              a.list = a.list.filter(function(n) { return n !== name; });
              imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
              toast(to === 'shared' ? '"' + name + '" is shared now: every campaign sees it.' : '"' + name + '" is this campaign\'s own now.');
              return;
          }
          if (act === 'rename') {
              var old = _imgLibCat, homeR = catHome(old); if (!homeR) return;
              var c = catStore(homeR, true);
              showPrompt('Rename category:', old, function(name) {
                  name = String(name || '').trim().slice(0, 40); if (!name || name === old) return;
                  if (catHome(name)) { toast('"' + name + '" already exists.'); return; }
                  var i = c.list.indexOf(old); if (i >= 0) c.list[i] = name;
                  Object.keys(c.by).forEach(function(p) { var arr = Array.isArray(c.by[p]) ? c.by[p] : [c.by[p]]; c.by[p] = arr.map(function(n) { return n === old ? name : n; }); });
                  if (c.shelf[old]) { delete c.shelf[old]; c.shelf[name] = true; }
                  _imgLibCat = name; imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
              });
              return;
          }
          if (act === 'delete') {
              var del = _imgLibCat, homeD = catHome(del); if (!homeD) return;
              var cc = catStore(homeD, true), n = Object.keys(cc.by).filter(function(p) { return tagsIn(cc, p).indexOf(del) >= 0; }).length;
              showConfirm('Delete the category "' + del + '"? ' + (n ? n + ' picture' + (n === 1 ? ' loses' : 's lose') + ' that tag — nothing is deleted.' : 'It is empty.'), function(yes) {
                  if (!yes) return;
                  var members = Object.keys(cc.by).filter(function(p) { return tagsIn(cc, p).indexOf(del) >= 0 && p.indexOf('/saves/images/') === 0; });
                  cc.list = cc.list.filter(function(x) { return x !== del; }); delete cc.shelf[del];
                  Object.keys(cc.by).forEach(function(p) { var rest = tagsIn(cc, p); if (rest.length) cc.by[p] = rest; else delete cc.by[p]; });
                  _imgLibCat = ''; imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
                  // Offer to remove the pictures' files as well (the category itself is only a tag) — the category's OWN pictures only:
                  // one another campaign owns or uses keeps its file and just loses the tag (catFilesToDelete)
                  if (members.length) {
                      var idxD = buildImgIndex(), split = catFilesToDelete(members, homeD, function(p) { return imgCampsFor(idxD, p, folderOf(p)); });
                      var files = split.go, keptN = split.kept.length;
                      var keptNote = keptN ? keptN + ' of its pictures ' + (keptN === 1 ? 'keeps its file — it belongs to another campaign or to Shared — and only loses' : 'keep their files — they belong to another campaign or to Shared — and only lose') + ' the tag.' : '';
                      if (!files.length) { toast(keptNote); return; }
                      var used = files.filter(function(p) { return imgUsage(p).count > 0; }).length;
                      showConfirm('Also delete the ' + files.length + ' picture file' + (files.length === 1 ? ' that was' : 's that were') + ' in "' + del + '" from your saves folder? This cannot be undone.' + (used ? '\n\n' + used + ' of them ' + (used === 1 ? 'is' : 'are') + ' still used somewhere (a map, a handout, a page, the cast, or brought into a campaign) and would show as broken there.' : '') + (keptNote ? '\n\n' + keptNote : ''), function(yesFiles) {
                          if (!yesFiles) return;
                          var i = 0, gone = [], oldCore = false;
                          function next() {
                              if (i >= files.length) {
                                  var goneSet = {}; gone.forEach(function(p) { goneSet[p] = 1; });
                                  _imgLibCache = (_imgLibCache || []).filter(function(im) { return !goneSet[im.path]; });
                                  gone.forEach(function(p) { catStores().forEach(function(s) { if (s.c.by[p]) delete s.c.by[p]; }); }); imgCatsSave(); renderImgLib(document.getElementById('imgLibSearch').value);
                                  toast(oldCore ? 'Deleting pictures needs the 1.4.6 core \u2014 run the installer from Settings \u2192 Updates & about.' : 'Deleted ' + gone.length + ' picture file' + (gone.length === 1 ? '' : 's') + '.' + (keptN ? ' ' + keptNote : ''));
                                  return;
                              }
                              var batch = files.slice(i, i + 4); i += 4;
                              Promise.all(batch.map(function(src) { return fetch('/api/delete-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: src }) }).then(function(r) { if (r.status === 404 && !r.headers.get('content-type')) oldCore = true; else if (r.ok) gone.push(src); }).catch(function() {}); })).then(next);
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
          var cell = e.target.closest && e.target.closest('.img-lib-cell'); if (!cell || cell.classList.contains('cast-cell') || _imgLibPicker) return;
          e.preventDefault(); e.stopPropagation();
          openImgCatMenu(cell.dataset.src, e.clientX, e.clientY);
      });
      menu.addEventListener('click', function(e) {
          var b = e.target.closest && e.target.closest('button'); if (!b) return;
          e.stopPropagation();
          var src = menu.dataset.multi ? Object.keys(_imgLibSel) : menu.dataset.src, act = b.dataset.act, cat = b.dataset.cat || ''; hideImgCatMenu();
          if (menu.dataset.multi && !src.length) return;
          if (act === 'new-add' || act === 'new-move') { imgCatNew(function(name) { imgCatChange(src, act === 'new-move' ? 'move' : 'add', name); }); return; }
          if (act === 'add' || act === 'move' || act === 'remove') imgCatChange(src, act, cat);
      });
      document.addEventListener('pointerdown', function(e) { if (menu.style.display !== 'none' && !e.target.closest('#imgCatMenu')) hideImgCatMenu(); }, true);
      var copiesBox = document.getElementById('imgLibCopies');
      if (copiesBox) {
          copiesBox.addEventListener('input', function() { if (copiesBox.value >= 1 && copiesBox.value <= 50) setCastBatch(copiesBox.value); });
          copiesBox.addEventListener('change', function() { copiesBox.value = setCastBatch(copiesBox.value); });
      }
      var selBar = document.getElementById('imgLibSelBar');
      if (selBar) selBar.addEventListener('click', function(e) {
          var b = e.target.closest && e.target.closest('button'); if (!b) return;
          var picked = Object.keys(_imgLibSel);
          if (b.dataset.act === 'clear') { _imgLibSel = {}; _castSel = {}; _castLastPick = null; renderImgLib(document.getElementById('imgLibSearch').value); }
          else if (b.dataset.act === 'back') exitPicker(false);
          else if (b.dataset.act === 'bring') bringPictures(picked);
          else if (b.dataset.act === 'add-map') placeImagesBlock(picked);
          else if (b.dataset.act === 'cat') { var r = b.getBoundingClientRect(); openImgCatMenu(picked, r.left, r.top - 4); }
          else if (b.dataset.act === 'add-cast') placeCastPicked();
      });
      document.addEventListener('keydown', function(e) {   // Ctrl+A in the library picks everything in view
          var modal = document.getElementById('imgLibModal'), pv = document.getElementById('imgLibPreview');
          if (!modal || modal.style.display === 'none' || (pv && pv.style.display !== 'none') || (_imgLibPick && !_imgLibPicker)) return;
          if (!(e.ctrlKey || e.metaKey) || (e.key !== 'a' && e.key !== 'A') || /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
          e.preventDefault(); e.stopPropagation();
          _imgLibOrder.forEach(function(p) { _imgLibSel[p] = 1; });
          renderImgLib(document.getElementById('imgLibSearch').value);
      }, true);
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape') hideImgCatMenu(); });
  })();

  function renderImgLib(filter) {
      var grid = document.getElementById('imgLibGrid');
      if (!grid || !_imgLibCache) return;
      if (!_imgIndex) buildImgIndex();
      // players' journals live under images/journal/ — not campaign art, keep them out of the library
      _imgLibCache = _imgLibCache.filter(notJournal);
      // The Campaign Cast shows inside a shelf category (the tutorial's "Default") and nowhere else — and only under THIS campaign's own scope, never the Shared/Unfiled/All-campaigns views (the cast is a per-campaign store with no picture category/scope tags, so a scope chip can't filter it).
      grid.dataset.cast = (!_imgLibPick && !_imgLibPicker && state.viewMode === 'visual' && _imgLibScope === 'camp' && !!(_imgLibCat && isShelved(_imgLibCat))) ? '1' : '';
      if (!grid.dataset.cast) { _castSel = {}; _castLastPick = null; }   // cast roster hidden: drop any cast picks so a stale count can't linger
      var q = (filter || '').toLowerCase();
      renderImgCats(); renderImgSource();
      var shelf = shelfApplies(), byMap = _imgLibCat === '__bymap';
      var byFolder = {};
      scopedCache().forEach(function(im) {
          var label = folderLabel(im.folder), cat = imgCatOf(im.path);
          if (_imgLibCat === '__none' ? cat : (_imgLibCat && !byMap && !imgCatHas(im.path, _imgLibCat))) return;
          if ((!_imgLibCat || byMap) && shelf && imgCatsOf(im.path).some(isShelved)) return;   // shelved pictures show under their own category only
          if (q && im.name.toLowerCase().indexOf(q) === -1 && label.toLowerCase().indexOf(q) === -1 && (cat || '').toLowerCase().indexOf(q) === -1) return;
          var key = byMap ? label : '';
          (byFolder[key] = byFolder[key] || []).push(im);
      });
      var html = ''; _imgLibOrder = [];
      var pickable = !_imgLibPick || _imgLibPicker;
      Object.keys(byFolder).sort().forEach(function(label) {
          if (label) html += '<div style="color:var(--gold); font-size:11px; text-transform:uppercase; letter-spacing:.06em; margin:12px 0 6px;">' + esc(label) + ' <span style="color:var(--dim);">(' + byFolder[label].length + ')</span></div>';
          html += '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(96px, 1fr)); gap:8px;">';
          byFolder[label].forEach(function(im) {
              var catTag = (!_imgLibCat || _imgLibCat === '__bymap') && imgCatOf(im.path) ? '<span class="img-lib-tag">' + esc(imgCatOf(im.path)) + '</span>' : '';
              _imgLibOrder.push(im.path);
              html += '<div class="img-lib-cell' + (_imgLibSel[im.path] ? ' picked' : '') + '" data-src="' + esc(im.path) + '" title="' + esc(im.name) + (imgCatOf(im.path) ? ' \u00b7 ' + esc(imgCatOf(im.path)) : '') + (_imgLibPicker ? ' \u2014 Ctrl-click to pick it to bring in' : ' \u2014 right-click to add it to a category; Ctrl-click to pick several') + '">' +
                  '<img src="' + encodeURI(im.path) + '" loading="lazy">' + catTag +
                  '<div class="img-lib-name">' + esc(im.name) + '</div>' + (pickable && !_imgLibPicker ? '<button class="tool ghost img-cell-batch" data-src="' + esc(im.path) + '" title="Drop ' + castBatch() + ' cop' + (castBatch() === 1 ? 'y' : 'ies') + ' at the centre of your view">\u00d7' + castBatch() + '</button>' : '') + '</div>';
          });
          html += '</div>';
      });
      var empty = _imgLibPicker ? 'Nothing here to bring in.'
          : _imgLibCat && _imgLibCat !== '__bymap' ? 'Nothing in this category yet \u2014 right-click a picture to add it.'
          : _imgLibScope === 'camp' ? 'Nothing in this campaign yet \u2014 other campaigns\u2019 pictures are under All campaigns, or Import from another campaign\u2026'
          : _imgLibScope === 'shared' ? 'No shared pictures yet \u2014 the Tutorial\u2019s art lands here once it has run.'
          : _imgLibScope === 'unfiled' ? 'Nothing unfiled: every picture belongs to a campaign.'
          : 'No images match.';
      grid.innerHTML = (grid.dataset.cast ? castLibraryHtml(filter) : '') + html || '<div style="color:var(--dim); padding:20px; text-align:center;">' + empty + '</div>';
      renderImgSelBar();
  }
  // Multi-pick: Ctrl-click toggles a picture, Shift-click picks the run from the last one, Ctrl+A picks the view
  var _imgLibSel = {}, _imgLibOrder = [], _imgLibLastPick = null;
  // Campaign Cast picks live in their own bucket (cast = tokens, not images). Selecting one type clears the other, so the single selection bar always shows a single type.
  var _castSel = {}, _castOrder = [], _castLastPick = null;
  function renderImgSelBar() {
      var bar = document.getElementById('imgLibSelBar'); if (!bar) return;
      var n = Object.keys(_imgLibSel).length;
      if (_imgLibPicker === 'shared') {   // shared pictures are already every campaign's: nothing to bring
          bar.innerHTML = '<span style="color:var(--dim);">Shared pictures are available in every campaign already — find them under the Shared chip.</span><button class="tool ghost" data-act="back">← Back</button>';
          bar.style.display = 'flex'; return;
      }
      if (_imgLibPicker) {   // bringing pictures in from another campaign or Unfiled
          var meC = getActiveCampaign();
          bar.innerHTML = '<span style="color:var(--gold);">' + (n ? n + ' picked' : 'Pick pictures to bring in') + '</span>'
              + (n ? '<button class="tool" data-act="bring">Bring ' + n + ' into ' + esc((meC && meC.name) || 'this campaign') + '</button><button class="tool ghost" data-act="clear">Clear</button>' : '')
              + '<button class="tool ghost" data-act="back">\u2190 Back</button>'
              + '<span style="color:var(--dim); font-size:11px; margin-left:auto;">Ctrl-click picks, Shift-click a run, Ctrl+A everything shown \u2014 nothing is copied, this campaign remembers them</span>';
          bar.style.display = 'flex'; return;
      }
      var nCast = Object.keys(_castSel).length;
      if (nCast && !_imgLibPick) {   // cast picks own the bar (they clear the picture selection, so only one type is ever non-empty)
          var canC = state.viewMode === 'visual' && getActiveMap() && getActiveMap().type === 'map';
          bar.innerHTML = '<span style="color:var(--gold);">★ ' + nCast + ' cast picked</span>'
              + '<button class="tool" data-act="add-cast"' + (canC ? '' : ' disabled title="Open a play map first"') + '>Add ' + nCast + ' to map</button>'
              + '<button class="tool ghost" data-act="clear">Clear</button>'
              + '<span style="color:var(--dim); font-size:11px; margin-left:auto;">Ctrl-click picks, Shift-click a run</span>';
          bar.style.display = 'flex'; return;
      }
      if (!n || _imgLibPick) { bar.style.display = 'none'; bar.innerHTML = ''; return; }
      var canPlace = state.viewMode === 'visual' && getActiveMap() && getActiveMap().type === 'map';
      bar.innerHTML = '<span style="color:var(--gold);">' + n + ' picked</span>'
          + '<button class="tool" data-act="add-map" title="Lay them out in a block at the centre of your view"' + (canPlace ? '' : ' disabled title="Open a play map first"') + '>Add ' + n + ' to map</button>'
          + '<button class="tool ghost" data-act="cat">Add to category\u2026</button>'
          + '<button class="tool ghost" data-act="clear">Clear</button>'
          + '<span style="color:var(--dim); font-size:11px; margin-left:auto;">Ctrl-click picks, Shift-click a run, Ctrl+A everything shown</span>';
      bar.style.display = 'flex';
  }
  function castCells() { var g = document.getElementById('imgLibGrid'); return g ? Array.prototype.slice.call(g.querySelectorAll('.cast-cell[data-cid]')) : []; }
  function castSelSync() { castCells().forEach(function(c) { c.classList.toggle('picked', !!_castSel[c.dataset.cid]); }); }
  function castSelToggle(cell, e) {
      var id = cell.dataset.cid; if (!id) return;
      _imgLibSel = {}; _imgLibLastPick = null;   // picking cast clears the picture selection (one type at a time)
      Array.prototype.forEach.call(document.querySelectorAll('#imgLibGrid .img-lib-cell[data-src]'), function(c) { c.classList.remove('picked'); });
      if (e.shiftKey && _castLastPick && _castOrder.indexOf(_castLastPick) >= 0 && _castOrder.indexOf(id) >= 0) {
          var a = _castOrder.indexOf(_castLastPick), b = _castOrder.indexOf(id);
          _castOrder.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(function(q) { _castSel[q] = 1; });
      } else if (_castSel[id]) delete _castSel[id]; else _castSel[id] = 1;
      _castLastPick = id;
      castSelSync();
      renderImgSelBar();
  }
  function placeCastPicked() {
      var ids = Object.keys(_castSel); if (!ids.length || !castOnMap()) return;
      var ctr = viewCentre();
      ids.forEach(function(id, i) { castPlace(id, ctr.x + (i % 4) * 74, ctr.y + Math.floor(i / 4) * 66, 1); });
      _castSel = {}; _castLastPick = null;
      closeImgPreview();
      document.getElementById('imgLibModal').style.display = 'none';
  }
  function imgSelToggle(cell, e) {
      var p = cell.dataset.src; if (!p) return;
      _castSel = {}; _castLastPick = null; castSelSync();   // picking a picture clears the cast selection (one type at a time)
      if (e.shiftKey && _imgLibLastPick && _imgLibOrder.indexOf(_imgLibLastPick) >= 0 && _imgLibOrder.indexOf(p) >= 0) {
          var a = _imgLibOrder.indexOf(_imgLibLastPick), b = _imgLibOrder.indexOf(p);
          _imgLibOrder.slice(Math.min(a, b), Math.max(a, b) + 1).forEach(function(q) { _imgLibSel[q] = 1; });
      } else if (_imgLibSel[p]) delete _imgLibSel[p]; else _imgLibSel[p] = 1;
      _imgLibLastPick = p;
      var grid = document.getElementById('imgLibGrid');
      Array.prototype.forEach.call(grid.querySelectorAll('.img-lib-cell[data-src]'), function(c) { c.classList.toggle('picked', !!_imgLibSel[c.dataset.src]); });
      renderImgSelBar();
  }
  // Lay the picked pictures out in a block around the centre of the view, then select the lot
  function placeImagesBlock(paths) {
      var am = getActiveMap();
      if (!am || am.type !== 'map' || state.viewMode !== 'visual') { toast('Open a play map first.'); return; }
      if (!paths.length) return;
      var s = paths.length <= 2 ? 300 : 200, gap = 12, cols = Math.ceil(Math.sqrt(paths.length)), rows = Math.ceil(paths.length / cols);
      var ctr = viewCentre(), x0 = ctr.x - (cols * s + (cols - 1) * gap) / 2, y0 = ctr.y - (rows * s + (rows - 1) * gap) / 2;
      am.whiteboard = am.whiteboard || [];
      var ids = [];
      paths.forEach(function(src, i) {
          var it = Object.assign({ id: 'wb' + uid(), type: 'image', x: Math.max(10, Math.round(x0 + (i % cols) * (s + gap))), y: Math.max(10, Math.round(y0 + Math.floor(i / cols) * (s + gap))), w: s, h: s, z: 10, color: 'transparent', src: src }, newOpacityProps());
          am.whiteboard.push(it); ids.push(it.id);
      });
      state.selWbId = ids[0]; state.selWbIds = ids;
      _imgLibSel = {}; _imgLibPicker = null; _imgLibStash = null;
      closeImgPreview(); document.getElementById('imgLibModal').style.display = 'none';
      import('./io.js').then(function(m) { m.save(true); render(); m.toast(ids.length + ' pictures placed in a block \u2014 they are selected, drag to move them together.'); });
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

  var _imgLibPick = null;   // a callback waiting for a picture (planner image block, a sheet's portrait or look)
  var _imgLibZ = null;      // the library's own stacking order while it is lifted over the caller (the system modal sits above it)
  function imgLibLift(on) {   // a picker opened from a modal (the sheet builder at z 100000) must land ABOVE it, below the app's confirm (100010)
      var m = document.getElementById('imgLibModal'); if (!m) return;
      if (on) { if (_imgLibZ === null) _imgLibZ = m.style.zIndex; m.style.zIndex = '100005'; }
      else if (_imgLibZ !== null) { m.style.zIndex = _imgLibZ; _imgLibZ = null; }
  }
  window.wpPickImage = async function(cb) {
      _imgLibPick = cb;
      _imgLibSel = {}; _imgLibLastPick = null; _imgLibPicker = null; _imgLibStash = null; _imgIndex = null; _imgLibScope = 'camp';
      var copiesEl = document.getElementById('imgLibCopies'); if (copiesEl) copiesEl.value = castBatch();
      imgLibLift(true);
      document.getElementById('imgLibModal').style.display = 'flex';
      document.getElementById('imgLibGrid').innerHTML = '<div style="color:var(--dim); padding:20px;">Loading…</div>';
      try { _imgLibCache = await (await fetch('/api/list-images')).json(); } catch (e) { _imgLibCache = []; }
      renderImgLib(document.getElementById('imgLibSearch').value);
  };
  var _el_imgLibBtn = document.getElementById('imgLibBtn');

  if (_el_imgLibBtn) _el_imgLibBtn.addEventListener('click', async function() {
      _imgLibSel = {}; _imgLibLastPick = null; _imgLibPicker = null; _imgLibStash = null; _imgIndex = null; _imgLibScope = 'camp';
      var copiesEl = document.getElementById('imgLibCopies'); if (copiesEl) copiesEl.value = castBatch();
      document.getElementById('imgLibModal').style.display = 'flex';
      document.getElementById('imgLibGrid').innerHTML = '<div style="color:var(--dim); padding:20px;">Loading…</div>';
      try {
          _imgLibCache = await (await fetch('/api/list-images')).json();
      } catch(e) { _imgLibCache = []; }
      renderImgLib(document.getElementById('imgLibSearch').value);
  });

  var _el_imgLibClose = document.getElementById('imgLibCloseBtn');

  if (_el_imgLibClose) _el_imgLibClose.addEventListener('click', function() {
      _imgLibPick = null; _imgLibPicker = null; _imgLibStash = null; closeImgPreview();
      document.getElementById('imgLibModal').style.display = 'none'; imgLibLift(false);
  });

  var _el_imgLibSearch = document.getElementById('imgLibSearch');

  if (_el_imgLibSearch) _el_imgLibSearch.addEventListener('input', function() { renderImgLib(this.value); });

  var _el_imgLibGrid = document.getElementById('imgLibGrid');
  // The copies box beside the Campaign Cast heading
  if (_el_imgLibGrid) _el_imgLibGrid.addEventListener('input', function(e) { var b = e.target.closest('.cast-batch'); if (b && b.value >= 1 && b.value <= 50) setCastBatch(b.value); });
  if (_el_imgLibGrid) _el_imgLibGrid.addEventListener('change', function(e) { var b = e.target.closest('.cast-batch'); if (b) b.value = setCastBatch(b.value); });

  if (_el_imgLibGrid) _el_imgLibGrid.addEventListener('click', function(e) {
      var cell = e.target.closest('.img-lib-cell');
      if (!cell) return;
      if ((!_imgLibPick || _imgLibPicker) && !cell.classList.contains('cast-cell') && (e.ctrlKey || e.metaKey || e.shiftKey)) { e.preventDefault(); imgSelToggle(cell, e); return; }
      var batchBtn = e.target.closest('.img-cell-batch');
      if (batchBtn) { e.stopPropagation(); var copies = []; for (var ci = 0; ci < castBatch(); ci++) copies.push(batchBtn.dataset.src); placeImagesBlock(copies); return; }
      if (cell.classList.contains('cast-cell')) {
          if (e.target.closest('.cast-cell-five')) { placeCast(cell.dataset.cid, castBatch()); return; }   // the × button still places straight away
          if (e.ctrlKey || e.metaKey || e.shiftKey) { e.preventDefault(); castSelToggle(cell, e); return; }   // Ctrl/Cmd/Shift-click multi-selects (its own bucket)
          openCastPreview(cell.dataset.cid);   // a bare click just LOOKS now (like a picture); placing is the Add / × button
          return;
      }
      openImgPreview(cell.dataset.src);   // a large look first; Add to map (or Use this picture) is a deliberate press
  });
  /* ---- library preview ---- */
  function imgLibEntry(src) { return (_imgLibCache || []).find(function(i) { return i.path === src; }) || null; }
  function openImgPreview(src) {
      var pv = document.getElementById('imgLibPreview'), grid = document.getElementById('imgLibGrid'); if (!pv || !grid) return;
      var im = imgLibEntry(src);
      var folder = im ? im.folder : '', mapName = folder ? folderLabel(folder) : '';
      document.getElementById('imgLibPreviewImg').src = encodeURI(src);
      document.getElementById('imgLibPreviewName').textContent = im ? im.name : src.split('/').pop();
      var cat = imgCatOf(src);
      document.getElementById('imgLibPreviewMeta').innerHTML = (mapName ? '<div>Map: <b>' + esc(mapName) + '</b></div>' : '') + '<div>Categor' + (imgCatsOf(src).length === 1 ? 'y' : 'ies') + ': <b>' + (cat ? esc(cat) : 'none') + '</b></div>';
      var catBtn = document.getElementById('imgLibPreviewCat'), fromV = (_imgLibCat && _imgLibCat !== '__none' && _imgLibCat !== '__bymap') ? _imgLibCat : '';
      if (catBtn) { catBtn.innerHTML = fromV ? 'Add / move category\u2026' : 'Add to category\u2026'; catBtn.title = fromV ? 'Add another category, move it out of ' + fromV + ', or take it out' : 'Tag this picture with a category (it can be in several)'; }
      var add = document.getElementById('imgLibPreviewAdd'), delBtn = document.getElementById('imgLibPreviewDel');
      if (_imgLibPicker) { add.textContent = _imgLibPick ? 'Bring in & use' : 'Bring into this campaign'; add.title = 'This campaign remembers the picture (nothing is copied)' + (_imgLibPick ? ' and the block gets it' : ''); }
      else { add.textContent = _imgLibPick ? 'Use this picture' : (castBatch() > 1 ? 'Add \u00d7' + castBatch() + ' to map' : 'Add to map'); add.title = _imgLibPick ? 'Put this picture in the block' : 'Place it on the current play map (the number in Copies)'; }
      if (catBtn) catBtn.style.display = _imgLibPicker ? 'none' : '';
      if (delBtn) delBtn.style.display = _imgLibPicker ? 'none' : '';
      pv.dataset.src = src; delete pv.dataset.cid;   // leaving cast mode: the Add button reads src, not a stale cid
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
      delete pv.dataset.cid;
  }
  window.wpCloseImgPreview = closeImgPreview;
  // A cast face opens the same preview panel as a picture, in a cast mode: the portrait (or a colored disc for a
  // circle token), the name and stat line, and an "Add to map" that drops the number in Copies. Placing a cast token
  // is no longer a bare click (that just looks now, like a picture) — it is a deliberate Add / × button press.
  function castOnMap() { var am = getActiveMap(); if (!am || am.type !== 'map' || state.viewMode !== 'visual') { toast('Open a play map first.'); return false; } return true; }
  function placeCast(cid, count) {
      if (!castOnMap()) return;
      var ctr = viewCentre();
      castPlace(cid, ctr.x, ctr.y, count);
      closeImgPreview();   // reset to the grid so reopening the library doesn't show a stale preview
      document.getElementById('imgLibModal').style.display = 'none';
  }
  function openCastPreview(cid) {
      var camp = getActiveCampaign(), c = camp && castOf(camp)[cid]; if (!c) return;
      var pv = document.getElementById('imgLibPreview'), grid = document.getElementById('imgLibGrid'); if (!pv || !grid) return;
      pv.dataset.cid = cid; delete pv.dataset.src;
      document.getElementById('imgLibPreviewImg').src = picRef(c.src) ? encodeURI(picRef(c.src))
          : 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><circle cx="60" cy="60" r="52" fill="' + (cssColor(c.color) || '#4db3d3') + '"/></svg>');
      document.getElementById('imgLibPreviewName').textContent = c.name || 'Character';
      document.getElementById('imgLibPreviewMeta').innerHTML = '<div style="color:var(--gold);">★ Campaign Cast</div>' + (c.charStats ? '<div>' + esc(c.charStats) + '</div>' : '<div style="color:var(--dim);">No stat line</div>');
      var add = document.getElementById('imgLibPreviewAdd');
      add.textContent = castBatch() > 1 ? 'Add ×' + castBatch() + ' to map' : 'Add to map';
      add.title = 'Place ' + (c.name || 'this character') + ' on the current play map (the number in Copies)';
      var catBtn = document.getElementById('imgLibPreviewCat'), delBtn = document.getElementById('imgLibPreviewDel');
      if (catBtn) catBtn.style.display = 'none';
      if (delBtn) delBtn.style.display = 'none';
      var prevB = document.getElementById('imgLibPrevBtn'), nextB = document.getElementById('imgLibNextBtn'), cnt = document.getElementById('imgLibPreviewCount');
      if (prevB) prevB.disabled = true;
      if (nextB) nextB.disabled = true;
      if (cnt) cnt.textContent = '';
      grid.style.display = 'none'; pv.style.display = 'flex';
  }
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
                  catStores().forEach(function(s) { if (s.c.by[src]) delete s.c.by[src]; }); imgCatsSave();
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
          if (pv.dataset.cid) { placeCast(pv.dataset.cid, castBatch()); return; }   // cast mode: Add drops the number in Copies
          var src = pv.dataset.src; if (!src) return;
          if (_imgLibPicker) {   // bring it in; with a block waiting, hand it over as well
              var cbP = _imgLibPick; bringPictures([src]);
              if (cbP) { _imgLibPick = null; closeImgPreview(); document.getElementById('imgLibModal').style.display = 'none'; imgLibLift(false); cbP(src); }
              return;
          }
          if (_imgLibPick) { var cb = _imgLibPick; _imgLibPick = null; closeImgPreview(); document.getElementById('imgLibModal').style.display = 'none'; imgLibLift(false); cb(src); return; }
          var am = getActiveMap();
          if (!am || am.type !== 'map' || state.viewMode !== 'visual') { toast('Open a play map first.'); return; }
          if (castBatch() > 1) { var many = []; for (var mi = 0; mi < castBatch(); mi++) many.push(src); placeImagesBlock(many); return; }
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

  // One upload for every picture that enters the app from the renderer — the play-map drop, the planner's
  // Upload button and the Markdown importer: resolves to the /saves/images/… URL, rejects on failure.
  function uploadBlob(mapId, name, blob) {
      if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) return Promise.reject(new Error('not while at someone else\'s table'));
      return fetch('/api/upload?mapId=' + encodeURIComponent(mapId) + '&filename=' + encodeURIComponent(name || 'picture.png'), { method: 'POST', body: blob })
          .then(function(res) { return res.json(); }).then(function(d) { if (!d || !d.url) throw new Error('upload failed'); return d.url; });
  }
  window.wpUploadBlob = uploadBlob;
  function uploadImageFile(f, cx, cy) {

      if(!f || !f.type.startsWith('image/')) return;

      if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return; }   // would create saves/images/<GM mapId>/

      toast('Uploading image...');

      uploadBlob(getActiveCampaign().activeItemId, f.name, f)

      .then(url => ({ url: url }))

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

      showConfirm('Clear the entire play map? (This map\'s Undo can bring it back.)', function(yes) {

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
      if (isClient) return toks.find(function(i) { return i.ownerId === myId && i.charId; }) || toks.find(function(i) { return i.ownerId === myId; }) || null;   // their character before a pet
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

  var _el_wbFitBtn = document.getElementById('wbFitBtn');
  if(_el_wbFitBtn) _el_wbFitBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      if(window.wpFitView) window.wpFitView(false);   // frame everything (zoom + pan)
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
      // Properties no longer auto-OPENS on a single click — it opens on DOUBLE-click (wpOpenRightPanel below).
      // A plain click that clears the selection, or moves it to a different item while a double-click panel is open, dismisses that panel.
      if (!key) { if (state.rightAuto || !state.rightEverSynced) { sb.classList.add('collapsed'); state.rightAuto = false; } }
      else if (state.rightAuto && key !== state.rightAutoKey) { sb.classList.add('collapsed'); state.rightAuto = false; }
      state.rightEverSynced = true;
      btn.textContent = sb.classList.contains('collapsed') ? '◀' : '▶';
  };
  window.wpOpenRightPanel = function() {   // double-click a play-map item: deliberately open Properties for the current selection
      var sb = document.getElementById('sidebar'), btn = document.getElementById('toggleRightBtn');
      if (!sb || !btn || btn.style.display === 'none') return;
      sb.classList.remove('collapsed');
      state.rightAuto = true; state.rightAutoKey = window.wpSelKey ? window.wpSelKey() : '';
      state.rightManualKey = undefined; state.rightEverSynced = true;
      btn.textContent = '▶';
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
          sheetViewModal: 'sheetViewCloseBtn',
          vttNoticeModal: 'vttNoticeKeepBtn',   // the backdrop means "Keep mine"
          vttPushModal: 'vttPushCancelBtn',
          soundLibModal: 'soundLibClose',
          systemModal: 'sysClose'
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
      var am = document.getElementById('addMenu');
      if (am && am.classList.contains('show') && !e.target.closest('#addMenu') && !e.target.closest('#addMenuBtn')) am.classList.remove('show');
      var sfx = document.getElementById('sceneFxMenu');
      if (sfx && sfx.classList.contains('show') && !e.target.closest('#sceneFxMenu') && !e.target.closest('#sceneFxBtn')) sfx.classList.remove('show');
  });

  // Open Help on a topic, optionally scrolled to a heading (Settings links here)
  window.wpOpenHelp = function(pane, anchorId) {
      var modal = document.getElementById('helpModal'); if (!modal) return;
      modal.style.display = 'flex';
      var _hs = document.getElementById('helpSearch'), _hr = document.getElementById('helpSearchResults');
      if (_hs) _hs.value = ''; if (_hr) { _hr.style.display = 'none'; _hr.innerHTML = ''; }
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

  // Smart search across every Help pane: type to get ranked matches, click one (or Enter) to jump to it.
  (function wireHelpSearch() {
      var input = document.getElementById('helpSearch');
      var results = document.getElementById('helpSearchResults');
      var nav = document.getElementById('helpNav');
      if (!input || !results || !nav) return;
      var index = null, current = [];

      function esc(s) { return String(s).replace(/[&<>"]/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
      function paneLabel(id) {
          var b = nav.querySelector('[data-help="' + id + '"]');
          return b ? b.textContent.replace(/^[^A-Za-z0-9]+/, '').trim() : id;   // drop the leading emoji
      }
      function buildIndex() {
          index = [];
          document.querySelectorAll('#helpModal .help-pane').forEach(function(pane) {
              var id = pane.dataset.pane, label = paneLabel(id), heading = label;
              pane.querySelectorAll('h4, p, li, .help-tip').forEach(function(el) {
                  var text = (el.textContent || '').replace(/\s+/g, ' ').trim();
                  if (!text) return;
                  var isH4 = el.tagName === 'H4';
                  if (isH4) heading = text;
                  index.push({ paneId: id, paneLabel: label, heading: heading, el: el, text: text, lc: text.toLowerCase(), isH4: isH4 });
              });
          });
      }
      // Highlight on the raw text and escape as we build, so matches wrap safely regardless of content.
      function highlight(text, terms) {
          var lc = text.toLowerCase(), ranges = [];
          terms.forEach(function(t) { if (!t) return; var from = 0, i; while ((i = lc.indexOf(t, from)) >= 0) { ranges.push([i, i + t.length]); from = i + t.length; } });
          if (!ranges.length) return esc(text);
          ranges.sort(function(a, b) { return a[0] - b[0]; });
          var merged = [ranges[0].slice()];
          for (var k = 1; k < ranges.length; k++) { var last = merged[merged.length - 1]; if (ranges[k][0] <= last[1]) last[1] = Math.max(last[1], ranges[k][1]); else merged.push(ranges[k].slice()); }
          var out = '', pos = 0;
          merged.forEach(function(r) { out += esc(text.slice(pos, r[0])) + '<mark>' + esc(text.slice(r[0], r[1])) + '</mark>'; pos = r[1]; });
          return out + esc(text.slice(pos));
      }
      function snippet(text, terms) {
          var lc = text.toLowerCase(), pos = -1;
          terms.forEach(function(t) { var i = lc.indexOf(t); if (i >= 0 && (pos < 0 || i < pos)) pos = i; });
          if (pos < 0) pos = 0;
          var start = Math.max(0, pos - 40), end = Math.min(text.length, pos + 120);
          return (start > 0 ? '… ' : '') + highlight(text.slice(start, end), terms) + (end < text.length ? ' …' : '');
      }
      function showActivePane() {
          var active = nav.querySelector('[data-help].active');
          var id = active ? active.dataset.help : 'start';
          document.querySelectorAll('#helpModal .help-pane').forEach(function(p) { p.style.display = (p.dataset.pane === id) ? 'block' : 'none'; });
      }
      function headingMatch(e, terms) { var h = e.heading.toLowerCase(); return terms.every(function(t) { return h.indexOf(t) >= 0; }); }
      function run() {
          var terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
          if (!terms.length) { results.style.display = 'none'; results.innerHTML = ''; showActivePane(); return; }
          if (!index) buildIndex();
          document.querySelectorAll('#helpModal .help-pane').forEach(function(p) { p.style.display = 'none'; });
          current = index.filter(function(e) { return terms.every(function(t) { return e.lc.indexOf(t) >= 0; }); });
          var phrase = terms.join(' ');   // rank exact-phrase hits, then heading hits, then the rest
          function score(e) {
              return (e.heading.toLowerCase().indexOf(phrase) >= 0 ? 0 : 8) + (headingMatch(e, terms) ? 0 : 4) + (e.lc.indexOf(phrase) >= 0 ? 0 : 2);
          }
          current.sort(function(a, b) { var d = score(a) - score(b); return d !== 0 ? d : a.text.length - b.text.length; });
          var max = 40, shown = current.slice(0, max);
          if (!shown.length) {
              results.innerHTML = '<div class="help-noresult">No help topics match “' + esc(input.value.trim()) + '”. Try fewer or different words.</div>';
          } else {
              results.innerHTML = shown.map(function(e, i) {
                  var body = e.isH4
                      ? '<span class="hr-heading">' + highlight(e.text, terms) + '</span>'
                      : '<span class="hr-heading">' + esc(e.heading) + '</span><div class="hr-snip">' + snippet(e.text, terms) + '</div>';
                  return '<div class="help-result" data-i="' + i + '"><span class="hr-pane">' + esc(e.paneLabel) + '</span>' + body + '</div>';
              }).join('') + (current.length > max ? '<div class="help-noresult">Showing the first ' + max + ' of ' + current.length + ' matches — keep typing to narrow.</div>' : '');
          }
          results.style.display = 'block';
          results.scrollTop = 0;
      }
      function openHit(e) {
          input.value = '';
          results.style.display = 'none'; results.innerHTML = '';
          nav.querySelectorAll('[data-help]').forEach(function(b) { b.classList.toggle('active', b.dataset.help === e.paneId); });
          document.querySelectorAll('#helpModal .help-pane').forEach(function(p) { p.style.display = (p.dataset.pane === e.paneId) ? 'block' : 'none'; });
          setTimeout(function() {
              e.el.scrollIntoView({ block: 'center', behavior: 'auto' });
              e.el.classList.remove('help-hit'); void e.el.offsetWidth; e.el.classList.add('help-hit');
              setTimeout(function() { e.el.classList.remove('help-hit'); }, 1800);
          }, 30);
      }
      input.addEventListener('input', run);
      input.addEventListener('keydown', function(ev) {
          if (ev.key === 'Escape' && input.value) { ev.stopPropagation(); input.value = ''; run(); }
          else if (ev.key === 'Enter') { var first = results.querySelector('.help-result'); if (first) first.click(); }
      });
      results.addEventListener('click', function(ev) {
          var row = ev.target.closest('.help-result'); if (!row) return;
          var e = current[parseInt(row.dataset.i, 10)]; if (e) openHit(e);
      });
      // A nav click abandons an active search; opening Help focuses the box.
      nav.addEventListener('click', function() { if (input.value || results.style.display !== 'none') { input.value = ''; results.style.display = 'none'; results.innerHTML = ''; } });
      var helpBtn = document.getElementById('helpBtn');
      if (helpBtn) helpBtn.addEventListener('click', function() { setTimeout(function() { try { input.focus(); input.select(); } catch (e) {} }, 40); });
  })();

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

// The Add flyout gathers the content tools (text, image, library, import) behind one button.
var _el_addMenuBtn = document.getElementById('addMenuBtn');
if (_el_addMenuBtn) _el_addMenuBtn.addEventListener('click', function() {
    document.getElementById('addMenu').classList.toggle('show');
});
var _addMenuEl = document.getElementById('addMenu');
if (_addMenuEl) _addMenuEl.addEventListener('click', function(e) { if (e.target.closest('button')) this.classList.remove('show'); });

// The Scene flyout gathers the GM ambience tools (sound, visual effects) behind one button.
var _el_sceneFxBtn = document.getElementById('sceneFxBtn');
if (_el_sceneFxBtn) _el_sceneFxBtn.addEventListener('click', function() {
    document.getElementById('sceneFxMenu').classList.toggle('show');
});
var _sceneFxEl = document.getElementById('sceneFxMenu');
if (_sceneFxEl) _sceneFxEl.addEventListener('click', function(e) { if (e.target.closest('button')) this.classList.remove('show'); });

// One toolbar popup at a time: pressing any tool button closes every other button's open menu,
// so a flyout only shows while its own button is the one in hand. Capture phase, ahead of each
// button's own toggle, and it never closes the menu the click landed in (a row) or opens on.
var _wbTb = document.getElementById('wbFloatingToolbar');
if (_wbTb) _wbTb.addEventListener('click', function(e) {
    var btn = e.target.closest('.wb-tool-btn');
    if (!btn) return;
    var insideMenu = btn.closest('.shape-menu');
    var wrap = btn.closest('div');
    var own = (wrap && wrap !== _wbTb) ? wrap.querySelector('.shape-menu') : null;
    _wbTb.querySelectorAll('.shape-menu.show').forEach(function(m) { if (m !== own && m !== insideMenu) m.classList.remove('show'); });
}, true);

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

      // Viewer's own grid strength (Settings ▸ Table); local only, never synced
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

    var _el_gridOpacityBtn = document.getElementById('gridOpacityBtn');
    if(_el_gridOpacityBtn) _el_gridOpacityBtn.addEventListener('click', function() { var gm = document.getElementById('gridMenu'); if (gm) gm.classList.remove('show'); if (window.wpOpenSettings) window.wpOpenSettings('table', 'setGridOpacity'); });

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
        if (it.charId) cast[cid].charId = it.charId;   // the cast entry remembers the character (a single drop shares its sheet)
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
        if (c.charId && count === 1) it.charId = c.charId;   // one copy of a character shares its sheet; several are separate mooks
        if (window.wpSeatHex) window.wpSeatHex(it, am);
        am.whiteboard.push(it);
    }
    import('./io.js').then(function(m) { m.save(true); if (window.appRender) window.appRender(); m.toast(count === 1 ? c.name + ' placed.' : count + ' × ' + c.name + ' placed.'); });
}
// Cast cells at the top of the image library (new-token flow)
function castLibraryHtml(filter) {
    var camp = getActiveCampaign(); if (!camp) return '';
    var q = (filter || '').toLowerCase();
    var list = Object.values(castOf(camp)).filter(function(c) { return !q || String(c.name || '').toLowerCase().indexOf(q) >= 0; }).sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    _castOrder = list.map(function(c) { return c.id; });   // the shown order, for Shift-click runs
    if (!list.length) return q ? '' : '<div class="img-lib-folder cast-head" style="color:var(--gold);"><span>&#9733; Campaign Cast</span><span class="cast-head-note">\u2014 empty. Right-click a character token on a play map and choose Save to Campaign Cast; it will show here for quick re-use</span></div>';
    return '<div class="img-lib-folder cast-head" style="color:var(--gold);"><span>&#9733; Campaign Cast</span><span class="cast-head-note">\u2014 click a face for a closer look; Ctrl-click to pick several; its \u00d7 button drops the number in Copies straight onto the map</span></div>'
        + '<div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(96px, 1fr)); gap:8px;">' + list.map(function(c) { return '<div class="img-lib-cell cast-cell' + (_castSel[c.id] ? ' picked' : '') + '" data-cid="' + esc(c.id) + '" title="' + esc(c.name) + (c.charStats ? ' — ' + esc(c.charStats) : '') + ' — click for a closer look; Ctrl-click to pick several">' + (picRef(c.src) ? '<img src="' + encodeURI(picRef(c.src)) + '" loading="lazy" alt="">' : '<div style="height:100%; display:flex; align-items:center; justify-content:center; color:var(--gold); font-size:24px;">&#9733;</div>') + '<div class="img-lib-name">&#9733; ' + esc(c.name) + '</div><button class="tool ghost cast-cell-five" data-cid="' + esc(c.id) + '" title="Drop ' + castBatch() + ' copies">&times;' + castBatch() + '</button></div>'; }).join('') + '</div>'
        + '<div class="img-lib-folder" style="margin-top:8px;">Pictures</div>';
}
function viewCentre() {
    var wrap = document.getElementById('whiteboardWrap'), z = state.zoomLevel || 1;
    if (!wrap) return { x: 15000, y: 15000 };
    return { x: (wrap.scrollLeft + wrap.clientWidth / 2) / z, y: (wrap.scrollTop + wrap.clientHeight / 2) / z };
}
// How many copies the ×N buttons drop (cast flyout and the library's cast cells); remembered per install
function castBatch() { var n = 1; try { n = parseInt(localStorage.getItem('wp_castBatch') || '1', 10); } catch (e) {} return (n >= 1 && n <= 50) ? n : 1; }
function setCastBatch(v) {
    var n = parseInt(v, 10); if (!(n >= 1 && n <= 50)) return castBatch();
    try { localStorage.setItem('wp_castBatch', String(n)); } catch (e) {}
    Array.prototype.forEach.call(document.querySelectorAll('.cm-cast-five, .cast-cell-five, .img-cell-batch'), function(b) { b.textContent = '\u00d7' + n; b.title = 'Drop ' + n + ' cop' + (n === 1 ? 'y' : 'ies') + (b.classList.contains('cm-cast-five') ? ' here' : ' at the centre of your view'); });
    Array.prototype.forEach.call(document.querySelectorAll('.cast-batch, .cm-batch'), function(i) { if (i.value !== String(n)) i.value = n; });
    var addBtn = document.getElementById('imgLibPreviewAdd'), pvEl = document.getElementById('imgLibPreview');
    if (addBtn && pvEl && pvEl.style.display !== 'none' && !_imgLibPick) addBtn.textContent = n > 1 ? 'Add \u00d7' + n + ' to map' : 'Add to map';
    return n;
}
function castMenuHtml(camp) {
    var list = Object.values(castOf(camp)).sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    // One row; the members live in a flyout so the rest of the menu keeps its size whatever the cast holds
    if (!list.length) return '<div class="menu-item cm-session" data-act="cast-manage" title="Right-click a character token and choose Save to Campaign Cast to fill it">&#9733; Campaign Cast <span style="color:var(--dim); font-size:11px;">— empty</span></div>';
    var html = '<div class="menu-item cm-cast-open" title="Click a member to place a copy here, ×5 for five"><span>&#9733; Campaign Cast</span><span style="color:var(--dim); font-size:11px;">' + list.length + '</span><span style="margin-left:auto; color:var(--dim);">&#8250;</span><div class="cm-sub">';
    html += '<div class="cm-sub-head">' + (list.length > 8 ? '<input type="text" class="cm-filter" placeholder="Filter the cast\u2026">' : '<span style="flex:1; color:var(--dim); font-size:11px;">One copy per click</span>')
          + '<label class="cm-batch-wrap" title="How many copies the \u00d7 button drops (1\u201350)">\u00d7<input type="number" class="cm-batch" min="1" max="50" value="' + castBatch() + '"></label></div>';
    list.forEach(function(c) {
        html += '<div class="menu-item cm-session cm-cast-row" data-act="cast" data-cid="' + esc(c.id) + '" data-name="' + esc((c.name || '').toLowerCase()) + '" style="display:flex; align-items:center; gap:8px;">'
              + (picRef(c.src) ? '<img src="' + esc(picRef(c.src)) + '" alt="" style="width:20px; height:20px; object-fit:cover; border-radius:4px;">' : '&#9733;')
              + '<span style="flex:1;">' + esc(c.name) + '</span>'
              + '<button class="tool ghost cm-cast-five" data-cid="' + esc(c.id) + '" title="Drop ' + castBatch() + ' copies here" style="padding:1px 7px; font-size:10.5px;">&times;' + castBatch() + '</button></div>';
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
        return { id: was ? was.id : 'r' + w.id, name: w.charName || w.name || 'Unnamed', tokId: w.id, init: was ? was.init : 0, src: w.src || null, on: on, party: !!w.ownerId, targeted: pair[w.id] || '', charId: w.charId || null };
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
            + (r.charId && window.wpSheets && window.wpSheets.hasInitRoll() ? '<button class="tool ghost combat-roll" title="Roll initiative from the character sheet (a table roll everyone sees)">&#127922;</button>' : '')
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
        else if (e.target.closest('.combat-roll')) { var rr = window.wpSheets && rows[i].charId ? window.wpSheets.rollInit(rows[i].charId) : null; if (rr && rr.error) toast(rr.error); else if (rr && typeof rr.value === 'number') { rows[i].init = rr.value; combatDraft.rows = combatSortByInit(rows); renderCombatModal(); } }
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
    var entries = Object.values(castOf(camp)).sort(function(a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
    list.innerHTML = entries.length ? entries.map(function(c) {
        return '<div class="cast-row" data-cid="' + esc(c.id) + '">' + (picRef(c.src) ? '<img src="' + esc(picRef(c.src)) + '" alt="">' : '<div class="cast-thumb-empty">&#9733;</div>')
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
        var amPin = getActiveMap(), isPinned = !!(camp && amPin && Array.isArray(camp.pinnedMaps) && camp.pinnedMaps.indexOf(amPin.id) >= 0);
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
            var headEl = row.querySelector('.cm-sub-head');
            if (headEl) headEl.addEventListener('click', function(ce) { ce.stopPropagation(); });
            var batch = row.querySelector('.cm-batch');
            if (batch) {
                batch.addEventListener('keydown', function(ce) { ce.stopPropagation(); });
                batch.addEventListener('input', function() { if (batch.value >= 1 && batch.value <= 50) setCastBatch(batch.value); });
                batch.addEventListener('change', function() { batch.value = setCastBatch(batch.value); });
            }
        });
        Array.prototype.forEach.call(cMenu.querySelectorAll('.cm-cast-five'), function(b5) {
            b5.addEventListener('click', function(ce) { ce.stopPropagation(); cMenu.style.display = 'none'; castPlace(b5.dataset.cid, pt.x, pt.y, castBatch()); });
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
                    campP.pinnedMaps = (Array.isArray(campP.pinnedMaps) ? campP.pinnedMaps : []).filter(function(id) { return campP.items[id]; });
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
                if (tokO && tokO.isChar && tokO.ownerId === window.wpNet.myId && !(window.wpNet.paused || window.wpNet.selfPaused) && (stanceOn('elevation') || stanceOn('posture') || (tokO.charId && window.wpSheets && window.wpSheets.canOpen(tokO.charId)))) { e.preventDefault(); showStanceMenu(e, tokO); }
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
                
                // Check if merge drawings is possible (all selected are open pen strokes — never a freeform fill region)
                var allPaths = selectedIds.length > 1 && selectedIds.every(id => {
                    var it = am.whiteboard.find(x=>x.id===id);
                    return it && it.type === 'path' && it.tip !== 'fill';
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
            if (isWb && firstItem && (firstItem.isChar || firstItem.charId) && window.wpSheets) html += '<div class="menu-item cm-sheet">&#128203; ' + (firstItem.charId ? 'Sheet&hellip;' : 'New character sheet&hellip;') + '</div>';
            if (isWb && firstItem && firstItem.isChar && firstItem.ownerId && window.wpNet && window.wpNet.active && window.wpNet.role === 'host' && window.wpNet.isConnected && window.wpNet.isConnected(firstItem.ownerId)) {
                var pausedTok = window.wpNet.isPlayerPaused && window.wpNet.isPlayerPaused(firstItem.ownerId);
                html += '<div class="menu-item cm-player-pause">' + (pausedTok ? '&#9654;&#65039; Resume this player' : '&#9208;&#65039; Pause this player') + '</div>';
            }
            if (isWb && firstItem && firstItem.id && !firstItem.hidden && window.wpFx && window.wpVtt && window.wpVtt.on('fx')) html += '<div class="menu-item cm-pulse">✨ Pulse</div>';
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
                } else if (action.includes('cm-pulse')) {
                    var itPu = am.whiteboard.find(function(x) { return x.id === selectedIds[0]; });
                    if (itPu && window.wpFx) window.wpFx.play({ kind: 'pulse', mapId: am.id, tok: itPu.id });
                    return;
                } else if (action.includes('cm-sheet')) {
                    var itS = am.whiteboard.find(function(x) { return x.id === selectedIds[0]; });
                    if (itS && window.wpSheets) { if (!itS.charId) window.wpSheets.newFromToken(itS); if (itS.charId) window.wpSheets.openSheet(itS.charId); }
                    return;
                } else if (action.includes('cm-player-pause')) {
                    var itPP = am.whiteboard.find(function(x) { return x.id === selectedIds[0]; });
                    if (itPP && itPP.ownerId && window.wpNet.pausePlayer) window.wpNet.pausePlayer(itPP.ownerId, !(window.wpNet.isPlayerPaused && window.wpNet.isPlayerPaused(itPP.ownerId)));
                    return;
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






