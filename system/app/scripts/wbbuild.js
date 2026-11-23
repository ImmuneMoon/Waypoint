/* wbbuild.js: a part of whiteboard.js (docs/REFACTOR_SPLIT_PLAN.md, area 4, the map builder; split 2026-11-18 with no change in behavior).
   What it holds: the Build tool, the GM's alone ([buildcheck:buildtool-*]: its options, materials, shapes, tabs and Looks list, laying
   pieces through buildcore, doorCut, and the structure lock's row and auto lock in [buildcheck:structwb-*]); placing a portal to a new
   room's map ([roomcheck:portalplace-*]); and the GM's right-click rows of the map builder ([buildcheck:wallsrow-*]: Walls around
   selection, Flatten and Unflatten, Make a room for this in [roomcheck:pieceroom-*], Place it and a room's name on its place in
   [roomcheck:roomplace-*], Open the container's row, and Show on the Data Map). The three generators' dialogs live in wbgen.js.
   Why it looks this way: these lines stood in whiteboard.js, and they still run exactly where they stood. whiteboard.js calls wbBuild()
   at its line `// [split:wbbuild.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads
   whiteboard.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of
   whiteboard.js (live, so a value whiteboard.js changes later is read as it is then); the last line hands back the names whiteboard.js
   uses of it. Neither side may assign the other's names (tools/splitcheck.js holds it). Change the code here as if it still stood in
   whiteboard.js. */
