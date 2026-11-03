// declare.js: the box beside the turn strip while a round is being declared (1.6.2, backlog 210 d, G10; the owner, by prompt: "Who's in, not what"). A player writes for a row of their own, the GM for the NPCs and anyone away, and the GM may reveal early. What this screen shows of the others is who is in. Elements and text nodes alone, and the box is drawn again only when what it says changes, never under a line being typed
import { getActiveCampaign, getActiveMap } from './models.js';
import { toast } from './io.js';
function net() { return window.wpNet || null; }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = String(text); return e; }
function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
function fightOf(n, map) { if (!n || !map) return null; var c = typeof window.wpStripFight === 'function' ? window.wpStripFight(map.id) : null; return c || (typeof n.combatFor === 'function' ? n.combatFor(map.id) : null); }
function declaring(c, host) { return !!c && !!c.dec && (host ? c.dec.open === 1 : Array.isArray(c.dec.in)); }
function mineOf(c, map, host, me) {   // the rows this screen writes for: a player's own; the GM's those with no player
    var tok = function(r) { return map && Array.isArray(map.whiteboard) && r && typeof r.tokId === 'string' ? map.whiteboard.find(function(w) { return !!w && w.id === r.tokId; }) : null; };
    return c.rows.filter(function(r) { var t = tok(r), o = t && typeof t.ownerId === 'string' ? t.ownerId : ''; return !!r && r.name !== 'Hidden' && (host ? !o : o === me); });
}
function inOf(c, host) { return host ? c.rows.filter(function(r) { return !!r && own(c.dec.lines, r.id); }).map(function(r) { return r.id; }) : c.dec.in; }
function rulesSeen() { var cam = getActiveCampaign(), ir = cam && cam.system && cam.system.combat ? cam.system.combat.initiative : null; return !!(ir && ir.declareSeen === true); }
var _sig = null, _said = {};   // what this screen has sent, so that a box shows it back while the round is declared
function draw(box, n, c, map, host) {
    box.textContent = ''; var ins = inOf(c, host), total = host ? c.rows.length : c.dec.n, mine = mineOf(c, map, host, n.myId), seen = host && rulesSeen();
    box.appendChild(el('div', 'dc-head', host ? 'Declaring: ' + ins.length + ' of ' + total + ' in' : mine.length && mine.every(function(r) { return ins.indexOf(r.id) >= 0; }) ? 'Declared. Waiting for the others.' : 'Say what you mean to do.'));   // a player is told no count: it could tell them of someone they cannot see
    mine.forEach(function(r) {
        var row = el('div', 'dc-row'), put = el('input', 'field dc-line'), go = el('button', 'tool dc-send', ins.indexOf(r.id) >= 0 ? 'Change' : 'Send'); put.type = 'text'; put.maxLength = 200; put.placeholder = 'What ' + (r.name || 'they') + ' means to do'; go.type = 'button';
        var kS = c.id + '|' + c.round + '|' + r.id; put.value = host ? (own(c.dec.lines, r.id) ? c.dec.lines[r.id] : '') : own(_said, kS) ? _said[kS] : '';
        var send = function() { var w = n.declareIn(c.id, r.id, put.value); if (w) toast(w); else _said[kS] = put.value; if (document.activeElement === put) put.blur(); }; go.addEventListener('click', send); put.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); send(); } e.stopPropagation(); });
        row.appendChild(el('span', 'dc-name', r.name || 'Someone')); row.appendChild(put); row.appendChild(go); box.appendChild(row);
    });
    if (host) {
        var out = c.rows.filter(function(r) { return !!r && ins.indexOf(r.id) < 0 && mine.indexOf(r) < 0; }).map(function(r) { return r.name || 'Someone'; }); if (out.length) box.appendChild(el('div', 'dc-out', 'Still to come: ' + out.join(', ')));
        if (seen) c.rows.forEach(function(r) { if (r && own(c.dec.lines, r.id) && mine.indexOf(r) < 0) box.appendChild(el('div', 'dc-out', (r.name || 'Someone') + ': ' + c.dec.lines[r.id])); });
        var rv = el('button', 'tool ghost dc-reveal', 'Reveal now'); rv.type = 'button'; rv.title = 'Show what is in, for when someone is away'; rv.addEventListener('click', function() { n.declareReveal(c.id); }); box.appendChild(rv);
    }
}
function sync() {
    var box = document.getElementById('declareBox'), n = net(); if (!box) return; var map = getActiveMap(), host = !!n && n.role === 'host', c = fightOf(n, map);
    if (!declaring(c, host) || !!(n && n.stream)) { if (box.style.display !== 'none') box.style.display = 'none'; _sig = null; return; }
    var sig = JSON.stringify([c.id, c.round, inOf(c, host), c.rows.map(function(r) { return r && r.name; }), host && rulesSeen() ? c.dec.lines : 0]); box.style.display = 'flex';
    if (sig === _sig || (document.activeElement && box.contains(document.activeElement) && document.activeElement.tagName === 'INPUT')) return; _sig = sig; draw(box, n, c, map, host);
}
if (typeof window !== 'undefined') { window.wpDeclare = { sync: sync }; if (typeof document !== 'undefined' && typeof setInterval === 'function') setInterval(sync, 500); }   // it stands by the strip, and asks twice a second: drawn only when what it says changes, on any screen and any map
export { sync, mineOf, inOf, declaring };
