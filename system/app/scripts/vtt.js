/* VTT settings: which of the table's VTT features are on — token elevation, token posture, the minimap.
   Three tiers, one gate.
   - Per campaign: camp.vtt = { v, master, features: { id: bool } } lives in data.json with the campaign,
     seeded from the default when the campaign is made (models.js createNewCampaign) and filled once at
     load for saves that predate it (io.js migrateAppState, no toast). "VTT integration" is the master:
     off means the plain whiteboard, every feature resolves off, the per-feature values are kept.
   - The default for new campaigns: wp_vtt_global in localStorage (mirrored to preferences.json like the
     other wp_* settings). It falls back to the 1.4.6 keys wp_elevation / wp_posture, which are read as a
     seed forever and never written again. Changing it touches no existing campaign; "Apply to existing
     campaigns…" is the one explicit way to copy it onto chosen campaigns.
   - At someone else's table: the GM's campaign settings are the ceiling. They ride the join snapshot and
     the stance message into session memory (net.stance / net.stanceCamps) — never into the player's
     state or preferences. A player can switch a feature off for themselves at that table, never on when
     the GM has it off; the choice is kept per table in one capped key, wp_vtt_local. Nothing from a
     table ever writes wp_vtt_global or any of the player's own campaigns.
   on(f) is the only effective-value gate: whiteboard.js stanceOn, the inspector, the blast tool, the
   ShadowBase bridge and the minimap all funnel through it. The campaign branch never allocates (it runs
   per token per render). Loaded before main.js; reads window.wpNet only at call time. */
import { state } from './state.js';

var FEATURES = [
    { id: 'elevation', label: 'Token elevation', legacyKey: 'wp_elevation' },
    { id: 'posture',   label: 'Token posture',   legacyKey: 'wp_posture' },
    { id: 'minimap',   label: 'Minimap',         legacyKey: null },         // on unless switched off; no 1.4.6 key
    { id: 'sound',     label: 'Sound',           legacyKey: null },         // 1.5.0: ambient loops and cues at the table
    { id: 'dice',      label: 'Dice',            legacyKey: null }          // 1.5.0: rolls at the table
];
var GLOBAL_KEY = 'wp_vtt_global', LOCAL_KEY = 'wp_vtt_local', MAX_TABLES = 50;
var KEY_RE = /^[A-Za-z0-9_-]{1,160}$/;   // the part of a table key after "t:", and a campaign id in a stance map

function toast(msg) { if (window.appToast) window.appToast(msg); }
function net() { return window.wpNet || null; }
function activeCamp() { var a = state.appState; return (a && a.campaigns && a.campaigns[a.activeCampaignId]) || null; }
function featureById(id) { for (var i = 0; i < FEATURES.length; i++) if (FEATURES[i].id === id) return FEATURES[i]; return null; }
function labelOf(id) { var f = featureById(id); return f ? f.label : id; }
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
// Every write is read back: a full or blocked storage must not report success
function lsSet(k, v) { try { localStorage.setItem(k, v); return localStorage.getItem(k) === v; } catch (e) { return false; } }
function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }

/* ---------- where am I: solo, hosting, waiting for a GM, at a table, or the stream window ---------- */
function mode() {
    var n = net();
    if (!n) return 'solo';
    if (n.stream) return 'stream';
    if (n.foreign) return 'client';
    if (n.active && n.role === 'client') return 'awaiting';
    if (n.active && n.role === 'host') return 'host';
    return 'solo';
}
// The write gate for campaign settings and the default: whatever blocks a write to data.json blocks these
function locked() {
    if (window.wpCanPersistLocal) return !window.wpCanPersistLocal();
    var m = mode(); return m !== 'solo' && m !== 'host';
}

