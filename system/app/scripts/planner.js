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

import { uid, clone, createNewCampaign, createNewMap, createNewPlanner, getActiveCampaign, getActiveMap, isDocLike } from './models.js';

import { renderDoc, compileFlowchart, DOC_BLOCKS, mergeDocStyle, docStyleCss, cleanDocStyle, sanitizeHtml, proseHtml, stripMermaidLinks, fmtHtml, fmtRich, fieldFmt, colFmtOf, cellFmtOf } from './docrender.js';

import * as TF from './textfmt.js';

import { num, picRef } from './safecore.js';

import { load, updateUndoBtn, pushHistory, undo, redo, save, download, getBase64Image, rebaseHistory, withoutHistory, fieldUndoChord, stepBoundary, stepFold } from './io.js';

import { updateCampaignSelect, updateSidebarNav, navigateToMap } from './sidebar.js';

import { showPrompt, showConfirm, isCampaignNameTaken, getUniqueCampaignTitle, promptForCampaignName, isItemNameTaken, getUniqueItemTitle, promptForItemName } from './dialogs.js';

import { renderDataMap, clearSnaps, drawSnap, doSmartSnapping, attachDrag, attachPanning, isLinkMode, setLinkMode, removeLinkAt } from './datamap.js';

import { renderWhiteboard, attachResizeHandle, attachRotateHandle, addWbItem, uploadImageFile } from './whiteboard.js';

