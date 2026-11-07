// A map's own cell size, the controls (backlog 38's later fold; the owner, 2026-11-07, by prompt: "Both": Fit grid to picture and the
// numbers typed in the Measure options; "Tokens resize, rest stays (Recommended)", and a setting, off by default, that asks each time).
// The rules are cellcore.js's. The GM's alone, on the machine that owns the campaign.
import { getActiveMap } from './models.js';
import { save, toast } from './io.js';
import { state } from './state.js';
import { showPrompt, showConfirm } from './dialogs.js';
import { cellChange, cellFromClicks } from './cellcore.js';

var ASK_KEY = 'wp_cellAsk';
function el(id) { return document.getElementById(id); }
function gmHere() { var N = window.wpNet; if (N && N.active && N.role === 'client') return false; if (window.wpStream) return false; return typeof window.wpCanPersistLocal !== 'function' || window.wpCanPersistLocal() !== false; }
function gridOf(m) { var g = m && m.meta ? m.meta.gridType : null; return g === 'square' || g === 'hex' ? g : ''; }
function asks() { try { return localStorage.getItem(ASK_KEY) === 'on'; } catch (e) { return false; } }
function redraw() { if (typeof window.render === 'function') window.render(); else if (window.appRender) window.appRender(); }
// [buildcheck:cellsize-start]
// The words of a cell, as the GM reads them
function cellWords(g, c) { return (g === 'hex' ? 'Each hex row is ' : 'Each cell is ') + (c ? c.size : g === 'hex' ? 52 : 50) + ' px'; }
// The one way a map's cell is set from these controls: asked first where the setting says so, then one change and one save
function cellSet(next, why) {
    var m = getActiveMap(), g = gridOf(m); if (!m || !g || !gmHere()) return;
    var go = function(resize) {
        var r = cellChange(m, next, resize);
        if (!r.changed) { menuSync(); return; }
        save(); redraw(); menuSync();
        if (typeof window.wpStepLog === 'function') window.wpStepLog('cellsize v1', 'set', { grid: g, size: r.cell ? r.cell.size : 'default', moved: r.moved });
        toast(cellWords(g, r.cell) + ' on this map now' + (r.moved ? ', and ' + r.moved + ' token' + (r.moved === 1 ? '' : 's') + ' fitted to it' : '') + '. Undo puts it back.');
    };
    if (!asks()) { go(true); return; }
    showConfirm((why || 'The grid of this map changes size.') + ' Resize the tokens on it to the new cells?', function(a) { if (a === 'alt') go(false); else if (a) go(true); }, { yes: 'Resize them', alt: 'Leave them', noEnter: true });
}
// The Measure options' Cell size part, as the map on screen stands
function menuSync() {
    var part = el('measureCell'); if (!part) return;
    var m = getActiveMap(), g = gridOf(m), FC = window.wpFogCore, c = g && FC && typeof FC.cleanMapCell === 'function' ? FC.cleanMapCell(m.meta.cell, g) : null;
    part.hidden = !g || !gmHere();
    if (part.hidden) return;
    var lab = el('measureCellLab'); if (lab) lab.textContent = g === 'hex' ? 'Hex row' : 'Cell size';
    var sz = el('measureCellPx'), ox = el('measureCellOx'), oy = el('measureCellOy'), ask = el('measureCellAsk');
    if (sz && document.activeElement !== sz) sz.value = String(c ? c.size : g === 'hex' ? 52 : 50);
    if (ox && document.activeElement !== ox) ox.value = String(c && c.ox ? c.ox : 0);
    if (oy && document.activeElement !== oy) oy.value = String(c && c.oy ? c.oy : 0);
    if (ask) ask.checked = asks();
    var rs = el('measureCellReset'); if (rs) rs.disabled = !c;
}
// The numbers as typed, read as one cell
function typedCell() {
    var m = getActiveMap(), g = gridOf(m), num = function(id, d) { var v = Number(el(id) && el(id).value); return isFinite(v) ? v : d; };
    return { size: num('measureCellPx', g === 'hex' ? 52 : 50), ox: num('measureCellOx', 0), oy: num('measureCellOy', 0) };
}
// Fit grid to picture: two clicks on a picture's printed grid and how many cells apart, the mirror of Align its grid. The clicks ride on the
// placement mode (whiteboard.js hands a click with wpPlace.cellfit here), so they pass through the pieces and Escape cancels
function fitArm(rec) {
    var mv = el('moveModeBtn'); if (mv && (!mv.classList.contains('active') || window.isMeasureMode)) mv.click();
    window.wpPlace = { type: 'cellfit', props: {}, cellfit: rec };
    var wrap = el('whiteboardWrap'); if (wrap) wrap.style.cursor = 'crosshair';
    document.body.classList.add('placing');
    var g = gridOf(getActiveMap());
    toast(rec.step === 1 ? (g === 'hex' ? 'Click the centre of a hex printed on the picture. Esc cancels.' : 'Click a corner where two lines printed on the picture cross. Esc cancels.')
        : (g === 'hex' ? 'Now click the centre of another hex in the same column, a few hexes up or down. Esc cancels.' : 'Now click another corner a few cells along the same row or column. Esc cancels.'));
}
function fitStep(rec, x, y) {
    var m = getActiveMap(), g = gridOf(m); if (!m || !g || m.id !== rec.map) { toast('That map is no longer on screen.'); return; }
    if (rec.step === 1) { rec.a = { x: x, y: y }; rec.step = 2; fitArm(rec); return; }
    var a = rec.a, b = { x: x, y: y };
    showPrompt(g === 'hex' ? 'How many hexes apart are the two points?' : 'How many cells apart are the two points?', '', function(v) {
        if (v === null || v === undefined) return;
        var c = cellFromClicks(g, a, b, Number(String(v).trim()));
        if (!c) { toast('Type a whole number of cells, from 1 to 1000, for two points at least 4 px apart.'); return; }
        cellSet(c, 'The grid now fits the picture.');
    });
}
// [buildcheck:cellsize-end]
function wire() {
    var sz = el('measureCellPx'); if (!sz || sz.dataset.wired) return; sz.dataset.wired = '1';
    ['measureCellPx', 'measureCellOx', 'measureCellOy'].forEach(function(id) { var b = el(id); if (b) b.addEventListener('change', function() { cellSet(typedCell()); }); });
    var fit = el('measureCellFit'); if (fit) fit.addEventListener('click', function() { var m = getActiveMap(); if (!m || !gridOf(m) || !gmHere()) return; fitArm({ map: m.id, step: 1 }); });
    var rs = el('measureCellReset'); if (rs) rs.addEventListener('click', function() { cellSet(null); });
    var ask = el('measureCellAsk'); if (ask) ask.addEventListener('change', function() { try { if (ask.checked) localStorage.setItem(ASK_KEY, 'on'); else localStorage.removeItem(ASK_KEY); } catch (e) {} });
}
window.wpCellSize = { menuSync: menuSync, fitStep: fitStep, set: cellSet };
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }
