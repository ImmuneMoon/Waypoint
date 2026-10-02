/* Fuzz check of the wire (system/app/scripts/net.js) against a malicious peer — item 24 R2, the inside-Waypoint half.
   The WHOLE of net.js is loaded (never sliced): its five import lines are replaced by stubs handed in as parameters, its
   `export { net }` becomes `return net`, and the module runs on a stub window / document / localStorage / Peer that record
   every DOM sink, toast, dialog, save and fetch. The real core modules (dicecore, systemcore, fogcore, formula, safecore,
   videocore, calendarcore, librarycore, fxcore, soundcore, musiccore, docrender, vtt, state) are imported for real, so the
   rate limiters, the cleaners and the character system are the app's own. A host world (two maps, one fogged, characters
   with a GM-only field, a hidden token, a trap tile, two admitted players, one waiting peer, strangers) and a client world
   (synced to a stub host) are driven through net._handleMessage with, per message type, a well-formed example and a seeded
   series of mutations (missing / mistyped fields, 1e6-char strings, deep nesting, arrays for objects, numbers past 2^53,
   NaN / Infinity, prototype keys as values and as keys, a flood of 500, replays, out-of-order sequences, a peer that lies).
   Oracles: an exception escaping the handler, a state write outside the sender's rights, a save or fetch a message should
   not cause, a raw hostile string in a markup sink, a dialog raised more than once per type by one peer, prototype
   pollution, an unbounded string kept or drawn, a message past 200 ms. A finding is a failure; identical findings are
   folded into one line with a count (the first message that produced it, and its mutation, printed under it). The
   well-formed example of each kind is also checked to take effect, so a probe reaches the real path and not a gate in
   front of it. The clock is the suite's own: it moves 1.5 s between probes (a limiter judges none of them twice) and
   stands still through a flood.
   Not covered here: fog.js (no module: wpFog is a stub that drops every creature but the player's own on a fogged map),
   sheets.js / library.js / sound.js / music.js / fx.js / video.js / handouts.js (stubs that record their calls, so what
   those modules do with a hostile word is their own suites' business), DOMParser (none under node: the rich-text
   sanitiser falls back to escaping everything, so a text item's markup is not exercised), the real PeerJS packer (an
   emulation of BinaryPack's refusals), a video showing (no RTCPeerConnection media), a GM's second connection from one
   peer id, and the outside half of item 24 (Electron, IPC, the local HTTP server, the updater, WebRTC itself).
   The two known players are admitted through the real key proof: the host challenges each hello with a nonce (the auth message) and the
   suite answers as the player's app does, with HMAC-SHA256(key, 'wp-auth|' + nonce + '|' + the room id dialled) computed by Node's own
   crypto, so the host's WebCrypto check is judged against an independent implementation; the player's app's own answer is checked the same way.
   The GM's signing key (trust on first use) is judged the same way: each known player's hello carries a nonce, and the snapshot the host signs
   over it is verified by Node's own ECDSA; the private half is looked for in every send. On the player's side the real join is run — a first
   join, an automatic reconnect, a join that walks every generation of the code — against hosts the suite builds with Node's own key pairs: a
   snapshot is taken only when an independent reading of what the app knew (its pins, its room codes) and of the signature says so.
   The suite is diagnostic: it exits 1 while it has findings and is not in the CI matrix.
   SKIP_KNOWN below marks a finding the owner has accepted (an exact prefix of its FAIL or FINDING line, with the reason): such a line is
   printed as accepted and counted apart, and the run still exits 1 for any red line not in it.
   Run: node tools/fuzzcheck.js */
'use strict';
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url'), nodeCrypto = require('crypto');
const ROOT = path.join(__dirname, '..', 'system', 'app', 'scripts');
const CANARY = '<svg onload=FUZZCANARY>';   // raw in a markup sink = a finding (escaped it reads &lt;svg…)
const BIG = 'B'.repeat(1e6);
const T0 = Date.now();
/* Accepted findings: [{ prefix: 'FINDING   <kind> — <detail>' or 'FAIL      <check name>', why: 'one line' }]. Empty until the owner accepts one. */
const SKIP_KNOWN = [];
function acceptedBy(line) { return SKIP_KNOWN.find(s => s && typeof s.prefix === 'string' && s.prefix && line.indexOf(s.prefix) === 0) || null; }
/* the table-key proof, as the player's app computes it (hmacHex in net.js over WebCrypto), here by Node's crypto: the two must agree */
const proofFor = (key, nonce, room) => nodeCrypto.createHmac('sha256', key).update('wp-auth|' + nonce + '|' + room).digest('hex');
/* the GM's signing key: what a snapshot's signature covers, Node's own ECDSA to verify what the host's WebCrypto signs, and a host of the suite's own making */
const snapText = (cn, room, gmId, key) => 'wp-snap|' + cn + '|' + room + '|' + gmId + '|' + key;
const sigOk = (pub, sig, text) => { try { return !!pub && typeof sig === 'string' && /^[0-9a-f]{128}$/.test(sig) && nodeCrypto.verify('sha256', Buffer.from(text), { key: nodeCrypto.createPublicKey({ key: { kty: pub.kty, crv: pub.crv, x: pub.x, y: pub.y }, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'hex')); } catch (e) { return false; } };
const mkSigner = () => { const kp = nodeCrypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }), j = kp.publicKey.export({ format: 'jwk' }); return { pub: { kty: j.kty, crv: j.crv, x: j.x, y: j.y }, sign: text => nodeCrypto.sign('sha256', Buffer.from(text), { key: kp.privateKey, dsaEncoding: 'ieee-p1363' }).toString('hex') }; };
const hasOwn = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
/* what a player's app should do with a snapshot, read independently of net.js: the room code is another GM's → refuse; a key is pinned for the GM
   named → take only on that key's signature over this connection's nonce, the room dialled, the GM id and the table key; nothing known → take */
function gmJudge(ls, msg, conn, code) {
    const rd = k => { try { const o = JSON.parse(ls[k] || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
    let gmId = ''; try { gmId = String(msg.gmId || (msg.notepad && msg.notepad.gmId) || '').slice(0, 80); } catch (e) { return 'refuse'; }
    const pins = rd('wp_gmPins'), rooms = rd('wp_gmRooms'), roomGm = hasOwn(rooms, 'c_' + code) ? rooms['c_' + code] : '', pin = hasOwn(pins, gmId) ? pins[gmId] : null;
    if (roomGm && roomGm !== gmId) return 'refuse';
    if (pin) return sigOk(pin, msg.sig, snapText(conn.wpCn, conn.peer, gmId, typeof msg.key === 'string' ? msg.key : '')) ? 'take' : 'refuse';
    return 'take';
}

/* ---------- a seeded generator (reproducible) ---------- */
let seed = 20261001;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }
function pick(a) { return a[Math.floor(rnd() * a.length)]; }

/* ---------- findings ---------- */
const found = new Map(); let checks = 0, checksFailed = 0, checksAccepted = 0, probes = 0;
function short(v) {
    let s; try { s = JSON.stringify(v, (k, x) => typeof x === 'string' && x.length > 60 ? '<' + x.length + ' chars>' : (typeof x === 'number' && !isFinite(x)) ? String(x) : x); } catch (e) { s = '<unserialisable: ' + e.message + '>'; }
    if (s === undefined) s = String(v);
    return s.length > 240 ? s.slice(0, 240) + '…' : s;
}
function finding(kind, detail, msg, mut) {
    const key = kind + ' | ' + detail;
    const f = found.get(key);
    if (f) { f.n++; return; }
    found.set(key, { kind, detail, n: 1, msg: (msg === undefined ? '' : short(msg)) + (mut ? '   [mutation: ' + mut + ']' : '') });
}
function findingLine(f) { return 'FINDING   ' + f.kind + ' — ' + f.detail; }
const openFindings = () => [...found.values()].filter(f => !acceptedBy(findingLine(f)));   // the findings not accepted: what the per-kind lines and the exit code count
function check(name, ok, detail) {
    checks++;
    if (ok) { console.log('ok        ' + name); return; }
    const line = 'FAIL      ' + name, acc = acceptedBy(line);
    if (acc) { checksAccepted++; console.log('accepted  ' + name + '  (' + acc.why + ')'); return; }
    checksFailed++; console.log(line + (detail !== undefined ? '  -> ' + (typeof detail === 'string' ? detail : short(detail)) : ''));
}

/* ---------- a fake clock and manual timers (nothing real fires; each message's timers are flushed by hand) ---------- */
const realNow = Date.now.bind(Date); let clockOff = 0; Date.now = () => realNow() + clockOff;
const realTimeout = globalThis.setTimeout;   // the one real timer the suite keeps: to wait for WebCrypto (the key proof is checked off the main thread)
async function settle(cond, max) { for (let i = 0; i < (max || 500); i++) { if (cond()) return true; await new Promise(r => realTimeout(r, 0)); } return cond(); }   // until the condition holds, a macrotask at a time (an HMAC lands in a few); bounded
const timers = { q: [], seq: 0, intervals: [] };
globalThis.setTimeout = function(fn, ms) { const id = ++timers.seq; timers.q.push({ id, fn, ms: Number(ms) || 0 }); return id; };
globalThis.clearTimeout = function(id) { timers.q = timers.q.filter(t => t.id !== id); };
globalThis.setInterval = function(fn, ms) { const id = ++timers.seq; timers.intervals.push({ id, fn, ms: Number(ms) || 0 }); return id; };
globalThis.clearInterval = function(id) { timers.intervals = timers.intervals.filter(t => t.id !== id); };
const flushed = { threw: [] };
function flushTimers() {
    for (let round = 0; round < 6 && timers.q.length; round++) {
        const q = timers.q.splice(0);
        q.forEach(t => { try { t.fn(); } catch (e) { flushed.threw.push(e); } });
    }
}
async function drain() { for (let i = 0; i < 6; i++) await new Promise(r => process.nextTick(r)); }

/* ---------- the stub page: every sink recorded ---------- */
const allConfirms = [];
const rec = { html: [], attr: [], text: [], style: [], toasts: [], confirms: [], saves: [], fetches: [], loads: 0, renders: 0, opens: [], warns: [], journal: [], blasts: 0, pics: [], gives: [], combatsOpened: [], reads: 0, cancels: 0 };   // reads / cancels: the stub server's bodies read whole, and cancelled unread
function resetRec() { Object.keys(rec).forEach(k => { if (Array.isArray(rec[k])) rec[k].length = 0; else rec[k] = 0; }); }
function mkEl(tag, id) {
    const el = { tagName: String(tag || 'div').toUpperCase(), id: id || '', children: [], _attrs: {}, _h: {}, dataset: {}, _text: '', _html: '', value: '', checked: false, disabled: false, scrollTop: 0, scrollHeight: 0, offsetParent: null, offsetWidth: 100, offsetHeight: 20, parentNode: null, nodeType: 1, nodeName: String(tag || 'div').toUpperCase(), className: '', hidden: false };
    el.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    const st = {}; st.setProperty = (k, v) => { st[k] = v; rec.style.push({ el: el.id, k, v: String(v) }); }; st.removeProperty = k => { delete st[k]; }; st.getPropertyValue = k => (st[k] === undefined ? '' : String(st[k]));
    el.style = new Proxy(st, { set(o, k, v) { o[k] = v; rec.style.push({ el: el.id, k, v: String(v) }); return true; } });
    Object.defineProperty(el, 'innerHTML', { get() { return el._html; }, set(v) { el._html = String(v); el.children = []; rec.html.push({ el: el.id, v: String(v) }); } });
    Object.defineProperty(el, 'outerHTML', { get() { return el._html; }, set(v) { rec.html.push({ el: el.id, v: String(v) }); } });
    Object.defineProperty(el, 'textContent', { get() { return el._text; }, set(v) { el._text = String(v); el.children = []; rec.text.push({ el: el.id, v: String(v) }); } });
    Object.defineProperty(el, 'innerText', { get() { return el._text; }, set(v) { el._text = String(v); rec.text.push({ el: el.id, v: String(v) }); } });
    Object.defineProperty(el, 'title', { get() { return el._attrs.title || ''; }, set(v) { el._attrs.title = String(v); rec.text.push({ el: el.id, v: String(v) }); } });
    ['src', 'href'].forEach(k => Object.defineProperty(el, k, { get() { return el._attrs[k] || ''; }, set(v) { el._attrs[k] = String(v); rec.attr.push({ el: el.id, k, v: String(v) }); } }));
    el.setAttribute = (k, v) => { el._attrs[k] = String(v); rec.attr.push({ el: el.id, k, v: String(v) }); };
    el.getAttribute = k => (el._attrs[k] === undefined ? null : el._attrs[k]); el.removeAttribute = k => { delete el._attrs[k]; }; el.hasAttribute = k => el._attrs[k] !== undefined;
    el.insertAdjacentHTML = (p, v) => { rec.html.push({ el: el.id, v: String(v) }); };
    el.addEventListener = (ev, fn) => { (el._h[ev] = el._h[ev] || []).push(fn); }; el.removeEventListener = () => {};
    el.click = () => { (el._h.click || []).forEach(f => f({ target: el, preventDefault() {}, stopPropagation() {} })); };
    el.appendChild = c => { el.children.push(c); if (c && typeof c === 'object') c.parentNode = el; return c; }; el.append = (...c) => c.forEach(x => el.appendChild(x)); el.prepend = el.append;
    el.insertBefore = (c) => el.appendChild(c); el.removeChild = c => c; el.remove = () => {}; el.replaceChildren = (...c) => { el.children = c; };
    el.querySelector = () => null; el.querySelectorAll = () => []; el.closest = () => null; el.contains = () => false; el.focus = () => {}; el.blur = () => {}; el.matches = () => false; el.scrollIntoView = () => {};
    el.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 20, right: 100, bottom: 20 }); el.cloneNode = () => mkEl(tag); el.dispatchEvent = () => true; el.getContext = () => null;
    return el;
}
const byId = new Map();
const document = {
    getElementById(id) { if (!byId.has(id)) byId.set(id, mkEl('div', id)); return byId.get(id); },
    createElement: t => mkEl(t), createElementNS: (ns, t) => mkEl(t), createDocumentFragment: () => mkEl('#fragment'), createTextNode: t => { rec.text.push({ el: '#text', v: String(t) }); return { nodeType: 3, textContent: String(t), nodeValue: String(t) }; },
    body: mkEl('body', 'body'), documentElement: mkEl('html', 'html'), head: mkEl('head', 'head'), addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
    querySelector: () => null, querySelectorAll: () => [], activeElement: null, hidden: false, visibilityState: 'visible', title: ''
};
function storage() { let m = {}; return { getItem: k => (Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: k => { delete m[k]; }, clear: () => { m = {}; }, dump: () => Object.assign({}, m), key: i => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; } }; }
const localStorage = storage(), sessionStorage = storage();
const location = { origin: 'http://localhost:3999', href: 'http://localhost:3999/', pathname: '/', search: '', hash: '', host: 'localhost:3999', protocol: 'http:', reload() {} };
const win = {
    document, localStorage, sessionStorage, location, navigator: { clipboard: null, userAgent: 'node' },
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; }, open(u) { rec.opens.push(String(u)); return null; },
    innerWidth: 1280, innerHeight: 800, devicePixelRatio: 1, getComputedStyle: () => ({ getPropertyValue: () => '' }), matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    requestAnimationFrame: fn => globalThis.setTimeout(fn, 16), cancelAnimationFrame: id => globalThis.clearTimeout(id),
    setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout, setInterval: globalThis.setInterval, clearInterval: globalThis.clearInterval,
    appRender() { rec.renders++; }, appToast(m) { rec.toasts.push(String(m)); }
};
win.window = win; win.self = win; win.top = win; win.parent = win;
globalThis.window = win; globalThis.document = document; globalThis.localStorage = localStorage; globalThis.sessionStorage = sessionStorage; globalThis.location = location;
try { Object.defineProperty(globalThis, 'navigator', { value: win.navigator, configurable: true, writable: true }); } catch (e) {}
globalThis.BroadcastChannel = class { constructor() {} postMessage() {} addEventListener() {} removeEventListener() {} close() {} };
if (typeof globalThis.CustomEvent === 'undefined') globalThis.CustomEvent = class CustomEvent extends Event { constructor(t, o) { super(t); this.detail = o && o.detail; } };
globalThis.RTCPeerConnection = class { constructor(cfg) { this.cfg = cfg; this.localDescription = null; rec.rtc = (rec.rtc || 0) + 1; } createDataChannel() { return { close() {} }; } createOffer() { return Promise.resolve({ type: 'offer', sdp: 'v=0\r\n' }); } createAnswer() { return Promise.resolve({ type: 'answer', sdp: 'v=0\r\n' }); } setLocalDescription(d) { this.localDescription = d; return Promise.resolve(); } setRemoteDescription() { return Promise.resolve(); } addIceCandidate() { return Promise.resolve(); } addTrack() {} getSenders() { return []; } close() {} addEventListener() {} };
globalThis.fetch = function(url, opts) {
    rec.fetches.push({ url: String(url), method: opts && opts.method || 'GET' });
    const u = String(url);
    if (/version/.test(u)) return Promise.resolve({ ok: true, json: () => Promise.resolve({ version: '1.5.0' }) });
    // the local server states every file's length (servefile.js): a picture of the budget probe (/saves/images/pN.png) states 1 MB, any other file its 4 bytes
    const stated = /\/saves\/images\/p\d+\.png$/.test(u) ? 1048576 : 4;
    return Promise.resolve({ ok: true, status: 200, headers: { get: h => (String(h).toLowerCase() === 'content-length' ? String(stated) : null) }, body: { cancel() { rec.cancels++; } }, json: () => Promise.resolve({}), text: () => Promise.resolve(''), arrayBuffer: () => { rec.reads++; return Promise.resolve(new Uint8Array([137, 80, 78, 71]).buffer); }, blob: () => Promise.resolve(new Blob([new Uint8Array([1, 2, 3])])) });
};
const warned = []; const realWarn = console.warn.bind(console), realError = console.error.bind(console);
console.warn = (...a) => { warned.push(a.map(x => (x && x.message) || String(x)).join(' ')); };
console.error = (...a) => { warned.push('ERROR ' + a.map(x => (x && x.message) || String(x)).join(' ')); };

/* ---------- the packer PeerJS uses (BinaryPack): what it refuses never reaches a peer ---------- */
function packCheck(v, depth) {
    depth = depth || 0; if (depth > 100000) throw new RangeError('pack: too deep');
    if (typeof v === 'number') { if (Math.floor(v) === v && (v > 18446744073709551615 || v < -9223372036854775808)) throw new Error('Invalid integer'); return; }
    if (typeof v === 'function') throw new Error('Type "function" not yet supported');
    if (v === null || typeof v !== 'object') return;
    if ('BYTES_PER_ELEMENT' in v && !ArrayBuffer.isView(v)) throw new Error('an object with BYTES_PER_ELEMENT is packed as an (empty) typed array');
    const C = v.constructor;
    if (C === undefined) throw new TypeError("Cannot read properties of undefined (reading 'toString')");
    if (Array.isArray(v)) { v.forEach(x => packCheck(x, depth + 1)); return; }
    if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer || C === Date) return;
    if (C !== Object) throw new Error('Type "' + String(C && C.name) + '" not yet supported');
    if (typeof v.hasOwnProperty !== 'function') throw new TypeError('obj.hasOwnProperty is not a function');
    for (const k in v) if (v.hasOwnProperty(k)) packCheck(v[k], depth + 1);
}

