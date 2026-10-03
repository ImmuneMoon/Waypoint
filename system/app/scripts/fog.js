/* Fog of war / dynamic vision (1.5.0, v1) — the UI + vision half. FV1 gave the GM-side overlay and tools; FV2 makes
   it per-player and enforced:
   - the same pure geometry (fogcore.js / window.wpFogCore) computes, for any viewer, the cells their tokens reveal;
   - the HOST calls fogDropIds()/canSeePoint() (exposed on window.wpFog) to drop from a recipient's wire copy every
     creature they cannot see (net.js) — true absence, so a dev window has nothing to uncover;
   - the CLIENT paints an OPAQUE fog overlay of its own tokens' vision (map.fog + camp.fog now travel), matching what
     the host enforced; the GM sees a see-through authoring/preview overlay and the fog menu.
   Sight range resolves from a campaign-mapped character-sheet field (camp.fog.fields.sight) via the formula engine,
   falling back to camp.fog.defaults.sight. Design of record: docs/FOG_OF_WAR_PLAN.md §13. */
import { state } from './state.js';
import { getActiveMap, getActiveCampaign } from './models.js';

var ui = function(id) { return document.getElementById(id); };
function core() { return window.wpFogCore || null; }
function net() { return window.wpNet || null; }
function vtt() { return window.wpVtt || null; }
function toast(m) { if (window.appToast) window.appToast(m); }
function roleNow() { var v = vtt(); return v ? v.mode() : 'solo'; }
function isGmView() { var m = roleNow(); return m === 'solo' || m === 'host'; }
function isClientView() { return roleNow() === 'client'; }   // a foreign player past the snapshot (never the stream or awaiting)
function isStreamView() { return roleNow() === 'stream'; }   // the stream window (R2 #14): a spectator's standpoint, the players' tokens together
function myId() { var n = net(); return (n && n.myId) || ''; }
function fogFeatureOn() { var v = vtt(); return v ? !!v.on('fog') : false; }   // host: the campaign setting; client: the GM's ceiling
function lightingOn() { var v = vtt(); return v ? !!v.on('lighting') : false; }   // lighting (backlog 14): the GM's switch, on by default (an absent flag reads on, as every feature's)
function canWrite() { return !!(window.wpCanPersistLocal && window.wpCanPersistLocal()) && !window.wpStream; }
function activeMap() { var m = getActiveMap(); return m && m.type === 'map' ? m : null; }
function activeCamp() { return getActiveCampaign() || null; }
function save() { if (window.wpSave) window.wpSave(true); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

/* ---------- the persisted fog data (travels in FV2) ---------- */
function DEF_MAP() { return { on: false, mode: 'auto', manual: { adds: [], cuts: [] } }; }
function mapFog(map) {
    if (!map) return DEF_MAP();
    var C = core();
    if (!map.fog || typeof map.fog !== 'object') map.fog = DEF_MAP();
    else if (C) map.fog = C.cleanFog(map.fog) || DEF_MAP();
    if (!map.fog.manual) map.fog.manual = { adds: [], cuts: [] };
    return map.fog;
}
function campFog(camp) {
    var C = core();
    if (!camp) return C ? C.cleanCampFog(null) : { fields: {}, defaults: { sight: 0 } };
    camp.fog = C ? C.cleanCampFog(camp.fog) : (camp.fog || { fields: {}, defaults: { sight: 0 } });
    return camp.fog;
}
function gridForMap(map) { var C = core(); if (!C || !map) return null; return C.gridFor((map.meta && map.meta.gridType) || 'off', map.fog && map.fog.cell); }
// Per-map yards-per-cell (mirrors whiteboard.js mapMeasureConfig without depending on the ACTIVE map — §11R-7)
var UNIT_YD = { yd: 1, ft: 1 / 3, m: 1.09361, km: 1093.61, mi: 1760 };
function cellYardsForMap(map) {
    var meta = (map && map.meta) || {}, gt = meta.gridType || 'off';
    var hex = gt === 'hex' || (gt === 'off' && map.fog && map.fog.cell && map.fog.cell.grid === 'hex');
    var per = (typeof meta.cellValue === 'number' && meta.cellValue > 0) ? meta.cellValue : (hex ? 1 : 5);
    return per * (UNIT_YD[meta.cellUnit] || (hex ? 1 : UNIT_YD.ft));
}
// Senses S2a: the system's full senses (the same in the GM's view and the players', S1), [] with none
function campSensesOf(camp) { var sys = camp && camp.system, sn = sys && typeof sys === 'object' && sys.combat && typeof sys.combat === 'object' ? sys.combat.senses : null; return sn && typeof sn === 'object' ? sn : null; }
function campSenses(camp) {
    var sn = campSensesOf(camp);
    return sn && Array.isArray(sn.list) ? sn.list.filter(function(s) { return !!s && s.grade === 'full' && !!s.range && typeof s.range === 'object'; }) : [];
}
// Senses S4: the system's mark senses (a nameless mark where a creature is), [] with none; a mark's glyph as its number on the wire
function campMarkSenses(camp) {
    var sn = campSensesOf(camp);
    return sn && Array.isArray(sn.list) ? sn.list.filter(function(s) { return !!s && s.grade === 'mark' && !!s.range && typeof s.range === 'object'; }) : [];
}
var GLYPH_K = { sound: 1, tremor: 2, presence: 3, heat: 4 };
// One token's sight and full senses, in cells, from ONE resolver (its token's context: effects, posture, elevation). Sight: the mapped sheet
// field via the formula engine, else the campaign default; clamped. Counted in yards unless the campaign says feet, metres or cells
// (camp.fog.fields.sightUnit, L4: a d20 game's 60 ft on 5 ft squares is 12 cells). A sense: its number, which every token has, or its field
// read from the character's sheet only where the token's own player holds that character whole (not an NPC, the character's owner the
// token's, not a teammate's partial copy), so host and player read it alike; waived: the GM's union of every token reads every sheet. A range
// of 0 or less is not having the sense; the cells in the sense's own unit through this map's scale. { sight, full: [{ id, cells, pass, all, dim }] }
// Senses S3: blind (the GM's tick on the token, or the system's blind field ticked or above 0 on a sheet read by the same rule) sets blind:
// true; a sense of the eyes is then off, as is a sense whose off field is ticked or above 0: held but off, in offs [{ id, n, cells, from, why }]
// Found during senses S0, (d) — the owner's answer (2026-09-29): a Sight its player cannot read truthfully (a GM-only field, or one worked out
// from one: secretFieldIds, as for a sense's range) is the campaign's default on both sides, so the host never judges what a player sees by a
// number their own screen cannot paint by. Unjudgeable (no system core or formula engine, or it throws): the default. One slot, kept on the
// system object and its stamp
// The eyes' arc (the owner's ruling of 2026-10-03): where the system names a field for it (combat.senses.arc, a number or a formula its player
// can read: systemcore cleanSenses) a character's own sight arc is that field's value on its sheet, read by the very rule a sense's range is
// (its player's own whole character, or waived; never a waiting token's): arc, whole degrees 1 to 360 (rounded, more than 360 is 360).
// Absent where it gives 0, less or no number: the map's arc. What the arc is worth on a map is eyesArc's to say
var _sightSec = { sys: null, u: null, sec: null };
function sightSecret(camp, fid) {
    var S0 = window.wpSystemCore, F = window.wpFormula, sys = camp && camp.system;
    if (!fid || typeof fid !== 'string' || !sys || typeof sys !== 'object') return false;
    if (!S0 || typeof S0.secretFieldIds !== 'function' || typeof S0.gmViewFields !== 'function' || !F) return true;
    if (_sightSec.sys !== sys || _sightSec.u !== sys.updated) {
        var sec = null; try { sec = S0.secretFieldIds({ fields: S0.gmViewFields(sys, F), items: sys.items, core: sys.core }, F); } catch (e) { sec = null; }
        _sightSec = { sys: sys, u: sys.updated, sec: sec };
    }
    return !_sightSec.sec || Object.prototype.hasOwnProperty.call(_sightSec.sec, fid);
}
function tokenSenses(token, map, camp, waived) {
    var C = core(), out = { sight: 0, full: [] }; if (!C || !token) return out;
    var cf = campFog(camp), yards = cf.defaults.sight || 0, per = cellYardsForMap(map), S0 = window.wpSystemCore, F = window.wpFormula;
    var ch = camp && camp.system && camp.chars && typeof camp.chars === 'object' && typeof token.charId === 'string' && Object.prototype.hasOwnProperty.call(camp.chars, token.charId) ? camp.chars[token.charId] : null;   // a character of the campaign's own: a name the list only inherits ('constructor') stands for none, and sees by the default
    var r = null, resolver = function() {
        if (r === null) {
            r = false;
            if (ch && S0 && F) { var vt = window.wpVtt, rf = function(k) { return !vt || (vt.rulesOn ? vt.rulesOn(k) : vt.on(k)); };   // Stage 6: a formula reading Elevation (a watcher on a ledge) uses the token's own values
                var tc = S0.tokenCtx ? S0.tokenCtx(map, token, { turning: rf('turning'), posture: rf('posture'), elevation: rf('elevation') }) : null; r = S0.makeResolver(camp.system, ch, F, tc); }
        }
        return r || null;
    };
    var read = function(fid) { var f = S0 && fid ? S0.fieldById(camp.system, fid) : null, rv = f && f.key ? resolver() : null, v = rv ? rv(f.key) : null; return typeof v === 'number' && isFinite(v) ? v : null; };
    var set = function(sw) { var f = S0 && sw ? S0.fieldById(camp.system, sw.field) : null, rv = f && f.key ? resolver() : null, v = rv ? rv(f.key) : null; return v === true || (typeof v === 'number' && v > 0); };   // senses S3: a switch, ticked or above 0
    if (cf.fields.sight && ch && !(typeof sightSecret === 'function' && sightSecret(camp, cf.fields.sight))) { var sv = read(cf.fields.sight); if (sv !== null && sv >= 0) yards = sv; }   // S0 (d): a Sight its player cannot read is the default
    out.sight = C.unitCells(yards, cf.fields.sightUnit, per);
    var tick = token.blind === true && !token.waiting, sn = campSensesOf(camp);   // senses S3: the GM's tick works with no system at all
    if (!sn) { if (tick) out.blind = true; return out; }
    var own = !!ch && (waived === true || (ch.npc !== true && ch.partial !== true && !!ch.ownerId && ch.ownerId === token.ownerId));
    out.sheet = own;
    if (own && !token.waiting && sn.arc && typeof sn.arc === 'object') { var av = read(sn.arc.field), an = av === null ? 0 : Math.round(av); if (an >= 1) out.arc = Math.min(360, an); }   // the eyes' own arc, from the sheet (eyesArc)
    if (tick || (own && sn.blind && set(sn.blind))) out.blind = true;
    var list = campSenses(camp).concat(campMarkSenses(camp)), offs = [], marks = [], nul = nullsAt(map, token);   // senses S4: the mark senses after the full ones; S7a: what a null area switches off where it stands
    var ov = !token.waiting ? C.cleanTokSenses(token.senses) : null, byTok = Object.create(null);   // senses S2b: the token's own ranges come first (never a waiting token's)
    if (ov) ov.forEach(function(e) { byTok[e.id] = e.n; });
    list.forEach(function(s) {
        var mine = Object.prototype.hasOwnProperty.call(byTok, s.id), n = mine ? byTok[s.id] : s.range.by === 'n' ? s.range.n : s.range.by === 'field' && own ? read(s.range.field) : null;
        if (!(typeof n === 'number' && n > 0)) return;
        var e = { id: s.id, cells: C.unitCells(n, s.unit, per), pass: s.walls === 'pass', all: s.arc === 'all', dim: s.shows === 'dim', n: n, from: mine ? 'token' : s.range.by === 'n' ? 'n' : 'field' };
        if (s.veil === true) e.veil = true;   // senses S7b: it sees through smoke
        var why = nul[s.id] === 1 ? 'null' : s.off && own && set(s.off) ? 'off' : s.eyes === true && out.blind ? 'blind' : '';   // senses S3: a sense switched off, or one of the eyes while blind: held, but it sees nothing; S7a: one a null area switches off
        if (why) { offs.push({ id: e.id, n: n, cells: e.cells, from: e.from, why: why }); return; }
        if (s.grade === 'mark') { var mk = { id: e.id, cells: e.cells, pass: e.pass, all: e.all, k: GLYPH_K[s.glyph] || GLYPH_K.presence, n: n, from: e.from }; if (e.veil) mk.veil = true; marks.push(mk); return; }   // senses S4
        out.full.push(e);
    });
    if (marks.length) out.marks = marks;
    if (offs.length) out.offs = offs;
    return out;
}
// One token's sight, in cells (tokenSenses's eyes)
function tokenSightCells(token, map, camp) { return tokenSenses(token, map, camp, false).sight; }
// Senses S7a: null areas — an item that is no token, light or GM-note card and carries nulls (the GM's) switches those senses off for a token
// whose centre's cell is under it. Read on the host only: a player's copy never carries nulls (a hidden area is dropped from it whole), so an
// area works hidden too; the host tells a player of their own tokens instead (map.fogOff, on their copy only), which their app reads here
var _nullCache = Object.create(null);
function nullAreas(map, grid) {   // [{ keys: { cellKey: 1 }, ids }], kept on the map's save stamp and its grid
    var C = core(), stamp = ((map.meta && map.meta.updated) || 0) + '|' + grid.type + ':' + (grid.size || grid.s), hit = _nullCache[map.id];
    if (hit && hit.stamp === stamp) return hit.areas;
    var areas = [];
    (map.whiteboard || []).forEach(function(w) {
        if (!w || w.isChar || w.waiting || w.type === 'light' || w.gmNoteFor || w.nulls === undefined) return;
        var ids = C.cleanNulls(w.nulls); if (!ids) return;
        var keys = Object.create(null); footprintCells(w, grid, C).forEach(function(c) { keys[C.cellKey(c, grid)] = 1; });
        areas.push({ keys: keys, ids: ids });
    });
    _nullCache[map.id] = { stamp: stamp, areas: areas };
    return areas;
}
function nullsAt(map, token) {   // { senseId: 1 } switched off where the token stands
    var out = Object.create(null), C = core(), grid = map && token ? gridForMap(map) : null; if (!C || !grid) return out;
    var areas = nullAreas(map, grid);
    if (areas.length) { var k = C.cellKey(C.cellOf(token.x + (token.w || 60) / 2, token.y + (token.h || 52) / 2, grid), grid); areas.forEach(function(a) { if (a.keys[k] === 1) a.ids.forEach(function(id) { out[id] = 1; }); }); }
    var fo = isClientView() ? map.fogOff : null;   // a player's copy: what the host told them of their own token (the host's own map never holds one it reads)
    if (fo && typeof fo === 'object' && typeof token.id === 'string' && Object.prototype.hasOwnProperty.call(fo, token.id) && Array.isArray(fo[token.id])) fo[token.id].forEach(function(id) { if (typeof id === 'string') out[id] = 1; });
    return out;
}
// the host's word to one player (fogCopyFor): each of their own visible character tokens with a sense it holds that a null area switches off
// where it stands — only those, never an area's other senses; null for none
function fogOffFor(recipientId, camp, map) {
    if (!recipientId || !map || !Array.isArray(map.whiteboard) || !campSensesOf(camp)) return null;
    var out = null;
    map.whiteboard.forEach(function(w) {
        if (!w || w.ownerId !== recipientId || w.hidden || w.waiting || !w.isChar || typeof w.id !== 'string') return;
        var ids = (tokenSenses(w, map, camp, false).offs || []).filter(function(o) { return o.why === 'null'; }).map(function(o) { return o.id; }).sort();
        if (ids.length) (out || (out = {}))[w.id] = ids;
    });
    return out;
}
// Senses S2a: one token's sense viewers, merged so a drag never sweeps more than it must, with the same union of cells: a sense of 0 cells
// goes; of the senses alike in passing walls, arc and dim only the longest stays, and a dim one goes where a clear one alike reaches as far;
// a clear sense the walls stop, in the eyes' own arc, no longer than the eyes' Sight goes (the eyes already see those cells clear). At most
// four clear ones and four dim, in one order: [{ range, arc, pass, dim }]
function senseViewers(ts, eyesArc) {
    var best = Object.create(null), order = [];
    (ts.full || []).forEach(function(s) {
        var arc = s.all ? 360 : eyesArc;
        if (!(s.cells > 0)) return;
        if (!ts.blind && !s.pass && !s.dim && !s.veil && arc === eyesArc && s.cells <= ts.sight) return;   // senses S3: blind eyes see none of those cells; S7b: one that sees through smoke sees what the eyes do not
        var vl = s.veil === true && !s.pass, k = (s.pass ? 'p' : 's') + '|' + arc + '|' + (s.dim ? 'd' : 'c') + (vl ? 'v' : '');
        if (!best[k]) order.push(k);
        if (!best[k] || s.cells > best[k].range) { best[k] = { range: s.cells, arc: arc, pass: s.pass, dim: s.dim }; if (vl) best[k].veil = true; }
    });
    return order.sort().map(function(k) { return best[k]; }).filter(function(v) { var cl = v.dim ? best[(v.pass ? 'p' : 's') + '|' + v.arc + '|c' + (v.veil ? 'v' : '')] : null; return !(cl && cl.range >= v.range); });
}

/* ---------- who reveals what ----------
   ownerId: a player's profile id (their own tokens only) or '*' (every character token — the GM's party preview). */
// R2 #14 (the owner's ruling of 2026-10-01: the stream window is "a combined view of the players, each of them being represented from a 3rd party
// perspective"): PARTY, the stream window's standpoint — every token that is a player's (it carries a player's id: a character's or a waiting one),
// each judged as its own player's copy judges it (its own sheet alone, never waived), never an NPC's eyes, never the GM's whole map. A profile id
// never holds a star, so no player is PARTY. The GM's '*' preview stays what it was: every character token, NPCs included, every sheet read
var PARTY = '*players', playerTok = function(w) { return typeof w.ownerId === 'string' && w.ownerId !== ''; };
// A map's vision mode: its explicit map.fog.vision, else the grid-type default (square = all-around, hex = 180° front
// cone). The arc is DECOUPLED from the grid type — a GM can give a square map a facing cone, or a hex map all-around.
function gridIsHexMap(map) {
    var gt = (map && map.meta && map.meta.gridType) || 'off';
    return gt === 'hex' || (gt === 'off' && !!(map && map.fog && map.fog.cell && map.fog.cell.grid === 'hex'));
}
function visionOf(map) {
    var v = map && map.fog && map.fog.vision, C = core(), def = C ? C.LIMITS.arcDeg : 180;
    if (v && v.mode === 'arc') return { mode: 'arc', arc: Math.max(1, Math.min(360, Math.round(v.arc || 0) || def)) };
    if (v && v.mode === 'all') return { mode: 'all', arc: 360 };
    return gridIsHexMap(map) ? { mode: 'arc', arc: def } : { mode: 'all', arc: 360 };
}
// The arc a token's eyes see through on a map (the owner's ruling of 2026-10-03), the one rule every reader of the eyes' arc asks: viewersFor,
// lightSeen, the marks' viewers and the text of sight. Token facing off: all round (nothing can aim a cone; host and client agree through the
// shared turning flag). A map whose Vision is All around: all round for every token (the map overrides). A map with a facing cone: the
// character's own arc where its sheet gives one (ts.arc, tokenSenses), wider or narrower than the map's, else the map's. ts: that token's
// tokenSenses, or nothing for the map's own arc
function eyesArc(map, ts) {
    if (window.wpVtt && !window.wpVtt.on('turning')) return 360;
    var v = visionOf(map);
    return v.mode === 'arc' && ts && typeof ts.arc === 'number' && ts.arc >= 1 ? ts.arc : v.arc;
}
function viewersFor(map, camp, ownerId, withH) {   // withH (item 19b): each viewer carries its token's height (h, yards)
    var out = [];   // each token's eyes by its own arc (eyesArc): facing feature off ⇒ all-around, as a map set All around; else the character's own, else the map's
    var waitSight = !!(camp && camp.newPlayers && typeof camp.newPlayers === 'object' && camp.newPlayers.sight === true);   // Onboarding F1a: a waiting token sees only when the campaign says so
    (map.whiteboard || []).forEach(function(w) {
        if (!w || w.hidden || w.type === 'light' || !(w.isChar || (w.waiting && waitSight))) return;
        if (ownerId && ownerId !== '*' && w.ownerId !== ownerId && !(ownerId === PARTY && playerTok(w))) return;   // R2 #14: the party sees by every player's token
        var x = w.x + (w.w || 60) / 2, y = w.y + (w.h || 52) / 2, front = (w.rot || 0) + (w.front || 0), ts = tokenSenses(w, map, camp, !ownerId || ownerId === '*'), arc = eyesArc(map, ts), n0 = out.length;
        out.push(ts.blind ? { x: x, y: y, front: front, range: 0, arc: arc, blind: true } : { x: x, y: y, front: front, range: ts.sight, arc: arc });   // world facing = rot + front, so the arc follows the token's rotation; senses S3: blind eyes, their own cell
        if (ts.full.length) senseViewers(ts, arc).forEach(function(s) { var v = { x: x, y: y, front: front, range: s.range, arc: s.arc, sense: true }; if (s.pass) v.pass = true; if (s.dim) v.dim = true; if (s.veil) v.veil = true; out.push(v); });   // senses S2a: a viewer per full sense, after its token's eyes
        if (withH === true) { var hh = tokHeight(w, map, forPlayers(ownerId)); for (var hi = n0; hi < out.length; hi++) out[hi].h = hh; }   // for a player or the party: from the pieces players hold only
    });
    return out;
}
// ---- sight-blockers: the opaque-cell key set for a map, built from flagged board items (v1: static walls) ----
var _blockerCache = Object.create(null), _blockerStamp = Object.create(null), _blockerWarned = Object.create(null);
var _blockerSig = Object.create(null), _blockerVer = Object.create(null), _blockerOver = Object.create(null);   // lighting review: a map's blocker CONTENT version (the viewer memo keys on it, not on every save)
function eligibleBlocker(w) {
    if (!w || !w.blocksSight || w.hidden) return false;             // hidden never blocks (host & client must agree)
    if (w.isChar || w.waiting) return false;                        // a token never blocks sight: a player's copy may lack it (fog drops it), so host and client would disagree
    if (w.sightType === 'door' && w.doorOpen) return false;         // an OPEN door blocks nothing; a closed one blocks like a wall
    if (w.fill) return true;                                        // a fill-bucket cell
    return w.type === 'rect' || w.type === 'hexagon' || w.type === 'diamond' || w.type === 'circle' || w.type === 'image' || w.type === 'path';   // item 18: a solid shape or an image, turned or not, by its outline (fogcore itemCells); W2: a pen line as the line itself (pathSegs)
}
// Senses S7b (the owner's answer 5a): smoke — a piece the GM ticks as smoke (item.smoke, true) hides what is in it and past it from the eyes and
// from every sense the walls stop that does not see through smoke (a sense's veil). A set of its own beside the sight-blockers, so movement,
// cover, light and doors never read it: tokens walk through it, it gives no cover, light passes and a light in it stays put. Like a wall, only
// a piece that is not hidden counts (a player's app judges from its own copy); a turned shape other than a circle is not supported
// Difficult terrain T2: the map's difficult cells, { cellKey: cost } (the highest cost of the shown pieces over each cell) or null, kept on
// the map's save stamp and grid. A piece counts as Smoke's would be read: one of the four shapes (a painted cell is one), never hidden, a
// token, a waiting token, a GM-note card or a turned one but a circle; its cost as fogcore cleanTerrain keeps it. Under the walls' cap, judged
// on a piece's box first: over it no terrain counts (the same answer on every side), and the GM is told once
var _terrCache = Object.create(null), _terrStamp = Object.create(null), _terrWarned = Object.create(null);
function terrainFor(map, grid) {
    if (!map || !grid) return null;
    var stamp = ((map.meta && map.meta.updated) || 0) + '|' + grid.type + ':' + (grid.size || grid.s);
    if (_terrStamp[map.id] === stamp) return _terrCache[map.id];
    var C = core(), set = null, n = 0, over = false, cap = C.LIMITS.blockerCells, cw = grid.type === 'square' ? grid.size : 1.5 * grid.s, ch = grid.type === 'square' ? grid.size : grid.h;
    (map.whiteboard || []).forEach(function(w) {
        var t = w && C.cleanTerrain ? C.cleanTerrain(w.terrain) : null;
        if (over || !t || w.hidden || w.isChar || w.waiting || w.gmNoteFor || ['rect', 'hexagon', 'circle', 'diamond'].indexOf(w.type) < 0 || (w.type !== 'circle' && w.rot)) return;
        var bw = Math.abs(Number(w.w) || 0), bh = Math.abs(Number(w.h) || 0);
        if (!isFinite(bw) || !isFinite(bh) || (bw / cw + 2) * (bh / ch + 2) > cap) { over = true; return; }
        footprintCells(w, grid, C).forEach(function(c) { var k = C.cellKey(c, grid); set = set || Object.create(null); if (!set[k]) { if (++n > cap) over = true; set[k] = t; } else if (t > set[k]) set[k] = t; });
    });
    if (over) { set = null; if (!_terrWarned[map.id] && !isClientView()) { _terrWarned[map.id] = 1; toast('Too much difficult terrain on this map — none of it counts here.'); } }
    else _terrWarned[map.id] = 0;
    _terrStamp[map.id] = stamp; _terrCache[map.id] = set;
    return set;
}
var _smokeCache = Object.create(null), _smokeStamp = Object.create(null), _smokeSig = Object.create(null), _smokeVer = Object.create(null), _smokeUnion = Object.create(null), _smokeWarned = Object.create(null);
function smokeFor(map, grid) {   // { cellKey: 1 } or null, kept on the map's save stamp and grid; its content version moves only when the set does
    var stamp = ((map.meta && map.meta.updated) || 0) + '|' + grid.type + ':' + (grid.size || grid.s);
    if (_smokeStamp[map.id] === stamp) return _smokeCache[map.id];
    // the walls' cap holds for smoke too, judged on a piece's box before its cells are listed: over it no smoke hides anything (the same answer
    // on every side, as for walls), and the GM is told once
    var C = core(), set = null, n = 0, over = false, cap = C.LIMITS.blockerCells, cw = grid.type === 'square' ? grid.size : 1.5 * grid.s, ch = grid.type === 'square' ? grid.size : grid.h;
    (map.whiteboard || []).forEach(function(w) {
        if (over || !w || w.smoke !== true || w.hidden || w.isChar || w.waiting || w.gmNoteFor || ['rect', 'hexagon', 'circle', 'diamond'].indexOf(w.type) < 0 || (w.type !== 'circle' && w.rot)) return;
        var bw = Math.abs(Number(w.w) || 0), bh = Math.abs(Number(w.h) || 0);
        if (!isFinite(bw) || !isFinite(bh) || (bw / cw + 2) * (bh / ch + 2) > cap) { over = true; return; }
        footprintCells(w, grid, C).forEach(function(c) { var k = C.cellKey(c, grid); set = set || Object.create(null); if (!set[k]) { set[k] = 1; if (++n > cap) over = true; } });
    });
    if (over) { set = null; if (!_smokeWarned[map.id] && !isClientView()) { _smokeWarned[map.id] = 1; toast('Too much smoke on this map — smoke is not hiding anything here.'); } }
    else _smokeWarned[map.id] = 0;
    var sig = set ? Object.keys(set).sort().join(';') : '';
    if (_smokeSig[map.id] !== sig) { _smokeSig[map.id] = sig; _smokeVer[map.id] = (_smokeVer[map.id] || 0) + 1; delete _smokeUnion[map.id]; }
    _smokeStamp[map.id] = stamp; _smokeCache[map.id] = set;
    return set;
}
function smokeUnion(map, blk, sm, tag) {   // the walls and the smoke as one set, for a line smoke stops; kept while the walls' set is the same object (tag, item 19b: the 3D line's walls keep a union of their own)
    if (tag) { var sh = _smokeUnionH[map.id]; if (!sh || sh.blk !== blk || sh.sm !== sm) { var uh = Object.create(null), kh; if (blk) for (kh in blk) uh[kh] = 1; for (kh in sm) uh[kh] = 1; core().copyWalls(blk, uh); sh = _smokeUnionH[map.id] = { blk: blk, sm: sm, set: uh }; } return sh.set; }
    var su = _smokeUnion[map.id];
    if (!su || su.blk !== blk) { var un = Object.create(null), k; if (blk) for (k in blk) un[k] = 1; for (k in sm) un[k] = 1; core().copyWalls(blk, un); su = _smokeUnion[map.id] = { blk: blk, set: un }; }   // item 18 W2: the walls' thin walls too
    return su.set;
}
// The grid cells an eligible blocker item covers — shared by blockersFor and the door click-toggle so they agree.
function footprintCells(w, grid, C) { return C.itemCells(w, grid); }   // item 18: by its outline, turned as the board draws it (unturned: as before)
function blockersFor(map, grid) {
    if (!map || !grid) return null;
    // Key the memo on map.meta.updated (stamped every save, io.js) as well as map.id, so a blocker MOVE busts it even
    // in solo mode — there onLocalSave early-returns before invalidateVision(), so id alone would go stale.
    var stamp = (map.meta && map.meta.updated) || 0;
    if (_blockerCache[map.id] !== undefined && _blockerStamp[map.id] === stamp) return _blockerCache[map.id];
    var C = core(), wb = map.whiteboard || [], set = Object.create(null), n = 0, over = false, segs = [];
    for (var i = 0; i < wb.length && !over; i++) {
        var w = wb[i]; if (!eligibleBlocker(w)) continue;
        if (w.type === 'path') { var ps = C.pathSegs(w); for (var q = 0; q < ps.length; q++) { segs.push(ps[q]); if (segs.length > C.LIMITS.wallSegs) { over = true; break; } } continue; }   // item 18 W2: a pen line blocks as its line
        var cells = footprintCells(w, grid, C);
        for (var j = 0; j < cells.length; j++) { var k = C.cellKey(cells[j], grid); if (!set[k]) { set[k] = 1; if (++n > C.LIMITS.blockerCells) { over = true; break; } } }
    }
    if (over && !_blockerWarned[map.id]) { _blockerWarned[map.id] = 1; toast('Too many sight-blockers on this map — vision is not being blocked here.'); }
    if (!over) _blockerWarned[map.id] = 0;
    var result = (over || (n === 0 && !segs.length)) ? null : C.withWalls(set, segs, grid);   // over cap or none → no occlusion (fail open); item 18 W2: the lines' walls on the set
    _blockerOver[map.id] = over;   // lighting review: over the cap no wall blocks, so no light may be judged through them (the map reads by sight only)
    var bsig = result ? Object.keys(result).sort().join(';') + (segs.length ? '|' + segs.map(function(s) { return s.map(function(v) { return Math.round(v * 10) / 10; }).join(','); }).join(';') : '') : '';   // W2: a moved line is a new version
    if (_blockerSig[map.id] !== bsig) { _blockerSig[map.id] = bsig; _blockerVer[map.id] = (_blockerVer[map.id] || 0) + 1; }
    _blockerStamp[map.id] = stamp;
    _blockerCache[map.id] = result;
    return result;
}
// A play-area item's footprint cells. Unlike sight-blockers (which punt on rotation), images/shapes can be rotated,
// so a rotated item is tested cell-by-cell against its OWN un-rotated box: exact for images/rects, a safe slight
// over-fog for hex/diamond, and it never LEAKS off a tilted corner. Circles are rotation-invariant; a fill is one cell.
function maskFootprint(w, grid, C) {
    if (!w.rot || w.fill || w.type === 'circle') return footprintCells(w, grid, C);
    var rad = w.rot * Math.PI / 180, ww = w.w || 0, hh = w.h || 0, cx = w.x + ww / 2, cy = w.y + hh / 2;
    var bw = Math.abs(ww * Math.cos(rad)) + Math.abs(hh * Math.sin(rad)), bh = Math.abs(ww * Math.sin(rad)) + Math.abs(hh * Math.cos(rad));
    var box = C.cellsUnderRect(cx - bw / 2, cy - bh / 2, bw, bh, grid), cos = Math.cos(-rad), sin = Math.sin(-rad), out = [];
    for (var i = 0; i < box.length; i++) {
        var p = C.cellCenter(box[i], grid), dx = p.x - cx, dy = p.y - cy;
        var lx = dx * cos - dy * sin + cx, ly = dx * sin + dy * cos + cy;   // rotate the cell centre back into the item's own frame
        if (lx >= w.x && lx <= w.x + ww && ly >= w.y && ly <= w.y + hh) out.push(box[i]);
    }
    return out;
}
// ---- fog areas ("play areas"): the cell region fog is CONFINED to, built from board items flagged `fogged` ----
// A per-item `fogged` flag marks an image/shape as a play area. Fog lives ONLY inside the union of such items'
// footprints — outside stays lit, so scenes and map art the GM never flagged are never fogged. With NO flagged
// item on the map, the campaign default decides: 'all' (fog the whole map — the pre-1.5.0 behaviour) or 'none'
// (no fog until an area is marked). Hidden items never contribute: a hidden item is not sent to players at all, so
// host and client must both ignore them to agree (same rule as the sight-blockers above).
var _maskCache = Object.create(null), _maskStamp = Object.create(null);
function fogSig(wb) { var s = ''; for (var i = 0; i < wb.length; i++) { var w = wb[i]; if (w && w.fogged && !w.hidden) s += w.id + ':' + w.x + ',' + w.y + ',' + (w.w || 0) + ',' + (w.h || 0) + ',' + (w.rot || 0) + ';'; } return s; }
function fogMask(map, camp, grid) {
    if (!map || !grid) return { mode: 'all' };
    var stamp = ((map.meta && map.meta.updated) || 0) + '|' + fogSig(map.whiteboard || []);   // a play area dragged live masks where it is now, not where it was saved (review follow-up b)
    if (_maskCache[map.id] !== undefined && _maskStamp[map.id] === stamp) return _maskCache[map.id];
    var C = core(), wb = map.whiteboard || [], set = Object.create(null), cells = [], n = 0, any = false, over = false;
    for (var i = 0; i < wb.length && !over; i++) {
        var w = wb[i]; if (!w || !w.fogged || w.hidden) continue;
        any = true;
        var fc = maskFootprint(w, grid, C);
        for (var j = 0; j < fc.length; j++) { var k = C.cellKey(fc[j], grid); if (!set[k]) { set[k] = 1; cells.push(fc[j]); if (++n > C.LIMITS.blockerCells) { over = true; break; } } }
    }
    var result;
    if (any && !over) result = { mode: 'set', keys: set, cells: cells };
    else if (any) result = { mode: 'all' };                             // over the cap → fail to whole-map fog (never under-fogs)
    else { var emp = campFog(camp).defaults.emptyFog; result = { mode: emp === 'none' ? 'none' : 'all' }; }
    _maskStamp[map.id] = stamp; _maskCache[map.id] = result;
    return result;
}
function inMask(mask, key) { return mask.mode === 'all' ? true : (mask.mode === 'none' ? false : !!mask.keys[key]); }
// Cover between two board points, for the ruler readout (1.5.0, v1). Resolve both ends to cells on the ACTIVE map's
// grid, reuse the same sight-blocker set fog uses, and map the system-neutral result to this campaign-system's cover
// tier. Returns { name, block } or null (no grid / same cell / no cover / cover off). Local + advisory: reads state,
// mutates nothing, sends nothing on the wire; host and client both run the identical fogcore + coverTier.
function coverBetween(x1, y1, x2, y2, hA, hB) {   // item 19 H1: hA, hB — the heights at the two ends (yards; the first end looks at the second), read by the system's height rule
    var map = activeMap(), camp = activeCamp(), C = core(); if (!map || !C) return null;
    if (!coverOn(camp && camp.system)) return null;                     // cover off (the default): nothing to work out
    var grid = gridForMap(map); if (!grid) return null;                 // gridless with no assigned cell → can't measure cover
    var a = C.cellOf(x1, y1, grid), b = C.cellOf(x2, y2, grid);
    if (C.cellKey(a, grid) === C.cellKey(b, grid)) return null;         // same cell → no cover
    var sys = camp && camp.system; if (!window.wpSystemCore) return null;
    var cs = coverSetsFor(map, grid), h3 = typeof heightSightOf === 'function' ? heightSightOf(sys) : null;
    if (h3 && h3.mode === '3d') { var pa = C.cellCenter(a, grid), pb = C.cellCenter(b, grid); cs = cover3d(cs, grid, pa.x, pa.y, hNum(hA) + h3.eye, pb.x, pb.y, hNum(hB)); }   // item 19b H4: the true 3D line, from the first end's eye
    else if (heightRuleOf(sys) === 'clears') cs = heightCover(cs, hA, hB, grid);   // item 19 H1: height clears low cover (from above; from below it hides)
    var cov = C.coverBetween(a, b, grid, cs && cs.hard, cs && cs.soft, cs && cs.all);   // cover follow-ups: the cover pieces (a see-over one too, never a token)
    return window.wpSystemCore.coverTier(sys, cov.coverage, cov.lineOfEffect);
}
// Cover follow-ups (owner 2026-09-28): the cells that give cover on a map — hard (a sight-blocker) and soft (see-over: a crate, a low wall), by
// fogcore coverRole (never a token, a hidden piece or an open door; a piece set to no cover gives none). Memoised like blockersFor (map.id +
// its saved stamp); none, or the walls over the cells cap: null (no cover: fail open, as blockersFor)
var _coverCache = Object.create(null), _coverStamp = Object.create(null);
function coverSetsFor(map, grid) {
    if (!map || !grid) return null;
    var stamp = (map.meta && map.meta.updated) || 0;
    if (_coverCache[map.id] !== undefined && _coverStamp[map.id] === stamp) return _coverCache[map.id];
    var C = core(), wb = map.whiteboard || [], cap = C.LIMITS.blockerCells, hard = Object.create(null), soft = Object.create(null), nh = 0, ns = 0, over = false, hs = [], ss = [];
    var softH = Object.create(null), softLines = [];   // item 19 H1: each see-over cell's height (its tallest piece; 1 yard where none is given) and each see-over line's
    var hardH = Object.create(null), hardLines = [], fullW = null, lowW = false;   // item 19b H4: each wall cell's height (Infinity where a piece with none stands in it) and each wall line's; fullW: the walls with no height; lowW: some wall has a height
    for (var i = 0; i < wb.length && !over; i++) {
        var role = C.coverRole(wb[i]); if (!role) continue;
        var hW = C.cleanHeight(wb[i].height) || 1, hR = role === 'hard' ? C.cleanHeight(wb[i].height) || Infinity : 0; if (role === 'hard' && hR < Infinity) lowW = true;
        if (wb[i].type === 'path') { var pz = C.pathSegs(wb[i]), into = role === 'hard' ? hs : ss; for (var q = 0; q < pz.length; q++) { into.push(pz[q]); if (hs.length > C.LIMITS.wallSegs) { over = true; break; } } if (ss.length > C.LIMITS.wallSegs) ss.length = C.LIMITS.wallSegs; if (role === 'soft' && pz.length) softLines.push({ segs: pz, h: hW }); if (role === 'hard' && pz.length) hardLines.push({ segs: pz, h: hR }); continue; }   // item 18 W2: a pen line's cover is its line
        var cells = footprintCells(wb[i], grid, C);
        for (var j = 0; j < cells.length; j++) { var k = C.cellKey(cells[j], grid); if (role === 'hard') { if (!(hardH[k] >= hR)) hardH[k] = hR; if (!hard[k]) { hard[k] = 1; if (++nh > cap) { over = true; break; } } } else { if (!soft[k] && ns <= cap) { soft[k] = 1; ns++; } if (soft[k] && !(softH[k] >= hW)) softH[k] = hW; } }
    }
    // the walls and the see-over cells together over the cap (a cell counted once): the walls keep their cover, the see-over pieces give none.
    // all: the union the fogcore calls read, built once here
    var all = hard;
    if (!over && ns) { all = Object.create(null); for (var hk in hard) all[hk] = 1; for (var sk in soft) all[sk] = 1; if (Object.keys(all).length > cap) { all = hard; soft = Object.create(null); ns = 0; ss = []; softLines = []; } }
    var hasH = nh || hs.length, hasS = ns || ss.length;   // item 18 W2: the lines' walls on the sets that give their cover (all: both)
    if (hasS && all === hard) { all = Object.create(null); for (var hk2 in hard) all[hk2] = 1; }
    if (hasH) C.withWalls(hard, hs, grid); if (hasS) { C.withWalls(soft, ss, grid); if (all !== hard) C.withWalls(all, hs.concat(ss), grid); }
    if (!over && hardLines.some(function(g) { return g.h < Infinity; })) { var fsg = []; hardLines.forEach(function(g) { if (!(g.h < Infinity)) g.segs.forEach(function(s) { fsg.push(s); }); }); fullW = C.withWalls(Object.create(null), fsg, grid); }
    var result = over || !(hasH || hasS) ? null : { hard: hasH ? hard : null, soft: hasS ? soft : null, all: all, softH: softH, softLines: softLines, hardH: hardH, hardLines: hardLines, fullW: fullW, lowW: lowW };
    _coverStamp[map.id] = stamp; _coverCache[map.id] = result;
    return result;
}
// [fogcheck:heightcover-start]
// Item 19 H1 (the owner's answer, 2026-09-30: the handbook's Ch7 rule, per system — "height clears low cover"): the map's cover sets for one
// attacker at height hA and one target at hT (yards). A see-over piece hH tall (1 yard where none is given) gives no cover when hA > hH (looked
// at from above it), hides the target as a wall does (total) when hA < hT <= hH (from below), else is see-over cover as before; walls block
// at any height. The map's own sets (coverSetsFor) untouched; no see-over piece: those very sets
function heightRuleOf(sys) { var h = sys && sys.combat && typeof sys.combat === 'object' ? sys.combat.height : null; return h && typeof h === 'object' && h.rule === 'clears' ? 'clears' : ''; }
function heightCover(cs, hA, hT, grid) {
    var C = core(); if (!cs || (!cs.soft && !(cs.softLines && cs.softLines.length))) return cs;
    hA = typeof hA === 'number' && isFinite(hA) ? hA : 0; hT = typeof hT === 'number' && isFinite(hT) ? hT : 0;
    var soft = Object.create(null), hide = Object.create(null), ns = 0, nx = 0, k, sSegs = [], xSegs = [];
    for (k in cs.soft || {}) { var H = cs.softH && cs.softH[k] >= 0 ? cs.softH[k] : 1; if (hA > H) continue; if (hA < hT && hT <= H) { hide[k] = 1; nx++; } else { soft[k] = 1; ns++; } }
    (cs.softLines || []).forEach(function(g) { if (hA > g.h) return; if (hA < hT && hT <= g.h) xSegs = xSegs.concat(g.segs); else sSegs = sSegs.concat(g.segs); });
    var hard = cs.hard;
    if (nx || xSegs.length) { hard = Object.create(null); for (k in cs.hard || {}) hard[k] = 1; C.copyWalls(cs.hard, hard); for (k in hide) hard[k] = 1; C.withWalls(hard, xSegs, grid); }
    var softOut = ns || sSegs.length ? C.withWalls(soft, sSegs, grid) : null, all = hard;
    if (softOut) { all = Object.create(null); for (k in hard || {}) all[k] = 1; for (k in soft) all[k] = 1; C.copyWalls(hard, all); C.copyWalls(softOut, all); }
    return { hard: hard, soft: softOut, all: all };
}
// Item 19b H4 (the owner's answer of 2026-10-01): the map's cover sets for one pair under the true 3D sightline. A piece with a height — a
// see-over piece (its own, 1 yard where none is given) or a sight-blocker that has one — counts only where the straight line from the first
// end (zA: its eye) to the second (zB) runs at or below the piece where it passes it, and then stops the line as a wall does; a sight-blocker
// with no height always counts. The map's own sets (coverSetsFor) untouched; nothing left: null. A map with no see-over piece and no wall
// that has a height: those very sets (nothing is judged by height there)
function cover3d(cs, grid, ax, ay, zA, bx, by, zB) {
    var C = core(); if (!cs || (!cs.lowW && !cs.soft && !(cs.softLines && cs.softLines.length))) return cs;
    var hard = Object.create(null), n = 0, segs = [], k, sq = grid.type === 'square', anyH = false;
    var under = function(key, H) { var sp = key.split(sq ? ',' : ':'), p = C.cellCenter(sq ? { c: +sp[0], r: +sp[1] } : { q: +sp[0], r: +sp[1] }, grid); return !C.lineOverHeight(ax, ay, zA, bx, by, zB, p.x, p.y, H); };
    for (k in cs.hard || {}) { var H = cs.hardH && typeof cs.hardH[k] === 'number' ? cs.hardH[k] : Infinity; if (H < Infinity && !under(k, H)) continue; hard[k] = 1; n++; }
    for (k in cs.soft || {}) { if (hard[k]) continue; if (under(k, cs.softH && cs.softH[k] >= 0 ? cs.softH[k] : 1)) { hard[k] = 1; n++; } }
    (cs.hardLines || []).forEach(function(g) { if (g.h < Infinity) { anyH = true; g.segs.forEach(function(s) { if (!C.lineOverWall(ax, ay, zA, bx, by, zB, s, g.h)) segs.push(s); }); } });
    (cs.softLines || []).forEach(function(g) { g.segs.forEach(function(s) { if (!C.lineOverWall(ax, ay, zA, bx, by, zB, s, g.h)) segs.push(s); }); });
    C.copyWalls(anyH ? cs.fullW : cs.hard, hard);   // the walls with no height, as the map keeps them
    C.withWalls(hard, segs, grid);
    return n || C.wallsOf(hard) ? { hard: hard, soft: null, all: hard } : null;
}
// [fogcheck:heightcover-end]
// The cover a board point (a blast's centre) has to a token on a map: its system's tier, or null (no grid, cover off, none). Local and advisory on
// every viewer; the host alone turns it into damage (whiteboard.js applyBlastDamage)
function coverAt(x, y, tok, map, hFrom, hTok) {   // item 19 H1: hFrom, hTok — the blast's height and the token's (yards), read by the system's height rule
    var C = core(), camp = activeCamp(); if (!C || !C.coverFromPoint || !map || !tok) return null;
    var sys = camp && camp.system; if (!coverOn(sys) || !window.wpSystemCore) return null;
    var grid = gridForMap(map); if (!grid) return null;
    var cs = coverSetsFor(map, grid); if (!cs) return null;
    var h3 = typeof heightSightOf === 'function' ? heightSightOf(sys) : null;
    if (h3 && h3.mode === '3d') { cs = cover3d(cs, grid, x, y, hNum(hFrom), tok.x + (tok.w || 60) / 2, tok.y + (tok.h || 52) / 2, hNum(hTok)); if (!cs) return null; }   // item 19b H4: a blast has no eye: from its own height to the token's
    else if (heightRuleOf(sys) === 'clears') { cs = heightCover(cs, hFrom, hTok, grid); if (!cs) return null; }
    // a token over several cells is as exposed as its most exposed cell (the cells whose centres it covers, leaving out any inside a wall
    // unless all are; its centre's cell when it covers none, or more than 64, a box far bigger ruled out first): a line of effect to any cell
    // beats none, then the least coverage
    var w = tok.w || 60, h = tok.h || 52, cw = grid.type === 'square' ? grid.size : grid.s * 1.5, ch = grid.type === 'square' ? grid.size : grid.s * Math.sqrt(3);
    var cells = (w / cw + 2) * (h / ch + 2) > 1024 ? [] : C.cellsUnderRect(tok.x, tok.y, w, h, grid), best = null;
    if (!cells.length || cells.length > 64) cells = [C.cellOf(tok.x + w / 2, tok.y + h / 2, grid)];
    if (cs.hard && cells.length > 1) { var open = cells.filter(function(c) { return !cs.hard[C.cellKey(c, grid)]; }); if (open.length) cells = open; }
    for (var i = 0; i < cells.length; i++) {
        var cov = C.coverFromPoint(x, y, cells[i], grid, cs.hard, cs.soft, cs.all);
        if (!best || (cov.lineOfEffect && !best.lineOfEffect) || (cov.lineOfEffect === best.lineOfEffect && cov.coverage < best.coverage)) best = cov;
    }
    return window.wpSystemCore.coverTier(sys, best.coverage, best.lineOfEffect);
}
// Cover follow-ups (owner 2026-09-28, answer 5): where a thrown blast goes off — never inside a wall or a closed door (a cell with hard cover):
// fogcore openSeat moves it to the open cell in front, toward (tx, ty) (the thrower's token, else where the click landed). null: leave it where
// it was seated (cover off, no grid, no walls, an open cell). The host alone seats a throw (whiteboard.js placeThrownBlast)
function blastSeat(map, x, y, tx, ty) {
    var C = core(), camp = activeCamp(); if (!C || !C.openSeat || !map) return null;
    if (!coverOn(camp && camp.system)) return null;
    var grid = gridForMap(map); if (!grid) return null;
    var cs = coverSetsFor(map, grid); if (!cs || !cs.hard) return null;
    return C.openSeat(x, y, tx, ty, grid, cs.hard);
}
function coverOn(sys) { return !!(sys && sys.combat && sys.combat.cover && sys.combat.cover.on === true); }
// Turn-based combat T3a (D11): whether a token's straight move from (fx, fy) to (tx, ty) — its stored top-left — lands in or crosses a cell a
// sight-blocker occupies on this map (the same blocker cells fog uses: a closed door blocks, an open one or a hidden item never), or one a
// see-through barrier does (moveSetFor, below). The host's pos gate asks it for a player's move; no grid (and no fog cell): never
function moveBlocked(map, w, fx, fy, tx, ty) {
    var C = core(); if (!C || !C.moveClear || !map || map.type !== 'map') return false;
    var grid = gridForMap(map); if (!grid) return false;
    var bl = moveSetFor(map, grid, blockersFor(map, grid)); if (!bl) return false;   // what stops a token: the walls, and the barriers with them
    var hw = ((w && w.w) || 60) / 2, hh = ((w && w.h) || 52) / 2;
    return !C.moveClear(fx + hw, fy + hh, tx + hw, ty + hh, grid, bl);
}
// See-through barriers (1.5.1; the owner's ruling of 2026-10-03: "active force fields are see through and impassible"): what stops a player's
// token on a map — the walls (the fog's own sight-blocker set, handed in) and every barrier, a piece flagged barrier that stops movement and
// nothing else (fogcore barrierOn: never a hidden piece, a token or an open door). Asked by moveBlocked alone: sight, light, senses, marks,
// cover, smoke and the height rules never see this set. No barrier on the map: the walls' own set, the very object (exactly as before).
// With barriers: a new set of the walls' cells and thin walls plus each barrier's cells (its outline, turned as it is drawn) or, for a pen
// line, its line as thin walls. The caps are the walls' own, shared: barrier cells count after the walls' cells, barrier lines after the
// walls' lines, a piece judged on its box first (as smoke is); past either cap, or where the walls are over theirs, no barrier stops anything
// (the walls do what they did) and the GM is told once. Kept per map on its save stamp, its grid, the walls' set and the barriers themselves
// (barrierSig), so a door opened, a piece moved, hidden or unflagged is read at once
var _moveCache = Object.create(null), _moveWarned = Object.create(null);
function barrierSig(w) {
    var s = w.id + ':' + w.type + (w.fill ? 'f' : '') + ':' + w.x + ',' + w.y + ',' + (w.w || 0) + ',' + (w.h || 0) + ',' + (w.rot || 0);
    if (w.type === 'path') { var p = Array.isArray(w.pts) ? w.pts : [], a = p[0], z = p[p.length - 1]; s += ',' + (w.baseW || 0) + ',' + (w.baseH || 0) + ',' + (w.tip || '') + ',' + p.length + ',' + (Array.isArray(a) ? a[0] + ' ' + a[1] : '') + ',' + (Array.isArray(z) ? z[0] + ' ' + z[1] : '') + ',' + (Array.isArray(w.holes) ? w.holes.length : 0); }
    return s + ';';
}
function moveSetFor(map, grid, walls) {
    var C = core(), wb = map && map.whiteboard, bars = [], sig = '';
    if (!C || typeof C.barrierOn !== 'function' || !Array.isArray(wb)) return walls;
    for (var i = 0; i < wb.length; i++) { var w = wb[i]; if (C.barrierOn(w)) { bars.push(w); sig += barrierSig(w); } }
    if (!bars.length) return walls;   // no barrier on this map: the walls' own set, exactly as before
    var stamp = ((map.meta && map.meta.updated) || 0) + '|' + grid.type + ':' + (grid.size || grid.s) + '|' + sig, hit = _moveCache[map.id];
    if (hit && hit.stamp === stamp && hit.walls === walls) return hit.set;
    var cap = C.LIMITS.blockerCells, capS = C.LIMITS.wallSegs, set = Object.create(null), n = 0, ns = 0, segs = [], k, over = !!_blockerOver[map.id];   // the walls over their cap: the shared cap is spent
    var cw = grid.type === 'square' ? grid.size : 1.5 * grid.s, ch = grid.type === 'square' ? grid.size : grid.h;
    if (walls) for (k in walls) { set[k] = 1; n++; }
    (C.wallsOf(walls) || []).forEach(function(ix) { ns += ix.segs.length; });
    for (var b = 0; b < bars.length && !over; b++) {
        var p = bars[b];
        if (p.type === 'path') { var ps = C.pathSegs(p); for (var q = 0; q < ps.length; q++) { segs.push(ps[q]); if (++ns > capS) { over = true; break; } } continue; }   // a pen line stops a token as its line
        var bw = Math.abs(Number(p.w) || 0), bh = Math.abs(Number(p.h) || 0);
        if (!p.fill && (!isFinite(bw) || !isFinite(bh) || (bw / cw + 2) * (bh / ch + 2) > cap)) { over = true; break; }   // judged on its box before its cells are listed
        var cells = C.itemCells(p, grid);
        for (var j = 0; j < cells.length; j++) { k = C.cellKey(cells[j], grid); if (!set[k]) { set[k] = 1; if (++n > cap) { over = true; break; } } }
    }
    var res = walls;
    if (over) { if (!_moveWarned[map.id] && !isClientView()) { _moveWarned[map.id] = 1; toast('Too many barriers on this map — they are not stopping tokens here.'); } }
    else { _moveWarned[map.id] = 0; C.copyWalls(walls, set); res = C.withWalls(set, segs, grid); }
    _moveCache[map.id] = { stamp: stamp, walls: walls, set: res };
    return res;
}
// Turn-based combat T3b: how far a token's straight move goes, in this map's cells — whole cells on a grid (owner, 2026-10-01: "Moved 2.1
// squares" for a token standing off the grid was wrong): a hex grid counts hex steps between the token's centre cells; a square grid the
// squares between the cells it stands in, by the system's diagonal rule (systemcore gridCells), each end taken where Snap would seat the
// token (the lattice corner nearest its own, as a drop lands: datamap wpSeatDrop) so a token off the lattice, or one several squares wide
// whose centre lies on a line, counts steadily; no grid: the straight distance in 50px cells (as the ruler)
// Difficult terrain T2: what it costs, a move stepping into difficult terrain counted at that terrain's cost (moveCost); out.len, when given,
// the move's own length
function moveCells(map, w, fx, fy, tx, ty, diag, out) {
    var hw = ((w && w.w) || 60) / 2, hh = ((w && w.h) || 52) / 2;
    if (map && map.meta && map.meta.gridType === 'square') { fx = Math.round(fx / 50) * 50; fy = Math.round(fy / 50) * 50; tx = Math.round(tx / 50) * 50; ty = Math.round(ty / 50) * 50; }
    var mc = moveCost(map, fx + hw, fy + hh, tx + hw, ty + hh, diag);
    if (out && typeof out === 'object') out.len = mc.len;
    return mc.cost;
}
// Difficult terrain T2: a straight move between two board points as a turn's move counts it — { len, cost } in the map's cells (on a grid,
// from the cell the first point lies in to the cell the second does: whole cells, the length and the terrain walked on the same cells), the
// cost its length times the factor of the difficult terrain it steps into (on a square or hex grid; elsewhere the length)
function moveCost(map, x1, y1, x2, y2, diag) {
    var C = core(), S = window.wpSystemCore; if (!C || !map) return { len: 0, cost: 0 };
    var gt = map.meta && map.meta.gridType, len;
    if (gt === 'hex') { var g = C.gridFor('hex'); len = g ? C.hexDist(C.cellOf(x1, y1, g), C.cellOf(x2, y2, g)) : 0; }
    else if (gt === 'square') { var gs = C.gridFor('square'), ca = gs ? C.cellOf(x1, y1, gs) : null, cb = gs ? C.cellOf(x2, y2, gs) : null; len = !ca || !cb ? 0 : S && S.gridCells ? S.gridCells(cb.c - ca.c, cb.r - ca.r, diag) : Math.hypot(cb.c - ca.c, cb.r - ca.r); }
    else len = Math.hypot((x2 - x1) / 50, (y2 - y1) / 50);
    if (!(len > 0) || (gt !== 'square' && gt !== 'hex') || !C.terrainFactor) return { len: len || 0, cost: len || 0 };
    var grid = gridForMap(map), terr = grid ? terrainFor(map, grid) : null;
    return { len: len, cost: terr ? len * C.terrainFactor(C.cellOf(x1, y1, grid), C.cellOf(x2, y2, grid), grid, terr, diag) : len };
}
// GM clicks a door while in fog mode → flip open/closed on the topmost door under the point. Host-authoritative:
// save() runs onLocalSave (invalidateVision + resend the map to players); the invalidate+redraw refresh the GM overlay.
function toggleDoorAt(boardX, boardY) {
    if (!isGmView() || !canWrite()) return false;
    var map = activeMap(), C = core(); if (!map || !C) return false;
    var grid = gridForMap(map); if (!grid) return false;
    var key = C.cellKey(C.cellOf(boardX, boardY, grid), grid), wb = map.whiteboard || [];
    for (var i = wb.length - 1; i >= 0; i--) {
        var w = wb[i];
        if (!w || !C.isDoor(w) || w.hidden) continue;   // a wall's door or a see-through barrier's (fogcore isDoor)
        var cells = w.type === 'path' ? C.pathCells(w, grid) : footprintCells(w, grid, C);   // item 18 W2: a line door is found on the cells its line passes
        for (var j = 0; j < cells.length; j++) {
            if (C.cellKey(cells[j], grid) === key) { w.doorOpen = !w.doorOpen; save(); if (window.appRender) window.appRender(); invalidateVision(); redraw(); toast(w.doorOpen ? 'Door opened.' : 'Door closed.'); return true; }
        }
    }
    return false;
}

// Lighting (backlog 14, owner 2026-09-28): with the `lighting` VTT feature on (the default), a map's light — map.fog.light bright, dim or dark, or
// absent = auto: bright while no light source is placed on it, dark once the GM places one (a light item; a token's own light never darkens a
// map) — lets a token see every lit cell in its line of sight out to the vision cap, and its Sight becomes how far it sees in the dark. Off:
// null, fog exactly as before (Sight is a radius). Host and client read the same map.fog and the GM's switch
function placedLights(map) { var wb = (map && map.whiteboard) || []; for (var i = 0; i < wb.length; i++) { var w = wb[i]; if (w && w.type === 'light' && !w.hidden && !w.gmNoteFor) return true; } return false; }
function mapLevel(map) {
    if (!lightingOn() || !map) return null;
    var l = mapFog(map).light;
    return l === 'dark' ? 0 : l === 'dim' ? 1 : l === 'bright' ? 2 : placedLights(map) ? 0 : 2;
}
// Lighting (L2): a map's light sources — every item with a light (a light source the GM placed, a token's own light), not hidden and not switched
// off; its origin the item's centre cell (in a wall or a closed door: the open cell beside it, so it never lights both sides); radii from yards
// to this map's cells. Over LIMITS.lights sources, none: the map reads dark (the GM is told once)
var _litCache = Object.create(null), _lightsWarned = Object.create(null), _visitsWarned = Object.create(null), _lightsOver = Object.create(null), _fogLitIds = typeof WeakMap === 'function' ? new WeakMap() : null, _fogLitN = 0, _fogLitLast = Object.create(null), _srcLit = Object.create(null);
function lightSources(map, grid, blk, skip) {   // skip: ids left out (L3: the items dropped from one player's copy)
    var C = core(), out = [], wb = map.whiteboard || [], per = cellYardsForMap(map);
    for (var i = 0; i < wb.length; i++) {
        var w = wb[i]; if (!w || w.hidden || w.gmNoteFor || !w.light) continue;   // a GM-note card never reaches a player: its light would too
        if ((skip && skip[w.id]) || w.waiting) continue;   // a waiting token carries no light (its copy on the wire has none)
        var L = C.cleanLight(w.light); if (!L || L.off) continue;
        var cx = w.x + (w.w || 0) / 2, cy = w.y + (w.h || 0) / 2, cell = C.cellOf(cx, cy, grid);
        if (blk && blk[C.cellKey(cell, grid)]) {   // in a wall or a closed door: the open cell on the side the item sits (centred on the cell: the side it faces, up when unturned)
            var cc = C.cellCenter(cell, grid), tx = cx, ty = cy;
            if (Math.abs(cx - cc.x) < 1 && Math.abs(cy - cc.y) < 1) { var fb = ((w.rot || 0) + (w.front || 0)) * Math.PI / 180; tx = cx + Math.sin(fb) * 50; ty = cy - Math.cos(fb) * 50; }
            var st = C.openSeat(cx, cy, tx, ty, grid, blk); if (!st) continue; cell = C.cellOf(st.x, st.y, grid);
        }
        out.push({ cell: cell, bright: L.bright > 0 ? C.unitCells(L.bright, L.unit, per) : -1, dim: C.unitCells(L.dim, L.unit, per) });   // bright -1: a dim-only light; L4: the radii in the light's own unit
    }
    if (!skip) _lightsOver[map.id] = out.length > C.LIMITS.lights;
    if (out.length > C.LIMITS.lights) { if (!_lightsWarned[map.id] && isGmView()) { _lightsWarned[map.id] = 1; toast('Too many light sources on this map — it reads dark until there are fewer.'); } return []; }
    _lightsWarned[map.id] = 0;
    return out;
}
// The cells a map's lights light (fogcore litLevels), memoised on the sources, the grid and the blockers' content: { sig, lit, ver, capped } or
// null with no light source. Too much to walk: lit nothing (dark), capped. A player's copy (L3) adds the lit cells the host sent it (fogLit: a
// light on a creature they cannot see) and reads dark while the host's lights are past a cap (lightsCapped)
function litFor(map, grid, blk) {
    var C = core(), client = isClientView(), fl = client && Array.isArray(map.fogLit) ? map.fogLit : null;
    if (client && map.lightsCapped === true) return null;
    var src = lightSources(map, grid, blk); if (!src.length && !fl) return null;
    var flId = 0;   // the lit cells the host sent, keyed on their content: a map re-sent with the same cells keeps the memo
    if (fl && _fogLitIds) { flId = _fogLitIds.get(fl); if (!flId) { var fsig = fl.map(function(e) { return C.cellKey(e, grid) + ':' + e.t; }).join(';'), last = _fogLitLast[map.id]; if (last && last.sig === fsig) flId = last.id; else { flId = ++_fogLitN; _fogLitLast[map.id] = { sig: fsig, id: flId }; } _fogLitIds.set(fl, flId); } }
    var sig = grid.type + ':' + (grid.size || grid.s) + '|' + (_blockerVer[map.id] || 0) + '|' + src.map(function(s) { return C.cellKey(s.cell, grid) + ':' + s.bright + ':' + s.dim; }).join(';') + '|fl' + flId;
    var mc = _litCache[map.id]; if (mc && mc.sig === sig) return mc;
    var lit = src.length ? C.litLevels(src, grid, blk) : Object.create(null);
    if (lit && fl) fl.forEach(function(e) { var k = C.cellKey(e, grid); if (!(lit[k] >= e.t)) lit[k] = e.t; });
    if (!lit) { if (!_visitsWarned[map.id] && isGmView()) { _visitsWarned[map.id] = 1; toast('These lights reach too far to work out together — the map reads dark until there are fewer or smaller ones.'); } }
    else _visitsWarned[map.id] = 0;
    mc = _litCache[map.id] = { sig: sig, lit: lit || Object.create(null), ver: ((mc && mc.ver) || 0) + 1, capped: !lit };
    return mc;
}
// Lighting (L3, owner answer 2): what one player's copy of a lit map needs beyond its own lights. The host works out the cells that player sees
// (with every light) and sends the ones a light on a creature dropped from their copy lights more than their copy's own lights do — a torch round
// a corner: cells and levels only, never the carrier. capped: the host's lights past a cap, so their copy reads dark as the host's does. null
// when there is nothing to add (the common case: nobody unseen carries a light)
function fogLitFor(recipientId, camp, map, drop) {
    if (!fogFeatureOn() || !map || map.type !== 'map') return null;
    var mf = mapFog(map); if (!mf.on || mf.mode !== 'auto') return null;   // reveal shows the whole map; cover reads no light
    var C = core(), grid = gridForMap(map); if (!C || !grid) return null;
    var lvl = mapLevel(map); if (lvl === null) return null;
    var blk = blockersFor(map, grid); if (_blockerOver[map.id]) return null;   // walls over their cap: no light is judged anywhere (both sides)
    var lc = litFor(map, grid, blk);
    if (_lightsOver[map.id] || (lc && lc.capped)) return { lit: [], capped: true };
    if (!lc || !drop) return null;
    // the light the player's copy lacks is the light of the items dropped from it (usually one or two): only theirs are flooded first
    var keep = Object.create(null); (map.whiteboard || []).forEach(function(w) { if (w && !drop[w.id]) keep[w.id] = 1; });
    var dsrc = lightSources(map, grid, blk, keep); if (!dsrc.length) return null;
    var vs = viewersFor(map, camp, recipientId).filter(function(v) { return !v.sense && !v.blind; }); if (!vs.length) return null;   // senses S2a: light by the eyes only (a sense sees without it); S3: never blind eyes
    var dLit = litOf(map, grid, blk, dsrc);
    // the cells this player's tokens see: their line of sight as their copy works it out — never a manual reveal (no light is read there), a
    // manual cut left in (a cut beside a lit wall still lights its face on their side)
    var cand = [], ck = Object.create(null); _viewPass++;
    vs.forEach(function(v) { var s = viewSeen(map, grid, blk, lvl, v, lc); for (var i = 0; i < s.length; i++) { var k = s[i].key; if (!ck[k] && (dLit[k] || 0) > lvl) { ck[k] = 1; cand.push(s[i]); } } });
    if (!cand.length) return null;
    var ownLit = litOf(map, grid, blk, lightSources(map, grid, blk, drop)), out = [];
    cand.forEach(function(o) { var h = dLit[o.key]; if (h > (ownLit[o.key] || 0)) out.push(o.cell.q !== undefined ? { q: o.cell.q, r: o.cell.r, t: h } : { c: o.cell.c, r: o.cell.r, t: h }); });
    return out.length ? { lit: out, capped: false } : null;
}
// The lit cells of a set of light sources, memoised per map on the sources, the grid and the walls: players who miss the same lights share
// them, and a re-send while nothing moved floods nothing
function litOf(map, grid, blk, src) {
    var C = core(); if (!src.length) return Object.create(null);
    var sig = grid.type + ':' + (grid.size || grid.s) + '|' + (_blockerVer[map.id] || 0) + '|' + src.map(function(s) { return C.cellKey(s.cell, grid) + ':' + s.bright + ':' + s.dim; }).join(';');
    var mc = _srcLit[map.id] || (_srcLit[map.id] = []);
    for (var i = 0; i < mc.length; i++) if (mc[i].sig === sig) return mc[i].lit;
    var lit = C.litLevels(src, grid, blk) || Object.create(null);
    mc.unshift({ sig: sig, lit: lit }); if (mc.length > 8) mc.length = 8;
    return lit;
}
// How many light sources a map holds (the cap is refused when a light is added)
function lightCount(map) { var C = core(), n = 0; ((map && map.whiteboard) || []).forEach(function(w) { if (w && !w.hidden && !w.gmNoteFor && w.light && C && C.cleanLight(w.light)) n++; }); return n; }
// One viewer's seen cells, memoised per map on its cell, facing (only for a cone: all-around vision never reads it), sight and arc, so a drag
// recomputes only the token that moves. The memo is stamped on exactly what seenCells reads beyond the viewer — the grid, the map's light level
// and its blockers' content version — so a save that changes none of them (a token moved, a note typed) keeps it. Bounded by cells across
// every map (senses S2a): past the budget entries go until 80% of it holds the new one — other maps' first, the least recently used first,
// then this map's own from an earlier pass (the pass under way is about to ask for them), never an entry used in the pass under way (a
// revealed set, a player's lit cells) — so a table whose senses multiply the viewers is not swept afresh on every draw
var _viewCache = Object.create(null), _viewCells = 0, VIEW_BUDGET = 600000, _viewTick = 0, _viewPass = 0;
function viewEvict(need, mapId) {
    var others = [], mine = [];
    Object.keys(_viewCache).forEach(function(id) { var mc = _viewCache[id]; Object.keys(mc.m).forEach(function(k) { var e = mc.m[k]; if (e.pass !== _viewPass) (id === mapId ? mine : others).push({ mc: mc, k: k, e: e }); }); });
    var byUse = function(a, b) { return a.e.used - b.e.used; }, all = others.sort(byUse).concat(mine.sort(byUse));
    for (var i = 0; i < all.length && _viewCells + need > VIEW_BUDGET * 0.8; i++) { var o = all[i]; delete o.mc.m[o.k]; o.mc.cells -= o.e.hit.length; _viewCells -= o.e.hit.length; }
}
function viewSeen(map, grid, blk, lvl, v, lc, tag) {   // tag (item 19b): the cells seen past the 3D line's walls, kept apart from the map's own
    var sm = smokeFor(map, grid), useSm = !!sm && !v.veil && !(v.sense && v.pass);   // senses S7b: smoke hides from the eyes and from a sense the walls stop that does not see through it
    var C = core(), stamp = grid.type + ':' + (grid.size || grid.s) + '|' + lvl + '|' + (_blockerVer[map.id] || 0) + '|' + ((tag ? blockersFor(map, grid) : blk) ? 1 : 0) + '|' + (lc ? lc.ver : 0) + '|' + (_smokeVer[map.id] || 0), mc = _viewCache[map.id];   // tag (item 19b): the stamp stays the map's own, so both sets of cells share one memo
    if (!mc || mc.stamp !== stamp) { if (mc) _viewCells -= mc.cells; mc = _viewCache[map.id] = { stamp: stamp, m: Object.create(null), cells: 0 }; }
    var k = C.cellKey(C.cellOf(v.x, v.y, grid), grid) + '|' + (v.arc >= 360 ? 0 : v.front) + '|' + v.range + '|' + v.arc + (v.sense ? '|' + (v.pass ? 'p' : 's') + (v.dim ? 'd' : '') : v.blind ? '|b' : '') + (sm && !useSm && !v.pass ? '|v' : '') + (tag || ''), hit = mc.m[k];   // senses S2a: a sense's cells are its own, never an eyes viewer's of the same range (an eyes viewer's key is as it always was); S7b: one that sees through smoke apart
    if (hit) { hit.used = ++_viewTick; hit.pass = _viewPass; return hit.hit; }
    var cells = C.seenCells(v, grid, useSm ? smokeUnion(map, blk, sm, tag) : blk, lvl === null ? null : { level: lvl, lit: lc ? lc.lit : null });
    if (useSm) { var ownK = C.cellKey(C.cellOf(v.x, v.y, grid), grid); cells = cells.filter(function(o) { return o.key === ownK || sm[o.key] !== 1; }); }   // nothing in smoke is seen but a token's own cell
    if (_viewCells + cells.length > VIEW_BUDGET) viewEvict(cells.length, map.id);
    mc.m[k] = { hit: cells, used: ++_viewTick, pass: _viewPass }; mc.cells += cells.length; _viewCells += cells.length;
    return cells;
}
// The cells revealed to ownerId, each with its tier (2 clear or bright, 1 dim): their tokens' vision ∪ manual adds (clear) − manual cuts.
// null = the whole map (reveal mode); else { list: [{key, cell}], keys: {key: tier}, through? }. Senses S2a: through, { key: 1 } for a cell
// only a sense that passes walls gave (read from S6 on); absent when no such sense sees anything of its own
function revealedTiers(map, camp, ownerId) {
    var C = core(), grid = gridForMap(map); if (!grid) return { list: [], keys: Object.create(null) };
    var mf = mapFog(map);
    if (mf.mode === 'reveal') return null;
    var keys = Object.create(null), list = [], plain = Object.create(null), passed = null;
    var put = function(key, cell, t) { var o = keys[key]; if (o === undefined) { keys[key] = t; list.push({ key: key, cell: cell }); } else if (t > o) keys[key] = t; };
    if (mf.mode !== 'cover') {
        _viewPass++;   // a pass of its own: the vision memo never lets go of what it sweeps here while it sweeps
        var blk = blockersFor(map, grid), over = !!_blockerOver[map.id], lvl = mapLevel(map);
        if (over && lvl !== null) lvl = 0;   // walls over the cap block nothing: the map reads by sight alone, never lit through them
        var lc = lvl === null || over ? null : litFor(map, grid, blk);   // lighting off: no light sources either
        viewersFor(map, camp, ownerId).forEach(function(v) {
            var s = viewSeen(map, grid, blk, lvl, v, lc), by = v.pass ? (passed || (passed = Object.create(null))) : plain;
            for (var i = 0; i < s.length; i++) { put(s[i].key, s[i].cell, s[i].tier); by[s[i].key] = 1; }
        });
    }
    (mf.manual.adds || []).forEach(function(c) { var k = C.cellKey(c, grid); put(k, c, 2); plain[k] = 1; });
    var cut = Object.create(null); (mf.manual.cuts || []).forEach(function(c) { cut[C.cellKey(c, grid)] = 1; });
    list = list.filter(function(o) { if (cut[o.key]) { delete keys[o.key]; return false; } return true; });
    var out = { list: list, keys: keys };
    if (passed) { var th = null; list.forEach(function(o) { if (passed[o.key] && !plain[o.key]) (th || (th = Object.create(null)))[o.key] = 1; }); if (th) out.through = th; }
    return out;
}
// The cells revealed to ownerId at any tier (what host enforcement drops by). null = the whole map (reveal mode)
function revealedCellList(map, camp, ownerId) {
    if (!gridForMap(map)) return [];
    var t = revealedTiers(map, camp, ownerId);
    return t === null ? null : t.list.map(function(o) { return o.cell; });
}

// Lighting (L4): the light one token sees another in, for the ruler's line and a target mark's tag — 0 dark, 1 dim, 2 clear (bright, a cell the
// GM revealed by hand, or within its own sight in the dark). null where no light is read: lighting or fog off, fog not on Auto for the map, no
// grid, the target where this map draws no fog (outside its play areas) or hidden by hand, or out of the viewer's arc, line of sight or reach —
// so a lit level is read only for the cells a player's copy is given lit cells for (fogLitFor), and the GM's screen and the player's agree —
// except where a ground piece the GM hid lifts either token, which only the GM's own screen reads (the height stop below).
// A point query on what is already kept (the map's walls, its fog areas, its lights' lit cells), never a viewer's whole disc; on a player's
// copy the lit cells the host sent count too (litFor). A target in a wall's or a closed door's own cell reads the light on its near face, as
// seenCells shows it: the brightest of the open cells beside it this viewer sees, at least the map's own
function lightSeen(from, to, map, camp) {
    if (!fogFeatureOn() || !map || map.type !== 'map' || !from || !to) return null;
    var mf = mapFog(map); if (!mf.on || mf.mode !== 'auto') return null;
    var C = core(), grid = gridForMap(map); if (!C || !grid) return null;
    var lvl = mapLevel(map); if (lvl === null) return null;
    var blk = blockersFor(map, grid), over = !!_blockerOver[map.id];
    var v = { x: from.x + (from.w || 60) / 2, y: from.y + (from.h || 52) / 2, front: (from.rot || 0) + (from.front || 0) };   // its arc below, once its senses are read
    var a = C.cellOf(v.x, v.y, grid), b = C.cellOf(to.x + (to.w || 60) / 2, to.y + (to.h || 52) / 2, grid), bk = C.cellKey(b, grid);
    var mask = fogMask(map, camp, grid); if (mask.mode === 'none' || !inMask(mask, bk)) return null;   // no fog is drawn there
    var byHand = function(list) { return (list || []).some(function(c) { return C.cellKey(c, grid) === bk; }); };
    if (byHand(mf.manual.cuts)) return null;
    if (byHand(mf.manual.adds)) return 2;
    var d = C.cellDist(a, b, grid), ts = tokenSenses(from, map, camp, !from.ownerId), lit = null, litRead = false, sense = null;
    v.arc = eyesArc(map, ts);   // the viewer's own arc, as its viewers have it (viewersFor)
    var litAt = function() { if (!litRead) { litRead = true; var lc = over ? null : litFor(map, grid, blk); lit = lc ? lc.lit : null; } return lit; };
    // senses S7b: smoke stops the eyes and a sense the walls stop that does not see through it — a target in it (but the viewer's own cell) or past it
    // item 19b: with heights judged, the target's own line is read past the walls the heights are judged against (under the 3D line a wall with a
    // height is no wall but a piece: blkT, the map's own set otherwise), and a piece that hides the target at their heights stops the eyes and a
    // sense the walls stop (hst)
    var hrL = typeof heightRules === 'function' ? heightRules(map, camp, grid) : null, blkT = hrL ? hrL.base : blk;
    var sm = smokeFor(map, grid), ak = C.cellKey(a, grid), smLine = function(to, tk, tgt) { return !sm || ((tk === ak || sm[tk] !== 1) && C.lineClear(a, to, grid, tgt && hrL && hrL.tag ? smokeUnion(map, blkT, sm, hrL.tag) : smokeUnion(map, blk, sm))); };
    var hst = !!hrL && hrL.C.heightStops(a, b, grid, tokHeight(from, map) + hrL.hm.eye, tokHeight(to, map), hrL.hs, hrL.hm.mode);
    senseViewers(ts, v.arc).forEach(function(s) {   // senses S2a: a full sense that reaches the target reads it clear, or (dim) its own light raised to dim, as seenCells shows it
        if ((!s.pass && hst) || !(d <= s.range + 1e-9) || !C.cellInArc({ x: v.x, y: v.y, front: v.front, arc: s.arc }, b, grid) || (!s.pass && !C.lineClear(a, b, grid, blkT)) || (!s.pass && !s.veil && !smLine(b, bk, true))) return;
        var t = 2;
        if (s.dim) { var lv = over ? 0 : blk && blk[bk] ? lvl : Math.max(lvl, (litAt() && lit[bk]) || 0); t = lv >= 2 ? 2 : 1; }
        if (sense === null || t > sense) sense = t;
    });
    var up = function(t) { return sense !== null && sense > t ? sense : t; };
    if (ts.blind) return d <= 1e-9 ? 2 : sense;   // senses S3: blind eyes read no light but their own cell's; a full sense still reads what it reaches
    if (!(d <= C.LIMITS.rangeCells + 1e-9) || !C.cellInArc(v, b, grid) || !C.lineClear(a, b, grid, blkT) || !smLine(b, bk, true) || hst) return sense;   // out of the eyes' reach: a sense's answer or none
    if (d <= ts.sight + 1e-9) return 2;
    if (over) return up(0);   // walls over their cap: the map reads by sight alone, never by a light judged through them
    litAt();
    if (!blk || !blk[bk]) return up(Math.max(lvl, (lit && lit[bk]) || 0));
    var best = lvl;
    C.neighbourCells(b, grid).forEach(function(n) { var nk = C.cellKey(n, grid); if (blk[nk] || !C.cellInArc(v, n, grid) || !C.lineClear(a, n, grid, blk) || !smLine(n, nk)) return; var l = Math.max(lvl, (lit && lit[nk]) || 0); if (l > best) best = l; });
    return up(best);
}

// [fogcheck:heightsight-start]
// Item 19b (the owner's answers of 2026-10-01): heights in the fog. With the system's height rule "clears" (H3: "everything a wall stops") a
// see-over piece hides a creature from a token BELOW it — the token lower than the creature, the creature no higher than the piece — as the
// cover readout has it (heightCover): at those heights the piece stops that token's eyes and every sense the walls stop; a sense that passes
// walls, and a mark it makes, is unaffected. With the system's True 3D sightline (H4) every piece with a height — a see-over piece (1 yard
// where none is given) and a sight-blocker that has one — stops a line only where the straight line from the token's eye (its height, plus the
// system's standing height when it gives one) to the creature (at its height) runs at or below the piece where it passes it; a sight-blocker
// with no height is a wall, full height, as ever. Judged per token and creature, never per cell: the ground a player sees stays what the
// walls give (a creature seen over a low wall has its own cell shown, heightShown). A creature is left out of a player's copy when EVERY
// token of theirs has it hidden so or does not see it at all; one token that sees it keeps it. What the GM shows or hides by hand, and where
// no fog is drawn, stay as they were. Heights come from wpStance.tokenElevation(token, map) (a token's own elevation plus the ground it stands
// on), 0 with Token elevation off. A map with no piece that has a height — and, under "clears", no token off the ground — is not judged at
// all: exactly the code as it was
// The owner's ruling of 2026-10-01 ("players see nothing where something is hidden"): a judgement made FOR A PLAYER — what their copy of a map
// holds, the live relay, their marks, the GM's preview of that player, the party's view the stream window draws — reads every height from the
// pieces players hold only (tokenElevation's third argument, true): a ground piece the GM hid lifts nobody there, so the host rules exactly what
// the player's own app works out from its copy, which holds no hidden piece. The GM's own overlay ('*', every token) and the light the GM's
// ruler names (lightSeen) read every piece the map holds, as the GM's chips, ruler and blast tool do
function forPlayers(ownerId) { return typeof ownerId === 'string' && ownerId !== '' && ownerId !== '*'; }   // a profile id, or the party (PARTY); never the GM's own '*', never no owner at all
function hNum(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }
function heightSightOf(sys) {   // { mode: 'clears' | '3d', eye (yards), soft } or null: no height in the fog. soft: the see-over pieces count (the system's Cover from blockers is on: with it off a piece set to give cover is no piece at all, here as on the ruler)
    var h = sys && sys.combat && typeof sys.combat === 'object' ? sys.combat.height : null; if (!h || typeof h !== 'object') return null;
    if (h.line3d === true) return { mode: '3d', eye: Math.min(100, Math.max(0, hNum(h.eye))), soft: coverOn(sys) };
    return h.rule === 'clears' && coverOn(sys) ? { mode: 'clears', eye: 0, soft: true } : null;
}
function tokHeight(w, map, shown) {   // a token's height in yards, by the contract every reader shares; 0 while the table plays without Token elevation. shown (true): the ground only of pieces players hold
    var vt = window.wpVtt; if (!w || (vt && !(vt.rulesOn ? vt.rulesOn('elevation') : vt.on('elevation')))) return 0;
    var St = window.wpStance, e = St && typeof St.tokenElevation === 'function' ? Number(St.tokenElevation(w, map, shown === true)) : Number(w.elevation);
    return isFinite(e) ? e : 0;
}
// A map's pieces that have a height, for the mode: { cells: { cellKey: H }, lines: [{ segs, h }], full, split, ver } or null with none. The
// see-over pieces are the cover readout's own (coverSetsFor: a cell its tallest piece, 1 yard where none is given). Under the 3D line the
// sight-blockers split: one with a Height joins the pieces, one with none stays a wall (full: the walls a 3D line is judged against, the
// map's own set when nothing was split off; a cell a wall also stands in is the wall's). ver moves only when the pieces do: the vision memo
// keys on it. Kept while the map's cover sets and walls are the very sets they were
var _hsCache = Object.create(null), _hsSig = Object.create(null), _hsVer = Object.create(null), _smokeUnionH = Object.create(null), _seenIdx = typeof WeakMap === 'function' ? new WeakMap() : null;
var _dropHid = typeof WeakMap === 'function' ? new WeakMap() : null;   // a drop (fogDropIds) -> the creatures in it a piece hides in a cell its player sees ({ id: 1 }): a mark on one is drawn though the cell is seen
function heightSetsFor(map, grid, hm, blk) {
    var C = core(), cs = coverSetsFor(map, grid), stamp = ((map.meta && map.meta.updated) || 0) + '|' + hm.mode + (hm.soft ? 's' : '') + '|' + grid.type + ':' + (grid.size || grid.s), hit = _hsCache[map.id];
    if (hit && hit.stamp === stamp && hit.cs === cs && hit.blk === blk) return hit.res;
    var cells = Object.create(null), lines = [], any = false, full = blk, split = false, k;
    if (hm.soft && cs && cs.soft) for (k in cs.soft) { cells[k] = cs.softH && cs.softH[k] >= 0 ? cs.softH[k] : 1; any = true; }
    if (hm.soft && cs && cs.softLines) cs.softLines.forEach(function(g) { if (g && Array.isArray(g.segs) && g.segs.length) { lines.push({ segs: g.segs, h: g.h }); any = true; } });
    if (hm.mode === '3d' && blk) {
        var wb = map.whiteboard || [], fset = Object.create(null), fsegs = [], hcells = Object.create(null), nh = 0, nf = 0;
        for (var i = 0; i < wb.length; i++) {
            var w = wb[i]; if (!eligibleBlocker(w)) continue;
            var H = C.cleanHeight(w.height);
            if (w.type === 'path') { var ps = C.pathSegs(w); if (!ps.length) continue; if (H) { lines.push({ segs: ps, h: H }); nh++; } else for (var q = 0; q < ps.length; q++) fsegs.push(ps[q]); continue; }
            var fc = footprintCells(w, grid, C);
            for (var j = 0; j < fc.length; j++) { var ck = C.cellKey(fc[j], grid); if (H) { if (!(hcells[ck] >= H)) hcells[ck] = H; nh++; } else if (!fset[ck]) { fset[ck] = 1; nf++; } }
        }
        if (nh) {
            split = true; any = true;
            for (k in hcells) if (!fset[k] && !(cells[k] >= hcells[k])) cells[k] = hcells[k];
            full = nf || fsegs.length ? C.withWalls(fset, fsegs, grid) : null;
        }
    }
    var res = null;
    if (any) {
        var r1 = function(v) { return Math.round(v * 10) / 10; };
        var sig = Object.keys(cells).sort().map(function(key) { return key + '=' + cells[key]; }).join(';') + '|' + lines.map(function(g) { return g.h + ':' + g.segs.map(function(s) { return s.map(r1).join(','); }).join(';'); }).join('|') + '|' + (split ? 1 : 0);
        if (_hsSig[map.id] !== sig) { _hsSig[map.id] = sig; _hsVer[map.id] = (_hsVer[map.id] || 0) + 1; }
        res = { cells: cells, lines: lines, full: full, split: split, ver: _hsVer[map.id] };
    }
    _hsCache[map.id] = { stamp: stamp, cs: cs, blk: blk, res: res };
    return res;
}
// The rules a map is judged by, or null where no height is judged: the mode, its pieces, and the walls a line is judged against (base: the
// map's own, or under the 3D line the walls with no height; tag: the vision memo's key for cells seen past base alone). ownerId: whose view
// is judged — for a player or the party every height is read from shown pieces only (shown, carried with the rules)
function heightRules(map, camp, grid, ownerId) {
    var hm = heightSightOf(camp && camp.system); if (!hm || !map || !grid) return null;
    var C = core(); if (!C || typeof C.heightStops !== 'function') return null;
    var blk = blockersFor(map, grid); if (_blockerOver[map.id]) return null;   // walls over their cap block nothing: no piece is judged either
    var hs = heightSetsFor(map, grid, hm, blk); if (!hs) return null;
    var shown = forPlayers(ownerId);
    if (hm.mode === 'clears' && !(map.whiteboard || []).some(function(w) { return !!w && (w.isChar || w.waiting) && tokHeight(w, map, shown) !== 0; })) return null;   // everyone on the ground: nobody is below anybody
    return { C: C, hm: hm, hs: hs, blk: blk, base: hs.split ? hs.full : blk, tag: hs.split ? '|h' + hs.ver : '', shown: shown };
}
function seenIdxOf(cells) {   // a viewer's seen cells as { key: tier }, kept beside the list the vision memo holds
    var ix = _seenIdx ? _seenIdx.get(cells) : null; if (ix) return ix;
    ix = Object.create(null); for (var i = 0; i < cells.length; i++) ix[cells[i].key] = cells[i].tier;
    if (_seenIdx) _seenIdx.set(cells, ix);
    return ix;
}
// What one owner's tokens are judged with on a map (fog on Auto only: Reveal all shows everything, Cover all reads no viewer): the rules,
// each viewer with its token's height, the light, and the cells shown or hidden by hand. null where nothing is judged
function heightCtx(map, camp, ownerId, grid) {
    if (!map || !grid || mapFog(map).mode !== 'auto') return null;
    var hr = heightRules(map, camp, grid, ownerId); if (!hr) return null;
    var vs = viewersFor(map, camp, ownerId, true); if (!vs.length) return null;
    var C = hr.C, lvl = mapLevel(map), lc = lvl === null ? null : litFor(map, grid, hr.blk), mf = mapFog(map), man = Object.create(null), cut = Object.create(null);
    (mf.manual.adds || []).forEach(function(c) { man[C.cellKey(c, grid)] = 1; }); (mf.manual.cuts || []).forEach(function(c) { cut[C.cellKey(c, grid)] = 1; });
    return { C: C, hm: hr.hm, hs: hr.hs, base: hr.base, tag: hr.tag, vs: vs, lvl: lvl, lc: lc, man: man, cut: cut, map: map, grid: grid, idx: [], shown: hr.shown };
}
// The tier at which those tokens see a creature standing in that cell at that height (2 clear, 1 dim), 0 when none does: a viewer must
// see the cell past the walls (its light, its reach, its arc, smoke: its own seen cells, viewSeen) and have no piece stop its line — a sense
// that passes walls is stopped by none
function heightSees(ctx, cell, key, hT) {
    var C = ctx.C, tier = 0;
    for (var i = 0; i < ctx.vs.length && tier < 2; i++) {
        var v = ctx.vs[i], ix = ctx.idx[i] || (ctx.idx[i] = seenIdxOf(viewSeen(ctx.map, ctx.grid, ctx.base, ctx.lvl, v, ctx.lc, ctx.tag))), t = ix[key];
        if (!t) continue;
        if (!(v.sense && v.pass) && C.heightStops(C.cellOf(v.x, v.y, ctx.grid), cell, ctx.grid, hNum(v.h) + ctx.hm.eye, hT, ctx.hs, ctx.hm.mode)) continue;
        if (t > tier) tier = t;
    }
    return tier;
}
// Every creature the heights judge otherwise than the cells do, for one owner: hide { id: 1 } (its cell is seen, but a piece hides it from
// every token that sees the cell) and show { id: { key, cell, tier } } (its cell is not, but a token sees it over a low wall). flat: the cells
// revealed to that owner ({ key: tier }, revealedTiers). null where nothing differs
function heightJudge(map, camp, ownerId, grid, mask, flat) {
    var ctx = heightCtx(map, camp, ownerId, grid); if (!ctx) return null;
    var C = ctx.C, hide = null, show = null;
    (map.whiteboard || []).forEach(function(w) {
        if (!w || w.type === 'light' || !(w.isChar || w.waiting) || typeof w.id !== 'string') return;
        if (w.ownerId === ownerId || (ownerId === PARTY && playerTok(w))) return;
        var cell = C.cellOf(w.x + (w.w || 60) / 2, w.y + (w.h || 52) / 2, grid), key = C.cellKey(cell, grid);
        if (!inMask(mask, key) || ctx.man[key] === 1 || ctx.cut[key] === 1) return;
        var tier = heightSees(ctx, cell, key, tokHeight(w, map, ctx.shown)), was = !!flat[key];
        if (was && !tier) (hide || (hide = Object.create(null)))[w.id] = 1;
        else if (!was && tier) (show || (show = Object.create(null)))[w.id] = { key: key, cell: cell, tier: tier };
    });
    return hide || show ? { hide: hide || Object.create(null), show: show || Object.create(null) } : null;
}
// The cells an owner's overlay shows, with the cell of each creature a token of theirs sees over a low wall (H4; its tier the light it is
// seen in): the same tiers when there is none. The tiers are the caller's own (revealedTiers and partyTiers build them afresh each time)
function heightShown(tiers, map, camp, ownerId, grid, mask) {
    if (!tiers || !tiers.keys || !Array.isArray(tiers.list)) return tiers;
    var hr = heightRules(map, camp, grid, ownerId); if (!hr || !hr.hs.split) return tiers;   // only a wall with a height is ever seen over
    var hj = heightJudge(map, camp, ownerId, grid, mask, tiers.keys); if (!hj) return tiers;
    for (var id in hj.show) { var s = hj.show[id], o = tiers.keys[s.key]; if (o === undefined) { tiers.keys[s.key] = s.tier; tiers.list.push({ key: s.key, cell: s.cell }); } else if (s.tier > o) tiers.keys[s.key] = s.tier; }
    return tiers;
}
// A player's mark senses and the creatures they may mark, with the heights counted: each viewer the walls stop is told the creatures a
// piece hides from its token (hid: fogcore markCells leaves them unfound by it), and the walls to judge by are the rules' own
function heightVeto(inp, vs, cs, blk) {
    var hr = inp.hr, C = hr.C, grid = inp.grid;
    vs.forEach(function(v) {
        delete v.hid; if (v.pass) return;
        var a = C.cellOf(v.x, v.y, grid), hid = null;
        cs.forEach(function(c) { if (typeof c.id === 'string' && C.heightStops(a, C.cellOf(c.x, c.y, grid), grid, hNum(v.hh) + hr.hm.eye, hNum(c.hh), hr.hs, hr.hm.mode)) (hid || (hid = Object.create(null)))[c.id] = 1; });
        if (hid) v.hid = hid;
    });
    return hr.base;
}
// [fogcheck:heightsight-end]
/* ---------- host enforcement helpers (called by net.js) ---------- */
// Ids of the character tokens a recipient CANNOT see on a map (drop these from their wire copy). null = no fog / drop nothing.
function fogDropIds(recipientId, camp, map) {
    if (!fogFeatureOn() || !map || map.type !== 'map') return null;
    var mf = mapFog(map); if (!mf.on) return null;
    var grid = gridForMap(map); if (!grid) return null;                 // gridless with no assigned cell → can't compute → send all
    var mask = fogMask(map, camp, grid); if (mask.mode === 'none') return null;   // no play area marked + default 'none' → no fog region → nothing hidden
    var list = revealedCellList(map, camp, recipientId);
    if (list === null) return null;                                     // reveal-all: nothing hidden
    var C = core(), keys = Object.create(null); list.forEach(function(c) { keys[C.cellKey(c, grid)] = 1; });
    var drop = Object.create(null), any = false;
    var hj = typeof heightJudge === 'function' ? heightJudge(map, camp, recipientId, grid, mask, keys) : null;   // item 19b: the creatures a piece with a height hides, or shows over a low wall (null: none, as before)
    (map.whiteboard || []).forEach(function(w) {
        if (!w || w.type === 'light' || !(w.isChar || w.waiting)) return;   // a light source is never a creature; Onboarding F1a: another player's waiting token hides in fog like a character's
        if (w.ownerId === recipientId || (recipientId === PARTY && playerTok(w))) return;   // your own token is always yours; the party view (R2 #14) keeps every player's
        var tk = C.cellKey(C.cellOf(w.x + (w.w || 60) / 2, w.y + (w.h || 52) / 2, grid), grid);
        if (!inMask(mask, tk)) return;   // hidden only inside a fog area a viewer can't see; a token OUT of every fog area is always visible
        var seen = !!keys[tk];
        if (hj && typeof w.id === 'string') { if (seen) { if (hj.hide[w.id] === 1) seen = false; } else if (hj.show[w.id]) seen = true; }
        if (!seen) { drop[w.id] = 1; any = true; }
    });
    if (any && hj && typeof _dropHid !== 'undefined' && _dropHid) _dropHid.set(drop, hj.hide);   // item 19b: which of them stand in a cell this player sees (a mark on one is drawn there)
    return any ? drop : null;
}
// R2 #14: the stream window's copy of a fogged map carries the cells the players' tokens see together (fogPartyCopy in net.js puts it on the copy as
// map.fogParty), worked out here from the host's own campaign — the players' sheets, the GM's null areas, every light — which the window's own copy
// could not repeat, so the window draws exactly what the host rules (partyTiers). Each cell with its tier, shaped as a lit cell is ({c,r,t} or
// {q,r,t}); { all: true } for Reveal all (no fog at all); null where this map draws no fog (fog off, no grid, no play area: the window draws none
// there either); { list: [] } where nothing is seen (Cover all, no player's token on the map)
function fogPartyCells(camp, map) {
    if (!fogFeatureOn() || !map || map.type !== 'map') return null;
    var mf = mapFog(map); if (!mf.on) return null;
    var grid = gridForMap(map); if (!grid) return null;
    var mask = fogMask(map, camp, grid); if (mask.mode === 'none') return null;
    var t = revealedTiers(map, camp, PARTY); if (t === null) return { all: true };
    if (typeof heightShown === 'function') t = heightShown(t, map, camp, PARTY, grid, mask);   // item 19b H4
    return { list: t.list.map(function(o) { var c = o.cell, k = t.keys[o.key]; return c.q !== undefined ? { q: c.q, r: c.r, t: k } : { c: c.c, r: c.r, t: k }; }) };
}
// Senses S0: what one player's own tokens see by on a map, as a text the host compares — each of their viewers' sight in cells, in the map's
// own order (viewersFor's, so who counts as a viewer is decided in one place). null where a change of sight changes nothing a player is sent:
// the fog feature off, a map without fog, not on Auto (Reveal all shows everything, Cover all reads no viewer), no grid, no fog drawn. On a
// lit or a dim map (Lighting on, the walls under their cap) the CELLS a token sees do not depend on its sight, only how clear they show, which
// a player's own screen works out: every viewer reads 'L' there, and a change of sight sends nothing
function sightSigFor(recipientId, camp, map) {
    if (!fogFeatureOn() || !map || map.type !== 'map' || !recipientId) return null;
    var mf = mapFog(map); if (!mf.on || mf.mode !== 'auto') return null;
    var grid = gridForMap(map); if (!grid) return null;
    if (fogMask(map, camp, grid).mode === 'none') return null;
    var lvl = mapLevel(map), lit = lvl !== null && lvl >= 1;
    if (lit) { blockersFor(map, grid); lit = !_blockerOver[map.id]; }   // the walls are counted only where their cap can change the answer
    // senses S2a: a full sense by its cells, whether it passes walls and whether it sees all round (never whether it shows the dark as dim:
    // that changes how clear a cell shows, never whether it is seen); on a lit or a dim map one the walls stop in the eyes' arc sees nothing
    // the eyes do not, and is left out
    // the eyes' arc: a token whose arc is not the map's own (its character's, eyesArc) is named with it after a slash ('12/300', 'L/300', 'B/300'):
    // the cells it sees, the senses that take the eyes' arc and its marks all move with it. One whose arc is the map's reads as it always did
    var out = [], blindNow = false, mapArc = eyesArc(map, null);   // senses S3: blind eyes read 'B' anywhere (they see their own cell alone), and then every sense counts
    viewersFor(map, camp, recipientId).forEach(function(v) {
        if (!v.sense) { blindNow = !!v.blind; var ey = blindNow ? 'B' : lit ? 'L' : v.range; out.push(v.arc === mapArc ? ey : ey + '/' + v.arc); }
        else if (!lit || blindNow || v.pass || v.arc >= 360 || v.veil) out.push('s' + v.range + (v.pass ? 'p' : '') + (v.arc >= 360 ? 'a' : '') + (v.veil ? 'v' : ''));   // S7b: one that sees through smoke sees what the eyes do not
    });
    // senses S4: each mark sense of theirs, by its cells, whether it passes walls, whether it is all round and its glyph (a change moves marks, never cells)
    if (campMarkSenses(camp).length) (map.whiteboard || []).forEach(function(w) {
        if (!w || w.hidden || w.type === 'light' || w.ownerId !== recipientId || !w.isChar) return;
        (tokenSenses(w, map, camp, false).marks || []).forEach(function(m) { out.push('m' + m.cells + (m.pass ? 'p' : '') + (m.all ? 'a' : '') + m.k + (m.veil ? 'v' : '')); });
    });
    var hsg = typeof heightSightOf === 'function' ? heightSightOf(camp && camp.system) : null;   // item 19b: the system's height rule decides which creatures are seen (absent: the text as it was)
    if (hsg) out.push(hsg.mode === '3d' ? 'h3d' + hsg.eye + (hsg.soft ? 's' : '') : 'hc');
    return out.join(',');
}
// Senses S4: one player's marks on one map — the host's, for their copy (fogCopyFor) and its catch-ups: the creatures dropped from it (a character
// or a waiting token; never one the GM hid, a light or their own) that a mark sense of one of their tokens finds, as fogcore markCells works them
// out; never through a sense the GM ticked the token off for (item.unsensed). Null where no fog is drawn, not on Auto, with no grid, no mark
// sense or no mark. Memoised on exactly what it reads (the viewers, the creatures, the walls), so a re-send with nothing moved works nothing
// out; the GM is told once per map when a cap cut the marks
// Senses S4b: "Marks in a fight" played On your own turn (camp.fog.defaults.marks 'turn'; docs/SENSES_PLAN.md section 10, item 4). While a fight
// runs on a map, a player's marks there come from what the host holds for them (never saved, never sent): the creatures their mark senses found
// at the last refresh, where each stood then, and the senses that looked. A creature seen, hidden or gone since goes at once, as does a sense
// switched off; a sense switched on, or a creature that came since, waits for the next refresh. net.js refreshes (marksHold) at the start of a
// turn of their token, their own drop on it, a new round for a player with no token in the fight and the fight's start; its end forgets them
var _marksMemo = Object.create(null), _marksWarned = Object.create(null), _marksHeld = Object.create(null);
function marksStrictOn(camp, map) {
    var d = camp && camp.fog && typeof camp.fog === 'object' && camp.fog.defaults && typeof camp.fog.defaults === 'object' ? camp.fog.defaults : null, N = window.wpNet;
    return !!d && d.marks === 'turn' && !!map && typeof map.id === 'string' && !!N && typeof N.combatFor === 'function' && !!N.combatFor(map.id);
}
function marksBlk(map, grid) { var blk = blockersFor(map, grid); return _blockerOver[map.id] ? null : blk; }   // walls over their cap block nothing, as for the eyes
function marksHeldOf(key, inp, blk, keep) {   // what a refresh holds: the creatures found now and where they stand, and the senses that looked
    var found = Object.create(null), pos = Object.create(null), sids = Object.create(null);
    if (inp && inp.hr && inp.vs.length && inp.cs.length && typeof heightVeto === 'function') blk = heightVeto(inp, inp.vs, inp.cs, blk);   // item 19b
    if (inp && inp.vs.length && inp.cs.length) inp.C.markCells(inp.vs, inp.cs, inp.grid, blk, found, inp.smoke);
    if (inp) { inp.cs.forEach(function(c) { if (found[c.id] === 1) { pos[c.id] = { x: c.x, y: c.y }; if (c.open === true) pos[c.id].open = true; if (typeof c.hh === 'number') pos[c.id].hh = c.hh; } }); inp.vs.forEach(function(v) { if (typeof v.sid === 'string') sids[v.sid] = 1; }); }
    var held = { pos: pos, sids: sids }; if (keep) _marksHeld[key] = held;
    return held;
}
function marksHold(recipientId, camp, map, drop) {   // a refresh (net.js): judged at this moment
    if (typeof recipientId !== 'string' || !recipientId || !map || typeof map.id !== 'string') return;
    var inp = marksInputs(recipientId, camp, map, drop);
    marksHeldOf(recipientId + '|' + map.id, inp, inp ? marksBlk(map, inp.grid) : null, true);
}
function marksForget(mapId) {   // a map's held marks (a fight began or ended there), or every map's (null: the setting changed, the table ended)
    Object.keys(_marksHeld).forEach(function(k) { if (mapId === null || mapId === undefined || k.slice(k.indexOf('|') + 1) === mapId) delete _marksHeld[k]; });
}
// the viewers (a player's mark senses, where their tokens stand) and the creatures those may mark, or null where no mark can be
function marksInputs(recipientId, camp, map, drop) {
    if (!recipientId || !drop || !fogFeatureOn() || !map || map.type !== 'map') return null;
    var mf = mapFog(map); if (!mf.on || mf.mode !== 'auto') return null;
    var C = core(), grid = gridForMap(map); if (!C || !grid) return null;
    if (!campMarkSenses(camp).length || fogMask(map, camp, grid).mode === 'none') return null;
    var vs = [], cs = [];
    var waitSight = !!(camp && camp.newPlayers && typeof camp.newPlayers === 'object' && camp.newPlayers.sight === true);
    var hr = typeof heightRules === 'function' ? heightRules(map, camp, grid, recipientId) : null, hidOf = hr && typeof _dropHid !== 'undefined' && _dropHid ? _dropHid.get(drop) : null;   // item 19b: with heights judged, each viewer and creature carries its height (hh); open: a creature a piece hides in a cell this player sees
    (map.whiteboard || []).forEach(function(w) {
        if (!w || w.hidden || w.type === 'light') return;
        if (w.ownerId === recipientId) {
            if (!(w.isChar || (w.waiting && waitSight))) return;
            var x = w.x + (w.w || 60) / 2, y = w.y + (w.h || 52) / 2, front = (w.rot || 0) + (w.front || 0);
            var mts = tokenSenses(w, map, camp, false), arc = eyesArc(map, mts);   // a mark sense that is not all round takes its token's eyes' arc
            (mts.marks || []).forEach(function(m) { var vm = { x: x, y: y, front: front, range: m.cells, arc: m.all ? 360 : arc, pass: m.pass, k: m.k, sid: m.id }; if (m.veil) vm.veil = true; if (hr) vm.hh = tokHeight(w, map, hr.shown); vs.push(vm); });
            return;
        }
        if (drop[w.id] !== 1 || !(w.isChar || w.waiting)) return;
        var un = C.cleanUnsensed(w.unsensed), skip = null;
        if (un === true) return;
        if (un) { skip = Object.create(null); un.forEach(function(id) { skip[id] = 1; }); }
        var cr = { x: w.x + (w.w || 60) / 2, y: w.y + (w.h || 52) / 2, skip: skip, id: w.id }; if (hr) { cr.hh = tokHeight(w, map, hr.shown); if (hidOf && hidOf[w.id] === 1) cr.open = true; }
        cs.push(cr);
    });
    var inp = { C: C, grid: grid, vs: vs, cs: cs, smoke: smokeFor(map, grid) };   // senses S7b: the map's smoke, for a mark sense that does not see through it
    if (hr) inp.hr = hr;
    return inp;
}
function fogMarksFor(recipientId, camp, map, drop, peek) {   // peek: the GM's preview reads what is held, never takes a refresh of its own
    var inp = marksInputs(recipientId, camp, map, drop); if (!inp) return null;
    var C = inp.C, grid = inp.grid, vs = inp.vs, cs = inp.cs, blk = marksBlk(map, grid);
    if (marksStrictOn(camp, map)) {   // senses S4b: from what is held (a player new to the fight has theirs taken now)
        var hk = recipientId + '|' + map.id, held = _marksHeld[hk] || marksHeldOf(hk, inp, blk, !peek);
        vs = vs.filter(function(v) { return held.sids[v.sid] === 1; });
        cs = cs.filter(function(c) { return !!held.pos[c.id]; }).map(function(c) { var p = held.pos[c.id], o = { x: p.x, y: p.y, skip: c.skip }; if (inp.hr) { o.id = c.id; o.hh = typeof p.hh === 'number' ? p.hh : c.hh; if (p.open === true) o.open = true; } return o; });
    }
    if (!vs.length || !cs.length) return null;
    if (inp.hr && typeof heightVeto === 'function') blk = heightVeto(inp, vs, cs, blk);   // item 19b: a piece that hides a creature from a token stops its mark senses the walls stop
    var sig = grid.type + ':' + (grid.size || grid.s) + '|' + (_blockerVer[map.id] || 0) + '|' + (blk ? 1 : 0) + '|' + (_smokeVer[map.id] || 0) + '|' + JSON.stringify(vs) + '|' + JSON.stringify(cs) + (inp.hr ? '|h' + inp.hr.hs.ver + inp.hr.hm.mode + inp.hr.hm.eye : ''), k = recipientId + '|' + map.id, hit = _marksMemo[k];   // S7b: marks move when smoke does
    if (hit && hit.sig === sig) return hit.marks;
    var res = C.markCells(vs, cs, grid, blk, null, inp.smoke), marks = res.marks.length ? res.marks : null;   // senses S7b: smoke hides from a mark sense that does not see through it
    _marksMemo[k] = { sig: sig, marks: marks };
    if (res.capped && !_marksWarned[map.id] && isGmView()) { _marksWarned[map.id] = 1; toast('Some creatures on this map are past what a player’s senses mark at once: the nearest are marked.'); }
    return marks;
}
// A cached revealed-key set per (recipient, map): stable during a drag (the recipient's own tokens don't move), so the
// live pos fast-path stays cheap. Cleared by invalidateVision() on any save / token move / snapshot / fog edit, and alone by
// invalidateSeen() where only who sees what may have moved (a player's own move or a character's change, saved as a remote change):
// of one map when its id is given (every player's set for it, or one player's when theirs is given too: their own token moved and
// nobody else sees by it, since it carries no light or the map is not dark), else of all. A key is the recipient, a bar, the map's id: the map is what follows the first bar (a
// profile id holds none; a map's id, from a file, may)
var _keyCache = Object.create(null);
function invalidateSeen(mapId, recipientId) {
    if (typeof mapId !== 'string' || !mapId) { _keyCache = Object.create(null); return; }
    if (typeof recipientId === 'string' && recipientId) { delete _keyCache[recipientId + '|' + mapId]; return; }
    Object.keys(_keyCache).forEach(function(k) { var i = k.indexOf('|'); if (i >= 0 && k.slice(i + 1) === mapId) delete _keyCache[k]; });
}
// Where a token sees and lights from, as a text the host compares before and after a move: the cell of its centre as a viewer's is read,
// the cell of its centre as a light's is read, and the way it faces; and its exact place where it carries a light whose cell is a wall's
// or a closed door's (that light is seated beside the wall by where the token stands inside the cell). Null where the map has no grid to
// count by or the place is no number (the host then judges afresh). The same text means the same cells seen and the same cells lit
function seenKeyOf(map, w) {
    var C = core(), grid = map && w ? gridForMap(map) : null; if (!C || !grid) return null;
    var x = Number(w.x), y = Number(w.y); if (!isFinite(x) || !isFinite(y)) return null;
    var lk = C.cellKey(C.cellOf(x + (w.w || 0) / 2, y + (w.h || 0) / 2, grid), grid);
    var key = C.cellKey(C.cellOf(x + (w.w || 60) / 2, y + (w.h || 52) / 2, grid), grid) + '|' + lk + '|' + ((w.rot || 0) + (w.front || 0));
    if (w.light) { var blk = blockersFor(map, grid); if (blk && blk[lk]) key += '|' + x + ',' + y; }
    return key;
}
// Whether a light that moves can change which cells anybody sees on this map: only where light is judged and the map is dark (set dark,
// or dark by a light source placed on it), its walls under their cap. On a lit or a dim map a light changes how a cell is shown, never
// whether it is seen; with Lighting off or the walls over their cap no light is read at all. A map that holds no fog, or whose fog is off,
// is left as it lies: nothing of it is read further and no fog is written into it (nobody's set is asked there)
function lightMoves(map) {
    if (!map || !fogFeatureOn() || !map.fog || typeof map.fog !== 'object' || !map.fog.on) return false;
    if (mapLevel(map) !== 0) return false;
    var grid = gridForMap(map); if (!grid) return false;
    blockersFor(map, grid);
    return !_blockerOver[map.id];
}
function invalidateVision() { _coverCache = Object.create(null); _coverStamp = Object.create(null); _keyCache = Object.create(null); _blockerCache = Object.create(null); _blockerStamp = Object.create(null); _maskCache = Object.create(null); _maskStamp = Object.create(null); }
function canSeePoint(recipientId, camp, map, x, y, w) {   // w (item 19b): the piece whose place this is — a creature is judged at its height, as its drop is
    if (!fogFeatureOn() || !map) return true;
    var mf = mapFog(map); if (!mf.on) return true;
    var grid = gridForMap(map); if (!grid) return true;
    var mask = fogMask(map, camp, grid); if (mask.mode === 'none') return true;   // no fog region on this map
    var k = recipientId + '|' + map.id, ce = _keyCache[k];
    if (!ce) {
        var list = revealedCellList(map, camp, recipientId);
        ce = { all: list === null, keys: Object.create(null) };
        if (list) { var C = core(); list.forEach(function(c) { ce.keys[C.cellKey(c, grid)] = 1; }); }
        _keyCache[k] = ce;
    }
    if (ce.all) return true;
    var pk = core().cellKey(core().cellOf(x, y, grid), grid);
    if (!inMask(mask, pk)) return true;                                 // outside every fog area → always visible
    if (w && typeof w === 'object' && (w.isChar || w.waiting) && w.type !== 'light' && typeof heightCtx === 'function') {
        if (ce.hc === undefined) ce.hc = heightCtx(map, camp, recipientId, grid);   // kept with the set: both are emptied together
        var hc = ce.hc;
        if (hc && hc.man[pk] !== 1 && hc.cut[pk] !== 1) { var live = {}; for (var lk in w) live[lk] = w[lk]; live.x = x - (w.w || 60) / 2; live.y = y - (w.h || 52) / 2; return heightSees(hc, hc.C.cellOf(x, y, grid), pk, tokHeight(live, map, hc.shown)) > 0; }
    }
    return !!ce.keys[pk];
}

/* ---------- the overlay (a canvas over #whiteboardWrap; #fxScreen pattern) ---------- */
var previewMode = 'off';   // GM only: 'off' (whole board), 'party' (all tokens) or a player's profile id
function screenEl() { return ui('fogScreen'); }
function canvasEl() { var s = screenEl(); if (!s) return null; var c = s.querySelector('canvas.fog-canvas'); if (!c) { c = document.createElement('canvas'); c.className = 'fog-canvas'; s.appendChild(c); } return c; }
function placeScreen() {
    var s = screenEl(), wrap = ui('whiteboardWrap'); if (!s || !wrap) return;
    var r = wrap.getBoundingClientRect();
    s.style.left = r.left + 'px'; s.style.top = r.top + 'px'; s.style.width = r.width + 'px'; s.style.height = r.height + 'px';
    var c = canvasEl(); if (!c) return;
    var dpr = Math.min(1.5, window.devicePixelRatio || 1), w = s.clientWidth, h = s.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr)); }
    c.style.width = w + 'px'; c.style.height = h + 'px';
    var ctx = c.getContext('2d'); if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function clearCanvas() { var c = screenEl() && screenEl().querySelector('canvas.fog-canvas'); if (c) { var x = c.getContext('2d'); if (x) x.clearRect(0, 0, c.width, c.height); } }
