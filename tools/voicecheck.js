/* Offline check of voice chat (1.5.9, pull request #1 by Hydragal): the pure half (system/app/scripts/voicecore.js), imported and run,
   and the links themselves (system/app/scripts/voice.js), loaded whole on a page of plain objects with stub peer connections, a stub
   microphone and a clock of the suite's own: the host's hub (a join from an admitted player makes a link, the rate limit, the members
   cap answering full, an answer or a candidate only for the link the connection holds, a connection gone dropping its link, every voice
   forwarded to every other member and named in the offer's map) and the player's link (a hostile host's offer never opening the
   microphone while the player is not in voice, the offer's map cleaned, the host's bye and full, mute and deafen, what stays on this
   computer), the popover's Escape and its words as text alone. No browser, no network. Usage: node tools/voicecheck.js   (exit 1 on any failure) */
'use strict';
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const app = path.join(__dirname, '..', 'system', 'app');
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).replace(/[\\]/g, '/');
const read = f => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, NL);
const j = o => JSON.stringify(o);
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail !== undefined ? '  -> ' + String(typeof detail === 'string' ? detail : j(detail)).slice(0, 600) : '')); } }
const tick = async (n) => { for (let i = 0; i < (n || 30); i++) await Promise.resolve(); await new Promise(r => setImmediate(r)); };

