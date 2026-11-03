// setups.js — backlog 31: the Set-ups window of a map (the owner, 2026-11-03, by prompt: "Map's right-click and tab (Recommended)": Set-ups... on the
// map's right-click menu and its tab in the top row opens a small window: Save as, then a list with Restore, Rename and Delete). The GM's alone, on the
// machine that owns the campaign. A restore is one save, so the GM's Undo takes it back. Every word is a text node
import { showConfirm, showPrompt } from './dialogs.js';
import { toast, save } from './io.js';
import { getActiveCampaign } from './models.js';
import { takeSetup, restoreSetup, cleanName, newId, logLine, SETUP_MAX } from './setupcore.js';

var _su = { mapId: null, open: null };

function suLog(step, facts) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('setups v1', step, facts || {}); else if (window.wpSetupsDebug) console.log(logLine(step, facts)); } catch (e) {} }   // structure only, never a name
function suMay() { var n = window.wpNet; return !!(window.wpCanPersistLocal && window.wpCanPersistLocal()) && !(n && n.active && n.role === 'client') && !window.wpStream; }
function suMap(id) { var camp = getActiveCampaign(), m = camp && camp.items && Object.prototype.hasOwnProperty.call(camp.items, id) ? camp.items[id] : null; return m && m.type === 'map' ? m : null; }
function suList(m) { return m && m.meta && Array.isArray(m.meta.setups) ? m.meta.setups : []; }
function suEl(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null) e.textContent = String(text); return e; }
function suWhen(at) { if (!(at > 0)) return ''; try { return new Date(at).toLocaleString(); } catch (e) { return ''; } }
function suCounts(s) { var n = (Array.isArray(s.toks) ? s.toks.length : 0), l = (Array.isArray(s.lights) ? s.lights.length : 0); return n + (n === 1 ? ' token' : ' tokens') + ', ' + l + (l === 1 ? ' light' : ' lights') + (s.fog ? ', fog' : ''); }