function isFogMode() { return !!window.isFogMode; }
function active() {
    if (state.viewMode !== 'visual') return false;
    var map = activeMap(); if (!map) return false;
    if (!fogFeatureOn() || !mapFog(map).on || !gridForMap(map)) return false;
    if (isGmView()) return true;   // fog enabled for this map => the GM always sees the see-through overlay (party vision by default), across every tool and while dragging items
    if (isClientView()) return true;                                // a player always sees their own-vision fog
    if (isStreamView()) return true;                                // R2 #14: the stream window draws the party's fog, opaque, from the host's word on its copy (partyTiers)
    return false;                                                   // awaiting: no fog overlay
}
function drawOwner() {
    if (isClientView()) return myId();                             // a player sees only their own tokens' vision
    if (isStreamView()) return PARTY;                              // R2 #14: the stream window, the players' tokens together
    return (previewMode === 'off' || previewMode === 'party') ? '*' : previewMode;   // GM: all tokens, or one player
}
// Senses S6 (the owner's answer 3a): explored terrain. With "Players remember what they have seen" on (camp.fog.defaults.remember), a player's
// own screen keeps the cells it has seen this session, per map, and draws them at a third, heavier dim; the host still withholds every creature
// there, so remembered ground shows only the pieces that are not characters, as they are now. Never what only a sense that passes walls
// showed; a cell the GM cuts by hand leaves it; a new fog epoch (the GM's Cover all or Reveal all), a change of grid or cell size, and a table
// of another campaign empty it. At most 60,000 cells a map and 200,000 in all (the oldest map goes first); a full map stops adding, said once
// [fogcheck:memory-start]
var MEM_MAP = 60000, MEM_ALL = 200000, _mem = Object.create(null), _memOrder = [], _memTotal = 0, _memVer = 0, _memFullSaid = Object.create(null), _memCamp = null, _memCanvas = null, _memSig = '';
function rememberOn(camp) { var d = camp && camp.fog && typeof camp.fog === 'object' && camp.fog.defaults && typeof camp.fog.defaults === 'object' ? camp.fog.defaults : null; return !!d && d.remember === true; }
function memDrop(id) { var m = _mem[id]; if (m) _memTotal -= m.n; delete _mem[id]; _memOrder = _memOrder.filter(function(x) { return x !== id; }); delete _memFullSaid[id]; _memVer++; }
function memForget() { _mem = Object.create(null); _memOrder = []; _memTotal = 0; _memFullSaid = Object.create(null); _memVer++; }
function memFor(map, grid) {   // this map's store, emptied when its grid, its cell size or its fog epoch changed
    var k = grid.type + ':' + (grid.size || grid.s) + '|' + (mapFog(map).epoch || 0), m = _mem[map.id];
    if (m && m.key === k) return m;
    if (m) memDrop(map.id);
    m = _mem[map.id] = { key: k, cells: Object.create(null), n: 0 }; _memOrder.push(map.id); _memVer++;
    return m;
}
function memRemember(map, grid, tiers) {   // what is seen now, kept: never a cell only a wall-passing sense gave, never one the GM cut
    var C = core(), m = memFor(map, grid), cut = Object.create(null), th = tiers.through || null, changed = false;
    (mapFog(map).manual.cuts || []).forEach(function(c) { var k = C.cellKey(c, grid); cut[k] = 1; if (m.cells[k]) { delete m.cells[k]; m.n--; _memTotal--; changed = true; } });
    for (var i = 0; i < tiers.list.length; i++) {
        var o = tiers.list[i]; if (m.cells[o.key] || cut[o.key] === 1 || (th && th[o.key] === 1)) continue;
        if (m.n >= MEM_MAP) { if (!_memFullSaid[map.id]) { _memFullSaid[map.id] = 1; toast('Your memory of this map is full: ground you see from now on is not kept.'); } break; }
        while (_memTotal >= MEM_ALL && _memOrder.length && _memOrder[0] !== map.id) memDrop(_memOrder[0]);   // the oldest map goes first
        if (_memTotal >= MEM_ALL) break;
        m.cells[o.key] = o.cell; m.n++; _memTotal++; changed = true;
    }
    if (changed) _memVer++;
    return m;
}
// the remembered cells as one opaque layer in screen space, traced again only when the store or the view changed (a draw with the same view
// and the same memory traces none of them)
function memLayer(map, m, z, sx, sy, W, H, traceOn) {
    var sig = map.id + '|' + _memVer + '|' + z + '|' + sx + '|' + sy + '|' + W + '|' + H;
    if (_memCanvas && _memSig === sig) return _memCanvas;
    if (!_memCanvas) { if (typeof document === 'undefined' || !document.createElement) return null; _memCanvas = document.createElement('canvas'); }
    _memCanvas.width = W; _memCanvas.height = H;
    var mc = _memCanvas.getContext('2d'); if (!mc) return null;
    mc.clearRect(0, 0, W, H); mc.fillStyle = '#000'; mc.beginPath();
    for (var k in m.cells) traceOn(mc, m.cells[k]);
    mc.fill(); _memSig = sig;
    return _memCanvas;
}
// [fogcheck:memory-end]
var HEX_COS = [0, 1, 2, 3, 4, 5].map(function(i) { return Math.cos(Math.PI / 180 * (60 * i)); }), HEX_SIN = [0, 1, 2, 3, 4, 5].map(function(i) { return Math.sin(Math.PI / 180 * (60 * i)); });   // a hexagon's six corners, worked out once: the very numbers each cell used to work out for itself
function hexPath(ctx, cx, cy, s) { for (var i = 0; i < 6; i++) { var px = cx + s * HEX_COS[i], py = cy + s * HEX_SIN[i]; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); }
// [fogcheck:maskclip-start]
// The play area's clip as a kept path. A frame with the same play area and the same view as the frame before it clips to a Path2D made
// once by the very calls the frame itself would make (traceOn, cell for cell, in order), and the frames after it trace nothing: the
// overlay redraws many times a second while nothing moves, and at the full frame rate while a token is dragged. A frame whose play area
// or view has just changed (a scroll, a zoom, a play area being dragged) gets null and is traced on the canvas as ever, so a moving
// view builds no path only to throw it away. Null too where there is no Path2D. The play area is known by its object (fogMask hands
// the same one on until its stamp changes), the view by its numbers.
var _clipKey = null, _clipPath = null;
function maskClip(mask, grid, z, sx, sy, W, H, traceOn) {
    if (typeof Path2D !== 'function') return null;
    var k = _clipKey, same = !!k && k.mask === mask && k.type === grid.type && k.size === grid.size && k.s === grid.s && k.h === grid.h && k.z === z && k.sx === sx && k.sy === sy && k.W === W && k.H === H;
    if (!same) { _clipKey = { mask: mask, type: grid.type, size: grid.size, s: grid.s, h: grid.h, z: z, sx: sx, sy: sy, W: W, H: H }; _clipPath = null; return null; }
    if (!_clipPath) { var p = new Path2D(); for (var i = 0; i < mask.cells.length; i++) traceOn(p, mask.cells[i]); _clipPath = p; }
    return _clipPath;
}
// [fogcheck:maskclip-end]
// R2 #14: the stream window's tiers — the host's word on its copy (map.fogParty, fogPartyCells) alone, never worked out from the window's own copy,
// which lacks the players' sheets and the GM's null areas. Each cell once, the clearer tier winning; { all: true } (Reveal all) is no fog; nothing
// said, or a word that is no list, covers everything (fail closed)
function partyTiers(map, grid) {
    var C = core(), p = map && typeof map === 'object' ? map.fogParty : null;
    if (p && p.all === true) return null;
    var keys = Object.create(null), list = [];
    (p && Array.isArray(p.list) ? p.list : []).forEach(function(e) {
        if (!e || typeof e !== 'object') return;
        var cell = e.q !== undefined ? { q: e.q, r: e.r } : { c: e.c, r: e.r }, k = C.cellKey(cell, grid), t = e.t === 1 ? 1 : 2;
        if (keys[k] === undefined) { keys[k] = t; list.push({ key: k, cell: cell }); } else if (t > keys[k]) keys[k] = t;
    });
    return { list: list, keys: keys };
}
function draw() {
    var s = screenEl(), wrap = ui('whiteboardWrap'), C = core(); if (!s || !wrap || !C) return;
    placeScreen();
    var c = s.querySelector('canvas.fog-canvas'); if (!c) return;
    var ctx = c.getContext('2d'); if (!ctx) return;
    var W = s.clientWidth, H = s.clientHeight;
    ctx.clearRect(0, 0, W, H);
    if (!active()) return;
    var map = activeMap(), camp = activeCamp(), grid = gridForMap(map);
    var mask = fogMask(map, camp, grid);
    if (mask.mode === 'none') return;                              // no play area marked + default 'none': nothing to fog
    var tiers = isStreamView() ? partyTiers(map, grid) : revealedTiers(map, camp, drawOwner());   // R2 #14: the stream window draws the host's word
    if (tiers === null) return;                                    // reveal-all: no fog
    var z = state.zoomLevel || 1, sx = wrap.scrollLeft, sy = wrap.scrollTop;
    var pad = 80 + (grid.type === 'square' ? grid.size * z / 2 : grid.s * z * 1.02);   // keep a cell whose CENTRE is off-view but whose body reaches the viewport (else a sliver of the clip edge stays unfogged at high zoom)
    var traceOn = function(cx2, cell) {                            // add one cell's outline to a path (screen space); off-view cells are skipped
        var ctr = C.cellCenter(cell, grid), lx = ctr.x * z - sx, ly = ctr.y * z - sy;
        if (lx < -pad || ly < -pad || lx > W + pad || ly > H + pad) return;
        if (grid.type === 'square') { var half = grid.size * z / 2; cx2.rect(lx - half - 1, ly - half - 1, half * 2 + 2, half * 2 + 2); }
        else hexPath(cx2, lx, ly, grid.s * z * 1.02);
    };
    var traceCell = function(cell) { traceOn(ctx, cell); };
    var mem = isClientView() && rememberOn(camp) ? memRemember(map, grid, tiers) : null, memLay = mem && mem.n ? memLayer(map, mem, z, sx, sy, W, H, traceOn) : null;   // senses S6: the ground this player remembers
    if (!isStreamView() && typeof heightShown === 'function') tiers = heightShown(tiers, map, camp, drawOwner(), grid, mask);   // item 19b H4: the cell of a creature seen over a low wall (after the memory: it is no ground seen)
    ctx.save();
    if (mask.mode === 'set') {                                     // confine the fog to the play-area cells
        var mp = maskClip(mask, grid, z, sx, sy, W, H, traceOn);   // the same clip, kept from the frame before while nothing moved
        if (mp) ctx.clip(mp);
        else { ctx.beginPath(); for (var mi = 0; mi < mask.cells.length; mi++) traceCell(mask.cells[mi]); ctx.clip(); }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = isClientView() || isStreamView() ? 'rgba(5,6,12,0.97)' : 'rgba(9,11,20,0.62)';   // players and the stream window: opaque; the GM: see-through
    ctx.fillRect(0, 0, W, H);                                      // one flat fill (clipped to the mask when set) — no per-cell alpha seams
    ctx.globalCompositeOperation = 'destination-out';
    if (memLay) { ctx.globalAlpha = 0.3; ctx.drawImage(memLay, 0, 0); ctx.globalAlpha = 1; }   // senses S6: remembered ground, a third of the way through the fog
    // lighting: a dim cell is punched part-way (its terrain shows, darkened), a clear or bright one fully — each tier one path filled once, so
    // padded cells never double-punch a seam. Lighting off: every cell is tier 2, exactly as before
    var tl = tiers.list, tk = tiers.keys, anyDim = false;
    for (var di = 0; di < tl.length && !anyDim; di++) if (tk[tl[di].key] === 1) anyDim = true;
    if (anyDim) {
        ctx.beginPath(); for (var dj = 0; dj < tl.length; dj++) if (tk[tl[dj].key] === 1) traceCell(tl[dj].cell);
        if (memLay) { ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = 'rgba(5,6,12,0.97)'; ctx.fill(); ctx.globalCompositeOperation = 'destination-out'; }   // a dim cell it remembers is as dim as any other
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
    }
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.beginPath();
    for (var i = 0; i < tl.length; i++) if (tk[tl[i].key] !== 1) traceCell(tl[i].cell);
    ctx.fill();                                                    // punch every clear or bright cell in one pass
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    drawMarks(ctx, s, marksToDraw(map, camp), tiers.keys, grid, Date.now(), marksStill(), marksStrictOn(camp, map));   // senses S4: the marks, over the fog
    drawCaptions(ctx, s);
    drawSenseCaptions(ctx, s, blindCaptionsFor(map, camp, drawOwner()));   // senses S3: why a blind token's screen is dark
}
// Lighting L4 (owner answer 7): the name of the light a targeted token stands in, under the token. Drawn here, over the fog: the board's own
// layers lie under it, and on a player's screen the cells beneath a token are often dark. whiteboard.js marks the token with the words it
// worked out for this screen (data-light-cap); they are drawn as text (fillText: never markup), level however the token is turned, where the
// token is on screen now (a drag, a zoom or a scroll moves them with it at the overlay's own pace)
var CAPTIONS_MOST = 40;
function drawCaptions(ctx, s) {
    var els = document.querySelectorAll('#whiteboardWrap .wb-item[data-light-cap]'); if (!els.length || !ctx.fillText) return;
    var sr = s.getBoundingClientRect();
    ctx.save();
    ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var i = 0; i < els.length && i < CAPTIONS_MOST; i++) {
        var t = String(els[i].dataset.lightCap || '').slice(0, 200); if (!t) continue;
        var r = els[i].getBoundingClientRect(), cx = r.left + r.width / 2 - sr.left, cy = r.bottom - sr.top + 12, w = Math.min(ctx.measureText(t).width + 14, 360), h = 17;
        if (cx + w / 2 < 0 || cy + h < 0 || cx - w / 2 > sr.width || cy - h > sr.height) continue;   // off the board's view
        ctx.fillStyle = 'rgba(18,16,34,0.9)'; ctx.strokeStyle = 'rgba(232,230,245,0.3)'; ctx.lineWidth = 1;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 8); else ctx.rect(cx - w / 2, cy - h / 2, w, h); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e8e6f5'; ctx.fillText(t, cx, cy + 0.5, 346);
    }
    ctx.restore();
}

