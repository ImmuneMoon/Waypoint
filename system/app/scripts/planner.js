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

import { renderDoc, compileFlowchart, DOC_BLOCKS, mergeDocStyle, docStyleCss, cleanDocStyle, sanitizeHtml, proseHtml, stripMermaidLinks, mermaidPre, fmtHtml, fmtRich, fieldFmt, colFmtOf, cellFmtOf, diagramLink } from './docrender.js';

import * as TF from './textfmt.js';

import { num, picRef } from './safecore.js';

import { load, updateUndoBtn, pushHistory, undo, redo, save, download, getBase64Image, rebaseHistory, withoutHistory, fieldUndoChord, boxUndo, stepBoundary, stepFold, stepSel } from './io.js';

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
     A title, a tag, a table cell, a flowchart label are the plain strings they always were. What the bar on a field's box does to one
     is stored next to the value it belongs to, so moving, deleting or re-ordering rows, columns, nodes and arrows can never
     leave a look pointing at another text: block.fmt.{title, sub, tag, must, caption}; a table's heads in colFmt (a list
     parallel to cols, kept in step by the Columns select); a row's cells on the row (row.fmt.col1…); a node's label on the
     node, an arrow's on the arrow. A block with none of these is saved, sent and drawn exactly as before. */
  // [sinkcheck:boxes-start]
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
          var lf = {
              text: function() { return typeof n.text === 'string' ? n.text : ''; },
              fmt: function() { return tsOwn(n, 'fmt') ? n.fmt : undefined; },
              setFmt: function(f) { if (f) n.fmt = f; else delete n.fmt; },
              setText: function(v) { n.text = v; }
          };
          // a NODE's label has the node's own link beside it (the whole node is the link: docrender.js diagramLink); an arrow's has none
          if (d.k === 'node') { lf.link = function() { return tsOwn(n, 'link') ? diagramLink(n.link) : ''; }; lf.setLink = function(v) { if (v) n.link = v; else delete n.link; }; }
          return lf;
      }
      return null;
  }
  // Typing in a field: the text takes the new value and its spans are carried across the edit (textfmt.js respan). caret: where the caret stands
  // in the box after the edit — it tells a run of equal characters where the edit was. inputType: the edit's own kind. The boxes cancel the
  // engine's own undo and redo (a box is drawn by the app, so every Ctrl+Z is the planner's history); should a historyUndo / historyRedo ever
  // arrive all the same, its text is carried with nothing joined. A field that never had a format gets none.
  // What is typed right after a styled part joins it: its colour, bold, italic, underline, strike and size. A LINK does not grow that way —
  // typed at a link's end it takes the rest of that part's look and is not linked; typed inside a link it is linked. That one rule is this
  // constant: set it true and a link grows by typing at its end as everything else does.
  var TS_LINK_GROWS = false;
  // Where an edit was: the old text's [p, oe) became the new text's [p, p + typed) — read exactly as textfmt.js respan reads it (the caret
  // first; never beginning or ending inside a surrogate pair)
  function tsEditAt(oldText, newText, caret) {
      var a = oldText.length, z = newText.length, p = 0, q = 0, hinted = false;
      var pair = function(t, i) { if (i <= 0 || i >= t.length) return false; var x = t.charCodeAt(i - 1), y = t.charCodeAt(i); return x >= 0xd800 && x <= 0xdbff && y >= 0xdc00 && y <= 0xdfff; };
      if (typeof caret === 'number' && isFinite(caret) && Math.floor(caret) === caret && caret >= 0 && caret <= z && z - caret <= a && newText.slice(caret) === oldText.slice(a - (z - caret))) {
          q = z - caret; hinted = true;
          var limP = Math.min(a - q, caret);
          while (p < limP && oldText.charCodeAt(p) === newText.charCodeAt(p)) p++;
          if (pair(oldText, p) || pair(newText, p)) p--;
      }
      if (!hinted) {
          var lim = Math.min(a, z);
          while (p < lim && oldText.charCodeAt(p) === newText.charCodeAt(p)) p++;
          if (pair(oldText, p) || pair(newText, p)) p--;
          while (q < lim - p && oldText.charCodeAt(a - 1 - q) === newText.charCodeAt(z - 1 - q)) q++;
      }
      if (pair(oldText, a - q) || pair(newText, z - q)) q--;
      return { p: p, oe: a - q, typed: z - q - p };
  }
  function tsType(blocks, d, value, caret, inputType) {
      var fld = tsField(blocks, d); if (!fld) return false;
      var old = fld.text(), f = fld.fmt();
      value = String(value == null ? '' : value);
      fld.setText(value);
      if (f === undefined) return true;   // never styled
      var apart = inputType === 'historyUndo' || inputType === 'historyRedo';
      var now = TF.respan(old, value, f, caret, apart);
      if (now && !apart && !TS_LINK_GROWS) {   // a link ends where it ended: what was typed there is not part of it
          var ed = tsEditAt(old, value, caret);
          if (ed.typed > 0 && ed.p > 0) {
              var left = TF.stateAt(f, old, ed.p - 1, ed.p).link, right = ed.p < old.length ? TF.stateAt(f, old, ed.p, ed.p + 1).link : '';
              if (left && left !== right) now = TF.apply(now, value, ed.p, ed.p + ed.typed, { link: null });
          }
      }
      fld.setFmt(now);
      return true;
  }
  // A field's name in a few words (plain text: the bar's own name, for a screen reader)
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

  /* ---- the box: a plain field's editor ----
     Every plain field — a title, a tag, a cell, a caption, a label — is edited in a box that SHOWS its styling: an editable element drawn from
     the field's runs (textfmt.js runsOf), one element per run with a text node inside, all made here with createElement / createTextNode. The
     box is a VIEW of the text and the format beside it and an input device for edits to them: nothing it holds is ever stored. After anything
     the engine did to it (typing, deleting, a composition, a spelling correction) the box is read back as TEXT ONLY, the text goes to tsType
     with the caret as a character offset, and the runs are drawn again; a paste, a drop, a cut, a line break and a symbol never touch the box
     at all — they are worked out on its text. A typed <b> is the five characters it is, in the box as in the data.
     The box's text is what the input it replaces held as its value: a one-line field shows its text without line breaks, a label with its
     line breaks as \n and without the one leading line break a textarea never showed (tsShown), and an edit stores exactly what that input
     would have. A caret and a selection are character offsets into that text, mapped to the drawn nodes and back by tsPointAt and tsScan —
     pure functions over { nodeType, nodeName, nodeValue, childNodes }, so tools/textcheck.js runs them on plain objects. */
  // [textcheck:box-start]
  var TS_BLOCKS = { DIV: 1, P: 1 };   // a block the engine might wrap a line in where the box cannot be plain-text-only: it begins a new line
  var TS_EDIT = (function() { try { var p = document.createElement('div'); p.contentEditable = 'plaintext-only'; return p.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true'; } catch (e) { return 'true'; } })();
  function tsKids(n) { return n && n.childNodes ? n.childNodes : []; }
  // The last node of the tree when it is a line-break element: the one drawn after a final line break so that the last line has a place, or
  // one the engine left in an emptied box. It is no text.
  function tsTail(root) {
      var n = root, k;
      while (n && n.nodeType === 1 && (k = tsKids(n)).length) n = k[k.length - 1];
      return n && n !== root && n.nodeType === 1 && n.nodeName === 'BR' ? n : null;
  }
  // The box read as text, and where a place in it lies — ONE walk, so the two can never disagree. text: every text node's characters in order,
  // a line break for a <br> that is not the tail and for a block that is not first. at: the offset of (node, offset) in that text — a text node
  // and a count of its characters, or an element and a count of its children, as a selection gives them — or -1 when the place is not in the box.
  function tsScan(root, node, offset) {
      var tail = tsTail(root), out = '', at = -1, n0 = typeof offset === 'number' && offset > 0 ? Math.floor(offset) : 0;
      (function go(n) {
          var k = tsKids(n), stop = n === node ? Math.min(k.length, n0) : -1;
          for (var i = 0; i < k.length; i++) {
              if (i === stop && at < 0) at = out.length;
              var c = k[i];
              if (c.nodeType === 3) {
                  var t = c.nodeValue == null ? '' : String(c.nodeValue);
                  if (c === node && at < 0) at = out.length + Math.min(t.length, n0);
                  out += t;
              } else if (c.nodeType === 1) {
                  if (c.nodeName === 'BR') { if (c === node && at < 0) at = out.length; if (c !== tail) out += '\n'; }
                  else { if (TS_BLOCKS[c.nodeName] && out) out += '\n'; go(c); }
              }
          }
          if (stop === k.length && at < 0) at = out.length;
      })(root);
      return { text: out, at: at };
  }
  // A character offset as a place in the drawn nodes: { node, offset }. Between two runs the place is the END OF THE LEFT one — what is typed
  // there joins the part before it (textfmt.js respan), so the caret is drawn inside that part — unless the left run ends with a line break:
  // a line begun after a styled line is not that line's, and the place is the start of the right run. An empty box: the box itself.
  function tsPointAt(root, offset) {
      var tail = tsTail(root), texts = [], at = 0;
      (function go(n) {
          var k = tsKids(n);
          for (var i = 0; i < k.length; i++) {
              var c = k[i];
              if (c.nodeType === 3) { var t = c.nodeValue == null ? '' : String(c.nodeValue); if (t) texts.push({ n: c, a: at, t: t }); at += t.length; }
              else if (c.nodeType === 1) {
                  if (c.nodeName === 'BR') { if (c !== tail) at++; }
                  else { if (TS_BLOCKS[c.nodeName] && at) at++; go(c); }
              }
          }
      })(root);
      if (!texts.length) return { node: root, offset: 0 };
      offset = typeof offset === 'number' && offset > 0 ? Math.min(at, Math.floor(offset)) : 0;
      for (var i = 0; i < texts.length; i++) {
          var x = texts[i], z = x.a + x.t.length;
          if (offset < z) return { node: x.n, offset: Math.max(0, offset - x.a) };
          if (offset === z) {
              var nx = texts[i + 1], c1 = x.t.charCodeAt(x.t.length - 1);
              if (nx && nx.a === z && (c1 === 10 || c1 === 13)) return { node: nx.n, offset: 0 };
              return { node: x.n, offset: x.t.length };
          }
      }
      var last = texts[texts.length - 1];
      return { node: last.n, offset: last.t.length };
  }
  // The text a box shows for a stored text: what the input it replaces held as its value. A one-line input dropped line breaks from its value;
  // a textarea read \r\n and \r as \n and never showed one leading line break; a NUL was the replacement character in both.
  function tsShown(text, multi) {
      text = (typeof text === 'string' ? text : '').replace(/\u0000/g, '\uFFFD');
      if (!multi) return text.replace(/[\r\n]/g, '');
      text = text.replace(/\r\n?/g, '\n');
      return text.charAt(0) === '\n' ? text.slice(1) : text;
  }
  // Text on its way in from outside (a paste, a drop): a label takes its line breaks as \n, a one-line field takes each as a space, as an input did
  function tsIncoming(text, multi) {
      text = String(text == null ? '' : text).replace(/\u0000/g, '');
      return multi ? text.replace(/\r\n?/g, '\n') : text.replace(/\r\n?|\n/g, ' ');
  }
  function tsMulti(d) { return !!d && d.k === 'node'; }   // a flowchart node's label is the one field that takes line breaks
  // A run's look as one string: what its element is drawn with
  function tsSig(r) { return [r.color, r.b === true ? 1 : 0, r.i === true ? 1 : 0, r.u === true ? 1 : 0, r.st === true ? 1 : 0, r.size, r.link].join('|'); }
  // One run as an element: its text in a text node, its look through the element's style from the cleaned values only — a strict colour, fixed
  // words for weight, slant, underline and strike, one of the four size steps. A linked run looks like a link and is none: a span is not
  // followed, and its address is its title.
  function tsRunEl(r) {
      var el = document.createElement('span'), link = typeof r.link === 'string' && !!TF.cleanLink(r.link);
      el.className = link ? 'tsr tsr-link' : 'tsr';
      if (typeof r.color === 'string' && /^#[0-9a-f]{6}$/.test(r.color)) el.style.color = r.color;
      if (r.b === true) el.style.fontWeight = 'bold';
      if (r.i === true) el.style.fontStyle = 'italic';
      if (r.u === true || r.st === true || link) el.style.textDecoration = (r.u === true || link ? 'underline' : '') + ((r.u === true || link) && r.st === true ? ' ' : '') + (r.st === true ? 'line-through' : '');
      if (typeof r.size === 'string' && tsOwn(TF.SIZE_EM, r.size)) el.style.fontSize = TF.SIZE_EM[r.size];
      if (link) el.title = 'Link: ' + TF.cleanLink(r.link);
      el.appendChild(document.createTextNode(String(r.t)));
      el._tsSig = tsSig(r);
      return el;
  }
  // Draw a box from a text and its format. Where the box already holds exactly these runs (the engine typed into a run's own text node) only
  // a text that differs is put right; anything else in it — a node the app did not make, a run too many, a look that changed — and everything
  // is made anew. A label that ends with a line break gets one <br> after its runs (tsTail: it is no text). True when the box was touched.
  function tsDraw(box, shown, fmt, multi) {
      var runs = shown ? TF.runsOf(shown, fmt) : [], kids = tsKids(box), tail = !!multi && /\n$/.test(shown), same = kids.length === runs.length + (tail ? 1 : 0), changed = false, i;
      for (i = 0; same && i < runs.length; i++) { var c = kids[i]; same = c.nodeType === 1 && c._tsSig === tsSig(runs[i]) && tsKids(c).length === 1 && tsKids(c)[0].nodeType === 3; }
      if (same && tail) same = kids[runs.length].nodeType === 1 && kids[runs.length].nodeName === 'BR';
      if (same) {
          for (i = 0; i < runs.length; i++) { var tn = tsKids(kids[i])[0]; if (tn.nodeValue !== runs[i].t) { tn.nodeValue = runs[i].t; changed = true; } }
          return changed;
      }
      var left = box.scrollLeft;   // a one-line box scrolled sideways to its caret stays there (an emptied box would spring back to its start)
      while (box.firstChild) box.removeChild(box.firstChild);
      runs.forEach(function(r) { box.appendChild(tsRunEl(r)); });
      if (tail) box.appendChild(document.createElement('br'));
      if (left) box.scrollLeft = left;
      return true;
  }
  // The box drawn from its own text (box._tsText: its value, as an input had one) and its field's look. Where the stored text is not the text
  // shown (a one-line field from a file that holds line breaks, until it is next edited) the spans are carried onto what is shown first.
  function tsPaint(box, fld, multi) {
      var shown = typeof box._tsText === 'string' ? box._tsText : '', stored = fld.text(), fmt = fld.fmt();
      if (fmt !== undefined && shown !== stored) fmt = TF.respan(stored, shown, fmt, undefined, true);
      return tsDraw(box, shown, fmt, multi);
  }
  // The markup of an EMPTY box (renderPlanner writes the editor as one string): its classes, its place, its placeholder — never the field's
  // text, which tsFill draws. A placeholder is shown by the style sheet while the box holds nothing, and is no part of the text.
  function tsBoxHtml(cls, ph, data, style, multi, extra) {
      return '<div class="' + cls + ' ts-box' + (multi ? ' ts-multi' : '') + '" contenteditable="' + TS_EDIT + '" role="textbox" aria-multiline="' + (multi ? 'true' : 'false') + '" spellcheck="true" data-placeholder="' + esc(ph) + '" aria-label="' + esc(ph) + '" ' + data + (extra ? ' ' + extra : '') + (style ? ' style="' + style + '"' : '') + '></div>';
  }
  // Every box under root drawn from its field (after renderPlanner wrote the editor)
  function tsFill(root, blocks) {
      Array.prototype.forEach.call(root.querySelectorAll('.ts-box'), function(box) {
          var d = tsDesc(box), fld = d ? tsField(blocks, d) : null, multi = tsMulti(d);
          box._tsText = tsShown(fld ? fld.text() : '', multi);
          if (fld) tsPaint(box, fld, multi);
      });
  }
  // The selection inside a box as offsets into its text: { s, e, back } (back: it was made right to left) — null when it is not in the box
  function tsSelOf(box) {
      var gs = window.getSelection ? window.getSelection() : null;
      if (!gs || !gs.rangeCount || !gs.anchorNode || !gs.focusNode || !box.contains(gs.anchorNode) || !box.contains(gs.focusNode)) return null;
      var a = tsScan(box, gs.anchorNode, gs.anchorOffset), f = tsScan(box, gs.focusNode, gs.focusOffset);
      var ao = a.at < 0 ? a.text.length : a.at, fo = f.at < 0 ? f.text.length : f.at;
      return { s: Math.min(ao, fo), e: Math.max(ao, fo), back: fo < ao };
  }
  // …and put there: the characters s to e selected (a caret when they are equal), by the places tsPointAt gives
  function tsSelect(box, s, e, back) {
      var gs = window.getSelection ? window.getSelection() : null; if (!gs || !gs.setBaseAndExtent) return false;
      var n = tsScan(box).text.length;
      s = Math.max(0, Math.min(n, s | 0)); e = Math.max(s, Math.min(n, e | 0));
      var a = tsPointAt(box, back ? e : s), f = s === e ? a : tsPointAt(box, back ? s : e);
      try { gs.setBaseAndExtent(a.node, a.offset, f.node, f.offset); } catch (err) { return false; }
      tsReveal(box);
      return true;
  }
  // A one-line box longer than it is wide scrolls sideways with its caret, as an input does — the engine does that for its own caret, never
  // for a selection the app sets: the end the caret is at is brought into view.
  function tsReveal(box) {
      try {
          var gs = window.getSelection(), r = gs && gs.rangeCount && gs.getRangeAt ? gs.getRangeAt(0).cloneRange() : null; if (!r || !box.getBoundingClientRect) return;
          r.setStart(gs.focusNode, gs.focusOffset); r.collapse(true);
          var c = r.getClientRects()[0], b = box.getBoundingClientRect(); if (!c) return;
          if (c.right > b.right - 6) box.scrollLeft += c.right - b.right + 16;
          else if (c.left < b.left + 6) box.scrollLeft -= b.left - c.left + 16;
      } catch (err) {}
  }
  // [textcheck:box-end]

  /* ---- the bar on the box ----
     ONE bar for the editor. It floats above the box that has the focus (under it where there is no room above, inside the panel sideways) and
     goes away when the focus leaves both the box and the bar; it shifts nothing, follows its box as the panel scrolls, and points at no box
     once the editor is rebuilt (tsRebuilt). Its controls are a text block's, in a text block's look: B, I, U, S, the ink row with Custom and
     Default, Size, Link, Clear and the symbol tray. A press acts on the selected characters, or on the whole field with nothing selected. The
     buttons never take the focus (mousedown is swallowed, as the text blocks' bar does it); the Size list, the custom colour and the Link box
     must, so the box's selection is remembered for them and comes back with the focus. A link is a web address typed into the Link box
     (Enter, or leaving the box, sets it; Escape drops what was typed; an empty box takes the link off). A flowchart label never holds one:
     on a NODE's label the Link box links the whole node — the node's own link, whatever is selected in the label, and its title says so —
     and on an arrow's label it is off and says why. A symbol is text: it goes where typing goes. From the keyboard: Ctrl+B / I / U in a
     box; Alt+F10 goes from the box into its bar, Tab moves along it, a control pressed there keeps the focus (the Size list stepped by its
     arrow keys is one undo step) and Escape — or Enter in the Size list — goes back to the box with its selection as it was. The bar floats
     over whatever is right above its box: Escape in the box puts it away (the box keeps the focus, the keys still work), and a click in the
     box, or Alt+F10, brings it back. Those keys and the undo chord are all a box takes: every other key goes on to the page as an input's
     does (Ctrl+F is Find and Ctrl+K the quick jump from a box too). While a composition is under way (an IME, a dead key, the emoji picker)
     the bar waits — a press, a symbol and the key into the bar do nothing until it ends: the box is the engine's and is not drawn again.
     UNDO, one rule: in a box Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z are always the planner's own history (io.js) — the engine has no undo of a box the
     app draws. Typing is recorded there in steps: a run of typing, or of deleting, in one box is one step until a pause, a move of the caret,
     a switch between typing and deleting, a paste, a drop, a cut, a line break, a symbol, a press of the bar or leaving the box ends it; each
     press is one step. Every step is told the selection before it and after it (stepSel), and an undo or a redo puts the text, its look and
     that selection back. */
  // [textcheck:bar-start]
  var tsState = { box: null, sel: null, els: null, key: false, run: null, linkDone: null, comp: false, pre: null, last: null, tab: false, away: false };   // away: Esc put the bar away while its box keeps the focus; tab: the last key pressed was Tab (a one-line box it lands in has its text selected, as an input has); box: the box the bar is on; sel: its selection { map, d, s, e, back }; key: the bar was last touched by the keyboard; run: the field and selection a run of Size list steps is on; linkDone: the address Enter has just set, or Escape has just dropped (the Link box's own change event then has nothing left to do); comp: a composition is under way; pre: the selection an edit of the engine's is about to act on; last: the last edit { box, kind, s, e }
  var TS_SCOPE = ' — the selected characters, or the whole field with nothing selected';
  var TS_LINK_TITLE = 'Link — a web address (https://…) for the selected characters, or the whole field with nothing selected. Enter sets it, Esc backs out; an empty box takes the link off.';
  var TS_LINK_NODE = 'Links the whole node: a click on the node opens it. Type a web address (https://…) and press Enter; Esc backs out; an empty box takes the link off.';
  var TS_LINK_ARROW = 'An arrow cannot hold a link: in a flowchart a link belongs to a node (the Link box on a node’s label links the whole node).';
  var TS_LINK_NODE_BAD = 'A node’s link is a plain web address: it cannot hold a quote, < or >, %%, &# or a ; after a #.';   // said for an address the link rule keeps but a diagram cannot carry (docrender.js diagramLink)
  var TS_LINK_BAD = 'A link is a web address: it starts with http:// or https:// and holds no spaces.';   // said for an address that is refused — by this bar's Link box and by a text block's
  function tsIsLabel(d) { return !!d && (d.k === 'node' || d.k === 'edge'); }
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
  // the box an event's target lies in (a text node, a run's element, the box itself) — only a box of the editor
  function tsBoxOf(t) {
      var el = t && t.nodeType === 3 ? t.parentNode : t;
      el = el && el.closest ? el.closest('.ts-box') : null;
      return el && el.closest('#plannerBlocks') ? el : null;
  }
  function tsInBar(t) { var E = tsState.els; return !!(E && t && E.root.contains(t)); }
  // Remember what a box holds selected (as the selection moves, and again at every press). A box whose selection cannot be read — the focus
  // is in the bar — keeps what was remembered for it.
  function tsNote(box) {
      var am = tsBlocksOf(), d = am && box ? tsDesc(box) : null; if (!d || !tsField(am.blocks, d)) return false;
      var gs = tsSelOf(box), old = tsState.sel, mine = !!old && old.map === am.id && tsState.box === box;
      if (!gs) { if (mine) return true; var n = (box._tsText || '').length; gs = { s: n, e: n, back: false }; }
      tsState.sel = { map: am.id, d: d, s: gs.s, e: gs.e, back: gs.back };
      return true;
  }
  // The field the bar acts on now: its box's selection as it stands — null when there is none (or the box, or its field, is gone)
  function tsTarget() {
      var am = tsBlocksOf(), box = tsState.box; if (!am || !box) return null;
      if (document.activeElement === box) tsNote(box);
      var sel = tsState.sel;
      if (!sel || sel.map !== am.id || !tsField(am.blocks, sel.d) || tsBox(sel.d) !== box) return null;
      return sel;
  }
  // The focus and the selection back in the box (after a press by the mouse, or from the bar by Escape)
  function tsHold(box, s, e, back) {
      var am = tsBlocksOf(), d = am ? tsDesc(box) : null; if (!d) return false;
      try { if (document.activeElement !== box) box.focus(); } catch (err) {}
      tsState.box = box; tsState.sel = { map: am.id, d: d, s: s, e: e, back: !!back };
      tsSelect(box, s, e, back);
      return true;
  }
  // The bar on a box / off
  function tsShow(box) {
      var E = tsState.els; if (!E || !box) return;
      if (tsState.box !== box) { tsState.sel = null; tsState.run = null; tsState.last = null; tsState.pre = null; tsState.comp = false; }
      tsState.box = box; tsNote(box);
      E.root.hidden = false; tsState.away = false;
      tsRefresh(); tsPlace();
  }
  function tsHide() {
      var E = tsState.els;
      tsState.box = null; tsState.sel = null; tsState.run = null; tsState.last = null; tsState.pre = null; tsState.comp = false; tsState.away = false;
      if (E) { E.root.hidden = true; E.symWrap.classList.remove('open'); }
  }
  // Where the bar goes — pure: the panel and the box as { left, top, right, bottom } on the screen, the bar's width and height. Above the box,
  // or under it when there is no room above inside the panel; from the box's left edge, pushed inside the panel sideways. seen: the box is in
  // the panel's view at all (a bar never floats over a box that has scrolled away).
  // table: the box is a heading or a cell of this table. A bar beside a cell would lie over the row above or the row beneath, so there it
  // sits along the table's top edge (just above the heading row, from the table's left edge) and no cell is covered; once that edge has
  // scrolled out of the panel it stays at the top of the panel's view (edge: 'top'), and only where it would then lie over its own box
  // does it go under the box.
  function tsPlaceAt(panel, box, w, h, table) {
      var gap = 6, pad = 6;
      var seen = box.bottom > panel.top && box.top < panel.bottom && box.right > panel.left && box.left < panel.right;
      var from = table ? table.left : box.left;
      var left = Math.max(panel.left + pad, Math.min(from, panel.right - pad - w));
      if (table) {
          var edge = table.top - gap - h, stuck = panel.top + pad;
          if (edge >= panel.top + 2) return { left: Math.round(left), top: Math.round(edge), below: false, seen: seen, edge: 'table' };
          if (box.top >= stuck + h + gap) return { left: Math.round(left), top: Math.round(stuck), below: false, seen: seen, edge: 'top' };
          return { left: Math.round(left), top: Math.round(box.bottom + gap), below: true, seen: seen };
      }
      var above = box.top - gap - h, below = above < panel.top + 2;
      return { left: Math.round(left), top: Math.round(below ? box.bottom + gap : above), below: below, seen: seen };
  }
  // the table a box is a heading or a cell of (its element), else null
  function tsTableOf(box) { return box && box.matches && box.closest && box.matches('.b-colhead, .r-col') ? box.closest('.b-table') : null; }
  function tsPlace() {
      var E = tsState.els, box = tsState.box; if (!E || !box || E.root.hidden || !box.getBoundingClientRect) return;
      var hr = E.host.getBoundingClientRect(), br = box.getBoundingClientRect();
      var right = hr.left + (E.host.clientLeft || 0) + (E.host.clientWidth || (hr.right - hr.left));   // less the panel's scroll bar
      E.root.style.maxWidth = Math.max(180, Math.round(right - hr.left - 12)) + 'px';
      var tb = tsTableOf(box);
      var at = tsPlaceAt({ left: hr.left, top: hr.top, right: right, bottom: hr.bottom }, br, E.root.offsetWidth || 0, E.root.offsetHeight || 0, tb && tb.getBoundingClientRect ? tb.getBoundingClientRect() : null);
      E.root.style.left = at.left + 'px'; E.root.style.top = at.top + 'px';
      E.root.style.visibility = at.seen ? '' : 'hidden';
      E.root.classList.toggle('ts-below', at.below);
  }
  // What kind of edit this is, for the steps of undo: a run of typing ('ins') or of deleting ('del') in one place folds into one step; every
  // other edit — a paste, a drop, a cut, a line break, a symbol, a correction — is a step of its own ('one')
  function tsKind(inputType) { return inputType === 'insertText' || inputType === 'insertCompositionText' ? 'ins' : /^delete(Content|Word|SoftLine|HardLine|Entire)/.test(inputType) ? 'del' : 'one'; }
  // ONE edit of a box's text on its way to the field — typed (the box read back), or worked out on its text (a paste, a drop, a cut, a line
  // break, a symbol). value: the box's whole text after it; s, e: the selection after it; before: the selection it acted on. The step it
  // belongs to (io.js), the look carried (tsType), both selections noted for undo, the box drawn again, the save. own: the app worked it out,
  // so the selection must be set (the engine's own edit left its caret where it belongs unless the box had to be drawn again).
  function tsCommit(box, value, s, e, inputType, before, own) {
      var am = tsBlocksOf(), d = am ? tsDesc(box) : null, fld = d ? tsField(am.blocks, d) : null; if (!fld) return false;
      var kind = tsKind(inputType), last = tsState.last && tsState.last.box === box ? tsState.last : null;
      if (!before) before = last ? { s: last.s, e: last.e } : { s: s, e: e };
      var cont = kind !== 'one' && !!last && last.kind === kind && before.s === last.s && before.e === last.e;   // the same kind of edit, where the last one left the caret
      if (!cont) stepBoundary(kind === 'one' ? null : box);   // what was typed so far is its own step; a run of typing or deleting opens one
      tsType(am.blocks, d, value, s, inputType);
      box._tsText = value;
      stepSel({ d: d, s: before.s, e: before.e }, { d: d, s: s, e: e });
      tsState.last = { box: box, kind: kind, s: s, e: e };
      tsState.run = null;
      var redrawn = tsPaint(box, fld, tsMulti(d));
      tsState.sel = { map: am.id, d: d, s: s, e: e, back: false };
      if ((own || redrawn) && document.activeElement === box) tsSelect(box, s, e);
      save(d.k === 'caption');
      renderPlannerPreview();
      tsRefresh(); tsPlace();
      return true;
  }
  // The engine edited a box (typing, deleting, a composition's end, a correction): read it back as text and take the edit
  function tsTake(box, inputType) {
      var am = tsBlocksOf(), d = am ? tsDesc(box) : null, fld = d ? tsField(am.blocks, d) : null; if (!fld) return false;
      var multi = tsMulti(d), raw = tsScan(box).text, value = multi ? raw.replace(/\r/g, '\n') : raw.replace(/[\r\n]/g, ' ');   // one character for one: the offsets hold
      var sel = tsSelOf(box), s = sel ? sel.s : value.length, e = sel ? sel.e : value.length, before = tsState.pre;
      tsState.pre = null;
      if (value === box._tsText) {   // nothing of the text changed: only put right what the engine may have left in the box
          if (tsPaint(box, fld, multi) && document.activeElement === box) tsSelect(box, s, e);
          return false;
      }
      return tsCommit(box, value, s, e, inputType, before, false);
  }
  // Text put into a box's text at [s, e) by the app (never by the engine)
  function tsInsertAt(box, text, s, e, inputType) {
      var cur = typeof box._tsText === 'string' ? box._tsText : '';
      s = Math.max(0, Math.min(cur.length, s)); e = Math.max(s, Math.min(cur.length, e));
      var value = cur.slice(0, s) + text + cur.slice(e);
      if (value === cur) return false;
      return tsCommit(box, value, s + text.length, s + text.length, inputType, { s: s, e: e }, true);
  }
  // …at the box's selection (the remembered one while the focus is in the bar; the end with none)
  function tsInsert(box, text, inputType) {
      var sel = document.activeElement === box ? tsSelOf(box) : null, rem = tsState.box === box ? tsState.sel : null, n = (box._tsText || '').length;
      if (!sel) sel = rem ? { s: rem.s, e: rem.e } : { s: n, e: n };
      return tsInsertAt(box, tsIncoming(text, tsMulti(tsDesc(box))), sel.s, sel.e, inputType);
  }
  // Before the engine edits a box. What it would do to the box that the app does itself — a line break, a paste, a drop, its own undo and
  // redo, its own bold — is cancelled here; a one-line field takes no line break at all.
  function tsBefore(e) {
      var box = tsBoxOf(e.target); if (!box) return;
      var it = String(e.inputType || '');
      if (tsState.comp) return;   // a composition is the engine's until it ends
      tsState.pre = tsSelOf(box);
      if (it === 'historyUndo' || it === 'historyRedo') { e.preventDefault(); boxUndo(it === 'historyUndo' ? 'undo' : 'redo'); return; }   // the browser's undo stack is one per document: a Ctrl+Z left to it in another field can land here
      if (it === 'insertParagraph' || it === 'insertLineBreak') { e.preventDefault(); if (tsMulti(tsDesc(box))) tsInsert(box, '\n', it); return; }
      if (/^insertFrom/.test(it) || it === 'insertLink') {   // a paste or a drop the paste and drop events did not see: plain text, through the box's text
          e.preventDefault();
          var dt = e.dataTransfer, t = dt && dt.getData ? dt.getData('text/plain') : (typeof e.data === 'string' ? e.data : '');
          if (t) tsInsert(box, t, it);
          return;
      }
      if (/^format/.test(it)) e.preventDefault();   // the engine's own bold, italic and the rest: the bar's presses are the only styling
  }
  function tsInput(e) {
      var box = tsBoxOf(e.target); if (!box || tsState.comp) return;   // never between a composition's start and its end
      tsTake(box, String(e.inputType || ''));
  }
  function tsCompStart(e) { var box = tsBoxOf(e.target); if (!box) return; tsState.comp = true; tsState.pre = tsSelOf(box); }
  function tsCompEnd(e) { var box = tsBoxOf(e.target); if (!box) return; tsState.comp = false; tsTake(box, 'insertCompositionText'); }   // applied once, at its end
  function tsPaste(e) {
      var box = tsBoxOf(e.target); if (!box) return;
      e.preventDefault();
      var cd = e.clipboardData || window.clipboardData, t = cd && cd.getData ? cd.getData('text/plain') : '';
      if (t) tsInsert(box, t, 'insertFromPaste');
  }
  // Copy and cut give plain text: the selected characters of the box's text
  function tsCopy(e) {
      var box = tsBoxOf(e.target); if (!box) return;
      var sel = tsSelOf(box), cd = e.clipboardData; if (!sel || sel.s === sel.e || !cd || !cd.setData) return;
      e.preventDefault();
      cd.setData('text/plain', (box._tsText || '').slice(sel.s, sel.e));
      if (e.type === 'cut') tsInsertAt(box, '', sel.s, sel.e, 'deleteByCut');
  }
  function tsDrop(e) {
      var box = tsBoxOf(e.target); if (!box) return;
      e.preventDefault();
      var dt = e.dataTransfer, t = dt && dt.getData ? dt.getData('text/plain') : ''; if (!t) return;
      var at = -1;
      try { var r = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null; if (r && box.contains(r.startContainer)) at = tsScan(box, r.startContainer, r.startOffset).at; } catch (err) {}
      if (at < 0) at = (box._tsText || '').length;
      try { box.focus(); } catch (err) {}
      tsInsertAt(box, tsIncoming(t, tsMulti(tsDesc(box))), at, at, 'insertFromDrop');
  }
  function tsDragStart(e) { if (tsBoxOf(e.target)) e.preventDefault(); }   // a box's text is not dragged about: it is selected, cut and pasted
  // A key in a box. The box takes three things: Alt+F10 goes into the bar; Escape puts the bar away while it is up (the next Escape goes
  // on); Ctrl+Z / Ctrl+Y are the planner's history (io.js fieldUndoChord stops the chord it takes). Every other key goes on to the page as
  // an input's does — Ctrl+F is Find and Ctrl+K the quick jump from a box too; the page's own handlers tell typing by the element.
  function tsBoxKey(e) {
      var box = tsBoxOf(e.target); if (!box) return;
      if (e.key === 'F10' && e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); e.stopPropagation(); tsToBar(box); return; }
      if (e.key === 'Escape' && tsState.box === box && tsState.els && !tsState.els.root.hidden) {   // the bar out of the way; the box keeps the focus
          tsState.away = true; tsState.els.root.hidden = true; tsState.els.symWrap.classList.remove('open');
          e.stopPropagation();
          return;
      }
      fieldUndoChord(e);
  }
  // From the box into its bar, by the keyboard
  function tsToBar(box) {
      var E = tsState.els; if (!E || tsState.comp) return false;   // never out of a box in the middle of a composition
      tsNote(box);
      if (tsState.box !== box || E.root.hidden) tsShow(box);
      var first = tsOrder()[0]; if (!first) return false;
      tsState.key = true;
      try { first.focus(); } catch (err) {}
      return true;
  }
  // the bar's controls the keyboard can stand on, in order (the symbols while their tray is open)
  function tsOrder() {
      var E = tsState.els; if (!E) return [];
      var list = [E.b, E.i, E.u, E.s].concat(E.swatches, [E.custom, E.nocolor, E.size, E.link, E.clear, E.symBtn]);
      if (E.symWrap.classList.contains('open')) list = list.concat(E.symList);
      return list.filter(function(c) { return !c.disabled; });
  }
  // One press of a control. change: { b: true } | { i: true } | { u: true } | { st: true } | { color: '#rrggbb' | null } | { size: key | null } | { link: address | null } | 'clear'. True when something changed.
  // from: the bar's control the press came from. One the keyboard reached and holds keeps the focus; after any other press the box has it.
  function tsPress(change, from) {
      if (tsState.comp) return false;   // a composition is under way: the box holds text the store does not have yet and must not be drawn again — the press waits for its end
      var am = tsBlocksOf(), sel = tsTarget(), box = tsState.box;
      if (!am || !sel) { tsState.run = null; tsRefresh(); return false; }
      var fld = tsField(am.blocks, sel.d), text = fld.text(), was = fld.fmt();
      // a flowchart label never holds a link: on a node's label a link is the WHOLE NODE's (its own link, by the diagram's rule), whatever is selected; an arrow carries none
      var whole = change !== 'clear' && tsOwn(change, 'link') && tsIsLabel(sel.d);
      if (whole && !fld.setLink) { tsRefresh(); return false; }
      var now = whole ? (change.link ? diagramLink(change.link) : '') : change === 'clear' ? TF.clear(was, text, sel.s, sel.e) : TF.apply(was, text, sel.s, sel.e, change);
      if (whole && change.link && !now) { tsRefresh(); return false; }   // an address a diagram cannot carry: nothing changes (tsLink says so in words)
      if (whole ? now === fld.link() : JSON.stringify(now) === JSON.stringify(TF.cleanFmt(was, text))) { tsRefresh(); return false; }   // nothing to change: no step
      var kept = !!(from && tsState.key && document.activeElement === from);   // the keyboard is on this control: it keeps the focus
      var left = !!(from && from === tsState.els.link && document.activeElement !== from);   // the link box was left for somewhere else (its change came as it lost the focus): the focus stays where it went
      var runOn = kept && from === tsState.els.size ? JSON.stringify([sel.d, sel.s, sel.e]) : null;
      if (runOn && tsState.run === runOn) stepFold();   // the Size list stepped through by its arrow keys: every size on the way is applied, the run of them is one undo step (io.js)
      else stepBoundary();   // typing still on its way is its own step; this press is one step of its own
      tsState.run = runOn;
      tsState.last = null;   // what is typed next is a step of its own
      if (whole) fld.setLink(now); else fld.setFmt(now);
      stepSel({ d: sel.d, s: sel.s, e: sel.e }, { d: sel.d, s: sel.s, e: sel.e });   // an undo of the press, and its redo, leave the same characters selected
      save(true);
      renderPlannerPreview();
      tsPaint(box, fld, tsMulti(sel.d));   // only this box is drawn again
      if (!left && !kept) tsHold(box, sel.s, sel.e, sel.back);   // the selection stays where it was, so the next press needs no second selecting
      if (now && now.spans && now.spans.length >= TF.MAX_SPANS) toast('This field now holds the most styled parts it can (' + TF.MAX_SPANS + ').');
      tsRefresh(); tsPlace();
      return true;
  }
  // The link box's address onto the field. What a typed address becomes is textfmt.js typedLink's to say — a text block's Link control reads it
  // there too: one typed without its scheme ("example.com/page") is taken as https://, one with a port too ("example.com:8080/page",
  // "localhost:3000"); an empty box takes the link off; anything that is still no link (textfmt.js cleanLink: the page sanitiser's rule — so
  // whatever begins with another scheme) is refused in words and changes nothing ('bad').
  function tsLink() {
      var E = tsState.els, v = TF.typedLink(E.link.value);
      if (v === null) { toast(TS_LINK_BAD); return 'bad'; }
      if (v && tsState.sel && tsState.sel.d && tsState.sel.d.k === 'node' && !diagramLink(v)) { toast(TS_LINK_NODE_BAD); return 'bad'; }   // a node's link: the diagram's rule
      return tsPress({ link: v || null }, E.link);
  }
  // The tray opens under its button and to its right; where that would leave the panel it opens to the left, and near the bottom of the window upward
  function tsTray() {
      var E = tsState.els; if (!E || !E.symWrap.getBoundingClientRect) return;
      var w = E.symWrap.getBoundingClientRect(), h = E.host.getBoundingClientRect(), tw = E.syms.offsetWidth || 264, th = E.syms.offsetHeight || 0;
      var toLeft = w.left + tw > h.right - 4, up = w.bottom + th + 8 > (window.innerHeight || 1e9);
      E.syms.style.left = toLeft ? 'auto' : '0'; E.syms.style.right = toLeft ? '0' : 'auto';
      E.syms.style.top = up ? 'auto' : '100%'; E.syms.style.bottom = up ? '100%' : 'auto';
      E.syms.style.marginTop = up ? '0' : '4px'; E.syms.style.marginBottom = up ? '4px' : '0';
  }
  // A symbol from the tray: text, typed at the caret (over a selection), through the same path as typing
  function tsSymbol(ch, from) {
      if (tsState.comp) return false;   // as a press: not while a composition is under way
      var sel = tsTarget(), box = tsState.box; if (!sel || !box || typeof ch !== 'string' || !ch) return false;
      var kept = !!(from && tsState.key && document.activeElement === from);
      var did = tsInsertAt(box, ch, sel.s, sel.e, 'insertSymbol');
      if (!kept) { tsState.els.symWrap.classList.remove('open'); var at = tsState.sel ? tsState.sel.s : 0; tsHold(box, at, at, false); }
      return did;
  }
  // The editor was rebuilt (a row, a block, a node or an arrow added, deleted or moved; undo, redo; another document): every box is new and
  // a place is an index that may now name another text — so the bar is on no box and remembers nothing. (A box given the focus again, as an
  // undo does, takes the bar afresh.)
  function tsRebuilt() { tsHide(); }
  // Back from the bar to its box, the selection as it was. False when there is none.
  function tsBack() {
      var am = tsBlocksOf(), sel = tsState.sel, box = tsState.box;
      if (!am || !sel || !box || sel.map !== am.id || !tsField(am.blocks, sel.d) || tsBox(sel.d) !== box) return false;
      return tsHold(box, sel.s, sel.e, sel.back);
  }
  // The link a caret is INSIDE: the address what is typed there would be linked to — the link of the character before the caret (typing
  // joins the part on its left) when the character after it is in the same link. At a link's end what is typed is not linked (the one rule,
  // TS_LINK_GROWS: with it true the character before is enough), and neither is anything typed before a link's first character.
  function tsLinkAt(fld, at) {
      var text = fld.text(), f = fld.fmt(); if (f === undefined || !text || !(at > 0)) return '';
      var left = TF.stateAt(f, text, at - 1, at).link;
      if (typeof left !== 'string' || !left) return '';
      if (TS_LINK_GROWS) return left;
      return at < text.length && TF.stateAt(f, text, at, at + 1).link === left ? left : '';
  }
  // The bar as it stands: what it acts on, which controls are lit, which cannot apply
  function tsRefresh() {
      var E = tsState.els; if (!E) return;
      var am = tsBlocksOf(), sel = tsState.sel, fld = am && sel && tsState.box && sel.map === am.id ? tsField(am.blocks, sel.d) : null, st = null, n = 0;
      if (fld) { st = TF.stateAt(fld.fmt(), fld.text(), sel.s, sel.e); n = Math.abs(sel.e - sel.s); }
      var off = !fld;
      E.root.setAttribute('aria-label', fld ? 'Text style — ' + tsName(am.blocks, sel.d) : 'Text style');
      E.scope.textContent = off ? '' : n ? n + ' selected' : 'Whole field';
      E.scope.title = off ? '' : n ? 'The controls act on the ' + n + ' selected character' + (n === 1 ? '' : 's') + '.' : 'Nothing is selected: the controls act on the whole field.';
      E.b.disabled = E.i.disabled = E.u.disabled = E.s.disabled = off;
      E.b.classList.toggle('on', !!(st && st.b)); E.i.classList.toggle('on', !!(st && st.i)); E.u.classList.toggle('on', !!(st && st.u)); E.s.classList.toggle('on', !!(st && st.st));
      E.swatches.forEach(function(sw) { sw.disabled = off; sw.classList.toggle('active', !!(st && st.color === sw.dataset.color)); });
      E.custom.disabled = off;
      E.customWrap.classList.toggle('active', !!(st && st.color && !E.swatches.some(function(sw) { return sw.dataset.color === st.color; })));
      E.customWrap.classList.toggle('off', off);
      E.nocolor.disabled = off;
      E.size.disabled = off;
      var mixed = !!st && st.size === null;   // the range holds more than one size: the list says so (a word it shows, never one to pick)
      E.sizeMixed.hidden = !mixed;
      E.size.value = mixed ? 'mixed' : st && st.size ? st.size : '';
      var label = !!fld && tsIsLabel(sel.d), node = label && !!fld.setLink, nodeAt = node ? fld.link() : '', here = fld && !n && !label ? tsLinkAt(fld, sel.s) : '';
      E.link.disabled = off || (label && !node);   // on a node's label the box links the whole node; on an arrow's it is off
      E.linkLab.classList.toggle('off', E.link.disabled);
      E.linkLab.title = node ? TS_LINK_NODE + (nodeAt ? ' This node leads to ' + nodeAt : '') : label ? TS_LINK_ARROW : here ? TS_LINK_TITLE + ' The part at the caret links to ' + here : TS_LINK_TITLE;
      if (document.activeElement !== E.link) {   // never over what is being typed
          E.link.value = node ? nodeAt : st && st.link && !E.link.disabled ? st.link : '';
          E.link.placeholder = E.link.disabled || node ? 'https://…' : here && !(st && st.link) ? 'here: ' + here : st && st.link === null ? 'several links' : 'https://…';
      }
      E.clear.disabled = off || !st.any;
      E.symBtn.disabled = off;
  }
  // Build the bar (elements, text nodes and values only) inside the editor panel and wire its controls. host: the panel that scrolls
  // (#plannerEditorWrap); syms: the symbol tray's [character, name] list (the text blocks' own).
  function tsBuild(host, syms) {
      if (!host || tsState.els) return;
      var mk = function(tag, cls, text, title) { var el = document.createElement(tag); if (cls) el.className = cls; if (text) el.textContent = text; if (title) el.title = title; return el; };
      var root = mk('div', 'ts-bar'); root.id = 'tsBar'; root.hidden = true; root.setAttribute('role', 'toolbar'); root.setAttribute('aria-label', 'Text style');
      var E = { root: root, host: host };
      var btn = function(key, tag, text, title) { var b = mk('button', 'rte-btn', '', title); b.type = 'button'; b.tabIndex = -1; b.dataset.ts = key; b.appendChild(mk(tag, '', text)); root.appendChild(b); return b; };
      E.b = btn('b', 'b', 'B', 'Bold (Ctrl+B)' + TS_SCOPE);
      E.i = btn('i', 'i', 'I', 'Italic (Ctrl+I)' + TS_SCOPE);
      E.u = btn('u', 'u', 'U', 'Underline (Ctrl+U)' + TS_SCOPE);
      E.s = btn('st', 's', 'S', 'Strike through' + TS_SCOPE);
      root.appendChild(mk('span', 'rte-sep'));
      E.swatches = TF.PALETTE.map(function(p) { var sw = mk('button', 'rte-sw', '', p[1] + TS_SCOPE); sw.type = 'button'; sw.tabIndex = -1; sw.dataset.color = p[0]; sw.style.background = p[0]; root.appendChild(sw); return sw; });
      E.customWrap = mk('label', 'rte-sw rte-custom ts-custom', '', 'Custom colour' + TS_SCOPE);
      E.custom = mk('input', 'rte-colorpick'); E.custom.type = 'color'; E.custom.value = '#d9534f'; E.custom.tabIndex = -1;
      E.customWrap.appendChild(E.custom); root.appendChild(E.customWrap);
      E.nocolor = mk('button', 'rte-btn rte-nocolor', 'Default', 'The default colour' + TS_SCOPE); E.nocolor.type = 'button'; E.nocolor.tabIndex = -1; E.nocolor.dataset.ts = 'nocolor';
      root.appendChild(E.nocolor); root.appendChild(mk('span', 'rte-sep'));
      var sizeLab = mk('label', 'ts-sizelab', 'Size ', 'Size' + TS_SCOPE);
      E.size = mk('select', 'rte-size'); E.size.tabIndex = -1;
      [['', 'Default']].concat(TF.SIZES.map(function(k) { return [k, TF.SIZE_NAMES[k] || k]; })).forEach(function(o) { var op = mk('option', '', o[1]); op.value = o[0]; E.size.appendChild(op); });
      E.sizeMixed = mk('option', '', 'Mixed'); E.sizeMixed.value = 'mixed'; E.sizeMixed.disabled = true; E.sizeMixed.hidden = true; E.size.appendChild(E.sizeMixed);   // shown, never picked: the range holds more than one size
      sizeLab.appendChild(E.size); root.appendChild(sizeLab); root.appendChild(mk('span', 'rte-sep'));
      E.linkLab = mk('label', 'ts-linklab', 'Link ', TS_LINK_TITLE);
      E.link = mk('input', 'ts-link'); E.link.type = 'text'; E.link.tabIndex = -1; E.link.placeholder = 'https://…'; E.link.setAttribute('spellcheck', 'false'); E.link.setAttribute('autocomplete', 'off'); E.link.setAttribute('aria-label', 'Link address');
      E.linkLab.appendChild(E.link); root.appendChild(E.linkLab); root.appendChild(mk('span', 'rte-sep'));
      E.clear = mk('button', 'rte-btn', 'Tₓ', 'Clear — take the styling off: the selected characters, or the whole field with nothing selected'); E.clear.type = 'button'; E.clear.tabIndex = -1; E.clear.dataset.ts = 'clear';
      root.appendChild(E.clear); root.appendChild(mk('span', 'rte-sep'));
      E.symWrap = mk('span', 'rte-symwrap');
      E.symBtn = mk('button', 'rte-btn rte-symbtn', 'Ω', 'Insert a symbol at the caret — arrows, dashes, ellipsis, bullets, maths, checks, quotes'); E.symBtn.type = 'button'; E.symBtn.tabIndex = -1;
      E.syms = mk('div', 'rte-syms');
      E.symList = (Array.isArray(syms) ? syms : []).map(function(s) { var b = mk('button', 'rte-sym', String(s[0]), String(s[1])); b.type = 'button'; b.tabIndex = -1; b.dataset.sym = String(s[0]); E.syms.appendChild(b); return b; });
      E.symWrap.appendChild(E.symBtn); E.symWrap.appendChild(E.syms); root.appendChild(E.symWrap);
      E.scope = mk('span', 'ts-scope'); root.appendChild(E.scope);
      host.appendChild(root);
      tsState.els = E;
      // the buttons never take the focus: the box keeps its selection. The size list, the colour picker and the link box must take it; the press then acts on what was remembered
      root.addEventListener('mousedown', function(e) { tsState.key = false; var t = e.target; if (t === E.size || t === E.custom || t === E.link || (t && t.tagName === 'OPTION')) { tsTarget(); return; } e.preventDefault(); });
      // the keyboard in the bar: Tab and Shift+Tab move along it; a control pressed from it keeps the focus (tsPress); Escape — and Enter in the
      // Size list — goes back to the box; Enter in the link box sets the link and goes back; Escape there backs out: the box takes the focus, the
      // link box loses it with what was typed still in it, and its change event — which would set that — is told there is nothing left to do (linkDone)
      root.addEventListener('keydown', function(e) {
          tsState.key = true;
          if (e.key === 'Tab') { var list = tsOrder(), at = list.indexOf(e.target), nx = list.length ? list[(at + (e.shiftKey ? list.length - 1 : 1) + list.length) % list.length] : null; e.preventDefault(); e.stopPropagation(); if (nx) { try { nx.focus(); } catch (err) {} } return; }
          if (e.key === 'Enter' && e.target === E.link) { e.preventDefault(); e.stopPropagation(); tsState.linkDone = E.link.value; if (tsLink() !== 'bad') tsBack(); return; }
          if (e.key === 'Escape' && e.target === E.link) tsState.linkDone = E.link.value;
          if ((e.key === 'Escape' || (e.key === 'Enter' && e.target === E.size)) && tsBack()) { e.preventDefault(); e.stopPropagation(); }
      });
      root.addEventListener('click', function(e) {
          var t = e.target, btn = t && t.closest ? t.closest('button') : null; if (!btn || btn.disabled) return;
          if (btn.dataset.sym) tsSymbol(btn.dataset.sym, btn);
          else if (btn === E.symBtn) { if (E.symWrap.classList.toggle('open')) tsTray(); }
          else if (btn.dataset.color) tsPress({ color: btn.dataset.color }, btn);
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
      tsRefresh();
  }
  // Ctrl+B / Ctrl+I / Ctrl+U in a box do what the buttons do (seen in the capture phase, before any handler of the page's)
  function tsKey(e) {
      tsState.tab = e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return false;
      var k = String(e.key || '').toLowerCase(); if (k !== 'b' && k !== 'i' && k !== 'u') return false;
      var box = tsBoxOf(e.target); if (!box) return false;
      e.preventDefault(); e.stopPropagation();
      if (tsState.box !== box && !tsState.comp) tsShow(box);
      tsPress(k === 'b' ? { b: true } : k === 'i' ? { i: true } : { u: true });   // (nothing while a composition is under way: the key is still taken)
      return true;
  }
  // The focus came to rest somewhere: on a box (its bar comes up), in the bar (it stays), anywhere else (it goes)
  function tsFocusNow() {
      var a = document.activeElement, box = a ? tsBoxOf(a) : null;
      if (box && box === a) { if (tsState.box !== box || (tsState.els && tsState.els.root.hidden && !tsState.away)) tsShow(box); return; }
      if (tsInBar(a)) return;
      if (tsState.box) tsHide();
  }
  // Wire the editor's boxes — once, on the element that holds them (it outlives every rebuild of the editor) — and the page's part
  function tsWire(root, host) {
      if (!root) return;
      root.addEventListener('beforeinput', tsBefore);
      root.addEventListener('input', tsInput);
      root.addEventListener('compositionstart', tsCompStart);
      root.addEventListener('compositionend', tsCompEnd);
      root.addEventListener('paste', tsPaste);
      root.addEventListener('copy', tsCopy);
      root.addEventListener('cut', tsCopy);
      root.addEventListener('drop', tsDrop);
      root.addEventListener('dragstart', tsDragStart);
      root.addEventListener('keydown', tsBoxKey);
      root.addEventListener('mousedown', function(e) { var box = tsBoxOf(e.target); if (box && box === tsState.box && tsState.away) tsShow(box); });   // a click in the box brings a bar that was put away back
      document.addEventListener('keydown', tsKey, true);
      document.addEventListener('mousedown', function() { tsState.tab = false; }, true);
      document.addEventListener('focusin', function(e) {
          var box = tsBoxOf(e.target);
          if (!(box && box === e.target)) { if (!tsInBar(e.target)) tsHide(); return; }
          tsShow(box);
          if (tsState.tab && !tsMulti(tsDesc(box))) { var n = (box._tsText || '').length; if (n) tsHold(box, 0, n, false); tsRefresh(); }   // reached by Tab: all of a one-line box is selected (a label, like a textarea, is not)
          tsState.tab = false;
      }, true);
      document.addEventListener('focusout', function(e) {
          var box = tsBoxOf(e.target); if (box && box === e.target) { try { box.scrollLeft = 0; } catch (err) {} }   // a one-line box left: it shows its start again, as an input does
          if (box || tsInBar(e.target)) setTimeout(tsFocusNow, 0);
      }, true);
      document.addEventListener('selectionchange', function() { var a = document.activeElement; if (a && a === tsState.box && !tsState.comp && tsNote(a)) tsRefresh(); });
      if (host) host.addEventListener('scroll', tsPlace, true);
      window.addEventListener('resize', tsPlace);
  }
  // For the planner's undo (io.js): the selection of a box, and a selection put back where a step noted it
  window.wpTextBox = {
      selOf: function(box) { var s = box && box.classList && box.classList.contains('ts-box') ? tsSelOf(box) : null; return s ? { s: s.s, e: s.e } : null; },
      select: function(box, s, e) { return !!box && tsSelect(box, s, e); },
      restore: function(sel) {
          var am = tsBlocksOf(); if (!am || !sel || typeof sel !== 'object' || !sel.d || !tsField(am.blocks, sel.d)) return false;
          var box = tsBox(sel.d); if (!box) return false;
          try { box.focus({ preventScroll: true }); } catch (e) { return false; }
          var s = typeof sel.s === 'number' ? sel.s : 0, e2 = typeof sel.e === 'number' ? sel.e : s;
          tsHold(box, s, e2, false);
          var n = (box._tsText || '').length; tsState.sel.s = Math.max(0, Math.min(n, tsState.sel.s)); tsState.sel.e = Math.max(tsState.sel.s, Math.min(n, tsState.sel.e));
          try { if (box.scrollIntoView) box.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
          tsRefresh(); tsPlace();
          return true;
      }
  };
  // [textcheck:bar-end]
  // [sinkcheck:boxes-end]

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

              html += tsBoxHtml('field b-title', 'Title', 'data-idx="'+idx+'"', 'margin-bottom:6px; width:100%;');

              html += tsBoxHtml('field b-sub', 'Subtitle', 'data-idx="'+idx+'"', 'width:100%;');

          } else if (b.type === 'h2' || b.type === 'h3') {

              html += tsBoxHtml('field b-title', b.type === 'h3' ? 'Sub-heading' : 'Section Header', 'data-idx="'+idx+'"', 'width:100%;');
              if (isDocEd && b.type === 'h2') html += '<div class="fc-opts" style="margin-top:6px;"><label title="Everything under this section, up to the next section or title, flows in this many columns">Columns <select class="b-h2cols" data-idx="'+idx+'">' + [1, 2, 3].map(function(n) { return '<option value="' + n + '"' + (secCols === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label></div>';

          } else if (b.type === 'oneline' || b.type === 'lede' || b.type === 'text' || b.type === 'callout' || b.type === 'flare') {

              html += rteHtml(idx, b);

          } else if (b.type === 'image') {
              html += '<div class="b-img-row"><div class="b-img-thumb">' + (picRef(b.src) ? '<img src="' + esc(picRef(b.src)) + '" alt="">' : '<span>No picture yet</span>') + '</div>'
                    + '<div class="b-img-ctl"><div class="fc-opts"><button class="tool ghost b-img-pick" data-idx="' + idx + '" title="Pick a picture already in this campaign">Choose from library…</button>'
                    + '<label class="tool ghost b-img-uplabel" title="Upload a picture from your computer">Upload…<input type="file" accept="image/*" class="b-img-upload" data-idx="' + idx + '" style="display:none;"></label>'
                    + (isDocEd ? '' : '<label>Width <select class="b-imgw" data-idx="' + idx + '">' + [25, 33, 50, 66, 75, 100].map(function(w) { return '<option value="' + w + '"' + ((b.width || 100) === w ? ' selected' : '') + '>' + w + '%</option>'; }).join('') + '</select></label>'
                    + '<label>Align <select class="b-imga" data-idx="' + idx + '">' + [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']].map(function(o) { return '<option value="' + o[0] + '"' + ((b.align || 'center') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>') + '</div>'
                    + tsBoxHtml('field b-caption', 'Caption (optional)', 'data-idx="' + idx + '"', 'width:100%; margin-top:6px;') + '</div></div>';
          } else if (b.type === 'raw') {

              html += '<textarea class="field b-content" placeholder="Raw HTML..." data-idx="'+idx+'" style="width:100%; height:120px; font-family:monospace;">'+esc(b.content||'')+'</textarea>';

          } else if (b.type === 'rule') {
              html += '<div style="color:var(--dim); font-size:12px;">A horizontal line across the page. Nothing to edit; move or delete it with the buttons above.</div>';
          } else if (b.type === 'diagram') {

              html += '<textarea class="field b-content" placeholder="Mermaid flowchart code..." data-idx="'+idx+'" style="width:100%; height:150px; font-family:monospace;">'+esc(b.content||'')+'</textarea>';

          } else if (b.type === 'node' || b.type === 'table') {
              var plain = b.mode === 'table' || b.type === 'table';   // a page's table block is the node grid in table mode, without the mode switch
              if (b.type === 'node') html += '<div class="fc-opts" style="margin-bottom:6px;"><label>Mode <select class="b-mode" data-idx="'+idx+'" title="Scene node: a scene with what must be resolved and the routes out of it. Plain table: just a grid of information."><option value="node"'+(plain ? '' : ' selected')+'>Scene node</option><option value="table"'+(plain ? ' selected' : '')+'>Plain table</option></select></label></div>';
              html += tsBoxHtml('field b-title', plain ? 'Table title (optional)' : 'Node Title', 'data-idx="'+idx+'"', 'margin-bottom:6px; width:100%;');
              if (!plain) {
                  html += tsBoxHtml('field b-sub', 'Tag (optional)', 'data-idx="'+idx+'"', 'margin-bottom:6px; width:100%;');
                  html += tsBoxHtml('field b-must', 'Must Resolve... (optional)', 'data-idx="'+idx+'"', 'margin-bottom:6px; width:100%;');
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
              colNames.forEach(function(c, ci) { html += tsBoxHtml('b-colhead', 'Column '+(ci+1), 'data-idx="'+idx+'" data-ci="'+ci+'"', '', false, 'title="Header of column '+(ci+1)+'"'); });
              html += '<div style="width:31px; height:31px; flex:0 0 31px;"></div></div>';
              b.rows.forEach(function(r, ri) {
                  html += '<div class="row-h">';
                  colNames.forEach(function(c, ci) { html += tsBoxHtml('r-col', c||'—', 'data-idx="'+idx+'" data-ri="'+ri+'" data-ci="'+ci+'"', ''); });
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

                  html += tsBoxHtml('field fc-n-text fc-grow', 'Label (Enter for a new line)', 'data-idx="'+idx+'" data-ni="'+ni+'"', 'flex: 1; min-width:0; min-height:31px; line-height:1.3; padding:6px 8px;', true);

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

                  html += tsBoxHtml('fc-e-text', 'Label (optional)', 'data-idx="'+idx+'" data-ei="'+ei+'"', 'flex: 1; min-width:0;');

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

      tsFill(blockContainer, activeMap.blocks);   // every plain field's box drawn from its runs (the markup above holds no field's text)



      // Attach listeners

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
      // Page layout row (pages only). Selects and the checkbox are one undo step each; the nudge boxes coalesce like text.
      var layOf = function(el) { var bb = activeMap.blocks[el.dataset.idx]; if (!bb.layout || typeof bb.layout !== 'object') bb.layout = blockLayout(bb); return bb; };
      Array.from(blockContainer.querySelectorAll('.b-lay-w')).forEach(el => el.addEventListener('change', function() { layOf(this).layout.width = +this.value; save(true); renderPlannerPreview(); }));
      Array.from(blockContainer.querySelectorAll('.b-lay-f')).forEach(el => el.addEventListener('change', function() { layOf(this).layout.float = this.value; save(true); renderPlannerPreview(); }));
      Array.from(blockContainer.querySelectorAll('.b-lay-dx, .b-lay-dy')).forEach(el => el.addEventListener('input', function() { var bb = layOf(this); bb.layout[this.classList.contains('b-lay-dx') ? 'dx' : 'dy'] = Math.max(-200, Math.min(200, Math.round(+this.value || 0))); save(false); renderPlannerPreview(); }));
      Array.from(blockContainer.querySelectorAll('.b-lay-span')).forEach(el => el.addEventListener('change', function() { var bb = layOf(this); bb.layout.span = this.checked; if (this.checked) bb.layout.float = 'none'; save(true); renderPlanner(); }));
      Array.from(blockContainer.querySelectorAll('.b-h2cols')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].cols = Math.max(1, Math.min(3, parseInt(this.value, 10) || 1)); save(true); renderPlanner(); }));
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
      Array.from(blockContainer.querySelectorAll('.b-content')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].content = this.value; save(false); if(activeMap.blocks[this.dataset.idx].type !== 'diagram') renderPlannerPreview(); }));
      wireRte(blockContainer);

      

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
      Array.from(blockContainer.querySelectorAll('.fc-n-shape')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].nodes[this.dataset.ni].shape = this.value; save(true); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.fc-n-color')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].nodes[this.dataset.ni].color = this.value; save(true); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.del-fc-n')).forEach(el => el.addEventListener('click', function() { activeMap.blocks[this.dataset.idx].nodes.splice(this.dataset.ni, 1); save(true); renderPlanner(); }));

      Array.from(blockContainer.querySelectorAll('.add-fc-n')).forEach(el => el.addEventListener('click', function() { activeMap.blocks[this.dataset.idx].nodes.push({id: 'n'+(activeMap.blocks[this.dataset.idx].nodes.length+1), text: 'Node', shape: 'rect', color: 'neutral'}); save(true); renderPlanner(); }));



      Array.from(blockContainer.querySelectorAll('.fc-e-from')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].edges[this.dataset.ei].from = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.fc-e-to')).forEach(el => el.addEventListener('input', function() { activeMap.blocks[this.dataset.idx].edges[this.dataset.ei].to = this.value; save(false); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.fc-e-style')).forEach(el => el.addEventListener('change', function() { activeMap.blocks[this.dataset.idx].edges[this.dataset.ei].style = this.value; save(true); renderPlannerPreview(); }));

      Array.from(blockContainer.querySelectorAll('.del-fc-e')).forEach(el => el.addEventListener('click', function() { activeMap.blocks[this.dataset.idx].edges.splice(this.dataset.ei, 1); save(true); renderPlanner(); }));

      Array.from(blockContainer.querySelectorAll('.add-fc-e')).forEach(el => el.addEventListener('click', function() { activeMap.blocks[this.dataset.idx].edges.push({from: '', to: '', text: '', style: 'solid'}); save(true); renderPlanner(); }));

      

      renderPlannerPreview();

      applyPlannerFullscreen();

      tsRebuilt();   // every box above is new: the bar is on none of them and no place in the old ones is remembered

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
  var RTE_LINK_TITLE = 'Link \u2014 a web address (https://\u2026) for the selected text, or for the link the caret is in. Enter sets it, Esc backs out; an empty box takes the link off. With nothing selected and the caret outside a link there is nothing to link: a text block styles a selection, not the whole block.';
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
              + '<select class="rte-size" title="Size of the selected text" tabindex="-1"><option value="">Size\u2026</option><option value="default">Default</option>' + TF.SIZES.map(function(s) { return '<option value="' + esc(s) + '">' + esc(TF.SIZE_NAMES[s] || s) + '</option>'; }).join('') + '</select><span class="rte-sep"></span>'
              // …and a Link box (the planner's own too): its address is read by textfmt.js typedLink and set by rteLinkDo
              + '<label class="ts-linklab rte-linklab" title="' + esc(RTE_LINK_TITLE) + '">Link <input type="text" class="ts-link rte-link" placeholder="https://\u2026" spellcheck="false" autocomplete="off" aria-label="Link address" tabindex="-1"></label><span class="rte-sep"></span>';
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
      var a = document.activeElement; if (a && a.classList && a.classList.contains('rte-body')) { rteSyncBar(a); rteLinkSync(a); var gs = window.getSelection(); a._wpRange = gs && gs.rangeCount && a.contains(gs.anchorNode) ? gs.getRangeAt(0).cloneRange() : a._wpRange; }   // remembered for the controls that take the focus (the size list, the colour picker)
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
  // [textcheck:rtelink-start]
  /* ---- a text block's Link control ----
     A Link box on the block's own bar, with the manners of the Link box on a plain field's bar: select text in the block, type an address,
     and Enter — or leaving the box — sets it; the caret or the selection inside a link shows its address; an empty box and Enter takes the
     link off; Escape drops what was typed. What a typed address becomes is textfmt.js typedLink's to say (the bar on the boxes reads it
     there too): one without its scheme is taken as https://, and one that is still no link is refused in the same words and changes nothing.
     A text block styles a selection, not the whole block: with nothing selected the control acts on the link the caret is INSIDE, and with
     the caret outside any link it has nothing to act on and says so.
     The block keeps its box's HTML, so a link is an <a> in the box — made here from elements and text nodes, on the selected CHARACTERS:
     the text nodes are cut at the selection's ends, each one inside comes out of the link it was in (that link is cut around it; what lies
     before and after keeps it) and goes into the new one, and neighbours of one link are joined again. Everything the box holds still
     reaches the preview, a player and a file only through the page sanitiser, which rebuilds every <a> from its own rule. In the box a link
     looks like one and is never followed (linkgate.js). One press is one undo step of the planner's. */
  var RTE_LINK_NONE = 'Select the text to link first, or put the caret inside a link.';
  var RTE_BLOCKS = { P: 1, LI: 1, DIV: 1, UL: 1, OL: 1, PRE: 1, BLOCKQUOTE: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1, TABLE: 1, TR: 1, TD: 1, TH: 1 };
  var RTE_STYLED = { B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, STRIKE: 1, SPAN: 1, FONT: 1, CODE: 1 };
  function rteTag(n) { return String(n.nodeName || '').toUpperCase(); }
  // every text node under a box, in order, with where its characters begin (len: how many there are in all)
  function rteTexts(body) {
      var out = [], at = 0;
      (function go(n) { for (var i = 0; i < n.childNodes.length; i++) { var c = n.childNodes[i]; if (c.nodeType === 3) { out.push({ n: c, a: at }); at += c.nodeValue.length; } else if (c.nodeType === 1) go(c); } })(body);
      out.len = at;
      return out;
  }
  // a place of the selection (a node and an offset in it) as a character offset in the box's text; -1 when it is not in the box
  function rteAt(body, node, offset) {
      var at = 0, found = -1;
      (function go(n) {
          var k = n.childNodes, stop = n === node ? Math.min(k.length, offset) : -1;
          for (var i = 0; i < k.length && found < 0; i++) {
              if (i === stop) { found = at; return; }
              var c = k[i];
              if (c.nodeType === 3) { if (c === node) { found = at + Math.min(c.nodeValue.length, offset); return; } at += c.nodeValue.length; }
              else if (c.nodeType === 1) go(c);
          }
          if (found < 0 && stop === k.length) found = at;
      })(body);
      return found;
  }
  // the box's selection as two character offsets [s, e]; null when it is not in the box
  function rteSel(body) {
      var gs = window.getSelection ? window.getSelection() : null;
      if (!gs || !gs.rangeCount || !gs.anchorNode || !gs.focusNode || !body.contains(gs.anchorNode) || !body.contains(gs.focusNode)) return null;
      var a = rteAt(body, gs.anchorNode, gs.anchorOffset), f = rteAt(body, gs.focusNode, gs.focusOffset);
      return a < 0 || f < 0 ? null : [Math.min(a, f), Math.max(a, f)];
  }
  // the <a> a text node lies in (the nearest one, inside the box), and the paragraph it lies in
  function rteAnchor(body, t) { for (var n = t.parentNode; n && n !== body; n = n.parentNode) if (n.nodeType === 1 && rteTag(n) === 'A') return n; return null; }
  function rteBlock(body, t) { for (var n = t.parentNode; n && n !== body; n = n.parentNode) if (RTE_BLOCKS[rteTag(n)]) return n; return body; }
  // the box's text as runs: [{ a, z, href, blk }] — the characters a to z of one text node, the address they link to as the link rule keeps it ('' for none), their paragraph
  function rteRuns(body) {
      return rteTexts(body).filter(function(x) { return x.n.nodeValue.length > 0; }).map(function(x) {
          var an = rteAnchor(body, x.n), raw = an ? an.getAttribute('href') : null;
          return { a: x.a, z: x.a + x.n.nodeValue.length, href: raw == null ? '' : TF.cleanLink(String(raw)), blk: rteBlock(body, x.n) };
      });
  }
  // What the control acts on, and the link it shows: { s, e, link }. A selection: its characters, and the one address all of them link to
  // ('' when none does, null when they differ). A caret: the whole link it is INSIDE — the character before it and the character after it
  // are in the same link, in the same paragraph — and nothing (s === e) anywhere else: at a link's end, at its start, in plain text.
  function rteLinkAt(body, s, e) {
      var runs = rteRuns(body);
      if (s < e) {
          var seen = [];
          runs.forEach(function(r) { if (r.z > s && r.a < e && seen.indexOf(r.href) < 0) seen.push(r.href); });
          return { s: s, e: e, link: !seen.length ? '' : seen.length === 1 ? seen[0] : null };
      }
      var li = -1, ri = -1;
      runs.forEach(function(r, i) { if (r.a < s && r.z >= s) li = i; if (r.a <= s && r.z > s) ri = i; });
      if (li < 0 || ri < 0 || !runs[li].href || runs[li].href !== runs[ri].href || runs[li].blk !== runs[ri].blk) return { s: s, e: s, link: '' };
      var one = function(x, y) { return x.href === y.href && x.blk === y.blk; };
      while (li > 0 && one(runs[li - 1], runs[li])) li--;
      while (ri < runs.length - 1 && one(runs[ri + 1], runs[ri])) ri++;
      return { s: runs[li].a, e: runs[ri].z, link: runs[li].href };
  }
  function rteDrop(el) { var p = el.parentNode; if (!p) return; while (el.firstChild) p.insertBefore(el.firstChild, el); p.removeChild(el); }   // an element away, what it held in its place
  // A text node alone in its link: every element from its parent up to the link is cut before and after the node's branch (the parts cut
  // off keep their tags, and the link), then the link around what is left is taken away.
  function rteLift(t, a) {
      for (var n = t; n !== a; n = n.parentNode) {
          var p = n.parentNode, after = [], before = [], c;
          for (c = n.nextSibling; c; c = c.nextSibling) after.push(c);
          for (c = p.firstChild; c && c !== n; c = c.nextSibling) before.push(c);
          if (after.length) { var ca = p.cloneNode(false); after.forEach(function(x) { ca.appendChild(x); }); p.parentNode.insertBefore(ca, p.nextSibling); }
          if (before.length) { var cb = p.cloneNode(false); before.forEach(function(x) { cb.appendChild(x); }); p.parentNode.insertBefore(cb, p); }
      }
      rteDrop(a);
  }
  // The characters s to e of the box linked to href — or, with href '', taken out of whatever link they are in. href: an address the link
  // rule keeps (anything else is taken as none). True when the box changed.
  function rteLinkSet(body, s, e, href) {
      href = TF.cleanLink(href);
      if (!(s < e)) return false;
      var changed = false;
      rteTexts(body).forEach(function(x) {   // the text nodes cut at s and e (from the back, so the earlier offset still holds)
          var len = x.n.nodeValue.length;
          [e - x.a, s - x.a].forEach(function(k) {
              if (!(k > 0 && k < len)) return;
              var rest = document.createTextNode(x.n.nodeValue.slice(k));
              x.n.nodeValue = x.n.nodeValue.slice(0, k);
              x.n.parentNode.insertBefore(rest, x.n.nextSibling);
              len = k;
          });
      });
      rteTexts(body).forEach(function(x) {
          var len = x.n.nodeValue.length; if (!len || x.a < s || x.a + len > e) return;
          var an = rteAnchor(body, x.n);
          if (an && href && an.getAttribute('href') === href) return;   // already linked there
          if (!an && !href) return;
          if (an) rteLift(x.n, an);
          if (href) { var a = document.createElement('a'); a.setAttribute('href', href); a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); x.n.parentNode.insertBefore(a, x.n); a.appendChild(x.n); }
          changed = true;
      });
      var all = function() { return Array.prototype.slice.call(body.querySelectorAll('a')); };
      all().forEach(function(a) {   // a link that is all its styled parent holds goes around that parent — a link across bold text is one link, not one for each piece
          for (var p = a.parentNode; p && p !== body && RTE_STYLED[rteTag(p)] && p.childNodes.length === 1; p = a.parentNode) {
              p.parentNode.insertBefore(a, p);
              while (a.firstChild) p.appendChild(a.firstChild);
              a.appendChild(p);
          }
      });
      all().forEach(function(a) {   // neighbours of one link are one link; one left holding no text is none
          if (!a.parentNode) return;
          for (var nx = a.nextSibling; nx && nx.nodeType === 1 && rteTag(nx) === 'A' && nx.getAttribute('href') === a.getAttribute('href'); nx = a.nextSibling) { while (nx.firstChild) a.appendChild(nx.firstChild); nx.parentNode.removeChild(nx); }
          if (!rteTexts(a).len) rteDrop(a);
      });
      if (changed && typeof body.normalize === 'function') body.normalize();   // the pieces of a cut text node that ended up side by side are one node again
      return changed;
  }
  function rteLinkBox(body) { return body && body.parentNode ? body.parentNode.querySelector('.rte-link') : null; }
  // The box's selection remembered for the Link box (which takes the focus), and the Link box showing what it would act on: the address of
  // the link the selection or the caret is in — never over what is being typed there
  function rteLinkSync(body) {
      var box = rteLinkBox(body); if (!box) return;   // a box with no Link control (the play map's text box) is left alone
      if (document.activeElement === body) { var sel = rteSel(body); if (sel) body._wpSel = sel; }   // only while the block has the focus: what it held selected when the Link box took it stays remembered
      var cur = body._wpSel, at = cur ? rteLinkAt(body, cur[0], cur[1]) : null;
      if (document.activeElement !== box) { box.value = at && at.link ? at.link : ''; box.placeholder = at && at.link === null ? 'several links' : 'https://…'; }
      if (box.parentNode) box.parentNode.title = at && at.link ? RTE_LINK_TITLE + ' This link leads to ' + at.link : RTE_LINK_TITLE;
  }
  // The Link box's address onto the block. 'bad': refused, said in words, nothing changed; false: nothing to act on, or nothing to change; true: done — one undo step.
  function rteLinkDo(body, box) {
      var v = TF.typedLink(box.value);
      if (v === null) { toast(TS_LINK_BAD); return 'bad'; }
      var sel = body._wpSel, at = sel ? rteLinkAt(body, sel[0], sel[1]) : null;
      if (!at || !(at.s < at.e)) { toast(RTE_LINK_NONE); return false; }   // nothing selected and the caret in no link
      if (at.link === v) return false;
      stepBoundary();   // typing still on its way is its own step
      if (!rteLinkSet(body, at.s, at.e, v)) return false;
      body.dispatchEvent(new Event('input', { bubbles: true }));
      body._wpNativeDirty = false;   // nodes were made behind the browser's own text undo: Ctrl+Z goes to the planner's history (io.js fieldUndoChord), which has this press as a step
      stepBoundary();   // …and this press is a step of its own: what is typed next does not fold into it
      return true;
  }
  // Back from the Link box into the block, its selection as it was
  function rteLinkBack(body) {
      var sel = body._wpSel;   // read first: focusing the block makes the engine put a caret in it, and the block's own focus handler notes that
      try { body.focus(); } catch (e) {}
      if (sel) { rteSelect(body, sel); body._wpSel = sel; }
  }
  // What is typed right at the END of a link is not part of the link (the boxes' one rule, TS_LINK_GROWS). Before the engine inserts at a
  // caret that stands at a link's end, the place and the text's length are noted; after the insertion, whatever landed inside a link there
  // is taken out of it again and keeps the rest of its look. An engine that leaves such typing outside the link itself leaves nothing to do.
  function rteLinkMark(body, inputType) {
      body._wpEnd = null;
      if (TS_LINK_GROWS || !/^insert/.test(String(inputType || ''))) return;
      var sel = rteSel(body); if (!sel || sel[0] !== sel[1] || !(sel[0] > 0)) return;
      var runs = rteRuns(body), at = sel[0], L = null, R = null;
      runs.forEach(function(r) { if (r.a < at && r.z >= at) L = r; if (r.a <= at && r.z > at) R = r; });
      if (!L || !L.href || (R && R.href === L.href && R.blk === L.blk)) return;   // not at a link's end
      body._wpEnd = { at: at, len: rteTexts(body).len };
  }
  function rteLinkKeep(body) {
      var m = body._wpEnd; body._wpEnd = null;
      if (!m) return false;
      var grown = rteTexts(body).len - m.len; if (!(grown > 0)) return false;
      if (rteLinkAt(body, m.at, m.at + grown).link === '') return false;   // it is outside every link already
      var sel = rteSel(body);
      if (!rteLinkSet(body, m.at, m.at + grown, '')) return false;
      rteSelect(body, sel || [m.at + grown, m.at + grown]);
      return true;
  }
  // [textcheck:rtelink-end]
  // [textcheck:rtewire-start]
  function wireRte(container) {
      Array.from(container.querySelectorAll('.rte-body')).forEach(function(body) {
          body.addEventListener('input', function() {
              if (this._wpQuiet) return;   // a command half-way through (rteLook): the finished box follows
              var kept = !this._wpComp && rteLinkKeep(this);   // what was just typed at a link's end is not part of the link
              if (kept) this._wpNativeDirty = false;   // nodes were re-made behind the browser's own text undo: Ctrl+Z is the planner's
              var am = getActiveMap(); if (!am || !am.blocks) return;
              am.blocks[this.dataset.idx].content = this.innerHTML;
              save(false); renderPlannerPreview(); rteSyncBar(this); rteLinkSync(this);
          });
          body.addEventListener('beforeinput', function(e) { if (!this._wpComp) rteLinkMark(this, e.inputType); });
          body.addEventListener('compositionstart', function() { rteLinkMark(this, 'insertCompositionText'); this._wpComp = true; });   // a composition is judged once, at its end
          body.addEventListener('compositionend', function() { this._wpComp = false; if (rteLinkKeep(this)) { this.dispatchEvent(new Event('input', { bubbles: true })); this._wpNativeDirty = false; } });
          body.addEventListener('keydown', function(e) {
              if (e.key === 'F10' && e.altKey && !e.ctrlKey && !e.metaKey) {   // from the keyboard into the bar's Link box (the one control there that takes typing), as Alt+F10 goes into the bar of a plain field's box
                  var lb = rteLinkBox(this);
                  if (lb) { e.preventDefault(); e.stopPropagation(); rteLinkSync(this); try { lb.focus(); lb.select(); } catch (err) {} return; }
              }
              if (fieldUndoChord(e)) return; e.stopPropagation();
          });
          body.addEventListener('paste', function(e) {   // plain text only — no styles from elsewhere
              e.preventDefault();
              var t = (e.clipboardData || window.clipboardData).getData('text/plain');
              document.execCommand('insertText', false, t);
          });
          body.addEventListener('focus', function() { rteSyncBar(this); rteLinkSync(this); });
      });
      Array.from(container.querySelectorAll('.rte-bar')).forEach(function(bar) {
          bar.addEventListener('mousedown', function(e) { if (e.target && e.target.closest && e.target.closest('select, input')) return; e.preventDefault(); });   // keep the selection in the box (the size list and the colour picker must take the focus: the box's selection is remembered for them)
          var pick = bar.querySelector('.rte-colorpick'), sizeSel = bar.querySelector('.rte-size');
          if (pick) pick.addEventListener('change', function() { rteLook(bar.parentNode.querySelector('.rte-body'), { color: this.value }); });
          if (sizeSel) sizeSel.addEventListener('change', function() { var v = this.value; this.value = ''; if (v) rteLook(bar.parentNode.querySelector('.rte-body'), { size: v === 'default' ? null : v }); });
          // the Link box: Enter sets its address and goes back to the block; Escape goes back and drops what was typed; left for somewhere else with a new
          // address in it, that address is set and the focus stays where it went (done: what Enter or Escape has already dealt with)
          var linkBox = bar.querySelector('.rte-link');
          if (linkBox) {
              var blockOf = function() { return bar.parentNode.querySelector('.rte-body'); };
              linkBox.addEventListener('keydown', function(e) {
                  if (e.key !== 'Enter' && e.key !== 'Escape') return;
                  e.preventDefault(); e.stopPropagation();
                  this._wpDone = this.value;
                  if (e.key === 'Escape' || rteLinkDo(blockOf(), this) !== 'bad') rteLinkBack(blockOf());
              });
              linkBox.addEventListener('change', function() { var done = this._wpDone; this._wpDone = null; if (done === this.value) return; rteLinkDo(blockOf(), this); });
              linkBox.addEventListener('blur', function() { this._wpDone = null; rteLinkSync(blockOf()); });   // left: it shows the block's own link again
          }
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
  (function wireTextStyle() {   // the bar is built once, inside the editor panel; the boxes are wired once, on the element that holds them
      var root = document.getElementById('plannerBlocks'), host = document.getElementById('plannerEditorWrap'); if (!root || !host) return;
      tsBuild(host, RTE_SYMS);
      tsWire(root, host);
  })();
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
  // [textcheck:fcdrag-start]
  function fcBlockOf(box) { var am = box._fcDoc || getActiveMap(); var i = parseInt(box.dataset.fc, 10); return am && am.blocks ? am.blocks[i] : null; }   // _fcDoc: the reader's page (handbook.js)
  function fcNodeId(g) { return String(g.id || '').replace(/^flowchart-/, '').replace(/-\d+$/, ''); }
  // A linked node is drawn inside an <a> — the diagram library's own way: <a xlink:href="…"><g class="node">…</g></a> — and the library
  // seats such a node by a transform on that <a>, not on the node's own group. fcSeat is the element that carries a node's place.
  function fcLinkOf(g) { var p = g ? g.parentNode : null; return p && String(p.nodeName).toLowerCase() === 'a' ? p : null; }
  function fcSeat(g) { return fcLinkOf(g) || g; }
  // The end of a drag or of a resize of a linked node is no click on its link. The node's <a> is marked while that gesture's own click is
  // on its way — linkgate.js opens nothing for a marked link — and the mark comes off at the next press on the node, and by itself a
  // moment after the gesture ends. on: true — marked, and off again by itself; 'down' — marked until told otherwise (a resize under way);
  // false — off.
  function fcHold(g, on) {
      var a = fcLinkOf(g); if (!a) return;
      clearTimeout(a._fcHeld); a._fcHeld = 0;
      if (!on) { a.removeAttribute('data-held'); return; }
      a.setAttribute('data-held', '1');
      if (on === true) a._fcHeld = setTimeout(function() { a.removeAttribute('data-held'); a._fcHeld = 0; }, 400);
  }
  // [sinkcheck:diagramlinks-start]
  // A linked shape of a drawn diagram, in every place one is drawn (the preview, the reader, a sheet's handbook page, the floating panel, a
  // pop-out: each runs this once the diagram library has drawn). Its <a> carries only an address the link rule keeps (textfmt.js cleanLink)
  // — with any other it is no link — and never a target: a click is linkgate.js's to judge, and the library's own target would steer the
  // app's window. It says where it leads in a <title> this makes, whose text is the cleaned address: a text node, never markup.
  var FC_XLINK = 'http://www.w3.org/1999/xlink', FC_SVGNS = 'http://www.w3.org/2000/svg';
  function fcLinks(root) {
      if (!root || !root.querySelectorAll) return;
      Array.from(root.querySelectorAll('.diagram svg a')).forEach(function(a) {
          var raw = a.hasAttributeNS(FC_XLINK, 'href') ? a.getAttributeNS(FC_XLINK, 'href') : a.hasAttribute('xlink:href') ? a.getAttribute('xlink:href') : a.hasAttribute('href') ? a.getAttribute('href') : null;
          a.removeAttribute('target');
          Array.from(a.childNodes).forEach(function(c) { if (c.nodeType === 1 && String(c.nodeName).toLowerCase() === 'title') a.removeChild(c); });
          if (raw === null) return;
          var link = TF.cleanLink(raw);
          if (!link || link !== raw) { a.removeAttributeNS(FC_XLINK, 'href'); a.removeAttribute('xlink:href'); a.removeAttribute('href'); return; }
          var t = document.createElementNS(FC_SVGNS, 'title');
          t.textContent = link;
          a.insertBefore(t, a.firstChild);
      });
  }
  // [sinkcheck:diagramlinks-end]
  function fcTranslate(g) { var m = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)/.exec(fcSeat(g).getAttribute('transform') || ''); return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 }; }
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
              fcHold(g, 'down');   // nor a click on a linked node's link: the handle never opens it, moved or not
              window.addEventListener('pointerup', function fcUp() { window.removeEventListener('pointerup', fcUp); fcHold(g, true); });
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
          var p = b.nodePos[nid]; fcSeat(g).setAttribute('transform', 'translate(' + p.x + ', ' + p.y + ')');
          fcRedrawEdges(svg, nid);
      });
  }
  function fcWireNudging(box, svg, b) {
      var pt = svg.createSVGPoint();
      var inv = null;   // screen→SVG matrix captured when a drag starts, so the mapping cannot shift under the pointer
      var toSvg = function(e) { pt.x = e.clientX; pt.y = e.clientY; return inv ? pt.matrixTransform(inv) : { x: 0, y: 0 }; };
      Array.from(svg.querySelectorAll('g.node')).forEach(function(g) {
          g.style.cursor = fcLinkOf(g) ? 'pointer' : 'move';   // a linked node reads as a link here too: a plain click opens it, a drag still moves it
          g.addEventListener('pointerdown', function(e) {
              if (e.button !== 0) return;
              e.preventDefault(); e.stopPropagation();
              fcHold(g, false);   // a new press: whatever the last gesture left is off (a plain click on a linked node opens its link)
              var m0 = svg.getScreenCTM(); if (!m0) return; inv = m0.inverse();
              svg.style.overflow = 'visible';
              var nid = fcNodeId(g), start = toSvg(e), origin = fcTranslate(g), moved = false;
              var onMove = function(ev) {
                  var q = toSvg(ev); var nx = origin.x + (q.x - start.x), ny = origin.y + (q.y - start.y);
                  if (Math.abs(nx - origin.x) > 1 || Math.abs(ny - origin.y) > 1) moved = true;
                  fcSeat(g).setAttribute('transform', 'translate(' + nx + ', ' + ny + ')');
                  fcRedrawEdges(svg, nid);
              };
              var onUp = function(ev) {
                  window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp);
                  svg.style.overflow = ''; inv = null;
                  if (!moved) return;
                  fcHold(g, true);   // the node was dragged: the click that ends the drag opens nothing
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
      fcLinks(document.getElementById('plannerPreview'));   // every diagram of the preview, a hand-written one too
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
      fcLinks(root);   // every diagram drawn there, a hand-written one too
      Array.from(root.querySelectorAll('.fc-box')).forEach(function(box) {
          box._fcDoc = doc;
          var svg = box.querySelector('svg'); var b = fcBlockOf(box); if (!svg || !b) return;
          fcFitViewBox(svg);
          fcApplyZoomBox(box);
          fcApplySizes(svg, b);
          if (b.nodePos && b.nodePosSig === fcSig(b)) Object.keys(b.nodePos).forEach(function(nid) {
              var g = svg.querySelector('g.node[id^="flowchart-' + nid + '-"]'); if (!g) return;
              var p = b.nodePos[nid]; fcSeat(g).setAttribute('transform', 'translate(' + p.x + ', ' + p.y + ')');
              fcRedrawEdges(svg, nid);
          });
          fcFitViewBox(svg);
          fcApplyZoomBox(box);
      });
  };
  // [textcheck:fcdrag-end]
  /* ---- find in planner ----
     Highlights in the rendered preview only (the editor boxes are left alone). The text is read in
     stretches — the text nodes of one run of inline content, joined — so a word drawn as several
     runs (part of it coloured by the bar on its box) is found whole; each stretch is matched on a
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
              html += '<div class="diagram"><pre class="mermaid">' + mermaidPre(b.content) + '</pre></div>';   // docrender.js: the sanitiser's output, judged once more as mermaid will read it (it reads the pre's HTML and decodes it: typed source, <br> labels and an import's &lt; all read as before)
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
              html += '<div class="diagram fc-box" data-fc="' + _bi + '" style="' + boxStyle + '"><pre class="mermaid">' + esc(stripMermaidLinks(m, true)) + '</pre></div>';   // as a page renders it: labels are text, mermaid decodes them
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