/* ---------- PeerJS stubs ---------- */
const peers = [];
class Conn {
    constructor(peer) { this.peer = peer; this.open = true; this._h = {}; this.sent = []; this.closedBy = 0; }
    on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); }
    emit(ev, ...a) { (this._h[ev] || []).forEach(f => f(...a)); }
    send(m) { packCheck(m); if (!this.open) throw new Error('connection closed'); this.sent.push(m); sentLog.push({ to: this.peer, m }); }
    close() { if (!this.open) return; this.open = false; this.closedBy++; this.emit('close'); }
}
const sentLog = [];
class PeerStub {
    constructor(id, opts) { if (typeof id === 'object') { opts = id; id = 'anon_' + peers.length; } this.id = id; this.opts = opts; this._h = {}; this.conns = []; peers.push(this); }
    on(ev, fn) { (this._h[ev] = this._h[ev] || []).push(fn); }
    emit(ev, ...a) { (this._h[ev] || []).forEach(f => f(...a)); }
    connect(id) { const c = new Conn(id); this.conns.push(c); return c; }
    destroy() { this.destroyed = true; } reconnect() {} disconnect() {}
}
globalThis.Peer = PeerStub;

/* ---------- loading net.js whole ---------- */
const netSrcRaw = fs.readFileSync(path.join(ROOT, 'net.js'), 'utf8').replace(/\r\n/g, '\n');
const importLines = netSrcRaw.match(/^import \{[^}]*\} from '\.\/[a-z]+\.js';[^\n]*$/gm) || [];
let body = netSrcRaw;
importLines.forEach(l => { body = body.replace(l, '// (import stubbed by fuzzcheck)'); });
const exportLine = body.match(/^export \{ net \};[^\n]*$/m);
body = body.replace(exportLine[0], 'return net;');
let factory;
try { factory = new Function('state', 'getActiveCampaign', 'findLandingRoom', 'landingPoint', 'getActiveMap', 'save', 'toast', 'load', 'updateCampaignSelect', 'updateSidebarNav', 'showConfirm', body); }
catch (e) { console.log('FAIL      net.js does not compile as one function: ' + e.message); console.log('0 passed, 1 failed.'); process.exit(1); }

/* ---------- the import stubs ---------- */
let stateMod = null;   // the real state.js module (shared with vtt.js)
const stubs = {
    getActiveCampaign() { const a = stateMod.state.appState; return a && a.campaigns && a.activeCampaignId && Object.prototype.hasOwnProperty.call(a.campaigns, a.activeCampaignId) ? a.campaigns[a.activeCampaignId] : null; },
    getActiveMap() { const c = stubs.getActiveCampaign(); const it = c && c.items && c.activeItemId ? c.items[c.activeItemId] : null; return it && it.type === 'map' ? it : null; },
    findLandingRoom() { return null; }, landingPoint() { return null; },
    save(sync) { const n = window.wpNet; const persist = !(n && (n.foreign || (n.active && n.role === 'client'))) && !(stateMod.state.appState && stateMod.state.appState._foreign); rec.saves.push({ sync: !!sync, persist }); if (n && n.onLocalSave) n.onLocalSave(); },
    toast(m) { rec.toasts.push(String(m)); }, load() { rec.loads++; },
    updateCampaignSelect() {}, updateSidebarNav() {},
    showConfirm(text, cb, opts) { const d = { text: String(text), cb, opts, answered: false }; rec.confirms.push(d); allConfirms.push(d); }
};

/* ---------- a stub fog (fog.js is no module: its per-recipient hooks are stubbed, judging by a fixed rule) ---------- */
function mkFogStub() {
    return {
        fogDropIds(pid, camp, map) { if (!map || !map.fog || map.fog.on !== true) return null; const d = {}; (map.whiteboard || []).forEach(w => { if (w && w.isChar && w.id !== 'tok_' + pid.slice(2) && !w.ownerId) d[w.id] = 1; }); return d; },   // a fogged map: a player sees no creature but their own
        sightSigFor() { return 'S'; }, fogLitFor() { return null; }, fogMarksFor() { return null; }, fogOffFor() { return null; },
        invalidateSeen() {}, invalidateVision() {}, redraw() {}, seenKeyOf(map, w) { return (Number(w.x) || 0) + ',' + (Number(w.y) || 0) + ',' + (Number(w.rot) || 0); },
        moveBlocked(map, w, x0, y0, x1, y1) { return x1 >= 600 && x1 < 610; },   // the wall at x 600..610
        lightCount() { return 0; }, lightMoves() { return false; }, marksForget() {}, canSeePoint() { return true; }, sightUnit() { return 'yd'; }
    };
}

/* ---------- the world ---------- */
const K1 = 'a'.repeat(32), K2 = 'b'.repeat(32);
function mkCampaign(SC, F) {
    const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hud-d20.json'), 'utf8'));
    fx.rolls.push({ id: 'r_heal', label: 'Heal', apply: [{ f: 'f_hp', formula: '2', add: true }] });
    fx.combat = { light: { presets: [{ name: 'Torch', bright: 2, dim: 4, unit: 'yd', pick: true }] } };
    const sys = SC.cleanSystem(fx, { F, gmView: true, libCats: {} });
    const tok = (id, o) => Object.assign({ id, type: 'circle', isChar: true, w: 50, h: 50, layer: 'middle' }, o);
    const camp = {
        id: 'c1', name: 'Fuzz Campaign', activeItemId: 'm_open', system: sys,
        players: { u_p1: { name: 'Ayla', key: K1 }, u_p2: { name: 'Bram', key: K2 } }, bannedPlayers: {}, sessionLog: [], turnRules: {},
        chars: {
            c_p1: { id: 'c_p1', name: 'Ayla', ownerId: 'u_p1', npc: false, values: { f_str: 14, f_dex: 12, f_gmfig: 7, f_hp: { cur: 10, max: 12 }, f_inv: [] }, updated: 1 },
            c_p2: { id: 'c_p2', name: 'Bram', ownerId: 'u_p2', npc: false, values: { f_str: 9, f_gmfig: 3 }, updated: 1 },
            c_npc: { id: 'c_npc', name: 'Orc', npc: true, values: { f_str: 16, f_gmfig: 99 }, updated: 1 }
        },
        items: {
            m_open: { id: 'm_open', type: 'map', meta: { title: 'Open Field', gridType: 'square' }, fog: { cell: 50 }, rooms: [], links: [], whiteboard: [
                tok('tok_p1', { charId: 'c_p1', ownerId: 'u_p1', charName: 'Ayla', name: 'Ayla', x: 100, y: 100 }),
                tok('tok_p2', { charId: 'c_p2', ownerId: 'u_p2', charName: 'Bram', name: 'Bram', x: 100, y: 300 }),
                tok('tok_p1plain', { ownerId: 'u_p1', charName: 'Plain', name: 'Plain', x: 100, y: 160 }),
                tok('tok_npc', { charId: 'c_npc', charName: 'Orc', name: 'Orc', x: 300, y: 300, fx: [{ id: 'x_1', n: 'Raging', i: 'icon:fire', on: 1 }] }),
                tok('tok_npc2', { charName: 'Goblin', name: 'Goblin', x: 350, y: 300 }), tok('tok_npc3', { charName: 'Wolf', name: 'Wolf', x: 400, y: 300 }), tok('tok_npc4', { charName: 'Bat', name: 'Bat', x: 450, y: 300 }),
                tok('tok_hidden', { charName: 'Assassin', name: 'Assassin', hidden: true, x: 400, y: 400, gmInfo: 'secret plan' }),
                { id: 'portal_vis', type: 'rect', targetMapId: 'm_fog', name: 'Stairs', x: 500, y: 500, w: 50, h: 50, layer: 'bottom' },
                { id: 'trap1', type: 'rect', hidden: true, trap: true, targetMapId: 'm_fog', x: 200, y: 100, w: 50, h: 50, layer: 'bottom' },
                { id: 'door1', type: 'rect', blocksSight: true, sightType: 'door', doorOpen: false, x: 150, y: 150, w: 50, h: 50 },
                { id: 'door_locked', type: 'rect', blocksSight: true, sightType: 'door', doorOpen: false, doorLock: true, x: 50, y: 150, w: 50, h: 50 },
                { id: 'wall1', type: 'rect', blocksSight: true, x: 600, y: 0, w: 10, h: 400 },
                { id: 'text1', type: 'text', text: '<b>Welcome</b>', x: 20, y: 20, w: 100, h: 30 },
                { id: 'note1', type: 'rect', gmNoteFor: 'tok_npc', x: 300, y: 260, w: 40, h: 20, gmInfo: 'the orc lies' },
                { id: 'light1', type: 'light', light: { bright: 2, dim: 4, unit: 'yd' }, x: 700, y: 700, w: 20, h: 20 },
                { id: 'img1', type: 'image', src: '/saves/images/pic.png', x: 700, y: 100, w: 100, h: 100, layer: 'bottom' }   // a picture the players are sent a reference to (the asset gate serves a connection only what it was sent)
            ] },
            m_fog: { id: 'm_fog', type: 'map', meta: { title: 'Dark Cellar', gridType: 'square' }, fog: { on: true, cell: 50 }, rooms: [], links: [], whiteboard: [
                tok('tok_far', { charName: 'Lurker', name: 'Lurker', x: 900, y: 900 }), tok('tok_p1b', { ownerId: 'u_p1', charName: 'Ayla', name: 'Ayla', charId: 'c_p1', x: 50, y: 50 }),
                tok('tok_p1pet', { ownerId: 'u_p1', charName: 'Pet', name: 'Pet', locked: true, x: 160, y: 100 })   // a token of theirs the GM locked: frozen for its player (on the cellar, so it does not keep them from leaving the open field through its door — the merged door rule)
            ] },
            d_notes: { id: 'd_notes', type: 'doc', meta: { title: 'Notes' }, blocks: [{ id: 'b1', type: 'p', text: 'Hello' }] },
            pl_1: { id: 'pl_1', type: 'planner', meta: { title: 'Plan' }, content: 'secret' }
        }
    };
    return camp;
}
const clone = o => JSON.parse(JSON.stringify(o));
const cloneMsg = o => { try { return structuredClone(o); } catch (e) { return clone(o); } };

/* ---------- oracles: a snapshot of what a peer may or may not have touched ---------- */
function snapOf(net) {
    try { return clone({ app: stateMod.state.appState, roster: net.roster, targets: net.targets || {}, combats: net.combats || {}, paused: net.paused, pausedPlayers: net.pausedPlayers, travelLocked: net.travelLocked, ls: localStorage.dump(), active: net.active, role: net.role, gmId: net.gmId || '' }); }
    catch (e) { return null; }   // JSON.stringify gave up (a structure too deep to save): the caller reports it
}
function depthOf(o) {   // the deepest nesting a structure holds, walked without recursion
    let best = 0; const stack = [[o, 1]];
    while (stack.length) { const [v, d] = stack.pop(); if (!v || typeof v !== 'object') continue; if (d > best) best = d; if (d > 5000) return d; for (const k of Object.keys(v)) stack.push([v[k], d + 1]); }
    return best;
}
const EMPTY_SNAP = { app: {}, roster: {}, targets: {}, combats: {}, ls: {} };
function diffInto(a, b, p, out) {
    if (a === b) return;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') { if (!(typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b))) out.push({ path: p, a, b }); return; }
    if (Array.isArray(a) || Array.isArray(b)) {
        if (!Array.isArray(a) || !Array.isArray(b)) { out.push({ path: p, a, b }); return; }
        const ids = x => x.length > 0 && x.every(e => e && typeof e === 'object' && typeof e.id === 'string');
        if (ids(a) && ids(b) || (a.length === 0 && ids(b)) || (b.length === 0 && ids(a))) {
            const A = new Map(a.map(e => [e.id, e])), B = new Map(b.map(e => [e.id, e]));
            A.forEach((e, id) => { if (!B.has(id)) out.push({ path: p + '[id=' + id + ']', a: e, b: undefined }); else diffInto(e, B.get(id), p + '[id=' + id + ']', out); });
            B.forEach((e, id) => { if (!A.has(id)) out.push({ path: p + '[id=' + id + ']', a: undefined, b: e }); });
            return;
        }
        for (let i = 0; i < Math.max(a.length, b.length); i++) diffInto(a[i], b[i], p + '[' + i + ']', out);
        return;
    }
    const keys = new Set(Object.keys(a).concat(Object.keys(b)));
    keys.forEach(k => diffInto(a[k], b[k], p + '.' + k, out));
}
function diffOf(a, b) { const out = []; diffInto(a, b, '', out); return out; }
const PROTO_NAMES = new Set(Object.getOwnPropertyNames(Object.prototype)), ARR_NAMES = new Set(Object.getOwnPropertyNames(Array.prototype));
function protoAdded() {   // the own names a message added to Object.prototype / Array.prototype, removed again so the next probe starts clean
    const added = Object.getOwnPropertyNames(Object.prototype).filter(k => !PROTO_NAMES.has(k)).map(k => 'Object.prototype.' + k).concat(Object.getOwnPropertyNames(Array.prototype).filter(k => !ARR_NAMES.has(k)).map(k => 'Array.prototype.' + k));
    added.forEach(k => { const m = k.match(/^(Object|Array)\.prototype\.(.+)$/); try { delete (m[1] === 'Object' ? Object : Array).prototype[m[2]]; } catch (e) {} });
    return added;
}
function longest(o, depth) {   // the longest string a structure holds (an unbounded value kept)
    depth = depth || 0; if (depth > 60) return 0;
    if (typeof o === 'string') return o.length;
    if (!o || typeof o !== 'object') return 0;
    let m = 0; for (const k of Object.keys(o)) { const l = longest(o[k], depth + 1); if (l > m) m = l; }
    return m;
}

/* ---------- mutation engine ---------- */
function deepNest(n) { let o = { a: 1 }; for (let i = 0; i < n; i++) o = { a: o }; return o; }
const inherited = () => Object.create({ hidden: true, locked: true, ownerId: 'u_p1', id: 'tok_p1', charId: 'c_p1', isChar: true, type: 'map' });
const ownProto = () => JSON.parse('{"__proto__": {"polluted": 1, "hidden": true}, "id": "x"}');
const HOSTILE = [null, true, false, 0, -1, 1.5, NaN, Infinity, -Infinity, 2 ** 53 + 1, 1e300, -1e300, '', 'x', BIG, CANARY, '__proto__', 'constructor', 'toString', 'hasOwnProperty', 'prototype', [], [1, 2, 3], [{}], {}, { id: '__proto__' }, deepNest(2000), inherited(), ownProto(), 'ab\u0000‮cd', '\ud83d'.repeat(3)];
const SMALL = [null, 'x', BIG, CANARY, '__proto__', 'constructor', -1, 2 ** 53 + 1, NaN, {}, [], inherited(), ownProto()];
function mutations(tpl) {
    const out = [];
    const base = () => cloneMsg(tpl);
    out.push({ name: 'well-formed', msg: cloneMsg(tpl) });
    Object.keys(tpl).forEach(k => {
        if (k === 'type') return;
        const m = base(); delete m[k]; out.push({ name: 'missing ' + k, msg: m });
        HOSTILE.forEach(h => { const m2 = base(); m2[k] = typeof h === 'object' && h !== null && !Array.isArray(h) && Object.getPrototypeOf(h) !== Object.prototype ? h : h; out.push({ name: k + '=' + short(h), msg: m2 }); });
        const v = tpl[k];
        if (v && typeof v === 'object' && !Array.isArray(v)) {
            Object.keys(v).forEach(sk => {
                const m3 = base(); delete m3[k][sk]; out.push({ name: 'missing ' + k + '.' + sk, msg: m3 });
                SMALL.forEach(h => { const m4 = base(); m4[k][sk] = h; out.push({ name: k + '.' + sk + '=' + short(h), msg: m4 }); });
                const sv = v[sk];
                if (sv && typeof sv === 'object' && !Array.isArray(sv)) Object.keys(sv).forEach(ssk => { SMALL.forEach(h => { const m5 = base(); m5[k][sk][ssk] = h; out.push({ name: k + '.' + sk + '.' + ssk + '=' + short(h), msg: m5 }); }); });
                if (Array.isArray(sv) && sv.length) { const m6 = base(); m6[k][sk] = Array.from({ length: 3000 }, () => clone(sv[0])); out.push({ name: k + '.' + sk + ' ×3000', msg: m6 }); SMALL.forEach(h => { const m7 = base(); m7[k][sk] = [h]; out.push({ name: k + '.' + sk + '=[' + short(h) + ']', msg: m7 }); }); if (sv[0] && typeof sv[0] === 'object') Object.keys(sv[0]).forEach(ek => { SMALL.forEach(h => { const m8 = base(); m8[k][sk][0][ek] = h; out.push({ name: k + '.' + sk + '[0].' + ek + '=' + short(h), msg: m8 }); }); }); }
            });
        }
        if (Array.isArray(v) && v.length) {
            const m9 = base(); m9[k] = Array.from({ length: 3000 }, () => clone(v[0])); out.push({ name: k + ' ×3000', msg: m9 });
            SMALL.forEach(h => { const m10 = base(); m10[k] = [h]; out.push({ name: k + '=[' + short(h) + ']', msg: m10 }); });
            if (v[0] && typeof v[0] === 'object') Object.keys(v[0]).forEach(ek => { SMALL.forEach(h => { const m11 = base(); m11[k][0][ek] = h; out.push({ name: k + '[0].' + ek + '=' + short(h), msg: m11 }); }); });
        }
    });
    [{}, 1, ['x'], tpl.type.toUpperCase(), tpl.type + ' ', '__proto__'].forEach(t => { const m = base(); m.type = t; out.push({ name: 'type=' + short(t), msg: m }); });
    const inh = Object.create(clone(tpl)); out.push({ name: 'every field inherited', msg: inh });   // a packed "__proto__" re-parents the decoded object
    const ap = clone(tpl); Object.defineProperty(ap, '__proto__', { value: { polluted: 1 }, enumerable: true, configurable: true, writable: true }); out.push({ name: 'own __proto__ key', msg: ap });
    return out;
}

