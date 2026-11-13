/* Voice chat — the links and the panel. The pure half (what a message may carry, the settings, the words) is voicecore.js.

   The host is the hub: each player in voice holds one WebRTC connection to the host, agreed over the table's own data connection
   (messages 'voice' host → player and 'voice-up' player → host, routed here by net.js), and the host is always the side that offers,
   so the two never offer at once. On a player's connection the first audio line carries their microphone up; every other voice comes
   down on a line the host adds, and the offer's `who` map names whose voice each line (by its mid) is. The host hears everyone on
   the connections themselves and forwards each voice to every other member, re-using a line a voice left so the description stays
   bounded. Mute, deafen, per-speaker volume and push-to-talk are this machine's own: they are kept in localStorage and never sent.

   Hooks net.js calls: wpVoice.fromHost(msg) (a player's app, from the synced host only), wpVoice.fromPlayer(msg, conn) (the host,
   admitted connections only), wpVoice.connGone(peer) (the host, a connection closed), wpVoice.tableReady() (a player's app, the
   snapshot is in), wpVoice.tableLeft() (either side, the table is gone). It reads net.rtcConfig() for the table's ICE servers. */
import { LIMITS, cleanCand, cleanSdp, isLinkId, cleanName, cleanWho, cleanMode, cleanVol, cleanVols, cleanMutes, cleanBind, bindLabel, cleanDeviceId, deviceList, mouseBind, speaking, stateWords } from './voicecore.js';