function suDraw() {
    var body = document.getElementById('setupBody'), title = document.getElementById('setupTitle'), m = suMap(_su.mapId); if (!body) return;
    body.textContent = ''; if (!m) { body.appendChild(suEl('div', 'setup-empty', 'That map is no longer here.')); return; }
    if (title) title.textContent = 'Set-ups of ' + ((m.meta && typeof m.meta.title === 'string' && m.meta.title.trim()) || 'Untitled');
    var list = suList(m);
    body.appendChild(suEl('div', 'setup-note', 'A set-up keeps the tokens, the fog and the lights of this map. Restoring one puts them back, and Undo takes that back. Drawings and walls stay as they are.'));
    if (!list.length) body.appendChild(suEl('div', 'setup-empty', 'No set-ups yet. Save the map as it stands now.'));
    list.forEach(function(s) {
        var row = suEl('div', 'setup-row'), head = suEl('div', 'setup-head'); head.appendChild(suEl('span', 'setup-name', s.name)); head.appendChild(suEl('small', 'setup-when', [suWhen(s.at), suCounts(s)].filter(Boolean).join(' · ')));
        var bt = suEl('div', 'setup-btns'), rs = suEl('button', 'tool', 'Restore'), rn = suEl('button', 'tool ghost', 'Rename'), dl = suEl('button', 'tool ghost', 'Delete');
        [rs, rn, dl].forEach(function(b) { b.type = 'button'; }); rs.title = 'Put this set-up back on the map'; rn.title = 'Give this set-up another name'; dl.title = 'Delete this set-up';
        rs.addEventListener('click', function() { _su.open = _su.open === s.id ? null : s.id; suDraw(); });
        rn.addEventListener('click', function() { showPrompt('Rename the set-up', s.name, function(v) { var nm = cleanName(v); if (!nm) return; s.name = nm; save(true); suLog('rename', {}); suDraw(); }); });
        dl.addEventListener('click', function() { showConfirm('Delete the set-up ' + s.name + '? The map stays as it is.', function(yes) { if (yes !== true) return; var l = suList(m), i = l.indexOf(s); if (i >= 0) l.splice(i, 1); if (!l.length && m.meta) delete m.meta.setups; save(true); suLog('delete', { left: l.length }); suDraw(); }); });
        [rs, rn, dl].forEach(function(b) { bt.appendChild(b); }); head.appendChild(bt); row.appendChild(head);
        if (_su.open === s.id) {   // the owner's three ticks, all on: one press restores everything, and an unticked part stays as it is now
            var tk = suEl('div', 'setup-ticks'), ticks = { toks: true, fog: true, lights: true };
            [['toks', 'Tokens'], ['fog', 'Fog'], ['lights', 'Lights']].forEach(function(q) { var lb = suEl('label', 'setup-tick'), c = document.createElement('input'); c.type = 'checkbox'; c.checked = true; c.setAttribute('data-k', 'tick|' + q[0]); c.addEventListener('change', function() { ticks[q[0]] = c.checked; }); lb.appendChild(c); lb.appendChild(suEl('span', null, q[1])); tk.appendChild(lb); });
            var go = suEl('button', 'tool', 'Restore now'), no = suEl('button', 'tool ghost', 'Cancel'); go.type = 'button'; no.type = 'button'; go.title = 'Put back what is ticked. Undo takes it back';
            go.addEventListener('click', function() { suRestore(m, s, ticks); }); no.addEventListener('click', function() { _su.open = null; suDraw(); });
            tk.appendChild(go); tk.appendChild(no); row.appendChild(tk);
        }
        body.appendChild(row);
    });
    var foot = suEl('div', 'setup-foot'), nm = document.createElement('input'), sv = suEl('button', 'tool', 'Save as'); nm.type = 'text'; nm.className = 'field setup-newname'; nm.maxLength = 60; nm.placeholder = 'A name, as Before the ambush'; nm.setAttribute('aria-label', 'The new set-up’s name'); sv.type = 'button'; sv.title = 'Save the map’s tokens, fog and lights as they stand now';
    sv.disabled = list.length >= SETUP_MAX; if (sv.disabled) sv.title = 'A map keeps ' + SETUP_MAX + ' set-ups at most. Delete one first';
    var doSave = function() { suSave(m, nm.value); }; sv.addEventListener('click', doSave); nm.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
    foot.appendChild(nm); foot.appendChild(sv); body.appendChild(foot);
}
function suSave(m, name) {
    if (!suMay()) return; var list = suList(m); if (list.length >= SETUP_MAX) { toast('A map keeps ' + SETUP_MAX + ' set-ups at most.'); return; }
    var id = newId(list); if (!id) return; var nm = cleanName(name) || 'Set-up ' + (list.length + 1), s = takeSetup(m, nm, Date.now(), id);
    m.meta = m.meta || {}; if (!Array.isArray(m.meta.setups)) m.meta.setups = []; m.meta.setups.push(s); save(true);
    suLog('save', { toks: s.toks.length, lights: s.lights.length, fog: s.fog ? 1 : 0, n: m.meta.setups.length }); toast('Saved the set-up ' + s.name + '.'); suDraw();
}
function suRestore(m, s, ticks) {
    if (!suMay()) return; if (!ticks.toks && !ticks.fog && !ticks.lights) { toast('Tick something to put back.'); return; }
    var r = restoreSetup(m, s, ticks); if (!r) return;
    m.whiteboard = r.whiteboard; if (r.fog) m.fog = r.fog; save();
    if (window.wpFog && typeof window.wpFog.invalidateSeen === 'function') { try { window.wpFog.invalidateSeen(); } catch (e) {} }
    if (window.appRender) window.appRender(); _su.open = null; suDraw();
    suLog('restore', { toks: ticks.toks ? 1 : 0, fog: ticks.fog ? 1 : 0, lights: ticks.lights ? 1 : 0 }); toast('Restored the set-up ' + s.name + '. Undo takes it back.');
}
function suOpen(mapId) {
    if (!suMay()) return false; var m = suMap(mapId), md = document.getElementById('setupModal'); if (!m || !md) return false;
    _su.mapId = mapId; _su.open = null; suDraw(); md.style.display = 'flex'; suLog('open', { n: suList(m).length });
    var nb = md.querySelector('.setup-newname'); if (nb && nb.focus) nb.focus(); return true;
}
function suClose() { var md = document.getElementById('setupModal'); if (md) md.style.display = 'none'; _su.mapId = null; _su.open = null; }

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.wpSetups = { open: suOpen, close: suClose };
    var suWire = function() {
        var c = document.getElementById('setupClose'); if (c) c.addEventListener('click', suClose);
        var tabs = document.getElementById('mapTabs');   // a map's tab in the top row: its right-click opens its set-ups
        if (tabs) tabs.addEventListener('contextmenu', function(e) {
            if (!suMay()) return; var t = e.target && e.target.closest ? e.target.closest('.map-tab[data-id], #mapTabFront') : null; if (!t) return;
            var camp = getActiveCampaign(), id = t.id === 'mapTabFront' ? camp && camp.activeItemId : t.getAttribute('data-id'); if (!id || !suMap(id)) return;
            e.preventDefault(); suOpen(id);
        });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', suWire); else suWire();
}
export { suOpen, suClose };