/* ======================================================================================================= */
(async function main() {
    /* ---------- the real core modules ---------- */
    const imp = async f => (await import(pathToFileURL(path.join(ROOT, f)).href));
    stateMod = await imp('state.js');
    const skipped = [];
    for (const f of ['dicecore.js', 'formula.js', 'calendarcore.js', 'systemcore.js', 'fogcore.js', 'safecore.js', 'videocore.js', 'librarycore.js', 'fxcore.js', 'soundcore.js', 'musiccore.js', 'docrender.js', 'vtt.js']) {
        try { await imp(f); } catch (e) { skipped.push(f + ': ' + e.message); }
    }
    const SC = window.wpSystemCore, F = window.wpFormula, DC = window.wpDiceCore, FC = window.wpFogCore;
    check('the core modules load for real (dicecore, systemcore, fogcore, formula, vtt…)', !!(SC && F && DC && FC && window.wpVtt) && skipped.length === 0, skipped);

    const sheetsStub = () => ({
        playerSystem: camp => SC.cleanSystem(camp.system, { F, gmView: false, libCats: {} }), readablePages: () => [],
        charChanged() {}, charGone() {}, renderSheet() {}, sheetRefsChanged: () => false, tokenTurned() {}, uploadsChanged() {},
        applyCharFace(id, plan) { rec.pics.push({ id, plan: plan && plan.kind }); return Promise.resolve(true); }, applyTokenFace(mapId, wbId, plan) { rec.pics.push({ wbId, plan: plan && plan.kind }); return Promise.resolve(true); },
        giveCharacter(pid, cid, o) { rec.gives.push({ pid, cid }); }, sbFinder: () => null, playerFinder: () => null, charFromJson: () => null,
        bellNote() {}, editResult() {}, rollInit: () => ({ error: 'no dice here' }), rolled() {}, roundHook() {}, turnHook() {}, systemOf: () => null, tokenCtxFor: () => null
    });
    function installStubs() {
        Object.assign(window, {
            wpSheets: sheetsStub(), wpFog: mkFogStub(), wpVideo: { audienceChanged() {}, tableLeft() {}, onStream() {}, onStop() {}, onLost() {} },
            wpFx: { tableLeft() {}, onSnapshot() {}, receive() {}, foreign() {}, runningSet: () => [] },
            wpSound: { tableLeft() {}, onSnapshot() {}, onList() {}, onCue() {}, foreign() {}, listMessage: () => (window.wpNet && window.wpNet.role === 'host' ? { type: 'sounds', campId: 'c1', list: [{ id: 's1', name: 'Song', path: '/saves/images/audio/song.mp3', size: 4 }] } : null) },   // the hosted campaign's one sound, sent to each player as they are admitted: the reference the audio asset request names
            wpMusic: { tableLeft() {}, onSnapshot() {}, onList() {}, onControl() {}, controlSnapshot: () => null, listMessage: () => null, idSets: () => null },
            wpCalendar: { refresh() {}, rounds() {}, fightEnded() {} },
            wpDice: { renderCard: () => mkEl('div'), renderApply: () => mkEl('div'), renderDue: () => mkEl('div'), line: () => 'a roll', landed() {}, onDeny() {}, onRolled() {}, closePanel() {}, roll: () => ({}) },
            wpJournalReceive(m) { rec.journal.push(m); }, wpRenderSharedBlast() { rec.blasts++; }, wpClearSharedBlasts() {},
            wpSnapOn: () => true, wpSeatDrop: () => false, wpSeatCell() {}, wpHistFlush() {}, wpHistBarrier() {}, wpResetHistory() {},
            wpRenderCombatStrip() {}, wpRenderPartyStrip() {}, wpSettingsSync() {}, wpSheetsSync() {}, wpOpenCombat(mapId, o) { rec.combatsOpened.push(mapId); },
            wpDefaultAvatar: c => 'data:image/svg+xml,silhouette', wpAutoRoom: () => null, wpPlaceThrownBlast(b) { rec.blasts++; },
            wpDocReaderRefresh() {}, wpDocForeign() {}, wpDocGone() {}, wpHideWelcome() {}, wpJoinFailed() {}
        });
    }

    /* =================================================== HOST WORLD =================================================== */
    installStubs();
    localStorage.clear(); localStorage.setItem('wp_profile', JSON.stringify({ id: 'u_gm', name: 'GM', color: '#aabbcc' }));
    let net;
    try { net = factory(stateMod.state, stubs.getActiveCampaign, stubs.findLandingRoom, stubs.landingPoint, stubs.getActiveMap, stubs.save, stubs.toast, stubs.load, stubs.updateCampaignSelect, stubs.updateSidebarNav, stubs.showConfirm); }
    catch (e) { console.log('FAIL      net.js threw while loading whole: ' + (e.stack || e.message)); console.log(checks + ' passed, ' + (checksFailed + 1) + ' failed.'); process.exit(1); }
    check('net.js loads whole: wpNet set, the sandbox hook present, no stray console output', !!(net && net._handleMessage === net._handleMessage && window.wpNet === net && typeof net._handleMessage === 'function') && warned.length === 0, warned.slice(0, 3));
    await window.wpVersionReady; await drain();
    check('the version gate is live (APP_VERSION read from the stub /api/version)', window.wpAppVersion === '1.5.0');
    flushTimers();   // the 1.2 s rejoin probe (nothing stored: nothing happens)

    const camp0 = mkCampaign(SC, F);
    stateMod.state.appState = { activeCampaignId: 'c1', campaigns: { c1: camp0 } };
    const pristine = clone(camp0);
    document.getElementById('netNameInput').value = 'GM';
    document.getElementById('netHostBtn').click();
    const hostPeer = peers[peers.length - 1];
    check('hosting starts through the real Host button on a stub Peer', !!hostPeer && net.role === 'host' && /^waypoint-/.test(hostPeer.id));
    hostPeer.emit('open'); flushTimers(); await drain();
    await settle(() => !!localStorage.getItem('wp_gmSign'));   // the GM's signing key is made as hosting starts (WebCrypto, off the main thread)
    const GM_PRIV = (() => { try { return JSON.parse(localStorage.getItem('wp_gmSign')).priv; } catch (e) { return null; } })(), GM_D = GM_PRIV && typeof GM_PRIV.d === 'string' && GM_PRIV.d.length >= 40 ? GM_PRIV.d : '';
    check('the GM\'s signing key is made as hosting starts and kept on this machine (wp_gmSign: a P-256 pair with its private half)', !!GM_D && GM_PRIV.kty === 'EC' && GM_PRIV.crv === 'P-256' && typeof GM_PRIV.x === 'string' && typeof GM_PRIV.y === 'string');
    check('the host is active after the peer opens', net.active === true && net.role === 'host');
    resetRec(); warned.length = 0; sentLog.length = 0;

    const conns = {};
    function connect(peerId) { const c = new Conn(peerId); hostPeer.emit('connection', c); return c; }
    function hello(c, profile, extra) { net._handleMessage(Object.assign({ type: 'hello', profile, version: '1.5.0' }, extra || {}), c); flushTimers(); }
    // a known player's admission as their app does it: a plain hello (no key rides in it), the host's challenge (auth: the GM's id and a nonce),
    // a second hello answering with the proof over that nonce and the room id the player dialled; the host checks it over WebCrypto (asynchronous)
    async function admit(c, profile, key) {
        const n0 = c.sent.length;
        c.cn = nodeCrypto.randomBytes(16).toString('hex');   // this connection's own nonce, as the player's app sends it: the snapshot it is given is signed over it
        net._handleMessage({ type: 'hello', profile, version: '1.5.0', cn: c.cn }, c);   // no flushTimers here: the challenge's 2.5 s timer would hand the join to the GM before the answer
        const ch = c.sent.slice(n0).find(m => m.type === 'auth');
        if (!ch || typeof ch.nonce !== 'string' || !ch.nonce) { flushTimers(); return { ok: false, why: 'no challenge', sent: c.sent.slice(n0).map(m => m.type) }; }
        net._handleMessage({ type: 'hello', profile, version: '1.5.0', proof: proofFor(key, ch.nonce, hostPeer.id), cn: c.cn }, c);   // the answer clears the challenge timer
        await settle(() => !!net.roster[c.peer] || c.sent.slice(n0).some(m => m.type === 'wait' || m.type === 'denied'));
        flushTimers(); await drain();
        return { ok: !!net.roster[c.peer], why: net.roster[c.peer] ? '' : 'not admitted', sent: c.sent.slice(n0).map(m => m.type), gm: ch.gmId };
    }
    conns.p1 = connect('peer_p1'); const adm1 = await admit(conns.p1, { id: 'u_p1', name: 'Ayla', color: '#112233' }, K1);
    conns.p2 = connect('peer_p2'); const adm2 = await admit(conns.p2, { id: 'u_p2', name: 'Bram' }, K2);
    await drain(); flushTimers();
    const snapP1 = conns.p1.sent.find(m => m.type === 'snapshot');
    check('two known players are challenged (auth naming the GM, a nonce) and admitted on the proof over their table keys, no dialog raised, and each gets a snapshot', adm1.ok && adm2.ok && adm1.gm === 'u_gm' && rec.confirms.length === 0 && net.roster.peer_p1 && net.roster.peer_p1.id === 'u_p1' && net.roster.peer_p2 && net.roster.peer_p2.id === 'u_p2' && !!snapP1 && conns.p2.sent.some(m => m.type === 'snapshot'), { adm1, adm2, confirms: rec.confirms.length });
    check('the snapshot is signed with the GM\'s key: its four public fields (the pair kept on this machine), and a signature Node\'s own crypto verifies over the player\'s nonce, the host\'s room id, the GM id and the table key handed over — and over no other nonce or room', !!snapP1 && !!GM_PRIV && JSON.stringify(snapP1.gmPub) === JSON.stringify({ kty: 'EC', crv: 'P-256', x: GM_PRIV.x, y: GM_PRIV.y }) && sigOk(snapP1.gmPub, snapP1.sig, snapText(conns.p1.cn, hostPeer.id, 'u_gm', K1)) && !sigOk(snapP1.gmPub, snapP1.sig, snapText(conns.p2.cn, hostPeer.id, 'u_gm', K1)) && !sigOk(snapP1.gmPub, snapP1.sig, snapText(conns.p1.cn, hostPeer.id + '-r1', 'u_gm', K1)), snapP1 && { gmPub: snapP1.gmPub, sig: snapP1.sig });
    check('the proven key is kept, not re-issued (the snapshot carries the key the player proved)', !!snapP1 && snapP1.key === K1 && stubs.getActiveCampaign().players.u_p1.key === K1 && stubs.getActiveCampaign().players.u_p2.key === K2);
    check('the snapshot carries no GM-only field value, no hidden token, no GM note, no planner, no players record, no table key', (() => { const s = JSON.stringify(snapP1 && snapP1.appState); const m = s && s.match(/tok_hidden|note1|"pl_1"|secret plan|the orc lies|"players":\{|aaaaaaaa|"f_gmfig":(7|3|99)/); return !!s && !m; })(), String((JSON.stringify(snapP1 && snapP1.appState) || '').match(/.{0,60}(tok_hidden|note1|"pl_1"|secret plan|the orc lies|"players":\{|aaaaaaaa|"f_gmfig":(7|3|99)).{0,40}/) || 'leak'));
    check('the snapshot gives the map the player landed on whole and the other map as its stub (possession)', !!snapP1 && snapP1.appState.campaigns.c1.items.m_open && !snapP1.appState.campaigns.c1.items.m_open.stub && snapP1.appState.campaigns.c1.items.m_open.whiteboard.some(w => w.id === 'tok_p1') && snapP1.appState.campaigns.c1.items.m_fog && snapP1.appState.campaigns.c1.items.m_fog.stub === true && snapP1.appState.campaigns.c1.items.m_fog.whiteboard.length === 0);
    // the fogged map whole, as the host gives it when its player arrives there (the client world needs a copy it holds whole, not a stub)
    let mfogForClient = null;
    {
        const n0 = sentLog.length;
        net._handleMessage({ type: 'travel', viaItemId: 'portal_vis' }, conns.p1); flushTimers(); await drain(); flushTimers();
        const given = sentLog.slice(n0).find(s => s.to === 'peer_p1' && s.m.type === 'item' && s.m.itemId === 'm_fog' && s.m.item && !s.m.item.stub);
        check('a travel through the visible portal gives the player the fogged map whole (their own token on it, the far creature dropped by the fog)', !!given && net.roster.peer_p1.location === 'm_fog' && given.m.item.whiteboard.some(w => w.id === 'tok_p1b') && !given.m.item.whiteboard.some(w => w.id === 'tok_far'), given ? given.m.item.whiteboard.map(w => w.id) : sentLog.slice(n0).map(s => s.to + ':' + s.m.type));
        if (given) mfogForClient = clone(given.m);
        const toP1 = sentLog.slice(n0).filter(s => s.to === 'peer_p1'), stageI = toP1.findIndex(s => s.m.type === 'stage'), backI = toP1.findIndex(s => s.m.type === 'mapBack'), backM = backI >= 0 ? toP1[backI].m : null;
        check('the travel takes the map the player left back (possession): one mapBack for m_open after their stage word, carrying the campaign, the map\'s id and its stub\'s meta — nothing of what is on it', stageI >= 0 && backI > stageI && toP1.filter(s => s.m.type === 'mapBack').length === 1 && backM.itemId === 'm_open' && JSON.stringify(Object.keys(backM).sort()) === JSON.stringify(['campId', 'itemId', 'meta', 'type']) && !/whiteboard|rooms|tok_/.test(JSON.stringify(backM)), backM || toP1.map(s => s.m.type));
    }
    conns.w = connect('peer_w'); hello(conns.w, { id: 'u_w', name: 'Waiting' });
    check('a stranger\'s hello waits for the GM (one dialog, a wait sent, not admitted)', rec.confirms.length === 1 && conns.w.sent.some(m => m.type === 'wait') && !net.roster.peer_w);
    const joinConfirm = rec.confirms[0];
    const snapshotForClient = clone(snapP1); delete snapshotForClient.gmPub; delete snapshotForClient.sig;   // as an older host gives it: the client world below fuzzes every kind on a table with no signing key; the signed snapshot has its own section at the end
    resetRec(); sentLog.length = 0; warned.length = 0;

    /* ---------- the host templates: one well-formed example per message type ---------- */
    const host = {
        pid: { p1: 'u_p1', p2: 'u_p2' },
        tpl: {
            'hello': { type: 'hello', profile: { id: 'u_new', name: 'Newcomer', color: '#123456', avatar: 'data:image/png;base64,iVBORw0KGgo=', face: '🙂' }, version: '1.5.0', password: '', proof: '', cn: 'c'.repeat(32) },   // no key rides in a hello since the proof (a known id is challenged; the answer is a proof)
            'hold': { type: 'hold', ms: 1000 },
            'hb': { type: 'hb' },
            'item': { type: 'item', campId: 'c1', itemId: 'm_open', item: { whiteboard: [{ id: 'tok_p1', x: 120, y: 130, rot: 0, front: 0, elevation: 0, posture: '' }, { id: 'stroke_p1', type: 'path', ownerId: 'u_p1', pts: [[0, 0], [10, 10], [20, 5]], color: '#ffffff', strokeWidth: 3, x: 0, y: 0, w: 20, h: 10, baseW: 20, baseH: 10, opacity: 1 }] }, a: 1 },
            'threats': { type: 'threats', campId: 'c1', itemId: 'm_open', wbId: 'tok_p1', threats: [90, 180], a: 2 },
            'needItem': { type: 'needItem', campId: 'c1', itemId: 'm_open' },
            'travel': { type: 'travel', viaItemId: 'portal_vis' },
            'target': { type: 'target', id: 'tok_npc', mapId: 'm_open' },
            'share': { type: 'share', entry: { kind: 'text', text: 'a shared note', title: 'Note', caption: 'cap', notes: 'n', tags: ['t'], id: 'e1' }, to: '*' },
            'share-image': { type: 'share', entry: { kind: 'image', data: new Uint8Array([1, 2, 3, 4]).buffer, mime: 'image/png', title: 'Pic', id: 'e2' }, to: 'gm' },
            'pos': { type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p1', x: 150, y: 160, rot: 0, front: 0, final: true, a: 3 },
            'char-edit': { type: 'char-edit', rid: 'r1', charId: 'c_p1', fieldId: 'f_str', value: 12 },
            'char-edits': { type: 'char-edits', rid: 'r2', charId: 'c_p1', values: [{ fieldId: 'f_str', value: 13 }, { fieldId: 'f_dex', value: 11 }] },
            'char-apply': { type: 'char-apply', rid: 'r3', charId: 'c_p1', act: 'r_heal' },
            'turn-hold': { type: 'turn-hold', mapId: 'm_open', row: 'row_p1' },
            'turn-act': { type: 'turn-act', mapId: 'm_open', row: 'row_p1' },
            'turn-end': { type: 'turn-end', mapId: 'm_open', row: 'row_p1' },
            'char-upload': { type: 'char-upload', rid: 'r4', charId: 'c_p1', sheet: { name: 'Ayla', attributes: { ST: 12 }, items: [{ name: 'Rope' }] } },
            'char-item': { type: 'char-item', rid: 'r5', charId: 'c_p1', fieldId: 'f_inv', op: 'add', defId: 'i_rope', rowId: 'w_1', qty: 1 },
            'lib-idx': { type: 'lib-idx', rid: 'r6', campId: 'c1', packId: 'p_core', page: 0 },
            'lib-get': { type: 'lib-get', rid: 'r7', campId: 'c1', packId: 'p_core', ids: ['i_rope'] },
            'char-effect': { type: 'char-effect', rid: 'r8', charId: 'c_p1', fieldId: 'f_fx', op: 'add', ref: 'e_ward', rowId: 'x_1' },
            'throw-req': { type: 'throw-req', charId: 'c_p1', fieldId: 'f_inv', rowId: 'w_1', mapId: 'm_open', x: 200, y: 200 },
            'door-req': { type: 'door-req', mapId: 'm_open', itemId: 'door1' },
            'char-pic': { type: 'char-pic', rid: 'r9', charId: 'c_p1', face: 'default', img: 'data:image/png;base64,iVBORw0KGgo=' },
            'char-make': { type: 'char-make', rid: 'r10', name: 'Hero' },
            'char-name': { type: 'char-name', rid: 'r11', charId: 'c_p1', name: 'Ayla the Bold' },
            'char-done': { type: 'char-done', rid: 'r12', charId: 'c_p1' },
            'char-token': { type: 'char-token', rid: 'r13', name: 'Just Tok' },
            'tok-pic': { type: 'tok-pic', rid: 'r14', mapId: 'm_open', wbId: 'tok_p1plain', img: 'data:image/png;base64,iVBORw0KGgo=' },
            'tok-light': { type: 'tok-light', rid: 'r15', mapId: 'm_open', wbId: 'tok_p1', on: true, preset: 0, name: 'Torch' },
            'my-look': { type: 'my-look', face: '🙂' },
            'video-up': { type: 'video-up', act: 'ask', id: '0123456789abcdef', sdp: 'v=0\r\n', cand: { candidate: 'candidate:1 1 udp 1 1.2.3.4 5 typ host', sdpMid: '0', sdpMLineIndex: 0 } },
            'roll-req': { type: 'roll-req', rid: 'r16', expr: '1d20 + 3', label: 'Attack' },
            'roll-req-char': { type: 'roll-req', rid: 'r17', expr: 'd20 + STRmod + Prof', charId: 'c_p1', act: 'r_atk', mod: 0 },
            'asset-req': { type: 'asset-req', path: '/saves/images/pic.png' },
            'asset-req-audio': { type: 'asset-req', path: '/saves/images/audio/song.mp3' },
            'chat': { type: 'chat', text: 'hello table', from: { id: 'u_gm', name: 'GM', gm: true }, scope: 'whisper' },
            'unknown': { type: 'zzz-unknown', campId: 'c1', payload: 1 },
            // the players' own answers and the host→player words, sent AT the host (no host branch: must be ignored)
            'snapshot@host': { type: 'snapshot', gmId: 'u_evil', key: 'k', appState: { activeCampaignId: 'c1', campaigns: { c1: { id: 'c1', items: {} } } } },
            'stage@host': { type: 'stage', stage: { campId: 'c1', itemId: 'm_fog' } },
            'roster@host': { type: 'roster', roster: [{ id: 'u_gm', name: 'X' }] },
            'combats@host': { type: 'combats', combats: { m_open: { rows: [{ id: 'r', name: 'x' }] } } },
            'roll@host': { type: 'roll', id: 'r', from: { id: 'u_p1', name: 'A' }, expr: '1d6', draws: [[6]], v: 1, ts: 1 },
            'kicked@host': { type: 'kicked' }, 'end@host': { type: 'end' }, 'denied@host': { type: 'denied', reason: CANARY, update: true },
            'itemDelta@host': { type: 'itemDelta', campId: 'c1', itemId: 'm_open', whiteboard: { set: [{ id: 'tok_npc', x: 0, y: 0 }], del: ['tok_p2'] } },
            'char@host': { type: 'char', campId: 'c1', char: { id: 'c_p2', name: 'Stolen', ownerId: 'u_p1', values: {} } },
            'handout@host': { type: 'handout', kind: 'text', text: 'x', title: 'T' },
            'fogDiff@host': { type: 'fogDiff', campId: 'c1', itemId: 'm_fog', drop: ['tok_far'] }
        }
    };
    // a combat on m_open so the turn-* branches have rows to find
    function seedCombat() { net.combats = { m_open: { mapId: 'm_open', round: 1, turn: 0, rows: [{ id: 'row_p1', name: 'Ayla', tokId: 'tok_p1', init: 15 }, { id: 'row_npc', name: 'Orc', tokId: 'tok_npc', init: 10 }, { id: 'row_p2', name: 'Bram', tokId: 'tok_p2', init: 5 }] } }; }
    seedCombat();

    let readmits = 0, readmitFailed = [];
    async function resetWorld() {
        const camp = stubs.getActiveCampaign();
        camp.items = clone(pristine.items); camp.chars = clone(pristine.chars); camp.players = Object.assign({}, clone(pristine.players), { u_p1: Object.assign({}, camp.players.u_p1 || {}, { key: K1 }), u_p2: Object.assign({}, camp.players.u_p2 || {}, { key: K2 }) }); camp.turnRules = {}; camp.activeItemId = 'm_open';
        camp.sessionLog = (camp.sessionLog || []).slice(-50); delete camp.uploads;
        // a player a probe left on another map is brought back as the host brings one — a summon to the GM's map: that map given whole again, the stage
        // word, the map they left taken back — so the host's record of what each connection holds agrees with where the roster says its player is
        Object.keys(net.roster).forEach(k => { const c = net.conns.find(x => x.peer === k); if (net.roster[k].location !== 'm_open' && c && c.open) net.summonPlayer(k); net.roster[k].location = 'm_open'; net.roster[k].detached = false; });
        ['u_p1', 'u_p2'].forEach(pid => { if (camp.players[pid]) camp.players[pid].lastMap = 'm_open'; });   // the record agrees with the roster (renderRoster copies the roster's location onto it: a stale record would read as a write by whatever probe first redraws the roster)
        net.paused = false; net.pausedPlayers = {}; net.travelLocked = false; net.targets = {}; seedCombat();
        clockOff += 61000;   // every rate-limit window has passed
        ['p1', 'p2'].forEach(k => { if (conns[k] && conns[k].open) net._handleMessage({ type: 'hb' }, conns[k]); });   // the players are heard from (the live-duplicate rule reads lastSeen)
        for (const k of ['p1', 'p2']) {   // a player a probe cost their connection comes back as their app would: a hello, the challenge, the proof
            if (conns[k].open && net.roster['peer_' + k]) continue;
            if (conns[k].open) conns[k].close();   // open but no longer on the roster (removed): the connection goes, as the host's kick closes it
            flushTimers(); conns[k] = connect('peer_' + k); readmits++;
            const r = await admit(conns[k], { id: 'u_' + k, name: k === 'p1' ? 'Ayla' : 'Bram' }, k === 'p1' ? K1 : K2);
            if (!r.ok) readmitFailed.push(k + ': ' + r.why + ' ' + JSON.stringify(r.sent));
        }
        if (!conns.w.open) { conns.w = connect('peer_w'); hello(conns.w, { id: 'u_w', name: 'Waiting' }); }
        resetRec(); flushed.threw.length = 0; warned.length = 0;
    }

    /* ---------- who may touch what (host) ---------- */
    function allowedHost(ch, pid, msg, before, after) {
        const p = ch.path; let m;
        if (/^\.ls\./.test(p)) return false;   // the host's own storage: no player writes it
        if (!pid) return false;
        if ((m = p.match(/^\.app\.campaigns\.c1\.items\.([^.]+)\.whiteboard\[id=([^\]]+)\](?:\.(.+))?$/))) {
            const mapB = before.app.campaigns.c1.items[m[1]], mapA = after.app.campaigns.c1.items[m[1]];
            const tokA = mapA && (mapA.whiteboard || []).find(x => x.id === m[2]), tokB = mapB && (mapB.whiteboard || []).find(x => x.id === m[2]);
            if (!m[3]) { const obj = tokA || tokB; return !!obj && ((obj.type === 'path' && obj.byPlayer === true && obj.ownerId === pid) || (msg.type === 'hello' && obj.ownerId === pid) || ((msg.type === 'travel' || msg.type === 'pos' || msg.type === 'item' || msg.type === 'char-token' || msg.type === 'char-done') && (obj.ownerId === pid || obj.waiting))); }
            const tok = tokB || tokA; if (!tok) return false;
            const key = m[3].split(/[.[]/)[0];
            if (tok.type === 'path' && tok.byPlayer === true && tok.ownerId === pid) return true;
            if (tok.ownerId === pid && !tok.hidden && !tok.locked && /^(x|y|rot|front|elevation|posture|threats|light|face|isChar|charName|name|charStats|waiting|color|charId)$/.test(key)) return true;
            if (tok.ownerId === pid && (msg.type === 'tok-pic' || msg.type === 'char-pic') && /^(src|pic|face|frame)$/.test(key)) return true;
            if (msg.type === 'door-req' && tok.sightType === 'door' && key === 'doorOpen' && !tok.doorLock && !tok.hidden) return true;
            return false;
        }
        if ((m = p.match(/^\.app\.campaigns\.c1\.chars(?:\.([^.]+))?/))) { if (!m[1]) return msg.type === 'char-make' || msg.type === 'char-token'; const c = after.app.campaigns.c1.chars[m[1]] || before.app.campaigns.c1.chars[m[1]]; return !!c && c.ownerId === pid && !c.npc; }
        if (/^\.app\.campaigns\.c1\.(sessionLog|uploads)(\.|\[|$)/.test(p)) return true;
        if ((m = p.match(/^\.app\.campaigns\.c1\.players(?:\.([^.]+))?/))) return !m[1] || m[1] === pid;
        if ((m = p.match(/^\.roster\.([^.]+)/))) { const r = after.roster[m[1]] || before.roster[m[1]]; return !!r && r.id === pid; }
        if ((m = p.match(/^\.targets\.([^.]+)/))) return m[1] === pid;
        if (/^\.combats/.test(p)) return /^turn-/.test(msg.type);
        if (/^\.app\.campaigns\.c1\.items\.[^.]+\.meta\.(lastWbX|lastWbY)$/.test(p)) return msg.type === 'travel';
        return false;
    }
    const senderPid = (who, msg) => who === 'p1' ? 'u_p1' : who === 'p2' ? 'u_p2' : (msg && msg.type === 'hello' && msg.profile && typeof msg.profile.id === 'string') ? msg.profile.id : null;

    const confirmsBy = new Map();
    async function fireHost(who, kind, mut, msg, opts) {
        opts = opts || {};
        probes++;
        let conn;
        if (who === 's') conn = connect('peer_s' + probes);   // a stranger: a fresh connection each time (closing it is the gate's answer)
        else conn = conns[who];
        if (!conn || !conn.open) { await resetWorld(); conn = who === 's' ? connect('peer_s' + probes) : conns[who]; }
        clockOff += 1500;   // past every per-message spacing: the handler judges this probe, not a limiter still in its window (a flood runs on a still clock)
        const before = snapOf(net); const sentBefore = sentLog.length; resetRec(); warned.length = 0; flushed.threw.length = 0;
        const t0 = performance.now(); let threw = null;
        try { net._handleMessage(msg, conn); } catch (e) { threw = e; } finally { net.applyingRemote = false; }
        try { flushTimers(); } catch (e) { threw = threw || e; }
        await drain(); flushTimers();
        const dt = performance.now() - t0;
        let after = snapOf(net);
        const tag = kind + ' from ' + (who === 's' ? 'a stranger' : who === 'w' ? 'the waiting peer' : 'an admitted player');
        if (!after || !before) { finding('a structure nested past 200 levels is kept in the campaign (a save would fail: JSON.stringify of it overflows on Node 22)', tag, { msg, depth: 'past what JSON.stringify can serialise here' }, mut); after = after || EMPTY_SNAP; }
        else { const dp = depthOf(after.app); if (dp > 200) finding('a structure nested past 200 levels is kept in the campaign (a save would fail: JSON.stringify of it overflows on Node 22)', tag, { msg, depth: dp + ' levels' }, mut); }
        if (threw) finding('exception escapes handleMessage', tag + ' — ' + (threw.constructor.name + ': ' + String(threw.message).slice(0, 120)), msg, mut);
        flushed.threw.forEach(e => finding('exception in a timer the message armed', tag + ' — ' + String(e.message).slice(0, 120), msg, mut));
        const changes = before && after !== EMPTY_SNAP ? diffOf(before, after) : [];
        const pid = senderPid(who, msg);
        const bad = changes.filter(ch => !allowedHost(ch, pid, msg, before, after));
        if (bad.length) finding('state written outside the sender\'s rights', tag + ' → ' + bad[0].path.replace(/\[id=[^\]]+\]/g, '[id=…]'), { msg, change: bad[0] }, mut);
        if (threw && changes.length) finding('half-applied: an exception after state changed', tag + ' → ' + changes.slice(0, 2).map(c => c.path).join('; '), msg, mut);
        const padd = protoAdded(); if (padd.length) finding('prototype pollution', tag + ' → ' + padd.join(', '), msg, mut);
        if (net.targets && Object.getPrototypeOf(net.targets) !== Object.prototype) { finding('net.targets re-parented (a "__proto__" key)', tag, msg); net.targets = {}; }
        if (net.combats && Object.getPrototypeOf(net.combats) !== Object.prototype) { finding('net.combats re-parented (a "__proto__" key)', tag, msg); seedCombat(); }
        const persisted = rec.saves.filter(s => s.persist);
        if (persisted.length && (who === 's' || who === 'w')) finding('a disk save caused by an unadmitted peer', 'any message but hb/hello from a waiting peer or a stranger: the gate closes the connection, and the close handler saves to disk and broadcasts the roster', msg, kind + ' from ' + who);
        else if (persisted.length && !changes.length && msg.type !== 'hello') finding('a disk save with nothing changed', tag, msg, mut);
        rec.fetches.forEach(f => { if (!/^\/saves\/images\//.test(f.url)) finding('a fetch outside /saves/images/', tag + ' → ' + f.url.slice(0, 80), msg); });
        if (rec.fetches.length && !/^asset-req/.test(kind)) finding('a fetch the message should not cause', tag + ' → ' + rec.fetches[0].url.slice(0, 80), msg);
        rec.html.forEach(h => { if (h.v.indexOf(CANARY) >= 0) finding('raw hostile string in a markup sink (innerHTML)', tag + ' → #' + h.el, msg); });
        rec.attr.forEach(h => { if (h.v.indexOf(CANARY) >= 0) finding('raw hostile string in an attribute sink', tag + ' → #' + h.el + '.' + h.k, msg); });
        rec.style.forEach(h => { if (/NaN|undefined|\[object|Infinity/.test(h.v)) finding('garbage reaches a CSS value', tag + ' → ' + h.k + '=' + h.v.slice(0, 40), msg); });
        [].concat(rec.html, rec.text, rec.attr).forEach(h => { if (h.v.length > 60000) finding('an unbounded string reaches the page', tag + ' → #' + h.el + ' (' + h.v.length + ' chars)', msg); });
        if (longest(after.app) > 100000) finding('an unbounded string is kept in the campaign (and would be saved)', tag, msg, mut);
        if (longest(after.roster) > 100000) finding('an unbounded string is kept on the roster', tag, msg, mut);
        rec.confirms.forEach(c => { const k = msg.type + '|' + (pid || conn.peer); confirmsBy.set(k, (confirmsBy.get(k) || 0) + 1); if (confirmsBy.get(k) === 2) finding('a dialog raised more than once per message type by one peer', msg.type + ' from ' + (pid || 'a stranger') + ' → "' + c.text.slice(0, 80) + '"', msg); });
        if (dt > 200 && !opts.again) { const t1 = performance.now(); try { net._handleMessage(clone(msg), conn); } catch (e) {} finally { net.applyingRemote = false; } flushTimers(); const dt2 = performance.now() - t1; if (dt2 > 200) finding('one message takes more than 200 ms', tag + ' (' + Math.round(dt) + ' ms, again ' + Math.round(dt2) + ' ms)', msg, mut); }
        if (GM_D && sentLog.slice(sentBefore).some(s => { try { return JSON.stringify(s.m).indexOf(GM_D) >= 0; } catch (e) { return false; } })) finding('the GM\'s signing key (its private half) is sent', tag, msg, mut);
        warned.forEach(w => { if (/wire send failed/.test(w)) finding('a send the packer refused (console.warn)', tag + ' → ' + w.slice(0, 100), msg); });
        if (who === 's' || who === 'w') {
            const toThem = sentLog.slice(sentBefore).filter(s => s.to === conn.peer && s.m.type !== 'hb' && s.m.type !== 'denied' && s.m.type !== 'wait');
            if (toThem.length) finding('an unadmitted peer is sent something of the table', tag + ' → ' + toThem[0].m.type, msg);
        }
        return { threw, changes, dt };
    }

    const campH = () => stubs.getActiveCampaign(), tokH = id => campH().items.m_open.whiteboard.find(w => w.id === id);
    const expectHost = {
        'item': o => tokH('tok_p1').x === 120 && tokH('tok_p1').y === 130 && !!tokH('stroke_p1') && tokH('stroke_p1').byPlayer === true && o.p2.some(m => m.type === 'itemDelta' || m.type === 'item'),
        'threats': () => JSON.stringify(tokH('tok_p1').threats) === '[90,180]',
        'needItem': o => o.p1.some(m => m.type === 'item' && m.itemId === 'm_open'),
        'travel': o => net.roster.peer_p1.location === 'm_fog' && o.p1.some(m => m.type === 'stage') && o.p1.some(m => m.type === 'mapBack' && m.itemId === 'm_open') && !o.p2.some(m => m.type === 'mapBack'),
        'target': o => net.targets.u_p1 && net.targets.u_p1.id === 'tok_npc' && o.p2.some(m => m.type === 'targets'),
        'share': o => o.p2.some(m => m.type === 'handout' && m.title === 'Note' && m.sharedById === 'u_p1'),
        'share-image': () => rec.journal.length === 1 && rec.journal[0].mime === 'image/png' && rec.journal[0].data instanceof ArrayBuffer,
        'pos': o => tokH('tok_p1').x === 150 && tokH('tok_p1').y === 160 && o.p2.some(m => m.type === 'pos' && m.x === 150),
        'char-edit': o => campH().chars.c_p1.values.f_str === 12 && o.p1.some(m => m.type === 'char-ack'),
        'char-edits': () => campH().chars.c_p1.values.f_str === 13 && campH().chars.c_p1.values.f_dex === 11,
        'char-apply': o => o.p1.some(m => m.type === 'char-ack') && o.p1.some(m => m.type === 'apply'),
        'turn-hold': () => net.combats.m_open.turn === 1 && net.combats.m_open.rows.some(r => r.id === 'row_p1' && r.held === 1),
        'turn-end': () => net.combats.m_open.turn === 1,
        'char-upload': o => o.p1.some(m => m.type === 'char-upload-ans' && typeof m.n === 'number'),
        'char-item': o => Array.isArray(campH().chars.c_p1.values.f_inv) && campH().chars.c_p1.values.f_inv.length === 1 && o.p1.some(m => m.type === 'char-ack'),
        'lib-idx': o => o.p1.some(m => m.type === 'lib-idx-ans'),
        'char-effect': o => o.p1.some(m => m.type === 'char-ack') && Array.isArray(campH().chars.c_p1.values.f_fx) && campH().chars.c_p1.values.f_fx.length === 1,
        'door-req': () => tokH('door1').doorOpen === true,
        'char-pic': o => rec.pics.length === 1 && o.p1.some(m => m.type === 'char-pic-ans' && m.ok === true),
        'char-make': o => o.p1.some(m => m.type === 'char-make-ans' && m.reason === 'have'),
        'char-name': o => o.p1.some(m => m.type === 'char-name-ans' && m.reason === 'notmaking'),
        'char-done': o => o.p1.some(m => m.type === 'char-done-ans' && m.reason === 'notmaking'),
        'char-token': o => o.p1.some(m => m.type === 'char-token-ans' && m.reason === 'have'),
        'tok-pic': o => rec.pics.length === 1 && o.p1.some(m => m.type === 'tok-pic-ans' && m.ok === true),
        'tok-light': o => tokH('tok_p1').light && tokH('tok_p1').light.name === 'Torch' && o.p1.some(m => m.type === 'tok-light-ans' && m.ok === true) && o.p2.some(m => m.type === 'item' || m.type === 'itemDelta'),
        'my-look': o => net.roster.peer_p1.face === '\ud83d\ude42' && o.p2.some(m => m.type === 'roster'),
        'roll-req': o => o.p2.some(m => m.type === 'roll' && m.expr === '1d20 + 3') && o.p1.some(m => m.type === 'roll'),
        'roll-req-char': o => o.p2.some(m => m.type === 'roll' && m.as === 'Ayla'),
        'asset-req': o => rec.fetches.length === 1 && o.p1.some(m => m.type === 'asset' && m.path === '/saves/images/pic.png'),
        'asset-req-audio': o => o.p1.some(m => m.type === 'asset-part'),
        'chat': o => o.p2.some(m => m.type === 'chat' && m.text === 'hello table' && m.from.id === 'u_p1' && !m.from.gm) && !o.p1.some(m => m.type === 'chat')
    };
    /* ---------- generic fuzz over every host type from each sender ---------- */
    console.log('# host world: ' + Object.keys(host.tpl).length + ' message kinds × mutations × senders');
    for (const kind of Object.keys(host.tpl)) {
        const tpl = host.tpl[kind];
        await resetWorld();
        const muts = mutations(tpl);
        for (const m of muts) {
            const s1 = conns.p1.sent.length, s2 = conns.p2.sent.length;
            await fireHost('p1', kind, m.name, m.msg);
            if (m.name === 'well-formed' && expectHost[kind]) { let ok = false; try { ok = !!expectHost[kind]({ p1: conns.p1.sent.slice(s1), p2: conns.p2.sent.slice(s2) }); } catch (e) { ok = false; } check('host: the well-formed ' + kind + ' takes effect (the fuzz reaches the real path)', ok, { p1: conns.p1.sent.slice(s1).map(x => x.type + (x.reason ? ':' + x.reason : '') + (x.message || x.msg ? ' (' + (x.message || x.msg) + ')' : '')), p2: conns.p2.sent.slice(s2).map(x => x.type), toasts: rec.toasts.slice(0, 3), journal: rec.journal.length }); }
        }
        await resetWorld();
        for (const m of muts.slice(0, 14)) { await fireHost('w', kind, m.name, m.msg); if (!conns.w.open) { conns.w = connect('peer_w'); hello(conns.w, { id: 'u_w', name: 'Waiting' }); } }
        for (const m of muts.slice(0, 14)) { await fireHost('s', kind, m.name, m.msg); }
        // the second player sends the first player's own message: nothing of p1's may move
        await resetWorld();
        await fireHost('p2', kind + ' (p2 sends p1\'s message)', 'well-formed', cloneMsg(tpl));
        // a flood of 500 well-formed from p1
        await resetWorld(); const sb = sentLog.length; const tf = performance.now(); let threwN = 0;
        for (let i = 0; i < 500; i++) { const m = cloneMsg(tpl); if (m.rid) m.rid = 'f' + i; if (m.a !== undefined) m.a = i + 10; try { net._handleMessage(m, conns.p1); } catch (e) { threwN++; } finally { net.applyingRemote = false; } if (!conns.p1.open) break; }
        flushTimers(); await drain(); flushTimers();
        const dtf = performance.now() - tf, outN = sentLog.length - sb;
        if (dtf > 2000) finding('a flood of 500 takes more than 2 s', kind + ' (' + Math.round(dtf) + ' ms)', tpl);
        if (outN > 1500) finding('a flood of 500 is amplified past 1500 sends', kind + ' → ' + outN + ' messages out', tpl);
        if (rec.toasts.length > 60) finding('a flood of 500 raises more than 60 toasts on the GM', kind + ' → ' + rec.toasts.length, tpl);
        if (rec.saves.length > 60) finding('a flood of 500 causes more than 60 disk saves', kind + ' → ' + rec.saves.length, tpl);
        if (threwN) finding('exception escapes handleMessage', kind + ' during a flood', tpl);
        checks++; const bad = openFindings().some(f => f.detail.indexOf(kind + ' ') === 0 || f.detail.indexOf(kind + ' (') === 0 || f.detail.indexOf(kind + '|') === 0);
        if (bad) checksFailed++;
        console.log((bad ? 'FAIL      ' : 'ok        ') + 'host: ' + kind + ' — ' + muts.length + ' mutations × p1, 14 × waiting, 14 × stranger, p2, a flood of 500');
    }

    /* ---------- ordered scenarios on the host ---------- */
    function drainDialogs() { for (let n = 0; n < 60; n++) { const d = allConfirms.find(x => !x.answered); if (!d) return; d.answered = true; d.cb(false); flushTimers(); } }
    await resetWorld();
    {   // a drag: moves, a final, then a stale move after the drop; a replayed final; an item patch with an old number
        const seq = [{ x: 110, y: 100, final: false }, { x: 120, y: 100, final: false }, { x: 130, y: 100, final: true }, { x: 115, y: 100, final: false }, { x: 130, y: 100, final: true }];
        let bad = false;
        for (const s of seq) { const r = await fireHost('p1', 'pos sequence', 'drag then stale', Object.assign({ type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p1', rot: 0, front: 0, a: 7 }, s)); if (r.threw) bad = true; }
        const old = clone(host.tpl.item); old.a = 1; await fireHost('p1', 'item replay', 'old action number', old);
        check('host: a drag, its drop, a stale move after it and a replayed patch run without a throw', !bad);
    }
    {   // a drop on the hidden trap tile travels; one into the wall is refused
        await resetWorld();
        await fireHost('p1', 'pos onto trap', 'final on the hidden trap tile', { type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p1', x: 200, y: 100, rot: 0, front: 0, final: true, a: 9 });
        check('host: a drop on a hidden trap tile travels the player (a stage sent, their location moved)', net.roster.peer_p1.location === 'm_fog' && conns.p1.sent.some(m => m.type === 'stage'));
        await resetWorld();
        await fireHost('p1', 'pos into wall', 'final past the wall', { type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p1', x: 602, y: 100, rot: 0, front: 0, final: true, a: 9 });
        const tk = stubs.getActiveCampaign().items.m_open.whiteboard.find(w => w.id === 'tok_p1');
        check('host: a drop through a wall is put back and the mover told', tk.x === 100 && conns.p1.sent.some(m => m.type === 'pos' && m.x === 100) && conns.p1.sent.some(m => m.type === 'turn-note'));
    }
    {   // the players' own words at the host: 'travel' naming the hidden trap by id tells nothing
        await resetWorld(); const sb = conns.p1.sent.length;
        await fireHost('p1', 'travel naming the trap', 'hidden portal id', { type: 'travel', viaItemId: 'trap1' });
        check('host: naming a hidden trap tile in a travel moves nobody and answers nothing', net.roster.peer_p1.location === 'm_open' && conns.p1.sent.length === sb);
    }
    {   // needItem with a prototype key as the item id (the inventory's worry 5)
        await resetWorld(); const sb = sentLog.length; let threw = null;
        for (const id of ['constructor', '__proto__', 'hasOwnProperty', 'toString', 'pl_1', 'd_notes', 'tok_hidden']) { const r = await fireHost('p1', 'needItem', 'item id ' + id, { type: 'needItem', campId: 'c1', itemId: id }); if (r.threw) threw = r.threw; }
        const got = sentLog.slice(sb).filter(s => s.to === 'peer_p1' && s.m.type === 'item');
        got.filter(g => g.m.itemId in Object.prototype).forEach(g => finding('needItem names an item id without own(): a prototype key reaches sendItem', 'needItem ' + g.m.itemId + ' from an admitted player → an item sent (' + short(g.m.item).slice(0, 40) + '); constructor / toString / hasOwnProperty make a send the packer refuses', g.m));
        check('host: needItem of a prototype key, a planner or a hidden token sends no item (and throws nowhere)', !threw && got.every(g => !(g.m.itemId in Object.prototype) && g.m.item && (g.m.item.type === 'map' || g.m.item.type === 'doc')) && !got.some(g => JSON.stringify(g.m).indexOf('secret') >= 0), { threw: threw && threw.message, items: got.map(g => g.m.itemId) });
    }
    {   // 'target': one Start-combat dialog per NPC token the player names — how many dialogs can one player queue?
        await resetWorld(); net.combats = {}; const stub = stubs.getActiveCampaign(); for (let i = 0; i < 40; i++) stub.items.m_open.whiteboard.push({ id: 'npcx' + i, type: 'circle', isChar: true, charName: 'Mob ' + i, x: 10 * i, y: 500, w: 50, h: 50 });
        resetRec(); let n = 0;
        for (let i = 0; i < 40; i++) { net._handleMessage({ type: 'target', id: 'npcx' + i, mapId: 'm_open' }, conns.p1); n += rec.confirms.length; rec.confirms.length = 0; clockOff += 120; }
        clockOff += 6000;
        if (n > 1) finding('UI trap: a player queues a Start-combat dialog on the GM per NPC token named', 'target from u_p1 → ' + n + ' dialogs for 40 tokens (only Settings ▸ targetAsk off stops it)', { type: 'target', id: 'npcx…', mapId: 'm_open' });
        check('host: the Start-combat offer is raised at most once per player (' + n + ' dialogs for 40 NPC tokens targeted in turn)', n <= 1);
    }
    {   // approvedIds: the GM says yes to a join whose connection dropped meanwhile; the NEXT hello claiming that id is admitted without a key
        await resetWorld(); drainDialogs(); resetRec(); clockOff += 20000;
        const cS = connect('peer_dropper'); hello(cS, { id: 'u_drop', name: 'Dropper' });
        const dlg = rec.confirms[rec.confirms.length - 1];
        cS.close(); flushTimers();
        const dlgOk = !!dlg; if (dlg) { dlg.answered = true; dlg.cb(true); } flushTimers();
        const cT = connect('peer_thief'); hello(cT, { id: 'u_drop', name: 'Thief' }); flushTimers(); await drain();
        const admitted = !!net.roster.peer_thief;
        if (admitted) finding('identity: a yes to a dropped join admits the next hello claiming that public id, with no table key', 'hello from peer_thief as u_drop (approvedIds) → admitted, a fresh key issued', { type: 'hello', profile: { id: 'u_drop' } });
        check('host: a join approved after its connection dropped is not open to any later hello claiming that id', dlgOk && !admitted);
        if (admitted) net.kickPlayer('peer_thief'); flushTimers();
    }
    {   // the password lockout is table-wide
        await resetWorld(); document.getElementById('netPassInput').value = 'secret'; resetRec();
        for (let i = 0; i < 20; i++) { const c = connect('peer_guess' + i); hello(c, { id: 'u_g' + i, name: 'G' }, { password: 'wrong' }); flushTimers(); }
        const cOk = connect('peer_right'); hello(cOk, { id: 'u_right', name: 'R' }, { password: 'secret' }); flushTimers();
        const lockedOut = cOk.sent.some(m => m.type === 'denied' && /Too many/.test(m.reason));
        if (lockedOut) finding('denial of service: 20 wrong passwords from anyone lock every join for a minute', 'hello with the right password after a stranger\'s 20 wrong ones → denied', { type: 'hello', password: 'wrong' });
        check('host: a stranger\'s wrong passwords do not lock out a player with the right one', !lockedOut);
        document.getElementById('netPassInput').value = ''; clockOff += 61000;
    }
    {   // a second connection claiming an admitted player's id while they are live
        await resetWorld(); const cD = connect('peer_dup'); const admD = await admit(cD, { id: 'u_p1', name: 'Ayla2' }, K1);
        check('host: a live duplicate of an admitted id is denied before any challenge (no auth sent, no proof asked), though it holds the right key', !admD.ok && !net.roster.peer_dup && cD.sent.some(m => m.type === 'denied') && !cD.sent.some(m => m.type === 'auth'), admD);
    }
    {   // hold: a zombie connection kept alive; unadmitted connections uncounted
        await resetWorld(); const before = net.conns.length;
        for (let i = 0; i < 300; i++) { const c = connect('peer_zombie' + i); net._handleMessage({ type: 'hb' }, c); }
        const n = net.conns.length - before;
        if (n >= 300) finding('resource: unadmitted connections that only heartbeat are kept with no count cap', n + ' heartbeating strangers held for 10 min each (a DataChannel, _connMeta and lastSeen apiece)', { type: 'hb' });
        check('host: the number of unadmitted heartbeating connections is capped', n < 300);
        net.conns.slice(before).forEach(c => c.close()); flushTimers();
    }
    {   // the asset path: the bytes read for one connection are budgeted (150 MB a minute, judged on each file's stated length before the read; cluster J #5).
        // The asset gate serves a connection only a file it was sent a reference to, so the 200 pictures (each stating 1 MB) are first put on the
        // player's map and the map sent (an honest battle map with many pictures); then each is asked for in one burst
        await resetWorld(); resetRec();
        const mapA = stubs.getActiveCampaign().items.m_open;
        for (let i = 0; i < 200; i++) mapA.whiteboard.push({ id: 'img_' + i, type: 'image', src: '/saves/images/p' + i + '.png', x: 800 + i, y: 800, w: 10, h: 10, layer: 'bottom' });
        net.sendItem('c1', 'm_open'); flushTimers(); await drain(); flushTimers();
        const refsNoted = conns.p1.sent.some(m => (m.type === 'item' || m.type === 'itemDelta') && JSON.stringify(m).indexOf('/saves/images/p199.png') >= 0);
        resetRec();
        for (let i = 0; i < 200; i++) net._handleMessage({ type: 'asset-req', path: '/saves/images/p' + i + '.png' }, conns.p1);
        await drain(); flushTimers(); await drain();
        const busyN = conns.p1.sent.filter(m => m.type === 'asset' && m.error === 'busy' && /\/p\d+\.png$/.test(m.path)).length, servedN = conns.p1.sent.filter(m => m.type === 'asset' && !m.error && /\/p\d+\.png$/.test(m.path)).length;
        if (rec.reads > 150) finding('resource: pictures read for one connection past 150 MB in a minute, each up to 26 MB held in memory', 'asset-req ×200 of 1 MB each from u_p1 (every path one the map they were sent names) → ' + rec.reads + ' MB read by the host', { type: 'asset-req', path: '/saves/images/pN.png' });
        check('host: the 200 pictures reached the player as references (the probe asks for files the gate will serve)', refsNoted);
        check('host: the pictures read for one connection are budgeted by bytes — of 200 asked in one burst, each stating 1 MB, at most 150 MB are read and served in a minute and the rest are answered busy with their bodies cancelled unread (' + rec.reads + ' read, ' + servedN + ' served, ' + busyN + ' busy, ' + rec.cancels + ' cancelled)', rec.reads <= 150 && servedN === rec.reads && servedN + busyN === 200 && rec.cancels === busyN && busyN > 0);
        clockOff += 11000; resetRec(); net._handleMessage({ type: 'asset-req', path: '/saves/images/never-sent.png' }, conns.p1); await drain();   // past the asset limiter's window: judged by the gate, not refused as busy
        check('host: a picture path this connection was never sent a reference to is answered as missing and never read', rec.fetches.length === 0 && conns.p1.sent.some(m => m.type === 'asset' && m.path === '/saves/images/never-sent.png' && m.error === 'missing'), conns.p1.sent.filter(m => m.type === 'asset').slice(-1));
        let bad = false; for (const p of ['/saves/data.json', '/api/data', '/saves/images/../data.json', '/saves/images/%2e%2e/data.json', 'http://evil/x.png', '/saves/images/a.png?x=1', '/saves/images/a\u0000.png', '\\saves\\images\\a.png']) { resetRec(); net._handleMessage({ type: 'asset-req', path: p }, conns.p1); await drain(); if (rec.fetches.some(f => !/^\/saves\/images\/[^.]/.test(f.url) || /\.\./.test(f.url))) bad = true; }
        check('host: an asset path outside /saves/images/ (dot segments, %2e%2e, another origin, a query, NUL, backslashes) fetches nothing', !bad);
    }
    {   // chat flood: each line re-renders the whole chat on the GM
        await resetWorld(); resetRec(); const t = performance.now(); let n = 0;
        for (let i = 0; i < 2000; i++) { const before = rec.renders; net._handleMessage({ type: 'chat', text: 'spam ' + i }, i % 2 ? conns.p1 : conns.p2); if (rec.toasts.length) n++; }
        const dt = performance.now() - t;
        check('host: a 2000-line chat storm from two players is held by the limiter in under 2 s (' + Math.round(dt) + ' ms)', dt < 2000);
    }
    {   // what a stranger costs: every junk message closes its connection — and the close handler saves to disk and broadcasts the roster
        await resetWorld(); resetRec(); const sb = sentLog.length;
        for (let i = 0; i < 50; i++) { const c = connect('peer_junk' + i); net._handleMessage({ type: 'item', campId: 'c1', itemId: 'm_open', item: { whiteboard: [] } }, c); flushTimers(); }
        const saves = rec.saves.filter(s => s.persist).length, rosters = sentLog.slice(sb).filter(s => s.m.type === 'roster').length;
        if (saves >= 50) finding('resource: a stranger\'s junk message costs the GM a disk save and a roster broadcast (the close handler\'s)', '50 junk messages from 50 connections → ' + saves + ' saves, ' + rosters + ' roster messages', { type: 'item' });
        check('host: a stranger\'s junk message does not cost a disk save', saves < 50);
    }
    {   // the GM-only field through the players' paths: a roll naming it, an edit of it, an apply reading it
        await resetWorld(); const sb = sentLog.length;
        await fireHost('p1', 'roll-req GM field', 'expr names the GM-only field', { type: 'roll-req', rid: 'g1', expr: '1d20 + GMFig', charId: 'c_p1' });
        await fireHost('p1', 'char-edit GM field', 'the GM-only field', { type: 'char-edit', rid: 'g2', charId: 'c_p1', fieldId: 'f_gmfig', value: 1 });
        await fireHost('p1', 'char-edit other\'s char', 'another player\'s character', { type: 'char-edit', rid: 'g3', charId: 'c_p2', fieldId: 'f_str', value: 1 });
        await fireHost('p1', 'char-edit npc', 'the NPC', { type: 'char-edit', rid: 'g4', charId: 'c_npc', fieldId: 'f_str', value: 1 });
        const camp = stubs.getActiveCampaign(), out = sentLog.slice(sb);
        check('host: the GM-only field is neither rolled by name, nor edited, nor is another\'s character or the NPC', camp.chars.c_p1.values.f_gmfig === 7 && camp.chars.c_p2.values.f_str === 9 && camp.chars.c_npc.values.f_str === 16 && !out.some(s => s.m.type === 'roll' && /GMFig/.test(JSON.stringify(s.m.names || ''))) && out.filter(s => s.m.type === 'char-deny').length >= 3, { gmfig: camp.chars.c_p1.values.f_gmfig, p2: camp.chars.c_p2.values.f_str, npc: camp.chars.c_npc.values.f_str, out: out.map(s => s.m.type + (s.m.reason ? ':' + s.m.reason : '')) });
        check('host: nothing sent to any player carries the GM-only value, the hidden token or the GM note', !out.some(s => /"f_gmfig":(7|3|99)|tok_hidden|the orc lies|secret plan/.test(JSON.stringify(s.m))));
    }
    {   // the waiting peer and the stranger across the whole run heard nothing of the table
        const leak = sentLog.filter(s => /^peer_(w|s\d+|junk|zombie|guess|dropper)/.test(s.to) && !/^(hb|wait|denied|auth)$/.test(s.m.type));
        check('host: across the run, no waiting peer or stranger was sent anything but hb / wait / denied / auth', leak.length === 0, leak.slice(0, 3).map(l => l.to + ':' + l.m.type));
    }
    {   // the GM never saw a raw hostile string in markup: the roster, the players panel, the chat
        await resetWorld(); resetRec();
        drainDialogs(); resetRec();
        const cH = connect('peer_hostile'); hello(cH, { id: 'u_hostile', name: CANARY + '" onmouseover="x', color: 'red' }); flushTimers();
        const dlg = rec.confirms[rec.confirms.length - 1]; if (dlg) { dlg.answered = true; dlg.cb(true); } flushTimers(); await drain();
        document.getElementById('netPlayersBtn').click();
        const raw = rec.html.filter(h => h.v.indexOf(CANARY) >= 0);
        check('host: a hostile player name reaches the roster and the Players panel escaped, never raw', raw.length === 0 && rec.html.some(h => /FUZZCANARY/.test(h.v)), raw.slice(0, 1));
        if (net.roster.peer_hostile) net.kickPlayer('peer_hostile'); flushTimers();
    }
    // every host dialog shown in the run is a known one
    check('host: every dialog raised was a join request or a Start-combat offer', rec.confirms.concat([]).every(c => /wants to join|Start combat/.test(c.text)) && [...confirmsBy.keys()].every(k => /^(hello|target)\|/.test(k)), [...confirmsBy.keys()].slice(0, 5));

    /* =================================================== CLIENT WORLD =================================================== */
    console.log('# client world');
    // the host instance leaves; a second instance of net.js is loaded as the player's app (its own module state)
    net.leaveSession(true); flushTimers();
    installStubs(); window.wpStream = false; window.wpPopout = false;
    localStorage.clear(); localStorage.setItem('wp_profile', JSON.stringify({ id: 'u_p1', name: 'Ayla', color: '#112233' }));
    localStorage.setItem('wp_tableKeys', JSON.stringify({ u_victim: 'VICTIMKEY'.repeat(3), u_gm: K1 }));
    const own = { activeCampaignId: 'camp_tutorial', campaigns: { camp_tutorial: { id: 'camp_tutorial', name: 'My Own', activeItemId: 'home', items: { home: { id: 'home', type: 'map', meta: { title: 'Home' }, whiteboard: [{ id: 'mytok', type: 'circle', isChar: true, ownerId: 'u_p1', x: 1, y: 1, w: 50, h: 50 }], rooms: [], links: [] } }, chars: {} } } };
    stateMod.state.appState = clone(own);
    let cnet;
    try { cnet = factory(stateMod.state, stubs.getActiveCampaign, stubs.findLandingRoom, stubs.landingPoint, stubs.getActiveMap, stubs.save, stubs.toast, stubs.load, stubs.updateCampaignSelect, stubs.updateSidebarNav, stubs.showConfirm); }
    catch (e) { console.log('FAIL      net.js (client instance) threw while loading: ' + e.message); cnet = null; }
    check('a second instance of net.js loads as the player\'s app', !!cnet && window.wpNet === cnet);
    await window.wpVersionReady; await drain(); flushTimers();
    resetRec(); warned.length = 0;
    document.getElementById('netCodeInput').value = 'abcdef'; document.getElementById('netNameInput').value = 'Ayla';
    document.getElementById('netJoinBtn').click();
    const cpeer = peers[peers.length - 1]; cpeer.emit('open'); flushTimers();
    const hconn = cpeer.conns[0]; hconn.emit('open'); flushTimers(); await drain();
    check('the join runs through the real Join button: a hello with this player\'s profile goes out, carrying no key and no proof (a known name is challenged first)', !!hconn && hconn.sent.some(m => m.type === 'hello' && m.profile && m.profile.id === 'u_p1' && !('key' in m) && !('proof' in m)) && !hconn.sent.some(m => JSON.stringify(m).indexOf(K1) >= 0) && cnet.role === 'client' && cnet.active === true, hconn && hconn.sent.map(m => m.type));
    const staleConn = new Conn(hconn.peer + '-stale');   // a connection kept wired after a reconnect (never conns[0])
    const otherConn = new Conn('waypoint-other');        // a host other than the one this player is synced to

    const ctpl = {
        'snapshot': snapshotForClient,
        'item': { type: 'item', campId: 'c1', itemId: 'm_open', item: snapshotForClient.appState.campaigns.c1.items.m_open, ack: 1 },
        'item-fog': mfogForClient || { type: 'item', campId: 'c1', itemId: 'm_fog', item: { id: 'm_fog', type: 'map', meta: { title: 'Dark Cellar' }, fog: { on: true, cell: 50 }, whiteboard: [], rooms: [], links: [] } },   // the fogged map whole, as the host gave it when the player arrived there
        'item-doc': { type: 'item', campId: 'c1', itemId: 'd_notes', item: { id: 'd_notes', type: 'doc', meta: { title: 'Notes' }, blocks: [{ id: 'b1', type: 'p', text: CANARY }] } },
        'item-planner': { type: 'item', campId: 'c1', itemId: 'pl_x', item: { id: 'pl_x', type: 'planner', meta: { title: CANARY }, content: '<script>1</script>' } },
        'itemDelta': { type: 'itemDelta', campId: 'c1', itemId: 'm_open', whiteboard: { set: [{ id: 'tok_npc', type: 'circle', isChar: true, x: 10, y: 10, w: 50, h: 50 }], del: ['tok_npc2'], order: ['tok_p1', 'tok_npc'] }, meta: { title: 'Renamed', gridType: 'hex', cell: 1e300, bg: 'http://evil/x.png' }, links: [['a', 'b', 1, { label: 'L', notes: 'n' }]], cats: { c1: { color: 'red' } }, ack: 2 },
        'itemGone': { type: 'itemGone', campId: 'c1', itemId: 'm_fog' },
        'mapBack': { type: 'mapBack', campId: 'c1', itemId: 'm_fog', meta: { title: CANARY, playerLock: true, parentId: 'm_open', sortIndex: 2 } },   // possession: a map the player left is taken back — its stub in its place
        'mapBack-shown': { type: 'mapBack', campId: 'c1', itemId: 'm_open', meta: { title: 'Open Field' }, item: { id: 'm_open', type: 'map', whiteboard: [{ id: 'evil', type: 'text', text: CANARY }] }, whiteboard: [{ id: 'evil2', type: 'text', text: CANARY }] },   // the map on screen, with a map riding in the word: no honest host sends either
        'stage': { type: 'stage', stage: { campId: 'c1', itemId: 'm_open' }, personal: true },
        'pause': { type: 'pause', on: true }, 'pausePlayer': { type: 'pausePlayer', on: false }, 'snap': { type: 'snap', on: true },
        'stance': { type: 'stance', flags: { elevation: true, posture: false }, camps: {}, campId: 'c1' },
        'travelLock': { type: 'travelLock', on: false }, 'travelDenied': { type: 'travelDenied', reason: 'closed', map: 'Cellar' },
        'handout': { type: 'handout', kind: 'text', text: 'note', title: 'T', caption: 'c', id: 'sh_1', campId: 'c1', gmId: 'u_gm' },
        'notepad': { type: 'notepad', on: true, text: 'hi', campId: 'c1', gmId: 'u_gm', campaign: 'C', gm: 'GM' },
        'combats': { type: 'combats', combats: { m_open: { mapId: 'm_open', round: 1, turn: 0, rows: [{ id: 'row_p1', name: 'Ayla', tokId: 'tok_p1' }, { id: 'row_npc', name: 'Orc', tokId: 'tok_npc' }] } } },
        'targets': { type: 'targets', targets: { u_p2: { id: 'tok_npc', mapId: 'm_open', name: 'Bram' } } },
        'pos': { type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p2', x: 200, y: 210, rot: 45, front: 0, final: true },
        'pos-own': { type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p1', x: 90, y: 90, rot: 0, front: 0, final: true, ack: 3 },
        'wait': { type: 'wait' }, 'auth': { type: 'auth', gmId: 'u_gm', nonce: 'n'.repeat(32) },
        'denied': { type: 'denied', reason: 'no', update: false }, 'kicked': { type: 'kicked' }, 'end': { type: 'end' },
        'char-upload-ans': { type: 'char-upload-ans', rid: 'u1', n: 1, auto: 0, left: 0 }, 'char-pic-ans': { type: 'char-pic-ans', rid: 'p1', ok: true },
        'char-make-ans': { type: 'char-make-ans', rid: 'm1', ok: true, charId: 'c_new' }, 'tok-light-ans': { type: 'tok-light-ans', rid: 'l1', reason: 'cap' },
        'char-review': { type: 'char-review', outcome: 'back', name: 'Ayla', note: 'fix it' }, 'char-upload-done': { type: 'char-upload-done', charId: 'c_p1', done: 1, of: 2 },
        'chars': { type: 'chars', campId: 'c1', chars: { c_p1: { id: 'c_p1', name: 'Ayla', ownerId: 'u_p1', values: { f_str: 15 } } } },
        'char': { type: 'char', campId: 'c1', char: { id: 'c_p1', name: 'Ayla', ownerId: 'u_p1', values: { f_str: 16 } } },
        'charDelta': { type: 'charDelta', campId: 'c1', id: 'c_p1', values: { f_str: 17, f_gmfig: 5 }, unseen: [] },
        'charGone': { type: 'charGone', campId: 'c1', id: 'c_p2' }, 'char-ack': { type: 'char-ack', rid: 'x1' }, 'char-deny': { type: 'char-deny', rid: 'x2', reason: 'slow', msg: 'm' },
        'door-deny': { type: 'door-deny', reason: 'locked' },
        'system': { type: 'system', campId: 'c1', system: snapshotForClient.appState.campaigns.c1.system },
        'docStyle': { type: 'docStyle', campId: 'c1', docStyle: { font: 'serif', textColor: '#112233' } },
        'campFog': { type: 'campFog', campId: 'c1', fog: { sight: 'f_dsv', emptyFog: true } },
        'clock': { type: 'clock', campId: 'c1', clock: { t: 3600, notes: [{ id: 'n_1', day: 1, text: 'Market' }] } },
        'fogDiff': { type: 'fogDiff', campId: 'c1', itemId: 'm_fog', add: [{ item: { id: 'tok_new', type: 'circle', isChar: true, x: 1, y: 1, w: 50, h: 50 }, after: null }], drop: ['tok_far'], lit: [], capped: false },
        'campName': { type: 'campName', campId: 'c1', name: 'Renamed' },
        'libManifest': { type: 'libManifest', campId: 'c1', packs: [{ id: 'p_core', name: 'Core', n: 1, hash: 'abcdef12' }] },
        'lib-idx-ans': { type: 'lib-idx-ans', rid: 'q1', packId: 'p_core', hash: 'abcdef12', page: 0, pages: 1, rows: [] },
        'turnRules': { type: 'turnRules', campId: 'c1', timers: 'owner', fill: 'owner' },
        'newPlayers': { type: 'newPlayers', campId: 'c1', token: 'on', sight: true, create: 'live', fromFile: true },
        'sounds': { type: 'sounds', campId: 'c1', list: [] }, 'sound': { type: 'sound', id: 's1', act: 'play' },
        'music': { type: 'music', campId: 'c1', music: {} }, 'music-ctl': { type: 'music-ctl', act: 'play', id: 't1' },
        'fx': { type: 'fx', kind: 'flash', look: 'gold', mapId: 'm_open' },
        'video': { type: 'video', act: 'offer', id: '0123456789abcdef', name: 'Clip', sdp: 'v=0\r\no=- 1 1 IN IP4 127.0.0.1\r\n' },
        'blast': { type: 'blast', mapId: 'm_open', blast: { x: 1, y: 1, ft: 10, name: CANARY } }, 'blastClear': { type: 'blastClear' },
        'apply': { type: 'apply', id: 'a_1', from: { id: 'u_p2', name: 'Bram' }, label: 'Heal', lines: [{ f: 'HP', text: '+3' }], ts: 1 },
        'acts-left': { type: 'acts-left', charId: 'c_p1', left: { attack: 1 }, mode: 'warn' },
        'turn-note': { type: 'turn-note', text: 'Your turn.', charId: 'c_p1' },
        'due': { type: 'due', id: 'd_1', charId: 'c_p1', from: { id: 'u_gm', name: 'GM', gm: true }, label: 'Regen', ts: 1 },
        'roll': { type: 'roll', id: 'r_abc', from: { id: 'u_p2', name: 'Bram' }, expr: '1d20 + 3', draws: [[17]], v: F.VERSION, ts: 1, label: 'Attack' },
        'roll-deny': { type: 'roll-deny', rid: 'zz', reason: 'slow' },
        'asset-part': { type: 'asset-part', path: '/saves/images/audio/s.mp3', i: 0, n: 1, data: new Uint8Array([1]).buffer },
        'asset': { type: 'asset', path: '/saves/images/pic.png', mime: 'text/html', data: new Uint8Array([60, 115]).buffer },
        'chat': { type: 'chat', text: 'hi', from: { id: 'u_p2', name: 'Bram', gm: true, color: 'red' }, scope: 'global', ts: 1, toName: '' },
        'chat-history': { type: 'chat-history', log: [{ from: { id: 'u_p2', name: 'Bram' }, text: 'old', ts: 1 }, { from: { id: 'u_p2', name: 'Bram' }, roll: { id: 'r_old', from: { id: 'u_p2', name: 'Bram' }, expr: '1d6', draws: [[4]], v: F.VERSION, ts: 2 } }] },
        'roster': { type: 'roster', roster: [{ id: 'u_p1', name: 'Ayla', location: 'm_open', color: '#112233', avatar: 'data:image/png;base64,iVBORw0KGgo=' }, { id: 'u_p2', name: 'Bram', location: 'm_open' }], away: { u_p3: 'm_fog' } },
        'unknown': { type: 'zzz', x: 1 },
        // the players' own words sent AT a player (no client branch: must be ignored)
        'char-edit@client': { type: 'char-edit', rid: 'r1', charId: 'c_p1', fieldId: 'f_str', value: 1 }, 'needItem@client': { type: 'needItem', campId: 'c1', itemId: 'm_open' }, 'hello@client': { type: 'hello', profile: { id: 'u_gm' } }
    };

    const confirmsC = new Map(); const ownCamp = () => stateMod.state.appState.campaigns.camp_tutorial;
    const campC = () => stateMod.state.appState.campaigns.c1, tokC = (mid, id) => (campC().items[mid].whiteboard || []).find(w => w.id === id);
    const expectClient = {
        'itemDelta': () => tokC('m_open', 'tok_npc').x === 10 && !tokC('m_open', 'tok_npc2') && campC().items.m_open.meta.title === 'Renamed',
        'itemGone': () => !campC().items.m_fog,
        'mapBack': () => { const m = campC().items.m_fog; return !!m && m.stub === true && m.whiteboard.length === 0 && m.rooms.length === 0 && !m.fog && m.meta.title === CANARY && m.meta.playerLock === true && Object.keys(m.meta).length === 4; },
        'mapBack-shown': () => { const m = campC().items.m_open; return !!m && m.stub === true && m.whiteboard.length === 0 && JSON.stringify(m).indexOf(CANARY) < 0 && campC().activeItemId === 'm_open'; },
        'stage': () => campC().activeItemId === 'm_open' && rec.toasts.some(t => /arrive/.test(t)),
        'pause': () => cnet.paused === true, 'snap': () => cnet.tableSnapOn === true, 'stance': () => !!cnet.stance,
        'handout': () => rec.journal.length === 1, 'notepad': () => cnet.notepad && cnet.notepad.on === true,
        'combats': () => cnet.combats.m_open && cnet.combats.m_open.rows.length === 2,
        'targets': () => cnet.targets.u_p2 && cnet.targets.u_p2.id === 'tok_npc',
        'pos': () => tokC('m_open', 'tok_p2').x === 200 && tokC('m_open', 'tok_p2').rot === 45,
        // 'auth' is answered before the snapshot only (checked there); after it the branch is inert by design
        'chars': () => campC().chars.c_p1.values.f_str === 15, 'char': () => campC().chars.c_p1.values.f_str === 16,
        'charDelta': () => campC().chars.c_p1.values.f_str === 17 && campC().chars.c_p1.values.f_gmfig === undefined,
        'charGone': () => !campC().chars.c_p2, 'campName': () => campC().name === 'Renamed', 'clock': () => campC().clock && campC().clock.t === 3600,
        'fogDiff': () => !!tokC('m_fog', 'tok_new') && !tokC('m_fog', 'tok_far'), 'docStyle': () => campC().docStyle && campC().docStyle.font === 'serif',
        'turnRules': () => campC().turnRules.timers === 'owner', 'acts-left': () => cnet.actsLeft && cnet.actsLeft.c_p1 && cnet.actsLeft.c_p1.left.attack === 1,
        'chat': () => rec.text.some(t => t.v === 'hi'), 'turn-note': () => rec.toasts.some(t => t === 'Your turn.'), 'travelDenied': () => rec.toasts.some(t => /Cellar/.test(t)),
        'roster': () => cnet.roster.u_p2 && cnet.roster.u_p2.name === 'Bram' && cnet.away.u_p3 === 'm_fog' && rec.html.some(h => /Bram/.test(h.v)),
        'denied': () => rec.text.some(t => t.v === 'no') && cnet.leaving === false, 'end': () => rec.text.some(t => /ended/.test(t.v))
    };
    const HELD_KEYS = [K1, 'VICTIMKEY'.repeat(3)];   // the table keys this player holds (for u_gm and for another GM): none may ever be sent, in any field
    let revived = 0; const revivedOdd = [];
    async function fireClient(from, kind, mut, msg) {
        probes++;
        const conn = from === 'host' ? hconn : from === 'stale' ? staleConn : otherConn;
        clockOff += 1500;
        const before = snapOf(cnet); resetRec(); warned.length = 0; flushed.threw.length = 0; const sb = sentLog.length;
        const lsBefore = localStorage.dump();
        const wasActive = cnet.active, wasForeign = cnet.foreign, wasSynced = cnet.syncedPeer;
        const authMay = msg && msg.type === 'auth' && conn && !conn.wpAuthDone;   // the auth branch marks the connection as it starts its (asynchronous) answer
        const t0 = performance.now(); let threw = null;
        try { cnet._handleMessage(msg, conn); } catch (e) { threw = e; } finally { cnet.applyingRemote = false; }
        try { flushTimers(); } catch (e) { threw = threw || e; }
        await drain(); flushTimers();
        if (conn && conn.wpSnapWait) { await settle(() => !conn.wpSnapWait); await drain(); flushTimers(); }   // a snapshot whose signature is being checked (off the main thread): its oracles wait for the verdict
        if (authMay && conn.wpAuthDone) await settle(() => sentLog.length > sb);   // the proof is computed off the main thread: wait for the answer so this probe's oracles see it
        const dt = performance.now() - t0;
        let after = snapOf(cnet);
        const tag = kind + ' from ' + (from === 'host' ? 'the synced host' : from === 'stale' ? 'a stale connection' : 'another host');
        if (!after || !before) { finding('client: a structure nested past 200 levels is kept in the campaign copy (JSON.stringify of it overflows on Node 22)', tag, { msg, depth: 'past what JSON.stringify can serialise here' }, mut); after = after || EMPTY_SNAP; }
        else { const dp = depthOf(after.app); if (dp > 200) finding('client: a structure nested past 200 levels is kept in the campaign copy (JSON.stringify of it overflows on Node 22)', tag, { msg, depth: dp + ' levels' }, mut); }
        if (threw) finding('exception escapes handleMessage (client)', tag + ' — ' + threw.constructor.name + ': ' + String(threw.message).slice(0, 120), msg, mut);
        flushed.threw.forEach(e => finding('exception in a timer the message armed (client)', tag + ' — ' + String(e.message).slice(0, 120), msg, mut));
        const changes = before && after !== EMPTY_SNAP ? diffOf(before, after) : [];
        const padd = protoAdded(); if (padd.length) finding('prototype pollution (client)', tag + ' → ' + padd.join(', '), msg, mut);
        if (cnet.targets && Object.getPrototypeOf(cnet.targets) !== Object.prototype) { finding('client: net.targets re-parented by a "__proto__" key from the host', tag, msg, mut); cnet.targets = {}; }
        if (cnet.combats && Object.getPrototypeOf(cnet.combats) !== Object.prototype) { finding('client: net.combats re-parented by a "__proto__" key from the host', tag, msg, mut); cnet.combats = {}; }
        if (from !== 'host') { const w = changes.filter(c => !/^\.(active|role)$/.test(c.path)); if (w.length) finding('client: a connection other than the synced host writes state', tag + ' → ' + w[0].path.replace(/\[id=[^\]]+\]/g, '[id=…]').replace(/\.whiteboard.*$/, '.whiteboard'), msg, mut); }
        if (!cnet.foreign) { const w = changes.filter(c => /^\.app\.campaigns\.camp_tutorial/.test(c.path)); if (w.length) finding('client: a message before the snapshot writes into the player\'s OWN campaign', tag + ' → ' + w[0].path.replace(/\[id=[^\]]+\]/g, '[id=…]').replace(/\.whiteboard.*$/, '.whiteboard'), msg, mut); }
        const lsAfter = localStorage.dump(); Object.keys(lsAfter).concat(Object.keys(lsBefore)).forEach(k => { if (lsAfter[k] !== lsBefore[k] && k !== 'wp_vtt_local' && !(k === 'wp_tableKeys' && msg.type === 'snapshot')) finding('client: localStorage written by a message', tag + ' → ' + k, msg, mut); });
        if (msg.type === 'snapshot' && lsAfter.wp_tableKeys !== lsBefore.wp_tableKeys) { try { const k = JSON.parse(lsAfter.wp_tableKeys); if (k.u_victim !== 'VICTIMKEY'.repeat(3) || Object.keys(k).some(x => x !== 'u_victim' && x !== 'u_gm')) finding('client: a snapshot stores its key under ANY gmId the host names (another GM\'s key overwritten, localStorage bloats)', tag, { msg, wp_tableKeys: k }, mut); } catch (e) {} }
        const outK = sentLog.slice(sb).filter(s => { let j; try { j = JSON.stringify(s.m); } catch (e) { j = ''; } return HELD_KEYS.some(k => j.indexOf(k) >= 0); });
        if (outK.length) finding('client: a table key this player holds is sent (the key never travels: a proof over it does)', tag + ' → ' + outK[0].m.type + ' carrying a held key, for gmId ' + short(msg.gmId), msg);
        if (msg && msg.type === 'auth') sentLog.slice(sb).filter(s => s.m.type === 'hello' && 'proof' in s.m).forEach(s => {   // a proof, when one goes out, is over the key held for the GM named, the host's nonce and the room THIS app dialled — never over a room or a text the host chose
            const held = { u_gm: K1, u_victim: 'VICTIMKEY'.repeat(3) }, k = typeof msg.gmId === 'string' && Object.prototype.hasOwnProperty.call(held, msg.gmId) ? held[msg.gmId] : null;
            const want = k && typeof msg.nonce === 'string' && msg.nonce.length >= 16 && msg.nonce.length <= 128 ? proofFor(k, msg.nonce, conn.peer) : null;
            if (s.m.proof !== want) finding('client: the auth answer\'s proof is not the one over the room this app dialled (or one is sent with no usable key or nonce)', tag + ' → proof ' + short(s.m.proof) + ' for gmId ' + short(msg.gmId), msg, mut);
        });
        if (rec.saves.length) finding('client: a message reaches save()', tag + (rec.saves.some(s => s.persist) ? ' AND it would persist' : ' (io.js refuses it while foreign)'), msg, mut);
        rec.fetches.forEach(f => finding('client: a message causes a fetch', tag + ' → ' + f.url.slice(0, 80), msg, mut));
        rec.html.forEach(h => { if (h.v.indexOf(CANARY) >= 0) finding('client: raw hostile string in a markup sink (innerHTML)', tag + ' → #' + h.el, msg); });
        rec.attr.forEach(h => { if (h.v.indexOf(CANARY) >= 0) finding('client: raw hostile string in an attribute sink', tag + ' → #' + h.el + '.' + h.k, msg); });
        rec.attr.forEach(h => { if (/^(src|href)$/.test(h.k) && /^(https?:)?\/\//.test(h.v)) finding('client: a web address reaches src/href (an IP beacon)', tag + ' → ' + h.v.slice(0, 60), msg); });
        rec.style.forEach(h => { if (/NaN|undefined|\[object|Infinity/.test(h.v)) finding('client: garbage from the host reaches a CSS value', tag + ' → ' + h.k + '=' + h.v.slice(0, 40), msg, mut); });
        [].concat(rec.html, rec.text, rec.attr).forEach(h => { if (h.v.length > 60000) finding('client: an unbounded string reaches the page', tag + ' → #' + h.el + ' (' + h.v.length + ' chars)', msg, mut); });
        if (longest(after.app) > 100000) finding('client: an unbounded string is kept in the campaign copy', tag, msg, mut);
        if (longest(after.roster) > 100000) finding('client: an unbounded string is kept on the roster copy', tag, msg, mut);
        const hostedC = after.app.campaigns && after.app.campaigns.c1; if (hostedC && hostedC.items) Object.keys(hostedC.items).forEach(id => { const it = hostedC.items[id]; if (it && it.type === 'map' && Array.isArray(it.whiteboard)) it.whiteboard.forEach(w => { if (w && ['x', 'y', 'rot', 'front'].some(k => w[k] !== undefined && (typeof w[k] !== 'number' || !isFinite(w[k])))) finding('client: untyped geometry from the host is kept on a token of the copy', tag + ' → ' + id + '/' + w.id, { msg, kept: { x: w.x, y: w.y, rot: w.rot, front: w.front } }, mut); }); });
        rec.confirms.forEach(c => { const k = msg.type; confirmsC.set(k, (confirmsC.get(k) || 0) + 1); if (confirmsC.get(k) === 2) finding('client: a dialog the host can raise again and again, with its own text', msg.type + ' → "' + c.text.slice(0, 80) + '"', msg); });
        if (rec.confirms.some(c => c.text.indexOf(CANARY) >= 0)) finding('client: a dialog shows host-chosen text verbatim', tag, msg);
        if (dt > 200) { const t1 = performance.now(); try { cnet._handleMessage(clone(msg), conn); } catch (e) {} finally { cnet.applyingRemote = false; } flushTimers(); const dt2 = performance.now() - t1; if (dt2 > 200) finding('client: one message takes more than 200 ms', tag + ' (' + Math.round(dt) + ' ms, again ' + Math.round(dt2) + ' ms)', msg, mut); }
        warned.forEach(w => { if (/wire send failed/.test(w)) finding('client: a send the packer refused', tag + ' → ' + w.slice(0, 100), msg); });
        const endsSession = from === 'host' && conn === hconn && /^(denied|kicked|end)$/.test(String(msg && msg.type));   // the dialled host's own three words end the join: the app's load() of its own campaign is the honest teardown
        if (rec.loads && !endsSession) finding('client: a message makes the app reload its own campaign (load())', tag, msg, mut);
        // the handlers that end the session leave marks a later probe must not inherit
        cnet.leaving = false;
        if (wasActive && (!cnet.active || cnet.role !== 'client' || !hconn.open)) {   // the join was torn down (as the app does on denied / kicked / end): the stand-in connection and the join are revived, synced again only if they were, so the next probe is judged on a live join as a re-dial would give
            if (!endsSession) revivedOdd.push(tag);   // torn down by a word that should not end it: the scenario checks say so; noted here too
            cnet.active = true; cnet.role = 'client'; cnet.conns = [hconn]; hconn.open = true; revived++;
            cnet.foreign = wasForeign; cnet.syncedPeer = wasSynced;
        }
        return { threw, changes, dt };
    }

    // 1. before the snapshot: the player's own campaign is in memory; the host (or a stale connection) names it
    const preTypes = ['item', 'itemDelta', 'pos', 'stage', 'pause', 'handout', 'combats', 'targets', 'chat-history', 'notepad', 'denied', 'char-upload-done'];
    for (const k of preTypes) {
        const m = clone(ctpl[k]); const s = JSON.stringify(m).replace(/"c1"/g, '"camp_tutorial"').replace(/"m_open"/g, '"home"').replace(/"tok_p2"/g, '"mytok"');
        await fireClient('host', k + ' (pre-snapshot)', 'naming the player\'s own campaign', JSON.parse(s));
        await fireClient('stale', k + ' (pre-snapshot)', 'naming the player\'s own campaign', JSON.parse(s));
    }
    check('client: before the snapshot nothing from a host names or changes the player\'s own campaign in memory', !openFindings().some(f => /before the snapshot/.test(f.kind)), openFindings().filter(f => /before the snapshot/.test(f.kind)).map(f => f.detail).slice(0, 3));
    // the key challenge, before the snapshot (that is when a host asks). The app answers once per connection; the suite clears that mark
    // between probes so each is judged as the first challenge of a fresh connection
    {
        const N = 'n'.repeat(32); let s0 = sentLog.length; hconn.wpAuthDone = false;
        await fireClient('host', 'auth', 'well-formed (the GM this app holds a key for)', { type: 'auth', gmId: 'u_gm', nonce: N });
        const said = sentLog.slice(s0).map(x => x.m).filter(m => m.type === 'hello');
        check('client: the well-formed auth takes effect — one hello answers it with the proof over the key held for this GM, the host\'s nonce and the room this app dialled; no key in any field', said.length === 1 && said[0].proof === proofFor(K1, N, hconn.peer) && !('key' in said[0]) && said[0].profile && said[0].profile.id === 'u_p1' && JSON.stringify(said).indexOf(K1) < 0, said);
        s0 = sentLog.length; hconn.wpAuthDone = false;
        await fireClient('host', 'auth (victim gmId)', 'gmId of another GM', { type: 'auth', gmId: 'u_victim', nonce: N });
        const saidV = sentLog.slice(s0).map(x => x.m).filter(m => m.type === 'hello');
        check('client: an auth naming another GM\'s id is never answered with that GM\'s table key — a proof bound to the room this app dialled at most (useless at that GM\'s own room), and no held key in any field', saidV.length === 1 && JSON.stringify(saidV).indexOf('VICTIMKEY') < 0 && JSON.stringify(saidV).indexOf(K1) < 0 && !('key' in saidV[0]) && !openFindings().some(f => /key this player holds is sent|not the one over the room/.test(f.kind)), saidV);
        s0 = sentLog.length; hconn.wpAuthDone = false;
        await fireClient('host', 'auth (no nonce)', 'a host from before the proof asks with no nonce', { type: 'auth', gmId: 'u_gm' });
        const saidO = sentLog.slice(s0).map(x => x.m).filter(m => m.type === 'hello');
        check('client: an auth with no usable nonce (an older host) gets a plain hello — no proof, no key', saidO.length === 1 && !('proof' in saidO[0]) && !('key' in saidO[0]) && JSON.stringify(saidO).indexOf(K1) < 0, saidO);
        await fireClient('stale', 'auth', 'from a stale connection', { type: 'auth', gmId: 'u_victim', nonce: N });
        await fireClient('other', 'auth', 'from another host', { type: 'auth', gmId: 'u_gm', nonce: N });
        check('client: an auth on a connection other than the one this app dialled is not answered', !sentLog.some(s => s.to !== hconn.peer && s.m.type === 'hello'));
        // the auth branch itself fuzzed, before the snapshot (after it the branch is inert by design): each mutation as the first challenge of its connection
        const s1 = sentLog.length;
        for (const m of mutations(ctpl.auth)) { hconn.wpAuthDone = false; await fireClient('host', 'auth', m.name, m.msg); }
        check('client: every mutation of the auth challenge is answered with at most one hello, never a held key, and a proof only over the room dialled', !openFindings().some(f => /^exception escapes handleMessage \(client\)/.test(f.kind) && /^auth /.test(f.detail)) && !sentLog.slice(s1).some(s => HELD_KEYS.some(k => JSON.stringify(s.m).indexOf(k) >= 0)), openFindings().filter(f => /^auth /.test(f.detail)).map(f => f.kind).slice(0, 3));
        hconn.wpAuthDone = false;
    }

    // 2. the snapshot, then every type from the synced host with mutations; from a stale and another connection the well-formed example
    await fireClient('host', 'snapshot', 'well-formed (the real one the host made for this player)', clone(snapshotForClient));
    check('client: the snapshot syncs (foreign, the hosted campaign on screen, the key remembered under the real gmId)', cnet.foreign === true && stateMod.state.appState.activeCampaignId === 'c1' && cnet.syncedPeer === hconn.peer && JSON.parse(localStorage.getItem('wp_tableKeys')).u_gm === snapshotForClient.key);
    const snapEvil = clone(snapshotForClient); snapEvil.gmId = 'u_victim'; snapEvil.key = 'OVERWRITTEN';
    await fireClient('host', 'snapshot (gmId=victim)', 'a second snapshot naming another GM', snapEvil);
    check('client: a snapshot cannot overwrite the key held for another GM', JSON.parse(localStorage.getItem('wp_tableKeys')).u_victim === 'VICTIMKEY'.repeat(3));
    await fireClient('host', 'snapshot', 'the real one again', clone(snapshotForClient));
    // the fogged map, held as a stub from the snapshot, is given whole as the host does when its player arrives there
    check('client: the snapshot holds the fogged map as a stub (the player has not been there)', !!campC().items.m_fog && campC().items.m_fog.stub === true);
    await fireClient('host', 'item-fog', 'the fogged map whole, as the host gives it on arrival', clone(ctpl['item-fog']));
    check('client: the fogged map given whole replaces its stub (the player\'s own token on it)', !!campC().items.m_fog && !campC().items.m_fog.stub && !!tokC('m_fog', 'tok_p1b'), campC().items.m_fog && { stub: campC().items.m_fog.stub, ids: (campC().items.m_fog.whiteboard || []).map(w => w.id) });
    const pristineC = clone(stateMod.state.appState);
    function resetClient() { stateMod.state.appState = clone(pristineC); cnet.leaving = false; cnet.foreign = true; cnet.active = true; cnet.role = 'client'; cnet.conns = [hconn]; cnet.syncedPeer = hconn.peer; resetRec(); }

    for (const kind of Object.keys(ctpl)) {
        if (kind === 'snapshot') continue;
        const tpl = ctpl[kind];
        resetClient();
        const muts = mutations(tpl);
        for (const m of muts) {
            const s0 = sentLog.length;
            await fireClient('host', kind, m.name, m.msg);
            if (m.name === 'well-formed' && expectClient[kind]) { let ok = false; try { ok = !!expectClient[kind](sentLog.slice(s0).map(x => x.m)); } catch (e) { ok = false; } check('client: the well-formed ' + kind + ' takes effect (the fuzz reaches the real path)', ok, { toasts: rec.toasts.slice(0, 3) }); }
            if (/^(end|kicked|denied)/.test(kind)) { cnet.leaving = false; cnet.active = true; cnet.role = 'client'; }
        }
        resetClient();
        for (const m of muts.slice(0, 10)) { await fireClient('stale', kind, m.name, m.msg); }
        for (const m of muts.slice(0, 10)) { await fireClient('other', kind, m.name, m.msg); }
        // a flood of 500 from the host
        resetClient(); const tf = performance.now(); let threwN = 0, rendersB = rec.renders;
        for (let i = 0; i < 500; i++) { const m = clone(tpl); if (m.id && typeof m.id === 'string') m.id = 'r_' + i; try { cnet._handleMessage(m, hconn); } catch (e) { threwN++; } finally { cnet.applyingRemote = false; cnet.leaving = false; } }
        flushTimers(); await drain(); flushTimers();
        const dtf = performance.now() - tf;
        if (dtf > 2000) finding('client: a flood of 500 takes more than 2 s', kind + ' (' + Math.round(dtf) + ' ms)', tpl);
        if (threwN) finding('exception escapes handleMessage (client)', kind + ' during a flood', tpl);
        checks++; const bad = openFindings().some(f => f.detail.indexOf(kind + ' ') === 0 || f.detail.indexOf(kind + '|') === 0 || f.detail === kind);
        if (bad) checksFailed++;
        console.log((bad ? 'FAIL      ' : 'ok        ') + 'client: ' + kind + ' — ' + muts.length + ' mutations × host, 10 × stale, 10 × another host, a flood of 500');
    }
    {   // the snapshot itself fuzzed (after the real one so the app stays synced)
        const muts = mutations(snapshotForClient).filter(m => !/appState=|\.campaigns/.test(m.name) || /appState=\{\}|appState=null|appState=\[\]/.test(m.name)).slice(0, 80);
        resetClient();
        for (const m of muts) { localStorage.setItem('wp_tableKeys', JSON.stringify({ u_victim: 'VICTIMKEY'.repeat(3), u_gm: snapshotForClient.key })); await fireClient('host', 'snapshot', m.name, m.msg); if (stateMod.state.appState.activeCampaignId !== 'c1') resetClient(); }
        const hostile = clone(snapshotForClient); hostile.appState.campaigns.c1.items.m_open.whiteboard.push({ id: 'evil', type: 'text', text: '<img src=x onerror=alert(1)>' + CANARY, x: 0, y: 0, w: 1, h: 1 }, { id: 'evil2', type: 'circle', isChar: true, x: '1e3', y: {}, w: NaN, light: { bright: 1e300 }, senses: [{ id: 'x', r: 1 }], blind: true, ownerId: 'u_p1', fxb: [{ n: CANARY, i: 'x', t: 'buff' }] });
        hostile.appState.campaigns.c1.items.__proto__ = { polluted: 1 }; hostile.appState.campaigns.constructor = { id: 'constructor', type: 'map', items: {} };
        hostile.appState.campaigns.c1.players = { u_p1: { key: 'STOLEN' } };
        await fireClient('host', 'snapshot', 'hostile items, a players record, prototype keys as campaign ids', hostile);
        const camp = stateMod.state.appState.campaigns.c1;
        const txt = camp && camp.items.m_open.whiteboard.find(w => w.id === 'evil');
        check('client: a hostile snapshot keeps no players record, no prototype-keyed campaign, and its text item is rebuilt by the sanitiser (escaped here: no DOMParser under node)', camp && !camp.players && !Object.prototype.hasOwnProperty.call(stateMod.state.appState.campaigns, 'constructor') && (!txt || txt.text.indexOf(CANARY) < 0), txt && txt.text.slice(0, 80));
        const ev2 = camp && camp.items.m_open.whiteboard.find(w => w.id === 'evil2');
        check('client: a token\'s senses, blind tick and effects from the host are cleaned again on its own token (fxb bounded with a cleaned icon, senses the cleaner\'s or gone, blind only as true)', !!ev2 && (!ev2.fxb || ev2.fxb.every(e => typeof e.n === 'string' && e.n.length <= 60 && typeof e.i === 'string')) && (ev2.senses === undefined || Array.isArray(ev2.senses)) && (ev2.blind === undefined || ev2.blind === true), ev2 && { fxb: ev2.fxb, senses: ev2.senses, blind: ev2.blind });
        resetClient();
    }
    {   // ordering on the client: a roll replayed, a delta before its item, chat-history from.id unbounded, a stale drag
        resetClient(); const r = clone(ctpl.roll);
        await fireClient('host', 'roll replay', 'the same record twice', r); await fireClient('host', 'roll replay', 'the same record twice', r);
        await fireClient('host', 'itemDelta before item', 'a delta for a map not held', Object.assign(clone(ctpl.itemDelta), { itemId: 'm_unknown' }));
        const asked = sentLog.some(s => s.m.type === 'needItem' && s.m.itemId === 'm_unknown');
        check('client: a delta for a map it does not hold asks the host for the whole map', asked);
        resetRec();
        const h = clone(ctpl['chat-history']); h.log = [{ from: { id: BIG, name: 'x' }, text: 'y', ts: 'now' }];
        await fireClient('host', 'chat-history', 'from.id of 1e6 chars, ts a string', h);
        const big = rec.text.concat(rec.html).some(x => x.v.length > 60000);
        check('client: a chat-history line with a 1e6-char sender id is bounded before it is kept or drawn', !big && !openFindings().some(f => /unbounded/.test(f.kind) && /chat-history/.test(f.detail)));
    }
    {   // the end / kicked / denied words: each ends the session once; a stale connection may not
        resetClient(); resetRec(); const was = cnet.active;
        await fireClient('stale', 'end', 'from a stale connection', { type: 'end' });
        const endedByStale = !(cnet.active === was && !rec.toasts.some(t => /ended/.test(t)));
        if (endedByStale) finding('client: a connection other than the synced host ends the session', 'end from a stale connection (the end branch has no gate on the connection it came by; denied and kicked take the dialled host\'s word only)', { type: 'end' });
        check('client: an "end" from a connection other than the synced host does not end the session', !endedByStale, rec.toasts.slice(0, 2));
        resetClient(); resetRec();
        await fireClient('host', 'denied', 'update dialog with host text', { type: 'denied', reason: 'Run this command to fix your install: ' + CANARY, update: true });
        check('client: a "denied" with update:true raises a dialog with the host\'s own text (an avenue for a phishing-style prompt)', rec.confirms.length === 0, rec.confirms.map(c => c.text.slice(0, 60)));
        resetClient();
    }
    {   // the player's own moves are never undone by a host's pos for their token with a pending action? (actPos) — and a host's pos geometry is typed
        resetClient(); resetRec();
        await fireClient('host', 'pos typed', 'strings and objects as geometry', { type: 'pos', campId: 'c1', itemId: 'm_open', wbId: 'tok_p2', x: 'calc(1px)', y: { a: 1 }, rot: 'NaNdeg', front: [] });
        const t2 = stateMod.state.appState.campaigns.c1.items.m_open.whiteboard.find(w => w.id === 'tok_p2');
        check('client: a host\'s pos is applied to the copy only with numeric geometry', typeof t2.x === 'number' && typeof t2.y === 'number' && typeof t2.rot === 'number', { x: t2.x, y: t2.y, rot: t2.rot });
    }
    check('client: every dialog raised in the run was one the app owns (none with host text)', !openFindings().some(f => /dialog/.test(f.kind) && /client/.test(f.kind)));
    check('client: across the run the join was torn down only by denied / kicked / end from the dialled host (' + revived + ' revivals of the stand-in join)', revivedOdd.length === 0, revivedOdd.slice(0, 3));

    /* ---------- the GM this app knows (the signing key, trust on first use): the real join against hosts that are and are not that GM ---------- */
    {
        const gmS = mkSigner(), sqS = mkSigner();   // the GM's pair and a stand-in host's, both Node's own: nothing here is signed by the app's code
        const lsJ = k => { try { const o = JSON.parse(localStorage.getItem(k) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
        const signedSnap = (signer, c, over) => { const s = Object.assign(clone(snapshotForClient), over || {}); s.gmPub = Object.assign({}, signer.pub); s.sig = signer.sign(snapText(c.wpCn, c.peer, s.gmId, s.key)); return s; };
        const dial = () => { const p = peers[peers.length - 1]; p.emit('open'); flushTimers(); const c = p.conns[0]; c.emit('open'); flushTimers(); return c; };   // the newest peer registers and its connection to the room opens
        const freshJoin = () => { document.getElementById('netJoinBtn').click(); return dial(); };   // a join the player begins, through the real Join button
        const give = async (c, m) => { let threw = null; try { cnet._handleMessage(m, c); } catch (e) { threw = e; } finally { cnet.applyingRemote = false; } await settle(() => !c.wpSnapWait); await drain(); return threw; };
        const SAID = 'This table\u2019s GM is not the one you know from this room code \u2014 the GM may have reinstalled, or someone else is at that code.';
        const ASKED = 'This table\u2019s GM is not the one you know from this room code. The GM may have reinstalled or moved to another computer \u2014 or someone else is at that code. If you are not sure, ask your GM before you say yes. Trust this table\u2019s GM from now on, and join?';
        const canary = () => [].concat(rec.html, rec.text, rec.attr).some(x => x.v.indexOf(CANARY) >= 0) || rec.toasts.some(t => t.indexOf(CANARY) >= 0) || rec.confirms.some(d => d.text.indexOf(CANARY) >= 0);
        cnet.leaveSession(true); flushTimers(); cnet.foreign = false; cnet.leaving = false; stateMod.state.appState = clone(own);
        localStorage.removeItem('wp_gmPins'); localStorage.removeItem('wp_gmRooms'); localStorage.setItem('wp_tableKeys', JSON.stringify({ u_victim: 'VICTIMKEY'.repeat(3), u_gm: K1 }));
        resetRec(); warned.length = 0;

        // 1. first use
        const c1 = freshJoin(), h1 = c1.sent.find(m => m.type === 'hello');
        const t1 = await give(c1, signedSnap(gmS, c1));
        check('client (the GM this app knows): a first join pins the GM — the hello carries this connection\'s own nonce, the snapshot signed over it, the room dialled, the GM id and the table key is taken, the GM\'s key kept by its four public fields, the room code remembered as that GM\'s, the table key stored, no question asked',
            !t1 && !!h1 && h1.cn === c1.wpCn && /^[0-9a-f]{32}$/.test(String(h1.cn)) && !('key' in h1) && cnet.syncedPeer === c1.peer && cnet.foreign === true && JSON.stringify(lsJ('wp_gmPins').u_gm) === JSON.stringify(gmS.pub) && lsJ('wp_gmRooms').c_abcdef === 'u_gm' && lsJ('wp_tableKeys').u_gm === K1 && rec.confirms.length === 0,
            { threw: t1 && t1.message, cn: h1 && h1.cn, synced: cnet.syncedPeer, pins: lsJ('wp_gmPins'), rooms: lsJ('wp_gmRooms'), confirms: rec.confirms.length });

        // 2. the link drops; the app dials again by itself; the next generation of the code is held by someone else, the one after by the GM
        resetRec(); const keys0 = localStorage.getItem('wp_tableKeys'), pins0 = localStorage.getItem('wp_gmPins'), app0 = JSON.stringify(stateMod.state.appState);
        c1.close(); flushTimers();
        peers[peers.length - 1].emit('error', { type: 'peer-unavailable' }); flushTimers();   // the generation that last answered is gone
        const c2 = dial(), evil = signedSnap(sqS, c2, { key: 'e'.repeat(32), reason: CANARY, notepad: { type: 'notepad', on: true, text: CANARY, gmId: 'u_gm', campaign: CANARY, gm: CANARY } });
        evil.appState.campaigns.c1.name = 'Not your table ' + CANARY;
        const t2 = await give(c2, evil), t2b = await give(c2, { type: 'chat', text: CANARY, from: { id: 'u_gm', name: 'GM', gm: true } });
        const after2 = { open: c2.open, synced: cnet.syncedPeer, same: JSON.stringify(stateMod.state.appState) === app0, keys: localStorage.getItem('wp_tableKeys') === keys0, pins: localStorage.getItem('wp_gmPins') === pins0, confirms: rec.confirms.length, said: rec.toasts.filter(t => t.indexOf(SAID) === 0).length, canary: canary(), active: cnet.active };
        flushTimers();   // the reconnect goes on: the generations after it are not there, and the round comes back to the one refused
        const gone = () => { const p = peers[peers.length - 1]; p.emit('open'); const id = p.conns[0].peer; p.emit('error', { type: 'peer-unavailable' }); flushTimers(); return id; };
        const walked = [gone(), gone(), gone()];
        const c3 = dial(), t3 = await give(c3, signedSnap(gmS, c3));
        check('client (the GM this app knows): on an automatic reconnect a snapshot from whoever holds the next generation of the room code — its own key pair, the GM\'s id, its own text — is refused: nothing synced or applied, nothing more read from it, the stored key and the pin untouched, the connection closed from this side, no question, the notice in the app\'s own words; the reconnect then dials the generations after it and, the round done, passes over the one it refused — where the GM answers, its own snapshot is taken with no question',
            !t2 && !t2b && c2.peer === 'waypoint-abcdef-r1' && after2.open === false && after2.synced === null && after2.same && after2.keys && after2.pins && after2.confirms === 0 && after2.said === 1 && !after2.canary && after2.active === true
            && JSON.stringify(walked) === JSON.stringify(['waypoint-abcdef-r2', 'waypoint-abcdef-r3', 'waypoint-abcdef']) && !t3 && c3.peer === 'waypoint-abcdef-r2' && cnet.syncedPeer === c3.peer && rec.confirms.length === 0 && rec.toasts.filter(t => t.indexOf(SAID) === 0).length === 1 && localStorage.getItem('wp_gmPins') === pins0 && lsJ('wp_tableKeys').u_gm === K1,
            { c2: c2.peer, after2, walked, c3: c3.peer, synced: cnet.syncedPeer, toasts: rec.toasts.slice(0, 4) });

        // 3. every variation of the signed snapshot, each on a join of its own: taken only when the independent reading says so
        const others = [
            ['another key pair, rightly signing its own snapshot under the GM\'s id', c => signedSnap(sqS, c)],
            ['the GM\'s signature made for another connection\'s nonce', c => { const s = signedSnap(gmS, c); s.sig = gmS.sign(snapText('0'.repeat(32), c.peer, 'u_gm', K1)); return s; }],
            ['the GM\'s signature made for another room id', c => { const s = signedSnap(gmS, c); s.sig = gmS.sign(snapText(c.wpCn, c.peer + '-r1', 'u_gm', K1)); return s; }],
            ['the table key changed after signing', c => Object.assign(signedSnap(gmS, c), { key: 'f'.repeat(32) })],
            ['no key and no signature (as an older host)', c => { const s = signedSnap(gmS, c); delete s.gmPub; delete s.sig; return s; }],
            ['another GM id at this room code, rightly signed by its own key', c => signedSnap(sqS, c, { gmId: 'u_other', notepad: null })],
            ['the signature in upper case', c => { const s = signedSnap(gmS, c); s.sig = s.sig.toUpperCase(); return s; }],
            ['the pinned key shown, signed by another', c => { const s = signedSnap(sqS, c); s.gmPub = Object.assign({}, gmS.pub); return s; }]
        ];
        const tplS = { type: 'snapshot', gmId: 'u_gm', key: K1, gmPub: Object.assign({}, gmS.pub), sig: 'f'.repeat(128) }, nMut = mutations(tplS).length;
        let took = 0, refused = 0, stricter = 0, tookOther = 0; const f0 = found.size;
        for (let i = 0; i < nMut + others.length; i++) {
            probes++;
            const c = freshJoin(); let msg, name;
            if (i < nMut) {
                const m = mutations({ type: 'snapshot', gmId: 'u_gm', key: K1, gmPub: Object.assign({}, gmS.pub), sig: gmS.sign(snapText(c.wpCn, c.peer, 'u_gm', K1)) })[i]; msg = m.msg; name = m.name;
                if (msg && typeof msg === 'object') Object.keys(snapshotForClient).forEach(k => { if (!hasOwn(tplS, k) && !hasOwn(msg, k)) msg[k] = clone(snapshotForClient[k]); });   // the rest of a snapshot rides along (none of it is signed)
            } else { name = others[i - nMut][0]; msg = others[i - nMut][1](c); }
            const lsB = localStorage.dump(), want = msg && msg.type === 'snapshot' ? gmJudge(lsB, msg, c, 'abcdef') : 'refuse';
            resetRec(); warned.length = 0;
            const thr = await give(c, msg); flushTimers();
            const tk = cnet.syncedPeer === c.peer && cnet.active === true, lsA = localStorage.dump();
            if (thr) finding('exception escapes handleMessage (client)', 'signed snapshot — ' + thr.constructor.name + ': ' + String(thr.message).slice(0, 120), msg, name);
            if (tk && want === 'refuse') finding('client: a table is taken from a host that is not the GM this app knows', 'a snapshot under a pinned GM, at a room code this app knows → synced', msg, name);
            if (!tk && ['wp_tableKeys', 'wp_gmPins', 'wp_gmRooms'].some(k => lsA[k] !== lsB[k])) finding('client: a refused table changes what this app knows of its GMs or its table keys', 'a snapshot under a pinned GM', msg, name);
            if (rec.confirms.length) finding('client: a refused table raises a question before the join has run its course', 'a snapshot under a pinned GM → "' + rec.confirms[0].text.slice(0, 60) + '"', msg, name);
            if (canary()) finding('client: a refused table\'s text reaches the page', 'a snapshot under a pinned GM', msg, name);
            if (tk) { took++; if (i >= nMut) tookOther++; } else if (want === 'take') stricter++; else refused++;
        }
        check('client (the GM this app knows): ' + (nMut + others.length) + ' variations of the GM\'s signed snapshot, each on a join of its own (' + took + ' taken, ' + refused + ' refused, ' + stricter + ' refused though rightly signed) — one is taken only when Node\'s own crypto finds the pinned key\'s signature over this connection\'s nonce, the room dialled, the GM id and the table key; none of the ' + others.length + ' forgeries is',
            found.size === f0 && took >= 1 && refused >= 40 && tookOther === 0, { took, refused, stricter, tookOther, newFindings: found.size - f0 });

        // 4. a join the player begins, and every generation of the code answers as someone else: asked once, at the end, in the app's own words
        const walk = async () => { const at = []; let c = freshJoin(); for (let g = 0; g < 4; g++) { at.push(c.peer); await give(c, signedSnap(sqS, c, { reason: CANARY, notepad: { type: 'notepad', on: true, text: CANARY, gmId: 'u_gm', campaign: CANARY, gm: CANARY } })); flushTimers(); if (g < 3) c = dial(); } return at; };
        resetRec(); const at1 = await walk(), q1 = rec.confirms.slice(), nPeers = peers.length;
        const said1 = rec.text.some(t => t.v.indexOf(SAID + ' You have not joined.') === 0), state1 = { active: cnet.active, synced: cnet.syncedPeer, pins: localStorage.getItem('wp_gmPins') === pins0, keys: lsJ('wp_tableKeys').u_gm === K1, canary: canary() };
        if (q1[0]) q1[0].cb(false);
        flushTimers(); const afterNo = { peers: peers.length - nPeers, active: cnet.active, pins: localStorage.getItem('wp_gmPins') === pins0 };
        check('client (the GM this app knows): a join the player begins tries each generation of the code in turn when the one that answers is not their GM, and ends unjoined — said in the app\'s own words, nothing of the host\'s text shown — with ONE question (the app\'s own words, never answered by Enter); a no changes nothing and dials nothing',
            JSON.stringify(at1) === JSON.stringify(['waypoint-abcdef', 'waypoint-abcdef-r1', 'waypoint-abcdef-r2', 'waypoint-abcdef-r3']) && q1.length === 1 && q1[0].text === ASKED && !!q1[0].opts && q1[0].opts.noEnter === true && said1 && state1.active === false && state1.synced === null && state1.pins && state1.keys && !state1.canary && afterNo.peers === 0 && afterNo.active === false && afterNo.pins,
            { at1, asked: q1.map(d => d.text.slice(0, 50)), said1, state1, afterNo });
        resetRec(); await walk(); const q2 = rec.confirms.slice();
        if (q2[0]) q2[0].cb(true);
        const cY = dial(), tY = await give(cY, signedSnap(sqS, cY)), yes = { asked: q2.length, synced: cnet.syncedPeer === cY.peer, pin: JSON.stringify(lsJ('wp_gmPins').u_gm) === JSON.stringify(sqS.pub), confirms: rec.confirms.length };
        const cZ = freshJoin(), tZ = await give(cZ, signedSnap(gmS, cZ)), then = { synced: cnet.syncedPeer === cZ.peer, pin: JSON.stringify(lsJ('wp_gmPins').u_gm) === JSON.stringify(sqS.pub) };   // and from then on the key said yes to is the one known: the old one is refused in its turn
        check('client (the GM this app knows): a yes joins again and takes the table that answered with that very key — pinned in place of the old one, no second question — and from then on that is the GM this app knows',
            !tY && !tZ && yes.asked === 1 && yes.synced && yes.pin && yes.confirms === 1 && then.synced === false && then.pin, { yes, then });
        cnet.leaveSession(true); flushTimers(); resetRec();
    }

    /* ---------- the summary ---------- */
    check('host: every player a probe cost their connection was readmitted through the proof (' + readmits + ' readmissions)', readmitFailed.length === 0, readmitFailed.slice(0, 3));
    const list = [...found.values()], open = openFindings(), acceptedF = list.filter(f => !open.includes(f));
    open.forEach(f => { console.log(findingLine(f) + (f.n > 1 ? '  (×' + f.n + ')' : '') + (f.msg ? '\n          message: ' + f.msg : '')); });
    acceptedF.forEach(f => { console.log('accepted  ' + f.kind + ' — ' + f.detail + (f.n > 1 ? '  (×' + f.n + ')' : '') + '  (' + acceptedBy(findingLine(f)).why + ')'); });
    const passed = checks - checksFailed - checksAccepted, accepted = checksAccepted + acceptedF.length;
    console.log('# ' + probes + ' messages fired, ' + list.length + ' distinct findings (' + open.length + ' open, ' + acceptedF.length + ' accepted), ' + Math.round((Date.now() - T0 - clockOff) / 1000) + ' s');
    console.log(passed + ' passed, ' + (checksFailed + open.length) + ' failed' + (accepted ? ', ' + accepted + ' accepted' : '') + '.');
    summed = true;
    process.exit(checksFailed + open.length ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite itself threw: ' + (e.stack || e.message)); console.log(checks + ' passed, ' + (checksFailed + 1) + ' failed.'); summed = true; process.exit(1); });
let summed = false;
process.on('exit', c => { if (!summed) { realError('fuzzcheck: the run ended before its summary (a promise nothing answered)'); process.exitCode = 1; } });