const { loadVoice, voiceSrc } = require('./voicedom.js');

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log(NL + 'FAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    let V = null, D = null, err = null;
    try { V = await import(url('voicecore.js')); D = await import(url('dicecore.js')); } catch (e) { err = e; }
    check('voicecore loads in Node with no window, and so does the dice core whose limiter the hub uses', !!V && !!D && !err, err && err.message);
    if (!V) { console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const HOST = '<img src=x onerror=alert(1)>';

    /* ================= the pure half ================= */
    const C = { candidate: 'candidate:1 1 udp 2122260223 192.168.1.2 54321 typ host', sdpMid: '0', sdpMLineIndex: 0 };
    const cands = [V.cleanCand(C), V.cleanCand({ candidate: C.candidate, sdpMid: '0' }), V.cleanCand({ candidate: C.candidate, sdpMLineIndex: 3 }), V.cleanCand({ candidate: C.candidate }), V.cleanCand({ candidate: 'x' + C.candidate, sdpMid: '0' }),
        V.cleanCand({ candidate: C.candidate + '\r\na=x', sdpMid: '0' }), V.cleanCand({ candidate: 'candidate:' + 'x'.repeat(600), sdpMid: '0' }), V.cleanCand({ candidate: C.candidate, sdpMid: 'a b', sdpMLineIndex: 1 }), V.cleanCand({ candidate: C.candidate, sdpMLineIndex: 19 }),
        V.cleanCand({ candidate: C.candidate, sdpMLineIndex: 1.5 }), V.cleanCand({ candidate: C.candidate, sdpMLineIndex: -1 }), V.cleanCand([C]), V.cleanCand(null), V.cleanCand('candidate:1'), V.cleanCand({ candidate: 5, sdpMid: '0' }), V.cleanCand(Object.assign({ evil: HOST }, C))];
    check('cleanCand: a candidate travels as its one line and its media line only (by mid or by index, at least one), a line that is no candidate, holds a line break or a NUL, or runs past 600 is none, a mid of other characters and an index that is no whole number from 0 to 18 are dropped, and nothing else of the object rides along',
        j(cands) === j([C, { candidate: C.candidate, sdpMid: '0' }, { candidate: C.candidate, sdpMLineIndex: 3 }, null, null, null, null, { candidate: C.candidate, sdpMLineIndex: 1 }, null, null, null, null, null, null, null, C]), j(cands));
    const sdps = [V.cleanSdp('v=0\r\no=-'), V.cleanSdp('v=0' + 'x'.repeat(29997)), V.cleanSdp('v=0' + 'x'.repeat(29998)), V.cleanSdp(' v=0'), V.cleanSdp(''), V.cleanSdp(null), V.cleanSdp(['v=0']), V.cleanSdp({ sdp: 'v=0' })];
    check('cleanSdp: a session description is a text of at most 30,000 characters that begins as one does; anything else is none', j(sdps) === j(['v=0\r\no=-', 'v=0' + 'x'.repeat(29997), null, null, null, null, null, null]), j(sdps.map(s => s && s.length)));
    const ids = ['0123456789abcdef', '0123456789ABCDEF', '0123456789abcde', '0123456789abcdef0', 'g123456789abcdef', '', null, 1234567890123456, ['0123456789abcdef']].map(V.isLinkId);
    check('isLinkId: a link is named by sixteen lower-case hex digits and nothing else', j(ids) === j([true, false, false, false, false, false, false, false, false]), j(ids));
    const names = [V.cleanName('Ann'), V.cleanName('  Ann  '), V.cleanName('A\u0000n\u001fn\u007f'), V.cleanName('Ann‮evil‬'), V.cleanName('​A‎n‏n⁦⁩﻿'), V.cleanName('x'.repeat(60)), V.cleanName(''), V.cleanName('   '), V.cleanName(null), V.cleanName(7), V.cleanName({}), V.cleanName(HOST)];
    check('cleanName: control characters, the zero-width and direction marks and a byte-order mark go, the name is trimmed and cut to 40, a name that is none or empty reads Player, and markup is left as the text it is (it reaches the page as text)',
        j(names) === j(['Ann', 'Ann', 'Ann', 'Annevil', 'Ann', 'x'.repeat(40), 'Player', 'Player', 'Player', 'Player', 'Player', HOST]) && V.LIMITS.name === 40, j(names));
    const proto = JSON.parse('{"__proto__":{"pid":"u_x","name":"P"},"constructor":{"pid":"u_y"},"0":{"pid":"u_a","name":"Ann","gm":true},"1":{"pid":"toString","name":"T"},"2":{"pid":"u b"},"a b":{"pid":"u_c"},"3":{"pid":"u_d","name":"' + 'y'.repeat(70) + '","gm":"yes","extra":1},"4":null,"5":"u_e","' + 'm'.repeat(17) + '":{"pid":"u_f"}}');
    const who = V.cleanWho(proto), whoKeys = Object.keys(who).sort();
    const many = {}; for (let i = 0; i < 30; i++) many['m' + i] = { pid: 'u_' + i, name: 'N' + i };
    const whoMany = V.cleanWho(many);
    check('cleanWho: the offer\'s map of whose voice each line is keeps a mid of the engine\'s own shape with a profile id, a cleaned name and gm only as true, in a map with no prototype, where even a mid spelled as a prototype\'s key is a key like any other; a bad mid, a bad or inherited profile id, an entry that is no object and anything else an entry carries go; nothing reaches Object.prototype; at most 16 entries are kept; a map that is none, a list or a text is empty',
        Object.getPrototypeOf(who) === null && j(whoKeys) === j(['0', '3', '__proto__', 'constructor']) && j(who.__proto__) === j({ pid: 'u_x', name: 'P', gm: false }) && j(who['0']) === j({ pid: 'u_a', name: 'Ann', gm: true }) && j(who['3']) === j({ pid: 'u_d', name: 'y'.repeat(40), gm: false })
        && Object.keys(whoMany).length === 16 && V.LIMITS.members === 16 && [null, [1], 'x', 5].every(w => Object.keys(V.cleanWho(w)).length === 0) && ({}).pid === undefined, j([whoKeys, who]));
    const modes = ['open', 'ptt', 'PTT', '', null, 'auto', ['ptt']].map(V.cleanMode), vols = [0, 1, 0.5, 0.333, 2, -1, '0.4', 'x', NaN, Infinity, null].map(V.cleanVol);
    check('cleanMode and cleanVol: open mic or push to talk, anything else open mic; a volume is a share of full from 0 to 1 in hundredths, held there, and what is no number full',
        j(modes) === j(['open', 'ptt', 'open', 'open', 'open', 'open', 'open']) && j(vols) === j([0, 1, 0.5, 0.33, 1, 0, 0.4, 1, 1, 1, 0]), j([modes, vols]));
    const volsIn = JSON.parse('{"u_a":0.5,"u_b":1,"u_c":"0.2","__proto__":0.1,"constructor":0.3,"a b":0.2,"u_d":9}'), mutesIn = JSON.parse('{"u_a":true,"u_b":"true","u_c":1,"__proto__":true,"toString":true,"u_d":true}');
    const bigV = {}; for (let i = 0; i < 300; i++) bigV['u_' + i] = 0.5;
    check('cleanVols and cleanMutes: kept by profile id only (no prototype\'s key, no bad id), a volume of full is no entry, a mute only as true, at most 200 read, and a list or a text gives nothing',
        j(V.cleanVols(volsIn)) === j({ u_a: 0.5, u_c: 0.2 }) && j(V.cleanMutes(mutesIn)) === j({ u_a: true, u_d: true }) && Object.keys(V.cleanVols(bigV)).length === 200 && j(V.cleanVols([0.5])) === '{}' && j(V.cleanMutes('x')) === '{}' && j(V.cleanMutes(null)) === '{}',
        j([V.cleanVols(volsIn), V.cleanMutes(mutesIn)]));
    const binds = ['KeyV', 'KeyZ', 'Digit3', 'F12', 'F24', 'F25', 'Mouse3', 'Mouse4', 'Mouse0', 'Mouse1', 'Mouse2', 'Space', 'Backquote', 'NumpadEnter', 'Numpad7', 'Escape', 'Enter', 'MetaLeft', 'keyv', '', null, 5, 'KeyVV'].map(V.cleanBind);
    check('cleanBind: push to talk takes a key by its code or a mouse side button, never left, middle or right click, Escape, Enter or the system key; anything else is V',
        j(binds) === j(['KeyV', 'KeyZ', 'Digit3', 'F12', 'F24', 'KeyV', 'Mouse3', 'Mouse4', 'KeyV', 'KeyV', 'KeyV', 'Space', 'Backquote', 'NumpadEnter', 'Numpad7', 'KeyV', 'KeyV', 'KeyV', 'KeyV', 'KeyV', 'KeyV', 'KeyV', 'KeyV']), j(binds));
    const labels = ['KeyV', 'Digit7', 'Mouse3', 'Mouse4', 'Backslash', 'ShiftLeft', 'CapsLock', 'Numpad5', 'NumpadAdd', 'F5', 'Space', 'nope'].map(V.bindLabel);
    check('bindLabel: a key\'s words as a person reads them (V, 7, Mouse back and forward, the named keys, Num and the pad\'s key), and a bind that is none read as V',
        j(labels) === j(['V', '7', 'Mouse back', 'Mouse forward', '\\', 'Left Shift', 'Caps Lock', 'Num 5', 'Num Add', 'F5', 'Space', 'V']), j(labels));
    const devIds = ['', 'abc123', 'a+b/c=_.:-', 'default', 'x'.repeat(256), 'x'.repeat(257), 'a b', '<x>', null, 7].map(V.cleanDeviceId);
    check('cleanDeviceId: a device is the engine\'s own opaque id of plain characters, at most 256, and default or anything else is the system\'s default',
        j(devIds) === j(['', 'abc123', 'a+b/c=_.:-', '', 'x'.repeat(256), '', '', '', '', '']), j(devIds.map(d => d.length)));
    const devs = [{ kind: 'audioinput', deviceId: 'default', label: 'Default' }, { kind: 'audioinput', deviceId: 'm1', label: 'Desk mic' }, { kind: 'audioinput', deviceId: 'm1', label: 'again' }, { kind: 'audioinput', deviceId: 'm2', label: '' },
        { kind: 'audiooutput', deviceId: 's1', label: 'Headset' }, { kind: 'videoinput', deviceId: 'c1', label: 'Camera' }, { kind: 'audioinput', deviceId: 'bad id', label: 'x' }, { kind: 'audioinput', deviceId: 'm3', label: 'A\u0000B' + 'z'.repeat(90) }, null, 'x'];
    const dl = V.deviceList(devs, 'audioinput'), dlo = V.deviceList(devs, 'audiooutput');
    check('deviceList: the devices of one kind, the system\'s own default entry left out, each id once and only an id that cleans, a device with no name yet named by its place, a name cut to 80 with no control character; another kind and junk are passed over; a list that is none is empty',
        j(dl) === j([{ id: 'm1', name: 'Desk mic' }, { id: 'm2', name: 'Microphone 2' }, { id: 'm3', name: 'AB' + 'z'.repeat(78) }]) && j(dlo) === j([{ id: 's1', name: 'Headset' }]) && j(V.deviceList(null, 'audioinput')) === '[]', j([dl, dlo]));
    const mb = [0, 1, 2, 3, 4, 5, '3', null].map(V.mouseBind), sp = [0, 0.02, 0.0201, 0.5, '0.5', NaN, null].map(V.speaking);
    check('mouseBind and speaking: only the two side buttons are a bind; a level is speaking past 0.02 and only as a number', j(mb) === j([null, null, null, 'Mouse3', 'Mouse4', null, null, null]) && j(sp) === j([false, false, true, true, false, false, false]), j([mb, sp]));
    const sw = [{ error: 'Boom' }, { joining: true }, { joined: false }, { joined: true, deaf: true, muted: true }, { joined: true, muted: true }, { joined: true, mode: 'ptt', talking: true }, { joined: true, mode: 'ptt', bind: 'Mouse3' }, { joined: true, mode: 'open' }].map(V.stateWords);
    check('stateWords: what the popover says of this machine\'s voice, the error first, then connecting, out of voice, deafened before muted, push to talk with its key, and connected',
        j(sw) === j(['Boom', 'Connecting…', 'Not in voice', 'Deafened', 'Muted', 'Talking', 'Push to talk: hold Mouse back', 'Voice connected']), j(sw));
    const coreSrc = read('scripts/voicecore.js');
    check('voicecore is pure: no document, no storage, no network, no timer; it publishes the same calls it exports', !/document\.|localStorage|fetch\(|XMLHttpRequest|setTimeout|setInterval|RTCPeerConnection/.test(coreSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')) && /if \(typeof window !== 'undefined'\) window\.wpVoiceCore = API;/.test(coreSrc));

    /* ================= the host's hub ================= */
    const H = loadVoice(V, { role: 'host', dice: D, profile: { name: 'Gina' } }), A = H.conn('peerA', 'u_a', 'Ann'), B = H.conn('peerB', 'u_b', HOST), X = H.conn('peerX', null);
    check('voice.js loads whole on the page of plain objects, wires itself and publishes its calls; the microphone is shown while this machine hosts a table', typeof H.win.wpVoice.fromPlayer === 'function' && typeof H.win.wpVoice.escape === 'function' && H.els.voiceInd.style.display === '' && H.world.markup === 0);
    {   // 1.6.0 (the owner, by prompt: "Show Voice when not hosting")
        const N = loadVoice(V, { role: 'host', dice: D, net: { active: false } }), b = N.els.voiceInd;
        check('with no table open the microphone stays in the row, dimmed, and says it works once you host or join; with a table it is not dimmed',
            b.style.display === '' && b.classList.contains('no-table') && b.title === 'Voice: it works once you host a table or join one' && !H.els.voiceInd.classList.contains('no-table'), j([b.style.display, b.className, b.title]));
    }
    H.api.fromPlayer({ type: 'voice-up', act: 'join' }, A); await tick();
    const lnA = H.api.hub.links.peerA, pcA = H.world.pcs[0], offA = A.sent[0];
    check('a join from an admitted player makes one link on that connection: one peer connection, with the table\'s own ICE servers, whose first line takes the player\'s microphone up; the host offers, with a link id of sixteen hex digits and a map of who each line is (none yet); the player\'s name is cleaned; nothing goes to anyone else',
        !!lnA && H.world.pcs.length === 1 && j(pcA.cfg) === j({ iceServers: [{ urls: 'stun:stun.example:3478' }] }) && pcA.tx[0].direction === 'recvonly' && lnA.upTx === pcA.tx[0] && lnA.pid === 'u_a' && lnA.name === 'Ann'
        && !!offA && offA.type === 'voice' && offA.act === 'offer' && /^[0-9a-f]{16}$/.test(offA.id) && offA.id === lnA.id && /^v=0/.test(offA.sdp) && j(offA.who) === '{}' && B.sent.length === 0 && X.sent.length === 0, j([offA, H.world.pcs.length]));
    H.api.fromPlayer({ type: 'voice-up', act: 'join' }, X); await tick();
    check('a join from a connection that is not on the roster makes nothing and answers nothing (net.js has closed such a connection before; voice.js asks the roster again)', H.world.pcs.length === 1 && X.sent.length === 0 && !H.api.hub.links.peerX);
    // an answer, and the candidates, only for the link this connection holds
    H.api.fromPlayer({ type: 'voice-up', act: 'answer', id: 'f'.repeat(16), sdp: 'v=0\r\nanswer\r\n' }, A); await tick();
    const wrongId = [lnA.busy, pcA.remoteDescription];
    H.api.fromPlayer({ type: 'voice-up', act: 'answer', id: lnA.id, sdp: 'v=0\r\nanswer\r\n' }, B); await tick();
    const otherConn = [lnA.busy, pcA.remoteDescription];
    H.api.fromPlayer({ type: 'voice-up', act: 'ice', id: lnA.id, cand: C }, A); await tick();
    const early = [lnA.early.length, pcA.cands.length];
    H.api.fromPlayer({ type: 'voice-up', act: 'answer', id: lnA.id, sdp: '<script>' }, A); await tick();
    const badSdp = lnA.busy;
    H.api.fromPlayer({ type: 'voice-up', act: 'answer', id: lnA.id, sdp: 'v=0\r\nanswer\r\n' }, A); await tick();
    const answered = [lnA.busy, !!pcA.remoteDescription, pcA.cands.length, lnA.early.length];
    H.api.fromPlayer({ type: 'voice-up', act: 'ice', id: lnA.id, cand: { candidate: 'evil' } }, A); H.api.fromPlayer({ type: 'voice-up', act: 'ice', id: lnA.id, cand: C }, A); await tick();
    for (let i = 0; i < 100; i++) H.api.fromPlayer({ type: 'voice-up', act: 'ice', id: lnA.id, cand: C }, A);
    await tick();
    check('an answer is taken only for the link the connection holds, by its id, while an offer is out, and only as a description: another id, another connection and a text that is none change nothing; a candidate before the answer is kept for it and added once it is in; a candidate that is none is dropped; at most 80 candidates a link',
        j(wrongId) === j([true, null]) && j(otherConn) === j([true, null]) && j(early) === j([1, 0]) && badSdp === true && j(answered) === j([false, true, 1, 0]) && pcA.cands.length === 80 && V.LIMITS.ice === 80, j([wrongId, otherConn, early, badSdp, answered, pcA.cands.length]));
    // the GM joins voice; the player's voice comes up; a second player joins and is offered both
    H.api.join(); await tick();
    const gmIn = [H.api.me.on, !!H.api.hub.srcs.gm, H.api.hub.srcs.gm && H.api.hub.srcs.gm.name, H.world.gum.length, H.world.gum[0] && j(H.world.gum[0])];
    const reOffer = A.sent.filter(m => m.act === 'offer');
    H.api.fromPlayer({ type: 'voice-up', act: 'answer', id: lnA.id, sdp: 'v=0\r\nanswer\r\n' }, A); await tick();
    pcA.ontrack({ transceiver: pcA.tx[0], track: { kind: 'audio', id: 'micA' } }); await tick();
    pcA.ontrack({ transceiver: pcA.tx[1], track: { kind: 'audio', id: 'notA' } }); await tick();
    H.world.clock += 2000; H.api.fromPlayer({ type: 'voice-up', act: 'join' }, B); await tick();
    const lnB = H.api.hub.links.peerB, offB = B.sent.filter(m => m.act === 'offer').pop();
    const whoB = offB ? Object.keys(offB.who).map(k => offB.who[k]).sort((x, y) => (x.pid < y.pid ? -1 : 1)) : null;
    check('every voice goes to every other member and is named in the offer: the GM in voice is a voice of the hub, named as the GM, and the player\'s link is offered again with the GM\'s line named; only the player\'s own first line is their voice, a track on any other line is none; a second player is offered both voices, each line named by profile id and cleaned name (a hostile name kept as the text it is), and their own voice is never sent back to them; each forwarded line is held to speech\'s bitrate; the GM hears the player',
        j(gmIn) === j([true, true, 'Gina (GM)', 1, j({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false })]) && reOffer.length === 2 && j(Object.values(reOffer[1].who)) === j([{ pid: 'u_gm', name: 'Gina (GM)', gm: true }])
        && !!H.api.hub.srcs.peerA && Object.keys(H.api.hub.srcs).length === 2 && !!lnB && j(whoB) === j([{ pid: 'u_a', name: 'Ann', gm: false }, { pid: 'u_gm', name: 'Gina (GM)', gm: true }]) && !lnB.sent.peerB
        && Object.keys(lnB.sent).every(k => lnB.sent[k].sender.params && lnB.sent[k].sender.params.encodings[0].maxBitrate === 40000) && !!H.api.voices.u_a && H.api.voices.u_a.audio.srcObject.ts[0].id === 'micA',
        j([gmIn, reOffer.length, whoB, Object.keys(H.api.hub.srcs)]));
    // the popover's words: a hostile name as text alone
    H.els.voiceInd.click(); await tick();
    const rows = H.els.voiceBody.querySelectorAll('.voice-row'), nameEls = H.els.voiceBody.querySelectorAll('.voice-name');
    check('the popover draws every name as a text node in an element made by name: the player whose name is markup is listed by that very text, in its words and its tooltip (still connecting, and said so), and no markup is written anywhere, no element the name names is made',
        H.api.popOpen() && rows.length >= 2 && nameEls.some(e => e.textContent === 'Ann') && nameEls.some(e => e.textContent === HOST + ' (connecting)' && e.kids.length === 0 && e.title === HOST + ' (connecting)') && H.world.markup === 0 && !H.world.made.some(e => e.tag === 'IMG' || e.tag === 'SCRIPT'), j([rows.length, nameEls.map(e => e.textContent)]));
    // Escape: a key being picked first, then the popover
    H.api.binding(true); H.api.escape(); const esc1 = [H.api.binding(), H.api.popOpen()]; H.api.escape(); const esc2 = H.api.popOpen();
    check('Escape, as the router hands it on (wpVoice.escape): a key being picked for push to talk is let go first and the popover stays; the next puts the popover away', j(esc1) === j([false, true]) && esc2 === false, j([esc1, esc2]));
    // one voice per player; the connection gone; the members cap; the rate limit; an offer never answered
    const B2 = H.conn('peerB2', 'u_b', 'Bram'); H.world.clock += 2000; H.api.fromPlayer({ type: 'voice-up', act: 'join' }, B2); await tick();
    const onePer = [!H.api.hub.links.peerB, !!H.api.hub.links.peerB2, lnB.pc.closed];
    H.api.connGone('peerA'); await tick();
    const gone = [!H.api.hub.links.peerA, pcA.closed, !H.api.hub.srcs.peerA, !H.api.voices.u_a, A.sent.filter(m => m.act === 'bye').length];
    check('one voice per player: a join on another connection of the same player drops the older link; a connection gone drops its link at once, its voice gone from the hub and from what the GM hears, with no word sent on a closed connection',
        j(onePer) === j([true, true, true]) && j(gone) === j([true, true, true, true, 0]), j([onePer, gone]));
    const F = loadVoice(V, { role: 'host', dice: D }), fc = [];
    for (let i = 0; i < 16; i++) F.api.hub.srcs['k' + i] = { key: 'k' + i, pid: 'u_k' + i, name: 'K', gm: false, track: {} };
    const Fc = F.conn('peerF', 'u_f', 'Fay'); F.api.fromPlayer({ type: 'voice-up', act: 'join' }, Fc); await tick();
    fc.push(F.world.pcs.length, Fc.sent.length && Fc.sent[0].act, Fc.sent.length && /^[0-9a-f]{16}$/.test(Fc.sent[0].id), !F.api.hub.links.peerF);
    const L = loadVoice(V, { role: 'host', dice: D }), Lc = L.conn('peerL', 'u_l', 'Lee'), lim = [];
    for (let i = 0; i < 6; i++) { L.api.fromPlayer({ type: 'voice-up', act: 'join' }, Lc); await tick(); lim.push(L.world.pcs.length); }
    L.world.clock += 1600; L.api.fromPlayer({ type: 'voice-up', act: 'join' }, Lc); await tick(); lim.push(L.world.pcs.length);
    for (let i = 0; i < 5; i++) { L.world.clock += 1600; L.api.fromPlayer({ type: 'voice-up', act: 'join' }, Lc); await tick(); } lim.push(L.world.pcs.length);
    L.world.clock += 61000; L.api.fromPlayer({ type: 'voice-up', act: 'join' }, Lc); await tick(); lim.push(L.world.pcs.length);
    const N = loadVoice(V, { role: 'host', noLimit: true }), Nc = N.conn('peerN', 'u_n', 'Ned');
    N.api.fromPlayer({ type: 'voice-up', act: 'join' }, Nc); await tick(); const pcN = N.world.pcs[0]; const firedN = N.fire(); await tick();
    check('the members cap: a join past 16 voices is answered full and makes no link; the rate limit: a player\'s joins are one a second and a half and four a minute, by profile id; an offer that is never answered drops its link after 20 seconds and tells the player bye',
        j(fc) === j([0, 'full', true, true]) && j(lim) === j([1, 1, 1, 1, 1, 1, 2, 4, 5]) && firedN >= 1 && pcN.closed === true && !N.api.hub.links.peerN && Nc.sent.some(m => m.act === 'bye') && N.world.timers.some(t => t.ms === 20000), j([fc, lim, firedN]));
    H.api.fromPlayer({ type: 'voice-up', act: 'leave', id: 'f'.repeat(16) }, B2); const leaveWrong = !!H.api.hub.links.peerB2;
    H.api.fromPlayer({ type: 'voice-up', act: 'leave', id: H.api.hub.links.peerB2.id }, B2); const leaveRight = !H.api.hub.links.peerB2;
    check('a player\'s leave is taken only for the link the connection holds, by its id', leaveWrong === true && leaveRight === true);
    const Pl = loadVoice(V, { role: 'client', net: { role: 'client' } });
    Pl.api.fromPlayer({ type: 'voice-up', act: 'join' }, Pl.conn('gm-peer', 'u_gm', 'GM')); await tick();
    check('a player\'s app has no hub: a player\'s word handed to it makes nothing', Pl.world.pcs.length === 0 && Object.keys(Pl.api.hub.links).length === 0);

    /* ================= a player's link ================= */
    const mkP = o => { const W = loadVoice(V, Object.assign({ role: 'client', net: { role: 'client' } }, o || {})); W.gm = W.conn('gm-peer'); return W; };
    const OFFER = (id, lines, whoMap) => ({ type: 'voice', act: 'offer', id, sdp: 'v=0\r\nlines=' + lines + '\r\n', who: whoMap || {} });
    const ID = '0123456789abcdef', ID2 = 'fedcba9876543210';
    const Q = mkP(); Q.api.fromHost(OFFER(ID, 3, { 1: { pid: 'u_gm', name: 'GM', gm: true } })); await tick();
    check('a hostile host\'s offer to a player who has not joined voice never opens the microphone: no peer connection is made, the microphone is never asked for, and the GM is told this player is not in voice',
        Q.world.pcs.length === 0 && Q.world.gum.length === 0 && j(Q.gm.sent) === j([{ act: 'leave', id: ID, type: 'voice-up' }]) && Q.api.me.on === false, j(Q.gm.sent));
    const S = mkP(); S.api.fromHost({ type: 'voice', act: 'ice', id: ID, cand: C }); S.api.fromHost({ type: 'voice', act: 'offer', id: 'nope', sdp: 'v=0' }); S.api.fromHost({ type: 'voice', act: 'zzz' }); S.api.fromHost(null); S.api.fromHost({ type: 'voice' }); await tick();
    check('a host\'s word that is no offer, names no link or names none of the right shape does nothing', S.world.pcs.length === 0 && S.world.gum.length === 0 && S.gm.sent.length === 0);
    const P = mkP(); P.api.join(); await tick();
    const joined = [P.api.me.on, P.world.gum.length, j(P.gm.sent)];
    const hostileWho = JSON.parse('{"1":{"pid":"u_gm","name":"Gina (GM)","gm":true},"2":{"pid":"u_b","name":"' + HOST.replace(/"/g, '\\"') + '"},"__proto__":{"pid":"u_x"},"9":{"pid":"toString"}}');
    P.api.fromHost(OFFER(ID, 3, hostileWho)); await tick();
    const pcP = P.world.pcs[0], ans = P.gm.sent.filter(m => m.act === 'answer');
    check('in voice, the GM\'s offer makes one peer connection with the table\'s ICE servers; the first line carries the microphone up and nothing else does; the answer goes to the GM under the offer\'s own link id; each line the cleaned map names plays its voice, under its name, and a line the map does not name, or names by a bad entry, plays nothing',
        j(joined) === j([true, 1, j([{ act: 'join', type: 'voice-up' }])]) && P.world.pcs.length === 1 && j(pcP.cfg) === j({ iceServers: [{ urls: 'stun:stun.example:3478' }] }) && pcP.tx[0].direction === 'sendonly' && pcP.tx[0].sender.track === P.api.me.track
        && pcP.tx.slice(1).every(t => t.sender.track === null) && ans.length === 1 && ans[0].id === ID && /^v=0/.test(ans[0].sdp) && j(Object.keys(P.api.voices).sort()) === j(['u_b', 'u_gm']) && P.api.voices.u_b.name === HOST && P.api.voices.u_gm.gm === true && P.world.audios.length === 2,
        j([joined, ans, Object.keys(P.api.voices)]));
    P.api.fromHost({ type: 'voice', act: 'ice', id: ID2, cand: C }); P.api.fromHost({ type: 'voice', act: 'ice', id: ID, cand: { candidate: 'x' } }); P.api.fromHost({ type: 'voice', act: 'ice', id: ID, cand: C }); await tick();
    const iceP = pcP.cands.length;
    P.api.setMuted(true); const muted = P.api.me.track.enabled; P.api.setMuted(false); const unmuted = P.api.me.track.enabled;
    P.api.setDeaf(true); const deaf = [P.api.me.track.enabled, P.api.voices.u_b.audio.muted, P.api.voices.u_gm.audio.muted]; P.api.setDeaf(false);
    P.api.setPeerMute('u_b', true); P.api.setVol('u_gm', 0.25); const peer = [P.api.voices.u_b.audio.muted, P.api.voices.u_gm.audio.volume, P.api.voices.u_gm.audio.muted];
    const kept = [P.world.store.wp_voice_mutes, P.world.store.wp_voice_vols], toldGm = P.gm.sent.map(m => m.act).join();
    P.api.setMode('ptt'); const ptt0 = P.api.me.track.enabled; P.key({ code: 'KeyV' }); const ptt1 = P.api.me.track.enabled; P.key({ code: 'KeyV', target: { tagName: 'INPUT' } });
    (P.world.winL.keyup || []).forEach(f => f({ code: 'KeyV' })); const ptt2 = P.api.me.track.enabled; P.api.setMode('open');
    P.key({ code: 'KeyM', ctrlKey: true, shiftKey: true }); const quick = P.api.me.muted; P.key({ code: 'KeyM', ctrlKey: true, shiftKey: true, repeat: true }); const quickRep = P.api.me.muted; P.key({ code: 'KeyM', ctrlKey: true, shiftKey: true }); const quick2 = P.api.me.muted;
    check('a candidate is taken only for the link of the offer, and only as a candidate; Mute closes the microphone, Deafen closes it and silences every voice; a person\'s mute and volume change only that voice here and are kept on this computer, by profile id, never sent; push to talk opens the microphone only while its key is held and not while a box is typed in; Ctrl+Shift+M mutes and unmutes at once, a held key once',
        iceP === 1 && muted === false && unmuted === true && j(deaf) === j([false, true, true]) && j(peer) === j([true, 0.25, false]) && j(kept) === j(['{"u_b":true}', '{"u_gm":0.25}']) && toldGm === 'join,answer'
        && ptt0 === false && ptt1 === true && ptt2 === false && quick === true && quickRep === true && quick2 === false, j([iceP, deaf, peer, kept, toldGm, ptt0, ptt1, ptt2, quick, quickRep, quick2]));
    P.api.fromHost({ type: 'voice', act: 'bye', id: ID2 }); await tick(); const byeWrong = [P.api.me.on, pcP.closed];
    P.api.fromHost({ type: 'voice', act: 'bye', id: ID }); await tick(); const byeRight = [P.api.me.on, pcP.closed, Object.keys(P.api.voices).length, P.api.me.error, P.api.me.track];
    const Fu = mkP(); Fu.api.join(); await tick(); Fu.api.fromHost({ type: 'voice', act: 'full', id: ID }); await tick();
    check('the GM\'s bye is taken only for the link it names, and then voice ends here: the link closed, the voices silent, the microphone let go, and said; full ends a join with its own words',
        j(byeWrong) === j([true, false]) && j(byeRight) === j([false, true, 0, 'Voice was disconnected.', null]) && Fu.api.me.on === false && Fu.api.me.error === 'Voice is full at this table.' && Fu.world.lastMic.t.stopped === true, j([byeWrong, byeRight, Fu.api.me.error]));
    const Off = mkP({ net: { role: 'client', foreign: false } }); Off.api.join(); await tick();
    const Stm = mkP({ net: { role: 'client', stream: true } }); Stm.api.join(); await tick();
    const Den = mkP({ noMic: true }); Den.api.join(); await tick();
    check('a player not at a table yet (before the snapshot) and the stream window never join, nor ask for the microphone; a microphone refused says so and leaves nothing open',
        Off.world.gum.length === 0 && Off.gm.sent.length === 0 && Stm.world.gum.length === 0 && Stm.gm.sent.length === 0 && Den.api.me.on === false && Den.api.me.error === 'Microphone access was refused. You can still listen.' /* 1.6.3 (finding 21): and says Listen only is there, moved on purpose */ && Den.gm.sent.length === 0, j([Off.world.gum.length, Stm.world.gum.length, Den.api.me.error]));
    // 1.6.3 (the improvement week's review of multiplayer, finding 21; Fulllion, 2026-11-21: a Listen only button, offered by itself when there is no
    // microphone). voice.js run for real on its page of plain objects: a player with no microphone hears the table and sends nothing up
    {
        const btns = W => W.els.voiceBody.querySelectorAll('.voice-join').map(b => b.textContent);
        Den.els.voiceInd.click(); await tick(); const denBtns = btns(Den);
        const Ok = mkP(); Ok.els.voiceInd.click(); await tick(); const okBtns = btns(Ok);
        const L = mkP({ noMic: true }); L.api.join(true); await tick();
        const lIn = [L.api.me.on, L.api.me.listen, L.world.gum.length, j(L.gm.sent)];
        L.api.fromHost(OFFER(ID, 3, { 1: { pid: 'u_gm', name: 'GM', gm: true }, 2: { pid: 'u_b', name: 'Bo' } })); await tick();
        const pcL = L.world.pcs[0], ansL = L.gm.sent.filter(m => m.act === 'answer');
        const lLink = [!!pcL, pcL && pcL.tx[0].direction, pcL && pcL.tx.every(t => t.sender.track === null), ansL.length, j(Object.keys(L.api.voices).sort())];
        L.els.voiceInd.click(); await tick(); const lWords = L.els.voiceBody.querySelectorAll('.voice-none').map(e => e.textContent), lTicks = L.els.voiceBody.textContent;
        L.api.leave(false); await tick(); const lOut = [L.api.me.on, L.api.me.listen];
        const HL = loadVoice(V, { role: 'host', dice: D, profile: { name: 'Gina' } }), aL = HL.conn('peerA', 'u_a', 'Ann');
        HL.api.join(true); await tick(); HL.api.fromPlayer({ type: 'voice-up', act: 'join' }, aL); await tick();
        const hlIn = [HL.api.me.on, HL.api.me.listen, HL.world.gum.length, !!HL.api.hub.srcs.gm];
        check('1.6.3 finding 21 (voice.js run for real): a microphone refused offers Listen only by itself, and a player with a microphone is offered Join voice and Listen only; Listen only asks for no microphone, tells the GM to join, answers the offer with its first line sending nothing and plays every voice; the popover says nobody hears you and offers no mute or push to talk; leaving ends it; the GM listening only adds no voice of their own to the hub',
            j(denBtns) === j(['Listen only']) && j(okBtns) === j(['Join voice', 'Listen only']) && j(lIn) === j([true, true, 0, j([{ act: 'join', type: 'voice-up' }])])
            && j(lLink) === j([true, 'inactive', true, 1, j(['u_b', 'u_gm'])]) && lWords.includes('You are listening only. Nobody hears you.') && !/Mute my microphone|Push to talk/.test(lTicks) && j(lOut) === j([false, false])
            && j(hlIn) === j([true, true, 0, false]) && V.stateWords({ joined: true, listen: true }) === 'Listening only',
            j({ denBtns, okBtns, lIn, lLink, lWords, lOut, hlIn }));
    }
    // 1.6.3 (found at the hand check of the two multiplayer lanes joined): a player who listens only sends no voice up, so no track comes, and the
    // GM's list said they were connecting for as long as they stayed. Once their link is up the list says they listen only
    {
        const HQ = loadVoice(V, { role: 'host', dice: D, profile: { name: 'Gina' } }), aQ = HQ.conn('peerA', 'u_a', 'Ann');
        HQ.api.join(true); await tick(); HQ.api.fromPlayer({ type: 'voice-up', act: 'join' }, aQ); await tick();
        HQ.els.voiceInd.click(); await tick(); const before = HQ.els.voiceBody.textContent;
        const pcQ = HQ.world.pcs[0]; pcQ.connectionState = 'connected'; if (typeof pcQ.onconnectionstatechange === 'function') pcQ.onconnectionstatechange(); await tick();
        const after = HQ.els.voiceBody.textContent;
        check('1.6.3 (the two multiplayer lanes joined): the GM\'s list says a player whose link is not up yet is connecting, and once it is up with no voice come, that they listen only',
            /Ann \(connecting\)/.test(before) && /Ann \(listening only\)/.test(after) && !/Ann \(connecting\)/.test(after), j({ before, after }));
    }

    /* ================= the page ================= */
    const ix = read('index.html');
    check('the page loads voicecore before voice.js, once each, after the video module; the microphone is a control of the top row\'s Table group after Music, put away until a table is on, and its popover is in the page once with its two parts',
        ix.indexOf('<script type="module" src="scripts/video.js"></script>\n<script type="module" src="scripts/voicecore.js"></script>\n<script type="module" src="scripts/voice.js"></script>\n') > 0
        && /<button class="tool ghost icon row-badge-host" id="musicInd"[^\n]*\n\s*<button class="tool ghost icon row-badge-host" id="voiceInd" title="Voice: talk with the table" style="display:none;">/.test(ix) && read('style.css').includes(NL + '.row-badge-host { position: relative; }') /* 1.6.4 (Fulllion, 2026-11-25, "Move the inline styles"): the style moved to the style sheet, moved on purpose */
        && (ix.match(/ id="voicePop"/g) || []).length === 1 && /<div id="voicePop" style="display:none;" role="dialog" aria-label="Voice">\n\s*<div id="voiceNow" class="snd-now" role="status"><\/div>\n\s*<div id="voiceBody"><\/div>\n\s*<\/div>/.test(ix));
    const vs = voiceSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    check('voice.js writes no markup, sends only its two words over the table\'s connection, never offers as a player and never answers as the host, and keeps what it keeps under its own keys of this computer',
        !/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(vs) && (vs.match(/m\.type = '(voice|voice-up)';/g) || []).length === 2 && (vs.match(/createOffer\(/g) || []).length === 1 && (vs.match(/createAnswer\(/g) || []).length === 1
        && (vs.match(/setPref\('wp_voice_[a-z]+'/g) || []).length === 6 && !/Discord/.test(voiceSrc + coreSrc));

    summed = true;
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})().catch(function(e) { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exit(1); });