var ui = function(id) { return document.getElementById(id); };
function netOf() { return window.wpNet || null; }
function hosting() { var n = netOf(); return !!(n && n.active && n.role === 'host'); }
function atTable() {   // a player's app with a synced table to speak to (never the stream window)
    var n = netOf(), c0 = n && n.conns ? n.conns[0] : null;
    return !!(n && n.active && n.role === 'client' && !n.stream && n.foreign && c0 && c0.open && n.syncedPeer && c0.peer === n.syncedPeer);
}
function tableOn() { return hosting() || atTable(); }
function rtcConfig() { var n = netOf(); try { return n && n.rtcConfig ? n.rtcConfig() || {} : {}; } catch (e) { return {}; } }
function newId() { var a = new Uint8Array(8); crypto.getRandomValues(a); return Array.prototype.map.call(a, function(b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
function myProfile() { var p = null; try { p = JSON.parse(localStorage.getItem('wp_profile') || 'null'); } catch (e) {} return p && typeof p === 'object' ? p : {}; }

/* ---------- this machine's settings ---------- */
function pref(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
function setPref(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function prefJson(k) { try { return JSON.parse(pref(k, '{}')); } catch (e) { return {}; } }
var prefs = {
    mode: cleanMode(pref('wp_voice_mode', 'open')),
    bind: cleanBind(pref('wp_voice_bind', 'KeyV')),
    vols: cleanVols(prefJson('wp_voice_vols')),     // profile id -> 0..1 (absent: full)
    mutes: cleanMutes(prefJson('wp_voice_mutes')),  // profile id -> true: muted for me
    input: cleanDeviceId(pref('wp_voice_in', '')),  // the microphone chosen here ('' the system's default)
    output: cleanDeviceId(pref('wp_voice_out', ''))  // the speakers or headset voices play on ('' the system's default)
};
function savePrefs() {
    setPref('wp_voice_mode', prefs.mode); setPref('wp_voice_bind', prefs.bind);
    setPref('wp_voice_in', prefs.input); setPref('wp_voice_out', prefs.output);
    setPref('wp_voice_vols', JSON.stringify(prefs.vols)); setPref('wp_voice_mutes', JSON.stringify(prefs.mutes));
}

/* ---------- this machine's microphone ---------- */
var me = { on: false, joining: false, mic: null, track: null, muted: false, deaf: false, talking: false, error: '' };
function micOpen() {   // whether what the microphone hears goes out now
    return me.on && !!me.track && !me.muted && !me.deaf && (prefs.mode === 'open' || me.talking);
}
function applyMic() { if (me.track) me.track.enabled = micOpen(); render(); }
function getMic() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(new Error('This app cannot use a microphone.'));
    var ask = function(id) {
        var a = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
        if (id) a.deviceId = { exact: id };
        return navigator.mediaDevices.getUserMedia({ audio: a, video: false });
    };
    if (!prefs.input) return ask('');
    return ask(prefs.input).catch(function(e) {   // the chosen microphone is gone (unplugged, another computer's id): the default, and the choice forgotten
        if (!e || (e.name !== 'OverconstrainedError' && e.name !== 'NotFoundError')) throw e;
        prefs.input = ''; savePrefs();
        return ask('');
    });
}
function dropMic() {
    if (me.mic) { try { me.mic.getTracks().forEach(function(t) { t.stop(); }); } catch (e) {} }
    me.mic = null; me.track = null; me.talking = false;
    meterDrop('me');
}
// A microphone that stops by itself (pulled out mid-session): the default takes over, and voice goes on
function watchTrack(t) {
    if (!t) return;
    t.addEventListener('ended', function() { if (me.on && me.track === t) { prefs.input = ''; savePrefs(); getMic().then(swapMic).catch(function() { leave(true); me.error = 'The microphone was disconnected.'; render(true); }); } });
}
// Another microphone, mid-session: its track takes the place of the old one on every line it goes out on, so nobody reconnects
function swapMic(stream) {
    var t = stream && stream.getAudioTracks()[0];
    if (!t || !me.on) { if (stream) stream.getTracks().forEach(function(x) { x.stop(); }); return; }
    var old = me.mic;
    me.mic = stream; me.track = t; watchTrack(t);
    if (hosting() && hub.srcs.gm) {
        hub.srcs.gm.track = t;
        Object.keys(hub.links).forEach(function(p) { var tx = hub.links[p].sent.gm; if (tx) tx.sender.replaceTrack(t).catch(function() {}); });
    } else if (up && up.sent) {
        var tx0 = up.pc.getTransceivers()[0]; if (tx0) tx0.sender.replaceTrack(t).catch(function() {});
    }
    meterAdd('me', stream);
    applyMic();
    if (old) { try { old.getTracks().forEach(function(x) { x.stop(); }); } catch (e) {} }
}

/* ---------- the devices: what this computer has, and the choices made here ---------- */
var devs = { inputs: [], outputs: [], open: false };
function canPickOutput() { return typeof HTMLMediaElement !== 'undefined' && typeof HTMLMediaElement.prototype.setSinkId === 'function'; }   // Chromium (Waypoint, Chrome, Edge); a browser without it plays on the default
function listDevices() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return Promise.resolve();
    return navigator.mediaDevices.enumerateDevices().then(function(ds) {
        devs.inputs = deviceList(ds, 'audioinput'); devs.outputs = deviceList(ds, 'audiooutput');
    }).catch(function() {});
}
if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', function() { listDevices().then(function() { render(true); }); });   // a headset plugged in or out: the lists follow
function setInput(id) {
    prefs.input = cleanDeviceId(id); savePrefs();
    if (me.on) getMic().then(swapMic).catch(function() { me.error = 'That microphone could not be opened.'; render(true); });
    render(true);
}
function setOutput(id) {
    prefs.output = cleanDeviceId(id); savePrefs();
    Object.keys(voices).forEach(function(k) { applySink(voices[k]); });
    render(true);
}
function applySink(v) {   // the voice plays on the chosen speakers; one gone since plays on the default
    if (!v || !v.audio || !canPickOutput()) return;
    v.audio.setSinkId(prefs.output || '').catch(function() { if (prefs.output) v.audio.setSinkId('').catch(function() {}); });
}

/* ---------- the voices this machine plays: profile id -> { pid, name, gm, track, audio, level } ---------- */
var voices = Object.create(null);
var audioCtx = null;
function ctx() {
    if (!audioCtx) { try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; } }
    if (audioCtx && audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch (e) {} }
    return audioCtx;
}
function applyVoice(v) {
    if (!v || !v.audio) return;
    v.audio.muted = me.deaf || prefs.mutes[v.pid] === true;
    v.audio.volume = own(prefs.vols, v.pid) ? prefs.vols[v.pid] : 1;
}
function own(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
// One voice played here (a remote track): an audio element plays it — the engine's echo canceling hears what elements play — and
// a meter reads its level for the speaking dot
function voicePlay(pid, name, gm, track) {
    var v = voices[pid];
    if (v && v.track === track) { v.name = name; v.gm = gm; return; }
    if (v) voiceDrop(pid);
    var audio = new Audio(); audio.autoplay = true;
    audio.srcObject = new MediaStream([track]);
    var p = audio.play(); if (p && p.catch) p.catch(function() {});
    v = voices[pid] = { pid: pid, name: name, gm: gm, track: track, audio: audio, level: 0 };
    applyVoice(v); applySink(v);
    meterAdd(pid, audio.srcObject);
    render(true);
}
function voiceDrop(pid) {
    var v = voices[pid]; if (!v) return;
    delete voices[pid];
    try { v.audio.pause(); v.audio.srcObject = null; } catch (e) {}
    meterDrop(pid);
    render(true);
}
function voicesClear() { Object.keys(voices).forEach(voiceDrop); }

/* ---------- speaking dots: one analyser per voice (and one for this machine's own microphone) ---------- */
var meters = Object.create(null), meterTimer = null;
function meterAdd(key, stream) {
    meterDrop(key);
    var c = ctx(); if (!c) return;
    try {
        var src = c.createMediaStreamSource(stream), an = c.createAnalyser(); an.fftSize = 512;
        src.connect(an);   // analyzed only: never connected to the speakers (the audio element plays it)
        meters[key] = { src: src, an: an, buf: new Float32Array(an.fftSize), on: false, quiet: 0 };
    } catch (e) { return; }
    if (!meterTimer) meterTimer = setInterval(meterTick, 100);
}
function meterDrop(key) {
    var m = meters[key]; if (!m) return;
    delete meters[key];
    try { m.src.disconnect(); } catch (e) {}
    if (!Object.keys(meters).length && meterTimer) { clearInterval(meterTimer); meterTimer = null; }
}
function meterTick() {
    var changed = false;
    Object.keys(meters).forEach(function(k) {
        var m = meters[k], sum = 0;
        m.an.getFloatTimeDomainData(m.buf);
        for (var i = 0; i < m.buf.length; i++) sum += m.buf[i] * m.buf[i];
        var loud = speaking(Math.sqrt(sum / m.buf.length));
        if (k === 'me' && !micOpen()) loud = false;
        if (loud) m.quiet = 0; else m.quiet++;
        var on = loud || (m.on && m.quiet < 3);   // a dot stays lit through a short breath
        if (on !== m.on) { m.on = on; changed = true; }
    });
    if (changed) renderDots();
}
function lit(key) { return !!(meters[key] && meters[key].on); }

/* ================= the host: the hub ================= */
// srcs: the voices the hub forwards — key ('gm' or a player's peer key) -> { key, pid, name, gm, track }
// links: peer key -> { id, pc, peer, pid, name, upTx, sent: src key -> transceiver, free: [transceiver], busy, again, ice, early: [cand], timer }
var hub = { srcs: Object.create(null), links: Object.create(null), asks: null };
function linkOf(peer) { return own(hub.links, peer) ? hub.links[peer] : null; }
function connOf(peer) { var n = netOf(); return n && n.conns ? n.conns.filter(function(c) { return c.open && c.peer === peer; })[0] || null : null; }
function hubSay(ln, m) {   // a word to one player about their link
    var c = connOf(ln.peer); if (!c) return;
    m.type = 'voice'; m.id = ln.id;
    try { c.send(m); } catch (e) { try { console.warn('voice send failed', e); } catch (_) {} }
}
function rosterOf(peer) { var n = netOf(); return n && n.roster && own(n.roster, peer) ? n.roster[peer] : null; }
function memberCount() { return Object.keys(hub.srcs).length; }
// Whose voice each line of this link is, by its mid: the lines that send, and only those
function whoOf(ln) {
    var who = {};
    Object.keys(ln.sent).forEach(function(k) {
        var tx = ln.sent[k], s = hub.srcs[k];
        if (s && tx && tx.mid) who[tx.mid] = { pid: s.pid, name: s.name, gm: s.gm };
    });
    return who;
}
// The link's next offer, or one more once the one out is answered
function offerTo(ln) {
    if (linkOf(ln.peer) !== ln) return;
    if (ln.busy) { ln.again = true; return; }
    ln.busy = true; ln.again = false;
    var pc = ln.pc;
    pc.createOffer().then(function(o) { return pc.setLocalDescription(o); }).then(function() {
        if (linkOf(ln.peer) !== ln) return;
        // the mids are set now: the map goes with the offer, so the player knows each line before its sound arrives
        var who = whoOf(ln), w = {};
        Object.keys(who).forEach(function(mid) { w[mid] = who[mid]; });
        hubSay(ln, { act: 'offer', sdp: pc.localDescription.sdp, who: w });
        if (ln.timer) clearTimeout(ln.timer);
        ln.timer = setTimeout(function() { ln.timer = null; if (linkOf(ln.peer) === ln && ln.busy) linkDrop(ln.peer, true); }, 20000);   // never answered: the link goes, and the player is told
    }).catch(function() { linkDrop(ln.peer, true); });
}
// One voice onto one link: a line it left before if there is one, else a new line
function attach(ln, s) {
    if (ln.sent[s.key] || s.key === ln.peer) return false;
    var tx = ln.free.pop() || null;
    try {
        if (tx) { tx.sender.replaceTrack(s.track); tx.direction = 'sendonly'; }
        else tx = ln.pc.addTransceiver(s.track, { direction: 'sendonly' });
    } catch (e) { return false; }
    ln.sent[s.key] = tx;
    try { var p = tx.sender.getParameters(); if (p && p.encodings && p.encodings[0]) { p.encodings[0].maxBitrate = 40000; tx.sender.setParameters(p).catch(function() {}); } } catch (e) {}   // speech: Opus needs little; the host sends one copy of every voice to every member
    return true;
}
function detach(ln, key) {
    var tx = ln.sent[key]; if (!tx) return false;
    delete ln.sent[key];
    try { tx.sender.replaceTrack(null); tx.direction = 'inactive'; } catch (e) {}
    ln.free.push(tx);
    return true;
}
// A voice joins the hub: every other link carries it
function srcAdd(s) {
    var was = hub.srcs[s.key]; if (was && was.track === s.track) return;   // the same voice again (a renegotiation's track event)
    if (was) srcDrop(s.key);
    hub.srcs[s.key] = s;
    Object.keys(hub.links).forEach(function(p) { var ln = hub.links[p]; if (attach(ln, s)) offerTo(ln); });
    if (!s.gm && me.on) voicePlay(s.pid, s.name, false, s.track);   // the GM hears it here, once in voice themself
    render(true);
}
function srcDrop(key) {
    var s = hub.srcs[key]; if (!s) return;
    delete hub.srcs[key];
    Object.keys(hub.links).forEach(function(p) { var ln = hub.links[p]; if (detach(ln, key)) offerTo(ln); });
    if (!s.gm) voiceDrop(s.pid);
    render(true);
}
// A new link to one admitted player who asked to join voice
function linkUp(conn) {
    var pr = rosterOf(conn.peer); if (!pr || typeof pr.id !== 'string') return;
    linkDrop(conn.peer, false);
    // one voice per player: a link on an older connection of theirs goes
    Object.keys(hub.links).forEach(function(p) { if (hub.links[p].pid === pr.id) linkDrop(p, false); });
    if (memberCount() >= LIMITS.members) { hubSay({ id: newId(), peer: conn.peer }, { act: 'full' }); return; }
    var pc;
    try { pc = new RTCPeerConnection(rtcConfig()); } catch (e) { return; }
    var ln = { id: newId(), pc: pc, peer: conn.peer, pid: pr.id, name: cleanName(pr.name), upTx: null, sent: {}, free: [], busy: false, again: false, ice: 0, early: [], timer: null };
    try { ln.upTx = pc.addTransceiver('audio', { direction: 'recvonly' }); } catch (e) { try { pc.close(); } catch (_) {} return; }   // the first line: their microphone, up
    hub.links[conn.peer] = ln;
    Object.keys(hub.srcs).forEach(function(k) { attach(ln, hub.srcs[k]); });
    pc.ontrack = function(e) {
        if (linkOf(ln.peer) !== ln || !e || e.transceiver !== ln.upTx || !e.track) return;
        srcAdd({ key: ln.peer, pid: ln.pid, name: ln.name, gm: false, track: e.track });
    };
    pc.onicecandidate = function(e) { var cd = e && e.candidate ? cleanCand(e.candidate) : null; if (cd) hubSay(ln, { act: 'ice', cand: cd }); };
    pc.onconnectionstatechange = function() { if (linkOf(ln.peer) === ln && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) linkDrop(ln.peer, true); };
    offerTo(ln);
}
function linkDrop(peer, tell) {
    var ln = linkOf(peer); if (!ln) return;
    delete hub.links[peer];
    if (ln.timer) clearTimeout(ln.timer);
    srcDrop(peer);
    if (tell) hubSay(ln, { act: 'bye' });
    try { ln.pc.ontrack = null; ln.pc.onicecandidate = null; ln.pc.onconnectionstatechange = null; ln.pc.close(); } catch (e) {}
}
function hubClear() {
    Object.keys(hub.links).forEach(function(p) { linkDrop(p, false); });
    Object.keys(hub.srcs).forEach(srcDrop);
}
function askAllowed(pid) {   // a player's join asks: a few, then one a second and a half
    if (!hub.asks) { var DC = window.wpDiceCore; if (!DC || !DC.RateLimit) return true; hub.asks = DC.RateLimit({ perMs: 1500, burst: 4, windowMs: 60000, table: 40 }); }
    return hub.asks.allow('$' + pid, Date.now()) === true;
}
// A player's word about voice (net.js has checked they are admitted): join, leave; answer and ice only for the link this connection holds
function fromPlayer(msg, conn) {
    if (!hosting() || !msg || !conn) return;
    var pr = rosterOf(conn.peer); if (!pr) return;
    if (msg.act === 'join') { if (askAllowed(pr.id)) linkUp(conn); return; }
    var ln = linkOf(conn.peer);
    if (!ln || msg.id !== ln.id) return;
    if (msg.act === 'leave') { linkDrop(conn.peer, false); return; }
    if (msg.act === 'answer') {
        var sdp = cleanSdp(msg.sdp); if (!ln.busy || !sdp) return;
        ln.pc.setRemoteDescription({ type: 'answer', sdp: sdp }).then(function() {
            if (linkOf(ln.peer) !== ln) return;
            if (ln.timer) { clearTimeout(ln.timer); ln.timer = null; }
            ln.busy = false;
            var early = ln.early; ln.early = [];
            early.forEach(function(cd) { ln.pc.addIceCandidate(cd).catch(function() {}); });
            if (ln.again) offerTo(ln);
        }).catch(function() { linkDrop(conn.peer, true); });
    } else if (msg.act === 'ice') {
        var cd = cleanCand(msg.cand); if (!cd || ++ln.ice > LIMITS.ice) return;
        if (!ln.pc.remoteDescription) { ln.early.push(cd); return; }   // before the first answer is in: kept for it
        ln.pc.addIceCandidate(cd).catch(function() {});
    }
}
function connGone(peer) { if (linkOf(peer)) linkDrop(peer, false); }

/* ================= a player: one link to the host ================= */
var up = null;   // { id, pc, who: mid -> { pid, name, gm }, ice, early: [cand], sent: bool }
var rejoins = 0;
function say(m) {   // a word to our GM about voice
    var n = netOf(); if (!atTable()) return false;
    m.type = 'voice-up';
    try { n.conns[0].send(m); } catch (e) { return false; }
    return true;
}
function upClose() {
    var u = up; up = null; if (!u) return;
    try { u.pc.ontrack = null; u.pc.onicecandidate = null; u.pc.onconnectionstatechange = null; u.pc.close(); } catch (e) {}
    voicesClear();
}
// Which voice each line is, after each description: lines named in `who` play, every other is silent
function syncLines() {
    if (!up) return;
    var seen = Object.create(null);
    up.pc.getTransceivers().forEach(function(tx) {
        var w = tx.mid && own(up.who, tx.mid) ? up.who[tx.mid] : null;
        if (!w || !tx.receiver || !tx.receiver.track) return;
        seen[w.pid] = 1;
        voicePlay(w.pid, w.name, w.gm, tx.receiver.track);
    });
    Object.keys(voices).forEach(function(pid) { if (!seen[pid]) voiceDrop(pid); });
}
function fromHost(msg) {
    if (!msg || typeof msg.act !== 'string') return;
    if (msg.act === 'bye' || msg.act === 'full') {
        if (up && msg.act === 'bye' && msg.id !== up.id) return;   // a bye for a link already replaced
        var wasOn = me.on; upClose();
        if (wasOn) { leave(true); me.error = msg.act === 'full' ? 'Voice is full at this table.' : 'Voice was disconnected.'; render(true); }
        return;
    }
    if (!isLinkId(msg.id)) return;
    if (msg.act === 'ice') {
        var cd = cleanCand(msg.cand); if (!up || up.id !== msg.id || !cd || ++up.ice > LIMITS.ice) return;
        if (!up.pc.remoteDescription) { up.early.push(cd); return; }
        up.pc.addIceCandidate(cd).catch(function() {});
        return;
    }
    if (msg.act !== 'offer') return;
    var sdp = cleanSdp(msg.sdp); if (!sdp) return;
    if (!me.on || !me.track) { say({ act: 'leave', id: msg.id }); return; }   // not in voice here (left while it was on its way)
    if (!up || up.id !== msg.id) {   // a new link: an older one goes first
        upClose();
        var pc;
        try { pc = new RTCPeerConnection(rtcConfig()); } catch (e) { me.error = 'This app cannot make a voice connection.'; leave(true); return; }
        up = { id: msg.id, pc: pc, who: {}, ice: 0, early: [], sent: false };
        var u = up;
        pc.onicecandidate = function(e) { var cd2 = e && e.candidate ? cleanCand(e.candidate) : null; if (cd2 && up === u) say({ act: 'ice', id: u.id, cand: cd2 }); };
        pc.ontrack = function() { if (up === u) syncLines(); };
        pc.onconnectionstatechange = function() {
            if (up !== u) return;
            if (pc.connectionState === 'connected') { rejoins = 0; me.joining = false; render(true); }
            else if (pc.connectionState === 'failed') { upClose(); if (me.on && rejoins++ < 3) setTimeout(function() { if (me.on && !up) say({ act: 'join' }); }, 2000); else if (me.on) { leave(true); me.error = 'Could not reach the GM for voice.'; render(true); } }
        };
    }
    var cur = up;
    cur.who = cleanWho(msg.who);
    cur.pc.setRemoteDescription({ type: 'offer', sdp: sdp }).then(function() {
        if (up !== cur) return null;
        if (!cur.sent) {   // the first line is ours to send on: the microphone goes up it
            var tx = cur.pc.getTransceivers()[0];
            if (tx) { tx.direction = 'sendonly'; tx.sender.replaceTrack(me.track); cur.sent = true; }
        }
        return cur.pc.createAnswer();
    }).then(function(a) {
        if (!a || up !== cur) return null;
        return cur.pc.setLocalDescription(a).then(function() {
            if (up !== cur) return;
            say({ act: 'answer', id: cur.id, sdp: cur.pc.localDescription.sdp });
            var early = cur.early; cur.early = [];
            early.forEach(function(cd3) { cur.pc.addIceCandidate(cd3).catch(function() {}); });
            syncLines();
        });
    }).catch(function() { if (up === cur) { upClose(); if (me.on) { leave(true); me.error = 'The voice connection failed.'; render(true); } } });
}

/* ================= joining and leaving (both sides) ================= */
function join() {
    if (me.on || me.joining || !tableOn()) return;
    me.joining = true; me.error = ''; render(true);
    ctx();   // inside the click: the engine lets sound start
    getMic().then(function(stream) {
        if (!me.joining || !tableOn()) { stream.getTracks().forEach(function(t) { t.stop(); }); me.joining = false; render(true); return; }
        me.mic = stream; me.track = stream.getAudioTracks()[0] || null;
        if (!me.track) throw new Error('No microphone found.');
        me.on = true; applyMic(); watchTrack(me.track);
        listDevices().then(function() { render(true); });   // the microphone is allowed now: the devices have their names
        meterAdd('me', stream);
        if (hosting()) {
            me.joining = false;
            var p = myProfile(), n = netOf();
            srcAdd({ key: 'gm', pid: (n && n.myId) || 'gm', name: cleanName(p.name ? p.name + ' (GM)' : 'GM'), gm: true, track: me.track });
            Object.keys(hub.srcs).forEach(function(k) { var s = hub.srcs[k]; if (!s.gm) voicePlay(s.pid, s.name, false, s.track); });
        } else {
            rejoins = 0;
            if (!say({ act: 'join' })) throw new Error('Not connected to the GM.');
        }
        render(true);
    }).catch(function(e) {
        me.joining = false;
        dropMic(); me.on = false;
        me.error = e && e.name === 'NotAllowedError' ? 'Microphone access was refused.' : e && e.name === 'NotFoundError' ? 'No microphone found.' : (e && e.message) || 'Could not start voice.';
        render(true);
    });
}
function leave(quiet) {
    var was = me.on || me.joining;
    me.on = false; me.joining = false; me.talking = false;
    if (hosting()) {
        srcDrop('gm');
        voicesClear();   // the GM hears nobody out of voice; the hub keeps forwarding the players to each other
    } else {
        if (up && !quiet) say({ act: 'leave', id: up.id });
        upClose();
    }
    dropMic();
    if (was) render(true);
}
function tableLeft() { hubClear(); upClose(); leave(true); me.error = ''; render(true); }
function tableReady() { if (me.on && !up) { rejoins = 0; say({ act: 'join' }); } }   // a reconnect: voice comes back by itself

/* ---------- mute, deafen, per-speaker ---------- */
function setMuted(on) { me.muted = !!on; applyMic(); }
function setDeaf(on) { me.deaf = !!on; Object.keys(voices).forEach(function(k) { applyVoice(voices[k]); }); applyMic(); }
function setMode(m) { prefs.mode = cleanMode(m); me.talking = false; savePrefs(); applyMic(); render(true); }
function setVol(pid, v) { v = cleanVol(v); if (v === 1) delete prefs.vols[pid]; else prefs.vols[pid] = v; savePrefs(); if (voices[pid]) applyVoice(voices[pid]); }
function setPeerMute(pid, on) { if (on) prefs.mutes[pid] = true; else delete prefs.mutes[pid]; savePrefs(); if (voices[pid]) applyVoice(voices[pid]); render(true); }

/* ---------- push to talk ---------- */
var binding = false;   // the next key or side button becomes the bind
function editable(t) { return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName || '')); }
function talk(on) { if (me.talking === on) return; me.talking = on; applyMic(); }
function onKeyDown(e) {
    if (binding) {
        e.preventDefault(); e.stopPropagation();
        binding = false;
        if (e.code !== 'Escape') { prefs.bind = cleanBind(e.code); savePrefs(); }
        render(true); return;
    }
    if (e.code === 'KeyM' && e.ctrlKey && e.shiftKey && !e.altKey && !e.metaKey) {   // quick mute: anywhere, a text box too
        if (me.on && !e.repeat) { e.preventDefault(); setMuted(!me.muted); }
        return;
    }
    if (!me.on || prefs.mode !== 'ptt' || e.code !== prefs.bind || e.repeat) return;
    if (editable(e.target) || e.ctrlKey || e.metaKey) return;   // typing in a box is typing, and Ctrl+V is a paste, not talking
    talk(true);
}
function onKeyUp(e) { if (me.talking && e.code === prefs.bind) talk(false); }
function onMouseDown(e) {
    var b = mouseBind(e.button); if (!b) return;
    if (binding) { e.preventDefault(); binding = false; prefs.bind = b; savePrefs(); render(true); return; }
    if (me.on && prefs.mode === 'ptt' && b === prefs.bind) { e.preventDefault(); talk(true); }
}
function onMouseUp(e) { if (me.talking && mouseBind(e.button) === prefs.bind) { e.preventDefault(); talk(false); } }
window.addEventListener('keydown', onKeyDown, true);
window.addEventListener('keyup', onKeyUp, true);
window.addEventListener('mousedown', onMouseDown, true);
window.addEventListener('mouseup', onMouseUp, true);
window.addEventListener('blur', function() { talk(false); });   // a key let go in another window never reaches this one: the microphone closes with the focus

/* ================= the indicator and its popover ================= */
// As Sound and Music do it (sound.js): an icon in the header's Table group (#voiceInd), shown while this app is at a table, and a
// small popover under it (#voicePop) that any click elsewhere puts away. The popover's body is built here, every name as text.
var popSig = '';
var SPEAKER = 'M3.5 9.5H7l5-4v13l-5-4H3.5zM15.5 9.3a4 4 0 0 1 0 5.4';   // Sound's own speaker, cut to one wave
function el(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text !== undefined) x.textContent = text; return x; }
function button(cls, text, title, fn) { var b = el('button', 'tool ghost' + (cls ? ' ' + cls : ''), text); b.type = 'button'; if (title) b.title = title; b.addEventListener('click', fn); return b; }
function icon(d) { var ns = 'http://www.w3.org/2000/svg', s = document.createElementNS(ns, 'svg'), p = document.createElementNS(ns, 'path'); s.setAttribute('class', 'ico'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); p.setAttribute('d', d); s.appendChild(p); return s; }
function tick(label, checked, title, fn) {   // one of the popover's rows: a checkbox and its words, as Sound's are
    var row = el('label', 'snd-pop-row'), c = el('input'); c.type = 'checkbox'; c.checked = !!checked;
    if (title) row.title = title;
    c.addEventListener('change', function() { fn(c.checked); });
    row.appendChild(c); row.appendChild(document.createTextNode(' ' + label));
    return row;
}
function popOpen() { var p = ui('voicePop'); return !!p && p.style.display !== 'none'; }
function popShut() { var p = ui('voicePop'); if (p) p.style.display = 'none'; if (binding) binding = false; }
// Escape, as esckey.js (the app's one router for the key) hands it on while the popover is up: a key being picked for push to talk is let
// go first and the popover stays; otherwise the popover is put away
function escape() { if (binding) { binding = false; render(true); return; } popShut(); }
function members() {   // who is listed: every voice this machine plays, then (the host) players still connecting
    var out = [];
    Object.keys(voices).forEach(function(pid) { var v = voices[pid]; out.push({ key: pid, pid: pid, name: v.name + (v.gm && v.name.indexOf('(GM)') < 0 ? ' (GM)' : '') }); });
    if (hosting()) Object.keys(hub.links).forEach(function(peer) {
        var ln = hub.links[peer]; if (!voices[ln.pid]) out.push({ key: '~' + ln.pid, pid: null, name: ln.name + ' (connecting)' });
    });
    return out;
}
function renderBody() {
    var body = ui('voiceBody'); body.textContent = '';
    if (!me.on) {
        if (!tableOn()) body.appendChild(el('div', 'voice-none', 'Voice works once you host a table or join one.'));   // 1.6.0: the row shows it with no table too
        var j = button('voice-join', me.joining ? 'Connecting…' : 'Join voice', 'Talk with the table: your microphone goes to everyone in voice', join);
        j.disabled = me.joining || !tableOn(); body.appendChild(j);
        devSection(body);   // chosen before joining, too
        return;
    }
    body.appendChild(tick('Mute my microphone', me.muted, 'Nobody hears you until you untick it. Quicker: right-click the microphone, or Ctrl+Shift+M', setMuted));
    body.appendChild(tick('Deafen', me.deaf, 'You hear nobody, and nobody hears you', setDeaf));
    var ptt = tick('Push to talk', prefs.mode === 'ptt', 'Your microphone is open only while you hold the key (while Waypoint is the window in front)', function(on) { setMode(on ? 'ptt' : 'open'); });
    if (prefs.mode === 'ptt') {
        var k = button('voice-bind' + (binding ? ' on' : ''), binding ? 'Press a key…' : bindLabel(prefs.bind), 'Change the key: click, then press a key or a mouse side button (Esc keeps this one)', function(e) { e.preventDefault(); binding = !binding; render(true); });
        ptt.appendChild(k);
    }
    body.appendChild(ptt);
    devSection(body);
    var ms = members(), list = el('div', 'voice-list');
    if (!ms.length) list.appendChild(el('div', 'voice-none', 'Nobody else is in voice yet.'));
    ms.forEach(function(mb) {
        var row = el('div', 'voice-row'); row.dataset.key = mb.key;
        row.appendChild(el('span', 'voice-dot'));
        var nm = el('span', 'voice-name', mb.name); nm.title = mb.name; row.appendChild(nm);
        if (mb.pid) {
            var pid = mb.pid, off = prefs.mutes[pid] === true;
            var vol = el('input', 'voice-vol'); vol.type = 'range'; vol.min = '0'; vol.max = '100';
            vol.value = String(Math.round((own(prefs.vols, pid) ? prefs.vols[pid] : 1) * 100));
            vol.title = mb.name + '’s volume, for you'; vol.setAttribute('aria-label', vol.title);
            vol.addEventListener('input', function() { setVol(pid, Number(vol.value) / 100); });
            var mb2 = button('icon voice-pmute' + (off ? ' off' : ''), undefined, off ? 'Unmute ' + mb.name + ' for you' : 'Mute ' + mb.name + ' for you', function() { setPeerMute(pid, !off); });
            mb2.appendChild(icon(SPEAKER)); mb2.setAttribute('aria-pressed', String(off));
            row.appendChild(vol); row.appendChild(mb2);
            if (window.wpUi) window.wpUi.typed(vol, { unit: '%' });   // 1.6.2: a slider's figure typed
        }
        list.appendChild(row);
    });
    body.appendChild(list);
    var foot = el('div', 'voice-foot');
    foot.appendChild(button('', 'Leave voice', 'Leave voice chat (the table goes on)', function() { leave(false); }));
    body.appendChild(foot);
}
// The devices, folded away until asked for: the microphone voice listens to and the speakers it plays on, each "System default"
// first. A device chosen here and not plugged in now stays chosen, named as missing, and the default is used meanwhile
function devPick(label, list, cur, fn, title) {
    var row = el('label', 'snd-pop-row voice-dev'); row.title = title;
    row.appendChild(el('span', 'voice-dev-name', label));
    var s = el('select', 'field voice-dev-pick');
    var d = el('option', '', 'System default'); d.value = ''; s.appendChild(d);
    list.forEach(function(x) { var o = el('option', '', x.name); o.value = x.id; s.appendChild(o); });
    if (cur && !list.some(function(x) { return x.id === cur; })) { var g = el('option', '', 'Not plugged in (using the default)'); g.value = cur; s.appendChild(g); }
    s.value = cur;
    s.addEventListener('change', function() { fn(s.value); });
    row.appendChild(s);
    return row;
}
function devSection(body) {
    body.appendChild(button('voice-devs', (devs.open ? '▾' : '▸') + ' Devices', 'Choose the microphone and the speakers voice uses on this computer', function() {
        devs.open = !devs.open;
        if (devs.open) listDevices().then(function() { render(true); });
        render(true);
    }));
    if (!devs.open) return;
    body.appendChild(devPick('Microphone', devs.inputs, prefs.input, setInput, 'The microphone the table hears'));
    if (canPickOutput()) body.appendChild(devPick('Speakers', devs.outputs, prefs.output, setOutput, 'Where you hear the table’s voices (your headset, say). Sound and Music keep to the system’s own'));
}
function renderDots() {
    var body = ui('voiceBody');
    if (body) Array.prototype.forEach.call(body.querySelectorAll('.voice-row'), function(r) { r.classList.toggle('talking', lit(r.dataset.key)); });
    var b = ui('voiceInd'); if (b) b.classList.toggle('talking', lit('me'));
}
function renderInd() {
    var b = ui('voiceInd'); if (!b) return;
    var table = tableOn() || me.on, on = table || !(window.wpStream || window.wpPopout);   // 1.6.0 (the owner, by prompt: "Show Voice when not hosting"): in the row with no table too, dimmed
    b.style.display = on ? '' : 'none';
    if (!on && popOpen()) popShut();
    var off = me.on && (me.muted || me.deaf);
    b.classList.toggle('in-voice', me.on);
    b.classList.toggle('mic-off', off);
    b.classList.toggle('no-table', !table);
    b.title = !table ? 'Voice — it works once you host a table or join one'
        : !me.on ? 'Voice — talk with the table'
        : (me.deaf ? 'Voice — deafened' : me.muted ? 'Voice — your microphone is muted' : prefs.mode === 'ptt' ? 'Voice — hold ' + bindLabel(prefs.bind) + ' to talk' : 'Voice — you are in voice')
          + '. Right-click or Ctrl+Shift+M to ' + (me.muted ? 'unmute' : 'mute');
}
function render(force) {
    renderInd();
    if (!popOpen()) return;
    var now = ui('voiceNow');
    if (now) now.textContent = stateWords({ joined: me.on, joining: me.joining, muted: me.muted, deaf: me.deaf, mode: prefs.mode, talking: me.talking, bind: prefs.bind, error: me.error });
    var sig = JSON.stringify([members(), prefs.mode, prefs.bind, prefs.mutes, me.on, me.joining, me.muted, me.deaf, binding, tableOn(), devs.open, devs.inputs, devs.outputs, prefs.input, prefs.output]);
    if (force || sig !== popSig) { popSig = sig; renderBody(); }   // a slider being dragged keeps its place: nothing it changes is in the signature
    renderDots();
}
(function wireInd() {
    var b = ui('voiceInd'), pop = ui('voicePop'); if (!b || !pop) return;
    b.addEventListener('click', function(e) {
        e.stopPropagation();
        if (popOpen()) { popShut(); return; }
        pop.style.display = 'block';
        var r = window.wpTopRow ? window.wpTopRow.box(b) : b.getBoundingClientRect();
        pop.style.left = Math.max(8, Math.min(window.innerWidth - 270, r.left - 110)) + 'px'; pop.style.top = (r.bottom + 6) + 'px';
        render(true);
    });
    b.addEventListener('contextmenu', function(e) { e.preventDefault(); if (me.on) setMuted(!me.muted); });   // quick mute: the right button on the icon
    document.addEventListener('pointerdown', function(e) {
        if (!popOpen() || e.target.closest('#voicePop') || e.target.closest('#voiceInd')) return;
        if (binding && mouseBind(e.button)) return;   // a side button pressed to become the push-to-talk key, not a click away
        popShut();
    }, true);
})();
// The table comes and goes without telling this module everything (a host's first player, a reconnect): look once a second
setInterval(function() {
    if ((me.on || up || Object.keys(hub.links).length) && !tableOn()) { tableLeft(); return; }
    render(false);
}, 1000);

window.wpVoice = { fromHost: fromHost, fromPlayer: fromPlayer, connGone: connGone, tableReady: tableReady, tableLeft: tableLeft, join: join, leave: leave, escape: escape, open: function() { var b = ui('voiceInd'); if (b && !popOpen()) b.click(); } };
render(true);
