/* Sound & effects (1.5.0) — ambient loops and one-shot cues at the table (docs/SOUND_PLAN.md).
   The engine (Web Audio: one ambient lane with a crossfade, up to four overlapping cues, decoded PCM
   kept for a bounded number of seconds, the compressed bytes as the durable copy), the GM's panel on
   the play map (#soundPanel) and library (#soundLibModal: uploads into saves/images/audio/<campId>/,
   the bundled defaults under Shared, Import from another campaign… by reference), the player's
   indicator in the Table pill (#soundInd) with volume, mute and "off for me", the autoplay gate, the
   stream window's BroadcastChannel carrier, and the glue net.js calls: listMessage() for the host,
   onList / onCue / onSnapshot / tableLeft / sessionEnded for the client. soundcore.js holds the
   validators; net.js holds the wire (sounds / sound messages, chunked asset-part transfer). */
import { state } from './state.js';
import { getActiveCampaign } from './models.js';
import { save, toast } from './io.js';
import { LIMITS, safeId, cleanSoundList, cleanSoundCue, mixGain, seamBlend, EXT_RE } from './soundcore.js';
import { showConfirm } from './dialogs.js';
import { num } from './safecore.js';

var ui = function(id) { return document.getElementById(id); };
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function uid() { return 's_' + Math.random().toString(36).slice(2, 8); }
function net() { return window.wpNet || null; }
function isClient() { var n = net(); return !!(n && n.active && n.role === 'client' && !n.stream); }
function isHost() { var n = net(); return !!(n && n.active && n.role === 'host'); }
function featureOn() { return window.wpVtt ? !!window.wpVtt.on('sound') : true; }
function canWrite() { return !!(window.wpCanPersistLocal && window.wpCanPersistLocal()) && !window.wpStream; }
function pref(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
function setPref(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
function fmtDur(s) { s = Math.round(s || 0); return s >= 60 ? Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2) : s + ' s'; }
function fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'; }

/* ---------- the bundled defaults (assets/sounds/sounds.json; absent until the set ships) ---------- */
var defaults = {};   // id → { name, file, kind, dur, size }
var defaultsLoaded = fetch('assets/sounds/sounds.json', { cache: 'no-store' }).then(function(r) { return r.ok ? r.json() : []; }).catch(function() { return []; }).then(function(list) {
    (Array.isArray(list) ? list : []).forEach(function(d) { if (d && /^[A-Za-z0-9_-]{1,40}$/.test(d.id || '') && /^[A-Za-z0-9_.-]+$/.test(d.file || '')) defaults[d.id] = { name: String(d.name || d.id).slice(0, LIMITS.name), file: d.file, kind: d.kind === 'loop' ? 'loop' : 'cue', dur: Number(d.dur) || 0, size: Number(d.size) || 0 }; });
    return defaults;
});
function hiddenDefaults() { try { return JSON.parse(pref('wp_soundHidden', '[]')) || []; } catch (e) { return []; } }
function setHiddenDefaults(arr) { setPref('wp_soundHidden', JSON.stringify(arr)); }
function defaultEntries() { var hid = hiddenDefaults(); return Object.keys(defaults).filter(function(id) { return hid.indexOf(id) < 0; }).map(function(id) { var d = defaults[id]; return { id: id, def: true, name: d.name, path: 'assets/sounds/' + d.file, kind: d.kind, gain: 1, size: 0, dur: d.dur }; }); }

/* ---------- the campaign's index (camp.sounds, GM-only; readers never create it) ---------- */
function campList(camp) { camp = camp || getActiveCampaign(); return camp && camp.sounds && Array.isArray(camp.sounds.list) ? camp.sounds.list : []; }
function campListW(camp) { camp = camp || getActiveCampaign(); if (!camp) return []; if (!camp.sounds || typeof camp.sounds !== 'object') camp.sounds = { v: 1, list: [] }; if (!Array.isArray(camp.sounds.list)) camp.sounds.list = []; return camp.sounds.list; }
function ownEntries() { return campList().filter(function(e) { return e && typeof e === 'object'; }); }
// Everything this machine may play right now: the table's list (client) or the campaign's + the defaults (host / solo)
function playable() {
    if (isClient()) { var n = net(); return Array.isArray(n.sounds) ? n.sounds : []; }
    return cleanSoundList(ownEntries().concat(defaultEntries()), { defaults: defaults });
}
function entryById(id) { return playable().find(function(e) { return e.id === id; }) || null; }

/* ---------- the engine ---------- */
var ctx = null, ambient = null, cues = [], cache = {}, bytes = {}, cacheSec = 0, listeners = [];
var local = Number(pref('wp_soundVolume', '80')) / 100, master = Number(pref('wp_soundMaster', '80')) / 100, muted = false, hostMaster = 1;
var pendingGate = null, gateShown = false, queue = [], queueBusy = false, queueBytes = 0, atTable = false;
function ac() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } } return ctx; }
function running() { return !!(ctx && ctx.state === 'running'); }
function emit() { listeners.forEach(function(fn) { try { fn(status()); } catch (e) {} }); }
function status() { return { ambient: ambient ? ambient.entry : null, cues: cues.length, muted: muted, volume: local, master: master, ready: running(), gate: !!pendingGate, on: featureOn() }; }
function effGain(entry) { return muted ? 0 : mixGain(entry, isClient() ? hostMaster : master, local); }
// bytes: defaults and the host / solo / stream read the local server; a client asks the host through net.fetchAsset
function bytesFor(entry) {
    if (bytes[entry.path]) return Promise.resolve(bytes[entry.path]);
    var p;
    if (entry.def || !isClient()) p = fetch(encodeURI(entry.path)).then(function(r) { if (!r.ok) throw new Error('missing'); return r.blob(); });
    else { var n = net(); if (!n || !n.fetchAsset) return Promise.reject(new Error('offline')); p = n.fetchAsset(entry.path, entry.size); }
    return p.then(function(blob) { if (blob.size > LIMITS.file * 3) throw new Error('too-big'); bytes[entry.path] = blob; return blob; });
}
function evict(keep) {
    var ids = Object.keys(cache).sort(function(a, b) { return cache[a].last - cache[b].last; });
    while (cacheSec > LIMITS.cacheSec && ids.length) { var id = ids.shift(); if (id === keep || (ambient && ambient.entry.id === id)) continue; cacheSec -= cache[id].sec; delete cache[id]; }
}
function bufferFor(entry) {
    if (cache[entry.id] && cache[entry.id].path === entry.path) { cache[entry.id].last = Date.now(); return Promise.resolve(cache[entry.id]); }
    var a = ac(); if (!a) return Promise.reject(new Error('no audio'));
    return bytesFor(entry).then(function(blob) { return blob.arrayBuffer(); }).then(function(buf) { return a.decodeAudioData(buf); }).then(function(decoded) {
        var buffer = decoded, loopEnd = 0;
        if (entry.kind === 'loop') {
            var chans = []; for (var c = 0; c < decoded.numberOfChannels; c++) chans.push(decoded.getChannelData(c));
            var sb = seamBlend(chans, decoded.sampleRate);
            if (sb.loopEnd) { buffer = a.createBuffer(decoded.numberOfChannels, decoded.length, decoded.sampleRate); sb.channels.forEach(function(ch, i) { buffer.copyToChannel(ch, i); }); loopEnd = sb.loopEnd; }
        }
        var rec = { buffer: buffer, loopEnd: loopEnd, sec: buffer.duration, last: Date.now(), path: entry.path };
        cache[entry.id] = rec; cacheSec += rec.sec; evict(entry.id);
        return rec;
    });
}
function ramp(g, to, sec) { var a = ac(), t = a.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, to), t + Math.max(0.02, sec)); }
function playAmbient(entry, gainOverride) {
    return bufferFor(entry).then(function(rec) {
        var a = ac(); if (!a) return;
        if (a.state === 'suspended') { pendingGate = { entry: entry, gain: gainOverride }; showGate(); return; }
        var old = ambient;
        var g = a.createGain(); g.gain.value = 0.0001; g.connect(a.destination);
        var src = a.createBufferSource(); src.buffer = rec.buffer; src.loop = true; if (rec.loopEnd) src.loopEnd = rec.loopEnd; src.connect(g); src.start();
        ambient = { src: src, gain: g, entry: entry, hostGain: gainOverride };
        ramp(g, Math.max(0.0001, gainOverride !== undefined && isClient() ? gainOverride * (muted ? 0 : local) : effGain(entry)), 1.5);
        if (old) { ramp(old.gain, 0.0001, 1.5); setTimeout(function() { try { old.src.stop(); } catch (e) {} }, 1600); }
        emit(); streamPost();
    }).catch(function(e) { if (!isClient()) toast('Could not play "' + entry.name + '": ' + (e.message || e)); });
}
function stopAmbient(fadeMs) {
    if (!ambient) return;
    var old = ambient; ambient = null;
    var sec = (fadeMs === undefined ? 800 : fadeMs) / 1000;
    if (ctx) ramp(old.gain, 0.0001, sec); setTimeout(function() { try { old.src.stop(); } catch (e) {} }, sec * 1000 + 100);
    emit(); streamPost();
}
function playCue(entry, gainOverride, quiet) {
    return bufferFor(entry).then(function(rec) {
        var a = ac(); if (!a) return;
        if (a.state === 'suspended') { if (!quiet) showGate(); return; }   // a cue older than the gate is dropped, only the loop waits; a quiet cue never raises the gate
        while (cues.length >= LIMITS.overlap) { var oldest = cues.shift(); try { oldest.src.stop(); } catch (e) {} }
        var g = a.createGain(); g.gain.value = Math.max(0.0001, gainOverride !== undefined && isClient() ? gainOverride * (muted ? 0 : local) : effGain(entry)); g.connect(a.destination);
        var src = a.createBufferSource(); src.buffer = rec.buffer; src.connect(g);
        var rec2 = { src: src, gain: g, entry: entry };
        cues.push(rec2); emit();
        src.onended = function() { cues = cues.filter(function(c) { return c !== rec2; }); emit(); };
        src.start(0, 0, Math.min(rec.buffer.duration, LIMITS.cueSec));
    }).catch(function(e) { if (!isClient()) toast('Could not play "' + entry.name + '": ' + (e.message || e)); });
}
function stopAll(fadeMs) { stopAmbient(fadeMs); cues.forEach(function(c) { try { c.src.stop(); } catch (e) {} }); cues = []; pendingGate = null; hideGate(); emit(); }
function reapplyGains() { if (ambient) ramp(ambient.gain, Math.max(0.0001, ambient.hostGain !== undefined && isClient() ? ambient.hostGain * (muted ? 0 : local) : effGain(ambient.entry)), 0.1); cues.forEach(function(c) { ramp(c.gain, Math.max(0.0001, effGain(c.entry)), 0.1); }); emit(); }
function setLocalVolume(v) { local = Math.max(0, Math.min(1, v)); setPref('wp_soundVolume', Math.round(local * 100)); reapplyGains(); }
function setMute(on) { muted = !!on; reapplyGains(); }
function setMaster(v) { master = Math.max(0, Math.min(1, v)); setPref('wp_soundMaster', Math.round(master * 100)); reapplyGains(); var n = net(); if (n && n.sendSound) n.sendSound({ act: 'volume', gain: master }); }
// the feature switched (vtt.js fan-out, a stance from the host, a snapshot): stop what may not play
function refresh() {
    if (!featureOn()) { if (isHost() && ambient) hostStopAmbient(); stopAll(300); queue = []; queueBusy = false; }   // a host silences the table too, not just his speakers
    else if (isClient()) {   // back on (for me, or at the table): the host's ambient resumes from the list, and the prefetch queue with it
        var n = net(), e = n && Array.isArray(n.sounds) && n.soundNow ? n.sounds.find(function(x) { return x.id === n.soundNow; }) : null;
        if (e && !ambient) playAmbient(e, mixGain(e, hostMaster, 1));
        if (n && Array.isArray(n.sounds)) prefetch(n.sounds, n.soundNow);
    }
    renderInd(); renderPanel();
}
// prefetch: one transfer at a time, the current loop first, then small cues, then loops, under a byte budget
function prefetch(list, nowId) {
    if (!isClient() || !featureOn()) return;
    var order = [];
    var nowE = list.find(function(e) { return e.id === nowId; }); if (nowE) order.push(nowE);
    list.filter(function(e) { return e.kind === 'cue' && !e.def && e.size <= 256 * 1024 && e !== nowE; }).forEach(function(e) { order.push(e); });
    list.filter(function(e) { return e.kind === 'loop' && !e.def && e !== nowE; }).forEach(function(e) { order.push(e); });
    order.forEach(function(e) { if (!bytes[e.path] && !queue.some(function(q) { return q.id === e.id; })) queue.push(e); });
    pump();
}
function pump() {
    if (queueBusy || !queue.length || !isClient() || !featureOn()) return;
    var e = queue.shift();
    if (queueBytes + e.size > LIMITS.prefetchBytes) { pump(); return; }
    queueBusy = true;
    bufferFor(e).then(function() { queueBytes += e.size; }).catch(function() {}).then(function() { queueBusy = false; pump(); });
}

