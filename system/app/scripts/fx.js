/* Visual effects (1.5.0, S3) — the UI half: the two draw layers (#fxScreen over the play map for flash / shake /
   wash / banner / weather, #fxLayer inside the board for bursts and token pulses), the GM's ✨ panel (#fxBtn /
   #fxPanel), the burst placement (a Measure sub-mode driven from whiteboard.js), the stream-window bridge over
   BroadcastChannel, and wpFxSync for the VTT feature switch. The wire lives in net.js (net.sendFx + the client
   branch); the validators and presets in fxcore.js. Design of record: docs/VISUAL_FX_PLAN.md. */
import { state } from './state.js';
import { getActiveMap, getActiveCampaign } from './models.js';
import { toast } from './io.js';
import { PRESETS, LIMITS, LOOKS } from './fxcore.js';

var ui = function(id) { return document.getElementById(id); };
function core() { return window.wpFxCore || null; }
function net() { return window.wpNet || null; }
function isHost() { var n = net(); return !!(n && n.active && n.role === 'host'); }
function isClient() { var n = net(); return !!(n && n.active && n.role === 'client' && !n.stream); }
function featureOn() { return window.wpVtt ? !!window.wpVtt.on('fx') : true; }
function canWrite() { return !!(window.wpCanPersistLocal && window.wpCanPersistLocal()) && !window.wpStream; }
function pref(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
function setPref(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function prefersReduced() { try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch (e) {} return pref('wp_fxReduced', '0') === '1'; }
function mapNow() { var m = getActiveMap(); return m && m.type === 'map' ? m.id : null; }

/* ---------- state ---------- */
var running = {};        // mapId -> { weather?, wash? } : the GM's authority for arrivals, the stream, the map poll
var lastBright = {};     // the photosensitivity gate's last accepted time, per bright kind { flash, boom }
var raf = null, particles = [], weatherFx = null, canvasMap = null;
var _clock = 0;         // a monotonic frame counter (no Date.now in the render loop is fine; used only for gating via performance.now)
function now() { try { return performance.now(); } catch (e) { return _clock += 16; } }

/* ---------- the layers ---------- */
function screenEl() { return ui('fxScreen'); }
function layerEl() { return ui('fxLayer'); }
function canvasEl() {
    var s = screenEl(); if (!s) return null;
    var c = s.querySelector('canvas.fx-canvas');
    if (!c) { c = el('canvas', 'fx-canvas'); s.appendChild(c); }
    return c;
}
function placeScreen() {
    var s = screenEl(), wrap = ui('whiteboardWrap'); if (!s || !wrap) return;
    var r = wrap.getBoundingClientRect();
    s.style.left = r.left + 'px'; s.style.top = r.top + 'px'; s.style.width = r.width + 'px'; s.style.height = r.height + 'px';
    sizeCanvas();
}
function sizeCanvas() {
    var s = screenEl(), c = s && s.querySelector('canvas.fx-canvas'); if (!c) return;
    var dpr = Math.min(1.5, window.devicePixelRatio || 1);
    var w = s.clientWidth, h = s.clientHeight;
    c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
    c.style.width = w + 'px'; c.style.height = h + 'px';
    var ctx = c.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ---------- render one effect ---------- */
function apply(fx) {
    var C = core(); if (!C || !fx) return;
    if (fx.kind === 'stop') { doStop(fx.what || 'all'); return; }
    if (!featureOn()) return;
    if (state.viewMode !== 'visual') return;
    if (fx.mapId && fx.mapId !== mapNow()) return;   // an effect belongs to its map
    var f = C.reduced(fx, prefersReduced());
    if (!f) return;   // reduced motion dropped it (shake)
    if (!C.allowFlash(f, lastBright, now())) return;   // the photosensitivity floor (per bright kind)
    var bk = C.brightKey(f); if (bk) lastBright[bk] = now();
    if (f.kind === 'flash') return renderFlash(f);
    if (f.kind === 'shake') return renderShake(f);
    if (f.kind === 'wash') return renderWash(f);
    if (f.kind === 'burst') return renderBurst(f);
    if (f.kind === 'weather') return renderWeather(f);
    if (f.kind === 'banner') return renderBanner(f);
    if (f.kind === 'pulse') return renderPulse(f);
}
function doStop(what) {
    if (what === 'weather' || what === 'all') stopWeather();
    if (what === 'wash' || what === 'all') { var w = screenEl(); if (w) w.querySelectorAll('.fx-wash').forEach(function(n) { n.classList.add('fx-out'); setTimeout(function() { n.remove(); }, 500); }); }
    if (what === 'all') { var sb = screenEl(); if (sb) sb.querySelectorAll('.fx-burst').forEach(function(n) { n.remove(); }); }
    var id = mapNow(); if (id && running[id]) { if (what === 'all') delete running[id]; else { delete running[id][what]; if (!running[id].weather && !running[id].wash) delete running[id]; } }
}
function renderFlash(f) {
    var s = screenEl(); if (!s) return;
    var d = el('div', 'fx-flash'); d.style.background = f.color; if (f.dim) d.style.opacity = '0.6';
    d.style.animationDuration = f.ms + 'ms'; s.appendChild(d);
    d.addEventListener('animationend', function() { d.remove(); });
}
function renderShake(f) {
    var wb = ui('whiteboard'); if (!wb) return;
    wb.style.setProperty('--fx-amp', (f.amp || 10) + 'px');
    wb.classList.remove('fx-shake'); void wb.offsetWidth;   // restart if already shaking
    wb.style.setProperty('--fx-dur', f.ms + 'ms'); wb.classList.add('fx-shake');
    var done = function() { wb.classList.remove('fx-shake'); wb.removeEventListener('animationend', done); };
    wb.addEventListener('animationend', done);
}
function renderWash(f) {
    var s = screenEl(); if (!s) return;
    s.querySelectorAll('.fx-wash').forEach(function(n) { n.remove(); });   // one wash at a time
    var d = el('div', 'fx-wash'); d.style.background = f.color; d.style.setProperty('--fx-alpha', String(f.alpha));
    d.style.setProperty('--fx-in', '400ms'); s.appendChild(d);
    if (f.hold && f.mapId) { running[f.mapId] = running[f.mapId] || {}; running[f.mapId].wash = f; }   // a held wash persists for arrivals / the map poll
    if (!f.hold && f.ms) { setTimeout(function() { d.classList.add('fx-out'); setTimeout(function() { d.remove(); if (running[f.mapId]) delete running[f.mapId].wash; }, 500); }, f.ms); }
}
function renderBanner(f) {
    var s = screenEl(); if (!s) return;
    var d = el('div', 'fx-banner'); var span = el('span', 'fx-banner-text', f.text); if (f.color) span.style.color = f.color;
    d.appendChild(span); d.style.animationDuration = f.ms + 'ms'; s.appendChild(d);
    setTimeout(function() { d.remove(); }, f.ms + 150);   // removed on a timer, not animationend (a two-animation shorthand fires per sub-animation)
}
function renderPulse(f) {
    var node = state.wbEls && state.wbEls[f.tok]; if (!node || node.dataset.ph) return;   // a hidden token's placeholder is never pulsed
    if (f.color) node.style.setProperty('--fx-pulse-color', f.color);
    node.classList.remove('fx-pulse'); void node.offsetWidth; node.classList.add('fx-pulse');
    var done = function() { node.classList.remove('fx-pulse'); node.removeEventListener('animationend', done); };
    node.addEventListener('animationend', done);
}
function renderBurst(f) {
    // Bursts live in #fxScreen (the fixed overlay), not inside #whiteboard: a whiteboard re-render wipes stray
    // children of the board. Board coordinates are converted to the overlay's own frame (pan + zoom) at placement;
    // a burst is short-lived, so it need not track a pan during its ~1s life.
    var s = screenEl(), wrap = ui('whiteboardWrap'); if (!s || !wrap) return;
    var z = state.zoomLevel || 1, lx = f.x * z - wrap.scrollLeft, ly = f.y * z - wrap.scrollTop, r = f.r * z;
    var d = el('div', 'fx-burst fx-burst-' + f.look); d.style.left = (lx - r) + 'px'; d.style.top = (ly - r) + 'px'; d.style.width = (2 * r) + 'px'; d.style.height = (2 * r) + 'px';
    d.style.setProperty('--fx-dur', f.ms + 'ms'); if (f.color) d.style.setProperty('--fx-color', f.color);
    d.appendChild(el('div', 'fx-burst-ring'));
    if (f.look === 'smoke') { d.appendChild(el('div', 'fx-burst-puff')); }
    else if (f.look === 'magic') { var g = el('div', 'fx-burst-glyphs'); for (var i = 0; i < 6; i++) { var gl = el('div', 'fx-glyph'); gl.style.setProperty('--fx-i', String(i)); g.appendChild(gl); } d.appendChild(g); }
    if (!f.noParticles && (f.look === 'boom' || f.look === 'sparks')) {
        var n = f.look === 'boom' ? 12 : 10;
        for (var p = 0; p < n; p++) {
            var a = (p / n) * Math.PI * 2 + Math.random() * 0.4, dist = r * (0.6 + Math.random() * 0.4);
            var dot = el('div', 'fx-particle');
            dot.style.setProperty('--fx-dx', Math.round(Math.cos(a) * dist) + 'px');
            dot.style.setProperty('--fx-dy', Math.round(Math.sin(a) * dist) + 'px');
            d.appendChild(dot);
        }
    }
    s.appendChild(d);
    setTimeout(function() { d.remove(); }, f.ms + 200);
}

/* ---------- weather (one canvas, one rAF loop) ---------- */
function renderWeather(f) {
    weatherFx = f; canvasMap = f.mapId;
    if (f.mapId) { running[f.mapId] = running[f.mapId] || {}; running[f.mapId].weather = f; }   // persists for arrivals / the map poll
    var c = canvasEl(); if (!c) return;
    sizeCanvas();
    seedWeather(f);
    if (!raf) loop();
}
function stopWeather() { weatherFx = null; particles = []; canvasMap = null; if (raf) { cancelAnimationFrame(raf); raf = null; } var c = screenEl() && screenEl().querySelector('canvas.fx-canvas'); if (c) { var x = c.getContext('2d'); if (x) x.clearRect(0, 0, c.width, c.height); } }
function seedWeather(f) {
    var s = screenEl(); if (!s) return;
    var w = s.clientWidth, h = s.clientHeight;
    var base = f.look === 'haze' ? 40 : f.look === 'embers' ? 60 : 120;
    var count = Math.min(220, Math.round(base * (f.density || 0.6)));
    particles = [];
    for (var i = 0; i < count; i++) particles.push(newParticle(f.look, w, h, true));
}
function newParticle(look, w, h, seed) {
    var p = { x: Math.random() * w, y: seed ? Math.random() * h : (look === 'embers' ? h + 10 : -10) };
    if (look === 'rain') { p.vy = 9 + Math.random() * 6; p.vx = 1.5; p.len = 10 + Math.random() * 10; }
    else if (look === 'snow') { p.vy = 1 + Math.random() * 1.5; p.vx = (Math.random() - 0.5) * 0.8; p.r = 1 + Math.random() * 2; p.sway = Math.random() * Math.PI * 2; }
    else if (look === 'embers') { p.vy = -(0.6 + Math.random() * 1.2); p.vx = (Math.random() - 0.5) * 0.6; p.r = 1 + Math.random() * 1.5; p.life = 1; }
    else { p.vy = 0.1; p.vx = 0.3 + Math.random() * 0.4; p.r = 30 + Math.random() * 40; }   // haze blobs
    return p;
}
function loop() {
    raf = null;
    if (!weatherFx) return;
    if (document.hidden) { raf = requestAnimationFrame(loop); return; }   // paused but alive
    var s = screenEl(), c = s && s.querySelector('canvas.fx-canvas'); if (!c) return;
    if (canvasMap && canvasMap !== mapNow()) { return; }   // left the map; the poll will have stopped us
    var ctx = c.getContext('2d'), w = s.clientWidth, h = s.clientHeight; if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    var look = weatherFx.look;
    for (var i = 0; i < particles.length; i++) {
        var p = particles[i];
        if (look === 'rain') { p.x += p.vx; p.y += p.vy; if (p.y > h) { particles[i] = newParticle(look, w, h); continue; } ctx.strokeStyle = 'rgba(150,170,200,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx, p.y - p.len); ctx.stroke(); }
        else if (look === 'snow') { p.sway += 0.02; p.x += p.vx + Math.sin(p.sway) * 0.5; p.y += p.vy; if (p.y > h) { particles[i] = newParticle(look, w, h); continue; } ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
        else if (look === 'embers') { p.x += p.vx; p.y += p.vy; p.life -= 0.004; if (p.y < -10 || p.life <= 0) { particles[i] = newParticle(look, w, h); continue; } ctx.fillStyle = 'rgba(255,' + Math.round(120 + 80 * p.life) + ',40,' + (0.5 * p.life).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
        else { p.x += p.vx; if (p.x - p.r > w) p.x = -p.r; ctx.fillStyle = 'rgba(120,120,130,0.05)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
    }
    raf = requestAnimationFrame(loop);
}

/* ---------- the GM's play path ---------- */
function play(fx) {   // GM (or solo): clean, remember running, show locally, send, mirror to the stream
    var C = core(); if (!C) return { error: 'Effects are not available.' };
    if (window.wpStream) return { error: 'Not from the stream window.' };
    if (!featureOn()) return { error: 'Visual effects are off for this campaign.' };
    var clean = C.cleanFx(fx); if (!clean) return { error: 'That effect could not be built.' };
    apply(clean);   // apply records running only when the effect actually renders (past the guard, feature and map checks)
    var n = net(); if (n && n.sendFx) n.sendFx(clean);
    streamPost(clean);
    return { ok: true };
}
function receive(fx) { apply(fx); }   // the wire entry (net.js has already cleaned it)

/* ---------- the burst placement (armed from the panel, placed on the map by whiteboard.js) ---------- */
function armBurst(look, rPx) {
    if (LOOKS.burst.indexOf(look) < 0 || !window.wpArmFxBurst) return;
    window.wpArmFxBurst(look, rPx);
    var chips = ui('fxPanel'); if (chips) chips.querySelectorAll('.fx-burst-btn').forEach(function(b) { b.classList.toggle('armed', b.dataset.look === look); });
}
function placeBurst(x, y, look, rPx) {   // whiteboard.js calls this on a click in the 'fx' measure mode
    var id = mapNow(); if (!id) return;
    play({ kind: 'burst', mapId: id, x: x, y: y, look: look, r: rPx });
    var chips = ui('fxPanel'); if (chips) chips.querySelectorAll('.fx-burst-btn').forEach(function(b) { b.classList.remove('armed'); });
}
function blastBoom(x, y, rPx) { var id = mapNow(); if (!id) return; play({ kind: 'burst', mapId: id, x: x, y: y, look: 'boom', r: Math.min(rPx, LIMITS.r[1]) }); }

/* ---------- the stream-window bridge ---------- */
var streamChan = null; try { streamChan = new BroadcastChannel('waypoint'); } catch (e) {}
function streamOn() { return pref('wp_streamFx', '1') !== '0'; }
function streamPost(fx) { if (isClient()) return; if (!streamChan || window.wpStream) return; try { streamChan.postMessage({ type: 'fx', fx: fx }); } catch (e) {} }
if (window.wpStream && streamChan) {
    streamChan.addEventListener('message', function(e) {
        if (!e.data || e.data.type !== 'fx' || !streamOn()) return;
        var C = core(); if (!C) return; var clean = C.cleanFx(e.data.fx); if (clean) apply(clean);
    });
    // ask the host for the running set once the stream window knows its map
    var _sk = null;
    setInterval(function() { var k = mapNow(); if (k && k !== _sk) { _sk = k; try { streamChan.postMessage({ type: 'fx-query' }); } catch (e) {} } }, 600);
} else if (streamChan) {
    streamChan.addEventListener('message', function(e) { if (e.data && e.data.type === 'fx-query') { var id = mapNow(); (core() ? core().runningSet(running, id) : []).forEach(streamPost); } });
}

/* ---------- the map poll: an effect belongs to its map ---------- */
var _pollMap = null;
setInterval(function() {
    var id = mapNow();
    if (id === _pollMap) return;
    _pollMap = id;
    stopWeather();
    var s = screenEl(); if (s) s.querySelectorAll('.fx-wash, .fx-banner, .fx-flash, .fx-burst').forEach(function(n) { n.remove(); });
    if ((id && isHost()) || (id && !(net() && net().active))) { (core() ? core().runningSet(running, id) : []).forEach(function(m) { apply(m); }); }   // the GM restores its own running set for the map it moved to
}, 500);

/* ---------- the ✨ panel ---------- */
var panelOpen = false;
function openPanel() { var p = ui('fxPanel'); if (!p || !canWrite()) return; if (window.wpSound && window.wpSound.closePanel) window.wpSound.closePanel(); p.style.display = 'flex'; panelOpen = true; placePanel(); renderPanel(); }   // Sound and Visual effects share the corner: only one panel at a time
function closePanel() { var p = ui('fxPanel'); if (p) p.style.display = 'none'; panelOpen = false; }
function placePanel() { var p = ui('fxPanel'); if (!p) return; try { var pos = JSON.parse(pref('wp_fxPanel', 'null')); if (pos && isFinite(pos.x) && isFinite(pos.y)) { p.style.left = Math.max(0, Math.min(window.innerWidth - 60, pos.x)) + 'px'; p.style.top = Math.max(0, Math.min(window.innerHeight - 40, pos.y)) + 'px'; p.style.right = 'auto'; } } catch (e) {} }
function soundEntries() { try { return window.wpSound && window.wpSound.entries ? window.wpSound.entries() : []; } catch (e) { return []; } }
function playersHere() { var n = net(), id = mapNow(); if (!(n && n.active && n.role === 'host') || !id) return -1; var c = 0; Object.values(n.roster || {}).forEach(function(p) { if (p && p.location === id) c++; }); return c; }
function renderPanel() {
    var body = ui('fxBody'); if (!body) return;
    if (!featureOn()) { body.innerHTML = '<div class="snd-none">Visual effects are off for this campaign — switch them on in &#9881; Settings &#9656; VTT features.</div>'; return; }
    var chip = function(cls, look, label, extra) { return '<button class="journal-from ' + cls + '" data-look="' + esc(look) + '"' + (extra || '') + '>' + esc(label) + '</button>'; };
    var byRow = function(row) { return PRESETS.filter(function(p) { return p.row === row; }); };
    var here = playersHere();
    var html = '';
    if (here >= 0) html += '<div class="fx-here' + (here === 0 ? ' none' : '') + '">' + (here === 0 ? 'No players on this map — they will not see it' : here + ' player' + (here === 1 ? '' : 's') + ' on this map') + '</div>';
    html += '<div class="snd-row"><span class="snd-label">Screen</span>' + byRow('screen').map(function(p) { return chip('fx-screen-btn', p.id, p.label, ' data-id="' + p.id + '"'); }).join('') + '<button class="journal-from fx-stop" data-act="stop-wash" title="Clear the colour wash">Clear</button></div>';
    html += '<div class="snd-row"><span class="snd-label">Burst</span>' + byRow('burst').map(function(p) { return chip('fx-burst-btn', p.fx.look, p.label, ' title="Click, then click the map"'); }).join('') + '</div>';
    html += '<div class="snd-row fx-slider"><span class="snd-label"></span><label title="Burst radius">Radius <input type="range" id="fxRadius" min="20" max="1200" value="160"><span id="fxRadiusVal" class="fx-dim"></span></label></div>';
    html += '<div class="snd-row"><span class="snd-label">Weather</span>' + byRow('weather').map(function(p) { return chip('fx-weather-btn', p.fx.look, p.label, ' data-id="' + p.id + '"'); }).join('') + '<button class="journal-from fx-stop" data-act="stop-weather" title="Stop the weather">Stop</button></div>';
    html += '<div class="snd-row fx-slider"><span class="snd-label"></span><label title="Weather thickness">Density <input type="range" id="fxDensity" min="20" max="100" value="60"></label></div>';
    html += '<div class="snd-row"><span class="snd-label">Banner</span><input type="text" id="fxBanner" class="field" maxlength="120" placeholder="Round 3 &middot; Enter to send" style="flex:1;"></div>';
    var cues = soundEntries().filter(function(e) { return e.kind === 'cue'; });
    if (cues.length && (!window.wpVtt || window.wpVtt.on('sound'))) html += '<div class="snd-row"><span class="snd-label">Sound with it</span><select id="fxCue" class="field"><option value="">none</option>' + cues.map(function(e) { return '<option value="' + esc(e.id) + '">' + esc(e.name) + '</option>'; }).join('') + '</select></div>';
    body.innerHTML = html;
    var rv = ui('fxRadius'), rvl = ui('fxRadiusVal'); if (rv && rvl) { var upd = function() { var y = window.wpMeasure ? window.wpMeasure.pxToYards(+rv.value) : null; rvl.textContent = y != null ? '~' + y + ' yd' : (rv.value + ' px'); }; rv.addEventListener('input', upd); upd(); }
}
function withCue(fn) { fn(); var sel = ui('fxCue'); if (sel && sel.value && window.wpSound && window.wpSound.play) { var e = soundEntries().find(function(x) { return x.id === sel.value; }); if (e) { try { window.wpSound.play(e.id); } catch (er) {} } } }

/* ---------- wiring ---------- */
(function wire() {
    var p = ui('fxPanel'); if (!p) return;
    var b = ui('fxBtn'); if (b) b.addEventListener('click', function() { if (panelOpen) closePanel(); else openPanel(); });
    var cl = ui('fxCloseBtn'); if (cl) cl.addEventListener('click', closePanel);
    p.addEventListener('click', function(e) {
        var btn = e.target.closest && e.target.closest('button'); if (!btn) return;
        var act = btn.dataset.act;
        if (act === 'stop-wash') { play({ kind: 'stop', what: 'wash' }); return; }
        if (act === 'stop-weather') { play({ kind: 'stop', what: 'weather' }); return; }
        if (btn.classList.contains('fx-screen-btn')) { var pr = PRESETS.find(function(x) { return x.id === btn.dataset.id; }); if (pr) withCue(function() { play(Object.assign({ mapId: mapNow() }, pr.fx)); }); return; }
        if (btn.classList.contains('fx-weather-btn')) { var pw = PRESETS.find(function(x) { return x.id === btn.dataset.id; }); if (pw) { var dn = ui('fxDensity'); play(Object.assign({ mapId: mapNow(), density: dn ? +dn.value / 100 : 0.6 }, pw.fx, { density: dn ? +dn.value / 100 : pw.fx.density })); } return; }
        if (btn.classList.contains('fx-burst-btn')) { var rv = ui('fxRadius'); armBurst(btn.dataset.look, rv ? +rv.value : 160); }
    });
    var banner = ui('fxBanner');
    p.addEventListener('keydown', function(e) { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); closePanel(); } });
    p.addEventListener('keypress', function(e) { if (e.key === 'Enter' && e.target.id === 'fxBanner') { var t = e.target.value.trim(); if (t) withCue(function() { play({ kind: 'banner', mapId: mapNow(), text: t }); }); e.target.value = ''; } });
    // drag the head
    var head = ui('fxHead'); var drag = null;
    if (head) {
        head.addEventListener('pointerdown', function(e) { if (e.target.closest('button, select, input')) return; var r = p.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
        head.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = (e.clientX - drag.dx) + 'px'; p.style.top = (e.clientY - drag.dy) + 'px'; p.style.right = 'auto'; });
        head.addEventListener('pointerup', function() { if (!drag) return; drag = null; var r = p.getBoundingClientRect(); setPref('wp_fxPanel', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); });
    }
    // the layers follow the wrap and the window
    var wrap = ui('whiteboardWrap');
    if (wrap && window.ResizeObserver) { try { new ResizeObserver(placeScreen).observe(wrap); } catch (e) {} }
    window.addEventListener('resize', function() { placeScreen(); if (panelOpen) placePanel(); });
    window.addEventListener('scroll', placeScreen, true);
    document.addEventListener('visibilitychange', function() { if (!document.hidden && weatherFx && !raf) loop(); });
    setTimeout(placeScreen, 0);
})();

function sync() {   // the VTT switch moved, or a session started / ended
    var on = featureOn(), b = ui('fxBtn');
    if (b) b.style.display = (on && canWrite()) ? '' : 'none';
    if (!on) { stopAll(); closePanel(); }
    else if (panelOpen) renderPanel();
}
function stopAll() { stopWeather(); running = {}; lastBright = {}; var s = screenEl(); if (s) s.querySelectorAll('.fx-wash, .fx-banner, .fx-flash, .fx-burst').forEach(function(n) { n.remove(); }); var wb = ui('whiteboard'); if (wb) wb.classList.remove('fx-shake'); }
function tableLeft() { stopAll(); }
function onSnapshot() { stopAll(); }
function foreign(isForeign) { if (!isForeign) stopAll(); }

window.wpFxSync = sync;
setTimeout(sync, 0);
window.wpFx = {
    play: play, receive: receive, stopAll: stopAll, running: function() { return running; },
    runningSet: function(id) { return core() ? core().runningSet(running, id) : []; },
    armBurst: armBurst, placeBurst: placeBurst, blastBoom: blastBoom,
    openPanel: openPanel, closePanel: closePanel, sync: sync,
    tableLeft: tableLeft, onSnapshot: onSnapshot, foreign: foreign,
    stats: function() { return { raf: !!raf, particles: particles.length, running: Object.keys(running).length, weather: weatherFx ? weatherFx.look : null }; }
};
