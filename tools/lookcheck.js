/* Offline check of the look of the play map (backlog 107, 1.5.4).
   The owner, 2026-10-06, of every change to how the interface looks: "lets not remove functionality with these updates, that critical."
   So this suite holds an INVENTORY of the play map's controls as they stood before the look work began, and fails when one is gone or
   doubled: a control may move under a menu or a fold, and it is never dropped. It also holds what the owner passed for the toolbar:
   line icons for the tools ("Line icons, shown first", the sheet passed with "Use this set"), gold for the tool in hand ("Gold"), and
   their two words on the first mock-up: "also id like the music icon to stay a note" and "and the waypoint icon to be the icon we use
   today, not the compass" (an icon the app already has keeps its drawing). The page and the style sheet are read as text. No browser.
   Usage: node tools/lookcheck.js */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const app = path.join(__dirname, '..', 'system', 'app'), root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const rootRead = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const J = JSON.stringify, count = (s, f) => s.split(f).length - 1;
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 900) : ''); } }

const ix = read('index.html'), css = read('style.css');

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
    'wbStubNote', 'zoomBox', 'cursorPos', 'zoomOutBtn', 'zoomLbl', 'zoomInBtn', 'toggleLeftBtn', 'toggleRightBtn', 'minimap', 'minimapCanvas', 'minimapToggle'];
// The choices inside the menus that have no id: found by the attribute their handler reads
const ROWS = { mode: ['grid', 'items', 'both'], straight: ['false', 'true'], tip: ['round', 'square', 'flat'], size: ['2', '3', '6', '10', '16'], emode: ['precise', 'segment'], unit: ['imperial', 'metric'],
    fgrid: ['square', 'hex'], fbrush: ['reveal', 'hide', 'clear'], fstroke: ['1', '3', '5', 'box', 'piece'], shapesize: ['free', 'cell'] };
const SWATCHES = ['#e9e9f0', '#1a1a1a', '#d9534f', '#e0a54f', '#5cb87a', '#4db3d3', '#b98cff'];
// The top bar's controls, held from now on for the part that follows the toolbar (the slim row): Import and Export among them, of which the
// owner said, of the row: "1 as long as we are not getting rid of import and export"
const HEADER = ['headerBrand', 'campaignSelect', 'tableWhere', 'searchCampBtn', 'newCampBtn', 'renameCampBtn', 'systemBtn', 'delCampBtn', 'viewModeSelect', 'mapBreadcrumb', 'tableWhereMap', 'clockChip', 'videoChip', 'saveAsBtn', 'saveAsMenu',
    'exportImgBtn', 'exportPdfBtn', 'exportHtmlBtn', 'exportMdBtn', 'exportItemBtn', 'exportMapsBtn', 'exportWbsBtn', 'exportPlannersBtn', 'exportDocsBtn', 'exportCampaignBtn', 'exportBtn', 'importBtn', 'fileIn', 'updateBtn', 'reviewChip',
    'netBtn', 'sessionPauseBtn', 'chatBtn', 'soundInd', 'musicInd', 'handoutsBtn', 'journalBtn', 'refreshBtn', 'settingsBtn', 'helpBtn', 'aboutBtn', 'saveNote'];
const board = (() => { const a = ix.indexOf('<div id="wbFloatingToolbar"'), z = ix.indexOf('<div id="whiteboardWrap">'); return a > 0 && z > a ? ix.slice(a, z) : ''; })();
{
    const idN = id => count(ix, ' id="' + id + '"');
    const gone = INVENTORY.concat(HEADER).filter(id => idN(id) !== 1).map(id => id + ' x' + idN(id));
    check('nothing is removed (the owner: "lets not remove functionality with these updates, that critical."): each of the ' + INVENTORY.length + ' controls of the play map\'s toolbar, its menus and what stands around the map, and each of the ' + HEADER.length + ' of the top bar with Import and every kind of Export, is in the page exactly once',
        board.length > 1000 && gone.length === 0 && INVENTORY.length === 144 && HEADER.length === 42 && new Set(INVENTORY.concat(HEADER)).size === 186, J(gone));
    const rowsBad = Object.keys(ROWS).filter(k => J((board.match(new RegExp('<button[^>]* data-' + k + '="([^"]*)"', 'g')) || []).map(m => m.slice(m.lastIndexOf('="') + 2, -1))) !== J(ROWS[k]));
    const sw = (board.match(/<button class="draw-swatch" data-color="(#[0-9a-f]{6})"/g) || []).map(m => m.slice(-8, -1));
    check('nothing is removed, the choices inside the menus: Snap\'s three modes, the pen\'s two styles, three tips and five sizes, the eraser\'s two modes, the two measuring systems, the fog\'s two gridless grids, three brushes and five strokes, the two shape sizes, each in its order, and the seven colours of the pen and of the fill with a custom colour for each',
        rowsBad.length === 0 && J(sw) === J(SWATCHES.concat(SWATCHES)) && count(board, 'id="drawColorInput"') === 1 && count(board, 'id="fillColorInput"') === 1, J([rowsBad, sw]));
}

/* ---------- the toolbar's icons: the app's own line icons, the set the owner passed ---------- */
const innerOfBtn = how => { const at = board.indexOf(how); if (at < 0 || board.indexOf(how, at + 1) >= 0) return null; const gt = board.indexOf('>', at), end = board.indexOf('</button>', gt); return gt < 0 || end < 0 ? null : board.slice(gt + 1, end); };
const SVG = '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">';
const svgIn = s => { if (typeof s !== 'string') return null; const a = s.indexOf('<svg class="ico'), gt = s.indexOf('>', a), z = s.indexOf('</svg>', gt); return a < 0 || z < 0 ? null : s.slice(gt + 1, z); };
// the eighteen buttons of the bar, then the menu rows that wore a picture glyph
const BAR = ['wbCenterBtn', 'wbUndoBtn', 'wbRedoBtn', 'wbGridBtn', 'wbSnapBtn', 'moveModeBtn', 'panModeBtn', 'drawModeBtn', 'eraserModeBtn', 'fillModeBtn', 'measureModeBtn', 'blastModeBtn', 'fogModeBtn', 'sceneFxBtn', 'pagesBtn', 'shapeMenuBtn',
    'addMenuBtn', 'clearWbBtn'];