/* ---------- the default for new campaigns (wp_vtt_global) ---------- */
var _gCache = { raw: undefined, val: null };
function parseGlobal(raw) {
    if (typeof raw !== 'string' || !raw) return null;
    var p = null; try { p = JSON.parse(raw); } catch (e) { return null; }
    return isObj(p) ? p : null;
}
function globalParsed() { var raw = lsGet(GLOBAL_KEY); if (raw !== _gCache.raw) { _gCache.raw = raw; _gCache.val = parseGlobal(raw); } return _gCache.val; }
function legacyOn(f) { if (!f || !f.legacyKey) return true; var v = lsGet(f.legacyKey); return v !== 'off'; }
// Shape-validated per feature: a hand-edited or damaged value falls back for that feature alone, never throws
function globalFeature(f, p) { return (p && isObj(p.features) && typeof p.features[f.id] === 'boolean') ? p.features[f.id] : legacyOn(f); }
function globalMaster(p) { return (p && typeof p.master === 'boolean') ? p.master : true; }
function globalVtt() {
    var p = globalParsed(), out = { v: 1, master: globalMaster(p), features: {} };
    FEATURES.forEach(function(f) { out.features[f.id] = globalFeature(f, p); });
    return out;
}
// The default's per-feature value alone (no master): what fill() writes for a missing key
function globalFeatureOn(id, p) {
    var f = featureById(id);
    return f ? globalFeature(f, p) : ((p && isObj(p.features) && typeof p.features[id] === 'boolean') ? p.features[id] : true);
}
function globalOn(id) {
    var p = globalParsed();
    if (!globalMaster(p)) return false;
    return globalFeatureOn(id, p);
}
function writeGlobal(g) {
    var s = JSON.stringify(g);
    if (!lsSet(GLOBAL_KEY, s)) { toast('Could not save that setting.'); return false; }
    return true;
}
// Before the default moves, every own campaign carries its own full set, so nothing follows the default by accident
function materialise() {
    var a = state.appState, changed = false;
    if (a && a.campaigns) Object.keys(a.campaigns).forEach(function(id) { if (fill(a.campaigns[id])) changed = true; });
    if (changed && window.wpSave) window.wpSave(true);
}
function setGlobal(id, on) {
    if (locked()) { toast('Not while you\'re at someone else\'s table.'); return false; }
    if (!featureById(id)) return false;
    materialise();
    var g = globalVtt();   // the first write seeds every feature from its fallback, so nothing else flips
    g.features[id] = !!on;
    if (!writeGlobal(g)) return false;
    changed('global');
    return true;
}
function setGlobalMaster(on) {
    if (locked()) { toast('Not while you\'re at someone else\'s table.'); return false; }
    materialise();
    var g = globalVtt(); g.master = !!on;
    if (!writeGlobal(g)) return false;
    changed('global');
    return true;
}

/* ---------- per campaign (camp.vtt) ---------- */
// Read rule: a plain camp.vtt with master false → off; a boolean feature value → that; a missing key under the
// campaign's own master → the default's per-feature value (exactly what fill() would write for it); no camp.vtt
// or no master of its own → the default with its master folded in (what fill() would write for master, then
// the feature). The fallback exists for states that bypassed the factory and the fill (an older host's snapshot,
// the stream tick), and it must read the same before and after the fill.
function campaignOn(id, camp) {
    if (!camp) camp = activeCamp();
    var v = camp && camp.vtt;
    if (v && typeof v === 'object') {
        if (v.master === false) return false;
        var ft = v.features;
        if (ft && typeof ft === 'object' && typeof ft[id] === 'boolean') return ft[id];
        if (v.master === true) return globalFeatureOn(id, globalParsed());
    }
    return globalOn(id);
}
function campaignMaster(camp) {
    if (!camp) camp = activeCamp();
    var v = camp && camp.vtt;
    return (v && typeof v === 'object' && typeof v.master === 'boolean') ? v.master : globalVtt().master;
}
// A fresh cleaned copy for the UI, the push and debug: the roster's ids only, booleans only
function campaignVtt(camp) {
    if (!camp) camp = activeCamp();
    var out = { v: 1, master: campaignMaster(camp), features: {} }, v = camp && camp.vtt, ft = v && typeof v === 'object' && v.features;
    FEATURES.forEach(function(f) { out.features[f.id] = (ft && typeof ft === 'object' && typeof ft[f.id] === 'boolean') ? ft[f.id] : globalFeature(f, globalParsed()); });
    return out;
}
// Add what is missing — vtt itself, master, every roster feature — and leave the rest alone. No toast, no
// schema bump: the fill persists with the next ordinary save. Returns true when it wrote something.
function fill(camp) {
    if (!camp || typeof camp !== 'object') return false;
    var changed = false, g = null;
    if (!isObj(camp.vtt)) { camp.vtt = { v: 1 }; changed = true; }
    var v = camp.vtt;
    if (typeof v.v !== 'number') { v.v = 1; changed = true; }
    if (typeof v.master !== 'boolean') { g = g || globalVtt(); v.master = g.master; changed = true; }
    if (!isObj(v.features)) { v.features = {}; changed = true; }
    FEATURES.forEach(function(f) { if (typeof v.features[f.id] !== 'boolean') { g = g || globalVtt(); v.features[f.id] = g.features[f.id]; changed = true; } });
    return changed;
}
function fillAll(appState) {
    var a = appState || state.appState, changed = false;
    if (a && a.campaigns) Object.keys(a.campaigns).forEach(function(id) { if (fill(a.campaigns[id])) changed = true; });
    return changed;
}
function allOn() { var out = { v: 1, master: true, features: {} }; FEATURES.forEach(function(f) { out.features[f.id] = true; }); return out; }
function setCampaign(id, on) {
    if (locked()) { toast('Not while you\'re at someone else\'s table.'); return false; }
    var camp = activeCamp(); if (!camp || !featureById(id)) return false;
    fill(camp);
    camp.vtt.features[id] = !!on;
    if (window.wpSave) window.wpSave(true);
    changed('campaign');
    return true;
}
function setMaster(on) {
    if (locked()) { toast('Not while you\'re at someone else\'s table.'); return false; }
    var camp = activeCamp(); if (!camp) return false;
    fill(camp);
    camp.vtt.master = !!on;
    if (window.wpSave) window.wpSave(true);
    changed('master');
    return true;
}
// Copy the default onto the chosen campaigns: master and every roster feature; unknown keys are kept. One save.
function pushTo(ids) {
    if (locked()) { toast('Not while you\'re at someone else\'s table.'); return 0; }
    var a = state.appState, g = globalVtt(), n = 0;
    (ids || []).forEach(function(id) {
        var camp = a && a.campaigns && a.campaigns[id]; if (!camp) return;
        fill(camp);
        camp.vtt.master = g.master;
        FEATURES.forEach(function(f) { camp.vtt.features[f.id] = g.features[f.id]; });
        n++;
    });
    if (n && window.wpSave) window.wpSave(true);
    if (n) changed('push');
    return n;
}

