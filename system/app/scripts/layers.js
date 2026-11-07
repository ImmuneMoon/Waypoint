/* Layers (1.6.2, backlog 217; the owner, 2026-11-07, by prompt: the list of a map's pieces "somewhere more obviously recognizable as a central
   piece for sorting layers on a map", with "grouping parent/child sections in elements for grouped or flattened items", and never "confused for
   tracking all elements on every map"; its button "B. Sheets with a list", "A row in More"). A floating window titled with the map's name, the
   GM's. The list itself is inspector.js renderElementList, which draws into #layersList while this is up on the play map: a group and a
   flattened picture hold their pieces under them. Steps log as layers v1. */
import { state } from './state.js';
import { getActiveMap } from './models.js';
import { renderElementList } from './inspector.js';

var P = function() { return document.getElementById('layersPanel'); };
function step(s, f) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('layers v1', s, f || {}); } catch (e) {} }
function shown() { var p = P(); return !!p && p.style.display !== 'none'; }
function title() { var t = document.getElementById('layersMap'), m = getActiveMap(); if (t) t.textContent = m && m.meta && typeof m.meta.title === 'string' && m.meta.title ? m.meta.title : 'This map'; }
function open() {
    var p = P(); if (!p) return;
    p.style.display = ''; if (window.wpFloats && typeof window.wpFloats.reveal === 'function') window.wpFloats.reveal(p);
    title(); renderElementList(); step('open', { view: state.viewMode });
}
function close() {
    var p = P(); if (!p || p.style.display === 'none') return;
    p.style.display = 'none'; var l = document.getElementById('layersList'); if (l) l.textContent = ''; step('close');
}
function toggle() { if (shown()) close(); else open(); }
function wire() {
    var b = document.getElementById('layersBtn'); if (b) b.addEventListener('click', function() { if (state.viewMode !== 'visual') return; open(); });
    var c = document.getElementById('layersClose'); if (c) c.addEventListener('click', function() { close(); });
    var p = P(), head = document.getElementById('layersHead'), drag = null; if (!p || !head) return;   // moved by its title bar, as the other floating boxes are
    head.addEventListener('pointerdown', function(e) { if (e.target.closest('button')) return; var r = p.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
    head.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = (e.clientX - drag.dx) + 'px'; p.style.top = (e.clientY - drag.dy) + 'px'; p.style.right = 'auto'; });
    head.addEventListener('pointerup', function() { drag = null; });
}
// 1.6.2, backlog 217: Properties floats. Moved by its title bar, kept where it was left on this computer (wp_propAt), held inside the window; its close
// presses the toggle at the map's edge, so a hand close holds as it always did
function propAt() { try { var v = JSON.parse(localStorage.getItem('wp_propAt') || 'null'); return v && typeof v.x === 'number' && typeof v.y === 'number' && isFinite(v.x) && isFinite(v.y) ? v : null; } catch (e) { return null; } }
function propPlace(sb, at) { if (!sb || !at) return; var w = sb.offsetWidth || 320, x = Math.max(4, Math.min(window.innerWidth - Math.min(w, 120), at.x)), y = Math.max(40, Math.min(window.innerHeight - 60, at.y)); sb.style.left = x + 'px'; sb.style.top = y + 'px'; sb.style.right = 'auto'; }
function propWire() {
    var sb = document.getElementById('sidebar'), head = document.getElementById('propHead'), x = document.getElementById('propClose'), drag = null; if (!sb || !head) return;
    if (x) x.addEventListener('click', function() { var t = document.getElementById('toggleRightBtn'); if (t && !sb.classList.contains('collapsed')) t.click(); });
    propPlace(sb, propAt());
    head.addEventListener('pointerdown', function(e) { if (e.target.closest('button')) return; var r = sb.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
    head.addEventListener('pointermove', function(e) { if (!drag) return; propPlace(sb, { x: e.clientX - drag.dx, y: e.clientY - drag.dy }); });
    head.addEventListener('pointerup', function() { if (!drag) return; drag = null; var r = sb.getBoundingClientRect(); try { localStorage.setItem('wp_propAt', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); } catch (e) {} step('prop-moved'); });
    window.addEventListener('resize', function() { var a = propAt(); if (a) propPlace(sb, a); });
}
if (typeof window !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', propWire); else propWire(); }
if (typeof window !== 'undefined') { window.wpLayers = { open: open, close: close, toggle: toggle, shown: shown, title: title }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire(); }
export { open, close, toggle, shown };