// Senses S4: a player's marks on their fog — each a glyph in its cell told apart by its shape (1 sound: three arcs, 2 tremor: a zigzag, 3 presence: a
// ring round a dot, 4 heat: a teardrop), in one colour, moving slowly (still under reduced motion; never flashing), never on a cell they see; its fixed
// word drawn over it while the pointer is on its cell; the count in words ("Heard: 2 · Felt: 1") at the board's bottom left. The marks of a player's
// own copy, or on the GM's screen those the previewed player gets (the host's own work); none in the GM's own view. Text is canvas text alone
var MARK_WORD = { 1: 'Heard', 2: 'Felt', 3: 'Sensed', 4: 'Heat' }, _markHover = null;
function marksStill() { try { if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true; } catch (e) {} try { return localStorage.getItem('wp_fxReduced') === '1'; } catch (e) { return false; } }
function marksToDraw(map, camp) {
    if (isClientView()) return Array.isArray(map.fogMarks) ? map.fogMarks : [];
    if (previewMode === 'off' || previewMode === 'party') return [];
    return fogMarksFor(previewMode, camp, map, fogDropIds(previewMode, camp, map) || Object.create(null), true) || [];
}
function glyphPath(ctx, k, x, y, R) {
    if (k === 1) { for (var j = 1; j <= 3; j++) { ctx.moveTo(x - R * 0.7 + R * 0.45 * j * Math.cos(-0.8), y + R * 0.45 * j * Math.sin(-0.8)); ctx.arc(x - R * 0.7, y, R * 0.45 * j, -0.8, 0.8); } return; }
    if (k === 2) { ctx.moveTo(x - R, y); ctx.lineTo(x - R * 0.6, y - R * 0.5); ctx.lineTo(x - R * 0.2, y + R * 0.5); ctx.lineTo(x + R * 0.2, y - R * 0.5); ctx.lineTo(x + R * 0.6, y + R * 0.5); ctx.lineTo(x + R, y); return; }
    if (k === 3) { ctx.moveTo(x + R * 0.8, y); ctx.arc(x, y, R * 0.8, 0, Math.PI * 2); return; }
    ctx.moveTo(x, y - R); ctx.quadraticCurveTo(x + R * 0.9, y + R * 0.2, x, y + R * 0.85); ctx.quadraticCurveTo(x - R * 0.9, y + R * 0.2, x, y - R);
}
function drawMarks(ctx, s, marks, seenKeys, grid, now, still, held) {   // held: the table plays On your own turn and a fight runs here (S4b)
    var C = core(); if (!marks || !marks.length || !C || !grid || !ctx.fillText) return;
    var wrap = ui('whiteboardWrap'), z = state.zoomLevel || 1, sx = wrap ? wrap.scrollLeft : 0, sy = wrap ? wrap.scrollTop : 0, W = s.clientWidth, H = s.clientHeight;
    var R = Math.max(6, (grid.type === 'square' ? grid.size : grid.s * 1.7) * z * 0.3), count = { 1: 0, 2: 0, 3: 0, 4: 0 }, hoverAt = null;
    ctx.save();
    ctx.strokeStyle = '#e8e6f5'; ctx.fillStyle = '#e8e6f5'; ctx.lineWidth = Math.max(1.5, R * 0.18); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (var i = 0; i < marks.length; i++) {
        var m = marks[i], cell = m.q !== undefined ? { q: m.q, r: m.r } : { c: m.c, r: m.r }, key = C.cellKey(cell, grid);
        if (!MARK_WORD[m.k] || (seenKeys && seenKeys[key] && m.s !== 1)) continue;   // item 19b: s — a creature a piece hides in a cell this player sees: its mark is drawn there
        count[m.k]++;
        var ctr = C.cellCenter(cell, grid), x = ctr.x * z - sx, y = ctr.y * z - sy;
        if (x < -2 * R || y < -2 * R || x > W + 2 * R || y > H + 2 * R) continue;   // off the board's view
        ctx.globalAlpha = still ? 0.85 : 0.62 + 0.28 * Math.sin(now / 900 + i * 1.3);   // a slow swell, each its own phase
        ctx.beginPath(); glyphPath(ctx, m.k, x, y, R); ctx.stroke();
        if (m.k === 3) { ctx.beginPath(); ctx.arc(x, y, R * 0.2, 0, Math.PI * 2); ctx.fill(); }
        if (_markHover === key) hoverAt = { x: x, y: y, word: MARK_WORD[m.k] };
    }
    ctx.globalAlpha = 1; ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    var pill = function(t, cx, cy) { var w = Math.min(ctx.measureText(t).width + 14, 360), h = 17; ctx.fillStyle = 'rgba(18,16,34,0.9)'; ctx.strokeStyle = 'rgba(232,230,245,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 8); else ctx.rect(cx - w / 2, cy - h / 2, w, h); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e8e6f5'; ctx.fillText(t, cx, cy + 0.5, 346); return w; };
    if (hoverAt) pill(hoverAt.word, hoverAt.x, hoverAt.y - R - 12);
    var said = [1, 2, 3, 4].filter(function(k) { return count[k] > 0; }).map(function(k) { return MARK_WORD[k] + ': ' + count[k]; }).join(' · ');
    if (said && held) said += ' — as heard on your turn';
    if (said) { var tw = Math.min(ctx.measureText(said).width + 14, 360), rl = ui('rulerLeft'), inset = rl && rl.offsetWidth > 0 ? rl.offsetWidth : 0; pill(said, inset + 12 + tw / 2, H - 22); }   // clear of the left ruler while it shows
    ctx.restore();
}
// the cell the pointer is on, for a mark's word (the board's own coordinates, as the fog draws them)
(function wireMarkHover() {
    if (typeof document === 'undefined') return;
    var w = ui('whiteboardWrap'); if (!w || !w.addEventListener) return;
    w.addEventListener('pointermove', function(e) {
        var map = activeMap(), grid = map ? gridForMap(map) : null, C = core(); if (!grid || !C) { _markHover = null; return; }
        var r = w.getBoundingClientRect(), z = state.zoomLevel || 1;
        _markHover = C.cellKey(C.cellOf((e.clientX - r.left + w.scrollLeft) / z, (e.clientY - r.top + w.scrollTop) / z, grid), grid);
    }, { passive: true });
    w.addEventListener('pointerleave', function() { _markHover = null; });
})();
// Senses S3: why a blind token's screen is dark and what still works — "Blind", then each sense of its that still sees with its range — above
// each character token of the viewer's that is blind (a player's own; on the GM's screen the player previewed, or every token), worked out from
// this app's own system, characters and tokens (the host sends no word of it). A sense's name is a system file's text: drawn as text, never markup
var SENSE_CAP_UNIT = { ft: 'ft', m: 'm', cells: 'cells' };
function blindCaptionsFor(map, camp, ownerId) {
    var out = [], byId = Object.create(null); campSenses(camp).concat(campMarkSenses(camp)).forEach(function(s) { byId[s.id] = s; });   // senses S4: a mark sense still works blind too
    ((map && map.whiteboard) || []).forEach(function(w) {
        if (!w || w.hidden || !w.isChar || typeof w.id !== 'string') return;   // a waiting token is never blind (tokenSenses)
        if (ownerId && ownerId !== '*' && w.ownerId !== ownerId && !(ownerId === PARTY && playerTok(w))) return;   // R2 #14: the stream window, every player's token
        var ts = tokenSenses(w, map, camp, !ownerId || ownerId === '*'), nulled = (ts.offs || []).filter(function(o) { return o.why === 'null' && byId[o.id]; }).map(function(o) { return String(byId[o.id].name); });   // senses S7a: the senses a null area switches off here
        if (!ts.blind && !nulled.length) return;
        var words = [];
        if (ts.blind) { words.push('Blind'); ts.full.concat(ts.marks || []).forEach(function(e) { var s = byId[e.id]; if (s) words.push(String(s.name) + ' ' + e.n + ' ' + (SENSE_CAP_UNIT[s.unit] || 'yd')); }); }
        if (nulled.length) words.push((nulled.length === 1 ? nulled[0] : nulled.slice(0, -1).join(', ') + ' and ' + nulled[nulled.length - 1]) + (nulled.length === 1 ? ' fails here' : ' fail here'));
        out.push({ id: w.id, text: words.join(' · ') });
    });
    return out;
}
// drawn as drawCaptions draws a light's name, but above the token (a light's name sits under it), found by its board id
function drawSenseCaptions(ctx, s, caps) {
    if (!caps.length || !ctx.fillText) return;
    var want = Object.create(null); caps.forEach(function(c) { want[c.id] = c.text; });
    var els = document.querySelectorAll('#whiteboardWrap .wb-item[data-id]'), sr = s.getBoundingClientRect(), n = 0;
    ctx.save();
    ctx.font = '600 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (var i = 0; i < els.length && n < CAPTIONS_MOST; i++) {
        var t0 = want[els[i].dataset.id]; if (t0 === undefined) continue;   // a map with no prototype: a prototype's name names nothing
        var t = String(t0).slice(0, 200), r = els[i].getBoundingClientRect(), cx = r.left + r.width / 2 - sr.left, cy = r.top - sr.top - 12, w = Math.min(ctx.measureText(t).width + 14, 360), h = 17;
        if (cx + w / 2 < 0 || cy + h < 0 || cx - w / 2 > sr.width || cy - h > sr.height) continue;   // off the board's view
        n++;
        ctx.fillStyle = 'rgba(18,16,34,0.9)'; ctx.strokeStyle = 'rgba(232,230,245,0.3)'; ctx.lineWidth = 1;
        ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 8); else ctx.rect(cx - w / 2, cy - h / 2, w, h); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#e8e6f5'; ctx.fillText(t, cx, cy + 0.5, 346);
    }
    ctx.restore();
}