/* ---------- the wire: what a host sends, what a client keeps ---------- */
function sig(flags) { return FEATURES.map(function(f) { return f.id + (flags && flags[f.id] ? 1 : 0); }).join(''); }
function flagsOf(camp) { var out = {}; FEATURES.forEach(function(f) { out[f.id] = campaignOn(f.id, camp); }); return out; }
function hostFlags() { return flagsOf(activeCamp()); }                       // master folded in: the wire needs no master field
function hostCamps() { var a = state.appState, out = {}; if (a && a.campaigns) Object.keys(a.campaigns).forEach(function(id) { out[id] = flagsOf(a.campaigns[id]); }); return out; }
function hostSig() {
    var a = state.appState, ids = (a && a.campaigns) ? Object.keys(a.campaigns).sort() : [];
    return String(a && a.activeCampaignId || '') + '|' + ids.map(function(id) { return id + ':' + sig(flagsOf(a.campaigns[id])); }).join(',');
}
// A flags object off the wire: a key that is absent means ON (an older host does not know the newer ids); a present key is a boolean
function cleanFlags(s) {
    var out = {}; if (!isObj(s)) s = {};
    FEATURES.forEach(function(f) { out[f.id] = (s[f.id] === undefined) ? true : !!s[f.id]; });
    return out;
}
// The per-campaign map off the wire: roster ids only, campaign ids filtered like a table key, absent → null
function cleanStanceCamps(m) {
    if (!isObj(m)) return null;
    var out = Object.create(null);
    Object.keys(m).forEach(function(id) { if (KEY_RE.test(id) && isObj(m[id])) out[id] = cleanFlags(m[id]); });
    return out;
}

/* ---------- the resolver ---------- */
// The ceiling lives exactly as long as net.foreign does: set with the snapshot, nulled only by load()
function ceiling() {
    var n = net();
    if (!n || !n.foreign || n.stream) return null;
    var id = state.appState && state.appState.activeCampaignId;
    return (n.stanceCamps && id && n.stanceCamps[id]) || n.stance || null;
}
function on(id) {
    var c = ceiling();
    if (c) return c[id] === true && !localOff(id);
    return campaignOn(id);
}
// Why is a feature off here: '' (it is on), 'gm' (the GM's setting), 'local' (off for me at this table), 'own' (my own setting)
function whyOff(id) {
    if (on(id)) return '';
    var c = ceiling(); if (!c) return 'own';
    return c[id] === true ? 'local' : 'gm';
}