// [split:of whiteboard.js]
import { armPlacement, cellSnap, closeDrawMenu, disarmPlacement, getActiveCampaign, getActiveMap, newOpacityProps, playerScreen, render, save, showConfirm, state, texListKeys, texListPick, texOptionsInto, texTileOf, tileRowSync, tileRowWire, toast, uid, updateWbToolbar, wb, wbWrap, wbX, wbY, wireTool, withAlpha } from './whiteboard.js';   // [split:glue]
export function wbBuild() {   // [split:glue]
// [split:body-start]
// [buildcheck:buildtool-start]
// The map builder (fold B1c, backlog 23): the Build tool, the GM's alone. A tool with options, wired like every other (wireTool): its icon
// takes it, its small arrow opens its options, and it stays in hand until Esc or another tool. A built piece is an ordinary board item with
// today's keys (buildcore pieceProps) and one more, texture. On a square grid it lands on the lattice whatever Snap says, on a hex grid one
// hexagon a cell, and with no grid as Snap says. A Wall line is drawn by the pen under Build's preset (window.wpPenPreset): Build stays the
// tool in hand while the pen's own code draws the line. The options are the sheet the owner passed on 2026-10-10: materials by name, a row
// each, the shapes as one row of chips, then Texture and Color, and only for Water its Difficult terrain tick, only for a Corridor its width.
var BUILD_MAX = 6000;   // a map's copy holds this many pieces for players (net.js): a gesture past it lays nothing more
var BUILD_SHAPES = ['rect', 'circle', 'poly', 'corridor', 'line'];
var BUILD_LINES = { floor: 'Flagstones. Tokens walk on it.', wall: 'Blocks sight and gives cover.', door: 'A wall that opens. Players can open it.', water: 'Difficult terrain, counted double.', rubble: 'Gives cover. Tokens can cross it.', wood: 'Planks.', grass: '', street: 'Cobbles. Tokens walk on it.', building: 'A roof. Blocks sight and stops tokens.', citywall: 'Stone. Blocks sight and stops tokens.', factory: 'Tread plate. Tokens walk on it.', concrete: 'Slabs. Tokens walk on it.', tile: 'Tokens walk on it.', carpet: 'Tokens walk on it.', deck: 'Deck plate. Tokens walk on it.', grating: 'Tokens walk on it.', walkway: 'A lit grid. Tokens walk on it.', brickwall: 'Blocks sight and gives cover.', blockwall: 'Blocks sight and gives cover.', bulkhead: 'Blocks sight and gives cover.', ironwall: 'Blocks sight and gives cover.', irondoor: 'A wall that opens. Players can open it.', hatch: 'A wall that opens. Players can open it.', glass: 'Stops tokens. You can see through it.', chainlink: 'Stops tokens. You can see through it.', forcefield: 'Stops tokens. You can see through it.', road: 'Asphalt. Tokens walk on it.', roadlines: 'Asphalt with a dashed line.', rail: 'Tokens walk on it.', terrace: 'A slate roof. Blocks sight and stops tokens.', millroof: 'A sawtooth roof. Blocks sight and stops tokens.', roof: 'A flat roof. Blocks sight and stops tokens.', module: 'Hull plate. Blocks sight and stops tokens.', canal: 'Difficult terrain, counted double.', coolant: 'Difficult terrain, counted double.', scrap: 'Gives cover. Tokens can cross it.', wreckage: 'Gives cover. Tokens can cross it.' };
var BUILD_SHAPE_LINES = { rect: 'Click a cell, or drag an area.', circle: 'Click a cell, or drag an area. The circle fills its box.', poly: 'Click each corner. Click the first again to close it.', corridor: 'Drag along it.', line: 'Drag along the grid lines to draw it. The line is the wall.' };   // 1.6.3 (the release click test): says drag, since a click lays nothing
var _build = { blk: '', lookSel: null, psig: null, mat: 'floor', shape: 'rect', tex: 'flagstones', pic: '', tile: 1, color: '#5a5663', terrain: 0, corridorW: 1, walls: false, poly: null, polyEl: null, pen: false, loaded: false, era: '', find: '', drawn: '', body: null, eraEls: [] };
function buildCore() { return window.wpBuildCore || null; }
function buildGrid() { var C = window.wpFogCore; if (!C) return null; if ((state.gridType === 'hex' || state.gridType === 'square') && window.wpLatticeOf) { var BL = window.wpLatticeOf(); if (BL && BL.type === state.gridType) return BL; } return state.gridType === 'hex' ? C.hexGrid(30, 52) : state.gridType === 'square' ? C.squareGrid(50) : null; }   // 1.6.2, backlog 38: the map's own cell   // the lattice the fill tool's cellSnap reads
function buildHex6(v) { return typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null; }
function buildWet(id) { var BC = buildCore(), k = BC ? BC.cleanMaterial(id) : null; return !!(k && BC.MATERIALS[k].terrain); }   // a material that costs movement
function buildMay() { return !playerScreen() && !!(window.wpCanPersistLocal && window.wpCanPersistLocal()); }   // the GM's own campaign on the GM's own screen
function buildHere() { var m = getActiveMap(); return !!m && m.type === 'map' && state.viewMode === 'visual'; }   // the play map is on screen: Build lays on a map and on nothing else
function buildMapKey() { var c = typeof getActiveCampaign === 'function' ? getActiveCampaign() : null, m = getActiveMap(); return (c && c.id ? c.id : '') + '|' + (m && m.id ? m.id : ''); }
function buildAsking() { var q = document.getElementById('customConfirm'), p = document.getElementById('customPrompt'), lib = document.getElementById('imgLibModal'); return !!((q && q.style.display === 'flex') || (p && p.style.display === 'flex') || (lib && lib.style.display === 'flex')); }   // a question or a prompt of the app's own is up, or the Image Library, which Build's own Texture list opens
// A polygon under way belongs to the map it was begun on. With another map on screen it is dropped: its corners are that map's. A look at the
// same map's data map loses nothing: Build's keys and its commit ask the view themselves (buildHere)
function buildPolyHere() {
    if (!_build.poly) return true;
    if (_build.polyMap === buildMapKey()) return true;
    buildPolyEnd();
    return false;
}
// A dragged box on a hex grid: the press cell, the cells whose center the box holds, the release cell, each once and 400 at most
function buildHexBox(BC, C, grid, px, py, pw, ph, sx, sy, mx, my) {
    var box = BC.hexCellsInBox(grid, px, py, pw, ph, 400), list = [C.cellOf(sx, sy, grid)].concat(box && box.cells ? box.cells : [], [C.cellOf(mx, my, grid)]), seen = Object.create(null), out = [];
    for (var i = 0; i < list.length; i++) { var k = C.cellKey(list[i], grid); if (seen[k]) continue; seen[k] = 1; out.push(list[i]); }
    return { cells: out.slice(0, 400), more: !!(box && box.more) || out.length > 400 };
}
function buildLoad() {   // the options' last choices, kept on this computer, each read back through its own cleaner
    var BC = buildCore(), FC = window.wpFogCore; if (!BC || _build.loaded) return;
    _build.loaded = true;
    try {
        var v = JSON.parse(localStorage.getItem('wp_build') || 'null'); if (!v || typeof v !== 'object') return;
        var mat = BC.cleanMaterial(v.mat), M = mat ? BC.MATERIALS[mat] : null; if (!M) return;
        _build.mat = mat; _build.shape = BUILD_SHAPES.indexOf(v.shape) >= 0 ? v.shape : 'rect';
        if (_build.shape === 'line' && !BC.lineMat(mat)) _build.shape = 'rect';
        _build.tex = v.tex === '' ? '' : (BC.cleanTexture(v.tex) || M.texture); _build.color = buildHex6(v.color) || M.color;
        _build.pic = (FC && typeof FC.cleanTexSrc === 'function' ? FC.cleanTexSrc(v.pic) : null) || ''; _build.tile = (FC && typeof FC.cleanTexTile === 'function' ? FC.cleanTexTile(v.tile) : null) || 1;   // fold B3: a picture as the fill, and its repeat
        _build.terrain = M.terrain ? ((FC && FC.cleanTerrain ? FC.cleanTerrain(v.terrain) : null) || 0) : 0; _build.corridorW = v.corridorW === 2 ? 2 : 1; _build.walls = v.walls === true;
        _build.era = BC.ERAS.indexOf(v.era) >= 0 ? v.era : '';
        var FUb = window.wpFurnCore; _build.blk = _build.pic && FUb && typeof FUb.blockName === 'function' ? FUb.blockName(v.blk) : '';   // fold 4: a pack's block in hand, its name kept with its picture
    } catch (e) {}
}
function buildSave() { try { var kept = { mat: _build.mat, shape: _build.shape, tex: _build.tex, color: _build.color, terrain: _build.terrain, corridorW: _build.corridorW }; if (_build.walls === true) kept.walls = true; if (_build.era) kept.era = _build.era; if (_build.pic) { kept.pic = _build.pic; kept.tile = _build.tile; if (_build.blk) kept.blk = _build.blk; } localStorage.setItem('wp_build', JSON.stringify(kept)); } catch (e) {} }   // With walls is kept only while it is ticked, a picture and its repeat only while one is the fill
function buildMaterial(mat) {   // a material brings its own texture, color and terrain; a Wall or a Door is a thin line by default (the owner's answer of 2026-10-01)
    var BC = buildCore(), id = BC ? BC.cleanMaterial(mat) : null, M = id ? BC.MATERIALS[id] : null; if (!M) return false;
    _build.mat = id; _build.tex = M.texture; _build.pic = ''; _build.color = M.color; _build.terrain = M.terrain || 0;   // its own pattern takes a picture's place
    _build.blk = ''; var lp = typeof buildLookTex === 'function' ? buildLookTex(M.texture) : null; if (lp) { _build.pic = lp.src; _build.tile = lp.t; }   // fold 4: the pack picked in Looks paints its pattern
    _build.shape = BC.lineMat(id) ? 'line' : (_build.shape === 'line' ? 'rect' : _build.shape);
    return true;
}
// Fold 4 of backlog 222: the pack picked in the Looks list (one choice with the furnishings', furnish.js), its picture for a pattern, and a block
// of its own: the block's material and rules, its picture and its name. A line wears no picture, so a block is laid as a box
function buildLookPack() {   // a pack of furnishings alone is no look for building: Build shows Waypoint's patterns for it
    var Fu = window.wpFurnish, FU = window.wpFurnCore; if (!Fu || typeof Fu.look !== 'function' || typeof Fu.packs !== 'function' || !FU || typeof FU.packTexCount !== 'function') return null;
    var id = Fu.look(), pk = id ? Fu.packs().filter(function(p) { return p.id === id; })[0] || null : null;
    return pk && FU.packTexCount(pk) ? pk : null;
}
function buildLookTex(tex) { var FU = window.wpFurnCore, pk = buildLookPack(); return pk && FU && typeof FU.packTex === 'function' ? FU.packTex(pk, tex) : null; }
function buildBlock(b) {
    if (!b || !buildMaterial(b.mat)) return false;
    _build.pic = b.src; _build.tile = b.t; _build.blk = b.name;
    if (_build.shape === 'line') _build.shape = 'rect';
    return true;
}
function buildLookFill() {   // the Looks list changed: the material in hand takes the new pack's picture, or its own pattern; a block stays as it is
    var BC = buildCore(), M = BC ? BC.MATERIALS[_build.mat] : null; if (!M || _build.blk) return false;
    var lp = buildLookTex(M.texture); _build.tex = M.texture; _build.pic = lp ? lp.src : ''; if (lp) _build.tile = lp.t;
    return true;
}
// The review of fold 4: a material whose fill came from the look follows it wherever the look or its pack changed (the Objects tab, the maker, a
// pack removed, another campaign), so what is laid is what its cell shows; a block in hand and a fill picked by hand stay
function buildLookFollow() {
    var BC = buildCore(), M = BC ? BC.MATERIALS[_build.mat] : null; if (!M || _build.blk) return false;
    var lp = buildLookTex(M.texture), want = lp ? lp.src : '', mine = _build.pic ? /^\/saves\/images\/fp_[a-z0-9]+\/[^\/]*tex-([a-z]+)\.(png|jpe?g|webp)$/.exec(_build.pic) : null;
    if (!(_build.pic ? !!mine && mine[1] === M.texture : _build.tex === M.texture)) return false;   // its own pattern, or a pack's picture for that very pattern: anything else was picked by hand
    if (_build.pic === want) return false;
    buildLookFill(); return true;
}
function buildShape(shape) {   // a Wall line is a wall's or a door's: picked with another material in hand, it takes Wall
    if (BUILD_SHAPES.indexOf(shape) < 0) return false;
    var BC0 = buildCore(); if (shape === 'line' && !(BC0 && BC0.lineMat(_build.mat))) { if (!buildMaterial('wall')) return false; }
    _build.shape = shape;
    return true;
}
function buildProps() {   // the props of the piece about to be laid (buildcore pieceProps: a fresh bag by whitelist, never a type, a place or a flag of another kind)
    var BC = buildCore(); if (!BC) return null;
    var pp = BC.pieceProps(_build.mat, { texture: _build.tex, texSrc: _build.pic || undefined, texTile: _build.tile, color: _build.color, terrain: buildWet(_build.mat) ? (_build.terrain || 0) : undefined });
    if (pp && _build.blk && pp.texSrc) pp.name = _build.blk;   // fold 4: a block goes by its own name, with its material's rules
    return pp;
}
// Arm the board for the next piece: for a Wall line the pen under Build's preset, for every other shape a placement that is Build's own
// (never armPlacement, which takes Select and speaks). Build is still the tool in hand either way
function buildArm() {
    var BC = buildCore(); if (!BC || !window.isBuildMode) return false;
    if (_build.shape !== 'poly') buildPolyEnd();
    if (_build.shape === 'line') {
        if (window.wpPlace) disarmPlacement();
        window.wpPenPreset = BC.penPreset(_build.mat, { color: _build.color });
        window.isDrawingMode = true; _build.pen = true;
        if (wbWrap) wbWrap.style.cursor = 'crosshair';
        return !!window.wpPenPreset;
    }
    window.wpPenPreset = null;
    if (_build.pen) { _build.pen = false; window.isDrawingMode = false; }
    var props = buildProps(); if (!props) return false;
    var rec = { mat: _build.mat, shape: _build.shape, corridorW: _build.corridorW }; if (_build.walls === true && _build.shape === 'corridor') rec.walls = true;   // a corridor laid With walls
    window.wpPlace = { type: 'build', props: props, build: rec };
    if (wbWrap) wbWrap.style.cursor = 'crosshair';
    document.body.classList.add('placing');
    return true;
}
// Another tool is in hand (updateWbToolbar asks): what Build armed is put down. The pen keeps drawing only where the pen itself was taken
function buildDown(activeId) {
    window.wpPenPreset = null; buildPolyEnd();
    if (_build.pen) { _build.pen = false; if (activeId !== 'drawModeBtn') window.isDrawingMode = false; }
    if (window.wpPlace && window.wpPlace.build) disarmPlacement();
}
function buildTake() {
    if (!buildMay() || !buildCore()) return;
    buildLoad();
    window.isDrawingMode = false; window.isEraserMode = false; window.isMeasureMode = false;
    if (window.wpPlace) disarmPlacement();
    updateWbToolbar('buildModeBtn'); closeDrawMenu();
    // 1.6.3 (the improvement week's review, finding 29): the selection is let go, and the whole board is drawn again only where there was one to let
    // go. Taking Build, or opening its options by the small arrow, which takes it too, drew every piece of the map again even when nothing was
    // selected, and that worked out every token's effects (a few tenths of a second on a full map). With nothing selected nothing on the board
    // changes: the bar has been told above (updateWbToolbar), and buildArm below arms the board itself
    var hadSel = !!state.selWbId || (Array.isArray(state.selWbIds) && state.selWbIds.length > 0);
    state.selWbId = null; state.selWbIds = []; if (hadSel) render();
    buildArm();
}
// The options from the choices. The material rows are made once, by name: a swatch of the material's own tile, its name, one gray line
// The materials, by what a thing is (backlog 23c; the owner, 2026-11-02, of a map that mixes eras: "all of these make it difficult and not user friendly", then by
// prompt "all 3"). Find goes straight to one, the era chips only filter, Your palette is the campaign's own pins and On this map what the map already uses, and
// those two stand whatever the filter says. A fold is open as it was left, and with no word yet where the material in hand stands. Every cell is a name and a
// tile, made by name with text nodes. Drawn only when something it shows has moved, so a box being typed in keeps its place
function buildCamp() { return typeof getActiveCampaign === 'function' ? getActiveCampaign() : null; }
function buildPins(BC) { var c = buildCamp(); return c ? BC.cleanPins(c.buildPins) : []; }
function buildPinFlip(BC, id) {
    var c = buildCamp(); if (!c) return;
    var p = buildPins(BC), at = p.indexOf(id);
    if (at >= 0) p.splice(at, 1);
    else if (p.length >= BC.PIN_MAX) { toast('Your palette is full. Take one off first.'); return; }
    else p.push(id);
    if (p.length) c.buildPins = p; else delete c.buildPins;
    save(); buildMatsDraw(BC);
}
function buildUsed(BC) {   // what the map on screen already uses, the most used first, 8 at most, by the name Build gave each piece
    var map = getActiveMap(), list = map && Array.isArray(map.whiteboard) ? map.whiteboard : [], byName = Object.create(null), n = Object.create(null);
    BC.MATERIAL_IDS.forEach(function(id) { byName[BC.MATERIALS[id].name] = id; });
    list.forEach(function(w) { var id = w && typeof w.name === 'string' ? byName[w.name] : undefined; if (id) n[id] = (n[id] | 0) + 1; });
    return Object.keys(n).sort(function(a, b) { return n[b] - n[a]; }).slice(0, 8);
}
function buildFolds() { try { var v = JSON.parse(localStorage.getItem('wp_buildFolds') || 'null'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } }
function buildFoldSet(name, open) { try { var v = buildFolds(); v[name] = open ? 1 : 0; localStorage.setItem('wp_buildFolds', JSON.stringify(v)); } catch (e) {} }
function buildFoldOpen(k, kept) { return kept[k.name] === 1 || kept[k.name] === 0 ? kept[k.name] === 1 : k.ids.indexOf(_build.mat) >= 0; }
function buildShown(BC, id) {
    if (_build.era && (BC.MAT_ERAS[id] || []).indexOf(_build.era) < 0) return false;
    var q = _build.find.trim().toLowerCase();
    return !q || BC.MATERIALS[id].name.toLowerCase().indexOf(q) >= 0;
}
function buildCell(BC, id, pins) {
    var M = BC.MATERIALS[id], c = document.createElement('div'), b = document.createElement('button'), sw = document.createElement('span'), nm = document.createElement('span'), ts = BC.texStyle(M.texture, 0, 0), pin = document.createElement('button'), on = pins.indexOf(id) >= 0;
    c.className = 'build-cell'; b.type = 'button'; b.className = 'build-mat'; b.dataset.buildmat = id; b.title = BUILD_LINES[id] ? M.name + '. ' + BUILD_LINES[id] : M.name;
    sw.className = 'build-tile'; sw.style.backgroundColor = M.color; if (ts) { sw.style.backgroundImage = ts.image; sw.style.backgroundSize = ts.size; }
    var lp = buildLookTex(M.texture), lu = lp && typeof BC.picUrl === 'function' ? BC.picUrl(lp.src) : '';   // fold 4: the pack's own picture for its pattern
    if (lu) { sw.style.backgroundImage = 'url("' + lu + '")'; sw.style.backgroundSize = '24px 24px'; }
    nm.className = 'build-nm'; nm.textContent = M.name; b.appendChild(sw); b.appendChild(nm);
    if (!lu && buildLookPack()) { var wm = document.createElement('span'); wm.className = 'furn-base build-base'; wm.textContent = 'Waypoint'; b.appendChild(wm); b.title += ' This pack has no picture for its pattern, so it shows Waypoint\u2019s own.'; }
    b.addEventListener('click', function(ev) { ev.stopPropagation(); buildPick(function() { return buildMaterial(id); }); });
    if (id === _build.mat && !_build.blk) b.classList.add('on');
    pin.type = 'button'; pin.className = 'build-pin wib wi-pin' + (on ? ' on' : ''); pin.title = on ? 'Take it off your palette' : 'Pin it to your palette'; pin.setAttribute('aria-pressed', on ? 'true' : 'false');
    pin.addEventListener('click', function(ev) { ev.stopPropagation(); buildPinFlip(BC, id); });
    c.appendChild(b); c.appendChild(pin);
    return c;
}
function buildCells(BC, ids, pins, blocks) { var g = document.createElement('div'); g.className = 'build-grid'; ids.forEach(function(id) { g.appendChild(buildCell(BC, id, pins)); }); (blocks || []).forEach(function(b) { g.appendChild(buildBlockCell(BC, b)); }); return g; }
// Fold 4: a pack's block in its material's fold, by its own name and picture, its material named in its tip
function buildBlockCell(BC, b) {
    var c = document.createElement('div'), btn = document.createElement('button'), sw = document.createElement('span'), nm = document.createElement('span'), M = BC.MATERIALS[b.mat], u = typeof BC.picUrl === 'function' ? BC.picUrl(b.src) : '';
    c.className = 'build-cell'; btn.type = 'button'; btn.className = 'build-mat build-blk'; btn.dataset.buildblk = b.name;
    btn.title = b.name + '. A block of this pack. It lays as ' + (M ? M.name : b.mat) + ' and takes its rules.';
    sw.className = 'build-tile'; sw.style.backgroundColor = M ? M.color : ''; if (u) { sw.style.backgroundImage = 'url("' + u + '")'; sw.style.backgroundSize = '24px 24px'; }
    nm.className = 'build-nm'; nm.textContent = b.name; btn.appendChild(sw); btn.appendChild(nm);
    if (_build.blk === b.name && _build.pic === b.src) btn.classList.add('on');
    btn.addEventListener('click', function(ev) { ev.stopPropagation(); buildPick(function() { return buildBlock(b); }); });
    c.appendChild(btn);
    return c;
}
function buildBlocksNow() { var FU = window.wpFurnCore, pk = buildLookPack(); return pk && FU && typeof FU.packBlocks === 'function' ? FU.packBlocks(pk) : []; }
function buildHead(text) { var h = document.createElement('div'); h.className = 'build-head'; h.textContent = text; return h; }
function buildMatsHead(BC, box) {   // the box and the chips are made once, so that a word being typed keeps its place
    var f = document.createElement('input'), eras = document.createElement('div'), body = document.createElement('div');
    f.type = 'text'; f.className = 'build-find'; f.id = 'buildFind'; f.placeholder = 'Find a material'; f.title = 'Goes straight to a material, whatever its era. Enter takes the first one.'; f.setAttribute('aria-label', 'Find a material');
    f.addEventListener('input', function() { _build.find = f.value; buildMatsDraw(BC); });
    f.addEventListener('keydown', function(ev) {
        if (ev.key !== 'Enter') return;
        ev.preventDefault(); ev.stopPropagation();
        var first = null; BC.MAT_KINDS.forEach(function(k) { k.ids.forEach(function(id) { if (!first && buildShown(BC, id)) first = id; }); });
        if (first) buildPick(function() { return buildMaterial(first); });
    });
    eras.className = 'build-eras';
    [''].concat(BC.ERAS).forEach(function(e) {
        var c = document.createElement('button'); c.type = 'button'; c.className = 'tile-chip build-era'; c.dataset.era = e; c.textContent = e || 'All'; c.title = e ? 'Show what suits this era. It only filters: you can lay anything on any map.' : 'Show every material.';
        c.addEventListener('click', function(ev) { ev.stopPropagation(); _build.era = e; buildSave(); buildMatsDraw(BC); });
        eras.appendChild(c); _build.eraEls.push(c);
    });
    body.className = 'build-matbody'; _build.body = body;
    var lk = document.createElement('div'), ll = document.createElement('label'), sel = document.createElement('select'), pb = document.createElement('button');   // fold 4: the Looks list, one choice with the furnishings'
    lk.className = 'furn-looks'; ll.className = 'furn-looks-lab'; ll.textContent = 'Looks'; sel.className = 'furn-looks-sel'; sel.id = 'buildLooks'; ll.htmlFor = 'buildLooks';
    sel.title = 'Waypoint\u2019s own patterns, or one of this campaign\u2019s packs. Its pictures paint what you lay. It is the same choice as on the Objects tab.';
    sel.addEventListener('change', function() { var v = sel.value; if (window.wpFurnish && typeof window.wpFurnish.lookSet === 'function') window.wpFurnish.lookSet(v); _build.drawn = ''; buildPick(function() { buildLookFill(); return true; }); });   // the review of fold 4: drawn again with a block in hand too
    pb.type = 'button'; pb.className = 'tool ghost furn-packs-btn'; pb.id = 'buildPacksBtn'; pb.textContent = 'Packs\u2026'; pb.title = 'Make a pack, bring one in from a file or a folder, share one from another campaign, or export one.';
    pb.addEventListener('click', function(ev) { ev.stopPropagation(); if (window.wpFurnPacks) window.wpFurnPacks.open(); });
    lk.appendChild(ll); lk.appendChild(sel); lk.appendChild(pb); _build.lookSel = sel;
    box.appendChild(lk); box.appendChild(f); box.appendChild(eras); box.appendChild(body);
}
function buildMatsDraw(BC) {
    var box = document.getElementById('buildMatRows'); if (!box) return;
    if (!box.firstChild) buildMatsHead(BC, box);
    var body = _build.body, pins = buildPins(BC), used = buildUsed(BC), kept = buildFolds(), find = !!_build.find.trim();
    _build.eraEls.forEach(function(c) { c.classList.toggle('on', c.dataset.era === _build.era); });
    var Fu = window.wpFurnish, packs = Fu && typeof Fu.packs === 'function' ? Fu.packs() : [], FUc = window.wpFurnCore, psig = packs.map(function(p) { return p.id + '=' + p.name + '=' + JSON.stringify(p.looks) + '=' + JSON.stringify(p.tiles || {}) + '=' + JSON.stringify(p.blocks || []); }).join(',');
    if (_build.lookSel && _build.psig !== psig) {   // fold 4: the Looks list, Waypoint's patterns then each pack that has a pattern or a block
        _build.psig = psig; var ls = _build.lookSel; while (ls.firstChild) ls.removeChild(ls.firstChild);
        var o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Waypoint\u2019s patterns'; ls.appendChild(o0);
        packs.forEach(function(p) { if (FUc && typeof FUc.packTexCount === 'function' && !FUc.packTexCount(p)) return; var o = document.createElement('option'); o.value = p.id; o.textContent = p.name; ls.appendChild(o); });
    }
    var look = buildLookPack(), lookId = look ? look.id : ''; if (_build.lookSel) { _build.lookSel.value = lookId; if (_build.lookSel.value !== lookId) _build.lookSel.value = ''; }   // a pack of furnishings alone is no choice here
    var blocks = buildBlocksNow(), q = _build.find.trim().toLowerCase();
    var open = BC.MAT_KINDS.map(function(k) { return buildFoldOpen(k, kept) ? 1 : 0; }).join(''), sig = [_build.era, _build.find, pins.join(), used.join(), open, psig, lookId, _build.blk, _build.pic, _build.mat].join('|');
    if (sig === _build.drawn && body.firstChild) return;
    _build.drawn = sig;
    var keepTop = body.scrollTop, menuEl = document.getElementById('buildMenu'), keepMenu = menuEl ? menuEl.scrollTop : 0, aeB = document.activeElement, keepFold = aeB && body.contains(aeB) && aeB.classList.contains('build-fold') ? aeB.getAttribute('data-fold') : null;   // a fold pressed is the focus: drawing it anew drops the palette's scroll unless it is kept
    while (body.firstChild) body.removeChild(body.firstChild);
    var strip = pins.concat(used.filter(function(id) { return pins.indexOf(id) < 0; }));   // 1.6.2 (the owner, by prompt: "One strip"): your pins first, then what this map uses, each once
    if (strip.length) { body.appendChild(buildHead('Pinned and on this map')); body.appendChild(buildCells(BC, strip, pins)); }
    var any = false;
    BC.MAT_KINDS.forEach(function(k) {
        var ids = k.ids.filter(function(id) { return buildShown(BC, id); }), bl = blocks.filter(function(x) { return k.ids.indexOf(x.mat) >= 0 && (!q || x.name.toLowerCase().indexOf(q) >= 0); }); if (!ids.length && !bl.length) return;   // fold 4: a block stands in its material's fold whatever the era
        any = true;
        var isOpen = find || buildFoldOpen(k, kept), b = document.createElement('button'), n = document.createElement('small');
        b.type = 'button'; b.className = 'build-fold'; b.setAttribute('data-fold', k.name); b.setAttribute('aria-expanded', isOpen ? 'true' : 'false'); b.textContent = k.name; n.textContent = String(ids.length + bl.length); b.appendChild(n);
        b.addEventListener('click', function(ev) { ev.stopPropagation(); buildFoldSet(k.name, !isOpen); _build.drawn = ''; buildMatsDraw(BC); });
        body.appendChild(b);
        if (isOpen) body.appendChild(buildCells(BC, ids, pins, bl));
    });
    if (!any) { var none = document.createElement('div'); none.className = 'build-none'; none.textContent = 'No material by that name.'; body.appendChild(none); }
    body.scrollTop = keepTop; if (menuEl) menuEl.scrollTop = keepMenu;   // the palette stays where it was scrolled to
    if (keepFold) { var fb2 = Array.prototype.filter.call(body.querySelectorAll('.build-fold'), function(x) { return x.getAttribute('data-fold') === keepFold; })[0]; if (fb2) { try { fb2.focus({ preventScroll: true }); } catch (e) {} } }
}
window.wpBuildSync = function() { _build.drawn = ''; _build.psig = null; buildSync(); };   // fold 4 of backlog 222: a pack saved, brought in or picked elsewhere draws the palette again
function buildSync() {
    var BC = buildCore(), FC = window.wpFogCore; if (!BC) return;
    buildLoad();
    if (typeof buildLookFollow === 'function' && buildLookFollow()) { buildSave(); if (window.isBuildMode) buildArm(); }
    buildMatsDraw(BC);
    Array.prototype.forEach.call(document.querySelectorAll('#buildMatRows .build-mat'), function(b) { b.classList.toggle('on', b.dataset.buildblk ? !!_build.blk && b.dataset.buildblk === _build.blk : b.dataset.buildmat === _build.mat && !_build.blk); });
    Array.prototype.forEach.call(document.querySelectorAll('#buildShapeRow .build-shape-btn'), function(b) { b.classList.toggle('active', b.dataset.buildshape === _build.shape); });
    var ln = document.getElementById('buildShapeLine'); if (ln) ln.textContent = BUILD_SHAPE_LINES[_build.shape] || '';
    var ts2 = document.getElementById('buildTexture'); if (ts2) { texOptionsInto(ts2, _build.tex, _build.pic); ts2.disabled = _build.shape === 'line'; }   // a line is a stroke: it wears no texture
    if (typeof tileRowSync === 'function') tileRowSync('buildTileRow', 'buildTileLine', _build.pic, _build.tile, _build.shape === 'line');   // fold B3: the Tile size chips, while a picture is the fill
    var hit = false;
    Array.prototype.forEach.call(document.querySelectorAll('#buildColorRow .build-sw'), function(sw2) { var on = String(sw2.dataset.color || '').toLowerCase() === String(_build.color || '').toLowerCase(); if (on) hit = true; sw2.classList.toggle('active', on); });
    var cs = document.querySelector('#buildColorRow .draw-swatch.custom'); if (cs) { cs.classList.toggle('active', !hit); cs.style.background = hit ? '' : (buildHex6(_build.color) || ''); }
    var ci = document.getElementById('buildColorInput'); if (ci && buildHex6(_build.color)) ci.value = _build.color;
    var tr = document.getElementById('buildTerrainRow'), tc = document.getElementById('buildTerrainChk'), tn = document.getElementById('buildTerrainCost'), tv = FC && FC.cleanTerrain ? FC.cleanTerrain(_build.terrain) : null;
    if (tr) tr.hidden = !buildWet(_build.mat);
    if (tc) tc.checked = !!tv;
    if (tn) { if (tv) tn.value = tv; tn.disabled = !tv; }
    var cr = document.getElementById('buildCorridorRow'), cw = document.getElementById('buildCorridorW');
    if (cr) cr.hidden = _build.shape !== 'corridor';
    if (cw) cw.value = String(_build.corridorW);
    var cwl = document.getElementById('buildCorridorWalls'), cln = document.getElementById('buildCorridorLine');
    if (cwl) cwl.checked = _build.walls === true;
    if (cln) cln.hidden = _build.shape !== 'corridor';
    var lf = document.getElementById('buildLookFold'); if (lf) lf.textContent = buildLookWords();   // 1.6.2: the folded look says what it is
}
// 1.6.2, backlog 171 (the owner, 2026-11-05, by prompt: "Three tabs", "A Generate tab"): Build's options stand in three tabs, Build, Objects
// and Generate, each with one scroll. Every control keeps its id and its place in the page: a tab only puts away what is not its own,
// read from the page in its order (a part runs from where it begins to where the next begins), and the generators stand as three cards
var BUILD_TABS = ['build', 'objects', 'generate'];
function buildTabNow() { try { var t = localStorage.getItem('wp_buildTab'); return BUILD_TABS.indexOf(t) >= 0 ? t : 'build'; } catch (e) { return 'build'; } }
function buildTabSet(t, keep) {
    var m = document.getElementById('buildMenu'), tabs = document.getElementById('buildTabs'); if (!m || BUILD_TABS.indexOf(t) < 0) return false;
    m.setAttribute('data-btab', t);
    if (tabs && tabs.querySelectorAll) Array.prototype.forEach.call(tabs.querySelectorAll('.build-tab'), function(b) { var on = b.getAttribute('data-btab') === t; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; });
    if (keep) { try { localStorage.setItem('wp_buildTab', t); } catch (e) {} }
    return true;
}
function buildTabsWire() {
    var m = document.getElementById('buildMenu'), tabs = document.getElementById('buildTabs'); if (!m || !tabs || m._btabs || !m.children) return; m._btabs = true;
    var part = 'build';
    Array.prototype.forEach.call(m.children, function(c) {
        if (c === tabs || c.id === 'buildHint') return;
        if (c.nextElementSibling && (c.nextElementSibling.id === 'buildFurn' || c.nextElementSibling.id === 'buildObjRows')) part = 'objects';   // the Furnishings label begins the Objects tab (backlog 222), and Map objects stands in it
        if (c.id === 'buildGenBtn') part = 'generate';
        c.setAttribute('data-bpart', part);
    });
    var flB = document.getElementById('buildFlatBtn'); if (flB && !flB.dataset.wired) { flB.dataset.wired = '1'; flB.addEventListener('click', function() { var am = getActiveMap(), ids = Array.isArray(state.selWbIds) && state.selWbIds.length ? state.selWbIds.slice() : (state.selWbId ? [state.selWbId] : []); if (!am || ids.length < 2) { toast('Select two pieces or more on the map first, then Flatten selection.'); return; } if (window.wpMapShot && window.wpMapShot.flatten) window.wpMapShot.flatten(ids); }); }   // 1.6.2 (backlog 39)
    var gens = ['buildGenBtn', 'buildCityBtn', 'buildWorldBtn'].map(function(id) { return document.getElementById(id); }).filter(Boolean);
    if (gens.length && gens[0].parentNode) { var box = document.createElement('div'); box.className = 'build-gens'; box.setAttribute('data-bpart', 'generate'); gens[0].parentNode.insertBefore(box, gens[0]); gens.forEach(function(b) { box.appendChild(b); }); }   // three cards, in their order
    Array.prototype.forEach.call(tabs.querySelectorAll('.build-tab'), function(b) {
        b.addEventListener('click', function(ev) { ev.stopPropagation(); buildTabSet(b.getAttribute('data-btab'), true); });
        b.addEventListener('keydown', function(ev) {
            var at = BUILD_TABS.indexOf(b.getAttribute('data-btab')), to = ev.key === 'ArrowRight' ? at + 1 : ev.key === 'ArrowLeft' ? at - 1 : ev.key === 'Home' ? 0 : ev.key === 'End' ? BUILD_TABS.length - 1 : -2;
            if (to === -2) return; ev.preventDefault(); ev.stopPropagation(); to = (to + BUILD_TABS.length) % BUILD_TABS.length;
            buildTabSet(BUILD_TABS[to], true); var nb = tabs.querySelector('[data-btab="' + BUILD_TABS[to] + '"]'); if (nb && nb.focus) nb.focus();
        });
    });
    buildTabSet(buildTabNow(), false);
}
// The texture and the color fold into one line that says what they are (the owner's pick: "Three tabs", with the look folded)
function buildLookOpen() { try { return localStorage.getItem('wp_buildLook') === '1'; } catch (e) { return false; } }
function buildLookWire() {
    var m = document.getElementById('buildMenu'), tx = document.getElementById('buildTexture'), cr = document.getElementById('buildColorRow'); if (!m || !tx || !cr || m._blook || !tx.parentNode) return; m._blook = true;
    var row = tx.parentNode, lab = row.previousElementSibling, parts = [lab, row, document.getElementById('buildTileRow'), document.getElementById('buildTileLine'), cr.previousElementSibling, cr];
    parts.forEach(function(p) { if (p && p.classList) p.classList.add('build-look-part'); });
    var b = document.createElement('button'); b.type = 'button'; b.className = 'build-lookfold'; b.id = 'buildLookFold'; b.title = 'The pattern and the color of what you lay. Press to change them.';
    if (lab && lab.parentNode) lab.parentNode.insertBefore(b, lab);
    b.addEventListener('click', function(ev) { ev.stopPropagation(); var on = !m.classList.contains('look-open'); m.classList.toggle('look-open', on); b.setAttribute('aria-expanded', on ? 'true' : 'false'); try { localStorage.setItem('wp_buildLook', on ? '1' : '0'); } catch (e) {} });
    var on0 = buildLookOpen(); m.classList.toggle('look-open', on0); b.setAttribute('aria-expanded', on0 ? 'true' : 'false');
}
function buildLookWords() {   // "Look: Bricks, dark stone": the texture as the list names it, and the color by its swatch's name
    var ts = document.getElementById('buildTexture'), o = ts && ts.options && ts.selectedIndex >= 0 ? ts.options[ts.selectedIndex] : null, tex = _build.shape === 'line' ? '' : (o ? String(o.textContent || '') : '');
    var sw = document.querySelector('#buildColorRow .build-sw.active'), col = sw ? String(sw.getAttribute('title') || '').toLowerCase() : 'your own color';
    return 'Look: ' + (tex ? tex + ', ' : '') + col;
}
function buildPick(change) {   // a choice in the options: kept, shown, and the board armed for it while Build is in hand
    if (change() === false) return;
    buildSave(); buildSync();
    if (window.isBuildMode) buildArm();
}
// Laying: wpPlaceCommit hands a built piece here. The lattice maths is buildcore's (snapBox, hexCellsInBox, hexCellBox, corridor, snapVertex,
// polyItem, seatedAt), so a later generator lays pieces through the very same functions
function wpBuildCommit(P, px, py, pw, ph, sx, sy) {
    var B = P.build, BC = buildCore(), C = window.wpFogCore, map = getActiveMap();
    if (!B || !window.isBuildMode) return;
    var ae = document.activeElement; if (ae && ae.closest && ae.closest('#buildMenu') && ae.blur) ae.blur();   // the pointer is back on the map, and the board keeps a click from moving the focus: the options' fields give the keys back
    if (window.wpPlace && window.wpPlace.build) { P = window.wpPlace; B = P.build; }   // a box left half typed took its change at that blur and armed again: this lay is made with what the options now say
    if (!BC || !C || !map || !buildMay() || !buildHere()) { var mvB = document.getElementById('moveModeBtn'); if (mvB) mvB.click(); return; }   // Build cannot lay here (someone else's table, a page): the tool is put away, never left lit and dead
    if (!Array.isArray(map.whiteboard)) map.whiteboard = [];
    var grid = buildGrid(), dragged = pw > 12 || ph > 12, thin = dragged && Math.min(pw, ph) <= 12,   // either way past 12 px is a drag; thin: along one row or one column
         mx = Math.max(0, Math.abs(sx - px) < 0.5 ? px + pw : px), my = Math.max(0, Math.abs(sy - py) < 0.5 ? py + ph : py),   // the release, held to the board: nothing is laid past its top or left edge
         x0 = Math.min(sx, mx), y0 = Math.min(sy, my), dw = Math.abs(mx - sx), dh = Math.abs(my - sy);
    if (B.shape === 'poly') { buildPolyAdd(sx, sy, grid); buildArm(); return; }
    var boxes = [], more = false;
    if (grid && grid.type === 'hex') {   // cell by cell (the owner's answer): one hexagon a cell, so the area is exact
        var hc = (B.shape === 'corridor' || thin) ? BC.corridor(grid, sx, sy, mx, my, B.shape === 'corridor' ? B.corridorW : 1) : dragged ? buildHexBox(BC, C, grid, x0, y0, dw, dh, sx, sy, mx, my) : { cells: [C.cellOf(sx, sy, grid)], more: false };   // a thin drag is the cells its line passes
        if (hc && hc.cells) { more = hc.more === true; hc.cells.forEach(function(c) { var hb = BC.hexCellBox(grid, c); if (hb) boxes.push(Object.assign({ type: 'hexagon' }, hb)); }); }
    } else if (grid) {   // the square lattice: a click one cell, a drag the cells it covers, a corridor a strip of whole cells
        var bx = B.shape === 'corridor' ? BC.corridor(grid, sx, sy, mx, my, B.corridorW) : BC.snapBox(grid, sx, sy, mx, my, dragged);
        if (bx) { if (bx.x < 0) { bx.w += bx.x; bx.x = 0; } if (bx.y < 0) { bx.h += bx.y; bx.y = 0; } }   // a two-wide corridor begun in the first row or column: only what is on the board
        if (bx && bx.w > 0 && bx.h > 0) boxes.push(Object.assign({ type: B.shape === 'circle' ? 'circle' : 'rect' }, bx));
    } else {   // no grid: a free box, on the 50 px dots while Snap is on, as the plain shapes seat
        var snap = !!(window.wpSnapOn && window.wpSnapOn()), r50 = function(v) { return snap ? Math.round(v / 50) * 50 : Math.round(v); };
        var free = (pw > 12 && ph > 12) || Math.max(pw, ph) >= 50;   // with no cells to land on, a slip of the hand during a click is still a click, as the plain shapes read it; a long thin drag is a strip
        var fb = B.shape === 'corridor' ? (Math.abs(mx - sx) >= Math.abs(my - sy) ? { x: Math.min(sx, mx), y: sy - 25, w: Math.abs(mx - sx), h: 50 } : { x: sx - 25, y: Math.min(sy, my), w: 50, h: Math.abs(my - sy) })
            : free ? { x: x0, y: y0, w: dw, h: dh } : { x: sx - 50, y: sy - 50, w: 100, h: 100 };
        boxes.push({ type: B.shape === 'circle' ? 'circle' : 'rect', x: Math.max(0, r50(fb.x)), y: Math.max(0, r50(fb.y)), w: Math.max(snap ? 50 : 10, r50(fb.w)), h: Math.max(snap ? 50 : 10, r50(fb.h)) });
    }
    var wallsToo = [];   // a corridor laid With walls (the owner: "Open ends"): a wall line along each long side, in the same save as its floor
    if (B.shape === 'corridor' && B.walls === true && boxes.length) {
        var preW = BC.penPreset('wall', {}), wl = [];
        if (grid) { var cwr = BC.corridorWalls(grid, sx, sy, mx, my, B.corridorW, { doors: map.whiteboard, have: map.whiteboard }); wl = cwr && !cwr.over ? (grid.type === 'hex' ? cwr.lines : cwr.lines.filter(function(L) { return L.x >= 0 && L.y >= 0; })) : []; }   // a square strip is cut to the board, and its walls with it; a hex corridor's cells are laid whole, so its walls are too
        else { var fbx = boxes[0], lvl = Math.abs(mx - sx) >= Math.abs(my - sy); wl = (lvl ? [[[fbx.x, fbx.y], [fbx.x + fbx.w, fbx.y]], [[fbx.x, fbx.y + fbx.h], [fbx.x + fbx.w, fbx.y + fbx.h]]] : [[[fbx.x, fbx.y], [fbx.x, fbx.y + fbx.h]], [[fbx.x + fbx.w, fbx.y], [fbx.x + fbx.w, fbx.y + fbx.h]]]).map(function(p2) { return BC.wallLine(p2); }).filter(Boolean); }
        if (preW) wallsToo = wl.map(function(L) { return buildWallItem(L, preW); });
    }
    buildLay(map, boxes, P.props, more, wallsToo);
    buildArm();
}
// One wall line as the item the pen's Wall line makes: a path with the line's box and points, then the preset's keys
// 1.6.2 (the owner: "A small preview"): a generator's plan drawn small, from the very pieces Generate lays: boxes, circles and lines in their
// own colors, a filled region filled. A color a canvas cannot read is drawn gray. Nothing is laid and nothing is kept
function genPreviewColor(c) { return typeof c === 'string' && /^#[0-9a-f]{3,8}$|^rgba?\([\d\s.,%]+\)$/i.test(c.trim()) ? c.trim() : '#8a8a96'; }
function genPreviewDraw(modalId, items) {
    var cv = document.querySelector('#' + modalId + ' .gen-preview'); if (!cv || typeof cv.getContext !== 'function') return false;
    var g = cv.getContext('2d'); if (!g) return false;
    var W = cv.width, H = cv.height; g.clearRect(0, 0, W, H); g.fillStyle = '#16161c'; g.fillRect(0, 0, W, H);
    var list = Array.isArray(items) ? items.filter(function(it) { return it && isFinite(it.x) && isFinite(it.y) && isFinite(it.w) && isFinite(it.h); }) : [];
    cv.hidden = !list.length; if (!list.length) return false;
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    list.forEach(function(it) { x0 = Math.min(x0, it.x); y0 = Math.min(y0, it.y); x1 = Math.max(x1, it.x + it.w); y1 = Math.max(y1, it.y + it.h); });
    var k = Math.min((W - 8) / Math.max(1, x1 - x0), (H - 8) / Math.max(1, y1 - y0)), ox = (W - (x1 - x0) * k) / 2, oy = (H - (y1 - y0) * k) / 2;
    var X = function(v) { return ox + (v - x0) * k; }, Y = function(v) { return oy + (v - y0) * k; };
    list.slice().sort(function(a, b) { return (a.z || 0) - (b.z || 0); }).forEach(function(it) {
        var col = genPreviewColor(it.color);
        if (it.type === 'path' && Array.isArray(it.pts) && it.pts.length) {
            var sx = it.baseW ? it.w / it.baseW : 1, sy = it.baseH ? it.h / it.baseH : 1; g.beginPath();
            it.pts.forEach(function(p, i) { if (!Array.isArray(p)) return; var px = X(it.x + p[0] * sx), py = Y(it.y + p[1] * sy); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
            if (it.tip === 'fill') { g.closePath(); g.fillStyle = col; g.fill(); } else { g.strokeStyle = col; g.lineWidth = Math.max(1, (Number(it.strokeWidth) || 3) * k); g.stroke(); }
        } else if (it.type === 'circle') { g.beginPath(); g.ellipse(X(it.x + it.w / 2), Y(it.y + it.h / 2), Math.max(0.5, it.w * k / 2), Math.max(0.5, it.h * k / 2), 0, 0, Math.PI * 2); g.fillStyle = col; g.fill(); }
        else if (it.type !== 'text') { g.fillStyle = col; g.fillRect(X(it.x), Y(it.y), Math.max(0.5, it.w * k), Math.max(0.5, it.h * k)); }
    });
    return true;
}
function buildWallItem(L, pre) { return Object.assign({ id: 'wb' + uid(), type: 'path', x: L.x, y: L.y, w: L.w, h: L.h, baseW: L.baseW, baseH: L.baseH, z: 10, pts: L.pts }, newOpacityProps(), pre); }
// A door laid on a wall line cuts its doorway (the map builder, fold B5; the owner, 2026-10-10, by prompt: "The door cuts its doorway"). The
// wall lines the new door line lies along are cut where it lies (buildcore cutWalls), in the save that lays the door, so ONE Undo takes the
// door and the cut back together. A piece of a cut wall is the wall itself with new geometry and a new id: every other key of it stays (its
// color, width, name, layer, height, cover), and it leaves its group, as a piece the eraser cuts does. All or none within what a map
// holds. Only on a map with a grid, where the pen rides the lattice: a free-hand stroke on a map with none could lie along a wall by
// accident. The GM's own campaign alone. Answers how many walls were cut
function doorCut(map, door) {
    var BC = window.wpBuildCore;
    if (!BC || typeof BC.cutWalls !== 'function' || !map || !Array.isArray(map.whiteboard) || !door || !buildMay() || !buildGrid()) return 0;
    var res = BC.cutWalls(map.whiteboard, door); if (!res || !res.n) return 0;
    var more = 0, at = {}, gone = {}, out = [];
    res.cuts.forEach(function(c) { more += c.lines.length - 1; at[c.at] = c; });
    if (map.whiteboard.length + more + 1 > BUILD_MAX) { toast('The wall under the door is not cut: this map holds too many pieces. Delete the wall there by hand.'); return 0; }
    map.whiteboard.forEach(function(w, i) {
        var c = at[i]; if (!c) { out.push(w); return; }
        gone[w.id] = 1;
        c.lines.forEach(function(L) {
            var p = Object.assign({}, w, { id: 'wb' + uid(), x: L.x, y: L.y, w: L.w, h: L.h, baseW: L.baseW, baseH: L.baseH, pts: L.pts }); delete p.groupId; delete p.rot;
            // a wall that was resized is drawn in its own box stretched, stroke and nib with it: a piece keeps that very stretch (its own box that much smaller, its points in it), so every stretch of it is drawn exactly as it was, whatever the nib and whatever corners it has. Its width stays the wall's own
            var FCc = window.wpFogCore, scW = FCc && typeof FCc.lineScale === 'function' ? FCc.lineScale(w) : null;
            if (scW && (scW[0] !== 1 || scW[1] !== 1) && Array.isArray(L.pts)) {
                var bwP = L.w / scW[0], bhP = L.h / scW[1];
                if (isFinite(bwP) && bwP > 0 && isFinite(bhP) && bhP > 0) { p.baseW = bwP; p.baseH = bhP; p.pts = L.pts.map(function(q) { return [q[0] / scW[0], q[1] / scW[1]]; }); }
            }
            out.push(p);
        });
    });
    map.whiteboard.length = 0; for (var k = 0; k < out.length; k++) map.whiteboard.push(out[k]);   // the same list, so whoever holds it holds the cut
    if (state.selWbId && gone[state.selWbId]) state.selWbId = null;   // a selected wall that is gone is no selection
    if (Array.isArray(state.selWbIds)) state.selWbIds = state.selWbIds.filter(function(id) { return !gone[id]; });
    toast(res.n === 1 ? 'The wall under the door is cut. One Undo takes the door and the cut back.' : 'The walls under the door are cut. One Undo takes the door and the cuts back.');
    return res.n;
}
window.wpDoorCut = doorCut;
// The boxes as pieces, ONE save for the gesture. A cell that already holds a plain piece of that shape takes the new props instead of a second
// piece (buildcore seatedAt: never a locked or turned piece, nor one with a purpose of its own)
// [buildcheck:structwb-start]
// Backlog 231: a new map's structure locked in place as it is laid, while this computer's Settings tick says so (wp_structLock, on to start)
function structAuto() { if (typeof localStorage === 'undefined') return false; try { return localStorage.getItem('wp_structLock') !== 'off'; } catch (e) { return true; } }   // a store that cannot be read is on, as the tick starts; with no store at all (a check run in Node) nothing is locked
function structLaid(items) { var BC = buildCore(); return BC && BC.structLock && structAuto() ? BC.structLock(items) : 0; }
// A map with nothing laid on it yet: a token, a waiting token or a GM note card is no piece of the place
function mapBare(map) { return !!map && Array.isArray(map.whiteboard) && map.whiteboard.every(function(w) { return !w || w.isChar || w.waiting || w.gmNoteFor; }); }
// The first picture laid on a bare map is its ground: on the back layer, and locked where the tick says
function groundPic(map, it) { if (!mapBare(map)) return false; it.layer = 'back'; if (structAuto()) it.locked = true; return true; }
// The map-wide row: Lock this map's structure where any of it is free, else Unlock it; nothing where the map holds none
function structRow(map) {
    var BC = buildCore(); if (!BC || !BC.structOk || !map || !Array.isArray(map.whiteboard)) return null;
    var all = map.whiteboard.filter(function(w) { return BC.structOk(w); }); if (!all.length) return null;
    var free = all.filter(function(w) { return !w.locked; }).length;
    return { n: all.length, free: free, lock: free > 0 };
}
function structSet(map, on) {
    var BC = buildCore(); if (!BC || !map || !Array.isArray(map.whiteboard)) return 0;
    var n = 0; map.whiteboard.forEach(function(w) { if (!BC.structOk(w)) return; if (on && !w.locked) { w.locked = true; n++; } else if (!on && w.locked) { delete w.locked; n++; } });
    return n;
}
function structRowHtml(row) {
    if (!row) return '';
    return '<div class="menu-item cm-structure" title="' + (row.lock ? 'Walls, doors, floors, ground and the map&rsquo;s picture stay where they are: no drag, no nudge and no erase. Build and a door line still change them. Furnishings, map objects and tokens stay free.' : 'Walls, doors, floors, ground and the map&rsquo;s picture can be dragged, nudged and erased again.') + '"><i class="wib wi-' + (row.lock ? 'anchor-off' : 'anchor') + '"></i> ' + (row.lock ? 'Lock this map&rsquo;s structure' : 'Unlock this map&rsquo;s structure') + '</div>';
}
function structDo(map, on) {
    var n = structSet(map, on); if (!n) return '';
    save(); render(); if (typeof buildStructSync === 'function') buildStructSync();
    return (on ? 'Locked ' : 'Unlocked ') + n + (n === 1 ? ' piece' : ' pieces') + ' of this map\u2019s structure.';
}
if (typeof window !== 'undefined') window.wpStructLaid = structLaid;   // datamap.js locks a Wall, Door or barrier line it draws
if (typeof document !== 'undefined') {
    var _bsb = document.getElementById('buildStructBtn');
    if (_bsb) _bsb.addEventListener('click', function(ev) { ev.stopPropagation(); var am = getActiveMap(), row = structRow(am); if (!row) return; var sw = structDo(am, row.lock); if (sw) toast(sw); });
    ['buildModeBtn', 'buildOptBtn'].forEach(function(id) { var b = document.getElementById(id); if (b) b.addEventListener('click', function() { setTimeout(buildStructSync, 0); }); });
}
// Build's options say the same, with the same press
function buildStructSync() {
    var b = document.getElementById('buildStructBtn'); if (!b) return;
    var row = structRow(getActiveMap()), lk = !row || row.lock, t = b.querySelector('.mr-txt');
    b.disabled = !row; b.classList.toggle('on', !!row && !row.lock);
    var pth = b.querySelector('.mr-ico path'); if (pth) pth.setAttribute('d', 'M12 3a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 7v13.5M8.5 10.5h7M4.5 14a7.5 6.5 0 0 0 15 0M4.5 14l-1.3 1.7M19.5 14l1.3 1.7' + (lk ? 'M3 3l18 18' : ''));   // the anchor as the structure stands, struck through while any of it is free
    if (t) { t.textContent = ''; t.appendChild(document.createTextNode(lk ? 'Lock this map\u2019s structure' : 'Unlock this map\u2019s structure')); var sm = document.createElement('small'); sm.textContent = !row ? 'This map has no walls, doors or floors yet.' : lk ? 'No drag, nudge or erase. Build still changes it.' : 'Walls, doors and floors can be dragged again.'; t.appendChild(sm); }
}
// [buildcheck:structwb-end]

function buildLay(map, boxes, props, more, walls) {
    var BC = buildCore(); if (!BC || !props) return;
    if (!boxes.length) { toast('Nothing to lay there.'); return; }
    var room = BUILD_MAX - map.whiteboard.length, laid = 0, wall = false, full = false, keys = ['color', 'layer', 'name', 'texture', 'texSrc', 'texTile', 'blocksSight', 'sightType', 'barrier', 'cover', 'terrain', 'terrainKind', 'secret', 'seenColor', 'seenTexture', 'seenWidth', 'seenOpacity', 'seenTip'];   // a piece laid again in place wears the new material and nothing of the old: a picture it wore goes with its pattern
    for (var i = 0; i < boxes.length; i++) {
        var b = boxes[i], item = Object.assign({ id: 'wb' + uid(), type: b.type, x: b.x, y: b.y, w: b.w, h: b.h, z: 10 }, newOpacityProps(), props);
        if (b.pts) { item.pts = b.pts; item.baseW = b.baseW; item.baseH = b.baseH; item.tip = 'fill'; }
        var at = b.pts ? -1 : BC.seatedAt(map.whiteboard, item);
        if (at >= 0) {
            var old = map.whiteboard[at], wasWall = old.blocksSight === true;
            keys.forEach(function(k) { if (props[k] !== undefined) old[k] = props[k]; else delete old[k]; });
            if (props.sightType !== 'door') { delete old.doorOpen; delete old.doorLock; }
            delete old.fill;   // a piece Build laid is no painted cell: the Fill tool leaves it alone
            if (wasWall || old.blocksSight) wall = true;
            laid++; continue;
        }
        if (room <= 0) { full = true; break; }
        if (typeof structLaid === 'function') structLaid([item]); room--; map.whiteboard.push(item); laid++; if (item.blocksSight) wall = true;
    }
    if (walls && walls.length) {   // a corridor's walls, all or none (a floor that found no room leaves none for them either)
        if (map.whiteboard.length + walls.length <= BUILD_MAX) { if (typeof structLaid === 'function') structLaid(walls); walls.forEach(function(wi) { map.whiteboard.push(wi); }); wall = true; } else full = true;
    }
    if (full) toast('This map holds as many pieces as it can carry to players, ' + BUILD_MAX + '. Nothing more was laid.');
    if (!laid) return;
    save(); render();
    if (wall && window.wpFog && window.wpFog.invalidateVision) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }
    if (more) toast('A drag lays at most 400 cells at a time. Drag again for the rest.');
}
// The polygon: each click a corner on the lattice (a square grid's crossings, a hex grid's corners, the 50 px dots or the point itself with no
// grid, as Snap says), a rubber band to the pointer, closed by a click on the first corner or by Enter. One filled region with the piece's props
function buildPolyAdd(sx, sy, grid) {
    var BC = buildCore(); if (!BC) return;
    var v = BC.snapVertex(grid, sx, sy, !!(window.wpSnapOn && window.wpSnapOn())); if (!v) return;
    buildPolyHere();   // corners begun on another map are dropped: this click starts anew
    if (!_build.poly) { _build.poly = []; _build.polyMap = buildMapKey(); }
    var P0 = _build.poly[0];
    if (P0 && Math.hypot(v.x - P0.x, v.y - P0.y) < 20) {   // a click on the first corner closes the shape, once it has three
        if (_build.poly.length >= 3) buildPolyClose(); else if (_build.poly.length > 1) toast('A polygon needs at least three corners.');
        return;
    }
    if (_build.poly.length >= 500) { toast('A polygon takes at most 500 corners.'); return; }
    var last = _build.poly[_build.poly.length - 1]; if (last && last.x === v.x && last.y === v.y) return;
    _build.poly.push(v); buildPolyDraw(null);
}
function buildPolyClose() {
    if (!buildPolyHere() || !buildHere()) { buildPolyEnd(); return; }
    var BC = buildCore(), map = getActiveMap(), verts = _build.poly || [];
    if (!BC || !map || verts.length < 3) { toast('A polygon needs at least three corners.'); return; }
    var it = BC.polyItem(verts.map(function(p) { return [p.x, p.y]; }));
    buildPolyEnd();
    if (!it) { toast('That shape covers nothing. Its corners lie in a line.'); return; }
    var props = buildProps(); if (!props || !buildMay()) return;
    if (!Array.isArray(map.whiteboard)) map.whiteboard = [];
    buildLay(map, [{ type: 'path', x: it.x, y: it.y, w: it.w, h: it.h, pts: it.pts, baseW: it.baseW, baseH: it.baseH }], props, false);
}
function buildPolyDraw(cur) {   // the rubber band over the board: numbers only into attributes, every element made by name
    var verts = _build.poly || []; if (!verts.length) return;
    var el = _build.polyEl, NS = 'http://www.w3.org/2000/svg';
    if (!el) { el = document.createElement('div'); el.className = 'wb-build-poly'; el.appendChild(document.createElementNS(NS, 'svg')); if (wb) wb.appendChild(el); _build.polyEl = el; }
    var svg = el.firstChild; svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%');
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var pts = verts.map(function(p) { return Number(p.x) + ',' + Number(p.y); }); if (cur) pts.push(Number(cur.x) + ',' + Number(cur.y));
    var line = document.createElementNS(NS, 'polyline'); line.setAttribute('points', pts.join(' ')); line.setAttribute('class', 'wb-build-band'); svg.appendChild(line);
    verts.forEach(function(p, i) { var c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', String(Number(p.x))); c.setAttribute('cy', String(Number(p.y))); c.setAttribute('r', i === 0 ? '7' : '4'); c.setAttribute('class', i === 0 ? 'wb-build-first' : 'wb-build-dot'); svg.appendChild(c); });
}
function buildPolyEnd() { _build.poly = null; _build.polyMap = null; if (_build.polyEl) { _build.polyEl.remove(); _build.polyEl = null; } }
// The keys while Build is in hand: Enter closes a polygon of three corners or more, Esc drops a polygon under way, else puts the tool away
function buildKey(e) {
    if (!window.isBuildMode || e.defaultPrevented) return;
    if (e.key === 'Escape' && window.wpEsc && !window.wpEsc.free(e)) return;   // 1.5.4: an Escape that closed something else (a window, a menu) is not Build's
    var t = e.target, typing = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '') || t.isContentEditable === true), own = typing && !!(t.closest && t.closest('#buildMenu'));
    if ((typing && !(own && e.key === 'Escape')) || buildAsking() || !buildHere()) return;   // a field's own keys, a question of the app's, another view: none of them Build's. Esc in a field of Build's own options still is
    if (e.key === 'Enter' && _build.poly && _build.poly.length >= 3 && buildPolyHere()) { e.preventDefault(); buildPolyClose(); buildArm(); }
    else if (e.key === 'Escape') {
        if (_build.poly && _build.poly.length && buildPolyHere()) { buildPolyEnd(); toast('Polygon dropped. Build is still in hand.'); }   // one that was another map's goes without a word
        else { var mv = document.getElementById('moveModeBtn'); if (mv) mv.click(); }
    }
}
function buildMove(e) {   // the rubber band follows the pointer to the corner the next click would take
    var BC = buildCore(); if (!BC || !_build.poly || !_build.poly.length || !wbWrap || !buildPolyHere()) return;
    var r = wbWrap.getBoundingClientRect(), z = state.zoomLevel || 1, x = wbX(e.clientX, e.clientY, r, wbWrap), y = wbY(e.clientX, e.clientY, r, wbWrap);
    buildPolyDraw(BC.snapVertex(buildGrid(), x, y, !!(window.wpSnapOn && window.wpSnapOn())));
}
function buildWire() {   // the options' own controls, each once
    Array.prototype.forEach.call(document.querySelectorAll('#buildShapeRow .build-shape-btn'), function(b) { b.addEventListener('click', function(ev) { ev.stopPropagation(); var s = this.dataset.buildshape; buildPick(function() { return buildShape(s); }); }); });
    var tx = document.getElementById('buildTexture'); if (tx) tx.addEventListener('change', function() {
        var BC = buildCore(), v = this.value, name = function(t) { buildPick(function() { _build.pic = ''; _build.blk = ''; _build.tex = t === '' ? '' : ((BC && BC.cleanTexture(t)) || _build.tex); }); };   // the review of fold 4: a pick lets go of the block in hand
        if (typeof texListPick !== 'function') { name(v); return; }
        texListPick(v, buildSync, function(p) { if (p.pic) buildPick(function() { _build.pic = p.pic; _build.blk = ''; if (p.tile) _build.tile = texTileOf(p.tile); }); else name(p.tex); });   // fold B3: A picture opens the Image Library, and its pick is the fill
    });
    if (tx && typeof texListKeys === 'function') texListKeys(tx);
    if (typeof tileRowWire === 'function') tileRowWire('buildTileRow', function(t) { buildPick(function() { _build.tile = t; }); });
    Array.prototype.forEach.call(document.querySelectorAll('#buildColorRow .build-sw'), function(sw) { sw.addEventListener('click', function(ev) { ev.stopPropagation(); var c = buildHex6(this.dataset.color); buildPick(function() { if (!c) return false; _build.color = c; }); }); });
    var ci = document.getElementById('buildColorInput'); if (ci) ci.addEventListener('input', function() { var c = buildHex6(this.value); buildPick(function() { if (!c) return false; _build.color = c; }); });
    ['buildTerrainChk', 'buildTerrainCost'].forEach(function(id) { var e0 = document.getElementById(id); if (e0) e0.addEventListener('change', function() {
        var FC = window.wpFogCore, chk = document.getElementById('buildTerrainChk'), bx = document.getElementById('buildTerrainCost'), n = (bx && FC && FC.cleanTerrain ? FC.cleanTerrain(Number(bx.value)) : null) || 2;
        buildPick(function() { if (_build.mat !== 'water') return false; _build.terrain = chk && chk.checked ? n : 0; });
    }); });
    var cw = document.getElementById('buildCorridorW'); if (cw) cw.addEventListener('change', function() { var two = this.value === '2'; buildPick(function() { _build.corridorW = two ? 2 : 1; }); });
    var cwl = document.getElementById('buildCorridorWalls'); if (cwl) cwl.addEventListener('change', function() { var on = !!this.checked; buildPick(function() { _build.walls = on; }); });
    if (wbWrap) wbWrap.addEventListener('pointermove', buildMove);
    document.addEventListener('keydown', buildKey);
    wireTool({ id: 'buildModeBtn', chev: 'buildOptBtn', inHand: function() { return !!window.isBuildMode; }, sync: buildSync, take: buildTake });
    buildTabsWire(); buildLookWire();   // 1.6.2, backlog 171: the three tabs and the folded look
}
// [buildcheck:buildtool-end]
buildWire();
// [roomcheck:portalplace-start]
// 1.6.2 (the owner, 2026-11-14, of a new room's portal: "you place it, but there needs to be a clear indicator that this is happening. like a tile
// following the mouse cursor until it is placed, or escaped"). The Data Map hands here a room that just made its own map (datamap.js
// roomPortalArm): the play map of the map the room is on comes up, and a portal tile, drawn as the board draws that piece and half transparent,
// follows the pointer cell by cell on the map's lattice, a line beside it saying what a click does. A click lays an ordinary trigger zone linked
// to the room (roomcore portalPiece) in the cell clicked, so it is a portal through the room, one save. Esc skips it through esckey's router, and
// the room and its map stay. Another map or the Data Map on screen puts it down (main.js render asks wpPortalPlaceHold). Never on a player's
// app, at someone else's table or in the stream window
var PORTAL_RING = '#5ac8fa';   // the board's own portal color, for a piece that names none
var PORTAL_GLYPH = { 'Stairs Up': 'stairs-up', 'Stairs Down': 'stairs-down', 'Door': 'door', 'Gate': 'gate', 'Cave': 'cave', 'Tower': 'tower', 'Camp': 'camp' };   // the board's marker names
var _portal = null;   // the placement under way: { rec, ghost, tip }
function portalMay() { return !window.wpStream && buildMay() && !(window.wpNet && window.wpNet.foreign); }
function portalRoom(am, rec) { var r = am && rec && am.id === rec.mapId && Array.isArray(am.rooms) ? am.rooms.find(function(x) { return x && x.id === rec.roomId; }) : null; return r && r.targetMapId === rec.targetMapId ? r : null; }
function portalGrid(am) { var L = window.wpLatticeOf ? window.wpLatticeOf(am) : null; return L && (L.type === 'square' || L.type === 'hex') && window.wpFogCore ? L : null; }   // read fresh at every move and at the click: the grid may change while the tile waits
function portalKind(g) { return g ? g.type : 'none'; }   // 'square', 'hex' or 'none' (a circle)
// The tile wears the look the board gives the piece it places: a hex trigger's ring and fill clipped to a hexagon, a square trigger's dashed edge,
// a circle trigger's dashed edge rounded. Set again only when the grid's kind changed
function portalLook(ghost, kind) {
    if (ghost.dataset.kind === kind) return;
    ghost.dataset.kind = kind;
    ghost.className = 'portal-ghost' + (kind === 'hex' ? ' pg-hex' : kind === 'none' ? ' pg-circle' : '');
    ghost.style.background = kind === 'hex' ? withAlpha(PORTAL_RING, 0.55) : '';
    ghost.style.boxShadow = kind === 'hex' ? 'inset 0 0 0 4px ' + PORTAL_RING : '';
    ghost.style.border = kind === 'hex' ? '' : '3px dashed var(--gold)';
}
function portalBoxAt(am, x, y) {   // the cell under (x, y), or the point itself where the map has no grid
    var C = window.wpFogCore, g = portalGrid(am), ctr = g ? C.cellCenter(C.cellOf(x, y, g), g) : { x: x, y: y };
    return window.wpRoomCore.portalBox(g, ctr.x, ctr.y);
}
function portalSay(name) { return 'Click to place the portal to ' + name + '. Esc to skip.'; }
function portalSkipSay(rec) { return 'No portal placed. The room and its map stay. Press Place it on the room when you are ready.'; }   // the Later answer's own words (datamap.js roomPortalArm)
// The one rule for where a portal leads: the room's map must still be a map of the campaign. A map deleted from the Maps list leaves the room's
// targetMapId behind (dialogs.js), so a portal laid then would lead nowhere while it says where it leads
var PORTAL_GONE = 'That room\'s map is gone. No portal can be placed.';
function portalDest(rec) { var camp = getActiveCampaign(), d = camp && camp.items && rec && rec.targetMapId ? camp.items[rec.targetMapId] : null; return d && d.type === 'map' ? d : null; }
// The line beside the pointer: right of it and below, else left of it or above where it would run past the window's edge. Its size is read once it
// stands, so a long name keeps it in sight
function portalTipAt(tip, cx, cy) {
    tip.style.left = '0px'; tip.style.top = '0px';   // measured at the window's corner, so its width is its own and not what is left beside the pointer
    var x = cx + 18, y = cy + 22, w = tip.offsetWidth || 0, h = tip.offsetHeight || 0, W = window.innerWidth, H = window.innerHeight;
    if (W > 0 && w > 0 && x + w > W - 8) x = Math.max(8, cx - 18 - w);
    if (H > 0 && h > 0 && y + h > H - 8) y = Math.max(8, cy - 22 - h);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
}
function portalTipShow(on) { var P = _portal; if (P && P.tip) P.tip.style.display = on ? '' : 'none'; }   // put away while the pointer is off the map, or the window has no focus
function portalEnd() {
    var P = _portal; _portal = null;
    document.body.classList.remove('placing-portal');
    if (!P) return;
    if (P.ghost && P.ghost.parentNode) P.ghost.parentNode.removeChild(P.ghost);
    if (P.tip && P.tip.parentNode) P.tip.parentNode.removeChild(P.tip);
}
function portalGhostAt(am, x, y) {
    var P = _portal, b = P ? portalBoxAt(am, x, y) : null; if (!b) return;
    portalLook(P.ghost, portalKind(portalGrid(am)));
    if (!P.ghost.parentNode && wb) wb.appendChild(P.ghost);   // the board was drawn again meanwhile: the tile goes back on it
    P.ghost.style.left = b.x + 'px'; P.ghost.style.top = b.y + 'px'; P.ghost.style.width = b.w + 'px'; P.ghost.style.height = b.h + 'px';
}
function portalMove(e) {
    var P = _portal, am = getActiveMap(); if (!P || !am || !wbWrap) return;
    var rb = wbWrap.getBoundingClientRect();
    portalGhostAt(am, wbX(e.clientX, e.clientY, rb, wbWrap), wbY(e.clientX, e.clientY, rb, wbWrap));
    P.tip.style.display = ''; portalTipAt(P.tip, e.clientX, e.clientY);
}
window.wpPortalPlace = function(rec) {
    if (!rec || !portalMay() || !window.wpRoomCore || !wbWrap) return false;
    var am = getActiveMap(), room = portalRoom(am, rec); if (!room) return false;
    if (!portalDest(rec)) { toast(PORTAL_GONE); return null; }   // null: said here, so Place it on the room says nothing more (wpRoomPlace)
    if (state.viewMode !== 'visual' && window.wpSetViewMode) window.wpSetViewMode('visual');
    if (state.viewMode !== 'visual') return false;
    if (window.wpPlace) disarmPlacement(); else portalEnd();
    var mv = document.getElementById('moveModeBtn');
    if (mv && (!mv.classList.contains('active') || window.isMeasureMode)) mv.click();
    var camp = getActiveCampaign(), dest = camp && camp.items ? camp.items[rec.targetMapId] : null;
    var name = (dest && dest.meta && dest.meta.title) || room.name || 'the new map';
    var ghost = document.createElement('div'), mark = document.createElement('span'), tip = document.createElement('div');
    ghost.className = 'portal-ghost'; ghost.setAttribute('aria-hidden', 'true');   // its look and shape: portalLook, at each place it takes
    ghost.style.setProperty('--pi', 'var(--mk-' + (PORTAL_GLYPH[room.icon] || 'door') + ')');
    mark.className = 'pg-mark'; ghost.appendChild(mark);
    tip.className = 'portal-tip'; tip.setAttribute('role', 'status'); tip.textContent = portalSay(name);
    window.wpPlace = { type: 'portal', props: {}, portal: { mapId: rec.mapId, roomId: rec.roomId, targetMapId: rec.targetMapId, name: name } };
    wbWrap.style.cursor = 'crosshair';
    document.body.classList.add('placing'); document.body.classList.add('placing-portal');
    _portal = { rec: window.wpPlace.portal, ghost: ghost, tip: tip };
    document.body.appendChild(tip);
    var rb = wbWrap.getBoundingClientRect(), cx = rb.left + rb.width / 2, cy = rb.top + rb.height / 2;   // until the pointer moves: the middle of the view
    portalGhostAt(am, wbX(cx, cy, rb, wbWrap), wbY(cx, cy, rb, wbWrap));
    portalTipAt(tip, cx, cy);
    return true;
};
window.wpPortalPlaceHold = function(mapId, view) {   // main.js render: another map or the Data Map on screen puts the tile down
    var P = _portal; if (!P || (mapId === P.rec.mapId && view === 'visual')) return false;
    var rec = P.rec; disarmPlacement(); toast(portalSkipSay(rec)); return true;
};
function portalPlaceStep(rec, sx, sy) {
    var am = getActiveMap(), RCw = window.wpRoomCore;
    if (!RCw || !portalMay() || !am || am.id !== rec.mapId) { toast('That map is no longer on screen. No portal was placed.'); return null; }
    var room = portalRoom(am, rec); if (!room) { toast('That room no longer leads to its new map. No portal was placed.'); return null; }
    if (!portalDest(rec)) { toast(PORTAL_GONE); return null; }   // the map was deleted while the tile waited
    var pc = RCw.portalPiece(room, portalBoxAt(am, sx, sy), portalKind(portalGrid(am)));   // the grid as it is at the click
    if (!pc) { toast('No portal was placed.'); return null; }
    if (!Array.isArray(am.whiteboard)) am.whiteboard = [];
    var it = Object.assign({ id: 'wb' + uid(), z: 10 }, window.wpNewOpacityProps ? window.wpNewOpacityProps() : {}, pc);
    am.whiteboard.push(it);
    state.selWbId = it.id; state.selWbIds = [it.id];
    save(); render();
    toast('Portal placed. It leads to ' + rec.name + '. Double-click it to go there.');
    return it;
}
if (wbWrap) wbWrap.addEventListener('pointermove', portalMove);
if (wbWrap) { wbWrap.addEventListener('pointerleave', function() { portalTipShow(false); }); wbWrap.addEventListener('pointerenter', function() { portalTipShow(true); }); }
if (typeof window.addEventListener === 'function') window.addEventListener('blur', function() { portalTipShow(false); });
// [roomcheck:portalplace-end]
// [buildcheck:wallsrow-start]
// Walls around selection (the map builder, fold B2b; the owner, 2026-10-10, by prompt: "Walls first", on the "Right-click menu"). One row on the
// GM's menu of a selection that holds floor pieces (buildcore floorOk). It lays ordinary Wall lines, the very items the Build tool's Wall line
// draws, along the outer edge of the cells the floors cover together (buildcore outlineWalls). Nothing is derived live: each line is a piece of
// its own afterwards. The row is the GM's alone, on the machine that owns the campaign (buildMay), never in the stream window; its markup holds
// fixed words and the Wall line's own drawing, and nothing of a piece
var WALLS_ROW = '<div class="menu-item cm-walls" title="Thin wall lines along the outer edge of the selected floors together. Where two of them touch there is no wall between them, and a doorway that holds a door stays open. Each line is an ordinary piece afterwards, and one Undo takes them all back.">'
    + '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 18.5V8.5h13M3.5 18.5h4M18.5 6.5v4"/></svg><span>Walls around selection<small>Lays wall lines along the outer edge.</small></span></div>';
// 1.6.2 (backlog 39): Flatten into one picture, on the GM's menu of a selection the map picture would draw, and Unflatten on a flattened picture
var FLAT_ROW = '<div class="menu-item cm-flatten" title="The selected pieces drawn into one picture, saved with this campaign. The plain pieces are hidden, and Unflatten on the picture puts them back.">' + '<i class="wib wi-flatten"></i>' + '<span>Flatten into one picture&hellip;<small>Many pieces become one picture.</small></span></div>';
var UNFLAT_ROW = '<div class="menu-item cm-unflat" title="Puts back the pieces this picture was made from, as they were, and takes the picture away.">' + '<i class="wib wi-unflatten"></i>' + '<span>Unflatten<small>Puts its pieces back.</small></span></div>';
function flatRows(items) {
    var SCf = window.wpShotCore; if (window.wpStream || !buildMay() || !window.wpMapShot || typeof window.wpMapShot.flatten !== 'function') return null;
    var list = (Array.isArray(items) ? items : []).filter(Boolean), html = '';
    if (list.length === 1 && list[0].flatPic === true) html += UNFLAT_ROW;
    if (list.length >= 2 && SCf && typeof SCf.shows === 'function' && list.filter(function(w) { return SCf.shows(w, true); }).length >= 2) html += FLAT_ROW;
    return html ? { html: html } : null;
}
// [roomcheck:pieceroom-start]
// 1.6.2 (backlog 45, fold 1; the owner, 2026-11-11, by prompt: "A room from a play map piece"): Make a room for this, on the GM's menu of ONE piece that
// stands for an area and has no room yet (roomcore pieceRoomOk). It adds a room to this map's Data Map, beside the rooms there, links the piece to it
// (nodeId) and leaves its name ready to type in Properties. The menu saves and draws once, so one Undo takes both back. Never on a player's app or in
// the stream window. The row's drawing is the Data Map's Add Room drawing
var ROOM_ROW = '<div class="menu-item cm-room-make" title="A room on this map\u2019s Data Map, linked to this piece. Its name is ready to type in Properties.">'
    + '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4.5v15M4.5 12h15"/></svg><span>Make a room for this<small>Adds it to the Data Map, linked.</small></span></div>';
function pieceRoomRow(items, am) {
    var RCw = window.wpRoomCore, list = (Array.isArray(items) ? items : []).filter(Boolean);
    if (!RCw || window.wpStream || !buildMay() || list.length !== 1 || !RCw.pieceRoomOk(list[0], am && am.rooms)) return null;
    return { item: list[0], html: ROOM_ROW };
}
function pieceRoomMake(am, w) {
    var RCw = window.wpRoomCore; if (!RCw || !am || am.type !== 'map') return null;
    if (!Array.isArray(am.rooms)) am.rooms = [];
    if (!RCw.pieceRoomOk(w, am.rooms)) return null;
    var p = RCw.besideRooms(am.rooms), rm = RCw.newRoom(uid(), am.rooms, am.cats, p.x, p.y, RCw.pieceRoomName(w));
    am.rooms.push(rm); w.nodeId = rm.id;
    return rm;
}
// [roomcheck:pieceroom-end]
// [roomcheck:roomplace-start]
// 1.6.2 (backlog 45, fold 3; the owner, 2026-11-11, by prompt: "Draw its place from the room", "Show it, both ways", "Room names as GM labels",
// and 2026-11-12: "C. Ask each time", "A. A View tick, on"). Place it on a room arms the map's next drag: a box over the room's place, then a
// question, its buttons alone, whether the place is an area only the GM sees or a floor players see (roomcore roomPlacePiece). One save, so one
// Undo takes it back. Esc puts the drag down. Never on a player's app or in the stream window (buildMay)
var ROOM_LEADS = 'This room leads to another map, so a piece linked to it is a way there. Link the doorway piece to it in Properties instead.';
function roomPlaceArm(rec, say) {
    var mv = document.getElementById('moveModeBtn');
    if (mv && (!mv.classList.contains('active') || window.isMeasureMode)) mv.click();
    window.wpPlace = { type: 'roomplace', props: {}, roomplace: rec };
    if (wbWrap) wbWrap.style.cursor = 'crosshair';
    document.body.classList.add('placing');
    if (say) toast('Drag a box over where ' + rec.name + ' is on the map. Esc cancels.');
}
window.wpRoomPlace = function(roomId) {
    var am = getActiveMap(), room = am && am.type === 'map' ? (am.rooms || []).find(function(r) { return r.id === roomId; }) : null;
    if (!room || window.wpStream || !buildMay()) return false;
    if (room.targetMapId) {   // the review: every piece linked to such a room is a way to that map, and a hidden one a trap tile, so a place drawn over the whole room would send a token dropped anywhere in it
        var pOk = window.wpPortalPlace ? window.wpPortalPlace({ mapId: am.id, roomId: room.id, targetMapId: room.targetMapId }) : false;
        if (pOk) return true;   // 1.6.2 (the owner, 2026-11-14): its place is a portal of one cell, laid as a new room's is
        if (pOk === null) return false;   // its map is gone, which wpPortalPlace said
        toast(ROOM_LEADS); return false;
    }
    if (window.wpSetViewMode) window.wpSetViewMode('visual');
    roomPlaceArm({ mapId: am.id, roomId: room.id, name: room.name || 'the room' }, true);
    return true;
};
function roomPlaceStep(rec, px, py, pw, ph) {
    var am = getActiveMap(), RCw = window.wpRoomCore;
    if (!RCw || !am || am.id !== rec.mapId) { toast('That map is no longer on screen. Nothing was placed.'); return; }
    var room = (am.rooms || []).find(function(r) { return r.id === rec.roomId; });
    if (!room) { toast('That room is gone. Nothing was placed.'); return; }
    if (room.targetMapId) { toast(ROOM_LEADS); return; }
    if (!(pw > 12 && ph > 12)) { roomPlaceArm(rec, false); toast('Drag a box over where ' + rec.name + ' is on the map. Esc cancels.'); return; }
    var box = { x: px, y: py, w: pw, h: ph };
    showConfirm('The place of ' + (room.name || 'this room') + ': an area only you see, or a floor players see?', function(ans) {
        if (ans !== true && ans !== 'alt') { toast('Nothing was placed.'); return; }
        var am2 = getActiveMap(), room2 = am2 && am2.id === rec.mapId ? (am2.rooms || []).find(function(r) { return r.id === rec.roomId; }) : null;
        if (!room2) { toast('That room is gone. Nothing was placed.'); return; }
        if (room2.targetMapId) { toast(ROOM_LEADS); return; }
        var BC = window.wpBuildCore, floor = ans === 'alt' && BC && typeof BC.pieceProps === 'function' ? BC.pieceProps('floor') : null;
        var pc = RCw.roomPlacePiece(ans === true ? 'area' : 'floor', room2, box, floor); if (!pc) { toast('Nothing was placed.'); return; }
        if (!Array.isArray(am2.whiteboard)) am2.whiteboard = [];
        var it = Object.assign({ id: 'wb' + uid(), z: 1 }, pc);
        if (typeof structLaid === 'function') structLaid([it]);   // 231: a floor is structure (an area only the GM sees is hidden, and no floor)
        am2.whiteboard.push(it);
        state.selWbId = it.id; state.selWbIds = [it.id];
        save(); render();
        toast(ans === true ? 'Placed: an area only you see, for ' + it.name + '. Tokens standing in it are in the room.' : 'Placed: a floor for ' + it.name + ', shown to players.');
    }, { yes: 'An area only I see', alt: 'A floor players see', noEnter: true });
}
// 1.6.2 (backlog 42): Open contents, on the GM's menu of ONE container
var BOX_OPEN_ROW = '<div class="menu-item cm-box-open" title="See and change what this container holds."><i class="wib wi-chest"></i><span>Open contents<small>What it holds, as tiles.</small></span></div>';
function boxOpenRow(items) { var list = (Array.isArray(items) ? items : []).filter(Boolean), B = window.wpBoxes; if (!B || !B.gmMay() || list.length !== 1 || !B.has(list[0]) || !B.pieceOk(list[0])) return null; return { item: list[0], html: BOX_OPEN_ROW }; }
// Show on the Data Map, on the GM's menu of ONE piece whose room is on the Data Map
var ROOM_SHOW_ROW = '<div class="menu-item cm-room-show" title="Switch to the Data Map with this piece\u2019s room selected and in view.">'
    + '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM18 16.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM8 6.5l8 11"/></svg><span>Show on the Data Map<small>Its room, selected.</small></span></div>';
function roomShowRow(items, am) {
    var list = (Array.isArray(items) ? items : []).filter(Boolean);
    if (window.wpStream || !buildMay() || list.length !== 1 || !list[0].nodeId || !am || !(am.rooms || []).some(function(r) { return r.id === list[0].nodeId; })) return null;
    return { item: list[0], html: ROOM_SHOW_ROW };
}
// Room names on the play map: a plate at the top left of a piece that names a room, on the GM's screen alone, while the View menu's Room names
// is ticked (this computer's wp_roomNames, ticked to start). The room's name is set as text.
// 1.6.3 (the owner, editing his maps: a portal's name "is not legible enough to be useful", drawn under the tokens on the door): the plates
// stand in a layer of their own, #roomNameLayer, a child of the board above every piece and token (style.css), never inside the piece, so a
// token standing on a doorway no longer covers its name and a hexagon's clip no longer cuts it. roomNameSync notes a plate for each named piece
// as the board draws it; at the draw's end window.wpRoomNamesEnd takes away the plates no piece asked for in that draw and places the rest from
// their pieces' own geometry (rnPlace), and the board's handles ask window.wpRoomNamesPlace as a piece is dragged, so a plate follows its piece.
// A plate mirrors its piece's being out of sight (interaction layers, a flattened piece, Hidden pieces set to Invisible), takes no pointer and is
// counter-scaled, so it reads the same size on screen at any zoom. Nothing of it is ever drawn on a player's app or in the stream window
var _rnPlates = Object.create(null), _rnGen = 0;   // the plates by piece id; the draw they were last asked for in
var RN_MID = ['hexagon', 'hex-trigger', 'diamond', 'trigger-diamond', 'triangle', 'star', 'circle'];   // pieces whose corner is cut or round: the name stands in the middle
var _rnL = null;   // the layer, kept once made
function rnLayer() {
    var wb = document.getElementById('whiteboard'); if (!wb) return null;
    if (_rnL && _rnL.parentNode === wb) return _rnL;
    _rnL = document.getElementById('roomNameLayer');
    if (!_rnL) { _rnL = document.createElement('div'); _rnL.id = 'roomNameLayer'; _rnL.setAttribute('aria-hidden', 'true'); wb.appendChild(_rnL); }
    return _rnL;
}
// One plate placed from its piece: at the piece's top left, 4 px in, turned with the piece about its middle; in the middle of a cut or round piece
function rnPlace(tag) {
    var it = tag._item, el = tag._el, cl = el && el.classList;
    var off = !it || !el || el.isConnected === false || (el.style && el.style.display === 'none') || !!(cl && (cl.contains('il-off') || cl.contains('wb-flat-in')));
    tag.classList.toggle('rn-off', off);
    tag.classList.toggle('rn-hid', !!(cl && cl.contains('wb-hidden-gm') && !cl.contains('wb-room-area')));
    rnNear(tag);
    if (off) return;
    var x = +it.x || 0, y = +it.y || 0, w = typeof it.w === 'number' ? it.w : 100, h = typeof it.h === 'number' ? it.h : 100;
    var mid = !!cl && RN_MID.some(function(k) { return cl.contains(k); }), cx = x + w / 2, cy = y + h / 2, ax = cx, ay = mid ? y : cy;   /* a cut or round piece (a door hex): just above its top edge, so the token standing on it stays in sight */
    if (!mid) { var dx = 4 - w / 2, dy = 4 - h / 2, r = (+it.rot || 0) * Math.PI / 180, co = Math.cos(r), si = Math.sin(r); ax = cx + dx * co - dy * si; ay = cy + dx * si + dy * co; }
    tag.classList.toggle('rn-mid', mid);
    var L = ax.toFixed(1) + 'px', T = ay.toFixed(1) + 'px';
    if (tag.style.left !== L) tag.style.left = L;
    if (tag.style.top !== T) tag.style.top = T;
}
// 1.6.4 (Fulllion, mid-game: "why are the labels over map areas the players play on?"): zoomed out, the plates shrink and then go away
// (settings.js namesZoom, style.css). A plate stays at full size and on top while its piece is under the pointer, selected (alone or one of
// several), or a door lit by a token beside it (wb-door-near). The plate takes no pointer and stands outside its piece, so it cannot read the
// piece's :hover in the style sheet: rnNear copies these onto the plate as rn-near. The pointer is read by one listener, at most once a frame
// (rnHover): a plate is pointed at while the pointer stands inside its piece's box on the board (so a room's area, which takes no pointer,
// counts too) or on any other piece of the same room, a door on it say. The box is the piece's own, unturned: near enough for a name
var _rnPt = null, _rnRaf = 0, _rnHovEl = null, _rnHovRoom = null;
function rnNear(tag) {
    var cl = tag && tag._el && tag._el.classList;
    tag.classList.toggle('rn-near', !!cl && (tag._hov === true || cl.contains('sel') || cl.contains('wb-msel') || cl.contains('wb-door-near')));
}
window.wpRoomNamesNear = function() { for (var id in _rnPlates) rnNear(_rnPlates[id]); };   // asked again once the board has lit its doors (the selection bar's refresh)
function rnHover() {
    _rnRaf = 0; var e = _rnPt; _rnPt = null; if (!e) return;
    var wrap = wbWrap || document.getElementById('whiteboardWrap');
    var inB = !!(wrap && e.target && e.target.closest && e.target.closest('#whiteboardWrap')), bx = NaN, by = NaN;
    if (inB) { var r = wrap.getBoundingClientRect(); bx = wbX(e.clientX, e.clientY, r, wrap); by = wbY(e.clientX, e.clientY, r, wrap); }
    var el = inB ? e.target.closest('#whiteboard .wb-item') : null;
    if (el !== _rnHovEl) {   // the room of the piece under the pointer, looked up only when that piece changes
        _rnHovEl = el; _rnHovRoom = null;
        var hid = el && el.dataset ? el.dataset.id : null, am = hid && typeof getActiveMap === 'function' ? getActiveMap() : null;
        var hw = am && Array.isArray(am.whiteboard) ? am.whiteboard.find(function(x) { return x && x.id === hid; }) : null;
        if (hw && hw.nodeId) _rnHovRoom = hw.nodeId;
    }
    for (var id in _rnPlates) {
        var t = _rnPlates[id], w = t._item, on = false;
        if (w && inB) {
            var x = +w.x || 0, y = +w.y || 0, ww = typeof w.w === 'number' ? w.w : 100, hh = typeof w.h === 'number' ? w.h : 100;
            on = (bx >= x && bx <= x + ww && by >= y && by <= y + hh) || (!!_rnHovRoom && w.nodeId === _rnHovRoom);
        }
        if (t._hov !== on) { t._hov = on; rnNear(t); }
    }
}
if (typeof document !== 'undefined' && document && typeof document.addEventListener === 'function') document.addEventListener('pointermove', function(e) {
    for (var k in _rnPlates) { _rnPt = e; if (!_rnRaf) _rnRaf = requestAnimationFrame(rnHover); return; }   // with no plate on the board there is nothing to look up
}, { passive: true });
window.wpRoomNamesPlace = function() { for (var id in _rnPlates) rnPlace(_rnPlates[id]); };
window.wpRoomNamesEnd = function() {
    for (var id in _rnPlates) { var t = _rnPlates[id]; if (t._gen !== _rnGen) { if (t.parentNode) t.parentNode.removeChild(t); delete _rnPlates[id]; } else rnPlace(t); }
};
var _roomNames = null;   // the View tick, read from this computer once and kept
function roomNamesOn() { if (_roomNames === null) { try { _roomNames = localStorage.getItem('wp_roomNames') !== 'off'; } catch (e) { _roomNames = true; } } return _roomNames; }
// The pieces that wear a name, worked out once a draw: each room's place (roomcore roomPlaceOf's rule, in one pass), never a small mark that also
// names the room, a text box, a token, a waiting token or a GM note card. Null where no name is drawn at all (unticked, a player's app, the stream window)
function roomNamePlaces(am) {
    _rnGen++;   // 1.6.3: a new draw; the plates it does not ask for go at its end (wpRoomNamesEnd)
    if (!roomNamesOn() || window.wpStream || !buildMay() || !am || !Array.isArray(am.rooms) || !am.rooms.length || !Array.isArray(am.whiteboard)) return null;
    if (am.meta && am.meta.nameShow === false) return null;   // 1.6.4: the map's own switch, Show names on this map, unticked in Map properties
    var byRoom = Object.create(null), best = Object.create(null), out = Object.create(null), off = Object.create(null);
    am.rooms.forEach(function(r) { if (r && typeof r.id === 'string') byRoom[r.id] = r; });
    am.whiteboard.forEach(function(w) {
        if (w && w.nodeId && w.nameShow === false) off[w.nodeId] = 1;   // 1.6.4: any piece of the room unticked Show its name on the map (inspector.js keeps them alike)
        if (!w || !w.nodeId || !byRoom[w.nodeId] || w.isChar || w.waiting || w.gmNoteFor || w.type === 'text' || !isFinite(w.x) || !isFinite(w.y)) return;
        var a = Math.max(0, typeof w.w === 'number' ? w.w : 100) * Math.max(0, typeof w.h === 'number' ? w.h : 100);
        if (!best[w.nodeId] || a > best[w.nodeId].a) best[w.nodeId] = { a: a, id: w.id };
    });
    Object.keys(best).forEach(function(rid) { if (!off[rid]) out[best[rid].id] = byRoom[rid]; });   // 1.6.4: a room the GM unticked Show its name on the map for wears none
    return out;
}
function roomNameSync(el, item, places) {
    var room = places && item && places[item.id];
    if (!room) return;   // the review: thousands of pieces, most naming no room, pass by at once; a plate no longer asked for goes at the draw's end
    var layer = rnLayer(); if (!layer) return;
    var tag = _rnPlates[item.id];
    if (!tag || tag.parentNode !== layer) { tag = document.createElement('div'); tag.className = 'wb-room-name'; tag.setAttribute('aria-hidden', 'true'); layer.appendChild(tag); _rnPlates[item.id] = tag; }
    tag._el = el; tag._item = item; tag._gen = _rnGen;
    var nm = room.name || '(unnamed)'; if (tag.textContent !== nm) tag.textContent = nm;
}
function roomNamesSync() {
    var b = document.getElementById('wbRoomNamesBtn'), on = roomNamesOn();
    if (b) { b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); }
}
(function() {
    var b = document.getElementById('wbRoomNamesBtn'); if (!b) return;
    roomNamesSync();
    b.addEventListener('click', function() {
        var on = !roomNamesOn(); _roomNames = on; try { localStorage.setItem('wp_roomNames', on ? 'on' : 'off'); } catch (e) {}
        roomNamesSync(); render();
        toast(on ? 'Room names show on the play map, for you alone.' : 'Room names are put away.');
    });
})();
// [roomcheck:roomplace-end]
function wallsRow(items) {
    var BC = buildCore();
    if (!BC || typeof BC.outlineWalls !== 'function' || window.wpStream || !buildMay()) return null;
    var fl = (Array.isArray(items) ? items : []).filter(function(w) { return BC.floorOk(w); });
    return fl.length ? { items: fl, html: WALLS_ROW } : null;
}
// The walls laid on the map, all or none; what to say of it. A map with no grid takes the 50 px lattice Build seats its pieces on
function wallsLay(map, items) {
    var row = wallsRow(items), BC = buildCore(), FC = window.wpFogCore;
    if (!row || !FC || !map || map.type !== 'map' || !Array.isArray(map.whiteboard)) return '';
    var res = BC.outlineWalls(row.items, buildGrid() || FC.squareGrid(50), { doors: map.whiteboard, have: map.whiteboard }), pre = BC.penPreset('wall', {});
    if (res.over) return 'Those floors cover too much ground for walls at once. Select fewer pieces.';
    if (!res.lines.length || !pre) return res.had ? 'Those walls are already there.' : 'There is nothing to wall there.';
    if (map.whiteboard.length + res.lines.length > BUILD_MAX) return 'This map holds as many pieces as it can carry to players, ' + BUILD_MAX + '. No wall was laid.';
    res.lines.forEach(function(L) { var wi = buildWallItem(L, pre); if (typeof structLaid === 'function') structLaid([wi]); map.whiteboard.push(wi); });
    return (res.lines.length === 1 ? 'One wall line laid.' : res.lines.length + ' wall lines laid.') + (res.doorsOver === true ? ' Some door lines were not read. Check the doorways.' : '');
}
// [buildcheck:wallsrow-end]
// [split:body-end]
return { BUILD_MAX: BUILD_MAX, boxOpenRow: boxOpenRow, buildAsking: buildAsking, buildCore: buildCore, buildDown: buildDown, buildHere: buildHere, buildKey: buildKey, buildMay: buildMay, buildPolyEnd: buildPolyEnd, buildStructSync: buildStructSync, buildWallItem: buildWallItem, flatRows: flatRows, genPreviewDraw: genPreviewDraw, groundPic: groundPic, pieceRoomMake: pieceRoomMake, pieceRoomRow: pieceRoomRow, portalEnd: portalEnd, portalPlaceStep: portalPlaceStep, portalSkipSay: portalSkipSay, roomNamePlaces: roomNamePlaces, roomNameSync: roomNameSync, roomPlaceStep: roomPlaceStep, roomShowRow: roomShowRow, structDo: structDo, structLaid: structLaid, structRow: structRow, structRowHtml: structRowHtml, wallsLay: wallsLay, wallsRow: wallsRow, wpBuildCommit: wpBuildCommit };   // [split:glue]
}   // [split:glue]
