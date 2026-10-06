/* Offline check of the look of the play map (backlog 107, 1.5.4).
   The owner, 2026-10-06, of every change to how the interface looks: "lets not remove functionality with these updates, that critical."
   So this suite holds an INVENTORY of the play map's controls as they stood before the look work began, and fails when one is gone or
   doubled: a control may move under a menu or a fold, and it is never dropped. It also holds what the owner passed for the toolbar:
   line icons for the tools ("Line icons, shown first", the sheet passed with "Use this set"), gold for the tool in hand ("Gold"), and
   their two words on the first mock-up: "also id like the music icon to stay a note" and "and the waypoint icon to be the icon we use
   today, not the compass" (an icon the app already has keeps its drawing).
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
    'drawOptBtn', 'eraserOptBtn', 'fillOptBtn', 'measureOptBtn', 'blastOptBtn', 'snapOptBtn', 'shapeOptBtn', 'addOptBtn', 'fogOptBtn', 'sceneOptBtn', 'viewOptBtn', 'gridOptBtn'];
// The choices inside the menus that have no id: found by the attribute their handler reads
const ROWS = { mode: ['grid', 'items', 'both'], straight: ['false', 'true'], tip: ['round', 'square', 'flat'], size: ['2', '3', '6', '10', '16'], emode: ['precise', 'segment'], unit: ['imperial', 'metric'],
    fgrid: ['square', 'hex'], fbrush: ['reveal', 'hide', 'clear'], fstroke: ['1', '3', '5', 'box', 'piece'], shapesize: ['free', 'cell'] };
const SWATCHES = ['#e9e9f0', '#1a1a1a', '#d9534f', '#e0a54f', '#5cb87a', '#4db3d3', '#b98cff'];
// The top bar's controls, held from now on for the part that follows the toolbar (the slim row): Import and Export among them, of which the
// owner said, of the row: "1 as long as we are not getting rid of import and export"
const HEADER = ['headerBrand', 'campaignSelect', 'tableWhere', 'searchCampBtn', 'newCampBtn', 'renameCampBtn', 'systemBtn', 'delCampBtn', 'viewModeSelect', 'mapBreadcrumb', 'tableWhereMap', 'clockChip', 'videoChip', 'saveAsBtn', 'saveAsMenu',
    'exportImgBtn', 'exportPdfBtn', 'exportHtmlBtn', 'exportMdBtn', 'exportItemBtn', 'exportMapsBtn', 'exportWbsBtn', 'exportPlannersBtn', 'exportDocsBtn', 'exportCampaignBtn', 'exportBtn', 'importBtn', 'fileIn', 'updateBtn', 'reviewChip',
    'netBtn', 'sessionPauseBtn', 'chatBtn', 'soundInd', 'musicInd', 'handoutsBtn', 'journalBtn', 'refreshBtn', 'settingsBtn', 'helpBtn', 'aboutBtn', 'saveNote'];
// Settings, Table: the three switches for what stands around a map, each with the word that says how it stands
const SETTINGS = ['setRulersBtn', 'setRulersState', 'setZoomCtlBtn', 'setZoomCtlState', 'setPointerPosBtn', 'setPointerPosState'];
const board = (() => { const a = ix.indexOf('<div id="wbFloatingToolbar"'), z = ix.indexOf('<div id="whiteboardWrap">'); return a > 0 && z > a ? ix.slice(a, z) : ''; })();
{
    const idN = id => count(ix, ' id="' + id + '"'), ALL = INVENTORY.concat(HEADER, SETTINGS);
    const gone = ALL.filter(id => idN(id) !== 1).map(id => id + ' x' + idN(id)), out = INVENTORY.filter(id => count(board, ' id="' + id + '"') !== 1);
    check('nothing is removed (the owner: "lets not remove functionality with these updates, that critical."): each of the ' + INVENTORY.length + ' controls of the play map\'s toolbar, its menus and what stands around the map is in the page exactly once and still around the map, and so is each of the ' + HEADER.length + ' of the top bar with Import and every kind of Export, and each of the ' + SETTINGS.length + ' of the three switches in Settings',
        board.length > 1000 && gone.length === 0 && out.length === 0 && INVENTORY.length === 162 && HEADER.length === 42 && SETTINGS.length === 6 && new Set(ALL).size === 210, J([gone, out]));
    const rowsBad = Object.keys(ROWS).filter(k => J((board.match(new RegExp('<button[^>]* data-' + k + '="([^"]*)"', 'g')) || []).map(m => m.slice(m.lastIndexOf('="') + 2, -1))) !== J(ROWS[k]));
    const sw = (board.match(/<button class="draw-swatch" data-color="(#[0-9a-f]{6})"/g) || []).map(m => m.slice(-8, -1));
    check('nothing is removed, the choices inside the menus: Snap\'s three modes, the pen\'s two styles, three tips and five sizes, the eraser\'s two modes, the two measuring systems, the fog\'s two gridless grids, three brushes and five strokes, the two shape sizes, each in its order, and the seven colours of the pen and of the fill with a custom colour for each',
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
const SET_HASH = '18f4747341c4c132a143e37b0b92ded6f24e0fe301638ec846f364402971e5ec';   // the set as the owner passed it on the icon sheet, 2026-10-06
// The buttons that stand on the bar and in the column today: an icon alone. Clear board is a row of More's menu now, an icon and its name
const BAR = ['wbUndoBtn', 'wbRedoBtn', 'moveModeBtn', 'panModeBtn', 'drawModeBtn', 'eraserModeBtn', 'fillModeBtn', 'shapeMenuBtn', 'addMenuBtn', 'measureModeBtn', 'blastModeBtn', 'fogModeBtn', 'sceneFxBtn', 'pagesBtn', 'wbMoreBtn', 'wbCenterBtn',
    'wbGridBtn', 'wbSnapBtn'];
const ROWS_NOW = MENU.concat(['id="clearWbBtn"', 'id="wbRulersBtn"', 'id="wbZoomCtlBtn"', 'id="wbPointerPosBtn"']);
const DOTS = '<path d="M12 5h.01M12 12h.01M12 19h.01"/>', TICK = '<path d="M5 12.5l4.5 4.5L19 7.5"/>', MINUS = '<path d="M5 12h14"/>';
{
    const bar = BAR.map(id => [id, innerOfBtn('id="' + id + '"')]), menu = ROWS_NOW.map(h => [h, innerOfBtn(h)]);
    const noIcon = bar.filter(b => typeof b[1] !== 'string' || !SVG_RE.test(b[1]) || !/<\/svg>$/.test(b[1].replace(/<span class="draw-color-indicator" id="(draw|fill)ColorIndicator"><\/span>$/, ''))).map(b => b[0]);
    const glyph = bar.concat(menu).filter(b => typeof b[1] === 'string' && /&#\d+;/.test(b[1].replace('&middot;', ''))).map(b => b[0]);
    const noIconM = menu.filter(b => typeof b[1] !== 'string' || !b[1].includes('<svg class="ico')).map(b => b[0]);
    check('the play map\'s tools wear line icons (the owner: "Line icons, shown first"): each of the eighteen buttons of the bar and of the column is the app\'s own kind of icon and nothing else, an <svg class="ico"> on the 24 by 24 grid, each of the thirty-four menu rows that wore a picture glyph holds one, so do Clear board and the three ticks, and none of them holds a picture glyph any more',
        noIcon.length === 0 && noIconM.length === 0 && glyph.length === 0 && BAR.length === 18 && new Set(BAR).size === 18 && ROWS_NOW.length === 38, J([noIcon, noIconM, glyph]));
    const passed = PASSED_BAR.map(id => [id, innerOfBtn('id="' + id + '"')]).concat(MENU.map(h => [h, innerOfBtn(h)]));
    const set = passed.map(b => b[0] + '=' + svgIn(b[1])).join('\n'), h = crypto.createHash('sha256').update(set).digest('hex');
    check('the icons are the set the owner passed on the icon sheet ("Use this set"), drawing for drawing, wherever the layout has put their buttons: a changed or a new drawing is shown to the owner first, and this pin moves only then',
        h === SET_HASH && PASSED_BAR.length === 18 && MENU.length === 34, h);
    check('the drawings the layout added are the sheet\'s own or the simplest there is: More wears the sheet\'s three dots, a tick of the View menu is the tick Snap\'s Both wears, and the zoom box\'s minus is the plus without its upright',
        draw('wbMoreBtn') === DOTS && innerOfBtn('id="wbMoreBtn"').indexOf('<svg class="ico ico-dots"') === 0 && css.includes('    .ico.ico-dots { stroke-width: 2.6; }')
        && ['wbRulersBtn', 'wbZoomCtlBtn', 'wbPointerPosBtn'].every(id => draw(id) === TICK) && svgIn(innerOfBtn('data-mode="both"')) === TICK
        && draw('zoomOutBtn') === MINUS && draw('zoomInBtn') === '<path d="M12 5v14M5 12h14"/>' && draw('zoomInBtn').includes(MINUS.slice(9, -3)), J([draw('wbMoreBtn'), draw('wbRulersBtn'), draw('zoomOutBtn'), draw('zoomInBtn')]));
    // left as they are, on purpose: a pen tip IS its shape, and Snap's switch row has its words written by the script
    check('left as they were, on purpose: the pen\'s three tips are their own shapes, and Snap\'s switch row keeps the words its script writes',
        innerOfBtn('data-tip="round"') === '&#9679; Round' && innerOfBtn('data-tip="square"') === '&#9632; Square' && innerOfBtn('data-tip="flat"') === '&#9698; Flat' && innerOfBtn('id="snapOffBtn"') === '&#9211; Turn snapping off');
    // every drawing is a plain path (or, for the note, a path and two circles): nothing else can stand in an icon
    const zoomIcons = ['zoomOutBtn', 'zoomInBtn'].map(id => [id, innerOfBtn('id="' + id + '"')]);
    const odd = bar.concat(menu, zoomIcons).filter(b => { const s = svgIn(b[1]); return typeof s !== 'string' || !/^<path d="[MmLlHhVvAaCcSsZz0-9 .,-]+"\/>(<circle cx="\d+" cy="\d+" r="\d+"\/>){0,2}$/.test(s); }).map(b => b[0]);
    check('an icon is a path of plain drawing commands, and for the music note a path and two circles: no script, no link, no picture and no style can stand in one', odd.length === 0, J(odd));
}

/* ---------- an icon the app already has keeps its drawing ---------- */
const hdr = id => { const at = ix.indexOf(' id="' + id + '"'); if (at < 0) return null; const a = ix.indexOf('<svg class="ico"', at), gt = ix.indexOf('>', a), z = ix.indexOf('</svg>', gt); return a < 0 || a - at > 600 ? null : ix.slice(gt + 1, z); };
{
    const note = svgIn(innerOfBtn('id="musicBtn"'));
    check('the music icon stays a note (the owner: "also id like the music icon to stay a note"): Music under Scene wears the very note of the top bar\'s music button, a stem with its beam and two filled heads, and the style sheet fills the heads on both',
        typeof note === 'string' && note === hdr('musicInd') && note === '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>' && innerOfBtn('id="musicBtn"').includes('<svg class="ico ico-note"')
        && css.includes('    .ico.ico-note circle { fill: currentColor; stroke: none; }') && css.includes('  #musicInd .ico circle { fill: currentColor; stroke: none; }'), J([note, hdr('musicInd')]));
    check('the other icons the app already had are the same drawings where the toolbar uses them: Sound under Scene is the top bar\'s speaker, Add is its plus, Clear board is its bin, and the fog\'s Clear brush is the close mark',
        svgIn(innerOfBtn('id="soundBtn"')) === hdr('soundInd') && svgIn(innerOfBtn('id="addMenuBtn"')) === hdr('newCampBtn') && svgIn(innerOfBtn('id="clearWbBtn"')) === hdr('delCampBtn') && svgIn(innerOfBtn('data-fbrush="clear"')) === hdr('docReaderClose')
        && [hdr('soundInd'), hdr('newCampBtn'), hdr('delCampBtn'), hdr('docReaderClose')].every(s => typeof s === 'string' && s.length > 10));
    check('the Waypoint mark is the icon the app uses today (the owner: "and the waypoint icon to be the icon we use today, not the compass"): the top bar\'s mark is the app\'s own icon file, shown as a picture, and the file is there',
        count(ix, '<img src="icon.ico" alt="" class="brand-icon">') === 1 && /<div class="header-brand" id="headerBrand"[^>]*>\n\s*<img src="icon\.ico" alt="" class="brand-icon">\n\s*<h1>Waypoint<\/h1>/.test(ix)
        && fs.existsSync(path.join(app, 'icon.ico')) && fs.statSync(path.join(app, 'icon.ico')).size > 1000);
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
    check('the bar is laid out as the owner passed it ("As drawn"): undo and redo, then select and pan, then pen, eraser and fill, then shapes and Add, then measure and blast, then fog, Scene and Pages, then More, with a separator between the groups and none at either end',
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
const GM_HAS = { wbUndoBtn: 1, wbRedoBtn: 1, fillModeBtn: 1, shapeMenuBtn: 1, addMenuBtn: 1, blastModeBtn: 1, fogModeBtn: 1, sceneFxBtn: 1, pagesBtn: 1, wbMoreBtn: 1 };   // what a player's bar does not show (and no separator)
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
    bar.w = () => bar.cls.has('tb-wrap') ? -1 : bar.cls.has('tb-tight') ? tight : (player ? 258 : 848);
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
        ['measureModeBtn', 'measureOptBtn', 'measureMenu', 'Measure options'], ['blastModeBtn', 'blastOptBtn', 'blastMenu', 'Blast options'], ['wbSnapBtn', 'snapOptBtn', 'snapMenu', 'Snap options']];
    const MENUS = [['shapeMenuBtn', 'shapeOptBtn', 'shapeMenu', 'Shapes menu'], ['addMenuBtn', 'addOptBtn', 'addMenu', 'Add menu'], ['fogModeBtn', 'fogOptBtn', 'fogMenu', 'Fog of war menu'], ['sceneFxBtn', 'sceneOptBtn', 'sceneFxMenu', 'Scene menu'],
        ['wbCenterBtn', 'viewOptBtn', 'wbCenterMenu', 'View menu'], ['wbGridBtn', 'gridOptBtn', 'gridMenu', 'Grid menu']];
    const pairOf = id => barKids.concat(edgeKids).filter(k => k.ids[0] === id)[0] || null;
    const arrow = (cid, title, forId) => '<button class="wb-tool-btn tool-chev" id="' + cid + '"' + (forId ? ' data-for="' + forId + '"' : '') + ' title="' + title + '" aria-haspopup="true">' + SVG + CHEV_D + '</svg></button>';
    const bad = TOOLS.map(t => [t, '']).concat(MENUS.map(t => [t, t[0]])).filter(p => { const t = p[0], k = pairOf(t[0]);
        return !k || J(k.ids.filter(id => !/Indicator$/.test(id)).slice(0, 3)) !== J([t[0], t[1], t[2]]) || !/^<div (class="tool-pair" style="position:relative;[^"]*"|style="position:relative;[^"]*" class="tool-pair gm-only")>$/.test(k.open)
            || count(k.text, '</button>' + arrow(t[1], t[3], p[1]) + '\n') !== 1; }).map(p => p[0][0]);
    const plain = ['wbUndoBtn', 'wbRedoBtn', 'moveModeBtn', 'panModeBtn', 'pagesBtn', 'wbMoreBtn'].filter(id => { const k = pairOf(id); return !k || /tool-pair|tool-chev/.test(k.text); });
    check('a tool that has options is a pair (the owner: "Chevron opens them"): the pen, the eraser, fill, measure, blast and Snap each stand in a pair with a small arrow right after the icon, the arrow the passed sheet drew for "a tool has options", named for the options it opens; a button that only opens a menu is the same pair, and its arrow names the button it presses; undo, redo, select, pan, Pages and More have no arrow, having nothing to open beside themselves',
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
    check('a toolbar menu lists each choice by its name (the owner: "the options need to be more obvious for what something does"): Grid, Shapes, Add, Scene and More each read as a list of rows in their order, a row its icon, its name, and a grey line where the name is not enough; every row keeps its id and the tooltip it had; Shapes keeps New shape size and New item opacity under its rows',
        off.length === 0 && noIcon.length === 0 && count(ix, 'class="wb-tool-btn menu-row') === 19, J([off, noIcon]));
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
    // the bar, and with Measure and Blast not shown too two separators stand in a row
    const H = toolbarPage(false), SH = runBar(H, {}), hs = H.bar.children.filter(k => k.is('.wb-tool-sep')), BG = (SH.api || {}).barGroups || (() => null);
    H.byId.wbUndoBtn.w = 0; H.byId.wbRedoBtn.w = 0; const g1 = BG(H.bar);
    H.byId.measureModeBtn.parentElement.w = 0; H.byId.blastModeBtn.parentElement.w = 0; const g2 = BG(H.bar);
    H.bar.children.forEach(k => { k.w = 0; }); const g3 = BG(H.bar);
    check('a group is what shows between two separators (barGroups, run for real): a separator that leads the bar parts nothing, nor does one that follows another, so a row of a wrapped bar always ends at the separator after its last group; a bar that shows nothing has no groups',
        !!g1 && J(g1.widths) === J([66, 127, 84, 84, 118, 32]) && g1.seps.length === 5 && g1.seps.every((s, i) => s === hs[i + 1])
        && !!g2 && J(g2.widths) === J([66, 127, 84, 118, 32]) && J(g2.seps.map(s => hs.indexOf(s))) === J([1, 2, 3, 5]) && g3 === null, J([g1 && g1.widths, g2 && [g2.widths, g2.seps.map(s => hs.indexOf(s))], g3]));
    const Q = toolbarPage(true), S = runBar(Q, {}), fitQ = (S.api || {}).fitBar || (() => {}), qs =() => [[...Q.bar.cls].filter(c => c !== 'floating-toolbar').sort().join(' '), Q.bar.style.width || '', Q.bar.children.filter(k => k.cls.has('tb-brk')).length];
    const gq = S.api ? S.api.barGroups((Q.bar.classList.add('tb-tight'), Q.bar)) : null; Q.bar.classList.remove('tb-tight');
    const qat = w => { Q.main.clientWidth = w; fitQ(); return qs(); }, gotQ = [qat(400), qat(281), qat(229), qat(228), qat(120)];
    check('a player\'s bar is fitted too: it has fewer buttons and no separator, so it is one group, counted by what shows alone; it tightens like the GM\'s, and where even the tight bar is too wide it wraps wherever it must, with no row marked and no width set',
        Q.tight === 205 && J(gq && [gq.widths, gq.gap, gq.chrome, gq.seps.length]) === J([[195], 0, 10, 0]) && J(gotQ) === J([['', '', 0], ['tb-tight', '', 0], ['tb-tight', '', 0], ['tb-tight tb-wrap', '', 0], ['tb-tight tb-wrap', '', 0]]), S.err || J([gq, gotQ]));
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
        + '              <button class="zoom-btn" id="zoomInBtn" title="Zoom In">' + SVG + '<path d="M12 5v14M5 12h14"/></svg></button>\n'
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
        && count(css, 'no-zoomctl') === 4 && count(css, 'no-pointerpos') === 4 && count(ix, 'no-zoomctl') + count(ix, 'no-pointerpos') === 0
        && css.includes('body.stream-mode #dataFloatingToolbar, body.stream-mode #zoomBox,') && mainSrc.includes("      document.getElementById('zoomBox').style.display = isPlanner ? 'none' : 'flex';\n"), J([count(css, HIDE), count(css, 'no-zoomctl'), count(css, 'no-pointerpos')]));
}