/* ---------- a player's own choices at a table (wp_vtt_local) ---------- */
function safe(s) { return String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60); }
function gmIdNow() { var n = net(); return (n && n.gmId) || (n && n.notepad && n.notepad.gmId) || ''; }
function tableKey() {
    if (mode() !== 'client') return '';
    var c = safe(state.appState && state.appState.activeCampaignId), g = safe(gmIdNow());
    if (!c) return '';
    var tail = g ? c + '__' + g : c;
    return KEY_RE.test(tail) ? 't:' + tail : '';
}
function cleanEntry(e) {
    var known = function(x) { return typeof x === 'string' && !!featureById(x); };
    var out = { off: [], decided: [], seen: '', pending: '', t: 0 };
    if (!isObj(e)) return out;
    if (Array.isArray(e.off)) out.off = e.off.filter(known);
    if (Array.isArray(e.decided)) out.decided = e.decided.filter(known);
    if (typeof e.seen === 'string') out.seen = e.seen.slice(0, 200);
    if (typeof e.pending === 'string') out.pending = e.pending.slice(0, 200);
    if (typeof e.t === 'number' && isFinite(e.t)) out.t = e.t;
    return out;
}
function readLocal() {
    var tables = Object.create(null), p = parseGlobal(lsGet(LOCAL_KEY));
    if (p && isObj(p.tables)) Object.keys(p.tables).forEach(function(k) { if (k.indexOf('t:') === 0 && KEY_RE.test(k.slice(2))) tables[k] = cleanEntry(p.tables[k]); });
    return tables;
}
// Capped at MAX_TABLES: the oldest records go, never the one being written (keep)
function serialiseLocal(tables, keep) {
    var keys = Object.keys(tables), over = keys.length - MAX_TABLES;
    if (over > 0) { keys = keys.filter(function(k) { return k !== keep; }); keys.sort(function(a, b) { return tables[a].t - tables[b].t; }); keys.slice(0, over).forEach(function(k) { delete tables[k]; }); }
    var plain = {}; Object.keys(tables).forEach(function(k) { plain[k] = tables[k]; });
    return JSON.stringify({ v: 1, tables: plain });
}
// Write only when the record really changed: every wp_* write re-POSTs the whole prefs file
function writeLocal(tables, key) {
    var before = lsGet(LOCAL_KEY) || '';
    if (serialiseLocal(tables, key) === before) return true;
    if (tables[key]) tables[key].t = Date.now();
    if (!lsSet(LOCAL_KEY, serialiseLocal(tables, key))) { toast('Could not save that setting.'); return false; }
    return true;
}
function entryOf(tables, key) { if (!tables[key]) tables[key] = cleanEntry(null); return tables[key]; }
var _localCache = { raw: undefined, key: '', off: null };
function localOff(id) {
    var key = tableKey(); if (!key) return false;
    var raw = lsGet(LOCAL_KEY);
    if (raw !== _localCache.raw || key !== _localCache.key) { var t = readLocal(); _localCache = { raw: raw, key: key, off: t[key] ? t[key].off : [] }; }
    return _localCache.off.indexOf(id) >= 0;
}
// The one writer that runs while locked(): it is the player's own choice, never the campaign. Only at a
// table, only for a feature the ceiling has on; the choice is recorded as decided for this table.
function setLocal(id, off) {
    if (mode() !== 'client' || !featureById(id)) return false;
    var c = ceiling(); if (!c || c[id] !== true) return false;
    var key = tableKey(); if (!key) return false;
    var tables = readLocal(), e = entryOf(tables, key);
    e.off = e.off.filter(function(x) { return x !== id; }); if (off) e.off.push(id);
    if (e.decided.indexOf(id) < 0) e.decided.push(id);
    writeLocal(tables, key);   // a failed write is reported; the choice still applies for this session through the cache below
    _localCache = { raw: lsGet(LOCAL_KEY), key: key, off: e.off.slice() };
    if (window.appRender) window.appRender();
    if (window.wpRefreshBlasts) window.wpRefreshBlasts();
    if (window.wpSoundSync) window.wpSoundSync();
    if (window.wpDiceSync) window.wpDiceSync();
    return true;
}