/* ---------- the autoplay gate (a browser tab needs a gesture; the shell should not) ---------- */
function showGate() { var g = ui('soundGate'); if (g) g.style.display = 'flex'; gateShown = true; renderInd(); }
function hideGate() { var g = ui('soundGate'); if (g) g.style.display = 'none'; gateShown = false; }
function tryResume() {
    if (!ctx || ctx.state !== 'suspended') { if (gateShown) hideGate(); return; }
    ctx.resume().then(function() { hideGate(); var p = pendingGate; pendingGate = null; if (p) playAmbient(p.entry, p.gain); emit(); }).catch(function() {});
}
document.addEventListener('pointerdown', function() { if (gateShown || (ctx && ctx.state === 'suspended' && pendingGate)) tryResume(); }, true);
document.addEventListener('keydown', function() { if (gateShown || (ctx && ctx.state === 'suspended' && pendingGate)) tryResume(); }, true);

/* ---------- the wire glue ---------- */
var streamChan = null; try { streamChan = new BroadcastChannel('waypoint'); } catch (e) {}
function streamPost() { if (!isHost() && net() && net().active) return; if (!streamChan || window.wpStream) return; try { streamChan.postMessage({ type: 'sound', now: ambient ? { id: ambient.entry.id, path: ambient.entry.path, name: ambient.entry.name, gain: effGain(ambient.entry) } : null }); } catch (e) {} }
// The host's list for the table: uploads by path, defaults by id, the master and what is playing now
function listMessage() {
    var camp = getActiveCampaign(); if (!camp) return null;
    var list = ownEntries().map(function(e) { return { id: e.id, name: e.name, path: e.path, kind: e.kind, gain: e.gain, size: e.size, dur: e.dur }; })
        .concat(defaultEntries().map(function(e) { return { id: e.id, def: true, name: e.name, kind: e.kind, gain: e.gain, dur: e.dur }; }));
    return { type: 'sounds', campId: camp.id, master: master, now: ambient ? { ambientId: ambient.entry.id, gain: effGainHost(ambient.entry) } : null, list: list };
}
function effGainHost(entry) { return mixGain(entry, master, 1); }
function onList(msg) {
    var n = net(); if (!n) return;
    defaultsLoaded.then(function() {
        n.sounds = cleanSoundList(msg.list, { defaults: defaults }); atTable = true;
        hostMaster = Math.max(0, Math.min(2, Number(msg.master) || 1));
        var now = msg.now && typeof msg.now === 'object' ? msg.now : null;
        n.soundNow = now && typeof now.ambientId === 'string' ? now.ambientId : null;
        // reconcile: the playing loop must still be listed; the host's ambient is applied on every list
        if (ambient && !n.sounds.some(function(e) { return e.id === ambient.entry.id; })) stopAmbient(600);
        if (!featureOn()) { refresh(); return; }
        if (n.soundNow) { var e = n.sounds.find(function(x) { return x.id === n.soundNow; }); if (e && (!ambient || ambient.entry.id !== e.id)) playAmbient(e, Math.max(0, Math.min(2, Number(now.gain) || 1))); }
        else if (ambient) stopAmbient(800);
        prefetch(n.sounds, n.soundNow);
        renderInd();
    });
}
function onCue(msg) {
    var n = net(); if (!n || !Array.isArray(n.sounds)) return;
    var c = cleanSoundCue(msg, n.sounds); if (!c) return;
    if (c.act === 'stop') { if (c.id === 'all') { n.soundNow = null; stopAll(c.fade); } else if (c.id === 'ambient' || (ambient && ambient.entry.id === c.id)) { n.soundNow = null; stopAmbient(c.fade || 800); } return; }   // a stop is honoured even while sound is off here: the table's loop is over
    if (!featureOn()) return;
    if (c.act === 'ambient') { var e = n.sounds.find(function(x) { return x.id === c.id; }); if (e) { n.soundNow = e.id; playAmbient(e, c.gain); } }
    else if (c.act === 'cue') { var e2 = n.sounds.find(function(x) { return x.id === c.id; }); if (e2) playCue(e2, c.gain); }
    else if (c.act === 'volume') { if (c.id === undefined) { hostMaster = c.gain; if (ambient && ambient.hostGain !== undefined) ambient.hostGain = mixGain(ambient.entry, hostMaster, 1); } else { var e3 = n.sounds.find(function(x) { return x.id === c.id; }); if (e3) { e3.gain = c.gain; if (ambient && ambient.entry.id === c.id) ambient.hostGain = mixGain(e3, hostMaster, 1); } } reapplyGains(); }
}
function onSnapshot() { var n = net(); if (n) { n.sounds = null; n.soundNow = null; } stopAll(300); queue = []; queueBusy = false; queueBytes = 0; bytes = {}; renderInd(); }
// the session ended or dropped: a player's table sound stops and its bytes go; a GM keeps what he was playing (his campaign is still on screen)
function tableLeft(wasClient) { queue = []; queueBusy = false; queueBytes = 0; hostMaster = 1; if (wasClient) { stopAll(300); bytes = {}; atTable = false; } renderInd(); renderPanel(); }
// io.js load(): the campaign on screen is foreign (a table's) or the player's own again; only the foreign -> own move stops a table's loop
function foreign(isForeign) { if (!isForeign && atTable) { stopAll(300); bytes = {}; queue = []; queueBusy = false; queueBytes = 0; } if (!isForeign) atTable = false; renderInd(); }
function sessionEnded() { stopAll(500); renderInd(); renderPanel(); }

