/* Offline check of the look of the play map (backlog 107, 1.5.4).
   The owner, 2026-10-06, of every change to how the interface looks: "lets not remove functionality with these updates, that critical."
   So this suite holds an INVENTORY of the play map's controls as they stood before the look work began, and fails when one is gone or
   doubled: a control may move under a menu or a fold, and it is never dropped. It also holds what the owner passed for the toolbar:
   line icons for the tools ("Line icons, shown first", the sheet passed with "Use this set"), gold for the tool in hand ("Gold"), and
   their two words on the first mock-up: "also id like the music icon to stay a note" and "and the waypoint icon to be the icon we use
   today, not the compass" (an icon the app already has keeps its drawing). The top bar's own icons, which matched the drawings of another
   icon set, were redrawn as the app's own (backlog 131: "Redraw them as our own", the sheet passed with "Use these drawings").
   Then the layout ("As drawn": the tools on one bar; View, Grid and Snap in a column at the map's right edge; More, the last button,
   with Clear board; the rulers "On, as today" with a tick in the View menu), and the box at the top right, of which they said first
   "Leave the box as it is" and then: "lets update the styling of the zoom and pointer location to match the other changes still, and
   optionally hide both independently". The page and the style sheet are read as text; the scripts' own code is sliced by its
   [lookcheck:*] markers and run for real on a page of plain objects. No browser.
   Usage: node tools/lookcheck.js */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const app = path.join(__dirname, '..', 'system', 'app'), root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const rootRead = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const J = JSON.stringify, count = (s, f) => s.split(f).length - 1;
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 900) : ''); } }

const ix = read('index.html'), css = read('style.css'), wbSrc = read('scripts/whiteboard.js'), mainSrc = read('scripts/main.js'), setSrc = read('scripts/settings.js'), tourSrc = read('scripts/tutorial.js');
const sliceOf = (src, name) => { const A = '// [lookcheck:' + name + '-start]', Z = '// [lookcheck:' + name + '-end]', a = src.indexOf(A), z = src.indexOf(Z); return a >= 0 && z > a && count(src, A) === 1 && count(src, Z) === 1 ? src.slice(a + A.length, z) : ''; };

/* ---------- the inventory: every control around the play map, by its id, as it stood on 2026-10-06 before the look work ---------- */
// The toolbar and its menus, then what stands around the map (the rulers, the party and turn strips, the join card, the zoom box, the
// panes' grips, the minimap). A new control is added to this list when it is built; none is ever taken off it without the owner's word.
const INVENTORY = ['wbFloatingToolbar', 'wbCenterBtn', 'wbCenterMenu', 'wbCenterCanvasBtn', 'wbCenterItemsBtn', 'wbCenterCharBtn', 'wbFitBtn', 'wbUndoBtn', 'wbRedoBtn', 'wbGridBtn', 'gridMenu', 'gridOffBtn', 'gridSqBtn', 'gridHexBtn',
    'gridOpacityBtn', 'wbSnapBtn', 'snapMenu', 'snapOffBtn', 'moveModeBtn', 'panModeBtn', 'drawModeBtn', 'drawColorIndicator', 'drawMenu', 'drawStyleRow', 'drawTipRow', 'drawColorRow', 'drawColorInput', 'drawSizeRow', 'drawOpacityVal',
    'drawOpacity', 'eraserModeBtn', 'eraserMenu', 'eraserSizeVal', 'eraserSize', 'fillModeBtn', 'fillColorIndicator', 'fillMenu', 'fillColorRow', 'fillColorInput', 'fillFloodChk', 'fillTerrainChk', 'fillTerrainCost', 'measureModeBtn',
    'measureMenu', 'measureUnitRow', 'measureCellValue', 'measureCellUnit', 'measureClearBtn', 'blastModeBtn', 'blastMenu', 'blastFt', 'blastElevRow', 'blastElevUnit', 'blastElev', 'blastFlatNote', 'blastWhich', 'blastClearBtn',
    'blastUndoThrow', 'fogModeBtn', 'fogMenu', 'fogOn', 'fogHideMine', 'fogOnAllMaps', 'fogOnDefault', 'fogEmptyScope', 'fogLightRow', 'fogLight', 'fogLightPlace', 'fogGridlessRow', 'fogCellLen', 'fogSightFieldRow', 'fogSightField',
    'fogSightSecret', 'fogSight', 'fogSightUnit', 'fogSensesRow', 'fogSensesText', 'fogSensesEdit', 'fogMarksRow', 'fogMarksMode', 'fogVision', 'fogVisionArcRow', 'fogVisionArc', 'fogVisionDefault', 'fogRemember', 'fogStrokeRow',
    'fogPaintNote', 'fogRevealAll', 'fogCoverAll', 'fogPreview', 'fogNote', 'sceneFxBtn', 'sceneFxMenu', 'soundBtn', 'musicBtn', 'fxBtn', 'videoBtn', 'pagesBtn', 'pagesMenu', 'shapeMenuBtn', 'shapeMenu', 'shapeRectBtn', 'shapeCircBtn',
    'shapeDiaBtn', 'shapeHexBtn', 'shapeTriggerBtn', 'shapeHexTriggerBtn', 'shapeOpacityVal', 'shapeOpacity', 'addMenuBtn', 'addMenu', 'shapeTextBtn', 'addImageBtn', 'imgLibBtn', 'importCharBtn', 'clearWbBtn', 'rulerTop', 'rulerLeft',
    'rulerCursorX', 'rulerCursorY', 'fxScreen', 'fogScreen', 'partyStrip', 'combatStrip', 'partyMenu', 'joinCard', 'joinCardStatus', 'joinCardMake', 'joinCardFile', 'joinCardToken', 'joinCardOpen', 'joinCardFaceBtn', 'joinCardClose',
    'wbStubNote', 'zoomBox', 'cursorPos', 'zoomOutBtn', 'zoomLbl', 'zoomInBtn', 'toggleLeftBtn', 'toggleRightBtn', 'minimap', 'minimapCanvas', 'minimapToggle',
    // built with the layout (2026-10-06): the column at the map's right edge, More and its menu, and the View menu's three ticks
    'wbEdgeTools', 'wbMoreBtn', 'wbMoreMenu', 'wbRulersBtn', 'wbZoomCtlBtn', 'wbPointerPosBtn',
    // built with the presses (2026-10-06): the small arrow beside each tool that has options, and beside each button that opens a menu
    'drawOptBtn', 'eraserOptBtn', 'fillOptBtn', 'measureOptBtn', 'blastOptBtn', 'snapOptBtn', 'shapeOptBtn', 'addOptBtn', 'fogOptBtn', 'sceneOptBtn', 'viewOptBtn', 'gridOptBtn',
    // built with the Radius tool (2026-10-06): the unit beside the size box, and the row that reads the number as a radius or as a diameter
    'blastUnit', 'blastAsRow',
    // built with the ring and the cone (2026-10-06): the Shape row and the line that says what the shape in use is, a ring's inner distance, a cone's angle
    'blastShapeRow', 'blastShapeNote', 'blastInnerWrap', 'blastInner', 'blastAngleWrap', 'blastAngle',
    // built with Explode (2026-10-06), the GM's alone: its button, the two boxes it asks for with the part that holds them, and the two buttons under them
    'blastExplodeBtn', 'blastExplodeForm', 'blastDmg', 'blastDmgType', 'blastExplodeGo', 'blastExplodeNo',
    // built with the tick the owner asked for on Explode (2026-10-07: "Ask each time"): Also hits the token at the centre, and the row that holds it
    'blastHitCentreRow', 'blastHitCentre',
    // built with the fog menu's groups (2026-10-06): its three folds, each a button and the part it shows
    'fogFoldLight', 'fogLightVision', 'fogFoldPreview', 'fogPreviewBox', 'fogFoldCamp', 'fogCampBox'];
// The choices inside the menus that have no id: found by the attribute their handler reads
const ROWS = { mode: ['grid', 'items', 'both'], straight: ['false', 'true'], tip: ['round', 'square', 'flat'], size: ['2', '3', '6', '10', '16'], emode: ['precise', 'segment'], unit: ['imperial', 'metric'],
    fgrid: ['square', 'hex'], fbrush: ['reveal', 'hide', 'clear'], fstroke: ['1', '3', '5', 'box', 'piece'], shapesize: ['free', 'cell'], as: ['r', 'd'], shape: ['circle', 'ring', 'cone', 'tok'] };
const SWATCHES = ['#e9e9f0', '#1a1a1a', '#d9534f', '#e0a54f', '#5cb87a', '#4db3d3', '#b98cff'];
// The top bar's controls, held from now on for the part that follows the toolbar (the slim row): Import and Export among them, of which the
// owner said, of the row: "1 as long as we are not getting rid of import and export"
const HEADER = ['headerBrand', 'campMenuBtn', 'campaignSelect', 'tableWhere', 'searchCampBtn', 'newCampBtn', 'renameCampBtn', 'systemBtn', 'delCampBtn', 'viewModeSelect', 'mapTabs', 'mapBreadcrumb', 'mapTabList', 'mapTabAdd', 'tableWhereMap', 'clockChip', 'videoChip', 'rowPills', 'fogPill', 'tablePill', 'pausedPill', 'roundPill', 'viewPill', 'saveAsBtn', 'saveAsMenu',
    'exportImgBtn', 'exportPdfBtn', 'exportHtmlBtn', 'exportMdBtn', 'exportItemBtn', 'exportMapsBtn', 'exportWbsBtn', 'exportPlannersBtn', 'exportDocsBtn', 'exportCampaignBtn', 'exportBtn', 'importBtn', 'fileIn', 'updateBtn', 'reviewChip',
    'netBtn', 'sessionPauseBtn', 'chatBtn', 'soundInd', 'musicInd', 'handoutsBtn', 'journalBtn', 'refreshBtn', 'settingsBtn', 'helpBtn', 'moreMenuBtn', 'aboutBtn', 'rowHideBtn', 'saveNote'];
// Settings, Table: the three switches for what stands around a map, each with the word that says how it stands
const SETTINGS = ['setRulersBtn', 'setRulersState', 'setZoomCtlBtn', 'setZoomCtlState', 'setPointerPosBtn', 'setPointerPosState'];
const board = (() => { const a = ix.indexOf('<div id="wbFloatingToolbar"'), z = ix.indexOf('<div id="whiteboardWrap">'); return a > 0 && z > a ? ix.slice(a, z) : ''; })();
{
    const idN = id => count(ix, ' id="' + id + '"'), ALL = INVENTORY.concat(HEADER, SETTINGS);
    const gone = ALL.filter(id => idN(id) !== 1).map(id => id + ' x' + idN(id)), out = INVENTORY.filter(id => count(board, ' id="' + id + '"') !== 1);
    check('nothing is removed (the owner: "lets not remove functionality with these updates, that critical."): each of the ' + INVENTORY.length + ' controls of the play map\'s toolbar, its menus and what stands around the map is in the page exactly once and still around the map, and so is each of the ' + HEADER.length + ' of the top bar with Import and every kind of Export, and each of the ' + SETTINGS.length + ' of the three switches in Settings',
        board.length > 1000 && gone.length === 0 && out.length === 0 && INVENTORY.length === 184 && HEADER.length === 54 && SETTINGS.length === 6 && new Set(ALL).size === 244, J([gone, out]));
    const rowsBad = Object.keys(ROWS).filter(k => J((board.match(new RegExp('<button[^>]* data-' + k + '="([^"]*)"', 'g')) || []).map(m => m.slice(m.lastIndexOf('="') + 2, -1))) !== J(ROWS[k]));
    const sw = (board.match(/<button class="draw-swatch" data-color="(#[0-9a-f]{6})"/g) || []).map(m => m.slice(-8, -1));
    check('nothing is removed, the choices inside the menus: Snap\'s three modes, the pen\'s two styles, three tips and five sizes, the eraser\'s two modes, the two measuring systems, the fog\'s two gridless grids, three brushes and five strokes, the two shape sizes, the Radius tool\'s three shapes and a circle\'s two readings, each in its order, and the seven colours of the pen and of the fill with a custom colour for each',
        rowsBad.length === 0 && J(sw) === J(SWATCHES.concat(SWATCHES)) && count(board, 'id="drawColorInput"') === 1 && count(board, 'id="fillColorInput"') === 1, J([rowsBad, sw]));
}

/* ---------- the toolbar's icons: the app's own line icons, the set the owner passed ---------- */
const innerOfBtn = how => { const at = board.indexOf(how); if (at < 0 || board.indexOf(how, at + 1) >= 0) return null; const gt = board.indexOf('>', at), end = board.indexOf('</button>', gt); return gt < 0 || end < 0 ? null : board.slice(gt + 1, end); };
const SVG = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">', SVG_RE = /^<svg class="ico( ico-[a-z]+)?" viewBox="0 0 24 24" aria-hidden="true">/;
const svgIn = s => { if (typeof s !== 'string') return null; const a = s.indexOf('<svg class="ico'), gt = s.indexOf('>', a), z = s.indexOf('</svg>', gt); return a < 0 || z < 0 ? null : s.slice(gt + 1, z); };
const draw = id => svgIn(innerOfBtn('id="' + id + '"'));
// The set as the owner passed it on the icon sheet: the eighteen buttons the bar had then, and the menu rows that wore a picture glyph, in the
// order the sheet was hashed in. The layout moved buttons; it changed no drawing, so the pin has not moved
const PASSED_BAR = ['wbCenterBtn', 'wbUndoBtn', 'wbRedoBtn', 'wbGridBtn', 'wbSnapBtn', 'moveModeBtn', 'panModeBtn', 'drawModeBtn', 'eraserModeBtn', 'fillModeBtn', 'measureModeBtn', 'blastModeBtn', 'fogModeBtn', 'sceneFxBtn', 'pagesBtn', 'shapeMenuBtn',
    'addMenuBtn', 'clearWbBtn'];
const MENU = ['id="gridSqBtn"', 'id="gridHexBtn"', 'id="gridOpacityBtn"', 'data-mode="grid"', 'data-mode="items"', 'data-mode="both"', 'data-straight="false"', 'data-straight="true"', 'data-emode="precise"', 'data-emode="segment"',
    'id="blastUndoThrow"', 'id="fogOnAllMaps"', 'id="fogLightPlace"', 'data-fbrush="reveal"', 'data-fbrush="hide"', 'data-fbrush="clear"', 'data-fstroke="box"', 'data-fstroke="piece"', 'id="soundBtn"', 'id="musicBtn"', 'id="fxBtn"', 'id="videoBtn"',
    'id="shapeRectBtn"', 'id="shapeCircBtn"', 'id="shapeDiaBtn"', 'id="shapeHexBtn"', 'id="shapeTriggerBtn"', 'id="shapeHexTriggerBtn"', 'data-shapesize="free"', 'data-shapesize="cell"', 'id="shapeTextBtn"', 'id="addImageBtn"', 'id="imgLibBtn"',
    'id="importCharBtn"'];
const SET_HASH = '437749cba37b0bb31c8701fc9cf74f7d7b60473b8b4c04d29d211839ab7b0d75';   // the set as the owner passed it on the icon sheet, 2026-10-06, with the Radius drawing they passed on the radius sheet the same day where the burst stood, and with Add's plus, Clear board's bin, Sound's speaker and Music's note as they passed them redrawn on the top bar's sheet, 2026-10-07
// The buttons that stand on the bar and in the column today: an icon alone. Clear board is a row of More's menu now, an icon and its name
const BAR = ['wbUndoBtn', 'wbRedoBtn', 'moveModeBtn', 'panModeBtn', 'drawModeBtn', 'eraserModeBtn', 'fillModeBtn', 'shapeMenuBtn', 'addMenuBtn', 'measureModeBtn', 'blastModeBtn', 'fogModeBtn', 'sceneFxBtn', 'pagesBtn', 'wbMoreBtn', 'wbCenterBtn',
    'wbGridBtn', 'wbSnapBtn'];
const ROWS_NOW = MENU.concat(['id="clearWbBtn"', 'id="wbRulersBtn"', 'id="wbZoomCtlBtn"', 'id="wbPointerPosBtn"', 'data-as="r"', 'data-as="d"', 'data-shape="circle"', 'data-shape="ring"', 'data-shape="cone"', 'data-shape="tok"', 'id="blastExplodeBtn"']);
const DOTS = '<path d="M12 5h.01M12 12h.01M12 19h.01"/>', TICK = '<path d="M5 12.5l4.5 4.5L19 7.5"/>', MINUS = '<path d="M4.5 12h15"/>';
{
    const bar = BAR.map(id => [id, innerOfBtn('id="' + id + '"')]), menu = ROWS_NOW.map(h => [h, innerOfBtn(h)]);
    const noIcon = bar.filter(b => typeof b[1] !== 'string' || !SVG_RE.test(b[1]) || !/<\/svg>$/.test(b[1].replace(/<span class="draw-color-indicator" id="(draw|fill)ColorIndicator"><\/span>$/, ''))).map(b => b[0]);
    const glyph = bar.concat(menu).filter(b => typeof b[1] === 'string' && /&#\d+;/.test(b[1].replace('&middot;', ''))).map(b => b[0]);
    const noIconM = menu.filter(b => typeof b[1] !== 'string' || !b[1].includes('<svg class="ico')).map(b => b[0]);
    check('the play map\'s tools wear line icons (the owner: "Line icons, shown first"): each of the eighteen buttons of the bar and of the column is the app\'s own kind of icon and nothing else, an <svg class="ico"> on the 24 by 24 grid, each of the thirty-four menu rows that wore a picture glyph holds one, so do Clear board, the three ticks, the six buttons of the Radius tool and Explode, and none of them holds a picture glyph any more',
        noIcon.length === 0 && noIconM.length === 0 && glyph.length === 0 && BAR.length === 18 && new Set(BAR).size === 18 && ROWS_NOW.length === 45, J([noIcon, noIconM, glyph]));
    const passed = PASSED_BAR.map(id => [id, innerOfBtn('id="' + id + '"')]).concat(MENU.map(h => [h, innerOfBtn(h)]));
    const set = passed.map(b => b[0] + '=' + svgIn(b[1])).join('\n'), h = crypto.createHash('sha256').update(set).digest('hex');
    check('the icons are the set the owner passed on the icon sheet ("Use this set"), drawing for drawing, wherever the layout has put their buttons: a changed or a new drawing is shown to the owner first, and this pin moves only then',
        h === SET_HASH && PASSED_BAR.length === 18 && MENU.length === 34, h);
    // The Radius tool (backlog 128; the owner, 2026-10-06: "lets make the explosion tool a radius/ diameter tool instead", and of its five
    // drawings on the radius sheet, by prompt: "Use these drawings"). It is everyone's: the pair is no longer the GM's alone, and what is
    // the GM's inside its options says so
    const RADIUS = '<path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 12l5.6-5.6M12 12h.01"/>', DIAMETER = '<path d="M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM4 12h16"/>';
    const RING = '<path d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/>', CONE = '<path d="M4 18L15.5 4.2a18 18 0 0 1 6.4 12.2L4 18z"/>';
    const AURA = '<path d="M13.8 3.7A8.5 8.5 0 0 1 20.3 10.2M20.3 13.8A8.5 8.5 0 0 1 13.8 20.3M10.2 20.3A8.5 8.5 0 0 1 3.7 13.8M3.7 10.2A8.5 8.5 0 0 1 10.2 3.7M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/>';   // On a token: a small circle, and a broken one round it
    const BURST = '<path d="M12 2l2 5.5 5-2.5-2.5 5 5.5 2-5.5 2 2.5 5-5-2.5-2 5.5-2-5.5-5 2.5 2.5-5L2 12l5.5-2-2.5-5 5 2.5 2-5.5z"/>', UNDO = '<path d="M9 4L4 9l5 5M4 9h10.5a5.5 5.5 0 0 1 0 11H9"/>';   // the burst the bar's Blast button wore on the passed icon sheet: kept, as the radius sheet said, for Explode
    check('the Radius tool wears the drawings the owner passed on the radius sheet ("Use these drawings"): the circle with a spoke on the bar, on the Circle shape and on the Radius choice, as the sheet said, the circle with a line across on Diameter, the two rings on Ring, the wedge on Cone and the broken circle round a small one on On a token, each button an icon and its name; and the burst the bar wore before, which the sheet kept for Explode, is on Explode and nowhere else',
        draw('blastModeBtn') === RADIUS && innerOfBtn('data-as="r"') === SVG + RADIUS + '</svg> Radius' && innerOfBtn('data-as="d"') === SVG + DIAMETER + '</svg> Diameter'
        && innerOfBtn('data-shape="circle"') === SVG + RADIUS + '</svg> Circle' && innerOfBtn('data-shape="ring"') === SVG + RING + '</svg> Ring' && innerOfBtn('data-shape="cone"') === SVG + CONE + '</svg> Cone' && innerOfBtn('data-shape="tok"') === SVG + AURA + '</svg> On a token'
        && innerOfBtn('id="blastExplodeBtn"') === SVG + BURST + '</svg> Explode&hellip;' && count(ix, BURST) === 1 && innerOfBtn('id="blastUndoThrow"') === SVG + UNDO + '</svg> Undo last throw');
    const TXT = 'style="flex:1; min-width:0; padding:4px; background:var(--panel); color:var(--ink); border:1px solid var(--edge); border-radius:4px;"', WORD = 'style="font-size:11px; color:var(--dim); width:50px; flex:none;"';
    const BOX = 'style="width:70px; padding:4px; background:var(--panel); color:var(--ink); border:1px solid var(--edge); border-radius:4px;"', GREY = '<div class="draw-menu-row" style="font-size:11px; color:var(--dim); max-width:210px; line-height:1.4;">', DIM = 'style="font-size:11px; color:var(--dim);"';
    const PAIR = '          <div class="tool-pair" style="position:relative;">\n'
        + '              <button class="wb-tool-btn" id="blastModeBtn" title="Radius. Click a cell to place a circle, a ring or a cone. Every token inside shows its distance. Drag a shape to move it, right-click to remove it. Press again to put the tool away.">' + SVG + RADIUS + '</svg></button><button class="wb-tool-btn tool-chev" id="blastOptBtn" title="Radius options" aria-haspopup="true">' + SVG + '<path d="M6 9.5l6 6 6-6"/></svg></button>\n'
        + '              <div class="shape-menu draw-menu" id="blastMenu">\n'
        + '                  <div class="draw-menu-label">Shape</div>\n'
        + '                  <div class="draw-menu-row" id="blastShapeRow">\n'
        + '                      <button class="draw-style-btn active" data-shape="circle" title="A circle. Every token inside shows its distance.">' + SVG + RADIUS + '</svg> Circle</button>\n'
        + '                      <button class="draw-style-btn" data-shape="ring" title="A ring. The tokens between an inner and an outer distance are inside.">' + SVG + RING + '</svg> Ring</button>\n'
        + '                      <button class="draw-style-btn" data-shape="cone" title="A wedge from a point, with an angle you set. Press a cell and drag to aim it.">' + SVG + CONE + '</svg> Cone</button>\n'
        + '                      <button class="draw-style-btn" data-shape="tok" title="A circle that sits on a token and moves with it. Click a token to place it.">' + SVG + AURA + '</svg> On a token</button>\n'
        + '                  </div>\n'
        + '                  <div class="draw-menu-row" id="blastShapeNote" style="font-size:11px; color:var(--dim); max-width:210px; line-height:1.4;">A circle. Every token inside shows its distance.</div>\n'
        + '                  <div class="draw-menu-label">Size</div>\n'
        + '                  <div class="draw-menu-row">\n'
        + '                      <span class="draw-menu-row" id="blastInnerWrap" style="display:none;"><input type="number" id="blastInner" min="0" step="any" aria-label="Inner distance" ' + BOX + '><span ' + DIM + '>to</span></span>\n'
        + '                      <input type="number" id="blastFt" min="0" step="any" aria-label="Size" ' + BOX + '>\n'
        + '                      <span id="blastUnit" ' + DIM + '>yd</span>\n'
        + '                      <span class="draw-menu-row" id="blastAngleWrap" style="display:none;"><input type="number" id="blastAngle" min="1" max="360" step="1" aria-label="Angle in degrees" ' + BOX.replace('70px', '56px') + '><span ' + DIM + '>&deg;</span></span>\n'
        + '                  </div>\n'
        + '                  <div class="draw-menu-row" id="blastAsRow">\n'
        + '                      <button class="draw-style-btn active" data-as="r" title="Your number is read from the centre to the edge">' + SVG + RADIUS + '</svg> Radius</button>\n'
        + '                      <button class="draw-style-btn" data-as="d" title="Your number is read from edge to edge">' + SVG + DIAMETER + '</svg> Diameter</button>\n'
        + '                  </div>\n'
        + '                  ' + GREY + 'The size is in the ruler&rsquo;s unit on this map.</div>\n'
        + '                  <div id="blastElevRow">\n'
        + '                      <div class="draw-menu-label">Height, in <span id="blastElevUnit">yd</span></div>\n'
        + '                      <div class="draw-menu-row">\n'
        + '                          <input type="number" id="blastElev" step="1" aria-label="Height" ' + BOX + '>\n'
        + '                      </div>\n'
        + '                      ' + GREY + 'The height of the last shape or blast placed. It starts at the height of the token in its cell, else the ground.</div>\n'
        + '                  </div>\n'
        + '                  <div class="draw-menu-row" id="blastFlatNote" style="font-size:11px; color:var(--dim);">Token elevation is off for this campaign (&#9881; Settings &#9656; VTT features): flat hex distance.</div>\n'
        + '                  <div class="draw-menu-row" id="blastWhich" style="font-size:11px; color:var(--dim);"></div>\n'
        + '                  <div class="draw-menu-row">\n'
        + '                      <button class="draw-style-btn" id="blastClearBtn" title="Removes the circles, rings and cones you placed. The GM&rsquo;s press also removes thrown blasts, for everyone.">Clear shapes</button>\n'
        + '                  </div>\n'
        + '                  <div class="draw-menu-label gm-only">Blast effects, the GM&rsquo;s</div>\n'
        + '                  <div class="draw-menu-row gm-only">\n'
        + '                      <button class="draw-style-btn" id="blastExplodeBtn" title="Sets off the last shape you placed as an explosion, shown to everyone on the map. You type the damage and its type each time.">' + SVG + BURST + '</svg> Explode&hellip;</button>\n'
        + '                      <button class="draw-style-btn" id="blastUndoThrow" title="Takes back the damage of the last thrown blast or explosion, for every token it hit.">' + SVG + UNDO + '</svg> Undo last throw</button>\n'
        + '                  </div>\n'
        + '                  <div class="gm-only" id="blastExplodeForm" style="display:none;">\n'
        + '                      <div class="draw-menu-row"><span ' + WORD + '>Damage</span><input type="text" id="blastDmg" autocomplete="off" spellcheck="false" maxlength="300" aria-label="Damage, a number or a roll" ' + TXT + '></div>\n'
        + '                      <div class="draw-menu-row"><span ' + WORD + '>Type</span><input type="text" id="blastDmgType" autocomplete="off" spellcheck="false" maxlength="40" aria-label="Damage type, a word" ' + TXT + '></div>\n'
        + '                      <label class="draw-menu-row fog-tick" id="blastHitCentreRow" style="display:none; align-items:center; gap:6px; cursor:pointer; font-size:12px;" title="Ticked, this explosion also hits the token the circle sits on. It is unticked each time these boxes open."><input type="checkbox" id="blastHitCentre"> <span>Also hits the token at the centre</span><small>Unticked, that token is spared.</small></label>\n'
        + '                      <div class="draw-menu-row">\n'
        + '                          <button class="draw-style-btn" id="blastExplodeGo" title="Sets it off with the damage and the type you typed">Explode</button>\n'
        + '                          <button class="draw-style-btn" id="blastExplodeNo" title="Puts the two boxes away and sets nothing off">Cancel</button>\n'
        + '                      </div>\n'
        + '                  </div>\n'
        + '                  <div class="draw-menu-row gm-only" style="font-size:11px; color:var(--dim); max-width:210px; line-height:1.4;">Explode sets off the last shape you placed. It asks for the damage and its type each time. Nothing is filled in.</div>\n'
        + '              </div>\n'
        + '          </div>\n';
    check('the Radius tool is everyone\'s (the owner: "everybody else can use the circle measurement tool as a measurement tool"): its pair is not the GM\'s alone and no rule hides it at someone else\'s table; its options are the Shape row of four, the last a circle on a token, with a grey line that says what the shape in use is, a size with the ruler\'s unit beside it, a ring\'s inner distance and a cone\'s angle each shown with its own shape, Radius or Diameter, the height, and Clear shapes; what is the GM\'s inside them is marked so and no more, as on the sheet the owner passed: the label Blast effects, the row of Explode and Undo last throw, the two boxes Explode asks for, put away until it is pressed, and the grey line that says nothing is filled in; and nothing is: neither box has a value or an example written in it, and the tick that asks about the token at the centre is put away with them and is not ticked in the page; no word of the old blast tool is left in them',
        count(ix, PAIR) === 1 && !/net-client[^{}]*#blast/.test(css) && !/net-client[^{}]*:has\(> #blastModeBtn\)/.test(css) && count(PAIR, 'gm-only') === 4 && !/id="blastDmg(Type)?"[^>]*\b(value|placeholder)=/.test(PAIR) && !/id="blastHitCentre"[^>]*\bchecked/.test(PAIR) && count(PAIR, '<label class="draw-menu-row fog-tick" id="blastHitCentreRow" style="display:none;') === 1 && count(PAIR, 'id="blastExplodeForm" style="display:none;"') === 1 && !/Blast Radius|area effect|quick|ad-hoc|&divide;3|Clear blasts/.test(PAIR)
        && count(ix, ' id="blastPresetRow"') === 0 && !/Blast \(GM quick-tool\)|title="Blast options"/.test(ix));
    check('a shape of the Radius tool measures, so it wears the ruler\'s gold, and a thrown blast keeps its red: a circle, or the path of a ring or a cone, its dot and its label by one class of the style sheet, a cone\'s handle that can be grabbed, the options held to the window\'s height with their four shapes two to a row and Explode in the blast\'s red, a circle on a token whose centre lets a press through to the token and whose edge does not wear the cursor of a shape that can be dragged, the distances in the page\'s ink as a blast\'s are, and a token inside circles alone outlined gold where one inside a blast is outlined red',
        css.includes('  #measureLayer g.blast.own .area { fill: rgba(224,165,79,0.1); stroke: var(--gold); stroke-width: 2; stroke-dasharray: 6 4; }') && css.includes('\n  #measureLayer g.blast.own circle.dot, #measureLayer g.blast.own text { fill: var(--gold); }\n  #measureLayer g.blast.own text.hit { fill: var(--ink); }\n  #measureLayer g.blast.own:hover .area { fill: rgba(224,165,79,0.2); }\n')
        && css.includes('  #measureLayer g.blast circle.blast-aim { fill: var(--gold); stroke: var(--bg); stroke-width: 2; pointer-events: auto; cursor: grab; }') && css.includes('    #blastMenu { max-height: calc(100vh - 96px); overflow-y: auto; overflow-x: hidden; }') && css.includes('\n    #blastShapeRow { flex-wrap: wrap; }') && css.includes('\n    #blastShapeRow > .draw-style-btn { flex: 1 1 40%; }\n') && css.includes('\n    #blastExplodeBtn { color: var(--red); }') && css.includes('\n    #blastExplodeForm { display: flex; flex-direction: column; gap: 6px; }')
        && css.includes('\n  #measureLayer g.blast.on-tok { cursor: default; }') && css.includes('\n  #measureLayer g.blast.on-tok circle.dot { pointer-events: none; }')
        && css.includes('  .wb-item.blast-hit { outline: 2px solid var(--red); outline-offset: 2px; }\n  .wb-item.circle-hit { outline: 2px solid var(--gold); outline-offset: 2px; }')
        && css.includes('  #measureLayer line { stroke: var(--gold); stroke-width: 2; stroke-dasharray: 8 5; }') && css.includes('  #measureLayer g.blast circle.area { fill: rgba(217,83,79,0.14); stroke: var(--red); stroke-width: 2; stroke-dasharray: 6 4; }'));
    const helpAt = ix.indexOf('<h4>Radius</h4>'), helpR = helpAt < 0 ? '' : ix.slice(helpAt, ix.indexOf('<h4>Elevation &amp; posture</h4>', helpAt));
    check('Help says what the tool is now: an entry of its own named Radius (how a shape is placed and sized, a circle\'s two readings, the ring, the cone, the circle on a token, the ruler\'s unit, that circles are yours alone and everyone has the tool, that for players it only measures), Boom as the GM\'s, Explode as the GM\'s with what it asks and what it does, and blasts from the sheet; the other entries that named the blast tool name the Radius tool, and so do Settings, the tips, those on the tool\'s own boxes among them, and the note under a hidden piece\'s ground height',
        helpR.length > 1500 && count(ix, '<h4>Blast radius</h4>') === 0
        && helpR.includes('<li>The <b>Radius</b> tool places a circle, a ring or a cone on the map to measure with. Press the small arrow beside it, pick a shape, type a size, and click a cell. Every token inside lights up with its distance from the centre.')
        && helpR.includes('<li>For a circle, <b>Radius</b> reads your number from the centre to the edge. <b>Diameter</b> reads it from edge to edge.</li>') && helpR.includes('<li><b>Ring</b> takes two distances. The tokens between the two are inside, and the ones nearer than the first are not.</li>')
        && helpR.includes('<li><b>Cone</b> is a wedge from a point, with an angle you set in degrees. Press a cell and drag to aim it. Drag the handle on its far edge to turn it later. A token standing on the point is not counted.</li>') && helpR.includes('<li><b>On a token</b> puts a circle on a token you click. The circle moves with its token, and the token itself is not counted. Right-click the circle&rsquo;s edge to remove it.</li>') && helpR.includes('<li>The size is in the ruler&rsquo;s unit on that map, so 20 on a map in feet is 20 feet. The distances read in that unit too.</li>')
        && helpR.includes('<li>What you place is yours alone, like a ruler. Everyone at the table has the tool, and nobody else sees your shapes.</li>') && helpR.includes('<li>For players the tool only measures. A blast with damage is thrown from a character&rsquo;s sheet, or set off by the GM with <b>Explode</b>.</li>')
        && helpR.includes('<li><b>Explode:</b> the GM can set off the last shape placed as an explosion. Press <b>Explode</b> in the tool&rsquo;s options, type the damage and its type, and press Explode under them.')
        && helpR.includes('<li>The damage is a number or a roll, such as <code>6d6</code>. The type is a word, such as burning. Both are typed each time, and nothing is filled in.</li>')
        && helpR.includes('<li>The explosion is shown to everyone on the map, as a thrown blast is. The damage then follows the system&rsquo;s <b>Blast automation</b> setting.</li>') && helpR.includes('<li>The type is named on the roll&rsquo;s card. It does not change the number.</li>')
        && helpR.includes('<li>It hits the tokens the shape held. The token a circle sits on is spared, unless you tick <b>Also hits the token at the centre</b>. The tick is off each time.</li>') && helpR.includes('<li><b>Undo last throw</b>, beside Explode, takes the damage back.</li>')
        && helpR.includes('<li>A ring hits the tokens between its two distances, and a cone the tokens within its angle. Everyone on the map is shown that shape.</li>') && helpR.includes('<li>Cover is judged from a ring&rsquo;s centre and from a cone&rsquo;s point.</li>')
        && helpR.includes('<li>No shape explodes while its centre, or a cone&rsquo;s point, is inside a wall or a closed door.</li>') && !/does not explode/.test(ix)
        && helpR.includes('<li><b>Boom:</b> with Visual effects on, the GM sees a <b>Boom</b> label on each circle and each thrown blast.') && helpR.includes('<div class="help-tip"><b>Blasts from the sheet:</b> a blast with damage is thrown by a character, PC or NPC, from their sheet.')
        && count(ix, 'On the GM&rsquo;s screen, a circle of the Radius tool or a thrown blast gains a <b>Boom</b>.') === 1 && count(ix, 'A circle of the Radius tool or a thrown blast shows each token&rsquo;s cover from its centre beside its distance.') === 1
        && count(ix, 'The toolbar&rsquo;s Radius tool measures, and its circles are yours alone. The GM can set one off as an explosion with <b>Explode</b>.') === 1 && count(ix, '<li>Undo a full-auto throw with <b>Undo last throw</b> in the Radius tool&rsquo;s options.</li>') === 1 && !/&#128165; menu/.test(ix) && count(ix, 'and the Radius tool and rulers measure straight-line, height included.') === 1 && count(ix, 'and a circle of the Radius tool gets a Boom.') === 1
        && !/Blast tool|blast tool|&#128165; Blast|toolbar &#128165;/.test(ix) && !/blast tool|area-effect|goes off, in yards/.test(read('scripts/tips.js')) && count(read('scripts/tips.js'), "    blastFt: 'The size of the shape, in the ruler\\'s unit on this map. For a circle it is read as a radius or as a diameter.',") === 1
        && count(read('scripts/tips.js'), "    blastDmg: 'The damage of the explosion. It is a number or a roll, and you type it each time.',") === 1 && count(read('scripts/tips.js'), "    blastDmgType: 'The type of the damage, a word. It is named on the roll\\'s card and changes no number.',") === 1 && count(read('scripts/inspector.js'), 'your own rolls and your Radius tool do.</div>') === 1);
    check('the drawings the layout added are the sheet\'s own or the simplest there is: More wears the sheet\'s three dots, a tick of the View menu is the tick Snap\'s Both wears, and the zoom box\'s minus is the plus without its upright',
        draw('wbMoreBtn') === DOTS && innerOfBtn('id="wbMoreBtn"').indexOf('<svg class="ico ico-dots"') === 0 && css.includes('    .ico.ico-dots { stroke-width: 2.6; }')
        && ['wbRulersBtn', 'wbZoomCtlBtn', 'wbPointerPosBtn'].every(id => draw(id) === TICK) && svgIn(innerOfBtn('data-mode="both"')) === TICK
        && draw('zoomOutBtn') === MINUS && draw('zoomInBtn') === '<path d="M12 4.5v15M4.5 12h15"/>' && draw('zoomInBtn').includes(MINUS.slice(9, -3)), J([draw('wbMoreBtn'), draw('wbRulersBtn'), draw('zoomOutBtn'), draw('zoomInBtn')]));
    // left as they are, on purpose: a pen tip IS its shape, and Snap's switch row has its words written by the script
    check('left as they were, on purpose: the pen\'s three tips are their own shapes, and Snap\'s switch row keeps the words its script writes',
        innerOfBtn('data-tip="round"') === '&#9679; Round' && innerOfBtn('data-tip="square"') === '&#9632; Square' && innerOfBtn('data-tip="flat"') === '&#9698; Flat' && innerOfBtn('id="snapOffBtn"') === '&#9211; Turn snapping off');
    // every drawing is a plain path (or, for the note, a path and two circles): nothing else can stand in an icon
    const zoomIcons = ['zoomOutBtn', 'zoomInBtn'].map(id => [id, innerOfBtn('id="' + id + '"')]);
    const odd = bar.concat(menu, zoomIcons).filter(b => { const s = svgIn(b[1]); return typeof s !== 'string' || !/^<path d="[MmLlHhVvAaCcSsZz0-9 .,-]+"\/>(<circle cx="[\d.]+" cy="[\d.]+" r="[\d.]+"\/>){0,2}$/.test(s); }).map(b => b[0]);
    check('an icon is a path of plain drawing commands, and for the music note a path and two circles: no script, no link, no picture and no style can stand in one', odd.length === 0, J(odd));
}

/* ---------- an icon the app already has keeps its drawing ---------- */
const hdr = id => { const at = ix.indexOf(' id="' + id + '"'); if (at < 0) return null; const a = ix.indexOf('<svg class="ico"', at), gt = ix.indexOf('>', a), z = ix.indexOf('</svg>', gt); return a < 0 || a - at > 600 ? null : ix.slice(gt + 1, z); };
{
    const note = svgIn(innerOfBtn('id="musicBtn"'));
    check('the music icon stays a note (the owner: "also id like the music icon to stay a note"): Music under Scene wears the very note of the top bar\'s music button, two notes joined by a double beam as the owner passed it redrawn, and the style sheet fills the two heads on both',
        typeof note === 'string' && note === hdr('musicInd') && note === '<path d="M8.5 17.5V6.4l10.5-2.6v11.2M8.5 10.4l10.5-2.6"/><circle cx="6" cy="17.5" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/>' && innerOfBtn('id="musicBtn"').includes('<svg class="ico ico-note"')
        && css.includes('    .ico.ico-note circle { fill: currentColor; stroke: none; }') && css.includes('  #musicInd .ico circle { fill: currentColor; stroke: none; }'), J([note, hdr('musicInd')]));
    check('the other icons the app already had are the same drawings where the toolbar uses them: Sound under Scene is the top bar\'s speaker, Add is its plus, Clear board is its bin, and the fog\'s Clear brush is the close mark',
        svgIn(innerOfBtn('id="soundBtn"')) === hdr('soundInd') && svgIn(innerOfBtn('id="addMenuBtn"')) === hdr('newCampBtn') && svgIn(innerOfBtn('id="clearWbBtn"')) === hdr('delCampBtn') && svgIn(innerOfBtn('data-fbrush="clear"')) === hdr('docReaderClose')
        && [hdr('soundInd'), hdr('newCampBtn'), hdr('delCampBtn'), hdr('docReaderClose')].every(s => typeof s === 'string' && s.length > 10));
    check('the Waypoint mark is the icon the app uses today (the owner: "and the waypoint icon to be the icon we use today, not the compass"): the top bar\'s mark is the app\'s own icon file, shown as a picture, and the file is there',
        count(ix, '<img src="icon.ico" alt="" class="brand-icon">') === 1 && /<div class="header-brand" id="headerBrand"[^>]*>\n\s*<img src="icon\.ico" alt="" class="brand-icon">\n\s*<h1>Waypoint<\/h1>/.test(ix)
        && fs.existsSync(path.join(app, 'icon.ico')) && fs.statSync(path.join(app, 'icon.ico')).size > 1000);
}

/* ---------- the top bar's icons, redrawn as the app's own ---------- */
// Backlog 131. The owner, by prompt, 2026-10-06, of the top bar's icons that matched the drawings of another icon set: "Redraw them as our
// own", a sheet before any is used; and of that sheet, by prompt, 2026-10-07: "Use these drawings (Recommended)". Each drawing below is the
// sheet's own, made for Waypoint from plain lines, arcs and outlines on the 24 by 24 grid, and it stands on EVERY control that wears it: an
// icon the app has keeps one drawing wherever it is used. A changed or a new drawing is shown to the owner first, and these move only then.
// The drawings they replaced are known here by the hashes of their paths alone, so that none comes back with a copy from an older page
{
    const p = d => '<path d="' + d + '"/>', RING = 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z';
    const OWN = {
        search: p('M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.4 15.4l5.1 5.1'),   // a lens and its handle
        plus: p('M12 4.5v15M4.5 12h15'), minus: p('M4.5 12h15'),   // two lines, and the bar that is the plus without its upright
        rename: p('M14.5 4l5 5L9 19.5 3.5 21 5 15.5 14.5 4zM12.5 6l5 5'),   // a pencil with its band
        trash: p('M4 7h16M10 4h4M6.5 7l1 13h9l1-13M9.8 10.5v6M12 10.5v6M14.2 10.5v6'),   // a bin with a knob on its lid and three ribs
        playV: p('M4 5h16v14H4zM7 16l1.8-1.8M10.6 12.4l1.8-1.8M15 8l3 3M18 8l-3 3'),   // a map sheet with a dashed trail to a cross
        clock: p(RING + 'M12 7.5V12l-3 2.2'),
        up: p('M13 3.5H6v17h12v-5.5M11.5 9.5H21M17.5 6L21 9.5 17.5 13'),   // a page with an arrow leaving it
        down: p('M13 3.5H6v17h12v-5.5M21 9.5h-9.5M15 6l-3.5 3.5L15 13'),   // the same page, the arrow coming in
        update: p('M6.5 12L12 6.5l5.5 5.5M6.5 18L12 12.5l5.5 5.5'),   // two chevrons pointing up
        net: p(RING + 'M12 3.5c-4.4 4.8-4.4 12.2 0 17M12 3.5c4.4 4.8 4.4 12.2 0 17M4.6 9h14.8M4.6 15h14.8'),   // a globe with two lines of latitude
        chat: p('M5 4.5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7.5L7 20.5v-4H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM7.5 9h9M7.5 12.5h5.5'),   // a speech box with two lines of text
        sound: p('M3.5 9.5H7l5-4v13l-5-4H3.5zM15.5 9.3a4 4 0 0 1 0 5.4M18.2 6.8a8 8 0 0 1 0 10.4'),   // a speaker with two waves
        music: p('M8.5 17.5V6.4l10.5-2.6v11.2M8.5 10.4l10.5-2.6') + '<circle cx="6" cy="17.5" r="2.5"/><circle cx="16.5" cy="15" r="2.5"/>',   // still a note: two notes joined by a double beam
        handouts: p('M8.5 3.5h11v14h-11zM5 7v13.5h11M11.5 8h5M11.5 11.5h5'),   // two sheets, one behind the other
        journal: p('M6.5 3.5H18v17H6.5a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2zM4.5 16.5a2 2 0 0 1 2-2H18M10 3.5v6.5l2-1.5 2 1.5V3.5'),   // a closed book with a ribbon
        refresh: p('M19.5 12a7.5 7.5 0 1 1-2.2-5.3M17.6 2.8v4.2h-4.2'),   // one round arrow
        gear: p('M10.2 5.1L10.7 2.8L13.3 2.8L13.8 5.1A7.1 7.1 0 0 1 15.6 5.9L17.6 4.6L19.4 6.4L18.1 8.5A7.1 7.1 0 0 1 18.9 10.2L21.2 10.7L21.2 13.3L18.9 13.8A7.1 7.1 0 0 1 18.1 15.6L19.4 17.6L17.6 19.4L15.6 18.1A7.1 7.1 0 0 1 13.8 18.9L13.3 21.2L10.7 21.2L10.2 18.9A7.1 7.1 0 0 1 8.5 18.1L6.4 19.4L4.6 17.6L5.9 15.6A7.1 7.1 0 0 1 5.1 13.8L2.8 13.3L2.8 10.7L5.1 10.2A7.1 7.1 0 0 1 5.9 8.5L4.6 6.4L6.4 4.6L8.4 5.9A7.1 7.1 0 0 1 10.2 5.1zM12 8.9a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2z'),   // a cog: eight teeth round a ring, and a hole
        help: p(RING + 'M9.4 9.6a2.7 2.7 0 1 1 3.9 2.4c-.8.4-1.3 1-1.3 1.9M12 16.9h.01'),
        about: p(RING + 'M12 11v5.6M12 7.5h.01'),
        fromFile: p('M6 3.5h8.5L18 7v13.5H6zM12 9.5v7.5M9 14l3 3 3-3') };   // a page with a clipped corner and an arrow into it
    const WEARS = { search: ['id="searchCampBtn"', 'id="searchDocsBtn"', 'id="searchPlannersBtn"', 'id="searchMapsSidebarBtn"'], plus: ['id="newCampBtn"', 'id="newDocBtn"', 'id="newPlannerBtn"', 'id="newMapSidebarBtn"', 'id="addMenuBtn"', 'id="zoomInBtn"', 'id="mapTabAdd"'],
        minus: ['id="zoomOutBtn"'], rename: ['id="renameCampBtn"'], trash: ['id="delCampBtn"', 'id="clearWbBtn"'], playV: ['data-mode="visual"'], clock: ['id="clockChip"'], up: ['id="saveAsBtn"'], down: ['id="importBtn"'], update: ['id="updateBtn"'],
        net: ['id="netBtn"'], chat: ['id="chatBtn"'], sound: ['id="soundInd"', 'id="soundBtn"', 'data-press="soundInd"'], music: ['id="musicInd"', 'id="musicBtn"', 'data-press="musicInd"'], handouts: ['id="handoutsBtn"', 'data-press="handoutsBtn"'],
        journal: ['id="journalBtn"', 'data-press="journalBtn"'], refresh: ['id="refreshBtn"'], gear: ['id="settingsBtn"'], help: ['id="helpBtn"', 'data-press="helpBtn"'], about: ['id="aboutBtn"'], fromFile: ['id="docFromFileBtn"', 'id="plannerFromFileBtn"', 'id="plannerImportBtn"'] };
    // already the app's own before the sheet, and staying as the sheet said: System's sheet, the Data Map's three rooms, Collapse all, Outline, the cross and the triangle
    const CHEV2 = p('M7 20l5-5 5 5M7 4l5 5 5-5'), STEPS3 = p('M4 6h16M8 12h12M12 18h8');
    const STAY = { 'id="systemBtn"': p('M5 3h14v18H5zM9 8h6M9 12h6M9 16h4'), 'data-mode="data"': p('M6 2.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM18 2.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM12 16.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM8.5 5h7M7.2 7.2l3.6 7.3M16.8 7.2l-3.6 7.3'),
        'id="collapseAllDocsBtn"': CHEV2, 'id="collapseAllPlannersBtn"': CHEV2, 'id="collapseAllMapsBtn"': CHEV2, 'id="plannerOutlineBtn"': STEPS3, 'id="docReaderOutline"': STEPS3, 'id="docReaderClose"': p('M6 6l12 12M18 6L6 18'), 'id="renderPlannerBtn"': p('M6 3l14 9-14 9V3z') };
    const h0 = ix.indexOf('id="helpModal"'), h1 = ix.indexOf('<div class="layout-wrapper">', h0), page = h0 < 0 || h1 < h0 ? '' : ix.slice(0, h0) + ix.slice(h1);   // the page without Help: where the controls are
    const ONE = /<svg class="ico( ico-[a-z]+)?" viewBox="0 0 24 24" aria-hidden="true">[\s\S]*?<\/svg>/g;
    // the one drawing on a control that is in the page exactly once
    const iconAt = how => { const at = page.indexOf(how); if (at < 0 || page.indexOf(how, at + 1) >= 0) return '?'; const gt = page.indexOf('>', at), end = page.indexOf('</button>', gt), m = gt < 0 || end < 0 ? null : page.slice(gt + 1, end).match(ONE);
        return m && m.length === 1 ? m[0].slice(m[0].indexOf('>') + 1, -6) : '?'; };
    const wrong = [], nWear = Object.keys(WEARS).reduce((n, k) => n + WEARS[k].length, 0);
    Object.keys(WEARS).forEach(k => WEARS[k].forEach(h => { if (iconAt(h) !== OWN[k]) wrong.push(h + ' is not ' + k); }));
    const header = ix.slice(ix.indexOf('<header>'), ix.indexOf('</header>'));
    check('the top bar\'s icons are the app\'s own drawings (the owner: "Redraw them as our own", the sheet passed with "Use these drawings"): each of the twenty drawings of the sheet stands on every control that wears it, thirty-five controls in all, and on the five rows of More that stand for a control folded out of the row: the lens on the four Search buttons, the plus on the four New buttons, on Add, on zoom in and on the map tabs\' plus, with zoom out\'s bar the plus without its upright, the pencil, the bin on Delete and on Clear board, the Play Map\'s sheet with its trail, the clock, the page with an arrow out and in on Export As and Import, the two chevrons of Update, the globe, the speech box, the speaker in the Table pill and under Scene, the note in both, the two sheets of Handouts, the Journal\'s closed book, the round arrow, the cog, the question mark and the i in their rings, and the page with an arrow into it on the three From a file buttons; no two are the same drawing, and the top bar holds its twenty-one icons as before, with the small arrow beside the campaign\'s name and those five rows',
        page.length > 100000 && wrong.length === 0 && Object.keys(OWN).length === 21 && J(Object.keys(OWN).sort()) === J(Object.keys(WEARS).sort()) && nWear === 40 && new Set(Object.values(OWN)).size === 21
        && OWN.plus === p('M12 4.5v15' + OWN.minus.slice(9, -3)) && count(header, '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">') === 47 && count(header, SVG + '<path d="M6 9.5l6 6 6-6"/></svg>') === 1, J(wrong));
    // The cog, read as geometry and never by one runtime's arithmetic: its outline is eight teeth, each four points (the ring, the tip, the tip,
    // the ring) 15 and 8 degrees either side of a tooth's middle, the first tooth pointing up, and it closes where it began; then the hole
    const cogD = OWN.gear.slice(9, -3), cut = cogD.indexOf('zM'), pts = [];
    cogD.slice(0, cut).replace(/([MLA])([^MLA]*)/g, (m, c, nums) => { const v = nums.trim().split(/[ ,]+/).map(Number); pts.push(c === 'A' ? [v[5], v[6], v.length === 7 && v[0] === 7.1 && v[1] === 7.1 && v[4] === 1] : [v[0], v[1], v.length === 2]); return m; });
    const off = pts.slice(0, 32).filter((q, i) => { const k = Math.floor(i / 4), j = i % 4, R = j === 0 || j === 3 ? 7.1 : 9.3, deg = (k * 45 - 90 + [-15, -8, 8, 15][j]) * Math.PI / 180, x = 12 + R * Math.cos(deg), y = 12 + R * Math.sin(deg);
        return !(q[2] === true && Math.abs(q[0] - x) < 0.08 && Math.abs(q[1] - y) < 0.08); });
    const plain = s => /^<path d="[MmLlHhVvAaCcSsZz0-9 .,-]+"\/>(<circle cx="[\d.]+" cy="[\d.]+" r="[\d.]+"\/>){0,2}$/.test(s);
    check('each of those drawings is made of plain geometry, a path of plain drawing commands and, for the note alone, two heads; and the cog is what the sheet said, eight teeth round a ring and a hole: thirty-two points, each on the ring or on a tip where a tooth of that count puts it, the outline closed where it began, and a round hole in the middle',
        Object.keys(OWN).every(k => plain(OWN[k]) && (OWN[k].indexOf('<circle') >= 0) === (k === 'music')) && Object.keys(STAY).every(h => plain(STAY[h]) && STAY[h].indexOf('<circle') < 0)
        && cut > 0 && pts.length === 33 && off.length === 0 && pts[32][0] === pts[0][0] && pts[32][1] === pts[0][1] && pts[32][2] === true && cogD.slice(cut) === 'zM12 8.9a3.1 3.1 0 1 0 0 6.2 3.1 3.1 0 0 0 0-6.2z', J([pts.length, off]));
    const moved = Object.keys(STAY).filter(h => iconAt(h) !== STAY[h]);
    check('the drawings that were the app\'s own already stay as they were, as the sheet said: System\'s sheet with three lines, the Data Map\'s three rooms and their links, the two chevrons of the three Collapse all buttons, the stepped lines of the two Outline buttons, the cross that closes a page and the triangle that reads a planner',
        moved.length === 0 && Object.keys(STAY).length === 9, J(moved));
    // every path the app writes anywhere, in the page with Help, in a script and in the style sheet, by its hash
    const GONE = ['5e6660965155792d2c26d443ed429e290d4463de9d36ff84f7779c50e3e31b28', '07a6bbb8f424ba6c0f80de4a8f3e540cb3d3a886a99276c03e490ea2b9041d0b', 'cc33539c17e46d9d12b543874cde19a1f7291f5c0f73a1cc8c12ff43b1145879', 'cc702b5af64cc79bfc48f04f12a76eb8495f3ec73cfb4b600338e6d1297e3a84',
        'dd5c14c131d360ea029cf78030246440e723734654995d3ec232a103edb54387', 'ed0e8a4d7881c927b51e3fcf7ac141db21ff8498c7c40a6a02db375367c7afd0', '046f4ead368a82d171745d6eb279b69ae822ede7c4506256113d88bbf0115fc8', '9d87c5ffb18876a8ec18b8e15611a8bc05fdf3071233030e0115b6ca77579de9',
        'c4940a576819d8bb257e5038f90920d211f2cfb12c98776d3772920c271ea14e', 'd2a12653e6a67f9115f0c503a1963652376801410d3d9cca02149b21923b05e5', '17905e45666b4e3d53594ebb472a013aa664a79288c8c2da3b1c6e7277f129a6', 'aff931f105ea03a65ff9c84dcf0ce9abfc6ffd9e81625ec4f9d50e0fdc2b35c4',
        '7bbc989121192a83c4b3f38ec304ee651db8580970a3250b6fd759ec287611d1', '0c117f55860b0e8b9b7851986d1d118743fa45d336b205c721ab962954222cb3', '0bbed630c922e1ab3ae1e8a2c3f0d608a3436e06245aae2808b63f6a7ed940e3', 'f4074b7bfc948d9c00949faeacb44208444b7d11acb7537c23b491c00b4520e8',
        '467e9794ce50a22c3e8133afacf68570d723e93442c26b63987f865f67511e97', 'e29b18f61a70b904e1644eb7a7c161fda777a487dd5b0086a9e5ddb97e52e418', 'eb0b23f43d892327a9cbfb2a714759141a95dd26ba8c075e3a4f0f3b47fb3408', '6cb99be45d63a3e0303fdef10eb701fb96742c8eec7df8780a9dbbe079daba18'];
    const ds = [];
    [ix, css].concat(fs.readdirSync(path.join(app, 'scripts')).filter(f => /\.js$/.test(f)).map(f => read('scripts/' + f))).forEach(s => { s.replace(/\\/g, '').replace(/ d=["']([^"']+)["']/g, (m, d) => { ds.push(d); return m; }); });
    const back = ds.filter(d => GONE.indexOf(crypto.createHash('sha256').update(d).digest('hex')) >= 0);
    check('none of the drawings they replaced is left anywhere: every path the page writes, Help with it, every path a script writes and every path in the style sheet is held against the twenty that went, which the suite knows by their hashes alone; the paths are found at all, the cog and Help\'s copies among them',
        ds.length > 150 && back.length === 0 && GONE.length === 20 && new Set(GONE).size === 20 && ds.indexOf(cogD) >= 0 && ds.filter(d => d === OWN.sound.slice(9, -3)).length === 7, J([ds.length, back.length]));   // the speaker: its two controls, its row of More, and Help's copies
}

/* ---------- the top row: one quiet row on every view ---------- */
// Backlog 107, the look's second part. The owner, 2026-10-06, of the top of the window: "one slim row, with the option of hiding it"; the
// mock-up passed "as drawn", in their words "1 as long as we are not getting rid of import and export"; and of where: "One row everywhere".
// Step R1a was the row's look alone: the captioned boxes went, each control is a bare icon, the mark stands alone. Step R1b is the Campaign
// menu: the five campaign buttons are rows of it, and the page's own campaign list stays in the page, out of sight. Step R1c is More: Export
// As with its kinds, Import, Refresh and About are rows of it. ORDER is every id of the header in the order it stands in: a control that
// moves under a menu moves in this list in the same fold, and is never dropped from it
{
    const hA = ix.indexOf('<header>'), hZ = ix.indexOf('</header>'), header = hA > 0 && hZ > hA ? ix.slice(hA, hZ) : '';
    const ids = (header.match(/ id="[A-Za-z0-9_-]+"/g) || []).map(s => s.slice(5, -1));
    const ORDER = ['headerBrand', 'campMenuWrap', 'campMenuBtn', 'campMenuName', 'campMenu', 'campMenuList', 'searchCampBtn', 'newCampBtn', 'renameCampBtn', 'systemBtn', 'delCampBtn', 'campaignSelect', 'tableWhere', 'viewModeSelect', 'mapTabs', 'mapTabFront', 'mapTabPin', 'mapBreadcrumb', 'mapTabName', 'mapTabHere', 'mapTabHereN', 'mapTabList', 'mapTabAdd', 'tableWhereMap', 'clockChip', 'videoChip', 'rowPills', 'fogPill', 'tablePill', 'pausedPill', 'roundPill', 'viewPill', 'visualTools', 'imgFileIn', 'sheetFileIn',
        'fileIn', 'docImportFile', 'updateBtn', 'reviewChip', 'reviewChipN', 'netBtn', 'netDot', 'sessionPauseBtn', 'chatBtn', 'chatBadge', 'soundInd', 'musicInd', 'handoutsBtn', 'journalBtn', 'journalBadge', 'settingsBtn', 'helpBtn',
        'moreMenuWrap', 'moreMenuBtn', 'moreMenu', 'moreFiles', 'saveAsDropdownWrap', 'saveAsBtn', 'saveAsMenu', 'exportImgBtn', 'exportPdfBtn', 'exportHtmlBtn', 'exportMdBtn', 'exportItemBtn', 'exportMapsBtn', 'exportWbsBtn', 'exportPlannersBtn', 'exportDocsBtn',
        'exportCampaignBtn', 'exportBtn', 'importBtn', 'refreshBtn', 'aboutBtn', 'moreFold', 'rowHideBtn', 'saveNote'];
    check('the top row, nothing is gone: every control the header had is still in it, each id once, in the order the row and its two menus give them now (the five campaign buttons inside the campaign\'s menu, the page\'s own campaign list after them; Export As with its eleven kinds, Import, Refresh and About inside More), the eleven kinds of Export and Import among them (the owner: "as long as we are not getting rid of import and export"); every one of the top bar\'s list is in it',
        header.length > 4000 && J(ids) === J(ORDER) && new Set(ids).size === ids.length && HEADER.every(id => ids.indexOf(id) >= 0), J(ids.filter((id, i) => id !== ORDER[i]).slice(0, 6)));
    const ROW = '  header { padding: 4px 10px; gap: 6px; row-gap: 4px; min-height: 36px; box-sizing: border-box; background: var(--bg2); }\n'
        + '  header h1 { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); }   /* the mark alone stands in the row: the name stays for a screen reader */\n'
        + '  header .header-brand { padding: 0 2px; }\n  header .brand-icon { width: 22px; height: 22px; }\n  header .header-sep { height: 18px; }\n  header .header-group { gap: 5px; }\n'
        + '  header .hdr-group { gap: 1px; padding: 0; margin-left: 0; border: 0; border-radius: 0; background: none; }\n  header .hdr-group::before { content: none; }\n'
        + '  header .tool.icon { width: 28px; height: 26px; border-color: transparent; background: transparent; color: var(--dim); border-radius: 6px; }\n'
        + '  header .tool.icon:hover { background: var(--panel2); border-color: transparent; color: var(--ink); }\n  header .tool.icon.danger:hover { color: var(--red); }\n  header .tool.icon.on { background: var(--gold); color: #1a1a1a; }\n';
    check('the top row is one quiet row (the owner: "one slim row"): the header is 36 high where one row holds it, on the page\'s second ground; the boxes that were captioned have no edge, no ground and no caption, and each control is a bare icon that lights under the pointer, red for Delete and gold while it is on; the mark stands alone and the name stays in the page, put out of sight without being taken out of it; the row still wraps where a window is too narrow, so nothing is cut off; the note that says the campaign is saved keeps its reserved width, so the row does not shift when its words change',
        count(css, ROW) === 1 && /\n  header\{\n    flex:0 0 auto; padding:8px 16px;[^\n]*\n    border-bottom:1px solid var\(--edge\); display:flex;align-items:center;gap:10px;flex-wrap:wrap;\n  \}/.test(css)
        && count(ix, '<h1>Waypoint</h1>') === 1 && !/header h1 \{[^}]*display: none/.test(css) && css.includes('  .save-note{font-size:11px;color:var(--faint);letter-spacing:.04em;white-space:nowrap;min-width:184px}')
        && count(header, 'class="hdr-group" data-label="') === 3 && ['Table', 'Journal', 'App'].every(l => count(header, 'class="hdr-group" data-label="' + l + '"') === 1));
    const said = [ix, read('scripts/sheets.js'), read('scripts/sound.js'), tourSrc, read('scripts/tips.js')];
    check('no word still names the boxes that are gone: Help, Settings, the tour, the tips and the sheet\'s own refusals say the top row, where they said the Table pill, the Table bar and the Campaign pill',
        said.every(s => !/Table pill|Campaign pill|top <b>Table<\/b> bar|Journal pill|App pill|sheet icon beside Rename/.test(s)) && count(ix.replace(/<svg class="ico"[^>]*>[\s\S]*?<\/svg>/g, '{ico}'), '<li>Use the <b>&#9208;&#65039;</b> button in the top row, the <b>{ico}</b> panel,') === 1);
}

/* ---------- gold for what is in hand and what is on ---------- */
{
    check('gold is the one accent on the bar (the owner: "Gold"): the tool in hand, the pen size in use and a chip that is on are gold with dark ink, the light theme keeps its white ink on its darker gold, and the bar\'s old blue is nowhere in the style sheet',
        css.includes('    .wb-tool-btn.active {\n        background: var(--gold);\n        color: #1a1a1a;\n    }\n') && css.includes('    .draw-size-btn.active { background: var(--gold); color: #1a1a1a; }\n')
        && css.includes('    .draw-style-btn.active { background: var(--gold); color: #1a1a1a; }\n') && count(css.toLowerCase(), '#4a90e2') === 0
        && css.includes('  html[data-theme="light"] .wb-tool-btn.active, html[data-theme="light"] .draw-size-btn.active, html[data-theme="light"] .draw-style-btn.active { color: #fff; }'));
    check('the icons\' sizes and the menus\' sliders and ticks: a lone icon on a bar button is 19 pixels, one beside a word in a chip 14, and a slider or a tick in the bar\'s menus is gold like every other in the app',
        css.includes('    .wb-tool-btn > .ico { width: 19px; height: 19px; vertical-align: 0; }\n') && css.includes('    .draw-style-btn > .ico { width: 14px; height: 14px; vertical-align: -2px; margin-right: 4px; }\n')
        && css.includes('    .floating-toolbar input[type=range], .floating-toolbar input[type=checkbox] { accent-color: var(--gold); }')
        && css.includes('  .ico { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; vertical-align: -3px; flex: 0 0 auto; }'));
}

/* ---------- the page as blocks: an element's direct children, in order ---------- */
const VOID = { input: 1, img: 1, br: 1, hr: 1 };
function elementEnd(src, at) {   // at: the '<' of an open tag; answers the place just past its closing tag, or -1
    const m = /^<([a-zA-Z0-9]+)/.exec(src.slice(at, at + 40)); if (!m) return -1;
    const tag = m[1].toLowerCase(); let i = src.indexOf('>', at); if (i < 0) return -1;
    if (VOID[tag] || src[i - 1] === '/') return i + 1;
    let depth = 1; const re = new RegExp('<(/?)' + tag + '\\b', 'gi'); re.lastIndex = i + 1;
    for (;;) { const k = re.exec(src); if (!k) return -1; if (k[1]) { depth--; if (!depth) return src.indexOf('>', k.index) + 1; } else if (src[src.indexOf('>', k.index) - 1] !== '/') depth++; }
}
function kidsOf(src, openTag) {   // the direct children of the one element that opens with openTag: [{ open, ids, text }], or null
    const a = src.indexOf(openTag); if (a < 0 || src.indexOf(openTag, a + 1) >= 0) return null;
    const z = elementEnd(src, a); if (z < 0) return null;
    const kids = [], tailAt = src.lastIndexOf('</', z - 1); let i = a + openTag.length;
    for (;;) { const lt = src.indexOf('<', i); if (lt < 0 || lt >= tailAt) break; const e = elementEnd(src, lt); if (e < 0) return null;
        const text = src.slice(lt, e); kids.push({ open: text.slice(0, text.indexOf('>') + 1), ids: [...text.matchAll(/ id="([A-Za-z0-9_-]+)"/g)].map(m => m[1]), text }); i = e; }
    return kids;
}
const BAR_OPEN = '<div id="wbFloatingToolbar" class="floating-toolbar">', EDGE_OPEN = '<div id="wbEdgeTools" class="floating-toolbar edge-tools" style="display:none;">';
const barKids = kidsOf(ix, BAR_OPEN) || [], edgeKids = kidsOf(ix, EDGE_OPEN) || [];

/* ---------- the layout the owner passed ("As drawn") ---------- */
{
    const SEP = '<div class="wb-tool-sep">', seq = barKids.map(k => k.open === SEP ? '|' : (k.ids[0] || '?'));
    check('the bar is laid out as the owner passed it ("As drawn"): undo and redo, then select and pan, then pen, eraser and fill, then shapes and Add, then measure and radius, then fog, Scene and Pages, then More, with a separator between the groups and none at either end',
        J(seq) === J(['wbUndoBtn', 'wbRedoBtn', '|', 'moveModeBtn', 'panModeBtn', '|', 'drawModeBtn', 'eraserModeBtn', 'fillModeBtn', '|', 'shapeMenuBtn', 'addMenuBtn', '|', 'measureModeBtn', 'blastModeBtn', '|', 'fogModeBtn', 'sceneFxBtn', 'pagesBtn', '|',
            'wbMoreBtn']), J(seq));
    const col = edgeKids.map(k => k.ids.filter(id => !/OptBtn$/.test(id)).slice(0, 2)), at = (a, b) => ix.indexOf(a) >= 0 && ix.indexOf(a) < ix.indexOf(b);   // the button and its menu (its small arrow is held with the presses)
    const render = mainSrc.slice(mainSrc.indexOf('export function render() {'), mainSrc.indexOf('// Breadcrumb trail for nested maps'));
    check('View, Grid and Snap stand in a column at the map\'s right edge: a second box of the same toolbar, right after the bar in the page, that holds the three buttons with their menus and nothing else, shown with the bar by the one render and hidden with it in the stream window, clear of the right panel\'s grip and above the bar, its menus opening to its left as wide as their words',
        J(col) === J([['wbCenterBtn', 'wbCenterMenu'], ['wbGridBtn', 'gridMenu'], ['wbSnapBtn', 'snapMenu']]) && at(BAR_OPEN, EDGE_OPEN) && ix.slice(elementEnd(ix, ix.indexOf(BAR_OPEN)), ix.indexOf(EDGE_OPEN)).trim() === ''
        && render.includes("document.getElementById('wbFloatingToolbar').style.display = (!isPlanner && state.viewMode === 'visual') ? 'inline-flex' : 'none';")
        && render.includes("var edgeTools = document.getElementById('wbEdgeTools'); if (edgeTools) edgeTools.style.display = (!isPlanner && state.viewMode === 'visual') ? 'flex' : 'none';")
        && css.includes('    body.stream-mode #wbEdgeTools { display: none !important; }') && css.includes('body.stream-mode #sidebar, body.stream-mode #wbFloatingToolbar,')
        && css.includes('    #wbEdgeTools.floating-toolbar { left: auto; right: 26px; bottom: 96px; transform: none; flex-direction: column; gap: 2px; padding: 5px; }\n')
        && css.includes('    #wbEdgeTools .shape-menu { left: auto !important; right: 100% !important; bottom: 0 !important; top: auto !important; transform: none !important; margin: 0 10px 0 0 !important; width: max-content; }')
        && css.includes('    #wbEdgeTools #wbCenterMenu { bottom: -80px !important; max-height: calc(100vh - 274px); overflow-y: auto; }'), J(col));
    const more = barKids[barKids.length - 1] || { open: '', ids: [], text: '' }, clear = innerOfBtn('id="clearWbBtn"') || '';
    check('More, the last button of the bar, holds Clear board by its name: the very button, its id and its red, now a row with its bin and its words, in a menu that opens above More, and the GM\'s alone as Clear board always was',
        J(more.ids) === J(['wbMoreBtn', 'wbMoreMenu', 'clearWbBtn']) && more.open === '<div style="position:relative; display:inline-block;" class="gm-only">' && more.text.includes('<button class="wb-tool-btn" id="wbMoreBtn" title="More">')
        && more.text.includes('<div class="shape-menu menu-list" id="wbMoreMenu" style="bottom:100%; top:auto; flex-direction:column; min-width:200px; left:auto; right:0; transform:none; margin-bottom:10px;">')
        && more.text.includes('<button class="wb-tool-btn menu-row menu-row-red" id="clearWbBtn" title="Clear Board">') && css.includes('    .wb-tool-btn.menu-row.menu-row-red { color: var(--red); }')
        && /^<span class="mr-ico"><svg class="ico"[^>]*>.*<\/svg><\/span><span class="mr-txt">Clear board<small>Removes everything on this map\. It asks first\.<\/small><\/span>$/.test(clear)
        && css.includes(' body.net-client #addImageBtn, body.net-client #clearWbBtn,\n') && css.includes('  body.net-client .gm-only { display: none !important; }'), J([more.ids, more.open, clear]));
}

/* ---------- a page of plain objects, for the code that is run for real ---------- */
function El(tag, id, cls) {
    const self = this; this.tag = tag; this.id = id || ''; this.cls = new Set(String(cls || '').split(' ').filter(Boolean)); this.children = []; this.parentElement = null;
    this.style = {}; this.attrs = {}; this.on = []; this.w = 0; this.x = 0; this.clientWidth = 0;
    this.classList = { add: c => { self.cls.add(c); }, remove: c => { self.cls.delete(c); }, contains: c => self.cls.has(c), toggle: (c, v) => { const on = v === undefined ? !self.cls.has(c) : !!v; if (on) self.cls.add(c); else self.cls.delete(c); return on; } };
}
Object.defineProperty(El.prototype, 'offsetWidth', { get() { return typeof this.w === 'function' ? this.w() : this.w; } });
Object.defineProperty(El.prototype, 'offsetLeft', { get() { return this.x; } });
El.prototype.add = function(k) { k.parentElement = this; this.children.push(k); return k; };
El.prototype.addEventListener = function(type, fn, cap) { this.on.push([type, fn, !!cap]); };
El.prototype.setAttribute = function(k, v) { this.attrs[k] = String(v); };
El.prototype.getAttribute = function(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; };
El.prototype.is = function(sel) {   // '#id', '.a.b', 'tag', and '.a[attr]' for an element that has the attribute
    const m = /^(.*)\[([a-z-]+)\]$/.exec(sel); if (m) return this.is(m[1]) && this.getAttribute(m[2]) !== null;
    return sel[0] === '#' ? this.id === sel.slice(1) : sel[0] === '.' ? sel.slice(1).split('.').every(c => this.cls.has(c)) : this.tag === sel; };
El.prototype.closest = function(sel) { for (let n = this; n; n = n.parentElement) if (n.is(sel)) return n; return null; };
El.prototype.all = function() { const out = []; (function walk(n) { n.children.forEach(k => { out.push(k); walk(k); }); })(this); return out; };
El.prototype.querySelectorAll = function(sel) { return this.all().filter(n => n.is(sel)); };
El.prototype.querySelector = function(sel) { return this.querySelectorAll(sel)[0] || null; };
// The toolbar as the page has it: a button of its own, or a wrapper that holds a button, its small arrow where it has one, and its menu; a
// separator between the groups. In the tight bar a button is 32 wide and a pair 41 (its arrow is 12 and tucks 3 under the button), two things
// stand 2 apart, a separator is 1 wide with 2 of air each side, and the skin adds 10 around a row
const ARROW = { drawModeBtn: 'drawOptBtn', eraserModeBtn: 'eraserOptBtn', fillModeBtn: 'fillOptBtn', measureModeBtn: 'measureOptBtn', blastModeBtn: 'blastOptBtn', wbSnapBtn: 'snapOptBtn', shapeMenuBtn: 'shapeOptBtn', addMenuBtn: 'addOptBtn',
    fogModeBtn: 'fogOptBtn', sceneFxBtn: 'sceneOptBtn', wbCenterBtn: 'viewOptBtn', wbGridBtn: 'gridOptBtn' };
const MENU_ONLY = { shapeMenuBtn: 1, addMenuBtn: 1, fogModeBtn: 1, sceneFxBtn: 1, wbCenterBtn: 1, wbGridBtn: 1 };   // a button that only opens a menu: its arrow presses it
const LAY =['wbUndoBtn', 'wbRedoBtn', '|', 'moveModeBtn', 'panModeBtn', '|', 'drawModeBtn+drawMenu', 'eraserModeBtn+eraserMenu', 'fillModeBtn+fillMenu', '|', 'shapeMenuBtn+shapeMenu', 'addMenuBtn+addMenu', '|', 'measureModeBtn+measureMenu',
    'blastModeBtn+blastMenu', '|', 'fogModeBtn+fogMenu', 'sceneFxBtn+sceneFxMenu', 'pagesBtn+pagesMenu', '|', 'wbMoreBtn+wbMoreMenu'];
const GM_HAS = { wbUndoBtn: 1, wbRedoBtn: 1, fillModeBtn: 1, shapeMenuBtn: 1, addMenuBtn: 1, fogModeBtn: 1, sceneFxBtn: 1, pagesBtn: 1, wbMoreBtn: 1 };   // what a player's bar does not show (and no separator)
function toolbarPage(player) {
    const byId = {}, docOn = [], doc = { getElementById: id => byId[id] || null, addEventListener: (t, f) => { docOn.push([t, f]); }, querySelectorAll: sel => main.all().filter(n => n.is(sel)) };
    // a press, as a page gives it: down through the boxes it is in (the capture listeners), then up from the target, and on to the page unless a listener stops it
    const click = target => { const way = []; for (let n = target; n; n = n.parentElement) way.push(n); const ev = { target, stopped: false, stopPropagation() { this.stopped = true; } };
        way.slice().reverse().forEach(n => n.on.forEach(l => { if (l[0] === 'click' && l[2]) l[1].call(n, ev); }));
        for (const n of way) { n.on.forEach(l => { if (l[0] === 'click' && !l[2]) l[1].call(n, ev); }); if (ev.stopped) return; }
        docOn.forEach(l => { if (l[0] === 'click') l[1](ev); }); };
    const mk = (tag, id, cls, parent) => { const e = new El(tag, id, cls); e.click = () => click(e); if (id) byId[id] = e; if (parent) parent.add(e); return e; };
    const main = mk('div', 'main', ''), bar = mk('div', 'wbFloatingToolbar', 'floating-toolbar', main), edge = mk('div', 'wbEdgeTools', 'floating-toolbar', main);
    const wrap = (box, btnId, menuId) => { const wr = mk('div', '', ARROW[btnId] ? 'tool-pair' : '', box); mk('button', btnId, 'wb-tool-btn', wr);
        if (ARROW[btnId]) { const c = mk('button', ARROW[btnId], 'wb-tool-btn tool-chev', wr); if (MENU_ONLY[btnId]) c.setAttribute('data-for', btnId); }
        const m = mk('div', menuId, 'shape-menu', wr); mk('button', menuId + 'Row', 'wb-tool-btn', m); return wr; };
    let x = 4;
    LAY.forEach(name => {
        if (name === '|') { const s = mk('div', '', 'wb-tool-sep', bar); if (player) return; s.w = 1; s.x = x + 2; x = s.x + 1 + 2 + 2; return; }
        const ids = name.split('+'), shown = !(player && GM_HAS[ids[0]]), top = ids[1] ? wrap(bar, ids[0], ids[1]) : mk('button', ids[0], 'wb-tool-btn', bar), w = ARROW[ids[0]] ? 41 : 32;
        if (shown) { top.w = w; top.x = x; x += w + 2; }
    });
    const tight = x - 2 + 4 + 2;
    bar.w = () => bar.cls.has('tb-wrap') ? -1 : bar.cls.has('tb-tight') ? tight : (player ? 312 : 848);
    [['wbCenterBtn', 'wbCenterMenu'], ['wbGridBtn', 'gridMenu'], ['wbSnapBtn', 'snapMenu']].forEach(p => wrap(edge, p[0], p[1]));
    const vm = byId.wbCenterMenu; ['wbRulersBtn', 'wbZoomCtlBtn', 'wbPointerPosBtn'].forEach(id => mk('button', id, 'wb-tool-btn view-tick on', vm));
    return { doc, byId, main, bar, edge, click, tight, open: () => main.all().filter(n => n.is('.shape-menu.show')).map(n => n.id).sort() };
}
const barSrc = sliceOf(wbSrc, 'bar');
function runBar(P, win) {
    function RO(cb) { RO.made.push(this); this.cb = cb; } RO.made = []; RO.prototype.observe = function(el) { this.el = el; };
    let api = null, err = '';
    try { api = new Function('document', 'window', 'ResizeObserver', barSrc + '\nreturn { wbOneMenu: wbOneMenu, barFit: barFit, barBreaks: barBreaks, barGroups: barGroups, fitBar: fitBar, syncViewTicks: syncViewTicks, VIEW_TICKS: VIEW_TICKS };')(P.doc, win, RO); } catch (e) { err = String(e && e.message || e); }
    return { api, err, RO };
}

/* ---------- one menu at a time, across the bar and the column; More's own menu ---------- */
{
    const P = toolbarPage(false), win = {}, R = runBar(P, win), b = P.byId, show = (...ids) => ids.forEach(id => b[id].classList.add('show')), seen = [];
    let ok = !!R.api && barSrc.length > 500;
    if (ok) {
        show('drawMenu', 'fogMenu', 'wbCenterMenu'); P.click(b.wbGridBtn); seen.push(P.open());                    // a button of the column: every other menu goes, on the bar too
        show('gridMenu', 'snapMenu'); P.click(b.drawModeBtn); seen.push(P.open());                                    // a button of the bar: the column's menus go too
        show('drawMenu', 'gridMenu', 'fogMenu'); P.click(b.gridMenuRow); seen.push(P.open());                         // a row inside an open menu never closes its own menu
        show('drawMenu', 'gridMenu'); P.click(b.wbUndoBtn); seen.push(P.open());                                      // a button with no menu of its own closes them all
        show('drawMenu', 'gridMenu'); P.click(P.bar); seen.push(P.open());                                            // a press on the bar's own skin closes nothing
        b.drawMenu.classList.remove('show'); b.gridMenu.classList.remove('show');
        P.click(b.wbMoreBtn); seen.push(P.open()); P.click(b.wbMoreMenu); seen.push(P.open());                        // More opens its menu; a press on the menu's skin leaves it
        P.click(b.wbMoreMenuRow); seen.push(P.open());                                                                // a row (Clear board) puts it away
        P.click(b.wbMoreBtn); P.click(b.wbMoreBtn); seen.push(P.open());                                              // More again closes it
        P.click(b.wbMoreBtn); P.click(P.main); seen.push(P.open());                                                   // and so does a press anywhere else
        show('fogMenu'); P.click(b.wbMoreBtn); seen.push(P.open());                                                   // More is a button like any other: the open menu goes
    }
    check('one toolbar menu is up at a time, across the bar and the column (wbOneMenu, run for real on a page of plain objects): a button of either box closes every other menu of both, a row inside an open menu never closes its own, a button with no menu closes them all and a press on the bar\'s own skin closes none; More opens and closes its menu, a row of it puts it away, and so does a press anywhere else',
        ok && J(seen) === J([[], [], ['gridMenu'], [], ['drawMenu', 'gridMenu'], ['wbMoreMenu'], ['wbMoreMenu'], [], [], [], ['wbMoreMenu']])
        && P.bar.on.some(l => l[0] === 'click' && l[2]) && P.edge.on.some(l => l[0] === 'click' && l[2]), R.err || J(seen));
}

/* ---------- the presses (the owner: "Chevron opens them") ---------- */
const pressSrc = sliceOf(wbSrc, 'press');
function runPress(P, win) {
    let api = null, err = '';
    try { api = new Function('document', 'window', pressSrc + '\nreturn { TOOL_OPTS: TOOL_OPTS, toolPress: toolPress, toolOptsOnly: toolOptsOnly, wireTool: wireTool, wireMenuArrows: wireMenuArrows };')(P.doc, win); } catch (e) { err = String(e && e.message || e); }
    return { api, err };
}
{
    const CHEV_D = '<path d="M6 9.5l6 6 6-6"/>';
    const TOOLS = [['drawModeBtn', 'drawOptBtn', 'drawMenu', 'Pen options'], ['eraserModeBtn', 'eraserOptBtn', 'eraserMenu', 'Eraser options'], ['fillModeBtn', 'fillOptBtn', 'fillMenu', 'Fill options'],
        ['measureModeBtn', 'measureOptBtn', 'measureMenu', 'Measure options'], ['blastModeBtn', 'blastOptBtn', 'blastMenu', 'Radius options'], ['wbSnapBtn', 'snapOptBtn', 'snapMenu', 'Snap options']];
    const MENUS = [['shapeMenuBtn', 'shapeOptBtn', 'shapeMenu', 'Shapes menu'], ['addMenuBtn', 'addOptBtn', 'addMenu', 'Add menu'], ['fogModeBtn', 'fogOptBtn', 'fogMenu', 'Fog of war menu'], ['sceneFxBtn', 'sceneOptBtn', 'sceneFxMenu', 'Scene menu'],
        ['wbCenterBtn', 'viewOptBtn', 'wbCenterMenu', 'View menu'], ['wbGridBtn', 'gridOptBtn', 'gridMenu', 'Grid menu']];
    const pairOf = id => barKids.concat(edgeKids).filter(k => k.ids[0] === id)[0] || null;
    const arrow = (cid, title, forId) => '<button class="wb-tool-btn tool-chev" id="' + cid + '"' + (forId ? ' data-for="' + forId + '"' : '') + ' title="' + title + '" aria-haspopup="true">' + SVG + CHEV_D + '</svg></button>';
    const bad = TOOLS.map(t => [t, '']).concat(MENUS.map(t => [t, t[0]])).filter(p => { const t = p[0], k = pairOf(t[0]);
        return !k || J(k.ids.filter(id => !/Indicator$/.test(id)).slice(0, 3)) !== J([t[0], t[1], t[2]]) || !/^<div (class="tool-pair" style="position:relative;[^"]*"|style="position:relative;[^"]*" class="tool-pair gm-only")>$/.test(k.open)
            || count(k.text, '</button>' + arrow(t[1], t[3], p[1]) + '\n') !== 1; }).map(p => p[0][0]);
    const plain = ['wbUndoBtn', 'wbRedoBtn', 'moveModeBtn', 'panModeBtn', 'pagesBtn', 'wbMoreBtn'].filter(id => { const k = pairOf(id); return !k || /tool-pair|tool-chev/.test(k.text); });
    check('a tool that has options is a pair (the owner: "Chevron opens them"): the pen, the eraser, fill, measure, radius and Snap each stand in a pair with a small arrow right after the icon, the arrow the passed sheet drew for "a tool has options", named for the options it opens; a button that only opens a menu is the same pair, and its arrow names the button it presses; undo, redo, select, pan, Pages and More have no arrow, having nothing to open beside themselves',
        bad.length === 0 && plain.length === 0 && count(ix, 'class="wb-tool-btn tool-chev"') === 12 && MENUS.every(m => count(ix, ' id="' + m[1] + '" data-for="' + m[0] + '"') === 1)
        && TOOLS.every(t => !new RegExp(' id="' + t[1] + '" data-for=').test(ix)), J([bad, plain]));
    const tp = (pressSrc && runPress(toolbarPage(false), {}).api || {}).toolPress || (() => null), T = (a, b, c) => { const r = tp(a, b, c); return r ? r.tool + '/' + r.opts : 'none'; };
    check('what a press does (toolPress, run for real): the icon takes a tool that is not in hand and never opens its options, and puts a tool in hand away with its options; the small arrow opens the options and takes the tool with them, leaves the tool where it is when it is already in hand, and closes options that are up without putting the tool away',
        J([T('icon', false, false), T('icon', false, true), T('icon', true, false), T('icon', true, true), T('chev', false, false), T('chev', true, false), T('chev', false, true), T('chev', true, true)])
        === J(['take/', 'take/', 'away/close', 'away/close', 'take/open', '/open', '/close', '/close']), J([T('icon', false, false), T('icon', true, true), T('chev', false, false), T('chev', true, true)]));
    // the wiring, run on the page of plain objects: two tools that have options, the arrow tool, and a hand that the stand-in tools set
    const P = toolbarPage(false), R = runPress(P, {}), b = P.byId, log = [], seen = [], page = []; let hand = 'move';
    P.doc.addEventListener('click', e => page.push(e.target.id));   // what reaches the page: a press on a tool or its arrow is the tool's own and does not
    if (R.api) {
        b.moveModeBtn.addEventListener('click', () => { hand = 'move'; R.api.toolOptsOnly('moveModeBtn'); });
        [['drawModeBtn', 'drawOptBtn', 'pen'], ['eraserModeBtn', 'eraserOptBtn', 'eraser']].forEach(t => R.api.wireTool({ id: t[0], chev: t[1], inHand: () => hand === t[2], sync: () => log.push('sync ' + t[2] + ' ' + P.open().join(',')), take: () => { hand = t[2]; R.api.toolOptsOnly(t[0]); log.push('take ' + t[2]); } }));
        const st = () => hand + ' | ' + P.open().join(',');
        P.click(b.drawModeBtn); seen.push(st()); P.click(b.drawModeBtn); seen.push(st());                 // the icon takes the pen and opens nothing; again, and it is put away
        P.click(b.drawOptBtn); seen.push(st()); P.click(P.main); P.click(P.bar); seen.push(st());          // the arrow: the pen and its options; a press elsewhere leaves them up
        P.click(b.drawOptBtn); seen.push(st());                                                           // the arrow again: the options go, the pen stays
        P.click(b.drawOptBtn); P.click(b.eraserOptBtn); seen.push(st());                                  // another tool's arrow: that tool and its options, and the pen's are away
        P.click(b.eraserModeBtn); seen.push(st());                                                        // the icon of the tool in hand: away, options and all
        P.click(b.eraserOptBtn); P.click(b.drawModeBtn); seen.push(st());                                 // another tool's icon: that tool, and no options up
        b.shapeMenu.classList.add('show'); b.eraserMenu.classList.add('show'); b.blastMenu.classList.add('show'); R.api.toolOptsOnly('blastModeBtn'); seen.push(P.open().join(','));   // only a tool's options are put away, never another menu
    }
    check('the presses, run for real on a page of plain objects (wireTool, toolOptsOnly): an icon takes its tool and opens nothing, and a second press puts it away; the arrow takes the tool with its options, brought up to date before they show; a press on the map or the bar leaves them up, for they stay while they are wanted; the arrow again closes them and the tool stays; another tool taken, by its icon or its arrow, puts them away, since options belong to the tool in hand',
        !!R.api && pressSrc.length > 800 && J(R.api.TOOL_OPTS) === J({ drawModeBtn: 'drawMenu', eraserModeBtn: 'eraserMenu', fillModeBtn: 'fillMenu', measureModeBtn: 'measureMenu', blastModeBtn: 'blastMenu' })
        && J(seen) === J(['pen | ', 'move | ', 'pen | drawMenu', 'pen | drawMenu', 'pen | ', 'eraser | eraserMenu', 'move | ', 'pen | ', 'blastMenu,shapeMenu'])
        && J(log) === J(['take pen', 'take pen', 'sync pen ', 'sync pen ', 'take eraser', 'sync eraser ', 'take eraser', 'sync eraser ', 'take pen'])
        && J(page) === J(['moveModeBtn', 'main', 'wbFloatingToolbar', 'moveModeBtn']), R.err || J([seen, log, page]));
    // a button that only opens a menu: its arrow presses it, once, and no other
    const Q = toolbarPage(false), S = runPress(Q, {}), hits = {}, docHits = [];
    MENUS.forEach(m => Q.byId[m[0]].addEventListener('click', () => { hits[m[0]] = (hits[m[0]] || 0) + 1; }));
    Q.doc.addEventListener('click', e => docHits.push(e.target.id));
    if (S.api) { MENUS.forEach(m => Q.click(Q.byId[m[1]])); Q.click(Q.byId.drawOptBtn); Q.click(Q.byId.snapOptBtn); }
    check('a button that only opens a menu and its small arrow are one control (wireMenuArrows, run for real): a press on the arrow presses its own button once and no other, and reaches the page as that button\'s press, so every rule of the button holds for the arrow; the arrow of a tool that has options is no such arrow',
        !!S.api && J(hits) === J({ shapeMenuBtn: 1, addMenuBtn: 1, fogModeBtn: 1, sceneFxBtn: 1, wbCenterBtn: 1, wbGridBtn: 1 }) && J(docHits) === J(['shapeMenuBtn', 'addMenuBtn', 'fogModeBtn', 'sceneFxBtn', 'wbCenterBtn', 'wbGridBtn', 'drawOptBtn', 'snapOptBtn']), S.err || J([hits, docHits]));
    const wired = [["wireTool({ id: 'drawModeBtn', chev: 'drawOptBtn', inHand: function() { return !!window.isDrawingMode; }, sync: syncDrawMenu, take: function() {", "updateWbToolbar('drawModeBtn');"],
        ["wireTool({ id: 'eraserModeBtn', chev: 'eraserOptBtn', inHand: function() { return !!window.isEraserMode; }, sync: syncEraserMenu, take: function() {", "updateWbToolbar('eraserModeBtn');"],
        ["wireTool({ id: 'fillModeBtn', chev: 'fillOptBtn', inHand: function() { return !!window.isFillMode; }, sync: syncFillMenu, take: function() {", "updateWbToolbar('fillModeBtn');"],
        ["wireTool({ id: 'measureModeBtn', chev: 'measureOptBtn', inHand: function() { return !!window.isMeasureMode && window.wpMeasureKind === 'ruler'; }, sync: syncMeasureMenu, take: function() {", "updateWbToolbar('measureModeBtn');"],
        ["wireTool({ id: 'blastModeBtn', chev: 'blastOptBtn', inHand: function() { return !!window.isMeasureMode && window.wpMeasureKind === 'blast'; }, sync: syncBlastMenu, take: function() {", "updateWbToolbar('blastModeBtn');"]];
    const notWired = wired.filter(w => { const a = wbSrc.indexOf(w[0]), z = wbSrc.indexOf('  } });', a); return count(wbSrc, w[0]) !== 1 || z < 0 || z - a > 900 || !wbSrc.slice(a, z).includes(w[1]); }).map(w => w[0].slice(15, 32));
    const OLD = ["wbWrap.addEventListener('pointerdown', closeDrawMenu)", "!e.target.closest('#drawMenu')", "!e.target.closest('#eraserMenu')", "!e.target.closest('#measureMenu')", "!e.target.closest('#fillMenu')", "!e.target.closest('#blastMenu')", 'click again for pen options', 'click again for size', 'click again for units', 'Click again for the color', 'Click the tool again for options', 'click for options'];
    check('each of the five tools is wired through the one wiring, with what it means for it to be in hand, and taking any tool puts the others\' options away; nothing closes a tool\'s options at a press elsewhere or when a stroke begins any more, so they stay up while they are wanted; no tooltip still says to click again for options',
        notWired.length === 0 && count(wbSrc, 'wireTool({') === 5 && wbSrc.includes("      toolOptsOnly(activeId);   // 107: a tool's options belong to the tool in hand\n  }\n")
        && OLD.every(o => count(wbSrc, o) + count(ix, o) === 0), J([notWired, OLD.filter(o => count(wbSrc, o) + count(ix, o) > 0)]));
    check('Snap: its icon switches snapping on and off and says so, and its small arrow opens what it snaps to; the button\'s tooltip says how it stands and what a press does; the Snap To menu still has its own switch row',
        wbSrc.includes("    _el_wbSnapBtn.addEventListener('click', function(e) { e.stopPropagation(); setSnap(!state.snap); toast(state.snap ? 'Snapping on.' : 'Snapping off.'); });\n")
        && wbSrc.includes("    if (_el_snapOptBtn) _el_snapOptBtn.addEventListener('click', function(e) { e.stopPropagation(); if (_el_snapMenu) { syncSnapMenu(); _el_snapMenu.classList.toggle('show'); } });\n")
        && wbSrc.includes("? 'Snap is on, aligning to ' + ({ grid: 'grid cells', items: 'other items', both: 'grid cells and other items' })[state.snapMode] + '. Press to turn it off.'\n            : 'Snap is off. Press to turn it on.';")
        && wbSrc.includes("!e.target.closest('#snapMenu') && !e.target.closest('#snapOptBtn')) _el_snapMenu.classList.remove('show');") && count(wbSrc, "setSnap(true); if (_el_snapMenu) _el_snapMenu.classList.add('show');") === 0
        && innerOfBtn('id="snapOffBtn"') === '&#9211; Turn snapping off');
    check('the pairs in the style sheet: a pair sets its icon and its small arrow side by side, the arrow is slim, quiet and tucked under the icon\'s edge, gold while the pointer is on it and while its options are up, in either theme; an arrow goes with its button where the button is hidden, for the fog button and on a player\'s bar; the tight bar slims the arrow too',
        css.includes('    .floating-toolbar .tool-pair { display: inline-flex !important; align-items: center; }\n    .wb-tool-btn.tool-chev { width: 13px; margin-left: -3px; border-radius: 0 8px 8px 0; color: var(--dim); }\n    .wb-tool-btn.tool-chev > .ico { width: 10px; height: 10px; stroke-width: 2.6; }\n')
        && css.includes('    .wb-tool-btn.tool-chev:hover { background: transparent; color: var(--gold); }\n    .floating-toolbar .tool-pair:has(> .shape-menu.show) > .tool-chev { color: var(--gold); }\n    .tool-pair > .wb-tool-btn[style*="none"] + .tool-chev { display: none; }')
        && css.includes('  html[data-theme="light"] .wb-tool-btn.tool-chev { color: var(--dim); }')
        && css.includes('  html[data-theme="light"] .wb-tool-btn.tool-chev:hover, html[data-theme="light"] .floating-toolbar .tool-pair:has(> .shape-menu.show) > .tool-chev { color: var(--gold); }\n')
        && css.includes('body.net-client #wbGridBtn, body.net-client #wbSnapBtn, body.net-client #gridOptBtn, body.net-client #snapOptBtn,\n') && css.includes('  body.net-client #shapeMenuBtn, body.net-client #shapeOptBtn, body.net-client #addImageBtn,')
        && css.includes('    body.net-client .floating-toolbar .tool-pair:has(> #shapeMenuBtn), body.net-client .floating-toolbar .tool-pair:has(> #addMenuBtn) { display: none !important; }')
        && ['shapeTextBtn', 'addImageBtn', 'imgLibBtn', 'importCharBtn'].every(id => new RegExp('body\\.net-client #' + id + '[,\\s{]').test(css))   // Add's four rows are the GM's: that is why a player's bar leaves the button out
        && /id="fogModeBtn" style="display:none;"/.test(ix));
}

/* ---------- menus by name (the owner: "the options need to be more obvious for what something does") ---------- */
{
    const ST = ' style="bottom:100%; top:auto; flex-direction:column; min-width:', C = '; left:50%; transform:translateX(-50%); margin-bottom:10px;">';
    const MENUS_BY_NAME = [
        ['<div class="shape-menu menu-list" id="gridMenu">', [['gridOffBtn', 'Off', '', 'Off'], ['gridSqBtn', 'Square', '', 'Square'], ['gridHexBtn', 'Hex', '', 'Hex'], '-',
            ['gridOpacityBtn', 'Grid opacity&hellip;', 'Opens Settings at the grid&rsquo;s look.', 'Grid opacity&hellip; (opens Settings)']]],
        ['<div class="shape-menu menu-list" id="shapeMenu">', [['shapeRectBtn', 'Rectangle', '', 'Rectangle'], ['shapeCircBtn', 'Circle', '', 'Circle'], ['shapeDiaBtn', 'Diamond', '', 'Diamond'],
            ['shapeHexBtn', 'Hexagon', 'Seats onto the cells of a hex grid.', 'Hexagon &mdash; resizes like any shape; centers onto hex grid cells'], '-',
            ['shapeTriggerBtn', 'Trigger zone', 'Says its message when a character token is dropped inside.', 'Trigger Zone &mdash; fires its Event Message when a character token is dropped inside'],
            ['shapeHexTriggerBtn', 'Hex trigger', 'A trigger zone the shape of a hex cell.', 'Hex Trigger &mdash; a hex-shaped trigger zone'], '-', 'block', 'block']],
        ['<div class="shape-menu menu-list" id="addMenu"' + ST + '190px' + C, [['shapeTextBtn', 'Text box', 'Click to place it. Drag to size it.', 'Text &mdash; click to place a text box (drag to size it), or click an existing text box to edit it'],
            ['addImageBtn', 'Image', 'A picture from this computer.', 'Add Image'], ['imgLibBtn', 'Image Library', 'This campaign&rsquo;s pictures and the shared ones.', 'Image Library &mdash; this campaign\'s pictures, the shared ones, and every campaign\'s'],
            ['importCharBtn', 'Import Character', 'A character file as a ready token.', 'Import Character &mdash; drop a shadow-base.com character JSON as a ready token']]],
        ['<div class="shape-menu menu-list" id="sceneFxMenu"' + ST + '200px' + C, [
            ['soundBtn', 'Sound', 'Loops and one-shot cues the table hears.', 'Sound &mdash; ambient loops and one-shot cues for the scene, heard by every player at the table (a VTT feature, per campaign)'],
            ['musicBtn', 'Music', 'Playlists, and a song a map remembers.', 'Music &mdash; named playlists, a song or playlist remembered per map that plays as you enter, with full GM transport (a VTT feature, per campaign)'],
            ['fxBtn', 'Visual effects', 'Flashes, weather, bursts and banners.', 'Visual effects &mdash; flashes, screen shake, weather, bursts and banners on the play map, seen by the players on it (a VTT feature, per campaign)'],
            ['videoBtn', 'Video', 'The campaign&rsquo;s videos, in a panel or shown to the table.', 'Video &mdash; the campaign&rsquo;s videos, watched in a panel you move, resize and put full screen (a VTT feature, per campaign)']]],
        ['<div class="shape-menu menu-list" id="wbMoreMenu" style="bottom:100%; top:auto; flex-direction:column; min-width:200px; left:auto; right:0; transform:none; margin-bottom:10px;">',
            [['clearWbBtn', 'Clear board', 'Removes everything on this map. It asks first.', 'Clear Board']]]];
    const ROW = /^<button class="wb-tool-btn menu-row(?: menu-row-red)?" id="([A-Za-z]+)" title="([^"]*)"><span class="mr-ico">((?:<svg class="ico[^>]*>.*<\/svg>)?)<\/span><span class="mr-txt">([^<]+)(?:<small>([^<]+)<\/small>)?<\/span><\/button>$/;
    const read = open => (kidsOf(ix, open) || []).map(k => { const m = ROW.exec(k.text); return m ? [m[1], m[4], m[5] || '', m[2]] : k.text === '<div class="menu-rule"></div>' ? '-' : /^<div class="menu-block" title="[^"]+">/.test(k.text) ? 'block' : '?' + k.text.slice(0, 60); });
    const off = MENUS_BY_NAME.filter(m => J(read(m[0])) !== J(m[1])).map(m => [/id="([A-Za-z]+)"/.exec(m[0])[1], read(m[0])]);
    const noIcon = MENUS_BY_NAME.reduce((a, m) => a.concat((kidsOf(ix, m[0]) || []).filter(k => ROW.test(k.text) && !ROW.exec(k.text)[3] && ROW.exec(k.text)[1] !== 'gridOffBtn').map(k => k.ids[0])), []);
    check('a toolbar menu lists each choice by its name (the owner: "the options need to be more obvious for what something does"): Grid, Shapes, Add, Scene and More each read as a list of rows in their order, a row its icon, its name, and a grey line where the name is not enough; every row keeps its id and the tooltip it had; Shapes keeps New shape size and New item opacity under its rows; with the four line types of the data map\'s Link menu the page holds twenty-three such rows',
        off.length === 0 && noIcon.length === 0 && count(ix, 'class="wb-tool-btn menu-row') === 23, J([off, noIcon]));
    const sm = kidsOf(ix, '<div class="shape-menu menu-list" id="shapeMenu">') || [], blocks = sm.filter(k => /^<div class="menu-block"/.test(k.text)).map(k => k.text);
    check('Shapes keeps its two settings as they were, under its rows: New shape size with Free and Grid cell, and New item opacity with its slider and the figure beside its name; and Snap To says what each choice does in plain sentences',
        blocks.length === 2 && blocks[0].includes('<div class="draw-menu-label">New shape size</div>') && count(blocks[0], 'class="draw-style-btn shape-size-btn') === 2 && blocks[0].indexOf('data-shapesize="free"') < blocks[0].indexOf('data-shapesize="cell"')
        && blocks[1].includes('<div class="draw-menu-label">New item opacity <span id="shapeOpacityVal">100%</span></div>') && blocks[1].includes('<input type="range" class="new-opacity-slider" id="shapeOpacity" min="10" max="100" value="100" style="width:100%;">')
        && count(ix, 'Grid seats pieces in cells. Items lines pieces up with each other. Both does the two, neighbours first.') === 1 && count(ix, 'Grid = predictable cell placement') === 0, J(blocks.map(b => b.slice(0, 80))));
    check('the rows in the style sheet, and the grid in use: a menu of rows is a column as wide as its words, a row sets its icon in a slot and its name over its grey line, the row of the choice in use is gold, and the Grid menu marks the grid that is on whenever the grid is set',
        css.includes('    .floating-toolbar .shape-menu.menu-list { flex-direction: column; align-items: stretch; gap: 2px; min-width: 210px; width: max-content; }')
        && css.includes('    .wb-tool-btn.menu-row { flex: 0 0 auto; width: 100%; height: auto; border-radius: 6px; font-size: 12px; padding: 7px 10px; justify-content: flex-start; gap: 10px; text-align: left; }\n    .wb-tool-btn.menu-row > .mr-ico { flex: 0 0 20px; width: 20px; display: inline-flex; justify-content: center; }')
        && css.includes('    .wb-tool-btn.menu-row > .mr-txt { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; min-width: 0; }\n    .wb-tool-btn.menu-row small { font-size: 10.5px; line-height: 1.35; font-weight: 400; color: var(--dim); white-space: normal; max-width: 240px; }\n    .wb-tool-btn.menu-row.on { color: var(--gold); }')
        && css.includes('    .floating-toolbar .menu-rule { flex: 0 0 auto; height: 1px; background: #333; margin: 3px 2px; }')
        && wbSrc.includes("      [['gridOffBtn', 'off'], ['gridSqBtn', 'square'], ['gridHexBtn', 'hex']].forEach(function(g) { var r = document.getElementById(g[0]); if (r) r.classList.toggle('on', g[1] === type); });")
        && wbSrc.indexOf("if (gb) gb.classList.toggle('active', type !== 'off');") < wbSrc.indexOf("[['gridOffBtn', 'off'], ['gridSqBtn', 'square'], ['gridHexBtn', 'hex']]") && wbSrc.indexOf("[['gridOffBtn', 'off'], ['gridSqBtn', 'square'], ['gridHexBtn', 'hex']]") - wbSrc.indexOf("if (gb) gb.classList.toggle('active', type !== 'off');") < 80);
}

/* ---------- the bar never runs off the map: it tightens, then wraps between groups ---------- */
{
    const R = runBar(toolbarPage(false), {}), A = R.api || {}, BF = A.barFit || (() => null), BB = A.barBreaks || (() => undefined), G = [66, 66, 100, 66, 66, 100, 32];
    check('where the bar goes (barFit, run for real): as it is while it fits the room, tightened while the tight bar fits, wrapped only then, with the room\'s own edge counted as fitting',
        BF(758, 0, 758) === '' && BF(758, 0, 2000) === '' && BF(758, 560, 757) === 'tight' && BF(758, 560, 560) === 'tight' && BF(758, 560, 559) === 'wrap' && BF(758, 560, 10) === 'wrap');
    const got = [BB(G, 9, 550), BB(G, 9, 549), BB(G, 9, 516), BB(G, 9, 291), BB(G, 9, 290), BB(G, 9, 276), BB(G, 9, 216), BB(G, 9, 200), BB(G, 9, 100), BB([50, 50], 9, 109), BB([50, 50], 9, 108), BB([10, 10, 10], 2, 22)];
    check('where a wrapped bar breaks (barBreaks, run for real): never inside a group, in the fewest rows that fit the room, and of the ways to fill that many rows the one whose widest row is narrowest, so the rows come out even; the widest row is told, so the bar can be made as wide as its rows',
        J(got) === J([{ cuts: [], width: 550 }, { cuts: [2], width: 291 }, { cuts: [2], width: 291 }, { cuts: [2], width: 291 }, { cuts: [1, 3], width: 216 }, { cuts: [1, 3], width: 216 }, { cuts: [1, 3], width: 216 }, { cuts: [1, 2, 4], width: 141 },
            { cuts: [0, 1, 2, 3, 4, 5], width: 100 }, { cuts: [], width: 109 }, { cuts: [0], width: 50 }, { cuts: [0], width: 22 }]), J(got));   // the last: two ways as good as each other, the first is taken
    const none = [BB(G, 9, 99), BB([], 9, 500), BB([300], 9, 200), BB(G, 9, 0), BB(G, 9, -5), BB(G, -1, 500), BB(G, NaN, 500), BB(G, 9, NaN), BB([50, 0], 9, 500), BB([50, 'x'], 9, 500), BB('nope', 9, 500), BB(new Array(13).fill(10), 2, 500), BB(null, 9, 500)];
    check('barBreaks answers nothing where it cannot break between groups: a group wider than the room, no group, a room or a gap that is no length, a width that is none, a list that is none, more groups than a bar has; the bar then wraps wherever it must',
        none.every(v => v === null) && J(BB(new Array(12).fill(10), 2, 500)) === J({ cuts: [], width: 142 }), J(none));
}
{
    const P = toolbarPage(false), R = runBar(P, {}), A = R.api || {}, fit = A.fitBar || (() => {}), seps = P.bar.children.filter(k => k.is('.wb-tool-sep'));
    const state = () => [[...P.bar.cls].filter(c => c !== 'floating-toolbar').sort().join(' '), P.bar.style.width || '', seps.map((s, i) => s.cls.has('tb-brk') ? i : -1).filter(i => i >= 0)];
    const at = w => { P.main.clientWidth = w; fit(); return state(); }, got = [];
    const g = A.barGroups ? A.barGroups((P.bar.classList.add('tb-tight'), P.bar)) : null; P.bar.classList.remove('tb-tight');
    got.push(at(1000), at(872), at(871), at(665), at(664), at(550), at(379), at(378), at(310), at(1000));
    P.bar.style.display = 'none'; got.push(at(310)); P.bar.style.display = 'inline-flex'; got.push(at(0), at(24), at(NaN));
    check('the bar is fitted to the room the map has (fitBar and barGroups, run for real on a bar measured as the tight bar is: 641 wide, seven groups, 9 between two, 10 of skin): 12 kept clear each side; as it is from 872, tight down to 665, then two even rows of whole groups 357 wide, then three rows 264 wide; a wider map takes every mark back; a bar that is not shown and a map with no width are left alone',
        P.tight === 641 && J(g && [g.widths, g.gap, g.chrome, g.seps.length]) === J([[66, 66, 127, 84, 84, 118, 32], 9, 10, 6])
        && J(got) === J([['', '', []], ['', '', []], ['tb-tight', '', []], ['tb-tight', '', []], ['tb-tight tb-wrap', '357px', [2]], ['tb-tight tb-wrap', '357px', [2]], ['tb-tight tb-wrap', '357px', [2]], ['tb-tight tb-wrap', '264px', [1, 3]],
            ['tb-tight tb-wrap', '264px', [1, 3]], ['', '', []], ['', '', []], ['', '', []], ['', '', []], ['', '', []]]), R.err || J([g && [g.widths, g.gap, g.chrome], got]));
    // only what shows is a group, and only a separator between two groups parts them: with Undo and Redo not shown the first separator leads
    // the bar, and with Measure and Radius not shown too two separators stand in a row
    const H = toolbarPage(false), SH = runBar(H, {}), hs = H.bar.children.filter(k => k.is('.wb-tool-sep')), BG = (SH.api || {}).barGroups || (() => null);
    H.byId.wbUndoBtn.w = 0; H.byId.wbRedoBtn.w = 0; const g1 = BG(H.bar);
    H.byId.measureModeBtn.parentElement.w = 0; H.byId.blastModeBtn.parentElement.w = 0; const g2 = BG(H.bar);
    H.bar.children.forEach(k => { k.w = 0; }); const g3 = BG(H.bar);
    check('a group is what shows between two separators (barGroups, run for real): a separator that leads the bar parts nothing, nor does one that follows another, so a row of a wrapped bar always ends at the separator after its last group; a bar that shows nothing has no groups',
        !!g1 && J(g1.widths) === J([66, 127, 84, 84, 118, 32]) && g1.seps.length === 5 && g1.seps.every((s, i) => s === hs[i + 1])
        && !!g2 && J(g2.widths) === J([66, 127, 84, 118, 32]) && J(g2.seps.map(s => hs.indexOf(s))) === J([1, 2, 3, 5]) && g3 === null, J([g1 && g1.widths, g2 && [g2.widths, g2.seps.map(s => hs.indexOf(s))], g3]));
    const Q = toolbarPage(true), S = runBar(Q, {}), fitQ = (S.api || {}).fitBar || (() => {}), qs =() => [[...Q.bar.cls].filter(c => c !== 'floating-toolbar').sort().join(' '), Q.bar.style.width || '', Q.bar.children.filter(k => k.cls.has('tb-brk')).length];
    const gq = S.api ? S.api.barGroups((Q.bar.classList.add('tb-tight'), Q.bar)) : null; Q.bar.classList.remove('tb-tight');
    const qat = w => { Q.main.clientWidth = w; fitQ(); return qs(); }, gotQ = [qat(400), qat(335), qat(272), qat(271), qat(120)];
    check('a player\'s bar is fitted too: it has fewer buttons, the Radius tool among them, and no separator, so it is one group, counted by what shows alone; it tightens like the GM\'s, and where even the tight bar is too wide it wraps wherever it must, with no row marked and no width set',
        Q.tight === 248 && J(gq && [gq.widths, gq.gap, gq.chrome, gq.seps.length]) === J([[238], 0, 10, 0]) && J(gotQ) === J([['', '', 0], ['tb-tight', '', 0], ['tb-tight', '', 0], ['tb-tight tb-wrap', '', 0], ['tb-tight tb-wrap', '', 0]]), S.err || J([gq, gotQ]));
    const render = mainSrc.slice(mainSrc.indexOf('export function render() {'), mainSrc.indexOf('// Breadcrumb trail for nested maps')), iT = render.indexOf("document.getElementById('toggleRightBtn').style.display"), iF = render.indexOf('if (window.wpFitBar) window.wpFitBar();');
    check('the bar is fitted whenever the map\'s room changes: by render() once the panes are switched, so it measures the room the map has, and by an observer of the map\'s own box, the bar\'s parent; the style sheet tightens only the bar\'s own buttons, breaks a wrapped bar at the separators fitBar marks, and lifts the column above a wrapped bar',
        R.RO.made.length === 1 && R.RO.made[0].el === P.main && typeof R.RO.made[0].cb === 'function' && count(render, 'window.wpFitBar()') === 1 && iT > 0 && iF > iT && iF < render.indexOf('if (window.wpFloats) window.wpFloats.sync();')
        && wbSrc.includes('window.wpFitBar = fitBar;\n')
        && css.includes('    .floating-toolbar.tb-tight { gap: 2px; padding: 4px; }\n    .floating-toolbar.tb-tight > .wb-tool-btn, .floating-toolbar.tb-tight > div > .wb-tool-btn { width: 32px; height: 32px; }\n    .floating-toolbar.tb-tight > div > .wb-tool-btn.tool-chev { width: 12px; }\n    .floating-toolbar.tb-tight > .wb-tool-sep { margin: 0 2px; }\n')
        && css.includes('    .floating-toolbar.tb-wrap { flex-wrap: wrap; justify-content: center; row-gap: 2px; width: max-content; max-width: calc(100% - 24px); }')
        && css.includes('    .floating-toolbar.tb-wrap > .wb-tool-sep.tb-brk { flex-basis: 100%; width: auto; height: 0; margin: 0; }') && css.includes('    .floating-toolbar.tb-wrap ~ #wbEdgeTools { bottom: 156px; }'), J([R.RO.made.length, iT, iF]));
}

/* ---------- the View menu: four actions, then Show with its three ticks ---------- */
{
    const vm = kidsOf(ix, '<div class="shape-menu" id="wbCenterMenu" style="bottom:100%; top:auto; flex-direction:column; min-width: 130px; left:50%; transform:translateX(-50%); margin-bottom:10px;">') || [];
    const rows = vm.map(k => k.ids[0] || k.text), tick = (id, title, words) => '<button class="wb-tool-btn view-tick on" id="' + id + '" role="menuitemcheckbox" aria-checked="true" title="' + title + '">' + SVG + TICK + '</svg>' + words + '</button>';
    check('the View menu reads as one list: its four actions, each a row set left, then Show with a tick each for the rulers (the owner: "On, as today", with a tick in the View menu that hides them), the zoom buttons and the pointer location, each ticked in the page as it is shown by default, each saying in its tooltip what it is and that Settings has the same switch',
        J(rows) === J(['wbCenterCanvasBtn', 'wbCenterItemsBtn', 'wbCenterCharBtn', 'wbFitBtn', '<div class="draw-menu-label view-show-label">Show</div>', 'wbRulersBtn', 'wbZoomCtlBtn', 'wbPointerPosBtn'])
        && vm.slice(0, 4).every(k => k.open.indexOf('<button class="wb-tool-btn view-row" id="') === 0 && !/ style=/.test(k.open)) && vm.length === 8
        && vm[5].text === tick('wbRulersBtn', 'The pixel rulers along the top and left edges of the map. The same switch as Coordinate rulers in Settings.', 'Rulers')
        && vm[6].text === tick('wbZoomCtlBtn', 'The zoom buttons at the top right of the map. The mouse wheel zooms either way. The same switch as Zoom buttons in Settings.', 'Zoom buttons')
        && vm[7].text === tick('wbPointerPosBtn', 'Where the pointer is on the map, shown at the top right. The same switch as Pointer location in Settings.', 'Pointer location')
        && css.includes('    .wb-tool-btn.view-row, .wb-tool-btn.view-tick { flex: 0 0 auto; width: 100%; height: auto; border-radius: 0; font-size: 12px; justify-content: flex-start; white-space: nowrap; }\n    .wb-tool-btn.view-row { padding: 7px 12px 7px 34px; }')
        && css.includes('    .wb-tool-btn.view-tick { padding: 7px 12px; gap: 8px; }\n    .wb-tool-btn.view-tick > .ico { width: 14px; height: 14px; color: var(--gold); visibility: hidden; }\n    .wb-tool-btn.view-tick.on > .ico { visibility: visible; }\n'), J(rows));
    const P = toolbarPage(false), shown = { rulers: true, zoom: true, pointer: true }, calls = [], win = { wpViewShown: w => Object.prototype.hasOwnProperty.call(shown, w) ? shown[w] : null, wpViewSwitch: w => { calls.push(w); shown[w] = !shown[w]; return shown[w]; } };
    const R = runBar(P, win), b = P.byId, ticks = () => ['wbRulersBtn', 'wbZoomCtlBtn', 'wbPointerPosBtn'].map(id => (b[id].cls.has('on') ? 'on' : 'off') + '/' + b[id].attrs['aria-checked']).join(' '), seen = [];
    if (R.api) {
        seen.push(ticks()); b.wbCenterMenu.classList.add('show');
        P.click(b.wbZoomCtlBtn); seen.push(ticks()); P.click(b.wbPointerPosBtn); seen.push(ticks()); P.click(b.wbZoomCtlBtn); seen.push(ticks()); P.click(b.wbRulersBtn); seen.push(ticks());
        seen.push(J(calls), J(P.open()));                                           // each row presses its own switch, and the menu stays up: several can be ticked in one visit
        shown.rulers = true; shown.pointer = true; seen.push(ticks()); P.click(b.wbCenterBtn); seen.push(ticks());   // switched in Settings meanwhile: the ticks follow when the menu is asked for
        delete win.wpViewShown; shown.zoom = false; R.api.syncViewTicks(); seen.push(ticks());                        // no switch to ask: shown
        win.wpViewShown = () => null; R.api.syncViewTicks(); seen.push(ticks()); delete win.wpViewSwitch; P.click(b.wbZoomCtlBtn); seen.push(J(calls));
    }
    check('the three ticks follow their switches (syncViewTicks and the rows\' presses, run for real): a row is ticked while its thing is shown and says so to a screen reader, a press presses that row\'s own switch and no other and the tick follows, the menu stays up so several can be ticked in one visit, a switch pressed in Settings meanwhile shows when the menu is next asked for, and with no switch to ask a row reads shown and a press does nothing',
        !!R.api && J(R.api.VIEW_TICKS) === J([['wbRulersBtn', 'rulers'], ['wbZoomCtlBtn', 'zoom'], ['wbPointerPosBtn', 'pointer']])
        && J(seen) === J(['on/true on/true on/true', 'on/true off/false on/true', 'on/true off/false off/false', 'on/true on/true off/false', 'off/false on/true off/false', J(['zoom', 'pointer', 'zoom', 'rulers']), J(['wbCenterMenu']),
            'off/false on/true off/false', 'on/true on/true on/true', 'on/true on/true on/true', 'on/true on/true on/true', J(['zoom', 'pointer', 'zoom', 'rulers'])]), R.err || J(seen));
}

/* ---------- the switches: one function for each, pressed from Settings and from the View menu ---------- */
const swSrc = sliceOf(setSrc, 'viewswitch'), cornerSrc = sliceOf(mainSrc, 'corner');
{
    const store = (o) => { const d = Object.assign({}, o && o.have), log = []; return { d, log, getItem: k => { if (o && o.deaf) throw new Error('no store'); return Object.prototype.hasOwnProperty.call(d, k) ? d[k] : null; }, setItem: (k, v) => { if (o && o.full) throw new Error('full'); log.push(k); d[k] = String(v); } }; };
    const world = (o) => { const ls = store(o), said = [], did = [], state = {}, win = { appRender: () => did.push('render'), wpApplyCorner: () => did.push('corner') }; let api = null, err = '';
        try { api = new Function('localStorage', 'window', 'state', 'syncPanel', 'toast', swSrc + '\nreturn { viewSwitch: viewSwitch, viewShown: viewShown, VIEW_SWITCHES: VIEW_SWITCHES };')(ls, win, state, () => did.push('panel'), t => said.push(t)); } catch (e) { err = String(e && e.message || e); }
        return { ls, said, did, state, win, api, err }; };
    const W = world(), S = W.api ? W.api.viewSwitch : () => undefined, got = [];
    got.push(S('zoom'), J(W.ls.d), S('pointer'), J(W.ls.d), S('zoom'), J(W.ls.d), S('rulers'), W.state.showRulers, S('rulers'), W.state.showRulers, S('pointer'), J(W.ls.d));
    check('one function switches each of the three (viewSwitch, run for real): the zoom buttons, the pointer location and the rulers each have a key of their own and a press writes that key alone, so each is hidden independently of the others (the owner: "optionally hide both independently"); it answers what is so now, says it in a notice, brings the Settings row up to date, and draws the change, the rulers through render() as before and the box at the top right through its two classes',
        swSrc.length > 500 && J(got) === J([false, '{"wp_zoomCtl":"off"}', false, '{"wp_zoomCtl":"off","wp_pointerPos":"off"}', true, '{"wp_zoomCtl":"on","wp_pointerPos":"off"}', false, false, true, true, true, '{"wp_zoomCtl":"on","wp_pointerPos":"on","wp_rulers":"on"}'])
        && J(W.said) === J(['Zoom buttons hidden.', 'Pointer location hidden.', 'Zoom buttons shown.', 'Rulers hidden.', 'Rulers shown.', 'Pointer location shown.'])
        && J(W.did) === J(['corner', 'panel', 'corner', 'panel', 'corner', 'panel', 'render', 'panel', 'render', 'panel', 'corner', 'panel']) && J(W.ls.log) === J(['wp_zoomCtl', 'wp_pointerPos', 'wp_zoomCtl', 'wp_rulers', 'wp_rulers', 'wp_pointerPos'])
        && J(W.api.VIEW_SWITCHES) === J({ rulers: ['wp_rulers', 'Rulers'], zoom: ['wp_zoomCtl', 'Zoom buttons'], pointer: ['wp_pointerPos', 'Pointer location'] }), W.err || J([got, W.said, W.did]));
    const X = world(), odd = ['nothing', '__proto__', 'toString', 'constructor', 'hasOwnProperty', '', undefined, null, 5, {}, ['zoom']].map(n => X.api ? X.api.viewSwitch(n) : 0);
    const F = world({ full: true }), D = world({ deaf: true }), H = world({ have: { wp_zoomCtl: 'off', wp_pointerPos: 'OFF', wp_rulers: 'hidden' } });
    const shownOf = w => ['rulers', 'zoom', 'pointer', 'nope', '__proto__'].map(n => w.win.wpViewShown(n));
    check('viewSwitch never guesses: a name it does not know, a prototype\'s name among them, switches nothing, writes nothing and says nothing; where the store takes no write it says what is so, which is shown; a store that cannot be read shows everything; only the word off hides; and wpViewShown answers the same for the ticks',
        !!X.api && odd.every(v => v === null) && X.ls.log.length === 0 && X.said.length === 0 && X.did.length === 0
        && F.api.viewSwitch('zoom') === true && J(F.said) === J(['Zoom buttons shown.']) && D.api.viewSwitch('pointer') === true && J(D.said) === J(['Pointer location shown.']) && D.api.viewShown('wp_zoomCtl') === true
        && J(shownOf(H)) === J([true, false, true, null, null]) && J(shownOf(X)) === J([true, true, true, null, null]) && typeof X.win.wpViewSwitch === 'function' && X.win.wpViewSwitch('zoom') === false, X.err || J([odd, F.said, D.said, shownOf(H)]));
    const body = () => { const c = new Set(); return { c, classList: { toggle: (n, on) => { if (on) c.add(n); else c.delete(n); } } }; };
    const corner = (have, deaf) => { const b = body(), win = {}; let err = '';
        try { new Function('document', 'localStorage', 'window', cornerSrc + '\napplyCorner();')({ body: b }, store({ have, deaf }), win); } catch (e) { err = String(e && e.message || e); }
        return err || [...b.c].sort().join(' ') + '|' + typeof win.wpApplyCorner; };
    const cg = [corner({}), corner({ wp_zoomCtl: 'off' }), corner({ wp_pointerPos: 'off' }), corner({ wp_zoomCtl: 'off', wp_pointerPos: 'off' }), corner({ wp_zoomCtl: 'on', wp_pointerPos: 'on' }), corner({ wp_rulers: 'off' }), corner({ wp_zoomCtl: 'off', wp_pointerPos: 'off' }, true)];
    check('the box at the top right follows the two keys (applyCorner, run for real): a class on the page for each half that is put away, neither for a half that is shown, the rulers\' key no business of it, and both shown where the store cannot be read; it is applied once as the page loads and again at each press, and after Reset Local Preferences both halves are back at once',
        cornerSrc.length > 300 && J(cg) === J(['|function', 'no-zoomctl|function', 'no-pointerpos|function', 'no-pointerpos no-zoomctl|function', '|function', '|function', '|function'])
        && mainSrc.includes('  // [lookcheck:corner-end]\n  applyCorner();\n') && count(mainSrc, 'applyCorner();') === 1
        && setSrc.includes("    applyGridOpacity();\n    if (window.wpApplyCorner) window.wpApplyCorner();   // 107: the zoom buttons and the pointer location are back at once\n"), J(cg));
    const tb = count(setSrc, "[['setRulersBtn', 'rulers'], ['setZoomCtlBtn', 'zoom'], ['setPointerPosBtn', 'pointer']].forEach(function(r) { var b = ui(r[0]); if (b) b.addEventListener('click', function() { viewSwitch(r[1]); }); });\n");
    const GREY = '<div style="font-size:10.5px; color:var(--dim); line-height:1.4;">', row = (label, state, id, btn, grey) => '        <div style="margin-bottom:8px;">\n            <div class="set-field-label" style="display:flex; justify-content:space-between;">' + label + ' <span id="' + state + '" style="color:var(--dim);"></span></div>\n'
        + '            <button class="tool ghost" id="' + id + '" style="width:100%;">' + btn + '</button>\n            ' + GREY + grey + '</div>\n        </div>\n';
    check('Settings, Table has the three switches in a row each, the rulers as before and the two new ones under it: its name, how it stands, its button, and a grey line that says what it is; each button presses the one function, no other code writes the three keys, and the row\'s word follows the key',
        tb === 1 && ix.includes(row('Coordinate rulers', 'setRulersState', 'setRulersBtn', 'Toggle Rulers', 'The number strips along the top and left edges of a map.')
            + row('Zoom buttons', 'setZoomCtlState', 'setZoomCtlBtn', 'Toggle Zoom Buttons', 'The zoom buttons at the top right of a map. The mouse wheel zooms either way.')
            + row('Pointer location', 'setPointerPosState', 'setPointerPosBtn', 'Toggle Pointer Location', 'Where the pointer is on the map, shown at the top right.'))
        && [setSrc, mainSrc, wbSrc].every(s => !/setItem\(\s*'wp_(rulers|zoomCtl|pointerPos)'/.test(s)) && count(setSrc, 'localStorage.setItem(sw[0],') === 1
        && setSrc.includes("    if (zcState) zcState.textContent = viewShown('wp_zoomCtl') ? 'shown' : 'hidden';\n    if (ppState) ppState.textContent = viewShown('wp_pointerPos') ? 'shown' : 'hidden';\n")
        && setSrc.includes("    if (rlState) rlState.textContent = localStorage.getItem('wp_rulers') === 'off' ? 'hidden' : 'shown';\n"), String(tb));
}

/* ---------- the box at the top right: the pointer location and the zoom buttons, in the toolbar's look ---------- */
{
    const ZOOM = '      <div id="zoomBox">\n'
        + '          <span class="zoom-pos" title="Where the pointer is on the map. The numbers are the map\'s own, as on the rulers.">' + SVG + '<path d="M5 3v16l4.2-3.8L12 21.2l2.6-1.2-2.8-5.8h5.7L5 3z"/></svg><span id="cursorPos">&ndash;</span></span>\n'
        + '          <div class="zoom-sep"></div>\n'
        + '          <span class="zoom-ctl">\n'
        + '              <button class="zoom-btn" id="zoomOutBtn" title="Zoom Out">' + SVG + MINUS + '</svg></button>\n'
        + '              <input id="zoomLbl" title="Click to type a zoom level" value="100%" aria-label="Zoom level" />\n'
        + '              <button class="zoom-btn" id="zoomInBtn" title="Zoom In">' + SVG + '<path d="M12 4.5v15M4.5 12h15"/></svg></button>\n'
        + '          </span>\n'
        + '      </div>\n';
    const kids = kidsOf(ix, '<div id="zoomBox">') || [], pos = kids[0] || { text: '' };
    check('the box at the top right keeps its place and all it held (the owner: "id like to keep the pointer location if we arent already", then "Leave the box as it is"): the pointer location, then the zoom buttons with the level you can type between them, the five ids as they were; and it wears the toolbar\'s icons: the pointer location is marked with the Select tool\'s own arrow, zoom in is the plus Add wears, zoom out its minus',
        count(ix, ZOOM) === 1 && J(kids.map(k => k.open + '>' + k.ids.join(','))) === J(['<span class="zoom-pos" title="Where the pointer is on the map. The numbers are the map\'s own, as on the rulers.">>cursorPos', '<div class="zoom-sep">>', '<span class="zoom-ctl">>zoomOutBtn,zoomLbl,zoomInBtn'])
        && svgIn(pos.text) === draw('moveModeBtn') && typeof draw('moveModeBtn') === 'string' && draw('zoomInBtn') === draw('addMenuBtn') && draw('zoomInBtn') === hdr('newCampBtn')
        && /\n      <div id="wbStubNote" role="status"><\/div>\n      <div id="zoomBox">\n/.test(ix) && ix.indexOf('<div id="zoomBox">') < ix.indexOf('<div id="minimap">'), J(kids.map(k => k.open)));
    // a rule of the style sheet as its declarations: the first rule that opens with the selector on a line of its own
    const ruleOf = sel => { const m = new RegExp('\\n\\s*' + sel.replace(/[.#]/g, '\\$&') + ' \\{\\n([^}]*)\\}').exec(css), o = {}; if (!m) return null;
        m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(';').forEach(d => { const i = d.indexOf(':'); if (i > 0) o[d.slice(0, i).trim()] = d.slice(i + 1).trim(); }); return o; };
    const bar = ruleOf('.floating-toolbar') || {}, box = ruleOf('#zoomBox') || {}, btn = ruleOf('.zoom-btn') || {}, tool = ruleOf('.wb-tool-btn') || {};
    check('the box wears the toolbar\'s look (the owner: "lets update the styling of the zoom and pointer location to match the other changes still"): the bar\'s own ground, edge and shadow, read from the bar\'s rule and the box\'s; its two buttons are the bar\'s kind, bare until the pointer is on them, in the bar\'s ink in either theme; and its place is the one it had, under the bar\'s menus and over the strips',
        typeof bar.background === 'string' && bar.background.length > 3 && box.background === bar.background && box.border === bar.border && typeof bar.border === 'string' && box['box-shadow'] === bar['box-shadow'] && typeof bar['box-shadow'] === 'string'
        && box.position === 'absolute' && box.top === '26px' && box.right === '14px' && +box['z-index'] === 8992 && +box['z-index'] < +bar['z-index'] && box.display === 'flex'
        && btn.background === tool.background && btn.background === 'transparent' && btn.border === 'none' && btn.color === tool.color && typeof tool.color === 'string' && btn['border-radius'] === '7px' && btn.width === '26px' && btn.height === '26px'
        && css.includes('  .zoom-btn:hover { background: var(--plate); color: var(--ink); }\n') && /\n    \.wb-tool-btn:hover \{\n        background: var\(--plate\);\n        color: var\(--ink\);\n    \}\n/.test(css)
        && css.includes('  html[data-theme="light"] .zoom-btn { color: var(--ink); }') && css.includes('  html[data-theme="light"] .wb-tool-btn, html[data-theme="light"] .draw-size-btn, html[data-theme="light"] .draw-style-btn { color: var(--ink); }')
        && css.includes('  .zoom-btn > .ico { width: 15px; height: 15px; vertical-align: 0; }') && css.includes('  #zoomBox .zoom-pos > .ico { width: 13px; height: 13px; vertical-align: 0; }'), J([bar.background, box.background, box.border, box['box-shadow'], btn]));
    const HIDE = '  body.no-pointerpos #zoomBox .zoom-pos, body.no-zoomctl #zoomBox .zoom-ctl, body.no-pointerpos #zoomBox .zoom-sep, body.no-zoomctl #zoomBox .zoom-sep { display: none; }\n'
        + '  body.no-pointerpos.no-zoomctl #zoomBox { display: none !important; }';
    check('each half of the box is put away on its own (the owner: "optionally hide both independently"): the pointer location by one class, the zoom buttons by the other, the line between them with either; with both away there is no empty box and the party strip moves up into its place; the classes are the two applyCorner sets, the keys the two viewSwitch writes; nothing is hidden by default, and the stream window still shows neither',
        count(css, HIDE) === 1 && css.includes('  body.no-pointerpos.no-zoomctl #partyStrip { top: 26px; }') && /\n  #partyStrip \{\n    position: absolute; top: 62px; right: 14px;/.test(css)
        && ['no-pointerpos', 'no-zoomctl', 'wp_pointerPos', 'wp_zoomCtl'].every(w => count(cornerSrc, "'" + w + "'") === 1) && ['wp_pointerPos', 'wp_zoomCtl'].every(w => count(swSrc, "'" + w + "'") === 1)
        && count(css, 'no-zoomctl') === 5 && count(css, 'no-pointerpos') === 5 && count(ix, 'no-zoomctl') + count(ix, 'no-pointerpos') === 0   // the fifth: where the party strip stands under a hidden row's bar with the box put away
        && css.includes('body.stream-mode #dataFloatingToolbar, body.stream-mode #zoomBox,') && mainSrc.includes("      document.getElementById('zoomBox').style.display = isPlanner ? 'none' : 'flex';\n"), J([count(css, HIDE), count(css, 'no-zoomctl'), count(css, 'no-pointerpos')]));
}

/* ---------- the data map's toolbar: the same line icons, and its Link menu by name ---------- */
// Backlog 130. The owner, by prompt, 2026-10-06: "The data map's own toolbar still wears picture icons. Should it take the line icons too?" =
// "Yes, the same icons (Recommended)". Its new drawings, Link Mode and one for each line type, were on the sheet the owner passed on
// 2026-10-07 with "Use these drawings (Recommended)". A tool that is the same on both maps wears ONE drawing, so the data map's is read here
// against the play map's control. Under the rule that nothing is removed, the data map's controls are an inventory of their own from now on
{
    const DATA_INVENTORY = ['dataFloatingToolbar', 'dataCenterBtn', 'dataCenterMenu', 'dataCenterCanvasBtn', 'dataCenterItemsBtn', 'dataFitBtn', 'dataUndoBtn', 'dataRedoBtn', 'dataMoveBtn', 'dataPanBtn', 'linkBtn', 'linkMenu', 'linkTypeRow', 'linkDoneBtn',
        'addBtn', 'snapBtn', 'dataClearBtn'];
    const DATA_OPEN = '<div id="dataFloatingToolbar" class="floating-toolbar">', a = ix.indexOf(DATA_OPEN), z = ix.indexOf('<div id="wbFloatingToolbar"'), dbar = a > 0 && z > a ? ix.slice(a, z) : '';
    const gone = DATA_INVENTORY.filter(id => count(ix, ' id="' + id + '"') !== 1 || count(dbar, ' id="' + id + '"') !== 1);
    const types = (dbar.match(/<button[^>]* data-type="([^"]*)"/g) || []).map(m => m.slice(m.lastIndexOf('="') + 2, -1));
    const order = (kidsOf(ix, DATA_OPEN) || []).map(k => k.open === '<div class="wb-tool-sep">' ? '|' : (k.ids[0] || '?'));
    check('nothing is removed on the data map either: each of the seventeen controls of its toolbar, its centre menu and its Link menu is in the page exactly once and inside the toolbar, the bar in the order it had (centre, undo and redo, then select, pan and Link Mode, then Add Room and snap, then Clear the board), and the Link menu holds its four line types in their order, the line that says how linking works and Done linking',
        dbar.length > 2000 && gone.length === 0 && DATA_INVENTORY.length === 17 && new Set(DATA_INVENTORY).size === 17 && J(types) === J(['', 'route', 'secret', 'oneway'])
        && J(order) === J(['dataCenterBtn', 'dataUndoBtn', 'dataRedoBtn', '|', 'dataMoveBtn', 'dataPanBtn', 'linkBtn', '|', 'addBtn', 'snapBtn', '|', 'dataClearBtn'])
        && count(dbar, '<div class="draw-menu-row" style="font-size:11px; color:var(--dim); line-height:1.4;">Click two rooms to connect them. Click the chip on any line to change its type or remove it.</div>') === 1
        && count(dbar, '<div class="draw-menu-row"><button class="draw-style-btn" id="linkDoneBtn" title="Back to the Select tool">Done linking</button></div>') === 1
        && ['dataCenterCanvasBtn', 'dataCenterItemsBtn', 'dataFitBtn'].every(id => new RegExp(' id="' + id + '"[^>]*>(Center on Canvas|Center on Items|Fit to Content)</button>').test(dbar)), J([gone, types, order]));
    // a control's whole inner text, found once in the data map's toolbar
    const dIn = how => { const at = dbar.indexOf(how); if (at < 0 || dbar.indexOf(how, at + 1) >= 0) return null; const gt = dbar.indexOf('>', at), end = dbar.indexOf('</button>', gt); return gt < 0 || end < 0 ? null : dbar.slice(gt + 1, end); };
    const LINK = '<path d="M3 4h6v6H3zM15 14h6v6h-6zM9 10l6 4"/>';   // Link Mode: two rooms joined by a line
    const SAME = [['dataCenterBtn', 'wbCenterBtn'], ['dataUndoBtn', 'wbUndoBtn'], ['dataRedoBtn', 'wbRedoBtn'], ['dataMoveBtn', 'moveModeBtn'], ['dataPanBtn', 'panModeBtn'], ['addBtn', 'addMenuBtn'], ['snapBtn', 'wbSnapBtn'], ['dataClearBtn', 'clearWbBtn']];
    const notSame = SAME.filter(p => typeof draw(p[1]) !== 'string' || dIn('id="' + p[0] + '"') !== SVG + draw(p[1]) + '</svg>').map(p => p[0]);
    const h0 = ix.indexOf('id="helpModal"'), h1 = ix.indexOf('<div class="layout-wrapper">', h0), pageOnly = h0 < 0 || h1 < h0 ? '' : ix.slice(0, h0) + ix.slice(h1);
    check('the data map\'s tools wear line icons (the owner: "Yes, the same icons"): each of the nine buttons of its bar is an icon alone, and eight are the very drawing the same tool wears on the play map, read from the play map\'s control: the centre mark, undo, redo, the arrow, the hand, the plus, the magnet and the bin; Link Mode wears the drawing the owner passed on the sheet, two rooms joined by a line, and no other control does; the toolbar holds thirteen drawings and no picture glyph; the bin is still red, and the tool in hand is gold by the bar\'s own rule',
        notSame.length === 0 && SAME.length === 8 && dIn('id="linkBtn"') === SVG + LINK + '</svg>' && count(pageOnly, LINK) === 1 && !/&#\d+;/.test(dbar) && count(dbar, '<svg class="ico') === 13
        && / id="dataClearBtn" title="Clear the board \(remove every room and link\)" style="color:var\(--red\);">/.test(dbar) && / class="wb-tool-btn active" id="dataMoveBtn"/.test(dbar) && css.includes('    #linkBtn.active { background: var(--gold); color: var(--bg); }'), J(notSame));
    const LROW = /^<button class="wb-tool-btn menu-row" data-type="([a-z]*)" title="([^"]*)"><span class="mr-ico"><svg class="ico( ico-dots)?" viewBox="0 0 24 24" aria-hidden="true">(<path d="[MmLlHhVvAaCcSsZz0-9 .,-]+"\/>)<\/svg><\/span><span class="mr-txt">([^<]+)<small>([^<]+)<\/small><\/span><\/button>$/;
    const lrows = (kidsOf(ix, '<div id="linkTypeRow">') || []).map(k => { const m = LROW.exec(k.text); return m ? [m[1], m[5], m[6], m[2], m[4], !!m[3]] : '?' + k.text.slice(0, 60); });
    check('the Link menu lists the four line types by name, as the play map\'s menus do: a row each with its drawing, its name and a grey line that says what it is, the tooltip it had, and the drawing the owner passed for it: a line for Path, a dashed line for Route, four dots drawn as dots for Secret and a line with an arrowhead for One-way; the rows stand one under the other, in a menu wide enough for a grey line to stand on one row',
        J(lrows) === J([['', 'Path', 'A plain connection.', 'A plain connection', '<path d="M4 12h16"/>', false], ['route', 'Route', 'Travel between places, not a doorway.', 'Dashed: travel between places, not a doorway', '<path d="M4 12h3.2M10.4 12h3.2M16.8 12H20"/>', false],
            ['secret', 'Secret', 'A hidden or secret way.', 'Dotted: a hidden or secret way', '<path d="M5 12h.01M9.7 12h.01M14.3 12h.01M19 12h.01"/>', true],
            ['oneway', 'One-way', 'An arrow from the first room you click to the second.', 'An arrow from the first room you click to the second', '<path d="M4 12h15M14.5 7.5L19 12l-4.5 4.5"/>', false]])
        && css.includes('\n    #linkTypeRow { display: flex; flex-direction: column; gap: 2px; }') && css.includes('\n    #linkMenu { min-width: 280px; }') && count(ix, 'class="draw-style-btn" data-type=') === 0, J(lrows));
    // The menu's own code, sliced from datamap.js and run for real on rows of plain objects
    const dmSrc = read('scripts/datamap.js'), lt = sliceOf(dmSrc, 'linktype');
    const world = (kept, deadStore) => { const rows = ['', 'route', 'secret', 'oneway'].map(t => { const cls = new Set(); return { dataset: { type: t }, cls, classList: { toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); } } }; });
        const store = {}, asked = [], state = { linkType: kept }, TYPES = { '': { label: 'Path' }, route: { label: 'Route' }, secret: { label: 'Secret' }, oneway: { label: 'One-way' } };
        const api = new Function('document', 'state', 'LINK_TYPES', 'localStorage', lt + '\nreturn { syncLinkMenu: syncLinkMenu, setLinkType: setLinkType };')({ querySelectorAll: sel => { asked.push(sel); return rows; } }, state, TYPES,
            { setItem: (k, v) => { if (deadStore) throw new Error('no storage'); store[k] = v; } });
        return { api, store, asked, state, on: () => rows.filter(r => r.cls.has('on')).map(r => r.dataset.type), all: () => rows.reduce((n, r) => n + r.cls.size, 0) }; };
    let ran = false, got = [];
    if (lt) { try {
        const w = world('');
        w.api.syncLinkMenu(); got.push(J(w.on()) === '[""]' && J(w.asked) === J(['#linkTypeRow [data-type]']));                                       // nothing picked yet: Path is the type in use
        w.api.setLinkType('secret'); got.push(w.state.linkType === 'secret' && w.store.wp_linkType === 'secret' && J(w.on()) === '["secret"]' && w.all() === 1);   // one row is on, by the class on and no other
        w.api.setLinkType('oneway'); w.api.setLinkType('route'); got.push(w.state.linkType === 'route' && w.store.wp_linkType === 'route' && J(w.on()) === '["route"]');
        w.api.setLinkType(''); got.push(w.state.linkType === '' && w.store.wp_linkType === '' && J(w.on()) === '[""]');
        got.push(['bridge', 'constructor', 'toString', '__proto__', 'hasOwnProperty', undefined, null, 7].every(t => { w.api.setLinkType('route'); w.api.setLinkType(t); return w.state.linkType === '' && J(w.on()) === '[""]'; }));   // a type the app does not have, or a name the list only inherits, is Path
        const k = world('oneway'); k.api.syncLinkMenu(); got.push(J(k.on()) === '["oneway"]');                                                        // the type kept on this computer is the row that is on
        const d = world('', true); d.api.setLinkType('secret'); got.push(d.state.linkType === 'secret' && J(d.on()) === '["secret"]');               // a computer that keeps nothing still switches
        ran = true;
    } catch (e) { got.push('threw: ' + e.message); } }
    check('the Link menu\'s own code, run for real: the row of the type new links take is on, by the class on alone, as in every menu written by name; picking a type sets it, keeps it on this computer and moves the mark; a type the app does not have, or a name the list only inherits, is the plain Path; the kept type is the row that is on when the menu is drawn, and a computer that keeps nothing still switches; the rows are wired by their type and the kept type is read by the same rule',
        lt.length > 300 && ran && got.length === 7 && got.every(v => v === true)
        && count(dmSrc, "  document.querySelectorAll('#linkTypeRow [data-type]').forEach(function(b) { b.addEventListener('click', function(e) { e.stopPropagation(); setLinkType(this.dataset.type || ''); }); });") === 1
        && count(dmSrc, "if (_lt0 && Object.prototype.hasOwnProperty.call(LINK_TYPES, _lt0)) state.linkType = _lt0;") === 1 && !/#linkTypeRow \.draw-style-btn/.test(dmSrc), J(got));
}

/* ---------- Help and the tour show a tool's own drawing beside its name ---------- */
// Backlog 129. The owner, by prompt, 2026-10-06: "Help still shows the old picture icons beside tool names, in 56 places. What should Help
// show?" = "The new drawings (Recommended)": each tool's name in Help gets the same line icon the toolbar wears. So every drawing in Help
// and in the tour's steps is READ here from the control that wears it in the page, and each place must hold exactly that. A drawing that
// is redrawn later fails here until Help follows. A glyph that another control still wears (the planner's undo, the data map's tools, the
// sheet's Throw, a row of the right-click menu, the selection toolbar) is no old picture, and stays
{
    const h0 = ix.indexOf('id="helpModal"'), h1 = ix.indexOf('<div class="layout-wrapper">', h0), help = h0 < 0 || h1 < h0 ? '' : ix.slice(h0, h1), page = h0 < 0 || h1 < h0 ? '' : ix.slice(0, h0) + ix.slice(h1);
    const ICO_ALL = /<svg class="ico( ico-[a-z]+)?" viewBox="0 0 24 24" aria-hidden="true">[\s\S]*?<\/svg>/g, drawn = s => (s.match(ICO_ALL) || []).length, glyph = (s, code) => count(s, '&#' + code + ';');
    const of = how => { const at = page.indexOf(how); if (at < 0 || page.indexOf(how, at + 1) >= 0) return '?'; const gt = page.indexOf('>', at), end = page.indexOf('</button>', gt), m = page.slice(gt + 1, end).match(ICO_ALL); return m ? m[0] : '?'; };   // a control's own drawing, as the page writes it
    const K = { image: of('id="addImageBtn"'), lib: of('id="imgLibBtn"'), sound: of('id="soundBtn"'), music: of('id="musicBtn"'), scene: of('id="sceneFxBtn"'), video: of('id="videoBtn"'), fx: of('id="fxBtn"'), pen: of('id="drawModeBtn"'),
        eraser: of('id="eraserModeBtn"'), fill: of('id="fillModeBtn"'), view: of('id="wbCenterBtn"'), trigger: of('id="shapeTriggerBtn"'), importChar: of('id="importCharBtn"'), fog: of('id="fogModeBtn"'), measure: of('id="measureModeBtn"'),
        fogAll: of('id="fogOnAllMaps"'), reveal: of('data-fbrush="reveal"'), hide: of('data-fbrush="hide"'), clear: of('data-fbrush="clear"'), snap: of('id="wbSnapBtn"'),
        dMove: of('id="dataMoveBtn"'), dPan: of('id="dataPanBtn"'), dLink: of('id="linkBtn"'), dAdd: of('id="addBtn"'), dClear: of('id="dataClearBtn"') };   // the data map's own tools (130)
    const put = t => t.replace(/\{([a-zA-Z]+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(K, k) ? K[k] : '?')), strip = s => s.replace(/^<svg[^>]*>/, '');
    const HELP_AT = ["<li><b>{image} Image</b> adds an image.",
        "<li><b>{lib} Image Library</b> shows",
        "<li><b>{sound} Sound</b> is the GM&rsquo;s panel",
        "<li><b>{music} Music</b> is the GM&rsquo;s panel for songs, under {scene} <b>Scene</b>.",
        "<li><b>{video} Video</b> is the GM&rsquo;s panel for the campaign&rsquo;s <b>videos</b>, under {scene} <b>Scene</b>.",
        "Closing it silences it, and a <b>{video}</b> chip in the top row reopens it while it plays.",
        "<li><b>Visual effects</b> open from the {fx} button",
        "<li><b>{pen} Draw</b> sketches freehand.",
        "<li><b>{eraser} Eraser</b> rubs out",
        "<li><b>{fill} Fill</b> is the GM&rsquo;s tool",
        "<li><b>{view} Center</b> menu:",
        "Drop a <b>{trigger} Trigger Zone</b>",
        "The <b>{importChar} Import Character</b> toolbar button",
        "live under the <b>{scene} Scene</b> button",
        "<p>The <b>{fog} Fog</b> tool is the GM&rsquo;s.",
        "so the {fog} button is on the toolbar.",
        "<li><b>The {fog} button and its menu:</b>",
        "Then drag the <b>{measure} ruler</b> between two character tokens",
        "<li><b>Light sources:</b> in the {fx} effects panel, or in the fog menu",
        "Dragging the <b>{measure} ruler</b> from one character token",
        "open the {fog} menu and tick <b>Fog on this map</b>",
        "press <b>{fogAll} Fog on &middot; all maps</b>",
        "<b>{reveal} Reveal</b> shows cells and <b>{hide} Hide</b> covers them. <b>{clear} Clear</b> takes your own marks off",
        "Turn on <b>{snap} Snap</b> and tokens seat themselves",
        "Pick the <b>{measure} Measure</b> tool and drag across the map",
        "<li><b>Sound:</b> the {sound} panel's ambient loop",
        "<li><b>Visual effects:</b> the {fx} panel fires",
        "<li><b>Fog of war:</b> the {fog} fog tool hides",
        "place a light source, from the {fx} effects panel. So every token",
        "use the <b>{measure} Measure</b> tool freely.",
        "The <b>{music}</b> note in the top row",
        "<li><b>{view} Center</b> &nbsp; Recenter on the canvas",
        "<li><b>{snap} Snap</b> &nbsp; Toggle grid snapping.",
        "Everyone has the <b>{sound}</b> speaker in the top row",
        "The <b>{sound}</b> speaker in the top row has",
        "<li><b>{dMove} Select / Move</b> is the default tool.",
        "<li><b>{dPan} Pan</b>: drag anywhere to move the map itself.",
        "<li><b>{dLink} Link Mode</b> is lit gold while active.",
        "<li><b>{dClear} Clear the board</b> removes every room and link",
        "<li>Click <b>{dAdd} Add Room</b>, then drag the node",
        "<li>Click <b>{dLink} Link Mode</b>, then click two rooms"];
    const TOUR_AT = ["fog and {scene} <b>Scene</b>. Centre, the <b>grid</b>", "html: 'Under the {scene} <b>Scene</b> button.", "html: 'Under {scene} <b>Scene</b> too, apart from Sound.", "html: 'Under {scene} <b>Scene</b> too. The {fx} panel fires", "html: 'Under {scene} <b>Scene</b> too: the campaign&rsquo;s", "The {fx} panel&rsquo;s <b>Ping</b> row", "The {fog} button opens the fog menu", "{dLink} <b>Link Mode</b> connects two rooms"];
    const stepsA = tourSrc.indexOf('var STEPS = ['), stepsZ = tourSrc.indexOf('\n];', stepsA), steps = stepsA < 0 || stepsZ < stepsA ? '' : tourSrc.slice(stepsA, stepsZ);
    const badH = HELP_AT.filter(t => count(help, put(t)) !== 1).map(t => t.slice(0, 44)), badT = TOUR_AT.filter(t => count(steps, put(t)) !== 1).map(t => t.slice(0, 44)), lost = Object.keys(K).filter(k => K[k] === '?');
    check('Help shows a tool\'s own drawing beside its name (the owner, by prompt: "The new drawings"): each of the ' + HELP_AT.length + ' places holds the very drawing its control wears in the page, read from the control: the pen, the eraser, fill, the trigger zone, the picture, the Image Library, Import Character, Measure and its ruler, the fog button with its menu, its three brushes and Fog on all maps, Scene with Sound, Music, Visual effects and Video, the centre menu and Snap, and on the data map Select, Pan, Link Mode, Add Room and Clear the board; Help holds 44 drawings and no other; the note and the speaker in the top row are the drawings Music and Sound wear under Scene, which are the top bar\'s own',
        help.length > 100000 && lost.length === 0 && badH.length === 0 && HELP_AT.length === 41 && drawn(help) === 85 && HELP_AT.reduce((n, t) => n + (t.match(/\{[a-zA-Z]+\}/g) || []).length, 0) === 45
        && strip(of('id="musicInd"')) === strip(K.music) && of('id="soundInd"') === K.sound && /^<svg class="ico ico-note"/.test(K.music), J([lost, badH, drawn(help)]));
    // 131 (b): the top row's controls in Help (the owner, by prompt: "Show the new drawings (Recommended)")
    const ROW_HELP = [['id="settingsBtn"', 27, 9881, 0], ['id="netBtn"', 8, 127760, 1], ['id="journalBtn"', 1, 128214, 1], ['id="chatBtn"', 2, 128172, 0], ['id="aboutBtn"', 1, 9432, 0], ['id="handoutsBtn"', 1, 128220, 0]];
    const rowBad = ROW_HELP.filter(r => { const d = of(r[0]); return d === '?' || count(help, d) !== r[1] || glyph(help, r[2]) !== r[3]; }).map(r => r[0] + ' x' + count(help, of(r[0])) + ' glyph x' + glyph(help, r[2]));
    check('Help names a control of the top row with the control\'s own drawing (131 b; the owner, by prompt: "Show the new drawings (Recommended)"): Settings\' cog in its twenty-seven places, Multiplayer\'s globe in eight, the Journal\'s book, the chat\'s speech box in two, About\'s i and the two sheets of Handouts, forty drawings in all, each the very drawing its control wears, read from the control; the old pictures of those six are gone from Help\'s text, and the two that are left are Help\'s own part buttons, Multiplayer: Hosting and Handbook, which are controls of Help and no mention of the row; the pause button still wears its sign in the row, so Help still names it by that',
        rowBad.length === 0 && ROW_HELP.reduce((n, r) => n + r[1], 0) === 40 && count(help, '<button data-help="mp-gm">&#127760; Multiplayer: Hosting</button>') === 1 && count(help, '<button data-help="handbook">&#128214; Handbook</button>') === 1
        && count(help, '<li>Use the <b>&#9208;&#65039;</b> button in the top row,') === 1 && /id="sessionPauseBtn"[^>]*>&#9208;&#65039;<\/button>/.test(page), J(rowBad));
    check('no old picture of those tools is left in Help, and a glyph another control still wears is still there: the pictures of the pen, the eraser, fill, the trigger zone, the picture, the library, the character import, the ruler, Scene, Sound, Music, the effects, the speaker, the magnet, the centre mark and the Clear brush are gone from Help; the fog\'s is left once, on the right-click menu\'s Under fog row, the eye four times (Visible to players, Always revealed, a token\'s sight outline, Players can read) and the film once, on the header\'s chip; the planner\'s undo and redo, the selection toolbar\'s Fit to grid and play area, and the sheet\'s Throw keep theirs; the data map\'s Select, Pan, Link Mode, Add Room and Clear the board lost theirs when its toolbar took the line icons, so the two-way arrow is left once, on the badge that matches a size, and the bin once, on the Video panel\'s delete',
        [127916, 128207, 9999, 129533, 129699, 9889, 129333, 128444, 128452, 10024, 127925, 127926, 128266, 129522, 127919, 10005].every(c => glyph(help, c) === 0)
        && glyph(help, 127787) === 1 && count(help, '<b>&#127787; Under fog</b>') === 1 && glyph(help, 128065) === 4 && glyph(help, 127902) === 0
        && count(help, 'The <b>&#8617; &#8618;</b> buttons in the planner toolbar') === 1 && [10138, 9995, 10133].every(c => glyph(help, c) === 0) && glyph(help, 8596) === 1 && count(help, 'with a <b>&#8596; / &#8597;</b> badge') === 1
        && glyph(help, 128465) === 1 && count(help, '<b>&#128465;</b> deletes it with its file') === 1 && count(help, '<b>&#8862; Fit to grid</b>') === 1 && count(help, 'with the <b>&#9635;</b> button on the selection toolbar') === 1 && count(help, '<b>&#128165; Throw</b> button') === 1,
        J([127916, 128207, 9999, 129533, 129699, 9889, 129333, 128444, 128452, 10024, 127925, 127926, 128266, 129522, 127919, 10005, 127787, 128065, 127902].map(c => glyph(help, c))));
    check('the tour names those tools with the same drawings: each of its ' + TOUR_AT.length + ' places holds the drawing its control wears, the steps hold 9 drawings and no other, no step writes the old picture of Scene, of the effects, of the fog or of Link Mode, and a step still writes the glyph of a control that wears one (Throw, Fit to grid, the planner\'s undo and redo); in Help and on a tour card a drawing takes the size of the words around it, by the style sheet',
        steps.length > 5000 && badT.length === 0 && TOUR_AT.length === 8 && drawn(steps) === 9 && [127916, 10024, 127787, 8596].every(c => glyph(steps, c) === 0)
        && count(steps, '&#128165; <b>Throw</b>') === 2 && count(steps, '<b>&#8862; Fit to grid</b>') === 1 && count(steps, 'The <b>&#8617; &#8618;</b> buttons') === 1
        && css.includes('\n  #helpModal .help-pane .ico, #tourCard .ico { width: 1.15em; height: 1.15em; vertical-align: -0.2em; }'), J([badT, drawn(steps)]));
}

/* ---------- said, and run on CI ---------- */
{
    const NOTE = "The play map\n"
        + "- The play map's toolbar has new icons, drawn as lines in the style of\n  the top bar's. The tool in your hand is gold, and so is a setting\n  that is on.\n"
        + "- The toolbar is laid out anew, and no tool is gone. Undo and redo\n  lead, then the tools in groups. Centre, the grid and snap stand in a\n  column at the map's right edge. More, the last button, holds Clear\n  board. In a narrow window the bar tightens, then wraps into even\n  rows, so no tool is ever cut off.\n"
        + "- A tool that has options has a small arrow beside its icon. The icon\n  takes the tool, and a second press puts it away. The arrow opens the\n  tool's options, and they stay up while you work, until you press the\n  arrow again or take another tool. Snap's icon switches snapping, and\n  its arrow opens what it snaps to.\n"
        + "- The toolbar's menus list each choice by name: Grid, Shapes, Add,\n  Scene and More. A grey line under a name says what the choice does\n  where the name is not enough, and the Grid menu marks the grid in\n  use.\n"
        + "- The box at the top right of a map wears the toolbar's look. Its\n  pointer location and its zoom buttons can each be hidden on their\n  own. Tick them under Show in the centre menu, or press their buttons\n  in Settings > Table. The rulers have a tick there too.\n"
        + "- The blast tool is now the Radius tool, and every player has it. It\n  places a circle to measure with, in the ruler's gold. Type its size\n  in the ruler's unit, as a radius or as a diameter, and every token\n  inside shows its distance. Circles are yours alone. A blast with\n  damage is still thrown from a character's sheet.\n"
        + "- The Radius tool also measures a ring and a cone. A ring holds the\n  tokens between two distances. A cone is a wedge from a point: set\n  its angle, press a cell and drag to aim it, and drag its handle to\n  turn it later.\n"
        + "- The Radius tool can also put a circle on a token. Pick On a token\n  and click a token. The circle moves with it, and the token itself\n  is not counted.\n"
        + "- The GM can set off a circle of the Radius tool as an explosion. Press\n  Explode in the tool's options and type the damage and its type.\n  Nothing is filled in. The blast is shown to everyone on the map, and\n  the damage follows the system's blast setting.\n"
        + "- An explosion set off from a circle on a token spares that token. Tick\n  Also hits the token at the centre in the Explode boxes to hit it too.\n  The tick is off each time.\n"
        + "- A ring and a cone of the Radius tool can explode too. A ring hits the\n  tokens between its two distances, and a cone the tokens within its\n  angle. Everyone on the map is shown that shape.\n"
        + "- The fog menu is shorter. This map's two ticks and the brushes stay\n  in view, and three folds hold the rest: light and vision, the\n  preview, and the campaign's fog settings. No control is gone.\n"
        + "- Help and the tour show each play-map tool's own line drawing beside\n  its name, where they still showed the old picture icons.\n"
        + "- Text boxes use Waypoint's own fonts. The Font list in Properties\n  offers 23 of them, in groups: for reading, old and fantasy,\n  handwriting, science fiction, typewriter and code, display, and\n  runes. They come with the app, so a box looks the same on every\n  computer. A box made earlier keeps the font it had until you pick\n  another.\n"
        + "- The Content editor of a text box colours the words you select and\n  sizes them, as a planner's text block does. Ctrl + Z there takes\n  back your last change.\n"
        + "- Pasting into a text box on the map pastes plain words, as the\n  Content editor does.\n\n"
        + "The top bar and the data map\n"
        + "- The top of the window is one quiet row. Its captioned boxes are gone,\n  and each button still says what it is when you point at it.\n"
        + "- The campaign's name stands in the top row. Press it for the list of\n  your campaigns. The same menu holds Search, New, Rename, System and\n  Delete, which stood beside the list as five buttons.\n"
        + "- More, the three dots at the right end of the top row, holds Export\n  As with its eleven kinds, Import, Refresh, About and the way back to\n  the welcome screen.\n- Each kind of Export As has a small drawing beside its name.\n"
        + "- The top row has map tabs. The map on screen stands first, with its\n  parent maps inside the tab. Your pinned maps and the last maps you\n  opened follow. An eye and a number mark a map your players are on,\n  and the plus opens quick-jump.\n"
        + "- The top row has pills that say what is going on: this map's fog, the\n  table and its players, a pause, the round and whose turn it is, and\n  a fog preview. A pill shows only while it has something to say, and\n  a press opens its thing.\n"
        + "- A player's video chip and the Review button wear line drawings and\n  read as pills too.\n"
        + "- On the play map the left panel folds to a narrow rail, so the map\n  has more room. Press an icon of the rail to open the panel over the\n  map, or the pin to keep it open.\n"
        + "- The top row can be hidden: press the small arrow at its right end.\n  A tab at the top edge shows it again. The map tabs and the pills\n  stay, floating on the map.\n  They sit under the top ruler, and the zoom box and the minimap\n  move down to make room. The tab stands in the corner where the\n  two rulers meet.\n"
        + "- The System editor has a key on its Fields, Rolls, Items and Lists\n  tabs. Press What the ticks mean to see what each tick of a row\n  does.\n"
        + "- Help's Coming up says what is built and what is coming: the map\n  builder, text style in more places, friends and direct invites, and\n  the website with cloud saves.\n"
        + "- Help shows the top row's controls with their own drawings: Settings,\n  Multiplayer, the Journal, chat, About and Handouts.\n"
        + "- Where the window is too narrow for the row, Sound, Music, Handouts,\n  Journal and Help move into More, so the row stays one line.\n"
        + "- Both menus work from the keyboard: the arrow keys, a letter for the\n  next row that begins with it, Enter, and Esc to close.\n"
        + "- The top bar's icons are redrawn as Waypoint's own drawings. Settings\n  wears a cog, and Music is still a note.\n"
        + "- The data map's toolbar wears the same line icons as the play map's.\n  Its Link menu lists the four line types by name, each with a small\n  drawing.\n"
        + "- Settings says what each option does. An option that only explained\n  itself in a tooltip has a grey line under its name, and every tooltip\n  is still there.\n"
        + "- The Multiplayer window does the same. The host's options, Table\n  Notepad, Lock Travel, Pause and the room code each have their line.\n"
        + "- The System editor's Combat card says what its blast, cover and\n  roll settings do, each in a grey line under its list.\n\n";
    const wn = [rootRead('WHATSNEW.txt'), read('assets/whatsnew.txt')];
    check('both release notes carry the same lines, and the suite is one of the CI runs',
        wn.every(t => count(t, NOTE) === 1 && count(t, 'Every button is where it was') === 0) && rootRead('.github/workflows/checks.yml').includes("      - name: lookcheck — the look of the play map (no control removed, the toolbar's line icons, gold for the tool in hand)\n        if: ${{ !cancelled() }}\n        run: node tools/lookcheck.js\n"));
    check('Help and the tour say where things went: Help\'s Toolbar groups names the column, what the centre menu shows and hides, More and the bar in a narrow window; Help\'s entry on the rulers has the box at the top right and its two switches; the grids entry sends you to the right edge; and the tour\'s step on the play map\'s tools reads the bar in its new order',
        count(ix, 'Centre, the grid and snap stand in a column at the map&rsquo;s right edge. The centre menu also shows or hides the rulers, the zoom buttons and the pointer location. <b>More</b>, the last button, holds Clear board. In a narrow window the bar tightens, then wraps onto a second row, so no tool is ever cut off.') === 1
        && count(ix.replace(/<svg class="ico"[^>]*>[\s\S]*?<\/svg>/g, '{ico}'), '<p>The box at the top right of a map holds the <b>pointer location</b> and the <b>zoom buttons</b>. Each can be hidden on its own. Press <b>Toggle Pointer Location</b> or <b>Toggle Zoom Buttons</b> in <b>{ico} Settings &#9656; Table</b>, or tick them in the centre menu at the right edge of the play map. The mouse wheel still zooms while the buttons are hidden. Both choices are yours alone, on this computer.</p>') === 1
        && count(ix, '<li>Click the grid button at the right edge of the play map and pick <b>Off, Square or Hex</b>.') === 1
        && count(tourSrc.replace(/<svg class="ico[^>]*>.*?<\/svg>/g, '{ico}'), 'From the left: undo and redo for this map, then move and pan, the pen, eraser and fill. Next come shapes and <b>+ Add</b> for text and pictures, then <b>measure</b>, <b>radius</b>, fog and {ico} <b>Scene</b>. Centre, the <b>grid</b> and <b>snap</b> stand at the map&rsquo;s right edge.') === 1
        && count(tourSrc, "'#wbFloatingToolbar .shape-menu.show, #wbEdgeTools .shape-menu.show'") === 2 && count(ix, 'the minimap fold, rulers, the zoom buttons, the pointer location, panel sizes,') === 1);
    check('Help says how a press works now: a tip of its own on tool options (the small arrow, the icon, a second press, options that stay up), the Snap entry and the Measure entry in the new words, and the four tools\' own tooltips say what a press does',
        count(ix, '<div class="help-tip"><b>Tool options:</b> a tool that has options has a <b>small arrow</b> beside its icon. The icon takes the tool, and a second press puts it away. The arrow opens the tool&rsquo;s options. They stay up while you work, until you press the arrow again or take another tool. The pen, the eraser, fill, measure and radius work this way. A button that only opens a menu has the same small arrow, and either of the two opens the menu.</div>') === 1
        && count(ix, '<b>Snap To</b> picks what a drag aligns to. The Snap button switches snapping on and off, and the small arrow beside it opens Snap To.') === 1
        && count(ix, 'drag across the map to place a ruler. Press the small arrow beside the tool for its options.</li>') === 1
        && count(ix, ' id="drawModeBtn" title="Pen. Press again to put it away.">') === 1 && count(ix, ' id="eraserModeBtn" title="Eraser. Click or drag over strokes to erase them. Press again to put it away.">') === 1
        && count(ix, ' id="measureModeBtn" title="Measure. Drag to place a ruler. Press again to put it away.">') === 1
        && count(ix, ' id="fillModeBtn" title="Fill. Click or drag grid cells to fill them with a color: a hexagon on hex maps, a square on square maps. Right-click a cell to clear it. Press again to put it away.">') === 1);
}

/* ---------- the top row's menus: Campaign and More ---------- */
// Steps R1b and R1c of the top row. The campaign's name opens a menu that lists the campaigns and holds the five campaign buttons. The three
// dots at the row's right end open More: Export As with its kinds, Import, Refresh, About, the welcome screen and, where the row would not
// hold them on one line, Sound, Music, Handouts, Journal and Help. A row that is a control is the control it was. The menus' own code
// (scripts/toprow.js) is sliced by its markers and run for real on pages of plain objects that refuse markup
{
    const CM_OPEN = '<div class="row-menu" id="campMenu" hidden>', cmKids = kidsOf(ix, CM_OPEN) || [];
    const CROW = /^<button class="rm-row( danger)?" id="([A-Za-z]+)" title="([^"]*)"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="[MmLlHhVvAaCcSsZz0-9 .,-]+"\/><\/svg><span>([^<]+)<\/span>(?:<small>([^<]+)<\/small>)?<\/button>$/;
    const cmRows = cmKids.map(k => { const m = CROW.exec(k.text); return m ? [m[2], m[4], m[5] || '', m[3], !!m[1]] : k.text === '<div class="rm-rule"></div>' ? '-' : k.text === '<div class="rm-label">Campaign</div>' ? 'label' : k.text === '<div class="rm-list" id="campMenuList"></div>' ? 'list' : '?' + k.text.slice(0, 50); });
    check('the Campaign menu, as the owner passed it drawn: the campaign\'s name stands in the row with the small arrow the toolbar uses, and says in its tooltip what a press gives; its menu is put away in the page and holds, in this order, the list of campaigns, Search, then New, Rename and System with its grey word, then Delete in red; each of the five is the button it was, with the id, the tooltip and the drawing it had, and a name beside it; the list itself is empty in the page; the page\'s own campaign list stays in the page once, out of sight, inside the same wrap; a player has no such menu',
        J(cmRows) === J(['label', 'list', ['searchCampBtn', 'Search campaigns&hellip;', '', 'Search Campaigns', false], '-', ['newCampBtn', 'New campaign', '', 'Create New Campaign', false], ['renameCampBtn', 'Rename', '', 'Rename Campaign', false],
            ['systemBtn', 'System', 'Sheets and rolls', 'System &mdash; this campaign&rsquo;s attributes, formulas and rolls (character sheets)', false], '-', ['delCampBtn', 'Delete campaign', '', 'Delete Campaign', true]])
        && count(ix, '<button class="tool ghost row-name" id="campMenuBtn" aria-haspopup="true" aria-expanded="false" aria-controls="campMenu" title="This campaign. Press for the list of your campaigns, and to search, add, rename or delete one, or to open its System."><span id="campMenuName">Campaign</span>' + SVG + '<path d="M6 9.5l6 6 6-6"/></svg></button>') === 1
        && /<div class="row-menu-wrap" id="campMenuWrap">\n\s*<button class="tool ghost row-name" id="campMenuBtn"[^\n]*\n\s*<div class="row-menu" id="campMenu" hidden>\n[\s\S]*?\n\s*<\/div>\n\s*<select id="campaignSelect" class="map-select" aria-label="Select Campaign" hidden><\/select>\n\s*<\/div>\n\s*<div id="tableWhere" class="table-where"><\/div>/.test(ix)
        && count(ix, ' id="campaignSelect"') === 1 && css.includes('\n  .row-menu[hidden] { display: none; }\n  #campaignSelect[hidden] { display: none; }') && css.includes("\n  .rm-row.on > .rm-slot::before { content: '\\2713'; }") && css.includes('\n  body.net-client #campMenuWrap { display: none !important; }')
        && css.includes('\n  .rm-row.danger, .rm-row.danger > .ico { color: var(--red); }') && !/hdr-group\[data-label="Campaign"\]/.test(css) && count(ix, '<script type="module" src="scripts/pageshelf.js"></script>\n<script type="module" src="scripts/toprow.js"></script>\n') === 1, J(cmRows));
    // ---- the More menu as the page has it ----
    const header2 = ix.slice(ix.indexOf('<header>'), ix.indexOf('</header>')), FIVE = ['soundInd', 'musicInd', 'handoutsBtn', 'journalBtn', 'helpBtn'];
    const mmKids = kidsOf(ix, '<div class="row-menu" id="moreMenu" hidden>') || [], filesKids = kidsOf(ix, '<div class="rm-part" id="moreFiles">') || [], foldKids = kidsOf(ix, '<div class="rm-part" id="moreFold">') || [];
    const kindKids = kidsOf(ix, '<div id="saveAsMenu" class="dropdown header-dropdown" style="display:none;">') || [];
    const ROW2 = /^<button class="rm-row" (id|data-press)="([A-Za-z]+)" title="([^"]*)">(<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">.*?<\/svg>|<img src="icon\.ico" alt="" class="rm-mark">)<span>([^<]+)<\/span>(?:<small data-badge="([A-Za-z]+)"><\/small>)?<\/button>$/;
    const rowOf = k => { const m = ROW2.exec(k.text); return m ? [m[1], m[2], m[5], m[6] || '', m[4].indexOf('<img') === 0 ? 'mark' : 'drawing', m[3]] : k.text === '<div class="rm-rule"></div>' ? '-' : /^<div class="rm-label">[^<]+<\/div>$/.test(k.text) ? 'label:' + k.text.slice(22, -6) : '?' + k.open.slice(0, 70); };
    const mmSeq = mmKids.map(k => (k.open === '<div class="rm-part" id="moreFiles">' ? 'files' : k.open === '<div class="rm-part" id="moreFold">' ? 'fold' : rowOf(k)));
    const filesSeq = filesKids.map(k => (k.open === '<div class="dropdown-wrap" id="saveAsDropdownWrap">' ? 'export:' + k.ids.join(',') : rowOf(k))), foldSeq = foldKids.map(rowOf);
    const drawOf = how => { const at = ix.indexOf(how), m = at < 0 ? null : /<svg class="ico[^"]*" viewBox="0 0 24 24" aria-hidden="true">.*?<\/svg>/.exec(ix.slice(at, ix.indexOf('</button>', at))); return m ? m[0] : '?' + how; };
    const KINDS = ['exportImgBtn', 'exportPdfBtn', 'exportHtmlBtn', 'exportMdBtn', '|', 'exportItemBtn', 'exportMapsBtn', 'exportWbsBtn', 'exportPlannersBtn', 'exportDocsBtn', '|', 'exportCampaignBtn', 'exportBtn'];
    check('the More menu, as the owner passed it drawn: three dots at the right end of the row, the drawing the play map\'s own More wears, open a menu that is put away in the page and holds, in this order, Export As, Import, then Refresh Waypoint, About Waypoint and Back to the welcome screen, then the part that shows only while the row is folded: Sound, Music, Handouts, Journal and Help; Export As, Import, Refresh and About are the buttons they were, each with its id and its drawing and now its name, and Export As says it opens a list and keeps its eleven kinds beside it, in their order, each with its id; the row to the welcome screen wears the Waypoint mark and presses the mark itself; each of the five rows carries no id, wears the drawing of the control it stands for, and names a control that is still in the row, once',
        J(mmSeq) === J(['label:More', 'files', ['id', 'refreshBtn', 'Refresh Waypoint', '', 'drawing', 'Refresh Waypoint &mdash; reloads the app and puts you straight back into your session'], ['id', 'aboutBtn', 'About Waypoint', '', 'drawing', 'About Waypoint'],
            ['data-press', 'headerBrand', 'Back to the welcome screen', '', 'mark', 'Back to the welcome screen'], 'fold'])
        && J(filesSeq) === J(['export:saveAsDropdownWrap,saveAsBtn,saveAsMenu,' + KINDS.filter(k => k !== '|').join(','), ['id', 'importBtn', 'Import', '', 'drawing', 'Import. Bring in a campaign, a map, a planner or a page from a file.'], '-'])
        && J(foldSeq) === J(['-', 'label:Folded in while the window is narrow', ['data-press', 'soundInd', 'Sound', '', 'drawing', 'Sound. Your volume and mute.'], ['data-press', 'musicInd', 'Music', '', 'drawing', 'Music. Your volume and mute.'],
            ['data-press', 'handoutsBtn', 'Handouts', '', 'drawing', 'Handouts. Pictures and written pages to show your players.'], ['data-press', 'journalBtn', 'Journal', 'journalBadge', 'drawing', 'Journal. Everything a GM has shown you, with your notes.'], ['data-press', 'helpBtn', 'Help', '', 'drawing', 'Help and shortcuts']])
        && J(kindKids.map(k => k.ids[0] || (k.text === '<div class="menu-divider"></div>' ? '|' : '?'))) === J(KINDS) && kindKids.every(k => k.ids.length < 2 && (k.ids.length === 0 || /^<div class="menu-item" id="[A-Za-z]+" title="[^"]+"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="[MmLlHhVvAaCcSsZz0-9 .,-]+"\/><\/svg><span>[A-Za-z ]+<\/span><\/div>$/.test(k.text)))
        && /<div class="dropdown-wrap" id="saveAsDropdownWrap">\n\s*<button class="rm-row" id="saveAsBtn" aria-haspopup="true" title="Export As\. Save the open map, the campaign or everything as a file\."><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="[^"]+"\/><\/svg><span>Export As<\/span><small>11 kinds &rsaquo;<\/small><\/button>\n\s*<div id="saveAsMenu" class="dropdown header-dropdown" style="display:none;">\n/.test(ix)
        && count(ix, '<button class="tool ghost icon" id="moreMenuBtn" aria-haspopup="true" aria-expanded="false" aria-controls="moreMenu" title="More. Export As, Import, Refresh, About and the welcome screen."><svg class="ico ico-dots" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5h.01M12 12h.01M12 19h.01"/></svg></button>') === 1
        && drawOf(' id="moreMenuBtn"') === drawOf(' id="wbMoreBtn"') && FIVE.every(id => drawOf(' data-press="' + id + '"') === drawOf(' id="' + id + '"') && count(header2, ' id="' + id + '"') === 1 && count(ix, ' data-press="' + id + '"') === 1)
        && count(header2, ' data-press="') === 6 && count(ix, '<div class="header-brand" id="headerBrand" title="Back to the welcome screen" style="cursor:pointer;">\n      <img src="icon.ico" alt="" class="brand-icon">') === 1
        && /<div class="hdr-group" data-label="App">\n\s*<button class="tool ghost icon" id="settingsBtn"[^\n]*\n\s*<button class="tool ghost icon" id="helpBtn"[^\n]*\n\s*<div class="row-menu-wrap" id="moreMenuWrap">\n\s*<button class="tool ghost icon" id="moreMenuBtn"/.test(ix), J([mmSeq, filesSeq, foldSeq]).slice(0, 900));
    // ---- the eleven kinds of Export As, each in its own drawing (the sheet of thirteen, passed with "Use these drawings") ----
    const KIND_D = { exportImgBtn: 'M3 5h18v14H3zM7.5 8.5a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6zM3.5 17l5-5 3.5 3.5 3-3 5.5 5.5', exportPdfBtn: 'M7 8.5v-5h10v5M7 17H4.5V8.5h15V17H17M7 13.5h10v7H7z',
        exportHtmlBtn: 'M8 7.5L3.5 12 8 16.5M16 7.5l4.5 4.5-4.5 4.5M13.5 5.5l-3 13', exportMdBtn: 'M9.5 4.5l-2 15M16.5 4.5l-2 15M4.5 9.5h16M3.5 14.5h16', exportItemBtn: 'M4.5 3.5h12l3 3v14h-15zM8 3.5v5h7v-5M7.5 20.5v-7h9v7',
        exportMapsBtn: 'M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2zM9 4.5v13M15 6.5v13', exportWbsBtn: 'M4 5h16v14H4zM7 16l1.8-1.8M10.6 12.4l1.8-1.8M15 8l3 3M18 8l-3 3', exportPlannersBtn: 'M6 3.5h8.5L18 7v13.5H6zM10 10v6l5-3z',
        exportDocsBtn: 'M12 6.5c-2-1.3-4.6-1.8-8-1.5v13c3.4-.3 6 .2 8 1.5 2-1.3 4.6-1.8 8-1.5V5c-3.4-.3-6 .2-8 1.5zM12 6.5v13', exportCampaignBtn: 'M3.5 6h6l2 2.5h9v11h-17z', exportBtn: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9' };
    const KIND_N = { exportImgBtn: 'Save as Image', exportPdfBtn: 'Save PDF', exportHtmlBtn: 'Save HTML', exportMdBtn: 'Save Markdown', exportItemBtn: 'Export This Map', exportMapsBtn: 'Export All Maps', exportWbsBtn: 'Export All Play Maps',
        exportPlannersBtn: 'Export All Planners', exportDocsBtn: 'Export All Pages', exportCampaignBtn: 'Export This Campaign', exportBtn: 'Export Everything' };
    const kindRow = id => { const k = kindKids.filter(q => q.ids[0] === id)[0], m = k ? /^<div class="menu-item" id="[A-Za-z]+" title="[^"]+"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="([^"]+)"\/><\/svg><span>([^<]+)<\/span><\/div>$/.exec(k.text) : null; return m ? [m[1], m[2]] : ['?', '?']; };
    const kindIds = KINDS.filter(k => k !== '|'), kindBad = kindIds.filter(id => kindRow(id)[0] !== KIND_D[id] || kindRow(id)[1] !== KIND_N[id]);
    const addImg = /id="addImageBtn" title="Add Image"><span class="mr-ico"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="([^"]+)"\/>/.exec(ix);
    const playV = /<button class="seg-btn" data-mode="visual"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="([^"]+)"\/>/.exec(ix);
    const ioSrc = read('scripts/io.js'), kindAt = ioSrc.indexOf("var row = document.getElementById('exportItemBtn');"), kindFn = kindAt < 0 ? '' : ioSrc.slice(kindAt, ioSrc.indexOf('\n  }', kindAt));
    check('a kind of Export As wears a drawing and says its name (the sheet of thirteen new drawings, passed with "Use these drawings"): each of the eleven rows is its drawing and then its name, with the id, the tooltip and the words it had; the picture is the very drawing Add\'s Image row wears and the play map the one the Play Map view wears, the other nine are the passed sheet\'s and no two rows wear the same; no row holds a glyph any more; the row for the open item is renamed by its words alone, as text, so that it keeps its drawing; and a row is laid out as a drawing beside its name',
        kindBad.length === 0 && Object.keys(KIND_D).length === 11 && J(Object.keys(KIND_D)) === J(kindIds) && new Set(Object.values(KIND_D)).size === 11 && !!addImg && addImg[1] === KIND_D.exportImgBtn && !!playV && playV[1] === KIND_D.exportWbsBtn
        && Object.values(KIND_D).every(d => /^[MmLlHhVvAaCcSsZz0-9 .,-]+$/.test(d)) && kindKids.every(k => !/&#\d+;|[^\x00-\x7f]/.test(k.text.replace(/&mdash;/g, '')))
        && kindFn.includes("var rowName = row.querySelector('span'); if (it && rowName) rowName.textContent = 'Export This ' + (it.type === 'planner' ? 'Planner' : it.type === 'doc' ? 'Page' : 'Map');") && !/innerHTML/.test(kindFn)
        && css.includes('\n  #moreMenu #saveAsMenu .menu-item { display: flex; align-items: center; gap: 9px; padding: 5px 8px; border-radius: 5px; font-size: 12.5px; }\n  #moreMenu #saveAsMenu .menu-item > .ico { flex: none; color: var(--dim); }\n'), J(kindBad));
    check('the More menu\'s rules in the style sheet: it stands at the row\'s right end and opens leftwards, with its list of kinds outside its own box, beside it; a player has no Export and no Import, and the part goes with its rule; the five fold out of the row only by the one word the body carries, and the part of More that stands for them shows only then; a row that is put away is not drawn; the dot on More shows only while the row is folded; the old caret of the Export button is gone with its rule',
        css.includes('\n  #moreMenu { left: auto; right: 0; min-width: 280px; overflow: visible; max-height: none; }') && css.includes('\n  #moreMenu #saveAsMenu { top: -6px; left: auto; right: 100%; margin: 0 7px 0 0; min-width: 210px; max-height: calc(100vh - 90px); overflow-y: auto;')
        && css.includes('\n  body.net-client #moreFiles { display: none !important; }') && css.includes('\n  body:not(.row-narrow) #moreFold { display: none; }\n  ' + FIVE.map(id => 'body.row-narrow header #' + id).join(', ') + ' { display: none !important; }\n')
        && css.includes('\n  .rm-row[hidden] { display: none; }') && css.includes("\n  #moreMenuBtn.marked::after { content: ''; display: none; position: absolute;") && css.includes('\n  body.row-narrow #moreMenuBtn.marked::after { display: block; }')
        && css.includes('\n  body.net-client #saveAsDropdownWrap, body.net-client #importBtn,') && !/caret-down/.test(css + ix) && count(css, 'row-narrow') === 8);   // the word is said in those three rules and in the map tabs' one, and nowhere else
    // ---- the menus' own code, run for real on a page of plain objects: elements take text and refuse markup, and the row has a height ----
    const trSrc = read('scripts/toprow.js'), trSlice = sliceOf(trSrc, 'toprow'), trWire = sliceOf(trSrc, 'toprowwire'), HOSTILE = '"><img src=x onerror=1>';
    const mkTop = opts => { const w = { err: '', events: [], docL: [], winL: [], obs: [], ros: [], frames: [], focused: null, clicks: [], measured: 0 }, own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
        const classes = n => ({ contains: c => (' ' + n.className + ' ').indexOf(' ' + c + ' ') >= 0, add: c => { if (!n.classList.contains(c)) n.className = (n.className + ' ' + c).trim(); }, remove: c => { n.className = (' ' + n.className + ' ').split(' ' + c + ' ').join(' ').trim(); },
            toggle: (c, f) => { if (f) n.classList.add(c); else n.classList.remove(c); return !!f; } });
        const el = tag => { const n = { tag, L: {}, attrs: {}, kids: [], hidden: true, textContent: '', className: '', type: '', style: {}, offsetParent: {}, addEventListener(t, f) { (n.L[t] = n.L[t] || []).push(f); }, setAttribute(k, v) { n.attrs[k] = String(v); },
            getAttribute(k) { return own(n.attrs, k) ? n.attrs[k] : null; }, appendChild(c) { n.kids.push(c); if (c.text !== undefined) n.textContent += c.text; return c; }, removeChild(c) { n.kids.splice(n.kids.indexOf(c), 1); return c; }, get firstChild() { return n.kids[0] || null; },
            set innerHTML(v) { w.err = 'markup was written'; },
            focus() { w.focused = n; }, click() { w.clicks.push(n.id || n.tag); }, querySelectorAll() { return []; }, fire(t, e) { (n.L[t] || []).slice().forEach(f => f.call(n, e)); return e; } }; n.classList = classes(n); return n; };
        const body = el('body'), header = el('header'), sel = el('select'), campBtn = el('button'), moreBtn = el('button'), campMenu = el('div'), moreMenu = el('div'), campList = el('div'), nameEl = el('span'), flyout = el('div'), badge = el('span'), otherMenu = el('div'), small = el('small');
        const five = [1, 2, 3, 4, 5].map(() => el('button')), saveAs = el('button'), others = [1, 2, 3].map(() => el('button')), welcome = el('button'), brand = el('div'), ctl = { headerBrand: brand };
        saveAs.attrs['aria-haspopup'] = 'true'; welcome.attrs['data-press'] = 'headerBrand'; brand.id = 'headerBrand'; flyout.style.display = 'flex'; badge.style.display = 'none'; small.attrs['data-badge'] = 'journalBadge';
        // the five controls that may fold, as the style sheet treats them: out of sight while the body says the row is folded, and each with a reason of its own to be away
        const prox = FIVE.map(id => { const c = el('button'), r = el('button'); c.id = id; c.avail = (opts.away || []).indexOf(id) < 0; ctl[id] = c; r.attrs['data-press'] = id; r.hidden = false;
            c.getBoundingClientRect = () => (c.avail && !body.classList.contains('row-narrow') ? { width: 28, height: 26, of: id } : { width: 0, height: 0, of: id }); return r; });
        moreBtn.getBoundingClientRect = () => ({ width: 28, height: 26, of: 'more' });
        sel.value = opts.at; sel.options = opts.camps.map(c => ({ value: c[0], textContent: c[1] })); sel.dispatchEvent = e => { w.events.push([e.type, e.bubbles === true, sel.value]); sel.fire(e.type, e); return true; };
        campList.kids.push(el('stale')); if (opts.badge) { badge.textContent = opts.badge; badge.style.display = 'block'; }
        campMenu.querySelectorAll = q => (q === 'button' ? campList.kids.filter(k => k.tag === 'button').concat(five) : []);
        moreMenu.querySelectorAll = q => (q === 'button' ? [saveAs].concat(others, [welcome], prox) : q === '.header-dropdown' ? [flyout] : []);
        Object.defineProperty(header, 'offsetHeight', { get() { w.measured++; return opts.high ? opts.high(body.classList.contains('row-narrow')) : 36; } }); header.children = [el('div'), el('div')];
        const els = Object.assign({ campMenu, campMenuList: campList, campMenuName: nameEl, campaignSelect: sel, moreMenu, otherMenu, journalBadge: badge }, ctl); (opts.gone || []).forEach(id => { delete els[id]; });
        const doc = { body, getElementById: id => (own(els, id) ? els[id] : null), querySelector: q => (q === '[aria-controls="campMenu"]' ? campBtn : q === '[aria-controls="moreMenu"]' ? moreBtn : q === 'header' ? (opts.noHeader ? null : header) : null),
            querySelectorAll: q => (q === '#moreFold [data-press]' ? prox : q === '#moreMenu [data-badge]' ? [small] : []), createElement: el, createTextNode: t => ({ text: String(t) }), addEventListener(t, f, c) { w.docL.push([t, f, c]); }, get activeElement() { return w.focused; } };
        function MO(cb) { this.cb = cb; w.obs.push(this); } MO.prototype.observe = function(t, o) { this.t = t; this.o = o; };
        function RO(cb) { this.cb = cb; this.seen = []; w.ros.push(this); } RO.prototype.observe = function(t) { this.seen.push(t); };
        const win = { addEventListener(t, f) { w.winL.push([t, f]); } }, raf = f => { w.frames.push(f); }, gcs = c => ({ display: c.avail === false || body.classList.contains('row-narrow') ? 'none' : 'flex' });
        const src = '"use strict";\n' + trSlice + '\n' + (opts.wire ? trWire + '\nwire();\n' : '') + 'return { rows: campRows, name: campName, draw: campDraw, sync: campSync, pick: campPick, open: openMenu, close: closeMenus, shown: menuShown, step: menuStep, type: menuType, focus: menuFocus, mrows: menuRows, fit: foldFit, fold: foldSync, mark: markSync, box: anchorBox, MENUS: MENUS, ONE_ROW: ONE_ROW };';
        try { w.api = new Function('document', 'Event', 'MutationObserver', 'ResizeObserver', 'requestAnimationFrame', 'getComputedStyle', 'window', src)(doc, function(type, o) { this.type = type; this.bubbles = !!(o && o.bubbles); }, opts.noMO ? undefined : MO, opts.noRO ? undefined : RO, raf, gcs, win); } catch (e) { w.err = 'threw: ' + String(e && e.message); }
        return Object.assign(w, { body, header, sel, campBtn, moreBtn, campMenu, moreMenu, campList, nameEl, flyout, badge, small, five, saveAs, others, welcome, prox, ctl, els,
            list: () => campList.kids.map(b => [b.tag, b.type, b.className, b.attrs['data-camp'], b.attrs['aria-current'] || '', b.kids.map(k => (k.text !== undefined ? 'text:' + k.text : k.tag + '.' + k.className)).join('|')]) }); };
    const tryIn = (w, f) => { try { if (w.api) f(); } catch (e) { w.err = 'threw: ' + String(e && e.message); } };
    const R = mkTop({ at: 'c2', camps: [['c1', 'First'], ['c2', HOSTILE], ['c3', '']] }), rr = [], marks = () => J(R.list().map(b => b[2] + '/' + b[4]));
    tryIn(R, () => {
        rr.push(J(R.api.rows(R.sel)), R.api.name(R.sel), R.api.name({ value: 'zz', options: [] }), J(R.api.rows(null)), R.api.shown('nope'));
        R.api.sync(); rr.push(R.nameEl.textContent, R.campList.kids.length);                                                     // the name follows the select; a closed menu draws nothing
        rr.push(R.api.open('campMenu'), R.api.shown('campMenu'), R.campBtn.attrs['aria-expanded'], J(R.list()));                  // opened: the list is drawn anew, what it held taken out
        rr.push(R.api.focus('campMenu'), R.focused && R.focused.attrs['data-camp'], R.api.focus('otherMenu'), R.api.focus('nope'));   // the focus goes to the row that is on; a menu with no row takes none
        rr.push(R.api.pick('c2'), R.api.pick('nope'), R.api.pick(5), R.api.pick('__proto__'), J(R.events));                       // the one on screen, a campaign that is not there, and no id at all: nothing is said
        rr.push(R.api.pick('c1'), J(R.events), R.sel.value);                                                                     // a pick sets the select and says so once, as a pick in the select did
        R.api.sync(); rr.push(R.nameEl.textContent, marks());                                                                   // and the open list marks the new one
        rr.push(R.api.close(), R.api.shown('campMenu'), R.campBtn.attrs['aria-expanded'], R.api.close());                         // put away; with none up there is nothing to put away
        rr.push(R.api.open('otherMenu'), R.api.open('__proto__'), R.api.open('saveAsMenu'), R.api.shown('otherMenu'), J(R.api.MENUS));   // only a menu of the row's own list is opened
        R.sel.value = 'zz'; R.api.draw(); rr.push(R.api.focus('campMenu'), R.focused && R.focused.attrs['data-camp'], marks());        // no campaign is on: none is marked, and the first row takes the focus
    });
    const N = mkTop({ at: '', camps: [], gone: ['campaignSelect'] }), nn = [];   // a page with no campaign list at all
    tryIn(N, () => { N.api.sync(); nn.push(N.nameEl.textContent, N.api.open('campMenu'), J(N.list()), N.api.pick('c1'), N.api.pick(''), N.events.length, N.api.focus('campMenu'), N.focused === N.five[0]); });
    const T = mkTop({ at: 'c1', camps: [['c1', 'First']] }), tt = [];   // the two menus of the row
    tryIn(T, () => { tt.push(T.api.open('campMenu'), T.api.open('moreMenu'), T.api.shown('campMenu'), T.api.shown('moreMenu'), T.campBtn.attrs['aria-expanded'], T.moreBtn.attrs['aria-expanded'], T.flyout.style.display, T.api.close('moreMenu'), T.api.shown('moreMenu'),
        T.api.open('campMenu'), T.api.shown('moreMenu'), T.moreBtn.attrs['aria-expanded'], T.flyout.style.display, T.api.shown('campMenu'), T.api.close(), T.api.shown('campMenu')); });
    check('the menus\' own code, run for real on a page of plain objects that refuses markup: the campaigns are read from the page\'s own list, the one on screen marked, and a campaign with no name is called Unnamed Campaign; the name in the row follows that list; an opened Campaign menu draws one button a campaign, its name a text node, so a hostile name is text and nothing else, marks the one on screen for a reader too, and takes out what it held before; a press on a campaign\'s row sets the page\'s list and says so once with a change that bubbles, as a pick in the list did, so a session\'s guard on a switch still runs; a press on the campaign on screen, on one that is not there, or with no id says nothing; one menu of the row is up at a time: opening More puts the Campaign menu away and the other way round, and the call that puts menus away can spare one; a menu that is put away takes with it the list that stood beside it; a menu\'s button says whether it is up, a menu that is not in the page is not up, and only a menu of the row\'s own list is ever opened; on a page with no campaign list at all the menu draws no campaign, the row says Campaign and nothing is picked',
        trSlice.length > 3000 && !R.err && J(rr) === J([J([{ id: 'c1', name: 'First', on: false }, { id: 'c2', name: HOSTILE, on: true }, { id: 'c3', name: 'Unnamed Campaign', on: false }]), HOSTILE, 'Campaign', '[]', false,
            HOSTILE, 1, true, true, 'true', J([['button', 'button', 'rm-row', 'c1', '', 'span.rm-slot|text:First'], ['button', 'button', 'rm-row on', 'c2', 'true', 'span.rm-slot|text:' + HOSTILE], ['button', 'button', 'rm-row', 'c3', '', 'span.rm-slot|text:Unnamed Campaign']]),
            true, 'c2', false, false, false, false, false, false, '[]', true, J([['change', true, 'c1']]), 'c1', 'First', J(['rm-row on/true', 'rm-row/', 'rm-row/']), true, false, 'false', false, false, false, false, false, J(['campMenu', 'moreMenu']),
            true, 'c1', J(['rm-row/', 'rm-row/', 'rm-row/'])]) && !N.err && J(nn) === J(['Campaign', true, '[]', false, false, 0, true, true])
        && !T.err && J(tt) === J([true, true, false, true, 'false', 'true', 'flex', false, true, true, false, 'false', 'none', true, true, false]), R.err || N.err || T.err || J(rr) + ' ' + J(nn) + ' ' + J(tt));
    const st = R.api ? R.api.step : () => null, ty = R.api ? R.api.type : () => null, NAMES = ['Alpha', ' beta', 'Able', 'SystemSheets and rolls', ''];
    const steps = [st('ArrowDown', -1, 3), st('ArrowDown', 0, 3), st('ArrowDown', 2, 3), st('ArrowUp', -1, 3), st('ArrowUp', 0, 3), st('ArrowUp', 2, 3), st('Home', 2, 3), st('End', 0, 3), st('a', 1, 3), st('Escape', 1, 3), st('Enter', 1, 3),
        st('ArrowDown', 0, 0), st('ArrowDown', 0, 1), st('ArrowUp', 0, 1), st('ArrowDown', 5, 3), st('ArrowUp', 5, 3), st('ArrowDown', NaN, 3), st('End', 0, NaN), st('Home', 0, -2)];
    const typed = [ty(NAMES, -1, 'a'), ty(NAMES, 0, 'a'), ty(NAMES, 2, 'A'), ty(NAMES, 0, 'b'), ty(NAMES, 1, 'b'), ty(NAMES, 4, 's'), ty(NAMES, 0, 'z'), ty([], -1, 'a'), ty(NAMES, 9, 'a'), ty(NAMES, 3, 'S'), ty(['x', 'Xa'], 1, 'x'), ty(NAMES, 6, 'a'), ty(NAMES, -1, 'l'), ty(NAMES, 0, ' ')];
    const Hd = mkTop({ at: 'c1', camps: [['c1', 'First']] }), hh = [];   // a row that is hidden takes no key
    tryIn(Hd, () => { Hd.api.open('campMenu'); Hd.five[0].offsetParent = null; Hd.five[3].offsetParent = null; const rows = Hd.api.mrows('campMenu'); hh.push(rows.length, rows.indexOf(Hd.five[0]), rows.indexOf(Hd.five[3]), rows.indexOf(Hd.five[1]), Hd.api.mrows('nope').length); });
    check('a menu of the row from the keyboard, as the list it replaces could be worked: Down goes to the next row and from the last to the first, Up to the one before and from the first to the last, Home and End to the first and the last, with no row in hand Down takes the first and Up the last, any other key is not the menu\'s, and a menu with no row takes no key; a typed letter goes to the next row whose words begin with it, whatever its case and past a leading space, round to the first again, stays where it is when no other row begins with it, and is not taken by a row that only holds the letter further on, nor is a space by any row; a row that is hidden is no row for the keys; opened from the keyboard a menu hands the focus to the row that is on, else to its first row',
        J(steps) === J([0, 1, 0, 2, 2, 1, 0, 2, -1, -1, -1, -1, 0, 0, 0, 2, 0, -1, -1]) && J(typed) === J([0, 2, 0, 1, 1, 3, -1, -1, 0, 3, 0, 0, -1, -1]) && !Hd.err && J(hh) === J([4, -1, -1, 1, 0]), Hd.err || J([steps, typed, hh]));
    // ---- the fold: measured on the row itself ----
    const HT = { un: 36, fo: 36 }, F = mkTop({ at: 'c1', camps: [['c1', 'First']], high: folded => (folded ? HT.fo : HT.un), away: ['musicInd'], gone: ['helpBtn'] }), ff = [], narrow = () => F.body.classList.contains('row-narrow'), hid = () => F.prox.map(r => r.hidden === true);
    tryIn(F, () => {
        ff.push(F.api.ONE_ROW, F.api.fit(), narrow(), F.measured);                                              // a row that holds everything on one line: nothing folds, and it is asked once
        HT.un = 61; HT.fo = 40; ff.push(F.api.fit(), narrow(), F.api.fit(), narrow());                          // it would wrap, and folded it does not: folded, and again the same answer
        ff.push(J(hid()));                                                                                     // More is put away: its rows are not asked
        HT.un = 49; ff.push(F.api.fit()); HT.un = 48; ff.push(F.api.fit(), narrow());                           // just past one row is a wrap, and a tall single row is not
        HT.un = 70; HT.fo = 61; ff.push(F.api.fit(), narrow());                                                // it wraps even folded: left whole, on its two lines
        HT.un = 61; HT.fo = 40; F.body.classList.add('tour-on'); const m0 = F.measured; ff.push(F.api.fit(), narrow(), F.measured - m0);   // the tour's card is up: nothing folds, and the row is not even asked
        F.api.fit(); F.body.classList.remove('tour-on'); ff.push(F.api.fit(), narrow(), F.body.className);                                // the card away: folded again, and the body carries that one word
        ff.push(F.api.fold(), J(hid()), narrow());                                                             // each row shows as its control would unfolded: Music is away for a reason of its own, Help is not in the page
        ff.push(J(F.api.box(F.ctl.soundInd)), J(F.api.box(F.ctl.musicInd)));                                    // folded, a control has no box: its pop-up stands by More's button
        HT.un = 36; F.api.fit(); ff.push(narrow(), J(F.api.box(F.ctl.soundInd)), J(F.api.box(F.ctl.musicInd)));   // unfolded, by the control itself. One that is away for its own reason has no box either way
        F.api.open('moreMenu'); F.ctl.handoutsBtn.avail = false; HT.un = 61; F.api.fit(); ff.push(J(hid()));     // More is up when the row folds: its rows are asked again
        F.ctl.soundInd.avail = false; F.api.fit(); ff.push(J(hid()));                                            // the fold did not change: they are not asked again
        F.api.close(); F.api.open('moreMenu'); ff.push(J(hid()));                                                // opened anew, they are
        ff.push(F.api.mark(), F.small.textContent, F.moreBtn.classList.contains('marked'));                      // the Journal has nothing unread
        F.badge.textContent = '3'; F.badge.style.display = 'block'; ff.push(F.api.mark(), F.small.textContent, F.moreBtn.classList.contains('marked'));   // three unread: said on its row, and More is marked
        F.badge.style.display = 'none'; ff.push(F.api.mark(), F.small.textContent, F.moreBtn.classList.contains('marked'));                               // the badge put away with its old number still in it: nothing to say
        F.badge.style.display = 'block'; F.badge.textContent = ''; ff.push(F.api.mark(), F.moreBtn.classList.contains('marked'));
    });
    const G = mkTop({ at: 'c1', camps: [['c1', 'First']], noHeader: true, gone: ['journalBadge'], away: FIVE }), gg = [];   // a page with no header, no badge, and every one of the five away
    tryIn(G, () => { gg.push(G.api.fit(), G.body.className, G.api.fold(), J(G.prox.map(r => r.hidden)), G.api.mark(), G.small.textContent); });
    check('the fold, run for real on a page whose row has a height: the row is asked how tall it stands with the fold taken off, and Sound, Music, Handouts, Journal and Help fold into More only while the row would wrap and folding keeps it on one line; a row that wraps even folded is left whole on its two lines; just past one row is a wrap; while the tour\'s card is up nothing folds and the row is not asked; the body carries the answer as one word; a row of More that stands for a folded control shows only while that control would show unfolded, so one that is away for a reason of its own, or is not in the page, has no row, and the rows are asked when More opens and when the fold changes under an open More, never while More is put away; a folded control\'s own pop-up stands by More\'s button, an unfolded one\'s by the control; the Journal\'s unread count is said on its row and marks More\'s button, and a badge that is put away or empty says nothing',
        !F.err && J(ff) === J([48, false, false, 1, true, true, true, true, J([false, false, false, false, false]), true, false, false, false, false, false, false, 0, true, true, 'row-narrow', true, J([false, true, false, false, true]), true,
            J({ width: 28, height: 26, of: 'more' }), J({ width: 28, height: 26, of: 'more' }), false, J({ width: 28, height: 26, of: 'soundInd' }), J({ width: 28, height: 26, of: 'more' }),
            J([false, true, true, false, true]), J([false, true, true, false, true]), J([true, true, true, false, true]), false, '', false, true, '3', true, false, '', false, false, false])
        && !G.err && J(gg) === J([false, '', false, J([true, true, true, true, true]), false, '']), F.err || G.err || J(ff) + ' ' + J(gg));
    // ---- the wiring, run for real: wire() itself on a page of plain objects that keeps every listener, with one focus ----
    const ev = (target, extra) => Object.assign({ target, stops: 0, prevents: 0, detail: 1, stopPropagation() { this.stops++; }, preventDefault() { this.prevents++; } }, extra || {});
    const tgt = hits => ({ closest: q => (Object.prototype.hasOwnProperty.call(hits, q) ? hits[q] : null) }), NONE = tgt({}), WH = { un: 36, fo: 36 };
    const W = mkTop({ at: 'c1', camps: [['c1', 'First'], ['c2', 'Second']], wire: true, high: folded => (folded ? WH.fo : WH.un) }), ww = [], mm = [], zz = [], W2 = mkTop({ at: 'c1', camps: [['c1', 'First']], wire: true, noMO: true, noRO: true });
    tryIn(W, () => {
        const up = () => W.api.shown('campMenu'), key = (node, k, extra) => node.fire('keydown', ev(NONE, Object.assign({ key: k }, extra || {}))), at = () => W.campMenu.querySelectorAll('button').indexOf(W.focused), camp = () => (W.focused && W.focused.attrs['data-camp']) || '';
        const down = target => { W.docL.forEach(l => { if (l[0] === 'pointerdown') l[1](ev(target)); }); return up(); };
        ww.push(W.nameEl.textContent, up(), J(W.docL.map(l => [l[0], l[2]])), W.frames.length, W.winL.length);                                                // wired: the name is read at once, nothing is up
        let e = W.campBtn.fire('click', ev(NONE)); ww.push(up(), e.stops, W.campBtn.attrs['aria-expanded'], W.campList.kids.length, W.focused === null);       // a press on the name opens and draws, goes on to the page, and leaves the focus alone
        W.campBtn.fire('click', ev(NONE)); ww.push(up());                                                                                                    // a second press puts it away
        W.campBtn.fire('click', ev(NONE, { detail: 0 })); ww.push(up(), camp());                                                                              // pressed from the keyboard: the focus goes to the campaign on screen
        e = key(W.campMenu, 'ArrowDown'); ww.push(at(), e.prevents); key(W.campMenu, 'End'); ww.push(at()); key(W.campMenu, 'ArrowDown'); ww.push(at()); key(W.campMenu, 'ArrowUp'); ww.push(at()); key(W.campMenu, 'Home'); ww.push(at());
        W.five[4].textContent = 'Delete campaign'; W.five[0].textContent = 'Search campaigns';
        e = key(W.campMenu, 'd'); ww.push(at(), e.prevents); key(W.campMenu, 'S'); ww.push(at()); key(W.campMenu, 's'); ww.push(at()); key(W.campMenu, 's'); ww.push(at());   // a letter: Delete, then Second, then Search, and round to Second
        e = key(W.campMenu, 'q'); ww.push(at(), e.prevents + e.stops); e = key(W.campMenu, 'd', { ctrlKey: true }); ww.push(at(), e.prevents); e = key(W.campMenu, 'd', { metaKey: true }); ww.push(e.prevents); e = key(W.campMenu, 'd', { altKey: true }); ww.push(e.prevents);
        e = key(W.campMenu, 'Delete'); ww.push(at(), e.prevents); e = key(W.campMenu, ' '); ww.push(at(), e.prevents, up());   // no row begins with it, a chord of any kind, a key with a name, the space bar: the page's
        e = key(W.campMenu, 'Escape'); ww.push(up(), e.stops, e.prevents, W.focused === W.campBtn, W.campBtn.attrs['aria-expanded']);                          // Escape: away, no further, the focus back on the name
        e = key(W.campBtn, 'Escape'); ww.push(up(), e.stops + e.prevents); e = key(W.campBtn, 'ArrowUp'); ww.push(up(), e.prevents);                             // on the name with the menu away, Escape and Up are the page's
        e = key(W.campBtn, 'ArrowDown'); ww.push(up(), e.prevents, camp());                                                                                   // Down opens it and goes in
        W.focused = W.campBtn; key(W.campBtn, 'ArrowDown'); ww.push(at()); e = key(W.campBtn, 'Escape'); ww.push(up(), e.stops);                               // on the name with the menu up: Down goes in, Escape puts it away
        W.campBtn.fire('click', ev(NONE)); W.focused = null; W.campMenu.fire('click', ev(tgt({ '[data-camp]': { getAttribute: k => (k === 'data-camp' ? 'c2' : null) }, 'button, .menu-item': W.five[0] })));
        ww.push(up(), W.sel.value, J(W.events), W.nameEl.textContent, W.focused === W.campBtn);                                                               // a campaign's row: away, picked, said once, the name follows the change, the focus back on the name
        W.campBtn.fire('click', ev(NONE)); W.focused = null; W.campMenu.fire('click', ev(tgt({ 'button, .menu-item': W.five[1] }))); ww.push(up(), W.events.length, W.focused === null, W.clicks.length);   // one of the five buttons: the menu steps aside, says nothing and presses nothing
        W.campBtn.fire('click', ev(NONE)); W.campMenu.fire('click', ev(NONE)); ww.push(up());                                                                 // the caption or a rule: nothing
        ww.push(down(tgt({ '.row-menu': {} })), down(tgt({ '[aria-haspopup="true"][aria-controls]': {} })), down(tgt({ '#tourCard': {} })), down(NONE));       // a press in it, on a menu's button, on the tour's card: it stays. Anywhere else: away
        W.campBtn.fire('click', ev(NONE)); ww.push(down({}));                                                                                                 // a target that cannot say where it is: away
        W.sel.options = [{ value: 'c9', textContent: 'Ninth' }]; W.sel.value = 'c9'; W.obs[0].cb(); ww.push(W.nameEl.textContent);                             // the list filled again: the name follows
        // More
        const mup = () => W.api.shown('moreMenu');
        W.moreBtn.fire('click', ev(NONE)); mm.push(mup(), W.moreBtn.attrs['aria-expanded'], up());                                                            // the three dots open More
        W.flyout.style.display = 'flex'; W.moreMenu.fire('click', ev(tgt({ 'button, .menu-item': W.saveAs }))); mm.push(mup(), W.flyout.style.display);        // Export As opens its list beside the menu, which stays up
        W.moreMenu.fire('click', ev(tgt({ 'button, .menu-item': W.others[0] }))); mm.push(mup(), W.flyout.style.display, W.clicks.length);                              // a kind of export, or Import, Refresh, About: the menu steps aside, and the list goes with it
        W.moreBtn.fire('click', ev(NONE)); W.moreMenu.fire('click', ev(tgt({ '[data-press]': W.prox[0], 'button, .menu-item': W.prox[0] }))); mm.push(mup(), J(W.clicks));          // a row that stands for Sound presses Sound itself
        W.moreBtn.fire('click', ev(NONE)); W.moreMenu.fire('click', ev(tgt({ '[data-press]': W.welcome, 'button, .menu-item': W.welcome }))); mm.push(mup(), J(W.clicks));          // and the welcome row the mark
        W.moreBtn.fire('click', ev(NONE)); W.moreMenu.fire('click', ev(tgt({ '[data-press]': { getAttribute: () => 'nope' }, 'button, .menu-item': W.others[1] }))); mm.push(mup(), W.clicks.length);   // a control that is not in the page: away, nothing pressed, nothing thrown
        W.moreBtn.fire('click', ev(NONE)); W.focused = W.moreBtn; key(W.moreBtn, 'ArrowDown'); mm.push(W.focused === W.saveAs); e = key(W.moreMenu, 'Escape'); mm.push(mup(), W.focused === W.moreBtn, e.stops);   // More's keys are its own
        // what makes the row be measured again
        zz.push(W.ros.length, W.ros[0] && J(W.ros[0].seen.map(n => n.tag)), W.obs.length, W.obs[0].t === W.sel, J(W.obs[0].o), W.obs[1].t === W.body, J(W.obs[1].o), W.obs[2].t === W.badge, J(W.obs[2].o));
        WH.un = 61; WH.fo = 40; W.ros[0].cb(); W.ros[0].cb(); zz.push(W.frames.length, W.body.classList.contains('row-narrow'));                               // the row changed its size: asked again once, in the next frame, and not before
        W.frames.shift()(); zz.push(W.body.classList.contains('row-narrow'), W.frames.length); W.ros[0].cb(); zz.push(W.frames.length); W.frames.shift()();    // the frame: folded. A later change asks again
        W.obs[1].cb(); zz.push(W.frames.length);                                                                                                              // the body's class changed, by the fold's own word: no news
        W.body.classList.add('tour-on'); W.obs[1].cb(); W.obs[1].cb(); zz.push(W.frames.length); W.frames.shift()(); zz.push(W.body.classList.contains('row-narrow'));   // the tour's card went up: asked once, and nothing is folded
        W.body.classList.remove('tour-on'); W.obs[1].cb(); zz.push(W.frames.length); W.frames.shift()(); zz.push(W.body.classList.contains('row-narrow'));     // and away: folded again
        W.badge.textContent = '2'; W.badge.style.display = 'block'; W.obs[2].cb(); zz.push(W.small.textContent, W.moreBtn.classList.contains('marked'));       // the Journal's count changed: said at once
    });
    const w2 = []; tryIn(W2, () => { w2.push(W2.nameEl.textContent, W2.obs.length, W2.ros.length, J(W2.winL.map(l => l[0])), W2.frames.length); W2.winL[0][1](); W2.winL[0][1](); w2.push(W2.frames.length);
        W2.badge.textContent = '4'; W2.badge.style.display = 'block'; W2.api.open('moreMenu'); w2.push(W2.small.textContent); });   // nobody watches the badge there: More says the count when it opens
    const W3 = mkTop({ at: 'c1', camps: [['c1', 'First']], wire: true, noHeader: true }), W4 = mkTop({ at: 'c1', camps: [['c1', 'First']], wire: true, high: folded => (folded ? 40 : 61), badge: '5' });   // no header at all; and a row too full, with a count, from the start
    check('the Campaign menu\'s wiring, run for real on a page of plain objects: at the start the name is read; a press on the name opens the menu and draws it, goes on to the page so that a menu elsewhere closes at it, and a second press puts it away; pressed from the keyboard the focus goes to the campaign on screen; the arrow keys, Home and End go through the rows, a letter goes to the next row that begins with it and round again, and a letter no row begins with, a chord, a key with a name and the space bar are the page\'s; Escape puts the menu away, goes no further and hands the focus back to the name; with the menu away Down on the name opens it and goes in, and Escape and Up are the page\'s; a press on a campaign\'s row puts the menu away, hands the focus back, picks the campaign once, and the name follows; a press on one of the five buttons leaves the work to that button and steps aside; a press on the caption does nothing; a press in the menu, on a menu\'s own button or on the tour\'s card leaves it up, and a press anywhere else puts it away; the name follows a list that was filled again',
        trWire.length > 2500 && !W.err && J(ww) === J(['First', false, J([['pointerdown', true]]), 0, 0, true, 0, 'true', 2, true, false, true, 'c1', 1, 1, 6, 0, 6, 0, 6, 1, 1, 2, 1, 1, 0, 1, 0, 0, 0, 1, 0, 1, 0, true, false, 1, 1, true, 'false',
            false, 0, false, 0, true, 1, 'c1', 0, false, 1, false, 'c2', J([['change', true, 'c2']]), 'Second', true, false, 1, true, 0, true, true, true, true, false, false, 'Ninth']), W.err || J(ww));
    check('the More menu\'s wiring, run for real: the three dots open it and the Campaign menu is not up with it; Export As opens its list beside the menu, which stays up; a kind of export, Import, Refresh or About is the control itself, so the menu steps aside and the list goes with it, and nothing else is pressed; a row that stands for a control of the row presses that control itself, Sound for Sound and the welcome row for the Waypoint mark; a row whose control is not in the page presses nothing and throws nothing; More has the keys the Campaign menu has',
        !W.err && J(mm) === J([true, 'true', false, true, 'flex', false, 'none', 0, false, J(['soundInd']), false, J(['soundInd', 'headerBrand']), false, 2, true, false, true, 1]), W.err || J(mm));
    check('what has the row measured again, run for real: the row and each thing that stands in it are watched for their size, the page\'s campaign list for being filled again, the body for the tour\'s card going up or away, and the Journal\'s badge for its count; a change of size asks once, in the next frame and not before it, and a later change asks again; the fold\'s own word on the body is no news, so nothing loops; the tour\'s card going up unfolds the row and its going away folds it again; a new count is said at once; a page with no observers is wired all the same, measures at a resize of the window, once a frame at most, and says the count when More opens; a page with no header is wired too; a row that is too full when the page opens, with a count on the Journal, is folded and marked at once; the module wires itself, publishes its few calls, and writes no markup anywhere',
        !W.err && J(zz) === J([1, J(['header', 'div', 'div']), 3, true, '{"childList":true}', true, J({ attributes: true, attributeFilter: ['class'] }), true, J({ attributes: true, attributeFilter: ['style'], childList: true, characterData: true, subtree: true }),
            1, false, true, 0, 1, 0, 1, false, 1, true, '2', true]) && !W2.err && J(w2) === J(['First', 0, 0, J(['resize']), 0, 1, '4']) && !W3.err && W3.ros.length === 0 && J(W3.winL.map(l => l[0])) === J(['resize'])
        && !W4.err && W4.body.classList.contains('row-narrow') && W4.small.textContent === '5' && W4.moreBtn.classList.contains('marked') && W4.frames.length === 0
        && /\nwire\(\);\nwindow\.wpTopRow = \{ open: openMenu, close: closeMenus, shown: menuShown, sync: campSync, box: anchorBox \};\n$/.test(trSrc) && !/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(trSrc), W.err || W2.err || W3.err || W4.err || J(zz) + ' ' + J(w2));
    const helpTop = ix.slice(ix.indexOf('<h4>The top row</h4>'), ix.indexOf('<h4>Your first map</h4>'));
    check('the two menus, said: Help has a part on the top row that says a press on the campaign\'s name lists the campaigns, that the same menu searches, adds, renames and deletes them and holds System, that the three dots hold Export As, Import, Refresh, About and the way back to the welcome screen, that five controls move into More where the window is narrow, and which keys work a menu; the entry on systems, Settings and the sheet\'s own refusals send you to the campaign\'s name and then System, and the entry on importing a page to More; the tour\'s first step points at the name, and its steps on the system and on exporting open the menu that holds the row; Sound\'s and Music\'s own pop-ups ask the row where to stand',
        helpTop.length > 900 && helpTop.includes('<li><b>Campaigns:</b> press the campaign&rsquo;s name in the top row for the list of your campaigns. Pick one to switch to it.') && helpTop.includes('<li>The same menu searches, adds, renames and deletes campaigns.</li>')
        && helpTop.includes('<li><b>System</b>, in that menu, opens the campaign&rsquo;s rules and sheets.</li>') && helpTop.includes('<li><b>More:</b> the three dots at the right end of the top row hold what you need less often.')
        && helpTop.includes('<li>Export As and Import are rows of it. So are Refresh Waypoint and About Waypoint.</li>') && helpTop.includes('<li>Back to the welcome screen is there too. The Waypoint mark at the left does the same.</li>')
        && helpTop.includes('<li>Where the window is too narrow for the row, Sound, Music, Handouts, Journal and Help move into More. Nothing is cut off.</li>') && helpTop.includes('<li><b>From the keyboard:</b> both menus can be worked without the mouse.')
        && helpTop.includes('<li>The arrow keys go through a menu, and a letter goes to the next row that begins with it.</li>') && helpTop.includes('<li><kbd>Enter</kbd> presses a row and <kbd>Esc</kbd> closes the menu.</li>')
        && count(ix, '<li>Press the campaign&rsquo;s name in the top row, then <b>System</b>, to write the rules of the campaign on screen, with no code. A system is') === 1 && count(ix, '<li><b>Import</b>, under <b>More</b> in the top row, takes a <code>.md</code> file, or a zip that holds one, and asks which it becomes.</li>') === 1
        && count(ix, "The campaign's system (System, in the campaign's menu in the top row: attributes, formulas, rolls)") === 1 && count(read('scripts/sheets.js'), "return { error: 'The campaign has no system yet. Press the campaign\\'s name in the top row, then System, to make one.' };") === 2
        && count(tourSrc, "    { target: '#campMenuBtn', title: 'Campaigns',\n      html: 'Everything belongs to a campaign. Press its name here for the list of your campaigns. The same menu searches, adds, renames and deletes them.") === 1
        && count(tourSrc, "if (window.wpTopRow) window.wpTopRow.open('campMenu'); } },") === 1 && !/target: '#campaignSelect'/.test(tourSrc)
        && count(tourSrc, "A <b>Markdown</b> file becomes a planner or a handbook page. Both are under <b>More</b> in the top row.',\n      help: ['start', 'Export As'],\n      before: function() { if (window.wpTopRow) window.wpTopRow.open('moreMenu'); } },") === 1
        && count(read('scripts/sound.js'), "if (!open) { var r = window.wpTopRow ? window.wpTopRow.box(b) : b.getBoundingClientRect(); pop.style.left =") === 1
        && count(read('scripts/music.js'), "    var mi = ui('musicInd'), r = window.wpTopRow ? window.wpTopRow.box(mi) : mi.getBoundingClientRect(); pop.style.right =") === 1);
}

/* ---------- options that say what they do: Settings ---------- */
// Backlog 107, the look's last part. The mock-up the owner passed: "A name on every choice, and one grey line where the name is not enough. No
// one should need a tooltip to learn what a button does", and "Every tooltip of today stays". Settings is the first window after the
// toolbar's menus. A line is added beside or under what is there: no control, id, tooltip or handler changes. A new option of Settings whose
// name is not enough gets its line, and joins this list
{
    const sA = ix.indexOf('<div id="settingsModal"'), sZ = ix.indexOf('<div id="sheetViewModal"', sA), setHtml = sA > 0 && sZ > sA ? ix.slice(sA, sZ) : '';
    const RWO = 'Refuse stops it. Warn lets it through with a note to them and you. Off does not check.';
    const NAMED = [['setFxReduced', 'Reduce motion (this machine)', 'Skips screen shake and shortens flashes.'], ['setSenseCaps', 'Sense captions over tokens (this machine)', 'The line above a token that is blind, or where a sense fails.'],
        ['setWallsMode', 'Walls stop player tokens', 'A player&rsquo;s token cannot land in or cross a wall, a closed door or a barrier. Yours are never stopped. ' + RWO], ['setMoveMode', 'Move limit', 'On its turn a player&rsquo;s token moves no further than its Move per turn.'],
        ['setOrderMode', 'Out of turn', 'A player&rsquo;s token in the fight moves only on its own turn.'], ['setActsMode', 'Actions per turn', 'A press of a button that costs an action spends one of the turn&rsquo;s actions.'],
        ['setTimersMode', 'Effect timers', 'Who may pause, reset or stop the countdown of a timed effect.'], ['setTargetAskMode', 'A player targets one of my characters', 'On a map with no fight running, you can be asked whether to start one there.'],
        ['setTimeRulesMode', 'Time rules', 'What happens when time passes and your system&rsquo;s rules by the clock are due.'], ['setFillMode', 'Players fill their own pools', 'Whether a player may fill a pool of their own back to full.']];
    const UNDER = [['setActsMode', 'For those three: ' + RWO], ['setVttPushBtn', 'Copies the default above onto the campaigns you tick. The others keep their own settings.'], ['setJournalPage', 'The page each campaign shows first.'], ['setJournalShow', 'Which Show chip the Journal page starts on.'],
        ['setInboxOpens', 'Which From chip the Inbox starts on.'], ['setSentOpens', 'Which To chip the Sent page starts on.'], ['setHandoutArrive', 'A handout or a shared page opens on screen at once, or is only counted on the Journal button.'],
        ['setResetIdentityBtn', 'Makes you a new identity at every table. A GM&rsquo;s tokens given to the old one no longer know you. If you host, your players join your table as a new GM&rsquo;s.'], ['setResetLayoutBtn', 'Puts both side panels back to their default widths.'],
        ['setSnapNowBtn', 'Copies the save as it is now into the backups folder. It is kept until you delete it.'], ['setResetPrefsBtn', 'Clears what this computer remembers of your choices. Your campaigns and your profile are not touched.']];
    // every name that carries a line, with the control it stands beside; and every line that stands under a control, with that control
    const named = [...setHtml.matchAll(/<span class="set-name">(?:<span>)?([^<]+)(?:<\/span>)?<small>([^<]+)<\/small><\/span>(?: <select id="([A-Za-z]+)"|<\/label>)/g)].map(m => [m[3] || 'setFxReduced', m[1], m[2]]);   // a tick's row names no list: it is the one tick, Reduce motion
    const under = [...setHtml.matchAll(/ id="([A-Za-z]+)"[^\n]*\n\s*<div class="set-line[^"]*">([^<]+)<\/div>/g)].map(m => [m[1], m[2]]);
    // the rule each line is written to, read as it is read: a named entity is its character
    const read1 = s => s.replace(/&rsquo;/g, '\u2019'), rough = NAMED.map(n => n[2]).concat(UNDER.map(u => u[1])).map(read1).filter(s => /[()\[\];\u2014\u2013&]| - /.test(s) || !/\.$/.test(s) || s.length > 230 || s.split(/\. /).some(p => p.length > 110));
    const tipOn = id => { const at = setHtml.indexOf(' id="' + id + '"'), from = setHtml.lastIndexOf('\n', at), row = setHtml.slice(from, setHtml.indexOf('\n', at)); return / title="[^"]{20,}"/.test(row); };
    check('Settings says what each option does (the owner\'s passed mock-up: "A name on every choice, and one grey line where the name is not enough"): each of the ten options that are a name beside a list or a tick carries one grey line under that name, and each of eleven controls has its line under it, twenty-one lines in all and no other; every line is plain words, with no bracket, dash or semicolon, ends in a full stop and runs to no long sentence; and "Every tooltip of today stays": each of those rows still has its tooltip, and the window holds the forty-two tooltips it held',
        setHtml.length > 40000 && J(named) === J(NAMED) && J(under) === J(UNDER) && rough.length === 0 && count(setHtml, 'class="set-name"') === 10 && count(setHtml, 'class="set-line') === 11 && count(setHtml, ' title="') === 42
        && NAMED.concat(UNDER).every(r => count(setHtml, ' id="' + r[0] + '"') === 1 && tipOn(r[0])), J([named.filter((n, i) => J(n) !== J(NAMED[i])).slice(0, 2), under.filter((u, i) => J(u) !== J(UNDER[i])).slice(0, 2), rough]));
    check('the lines\' own rules in the style sheet: a name and its line stand one above the other, the line small and grey, and a line under a list or in a column of buttons hugs the control it tells of',
        css.includes('\n  .set-name { display: flex; flex-direction: column; gap: 1px; min-width: 0; }\n  .set-name > small, .set-line { font-size: 10.5px; color: var(--dim); line-height: 1.4; font-weight: 400; }\n  .set-name > span { font-size: 12px; color: var(--ink); }\n  .set-line { margin-top: 3px; }\n')
        && css.includes('\n  .set-line.tight { margin-top: -5px; }') && css.includes('\n  .field + .set-line { margin-top: -9px; margin-bottom: 9px; }'));
}

/* ---------- options that say what they do: the Multiplayer window ---------- */
// The same passed mock-up, the second window. Ten lines: eight under a control and two under a tick's name. A first draft had thirteen, and
// longer ones, and pushed Start Hosting out of view in a window 900 high. So a line above that button is one line long, and an option whose
// caption, choices or placeholder already say it has none: the name, the campaign, the password. net.js rewrites the words of Pause and of
// Lock Travel, so their lines stand under the buttons and are true in both states. A new control of the window joins `IDS`
{
    const nA = ix.indexOf('<div id="netModal"'), nZ = ix.indexOf('<div id="streamVideo"', nA), netHtml = nA > 0 && nZ > nA ? ix.slice(nA, nZ) : '';
    const IDS = ['netModal', 'netCloseBtn', 'netStatus', 'netJoinAvatar', 'netNameInput', 'netPaneBar', 'netPaneHostBtn', 'netPaneJoinBtn', 'netPaneHost', 'netCampSelect', 'netStageSelect', 'netStageFallbackRow', 'netStageFallbackSelect', 'newPlayersBox',
        'netWaitingSelect', 'netWaitingSight', 'netMakeSelect', 'netMakeFile', 'netPassInput', 'netHostBtn', 'netHostInfo', 'netCode', 'netCopyBtn', 'netSummonBtn', 'netCombatBtn', 'netNotepadBtn', 'netLogBtn', 'netTravelLockBtn', 'netPauseBtn', 'netPaneJoin',
        'netCodeInput', 'netJoinBtn', 'netJoinPassInput', 'netRoster', 'netVttLine', 'netPlayersBtn', 'netEndBtn', 'netLeaveBtn'];
    const TICKS = [['netWaitingSight', 'Waiting tokens see around them under fog', 'Off, they see only what you have revealed.'], ['netMakeFile', '&hellip;may start it from a file', 'With Import on the new sheet. You review it when they press Done.']];
    const UNDER = [['netStageSelect', 'Follow me moves the whole table with you. A map keeps it on that map.'], ['netStageFallbackSelect', 'Follow me puts them on your map once. After that they stay put.'],
        ['netWaitingSelect', 'A waiting token is their picture in a dashed outline. They can move it.'], ['netMakeSelect', 'To ask one player, press their chip, then Let them make a character.'],
        ['netNotepadBtn', 'A throwaway notepad the whole table sees as you type.'], ['netTravelLockBtn', 'While travel is locked, portals and room links do not work for players. Tokens still move.'],
        ['netPauseBtn', 'While the table is paused, players cannot move tokens or travel. Chat stays open.'], ['netJoinPassInput', 'Your GM sends you the room code. Type or paste it with or without the hyphen.']];
    const ticks = [...netHtml.matchAll(/<input type="checkbox" id="([A-Za-z]+)"> <span class="set-name"><span>([^<]+)<\/span><small>([^<]+)<\/small><\/span><\/label>/g)].map(m => [m[1], m[2], m[3]]);
    // a line tells of the control it stands under: the last id before it, with nothing between the two but that control's own choices and its end
    const OWN_END = /^(?:option value="[a-z]*">[^<]*|\/option>\s*|\/select>\s*|\/button>\s*)$/;
    const under = [...netHtml.matchAll(/<div class="set-line">([^<]+)<\/div>/g)].map(m => { const before = netHtml.slice(0, m.index), ids = before.match(/ id="[A-Za-z]+"/g) || [], id = ids.length ? ids[ids.length - 1] : ' id="?"', gap = before.slice(before.lastIndexOf(id) + id.length);
        const tags = gap.split('<').slice(1), ended = tags.length ? /^\/(?:select|button)>\s*$/.test(tags[tags.length - 1]) : /^[^>]*>\s*$/.test(gap);   // after the control's own end, never inside it; a box has no end of its own
        return [id.slice(5, -1), m[1], ended && tags.every(t => OWN_END.test(t))]; });
    const rough = TICKS.map(t => t[2]).concat(UNDER.map(u => u[1])).filter(s => /[()\[\];—–&]| - /.test(s) || !/\.$/.test(s) || s.length > 230 || s.split(/\. /).some(p => p.length > 110));
    // what stands above Start Hosting is one line long, so that the button stays in view: the window is 420 wide, and 72 characters fill a line
    const above = [...netHtml.slice(0, netHtml.indexOf(' id="netHostBtn"')).matchAll(/<div class="set-line">([^<]+)<\/div>|<small>([^<]+)<\/small>/g)].map(m => m[1] || m[2]), long = above.filter(s => s.length > 72);
    const tipOn = id => { const at = netHtml.indexOf(' id="' + id + '"'), from = netHtml.lastIndexOf('\n', at), row = netHtml.slice(from, netHtml.indexOf('\n', at)); return / title="[^"]{20,}"/.test(row); };
    const tips = read('scripts/tips.js'), netJs = read('scripts/net.js');
    check('the Multiplayer window says what its options do (the same passed mock-up): the window holds the thirty-eight ids it held, in their order, each in the page once; the two ticks of Players without a character each carry one grey line under their name, and eight controls have their line under them, ten lines in all and no other: where players arrive, where a new player starts, what a waiting token is, how to ask one player to make a character, the Table Notepad, Lock Travel, Pause, and the room code; each line stands right under its own control, is plain words with no bracket, dash or semicolon, ends in a full stop and runs to no long sentence; a line above Start Hosting is one line long, so that the button stays in view; and "Every tooltip of today stays": each of those controls still has its tooltip, the room code and the password of the join part in the tips, and the window holds the twenty-three it held',
        netHtml.length > 10000 && J((netHtml.match(/ id="[A-Za-z]+"/g) || []).map(s => s.slice(5, -1))) === J(IDS) && IDS.length === 38 && IDS.every(id => count(ix, ' id="' + id + '"') === 1)
        && J(ticks) === J(TICKS) && J(under.map(u => u.slice(0, 2))) === J(UNDER) && under.every(u => u[2] === true) && rough.length === 0
        && count(netHtml, 'class="set-name"') === 2 && count(netHtml, 'class="set-line') === 8 && count(netHtml, '<small>') === 2 && above.length === 6 && long.length === 0
        && count(netHtml, ' title="') === 23 && TICKS.concat(UNDER).every(r => r[0] === 'netJoinPassInput' || tipOn(r[0]))
        && count(tips, "    netCodeInput: 'The room code your GM gave you: ten characters, shown as XXXXX-XXXXX. Type or paste it with or without the hyphen.',") === 1 && count(tips, "    netJoinPassInput: 'Only needed if the GM set a session password.',") === 1,
        J([ticks.filter((t, i) => J(t) !== J(TICKS[i])).slice(0, 2), under.filter((u, i) => J(u.slice(0, 2)) !== J(UNDER[i]) || u[2] !== true).slice(0, 2), rough, long, count(netHtml, ' title="')]));
    check('Pause and Lock Travel keep their lines whatever they read: net.js rewrites the words of each button and nothing beside it, so each line stands after its button, begins with the state it tells of, and is true while the button says Resume or Allow as well',
        count(netJs, "    if (btn) { btn.innerHTML = net.paused ? '&#9654;&#65039; Resume the Table' : '&#9208;&#65039; Pause the Table'; btn.classList.toggle('paused', net.paused); }") === 1
        && count(netJs, "    if (btn) { btn.innerHTML = net.travelLocked ? '&#128275; Allow Travel Between Maps' : '&#128274; Lock Travel Between Maps'; btn.classList.toggle('paused', net.travelLocked); }") === 1
        && count(netHtml, '&#9208;&#65039; Pause the Table</button>\n                <div class="set-line">While the table is paused, ') === 1 && count(netHtml, '&#128274; Lock Travel Between Maps</button>\n                <div class="set-line">While travel is locked, ') === 1);
}

/* ---------- options that say what they do: the System editor's Combat card ---------- */
// The same passed mock-up, the third window. The System editor is boxes and rows. Each of its boxes has a note. Its rows are a table whose
// ticks still explain themselves in tooltips: how a table says what its ticks do is a question for the owner. The one group with no words in
// sight was the Combat card's first lists, on blasts, cover and roll outcomes. Six of them have one grey line. A line is made by `lineUnder`,
// as an element with text, under the list a box was just given, so each list is built by the very statement that built it before
{
    const sh = read('scripts/sheets.js');
    const LINES = [['sys-combat-auto', 'What happens when a blast is thrown.'], ['sys-combat-roller', 'Who makes a thrown blast’s rolls.'], ['sys-combat-hp', 'The pool that Full auto damage is taken from.'],
        ['sys-combat-cover-on', 'Cover is read from the map’s walls and cover pieces. It changes no roll.'], ['sys-combat-height-rule', 'This needs Token elevation on. A piece’s height is in its Properties.'],
        ['sys-combat-checks', 'How a check against a target reads its dice.']];
    const rA = sh.indexOf('function renderCombat() {'), rc = rA < 0 ? '' : sh.slice(rA, sh.indexOf('\n}\n', rA));
    // the statement that builds a list, with the tooltip it always had as its last word, and the line that follows it at once
    const found = [...rc.matchAll(/labeledSelect\('(sys-combat-[a-z-]+)',[^\n]*, '((?:[^'\\\n]|\\.)*)'\)\);[^\n]*\n    (?:if \(cm\.cover\.on\) )?lineUnder\(box, '([^'\n]+)'\);\n/g)].map(m => [m[1], m[3].replace(/\\u2019/g, '’'), m[2].length]);
    const rough = LINES.map(l => l[1]).filter(s => /[()\[\];—–&]| - /.test(s) || !/\.$/.test(s) || s.length > 230 || s.split(/\. /).some(p => p.length > 110));
    const lA = sh.indexOf('// [lookcheck:lineunder-start]'), lZ = sh.indexOf('// [lookcheck:lineunder-end]'), luSrc = lA >= 0 && lZ > lA ? sh.slice(lA, lZ) : '';
    const elS = (tag, cls, text) => ({ tag, cls, text, kids: [], lastChild: null, appendChild(k) { this.kids.push(k); this.lastChild = k; } });
    let LU = null, luErr = ''; try { LU = new Function('el', luSrc + '\nreturn lineUnder;')(elS); } catch (e) { luErr = String(e); }
    const lab = elS('label', 'sys-combat-item'), empty = { lastChild: null }, boxS = { lastChild: lab }, ran = [];
    try { LU(empty, 'Nothing yet.'); ran.push(empty.lastChild); LU(null, 'No box.'); LU(boxS, 'A line.'); ran.push(lab.kids.length, lab.kids[0] && [lab.kids[0].tag, lab.kids[0].cls, lab.kids[0].text], boxS.lastChild === lab); } catch (e) { luErr = luErr || String(e); }
    // the card's first lists built for real, by the card's own code up to its boxes, with cover off and with cover on: which list each line lands under
    const top = rc.slice(0, rc.indexOf('    rangeBox(box, cm);')), T = Object.fromEntries(LINES);
    const runTop = coverOn => { const kids = [], box = { textContent: 'x', lastChild: null, appendChild(k) { kids.push(k); this.lastChild = k; } };
        const lsel = cls => { const l = elS('label', 'sys-combat-item'); l.sel = cls; l.appendChild({ dataset: {} }); return l; };
        try { new Function('ui', 'draft', 'labeledSelect', 'lineUnder', top + '\n}\nrenderCombat();')(() => box, { fields: [], combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: '', cover: { on: coverOn, style: 'graded' } } }, lsel, LU); } catch (e) { return [String(e)]; }
        return kids.map(k => { const ls = k.kids.filter(x => x.cls === 'sys-line').map(x => x.text); return k.sel + (ls.length ? ':' + ls.join('|') : ''); }); };
    const withLine = c => c + ':' + T[c], OFF = ['sys-combat-auto', 'sys-combat-roller', 'sys-combat-hp', 'sys-combat-cover-on'].map(withLine).concat('sys-combat-cover-style', withLine('sys-combat-checks'));
    const ON = OFF.slice(0, 5).concat(withLine('sys-combat-height-rule'), 'sys-combat-cover-area', 'sys-combat-cover-area', 'sys-combat-cover-area', withLine('sys-combat-checks'));
    const topOff = runTop(false), topOn = runTop(true);
    check('the System editor\'s Combat card says what its first lists do (the same passed mock-up): Blast automation, Who rolls, Damage subtracts from, Cover from blockers, Height and cover and Roll outcomes each have one grey line, six lines and no other, each right after the statement that builds its list, and that statement still ends in the tooltip it had; each line is plain words, with no bracket, dash or semicolon, and ends in a full stop; the line is made by `lineUnder`, run for real: an element with text under the list a box was just given, the box itself left as it was, and nothing for a box that holds nothing or is not there; and the card\'s own code, run for real up to its boxes: with cover off five lists have their line, Cover grades has none and no line of Height and cover lands anywhere, and with cover on Height and cover has its own and the three lists of a blast behind cover have none',
        rc.length > 2000 && top.length > 2000 && J(topOff) === J(OFF) && J(topOn) === J(ON) && J(found.map(f => f.slice(0, 2))) === J(LINES) && found.every(f => f[2] >= 60) && count(sh, "lineUnder(box, '") === 6 && rough.length === 0
        && luSrc.length > 100 && !luErr && J(ran) === J([null, 1, ['small', 'sys-line', 'A line.'], true]) && !/innerHTML|insertAdjacentHTML|outerHTML/.test(luSrc)
        && count(sh, "function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }") === 1
        && count(sh, "function labeledSelect(cls, cap, options, value, title) { var l = el('label', 'sys-combat-item'); l.appendChild(el('span', 'sys-num-cap', cap)); l.appendChild(select(cls, options, value, title)); return l; }") === 1
        && count(sh, "function select(cls, options, value, title) { var s = el('select', cls); options.forEach(function(o) { s.appendChild(opt(o[0], o[1], o[0] === value)); }); if (title) s.title = title; return s; }") === 1,
        luErr || J([found.map(f => f[0] + ':' + f[2]), rough, ran, topOff.filter((x, i) => x !== OFF[i]).slice(0, 2), topOn.filter((x, i) => x !== ON[i]).slice(0, 2)]));
    check('the card\'s own rules in the style sheet: a line is small and grey, takes the width of its list and never widens it, and the lists of the card stand in their row by their tops, since a line makes some taller than others',
        css.includes('\n  .sys-combat-item { display: inline-flex; flex-direction: column; gap: 3px; }\n') && css.includes('\n  .sys-combat-item > .sys-line { width: 0; min-width: 100%; font-size: 10.5px; line-height: 1.4; color: var(--dim); }\n')
        && css.includes('\n  #sysCombatBox { align-items: flex-start; }') && css.indexOf('\n  #sysCombatBox { align-items: flex-start; }') > css.indexOf('\n  #sysCombatBox, #sysListRules { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-end;'));
}

/* ---------- the top row's map tabs (step R2 of the slim row) ---------- */
// The owner passed the mock-up of the row "as drawn": the map in front the lighter chip with its breadcrumb inside, the pinned maps and
// then the last ones opened, an eye and a number on a map players are on, a plus that opens quick-jump. maptabs.js is sliced by its
// markers and run for real on a page of plain objects that refuses markup.
{
    const mtSrc = read('scripts/maptabs.js'), mtSlice = sliceOf(mtSrc, 'maptabs'), sideSrc = read('scripts/sidebar.js');
    const PIN = 'M8.5 3.5h7M10 3.5v5l-3.2 4.5h10.4L14 8.5v-5M12 13v7.5', SVG1 = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">';
    const eyeM = /data-fbrush="reveal" title="[^"]+"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="([^"]+)"\/>/.exec(ix), EYE = eyeM ? eyeM[1] : '?';
    const BOX = '    <div id="mapTabs" role="group" aria-label="Maps">\n'
        + '      <div id="mapTabFront" hidden><span class="mt-mark" id="mapTabPin" hidden>' + SVG1 + '<path d="' + PIN + '"/></svg></span><div id="mapBreadcrumb"></div><span class="mt-name" id="mapTabName"></span><span class="mt-mark" id="mapTabHere" hidden>' + SVG1 + '<path d="' + EYE + '"/></svg><small id="mapTabHereN"></small></span></div>\n'
        + '      <div id="mapTabList"></div>\n'
        + '      <button class="tool ghost icon" id="mapTabAdd" title="Open another map. Quick-jump, Ctrl+K.">' + SVG1 + '<path d="M12 4.5v15M4.5 12h15"/></svg></button>\n'
        + '    </div>\n    <div id="tableWhereMap" class="table-where"></div>\n    <div class="spacer"></div>\n';
    check('the map tabs, as the page has them: one box in the top row, right after the Data Map and Play Map switch, that holds the tab in front, the list of the other tabs and the plus; the tab in front holds the breadcrumb the row always had, with its id, between a pin and an eye with a count that are both put away until they have something to say; the pin is the drawing the owner passed on the sheet of thirteen, the eye is the very drawing the fog\'s Reveal brush wears, and the plus says in its tooltip that it opens quick-jump; the module is loaded after the row\'s own',
        count(ix, BOX) === 1 && EYE.length > 40 && /<\/div>\n    <div id="mapTabs" role="group" aria-label="Maps">/.test(ix) && ix.indexOf('id="viewModeSelect"') < ix.indexOf('id="mapTabs"') && ix.indexOf('id="mapTabs"') < ix.indexOf('id="tableWhereMap"')
        && count(ix, '<script type="module" src="scripts/toprow.js"></script>\n<script type="module" src="scripts/maptabs.js"></script>\n') === 1);
    // a page of plain objects: elements made by name, text set as text, and no markup taken
    const mkDoc = () => { const made = [], ids = {};
        const N = tag => { const o = { tag, children: [], attrs: {}, hidden: false, textContent: '', title: '', className: '', type: '', appendChild(k) { this.children.push(k); return k; }, removeChild(k) { this.children.splice(this.children.indexOf(k), 1); return k; },
                setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; } };
            Object.defineProperty(o, 'firstChild', { get() { return this.children[0] || null; } }); Object.defineProperty(o, 'innerHTML', { set() { throw new Error('markup written'); } }); made.push(o); return o; };
        ['mapTabList', 'mapTabFront', 'mapTabName', 'mapTabPin', 'mapTabHere', 'mapTabHereN'].forEach(id => { ids[id] = N('div'); });
        return { made, ids, getElementById: id => ids[id] || null, createElement: N, createElementNS: (ns, t) => { const o = N(t); o.ns = ns; return o; } }; };
    const load = () => { try { return new Function(mtSlice + '\nreturn { tabsModel: tabsModel, tabTip: tabTip, tabBtn: tabBtn, tabsDraw: tabsDraw, tabsHere: tabsHere, tabsRecent: tabsRecent, tabMap: tabMap, PIN_D: PIN_D, EYE_D: EYE_D, TAB_PINS: TAB_PINS, TAB_RECENT: TAB_RECENT };')(); } catch (e) { return { err: String(e) }; } };
    const T = load(), map = t => ({ type: 'map', meta: { title: t } });
    let m1 = '', m2 = '', m3 = '', tips = '', drew = '', here = '', rec = '', err = T.err || '';
    if (!err) try {
        const items = { a: map('Realm'), b: map('  Hill Road  '), c: map('The Inn'), d: map(''), e: { type: 'map' }, p: { type: 'planner', meta: { title: 'Session 1' } }, f: map('Cellar'), 7: map('Seven') };   // a map whose id reads as the number a hostile list of pins holds
        const camp = { activeItemId: 'c', items, pinnedMaps: ['b', 'zz', 'p', 'b', 7, '__proto__', 'c'] };
        const who = id => (id === 'c' ? ['Mira', '', 3, 'Bren'] : id === 'f' ? 'Mira' : id === 'a' ? ['Mira'] : null);
        const mA = T.tabsModel(camp, ['c', 'a', 'b', 'nope', 'p', 'toString', 'd', 'e', 'f', 'a'], who);
        m1 = J([mA.front, mA.tabs]);
        camp.activeItemId = 'p'; const mB = T.tabsModel(camp, 'c', who); camp.activeItemId = 'zz'; const mC = T.tabsModel(camp, null, null);   // a page on screen: no tab in front. A list that is no list, no reader of who is where
        camp.pinnedMaps = 'b'; camp.activeItemId = 'a'; const mD = T.tabsModel(camp, ['a', 'b'], () => { return ['x']; });
        m2 = J([mB.front, mB.tabs.map(t => t.id + (t.pinned ? '*' : '')), mC.front, mC.tabs.map(t => t.id), mD.front.pinned, mD.tabs.map(t => t.id + (t.pinned ? '*' : '')), T.tabsModel(null, ['a'], null), T.tabsModel({ items: null }, ['a'], null)]);
        const many = {}, ids = []; for (let i = 0; i < 30; i++) { many['m' + i] = map('M' + i); ids.push('m' + i); }
        const mE = T.tabsModel({ activeItemId: 'm0', items: many, pinnedMaps: ids.slice(0, 12) }, ids.slice().reverse(), null);
        const proto = T.tabsModel({ activeItemId: '__proto__', items: Object.create({ inh: map('Inherited') }), pinnedMaps: ['inh'] }, ['inh', 'constructor'], null);
        m3 = J([mE.front.id, mE.tabs.map(t => t.id), T.TAB_PINS, T.TAB_RECENT, proto, T.tabMap(camp, 'p'), T.tabMap(camp, 7), !!T.tabMap(camp, 'a')]);
        const t = (title, pinned, n) => ({ id: 'x', title, pinned, who: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].slice(0, n) });
        tips = J([T.tabTip(t('Inn', false, 0), false), T.tabTip(t('Inn', true, 0), false), T.tabTip(t('Inn', false, 1), false), T.tabTip(t('Inn', true, 2), true), T.tabTip(t('Inn', false, 6), true), T.tabTip(t('Inn', false, 8), false)]);
        // drawn: a hostile name stays text, a tab is a button with its map's id, the pin and the eye are the two drawings, and nothing is made twice
        const doc = mkDoc(), HOST = '<img src=x onerror=1>&amp;"', model = { front: { id: 'f', title: HOST, pinned: true, who: ['Mira', 'Bren'] }, tabs: [{ id: 'b', title: HOST, pinned: true, who: [] }, { id: 'c', title: 'The Inn', pinned: false, who: ['Mira'] }, { id: 'd', title: 'Plain', pinned: false, who: [] }] };
        const shape = n => n.tag + (n.attrs.class ? '.' + n.attrs.class.split(' ').join('.') : n.className ? '.' + n.className : '') + (n.attrs.d ? '[' + (n.attrs.d === PIN ? 'pin' : n.attrs.d === EYE ? 'eye' : '?') + ']' : '') + (n.textContent ? '"' + n.textContent + '"' : '') + (n.children.length ? '(' + n.children.map(shape).join(',') + ')' : '');
        const ok1 = T.tabsDraw(doc, model, false), g = doc.ids, n1 = doc.made.length, list1 = g.mapTabList.children.slice();
        const a = [ok1, g.mapTabFront.hidden, g.mapTabName.textContent === HOST, g.mapTabName.hidden, g.mapTabPin.hidden, g.mapTabHere.hidden, g.mapTabHereN.textContent, g.mapTabFront.title, g.mapTabList.children.map(shape), g.mapTabList.children.map(b => [b.attrs['data-id'], b.type, b.title])];
        T.tabsDraw(doc, model, true); const b = [doc.made.length === n1, g.mapTabList.children.every((k, i) => k === list1[i]), g.mapTabName.hidden];   // drawn again: nothing made, and with the breadcrumb up the name is the breadcrumb's to say
        model.tabs[1].who = []; model.front = { id: 'f', title: 'Cellar', pinned: false, who: [] }; T.tabsDraw(doc, model, false);
        const c = [doc.made.length > n1, g.mapTabList.children.length, g.mapTabList.children[1] !== list1[1], shape(g.mapTabList.children[1]), g.mapTabName.textContent, g.mapTabPin.hidden, g.mapTabHere.hidden, g.mapTabHereN.textContent, g.mapTabFront.title];
        model.front = null; model.tabs = []; T.tabsDraw(doc, model, false); const d = [g.mapTabFront.hidden, g.mapTabList.children.length, g.mapTabName.textContent];   // a page on screen: the tab in front is put away, as it stood
        const drawn = doc.made.filter(n => n.tag === 'svg' || n.tag === 'path'), svgNs = drawn.length >= 6 && drawn.every(n => n.ns === 'http://www.w3.org/2000/svg' && (n.tag !== 'svg' || (n.attrs.viewBox === '0 0 24 24' && n.attrs['aria-hidden'] === 'true')));
        const bare = { getElementById: () => null }; drew = J([a, b, c, d, svgNs, T.tabsDraw(bare, model, false)]);
        // who is on a map: the host's roster, the connected alone, and nobody on a player's app or at someone else's table
        const ps = [{ name: 'Mira', connected: true }, { name: 'Gone', connected: false }, null, { name: 7, connected: true }, { name: 'Bren', connected: 'yes' }, { name: 'Tam', connected: true }], asked = [];
        const net = { active: true, role: 'host', playersOnMap: id => { asked.push(id); return ps; } };
        here = J([T.tabsHere(net, 'a'), asked, T.tabsHere({ active: true, role: 'client', playersOnMap: () => ps }, 'a'), T.tabsHere({ foreign: true, playersOnMap: () => ps }, 'a'), T.tabsHere({ playersOnMap: () => 'x' }, 'a'), T.tabsHere({}, 'a'), T.tabsHere(null, 'a'),
            T.tabsHere({ active: false, role: 'client', playersOnMap: () => ps }, 'a').length]);
        const store = v => ({ getItem: k => { store.k = k; if (v === 'throw') throw new Error('no store'); return v; } });
        rec = J([T.tabsRecent(store('["a","b"]'), { id: 'c1' }), store.k, T.tabsRecent(store(null), { id: 'c1' }), T.tabsRecent(store('{"a":1}'), { id: 'c1' }), T.tabsRecent(store('not json'), { id: 'c1' }), T.tabsRecent(store('throw'), { id: 'c1' }), T.tabsRecent(store('"a"'), { id: 'c1' })]);
    } catch (e) { err = String(e && e.stack || e); }
    const tab = (id, title, pinned, who) => ({ id, title, pinned, who });
    check('the tabs of a campaign (tabsModel, run for real): the map on screen is the tab in front, and there is none while a page is on screen; then the pinned maps in their order and the last maps opened, a map never twice, each with whether it is pinned and the names of the players on it; a pinned id that is no map, a page, a number, a name the list only inherits and one named twice count for nothing; a name is trimmed and a map with none is Untitled; at most eight pinned and five of the last opened; a campaign that is none, pins that are no list and a list of recents that is none give no tab and no error',
        !err && m1 === J([tab('c', 'The Inn', true, ['Mira', 'Bren']), [tab('b', 'Hill Road', true, []), tab('a', 'Realm', false, ['Mira']), tab('d', 'Untitled', false, []), tab('e', 'Untitled', false, []), tab('f', 'Cellar', false, [])]])
        && m2 === J([null, ['b*', 'c*'], null, ['b', 'c'], false, ['b'], { front: null, tabs: [] }, { front: null, tabs: [] }])
        && m3 === J(['m0', ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm29', 'm28', 'm27', 'm26', 'm25'], 8, 5, { front: null, tabs: [] }, null, null, true]), err || m1 + ' ' + m2 + ' ' + m3);
    check('what a tab says when it is pointed at (tabTip): where a press goes, that the map is pinned, and who is there by name, one player or several, six names at most and then how many more; the tab in front says its map and not Go to',
        !err && tips === J(['Go to Inn.', 'Go to Inn. Pinned.', 'Go to Inn. 1 player is here: A.', 'Inn. Pinned. 2 players are here: A, B.', 'Inn. 6 players are here: A, B, C, D, E, F.', 'Go to Inn. 8 players are here: A, B, C, D, E, F and 2 more.']), err || tips);
    const HOSTILE = '<img src=x onerror=1>&amp;"';
    check('the tabs drawn (tabsDraw and tabBtn, on a page that refuses markup): a tab is a button that carries its map\'s id, with a pin where the map is pinned, its name as text and an eye with a count where players are on it, each drawing a path made by name; a hostile name is text on a tab and on the tab in front; the tab in front shows its pin and its count only while it has them, and leaves its name to the breadcrumb while that is up; drawn again with nothing changed it makes nothing, so a tab keeps the focus it has; a tab that changed is made again; with a page on screen the tab in front is put away; a page without the tabs\' boxes draws nothing',
        !err && drew === J([[true, false, true, false, false, false, '2', HOSTILE + '. Pinned. 2 players are here: Mira, Bren.',
            ['button.map-tab(svg.ico.mt-pin(path[pin]),span.mt-name"' + HOSTILE + '")', 'button.map-tab(span.mt-name"The Inn",svg.ico.mt-eye(path[eye]),small"1")', 'button.map-tab(span.mt-name"Plain")'],
            [['b', 'button', 'Go to ' + HOSTILE + '. Pinned.'], ['c', 'button', 'Go to The Inn. 1 player is here: Mira.'], ['d', 'button', 'Go to Plain.']]],
            [true, true, true], [true, 3, true, 'button.map-tab(span.mt-name"The Inn")', 'Cellar', true, true, '', 'Cellar.'], [true, 0, 'Cellar'], true, false]), err || drew);
    check('who is on a map and which maps were last opened (tabsHere, tabsRecent): the names of the connected players on the host\'s own roster, asked for that map, a name that is no text an empty one, and nobody on a player\'s app, at someone else\'s table or where there is no roster to ask; the last maps opened are read from this computer\'s list under the campaign\'s own key, and a list that is no list, is not there, cannot be read or throws is no list',
        !err && here === J([['Mira', '', 'Tam'], ['a'], [], [], [], [], [], 3]) && rec === J([['a', 'b'], 'wp_recent_c1', [], [], [], [], []]), err || here + ' ' + rec);
    check('the tabs\' wiring and their place in the row: a press on a tab goes to its map only while the campaign holds that map, the plus opens quick-jump, the list is fitted again when the window changes, and the module writes no markup; the board\'s redraw and the left panel\'s redraw each tell the tabs once; the box is the row\'s spring, 180 wide at least until the row folds five icons into More and then down to the plus alone, the list gives way before the tab in front and fades out where it is cut, a mark that is put away is not drawn, and a player\'s app has no tabs',
        mtSlice.length > 2000 && !/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(mtSrc)
        && mtSrc.includes("    if (list) list.addEventListener('click', function(e) { var b = e.target && e.target.closest ? e.target.closest('.map-tab') : null, id = b ? b.getAttribute('data-id') : null; if (id && tabMap(getActiveCampaign(), id)) navigateToMap(id); });")
        && mtSrc.includes("    if (add) add.addEventListener('click', function() { if (window.wpCmdkOpen) window.wpCmdkOpen(); });") && mtSrc.includes("    window.addEventListener('resize', tabsClip);") && /\nwindow\.wpMapTabs = \{ sync: tabsSync \};\n$/.test(mtSrc)
        && mtSrc.includes("    var model = tabsModel(camp, tabsRecent(localStorage, camp), function(id) { return tabsHere(window.wpNet, id); });\n    tabsDraw(document, model, !!bc && bc.style.display === 'flex'); tabsClip();")
        && count(mainSrc, 'if (window.wpMapTabs) window.wpMapTabs.sync();') === 1 && count(sideSrc, 'if (window.wpMapTabs) window.wpMapTabs.sync();') === 1
        && mainSrc.indexOf("var bc = document.getElementById('mapBreadcrumb');") < mainSrc.indexOf('if (window.wpMapTabs) window.wpMapTabs.sync();') && sideSrc.indexOf('mNav.innerHTML = mapQuickHtml(camp)') < sideSrc.indexOf('if (window.wpMapTabs) window.wpMapTabs.sync();')
        && css.includes('\n  #mapTabs { display: flex; align-items: center; gap: 2px; flex: 1 1 0; min-width: 180px; }') && css.includes('\n  body.row-narrow #mapTabs { min-width: 30px; }') && css.includes('\n  #mapTabs [hidden] { display: none !important; }\n')
        && css.includes('\n  body:not(.net-client) #tableWhereMap + .spacer { display: none; }') && css.includes('\n  #mapTabList { display: flex; align-items: center; gap: 2px; flex: 0 1000 auto; min-width: 0; overflow: hidden; }')
        && css.includes('\n  #mapTabList.clip { -webkit-mask-image: linear-gradient(90deg, #000 calc(100% - 26px), transparent); mask-image: linear-gradient(90deg, #000 calc(100% - 26px), transparent); }\n')
        && css.includes('\n  #mapTabFront { background: var(--panel2); color: var(--ink); flex: 0 1 auto; min-width: 0; overflow: hidden; }\n') && css.includes('\n  body.net-client #mapTabs { display: none !important; }'));
    const helpTabs = ix.slice(ix.indexOf('<li><b>Map tabs:</b>'), ix.indexOf('<li><b>Pills:</b>'));
    check('the map tabs, said: Help\'s part on the top row has an entry on them, between Campaigns and More, that says what the lighter tab is and that its parent maps stand inside it, that the pinned maps come next and how a map is pinned, that the last maps opened follow, what the eye and the number mean, what the plus opens, and that players have none; both release notes say it in the same words',
        helpTabs.length > 500 && helpTabs.length < 1400 && helpTabs.indexOf('<li><b>Map tabs:</b> the top row shows the map in front and the maps you go back to. Press a tab to go to that map.\n') === 0
        && ['<li>The lighter tab is the map on screen. Its parent maps stand inside it, each one press away.</li>', '<li>Your pinned maps come next, each with a pin. Pin a map from the play map&rsquo;s right-click menu.</li>', '<li>The last maps you opened follow them.</li>',
            '<li>An eye and a number mark a map your players are on. Point at the tab for their names.</li>', '<li>The plus opens quick-jump, as <kbd>Ctrl</kbd>+<kbd>K</kbd> does.</li>', '<li>Players have no tabs. Their row names the map they are on.</li>'].every(s => count(helpTabs, s) === 1)
        && [rootRead('WHATSNEW.txt'), read('assets/whatsnew.txt')].every(t => count(t, "- The top row has map tabs. The map on screen stands first, with its\n  parent maps inside the tab. Your pinned maps and the last maps you\n  opened follow. An eye and a number mark a map your players are on,\n  and the plus opens quick-jump.\n") === 1));
}

/* ---------- the top row's state pills (step R3 of the slim row) ---------- */
// The passed mock-up: "A pill shows only while it has something to say. Outlined means on. Filled means it wants you." pills.js is sliced
// by its markers and run for real on pages of plain objects.
{
    const pSrc = read('scripts/pills.js'), pSlice = sliceOf(pSrc, 'pills'), SVG1 = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">';
    const dOf = re => { const m = re.exec(ix); return m ? m[1] : '?'; };
    const FOG = dOf(/id="fogModeBtn"[^>]*><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="([^"]+)"\/>/), EYE = dOf(/data-fbrush="reveal" title="[^"]+"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="([^"]+)"\/>/);
    const PAUSE = 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z', DIE = 'M5 5h14v14H5zM9 9h.01M15 9h.01M12 12h.01M9 15h.01M15 15h.01';
    const pl = (id, cls, tip, ico, txt) => '      <button class="pill' + cls + '" id="' + id + '" hidden title="' + tip + '">' + ico + '<span class="pill-txt">' + txt + '</span></button>\n';
    const BOX = '<span class="vchip-txt clock-txt"></span></button>\n    <div id="rowPills" role="group" aria-label="What is going on">\n'
        + pl('fogPill', '', 'Fog on this map. Opens the fog options.', SVG1 + '<path d="' + FOG + '"/></svg>', '') + pl('tablePill', '', 'You are hosting. Opens Multiplayer.', '<span class="pill-dot" aria-hidden="true"></span>', '')
        + pl('pausedPill', ' hot', 'The table is paused. Press to resume it.', SVG1 + '<path d="' + PAUSE + '"/></svg>', 'Paused') + pl('roundPill', ' on', 'A fight is on this map. Opens the turn order.', SVG1 + '<path d="' + DIE + '"/></svg>', '')
        + pl('viewPill', ' on', 'The fog is drawn as a player sees it. Press to end the preview.', SVG1 + '<path d="' + EYE + '"/></svg>', '') + '    </div>\n    <div class="header-group">\n';
    check('the pills, as the page has them: one box in the top row, after the clock and a player\'s video and before the row\'s buttons, that holds five pills, each a button put away in the page: Fog, which wears the very drawing of the toolbar\'s fog button, Table with a green dot, Paused, filled, with two upright bars, Round, outlined, with a die showing five, and Viewing as, outlined, with the eye the fog\'s Reveal brush wears; the bars and the die are the drawings the owner passed on the sheet of thirteen; each says in its tooltip what a press does, and none holds a word that a script has yet to give it but Paused; the module is loaded after the map tabs\'',
        count(ix, BOX) === 1 && FOG.length > 40 && EYE.length > 40 && FOG !== EYE && count(ix, '<script type="module" src="scripts/maptabs.js"></script>\n<script type="module" src="scripts/pills.js"></script>\n') === 1 && count(ix, '<button class="pill') === 5);
    const load = () => { try { return new Function(pSlice + '\nreturn { PILLS: PILLS, pillCut: pillCut, pillCount: pillCount, pillsModel: pillsModel, pillsDraw: pillsDraw, pillsState: pillsState, pillPress: pillPress };')(); } catch (e) { return { err: String(e) }; } };
    const T = load(); let err = T.err || '', mod = '', cut = '', drew = '', stt = '', prs = '';
    const NONE = { fogPill: null, tablePill: null, pausedPill: null, roundPill: null, viewPill: null };
    if (!err) try {
        const M = st => { const m = T.pillsModel(st); return Object.keys(m).filter(k => m[k]).map(k => k + ':' + m[k].text + (m[k].on === true ? '+' : m[k].on === false ? '-' : '') + '|' + m[k].tip); };
        const full = { gm: true, play: true, fog: 'on', hosting: true, players: 3, paused: true, round: 2, turn: ' Bren ', preview: 'u_1', previewName: 'Mira' };
        const but = o => Object.assign({}, full, o);
        mod = J([M(full), J(T.pillsModel(but({ gm: false }))) === J(NONE), J(T.pillsModel(but({ gm: 1 }))) === J(NONE), J(T.pillsModel(null)) === J(NONE), J(T.pillsModel({})) === J(NONE),
            M(but({ play: false })).map(s => s.split(':')[0]), M(but({ hosting: false })).map(s => s.split(':')[0]), M(but({ fog: 'off', paused: false, round: 0, preview: 'off' })), M(but({ fog: undefined, players: 1, paused: 'yes', round: '2', preview: '' })),
            M(but({ fog: true, players: 0, paused: false, round: 3.9, turn: '', preview: 'party' })), M(but({ fog: 'on', players: -4, round: NaN, preview: 'u_9', previewName: 7 })).slice(1), M(but({ players: 123456, round: Infinity, preview: null })).slice(1, 2),
            M(but({ play: 1, hosting: 1 })).length, Object.keys(T.pillsModel(full)), J(T.PILLS), M(but({ turn: 'B'.repeat(40), preview: 7 })).slice(3)]);   // a long name on turn is cut, and a preview that is no text is none
        const long = 'A'.repeat(23) + 'BCD', astral = '😀'.repeat(30);
        cut = J([T.pillCut('  Bren  '), T.pillCut(long), T.pillCut(long.slice(0, 24)), Array.from(T.pillCut(astral)).length, T.pillCut(astral).slice(-1), T.pillCut(7), T.pillCut(null), T.pillCut(''), T.pillCount(2.9), T.pillCount(0), T.pillCount(-1), T.pillCount('3'), T.pillCount(NaN), T.pillCount(1e9), T.pillCut('A'.repeat(25)), T.pillCount(Infinity)]);
        // drawn: put away or shown, the words as text, the tooltip, Fog's gold edge only while fog is on, and nothing written that did not change
        const mkPill = id => { const txt = { n: 0 }; let t = id === 'pausedPill' ? 'Paused' : ''; Object.defineProperty(txt, 'textContent', { get: () => t, set: v => { t = String(v); txt.n++; } });
            const cls = new Set(id === 'pausedPill' ? ['pill', 'hot'] : id === 'fogPill' ? ['pill'] : ['pill', 'on']), el = { id, hidden: true, title: '', txt, cls, classList: { toggle: (c, v) => { if (v) cls.add(c); else cls.delete(c); }, contains: c => cls.has(c) }, querySelector: s => (s === '.pill-txt' ? txt : null) };
            Object.defineProperty(el, 'innerHTML', { set() { throw new Error('markup written'); } }); return el; };
        const els = {}; T.PILLS.forEach(id => { if (id !== 'roundPill') els[id] = mkPill(id); });   // a page that lacks one pill draws the others
        const doc = { getElementById: id => els[id] || null }, see = () => Object.keys(els).map(id => (els[id].hidden ? '' : els[id].txt.textContent + '|' + els[id].title + '|' + [...els[id].cls].join('.')));
        const HOST = '<img src=x onerror=1>', m1 = T.pillsModel(but({ turn: HOST, previewName: HOST }));
        const n1 = T.pillsDraw(doc, m1), s1 = see(), w1 = Object.keys(els).map(id => els[id].txt.n); const n2 = T.pillsDraw(doc, m1), w2 = Object.keys(els).map(id => els[id].txt.n);
        const n3 = T.pillsDraw(doc, T.pillsModel(but({ fog: 'off', paused: false, preview: 'off' }))), s3 = see(); const n4 = T.pillsDraw(doc, T.pillsModel(but({ gm: false }))), s4 = see(), n5 = T.pillsDraw(doc, null);
        drew = J([n1, s1, w1, n2, J(w2) === J(w1), n3, s3, n4, s4, n5, T.pillsDraw({ getElementById: () => null }, m1)]);
        // the state, read from what the other modules hold
        const btn = on => ({ classList: { contains: c => c === 'fog-on' && on } }), map = { type: 'map', id: 'm1' }, ros = { a: { id: 'u_1', name: 'Mira' }, b: { id: 'u_2', name: 'Bren' }, c: null, d: { name: 'no id' } };
        const hostW = { wpNet: { active: true, role: 'host', roster: ros, paused: true, combats: { m1: { round: 4, turn: 1, rows: [{ name: 'Orc' }, { name: 'Bren' }] } } }, wpFog: { preview: () => 'u_2' }, wpVtt: { on: f => f === 'fog' } };
        const S = (w, am, view, b) => { const s = T.pillsState(w, am, view, b); return [s.gm, s.play, s.fog || '', s.hosting, s.players, s.paused, s.round || 0, s.turn || '', s.preview, s.previewName || ''].join(','); };
        const inh = Object.create({ m1: { round: 9, turn: 0, rows: [{ name: 'Inherited' }] } });
        stt = J([S(hostW, map, 'visual', btn(true)), S(hostW, map, 'data', btn(false)), S(hostW, { type: 'planner', id: 'p1' }, 'visual', btn(true)), S(hostW, null, 'visual', null),
            S({ wpNet: { active: true, role: 'client', roster: ros, paused: true, combats: hostW.wpNet.combats } }, map, 'visual', btn(true)), S({ wpNet: { foreign: true } }, map, 'visual', btn(true)), S({}, map, 'visual', btn(true)),
            S({ wpNet: { active: false, role: 'host', roster: ros, paused: true, combats: hostW.wpNet.combats }, wpVtt: { on: () => false }, wpFog: { preview: () => 'party' } }, map, 'visual', btn(true)),
            S({ wpNet: { active: true, role: 'host', roster: ros, combats: inh }, wpFog: { preview: () => 'u_9' }, wpVtt: { on: () => true } }, map, 'visual', btn(false)),
            S({ wpNet: { active: true, role: 'host', combats: { m1: { round: 2, turn: 5, rows: [{ name: 'Orc' }] }, }, paused: 1 }, wpFog: {} }, map, 'visual', btn(true)),
            S({ wpNet: { active: true, role: 'host', combats: { m1: { round: 2, turn: 0, rows: 'x' } } } }, map, 'visual', btn(true))]);
        // a press: the control that owns the thing is pressed, once, and nothing where it is not there
        const mkW = () => { const log = [], sel = { value: 'u_1' }, fm = { on: false, classList: { contains: c => c === 'show' && fm.on } };
            const d = { getElementById: id => (id === 'fogPreview' ? sel : id === 'fogMenu' ? fm : id === 'gone' ? null : { click: () => { log.push('click ' + id); } }) };
            const w = { wpNet: { paused: true }, wpOpenCombat: (id, o) => { log.push('combat ' + id + ' ' + J(o)); }, wpFog: { setPreview: p => { log.push('preview ' + p); } } }; return { log, sel, fm, d, w }; };
        const A = mkW(), am = { id: 'm1' }, r = T.PILLS.concat(['other', '__proto__']).map(id => T.pillPress(id, A.d, A.w, am));
        A.fm.on = true; const r2 = T.pillPress('fogPill', A.d, A.w, am); A.w.wpNet.paused = false; const r3 = T.pillPress('pausedPill', A.d, A.w, am), n = A.log.length;
        const B = mkW(), bare = { getElementById: () => null }, r4 = [T.pillPress('fogPill', bare, {}, am), T.pillPress('tablePill', bare, {}, am), T.pillPress('pausedPill', bare, {}, am), T.pillPress('pausedPill', bare, { wpNet: { paused: true } }, am), T.pillPress('roundPill', B.d, B.w, null), T.pillPress('roundPill', B.d, {}, am), T.pillPress('viewPill', B.d, {}, am), T.pillPress('viewPill', bare, B.w, am)];
        prs = J([r, A.log, A.sel.value, r2, r3, A.log.length === n, r4, B.log]);
    } catch (e) { err = String(e && e.stack || e); }
    const FULL = ['fogPill:Fog on+|Fog is on for this map. Opens the fog options.', 'tablePill:Table · 3|You are hosting. 3 players are connected. Opens Multiplayer.', 'pausedPill:Paused|The table is paused. Press to resume it.',
        'roundPill:Round 2 · Bren|A fight is on this map, and it is the turn of Bren. Opens the turn order.', 'viewPill:Viewing as Mira|The fog is drawn as Mira sees it. Press to end the preview.'];
    check('what the pills say (pillsModel, run for real): Fog on or Fog off on the play map where the fog\'s state is known, Table and the number of connected players while hosting, Paused while a hosted table is paused, the round and whose turn it is while a fight is on the map on screen, and Viewing as the party or as a player by name while the fog is previewed on the play map; each with its tooltip, one player said as one and none as No; nothing at all on a screen that is not the GM\'s, and only true counts as the GM\'s, the play map, hosting and paused; a pill with nothing to say is none: a fog state that is no word, a round that is no number above 0, a preview that is off or empty; a number is whole and bounded, a name that is no text is a player',
        !err && mod === J([FULL, true, true, true, true, ['tablePill', 'pausedPill', 'roundPill'], ['fogPill', 'viewPill'],
            ['fogPill:Fog off-|Fog is off for this map. Opens the fog options.', FULL[1]], ['tablePill:Table · 1|You are hosting. 1 player is connected. Opens Multiplayer.'],
            ['tablePill:Table · 0|You are hosting. No players are connected. Opens Multiplayer.', 'roundPill:Round 3|A fight is on this map. Opens the turn order.', 'viewPill:Viewing as the party|The fog is drawn as the party sees it. Press to end the preview.'],
            ['tablePill:Table · 0|You are hosting. No players are connected. Opens Multiplayer.', 'pausedPill:Paused|The table is paused. Press to resume it.', 'viewPill:Viewing as a player|The fog is drawn as a player sees it. Press to end the preview.'],
            ['tablePill:Table · 9999|You are hosting. 9999 players are connected. Opens Multiplayer.'], 0, ['fogPill', 'tablePill', 'pausedPill', 'roundPill', 'viewPill'], J(['fogPill', 'tablePill', 'pausedPill', 'roundPill', 'viewPill']), ['roundPill:Round 2 · ' + 'B'.repeat(23) + '…|A fight is on this map, and it is the turn of ' + 'B'.repeat(23) + '…. Opens the turn order.']]), err || mod);
    check('a name on a pill is cut (pillCut) and a number is read (pillCount): a name is trimmed, kept whole up to 24 characters and cut to 23 and an ellipsis past that, by whole characters and never through the middle of one, and what is no text is no name; a number is whole, above 0 and at most 9999, and anything else is 0',
        !err && cut === J(['Bren', 'A'.repeat(23) + '…', 'A'.repeat(23) + 'B', 24, '…', '', '', '', 2, 0, 0, 0, 0, 9999, 'A'.repeat(23) + '…', 0]), err || cut);
    const HOSTP = '<img src=x onerror=1>';
    check('the pills drawn (pillsDraw, on a page that refuses markup): a pill is shown with its words as text and its tooltip, or put away; a hostile name is text on the pill and in its tooltip; Fog\'s edge is gold only while fog is on, and Paused stays filled; drawn again with nothing changed, no word is written again; a pill that has nothing more to say is put away with its words left as they were; on a player\'s screen every pill is put away; a page that lacks a pill draws the others, and one that has none draws nothing',
        !err && drew === J([4, ['Fog on|Fog is on for this map. Opens the fog options.|pill.on', 'Table · 3|You are hosting. 3 players are connected. Opens Multiplayer.|pill.on', 'Paused|The table is paused. Press to resume it.|pill.hot', 'Viewing as ' + HOSTP + '|The fog is drawn as ' + HOSTP + ' sees it. Press to end the preview.|pill.on'],
            [1, 1, 0, 1], 4, true, 2, ['Fog off|Fog is off for this map. Opens the fog options.|pill', 'Table · 3|You are hosting. 3 players are connected. Opens Multiplayer.|pill.on', '', ''], 0, ['', '', '', ''], 0, 0]), err || drew);
    check('the state the pills read (pillsState, run for real): the GM\'s own screen and never a player\'s app or someone else\'s table; the play map only while a map is on screen in the play view; the fog\'s state from the toolbar\'s own fog button, and none while the Fog of war feature is off; hosting only while a table is open and this app hosts it, with the players on its roster that have an id, the pause only as true, the fight of the map on screen by the map\'s own id and never one the list only inherits, the row on turn\'s name or none; the preview as the fog module says it, with the player\'s name from the roster',
        !err && stt === J(['true,true,on,true,2,true,4,Bren,u_2,Bren', 'true,false,off,true,2,true,4,Bren,u_2,Bren', 'true,false,on,true,2,true,0,,u_2,Bren', 'true,false,,true,2,true,0,,u_2,Bren', 'false,true,,false,0,false,0,,off,', 'false,true,,false,0,false,0,,off,', 'true,true,,false,0,false,0,,off,',
            'true,true,,false,0,false,0,,party,', 'true,true,off,true,2,false,0,,u_9,', 'true,true,,true,0,false,2,,off,', 'true,true,,true,0,false,0,,off,']), err || stt);
    check('what a press on a pill does (pillPress, run for real): Fog presses the toolbar\'s fog button, and presses nothing while the fog options are already up, so it opens them and never closes them; Table presses the Multiplayer button; Paused presses the pause button only while the table is paused, never a press that would pause a table that runs; Round opens the turn order of the map on screen; Viewing as ends the preview through the fog module and sets the fog menu\'s own list to Off; an id that is no pill does nothing, and neither does a pill whose control or module is not there',
        !err && prs === J([['fogModeBtn', 'netBtn', 'sessionPauseBtn', 'combat', 'preview', '', ''], ['click fogModeBtn', 'click netBtn', 'click sessionPauseBtn', 'combat m1 {}', 'preview off'], 'off', 'open', '', true, ['', '', '', '', '', '', '', 'preview'], ['preview off']]), err || prs);
    // ---- the two chips that were in the row before the pills: a player's video and Review, in their passed drawings and the pills' look ----
    const FILM = dOf(/id="videoBtn"[^>]*><span class="mr-ico"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="([^"]+)"\/>/), REVIEW = 'M8.5 5H6v15.5h12V5h-2.5M9 3.5h6v3H9zM9 13.5l2.2 2.2 3.8-4.2';
    check('a player\'s video chip and Review wear their passed drawings and read as pills: the chip wears the very film the Video row under Scene wears and Review the clipboard with a tick the owner passed on the sheet of thirteen, each with the id, the tooltip and the words it had, and neither holds a picture glyph any more; the chip is filled while its panel is closed, since that is when it wants you, and only outlined while the panel is open; Review and Update are as high and as round as a pill; Help names the chip with the film and says it is in the top row',
        FILM.length > 40 && count(ix, '    <button class="tool ghost hdr-clock hdr-video" id="videoChip" style="display:none;" aria-pressed="false" title="Your GM is showing a video: open or close it here">' + SVG1 + '<path d="' + FILM + '"/></svg><span class="vchip-txt clock-txt"></span></button>\n') === 1
        && count(ix, '      <button class="tool" id="reviewChip" style="display:none;" title="A player sent a sheet update: review what changes">' + SVG1 + '<path d="' + REVIEW + '"/></svg> Review <span id="reviewChipN"></span></button>\n') === 1
        && css.includes('\n  header .hdr-clock, header #reviewChip, header #updateBtn { height: 22px; padding: 0 9px; border-radius: 11px; font-size: 11.5px; }') && css.includes('\n  .hdr-clock.hdr-video:not(.active) { background: var(--gold); border-color: var(--gold); color: #1a1408; font-weight: 600; }')
        && css.includes('\n  .hdr-video.active { border-color: var(--gold); }') && css.includes('\n  .hdr-clock.hdr-video { max-width: 170px; }')
        && count(ix, 'Closing it silences it, and a <b>' + SVG1 + '<path d="' + FILM + '"/></svg></b> chip in the top row reopens it while it plays.') === 1);
    const HOOK = 'window.wpPills) window.wpPills.sync();', fogS = read('scripts/fog.js'), netS = read('scripts/net.js'), sideS = read('scripts/sidebar.js');
    check('the pills\' wiring and their look: one listener on the box, for a press on a pill of the list, which acts once the press is over, since a menu that closes at a press elsewhere would close the one just opened, and draws the pills again; the module writes no markup and holds no character outside ASCII; the five places that know when a pill\'s words may change each tell the pills once: the board\'s redraw, the left panel\'s redraw, the fog button\'s sync after it has set the button, the pause buttons\' sync and the turn strip\'s redraw; a pill is 22 high and round, outlined in gold while on and filled in gold while it wants you, a pill that is put away is not drawn, and a player\'s app has none',
        pSlice.length > 2500 && !/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(pSrc) && !/[^\x00-\x7f]/.test(pSrc)
        && pSrc.includes("    if (box) box.addEventListener('click', function(e) {\n        var b = e.target && e.target.closest ? e.target.closest('.pill') : null; if (!b || PILLS.indexOf(b.id) < 0) return;\n        var id = b.id; setTimeout(function() { pillPress(id, document, window, getActiveMap()); pillsSync(); }, 0);")
        && pSrc.includes("function pillsSync() { return pillsDraw(document, pillsModel(pillsState(window, getActiveMap(), state.viewMode, document.getElementById('fogModeBtn')))); }") && /\nwindow\.wpPills = \{ sync: pillsSync \};\n$/.test(pSrc)
        && [mainSrc, sideS, fogS, netS, wbSrc].every(s => count(s, HOOK) === 1) && fogS.indexOf("if (b.classList.contains('fog-on') !== on) b.classList.toggle('fog-on', on);") < fogS.indexOf(HOOK) && fogS.indexOf(HOOK) < fogS.indexOf('// [fogcheck:fogbtn-end]')
        && netS.indexOf("sb.classList.toggle('paused', net.paused); }") < netS.indexOf(HOOK) && netS.indexOf(HOOK) - netS.indexOf("sb.classList.toggle('paused', net.paused); }") < 120
        && wbSrc.includes("function renderCombatStrip() {\n    if (typeof window !== 'undefined' && " + HOOK)
        && css.includes('\n  #rowPills { display: flex; align-items: center; gap: 5px; flex: none; }\n') && css.includes('\n  .pill { height: 22px; box-sizing: border-box; padding: 0 9px; border-radius: 11px; border: 1px solid var(--edge); display: inline-flex;')
        && css.includes('\n  .pill[hidden] { display: none; }\n') && css.includes('\n  .pill.on { border-color: var(--gold); color: var(--gold); }\n') && css.includes('\n  .pill.hot { background: var(--gold); border-color: var(--gold); color: #1a1408; font-weight: 600; }\n')
        && css.includes('\n  .pill-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); flex: none; }\n') && css.includes('\n  body.net-client #rowPills { display: none !important; }'));
    const helpPills = ix.slice(ix.indexOf('<li><b>Pills:</b>'), ix.indexOf('<li><b>The left panel:</b>'));
    check('the pills, said: Help\'s part on the top row has an entry on them, between the map tabs and More, that says a pill shows only while it has something to say and that a press opens its thing, and then what each of the five says and what its press does, and that the pills are the GM\'s; both release notes say it in the same words',
        helpPills.length > 600 && helpPills.length < 1500 && helpPills.indexOf('<li><b>Pills:</b> small pills in the top row say what is going on. A pill shows only while it has something to say, and a press opens its thing.\n') === 0
        && ['<li><b>Fog on</b> or <b>Fog off</b> says this map&rsquo;s fog on the play map. It opens the fog options.</li>', '<li><b>Table</b> and a number show while you host, with how many players are connected. It opens Multiplayer.</li>', '<li><b>Paused</b> is filled while the table is paused. Press it to resume.</li>',
            '<li><b>Round</b> and a name say the fight on this map and whose turn it is. It opens the turn order.</li>', '<li><b>Viewing as</b> shows while the fog is drawn as a player sees it. Press it to end the preview.</li>', '<li>The pills are the GM&rsquo;s. The clock, Review and Update stand beside them as before.</li>'].every(s => count(helpPills, s) === 1)
        && [rootRead('WHATSNEW.txt'), read('assets/whatsnew.txt')].every(t => count(t, "- The top row has pills that say what is going on: this map's fog, the\n  table and its players, a pause, the round and whose turn it is, and\n  a fog preview. A pill shows only while it has something to say, and\n  a press opens its thing.\n") === 1));
}

/* ---------- the left panel folded to a rail (step R4 of the slim row) ---------- */
// The owner, of the left panel on the play map: "folded to a rail". The passed mock-up: "On the play map it starts folded to a rail. A press
// opens it, and a pin keeps it open." leftrail.js is sliced by its markers and run for real on a page of plain objects.
{
    const rSrc = read('scripts/leftrail.js'), rSlice = sliceOf(rSrc, 'leftrail'), SVG1 = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">', ico = d => SVG1 + '<path d="' + d + '"/></svg>';
    const LENS = (/id="searchCampBtn"[^>]*><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="([^"]+)"\/>/.exec(ix) || [])[1] || '?';
    const BOOK = 'M12 6.5c-2-1.3-4.6-1.8-8-1.5v13c3.4-.3 6 .2 8 1.5 2-1.3 4.6-1.8 8-1.5V5c-3.4-.3-6 .2-8 1.5zM12 6.5v13', PLAN = 'M6 3.5h8.5L18 7v13.5H6zM10 10v6l5-3z', MAPS = 'M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2zM9 4.5v13M15 6.5v13', PIN = 'M8.5 3.5h7M10 3.5v5l-3.2 4.5h10.4L14 8.5v-5M12 13v7.5';
    const RAIL = '  <div class="layout-wrapper">\n    <nav id="leftRail" aria-label="The left panel, folded" hidden>\n'
        + '      <button class="rail-btn" id="railHandbook" data-rail="handbook" aria-expanded="false" title="Handbook. Opens the left panel at its pages.">' + ico(BOOK) + '</button>\n'
        + '      <button class="rail-btn gm-only" id="railPlanners" data-rail="planners" aria-expanded="false" title="Planners. Opens the left panel at your planners.">' + ico(PLAN) + '</button>\n'
        + '      <button class="rail-btn gm-only" id="railMaps" data-rail="maps" aria-expanded="false" title="Maps. Opens the left panel at the maps.">' + ico(MAPS) + '</button>\n'
        + '      <button class="rail-btn gm-only" id="railSearch" title="Search. Quick-jump, Ctrl+K.">' + ico(LENS) + '</button>\n      <span class="rail-grow"></span>\n'
        + '      <button class="rail-btn" id="railPin" title="Keep the left panel open.">' + ico(PIN) + '</button>\n    </nav>\n    <div id="campaignSidebar">\n';
    const RAIL_IDS = ['leftRail', 'railHandbook', 'railPlanners', 'railMaps', 'railSearch', 'railPin'], PANEL_IDS = ['campaignSidebar', 'docNavList', 'plannerNavList', 'mapNavList', 'leftGrip', 'toggleLeftBtn'];
    check('the rail, as the page has it: a column right before the left panel, put away in the page, that holds an icon for the Handbook, the Planners and the Maps, each named for the section of the panel it opens, then Search, and at its foot the pin; the open book, the page that plays, the folded map and the pin are the drawings the owner passed on the sheet of thirteen, the very ones Export All Pages, Export All Planners, Export All Maps and a pinned map\'s tab wear, and the lens is the one Search wears in the campaign\'s menu; a player\'s rail is the Handbook and the pin; each says in its tooltip what a press does; the panel, its three lists, its grip and its arrow are each still in the page once; the module is loaded after the pills\'',
        count(ix, RAIL) === 1 && LENS.length > 20 && RAIL_IDS.concat(PANEL_IDS).every(id => count(ix, ' id="' + id + '"') === 1) && ['handbook', 'planners', 'maps'].every(s => count(ix, 'class="section-title" data-section="' + s + '"') === 1)
        && [[BOOK, 'exportDocsBtn'], [PLAN, 'exportPlannersBtn'], [MAPS, 'exportMapsBtn']].every(p => new RegExp('id="' + p[1] + '" title="[^"]+"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="' + p[0].replace(/[.]/g, '\\.') + '"/>').test(ix))
        && count(ix, '<span class="mt-mark" id="mapTabPin" hidden>' + ico(PIN) + '</span>') === 1 && count(ix, '<script type="module" src="scripts/pills.js"></script>\n<script type="module" src="scripts/leftrail.js"></script>\n') === 1);
    const load = () => { try { return new Function(rSlice + '\nreturn { railNext: railNext, railApply: railApply, railPinRead: railPinRead, railPinKeep: railPinKeep, RAIL_SECS: RAIL_SECS };')(); } catch (e) { return { err: String(e) }; } };
    const T = load(); let err = T.err || '', walk = '', odd = '', drew = '', pin = '';
    if (!err) try {
        const show = s => s.mode + (s.sec ? ':' + s.sec : '') + (s.auto ? ' auto' : '') + (s.play ? ' play' : '') + (s.pin ? ' pin' : '');
        const run = (st, evs) => { const outS = []; let s = st; evs.forEach(e => { const was = J(s); s = T.railNext(s, e); if (J(st) !== was && s === st) outS.push('SAME OBJECT'); outS.push(show(s)); }); return outS; };
        const V = play => ({ t: 'view', play }), I = sec => ({ t: 'icon', sec }), AWAY = { t: 'away' }, PINE = { t: 'pin' }, TOG = { t: 'toggle' }, D0 = { mode: 'docked', sec: '', auto: false, play: false, pin: false };
        walk = J([run(D0, [V(false), V(true), V(true), I('maps'), I('handbook'), I('handbook'), I('planners'), AWAY, AWAY, V(false), V(true)]),   // arriving folds it, an icon opens it, the same icon folds it, away folds it, leaving opens what folded by itself
            run(D0, [V(true), I('maps'), V(false), V(true), PINE, V(false), V(true), I('maps'), AWAY, PINE]),                                  // open when leaving: docked again. Pinned: it stays docked on the play map, and an icon, away and the pin do nothing more
            run(D0, [V(true), TOG, V(false), V(true), TOG, V(false), V(true)]),                                                                // the arrow on the play map: docks and pins, folds and unpins, and the fold is the play map's own
            run(D0, [TOG, V(true), I('maps'), V(false), TOG, TOG, V(true), V(false)]),                                                         // folded on another view by the user: it stays folded there, and the play map does not open it
            run(Object.assign({}, D0, { pin: true }), [V(true), TOG, V(false), V(true), I('maps'), PINE, V(false)])]);                            // pinned from the start: docked on the play map. Folded there, it is no longer pinned
        const before = J(D0); T.railNext(D0, V(true));
        odd = J([show(T.railNext(null, V(true))), show(T.railNext(undefined, null)), show(T.railNext({ mode: 'weird', sec: 'x', auto: 1, play: 'yes', pin: 'yes' }, null)), show(T.railNext({ mode: 'open', sec: 'nope' }, null)), show(T.railNext({ mode: 'rail', sec: 'maps' }, null)),
            show(T.railNext({ mode: 'rail' }, I('nope'))), show(T.railNext({ mode: 'rail' }, I('__proto__'))), show(T.railNext({ mode: 'rail' }, { t: 'other' })), show(T.railNext({ mode: 'open', sec: 'maps' }, {})), show(T.railNext(D0, { t: 'view', play: 'yes' })), show(T.railNext(D0, I('maps'))), show(T.railNext(D0, AWAY)), show(T.railNext(D0, PINE)),
            J(D0) === before, J(T.RAIL_SECS), show(T.railNext({ mode: 'docked', play: true }, V(true))), show(T.railNext({ mode: 'rail' }, PINE))]);   // a redraw of the play map never folds a docked panel again, and the pin pins only on the play map
        // drawn: the panel's two classes, the rail shown unless docked, the open section's icon lit, and the arrow's words
        const cl = () => { const set = new Set(); return { set, toggle: (c, v) => { if (v) set.add(c); else set.delete(c); }, contains: c => set.has(c) }; };
        const mkB = sec => ({ sec, classList: cl(), attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); } }), btns = { handbook: mkB('handbook'), maps: mkB('maps') };   // a rail without its Planners icon lights the others
        const sb = { classList: cl() }, rail = { hidden: true, querySelector: q => { const m = /^\[data-rail="([a-z]+)"\]$/.exec(q); return m && btns[m[1]] ? btns[m[1]] : null; } }, tg = { textContent: '', dataset: {}, title: 1, removeAttribute(k) { if (k === 'title') delete this.title; } };
        const doc = { getElementById: id => (id === 'campaignSidebar' ? sb : id === 'leftRail' ? rail : id === 'toggleLeftBtn' ? tg : null) };
        const see = () => [[...sb.classList.set].sort().join('.'), rail.hidden, Object.keys(btns).filter(k => btns[k].classList.contains('on')).join(','), Object.keys(btns).map(k => btns[k].attrs['aria-expanded']).join(','), tg.textContent, tg.dataset.tip, 'title' in tg].join('|');
        const d = [T.railApply(doc, { mode: 'rail', sec: '' }), see(), T.railApply(doc, { mode: 'open', sec: 'maps' }), see(), T.railApply(doc, { mode: 'open', sec: 'planners' }), see(), T.railApply(doc, { mode: 'docked', sec: '' }), see()];
        const noTg = { getElementById: id => (id === 'campaignSidebar' ? sb : id === 'leftRail' ? rail : null) }, d2 = [T.railApply(noTg, { mode: 'rail', sec: '' }), rail.hidden, T.railApply({ getElementById: id => (id === 'leftRail' ? rail : null) }, { mode: 'docked' }), rail.hidden, T.railApply({ getElementById: () => null }, { mode: 'rail' })];
        drew = J([d, d2]);
        const mkS = v => { const log = []; return { log, getItem: k => { log.push('get ' + k); if (v === 'throw') throw new Error('x'); return v; }, setItem: (k, x) => { if (v === 'throw') throw new Error('x'); log.push('set ' + k + '=' + x); }, removeItem: k => { if (v === 'throw') throw new Error('x'); log.push('remove ' + k); } }; };
        const s1 = mkS('1'), s0 = mkS(null), sx = mkS('throw'), sy = mkS('yes');
        pin = J([T.railPinRead(s1), s1.log, T.railPinRead(s0), T.railPinRead(sy), T.railPinRead(sx), T.railPinKeep(s0, true), T.railPinKeep(s0, false), T.railPinKeep(s0, 'yes'), s0.log.slice(1), T.railPinKeep(sx, true)]);
    } catch (e) { err = String(e && e.stack || e); }
    check('the panel\'s three states (railNext, run for real): arriving at the play map folds a docked panel to the rail, unless it is pinned there, and leaving the play map opens again what folded by itself, opened or not; an icon of the rail opens the panel at its section, another icon moves it there, the icon of the section it is open at folds it, and a press anywhere else folds it; the pin docks it and, on the play map, pins it; the arrow at the panel\'s edge folds a docked panel and docks a folded one, which on the play map unpins and pins, and a fold made there is the play map\'s own; a panel the user folded on another view stays folded there and on the play map; a docked panel takes no icon, no press elsewhere and no pin',
        !err && walk === J([['docked', 'rail auto play', 'rail auto play', 'open:maps auto play', 'open:handbook auto play', 'rail auto play', 'open:planners auto play', 'rail auto play', 'rail auto play', 'docked', 'rail auto play'],
            ['rail auto play', 'open:maps auto play', 'docked', 'rail auto play', 'docked play pin', 'docked pin', 'docked play pin', 'docked play pin', 'docked play pin', 'docked play pin'],
            ['rail auto play', 'docked play pin', 'docked pin', 'docked play pin', 'rail auto play', 'docked', 'rail auto play'],
            ['rail', 'rail play', 'open:maps play', 'rail', 'docked', 'rail', 'rail play', 'rail'],
            ['docked play pin', 'rail auto play', 'docked', 'rail auto play', 'open:maps auto play', 'docked play pin', 'docked pin']]), err || walk);
    check('the states\' edges (railNext): a state that is none, or holds words it does not know, is a docked panel away from the play map, unpinned; only true counts for the play map, for pinned and for folded by itself; a section it does not know, or a name the list only inherits, opens nothing; an event it does not know changes nothing; a panel that is not open is open at no section; the state handed in is never changed',
        !err && odd === J(['rail auto play', 'docked', 'docked', 'open', 'rail', 'rail', 'rail', 'rail', 'open:maps', 'docked', 'docked', 'docked', 'docked', true, J(['handbook', 'planners', 'maps']), 'docked play', 'docked']), err || odd);
    check('the state written to the page (railApply, run for real): folded, the panel is collapsed and the rail shows; open, the panel lies over the map by its own class, the rail still shows and the icon of the open section is lit and says so to a screen reader; docked, the panel has neither class and the rail is put away; the arrow at the panel\'s edge points the way a press goes and says so in its one tooltip, never in a second; a rail that lacks an icon lights the others, a page without the arrow is still drawn, and a page without the panel or the rail is not',
        !err && drew === J([[true, 'collapsed|false||false,false|▶|Show the left panel|false', true, 'floating|false|maps|false,true|▶|Show the left panel|false', true, 'floating|false||false,false|▶|Show the left panel|false', true, '|true||false,false|◀|Hide the left panel|false'],
            [true, false, false, false, false]]), err || drew);
    check('whether the panel is pinned on the play map is this computer\'s own (railPinRead, railPinKeep): read as pinned only where the store holds a 1 under wp_leftPin, kept as a 1 only for true and taken out for anything else, and a store that throws reads as not pinned and keeps nothing',
        !err && pin === J([true, ['get wp_leftPin'], false, false, false, true, true, true, ['set wp_leftPin=1', 'remove wp_leftPin', 'remove wp_leftPin'], false]), err || pin);
    check('the rail\'s wiring and its look: the module starts docked and unpinned unless this computer says pinned, and every change goes through the one function, which keeps the pin only when it changed and never while the tour\'s card is up, writes the state, shows the section an icon named, and has the toolbar fitted again when the map\'s room changed; a press on an icon, on Search, which folds the panel and opens quick-jump, and on the pin; a press anywhere but the panel, the rail, a right-click menu and the tour\'s card folds a panel that was only opened, and so does Esc; the board\'s redraw tells the module the view before the toolbar is fitted, and the arrow at the panel\'s edge tells it after its own lines, which stay as they were; the rail is 34 wide, the opened panel lies over the map beside it and takes no room from it, only a docked panel has its grip, and the stream window and a player with no handbook have no rail; the module writes no markup',
        rSlice.length > 2500 && !/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(rSrc) && !/[^\x00-\x7f]/.test(rSrc)
        && rSrc.includes("var st = { mode: 'docked', sec: '', auto: false, play: false, pin: railPinRead(localStorage) };") && rSrc.includes("function playNow() { var am = getActiveMap(); return !!am && am.type === 'map' && state.viewMode === 'visual'; }")
        && rSrc.includes("    var was = st; st = railNext(st, ev);\n    if (st.pin !== was.pin && !touring()) railPinKeep(localStorage, st.pin);") && rSrc.includes("    railApply(document, st);\n    if (st.mode === 'open' && (was.mode !== 'open' || was.sec !== st.sec)) showSection(st.sec);\n    if (st.mode !== was.mode && window.wpFitBar) window.wpFitBar();")
        && rSrc.includes("        if (b.id === 'railPin') act({ t: 'pin' });\n        else if (b.id === 'railSearch') { act({ t: 'away' }); if (window.wpCmdkOpen) window.wpCmdkOpen(); }\n        else if (b.getAttribute('data-rail')) act({ t: 'icon', sec: b.getAttribute('data-rail') });")
        && rSrc.includes("        if (st.mode !== 'open') return;\n        var t = e.target; if (t && t.closest && (t.closest('#campaignSidebar') || t.closest('#leftRail') || t.closest('.context-menu') || t.closest('#tourCard'))) return;\n        act({ t: 'away' });\n    }, true);")
        && rSrc.includes("    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && st.mode === 'open') act({ t: 'away' }); });") && rSrc.includes("function sync() { return act({ t: 'view', play: playNow() }); }")
        && /\nwindow\.wpLeftRail = \{ sync: sync, toggled: function\(\) \{ return act\(\{ t: 'toggle' \}\); \}, mode: function\(\) \{ return st\.mode; \} \};\n$/.test(rSrc)
        && count(mainSrc, 'if (window.wpLeftRail) window.wpLeftRail.sync();') === 1 && mainSrc.indexOf('if (window.wpLeftRail) window.wpLeftRail.sync();') < mainSrc.indexOf('if (window.wpFitBar) window.wpFitBar();   // 107')
        && wbSrc.includes("this.removeAttribute('title');   // what a press does now (tooltips.js reads data-tip: one tooltip, never two)\n      if (window.wpLeftRail) window.wpLeftRail.toggled();") && count(wbSrc, 'window.wpLeftRail.toggled();') === 1
        && css.includes('\n  .layout-wrapper { position: relative; }\n  #leftRail { flex: 0 0 34px; box-sizing: border-box; display: flex; flex-direction: column;') && css.includes('\n  #leftRail[hidden] { display: none; }\n') && css.includes('\n  .rail-btn.on { background: var(--gold); color: #1a1a1a; }\n')
        && css.includes('\n  #campaignSidebar.floating { position: absolute; left: 34px; top: 0; bottom: 0; z-index: 5001;') && css.includes('\n  #campaignSidebar.collapsed + #leftGrip, #campaignSidebar.floating + #leftGrip { display: none; }')
        && css.includes('\n  body.stream-mode #leftRail, body.net-client.no-handbook #leftRail { display: none !important; }\n') && css.includes('\n  #campaignSidebar.collapsed { width: 0 !important; padding-left: 0; padding-right: 0; border-right: none; }'));
    const helpRail = ix.slice(ix.indexOf('<li><b>The left panel:</b>'), ix.indexOf('<li><b>Hiding the row:</b>'));
    check('the rail, said: Help\'s part on the top row has an entry on the left panel, between the pills and More, that says the panel folds to a narrow rail on the play map, how an icon opens it and what folds it again, what the lens and the pin do, and that on the other views the panel stays open; both release notes say it in the same words',
        helpRail.length > 500 && helpRail.length < 1400 && helpRail.indexOf('<li><b>The left panel:</b> on the play map the left panel folds to a narrow rail, so the map has more room.\n') === 0
        && ['<li>Press an icon of the rail to open the panel at the Handbook, the Planners or the Maps. It lies over the map.</li>', '<li>Press the map, or the same icon again, to fold it.</li>', '<li>The lens opens quick-jump.</li>',
            '<li>The pin keeps the panel open on the play map. The arrow at the panel&rsquo;s edge folds it again.</li>', '<li>On the other views the panel stays open, as before.</li>'].every(s => count(helpRail, s) === 1)
        && [rootRead('WHATSNEW.txt'), read('assets/whatsnew.txt')].every(t => count(t, "- On the play map the left panel folds to a narrow rail, so the map\n  has more room. Press an icon of the rail to open the panel over the\n  map, or the pin to keep it open.\n") === 1));
}

/* ---------- the top row, hidden (the last step of the slim row) ---------- */
// The owner: "one slim row, with the option of hiding it", and of what stays in sight while it is hidden, by prompt: "Tabs and pills".
// rowhide.js is sliced by its markers and run for real on a page of plain objects.
{
    const hSrc = read('scripts/rowhide.js'), hSlice = sliceOf(hSrc, 'rowhide'), ARROW_D = 'M6 9.5l6 6 6-6', HH = 'body.row-hidden:not(.tour-on)';
    check('the arrow that hides the row and the tab that shows it again, as the page has them: the arrow is the last control of the row, before the saved note, and the tab stands right after the row, put away in the page; both wear the small arrow the toolbar uses for "this opens", turned to point up on the arrow by the style sheet, so no new drawing was needed; each says in its tooltip what a press does; the module is loaded after the rail\'s',
        count(ix, '    <button class="tool ghost icon" id="rowHideBtn" aria-pressed="false" title="Hide the top row. A small tab at the top edge shows it again."><svg class="ico ico-up" viewBox="0 0 24 24" aria-hidden="true"><path d="' + ARROW_D + '"/></svg></button>\n    <div class="save-note" id="saveNote"></div>\n  </header>\n'
            + '  <button id="rowShowTab" hidden title="Show the top row."><svg class="ico ico-down" viewBox="0 0 24 24" aria-hidden="true"><path d="' + ARROW_D + '"/></svg></button>\n') === 1
        && count(ix, ' id="rowHideBtn"') === 1 && count(ix, ' id="rowShowTab"') === 1 && new RegExp('id="campMenuBtn"[^\\n]*<path d="' + ARROW_D + '"/>').test(ix) && css.includes('\n  header #rowHideBtn .ico { transform: rotate(180deg); }')
        && count(ix, '<script type="module" src="scripts/leftrail.js"></script>\n<script type="module" src="scripts/rowhide.js"></script>\n') === 1);
    const load = () => { try { return new Function(hSlice + '\nreturn { hideRead: hideRead, hideKeep: hideKeep, hideApply: hideApply, hideSet: hideSet };')(); } catch (e) { return { err: String(e) }; } };
    const T = load(); let err = T.err || '', kept = '', did = '';
    if (!err) try {
        const mkS = v => { const log = []; return { log, getItem: k => { log.push('get ' + k); if (v === 'throw') throw new Error('x'); return v; }, setItem: (k, x) => { if (v === 'throw') throw new Error('x'); log.push('set ' + k + '=' + x); }, removeItem: k => { if (v === 'throw') throw new Error('x'); log.push('remove ' + k); } }; };
        const s1 = mkS('1'), s0 = mkS(null), sx = mkS('throw');
        kept = J([T.hideRead(s1), s1.log, T.hideRead(s0), T.hideRead(mkS('yes')), T.hideRead(mkS('0')), T.hideRead(sx), T.hideKeep(s0, true), T.hideKeep(s0, false), T.hideKeep(s0, 1), s0.log.slice(1), T.hideKeep(sx, true)]);
        const mkDoc = lack => { const cls = new Set(), log = [], el = id => ({ id, hidden: id === 'rowShowTab', attrs: {}, setAttribute(k, v) { this.attrs[k] = String(v); }, focus() { log.push('focus ' + id); } }), els = { rowShowTab: el('rowShowTab'), rowHideBtn: el('rowHideBtn') };
            (lack || []).forEach(id => { delete els[id]; });
            return { log, els, cls, body: { classList: { toggle: (c, v) => { if (v) cls.add(c); else cls.delete(c); } } }, getElementById: id => els[id] || null }; };
        const see = d => [[...d.cls].join(' '), d.els.rowShowTab ? d.els.rowShowTab.hidden : '-', d.els.rowHideBtn ? d.els.rowHideBtn.attrs['aria-pressed'] : '-'].join('|');
        const A = mkDoc(), a = [T.hideApply(A, true), see(A), T.hideApply(A, false), see(A), T.hideApply(A, 'yes'), see(A), T.hideApply(A, 1), see(A)];
        const B = mkDoc(), st = mkS(null), calls = [], w = { wpTopRow: { close: () => { calls.push('close'); } }, wpFitBar: () => { calls.push('fit'); } };
        const b1 = T.hideSet(B, st, w, true), sB1 = see(B), b2 = T.hideSet(B, st, w, false), sB2 = see(B), b3 = T.hideSet(B, st, w, 'yes'), sB3 = see(B);
        const C = mkDoc(['rowShowTab', 'rowHideBtn']), c1 = T.hideSet(C, mkS('throw'), {}, true), sC = see(C), c2 = T.hideSet(C, mkS(null), { wpTopRow: {}, wpFitBar: 'no' }, true);
        did = J([a, [b1, sB1, b2, sB2, b3, sB3], st.log, calls, B.log, [c1, sC, c2, C.log]]);
    } catch (e) { err = String(e && e.stack || e); }
    check('whether the row is hidden is this computer\'s own (hideRead, hideKeep, run for real): read as hidden only where the store holds a 1 under wp_rowHidden, kept as a 1 only for true and taken out for anything else, and a store that throws reads as shown and keeps nothing',
        !err && kept === J([true, ['get wp_rowHidden'], false, false, false, false, true, true, true, ['set wp_rowHidden=1', 'remove wp_rowHidden', 'remove wp_rowHidden'], false]), err || kept);
    check('hiding and showing the row (hideApply, hideSet, run for real): hidden, the body carries its one word, the tab shows and the arrow says it is pressed; shown, the word is gone and the tab is put away; only true hides; a press keeps the choice, puts a menu of the row away, has the toolbar fitted to the room the map has now, and moves the focus to the control that undoes it; a page that lacks the tab and the arrow, a store that throws and a window whose other modules are not there still hide the row and throw nothing',
        !err && did === J([[true, 'row-hidden|false|true', false, '|true|false', false, '|true|false', false, '|true|false'], [true, 'row-hidden|false|true', false, '|true|false', false, '|true|false'],
            ['set wp_rowHidden=1', 'remove wp_rowHidden', 'remove wp_rowHidden'], ['close', 'fit', 'close', 'fit', 'close', 'fit'], ['focus rowShowTab', 'focus rowHideBtn', 'focus rowHideBtn'], [true, 'row-hidden|-|-', true, []]]), err || did);
    const KEEP = '  ' + HH + ' header > *:not(#mapTabs):not(#rowPills):not(#clockChip):not(#videoChip):not(.spacer):not(.header-group),\n  ' + HH + ' header > .header-group > *:not(#updateBtn):not(#reviewChip):not(.hdr-group),\n  ' + HH + ' header .hdr-group:not([data-label="Table"]),\n'
        + '  ' + HH + ' header .hdr-group[data-label="Table"] > *:not(#chatBtn),\n  ' + HH + ' header #chatBtn:not(:has(#chatBadge:not([style*="display:none"]):not([style*="display: none"]))) { display: none !important; }\n';
    const hdr2 = ix.slice(ix.indexOf('<header>'), ix.indexOf('</header>')), kid = id => new RegExp('\\n    <[a-z]+ [^\\n]*id="' + id + '"').test(hdr2);
    check('a hidden row, in the style sheet and in the wiring: the row is lifted off the layout by the body\'s one word, so the map has the whole window, and takes no press but on what it shows; what stays in sight is named in one rule: the map tabs, the pills, the clock and a player\'s video, which are the row\'s own children, Review and Update inside their group, and the chat button only while its count shows; nothing is hidden while the tour\'s card is up, and the tab is put away then and in the stream window; the row stands where the map\'s area begins and clear of an open Properties panel; a press on the arrow hides, a press on the tab shows, the kept choice is written at the start, and the module writes no markup',
        count(css, KEEP) === 1 && ['mapTabs', 'rowPills', 'clockChip', 'videoChip'].every(kid) && /<div class="header-group">\n(?:(?!<\/header>)[\s\S])*?\n      <button class="tool" id="updateBtn"[^\n]*\n      <button class="tool" id="reviewChip"/.test(hdr2)
        && /<div class="hdr-group" data-label="Table">\n(?:\s*<button[^\n]*\n)*?\s*<button class="tool ghost icon" id="chatBtn"[^\n]*<span id="chatBadge" style="display:none;/.test(hdr2)
        && css.includes('\n  ' + HH + ' header { position: fixed; top: var(--rowbar); left: calc(var(--mainleft, 34px) + 42px); right: 8px; z-index: 4030; min-height: 0; padding: 0; gap: 6px; background: none; border: 0; flex-wrap: nowrap; pointer-events: none; }\n')
        && css.includes('\n  ' + HH + ':has(#sidebar:not(.collapsed):not([style*="none"])) header { right: calc(var(--rightw, 320px) + 12px); }')
        && css.includes('\n  #rowShowTab[hidden], body.tour-on #rowShowTab, body.stream-mode #rowShowTab { display: none; }\n') && count(css, 'row-hidden') === count(css, HH) && count(css, HH) >= 20
        && hSlice.length > 900 && !/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(hSrc) && !/[^\x00-\x7f]/.test(hSrc)
        && hSrc.includes("    if (btn) btn.addEventListener('click', function() { hideSet(document, localStorage, window, true); });\n    if (tab) tab.addEventListener('click', function() { hideSet(document, localStorage, window, false); });\n    hideApply(document, hideRead(localStorage));"));
    /* the hidden row's bar keeps clear (the owner, 2026-10-08, with pictures of the hidden row: "some issues in layout when the top tab is collapsed, things need better
       vertical spacing", "the bar also blocks the ruler along the top and slightly to the left side") */
    const numOf = re => { const m = css.match(re); return m ? parseFloat(m[1]) : NaN; };
    const HSR = 'body\\.row-hidden:not\\(\\.tour-on\\):not\\(\\.stream-mode\\)', reOf = s => new RegExp(s);
    const RUL_H = numOf(/\n  #rulerTop \{ position: absolute; top: 0; left: 0; width: 100%; height: (\d+)px;/), RUL_W = numOf(/\n  #rulerLeft \{ position: absolute; top: 0; left: 0; width: (\d+)px;/), RAIL_W = numOf(/\n  #leftRail \{ flex: 0 0 (\d+)px;/);
    const TAB_L = numOf(/\n  #rowShowTab \{ position: fixed; top: 0; left: var\(--mainleft, (\d+)px\); z-index: 4031; box-sizing: border-box; width: \d+px; height: \d+px;/), TAB_W = numOf(/\n  #rowShowTab \{ position: fixed; top: 0; left: var\(--mainleft, \d+px\); z-index: 4031; box-sizing: border-box; width: (\d+)px;/), TAB_H = numOf(/\n  #rowShowTab \{ position: fixed; top: 0; left: var\(--mainleft, \d+px\); z-index: 4031; box-sizing: border-box; width: \d+px; height: (\d+)px;/);
    const BAR_Y = numOf(/\n  body\.row-hidden:not\(\.tour-on\) \{ --rowbar: (\d+)px; \}\n/), BAR_Y0 = numOf(/\n  body\.row-hidden:not\(\.tour-on\)\.no-rulers \{ --rowbar: (\d+)px; \}\n/);
    const BAR_X = numOf(/\n  body\.row-hidden:not\(\.tour-on\) header \{ position: fixed; top: var\(--rowbar\); left: calc\(var\(--mainleft, \d+px\) \+ (\d+)px\); right: 8px; z-index: 4030;/), BAR_XD = numOf(/\n  body\.row-hidden:not\(\.tour-on\) header \{ position: fixed; top: var\(--rowbar\); left: calc\(var\(--mainleft, (\d+)px\) \+/);
    // the moved things, each by its own rule: the first line (the minimap and the zoom box), the line under it, the party strip in the zoom box's place, a page, the window's own notices
    const DOWN = numOf(reOf('\\n  ' + HSR + ' #minimap, ' + HSR + ' #zoomBox \\{ top: calc\\(var\\(--rowbar\\) \\+ (\\d+)px\\); \\}\\n')), DOWN_P = numOf(reOf('\\n  ' + HSR + ' #partyStrip, ' + HSR + ' #joinCard, ' + HSR + ' #combatStrip \\{ top: calc\\(var\\(--rowbar\\) \\+ (\\d+)px\\); \\}\\n'));
    const DOWN_P0 = numOf(reOf('\\n  ' + HSR + '\\.no-pointerpos\\.no-zoomctl #partyStrip \\{ top: calc\\(var\\(--rowbar\\) \\+ (\\d+)px\\); \\}\\n')), PAGE_Y = numOf(reOf('\\n  ' + HSR + ' #plannerWrap \\{ margin-top: (\\d+)px; \\}\\n'));
    const DOWN_R = numOf(reOf('\\n  ' + HSR + ' #docReaderModal \\{ top: calc\\(var\\(--rowbar\\) \\+ (\\d+)px\\) !important; \\}\\n')), DOWN_U = numOf(reOf('\\n  ' + HSR + ' #updateBanner \\{ top: calc\\(var\\(--rowbar\\) \\+ (\\d+)px\\) !important; \\}\\n'));
    const DOWN_B = numOf(reOf('\\n  ' + HSR + ' #pauseBanner \\{ top: calc\\(var\\(--rowbar\\) \\+ (\\d+)px\\); \\}\\n')), DOWN_G = numOf(reOf('\\n  ' + HSR + ' #soundGate, ' + HSR + ' #musicGate \\{ top: calc\\(var\\(--rowbar\\) \\+ (\\d+)px\\); \\}\\n'));
    const ZOOM_Y = numOf(/\n  #zoomBox \{\n    position: absolute; top: (\d+)px; right: 14px; z-index: 8992;/), MINI_Y = numOf(/\n  #minimap \{\n    position: absolute; left: 44px; top: (\d+)px; z-index: 5000;/), PARTY_Y = numOf(/\n  #partyStrip \{\n    position: absolute; top: (\d+)px; right: 14px; z-index: 8990;/);
    const JOIN_Y = numOf(/\n  \.join-card \{ position: absolute; top: (\d+)px; right: 224px;/), FIGHT_Y = numOf(/\n  #combatStrip \{ position: absolute; top: (\d+)px; left: 50%;/);
    const PANEL_Z = numOf(/\n  #campaignSidebar\.floating \{ position: absolute; left: 34px; top: 0; bottom: 0; z-index: (\d+);/);
    // the bar is as tall as its tallest child: a map tab, a pill, or an icon button of the row (the chat button while unread), each as the style sheet sizes it
    const TAB_TALL = numOf(/\n  #mapTabFront, \.map-tab \{ height: (\d+)px;/), PILL_TALL = numOf(/\n  \.pill \{ height: (\d+)px;/), ICON_TALL = numOf(/\n  header \.tool\.icon \{ width: \d+px; height: (\d+)px;/), BAR_TALL = Math.max(TAB_TALL, PILL_TALL, ICON_TALL);
    // a notice fixed to the window's middle is as tall as its line of text, its padding and its edge, by its own rule: it must end above the line under the zoom box
    const tallOf = re => { const m = css.match(re); return m ? 2 * parseFloat(m[1]) + 2 + Math.ceil(parseFloat(m[2]) * 1.5) : NaN; };   // measured live: the banner 40 px (41 here), a gate 32 px (33 here)
    const BAN_TALL = tallOf(/\n  #pauseBanner \{\n    position: fixed; top: \d+px;[^}]*?padding: (\d+)px \d+px; border-radius: \d+px; font-size: ([\d.]+)px;/), GATE_TALL = tallOf(/\n  #soundGate \{ position: fixed; left: 50%; top: \d+px;[^}]*?padding: (\d+)px \d+px; font-size: ([\d.]+)px;/);
    const gapBlock = css.slice(css.indexOf("\n  /* what stands at the top of a map moves down by the bar's height"), css.indexOf('\n  /* ---- the left panel folded to a rail')), gapRules = gapBlock.slice(gapBlock.indexOf('*/\n') + 3).split('\n').filter(Boolean);
    check('a hidden row keeps clear of what stands at the top of a map, in the style sheet: the tab that shows the row is exactly the corner where the two rulers meet (the top ruler\'s height, the left ruler\'s width, at the top edge, where the map\'s area begins); the bar floats under the top ruler and past the left ruler and the tab, and at the top edge where no ruler is on screen; the minimap and the zoom box move down by more than the bar is tall (its tallest child, read from the style sheet), from the one place they share; what stood on one line under the zoom box (the party strip, a player\'s join card, the turn strip) keeps its distance under it, the party strip taking the zoom box\'s place when that is put away; a planner or a page starts under the bar; the pause banner and the two gates stand no lower than the zoom box and end above the line under it; a player\'s page reader and the update banner, which write their top once from the row\'s bottom, stand under the bar whatever they wrote; every one of those rules spares the stream window, which has no bar; in a narrow window the bar gives way (the tabs down to the plus, the clock cut short, each pill down to its drawing) and never spills; the left panel opened from the rail lies over the minimap, the bar and the tab, and under the toolbar; the page\'s redraw measures where the map\'s area begins, right after the left panel is placed',
        [RUL_H, RUL_W, RAIL_W, TAB_L, TAB_W, TAB_H, BAR_Y, BAR_Y0, BAR_X, BAR_XD, DOWN, DOWN_P, DOWN_P0, DOWN_B, DOWN_G, DOWN_R, DOWN_U, ZOOM_Y, MINI_Y, PARTY_Y, JOIN_Y, FIGHT_Y, PAGE_Y, PANEL_Z, TAB_TALL, PILL_TALL, ICON_TALL, BAN_TALL, GATE_TALL].every(n => n === n)
        && DOWN_R >= BAR_TALL && DOWN_R <= DOWN && DOWN_U >= BAR_TALL + 4 && css.includes('\n  ' + HH + ' header #mapTabs { min-width: 30px; }\n  ' + HH + ' header #clockChip { flex: 0 100 auto; min-width: 0; }\n  ' + HH + ' header #rowPills { flex: 0 1 auto; min-width: 0; overflow-x: clip; }\n  ' + HH + ' header #rowPills .pill { flex: 0 1 auto; min-width: 32px; }\n  ' + HH + ' header #rowPills .pill-txt { min-width: 0; overflow: hidden; text-overflow: ellipsis; }\n') && count(ix, '<span class="pill-txt">') === 5 && ['fogPill', 'tablePill', 'pausedPill', 'roundPill', 'viewPill'].every(id => new RegExp('<button class="pill[^"]*" id="' + id + '"[^\\n]*?<span class="pill-txt">[^<]*</span>[^\\n]*?</button>').test(ix)) && css.includes('\n  .hdr-clock .clock-txt { overflow: hidden; text-overflow: ellipsis; }')
        && read('scripts/main.js').includes("      if (window.wpLeftRail) window.wpLeftRail.sync();   // the left panel folds to its rail on the play map (leftrail.js), before the bar measures the room the map has\n      if (window.wpRowHide) window.wpRowHide.fit();") && count(read('scripts/main.js'), 'window.wpRowHide.fit()') === 1
        && TAB_L === RAIL_W && BAR_XD === RAIL_W && TAB_W === RUL_W && TAB_H === RUL_H && BAR_Y >= RUL_H + 2 && BAR_Y0 >= 2 && BAR_Y0 < RUL_H && BAR_X >= TAB_W + 4
        && DOWN >= BAR_TALL + 4 && PAGE_Y >= BAR_TALL + 4 && ZOOM_Y === MINI_Y && JOIN_Y === PARTY_Y && FIGHT_Y === PARTY_Y && DOWN_P - DOWN === PARTY_Y - ZOOM_Y && DOWN_P0 === DOWN
        && DOWN_B > BAR_TALL && DOWN_B <= DOWN && DOWN_B + BAN_TALL <= DOWN_P && DOWN_G >= BAR_TALL + 4 && DOWN_G <= DOWN && DOWN_G + GATE_TALL <= DOWN_P
        && gapRules.length === 8 && gapRules.every(r => r.indexOf('  ' + HH + ':not(.stream-mode)') === 0 && r.split(', ').every(sel => sel.indexOf(HH + ':not(.stream-mode)') >= 0 || /^\s*#/.test(sel) === false)) && count(css, HH + ':not(.stream-mode)') === 12
        && PANEL_Z > 5000 && PANEL_Z < 8990 && !css.includes(':has(#leftRail[hidden]) header') && !css.includes(':has(#leftRail[hidden]) #rowShowTab') && !/#rowShowTab \{[^}]*(left: 50%|translateX)/.test(css)
        && css.includes('\n  #rowShowTab { position: fixed; top: 0; left: var(--mainleft, 34px); z-index: 4031; box-sizing: border-box; width: 36px; height: 18px; padding: 0; border: 1px solid var(--edge); border-top: 0; border-left: 0; border-radius: 0 0 7px 0;'),
        J([RUL_H, RUL_W, RAIL_W, TAB_L, TAB_W, TAB_H, BAR_Y, BAR_Y0, BAR_X, BAR_XD, DOWN, DOWN_P, DOWN_P0, DOWN_B, DOWN_G, ZOOM_Y, MINI_Y, PARTY_Y, JOIN_Y, FIGHT_Y, PAGE_Y, PANEL_Z, TAB_TALL, PILL_TALL, ICON_TALL, BAN_TALL, GATE_TALL, gapRules.length, count(css, HH + ':not(.stream-mode)')]));
    let ml = '', mlErr = '';
    try {
        const M = new Function(hSlice + '\nreturn { mainLeft: mainLeft, mainLeftApply: mainLeftApply };')();
        const mkD = (rect, noMain) => { const set = []; return { set, getElementById: id => (id === 'main' && !noMain ? (rect === 'none' ? {} : { getBoundingClientRect: () => rect }) : null), documentElement: { style: { setProperty: (k, v) => set.push(k + '=' + v) } } }; };
        const run = (rect, noMain) => { const d = mkD(rect, noMain); return [M.mainLeft(d), M.mainLeftApply(d), d.set]; };
        ml = J([run({ left: 34 }), run({ left: 245.4 }), run({ left: 0 }), run({ left: 239.5 }), run({ left: -3 }), run({ left: NaN }), run({ left: 4001 }), run({ left: '34' }), run({}), run('none'), run({ left: 34 }, true)]);
    } catch (e) { mlErr = String(e && e.stack || e); }
    check('where the map\'s area begins is measured, not worked out (mainLeft, mainLeftApply, run for real): the left edge of the map\'s area in whole pixels is written as --mainleft, behind a rail, behind a docked panel and at the window\'s edge alike; a place that is no number, is negative or is past all reason, an area that cannot be measured and a page with no such area write nothing; it is measured at the start and again whenever the area changes size, which is whenever its left edge moves',
        !mlErr && ml === J([[34, 34, ['--mainleft=34px']], [245, 245, ['--mainleft=245px']], [0, 0, ['--mainleft=0px']], [240, 240, ['--mainleft=240px']], [null, null, []], [null, null, []], [null, null, []], [null, null, []], [null, null, []], [null, null, []], [null, null, []]])
        && hSrc.includes("    hideApply(document, hideRead(localStorage));\n    mainLeftApply(document);\n    var area = document.getElementById('main');\n    if (area && typeof ResizeObserver === 'function') new ResizeObserver(function() { mainLeftApply(document); }).observe(area);") && count(hSrc, '--mainleft') >= 2 && count(css, 'var(--mainleft, 34px)') === 2 && hSrc.includes(", fit: function() { return mainLeftApply(document); } };"), mlErr || ml);
    const helpHide = ix.slice(ix.indexOf('<li><b>Hiding the row:</b>'), ix.indexOf('<li><b>More:</b> the three dots'));
    check('hiding the row, said: Help\'s part on the top row has an entry on it, between the left panel and More, that says the small arrow at the row\'s right end hides it, that a small tab at the top edge shows it again and where it stands, what stays in sight, floating on the map, that it sits under the top ruler with the zoom box and the minimap moved down, that a page starts under it, and that the choice is this computer\'s own; both release notes say it in the same words',
        helpHide.length > 300 && helpHide.length < 1100 && helpHide.indexOf('<li><b>Hiding the row:</b> the small arrow at the right end of the top row hides it, so the map has the whole window.\n') === 0
        && ['<li>A small tab at the top edge shows the row again. It stands in the corner where the two rulers meet.</li>', '<li>The map tabs and the pills stay, floating on the map. So do Review, Update and an unread line of chat.</li>', '<li>They sit under the top ruler, so both rulers stay clear. The zoom box and the minimap move down to make room.</li>', '<li>A planner or a page starts under them.</li>', '<li>The choice is yours alone, on this computer.</li>'].every(s => count(helpHide, s) === 1)
        && [rootRead('WHATSNEW.txt'), read('assets/whatsnew.txt')].every(t => count(t, "- The top row can be hidden: press the small arrow at its right end.\n  A tab at the top edge shows it again. The map tabs and the pills\n  stay, floating on the map.\n  They sit under the top ruler, and the zoom box and the minimap\n  move down to make room. The tab stands in the corner where the\n  two rulers meet.\n") === 1));
}

/* ---------- the System editor's keys (options that say what they do, the editor's rows) ---------- */
// The owner, by prompt, of the editor's rows whose ticks said what they do only in tooltips: "A key at the top of each tab". syskey.js is
// sliced by its markers and run for real on a page of plain objects.
{
    const kSrc = read('scripts/syskey.js'), kSlice = sliceOf(kSrc, 'syskey'), shSrc = read('scripts/sheets.js');
    const sys = ix.slice(ix.indexOf('<div id="systemModal"'), ix.indexOf('<input type="file" id="sysImportFile"'));
    // each key as the page has it: its tab, the control its button stands after, its box, and each tick it names with the words the row builder writes for that tick
    const WANT = { fields: ['sysFields', 'sysKeyFields', 'sysFieldRows', [['Hover', "createTextNode(' Hover')"], ['Tile', "createTextNode(' Tile')"], ['Slider', "createTextNode(' Slider')"], ['Counter', "createTextNode(' Counter')"], ['Locked', "createTextNode('Locked: ')"],
            ['&plusmn; colour', "createTextNode(' \\u00b1 colour')"], ['Badge', "createTextNode(' Badge')"], ['Bar', "createTextNode(' Bar')"], ['&#8635; Reset', "createTextNode(' \\u21bb Reset')"], ['Rich table', "createTextNode(' Rich table')"]]],
        rolls: ['sysRolls', 'sysKeyRolls', 'sysRollRows', [['Initiative', "createTextNode(' Initiative')"], ['Damage', "createTextNode(' Damage')"]]],
        items: ['sysItems', 'sysKeyItems', 'sysItemRows', [['per level', "createTextNode(' per level')"], ['Only while switched on', "createTextNode(' Only while switched on')"]]],
        lists: ['sysLists', 'sysKeyLists', 'sysListRules', [['Same item more than once', "'Same item more than once'"], ['No quantity', "'No quantity'"], ['Custom rows', "'Custom rows'"], ['Rows have a level', "'Rows have a level'"], ['Rows have a switch', "'Rows have a switch'"],
            ['Starts on', "'Starts on'"], ['On the row', "'On the row'"], ['Hidden', "'Hidden'"], ['Total', "'Total'"]]] };
    const got = {}, bad = [];
    Object.keys(WANT).forEach(k => { const w = WANT[k], re = new RegExp('<div id="' + w[0] + '" class="sys-tab"[^>]*>\\n(?:\\s*<div id="sysCombatBox"[^\\n]*\\n)?\\s*<div class="sys-toolbar">[^\\n]*<button class="tool ghost sys-key-btn" data-key="' + k + '" aria-expanded="false" aria-controls="' + w[1] + '" title="What each tick of a row on this tab does">What the ticks mean</button></div>\\n\\s*<div class="sys-key" id="' + w[1] + '" hidden>((?:<b>[^<]+</b><small>[^<]+</small>)+)</div>\\n\\s*<div id="' + w[2] + '"');
        const m = re.exec(sys); if (!m) { bad.push(k + ': not as the page should have it'); return; }
        got[k] = []; m[1].replace(/<b>([^<]+)<\/b><small>([^<]+)<\/small>/g, (x, n, line) => { got[k].push([n, line]); return x; });
        if (J(got[k].map(r => r[0])) !== J(w[3].map(r => r[0]))) bad.push(k + ': names ' + J(got[k].map(r => r[0])));
        w[3].forEach(r => { if (shSrc.indexOf(r[1]) < 0) bad.push(k + ': the editor has no tick ' + r[1]); });
        got[k].forEach(r => { const t = r[1].replace(/&rsquo;/g, "'"); if (!/^[A-Z][^()—–;&]*\.$/.test(t) || t.length > 90 || / - /.test(t)) bad.push(k + ': line of ' + r[0] + ': ' + r[1]); }); });
    const lines = Object.keys(got).reduce((n, k) => n + got[k].length, 0), tips = (sys.match(/ title="/g) || []).length;
    check('the System editor\'s keys, as the page has them (the owner: "A key at the top of each tab"): the Fields, Rolls, Items and Lists tabs each have a button at the end of their toolbar, What the ticks mean, and right under the toolbar a key that is put away in the page; a key names each tick of its tab\'s rows by the very words the row wears, in the row\'s own order, with one grey line each, twenty-three lines in all: ten for a field, two for a roll, two for an item and nine for a list; every line is plain words, with no bracket, dash or semicolon, ends in a full stop and is 90 characters at most; the rows are as they were, and the editor\'s page holds the tooltips it held and the four of the buttons; the module is loaded after the row\'s own',
        bad.length === 0 && lines === 23 && J(Object.keys(got).map(k => got[k].length)) === J([10, 2, 2, 9]) && count(sys, 'class="tool ghost sys-key-btn"') === 4 && count(sys, 'class="sys-key"') === 4 && ['sysAddField', 'sysAddRoll', 'sysAddItem', 'sysOpenLibrary', 'sysAddEffect', 'sysAddChar'].every(id => count(ix, ' id="' + id + '"') === 1)
        && tips === 36 && count(ix, '<script type="module" src="scripts/rowhide.js"></script>\n<script type="module" src="scripts/syskey.js"></script>\n') === 1, J([bad, lines, tips]));
    const load = () => { try { return new Function(kSlice + '\nreturn { KEYS: KEYS, keysRead: keysRead, keysKeep: keysKeep, keyPress: keyPress, keysApply: keysApply };')(); } catch (e) { return { err: String(e) }; } };
    const T = load(); let err = T.err || '', kept = '', did = '';
    if (!err) try {
        const mkS = v => { const log = []; return { log, getItem: k => { log.push('get ' + k); if (v === 'throw') throw new Error('x'); return v; }, setItem: (k, x) => { if (v === 'throw') throw new Error('x'); log.push('set ' + k + '=' + x); } }; };
        const s1 = mkS('{"fields":1,"rolls":0,"items":true,"lists":"1","other":1,"__proto__":{"rolls":1}}'), s2 = mkS(null);
        kept = J([T.keysRead(s1), s1.log, T.keysRead(s2), T.keysRead(mkS('[1]')), T.keysRead(mkS('"fields"')), T.keysRead(mkS('null')), T.keysRead(mkS('not json')), T.keysRead(mkS('throw')),
            T.keysKeep(s2, { fields: 1, rolls: 0, lists: true, other: 1, items: 1 }), T.keysKeep(s2, null), s2.log.slice(1), T.keysKeep(mkS('throw'), { fields: 1 }), J(T.KEYS)]);
        const o0 = { fields: 1 }, p1 = T.keyPress(o0, 'rolls'), p2 = T.keyPress(p1, 'fields'), p3 = T.keyPress(p2, 'other'), p4 = T.keyPress(null, 'lists'), p5 = T.keyPress({ fields: true, rolls: 1, x: 1 }, 'toString'), p6 = T.keyPress(p2, '__proto__');
        const mk = k => ({ k, attrs: { 'aria-controls': 'box_' + k }, getAttribute(a) { return this.attrs[a]; }, setAttribute(a, v) { this.attrs[a] = String(v); } }), btns = { fields: mk('fields'), rolls: mk('rolls'), lists: mk('lists') }, boxes = { box_fields: { hidden: true }, box_rolls: { hidden: true } };   // a page without the Items key, and a Lists button whose box is gone
        const doc = { querySelector: q => { const m = /^\.sys-key-btn\[data-key="([a-z]+)"\]$/.exec(q); return m && btns[m[1]] ? btns[m[1]] : null; }, getElementById: id => boxes[id] || null };
        const see = () => Object.keys(boxes).map(b => boxes[b].hidden).join(',') + '|' + Object.keys(btns).map(b => btns[b].attrs['aria-expanded'] || '-').join(',');
        const a1 = T.keysApply(doc, { fields: 1, lists: 1, items: 1 }), v1 = see(), a2 = T.keysApply(doc, { rolls: 1, fields: true }), v2 = see(), a3 = T.keysApply(doc, null), v3 = see();
        did = J([p1, p2, p3, p4, p5, p6, J(o0), p3 !== p2, a1, v1, a2, v2, a3, v3]);
    } catch (e) { err = String(e && e.stack || e); }
    check('which keys are open is this computer\'s own (keysRead, keysKeep, run for real): read from wp_sysKeys as the keys of the list that hold a 1 there, and nothing else the store names, a name a prototype holds least of all; a store that holds no object, no JSON or throws reads as no key open; kept as those keys alone, and a store that throws keeps nothing',
        !err && kept === J([{ fields: 1 }, ['get wp_sysKeys'], {}, {}, {}, {}, {}, {}, true, true, ['set wp_sysKeys={"fields":1,"items":1}', 'set wp_sysKeys={}'], false, J(['fields', 'rolls', 'items', 'lists'])]), err || kept);
    check('a press on a key\'s button and the keys written to the page (keyPress, keysApply, run for real): a press turns that key the other way and leaves the others, a name that is no key changes nothing, the state handed in is never changed and only a 1 counts as open; written, a key shows or is put away and its button says which to a screen reader; a page that lacks a key or its box draws the others',
        !err && did === J([{ fields: 1, rolls: 1 }, { rolls: 1 }, { rolls: 1 }, { lists: 1 }, { rolls: 1 }, { rolls: 1 }, J({ fields: 1 }), true, 1, 'false,true|true,false,-', 1, 'true,false|false,true,-', 0, 'true,true|false,false,-']), err || did);
    const helpKey = '<li><b>What the ticks mean:</b> the Fields, Rolls, Items and Lists tabs of the System editor each have a key. Press <b>What the ticks mean</b> at the top of the tab. It names each tick of a row with one line, and stays open until you close it.</li>\n';
    check('the keys\' wiring, look and words: one listener on the System editor for a press on a key\'s button, which turns the key, keeps the choice and writes it, and the kept keys are written at the start; the module writes no markup; the button stands at the end of its toolbar, so the column heads of the Fields tab stay over their columns, a key is a grid of a name and its line, and a key that is put away is not drawn; Help says where the keys are and what they do, right after the entry on opening the editor, and both release notes say it',
        kSlice.length > 900 && !/innerHTML|insertAdjacentHTML|outerHTML|document\.write/.test(kSrc) && !/[^\x00-\x7f]/.test(kSrc)
        && kSrc.includes("        var b = e.target && e.target.closest ? e.target.closest('.sys-key-btn') : null; if (!b) return;\n        open = keyPress(open, b.getAttribute('data-key')); keysKeep(localStorage, open); keysApply(document, open);\n    });\n    keysApply(document, open);")
        && kSrc.includes("var open = keysRead(localStorage);") && css.includes('\n  .sys-key-btn { margin-left: auto; white-space: nowrap; flex: none; }\n  .sys-key { display: grid; grid-template-columns: max-content 1fr;') && css.includes('\n  .sys-key[hidden] { display: none; }\n')
        && count(ix, helpKey) === 1 && /System<\/b>, to write the rules of the campaign on screen, with no code\.[^\n]*<\/li>\n\s*<li><b>What the ticks mean:<\/b>/.test(ix)
        && [rootRead('WHATSNEW.txt'), read('assets/whatsnew.txt')].every(t => count(t, "- The System editor has a key on its Fields, Rolls, Items and Lists\n  tabs. Press What the ticks mean to see what each tick of a row\n  does.\n") === 1));
}

/* ---------- 126c: Help's Coming up says what is built and what is coming ---------- */
// The owner, asked what the part should list as coming now that everything it named is built, ticked all four: "The map builder (Recommended),Text
// style in more places,Friends and direct invites,The website and cloud saves".
{
    const a = ix.indexOf('<div class="help-pane" data-pane="roadmap"'), z = ix.indexOf('<div class="help-pane"', a + 10), road = a > 0 && z > a ? ix.slice(a, z) : '', heads = (road.match(/<h4>[^<]+<\/h4>/g) || []).map(h => h.slice(4, -5));
    const comingAt = road.indexOf('<h4>Coming</h4>'), coming = comingAt > 0 ? road.slice(comingAt, road.indexOf('</ul>', comingAt)) : '', names = (coming.match(/<li><b>[^<]+<\/b>/g) || []).map(s => s.slice(7, -4));
    check('126c Help\'s Coming up, read against what is built: the part says first that the system builder is built and points to Character sheets and to Handbook in Help, where it spoke of the builder as a plan; then what is built of the item library, as before; then, under Coming, the four things the owner ticked and no other, in their order: the map builder, text style in more places, friends and direct invites, the website and cloud saves, each in plain words; nothing in the part names a date or says Still to come; both release notes say it',
        road.length > 1500 && J(heads) === J(['Where Waypoint is heading', 'Your own game system is built', 'Blasts thrown from the sheet', 'Coming', 'Campaign content'])
        && count(road, '<li><b>The system builder is built.</b> You write your game&rsquo;s rules, lay out its character sheets and fill its library inside Waypoint, with no code. See <b>Character sheets</b> in Help.</li>') === 1
        && count(road, 'See <b>Handbook</b> in Help.</li>') === 1 && count(ix, '<button data-help="sheets">&#128203; Character sheets</button>') === 1 && count(ix, '<button data-help="handbook">&#128214; Handbook</button>') === 1
        && J(names) === J(['The map builder.', 'Text style in more places.', 'Friends and direct invites.', 'The website and cloud saves.']) && (coming.match(/<li>/g) || []).length === 4
        && count(road, '<li>That much is built: see System &#9656; Items.</li>') === 1 && !/Still to come|planned or partly in place|not the final shape|20\d\d|next (week|month|year|release)|soon/i.test(road)
        && [rootRead('WHATSNEW.txt'), read('assets/whatsnew.txt')].every(t => count(t, "- Help's Coming up says what is built and what is coming: the map\n  builder, text style in more places, friends and direct invites, and\n  the website with cloud saves.\n") === 1), J([heads, names]));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