/* ---------- the join notice ----------
   After every snapshot (and after a stage that lands the player on another campaign): seed this table's
   off-list with the features the GM has on but the player's own default has off — unless the player has
   already decided that feature here — then, if anything differs from the player's defaults and the
   signature was not acknowledged before, queue the notice. It is acknowledged only once it is on screen. */
var _noticeTimer = null, _noticePoll = null;
function playerDefaults() { var g = globalVtt(), out = {}; FEATURES.forEach(function(f) { out[f.id] = g.master && g.features[f.id]; }); return out; }
// Returns the ids it switched off for this table (empty when nothing was seeded)
function seedEntry(e, G, P) {
    var seeded = [];
    FEATURES.forEach(function(f) {
        if (G[f.id] && !P[f.id] && e.decided.indexOf(f.id) < 0 && e.off.indexOf(f.id) < 0) { e.off.push(f.id); seeded.push(f.id); }
    });
    return seeded;
}
function lists(e, G, P) {
    var A = [], B = [];
    FEATURES.forEach(function(f) { if (G[f.id] && e.off.indexOf(f.id) >= 0) A.push(f.id); else if (!G[f.id] && P[f.id]) B.push(f.id); });
    return { A: A, B: B };
}
function joined() {
    if (mode() !== 'client') return;
    var G = ceiling(); if (!G) return;
    var key = tableKey(); if (!key) return;
    var s = sig(G), P = playerDefaults(), tables = readLocal(), e = entryOf(tables, key);
    var seeded = seedEntry(e, G, P);
    var ab = lists(e, G, P);
    if (s === e.seen) { if (seeded.length) writeLocal(tables, key); _localCache.raw = undefined; return; }   // a blip, a refresh-rejoin: nothing new to say
    if (!ab.A.length && !ab.B.length) { e.seen = s; e.pending = ''; writeLocal(tables, key); _localCache.raw = undefined; return; }
    e.pending = s;
    writeLocal(tables, key);
    _localCache.raw = undefined;
    if (window.appRender) window.appRender();
    if (window.wpSoundSync) window.wpSoundSync();
    if (window.wpDiceSync) window.wpDiceSync();
    scheduleNotice(key, s);
}
function tableChanged(prevCampId) { void prevCampId; joined(); }
function modalUp(sel) { var m = document.querySelector(sel); return !!m && m.style.display !== 'none' && m.style.display !== ''; }
function anyModalUp() { return Array.prototype.some.call(document.querySelectorAll('[id$="Modal"]'), function(m) { return m.style.display === 'flex'; }); }
function busy() { return modalUp('#handoutModal') || modalUp('#customConfirm') || modalUp('#customPrompt') || document.body.classList.contains('tour-on'); }
function scheduleNotice(key, s) {
    if (_noticeTimer) clearTimeout(_noticeTimer);
    if (_noticePoll) clearInterval(_noticePoll);
    _noticeTimer = setTimeout(function() {
        _noticeTimer = null;
        var started = Date.now();
        var attempt = function() {
            if (mode() !== 'client' || tableKey() !== key) { clearInterval(_noticePoll); _noticePoll = null; return; }
            if (!busy()) { clearInterval(_noticePoll); _noticePoll = null; showNotice(key, s); return; }
            if (Date.now() - started > 90000) {
                clearInterval(_noticePoll); _noticePoll = null;
                // Ninety seconds under other dialogs: say it in a toast and acknowledge — unless a dialog is still up,
                // in which case the marker stays and the next snapshot queues the notice again
                if (anyModalUp()) return;
                var tables = readLocal(), e = tables[key]; if (!e || e.pending !== s) return;
                var G = ceiling() || {}, hidden = FEATURES.filter(function(f) { return !G[f.id] || e.off.indexOf(f.id) >= 0; }).map(function(f) { return f.label; });
                if (hidden.length) toast('Hidden at this table: ' + hidden.join(', ') + '.');
                e.seen = s; e.pending = ''; writeLocal(tables, key); _localCache.raw = undefined;
            }
        };
        attempt();
        if (!_noticePoll && mode() === 'client' && tableKey() === key && busy()) _noticePoll = setInterval(attempt, 600);
    }, 800);
}
var _noticeKey = '', _noticeA = [];
function showNotice(key, s) {
    if (mode() !== 'client' || tableKey() !== key) return false;
    var tables = readLocal(), e = tables[key];
    if (!e || e.pending !== s) return false;
    var m = document.getElementById('vttNoticeModal'); if (!m) return false;
    var G = ceiling() || {}, ab = lists(e, G, playerDefaults());
    var camp = activeCamp();
    var intro = document.getElementById('vttNoticeIntro');
    if (intro) intro.textContent = (camp && camp.name ? camp.name : 'This table') + ' — the GM\'s VTT features differ from your own defaults. Nothing here changes your own settings.';
    var fillList = function(listId, wrapId, ids) {
        var ul = document.getElementById(listId), wrap = document.getElementById(wrapId); if (!ul || !wrap) return;
        ul.textContent = '';
        ids.forEach(function(id) { var li = document.createElement('li'); li.textContent = labelOf(id); ul.appendChild(li); });
        wrap.style.display = ids.length ? '' : 'none';
    };
    fillList('vttNoticeListA', 'vttNoticeOffForYou', ab.A);
    fillList('vttNoticeListB', 'vttNoticeHidden', ab.B);
    var sync = document.getElementById('vttNoticeSyncBtn'), keep = document.getElementById('vttNoticeKeepBtn');
    if (sync) sync.style.display = ab.A.length ? '' : 'none';
    if (keep) keep.textContent = ab.A.length ? 'Keep mine' : 'Got it';
    _noticeKey = key; _noticeA = ab.A.slice();
    m.style.display = 'flex';
    // acknowledged only now that it is on screen
    e.seen = s; e.pending = ''; writeLocal(tables, key); _localCache.raw = undefined;
    return true;
}
function hideNotice() { var m = document.getElementById('vttNoticeModal'); if (m) m.style.display = 'none'; }
// "Keep mine": the listed features stay off here and count as decided, so a later GM flip never re-seeds them
function keepMine() {
    var key = _noticeKey; hideNotice();
    if (!key || tableKey() !== key) return;
    var tables = readLocal(), e = entryOf(tables, key);
    _noticeA.forEach(function(id) { if (e.decided.indexOf(id) < 0) e.decided.push(id); });
    writeLocal(tables, key); _localCache.raw = undefined;
}
// "Use the table's settings": only the listed features leave this table's off-list; the default and the
// player's own campaigns are never touched (they are not even in memory while joined)
function syncToTable() {
    var key = _noticeKey; hideNotice();
    if (!key || tableKey() !== key) return;
    var tables = readLocal(), e = entryOf(tables, key);
    e.off = e.off.filter(function(id) { return _noticeA.indexOf(id) < 0; });
    _noticeA.forEach(function(id) { if (e.decided.indexOf(id) < 0) e.decided.push(id); });
    writeLocal(tables, key); _localCache.raw = undefined;
    if (window.appRender) window.appRender();
    if (window.wpRefreshBlasts) window.wpRefreshBlasts();
    if (window.wpSoundSync) window.wpSoundSync();
    if (window.wpDiceSync) window.wpDiceSync();
    if (window.wpSettingsSync) window.wpSettingsSync();
    toast(_noticeA.length ? 'Using the table\'s settings for ' + _noticeA.map(labelOf).join(', ') + '.' : 'Using the table\'s settings.');
}
// A stance message mid-session: for the campaign on screen, re-seed (skipping decided ids) and one toast naming
// the change. A feature the GM newly turned on that the player's own default has off starts off for them — the
// toast says so — and the signature is NOT acknowledged, so the next join shows the notice with its "Use the
// table's settings" offer. Otherwise acknowledge, unless a dialog could be hiding the toast (then the next join
// shows it).
function ceilingChanged(prev, campId) {
    if (mode() !== 'client') return;
    var onScreen = state.appState && state.appState.activeCampaignId;
    if (campId && campId !== onScreen) return;   // another campaign's table: handled when the stage lands the player there
    var G = ceiling(); if (!G) return;
    var s = sig(G), ps = sig(prev || {});
    if (s === ps) { if (window.wpSettingsSync) window.wpSettingsSync(); return; }
    var key = tableKey(); if (!key) return;
    var tables = readLocal(), e = entryOf(tables, key);
    var seeded = seedEntry(e, G, playerDefaults());
    var diff = FEATURES.filter(function(f) { return !!G[f.id] !== !!(prev && prev[f.id]); });
    var text = diff.length === 1
        ? 'The GM turned ' + labelOf(diff[0].id) + (G[diff[0].id] ? ' on' : ' off') + ' for this table'
        : 'The GM changed this table\'s VTT features — ' + diff.map(function(f) { return labelOf(f.id) + (G[f.id] ? ' on' : ' off'); }).join(', ');
    if (seeded.length) {
        var one = seeded.length === 1;
        text += ' — ' + (one && diff.length === 1 ? '' : seeded.map(labelOf).join(', ') + ' ') + 'off for you (your default has ' + (one ? 'it' : 'them') + ' off; ⚙ Settings ▸ VTT features to turn ' + (one ? 'it' : 'them') + ' on).';
    } else text += '.';
    toast(text);
    if (seeded.length || anyModalUp()) e.pending = s; else { e.seen = s; e.pending = ''; }
    writeLocal(tables, key); _localCache.raw = undefined;
    if (window.appRender) window.appRender();
    if (window.wpRefreshBlasts) window.wpRefreshBlasts();
    if (window.wpSoundSync) window.wpSoundSync();
    if (window.wpDiceSync) window.wpDiceSync();
    if (window.wpSettingsSync) window.wpSettingsSync();
}