/* ---------- the GM's panel ---------- */
var panelOpen = false;
function hostPlayAmbient(entry) { playAmbient(entry); var n = net(); if (n && n.sendSound) n.sendSound({ act: 'ambient', id: entry.id, gain: effGainHost(entry) }); }
function hostStopAmbient() { stopAmbient(800); var n = net(); if (n && n.sendSound) n.sendSound({ act: 'stop', id: 'ambient', fade: 800 }); }
function hostCue(entry) { playCue(entry); var n = net(); if (n && n.sendSound) n.sendSound({ act: 'cue', id: entry.id, gain: effGainHost(entry) }); }
var _cueLast = {};
function renderPanel() {
    var p = ui('soundPanel'); if (!p) return;
    if (!panelOpen || isClient()) { p.style.display = 'none'; return; }
    var camp = getActiveCampaign(); if (!camp) { p.style.display = 'none'; return; }
    p.style.display = 'flex';
    var list = playable(), loops = list.filter(function(e) { return e.kind === 'loop'; }), cs = list.filter(function(e) { return e.kind === 'cue'; });
    var on = featureOn();
    if (!on) { ui('soundBody').innerHTML = '<div class="snd-none">Sound is off for this campaign — switch it on in &#9881; Settings &#9656; VTT features.</div>'; return; }
    var html = '<div class="snd-row"><span class="snd-label">Ambient</span>' + (loops.length ? loops.map(function(e) { return '<button class="journal-from snd-loop' + (ambient && ambient.entry.id === e.id ? ' active' : '') + '" data-id="' + esc(e.id) + '" title="' + esc(e.name) + ' · ' + fmtDur(e.dur) + (e.def ? ' · bundled' : '') + '">' + esc(e.name) + '</button>'; }).join('') + '<button class="journal-from snd-stop" data-act="stop-ambient" title="Fade the ambient out"' + (ambient ? '' : ' disabled') + '>&#9632;</button>' : '<span class="snd-none">No loops yet — add one in the library.</span>') + '</div>';
    html += '<div class="snd-row"><span class="snd-label">Cues</span>' + (cs.length ? cs.map(function(e) { return '<button class="journal-from snd-cue" data-id="' + esc(e.id) + '" title="' + esc(e.name) + ' · ' + fmtDur(e.dur) + (e.def ? ' · bundled' : '') + '">' + esc(e.name) + '</button>'; }).join('') : '<span class="snd-none">No cues yet.</span>') + '</div>';
    html += '<div class="snd-row snd-foot"><label title="The GM\'s master: what players hear, and your own speakers">Master <input type="range" id="soundMaster" min="0" max="100" value="' + Math.round(master * 100) + '"></label><label class="snd-mute" title="Silence your own speakers only; players still hear the table"><input type="checkbox" id="soundHostMute"' + (muted ? ' checked' : '') + '> Mute mine</label><span class="snd-players" title="Whether the campaign\'s Sound feature is on for the table (Settings ▸ VTT features)">Players: ' + (isHost() ? 'hear this table' : 'no session') + '</span><button class="tool ghost snd-btn" data-act="lib">Library…</button></div>';
    ui('soundBody').innerHTML = html;
}
// the chips and the stop button follow the engine without rebuilding the body (a rebuild mid-drag would drop the master slider)
function syncPanelState() { var body = ui('soundBody'); if (!body || !panelOpen) return; var id = ambient ? ambient.entry.id : null; body.querySelectorAll('.snd-loop').forEach(function(b) { b.classList.toggle('active', b.dataset.id === id); }); var st = body.querySelector('.snd-stop'); if (st) st.disabled = !ambient; }
function openPanel() { panelOpen = true; if (window.wpFx && window.wpFx.closePanel) window.wpFx.closePanel(); ac(); renderPanel(); placePanel(); var b = ui('soundBtn'); if (b) b.classList.add('active'); }   // Sound and Visual effects share the corner: only one panel at a time
function closePanel() { panelOpen = false; renderPanel(); var b = ui('soundBtn'); if (b) b.classList.remove('active'); }
function placePanel() { var p = ui('soundPanel'); if (!p) return; try { var pos = JSON.parse(pref('wp_soundPanel', 'null')); if (pos && isFinite(pos.x) && isFinite(pos.y)) { p.style.left = Math.max(0, Math.min(window.innerWidth - 120, pos.x)) + 'px'; p.style.top = Math.max(0, Math.min(window.innerHeight - 60, pos.y)) + 'px'; p.style.right = 'auto'; } } catch (e) {} }
(function wirePanel() {
    var p = ui('soundPanel'), head = ui('soundHead'); if (!p || !head) return;
    var btn = ui('soundBtn'); if (btn) btn.addEventListener('click', function() { if (panelOpen) closePanel(); else openPanel(); });
    var close = ui('soundCloseBtn'); if (close) close.addEventListener('click', closePanel);
    var min = ui('soundMinBtn'); if (min) min.addEventListener('click', function() { p.classList.toggle('min'); });
    p.addEventListener('click', function(e) {
        var b = e.target.closest && e.target.closest('button'); if (!b) return;
        if (b.dataset.act === 'lib') { openLib(); return; }
        if (b.dataset.act === 'stop-ambient') { hostStopAmbient(); renderPanel(); return; }
        var entry = b.dataset.id ? entryById(b.dataset.id) : null; if (!entry) return;
        if (b.classList.contains('snd-loop')) { if (ambient && ambient.entry.id === entry.id) hostStopAmbient(); else hostPlayAmbient(entry); renderPanel(); }
        else if (b.classList.contains('snd-cue')) { var t = Date.now(); if (_cueLast[entry.id] && t - _cueLast[entry.id] < 150) return; _cueLast[entry.id] = t; hostCue(entry); }
    });
    p.addEventListener('input', function(e) { if (e.target.id === 'soundMaster') setMaster(Number(e.target.value) / 100); });
    p.addEventListener('change', function(e) { if (e.target.id === 'soundHostMute') setMute(e.target.checked); });
    // drag by the head; the position is remembered
    var drag = null;
    head.addEventListener('pointerdown', function(e) { if (e.target.closest('button')) return; var r = p.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
    head.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = (e.clientX - drag.dx) + 'px'; p.style.top = (e.clientY - drag.dy) + 'px'; p.style.right = 'auto'; });
    head.addEventListener('pointerup', function() { if (!drag) return; drag = null; var r = p.getBoundingClientRect(); setPref('wp_soundPanel', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); });
})();