const MENU = ['id="gridSqBtn"', 'id="gridHexBtn"', 'id="gridOpacityBtn"', 'data-mode="grid"', 'data-mode="items"', 'data-mode="both"', 'data-straight="false"', 'data-straight="true"', 'data-emode="precise"', 'data-emode="segment"',
    'id="blastUndoThrow"', 'id="fogOnAllMaps"', 'id="fogLightPlace"', 'data-fbrush="reveal"', 'data-fbrush="hide"', 'data-fbrush="clear"', 'data-fstroke="box"', 'data-fstroke="piece"', 'id="soundBtn"', 'id="musicBtn"', 'id="fxBtn"', 'id="videoBtn"',
    'id="shapeRectBtn"', 'id="shapeCircBtn"', 'id="shapeDiaBtn"', 'id="shapeHexBtn"', 'id="shapeTriggerBtn"', 'id="shapeHexTriggerBtn"', 'data-shapesize="free"', 'data-shapesize="cell"', 'id="shapeTextBtn"', 'id="addImageBtn"', 'id="imgLibBtn"',
    'id="importCharBtn"'];
const SET_HASH = '18f4747341c4c132a143e37b0b92ded6f24e0fe301638ec846f364402971e5ec';   // the set as the owner passed it on the icon sheet, 2026-10-06
{
    const bar = BAR.map(id => [id, innerOfBtn('id="' + id + '"')]), menu = MENU.map(h => [h, innerOfBtn(h)]);
    const noIcon = bar.filter(b => typeof b[1] !== 'string' || b[1].indexOf(SVG) !== 0).map(b => b[0]), glyph = bar.concat(menu).filter(b => typeof b[1] === 'string' && /&#\d+;/.test(b[1].replace('&middot;', ''))).map(b => b[0]);
    const noIconM = menu.filter(b => typeof b[1] !== 'string' || !b[1].includes('<svg class="ico')).map(b => b[0]);
    check('the play map\'s tools wear line icons (the owner: "Line icons, shown first"): each of the eighteen buttons of the bar begins with the app\'s own kind of icon, an <svg class="ico"> on the 24 by 24 grid, each of the thirty-four menu rows that wore a picture glyph holds one, and none of them holds a picture glyph any more',
        noIcon.length === 0 && noIconM.length === 0 && glyph.length === 0 && BAR.length === 18 && MENU.length === 34, J([noIcon, noIconM, glyph]));
    const set = bar.concat(menu).map(b => b[0] + '=' + svgIn(b[1])).join('\n'), h = crypto.createHash('sha256').update(set).digest('hex');
    check('the icons are the set the owner passed on the icon sheet ("Use this set"), drawing for drawing: a changed or a new drawing is shown to the owner first, and this pin moves only then',
        h === SET_HASH, h);
    // left as they are, on purpose: a pen tip IS its shape, and Snap's switch row has its words written by the script
    check('left as they were, on purpose: the pen\'s three tips are their own shapes, and Snap\'s switch row keeps the words its script writes',
        innerOfBtn('data-tip="round"') === '&#9679; Round' && innerOfBtn('data-tip="square"') === '&#9632; Square' && innerOfBtn('data-tip="flat"') === '&#9698; Flat' && innerOfBtn('id="snapOffBtn"') === '&#9211; Turn snapping off');
    // every drawing is a plain path (or, for the note, a path and two circles): nothing else can stand in an icon
    const odd = bar.concat(menu).filter(b => { const s = svgIn(b[1]); return typeof s !== 'string' || !/^<path d="[MmLlHhVvAaCcSsZz0-9 .,-]+"\/>(<circle cx="\d+" cy="\d+" r="\d+"\/>){0,2}$/.test(s); }).map(b => b[0]);
    check('an icon is a path of plain drawing commands, and for the music note a path and two circles: no script, no link, no picture and no style can stand in one', odd.length === 0, J(odd));
}

/* ---------- an icon the app already has keeps its drawing ---------- */
{
    const hdr = id => { const at = ix.indexOf(' id="' + id + '"'); if (at < 0) return null; const a = ix.indexOf('<svg class="ico"', at), gt = ix.indexOf('>', a), z = ix.indexOf('</svg>', gt); return a < 0 || a - at > 600 ? null : ix.slice(gt + 1, z); };
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

/* ---------- said, and run on CI ---------- */
{
    const NOTE = "- The play map's toolbar has new icons, drawn as lines in the style of\n  the top bar's. The tool in your hand is gold, and so is a setting\n  that is on. Every button is where it was and does what it did.\n";
    const wn = [rootRead('WHATSNEW.txt'), read('assets/whatsnew.txt')];
    check('both release notes carry the same lines, and the suite is one of the CI runs',
        wn.every(t => count(t, NOTE) === 1) && rootRead('.github/workflows/checks.yml').includes("      - name: lookcheck — the look of the play map (no control removed, the toolbar's line icons, gold for the tool in hand)\n        if: ${{ !cancelled() }}\n        run: node tools/lookcheck.js\n"));
}

console.log('\n' + pass + ' passed, ' + fail + ' failed.');
if (fail) process.exit(1);