import { getRoomInspectorHtml, attachRoomInspectorEvents, renderInspector,  renderElementList, esc } from './inspector.js';



  // Page layout (HANDBOOK_PLAN 2.3): every image, callout, flare, table, diagram and flowchart block on a
  // page may carry layout { width, float, dx, dy, span }; a Section (H2) carries cols. The editor greys
  // what a section forbids (span => no float; a callout or flare inside a multi-column section neither
  // floats nor drops under half the column) and docrender.cleanDoc applies the same rules on the wire.
  var LAYOUT_TYPES = { image: 1, callout: 1, flare: 1, table: 1, diagram: 1, flowchart: 1 };
  var LAYOUT_NOFLOAT_COLS = { callout: 1, flare: 1 };
  var LAYOUT_WIDTHS = [25, 33, 50, 66, 75, 100];
  function blockLayout(b) {
      var l = b.layout && typeof b.layout === 'object' ? b.layout : {};
      var w = LAYOUT_WIDTHS.indexOf(+l.width) >= 0 ? +l.width : (b.type === 'image' && LAYOUT_WIDTHS.indexOf(+b.width) >= 0 ? +b.width : 100);   // a picture placed before the layout row keeps its planner width
      return { width: w, float: l.float === 'left' || l.float === 'right' ? l.float : 'none', dx: Math.max(-200, Math.min(200, Math.round(+l.dx || 0))), dy: Math.max(-200, Math.min(200, Math.round(+l.dy || 0))), span: l.span === true };
  }
  function layoutRowHtml(idx, b, secCols) {
      var l = blockLayout(b), inCols = secCols > 1, narrow = inCols && LAYOUT_NOFLOAT_COLS[b.type], noFloat = l.span || narrow;
      var widths = narrow ? [50, 66, 75, 100] : LAYOUT_WIDTHS;
      var h = '<div class="blk-layout fc-opts"><span class="lay-title">Layout</span>';
      h += '<label title="Width, as a share of the column the block sits in">Width <select class="b-lay-w" data-idx="' + idx + '">' + widths.map(function(w) { return '<option value="' + w + '"' + (Math.max(l.width, widths[0]) === w ? ' selected' : '') + '>' + w + '%</option>'; }).join('') + '</select></label>';
      h += '<label class="' + (noFloat ? 'off' : '') + '" title="' + (l.span ? 'A block spanning all columns stays in the flow' : narrow ? 'A callout or flare inside a multi-column section stays in the flow' : 'Float: the text wraps around the block') + '">Float <select class="b-lay-f" data-idx="' + idx + '"' + (noFloat ? ' disabled' : '') + '>' + [['none', 'None'], ['left', 'Left'], ['right', 'Right']].map(function(o) { return '<option value="' + o[0] + '"' + ((noFloat ? 'none' : l.float) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>';
      h += '<label title="Nudge sideways, in pixels, without changing how the text wraps">X <input type="number" class="b-lay-dx" data-idx="' + idx + '" value="' + l.dx + '" min="-200" max="200" step="4"></label>';
      h += '<label title="Nudge up or down, in pixels">Y <input type="number" class="b-lay-dy" data-idx="' + idx + '" value="' + l.dy + '" min="-200" max="200" step="4"></label>';
      h += '<label class="' + (inCols ? '' : 'off') + '" title="' + (inCols ? 'Take the full width of this multi-column section' : 'Takes effect inside a section with 2 or 3 columns') + '"><input type="checkbox" class="b-lay-span" data-idx="' + idx + '"' + (l.span ? ' checked' : '') + '> Span all columns</label>';
      if (b.type === 'image') h += '<span class="lay-note">Or drag the picture in the preview to nudge it, and its bottom-right corner to resize it.</span>';
      return h + '</div>';
  }

  /* ---- text style: the look of a plain field, kept beside its text (textfmt.js) ----
     A title, a tag, a table cell, a flowchart label are the plain strings they always were. What the Text style bar does to one
     is stored next to the value it belongs to, so moving, deleting or re-ordering rows, columns, nodes and arrows can never
     leave a look pointing at another text: block.fmt.{title, sub, tag, must, caption}; a table's heads in colFmt (a list
     parallel to cols, kept in step by the Columns select); a row's cells on the row (row.fmt.col1…); a node's label on the
     node, an arrow's on the arrow. A block with none of these is saved, sent and drawn exactly as before. */
  // [textcheck:fields-start]
  var TS_PLAIN = '.b-title, .b-sub, .b-must, .b-caption, .b-colhead, .r-col, .fc-n-text, .fc-e-text';   // the editor boxes that hold a plain field
  function tsDefaultCols(b) { return (b.mode === 'table' || b.type === 'table') ? ['Item', 'Detail', 'Notes'] : ['Action', 'Why', 'Cost', 'Returns via']; }
  function tsCols(b) { return (Array.isArray(b.cols) && b.cols.length > 0) ? b.cols : tsDefaultCols(b); }
  function tsOwnCols(b) { if (!Array.isArray(b.cols) || !b.cols.length) b.cols = tsDefaultCols(b).slice(); }
  function tsInt(v) { var n = parseInt(v, 10); return n >= 0 ? n : -1; }
  // Which field an editor box is: { idx, k, ri, ci, ni, ei } — its place in the blocks, never its text
  function tsDesc(el) {
      if (!el || !el.classList || !el.dataset) return null;
      var c = el.classList, d = { idx: tsInt(el.dataset.idx) };
      if (d.idx < 0) return null;
      if (c.contains('b-title')) d.k = 'title';
      else if (c.contains('b-sub')) d.k = 'sub';   // a scene node's second box is its tag: tsField reads the block
      else if (c.contains('b-must')) d.k = 'must';
      else if (c.contains('b-caption')) d.k = 'caption';
      else if (c.contains('b-colhead')) { d.k = 'col'; d.ci = tsInt(el.dataset.ci); }
      else if (c.contains('r-col')) { d.k = 'cell'; d.ri = tsInt(el.dataset.ri); d.ci = tsInt(el.dataset.ci); }
      else if (c.contains('fc-n-text')) { d.k = 'node'; d.ni = tsInt(el.dataset.ni); }
      else if (c.contains('fc-e-text')) { d.k = 'edge'; d.ei = tsInt(el.dataset.ei); }
      else return null;
      return d;
  }
  function tsOwn(o, k) { return !!o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k); }
  // a text at o[key] whose format sits in a map on the same object (host[mapName][mapKey])
  function tsMapField(o, key, host, mapName, mapKey) {
      return {
          text: function() { return typeof o[key] === 'string' ? o[key] : ''; },
          fmt: function() { var m = host[mapName]; return m && typeof m === 'object' && !Array.isArray(m) && tsOwn(m, mapKey) ? m[mapKey] : undefined; },
          setFmt: function(f) { var m = host[mapName]; if (!m || typeof m !== 'object' || Array.isArray(m)) m = {}; if (f) m[mapKey] = f; else delete m[mapKey]; if (Object.keys(m).length) host[mapName] = m; else delete host[mapName]; },
          setText: function(v) { o[key] = v; }
      };
  }
  // The field a descriptor names in these blocks — { text(), fmt(), setFmt(f), setText(v) } — or null when it is not there (any more)
  function tsField(blocks, d) {
      var b = d && Array.isArray(blocks) ? blocks[d.idx] : null;
      if (!b || typeof b !== 'object') return null;
      var grid = b.type === 'node' || b.type === 'table';
      if (d.k === 'title') return (b.type === 'h1' || b.type === 'h2' || b.type === 'h3' || grid) ? tsMapField(b, 'title', b, 'fmt', 'title') : null;
      if (d.k === 'sub') return b.type === 'h1' ? tsMapField(b, 'sub', b, 'fmt', 'sub') : b.type === 'node' ? tsMapField(b, 'tag', b, 'fmt', 'tag') : null;
      if (d.k === 'must') return b.type === 'node' ? tsMapField(b, 'must', b, 'fmt', 'must') : null;
      if (d.k === 'caption') return b.type === 'image' ? tsMapField(b, 'caption', b, 'fmt', 'caption') : null;
      if (d.k === 'col') {
          if (!grid || !(d.ci >= 0) || d.ci >= tsCols(b).length) return null;
          return {
              text: function() { var cs = tsCols(b); return typeof cs[d.ci] === 'string' ? cs[d.ci] : ''; },
              fmt: function() { return Array.isArray(b.colFmt) && b.colFmt[d.ci] ? b.colFmt[d.ci] : undefined; },
              setFmt: function(f) {   // parallel to cols: a head styled before it was ever typed makes the heads the block's own first
                  tsOwnCols(b);
                  var l = Array.isArray(b.colFmt) ? b.colFmt.slice() : [];
                  while (l.length <= d.ci) l.push(null);
                  l[d.ci] = f || null;
                  while (l.length && !l[l.length - 1]) l.pop();
                  if (l.length) b.colFmt = l; else delete b.colFmt;
              },
              setText: function(v) { tsOwnCols(b); b.cols[d.ci] = v; }
          };
      }
      if (d.k === 'cell') {
          var r = grid && Array.isArray(b.rows) ? b.rows[d.ri] : null;
          if (!r || typeof r !== 'object' || Array.isArray(r) || !(d.ci >= 0) || d.ci >= 99) return null;
          return tsMapField(r, 'col' + (d.ci + 1), r, 'fmt', 'col' + (d.ci + 1));
      }
      if (d.k === 'node' || d.k === 'edge') {
          var list = b.type === 'flowchart' ? (d.k === 'node' ? b.nodes : b.edges) : null, n = Array.isArray(list) ? list[d.k === 'node' ? d.ni : d.ei] : null;
          if (!n || typeof n !== 'object') return null;
          return {
              text: function() { return typeof n.text === 'string' ? n.text : ''; },
              fmt: function() { return tsOwn(n, 'fmt') ? n.fmt : undefined; },
              setFmt: function(f) { if (f) n.fmt = f; else delete n.fmt; },
              setText: function(v) { n.text = v; }
          };
      }
      return null;
  }
  // Typing in a field: the text takes the new value and its spans are carried across the edit (caret: the box's selectionStart).
  // inputType: the 'input' event's own. The browser's undo and redo (historyUndo / historyRedo) are not typing: they put a text back, and it
  // comes back with the look it had then. tsPast holds, per field (by its place), the texts the field has had since the editor was built,
  // each with its format, and where among them the field stands: an undo looks back from there, a redo forward. A text it does not hold
  // has its spans carried with nothing joined (respan's fifth argument): what an undo puts back right after a styled part never had that
  // part's look. A field that never had a format keeps no list and is handled exactly as before. Forgotten whenever the editor is rebuilt
  // (tsRebuilt): a place is an index, and the boxes — with the browser's own undo of them — are new.
  var TS_PAST_MAX = 100, tsPast = Object.create(null);
  function tsForget() { tsPast = Object.create(null); }
  function tsType(blocks, d, value, caret, inputType) {
      var fld = tsField(blocks, d); if (!fld) return false;
      var old = fld.text(), f = fld.fmt();
      value = String(value == null ? '' : value);
      fld.setText(value);
      var key = [d.idx, d.k, d.ri, d.ci, d.ni, d.ei].join('/'), past = tsPast[key];
      if (f === undefined && !past) return true;   // never styled
      var dir = inputType === 'historyUndo' ? -1 : inputType === 'historyRedo' ? 1 : 0, now, k = -1;
      var str = function(x) { return x === undefined ? '' : JSON.stringify(x); };
      if (dir) {
          if (past) {
              var n = past.list.length, miss = function(j) { return j >= 0 && j < n && past.list[j].t !== value; };
              for (k = past.at + dir; miss(k); k += dir) {}
              if (k < 0 || k >= n) for (k = past.at - dir; miss(k); k -= dir) {}   // not that way: the browser and the list disagree on where the field stands
              if (k >= n) k = -1;
          }
          if (k >= 0) { past.at = k; now = past.list[k].f ? TF.cleanFmt(JSON.parse(past.list[k].f), value) : undefined; }
          else now = f !== undefined ? TF.respan(old, value, f, caret, true) : undefined;
      } else {
          var cur = str(TF.cleanFmt(f, old));
          now = f !== undefined ? TF.respan(old, value, f, caret) : undefined;
          if (!past) past = tsPast[key] = { list: [], at: -1 };
          past.list.length = past.at + 1;   // what an undo took back is gone once something is typed
          if (past.at < 0 || past.list[past.at].t !== old || past.list[past.at].f !== cur) past.list.push({ t: old, f: cur });   // the field as it stands (a press of the bar changed its look since)
          past.list.push({ t: value, f: str(now) });
          if (past.list.length > TS_PAST_MAX) past.list.splice(0, past.list.length - TS_PAST_MAX);
          past.at = past.list.length - 1;
      }
      if (f !== undefined || now !== undefined) fld.setFmt(now);
      return true;
  }
  // What the bar says it will act on, in a few words (plain text: the caller sets it as textContent)
  function tsName(blocks, d) {
      var b = d && Array.isArray(blocks) ? blocks[d.idx] : null; if (!b || !tsField(blocks, d)) return '';
      var cut = function(s) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > 30 ? s.slice(0, 29) + '\u2026' : s; };
      var plain = b.mode === 'table' || b.type === 'table';
      if (d.k === 'title') return b.type === 'h1' ? 'Title' : b.type === 'h2' ? 'Section heading' : b.type === 'h3' ? 'Sub-heading' : plain ? 'Table title' : 'Scene title';
      if (d.k === 'sub') return b.type === 'node' ? 'Tag' : 'Subtitle';
      if (d.k === 'must') return 'Must resolve';
      if (d.k === 'caption') return 'Caption';
      if (d.k === 'col') return 'Heading of column ' + (d.ci + 1);
      if (d.k === 'cell') { var cn = cut(tsCols(b)[d.ci]); return 'Row ' + (d.ri + 1) + ', ' + (cn || 'column ' + (d.ci + 1)); }
      if (d.k === 'node') { var id = cut(b.nodes[d.ni].id); return 'Node ' + (id || (d.ni + 1)) + '\u2019s label'; }
      if (d.k === 'edge') return 'Arrow ' + (d.ei + 1) + '\u2019s label';
      return '';
  }
  // The Columns select: the heads cut or grown, and the heads' formats with them (a cell past the last column keeps its text and its look, as before)
  function tsSetColCount(b, n) {
      var cols = tsCols(b).slice();
      while (cols.length < n) cols.push('Column ' + (cols.length + 1));
      b.cols = cols.slice(0, n);
      if (b.colFmt !== undefined) {
          var l = Array.isArray(b.colFmt) ? b.colFmt.slice(0, n) : [];
          while (l.length && !l[l.length - 1]) l.pop();
          if (l.length) b.colFmt = l; else delete b.colFmt;
      }
  }
  // A page's table from a file or from another table holds its rows as lists (docrender cleanDoc), their cells' formats beside them in
  // rowFmt. The editor works on rows as { col1, col2, … }: each list becomes that once, its formats moving onto the row. True when it changed.
  function tsRowsAsObjects(b) {
      if (!b || !Array.isArray(b.rows)) return false;
      var changed = false, rf = Array.isArray(b.rowFmt) ? b.rowFmt : [];
      b.rows = b.rows.map(function(r, ri) {
          if (!Array.isArray(r)) return r;
          var o = {}, fm = {}, one = Array.isArray(rf[ri]) ? rf[ri] : [];
          r.forEach(function(c, ci) { o['col' + (ci + 1)] = c == null ? '' : String(c); if (one[ci] && typeof one[ci] === 'object') fm['col' + (ci + 1)] = one[ci]; });
          if (Object.keys(fm).length) o.fmt = fm;
          changed = true;
          return o;
      });
      if (changed || b.rowFmt !== undefined) { if (b.rowFmt !== undefined) changed = true; delete b.rowFmt; }
      return changed;
  }
  // [textcheck:fields-end]

  /* ---- the Text style bar ----
     One bar at the top of the editor, closed until its caret is clicked (remembered for the session, never saved). It acts on the field
     that holds the selection: for a plain box (an input or a textarea) the selection is its selectionStart / selectionEnd, read at the
     press — the bar's buttons never take the focus (mousedown is swallowed, as the text blocks' own bar does) — and remembered for the
     controls that must take it (the size list, the custom colour, the link box). With nothing selected B, I, U, S, a colour, a size
     and a link are the whole field's; with characters selected, theirs. A link is a web address typed into the bar's own box (Enter, or
     leaving the box, sets it; an empty box takes the link off) — never for a flowchart label, which cannot hold one: the box is off
     there and says why. In a text block's box the bar drives that block's own rich-text commands. Each press is one undo step, and Ctrl+Z
     in the field takes the press back (never the typing before it). A control the keyboard reached keeps the focus while it is pressed, so
     the Size list can be stepped through by its arrow keys — that run of sizes is one step — and Escape (Enter in the Size list) goes back
     to the field. Nothing is remembered across a rebuild of the editor: a place is an index, and every index may have moved. */
  // [textcheck:bar-start]
  var tsState = { open: false, sel: null, els: null, key: false, run: null, linkDone: null };   // key: the bar was last touched by the keyboard; run: the field and selection a run of Size list steps is on; linkDone: the address Enter has just set (the box's own change event then has nothing left to do)
  var TS_LINK_TITLE = 'Link \u2014 a web address (https://\u2026) for the selected characters, or the whole field with nothing selected. Enter sets it; an empty box takes the link off.';
  var TS_LINK_LABEL = 'A flowchart label cannot hold a link: a chart never carries web addresses.';
  var TS_LINK_RTE = 'This box links titles, table cells and captions.';
  function tsIsLabel(d) { return !!d && (d.k === 'node' || d.k === 'edge'); }
  try { tsState.open = sessionStorage.getItem('wp_textStyleOpen') === '1'; } catch (e) {}
  function tsBlocksOf() { var am = getActiveMap(); return am && isDocLike(am) && Array.isArray(am.blocks) ? am : null; }
  // the editor box of a field, by its place
  function tsBox(d) {
      var root = document.getElementById('plannerBlocks'); if (!root || !d) return null;
      var at = '[data-idx="' + d.idx + '"]';
      var q = d.k === 'title' ? '.b-title' + at : d.k === 'sub' ? '.b-sub' + at : d.k === 'must' ? '.b-must' + at : d.k === 'caption' ? '.b-caption' + at
          : d.k === 'col' ? '.b-colhead' + at + '[data-ci="' + d.ci + '"]' : d.k === 'cell' ? '.r-col' + at + '[data-ri="' + d.ri + '"][data-ci="' + d.ci + '"]'
          : d.k === 'node' ? '.fc-n-text' + at + '[data-ni="' + d.ni + '"]' : d.k === 'edge' ? '.fc-e-text' + at + '[data-ei="' + d.ei + '"]' : null;
      return q ? root.querySelector(q) : null;
  }
  // Remember what a box in the editor holds selected (called as the selection moves, and again at every press)
  function tsNote(el) {
      var am = tsBlocksOf(); if (!am || !el || !el.closest || !el.closest('#plannerBlocks')) return;
      if (el.matches && el.matches(TS_PLAIN)) {
          var d = tsDesc(el);
          tsState.sel = d && tsField(am.blocks, d) ? { map: am.id, d: d, s: typeof el.selectionStart === 'number' ? el.selectionStart : 0, e: typeof el.selectionEnd === 'number' ? el.selectionEnd : 0 } : null;
      } else if (el.classList && el.classList.contains('rte-body')) {
          var gs = window.getSelection ? window.getSelection() : null;
          tsState.sel = { map: am.id, rte: tsInt(el.dataset.idx), some: !!(gs && gs.rangeCount && !gs.isCollapsed) };
      } else if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          tsState.sel = { map: am.id, none: true };   // a box that takes no styling (an id, raw HTML, a diagram's code)
      } else return;
      tsRefresh();
  }
  // The field the bar acts on now: the focused box as it stands, else the one last remembered — null when there is none (or it is gone)
  function tsTarget() {
      var am = tsBlocksOf(); if (!am) return null;
      var a = document.activeElement;
      if (a && a.closest && a.closest('#plannerBlocks')) tsNote(a);
      var sel = tsState.sel;
      if (!sel || sel.map !== am.id || sel.none) return null;
      if (sel.rte !== undefined) { var bb = am.blocks[sel.rte]; return bb && tsRteBody(sel.rte) ? sel : null; }
      return tsField(am.blocks, sel.d) ? sel : null;
  }
  function tsRteBody(idx) { var root = document.getElementById('plannerBlocks'); return root ? root.querySelector('.rte-body[data-idx="' + idx + '"]') : null; }
  // One press of a control. change: { b: true } | { i: true } | { u: true } | { st: true } | { color: '#rrggbb' | null } | { size: key | null } | { link: address | null } | 'clear'. True when something changed.
  // from: the bar's control the press came from. One the keyboard reached and holds keeps the focus; after any other press the field has it.
  function tsPress(change, from) {
      var am = tsBlocksOf(), sel = tsTarget();
      if (!am || !sel) { tsState.run = null; tsRefresh(); return false; }
      if (sel.rte !== undefined) { tsState.run = null; var body = tsRteBody(sel.rte), did = body ? rteLook(body, change) : false; tsNote(body); return did; }
      var fld = tsField(am.blocks, sel.d), text = fld.text(), was = fld.fmt();
      if (change !== 'clear' && tsOwn(change, 'link') && tsIsLabel(sel.d)) { tsRefresh(); return false; }   // a flowchart label never holds a link
      var now = change === 'clear' ? TF.clear(was, text, sel.s, sel.e) : TF.apply(was, text, sel.s, sel.e, change);
      if (JSON.stringify(now) === JSON.stringify(TF.cleanFmt(was, text))) { tsRefresh(); return false; }   // nothing to change: no step
      var kept = !!(from && tsState.key && document.activeElement === from);   // the keyboard is on this control: it keeps the focus
      var left = !!(from && from === tsState.els.link && document.activeElement !== from);   // the link box was left for somewhere else (its change came as it lost the focus): the focus stays where it went
      var runOn = kept && from === tsState.els.size ? JSON.stringify([sel.d, sel.s, sel.e]) : null;
      if (runOn && tsState.run === runOn) stepFold();   // the Size list stepped through by its arrow keys: every size on the way is applied, the run of them is one undo step (io.js)
      else stepBoundary();   // typing still on its way is its own step; this press is one step of its own
      tsState.run = runOn;
      fld.setFmt(now);
      save(true);
      renderPlannerPreview();
      var box = tsBox(sel.d);   // the selection stays where it was, so the next press needs no second selecting
      if (box) {
          box._wpNativeDirty = false; box._wpFloor = box.value;   // Ctrl+Z in the field now takes this press back (the planner's history has it, after the typing): the browser's own undo would take the typed text away with its styling, and its redo bring it back plain (io.js fieldUndoChord; what is typed after this it may still take back, down to this text)
          try { if (!left) { if (!kept && document.activeElement !== box) box.focus(); box.setSelectionRange(sel.s, sel.e); } } catch (e) {}
      }
      if (now && now.spans && now.spans.length >= TF.MAX_SPANS) toast('This field now holds the most styled parts it can (' + TF.MAX_SPANS + ').');
      tsRefresh();
      return true;
  }
  // The link box's address onto the field. A web address typed without its scheme ("example.com/page") is taken as https://; anything that is
  // still no link (textfmt.js cleanLink: the page sanitiser's rule) is refused in words and changes nothing ('bad'); an empty box takes the link off.
  function tsLink() {
      var E = tsState.els, v = String(E.link.value == null ? '' : E.link.value).trim();
      if (v && !/^[a-z][a-z0-9+.-]*:/i.test(v)) v = 'https://' + v;
      if (v && !TF.cleanLink(v)) { toast('A link is a web address: it starts with http:// or https:// and holds no spaces.'); return 'bad'; }
      return tsPress({ link: v || null }, E.link);
  }
  // The editor was rebuilt (a row, a block, a node or an arrow added, deleted or moved; undo, redo; another document): what was remembered is a
  // place by index, and every index may now name another text — so nothing stays remembered and the bar asks for a click in a field. (A box
  // given the focus again after an undo is noted afresh as it takes it.) The texts each field has held (tsType) are forgotten with it.
  function tsRebuilt() { tsState.sel = null; tsState.run = null; tsForget(); tsRefresh(); }
  // Back from the bar to the field it acts on, its selection as it was. False when there is none.
  function tsBack() {
      var am = tsBlocksOf(), sel = tsState.sel;
      if (!am || !sel || sel.map !== am.id || sel.none) return false;
      if (sel.rte !== undefined) { var body = am.blocks[sel.rte] ? tsRteBody(sel.rte) : null; if (!body) return false; body.focus(); return true; }
      var box = tsField(am.blocks, sel.d) ? tsBox(sel.d) : null; if (!box) return false;
      try { box.focus(); box.setSelectionRange(sel.s, sel.e); } catch (e) {}
      return true;
  }
  // The bar as it stands: what it acts on (as text), which controls are lit, which cannot apply
  function tsRefresh() {
      var E = tsState.els; if (!E) return;
      var am = tsBlocksOf(), sel = tsState.sel, kind = 'none', words = 'Click in a title, a label or a table cell, then pick a style.', st = null;
      if (am && sel && sel.map === am.id) {
          if (sel.none) words = 'This box takes no styling.';
          else if (sel.rte !== undefined) { if (am.blocks[sel.rte]) { kind = 'rte'; words = 'Text block \u2014 ' + (sel.some ? 'the selected text' : 'select text to colour or size it; B and I also set what you type next'); } }
          else {
              var fld = tsField(am.blocks, sel.d);
              if (fld) { kind = 'plain'; st = TF.stateAt(fld.fmt(), fld.text(), sel.s, sel.e); var n = Math.abs(sel.e - sel.s); words = tsName(am.blocks, sel.d) + ' \u2014 ' + (n ? n + ' selected character' + (n === 1 ? '' : 's') : 'the whole field'); }
          }
      }
      E.target.textContent = words;
      var needSel = kind === 'rte' && !sel.some;   // in a text block a colour, a size and Clear need a selection
      E.b.disabled = E.i.disabled = E.u.disabled = E.s.disabled = kind === 'none';
      E.b.classList.toggle('on', !!(st && st.b)); E.i.classList.toggle('on', !!(st && st.i)); E.u.classList.toggle('on', !!(st && st.u)); E.s.classList.toggle('on', !!(st && st.st));
      E.swatches.forEach(function(sw) { sw.disabled = kind === 'none'; sw.classList.toggle('active', !!(st && st.color === sw.dataset.color)); });
      E.custom.disabled = kind === 'none';
      E.customWrap.classList.toggle('active', !!(st && st.color && !E.swatches.some(function(sw) { return sw.dataset.color === st.color; })));
      E.customWrap.classList.toggle('off', kind === 'none');
      E.nocolor.disabled = kind === 'none' || needSel;
      E.size.disabled = kind === 'none' || needSel;
      var mixed = !!st && st.size === null;   // the range holds more than one size: the list says so (a word it shows, never one to pick)
      E.sizeMixed.hidden = !mixed;
      E.size.value = mixed ? 'mixed' : st && st.size ? st.size : '';
      var label = kind === 'plain' && tsIsLabel(sel.d);
      E.link.disabled = kind !== 'plain' || label;
      E.linkLab.classList.toggle('off', E.link.disabled);
      E.linkLab.title = label ? TS_LINK_LABEL : kind === 'rte' ? TS_LINK_RTE : TS_LINK_TITLE;
      if (document.activeElement !== E.link) {   // never over what is being typed
          E.link.value = st && st.link && !E.link.disabled ? st.link : '';
          E.link.placeholder = st && st.link === null && !E.link.disabled ? 'several links' : 'https://\u2026';
      }
      E.clear.disabled = kind === 'none' || needSel || (kind === 'plain' && !st.any);
  }
  // Build the bar's controls (text nodes and values only) and wire them. root: #textStyleBar from index.html.
  function tsBuild(root) {
      var toggle = root && root.querySelector('#textStyleToggle'), body = root && root.querySelector('#textStyleBody'); if (!toggle || !body) return;
      var mk = function(tag, cls, text, title) { var el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; if (title) el.title = title; return el; };
      var E = { root: root, toggle: toggle, body: body };
      var row = mk('div', 'ts-row');
      E.b = mk('button', 'ts-btn ts-b', 'B', 'Bold (Ctrl+B) \u2014 the selected characters, or the whole field with nothing selected'); E.b.type = 'button'; E.b.dataset.ts = 'b';
      E.i = mk('button', 'ts-btn ts-i', 'I', 'Italic (Ctrl+I) \u2014 the selected characters, or the whole field with nothing selected'); E.i.type = 'button'; E.i.dataset.ts = 'i';
      E.u = mk('button', 'ts-btn ts-u', 'U', 'Underline (Ctrl+U) \u2014 the selected characters, or the whole field with nothing selected'); E.u.type = 'button'; E.u.dataset.ts = 'u';
      E.s = mk('button', 'ts-btn ts-s', 'S', 'Strike through \u2014 the selected characters, or the whole field with nothing selected'); E.s.type = 'button'; E.s.dataset.ts = 'st';
      row.appendChild(E.b); row.appendChild(E.i); row.appendChild(E.u); row.appendChild(E.s); row.appendChild(mk('span', 'ts-sep'));
      E.swatches = TF.PALETTE.map(function(p) { var sw = mk('button', 'ts-sw', '', p[1]); sw.type = 'button'; sw.dataset.color = p[0]; sw.style.background = p[0]; row.appendChild(sw); return sw; });
      E.customWrap = mk('label', 'ts-sw ts-custom', '', 'Custom colour');
      E.custom = mk('input', 'ts-colorpick'); E.custom.type = 'color'; E.custom.value = '#d9534f';
      E.customWrap.appendChild(E.custom); row.appendChild(E.customWrap);
      E.nocolor = mk('button', 'ts-btn ts-word', 'Default', 'The default colour'); E.nocolor.type = 'button'; E.nocolor.dataset.ts = 'nocolor';
      row.appendChild(E.nocolor); row.appendChild(mk('span', 'ts-sep'));
      var sizeLab = mk('label', 'ts-sizelab', 'Size ', 'Size \u2014 the selected characters, or the whole field with nothing selected');
      E.size = mk('select', 'ts-size');
      [['', 'Default']].concat(TF.SIZES.map(function(k) { return [k, TF.SIZE_NAMES[k] || k]; })).forEach(function(o) { var op = mk('option', '', o[1]); op.value = o[0]; E.size.appendChild(op); });
      E.sizeMixed = mk('option', '', 'Mixed'); E.sizeMixed.value = 'mixed'; E.sizeMixed.disabled = true; E.sizeMixed.hidden = true; E.size.appendChild(E.sizeMixed);   // shown, never picked: the range holds more than one size
      sizeLab.appendChild(E.size); row.appendChild(sizeLab); row.appendChild(mk('span', 'ts-sep'));
      E.linkLab = mk('label', 'ts-linklab', 'Link ', TS_LINK_TITLE);
      E.link = mk('input', 'ts-link'); E.link.type = 'text'; E.link.placeholder = 'https://\u2026'; E.link.setAttribute('spellcheck', 'false'); E.link.setAttribute('autocomplete', 'off'); E.link.setAttribute('aria-label', 'Link address');
      E.linkLab.appendChild(E.link); row.appendChild(E.linkLab); row.appendChild(mk('span', 'ts-sep'));
      E.clear = mk('button', 'ts-btn ts-word', 'Clear', 'Take the styling off: the selected characters, or the whole field with nothing selected'); E.clear.type = 'button'; E.clear.dataset.ts = 'clear';
      row.appendChild(E.clear);
      E.target = mk('div', 'ts-target');
      body.appendChild(row); body.appendChild(E.target);
      tsState.els = E;
      var show = function() { body.hidden = !tsState.open; toggle.setAttribute('aria-expanded', tsState.open ? 'true' : 'false'); root.classList.toggle('open', tsState.open); };
      toggle.addEventListener('mousedown', function(e) { e.preventDefault(); });
      toggle.addEventListener('click', function() { tsState.open = !tsState.open; try { sessionStorage.setItem('wp_textStyleOpen', tsState.open ? '1' : '0'); } catch (e) {} show(); tsRefresh(); });
      // the buttons never take the focus: the field keeps its selection. The size list, the colour picker and the link box must take it; the press then acts on what was remembered
      body.addEventListener('mousedown', function(e) { tsState.key = false; var t = e.target; if (t === E.size || t === E.custom || t === E.link || (t && t.tagName === 'OPTION')) { tsTarget(); return; } e.preventDefault(); });
      // the keyboard in the bar: a control pressed from it keeps the focus (tsPress), Escape — and Enter in the Size list — goes back to the field;
      // Enter in the link box sets the link and goes back to the field
      body.addEventListener('keydown', function(e) {
          tsState.key = true;
          if (e.key === 'Enter' && e.target === E.link) { e.preventDefault(); e.stopPropagation(); tsState.linkDone = E.link.value; if (tsLink() !== 'bad') tsBack(); return; }
          if ((e.key === 'Escape' || (e.key === 'Enter' && e.target === E.size)) && tsBack()) { e.preventDefault(); e.stopPropagation(); }
      });
      body.addEventListener('click', function(e) {
          var t = e.target, btn = t && t.closest ? t.closest('button') : null; if (!btn || btn.disabled) return;
          if (btn.dataset.color) tsPress({ color: btn.dataset.color }, btn);
          else if (btn.dataset.ts === 'b') tsPress({ b: true }, btn);
          else if (btn.dataset.ts === 'i') tsPress({ i: true }, btn);
          else if (btn.dataset.ts === 'u') tsPress({ u: true }, btn);
          else if (btn.dataset.ts === 'st') tsPress({ st: true }, btn);
          else if (btn.dataset.ts === 'nocolor') tsPress({ color: null }, btn);
          else if (btn.dataset.ts === 'clear') tsPress('clear', btn);
      });
      E.size.addEventListener('change', function() { tsPress({ size: E.size.value || null }, E.size); });   // "Mixed" is no size: the core changes nothing for it
      E.link.addEventListener('change', function() { var done = tsState.linkDone; tsState.linkDone = null; if (done === E.link.value) return; tsLink(); });   // the box was left with a new address in it (Enter has its own way, above)
      E.link.addEventListener('blur', function() { tsState.linkDone = null; tsRefresh(); });   // left: it shows the field's own link again
      E.size.addEventListener('blur', function() { tsState.run = null; });   // the list was left: the next size is a step of its own
      E.custom.addEventListener('change', function() { tsPress({ color: E.custom.value }, E.custom); });   // once, when the picker closes: one undo step
      show(); tsRefresh();
  }
  // Ctrl+B / Ctrl+I / Ctrl+U in a plain box do what the buttons do (seen in the capture phase: a flowchart label stops its own keys)
  function tsKey(e) {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false;
      var k = String(e.key || '').toLowerCase(); if (k !== 'b' && k !== 'i' && k !== 'u') return false;
      var t = e.target; if (!t || !t.matches || !t.matches(TS_PLAIN) || !t.closest || !t.closest('#plannerBlocks')) return false;
      e.preventDefault(); e.stopPropagation();
      tsPress(k === 'b' ? { b: true } : k === 'i' ? { i: true } : { u: true });
      return true;
  }
  // [textcheck:bar-end]
  (function wireTextStyle() {
      var root = document.getElementById('textStyleBar'); if (!root) return;
      tsBuild(root);
      document.addEventListener('keydown', tsKey, true);
      ['focusin', 'select', 'keyup', 'mouseup', 'input'].forEach(function(ev) { document.addEventListener(ev, function(e) { var t = e.target; if (t && t.closest && t.closest('#plannerBlocks')) tsNote(t); }, true); });
      document.addEventListener('selectionchange', function() { var a = document.activeElement; if (a && a.closest && a.closest('#plannerBlocks')) tsNote(a); });
  })();

  function renderPlanner() {
      var activeMap = getActiveMap();
      if (!activeMap) return;
      // This document remembers its own reading-view state
      if (isDocLike(activeMap)) {
          var rv = !!(activeMap.meta && activeMap.meta.readerView);
          if (rv !== plannerFullscreen) { plannerFullscreen = rv; applyPlannerFullscreen(); }
      }
      // Page or planner: one Add Block select whose options carry data-for="planner" / "doc" (none = both),
      // the scene status is a planner thing, the players switch a page thing
      var isDocEd = activeMap.type === 'doc';
      var addSel = document.getElementById('addBlockSelect');
      if (addSel) Array.from(addSel.options).forEach(function(o) { var f = o.dataset.for; o.hidden = !!(f && f !== (isDocEd ? 'doc' : 'planner')); });
      var stSelD = document.getElementById('plannerStatus'); if (stSelD) stSelD.style.display = isDocEd ? 'none' : '';
      var plBtnD = document.getElementById('docPlayersBtn');
      if (plBtnD) {
          plBtnD.style.display = isDocEd ? '' : 'none';
          var onP = !(activeMap.meta && activeMap.meta.players === false);
          plBtnD.innerHTML = onP ? '&#128065; Players can read' : '&#128274; GM only';
          plBtnD.classList.toggle('on', onP);
          plBtnD.title = onP ? 'Players at your table receive this page and read it from their Handbook. Click to keep it to yourself.' : 'Only you see this page. Click to let players read it.';
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

      

      activeMap.blocks.forEach(function(b) { if (b && typeof b === 'object' && (b.type === 'node' || b.type === 'table')) tsRowsAsObjects(b); });   // a page's table from a file: rows as the editor reads them, their formats on the rows (a clean-up, never an undo step)

      // Render editor

      var html = '';

      var secCols = 1;   // the column count of the section a block sits in (its layout row depends on it)
      activeMap.blocks.forEach(function(b, idx) {
          if (b.type === 'h1') secCols = 1; else if (b.type === 'h2') secCols = Math.max(1, Math.min(3, Math.round(Number(b.cols) || 1)));

          html += '<div class="planner-block-edit" data-idx="'+idx+'">';

          html += '<div class="block-head"><span>' + (b.type === 'node' ? (b.mode === 'table' ? 'TABLE' : 'SCENE NODE') : esc(String(b.type).toUpperCase())) + '</span>';

          html += '<div class="block-tools"><button class="tool ghost mv-up" data-idx="'+idx+'">▲</button><button class="tool ghost mv-dn" data-idx="'+idx+'">▼</button><button class="tool ghost danger del-blk" data-idx="'+idx+'">✖</button></div></div>';

          

          if (b.type === 'h1') {

              html += '<input type="text" class="field b-title" value="'+esc(b.title||'')+'" placeholder="Title" data-idx="'+idx+'" style="margin-bottom:6px; width:100%;">';

              html += '<input type="text" class="field b-sub" value="'+esc(b.sub||'')+'" placeholder="Subtitle" data-idx="'+idx+'" style="width:100%;">';

          } else if (b.type === 'h2' || b.type === 'h3') {

              html += '<input type="text" class="field b-title" value="'+esc(b.title||'')+'" placeholder="'+(b.type === 'h3' ? 'Sub-heading' : 'Section Header')+'" data-idx="'+idx+'" style="width:100%;">';
              if (isDocEd && b.type === 'h2') html += '<div class="fc-opts" style="margin-top:6px;"><label title="Everything under this section, up to the next section or title, flows in this many columns">Columns <select class="b-h2cols" data-idx="'+idx+'">' + [1, 2, 3].map(function(n) { return '<option value="' + n + '"' + (secCols === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label></div>';

          } else if (b.type === 'oneline' || b.type === 'lede' || b.type === 'text' || b.type === 'callout' || b.type === 'flare') {

              html += rteHtml(idx, b);

          } else if (b.type === 'image') {
              html += '<div class="b-img-row"><div class="b-img-thumb">' + (picRef(b.src) ? '<img src="' + esc(picRef(b.src)) + '" alt="">' : '<span>No picture yet</span>') + '</div>'
                    + '<div class="b-img-ctl"><div class="fc-opts"><button class="tool ghost b-img-pick" data-idx="' + idx + '" title="Pick a picture already in this campaign">Choose from library…</button>'
                    + '<label class="tool ghost b-img-uplabel" title="Upload a picture from your computer">Upload…<input type="file" accept="image/*" class="b-img-upload" data-idx="' + idx + '" style="display:none;"></label>'
                    + (isDocEd ? '' : '<label>Width <select class="b-imgw" data-idx="' + idx + '">' + [25, 33, 50, 66, 75, 100].map(function(w) { return '<option value="' + w + '"' + ((b.width || 100) === w ? ' selected' : '') + '>' + w + '%</option>'; }).join('') + '</select></label>'
                    + '<label>Align <select class="b-imga" data-idx="' + idx + '">' + [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']].map(function(o) { return '<option value="' + o[0] + '"' + ((b.align || 'center') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>') + '</div>'
                    + '<input type="text" class="field b-caption" value="' + esc(b.caption || '') + '" placeholder="Caption (optional)" data-idx="' + idx + '" style="width:100%; margin-top:6px;"></div></div>';
          } else if (b.type === 'raw') {

              html += '<textarea class="field b-content" placeholder="Raw HTML..." data-idx="'+idx+'" style="width:100%; height:120px; font-family:monospace;">'+esc(b.content||'')+'</textarea>';

          } else if (b.type === 'rule') {
              html += '<div style="color:var(--dim); font-size:12px;">A horizontal line across the page. Nothing to edit; move or delete it with the buttons above.</div>';
          } else if (b.type === 'diagram') {

              html += '<textarea class="field b-content" placeholder="Mermaid flowchart code..." data-idx="'+idx+'" style="width:100%; height:150px; font-family:monospace;">'+esc(b.content||'')+'</textarea>';

          } else if (b.type === 'node' || b.type === 'table') {
              var plain = b.mode === 'table' || b.type === 'table';   // a page's table block is the node grid in table mode, without the mode switch
              if (b.type === 'node') html += '<div class="fc-opts" style="margin-bottom:6px;"><label>Mode <select class="b-mode" data-idx="'+idx+'" title="Scene node: a scene with what must be resolved and the routes out of it. Plain table: just a grid of information."><option value="node"'+(plain ? '' : ' selected')+'>Scene node</option><option value="table"'+(plain ? ' selected' : '')+'>Plain table</option></select></label></div>';
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

          if (isDocEd && LAYOUT_TYPES[b.type]) html += layoutRowHtml(idx, b, secCols);
          html += '</div>';

      });

      rebaseHistory(activeMap);   // the legacy upgrade and block defaults above are clean-ups, never an undo step

      blockContainer.innerHTML = html;



      // Attach listeners

      Array.from(blockContainer.querySelectorAll('.b-title')).forEach(el => el.addEventListener('input', function(e) { tsType(activeMap.blocks, tsDesc(this), this.value, this.selectionStart, e.inputType); save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.b-img-pick')).forEach(el => el.addEventListener('click', function() {
          var idx = +this.dataset.idx;
          if (!window.wpPickImage) { toast('The image library is not available here.'); return; }
          window.wpPickImage(function(src) { activeMap.blocks[idx].src = src; save(true); renderPlanner(); });
      }));
      Array.from(blockContainer.querySelectorAll('.b-img-upload')).forEach(el => el.addEventListener('change', function() {
          var idx = +this.dataset.idx, f = this.files && this.files[0]; if (!f || !f.type.startsWith('image/')) return;
          if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return; }
          toast('Uploading picture…');
          window.wpUploadBlob(activeMap.id, f.name, f)
              .then(function(url) { activeMap.blocks[idx].src = url; save(true); renderPlanner(); })
              .catch(function() { toast('Upload failed.'); });
      }));
      Array.from(blockContainer.querySelectorAll('.b-imgw')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].width = +this.value; save(true); renderPlannerPreview(); }));
      Array.from(blockContainer.querySelectorAll('.b-imga')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].align = this.value; save(true); renderPlannerPreview(); }));
      Array.from(blockContainer.querySelectorAll('.b-caption')).forEach(el => el.addEventListener('input', function(e) { tsType(activeMap.blocks, tsDesc(this), this.value, this.selectionStart, e.inputType); save(true); renderPlannerPreview(); }));
      // Page layout row (pages only). Selects and the checkbox are one undo step each; the nudge boxes coalesce like text.
      var layOf = function(el) { var bb = activeMap.blocks[el.dataset.idx]; if (!bb.layout || typeof bb.layout !== 'object') bb.layout = blockLayout(bb); return bb; };
      Array.from(blockContainer.querySelectorAll('.b-lay-w')).forEach(el => el.addEventListener('change', function() { layOf(this).layout.width = +this.value; save(true); renderPlannerPreview(); }));
      Array.from(blockContainer.querySelectorAll('.b-lay-f')).forEach(el => el.addEventListener('change', function() { layOf(this).layout.float = this.value; save(true); renderPlannerPreview(); }));
      Array.from(blockContainer.querySelectorAll('.b-lay-dx, .b-lay-dy')).forEach(el => el.addEventListener('input', function() { var bb = layOf(this); bb.layout[this.classList.contains('b-lay-dx') ? 'dx' : 'dy'] = Math.max(-200, Math.min(200, Math.round(+this.value || 0))); save(false); renderPlannerPreview(); }));
      Array.from(blockContainer.querySelectorAll('.b-lay-span')).forEach(el => el.addEventListener('change', function() { var bb = layOf(this); bb.layout.span = this.checked; if (this.checked) bb.layout.float = 'none'; save(true); renderPlanner(); }));
      Array.from(blockContainer.querySelectorAll('.b-h2cols')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].cols = Math.max(1, Math.min(3, parseInt(this.value, 10) || 1)); save(true); renderPlanner(); }));
      Array.from(blockContainer.querySelectorAll('.b-sub')).forEach(el => el.addEventListener('input', function(e) { tsType(activeMap.blocks, tsDesc(this), this.value, this.selectionStart, e.inputType); save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.b-must')).forEach(el => el.addEventListener('input', function(e) { tsType(activeMap.blocks, tsDesc(this), this.value, this.selectionStart, e.inputType); save(false); renderPlannerPreview(); }));

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
          tsSetColCount(bb, n);   // the heads, and their formats in step
          save(true); renderPlanner();
      }));
      Array.from(blockContainer.querySelectorAll('.b-colhead')).forEach(el => el.addEventListener('input', function(e) {
          tsType(activeMap.blocks, tsDesc(this), this.value, this.selectionStart, e.inputType);   // the heads become the block's own at the first typed one, as before
          save(false); renderPlannerPreview();
      }));
      Array.from(blockContainer.querySelectorAll('.b-content')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].content = this.value; save(false); if(activeMap.blocks[this.dataset.idx].type !== 'diagram') renderPlannerPreview(); }));
      wireRte(blockContainer);

      Array.from(blockContainer.querySelectorAll('.r-col')).forEach(el => el.addEventListener('input', function(e) { tsType(activeMap.blocks, tsDesc(this), this.value, this.selectionStart, e.inputType); save(false); renderPlannerPreview(); }));

      

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
          el.addEventListener('input', grow); el.addEventListener('keydown', function(e) { if (fieldUndoChord(e)) return; e.stopPropagation(); }); grow();
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
      Array.from(blockContainer.querySelectorAll('.fc-n-text')).forEach(el => el.addEventListener('input', function(e) { tsType(activeMap.blocks, tsDesc(this), this.value, this.selectionStart, e.inputType); save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.fc-n-shape')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].nodes[this.dataset.ni].shape = this.value; save(true); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.fc-n-color')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].nodes[this.dataset.ni].color = this.value; save(true); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.del-fc-n')).forEach(el => el.addEventListener('click', function() { activeMap.blocks[this.dataset.idx].nodes.splice(this.dataset.ni, 1); save(true); renderPlanner(); }));

      Array.from(blockContainer.querySelectorAll('.add-fc-n')).forEach(el => el.addEventListener('click', function() { activeMap.blocks[this.dataset.idx].nodes.push({id: 'n'+(activeMap.blocks[this.dataset.idx].nodes.length+1), text: 'Node', shape: 'rect', color: 'neutral'}); save(true); renderPlanner(); }));



      Array.from(blockContainer.querySelectorAll('.fc-e-from')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].edges[this.dataset.ei].from = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.fc-e-to')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].edges[this.dataset.ei].to = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.fc-e-text')).forEach(el => el.addEventListener('input', function(e) { tsType(activeMap.blocks, tsDesc(this), this.value, this.selectionStart, e.inputType); save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.fc-e-style')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].edges[this.dataset.ei].style = this.value; save(true); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.del-fc-e')).forEach(el => el.addEventListener('click', function() { activeMap.blocks[this.dataset.idx].edges.splice(this.dataset.ei, 1); save(true); renderPlanner(); }));

      Array.from(blockContainer.querySelectorAll('.add-fc-e')).forEach(el => el.addEventListener('click', function() { activeMap.blocks[this.dataset.idx].edges.push({from: '', to: '', text: '', style: 'solid'}); save(true); renderPlanner(); }));

      

      renderPlannerPreview();

      applyPlannerFullscreen();

      tsRebuilt();   // every box above is new: no place in the old ones is remembered

  }



  // Render Preview toggles a fullscreen reading view: editor hidden, preview full-width

  var plannerFullscreen = false;
  // Exports always use the rendered document: switch to Render Preview if needed, re-render at
  // full width, run the export, then put the view back the way it was.
  window.wpWithRenderedPlanner = async function(fn) {
      var am = getActiveMap();
      if (!isDocLike(am)) { await fn(); return; }
      var was = plannerFullscreen;
      // nothing of the bar over the preview (controls, find box, highlights) belongs in an export
      var bar = document.getElementById('plannerFindBar'), barParent = bar && bar.parentNode, barNext = bar && bar.nextSibling;
      var findBox = document.getElementById('plannerFind'), findQ = findBox ? findBox.value : '';
      if (findBox) findBox.value = '';
      pfClear();
      if (bar && barParent) barParent.removeChild(bar);
      if (!was) { plannerFullscreen = true; applyPlannerFullscreen(); renderPlannerPreview(); await new Promise(function(r) { setTimeout(r, 700); }); }
      try { await fn(); }
      finally {
          if (!was) { plannerFullscreen = false; applyPlannerFullscreen(); renderPlannerPreview(); }
          if (bar && barParent) barParent.insertBefore(bar, barNext);
          if (findBox && findQ) { findBox.value = findQ; plannerFindApply(true); }
      }
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
  // [sinkcheck:rtebar-start]
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
  // [sinkcheck:rte-start]
  // The box holds what the preview renders — the page sanitiser's HTML — so a planner from a file runs and loads nothing here either
  function rteInitial(b) {
      var c = String(b.content || '');
      if (/<(p|br|div|ul|ol|li|h[1-6]|table|pre|blockquote)\b/i.test(c)) return sanitizeHtml(c);   // already block HTML
      var body = nl(c, b.type === 'text');
      return sanitizeHtml(b.type === 'text' && body ? '<p>' + body + '</p>' : body);
  }
  // [sinkcheck:rte-end]
  function rteHtml(idx, b) {
      // a planner's and a page's text blocks also get colour and size (the list above is shared with the play map's text box, which does not): the app's ink row, then Custom, Default and the size steps — constants from textfmt.js, written before the symbol tray
      var look = TF.PALETTE.map(function(p) { return '<button type="button" class="rte-sw" data-color="' + esc(p[0]) + '" title="' + esc(p[1]) + ' \u2014 colour the selected text" style="background:' + esc(p[0]) + ';" tabindex="-1"></button>'; }).join('')
              + '<label class="rte-sw rte-custom" title="Custom colour for the selected text"><input type="color" class="rte-colorpick" value="#d9534f" tabindex="-1"></label>'
              + '<button type="button" class="rte-btn rte-nocolor" title="The default colour on the selected text" tabindex="-1">Default</button>'
              + '<select class="rte-size" title="Size of the selected text" tabindex="-1"><option value="">Size\u2026</option><option value="default">Default</option>' + TF.SIZES.map(function(s) { return '<option value="' + esc(s) + '">' + esc(TF.SIZE_NAMES[s] || s) + '</option>'; }).join('') + '</select><span class="rte-sep"></span>';
      var bar = RTE_CMDS.map(function(k) {
          if (k.sep) return '<span class="rte-sep"></span>';
          if (k.sym) return look + '<span class="rte-symwrap"><button type="button" class="rte-btn rte-symbtn" title="' + k.t + '" tabindex="-1">' + k.l + '</button><div class="rte-syms">' + RTE_SYMS.map(function(s) { return '<button type="button" class="rte-sym" data-sym="' + s[0] + '" title="' + s[1] + '" tabindex="-1">' + s[0] + '</button>'; }).join('') + '</div></span>';
          return '<button type="button" class="rte-btn" data-cmd="' + k.c + '" title="' + k.t + '" tabindex="-1">' + k.l + '</button>';
      }).join('');
      return '<div class="rte" data-idx="' + idx + '"><div class="rte-bar">' + bar + '</div>'
          + '<div class="field rte-body" contenteditable="true" data-idx="' + idx + '" data-placeholder="Write here — select text and use the bar, or Ctrl+B / I / U" spellcheck="true">' + rteInitial(b) + '</div></div>';
  }
  // [sinkcheck:rtebar-end]
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
      var a = document.activeElement; if (a && a.classList && a.classList.contains('rte-body')) { rteSyncBar(a); var gs = window.getSelection(); a._wpRange = gs && gs.rangeCount && a.contains(gs.anchorNode) ? gs.getRangeAt(0).cloneRange() : a._wpRange; }   // remembered for the controls that take the focus (the size list, the colour picker)
  });
  /* A text block's colour and size on the selection. The browser's own commands do the cutting (they split what the selection crosses
     and take a conflicting colour or size off it); what they leave — <font color>, a marker <font size> — is turned into the one form
     the page sanitiser writes (docrender sanitizeHtml): <span style="color:#rrggbb"> and <span style="font-size:<step>">. A size is a
     share of its parent's: the command takes a sized span that the selection sits in apart around it, a size inside the selection is
     taken off here, and the sanitiser keeps only the outer size should one ever be left inside another. */
  function rteExec(cmd, val) { try { document.execCommand('styleWithCSS', false, false); return document.execCommand(cmd, false, val === undefined ? null : val); } catch (e) { return false; } }
  function rteUnwrap(el) { var p = el.parentNode; if (!p) return; while (el.firstChild) p.insertBefore(el.firstChild, el); p.removeChild(el); }
  function rteBare(el) { if (el.getAttribute('style') !== null && !el.getAttribute('style').trim()) el.removeAttribute('style'); return !el.attributes.length; }
  // The selection as two character offsets into the box's text, and back. Turning what a command left into spans moves nodes about (a moved
  // node drops the selection), but never changes the text: the same characters are selected again afterwards, so a second press needs no second selecting.
  function rteOffsets(body) {
      var gs = window.getSelection(); if (!gs || !gs.rangeCount) return null;
      var r = gs.getRangeAt(0); if (!body.contains(r.startContainer) || !body.contains(r.endContainer)) return null;
      var pre = document.createRange(); pre.selectNodeContents(body); pre.setEnd(r.startContainer, r.startOffset);
      var s = pre.toString().length; pre.setEnd(r.endContainer, r.endOffset);
      return [s, pre.toString().length];
  }
  function rteSelect(body, off) {
      if (!off) return;
      var w = document.createTreeWalker(body, NodeFilter.SHOW_TEXT), n, at = 0, a = null, z = null, last = null;
      while ((n = w.nextNode())) {
          var len = n.nodeValue.length;
          if (!a && off[0] < at + len) a = [n, off[0] - at];        // a start goes to the front of the node that holds its character
          if (!z && off[1] <= at + len) z = [n, off[1] - at];       // an end stays at the back of the node that holds its last one
          at += len; last = n;
      }
      if (!last) return;
      if (!a) a = [last, last.nodeValue.length]; if (!z) z = [last, last.nodeValue.length];
      try { var r = document.createRange(); r.setStart(a[0], a[1]); r.setEnd(z[0], z[1]); var gs = window.getSelection(); gs.removeAllRanges(); gs.addRange(r); body._wpRange = r.cloneRange(); } catch (e) {}
  }
  function rteColor(body, c) {
      var MARK = '#010203';
      rteExec('foreColor', c || MARK);
      var off = rteOffsets(body);
      if (!off || off[0] === off[1]) return;   // a caret: the colour is for what is typed next — nothing to turn into spans, and the caret must stay as it is
      Array.from(body.querySelectorAll('font[color]')).forEach(function(f) {
          var col = String(f.getAttribute('color') || '').toLowerCase(), sz = f.getAttribute('size');
          if (col === MARK) {   // the default colour: whatever the command wrapped loses its colour, and so does anything inside it
              Array.from(f.querySelectorAll('span, font')).forEach(function(x) { if (x.style) x.style.color = ''; x.removeAttribute('color'); if (rteBare(x)) rteUnwrap(x); });
              f.removeAttribute('color'); if (!f.attributes.length) rteUnwrap(f);
              return;
          }
          if (sz) return;   // a size marker with a colour: rteSize turns it into a span
          var sp = document.createElement('span'); sp.style.color = col;
          while (f.firstChild) sp.appendChild(f.firstChild);
          f.parentNode.replaceChild(sp, f);
      });
      rteSelect(body, off);
  }
  function rteSize(body, key) {
      var em = key && Object.prototype.hasOwnProperty.call(TF.SIZE_EM, key) ? TF.SIZE_EM[key] : '';
      rteExec('fontSize', '7');
      var off = rteOffsets(body);
      Array.from(body.querySelectorAll('font[size="7"]')).forEach(function(f) {
          Array.from(f.querySelectorAll('span, font')).forEach(function(x) { if (x.style) x.style.fontSize = ''; x.removeAttribute('size'); if (rteBare(x)) rteUnwrap(x); });   // a size inside this one would multiply
          var color = f.getAttribute('color');
          if (!em && !color) { rteUnwrap(f); return; }
          var sp = document.createElement('span'); if (color) sp.style.color = color; if (em) sp.style.fontSize = em;
          while (f.firstChild) sp.appendChild(f.firstChild);
          f.parentNode.replaceChild(sp, f);
      });
      rteSelect(body, off);
  }
  // One change of look in a text block's box: change as tsPress takes it. False (with a word why) when it needs a selection and has none.
  function rteLook(body, change) {
      body.focus();
      var gs = window.getSelection();
      if (body._wpRange && (!gs.rangeCount || !body.contains(gs.anchorNode))) { try { gs.removeAllRanges(); gs.addRange(body._wpRange); } catch (e) {} }   // the size list or the colour picker took the focus
      var none = !gs.rangeCount || gs.isCollapsed || !body.contains(gs.anchorNode);
      body._wpQuiet = true;   // the commands below fire their own 'input' mid-way: only the finished box is stored
      try {
          if (change === 'clear') { if (none) { toast('Select the text to clear first.'); return false; } rteExec('removeFormat'); }
          else if (change && change.b === true) rteExec('bold');
          else if (change && change.i === true) rteExec('italic');
          else if (change && change.u === true) rteExec('underline');
          else if (change && change.st === true) rteExec('strikeThrough');
          else if (change && Object.prototype.hasOwnProperty.call(change, 'color')) { if (none && !change.color) { toast('Select the text first.'); return false; } rteColor(body, change.color); }
          else if (change && Object.prototype.hasOwnProperty.call(change, 'size')) { if (none) { toast('Select the text to size first.'); return false; } rteSize(body, change.size); }
          else return false;
      } finally { body._wpQuiet = false; }
      body.dispatchEvent(new Event('input', { bubbles: true }));
      if (change !== 'clear' && !(change && (change.b === true || change.i === true || change.u === true || change.st === true))) body._wpNativeDirty = false;   // a colour or a size re-made nodes behind the browser's own text undo: Ctrl+Z goes to the planner's history (io.js fieldUndoChord), which has this press as a step
      return true;
  }
  // [textcheck:rtewire-start]
  function wireRte(container) {
      Array.from(container.querySelectorAll('.rte-body')).forEach(function(body) {
          body.addEventListener('input', function() {
              if (this._wpQuiet) return;   // a command half-way through (rteLook): the finished box follows
              var am = getActiveMap(); if (!am || !am.blocks) return;
              am.blocks[this.dataset.idx].content = this.innerHTML;
              save(false); renderPlannerPreview(); rteSyncBar(this);
          });
          body.addEventListener('keydown', function(e) { if (fieldUndoChord(e)) return; e.stopPropagation(); });
          body.addEventListener('paste', function(e) {   // plain text only — no styles from elsewhere
              e.preventDefault();
              var t = (e.clipboardData || window.clipboardData).getData('text/plain');
              document.execCommand('insertText', false, t);
          });
          body.addEventListener('focus', function() { rteSyncBar(this); });
      });
      Array.from(container.querySelectorAll('.rte-bar')).forEach(function(bar) {
          bar.addEventListener('mousedown', function(e) { if (e.target && e.target.closest && e.target.closest('select, input')) return; e.preventDefault(); });   // keep the selection in the box (the size list and the colour picker must take the focus: the box's selection is remembered for them)
          var pick = bar.querySelector('.rte-colorpick'), sizeSel = bar.querySelector('.rte-size');
          if (pick) pick.addEventListener('change', function() { rteLook(bar.parentNode.querySelector('.rte-body'), { color: this.value }); });
          if (sizeSel) sizeSel.addEventListener('change', function() { var v = this.value; this.value = ''; if (v) rteLook(bar.parentNode.querySelector('.rte-body'), { size: v === 'default' ? null : v }); });
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
              var swC = e.target.closest && e.target.closest('.rte-sw[data-color]');
              if (swC) { rteLook(body, { color: swC.dataset.color }); return; }
              if (e.target.closest && e.target.closest('.rte-nocolor')) { rteLook(body, { color: null }); return; }
              if (e.target.closest && e.target.closest('.rte-custom, .rte-size')) return;   // their own change events
              var symBtn = e.target.closest && e.target.closest('.rte-symbtn');
              if (symBtn) { symBtn.parentNode.classList.toggle('open'); return; }
              var btn = e.target.closest && e.target.closest('.rte-btn'); if (!btn) return;
              body.focus();
              try { document.execCommand(btn.dataset.cmd, false, null); } catch (err) {}
              body.dispatchEvent(new Event('input', { bubbles: true }));
          });
      });
  }
  // [textcheck:rtewire-end]
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
  function fcBlockOf(box) { var am = box._fcDoc || getActiveMap(); var i = parseInt(box.dataset.fc, 10); return am && am.blocks ? am.blocks[i] : null; }   // _fcDoc: the reader's page (handbook.js)
  function fcNodeId(g) { return String(g.id || '').replace(/^flowchart-/, '').replace(/-\d+$/, ''); }
  function fcTranslate(g) { var m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(g.getAttribute('transform') || ''); return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 }; }
  function fcSig(b) { return (b.nodes || []).map(function(n) { return n.id; }).sort().join(','); }
  function fcApplyZoom(idx) { var box = document.querySelector('#plannerPreview .fc-box[data-fc="' + idx + '"]'); if (box) fcApplyZoomBox(box); }
  function fcApplyZoomBox(box) {
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
      if (b.nodePosSig !== fcSig(b)) { withoutHistory(getActiveMap(), function() { delete b.nodePos; delete b.nodeSize; delete b.nodePosSig; }); save(true); return; }   // the chart changed shape: fresh layout (a clean-up, not a step)
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
          if ((!w || w === b.boxW) && (!h || h === b.boxH)) return;
          withoutHistory(getActiveMap(), function() {   // a remembered box size is layout, not an undo step
              if (w && w !== b.boxW) b.boxW = w;
              if (h && h !== b.boxH) b.boxH = h;
          });
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
  // The reader (handbook.js) shows a page's flowcharts as the GM arranged them: fit, zoom, sizes and
  // nudges applied from the block, nothing wired (no handles, no dragging, no saving).
  window.wpFcPostProcess = function(root, doc) {
      Array.from(root.querySelectorAll('.fc-box')).forEach(function(box) {
          box._fcDoc = doc;
          var svg = box.querySelector('svg'); var b = fcBlockOf(box); if (!svg || !b) return;
          fcFitViewBox(svg);
          fcApplyZoomBox(box);
          fcApplySizes(svg, b);
          if (b.nodePos && b.nodePosSig === fcSig(b)) Object.keys(b.nodePos).forEach(function(nid) {
              var g = svg.querySelector('g.node[id^="flowchart-' + nid + '-"]'); if (!g) return;
              var p = b.nodePos[nid]; g.setAttribute('transform', 'translate(' + p.x + ', ' + p.y + ')');
              fcRedrawEdges(svg, nid);
          });
          fcFitViewBox(svg);
          fcApplyZoomBox(box);
      });
  };
  /* ---- find in planner ----
     Highlights in the rendered preview only (the editor boxes are left alone). The text is read in
     stretches — the text nodes of one run of inline content, joined — so a word drawn as several
     runs (part of it coloured by the Text style bar) is found whole; each stretch is matched on a
     normalised copy (lower case, accents stripped) with an index map back to the original, so
     "Selkath" is found by "selk" and "Sahrhie" by "sahr". The exact phrase wins; with no phrase
     hit, every word is matched at word starts. */
  // [textcheck:find-start]
  var pfState = { q: '', hits: [], cur: -1 };   // hits: each the list of its <mark>s — a found text may lie across several text nodes (a word styled in part is drawn as runs)
  function pfNorm(s) { return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
  function pfClear() {
      var pv = document.getElementById('plannerPreview'); if (!pv) return;
      pv.querySelectorAll('mark.pf-hit').forEach(function(m) { var p = m.parentNode; while (m.firstChild) p.insertBefore(m.firstChild, m); p.removeChild(m); p.normalize(); });
      pfState.hits = []; pfState.cur = -1;
  }
  // Elements whose text runs on with the text around them, so a found text may cross them: the inline tags the page sanitiser writes, and a
  // span with no class — a run of a styled field (docrender fmtHtml / fmtRich), a text block's colour or size. Anything else — a paragraph, a
  // cell, a heading, a line break, a span with a class of the renderer's (a subtitle, a tag) — ends a stretch.
  var PF_INLINE = { SPAN: 1, B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, A: 1, CODE: 1, FONT: 1, BIG: 1, SMALL: 1, MARK: 1 };
  // The preview's text as stretches: each the text nodes of one run of inline content, in document order (nothing of a script, a style or a drawn chart)
  function pfStretches(root) {
      var out = [], cur = [];
      var end = function() { if (cur.some(function(n) { return n.nodeValue.trim(); })) out.push(cur); cur = []; };
      var walk = function(el) {
          for (var n = el.firstChild; n; n = n.nextSibling) {
              if (n.nodeType === 3) { if (n.nodeValue) cur.push(n); continue; }
              if (n.nodeType !== 1) continue;
              var tag = String(n.nodeName).toUpperCase();
              if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'SVG') continue;
              if (PF_INLINE[tag] && !(tag === 'SPAN' && n.className)) walk(n); else { end(); walk(n); end(); }
          }
      };
      walk(root); end();
      return out;
  }
  // ranges [start,end) in a stretch's joined text for a regex over its normalised form
  function pfRanges(seg, re) {
      var orig = seg.map(function(n) { return n.nodeValue; }).join(''), map = [], norm = '';
      for (var i = 0; i < orig.length; i++) { var ch = orig[i].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); for (var k = 0; k < ch.length; k++) map.push(i); norm += ch; }
      map.push(orig.length);
      var out = [], m; re.lastIndex = 0;
      while ((m = re.exec(norm))) { if (!m[0]) { re.lastIndex++; continue; } out.push([map[m.index], map[m.index + m[0].length - 1] + 1]); }
      return out;
  }
  // Each range gets a <mark> around its part of every text node it lies in; a hit is the list of its marks
  function pfWrap(seg, ranges) {
      var hits = [], starts = [], lens = [], at = 0;
      seg.forEach(function(n) { starts.push(at); lens.push(n.nodeValue.length); at += n.nodeValue.length; });
      for (var i = ranges.length - 1; i >= 0; i--) {   // from the end, and each range's nodes from the last, so earlier offsets stay valid
          var r = ranges[i], marks = [];
          for (var k = seg.length - 1; k >= 0; k--) {
              var a = Math.max(r[0], starts[k]) - starts[k], z = Math.min(r[1], starts[k] + lens[k]) - starts[k];
              if (a >= z) continue;
              var rest = seg[k].splitText(a); rest.splitText(z - a);
              var mk = document.createElement('mark'); mk.className = 'pf-hit'; rest.parentNode.insertBefore(mk, rest); mk.appendChild(rest);
              marks.unshift(mk);
          }
          if (marks.length) hits.unshift(marks);
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
      var find = function(re) { var found = []; pfStretches(pv).forEach(function(seg) { var rs = pfRanges(seg, re); if (rs.length) found = found.concat(pfWrap(seg, rs)); }); return found; };
      var hits = find(new RegExp(pfEsc(q), 'g'));
      if (!hits.length && /\s/.test(q)) hits = find(new RegExp('(?<![a-z0-9])(' + q.split(/\s+/).filter(Boolean).map(pfEsc).join('|') + ')[a-z0-9]*', 'g'));   // no phrase: every word, at word starts
      else if (!hits.length) hits = find(new RegExp('(?<![a-z0-9])(' + pfEsc(q) + ')[a-z0-9]*', 'g'));   // one word: at word starts, any ending
      pfState.hits = hits;
      if (!hits.length) { if (cnt) cnt.textContent = '0'; pfState.cur = -1; return; }
      pfGo(wasCur >= 0 && wasCur < hits.length ? wasCur : 0, true);
  }
  function pfGo(i, quiet) {
      var hits = pfState.hits, cnt = document.getElementById('plannerFindCount'); if (!hits.length) return;
      if (pfState.cur >= 0 && hits[pfState.cur]) hits[pfState.cur].forEach(function(m) { m.classList.remove('pf-cur'); });
      pfState.cur = ((i % hits.length) + hits.length) % hits.length;
      var h = hits[pfState.cur]; h.forEach(function(m) { m.classList.add('pf-cur'); });
      h[0].scrollIntoView({ block: 'center', behavior: quiet ? 'auto' : 'smooth' });
      if (cnt) cnt.textContent = (pfState.cur + 1) + ' / ' + hits.length;
  }
  // [textcheck:find-end]
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
          var am = getActiveMap(); if (!isDocLike(am)) return;
          e.preventDefault(); box.focus(); box.select();
      });
  })();
  window.wpPlannerFind = plannerFindApply;
  // [sinkcheck:planner-preview-start]
  // The planner preview's markup. A planner is the GM's own notes, but a campaign can come in from a file someone else made,
  // and this is where its planners land: titles, node fields and table cells keep their inline formatting through the page
  // sanitiser (docrender sanitizeHtml: a typed <br> or &mdash; reads as before, nothing that runs survives), prose blocks read
  // as a page's do (proseHtml), a diagram's source is cleaned and loses its click directives before mermaid reads it, a
  // picture is the app's own (safecore picRef), and sizes are numbers. Only a Raw HTML block is the GM's HTML as written.
  // A field with a format (textfmt.js) is drawn by docrender fmtRich: the format cleaned against the text first, the WHOLE field through
  // the same sanitiser once — so a typed <b> or &mdash; reads as it does with no format, wherever a run begins — and the runs laid over its
  // text by their offsets, each in a span whose style is written from the cleaned values; with none, as before. (A caption is escaped text: fmtHtml.)
  function plannerPreviewHtml(activeMap, camp) {
      var blocks = Array.isArray(activeMap.blocks) ? activeMap.blocks : [];
      var _pCss = docStyleCss(mergeDocStyle(camp && camp.docStyle, activeMap.meta && activeMap.meta.style));
      var html = '<div class="wrap"' + (_pCss ? ' style="' + _pCss + '"' : '') + '>';
      if (blocks.length === 0) html += '<div style="color:var(--dim); font-style:italic; text-align:center; padding-top: 100px;">This is the live preview pane.<br><br>Add blocks in the editor on the left to start building your document.</div>';
      blocks.forEach(function(b, _bi) {
          if (!b || typeof b !== 'object') return;
          html += '<div class="pv-blk" data-blk="' + _bi + '">';
          if (b.type === 'h1') {
              html += '<h1>' + fmtRich(b.title || '', fieldFmt(b, 'title')) + (b.sub ? '<span class="sub">' + fmtRich(b.sub, fieldFmt(b, 'sub')) + '</span>' : '') + '</h1>';
          } else if (b.type === 'h2') {
              html += '<h2>' + fmtRich(b.title || '', fieldFmt(b, 'title')) + '</h2>';
          } else if (b.type === 'lede') {
              html += '<p class="lede">' + proseHtml(b.content) + '</p>';
          } else if (b.type === 'oneline') {
              html += '<div class="oneline">' + proseHtml(b.content) + '</div>';
          } else if (b.type === 'text') {
              html += proseHtml(b.content, 'text');
          } else if (b.type === 'flare') {
              html += '<div class="flare">' + proseHtml(b.content) + '</div>';
          } else if (b.type === 'callout') {
              html += '<div class="callout">' + proseHtml(b.content) + '</div>';
          } else if (b.type === 'diagram') {
              html += '<div class="diagram"><pre class="mermaid">' + sanitizeHtml(stripMermaidLinks(b.content)) + '</pre></div>';   // mermaid reads the pre's HTML and decodes it: typed source, <br> labels and an import's &lt; all read as before
          } else if (b.type === 'image') {
              var pSrc = picRef(b.src), pW = num(b.width, 0, 0, 100) || 100;
              html += pSrc ? '<figure class="planner-img" style="width:' + pW + '%; margin-left:' + ((b.align || 'center') === 'left' ? '0' : 'auto') + '; margin-right:' + ((b.align || 'center') === 'right' ? '0' : 'auto') + ';"><img src="' + esc(pSrc) + '" alt="' + esc(b.caption || '') + '">' + (b.caption ? '<figcaption>' + fmtHtml(b.caption, fieldFmt(b, 'caption'), esc) + '</figcaption>' : '') + '</figure>' : '';
          } else if (b.type === 'raw') {
              html += (b.content||'');   // the GM's own HTML, as written (an import rebuilds a raw block)
          } else if (b.type === 'node') {
              var plainPv = b.mode === 'table';
              html += '<div class="node' + (plainPv ? ' plain-table' : '') + '">';
              if (!plainPv || b.title) html += '<h3>' + fmtRich(b.title || '', fieldFmt(b, 'title')) + (!plainPv && b.tag ? ' <span class="tag">' + fmtRich(b.tag, fieldFmt(b, 'tag')) + '</span>' : '') + '</h3>';
              if (!plainPv && b.must) html += '<p class="must"><b>Must resolve:</b> ' + fmtRich(b.must, fieldFmt(b, 'must')) + '</p>';
              if (!plainPv && b.linkMapId) {
                  var mapP = camp && camp.items && typeof b.linkMapId === 'string' && Object.prototype.hasOwnProperty.call(camp.items, b.linkMapId) ? camp.items[b.linkMapId] : null;
                  if (mapP && typeof mapP === 'object') {
                      var roomP = b.linkRoomId && Array.isArray(mapP.rooms) ? mapP.rooms.find(function(r) { return r && r.id === b.linkRoomId; }) : null;
                      html += '<p class="pv-linkrow"><a href="#" class="pv-link" data-map="' + esc(b.linkMapId) + '" data-room="' + esc(b.linkRoomId || '') + '" title="Open this map' + (roomP ? ' at ' + esc(roomP.name || '') : '') + '">&#128205; Open ' + esc((mapP.meta && mapP.meta.title) || 'map') + (roomP ? ' · ' + esc(roomP.name || '') : '') + '</a></p>';
                  }
              }
              if (Array.isArray(b.rows) && b.rows.length > 0) {
                  var cols = (Array.isArray(b.cols) && b.cols.length > 0) ? b.cols.slice() : (plainPv ? ['Item', 'Detail', 'Notes'] : ['Action', 'Why', 'Cost', 'Returns via']);
                  html += '<table><thead><tr>' + cols.map(function(c, ci) { return '<th>' + fmtRich(c, colFmtOf(b, ci)) + '</th>'; }).join('') + '</tr></thead><tbody>';
                  b.rows.forEach(function(r, ri) {
                      html += '<tr>' + cols.map(function(c, ci) { return '<td>' + fmtRich((r && r['col' + (ci + 1)]) || '', cellFmtOf(b, ri, ci)) + '</td>'; }).join('') + '</tr>';
                  });
                  html += '</tbody></table>';
              }
              html += '</div>';
          } else if (b.type === 'flowchart') {
              var m = compileFlowchart(b);   // docrender.js: one compiler for planners and pages
              var bw = num(b.boxW, 0), bh = num(b.boxH, 0);
              var boxStyle = (bw ? 'width:' + bw + 'px;' : '') + (bh ? 'height:' + bh + 'px;' : '');
              html += '<div class="diagram fc-box" data-fc="' + _bi + '" style="' + boxStyle + '"><pre class="mermaid">' + esc(stripMermaidLinks(m)) + '</pre></div>';   // as a page renders it: labels are text, mermaid decodes them
          }
          html += '</div>';
      });
      return html + '</div>';
  }
  // [sinkcheck:planner-preview-end]
  function renderPlannerPreview() {
      renderPlannerPreviewCore();
      var box = document.getElementById('plannerFind');
      if (box && box.value.trim()) plannerFindApply(true);   // keep the hits lit through an edit
  }
  function renderPlannerPreviewCore() {

      var activeMap = getActiveMap();

      if (!activeMap || !activeMap.blocks) return;

      var preview = document.getElementById('plannerPreview');
      if (window.wpDocPanel) window.wpDocPanel.refresh();   // a doc popped over the map stays in sync with edits made here (sig-checked)

      if (activeMap.type === 'doc') {   // a page renders through the shared renderer (docrender.js): escaped text, sanitized prose — what a player gets
          preview.innerHTML = renderDoc(activeMap, { mermaid: !!window.mermaid, docStyle: (getActiveCampaign() || {}).docStyle, empty: '<div style="color:var(--dim); font-style:italic; text-align:center; padding-top: 100px;">This is the live preview pane.<br><br>Add blocks in the editor on the left to start building your page.</div>' });
          runPreviewMermaid();
          return;
      }

      preview.innerHTML = plannerPreviewHtml(activeMap, getActiveCampaign());
      runPreviewMermaid();
  }
  function runPreviewMermaid() {
      if (!window.mermaid) return;
      var runMermaid = function(tries) {
          var pane = document.getElementById('plannerPreview');
          if (pane && pane.clientWidth === 0 && tries < 40) { setTimeout(function() { runMermaid(tries + 1); }, 60); return; }   // wait until laid out, else labels measure wrong
          try { Promise.resolve(mermaid.run({ querySelector: '#plannerPreview .mermaid' })).then(fcPostProcess).catch(function() {}); } catch(e) { }
      };
      runMermaid(0);
  }

  

  var _el_renderPlannerBtn = document.getElementById('renderPlannerBtn');