/* ---------- after any setting moved ---------- */
function changed(reason) {
    void reason;
    _gCache.raw = undefined;
    if (window.appRender) window.appRender();
    if (window.wpRefreshBlasts) window.wpRefreshBlasts();
    if (window.wpSoundSync) window.wpSoundSync();
    if (window.wpDiceSync) window.wpDiceSync();
    var cm = document.getElementById('contextMenu');
    if (cm && cm.style.display !== 'none' && cm.querySelector('.cm-stance')) cm.style.display = 'none';   // its rows would be stale
    var n = net(); if (n && n.syncStance) n.syncStance();
    if (window.wpSettingsSync) window.wpSettingsSync();
}

/* ---------- "Apply to existing campaigns…" ---------- */
function isTutorial(id) { return id === 'camp_tutorial'; }
function openPushPicker() {
    if (locked()) { toast('Not while you\'re at someone else\'s table.'); return; }
    var m = document.getElementById('vttPushModal'), rows = document.getElementById('vttPushRows'); if (!m || !rows) return;
    var a = state.appState, g = globalVtt(), n = net(), hosting = !!(n && n.active && n.role === 'host');
    var ids = Object.keys(a.campaigns || {});
    ids.sort(function(x, y) {
        if (isTutorial(x) !== isTutorial(y)) return isTutorial(x) ? 1 : -1;   // the tutorial campaign goes last
        return String(a.campaigns[x].name || '').localeCompare(String(a.campaigns[y].name || ''));
    });
    rows.textContent = '';
    ids.forEach(function(id) {
        var c = a.campaigns[id], cv = campaignVtt(c);
        var same = cv.master === g.master && FEATURES.every(function(f) { return cv.features[f.id] === g.features[f.id]; });
        var nMaps = 0, nPl = 0; Object.values(c.items || {}).forEach(function(it) { if (it.type === 'map') nMaps++; else if (it.type === 'planner') nPl++; });
        var row = document.createElement('label'); row.className = 'combat-row vtt-push-row';
        var cb = document.createElement('input'); cb.type = 'checkbox'; cb.className = 'combat-on vtt-push-on'; cb.value = id; cb.title = 'Copy the defaults onto this campaign';
        var name = document.createElement('span'); name.className = 'combat-name'; name.textContent = c.name || 'Unnamed Campaign';
        var tag = function(t) { var s = document.createElement('span'); s.className = 'combat-tag'; s.textContent = t; name.appendChild(document.createTextNode(' ')); name.appendChild(s); };
        if (id === a.activeCampaignId) tag(hosting ? 'hosted' : 'current');
        if (same) tag('already matches');
        var count = document.createElement('span'); count.style.color = 'var(--dim)'; count.style.fontSize = '11px'; count.textContent = nMaps + ' map' + (nMaps === 1 ? '' : 's') + ' · ' + nPl + ' planner' + (nPl === 1 ? '' : 's');
        row.appendChild(cb); row.appendChild(name); row.appendChild(count);
        rows.appendChild(row);
    });
    m.style.display = 'flex';
}
function applyPush() {
    var m = document.getElementById('vttPushModal'), rows = document.getElementById('vttPushRows'); if (!m || !rows) return;
    var ids = Array.prototype.map.call(rows.querySelectorAll('.vtt-push-on:checked'), function(cb) { return cb.value; });
    if (!ids.length) { toast('Tick at least one campaign.'); return; }
    m.style.display = 'none';   // before the toast: toasts sit under every backdrop
    var n = pushTo(ids);
    toast('New defaults copied to ' + n + ' campaign' + (n === 1 ? '' : 's') + '. The others keep their own.');
}