/* ---------- said, and run on CI ---------- */
{
    const NOTE = "The play map\n"
        + "- The play map's toolbar has new icons, drawn as lines in the style of\n  the top bar's. The tool in your hand is gold, and so is a setting\n  that is on.\n"
        + "- The toolbar is laid out anew, and no tool is gone. Undo and redo\n  lead, then the tools in groups. Centre, the grid and snap stand in a\n  column at the map's right edge. More, the last button, holds Clear\n  board. In a narrow window the bar tightens, then wraps into even\n  rows, so no tool is ever cut off.\n"
        + "- A tool that has options has a small arrow beside its icon. The icon\n  takes the tool, and a second press puts it away. The arrow opens the\n  tool's options, and they stay up while you work, until you press the\n  arrow again or take another tool. Snap's icon switches snapping, and\n  its arrow opens what it snaps to.\n"
        + "- The toolbar's menus list each choice by name: Grid, Shapes, Add,\n  Scene and More. A grey line under a name says what the choice does\n  where the name is not enough, and the Grid menu marks the grid in\n  use.\n"
        + "- The box at the top right of a map wears the toolbar's look. Its\n  pointer location and its zoom buttons can each be hidden on their\n  own. Tick them under Show in the centre menu, or press their buttons\n  in Settings > Table. The rulers have a tick there too.\n\n";
    const wn = [rootRead('WHATSNEW.txt'), read('assets/whatsnew.txt')];
    check('both release notes carry the same lines, and the suite is one of the CI runs',
        wn.every(t => count(t, NOTE) === 1 && count(t, 'Every button is where it was') === 0) && rootRead('.github/workflows/checks.yml').includes("      - name: lookcheck — the look of the play map (no control removed, the toolbar's line icons, gold for the tool in hand)\n        if: ${{ !cancelled() }}\n        run: node tools/lookcheck.js\n"));
    check('Help and the tour say where things went: Help\'s Toolbar groups names the column, what the centre menu shows and hides, More and the bar in a narrow window; Help\'s entry on the rulers has the box at the top right and its two switches; the grids entry sends you to the right edge; and the tour\'s step on the play map\'s tools reads the bar in its new order',
        count(ix, 'Centre, the grid and snap stand in a column at the map&rsquo;s right edge. The centre menu also shows or hides the rulers, the zoom buttons and the pointer location. <b>More</b>, the last button, holds Clear board. In a narrow window the bar tightens, then wraps onto a second row, so no tool is ever cut off.') === 1
        && count(ix, '<p>The box at the top right of a map holds the <b>pointer location</b> and the <b>zoom buttons</b>. Each can be hidden on its own. Press <b>Toggle Pointer Location</b> or <b>Toggle Zoom Buttons</b> in <b>&#9881; Settings &#9656; Table</b>, or tick them in the centre menu at the right edge of the play map. The mouse wheel still zooms while the buttons are hidden. Both choices are yours alone, on this computer.</p>') === 1
        && count(ix, '<li>Click the grid button at the right edge of the play map and pick <b>Off, Square or Hex</b>.') === 1
        && count(tourSrc, 'From the left: undo and redo for this map, then move and pan, the pen, eraser and fill. Next come shapes and <b>+ Add</b> for text and pictures, then <b>measure</b>, <b>blast</b>, fog and &#127916; <b>Scene</b>. Centre, the <b>grid</b> and <b>snap</b> stand at the map&rsquo;s right edge.') === 1
        && count(tourSrc, "'#wbFloatingToolbar .shape-menu.show, #wbEdgeTools .shape-menu.show'") === 2 && count(ix, 'the minimap fold, rulers, the zoom buttons, the pointer location, panel sizes,') === 1);
    check('Help says how a press works now: a tip of its own on tool options (the small arrow, the icon, a second press, options that stay up), the Snap entry and the Measure entry in the new words, and the four tools\' own tooltips say what a press does',
        count(ix, '<div class="help-tip"><b>Tool options:</b> a tool that has options has a <b>small arrow</b> beside its icon. The icon takes the tool, and a second press puts it away. The arrow opens the tool&rsquo;s options. They stay up while you work, until you press the arrow again or take another tool. The pen, the eraser, fill, measure and blast work this way. A button that only opens a menu has the same small arrow, and either of the two opens the menu.</div>') === 1
        && count(ix, '<b>Snap To</b> picks what a drag aligns to. The Snap button switches snapping on and off, and the small arrow beside it opens Snap To.') === 1
        && count(ix, 'drag across the map to place a ruler. Press the small arrow beside the tool for its options.</li>') === 1
        && count(ix, ' id="drawModeBtn" title="Pen. Press again to put it away.">') === 1 && count(ix, ' id="eraserModeBtn" title="Eraser. Click or drag over strokes to erase them. Press again to put it away.">') === 1
        && count(ix, ' id="measureModeBtn" title="Measure. Drag to place a ruler. Press again to put it away.">') === 1
        && count(ix, ' id="fillModeBtn" title="Fill. Click or drag grid cells to fill them with a color: a hexagon on hex maps, a square on square maps. Right-click a cell to clear it. Press again to put it away.">') === 1);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