// This planner's own undo / redo (each planner keeps its own stack); mousedown is swallowed so the field
// being edited keeps its focus and caret
var _el_plannerUndoBtn = document.getElementById('plannerUndoBtn'), _el_plannerRedoBtn = document.getElementById('plannerRedoBtn');
if (_el_plannerUndoBtn) { _el_plannerUndoBtn.addEventListener('mousedown', function(e) { e.preventDefault(); }); _el_plannerUndoBtn.addEventListener('click', function() { undo(); }); }
if (_el_plannerRedoBtn) { _el_plannerRedoBtn.addEventListener('mousedown', function(e) { e.preventDefault(); }); _el_plannerRedoBtn.addEventListener('click', function() { redo(); }); }

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
// Appearance: optional font / text color / background color for THIS page or planner (writes
// item.meta.style), plus "use as the campaign default" (camp.docStyle, inherited by every doc + sheet).
var _el_plannerAppearanceBtn = document.getElementById('plannerAppearanceBtn');
if (_el_plannerAppearanceBtn) _el_plannerAppearanceBtn.addEventListener('click', function(e) { e.stopPropagation(); openAppearanceMenu(_el_plannerAppearanceBtn); });
function openAppearanceMenu(anchor) {
    var existing = document.getElementById('docAppearanceMenu'); if (existing) { existing.remove(); return; }   // click again to close
    var item = getActiveMap(); if (!item || !(item.type === 'doc' || item.type === 'planner')) { toast('Open a page or planner first.'); return; }
    var camp = getActiveCampaign(); if (!camp) return;
    var DR = window.wpDocRender || {}, FONTS = DR.DOC_FONTS || {};
    var st = (item.meta && item.meta.style && typeof item.meta.style === 'object') ? item.meta.style : {};
    var cd = (camp.docStyle && typeof camp.docStyle === 'object') ? camp.docStyle : {};
    var kind = item.type === 'doc' ? 'page' : 'planner';
    var stC = cleanDocStyle(st) || {}, cdC = cleanDocStyle(cd) || {};   // what the menu shows is what renders: hex colours, a picture that is the app's own (a file from elsewhere may carry anything)
    var effImg = stC.bgImage || cdC.bgImage || '';   // this page's image, else the campaign default
    var dimVal = (typeof stC.bgDim === 'number') ? stC.bgDim : (typeof cdC.bgDim === 'number') ? cdC.bgDim : 40;
    var fontOpts = '<option value="">Default</option>' + Object.keys(FONTS).map(function(k) { return '<option value="' + k + '"' + (st.font === k ? ' selected' : '') + '>' + k.charAt(0).toUpperCase() + k.slice(1) + '</option>'; }).join('');
    var m = document.createElement('div'); m.id = 'docAppearanceMenu'; m.className = 'doc-appearance-menu';
    m.innerHTML =
        '<div class="dam-head">Appearance &mdash; this ' + kind + '</div>' +
        '<label class="dam-row"><span>Font</span> <select id="damFont">' + fontOpts + '</select></label>' +
        '<label class="dam-row"><span>Text</span> <input type="color" id="damText" value="' + (stC.textColor || cdC.textColor || '#e8e2d0') + '"><button class="dam-clear" data-f="textColor" title="Use the default">&times;</button></label>' +
        '<label class="dam-row"><span>Background</span> <input type="color" id="damBg" value="' + (stC.bgColor || cdC.bgColor || '#181510') + '"><button class="dam-clear" data-f="bgColor" title="Use the default">&times;</button></label>' +
        '<label class="dam-row"><span>Bg image</span> <button id="damBgImg" class="tool ghost" style="flex:1">' + (effImg ? 'Change picture&hellip;' : 'Choose picture&hellip;') + '</button><button class="dam-clear" data-f="bgImage" title="Remove this ' + kind + '&rsquo;s own picture (back to the default)"' + (stC.bgImage ? '' : ' style="visibility:hidden"') + '>&times;</button></label>' +   // × only for the page's OWN picture: an inherited campaign picture can't be removed here (that is Clear default), only re-dimmed
        (effImg ? '<img class="dam-bgthumb" src="' + esc(effImg) + '" alt="">' : '') +
        (effImg ? '<label class="dam-row"><span>Dim</span> <input type="range" id="damDim" min="0" max="90" step="5" value="' + dimVal + '"> <span id="damDimVal" class="dam-dimval">' + dimVal + '%</span></label>' : '') +
        '<div class="dam-actions"><button id="damReset" class="tool ghost">Reset this ' + kind + '</button></div>' +
        '<div class="dam-divider"></div>' +
        '<div class="dam-head">Campaign default &mdash; all pages &amp; sheets</div>' +
        '<div class="dam-actions"><button id="damSetCamp" class="tool ghost">Use this ' + kind + '&rsquo;s look as the default</button> <button id="damClearCamp" class="tool ghost"' + (Object.keys(cd).length ? '' : ' disabled') + '>Clear default</button></div>';
    document.body.appendChild(m);
    var r = anchor.getBoundingClientRect();
    m.style.top = (r.bottom + 5) + 'px';
    m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
    function setField(f, v) { item.meta = item.meta || {}; item.meta.style = item.meta.style || {}; if (v) item.meta.style[f] = v; else delete item.meta.style[f]; if (!Object.keys(item.meta.style).length) delete item.meta.style; save(true); renderPlanner(); }
    function setDim(v) { v = Math.max(0, Math.min(90, Math.round(+v || 0))); item.meta = item.meta || {}; item.meta.style = item.meta.style || {}; item.meta.style.bgDim = v; save(true); renderPlanner(); var lbl = m.querySelector('#damDimVal'); if (lbl) lbl.textContent = v + '%'; }
    m.querySelector('#damFont').addEventListener('change', function() { setField('font', this.value); });
    m.querySelector('#damText').addEventListener('input', function() { setField('textColor', this.value); });
    m.querySelector('#damBg').addEventListener('input', function() { setField('bgColor', this.value); });
    m.querySelector('#damBgImg').addEventListener('click', function() {
        if (!window.wpPickImage) { toast('The image library is not available here.'); return; }
        m.remove();   // the picker modal opens over the popover; it is rebuilt (with the new thumbnail + Dim row) once a picture is chosen
        window.wpPickImage(function(src) {
            if (typeof src !== 'string' || !/^[/]saves[/]images[/]/.test(src)) return;   // a real library path only (not a data URL); matches the portrait picker
            var ok = DR.cleanDocStyle ? DR.cleanDocStyle({ bgImage: src }) : { bgImage: src };
            if (!ok || !ok.bgImage) { toast('That picture’s name can’t be used as a background.'); return; }   // the renderer would drop it silently otherwise
            item.meta = item.meta || {}; item.meta.style = item.meta.style || {};
            item.meta.style.bgImage = ok.bgImage;
            if (typeof item.meta.style.bgDim !== 'number') item.meta.style.bgDim = 40;   // start readable
            save(true); renderPlanner();
            if (!document.getElementById('docAppearanceMenu')) openAppearanceMenu(anchor);   // back to the popover, now showing the thumbnail + Dim
        });
    });
    var _dimInput = m.querySelector('#damDim'); if (_dimInput) _dimInput.addEventListener('input', function() { setDim(this.value); });
    Array.prototype.forEach.call(m.querySelectorAll('.dam-clear'), function(b) { b.addEventListener('click', function() {
        if (b.dataset.f === 'bgImage') { item.meta = item.meta || {}; if (item.meta.style) { delete item.meta.style.bgImage; delete item.meta.style.bgDim; if (!Object.keys(item.meta.style).length) delete item.meta.style; } save(true); renderPlanner(); m.remove(); openAppearanceMenu(anchor); return; }   // rebuild so the thumbnail + Dim row drop
        setField(b.dataset.f, null);
    }); });
    m.querySelector('#damReset').addEventListener('click', function() { if (item.meta) delete item.meta.style; save(true); renderPlanner(); m.remove(); toast('Appearance reset to the campaign default.'); });
    // "Use this page's look": the page's LOOK = its overrides over the current default (a page that only re-dimmed an inherited picture must not wipe the picture)
    m.querySelector('#damSetCamp').addEventListener('click', function() { var s = DR.mergeDocStyle ? DR.mergeDocStyle(camp.docStyle, item.meta && item.meta.style) : (DR.cleanDocStyle ? DR.cleanDocStyle(item.meta && item.meta.style) : (item.meta && item.meta.style)); if (s) camp.docStyle = s; else delete camp.docStyle; save(true); renderPlanner(); if (window.wpSheets && window.wpSheets.renderSheet) window.wpSheets.renderSheet(); m.remove(); toast(camp.docStyle ? 'Campaign default set from this ' + kind + '.' : 'This ' + kind + ' has no look to copy yet.'); });
    m.querySelector('#damClearCamp').addEventListener('click', function() { delete camp.docStyle; save(true); renderPlanner(); if (window.wpSheets && window.wpSheets.renderSheet) window.wpSheets.renderSheet(); m.remove(); toast('Campaign default cleared.'); });
    setTimeout(function() { document.addEventListener('click', function closer(ev) { if (!m.contains(ev.target) && ev.target !== anchor) { m.remove(); document.removeEventListener('click', closer); } }); }, 0);
}
// Handbook page: the "players can read" switch. Off while hosting removes the page from every player
// now (itemGone clears the send baseline too); on again sends it with this save (onLocalSave).
var _el_docPlayersBtn = document.getElementById('docPlayersBtn');
if (_el_docPlayersBtn) _el_docPlayersBtn.addEventListener('click', function() {
    var am = getActiveMap(); if (!am || am.type !== 'doc') return;
    am.meta = am.meta || {};
    var off = am.meta.players !== false;
    if (off) am.meta.players = false; else am.meta.players = true;
    var campD = getActiveCampaign();
    if (off && window.wpNet && window.wpNet.itemGone) window.wpNet.itemGone(campD.id, am.id);
    save(true); updateSidebarNav(); renderPlanner();
    toast(off ? 'GM only — players no longer receive this page.' : 'Players can read this page.');
});
if(_el_renderPlannerBtn) _el_renderPlannerBtn.addEventListener('click', function() {
    plannerFullscreen = !plannerFullscreen;
    var amR = getActiveMap();
    if (isDocLike(amR)) { amR.meta = amR.meta || {}; amR.meta.readerView = plannerFullscreen; save(); }   // remembered per document

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
  // Page layout by hand (pages only): drag a picture in the preview to nudge it (dx / dy), drag its
  // bottom-right corner to resize it (the width snaps to the select's steps). One save at pointerup is
  // one undo step per drag; io.js's capture listener closes any typing chunk at the pointerdown.
  if (_el_plannerPreviewEl) _el_plannerPreviewEl.addEventListener('pointerdown', function(e) {
      if (e.button !== 0) return;
      var am = getActiveMap(); if (!am || am.type !== 'doc') return;
      var fig = e.target.closest && e.target.closest('.doc-img'); if (!fig) return;
      var blk = fig.closest('.pv-blk'); var b = blk && am.blocks[+blk.dataset.blk]; if (!b || b.type !== 'image') return;
      e.preventDefault();
      if (!b.layout || typeof b.layout !== 'object') b.layout = blockLayout(b);
      var r = fig.getBoundingClientRect(), resize = (r.right - e.clientX) < 18 && (r.bottom - e.clientY) < 18;
      var colW = (fig.parentNode.getBoundingClientRect().width || r.width) || 1;   // the column the picture sits in (its .pv-blk)
      var x0 = e.clientX, y0 = e.clientY, dx0 = b.layout.dx || 0, dy0 = b.layout.dy || 0, w0 = b.layout.width || 100, moved = false;
      fig.classList.add('lay-drag');
      var onMove = function(ev) {
          var mx = ev.clientX - x0, my = ev.clientY - y0;
          if (Math.abs(mx) > 2 || Math.abs(my) > 2) moved = true;
          if (resize) {
              var pct = (r.width + mx) / colW * 100, best = LAYOUT_WIDTHS.reduce(function(a, s) { return Math.abs(s - pct) < Math.abs(a - pct) ? s : a; }, 100);
              fig.style.width = best + '%'; fig.dataset.layW = best;
          } else {
              var nx = Math.max(-200, Math.min(200, dx0 + mx)), ny = Math.max(-200, Math.min(200, dy0 + my));
              fig.style.position = 'relative'; fig.style.left = nx + 'px'; fig.style.top = ny + 'px'; fig.dataset.layX = nx; fig.dataset.layY = ny;
          }
      };
      var onUp = function() {
          window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
          fig.classList.remove('lay-drag');
          if (!moved) { renderPlannerPreview(); return; }
          if (resize) b.layout.width = +fig.dataset.layW || w0;
          else { b.layout.dx = Math.round(+fig.dataset.layX || 0); b.layout.dy = Math.round(+fig.dataset.layY || 0); }
          save(true); renderPlanner();
      };
      window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp);
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

      if (activeMap.type === 'doc' && DOC_BLOCKS.indexOf(this.value) < 0) { toast('That block is for planners.'); this.value = ''; return; }   // pages hold player-safe blocks only
      activeMap.blocks.push(this.value === 'table' && activeMap.type !== 'doc' ? { id: 'b_'+uid(), type: 'node', mode: 'table' } : this.value === 'table' ? { id: 'b_'+uid(), type: 'table', cols: ['Item', 'Detail', 'Notes'], rows: [] } : { id: 'b_'+uid(), type: this.value });

      this.value = '';

      save(true);

      renderPlanner();

  });



export {

    renderPlanner,

    renderPlannerPreview,

    RTE_CMDS,

    RTE_SYMS,

    rteSyncBar

};