/* ---------- debug ---------- */
function debug() {
    var key = tableKey(), tables = key ? readLocal() : null, e = tables && tables[key], c = ceiling(), eff = {};
    FEATURES.forEach(function(f) { eff[f.id] = on(f.id); });
    var n = net(), sc = null;
    if (n && n.stanceCamps) { sc = {}; Object.keys(n.stanceCamps).forEach(function(id) { sc[id] = Object.assign({}, n.stanceCamps[id]); }); }
    return {
        mode: mode(), campaign: activeCamp() ? campaignVtt(activeCamp()) : null, global: globalVtt(),
        ceiling: c ? Object.assign({}, c) : null, stanceCamps: sc, tableKey: key,
        localOff: e ? e.off.slice() : [], decided: e ? e.decided.slice() : [], effective: eff,
        sig: sig(c || hostFlags()), seen: e ? e.seen : '', pending: e ? e.pending : ''
    };
}

/* ---------- wiring ---------- */
if (typeof document !== 'undefined' && document.getElementById) (function wire() {
    var keep = document.getElementById('vttNoticeKeepBtn'), sync = document.getElementById('vttNoticeSyncBtn'), close = document.getElementById('vttNoticeCloseBtn');
    if (keep) keep.addEventListener('click', keepMine);
    if (close) close.addEventListener('click', keepMine);
    if (sync) sync.addEventListener('click', syncToTable);
    // Esc means "Keep mine" — caught on the way down so the play map's own Esc listeners never see it
    document.addEventListener('keydown', function(e) {
        if (e.key !== 'Escape') return;
        var m = document.getElementById('vttNoticeModal'); if (!m || m.style.display !== 'flex') return;
        e.stopPropagation(); e.preventDefault(); keepMine();
    }, true);
    var pushBtn = document.getElementById('setVttPushBtn'), go = document.getElementById('vttPushGoBtn'), cancel = document.getElementById('vttPushCancelBtn'), pClose = document.getElementById('vttPushCloseBtn');
    var hidePush = function() { var m = document.getElementById('vttPushModal'); if (m) m.style.display = 'none'; };
    if (pushBtn) pushBtn.addEventListener('click', openPushPicker);
    if (go) go.addEventListener('click', applyPush);
    if (cancel) cancel.addEventListener('click', hidePush);
    if (pClose) pClose.addEventListener('click', hidePush);
})();

