/* wbgen.js: a part of whiteboard.js (docs/REFACTOR_SPLIT_PLAN.md, area 4, the map builder; split 2026-11-18 with no change in behavior).
   What it holds: the dialogs of the three generators at the foot of Build's options, each laying ordinary pieces from a seed: a dungeon
   ([buildcheck:gendialog-*], #genModal, gencore.js), a city ([buildcheck:citydialog-*], #cityModal, citycore.js) and a world
   ([buildcheck:worlddialog-*], #worldModal, worldcore.js), with the helpers they share (genEl, genMaps, genCountWords, genNewSeed). The
   Build tool itself lives in wbbuild.js.
   Why it looks this way: these lines stood in whiteboard.js, and they still run exactly where they stood. whiteboard.js calls wbGen()
   at its line `// [split:wbgen.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads
   whiteboard.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of
   whiteboard.js (live, so a value whiteboard.js changes later is read as it is then); the last line hands back the names whiteboard.js
   uses of it. Neither side may assign the other's names (tools/splitcheck.js holds it). Change the code here as if it still stood in
   whiteboard.js. */
// [split:of whiteboard.js]
import { BUILD_MAX, applyMapStart, buildAsking, buildCore, buildHere, buildMay, buildWallItem, createNewMap, genPreviewDraw, getActiveCampaign, getActiveMap, getUniqueItemTitle, navigateToMap, newOpacityProps, render, save, state, structLaid, toast, uid, undo, viewCentre, wb } from './whiteboard.js';   // [split:glue]
export function wbGen() {   // [split:glue]
// [split:body-start]
// [buildcheck:gendialog-start]
// The dungeon made for you (the map builder, fold B2; the owner's answers of 2026-10-10 on the two sheets: the dialog "As drawn", the
// Build it on row with "A new map picks its grid", "Taken to that map" afterwards, the command in "Build's options"). The last row of
// Build's options opens one dialog. Its settings go to the pure half (gencore.js), which answers geometry, and what is laid is ORDINARY
// pieces: floors with the Floor material's own props, wall lines and door lines as the pen's presets make them. Nothing on the map is
// changed and nothing is derived live. It is laid in one save, so one Undo takes it back. The seed and settings are kept on the map
// (meta.gen) for the GM alone, to make it again: net.js never sends them and an import cleans them. The dialog is the GM's (buildMay) and
// its markup is fixed words in the page: a map's name reaches the list as an option's text, never as markup
var GEN_LINES = { here: 'Its top left corner goes where the middle of your screen is. Nothing on the map is changed.', other: 'It lands in the middle of that map as you last saw it. You are taken there once it is made.', fresh: 'A new map is made for it. You are taken there once it is made.', none: 'This campaign has no other map.' };
var GEN_WHERE = ['here', 'other', 'fresh'];
var _gen = { where: 'here', maps: '' };
function genCore() { return window.wpGenCore || null; }
function genEl(id) { return document.getElementById(id); }
function genText(v, n) { return String(v === null || v === undefined ? '' : v).replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n); }
function genShown() { var m = genEl('genModal'); return !!m && m.style.display === 'flex'; }
// The lattice a dungeon is laid on: a map's own hex or square grid, and the 50 px lattice Build seats its pieces on where it has none
function genKind(map) { var g = map && map.meta && typeof map.meta === 'object' ? map.meta.gridType : null; return g === 'hex' ? 'hex' : 'square'; }
function genBare(g) { var o = {}; Object.keys(g).forEach(function(k) { if (k !== 'ox' && k !== 'oy') o[k] = g[k]; }); return o; }
function genGridFor(kind, map) { var C = window.wpFogCore; if (!C) return null; if (map && window.wpLatticeOf) { var GL = window.wpLatticeOf(map); if (GL && GL.type === kind) return GL; } return kind === 'hex' ? C.hexGrid(30, 52) : C.squareGrid(50); }   // 1.6.2, backlog 38: a map's own cell (none for a new map)
// The campaign's maps other than the one on screen, by name: [{ id, title }]
function genMaps(camp, hereId) {
    var out = []; if (!camp || !camp.items || typeof camp.items !== 'object') return out;
    Object.keys(camp.items).forEach(function(id) {
        var it = camp.items[id]; if (!it || typeof it !== 'object' || it.type !== 'map' || it.id !== id || id === hereId) return;
        out.push({ id: id, title: genText(it.meta && typeof it.meta === 'object' ? it.meta.title : '', 80) || 'Untitled' });
    });
    out.sort(function(a, b) { return a.title.localeCompare(b.title) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
    return out;
}
// Where a dungeon's top left corner goes: the middle of the view (`mid`, the screen's own, for the map on screen), else the middle of the
// map as it was last seen, else its home, moved so that the whole dungeon and a cell to spare stay on the board
function genCorner(map, mid, grid, cols, rows) {
    var meta = map && map.meta && typeof map.meta === 'object' ? map.meta : {}, num = function(v) { return typeof v === 'number' && isFinite(v); };
    var x = mid && num(mid.x) ? mid.x : num(meta.lastWbX) ? meta.lastWbX : num(meta.homeX) ? meta.homeX : 15000, y = mid && num(mid.y) ? mid.y : num(meta.lastWbY) ? meta.lastWbY : num(meta.homeY) ? meta.homeY : 15000;
    var hex = grid.type === 'hex', w = hex ? (cols + 1) * 1.5 * grid.s + grid.s : (cols + 1) * grid.size, h = hex ? (rows + 2) * grid.h : (rows + 1) * grid.size;
    return { x: Math.max(0, Math.min(30000 - w, x)), y: Math.max(0, Math.min(30000 - h, y)) };
}
function genCountWords(n, held) { return 'This would lay ' + n + ' pieces. The map holds ' + BUILD_MAX + '.' + (held + n > BUILD_MAX ? ' It has ' + held + ' already, so this does not fit.' : ''); }
function genNewSeed() { var GC = genCore(); return GC ? GC.seedOf(Math.floor(Math.random() * 320000)) : '0000-fox'; }
// The form as the generator's settings, and the settings into the form
function genForm() {
    var GC = genCore(); if (!GC) return null;
    var val = function(id) { var e = genEl(id); return e ? String(e.value) : ''; }, num = function(id, d) { var s = val(id).trim(), v = Number(s); return s !== '' && isFinite(v) ? v : d; };
    return GC.cleanGen({ seed: val('genSeed').trim(), w: num('genW', GC.SIZE.w), h: num('genH', GC.SIZE.h), rooms: val('genRooms'), corr: val('genCorr'), doors: val('genDoors'), theme: val('genTheme'), furn: val('genFurn') });
}
// The two Size boxes written as the sizes that will be used (10 to 60, whole). True when a box read otherwise: what was laid would not
// have been what the box showed
function genSizes() {
    var o = genForm(), w = genEl('genW'), h = genEl('genH'), moved = false; if (!o) return false;
    if (w && String(w.value) !== String(o.w)) { w.value = String(o.w); moved = true; }
    if (h && String(h.value) !== String(o.h)) { h.value = String(o.h); moved = true; }
    return moved;
}
function genFill(o) {
    var set = function(id, v) { var e = genEl(id); if (e) e.value = String(v); };
    set('genSeed', o.seed); set('genW', o.w); set('genH', o.h); set('genRooms', o.rooms); set('genCorr', o.corr); set('genDoors', o.doors); set('genTheme', o.theme || 'fantasy'); set('genFurn', o.furn || 'few');
}
// What Generate would do now: { ok, say } and, where it can be laid, { map (null for a new one), fresh, kind, opts, pieces }
function genPlan() {
    var GC = genCore(), BC = buildCore(), camp = getActiveCampaign(), here = getActiveMap(), no = { ok: false, say: 'A dungeon cannot be built here.' };
    if (!GC || !BC || !camp || !camp.items || !here || here.type !== 'map' || !buildMay() || !buildHere()) return no;
    var seedBox = genEl('genSeed'), typed = seedBox ? String(seedBox.value).trim() : '', opts = genForm();
    if (!opts || opts.seed !== typed) return { ok: false, say: 'A seed is letters, digits and hyphens, 24 at most.' };
    var where = GEN_WHERE.indexOf(_gen.where) >= 0 ? _gen.where : 'here', map = here, fresh = where === 'fresh', kind;
    if (where === 'other') {
        var sel = genEl('genMap'), id = sel ? String(sel.value) : '';
        map = id && id !== here.id && Object.prototype.hasOwnProperty.call(camp.items, id) && camp.items[id] && camp.items[id].type === 'map' ? camp.items[id] : null;
        if (!map) return { ok: false, say: GEN_LINES.none };
    }
    if (fresh) { var gs = genEl('genGrid'); kind = gs && gs.value === 'hex' ? 'hex' : 'square'; map = null; } else kind = genKind(map);
    var grid = genGridFor(kind, map); if (!grid) return no;
    var dg = GC.genDungeon(opts), at = genCorner(map, where === 'here' ? viewCentre() : null, grid, dg.cols, dg.rows), gox = grid.ox || 0, goy = grid.oy || 0, pc = GC.dungeonPieces(dg, gox || goy ? genBare(grid) : grid, at.x - gox, at.y - goy);
    if (gox || goy) [pc.floors, pc.doors, pc.walls].forEach(function(list) { (list || []).forEach(function(b) { if (b && typeof b.x === 'number') b.x += gox; if (b && typeof b.y === 'number') b.y += goy; }); });   // a lattice off the board's 0,0: laid from 0,0 and moved by its origin
    if (!pc.floors.length || !pc.walls.length) return { ok: false, say: 'That dungeon could not be laid out. Try another seed.' };
    var FG = window.wpFurnGen;   // 1.6.2 (backlog 222): its furnishings, by the same lattice and moved the same way
    var fu = { list: FG ? FG.roomFurnish(dg, opts.furn, gox || goy ? genBare(grid) : grid, at.x - gox, at.y - goy) : [], hex: grid.type === 'hex' };
    fu.list.forEach(function(p) { p.x += gox; p.y += goy; }); fu.cell = fu.hex ? { w: 2 * grid.s, h: grid.h } : { w: grid.size, h: grid.size };
    var held = map && Array.isArray(map.whiteboard) ? map.whiteboard.length : 0, nAll = pc.count + fu.list.length;
    if (held + nAll > BUILD_MAX) return { ok: false, say: genCountWords(nAll, held) };
    return { ok: true, say: genCountWords(nAll, held), map: map, fresh: fresh, kind: kind, opts: opts, pieces: pc, furn: fu };
}
// The dungeon's pieces as ordinary items: the very items the Build tool lays for a Floor and draws for a Wall line and a Door line
function genItems(pc, theme, furn) {
    var BC = buildCore(), T = BC ? BC.THEMES[BC.cleanTheme(theme)] : null, fp = T ? BC.pieceProps(T.floor, {}) : null, wp = T ? BC.penPreset(T.wall, {}) : null, dp = T ? BC.penPreset(T.door, {}) : null, out = [];
    if (!fp || !wp || !dp) return out;
    pc.floors.forEach(function(b) { out.push(Object.assign({ id: 'wb' + uid(), type: b.type, x: b.x, y: b.y, w: b.w, h: b.h, z: 10 }, newOpacityProps(), fp)); });
    pc.walls.forEach(function(L) { out.push(buildWallItem(L, wp)); });
    pc.doors.forEach(function(L) { out.push(buildWallItem(L, dp)); });
    if (typeof genFurnItems === 'function') genFurnItems(furn, theme).forEach(function(it) { out.push(it); });
    return out;
}
// 1.6.2 (backlog 222, fold 5): a generator's furnishings as the pieces Build's Objects tab lays, each in the theme's era and the Looks
// list's pack where it has that kind, its middle where furngen.js put it, never locked. fu { list: [{ k, x, y, rot }], cell, hex }, the
// plan's own beside its pieces
function genFurnItems(fu, theme) {
    var FN = window.wpFurnish, BC = buildCore(), out = []; if (!FN || !FN.genProps || !BC || !fu || !Array.isArray(fu.list) || !fu.cell) return out;
    var era = BC.cleanTheme(theme);
    fu.list.forEach(function(p) {
        var pr = FN.genProps(p.k, era, fu.hex, fu.cell); if (!pr || !(pr.w > 0) || !(pr.h > 0)) return;
        if (fu.hex && (p.rot === 90 || p.rot === 270)) { var cw = pr.w / fu.cell.w, ch = pr.h / fu.cell.h; pr.w = Math.round(cw * fu.cell.h); pr.h = Math.round(ch * fu.cell.w); }   // turned along a column of hexagons, its length is counted in rows and its width in a hexagon's width
        var it = Object.assign({ id: 'wb' + uid(), type: 'image', x: Math.round(p.x - pr.w / 2), y: Math.round(p.y - pr.h / 2), z: 10 }, newOpacityProps(), pr);
        if (p.rot) it.rot = p.rot;
        out.push(it);
    });
    return out;
}
// The other maps as the list's options, made again only when the list changed, so a pick stands: elements with text, never markup
function genMapsFill() {
    var sel = genEl('genMap'), camp = getActiveCampaign(), here = getActiveMap(); if (!sel) return 0;
    var list = genMaps(camp, here ? here.id : ''), sig = JSON.stringify(list);
    if (sig === _gen.maps) return list.length;
    var was = String(sel.value || '');
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    list.forEach(function(m) { var o = document.createElement('option'); o.value = m.id; o.appendChild(document.createTextNode(m.title)); sel.appendChild(o); });
    sel.value = list.some(function(m) { return m.id === was; }) ? was : (list[0] ? list[0].id : '');
    _gen.maps = sig;
    return list.length;
}
// The dialog as it stands: the chip in use, the row its choice needs, the line that says where it lands, the count, and Generate put out
// of use with the reason in sight where the dungeon cannot be laid
function genSync() {
    if (!genShown()) return;
    var where = GEN_WHERE.indexOf(_gen.where) >= 0 ? _gen.where : 'here';
    Array.prototype.forEach.call(document.querySelectorAll('#genWhere .gen-chip'), function(b) { var on = b.dataset.where === where; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    var mr = genEl('genMapRow'), nr = genEl('genNameRow'), ln = genEl('genWhereLine'), ct = genEl('genCount'), go = genEl('genGo');
    if (mr) mr.hidden = where !== 'other';
    if (nr) nr.hidden = where !== 'fresh';
    var others = where === 'other' ? genMapsFill() : 1;
    if (ln) ln.textContent = where === 'other' && !others ? GEN_LINES.none : GEN_LINES[where];
    var plan = genPlan();
    if (ct) ct.textContent = plan.say;
    if (go) go.disabled = !plan.ok;
    if (typeof genPreviewDraw === 'function') genPreviewDraw('genModal', plan.ok ? genItems(plan.pieces, plan.opts ? plan.opts.theme : '', plan.furn) : null);   // 1.6.2: the small preview
}
function genShow() {
    var m = genEl('genModal'), GC = genCore(), here = getActiveMap(); if (!m || !GC || !buildCore() || !buildMay() || !buildHere() || !here) return false;
    var kept = here.meta && typeof here.meta === 'object' && here.meta.gen && typeof here.meta.gen === 'object' ? GC.cleanGen(here.meta.gen) : null;
    if (kept && !Object.prototype.hasOwnProperty.call(here.meta.gen, 'furn')) kept.furn = 'none';   // a dungeon laid before Furnishings was laid with none: made again, it stays as it was
    if (kept) genFill(kept); else { var sb = genEl('genSeed'); if (sb) sb.value = genNewSeed(); }   // a map that keeps its dungeon's seed shows it, to make it again; else a new seed each time
    var nm = genEl('genName'); if (nm) nm.value = 'Dungeon';
    _gen.where = 'here'; _gen.maps = '';
    m.style.display = 'flex';
    genSync();
    var first = document.querySelector('#genWhere .gen-chip.on'); if (first && first.focus) first.focus();
    return true;
}
function genHide() { var m = genEl('genModal'); if (!m || m.style.display === 'none') return; m.style.display = 'none'; var b = genEl('buildGenBtn'); if (b && b.focus) b.focus(); }
// Before a dialog lays its pieces the run of typing in its own field ends: the app's history folds a save into the step before it while a
// text field's run is open on that map, and what is laid must be a step of its own, which one Undo takes back alone. In the usual flow
// the row takes the focus as the dialog goes; this holds where it cannot
function genUnfocus(modalId) { var m = genEl(modalId), a = document.activeElement; if (m && a && a !== document.body && typeof a.blur === 'function' && typeof m.contains === 'function' && m.contains(a)) a.blur(); }
// What Tab walks through, in the dialog's own order: never a row that is put away nor a control that is out of use
function genStops() {
    var out = Array.prototype.slice.call(document.querySelectorAll('#genWhere .gen-chip'));
    ['genMap', 'genName', 'genGrid', 'genW', 'genH', 'genRooms', 'genCorr', 'genDoors', 'genTheme', 'genFurn', 'genSeed', 'genSeedNew', 'genCancel', 'genGo'].forEach(function(id) {
        var e = genEl(id), row = id === 'genMap' ? genEl('genMapRow') : id === 'genName' || id === 'genGrid' ? genEl('genNameRow') : null;
        if (e && !e.disabled && !(row && row.hidden)) out.push(e);
    });
    return out;
}
// Tab goes round inside the dialog: past its last control to its first, and back. True when the focus was moved
function genTab(target, back) {
    var st = genStops(), at = st.indexOf(target); if (!st.length) return false;
    var to = back ? (at <= 0 ? st[st.length - 1] : null) : (at < 0 || at === st.length - 1 ? st[0] : null);
    if (!to || !to.focus) return false;
    to.focus(); return true;
}
// Generate: the dungeon laid as the dialog's count said. The GM is taken to the map first, on its play map: that draws and saves it as
// it stands, a new map empty, which is the state one Undo goes back to. Then the pieces are laid there in ONE save, so one Undo takes the
// dungeon back, and a new map stays
function genGo() {
    if (!genShown()) return false;   // only from the dialog as it stands: a second press finds it put away
    if (genSizes()) { genSync(); return false; }   // a size that was not as it will be used is shown first, with its count: the next press lays it
    var plan = genPlan(); if (!plan.ok) { genSync(); return false; }
    var camp = getActiveCampaign(), here = getActiveMap(), map = plan.map, nmBox = genEl('genName'), items = genItems(plan.pieces, plan.opts ? plan.opts.theme : '', plan.furn);
    if (!items.length) { toast('That dungeon could not be laid. Nothing was changed.'); return false; }
    if (plan.fresh) {
        map = createNewMap(getUniqueItemTitle(genText(nmBox ? nmBox.value : '', 80) || 'Dungeon', null));
        if (typeof applyMapStart === 'function') applyMapStart(map);   // 1.6.3: a new map starts at the scale the system names (models.js applyMapStart)
        map.meta.gridType = plan.kind;
        camp.items[map.id] = map;
    }
    if (!map.meta || typeof map.meta !== 'object') map.meta = {};
    if (!Array.isArray(map.whiteboard)) map.whiteboard = [];   // before the map is drawn: a map from a file may have none
    genUnfocus('genModal'); genHide();
    if (map === here) save(true);
    else {
        map.meta.lastView = 'visual'; if (typeof window !== 'undefined' && window.wpOpensNext) window.wpOpensNext('visual');   // backlog 221: over Maps open on
        if (!navigateToMap(map.id, null, true)) { if (plan.fresh) delete camp.items[map.id]; toast('That map could not be opened. Nothing was changed.'); return false; }
    }
    if (map.whiteboard.length + items.length > BUILD_MAX) { toast('That dungeon could not be laid. Nothing was changed.'); return false; }
    var lockedN = typeof structLaid === 'function' ? structLaid(items) : 0;   // 231
    items.forEach(function(it) { map.whiteboard.push(it); });
    map.meta.gen = plan.opts;   // the GM's own, to make it again: never sent (net.js sanitizeItem), cleaned from a file (cleanup.js)
    save(true); render();
    if (window.wpFog && window.wpFog.invalidateVision) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }
    toast('Dungeon laid, ' + items.length + ' pieces.' + (lockedN ? ' Its walls, doors and floors are locked in place.' : '') + ' One Undo takes it back.');
    return true;
}
function genWire() {
    var m = genEl('genModal'), row = genEl('buildGenBtn'); if (!m) return;
    if (row) row.addEventListener('click', function(ev) { ev.stopPropagation(); genShow(); });
    // the dialog hands the focus back to this row when it is put away: a key still held from the press that put it away presses nothing here
    if (row) row.addEventListener('keydown', function(e) { if (e.repeat === true && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) { e.preventDefault(); e.stopPropagation(); } });   // a held Escape would be Build's own next, and put the tool away
    Array.prototype.forEach.call(document.querySelectorAll('#genWhere .gen-chip'), function(b) { b.addEventListener('click', function() { var w = this.dataset.where; if (GEN_WHERE.indexOf(w) < 0) return; _gen.where = w; genSync(); }); });
    ['genMap', 'genGrid', 'genRooms', 'genCorr', 'genDoors', 'genTheme', 'genFurn'].forEach(function(id) { var e = genEl(id); if (e) e.addEventListener('change', genSync); });
    ['genW', 'genH'].forEach(function(id) { var e = genEl(id); if (!e) return; e.addEventListener('input', genSync); e.addEventListener('change', function() { genSizes(); genSync(); }); });   // a size left outside its bounds reads as the size that will be used
    var sb = genEl('genSeed'); if (sb) sb.addEventListener('input', genSync);
    var nw = genEl('genSeedNew'); if (nw) nw.addEventListener('click', function() { var s = genEl('genSeed'); if (s) s.value = genNewSeed(); genSync(); });
    var no = genEl('genCancel'); if (no) no.addEventListener('click', genHide);
    var go = genEl('genGo'); if (go) go.addEventListener('click', function() { genGo(); });
    // Escape is heard FIRST, at the window, and goes no further: a box of the page's own closes on Escape in a listener of the document's
    // (the dice roller), and one key must not put two boxes away. Never while a question or a prompt of the app's own is up over the dialog
    // The press that put the dialog away is the dialog's for as long as it is held: its repeats come after the dialog is down, and the
    // document's own listeners would hear them before the row does. Any new press, and Escape let go, end that
    var escHeld = false;
    if (typeof window.addEventListener === 'function') window.addEventListener('keydown', function(e) {
        if (e.repeat !== true) escHeld = false;
        else if (escHeld && e.key === 'Escape') { if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); else e.stopPropagation(); e.preventDefault(); return; }
        if (e.key !== 'Escape' || !genShown() || buildAsking()) return;
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); else e.stopPropagation();
        e.preventDefault();
        if (e.repeat !== true) { genHide(); escHeld = true; }
    }, true);
    if (typeof window.addEventListener === 'function') window.addEventListener('keyup', function(e) { if (e.key === 'Escape') escHeld = false; }, true);
    // every key pressed in the dialog stays in it: the page reads keys as its own (Build's Esc and Enter, a token's arrows, Delete)
    m.addEventListener('keydown', function(e) {
        if (buildAsking()) return;   // a question or a prompt of the app's own, raised over the dialog, has every key: the focus may still rest in here
        e.stopPropagation();
        if (e.key === 'Escape') { e.preventDefault(); genHide(); }
        else if (e.key === 'Enter' && e.target && /^INPUT$/.test(e.target.tagName || '')) { e.preventDefault(); genGo(); }
        else if (e.key === 'Tab' && genTab(e.target, e.shiftKey === true)) e.preventDefault();
    });
    // A key pressed while the dialog is up with the focus outside it (after a press on its backdrop) is the dialog's too: the page would
    // read it as its own behind the dialog, undo the map or put Build away. Escape puts the dialog away, Tab brings the focus back in, and
    // any other key does nothing. Heard first (capture), and never while a question or a prompt of the app's own is up over the dialog
    document.addEventListener('keydown', function(e) {
        if (!genShown() || buildAsking() || (e.target && typeof m.contains === 'function' && m.contains(e.target))) return;
        e.stopPropagation(); e.preventDefault();
        if (e.key === 'Escape') genHide();
        else if (e.key === 'Tab') genTab(null, e.shiftKey === true);
    }, true);
    // A paste is the page's to read too (it lays a copied piece or a picture on the map behind): never while the dialog is up, but for a
    // field of the dialog's own, which takes its paste as any field does
    document.addEventListener('paste', function(e) {
        if (!genShown() || buildAsking()) return;
        var t = e.target; if (t && typeof m.contains === 'function' && m.contains(t) && /^(INPUT|TEXTAREA)$/.test(t.tagName || '')) return;
        e.preventDefault(); e.stopPropagation();
    }, true);
}
// [buildcheck:gendialog-end]
genWire();
// [buildcheck:citydialog-start]
// The city made for you (the map builder, fold B6; the owner's answers of 2026-10-11 on the city sheet: a city map is for "Both, by a Size
// list", a building is "A block", the dialog "As drawn"; and on the row's sheet: the row's drawing "B. Wall and gate", a new map's grid
// "You pick in the dialog"). The row under Generate a dungeon opens one dialog. Its settings go to the pure half (citycore.js), which
// answers geometry, and what is laid is ORDINARY pieces, each dressed with a material's own props: a field as Grass, a street as Street,
// water as Water, a bridge as Wood floor, a house as Building under its own roof, a wall and a tower as City wall, and a town's wall as
// the pen's Wall line in the City wall's color. Nothing on the map is changed and nothing is derived live. It is laid in one save, so
// one Undo takes it back. The seed and settings are kept on the map (meta.city) for the GM alone, to make it again: net.js never sends
// them and an import cleans them. The dialog is the GM's (buildMay) and its markup is fixed words in the page: a map's name reaches the
// list as an option's text, never as markup. It leans on the dungeon dialog's helpers (genEl, genText, genMaps, genCountWords, genNewSeed)
var CITY_LINES = { here: 'Its middle goes where the middle of your screen is. Nothing on the map is changed.', other: 'It lands in the middle of that map as you last saw it. You are taken there once it is made.', fresh: 'A new map is made for it. You are taken there once it is made.', none: 'This campaign has no other map.' };
var CITY_GRIDS = ['off', 'square', 'hex'], CITY_NAMES = { village: 'Village', town: 'Town', city: 'City' }, CITY_MATS = { field: 'grass', street: 'street', water: 'water', bridge: 'wood' }, CITY_WALL_PX = 8;
var _city = { where: 'here', maps: '', grid: '', named: false, laid: false };
function cityCore() { return window.wpCityCore || null; }
function cityShown() { var m = genEl('cityModal'); return !!m && m.style.display === 'flex'; }
function cityWord(size) { return Object.prototype.hasOwnProperty.call(CITY_NAMES, size) ? CITY_NAMES[size] : CITY_NAMES.town; }
// The grid a new map starts with until the GM picks one in the dialog: square cells for a village, which is laid on them, and none for a
// town or a city, which are an overview
function cityGridFor(size) { return size === 'village' ? 'square' : 'off'; }
// The form as the generator's settings, and the settings into the form
function cityForm() {
    var CC = cityCore(); if (!CC) return null;
    var val = function(id) { var e = genEl(id); return e ? String(e.value) : ''; }, fl = genEl('cityFields');
    return CC.cleanCity({ seed: val('citySeed').trim(), size: val('citySize'), wall: val('cityWall'), water: val('cityWater'), roofs: val('cityRoofs'), fields: !fl || fl.checked !== false, layout: val('cityLayout'), theme: val('cityTheme'), furn: val('cityFurn') });
}
function cityFill(o) {
    var set = function(id, v) { var e = genEl(id); if (e) e.value = String(v); }, fl = genEl('cityFields');
    set('citySeed', o.seed); set('citySize', o.size); set('cityWall', o.wall); set('cityWater', o.water); set('cityRoofs', o.roofs); set('cityLayout', o.layout || 'winding'); set('cityTheme', o.theme || 'fantasy'); set('cityFurn', o.furn || 'few'); if (fl) fl.checked = o.fields !== false;
}
// Where a city's top left corner goes, so that its MIDDLE is the middle of the view (`mid`, the screen's own, for the map on screen), else
// of the map as it was last seen, else of its home. The whole city stays on the board, and a village sits on its lattice of cells
function cityCorner(map, mid, w, h, cell) {
    var meta = map && map.meta && typeof map.meta === 'object' ? map.meta : {}, num = function(v) { return typeof v === 'number' && isFinite(v); };
    var cx = mid && num(mid.x) ? mid.x : num(meta.lastWbX) ? meta.lastWbX : num(meta.homeX) ? meta.homeX : 15000, cy = mid && num(mid.y) ? mid.y : num(meta.lastWbY) ? meta.lastWbY : num(meta.homeY) ? meta.homeY : 15000;
    var fit = function(c, size) { var at = Math.max(0, Math.min(30000 - size, c - size / 2)); return cell > 0 ? Math.round(at / cell) * cell : Math.round(at); };
    return { x: fit(cx, w), y: fit(cy, h) };
}
// What Generate would do now: { ok, say } and, where it can be laid, { map (null for a new one), fresh, grid, opts, pieces }
function cityPlan() {
    var CC = cityCore(), BC = buildCore(), camp = getActiveCampaign(), here = getActiveMap(), no = { ok: false, say: 'A city cannot be built here.' };
    if (!CC || !BC || !camp || !camp.items || !here || here.type !== 'map' || !buildMay() || !buildHere()) return no;
    var seedBox = genEl('citySeed'), typed = seedBox ? String(seedBox.value).trim() : '', opts = cityForm();
    if (!opts || opts.seed !== typed) return { ok: false, say: 'A seed is letters, digits and hyphens, 24 at most.' };
    var where = GEN_WHERE.indexOf(_city.where) >= 0 ? _city.where : 'here', map = here, fresh = where === 'fresh', grid = '';
    if (where === 'other') {
        var sel = genEl('cityMap'), id = sel ? String(sel.value) : '';
        map = id && id !== here.id && Object.prototype.hasOwnProperty.call(camp.items, id) && camp.items[id] && camp.items[id].type === 'map' ? camp.items[id] : null;
        if (!map) return { ok: false, say: CITY_LINES.none };
    }
    if (fresh) { var gs = genEl('cityGrid'), g = gs ? String(gs.value) : ''; grid = CITY_GRIDS.indexOf(g) >= 0 ? g : cityGridFor(opts.size); map = null; }
    var plan = CC.genCity(opts), cells = plan.kind === 'cells', w = cells ? plan.cols * CC.CELL : plan.w, h = cells ? plan.rows * CC.CELL : plan.h;
    var at = cityCorner(map, where === 'here' ? viewCentre() : null, w, h, cells ? CC.CELL : 0), pc = CC.cityPieces(plan, at.x, at.y);
    if (!pc.count || !pc.buildings.length) return { ok: false, say: 'That city could not be laid out. Try another seed.' };
    var FG = window.wpFurnGen;   // 1.6.2 (backlog 222): on its market square and along its streets, a cell of the 50 px lattice a village is laid on
    var fu = { list: FG ? FG.townPieces(pc, opts.furn, opts.seed, CC.CELL, cells) : [], hex: false, cell: { w: CC.CELL, h: CC.CELL } };
    var held = map && Array.isArray(map.whiteboard) ? map.whiteboard.length : 0, nAll = pc.count + fu.list.length;
    if (held + nAll > BUILD_MAX) return { ok: false, say: genCountWords(nAll, held) };
    return { ok: true, say: genCountWords(nAll, held), map: map, fresh: fresh, grid: grid, opts: opts, pieces: pc, furn: fu };
}
// One piece as the item the Build tool lays for its shape: a box, a circle, or a filled region with its points
function cityPiece(g, props) {
    var it = Object.assign({ id: 'wb' + uid(), type: g.type, x: g.x, y: g.y, w: g.w, h: g.h, z: 10 }, newOpacityProps(), props);
    if (g.pts) { it.pts = g.pts; it.baseW = g.baseW; it.baseH = g.baseH; it.tip = 'fill'; }
    return it;
}
// The city's pieces as ordinary items, in the order they are laid: each wears the props of its material, a house its own roof and that
// roof's color, and a town's wall is the pen's Wall line under the City wall's name and color
function cityItems(pc, theme, furn) {
    var BC = buildCore(), out = [], grounds = {}; if (!BC || !pc) return out;
    var T = BC.THEMES[BC.cleanTheme(theme)], cw = BC.pieceProps(T.block, {}), pen = BC.penPreset('wall', {}), ok = !!cw && !!pen;
    Object.keys(CITY_MATS).forEach(function(k) { grounds[k] = BC.pieceProps(T[k] || CITY_MATS[k], {}); if (!grounds[k]) ok = false; });
    if (!ok) return out;
    var line = Object.assign({}, pen, { name: cw.name, color: cw.color, strokeWidth: CITY_WALL_PX });
    pc.grounds.forEach(function(g) { if (Object.prototype.hasOwnProperty.call(grounds, g.kind)) out.push(cityPiece(g.geo, grounds[g.kind])); });
    pc.buildings.forEach(function(b) { var p = T.roofs ? BC.pieceProps(T.roofs[b.roof], {}) : BC.pieceProps('building', { texture: b.roof, color: b.color }); if (p) out.push(cityPiece(b.geo, p)); });
    pc.walls.forEach(function(wl) { out.push(wl.line ? buildWallItem(wl.geo, line) : cityPiece(wl.geo, cw)); });
    pc.towers.forEach(function(t) { out.push(cityPiece(t.geo, cw)); });
    if (typeof genFurnItems === 'function') genFurnItems(furn, theme).forEach(function(it) { out.push(it); });
    return out;
}
// The other maps as the list's options, made again only when the list changed, so a pick stands: elements with text, never markup
function cityMapsFill() {
    var sel = genEl('cityMap'), camp = getActiveCampaign(), here = getActiveMap(); if (!sel) return 0;
    var list = genMaps(camp, here ? here.id : ''), sig = JSON.stringify(list);
    if (sig === _city.maps) return list.length;
    var was = String(sel.value || '');
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    list.forEach(function(m) { var o = document.createElement('option'); o.value = m.id; o.appendChild(document.createTextNode(m.title)); sel.appendChild(o); });
    sel.value = list.some(function(m) { return m.id === was; }) ? was : (list[0] ? list[0].id : '');
    _city.maps = sig;
    return list.length;
}
// The dialog as it stands: the chip in use, the row its choice needs, the line that says where it lands, the count, and Generate put out
// of use with the reason in sight where the city cannot be laid. A new map's grid and name follow the Size until the GM sets them
function citySync() {
    var rfE = genEl('cityRoofs'), thS = genEl('cityTheme'), lyS = genEl('cityLayout'), szS = genEl('citySize');   // a list that decides nothing here is out of use: a theme picks its own roofs, and a village has its one main street
    if (rfE && thS) rfE.disabled = !!thS.value && thS.value !== 'fantasy';
    if (lyS && szS) lyS.disabled = szS.value === 'village';
    if (!cityShown()) return;
    var where = GEN_WHERE.indexOf(_city.where) >= 0 ? _city.where : 'here', o = cityForm();
    Array.prototype.forEach.call(document.querySelectorAll('#cityWhere .gen-chip'), function(b) { var on = b.dataset.where === where; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    var mr = genEl('cityMapRow'), nr = genEl('cityNameRow'), ln = genEl('cityWhereLine'), ct = genEl('cityCount'), go = genEl('cityGo'), gs = genEl('cityGrid'), nm = genEl('cityName');
    if (mr) mr.hidden = where !== 'other';
    if (nr) nr.hidden = where !== 'fresh';
    if (o && gs && !_city.grid) gs.value = cityGridFor(o.size);
    if (o && nm && !_city.named) nm.value = cityWord(o.size);
    var others = where === 'other' ? cityMapsFill() : 1;
    if (ln) ln.textContent = where === 'other' && !others ? CITY_LINES.none : CITY_LINES[where];
    var plan = cityPlan();
    if (ct) ct.textContent = plan.say;
    if (go) go.disabled = !plan.ok;
    if (typeof genPreviewDraw === 'function') genPreviewDraw('cityModal', plan.ok ? cityItems(plan.pieces, plan.opts.theme, plan.furn) : null);   // 1.6.2: the small preview
}
function cityShow() {
    var m = genEl('cityModal'), CC = cityCore(), here = getActiveMap(); if (!m || !CC || !buildCore() || !buildMay() || !buildHere() || !here) return false;
    var kept = here.meta && typeof here.meta === 'object' && here.meta.city && typeof here.meta.city === 'object' && !Array.isArray(here.meta.city) ? CC.cleanCity(here.meta.city) : null;
    if (kept && !Object.prototype.hasOwnProperty.call(here.meta.city, 'furn')) kept.furn = 'none';   // a city laid before Furnishings was laid with none
    if (kept) cityFill(kept); else { var sb = genEl('citySeed'); if (sb) sb.value = genNewSeed(); }   // a map that keeps its city's seed shows it, to make it again; else a new seed each time
    _city.where = 'here'; _city.maps = ''; _city.grid = ''; _city.named = false;
    m.style.display = 'flex';
    citySync();
    var first = document.querySelector('#cityWhere .gen-chip.on'); if (first && first.focus) first.focus();
    return true;
}
function cityHide() { var m = genEl('cityModal'); if (!m || m.style.display === 'none') return; m.style.display = 'none'; var b = genEl('buildCityBtn'); if (b && b.focus) b.focus(); }
// What Tab walks through, in the dialog's own order: never a row that is put away nor a control that is out of use
function cityStops() {
    var out = Array.prototype.slice.call(document.querySelectorAll('#cityWhere .gen-chip'));
    ['cityMap', 'cityName', 'cityGrid', 'citySeed', 'citySeedNew', 'citySize', 'cityTheme', 'cityFurn', 'cityLayout', 'cityWall', 'cityWater', 'cityRoofs', 'cityFields', 'cityCancel', 'cityGo'].forEach(function(id) {
        var e = genEl(id), row = id === 'cityMap' ? genEl('cityMapRow') : id === 'cityName' || id === 'cityGrid' ? genEl('cityNameRow') : null;
        if (e && !e.disabled && !(row && row.hidden)) out.push(e);
    });
    return out;
}
// Tab goes round inside the dialog: past its last control to its first, and back. True when the focus was moved
function cityTab(target, back) {
    var st = cityStops(), at = st.indexOf(target); if (!st.length) return false;
    var to = back ? (at <= 0 ? st[st.length - 1] : null) : (at < 0 || at === st.length - 1 ? st[0] : null);
    if (!to || !to.focus) return false;
    to.focus(); return true;
}
// Generate: the city laid as the dialog's count said. The GM is taken to the map first, on its play map: that draws and saves it as it
// stands, a new map empty, which is the state one Undo goes back to. Then the pieces are laid there in ONE save, so one Undo takes the
// city back, and a new map stays
function cityGo() {
    if (!cityShown()) return false;   // only from the dialog as it stands: a second press finds it put away
    var plan = cityPlan(); if (!plan.ok) { citySync(); return false; }
    var camp = getActiveCampaign(), here = getActiveMap(), map = plan.map, nmBox = genEl('cityName'), items = cityItems(plan.pieces, plan.opts.theme, plan.furn), word = cityWord(plan.opts.size);
    if (!items.length) { toast('That city could not be laid. Nothing was changed.'); return false; }
    if (plan.fresh) {
        map = createNewMap(getUniqueItemTitle(genText(nmBox ? nmBox.value : '', 80) || word, null));
        if (typeof applyMapStart === 'function') applyMapStart(map);   // 1.6.3: a new map starts at the scale the system names (models.js applyMapStart)
        map.meta.gridType = plan.grid;
        camp.items[map.id] = map;
    }
    if (!map.meta || typeof map.meta !== 'object') map.meta = {};
    if (!Array.isArray(map.whiteboard)) map.whiteboard = [];   // before the map is drawn: a map from a file may have none
    genUnfocus('cityModal'); cityHide();
    if (map === here) save(true);
    else {
        map.meta.lastView = 'visual'; if (typeof window !== 'undefined' && window.wpOpensNext) window.wpOpensNext('visual');   // backlog 221: over Maps open on
        if (!navigateToMap(map.id, null, true)) { if (plan.fresh) delete camp.items[map.id]; toast('That map could not be opened. Nothing was changed.'); return false; }
    }
    if (map.whiteboard.length + items.length > BUILD_MAX) { toast('That city could not be laid. Nothing was changed.'); return false; }
    var lockedN = typeof structLaid === 'function' ? structLaid(items) : 0;   // 231
    items.forEach(function(it) { map.whiteboard.push(it); });
    map.meta.city = plan.opts;   // the GM's own, to make it again: never sent (net.js sanitizeItem), cleaned from a file (cleanup.js)
    save(true); render();
    if (window.wpFog && window.wpFog.invalidateVision) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }
    toast(word + ' laid, ' + items.length + ' pieces.' + (lockedN ? ' Its streets, walls and buildings are locked in place.' : '') + ' One Undo takes it back.');
    return true;
}
function cityWire() {
    var m = genEl('cityModal'), row = genEl('buildCityBtn'); if (!m) return;
    if (row) row.addEventListener('click', function(ev) { ev.stopPropagation(); cityShow(); });
    // the dialog hands the focus back to this row when it is put away: a key still held from the press that put it away presses nothing here
    if (row) row.addEventListener('keydown', function(e) { if (e.repeat === true && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) { e.preventDefault(); e.stopPropagation(); } });   // a held Escape would be Build's own next, and put the tool away
    Array.prototype.forEach.call(document.querySelectorAll('#cityWhere .gen-chip'), function(b) { b.addEventListener('click', function() { var w = this.dataset.where; if (GEN_WHERE.indexOf(w) < 0) return; _city.where = w; citySync(); }); });
    ['cityMap', 'citySize', 'cityWall', 'cityWater', 'cityRoofs', 'cityFields', 'cityFurn'].forEach(function(id) { var e = genEl(id); if (e) e.addEventListener('change', citySync); });
    var lyE = genEl('cityLayout'); if (lyE) lyE.addEventListener('change', function() { _city.laid = true; citySync(); });
    var thE = genEl('cityTheme'); if (thE) thE.addEventListener('change', function() {   // a modern or a future city starts on a grid with no wall, until the GM says otherwise
        var grid = thE.value === 'modern' || thE.value === 'futuristic', ly = genEl('cityLayout'), wl = genEl('cityWall');
        if (!_city.laid && ly) { ly.value = grid ? 'grid' : 'winding'; if (wl && grid) wl.value = 'none'; }
        citySync();
    });
    // a grid or a name the GM set for the new map stands, whatever Size is picked afterwards
    var gs = genEl('cityGrid'); if (gs) gs.addEventListener('change', function() { var g = String(this.value); _city.grid = CITY_GRIDS.indexOf(g) >= 0 ? g : ''; citySync(); });
    var nm = genEl('cityName'); if (nm) nm.addEventListener('input', function() { _city.named = true; });
    var sb = genEl('citySeed'); if (sb) sb.addEventListener('input', citySync);
    var nw = genEl('citySeedNew'); if (nw) nw.addEventListener('click', function() { var s = genEl('citySeed'); if (s) s.value = genNewSeed(); citySync(); });
    var no = genEl('cityCancel'); if (no) no.addEventListener('click', cityHide);
    var go = genEl('cityGo'); if (go) go.addEventListener('click', function() { cityGo(); });
    // Escape is heard FIRST, at the window, and goes no further: a box of the page's own closes on Escape in a listener of the document's
    // (the dice roller), and one key must not put two boxes away. Never while a question or a prompt of the app's own is up over the dialog
    // The press that put the dialog away is the dialog's for as long as it is held: its repeats come after the dialog is down, and the
    // document's own listeners would hear them before the row does. Any new press, and Escape let go, end that
    var escHeld = false;
    if (typeof window.addEventListener === 'function') window.addEventListener('keydown', function(e) {
        if (e.repeat !== true) escHeld = false;
        else if (escHeld && e.key === 'Escape') { if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); else e.stopPropagation(); e.preventDefault(); return; }
        if (e.key !== 'Escape' || !cityShown() || buildAsking()) return;
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); else e.stopPropagation();
        e.preventDefault();
        if (e.repeat !== true) { cityHide(); escHeld = true; }
    }, true);
    if (typeof window.addEventListener === 'function') window.addEventListener('keyup', function(e) { if (e.key === 'Escape') escHeld = false; }, true);
    // every key pressed in the dialog stays in it: the page reads keys as its own (Build's Esc and Enter, a token's arrows, Delete)
    m.addEventListener('keydown', function(e) {
        if (buildAsking()) return;   // a question or a prompt of the app's own, raised over the dialog, has every key: the focus may still rest in here
        e.stopPropagation();
        var t = e.target, box = !!t && /^INPUT$/.test(t.tagName || '');
        if (e.key === 'Escape') { e.preventDefault(); cityHide(); }
        else if (e.key === 'Enter' && box && t.type === 'checkbox') { e.preventDefault(); if (e.repeat !== true && !t.disabled && typeof t.click === 'function') t.click(); }   // Enter ticks a tick that has the focus, as it does on the page
        else if (e.key === 'Enter' && box) { e.preventDefault(); cityGo(); }
        else if (e.key === 'Tab' && cityTab(t, e.shiftKey === true)) e.preventDefault();
    });
    // A key pressed while the dialog is up with the focus outside it (after a press on its backdrop) is the dialog's too: the page would
    // read it as its own behind the dialog, undo the map or put Build away. Escape puts the dialog away, Tab brings the focus back in, and
    // any other key does nothing. Heard first (capture), and never while a question or a prompt of the app's own is up over the dialog
    document.addEventListener('keydown', function(e) {
        if (!cityShown() || buildAsking() || (e.target && typeof m.contains === 'function' && m.contains(e.target))) return;
        e.stopPropagation(); e.preventDefault();
        if (e.key === 'Escape') cityHide();
        else if (e.key === 'Tab') cityTab(null, e.shiftKey === true);
    }, true);
    // A paste is the page's to read too (it lays a copied piece or a picture on the map behind): never while the dialog is up, but for a
    // text field of the dialog's own, which takes its paste as any field does
    document.addEventListener('paste', function(e) {
        if (!cityShown() || buildAsking()) return;
        var t = e.target; if (t && typeof m.contains === 'function' && m.contains(t) && /^(INPUT|TEXTAREA)$/.test(t.tagName || '') && t.type !== 'checkbox') return;
        e.preventDefault(); e.stopPropagation();
    }, true);
}
// [buildcheck:citydialog-end]
cityWire();
// [buildcheck:worlddialog-start]
// The world made for you (the map builder, fold B7; the owner's answers of 2026-10-11 on the world sheet: the land patterns "The four",
// a generated world "C. A Land list", towns "optional when generating" as "A list, None first", the row's drawing "A. Peaks", and the
// dialog as the sheet drew it). The row under Generate a city opens one dialog. Its settings go to the pure half (worldcore.js), which
// answers geometry, and what is laid is ORDINARY pieces: the sea as one box, each stretch of land as one filled region in its own color
// and pattern, a river as a line in the water's color, a town as a small square and its name as a text box the GM can change. Nothing
// blocks sight or stops a token: a world map is for pointing and traveling. No piece already on the map is changed, but a world laid on a
// map that holds pieces covers them (its sea is one box on the back layer, laid after them), which its line says. Nothing is derived live.
// It is laid in one save, so one Undo takes it back. The seed and settings are kept on the map (meta.world) for the GM alone, to make it
// again: net.js never sends them and an import cleans them. The dialog is the GM's (buildMay) and its markup is fixed words in the page:
// a map's name reaches the list as an option's text, never as markup. It leans on the dungeon's and the city's helpers (genEl, genText,
// genMaps, genCountWords, genNewSeed, cityCorner, cityPiece)
var WORLD_LINES = { here: 'Its middle goes where the middle of your screen is. It covers what is there, and one Undo takes it back.', other: 'It lands in the middle of that map as you last saw it and covers what is there. You are taken there once it is made.', fresh: 'A new map is made for it. You are taken there once it is made.', none: 'This campaign has no other map.' };
var WORLD_GRIDS = ['off', 'square', 'hex'], WORLD_NAMES = { sea: 'Sea', land: 'Land', forest: 'Forest', sand: 'Sand', snow: 'Snow', mountains: 'Mountains', river: 'River', town: 'Town' }, WORLD_RIVER_PX = 9;
// a town's name: light words on a dark plate that lets the land show through, so that it reads on forest, on sand and on snow alike.
// It hugs the side its mark is on: the generator says left, or right where the name stands on the mark's left at the board's edge
var WORLD_LABEL = Object.freeze({ color: '#f0ead6', bg: '#16161d', bgOpacity: 0.6, fontSize: 18, layer: 'middle' });
var _world = { where: 'fresh', maps: '' };
function worldCore() { return window.wpWorldCore || null; }
function worldShown() { var m = genEl('worldModal'); return !!m && m.style.display === 'flex'; }
// The form as the generator's settings, and the settings into the form
function worldForm() {
    var WC = worldCore(); if (!WC) return null;
    var val = function(id) { var e = genEl(id); return e ? String(e.value) : ''; };
    return WC.cleanWorld({ seed: val('worldSeed').trim(), land: val('worldLand'), size: val('worldSize'), mountains: val('worldMountains'), forests: val('worldForests'), rivers: val('worldRivers'), climate: val('worldClimate'), towns: val('worldTowns') });
}
function worldFill(o) {
    var set = function(id, v) { var e = genEl(id); if (e) e.value = String(v); };
    set('worldSeed', o.seed); set('worldLand', o.land); set('worldSize', o.size); set('worldMountains', o.mountains); set('worldForests', o.forests); set('worldRivers', o.rivers); set('worldClimate', o.climate); set('worldTowns', o.towns);
}
// What Generate would do now: { ok, say } and, where it can be laid, { map (null for a new one), fresh, grid, opts, pieces }. The world's
// MIDDLE goes to the middle of the view, as a city's does, at whole pixels: a world is an overview and sits on no lattice
function worldPlan() {
    var WC = worldCore(), BC = buildCore(), camp = getActiveCampaign(), here = getActiveMap(), no = { ok: false, say: 'A world cannot be built here.' };
    if (!WC || !BC || !camp || !camp.items || !here || here.type !== 'map' || !buildMay() || !buildHere()) return no;
    var seedBox = genEl('worldSeed'), typed = seedBox ? String(seedBox.value).trim() : '', opts = worldForm();
    if (!opts || opts.seed !== typed) return { ok: false, say: 'A seed is letters, digits and hyphens, 24 at most.' };
    var where = GEN_WHERE.indexOf(_world.where) >= 0 ? _world.where : 'fresh', map = here, fresh = where === 'fresh', grid = '';
    if (where === 'other') {
        var sel = genEl('worldMap'), id = sel ? String(sel.value) : '';
        map = id && id !== here.id && Object.prototype.hasOwnProperty.call(camp.items, id) && camp.items[id] && camp.items[id].type === 'map' ? camp.items[id] : null;
        if (!map) return { ok: false, say: WORLD_LINES.none };
    }
    if (fresh) { var gs = genEl('worldGrid'), g = gs ? String(gs.value) : ''; grid = WORLD_GRIDS.indexOf(g) >= 0 ? g : 'off'; map = null; }
    var plan = WC.genWorld(opts), at = cityCorner(map, where === 'here' ? viewCentre() : null, plan.w, plan.h, 0), pc = WC.worldPieces(plan, at.x, at.y), items = worldItems(pc);
    if (items.length < 2) return { ok: false, say: 'That world could not be laid out. Try another seed.' };
    var held = map && Array.isArray(map.whiteboard) ? map.whiteboard.length : 0;
    if (held + items.length > BUILD_MAX) return { ok: false, say: genCountWords(items.length, held) };
    return { ok: true, say: genCountWords(items.length, held), map: map, fresh: fresh, grid: grid, opts: opts, items: items };
}
// The world's pieces as ordinary items, in the order they are laid. Each is made here from the generator's own colors and patterns,
// asked again: the kind only as a text of the list, a color only as six hex digits, a pattern only as a name of the list, a town's name
// only as letters, every number of a piece's box a sound one (worldBox), a river's and a region's points sound ones (worldLine), and a
// stretch of land a filled region and nothing else. A piece that fails is passed over whole. Nothing carries a key that blocks sight,
// stops a token or costs movement. A world is laid at FULL opacity whatever the GM's New item opacity says: its layers are made to cover
// each other (plain land lies under every other kind), so a see-through one would show the layer beneath it
function worldNum(v) { return typeof v === 'number' && isFinite(v) && Math.abs(v) <= 200000; }
function worldBox(g) { return worldNum(g.x) && worldNum(g.y) && worldNum(g.w) && worldNum(g.h) && g.w > 0 && g.h > 0 ? { x: g.x, y: g.y, w: g.w, h: g.h } : null; }
function worldLine(g) {
    var b = worldBox(g); if (!b || !Array.isArray(g.pts) || g.pts.length < 2 || g.pts.length > 2000 || !worldNum(g.baseW) || !worldNum(g.baseH) || !(g.baseW > 0) || !(g.baseH > 0)) return null;
    var pts = []; for (var i = 0; i < g.pts.length; i++) { var q = g.pts[i]; if (!Array.isArray(q) || !worldNum(q[0]) || !worldNum(q[1])) return null; pts.push([q[0], q[1]]); }
    b.baseW = g.baseW; b.baseH = g.baseH; b.pts = pts; return b;
}
function worldItems(pc) {
    var BC = buildCore(), out = []; if (!BC || !pc || !Array.isArray(pc.pieces)) return out;
    var lay = function(it) { delete it.opacity; out.push(it); };
    pc.pieces.forEach(function(p) {
        var g = p && typeof p === 'object' ? p.geo : null; if (!g || typeof g !== 'object' || typeof p.kind !== 'string') return;
        var b = worldBox(g); if (!b) return;
        if (p.kind === 'name') { if (typeof p.text === 'string' && /^[A-Za-z]{1,24}$/.test(p.text)) out.push(Object.assign({ id: 'wb' + uid(), type: 'text', x: b.x, y: b.y, w: b.w, h: b.h, z: 10 }, WORLD_LABEL, { text: p.text, align: p.align === 'right' ? 'right' : 'left' })); return; }
        if (!Object.prototype.hasOwnProperty.call(WORLD_NAMES, p.kind) || typeof p.color !== 'string' || !/^#[0-9a-f]{6}$/.test(p.color)) return;
        var props = { color: p.color, layer: 'back', name: WORLD_NAMES[p.kind] }, tex = typeof BC.cleanTexture === 'function' ? BC.cleanTexture(p.texture) : null; if (tex) props.texture = tex;
        if (p.kind === 'river') { var rl = worldLine(g); if (rl) lay(buildWallItem(rl, { color: p.color, layer: 'back', name: WORLD_NAMES.river, strokeWidth: WORLD_RIVER_PX, tip: 'round' })); return; }
        if (p.kind === 'town') { lay(cityPiece({ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h }, { color: p.color, layer: 'back-mid', name: WORLD_NAMES.town })); return; }
        if (p.kind === 'sea') { lay(cityPiece({ type: 'rect', x: b.x, y: b.y, w: b.w, h: b.h }, props)); return; }
        var rg = g.type === 'path' ? worldLine(g) : null; if (!rg) return;   // a stretch of land: a filled region, its geometry taken value by value
        lay(cityPiece({ type: 'path', x: rg.x, y: rg.y, w: rg.w, h: rg.h, pts: rg.pts, baseW: rg.baseW, baseH: rg.baseH }, props));
    });
    return out;
}
// The other maps as the list's options, made again only when the list changed, so a pick stands: elements with text, never markup
function worldMapsFill() {
    var sel = genEl('worldMap'), camp = getActiveCampaign(), here = getActiveMap(); if (!sel) return 0;
    var list = genMaps(camp, here ? here.id : ''), sig = JSON.stringify(list);
    if (sig === _world.maps) return list.length;
    var was = String(sel.value || '');
    while (sel.firstChild) sel.removeChild(sel.firstChild);
    list.forEach(function(m) { var o = document.createElement('option'); o.value = m.id; o.appendChild(document.createTextNode(m.title)); sel.appendChild(o); });
    sel.value = list.some(function(m) { return m.id === was; }) ? was : (list[0] ? list[0].id : '');
    _world.maps = sig;
    return list.length;
}
// The dialog as it stands: the chip in use, the row its choice needs, the line that says where it lands, the count, and Generate put out
// of use with the reason in sight where the world cannot be laid
function worldSync() {
    if (!worldShown()) return;
    var where = GEN_WHERE.indexOf(_world.where) >= 0 ? _world.where : 'fresh';
    Array.prototype.forEach.call(document.querySelectorAll('#worldWhere .gen-chip'), function(b) { var on = b.dataset.where === where; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    var mr = genEl('worldMapRow'), nr = genEl('worldNameRow'), ln = genEl('worldWhereLine'), ct = genEl('worldCount'), go = genEl('worldGo');
    if (mr) mr.hidden = where !== 'other';
    if (nr) nr.hidden = where !== 'fresh';
    var others = where === 'other' ? worldMapsFill() : 1;
    if (ln) ln.textContent = where === 'other' && !others ? WORLD_LINES.none : WORLD_LINES[where];
    var plan = worldPlan();
    if (ct) ct.textContent = plan.say;
    if (go) go.disabled = !plan.ok;
    if (typeof genPreviewDraw === 'function') genPreviewDraw('worldModal', plan.ok ? plan.items : null);   // 1.6.2: the small preview
}
// It comes up on A new map, as the sheet drew it: a world wants a map of its own. On a map that keeps its world's seed it comes up on
// This map with that seed and those settings, to make it again
function worldShow() {
    var m = genEl('worldModal'), WC = worldCore(), here = getActiveMap(); if (!m || !WC || !buildCore() || !buildMay() || !buildHere() || !here) return false;
    var kept = here.meta && typeof here.meta === 'object' && here.meta.world && typeof here.meta.world === 'object' && !Array.isArray(here.meta.world) ? WC.cleanWorld(here.meta.world) : null;
    if (kept) worldFill(kept); else { var sb = genEl('worldSeed'); if (sb) sb.value = genNewSeed(); }
    _world.where = kept ? 'here' : 'fresh'; _world.maps = '';
    var nm = genEl('worldName'), gs = genEl('worldGrid'); if (nm) nm.value = 'World'; if (gs) gs.value = 'off';
    m.style.display = 'flex';
    worldSync();
    var first = document.querySelector('#worldWhere .gen-chip.on'); if (first && first.focus) first.focus();
    return true;
}
function worldHide() { var m = genEl('worldModal'); if (!m || m.style.display === 'none') return; m.style.display = 'none'; var b = genEl('buildWorldBtn'); if (b && b.focus) b.focus(); }
// What Tab walks through, in the dialog's own order: never a row that is put away nor a control that is out of use
function worldStops() {
    var out = Array.prototype.slice.call(document.querySelectorAll('#worldWhere .gen-chip'));
    ['worldMap', 'worldName', 'worldGrid', 'worldSeed', 'worldSeedNew', 'worldLand', 'worldSize', 'worldMountains', 'worldForests', 'worldRivers', 'worldClimate', 'worldTowns', 'worldCancel', 'worldGo'].forEach(function(id) {
        var e = genEl(id), row = id === 'worldMap' ? genEl('worldMapRow') : id === 'worldName' || id === 'worldGrid' ? genEl('worldNameRow') : null;
        if (e && !e.disabled && !(row && row.hidden)) out.push(e);
    });
    return out;
}
// Tab goes round inside the dialog: past its last control to its first, and back. True when the focus was moved
function worldTab(target, back) {
    var st = worldStops(), at = st.indexOf(target); if (!st.length) return false;
    var to = back ? (at <= 0 ? st[st.length - 1] : null) : (at < 0 || at === st.length - 1 ? st[0] : null);
    if (!to || !to.focus) return false;
    to.focus(); return true;
}
// Generate: the world laid as the dialog's count said. The GM is taken to the map first, on its play map: that draws and saves it as it
// stands, a new map empty, which is the state one Undo goes back to. Then the pieces are laid there in ONE save, so one Undo takes the
// world back, and a new map stays
function worldGo() {
    if (!worldShown()) return false;   // only from the dialog as it stands: a second press finds it put away
    var plan = worldPlan(); if (!plan.ok) { worldSync(); return false; }
    var camp = getActiveCampaign(), here = getActiveMap(), map = plan.map, nmBox = genEl('worldName'), items = plan.items;
    if (plan.fresh) {
        map = createNewMap(getUniqueItemTitle(genText(nmBox ? nmBox.value : '', 80) || 'World', null));
        if (typeof applyMapStart === 'function') applyMapStart(map);   // 1.6.3: a new map starts at the scale the system names (models.js applyMapStart)
        map.meta.gridType = plan.grid;
        camp.items[map.id] = map;
    }
    if (!map.meta || typeof map.meta !== 'object') map.meta = {};
    if (!Array.isArray(map.whiteboard)) map.whiteboard = [];   // before the map is drawn: a map from a file may have none
    genUnfocus('worldModal'); worldHide();
    if (map === here) save(true);
    else {
        map.meta.lastView = 'visual'; if (typeof window !== 'undefined' && window.wpOpensNext) window.wpOpensNext('visual');   // backlog 221: over Maps open on
        if (!navigateToMap(map.id, null, true)) { if (plan.fresh) delete camp.items[map.id]; toast('That map could not be opened. Nothing was changed.'); return false; }
    }
    if (map.whiteboard.length + items.length > BUILD_MAX) { toast('That world could not be laid. Nothing was changed.'); return false; }
    var lockedN = typeof structLaid === 'function' ? structLaid(items) : 0;   // 231
    items.forEach(function(it) { map.whiteboard.push(it); });
    map.meta.world = plan.opts;   // the GM's own, to make it again: never sent (net.js sanitizeItem), cleaned from a file (cleanup.js)
    save(true); render();
    if (window.wpFog && window.wpFog.invalidateVision) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }
    toast('World laid, ' + items.length + ' pieces.' + (lockedN ? ' Its land and sea are locked in place.' : '') + ' One Undo takes it back.');
    return true;
}
function worldWire() {
    var m = genEl('worldModal'), row = genEl('buildWorldBtn'); if (!m) return;
    if (row) row.addEventListener('click', function(ev) { ev.stopPropagation(); worldShow(); });
    // the dialog hands the focus back to this row when it is put away: a key still held from the press that put it away presses nothing here
    if (row) row.addEventListener('keydown', function(e) { if (e.repeat === true && (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape')) { e.preventDefault(); e.stopPropagation(); } });   // a held Escape would be Build's own next, and put the tool away
    Array.prototype.forEach.call(document.querySelectorAll('#worldWhere .gen-chip'), function(b) { b.addEventListener('click', function() { var w = this.dataset.where; if (GEN_WHERE.indexOf(w) < 0) return; _world.where = w; worldSync(); }); });
    ['worldMap', 'worldLand', 'worldSize', 'worldMountains', 'worldForests', 'worldRivers', 'worldClimate', 'worldTowns'].forEach(function(id) { var e = genEl(id); if (e) e.addEventListener('change', worldSync); });
    var sb = genEl('worldSeed'); if (sb) sb.addEventListener('input', worldSync);
    var nw = genEl('worldSeedNew'); if (nw) nw.addEventListener('click', function() { var s = genEl('worldSeed'); if (s) s.value = genNewSeed(); worldSync(); });
    var no = genEl('worldCancel'); if (no) no.addEventListener('click', worldHide);
    var go = genEl('worldGo'); if (go) go.addEventListener('click', function() { worldGo(); });
    // Escape is heard FIRST, at the window, and goes no further, and the press that put the dialog away is the dialog's for as long as it
    // is held, as in the dungeon's and the city's dialogs. Never while a question or a prompt of the app's own is up over the dialog
    var escHeld = false;
    if (typeof window.addEventListener === 'function') window.addEventListener('keydown', function(e) {
        if (e.repeat !== true) escHeld = false;
        else if (escHeld && e.key === 'Escape') { if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); else e.stopPropagation(); e.preventDefault(); return; }
        if (e.key !== 'Escape' || !worldShown() || buildAsking()) return;
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation(); else e.stopPropagation();
        e.preventDefault();
        if (e.repeat !== true) { worldHide(); escHeld = true; }
    }, true);
    if (typeof window.addEventListener === 'function') window.addEventListener('keyup', function(e) { if (e.key === 'Escape') escHeld = false; }, true);
    // every key pressed in the dialog stays in it: the page reads keys as its own (Build's Esc and Enter, a token's arrows, Delete)
    m.addEventListener('keydown', function(e) {
        if (buildAsking()) return;   // a question or a prompt of the app's own, raised over the dialog, has every key: the focus may still rest in here
        e.stopPropagation();
        var t = e.target, box = !!t && /^INPUT$/.test(t.tagName || '');
        if (e.key === 'Escape') { e.preventDefault(); worldHide(); }
        else if (e.key === 'Enter' && box) { e.preventDefault(); worldGo(); }
        else if (e.key === 'Tab' && worldTab(t, e.shiftKey === true)) e.preventDefault();
    });
    // A key pressed while the dialog is up with the focus outside it (after a press on its backdrop) is the dialog's too. Escape puts the
    // dialog away, Tab brings the focus back in, and any other key does nothing. Heard first (capture), never under a question of the app's own
    document.addEventListener('keydown', function(e) {
        if (!worldShown() || buildAsking() || (e.target && typeof m.contains === 'function' && m.contains(e.target))) return;
        e.stopPropagation(); e.preventDefault();
        if (e.key === 'Escape') worldHide();
        else if (e.key === 'Tab') worldTab(null, e.shiftKey === true);
    }, true);
    // A paste is the page's to read too (it lays a copied piece or a picture on the map behind): never while the dialog is up, but for a
    // text field of the dialog's own, which takes its paste as any field does
    document.addEventListener('paste', function(e) {
        if (!worldShown() || buildAsking()) return;
        var t = e.target; if (t && typeof m.contains === 'function' && m.contains(t) && /^(INPUT|TEXTAREA)$/.test(t.tagName || '') && t.type !== 'checkbox') return;
        e.preventDefault(); e.stopPropagation();
    }, true);
}
// [buildcheck:worlddialog-end]
// [split:body-end]
return { worldWire: worldWire };   // [split:glue]
}   // [split:glue]