/* ---------- the library ---------- */
var libScope = 'camp', libPickFrom = null, libSel = {}, previewing = null;
function openLib() { if (!canWrite()) { toast('Not while you\'re at someone else\'s table.'); return; } libScope = 'camp'; libPickFrom = null; libSel = {}; var m = ui('soundLibModal'); if (!m) return; m.style.display = 'flex'; defaultsLoaded.then(renderLib); }
function closeLib() { var m = ui('soundLibModal'); if (m) m.style.display = 'none'; stopPreview(); }
function stopPreview() { if (previewing) { try { previewing.src.stop(); } catch (e) {} previewing = null; } }
function otherCampaigns() { var me = getActiveCampaign(); return Object.values((state.appState && state.appState.campaigns) || {}).filter(function(c) { return c && me && c.id !== me.id; }); }
function bytesUsed(camp) { return ownEntries().filter(function(e) { return typeof e.path === 'string' && e.path.indexOf('/saves/images/audio/' + safeId(camp.id) + '/') === 0; }).reduce(function(s, e) { return s + (Number(e.size) || 0); }, 0); }
function rowHtml(e, mode) {
    var own = mode === 'camp', def = !!e.def;
    var from = e.from && state.appState.campaigns[e.from] ? ' <span class="snd-from" title="Brought in from another campaign (a reference, not a copy)">from ' + esc(state.appState.campaigns[e.from].name || e.from) + '</span>' : '';
    return '<div class="snd-lib-row" data-id="' + esc(e.id) + '">' +
        (mode === 'pick' ? '<input type="checkbox" class="snd-pick"' + (libSel[e.id] ? ' checked' : '') + '>' : '') +
        '<button class="tool ghost icon snd-prev" title="Preview here (players do not hear it)">&#9654;</button>' +
        (own && !def ? '<input type="text" class="snd-name field" value="' + esc(e.name) + '" maxlength="60">' + from : '<span class="snd-name-ro">' + esc(e.name) + from + (def ? ' <span class="snd-from">bundled</span>' : '') + '</span>') +
        (own && !def ? '<select class="snd-kind"><option value="loop"' + (e.kind === 'loop' ? ' selected' : '') + '>Loop</option><option value="cue"' + (e.kind === 'cue' ? ' selected' : '') + '>Cue</option></select>' : '<span class="snd-kind-ro">' + (e.kind === 'loop' ? 'Loop' : 'Cue') + '</span>') +
        (own && !def ? '<label class="snd-gain" title="Gain 0.1–2">×<input type="number" class="snd-gainv" min="0.1" max="2" step="0.1" value="' + (num(e.gain, 0, 0.1, 2) || 1) + '"></label>' : '') +
        '<span class="snd-meta">' + fmtDur(e.dur) + (e.size ? ' · ' + fmtSize(e.size) : '') + '</span>' +
        (own && !def ? '<button class="tool ghost danger snd-del" title="' + (e.from ? 'Take the reference out of this campaign (the other campaign keeps its file)' : 'Delete the file from your saves folder') + '">' + (e.from ? 'Remove' : 'Delete') + '</button>' : '') +
        (mode === 'shared' ? '<button class="tool ghost snd-hide" title="Hide this bundled sound on this install (an update brings it back; Show hidden restores it)">Hide</button>' : '') +
        '</div>';
}
function renderLib() {
    var m = ui('soundLibModal'); if (!m || m.style.display === 'none') return;
    var camp = getActiveCampaign(); if (!camp) return;
    var chips = ui('soundLibChips'), rows = ui('soundLibRows'), foot = ui('soundLibFoot');
    var own = ownEntries(), defs = defaultEntries(), hid = hiddenDefaults();
    chips.innerHTML = '<span class="journal-chip-label">Sounds</span>'
        + '<button class="journal-from' + (libScope === 'camp' ? ' active' : '') + '" data-scope="camp">' + esc(camp.name) + ' <span class="journal-count">' + own.length + '</span></button>'
        + '<button class="journal-from' + (libScope === 'shared' ? ' active' : '') + '" data-scope="shared" title="The bundled default set, available in every campaign">Shared <span class="journal-count">' + defs.length + '</span></button>'
        + '<button class="journal-from' + (libScope === 'all' ? ' active' : '') + '" data-scope="all">All campaigns <span class="journal-count">' + Object.values(state.appState.campaigns || {}).reduce(function(s, c) { return s + campList(c).length; }, 0) + '</span></button>'
        + '<button class="journal-from img-lib-import' + (libScope === 'pick' ? ' active' : '') + '" data-scope="pick" title="Pick sounds from another campaign and bring them into this one (a reference, nothing copied)">Import from another campaign…</button>';
    var html = '';
    if (libScope === 'camp') html = own.length ? own.map(function(e) { return rowHtml(e, 'camp'); }).join('') : '<div class="snd-empty">No sounds in this campaign yet — upload some, or bring them in from another campaign or Shared.</div>';
    else if (libScope === 'shared') html = (defs.length ? defs.map(function(e) { return rowHtml(e, 'shared'); }).join('') : '<div class="snd-empty">No bundled sounds on this install' + (Object.keys(defaults).length ? '' : ' (the default set ships with a later build)') + '.</div>') + (hid.length ? '<div class="snd-empty">' + hid.length + ' hidden — <button class="tool ghost snd-unhide">Show hidden</button></div>' : '');
    else if (libScope === 'all') { var all = []; Object.values(state.appState.campaigns || {}).forEach(function(c) { campList(c).forEach(function(e) { all.push({ e: e, c: c }); }); }); html = all.length ? all.map(function(x) { return '<div class="snd-lib-group">' + esc(x.c.name) + '</div>' + rowHtml(x.e, 'all'); }).join('') : '<div class="snd-empty">No campaign has sounds yet.</div>'; }
    else { var others = otherCampaigns(); if (!libPickFrom || !state.appState.campaigns[libPickFrom]) libPickFrom = others[0] ? others[0].id : null;
        html = '<div class="snd-row"><label>From <select id="soundLibSource" class="tool">' + others.map(function(c) { return '<option value="' + esc(c.id) + '"' + (c.id === libPickFrom ? ' selected' : '') + '>' + esc(c.name) + ' (' + campList(c).length + ')</option>'; }).join('') + '</select></label></div>';
        var src = libPickFrom ? campList(state.appState.campaigns[libPickFrom]).filter(function(e) { return !own.some(function(o) { return o.path === e.path; }); }) : [];
        html += src.length ? src.map(function(e) { return rowHtml(e, 'pick'); }).join('') : '<div class="snd-empty">' + (others.length ? 'Nothing there to bring in.' : 'No other campaign has sounds.') + '</div>';
        var n = Object.keys(libSel).length; html += '<div class="snd-row"><button class="tool snd-bring"' + (n ? '' : ' disabled') + '>Bring ' + n + ' into ' + esc(camp.name) + '</button></div>'; }
    rows.innerHTML = html;
    foot.textContent = libScope === 'camp' ? fmtSize(bytesUsed(camp)) + ' of ' + fmtSize(LIMITS.campaign) + ' uploaded in this campaign · up to ' + fmtSize(LIMITS.file) + ' per sound, loops up to ' + LIMITS.loopSec + ' s, cues cut after ' + LIMITS.cueSec + ' s · MP3, OGG, M4A, WebM' : libScope === 'shared' ? 'Bundled sounds are available in every campaign and never travel to players (every install has them).' : libScope === 'all' ? 'Every campaign\'s own sounds. Bring one into this campaign with Import from another campaign…' : 'A brought-in sound is a reference: this campaign lists the other campaign\'s file, nothing is copied.';
}
function saveLib(resync) { save(true); var n = net(); if (resync && n && n.syncSounds) n.syncSounds(); renderPanel(); }
function probe(file) {   // duration from the browser's decoder (cheap), then decodability through Web Audio
    return new Promise(function(resolve, reject) {
        var url = URL.createObjectURL(file), a = new Audio(), done = false;
        var finish = function(d) { if (done) return; done = true; URL.revokeObjectURL(url); resolve(d); };
        a.preload = 'metadata';
        a.addEventListener('loadedmetadata', function() { finish(isFinite(a.duration) ? a.duration : 0); });
        a.addEventListener('error', function() { finish(0); });
        setTimeout(function() { finish(0); }, 6000);
        a.src = url;
    }).then(function(dur) {
        var a = ac(); if (!a) return { dur: dur };
        return file.arrayBuffer().then(function(buf) { return a.decodeAudioData(buf); }).then(function(dec) { return { dur: dec.duration || dur }; }).catch(function() { throw new Error('not decodable'); });
    });
}
function uploadFiles(files) {
    var camp = getActiveCampaign(); if (!camp || !canWrite()) return;
    var used = bytesUsed(camp), done = 0, refused = [];
    var list = Array.from(files);
    var next = function() {
        if (!list.length) { if (done) { saveLib(true); renderLib(); } toast((done ? done + ' sound' + (done === 1 ? '' : 's') + ' added.' : 'Nothing added.') + (refused.length ? ' Refused: ' + refused.join('; ') : '')); return; }
        var f = list.shift();
        if (!EXT_RE.test(f.name) && !/^audio\//.test(f.type)) { refused.push(f.name + ' (not a sound file)'); next(); return; }
        if (/\.(wav|flac|aiff?)$/i.test(f.name)) { refused.push(f.name + ' (WAV / FLAC are too large; convert to OGG or MP3)'); next(); return; }
        if (f.size > LIMITS.file) { refused.push(f.name + ' (over ' + fmtSize(LIMITS.file) + ')'); next(); return; }
        if (used + f.size > LIMITS.campaign) { refused.push(f.name + ' (the campaign\'s ' + fmtSize(LIMITS.campaign) + ' is full)'); next(); return; }
        probe(f).then(function(p) {
            if (p.dur > LIMITS.loopSec) { refused.push(f.name + ' (longer than ' + LIMITS.loopSec + ' s)'); next(); return; }
            return window.wpUploadBlob('audio/' + safeId(camp.id), f.name.replace(/[\/\\?#%]/g, '_').slice(0, 120), f).then(function(url) {
                var e = { id: uid(), name: f.name.replace(/^[a-z0-9]{8}_/, '').replace(/\.[^.]+$/, '').slice(0, LIMITS.name) || 'Sound', path: url, kind: p.dur > LIMITS.cueSec ? 'loop' : 'cue', gain: 1, size: f.size, dur: Math.round(p.dur * 10) / 10 };
                campListW(camp).push(e); used += f.size; done++;
                if (/\.mp3$/i.test(f.name) && e.kind === 'loop') toast('"' + e.name + '" is an MP3 loop: MP3 cannot loop without a tiny click at the seam — OGG loops cleanly.');
                next();
            });
        }).catch(function(err) { refused.push(f.name + ' (' + (err.message || 'upload failed') + ')'); next(); });
    };
    next();
}
(function wireLib() {
    var m = ui('soundLibModal'); if (!m) return;
    var close = ui('soundLibClose'); if (close) close.addEventListener('click', closeLib);
    var fileIn = ui('soundLibFile'), upBtn = ui('soundLibUpload');
    if (upBtn && fileIn) { upBtn.addEventListener('click', function() { if (!canWrite()) { toast('Not while you\'re at someone else\'s table.'); return; } fileIn.value = ''; fileIn.click(); }); fileIn.addEventListener('change', function() { uploadFiles(fileIn.files); }); }
    ui('soundLibChips').addEventListener('click', function(e) { var b = e.target.closest && e.target.closest('button[data-scope]'); if (!b) return; libScope = b.dataset.scope; libSel = {}; stopPreview(); renderLib(); });
    var rows = ui('soundLibRows');
    rows.addEventListener('change', function(e) {
        var t = e.target, row = t.closest('.snd-lib-row'), camp = getActiveCampaign();
        if (t.id === 'soundLibSource') { libPickFrom = t.value; libSel = {}; renderLib(); return; }
        if (!row) return;
        if (t.classList.contains('snd-pick')) { if (t.checked) libSel[row.dataset.id] = 1; else delete libSel[row.dataset.id]; renderLib(); return; }
        var entry = campListW(camp).find(function(x) { return x.id === row.dataset.id; }); if (!entry) return;
        if (t.classList.contains('snd-name')) { entry.name = t.value.trim().slice(0, LIMITS.name) || entry.name; t.value = entry.name; saveLib(true); }
        else if (t.classList.contains('snd-kind')) { if (t.value === 'loop' && entry.dur > LIMITS.loopSec) { toast('Too long for a loop (' + fmtDur(entry.dur) + ').'); t.value = 'cue'; return; } entry.kind = t.value; if (ambient && ambient.entry.id === entry.id && entry.kind !== 'loop') hostStopAmbient(); saveLib(true); }
        else if (t.classList.contains('snd-gainv')) { entry.gain = Math.max(0.1, Math.min(2, Number(t.value) || 1)); t.value = entry.gain; var n = net(); if (n && n.sendSound) n.sendSound({ act: 'volume', id: entry.id, gain: entry.gain }); if (ambient && ambient.entry.id === entry.id) { ambient.entry = entry; reapplyGains(); } saveLib(true); }
    });
    rows.addEventListener('click', function(e) {
        var b = e.target.closest && e.target.closest('button'); if (!b) return;
        var row = b.closest('.snd-lib-row'), camp = getActiveCampaign();
        if (b.classList.contains('snd-unhide')) { setHiddenDefaults([]); renderLib(); saveLib(true); return; }
        if (b.classList.contains('snd-bring')) { var src = state.appState.campaigns[libPickFrom]; if (!src) return; var ids = Object.keys(libSel), n = 0; campList(src).forEach(function(x) { if (ids.indexOf(x.id) < 0) return; if (campListW(camp).some(function(o) { return o.path === x.path; })) return; campListW(camp).push({ id: uid(), name: x.name, path: x.path, kind: x.kind, gain: x.gain, size: x.size, dur: x.dur, from: src.id }); n++; }); libSel = {}; libScope = 'camp'; saveLib(true); renderLib(); toast(n + ' sound' + (n === 1 ? '' : 's') + ' brought into ' + camp.name + '.'); return; }
        if (!row) return;
        var id = row.dataset.id;
        if (b.classList.contains('snd-prev')) { stopPreview(); var pe = (libScope === 'camp' ? ownEntries() : libScope === 'shared' ? defaultEntries() : libScope === 'pick' && libPickFrom ? campList(state.appState.campaigns[libPickFrom]) : Object.values(state.appState.campaigns).reduce(function(a, c) { return a.concat(campList(c)); }, [])).find(function(x) { return x.id === id; }); if (!pe) return; var pl = cleanSoundList([pe], { defaults: defaults })[0]; if (!pl) { toast('That sound cannot be played here.'); return; } bufferFor(pl).then(function(rec) { var a = ac(); if (a.state === 'suspended') a.resume(); var g = a.createGain(); g.gain.value = effGain(pl); g.connect(a.destination); var s = a.createBufferSource(); s.buffer = rec.buffer; s.connect(g); s.start(0, 0, Math.min(rec.buffer.duration, 20)); previewing = { src: s }; s.onended = function() { if (previewing && previewing.src === s) previewing = null; }; }).catch(function(err) { toast('Could not play it: ' + (err.message || err)); }); return; }
        if (b.classList.contains('snd-hide')) { var h = hiddenDefaults(); if (h.indexOf(id) < 0) h.push(id); setHiddenDefaults(h); if (ambient && ambient.entry.id === id) hostStopAmbient(); renderLib(); saveLib(true); return; }
        if (b.classList.contains('snd-del')) {
            var list = campListW(camp), entry = list.find(function(x) { return x.id === id; }); if (!entry) return;
            var isRef = !!entry.from || String(entry.path || '').indexOf('/saves/images/audio/' + safeId(camp.id) + '/') !== 0;
            var go = function() {
                if (ambient && ambient.entry.id === id) hostStopAmbient();
                var idx = list.indexOf(entry); if (idx >= 0) list.splice(idx, 1);
                delete cache[id]; delete bytes[entry.path];
                saveLib(true); renderLib();
                if (isRef) { toast('Reference removed.'); return; }
                fetch('/api/delete-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: entry.path }) }).then(function(r) { toast(r.ok ? 'Deleted ' + entry.name + '.' : 'The entry is gone; the file could not be deleted.'); }).catch(function() { toast('The entry is gone; the file could not be deleted.'); });
            };
            showConfirm(isRef ? 'Take "' + entry.name + '" out of this campaign?' : 'Delete "' + entry.name + '" and its file from your saves folder? This cannot be undone.', function(yes) { if (yes) go(); });
        }
    });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && m.style.display !== 'none') { e.stopPropagation(); closeLib(); } }, true);
})();