window.wpVtt = {
    FEATURES: FEATURES, mode: mode, locked: locked,
    on: on, ceiling: ceiling, whyOff: whyOff,
    campaignOn: campaignOn, campaignMaster: campaignMaster, campaignVtt: campaignVtt, fill: fill, fillAll: fillAll, allOn: allOn,
    setCampaign: setCampaign, setMaster: setMaster, pushTo: pushTo, openPushPicker: openPushPicker,
    globalOn: globalOn, globalVtt: globalVtt, setGlobal: setGlobal, setGlobalMaster: setGlobalMaster,
    hostFlags: hostFlags, hostCamps: hostCamps, hostSig: hostSig, sig: sig, cleanFlags: cleanFlags, cleanStanceCamps: cleanStanceCamps,
    tableKey: tableKey, localOff: localOff, setLocal: setLocal,
    joined: joined, tableChanged: tableChanged, ceilingChanged: ceilingChanged, showNotice: showNotice, keepMine: keepMine, syncToTable: syncToTable,
    changed: changed, debug: debug
};
// Dev/console: show the queued notice for the table on screen now, if one is pending
window.wpShowVttNotice = function() { var key = tableKey(); if (!key) return false; var t = readLocal(), e = t[key]; return !!(e && e.pending) && showNotice(key, e.pending); };

export { FEATURES, on, campaignOn, fill, fillAll, globalVtt, globalOn, hostFlags, hostCamps, hostSig, cleanFlags, cleanStanceCamps, mode, locked, ceiling, tableKey, localOff, setLocal, sig, joined, ceilingChanged, changed, debug };