/* ---------- the throttled redraw loop (runs only while the overlay is active) ---------- */
var raf = null, lastDraw = 0;
function tick() {
    raf = null;
    if (!active()) { clearCanvas(); return; }
    var now = Date.now();
    if (now - lastDraw >= 60) { lastDraw = now; draw(); }
    raf = requestAnimationFrame(tick);
}
function kick() { if (!raf) raf = requestAnimationFrame(tick); }
function redraw() { if (active()) { lastDraw = 0; kick(); } else clearCanvas(); }

/* ---------- the manual brush (whiteboard.js calls paintAt in fog mode) ---------- */
var brush = 'reveal', _saveTimer = null;
function queueSave() { if (_saveTimer) clearTimeout(_saveTimer); _saveTimer = setTimeout(function() { _saveTimer = null; save(); }, 400); }
function withoutKey(list, key, grid, C) { return (list || []).filter(function(c) { return C.cellKey(c, grid) !== key; }); }
function paintAt(boardX, boardY, opposite) {
    if (!isGmView() || !canWrite()) return;
    var map = activeMap(), C = core(); if (!map || !C) return;
    var grid = gridForMap(map);
    if (!grid) { toast('This is a gridless map — choose a measurement grid in the fog menu first.'); return; }
    var mf = mapFog(map);
    if (mf.mode !== 'auto') { mf.mode = 'auto'; syncMenu(); }
    var cell = C.cellOf(boardX, boardY, grid), key = C.cellKey(cell, grid);
    var reveal = (brush === 'reveal') !== !!opposite;
    mf.manual.adds = withoutKey(mf.manual.adds, key, grid, C);
    mf.manual.cuts = withoutKey(mf.manual.cuts, key, grid, C);
    var into = reveal ? mf.manual.adds : mf.manual.cuts, cap = C.LIMITS.manual;
    if (into.length < cap) into.push(cell); else toast('That map already has the most manual fog cells it can hold.');
    queueSave(); redraw();
}