/* ---------- the indicator and its popover (every role) ---------- */
function renderInd() {
    var b = ui('soundInd'); if (!b) return;
    var st = status(), n = net(), atTable = !!(n && n.active);
    b.classList.toggle('playing', !!(st.ambient || st.cues) && !muted);
    b.classList.toggle('muted', muted || local === 0);
    b.classList.toggle('sound-off', !st.on);
    b.classList.toggle('gate', !!gateShown);
    b.title = !st.on ? 'Sound is off ' + (isClient() ? 'for you at this table' : 'for this campaign') : gateShown ? 'Click to enable sound at this table' : st.ambient ? 'Playing: ' + st.ambient.name + (muted ? ' (muted for you)' : '') : muted ? 'Sound muted for you' : 'Sound — your volume and mute' + (atTable ? '' : ' (nothing playing)');
    var pop = ui('soundPop'); if (!pop || pop.style.display === 'none') return;
    var vol = ui('soundVolume'); if (vol && document.activeElement !== vol) vol.value = Math.round(local * 100);
    var mu = ui('soundMuteChk'); if (mu) mu.checked = muted;
    var offRow = ui('soundOffRow'), offChk = ui('soundOffChk');
    if (offRow) { var client = isClient() && window.wpVtt && window.wpVtt.mode && window.wpVtt.mode() === 'client'; offRow.style.display = client ? '' : 'none'; if (offChk && client) { offChk.checked = !!window.wpVtt.localOff('sound'); offChk.disabled = !(window.wpVtt.ceiling() && window.wpVtt.ceiling().sound === true); } }
    var now = ui('soundNow'); if (now) now.textContent = st.ambient ? 'Playing: ' + st.ambient.name : (st.on ? 'Nothing playing' : 'Sound is off here');
}
(function wireInd() {
    var b = ui('soundInd'), pop = ui('soundPop'); if (!b || !pop) return;
    b.addEventListener('click', function(e) { e.stopPropagation(); if (gateShown) { tryResume(); return; } var open = pop.style.display !== 'none'; pop.style.display = open ? 'none' : 'block'; if (!open) { var r = b.getBoundingClientRect(); pop.style.left = Math.max(8, Math.min(window.innerWidth - 250, r.left - 100)) + 'px'; pop.style.top = (r.bottom + 6) + 'px'; renderInd(); } });
    document.addEventListener('pointerdown', function(e) { if (pop.style.display !== 'none' && !e.target.closest('#soundPop') && !e.target.closest('#soundInd')) pop.style.display = 'none'; }, true);
    pop.addEventListener('input', function(e) { if (e.target.id === 'soundVolume') setLocalVolume(Number(e.target.value) / 100); });
    pop.addEventListener('change', function(e) { if (e.target.id === 'soundMuteChk') setMute(e.target.checked); else if (e.target.id === 'soundOffChk') { if (window.wpVtt) window.wpVtt.setLocal('sound', e.target.checked); refresh(); } });
})();

