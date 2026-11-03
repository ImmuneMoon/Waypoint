// setupcore.js — backlog 31: a map's set-ups, named saves of its tokens, its fog and its lights, restored from a list (the owner, 2026-11-03, by
// prompt: "Replace, with Undo. Restore puts the tokens, fog and lights back as saved, in one step the GM's Undo takes back; drawings and walls stay.
// The Restore window shows three ticks (tokens, fog, lights), all on by default"). Kept as map.meta.setups, the GM's alone: net.js deletes the key
// on every map's way out. Pure: what a set-up holds, its cleaner and what a restore leaves on the map
var VERSION = 1, SETUP_MAX = 20, SETUP_PIECES = 3000, NAME_MAX = 60, SETUP_ID = /^su_[a-z0-9]{1,16}$/;
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function copy(v) { return JSON.parse(JSON.stringify(v)); }
// a token, a character's piece of the map; a waiting token belongs to a player's join, and is no part of a set-up
function isTok(w) { return isObj(w) && w.isChar === true && w.waiting !== true; }
// a light, a piece that gives light and is no token: a token's own light goes with its token
function isLight(w) { return isObj(w) && w.isChar !== true && w.waiting !== true && isObj(w.light); }
function cleanName(s) { return String(typeof s === 'string' ? s : '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX); }
// what of a map's fog a set-up keeps: whether it is on, its mode, its light and the cells painted by hand; its grid and its sight stay the map's
function fogPart(fog) {
    if (!isObj(fog)) return null; var o = { on: fog.on === true };
    if (typeof fog.mode === 'string') o.mode = fog.mode; if (typeof fog.light === 'string') o.light = fog.light;
    o.manual = isObj(fog.manual) ? copy(fog.manual) : { adds: [], cuts: [] }; return o;
}
function takeSetup(map, name, now, id) {
    var wb = isObj(map) && Array.isArray(map.whiteboard) ? map.whiteboard : [];
    return { id: id, name: cleanName(name) || 'Set-up', at: typeof now === 'number' && isFinite(now) ? now : 0, toks: wb.filter(isTok).slice(0, SETUP_PIECES).map(copy), lights: wb.filter(isLight).slice(0, SETUP_PIECES).map(copy), fog: fogPart(isObj(map) ? map.fog : null) };
}
// a map's set-ups as data: an id once, a name, a time, its tokens and lights as pieces of their kind (each cleaned again as any piece of a map is, by
// the caller), its fog's part through the fog's own cleaner where one is handed in. null for none
function cleanSetups(v, cleanFog) {
    var out = [], seen = Object.create(null);
    (Array.isArray(v) ? v.slice(0, SETUP_MAX * 2) : []).forEach(function(s) {
        if (out.length >= SETUP_MAX || !isObj(s) || typeof s.id !== 'string' || !SETUP_ID.test(s.id) || seen[s.id]) return; seen[s.id] = 1;
        var o = { id: s.id, name: cleanName(s.name) || 'Set-up', at: typeof s.at === 'number' && isFinite(s.at) && s.at > 0 ? Math.floor(s.at) : 0 };
        o.toks = (Array.isArray(s.toks) ? s.toks : []).filter(isTok).slice(0, SETUP_PIECES);
        o.lights = (Array.isArray(s.lights) ? s.lights : []).filter(isLight).slice(0, SETUP_PIECES);
        var f = isObj(s.fog) && typeof cleanFog === 'function' ? cleanFog(s.fog) : null; if (f) o.fog = fogPart(f);
        out.push(o);
    });
    return out.length ? out : null;
}
// what a restore leaves: the map's pieces with its tokens and its lights in their saved place where ticked, and its fog where ticked, over the
// map's own grid and sight. Drawings, walls and everything else stay as they are
function restoreSetup(map, s, ticks) {
    var t = isObj(ticks) ? ticks : { toks: true, fog: true, lights: true }, wb = isObj(map) && Array.isArray(map.whiteboard) ? map.whiteboard : [], out = wb.slice();
    if (!isObj(s)) return null;
    if (t.toks === true) { var tk = (Array.isArray(s.toks) ? s.toks : []).map(copy), tIds = Object.create(null); tk.forEach(function(w) { if (typeof w.id === 'string') tIds[w.id] = 1; }); out = out.filter(function(w) { return !isTok(w) && !(isObj(w) && tIds[w.id]); }).concat(tk); }
    if (t.lights === true) { var lt = (Array.isArray(s.lights) ? s.lights : []).map(copy), lIds = Object.create(null); lt.forEach(function(w) { if (typeof w.id === 'string') lIds[w.id] = 1; }); out = out.filter(function(w) { return !isLight(w) && !(isObj(w) && lIds[w.id]); }).concat(lt); }
    var fog = null; if (t.fog === true && isObj(s.fog)) { fog = Object.assign({}, isObj(map.fog) ? copy(map.fog) : {}, copy(s.fog)); }
    return { whiteboard: out, fog: fog };
}
function newId(list) { var have = Object.create(null); (Array.isArray(list) ? list : []).forEach(function(s) { if (isObj(s)) have[s.id] = 1; }); for (var i = 0; i < 50; i++) { var id = 'su_' + Math.random().toString(36).slice(2, 10); if (SETUP_ID.test(id) && !have[id]) return id; } return null; }
function logLine(step, facts) { var f = isObj(facts) ? facts : {}, parts = Object.keys(f).map(function(k) { return k + '=' + String(f[k]); }); return 'setups v' + VERSION + ' ' + step + (parts.length ? ' ' + parts.join(' ') : ''); }

var API = { VERSION: VERSION, SETUP_MAX: SETUP_MAX, SETUP_PIECES: SETUP_PIECES, isTok: isTok, isLight: isLight, cleanName: cleanName, fogPart: fogPart, takeSetup: takeSetup, cleanSetups: cleanSetups, restoreSetup: restoreSetup, newId: newId, logLine: logLine };
if (typeof window !== 'undefined') window.wpSetupCore = API;
export { VERSION, SETUP_MAX, SETUP_PIECES, isTok, isLight, cleanName, fogPart, takeSetup, cleanSetups, restoreSetup, newId, logLine };
