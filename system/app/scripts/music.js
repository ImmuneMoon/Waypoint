/* Music (1.5.0) — the engine + UI half (the pure validators are musiccore.js). A separate VTT feature from Sound:
   per-campaign named playlists over the campaign's own music track library, a per-map remembered playback config
   that each viewer's client plays locally as they open a map (baseline), a GM panel with full transport (play /
   pause / prev / next / seek = fast-forward+rewind / loop off·one·list / shuffle), and its own per-player volume /
   mute. Transitioning to a map whose playlist/song is already playing does NOT restart it (a same-source skip).

   M2 = single machine (solo / host reads local files). M3 will add: camp.music travels to clients, clients fetch
   track bytes via net.fetchAsset, and the GM "take control" override that drives every client in sync. Design of
   record: [[waypoint-music-playlist]]. */
import { state } from './state.js';
import { getActiveCampaign } from './models.js';
import { save, toast } from './io.js';
import { LIMITS, cleanMusic, cleanMapMusic, cleanControl, cleanName } from './musiccore.js';

var ui = function(id) { return document.getElementById(id); };
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function uid(p) { return (p || 'm_') + Math.random().toString(36).slice(2, 8); }
function net() { return window.wpNet || null; }
function isClient() { var n = net(); return !!(n && n.active && n.role === 'client' && !n.stream); }
function isHost() { var n = net(); return !!(n && n.active && n.role === 'host'); }
function featureOn() { return window.wpVtt ? !!window.wpVtt.on('music') : true; }
function canWrite() { return !!(window.wpCanPersistLocal && window.wpCanPersistLocal()) && !window.wpStream; }
function pref(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
function setPref(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function fmtTime(s) { s = Math.max(0, Math.round(s || 0)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }

/* ---------- the campaign's music (camp.music, GM-only; readers never create it) ---------- */
function campMusic(camp) { camp = camp || getActiveCampaign(); return (camp && camp.music && typeof camp.music === 'object') ? camp.music : { v: 1, tracks: [], playlists: [] }; }
function campMusicW(camp) { camp = camp || getActiveCampaign(); if (!camp) return null; if (!camp.music || typeof camp.music !== 'object') camp.music = { v: 1, tracks: [], playlists: [] }; if (!Array.isArray(camp.music.tracks)) camp.music.tracks = []; if (!Array.isArray(camp.music.playlists)) camp.music.playlists = []; return camp.music; }
// what THIS machine may play now: the host/solo reads its own camp.music; a client (M3) reads net.music
function musicNow() { if (isClient()) { var n = net(); return (n && n.music && typeof n.music === 'object') ? n.music : { v: 1, tracks: [], playlists: [] }; } return campMusic(); }
function trackById(id) { var m = musicNow(); for (var i = 0; i < m.tracks.length; i++) if (m.tracks[i].id === id) return m.tracks[i]; return null; }
function playlistById(id) { var m = musicNow(); for (var i = 0; i < m.playlists.length; i++) if (m.playlists[i].id === id) return m.playlists[i]; return null; }
function idSets() { var m = musicNow(), t = {}, p = {}; m.tracks.forEach(function(x) { t[x.id] = 1; }); m.playlists.forEach(function(x) { p[x.id] = 1; }); return { trackIds: t, playlistIds: p }; }

/* ---------- the engine (one music lane, crossfaded) ---------- */
var ctx = null, cache = {}, bytes = {}, cacheSec = 0, CACHE_SEC = 1200;   // decoded PCM is huge (a song ≈ hundreds of MB) — keep only ~20 min of it, LRU, never the playing track
var cur = null;        // { src, gain, entry, startedAt, offset, dur }
var source = null;     // { kind:'playlist'|'track', id, loop:'off'|'one'|'list', shuffle } — what is playing
var order = [], qi = 0;   // the resolved play order (track ids) and the index within it
var mvol = Number(pref('wp_musicVolume', '70')) / 100, mmuted = pref('wp_musicMuted', 'no') === 'yes';
var rate = Math.max(0.5, Math.min(2, Number(pref('wp_musicRate', '100')) / 100));   // playback speed (0.5×–2×)
var pending = null, gateShown = false, listeners = [], loadGen = 0;   // loadGen: bumped on every intended-track change so a superseded async fetch cannot win
var controlling = false;   // host: the GM is driving the table's music (take control) — broadcast transport changes
var controlled = false;    // client: following the GM's take-control override — local map auto-play is suspended
function ac() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } } return ctx; }
function effGain() { return mmuted ? 0.0001 : Math.max(0.0001, mvol); }
function emit() { renderPill(); refreshTransport(); listeners.forEach(function(fn) { try { fn(); } catch (e) {} }); }   // light transport update; structural changes call renderPanel explicitly
function bytesFor(entry) {
    if (bytes[entry.path]) return Promise.resolve(bytes[entry.path]);
    var p;
    if (!isClient()) p = fetch(encodeURI(entry.path)).then(function(r) { if (!r.ok) throw new Error('missing'); return r.blob(); });
    else { var n = net(); if (!n || !n.fetchAsset) return Promise.reject(new Error('offline')); p = n.fetchAsset(entry.path, entry.size); }   // M3
    return p.then(function(blob) { if (blob.size > LIMITS.file * 2) throw new Error('too-big'); bytes[entry.path] = blob; return blob; });
}
function bufferFor(entry) {
    var rec = cache[entry.path]; if (rec) { rec.last = Date.now(); return Promise.resolve(rec.buffer); }
    var a = ac(); if (!a) return Promise.reject(new Error('no audio'));
    return bytesFor(entry).then(function(b) { return b.arrayBuffer(); }).then(function(buf) { return a.decodeAudioData(buf); }).then(function(dec) { cache[entry.path] = { buffer: dec, sec: dec.duration, last: Date.now() }; cacheSec += dec.duration; evictCache(entry.path); return dec; });
}
// LRU-evict decoded buffers (and their compressed blobs) beyond the budget; never the just-loaded or the playing track.
function evictCache(keep) {
    var curPath = cur && cur.entry ? cur.entry.path : null;
    var paths = Object.keys(cache).sort(function(a, b) { return cache[a].last - cache[b].last; });
    for (var i = 0; i < paths.length && cacheSec > CACHE_SEC; i++) {
        var p = paths[i]; if (p === keep || p === curPath) continue;
        cacheSec -= cache[p].sec; delete cache[p]; delete bytes[p];
    }
}
function ramp(g, to, sec) { var a = ac(), t = a.currentTime; g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t); g.gain.exponentialRampToValueAtTime(Math.max(0.0001, to), t + Math.max(0.02, sec)); }
// play one track at an offset, crossfading out whatever is on the lane. loopOne = repeat this one track (loop 'one').
function playTrackAt(entry, offset, fadeSec, loopOne, tries) {
    var myGen = ++loadGen;   // this is now the intended track; any earlier in-flight fetch is stale
    return bufferFor(entry).then(function(buf) {
        var a = ac(); if (!a) return;
        if (myGen !== loadGen) return;   // superseded while fetching/decoding: do not touch the lane
        if (a.state === 'suspended') { pending = { entry: entry, offset: offset, loopOne: loopOne }; showGate(); return; }
        var old = cur;
        var g = a.createGain(); g.gain.value = 0.0001; g.connect(a.destination);
        var src = a.createBufferSource(); src.buffer = buf; src.loop = !!loopOne; src.playbackRate.value = rate; src.connect(g);
        var rec = { src: src, gain: g, entry: entry, startedAt: a.currentTime, offset: offset || 0, dur: buf.duration, loopOne: !!loopOne, rate: rate };
        cur = rec;
        if (!loopOne) src.onended = function() { if (cur === rec) onTrackEnd(); };
        src.start(0, Math.min(offset || 0, Math.max(0, buf.duration - 0.05)));
        ramp(g, effGain(), fadeSec === undefined ? 1.2 : fadeSec);
        if (old) { ramp(old.gain, 0.0001, fadeSec === undefined ? 1.2 : fadeSec); setTimeout(function() { try { old.src.stop(); } catch (e) {} }, ((fadeSec === undefined ? 1.2 : fadeSec) * 1000) + 120); }
        emit(); broadcastControl();   // if the GM is taking control, clients follow this track + position
    }).catch(function(e) {
        if (!isClient()) { toast('Could not play "' + entry.name + '": ' + (e && e.message || e)); return; }
        if (myGen === loadGen && (tries | 0) < 3 && /busy/.test(e && e.message || '')) setTimeout(function() { if (myGen === loadGen) playTrackAt(entry, offset, fadeSec, loopOne, (tries | 0) + 1); }, 500 * ((tries | 0) + 1));   // the host's one-in-flight lane was busy; retry the still-intended track
    });
}
function onTrackEnd() {   // a track played through to its end (never fires for loop 'one', which loops the source)
    if (controlled) return;   // following the GM: do not advance on our own — the host sends the next track
    if (!source) return;
    if (source.loop === 'one') { var e = trackById(order[qi]); if (e) playTrackAt(e, 0, 0.05, true); return; }
    if (qi < order.length - 1) { qi++; playCurrent(0.05); return; }
    if (source.loop === 'list' && order.length) { qi = 0; playCurrent(0.05); return; }
    if (isHost() && controlling) { stopLane(0.3); broadcastControl(); return; }   // controlling: end of a no-loop list = table silence (paused), not a release
    stop(0.3);   // loop 'off' at the end of the list
}
function shuffled(ids) { var a = ids.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function resolveOrder(src) {
    if (src.kind === 'track') return [src.id];
    var pl = playlistById(src.id); if (!pl) return [];
    var ids = pl.tracks.filter(function(id) { return !!trackById(id); });
    return src.shuffle ? shuffled(ids) : ids;
}
function playCurrent(fadeSec, startPos) { var e = trackById(order[qi]); if (e) playTrackAt(e, startPos || 0, fadeSec, source && source.loop === 'one'); }
// start (or continue) a source. Same kind+id as what's already playing → do nothing but adopt loop/shuffle (seamless).
// opts.pos / opts.index start a fresh source at a position (used by the GM take-control override on a client).
function play(src, opts) {
    if (!featureOn()) return;
    opts = opts || {};
    autoStarted = false;   // any play() is manual by default; tick() re-marks its own call as auto-started
    src = { kind: src.kind, id: src.id, loop: src.loop || 'list', shuffle: !!src.shuffle };
    if (!opts.pos && source && cur && source.kind === src.kind && source.id === src.id) {   // the same playlist / song is already playing → keep it going
        var reorder = source.shuffle !== src.shuffle && src.kind === 'playlist';
        source.loop = src.loop; if (cur) cur.loopOne = source.loop === 'one', cur.src.loop = source.loop === 'one';
        if (reorder) { source.shuffle = src.shuffle; order = resolveOrder(source); qi = Math.max(0, order.indexOf(cur.entry.id)); }
        emit(); broadcastControl(); return;
    }
    source = src; order = resolveOrder(src); qi = (opts.index > 0 && opts.index < order.length) ? opts.index : 0;
    if (!order.length) { stop(0.3); toast(src.kind === 'playlist' ? 'That playlist has no tracks yet.' : 'That track is missing.'); return; }
    playCurrent(opts.fade, opts.pos);
}
function stop(fadeSec) {
    source = null; order = []; qi = 0; pending = null;
    if (cur) { var old = cur; cur = null; if (ctx) ramp(old.gain, 0.0001, fadeSec === undefined ? 0.6 : fadeSec); setTimeout(function() { try { old.src.stop(); } catch (e) {} }, ((fadeSec === undefined ? 0.6 : fadeSec) * 1000) + 120); }
    emit(); broadcastControl();
}
function togglePlay() { if (!source) return; if (cur) { stopLane(0.3); } else { playCurrent(0.3); } emit(); broadcastControl(); }
function stopLane(fadeSec) { if (!cur) return; var old = cur; cur = null; if (ctx) ramp(old.gain, 0.0001, fadeSec || 0.3); setTimeout(function() { try { old.src.stop(); } catch (e) {} }, (fadeSec || 0.3) * 1000 + 120); }
function next() { if (!source || !order.length) return; if (qi < order.length - 1) qi++; else if (source.loop !== 'off') qi = 0; else return; playCurrent(0.25); }
function prev() { if (!source || !order.length) return; if (position() > 3) { seek(0); return; } if (qi > 0) qi--; else if (source.loop !== 'off') qi = order.length - 1; else return; playCurrent(0.25); }
function position() { if (!cur || !ctx) return 0; var e = (ctx.currentTime - cur.startedAt) * (cur.rate || 1) + cur.offset; return cur.loopOne && cur.dur ? (e % cur.dur) : Math.min(e, cur.dur); }
function seek(pos) { if (!cur) return; playTrackAt(cur.entry, Math.max(0, Math.min(pos, cur.dur - 0.05)), 0.05, cur.loopOne); }
function setSpeed(r) { rate = Math.max(0.5, Math.min(2, r || 1)); setPref('wp_musicRate', Math.round(rate * 100)); if (cur && ctx) { cur.offset = position(); cur.startedAt = ctx.currentTime; cur.rate = rate; try { cur.src.playbackRate.setValueAtTime(rate, ctx.currentTime); } catch (e) {} } emit(); }
function setLoop(mode) { if (!source) return; source.loop = (mode === 'off' || mode === 'one' || mode === 'list') ? mode : 'list'; if (cur) { cur.loopOne = source.loop === 'one'; cur.src.loop = cur.loopOne; if (cur.loopOne) cur.src.onended = null; else cur.src.onended = (function(rec) { return function() { if (cur === rec) onTrackEnd(); }; })(cur); } emit(); broadcastControl(); }
function setShuffle(on) { if (!source || source.kind !== 'playlist') return; source.shuffle = !!on; var curId = cur ? cur.entry.id : null; order = resolveOrder(source); qi = Math.max(0, curId ? order.indexOf(curId) : 0); emit(); broadcastControl(); }
function setVolume(v) { mvol = Math.max(0, Math.min(1, v)); setPref('wp_musicVolume', Math.round(mvol * 100)); if (cur) ramp(cur.gain, effGain(), 0.1); emit(); }
function setMute(on) { mmuted = !!on; setPref('wp_musicMuted', mmuted ? 'yes' : 'no'); if (cur) ramp(cur.gain, effGain(), 0.1); emit(); }
function nowPlaying() { return cur ? cur.entry : null; }
function status() { return { source: source, playing: !!cur, entry: cur ? cur.entry : null, pos: position(), dur: cur ? cur.dur : 0, loop: source ? source.loop : 'list', shuffle: source ? !!source.shuffle : false, volume: mvol, muted: mmuted, rate: rate, on: featureOn() }; }

/* ---------- the autoplay gate ---------- */
function showGate() { var g = ui('musicGate'); if (g) g.style.display = 'flex'; gateShown = true; }
function hideGate() { var g = ui('musicGate'); if (g) g.style.display = 'none'; gateShown = false; }
function tryResume() {
    if (!ctx || ctx.state !== 'suspended') { if (gateShown) hideGate(); return; }
    ctx.resume().then(function() { hideGate(); var p = pending; pending = null; if (p) playTrackAt(p.entry, p.offset, 1.0, p.loopOne); }).catch(function() {});
}
document.addEventListener('pointerdown', function() { if (gateShown || (ctx && ctx.state === 'suspended' && pending)) tryResume(); }, true);
document.addEventListener('keydown', function() { if (gateShown || (ctx && ctx.state === 'suspended' && pending)) tryResume(); }, true);

/* ---------- per-viewer local auto-play as the map changes (baseline) ---------- */
var lastKey = '', lastMapId = null, autoStarted = false;   // what auto-play last did; autoStarted = the current music was started by auto-play (not the panel)
function activeMapItem() { var camp = getActiveCampaign(); if (!camp) return null; var it = camp.items && camp.items[camp.activeItemId]; return (it && it.type === 'map') ? it : null; }
function sessionLive() { var n = net(); return !!(n && n.active); }
function soloAutoOn() { return pref('wp_musicSolo', 'off') === 'on'; }   // GM option: auto-play map music even when NOT in a session (off by default)
// Runs on every render() — MUST be cheap in the common case (zoom / pan re-renders on the same map). It only does
// real work when the active MAP changes, and only auto-plays while a multiplayer session is live (solo prep can
// still play from the panel; that music is left alone here).
function tick() {
    if (controlling || controlled) return;   // the GM is driving the table's music (or we are following it): map auto-play is suspended
    if (!featureOn() || (!sessionLive() && !soloAutoOn())) { if (autoStarted && (cur || source)) { stop(0.5); autoStarted = false; } lastKey = ''; lastMapId = null; return; }   // no auto-play unless a session is live or the GM opted into solo auto-play
    var camp = getActiveCampaign(), it = camp && camp.items ? camp.items[camp.activeItemId] : null;
    it = (it && it.type === 'map') ? it : null;
    var mapId = it ? camp.activeItemId : null;
    if (mapId === lastMapId) return;   // same map (or still no map): nothing to do — the cheap path for zoom/pan
    lastMapId = mapId;
    if (!it || !it.music) return;      // no map open, or a map with no preset: leave the current music alone (seamless)
    var cfg = cleanMapMusic(it.music, idSets());
    if (!cfg) return;
    var kind = cfg.playlist ? 'playlist' : 'track', id = cfg.playlist || cfg.track, key = kind + ':' + id;
    if (key === lastKey && source && source.kind === kind && source.id === id) return;   // already playing this one
    lastKey = key;
    play({ kind: kind, id: id, loop: cfg.loop, shuffle: cfg.shuffle });
    autoStarted = true;
}

/* ---------- multiplayer: the music library travels like sounds; the GM can take control of the table's music ---------- */
// The current playback as a control message (host -> clients). on:false means nothing is playing / release.
function currentControl() {
    if (!source) return { on: false };
    var c = { on: true, loop: source.loop, shuffle: !!source.shuffle, playing: !!cur, index: qi, pos: position(), ts: Date.now() };
    if (source.kind === 'playlist') c.playlist = source.id; else c.track = source.id;
    var nowId = cur ? cur.entry.id : order[qi]; if (nowId) c.now = nowId;   // the exact track, so clients follow it by id (shuffle-safe)
    return c;
}
// Host: the current control for a joining peer (fresh position), or null when not taking control.
function controlSnapshot() { return (isHost() && controlling) ? currentControl() : null; }
// Host: while taking control, push the current playback to every client. Called after each transport change.
function broadcastControl() { if (controlling && isHost()) { var n = net(); if (n && n.sendMusicControl) n.sendMusicControl(currentControl()); } }
// Host: toggle "take control" of the whole table's music.
function setControlling(on) {
    if (!isHost()) return;
    controlling = !!on;
    var n = net();
    if (controlling) broadcastControl();               // start driving: send what is playing now
    else if (n && n.sendMusicControl) { n.sendMusicControl({ on: false }); lastKey = ''; lastMapId = null; tick(); }   // release: clients (and we) resume local map music
    emit(); if (panelOpen()) renderPanel();
}
// The host builds the library message; a client stores it (re-validated) as net.music.
function listMessage() { var camp = getActiveCampaign(); if (!camp) return null; return { type: 'music', campId: camp.id, music: cleanMusic(campMusic(camp)) }; }
function onList(msg) { var n = net(); if (!n) return; n.music = cleanMusic(msg && msg.music); lastKey = ''; lastMapId = null; tick(); renderPill(); if (panelOpen()) renderPanel(); }   // re-arm map auto-play now that the library exists (the join-map's music would otherwise never start)
// A client applies the GM's take-control override (re-cleaned against its own library). It follows the EXACT track
// the GM names (mc.now / mc.track), by id — never its own auto-advance — so shuffle and mid-playlist jumps stay in sync.
function onControl(msg) {
    var mc = cleanControl(msg, idSets()); if (!mc) return;
    if (!mc.on) { if (controlled) { controlled = false; stop(0.5); lastKey = ''; lastMapId = null; tick(); } return; }   // release -> drop the GM's track, resume this map's own music (or silence if it has none)
    if (!featureOn()) return;   // a player who turned Music off for themselves is never force-played (mirrors sound.js onCue)
    controlled = true;
    var want = mc.now || mc.track;
    if (!want && mc.playlist) { var pl = playlistById(mc.playlist); want = pl && pl.tracks.length ? pl.tracks[(mc.index > 0 && mc.index < pl.tracks.length) ? mc.index : 0] : null; }
    if (!want || !trackById(want)) { if (cur) stopLane(0.3); return; }   // nothing to play / a track this client does not have
    source = { kind: mc.playlist ? 'playlist' : 'track', id: mc.playlist || mc.track, loop: mc.loop, shuffle: !!mc.shuffle };
    if (cur && cur.entry.id === want) {   // already on this exact track: follow loop, re-seek on a real jump, follow pause/play
        cur.loopOne = mc.loop === 'one'; cur.src.loop = cur.loopOne;
        if (Math.abs((mc.pos || 0) - position()) > 2.5) seek(mc.pos || 0);
        if (!mc.playing && cur) stopLane(0.2); else if (mc.playing && !cur) playCurrent(0.2, mc.pos || 0);
        return;
    }
    order = [want]; qi = 0; autoStarted = false;   // a one-track queue: the host drives every change, we never advance on our own
    var el = mc.ts ? (Date.now() - mc.ts) / 1000 : 0; if (!(el > 0) || el > 30) el = 0;   // add the transfer/latency elapsed (bounded — ignore an obviously-skewed clock)
    if (mc.playing) playCurrent(0.4, (mc.pos || 0) + el); else if (cur) stopLane(0.3);
}
function onSnapshot() { controlled = false; stop(0); cache = {}; bytes = {}; cacheSec = 0; lastKey = ''; lastMapId = null; }   // a fresh snapshot: drop stale library/playback; the 'music' message re-arms
function tableLeft() { controlled = false; controlling = false; stop(0); cache = {}; bytes = {}; cacheSec = 0; lastKey = ''; lastMapId = null; }

/* ---------- the library: upload songs (GM), and remove tracks ---------- */
var AUDIO_EXT = /\.(mp3|ogg|oga|m4a|webm|opus)$/i;
function fmtMB(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB'; }
function probeDur(file) {   // a track's length, from metadata (light — no full decode)
    return new Promise(function(resolve) {
        var url = URL.createObjectURL(file), a = new Audio(), done = function(d) { try { URL.revokeObjectURL(url); } catch (e) {} resolve(isFinite(d) && d > 0 ? d : 0); };
        a.preload = 'metadata'; a.addEventListener('loadedmetadata', function() { done(a.duration); }); a.addEventListener('error', function() { done(0); });
        setTimeout(function() { done(0); }, 6000); a.src = url;
    });
}
function uploadTracks(files) {
    var camp = getActiveCampaign(); if (!camp || !canWrite() || !window.wpUploadBlob) return;
    var mw = campMusicW(camp); if (!mw) return;
    var used = mw.tracks.reduce(function(s, t) { return s + (t.size || 0); }, 0);
    var list = Array.prototype.slice.call(files), done = 0, refused = [];
    (function next() {
        if (!list.length) {
            if (done) { save(true); var n = net(); if (n && n.syncMusic) n.syncMusic(); if (panelOpen()) renderPanel(); }
            toast((done ? done + ' track' + (done === 1 ? '' : 's') + ' added.' : 'Nothing added.') + (refused.length ? ' Refused: ' + refused.join('; ') : ''));
            return;
        }
        var f = list.shift();
        if (!AUDIO_EXT.test(f.name) && !/^audio\//.test(f.type)) { refused.push(f.name + ' (not an audio file)'); return next(); }
        if (/\.(wav|flac|aiff?)$/i.test(f.name)) { refused.push(f.name + ' (WAV / FLAC are too large — convert to MP3 or OGG)'); return next(); }
        if (f.size > LIMITS.file) { refused.push(f.name + ' (over ' + fmtMB(LIMITS.file) + ')'); return next(); }
        if (used + f.size > LIMITS.campaign) { refused.push(f.name + ' (the campaign’s music library is full)'); return next(); }
        probeDur(f).then(function(dur) {
            return window.wpUploadBlob('audio/' + camp.id, f.name.replace(/[\/\\?#%\s]+/g, '_').slice(0, 120), f).then(function(url) {   // spaces/reserved chars out of the on-disk name so any server can serve it; the display name (track.name) keeps them
                mw.tracks.push({ id: uid('t_'), name: f.name.replace(/^[a-z0-9]{8}_/, '').replace(/\.[^.]+$/, '').slice(0, LIMITS.name) || 'Track', path: url, size: f.size, dur: Math.round((dur || 0) * 10) / 10 });
                used += f.size; done++; next();
            });
        }).catch(function(err) { refused.push(f.name + ' (' + (err && err.message || 'upload failed') + ')'); next(); });
    })();
}
function removeTrack(id) {
    var camp = getActiveCampaign(), mw = campMusicW(camp); if (!mw) return;
    mw.tracks = mw.tracks.filter(function(t) { return t.id !== id; });
    mw.playlists.forEach(function(pl) { pl.tracks = pl.tracks.filter(function(t) { return t !== id; }); });   // drop it from every playlist too
    save(true); var n = net(); if (n && n.syncMusic) n.syncMusic(); if (panelOpen()) renderPanel();
}

/* ---------- the feature switch (vtt.js fan-out) ---------- */
function sync() { var b = ui('musicBtn'); if (b) b.style.display = ''; if (!featureOn()) { stop(0.3); lastKey = ''; } renderPill(); if (panelOpen()) renderPanel(); }

/* ---------- the player's pill (its own volume / mute, separate from Sound) ---------- */
function renderPill() {
    var ind = ui('musicInd'); if (!ind) return;
    ind.style.display = featureOn() ? '' : 'none';
    ind.classList.toggle('playing', !!cur);   // NOT 'on' — that class triggers the toolbar's gold active-background
    ind.classList.toggle('muted', mmuted);
    var e = nowPlaying();
    ind.title = 'Music — your volume and mute' + (e ? ' · now playing: ' + e.name : '');
}
var pillPop = null;
function closePill() { if (pillPop) { pillPop.remove(); pillPop = null; document.removeEventListener('pointerdown', onPillOut, true); } }
function onPillOut(e) { if (pillPop && !pillPop.contains(e.target) && e.target !== ui('musicInd')) closePill(); }
function openPill() {
    closePill();
    var pop = el('div', 'music-pillpop'); pillPop = pop;
    pop.appendChild(el('div', 'music-pillpop-t', 'Music'));
    var e = nowPlaying(); if (e) pop.appendChild(el('div', 'music-pillpop-now', e.name));
    var row = el('div', 'music-pillpop-vol');
    var mute = el('button', 'tool ghost', mmuted ? '🔇' : '🔊'); mute.title = mmuted ? 'Unmute music' : 'Mute music'; mute.addEventListener('click', function() { setMute(!mmuted); mute.textContent = mmuted ? '🔇' : '🔊'; });
    var slider = el('input'); slider.type = 'range'; slider.min = 0; slider.max = 100; slider.value = Math.round(mvol * 100); slider.className = 'music-vol'; slider.addEventListener('input', function() { setVolume(Number(slider.value) / 100); });
    row.appendChild(mute); row.appendChild(slider); pop.appendChild(row);
    if (canWrite()) { var open = el('button', 'tool ghost music-pillpop-open', 'Open music panel'); open.addEventListener('click', function() { closePill(); openPanel(); }); pop.appendChild(open); }
    var off = el('button', 'tool ghost music-pillpop-off', 'Turn music off for me'); off.title = 'Settings ▸ VTT features'; off.addEventListener('click', function() { if (window.wpVtt && window.wpVtt.setLocal) { window.wpVtt.setLocal('music', true); } closePill(); }); pop.appendChild(off);
    document.body.appendChild(pop);
    var r = ui('musicInd').getBoundingClientRect(); pop.style.right = Math.max(8, window.innerWidth - r.right) + 'px'; pop.style.top = (r.bottom + 6) + 'px';
    setTimeout(function() { document.addEventListener('pointerdown', onPillOut, true); }, 0);
}

/* ---------- the GM panel: playlists, transport, per-map binding ---------- */
var selPl = null;   // the selected playlist id in the panel
function panelOpen() { var p = ui('musicPanel'); return !!(p && p.style.display !== 'none'); }
function openPanel() { if (!canWrite()) { toast('Only the GM manages music.'); return; } var p = ui('musicPanel'); if (!p) return; p.style.display = 'flex'; try { var pos = JSON.parse(pref('wp_musicPanel', '')); if (pos && typeof pos.x === 'number') { p.style.left = Math.max(0, Math.min(pos.x, window.innerWidth - 60)) + 'px'; p.style.top = Math.max(0, Math.min(pos.y, window.innerHeight - 40)) + 'px'; p.style.right = 'auto'; } } catch (e) {} renderPanel(); }
function closePanel() { var p = ui('musicPanel'); if (p) p.style.display = 'none'; }
// Light update of the transport display without rebuilding the panel (so a slider being dragged is never yanked).
function refreshTransport() {
    var p = ui('musicPanel'); if (!p || p.style.display === 'none') return;
    var st = status(), q = function(s) { return p.querySelector(s); };
    var now = q('.music-now'); if (now) now.textContent = st.entry ? st.entry.name : (campMusic().tracks.length ? 'Stopped' : 'No tracks yet');
    var bar = q('.music-seekbar'); if (bar && document.activeElement !== bar) { bar.max = Math.max(1, Math.floor(st.dur)); bar.value = Math.floor(st.pos); bar.disabled = !st.entry; }
    var ts = p.querySelectorAll('.music-seek .music-t'); if (ts[0]) ts[0].textContent = fmtTime(st.pos); if (ts[1]) ts[1].textContent = fmtTime(st.dur);
    var play = q('.music-play'); if (play) { play.textContent = cur ? '⏸' : '▶'; play.title = cur ? 'Pause' : 'Play'; }
    var loopLbl = { off: '↻ off', one: '🔂 one', list: '🔁 list' }, lp = q('.music-loop'); if (lp) { lp.textContent = loopLbl[st.loop] || '🔁 list'; lp.classList.toggle('on', st.loop !== 'off'); }
    var sh = q('.music-shuf'); if (sh) sh.classList.toggle('on', st.shuffle);
    var vs = q('.music-vol'); if (vs && document.activeElement !== vs) vs.value = Math.round(st.volume * 100);
    var mb = q('.music-mute'); if (mb) mb.textContent = st.muted ? '🔇' : '🔊';
    var sv = q('.music-speed-val'); if (sv && document.activeElement !== sv) sv.value = st.rate.toFixed(2);
}
function renderPanel() {
    var p = ui('musicPanel'); if (!p || p.style.display === 'none') return;
    var m = campMusic(), st = status();
    p.textContent = '';
    var head = el('div', 'music-head'); head.appendChild(el('b', null, 'Music')); var x = el('button', 'tool ghost music-x', '×'); x.title = 'Close'; x.addEventListener('click', closePanel); head.appendChild(x); p.appendChild(head);

    // transport
    var tp = el('div', 'music-transport');
    var now = st.entry ? st.entry.name : (m.tracks.length ? 'Stopped' : 'No tracks yet');
    tp.appendChild(el('div', 'music-now', now));
    var seekRow = el('div', 'music-seek');
    var t0 = el('span', 'music-t', fmtTime(st.pos));
    var bar = el('input'); bar.type = 'range'; bar.min = 0; bar.max = Math.max(1, Math.floor(st.dur)); bar.value = Math.floor(st.pos); bar.className = 'music-seekbar'; bar.disabled = !st.entry;
    bar.addEventListener('input', function() { seek(Number(bar.value)); });
    var t1 = el('span', 'music-t', fmtTime(st.dur));
    seekRow.appendChild(t0); seekRow.appendChild(bar); seekRow.appendChild(t1); tp.appendChild(seekRow);
    var btns = el('div', 'music-btns');
    function tb(cls, label, title, fn, on) { var b = el('button', 'tool ghost music-tb ' + cls + (on ? ' on' : ''), label); b.title = title; b.addEventListener('click', fn); return b; }
    btns.appendChild(tb('music-prev', '⏮', 'Previous', prev));
    btns.appendChild(tb('music-play', cur ? '⏸' : '▶', cur ? 'Pause' : 'Play', togglePlay));
    btns.appendChild(tb('music-next', '⏭', 'Next', next));
    btns.appendChild(tb('music-stop', '⏹', 'Stop', function() { if (isHost() && controlling) { stopLane(0.4); broadcastControl(); } else stop(0.4); }));   // while controlling, Stop = silence the table (paused, still controlled), not release
    var loopLbl = { off: '↻ off', one: '🔂 one', list: '🔁 list' };
    btns.appendChild(tb('music-loop', loopLbl[st.loop] || '🔁 list', 'Loop: off / one track / whole list', function() { setLoop(st.loop === 'off' ? 'list' : st.loop === 'list' ? 'one' : 'off'); }, st.loop !== 'off'));
    btns.appendChild(tb('music-shuf', '🔀', 'Shuffle the playlist', function() { setShuffle(!st.shuffle); }, st.shuffle));
    tp.appendChild(btns);
    var volRow = el('div', 'music-volrow');
    var vmute = el('button', 'tool ghost music-mute', st.muted ? '🔇' : '🔊'); vmute.title = st.muted ? 'Unmute music' : 'Mute music'; vmute.addEventListener('click', function() { setMute(!mmuted); });
    var vsl = el('input'); vsl.type = 'range'; vsl.min = 0; vsl.max = 100; vsl.value = Math.round(st.volume * 100); vsl.className = 'music-vol'; vsl.title = 'Music volume'; vsl.addEventListener('input', function() { setVolume(Number(vsl.value) / 100); });
    volRow.appendChild(vmute); volRow.appendChild(vsl); tp.appendChild(volRow);
    var spRow = el('div', 'music-speedrow');
    spRow.appendChild(el('span', 'music-speed-lbl', 'Speed'));
    var slow = el('button', 'tool ghost music-slow', '−'); slow.title = 'Slow down (0.5× minimum)'; slow.addEventListener('click', function() { setSpeed(rate - 0.1); });
    var spIn = el('input'); spIn.type = 'number'; spIn.min = '0.5'; spIn.max = '2'; spIn.step = '0.05'; spIn.value = st.rate.toFixed(2); spIn.className = 'music-speed-val num-stepped'; spIn.title = 'Type a speed from 0.5 to 2×';
    var apply = function() { var v = parseFloat(spIn.value); if (isFinite(v)) setSpeed(v); };
    spIn.addEventListener('change', apply); spIn.addEventListener('keydown', function(e) { if (e.key === 'Enter') { apply(); spIn.blur(); } });
    var xg = el('span', 'music-speed-x', '×');
    var fast = el('button', 'tool ghost music-fast', '+'); fast.title = 'Speed up (2× maximum)'; fast.addEventListener('click', function() { setSpeed(rate + 0.1); });
    spRow.appendChild(slow); spRow.appendChild(spIn); spRow.appendChild(xg); spRow.appendChild(fast); tp.appendChild(spRow);
    if (isHost() && sessionLive()) {   // the GM can drive every player's music in sync
        var ctlBtn = el('button', 'tool music-takectl' + (controlling ? ' on' : ''), controlling ? '● Controlling the table — release' : 'Take control of the table’s music');
        ctlBtn.title = controlling ? 'Players follow your music; click to hand them back their own map music' : 'Play your music on every player’s machine in sync (they keep their own volume)';
        ctlBtn.addEventListener('click', function() { setControlling(!controlling); });
        tp.appendChild(ctlBtn);
    }
    var soloRow = el('label', 'music-solo-opt');
    var soloChk = el('input'); soloChk.type = 'checkbox'; soloChk.className = 'music-solo-chk'; soloChk.checked = soloAutoOn();
    soloChk.addEventListener('change', function() { setPref('wp_musicSolo', soloChk.checked ? 'on' : 'off'); lastKey = ''; lastMapId = ''; tick(); });
    soloRow.appendChild(soloChk); soloRow.appendChild(document.createTextNode(' Auto-play map music while solo (no session)'));
    soloRow.title = 'Off by default: map music starts for players in a session. Turn on to also hear it while prepping alone.';
    tp.appendChild(soloRow);
    p.appendChild(tp);

    // playlists
    var plWrap = el('div', 'music-section');
    var plHead = el('div', 'music-sec-head'); plHead.appendChild(el('span', null, 'Playlists')); var add = el('button', 'tool ghost', '+ New'); add.addEventListener('click', function() { var mw = campMusicW(); if (!mw) return; mw.playlists.push({ id: uid('pl_'), name: 'New playlist', tracks: [] }); save(true); selPl = mw.playlists[mw.playlists.length - 1].id; renderPanel(); }); plHead.appendChild(add); plWrap.appendChild(plHead);
    if (!m.playlists.length) plWrap.appendChild(el('div', 'music-empty', 'No playlists yet. New one above, then add tracks from the library below.'));
    m.playlists.forEach(function(pl) {
        var row = el('div', 'music-pl' + (pl.id === selPl ? ' sel' : ''));
        var nm = el('span', 'music-pl-name', pl.name + '  (' + pl.tracks.length + ')'); nm.addEventListener('click', function() { selPl = pl.id === selPl ? null : pl.id; renderPanel(); }); row.appendChild(nm);
        var play0 = el('button', 'tool ghost', '▶'); play0.title = 'Play this playlist'; play0.addEventListener('click', function() { play({ kind: 'playlist', id: pl.id, loop: 'list', shuffle: st.shuffle }); }); row.appendChild(play0);
        var ren = el('button', 'tool ghost', '✎'); ren.title = 'Rename'; ren.addEventListener('click', function() { if (window.wpPrompt) window.wpPrompt('Rename playlist', pl.name, function(v) { if (v == null) return; pl.name = cleanName(v, pl.name); save(true); renderPanel(); }); }); row.appendChild(ren);
        var del = el('button', 'tool ghost music-del', '×'); del.title = 'Delete this playlist'; del.addEventListener('click', function() { var mw = campMusicW(); mw.playlists = mw.playlists.filter(function(x) { return x.id !== pl.id; }); if (selPl === pl.id) selPl = null; save(true); renderPanel(); }); row.appendChild(del);
        plWrap.appendChild(row);
        if (pl.id === selPl) {
            var tl = el('div', 'music-pl-tracks');
            pl.tracks.forEach(function(tid, i) {
                var tr = trackById(tid), trow = el('div', 'music-pl-track');
                trow.appendChild(el('span', 'music-pl-tname', (tr ? tr.name : '(missing)')));
                var up = el('button', 'tool ghost', '↑'); up.addEventListener('click', function() { if (i > 0) { pl.tracks.splice(i, 1); pl.tracks.splice(i - 1, 0, tid); save(true); renderPanel(); } }); trow.appendChild(up);
                var dn = el('button', 'tool ghost', '↓'); dn.addEventListener('click', function() { if (i < pl.tracks.length - 1) { pl.tracks.splice(i, 1); pl.tracks.splice(i + 1, 0, tid); save(true); renderPanel(); } }); trow.appendChild(dn);
                var rm = el('button', 'tool ghost music-del', '×'); rm.addEventListener('click', function() { pl.tracks.splice(i, 1); save(true); renderPanel(); }); trow.appendChild(rm);
                tl.appendChild(trow);
            });
            if (m.tracks.length) {
                var addSel = el('select', 'music-addtrack'); addSel.appendChild(new Option('+ Add a track…', ''));
                m.tracks.forEach(function(tr) { addSel.appendChild(new Option(tr.name, tr.id)); });
                addSel.addEventListener('change', function() { if (addSel.value && pl.tracks.length < LIMITS.tracks) { pl.tracks.push(addSel.value); save(true); renderPanel(); } });
                tl.appendChild(addSel);
            }
            plWrap.appendChild(tl);
        }
    });
    p.appendChild(plWrap);

    // per-map binding
    var it = activeMapItem();
    if (it) {
        var bindWrap = el('div', 'music-section');
        bindWrap.appendChild(el('div', 'music-sec-head', 'On this map (' + (it.name || 'map') + ')'));
        var cfg = cleanMapMusic(it.music, idSets());
        var bsel = el('select', 'music-bindpl'); bsel.appendChild(new Option('— nothing —', ''));
        m.playlists.forEach(function(pl) { var o = new Option('▶ ' + pl.name, 'pl:' + pl.id); if (cfg && cfg.playlist === pl.id) o.selected = true; bsel.appendChild(o); });
        m.tracks.forEach(function(tr) { var o = new Option('♪ ' + tr.name, 'tr:' + tr.id); if (cfg && cfg.track === tr.id) o.selected = true; bsel.appendChild(o); });
        bindWrap.appendChild(bsel);
        var loopSel = el('select', 'music-bindloop'); [['list', 'Loop list'], ['one', 'Loop one'], ['off', 'No loop']].forEach(function(o) { var op = new Option(o[1], o[0]); if (cfg && cfg.loop === o[0]) op.selected = true; loopSel.appendChild(op); }); bindWrap.appendChild(loopSel);
        var shufL = el('label', 'music-bindshuf'); var shc = el('input'); shc.type = 'checkbox'; shc.checked = !!(cfg && cfg.shuffle); shufL.appendChild(shc); shufL.appendChild(document.createTextNode(' Shuffle')); bindWrap.appendChild(shufL);
        var setB = el('button', 'tool music-bindset', 'Remember on this map'); setB.addEventListener('click', function() {
            var v = bsel.value;
            if (!v) { delete it.music; }
            else { var mm = { loop: loopSel.value, shuffle: shc.checked }; if (v.indexOf('pl:') === 0) mm.playlist = v.slice(3); else mm.track = v.slice(3); it.music = mm; }
            save(true); toast(v ? 'Saved this map’s music.' : 'Cleared this map’s music.'); lastKey = ''; tick(); renderPanel();
        }); bindWrap.appendChild(setB);
        p.appendChild(bindWrap);
    }

    // library: upload songs + manage tracks
    var lib = el('div', 'music-section music-lib');
    var libHead = el('div', 'music-sec-head'); libHead.appendChild(el('span', null, 'Library — ' + m.tracks.length + ' track' + (m.tracks.length === 1 ? '' : 's')));
    var addF = el('button', 'tool ghost', '+ Add music…');
    var fileIn = el('input'); fileIn.type = 'file'; fileIn.accept = 'audio/*'; fileIn.multiple = true; fileIn.style.display = 'none';
    addF.addEventListener('click', function() { if (!canWrite()) { toast('Only the GM manages music.'); return; } fileIn.value = ''; fileIn.click(); });
    fileIn.addEventListener('change', function() { uploadTracks(fileIn.files); });
    libHead.appendChild(addF); lib.appendChild(libHead); lib.appendChild(fileIn);
    if (!m.tracks.length) lib.appendChild(el('div', 'music-empty', 'No music tracks yet. Add songs (MP3 / OGG, up to ' + fmtMB(LIMITS.file) + ') above; a playlist plays tracks from here.'));
    else m.tracks.forEach(function(tr) {
        var row = el('div', 'music-libtrack');
        row.appendChild(el('span', 'music-libtrack-name', tr.name));
        var rm = el('button', 'tool ghost music-del', '×'); rm.title = 'Remove this track (and from every playlist)'; rm.addEventListener('click', function() { removeTrack(tr.id); });
        row.appendChild(rm); lib.appendChild(row);
    });
    p.appendChild(lib);
}

/* ---------- boot: react to the feature switch, poll the transport while the panel is open ---------- */
window.wpMusicSync = sync;
window.wpMusicTick = tick;
window.wpMusic = { play: play, stop: stop, next: next, prev: prev, seek: seek, togglePlay: togglePlay, setLoop: setLoop, setShuffle: setShuffle, setVolume: setVolume, setMute: setMute, setSpeed: setSpeed, status: status, nowPlaying: nowPlaying, openPanel: openPanel, closePanel: closePanel, tick: tick, sync: sync, onListeners: listeners,
    listMessage: listMessage, onList: onList, onControl: onControl, onSnapshot: onSnapshot, tableLeft: tableLeft, controlSnapshot: controlSnapshot, idSets: idSets, setControlling: setControlling, isControlling: function() { return controlling; }, addFiles: uploadTracks };
(function wire() {
    var b = ui('musicBtn'); if (b) b.addEventListener('click', function() { if (panelOpen()) closePanel(); else openPanel(); });
    var ind = ui('musicInd'); if (ind) ind.addEventListener('click', function() { if (pillPop) closePill(); else openPill(); });
    var mp = ui('musicPanel'), drag = null;   // drag the panel by its header (the head is rebuilt each render, so listen on the persistent panel)
    if (mp) {
        mp.addEventListener('pointerdown', function(e) { if (!e.target.closest('.music-head') || e.target.closest('button')) return; var r = mp.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; try { mp.setPointerCapture(e.pointerId); } catch (x) {} });
        mp.addEventListener('pointermove', function(e) { if (!drag) return; mp.style.left = Math.max(0, Math.min(e.clientX - drag.dx, window.innerWidth - 60)) + 'px'; mp.style.top = Math.max(0, Math.min(e.clientY - drag.dy, window.innerHeight - 40)) + 'px'; mp.style.right = 'auto'; });
        mp.addEventListener('pointerup', function() { if (!drag) return; drag = null; var r = mp.getBoundingClientRect(); setPref('wp_musicPanel', JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) })); });
    }
    var g = ui('musicGate'); if (g) g.addEventListener('click', tryResume);
    setInterval(function() { if (panelOpen() && cur) refreshTransport(); }, 500);
    renderPill();
})();