/* ---------- the stream window (same machine as the GM: plays the ambient it is told about) ---------- */
if (window.wpStream && streamChan) {
    var streamOn = function() { return pref('wp_streamSound', 'off') === 'on'; };
    streamChan.addEventListener('message', function(e) {
        var d = e.data; if (!d || d.type !== 'sound') return;
        if (!streamOn()) { stopAmbient(300); return; }
        if (!d.now) { stopAmbient(600); return; }
        if (ambient && ambient.entry.id === d.now.id) return;
        var entry = { id: String(d.now.id || '').slice(0, 40), name: String(d.now.name || '').slice(0, 60), path: String(d.now.path || ''), kind: 'loop', gain: Math.max(0.1, Math.min(2, Number(d.now.gain) || 1)), size: 0, dur: 0 };
        if (!/^(assets\/sounds\/[A-Za-z0-9_.-]+|\/saves\/images\/audio\/[A-Za-z0-9_-]{1,60}\/[^\/?#]{1,200})$/.test(entry.path)) return;
        playAmbient(entry);
    });
    try { streamChan.postMessage({ type: 'sound-query' }); } catch (e) {}
    window.addEventListener('storage', function(e) { if (e.key !== 'wp_streamSound') return; if (!streamOn()) stopAll(300); else { try { streamChan.postMessage({ type: 'sound-query' }); } catch (e2) {} } });
} else if (streamChan) {
    streamChan.addEventListener('message', function(e) { if (e.data && e.data.type === 'sound-query') streamPost(); });
}

/* ---------- housekeeping: the campaign or the feature changed under us ---------- */
var _lastCamp = null;
setInterval(function() {
    var c = getActiveCampaign(), id = c ? c.id : null;
    if (_lastCamp !== null && id !== _lastCamp && !isClient()) { stopAll(400); renderPanel(); }
    _lastCamp = id;
    if (!featureOn() && (ambient || cues.length)) refresh();
}, 1000);
window.wpSoundSync = function() { refresh(); };
listeners.push(function() { renderInd(); syncPanelState(); });
document.addEventListener('DOMContentLoaded', function() { renderInd(); });
setTimeout(renderInd, 0);

// A bundled default on THIS machine only (the dice cue on a roll): by id from the local manifest, never the host's list, never a
// wire cue, never the autoplay gate; silent when Sound is off here or the default is missing.
function localCue(id) {
    if (!featureOn()) return Promise.resolve(false);
    return defaultsLoaded.then(function() {
        var d = Object.prototype.hasOwnProperty.call(defaults, id) ? defaults[id] : null; if (!d) return false;
        return playCue({ id: id, def: true, name: d.name, path: 'assets/sounds/' + d.file, kind: 'cue', gain: 1, size: 0, dur: d.dur }, 1, true).then(function() { return true; });
    }).catch(function() { return false; });
}
window.wpSound = {
    play: function(idOrEntry, opts) { var e = typeof idOrEntry === 'string' ? entryById(idOrEntry) : idOrEntry; if (!e) return false; if (e.kind === 'loop') (isHost() ? hostPlayAmbient : playAmbient)(e); else (isHost() ? hostCue : playCue)(e); return true; },
    stop: function(what, fade) { if (what === 'ambient' || what === undefined) { if (isHost()) hostStopAmbient(); else stopAmbient(fade); } else stopAll(fade); },
    setVolume: setLocalVolume, setMaster: setMaster, mute: setMute, prefetch: function(e) { return bufferFor(e); },
    now: status, onChange: function(fn) { listeners.push(fn); }, refresh: refresh,
    listMessage: listMessage, onList: onList, onCue: onCue, onSnapshot: onSnapshot, tableLeft: tableLeft, sessionEnded: sessionEnded, foreign: foreign,
    openPanel: openPanel, closePanel: closePanel, openLib: openLib, defaults: function() { return defaults; }, LIMITS: LIMITS,
    addFiles: uploadFiles,  // the library's upload path, for the sandbox harness (a FileList or an array of File)
    local: localCue
};