/* ---------- the fog menu (#fogMenu) ---------- */
function fillPreviewOptions() {
    var sel = ui('fogPreview'); if (!sel) return;
    var cur = previewMode, n = net(), hosting = !!(n && n.active && n.role === 'host');
    var opts = '<option value="off">Off &mdash; whole board</option><option value="party">Party &mdash; all tokens</option>';
    if (hosting && n.roster) Object.keys(n.roster).forEach(function(k) { var p = n.roster[k]; if (p && p.id) opts += '<option value="' + esc(p.id) + '">' + esc(p.name || p.id) + '</option>'; });
    sel.innerHTML = opts;
    var ok = Array.prototype.some.call(sel.options, function(o) { return o.value === cur; });
    sel.value = ok ? cur : 'off'; if (!ok) previewMode = 'off';
}
function fillSightField() {
    var sel = ui('fogSightField'); if (!sel) return;
    var camp = activeCamp(), sys = camp && camp.system, cf = campFog(camp);
    var opts = '<option value="">Default only (no field)</option>';
    if (sys && Array.isArray(sys.fields)) sys.fields.forEach(function(f) {
        if (f && (f.kind === 'number' || f.kind === 'formula' || f.kind === 'skill' || f.kind === 'resource')) opts += '<option value="' + esc(f.id) + '">' + esc(f.label || f.key || f.id) + '</option>';
    });
    sel.innerHTML = opts;
    var ok = Array.prototype.some.call(sel.options, function(o) { return o.value === (cf.fields.sight || ''); });
    sel.value = ok ? (cf.fields.sight || '') : '';
    var wrap = ui('fogSightFieldRow'); if (wrap) wrap.style.display = (sys && Array.isArray(sys.fields) && sys.fields.length) ? '' : 'none';
    var note = ui('fogSightSecret');   // S0 (d): a field its player cannot read is not used for their sight: said, as text
    if (note) { var hid = !!(sel.value && sightSecret(camp, sel.value)); note.style.display = hid ? '' : 'none'; note.textContent = hid ? 'Players cannot read this field (it is GM-only, or worked out from one), so their tokens see by the default range below.' : ''; }
}
function syncMenu() {
    var map = activeMap(); if (!map) return;
    var mf = mapFog(map), camp = activeCamp(), cf = campFog(camp);
    var on = ui('fogOn'); if (on) on.checked = !!mf.on;
    var gridless = ((map.meta && map.meta.gridType) || 'off') === 'off';
    var gr = ui('fogGridlessRow'); if (gr) gr.style.display = gridless ? '' : 'none';
    if (gridless) {
        var cell = mf.cell || { grid: 'square', len: 60 };
        document.querySelectorAll('#fogMenu .fog-grid-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.fgrid === cell.grid); });
        var len = ui('fogCellLen'); if (len && document.activeElement !== len) len.value = cell.len;
    }
    var sight = ui('fogSight'); if (sight && document.activeElement !== sight) sight.value = cf.defaults.sight || 0;
    var sunit = ui('fogSightUnit'); if (sunit && document.activeElement !== sunit) sunit.value = cf.fields.sightUnit || 'yd';   // lighting (L4): what sight counts in
    fillSightField();
    // senses S2a: the system's senses, named (as text), with the way to the editor where they are set; hidden with no system
    var srow = ui('fogSensesRow'); if (srow) srow.style.display = camp && camp.system && typeof camp.system === 'object' ? '' : 'none';
    var mrow = ui('fogMarksRow'); if (mrow) mrow.style.display = campMarkSenses(camp).length ? '' : 'none';   // senses S4b: shown only with a mark sense
    var msel = ui('fogMarksMode'); if (msel && document.activeElement !== msel) msel.value = cf.defaults.marks === 'turn' ? 'turn' : 'move';
    var stxt = ui('fogSensesText'); if (stxt) { var snl = camp && camp.system && camp.system.combat && camp.system.combat.senses && Array.isArray(camp.system.combat.senses.list) ? camp.system.combat.senses.list : [], snn = snl.filter(function(s) { return !!s && typeof s.name === 'string' && !!s.name; }).map(function(s) { return s.name; }); stxt.textContent = snn.length ? snn.join(', ') : 'This system defines no extra senses'; }
    // vision mode (all-around vs a facing cone), decoupled from grid type
    var vis = visionOf(map), vsel = ui('fogVision');
    if (vsel) vsel.value = vis.mode;
    var arcRow = ui('fogVisionArcRow'); if (arcRow) arcRow.style.display = vis.mode === 'arc' ? '' : 'none';
    var arcIn = ui('fogVisionArc'); if (arcIn && document.activeElement !== arcIn) arcIn.value = vis.arc;
    var vdef = ui('fogVisionDefault'); if (vdef) { var dv = cf.defaults.vision; vdef.checked = !!(dv && dv.mode === vis.mode && (dv.mode === 'all' || dv.arc === vis.arc)); }
    var fDef = ui('fogOnDefault'); if (fDef) fDef.checked = !!cf.defaults.on;   // "new maps start with fog on" (campaign default)
    var frem = ui('fogRemember'); if (frem) frem.checked = cf.defaults.remember === true;   // senses S6: players remember what they have seen
    var lrow = ui('fogLightRow'); if (lrow) lrow.style.display = lightingOn() ? '' : 'none';   // lighting: the map's light
    var lsel = ui('fogLight'); if (lsel && document.activeElement !== lsel) lsel.value = mf.light === 'bright' || mf.light === 'dim' || mf.light === 'dark' ? mf.light : 'auto';
    var fEmpty = ui('fogEmptyScope'); if (fEmpty && document.activeElement !== fEmpty) fEmpty.value = cf.defaults.emptyFog === 'none' ? 'none' : 'whole';   // what a map with no play area marked does
    document.querySelectorAll('#fogMenu .fog-brush-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.fbrush === brush); });
    fillPreviewOptions();
    var note = ui('fogNote'); if (note) note.textContent = gridForMap(map) ? '' : 'Gridless map: pick a measurement grid above so fog can compute cells.';
}
// Found live (item 18): on a short window the menu, opening upward from the toolbar and capped only by the viewport, ran its top rows (Fog on
// this map first) under the page's header, where no click reaches them. Opened or the window resized, it now keeps its top below the header
// and scrolls inside
// [fogcheck:fitmenu-start]
function fitMenu(m) {
    if (!m || typeof m.getBoundingClientRect !== 'function') return;
    m.style.maxHeight = '';
    var hd = document.querySelector('header'), top = (hd ? hd.getBoundingClientRect().bottom : 0) + 8, r = m.getBoundingClientRect();
    if (r.top < top) m.style.maxHeight = Math.max(160, Math.floor(r.height - (top - r.top))) + 'px';
}
// [fogcheck:fitmenu-end]
function openMenu() { var m = ui('fogMenu'); if (!m || !canWrite()) return; syncMenu(); m.classList.add('show'); fitMenu(m); redraw(); }
function closeMenu() { var m = ui('fogMenu'); if (m) m.classList.remove('show'); }

var LIGHT_SAID = {
    auto: 'This map is lit until you place a light source on it (the \u2728 effects panel).',
    bright: 'This map is lit: every token sees what is in its line of sight.',
    dim: 'This map is dim: beyond a token\'s sight in the dark it shows darkened.',
    dark: 'This map is dark: a token sees only as far as its sight in the dark.'
};

/* ---------- wiring ---------- */
(function wire() {
    var menu = ui('fogMenu'); if (!menu) return;
    ['pointerdown', 'click'].forEach(function(ev) { menu.addEventListener(ev, function(e) { e.stopPropagation(); }); });
    window.addEventListener('resize', function() { if (menu.classList.contains('show')) fitMenu(menu); });   // an open menu keeps clear of the header as the window changes
    var on = ui('fogOn');
    if (on) on.addEventListener('change', function() {
        var map = activeMap(); if (!map) return;
        var mf = mapFog(map); mf.on = on.checked;
        if (mf.on && ((map.meta && map.meta.gridType) || 'off') === 'off' && !mf.cell) mf.cell = { grid: 'square', len: 60 };
        save(); syncMenu(); redraw();
        toast(mf.on ? 'Fog on for this map.' : 'Fog off for this map — the whole map shows.');
    });
    document.querySelectorAll('#fogMenu .fog-grid-btn').forEach(function(b) {
        b.addEventListener('click', function() { var map = activeMap(); if (!map) return; var mf = mapFog(map); mf.cell = { grid: b.dataset.fgrid, len: (mf.cell && mf.cell.len) || 60 }; save(); syncMenu(); redraw(); });
    });
    var len = ui('fogCellLen');
    if (len) len.addEventListener('change', function() { var map = activeMap(); if (!map) return; var mf = mapFog(map), v = Math.round(Number(len.value) || 0); mf.cell = { grid: (mf.cell && mf.cell.grid) || 'square', len: Math.max(core().LIMITS.len[0], Math.min(core().LIMITS.len[1], v || 60)) }; save(); syncMenu(); redraw(); });
    var sight = ui('fogSight');
    if (sight) sight.addEventListener('change', function() { var camp = activeCamp(); if (!camp) return; var cf = campFog(camp), v = Math.round(Number(sight.value) || 0); cf.defaults.sight = Math.max(0, Math.min(100000, v)); save(); syncMenu(); redraw(); });
    var sfield = ui('fogSightField');
    if (sfield) sfield.addEventListener('change', function() { var camp = activeCamp(); if (!camp) return; var cf = campFog(camp); cf.fields.sight = sfield.value || undefined; if (!sfield.value) delete cf.fields.sight; save(); syncMenu(); redraw(); });
    var sedit = ui('fogSensesEdit');
    if (sedit) sedit.addEventListener('click', function() { closeMenu(); if (window.wpSheets && window.wpSheets.open) window.wpSheets.open('items'); });   // senses S2a: they are set on the System editor's Combat card
    var msel = ui('fogMarksMode');   // senses S4b: "Marks in a fight" (what is held is forgotten: the new rule starts from now)
    if (msel) msel.addEventListener('change', function() {
        var camp = activeCamp(); if (!camp) return; var cf = campFog(camp);
        if (msel.value === 'turn') cf.defaults.marks = 'turn'; else delete cf.defaults.marks;
        marksForget(null); save(); invalidateVision(); syncMenu(); redraw();
        toast(msel.value === 'turn' ? 'In a fight, each player’s marks now move when a turn of theirs starts.' : 'Marks now follow every move, in a fight or not.');
    });
    var sunit = ui('fogSightUnit');
    if (sunit) sunit.addEventListener('change', function() {
        var camp = activeCamp(), C = core(); if (!camp || !C) return; var cf = campFog(camp), u = C.lightUnit(sunit.value);
        if (u) cf.fields.sightUnit = u; else delete cf.fields.sightUnit;   // yards: the absent default
        save(); invalidateVision(); syncMenu(); redraw();
    });
    var vsel = ui('fogVision');
    if (vsel) vsel.addEventListener('change', function() {
        var map = activeMap(); if (!map) return; var mf = mapFog(map), C = core();
        if (vsel.value === 'arc') { var cur = (mf.vision && mf.vision.mode === 'arc' && mf.vision.arc) || (C ? C.LIMITS.arcDeg : 180); mf.vision = { mode: 'arc', arc: cur }; }
        else mf.vision = { mode: 'all', arc: 360 };
        save(); invalidateVision(); syncMenu(); redraw();
    });
    var varc = ui('fogVisionArc');
    if (varc) varc.addEventListener('change', function() {
        var map = activeMap(); if (!map) return; var mf = mapFog(map), C = core();
        var a = Math.round(Number(varc.value) || 0); a = Math.max(1, Math.min(360, a || (C ? C.LIMITS.arcDeg : 180)));
        mf.vision = { mode: 'arc', arc: a }; save(); invalidateVision(); syncMenu(); redraw();
    });
    var vdef = ui('fogVisionDefault');
    if (vdef) vdef.addEventListener('change', function() {
        var camp = activeCamp(), map = activeMap(); if (!camp || !map) return; var cf = campFog(camp);
        if (vdef.checked) cf.defaults.vision = visionOf(map); else delete cf.defaults.vision;
        save(); syncMenu();
        toast(vdef.checked ? 'New maps in this campaign will start with this vision.' : 'New maps will use the grid default again.');
    });
    var fAll = ui('fogOnAllMaps');
    if (fAll) fAll.addEventListener('click', function() {
        var camp = activeCamp(); if (!camp || !camp.items || !canWrite()) return;
        var N = net(), hosting = !!(N && N.active && N.role === 'host'), n = 0, ids = [];
        Object.keys(camp.items).forEach(function(k) { var m = camp.items[k]; if (m && m.type === 'map') { mapFog(m).on = true; n++; ids.push(m.id); } });
        save(); invalidateVision(); syncMenu(); redraw();
        // save() only resends the ACTIVE map; re-enforce fog on EVERY map so a player viewing another map doesn't keep an unfogged copy (with creatures the GM now hides)
        if (hosting && N.broadcastItemFiltered) ids.forEach(function(id) { N.broadcastItemFiltered(camp.id, id); });
        toast('Fog on for all ' + n + ' map' + (n === 1 ? '' : 's') + ' in this campaign.');
    });
    var lplace = ui('fogLightPlace');
    if (lplace) lplace.addEventListener('click', function() { closeMenu(); if (window.wpArmLight) window.wpArmLight(); });   // lighting: the same Light source as the effects panel's (Visual effects may be off)
    var lsel = ui('fogLight');
    if (lsel) lsel.addEventListener('change', function() {
        var map = activeMap(); if (!map) return; var mf = mapFog(map);
        if (lsel.value === 'bright' || lsel.value === 'dim' || lsel.value === 'dark') mf.light = lsel.value; else delete mf.light;
        save(); invalidateVision(); syncMenu(); redraw();
        toast(LIGHT_SAID[mf.light || 'auto']);
    });
    var fDef = ui('fogOnDefault');
    if (fDef) fDef.addEventListener('change', function() {
        var camp = activeCamp(); if (!camp) return; var cf = campFog(camp);
        if (fDef.checked) cf.defaults.on = true; else delete cf.defaults.on;
        save(); syncMenu();
        toast(fDef.checked ? 'New maps in this campaign will start with fog on.' : 'New maps will start with fog off.');
    });
    var frem = ui('fogRemember');   // senses S6: "Players remember what they have seen" (each on their own screen)
    if (frem) frem.addEventListener('change', function() {
        var camp = activeCamp(); if (!camp) return; var cf = campFog(camp);
        if (frem.checked) cf.defaults.remember = true; else delete cf.defaults.remember;
        save(); syncMenu();
        toast(frem.checked ? 'Players now keep the ground they have seen, dimmed, each on their own screen.' : 'Players no longer keep the ground they have seen.');
    });
    var fEmpty = ui('fogEmptyScope');
    if (fEmpty) fEmpty.addEventListener('change', function() {
        var camp = activeCamp(); if (!camp) return; var cf = campFog(camp);
        if (fEmpty.value === 'none') cf.defaults.emptyFog = 'none'; else delete cf.defaults.emptyFog;
        save(); invalidateVision(); syncMenu(); redraw();
        toast(fEmpty.value === 'none' ? 'Maps with no play area marked now show no fog.' : 'Maps with no play area marked fog the whole map.');
    });
    document.querySelectorAll('#fogMenu .fog-brush-btn').forEach(function(b) { b.addEventListener('click', function() { brush = b.dataset.fbrush === 'hide' ? 'hide' : 'reveal'; syncMenu(); }); });
    var rev = ui('fogRevealAll');
    if (rev) rev.addEventListener('click', function() { var map = activeMap(); if (!map) return; var mfR = mapFog(map); mfR.mode = 'reveal'; mfR.epoch = (mfR.epoch || 0) + 1; save(); syncMenu(); redraw(); toast('Whole map revealed. Paint or pick a preview to fog again.'); });   // senses S6: a new epoch empties every player's memory of it
    var cov = ui('fogCoverAll');
    if (cov) cov.addEventListener('click', function() { var map = activeMap(); if (!map) return; var mfC = mapFog(map); mfC.mode = 'cover'; mfC.epoch = (mfC.epoch || 0) + 1; save(); syncMenu(); redraw(); toast('Whole map covered — only cells you reveal by hand show.'); });   // senses S6: a new epoch empties every player's memory of it
    var prev = ui('fogPreview');
    if (prev) prev.addEventListener('change', function() { previewMode = prev.value || 'off'; redraw(); });
    var wrap = ui('whiteboardWrap');
    if (wrap && window.ResizeObserver) { try { new ResizeObserver(function() { if (active()) draw(); }).observe(wrap); } catch (e) {} }
    window.addEventListener('resize', function() { if (active()) draw(); });
    window.addEventListener('scroll', function() { if (active()) { lastDraw = 0; kick(); } }, true);
    document.addEventListener('click', function(e) {
        if (menu.classList.contains('show') && !e.target.closest('#fogMenu') && !e.target.closest('#fogModeBtn') && !window.isFogMode) closeMenu();
    });
    setTimeout(placeScreen, 0);
})();

function sync() {   // the VTT switch moved, or a session started / ended
    var b = ui('fogModeBtn'), showBtn = fogFeatureOn() && isGmView() && canWrite();
    if (b) { b.style.display = showBtn ? '' : 'none'; if (b.parentNode) b.parentNode.style.display = showBtn ? '' : 'none'; }   // hide the wrapper too, else its empty flex slot leaves a double gap in the toolbar
    if (!showBtn) { closeMenu(); if (window.isFogMode && window.wpExitFogMode) { window.isFogMode = false; window.wpExitFogMode(); } }
    var fmu = ui('fogMenu'); if (showBtn && fmu && fmu.classList.contains('show')) syncMenu();   // an open menu follows a switch moved under it (the Light row)
    invalidateVision();
    redraw();
}
function tableLeft() { previewMode = 'off'; invalidateVision(); clearCanvas(); }
function onSnapshot() { previewMode = 'off'; invalidateVision(); var mc = activeCamp(); if (!mc || mc.id !== _memCamp) memForget(); _memCamp = mc ? mc.id : null; redraw(); }   // senses S6: a table of another campaign starts from no memory
function foreign(isForeign) { previewMode = 'off'; invalidateVision(); if (isForeign) clearCanvas(); else redraw(); }

window.wpFogSync = sync;
window.wpFogRedraw = redraw;
setTimeout(sync, 0);
window.wpFog = {
    // host enforcement (net.js)
    fogDropIds: fogDropIds, fogLitFor: fogLitFor, canSeePoint: canSeePoint, coverAt: coverAt, blastSeat: blastSeat, moveBlocked: moveBlocked, moveCells: moveCells, moveCost: moveCost, invalidateVision: invalidateVision, invalidateSeen: invalidateSeen, seenKeyOf: seenKeyOf, lightMoves: lightMoves, sightSigFor: sightSigFor, tokenSightCells: tokenSightCells, coverBetween: coverBetween,
    PARTY: PARTY, fogPartyCells: fogPartyCells,   // R2 #14: the stream window's standpoint (the players' tokens together) and the cells it draws by, for its copy (net.js fogPartyCopy)
    // GM tools
    paintAt: paintAt, toggleDoorAt: toggleDoorAt, openMenu: openMenu, closeMenu: closeMenu, sync: sync, redraw: redraw,
    setPreview: function(p) { previewMode = p || 'off'; redraw(); }, preview: function() { return previewMode; }, brush: function() { return brush; }, active: active,
    tableLeft: tableLeft, onSnapshot: onSnapshot, foreign: foreign,
    lightLevel: mapLevel, lightCount: lightCount,
    lightSeen: lightSeen,
    tokenSenses: tokenSenses, campSenses: campSenses,   // senses S2b: a token's Properties show its senses as the host reads them
    eyesArc: eyesArc,   // the eyes' arc: the arc a token sees through on a map (its Properties say when it is its own)
    fogMarksFor: fogMarksFor, campMarkSenses: campMarkSenses,   // senses S4: a player's marks (the host's, for their copy)
    marksHold: marksHold, marksForget: marksForget, marksStrictOn: marksStrictOn,   // senses S4b: a refresh of what is held, forgetting it, and whether a map plays it
    fogOffFor: fogOffFor, nullsAt: nullsAt,   // senses S7a: a player's word of their own tokens' senses a null area switches off, and what is off where a token stands
    stats: function() { var map = activeMap(); return { on: map ? !!mapFog(map).on : false, light: map ? mapLevel(map) : null, mode: map ? mapFog(map).mode : null, preview: previewMode, brush: brush, fogMode: !!window.isFogMode, role: roleNow() }; }
};
