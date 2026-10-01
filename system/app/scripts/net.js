/* Multiplayer: GM-hosted P2P sessions over WebRTC (PeerJS signaling, direct data channels).
   The host's app is the authority — it owns data.json exactly as in solo play.

   Players (clients):
   - arrive at the GM's active map ("stage") and follow the GM's navigation
   - are locked to spectator mode: pan, zoom, measure, and drag ONLY tokens
     whose ownerId matches their profile id (assigned by the GM in the inspector)
   - never write their own disk while connected; edits route to the host
   The host filters every incoming patch: only x/y/rot/front of that player's own
   tokens are applied, then the authoritative item is saved and rebroadcast. */

function render() { if (window.appRender) window.appRender(); }

import { state } from './state.js';
import { getActiveCampaign, findLandingRoom, landingPoint, getActiveMap } from './models.js';
import { save, toast, load } from './io.js';
import { updateCampaignSelect, updateSidebarNav } from './sidebar.js';
import { showConfirm } from './dialogs.js';

/* ---------- version gate ----------
   The join handshake carries the player's app version. A host turns away anyone
   older than itself (or anyone who sends no version — every build before 1.1.2)
   with a plain "update Waypoint" message, so a table never runs mixed versions. */
var APP_VERSION = null;
var newerSeen = {};   // player versions newer than ours that the GM has already been told about this session
// The shell's /api/version (older shells report only their own package.json) and the app folder's
// own version.json: the newer wins. After a hot update on an old shell only version.json moved.
window.wpVersionReady = Promise.all([
    fetch('/api/version').then(function(r) { return r.json(); }).catch(function() { return null; }),
    fetch('version.json', { cache: 'no-store' }).then(function(r) { return r.json(); }).catch(function() { return null; }),
]).then(function(vs) {
    var a = vs[0] && vs[0].version ? String(vs[0].version) : null;
    var b = vs[1] && vs[1].version ? String(vs[1].version) : null;
    APP_VERSION = (a && b) ? (versionCmp(b, a) > 0 ? b : a) : (a || b);
    window.wpAppVersion = APP_VERSION;
    document.dispatchEvent(new CustomEvent('wp-version', { detail: APP_VERSION }));
    return APP_VERSION;
});
function versionCmp(a, b) {   // numeric major.minor.patch; anything after a '-' is ignored
    var pa = String(a || '0').split('-')[0].split('.').map(function(x) { return parseInt(x, 10) || 0; });
    var pb = String(b || '0').split('-')[0].split('.').map(function(x) { return parseInt(x, 10) || 0; });
    for (var i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0); }
    return 0;
}
function updateMessage(theirs, ours) {
    return 'Your Waypoint (' + (theirs || 'older than 1.1.2') + ') is older than the GM\'s (' + ours + '). Update Waypoint, then rejoin: open Settings ▸ Check for Updates and press Update Now (or get the latest Waypoint_Setup.exe from your GM and run it over your copy — saves and settings are kept).';
}

var net = {
    active: false,
    role: null,          // 'host' | 'client'
    myId: null,
    peer: null,
    conns: [],
    roster: Object.create(null),          // peerKey -> profile (prototype-free: a peer id like "constructor" must never read as admitted)
    code: null,
    applyingRemote: false,
    lastStage: null,
    leaving: false,      // true while tearing down on purpose (no auto-reconnect)
    paused: false,       // GM froze the WHOLE table: no token moves, no travel (chat stays open)
    pausedPlayers: {},   // host: profileId -> true, players frozen individually (composes with the table pause)
    selfPaused: false,   // client: the GM froze ME specifically (distinct from the table pause)
    foreign: false       // the campaign in memory came from a host: it must never reach this machine's disk
};
window.wpNet = net;

/* ---------- profile (local, no accounts) ---------- */
// A pleasant random mid-tone, as #rrggbb — every new profile gets its own color (distinct dots/avatars out of the box).
function randomProfileColor() {
    var h = Math.floor(Math.random() * 360), s = 0.55, l = 0.58, a = s * Math.min(l, 1 - l);
    function f(n) { var k = (n + h / 30) % 12, col = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); return ('0' + Math.round(255 * col).toString(16)).slice(-2); }
    return '#' + f(0) + f(8) + f(4);
}
function getProfile() {
    var p = null;
    try { p = JSON.parse(localStorage.getItem('wp_profile') || 'null'); } catch (e) {}
    if (!p || !p.id) {
        p = { id: 'u_' + Math.random().toString(36).slice(2, 10), name: '', color: randomProfileColor() };   // random starter color, saved so it stays put
        try { localStorage.setItem('wp_profile', JSON.stringify(p)); } catch (e) {}
    }
    return p;
}
// Merge a patch into the local profile, keeping the id stable and validating each field the same
// way the host does on the wire (so what we store is always safe to send). Designed to grow: a
// future website account can adopt this shape without a migration.
function setProfile(patch) {
    var p = getProfile();
    if (patch && typeof patch === 'object') {
        if (typeof patch.name === 'string') p.name = patch.name.slice(0, 40);
        if (typeof patch.color === 'string') { if (/^#[0-9a-fA-F]{6}$/.test(patch.color)) p.color = patch.color; else if (patch.color === '') delete p.color; }
        if (typeof patch.avatar === 'string') { if (safeAvatar(patch.avatar)) p.avatar = patch.avatar; else if (patch.avatar === '') delete p.avatar; }
        if (typeof patch.face === 'string') { var cf = cleanFace(patch.face); if (cf) p.face = cf; else if (patch.face === '') delete p.face; }   // Onboarding F1b: the token face
    }
    try { localStorage.setItem('wp_profile', JSON.stringify(p)); } catch (e) {}
    return p;
}
function setProfileName(name) { return setProfile({ name: String(name == null ? '' : name) }); }
net.getProfile = getProfile; net.setProfile = setProfile; net.setProfileName = setProfileName;   // for the Settings + welcome profile editor
net.safeAvatar = safeAvatar;   // the whole-data-URL check, for the other modules that draw a profile picture (the party strip, hover cards, Maps presence)
// [netcheck:helpers-start]
// Own-property lookup for a plain-object map keyed by a peer-supplied string: a key like "constructor" or
// "__proto__" must never read Object.prototype as a hit (an admitted-roster or ban lookup would be fooled).
function own(o, k) { return !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined && o[k] !== null; }
// A player identity the host accepts: short, plain, and never a prototype key.
function validProfileId(id) { return typeof id === 'string' && id.length >= 1 && id.length <= 80 && /^[A-Za-z0-9_.:-]+$/.test(id) && !(id in Object.prototype); }
// A table key: the secret a host issues a player the first time the GM lets them in, so a later "I am
// <that id>" is proven rather than believed (an id alone is public — it rides the roster to every player).
function newKey() { var a = new Uint8Array(16); try { crypto.getRandomValues(a); } catch (e) { for (var i = 0; i < 16; i++) a[i] = Math.floor(Math.random() * 256); } return Array.prototype.map.call(a, function(b) { return ('0' + b.toString(16)).slice(-2); }).join(''); }
// (client) the keys this player holds, per GM id
function tableKeys() { try { var k = JSON.parse(localStorage.getItem('wp_tableKeys') || 'null'); return k && typeof k === 'object' && !Array.isArray(k) ? k : {}; } catch (e) { return {}; } }
function tableKeyFor(gmId) { var k = tableKeys(); return (own(k, gmId) && typeof k[gmId] === 'string') ? k[gmId].slice(0, 64) : ''; }
function rememberTableKey(gmId, key) { if (typeof gmId !== 'string' || !gmId || typeof key !== 'string' || !key) return; var k = tableKeys(); k[gmId] = key.slice(0, 64); try { localStorage.setItem('wp_tableKeys', JSON.stringify(k)); } catch (e) {} }
// A profile picture a peer may show: a small inline image whose WHOLE string is base64. A prefix check let a quote-breaking tail
// (x" onerror=…) ride into an src="…" — script on the GM's screen, and through the roster on every player's.
function safeAvatar(v) { return typeof v === 'string' && v.length <= 200000 && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+\/=]+$/.test(v); }
// A display name a peer may show: control, bidi-override and zero-width characters out, trimmed, at most 40; 'Player' when blank.
function cleanRosterName(v) { var s = typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '').trim().slice(0, 40) : ''; return s || 'Player'; }
// Onboarding F3: a character's name a player chose — the same characters out (control, bidi-override, zero-width), trimmed, at most 60; '' when blank
function cleanCharName(v) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60).trim() : ''; }
// Onboarding F1b: a player's token FACE — 'photo' (their profile picture), 'default' (the silhouette on their colour), 'pic:<name>' (one of
// the bundled token pictures, by name from this fixed list), or ONE emoji: a pictograph (with its variation selector or skin tone), joined to
// more only by the zero-width joiner — anything else is refused whole (''), never trimmed: no letters, digits, markup or control characters,
// no run of several emoji and nothing invisible (a joiner or a selector alone).
var FACE_PICS = ['bren', 'chef', 'golems', 'innkeeper', 'king', 'liriel', 'minotaur_archer', 'minotaur_soldier', 'orc', 'priestess', 'sage', 'slime', 'smith', 'spriggan', 'tharic'];
function cleanFace(v) {
    if (typeof v !== 'string' || !v || v.length > 64) return '';
    if (v === 'photo' || v === 'default') return v;
    if (v.slice(0, 4) === 'pic:') return FACE_PICS.indexOf(v.slice(4)) >= 0 ? v : '';
    var cps = Array.from(v), i = 0; if (cps.length > 16) return '';
    var ep = function(c) { return /^\p{Extended_Pictographic}$/u.test(c); }, mod = function(c) { return c === '\uFE0F' || /^[\u{1F3FB}-\u{1F3FF}]$/u.test(c); };
    var unit = function() { if (i >= cps.length || !ep(cps[i])) return false; i++; while (i < cps.length && mod(cps[i])) i++; return true; };
    if (!unit()) return '';
    while (i < cps.length) { if (cps[i] !== '\u200D') return ''; i++; if (!unit()) return ''; }
    return v;
}
// How a face is drawn: { emoji } (text), or { img } — a bundled picture (the app's own asset), the player's picture only when it passes
// safeAvatar whole, else the silhouette (def(color)). A face the list does not know falls back as if none was chosen.
function faceView(p, color, def) {
    var f = p && typeof p === 'object' ? cleanFace(p.face) : '';
    if (f.slice(0, 4) === 'pic:') return { img: 'assets/tutorial/' + f.slice(4) + '_sq.jpg' };
    if (f && f !== 'photo' && f !== 'default') return { emoji: f };
    if (f !== 'default' && p && safeAvatar(p.avatar)) return { img: p.avatar };
    return { img: typeof def === 'function' ? def(color) : '' };
}
// Onboarding F1c: what a character's picture becomes from a player's face (and their profile picture): { kind: 'picture', data } — their photo
// (a data URL that passes safeAvatar whole), to be saved as a PNG; { kind: 'bundled', name } — one of the bundled pictures, copied; { kind:
// 'face', face } — an emoji or the default, drawn on its tokens. No face chosen: their photo when they have one, else the default.
function charFacePlan(face, avatar) {
    var f = cleanFace(face || '');
    if (!f) f = safeAvatar(avatar) ? 'photo' : 'default';
    if (f === 'photo') return safeAvatar(avatar) ? { kind: 'picture', data: avatar } : { kind: 'face', face: 'default' };
    if (f.slice(0, 4) === 'pic:') return { kind: 'bundled', name: f.slice(4) };
    return { kind: 'face', face: f };
}
// Onboarding F1a: a waiting token from the host, rebuilt from its own fields only (a player's copy never carries anything else: no
// picture, no sheet, no character link — its face is read from the roster)
function cleanWaitingItem(w) {
    if (!w || typeof w !== 'object' || typeof w.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(w.id) || !validProfileId(w.ownerId)) return null;
    var num = function(v, d, lo, hi) { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d; };
    var o = { id: w.id, type: w.type === 'hexagon' || w.type === 'rect' ? w.type : 'circle', waiting: 1, ownerId: w.ownerId, name: cleanRosterName(w.name), color: typeof w.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(w.color) ? w.color : '#4db3d3',
              x: num(w.x, 15000, -30000, 60000), y: num(w.y, 15000, -30000, 60000), w: num(w.w, 60, 20, 400), h: num(w.h, 52, 20, 400), layer: 'middle' };
    if (w.hidden === true) o.hidden = true;
    if (w.locked === true) o.locked = true;   // the GM's lock: their app stops the drag too, as for any token
    var fWI = cleanFace(w.face); if (fWI) o.face = fWI;   // Onboarding F1b: the face it last wore (read only while its player is away)
    return o;
}
// [netcheck:helpers-end]
net.charFacePlan = charFacePlan; net.cleanCharName = cleanCharName; net.cleanFace = cleanFace; net.FACE_PICS = FACE_PICS.slice(); net.faceView = function(p, color) { return faceView(p, color, window.wpDefaultAvatar); };   // Onboarding F1b: faces, one rule for every screen (after the helpers: FACE_PICS is only assigned there)
// What a client accepts from a host, beyond the shape checks the wire already does.
// [netcheck:rosterclean-start]
function validKey(k) { return typeof k === 'string' && k.length > 0 && k.length <= 160 && !(k in Object.prototype); }   // an id used as an object key: never a prototype key
// (client) The roster exactly as a player keeps it, rebuilt from what the host sent: entries from an array (or a 1.4.9 host's
// peer-keyed object), every field checked, keyed by player id in a prototype-free map, at most 64. The party strip, hover cards,
// renderRoster, the sheet's owner names and token presence read it — some into markup — so nothing unchecked gets in.
function cleanHostRoster(raw) {
    var out = Object.create(null), n = 0;
    var list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object') ? Object.keys(raw).map(function(k) { return raw[k]; }) : [];
    for (var i = 0; i < list.length && n < 64; i++) {
        var p = list[i];
        if (!p || typeof p !== 'object' || Array.isArray(p) || !validProfileId(p.id) || out[p.id]) continue;
        var e = { id: p.id, name: cleanRosterName(p.name), location: validKey(p.location) ? p.location : null, detached: p.detached === true };
        if (typeof p.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.color)) e.color = p.color;
        if (safeAvatar(p.avatar)) e.avatar = p.avatar;
        var fR = cleanFace(p.face); if (fR) e.face = fR;   // Onboarding F1b
        out[p.id] = e; n++;
    }
    return out;
}
// (client) Where each absent player was last seen: player id -> map id, both checked, prototype-free, at most 500.
function cleanHostAway(raw) {
    var out = Object.create(null), n = 0;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    Object.keys(raw).forEach(function(k) { if (n >= 500 || !validProfileId(k) || !validKey(raw[k])) return; out[k] = raw[k]; n++; });
    return out;
}
// [netcheck:rosterclean-end]
function campOf(id) { var cs = state.appState && state.appState.campaigns; return (cs && validKey(id) && own(cs, id)) ? cs[id] : null; }
// [netcheck:where-start]
// (client) The top bar's "where am I" for a joined player (1.5.0): the hosted campaign's name › the map this player is on — that map
// alone, never the maps it sits inside (the GM's breadcrumb is the GM's own navigation). Both names are the host's strings:
// control, bidi-override and zero-width characters out, at most 200 each, and they reach the page as text and the title property only.
// Nothing while this machine waits for admission, reconnects, has left, or is the stream window (no synced host there).
function whereName(v, blank) {
    var s = typeof v === 'string' ? v.slice(0, 2000).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200) : '';
    return s || blank;
}
function tableWhere(n, camp) {
    if (!n || n.role !== 'client' || !n.syncedPeer || !n.foreign || n.stream) return null;
    if (!camp || typeof camp !== 'object' || !camp.items || typeof camp.items !== 'object') return null;
    var map = own(camp.items, camp.activeItemId) ? camp.items[camp.activeItemId] : null;
    if (!map || typeof map !== 'object' || map.type !== 'map') return null;
    var c = whereName(camp.name, 'Unnamed Campaign'), m = whereName(map.meta && typeof map.meta === 'object' ? map.meta.title : '', 'Untitled');
    return { camp: c, map: m, title: c + ' \u203a ' + m };
}
function paintWhere(box, mapBox, w, doc) {   // the campaign in its own section of the top bar, the map in the next one (owner, 2026-09-26), each its whole name in the title
    [[box, 'tw-camp', w && w.camp], [mapBox, 'tw-map', w && w.map]].forEach(function(p) {
        var b = p[0]; b.textContent = ''; b.title = w ? p[2] : ''; b.classList.toggle('on', !!w);
        if (!w) return;
        var s = doc.createElement('span'); s.className = p[1]; s.textContent = p[2]; b.appendChild(s);
    });
}
// [netcheck:where-end]
var _whereKey = null;   // what the top bar shows now ('' = nothing): render() runs often, the box is touched only when this changes
function renderWhere() {
    if (typeof fxClockStart === 'function') fxClockStart();   // turn-based combat T5a: the effects' clock (it acts on the GM's own machine only)
    var box = ui('tableWhere'), mapBox = ui('tableWhereMap'); if (!box || !mapBox) return;
    var w = tableWhere(net, campOf(state.appState && state.appState.activeCampaignId));
    var key = w ? w.camp + '\n' + w.map : '';
    if (key === _whereKey) return;
    _whereKey = key;
    paintWhere(box, mapBox, w, document);
}
net.renderWhere = renderWhere;   // main.js render() calls it, so a join, a stage, travel, a summon, a lost map and a renamed map all reach the top bar
function safeColor(v) { return (typeof v === 'string' && v.length <= 40 && /^(#[0-9a-fA-F]{3,8}|(rgb|hsl)a?\([\d.,\s%]+\)|[a-zA-Z]{1,20}|var\(--[\w-]+\))$/.test(v)) ? v : ''; }
function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// Rich text a client accepts from a host (a play-map text item) or the GM takes from a file someone else made (an
// imported planner's raw block): the formatting the text tool makes, nothing that runs. Parsed inertly (DOMParser
// executes no scripts and loads nothing), then rebuilt: only listed tags, only listed attributes, links to the web,
// pictures from the table's own library or a small inline image.
var RICH_TAGS = { b: 1, strong: 1, i: 1, em: 1, u: 1, s: 1, strike: 1, del: 1, p: 1, br: 1, div: 1, span: 1, font: 1, ul: 1, ol: 1, li: 1, a: 1, img: 1, h1: 1, h2: 1, h3: 1, h4: 1, blockquote: 1, code: 1, pre: 1, sub: 1, sup: 1, small: 1, big: 1, hr: 1, table: 1, thead: 1, tbody: 1, tr: 1, td: 1, th: 1 };
var RICH_DROP = /^(script|style|iframe|object|embed|template|svg|math|noscript|link|meta|base|form|input|textarea|select|button|video|audio|source|frame|frameset|applet)$/;
var RICH_STYLE = /^(color|background-color|font-size|font-family|font-weight|font-style|text-decoration|text-align|line-height|white-space|letter-spacing)$/;
function safeStyle(css) { var out = []; String(css || '').split(';').forEach(function(d) { var i = d.indexOf(':'); if (i < 0) return; var k = d.slice(0, i).trim().toLowerCase(), v = d.slice(i + 1).trim(); if (RICH_STYLE.test(k) && v.length <= 80 && /^[\w\s#%(),.'"\/-]+$/.test(v) && !/url|expression|javascript|import/i.test(v)) out.push(k + ':' + v); }); return out.join(';'); }
function safeRichHref(h) { h = String(h || '').trim(); return (/^(https?:\/\/|mailto:)/i.test(h) && h.length <= 2000) ? h : ''; }
function safeRichSrc(s) { s = String(s || '').trim(); if (/^\/saves\/images\//.test(s) && s.length <= 400 && !/[\0<>"'\\]/.test(s) && s.indexOf('..') < 0) return s; if (/^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+\/=]+$/.test(s) && s.length <= 300000) return s; return ''; }
function sanitizeRichText(html) {
    if (typeof html !== 'string' || !html) return '';
    if (html.length > 200000) html = html.slice(0, 200000);
    if (typeof DOMParser === 'undefined') return escAttr(html);   // no DOM here (a check under node): text only
    var doc; try { doc = new DOMParser().parseFromString('<body>' + html + '</body>', 'text/html'); } catch (e) { return ''; }
    function walk(node) {
        var out = '';
        Array.prototype.forEach.call(node.childNodes, function(ch) {
            if (ch.nodeType === 3) { out += escAttr(ch.nodeValue); return; }
            if (ch.nodeType !== 1) return;
            var tag = ch.tagName.toLowerCase();
            if (!RICH_TAGS[tag]) { if (!RICH_DROP.test(tag)) out += walk(ch); return; }   // an unknown wrapper keeps its text; a dangerous one goes with its content
            var attrs = '';
            if (tag === 'a') { var h = safeRichHref(ch.getAttribute('href')); if (h) attrs += ' href="' + escAttr(h) + '" target="_blank" rel="noopener noreferrer"'; }
            else if (tag === 'img') { var src = safeRichSrc(ch.getAttribute('src')); if (!src) return; attrs += ' src="' + escAttr(src) + '"'; var alt = ch.getAttribute('alt'); if (alt) attrs += ' alt="' + escAttr(String(alt).slice(0, 200)) + '"'; var wd = ch.getAttribute('width'), ht = ch.getAttribute('height'); if (wd && /^\d{1,4}$/.test(wd)) attrs += ' width="' + wd + '"'; if (ht && /^\d{1,4}$/.test(ht)) attrs += ' height="' + ht + '"'; }
            else if (tag === 'font') { var fc = ch.getAttribute('color'), fz = ch.getAttribute('size'), ff = ch.getAttribute('face'); if (fc && /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]{1,20})$/.test(fc)) attrs += ' color="' + fc + '"'; if (fz && /^[1-7]$/.test(fz)) attrs += ' size="' + fz + '"'; if (ff && /^[\w\s,'-]{1,60}$/.test(ff)) attrs += ' face="' + escAttr(ff) + '"'; }
            var st = safeStyle(ch.getAttribute('style')); if (st) attrs += ' style="' + escAttr(st) + '"';
            if (tag === 'br' || tag === 'hr' || tag === 'img') { out += '<' + tag + attrs + '>'; return; }
            out += '<' + tag + attrs + '>' + walk(ch) + '</' + tag + '>';
        });
        return out;
    }
    return walk(doc.body);
}
net.sanitizeRichText = sanitizeRichText;
// A play map as a client keeps it: text items rebuilt, category colors that are colors, collections bounded.
function cleanHostWbItem(w) { if (!w || typeof w !== 'object' || typeof w.id !== 'string') return null; if (w.waiting) return cleanWaitingItem(w); if (w.type === 'text') w.text = sanitizeRichText(w.text); if (w.light !== undefined) cleanHostLight(w); if (w.senses !== undefined || w.blind !== undefined) cleanHostTokSenses(w); if (w.fxb !== undefined) cleanHostFxb(w); if (w.smoke !== undefined && w.smoke !== true) delete w.smoke; if (w.terrain !== undefined) { var FCt = window.wpFogCore, tr = FCt && FCt.cleanTerrain ? FCt.cleanTerrain(w.terrain) : null; if (tr) w.terrain = tr; else delete w.terrain; } if (w.height !== undefined) { var FCh = window.wpFogCore, ht = FCh && FCh.cleanHeight ? FCh.cleanHeight(w.height) : null; if (ht) w.height = ht; else delete w.height; } if (w.texture !== undefined) { var FCx = window.wpFogCore, tx = FCx && FCx.cleanTexture ? FCx.cleanTexture(w.texture) : null; if (tx) w.texture = tx; else delete w.texture; } return w; }   // senses S7b: smoke only as true; difficult terrain T1: its cost, 2-10, or none; item 19 H1: a piece's height, yards; map builder B1: a texture only as a name the app's table holds
// Senses S2b: a token's own ranges, kept on a token of this player's alone (the host sends no other), cleaned again; none from a hostile host
// on anyone else's token, and none with no cleaner on hand. S3: the GM's Blind tick likewise, and only as true
function cleanHostTokSenses(w) { var FCs = window.wpFogCore, mine = !!w.ownerId && w.ownerId === net.myId, ts = FCs && FCs.cleanTokSenses && mine ? FCs.cleanTokSenses(w.senses) : null; if (ts) w.senses = ts; else delete w.senses; if (!(mine && w.blind === true)) delete w.blind; }
// Conditions C1: a character token's effects as the host sent them, cleaned again — at most 8, a name as plain text of 60 at most, an icon the
// app draws (systemcore cleanIcon), a tone of the two words; only on a character token; with no cleaner on hand they do not come in
function cleanHostFxb(w) { var S = window.wpSystemCore, out = []; if (w.isChar && S && S.cleanIcon && Array.isArray(w.fxb)) w.fxb.slice(0, 8).forEach(function(e) { if (!e || typeof e !== 'object' || typeof e.n !== 'string') return; var n = e.n.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').trim().slice(0, 60); if (n) out.push({ n: n, i: S.cleanIcon(e.i), t: e.t === 'buff' || e.t === 'debuff' ? e.t : '' }); }); if (out.length) w.fxb = out; else delete w.fxb; }
// Lighting L4: an item's light as the host sent it, cleaned again (fogcore cleanLight: numbers clamped, a unit the app knows, the name short
// plain text); with no cleaner on hand it does not come in
function cleanHostLight(w) { var FCl = window.wpFogCore, lc = FCl && FCl.cleanLight ? FCl.cleanLight(w.light) : null; if (lc) w.light = lc; else if (w.type === 'light' && FCl && FCl.cleanLight) w.light = { bright: 0, dim: 0 }; else delete w.light; }
function cleanHostMap(m) {
    if (!m || typeof m !== 'object') return m;
    if (Array.isArray(m.whiteboard)) m.whiteboard = m.whiteboard.slice(0, 6000).map(cleanHostWbItem).filter(Boolean); else m.whiteboard = [];
    if (Array.isArray(m.rooms)) m.rooms = m.rooms.slice(0, 600); else m.rooms = [];
    var flC = window.wpFogCore && window.wpFogCore.cleanFogLit ? window.wpFogCore.cleanFogLit(m.fogLit) : null; if (flC) m.fogLit = flC; else delete m.fogLit;   // lighting L3: the lit cells the host sent this player, cleaned again
    if (m.lightsCapped !== true) delete m.lightsCapped;
    if (m.fogMarks !== undefined) { var mkC = window.wpFogCore && window.wpFogCore.cleanFogMarks ? window.wpFogCore.cleanFogMarks(m.fogMarks, ownCellKeysOf(m)) : null; if (mkC) m.fogMarks = mkC; else delete m.fogMarks; }   // senses S4: this player's marks, cleaned again
    if (m.fogOff !== undefined) { var ofC = window.wpFogCore && window.wpFogCore.cleanFogOff ? window.wpFogCore.cleanFogOff(m.fogOff, ownTokIdsOf(m)) : null; if (ofC) m.fogOff = ofC; else delete m.fogOff; }   // senses S7a: their own tokens only, cleaned again
    if (m.cats && typeof m.cats === 'object') Object.keys(m.cats).forEach(function(k) { var c = m.cats[k]; if (k in Object.prototype) { delete m.cats[k]; return; } if (c && typeof c === 'object' && !safeColor(c.color)) c.color = '#888'; });
    return m;
}
// Senses S7a: this player's own visible character tokens on a map, by id (what the host may say a null area switches off)
function ownTokIdsOf(m) {
    var out = Object.create(null); if (!m || !Array.isArray(m.whiteboard) || !net.myId) return out;
    m.whiteboard.forEach(function(w) { if (w && w.ownerId === net.myId && w.isChar && !w.hidden && !w.waiting && typeof w.id === 'string') out[w.id] = 1; });
    return out;
}
// Senses S4: the cells of this player's own tokens on a map (no mark is kept on one): their keys, by the map's grid; none with no grid
function ownCellKeysOf(m) {
    var C = window.wpFogCore, out = Object.create(null); if (!C || !C.gridFor || !m || !Array.isArray(m.whiteboard) || !net.myId) return out;
    var grid = C.gridFor((m.meta && m.meta.gridType) || 'off', m.fog && m.fog.cell); if (!grid) return out;
    m.whiteboard.forEach(function(w) { var x = w ? Number(w.x) : NaN, y = w ? Number(w.y) : NaN; if (w && w.ownerId === net.myId && isFinite(x) && isFinite(y)) out[C.cellKey(C.cellOf(x + (Number(w.w) || 60) / 2, y + (Number(w.h) || 52) / 2, grid), grid)] = 1; });
    return out;
}
// Client-originated changes are saved coalesced: a stroke or move storm costs one disk write, not one per message
// (the deltas to players still go out at once; only the write + the save sweep are batched).
var _saveSoon = null;
function saveRemoteSoon() { if (_saveSoon) return; _saveSoon = setTimeout(function() { _saveSoon = null; net.applyingRemote = true; try { save(true); } finally { net.applyingRemote = false; } }, 250); }
// Per-message-type rate limits for what a peer may send (dicecore.RateLimit: per-peer spacing + burst per window + a table-wide cap).
var _lim = Object.create(null);
function allow(name, cfg, peer) { var Lr = _lim[name]; if (!Lr) { var DCl = window.wpDiceCore; if (!DCl || !DCl.RateLimit) return true; Lr = _lim[name] = DCl.RateLimit(cfg); } return Lr.allow(peer, Date.now()) === true; }
var _connMeta = Object.create(null);    // host: per-connection bookkeeping before admission — openedAt, hello count, the key challenge
var _pwFails = [];                       // host: timestamps of wrong session passwords (any connection), for the table-wide lockout
var _shareBytes = Object.create(null);   // host: bytes each peer has shared this session
net.myId = getProfile().id;

/* ---------- ui helpers ---------- */
function ui(id) { return document.getElementById(id); }
function setStatus(msg) { var el = ui('netStatus'); if (el) el.textContent = msg; var wj = ui('wcJoinStatus'); if (wj) wj.textContent = msg; }   // mirror to the welcome Join screen when a join runs from there

/* ---------- liveness: heartbeat + the header indicator ----------
   WebRTC can sit on a dead channel for a long time after the other side's
   process dies, so both ends send a tiny 'hb' every few seconds. Silence past
   HB_STALE turns the header dot amber; past HB_DEAD the connection is torn
   down deliberately — a client starts its reconnect loop, a host drops the
   player. The dot is the always-visible truth about the table's health. */
var HB_EVERY = 4000, HB_STALE = 8000, HB_DEAD = 20000;   // silence → "not responding" at 8 s, dropped at 20 s
var UNADMITTED_TTL = 10 * 60 * 1000;   // a connection the GM has not admitted may wait this long (heartbeating) for the Allow, then it is closed
var hbTimer = null, lastSeen = {}, hostLastSeen = 0;
var holdUntil = {}, hostHoldUntil = 0, HOLD_MAX = 180000;   // Onboarding F2b: a side about to freeze in a print dialog asks the other to wait (3 minutes at most, until it speaks again)
function noteSeen(peerId) { var now = Date.now(); lastSeen[peerId] = now; delete holdUntil[peerId]; if (net.role === 'client') { hostLastSeen = now; hostHoldUntil = 0; } }
function setIndicator(level, text) {
    var b = ui('netBtn');
    if (!b) return;
    ['net-ok', 'net-warn', 'net-bad'].forEach(function(c) { b.classList.remove(c); });
    if (level) b.classList.add('net-' + level);
    b.title = text ? 'Multiplayer — ' + text : 'Multiplayer — host or join a session';
    net.health = level || null;
}
net.setIndicator = setIndicator;
net._hb = { tick: hbTick, seen: noteSeen, start: startHeartbeat, stop: stopHeartbeat };   // sandbox testing hooks
// [netcheck:holdpeers-start]
// Onboarding F2b: this app is about to freeze in a blocking dialog (the print dialog): the other side waits for it rather than dropping it —
// the host's admitted players (a waiting one hears nothing but the heartbeat), or a player's GM; afterwards our own clocks restart (the
// silence was ours) and a heartbeat goes at once, which ends their wait
net.holdPeers = function(ms) {
    if (!net.active) return false;
    var m = { type: 'hold', ms: Math.max(0, Math.min(HOLD_MAX, Number(ms) || 0)) };
    (net.role === 'host' ? net.conns.filter(function(c) { return own(net.roster, c.peer); }) : net.conns.slice(0, 1)).forEach(function(c) { if (c && c.open) { try { c.send(m); } catch (e) { sendFailed(e); } } });
    return true;
};
net.heldDone = function() {
    if (!net.active) return;
    var now = Date.now(); hostLastSeen = now; Object.keys(lastSeen).forEach(function(k) { lastSeen[k] = now; });
    hbTick();
};
// [netcheck:holdpeers-end]
function startHeartbeat() {
    stopHeartbeat();
    var now = Date.now();
    hostLastSeen = now;
    net.conns.forEach(function(c) { lastSeen[c.peer] = now; });
    hbTimer = setInterval(hbTick, HB_EVERY);
    hbTick();
}
function stopHeartbeat() {
    if (hbTimer) clearInterval(hbTimer);
    hbTimer = null; lastSeen = {}; hostLastSeen = 0; holdUntil = {}; hostHoldUntil = 0;
}
function hbTick() {
    if (!net.active) { setIndicator(null); return; }
    var now = Date.now();
    if (net.role === 'host') {
        // every open connection, a peer still waiting for the GM's Allow too: a heartbeat carries nothing of the table, and without it a
        // waiting player takes the silence for a lost GM and reconnects every 20 s (the host keeps a waiting peer for a while: UNADMITTED_TTL)
        net.conns.forEach(function(c) { if (c.open) { try { c.send({ type: 'hb' }); } catch (e) { sendFailed(e); } } });
        var stale = 0;
        net.conns.slice().forEach(function(c) {
            if (!lastSeen[c.peer]) lastSeen[c.peer] = now;
            var age = now - lastSeen[c.peer];
            var p = net.roster[c.peer];
            if (age > HB_DEAD && !(holdUntil[c.peer] > now)) {   // F2b: a player who said they would freeze (a print dialog) is waited for
                if (p) toast((p.name || 'A player') + ' stopped responding — dropped.');
                try { c.close(); } catch (e) {}   // the close handler removes them from the roster
            } else if (age > HB_STALE) {
                stale++;
                if (p && !p.stale) { p.stale = true; renderRoster(); }
            } else if (p && p.stale) { delete p.stale; renderRoster(); }
        });
        var n = net.conns.length;
        setIndicator(stale ? 'warn' : 'ok', stale ? stale + ' player' + (stale > 1 ? 's' : '') + ' not responding' : 'hosting, ' + n + ' player' + (n === 1 ? '' : 's') + ' connected');
        if (typeof fogDragSweep === 'function') fogDragSweep();   // fold M4: a drag that ended without landing goes back where it began
    } else {
        var c0 = net.conns[0];
        if (c0 && c0.open) { try { c0.send({ type: 'hb' }); } catch (e) { sendFailed(e); } }
        if (!hostLastSeen) hostLastSeen = now;
        var age0 = now - hostLastSeen;
        if (reconn.pending) { setIndicator('warn', 'reconnecting to the GM'); return; }
        if (age0 > HB_DEAD && !(hostHoldUntil > now)) {   // F2b: nor is a GM who said so
            setIndicator('bad', 'lost the GM — reconnecting');
            setStatus('No response from the GM for ' + Math.round(age0 / 1000) + 's — reconnecting…');
            toast('No response from the GM — reconnecting…');
            hostLastSeen = now;
            try { if (c0) c0.close(); } catch (e) {}   // its close handler starts the reconnect loop
            setTimeout(function() { if (net.active && net.role === 'client' && !reconn.pending) scheduleReconnect(); }, 1500);
        } else if (age0 > HB_STALE) {
            setIndicator('warn', 'GM not responding for ' + Math.round(age0 / 1000) + 's');
            setStatus('Connected, but no word from the GM for ' + Math.round(age0 / 1000) + 's…');
        } else setIndicator('ok', 'connected to the GM');
    }
}
// Where each player was last seen, for presence after they leave. Host: from the campaign record
// (kept in step with the roster); client: from the last roster broadcast.
net.away = {};
// [netcheck:away-start]
function awayMap() {
    if (net.role !== 'host') return net.away || {};
    // a PLAIN object (the packer refuses one without a prototype) of checked player ids to checked map ids: camp.players comes from a
    // save or an import, and one record keyed "constructor" or "hasOwnProperty" made the packer refuse the whole roster message
    var camp = getActiveCampaign(), out = {};
    if (camp && camp.players && typeof camp.players === 'object') Object.keys(camp.players).forEach(function(pid) { var r = camp.players[pid]; if (validProfileId(pid) && r && typeof r === 'object' && validKey(r.lastMap)) out[pid] = r.lastMap; });
    return out;
}
// [netcheck:away-end]
// Players the GM forgot while they were at the table (Players panel ▸ Forget): no record comes back for them this session — only their
// next Allow (admitPlayer) makes one, so the forget is whole and that join is asked about like a stranger's
net.forgotten = Object.create(null);
function syncLastMaps() {
    if (net.role !== 'host') return;
    var camp = getActiveCampaign(); if (!camp) return;
    camp.players = camp.players || {};
    Object.values(net.roster).forEach(function(p) {
        if (!p || !p.id || !p.location || net.forgotten[p.id]) return;
        camp.players[p.id] = camp.players[p.id] || { name: p.name || p.id };
        camp.players[p.id].lastMap = p.location;
    });
}
// Who is on a given map — for the Maps sidebar presence dots. Connected players (live) plus
// registered players last seen there (persisted after they leave). GM-side only: camp.players is
// stripped for players, and net.roster is the host's. Each: { id, name, avatar, connected, hue }.
net.playersOnMap = function(mapId) {
    if (!mapId) return [];
    var out = [], seen = {};
    Object.values(net.roster || {}).forEach(function(p) {
        if (p && p.id && p.location === mapId) { out.push({ id: p.id, name: p.name || p.id, avatar: p.avatar, connected: true, hue: playerHue(p.id), color: p.color || null }); seen[p.id] = 1; }
    });
    var camp = getActiveCampaign();
    if (camp && camp.players) Object.keys(camp.players).forEach(function(pid) {
        var rec = camp.players[pid];
        if (rec && !seen[pid] && rec.lastMap === mapId) out.push({ id: pid, name: rec.name || pid, avatar: null, connected: false, hue: playerHue(pid), color: rec.color || null });
    });
    return out;
};
function renderRoster() {
    syncLastMaps();
    updateSidebarNav();   // keep the Maps sidebar presence dots in step with the roster
    var el = ui('netRoster');
    if (el) {
        var players = Object.values(net.roster);
        if (!players.length) {
            el.textContent = 'No players connected yet.';
        } else {
            var camp = getActiveCampaign();
            el.innerHTML = players.map(function(p) {
                var name = escTextRoster(p.name || p.id);
                var initials = name.trim().split(/\s+/).map(function(s) { return s[0]; }).join('').slice(0, 2).toUpperCase();
                var it = camp && p.location && own(camp.items, p.location) ? camp.items[p.location] : null;
                var locTitle = it && it.meta && it.meta.title ? it.meta.title : (p.location || '');
                var sub = net.role === 'host' && p.location
                    ? '<span class="roster-loc">' + (p.detached ? '🧭 ' : '👣 ') + escTextRoster(locTitle) + '</span>'
                    : '';
                var jump = net.role === 'host' && p.location ? ' data-jump="' + escTextRoster(p.location) + '" title="Click to view this player\'s map"' : '';
                var avOk = safeAvatar(p.avatar);   // the whole data URL checked, and escaped anyway
                var face = avOk
                    ? '<img class="roster-avatar" src="' + escTextRoster(p.avatar) + '" alt="">'
                    : '<img class="roster-avatar" src="' + (window.wpDefaultAvatar ? window.wpDefaultAvatar(p.color || ('hsl(' + playerHue(p.id) + ',55%,60%)')) : '') + '" alt="">';   // no photo → the color-tinted silhouette default
                var peerKey = Object.keys(net.roster).find(function(k) { return net.roster[k] === p; });
                var kick = net.role === 'host'
                    ? '<button class="roster-summon" data-summon="' + escTextRoster(peerKey) + '" title="Summon this player to the map you are on">&#128227;</button>' +
                      '<button class="roster-kick" data-kick="' + escTextRoster(peerKey) + '" title="Remove this player (they stay out for the rest of the session)">&times;</button>'
                    : '';
                var staleMark = p.stale ? '<span class="roster-stale-mark" title="Not responding — will be dropped if silence continues">&#9203;</span>' : '';
                return '<span class="roster-chip' + (p.stale ? ' roster-stale' : '') + '"' + jump + '>' + face +
                    '<span>' + name + '</span>' + staleMark + sub + kick + '</span>';
            }).join('');
        }
    }
    if (window.wpRenderPartyStrip) window.wpRenderPartyStrip();   // the party strip mirrors who is connected
    var badge = ui('netBtn');
    if (badge) badge.classList.toggle('net-live', net.active);
    // Spectator chrome stays while a host's campaign is on screen, connected or not (net.foreign)
    document.body.classList.toggle('net-client', (net.active && net.role === 'client') || !!net.foreign);
    renderWhere();   // the top bar's campaign › map follows the session: a leave or a reconnect clears it at once
}
function countOf(v) { var n = Math.floor(Number(v)); return isFinite(n) && n > 0 ? n : 0; }   // a count from a player record (a save or an import): a number, never markup
function escTextRoster(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
var _rosterEl = ui('netRoster');
if (_rosterEl) _rosterEl.addEventListener('click', function(e) {
    var kickBtn = e.target.closest('[data-kick]');
    if (kickBtn && net.role === 'host') {
        e.stopPropagation();
        net.kickPlayer(kickBtn.dataset.kick);
        return;
    }
    var summonBtn = e.target.closest('[data-summon]');
    if (summonBtn && net.role === 'host') {
        e.stopPropagation();
        net.summonPlayer(summonBtn.dataset.summon);
        return;
    }
    var chip = e.target.closest('[data-jump]');
    if (!chip || net.role !== 'host') return;
    var camp = getActiveCampaign();
    if (!camp || !camp.items[chip.dataset.jump]) return;
    camp.activeItemId = chip.dataset.jump;
    ui('netModal').style.display = 'none';
    save();
    updateSidebarNav();
    render();
    if (window.appRestoreCamera) window.appRestoreCamera();
});

/* ---------- what clients are allowed to receive ---------- */
// Strip GM-only content before anything leaves the host: planners never ship,
// room notes / character dossier info never ship, GM-note cards never ship,
// and hidden whiteboard items never ship (not even their place).
// Token stance from a player: a finite elevation in yards, a posture of the list in use (conditions C3: the system's own, by its id, else the seven)
var POSTURE_SET = { standing: 1, crouching: 1, sitting: 1, kneeling: 1, crawling: 1, 'lying-prone': 1, 'lying-face-up': 1 };
var POSTURE_OLD = { prone: 'lying-prone', supine: 'lying-face-up' };   // 1.4.6 pre-release ids, still read
function cleanElevation(v) { v = Math.round(Number(v) * 10) / 10; return isFinite(v) ? Math.max(-999, Math.min(999, v)) : 0; }
function cleanPosture(v, sys) {   // '' for the first posture (none stored)
    var S = typeof window === 'object' && window ? window.wpSystemCore : null;
    if (S && S.ownPostures && S.ownPostures(sys)) { var at = S.postureAt(sys, typeof v === 'string' ? v : ''); return at.i > 0 && at.p ? at.p.id : ''; }
    v = String(v || 'standing').toLowerCase(); v = POSTURE_OLD[v] || v; return POSTURE_SET[v] && v !== 'standing' ? v : '';
}
function sanitizeItem(item) {
    if (!item) return item;
    if (item.type === 'planner') return null;
    if (item.type === 'doc') return window.wpDocRender ? window.wpDocRender.cleanDoc(item) : null;   // GM-only pages and unknown block types never leave the host; without the renderer, no page at all
    if (item.type !== 'map') return item;
    var m = JSON.parse(JSON.stringify(item), wireNum);
    delete m.fogLit; delete m.lightsCapped;   // lighting L3: only ever set per player, on their own copy (fogCopyFor) — never from the host's map
    delete m.fogMarks; delete m.fogOff;   // senses S4: likewise a player's marks
    // fog of war (1.5.0 FV2): map.fog travels so a player's client can paint its own-vision overlay; the host
    // separately DROPS the creatures a recipient cannot see (fogFilterClean, per recipient) before each send.
    (m.rooms || []).forEach(function(r) {
        delete r.notes;
        delete r.handoutId;
        (r.characters || []).forEach(function(c) { delete c.info; delete c.ref; });
    });
    // link labels are visible; link notes are GM prep
    m.links = (m.links || []).map(function(lk) {
        if (!(lk[3] && typeof lk[3] === 'object')) return lk;
        var keep = lk.slice(0, 3); if (lk[3].label) keep.push({ label: lk[3].label }); return keep;
    });
    m.whiteboard = (m.whiteboard || []).map(function(w) { return wireWbItem(w, true); }).filter(function(w) { return w !== null; });
    return m;
}
// Fold M: one item's rule on its way to a player, for a whole map's copy (sanitizeItem, whose clone it already is: cloned = true) and for
// one item sent alone (cloned = false: copied and bounded here first, so the host's own item is never touched). null for a GM-note card
// and for a hidden piece: what the GM hides is not sent at all — no id, no box, nothing to draw (owner, 2026-10-01: players see nothing
// where something is hidden; a box in its place told them where a hidden creature, a secret door or a trap tile was)
function wireWbItem(w, cloned) {
    if (w.gmNoteFor || w.hidden) return null;
    if (!cloned) w = JSON.parse(JSON.stringify(w), wireNum);
    // attached sheets, the per-token GM note/dialogue AND the token creator's kept original are GM prep (and heavy) — never on the wire
    if (w.sheet || w.gmInfo || w.frame) { delete w.sheet; delete w.gmInfo; delete w.frame; }
    if (w.senses !== undefined || w.blind !== undefined || w.unsensed !== undefined || w.nulls !== undefined) { delete w.senses; delete w.blind; delete w.unsensed; delete w.nulls; }   // S7a: a null area's senses are the GM's   // senses S2b, S3, S4 (unsensed: never on the wire at all): a token's own ranges and the GM's Blind tick are the GM's: only its player's own copy of a fogged map gets them back (fogCopyFor)
    if (w.fxb !== undefined) delete w.fxb;   // conditions C1: never taken from the map; worked out afresh below
    if (w.isChar && typeof fxbOf === 'function') { var fxb = fxbOf(w); if (fxb) w.fxb = fxb; }   // C2: a token with no sheet, from its own
    if (w.fx !== undefined) delete w.fx;   // conditions C2: a token's own rows are the GM's (their GM-only ids and names): the table gets fxb
    return w;
}
// Conditions C1 (docs/CONDITIONS_PLAN.md): the effects the table sees on a token, the host's list ([{ n, i, t }], never a GM-only effect) or
// null — a character token's from its character, a token with no sheet from its own rows (C2). Each list worked out is remembered (by the
// character, or by the token for one of its own), so a change of it is found once (fxbMoved)
var _fxbSig = Object.create(null);
function fxbOf(w) {
    if (net.role !== 'host' || !w || typeof w !== 'object') return null;
    var camp = getActiveCampaign(), S = SC(); if (!camp || !S || !S.tokenEffects) return null;
    var list, key;
    if (typeof w.charId === 'string' && camp.chars && own(camp.chars, w.charId)) { key = w.charId; list = S.tokenEffects(camp.system, camp.chars[w.charId], false, window.wpFormula); }   // conditions C4: its automatic effects too
    else if (Array.isArray(w.fx) && S.tokenOwnEffects && typeof w.id === 'string') { key = 'w:' + w.id; list = S.tokenOwnEffects(camp.system, w.fx, false); }
    else return null;
    list = list.map(function(e) { return { n: e.n, i: e.i, t: e.t }; });
    _fxbSig[key] = JSON.stringify(list);
    return list.length ? list : null;
}
// A character's change (called where sensesMoved is): every map holding a shown token of a character whose list moved since a copy was last
// made is sent again, its per-player delta carrying the one token. id: one character, or null for every one (the system changed: a token
// with no sheet looked at again too, since its library effects may have)
function fxbMoved(id) {
    if (!net.active || net.role !== 'host') return;
    var camp = getActiveCampaign(), S = SC(); if (!camp || !S || !S.tokenEffects || !camp.chars) return;
    var moved = Object.create(null), out = Object.create(null);
    (id === null ? Object.keys(camp.chars) : [id]).forEach(function(cid) {
        if (typeof cid !== 'string' || !own(camp.chars, cid) || _fxbSig[cid] === undefined) return;   // no copy made with it yet: nothing to catch up
        var was = _fxbSig[cid]; fxbOf({ charId: cid }); if (was !== _fxbSig[cid]) moved[cid] = 1;
    });
    Object.keys(camp.items || {}).forEach(function(mid) {
        var m = camp.items[mid]; if (!m || m.type !== 'map' || !Array.isArray(m.whiteboard)) return;
        m.whiteboard.forEach(function(w) {
            if (!w || !w.isChar || w.hidden) return;   // a hidden token is not sent at all
            if (typeof w.charId === 'string' && own(camp.chars, w.charId)) { if (moved[w.charId] === 1) out[mid] = 1; return; }
            var k = 'w:' + w.id; if (id !== null || !Array.isArray(w.fx) || typeof w.id !== 'string' || _fxbSig[k] === undefined) return;
            var was = _fxbSig[k]; fxbOf(w); if (was !== _fxbSig[k]) out[mid] = 1;
        });
    });
    Object.keys(out).forEach(function(mid) { net.sendItem(camp.id, mid); });
}
/* ---------- fog of war (1.5.0 FV2): per-recipient creature drop ----------
   window.wpFog.fogDropIds(recipientId, camp, map) → the ids of character tokens the recipient cannot see, or null
   (no fog / drop nothing). sanitizeItem clones the heavy map ONCE; fogFilterClean makes a cheap shallow copy with a
   filtered whiteboard per peer (never re-cloning images — §11R-5). A hidden token is already out of the clean copy
   (wireWbItem); an unseen one is dropped here, matched by id. */
// [netcheck:foglit-start]
// Senses S0: what each player's own tokens saw by when their copy of a fogged map was last made (profile id | map id -> wpFog.sightSigFor's
// text). The host's memory only: never saved, never sent. Every copy made for a player seeds it, so a later change is judged against what
// that player holds. _sensesAt is the text the host last knew, by a copy made or by the hook: when it moves, that map's set of who sees what
// (the live position relay's) is emptied, since a set may have been worked out under the old one
var _sensesSig = Object.create(null), _sensesAt = Object.create(null);
function sensesSeed(pid, camp, map) {
    if (!pid || !map || !window.wpFog || !window.wpFog.sightSigFor) return;
    var s = window.wpFog.sightSigFor(pid, camp, map), k = pid + '|' + map.id;
    if (s === null) { delete _sensesSig[k]; delete _sensesAt[k]; return; }
    _sensesSig[k] = s;
    if (_sensesAt[k] !== s) { _sensesAt[k] = s; if (window.wpFog.invalidateSeen) window.wpFog.invalidateSeen(map.id); }
}
function fogDrop(camp, map, recipientId) { return (window.wpFog && recipientId && camp && map) ? window.wpFog.fogDropIds(recipientId, camp, map) : null; }
function fogFilterClean(clean, dropSet) {
    if (!dropSet || !clean || clean.type !== 'map' || !Array.isArray(clean.whiteboard)) return clean;
    var kept = clean.whiteboard.filter(function(w) { return !dropSet[w.id]; });
    if (kept.length === clean.whiteboard.length) return clean;
    var copy = {}; for (var k in clean) copy[k] = clean[k]; copy.whiteboard = kept; return copy;
}
// Lighting L3: one player's copy of a fogged map — the creatures they cannot see dropped, plus what their copy's own lights cannot show them
// (fogLit: the lit cells a light on a dropped creature gives the cells they see; lightsCapped: the host's lights past a cap). Always set on a copy
// made for that player: the shared clone never carries one player's cells
// Senses S2b: a player's own tokens on their copy of a fogged map carry the ranges the GM gave them (item.senses, as the host reads it: cleaned,
// the senses the system holds only), and S3 the GM's Blind tick (item.blind, true only). Never a hidden or waiting token's, never on an unfogged
// map; the shared clone never holds them, so the copy gets a board and a token of its own; with nothing to give, the same object
function fogOwnSenses(out, camp, map, pid) {
    var FCs = window.wpFogCore; if (!pid || !FCs || !mapFogged(map) || !Array.isArray(map.whiteboard)) return out;
    var list = camp && camp.system && camp.system.combat && camp.system.combat.senses && Array.isArray(camp.system.combat.senses.list) ? camp.system.combat.senses.list : [], ids = Object.create(null), give = Object.create(null), any = false;
    list.forEach(function(s) { if (s) ids[s.id] = 1; });
    map.whiteboard.forEach(function(w) {
        if (w.ownerId !== pid || w.hidden || w.waiting || w.gmNoteFor) return;
        var ts = (FCs.cleanTokSenses(w.senses) || []).filter(function(e) { return ids[e.id] === 1; }), b = w.blind === true;
        if (ts.length || b) { give[w.id] = { ts: ts.length ? ts : null, b: b }; any = true; }
    });
    if (!any) return out;
    var cp = {}; for (var k in out) cp[k] = out[k];
    cp.whiteboard = out.whiteboard.map(function(w) { var g = give[w.id]; if (!g || w.hidden) return w; var c = {}; for (var kk in w) c[kk] = w[kk]; if (g.ts) c.senses = g.ts; if (g.b) c.blind = true; return c; });
    return cp;
}
function fogCopyFor(clean, camp, map, recipientId) {
    sensesSeed(recipientId, camp, map);
    var drop = fogDrop(camp, map, recipientId), out = fogOwnSenses(fogFilterClean(clean, drop), camp, map, recipientId);
    var fl = window.wpFog && window.wpFog.fogLitFor && recipientId ? window.wpFog.fogLitFor(recipientId, camp, map, drop) : null;
    var mk = window.wpFog && window.wpFog.fogMarksFor && recipientId ? window.wpFog.fogMarksFor(recipientId, camp, map, drop) : null;   // senses S4: their marks
    var off = window.wpFog && window.wpFog.fogOffFor && recipientId ? window.wpFog.fogOffFor(recipientId, camp, map) : null;   // senses S7a: their own tokens' senses a null area switches off
    var lit = !!(fl && fl.lit && fl.lit.length), cap = !!(fl && fl.capped);
    if (!lit && !cap && !mk && !off) return out;
    if (out === clean) { var cp = {}; for (var kk in clean) cp[kk] = clean[kk]; out = cp; }
    if (lit) out.fogLit = fl.lit;
    if (cap) out.lightsCapped = true;
    if (mk) out.fogMarks = mk;
    if (off) out.fogOff = off;
    return out;
}
// [netcheck:foglit-end]
// Is any map in the hosted campaign fogged? While false, every per-recipient loop below stays on the old single-broadcast path.
function anyFog(camp) {
    if (!window.wpFog || !window.wpVtt || !window.wpVtt.on('fog') || !camp || !camp.items) return false;
    return Object.keys(camp.items).some(function(id) { var it = camp.items[id]; return !!(it && it.type === 'map' && it.fog && it.fog.on === true); });   // fog on is true alone, as fog.js reads it (fogcore cleanFog)
}
// Everything a player receives is built from the two clones above and below: a number the wire's packer would refuse (a whole number past
// 64 bits — typed into a box, imported, computed) is bounded as it is copied, so one value can never stop a map, a join or a snapshot.
function wireNum(k, v) { return (typeof v === 'number' && (v > 1e15 || v < -1e15)) ? (v > 0 ? 1e15 : -1e15) : v; }
function sanitizeAppState(s, recipientId) {   // recipientId: the player this copy is for (characters are per recipient); absent = nobody's (the stream window)
    // a session is one campaign (owner's answer, 2026-09-29): only the hosted campaign is copied at all — the GM's other games (their names,
    // maps and planners) never reach a player or the stream window
    var one = {}; Object.keys(s || {}).forEach(function(k) { if (k !== 'campaigns') one[k] = s[k]; });
    one.campaigns = {}; if (s && s.campaigns && typeof s.activeCampaignId === 'string' && own(s.campaigns, s.activeCampaignId)) one.campaigns[s.activeCampaignId] = s.campaigns[s.activeCampaignId];
    var c = JSON.parse(JSON.stringify(one), wireNum);
    delete c.imageCats;   // the GM's picture-library categories
    delete c._foreign; delete c._cleanup; delete c._picsV;   // origin marker, cleanup notes and the picture-category migration marker stay on this machine
    Object.values(c.campaigns || {}).forEach(function(camp) {
        delete camp._foreign; delete camp._keptByUser;
        // GM bookkeeping: the player registry, history, and ban list never ship
        delete camp.players;
        delete camp.bannedPlayers;
        delete camp.handouts;
        delete camp.handoutReveals;
        delete camp.handoutLog;
        delete camp.cast;
        delete camp.pinnedMaps;
        delete camp.sessionLog;
        delete camp.pictures; delete camp.imageCats;   // the picture library's per-campaign bookkeeping (1.5.0)
        delete camp.sounds;   // the sound index (1.5.0): the hosted campaign's playable list goes as its own message, validated on arrival
        delete camp.music;    // the music library (1.5.0): likewise travels only as the validated 'music' message, never raw in the snapshot
        delete camp.library;  // the item library's manifest (Stage 6 L1c): the GM's; a player holds only the copies the host puts on their rows
        delete camp.uploads;  // Stage 6 U2: the GM's queue of players' sheet uploads to review
        delete camp.videos;   // item 21: the video library is the GM's alone (a video reaches players as a live stream, never as a file or a list)
        if (window.wpDocRender && window.wpDocRender.cleanDocStyle) { var _cds = window.wpDocRender.cleanDocStyle(camp.docStyle); if (_cds) camp.docStyle = _cds; else delete camp.docStyle; }   // the campaign's document appearance travels (validated: fonts from the list, hex colors) so a player's Handbook matches; the client re-validates at render too
        var libFx = fxLib(camp.system), libIt = itemLib(camp.system), fullSys = camp.system;   // 5h / Stage 6: the full libraries (and F6: the full system), before the players' view replaces the system (a GM-only effect or item reaches its owner inline)
        if (camp.id === c.activeCampaignId && camp.system && window.wpSystemCore && window.wpFormula) {   // character sheets (1.5.0): the hosted campaign's system travels as the players' view, GM-only fields gone
            var psys = window.wpSystemCore.cleanSystem(camp.system, { F: window.wpFormula, gmView: false, pages: (window.wpSheets && window.wpSheets.readablePages) ? window.wpSheets.readablePages(camp) : [], libCats: window.wpLibrary && window.wpLibrary.catsFor ? window.wpLibrary.catsFor() : null }); if (psys) camp.system = psys; else delete camp.system;   // chips/links only to pages players may read (Stage 5f; fails closed)
        } else delete camp.system;
        if (camp.id === c.activeCampaignId && recipientId && camp.chars && camp.system && window.wpSystemCore) {   // characters (1.5.0): this recipient's own in full, other PCs' hover fields, NPCs never
            var outCh = {}; Object.keys(camp.chars).forEach(function(id) { var v = withHoverLines(window.wpSystemCore.charFor(camp.chars[id], camp.system, recipientId, { lib: libFx, items: libIt, full: fullSys }), camp.chars[id], camp.system, libFx, libIt, fullSys); if (v) outCh[id] = v; }); camp.chars = outCh;
        } else delete camp.chars;
        // fog of war (1.5.0 FV2): the sight-field mapping + default travel for the hosted campaign, so a client resolves
        // its own sight the same way the host does (character sheets already travel per recipient above)
        if (camp.id === c.activeCampaignId && window.wpFogCore) camp.fog = window.wpFogCore.cleanCampFog(camp.fog);
        else delete camp.fog;
        var ckS = camp.id === c.activeCampaignId && typeof clockOut === 'function' ? clockOut(camp) : null; if (ckS) camp.clock = ckS; else delete camp.clock;   // item 20 K2: the hosted campaign's clock, its time alone, while players may see it
        Object.keys(camp.items).forEach(function(id) {
            var orig = camp.items[id];
            if (orig && orig.type === 'doc' && camp.id !== c.activeCampaignId) { delete camp.items[id]; return; }   // a session is one campaign: only the hosted campaign's pages travel
            var it = sanitizeItem(orig);
            if (it === null) { delete camp.items[id]; return; }
            if (it.type === 'map' && recipientId && camp.id === c.activeCampaignId) it = fogCopyFor(it, (s.campaigns && s.campaigns[camp.id]) || camp, orig, recipientId);   // drop the creatures this player cannot see (judged on the host's own campaign, as every later send is), with their lit cells
            camp.items[id] = it;
        });
        // a client's active item is always a map: the host's own open page or planner is not its business, and a
        // join before the GM viewed any map (stage null) lands on a map too — a page must never open the editor there
        var actS = camp.items[camp.activeItemId];
        if (!actS || actS.type !== 'map') camp.activeItemId = Object.keys(camp.items).find(function(id) { return camp.items[id].type === 'map'; }) || null;
    });
    return c;
}

function fogNow() { return Date.now(); }   // fold M4: the clock of an open drag (a test runs its own)
// [netcheck:fogmove-start]
// Fold M4: a player's open drag is judged where it began. Every copy of a fogged map, the turn order and the pointers are made with each open
// drag's token held at its start (fogLanded), so nothing a player would see only from mid-drag reaches anyone before the drop lands; their own
// dragged token alone travels to them where their drag has it now (fogOwnLive). A drag that ends without landing (its connection closed, its
// player removed or on another map, the token locked or hidden by the GM, 30 s with no move, the session ended) goes back where it began, for
// everyone, as a refused drop does (fogDragSweep); a paused table keeps its drag, and one the host moved past is forgotten, its place standing
var FOG_DRAG_STALE_MS = 30000;
function fogLanded(mapId, fn) {   // mapId: that map's open drags; null: every map of the hosted campaign
    var camp = getActiveCampaign(), held = [];
    try {
        openDrags().forEach(function(e) {
            if (e.held || (mapId && e.mapId !== mapId)) return;   // held already: an outer call has it at its start
            var m = camp && camp.items && own(camp.items, e.mapId) ? camp.items[e.mapId] : null;
            var w = m && Array.isArray(m.whiteboard) ? m.whiteboard.find(function(x) { return !!x && x.id === e.wbId; }) : null;
            if (!w || openDrag(e.mapId, w) !== e) return;
            var was = {}; ['x', 'y', 'rot', 'front'].forEach(function(k) { was[k] = Object.prototype.hasOwnProperty.call(w, k) ? [w[k]] : null; });
            held.push([e, w, was]); e.held = true;
            w.x = e.x; w.y = e.y; w.rot = e.rot; w.front = e.front;
        });
        return fn();
    } finally {   // exactly as found: a key that was absent is absent again
        held.forEach(function(h) { ['x', 'y', 'rot', 'front'].forEach(function(k) { if (h[2][k]) h[1][k] = h[2][k][0]; else delete h[1][k]; }); delete h[0].held; });
    }
}
// the player's own dragged token, on their own copy only (never the shared clone), where their drag has it now: their app draws it under their
// pointer, and they (their other connections too) hear that place through the relay anyway
function fogOwnLive(out, mapId, pid) {
    if (!out || !Array.isArray(out.whiteboard) || !pid) return out;
    var wb = null;
    openDrags().forEach(function(e) {
        if (!e.held || e.mapId !== mapId) return;
        var list = wb || out.whiteboard, i = -1;
        for (var j = 0; j < list.length; j++) if (list[j] && list[j].id === e.wbId) { i = j; break; }
        var t = i >= 0 ? list[i] : null; if (!t || t.hidden || t.ownerId !== pid) return;
        if (!wb) wb = out.whiteboard.slice();
        wb[i] = Object.assign({}, t, { x: e.lx, y: e.ly, rot: e.lr, front: e.lf });
    });
    if (!wb) return out;
    var cp = {}; for (var k in out) cp[k] = out[k]; cp.whiteboard = wb; return cp;
}
function fogDragSweep(all) {   // all: the session is ending, every open drag goes back
    if (!net.active || net.role !== 'host') return;
    var camp = getActiveCampaign(), now = typeof fogNow === 'function' ? fogNow() : 0;
    openDrags().forEach(function(e) {
        if (e.held) return;
        var m = camp && camp.items && own(camp.items, e.mapId) ? camp.items[e.mapId] : null;
        var w = m && m.type === 'map' && Array.isArray(m.whiteboard) ? m.whiteboard.find(function(x) { return !!x && x.id === e.wbId; }) : null;
        if (!w || openDrag(e.mapId, w) !== e) { dragEnd(e); return; }   // the token or its map gone, or the host moved it since: forgotten
        var pr = own(net.roster, e.peer) && net.conns.some(function(c) { return c.peer === e.peer && c.open; }) ? net.roster[e.peer] : null;
        if (all || w.locked || w.hidden || !pr || (typeof pr.location === 'string' && pr.location !== e.mapId)) { dragEnd(e, camp, m, w); return; }
        if (net.paused || (typeof peerPaused === 'function' && peerPaused(e.peer))) { e.at = now; return; }   // paused: kept, its 30 s counted from the resume
        if (now - e.at > FOG_DRAG_STALE_MS) dragEnd(e, camp, m, w);
    });
}
// Fold M5: what each connection's copy of each fogged map holds, as the host last sent it whole: its items' ids, its lit cells (a hash) and its
// light cap. The host's memory only, never saved or sent; recorded only after a send that went out; both levels prototype-free, never parsed
// apart (a connection's id and a map's id may hold any character). Forgotten when the connection closes or its player is removed, when the
// map goes or is sent to the table unfogged, and at a new table
var _fogHeld = Object.create(null);
// Fold R: and whether that copy changes the player's turn order or pointers on that map — a fight's row whose token it now holds and did not,
// or the other way, or a pointer's target likewise; with no record before, always (the order they hold was judged on some other copy;
// fogRoster sends nothing where the map has no fight and no pointer). The whole-copy senders then send that connection the order and the pointers again: a
// creature the GM walks out of a player's sight loses its name there at once, not at the next turn step
function fogSeed(conn, mapId, out) {
    if (!conn || typeof conn.peer !== 'string' || typeof mapId !== 'string' || !out || !Array.isArray(out.whiteboard)) return false;
    var ids = Object.create(null); out.whiteboard.forEach(function(w) { if (w && typeof w.id === 'string') ids[w.id] = 1; });
    var per = _fogHeld[conn.peer] || (_fogHeld[conn.peer] = Object.create(null)), was = per[mapId];
    per[mapId] = { ids: ids, lit: quickHash(JSON.stringify(out.fogLit || [])), cap: out.lightsCapped === true, mk: quickHash(JSON.stringify(out.fogMarks || [])), of: quickHash(JSON.stringify(out.fogOff || {})) };   // senses S4: its marks too; S7a: what a null area switches off
    if (!was) return true;
    var toks = [], cmb = net.combats && own(net.combats, mapId) ? net.combats[mapId] : null;
    if (cmb && Array.isArray(cmb.rows)) cmb.rows.forEach(function(r) { if (r && r.tokId) toks.push(r.tokId); });
    Object.keys(net.targets || {}).forEach(function(p) { var t = net.targets[p]; if (t && t.mapId === mapId && t.id) toks.push(t.id); });
    return toks.some(function(id) { return !was.ids[id] !== !ids[id]; });
}
function fogSeedSnapshot(conn, snap) {   // every fogged map of the hosted campaign, as the join snapshot carried it
    var camp = getActiveCampaign(), cs = snap && snap.appState && snap.appState.campaigns, sc = camp && cs && own(cs, camp.id) ? cs[camp.id] : null;
    if (!sc || !sc.items || !camp.items) return;
    Object.keys(camp.items).forEach(function(id) { if (mapFogged(camp.items[id]) && own(sc.items, id)) fogSeed(conn, id, sc.items[id]); });
}
// [netcheck:acks-start]
// 14c (the step-back): the highest action number the host has finished handling from each connection ('a' on a player's final, map patch and
// threat marks), whatever became of it; every copy of a map sent to that connection says it ('ack'), so their app keeps the actions of theirs a
// copy made before them lacks. Taken only after a handler has run: a copy made inside it before the action lands (the GM's pending edit saved
// first) must not claim it. The channel is ordered, so every lower number has been handled too. The host's memory only, one number per
// connection, forgotten with it and at a new table
var ACK_MAX = 2147483647, _acks = Object.create(null);
function ackNum(v) { return typeof v === 'number' && v % 1 === 0 && v >= 1 && v <= ACK_MAX ? v : 0; }
function ackOf(conn) { return conn && typeof conn.peer === 'string' && own(_acks, conn.peer) ? _acks[conn.peer] : 0; }
function ackTook(conn, a) { var n = ackNum(a); if (n && conn && typeof conn.peer === 'string' && n > ackOf(conn)) _acks[conn.peer] = n; }
function withAck(msg, conn, at) { var o = {}; for (var k in msg) if (Object.prototype.hasOwnProperty.call(msg, k)) o[k] = msg[k]; o.ack = Math.max(ackOf(conn), ackNum(at)); return o; }   // a copy of the message for that connection, with how far its copy goes (at: the action a put-back answers)
function ackSend(msg) {   // a map for every admitted, open connection, each with its own number (a shared broadcast cannot carry one)
    net.conns.forEach(function(c) { if (!c.open || (net.role === 'host' && !own(net.roster, c.peer))) return; try { c.send(withAck(msg, c)); } catch (e) { sendFailed(e); } });
}
// [netcheck:acks-end]
// [netcheck:hidpend-start]
// hidden pieces (owner, 2026-10-01): a drawing of a player's that the GM hid is on no copy of theirs, so a map copy of theirs that leaves it out
// is no erase — and still none once the GM shows it again, until a copy of theirs names it (a copy made before the shown drawing reached them
// lacks it too). The host's memory only, per connection and map: the ids of their own drawings seen hidden at a send of the map or at their
// join, forgotten one by one as a copy of theirs names them or the host puts their copy right, and with the connection, the map or the table.
// A patch that leaves such a drawing out, or names one still hidden here, came from a stale copy: that connection is sent the map whole, with
// the patch's number, so their app takes it as the word on everything up to that patch (applyClientItemFiltered, the item branch)
var _hidPend = Object.create(null);
function hidNote(map) {
    if (!map || map.type !== 'map' || typeof map.id !== 'string' || !Array.isArray(map.whiteboard)) return;
    map.whiteboard.forEach(function(w) {
        if (!w || !w.hidden || w.type !== 'path' || !w.byPlayer || typeof w.ownerId !== 'string' || typeof w.id !== 'string') return;
        net.conns.forEach(function(c) {
            var pr = c && typeof c.peer === 'string' && own(net.roster, c.peer) ? net.roster[c.peer] : null; if (!pr || pr.id !== w.ownerId) return;
            var per = own(_hidPend, c.peer) ? _hidPend[c.peer] : (_hidPend[c.peer] = Object.create(null)), ids = own(per, map.id) ? per[map.id] : (per[map.id] = Object.create(null));
            ids[w.id] = 1;
        });
    });
}
function hidNoteAll() { var camp = getActiveCampaign(); if (camp && camp.items) Object.keys(camp.items).forEach(function(id) { hidNote(camp.items[id]); }); }
function hidPendOf(peer, mapId) { return typeof peer === 'string' && own(_hidPend, peer) && typeof mapId === 'string' && own(_hidPend[peer], mapId) ? _hidPend[peer][mapId] : null; }
function hidNamed(peer, mapId, ids) { var p = hidPendOf(peer, mapId); if (p) Object.keys(ids).forEach(function(id) { delete p[id]; }); }
function hidForgetMap(mapId) { Object.keys(_hidPend).forEach(function(p) { delete _hidPend[p][mapId]; }); }
// [netcheck:hidpend-end]
function fogForgetConn(peer) { if (typeof peer === 'string') { delete _fogHeld[peer]; delete _acks[peer]; delete _hidPend[peer]; } }   // 14c: and how far its copies go; hidden pieces: and the drawings of theirs the GM hid
function fogForgetMap(mapId) { Object.keys(_fogHeld).forEach(function(p) { delete _fogHeld[p][mapId]; }); }
function fogForgetAll() { _fogHeld = Object.create(null); _acks = Object.create(null); _hidPend = Object.create(null); Object.keys(_fogPend).forEach(function(k) { clearTimeout(_fogPend[k]); }); _fogPend = Object.create(null); _fogCost = Object.create(null); if (typeof combatForget === 'function') combatForget(); }   // a new table: no fight's rows seen
// Fold M7: the landing. A player's move that lands in another cell, facing or stance (their drop, or a map copy their app saves) arms a short
// timer on that map; when it fires, every admitted connection's copy of the map is caught up in place: the creatures that player now sees
// or no longer sees, the lit cells a light they cannot see gives them, the light cap ('fogDiff', the player's side is applyFogDiff), judged
// with every open drag at its start and never naming their own token. Where the host holds no record of a copy, or a message would be too
// large, or its send fails, the whole copy goes instead. Then, where the held creatures changed, the turn order and the pointers follow.
// The timer is armed once and never pushed back (the fire reads the state of its own moment); its window grows with the last fire's cost,
// 150 ms to 1 s; a fire that finds the GM's own gesture open on that map waits for it
var _fogPend = Object.create(null), _fogCost = Object.create(null), FOG_MOVE_MS = 150, FOG_DIFF_BYTES = 262144;
function fogWindowMs(cost) { return Math.min(1000, Math.max(FOG_MOVE_MS, 4 * (typeof cost === 'number' && cost > 0 ? cost : 0))); }
function fogKey(map, w, at) {   // where a token sees and lights from, and its stance (a Sight formula may read it); at: judge it at that place instead
    var F = window.wpFog, t = at ? Object.assign({}, w, { x: at.x, y: at.y, rot: at.rot, front: at.front }) : w;
    var k = F && typeof F.seenKeyOf === 'function' ? F.seenKeyOf(map, t) : null;
    return k === null ? null : k + '|' + (t.posture || 'standing') + '|' + (Number(t.elevation) || 0);
}
function fogArm(mapId) {
    if (!net.active || net.role !== 'host' || typeof mapId !== 'string') return;
    var camp = getActiveCampaign(), m = camp && camp.items && own(camp.items, mapId) ? camp.items[mapId] : null;
    if (!mapFogged(m) || _fogPend[mapId]) return;
    _fogPend[mapId] = setTimeout(function() { fogMoveFire(mapId); }, fogWindowMs(_fogCost[mapId]));
}
function fogMoveFire(mapId) {
    delete _fogPend[mapId];
    if (!net.active || net.role !== 'host') return;
    var camp = getActiveCampaign(), m = camp && camp.items && own(camp.items, mapId) ? camp.items[mapId] : null;
    if (!m || !mapFogged(m)) { fogForgetMap(mapId); return; }
    if (window.wpHostGesture === mapId) { fogArm(mapId); return; }   // the GM is changing this map just now: after
    var t0 = typeof fogNow === 'function' ? fogNow() : 0, memo = Object.create(null);
    fogLanded(mapId, function() {
        net.conns.forEach(function(c) { var pr = c && c.open ? net.roster[c.peer] : null; if (pr && typeof pr.id === 'string') fogCatchUp(c, camp, m, pr.id, memo); });
    });
    _fogCost[mapId] = (typeof fogNow === 'function' ? fogNow() : 0) - t0;
}
// one connection's copy caught up: true where the creatures it holds changed
function fogCatchUp(c, camp, m, pid, memo) {
    var per = own(_fogHeld, c.peer) ? _fogHeld[c.peer] : null, rec = per && own(per, m.id) ? per[m.id] : null;
    if (!rec) { net.sendItem(camp.id, m.id, c); fogRoster(c, pid, m.id); return true; }   // nothing known of it: the whole copy, which records it
    var jd = memo[pid];
    if (!jd) {   // once per player per fire, in fogCopyFor's order
        sensesSeed(pid, camp, m);
        var dr = fogDrop(camp, m, pid);
        jd = memo[pid] = { drop: dr || Object.create(null), fl: window.wpFog && window.wpFog.fogLitFor ? window.wpFog.fogLitFor(pid, camp, m, dr) : null, mk: window.wpFog && window.wpFog.fogMarksFor ? window.wpFog.fogMarksFor(pid, camp, m, dr) : null, of: window.wpFog && window.wpFog.fogOffFor ? window.wpFog.fogOffFor(pid, camp, m) : null };
    }
    var add = [], drop = [], prev = null, long = false;
    (Array.isArray(m.whiteboard) ? m.whiteboard : []).forEach(function(w) {
        if (!w || typeof w.id !== 'string' || w.gmNoteFor) return;
        var held = rec.ids[w.id] === 1, creature = (w.isChar || w.waiting) && w.type !== 'light' && w.ownerId !== pid;
        if (!creature) { if (held) prev = w.id; return; }
        var gone = jd.drop[w.id] === 1 || !!w.hidden;   // one the GM has hidden since is gone from every copy, as a fresh copy would have it
        if (held && gone) { drop.push(w.id); if (w.id.length > FOG_DIFF_ID_MAX) long = true; return; }
        if (!held && !gone) { var it = wireWbItem(w, false); if (!it) return; add.push({ item: it, after: prev }); if (w.id.length > FOG_DIFF_ID_MAX) long = true; prev = w.id; return; }
        if (held) prev = w.id;
    });
    var fl = jd.fl, litNow = fl && Array.isArray(fl.lit) && fl.lit.length ? fl.lit : [], litHash = quickHash(JSON.stringify(litNow)), capNow = !!(fl && fl.capped);
    var mkNow = jd.mk || [], mkHash = quickHash(JSON.stringify(mkNow));   // senses S4: their marks, sent whole when they changed ([]: none)
    var ofNow = jd.of || {}, ofHash = quickHash(JSON.stringify(ofNow));   // senses S7a: what a null area switches off, likewise ({}: none)
    var msg = { type: 'fogDiff', campId: camp.id, itemId: m.id };
    if (add.length) msg.add = add;
    if (drop.length) msg.drop = drop;
    if (litHash !== rec.lit) msg.lit = litNow;
    if (capNow !== rec.cap) msg.capped = capNow;
    if (mkHash !== rec.mk) msg.marks = mkNow;
    if (ofHash !== rec.of) msg.off = ofNow;
    var moved = add.length > 0 || drop.length > 0;
    if (!moved && msg.lit === undefined && msg.capped === undefined && msg.marks === undefined && msg.off === undefined) return false;   // nothing differs
    if (add.length > FOG_DIFF_ADD_MAX || long || JSON.stringify(msg).length > FOG_DIFF_BYTES) { net.sendItem(camp.id, m.id, c); return moved; }   // fold R: the whole copy sends the order and the pointers itself, where they changed
    try { c.send(msg); } catch (e) { sendFailed(e); net.sendItem(camp.id, m.id, c); return moved; }   // the whole copy instead, recorded only if it goes out
    add.forEach(function(a) { rec.ids[a.item.id] = 1; }); drop.forEach(function(id) { delete rec.ids[id]; });
    if (msg.lit !== undefined) rec.lit = litHash;
    if (msg.capped !== undefined) rec.cap = capNow;
    if (msg.marks !== undefined) rec.mk = mkHash;
    if (msg.off !== undefined) rec.of = ofHash;
    if (moved) fogRoster(c, pid, m.id);
    return moved;
}
// the turn order and the pointers to that connection, where that map has a fight or a pointer, judged with every open drag at its start
function fogRoster(c, pid, mapId) {
    var inFight = !!(net.combats && own(net.combats, mapId)), aimed = Object.keys(net.targets || {}).some(function(p) { var t = net.targets[p]; return !!t && t.mapId === mapId; });
    if (!inFight && !aimed) return;
    fogLanded(null, function() {
        try {
            if (inFight) c.send({ type: 'combats', combats: combatsFor(pid) });
            if (aimed) c.send({ type: 'targets', targets: targetsFor(pid) });
        } catch (e) { sendFailed(e); }
    });
}
// [netcheck:fogmove-end]
/* ---------- stage (which campaign/map the table is on) ---------- */
// The GM can pin the table to a specific map ("Players arrive at" in the Host
// panel); otherwise the stage follows whatever map the GM is viewing.
net.stageOverride = null;
// "Player's last location": each player comes back to the map they were last on and arrives
// detached (a split-party start); a first-timer lands on the fallback ("New players start at",
// '' = follow the GM). The mode is offered once the campaign has somewhere to send a player back
// to, and is the default there until the GM picks otherwise for that campaign. All of it is
// session-scoped, like stageOverride.
net.stageMode = null;        // 'last', or null for the stage select's other choices
net.stageFallback = null;    // map id, or null for Follow me
net.stagePicked = {};        // campaign id -> { mode, fallback } the GM chose for it this session

// The map this player was last on in the hosted campaign, if it still exists and is open to
// players: a map the GM has locked counts as gone, like a deleted one, so the player lands on the
// fallback instead of behind the lock. The host reads only its own record here — never a
// location the client claims.
function playerLastMap(camp, pid) {
    var rec = camp && camp.players && pid ? camp.players[pid] : null;
    var it = rec && rec.lastMap ? camp.items[rec.lastMap] : null;
    return it && it.type === 'map' && !(it.meta && it.meta.playerLock) ? it.id : null;
}
function hasLastLocations(camp) {
    return !!(camp && camp.players && Object.keys(camp.players).some(function(pid) { return playerLastMap(camp, pid); }));
}
// Resolves the mode for the campaign on screen before a session: what the GM chose for it, else
// "Player's last location" when the campaign has one. Every campaign switch passes through here
// (the panel re-renders on any of them), so another campaign's mode never lingers and the GM's
// own choice per campaign comes back. Mid-session the mode changes only by the GM's hand.
function defaultStageMode(camp) {
    if (!camp || (net.active && net.role === 'host')) return;
    var pick = net.stagePicked[camp.id];
    net.stageMode = pick ? pick.mode : (hasLastLocations(camp) ? 'last' : null);
    net.stageFallback = pick ? pick.fallback : null;
}
// Where a joining player lands: under "Player's last location" their own last map, else the
// fallback map — detached either way — and otherwise the GM's stage, following as usual.
function landingFor(prof) {
    var camp = getActiveCampaign();
    if (net.stageMode === 'last' && camp) {
        var own = playerLastMap(camp, prof.id);
        if (own) return { stage: { campId: camp.id, itemId: own }, detached: true };
        var fb = net.stageFallback ? camp.items[net.stageFallback] : null;
        if (fb && fb.type === 'map') return { stage: { campId: camp.id, itemId: fb.id }, detached: true };
    }
    return { stage: currentStage(), detached: false };
}

function currentStage() {
    var camp = getActiveCampaign();
    if (!camp) return net.lastMapStageObj || null;
    if (net.stageOverride && camp.items[net.stageOverride] && camp.items[net.stageOverride].type === 'map') {
        return { campId: camp.id, itemId: net.stageOverride };
    }
    var it = camp.items[camp.activeItemId];
    if (it && it.type === 'map') {
        net.lastMapStageObj = { campId: camp.id, itemId: camp.activeItemId };
    }
    // if the GM is on a planner, players stay on the last map
    return net.lastMapStageObj || null;
}

// Onboarding F1a: the Host panel's "Players without a character" (the hosted campaign's; stored only when not the default)
function refreshNewPlayersBox() {
    var sel = ui('netWaitingSelect'), sg = ui('netWaitingSight'), S = SC(), camp = getActiveCampaign(); if (!sel || !sg) return;
    var r = camp && S && S.newPlayerRules ? S.newPlayerRules(camp) : { token: 'on', sight: false };
    var notMine = net.active && net.role !== 'host';   // at someone else's table the box shows the table's rules, read-only
    sel.value = r.token; sg.checked = r.sight; sel.disabled = notMine; sg.disabled = notMine || r.token === 'off';
    var mkSel = ui('netMakeSelect'); if (mkSel) { var nC = camp && S && S.cleanNewPlayers ? S.cleanNewPlayers(camp.newPlayers) || {} : {}; mkSel.value = nC.create || 'live'; mkSel.disabled = notMine; }   // Onboarding F3b: whether players make their own
    var mkFile = ui('netMakeFile'); if (mkFile) { var nF = camp && S && S.cleanNewPlayers ? S.cleanNewPlayers(camp.newPlayers) || {} : {}; mkFile.checked = nF.fromFile !== false; mkFile.disabled = notMine || nF.create === 'off'; }   // Onboarding F4: and whether from a file
}
function setNewPlayers(patch) {
    if (net.active && net.role !== 'host') { refreshNewPlayersBox(); return; }   // a player never sets the table's rules (their copy follows the host's)
    var camp = getActiveCampaign(), S = SC(); if (!camp || !S || !S.cleanNewPlayers) return;
    var c = S.cleanNewPlayers(Object.assign({}, S.cleanNewPlayers(camp.newPlayers) || {}, S.newPlayerRules(camp), patch));   // Onboarding F3: the rules this box does not set (making) are kept
    if (c) camp.newPlayers = c; else delete camp.newPlayers;
    save(); refreshNewPlayersBox();
}
var _waitSel = ui('netWaitingSelect');
if (_waitSel) _waitSel.addEventListener('change', function() { setNewPlayers({ token: this.value === 'off' ? 'off' : 'on' }); toast(this.value === 'off' ? 'Players without a character get no token until you give them one.' : 'Players without a character get a waiting token.'); });
var _waitSight = ui('netWaitingSight');
if (_waitSight) _waitSight.addEventListener('change', function() { setNewPlayers({ sight: this.checked }); });
var _makeFile = ui('netMakeFile');
if (_makeFile) _makeFile.addEventListener('change', function() { setNewPlayers({ fromFile: this.checked }); toast(this.checked ? 'Players may start a character from a file (their own sheet download, or a ShadowBase sheet).' : 'Players make a character by hand only.'); });
var _makeSel = ui('netMakeSelect');
if (_makeSel) _makeSel.addEventListener('change', function() { var v = this.value === 'invite' || this.value === 'off' ? this.value : 'live'; setNewPlayers({ create: v }); toast(v === 'off' ? 'Players never make a character of their own here.' : v === 'invite' ? 'Players make a character only when you ask them (their chip \u25B8 Let them make a character).' : 'Players may make a character of their own.'); });

function refreshStageSelect() {
    refreshNewPlayersBox();
    var cSel = ui('netCampSelect');
    if (cSel) {
        cSel.innerHTML = Object.values(state.appState.campaigns).map(function(c) {
            return '<option value="' + escAttr(c.id) + '">' + escText(c.name || c.id) + '</option>';
        }).join('');
        cSel.value = state.appState.activeCampaignId || '';
    }
    var sel = ui('netStageSelect');
    if (!sel) return;
    var camp = getActiveCampaign();
    if (!camp) { sel.innerHTML = ''; return; }
    var it = camp.items[camp.activeItemId];
    var followTitle = (it && it.type === 'map' && it.meta) ? it.meta.title
        : (net.lastMapStageObj && camp.items[net.lastMapStageObj.itemId] && camp.items[net.lastMapStageObj.itemId].meta.title) || 'your current map';
    var maps = Object.values(camp.items).filter(function(m) { return m.type === 'map'; });
    maps.sort(function(a, b) { return String((a.meta && a.meta.title) || '').localeCompare(String((b.meta && b.meta.title) || '')); });
    var mapOpts = maps.map(function(m) { return '<option value="' + escAttr(m.id) + '">' + escText((m.meta && m.meta.title) || m.id) + '</option>'; }).join('');
    defaultStageMode(camp);
    // the mode in force stays listed even if the last map it relied on has since been deleted
    var lastOpt = (hasLastLocations(camp) || net.stageMode === 'last') ? '<option value="last">Player\'s last location</option>' : '';
    sel.innerHTML = lastOpt + '<option value="">Follow me — ' + escText(followTitle) + '</option>' + mapOpts;
    sel.value = net.stageMode === 'last' ? 'last' : (net.stageOverride && camp.items[net.stageOverride]) ? net.stageOverride : '';
    // "New players start at" shows only under "Player's last location"
    var fbRow = ui('netStageFallbackRow'), fbSel = ui('netStageFallbackSelect');
    if (fbRow) fbRow.style.display = net.stageMode === 'last' ? '' : 'none';
    if (fbSel && net.stageMode === 'last') {
        fbSel.innerHTML = '<option value="">Follow me — ' + escText(followTitle) + '</option>' + mapOpts;
        fbSel.value = (net.stageFallback && camp.items[net.stageFallback]) ? net.stageFallback : '';
    }
}

var _campSel = ui('netCampSelect');
if (_campSel) _campSel.addEventListener('change', function() {
    var pick = this.value;
    if (!state.appState.campaigns[pick] || pick === state.appState.activeCampaignId) return;
    // While hosting this is a campaign switch like any other: the session ends first (guardCampaignSwitch asks)
    net.guardCampaignSwitch(function() {
        state.appState.activeCampaignId = pick;
        net.stageOverride = null;   // the pinned map belonged to the previous campaign
        net.stageMode = null; net.stageFallback = null;   // so did the mode and the fallback; refreshStageSelect defaults them for this one
        net.applyingRemote = false;
        save();
        updateCampaignSelect();
        updateSidebarNav();
        render();
        if (window.appRestoreCamera) window.appRestoreCamera();
        refreshStageSelect();
        var c = getActiveCampaign();
        if (c) toast('Players will join ' + c.name + '.');
    }, refreshStageSelect);
});

var _stageSel = ui('netStageSelect');
if (_stageSel) _stageSel.addEventListener('change', function() {
    var camp = getActiveCampaign();
    var wasLast = net.stageMode === 'last';
    net.stageMode = this.value === 'last' ? 'last' : null;
    net.stageOverride = (this.value && this.value !== 'last') ? this.value : null;
    if (camp) net.stagePicked[camp.id] = { mode: net.stageMode, fallback: net.stageFallback };   // the GM chose: no more defaulting for this campaign
    refreshStageSelect();   // the fallback row appears or goes
    var hosting = net.active && net.role === 'host';
    if (net.stageMode === 'last') {
        if (hosting) {
            // connected players keep their place: the GM's browsing no longer moves them
            Object.values(net.roster).forEach(function(p) { if (p) p.detached = true; });
            renderRoster();
            broadcastRoster();
            toast('Players stay where they are; Summon All gathers them.');
        } else toast('Players will come back to the map they were last on.');
        return;
    }
    var target = net.stageOverride && camp ? camp.items[net.stageOverride] : null;
    if (hosting) {
        if (wasLast) {   // back with the GM: everyone follows again and the stage change below moves them
            Object.values(net.roster).forEach(function(p) { if (p) p.detached = false; });
            net.lastStage = null;
        }
        net.onLocalSave();   // stage key changed → followers are moved and tokens ensured
        toast(target ? 'Table pinned to ' + ((target.meta && target.meta.title) || net.stageOverride) + '.' : 'Table follows your map again.');
    } else if (target) {
        toast('Players will arrive at ' + ((target.meta && target.meta.title) || net.stageOverride) + '.');
    }
});
var _stageFbSel = ui('netStageFallbackSelect');
if (_stageFbSel) _stageFbSel.addEventListener('change', function() {
    net.stageFallback = this.value || null;
    var campF = getActiveCampaign();
    if (campF) net.stagePicked[campF.id] = { mode: net.stageMode, fallback: net.stageFallback };   // kept with the mode, per campaign
    var fbMap = net.stageFallback && campF ? campF.items[net.stageFallback] : null;
    toast(fbMap ? 'New players will start on ' + ((fbMap.meta && fbMap.meta.title) || net.stageFallback) + '.' : 'New players will follow you.');
});
function applyStage(stage) {
    if (!stage || !campOf(stage.campId) || (stage.itemId != null && !validKey(stage.itemId))) return;
    var prevCampId = state.appState.activeCampaignId;
    net.applyingRemote = true;
    state.appState.activeCampaignId = stage.campId;
    var camp = state.appState.campaigns[stage.campId];
    if (camp.items[stage.itemId] && camp.items[stage.itemId].type === 'map') camp.activeItemId = stage.itemId;   // only ever a map
    state.viewMode = 'visual';
    state.selId = null; state.selWbId = null; state.selWbIds = [];
    // Personal travel names a landing room: open the map looking at it
    if (stage.landRoomId && camp.items[stage.itemId]) {
        var destS = camp.items[stage.itemId];
        var landS = (destS.rooms || []).find(function(r) { return r.id === stage.landRoomId; });
        var ptS = landS && landingPoint(destS, landS);
        if (ptS && ptS.wbX != null) { destS.meta = destS.meta || {}; destS.meta.lastWbX = ptS.wbX; destS.meta.lastWbY = ptS.wbY; }
    }
    updateCampaignSelect();
    updateSidebarNav();
    render();
    if (window.appRestoreCamera) window.appRestoreCamera();
    net.applyingRemote = false;
    // The host moved the table onto another campaign: for the player that is a new table (its own ceiling
    // entry, its own per-table choices, the join notice if it was never seen)
    if (prevCampId !== stage.campId && !net._snapshotting && window.wpVtt) window.wpVtt.tableChanged(prevCampId);
    if (!net._snapshotting && window.wpSettingsSync) window.wpSettingsSync();
}

/* ---------- sync ---------- */
function activeItemPatch() {
    var camp = getActiveCampaign();
    if (!camp || !camp.items[camp.activeItemId]) return null;
    return { type: 'item', campId: camp.id, itemId: camp.activeItemId, item: camp.items[camp.activeItemId] };
}

// [netcheck:actlog-start]
// 14c (the step-back): a player's app numbers each action it sends ('a': a drop or a turn's end, a map patch, threat marks) and keeps, field by
// field on its own things, what each one set, until a copy of that map from its host says it goes that far ('ack'); a copy made before an
// action of theirs landed then gets that action written back over it, so it is never undone on their screen, nor by their next patch. The
// number counts up for the life of the page (a snapshot on the same connection must not start it below the host's); the record is emptied
// by every snapshot and on leaving, and holds only their own things on at most sixteen maps. A copy that says nothing (an older host) is
// taken exactly as it comes
var ACT_MAPS = 16, ACT_GEO = ['x', 'y', 'rot', 'front'], _act = { seq: 0, pend: Object.create(null), order: [] };
function actNext() { _act.seq = Math.min(2147483647, _act.seq + 1); return _act.seq; }
function ackIn(v) { return typeof v === 'number' && v % 1 === 0 && v >= 0 && v <= 2147483647 ? v : -1; }   // how far a copy goes; -1: it does not say
function actForget() { _act.pend = Object.create(null); _act.order = []; }
function actMap(mapId, make) {
    if (!validKey(mapId)) return null;
    var p = own(_act.pend, mapId) ? _act.pend[mapId] : null;
    if (!p && make) { p = _act.pend[mapId] = { t: Object.create(null), st: null }; _act.order.push(mapId); while (_act.order.length > ACT_MAPS) delete _act.pend[_act.order.shift()]; }
    return p;
}
function actSet(p, id, f, v, a) { if (typeof id !== 'string' || !id) return; var t = own(p.t, id) ? p.t[id] : (p.t[id] = Object.create(null)); t[f] = [v, a]; }
// what an action set: 'final' — a token's place and facing as sent; 'patch' — every shown, unlocked thing of theirs on the map (place, facing,
// stance, absent kept as absent) and the whole set of their drawings (by reference: a later change to one is itself a later action); 'threats'
function actNote(kind, mapId, x, a) {
    if (!net.myId || !x) return;
    var p = actMap(mapId, true); if (!p) return;
    if (kind === 'final') { ACT_GEO.forEach(function(f) { actSet(p, x.id, f, Number(x[f]) || 0, a); }); return; }
    if (kind === 'threats') { actSet(p, x.id, 'threats', Array.isArray(x.threats) ? x.threats.slice() : [], a); return; }
    if (kind !== 'patch' || !Array.isArray(x.whiteboard)) return;
    var set = Object.create(null);
    x.whiteboard.forEach(function(w) {
        if (!w || w.ownerId !== net.myId || typeof w.id !== 'string') return;
        if (w.type === 'path' && w.byPlayer) { set[w.id] = w; return; }
        if (w.hidden || w.locked) return;
        ACT_GEO.forEach(function(f) { actSet(p, w.id, f, Number(w[f]) || 0, a); });
        ['elevation', 'posture'].forEach(function(f) { actSet(p, w.id, f, Object.prototype.hasOwnProperty.call(w, f) ? w[f] : undefined, a); });
    });
    p.st = { set: set, a: a };
}
function actTrim(p, ack, only, fields) {   // forget what a copy (or a put-back: only that token, those fields) goes as far as
    Object.keys(p.t).forEach(function(id) {
        if (only !== undefined && id !== only) return;
        var t = p.t[id];
        Object.keys(t).forEach(function(f) { if ((!fields || fields.indexOf(f) >= 0) && t[f][1] <= ack) delete t[f]; });
        if (!Object.keys(t).length) delete p.t[id];
    });
    if (only === undefined && p.st && p.st.a <= ack) p.st = null;
}
// a copy of a map that goes as far as ack: what it lacks of theirs written back over it — a recorded field onto their token of that id, and
// their drawings made exactly the recorded set (theirs it lacks put back as drawn, theirs it holds that they erased taken away)
function actOver(mapId, map, ack) {
    var p = actMap(mapId, false); if (!p || ack < 0) return;
    actTrim(p, ack);
    if (!map || typeof map !== 'object' || !Array.isArray(map.whiteboard)) return;
    var mine = function(w) { return !!(w && typeof w === 'object' && w.ownerId === net.myId); };
    map.whiteboard.forEach(function(w) {
        if (!mine(w) || typeof w.id !== 'string' || !own(p.t, w.id)) return;
        var t = p.t[w.id];
        Object.keys(t).forEach(function(f) { var v = t[f][0]; if (v === undefined) delete w[f]; else w[f] = Array.isArray(v) ? v.slice() : v; });
    });
    if (!p.st) return;
    var set = p.st.set, held = Object.create(null);
    map.whiteboard = map.whiteboard.filter(function(w) {
        if (!(mine(w) && w.type === 'path' && w.byPlayer)) return true;
        if (!own(set, w.id)) return false;
        held[w.id] = 1; return true;
    }).map(function(w) { return mine(w) && w.type === 'path' && w.byPlayer && own(set, w.id) ? set[w.id] : w; });
    Object.keys(set).forEach(function(id) { if (!held[id]) map.whiteboard.push(set[id]); });
}
// a pos from the host for their own token: with a number (a put-back answering an action of theirs) that token's place and facing it goes as
// far as are forgotten, and it waits (true) while a newer action of theirs on it is still on its way; with none (the GM moving it, their other
// window, an older host) it is the host's last word and the recorded place goes
function actPos(mapId, tokId, ack) {
    var p = actMap(mapId, false); if (!p || typeof tokId !== 'string' || !own(p.t, tokId)) return false;
    if (ack < 0) { ACT_GEO.forEach(function(f) { delete p.t[tokId][f]; }); if (!Object.keys(p.t[tokId]).length) delete p.t[tokId]; return false; }
    actTrim(p, ack, tokId, ACT_GEO);
    return own(p.t, tokId) && ACT_GEO.some(function(f) { return own(p.t[tokId], f); });
}
// [netcheck:actlog-end]
function applyItem(msg) {
    var camp = campOf(msg.campId);
    if (!camp || !validKey(msg.itemId)) return;
    var incoming = msg.item;
    if (incoming && incoming.type === 'doc') { incoming = window.wpDocRender ? window.wpDocRender.cleanDoc(incoming, { keepHidden: true }) : null; if (!incoming) return; }   // a page is normalised before it is stored (a hostile host can send shapes, not just markup)
    if (!incoming || typeof incoming !== 'object') return;
    if (incoming.type === 'map') incoming = cleanHostMap(incoming);   // text items rebuilt, colors checked, bounded
    if (incoming.type === 'map' && typeof actOver === 'function') actOver(msg.itemId, incoming, ackIn(msg.ack));   // 14c: what this copy lacks of their own actions, written back
    net.applyingRemote = true;
    camp.items[msg.itemId] = incoming;
    var myActive = getActiveCampaign();
    if (myActive && myActive.id === msg.campId && myActive.activeItemId === msg.itemId && incoming.type === 'map') render();
    updateSidebarNav();
    if (incoming.type === 'doc') { try { if (window.wpDocReaderRefresh) window.wpDocReaderRefresh(msg.campId, msg.itemId); } catch (e) {} try { if (window.wpSheets && window.wpSheets.sheetRefsChanged && window.wpSheets.sheetRefsChanged()) window.wpSheets.renderSheet(); } catch (e) {} }   // never let the reader wedge applyingRemote; a sheet's handbook chips/links follow their page (Stage 5f) — only when what they show changes
    if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }   // a received map may change sight-blockers (doors/walls) — recompute occlusion
    net.applyingRemote = false;
}

// Host-side validation: from a player's patch, apply ONLY position/rotation of
// whiteboard items owned by that player. Everything else is ignored.
// [netcheck:patch-start]
function applyClientItemFiltered(msg, profile, out) {   // fold M10: out.strokes, set when a drawing of theirs was added, redrawn or erased
    if (!profile) return false;
    var camp = campOf(msg.campId);   // own keys only: a campId or itemId such as "constructor" names nothing (it used to reach a prototype's function and throw)
    if (!camp || !validKey(msg.itemId) || !own(camp.items, msg.itemId)) return false;
    var liveItem = camp.items[msg.itemId];
    if (!liveItem || liveItem.type !== 'map' || !msg.item || !Array.isArray(msg.item.whiteboard)) return false;
    var changed = false;
    var liveById = Object.create(null);
    (liveItem.whiteboard || []).forEach(function(w) { liveById[w.id] = w; });
    var sentIds = {};
    var pend = out && out.conn && typeof hidPendOf === 'function' ? hidPendOf(out.conn.peer, msg.itemId) : null;   // hidden pieces: their drawings the GM hid, which a copy of theirs may lack by the GM's hand
    var ownStrokes = (liveItem.whiteboard || []).filter(function(w) { return w && w.type === 'path' && w.byPlayer && w.ownerId === profile.id; }).length;   // this player's drawings already on the map: the cap is per map, not per patch
    var fkP = [];   // fold M7: each own token's where-it-sees-from before this copy lands (at the drag's start while one is open)
    msg.item.whiteboard.forEach(function(w) {
        if (!w || typeof w.id !== 'string') return;
        sentIds[w.id] = true;
        var lw = liveById[w.id];
        if (!lw) {
            // New item: only a drawing signed with this player's id, in a sane shape
            var stroke = playerStroke(w, profile.id);
            if (stroke && ownStrokes++ < 600) { liveItem.whiteboard.push(stroke); changed = true; if (out) out.strokes = true; }
            return;
        }
        if (lw.ownerId !== profile.id) return;   // ownership is judged on the HOST's copy
        if (lw.hidden) { if (out && lw.type === 'path' && lw.byPlayer) out.whole = true; return; }   // a piece the GM hid is not on its player's copy at all: nothing a patch says of it overwrites the host's; a copy naming a drawing of theirs hidden here was made before the hide reached them, and their app writes such a drawing back over every copy of that age — the whole map puts it right (the item branch)
        if (lw.locked) return;   // the GM locked it: frozen for its player — no move, turn, facing, stance or redrawn stroke (their app stops them too)
        if (lw.type === 'path' && lw.byPlayer) {
            var re = playerStroke(w, profile.id);
            if (re && JSON.stringify(re.pts) !== JSON.stringify(lw.pts) || (re && (re.x !== lw.x || re.y !== lw.y))) { Object.assign(lw, re); changed = true; if (out) out.strokes = true; }
            return;
        }
        var wx = Number(w.x), wy = Number(w.y), wr = Number(w.rot || 0), wf = Number(w.front || 0);   // geometry from a peer: finite and on the board, or nothing
        if (!isFinite(wx) || !isFinite(wy) || !isFinite(wr) || !isFinite(wf)) return;
        w.x = Math.max(-30000, Math.min(60000, wx)); w.y = Math.max(-30000, Math.min(60000, wy)); w.rot = Math.max(-1e6, Math.min(1e6, wr)); w.front = Math.max(-1e6, Math.min(1e6, wf));   // bounded: a finite 1e300 is an "integer" the packer refuses
        if ((lw.isChar || lw.waiting) && typeof fogKey === 'function') fkP.push([lw, fogKey(liveItem, lw, typeof openDrag === 'function' ? openDrag(msg.itemId, lw) : null)]);
        if ((lw.isChar || lw.waiting) && typeof moveRefused === 'function') {   // turn-based combat T3: a map copy closes any drag of this token — a move a Refuse rule stops never lands this way (the token goes back where the drag began, for everyone), and one that lands counts against the turn
            var dkP = msg.itemId + '|' + lw.id, frP = (typeof openDrag === 'function' ? openDrag(msg.itemId, lw) : _dragFrom[dkP]) || { x: Number(lw.x) || 0, y: Number(lw.y) || 0 }; delete _dragFrom[dkP];   // fold M4: a drag the host moved past is over
            if (frP.x === w.x && frP.y === w.y) delete _refusedAt[dkP];
            else {
                var whyP = moveRefused(camp, liveItem, msg.itemId, lw, frP.x, frP.y, w.x, w.y), ntP = '', seenP = _refusedAt[dkP] === w.x + ',' + w.y; delete _refusedAt[dkP];
                if (whyP) { w.x = frP.x; w.y = frP.y; snapBack(camp, liveItem, lw, { campId: msg.campId, itemId: msg.itemId, wbId: lw.id, a: msg.a }, frP, out && out.conn); ntP = whyP; }   // 14c: the put-back answers this patch, to its sender
                else if (lw.x !== w.x || lw.y !== w.y) ntP = moveCounted(camp, liveItem, msg.itemId, lw, frP.x, frP.y, w.x, w.y);
                if (ntP && !seenP && typeof noteOwner === 'function') noteOwner(profile.id, ntP, lw.charId);   // their note, as the pos path gives it (once: not again for the drop it just refused)
            }
        }
        if (lw.waiting) { if (lw.x !== w.x || lw.y !== w.y) { lw.x = w.x; lw.y = w.y; changed = true; } return; }   // Onboarding F1a: a waiting token only moves — through the same walls rule as a move — never a turn, facing or stance
        if (lw.x !== w.x || lw.y !== w.y || (lw.rot || 0) !== (w.rot || 0) || (lw.front || 0) !== (w.front || 0)) {
            lw.x = w.x; lw.y = w.y; lw.rot = w.rot || 0; lw.front = w.front || 0;
            changed = true;
        }
        // Stance (elevation in yards, posture): the owner may set them on their own token — while the
        // patched campaign has that feature on. Off (or VTT integration off) keeps the host's value: the
        // compare below is a no-op for that field, nothing is deleted, nothing accepted. Never strip outbound.
        var _v = window.wpVtt;
        var evOn = !_v || _v.campaignOn('elevation', camp), poOn = !_v || _v.campaignOn('posture', camp);
        var elevC = evOn ? cleanElevation(w.elevation) : cleanElevation(lw.elevation),
            postC = poOn ? cleanPosture(w.posture, camp.system) : (typeof lw.posture === 'string' ? lw.posture : '');   // off: the host's value as it is
        if ((lw.elevation || 0) !== elevC || (typeof lw.posture === 'string' ? lw.posture : '') !== postC) {
            if (elevC) lw.elevation = elevC; else delete lw.elevation;
            if (postC) lw.posture = postC; else delete lw.posture;
            changed = true;
        }
        // Threat marks (5h Fold 3) never ride a patch: a player's own arrive as a 'threats' message (see there), so a stale copy in a
        // patch sent a moment after the GM marked a threat cannot undo it
    });
    // A player's own drawing missing from their copy was erased by them
    var before = liveItem.whiteboard.length;
    liveItem.whiteboard = liveItem.whiteboard.filter(function(w) {
        if (!(w.type === 'path' && w.byPlayer && w.ownerId === profile.id) || w.locked || w.hidden || sentIds[w.id]) return true;   // a locked one stays, and one the GM hid: it left their copy by the GM's hand, not theirs
        if (pend && pend[w.id] === 1) { delete pend[w.id]; if (out) out.whole = true; return true; }   // ...and one the GM hid and has shown again, this once: this copy may be older than the showing (their app may have dropped the shown drawing meanwhile: the whole map puts it right, and a later copy without it is an erase)
        return false;
    });
    if (typeof hidNamed === 'function' && out && out.conn) hidNamed(out.conn.peer, msg.itemId, sentIds);   // the drawings this copy names are on their copy: a later copy without one is an erase
    if (liveItem.whiteboard.length !== before) { changed = true; if (out) out.strokes = true; }
    var mvP = fkP.filter(function(p) { return fogKey(liveItem, p[0]) !== p[1]; });   // fold M7: a cell, a facing or a stance that landed (a put-back arms nothing)
    if (mvP.length && typeof marksOwnMoved === 'function') marksOwnMoved(msg.itemId, mvP.map(function(p) { return p[0]; }), profile.id);   // senses S4b: their own drop on its turn
    if (typeof fogArm === 'function' && mvP.length) fogArm(msg.itemId);
    return changed;
}
// [netcheck:patch-end]

// A drawing a player may hand the host: a freehand path signed with their id, whitelisted fields only.
function playerStroke(w, pid) {
    if (!w || w.type !== 'path' || w.ownerId !== pid || !Array.isArray(w.pts)) return null;
    if (w.pts.length < 2 || w.pts.length > 4000) return null;
    var num = function(v, d) { return (typeof v === 'number' && isFinite(v)) ? Math.max(-1e6, Math.min(1e6, v)) : d; };   // bounded: the packer refuses a whole number past 64 bits
    var pts = [];
    for (var i = 0; i < w.pts.length; i++) { var p = w.pts[i]; if (!Array.isArray(p) || p.length < 2) return null; pts.push([num(p[0], 0), num(p[1], 0)]); }
    var color = (typeof w.color === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|var\(--[a-z0-9-]+\)|[a-z]{3,20})$/i.test(w.color)) ? w.color : '#e9e9f0';
    var out = { id: w.id, type: 'path', x: num(w.x, 0), y: num(w.y, 0), w: Math.max(1, num(w.w, 10)), h: Math.max(1, num(w.h, 10)),
                baseW: Math.max(1, num(w.baseW, num(w.w, 10))), baseH: Math.max(1, num(w.baseH, num(w.h, 10))), z: 35, pts: pts,
                color: color, strokeWidth: Math.min(40, Math.max(1, num(w.strokeWidth, 3))), ownerId: pid, byPlayer: true };
    if (typeof w.opacity === 'number' && w.opacity >= 0 && w.opacity <= 1) out.opacity = w.opacity;
    return out;
}

function applySnapshot(msg) {
    if (!msg || !msg.appState || typeof msg.appState !== 'object' || !msg.appState.campaigns || typeof msg.appState.campaigns !== 'object') return;   // a host that sends no state gets nothing applied — and nothing left half-set
    // BinaryPack decodes a map by ASSIGNING its keys, so a packed "__proto__" re-parents the decoded object: the state and the campaign map get
    // a plain prototype back first, or a campaign (or a field deleted below) could still be inherited from the host's choice
    [msg.appState, msg.appState.campaigns].forEach(function(o) { if (Object.getPrototypeOf(o) !== Object.prototype) Object.setPrototypeOf(o, Object.prototype); });
    ['__proto__', 'constructor', 'prototype'].forEach(function(k) { if (Object.prototype.hasOwnProperty.call(msg.appState.campaigns, k)) delete msg.appState.campaigns[k]; });
    net.applyingRemote = true;
    // Origin marker: this state came from someone else's table. Lives in the appState so it rides
    // through every copy; a marked state is never written to disk and never installed by undo.
    var mark = { at: Date.now(), gm: msg.gmId || null };
    msg.appState._foreign = mark;
    Object.values(msg.appState.campaigns || {}).forEach(function (c) { c._foreign = mark; });
    state.appState = msg.appState;
    net.foreign = true;   // cleared only when load() brings this machine's own campaign back
    // handbook pages are normalised before anything renders them, and the active item is a map (never a page: guard 1 client-side)
    Object.values(state.appState.campaigns || {}).forEach(function(cS) {
        if (!cS || typeof cS !== 'object') return;
        if (Object.getPrototypeOf(cS) !== Object.prototype) Object.setPrototypeOf(cS, Object.prototype);   // (see above) or the delete below is a no-op for an inherited players map
        delete cS.players;   // names and table keys are the host's (sanitizeAppState strips them); the Players panel and the owner pickers must never draw a hostile snapshot's
        Object.keys(cS.items || {}).forEach(function(id) {
            var itS = cS.items[id];
            if (id in Object.prototype) { delete cS.items[id]; return; }
            if (itS && itS.type === 'doc') { var cd = window.wpDocRender ? window.wpDocRender.cleanDoc(itS, { keepHidden: true }) : null; if (cd) cS.items[id] = cd; else delete cS.items[id]; }
            else if (itS && itS.type === 'map') cleanHostMap(itS);
        });
        var actS = cS.items && cS.items[cS.activeItemId];
        if (!actS || actS.type !== 'map') cS.activeItemId = Object.keys(cS.items || {}).find(function(id) { return cS.items[id].type === 'map'; }) || null;
    });
    try { if (window.wpDocForeign) window.wpDocForeign(true); } catch (e) {}   // the reader's mermaid runs strict from here
    net.snapshotGen++;
    if (window.wpResetHistory) window.wpResetHistory();   // the pre-join state must never be re-installed while foreign
    net.applyingRemote = false;
    setPausedLocal(!!msg.paused);   // late joiners inherit a paused table
    setSelfPausedLocal(!!msg.pausedSelf);   // ...and a personal pause the GM set before they (re)joined
    setTravelLockLocal(!!msg.travelLocked);
    net.tableSnapOn = msg.snap === true;   // the snap rule: the GM's Snap decides where this player's drops land
    net.stance = cleanStance(msg.stance);
    net.sounds = null; net.soundNow = null; if (window.wpSound) window.wpSound.onSnapshot();   // the snapshot is the authority: the 'sounds' message that follows re-arms the table's sound
    net.music = null; if (window.wpMusic && window.wpMusic.onSnapshot) window.wpMusic.onSnapshot();   // likewise the music library re-arms from the 'music' message that follows
    if (window.wpFx) window.wpFx.onSnapshot();   // visual effects: a fresh snapshot clears any stale effect
    if (window.wpSystemCore) Object.values(state.appState.campaigns || {}).forEach(function(cs) {   // characters (1.5.0): what arrived is re-cleaned against the system that came with it
        if (!cs || typeof cs !== 'object') return;
        if (cs.system !== undefined) {   // the system itself is re-cleaned as the players' view here, as the 'system' message is: a host's word is never rendered raw
            var snapSys = (cs.system && window.wpFormula) ? window.wpSystemCore.cleanSystem(cs.system, { F: window.wpFormula, gmView: false, libCats: {} }) : null;   // libCats: the host's view, nothing GM-only in hand to hide
            if (snapSys) cs.system = snapSys; else delete cs.system;
        }
        if (!cs.chars || typeof cs.chars !== 'object') return;
        if (!cs.system) { delete cs.chars; return; }
        var cleanCh = {}; Object.keys(cs.chars).forEach(function(id) { var cc = window.wpSystemCore.cleanChar(cs.chars[id], cs.system, { state: 'owner' }); if (cc && cc.id === id) { cc.partial = cs.chars[id].partial === true; cleanCh[id] = cc; } }); cs.chars = cleanCh;
    });
    charSessionReset();
    Object.values(state.appState.campaigns || {}).forEach(function(cs) { if (cs && cs.chars && typeof cs.chars === 'object') Object.keys(cs.chars).forEach(function(id) { noteHostCopy(id, cs.chars[id].values); }); });   // Stage 6: the host's copy of every character, whole, from the start (a refusal goes back to it)
    net.stanceCamps = cleanStanceCamps(msg.stanceCamps);   // null from an older host: msg.stance governs every campaign
    net.targets = cleanTargets(msg.targets);
    net.combats = cleanCombats(msg.combats);
    if (window.wpRenderCombatStrip) setTimeout(function() { window.wpRenderCombatStrip(); }, 0);
    if (msg.notepad && typeof msg.notepad === 'object') applyNotepad(msg.notepad);
    if (window.wpFog) window.wpFog.invalidateVision();   // a fresh snapshot may carry a changed camp.fog (sight/vision/empty-map default); bust the mask + vision caches so the client recomputes, not reuses a stale mask
    net._snapshotting = true;   // the stage inside a snapshot is the join itself, not a table change
    try {
        if (msg.stage) {
            applyStage(msg.stage);
        } else {
            net.applyingRemote = true;
            state.viewMode = 'visual';
            state.selId = null; state.selWbId = null; state.selWbIds = [];
            updateCampaignSelect();
            updateSidebarNav();
            render();
            net.applyingRemote = false;
        }
    } finally {
        net._snapshotting = false;   // a stage that throws must not leave every later stage looking like part of the join
    }
    if (window.wpSettingsSync) window.wpSettingsSync();
    try { if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(null); } catch (e) {}   // Onboarding F0: a sheet whose character was reassigned while we were away closes now
    if (net.fromWelcome) { net.fromWelcome = false; if (window.wpHideWelcome) window.wpHideWelcome(); }   // a join started from the welcome screen: its campaign is here, so leave the welcome for the table
}

// [netcheck:broadcast-start]
function broadcast(msg, exceptConn) {   // on the host: admitted peers only — a connection still waiting for the GM's Allow (or one that only heartbeats) hears nothing of the table
    net.conns.forEach(function(c) {
        if (c === exceptConn || !c.open) return;
        if (net.role === 'host' && !own(net.roster, c.peer)) return;
        try { c.send(msg); } catch (e) { try { console.warn('wire send failed', msg && msg.type, e); } catch (_) {} }   // never silent: a payload the packer refused (a prototype-free roster) hid the table from every player for a release
    });
}
// [netcheck:broadcast-end]
// A per-peer send the packer (or the channel) refused: logged, never swallowed — a silent catch hid the roster from every player for a release
function sendFailed(e, what) { try { console.warn('wire send failed' + (what ? ' (' + what + ')' : ''), e); } catch (_) {} }

// Skip re-sending an item that hasn't actually changed — camera saves fire
// constantly and used to rebroadcast the whole map every time.
var _lastPatchHash = {};
function quickHash(s) {
    var h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h + ':' + s.length;
}

// Called from io.js on every local save while a session is active.
/* ---------- per-change sync (host → players) ----------
   Instead of the whole map item on every save, the host sends only what changed since the last
   thing it sent for that item: play-map items and rooms added / changed / removed (matched by id,
   compared by a quick hash), and links / meta / categories only when they differ. The snapshot at
   join is always the full state, so a delta is at worst a superset of what a player is missing; a
   player who somehow lacks the item asks for the full copy (needItem). Whole-item sends remain the
   fallback whenever a delta would not be smaller. Players → host keeps the whole-item message: the
   host filters it field by field anyway. */
var _lastSent = {};   // itemId → the sanitized item as last broadcast by this host
function uniqueIds(list) { var seen = {}; return Array.isArray(list) && list.every(function(x) { if (!x || typeof x.id !== 'string' || !x.id || seen[x.id]) return false; seen[x.id] = 1; return true; }); }
function itemDelta(itemId, clean) {
    var base = _lastSent[itemId];
    if (!base || clean.type !== base.type || (clean.type !== 'map' && clean.type !== 'doc')) return null;      // no baseline: send whole
    if (clean.type === 'doc' && !(uniqueIds(clean.blocks) && uniqueIds(base.blocks))) return null;             // block deltas key on ids
    var d = { type: 'itemDelta', itemId: itemId }, any = false;
    function coll(key) {
        var was = {}, now = {}, set = [], del = [], added = false;
        (base[key] || []).forEach(function(x) { was[x.id] = quickHash(JSON.stringify(x)); });
        (clean[key] || []).forEach(function(x) { var h = quickHash(JSON.stringify(x)); now[x.id] = 1; if (was[x.id] !== h) { set.push(x); if (was[x.id] === undefined) added = true; } });
        Object.keys(was).forEach(function(id) { if (!now[id]) del.push(id); });
        var seq = (clean[key] || []).map(function(x) { return x.id; });
        var reordered = seq.join('\n') !== (base[key] || []).map(function(x) { return x.id; }).join('\n');   // a pure re-order (an undo, a z-order move) travels too
        if (set.length || del.length || reordered) {
            d[key] = { set: set, del: del };
            if (added || del.length || reordered) d[key].order = seq;   // list order matters for stacking
            any = true;
        }
    }
    if (clean.type === 'doc') coll('blocks'); else { coll('whiteboard'); coll('rooms'); }
    ['links', 'meta', 'cats'].forEach(function(k) { if (JSON.stringify(clean[k]) !== JSON.stringify(base[k])) { d[k] = clean[k]; any = true; } });
    var known = { type: 1, id: 1, whiteboard: 1, rooms: 1, links: 1, meta: 1, cats: 1, blocks: 1 };
    var other = Object.keys(clean).concat(Object.keys(base)).some(function(k) { return !known[k] && JSON.stringify(clean[k]) !== JSON.stringify(base[k]); });
    if (other) return null;                                                     // an unusual key changed: send whole
    return any ? d : false;                                                     // false = nothing changed at all
}
function applyItemDelta(msg) {
    var camp = campOf(msg.campId); if (!camp || !validKey(msg.itemId)) return;
    var it = own(camp.items, msg.itemId) ? camp.items[msg.itemId] : null;
    if (!it) { broadcast({ type: 'needItem', campId: msg.campId, itemId: msg.itemId }, null); return; }   // never had it: ask for the whole thing
    net.applyingRemote = true;
    (it.type === 'doc' ? ['blocks'] : ['whiteboard', 'rooms']).forEach(function(key) {   // a page has blocks, a map has the rest — a delta never adds the other kind
        var ch = msg[key]; if (!ch || typeof ch !== 'object') return;
        if (!Array.isArray(ch.del)) ch.del = []; if (!Array.isArray(ch.set)) ch.set = []; if (ch.order !== undefined && !Array.isArray(ch.order)) delete ch.order;
        ch.set = ch.set.filter(function(x) { return x && typeof x === 'object' && typeof x.id === 'string'; });
        var list = it[key] = it[key] || [];
        var at = {}; list.forEach(function(x, i) { at[x.id] = i; });
        (ch.del || []).forEach(function(id) { if (at[id] !== undefined) list[at[id]] = null; });
        (ch.set || []).forEach(function(x) { if (at[x.id] !== undefined && list[at[x.id]]) list[at[x.id]] = x; else list.push(x); });
        it[key] = list.filter(Boolean);
        if (ch.order) { var pos = {}; ch.order.forEach(function(id, i) { pos[id] = i; }); it[key].sort(function(a, b) { return (pos[a.id] === undefined ? 1e9 : pos[a.id]) - (pos[b.id] === undefined ? 1e9 : pos[b.id]); }); }
    });
    ['links', 'meta', 'cats'].forEach(function(k) { if (msg[k] !== undefined) it[k] = msg[k]; });
    if (it.type === 'map') cleanHostMap(it);   // whatever the delta touched: text items rebuilt, colors checked, bounded
    if (it.type === 'map' && typeof actOver === 'function') actOver(msg.itemId, it, ackIn(msg.ack));   // 14c: what this change lacks of their own actions, written back
    if (it.type === 'doc') {   // re-normalised after every delta, then the reader (if it shows this page) follows
        var cd = window.wpDocRender ? window.wpDocRender.cleanDoc(it, { keepHidden: true }) : null;
        if (cd) camp.items[msg.itemId] = cd; else delete camp.items[msg.itemId];
        try { if (window.wpDocReaderRefresh) window.wpDocReaderRefresh(msg.campId, msg.itemId); } catch (e) {}
        try { if (window.wpSheets && window.wpSheets.sheetRefsChanged && window.wpSheets.sheetRefsChanged()) window.wpSheets.renderSheet(); } catch (e) {}   // a renamed page's chips/links follow (Stage 5f)
    }
    var myActive = getActiveCampaign();
    if (myActive && myActive.id === msg.campId && myActive.activeItemId === msg.itemId && it.type === 'map') render();
    updateSidebarNav();
    if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }   // a delta may change sight-blockers (doors/walls) — recompute occlusion
    net.applyingRemote = false;
}
// [netcheck:fogdiffapply-start]
// Fold M: a player's copy of one fogged map caught up in place by the host ('fogDiff'): the creatures they now see added, each cleaned as a
// whole map's items are, the ones they no longer see dropped, the lit cells a light they cannot see gives them replaced. The shape is checked
// whole before anything changes; anything refused (their own token named, an item the cleaner turns away, the 6000 a map holds) asks for the
// whole map once the rest is in. The map object, its other parts and their own tokens are never replaced, and nothing is saved, so no patch
// goes back
var FOG_DIFF_ADD_MAX = 200, FOG_DIFF_DROP_MAX = 6000, FOG_DIFF_ID_MAX = 256;
function fogDiffId(v) { return typeof v === 'string' && v.length > 0 && v.length <= FOG_DIFF_ID_MAX; }
function fogDiffShape(msg) {
    var add = msg.add, drop = msg.drop;
    if (add !== undefined && !(Array.isArray(add) && add.length <= FOG_DIFF_ADD_MAX && add.every(function(a) {
        return !!a && typeof a === 'object' && !Array.isArray(a) && !!a.item && typeof a.item === 'object' && !Array.isArray(a.item) && fogDiffId(a.item.id) && (a.after === null || fogDiffId(a.after));
    }))) return false;
    if (drop !== undefined && !(Array.isArray(drop) && drop.length <= FOG_DIFF_DROP_MAX && drop.every(fogDiffId))) return false;
    return (msg.lit === undefined || Array.isArray(msg.lit)) && (msg.capped === undefined || typeof msg.capped === 'boolean') && (msg.marks === undefined || Array.isArray(msg.marks)) && (msg.off === undefined || (!!msg.off && typeof msg.off === 'object' && !Array.isArray(msg.off)));
}
function applyFogDiff(msg) {
    var camp = campOf(msg.campId); if (!camp || !validKey(msg.itemId)) return;
    var map = own(camp.items, msg.itemId) ? camp.items[msg.itemId] : null, ask = function() { broadcast({ type: 'needItem', campId: msg.campId, itemId: msg.itemId }, null); };
    if (!map) { ask(); return; }   // never had it: the whole thing
    if (typeof map !== 'object' || map.type !== 'map') return;
    if (!fogDiffShape(msg) || !Array.isArray(map.whiteboard)) { ask(); return; }
    var wb = map.whiteboard, refused = false;
    var mine = function(w) { return !!(w && net.myId && w.ownerId === net.myId); };
    var idAt = function(id) { for (var i = 0; i < wb.length; i++) if (wb[i] && wb[i].id === id) return i; return -1; };
    net.applyingRemote = true;
    try {
        if (msg.drop && msg.drop.length) {   // backwards, on the same array
            var gone = Object.create(null); msg.drop.forEach(function(id) { gone[id] = 1; });
            for (var i = wb.length - 1; i >= 0; i--) { var d = wb[i]; if (!d || gone[d.id] !== 1) continue; if (mine(d)) refused = true; else wb.splice(i, 1); }
        }
        (msg.add || []).forEach(function(a) {
            var x = cleanHostWbItem(a.item);
            if (!x || mine(x)) { refused = true; return; }
            var at = idAt(x.id);
            if (at >= 0) { if (mine(wb[at])) refused = true; else wb[at] = x; return; }   // held already: replaced where it stands
            if (wb.length >= FOG_DIFF_DROP_MAX) { refused = true; return; }   // the 6000 a map holds (cleanHostMap)
            var k = a.after === null ? -1 : idAt(a.after);
            if (a.after === null) wb.splice(0, 0, x); else if (k >= 0) wb.splice(k + 1, 0, x); else wb.push(x);
        });
        if (msg.lit !== undefined) { var FCd = window.wpFogCore, flD = FCd && FCd.cleanFogLit ? FCd.cleanFogLit(msg.lit) : null; if (flD) map.fogLit = flD; else delete map.fogLit; }
        if (msg.capped !== undefined) { if (msg.capped === true) map.lightsCapped = true; else delete map.lightsCapped; }
        if (msg.marks !== undefined) { var FCm = window.wpFogCore, mkD = FCm && FCm.cleanFogMarks ? FCm.cleanFogMarks(msg.marks, ownCellKeysOf(map)) : null; if (mkD) map.fogMarks = mkD; else delete map.fogMarks; }   // senses S4: their marks, cleaned again
        if (msg.off !== undefined) { var FCo = window.wpFogCore, ofD = FCo && FCo.cleanFogOff ? FCo.cleanFogOff(msg.off, ownTokIdsOf(map)) : null; if (ofD) map.fogOff = ofD; else delete map.fogOff; }   // senses S7a: their own tokens only, cleaned again
        if (refused) ask();
        var myActive = getActiveCampaign();
        if (myActive && myActive.id === msg.campId && myActive.activeItemId === msg.itemId) render();
        if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }
    } finally { net.applyingRemote = false; }
}
// [netcheck:fogdiffapply-end]
// Host: send one map item to the table — as a delta when one exists and is smaller, else whole.
function mapFogged(it) { return !!(it && it.type === 'map' && it.fog && it.fog.on === true && window.wpVtt && window.wpVtt.on('fog')); }   // true alone, as fog.js reads it: a map stored with on 'yes' is unfogged for both, never per-player once and shared after
net.sendItem = function(campId, itemId, onlyConn, exceptConn, at) {   // fold M10: exceptConn, a connection a fogged map is not sent to (its own copy catches up in place); at: the action of onlyConn's that this whole copy answers (14c)
    var camp = state.appState.campaigns[campId], it = camp && camp.items[itemId]; if (!it) return;
    var ak = typeof withAck === 'function' ? withAck : function(m) { return m; };   // 14c: how far each connection's copy goes (a harness without it sends as before)
    if (typeof hidNote === 'function') hidNote(it);   // hidden pieces: a player's drawing the GM hid, noted for each of their connections before the copy without it goes
    // fog of war (1.5.0 FV2): a fogged map is sent per recipient — the heavy map is cloned once (sanitizeItem), then a
    // cheap shallow copy drops each player's unseen creatures. No shared delta while fog is on (baselines differ per peer).
    if (mapFogged(it)) {
        delete _lastSent[itemId];                                                     // leaving the shared-delta path: the next non-fog send is whole
        var fogSend = function() {   // fold M4: cloned and judged with every open drag on this map at its start
            var sendOne = function(conn) {
                var pr = net.roster[conn.peer]; if (!pr || !conn.open || (exceptConn && conn === exceptConn)) return;
                var out = fogCopyFor(clean, camp, it, pr.id);
                if (typeof fogOwnLive === 'function') out = fogOwnLive(out, itemId, pr.id);
                try { conn.send(ak({ type: 'item', campId: campId, itemId: itemId, item: out }, conn, at)); } catch (e) { sendFailed(e); return; }   // 14c: how far that copy goes
                if (typeof fogSeed === 'function' && fogSeed(conn, itemId, out)) fogRoster(conn, pr.id, itemId);   // fold M5: what that copy now holds; fold R: the order and the pointers where it changed them
            };
            var clean = sanitizeItem(it); if (!clean) return;
            if (onlyConn) sendOne(onlyConn); else net.conns.forEach(sendOne);
        };
        if (typeof fogLanded === 'function') fogLanded(itemId, fogSend); else fogSend();
        return;
    }
    var clean = sanitizeItem(it); if (!clean) return;
    if (typeof fogForgetMap === 'function') fogForgetMap(itemId);   // fold M5: an unfogged map is one copy for all: no record of it
    var full = { type: 'item', campId: campId, itemId: itemId, item: clean };
    if (onlyConn) { try { onlyConn.send(ak(full, onlyConn, at)); } catch (e) { sendFailed(e); } return; }              // one player asked for the whole thing (or is put right after a stale patch: at)
    var d = itemDelta(itemId, clean);
    if (d === false) return;                                                          // unchanged since the last send
    var msg = full;
    if (d) { d.campId = campId; if (JSON.stringify(d).length < JSON.stringify(full).length * 0.9) msg = d; }
    if (typeof ackSend === 'function') ackSend(msg); else broadcast(msg, null);   // 14c: each connection's own copy says how far it goes
    _lastSent[itemId] = JSON.parse(JSON.stringify(clean));
};
// Host: broadcast one whole map/item to the table, fog-filtered per recipient when it is a fogged map. Used by the many
// one-off sends (travel, summon, bring, push) that always send whole; a fogged map never leaks a creature through them.
net.broadcastItemFiltered = function(campId, itemId) {
    var camp = state.appState.campaigns[campId], it = camp && camp.items[itemId]; if (!it) return;
    if (typeof window !== 'undefined' && window.wpFog && window.wpFog.invalidateSeen) window.wpFog.invalidateSeen(itemId);   // Senses S0: a map sent this way was changed as a remote change (a traveller arrived or left, a waiting token placed, a light switched): who sees what on it is judged afresh
    if (typeof hidNote === 'function') hidNote(it);   // hidden pieces: as sendItem
    if (!mapFogged(it)) { var clean = sanitizeItem(it); if (!clean) return; if (typeof fogForgetMap === 'function') fogForgetMap(itemId); var bm = { type: 'item', campId: campId, itemId: itemId, item: clean }; if (typeof ackSend === 'function') ackSend(bm); else broadcast(bm, null); _lastSent[itemId] = JSON.parse(JSON.stringify(clean)); return; }   // the table now holds this: the next delta is worked out from it (a light switched off here and on again by the GM was the same as the older baseline, and never went out)
    delete _lastSent[itemId];   // a fogged map has no shared baseline (as sendItem)
    var fogSend = function() {   // fold M4: cloned and judged with every open drag on this map at its start
        var clean = sanitizeItem(it); if (!clean) return;
        net.conns.forEach(function(conn) {
            var pr = net.roster[conn.peer]; if (!pr || !conn.open) return;
            var out = fogCopyFor(clean, camp, it, pr.id);
            if (typeof fogOwnLive === 'function') out = fogOwnLive(out, itemId, pr.id);
            try { conn.send(typeof withAck === 'function' ? withAck({ type: 'item', campId: campId, itemId: itemId, item: out }, conn) : { type: 'item', campId: campId, itemId: itemId, item: out }); } catch (e) { sendFailed(e); return; }   // 14c: how far that copy goes
            if (typeof fogSeed === 'function' && fogSeed(conn, itemId, out)) fogRoster(conn, pr.id, itemId);   // fold M5: what that copy now holds; fold R: the order and the pointers where it changed them
        });
    };
    if (typeof fogLanded === 'function') fogLanded(itemId, fogSend); else fogSend();
};
// Host: an item leaves every admitted player's copy — a deleted map or planner, a page turned GM-only.
// The send baseline goes too, so the next send after off→on is whole. Never through broadcast(): admitted only.
net.itemGone = function(campId, itemId) {
    delete _lastSent[itemId];
    if (typeof sensesForgetMap === 'function') sensesForgetMap(itemId);   // Senses S0: and what anyone's copy of it was made by
    if (typeof fogForgetMap === 'function') fogForgetMap(itemId);   // fold M5: and what anyone's copy of it holds
    if (typeof hidForgetMap === 'function') hidForgetMap(itemId);   // hidden pieces: and the drawings on it the GM hid
    if (!(net.active && net.role === 'host')) return;
    var msg = { type: 'itemGone', campId: campId, itemId: itemId };
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
};
net._itemDelta = itemDelta; net._applyItemDelta = applyItemDelta; net._handleMessage = handleMessage;   // sandbox testing hooks

net.onLocalSave = function() {
    if (!net.active || net.applyingRemote) return;
    if (window.wpFog) window.wpFog.invalidateVision();   // fog: a save may have moved tokens or changed fog — recompute vision on the next send
    var patch = activeItemPatch();
    if (net.role === 'host') {
        net.syncStance();   // before the item: a changed ceiling reaches players ahead of the map it applies to
        net.syncSounds();   // the sound index changed with this save? the list follows the same way
        net.syncMusic();    // and the music library, the same way
        net.syncSystem();   // and the system (character sheets), the same way
        net.syncSenses();   // and its senses: a change re-sends every fogged map after it (senses S2a)
        net.syncDocStyle(); // and the campaign's document look (doc theming), the same way
        net.syncCampName(); // and its name (a rename reaches the players' top bar), the same way
        net.syncTurnRules(); // and who may press an effect's timer (turn-based combat T5b), the same way
        net.syncLibrary();   // and the library players may look through (Stage 6 library L3), the same way
        net.syncNewPlayers(); // and the rules for players without a character (Onboarding F1a), the same way
        net.syncCampFog();  // and its fog defaults (an empty map's fog, the default sight), the same way
        net.syncClock();    // and its clock (item 20 K2), the same way
        if (patch) net.sendItem(patch.campId, patch.itemId);
        if (net.syncCombatHidden) net.syncCombatHidden();   // fold M0: after the map (the token gone from it first): a token hidden or shown mid-fight changes its row
        patch = null;
    }
    if (patch) {
        var hs = quickHash(JSON.stringify(patch.item));
        if (_lastPatchHash[patch.itemId] === hs) patch = null;
        else _lastPatchHash[patch.itemId] = hs;
    }
    if (patch && net.role === 'client' && typeof actNext === 'function' && patch.item && patch.item.type === 'map') { patch.a = actNext(); actNote('patch', patch.itemId, patch.item, patch.a); }   // 14c: numbered, and what it set kept until a copy goes that far
    if (patch) broadcast(patch, null);
    if (net.role === 'host') { scheduleStageFollow(); var amH = getActiveMap(); if (amH && amH.type === 'map') checkRoomHandouts(amH); }
};

/* The table follows the GM's map, but only once they have stayed on it for a moment:
   a quick detour to another map (to fetch a stray token, check a note) no longer drags
   the whole party along and back. Pinning a map in the Host panel bypasses this entirely. */
var STAGE_GRACE_MS = 3000;
var _stageTimer = null, _stageHintShown = false;
function scheduleStageFollow() {
    var stage = currentStage();
    var key = stage ? stage.campId + '/' + stage.itemId : '';
    if (!key || key === net.lastStage) return;
    if (_stageTimer) clearTimeout(_stageTimer);
    _stageTimer = setTimeout(function() {
        _stageTimer = null;
        if (!net.active || net.role !== 'host') return;
        var s2 = currentStage();
        var k2 = s2 ? s2.campId + '/' + s2.itemId : '';
        if (!k2 || k2 === net.lastStage) return;
        net.lastStage = k2;
        net.syncStance();   // a campaign switch that has not saved yet: the ceiling travels before the stage
        var moved = followConns(s2);   // only admitted players still following the GM are moved; detached wanderers stay put
        renderRoster();
        broadcastRoster();
        if (moved && !net.stageOverride && !_stageHintShown) {
            _stageHintShown = true;
            toast('The table followed you here (' + moved + ' player' + (moved > 1 ? 's' : '') + '). To browse maps without moving them, pin a map under Players arrive at.');
        }
    }, STAGE_GRACE_MS);
}

/* ---------- table pause ---------- */
// Applies the pause state locally (banner, dimming, button label). Only the
// host's toggle broadcasts; clients receive it via 'pause' messages/snapshot.
// Banner + buttons for BOTH the table pause and a personal (per-player) pause. A client can be
// frozen by either; the table message wins when both are on. The two table-pause buttons
// (#netPauseBtn in the panel, #sessionPauseBtn in the header) stay in step here.
function refreshPauseUi() {
    var isClient = net.role === 'client';
    var frozenMe = (net.paused || net.selfPaused) && isClient;
    var banner = ui('pauseBanner');
    if (banner) {
        banner.style.display = frozenMe ? 'block' : 'none';
        if (frozenMe) banner.textContent = net.paused
            ? '⏸️ The GM paused the table — chat is still open.'
            : '⏸️ The GM paused you — chat is still open.';
    }
    document.body.classList.toggle('net-paused', (net.paused || (net.selfPaused && isClient)) && net.active);
    var btn = ui('netPauseBtn');
    if (btn) { btn.innerHTML = net.paused ? '&#9654;&#65039; Resume the Table' : '&#9208;&#65039; Pause the Table'; btn.classList.toggle('paused', net.paused); }
    var sb = ui('sessionPauseBtn');
    if (sb) { sb.innerHTML = net.paused ? '&#9654;&#65039;' : '&#9208;&#65039;'; sb.title = net.paused ? 'Resume the table' : 'Pause the table (freeze everyone)'; sb.classList.toggle('paused', net.paused); }
}
function setPausedLocal(on) {
    net.paused = !!on;
    refreshPauseUi();
    if (!on && net.reconcileLook) net.reconcileLook();   // Onboarding F1b: a face picked while paused goes now
}
// client: set/clear my personal pause (from a 'pausePlayer' message or the join snapshot)
function setSelfPausedLocal(on) {
    net.selfPaused = !!on;
    refreshPauseUi();
    if (!on && net.reconcileLook) net.reconcileLook();
}
// host: is this player individually paused? (composes with the table pause)
function pausedById(pid) { return !!(pid && net.pausedPlayers && net.pausedPlayers[pid]); }
function peerPaused(peer) { var p = net.roster[peer]; return !!(p && pausedById(p.id)); }
// host: freeze/thaw one player individually. Enforced host-side at every move/travel/edit gate; the
// player is told so they see a banner and stop trying. Composes with the whole-table pause.
net.pausePlayer = function(playerId, on) {
    if (!net.active || net.role !== 'host' || !playerId) return;
    net.pausedPlayers = net.pausedPlayers || {};
    if (on) net.pausedPlayers[playerId] = true; else delete net.pausedPlayers[playerId];
    var key = Object.keys(net.roster).find(function(k) { return net.roster[k] && net.roster[k].id === playerId; });
    var c = key && net.conns.find(function(x) { return x.peer === key; });
    if (c && c.open) { try { c.send({ type: 'pausePlayer', on: !!on }); } catch (e) { sendFailed(e); } }
    var nm = (key && net.roster[key] && net.roster[key].name) || 'Player';
    renderRoster();
    if (window.wpRenderPartyStrip) window.wpRenderPartyStrip();   // mark/unmark the paused player's party-strip chip
    toast(on ? nm + ' is paused.' : nm + ' is live again.');
    logEvent('table', (on ? 'Paused ' : 'Resumed ') + nm);
};
net.isPlayerPaused = function(playerId) { return pausedById(playerId); };

/* ---------- VTT feature ceiling (Settings ▸ VTT features, per campaign) ---------- */
// The hosted campaign's VTT features (elevation, posture, minimap — vtt.js) are the most a
// player sees: sent with the snapshot (stance + stanceCamps) and again as a 'stance' message
// whenever they change. Clients keep them in session memory only — net.stance (the hosted
// campaign's flags, the 1.4.6 shape) and net.stanceCamps (one entry per campaign, so a host
// campaign switch is right even for a player the stage has not moved yet). Both live exactly as
// long as net.foreign does: load() nulls them when the player's own campaign comes back.
net.stance = null;
net.stanceCamps = null;
net.gmId = '';               // the host's profile id, from the snapshot: keys the player's per-table choices
net.syncedPeer = null;       // the connection the snapshot came from: the only peer whose 'stance' counts
net.snapshotGen = 0;         // bumped by every snapshot and every load(): a load that a snapshot overtook must not undo it
net.sounds = null;           // the table's playable sounds (a client, from the host's 'sounds' message): transport memory, null until it arrives
net.soundNow = null;         // the ambient the host reported playing, by id
net.music = null;            // the table's music library (a client, from the host's 'music' message): transport memory, null until it arrives
net.stanceFlags = function() {
    if (window.wpVtt) return window.wpVtt.hostFlags();
    var f = { elevation: true, posture: true }; try { f.elevation = localStorage.getItem('wp_elevation') !== 'off'; f.posture = localStorage.getItem('wp_posture') !== 'off'; } catch (e) {} return f;   // vtt.js absent: the 1.4.6 keys
};
// A key absent from an older host's payload means ON — never coerce a newer feature to off
function cleanStance(s) { return window.wpVtt ? window.wpVtt.cleanFlags(s) : { elevation: !!(s && s.elevation), posture: !!(s && s.posture) }; }
function cleanStanceCamps(m) { return window.wpVtt ? window.wpVtt.cleanStanceCamps(m) : null; }
// Admitted players only: the ceiling names every campaign in the save
net.broadcastStance = function() {
    if (!net.active || net.role !== 'host') return;
    var camp = getActiveCampaign();
    var msg = { type: 'stance', flags: net.stanceFlags(), campId: camp ? camp.id : '', camps: window.wpVtt ? window.wpVtt.hostCamps() : null };
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
};
// The one place the ceiling is re-sent from: every path that changes the hosted campaign or its settings
// reaches save() → onLocalSave, and the stage timer covers a switch that has not saved yet. A signature
// over the hosted campaign id and every campaign's flags keeps it quiet when nothing moved.
net._lastStanceSig = null;
net.syncStance = function() {
    if (!net.active || net.role !== 'host' || !window.wpVtt) return;
    var s = window.wpVtt.hostSig();
    if (s === net._lastStanceSig) return;
    net._lastStanceSig = s;
    net.broadcastStance();
    if (net.resendFogged) net.resendFogged();   // the vision rules may have moved (fog, lighting, facing): every fogged map, re-filtered
    if (window.wpSettingsSync) window.wpSettingsSync();
};
// [netcheck:resendfogged-start]
// A change to the table's vision rules (the fog, lighting or facing switch, the master, the campaign's fog defaults) reaches every player's copy
// of every fogged map of the hosted campaign, not only the map on screen: each is re-sent filtered per player under the new rule (lighting review)
net.resendFogged = function() {
    if (!net.active || net.role !== 'host' || !net.broadcastItemFiltered) return;
    var camp = getActiveCampaign(); if (!camp || !camp.items || typeof camp.items !== 'object') return;
    Object.keys(camp.items).forEach(function(id) { var m = camp.items[id]; if (m && m.type === 'map' && m.fog && m.fog.on === true) net.broadcastItemFiltered(camp.id, id); });
};
// [netcheck:resendfogged-end]
// [netcheck:sensesmoved-start]
// Senses S0: a character's change can move what its tokens see by (a Sight typed on the sheet, an effect put on or run out, a roll's
// consequence, the system's own formulas) with no map saved, and nothing sent a map then: a player kept creatures they should no longer see, or
// lacked ones they now should. Every host path that changes a character calls this. Who sees what is judged afresh at once (the live position
// relay goes by it); then each admitted player's own tokens are compared, in cells, with what their copy of each fogged map was made by, and a
// player whose sight moved is sent that map again: their own copy, after the character itself, at most once in half a second (the state at
// that moment), with the turn order and the target pointers their new sight gives them. charId: the character that changed, or null for any
// (the system, the library, a character deleted). Nothing of a message is read here
// Where the campaign's Sight is one a player cannot work out for themselves (a GM-only field, or one worked out from a GM-only value) nothing
// is sent from here: a map arriving would tell them the hidden number had moved, by how much and when. Their copy follows at the next
// ordinary send of that map, as before this fold (the host's own judgement, the live relay's too, goes by the real sight at once)
var _sensesPend = Object.create(null), SENSES_RESEND_MS = 500;
function sensesPids() { var seen = Object.create(null), out = []; net.conns.forEach(function(c) { var pr = c && c.open ? net.roster[c.peer] : null; if (pr && pr.id && !seen[pr.id]) { seen[pr.id] = 1; out.push(pr.id); } }); return out; }
// (A Sight its player cannot read is the campaign's default on both sides since the owner's answer of 2026-09-29 — fog.js sightSecret — so a
// change of it moves nothing here, and a change of the default reaches every player it moves: nothing to hold back)
function sensesDrop(key) { delete _sensesSig[key]; delete _sensesAt[key]; if (_sensesPend[key]) { clearTimeout(_sensesPend[key]); delete _sensesPend[key]; } }
net.sensesMoved = function(charId) {
    if (!net.active || net.role !== 'host') return;
    var camp = getActiveCampaign(); if (!camp || !camp.items || typeof camp.items !== 'object' || !window.wpFog || !window.wpFog.sightSigFor) return;
    var pids = sensesPids(); if (!pids.length) return;
    Object.keys(camp.items).forEach(function(id) {
        var m = camp.items[id]; if (!m || m.type !== 'map') return;
        if (!mapFogged(m)) { pids.forEach(function(pid) { sensesDrop(pid + '|' + id); }); return; }
        if (charId && !(Array.isArray(m.whiteboard) ? m.whiteboard : []).some(function(w) { return w && w.charId === charId; })) return;
        pids.forEach(function(pid) {
            var key = pid + '|' + id, sig = window.wpFog.sightSigFor(pid, camp, m);
            if (sig === null) { sensesDrop(key); return; }
            if (sig !== _sensesAt[key]) { _sensesAt[key] = sig; if (window.wpFog.invalidateSeen) window.wpFog.invalidateSeen(id); }   // who sees what on that map is judged afresh, at once and only then: the live position relay goes by it
            if (sig === _sensesSig[key] || _sensesPend[key]) return;   // nothing moved, or a send is on its way (it reads the state of its own moment)
            _sensesPend[key] = setTimeout(function() { sensesFire(pid, id); }, SENSES_RESEND_MS);
        });
    });
};
function sensesFire(pid, mapId) {
    var key = pid + '|' + mapId; delete _sensesPend[key];
    if (!net.active || net.role !== 'host' || !window.wpFog || !window.wpFog.sightSigFor) return;
    var camp = getActiveCampaign(), m = camp && camp.items && Object.prototype.hasOwnProperty.call(camp.items, mapId) ? camp.items[mapId] : null;
    if (!m || !mapFogged(m)) { sensesDrop(key); return; }
    var sig = window.wpFog.sightSigFor(pid, camp, m);
    if (sig === null) { sensesDrop(key); return; }
    if (typeof fogCatchUp === 'function') {
        // fold M10: each of their connections is caught up in place against what that copy holds (nothing that did not change is sent, the
        // turn order and the pointers only after a change of what is held); while the GM's own gesture is open on that map, the map's own
        // fire does it once the gesture is over
        if (window.wpHostGesture === mapId) { if (typeof fogArm === 'function') fogArm(mapId); return; }
        var memo = Object.create(null);
        fogLanded(null, function() { net.conns.forEach(function(c) { var pr = c && c.open ? net.roster[c.peer] : null; if (pr && pr.id === pid) fogCatchUp(c, camp, m, pid, memo); }); });
        return;
    }
    if (sig === _sensesSig[key]) return;   // that map went to them since, or the sight is back where it was
    var inFight = !!(net.combats && Object.prototype.hasOwnProperty.call(net.combats, mapId)), aimed = Object.keys(net.targets || {}).some(function(p) { var t = net.targets[p]; return !!t && t.mapId === mapId; });
    var sendAll = function() {   // fold M4: the copy, the order and the pointers all judged with every open drag at its start
        net.conns.forEach(function(c) {
            var pr = c && c.open ? net.roster[c.peer] : null; if (!pr || pr.id !== pid) return;
            net.sendItem(camp.id, mapId, c);   // their own copy (fogCopyFor), which seeds what it was made by
            try {
                if (inFight) c.send({ type: 'combats', combats: combatsFor(pid) });
                if (aimed) c.send({ type: 'targets', targets: targetsFor(pid) });
            } catch (e) { sendFailed(e); }
        });
    };
    if (typeof fogLanded === 'function') fogLanded(null, sendAll); else sendAll();
}
function sensesKeys() { var all = Object.create(null); [_sensesSig, _sensesAt, _sensesPend].forEach(function(o) { Object.keys(o).forEach(function(k) { all[k] = 1; }); }); return Object.keys(all); }
function sensesForget(pid) { var pre = pid + '|'; sensesKeys().forEach(function(k) { if (k.indexOf(pre) === 0) sensesDrop(k); }); }
function sensesForgetMap(mapId) { sensesKeys().forEach(function(k) { var i = k.indexOf('|'); if (i > 0 && k.slice(i + 1) === mapId) sensesDrop(k); }); }   // the map is what follows the first bar: a profile id holds none, a map's id (from a file) may
function sensesReset() { sensesKeys().forEach(sensesDrop); }
// [netcheck:sensesmoved-end]
// The hosted campaign's sounds reach the table as a list (uploads by path, bundled defaults by id, what is playing
// now): to one peer at admit, to every admitted peer on a save that changed the index, and straight from the
// library (hiding a default never passes through save()). Never broadcast(): admitted peers only. The signature
// covers the list, not the master or the playing loop — those travel as cues, and a late joiner reads them at admit.
net._lastSoundSig = null;
function soundSig(msg) { return quickHash(JSON.stringify({ c: msg.campId, l: msg.list })); }
net.soundsMessage = function() { return window.wpSound && window.wpSound.listMessage ? window.wpSound.listMessage() : null; };
net.syncSounds = function(force) {
    if (!net.active || net.role !== 'host') return;
    var msg = net.soundsMessage(); if (!msg) return;
    var s = soundSig(msg);
    if (!force && s === net._lastSoundSig) return;
    net._lastSoundSig = s;
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
};
// A cue for the table: start a loop, fire a one-shot, stop, or a volume. Ids only; the path is the entry's own on
// the player's side (a player fetches nothing a cue names).
net.sendSound = function(cue) {
    if (!net.active || net.role !== 'host' || !cue || typeof cue.act !== 'string') return;
    var msg = { type: 'sound', act: cue.act };
    if (cue.id !== undefined) msg.id = cue.id;
    if (cue.gain !== undefined) msg.gain = cue.gain;
    if (cue.fade !== undefined) msg.fade = cue.fade;
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
};
// Music (1.5.0): its own library list travels like sounds (to one peer at admit, to admitted peers on a change),
// and a "take control" override (music-ctl) lets the GM drive every client's music in sync. camp.music is stripped
// from the snapshot (sanitizeAppState) so the library only ever arrives as this validated message. The signature
// covers the library only; the live override travels separately, and a late joiner reads it at admit.
net._lastMusicSig = null;
function musicSig(msg) { return quickHash(JSON.stringify({ c: msg.campId, m: msg.music })); }
net.musicMessage = function() { return window.wpMusic && window.wpMusic.listMessage ? window.wpMusic.listMessage() : null; };
net.syncMusic = function(force) {
    if (!net.active || net.role !== 'host') return;
    var msg = net.musicMessage(); if (!msg) return;
    var s = musicSig(msg);
    if (!force && s === net._lastMusicSig) return;
    net._lastMusicSig = s;
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
};
// The GM's take-control override: drive every admitted client's music (or release with on:false). Host-only — a
// client never drives another player's music (there is deliberately no host receive branch). Cleaned before it goes.
net.sendMusicControl = function(ctrl) {
    if (!net.active || net.role !== 'host' || !window.wpMusicCore) return;
    var msg = window.wpMusicCore.cleanControl(ctrl, window.wpMusic && window.wpMusic.idSets ? window.wpMusic.idSets() : null);
    if (!msg) return;
    msg.type = 'music-ctl';
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
};
// Campaign videos (1.5.0, item 21 V2): the GM's playing video, live to the table. The picture and its sound go from the host to each
// player of the showing's audience (every admitted player, or the ticked profiles) over a WebRTC connection of its own, agreed over the
// table's own data connection — an offer, an answer and their candidates as messages — so nothing of it passes the signalling server and
// the words arrive in the order they were said. Of the library and the file only the video's name leaves the host. Nothing comes back but
// the answer: the host sends, a player receives. Neither side uses a media call: both close any they are offered.
// [netcheck:videocand-start]
var VIDEO_ID = /^[0-9a-f]{16}$/;   // a link's id: the host's, new for every link
// One ICE candidate as it may travel, either way: its line (cut short, one line) and the media line it belongs to; anything else is none
function videoCand(c) {
    if (!c || typeof c !== 'object' || Array.isArray(c) || typeof c.candidate !== 'string' || c.candidate.length > 600 || c.candidate.indexOf('candidate:') !== 0 || /[\r\n\u0000]/.test(c.candidate)) return null;
    var out = { candidate: c.candidate };
    if (typeof c.sdpMid === 'string' && /^[A-Za-z0-9_-]{1,16}$/.test(c.sdpMid)) out.sdpMid = c.sdpMid;
    if (typeof c.sdpMLineIndex === 'number' && c.sdpMLineIndex >= 0 && c.sdpMLineIndex <= 8 && Math.floor(c.sdpMLineIndex) === c.sdpMLineIndex) out.sdpMLineIndex = c.sdpMLineIndex;
    return out.sdpMid !== undefined || out.sdpMLineIndex !== undefined ? out : null;
}
// A session description as it may travel: a text of bounded length that starts as one does; anything else is none
function videoSdp(s) { return typeof s === 'string' && s.length <= 20000 && s.indexOf('v=0') === 0 ? s : null; }
// [netcheck:videocand-end]
// [netcheck:videohost-start]
var _vid = null;      // the showing: { name, to: null for everyone | [profile id], stream, w, h, links: peer key -> { id, pc, pid, up, answered, ice, timer }, of: profile id -> the peer key holding their link }
var _vidAsk = null;   // a player's asks, limited per profile (never forgotten when a connection closes: a reconnect loop gets no new count)
function videoWants(v, pr) { return !!(v && pr && typeof pr.id === 'string' && (!v.to || v.to.indexOf(pr.id) >= 0)); }
function videoTold() { if (window.wpVideo && window.wpVideo.audienceChanged) { try { window.wpVideo.audienceChanged(); } catch (e) {} } }
function videoLive(stream) { try { return !!stream && typeof stream.getVideoTracks === 'function' && stream.getVideoTracks().some(function(t) { return !!t && t.readyState === 'live'; }); } catch (e) { return false; } }
function videoHang(key) {   // that connection's link, closed and forgotten
    var v = _vid, ln = v && own(v.links, key) ? v.links[key] : null; if (!ln) return;
    delete v.links[key];
    if (own(v.of, ln.pid) && v.of[ln.pid] === key) delete v.of[ln.pid];
    if (ln.timer) { clearTimeout(ln.timer); ln.timer = null; }
    try { ln.pc.onicecandidate = null; ln.pc.onconnectionstatechange = null; ln.pc.close(); } catch (e) {}
}
// What each viewer is sent at most (videocore's sendCap): set once the link is up, lower when the picture travels through a relay
function videoCap(ln, v) {
    var VCc = window.wpVideoCore; if (!VCc || !VCc.sendCap || typeof ln.pc.getSenders !== 'function') return;
    var apply = function(relayed) {
        try {
            var s = ln.pc.getSenders().filter(function(x) { return x && x.track && x.track.kind === 'video'; })[0]; if (!s) return;
            var p = s.getParameters(), cap = VCc.sendCap(v.w, v.h, relayed); if (!p || !p.encodings || !p.encodings.length) return;
            p.encodings[0].maxBitrate = cap.maxBitrate; p.encodings[0].maxFramerate = cap.maxFramerate; p.encodings[0].scaleResolutionDownBy = cap.scaleResolutionDownBy;
            var r = s.setParameters(p); if (r && r.catch) r.catch(function() {});
        } catch (e) {}
    };
    var only = false; try { only = !!(relayOnly() && turnConfig()); } catch (e) {}
    apply(only);
    if (only || typeof ln.pc.getStats !== 'function') return;
    try {
        ln.pc.getStats().then(function(st) {   // a link that found its way only through the relay
            var used = Object.create(null), kind = Object.create(null), relayed = false;
            st.forEach(function(r) { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') used[r.localCandidateId] = 1; else if (r.type === 'local-candidate') kind[r.id] = r.candidateType; });
            Object.keys(used).forEach(function(k) { if (kind[k] === 'relay') relayed = true; });
            if (relayed) apply(true);
        }).catch(function() {});
    } catch (e) {}
}
function videoLink(c) {   // one link to one admitted, open connection of the audience; a player has one link, on their newest connection
    var v = _vid;
    if (!v || !net.active || net.role !== 'host' || !c || !c.open || !own(net.roster, c.peer) || !videoWants(v, net.roster[c.peer]) || !videoLive(v.stream) || typeof RTCPeerConnection !== 'function') return false;
    var pid = net.roster[c.peer].id, prev = own(v.of, pid) ? v.of[pid] : null;
    if (prev && prev !== c.peer) videoHang(prev);
    videoHang(c.peer);
    var pc = null;
    try { pc = new RTCPeerConnection(peerOpts().config); } catch (e) { return false; }
    var ln = { id: newKey().slice(0, 16), pc: pc, pid: pid, up: false, answered: false, ice: 0, timer: null };
    v.links[c.peer] = ln; v.of[pid] = c.peer;
    var mine = function() { return _vid === v && own(v.links, c.peer) && v.links[c.peer] === ln; };
    var say = function(m) { if (!mine() || !c.open) return; m.type = 'video'; m.id = ln.id; try { c.send(m); } catch (e) { sendFailed(e); } };
    var drop = function() { if (mine()) { videoHang(c.peer); videoTold(); } };
    try { v.stream.getTracks().forEach(function(t) { if (t && t.readyState === 'live') pc.addTransceiver(t, { direction: 'sendonly', streams: [v.stream] }); }); } catch (e) { drop(); return false; }
    pc.onicecandidate = function(e) { var cd = e && e.candidate ? videoCand(e.candidate) : null; if (cd) say({ act: 'ice', cand: cd }); };
    pc.onconnectionstatechange = function() {
        if (!mine()) return;
        var s = pc.connectionState;
        if (s === 'connected') { if (ln.timer) { clearTimeout(ln.timer); ln.timer = null; } if (!ln.up) { ln.up = true; videoCap(ln, v); videoTold(); } }   // agreed: the watchdog is done with it (a link that later dies ends through 'failed')
        else if (s === 'disconnected') { if (ln.up) { ln.up = false; videoTold(); } }
        else if (s === 'failed' || s === 'closed') drop();
    };
    try {
        pc.createOffer().then(function(o) { if (!mine()) return null; return pc.setLocalDescription(o).then(function() { if (mine()) say({ act: 'offer', name: v.name, sdp: pc.localDescription.sdp }); }); }).catch(drop);
    } catch (e) { drop(); return false; }
    ln.timer = setTimeout(function() { ln.timer = null; if (mine() && !ln.up) drop(); }, 20000);   // never agreed (no route): the idle connection goes; the player's own ask brings a new one
    return true;
}
// Show a stream to everyone (pids absent or null) or to the listed profiles: the audience is fixed for the showing, and a latecomer of it
// is linked when admitted. Only a stream whose picture is live is shown. Returns who it reaches now, or null when nothing was shown
net.videoShow = function(stream, name, pids, w, h) {
    if (!net.active || net.role !== 'host' || !window.wpVideoCore || !videoLive(stream)) return null;
    var to = null;
    if (pids !== null && pids !== undefined) {
        if (!Array.isArray(pids)) return null;
        to = pids.filter(function(p, i) { return validProfileId(p) && pids.indexOf(p) === i; }).slice(0, 64);
        if (!to.length) return null;
    }
    net.videoStop();
    _vid = { name: window.wpVideoCore.cleanName(name, 'Video'), to: to, stream: stream, w: typeof w === 'number' && isFinite(w) ? w : 0, h: typeof h === 'number' && isFinite(h) ? h : 0, links: Object.create(null), of: Object.create(null) };
    if (_vidAsk) _vidAsk.reset();   // a new showing, a new count of asks
    net.conns.forEach(function(c) { videoLink(c); });
    var who = net.videoAudience();
    logEvent('table', 'Video "' + _vid.name + '" shown to ' + (to ? (who.names.concat(who.waiting).join(', ') || 'chosen players') : 'everyone'));
    return who;
};
net.videoStop = function() {
    var v = _vid; if (!v) return false;
    Object.keys(v.links).forEach(videoHang);
    _vid = null;
    // the stop goes to every admitted connection of the audience, one whose link already failed too (its panel may still be open)
    if (net.active && net.role === 'host') net.conns.forEach(function(c) { if (c.open && own(net.roster, c.peer) && videoWants(v, net.roster[c.peer])) { try { c.send({ type: 'video', act: 'stop' }); } catch (e) { sendFailed(e); } } });
    return true;
};
// Who a showing reaches, for the GM's panel, one name per profile: names — a link of theirs is up, they are being sent it; waiting — in the
// audience and connected, with no link up (still connecting, their own Video off, no route)
net.videoAudience = function() {
    var v = _vid, up = Object.create(null), nameOf = Object.create(null), order = [];
    if (!v) return { live: false, all: true, names: [], waiting: [] };
    net.conns.forEach(function(c) {
        var pr = c.open && own(net.roster, c.peer) ? net.roster[c.peer] : null; if (!videoWants(v, pr)) return;
        if (nameOf[pr.id] === undefined) { nameOf[pr.id] = cleanRosterName(pr.name); order.push(pr.id); }
        if (own(v.links, c.peer) && v.links[c.peer].up === true) up[pr.id] = 1;
    });
    return { live: true, all: !v.to, names: order.filter(function(id) { return up[id] === 1; }).map(function(id) { return nameOf[id]; }), waiting: order.filter(function(id) { return up[id] !== 1; }).map(function(id) { return nameOf[id]; }) };
};
// A player's word about a video (video-up), from an admitted connection (the gate), and only while a showing is live with them in its
// audience: ask — link me (again), limited per profile; bye — I am not taking it (their Video is off): the link goes at once; answer and
// ice — only for the link this connection holds, named by its id: one answer, then at most 60 candidates, each cleaned
function videoUp(msg, conn) {
    var v = _vid, pr = own(net.roster, conn.peer) ? net.roster[conn.peer] : null;
    if (!v || !videoWants(v, pr)) return;
    if (msg.act === 'ask') {
        if (!_vidAsk) { var DCv = window.wpDiceCore; if (!DCv || !DCv.RateLimit) return; _vidAsk = DCv.RateLimit({ perMs: 1500, burst: 4, windowMs: 60000, table: 40 }); }
        if (_vidAsk.allow('$' + pr.id, Date.now()) !== true) return;
        videoLink(conn);
        return;
    }
    var ln = own(v.links, conn.peer) ? v.links[conn.peer] : null;
    if (!ln || typeof msg.id !== 'string' || msg.id !== ln.id) return;
    var mine = function() { return _vid === v && own(v.links, conn.peer) && v.links[conn.peer] === ln; };
    if (msg.act === 'bye') { videoHang(conn.peer); videoTold(); }
    else if (msg.act === 'answer') {
        var sdp = videoSdp(msg.sdp); if (ln.answered || !sdp) return;
        ln.answered = true;
        try { ln.pc.setRemoteDescription({ type: 'answer', sdp: sdp }).catch(function() { if (mine()) { videoHang(conn.peer); videoTold(); } }); } catch (e) { videoHang(conn.peer); videoTold(); }
    } else if (msg.act === 'ice') {
        var cd = videoCand(msg.cand); if (!ln.answered || !cd || ++ln.ice > 60) return;
        try { ln.pc.addIceCandidate(cd).catch(function() {}); } catch (e) {}
    }
}
// [netcheck:videohost-end]
// The player's side: the synced host's offer is taken only with this player's own Video feature on, never in the stream window (the
// message branch judges who speaks); a connection of its own receives the picture and sends nothing but the answer. The name is cleaned
// again and shown as text.
// [netcheck:videoclient-start]
var _vidIn = { id: null, pc: null, ice: 0, live: false, offered: false, asks: 0, askedAt: 0, timer: null };
function videoOn() { return !!(window.wpVideo && window.wpVtt && window.wpVtt.on('video')); }
function videoSay(m) {   // a word to our GM about a video; false when there is no synced table to say it to
    var c0 = net.conns[0];
    if (!net.active || net.role !== 'client' || net.stream || !net.foreign || !c0 || !c0.open || !net.syncedPeer || c0.peer !== net.syncedPeer) return false;
    m.type = 'video-up';
    try { c0.send(m); } catch (e) { sendFailed(e); return false; }
    return true;
}
function videoAsk() { return videoOn() && videoSay({ act: 'ask' }); }
function videoShut() {   // this app's end of a link, closed
    var pc = _vidIn.pc; _vidIn.pc = null; _vidIn.id = null; _vidIn.ice = 0;
    if (pc) { try { pc.ontrack = null; pc.onicecandidate = null; pc.onconnectionstatechange = null; pc.close(); } catch (e) {} }
}
function videoAskSoon() {   // the picture went with no stop from the GM: ask for it again shortly, at most 3 times running (a link that comes up starts the count again)
    if (!_vidIn.live || _vidIn.asks >= 3 || _vidIn.timer) return;
    _vidIn.timer = setTimeout(function() { _vidIn.timer = null; if (_vidIn.live && !_vidIn.pc) { _vidIn.asks++; if (!videoAsk()) _vidIn.offered = true; } }, 2000);   // not sent (Video is off here just now): remembered, asked for when it is on again
}
function videoOver() {   // the GM stopped showing, or the table is left: nothing of a showing is kept
    if (_vidIn.timer) clearTimeout(_vidIn.timer);
    videoShut();
    _vidIn = { id: null, pc: null, ice: 0, live: false, offered: false, asks: 0, askedAt: 0, timer: null };
}
function videoMsg(msg) {   // the synced host's word about a video: stop; an offer (a new link); a candidate for the link held
    if (msg.act === 'stop') { videoOver(); if (window.wpVideo && window.wpVideo.onStop) window.wpVideo.onStop(); return; }
    if (typeof msg.id !== 'string' || !VIDEO_ID.test(msg.id)) return;
    if (msg.act === 'ice') {
        var cdI = videoCand(msg.cand); if (!_vidIn.pc || msg.id !== _vidIn.id || !cdI || ++_vidIn.ice > 60) return;
        try { _vidIn.pc.addIceCandidate(cdI).catch(function() {}); } catch (e) {}
        return;
    }
    if (msg.act !== 'offer') return;
    var sdp = videoSdp(msg.sdp); if (!sdp) return;
    if (!videoOn()) { _vidIn.offered = true; videoSay({ act: 'bye', id: msg.id }); return; }   // Video is off here: not taken, the GM told; switching it on asks for it
    if (typeof RTCPeerConnection !== 'function') { videoSay({ act: 'bye', id: msg.id }); return; }   // this app can take no video at all: the GM told, nothing asked for
    if (!allow('videoin', { perMs: 300, burst: 20, windowMs: 60000, table: 20 }, 'host')) {   // a host that offers without end is not followed; an offer the limit caught is asked for again shortly
        _vidIn.offered = true;
        if (!_vidIn.timer) _vidIn.timer = setTimeout(function() { _vidIn.timer = null; net.videoWake(); }, 2000);
        return;
    }
    var VCi = window.wpVideoCore, name = VCi ? VCi.cleanName(msg.name, 'Video') : 'Video', id = msg.id, ms = null, pc = null;
    videoShut();   // one link: an older one goes first
    try { pc = new RTCPeerConnection(peerOpts().config); } catch (e) { return; }
    _vidIn.pc = pc; _vidIn.id = id; _vidIn.ice = 0; _vidIn.live = true; _vidIn.offered = false;
    var mine = function() { return _vidIn.pc === pc; };
    var lost = function() { if (!mine()) return; videoShut(); if (window.wpVideo && window.wpVideo.onLost) window.wpVideo.onLost(); videoAskSoon(); };
    pc.ontrack = function(e) {   // the picture, then its sound (or the other way round): one stream for the panel, handed over at each
        if (!mine() || !e || !e.track) return;
        if (!ms) ms = new MediaStream();
        try { ms.addTrack(e.track); } catch (er) {}
        if (window.wpVideo && window.wpVideo.onStream) window.wpVideo.onStream(ms, name);
    };
    pc.onicecandidate = function(e) { var cd = e && e.candidate ? videoCand(e.candidate) : null; if (cd && mine()) videoSay({ act: 'ice', id: id, cand: cd }); };
    pc.onconnectionstatechange = function() { if (!mine()) return; var s = pc.connectionState; if (s === 'connected') _vidIn.asks = 0; else if (s === 'failed' || s === 'closed') lost(); };   // a link that is up starts the count of asks again; an interruption is not yet a loss
    try {
        pc.setRemoteDescription({ type: 'offer', sdp: sdp }).then(function() { return mine() ? pc.createAnswer() : null; }).then(function(a) {
            if (!a || !mine()) return null;
            return pc.setLocalDescription({ type: 'answer', sdp: VCi && VCi.stereoSdp ? VCi.stereoSdp(a.sdp) : a.sdp }).then(function() { if (mine()) videoSay({ act: 'answer', id: id, sdp: pc.localDescription.sdp }); });
        }).catch(lost);
    } catch (e) { lost(); }
}
net.videoWake = function() {   // the snapshot came, or Video was switched on here: a showing this app did not take is asked for — and again, 2 s apart, until its offer is taken or the GM stops (an ask the GM's limit refused is not the end)
    if (!_vidIn.offered || _vidIn.pc) return;
    var now = Date.now(); if (now - _vidIn.askedAt < 2000) return;
    if (videoAsk()) _vidIn.askedAt = now;
};
net.videoDrop = function() {   // Video was switched off here while it played: the link closes, the GM is told, and switching it on again asks for it
    var id = _vidIn.id; if (!_vidIn.pc) { _vidIn.offered = _vidIn.live; return; }   // no link just now (the picture was lost): the showing is still remembered
    videoShut(); _vidIn.offered = _vidIn.live;
    if (id) videoSay({ act: 'bye', id: id });
};
// [netcheck:videoclient-end]
// Visual effects (1.5.0, S3): a short-lived effect to the players ON THAT MAP (a stop reaches everyone); the host
// makes every effect, a player never triggers one on anyone. The renderer and the presets live in fx.js / fxcore.js.
// `to` (the GM's ping, fold P): one player's profile id, every connection of theirs, still only on that map; absent,
// everyone there. Admitted peers only (own roster keys).
// [netcheck:sendfx-start]
net.sendFx = function(fx, to) {
    if (!net.active || net.role !== 'host' || !fx || !window.wpFxCore) return;
    if (to !== undefined && to !== null && (typeof to !== 'string' || !to)) return;
    var clean = window.wpFxCore.cleanFx(fx); if (!clean) return;
    var msg = {}; for (var k in clean) if (Object.prototype.hasOwnProperty.call(clean, k)) msg[k] = clean[k]; msg.type = 'fx';
    net.conns.forEach(function(c) {
        if (!c.open || !own(net.roster, c.peer)) return;
        var p = net.roster[c.peer];
        if (clean.kind !== 'stop' && p.location !== clean.mapId) return;   // same-map reach; a stop clears everyone
        if (to && p.id !== to) return;
        try { c.send(msg); } catch (e) { sendFailed(e); }
    });
};
// [netcheck:sendfx-end]
net.sendFxArrival = function(conn, mapId) {   // a peer landing on a map gets its running weather / held wash — an admitted peer only
    if (!net.active || net.role !== 'host' || !conn || !conn.open || !mapId || !window.wpFx || !own(net.roster, conn.peer)) return;
    window.wpFx.runningSet(mapId).forEach(function(m) { try { conn.send(m); } catch (e) { sendFailed(e); } });
};
// A blast thrown from a character sheet, shown to the players ON THAT MAP (item library, 1.5.0). Host only; no GM-only data.
// [netcheck:blast-start]
net.broadcastBlast = function(blast, mapId) {
    if (!net.active || net.role !== 'host' || !blast) return;
    var b = { x: Number(blast.x), y: Number(blast.y), ft: Number(blast.ft), elev: Number(blast.elev) || 0, name: typeof blast.name === 'string' ? blast.name.slice(0, 60) : '', by: typeof blast.by === 'string' ? blast.by.slice(0, 60) : '' };
    if (!isFinite(b.x) || !isFinite(b.y) || !(b.ft > 0)) return;
    var camp = getActiveCampaign(); if (!camp) return;
    var msg = { type: 'blast', campId: camp.id, mapId: mapId, blast: b };
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer] && net.roster[c.peer].location === mapId) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
};
// [netcheck:blast-end]
net.broadcastBlastClear = function(mapId) {
    if (!net.active || net.role !== 'host') return;
    var camp = getActiveCampaign(); if (!camp) return;
    var msg = { type: 'blastClear', campId: camp.id, mapId: mapId };
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
};
// The hosted campaign's system (character sheets) reaches the table as the players' view — GM-only fields and rolls
// gone, formulas that named them blanked — in the snapshot and on every save or editor Save that changed it (a
// signature over the clean view). Admitted peers only; null when the campaign has no system.
// The campaign's document look (doc theming, 1.5.0): the campaign default travels in the join snapshot (sanitizeAppState
// keeps a validated camp.docStyle); a change mid-session goes out the way the system does — once per change, admitted peers
// only, re-validated on arrival. A host has NO branch for 'docStyle': a client never sets the table's look.
net._lastDocStyleSig = null;
net.docStyleMessage = function() { var camp = getActiveCampaign(); if (!camp) return null; var DR = window.wpDocRender, ds = (DR && DR.cleanDocStyle) ? DR.cleanDocStyle(camp.docStyle) : null; return { type: 'docStyle', campId: camp.id, docStyle: ds || null }; };
net.syncDocStyle = function(force) {
    if (!net.active || net.role !== 'host') return;
    var msg = net.docStyleMessage(); if (!msg) return;
    var s = quickHash(JSON.stringify(msg.docStyle));
    if (!force && s === net._lastDocStyleSig) return;
    net._lastDocStyleSig = s;
    net.conns.forEach(function(c) { if (c.open && own(net.roster, c.peer)) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
};
// The hosted campaign's name (1.5.0, a joined player's top bar): the join snapshot carries it already (sanitizeAppState keeps camp.name);
// a rename mid-session goes out the way the look does — once per change, admitted peers only, re-checked on arrival. A host has NO
// branch for 'campName': a client never names the table.
// [netcheck:campnamesync-start]
net._lastCampNameSig = null;
net.campNameMessage = function() { var camp = getActiveCampaign(); if (!camp) return null; return { type: 'campName', campId: camp.id, name: typeof camp.name === 'string' ? camp.name.slice(0, 200) : '' }; };
net.syncCampName = function() {
    if (!net.active || net.role !== 'host') return;
    var msg = net.campNameMessage(); if (!msg) return;
    var s = msg.campId + '\n' + msg.name;
    if (s === net._lastCampNameSig) return;
    net._lastCampNameSig = s;
    net.conns.forEach(function(c) { if (c.open && own(net.roster, c.peer)) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
};
// [netcheck:campnamesync-end]
// Fog play areas (review follow-up a): the hosted campaign's fog defaults (camp.fog: an empty map's fog, the default sight and its field)
// — the join snapshot carries them (cleanCampFog); a change mid-session goes out the way a rename does, once per change, admitted peers
// only, cleaned again on arrival (before, a player saw it only after reconnecting). A host has NO branch for 'campFog'
// [netcheck:campfogsync-start]
net._lastCampFogSig = null;
net.campFogMessage = function() { var camp = getActiveCampaign(), FCm = window.wpFogCore; if (!camp || !FCm || !FCm.cleanCampFog) return null; return { type: 'campFog', campId: camp.id, fog: FCm.cleanCampFog(camp.fog) }; };
net.syncCampFog = function() {
    if (!net.active || net.role !== 'host') return;
    var msg = net.campFogMessage(); if (!msg) return;
    var s = msg.campId + '\n' + JSON.stringify(msg.fog);
    if (s === net._lastCampFogSig) return;
    net._lastCampFogSig = s;
    net.conns.forEach(function(c) { if (c.open && own(net.roster, c.peer)) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
    if (net.resendFogged) net.resendFogged();   // a default sight changed: every fogged map, re-filtered
};
// [netcheck:syncsenses-start]
// Senses S2a: a change to the system's senses (the players' view holds them as the GM's does) moves who sees what by them: the system
// goes first (a no-op where this save already sent it), then every fogged map of the hosted campaign, re-filtered. The system alone
// re-sends no map
net._lastSensesSig = null;
function sensesSigOf(msg) { var sn = msg && msg.system && msg.system.combat ? msg.system.combat.senses : null; return (msg ? msg.campId : '') + '\n' + JSON.stringify(sn || null); }
net.syncSenses = function() {
    if (!net.active || net.role !== 'host') return;
    var msg = net.systemMessage(); if (!msg) return;
    var s = sensesSigOf(msg);
    if (s === net._lastSensesSig) return;
    net._lastSensesSig = s;
    if (net.syncSystem) net.syncSystem();
    if (net.resendFogged) net.resendFogged();
};
// [netcheck:syncsenses-end]
// [netcheck:campfogsync-end]
// [netcheck:clocksync-start]
// Item 20 K2: the hosted campaign's clock — the join snapshot carries it; a change goes to admitted players the way the fog defaults do,
// once per change, cleaned again on arrival: its time alone, and (K3) the dated notes players may see. While the Calendar feature is off or the GM keeps the date from players the
// message carries null and a player's app drops its clock. A host has NO branch for 'clock'
net._lastClockSig = null;
function clockOut(camp) { var CCo = window.wpCalendarCore; if (!camp || !CCo || !CCo.cleanClock || !window.wpVtt || !window.wpVtt.campaignOn('calendar', camp)) return null; var ck = CCo.cleanClock(camp.clock) || { t: 0 }; if (ck.hide) return null; var o = { t: ck.t }, ns = (ck.notes || []).filter(function(n) { return n.vis === 'all'; }).map(function(n) { return { id: n.id, day: n.day, text: n.text }; }); if (ns.length) o.notes = ns; return o; }   // K3: the notes players may see, never a GM-only one
net.clockMessage = function() { var camp = getActiveCampaign(); if (!camp) return null; return { type: 'clock', campId: camp.id, clock: clockOut(camp) }; };
net.syncClock = function() {
    if (!net.active || net.role !== 'host') return;
    var msg = net.clockMessage(); if (!msg) return;
    var s = msg.campId + '\n' + JSON.stringify(msg.clock);
    if (s === net._lastClockSig) return;
    net._lastClockSig = s;
    net.conns.forEach(function(c) { if (c.open && own(net.roster, c.peer)) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
};
// [netcheck:clocksync-end]
// Turn-based combat T5b: who may pause, reset or stop an effect's countdown (camp.turnRules.timers) — a player's sheet shows the controls
// only when they may. The join snapshot carries it; a change mid-session goes out the way a rename does, the one word only (the host
// judges every press whatever a player's copy says). A host has NO branch for 'turnRules': a client never sets the table's rules.
// [netcheck:turnrulessync-start]
net._lastTurnRulesSig = null;
net.turnRulesMessage = function() { var camp = getActiveCampaign(); if (!camp) return null; return { type: 'turnRules', campId: camp.id, timers: camp.turnRules && camp.turnRules.timers === 'gm' ? 'gm' : 'owner', fill: camp.turnRules && camp.turnRules.fill === 'gm' ? 'gm' : 'owner' }; };   // item 20 K5b: and who fills pools
net.syncTurnRules = function() {
    if (!net.active || net.role !== 'host') return;
    var msg = net.turnRulesMessage(); if (!msg) return;
    var s = msg.campId + '\n' + msg.timers + '\n' + msg.fill;
    if (s === net._lastTurnRulesSig) return;
    net._lastTurnRulesSig = s;
    net.conns.forEach(function(c) { if (c.open && own(net.roster, c.peer)) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
};
// [netcheck:turnrulessync-end]
// Onboarding F1a: the campaign's rules for players without a character (a waiting token or none; its sight under fog) — in the snapshot
// with the campaign (camp.newPlayers, stored only when not the default), and on a change mid-session once, admitted peers only; the host
// then settles every player's waiting token. A host has NO branch for 'newPlayers': a client never sets the table's rules.
// [netcheck:newplayerssync-start]
net._lastNewPlayersSig = null;
function newPlayersSig(m) { return m.campId + '|' + m.token + '|' + m.sight + '|' + (m.create || '') + '|' + (m.fromFile === false ? 0 : 1); }
// Onboarding F3: making a character (create 'invite' | 'off', fromFile false) travels only where it differs from the default
net.newPlayersMessage = function() { var camp = getActiveCampaign(), S = SC(); if (!camp || !S || !S.newPlayerRules) return null; var r = S.newPlayerRules(camp), n = S.cleanNewPlayers(camp.newPlayers) || {}, m = { type: 'newPlayers', campId: camp.id, token: r.token, sight: r.sight }; if (n.create) m.create = n.create; if (n.fromFile === false) m.fromFile = false; return m; };
net.syncNewPlayers = function() {
    if (!net.active || net.role !== 'host') return;
    var msg = net.newPlayersMessage(); if (!msg) return;
    var s = newPlayersSig(msg);
    if (s === net._lastNewPlayersSig) return;
    var first = net._lastNewPlayersSig === null; net._lastNewPlayersSig = s;
    net.conns.forEach(function(c) { if (c.open && own(net.roster, c.peer)) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
    if (!first) net.tidyWaiting();
    if (!first && net.sensesMoved) net.sensesMoved(null);   // Senses S0: whether a waiting token sees is part of the rule: the players it changes anything for get their maps again
};
// [netcheck:newplayerssync-end]
// [netcheck:libmansync-start]
// Stage 6 library L3: the library players may look through — its visible packs, counted and hashed on the players' view (library.js
// playerManifest) — sent to admitted players once per change; a campaign that never had one sends nothing
net._lastLibSig = null;
net.libManifestMessage = function() { var LB = window.wpLibrary, m = LB && LB.playerManifest ? LB.playerManifest() : null; return m ? { type: 'libManifest', campId: m.campId, packs: m.packs } : null; };
net.syncLibrary = function(force) {
    if (!net.active || net.role !== 'host') return;
    var msg = net.libManifestMessage(); if (!msg) return;
    var s = JSON.stringify(msg); if (!force && s === net._lastLibSig) return;
    if (!msg.packs.length && net._lastLibSig === null) return;   // nothing to say yet
    net._lastLibSig = s;
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
};
var _libSpent = Object.create(null);   // L3: bytes of the library each profile has drawn this session (a reconnect does not start it again)
// [netcheck:libmansync-end]
// [netcheck:libclient-start]
// Stage 6 library L3b: a player's side of the library — the manifest the host sent, for this session only (nothing of another table's
// library is written to disk); each pack's index loaded a page at a time; entries fetched when they are wanted (a cache of LIB.cache);
// at most LIB.clientBudget bytes taken a session. One ask in flight at the table (the host's rate limit spaces them): 20 s each, a busy
// host asked again after 800 ms × n up to 5 times. Every answer is cleaned again — index rows (cleanIndexRow), entries (cleanLibEntry in
// the players' view) — and only the answer to the ask in flight, for the pack and ids it asked about, is taken
var _lib = { man: null, idx: Object.create(null), ent: new Map(), spent: 0, ask: null, queue: [] };
function libLC() { return window.wpLibraryCore || null; }
net.libReset = function() {
    if (_lib.ask) { clearTimeout(_lib.ask.timer); _lib.ask.resolve({ err: 'gone' }); }
    _lib.queue.forEach(function(q) { q.resolve({ err: 'gone' }); });
    _lib = { man: null, idx: Object.create(null), ent: new Map(), spent: 0, ask: null, queue: [] };
};
net.libTake = function(mm) {
    var old = _lib.man; _lib.man = mm;
    if (!old || old.campId !== mm.campId) { _lib.idx = Object.create(null); _lib.ent = new Map(); }
    else {
        var now = Object.create(null); mm.packs.forEach(function(p) { now[p.id] = p.hash; });
        Object.keys(_lib.idx).forEach(function(pid) { if (now[pid] !== _lib.idx[pid].hash) delete _lib.idx[pid]; });   // a pack that moved (or went) is read again
        _lib.ent.forEach(function(v, id) { if (now[v.p] !== v.h) _lib.ent.delete(id); });
    }
};
net.libManifest = function() { var m = _lib.man; return m && state.appState && m.campId === state.appState.activeCampaignId ? m : null; };
net.libRows = function(packId) { var ix = _lib.idx[packId]; return ix ? ix.rows : []; };
net.libLoaded = function(packId) { var ix = _lib.idx[packId]; return ix ? ix.rows.length : 0; };
net.libEntry = function(id) { var v = typeof id === 'string' ? _lib.ent.get(id) : null; return v ? v.e : null; };   // what applyRowOp reads for a player's pick (opts.lib)
function libSend(o) {
    return new Promise(function(resolve) { _lib.queue.push({ o: o, resolve: resolve, tries: 0 }); libPump(); });
}
function libPump() {
    if (_lib.ask || !_lib.queue.length) return;
    var q = _lib.queue.shift(), c = net.conns[0];
    if (!net.active || net.role !== 'client' || !c || !c.open || c.peer !== net.syncedPeer) { q.resolve({ err: 'gone' }); libPump(); return; }
    q.o.rid = 'l' + Math.random().toString(36).slice(2, 12);
    _lib.ask = q; q.timer = setTimeout(function() { if (_lib.ask !== q) return; _lib.ask = null; q.resolve({ err: 'timeout' }); libPump(); }, 20000);
    try { c.send(q.o); } catch (e) { clearTimeout(q.timer); _lib.ask = null; q.resolve({ err: 'gone' }); libPump(); }
}
net.libAnswer = function(msg) {
    var q = _lib.ask; if (!q || !msg || msg.rid !== q.o.rid || msg.type !== q.o.type + '-ans') return;   // only the answer to the ask in flight
    clearTimeout(q.timer); _lib.ask = null;
    if (msg.err === 'busy' && q.tries < 5) { q.tries++; setTimeout(function() { _lib.queue.unshift(q); libPump(); }, 800 * q.tries); return; }
    var LC = libLC(), n = 0; try { n = JSON.stringify(msg).length; } catch (e) { n = Infinity; }
    if (!LC || _lib.spent + n > LC.LIB.clientBudget) { q.resolve({ err: 'budget' }); libPump(); return; }
    _lib.spent += n; q.resolve(msg); libPump();
};
// a pack's whole index, a page at a time (a pack that changes while it loads is read again, three times at most); progress() after each page
net.libLoad = function(packId, progress) {
    var m = net.libManifest(), LC = libLC(), p = m ? m.packs.filter(function(x) { return x.id === packId; })[0] : null; if (!p || !LC) return Promise.resolve(false);
    var ix = _lib.idx[packId]; if (ix && ix.done) return Promise.resolve(true); if (ix && ix.loading) return ix.loading;
    ix = _lib.idx[packId] = { hash: p.hash, rows: [], seen: Object.create(null), done: false, loading: null };
    ix.loading = (async function() {
        var page = 0, pages = 1, again = 0;
        while (page < pages) {
            var a = await libSend({ type: 'lib-idx', campId: m.campId, packId: packId, page: page });
            if (_lib.idx[packId] !== ix) return false;   // dropped meanwhile (the manifest moved)
            if (!a || a.err || a.packId !== packId || typeof a.hash !== 'string' || !LC.HASH_RE.test(a.hash) || a.page !== page || typeof a.pages !== 'number' || !Array.isArray(a.rows)) { ix.loading = null; ix.err = (a && a.err) || 'bad'; return false; }
            if (page > 0 && a.hash !== ix.hash) { if (++again > 3) { ix.loading = null; ix.err = 'moving'; return false; } ix.rows = []; ix.seen = Object.create(null); page = 0; ix.hash = a.hash; continue; }
            ix.hash = a.hash; pages = Math.max(1, Math.min(Math.floor(a.pages) || 1, Math.ceil(LC.LIB.entries / LC.LIB.page)));
            a.rows.forEach(function(r) { var c = LC.cleanIndexRow(r); if (c && !ix.seen[c[0]] && ix.rows.length < LC.LIB.entries) { ix.seen[c[0]] = 1; ix.rows.push(c); } });
            page++; if (typeof progress === 'function') try { progress(); } catch (e) {}
        }
        ix.done = true; ix.loading = null; return true;
    })();
    return ix.loading;
};
// entries of a pack by id — the cache first, the rest asked for (50 an ask; what an answer left out for size is asked again); the ones held
net.libGet = async function(packId, ids) {
    var m = net.libManifest(), LC = libLC(), camp = getActiveCampaign(); if (!m || !LC || !camp || !Array.isArray(ids)) return [];
    var ctx = LC.libCtx(camp.system, window.wpFormula, false), once = Object.create(null), want = ids.filter(function(id) { if (typeof id !== 'string' || !LC.ITEM_RE.test(id) || _lib.ent.has(id) || once[id]) return false; once[id] = 1; return true; }).slice(0, 200), rounds = 0;
    while (want.length && rounds++ < 20) {
        var chunk = want.slice(0, LC.LIB.getIds), a = await libSend({ type: 'lib-get', campId: m.campId, packId: packId, ids: chunk });
        if (!a || a.err || a.packId !== packId || typeof a.hash !== 'string' || !Array.isArray(a.entries)) break;
        var asked = Object.create(null), got = 0; chunk.forEach(function(id) { asked[id] = 1; });
        a.entries.forEach(function(e) { var c = LC.cleanLibEntry(e, ctx); if (!c || asked[c.id] !== 1) return; asked[c.id] = 2; got++; _lib.ent.delete(c.id); _lib.ent.set(c.id, { e: c, p: packId, h: a.hash }); while (_lib.ent.size > LC.LIB.cache) _lib.ent.delete(_lib.ent.keys().next().value); });
        if (!got) break;
        want = want.filter(function(id) { return asked[id] !== 2; });
    }
    return ids.map(function(id) { return net.libEntry(id); }).filter(Boolean);
};
// [netcheck:libclient-end]
net._lastSystemSig = null;
net.systemMessage = function() { var camp = getActiveCampaign(); if (!camp || !window.wpSheets) return null; return { type: 'system', campId: camp.id, system: window.wpSheets.playerSystem(camp) }; };
net.syncSystem = function(force) {
    if (!net.active || net.role !== 'host') return;
    var msg = net.systemMessage(); if (!msg) return;
    var s = quickHash(JSON.stringify(msg.system));
    if (!force && s === net._lastSystemSig) return;
    net._lastSystemSig = s;
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
    net.syncChars();   // values keyed by field ids the peers now know
};
// ---------- characters (character sheets, 1.5.0): per-recipient copies, deltas, a player's edits ----------
// A player holds their own character in full (minus GM-only fields), other PCs' hover fields only, no NPCs. Every
// payload is built per peer from a fresh view; nothing a client says about a character is applied unchecked.
var charLimit = null, _doorLimit = null, _charPending = {}, _charSlowSaid = {};
var _charHost = Object.create(null);    // Stage 6 (client): the last copy of each character's values the host sent — a refused change goes back to it, never to an older one
var _rowGrace = {};    // Stage 6 (host): a pickup's Undo window, 'charId|fieldId|rowId' -> { until, added } (memory only; a bound item may drop by what its pickups added)
function SC() { return window.wpSystemCore || null; }
function peerProfileId(c) { var p = net.roster[c.peer]; return p && p.id ? p.id : null; }
// [netcheck:chardelta-start]
var _unseenSent = Object.create(null);   // Stage 6 F6: the nameless changes each owner last had, by peer and character
// 5h: the full status-effect library by id (host-local, never sent): a GM-only effect applied to a PC reaches its owner inline through it
function fxLib(sys) { var lib = {}; (sys && Array.isArray(sys.effects) ? sys.effects : []).forEach(function(d) { if (d && typeof d.id === 'string' && /^e_[A-Za-z0-9_]{1,24}$/.test(d.id)) lib[d.id] = d; }); return lib; }
// Stage 6 F4a: the full item library by id (host-local, never sent): a GM-only item on a PC reaches its owner inline through it (players' fields only)
// Stage 6 library L1c: with a library on this machine, a lookup (the system's items first, then the library) rather than a map of thousands
function itemLib(sys) { var lib = {}; (sys && Array.isArray(sys.items) ? sys.items : []).forEach(function(d) { if (d && typeof d.id === 'string' && /^i_[A-Za-z0-9_]{1,24}$/.test(d.id)) lib[d.id] = d; }); var L = typeof window !== 'undefined' ? window.wpLibrary : null; return L && typeof L.size === 'function' && L.size() > 0 ? function(id) { return Object.prototype.hasOwnProperty.call(lib, id) ? lib[id] : (L.entryFor || L.entry)(id); } : lib; }   // a GM-only pack's entry reads GM-only (entryFor)
// 5h: a teammate's copy (partial: hover fields only) cannot work out a hover line whose formula reads a field it does not hold (HP max from
// ST read the default: "HP 9 / 10" where the owner saw "9 / 14"), so the host sends the lines it works out from the owner's own view.
function withHoverLines(v, src, view, lib, items, full) {   // full (F6): the GM's system, so the owner's view counts what rows they cannot see change
    var S = SC(); if (!v || !v.partial || !S || !window.wpFormula || !src) return v;
    var ownV = S.charFor(src, view, src.ownerId, { lib: lib || null, items: items || null, full: full || null }); if (!ownV) return v;
    var ln = []; try { ln = S.hoverLines(view, ownV, window.wpFormula); } catch (e) {}
    v.lines = ln.slice(0, 12).map(function(s) { return String(s).slice(0, 120); });   // always, even [] — the owner's "no lines" is the answer; a teammate never falls back to its own defaults
    return v;
}
function charViewFor(charId, recipientId) {   // the copy one peer may hold, or null
    var camp = getActiveCampaign(), S = SC(); if (!camp || !S || !(camp && camp.chars && typeof charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, charId) ? camp.chars[charId] : null) || !window.wpSheets) return null;
    var view = window.wpSheets.playerSystem(camp); if (!view) return null;
    var lib = fxLib(camp.system), items = itemLib(camp.system);
    return withHoverLines(S.charFor(camp.chars[charId], view, recipientId, { lib: lib, items: items, full: camp.system }), camp.chars[charId], view, lib, items, camp.system);
}
net.dropPending = function(charId) { Object.keys(_charPending).forEach(function(rid) { if (_charPending[rid].charId === charId) { clearTimeout(_charPending[rid].timer); delete _charPending[rid]; } }); };   // a sheet that stopped being ours: its queued edits go
function charSessionReset() { Object.keys(_charPending).forEach(function(k) { clearTimeout(_charPending[k].timer); }); _charPending = {}; _charSlowSaid = {}; _charHost = Object.create(null); _rowGrace = {}; _triedSaid = {}; if (charLimit) charLimit.reset(); }
// Stage 6: the GM alone hears when a player picks up, tries to remove or drops a bound or cursed item (a toast and the session log's Items)
function itemNotice(ch, name, what) {
    var who = ch && ch.name ? ch.name : 'A character', nm = name || 'an item';
    if (/-try$/.test(what)) {   // F4b follow-up: a refused attempt repeated is one notice per quiet window, the next one saying how many went unsaid
        var tk = (ch && ch.id ? ch.id : who) + '|' + nm + '|' + what, ts = _triedSaid[tk], tnow = Date.now();
        if (ts && tnow - ts.at < TRY_QUIET_MS) { ts.more++; return; }
        var more = ts ? ts.more : 0; _triedSaid[tk] = { at: tnow, more: 0 };
    }
    var t = what === 'bound-pick' ? who + ' picked up ' + nm + ' — bound: it stays until you remove it.'
        : what === 'curse-pick' ? who + ' picked up ' + nm + ' — curse on contact: if they drop it, you keep it on their sheet.'
        : what === 'bound-try' ? who + ' tried to remove ' + nm + ' — it stays (bound).'
        : what === 'eq-bound-on' ? who + ' switched on ' + nm + ' — bound: it stays on until you switch it off.'   // Stage 6 F4b: the equip lock
        : what === 'eq-curse-on' ? who + ' switched on ' + nm + ' — curse on contact: if they switch it off, you keep it on.'
        : what === 'eq-bound-try' ? who + ' tried to switch off ' + nm + ' — it stays on (bound).'
        : what === 'eq-curse-off' ? who + ' switched off ' + nm + ' — it stays on, out of their sight, until you switch it off.'
        : what === 'pick-over' ? who + ' changed ' + nm + ' — their pick replaced the hidden choice you set (set it again with \u270e if you want it back).'
        : who + ' dropped ' + nm + ' — kept on their sheet, out of their sight, until you remove it.';
    if (more) t += ' (' + more + ' more ' + (more === 1 ? 'try' : 'tries') + ' since the last notice)';
    toast(t); logEvent('items', t);
}
var _uploadAt = {}, UPLOAD_GAP_MS = 10000;   // Stage 6 U2: host: peer -> when their last upload was read (one every 10 s)
var _triedSaid = {}, TRY_QUIET_MS = 30000;   // host: 'charId|item|kind' -> { at, more } — the last said refused attempt (memory only)
net.syncChars = function() {   // every character, per peer (after the system changed)
    if (!net.active || net.role !== 'host') return;
    if (net.sensesMoved) net.sensesMoved(null);
    if (typeof fxbMoved === 'function') fxbMoved(null);   // conditions C1: the effects on the tokens
    var camp = getActiveCampaign(); if (!camp) return;
    net.conns.forEach(function(c) {
        if (!c.open || !net.roster[c.peer]) return;
        var pid = peerProfileId(c), outC = {};
        Object.keys(camp.chars || {}).forEach(function(id) { var v = charViewFor(id, pid); if (v) outC[id] = v; });
        try { c.send({ type: 'chars', campId: camp.id, chars: outC }); } catch (e) { sendFailed(e); }
    });
};
net.syncChar = function(id) {   // one character whole (renamed, reassigned, portrait) or gone for a peer that may not see it
    if (!net.active || net.role !== 'host') return;
    if (net.sensesMoved) net.sensesMoved(id);
    if (typeof fxbMoved === 'function') fxbMoved(id);   // conditions C1
    var camp = getActiveCampaign(); if (!camp) return;
    var srcM = (camp && camp.chars && typeof id === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, id) ? camp.chars[id] : null), mkM = !!(srcM && srcM.making === 1);   // Onboarding F3: a character in the making: its owner hears of it, nobody else (not even that it is gone)
    net.conns.forEach(function(c) {
        if (!c.open || !net.roster[c.peer]) return;
        if (mkM && peerProfileId(c) !== srcM.ownerId) return;
        var v = charViewFor(id, peerProfileId(c));
        try { c.send(v ? { type: 'char', campId: camp.id, char: v } : { type: 'charGone', campId: camp.id, id: id }); } catch (e) { sendFailed(e); }
    });
};
net.syncCharDelta = function(id, values) {   // changed values, filtered to what each peer may see (null = reverted to the default)
    if (!net.active || net.role !== 'host') return;
    if (net.sensesMoved) net.sensesMoved(id);   // before anything turns this away: a change that sends its owner nothing (a kept curse) moves their sight all the same
    if (typeof fxbMoved === 'function') fxbMoved(id);   // conditions C1: the effects on their tokens
    var camp = getActiveCampaign(), S = SC(); if (!camp || !S || !(camp && camp.chars && typeof id === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, id) ? camp.chars[id] : null) || !window.wpSheets) return;
    var view = window.wpSheets.playerSystem(camp); if (!view) return;
    var src = camp.chars[id], probe = { id: id, name: src.name, ownerId: src.ownerId, npc: src.npc, making: src.making, values: {} };   // making (Onboarding F3): charFor itself refuses it to anyone but its owner
    Object.keys(values).forEach(function(f) { probe.values[f] = 0; });
    var libD = fxLib(camp.system), itD = itemLib(camp.system), ownSees = S.charFor(probe, view, src.ownerId, { probe: true }), linesMove = !!ownSees && Object.keys(values).some(function(f) { return ownSees.values[f] !== undefined; });   // any input a teammate's host-worked lines may read
    net.conns.forEach(function(c) {
        if (!c.open || !net.roster[c.peer]) return;
        var pid = peerProfileId(c), allowed = S.charFor(probe, view, pid, { probe: true }); if (!allowed) return;
        if (allowed.partial) {   // a teammate's copy goes whole when anything its lines read changed (a non-hover ST moves "HP 16 / 16")
            if (!linesMove) return;
            var whole = charViewFor(id, pid); if (whole) { try { c.send({ type: 'char', campId: camp.id, char: whole }); } catch (e) { sendFailed(e); } }
            return;
        }
        var fields = Object.keys(values).filter(function(f) { return allowed.values[f] !== undefined; });
        var proj = S.charFor(src, view, pid, { lib: libD, items: itD, full: camp.system }), sub = {};   // 5h: each value as this peer's own projection holds it (effects rows differ per peer)
        fields.forEach(function(f) { if (values[f] === null) sub[f] = null; else if (proj && proj.values[f] !== undefined) sub[f] = proj.values[f]; });   // Stage 6: fail closed — a value with no projection is never sent raw
        var unJ = JSON.stringify((proj && proj.unseen) || []), unK = pid + '|' + id, unMove = (_unseenSent[unK] || '[]') !== unJ;   // F6: the owner's nameless changes (a kept curse, a list they cannot see), sent when they move
        if (!Object.keys(sub).length && !unMove) return;
        var msgD = { type: 'charDelta', campId: camp.id, id: id, values: sub }; if (unMove || unJ !== '[]') msgD.unseen = (proj && proj.unseen) || []; _unseenSent[unK] = unJ;
        try { c.send(msgD); } catch (e) { sendFailed(e); }
    });
};
// [netcheck:chardelta-end]
net.syncCharGone = function(id, only) { if (!net.active || net.role !== 'host') return; var camp = getActiveCampaign(); if (!camp) return; net.conns.forEach(function(c) { if (c.open && net.roster[c.peer] && (!only || peerProfileId(c) === only)) { try { c.send({ type: 'charGone', campId: camp.id, id: id }); } catch (e) { sendFailed(e); } } }); };   // only (Onboarding F3): one player's (a character in the making went)
// Onboarding F3: a character's copy to its owner alone (each connection of theirs) — a character in the making is theirs only
function sendCharTo(pid, id) {
    if (!net.active || net.role !== 'host') return;
    var camp = getActiveCampaign(); if (!camp) return;
    net.conns.forEach(function(c) { if (!c.open || !net.roster[c.peer] || peerProfileId(c) !== pid) return; var v = charViewFor(id, pid); if (v) { try { c.send({ type: 'char', campId: camp.id, char: v }); } catch (e) { sendFailed(e); } } });
}
net.sendCharTo = sendCharTo;
// Onboarding F3 (host): what the GM did with a player's character, to that player — sent back (unlocked to fill in), removed, locked
net.charReview = function(pid, charId, name, outcome, note) {
    if (!net.active || net.role !== 'host' || (outcome !== 'back' && outcome !== 'removed' && outcome !== 'locked' && outcome !== 'invited')) return;
    var m = { type: 'char-review', charId: String(charId), name: cleanCharName(name), outcome: outcome }, nt = String(note || '').replace(/[\u0000-\u001f\u007f\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300); if (nt) m.note = nt;   // the note: text only, 300 at most
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer] && peerProfileId(c) === pid) { try { c.send(m); } catch (e) { sendFailed(e); } } });
};
// A player's edit of their own sheet: applied here at once, judged on the host, undone on a refusal or silence
net.charEdit = function(charId, fieldId, value) {
    var S = SC(), camp = getActiveCampaign();
    if (!S || !camp || !net.active || net.role !== 'client' || net.stream) return { error: 'Not at a table.' };
    if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    if (window.wpVtt && !window.wpVtt.on('sheets')) return { error: 'Character sheets are off here.' };
    var c = (camp && camp.chars && typeof charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, charId) ? camp.chars[charId] : null); if (!c || c.partial || c.npc || !c.ownerId || c.ownerId !== net.myId) return { error: 'That character is not yours.' };   // another PC's hover copy is never edited, not even optimistically
    if (!camp.system) return { error: 'No system at this table.' };
    var res = S.applyEdit(camp.system, c, fieldId, value, window.wpFormula, { player: true });
    if (!res.ok) return { error: res.reason === 'field' ? 'That field cannot be edited.' : 'That value is not allowed.' };
    var rid = 'e' + Math.random().toString(36).slice(2, 10);
    var prev = c.values && Object.prototype.hasOwnProperty.call(c.values, fieldId) ? JSON.parse(JSON.stringify(c.values[fieldId])) : undefined;
    c.values = c.values || {}; c.values[fieldId] = res.value;
    _charPending[rid] = { charId: charId, fieldId: fieldId, value: res.value, prev: prev, timer: setTimeout(function() { charPendingDone(rid, false, 'timeout'); }, S.LIMITS.editTimeoutMs) };
    try { net.conns[0].send({ type: 'char-edit', rid: rid, charId: charId, fieldId: fieldId, value: res.value }); } catch (e) { charPendingDone(rid, false, 'value'); return { error: 'Could not reach the GM.' }; }
    return { ok: true, pending: true };
};
// HUD frame (HF4b): several values of one of our characters at once (a section's Reset all) — ONE message the host judges all-or-nothing (one
// rate token, one answer); applied here at once, every value undone together on a refusal or silence
net.charEdits = function(charId, list) {
    var S = SC(), camp = getActiveCampaign();
    if (!S || !camp || !net.active || net.role !== 'client' || net.stream) return { error: 'Not at a table.' };
    if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    if (window.wpVtt && !window.wpVtt.on('sheets')) return { error: 'Character sheets are off here.' };
    var c = (camp && camp.chars && typeof charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, charId) ? camp.chars[charId] : null); if (!c || c.partial || c.npc || !c.ownerId || c.ownerId !== net.myId) return { error: 'That character is not yours.' };
    if (!camp.system) return { error: 'No system at this table.' };
    if (!Array.isArray(list) || !list.length || list.length > S.LIMITS.editBatch) return { error: 'That change is not allowed.' };
    var work = Object.assign({}, c, { values: JSON.parse(JSON.stringify(c.values || {})) }), batch = [], seen = {};   // judged in order on a working copy, as the host does
    for (var i = 0; i < list.length; i++) {
        var e = list[i]; if (!e || typeof e.fieldId !== 'string' || Object.prototype.hasOwnProperty.call(seen, e.fieldId)) return { error: 'That change is not allowed.' }; seen[e.fieldId] = 1;
        var res = S.applyEdit(camp.system, work, e.fieldId, e.value, window.wpFormula, { player: true });
        if (!res.ok) return { error: res.reason === 'field' ? 'That field cannot be edited.' : 'That value is not allowed.' };
        work.values[e.fieldId] = res.value;
        batch.push({ fieldId: e.fieldId, value: res.value, prev: c.values && Object.prototype.hasOwnProperty.call(c.values, e.fieldId) ? JSON.parse(JSON.stringify(c.values[e.fieldId])) : undefined });
    }
    var rid = 'e' + Math.random().toString(36).slice(2, 10);
    c.values = c.values || {}; batch.forEach(function(b) { c.values[b.fieldId] = b.value; });
    _charPending[rid] = { charId: charId, fieldId: batch[0].fieldId, value: batch[0].value, prev: batch[0].prev, batch: batch, timer: setTimeout(function() { charPendingDone(rid, false, 'timeout'); }, S.LIMITS.editTimeoutMs) };
    try { net.conns[0].send({ type: 'char-edits', rid: rid, charId: charId, values: batch.map(function(b) { return { fieldId: b.fieldId, value: b.value }; }) }); } catch (e2) { charPendingDone(rid, false, 'value'); return { error: 'Could not reach the GM.' }; }
    return { ok: true, pending: true };
};
// Stage 6 HUD H7: a player's press of an apply action on their own character — the host works it out and answers; nothing changes here
// meanwhile (the new values arrive as the host's delta, the card as its record). One at a time per character. { ok, pending } or { error }
net.charApply = function(charId, actId, label, row) {   // row (H7b): { f, r, i } — a list's action on one row, in place of an action id
    var S = SC(), camp = getActiveCampaign();
    if (!S || !camp || !net.active || net.role !== 'client' || net.stream) return { error: 'Not at a table.' };
    if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    if (window.wpVtt && !window.wpVtt.on('sheets')) return { error: 'Character sheets are off here.' };
    var c = (camp && camp.chars && typeof charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, charId) ? camp.chars[charId] : null); if (!c || c.partial || c.npc || !c.ownerId || c.ownerId !== net.myId) return { error: 'That character is not yours.' };
    if (Object.keys(_charPending).some(function(k) { return _charPending[k].apply && _charPending[k].charId === charId; })) return { error: 'Waiting for the GM to apply the last one.' };
    var rid = 'a' + Math.random().toString(36).slice(2, 10), req = { type: 'char-apply', rid: rid, charId: charId }; if (row) req.row = { f: String(row.f), r: String(row.r), i: Number(row.i) }; else req.act = String(actId);
    if (label) req.label = String(label).slice(0, S.LIMITS.label);
    _charPending[rid] = { charId: charId, apply: true, batch: [], timer: setTimeout(function() { charPendingDone(rid, false, 'timeout'); }, S.LIMITS.editTimeoutMs) };   // batch []: nothing to undo on a refusal
    try { net.conns[0].send(req); } catch (e) { clearTimeout(_charPending[rid].timer); delete _charPending[rid]; return { error: 'Could not reach the GM.' }; }
    return { ok: true, pending: true };
};
// Turn-based combat T2 (owner, 2026-09-26): the token whose turn it is on the map in view, when it is this player's own — { mapId, rowId, tok }
// or null (not at a table, turn-based combat off, no combat here, someone else's turn)
net.myTurnTok = function() {
    if (!net.active || net.role !== 'client' || net.stream || !window.wpVtt || !window.wpVtt.on('turns')) return null;
    var camp = getActiveCampaign(), mid = camp && camp.activeItemId, cb = typeof mid === 'string' && net.combats && own(net.combats, mid) ? net.combats[mid] : null, row = cb && Array.isArray(cb.rows) ? cb.rows[cb.turn] : null;
    if (!row || typeof row.tokId !== 'string' || !row.tokId) return null;
    var map = camp.items && own(camp.items, mid) ? camp.items[mid] : null, w = map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return x && x.id === row.tokId; }) : null;
    return w && w.isChar && w.ownerId && w.ownerId === net.myId ? { mapId: mid, rowId: row.id, tok: w } : null;
};
// the player ends their own turn: the host checks the row is still theirs and the one on turn, then steps as the GM's Next turn
net.turnEnd = function() {
    var t = net.myTurnTok(); if (!t) return { error: 'It is not your turn.' };
    if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    try { net.conns[0].send({ type: 'turn-end', mapId: t.mapId, row: t.rowId }); } catch (e) { return { error: 'Could not reach the GM.' }; }
    return { ok: true };
};
// Initiative O3: the player holds their own turn, or acts from their own hold (the host checks the row is theirs and still on turn or held)
net.turnHold = function() {
    var t = net.myTurnTok(); if (!t) return { error: 'It is not your turn.' };
    if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    try { net.conns[0].send({ type: 'turn-hold', mapId: t.mapId, row: t.rowId }); } catch (e) { return { error: 'Could not reach the GM.' }; }
    return { ok: true };
};
net.turnAct = function(rowId) {
    if (!net.active || net.role !== 'client' || typeof rowId !== 'string') return { error: 'Not at the table.' };
    var camp = getActiveCampaign(), mid = camp && camp.activeItemId; if (typeof mid !== 'string') return { error: 'Not at the table.' };
    if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    try { net.conns[0].send({ type: 'turn-act', mapId: mid, row: rowId }); } catch (e) { return { error: 'Could not reach the GM.' }; }
    return { ok: true };
};
// A player's change of a carried list on their own character (Stage 6 F4a: a row op q = { op, defId?, rowId?, qty? }), applied at once, judged on the host.
net.charItem = function(charId, fieldId, q) {
    var S = SC(), camp = getActiveCampaign();
    if (!S || !camp || !net.active || net.role !== 'client' || net.stream) return { error: 'Not at a table.' };
    if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    if (window.wpVtt && !window.wpVtt.on('sheets')) return { error: 'Character sheets are off here.' };
    var c = (camp && camp.chars && typeof charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, charId) ? camp.chars[charId] : null); if (!c || c.partial || c.npc || !c.ownerId || c.ownerId !== net.myId) return { error: 'That character is not yours.' };
    if (!camp.system) return { error: 'No system at this table.' };
    var res = S.applyRowOp(camp.system, c, fieldId, q, window.wpFormula, { player: true, view: camp.system, lib: net.libEntry });   // a player's copy IS the players' view (L3b: a library entry, from what this player fetched)
    if (!res.ok) return { error: res.why === 'key' ? 'That key is already used in this list.' : res.why === 'badkey' ? 'Not a usable key: a letter, then letters, digits and _ (up to 40).' : res.reason === 'field' ? 'That list cannot be changed that way.' : res.reason === 'missing' ? 'That item is gone.' : 'That change is not allowed.' };   // why (F4c3): the local answer's own (a key taken in what they can see, or not a key), never sent
    var rid = 'e' + Math.random().toString(36).slice(2, 10);
    var prev = c.values && Object.prototype.hasOwnProperty.call(c.values, fieldId) ? JSON.parse(JSON.stringify(c.values[fieldId])) : undefined;
    c.values = c.values || {}; c.values[fieldId] = res.value;
    _charPending[rid] = { charId: charId, fieldId: fieldId, value: res.value, prev: prev, kind: 'item', q: JSON.parse(JSON.stringify(q)), timer: setTimeout(function() { charPendingDone(rid, false, 'timeout'); }, S.LIMITS.editTimeoutMs) };   // Stage 6: the op itself, worked out again over a newer host copy
    var mI = { type: 'char-item', rid: rid, charId: charId, fieldId: fieldId, op: q.op };   // only the keys this op uses
    if (q.defId !== undefined) mI.defId = q.defId; if (q.rowId !== undefined) mI.rowId = q.rowId; if (q.qty !== undefined) mI.qty = q.qty; if (q.facts !== undefined) mI.facts = q.facts; if (q.ov !== undefined) mI.ov = q.ov; if (q.def !== undefined) mI.def = q.def;   // facts (F4b): a set op's level, switch, note; ov (F4c2): a copy's own stats (null travels: back to the library); def (F4c3): a custom row's patch
    try { net.conns[0].send(mI); } catch (e) { charPendingDone(rid, false, 'value'); return { error: 'Could not reach the GM.' }; }
    return { ok: true, pending: true, row: res.row, added: res.added, qty: res.qty };   // Stage 6: the row a pickup landed on, how much it added (the Undo), its quantity now
};
// 5h: a player's change to their character's status effects (add from the library, make one, switch, end): applied at once, judged on the host
net.charEffect = function(charId, fieldId, q) {
    var S = SC(), camp = getActiveCampaign();
    if (!S || !camp || !net.active || net.role !== 'client' || net.stream) return { error: 'Not at a table.' };
    if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    if (window.wpVtt && !window.wpVtt.on('sheets')) return { error: 'Character sheets are off here.' };
    var c = (camp && camp.chars && typeof charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, charId) ? camp.chars[charId] : null); if (!c || c.partial || c.npc || !c.ownerId || c.ownerId !== net.myId) return { error: 'That character is not yours.' };
    if (!camp.system) return { error: 'No system at this table.' };
    var res = S.applyEffectOp(camp.system, c, fieldId, q, window.wpFormula, { player: true, view: camp.system, now: Date.now(), timersGm: !!(camp.turnRules && camp.turnRules.timers === 'gm') });   // a player's copy IS the players' view (T5b: the host judges the timer again)
    if (!res.ok) return { error: res.reason === 'field' ? 'That list cannot be changed.' : res.reason === 'missing' ? 'That effect is gone.' : 'That change is not allowed.' };
    var rid = 'e' + Math.random().toString(36).slice(2, 10);
    var prev = c.values && Object.prototype.hasOwnProperty.call(c.values, fieldId) ? JSON.parse(JSON.stringify(c.values[fieldId])) : undefined;
    c.values = c.values || {}; c.values[fieldId] = res.value;
    _charPending[rid] = { charId: charId, fieldId: fieldId, value: res.value, prev: prev, kind: 'fx', q: JSON.parse(JSON.stringify(q)), timer: setTimeout(function() { charPendingDone(rid, false, 'timeout'); }, S.LIMITS.editTimeoutMs) };
    var m = { type: 'char-effect', rid: rid, charId: charId, fieldId: fieldId, op: q.op };   // only the keys this op uses
    if (q.op === 'adhoc') m.row = q.row; else m.rowId = q.rowId;
    if (q.op === 'add') m.ref = q.ref; if (q.op === 'on') m.on = q.on === true; if (q.op === 'timer') m.act = String(q.act);   // T5b
    try { net.conns[0].send(m); } catch (e) { charPendingDone(rid, false, 'value'); return { error: 'Could not reach the GM.' }; }
    return { ok: true, pending: true };
};
// Stage 6 U2: a player sends their own character's sheet file to the GM as proposed changes (the host works them out on its full system
// and library and keeps them for the GM; under the system's setting B their own row facts apply at once). done({ n, auto } | { error })
var _uploadPending = {};
net.charUpload = function(charId, sheet, done) {
    var S = SC(), camp = getActiveCampaign();
    if (!S || !camp || !net.active || net.role !== 'client' || net.stream) return { error: 'Not at a table.' };
    if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    if (window.wpVtt && !window.wpVtt.on('sheets')) return { error: 'Character sheets are off here.' };
    var c = (camp && camp.chars && typeof charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, charId) ? camp.chars[charId] : null); if (!c || c.partial || c.npc || !c.ownerId || c.ownerId !== net.myId) return { error: 'That character is not yours.' };
    var m = S.cleanCharUpload({ rid: 'e' + Math.random().toString(36).slice(2, 10), charId: charId, sheet: sheet }); if (!m) return { error: 'That file is too large, or not a sheet.' };
    _uploadPending[m.rid] = { done: done, timer: setTimeout(function() { var p = _uploadPending[m.rid]; delete _uploadPending[m.rid]; if (p && typeof p.done === 'function') p.done({ error: 'No answer from the GM.' }); }, 20000) };
    try { net.conns[0].send({ type: 'char-upload', rid: m.rid, charId: m.charId, sheet: m.sheet }); } catch (e) { clearTimeout(_uploadPending[m.rid].timer); delete _uploadPending[m.rid]; return { error: 'Could not reach the GM.' }; }
    return { ok: true, pending: true };
};
// U2: the host tells a character's owner what the GM did with their upload (applied so many of so many)
net.uploadDone = function(charId, done, of) {
    if (!net.active || net.role !== 'host') return;
    var camp = getActiveCampaign(), ch = (camp && camp.chars && typeof charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, charId) ? camp.chars[charId] : null); if (!ch || !ch.ownerId) return;
    net.conns.forEach(function(c) { var p = net.roster[c.peer]; if (c.open && p && p.id === ch.ownerId) { try { c.send({ type: 'char-upload-done', charId: charId, done: Math.max(0, done | 0), of: Math.max(0, of | 0) }); } catch (e) { sendFailed(e); } } });
};
// A player throws an item from their sheet: the host validates ownership + the carried item and places/shares the blast
// (the thrower sees nothing until the host's broadcast returns — no optimistic placement, the host is the authority).
net.throwReq = function(charId, fieldId, rowId, x, y, mapId) {
    if (!net.active || net.role !== 'client' || net.stream) return { error: 'Not at a table.' };
    if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    try { net.conns[0].send({ type: 'throw-req', charId: charId, fieldId: fieldId, rowId: rowId, x: Number(x), y: Number(y), mapId: mapId }); } catch (e) { return { error: 'Could not reach the GM.' }; }
    return { ok: true };
};
// A player requests opening/closing a door their token is next to; the host validates and resyncs (no optimistic change).
net.doorReq = function(mapId, itemId) {
    if (!net.active || net.role !== 'client' || net.stream) return { error: 'Not at a table.' };
    if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    try { net.conns[0].send({ type: 'door-req', mapId: mapId, itemId: itemId }); } catch (e) { return { error: 'Could not reach the GM.' }; }
    return { ok: true };
};
// [netcheck:pending-start]
function charPendingDone(rid, ok, reason, msg) {
    var p = _charPending[rid]; if (!p) return; clearTimeout(p.timer); delete _charPending[rid];
    if (!ok) {   // Stage 6: back to the host's last copy (never the one this change was made on), the changes still waiting laid over it again
        var camp = getActiveCampaign(), c = (camp && camp.chars && typeof p.charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, p.charId) ? camp.chars[p.charId] : null), b = Object.prototype.hasOwnProperty.call(_charHost, p.charId) ? _charHost[p.charId] : null;
        if (c) {
            c.values = c.values || {};
            (p.batch || [{ fieldId: p.fieldId, prev: p.prev }]).forEach(function(q) {   // HUD frame (HF4b): a batch goes back whole
                var back = b ? (Object.prototype.hasOwnProperty.call(b, q.fieldId) ? b[q.fieldId] : undefined) : q.prev;
                if (back === undefined) delete c.values[q.fieldId]; else c.values[q.fieldId] = JSON.parse(JSON.stringify(back));
            });
            reapplyPending(p.charId);
        }
    }
    if (window.wpSheets) { if (ok) window.wpSheets.charChanged(p.charId); else window.wpSheets.editResult(rid, false, reason, msg, p.apply ? 'apply' : p.q ? p.q.op : ''); }
    if (ok && msg) toast(msg);   // Stage 6: a cursed item's message as it leaves the sheet
}
// The changes still waiting for the host, laid over the character again (a new host copy arrived, or one change was refused): each field an
// item or effects change is waiting on starts again from the host's copy and those changes are worked out on it in order (Stage 6 — never on
// top of their own earlier result: a pickup into a stack is not idempotent); a value goes back as it was sent
function reapplyPending(charId) {
    var camp = getActiveCampaign(), c = (camp && camp.chars && typeof charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, charId) ? camp.chars[charId] : null), S = SC(), b = Object.prototype.hasOwnProperty.call(_charHost, charId) ? _charHost[charId] : null; if (!c) return;
    c.values = c.values || {};
    var mine = Object.keys(_charPending).filter(function(rid) { return _charPending[rid].charId === charId; });
    if (b) mine.forEach(function(rid) { var p = _charPending[rid]; if (!p.q) return; if (Object.prototype.hasOwnProperty.call(b, p.fieldId)) c.values[p.fieldId] = JSON.parse(JSON.stringify(b[p.fieldId])); else delete c.values[p.fieldId]; });
    mine.forEach(function(rid) {
        var p = _charPending[rid];
        if (p.q && S && camp.system && b) {
            var o = { player: true, view: camp.system, lib: net.libEntry }, r = p.kind === 'fx' ? S.applyEffectOp(camp.system, c, p.fieldId, p.q, window.wpFormula, o) : S.applyRowOp(camp.system, c, p.fieldId, p.q, window.wpFormula, o);
            if (r && r.ok) c.values[p.fieldId] = r.value;
            return;
        }
        if (p.batch) p.batch.forEach(function(q) { c.values[q.fieldId] = q.value; }); else c.values[p.fieldId] = p.value;   // HF4b: every value of a batch still waiting
    });
}
function noteHostCopy(id, values) { _charHost[id] = JSON.parse(JSON.stringify(values || {})); }   // Stage 6: what the host last said this character holds
// [netcheck:pending-end]
// A session is exactly one campaign. Anything that would put another campaign on screen while hosting
// asks first, and on yes ends the session for everyone before going ahead; Cancel and Esc do nothing.
// onCancel lets a picker put its selection back.
net.guardCampaignSwitch = function(fn, onCancel) {
    if (!(net.active && net.role === 'host')) { fn(); return; }
    showConfirm('Switching campaigns ends the session — everyone at the table is disconnected. End the session and switch?', function(yes) {
        if (!yes) { if (onCancel) onCancel(); return; }
        leaveSession(false);
        var nm = ui('netModal'); if (nm) nm.style.display = 'none';
        fn();
    });
};
window.wpConfirmCampaignSwitch = net.guardCampaignSwitch;

// Travel lock: no map crossings for players while it is on; everything else stays live
// Session log: what happened at the table, on the campaign (GM data). Saved with the next save.
function logEvent(kind, text) {
    if (net.role === 'client') return;
    var camp = getActiveCampaign(); if (!camp) return;
    camp.sessionLog = camp.sessionLog || [];
    camp.sessionLog.push({ at: Date.now(), kind: kind, text: String(text || '').slice(0, 400) });
    if (camp.sessionLog.length > 3000) camp.sessionLog.splice(0, camp.sessionLog.length - 3000);
}
// [netcheck:snapsync-start]
// The snap rule (the owner, 2026-09-29): the GM's Snap decides where a player's drop lands (datamap.js wpSeatDrop, on their app and on the
// host). The join snapshot carries it; a change goes to admitted players the moment Snap or its mode changes, only when what the table plays
// changed (on: Snap on, to the grid or to both). A host has no branch for 'snap'
net.tableSnapOn = false; net._lastSnapSent = null;
net.syncSnap = function() {
    if (!net.active || net.role !== 'host') return;
    var on = typeof window.wpSnapOn === 'function' && window.wpSnapOn() === true;
    if (on === net._lastSnapSent) return;
    net._lastSnapSent = on;
    net.conns.forEach(function(c) { if (c.open && own(net.roster, c.peer)) { try { c.send({ type: 'snap', on: on }); } catch (e) { sendFailed(e); } } });
};
// [netcheck:snapsync-end]
net.travelLocked = false;
function setTravelLockLocal(on) {
    net.travelLocked = !!on;
    var btn = ui('netTravelLockBtn');
    if (btn) { btn.innerHTML = net.travelLocked ? '&#128275; Allow Travel Between Maps' : '&#128274; Lock Travel Between Maps'; btn.classList.toggle('paused', net.travelLocked); }
    var hint = ui('travelLockBanner');
    if (hint) hint.style.display = (net.travelLocked && net.role === 'client' && net.active) ? 'block' : 'none';
}
var _travelLockBtn = ui('netTravelLockBtn');
if (_travelLockBtn) _travelLockBtn.addEventListener('click', function() {
    if (!net.active || net.role !== 'host') return;
    setTravelLockLocal(!net.travelLocked);
    broadcast({ type: 'travelLock', on: net.travelLocked }, null);
    toast(net.travelLocked ? 'Travel locked — players stay on their maps. The table is still live.' : 'Travel allowed again.');
    logEvent('table', net.travelLocked ? 'Travel between maps locked' : 'Travel between maps allowed');
});
var _travelDenyLast = {};
var _pauseBtn = ui('netPauseBtn');
if (_pauseBtn) _pauseBtn.addEventListener('click', function() {
    if (!net.active || net.role !== 'host') return;
    setPausedLocal(!net.paused);
    broadcast({ type: 'pause', on: net.paused }, null);
    toast(net.paused ? 'Table paused — players are frozen (chat stays open).' : 'Table resumed.');
    logEvent('table', net.paused ? 'Table paused' : 'Table resumed');
});
// The header pause button (host-only, both views) drives the same table toggle as #netPauseBtn.
var _sessPauseBtn = ui('sessionPauseBtn');
if (_sessPauseBtn) _sessPauseBtn.addEventListener('click', function() { if (net.active && net.role === 'host' && _pauseBtn) _pauseBtn.click(); });

/* ---------- live position streaming ----------
   Drags send tiny {type:'pos'} messages (throttled) so remote tokens glide
   instead of jumping at drag end. The final message persists on the host. */
var _posLast = 0;

// Fog of war (1.5.0 FV2): a token's live position reaches a player only when they own the token or can see its cell.
// Non-fog maps take the plain single broadcast (byte-identical to before). canSeePoint uses a cached revealed set that is
// stable during a drag (the recipient's own tokens are still), so this stays cheap; a creature entering vision is fully
// revealed on the drag's stop (sendItem), not mid-drag.
// [netcheck:bpos-start]
function broadcastPos(msg, exceptConn, camp, map, w) {
    if (w && (w.gmNoteFor || w.hidden)) return;   // a GM-note card and a hidden piece never reach a player (wireWbItem drops them), so neither does their place while the GM drags them
    if (!map || !mapFogged(map)) { broadcast(msg, exceptConn); return; }
    var cx = (msg.x || 0) + ((w && w.w) || 60) / 2, cy = (msg.y || 0) + ((w && w.h) || 52) / 2;
    net.conns.forEach(function(c) {
        if (c === exceptConn || !c.open) return;
        var pr = net.roster[c.peer]; if (!pr) return;
        if ((w && w.ownerId === pr.id) || (window.wpFog && window.wpFog.canSeePoint(pr.id, camp, map, cx, cy))) { try { c.send(msg); } catch (e) { sendFailed(e); } }
    });
}
// [netcheck:bpos-end]
net.streamPos = function(wItem, final, mapId) {   // fold M8: mapId, the map a gesture began on (else the one on screen)
    if (!net.active || !wItem) return;
    if ((net.paused || net.selfPaused) && net.role === 'client') return;
    var camp = getActiveCampaign();
    if (!camp) return;
    var now = Date.now();
    if (!final && now - _posLast < 45) return;
    _posLast = now;
    var onMap = typeof mapId === 'string' ? mapId : camp.activeItemId;
    var msg = { type: 'pos', campId: camp.id, itemId: onMap, wbId: wItem.id, x: wItem.x, y: wItem.y, rot: wItem.rot || 0, front: wItem.front || 0, final: !!final };
    if (net.role === 'host') broadcastPos(msg, null, camp, Object.prototype.hasOwnProperty.call(camp.items || {}, onMap) ? camp.items[onMap] : null, wItem);
    else if (net.conns[0] && net.conns[0].open) {
        if (msg.final && typeof actNext === 'function') { msg.a = actNext(); actNote('final', onMap, { id: msg.wbId, x: msg.x, y: msg.y, rot: msg.rot, front: msg.front }, msg.a); }   // 14c: numbered, and what it set kept until a copy goes that far
        try { net.conns[0].send(msg); } catch (e) { sendFailed(e); }
    }
};

// Fold M8: a player's app asks its host for one map whole (a drag that began on a map the table has since left)
net.needItem = function(campId, itemId) {
    if (!net.active || net.role !== 'client' || typeof campId !== 'string' || typeof itemId !== 'string') return;
    var c0 = net.conns[0]; if (c0 && c0.open) { try { c0.send({ type: 'needItem', campId: campId, itemId: itemId }); } catch (e) { sendFailed(e); } }
};
// Fast path: move the DOM node directly, no full re-render per frame.
function applyPosToDom(msg) {
    var camp = getActiveCampaign();
    if (!camp || camp.id !== msg.campId || camp.activeItemId !== msg.itemId || state.viewMode !== 'visual') return;
    var el = state.wbEls && state.wbEls[msg.wbId];
    if (!el) return;
    el.style.left = msg.x + 'px';
    el.style.top = msg.y + 'px';
    el.style.transform = msg.rot ? 'rotate(' + msg.rot + 'deg)' : 'none';
    var fwP = el.querySelector(':scope > .token-front');
    if (fwP) fwP.style.transform = msg.front ? 'rotate(' + msg.front + 'deg)' : '';
}

/* Host: send a player through a portal. Validates that the portal is a visible
   item on their current map, linked to a room with a warp target; then moves
   their location, spawns/adopts their token on the far side, and tells only
   that player to change map. Returns true when the travel happened. */
function hostTravel(conn, traveler, portal, fromMap) {
    var tCamp = getActiveCampaign();
    if (!traveler || !tCamp || !fromMap || !portal) return false;
    if ((portal.hidden && !portal.trap) || !(portal.nodeId || portal.targetMapId)) return false;   // a hidden decorative portal stays inert; a hidden TRAP still fires (the locks below still stop it, in silence)
    var quiet = !!portal.hidden;   // hidden pieces (owner, 2026-10-01): a trap tile that cannot fire tells its player nothing — a denial would give its place, and its destination's name, away; the GM is told instead
    if (net.travelLocked) {
        var k = traveler.id || 'x', now = Date.now();
        if (quiet) toast((traveler.name || 'A player') + ' stepped on a hidden trap tile, but travel is locked: nothing happened, and they were told nothing.');
        else if (conn && now - (_travelDenyLast[k] || 0) > 4000) { _travelDenyLast[k] = now; try { conn.send({ type: 'travelDenied' }); } catch (e) { sendFailed(e); } }
        return false;
    }
    // The item's own portal target, else its linked room's
    var pRoom = portal.targetMapId ? { targetMapId: portal.targetMapId } : (fromMap.rooms || []).find(function(r) { return r.id === portal.nodeId; });
    if (!pRoom || !validKey(pRoom.targetMapId) || !own(tCamp.items, pRoom.targetMapId)) return false;
    var destLockM = tCamp.items[pRoom.targetMapId];
    if (destLockM.type !== 'map' || destLockM === fromMap) return false;   // a play map, and another one (as offlinePlayerTravel and npcTravel have it): a portal to a page, or to the map it stands on, moves nobody
    if (destLockM.meta && destLockM.meta.playerLock) {   // closed to players until the GM opens it (summon and bring still work)
        var kL = (traveler.id || 'x') + '|' + pRoom.targetMapId, nowL = Date.now();
        if (quiet) toast((traveler.name || 'A player') + ' stepped on a hidden trap tile to ' + String((destLockM.meta || {}).title || 'a closed map').slice(0, 120) + ', which is closed to players: nothing happened, and they were told nothing.');
        else if (conn && nowL - (_travelDenyLast[kL] || 0) > 4000) { _travelDenyLast[kL] = nowL; try { conn.send({ type: 'travelDenied', reason: 'closed', map: String((destLockM.meta || {}).title || '').slice(0, 120) }); } catch (e) { sendFailed(e); } }
        return false;
    }
    var destMap = tCamp.items[pRoom.targetMapId];
    var landSrc = portal.targetMapId ? { id: null, name: portal.name, targetRoomId: portal.targetRoomId } : pRoom;
    var landRoom = findLandingRoom(landSrc, destMap);
    if (window.wpHistFlush) window.wpHistFlush();   // the GM's pending edit is its own step before either map is written for the player
    traveler.location = pRoom.targetMapId;
    traveler.detached = true;
    renderRoster();
    var mineF = (fromMap.whiteboard || []).filter(function(w) { return w.isChar && w.ownerId === traveler.id; });
    var left = mineF.find(function(w) { return portalUnder(w, fromMap) === portal; }) || mineF.find(function(w) { return w.charId; }) || mineF[0];   // the token on the portal steps off (not a pet beside it)
    if (left) { stepOffPortal(left, portal, fromMap); net.broadcastItemFiltered(tCamp.id, fromMap.id); }
    if (left) { net.applyingRemote = true; save(true); net.applyingRemote = false; }   // the step-off reaches disk now, not on the GM's next save
    ensurePlayerToken(traveler.id, pRoom.targetMapId, landRoom && landRoom.id);
    // a token already on the destination stays where the GM left it, unless it is still on the landing node
    var landPtD = landRoom && landingPoint(destMap, landRoom), nodeEl = landPtD && landPtD.wbItemId ? (destMap.whiteboard || []).find(function(o) { return o.id === landPtD.wbItemId; }) : null;
    var mineDA = nodeEl ? (destMap.whiteboard || []).filter(function(w) { return w.isChar && w.ownerId === traveler.id; }) : [], mineD = mineDA.find(function(w) { return w.charId; }) || mineDA[0];
    if (mineD && mineD.x < nodeEl.x + (nodeEl.w || 0) && mineD.x + (mineD.w || 60) > nodeEl.x && mineD.y < nodeEl.y + (nodeEl.h || 0) && mineD.y + (mineD.h || 52) > nodeEl.y) {
        var spotD = freeSpotNear(destMap, landPtD.wbX, landPtD.wbY, mineD.w || 60, mineD.h || 52, mineD.id, nodeEl);
        mineD.x = spotD.x; mineD.y = spotD.y;
        if (window.wpSeatHex) window.wpSeatHex(mineD, destMap);
        net.applyingRemote = true; save(true); net.applyingRemote = false;
        net.broadcastItemFiltered(tCamp.id, destMap.id);
    }
    if (window.wpHistBarrier) window.wpHistBarrier([fromMap.id, destMap.id]);   // a move between two maps: neither side can be undone past it
    broadcastRoster();
    if (conn) { try { conn.send({ type: 'stage', personal: true, stage: { campId: tCamp.id, itemId: pRoom.targetMapId, landRoomId: landRoom ? landRoom.id : null } }); } catch (e) { sendFailed(e); } }
    var destTitle = (tCamp.items[pRoom.targetMapId].meta || {}).title || pRoom.targetMapId;
    toast((traveler.name || 'A player') + ' traveled to ' + destTitle + '.');
    logEvent('travel', (traveler.name || 'A player') + ' traveled to ' + destTitle + (pRoom && pRoom.name ? ' via ' + pRoom.name : ''));
    return true;
}

// The portal item under a token's center, if any (visible, room-linked, warp target set)
// A free top-left for a w×h token near (cx, cy): spiral outwards until it overlaps no other
// character token (and, when given, stays off the portal's footprint).
function freeSpotNear(map, cx, cy, w, h, avoidId, portal) {
    var others = (map.whiteboard || []).filter(function(o) { return (o.isChar || o.waiting) && o.id !== avoidId; });   // Onboarding F1a: a waiting token holds its spot too
    var sq = !!(map && map.meta && map.meta.gridType === 'square');   // grid-shaped tokens: a square grid seats in its 50 px cells
    function seated(x, y) {   // where a token placed at (x, y) ends up after seating on this map (a hex cell, a square cell)
        if (sq) return Math.max(w, h) <= 64 ? { x: Math.floor((x + w / 2) / 50) * 50 + 25 - w / 2, y: Math.floor((y + h / 2) / 50) * 50 + 25 - h / 2 } : { x: Math.round(x / 50) * 50, y: Math.round(y / 50) * 50 };   // one cell: centred; sized up: its corner on the lattice
        if (!window.wpSeatHex) return { x: x, y: y };
        var tmp = { x: x, y: y, w: w, h: h, isChar: true };
        window.wpSeatHex(tmp, map);
        return { x: tmp.x, y: tmp.y };
    }
    function clashes(x, y) {
        if (portal && x < portal.x + (portal.w || 0) && x + w > portal.x && y < portal.y + (portal.h || 0) && y + h > portal.y) return true;
        return others.some(function(o) { return x < o.x + (o.w || 0) && x + w > o.x && y < o.y + (o.h || 0) && y + h > o.y; });
    }
    var step = sq ? Math.ceil(Math.max(w, h) / 50) * 50 : Math.max(w, h) + 8, x0 = cx - w / 2, y0 = cy - h / 2, tried = {};   // on a square grid a step is whole cells (no cell skipped)
    var first = seated(x0, y0);
    if (!clashes(first.x, first.y)) return first;
    for (var ring = 1; ring <= 8; ring++) {
        for (var dy = -ring; dy <= ring; dy++) for (var dx = -ring; dx <= ring; dx++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            var p = seated(x0 + dx * step, y0 + dy * step), k = Math.round(p.x) + ',' + Math.round(p.y);
            if (tried[k]) continue; tried[k] = true;
            if (!clashes(p.x, p.y)) return p;
        }
    }
    return first;
}
// The token left behind steps off the portal so the next crossing is not blocked
function stepOffPortal(item, portal, map) {
    if (!item || !portal || !map) return;
    var w = item.w || 60, h = item.h || 52;
    var cx = portal.x + (portal.w || 0) / 2, cy = portal.y + (portal.h || 0) + h / 2 + 12;   // just below the portal
    var p = freeSpotNear(map, cx, cy, w, h, item.id, portal);
    item.x = p.x; item.y = p.y;
    if (window.wpSeatHex) window.wpSeatHex(item, map);
}
function portalUnder(item, map) {
    if (!item || !map || !map.whiteboard) return null;
    var cx = item.x + (item.w || 0) / 2, cy = item.y + (item.h || 0) / 2, iw = item.w || 60, ih = item.h || 52;
    var best = null, bestArea = Infinity;
    map.whiteboard.forEach(function(o) {
        if (o.id === item.id || !(o.nodeId || o.targetMapId) || (o.hidden && !o.trap)) return;   // a hidden TRAP portal still catches a token that lands on it
        var ow = o.w || 0, oh = o.h || 0;
        // resting on the portal: the token's centre inside it, or at least a third of the token overlapping it
        // (hex seating can park the centre a few pixels outside a tile that is not hex-aligned)
        var inside = !(cx < o.x || cx > o.x + ow || cy < o.y || cy > o.y + oh);
        var ovW = Math.min(item.x + iw, o.x + ow) - Math.max(item.x, o.x), ovH = Math.min(item.y + ih, o.y + oh) - Math.max(item.y, o.y);
        var frac = (ovW > 0 && ovH > 0) ? (ovW * ovH) / (iw * ih) : 0;
        if (!inside && frac < 0.34) return;
        if (!o.targetMapId) {
            var room = (map.rooms || []).find(function(r) { return r.id === o.nodeId; });
            if (!room || !room.targetMapId) return;
        }
        if (ow * oh < bestArea) { bestArea = ow * oh; best = o; }
    });
    return best;
}

/* Dropping a player's token onto a portal sends that player through — no
   double-click needed. Called by the host for its own drops (a GM can push a
   player's token through a door) and for player drops arriving over the wire. */
net.tokenDropped = function(item, map) {
    if (!item || !item.isChar || !map) return false;
    if (!item.ownerId) return npcTravel(item, map);                                   // an NPC: the GM's own token, moves through
    var atTable = net.active && net.role === 'host' && Object.keys(net.roster).some(function(k) { return net.roster[k] && net.roster[k].id === item.ownerId; });
    if (!atTable) return offlinePlayerTravel(item, map);                             // between sessions, or the player is not connected: the GM walks their character through
    if (net.paused || pausedById(item.ownerId)) return false;
    var portal = portalUnder(item, map);
    if (!portal) return false;
    var peerId = Object.keys(net.roster).find(function(k) { return net.roster[k] && net.roster[k].id === item.ownerId; });
    if (!peerId) return false;
    var conn = net.conns.find(function(c) { return c.peer === peerId; });
    return hostTravel(conn, net.roster[peerId], portal, map);
};

// The GM walks a player's character through a portal without that player at the table: their
// copy on the destination map is placed (or nudged off the landing node), the source steps off.
function offlinePlayerTravel(item, map) {
    if (net.active && net.role === 'client') return false;
    var portal = portalUnder(item, map); if (!portal) return false;
    var camp = getActiveCampaign(); if (!camp) return false;
    var pRoom = portal.targetMapId ? { targetMapId: portal.targetMapId } : (map.rooms || []).find(function(r) { return r.id === portal.nodeId; });
    if (!pRoom || !pRoom.targetMapId || !camp.items[pRoom.targetMapId]) return false;
    var dest = camp.items[pRoom.targetMapId]; if (dest.type !== 'map' || dest === map) return false;
    var landSrc = portal.targetMapId ? { id: null, name: portal.name, targetRoomId: portal.targetRoomId } : pRoom;
    var landRoom = findLandingRoom(landSrc, dest), landPt = landRoom && landingPoint(dest, landRoom);
    var sx = (landPt && landPt.wbX != null) ? landPt.wbX : ((dest.meta || {}).homeX || 15000);
    var sy = (landPt && landPt.wbY != null) ? landPt.wbY : ((dest.meta || {}).homeY || 15000);
    var nodeEl = landPt && landPt.wbItemId ? (dest.whiteboard || []).find(function(o) { return o.id === landPt.wbItemId; }) : null;
    if (window.wpHistFlush) window.wpHistFlush();   // pending GM typing becomes its own step before the two maps are written
    dest.whiteboard = dest.whiteboard || [];
    // the one resolver (their token there, else an unowned one of their character, else a copy of the dragged token), then the chooser
    var S = SC(), act = S && S.activeCharOf ? S.activeCharOf(camp, item.ownerId).id : null, other = !!act && item.charId !== act;   // a pet, a mount or (sheets off) another of their characters: THAT token travels
    var src = other ? { op: 'none' } : S && S.tokenSourceFor ? S.tokenSourceFor(camp, item.ownerId, dest.id, { prefer: item, noSpawn: !sheetsOnFor(camp) }) : { op: 'none' }, mine = null, placed = false;
    if (other) mine = dest.whiteboard.find(function(w) { return w && w.isChar && w.ownerId === item.ownerId && (item.charId ? w.charId === item.charId : (!w.charId && w.charName === item.charName)); }) || null;
    else if (src.op === 'keep') mine = src.tok;
    else if (src.op === 'adopt' || (src.op === 'link' && src.here)) { mine = src.tok; mine.ownerId = item.ownerId; if (src.charId) mine.charId = src.charId; }
    if (!mine) {
        mine = src.op === 'spawn' && camp.chars && own(camp.chars, src.charId) ? tokenFromChar(camp.chars[src.charId], item.ownerId) : JSON.parse(JSON.stringify(src.op === 'clone' || src.op === 'link' ? src.tok : item));
        mine.id = 'wb' + Math.random().toString(36).slice(2, 10);
        mine.ownerId = item.ownerId; if ((src.op === 'clone' || src.op === 'link') && src.charId) mine.charId = src.charId;   // never stamps the character onto a copy of a pet
        delete mine.threats;   // 5h: threat marks belong to the map they were set on
        delete mine.hidden;
        var Sd = SC(); if (Sd && Sd.shapeStandIn) Sd.shapeStandIn(mine, dest);   // grid-shaped tokens: it comes in in the destination's cell shape
        var spot = freeSpotNear(dest, sx, sy, mine.w || 60, mine.h || 52, null, nodeEl);
        mine.x = spot.x; mine.y = spot.y;
        dest.whiteboard.push(mine); placed = true;
    } else if (nodeEl && mine.x < nodeEl.x + (nodeEl.w || 0) && mine.x + (mine.w || 60) > nodeEl.x && mine.y < nodeEl.y + (nodeEl.h || 0) && mine.y + (mine.h || 52) > nodeEl.y) {
        var spot2 = freeSpotNear(dest, sx, sy, mine.w || 60, mine.h || 52, mine.id, nodeEl);
        mine.x = spot2.x; mine.y = spot2.y;
    }
    if (S && S.ownedTokenPlan) S.applyOwnerOps(camp, S.ownedTokenPlan(camp, { keep: mine.id, mapId: dest.id, all: !sheetsOnFor(camp) }));   // one owned token of the character there
    stepOffPortal(item, portal, map);
    if (window.wpHistBarrier) window.wpHistBarrier([map.id, dest.id]);   // a move between two maps: neither side can be undone past it
    net.applyingRemote = true; save(true); net.applyingRemote = false;
    if (net.active && net.role === 'host') [map, dest].forEach(function(m) { net.broadcastItemFiltered(camp.id, m.id); });
    if (window.appRender) window.appRender();
    var who = (camp.players || {})[item.ownerId], nm = item.charName || (who && who.name) || 'The character';
    toast(nm + ' goes through to ' + ((dest.meta || {}).title || 'the next map') + (placed ? ' — their token waits there.' : ' — their token there stays where it was.'));
    return true;
}
// An NPC token dropped on a portal moves to the destination map (it has no per-map copies)
function npcTravel(item, map) {
    if (net.active && net.role === 'client') return false;
    var portal = portalUnder(item, map); if (!portal) return false;
    var camp = getActiveCampaign(); if (!camp) return false;
    var pRoom = portal.targetMapId ? { targetMapId: portal.targetMapId } : (map.rooms || []).find(function(r) { return r.id === portal.nodeId; });
    if (!pRoom || !pRoom.targetMapId || !camp.items[pRoom.targetMapId]) return false;
    var dest = camp.items[pRoom.targetMapId]; if (dest.type !== 'map' || dest === map) return false;
    var landSrc = portal.targetMapId ? { id: null, name: portal.name, targetRoomId: portal.targetRoomId } : pRoom;
    var landRoom = findLandingRoom(landSrc, dest), landPt = landRoom && landingPoint(dest, landRoom);
    var sx = (landPt && landPt.wbX != null) ? landPt.wbX : ((dest.meta || {}).homeX || 15000);
    var sy = (landPt && landPt.wbY != null) ? landPt.wbY : ((dest.meta || {}).homeY || 15000);
    var nodeEl = landPt && landPt.wbItemId ? (dest.whiteboard || []).find(function(o) { return o.id === landPt.wbItemId; }) : null;
    if (window.wpHistFlush) window.wpHistFlush();   // pending GM typing becomes its own step before the two maps are written
    dest.whiteboard = dest.whiteboard || [];
    var key = item.charName || '';
    var there = key ? dest.whiteboard.find(function(w) { return w.isChar && !w.ownerId && w.charName === key; }) : null, placed = false;
    if (!there) {
        there = JSON.parse(JSON.stringify(item));
        there.id = 'wb' + Math.random().toString(36).slice(2, 10);
        delete there.threats;   // 5h: threat marks belong to the map they were set on
        if (!item.hidden) delete there.hidden;   // hidden pieces (owner, 2026-10-01): a creature the GM walks through hidden arrives hidden (the copy came with the mark); players see nothing of it on either map
        var Sn = SC(); if (Sn && Sn.shapeStandIn) Sn.shapeStandIn(there, dest);   // grid-shaped tokens: the copy takes the destination's cell shape
        var spot = freeSpotNear(dest, sx, sy, there.w || 60, there.h || 52, null, nodeEl);
        there.x = spot.x; there.y = spot.y;
        dest.whiteboard.push(there); placed = true;
    } else {
        if (!item.hidden) delete there.hidden;   // the character is there now: players may see it — unless the GM walked it through hidden; then the one there stays hidden too
        if (nodeEl && there.x < nodeEl.x + (nodeEl.w || 0) && there.x + (there.w || 60) > nodeEl.x && there.y < nodeEl.y + (nodeEl.h || 0) && there.y + (there.h || 52) > nodeEl.y) {
            var spot2 = freeSpotNear(dest, sx, sy, there.w || 60, there.h || 52, there.id, nodeEl);
            there.x = spot2.x; there.y = spot2.y;
        }
    }
    // the token left behind stays in its room, off the portal, out of the players' sight
    stepOffPortal(item, portal, map);
    item.hidden = true;
    if (window.wpHistBarrier) window.wpHistBarrier([map.id, dest.id]);   // a move between two maps: neither side can be undone past it
    net.applyingRemote = true; save(true); net.applyingRemote = false;
    if (net.active && net.role === 'host') [map, dest].forEach(function(m) { net.broadcastItemFiltered(camp.id, m.id); });
    if (window.appRender) window.appRender();
    var hidThere = !!there.hidden;
    toast((key || 'The character') + ' goes through to ' + ((dest.meta || {}).title || 'the next map') + (placed ? (hidThere ? ' — a token is placed there, hidden as this one was' : ' — a token is placed there') : (hidThere ? ' — the token there stays hidden' : ' — the token there is shown')) + '; the one here is hidden from players.');
    return true;
}
// [netcheck:pos-start]
function handlePos(msg, conn) {
    if (typeof msg.wbId !== 'string') return;
    var camp = campOf(msg.campId);
    var map = (camp && validKey(msg.itemId)) ? camp.items[msg.itemId] : null;
    if (!map || map.type !== 'map') return;
    var w = (map.whiteboard || []).find(function(x) { return x.id === msg.wbId; });
    if (!w) return;
    if (net.role === 'host') {
        var aIn = msg.a;   // 14c: this move's number, taken once it has been handled (the message is rebuilt below)
        try {
        if (net.paused || peerPaused(conn.peer)) return;   // frozen table (or this player is paused): client motion is dropped
        var pr = net.roster[conn.peer];
        if (!pr || w.ownerId !== pr.id) return;   // same ownership rule as full patches
        if (w.hidden || !(w.isChar || w.waiting) || (typeof pr.location === 'string' && msg.itemId !== pr.location)) return;   // the same Hide rule as patches (a final pos used to fire travel and room handouts), a character token only, on the map they are on
        msg.final = msg.final === true;   // one reading of final everywhere below (handouts and seating used to take any truthy value)
        if (w.locked) return;   // and the same lock rule: a token the GM locked is frozen for its player
        // ~60 moves a second is a drag; more is a flood. Fold M9: a final has its own limiter with no spacing, so a drop is never lost to the 8 ms
        // spacing of the drag's last move, nor one token's drop to another's in the same gesture; 240 in 4 s is the Facing dial held at the
        // system's key repeat (about 120) with room for a drop of several of their tokens
        if (!allow(msg.final ? 'posFinal' : 'pos', msg.final ? { perMs: 0, burst: 240, windowMs: 4000, table: 20000 } : { perMs: 8, burst: 240, windowMs: 4000, table: 20000 }, conn.peer)) return;
        var px = Number(msg.x), py = Number(msg.y), prot = Number(msg.rot || 0), pfr = Number(msg.front || 0);
        if (!isFinite(px) || !isFinite(py) || !isFinite(prot) || !isFinite(pfr)) return;
        msg.x = Math.max(-30000, Math.min(60000, px)); msg.y = Math.max(-30000, Math.min(60000, py)); msg.rot = Math.max(-1e6, Math.min(1e6, prot)); msg.front = Math.max(-1e6, Math.min(1e6, pfr));   // bounded (see the item gate)
        if (w.waiting) { msg.rot = Number(w.rot) || 0; msg.front = Number(w.front) || 0; }   // Onboarding F1a: a waiting token only moves (the host's turn and facing stay)
        // a drag ends at its final pos, or at the map copy its client saves after it (the final can be lost to a redraw mid-drag). Fold M4: its entry
        // holds where it began (place and facing), where its last accepted pos left the token, when, from which connection; one the host moved past is over
        var dkW = msg.itemId + '|' + msg.wbId, frW = openDrag(msg.itemId, w);
        if (!frW) { if (Object.keys(_dragFrom).length > 400) _dragFrom = Object.create(null); frW = _dragFrom[dkW] = { x: Number(w.x) || 0, y: Number(w.y) || 0, rot: Number(w.rot) || 0, front: Number(w.front) || 0, lx: w.x, ly: w.y, lr: w.rot || 0, lf: w.front || 0, at: typeof fogNow === 'function' ? fogNow() : 0, peer: conn.peer, mapId: msg.itemId, wbId: msg.wbId }; }
        var wlM = moveMode(camp, 'walls');
        if (msg.final) delete _dragFrom[dkW];
        if (turnOrderCheck(camp, map, w, frW, msg, conn) === 'stop') return;   // T3b: out of turn, first
        if (wlM !== 'off' && window.wpFog && window.wpFog.moveBlocked && window.wpFog.moveBlocked(map, w, frW.x, frW.y, msg.x, msg.y)) {   // T3a: a wall in the way, from where the drag began
            if (wlM === 'refuse') {
                if (!msg.final) return;   // mid-drag: not applied (nothing past the wall reaches them meanwhile)
                snapBack(camp, map, w, msg, frW, conn); turnNote(conn, 'A wall is in the way: your token goes back.', w.charId);
                return;
            }
            if (msg.final) { turnNote(conn, 'That move went through a wall.', w.charId); toast((w.charName || 'A token') + ' moved through a wall.'); if (typeof bellOut === 'function') bellOut(w.charId, { title: 'Turn', text: 'Moved through a wall.' }); }
        }
        if (turnLimitCheck(camp, map, w, frW, msg, conn) === 'stop') return;   // T3b: the move limit, while it is their turn
        if (window.wpHistFlush) window.wpHistFlush();   // the GM's pending edit is its own step before the player's move lands
        var skW = window.wpFog && window.wpFog.seenKeyOf ? window.wpFog.seenKeyOf(map, w) : null;   // Senses S0: where the token saw and lit from before this move
        w.x = msg.x; w.y = msg.y; w.rot = msg.rot || 0; w.front = msg.front || 0;
        if (msg.final) setTimeout(function() { checkRoomHandouts(map); }, 50);
        // Host is the authority on cells: seat the token here too, in case the
        // player's copy didn't (grid state not yet applied on their side)
        if (msg.final && window.wpSeatDrop && window.wpSeatDrop(w, map, w.gridFit === true)) { msg = Object.assign({}, msg, { x: w.x, y: w.y }); }   // the snap rule: the GM's Snap is the table's
        // Senses S0: the live position relay goes by who sees what. A token now in another cell or facing another way: what ITS PLAYER sees
        // is judged afresh, and where it carries a light on a dark map, what everybody on that map sees (they see by its light). Still in
        // its cell and facing as it did, nothing changed for anybody: the sets stay
        var skN = skW === null ? null : window.wpFog.seenKeyOf(map, w), mvW = skW === null || skN !== skW;   // fold M7: where it sees from now, read once (the landing below compares it with where the drag began)
        if (window.wpFog && window.wpFog.invalidateSeen && mvW) window.wpFog.invalidateSeen(msg.itemId, w.light && (!window.wpFog.lightMoves || window.wpFog.lightMoves(map)) ? undefined : pr.id);
        msg = { type: 'pos', campId: msg.campId, itemId: msg.itemId, wbId: msg.wbId, x: msg.x, y: msg.y, rot: msg.rot, front: msg.front, final: msg.final === true };   // relayed as rebuilt: nothing else a peer added travels on
        applyPosToDom(msg);
        broadcastPos(msg, conn, camp, map, w);
        if (!msg.final) { frW.lx = w.x; frW.ly = w.y; frW.lr = w.rot || 0; frW.lf = w.front || 0; frW.at = typeof fogNow === 'function' ? fogNow() : 0; frW.peer = conn.peer; }   // fold M4: where the drag has it now
        if (frW.sk === undefined) frW.sk = skW;   // fold M7: where the drag began to see from (its first accepted move: nothing moved the token before it)
        if (window.wpSheets && window.wpSheets.tokenTurned) window.wpSheets.tokenTurned(msg.wbId, msg.final);   // 5h Fold 3: a sheet's facing dial follows (in place; a final turn redraws numbers that read it)
        if (msg.final) {
            var toRoom = window.wpAutoRoom ? window.wpAutoRoom(w, map) : null;
            if (toRoom) toast((w.charName || 'A character') + ' is now in ' + (toRoom.name || 'a room') + '.');
            saveRemoteSoon();
            if (typeof marksOwnMoved === 'function') marksOwnMoved(msg.itemId, [w], pr.id);   // senses S4b: their own drop on its turn takes their marks afresh
            if (typeof fogArm === 'function' && skN !== null && frW.sk !== skN) fogArm(msg.itemId);   // fold M7: it landed somewhere it sees from differently than where the drag began: catch the copies up
            net.tokenDropped(w, map);   // landed on a portal? the player travels
        }
        } finally { if (typeof ackTook === 'function') ackTook(conn, aIn); }
    } else {
        if (net.myId && w.ownerId === net.myId && typeof actPos === 'function' && actPos(msg.itemId, w.id, ackIn(msg.ack))) return;   // 14c: a newer action of theirs on this token is on its way: it lands after this
        w.x = msg.x; w.y = msg.y; w.rot = msg.rot || 0; w.front = msg.front || 0;
        applyPosToDom(msg);
        if (window.wpSheets && window.wpSheets.tokenTurned) window.wpSheets.tokenTurned(msg.wbId, msg.final === true);   // 5h Fold 3: the facing dial (the values are re-checked by facingCtx)
    }
}
// Turn-based combat T3a (D11, owner 2026-09-26): the campaign's movement modes, each refuse (the default), warn or off — walls: a player's token
// landing in or crossing a cell a sight-blocker occupies, always (in or out of combat), as a wall stops a token; the GM is never stopped
function moveMode(camp, k) { var t = camp && camp.turnRules && typeof camp.turnRules === 'object' ? camp.turnRules[k] : ''; return t === 'warn' || t === 'off' ? t : 'refuse'; }
var _dragFrom = Object.create(null);   // itemId|wbId -> where a player's drag began (its token's position before the drag's first move)
var _refusedAt = Object.create(null);   // itemId|wbId -> "x,y" of the drop the pos path just refused (the map copy that follows repeats it: no second note)
function turnNote(conn, text, cid) {   // cid (the bell): the character it is about, so their HUD's bell keeps it
    if (!conn || typeof conn.send !== 'function') return;
    var m = { type: 'turn-note', text: String(text).slice(0, 200) }; if (typeof cid === 'string' && /^c_[A-Za-z0-9_]{1,24}$/.test(cid)) m.charId = cid;
    try { conn.send(m); } catch (e) { sendFailed(e); }
}
// Turn-based combat T3b (D2, D3): while turn-based combat runs a combat on the map, a token in its order moves only on its own turn (order),
// and on its turn no further than its move (move), each by the campaign's mode; a token outside the combat is free
function turnCombatOf(camp, mapId, w) {
    if (!window.wpVtt || !window.wpVtt.on('turns')) return null;
    var cb = own(net.combats, mapId) ? net.combats[mapId] : null;
    return cb && Array.isArray(cb.rows) && cb.rows.some(function(r) { return r && r.tokId === w.id; }) ? cb : null;
}
function turnOrderCheck(camp, map, w, frW, msg, conn) {
    var cb = turnCombatOf(camp, msg.itemId, w); if (!cb) return '';
    var cur = cb.rows[cb.turn]; if (cur && cur.tokId === w.id) return '';
    var om = moveMode(camp, 'order'); if (om === 'off') return '';
    if (om === 'refuse') { if (!msg.final) return 'stop'; snapBack(camp, map, w, msg, frW, conn); turnNote(conn, 'It is not your turn: your token goes back.', w.charId); return 'stop'; }
    if (msg.final) { turnNote(conn, 'You moved out of turn.', w.charId); toast((w.charName || 'A token') + ' moved out of turn.'); if (typeof bellOut === 'function') bellOut(w.charId, { title: 'Turn', text: 'Moved out of turn.' }); }
    return '';
}
// A final that moved nothing (a turn in place, a shuffle inside its own cell) counts nothing and says nothing
function turnLimitCheck(camp, map, w, frW, msg, conn) {
    var cb = turnCombatOf(camp, msg.itemId, w); if (!cb) return '';
    var cur = cb.rows[cb.turn], st = own(net.turnMove, msg.itemId) ? net.turnMove[msg.itemId] : null;
    if (!cur || cur.tokId !== w.id || !st || st.tokId !== w.id || st.rowId !== cur.id || typeof st.allow !== 'number') return '';   // no limit this turn
    var mm = moveMode(camp, 'move'); if (mm === 'off') return '';
    var sys = camp && camp.system, dg = sys && sys.combat && sys.combat.turn ? sys.combat.turn.diag : '';
    var mvO = {}, d = window.wpFog && window.wpFog.moveCells ? window.wpFog.moveCells(map, w, frW.x, frW.y, msg.x, msg.y, dg, mvO) : 0, over = st.moved + d > st.allow + 0.05;
    if (over && d > 0 && mm === 'refuse') { if (!msg.final) return 'stop'; snapBack(camp, map, w, msg, frW, conn); turnNote(conn, thatIsText(d, mvO.len, map) + '; you have ' + cellsText(Math.max(0, st.allow - st.moved), map) + ' left.', w.charId); return 'stop'; }
    if (msg.final && d > 0) { st.moved += d; var lf = st.allow - st.moved; turnNote(conn, over ? 'That went ' + cellsText(-lf, map) + ' past your move.' : movedText(d, mvO.len, map) + '; ' + cellsText(Math.max(0, lf), map) + ' left.', w.charId); if (over) { toast((w.charName || 'A token') + ' moved ' + cellsText(-lf, map) + ' past their move.'); if (typeof bellOut === 'function') bellOut(w.charId, { title: 'Turn', text: 'Moved ' + cellsText(-lf, map) + ' past the move.' }); } }
    return '';
}
// T3: the note of the Refuse rule that stops a player's move of this token from (fx, fy) to (tx, ty) — a wall in the way, out of its turn, past
// its move — or ''. The patch path asks it: a map copy a client saves after a drop (whose final pos may have been lost) must never land the move
function moveRefused(camp, map, mapId, w, fx, fy, tx, ty) {
    if (moveMode(camp, 'walls') === 'refuse' && window.wpFog && window.wpFog.moveBlocked && window.wpFog.moveBlocked(map, w, fx, fy, tx, ty)) return 'A wall is in the way: your token goes back.';
    var cb = turnCombatOf(camp, mapId, w); if (!cb) return '';
    var cur = cb.rows[cb.turn]; if (!cur || cur.tokId !== w.id) return moveMode(camp, 'order') === 'refuse' ? 'It is not your turn: your token goes back.' : '';
    var st = own(net.turnMove, mapId) ? net.turnMove[mapId] : null; if (!st || st.tokId !== w.id || st.rowId !== cur.id || typeof st.allow !== 'number' || moveMode(camp, 'move') !== 'refuse') return '';
    var sys = camp && camp.system, dg = sys && sys.combat && sys.combat.turn ? sys.combat.turn.diag : '', mvR = {}, d = window.wpFog && window.wpFog.moveCells ? window.wpFog.moveCells(map, w, fx, fy, tx, ty, dg, mvR) : 0;
    return d > 0 && st.moved + d > st.allow + 0.05 ? thatIsText(d, mvR.len, map) + '; you have ' + cellsText(Math.max(0, st.allow - st.moved), map) + ' left.' : '';
}
// T3b: a move that lands through a map copy (its drag's final pos was lost) still counts against the turn's move; its note, or ''
function moveCounted(camp, map, mapId, w, fx, fy, tx, ty) {
    var cb = turnCombatOf(camp, mapId, w); if (!cb) return '';
    var cur = cb.rows[cb.turn], st = own(net.turnMove, mapId) ? net.turnMove[mapId] : null; if (!cur || cur.tokId !== w.id || !st || st.tokId !== w.id || st.rowId !== cur.id || typeof st.allow !== 'number') return '';
    var sys = camp && camp.system, dg = sys && sys.combat && sys.combat.turn ? sys.combat.turn.diag : '', mvC = {}, d = window.wpFog && window.wpFog.moveCells ? window.wpFog.moveCells(map, w, fx, fy, tx, ty, dg, mvC) : 0;
    if (!(d > 0)) return '';   // nothing moved (a turn in place, a shuffle inside its own cell): nothing to count, nothing to say
    st.moved += d;
    return moveMode(camp, 'move') === 'off' ? '' : movedText(d, mvC.len, map) + '; ' + cellsText(Math.max(0, st.allow - st.moved), map) + ' left.';
}
// Difficult terrain T2: a turn note's words for a move that cost d, its own length len (from the fog, when it can tell): the cost and "with
// difficult terrain" where terrain made it cost more than its length, the move alone otherwise
function viaTerrain(d, len) { return typeof len === 'number' && isFinite(len) && typeof d === 'number' && d > len + 0.05; }
function thatIsText(d, len, map) { return viaTerrain(d, len) ? 'That costs ' + cellsText(d, map) + ' with difficult terrain' : 'That is ' + cellsText(d, map); }
function movedText(d, len, map) { return viaTerrain(d, len) ? 'Moved ' + cellsText(len, map) + ', costing ' + cellsText(d, map) + ' with difficult terrain' : 'Moved ' + cellsText(d, map); }
function cellsText(n, map) {   // "6 squares (30 ft)": the map's cells and its own unit
    var S = SC(), sc = S && S.mapCellScale ? S.mapCellScale(map) : { per: 5, unit: 'ft', hex: false }, r = Math.round(n * 10) / 10, gt = map && map.meta && map.meta.gridType;
    var nm = gt === 'hex' ? (r === 1 ? 'hex' : 'hexes') : gt === 'square' ? (r === 1 ? 'square' : 'squares') : (r === 1 ? 'cell' : 'cells');
    return r + ' ' + nm + ' (' + (Math.round(r * sc.per * 10) / 10) + ' ' + sc.unit + ')';
}
function snapBack(camp, map, w, msg, to, mover) {   // the token goes back where its drag began, for everyone (the mover too); mover: the connection whose action this answers
    if (typeof msg.x === 'number') _refusedAt[msg.itemId + '|' + msg.wbId] = msg.x + ',' + msg.y;
    w.x = to.x; w.y = to.y;
    if (window.wpFog && window.wpFog.invalidateSeen) window.wpFog.invalidateSeen(msg.itemId);   // Senses S0: the drag moved the token on the host as it went: who sees what is judged from where it stands again
    var back = { type: 'pos', campId: msg.campId, itemId: msg.itemId, wbId: msg.wbId, x: to.x, y: to.y, rot: w.rot || 0, front: w.front || 0, final: true };
    var mv = mover && mover.open && typeof mover.send === 'function' && typeof withAck === 'function' ? mover : null;
    applyPosToDom(back); broadcastPos(back, mv, camp, map, w);
    if (mv) { try { mv.send(withAck(back, mv, msg.a)); } catch (e) { sendFailed(e); } }   // 14c: to the mover, as the answer to that very action (its number said)
}
// Fold M4: the drag still open on this token, while it stands where the drag's last accepted pos left it. A token the host has moved since (a
// GM drag, Properties, an undo, a step-off) ends that drag, the host's place standing; a turn the host gave it (the GM's dial) stands and the
// drag goes on. While fogLanded holds it at its start it is the drag
function openDrag(mapId, w) {
    var e = w && typeof w.id === 'string' ? _dragFrom[mapId + '|' + w.id] : null;
    if (!e || typeof e.wbId !== 'string') return null;
    if (e.held) return e;
    if (w.x !== e.lx || w.y !== e.ly) return null;
    if ((w.rot || 0) !== e.lr || (w.front || 0) !== e.lf) { e.rot = e.lr = w.rot || 0; e.front = e.lf = w.front || 0; }
    return e;
}
function openDrags() { return Object.keys(_dragFrom).map(function(k) { return _dragFrom[k]; }).filter(function(e) { return !!e && typeof e.wbId === 'string'; }); }
// a drag that ends without landing: its entry goes and, a token given, the token goes back where it began, place and facing, for everyone who
// sees it there, as a refused drop does (a hidden token's facing never goes out: broadcastPos)
function dragEnd(e, camp, map, w) {
    var k = e.mapId + '|' + e.wbId; if (_dragFrom[k] === e) delete _dragFrom[k];
    if (!w || !camp || !map) return;
    if (w.x === e.x && w.y === e.y && (w.rot || 0) === e.rot && (w.front || 0) === e.front) return;   // never moved (every move of it refused): nothing to put back
    w.rot = e.rot; w.front = e.front;
    snapBack(camp, map, w, { campId: camp.id, itemId: e.mapId, wbId: e.wbId }, e);
    saveRemoteSoon();
}
// [netcheck:pos-end]

// Client: a player's threat marks from their sheet's facing dial (5h Fold 3), as their own message — a map patch never carries them
net.sendThreats = function(campId, itemId, wbId, list) {
    if (!net.active || net.role !== 'client' || !net.conns[0] || !net.conns[0].open) return;
    var SCs = SC(); if (!SCs || !SCs.cleanThreats) return;
    var tm = { type: 'threats', campId: String(campId), itemId: String(itemId), wbId: String(wbId), threats: SCs.cleanThreats(list) };
    if (typeof actNext === 'function') { tm.a = actNext(); actNote('threats', tm.itemId, { id: tm.wbId, threats: tm.threats }, tm.a); }   // 14c: numbered, and kept until a copy goes that far
    try { net.conns[0].send(tm); } catch (e) { sendFailed(e); }
};

// Client: ask the host to travel through a portal item on the current map.
net.requestTravel = function(viaItemId) {
    if (!net.active || net.role !== 'client' || !net.conns[0] || !net.conns[0].open) return;
    if (net.paused || net.selfPaused) { toast(net.selfPaused && !net.paused ? 'The GM has paused you.' : 'The table is paused.'); return; }
    try { net.conns[0].send({ type: 'travel', viaItemId: viaItemId }); } catch (e) { sendFailed(e); }
};

// [netcheck:roster-start]
// The roster as players get it: a plain ARRAY of entries rebuilt field by field — never the prototype-free map itself (BinaryPack
// cannot pack an object without a prototype: from 9526489 every roster broadcast threw inside broadcast() and no player saw the table),
// no peer-id keys (players never need a connection handle), no host-internal fields (stale, anything a future edit adds).
function rosterPayload() {
    var out = [];
    Object.keys(net.roster).forEach(function(k) {
        var p = net.roster[k];
        if (!p || typeof p !== 'object' || !validProfileId(p.id)) return;
        var e = { id: p.id, name: cleanRosterName(p.name), location: typeof p.location === 'string' ? p.location : null, detached: p.detached === true };
        if (typeof p.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.color)) e.color = p.color;
        if (safeAvatar(p.avatar)) e.avatar = p.avatar;
        var fP = cleanFace(p.face); if (fP) e.face = fP;   // Onboarding F1b: their token face
        out.push(e);
    });
    return out;
}
function broadcastRoster() { broadcast({ type: 'roster', roster: rosterPayload(), away: awayMap() }, null); }
// [netcheck:roster-end]

// Is this player currently on the given map? (self is always present to itself)
net.refreshUi = function() {               // own campaign is back: spectator class, party strip, badge, and the host picker lists only own campaigns
    renderRoster();
    if (!net.active) refreshStageSelect();
    syncSessionButtons();
};
net.sanitizeAppState = sanitizeAppState;   // the stream window shows exactly what players may see
net.applyStage = applyStage;
/* ---------- targeting ----------
   net.targets: playerId -> { id, mapId, name }. Clients send { type:'target' }; the host keeps
   the table's map of targets and broadcasts { type:'targets' } to everyone after each change,
   and hands the current map to late joiners in the snapshot. A target is a pointer, nothing
   more: it never changes the token it points at. */
net.targets = {};
/* ---------- table notepad ----------
   A disposable pad the GM opens for the table: everyone sees it live, anyone can save it to their
   Journal, and it is gone when the GM puts it away or the session ends. Never saved with the campaign. */
net.notepad = { on: false, text: '' };
var notepadTimer = null;
function notepadMsg() {
    var camp = getActiveCampaign() || {};
    return { type: 'notepad', on: !!net.notepad.on, text: String(net.notepad.text || '').slice(0, 20000), campId: camp.id || '', gmId: getProfile().id, campaign: camp.name || '', gm: getProfile().name || 'GM' };
}
function renderNotepad() {
    var p = ui('notepadPanel'), ta = ui('notepadText'); if (!p || !ta) return;
    var on = net.active && net.notepad.on;
    p.style.display = on ? 'flex' : 'none';
    if (!on) return;
    var host = net.role === 'host';
    ta.readOnly = !host;
    ta.placeholder = host ? 'Notes for the whole table — everyone sees this as you type. Gone when you put it away or the session ends; anyone can save it to their Journal.' : 'The GM has not written anything yet.';
    if (document.activeElement !== ta && ta.value !== net.notepad.text) ta.value = net.notepad.text || '';
    var close = ui('notepadCloseBtn'); if (close) close.style.display = host ? '' : 'none';
    var clr = ui('notepadClearBtn'); if (clr) clr.style.display = host ? '' : 'none';
    var who = ui('notepadWho'); if (who) who.textContent = host ? 'everyone at the table sees this' : 'written by ' + (net.notepad.gm || 'the GM');
}
window.wpRenderNotepad = renderNotepad;
net.notepadToggle = function() {
    if (net.role !== 'host') return;
    if (net.notepad.on) {
        var has = String(net.notepad.text || '').trim();
        showConfirm('Put the table notepad away? ' + (has ? 'Its text goes for everyone who has not saved it to their Journal.' : 'It is empty.'), function(yes) {
            if (!yes) return;
            net.notepad = { on: false, text: '' };
            broadcast(notepadMsg(), null); renderNotepad(); toast('Notepad put away.');
            logEvent('table', 'Table notepad put away');
        });
    } else {
        net.notepad.on = true;
        broadcast(notepadMsg(), null); renderNotepad(); toast('Table notepad open — everyone sees it.');
        logEvent('table', 'Table notepad opened');
        var ta = ui('notepadText'); if (ta) setTimeout(function() { ta.focus(); }, 50);
    }
};
net.notepadInput = function(text) {
    if (net.role !== 'host' || !net.notepad.on) return;
    net.notepad.text = String(text || '').slice(0, 20000);
    clearTimeout(notepadTimer);
    notepadTimer = setTimeout(function() { broadcast(notepadMsg(), null); }, 250);
};
(function() {
    var ta = ui('notepadText'), close = ui('notepadCloseBtn'), saveB = ui('notepadSaveBtn'), minB = ui('notepadMinBtn'), p = ui('notepadPanel'), head = ui('notepadHead');
    if (!ta) return;
    ta.addEventListener('input', function() { net.notepadInput(ta.value); });
    ta.addEventListener('keydown', function(e) { e.stopPropagation(); });
    if (close) close.addEventListener('click', function() { net.notepadToggle(); });
    var clearB = ui('notepadClearBtn');
    if (clearB) clearB.addEventListener('click', function() {
        if (net.role !== 'host' || !net.notepad.on) return;
        if (!String(net.notepad.text || ta.value || '').trim()) { toast('The notepad is already empty.'); return; }
        showConfirm('Clear the table notepad? The text goes for everyone who has not saved it to their Journal. The notepad stays open.', function(yes) {
            if (!yes) return;
            clearTimeout(notepadTimer);
            net.notepad.text = ''; ta.value = '';
            broadcast(notepadMsg(), null); renderNotepad(); toast('Notepad cleared.');
            logEvent('table', 'Table notepad cleared');
        });
    });
    if (minB) minB.addEventListener('click', function() { p.classList.toggle('min'); minB.textContent = p.classList.contains('min') ? '\u25B4' : '\u25BE'; });
    if (saveB) saveB.addEventListener('click', function() {
        var text = net.role === 'host' ? ta.value : (net.notepad.text || '');
        if (!String(text).trim()) { toast('Nothing on the notepad yet.'); return; }
        var meta = net.role === 'host' ? notepadMsg() : net.notepad;
        if (window.wpJournalAddNote) window.wpJournalAddNote(meta, 'Table notes — ' + new Date().toLocaleDateString(), text);
    });
    var pb = ui('netNotepadBtn'); if (pb) pb.addEventListener('click', function() {
        if (!(net.active && net.role === 'host')) { toast('Host a session first — the notepad is for the table.'); return; }
        ui('netModal').style.display = 'none'; net.notepadToggle();
    });
    // drag the pad around by its header (position kept for this session only)
    if (head && p) {
        var d = null;
        head.addEventListener('pointerdown', function(e) {
            if (e.target.closest('button')) return;
            var r = p.getBoundingClientRect(); d = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); e.preventDefault();
        });
        head.addEventListener('pointermove', function(e) { if (!d) return; p.style.left = Math.max(0, Math.min(window.innerWidth - 120, e.clientX - d.dx)) + 'px'; p.style.top = Math.max(0, Math.min(window.innerHeight - 40, e.clientY - d.dy)) + 'px'; p.style.right = 'auto'; });
        head.addEventListener('pointerup', function() { d = null; });
        head.addEventListener('pointercancel', function() { d = null; });
    }
})();

/* ---------- combat / turn order ----------
   One combat per map: net.combats[mapId] = { mapId, round, turn, rows: [{ id, name, tokId, init, src }] }.
   The host owns it; clients get it in the snapshot and in 'combats' messages. Ends with the session. */
net.combats = {};
var combatAsked = {};   // mapId|tokId -> true: the "start combat?" question for a targeted NPC is asked once per session
// [netcheck:combats-start]
function cleanCombats(c) {
    var out = {}; if (!c || typeof c !== 'object') return out;
    Object.keys(c).slice(0, 40).forEach(function(mapId) {
        var k = c[mapId]; if (!k || typeof k !== 'object' || !Array.isArray(k.rows)) return;
        var rows = k.rows.slice(0, 60).map(function(r) {
            if (!r || typeof r !== 'object') return null;
            var o = { id: String(r.id || '').slice(0, 40), name: String(r.name || '').slice(0, 60), tokId: r.tokId ? String(r.tokId).slice(0, 80) : null, init: Math.max(-1e6, Math.min(1e6, Number(r.init) || 0)), src: typeof r.src === 'string' && r.src.length <= 400 ? r.src : null };
            if (r.rolled === 1 || r.rolled === true) o.rolled = 1;   // initiative O1: the row has its number (rolled or given); the host's own, never sent to a player (combatRowOut)
            if (r.held === 1 || r.held === true) o.held = 1;   // initiative O3: holding its turn this round (shown to the table)
            if (Array.isArray(r.tb)) { var tb = r.tb.slice(0, 3).map(function(v) { return Array.isArray(v) ? v.slice(0, 8).filter(function(n) { return typeof n === 'number' && isFinite(n); }).map(function(n) { return Math.max(-1e6, Math.min(1e6, n)); }) : null; }); if (tb.some(function(v) { return v && v.length; })) o.tb = tb; }   // initiative O2: its tie rolls, each step's in order, kept so a later sort never shuffles; the host's own
            return o;
        }).filter(Boolean);
        if (!rows.length) return;
        out[String(mapId).slice(0, 80)] = { mapId: String(mapId).slice(0, 80), round: Math.max(1, Math.min(9999, Number(k.round) || 1)), turn: Math.max(0, Math.min(rows.length - 1, Number(k.turn) || 0)), rows: rows };
        if (k.side === 'pc' || k.side === 'rest') out[String(mapId).slice(0, 80)].side = k.side;   // initiative O4: the side going first this round (shown to the table)
    });
    return out;
}
function applyNotepad(m) {
    var was = net.notepad.on;
    net.notepad = { on: !!m.on, text: String(m.text || '').slice(0, 20000), campId: String(m.campId || '').slice(0, 80), gmId: String(m.gmId || '').slice(0, 80), campaign: String(m.campaign || '').slice(0, 120), gm: String(m.gm || 'GM').slice(0, 60) };
    if (net.notepad.on && !was) toast('The GM opened a table notepad — you can save it to your Journal any time.');
    else if (!net.notepad.on && was) toast('The GM put the table notepad away.');
    renderNotepad();
}
/* What a player gets of the combats: the order, never a number (1.5.0). A row's initiative can be the total of a roll the GM alone saw
   (the roster's Roll keeps one that reads a GM-only value private, and its total still sets the order), and nothing on a player's side
   reads it, so no row carries init to a player, on any map; the host keeps its own for the roster. Fog of war (1.5.0 FV2): the combat
   roster and the target pointers name tokens, so a player must not learn an unseen creature through them. On a fogged map a combat row
   for a token they cannot see is REDACTED (name "Hidden"; no token, no picture, and an id of its place rather than the row's, which
   carries the token's) — the order, count and turn index stay intact; a target pointer at an unseen token is dropped. Hidden pieces (the
   owner's ruling of 2026-10-01): a pointer at a token the GM has hidden, or at nothing on the host's map, goes to no one on any table — hidden
   and gone answer alike, so an echo tells a player's app nothing — and the pointers go out again when a hide, a show or a deletion changes
   which are sent, as the rows are. A table without fog keeps the single broadcast, through the same judge. */
function combatRowOut(r, i, unseen) { if (unseen) return { id: 'h' + i, name: 'Hidden', tokId: null, src: null }; var o = { id: r.id, name: r.name, tokId: r.tokId, src: r.src }; if (r.held === 1) o.held = 1; return o; }   // initiative O3: a seen row's hold too (an unseen one tells nothing)
// The owner's ruling of 2026-10-01 ("if they've already seen the character, there's no reason to exclude it from the turn order unless it's
// left the fight"): a row a player was once sent whole in this fight keeps its name for them when its token is hidden or out of their sight;
// only a creature they have never seen in it reads Hidden. The host's memory per fight (the map's id) and player (a profile id; '*' = everyone
// at the table, an unfogged broadcast): the token ids sent whole. Forgotten when the fight ends or a new one starts there, and at a new table
var _combatSeen = Object.create(null);
function combatSeenKey(pid) { return typeof pid === 'string' && pid ? pid : '*'; }
function combatSeen(mapId, pid, tokId) { var m = _combatSeen[mapId]; if (!m || typeof tokId !== 'string') return false; var k = combatSeenKey(pid); return !!((m[k] && m[k][tokId] === 1) || (m['*'] && m['*'][tokId] === 1)); }
function combatSaw(mapId, pid, tokId) { if (typeof mapId !== 'string' || typeof tokId !== 'string') return; var m = _combatSeen[mapId] || (_combatSeen[mapId] = Object.create(null)), k = combatSeenKey(pid), s = m[k] || (m[k] = Object.create(null)); s[tokId] = 1; }
function combatForget(mapId) { if (mapId === undefined) _combatSeen = Object.create(null); else delete _combatSeen[mapId]; }
function combatsFor(recipientId) {
    var camp = getActiveCampaign(), fogged = anyFog(camp), out = {};
    Object.keys(net.combats || {}).forEach(function(mapId) {
        var cmb = net.combats[mapId], map = fogged && camp && camp.items[mapId];
        var drop = map && map.type === 'map' && map.fog && map.fog.on === true ? (fogDrop(camp, map, recipientId) || {}) : null, hid = combatHidden(camp, mapId);
        out[mapId] = { mapId: cmb.mapId, round: cmb.round, turn: cmb.turn, rows: (cmb.rows || []).map(function(r, i) {
            var unseen = !!(r.tokId && ((drop && drop[r.tokId]) || hid[r.tokId]));
            if (unseen && combatSeen(mapId, recipientId, r.tokId)) unseen = false;   // seen in this fight already: the name stays
            if (!unseen && r.tokId) combatSaw(mapId, recipientId, r.tokId);
            return combatRowOut(r, i, unseen);
        }) };
        if (cmb.side === 'pc' || cmb.side === 'rest') out[mapId].side = cmb.side;   // initiative O4: which side goes first this round (never its rolls: those are their cards)
    });
    return out;
}
// Fold M0: the tokens the GM has hidden on a combat's map, fogged or not: a hidden token is not on any player's copy, so its row is
// nameless too (the GM may hide a creature after the fight began). The GM's own strip reads net.combats, never this
function combatHidden(camp, mapId) {
    var m = camp && camp.items && Object.prototype.hasOwnProperty.call(camp.items, mapId) ? camp.items[mapId] : null, out = Object.create(null);
    (m && Array.isArray(m.whiteboard) ? m.whiteboard : []).forEach(function(w) { if (w && w.hidden && typeof w.id === 'string') out[w.id] = 1; });
    return out;
}
// ...and when the GM hides or shows a token of a running fight, the players' rows follow at once (a save: their strip was sent whole)
// (what the table was last sent, recorded by every send of the rows to the table: broadcastCombats)
var _combatHidSig = '';
function combatHidSigNow() { var camp = getActiveCampaign(); return Object.keys(net.combats || {}).sort().map(function(mapId) { var hid = combatHidden(camp, mapId); return mapId + ':' + ((net.combats[mapId] || {}).rows || []).map(function(r) { return r && r.tokId && hid[r.tokId] ? 1 : 0; }).join(''); }).join('|'); }
var _targetHidSig = '';
net.syncCombatHidden = function() {
    if (!net.active || net.role !== 'host') return;
    if (combatHidSigNow() !== _combatHidSig) broadcastCombats();
    if (targetHidSigNow() !== _targetHidSig) broadcastTargets();   // hidden pieces: and the pointers, where a hide, a show or a deletion changed which are sent
};
// the token a pointer names on the host's own map, else null (a map that is none, a token gone or the GM's hidden one all read alike)
function targetTok(camp, t) {
    var map = t && camp && camp.items && typeof t.mapId === 'string' && Object.prototype.hasOwnProperty.call(camp.items, t.mapId) ? camp.items[t.mapId] : null;   // (as combatHidden reads a map: this slice runs without own)
    var w = map && map.type === 'map' && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return !!x && x.id === t.id; }) : null;
    return w && !w.hidden ? { tok: w, map: map } : null;
}
function targetHidSigNow() { var camp = getActiveCampaign(); return Object.keys(net.targets || {}).sort().filter(function(pid) { return !targetTok(camp, net.targets[pid]); }).join(','); }
function targetsFor(recipientId) {
    var camp = getActiveCampaign(), fogged = anyFog(camp), out = {};
    Object.keys(net.targets || {}).forEach(function(pid) {
        var t = net.targets[pid], at = targetTok(camp, t); if (!at) return;   // hidden pieces: a pointer at a token the GM hid, or at nothing here, is nobody's
        if (fogged && at.map.fog && at.map.fog.on === true && (fogDrop(camp, at.map, recipientId) || {})[t.id]) return;   // fog: one at a creature this player does not see
        out[pid] = t;
    });
    return out;
}
function broadcastCombats() {
    var camp = getActiveCampaign();
    _combatHidSig = combatHidSigNow();   // fold M0: which rows the table now holds redacted for a hidden token
    if (!anyFog(camp)) { broadcast({ type: 'combats', combats: combatsFor(null) }, null); return; }
    var sendAll = function() { net.conns.forEach(function(c) { var pr = net.roster[c.peer]; if (!pr || !c.open) return; try { c.send({ type: 'combats', combats: combatsFor(pr.id) }); } catch (e) { sendFailed(e); } }); };
    if (typeof fogLanded === 'function') fogLanded(null, sendAll); else sendAll();   // fold M4: judged with every open drag at its start
}
function broadcastTargets() {
    var camp = getActiveCampaign();
    _targetHidSig = targetHidSigNow();   // hidden pieces: which pointers the table now goes without
    if (!anyFog(camp)) { broadcast({ type: 'targets', targets: targetsFor(null) }, null); return; }
    var sendAll = function() { net.conns.forEach(function(c) { var pr = net.roster[c.peer]; if (!pr || !c.open) return; try { c.send({ type: 'targets', targets: targetsFor(pr.id) }); } catch (e) { sendFailed(e); } }); };
    if (typeof fogLanded === 'function') fogLanded(null, sendAll); else sendAll();   // fold M4: judged with every open drag at its start
}
// [netcheck:combats-end]
// [netcheck:marksheld-start]
// Senses S4b: "Marks in a fight" played On your own turn (the campaign's fog defaults: marks 'turn'). While a fight runs on a fogged map each
// player's marks there come from what the host holds for them (fog.js marksHold; never saved, never sent), taken afresh only: when a token of
// theirs starts its turn, when they drop a token of theirs on its turn, at each new round for a player with no token in the fight, and at the
// fight's start for everyone; at its end the marks follow every move again. Each refresh catches that player's copies of the map up in place
// (only what changed goes out), judged with every open drag at its start
function marksStrict(camp) { var d = camp && camp.fog && typeof camp.fog === 'object' && camp.fog.defaults && typeof camp.fog.defaults === 'object' ? camp.fog.defaults : null; return !!d && d.marks === 'turn'; }
function marksMap(camp, mapId) { var m = typeof mapId === 'string' && camp && camp.items && own(camp.items, mapId) ? camp.items[mapId] : null; return m && mapFogged(m) ? m : null; }
function marksRefresh(pids, mapId) {
    var F = window.wpFog, camp = getActiveCampaign(), m = marksMap(camp, mapId);
    if (!net.active || net.role !== 'host' || !F || typeof F.marksHold !== 'function' || !m || !pids.length) return;   // (every caller has judged the table's setting)
    var memo = Object.create(null);
    fogLanded(mapId, function() {
        pids.forEach(function(pid) { F.marksHold(pid, camp, m, fogDrop(camp, m, pid)); });
        net.conns.forEach(function(c) { var pr = c && c.open ? net.roster[c.peer] : null; if (pr && typeof pr.id === 'string' && pids.indexOf(pr.id) >= 0) fogCatchUp(c, camp, m, pr.id, memo); });
    });
}
function marksOwners(m) {   // every player with a token on that map, and every admitted one
    var seen = Object.create(null), out = [], add = function(pid) { if (typeof pid === 'string' && pid && !seen[pid]) { seen[pid] = 1; out.push(pid); } };
    (Array.isArray(m.whiteboard) ? m.whiteboard : []).forEach(function(w) { if (w && (w.isChar || w.waiting) && !w.hidden) add(w.ownerId); });
    net.conns.forEach(function(c) { var pr = c && c.open ? net.roster[c.peer] : null; if (pr) add(pr.id); });
    return out;
}
function marksRowOwner(m, row) { var w = row && typeof row.tokId === 'string' && Array.isArray(m.whiteboard) ? m.whiteboard.find(function(x) { return !!x && x.id === row.tokId; }) : null; return w && typeof w.ownerId === 'string' && w.ownerId ? w.ownerId : null; }
function marksTurn(mapId, c) {   // a token's turn began: its player's marks
    var camp = getActiveCampaign(), m = marksMap(camp, mapId); if (!m || !marksStrict(camp)) return;
    var pid = marksRowOwner(m, c && Array.isArray(c.rows) ? c.rows[c.turn] : null); if (pid) marksRefresh([pid], mapId);
}
function marksRound(mapId, c) {   // a new round: the marks of each player with no token in the fight
    var camp = getActiveCampaign(), m = marksMap(camp, mapId); if (!m || !marksStrict(camp)) return;
    var inFight = Object.create(null); (c && Array.isArray(c.rows) ? c.rows : []).forEach(function(r) { var p = marksRowOwner(m, r); if (p) inFight[p] = 1; });
    marksRefresh(marksOwners(m).filter(function(p) { return inFight[p] !== 1; }), mapId);
}
function marksStart(mapId) {   // a fight began: everyone's marks, held from now
    var camp = getActiveCampaign(), m = marksMap(camp, mapId);
    if (window.wpFog && typeof window.wpFog.marksForget === 'function') window.wpFog.marksForget(mapId);
    if (m && marksStrict(camp)) marksRefresh(marksOwners(m), mapId);
}
function marksEnd(mapId) {   // a fight ended: the marks follow every move again, and every copy of the map catches up
    var camp = getActiveCampaign(), m = marksMap(camp, mapId);
    if (window.wpFog && typeof window.wpFog.marksForget === 'function') window.wpFog.marksForget(mapId);
    if (!net.active || net.role !== 'host' || !m || !marksStrict(camp)) return;
    var memo = Object.create(null);
    fogLanded(mapId, function() { net.conns.forEach(function(c) { var pr = c && c.open ? net.roster[c.peer] : null; if (pr && typeof pr.id === 'string') fogCatchUp(c, camp, m, pr.id, memo); }); });
}
function marksOwnMoved(mapId, toks, pid) {   // a player dropped tokens of theirs: their marks, when one of them is on its turn
    var camp = getActiveCampaign(), m = marksMap(camp, mapId), c = net.combats && typeof mapId === 'string' && own(net.combats, mapId) ? net.combats[mapId] : null;
    if (!m || !c || !Array.isArray(c.rows) || !marksStrict(camp)) return;
    var row = c.rows[c.turn]; if (!row || typeof row.tokId !== 'string') return;
    if (toks.some(function(w) { return !!w && w.id === row.tokId && w.ownerId === pid; })) marksRefresh([pid], mapId);
}
// [netcheck:marksheld-end]
function combatRefresh() { render(); if (window.wpRenderCombatStrip) window.wpRenderCombatStrip(); }
// Stage 6 HUD G10: a combat's round just changed (its start, or a step past either end) — the sheets' round hook runs the Each round actions;
// a fault in it never stops the turn
// Item 20 K2 (the Foundry model): n rounds of a fight move the campaign's clock on by the round's length, back for a step back (calendar.js)
function clockRounds(n) { try { if (window.wpCalendar && window.wpCalendar.rounds) window.wpCalendar.rounds(n); } catch (e) { console.error(e); } }
function clockFightEnd() { try { if (window.wpCalendar && window.wpCalendar.fightEnded) window.wpCalendar.fightEnded(); } catch (e) { console.error(e); } }   // K5: a fight's rounds, as active time, asked about now
function roundChanged(mapId, c) { try { if (window.wpSheets && window.wpSheets.roundHook) window.wpSheets.roundHook(mapId, c); } catch (e) { console.error(e); } if (typeof marksRound === 'function') { try { marksRound(mapId, c); } catch (e) { console.error(e); } } }   // senses S4b: marks held to the round
function turnStarted(mapId, c) { try { if (window.wpSheets && window.wpSheets.turnHook) window.wpSheets.turnHook(mapId, c); } catch (e) { console.error(e); } try { turnMoveStart(mapId, c); } catch (e) { console.error(e); } try { turnActsStart(mapId, c); } catch (e) { console.error(e); } try { turnFxStart(mapId, c); } catch (e) { console.error(e); } if (typeof marksTurn === 'function') { try { marksTurn(mapId, c); } catch (e) { console.error(e); } } }   // turn-based combat T2b: a character's turn just began; T3b: its move; senses S4b: its player's marks
// [netcheck:turnmove-start]
// Turn-based combat T3b (D1, D2): the move of the character whose turn begins — how far its token may go this turn, in the map's cells (its
// system's Move per turn, worked out through its player's view with its token; none, a GM-only one, one that fails: no limit) and how far
// it has gone; its player hears how far. Turn-based combat on, a player's token only (the GM is never limited)
net.turnMove = {};
function turnMoveStart(mapId, c) {
    delete net.turnMove[mapId];
    var row = c && Array.isArray(c.rows) ? c.rows[c.turn] : null; if (!row || typeof row.tokId !== 'string' || !window.wpVtt || !window.wpVtt.on('turns')) return;
    var camp = getActiveCampaign(), map = camp && camp.items && own(camp.items, mapId) ? camp.items[mapId] : null;
    var w = map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return x && x.id === row.tokId; }) : null; if (!w || !w.isChar || !w.ownerId) return;
    var st = { rowId: row.id, tokId: w.id, moved: 0, allow: null }; net.turnMove[mapId] = st;
    var S = SC(), F = window.wpFormula, ch = camp.chars && typeof w.charId === 'string' && own(camp.chars, w.charId) ? camp.chars[w.charId] : null;
    if (!S || !F || !camp.system || !ch || ch.npc || ch.ownerId !== w.ownerId || !window.wpSheets) return;
    var view = window.wpSheets.playerSystem(camp), t = view && view.combat && view.combat.turn; if (!t || !t.move) return;
    var chv = S.charFor(ch, view, w.ownerId, { lib: fxLib(camp.system), items: itemLib(camp.system), full: camp.system }); if (!chv) return;
    var vt = window.wpVtt, rl = function(k) { return !vt || (vt.rulesOn ? vt.rulesOn(k) : vt.on(k)); };
    var tc = S.withRound(S.tokenCtx(map, w, { turning: rl('turning'), posture: rl('posture'), elevation: rl('elevation') }), c);
    var r = F.evaluate(t.move, { vars: S.makeResolver(view, chv, F, tc) }); if (!r.ok || typeof r.value !== 'number' || !isFinite(r.value)) return;
    st.allow = S.moveAllowCells(Math.max(0, r.value), t.unit, S.mapCellScale(map));
    noteOwner(w.ownerId, 'Your turn: ' + cellsText(st.allow, map) + ' to move.', w.charId);
}
function noteOwner(pid, text, cid) { net.conns.forEach(function(c) { if (c.open && net.roster[c.peer] && peerProfileId(c) === pid) turnNote(c, text, cid); }); }
// [netcheck:turnmove-end]
// [netcheck:turnacts-start]
// Turn-based combat T4 (D4, D5): the actions a turn allows (the System's Combat card) — a player's press of a roll or an apply action that costs
// one spends it while their character's token is in a combat on the map they are on (turn-based combat on), on or off its turn (a reaction);
// each character's counts refill when its turn begins. The campaign's mode: refuse (none left: refused, with why), warn (through, a note to
// them and the GM), off. The GM's own presses are never limited. Their player hears what is left, and their sheet greys what is spent
net.turnSpent = {};   // charId -> { actKey: spent since its last turn began }
function actsOf(camp) { var t = camp && camp.system && camp.system.combat && camp.system.combat.turn; return t && Array.isArray(t.acts) ? t.acts : []; }
function actsCombat(camp, charId, pr) {
    if (!window.wpVtt || !window.wpVtt.on('turns') || !pr || typeof pr.location !== 'string' || !own(net.combats, pr.location)) return null;
    var cb = net.combats[pr.location], map = camp && camp.items && own(camp.items, pr.location) ? camp.items[pr.location] : null, S = SC();
    var tok = S && map ? S.charTokenOn(map, charId, pr.id, { strict: true }) : null;
    return tok && Array.isArray(cb.rows) && cb.rows.some(function(r) { return r && r.tokId === tok.id; }) ? cb : null;
}
function actsTell(camp, charId, cleared) {   // what is left, to each connection of the character's player
    var ch = camp && camp.chars && own(camp.chars, charId) ? camp.chars[charId] : null; if (!ch || !ch.ownerId || ch.npc) return;
    var left = null; if (!cleared) { left = {}; var sp = net.turnSpent[charId] || {}; actsOf(camp).forEach(function(a) { if (a && typeof a.key === 'string') left[a.key] = Math.max(0, (a.n || 1) - (sp[a.key] || 0)); }); }
    var m = { type: 'acts-left', charId: charId, left: left, mode: moveMode(camp, 'acts') === 'warn' ? 'warn' : 'refuse' };
    net.conns.forEach(function(c) { if (c.open && net.roster[c.peer] && peerProfileId(c) === ch.ownerId) { try { c.send(m); } catch (e) { sendFailed(e); } } });
}
// '' when the press may go ahead (its cost spent, or nothing to spend); else the refusal's text
function actSpend(camp, charId, pr, cost, conn, who) {
    if (!cost || moveMode(camp, 'acts') === 'off') return '';
    var a = null; actsOf(camp).forEach(function(x) { if (!a && x && x.key === cost) a = x; }); if (!a || !actsCombat(camp, charId, pr)) return '';
    var sp = net.turnSpent[charId] || (net.turnSpent[charId] = {}), used = sp[a.key] || 0, lbl = a.label || a.key, n = a.n || 1;
    if (used >= n) {
        if (moveMode(camp, 'acts') === 'refuse') return 'No ' + lbl + ' left this turn.';
        turnNote(conn, lbl + ': used past what a turn allows.', charId); toast((who || 'A character') + ' used a ' + lbl + ' past what a turn allows.'); if (typeof bellOut === 'function') bellOut(charId, { title: 'Turn', text: 'Used a ' + lbl + ' past what a turn allows.' });
    } else turnNote(conn, lbl + ': ' + (n - used - 1) + ' of ' + n + ' left this turn.', charId);
    sp[a.key] = used + 1; actsTell(camp, charId);
    return '';
}
function turnActsStart(mapId, c) {   // the character whose turn begins has its actions back
    var row = c && Array.isArray(c.rows) ? c.rows[c.turn] : null, camp = getActiveCampaign(); if (!row || typeof row.tokId !== 'string' || !camp || !actsOf(camp).length) return;
    var map = camp.items && own(camp.items, mapId) ? camp.items[mapId] : null, w = map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return x && x.id === row.tokId; }) : null;
    if (!w || typeof w.charId !== 'string') return;
    delete net.turnSpent[w.charId]; if (window.wpVtt && window.wpVtt.on('turns')) actsTell(camp, w.charId);
}
function turnActsEnd(mapId, had) {   // a combat ended: its characters' counts go (their sheets stop greying)
    var camp = getActiveCampaign(); if (!had || !camp || !actsOf(camp).length) return;
    var map = camp.items && own(camp.items, mapId) ? camp.items[mapId] : null; if (!map || !Array.isArray(had.rows) || !Array.isArray(map.whiteboard)) return;
    had.rows.forEach(function(r) { var w = r && r.tokId ? map.whiteboard.find(function(x) { return x && x.id === r.tokId; }) : null; if (w && typeof w.charId === 'string') { delete net.turnSpent[w.charId]; actsTell(camp, w.charId, true); } });
}
// [netcheck:turnacts-end]
// [netcheck:fxtime-start]
// Turn-based combat T5a (D9, D10): timed effects — each row's one remaining amount (systemcore fxTick) moves on the character's own turns in a
// combat, stops while a combat runs and starts again at its end, and runs by the clock outside combat (this machine checks every few seconds:
// the GM's own, hosting or alone). What runs out comes off, with a line for its player and the GM. Item 20 K4 (the owner's answer): with the
// Calendar on, time outside a fight runs by the game clock instead — the check only stops a clock still running (what ran is kept), and each
// move of the game clock on (never back) takes that much from every timed effect outside a fight (net.fxGameTime); switched off, they run again
function charCombat(camp, charId) {   // the combat a character's token is in, and its map id — or null
    var hit = null; if (!camp || !camp.items) return null;
    Object.keys(net.combats || {}).forEach(function(mid) { if (hit || !own(camp.items, mid)) return; var cb = net.combats[mid], mp = camp.items[mid];
        if (!cb || !Array.isArray(cb.rows) || !mp || !Array.isArray(mp.whiteboard)) return;
        if (cb.rows.some(function(r) { return r && r.tokId && mp.whiteboard.some(function(w) { return w && w.id === r.tokId && w.charId === charId; }); })) hit = { mapId: mid, combat: cb }; });
    return hit;
}
net.charInCombat = function(charId) { return !!(net.active && charCombat(getActiveCampaign(), charId)); };
function fxApply(camp, ch, kind, now, secs) {   // one tick of one character: its lists stored and sent, what ran out told (secs: the game clock's move, K4)
    var S = SC(); if (!S || !S.fxTick || !camp || !camp.system || !ch) return;
    var r = S.fxTick(camp.system, ch, kind, now, secs), ids = Object.keys(r.values); if (!ids.length) return;
    ch.values = ch.values || {}; ids.forEach(function(fid) { ch.values[fid] = r.values[fid]; }); ch.updated = now;
    saveRemoteSoon();
    if (net.active && net.role === 'host') net.syncCharDelta(ch.id, r.values);
    if (window.wpSheets) window.wpSheets.charChanged(ch.id);
    r.expired.forEach(function(nm) { fxEnded(ch, nm); });
}
function fxEnded(ch, name) {   // "Bless ran out on Pat." — a private line for the GM, and one for its player at the table
    var text = String(name).slice(0, 60) + ' ran out on ' + String(ch.name || 'a character').slice(0, 60) + '.', from = { id: net.myId || 'gm', name: 'GM', gm: true }, m = { type: 'chat', scope: 'whisper', from: from, text: text, ts: Date.now() };
    if (net.active && net.role === 'host' && ch.ownerId && !ch.npc) net.conns.forEach(function(c) { if (c.open && net.roster[c.peer] && peerProfileId(c) === ch.ownerId) { try { c.send(m); } catch (e) { sendFailed(e); } } });
    pushChat(m);
}
// [netcheck:timecard-start]
// Item 20 K5: a time rules summary (sheets.js runTimeRules) — a private line for the GM, and one for the character's player at the table unless it
// is the GM's alone (an NPC, or a rule that moves or reads what the player cannot see); and the Session Log's Time
net.timeCard = function(ch, text, gmOnly) {
    if (net.role === 'client' || net.stream || !ch || typeof ch !== 'object') return;
    var t = String(text || '').slice(0, 1500), m = { type: 'chat', scope: 'whisper', from: { id: net.myId || 'gm', name: 'GM', gm: true }, text: t, ts: Date.now() };
    if (!gmOnly && net.active && net.role === 'host' && ch.ownerId && !ch.npc) net.conns.forEach(function(c) { if (c.open && net.roster[c.peer] && peerProfileId(c) === ch.ownerId) { try { c.send(m); } catch (e) { sendFailed(e); } } });
    pushChat(m); logEvent('time', t);
};
// [netcheck:timecard-end]
function fxCombatChars(mapId, combat) { var camp = getActiveCampaign(); if (!camp || !camp.system) return []; var S = SC(), mp = camp && camp.items && own(camp.items, mapId) ? camp.items[mapId] : null; return S && S.combatChars && mp ? S.combatChars(mp, combat, camp.chars || {}).map(function(e) { return camp.chars[e.charId]; }).filter(Boolean) : []; }
function turnFxStart(mapId, c) {   // the character whose turn begins: a round of its timed effects passes
    var camp = getActiveCampaign(), row = c && Array.isArray(c.rows) ? c.rows[c.turn] : null; if (!camp || !row) return;
    fxCombatChars(mapId, { rows: [row] }).forEach(function(ch) { fxApply(camp, ch, 'turn', Date.now()); });
}
function fxCombatEdge(mapId, combat, kind) { var camp = getActiveCampaign(), now = Date.now(); fxCombatChars(mapId, combat).forEach(function(ch) { fxApply(camp, ch, kind, now); }); }   // bank at a combat's start, resume at its end
function fxClockTick() {   // out of combat: the clock, on the GM's own machine
    if (net.role === 'client' || net.stream || (window.wpVtt && !window.wpVtt.on('sheets'))) return;
    var camp = getActiveCampaign(), now = Date.now(); if (!camp || !camp.system || !camp.chars) return;
    var byGame = !!(window.wpVtt && window.wpVtt.on('calendar'));   // K4: the Calendar on — real time never counts outside a fight
    Object.keys(camp.chars).forEach(function(id) { if (charCombat(camp, id)) return; if (byGame) fxApply(camp, camp.chars[id], 'bank', now); else { fxApply(camp, camp.chars[id], 'resume', now); fxApply(camp, camp.chars[id], 'clock', now); } });
}
net.fxGameTime = function(secs) {   // K4: the game clock moved on secs seconds (calendar.js): every timed effect outside a fight runs that much
    if (net.role === 'client' || net.stream || typeof secs !== 'number' || !isFinite(secs) || !(secs > 0) || (window.wpVtt && (!window.wpVtt.on('sheets') || !window.wpVtt.on('calendar')))) return;
    var camp = getActiveCampaign(), now = Date.now(); if (!camp || !camp.system || !camp.chars) return;
    Object.keys(camp.chars).forEach(function(id) { if (!charCombat(camp, id)) fxApply(camp, camp.chars[id], 'game', now, secs); });
};
var _fxClock = null;
function fxClockStart() { if (!_fxClock && typeof setInterval === 'function') _fxClock = setInterval(function() { try { fxClockTick(); } catch (e) {} }, 5000); }
// [netcheck:fxtime-end]
function mapTitleOf(mapId) { var camp = getActiveCampaign(); var m = camp && camp.items[mapId]; return (m && m.meta && m.meta.title) || mapId; }
net.combatFor = function(mapId) { return net.active && net.combats[mapId] || null; };
// host: put a combat on a map (or take it off with null)
net.combatSet = function(mapId, combat) {
    if (net.role !== 'host') return;
    var had = net.combats[mapId];
    if (combat) {
        if (!had && typeof combatForget === 'function') combatForget(mapId);   // a new fight: what players saw in the last one there is no longer seen
        combat.mapId = mapId;
        net.combats[mapId] = cleanCombats({ m: combat }).m; net.combats[mapId].mapId = mapId;
        if (!had && typeof marksStart === 'function') { try { marksStart(mapId); } catch (e) { console.error(e); } }   // senses S4b: everyone's marks held from the fight's start
        if (had && typeof had.rr === 'number') net.combats[mapId].rr = had.rr;   // initiative O4: the last round the fight rolled for, and this round's side, kept through a roster edit
        if (had && (had.side === 'pc' || had.side === 'rest')) net.combats[mapId].side = had.side;
        if (typeof combatSides === 'function') combatSides(mapId, net.combats[mapId], !had);   // ...and each side together (a new fight rolls the sides first)
        if (!had || had.round !== net.combats[mapId].round) roundChanged(mapId, net.combats[mapId]);   // G10: the first round (a roster edit keeps its round)
        if (had && had.round !== net.combats[mapId].round && typeof clockRounds === 'function') clockRounds(net.combats[mapId].round - had.round);   // item 20 K2: a round edited in the roster moves the clock with it (a new fight moves nothing)
        if (!had) logEvent('table', 'Combat started on ' + mapTitleOf(mapId) + ': ' + combat.rows.map(function(r) { return r.name; }).join(', '));
        toast(had ? 'Combat roster updated.' : 'Combat started on ' + mapTitleOf(mapId) + ' — ' + (net.combats[mapId].rows[net.combats[mapId].turn] || net.combats[mapId].rows[0]).name + ' goes first.');
    } else {
        if (had) { try { turnActsEnd(mapId, had); } catch (e) { console.error(e); } }   // T4
        if (had) { try { fxCombatEdge(mapId, had, 'resume'); } catch (e) { console.error(e); } }   // T5a: their effects' clocks run again
        if (had && typeof clockFightEnd === 'function') clockFightEnd();   // item 20 K5 (the owner's answer): the fight's rounds counted as active time for the time rules
        if (had) { logEvent('table', 'Combat ended on ' + mapTitleOf(mapId) + ' after ' + had.round + ' round' + (had.round === 1 ? '' : 's')); toast('Combat ended on ' + mapTitleOf(mapId) + '.'); }
        delete net.combats[mapId];
        if (had && typeof marksEnd === 'function') { try { marksEnd(mapId); } catch (e) { console.error(e); } }   // senses S4b: the marks follow every move again
        if (typeof combatForget === 'function') combatForget(mapId);   // the fight over: nothing of it seen
    }
    broadcastCombats(); combatRefresh();
    if (combat && !had) { try { fxCombatEdge(mapId, net.combats[mapId], 'bank'); } catch (e) { console.error(e); } }   // T5a: their effects' clocks stop (what ran is kept)
    if (combat && !had) turnStarted(mapId, net.combats[mapId]);   // T2b: the first turn (after the broadcast: its player's note comes last)
};
// [netcheck:initfight-start]
// Initiative & turn order O1 (the owner's answer, "Into the fight, once"): a player's own roll of the system's initiative roll — the host
// rebuilt it from the entry (roll-req's act path) — sets their row's number in the combat on the map they are on, if the row has none yet
// (rolled or given by the GM), and the order re-sorts by initiative; whoever's turn it is keeps it. A second roll, a row with a number, no
// combat there, or no row of their character's token: nothing. Everyone gets the new order (never a number); the GM is told the number
function initIntoFight(camp, mapId, charId, pid, value) {
    if (net.role !== 'host' || typeof mapId !== 'string' || typeof charId !== 'string' || typeof pid !== 'string' || !pid || typeof value !== 'number' || !isFinite(value)) return false;
    var c = own(net.combats, mapId) ? net.combats[mapId] : null, map = camp && camp.items && own(camp.items, mapId) ? camp.items[mapId] : null; if (!c || !Array.isArray(c.rows) || !map || !Array.isArray(map.whiteboard)) return false;
    var mine = {}; map.whiteboard.forEach(function(w) { if (w && w.isChar && w.charId === charId && w.ownerId === pid && typeof w.id === 'string') mine[w.id] = 1; });
    var row = c.rows.find(function(r) { return r && typeof r.tokId === 'string' && mine[r.tokId] === 1; }); if (!row || row.rolled === 1) return false;
    var cur = c.rows[c.turn], S = SC();
    row.init = Math.max(-1e6, Math.min(1e6, Math.round(value * 100) / 100)); row.rolled = 1; delete row.tb;   // a new number: its old roll-offs go
    var tieIF = S && S.initTie ? S.initTie(camp.system, window.wpFormula, function(r) { var tk = r && typeof r.tokId === 'string' ? map.whiteboard.find(function(w) { return w && w.id === r.tokId; }) : null; return tk && typeof tk.charId === 'string' && camp.chars && own(camp.chars, tk.charId) ? camp.chars[tk.charId] : null; }) : null;   // initiative O2: the system's tie steps
    c.rows = S && S.orderByInit ? S.orderByInit(c.rows, tieIF) : c.rows;
    var at = cur ? c.rows.indexOf(cur) : 0; c.turn = at >= 0 ? at : 0;
    if (typeof combatSideOrder === 'function') combatSideOrder(camp, mapId, c);   // initiative O4: each side stays together
    toast((row.name || 'Someone') + ' rolled initiative: ' + row.init + ', now ' + (c.rows.indexOf(row) + 1) + ' of ' + c.rows.length + '.');
    logEvent('table', (row.name || 'Someone') + ' rolled initiative on ' + mapTitleOf(mapId) + ': ' + row.init);
    broadcastCombats(); combatRefresh();
    return true;
}
// [netcheck:initfight-end]
// [netcheck:initround-start]
// Initiative O4 (docs/TURN_ORDER_PLAN.md; for sides the owner's answer, "Players vs the rest, each round"): the system's other orders,
// combat.initiative. every: the first time the fight reaches a new round, every row whose token has a character rolls the system's initiative
// roll again through the sheet's own roll (a card on the table, or the GM's alone where its label would tell a GM-only value) and the order
// re-sorts with the tie steps; a row with no character keeps its number. side: the players' characters (a character token with a player) and
// everyone else each roll the system's sides roll when the fight starts and at each new round, again while they tie; the higher side goes
// first, each side's rows in their own order (a held row that acted keeps its place). The table sees which side is first on the strip, and
// each roll as its card
function initRulesOf(camp) { var s = camp && camp.system, ir = s && s.combat && typeof s.combat === 'object' ? s.combat.initiative : null; return ir && typeof ir === 'object' && !Array.isArray(ir) ? ir : null; }
function combatPcOf(camp, mapId) {   // a row's side: the players' for a character token with a player on that map, else the rest's
    var map = camp && camp.items && own(camp.items, mapId) ? camp.items[mapId] : null, pcs = Object.create(null);
    (map && Array.isArray(map.whiteboard) ? map.whiteboard : []).forEach(function(w) { if (w && w.isChar && typeof w.ownerId === 'string' && w.ownerId && typeof w.id === 'string') pcs[w.id] = 1; });
    return function(r) { return !!(r && typeof r.tokId === 'string' && pcs[r.tokId] === 1); };
}
function combatSideRoll(camp, mapId, c) {   // this round's side, c.side: a side alone goes first without a roll; a roll that fails keeps the side there was, or the players
    var ir = initRulesOf(camp), S = ir && typeof ir.side === 'string' && ir.side ? SC() : null; if (!S || !S.sideFirst) return;
    var isPc = combatPcOf(camp, mapId), nPc = c.rows.filter(isPc).length;
    if (!nPc || nPc === c.rows.length) { c.side = nPc ? 'pc' : 'rest'; return; }
    var why = '', label = { pc: 'Side initiative: the players', rest: 'Side initiative: the rest' };
    var got = S.sideFirst(function(side, k) { if (why) return null; var r = net.diceRoll(ir.side, { label: label[side] + (k ? ' (again)' : '') }); if (!r || r.error || typeof r.value !== 'number') { why = (r && r.error) || 'the roll failed.'; return null; } return r.value; });
    if (!got) { if (c.side !== 'pc' && c.side !== 'rest') c.side = 'pc'; toast('Side initiative: ' + why + ' ' + (c.side === 'pc' ? 'The players go first.' : 'The rest go first.')); return; }
    c.side = got.first;
    var said = 'Round ' + c.round + ' on ' + mapTitleOf(mapId) + ': the players rolled ' + got.rolls.pc.join(', then ') + ', the rest ' + got.rolls.rest.join(', then ') + '; ' + (got.first === 'pc' ? 'the players go first.' : 'the rest go first.');
    toast(said); logEvent('table', said);
}
function combatSideOrder(camp, mapId, c) {   // each side together, this round's first side first, the row on turn kept; the sides gone from the system: no side
    var ir = initRulesOf(camp); if (!ir || typeof ir.side !== 'string' || !ir.side) { delete c.side; return; }
    var S = c.side === 'pc' || c.side === 'rest' ? SC() : null; if (!S || !S.orderBySide) return;
    var cur = c.rows[c.turn]; c.rows = S.orderBySide(c.rows, combatPcOf(camp, mapId), c.side); var at = cur ? c.rows.indexOf(cur) : 0; c.turn = at >= 0 ? at : 0;
}
function combatSides(mapId, c, fresh) {   // a fight's start or a roster edit: the sides rolled if there is no side yet, then each side together (a new fight from its first)
    var camp = getActiveCampaign(), ir = initRulesOf(camp); if (!ir || typeof ir.side !== 'string' || !ir.side) { delete c.side; return; }
    if (c.side !== 'pc' && c.side !== 'rest') combatSideRoll(camp, mapId, c);
    combatSideOrder(camp, mapId, c); if (fresh) c.turn = 0;
}
function combatNewRound(mapId, c) {   // combatStep at a new round, once per round reached (a step back and on again rolls nothing); turn 0 is the new order's first
    var camp = getActiveCampaign(), ir = initRulesOf(camp); if (!ir || !camp) return;
    var every = ir.every === true, side = typeof ir.side === 'string' && !!ir.side, S = every || side ? SC() : null; if (!S) return;
    if (c.round <= (typeof c.rr === 'number' ? c.rr : 1)) return; c.rr = c.round;
    if (every && window.wpSheets && window.wpSheets.rollInit) {
        var map = camp.items && own(camp.items, mapId) ? camp.items[mapId] : null;
        var tokOf = function(r) { return r && typeof r.tokId === 'string' && map && Array.isArray(map.whiteboard) ? map.whiteboard.find(function(w) { return w && w.id === r.tokId; }) : null; };
        var charOf = function(r) { var tk = tokOf(r); return tk && tk.isChar && typeof tk.charId === 'string' && camp.chars && own(camp.chars, tk.charId) ? camp.chars[tk.charId] : null; };
        for (var i = 0, n = 0; i < c.rows.length; i++) {
            var ch = charOf(c.rows[i]); if (!ch) continue;
            var tkI = tokOf(c.rows[i]), rr = window.wpSheets.rollInit(ch.id, { priv: !!(tkI && tkI.hidden) }); if (rr && rr.error) { toast(rr.error); break; }   // no roll, dice off: said once, the rest keep their numbers; hidden pieces: a creature the GM hid rolls in private (its row reads Hidden on the table, and the card would name it)
            if (rr && typeof rr.value === 'number' && isFinite(rr.value)) { c.rows[i].init = Math.max(-1e6, Math.min(1e6, Math.round(rr.value * 100) / 100)); c.rows[i].rolled = 1; delete c.rows[i].tb; n++; }
        }
        if (n && S.orderByInit) c.rows = S.orderByInit(c.rows, S.initTie ? S.initTie(camp.system, window.wpFormula, charOf) : null);   // nothing rolled: the order as it was
    }
    c.turn = 0;
    if (side) combatSideRoll(camp, mapId, c);
    combatSideOrder(camp, mapId, c); c.turn = 0;
}
// [netcheck:initround-end]
net.combatStep = function(mapId, dir) {
    if (net.role !== 'host') return;
    var c = net.combats[mapId]; if (!c || !c.rows.length) return;
    var t = c.turn + (dir < 0 ? -1 : 1), r0 = c.round, t0 = c.turn;
    if (t >= c.rows.length) { t = 0; c.round += 1; }
    else if (t < 0) { if (c.round > 1) { c.round -= 1; t = c.rows.length - 1; } else t = 0; }
    c.turn = t;
    if (c.round !== r0) c.rows.forEach(function(r) { if (r) delete r.held; });   // initiative O3 (the owner's answer): a hold not used by the round's end is lost
    if (c.rows[t]) delete c.rows[t].held;   // ...and a row whose turn it is holds nothing
    if (c.round > r0 && typeof combatNewRound === 'function') { combatNewRound(mapId, c); t = c.turn; }   // initiative O4: a new round's order (rolled again, by side), the first time the fight reaches it
    if (c.round !== r0) roundChanged(mapId, c);   // G10
    if (c.round !== r0 && typeof clockRounds === 'function') clockRounds(c.round - r0);   // item 20 K2: a round moves the clock on by its length (a step back, back)
    toast((c.rows[t].name || 'Someone') + "'s turn" + (t === 0 && dir > 0 ? ' — round ' + c.round : '') + '.');
    broadcastCombats(); combatRefresh();
    if (c.round !== r0 || c.turn !== t0) turnStarted(mapId, c);   // T2b: whoever's turn it now is (nothing when a step back at the first turn moves nothing), after the broadcast
};
// [netcheck:turnhold-start]
// Initiative O3 (the owner's answer, "After the current turn"): the character whose turn it is holds it — play moves on as with Next turn and
// its row waits, held; later in the round, when its owner or the GM presses Act, the held row goes right after whoever is acting and keeps
// that place (it acts next). A hold not used by the round's end is lost (combatStep), and the character acts in its usual place
net.combatHold = function(mapId) {
    if (net.role !== 'host') return false;
    var c = own(net.combats, mapId) ? net.combats[mapId] : null, row = c && Array.isArray(c.rows) ? c.rows[c.turn] : null; if (!row) return false;
    row.held = 1; toast((row.name || 'Someone') + ' holds their turn.'); logEvent('table', (row.name || 'Someone') + ' held their turn on ' + mapTitleOf(mapId));
    net.combatStep(mapId, 1);   // play moves on (it broadcasts); a hold on the round's last turn is lost at once, as combatStep clears holds at a new round
    return true;
};
net.combatAct = function(mapId, rowId) {
    if (net.role !== 'host') return false;
    var c = own(net.combats, mapId) ? net.combats[mapId] : null; if (!c || !Array.isArray(c.rows) || typeof rowId !== 'string') return false;
    var i = c.rows.findIndex(function(r) { return r && r.id === rowId; }); if (i < 0 || i === c.turn || c.rows[i].held !== 1) return false;
    var row = c.rows.splice(i, 1)[0], t = c.turn - (i < c.turn ? 1 : 0); delete row.held;
    c.rows.splice(t + 1, 0, row); c.turn = t;
    toast((row.name || 'Someone') + ' acts next.'); logEvent('table', (row.name || 'Someone') + ' acted from a hold on ' + mapTitleOf(mapId));
    broadcastCombats(); combatRefresh();
    return true;
};
// [netcheck:turnhold-end]
net.combatEnd = function(mapId) {
    if (net.role !== 'host' || !net.combats[mapId]) return;
    var c = net.combats[mapId];
    showConfirm('End combat on ' + mapTitleOf(mapId) + '? Round ' + c.round + ', ' + c.rows.length + ' in the order. The ring and the turn strip go for everyone.', function(yes) { if (yes) net.combatSet(mapId, null); });
};
function targetersOf(itemId, mapId) {
    return Object.keys(net.targets).filter(function(pid) { var t = net.targets[pid]; return t && t.id === itemId && t.mapId === mapId; })
        .map(function(pid) { return { id: pid, name: net.targets[pid].name || 'Player', hue: playerHue(pid) }; });
}
net.targetersOf = targetersOf;
function cleanTargets(raw) {
    var out = {};
    if (raw && typeof raw === 'object') Object.keys(raw).slice(0, 64).forEach(function(pid) {
        var t = raw[pid];
        if (t && typeof t.id === 'string' && t.id.length <= 80 && typeof t.mapId === 'string' && t.mapId.length <= 80 && typeof pid === 'string' && pid.length <= 80) {
            out[pid] = { id: t.id, mapId: t.mapId, name: String(t.name || 'Player').slice(0, 40) };
        }
    });
    return out;
}
function applyTarget(pid, name, t) {
    if (t) net.targets[pid] = { id: t.id, mapId: t.mapId, name: name }; else delete net.targets[pid];
    render();
}
// Toggle my own target (client or host). itemName is only for the toast.
net.setTarget = function(itemId, mapId, itemName) {
    if (!net.active) return;
    var me = net.myId, cur = net.targets[me];
    var next = (cur && cur.id === itemId) ? null : { id: itemId, mapId: mapId };
    if (net.role === 'client') {
        var c0 = net.conns[0];
        if (c0 && c0.open) { try { c0.send({ type: 'target', id: next ? itemId : null, mapId: mapId }); } catch (e) { sendFailed(e); } }
        applyTarget(me, getProfile().name, next);   // show it at once; the host's broadcast confirms
    } else if (net.role === 'host') {
        applyTarget(me, getProfile().name || 'GM', next);
        broadcastTargets();
    }
    toast(next ? 'Targeting ' + (itemName || 'that token') + '. Click it again (or press Esc) to clear.' : 'Target cleared.');
};
net.clearMyTarget = function() { var t = net.targets[net.myId]; if (t) net.setTarget(t.id, t.mapId); };
// [netcheck:rangeto-start]
// Range penalties R2 (docs/RANGE_PLAN.md 3): what RangeMod and TargetDistance read in a player's roll or apply action — from their token to
// their own pointer's target on the map they are on: a character token their copy holds (never one the GM hid, nor on a fogged map one
// their sight drops), judged as their copy is, with every open drag at its start (fold M4); never their own token. null: the names read 0,
// so a roll never learns the distance to a creature its player cannot see. Their own sheet works the same out from their copy (sheets.js
// rangeFor)
function rangeTo(camp, map, mapId, tok, pid) {
    var S = SC(); if (!S || typeof S.rangeCtx !== 'function' || !camp || !map || !tok || typeof mapId !== 'string' || typeof pid !== 'string') return null;
    var t = net.targets && own(net.targets, pid) ? net.targets[pid] : null; if (!t || t.mapId !== mapId || typeof t.id !== 'string') return null;
    var judge = function() {
        var w = Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return !!x && x.id === t.id; }) : null;
        if (!w || !w.isChar || w.hidden || w === tok) return null;
        var drop = fogDrop(camp, map, pid); if (drop && drop[w.id]) return null;
        var vt = window.wpVtt, el = !vt || (vt.rulesOn ? vt.rulesOn('elevation') : vt.on('elevation'));
        var rc = S.rangeCtx(camp.system, map, tok, w, { F: window.wpFormula, elev: !!el }); if (rc) { rc.tid = w.id; rc.mapId = mapId; }   // R3: which target
        return rc;
    };
    return typeof fogLanded === 'function' ? fogLanded(mapId, judge) : judge();
}
// Range penalties R3 (docs/RANGE_PLAN.md, the owner's answer of 2026-09-29): a public roll that reads the range — RangeMod or
// TargetDistance, directly or through a value worked out from them — goes to its roller and the GM alone while another player on the
// target's map cannot see the target, so its card never tells them how far an unseen creature is. rangeReadBy: a FRESH resolver asked for
// every name the formula reads (a branch not taken counts: the card shows the text); rangeUnseen: another admitted, connected player on that
// map whose copy would not hold the target (one the GM hid, one gone, one their fogged copy drops), judged with every open drag at its start.
// rc: the token context's range ({ mod, dist, tid, mapId }); rollerPid: the roller's own profile ('' for the GM's own roll)
function rangeReadBy(S, sys, ch, F, tc, expr, row) {
    if (!S || typeof S.makeResolver !== 'function' || !sys || !ch || !F || typeof F.names !== 'function' || typeof expr !== 'string') return false;
    var base = S.makeResolver(sys, ch, F, tc); if (!base || typeof base.rangeRead !== 'function') return false;
    var v = row ? base.row(row.f, row.r) : base; if (!v) return false;
    (F.names(expr) || []).forEach(function(n) { var nm = typeof n === 'string' ? n : (n && typeof n.name === 'string' ? n.name : ''); if (nm) { try { v(nm); } catch (e) {} } });
    return base.rangeRead() === true;
}
function rangeUnseen(camp, rc, rollerPid) {
    if (!camp || !rc || typeof rc.tid !== 'string' || typeof rc.mapId !== 'string' || !camp.items || !own(camp.items, rc.mapId)) return false;
    var map = camp.items[rc.mapId];
    var judge = function() {
        var w = Array.isArray(map.whiteboard) ? map.whiteboard.find(function(x) { return !!x && x.id === rc.tid; }) : null, asked = Object.create(null);
        return Object.keys(net.roster || {}).some(function(peer) {
            var p = net.roster[peer]; if (!p || typeof p.id !== 'string' || p.id === rollerPid || asked[p.id] || p.location !== rc.mapId) return false;
            if (!(net.conns || []).some(function(c) { return c && c.peer === peer && c.open; })) return false;
            asked[p.id] = 1;
            if (!w || w.hidden) return true;
            var drop = fogDrop(camp, map, p.id); return !!(drop && drop[w.id]);
        });
    };
    return typeof fogLanded === 'function' ? fogLanded(rc.mapId, judge) : judge();
}
// [netcheck:rangeto-end]
/* ---------- handouts (host) ----------
   revealHandout(hid, playerIds|null): resize the picture, send it to those players (all connected
   when null), record it on camp.handoutReveals so late joiners and reconnects get it too. A room
   with r.handoutId reveals itself to a player whose token comes to rest inside it. */
// A player shares a journal entry: the host relays it (to one player, everyone, or the GM itself)
net.shareEntry = function(payload) {
    if (net.active && net.role === 'host') {
        if (!net.conns.some(function(c) { return c.open && net.roster[c.peer]; })) { toast('Nobody is connected to share with.'); return false; }
        return relayShare(Object.assign({ type: 'share' }, payload), null, { id: net.myId, name: getProfile().name || 'GM' }) !== false;
    }
    if (!net.active || net.role !== 'client' || !net.conns[0] || !net.conns[0].open) { toast('Join a session first.'); return false; }
    try { net.conns[0].send(Object.assign({ type: 'share' }, payload)); return true; } catch (e) { toast('Could not send that.'); return false; }
};
function relayShare(msg, conn, sender) {
    var sp = sender || (conn && net.roster[conn.peer]); if (!sp) return false;
    var en = msg.entry; if (!en || typeof en !== 'object') return;
    if (conn) {   // from a player: a few a minute, and a budget for the session (a share lands on the GM's disk or in another player's journal)
        if (!allow('share', { perMs: 1000, burst: 6, windowMs: 60000, table: 300 }, conn.peer)) return;
        if (en.data && !(en.data instanceof ArrayBuffer || ArrayBuffer.isView(en.data))) return;   // binary or nothing: a decoded map could claim any byteLength
        var szS = (en.data && en.data.byteLength) || (typeof en.text === 'string' ? en.text.length : 0);
        if ((_shareBytes[conn.peer] || 0) + szS > 60 * 1024 * 1024) return;
        _shareBytes[conn.peer] = (_shareBytes[conn.peer] || 0) + szS;
    }
    var kind = en.kind === 'image' ? 'image' : 'text';
    var to = msg.to === '*' || msg.to === 'gm' ? msg.to : (typeof msg.to === 'string' && msg.to.length <= 80 ? msg.to : null);
    if (!to) return;
    var camp = getActiveCampaign(); if (!camp) return;
    var out = {
        type: 'handout', campId: camp.id, gmId: getProfile().id, campaign: camp.name || '', gm: getProfile().name || 'GM',
        id: 'sh_' + String(sp.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 24) + '_' + String(en.id || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 30),
        title: String(en.title || '').slice(0, 120), caption: String(en.caption || '').slice(0, 4000),
        sharedBy: String(sp.name || 'A player').slice(0, 60), sharedById: sp.id, sharedNotes: String(en.notes || '').slice(0, 20000),
        tags: Array.isArray(en.tags) ? en.tags.slice(0, 8).map(function(t) { return String(t).slice(0, 24); }) : []
    };
    if (kind === 'text') { out.kind = 'text'; out.text = String(en.text || '').slice(0, 60000); }
    else {
        if (!(en.data && en.data.byteLength !== undefined) || en.data.byteLength > 6 * 1024 * 1024) return;
        out.mime = ({ 'image/png': 1, 'image/jpeg': 1, 'image/webp': 1 })[en.mime] ? en.mime : 'image/jpeg'; out.data = en.data;
    }
    var names = [];
    if (to === 'gm') { if (window.wpJournalReceive) window.wpJournalReceive(out); names.push('you'); }
    else net.conns.forEach(function(c) {
        var p = net.roster[c.peer];
        if (!c.open || !p || (conn && c === conn)) return;
        if (to !== '*' && p.id !== to) return;
        try { c.send(out); names.push(p.name || 'a player'); } catch (e) { sendFailed(e); }
    });
    if (names.length) toast((sp.name || 'A player') + ' shared "' + (out.title || 'a note') + '" with ' + names.join(', ') + '.');
    if (names.length) logEvent('share', (sp.name || 'A player') + ' shared "' + (out.title || 'a note') + '" with ' + names.join(', '));
}
net.revealHandout = function(hid, pids) {
    if (!net.active || net.role !== 'host') { toast('Host a session first.'); return; }
    var camp = getActiveCampaign(); var h = camp && camp.handouts && camp.handouts[hid];
    if (!h || !window.wpHandoutPayload) return;
    var targets = net.conns.filter(function(c) { var p = net.roster[c.peer]; return c.open && p && (!pids || pids.indexOf(p.id) >= 0); });
    if (!targets.length) { toast('Nobody to show it to right now.'); return; }
    window.wpHandoutPayload(h).then(function(pl) {
        targets.forEach(function(c) {
            var p = net.roster[c.peer];
            try { c.send(pl.kind === 'text'
                ? { type: 'handout', kind: 'text', campId: camp.id, gmId: getProfile().id, campaign: camp.name || '', gm: getProfile().name || 'GM', id: h.id, title: h.title || '', caption: h.caption || '', text: pl.text, tags: (h.tags || []).slice(0, 8) }
                : { type: 'handout', campId: camp.id, gmId: getProfile().id, campaign: camp.name || '', gm: getProfile().name || 'GM', id: h.id, title: h.title || '', caption: h.caption || '', mime: pl.mime, data: pl.data, tags: (h.tags || []).slice(0, 8) }); } catch (e) { sendFailed(e, 'handout'); return; }   // refused: not recorded as shown
            camp.handoutReveals = camp.handoutReveals || {};
            camp.handoutReveals[p.id] = camp.handoutReveals[p.id] || {};
            camp.handoutReveals[p.id][h.id] = Date.now();
            camp.handoutLog = (camp.handoutLog || []).concat([{ hid: h.id, pid: p.id, name: p.name || '', at: Date.now() }]).slice(-2000);   // history: survives a re-queue
        });
        net.applyingRemote = true; save(true); net.applyingRemote = false;
        document.dispatchEvent(new CustomEvent('wp-handout-revealed'));
        toast('"' + (h.title || 'Handout') + '" shown to ' + targets.map(function(c) { return net.roster[c.peer].name || 'a player'; }).join(', ') + '.');
        logEvent('handout', '"' + (h.title || 'Handout') + '" shown to ' + targets.map(function(c) { return net.roster[c.peer].name || 'a player'; }).join(', '));
    }).catch(function() { toast('Could not prepare that picture.'); });
};
// Everything already revealed to this player, sent again (their journal keeps one copy per handout)
function sendMissedHandouts(conn, prof) {
    var camp = getActiveCampaign(); if (!camp) return;
    // Handouts marked for everyone on join (autoOnJoin) OR assigned to this specific player
    // (h.giveTo{pid}) that this player has not had yet — camp.giveTo is per-campaign, so it never
    // reaches a player in a different campaign.
    Object.values(camp.handouts || {}).forEach(function(h, i) {
        if (!h.autoOnJoin && !(h.giveTo && h.giveTo[prof.id])) return;
        if (camp.handoutReveals && camp.handoutReveals[prof.id] && camp.handoutReveals[prof.id][h.id]) return;
        setTimeout(function() { if (conn.open) net.revealHandout(h.id, [prof.id]); }, 3000 + i * 600);
    });
    if (!camp.handoutReveals || !camp.handoutReveals[prof.id]) return;
    Object.keys(camp.handoutReveals[prof.id]).forEach(function(hid, i) {
        var h = camp.handouts && camp.handouts[hid]; if (!h || !window.wpHandoutPayload) return;
        setTimeout(function() {
            window.wpHandoutPayload(h).then(function(pl) {
                if (!conn.open) return;
                try { conn.send(pl.kind === 'text'
                    ? { type: 'handout', kind: 'text', campId: camp.id, gmId: getProfile().id, campaign: camp.name || '', gm: getProfile().name || 'GM', id: h.id, title: h.title || '', caption: h.caption || '', text: pl.text, replay: true, tags: (h.tags || []).slice(0, 8) }
                    : { type: 'handout', campId: camp.id, gmId: getProfile().id, campaign: camp.name || '', gm: getProfile().name || 'GM', id: h.id, title: h.title || '', caption: h.caption || '', mime: pl.mime, data: pl.data, replay: true, tags: (h.tags || []).slice(0, 8) }); } catch (e) { sendFailed(e, 'handout'); }
            }).catch(function() {});
        }, 1500 + i * 400);
    });
}
// The room a token is standing in (its centre inside a floor item linked to a room)
function roomUnder(item, map) {
    if (!item || !map || !map.whiteboard) return null;
    var cx = item.x + (item.w || 0) / 2, cy = item.y + (item.h || 0) / 2, best = null, bestArea = Infinity;
    map.whiteboard.forEach(function(o) {
        if (o.id === item.id || !o.nodeId) return;
        var ow = o.w || 0, oh = o.h || 0;
        if (cx < o.x || cx > o.x + ow || cy < o.y || cy > o.y + oh) return;
        if (ow * oh < bestArea) { bestArea = ow * oh; best = o; }
    });
    if (!best) return null;
    return (map.rooms || []).find(function(r) { return r.id === best.nodeId; }) || null;
}
// Host: any player's token now resting in a room that carries a handout they haven't seen
function checkRoomHandouts(map) {
    if (!net.active || net.role !== 'host' || !map || map.type !== 'map') return;
    var camp = getActiveCampaign(); if (!camp || !camp.handouts) return;
    (map.whiteboard || []).forEach(function(w) {
        if (!w.isChar || !w.ownerId) return;
        var r = roomUnder(w, map); if (!r || !r.handoutId || !camp.handouts[r.handoutId]) return;
        var seen = camp.handoutReveals && camp.handoutReveals[w.ownerId] && camp.handoutReveals[w.ownerId][r.handoutId];
        if (seen) return;
        if (!Object.values(net.roster).some(function(p) { return p && p.id === w.ownerId; })) return;   // only to someone connected
        net.revealHandout(r.handoutId, [w.ownerId]);
    });
}
net.checkRoomHandouts = checkRoomHandouts;
net.isPresent = function(ownerId, mapId) {
    if (!net.active || net.stream) return true;                    // solo, or the stream window: everything shows
    if (net.role === 'client' && ownerId === net.myId) return true;
    var live = Object.values(net.roster).find(function(p) { return p && p.id === ownerId; });
    if (live) return live.location === mapId;
    return awayMap()[ownerId] === mapId;                            // left the table: their character stays where they were, nowhere else
};

// A host-side heal: a player whose record names no character they still own has the one they play written down (their only one, or a
// guess that goes in the Session Log) — the same rule syncOwners heals with (systemcore migrateBindings, binding only)
function healBindings(camp) {
    var S = SC(); if (!S || !S.migrateBindings || !camp) return;
    var r = S.migrateBindings(camp, { link: false });
    r.guesses.forEach(function(g) { var ch = (camp && camp.chars && typeof g.id === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, g.id) ? camp.chars[g.id] : null), rec = own(camp.players, g.pid) ? camp.players[g.pid] : null; if (ch) logEvent('char', ((rec && rec.name) || 'A player') + ' plays ' + ch.name + ' (their other characters are kept) \u2014 change it in System \u25B8 Characters'); });
}
// The campaign's sheets feature: off, characters do not drive tokens (every owned one counts as in play; none is made on arrival)
function sheetsOnFor(camp) { return !window.wpVtt || !window.wpVtt.campaignOn || window.wpVtt.campaignOn('sheets', camp) !== false; }
// A new token for a character that has none anywhere: its portrait, else a circle in the player's colour (the initials show on it) — its caller
// then gives it the map's cell shape (systemcore shapeStandIn)
function tokenFromChar(ch, pid) {
    var pr = Object.values(net.roster).find(function(p) { return p && p.id === pid; }), col = pr && typeof pr.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(pr.color) ? pr.color : '#4db3d3';
    var t = { id: 'wb' + Math.random().toString(36).slice(2, 10), type: ch.portrait ? 'image' : 'circle', w: 60, h: 52, color: ch.portrait ? 'transparent' : col, layer: 'middle', isChar: true, charName: ch.name, name: ch.name, charId: ch.id, charStats: '', ownerId: pid };
    if (ch.portrait) t.src = ch.portrait;
    else { var fcT = cleanFace(ch.face); if (fcT) t.face = fcT; }   // Onboarding F1c: the character's own face (a token made after it was chosen wears it too)
    return t;
}
// Where a new token goes on a map: beside `near` (a centre) when given, else on the landing room's whiteboard item, else at the map's home;
// then the nearest free spot (never on another token, off the portal it landed by). avoidId: a token that is about to give way (not an obstacle)
function spawnSpot(map, landRoomId, near, w, h, avoidId) {
    var meta = map.meta || {}, landR = !near && landRoomId && (map.rooms || []).find(function(r) { return r.id === landRoomId; });
    var landPt = landR && landingPoint(map, landR);
    var sx = near ? near.x : (landPt && landPt.wbX != null) ? landPt.wbX : (meta.homeX || 15000);
    var sy = near ? near.y : (landPt && landPt.wbY != null) ? landPt.wbY : (meta.homeY || 15000);
    return freeSpotNear(map, sx, sy, w, h, avoidId, landPt && landPt.wbItemId ? (map.whiteboard || []).find(function(o) { return o.id === landPt.wbItemId; }) : null);
}
/* Host: player P's token on map M, through ONE resolver (systemcore tokenSourceFor) shared with Bring and the GM's walk through a portal:
   their own token of the character they play; else an unowned one of it, adopted; else a copy of theirs from another map (never another
   player's); else a token bound only by name, linked; else a new token from the character. Then ONE chooser (ownedTokenPlan) leaves one
   owned token per character on this map: extra copies pass to GM control, still linked. A player without a character keeps the old name
   binding, which never takes another player's token or one the GM took back. opts: { keep, near: {x, y} (a give: beside their old token) } */
function ensurePlayerToken(pid, mapId, landRoomId, opts) {
    if (net.role !== 'host') return false;
    var camp = getActiveCampaign(), S = SC();
    if (!camp || !S || !S.tokenSourceFor) return false;
    var map = camp.items[mapId];
    if (!map || map.type !== 'map') return false;
    opts = opts || {};
    if (window.wpHistFlush) window.wpHistFlush();   // the GM's pending edit is its own step before a token is spawned or adopted for the player
    healBindings(camp);
    var pl = own(camp.players, pid) ? camp.players[pid] : {};
    var changed = false, keepId = typeof opts.keep === 'string' ? opts.keep : '', nw = null;
    map.whiteboard = map.whiteboard || [];
    var sheetsOn = sheetsOnFor(camp), src = S.tokenSourceFor(camp, pid, mapId, { noSpawn: !sheetsOn });
    if (src.op === 'adopt' || (src.op === 'link' && src.here)) { src.tok.ownerId = pid; if (src.charId) src.tok.charId = src.charId; keepId = src.tok.id; changed = true; }
    else if (src.op === 'clone' || src.op === 'link') { nw = JSON.parse(JSON.stringify(src.tok)); delete nw.threats; delete nw.hidden; nw.id = 'wb' + Math.random().toString(36).slice(2, 10); nw.ownerId = pid; if (src.charId) nw.charId = src.charId; }   // 5h: threat marks belong to the map they were set on
    else if (src.op === 'spawn' && (camp && camp.chars && typeof src.charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, src.charId) ? camp.chars[src.charId] : null)) nw = tokenFromChar((camp && camp.chars && typeof src.charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, src.charId) ? camp.chars[src.charId] : null), pid);
    if (nw && S.shapeStandIn) S.shapeStandIn(nw, map);   // grid-shaped tokens: a new token, or one copied from another map, takes this map's cell shape
    if (nw) {
        // beside the token they had (a give), else where their waiting token stands (it gives way: Onboarding F1a), else on the landing
        // room's whiteboard item when there is one, else at home
        var waitHere = S.waitingTokensOf ? S.waitingTokensOf(camp, pid).filter(function(x) { return x.mapId === mapId; })[0] : null;
        var near = opts.near && isFinite(opts.near.x) && isFinite(opts.near.y) ? opts.near : waitHere ? { x: (Number(waitHere.w.x) || 0) + (waitHere.w.w || 60) / 2, y: (Number(waitHere.w.y) || 0) + (waitHere.w.h || 52) / 2 } : null;
        var spot = spawnSpot(map, landRoomId, near, nw.w || 60, nw.h || 52, waitHere ? waitHere.w.id : null);
        nw.x = spot.x; nw.y = spot.y;
        if (window.wpSeatCell) window.wpSeatCell(nw, map); else if (window.wpSeatHex) window.wpSeatHex(nw, map);
        map.whiteboard.push(nw);
        keepId = nw.id; changed = true;
        toast((pl.name || 'Player') + "'s token " + (src.op === 'spawn' ? 'made' : 'placed') + ' on ' + ((map.meta || {}).title || mapId) + '.');
    }
    var ops = S.ownedTokenPlan(camp, { keep: keepId, mapId: mapId, all: !sheetsOn });
    if (ops.length) {
        S.applyOwnerOps(camp, ops); changed = true;
        if (ops.some(function(o) { return !o.ownerId; })) toast('A second copy of ' + (pl.name || 'a player') + '\u2019s token on this map passes to GM control (still linked to the character).');
    }
    var wMaps = settleWaiting(camp, pid, map, src.op, landRoomId, opts.near && isFinite(opts.near.x) && isFinite(opts.near.y) ? opts.near : null);   // Onboarding F1a: a waiting token when they have nothing here, gone once they have a token
    if (wMaps.length) changed = true;
    if (changed) {
        net.applyingRemote = true; save(true); net.applyingRemote = false;
        net.broadcastItemFiltered(camp.id, mapId);
        wMaps.forEach(function(id) { if (id !== mapId) net.broadcastItemFiltered(camp.id, id); });   // the map their waiting token left
        var myActive = getActiveCampaign();
        if (myActive && (myActive.activeItemId === mapId || wMaps.indexOf(myActive.activeItemId) >= 0)) render();
    }
    return changed;
}

/* ---------- Onboarding F1a: the waiting token ---------- */
// [netcheck:waiting-start]
// A connected player who has nothing on the map they are on gets a WAITING token: their face in a dashed circle they may move, which is
// not a character (every character gate refuses it; the few places that take it name it). The host alone makes, moves and removes it:
// one per player per campaign, moved from map to map (a fresh id on each: never two items with one id on a map), gone the moment they have a token, three minutes after they leave, at a
// ban, a Forget and the end of the session — and never kept in a save, an export, an import or an undo. The GM's Remove (or Delete) keeps
// it away for the rest of the session. No history barrier anywhere: the GM's undo stays whole.
var _noWaiting = Object.create(null), _waitGrace = Object.create(null), WAIT_GRACE_MS = 180000;
function waitingRosterOf(pid) { return Object.values(net.roster).find(function(p) { return p && p.id === pid; }) || null; }
function removeFromMap(camp, mapId, wbId) { var m = own(camp.items, mapId) ? camp.items[mapId] : null; if (m && Array.isArray(m.whiteboard)) m.whiteboard = m.whiteboard.filter(function(w) { return !(w && w.id === wbId); }); }
function removeWaiting(camp, pid) {
    var S = SC(), maps = [];
    if (!S || !S.waitingTokensOf) return maps;
    S.waitingTokensOf(camp, pid).forEach(function(x) { removeFromMap(camp, x.mapId, x.w.id); if (maps.indexOf(x.mapId) < 0) maps.push(x.mapId); });
    return maps;
}
function placeWaiting(camp, pid, map, landRoomId, near) {
    var S = SC(), mine = S.waitingTokensOf(camp, pid), maps = [], add = function(id) { if (maps.indexOf(id) < 0) maps.push(id); };
    var keep = mine.filter(function(x) { return x.mapId === map.id; })[0] || mine[0] || null;
    mine.forEach(function(x) { if (!keep || x.w !== keep.w) { removeFromMap(camp, x.mapId, x.w.id); add(x.mapId); } });   // never two
    var pr = waitingRosterOf(pid), nm = cleanRosterName(pr && pr.name), col = pr && typeof pr.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(pr.color) ? pr.color : '#4db3d3', fc = pr ? cleanFace(pr.face) : '';
    var dress = function(t) { t.name = nm; t.color = col; if (fc) t.face = fc; else delete t.face; };   // F1b: the face goes with it, for the GM while its player is away
    if (keep && keep.mapId === map.id) {   // already here: it stays where it stands (a map whose grid changed reshapes it)
        var reW = S.shapeStandIn ? S.shapeStandIn(keep.w, map) : false; if (reW) { if (window.wpSeatCell) window.wpSeatCell(keep.w, map); else if (window.wpSeatHex) window.wpSeatHex(keep.w, map); }
        if (reW || keep.w.name !== nm || keep.w.color !== col || (keep.w.face || '') !== fc) { dress(keep.w); add(map.id); }
        return maps;
    }
    var cW = S.tokenCell ? S.tokenCell(map) : { type: 'circle', w: 60, h: 52 };   // grid-shaped tokens: the map's cell shape (a circle with no grid)
    var w = keep ? keep.w : { id: 'wb' + Math.random().toString(36).slice(2, 10), type: cW.type, waiting: 1, ownerId: pid, w: cW.w, h: cW.h, layer: 'middle' };
    if (keep && S.shapeStandIn) S.shapeStandIn(w, map);   // moved in from another map: this map's cell shape
    if (keep) { removeFromMap(camp, keep.mapId, w.id); add(keep.mapId); w.id = 'wb' + Math.random().toString(36).slice(2, 10); }   // a fresh id on each map: never two items with one id there
    dress(w);
    var spot = spawnSpot(map, landRoomId, near || null, w.w || 60, w.h || 52, null);   // beside the token they lost (a give away), else the landing room or home
    w.x = spot.x; w.y = spot.y;
    if (window.wpSeatCell) window.wpSeatCell(w, map); else if (window.wpSeatHex) window.wpSeatHex(w, map);
    map.whiteboard = map.whiteboard || []; map.whiteboard.push(w); add(map.id);
    if (!keep) { var t = nm + ' has no character yet \u2014 a waiting token on ' + ((map.meta || {}).title || 'a map'); toast(t + '.'); logEvent('char', t); }
    return maps;
}
// After the resolver (op) or a tidy (null): place, move or remove player pid's waiting token for the map they are on. Returns the maps it changed.
function settleWaiting(camp, pid, map, op, landRoomId, near) {
    var S = SC(); if (!S || !S.waitingNeed) return [];
    var need = S.waitingNeed(camp, pid, map.id, op, S.newPlayerRules(camp), !!_noWaiting[pid]);
    return need === 'place' ? placeWaiting(camp, pid, map, landRoomId, near) : need === 'remove' ? removeWaiting(camp, pid) : [];
}
function waitingChanged(camp, maps) {
    if (!maps || !maps.length) return;
    if (window.wpHistFlush) window.wpHistFlush();   // the GM's pending edit is its own step first (the ensurePlayerToken pattern)
    net.applyingRemote = true; save(true); net.applyingRemote = false;
    if (net.active && net.role === 'host') maps.forEach(function(id) { net.broadcastItemFiltered(camp.id, id); });
    var a = getActiveCampaign(); if (a && maps.indexOf(a.activeItemId) >= 0) render();
    if (window.wpRenderPartyStrip) window.wpRenderPartyStrip();
}
function startWaitGrace(pid) {
    if (_waitGrace[pid]) clearTimeout(_waitGrace[pid]);
    _waitGrace[pid] = setTimeout(function() {
        delete _waitGrace[pid];
        if (!net.active || net.role !== 'host' || net.isConnected(pid)) return;
        var camp = getActiveCampaign(); if (camp) waitingChanged(camp, removeWaiting(camp, pid));
    }, WAIT_GRACE_MS);
}
// A ban or a kick: their waiting token goes at once, whether they are still here or inside the grace
function dropWaitingFor(pid) {
    if (_waitGrace[pid]) { clearTimeout(_waitGrace[pid]); delete _waitGrace[pid]; }
    var camp = getActiveCampaign(); if (camp) waitingChanged(camp, removeWaiting(camp, pid));
}
function endWaiting(wasHost) {
    Object.keys(_waitGrace).forEach(function(k) { clearTimeout(_waitGrace[k]); });
    _waitGrace = Object.create(null); _noWaiting = Object.create(null);
    var camp = wasHost ? getActiveCampaign() : null; if (!camp) return;
    var any = false;
    Object.keys(camp.items || {}).forEach(function(id) { var m = camp.items[id]; if (m && m.type === 'map' && Array.isArray(m.whiteboard)) { var n = m.whiteboard.length; m.whiteboard = m.whiteboard.filter(function(w) { return !(w && w.waiting); }); if (m.whiteboard.length !== n) any = true; } });
    if (any) setTimeout(render, 0);
}
// Host, the GM's hands: Remove (it stays away this session), Delete or Cut (the same), a give (they may get one again), Hide or Show
// Onboarding F1c: the owner changes their character's picture: a face (as the picker offers) or a picture they upload (a small data URL,
// checked whole). The GM's machine saves it; every token of the character follows. done({ ok } | { error })
var _picPending = {};
net.charPic = function(charId, face, img, done) {
    var camp = getActiveCampaign();
    if (!camp || !net.active || net.role !== 'client' || net.stream) return { error: 'Not at a table.' };
    if (!net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    if (net.paused || net.selfPaused) return { error: 'The table is paused.' };
    if (window.wpVtt && !window.wpVtt.on('sheets')) return { error: 'Character sheets are off here.' };
    var c = camp.chars && own(camp.chars, charId) ? camp.chars[charId] : null; if (!c || c.partial || c.npc || !c.ownerId || c.ownerId !== net.myId) return { error: 'That character is not yours.' };
    var f = cleanFace(face || ''), im = typeof img === 'string' ? img : '';
    if (im && !safeAvatar(im)) return { error: 'That picture could not be used.' };
    if (!f && !im) return { error: 'Choose a face or a picture.' };
    var rid = 'p' + Math.random().toString(36).slice(2, 10);
    _picPending[rid] = { done: done, timer: setTimeout(function() { var p = _picPending[rid]; delete _picPending[rid]; if (p && typeof p.done === 'function') p.done({ error: 'No answer from the GM.' }); }, 20000) };
    var m = { type: 'char-pic', rid: rid, charId: charId, face: f }; if (im) m.img = im;
    try { net.conns[0].send(m); } catch (e) { clearTimeout(_picPending[rid].timer); delete _picPending[rid]; return { error: 'Could not reach the GM.' }; }
    return { ok: true, pending: true };
};
// Onboarding F3: a player's own character — start one (in the making: theirs alone, every field they can see theirs to set), name it while it is,
// say it is done (it goes live; an unlocked one locks again). done({ ok, charId? } | { error }); a GM whose Waypoint has none of this never answers
var _mkPending = {};
var MK_WHY = { making: 'Finish the character you are making first (press Done on its sheet).', nomap: 'Wait until your GM brings you to a map.', paused: 'The table is paused.', closed: 'Making a character is not open at this table.', have: 'You already play a character here.', busy: 'Too many characters are being made at this table right now.', slow: 'A moment, please.', missing: 'That character is gone.', owner: 'That character is not yours.', notmaking: 'That character is finished already.', bad: 'That name cannot be used.', off: 'Character sheets are off here.' };
var TOK_WHY = { paused: 'The table is paused.', slow: 'A moment between pictures, please.', missing: 'That token is no longer here (it may have moved to another map).', tokowner: 'That token is not yours.', locked: 'The GM has locked that token.', bad: 'That picture could not be used.', off: 'The GM cannot take pictures here.', failed: 'The GM could not save that picture.' };   // tok-pic's answers, read by what we asked
var LIGHT_WHY = { paused: 'The table is paused.', slow: 'A moment between changes of light, please.', missing: 'That token is no longer here (it may have moved to another map).', tokowner: 'That token is not yours.', locked: 'The GM has locked that token.', lightlock: 'The GM has locked that token\u2019s light.', preset: 'That light is no longer on offer (the GM changed the list).', nolight: 'That token carries no light to switch.', cap: 'This map already has the most light sources it can hold.', off: 'The GM cannot take a light here.' };   // tok-light's answers, read by what we asked
function mkSend(type, m, done) {
    if (!net.active || net.role !== 'client' || net.stream) return { error: 'Not at a table.' };
    if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return { error: 'Not at the table yet.' };
    if (net.paused || net.selfPaused) return { error: 'The table is paused.' };
    var rid = 'k' + Math.random().toString(36).slice(2, 10);
    _mkPending[rid] = { kind: type, done: done, timer: setTimeout(function() { var p = _mkPending[rid]; delete _mkPending[rid]; if (p && typeof p.done === 'function') p.done({ error: 'No answer from the GM (their Waypoint may not have this yet).' }); }, 20000) };
    m.type = type; m.rid = rid;
    try { net.conns[0].send(m); } catch (e) { clearTimeout(_mkPending[rid].timer); delete _mkPending[rid]; return { error: 'Could not reach the GM.' }; }
    return { ok: true, pending: true };
}
net.charMake = function(name, done) { return mkSend('char-make', { name: cleanCharName(name) }, done); };
net.charName = function(charId, name, done) { var nm = cleanCharName(name); if (!nm) return { error: 'That name cannot be used.' }; return mkSend('char-name', { charId: String(charId), name: nm }, done); };
net.charDone = function(charId, done) { return mkSend('char-done', { charId: String(charId) }, done); };
// Onboarding F3b: Just a token — a name and their face, and they play at once (sheets on: an empty character, unlocked; off: a plain token)
net.charToken = function(name, done) { return mkSend('char-token', { name: cleanCharName(name) }, done); };
// The token creator (owner, 2026-09-27): a player's framed picture for their own plain token (a character's goes through char-pic)
net.tokPic = function(mapId, wbId, img, done) { if (!safeAvatar(img)) return { error: 'That picture cannot be used.' }; return mkSend('tok-pic', { mapId: String(mapId), wbId: String(wbId), img: img }, done); };
// Lighting L5 (owner answer 3): a player's own light — their token's light switched on or off (o.on), or one of the system's presets the GM
// ticked "players may pick", named by its place in the list and its name (o.preset, o.name). Never a radius: the host takes no number of a
// light from a player, it copies the light from its own list
net.tokLight = function(mapId, wbId, o, done) {
    var m = { mapId: String(mapId), wbId: String(wbId), on: !(o && o.on === false) };
    if (o && o.preset !== undefined) { if (typeof o.preset !== 'number' || Math.floor(o.preset) !== o.preset || o.preset < 0 || o.preset > 99 || typeof o.name !== 'string' || !o.name) return { error: 'That light cannot be picked.' }; m.preset = o.preset; m.name = o.name.slice(0, 120); }
    return mkSend('tok-light', m, done);
};
// Onboarding F1b: a player's changed face reaches the host (their roster entry; everyone's view of their waiting token follows)
net.sendMyLook = function() {
    if (!net.active || net.role !== 'client' || net.paused || net.selfPaused || !net.syncedPeer || !net.conns[0] || !net.conns[0].open || net.conns[0].peer !== net.syncedPeer) return false;
    try { net.conns[0].send({ type: 'my-look', face: getProfile().face || '' }); } catch (e) { sendFailed(e); return false; }
    return true;
};
// Their own roster entry is the host's word: when it disagrees with the face they chose (a pick while paused, while waiting to be let in,
// or one the host's limit dropped), it is sent again — a moment later, once — on every roster and when a pause lifts
var _lookTimer = null;
net.reconcileLook = function() {
    if (!net.active || net.role !== 'client' || net.paused || net.selfPaused || !net.syncedPeer || _lookTimer) return;
    var differs = function() { var me = own(net.roster, net.myId) ? net.roster[net.myId] : null; return !!me && (me.face || '') !== cleanFace(getProfile().face || ''); };
    if (!differs()) return;
    _lookTimer = setTimeout(function() { _lookTimer = null; if (differs()) net.sendMyLook(); }, 1200);
};
net.removeWaiting = function(pid) { if (!net.active || net.role !== 'host' || typeof pid !== 'string' || !pid) return false; var camp = getActiveCampaign(); if (!camp) return false; _noWaiting[pid] = 1; var ms = removeWaiting(camp, pid); waitingChanged(camp, ms); return ms.length > 0; };
net.noWaiting = function(pid) { if (typeof pid === 'string' && pid) _noWaiting[pid] = 1; };
net.allowWaiting = function(pid) { if (typeof pid === 'string') delete _noWaiting[pid]; };
net.hideWaiting = function(pid, hide) {
    if (!net.active || net.role !== 'host') return false;
    var camp = getActiveCampaign(), S = SC(); if (!camp || !S || !S.waitingTokensOf) return false;
    var maps = [];
    S.waitingTokensOf(camp, pid).forEach(function(x) { if (!!x.w.hidden !== !!hide) { if (hide) x.w.hidden = true; else delete x.w.hidden; if (maps.indexOf(x.mapId) < 0) maps.push(x.mapId); } });
    waitingChanged(camp, maps);
    return maps.length > 0;
};
// A setting changed mid-session (Players without a character): every connected player's waiting token follows, and nothing else moves
// o: { quiet (an undo: the caller saves and sends; returns the maps), mapId (only players on that map) }
net.tidyWaiting = function(o) {
    o = o || {};
    if (!net.active || net.role !== 'host') return [];
    var camp = getActiveCampaign(), S = SC(); if (!camp || !S) return [];
    var maps = [], add = function(ids) { ids.forEach(function(id) { if (maps.indexOf(id) < 0) maps.push(id); }); };
    if (S.newPlayerRules(camp).token === 'off') {   // off: every waiting token goes, an away player's too
        var owners = [];
        Object.keys(camp.items || {}).forEach(function(k) { var m = camp.items[k]; if (m && m.type === 'map' && Array.isArray(m.whiteboard)) m.whiteboard.forEach(function(w) { if (w && w.waiting && typeof w.ownerId === 'string' && owners.indexOf(w.ownerId) < 0) owners.push(w.ownerId); }); });
        owners.forEach(function(pid) { add(removeWaiting(camp, pid)); });
    } else Object.values(net.roster).forEach(function(p) { var m = p && typeof p.location === 'string' && own(camp.items, p.location) ? camp.items[p.location] : null; if (m && m.type === 'map' && (!o.mapId || m.id === o.mapId)) add(settleWaiting(camp, p.id, m, null, null)); });
    if (!o.quiet) waitingChanged(camp, maps);
    return maps;
};
// [netcheck:waiting-end]

/* ---------- join gate: password, session bans, GM approval ---------- */
var bannedIds = {};        // profile id -> true, for this session only
var pendingJoins = [];     // [{conn, prof}] awaiting the GM's Allow/Deny
var approvalOpen = false;
var approvedIds = {};      // profile id -> true: the GM said yes, but that connection was already gone — next attempt goes straight in

function denyJoin(conn, reason) {
    try { conn.send({ type: 'denied', reason: reason }); } catch (e) { sendFailed(e); }
    setTimeout(function() { try { conn.close(); } catch (e) {} }, 400);
}

function admitPlayer(conn, prof, provenKey) {
    if (!conn.open) return;
    if (_waitGrace[prof.id]) { clearTimeout(_waitGrace[prof.id]); delete _waitGrace[prof.id]; }   // Onboarding F1a: back inside the grace, their waiting token is where they left it
    var issuedKey = null;
    var land = landingFor(prof);   // their own last map or the fallback under "Player's last location", else the GM's stage
    prof.location = land.stage ? land.stage.itemId : null;
    prof.detached = land.detached;
    net.roster[conn.peer] = prof;
    renderRoster();
    toast((prof.name || 'A player') + ' joined.');
    logEvent('player', (prof.name || 'A player') + ' joined');
    // remember this player on the campaign so token ownership can outlive the session
    setTimeout(function() { sendMissedHandouts(conn, prof); }, 2500);
    setTimeout(function() {   // the table's recent conversation, so a latecomer is not lost
        var recent = chatHistoryOf(chatLog);
        if (recent.length && conn.open) { try { conn.send({ type: 'chat-history', log: recent }); } catch (e) { sendFailed(e); } }
    }, 1200);
    var camp = getActiveCampaign();
    if (camp) {
        camp.players = camp.players || {};
        // merge: keep the charName binding and anything else the GM has set
        delete net.forgotten[prof.id];   // the GM let them in again: their record is back
        delete approvedIds[prof.id];     // and a one-time "go straight in" (a yes to a connection that had dropped) is used up, whichever way they came in
        var rec = camp.players[prof.id] = Object.assign({}, own(camp.players, prof.id) ? camp.players[prof.id] : null, { name: prof.name || prof.id });
        rec.key = (provenKey && rec.key === provenKey) ? rec.key : newKey();   // the table key: kept when the player proved it, fresh when the GM let them in (revokes whoever held the old one). camp.players never ships (sanitizeAppState).
        issuedKey = rec.key;
        // player history: recorded per campaign, shown in the Players panel
        rec.firstSeen = rec.firstSeen || Date.now();
        rec.lastSeen = Date.now();
        rec.joinCount = (rec.joinCount || 0) + 1;
        net.applyingRemote = true; save(true); net.applyingRemote = false;
    }
    var stage = currentStage();
    // a follow still in its grace window moves everyone once it fires; marking the stage seen now would cancel it
    if (!_stageTimer) net.lastStage = stage ? stage.campId + '/' + stage.itemId : null;
    if (land.stage) ensurePlayerToken(prof.id, land.stage.itemId);   // before the snapshot so it's included
    if (window.wpFog) window.wpFog.invalidateVision();   // fog: this admit may follow token moves; compute a fresh per-recipient view
    var snapOk = false;
    try {
        var snap, mkSnap = function() { snap = { type: 'snapshot', gmId: getProfile().id, key: issuedKey, appState: sanitizeAppState(state.appState, prof.id), stage: land.stage, paused: net.paused, pausedSelf: !!(net.pausedPlayers && net.pausedPlayers[prof.id]), travelLocked: net.travelLocked, snap: typeof window.wpSnapOn === 'function' && window.wpSnapOn() === true, stance: net.stanceFlags(), stanceCamps: window.wpVtt ? window.wpVtt.hostCamps() : null, targets: targetsFor(prof.id), combats: combatsFor(prof.id), notepad: notepadMsg() }; };
        if (typeof fogLanded === 'function') fogLanded(null, mkSnap); else mkSnap();   // fold M4: judged with every open drag at its start
        conn.send(snap); snapOk = true;
    } catch (e) { sendFailed(e, 'snapshot'); toast('Could not send the campaign to ' + (prof.name || 'the player') + ' \u2014 something in it cannot be sent (the console has the details).'); }
    if (snapOk && typeof fogSeedSnapshot === 'function') fogSeedSnapshot(conn, snap);   // fold M5: what each of its fogged maps holds
    if (snapOk && typeof hidNoteAll === 'function') hidNoteAll();   // hidden pieces: the drawings of theirs the GM hid, which this copy lacks
    if (window.wpVtt) net._lastStanceSig = window.wpVtt.hostSig();   // the snapshot carried the ceiling: no re-send on the next save
    var sm = net.soundsMessage(); if (sm) { try { conn.send(sm); } catch (e) { sendFailed(e); } net._lastSoundSig = soundSig(sm); }   // the hosted campaign's sounds, to this peer only
    var mm = net.musicMessage(); if (mm) { try { conn.send(mm); } catch (e) { sendFailed(e); } net._lastMusicSig = musicSig(mm); }   // the hosted campaign's music library, to this peer only (before any control so its refs validate)
    var mc = window.wpMusic && window.wpMusic.controlSnapshot ? window.wpMusic.controlSnapshot() : null; if (mc) { mc.type = 'music-ctl'; try { conn.send(mc); } catch (e) { sendFailed(e); } }   // if the GM is driving the table's music now, catch this joiner up (fresh position)
    var sysm = net.systemMessage(); if (sysm) { net._lastSystemSig = quickHash(JSON.stringify(sysm.system)); net._lastSensesSig = sensesSigOf(sysm); }   // the snapshot carried the system, its senses too: no re-send on the next save
    var dsm = net.docStyleMessage(); if (dsm) net._lastDocStyleSig = quickHash(JSON.stringify(dsm.docStyle));   // and the campaign's document look
    var npm = net.newPlayersMessage(); if (npm) net._lastNewPlayersSig = newPlayersSig(npm);   // and the rules for players without a character (Onboarding F1a)
    var cnm = net.campNameMessage(); if (cnm) net._lastCampNameSig = cnm.campId + '\n' + cnm.name;   // and its name
    var cfm = net.campFogMessage(); if (cfm) net._lastCampFogSig = cfm.campId + '\n' + JSON.stringify(cfm.fog);   // and its fog defaults
    var ckm = net.clockMessage(); if (ckm) net._lastClockSig = ckm.campId + '\n' + JSON.stringify(ckm.clock);   // and its clock (item 20 K2)
    var trm = net.turnRulesMessage(); if (trm) net._lastTurnRulesSig = trm.campId + '\n' + trm.timers + '\n' + trm.fill;   // and who may press an effect's timer, and who fills pools
    var lbm = net.libManifestMessage(); if (lbm && lbm.packs.length) { try { conn.send(lbm); } catch (e) { sendFailed(e); } }   // L3: the library players may look through, to this peer only
    if (land.stage && net.sendFxArrival) net.sendFxArrival(conn, land.stage.itemId);   // the running weather / held wash of the map they land on
    if (snapOk && typeof videoLink === 'function') videoLink(conn);   // item 21 V2: a showing in progress reaches a latecomer of its audience, its offer behind their snapshot on the same connection
    broadcastRoster();
}

// [netcheck:queue-start]
// A join the GM must rule on: one place in line per connection, a bounded line, a 'wait' to the player.
function queueJoin(conn, prof, why) {
    if (pendingJoins.some(function(j) { return j.conn === conn; })) return;
    if (pendingJoins.length >= 12) { denyJoin(conn, 'The table is busy — try again in a moment.'); return; }
    try { conn.send({ type: 'wait' }); } catch (e) { sendFailed(e); }
    pendingJoins.push({ conn: conn, prof: prof, why: why || '' });
    processNextApproval();
}
// [netcheck:queue-end]
function processNextApproval() {
    if (approvalOpen) return;
    var next = pendingJoins.shift();
    if (!next) return;
    if (!next.conn.open) { processNextApproval(); return; }   // gave up waiting
    var campQ = getActiveCampaign();   // fold M1: removed or banned while the request waited: never put to the GM
    if (next.prof && own(bannedIds, next.prof.id)) { denyJoin(next.conn, 'You were removed from this session.'); processNextApproval(); return; }   // the words the hello gate gives, in its order
    if (next.prof && campQ && campQ.bannedPlayers && own(campQ.bannedPlayers, next.prof.id)) { denyJoin(next.conn, 'You are banned from this campaign.'); processNextApproval(); return; }
    approvalOpen = true;
    var hint = next.why ? ' — a name this table already knows, but without its table key (a fresh install, or someone else using that name)' : '';
    showConfirm('"' + (next.prof.name || 'A player') + '" wants to join your table' + hint + '. Let them in?', function(yes) {
        approvalOpen = false;
        if (!net.active || net.role !== 'host') return;
        if (yes) {
            if (next.conn.open) admitPlayer(next.conn, next.prof);
            else { approvedIds[next.prof.id] = true; toast((next.prof.name || 'That player') + ' had already dropped — they go straight in when they try again.'); }
        } else {
            bannedIds[next.prof.id] = true;   // no re-prompt spam this session
            denyJoin(next.conn, 'The GM declined your request to join.');
            toast((next.prof.name || 'Player') + ' was turned away.');
        }
        processNextApproval();
    });
}

net.kickPlayer = function(peerKey) {
    if (net.role !== 'host') return;
    var p = own(net.roster, peerKey) ? net.roster[peerKey] : null;
    // fold M1: removing a player removes every admitted connection of theirs (a reconnect inside the heartbeat's grace, or a modified client,
    // can hold two); a peer not admitted is only the one clicked
    var keys = p && p.id ? Object.keys(net.roster).filter(function(k) { return net.roster[k] && net.roster[k].id === p.id; }) : [peerKey];
    if (p) { bannedIds[p.id] = true; keys.forEach(function(k) { delete net.roster[k]; }); renderRoster(); }
    if (p && typeof fogDragSweep === 'function') fogDragSweep();   // fold M4: a drag of theirs still open goes back where it began
    if (typeof fogForgetConn === 'function') keys.forEach(fogForgetConn);   // fold M5: and nothing is kept of what their copies held
    if (p && p.id && typeof sensesForget === 'function') sensesForget(p.id);   // Senses S0: no connection of theirs is left, and the closes that follow find no roster entry to forget them by
    if (p) dropWaitingFor(p.id);   // Onboarding F1a: their waiting token goes with them   // kicked players stay out for this session — and out of the roster NOW, so nothing sent in the 400 ms before the close lands
    if (p && p.id && net.targets && own(net.targets, p.id)) { delete net.targets[p.id]; if (typeof render === 'function') render(); if (typeof broadcastTargets === 'function') broadcastTargets(); }   // fold M1: their pointer goes with them (the removed get none of these: every send is roster-gated)
    if (p && typeof broadcastRoster === 'function') broadcastRoster();   // and the others' party strip no longer shows them
    if (typeof videoHang === 'function') { keys.forEach(videoHang); videoTold(); }   // item 21 V2: a video being shown stops reaching them at once
    keys.forEach(function(k) {   // every connection under each of their keys (a second data connection from one peer id too)
        net.conns.filter(function(c) { return c.peer === k; }).forEach(function(conn) {
            try { conn.send({ type: 'kicked' }); } catch (e) { sendFailed(e); }
            setTimeout(function() { try { conn.close(); } catch (e) {} }, 400);
        });
    });
    toast((p && p.name ? p.name : 'Player') + ' removed from the session.');
};

/* ---------- message handling ---------- */
function handleMessage(msg, conn) {
    if (!msg || !msg.type) return;
    // Host-side gate: until a connection has been admitted (passed the version check, any
    // password, and the GM's approval) the only thing it may say is 'hello'. Anything else —
    // an old build, a hand-rolled client, a probe — is dropped without a reply and the
    // connection closed. Nothing is ever sent to, or applied from, an unadmitted peer.
    // [netcheck:gate-start]
    if (net.role === 'host' && msg.type !== 'hello' && !own(net.roster, conn.peer)) {
        if (msg.type === 'hb') {   // a waiting player's heartbeat: keeps them from being dropped while the GM decides — for a while
            var cmHb = _connMeta[conn.peer];
            if (cmHb && Date.now() - cmHb.openedAt > UNADMITTED_TTL) { try { conn.close(); } catch (e) {} return; }
            noteSeen(conn.peer); return;
        }
        try { conn.close(); } catch (e) {}
        return;
    }
    noteSeen(conn.peer);
    if (msg.type === 'hb') return;   // heartbeat: its arrival is the whole message
    // [netcheck:hold-start]
    if (msg.type === 'hold') {   // Onboarding F2b: the other side freezes in a print dialog now — its silence is not a lost connection until it speaks again (capped)
        var msH = typeof msg.ms === 'number' && isFinite(msg.ms) ? Math.max(0, Math.min(HOLD_MAX, msg.ms)) : 0;
        if (net.role === 'host') holdUntil[conn.peer] = Date.now() + msH; else hostHoldUntil = Date.now() + msH;
        return;
    }
    // [netcheck:hold-end]
    if (msg.type === 'hello' && net.role === 'host') {
        if (own(net.roster, conn.peer)) return;   // already admitted: a repeat hello is ignored
        var cm = _connMeta[conn.peer] || (_connMeta[conn.peer] = { openedAt: Date.now(), hellos: 0 });
        if (++cm.hellos > 4) { try { conn.close(); } catch (e) {} return; }   // a hello storm on one connection: gone
        if (cm.authTimer) { clearTimeout(cm.authTimer); cm.authTimer = null; }   // this hello answers the key challenge below
        if (msg.profile && typeof msg.profile !== 'object') return;
        var prof = msg.profile || { id: conn.peer, name: 'Player' };
        if (!validProfileId(prof.id)) { denyJoin(conn, 'That player identity is not valid.'); return; }
        prof = { id: prof.id, name: prof.name, color: prof.color, avatar: prof.avatar, face: cleanFace(prof.face) };   // only what a roster carries: nothing else a peer sends is stored or re-broadcast
        if (!prof.face) delete prof.face;   // Onboarding F1b: a face the rule refuses is dropped
        if (prof.id === net.myId) { denyJoin(conn, 'That player identity is the GM\'s own.'); return; }   // a claimed GM id would render as "You" on the GM's screen
        var dupC = net.conns.find(function(c) { return c !== conn && c.open && own(net.roster, c.peer) && net.roster[c.peer].id === prof.id && Date.now() - (lastSeen[c.peer] || 0) < HB_STALE; });
        if (dupC) { denyJoin(conn, 'That player identity is already at the table.'); return; }   // a live duplicate would read and edit that player's sheet; a dropped one (silent past 8 s) may come back
        // Peer-supplied avatar: accept only a small image data URL, else drop it
        if (!safeAvatar(prof.avatar)) delete prof.avatar;   // the whole data URL (a valid prefix with a quote-breaking tail used to pass)
        prof.name = cleanRosterName(prof.name);   // cap a peer-supplied name; control, bidi-override and zero-width characters out
        if (!(typeof prof.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(prof.color))) delete prof.color;    // a chosen roster color, hex only
        // Bans first: a removed peer gets no version notice and no password try
        if (own(bannedIds, prof.id)) { denyJoin(conn, 'You were removed from this session.'); return; }
        var campB = getActiveCampaign();
        if (campB && campB.bannedPlayers && own(campB.bannedPlayers, prof.id)) { denyJoin(conn, 'You are banned from this campaign.'); return; }
        // Version gate: an out-of-date player gets the update message, not a password prompt
        if (APP_VERSION) {
            var theirV = (typeof msg.version === 'string') ? msg.version.slice(0, 20) : null;
            if (!theirV || versionCmp(theirV, APP_VERSION) < 0) {
                try { conn.send({ type: 'denied', reason: updateMessage(theirV, APP_VERSION), update: true }); } catch (e) { sendFailed(e); }
                setTimeout(function() { try { conn.close(); } catch (e) {} }, 400);
                toast((prof.name || 'A player') + ' tried to join on Waypoint ' + (theirV || 'older than 1.1.2') + ' — turned away to update.');
                return;
            }
            if (versionCmp(theirV, APP_VERSION) > 0 && !own(newerSeen, theirV)) {
                // The GM is the one behind: let the player in and tell the GM plainly — once per newer version per session, and never
                // as a dialog (a dialog here would land on top of a pending Allow/Deny)
                newerSeen[theirV] = true;
                toast((prof.name || 'A player') + ' is joining on Waypoint ' + theirV + ' — newer than your ' + APP_VERSION + '. Update when this session is over: Settings ▸ Check for Updates.');
                logEvent('session', (prof.name || 'A player') + ' joined on a newer Waypoint (' + theirV + ' vs ' + APP_VERSION + ') — update after the session');
            }
        }
        var pwEl = ui('netPassInput');
        var pw = pwEl ? pwEl.value.trim() : '';
        if (pw) {
            var nowPw = Date.now(); while (_pwFails.length && nowPw - _pwFails[0] > 60000) _pwFails.shift();
            if (_pwFails.length >= 20) { denyJoin(conn, 'Too many wrong passwords at this table — try again in a minute.'); return; }   // a guessing run locks the door for everyone, briefly
            if (String(msg.password || '').slice(0, 200).trim() !== pw) { _pwFails.push(nowPw); denyJoin(conn, 'Wrong session password.'); return; }
        }
        // Identity: a player this campaign knows proves the id is theirs with the table key the host issued them
        // (kept per GM on their machine, sent with the hello). A match goes straight in, as before. A known id
        // without a match is first CHALLENGED once (an older client never answers and simply gets the GM's prompt);
        // a second failure — or a stranger — waits for the GM's Allow/Deny.
        var camp0 = getActiveCampaign();
        var rec0 = (camp0 && camp0.players && own(camp0.players, prof.id)) ? camp0.players[prof.id] : null;
        var keyOk = !!(rec0 && typeof rec0.key === 'string' && rec0.key && typeof msg.key === 'string' && msg.key === rec0.key);
        if (keyOk || own(approvedIds, prof.id)) {
            delete approvedIds[prof.id];   // a yes to a dropped connection is good once
            admitPlayer(conn, prof, keyOk ? rec0.key : null);
        } else if (rec0 && rec0.key && !cm.authAsked) {
            cm.authAsked = true;
            try { conn.send({ type: 'auth', gmId: net.myId }); } catch (e) { sendFailed(e); }
            cm.authTimer = setTimeout(function() { cm.authTimer = null; if (!conn.open || own(net.roster, conn.peer)) return; queueJoin(conn, prof, 'nokey'); }, 2500);   // no keyed hello came back: the GM decides
        } else {
            queueJoin(conn, prof, rec0 ? 'nokey' : '');
        }
    } else if (msg.type === 'auth' && net.role === 'client') {
        // the host asks this player to prove a known id: answer with the table key it issued (per GM); with none, the GM is simply asked
        if (!net.conns[0] || conn !== net.conns[0]) return;
        var pwA = ui('netJoinPassInput');
        try { conn.send({ type: 'hello', profile: getProfile(), password: pwA ? pwA.value.trim() : '', version: APP_VERSION, key: tableKeyFor(String(msg.gmId || '').slice(0, 80)) }); } catch (e) { sendFailed(e); }
    // [netcheck:gate-end]
    } else if (msg.type === 'wait' && net.role === 'client') {
        setStatus('Connected — waiting for the GM to let you in…');
    } else if ((msg.type === 'denied' || msg.type === 'kicked') && net.role === 'client') {
        net.leaving = true;   // deliberate teardown: no auto-reconnect
        var why = msg.type === 'kicked' ? 'Removed from the session by the GM.' : (msg.reason || 'The GM declined your request.');
        setStatus(why);
        if (msg.update) showConfirm(why, function() {});   // an update prompt is worth a dialog, not just a status line
        toast(why + ' Restoring your own campaign.');
        if (net.fromWelcome) { if (window.wpJoinFailed) window.wpJoinFailed(); }   // stay on the welcome Join screen with the reason shown; re-enable Join
        else { var nm2 = ui('netModal'); if (nm2) nm2.style.display = 'flex'; }
    } else if (msg.type === 'snapshot' && net.role === 'client') {
        net.syncedPeer = conn.peer;   // from now on only this host's 'stance' counts (a table-hop or a waiting join hears others)
    if (typeof actForget === 'function') actForget();   // 14c: a whole campaign from the host: nothing of theirs is still on its way
        net.gmId = String(msg.gmId || (msg.notepad && msg.notepad.gmId) || '').slice(0, 80);   // kept apart from the notepad, which leaveSession resets
        if (typeof msg.key === 'string' && msg.key) rememberTableKey(net.gmId, msg.key);   // the table key this host issued me: proves this id is mine next time
        applySnapshot(msg);   // after gmId: the settings refresh inside it keys this table's off-list by campaign + GM
        syncSessionButtons();
        setStatus('Connected — campaign synced from host.');
        toast('Campaign synced from host.');
        if (window.wpVtt) window.wpVtt.joined();   // seed this table's off-list and queue the join notice
        net.videoWake();   // item 21 V2: a video the GM is showing, offered before this snapshot, is asked for now
    } else if (msg.type === 'item') {
        if (net.role === 'host') {
            // [netcheck:itempatch-start]
            try {   // 14c: whatever becomes of it, this patch's number is taken once it has been handled
            if (net.paused || peerPaused(conn.peer)) return;   // frozen table (or this player is paused): client edits are dropped
            if (!allow('item', { perMs: 40, burst: 60, windowMs: 5000, table: 2000 }, conn.peer)) return;   // a patch storm from one player: dropped, never saved
            var profile = net.roster[conn.peer];
            if (window.wpHistFlush) window.wpHistFlush();   // the GM's pending edit is its own step before the player's patch lands
            var pOut = { conn: conn }, changed = applyClientItemFiltered(msg, profile, pOut);   // 14c: conn, the mover a put-back answers
            if (changed) {
                setTimeout(function() { checkRoomHandouts(state.appState.campaigns[msg.campId].items[msg.itemId]); }, 50);
                var myActive = getActiveCampaign();
                if (myActive && myActive.id === msg.campId && myActive.activeItemId === msg.itemId) render();
                else if (window.wpSheets && window.wpSheets.tokenTurned) window.wpSheets.tokenTurned(null, true);   // 5h Fold 3: the GM's dial may follow a token on a map off screen
                saveRemoteSoon();
                if (window.wpFog && window.wpFog.invalidateSeen) window.wpFog.invalidateSeen(msg.itemId);   // Senses S0: the live position relay judges by where things now stand
                net.sendItem(msg.campId, msg.itemId, null, pOut.strokes ? null : conn);   // the filtered result goes back out as a delta; fold M10: on a fogged map a token-only change goes to every other copy, the sender's catching up in place when its fire comes (a drawing goes to all)
            }
            if (pOut.whole) net.sendItem(msg.campId, msg.itemId, conn, null, msg.a);   // hidden pieces: this copy of theirs was made before a hide or a show of a drawing of theirs reached them — the whole map, saying this patch's number, puts their screen right
            } finally { if (typeof ackTook === 'function') ackTook(conn, msg.a); }
            // [netcheck:itempatch-end]
        } else {
            applyItem(msg);
        }
    } else if (msg.type === 'threats' && net.role === 'host') {
        // [netcheck:threats-start]
        // 5h Fold 3: a player's threat marks from their sheet's facing dial — on the hosted campaign, on the map they are on, on a shown,
        // unlocked character token they own, with Token facing on and nobody paused; cleaned (at most six whole-degree bearings), stored, sent out
        try {   // 14c: whatever becomes of them, their number is taken once they have been handled
        var campT = getActiveCampaign(), prT = net.roster[conn.peer], SCt = SC();
        if (!campT || !prT || !SCt || msg.campId !== campT.id || typeof msg.itemId !== 'string' || typeof msg.wbId !== 'string') return;
        if (net.paused || peerPaused(conn.peer)) return;
        if (!allow('threats', { perMs: 80, burst: 20, windowMs: 5000, table: 600 }, conn.peer)) return;
        if (window.wpVtt && !window.wpVtt.campaignOn('turning', campT)) return;
        if (msg.itemId !== prT.location || !own(campT.items, msg.itemId)) return;
        var mapT = campT.items[msg.itemId]; if (!mapT || mapT.type !== 'map' || !Array.isArray(mapT.whiteboard)) return;
        var tokT = mapT.whiteboard.find(function(x) { return x && x.id === msg.wbId; });
        if (!tokT || !tokT.isChar || tokT.hidden || tokT.locked || tokT.ownerId !== prT.id) return;
        var thT = SCt.cleanThreats(msg.threats);
        if (JSON.stringify(tokT.threats === undefined ? [] : tokT.threats) === JSON.stringify(thT)) return;
        if (window.wpHistFlush) window.wpHistFlush();   // the GM's pending edit is its own step before the player's change lands
        if (thT.length) tokT.threats = thT; else delete tokT.threats;
        if (campT.activeItemId === msg.itemId) render(); else if (window.wpSheets && window.wpSheets.tokenTurned) window.wpSheets.tokenTurned(msg.wbId, true);
        saveRemoteSoon();
        if (window.wpFog && window.wpFog.invalidateSeen) window.wpFog.invalidateSeen(msg.itemId);   // Senses S0: a Sight formula may read the marks
        net.sendItem(campT.id, msg.itemId, null, conn);   // fold M10: the sender wrote its marks itself; on a fogged map its copy catches up in place
        if (typeof fogArm === 'function') fogArm(msg.itemId);
        } finally { if (typeof ackTook === 'function') ackTook(conn, msg.a); }
        // [netcheck:threats-end]
    } else if (msg.type === 'itemDelta' && net.role === 'client') {
        applyItemDelta(msg);
    } else if (msg.type === 'itemGone' && net.role === 'client') {
        if (conn.peer !== net.syncedPeer) return;   // only the synced host may take things away
        var campG = campOf(msg.campId);
        if (campG && campG.items && validKey(msg.itemId) && own(campG.items, msg.itemId)) {
            net.applyingRemote = true;
            delete campG.items[msg.itemId];
            if (campG.activeItemId === msg.itemId) { campG.activeItemId = Object.keys(campG.items).find(function(id) { return campG.items[id].type === 'map'; }) || null; state.selId = null; state.selWbId = null; state.selWbIds = []; }
            try { if (window.wpDocGone) window.wpDocGone(msg.campId, msg.itemId); } catch (e) {}
            try { if (window.wpSheets && window.wpSheets.sheetRefsChanged && window.wpSheets.sheetRefsChanged()) window.wpSheets.renderSheet(); } catch (e) {}   // a chip/link to that page goes with it (Stage 5f)
            updateSidebarNav(); render();
            net.applyingRemote = false;
        }
    } else if (msg.type === 'needItem' && net.role === 'host') {
        var campN = getActiveCampaign(); if (!campN || msg.campId !== campN.id || typeof msg.itemId !== 'string') return;   // a session is one campaign
        if (!allow('need', { perMs: 50, burst: 30, windowMs: 5000, table: 1000 }, conn.peer)) return;
        net.sendItem(msg.campId, msg.itemId, conn);
    } else if (msg.type === 'stage' && net.role === 'client') {
        applyStage(msg.stage);
        toast(msg.personal ? 'You arrive.' : 'The GM moved the table to a new map.');
    } else if (msg.type === 'pause' && net.role === 'client') {
        setPausedLocal(!!msg.on);
        toast(msg.on ? 'The GM paused the table.' : 'The table is live again.');
    } else if (msg.type === 'pausePlayer' && net.role === 'client') {
        setSelfPausedLocal(!!msg.on);
        render();   // refresh my own token affordances (turn handles etc.) now that I'm frozen/thawed
        toast(msg.on ? 'The GM paused you.' : 'You are live again.');
    } else if (msg.type === 'snap' && net.role === 'client') {
        // [netcheck:snapmsg-start]
        if (!net.foreign || conn.peer !== net.syncedPeer) return;   // before the snapshot, or from a host other than the synced one: nothing to apply
        net.tableSnapOn = msg.on === true;
        // [netcheck:snapmsg-end]
    } else if (msg.type === 'stance' && net.role === 'client') {
        if (!net.foreign || conn.peer !== net.syncedPeer) return;   // before the snapshot, or from a host other than the synced one: nothing to apply
        var prevStance = net.stance;
        net.stance = cleanStance(msg.flags);
        net.stanceCamps = cleanStanceCamps(msg.camps);
        render();
        if (window.wpVtt) window.wpVtt.ceilingChanged(prevStance, typeof msg.campId === 'string' ? msg.campId.slice(0, 160) : '');
        if (window.wpSettingsSync) window.wpSettingsSync();
    } else if (msg.type === 'travelLock' && net.role === 'client') {
        setTravelLockLocal(!!msg.on);
        toast(msg.on ? 'The GM has locked travel between maps for now.' : 'Travel between maps is open again.');
    } else if (msg.type === 'travelDenied' && net.role === 'client') {
        if (msg.reason === 'closed') toast((msg.map ? String(msg.map).slice(0, 120) : 'That map') + " isn't open yet — the GM will let you through when it's time.");
        else toast('Travel between maps is locked right now — the GM will open it when the time comes.');
    } else if (msg.type === 'travel' && net.role === 'host') {
        // [netcheck:travelmsg-start]
        if (net.paused || peerPaused(conn.peer)) return;   // frozen table (or this player is paused): no travel
        if (!allow('travel', { perMs: 400, burst: 6, windowMs: 10000, table: 500 }, conn.peer)) return;   // each travel saves + re-sends maps: a few a second is plenty
        var traveler = net.roster[conn.peer];
        var tCamp = getActiveCampaign();
        if (!traveler || !tCamp) return;
        var fromMap = tCamp.items[traveler.location || tCamp.activeItemId];
        if (!fromMap || fromMap.type !== 'map') return;
        var portal = (fromMap.whiteboard || []).find(function(w) { return w.id === msg.viaItemId; });
        if (portal && portal.hidden) return;   // a hidden portal is no door to knock on: a trap tile fires only when a token is dropped on it (the host judges the drop), never by naming it
        hostTravel(conn, traveler, portal, fromMap);
        // [netcheck:travelmsg-end]
    } else if (msg.type === 'target' && net.role === 'host') {
        // [netcheck:targetask-start]
        var tp = net.roster[conn.peer]; if (!tp) return;
        if (!allow('target', { perMs: 100, burst: 20, windowMs: 5000, table: 1000 }, conn.peer)) return;
        var okId = msg.id === null || (typeof msg.id === 'string' && msg.id.length <= 80);
        if (!okId || typeof msg.mapId !== 'string' || msg.mapId.length > 80) return;
        applyTarget(tp.id, tp.name || 'Player', msg.id ? { id: msg.id, mapId: msg.mapId } : null);
        broadcastTargets();
        // a player squaring up to one of the GM's characters: offer to start combat there (once per character per session) — unless the campaign
        // says to do nothing (the owner's ruling of 2026-10-01: camp.turnRules.targetAsk 'off'; absent: ask; Settings, the Turn-based combat row);
        // never for a token the GM hid. The GM answers the offer by its buttons alone: Enter does not say Yes to it (a key pressed for something else)
        if (msg.id && !own(net.combats, msg.mapId) && !combatAsked[msg.mapId + '|' + msg.id]) {
            var campT = getActiveCampaign(), mapT = campT && campT.items && own(campT.items, msg.mapId) ? campT.items[msg.mapId] : null;
            var askT = !(campT && campT.turnRules && typeof campT.turnRules === 'object' && campT.turnRules.targetAsk === 'off');
            var tokT = askT && mapT && mapT.type === 'map' ? (mapT.whiteboard || []).find(function(w) { return w && w.id === msg.id; }) : null;
            if (tokT && tokT.isChar && !tokT.ownerId && !tokT.hidden) {
                combatAsked[msg.mapId + '|' + msg.id] = true;
                showConfirm((tp.name || 'A player') + ' is targeting ' + (tokT.charName || tokT.name || 'a character') + ' on ' + mapTitleOf(msg.mapId) + '. Start combat there?', function(yes) {
                    if (yes && window.wpOpenCombat) window.wpOpenCombat(msg.mapId, { pre: [msg.id], owner: tp.id });
                }, { noEnter: true });
            }
        }
        // [netcheck:targetask-end]
    } else if (msg.type === 'share' && net.role === 'host') {
        relayShare(msg, conn);
    } else if (msg.type === 'handout' && net.role === 'client') {
        if (window.wpJournalReceive) window.wpJournalReceive(msg);
    } else if (msg.type === 'notepad' && net.role === 'client') {
        applyNotepad(msg);
    } else if (msg.type === 'combats' && net.role === 'client') {
        var before = net.combats, after = cleanCombats(msg.combats);
        net.combats = after;
        var camC = getActiveCampaign(), mineC = camC && after[camC.activeItemId], mineB = camC && before[camC.activeItemId];
        if (mineC && (!mineB || mineB.turn !== mineC.turn || mineB.round !== mineC.round)) toast((mineB ? '' : 'Combat! ') + (mineC.rows[mineC.turn] || {}).name + "'s turn" + (mineC.round > 1 && mineC.turn === 0 ? ' — round ' + mineC.round : '') + '.');
        else if (mineB && !mineC) toast('Combat is over.');
        combatRefresh();
    } else if (msg.type === 'targets' && net.role === 'client') {
        net.targets = cleanTargets(msg.targets);
        render();
    } else if (msg.type === 'pos') {
        handlePos(msg, conn);
    } else if (msg.type === 'end' && net.role === 'client') {
        net.leaving = true;   // deliberate teardown from the GM: no auto-reconnect
        diceSessionReset(true);   // the table is over: its chat and rolls go with it (the teardown below is the silent path)
        setStatus('Session ended by the GM.');
        var nm = ui('netModal');
        if (nm) nm.style.display = 'flex';
        toast('The GM ended the session — restoring your own campaign.');
    } else if (msg.type === 'char-upload-ans' && net.role === 'client') {   // Stage 6 U2: the host's answer to our upload
        if (typeof msg.rid !== 'string' || !Object.prototype.hasOwnProperty.call(_uploadPending, msg.rid)) return;
        var pU = _uploadPending[msg.rid]; delete _uploadPending[msg.rid]; clearTimeout(pU.timer);
        // [netcheck:uploadans-start]
        var UP_WHY = { paused: 'The table is paused.', off: 'Character sheets are off here.', slow: 'Wait a moment before sending another file.', missing: 'That character is gone.', owner: 'That character is not yours.', file: 'A character file only fills a character you are still making.', nofile: 'Starting a character from a file is not open at this table.', wait: 'The GM\u2019s library is still loading; try again in a moment.', unread: 'The GM could not read it.' };
        var cnt = function(v) { return typeof v === 'number' && isFinite(v) ? Math.max(0, Math.min(100000, v | 0)) : 0; };
        if (typeof pU.done === 'function') pU.done(typeof msg.reason === 'string' ? { error: Object.prototype.hasOwnProperty.call(UP_WHY, msg.reason) ? UP_WHY[msg.reason] : 'The GM could not read it.' } : { n: cnt(msg.n), auto: cnt(msg.auto), left: cnt(msg.left) });
        // [netcheck:uploadans-end]
    } else if (msg.type === 'char-pic-ans' && net.role === 'client') {   // Onboarding F1c: the host's answer to our picture
        // [netcheck:charpicans-start]
        if (typeof msg.rid !== 'string' || !Object.prototype.hasOwnProperty.call(_picPending, msg.rid)) return;
        var pP = _picPending[msg.rid]; delete _picPending[msg.rid]; clearTimeout(pP.timer);
        var PIC_WHY = { paused: 'The table is paused.', off: 'Character sheets are off here.', slow: 'A moment between pictures, please.', missing: 'That character is gone.', owner: 'That character is not yours.', bad: 'That picture could not be used.', failed: 'The GM could not save that picture.' };
        if (typeof pP.done === 'function') pP.done(msg.ok === true ? { ok: true } : { error: typeof msg.reason === 'string' && Object.prototype.hasOwnProperty.call(PIC_WHY, msg.reason) ? PIC_WHY[msg.reason] : 'The GM could not take it.' });   // only a reason of our own is shown
        // [netcheck:charpicans-end]
    } else if ((msg.type === 'char-make-ans' || msg.type === 'char-name-ans' || msg.type === 'char-done-ans' || msg.type === 'char-token-ans' || msg.type === 'tok-pic-ans' || msg.type === 'tok-light-ans') && net.role === 'client') {   // Onboarding F3: the host's answer to one of ours
        // [netcheck:charmakeans-start]
        if (typeof msg.rid !== 'string' || !Object.prototype.hasOwnProperty.call(_mkPending, msg.rid)) return;
        var pK = _mkPending[msg.rid]; delete _mkPending[msg.rid]; clearTimeout(pK.timer);
        if (typeof pK.done !== 'function') return;
        if (msg.ok === true) { var aK = { ok: true, charId: typeof msg.charId === 'string' && /^c_[A-Za-z0-9_]{1,24}$/.test(msg.charId) ? msg.charId : null }; if (msg.kept === true) aK.kept = true; pK.done(aK); }
        else { var WK = pK.kind === 'tok-pic' ? TOK_WHY : pK.kind === 'tok-light' ? LIGHT_WHY : MK_WHY; pK.done({ error: typeof msg.reason === 'string' && Object.prototype.hasOwnProperty.call(WK, msg.reason) ? WK[msg.reason] : 'The GM could not do that.' }); }   // in the words of what we asked
        // [netcheck:charmakeans-end]
    } else if (msg.type === 'char-review' && net.role === 'client') {   // Onboarding F3: what the GM did with our character
        // [netcheck:charreview-start]
        if (!net.foreign || net.stream || conn.peer !== net.syncedPeer) return;
        var OUT_R = { back: 'Your GM sent back ', removed: 'Your GM removed ', locked: 'Your GM locked ', invited: 'Your GM asked you to make a character: ' }, TAIL_R = { back: ' to fill in (press Done when it is finished)', invited: ' \u2014 open it from your card' };
        if (typeof msg.outcome !== 'string' || !Object.prototype.hasOwnProperty.call(OUT_R, msg.outcome)) return;
        var nmR = cleanCharName(msg.name) || 'your character', ntR = typeof msg.note === 'string' ? msg.note.replace(/[\u0000-\u001f\u007f\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300) : '';
        toast(OUT_R[msg.outcome] + nmR + (Object.prototype.hasOwnProperty.call(TAIL_R, msg.outcome) ? TAIL_R[msg.outcome] : '') + (ntR ? ': ' + ntR : '.'));
        // [netcheck:charreview-end]
    } else if (msg.type === 'char-upload-done' && net.role === 'client') {   // U2: what the GM did with it
        var campD = getActiveCampaign(), chD = campD && campD.chars && typeof msg.charId === 'string' && Object.prototype.hasOwnProperty.call(campD.chars, msg.charId) ? campD.chars[msg.charId] : null;
        var dn = typeof msg.done === 'number' && isFinite(msg.done) ? Math.max(0, msg.done | 0) : 0, ofN = typeof msg.of === 'number' && isFinite(msg.of) ? Math.max(0, msg.of | 0) : 0;
        toast(dn ? 'The GM applied ' + dn + ' of ' + ofN + ' changes from your sheet' + (chD ? ' to ' + chD.name : '') + '.' : 'The GM kept ' + (chD ? chD.name + ' as it was' : 'your character as it was') + ' (' + ofN + (ofN === 1 ? ' change' : ' changes') + ' not taken).');
    } else if ((msg.type === 'chars' || msg.type === 'char' || msg.type === 'charDelta' || msg.type === 'charGone' || msg.type === 'char-ack' || msg.type === 'char-deny') && net.role === 'client') {
        // [netcheck:charin-start]
        // characters from the synced host only (character sheets, 1.5.0): copies are replaced, never merged; every value re-cleaned against the system on hand
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || !window.wpSystemCore) return;
        var SC2 = window.wpSystemCore;
        var dropP = function(id) { Object.keys(_charPending).forEach(function(rid) { if (_charPending[rid].charId === id) { clearTimeout(_charPending[rid].timer); delete _charPending[rid]; } }); };   // Onboarding F0: a copy that is no longer ours drops its queued edits
        if (msg.type === 'char-ack' || msg.type === 'char-deny') { if (typeof msg.rid !== 'string' || !_charPending[msg.rid]) return; charPendingDone(msg.rid, msg.type === 'char-ack', SC2.cleanDenyReason(msg.reason), SC2.cleanItemMsg(msg.msg)); return; }   // Stage 6: a bound or cursed item's message, as text
        if (typeof msg.campId !== 'string' || msg.campId !== state.appState.activeCampaignId) return;
        var campC = campOf(msg.campId); if (!campC || !campC.system) return;   // the system always comes first
        var sysC = campC.system;
        if (msg.type === 'chars') {
            var outC = {};
            if (msg.chars && typeof msg.chars === 'object') Object.keys(msg.chars).forEach(function(id) { var cc = SC2.cleanChar(msg.chars[id], sysC, { state: 'owner' }); if (cc && cc.id === id) { cc.partial = msg.chars[id].partial === true; outC[id] = cc; } });
            _charHost = Object.create(null); Object.keys(outC).forEach(function(id) { noteHostCopy(id, outC[id].values); });
            Object.keys(outC).forEach(function(id) { if (outC[id].partial || outC[id].ownerId !== net.myId) dropP(id); });   // no longer ours: queued edits go, never laid over a teammate copy
            campC.chars = outC; Object.keys(outC).forEach(reapplyPending);
            if (window.wpSheets) window.wpSheets.charChanged(null);
            return;
        }
        campC.chars = campC.chars || {};
        if (msg.type === 'charGone') {
            if (typeof msg.id !== 'string' || !Object.prototype.hasOwnProperty.call(campC.chars, msg.id) || !campC.chars[msg.id]) return;   // own ids only: a host naming '__proto__' reaches no prototype
            delete campC.chars[msg.id]; delete _charHost[msg.id];
            Object.keys(_charPending).forEach(function(rid) { if (_charPending[rid].charId === msg.id) { clearTimeout(_charPending[rid].timer); delete _charPending[rid]; } });
            if (window.wpSheets) window.wpSheets.charGone(msg.id);
            return;
        }
        if (msg.type === 'char') { var c1 = SC2.cleanChar(msg.char, sysC, { state: 'owner' }); if (!c1) return; c1.partial = !!(msg.char && msg.char.partial === true); if (c1.partial || c1.ownerId !== net.myId) dropP(c1.id); campC.chars[c1.id] = c1; noteHostCopy(c1.id, c1.values); reapplyPending(c1.id); if (window.wpSheets) window.wpSheets.charChanged(c1.id); return; }
        if (typeof msg.id !== 'string' || !Object.prototype.hasOwnProperty.call(campC.chars, msg.id) || !campC.chars[msg.id] || !msg.values || typeof msg.values !== 'object') return;   // own ids only: a delta for '__proto__' would write onto every object's prototype
        var tgt = campC.chars[msg.id], hb = Object.prototype.hasOwnProperty.call(_charHost, msg.id) ? _charHost[msg.id] : null; tgt.values = tgt.values || {};   // a delta updates a whole host copy, never starts a partial one
        Object.keys(msg.values).forEach(function(fid) { var f = SC2.fieldById(sysC, fid); if (!f) return; if (msg.values[fid] === null) { delete tgt.values[fid]; if (hb) delete hb[fid]; return; } var v = SC2.cleanValue(f, msg.values[fid], SC2.valueOpts(sysC)); if (v !== undefined) { tgt.values[fid] = v; if (hb) hb[fid] = JSON.parse(JSON.stringify(v)); } });
        if (Array.isArray(msg.unseen) && !tgt.partial) { var unD = SC2.cleanChar({ id: tgt.id, name: 'x', ownerId: tgt.ownerId, values: {}, unseen: msg.unseen }, sysC); if (unD && unD.unseen) tgt.unseen = unD.unseen; else delete tgt.unseen; }   // F6: a kept curse's changes, nameless, on the owner's own copy only
        reapplyPending(msg.id);
        if (window.wpSheets) window.wpSheets.charChanged(msg.id);
        // [netcheck:charin-end]
    } else if (msg.type === 'char-edit' && net.role === 'host') {
        // [netcheck:charedit-start]
        // a player's value for their own character: shape, rate, feature, ownership, then the field's own rules; every refusal answered
        var Se = SC(), Fe = window.wpFormula; if (!Se || !Fe) return;
        var q = Se.cleanCharEdit(msg); if (!q) return;
        var denyE = function(reason) { try { conn.send({ type: 'char-deny', rid: q.rid, reason: reason }); } catch (e) { sendFailed(e); } };
        if (net.paused || peerPaused(conn.peer)) { denyE('paused'); return; }   // frozen table (or this player is paused): no edits
        if (!charLimit && window.wpDiceCore) charLimit = window.wpDiceCore.RateLimit({ perMs: 100, burst: Se.LIMITS.editsPerWindow, windowMs: Se.LIMITS.editWindowMs, table: 400 });
        var limE = charLimit ? charLimit.allow(conn.peer, Date.now()) : true;
        if (limE !== true) { var skE = conn.peer + '|slow'; if (!_charSlowSaid[skE] || Date.now() - _charSlowSaid[skE] > Se.LIMITS.editWindowMs) { _charSlowSaid[skE] = Date.now(); denyE('slow'); } return; }
        if (window.wpVtt && !window.wpVtt.on('sheets')) { denyE('off'); return; }
        var campE = getActiveCampaign(), chE = (campE && campE.chars && typeof q.charId === 'string' && Object.prototype.hasOwnProperty.call(campE.chars, q.charId) ? campE.chars[q.charId] : null);
        if (!campE || !campE.system || !chE) { denyE('missing'); return; }
        var profE = net.roster[conn.peer]; if (chE.npc || !chE.ownerId || !profE || chE.ownerId !== profE.id) { denyE('owner'); return; }
        var resE = Se.applyEdit(campE.system, chE, q.fieldId, q.value, Fe, { player: true });
        if (!resE.ok) { denyE(resE.reason); return; }
        chE.values = chE.values || {}; chE.values[q.fieldId] = resE.value; chE.updated = Date.now();
        saveRemoteSoon();
        try { conn.send({ type: 'char-ack', rid: q.rid }); } catch (e) { sendFailed(e); }
        var dE = {}; dE[q.fieldId] = resE.value; net.syncCharDelta(q.charId, dE);
        if (window.wpSheets) window.wpSheets.charChanged(q.charId);
        // [netcheck:charedit-end]
    } else if (msg.type === 'char-edits' && net.role === 'host') {
        // [netcheck:charedits-start]
        // HUD frame (HF4b): a player's several values at once (a section's Reset all) — the same gates as one char-edit and ONE rate token, then
        // every value judged by its field's rules on a working copy: all of them stored, or none (one ack or one deny, one delta)
        var Sm = SC(), Fm = window.wpFormula; if (!Sm || !Fm) return;
        var qm = Sm.cleanCharEdits(msg); if (!qm) return;
        var denyM = function(reason) { try { conn.send({ type: 'char-deny', rid: qm.rid, reason: reason }); } catch (e) { sendFailed(e); } };
        if (net.paused || peerPaused(conn.peer)) { denyM('paused'); return; }   // frozen table (or this player is paused): no edits
        if (!charLimit && window.wpDiceCore) charLimit = window.wpDiceCore.RateLimit({ perMs: 100, burst: Sm.LIMITS.editsPerWindow, windowMs: Sm.LIMITS.editWindowMs, table: 400 });
        var limM = charLimit ? charLimit.allow(conn.peer, Date.now()) : true;   // one token for the whole batch
        if (limM !== true) { var skM = conn.peer + '|slow'; if (!_charSlowSaid[skM] || Date.now() - _charSlowSaid[skM] > Sm.LIMITS.editWindowMs) { _charSlowSaid[skM] = Date.now(); denyM('slow'); } return; }
        if (window.wpVtt && !window.wpVtt.on('sheets')) { denyM('off'); return; }
        var campM = getActiveCampaign(), chM = (campM && campM.chars && typeof qm.charId === 'string' && Object.prototype.hasOwnProperty.call(campM.chars, qm.charId) ? campM.chars[qm.charId] : null);
        if (!campM || !campM.system || !chM) { denyM('missing'); return; }
        var profM = net.roster[conn.peer]; if (chM.npc || !chM.ownerId || !profM || chM.ownerId !== profM.id) { denyM('owner'); return; }
        var workM = Object.assign({}, chM, { values: JSON.parse(JSON.stringify(chM.values || {})) }), dM = {};
        for (var iM = 0; iM < qm.values.length; iM++) {
            var resM = Sm.applyEdit(campM.system, workM, qm.values[iM].fieldId, qm.values[iM].value, Fm, { player: true });
            if (!resM.ok) { denyM(resM.reason); return; }   // one refused value refuses the batch: nothing is stored
            workM.values[qm.values[iM].fieldId] = resM.value; dM[qm.values[iM].fieldId] = resM.value;
        }
        chM.values = chM.values || {}; Object.keys(dM).forEach(function(k) { chM.values[k] = dM[k]; }); chM.updated = Date.now();
        saveRemoteSoon();
        try { conn.send({ type: 'char-ack', rid: qm.rid }); } catch (e) { sendFailed(e); }
        net.syncCharDelta(qm.charId, dM);
        if (window.wpSheets) window.wpSheets.charChanged(qm.charId);
        // [netcheck:charedits-end]
    } else if (msg.type === 'char-apply' && net.role === 'host') {
        // [netcheck:charapply-start]
        // Stage 6 HUD H7: a player's press of an apply action on their own character — the char-edit gates and ONE rate token; then the action as
        // THEIR view has it (a GM-only one, one naming a GM-only value or an unfinished one is not there), every amount worked out through that
        // view (as their rolls are) and the targets moved on the host's copy, all or nothing. The owner may press it whatever the fields' edit
        // setting (owner, 2026-09-26: the host works the amount out, never the player). One ack or one deny (an amount's error rides along), one
        // delta, one card to whoever may see it
        var Sa = SC(), Fa = window.wpFormula; if (!Sa || !Fa) return;
        var qa = Sa.cleanCharApply(msg); if (!qa) return;
        var denyA = function(reason, text) { var d = { type: 'char-deny', rid: qa.rid, reason: reason }; if (text) d.msg = String(text).slice(0, Sa.LIMITS.rmMsg); try { conn.send(d); } catch (e) { sendFailed(e); } };
        if (net.paused || peerPaused(conn.peer)) { denyA('paused'); return; }
        if (!charLimit && window.wpDiceCore) charLimit = window.wpDiceCore.RateLimit({ perMs: 100, burst: Sa.LIMITS.editsPerWindow, windowMs: Sa.LIMITS.editWindowMs, table: 400 });
        var limA = charLimit ? charLimit.allow(conn.peer, Date.now()) : true;
        if (limA !== true) { var skA = conn.peer + '|slow'; if (!_charSlowSaid[skA] || Date.now() - _charSlowSaid[skA] > Sa.LIMITS.editWindowMs) { _charSlowSaid[skA] = Date.now(); denyA('slow'); } return; }
        if (window.wpVtt && !window.wpVtt.on('sheets')) { denyA('off'); return; }
        var campA = getActiveCampaign(), chA = (campA && campA.chars && typeof qa.charId === 'string' && Object.prototype.hasOwnProperty.call(campA.chars, qa.charId) ? campA.chars[qa.charId] : null);
        if (!campA || !campA.system || !chA) { denyA('missing'); return; }
        var profA = net.roster[conn.peer]; if (chA.npc || !chA.ownerId || !profA || chA.ownerId !== profA.id) { denyA('owner'); return; }
        if (chA.making === 1) { denyA('making'); return; }   // Onboarding F3: not in play until they press Done
        var viewA = window.wpSheets ? window.wpSheets.playerSystem(campA) : null, chvA = viewA ? Sa.charFor(chA, viewA, profA.id, { lib: fxLib(campA.system), items: itemLib(campA.system), full: campA.system }) : null;
        if (!viewA || !chvA) { denyA('missing'); return; }
        var actA = null, rowGmA = false;
        if (qa.row) (Array.isArray(viewA.fields) ? viewA.fields : []).forEach(function(f) { if (f && f.id === qa.row.f && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls)) { var lr = f.list.rolls[qa.row.i]; if (lr && Array.isArray(lr.apply)) actA = lr; } });   // HUD H7b: a list's action, as their view has the list
        else (Array.isArray(viewA.rolls) ? viewA.rolls : []).forEach(function(r) { if (r && r.id === qa.act && Array.isArray(r.apply)) actA = r; });
        if (!actA) { denyA('field'); return; }
        var locA = profA.location, mapA = (typeof locA === 'string' && campA.items && own(campA.items, locA)) ? campA.items[locA] : null;   // the facing and round names read their token on the map they are on, as their rolls do
        var vtA = window.wpVtt, ruleA = function(k) { return !vtA || (vtA.rulesOn ? vtA.rulesOn(k) : vtA.on(k)); };
        var tcA = Sa.withRound(Sa.tokenCtx(mapA, Sa.charTokenOn(mapA, qa.charId, profA.id, { strict: true }), { turning: ruleA('turning'), posture: ruleA('posture'), elevation: ruleA('elevation') }), mapA && own(net.combats, locA) ? net.combats[locA] : null);
        if (typeof rangeTo === 'function' && Sa.withRange) tcA = Sa.withRange(tcA, rangeTo(campA, mapA, locA, Sa.charTokenOn(mapA, qa.charId, profA.id, { strict: true }), profA.id));   // range R2: an apply action reads the range as a roll does
        var varsA = Sa.makeResolver(viewA, chvA, Fa, tcA);
        if (qa.row) { varsA = varsA.row(qa.row.f, qa.row.r); if (!varsA) { denyA('missing'); return; } rowGmA = !!Sa.rowRollNames(campA.system, chA, qa.row.f, qa.row.r, [], Fa).gm; }   // H7b: the row's own names (a row they cannot see is gone); a row of a GM-only item keeps the card between them and the GM
        var resA = Sa.applyAct(campA.system, chA, actA, varsA, Fa, tcA, qa.row ? { f: qa.row.f, r: qa.row.r } : null);   // R2b: a list's action may move its row's counters
        if (!resA.ok) { denyA(resA.reason, resA.message); return; }
        var costA = typeof actSpend === 'function' ? actSpend(campA, qa.charId, profA, actA.cost, conn, chA.name) : ''; if (costA) { denyA('error', costA); return; }   // turn-based combat T4: what it costs (worked out first: a press that cannot land spends nothing)
        chA.values = chA.values || {}; Object.keys(resA.values).forEach(function(k) { chA.values[k] = resA.values[k]; }); chA.updated = Date.now();
        saveRemoteSoon();
        try { conn.send({ type: 'char-ack', rid: qa.rid }); } catch (e) { sendFailed(e); }
        net.syncCharDelta(qa.charId, resA.values);
        if (window.wpSheets) window.wpSheets.charChanged(qa.charId);
        var recA = { type: 'apply', id: 'r_' + Math.random().toString(36).slice(2, 10), from: diceFrom(profA, false), label: qa.label || (actA.label.indexOf('{') < 0 ? actA.label : 'Apply'), lines: applyLines(resA.lines), ts: Date.now() };
        if (chA.name) recA.as = String(chA.name).slice(0, 60);
        postApply(recA, Sa.applyScope(campA.system, chA, actA, rowGmA, Fa), chA, conn);
        // [netcheck:charapply-end]
    } else if ((msg.type === 'turn-hold' || msg.type === 'turn-act') && net.role === 'host') {
        // [netcheck:turnholdmsg-start]
        // Initiative O3: a player holds their own turn (the row on turn, theirs) or acts from their own hold — turn-based combat on, the combat on
        // the map they are on, the row's token a character token of theirs; then the GM's own hold or act
        if (net.paused || peerPaused(conn.peer)) return;
        if (!window.wpVtt || !window.wpVtt.on('turns')) return;
        var prH = net.roster[conn.peer]; if (!prH || typeof msg.mapId !== 'string' || msg.mapId !== prH.location || typeof msg.row !== 'string') return;
        if (!allow('turnhold', { perMs: 400, burst: 4, windowMs: 4000, table: 400 }, conn.peer)) return;
        var cbH = own(net.combats, msg.mapId) ? net.combats[msg.mapId] : null, rowH = cbH && Array.isArray(cbH.rows) ? cbH.rows.find(function(r) { return r && r.id === msg.row; }) : null;
        if (!rowH || typeof rowH.tokId !== 'string') return;
        var campH = getActiveCampaign(), mapH = campH && campH.items && own(campH.items, msg.mapId) ? campH.items[msg.mapId] : null;
        var tokH = mapH && mapH.type === 'map' && Array.isArray(mapH.whiteboard) ? mapH.whiteboard.find(function(w) { return w && w.id === rowH.tokId; }) : null;
        if (!tokH || !tokH.isChar || !tokH.ownerId || tokH.ownerId !== prH.id) return;
        if (msg.type === 'turn-hold') { if (cbH.rows[cbH.turn] === rowH) net.combatHold(msg.mapId); }
        else net.combatAct(msg.mapId, rowH.id);
        // [netcheck:turnholdmsg-end]
    } else if (msg.type === 'turn-end' && net.role === 'host') {
        // [netcheck:turnend-start]
        // Turn-based combat T2: a player ends their own turn — turn-based combat on, the combat on the map they are on, the row they saw still the
        // one on turn (a second press, or the GM's Next meanwhile, never skips the next character), its token a character token of theirs; then
        // the GM's own step (the round hook, the toast, the broadcast)
        if (net.paused || peerPaused(conn.peer)) return;
        if (!window.wpVtt || !window.wpVtt.on('turns')) return;
        var prT = net.roster[conn.peer]; if (!prT || typeof msg.mapId !== 'string' || msg.mapId !== prT.location || typeof msg.row !== 'string') return;
        if (!allow('turnend', { perMs: 400, burst: 4, windowMs: 4000, table: 400 }, conn.peer)) return;
        var cbT = own(net.combats, msg.mapId) ? net.combats[msg.mapId] : null, rowT = cbT && Array.isArray(cbT.rows) ? cbT.rows[cbT.turn] : null;
        if (!rowT || rowT.id !== msg.row || typeof rowT.tokId !== 'string') return;
        var campT = getActiveCampaign(), mapT = campT && campT.items && own(campT.items, msg.mapId) ? campT.items[msg.mapId] : null;
        var tokT = mapT && mapT.type === 'map' && Array.isArray(mapT.whiteboard) ? mapT.whiteboard.find(function(w) { return w && w.id === rowT.tokId; }) : null;
        if (!tokT || !tokT.isChar || !tokT.ownerId || tokT.ownerId !== prT.id) return;
        net.combatStep(msg.mapId, 1);
        // [netcheck:turnend-end]
    } else if (msg.type === 'char-upload' && net.role === 'host') {
        // [netcheck:charupload-start]
        // Stage 6 U2: a player's own sheet file as proposed changes — an admitted player, their own whole character, one upload every 10 s, the
        // file cleaned (its size, its portrait) and read on the host's full system and library; their own row facts apply at once when the system
        // allows it (setting B), the rest wait for the GM (camp.uploads: the GM's, never sent). The answer: how many wait, how many applied
        var Su = SC(), Fu = window.wpFormula; if (!Su || !Fu) return;
        var qu = Su.cleanCharUpload(msg); if (!qu) return;
        var ansU = function(o) { o.type = 'char-upload-ans'; o.rid = qu.rid; try { conn.send(o); } catch (e) { sendFailed(e); } };
        var isFileU = !!(qu.sheet && typeof qu.sheet === 'object' && qu.sheet.format === 'waypoint-character');   // Onboarding F2a: a character file (never read as a dossier)
        if (net.paused || peerPaused(conn.peer)) { ansU({ reason: 'paused' }); return; }
        if (window.wpVtt && !window.wpVtt.on('sheets')) { ansU({ reason: 'off' }); return; }
        var nowU = Date.now(); if (_uploadAt[conn.peer] && nowU - _uploadAt[conn.peer] < UPLOAD_GAP_MS) { ansU({ reason: 'slow' }); return; }
        var campU = getActiveCampaign(), chU = (campU && campU.chars && typeof qu.charId === 'string' && Object.prototype.hasOwnProperty.call(campU.chars, qu.charId) ? campU.chars[qu.charId] : null);
        if (!campU || !campU.system || !chU) { ansU({ reason: 'missing' }); return; }
        var profU = net.roster[conn.peer]; if (chU.npc || !chU.ownerId || !profU || chU.ownerId !== profU.id) { ansU({ reason: 'owner' }); return; }
        // [netcheck:charfill-start]
        // Onboarding F4 (owner, 2026-09-27): a character in the making takes the file AT ONCE, with its owner's rights — past the list rules while
        // making (a library copy's own name and stats, rows of their own), never the GM's fields — read on the players' view with the entries they
        // may see (nothing GM-only is there to match, so the answer is the same with or without it). Where the table lets them (fromFile), not
        // while the library loads, a file every ten seconds a player (a dozen a minute for the table). The answer: counts only; the GM is told and reviews at Done
        if (chU.making === 1) {
            var SHf = window.wpSheets;
            if (!Su.newCharRules(campU, sheetsOnFor(campU)).fromFile) { ansU({ reason: 'nofile' }); return; }
            if (window.wpLibrary && window.wpLibrary.state && window.wpLibrary.state() === 'loading') { ansU({ reason: 'wait' }); return; }
            if (!allow('charfill', { perMs: 10000, burst: 2, windowMs: 60000, table: 12 }, conn.peer)) { ansU({ reason: 'slow' }); return; }
            _uploadAt[conn.peer] = nowU;
            var viewF = SHf && SHf.playerSystem ? SHf.playerSystem(campU) : null, pfF = viewF && SHf.playerFinder ? SHf.playerFinder(campU, viewF) : null;
            var fillF = !pfF ? null : isFileU ? (SHf.charFromJson ? SHf.charFromJson(viewF, qu.sheet, pfF.find, pfF.findKey) : null) : Su.sbFill(qu.sheet, viewF, Fu, pfF.find);
            var rF = fillF ? Su.fillMaking(campU.system, chU, fillF, Fu, { view: viewF, lib: pfF.lib, now: nowU }) : null;
            if (!rF || !rF.ok) { ansU({ reason: 'unread' }); return; }
            var leftF = rF.left + (typeof fillF.lost === 'number' && isFinite(fillF.lost) ? Math.max(0, fillF.lost | 0) : 0);   // rows the file named and nothing here could place (read on the players' view: no oracle)
            chU.values = rF.values; chU.updated = nowU;
            if (net.sendCharTo) net.sendCharTo(profU.id, qu.charId);   // theirs alone while it is made
            if (SHf && SHf.charChanged) SHf.charChanged(qu.charId);
            saveRemoteSoon();
            var tF = (profU.name || 'A player') + ' filled ' + (chU.name || 'their character') + ' from a file (' + rF.done + (rF.done === 1 ? ' part' : ' parts') + (leftF ? ', ' + leftF + ' left out' : '') + ')';
            toast(tF + ' \u2014 you review it when they press Done.'); logEvent('char', tF);
            ansU({ n: 0, auto: rF.done, left: leftF });
            return;
        }
        // [netcheck:charfill-end]
        if (isFileU) { ansU({ reason: 'file' }); return; }   // a character file fills only a character in the making (owner, 2026-09-27: in play, Import stays as it was)
        _uploadAt[conn.peer] = nowU;
        var findU = window.wpSheets && window.wpSheets.sbFinder ? window.wpSheets.sbFinder(campU, campU.system) : null;
        var prU = Su.sbProposal(campU.system, chU, qu.sheet, Fu, findU), autoU = 0;
        if (campU.system.listRules && campU.system.listRules.uploadFacts === true) {   // setting B: their own row facts at once, each as their own hand would make it (a list they cannot change, a locked switch, a row kept from them: it waits for the GM)
            var optU = { player: true, view: window.wpSheets && window.wpSheets.playerSystem ? window.wpSheets.playerSystem(campU) : null }, valsU = chU.values, doneU = {};
            prU.changes.forEach(function(ch) { if (ch.kind !== 'fact') return; var oneU = {}; oneU[ch.id] = true; var rU = Su.sbApplyProposal(campU.system, Object.assign({}, chU, { values: valsU }), prU, oneU, Fu, optU); if (rU.done === 1) { valsU = rU.values; doneU[ch.id] = true; autoU++; } });
            if (autoU) {
                var dU = {}; Object.keys(valsU).forEach(function(k) { if (JSON.stringify(valsU[k]) !== JSON.stringify((chU.values || {})[k])) dU[k] = valsU[k]; });
                if (Object.keys(dU).length) { chU.values = valsU; chU.updated = nowU; net.syncCharDelta(qu.charId, dU); if (window.wpSheets) window.wpSheets.charChanged(qu.charId); }
            }
            prU.changes = prU.changes.filter(function(ch) { return doneU[ch.id] !== true; });
        }
        if (prU.changes.length) {
            var upsU = (Array.isArray(campU.uploads) ? campU.uploads : []).filter(function(u) { return u && u.charId !== qu.charId; });   // a newer upload of the same character replaces the older
            upsU.push({ id: 'up_' + nowU.toString(36) + Math.random().toString(36).slice(2, 6), charId: qu.charId, from: profU.id, name: String(profU.name || 'A player').slice(0, 60), at: nowU, changes: prU.changes });
            campU.uploads = upsU.slice(-Su.LIMITS.uploads);
            var tU = (profU.name || 'A player') + ' sent a sheet update for ' + (chU.name || 'their character') + ': ' + prU.changes.length + (prU.changes.length === 1 ? ' change' : ' changes') + ' to review (Review on the character\u2019s sheet).';
            toast(tU); logEvent('char', tU);
            if (window.wpSheets && window.wpSheets.uploadsChanged) window.wpSheets.uploadsChanged(qu.charId);
        }
        saveRemoteSoon();
        ansU({ n: prU.changes.length, auto: autoU });
        // [netcheck:charupload-end]
    } else if (msg.type === 'char-item' && net.role === 'host') {
        // [netcheck:charitem-start]
        // a player's change of a carried list on their own character: same gates as char-edit, then applyRowOp reads every definition from the system
        var Si = SC(), Fi = window.wpFormula; if (!Si || !Fi) return;
        var qi = Si.cleanCharItem(msg); if (!qi) return;
        var denyI = function(reason) { try { conn.send({ type: 'char-deny', rid: qi.rid, reason: reason }); } catch (e) { sendFailed(e); } };
        if (net.paused || peerPaused(conn.peer)) { denyI('paused'); return; }
        if (!charLimit && window.wpDiceCore) charLimit = window.wpDiceCore.RateLimit({ perMs: 100, burst: Si.LIMITS.editsPerWindow, windowMs: Si.LIMITS.editWindowMs, table: 400 });
        var limI = charLimit ? charLimit.allow(conn.peer, Date.now()) : true;
        if (limI !== true) { var skI = conn.peer + '|slow'; if (!_charSlowSaid[skI] || Date.now() - _charSlowSaid[skI] > Si.LIMITS.editWindowMs) { _charSlowSaid[skI] = Date.now(); denyI('slow'); } return; }
        if (window.wpVtt && !window.wpVtt.on('sheets')) { denyI('off'); return; }
        var campI = getActiveCampaign(), chI = (campI && campI.chars && typeof qi.charId === 'string' && Object.prototype.hasOwnProperty.call(campI.chars, qi.charId) ? campI.chars[qi.charId] : null);
        if (!campI || !campI.system || !chI) { denyI('missing'); return; }
        var profI = net.roster[conn.peer]; if (chI.npc || !chI.ownerId || !profI || chI.ownerId !== profI.id) { denyI('owner'); return; }
        var nowI = Date.now(), gkI = qi.charId + '|' + qi.fieldId + '|' + (qi.rowId || ''), grI = qi.op !== 'add' && _rowGrace[gkI] && _rowGrace[gkI].until > nowI ? _rowGrace[gkI] : null;   // Stage 6: inside a pickup's Undo window
        var ogI = !!(_rowGrace[gkI + '|on'] && _rowGrace[gkI + '|on'].until > nowI);   // F4b: a bound item switched on a moment ago may come off (or be dropped: the lock covers that while it is on)
        var libI = window.wpLibrary && window.wpLibrary.playerEntry ? function(id) { return window.wpLibrary.playerEntry(id) ? window.wpLibrary.entry(id) : null; } : null;   // Stage 6 library L3: an entry of a pack players may see (the host's own copy of it: the row keeps it)
        var resI = Si.applyRowOp(campI.system, chI, qi.fieldId, qi, Fi, { player: true, view: window.wpSheets ? window.wpSheets.playerSystem(campI) : null, grace: grI, onGrace: !!ogI, lib: libI });
        if (!resI.ok) {
            if (resI.reason === 'stays') { itemNotice(chI, resI.name, resI.eq && qi.op === 'set' ? 'eq-bound-try' : 'bound-try'); try { conn.send({ type: 'char-deny', rid: qi.rid, reason: 'stays', msg: resI.msg || '' }); } catch (e) { sendFailed(e); } return; }   // a bound item: it stays, with the GM's message
            denyI(resI.reason); return;
        }
        chI.values = chI.values || {}; chI.values[qi.fieldId] = resI.value; chI.updated = nowI;
        Object.keys(_rowGrace).forEach(function(k) { if (_rowGrace[k].until <= nowI) delete _rowGrace[k]; });
        if (resI.added > 0 && typeof resI.row === 'string') {   // a pickup (a new row, a merge, a +) opens the row's Undo window, or folds into it and extends it
            var gkA = qi.charId + '|' + qi.fieldId + '|' + resI.row, gA = _rowGrace[gkA];
            if (gA) { gA.added += resI.added; gA.until = nowI + Si.LIMITS.undoGraceMs; } else _rowGrace[gkA] = { until: nowI + Si.LIMITS.undoGraceMs, added: resI.added };
        } else if (grI && resI.undone > 0) grI.added = Math.max(0, grI.added - resI.undone);   // taken back: the window stays until it lapses (a later Undo takes back nothing and says nothing)
        if (resI.onGraceUsed) delete _rowGrace[gkI + '|on'];   // F4b review: a grace lets it go once (the GM switching it on again is not undone by it)
        if (typeof resI.onRow === 'string' && resI.eqNote === 'bound') _rowGrace[qi.charId + '|' + qi.fieldId + '|' + resI.onRow + '|on'] = { until: nowI + Si.LIMITS.undoGraceMs, added: 0 };   // F4b: switched on (or picked up on) — it may come off for a moment, as a pickup's Undo
        saveRemoteSoon();
        try { conn.send((resI.hid || resI.keptOn) && resI.msg ? { type: 'char-ack', rid: qi.rid, msg: resI.msg } : { type: 'char-ack', rid: qi.rid }); } catch (e) { sendFailed(e); }   // a cursed item's message rides the answer (none: the answer any removal gets); F4b: a curse kept on, too
        var dI = {}; dI[qi.fieldId] = resI.value; net.syncCharDelta(qi.charId, dI);
        if (resI.note && resI.added > 0) itemNotice(chI, resI.name, resI.note === 'bound' ? 'bound-pick' : 'curse-pick');
        else if (resI.hid) itemNotice(chI, resI.name, 'curse-drop');
        if (resI.eqNote && typeof resI.onRow === 'string') itemNotice(chI, resI.name, resI.eqNote === 'bound' ? 'eq-bound-on' : 'eq-curse-on');   // F4b
        if (resI.keptOn) itemNotice(chI, resI.name, 'eq-curse-off');
        if (typeof resI.secretPick === 'string') itemNotice(chI, resI.name + '\u2019s ' + resI.secretPick, 'pick-over');   // owner 2026-09-27: their pick replaced a hidden choice you set
        if (window.wpSheets) window.wpSheets.charChanged(qi.charId);
        // [netcheck:charitem-end]
    } else if ((msg.type === 'lib-idx' || msg.type === 'lib-get') && net.role === 'host') {
        // [netcheck:libreq-start]
        // Stage 6 library L3: a player looks through the library — a pack's index a page at a time, then entries by id, in the players' view.
        // Admitted peers, the hosted campaign, a pack players may see; rate-limited, and at most LIB.hostBudget bytes a profile per session
        var LBq = window.wpLibrary, LCq = window.wpLibraryCore, profQ = net.roster[conn.peer], ridQ = typeof msg.rid === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(msg.rid) ? msg.rid : '';
        if (!ridQ) return;
        var ansQ = function(o) { o.type = msg.type + '-ans'; o.rid = ridQ; try { conn.send(o); } catch (e) { sendFailed(e); } };
        if (!profQ || !LBq || !LBq.playerIndexOf || !LCq) { ansQ({ err: 'none' }); return; }
        if (!allow('lib', { perMs: 50, burst: 40, windowMs: 10000, table: 400 }, conn.peer)) { ansQ({ err: 'busy' }); return; }
        var campQ = getActiveCampaign(); if (!campQ || msg.campId !== campQ.id) { ansQ({ err: 'camp' }); return; }
        var ixQ = typeof msg.packId === 'string' && LCq.PACK_RE.test(msg.packId) ? LBq.playerIndexOf(msg.packId) : null; if (!ixQ) { ansQ({ err: 'pack' }); return; }
        var outQ = { packId: msg.packId, hash: ixQ.hash };
        if (msg.type === 'lib-idx') { var pgQ = LCq.indexPage(ixQ.rows, msg.page, LCq.LIB.page); if (!pgQ) { ansQ({ err: 'page' }); return; } outQ.page = pgQ.page; outQ.pages = pgQ.pages; outQ.rows = pgQ.rows; }
        else { if (!Array.isArray(msg.ids) || !msg.ids.length || msg.ids.length > LCq.LIB.getIds) { ansQ({ err: 'ids' }); return; } outQ.entries = LCq.getAnswer(ixQ.byId, msg.ids, LCq.LIB.answerBytes); }
        var bQ = JSON.stringify(outQ).length, kQ = profQ.id, hadQ = Object.prototype.hasOwnProperty.call(_libSpent, kQ) ? _libSpent[kQ] : 0;
        if (hadQ + bQ > LCq.LIB.hostBudget) { ansQ({ err: 'budget' }); return; }
        _libSpent[kQ] = hadQ + bQ; ansQ(outQ);
        // [netcheck:libreq-end]
    } else if (msg.type === 'char-effect' && net.role === 'host') {
        // [netcheck:charfx-start]
        // 5h: a player's status-effects change on their own character: shape, pause, rate, feature, ownership, then the list's own rules
        var Sx = SC(), Fx = window.wpFormula; if (!Sx || !Fx) return;
        var qx = Sx.cleanCharEffect(msg); if (!qx) return;
        var denyX = function(reason) { try { conn.send({ type: 'char-deny', rid: qx.rid, reason: reason }); } catch (e) { sendFailed(e); } };
        if (net.paused || peerPaused(conn.peer)) { denyX('paused'); return; }
        if (!charLimit && window.wpDiceCore) charLimit = window.wpDiceCore.RateLimit({ perMs: 100, burst: Sx.LIMITS.editsPerWindow, windowMs: Sx.LIMITS.editWindowMs, table: 400 });
        var limX = charLimit ? charLimit.allow(conn.peer, Date.now()) : true;
        if (limX !== true) { var skX = conn.peer + '|slow'; if (!_charSlowSaid[skX] || Date.now() - _charSlowSaid[skX] > Sx.LIMITS.editWindowMs) { _charSlowSaid[skX] = Date.now(); denyX('slow'); } return; }
        if (window.wpVtt && !window.wpVtt.on('sheets')) { denyX('off'); return; }
        var campX = getActiveCampaign(), chX = (campX && campX.chars && typeof qx.charId === 'string' && Object.prototype.hasOwnProperty.call(campX.chars, qx.charId) ? campX.chars[qx.charId] : null);
        if (!campX || !campX.system || !chX) { denyX('missing'); return; }
        var profX = net.roster[conn.peer]; if (chX.npc || !chX.ownerId || !profX || chX.ownerId !== profX.id) { denyX('owner'); return; }
        var resX = Sx.applyEffectOp(campX.system, chX, qx.fieldId, qx, Fx, { player: true, view: window.wpSheets ? window.wpSheets.playerSystem(campX) : null, now: Date.now(), inCombat: !!(net.charInCombat && net.charInCombat(qx.charId)), timersGm: !!(campX.turnRules && campX.turnRules.timers === 'gm') });   // T5a: a timed effect starts its timer; T5b: its player may pause, reset or dismiss it unless the campaign keeps that the GM's
        if (!resX.ok) { denyX(resX.reason); return; }
        chX.values = chX.values || {}; chX.values[qx.fieldId] = resX.value;
        var dX = {}; dX[qx.fieldId] = resX.value;
        if (resX.clamp) Object.keys(resX.clamp).forEach(function(fid) { chX.values[fid] = resX.clamp[fid]; dX[fid] = resX.clamp[fid]; });   // a pool above its new max comes down in the same change
        chX.updated = Date.now();
        saveRemoteSoon();
        try { conn.send({ type: 'char-ack', rid: qx.rid }); } catch (e) { sendFailed(e); }
        net.syncCharDelta(qx.charId, dX);
        if (window.wpSheets) window.wpSheets.charChanged(qx.charId);
        // [netcheck:charfx-end]
    } else if (msg.type === 'throw-req' && net.role === 'host') {
        // a player throws an item from their sheet: ownership + carried-item + area read from the system, then place & share on the GM's current map
        var St = SC(); if (!St || !window.wpPlaceThrownBlast) return;
        if (typeof msg.charId !== 'string' || typeof msg.fieldId !== 'string' || typeof msg.rowId !== 'string' || typeof msg.mapId !== 'string') return;
        if (net.paused || peerPaused(conn.peer)) return;   // frozen table (or this player is paused): no throws
        if (window.wpVtt && !window.wpVtt.on('sheets')) return;
        if (!charLimit && window.wpDiceCore) charLimit = window.wpDiceCore.RateLimit({ perMs: 100, burst: St.LIMITS.editsPerWindow, windowMs: St.LIMITS.editWindowMs, table: 400 });
        if (charLimit && charLimit.allow(conn.peer, Date.now()) !== true) return;
        var campT = getActiveCampaign(); if (!campT || !campT.system) return;
        var amT = getActiveMap(); if (!amT || amT.id !== msg.mapId) return;   // throws land on the GM's current map (where the player is)
        var chT = (campT && campT.chars && typeof msg.charId === 'string' && Object.prototype.hasOwnProperty.call(campT.chars, msg.charId) ? campT.chars[msg.charId] : null), profT = net.roster[conn.peer];
        if (!chT || chT.npc || !chT.ownerId || !profT || chT.ownerId !== profT.id || chT.making === 1) return;
        if (!(amT.whiteboard || []).some(function(w) { return w && w.isChar && !w.hidden && w.ownerId === profT.id && w.charId === msg.charId; })) return;   // the thrower must be on this map: a token of THAT character (a kept one has none of its own)
        var fT = St.fieldById(campT.system, msg.fieldId); if (!fT || fT.kind !== 'item-list' || fT.vis !== 'all') return;   // Stage 6: a visible list only (a GM-only list's items are never thrown by a player)
        var vT = chT.values && chT.values[fT.id], rowT = Array.isArray(vT) ? vT.find(function(r) { return r && r.hid !== 1 && St.rowIdOf(r) === msg.rowId; }) : null; if (!rowT) return;   // the carried row, on the host's copy
        var rdT = St.rowDef(campT.system, rowT), defT = rdT ? rdT.def : null; if (!defT || defT.vis === 'gm' || !defT.area) return;
        if (campT.system.combat && campT.system.combat.blastRoller === 'gm') return;   // who-rolls = 'gm': only the GM throws
        var xT = Math.max(0, Math.min(30000, Number(msg.x))), yT = Math.max(0, Math.min(30000, Number(msg.y)));
        if (!isFinite(xT) || !isFinite(yT)) return;
        window.wpPlaceThrownBlast({ x: xT, y: yT, ft: defT.area.ft, name: defT.area.name || defT.name, by: chT.name, charId: msg.charId, damage: defT.damage || '' });
    } else if (msg.type === 'door-req' && net.role === 'host') {
        // [netcheck:doorreq-start]
        // a player opens/closes a door a token of theirs is adjacent to; validated on the host's OWN copy, then resynced to all
        if (typeof msg.mapId !== 'string' || typeof msg.itemId !== 'string') return;
        if (net.paused || peerPaused(conn.peer)) return;                              // frozen table (or this player is paused): no board mutation
        if (window.wpVtt && !window.wpVtt.on('fog')) return;                           // fog off -> doors are meaningless
        if (!_doorLimit && window.wpDiceCore) _doorLimit = window.wpDiceCore.RateLimit({ perMs: 100, burst: 3, windowMs: 3000, table: 200 });
        if (_doorLimit && _doorLimit.allow(conn.peer, Date.now()) !== true) return;    // a toggle triggers a per-recipient resend, so keep it tight; silent drop
        var denyDR = function(reason) { try { conn.send({ type: 'door-deny', reason: reason }); } catch (e) { sendFailed(e); } };
        var campDR = getActiveCampaign(); if (!campDR) return;
        var amDR = getActiveMap(); if (!amDR || amDR.id !== msg.mapId) return;         // only the GM's current map
        var profDR = net.roster[conn.peer]; if (!profDR) return;
        if (profDR.location && profDR.location !== amDR.id) { denyDR('far'); return; }   // the player must BE on this map, not merely own a token left behind on it
        var doorEl = (amDR.whiteboard || []).find(function(w) { return w && w.id === msg.itemId; });
        if (!doorEl || doorEl.blocksSight !== true || doorEl.sightType !== 'door' || doorEl.hidden) return;   // not a visible door (a hidden one answers nothing, like none: it is on no player's copy)
        if (doorEl.doorLock) { denyDR('locked'); return; }                            // GM-locked against players
        var Cdr = window.wpFogCore; if (!Cdr) return;
        var gridDR = Cdr.gridFor((amDR.meta && amDR.meta.gridType) || 'off', amDR.fog && amDR.fog.cell); if (!gridDR) return;   // gridless: can't judge adjacency -> ignore
        var dCellsR = doorEl.type === 'path' ? Cdr.pathCells(doorEl, gridDR) : Cdr.itemCells(doorEl, gridDR);   // item 18: the door's own cells, by its outline (a turned door as it is drawn); W2: a line door's, the cells its line passes
        var adjacentR = (amDR.whiteboard || []).some(function(w) {
            if (!w || !w.isChar || w.hidden || w.ownerId !== profDR.id) return false;
            var tc = Cdr.cellOf(w.x + (w.w || 60) / 2, w.y + (w.h || 52) / 2, gridDR);
            return dCellsR.some(function(dc) { return gridDR.type === 'square' ? (Math.max(Math.abs((dc.c || 0) - (tc.c || 0)), Math.abs((dc.r || 0) - (tc.r || 0))) <= 1) : (Cdr.hexDist(dc, tc) <= 1); });
        });
        if (!adjacentR) { denyDR('far'); return; }
        doorEl.doorOpen = !doorEl.doorOpen;
        save(true);                                                                   // host save -> onLocalSave: invalidateVision + resend the map fog-filtered per recipient
        if (window.wpFog) window.wpFog.redraw();                                       // refresh the GM's own overlay
        // [netcheck:doorreq-end]
    } else if (msg.type === 'door-deny' && net.role === 'client') {
        toast(msg.reason === 'locked' ? 'The GM has that door locked.' : msg.reason === 'far' ? 'Move a token next to that door to open it.' : 'Cannot open that door right now.');
    } else if (msg.type === 'system' && net.role === 'client') {
        // the hosted campaign's system as the players' view (character sheets, 1.5.0), re-cleaned here; null = the campaign has none
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || !window.wpSystemCore || !window.wpFormula) return;
        if (typeof msg.campId !== 'string' || msg.campId !== state.appState.activeCampaignId) return;
        var campS = campOf(msg.campId); if (!campS) return;
        if (msg.system === null) delete campS.system;
        else { var csys = window.wpSystemCore.cleanSystem(msg.system, { F: window.wpFormula, gmView: false, libCats: {} }); if (csys) campS.system = csys; }
        if (window.wpSheetsSync) window.wpSheetsSync();
    } else if (msg.type === 'docStyle' && net.role === 'client') {
        // the hosted campaign's document look changed mid-session (doc theming): from the synced host only, re-validated here; an open Handbook page and the sheet follow
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream) return;
        if (typeof msg.campId !== 'string' || msg.campId !== state.appState.activeCampaignId) return;
        var campDS = campOf(msg.campId); if (!campDS) return;
        var DRds = window.wpDocRender, cds = (DRds && DRds.cleanDocStyle) ? DRds.cleanDocStyle(msg.docStyle) : null;
        if (cds) campDS.docStyle = cds; else delete campDS.docStyle;
        try { if (window.wpDocReaderRestyle) window.wpDocReaderRestyle(msg.campId); } catch (e) {}
        try { if (window.wpSheets && window.wpSheets.renderSheet) window.wpSheets.renderSheet(); } catch (e) {}
    } else if (msg.type === 'campFog' && net.role === 'client') {
        // [netcheck:campfog-start]
        // the hosted campaign's fog defaults changed mid-session: from the synced host only, for the hosted campaign, cleaned again (fogcore
        // cleanCampFog); the fog is worked out afresh (its caches busted) and redrawn
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream) return;
        if (typeof msg.campId !== 'string' || msg.campId !== state.appState.activeCampaignId) return;
        var campFg = campOf(msg.campId), FCf = window.wpFogCore; if (!campFg || !FCf || !FCf.cleanCampFog) return;
        campFg.fog = FCf.cleanCampFog(msg.fog);
        if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }
        // [netcheck:campfog-end]
    } else if (msg.type === 'clock' && net.role === 'client') {
        // [netcheck:clockmsg-start]
        // item 20 K2: the hosted campaign's clock from the synced host, for the hosted campaign, cleaned again (calendarcore cleanClock): its
        // time alone and (K3) its notes as text, never a hide or a vis; null takes it away (the Calendar off, or the GM keeps the date from players)
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream) return;
        if (typeof msg.campId !== 'string' || msg.campId !== state.appState.activeCampaignId) return;
        var campCk = campOf(msg.campId), CCk = window.wpCalendarCore; if (!campCk || !CCk || !CCk.cleanClock) return;
        var ckIn = msg.clock === null ? null : CCk.cleanClock(msg.clock);
        if (ckIn) { var ckKeep = { t: ckIn.t }; if (ckIn.notes) ckKeep.notes = ckIn.notes.map(function(n) { return { id: n.id, day: n.day, text: n.text }; }); campCk.clock = ckKeep; } else delete campCk.clock;   // K3: its notes as text, never a vis
        if (window.wpCalendar) window.wpCalendar.refresh();
        // [netcheck:clockmsg-end]
    } else if (msg.type === 'fogDiff' && net.role === 'client') {
        // [netcheck:fogdiff-start]
        // Fold M: the host catching this player's copy of one fogged map up in place (applyFogDiff): from the synced host only, never in the
        // stream window, for the hosted campaign
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream) return;
        if (typeof msg.campId !== 'string' || msg.campId !== state.appState.activeCampaignId || !validKey(msg.itemId)) return;
        applyFogDiff(msg);
        // [netcheck:fogdiff-end]
    } else if (msg.type === 'campName' && net.role === 'client') {
        // [netcheck:campname-start]
        // the hosted campaign renamed mid-session: from the synced host only, for the hosted campaign, a string (cut to 200); the top bar
        // paints it as text (renderWhere cleans it again)
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream) return;
        if (typeof msg.campId !== 'string' || msg.campId !== state.appState.activeCampaignId || typeof msg.name !== 'string') return;
        var campNm = campOf(msg.campId); if (!campNm) return;
        campNm.name = msg.name.slice(0, 200);
        renderWhere();
        // [netcheck:campname-end]
    } else if (msg.type === 'libManifest' && net.role === 'client') {
        // [netcheck:libman-start]
        // Stage 6 library L3b: the library the host lets players look through — from the synced host only, for the hosted campaign, cleaned
        // (librarycore cleanPlayerManifest: ids, names, icons, counts, hashes; nothing else); a pack whose hash moved is read again
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream) return;
        var LCm = window.wpLibraryCore, mm = LCm ? LCm.cleanPlayerManifest(msg) : null;
        if (!mm || mm.campId !== state.appState.activeCampaignId || !campOf(mm.campId)) return;
        net.libTake(mm);
        if (window.wpSheetsSync) window.wpSheetsSync();   // the sheets' "From the library…" follows
        // [netcheck:libman-end]
    } else if ((msg.type === 'lib-idx-ans' || msg.type === 'lib-get-ans') && net.role === 'client') {
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream) return;   // L3b: from the synced host only; net.libAnswer takes only the answer to the ask in flight
        net.libAnswer(msg);
    } else if (msg.type === 'turnRules' && net.role === 'client') {
        // [netcheck:turnrules-start]
        // who may press an effect's timer changed mid-session (turn-based combat T5b): from the synced host only, for the hosted campaign, the one
        // word; the sheet's controls follow
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream) return;
        if (typeof msg.campId !== 'string' || msg.campId !== state.appState.activeCampaignId || (msg.timers !== 'gm' && msg.timers !== 'owner')) return;
        var campTR = campOf(msg.campId); if (!campTR) return;
        campTR.turnRules = Object.assign({}, campTR.turnRules && typeof campTR.turnRules === 'object' ? campTR.turnRules : {}, { timers: msg.timers, fill: msg.fill === 'gm' ? 'gm' : 'owner' });   // item 20 K5b: an older host sends no fill: players fill
        if (window.wpSheetsSync) window.wpSheetsSync();
        // [netcheck:turnrules-end]
    } else if (msg.type === 'char-pic' && net.role === 'host') {
        // [netcheck:charpic-start]
        // Onboarding F1c: the owner changes their character's picture — a face (as the picker offers; 'photo' is the picture on their roster
        // entry) or a small picture they upload (checked whole) — an admitted player, their own whole character, not while paused, a couple a
        // half-minute; the GM's machine saves it and every token of the character follows; the GM is told
        var ridP = typeof msg.rid === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(msg.rid) ? msg.rid : null; if (!ridP) return;
        var ansP = function(o) { o.type = 'char-pic-ans'; o.rid = ridP; try { conn.send(o); } catch (e) { sendFailed(e); } };
        var prP = own(net.roster, conn.peer) ? net.roster[conn.peer] : null; if (!prP) return;
        if (net.paused || peerPaused(conn.peer)) { ansP({ reason: 'paused' }); return; }
        if (window.wpVtt && !window.wpVtt.on('sheets')) { ansP({ reason: 'off' }); return; }
        var campP = getActiveCampaign(), chP = campP && campP.chars && typeof msg.charId === 'string' && own(campP.chars, msg.charId) ? campP.chars[msg.charId] : null;
        if (!chP) { ansP({ reason: 'missing' }); return; }
        if (chP.npc || !chP.ownerId || chP.ownerId !== prP.id) { ansP({ reason: 'owner' }); return; }
        var fP = typeof msg.face === 'string' ? cleanFace(msg.face) : '', imP = typeof msg.img === 'string' && safeAvatar(msg.img) ? msg.img : '';
        if ((msg.img !== undefined && !imP) || (!fP && !imP)) { ansP({ reason: 'bad' }); return; }
        if (!allow('charpic', { perMs: 3000, burst: 2, windowMs: 30000, table: 12 }, conn.peer)) { ansP({ reason: 'slow' }); return; }   // table: every player's together (each is a picture saved on the GM's disk)
        if (!window.wpSheets || !window.wpSheets.applyCharFace) { ansP({ reason: 'off' }); return; }
        var tP = (prP.name || 'A player') + ' changed ' + (chP.name || 'their character') + '\u2019s picture';
        Promise.resolve(window.wpSheets.applyCharFace(chP.id, imP ? { kind: 'picture', data: imP } : charFacePlan(fP, prP.avatar), true)).then(function(okP) {   // answered once it is saved (or could not be)
            if (okP !== true) { ansP({ reason: 'failed' }); return; }
            toast(tP + '.'); logEvent('char', tP); ansP({ ok: true });
        }, function() { ansP({ reason: 'failed' }); });
        // [netcheck:charpic-end]
    } else if (msg.type === 'char-make' && net.role === 'host') {
        // [netcheck:charmake-start]
        // Onboarding F3: a player starts a character of their own — in the making (theirs alone, not in play; every field they can see is theirs
        // to set) — an admitted player, not while paused, sheets on with a system and making open (the campaign's rule), one at a time (asking
        // again gives the one they are making), not while they play a character, a dozen at a table at most, two a minute; the GM is told
        var ridK = typeof msg.rid === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(msg.rid) ? msg.rid : null; if (!ridK) return;
        var ansK = function(o) { o.type = 'char-make-ans'; o.rid = ridK; try { conn.send(o); } catch (e) { sendFailed(e); } };
        var prK = own(net.roster, conn.peer) ? net.roster[conn.peer] : null; if (!prK) return;
        if (net.paused || peerPaused(conn.peer)) { ansK({ reason: 'paused' }); return; }
        var campK = getActiveCampaign(), SK = SC();
        if (!campK || !SK || SK.newCharRules(campK, sheetsOnFor(campK)).create !== 'live') { ansK({ reason: 'closed' }); return; }
        var csK = campK.chars && typeof campK.chars === 'object' ? campK.chars : (campK.chars = {}), mineK = null, nMk = 0;
        Object.keys(csK).forEach(function(k) { var x = csK[k]; if (x && x.making === 1) { nMk++; if (x.ownerId === prK.id && !mineK) mineK = x; } });
        if (mineK) {   // asking again re-sends their whole copy: a light bucket of its own (it never uses up a real make)
            if (!allow('charmakeagain', { perMs: 1000, burst: 5, windowMs: 10000, table: 120 }, conn.peer)) { ansK({ reason: 'slow' }); return; }
            sendCharTo(prK.id, mineK.id); ansK({ ok: true, charId: mineK.id }); return;
        }
        if (SK.activeCharOf(campK, prK.id).id) { ansK({ reason: 'have' }); return; }
        if (nMk >= SK.LIMITS.makingMax) { ansK({ reason: 'busy' }); return; }
        if (!allow('charmake', { perMs: 10000, burst: 2, windowMs: 60000, table: 30 }, conn.peer)) { ansK({ reason: 'slow' }); return; }
        var chK = { id: SK.uid('c_'), name: cleanCharName(msg.name) || cleanRosterName(prK.name), ownerId: prK.id, portrait: '', npc: false, values: {}, updated: Date.now(), making: 1, made: 1 };
        while (Object.prototype.hasOwnProperty.call(csK, chK.id)) chK.id = SK.uid('c_');
        csK[chK.id] = chK;
        saveRemoteSoon();
        sendCharTo(prK.id, chK.id);
        var tK = (prK.name || 'A player') + ' is making a character (' + chK.name + ')'; toast(tK + '.'); logEvent('char', tK);
        ansK({ ok: true, charId: chK.id });
        if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(chK.id);
        // [netcheck:charmake-end]
    } else if (msg.type === 'char-name' && net.role === 'host') {
        // [netcheck:charname-start]
        // Onboarding F3 (owner, 2026-09-27: only while in the making): the owner names their character; once live the GM renames it
        var ridN = typeof msg.rid === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(msg.rid) ? msg.rid : null; if (!ridN) return;
        var ansN = function(o) { o.type = 'char-name-ans'; o.rid = ridN; try { conn.send(o); } catch (e) { sendFailed(e); } };
        var prN = own(net.roster, conn.peer) ? net.roster[conn.peer] : null; if (!prN) return;
        if (net.paused || peerPaused(conn.peer)) { ansN({ reason: 'paused' }); return; }
        var campN = getActiveCampaign(), chN = campN && campN.chars && typeof msg.charId === 'string' && own(campN.chars, msg.charId) ? campN.chars[msg.charId] : null;
        if (!chN) { ansN({ reason: 'missing' }); return; }
        if (chN.npc || chN.ownerId !== prN.id) { ansN({ reason: 'owner' }); return; }
        if (chN.making !== 1) { ansN({ reason: 'notmaking' }); return; }
        var nmN = cleanCharName(msg.name); if (!nmN) { ansN({ reason: 'bad' }); return; }
        if (!allow('charname', { perMs: 1000, burst: 3, windowMs: 10000, table: 60 }, conn.peer)) { ansN({ reason: 'slow' }); return; }
        chN.name = nmN; chN.updated = Date.now(); saveRemoteSoon(); sendCharTo(prN.id, chN.id); ansN({ ok: true });
        if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(chN.id);
        // [netcheck:charname-end]
    } else if (msg.type === 'char-done' && net.role === 'host') {
        // [netcheck:chardone-start]
        // Onboarding F3: the owner says their character is finished — one in the making goes LIVE at once (in play, unless the GM gave them one to
        // play meanwhile: owner, 2026-09-27), its token on their waiting token's spot, their face copied when it has none; an unlocked one locks
        // again. Not a step of the GM's undo. The GM is told (a toast, the Session Log, the chip's badge and the sheet's review bar until Keep it)
        var ridD = typeof msg.rid === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(msg.rid) ? msg.rid : null; if (!ridD) return;
        var ansD = function(o) { o.type = 'char-done-ans'; o.rid = ridD; try { conn.send(o); } catch (e) { sendFailed(e); } };
        var prD = own(net.roster, conn.peer) ? net.roster[conn.peer] : null; if (!prD) return;
        if (net.paused || peerPaused(conn.peer)) { ansD({ reason: 'paused' }); return; }
        var campD = getActiveCampaign(), SD = SC(), chD = campD && campD.chars && typeof msg.charId === 'string' && own(campD.chars, msg.charId) ? campD.chars[msg.charId] : null;
        if (!chD || !SD) { ansD({ reason: 'missing' }); return; }
        if (chD.npc || chD.ownerId !== prD.id) { ansD({ reason: 'owner' }); return; }
        var stD = SD.openChar(chD); if (!stD) { ansD({ reason: 'notmaking' }); return; }
        if (!window.wpSheets || !window.wpSheets.giveCharacter) { ansD({ reason: 'off' }); return; }
        if (!allow('chardone', { perMs: 2000, burst: 2, windowMs: 30000, table: 30 }, conn.peer)) { ansD({ reason: 'slow' }); return; }
        var clD = SD.charClash(campD, chD.name, chD.id), CLW = { character: 'another character\u2019s', token: 'a token\u2019s', room: 'a room character\u2019s' };
        if (window.wpHistFlush) window.wpHistFlush();
        var wasRD = net.applyingRemote; net.applyingRemote = true;
        try {
            if (stD === 'making') { var playD = !SD.activeCharOf(campD, prD.id).id || chD.invited === 1; delete chD.making; delete chD.invited; chD.review = 1; window.wpSheets.giveCharacter(prD.id, chD.id, { play: playD, pic: true }); }   // asked while it is still in the making: does the GM's give (a character they play) stand?
            else { delete chD.unlocked; chD.review = 1; chD.updated = Date.now(); save(true); net.syncChar(chD.id); }
        } finally { net.applyingRemote = wasRD; }
        var tD = (prD.name || 'A player') + (stD === 'making' ? ' finished making ' : ' finished the sheet of ') + chD.name + (clD.length ? ' (the name is also ' + clD.map(function(k) { return CLW[k]; }).join(' and ') + ')' : '');
        toast(tD + ' \u2014 review it on its sheet.'); logEvent('char', tD);
        ansD(stD === 'making' && !playD ? { ok: true, kept: true } : { ok: true });   // kept: the character the GM gave them stays in play
        if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(chD.id);
        if (window.wpRenderPartyStrip) window.wpRenderPartyStrip();
        // [netcheck:chardone-end]
    } else if (msg.type === 'char-token' && net.role === 'host') {
        // [netcheck:chartoken-start]
        // Onboarding F3b: Just a token — a player with nothing of their own takes a name and their face and plays at once (the GM's rules: where
        // making is live, or always without sheets). Sheets on and a system: an EMPTY character of theirs, made, unlocked and in play at once (its
        // token where their waiting token stood), with the GM's review bar. Otherwise a plain token of theirs where their waiting token stood
        // (the waiting token becomes it) or at the landing spot, bound by its name; a picture from their face is saved when it has one
        var ridJ = typeof msg.rid === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(msg.rid) ? msg.rid : null; if (!ridJ) return;
        var ansJ = function(o) { o.type = 'char-token-ans'; o.rid = ridJ; try { conn.send(o); } catch (e) { sendFailed(e); } };
        var prJ = own(net.roster, conn.peer) ? net.roster[conn.peer] : null; if (!prJ) return;
        if (net.paused || peerPaused(conn.peer)) { ansJ({ reason: 'paused' }); return; }
        var campJ = getActiveCampaign(), SJ = SC(), shJ = !!campJ && sheetsOnFor(campJ);
        if (!campJ || !SJ || !SJ.newCharRules(campJ, shJ).justToken) { ansJ({ reason: 'closed' }); return; }
        var nmJ = cleanCharName(msg.name) || cleanRosterName(prJ.name), csJ = campJ.chars && typeof campJ.chars === 'object' ? campJ.chars : null;
        var tJ = (prJ.name || 'A player') + ' took just a token (' + nmJ + ')';
        if (shJ && campJ.system && typeof campJ.system === 'object') {
            if (csJ && Object.keys(csJ).some(function(k) { var x = csJ[k]; return x && x.ownerId === prJ.id && x.making === 1; })) { ansJ({ reason: 'making' }); return; }
            if (SJ.activeCharOf(campJ, prJ.id).id) { ansJ({ reason: 'have' }); return; }
            if (!window.wpSheets || !window.wpSheets.giveCharacter) { ansJ({ reason: 'off' }); return; }
            if (!allow('chartoken', { perMs: 10000, burst: 2, windowMs: 60000, table: 30 }, conn.peer)) { ansJ({ reason: 'slow' }); return; }
            if (!csJ) csJ = campJ.chars = {};
            var chJ = { id: SJ.uid('c_'), name: nmJ, ownerId: prJ.id, portrait: '', npc: false, values: {}, updated: Date.now(), made: 1, unlocked: 1, review: 1 };
            while (Object.prototype.hasOwnProperty.call(csJ, chJ.id)) chJ.id = SJ.uid('c_');
            csJ[chJ.id] = chJ;
            if (window.wpHistFlush) window.wpHistFlush();
            var wasRJ = net.applyingRemote; net.applyingRemote = true;
            try { window.wpSheets.giveCharacter(prJ.id, chJ.id, { play: true, pic: true }); } finally { net.applyingRemote = wasRJ; }
            toast(tJ + ' \u2014 review it on its sheet.'); logEvent('char', tJ);
            ansJ({ ok: true, charId: chJ.id });
            if (window.wpSheets.charChanged) window.wpSheets.charChanged(chJ.id);
            if (window.wpRenderPartyStrip) window.wpRenderPartyStrip();
            return;
        }
        if (SJ.activeCharOf(campJ, prJ.id).id || Object.keys(campJ.items || {}).some(function(id) { var m = campJ.items[id]; return m && Array.isArray(m.whiteboard) && m.whiteboard.some(function(w) { return w && w.isChar && w.ownerId === prJ.id; }); })) { ansJ({ reason: 'have' }); return; }   // a character of theirs (sheets off: the GM places its token) or a token of their own already
        var mJ = typeof prJ.location === 'string' && own(campJ.items, prJ.location) ? campJ.items[prJ.location] : null;
        if (!mJ || mJ.type !== 'map') { ansJ({ reason: 'nomap' }); return; }
        if (!allow('chartoken', { perMs: 10000, burst: 2, windowMs: 60000, table: 30 }, conn.peer)) { ansJ({ reason: 'slow' }); return; }
        var wJ = SJ.waitingTokensOf(campJ, prJ.id).filter(function(x) { return x.mapId === mJ.id; })[0], tokJ;
        if (wJ) { tokJ = wJ.w; delete tokJ.waiting; }   // the waiting token becomes theirs where it stands
        else {
            var cJ = SJ.tokenCell ? SJ.tokenCell(mJ) : { type: 'circle', w: 60, h: 52 };   // grid-shaped tokens: the map's cell shape
            tokJ = { id: 'wb' + Math.random().toString(36).slice(2, 10), type: cJ.type, ownerId: prJ.id, w: cJ.w, h: cJ.h, layer: 'middle' };
            var spJ = spawnSpot(mJ, null, null, cJ.w, cJ.h, null); tokJ.x = spJ.x; tokJ.y = spJ.y;
            if (window.wpSeatCell) window.wpSeatCell(tokJ, mJ); else if (window.wpSeatHex) window.wpSeatHex(tokJ, mJ);
            mJ.whiteboard = Array.isArray(mJ.whiteboard) ? mJ.whiteboard : []; mJ.whiteboard.push(tokJ);
        }
        var planJ = charFacePlan(prJ.face, prJ.avatar);
        tokJ.isChar = true; tokJ.charName = nmJ; tokJ.name = nmJ; tokJ.charStats = ''; tokJ.ownerId = prJ.id;
        if (SJ.shapeStandIn && SJ.shapeStandIn(tokJ, mJ)) { if (window.wpSeatCell) window.wpSeatCell(tokJ, mJ); else if (window.wpSeatHex) window.wpSeatHex(tokJ, mJ); }   // the map's cell shape (a waiting token already has it)
        tokJ.color = typeof prJ.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(prJ.color) ? prJ.color : '#4db3d3';
        if (planJ.kind === 'face') tokJ.face = planJ.face; else delete tokJ.face;
        if (campJ.players && own(campJ.players, prJ.id)) { campJ.players[prJ.id].charName = nmJ; campJ.players[prJ.id].charMade = nmJ; }   // bound by its name — one THEY chose: their next arrival finds it, never a GM's namesake
        waitingChanged(campJ, [mJ.id].concat(removeWaiting(campJ, prJ.id)));   // any other waiting token of theirs goes
        if (planJ.kind !== 'face' && window.wpSheets && window.wpSheets.applyTokenFace) window.wpSheets.applyTokenFace(mJ.id, tokJ.id, planJ);
        toast(tJ + '.'); logEvent('char', tJ);
        ansJ({ ok: true });
        // [netcheck:chartoken-end]
    } else if (msg.type === 'tok-pic' && net.role === 'host') {
        // [netcheck:tokpic-start]
        // The token creator (owner, 2026-09-27): a player's new picture for their own plain token (a Just a token token; a character's goes through
        // char-pic) — framed on their machine, checked whole here, saved as a PNG under a fresh name (applyTokenFace); the GM is told
        var ridP = typeof msg.rid === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(msg.rid) ? msg.rid : null; if (!ridP) return;
        var ansP = function(o) { o.type = 'tok-pic-ans'; o.rid = ridP; try { conn.send(o); } catch (e) { sendFailed(e); } };
        var prP2 = own(net.roster, conn.peer) ? net.roster[conn.peer] : null; if (!prP2) return;
        if (net.paused || peerPaused(conn.peer)) { ansP({ reason: 'paused' }); return; }
        var campP2 = getActiveCampaign(), mP2 = campP2 && typeof msg.mapId === 'string' && own(campP2.items, msg.mapId) ? campP2.items[msg.mapId] : null;
        var wP2 = mP2 && mP2.type === 'map' && Array.isArray(mP2.whiteboard) && typeof msg.wbId === 'string' ? mP2.whiteboard.find(function(w) { return w && w.id === msg.wbId; }) : null;
        if (!wP2 || wP2.hidden || wP2.gmNoteFor) { ansP({ reason: 'missing' }); return; }   // hidden pieces: a piece the GM hid (or a GM note) answers as one that is not there — it is on no player's copy, and the answer must not say otherwise
        if (!wP2.isChar || wP2.charId || wP2.waiting || wP2.ownerId !== prP2.id) { ansP({ reason: 'tokowner' }); return; }
        if (wP2.locked) { ansP({ reason: 'locked' }); return; }
        var imP2 = typeof msg.img === 'string' && safeAvatar(msg.img) ? msg.img : ''; if (!imP2) { ansP({ reason: 'bad' }); return; }
        if (!window.wpSheets || !window.wpSheets.applyTokenFace) { ansP({ reason: 'off' }); return; }
        if (!allow('charpic', { perMs: 3000, burst: 2, windowMs: 30000, table: 12 }, conn.peer)) { ansP({ reason: 'slow' }); return; }   // one budget with char-pic: every picture saved on the GM's disk counted together
        var nmP2 = wP2.charName || 'their token';
        Promise.resolve(window.wpSheets.applyTokenFace(mP2.id, wP2.id, { kind: 'picture', data: imP2 }, true)).then(function(ok) {
            ansP(ok ? { ok: true } : { reason: 'failed' });
            if (ok) { var tP2 = (prP2.name || 'A player') + ' changed the picture of their token (' + nmP2 + ')'; toast(tP2 + '.'); logEvent('char', tP2); }
        });
        // [netcheck:tokpic-end]
    } else if (msg.type === 'tok-light' && net.role === 'host') {
        // [netcheck:toklight-start]
        // Lighting L5 (owner answers 3, 9, 10, 11): a player's own light — a token they own switched on or off, or given one of the system's
        // presets the GM ticked "players may pick" (its place in the list AND its name: the list may have changed since their menu was drawn).
        // No number of a light is taken from the player: it is copied from the host's own list, or the token's own light is kept. Anywhere
        // (no fog or lighting gate: a torch set ready beforehand); never a waiting or locked token (a hidden one answers as one that is not
        // there), never one whose light the GM locked; a new light never past the map's cap. Written as a remote change (never a step of the GM's undo), then that map goes to
        // every player again, each through their own fog, whichever map the GM is on; the GM is told
        var ridL = typeof msg.rid === 'string' && /^[A-Za-z0-9_-]{1,24}$/.test(msg.rid) ? msg.rid : null; if (!ridL) return;
        var ansL = function(o) { o.type = 'tok-light-ans'; o.rid = ridL; try { conn.send(o); } catch (e) { sendFailed(e); } };
        var prL = own(net.roster, conn.peer) ? net.roster[conn.peer] : null; if (!prL) return;
        if (net.paused || peerPaused(conn.peer)) { ansL({ reason: 'paused' }); return; }
        var campL = getActiveCampaign(), mL = campL && typeof msg.mapId === 'string' && own(campL.items, msg.mapId) ? campL.items[msg.mapId] : null;
        var wL = mL && mL.type === 'map' && Array.isArray(mL.whiteboard) && typeof msg.wbId === 'string' ? mL.whiteboard.find(function(w) { return w && w.id === msg.wbId; }) : null;
        if (!wL || wL.hidden || wL.gmNoteFor) { ansL({ reason: 'missing' }); return; }   // hidden pieces: as tok-pic has it
        if (!wL.isChar || wL.waiting || wL.ownerId !== prL.id) { ansL({ reason: 'tokowner' }); return; }
        if (wL.locked) { ansL({ reason: 'locked' }); return; }
        if (wL.lightLock === true) { ansL({ reason: 'lightlock' }); return; }
        var FCL = window.wpFogCore, SCL = window.wpSystemCore; if (!FCL || !FCL.cleanLight || !SCL || !SCL.lightPresets) { ansL({ reason: 'off' }); return; }
        var oldL = FCL.cleanLight(wL.light), offL = msg.on === false, pickL = msg.preset !== undefined || msg.name !== undefined, newL = null;
        if (pickL) {
            var listL = SCL.lightPresets(campL.system), pL = typeof msg.preset === 'number' && Math.floor(msg.preset) === msg.preset && msg.preset >= 0 && msg.preset < listL.length ? listL[msg.preset] : null;
            if (!pL || pL.pick !== true || typeof msg.name !== 'string' || pL.name !== msg.name) { ansL({ reason: 'preset' }); return; }
            newL = FCL.cleanLight({ bright: pL.bright, dim: pL.dim, unit: pL.unit, name: pL.name, off: offL });
            if (!newL) { ansL({ reason: 'preset' }); return; }
        } else {
            if (!oldL) { ansL({ reason: 'nolight' }); return; }
            newL = FCL.cleanLight({ bright: oldL.bright, dim: oldL.dim, unit: oldL.unit, name: oldL.name, off: offL });
        }
        if (JSON.stringify(newL) === JSON.stringify(oldL)) { ansL({ ok: true }); return; }   // as it is already: nothing written, nobody told
        if (!oldL && window.wpFog && window.wpFog.lightCount && window.wpFog.lightCount(mL) >= FCL.LIMITS.lights) { ansL({ reason: 'cap' }); return; }
        if (!allow('toklight', { perMs: 400, burst: 5, windowMs: 10000, table: 80 }, conn.peer)) { ansL({ reason: 'slow' }); return; }
        if (window.wpHistFlush) window.wpHistFlush();   // the GM's pending edit is its own step before the player's light is written
        var hadL = Object.prototype.hasOwnProperty.call(wL, 'light'), wasL = wL.light, wasRL = net.applyingRemote, savedL = false;
        wL.light = newL;
        if (window.wpFog) window.wpFog.invalidateVision();   // a save as a remote change tells nobody: the vision is worked out afresh here, before the map goes out
        net.applyingRemote = true;
        try { save(true); savedL = true; }
        finally { net.applyingRemote = wasRL; if (!savedL) { if (hadL) wL.light = wasL; else delete wL.light; if (window.wpFog) window.wpFog.invalidateVision(); } }   // a save that failed: the light is as it was, on the host as on every player's copy
        net.broadcastItemFiltered(campL.id, mL.id);
        if (campL.activeItemId === mL.id) { render(); if (window.wpFog) window.wpFog.redraw(); }
        ansL({ ok: true });
        var tL = (prL.name || 'A player') + (newL.off ? ' put out the light of their token (' : newL.name ? ' lit ' + newL.name + ' on their token (' : ' lit the light of their token (') + (wL.charName || 'their token') + ')';
        toast(tL + '.'); logEvent('char', tL);
        // [netcheck:toklight-end]
    } else if (msg.type === 'my-look' && net.role === 'host') {
        // [netcheck:mylook-start]
        // Onboarding F1b: an admitted player changes their token face mid-session — cleaned, about one change a second (a burst of five), not
        // while they or the table are paused (their app sends it again once it may); the roster carries it to everyone and their waiting token redraws
        var prML = own(net.roster, conn.peer) ? net.roster[conn.peer] : null; if (!prML) return;
        if (net.paused || peerPaused(conn.peer)) return;
        if (typeof msg.face !== 'string') return;
        var fML = cleanFace(msg.face); if (msg.face && !fML) return;   // '' clears it; anything the rule refuses is dropped
        if ((prML.face || '') === fML) return;   // no change costs nothing
        if (!allow('mylook', { perMs: 1000, burst: 5, windowMs: 10000 }, conn.peer)) return;
        if (fML) prML.face = fML; else delete prML.face;
        var SML = SC(), campML = getActiveCampaign(); if (SML && campML && SML.waitingTokensOf) SML.waitingTokensOf(campML, prML.id).forEach(function(x) { if (fML) x.w.face = fML; else delete x.w.face; });   // the GM keeps seeing it while they are away
        broadcastRoster(); renderRoster(); render();
        // [netcheck:mylook-end]
    } else if (msg.type === 'newPlayers' && net.role === 'client') {
        // [netcheck:newplayers-start]
        // the table's rules for players without a character changed mid-session (Onboarding F1a): from the synced host only, for the hosted
        // campaign, cleaned here; fog follows (a waiting token's sight)
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream) return;
        if (typeof msg.campId !== 'string' || msg.campId !== state.appState.activeCampaignId) return;
        var campNP = campOf(msg.campId), SNP = SC(); if (!campNP || !SNP || !SNP.cleanNewPlayers) return;
        var cNP = SNP.cleanNewPlayers({ token: msg.token, sight: msg.sight, create: msg.create, fromFile: msg.fromFile });
        if (cNP) campNP.newPlayers = cNP; else delete campNP.newPlayers;
        if (window.wpFog) window.wpFog.invalidateVision();
        render();
        // [netcheck:newplayers-end]
    } else if ((msg.type === 'sounds' || msg.type === 'sound') && net.role === 'client') {
        // the hosted campaign's sound list and its cues: only from the synced host, only after the snapshot, validated in sound.js.
        // A host has no branch for these: a player never triggers a sound on anyone.
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || !window.wpSound) return;
        if (msg.type === 'sounds') { if (typeof msg.campId !== 'string' || msg.campId !== state.appState.activeCampaignId) return; window.wpSound.onList(msg); }
        else window.wpSound.onCue(msg);
    } else if ((msg.type === 'music' || msg.type === 'music-ctl') && net.role === 'client') {
        // the hosted campaign's music library and the GM's take-control override: only from the synced host, after the snapshot, validated in music.js.
        // A host has NO branch for these: a client never drives another player's music.
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || !window.wpMusic) return;
        if (msg.type === 'music') { if (typeof msg.campId !== 'string' || msg.campId !== state.appState.activeCampaignId) return; window.wpMusic.onList(msg); }
        else if (window.wpMusic.onControl) window.wpMusic.onControl(msg);
    } else if (msg.type === 'fx' && net.role === 'client') {
        // a visual effect from the synced host only, after the snapshot, never in the stream window; re-cleaned here.
        // A host has no branch: a player never triggers an effect on anyone.
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || !window.wpFxCore || !window.wpFx) return;
        var cfx = window.wpFxCore.cleanFx(msg); if (cfx) window.wpFx.receive(cfx);
    } else if (msg.type === 'video' && net.role === 'client') {
        // [netcheck:videomsg-start]
        // item 21 V2: the GM's word about a video (an offer, a candidate, a stop) — from the synced host only, after the snapshot, never in the
        // stream window; videoMsg cleans what it carries. An offer from our own GM that comes before the snapshot is remembered and asked for
        // once the snapshot is in (a stop that follows it forgets it). A host has no branch for it.
        if (net.stream) return;
        if (!net.foreign || conn.peer !== net.syncedPeer) { if (conn === net.conns[0]) { if (msg.act === 'offer') _vidIn.offered = true; else if (msg.act === 'stop') _vidIn.offered = false; } return; }
        videoMsg(msg);
        // [netcheck:videomsg-end]
    } else if (msg.type === 'video-up' && net.role === 'host') {
        // [netcheck:videoup-start]
        // item 21 V2: a player's word about a video being shown (ask, bye, answer, ice): admitted (the gate above); videoUp takes it only while
        // a showing is live with them in its audience, and reads nothing else from it
        videoUp(msg, conn);
        // [netcheck:videoup-end]
    } else if (msg.type === 'blast' && net.role === 'client') {
        // a thrown blast's shared template from the synced host, for the player's current map (item library, 1.5.0)
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || !window.wpRenderSharedBlast || !msg.blast) return;
        var amB = getActiveMap(); if (amB && msg.mapId === amB.id) window.wpRenderSharedBlast(msg.blast);
    } else if (msg.type === 'blastClear' && net.role === 'client') {
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || !window.wpClearSharedBlasts) return;
        window.wpClearSharedBlasts();
    } else if (msg.type === 'roll-req' && net.role === 'host') {
        // [netcheck:rollreq-start]
        // a player's roll: validated, rate-limited, rolled HERE with the host's dice, sent as a record (from = the roster entry, never the client's claim)
        var Dq = DC(), Fq = window.wpFormula; if (!Dq || !Fq) return;
        var q = Dq.cleanRollReq(msg); if (!q) { var ridBad = Dq.cleanRid(msg); if (ridBad) { try { conn.send({ type: 'roll-deny', rid: ridBad, reason: 'error', message: 'That roll could not be read.' }); } catch (e) { sendFailed(e); } } return; }
        var denyQ = function(reason, r) { var d = { type: 'roll-deny', rid: q.rid, reason: reason }; if (r) { d.message = r.error.message; d.pos = r.error.pos; d.len = r.error.len; } try { conn.send(d); } catch (e) { sendFailed(e); } };
        if (!diceLimit) diceLimit = Dq.RateLimit(Dq.LIMITS);
        var lim = diceLimit.allow(conn.peer, Date.now());
        if (lim !== true) { var sk = conn.peer + '|' + lim; if (!_diceSlowSaid[sk] || Date.now() - _diceSlowSaid[sk] > Dq.LIMITS.windowMs) { _diceSlowSaid[sk] = Date.now(); denyQ(lim); } return; }   // one 'slow' per window, then silence
        if (window.wpVtt && !window.wpVtt.on('dice')) { denyQ('off'); return; }
        if (net.paused || peerPaused(conn.peer)) { denyQ('paused'); return; }   // frozen table (or this player is paused): no rolls
        var chQ = null, varsQ = null, SQ = SC(), actQ = null, tcQ = null;
        if (q.charId) {   // the player's own character, resolved through the view they hold: a GM-only name is unknown there, a nulled formula an error, as on their sheet
            var campQ = getActiveCampaign(), pidQ = peerProfileId(conn), srcQ = (campQ && campQ.chars && typeof q.charId === 'string' && Object.prototype.hasOwnProperty.call(campQ.chars, q.charId) ? campQ.chars[q.charId] : null);
            if (!srcQ || srcQ.npc || !srcQ.ownerId || !pidQ || srcQ.ownerId !== pidQ || srcQ.making === 1 || !SQ || !campQ.system) { denyQ('char'); return; }   // making (Onboarding F3): not at the table yet
            var viewQ = window.wpSheets ? window.wpSheets.playerSystem(campQ) : null, chvQ = viewQ ? SQ.charFor(srcQ, viewQ, pidQ, { lib: fxLib(campQ.system), items: itemLib(campQ.system), full: campQ.system }) : null;
            if (!viewQ || !chvQ) { denyQ('char'); return; }
            var locQ = net.roster[conn.peer] && net.roster[conn.peer].location, mapQ = (typeof locQ === 'string' && campQ.items && own(campQ.items, locQ)) ? campQ.items[locQ] : null;   // 5h Fold 3: the facing names read the player's token on the map they are on
            var vtQ = window.wpVtt, ruleQ = function(k) { return !vtQ || (vtQ.rulesOn ? vtQ.rulesOn(k) : vtQ.on(k)); };
            tcQ = SQ.tokenCtx(mapQ, SQ.charTokenOn(mapQ, q.charId, pidQ, { strict: true }), { turning: ruleQ('turning'), posture: ruleQ('posture'), elevation: ruleQ('elevation') });   // facing and stance from the player's own token, on the table's settings (as their sheet reads them)
            tcQ = SQ.withRound(tcQ, mapQ && own(net.combats, locQ) ? net.combats[locQ] : null);
            if (typeof rangeTo === 'function' && SQ.withRange) tcQ = SQ.withRange(tcQ, rangeTo(campQ, mapQ, locQ, SQ.charTokenOn(mapQ, q.charId, pidQ, { strict: true }), pidQ));   // range R2: RangeMod and TargetDistance, to their own target as their copy holds it   // HUD frame (HF5b): CombatRound reads the combat on the map they are on (the token context stays null without a token)
            chQ = srcQ; varsQ = SQ.makeResolver(viewQ, chvQ, Fq, tcQ);
            if (q.row) {   // Stage 6 F5b: a roll on one of their rows — its names through their own view; a row of a GM-only item keeps the roll between them and the GM
                var rvQ = varsQ.row(q.row.f, q.row.r); if (!rvQ) { denyQ('char'); return; }
                varsQ = rvQ; if (SQ.rowRollNames(campQ.system, srcQ, q.row.f, q.row.r, [], Fq).gm) q.priv = 'gm';
            }
            if (q.act || (q.row && typeof q.row.i === 'number')) {   // Stage 6 HUD R1/R2b: a roll with consequences or needs — the entry as their view has it (a system roll, a list's roll), its formula rebuilt from it (no faked hit), its needs met
                if (q.act) (Array.isArray(viewQ.rolls) ? viewQ.rolls : []).forEach(function(r) { if (r && r.id === q.act && typeof r.formula === 'string' && !r.apply) actQ = r; });
                else (Array.isArray(viewQ.fields) ? viewQ.fields : []).forEach(function(f) { if (f && f.id === q.row.f && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls)) { var lrQ = f.list.rolls[q.row.i]; if (lrQ && typeof lrQ.formula === 'string' && !lrQ.apply) actQ = lrQ; } });
                var wantQ = actQ ? actQ.formula : null;
                if (wantQ && q.adv) { var awQ = Dq.withAdvantage(wantQ, q.adv, Fq.parse); wantQ = awQ.ok ? awQ.expr : null; }
                var cmQ = wantQ ? Dq.composeModifier(wantQ, q.mod || 0, Fq.parse) : null;
                if (!cmQ || !cmQ.ok || cmQ.expr !== q.expr) { denyQ('error', { error: { message: 'That roll does not match its button now.', pos: 0, len: 0 } }); return; }
                if (actQ.needs) { var ndQ = Fq.evaluate(actQ.needs, { vars: varsQ }); if (!(ndQ.ok && (ndQ.value === true || (typeof ndQ.value === 'number' && ndQ.value !== 0)))) { denyQ('error', { error: { message: actQ.needsText || ('Not now: it needs ' + actQ.needs), pos: 0, len: 0 } }); return; } }   // R2b: what it needs, through their view (the row's names)
            }
        }
        if (Fq.names(q.expr).length && !varsQ) { denyQ('names'); return; }
        var resQ = Fq.evaluate(q.expr, varsQ ? { vars: varsQ } : {});
        if (!resQ.ok) { denyQ('error', resQ); return; }
        var whyQ = Dq.checkTableRoll(resQ); if (whyQ) { denyQ(whyQ); return; }
        if (actQ && actQ.cost && chQ && typeof actSpend === 'function') { var costQ = actSpend(campQ, q.charId, net.roster[conn.peer], actQ.cost, conn, chQ.name); if (costQ) { denyQ('error', { error: { message: costQ, pos: 0, len: 0 } }); return; } }   // turn-based combat T4: what it costs
        var recQ = { type: 'roll', id: Dq.uid(), from: diceFrom(net.roster[conn.peer], false), expr: q.expr, draws: resQ.draws, v: Fq.VERSION, ts: Date.now(), rid: q.rid };
        var mfQ = null; if (actQ && actQ.malf && varsQ) { var mqQ = Fq.evaluate(actQ.malf, { vars: varsQ }); if (mqQ.ok && typeof mqQ.value === 'number' && isFinite(mqQ.value)) mfQ = Math.max(1, Math.min(1000000, Math.round(mqQ.value))); }   // Stage 6 HUD R3: its Malf, through their view
        if (mfQ !== null) recQ.malf = mfQ;
        if (actQ && actQ.dmg === true) recQ.dmg = 1;   // chat cards: a damage roll, from the entry its formula matched (never the player's word)
        if (resQ.breakdown && resQ.breakdown.names && resQ.breakdown.names.length) { var nmQ = Dq.cleanNames(resQ.breakdown.names); if (!nmQ) { denyQ('error'); return; } if (nmQ.length) recQ.names = nmQ; }
        if (q.label) recQ.label = q.label;
        if (chQ) recQ.as = String(chQ.name || '').slice(0, Dq.LIMITS.label);
        if (!q.priv && tcQ && tcQ.range && typeof rangeUnseen === 'function' && typeof rangeReadBy === 'function' && rangeUnseen(campQ, tcQ.range, pidQ) && rangeReadBy(SQ, viewQ, chvQ, Fq, tcQ, q.expr, q.row)) {   // range R3: its card would tell another player how far a target they cannot see is
            q.priv = 'gm'; if (typeof turnNote === 'function') turnNote(conn, 'Rolled privately: a player on that map cannot see your target.', q.charId);
        }
        if (q.priv) { recQ.priv = 'gm'; try { conn.send(recQ); } catch (e) { sendFailed(e); } pushRoll(recQ, resQ, 'whisper', { cid: chQ ? q.charId : '' }); }
        else { sendTable(recQ, null); pushRoll(recQ, resQ, 'global', { cid: chQ ? q.charId : '' }); }
        var ruleQ = campQ && campQ.system && campQ.system.combat && campQ.system.combat.checks === 'under3d6' ? 'under3d6' : '';   // Stage 6 F8: the system's roll outcomes
        logEvent('dice', Dq.cardText(recQ, resQ, Fq, { maxChars: Dq.LIMITS.logChars, rule: ruleQ }));
        if (actQ && actQ.init === true && typeof initIntoFight === 'function') initIntoFight(campQ, locQ, q.charId, pidQ, resQ.value);   // initiative O1: their own initiative roll into the fight on their map, once
        if (actQ && actQ.then) {   // Stage 6 HUD R1: its consequences on the host's copy, through the roller's view, all or nothing (nothing to apply is quiet)
            var mfHitQ = mfQ !== null && Dq.naturalOf(resQ) >= mfQ, vdQ = Dq.verdictOf(resQ, ruleQ), thQ = SQ.thenChanges(actQ, mfHitQ ? false : (vdQ && vdQ.kind === 'check' ? vdQ.pass : null), mfHitQ);   // R3: a malfunction is a failure, with its own changes
            var taQ = thQ.length ? SQ.applyAct(campQ.system, chQ, { apply: thQ }, varsQ, Fq, tcQ, q.row ? { f: q.row.f, r: q.row.r } : null) : null;   // R2b: a list roll may move its row's counters
            if (taQ && taQ.ok) { chQ.values = chQ.values || {}; Object.keys(taQ.values).forEach(function(k) { chQ.values[k] = taQ.values[k]; }); chQ.updated = Date.now(); saveRemoteSoon(); net.syncCharDelta(q.charId, taQ.values); if (window.wpSheets) window.wpSheets.charChanged(q.charId); }
        }
        // [netcheck:rollreq-end]
    } else if (msg.type === 'apply' && net.role === 'client') {
        // [netcheck:applyin-start]
        // Stage 6 HUD H7: an apply action's card, from the synced host only — text and numbers, cleaned like a roll's record
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream) return;
        var Dp = DC(); if (!Dp || !Dp.cleanApply) return;
        var ap = Dp.cleanApply(msg); if (!ap) return;
        pushChat({ from: ap.from, text: '', scope: ap.priv ? 'whisper' : 'global', ts: ap.ts, apply: ap });
        if (ap.as && typeof bellOut === 'function') bellOut('', { apply: ap }, ap.as);   // their character's bell, found by the name the card carries
        // [netcheck:applyin-end]
    } else if (msg.type === 'acts-left' && net.role === 'client') {
        // [netcheck:actsin-start]
        // Turn-based combat T4: what their character has left of each action this turn — from the synced host only, whole numbers 0 to 9 under
        // action keys (six at most); null clears it (the combat ended). Their sheet and HUD grey what is spent
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || typeof msg.charId !== 'string' || !/^c_[A-Za-z0-9_]{1,24}$/.test(msg.charId)) return;
        net.actsLeft = net.actsLeft || Object.create(null);
        if (msg.left === null) delete net.actsLeft[msg.charId];
        else if (msg.left && typeof msg.left === 'object' && !Array.isArray(msg.left)) {
            var alv = Object.create(null), aln = 0; Object.keys(msg.left).forEach(function(k) { var v = msg.left[k]; if (aln < 6 && /^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(k) && typeof v === 'number' && Math.floor(v) === v && v >= 0 && v <= 9) { alv[k] = v; aln++; } });
            net.actsLeft[msg.charId] = { left: alv, mode: msg.mode === 'warn' ? 'warn' : 'refuse' };
        } else return;
        if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(msg.charId);
        // [netcheck:actsin-end]
    } else if (msg.type === 'turn-note' && net.role === 'client') {
        // [netcheck:turnnote-start]
        // Turn-based combat T3a: why the host stopped or noted a move of theirs — from the synced host only, a plain line as a toast
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || typeof msg.text !== 'string') return;
        var tnx = msg.text.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ').slice(0, 200).trim(); if (tnx) toast(tnx);
        if (tnx && typeof msg.charId === 'string' && /^c_[A-Za-z0-9_]{1,24}$/.test(msg.charId) && typeof bellOut === 'function') bellOut(msg.charId, { title: 'Turn', text: tnx });   // the bell: their character's (sheets.js takes their own only)
        // [netcheck:turnnote-end]
    } else if (msg.type === 'due' && net.role === 'client') {
        // [netcheck:duein-start]
        // Turn-based combat T2b: a reminder for a timed action of the player's own character, from the synced host only — cleaned (ids and text);
        // its Run presses the action as the sheet's button does (the host judges it), so nothing here is trusted beyond drawing the card
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream) return;
        var Dd = DC(); if (!Dd || !Dd.cleanDue) return;
        var du = Dd.cleanDue(msg); if (!du || du.theirs) return;
        pushChat({ from: du.from, text: '', scope: 'whisper', ts: du.ts, due: du });
        if (typeof bellOut === 'function') bellOut(du.charId, { due: du });
        // [netcheck:duein-end]
    } else if ((msg.type === 'roll' || msg.type === 'roll-deny') && net.role === 'client') {
        // a record or a refusal from the synced host only, after the snapshot; a host never takes a 'roll' from a client (no host branch)
        if (!net.foreign || conn.peer !== net.syncedPeer || net.stream) return;
        var Dr = DC(), Fr = window.wpFormula; if (!Dr || !Fr) return;
        if (msg.type === 'roll-deny') {
            if (!_dicePending) return;
            var dn = Dr.cleanDeny(msg, _dicePending.expr.length); if (!dn || dn.rid !== _dicePending.rid) return;
            var pend = _dicePending; clearTimeout(pend.timer); _dicePending = null;
            if (window.wpDice) window.wpDice.onDeny(dn, pend.expr);
            return;
        }
        var rc = Dr.cleanRoll(msg); if (!rc) return;
        var cidP = (_dicePending && rc.rid === _dicePending.rid) ? _dicePending.charId : '';   // HF3: our own roll, made as the character we asked it for (a local tag, never sent)
        if (_dicePending && rc.rid === _dicePending.rid) { clearTimeout(_dicePending.timer); _dicePending = null; if (window.wpDice) window.wpDice.onRolled(rc); }
        var rp = Dr.replay(rc, Fr, Fr.VERSION);
        pushRoll(rc, rp.ok ? rp.result : null, rc.priv || rc.to ? 'whisper' : 'global', { bad: rp.ok ? null : rp.reason, cid: cidP });
    } else if (msg.type === 'asset-req' && net.role === 'host') {
        handleAssetRequest(msg, conn);
    } else if (msg.type === 'asset-part' && net.role === 'client') {
        handleAssetPart(msg);
    } else if (msg.type === 'asset' && net.role === 'client') {
        handleAssetArrival(msg);
    } else if (msg.type === 'chat') {
        // [netcheck:chat-start]
        if (net.role === 'host') {
            // player comments are table-wide: relayed to everyone else, typed, capped, on the host's clock — and FROM whom
            // the roster says, never whom the message claims (a client cannot speak as the GM or as another player)
            if (typeof msg.text !== 'string') return;
            if (!allow('chat', { perMs: 150, burst: 20, windowMs: 10000, table: 2000 }, conn.peer)) return;
            var pc = net.roster[conn.peer];
            msg = { type: 'chat', scope: 'global', from: { id: pc.id, name: pc.name || 'Player' }, text: msg.text.slice(0, 2000), ts: Date.now() };
            if (pc.color) msg.from.color = pc.color;
            pushChat(msg);
            broadcast(msg, conn);
            logEvent('chat', (msg.from.name || 'Player') + ': ' + String(msg.text || '').slice(0, 300));
        } else {
            // from the synced host only, in the shape a chat line has, text capped (a hostile host's megabytes never reach the DOM or the pop-out relay)
            if (conn.peer !== net.syncedPeer || typeof msg.text !== 'string' || !msg.from || typeof msg.from !== 'object') return;
            var fromH = { id: String(msg.from.id || '').slice(0, 60), name: String(msg.from.name || '').slice(0, 60), gm: msg.from.gm === true };
            if (safeColor(msg.from.color)) fromH.color = msg.from.color;
            pushChat({ type: 'chat', scope: msg.scope === 'whisper' ? 'whisper' : 'global', from: fromH, text: msg.text.slice(0, 2000), ts: Number(msg.ts) || Date.now(), toName: typeof msg.toName === 'string' ? msg.toName.slice(0, 60) : '' });
        }
        // [netcheck:chat-end]
    } else if (msg.type === 'chat-history' && net.role === 'client') {
        var histD = window.wpDiceCore, histF = window.wpFormula;
        var hist = Array.isArray(msg.log) ? msg.log.filter(function(m) { return m && m.from && (typeof m.text === 'string' || m.roll); }).slice(-60) : [];
        var have = {}; chatLog.forEach(function(m) { have[m.roll ? 'r|' + m.roll.id : m.apply ? 'a|' + m.apply.id : (m.ts || 0) + '|' + (m.from && m.from.id) + '|' + m.text] = true; });
        var added = 0, addedR = 0;
        hist.forEach(function(m) {
            if (m.roll) {   // a roll entry: the record is validated and replayed exactly like a live one
                if (!histD || !histF) return;
                var hr = histD.cleanRoll(m.roll); if (!hr || hr.priv || hr.to || have['r|' + hr.id]) return;
                have['r|' + hr.id] = true;
                var hp = histD.replay(hr, histF, histF.VERSION);
                var hm = { from: hr.from, text: '', scope: 'global', ts: hr.ts, roll: hr, res: hp.ok ? hp.result : null, rollBad: hp.ok ? null : hp.reason };
                chatLog.push(hm); ringPush(hm, '', true); added++; addedR++;   // HF3: into the HUDs' history too, in time order, never NEW
                return;
            }
            if (m.apply) {   // Stage 6 HUD H7: an apply card, cleaned exactly like a live one (a private one never rides in the history)
                if (!histD || !histD.cleanApply) return;
                var ha = histD.cleanApply(m.apply); if (!ha || ha.priv || have['a|' + ha.id]) return;
                have['a|' + ha.id] = true; chatLog.push({ from: ha.from, text: '', scope: 'global', ts: ha.ts, apply: ha }); added++;
                return;
            }
            var k = (m.ts || 0) + '|' + m.from.id + '|' + m.text;
            if (!have[k]) { have[k] = true; chatLog.push({ from: { id: String(m.from.id || ''), name: String(m.from.name || '').slice(0, 60), gm: !!m.from.gm }, text: String(m.text).slice(0, 2000), scope: 'global', ts: m.ts || Date.now() }); added++; }
        });
        chatLog.sort(function(a, b) { return (a.ts || 0) - (b.ts || 0); });
        while (chatLog.length > 200) chatLog.shift();
        if (addedR) ringRepaint();
        if (added) { renderChat(); var cp = ui('chatPanel'); if (!cp || cp.style.display === 'none') { chatUnread += added; var cb = ui('chatBadge'); if (cb) { cb.textContent = chatUnread; cb.style.display = 'block'; } } }
    } else if (msg.type === 'roster' && net.role === 'client') {   // the host owns the roster; a player's copy never replaces it
        if (conn.peer !== net.syncedPeer) return;   // only the table this player is synced to
        net.roster = cleanHostRoster(msg.roster);   // rebuilt field by field (renderRoster, the party strip, hover cards and owner names draw it)
        net.away = cleanHostAway(msg.away);
        renderRoster();
        refreshChatRecipients();
        if (net.reconcileLook) net.reconcileLook();   // Onboarding F1b: a face the table has not taken yet is sent again
        if (net.role === 'client' && state.viewMode === 'visual') render();  // presence changed → token visibility may change
    }
}

/* ---------- auto-reconnect (client) ----------
   An unexpected drop keeps the room code and retries quietly; only after the
   retries run out (or the GM ends the session) is the local campaign restored. */
var reconn = { tries: 0, timer: null, code: null, name: null, pending: false };

function cancelReconnect() {
    reconn.pending = false; reconn.tries = 0;
    if (reconn.timer) { clearTimeout(reconn.timer); reconn.timer = null; }
}

function giveUpAndRestore(msg) {
    cancelReconnect();
    stopHeartbeat();
    setIndicator(null);
    setPausedLocal(false);
    net.active = false; net.role = null;
    net.music = null; net.sounds = null; net.soundNow = null;   // the table is gone: drop its media so nothing plays on forever / stays wedged
    if (window.wpMusic && window.wpMusic.tableLeft) window.wpMusic.tableLeft(true);
    if (window.wpSound && window.wpSound.tableLeft) window.wpSound.tableLeft(true);
    net.roster = Object.create(null); net.away = Object.create(null);   // the old table's players never carry into this machine's own campaign
    ringReset();   // HF3: nor its rolls into this machine's own HUDs
    renderRoster();
    setStatus(msg);
    toast(msg + ' Restoring your own campaign.');
    load();
}

// Players keep trying for about two minutes — long enough for a GM whose app
// crashed to relaunch and press Host again (which reuses the same code).
var RECONNECT_TRIES = 30;
function scheduleReconnect() {
    if (reconn.tries >= RECONNECT_TRIES) { giveUpAndRestore('Could not reconnect — the GM may have ended the session.'); return; }
    reconn.pending = true;
    reconn.tries++;
    setIndicator('warn', 'reconnecting to the GM (attempt ' + reconn.tries + ' of ' + RECONNECT_TRIES + ')');
    setStatus('Connection lost — reconnecting (attempt ' + reconn.tries + ' of ' + RECONNECT_TRIES + ')… If the GM restarts Waypoint and hosts again, you will reattach automatically.');
    if (reconn.tries === 1) toast('Connection lost — reconnecting… (keeps trying for a few minutes)');
    reconn.timer = setTimeout(function() { joinSession(reconn.code, reconn.name, true); }, reconn.tries === 1 ? 1200 : 2500);
}

function wireConn(conn) {
    conn.on('data', function(d) { try { handleMessage(d, conn); } catch (e) { try { console.warn('wire message failed', d && d.type, e); } catch (_) {} } finally { net.applyingRemote = false; } });   // a malformed message throws here and nowhere else; applyingRemote is never left on (it would silently stop this machine's own saves syncing)
    // The transport knows first: when the other side vanishes (app closed, cable pulled, Wi-Fi
    // gone) ICE goes 'disconnected' within seconds and 'failed' soon after, long before the
    // channel's own close event. Show it at once; treat 'failed' as the drop it is.
    conn.on('iceStateChanged', function(st) {
        if (!net.active || !conn.open) return;
        if (st === 'disconnected') {
            if (net.role === 'client') { setIndicator('warn', 'link to the GM interrupted'); setStatus('Link to the GM interrupted — waiting for it to recover…'); }
            else { var pd = net.roster[conn.peer]; if (pd && !pd.stale) { pd.stale = true; renderRoster(); } }
        } else if (st === 'failed' || st === 'closed') {
            if (net.role === 'client') { setIndicator('bad', 'lost the GM — reconnecting'); }
            try { conn.close(); } catch (e) {}   // the close handler drops them (host) or starts the reconnect loop (client)
        } else if (st === 'connected' || st === 'completed') {
            if (net.role === 'client') setIndicator('ok', 'connected to the GM');
            else { var pc = net.roster[conn.peer]; if (pc && pc.stale) { delete pc.stale; renderRoster(); } }
        }
    });
    conn.on('close', function() {
        net.conns = net.conns.filter(function(c) { return c !== conn; });
        delete assetInflight[conn.peer];
        if (diceLimit) diceLimit.forget(conn.peer);
        if (charLimit) charLimit.forget(conn.peer);
        Object.keys(_lim).forEach(function(k) { _lim[k].forget(conn.peer); });
        var cmC = _connMeta[conn.peer]; if (cmC && cmC.authTimer) clearTimeout(cmC.authTimer);
        delete _connMeta[conn.peer]; delete _shareBytes[conn.peer]; delete lastSeen[conn.peer];
        var p = net.roster[conn.peer];
        delete net.roster[conn.peer];
        if (p && p.id && !net.conns.some(function(c) { return c.open && net.roster[c.peer] && net.roster[c.peer].id === p.id; })) sensesForget(p.id);   // Senses S0: their last connection: what their copies were made by is forgotten, and no send waits for them
        if (net.role === 'host' && typeof fogDragSweep === 'function') fogDragSweep();   // fold M4: a drag this connection left open goes back where it began
        if (typeof fogForgetConn === 'function') fogForgetConn(conn.peer);   // fold M5: and what its copies held
        if (net.role === 'host' && typeof videoHang === 'function') { videoHang(conn.peer); videoTold(); }   // item 21 V2: and the call that showed it a video
        renderRoster();
        if (net.role === 'host') {
            if (p) toast((p.name || 'A player') + ' left' + (p.location ? ' — their character stays on ' + (((getActiveCampaign() || {}).items || {})[p.location] || { meta: {} }).meta.title + '.' : '.'));
            if (p) logEvent('player', (p.name || 'A player') + ' left' + (p.location ? ' (on ' + ((((getActiveCampaign() || {}).items || {})[p.location] || { meta: {} }).meta.title || p.location) + ')' : ''));
            if (p) startWaitGrace(p.id);   // Onboarding F1a: their waiting token goes if they are not back in three minutes
            if (p && net.targets[p.id]) { delete net.targets[p.id]; render(); broadcastTargets(); }   // fold M0: each player the pointers they may see (a fogged table), never all of them
            net.applyingRemote = true; save(true); net.applyingRemote = false;   // lastMap persists
            broadcastRoster();
            render();
        } else if (net.leaving) {
            // deliberate teardown: 'end' from the GM (still active) or our own Leave (already torn down)
            var stillActive = net.active;
            net.leaving = false;
            cancelReconnect();
            if (stillActive) {
                if (net.peer) { try { net.peer.destroy(); } catch (e) {} net.peer = null; }
                setPausedLocal(false);
                net.active = false; net.role = null; net.code = null;
                net.music = null; net.sounds = null; net.soundNow = null;   // drop the table's media memory (mirrors leaveSession)
                if (window.wpMusic && window.wpMusic.tableLeft) window.wpMusic.tableLeft(true);   // else a take-control track plays forever and per-map auto-play stays wedged (controlled=true)
                if (window.wpSound && window.wpSound.tableLeft) window.wpSound.tableLeft(true);
                videoOver(); if (window.wpVideo && window.wpVideo.tableLeft) window.wpVideo.tableLeft();   // item 21 V2: and a video the GM was showing
                stopHeartbeat(); setIndicator(null);
                net.roster = Object.create(null); net.away = Object.create(null);   // the old table's players never carry into this machine's own campaign
                renderRoster();
                load();   // the 'end' handler already told the player what happened
            }
        } else if (net.active && net.code) {
            // unexpected drop: keep the session context and retry
            reconn.code = net.code;
            reconn.name = getProfile().name;
            scheduleReconnect();
        }
        // stale close events after a completed teardown are ignored
    });
}

/* ---------- host / join / leave ---------- */
function makeCode() {
    var chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    var c = '';
    for (var i = 0; i < 6; i++) c += chars[Math.floor(Math.random() * chars.length)];
    return c;
}

// Direct peer-to-peer is always tried first (STUN). The TURN entries are a
// relay FALLBACK for strict-NAT networks where no direct path exists — the
// relay carries only DTLS-encrypted WebRTC traffic and can't read any of it.
// Open Relay (metered.ca) is a long-running free public TURN service; dead or
// unreachable entries are simply skipped by ICE.
/* ICE servers. STUN finds each side's public address; a direct path then works for most
   home networks. Players behind carrier-grade NAT (many mobile and some fibre providers,
   common outside the US/EU) can only connect through a relay (TURN). The free public relay
   Waypoint once used has shut down, so the GM configures their own in Settings ▸ Relay server
   (stored under turn_* keys, which stay on this machine — never mirrored to the saves folder).
   One side with a relay is enough: the host's relayed address is reachable from anywhere. */
var STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
];
function turnConfig() {
    var urls = [], user = '', pass = '';
    try {
        urls = String(localStorage.getItem('turn_urls') || '').split(/[\s,]+/).filter(function(u) { return /^turns?:/i.test(u); });
        user = localStorage.getItem('turn_user') || ''; pass = localStorage.getItem('turn_pass') || '';
    } catch (e) {}
    if (!urls.length) return null;
    return { urls: urls, username: user, credential: pass };
}
net.turnConfig = turnConfig;
function iceServers() {
    var t = turnConfig();
    return t ? STUN_SERVERS.concat([t]) : STUN_SERVERS.slice();
}
// Settings ▸ Firewall-friendly connections (wp_relayOnly): force every path through the relay.
// A direct connection attempt probes many ports in a burst, which some firewalls (Avira, Norton,
// some routers) flag as a port scan and block for minutes — dropping the player mid-join.
// With relay-only ICE the only traffic the firewall sees is one relay endpoint.
function relayOnly() { try { return localStorage.getItem('wp_relayOnly') === '1'; } catch (e) { return false; } }
function peerOpts() {
    var cfg = { iceServers: iceServers() };
    if (relayOnly() && turnConfig()) cfg.iceTransportPolicy = 'relay';   // relay-only means nothing without a relay
    return { config: cfg };
}
/* Try the configured relay: gather with relay-only ICE and see whether a relay candidate
   arrives. Resolves { ok, detail }. Used by the Test button in Settings. */
net.testRelay = function() {
    var t = turnConfig();
    if (!t) return Promise.resolve({ ok: false, detail: 'No relay configured.' });
    return new Promise(function(resolve) {
        var pc, done = false, errs = [];
        var finish = function(ok, detail) { if (done) return; done = true; try { pc.close(); } catch (e) {} resolve({ ok: ok, detail: detail }); };
        try { pc = new RTCPeerConnection({ iceServers: [t], iceTransportPolicy: 'relay' }); }
        catch (e) { return resolve({ ok: false, detail: 'Bad relay settings: ' + (e.message || e) }); }
        pc.createDataChannel('probe');
        pc.onicecandidate = function(e) { if (e.candidate && e.candidate.type === 'relay') finish(true, 'Relay answered (' + e.candidate.protocol + ' ' + e.candidate.address + ').'); };
        pc.onicecandidateerror = function(e) { errs.push((e.errorCode || '') + ' ' + (e.errorText || '')); };
        pc.onicegatheringstatechange = function() { if (pc.iceGatheringState === 'complete') finish(false, errs.length ? 'Relay refused: ' + errs[errs.length - 1].trim() : 'No answer from the relay.'); };
        pc.createOffer().then(function(o) { return pc.setLocalDescription(o); }).catch(function(e) { finish(false, String(e.message || e)); });
        setTimeout(function() { finish(false, errs.length ? 'Relay refused: ' + errs[errs.length - 1].trim() : 'No answer from the relay (10 s). Check the address, port and credentials.'); }, 10000);
    });
};

/* Crash recovery: the last room code is remembered for a while, so a GM whose
   app died mid-session can relaunch, press Host again, and get the SAME code —
   players still in their reconnect loop reattach on their own, and everyone
   else can rejoin with the code they already have. */
var REHOST_WINDOW_MS = 15 * 60 * 1000;
function rememberHostCode(code) {
    try { localStorage.setItem('wp_lastHost', JSON.stringify({ code: code, ts: Date.now() })); } catch (e) {}
}
function forgetHostCode() { try { localStorage.removeItem('wp_lastHost'); } catch (e) {} }
function recentHostCode() {
    try {
        var j = JSON.parse(localStorage.getItem('wp_lastHost') || 'null');
        if (j && j.code && Date.now() - (j.ts || 0) < REHOST_WINDOW_MS) return j.code;
    } catch (e) {}
    return null;
}
net.recentHostCode = recentHostCode;   // sandbox testing hook

/* A room's id on the signaling server is waypoint-<code>, or waypoint-<code>-r<n> after a crash:
   the dead session's registration can linger for minutes, so a resuming GM takes the next
   generation of the SAME code at once, and players try each generation in turn. */
var ROOM_GENS = 4;
function roomPeerId(code, gen) { return 'waypoint-' + String(code).toLowerCase() + (gen ? '-r' + gen : ''); }
net._hostGen = 0;
function startHosting(forceFresh) {
    _lastSent = {};   // a new table starts from the snapshot, not from anything sent before
    sensesReset();   // Senses S0: and from no copy made for anyone
    _dragFrom = Object.create(null); _refusedAt = Object.create(null);   // fold M4: and from no drag of the last table
    fogForgetAll();   // fold M5: and from no record of what anyone's copy held
    if (window.wpFog && typeof window.wpFog.marksForget === 'function') window.wpFog.marksForget(null);   // senses S4b: and no marks held for anyone
    net._lastSnapSent = typeof window.wpSnapOn === 'function' && window.wpSnapOn() === true;   // the snap rule: the join snapshot carries Snap as it stands
    diceSessionReset(true);   // and from an empty chat: the last table's lines never reach the next one
    if (typeof Peer === 'undefined') { toast('Multiplayer needs an internet connection.'); return; }
    if (forceFresh) net._hostGen = 0;
    cancelReconnect();   // a pending retry would otherwise tear the new host down and rejoin the old table
    if (net.foreign) {
        // the campaign on screen is a GM's: hand it back before anything can be hosted from it
        leaveSession(true);
        setStatus('Restoring your own campaign…');
        toast('That was the GM\'s campaign — restoring your own. Press Host again in a moment.');
        load();
        return;
    }
    leaveSession(true);
    defaultStageMode(getActiveCampaign());   // hosting without opening the panel first still starts on the default
    var resumed = !forceFresh ? recentHostCode() : null;
    var code = resumed || makeCode();
    var gen = resumed ? net._hostGen : 0;
    var peer = new Peer(roomPeerId(code, gen), peerOpts());
    net.peer = peer; net.role = 'host'; net.code = code;
    net._lastStanceSig = null;   // the first save after hosting starts sends the ceiling
    net._lastSoundSig = null;    // and the sound list
    net._lastMusicSig = null;    // and the music library
    net._lastSystemSig = null;   // and the system
    net._lastSensesSig = null;   // and its senses (senses S2a)
    net._lastDocStyleSig = null; // and the campaign's document look
    net._lastNewPlayersSig = null; // and the rules for players without a character (Onboarding F1a)
    net._lastClockSig = null;    // and the campaign's clock (item 20 K2)
    setStatus((resumed ? 'Resuming host with your last room code...' : 'Starting host...') + (relayOnly() ? ' (relay-only connections)' : ''));
    peer.on('open', function() {
        net.active = true;
        net._hostGen = gen;   // a later crash resumes under the generation after this one
        startHeartbeat();
        rememberHostCode(code);
        setStatus('Hosting — room code: ' + code.toUpperCase());
        var codeEl = ui('netCode');
        if (codeEl) codeEl.textContent = code.toUpperCase();
        ui('netHostInfo').style.display = 'block';
        syncSessionButtons();
        renderRoster();
        toast(resumed ? 'Hosting resumed with the same room code — players can rejoin as before.' : 'Hosting started. Share the room code.');
        logEvent('session', (resumed ? 'Session resumed' : 'Session started') + ' — room ' + String(code).toUpperCase());
        var campH = getActiveCampaign(), Sh = SC(); if (campH && campH.system && Sh && Sh.stampRows) Sh.stampRows(campH.system, campH.chars || {});   // Stage 6: a legacy row of a GM-only item gets its own id before anything is sent
        net.applyingRemote = true; save(true); net.applyingRemote = false;
    });
    peer.on('connection', function(conn) {
        net.conns.push(conn);
        _connMeta[conn.peer] = { openedAt: Date.now(), hellos: 0 };
        wireConn(conn);
    });
    peer.on('call', function(call) { try { call.close(); } catch (e) {} });   // item 21 V2: no media call is used (a video's link is agreed over the table's own connection): any that comes is closed
    // Signaling-server blips don't touch open data channels; quietly re-register
    // so NEW players can still join after the blip.
    peer.on('disconnected', function() { if (net.active) { try { peer.reconnect(); } catch (e) {} } });
    peer.on('error', function(err) {
        if (err.type === 'unavailable-id') {
            try { peer.destroy(); } catch (e) {}
            if (resumed && gen + 1 < ROOM_GENS) {
                // The crashed session still holds this generation: take the next one, same code.
                net._hostGen = gen + 1;
                setTimeout(function() { startHosting(false); }, 200);
                return;
            }
            forgetHostCode();
            if (resumed) toast('Your last room code could not be resumed — starting with a new code. Players will need the new one.');
            else toast('Code collision — trying another code.');
            setTimeout(function() { startHosting(true); }, 300);
            return;
        }
        setStatus('Host error: ' + err.type);
    });
}

var JOIN_ATTEMPT_MS = 7000;   // per generation; a dead generation's registration answers nothing
function joinSession(code, name, isRetry, probe) {
    if (typeof Peer === 'undefined') { toast('Multiplayer needs an internet connection.'); return; }
    probe = probe || 0;                       // which generation this attempt targets
    if (!isRetry && !probe) cancelReconnect();
    if (!isRetry && !probe) ringReset();   // HF3: a new table's HUD history starts empty (a retry or a probe keeps it)
    leaveSession(true);
    var profile = setProfileName(name || getProfile().name || 'Player');
    net.myId = profile.id;
    var peer = new Peer(peerOpts());
    net.peer = peer; net.role = 'client'; net.code = code;
    peer.on('call', function(call) { try { call.close(); } catch (e) {} });   // item 21 V2: no media call is used: any that comes is closed
    if (isRetry) {
        // Still at the GM's table as far as the player is concerned: the GM's campaign is on
        // screen, so the spectator rules (no sidebars, no editing, no planners) must hold
        // through every retry, not lapse between attempts.
        net.active = true;
        renderRoster(); syncSessionButtons();
    }
    if (!isRetry && !probe) setStatus('Connecting to ' + code.toUpperCase() + '...');
    var gen = isRetry ? (reconn.tries % ROOM_GENS) : probe;
    peer.on('open', function() {
        var conn = peer.connect(roomPeerId(code, gen), { reliable: true });
        net.conns = [conn];
        // Nothing within a few seconds: this generation is dead or unreachable. A first join
        // moves on to the next generation (a resumed room lives under one), then gives up with
        // a clear message — that is what a player behind carrier-grade NAT sees when the GM
        // has no relay. A reconnect attempt just schedules the next one.
        var joinTimer = setTimeout(function() {
            if (conn.open || net.peer !== peer) return;
            try { peer.destroy(); } catch (e) {}
            if (reconn.pending) { scheduleReconnect(); return; }
            if (probe + 1 < ROOM_GENS) { joinSession(code, name, false, probe + 1); return; }
            joinFailed('No route to the GM\'s table.');
        }, JOIN_ATTEMPT_MS);
        conn.on('iceStateChanged', function(s) { if ((s === 'failed' || s === 'closed') && !conn.open && net.peer === peer && !reconn.pending) joinFailed('Your network and the GM\'s could not reach each other (ICE ' + s + ').'); });
        conn.on('open', function() { clearTimeout(joinTimer); });
        function joinFailed(why) {
            clearTimeout(joinTimer);
            try { peer.destroy(); } catch (e) {}
            net.peer = null; net.conns = []; net.active = false; net.role = null; net.code = null;
            setIndicator(null);
            setStatus(why + ' This usually means your connection is behind carrier-grade NAT and the table needs a relay server: ask the GM to set one under Settings \u25B8 Relay server, then try again.');
            if (net.fromWelcome) { if (window.wpJoinFailed) window.wpJoinFailed(); }   // joined from the welcome screen: the error shows there; re-enable its Join button
            else { toast('Could not reach the GM\'s table \u2014 see the Multiplayer panel.'); var nmJ = ui('netModal'); if (nmJ) nmJ.style.display = 'flex'; }
            if (net.foreign && !window.wpStream) load();   // a previous table is still on screen: bring the own campaign back
        }
        conn.on('open', function() {
            var wasRetry = reconn.pending;
            cancelReconnect();
            net.active = true;
            var pwIn = ui('netJoinPassInput');
            conn.send({ type: 'hello', profile: profile, password: pwIn ? pwIn.value.trim() : '', version: APP_VERSION, key: tableKeyFor(net.gmId) });   // before the first heartbeat: the host admits nothing that speaks first; the key proves a known id (a reconnect knows its GM; a fresh join is challenged for it)
            startHeartbeat();
            renderRoster();
            setStatus('Connected — waiting for campaign snapshot...');
            if (wasRetry) toast('Reconnected ✓');
        });
        wireConn(conn);
    });
    peer.on('error', function(err) {
        if (reconn.pending) {
            // a failed retry (host still down, room gone) → keep trying until the budget runs out
            try { peer.destroy(); } catch (e) {}
            scheduleReconnect();
            return;
        }
        setStatus('Connection error: ' + err.type);
        if (net.fromWelcome && window.wpJoinFailed) window.wpJoinFailed();   // re-enable the welcome Join button (the error shows on that screen)
        toast('Could not reach that room (' + err.type + ').');
        // Only when the join itself failed: a signalling hiccup mid-game also lands here, with the table still live
        if (!net.active && net.foreign && !window.wpStream) load();   // a previous table is still on screen: bring the own campaign back
    });
}

function leaveSession(silent) {
    var wasClient = net.active && net.role === 'client';
    var wasHost = net.active && net.role === 'host';
    if (typeof actForget === 'function') actForget();   // 14c: the record of their actions on their way goes with the table
    if (wasHost && typeof fogDragSweep === 'function') fogDragSweep(true);   // fold M4: every drag still open goes back where it began, while the table still hears it
    if (!silent && net.active && net.role === 'host') {
        broadcast({ type: 'end' }, null);   // give players a clean "session ended" instead of a silent drop
        forgetHostCode();                   // a deliberate end retires the code; only a crash keeps it for resume
    }
    if (!silent && wasClient) net.leaving = true;
    if (!silent) cancelReconnect();
    if (window.wpVideo && window.wpVideo.tableLeft) { try { window.wpVideo.tableLeft(); } catch (e) {} }   // item 21 V2: a showing stops while the table still hears it; a player's panel closes
    net.videoStop(); videoOver();
    if (net.peer) { try { net.peer.destroy(); } catch (e) {} }
    net.peer = null; net.conns = []; net.roster = Object.create(null); if (!silent) net.away = Object.create(null); net.active = false; net.role = null; net.code = null; net.lastStage = null;   // a reconnect retry (silent) keeps the away map: tokens stay on their last-known maps while it retries
    diceSessionReset(!silent);   // a deliberate leave or end clears the chat panel too; a retry keeps it
    // do not null net.stance / net.stanceCamps / net.gmId here — joinSession calls leaveSession(true) on every retry,
    // and the GM's campaign stays on screen until load() brings the player's own back; load() is the one clear point
    net.syncedPeer = null;
    net.sounds = null; net.soundNow = null;   // transport memory, unlike the ceiling: the next table sends its own list
    net.music = null;                         // the music library too; wpMusic.tableLeft below stops any playback
    net.libReset(); _libSpent = Object.create(null);   // Stage 6 library L3: a table's library and what its players drew, gone with the session
    resetAssetTransfers();                    // in-flight sound requests and their waiters die with the connection
    if (window.wpSound) window.wpSound.tableLeft(wasClient);
    if (window.wpMusic && window.wpMusic.tableLeft) window.wpMusic.tableLeft(wasClient);
    if (window.wpFx) window.wpFx.tableLeft();
    endWaiting(wasHost);   // Onboarding F1a: waiting tokens live only while the session runs (the end's save writes them away)
    net.targets = {};
    net.combats = {}; combatAsked = {};
    net.notepad = { on: false, text: '' }; setTimeout(renderNotepad, 0);
    if (window.wpRenderCombatStrip) setTimeout(function() { window.wpRenderCombatStrip(); }, 0);
    if (window.wpSheets && window.wpSheets.tokenTurned) setTimeout(function() { window.wpSheets.tokenTurned(null, true); }, 0);   // HUD frame (HF5b): CombatRound reads 0 again, so a sheet or HUD showing it repaints (no render runs on a leave)
    stopHeartbeat();
    if (!silent) setIndicator(null);
    setPausedLocal(false);
    setTravelLockLocal(false);
    net.pausedPlayers = {}; setSelfPausedLocal(false);   // per-player pauses are per-session, like the table pause and travel lock
    bannedIds = {}; pendingJoins = []; approvalOpen = false;   // bans and pending approvals are per-session
    var hi = ui('netHostInfo');
    if (hi) hi.style.display = 'none';
    renderRoster();
    if (!silent) {
        net.stageOverride = null;
        net.stageMode = null; net.stageFallback = null; net.stagePicked = {};   // the next session starts from the defaults again
        setStatus('Not in a session.');
        toast(wasClient ? 'Left the session — restoring your own campaign.' : wasHost ? 'Session ended for everyone — the room code is retired.' : 'Left the session.');
        if (wasHost) { logEvent('session', 'Session ended'); net.applyingRemote = true; save(true); net.applyingRemote = false; }
        if ((wasClient || net.foreign) && !window.wpStream) load();   // foreign without a live link (a failed re-join) still leaves this way
    }
    syncSessionButtons();
}

/* ---------- asset sync: clients pull images from the host over the data channel ---------- */
var assetCache = Object.create(null);    // path -> blob URL (pictures, pulled on render); prototype-free: a path like "constructor" is never a hit
var assetPending = Object.create(null);  // path -> true
var assetRenderTimer = null;
var assetWaiters = {};  // path -> { promise, resolve, reject, timer, parts, n, bytes }: sounds, pulled by net.fetchAsset and answered in parts
var assetInflight = {}; // host: peer -> path, one sound transfer at a time per peer
var ASSET_PART = 256 * 1024, AUDIO_CAP = 26 * 1024 * 1024, ASSET_WAIT = 45000, MAX_PARTS = 130;   // AUDIO_CAP covers full music tracks (musiccore caps a track at 25 MB); SFX stay small — soundcore caps them at 4 MB at upload. MAX_PARTS (130×256 KB ≈ 33 MB) > cap so a legit transfer never trips the part guard.
function isAudioPath(p) { return typeof p === 'string' && p.indexOf('/saves/images/audio/') === 0; }

function assetMime(path) {
    var ext = (path.split('.').pop() || '').toLowerCase();
    return { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', m4a: 'audio/mp4', webm: 'audio/webm' }[ext] || 'application/octet-stream';
}

// Resolve an image path for display. Host/solo: the path itself.
// Client in a session: cached blob URL, requesting it from the host if new.
net.assetSrc = function(path) {
    if (!path || !net.active || net.role !== 'client' || net.stream) return path;   // the stream window reads images straight from the local server
    if (/^(data:|blob:)/.test(path)) return path;   // already self-contained
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:|^\/\//.test(path)) return ASSET_PLACEHOLDER;   // an absolute URL from a host would make this machine call out to it (an IP beacon, a LAN probe): never
    if (!/^\/?saves\//.test(path)) return path;     // shipped with the app (assets/…): every install has it
    if (assetCache[path]) return assetCache[path];
    if (!assetPending[path] && net.conns[0] && net.conns[0].open) {
        assetPending[path] = true;
        try { net.conns[0].send({ type: 'asset-req', path: path }); } catch (e) { sendFailed(e); }
    }
    return ASSET_PLACEHOLDER;   // transparent 1px placeholder until the bytes arrive (whiteboard shows the character's initials over it)
};
var ASSET_PLACEHOLDER = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
net.ASSET_PLACEHOLDER = ASSET_PLACEHOLDER;
var _assetRetries = Object.create(null);   // client: per picture, how many 'busy' answers were retried

function answerAsset(conn, path, error) { try { conn.send({ type: 'asset', path: path, error: error }); } catch (e) { sendFailed(e); } }
// The one kind of path a peer may ask for: a campaign picture or sound under /saves/images/. Checked on the
// CANONICAL pathname — the browser collapses %2e%2e (and .%2e, %2e.) into dot segments before a request ever
// leaves, so a raw-string check alone could be walked past to /api/data or /saves/data.json — then decoded and
// checked again. Returns the percent-encoded pathname to fetch, or '' to refuse.
function assetPathOk(raw) {
    if (typeof raw !== 'string' || !raw || raw.length > 400) return '';
    var u; try { u = new URL(raw, location.origin); } catch (e) { return ''; }
    if (u.origin !== location.origin || u.search || u.hash) return '';
    // The parser has already collapsed any dot segments and encoded spaces/unicode (a pre-encoded %20 is kept, never doubled).
    // A lone '%' in a file name is legal on disk, but the server decodes what it is sent — so it becomes %25 here, as
    // encodeURI does for the host's own playback (sound.js/music.js); the audio branch used encodeURI before 020a8b4.
    var p = u.pathname.replace(/%(?![0-9A-Fa-f]{2})/g, '%25'), dec; try { dec = decodeURIComponent(p); } catch (e) { dec = p; }   // a bad UTF-8 sequence still checks as sent
    if (p.indexOf('/saves/images/') !== 0 || dec.indexOf('/saves/images/') !== 0 || dec.indexOf('..') !== -1 || dec.indexOf('\\') !== -1 || dec.indexOf('\0') !== -1) return '';
    return p;
}
net._assetPathOk = assetPathOk;   // exposed for the dev console / checks
function handleAssetRequest(msg, conn) {
    // Serve only campaign images and sounds, never arbitrary paths
    var reqPath = assetPathOk(msg.path); if (!reqPath) return;
    if (!allow('asset', { perMs: 0, burst: 200, windowMs: 10000, table: 8000 }, conn.peer)) { answerAsset(conn, msg.path, 'busy'); return; }   // a map's pictures arrive in ONE burst (several in the same millisecond): no spacing, a wide window; a flood beyond it is refused — and told so, so the player's copy retries instead of waiting forever
    var decPath; try { decPath = decodeURIComponent(reqPath); } catch (e) { decPath = reqPath; }
    if (isAudioPath(decPath)) {   // judged on the DECODED path: an encoded "audio" must not slip into the whole-file picture branch
        // a sound or music track: one in flight per peer, the AUDIO_CAP, 256 KB parts so the heartbeats never queue behind a whole file, every refusal answered
        if (assetInflight[conn.peer]) { answerAsset(conn, msg.path, 'busy'); return; }
        assetInflight[conn.peer] = msg.path;
        var done = function() { if (assetInflight[conn.peer] === msg.path) delete assetInflight[conn.peer]; };
        fetch(reqPath).then(function(r) { return r.ok ? r.arrayBuffer() : null; }).then(function(buf) {
            if (!conn.open) { done(); return; }
            if (!buf) { answerAsset(conn, msg.path, 'missing'); done(); return; }
            if (buf.byteLength > AUDIO_CAP) { answerAsset(conn, msg.path, 'too-big'); done(); return; }
            var n = Math.max(1, Math.ceil(buf.byteLength / ASSET_PART)), i = 0;
            (function pump() {
                if (!conn.open) { done(); return; }
                var end = Math.min(buf.byteLength, (i + 1) * ASSET_PART);
                try { conn.send({ type: 'asset-part', path: msg.path, i: i, n: n, data: new Uint8Array(buf.slice(i * ASSET_PART, end)) }); }
                catch (e) { answerAsset(conn, msg.path, 'busy'); done(); return; }
                i++;
                if (i < n) setTimeout(pump, 15); else done();
            })();
        }).catch(function() { answerAsset(conn, msg.path, 'missing'); done(); });
        return;
    }
    fetch(reqPath).then(function(r) { return r.ok ? r.arrayBuffer() : null; }).then(function(buf) {
        if (!conn.open) return;
        if (!buf) { answerAsset(conn, msg.path, 'missing'); return; }
        if (buf.byteLength > AUDIO_CAP) { answerAsset(conn, msg.path, 'too-big'); return; }   // a picture past the cap is never sent whole
        try { conn.send({ type: 'asset', path: msg.path, mime: assetMime(msg.path), data: new Uint8Array(buf) }); } catch (e) { sendFailed(e); }
    }).catch(function() { answerAsset(conn, msg.path, 'missing'); });
}

// A sound file from the host, for sound.js: one request, answered in parts (or with an error) and reassembled here.
// sound.js serialises its requests; the host allows one in flight per peer anyway. Rejects: offline, bad path, too-big, busy, missing, timeout, left.
net.fetchAsset = function(path, size) {
    if (!net.active || net.role !== 'client' || net.stream) return Promise.reject(new Error('offline'));
    if (!isAudioPath(path) || path.indexOf('..') !== -1 || path.length > 400) return Promise.reject(new Error('bad path'));
    if (Number(size) > AUDIO_CAP) return Promise.reject(new Error('too-big'));
    if (assetWaiters[path]) return assetWaiters[path].promise;
    var w = { parts: [], n: 0, bytes: 0 };
    w.promise = new Promise(function(resolve, reject) {
        w.resolve = resolve; w.reject = reject;
        var c = net.conns[0];
        if (!c || !c.open) { reject(new Error('offline')); return; }
        w.timer = setTimeout(function() { if (assetWaiters[path] === w) delete assetWaiters[path]; reject(new Error('timeout')); }, ASSET_WAIT);
        assetWaiters[path] = w;
        try { c.send({ type: 'asset-req', path: path }); } catch (e) { clearTimeout(w.timer); delete assetWaiters[path]; reject(new Error('busy')); }
    });
    return w.promise;
};
function handleAssetPart(msg) {
    var w = typeof msg.path === 'string' ? assetWaiters[msg.path] : null; if (!w) return;   // unsolicited: dropped, nothing kept
    var i = msg.i | 0, n = msg.n | 0, data = msg.data;
    if (!data || n < 1 || n > MAX_PARTS || i < 0 || i >= n || (w.n && w.n !== n)) return;
    var len = data.byteLength || data.length || 0; if (!len) return;
    w.n = n; if (!w.parts[i]) w.bytes += len;
    if (w.bytes > AUDIO_CAP) { clearTimeout(w.timer); delete assetWaiters[msg.path]; w.reject(new Error('too-big')); return; }
    w.parts[i] = data;
    for (var k = 0; k < n; k++) if (!w.parts[k]) return;
    clearTimeout(w.timer); delete assetWaiters[msg.path];
    try { w.resolve(new Blob(w.parts, { type: assetMime(msg.path) })); } catch (e) { w.reject(e); }
}
function resetAssetTransfers() {
    Object.keys(assetWaiters).forEach(function(p) { var w = assetWaiters[p]; clearTimeout(w.timer); try { w.reject(new Error('left')); } catch (e) {} });
    assetWaiters = {}; assetPending = Object.create(null); assetInflight = {};
}

function handleAssetArrival(msg) {
    if (typeof msg.path === 'string' && assetWaiters[msg.path]) { var w = assetWaiters[msg.path]; clearTimeout(w.timer); delete assetWaiters[msg.path]; w.reject(new Error(typeof msg.error === 'string' ? msg.error.slice(0, 40) : 'failed')); return; }   // the only 'asset' answer to a sound request is a refusal (the bytes come as asset-part)
    if (typeof msg.path === 'string' && typeof msg.error === 'string' && own(assetPending, msg.path)) {   // a picture the host would not send
        delete assetPending[msg.path];
        var tries = (_assetRetries[msg.path] = (_assetRetries[msg.path] || 0) + 1);
        if (msg.error === 'busy' && tries <= 5) setTimeout(function() { if (!assetCache[msg.path]) net.assetSrc(msg.path); }, 800 * tries);   // the host was busy: ask again, backing off
        else assetCache[msg.path] = ASSET_PLACEHOLDER;   // missing / too big / kept refusing: settle on the placeholder, never ask again this session
        return;
    }
    if (typeof msg.path !== 'string' || !msg.data || !own(assetPending, msg.path)) return;   // unsolicited (or a prototype-key path): never cached
    if (typeof msg.data.byteLength !== 'number' || msg.data.byteLength > AUDIO_CAP) { delete assetPending[msg.path]; return; }   // past the cap: not held
    try {
        var blob = new Blob([msg.data], { type: msg.mime || assetMime(msg.path) });
        if (typeof assetCache[msg.path] === 'string' && assetCache[msg.path].indexOf('blob:') === 0) { try { URL.revokeObjectURL(assetCache[msg.path]); } catch (e) {} }   // a picture sent twice does not keep two copies
        assetCache[msg.path] = URL.createObjectURL(blob);
    } catch (e) { return; }
    delete assetPending[msg.path];
    try { document.dispatchEvent(new CustomEvent('wp-asset', { detail: { path: msg.path } })); } catch (e) {}   // the handbook reader patches its pictures in place
    clearTimeout(assetRenderTimer);
    assetRenderTimer = setTimeout(function() { if (state.viewMode === 'visual') render(); }, 150);
}

/* ---------- dice: rolls at the table (dicecore.js validates and replays; dice.js draws the card) ----------
   The host makes every roll: a player sends { roll-req, rid, expr, priv? }, the host evaluates once and sends the
   record { roll, id, from, expr, draws, v, ts, priv?, to?, rid? } to the admitted peers (or to one), and every
   machine replays expr + draws through its own engine. Nothing rendered travels; nothing a client says is trusted. */
var diceLimit = null, _dicePending = null, _diceSlowSaid = {};
function DC() { return window.wpDiceCore || null; }
function sendTable(msg, exceptConn) {   // admitted peers only: broadcast() would reach a peer still waiting for the GM's Allow
    net.conns.forEach(function(c) { if (c !== exceptConn && c.open && net.roster[c.peer]) { try { c.send(msg); } catch (e) { sendFailed(e); } } });
}
// Stage 6 HUD H7: an apply action's card, delivered to whoever may see it (systemcore applyScope): 'table' — every admitted player; 'owner'
// — the character's player (each of their connections) and the GM; 'gm' — the GM, and the player who pressed it (conn), if one did. Shown
// here too (the host's chat, or a solo GM's), and in the session log
// [netcheck:postapply-start]
function postApply(rec, scope, ch, conn) {
    if (scope !== 'table') rec.priv = 'gm';
    if (net.active && net.role === 'host') {
        if (scope === 'table') sendTable(rec, null);
        else net.conns.forEach(function(c) { if (!c.open || !net.roster[c.peer]) return; if (c === conn || (scope === 'owner' && ch && ch.ownerId && peerProfileId(c) === ch.ownerId)) { try { c.send(rec); } catch (e) { sendFailed(e); } } });
    }
    pushChat({ from: rec.from, text: '', scope: scope === 'table' ? 'global' : 'whisper', ts: rec.ts, apply: rec });
    logEvent('char', applyLine(rec));
    if (ch && typeof ch.id === 'string' && typeof bellOut === 'function') bellOut(ch.id, { apply: rec });   // the character's bell here
}
function applyLines(lines) { return (Array.isArray(lines) ? lines : []).slice(0, 4).map(function(l) { var cap = function(x) { return Math.max(-1e15, Math.min(1e15, x)); }; return { n: String(l.n).slice(0, 60), d: cap(l.d), v: cap(l.v) }; }); }   // what the card carries: a label, two numbers (clients refuse past 1e15)
// [netcheck:postapply-end]
// The bell (the HUD's notes, sheets.js): a note for a character's bell on this machine — cid '' finds this player's character named as
function bellOut(cid, note, as) { try { if (window.wpSheets && window.wpSheets.bellNote) window.wpSheets.bellNote(cid, note, as); } catch (e) { console.error(e); } }
function applyLine(rec) { var D = DC(); return D && D.applyText ? D.applyText(rec) : 'An action was applied.'; }
function dueLine(rec) { var D = DC(); return D && D.dueText ? D.dueText(rec) : 'An action is due.'; }
// Turn-based combat T2b: a timed action that waits for a press — its reminder card (sheets.js timedHook): the character's player's when asked
// (each connection of theirs; the GM's copy then says whose it is to press), else the GM's alone. A whisper: never in the join's history
net.postDue = function(ch, act, kind, round, toOwner) {
    if (!ch || typeof ch.id !== 'string' || !act || typeof act.id !== 'string') return;
    var rec = { type: 'due', id: 'r_' + Math.random().toString(36).slice(2, 10), from: diceFrom(getProfile(), true), charId: ch.id, act: act.id, label: String(act.label || 'Apply').split('{')[0].trim().slice(0, 60) || 'Apply', why: kind === 'turn' ? 'turn' : 'round', round: Math.max(1, Math.min(9999, Math.floor(Number(round) || 1))), ts: Date.now() };
    if (ch.name) rec.as = String(ch.name).slice(0, 60);
    postDue(rec, ch, !!toOwner);
};
// [netcheck:postdue-start]
function postDue(rec, ch, toOwner) {
    var sent = false;
    if (toOwner && net.active && net.role === 'host' && ch && ch.ownerId && !ch.npc) net.conns.forEach(function(c) { if (!c.open || !net.roster[c.peer] || peerProfileId(c) !== ch.ownerId) return; try { c.send(rec); sent = true; } catch (e) { sendFailed(e); } });
    pushChat({ from: rec.from, text: '', scope: 'whisper', ts: rec.ts, due: sent ? Object.assign({}, rec, { theirs: 1 }) : rec });
    if (ch && typeof ch.id === 'string' && typeof bellOut === 'function') bellOut(ch.id, { due: rec });
}
// [netcheck:postdue-end]
// Stage 6 HUD H7: the GM's own press (sheets.js has worked it out and stored it): the card, as the GM's
net.postApplyCard = function(ch, label, lines, scope) {
    var rec = { type: 'apply', id: 'r_' + Math.random().toString(36).slice(2, 10), from: diceFrom(getProfile(), true), lines: applyLines(lines), ts: Date.now() };
    if (label) rec.label = String(label).slice(0, 60);
    if (ch && ch.name) rec.as = String(ch.name).slice(0, 60);
    if (!rec.lines.length) return;
    postApply(rec, scope, ch, null);
};
function diceFrom(prof, gm) { return { id: String((prof && prof.id) || 'x').slice(0, 60), name: String((prof && prof.name) || (gm ? 'GM' : 'Player')).slice(0, 60), gm: !!gm }; }
// [netcheck:rolltag-start]
// A HUD's roll history (Stage 6 HUD frame, HF3): every roll this machine saw, tagged HERE with the character it was made as (the host knows
// the character of every roll made as one; a player knows its own from its pending request; another machine's roll is tagged on arrival by
// the one character here it can have been made as) — the tag never goes on the wire; in time order, at most 300, gone with the session
// like the chat (and emptied when a new table starts here). seq is this machine's own counter (a host's ts is another clock): Clear
// compares seq, never ts; it never resets, so a Clear from before a session reset hides nothing new
var rollRing = [], ringSeq = 0;
// Another machine's roll made as a character carries only that name ("as"): the one character in this campaign it can have been made as —
// any of that name for the GM's roll, else only one its sender owns (the host lets a player roll as their own character only). '' when
// none or several: the name then decides at display, for the GM's rolls and this machine's own only. Resolved once, so a rename keeps it
function tagByName(m) {
    var as = m.roll.as, from = m.from || {}, camp = getActiveCampaign(), cs = camp && camp.chars;
    if (typeof as !== 'string' || !as || !cs || typeof cs !== 'object') return '';
    var DL = window.wpDiceCore && window.wpDiceCore.LIMITS, cap = (DL && DL.label) || 60, hit = '';
    for (var id in cs) {
        if (!Object.prototype.hasOwnProperty.call(cs, id) || !/^c_[A-Za-z0-9_]{1,24}$/.test(id)) continue;
        var ch = cs[id]; if (!ch || typeof ch !== 'object' || String(ch.name || '').slice(0, cap) !== as) continue;
        if (from.gm !== true && !(typeof ch.ownerId === 'string' && ch.ownerId && ch.ownerId === from.id)) continue;
        if (hit) return ''; hit = id;
    }
    return hit;
}
function ringPush(m, cid, replay) {
    if (!m || !m.roll) return;
    if (replay && rollRing.some(function(x) { return x.m.roll.id === m.roll.id; })) return;   // the join's history never doubles a roll already here
    var e = { m: m, cid: typeof cid === 'string' && /^c_[A-Za-z0-9_]{1,24}$/.test(cid) ? cid : tagByName(m), camp: (getActiveCampaign() || {}).id || '', seq: ++ringSeq, replay: !!replay };
    if (replay) { var i = rollRing.length; while (i > 0 && (rollRing[i - 1].m.ts || 0) > (m.ts || 0)) i--; rollRing.splice(i, 0, e); }   // the join's history lands in time order
    else rollRing.push(e);
    if (rollRing.length > 300) rollRing.shift();
    if (!replay) { try { if (window.wpSheets && window.wpSheets.rolled) window.wpSheets.rolled(m, e.cid); } catch (x) {} }
}
function ringRepaint() { try { if (window.wpSheets && window.wpSheets.rolled) window.wpSheets.rolled(null, ''); } catch (x) {} }   // every HUD's foot, no NEW of its own
function ringReset() { rollRing = []; ringRepaint(); }   // a new table starts here (a fresh Join) or the old one is given up: its rolls, or this machine's solo ones, are not this session's
net.rollSeq = function() { return ringSeq; };
net.rollsFor = function(charId, name, sinceSeq, max) {   // newest first: tagged with this character, or (untagged) made as its name by the GM or by this machine's own player; roll/res are shared with the chat — read-only
    var camp = (getActiveCampaign() || {}).id || '', out = [], n = Math.max(1, Math.min(100, max | 0 || 10));
    for (var i = rollRing.length - 1; i >= 0 && out.length < n; i--) { var e = rollRing[i]; if (e.camp !== camp || (sinceSeq && e.seq <= sinceSeq)) continue;
        if (e.cid ? e.cid === charId : !!(name && e.m.roll.as === name && e.m.from && (e.m.from.gm === true || e.m.from.id === net.myId))) out.push({ from: e.m.from, scope: e.m.scope, ts: e.m.ts, seq: e.seq, fresh: !e.replay, roll: e.m.roll, res: e.m.res, rollBad: e.m.rollBad, toName: e.m.toName }); }
    return out;
};
function chatHistoryOf(log) { return log.filter(function(m) { return m.scope !== 'whisper'; }).slice(-60).map(function(m) { return m.roll ? { from: m.from, text: '', scope: m.scope, ts: m.ts, roll: m.roll } : m.apply ? { from: m.from, text: '', scope: m.scope, ts: m.ts, apply: m.apply } : m; }); }   // the join's recent chat (a roll rebuilt: nothing local rides along)
// [netcheck:rolltag-end]
function pushRoll(rec, res, scope, opts) {
    var m = { from: rec.from, text: '', scope: scope, ts: rec.ts, roll: rec, res: res, rollBad: res ? null : ((opts && opts.bad) || 'error'), toName: opts && opts.toName ? opts.toName : '' };
    pushChat(m); ringPush(m, opts && opts.cid);
}
function diceSessionReset(clearChat) {
    if (_dicePending) { clearTimeout(_dicePending.timer); _dicePending = null; }
    if (diceLimit) diceLimit.reset();
    _diceSlowSaid = {};
    charSessionReset();
    if (clearChat) { chatLog = []; chatUnread = 0; renderChat(); rollRing = []; ringRepaint(); }   // the table that is over keeps its chat and its rolls to itself (the HUDs' history too; ringSeq runs on)
}
// Roll from here: a client asks the host; a host or a solo GM rolls at once. Returns { ok } or { error, pos?, len? }.
// [netcheck:diceroll-start]
net.diceRoll = function(expr, o) {
    o = o || {}; var D = DC(), F = window.wpFormula;
    if (!D || !F) return { error: 'Dice are not available.' };
    if (net.stream) return { error: 'Not from the stream window.' };
    if (window.wpVtt && !window.wpVtt.on('dice')) return { error: D.denyText('off') };
    expr = D.cleanExpr(expr); if (!expr) return { error: 'Type a formula, for example 2d6 + 3 (up to ' + D.LIMITS.expr + ' characters).' };
    if (F.names(expr).length && !o.charId) return { error: D.denyText('names') };   // names come from a character's sheet (1.5.0)
    if (net.active && net.role === 'client') {
        if (!net.foreign || !net.syncedPeer || !net.conns[0] || !net.conns[0].open) return { error: 'Not at the table yet.' };
        if (_dicePending) return { error: 'Waiting for the GM to roll the last one.' };
        var rid = 'q' + Math.random().toString(36).slice(2, 10), req = { type: 'roll-req', rid: rid, expr: expr };
        if (o.priv) req.priv = 'gm';
        if (o.charId) req.charId = o.charId;
        if (o.label) req.label = String(o.label).slice(0, D.LIMITS.label);
        if (o.row && o.charId) { req.row = { f: String(o.row.f), r: String(o.row.r) }; if (typeof o.row.i === 'number') req.row.i = o.row.i; }   // R2b: a list's roll with consequences or needs names its index
        if (o.charId && ((o.act && !o.row) || (o.row && typeof o.row.i === 'number'))) { if (o.act && !o.row) req.act = String(o.act); if (o.mod) req.mod = o.mod; if (o.adv) req.adv = o.adv; }   // Stage 6 HUD R1: the entry, its modifier and advantage (the host rebuilds the formula)   // Stage 6 F5b: a roll on a row
        _dicePending = { rid: rid, expr: expr, charId: o.charId || '', timer: setTimeout(function() { _dicePending = null; if (window.wpDice) window.wpDice.onDeny({ reason: 'error', message: 'No answer from the GM. Their Waypoint may not have dice yet.', pos: 0, len: 0 }, expr); }, D.LIMITS.timeoutMs) };
        try { net.conns[0].send(req); } catch (e) { clearTimeout(_dicePending.timer); _dicePending = null; return { error: 'Could not reach the GM.' }; }
        return { ok: true, pending: true };
    }
    var campR = getActiveCampaign(), SR = SC(), chR = null, varsR = null, tcR = null;   // range R3: tcR, the token context its names read (the range's target with it)   // a character makes its sheet's names available (character sheets, 1.5.0)
    if (o.charId) { chR = (campR && campR.chars && typeof o.charId === 'string' && Object.prototype.hasOwnProperty.call(campR.chars, o.charId) ? campR.chars[o.charId] : null); if (!chR || !campR.system || !SR) return { error: D.denyText('char') }; tcR = window.wpSheets && window.wpSheets.tokenCtxFor ? window.wpSheets.tokenCtxFor(chR.id, campR) : null; varsR = SR.makeResolver(campR.system, chR, F, tcR); }
    var rowP = null;
    if (o.row && varsR) { var rvR = varsR.row(o.row.f, o.row.r); if (!rvR) return { error: D.denyText('char') }; varsR = rvR; }
    var entR = null;   // Stage 6 HUD R1/R2b: the entry a roll with consequences or needs names — a system roll by act, a list's roll by its index
    if (chR && SR && campR && campR.system) {
        if (o.act && !o.row) (Array.isArray(campR.system.rolls) ? campR.system.rolls : []).forEach(function(r) { if (r && r.id === o.act && typeof r.formula === 'string' && !r.apply) entR = r; });
        else if (o.row && typeof o.row.i === 'number') (Array.isArray(campR.system.fields) ? campR.system.fields : []).forEach(function(f) { if (f && f.id === o.row.f && f.kind === 'item-list' && f.list && Array.isArray(f.list.rolls)) { var lrR0 = f.list.rolls[o.row.i]; if (lrR0 && typeof lrR0.formula === 'string' && !lrR0.apply) entR = lrR0; } });
    }
    if (entR && entR.needs && varsR) { var ndR = F.evaluate(entR.needs, { vars: varsR }); if (!(ndR.ok && (ndR.value === true || (typeof ndR.value === 'number' && ndR.value !== 0)))) return { error: entR.needsText || ('Not now: it needs ' + entR.needs) }; }   // R2b: its needs (before anything is rolled)   // Stage 6 F5b: a roll on one row — its Row.* names
    var res = F.evaluate(expr, varsR ? { vars: varsR } : {});
    if (!res.ok) return { error: res.error.message, pos: res.error.pos, len: res.error.len };
    if (o.row && chR && SR && campR && campR.system) rowP = SR.rowRollNames(campR.system, chR, o.row.f, o.row.r, (res.breakdown && res.breakdown.names) || [], F);   // what its Row.* names read, and whether the row is GM-only
    var why = D.checkTableRoll(res); if (why) return { error: D.denyText(why) };
    var rec = { type: 'roll', id: D.uid(), from: diceFrom(getProfile(), true), expr: expr, draws: res.draws, v: F.VERSION, ts: Date.now() };
    var mfR = null; if (entR && entR.malf && varsR) { var mqR = F.evaluate(entR.malf, { vars: varsR }); if (mqR.ok && typeof mqR.value === 'number' && isFinite(mqR.value)) mfR = Math.max(1, Math.min(1000000, Math.round(mqR.value))); }   // Stage 6 HUD R3: its Malf
    if (mfR !== null) rec.malf = mfR;
    if ((entR && entR.dmg === true) || o.dmg === true) rec.dmg = 1;   // chat cards: a damage roll (its entry; or this machine's own word, a thrown item's damage — never over the wire)
    if (res.breakdown && res.breakdown.names && res.breakdown.names.length) { var nmR = D.cleanNames(res.breakdown.names); if (!nmR) return { error: 'That roll could not be recorded.' }; if (nmR.length) rec.names = nmR; }
    if (o.label) rec.label = String(o.label).slice(0, D.LIMITS.label);
    if (chR) rec.as = String(chR.name || '').slice(0, D.LIMITS.label);
    var hosting = net.active && net.role === 'host', toName = '', gmR = [];
    if (hosting && !o.priv && SR && campR && campR.system) SR.gmOnlyNames(campR.system, F.names(expr).map(function(n) { return { name: n }; })).concat(rec.names ? SR.gmDerivedNames(campR.system, F, rec.names) : []).forEach(function(n) { if (!gmR.some(function(m) { return m.toLowerCase() === n.toLowerCase(); })) gmR.push(n); });   // a GM-only name the formula writes (a branch not taken too: the card shows the text), and a value it read that is GM-only or worked out from one
    if (rowP && hosting && !o.priv) { var extraR = SR.gmOnlyNames(campR.system, rowP.names).concat(SR.gmDerivedNames(campR.system, F, rowP.names)); extraR.forEach(function(n) { if (gmR.indexOf(n) < 0) gmR.push(n); }); }   // F5b: through a column or a choice
    if (mfR !== null && hosting && !o.priv && SR && campR && campR.system) { var mfN = F.names(entR.malf); SR.gmOnlyNames(campR.system, mfN.map(function(n) { return { name: n }; })).concat(SR.gmDerivedNames(campR.system, F, mfN)).forEach(function(n) { if (gmR.indexOf(n) < 0) gmR.push(n); }); }   // R3: the card shows the Malf, so a GM-only one keeps it private
    if (o.priv) rec.priv = 'gm';
    else if (hosting && rowP && rowP.gm) { rec.priv = 'gm'; toast('Kept private: that roll is on a GM-only item or list' + (rec.label ? ' (' + rec.label + ')' : '') + '.'); }   // F5b: a GM-only row's roll stays the GM's
    else if (hosting && rowP && rowP.kept) { rec.priv = 'gm'; toast('Kept private: its owner sees that item switched off' + (rec.label ? ' (' + rec.label + ')' : '') + '.'); }   // owed review F5b#2: a curse the GM keeps on
    else if (hosting && o.gmOnly) { rec.priv = 'gm'; toast('Kept private: that roll is GM only' + (rec.label ? ' (' + rec.label + ')' : '') + '.'); }   // the caller's word: a GM-only field's own roll, a GM-only roll, a GM-only item's damage — its label and formula are the GM's
    else if (gmR.length) { rec.priv = 'gm'; toast('Kept private: that roll uses a GM-only value (' + gmR.join(', ') + ').'); }   // a public roll never carries a GM-only value
    else if (hosting && tcR && tcR.range && typeof rangeUnseen === 'function' && typeof rangeReadBy === 'function' && rangeUnseen(campR, tcR.range, '') && rangeReadBy(SR, campR.system, chR, F, tcR, expr, o.row)) { rec.priv = 'gm'; toast('Kept private: a player on that map cannot see its target' + (rec.label ? ' (' + rec.label + ')' : '') + '.'); }   // range R3: its card would tell them how far it is
    else if (hosting && rowP && SR && varsR && SR.gmEffectNames(varsR, rowP.names).length) { rec.priv = 'gm'; toast('Kept private: a GM-only effect changes ' + SR.gmEffectNames(varsR, rowP.names).join(', ') + '.'); }   // F5b: through a column
    else if (hosting && rec.names && SR && varsR && SR.gmEffectNames(varsR, rec.names).length) { rec.priv = 'gm'; toast('Kept private: a GM-only effect changes ' + SR.gmEffectNames(varsR, rec.names).join(', ') + '.'); }   // 5h: nor a number a GM-only effect moved
    else if (hosting) {
        var toKey = ui('chatTo') ? ui('chatTo').value : '';   // a whisper target makes the roll private to that player
        var target = toKey ? net.conns.find(function(c) { return c.peer === toKey; }) : null;
        if (target && target.open && net.roster[toKey]) { rec.to = toKey; toName = net.roster[toKey].name || 'a player'; try { target.send(rec); } catch (e) { sendFailed(e); } }
    }
    var scope = rec.priv || rec.to ? 'whisper' : 'global';
    if (hosting && scope === 'global') sendTable(rec, null);
    pushRoll(rec, res, scope, { toName: toName, cid: chR ? chR.id : '' });
    var ruleR = campR && campR.system && campR.system.combat && campR.system.combat.checks === 'under3d6' ? 'under3d6' : '';   // Stage 6 F8
    logEvent('dice', D.cardText(rec, res, F, { maxChars: D.LIMITS.logChars, toName: toName, rule: ruleR }));
    if (entR && entR.then && chR && SR && campR && campR.system) {   // Stage 6 HUD R1/R2b: the GM's own roll's consequences, here (a player's are the host's); a list's roll may move its row's counters
        var mfHitR = mfR !== null && D.naturalOf(res) >= mfR, vdR = D.verdictOf(res, ruleR), thR = SR.thenChanges(entR, mfHitR ? false : (vdR && vdR.kind === 'check' ? vdR.pass : null), mfHitR);   // R3
        var taR = thR.length ? SR.applyAct(campR.system, chR, { apply: thR }, varsR, F, null, o.row ? { f: o.row.f, r: o.row.r } : null) : null;
        if (taR && taR.ok) { chR.values = chR.values || {}; Object.keys(taR.values).forEach(function(k) { chR.values[k] = taR.values[k]; }); chR.updated = Date.now(); save(true); if (hosting && net.syncCharDelta) net.syncCharDelta(chR.id, taR.values); if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(chR.id); }
    }
    return { ok: true, value: res.value, priv: !!rec.priv };
};
// [netcheck:diceroll-end]

/* ---------- table chat ---------- */
var chatLog = [];   // {from:{id,name}, text, scope:'global'|'whisper', ts}
var chatUnread = 0;

function escText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// Stable per-player color from their id
function playerHue(id) {
    var h = 0;
    for (var i = 0; i < String(id).length; i++) h = (h * 31 + String(id).charCodeAt(i)) | 0;
    return ((h % 360) + 360) % 360;
}
function playerColor(from) {
    if (from.gm) return 'var(--gold)';
    return 'hsl(' + playerHue(from.id) + ', 55%, 68%)';
}
function chatTime(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
}
function chatEntryNode(m) {   // one text entry, built from nodes: nothing from the wire is ever parsed as HTML
    var whisper = m.scope === 'whisper', wrap = document.createElement('div');
    wrap.style.cssText = whisper ? 'margin-bottom:7px; border-left:2px solid var(--violet); padding-left:7px; font-style:italic;' : 'margin-bottom:7px;';
    var who = document.createElement('b'); who.style.color = playerColor(m.from); who.textContent = m.from.id === net.myId ? 'You' : (m.from.name || 'Player'); wrap.appendChild(who);
    if (m.from.gm) { var g = document.createElement('span'); g.className = 'chat-gm'; g.textContent = 'GM'; wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(g); }
    if (whisper) { var t = document.createElement('span'); t.className = 'chat-tag'; t.textContent = 'whisper'; wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(t); }
    var tm = document.createElement('span'); tm.className = 'chat-time'; tm.textContent = chatTime(m.ts); wrap.appendChild(tm);
    wrap.appendChild(document.createElement('br'));
    wrap.appendChild(document.createTextNode(String(m.text || '')));
    return wrap;
}
// [sinkcheck:cardlook-start]
// Chat cards (owner 2026-09-27): the viewer's system look colours the cards — its colours as custom properties on #chatLog, checked strict
// #rrggbb (dicecore cardLook / cleanCardLook); none while character sheets are off or with no look. A chat pop-out takes the main window's
// (sent with chatSync). data-card-tone: the panel the palette was made for (under the other theme its text drops to the app's colours, CSS)
var _cardLook = null, _cardSig = 'null';
var CARD_VARS = [['primary', '--card-primary', '--card-t-primary'], ['good', '--card-good', '--card-t-good'], ['bad', '--card-bad', '--card-t-bad'], ['muted', '--card-muted', ''], ['accent', '--card-accent', '']];
function cardLookNow() {
    var DCk = window.wpDiceCore; if (!DCk || !DCk.cardLook || !DCk.cleanCardLook) return null;
    if (window.wpPopout) return DCk.cleanCardLook(_cardLook);
    if (window.wpVtt && window.wpVtt.on && !window.wpVtt.on('sheets')) return null;
    var syk = window.wpSheets && window.wpSheets.systemOf ? window.wpSheets.systemOf() : null;
    return DCk.cardLook(syk && syk.sheet ? syk.sheet.look : null);
}
function paintCardLook(log, cl) {
    CARD_VARS.forEach(function(v) { var hx = cl && typeof cl[v[0]] === 'string' && /^#[0-9a-f]{6}$/.test(cl[v[0]]) ? cl[v[0]] : ''; if (hx) { log.style.setProperty(v[1], hx); if (v[2]) log.style.setProperty(v[2], hx); } else { log.style.removeProperty(v[1]); if (v[2]) log.style.removeProperty(v[2]); } });
    if (cl && (cl.tone === 'dark' || cl.tone === 'light')) log.dataset.cardTone = cl.tone; else delete log.dataset.cardTone;
}
// [sinkcheck:cardlook-end]
function renderChat() {
    var log = ui('chatLog');
    if (!log) return;
    var clR = cardLookNow(); if (!window.wpPopout) { _cardLook = clR; _cardSig = JSON.stringify(clR); } paintCardLook(log, clR);
    var frag = document.createDocumentFragment();
    chatLog.forEach(function(m) {
        var node = null;
        try { node = m.roll ? (window.wpDice ? window.wpDice.renderCard(m) : null) : m.apply ? (window.wpDice && window.wpDice.renderApply ? window.wpDice.renderApply(m) : null) : m.due ? (window.wpDice && window.wpDice.renderDue ? window.wpDice.renderDue(m) : null) : chatEntryNode(m); } catch (e) { node = null; }   // one bad entry never blanks the panel
        if (node) frag.appendChild(node);
    });
    log.textContent = ''; log.appendChild(frag);
    log.scrollTop = log.scrollHeight;
    var badge = ui('chatBadge');
    if (badge) {
        badge.style.display = chatUnread > 0 ? 'block' : 'none';
        badge.textContent = chatUnread;
    }
    if (!window.wpPopout) broadcastChatSync();   // mirror the chat to any popped-out chat window (which owns no session of its own)
}
/* Chat pop-out relay: the chat lives in memory here (chatLog) over the live session, so a pop-out window
   (which has no session) mirrors it over BroadcastChannel — the main window broadcasts the log on every
   render, answers a new pop-out's request, and sends on the pop-out's behalf; the pop-out relays its input. */
var _chatBC = null; try { _chatBC = new BroadcastChannel('waypoint'); } catch (e) {}
function broadcastChatSync() { if (!_chatBC || window.wpStream) return; try { _chatBC.postMessage({ type: 'chatSync', log: JSON.parse(JSON.stringify(chatLog)), look: _cardLook }); } catch (e) {} }
if (_chatBC) _chatBC.addEventListener('message', function(e) {
    var d = e.data; if (!d || !d.type || window.wpStream) return;   // the stream window holds no chat of its own: it neither answers nor sends for a pop-out
    if (window.wpPopout) {
        if (d.type === 'chatSync') { chatLog = Array.isArray(d.log) ? d.log : []; _cardLook = d.look || null; renderChat(); }   // the main window's card colours (checked again in cardLookNow)
    } else {
        if (d.type === 'chatReq') broadcastChatSync();
        else if (d.type === 'chatSend') { var ci = ui('chatInput'); if (ci) { ci.value = String(d.text || ''); sendChat(); } }
        else if (d.type === 'dock' && d.kind === 'chat') { var cp = ui('chatPanel'); if (cp && cp.style.display === 'none') { var cb = ui('chatBtn'); if (cb) cb.click(); else cp.style.display = 'flex'; } }
    }
});
window.wpChat = { openPanel: function() { var cp = ui('chatPanel'); if (cp && cp.style.display === 'none') { var cb = ui('chatBtn'); if (cb) cb.click(); else cp.style.display = 'flex'; } },
    lookSync: function() { if (window.wpPopout) return; var cl = cardLookNow(), sg = JSON.stringify(cl); if (sg === _cardSig) return; _cardSig = sg; _cardLook = cl; var lg = ui('chatLog'); if (lg) paintCardLook(lg, cl); broadcastChatSync(); } };   // the system or the sheets switch changed: the cards' colours follow (no card rebuilt)
// A roll opens Table Chat if it was closed; that auto-open dismisses itself after a few seconds (a fresh roll extends
// it). If the chat was already open, or the user opens/touches it, it stays — cancelChatDismiss() clears the flag.
var _chatRollOpened = false, _chatDismissTimer = null;
function cancelChatDismiss() { if (_chatDismissTimer) { clearTimeout(_chatDismissTimer); _chatDismissTimer = null; } _chatRollOpened = false; }
function armChatDismiss() {
    if (_chatDismissTimer) clearTimeout(_chatDismissTimer);
    _chatDismissTimer = setTimeout(function() {
        _chatDismissTimer = null;
        if (!_chatRollOpened) return;
        var p = ui('chatPanel');
        if (p && p.style.display !== 'none') { p.style.display = 'none'; if (window.wpDice) window.wpDice.closePanel(); }
        _chatRollOpened = false;
    }, 6000);
}
function pushChat(m) {
    chatLog.push(m);
    if (chatLog.length > 200) chatLog.shift();
    var panel = ui('chatPanel');
    var closed = !panel || panel.style.display === 'none';
    if ((m.roll || (m.due && !m.due.theirs)) && panel && closed) {   // T2b: a reminder to press surfaces it too (never dismissed by itself)   // a roll always surfaces Table Chat so everyone sees the result (no toast needed then)
        panel.style.display = 'flex'; chatUnread = 0; refreshChatRecipients(); closed = false;
        _chatRollOpened = true;
    }
    if (m.roll && _chatRollOpened) armChatDismiss();   // dismiss the roll-opened chat after a few seconds; a fresh roll re-arms it
    if (closed) {
        if (m.from.id !== net.myId) {
            chatUnread++;
            var line = m.roll ? (window.wpDice ? window.wpDice.line(m) : 'a roll') : m.apply ? applyLine(m.apply) : m.due ? dueLine(m.due) : (m.from.gm ? 'GM' : (m.from.name || 'Player')) + (m.scope === 'whisper' ? ' (private): ' : ': ') + m.text.slice(0, 60);
            toast(String(line).slice(0, 120));
        }
    }
    renderChat();
    if (m.roll && window.wpDice) window.wpDice.landed(m);   // this machine's own dice cue, if wanted
}
function refreshChatRecipients() {
    var sel = ui('chatTo');
    if (!sel) return;
    if (net.role !== 'host') { sel.style.display = 'none'; return; }
    sel.style.display = 'block';
    var cur = sel.value;
    sel.innerHTML = '<option value="">Everyone</option>' + Object.entries(net.roster).map(function(e) {
        return '<option value="' + escTextRoster(e[0]) + '">Whisper: ' + escText(e[1].name || e[1].id) + '</option>';
    }).join('');
    sel.value = cur;
}
function sendChat() {
    var input = ui('chatInput');
    var text = (input.value || '').trim();
    if (!text) return;
    if (window.wpPopout) { try { if (_chatBC) _chatBC.postMessage({ type: 'chatSend', text: text }); } catch (e) {} input.value = ''; return; }   // the pop-out has no session — relay to the main window, which sends and mirrors the result back
    var cmd = DC() ? DC().parseCommand(text) : null;   // /roll, /r, /gmroll, /gr work with or without a session
    if (cmd) { input.value = ''; var rr = window.wpDice ? window.wpDice.roll(cmd.expr, { priv: cmd.cmd === 'gmroll', source: 'chat' }) : net.diceRoll(cmd.expr, { priv: cmd.cmd === 'gmroll' }); if (rr.error) toast(rr.error); return; }
    if (!net.active) { toast('Chat needs an active multiplayer session.'); return; }
    input.value = '';
    var me = getProfile();
    var msg = { type: 'chat', scope: 'global', from: { id: net.myId, name: me.name || (net.role === 'host' ? 'GM' : 'Player'), gm: net.role === 'host' }, text: text, ts: Date.now() };
    if (net.role === 'host') {
        var toKey = ui('chatTo') ? ui('chatTo').value : '';
        if (toKey) {
            msg.scope = 'whisper';
            var target = net.conns.find(function(c) { return c.peer === toKey; });
            if (target && target.open) { try { target.send(msg); } catch (e) { sendFailed(e); } }
        } else {
            broadcast(msg, null);
        }
    } else {
        broadcast(msg, null); // client's only conn is the host, which relays
    }
    pushChat(msg);
    if (net.role === 'host' && msg.scope !== 'whisper') logEvent('chat', 'GM: ' + String(msg.text || '').slice(0, 300));
}

var _chatBtn = ui('chatBtn');
if (_chatBtn) _chatBtn.addEventListener('click', function() {
    cancelChatDismiss();   // the user is driving the chat now — no auto-dismiss
    var panel = ui('chatPanel');
    var opening = panel.style.display === 'none';
    panel.style.display = opening ? 'flex' : 'none';
    if (opening) { chatUnread = 0; refreshChatRecipients(); renderChat(); var i = ui('chatInput'); if (i) i.focus(); }
});
// touching the chat or the dice roller cancels the roll auto-dismiss (the player is reading / rolling)
['chatPanel', 'dicePanel'].forEach(function(id) { var p = ui(id); if (p) { p.addEventListener('pointerdown', cancelChatDismiss); p.addEventListener('focusin', cancelChatDismiss); } });
var _chatClose = ui('chatCloseBtn');
if (_chatClose) _chatClose.addEventListener('click', function() { cancelChatDismiss(); ui('chatPanel').style.display = 'none'; });
var _chatSend = ui('chatSendBtn');
if (_chatSend) _chatSend.addEventListener('click', sendChat);
var _chatPop = ui('chatPop');   // pop the chat out into its own window (mirrored + relayed); dock-back reopens this panel
if (_chatPop) _chatPop.addEventListener('click', function() {
    window.open(location.origin + '/?popout=chat:', 'wpPopout_chat', 'width=440,height=760');
    var cp = ui('chatPanel'); if (cp) cp.style.display = 'none';
});
var _chatInput = ui('chatInput');
if (_chatInput) _chatInput.addEventListener('keydown', function(e) { e.stopPropagation(); if (e.key === 'Enter') sendChat(); });

/* ---------- player history & ban list ---------- */
function fmtDay(ts) {
    if (!ts) return '—';
    var d = new Date(ts);
    return d.toLocaleDateString() + ' ' + (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
}

// "plays Brakka · also Wolf": the character in play and the kept ones (else the old name binding, as before)
function playsLabel(camp, pid, p) {
    var S = SC(), a = S && S.activeCharOf ? S.activeCharOf(camp, pid) : { id: null }, nm = (camp && camp.chars && typeof a.id === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, a.id) ? camp.chars[a.id] : null) ? (camp && camp.chars && typeof a.id === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, a.id) ? camp.chars[a.id] : null).name : (p.charName || '');
    if (!nm) return '';
    var also = a.id && S.playableChars ? S.playableChars(camp, pid).filter(function(c) { return c.id !== a.id; }).map(function(c) { return c.name; }) : [];
    return ' <span class="player-char">' + (a.id ? 'plays ' : 'as ') + escTextRoster(nm) + (also.length ? ' \u00B7 also ' + escTextRoster(also.join(', ')) : '') + '</span>';
}
function renderPlayersPanel() {
    var list = ui('playersList');
    if (!list) return;
    var camp = getActiveCampaign();
    if (!camp) { list.innerHTML = '<div class="players-empty">No campaign open.</div>'; return; }
    var players = camp.players || {};
    var bans = camp.bannedPlayers || {};
    var online = {};
    Object.values(net.roster).forEach(function(p) { if (p) online[p.id] = true; });

    var html = '';
    var ids = Object.keys(players);
    html += '<div class="players-section">Known players (' + ids.length + ')</div>';
    if (!ids.length) html += '<div class="players-empty">No one has joined this campaign yet.</div>';
    ids.sort(function(a, b) { return (players[b].lastSeen || 0) - (players[a].lastSeen || 0); });
    ids.forEach(function(pid) {
        var p = players[pid];
        var isBanned = !!bans[pid];
        html += '<div class="player-row' + (isBanned ? ' banned' : '') + '">' +
            '<img class="roster-avatar" src="' + (window.wpDefaultAvatar ? window.wpDefaultAvatar(p.color || ('hsl(' + playerHue(pid) + ',55%,60%)')) : '') + '" alt="">' +   // no photo → the color-tinted silhouette default (the name shows beside it)
            '<div class="player-info">' +
                '<div><b>' + escTextRoster(p.name || pid) + '</b>' +
                (online[pid] ? ' <span class="player-online">● online</span>' : '') +
                (isBanned ? ' <span class="player-bantag">BANNED</span>' : '') +
                playsLabel(camp, pid, p) + '</div>' +
                '<div class="player-meta">first ' + fmtDay(p.firstSeen) + ' · last ' + fmtDay(p.lastSeen) + ' · ' + countOf(p.joinCount) + ' join' + (countOf(p.joinCount) === 1 ? '' : 's') + '</div>' +
            '</div>' +
            (isBanned
                ? '<button class="tool ghost player-act" data-unban="' + escTextRoster(pid) + '">Unban</button>'
                : '<button class="tool ghost player-act" data-ban="' + escTextRoster(pid) + '">Ban</button>') +
            '<button class="tool ghost player-act" data-forget="' + escTextRoster(pid) + '" title="Remove from history — they\'ll need approval to join again">Forget</button>' +
            '</div>';
    });

    // bans for players no longer in (or never in) the history
    var strayBans = Object.keys(bans).filter(function(pid) { return !players[pid]; });
    if (strayBans.length) {
        html += '<div class="players-section">Banned (no longer in history)</div>';
        strayBans.forEach(function(pid) {
            html += '<div class="player-row banned">' +
                '<span class="roster-dot" style="background:#555;">✕</span>' +
                '<div class="player-info"><div><b>' + escTextRoster(bans[pid].name || pid) + '</b> <span class="player-bantag">BANNED</span></div>' +
                '<div class="player-meta">banned ' + fmtDay(bans[pid].bannedAt) + '</div></div>' +
                '<button class="tool ghost player-act" data-unban="' + escTextRoster(pid) + '">Unban</button></div>';
        });
    }
    list.innerHTML = html;
}

// [netcheck:forget-start]
// Players panel ▸ Forget: asked first. The record goes for good — a player at the table right now plays on, but nothing brings the record
// back this session (net.forgotten, read by syncLastMaps), so their next join waits for the GM's Allow like a stranger's.
function forgetPlayer(camp, fid) {
    if (!camp || !camp.players || !own(camp.players, fid)) return;
    var nm = camp.players[fid].name || 'Player', here = Object.values(net.roster).some(function(p) { return p && p.id === fid; });
    var mkIds = function() { return Object.keys(camp.chars || {}).filter(function(k) { var x = camp.chars[k]; return x && x.ownerId === fid && x.making === 1; }); };   // Onboarding F3b: a character they are still making was theirs alone: it goes with them
    showConfirm('Forget ' + nm + '? Their history in this campaign goes, and they\'ll need your approval to join again.' + (mkIds().length ? ' The character they are still making goes too.' : '') + (here ? ' They stay at the table for now.' : ''), function(yes) {
        if (!yes || getActiveCampaign() !== camp || !camp.players || !own(camp.players, fid)) { renderPlayersPanel(); return; }
        delete camp.players[fid];
        net.forgotten[fid] = true;
        delete approvedIds[fid];   // a one-time "go straight in" still waiting goes too: their next join is asked about
        waitingChanged(camp, removeWaiting(camp, fid));   // Onboarding F1a: and their waiting token
        mkIds().forEach(function(k) { delete camp.chars[k]; net.syncCharGone(k, fid); });
        save();
        var keptC = SC() && SC().playableChars ? SC().playableChars(camp, fid).length : 0;   // Onboarding F0: their characters stay theirs until the GM unassigns them
        toast(nm + ' forgotten — they\'ll need approval to join again.' + (keptC ? ' Their character' + (keptC === 1 ? ' stays' : 's stay') + ' assigned: unassign ' + (keptC === 1 ? 'it' : 'them') + ' in System \u25B8 Characters if they aren\u2019t coming back.' : ''));
        renderPlayersPanel();
    });
}
// [netcheck:forget-end]

var _playersBtn = ui('netPlayersBtn');
if (_playersBtn) _playersBtn.addEventListener('click', function() {
    renderPlayersPanel();
    ui('playersModal').style.display = 'flex';
});
var _playersClose = ui('playersCloseBtn');
if (_playersClose) _playersClose.addEventListener('click', function() { ui('playersModal').style.display = 'none'; });

var _playersList = ui('playersList');
if (_playersList) _playersList.addEventListener('click', function(e) {
    var btn = e.target.closest('.player-act');
    if (!btn) return;
    var camp = getActiveCampaign();
    if (!camp) return;
    if (btn.dataset.ban) {
        var pid = btn.dataset.ban;
        camp.bannedPlayers = camp.bannedPlayers || {};
        camp.bannedPlayers[pid] = { name: (camp.players[pid] || {}).name || pid, bannedAt: Date.now() };
        // if they're at the table right now, they leave with the ban
        if (net.active && net.role === 'host') {
            var key = Object.keys(net.roster).find(function(k) { return net.roster[k] && net.roster[k].id === pid; });
            if (key) net.kickPlayer(key);
            dropWaitingFor(pid);   // Onboarding F1a: their waiting token goes at once, even inside the grace after they left
        }
        save();
        toast((camp.bannedPlayers[pid].name || 'Player') + ' banned from this campaign.');
    } else if (btn.dataset.unban) {
        var uid2 = btn.dataset.unban;
        var nm3 = (camp.bannedPlayers && camp.bannedPlayers[uid2] && camp.bannedPlayers[uid2].name) || 'Player';
        if (camp.bannedPlayers) delete camp.bannedPlayers[uid2];
        delete bannedIds[uid2];   // an explicit unban lifts the session ban too
        save();
        toast(nm3 + ' unbanned.');
    } else if (btn.dataset.forget) {
        forgetPlayer(camp, btn.dataset.forget);
        return;   // the panel redraws once the GM answers
    }
    renderPlayersPanel();
});

/* ---------- wire up the modal ---------- */
var _netBtn = ui('netBtn');
if (_netBtn) _netBtn.addEventListener('click', function() {
    var p = getProfile();
    var nameEl = ui('netNameInput');
    if (nameEl && !nameEl.value) nameEl.value = p.name || '';
    refreshStageSelect();
    syncSessionButtons();
    ui('netModal').style.display = 'flex';
});
var _netClose = ui('netCloseBtn');
if (_netClose) _netClose.addEventListener('click', function() { ui('netModal').style.display = 'none'; });
// Required identity: a name must be set (typed here or saved in Settings) before hosting or joining,
// so every player is known by a stable name at the table.
function ensureNamed() {
    var el = ui('netNameInput');
    var typed = (el && el.value || '').trim();
    if (typed) { setProfileName(typed); return true; }
    if ((getProfile().name || '').trim()) return true;
    toast('Enter your name first — that is how players know you at the table.');
    if (el && el.offsetParent !== null) el.focus();
    else if (window.wpOpenSettings) window.wpOpenSettings('profile', 'setNameInput');
    return false;
}
var _hostBtn = ui('netHostBtn');
if (_hostBtn) _hostBtn.addEventListener('click', function() { if (!ensureNamed()) return; startHosting(false); });   // (passing the event made every host "force fresh": the old code was never resumed)
var _joinBtn = ui('netJoinBtn');
if (_joinBtn) _joinBtn.addEventListener('click', function() {
    var code = (ui('netCodeInput').value || '').trim();
    if (code.length < 4) { toast('Enter the room code.'); return; }
    if (!ensureNamed()) return;
    joinSession(code, (ui('netNameInput').value || '').trim());
});
var _leaveBtn = ui('netLeaveBtn');
if (_leaveBtn) _leaveBtn.addEventListener('click', function() { net.leaveSessionConfirm(); });

/* ---------- Refresh: reload without losing the session ---------- */
var _refreshBtn = ui('refreshBtn');
if (_refreshBtn) _refreshBtn.addEventListener('click', function() {
    try {
        if (net.active && net.role === 'client') sessionStorage.setItem('wp_rejoin', JSON.stringify({ code: net.code, name: getProfile().name || '', pass: (ui('netJoinPassInput') || {}).value || '' }));
        else if (net.active && net.role === 'host') sessionStorage.setItem('wp_rehost', '1');
    } catch (e) {}
    location.reload();
});
// after a refresh: straight back to where you were
setTimeout(function() {
    var rj = null, rh = null;
    try { rj = sessionStorage.getItem('wp_rejoin'); rh = sessionStorage.getItem('wp_rehost'); sessionStorage.removeItem('wp_rejoin'); sessionStorage.removeItem('wp_rehost'); } catch (e) {}
    if (rj) {
        try {
            var j = JSON.parse(rj);
            if (j && j.code) {
                var ci = ui('netCodeInput'), ni = ui('netNameInput'), pi = ui('netJoinPassInput');
                if (ci) ci.value = j.code; if (ni && j.name) ni.value = j.name; if (pi) pi.value = j.pass || '';
                toast('Refreshed — rejoining the table…');
                joinSession(j.code, j.name);
            }
        } catch (e) {}
    } else if (rh) {
        toast('Refreshed — resuming your table with the same room code…');
        startHosting(false);
    }
}, 1200);
/* The GM gets one clear "End Session for Everyone" (the host's Leave was the same
   teardown, but its label read like a player's exit). Players keep Leave Session. */
function syncSessionButtons() {
    var cbtn = ui('chatBtn');
    var diceOn = !!(window.wpVtt && window.wpVtt.on('dice'));
    if (cbtn) { cbtn.classList.toggle('needs-session', !net.active && !diceOn); cbtn.dataset.tip = net.active ? 'Table chat and dice' : diceOn ? 'Table chat and dice — chat needs a session; dice roll here anyway' : 'Table chat — needs a session (host or join one first)'; cbtn.removeAttribute('title'); }
    var hosting = !!(net.active && net.role === 'host');
    var endB = ui('netEndBtn'), leaveB = ui('netLeaveBtn');
    if (endB) endB.style.display = hosting ? 'block' : 'none';
    if (leaveB) leaveB.style.display = hosting ? 'none' : 'block';
    var pauseHdr = ui('sessionPauseBtn');
    if (pauseHdr) pauseHdr.style.display = hosting ? '' : 'none';   // the header pause button is a host-only session control
    refreshPauseUi();   // keep its label in step whenever the session buttons resync
}
var _endBtn = ui('netEndBtn');
if (_endBtn) _endBtn.addEventListener('click', function() {
    if (!net.active || net.role !== 'host') { syncSessionButtons(); return; }
    var n = net.conns.length;
    import('./dialogs.js').then(function(d) {
        d.showConfirm('End the session for everyone?' + (n ? ' ' + n + ' player' + (n === 1 ? '' : 's') + ' will be told the session ended and returned to their own campaigns.' : '') + ' The room code is retired.', function(yes) {
            if (!yes) return;   // Cancel and Esc keep the table running
            leaveSession(false);
            ui('netModal').style.display = 'none';
        });
    });
});
syncSessionButtons();
// [netcheck:stage-start]
// Host: one connection's player is put on a stage — the table's follow, or a summon (personal: it also ends a detour). Admitted peers
// only: a connection still waiting for the GM's Allow has no roster entry and hears nothing of the table, not even where it is.
function stageConn(c, stage, personal) {
    var p = own(net.roster, c.peer) ? net.roster[c.peer] : null;
    if (!p) return null;
    if (personal) p.detached = false;
    p.location = stage.itemId; ensurePlayerToken(p.id, stage.itemId);
    if (c.open) { try { c.send(personal ? { type: 'stage', stage: stage, personal: true } : { type: 'stage', stage: stage }); } catch (e) { sendFailed(e); } }
    if (c.open && net.sendFxArrival) net.sendFxArrival(c, stage.itemId);
    return p;
}
// Bring one connection's player to a map (the table's stage, or the one the GM is viewing)
function summonConn(c, stage) { return stageConn(c, stage, true); }
// The table follows the GM: every admitted player still following moves, a detached wanderer stays put. Returns how many moved.
function followConns(stage) {
    var moved = 0;
    net.conns.forEach(function(c) { var p = own(net.roster, c.peer) ? net.roster[c.peer] : null; if (!p || p.detached) return; stageConn(c, stage, false); moved++; });
    return moved;
}
// [netcheck:stage-end]
net.summonPlayer = function(peerKey) {
    if (!net.active || net.role !== 'host') return;
    var stage = currentStage();
    var c = net.conns.find(function(x) { return x.peer === peerKey; });
    if (!stage || !c) return;
    var p = summonConn(c, stage);
    renderRoster();
    broadcastRoster();
    toast((p && p.name ? p.name : 'Player') + ' summoned to your map.');
};
net.summonPlayerById = function(playerId) {
    var key = Object.keys(net.roster).find(function(k) { return net.roster[k] && net.roster[k].id === playerId; });
    if (!key) { toast('That player is not connected right now.'); return false; }
    net.summonPlayer(key);
    return true;
};
net.summonAll = function() { var b = ui('netSummonBtn'); if (b) b.click(); };
// The map players currently arrive on / follow to (pinned override, else the GM's map). Lets the
// party menu tell "the table's map" apart from "the map I'm looking at" when they differ.
net.stagedMapId = function() { var s = currentStage(); return s ? s.itemId : null; };
// Summon ONE connected player to a specific map (the one the GM is viewing), leaving the table's
// pinned map and everyone else untouched — a "scout ahead" move.
net.summonPlayerToMap = function(playerId, mapId) {
    if (!net.active || net.role !== 'host') return false;
    var camp = getActiveCampaign();
    if (!camp || !camp.items[mapId] || camp.items[mapId].type !== 'map') { toast('Open a play map first.'); return false; }
    var key = Object.keys(net.roster).find(function(k) { return net.roster[k] && net.roster[k].id === playerId; });
    if (!key) { toast('That player is not connected right now.'); return false; }
    var c = net.conns.find(function(x) { return x.peer === key; });
    if (!c) return false;
    var p = summonConn(c, { campId: camp.id, itemId: mapId });
    renderRoster();
    broadcastRoster();
    toast((p && p.name ? p.name : 'Player') + ' summoned to ' + ((camp.items[mapId].meta && camp.items[mapId].meta.title) || 'this map') + '.');
    return true;
};
// Summon EVERYONE to a specific map and re-pin the table there, so the follow model stays coherent
// (the whole table is now on this map — late joiners and Follow-me should land here too).
net.summonAllToMap = function(mapId) {
    if (!net.active || net.role !== 'host') return false;
    var camp = getActiveCampaign();
    if (!camp || !camp.items[mapId] || camp.items[mapId].type !== 'map') { toast('Open a play map first.'); return false; }
    net.stageMode = null;
    net.stageOverride = mapId;                                              // pin the table to this map
    net.stagePicked[camp.id] = { mode: null, fallback: net.stageFallback }; // the GM chose; stop defaulting
    Object.values(net.roster).forEach(function(p) { if (p) p.detached = false; });   // everyone follows again
    refreshStageSelect();
    var stage = { campId: camp.id, itemId: mapId };
    net.conns.forEach(function(c) { summonConn(c, stage); });
    renderRoster();
    broadcastRoster();
    toast('Everyone summoned to ' + ((camp.items[mapId].meta && camp.items[mapId].meta.title) || 'this map') + '; table pinned here.');
    return true;
};
// Host: send the players a fresh copy of these maps (after a lock change, say)
net.pushItems = function(ids) {
    if (!(net.active && net.role === 'host')) return;
    var camp = getActiveCampaign(); if (!camp) return;
    (ids || []).forEach(function(id) { if (camp.items[id]) net.broadcastItemFiltered(camp.id, id); });
};
net.logEvent = logEvent;
net.syncSessionButtons = syncSessionButtons;
(function() {
    var b = ui('netCombatBtn'); if (!b) return;
    b.addEventListener('click', function() {
        if (!(net.active && net.role === 'host')) { toast('Host a session first — combat runs at the table.'); return; }
        var camp = getActiveCampaign(), am = camp && camp.items[camp.activeItemId];
        if (!am || am.type !== 'map') { toast('Open the play map the fight is on first.'); return; }
        ui('netModal').style.display = 'none';
        if (window.wpOpenCombat) window.wpOpenCombat(am.id, {});
    });
})();
// Session Log window
var _logKinds = { session: 'Session', player: 'Players', handout: 'Handouts', travel: 'Travel', share: 'Shares', chat: 'Chat', dice: 'Dice', table: 'Table', items: 'Items', char: 'Characters', time: 'Time' };
function fmtLogTime(ts) { var d = new Date(ts); return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
net.openSessionLog = function() {
    var m = ui('sessionLogModal'), list = ui('sessionLogList'), sel = ui('sessionLogKind'); if (!m || !list) return;
    var camp = getActiveCampaign(); if (!camp) return;
    var kind = sel ? sel.value : '';
    var log = (camp.sessionLog || []).filter(function(e) { return !kind || e.kind === kind || e.kind === 'session'; });
    if (!log.length) { list.innerHTML = '<div style="color:var(--dim); padding:12px; line-height:1.5;">Nothing logged yet. Host a session and the table\'s events — joins, handouts, crossings, chat, shares — are written here as they happen.</div>'; }
    else {
        // grouped by session, newest session first; inside a session the newest line is at the top
        var groups = [], cur = null;
        log.forEach(function(e) {
            if (e.kind === 'session' && /started|resumed/.test(e.text)) { cur = { head: e, rows: [] }; groups.push(cur); return; }
            if (!cur) { cur = { head: null, rows: [] }; groups.push(cur); }
            cur.rows.push(e);
        });
        function hm(ts) { return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
        var html = '';
        groups.slice().reverse().forEach(function(g) {
            var ended = g.rows.filter(function(e) { return e.kind === 'session'; }).pop();
            var when = g.head ? new Date(g.head.at).toLocaleDateString() + ' ' + hm(g.head.at) : (g.rows[0] ? new Date(g.rows[0].at).toLocaleDateString() : '');
            html += '<div class="log-session">' + escText(when) + ' · ' + escText(g.head ? g.head.text : 'Between sessions') + (ended ? ' <span class="log-ended">→ ended ' + escText(hm(ended.at)) + '</span>' : '') + '</div>';
            g.rows.slice().reverse().forEach(function(e) {
                if (e.kind === 'session') return;
                html += '<div class="log-row"><span class="log-time">' + escText(hm(e.at)) + '</span><span class="log-kind k-' + (Object.prototype.hasOwnProperty.call(_logKinds, e.kind) ? e.kind : 'other') + '">' + escText(_logKinds[e.kind] || e.kind) + '</span><span class="log-text">' + escText(e.text) + '</span></div>';
            });
        });
        list.innerHTML = html;
    }
    m.style.display = 'flex';
};
(function() {
    var sel = ui('sessionLogKind'); if (sel) sel.addEventListener('change', function() { net.openSessionLog(); });
    var close = ui('sessionLogClose'); if (close) close.addEventListener('click', function() { ui('sessionLogModal').style.display = 'none'; });
    var open = ui('netLogBtn'); if (open) open.addEventListener('click', function() { net.openSessionLog(); });
    var saveB = ui('sessionLogSave'); if (saveB) saveB.addEventListener('click', function() {
        var camp = getActiveCampaign(); if (!camp) return;
        var lines = (camp.sessionLog || []).map(function(e) { return fmtLogTime(e.at) + '  [' + (_logKinds[e.kind] || e.kind) + ']  ' + e.text; });
        var blob = new Blob([(camp.name || 'Campaign') + ' — session log\n\n' + lines.join('\n') + '\n'], { type: 'text/plain' });
        var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (camp.name || 'campaign').replace(/[^A-Za-z0-9]+/g, '-').toLowerCase() + '-session-log.txt';
        document.body.appendChild(a); a.click(); setTimeout(function() { URL.revokeObjectURL(a.href); a.remove(); }, 500);
        toast('Session log saved as text.');
    });
    var clearB = ui('sessionLogClear'); if (clearB) clearB.addEventListener('click', function() {
        var camp = getActiveCampaign(); if (!camp || !(camp.sessionLog || []).length) return;
        (function() { showConfirm('Clear the session log for ' + (camp.name || 'this campaign') + '? ' + camp.sessionLog.length + ' lines go. Save it as text first if you want to keep it.', function(yes) { if (!yes) return; camp.sessionLog = []; save(true); net.openSessionLog(); }); })();
    });
})();
net.togglePause = function() { var b = ui('netPauseBtn'); if (b) b.click(); };
net.toggleTravelLock = function() { var b = ui('netTravelLockBtn'); if (b) b.click(); };
net.endSession = function() { var b = ui('netEndBtn'); if (b) b.click(); };   // asks first, like the panel
if (!net.leaveSession) net.leaveSession = leaveSession;
// Leave, with a confirm (panel button and the play-map menu both use this)
net.leaveSessionConfirm = function() {
    if (!net.active && !net.foreign) return;
    import('./dialogs.js').then(function(d) {
        d.showConfirm('Leave the session? Your own campaign comes back on screen. You can rejoin with the same room code.', function(yes) {
            if (!yes) return;   // Cancel and Esc stay at the table
            leaveSession(false);
            var nm = ui('netModal'); if (nm) nm.style.display = 'none';
        });
    });
};
// Between sessions (or for a player who is not connected): move that player's token to a point on
// the active map, taking it off whichever map it was on. Connected players are summoned instead.
net.bringPlayerHere = function(pid, wbX, wbY) {
    if (net.active && net.role === 'host' && Object.keys(net.roster).some(function(k) { return net.roster[k] && net.roster[k].id === pid; })) return net.summonPlayerById(pid);
    var camp = getActiveCampaign(); var map = camp && getActiveMap();
    if (!camp || !map || map.type !== 'map') { toast('Open a play map first.'); return false; }
    var pl = own(camp.players, pid) ? camp.players[pid] : {}, name = pl.name || 'that player', S = SC();
    if (!S || !S.tokenSourceFor) return false;
    map.whiteboard = map.whiteboard || [];
    healBindings(camp);
    var src = S.tokenSourceFor(camp, pid, map.id, { noSpawn: !sheetsOnFor(camp) }), tok = null, copied = false;   // the one resolver (ensurePlayerToken's)
    if (src.op === 'keep') tok = src.tok;
    else if (src.op === 'adopt' || (src.op === 'link' && src.here)) { tok = src.tok; tok.ownerId = pid; if (src.charId) tok.charId = src.charId; }
    else if (src.op === 'clone' || src.op === 'link') { tok = JSON.parse(JSON.stringify(src.tok)); tok.id = 'wb' + Math.random().toString(36).slice(2, 10); delete tok.threats; tok.ownerId = pid; if (src.charId) tok.charId = src.charId; map.whiteboard.push(tok); copied = true; }   // 5h: threat marks belong to the map they were set on
    else if (src.op === 'spawn' && (camp && camp.chars && typeof src.charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, src.charId) ? camp.chars[src.charId] : null)) { tok = tokenFromChar((camp && camp.chars && typeof src.charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, src.charId) ? camp.chars[src.charId] : null), pid); map.whiteboard.push(tok); copied = true; }
    if (!tok) { toast('No token for ' + name + ' yet \u2014 give them a character (System \u25B8 Characters) or a token (its Properties \u25B8 Player Owner).'); return false; }
    if (copied && S.shapeStandIn) S.shapeStandIn(tok, map);   // grid-shaped tokens: a new token or a copy takes this map's cell shape
    tok.x = wbX - (tok.w || 60) / 2; tok.y = wbY - (tok.h || 52) / 2;
    delete tok.hidden;
    if (window.wpSeatCell) window.wpSeatCell(tok, map); else if (window.wpSeatHex) window.wpSeatHex(tok, map);
    S.applyOwnerOps(camp, S.ownedTokenPlan(camp, { keep: tok.id, mapId: map.id, all: !sheetsOnFor(camp) }));   // one owned token of the character on this map
    save(true);
    if (window.appRender) window.appRender();
    if (net.active && net.role === 'host') net.broadcastItemFiltered(camp.id, map.id);
    toast(name + (copied ? ' placed on ' : ' moved here on ') + ((map.meta || {}).title || 'this map') + '.');
    return true;
};// Host: after a give, a switch of the character in play, or a character taken away, the token of the player's CURRENT map follows (the
// one resolver + the chooser: adopted, copied or made beside the token they had). Nothing for a player who is not connected — their next
// arrival resolves it. o: { keep, near }
net.reconcilePresence = function(pid, o) {
    if (!net.active || net.role !== 'host') return false;
    var p = Object.values(net.roster).find(function(x) { return x && x.id === pid; });
    if (!p || typeof p.location !== 'string') return false;
    return ensurePlayerToken(pid, p.location, null, { keep: o && o.keep, near: o && o.near });
};
net.isConnected = function(playerId) { return Object.values(net.roster).some(function(p) { return p && p.id === playerId; }); };
var _summonBtn = ui('netSummonBtn');
if (_summonBtn) _summonBtn.addEventListener('click', function() {
    if (!net.active || net.role !== 'host') return;
    var stage = currentStage();
    if (!stage) return;
    net.conns.forEach(function(c) { summonConn(c, stage); });
    renderRoster();
    broadcastRoster();
    toast('All players summoned to your map.');
});
var _copyBtn = ui('netCopyBtn');
if (_copyBtn) _copyBtn.addEventListener('click', function() {
    if (net.code && navigator.clipboard) { navigator.clipboard.writeText(net.code.toUpperCase()); toast('Room code copied.'); }
});

export { net };
