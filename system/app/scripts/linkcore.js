/* linkcore.js: a part of systemcore.js (docs/REFACTOR_SPLIT_PLAN.md, area 3, linked sheets; split 2026-11-18 with no change in behavior).
   What it holds: linked sheets, a sheet that reads another (a Mount link, one rider to one mount; a Crew link, many people to one
   vehicle). How a system's links are cleaned (cleanLinks, linkByKey); a Crew link's groups, stations and figures (groupLink,
   crewStation, stationOf, crewParts, linkFig, figRead, figVeh, figExpand); a crew sheet's stations and the rolls a crew may press
   (cleanCharStn, rollStations, rollStationOk, crewPressOf, crewRollsOf, cleanCr, withPresser); the figures a player's copy reads
   (crewFigs, cleanCk, holdFigs, cleanHk, linkFigs, cleanLk); how a GM-only judge reads a linked name (linkBare, linkNamesIn); a
   character's own links (cleanCharLinks); and the one judge of a link set (linkSet). Who may sit at a station and what a deleted
   character's links let go live in linkseatcore.js; a row joined to a sheet in rowsheetcore.js; the resolver's own reads of a linked
   sheet (linkVal, crewVal, sheetVal), the three sources (_linkSrc, _crewSrc, _holdSrc) and _inVeh stay in systemcore.js, which reads
   them as they change.
   Why it looks this way: these lines stood in systemcore.js, and they still run exactly where they stood. systemcore.js calls
   linkCore() at its line `// [split:linkcore.js]`, so the body below runs in the old order, after everything above that line and
   before everything below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test
   that reads systemcore.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the
   body uses of systemcore.js; the last line hands back the names systemcore.js uses of it. Neither side may assign the other's names,
   and a name this part assigns again later may not be read outside it, since systemcore.js holds only a copy (tools/splitcheck.js
   holds both). Change the code here as if it still stood in systemcore.js. */
// [split:of systemcore.js]
import { CHAR_ID, CTRL_RE_G, LIMITS, NAME_SUFFIX, _crewSrc, _holdSrc, _inVeh, _linkSrc, cleanExplain, cleanFormulaText, cutText, fin, hasDice, hasOwn, isObj, keyIndex, lower, makeResolver, map, onOther, openChar, rollNeedsOk, rowDef, seatsFull, sheetsAny, stationFit, str, validKey } from './systemcore.js';   // [split:glue]
export function linkCore() {   // [split:glue]
// [split:body-start]
// 1.6.0, linked sheets (the owner, by prompt: "Two kinds", "A menu on the sheet", "lets go with mount.name then", "Its owner and the GM",
// "Each keeps its own", "Only the figures read"). A system's links, sys.links: [{ id, key, label, kind, edit }], kind a Mount (one rider to
// one mount) or a Crew link (many people to one vehicle); a character holds links: { <link id>: <character id> }. A formula reads the sheet
// a link holds, live, as <Key>.<name> (Mount.Move, Vehicle.HP.max), and <Key>.has 1 while linked; with no link every name reads 0. A field
// of the system's own keyed like the link keeps the whole family. Absent: the system and its characters are as before
var LINK_ID = /^lk_[A-Za-z0-9_]{1,24}$/, LINK_KINDS = Object.freeze({ mount: 'Mount', crew: 'Crew' }), LINK_NOT = Object.freeze({ row: 1, on: 1, date: 1, facing: 1, arc: 1, threats: 1 });
function cleanLinks(raw, F) {
    if (!Array.isArray(raw)) return null;
    var out = [], ids = map(), ks = map();
    raw.forEach(function(k) {
        if (out.length >= LIMITS.links || !isObj(k) || typeof k.id !== 'string' || !LINK_ID.test(k.id) || ids[k.id] || !hasOwn(LINK_KINDS, k.kind)) return;
        if (typeof k.key !== 'string' || k.key.indexOf('.') >= 0 || LINK_NOT[lower(k.key)] || ks[lower(k.key)] || !validKey(k.key, F)) return;
        ids[k.id] = 1; ks[lower(k.key)] = 1;
        var lo = { id: k.id, key: k.key, label: str(k.label, LIMITS.label).replace(CTRL_RE_G, ' ').trim() || k.key, kind: k.kind, edit: k.edit === 'gm' ? 'gm' : 'owner' };
        if (k.kind === 'crew' || k.kind === 'mount') {   // 1.6.0 (CORE gap 16): what the vehicle reads its crew by (a mount its riders, since 1.6.0), and the crew's stations
            var gk = typeof k.group === 'string' ? k.group.trim() : '';
            if (gk && gk.indexOf('.') < 0 && !LINK_NOT[lower(gk)] && !ks[lower(gk)] && validKey(gk, F)) { ks[lower(gk)] = 1; lo.group = gk; }
        }
        if (k.kind === 'crew') {
            if (Array.isArray(k.stations)) { var stS = [], stM = map(); k.stations.slice(0, LINK_STATIONS * 4).forEach(function(s) { var t = typeof s === 'string' ? s.trim() : ''; if (stS.length >= LINK_STATIONS || !STATION_KEY.test(t) || CREW_WORDS[lower(t)] || stM[lower(t)]) return; stM[lower(t)] = 1; stS.push(t); }); if (stS.length) lo.stations = stS; }
            if (k.kind === 'crew') { var vhT = cleanFormulaText(k.veh); if (vhT && F && typeof F.parse === 'function') { var vhP = F.parse(vhT); if (!vhP.ok || hasDice(vhP.ast.body)) vhT = null; } if (vhT) lo.veh = vhT; }   // 1.6.2 (218; the owner, by prompt: "A tick on the link"): which sheets are crewed, read on the vehicle's own sheet; they show + Crew…
            if (lo.stations && isObj(k.fit)) { var fiS = {}, fiN = 0; lo.stations.forEach(function(s) { var fv = null; Object.keys(k.fit).forEach(function(x) { if (fv === null && lower(x) === lower(s)) fv = k.fit[x]; }); if (!isObj(fv)) return; var ft = cleanFormulaText(fv['if']); if (!ft) return; if (F && typeof F.parse === 'function') { var fp = F.parse(ft); if (!fp.ok || hasDice(fp.ast.body)) return; } var fo = { 'if': ft }, fs0 = cutText(fv.says, LIMITS.needsWords); if (fs0) fo.says = fs0; fiS[s] = fo; fiN++; }); if (fiN) lo.fit = fiS; }   // 1.6.2 (218; the owner, by prompt: "A rule, with Show all"): who may sit at a station, read on the sheet that sits there, with the system's own words for why not
            if (lo.stations && isObj(k.seats)) { var seS = {}, seN = 0; lo.stations.forEach(function(s) { var sv = null; Object.keys(k.seats).forEach(function(x) { if (sv === null && lower(x) === lower(s)) sv = k.seats[x]; }); if (typeof sv === 'number' && fin(sv) && Math.floor(sv) >= 1) { seS[s] = Math.min(99, Math.floor(sv)); seN++; } }); if (seN) lo.seats = seS; }   // 1.6.2 (205; the owner, by prompt: "Player refused, GM told"): at most this many sheets at a station, keyed as the station is spelled
            if (lo.stations && typeof k.most === 'number' && fin(k.most)) { var moS = Math.min(STATION_MOST, lo.stations.length, Math.floor(k.most)); if (moS >= 2) lo.most = moS; }   // 1.6.0 (the core's ruling: one hand may cover a second station): how many stations one crew sheet may hold at once (absent: one)
        }
        if (k.kind === 'crew' && k.vturn === true) lo.vturn = true;   // 1.6.2 (CORE Ch19, the owner by prompt: "A tick on the Crew link"): its crew act in the vehicle's turn, with no token of their own (net.js crewVeh)
        if (k.kind === 'crew' && k.press === true) { lo.press = true; if (k.pressNamed === true) lo.pressNamed = true; }   // 1.6.0 Its crew may press this sheet's rolls (crewPressOf), and only those that name a station (found on a real build: every sheet shares a system's rolls, so 40 of a character's own filled the list before any row of the vehicle's)
        if (lo.group && Array.isArray(k.figs)) {   // the core handbook session's ask 6 (2026-10-29): figures each sheet of the group works out, each { key, formula }: a formula of the system's own names, no dice, worked out on each crew sheet (a rider's), read as <group>.max|min|sum.<key>
            var fgO = [], fgM = map(); k.figs.slice(0, LINK_FIGS * 4).forEach(function(x) {
                if (fgO.length >= LINK_FIGS || !isObj(x) || typeof x.key !== 'string') return;
                var fk = x.key.trim(); if (!STATION_KEY.test(fk) || CREW_WORDS[lower(fk)] || fgM[lower(fk)] || !validKey(fk, F)) return;
                var ff = cleanFormulaText(x.formula), fp = ff && F && typeof F.parse === 'function' ? F.parse(ff) : null; if (!fp || !fp.ok || !fp.ast || hasDice(fp.ast.body)) return;
                fgM[lower(fk)] = 1; fgO.push({ key: fk, formula: ff });
            });
            if (fgO.length) lo.figs = fgO;
        }
        var exL = cleanExplain(k.explain); if (exL) lo.explain = exL;   // 1.6.2 (backlog 218 fold 3)
        out.push(lo);
    });
    return out.length ? out : null;
}
function linkByKey(sys) { var m = map(); (sys && Array.isArray(sys.links) ? sys.links : []).forEach(function(k) { if (isObj(k) && typeof k.id === 'string' && typeof k.key === 'string' && k.key.indexOf('.') < 0 && hasOwn(LINK_KINDS, k.kind) && !m[lower(k.key)]) m[lower(k.key)] = k; }); return m; }
// 1.6.0 (CORE gap 16; the owner, by prompt: "they have to be assigned to piloting for their skill to be available", stations "On the link",
// "Players' view, as links"): a Crew link may name group, the key the vehicle reads its crew by, and stations, the places a crew member takes
// (Pilot, Gunner), each a key; a crew sheet holds stn: { <link id>: <station> }. On the vehicle <group>.count is how many sheets crew it, and
// <group>.max.<name>, .min.<name> and .sum.<name> read a name over them; <group>.<Station>.count and <group>.<Station>.max.<name> (min, sum)
// over those at that station alone. Each crew sheet is read with the very system the vehicle is read with (crewSource: the players' view on
// the host reads each as its owner holds it, so a GM-only figure never counts for a player), one level deep. None of a number: 0
var LINK_STATIONS = 80, LINK_FIGS = 40, STATION_KEY = /^[A-Za-z][A-Za-z0-9_]{0,23}$/, CREW_WORDS = Object.freeze({ count: 1, max: 1, min: 1, sum: 1, has: 1 });
function groupLink(k) { return isObj(k) && (k.kind === 'crew' || k.kind === 'mount'); }   // 1.6.0: a link whose linked sheet reads those who link it as a group (a vehicle its crew, a mount its riders)
function groupByKey(sys) { var m = map(); (sys && Array.isArray(sys.links) ? sys.links : []).forEach(function(k) { if (groupLink(k) && typeof k.id === 'string' && typeof k.group === 'string' && k.group && k.group.indexOf('.') < 0 && !m[lower(k.group)]) m[lower(k.group)] = k; }); return m; }
// A crew sheet's stations on a link, as a list: each a station of the link in its own spelling, once, at most the link's most (one where none);
// v a station or a list of them
function stationsIn(k, v) { var out = []; (Array.isArray(v) ? v.slice(0, STATION_MOST) : [v]).forEach(function(x) { var s = typeof x === 'string' ? stationOf(k, x) : ''; if (s && out.indexOf(s) < 0 && out.length < (isObj(k) && typeof k.most === 'number' ? k.most : 1)) out.push(s); }); return out; }
var STATION_MOST = 40;
// 1.6.0: a crew sheet's read of one station it may hold, <Key>.station.<Station>: the station in the link's own spelling where rest (the
// name after the link's key, lower case) is station.<a station of a Crew link>, else ''. It reads so whatever fields the system has, but
// where a field keyed station reads that third part itself: an ending of a field's part (NAME_SUFFIX: Station.max), or, for a list keyed
// station, what the list reads at two parts (count, qty, paid, a stat, a column)
function crewStation(k, rest, ix) {
    if (!isObj(k) || k.kind !== 'crew' || typeof rest !== 'string' || rest.indexOf('station.') !== 0) return '';
    var x = rest.slice(8), fs = ix ? ix.station : null;
    if (isObj(fs) && (NAME_SUFFIX[x] || (fs.kind === 'item-list' && stationListReads(fs, x)))) return '';
    return stationOf(k, x);
}
function stationListReads(f, x) { if (x === 'count' || x === 'qty' || x === 'paid') return true; var sp = isObj(f.list) ? f.list : null, hit = false; ['stats', 'cols'].forEach(function(p) { (sp && Array.isArray(sp[p]) ? sp[p] : []).forEach(function(c) { if (isObj(c) && typeof c.key === 'string' && lower(c.key) === x) hit = true; }); }); return hit; }
function stationOf(k, v) { var l = lower(String(v === undefined || v === null ? '' : v).trim()), hit = ''; (isObj(k) && Array.isArray(k.stations) ? k.stations : []).forEach(function(s) { if (!hit && l && lower(s) === l) hit = s; }); return hit; }
// A group read's parts: { st: the station ('' the whole crew), agg: count|max|min|sum, name: the name read (as written) } or null
function crewParts(k, rest) {
    var segs = String(rest).split('.'), st = '', i = 0;
    if (segs.length > 1 && !CREW_WORDS[lower(segs[0])]) { st = stationOf(k, segs[0]); if (!st) return null; i = 1; }
    var agg = lower(segs[i] || ''), name = segs.slice(i + 1).join('.');
    if (agg === 'count') return i + 1 === segs.length ? { st: st, agg: agg, name: '' } : null;
    return (agg === 'max' || agg === 'min' || agg === 'sum') && name ? { st: st, agg: agg, name: name } : null;
}
function crewBare(k, rest) { var p = crewParts(k, rest); return p && p.name ? p.name : ''; }
// The core handbook session's ask 6 (2026-10-29): a group link's own figure by its key (any case), or null. figRead: the figure a group read
// names, <group>[.<Station>].max|min|sum.<key>, where no field of the system has the group's key; figExpand: names with each such read
// replaced by the names its formula reads, so the GM-only judges and the players' view judge a figure by what it is worked out from
function linkFig(k, name) { var l = lower(String(name || '')), hit = null; (isObj(k) && Array.isArray(k.figs) ? k.figs : []).forEach(function(x) { if (!hit && isObj(x) && typeof x.key === 'string' && lower(x.key) === l) hit = x; }); return hit; }
function figRead(sys, ix, name) {
    var s = String(name), d = s.indexOf('.'); if (d <= 0 || !sys || !Array.isArray(sys.links)) return null;
    var g = lower(s.slice(0, d)), k = groupByKey(sys)[g]; if (!k || !Array.isArray(k.figs) || (ix || keyIndex(sys))[g]) return null;
    var p = crewParts(k, s.slice(d + 1)); return p && p.name ? linkFig(k, p.name) : null;
}
// The core handbook session's ask (2026-10-29, after ask 6): inside a group figure's formula, <LinkKey>.<name> (the link's own key, as
// Vehicle.Class) reads the sheet doing the reading (the vehicle), with that sheet's own resolver, where the crew sheet's own link would read
// it at no depth at all. <LinkKey>.has reads 1 there (the sheet is of the group), .stations and .station.<Station> stay the crew sheet's own,
// and a field keyed like the link keeps its family. figVeh answers the vehicle's name (lower case), or ''. While a vehicle name is read (_inVeh) every group read reads 0, so a vehicle
// name that itself reads the group's figures never loops. The GM-only judges read such a name as the name it reads (linkBare), as any
// <LinkKey>.<name>, so a figure worked out from a GM-only value of the vehicle is GM-only too
function figVeh(k, ix, name) {
    var l = lower(String(name || '')), vk = isObj(k) && typeof k.key === 'string' ? lower(k.key) : '';
    if (!vk || !ix || ix[vk] || l.length <= vk.length + 1 || l.slice(0, vk.length + 1) !== vk + '.') return '';
    var rs = l.slice(vk.length + 1);
    if ((rs === 'stations' && k.kind === 'crew' && !ix.stations) || crewStation(k, rs, ix)) return '';
    return rs;
}
function figExpand(sys, names) {
    if (!Array.isArray(names) || !sys || !Array.isArray(sys.links) || !sys.links.some(function(k) { return isObj(k) && Array.isArray(k.figs); })) return names;
    var ix = keyIndex(sys), out = [];
    names.forEach(function(n) {
        var s = typeof n === 'string' ? n : (n && typeof n.name === 'string' ? n.name : ''), fg = s ? figRead(sys, ix, /^on\./i.test(s) && s.length > 3 ? s.slice(3) : s) : null;
        if (!fg) { out.push(n); return; }
        (String(fg.formula).match(/[A-Za-z_][A-Za-z0-9_.]*/g) || []).forEach(function(t) { out.push(typeof n === 'string' ? t : { name: t }); });
    });
    return out;
}
// A crew sheet's stations, by link, each a station of that link and only for a link it holds
function cleanCharStn(raw, sys, links) {
    if (!isObj(raw) || !isObj(links) || !sys || !Array.isArray(sys.links)) return null;
    var out = {}, n = 0;
    sys.links.forEach(function(k) { if (!isObj(k) || k.kind !== 'crew' || !hasOwn(links, k.id) || !hasOwn(raw, k.id)) return; var sv = stationsIn(k, raw[k.id]); if (sv.length) { out[k.id] = sv.length === 1 ? sv[0] : sv; n++; } });   // one station as text, two or more as a list
    return n ? out : null;
}
// 1.6.0 Its crew may press this sheet's rolls (a Crew link's press; asked by the session that keeps a campaign's build). A vehicle's rolls sit on its own
// sheet, and a crew member's app holds no whole copy of it, so the host lists what they may press on their OWN copy (cr, by link: crewRollsOf through the
// players' view) and a press names the sheet that made it (by). crewPressOf is the one judge, on the host's own copy: byId a character of pid's, not one
// in the making, linked to vehId by a Crew link ticked so: { char, link, stns } or null. A roll's stations says which stations may press it (rollStationOk)
var CREW_ROLLS = 400;
function rollStations(raw) { if (!Array.isArray(raw)) return null; var out = [], seen = map(); raw.slice(0, LINK_STATIONS * 4).forEach(function(s) { var t = typeof s === 'string' ? s.trim() : ''; if (out.length < LINK_STATIONS && STATION_KEY.test(t) && !seen[lower(t)]) { seen[lower(t)] = 1; out.push(t); } }); return out.length ? out : null; }
function rollStationOk(r, stns, named) { var w = isObj(r) && Array.isArray(r.stations) ? r.stations : null; if (!w || !w.length) return named !== true; var have = (Array.isArray(stns) ? stns : []).map(lower); return w.some(function(s) { return have.indexOf(lower(s)) >= 0; }); }
function crewPressOf(sys, chars, vehId, byId, pid) {
    if (!sys || !Array.isArray(sys.links) || !isObj(chars) || typeof byId !== 'string' || typeof vehId !== 'string' || byId === vehId || !pid || !hasOwn(chars, byId) || !hasOwn(chars, vehId)) return null;
    var c = chars[byId], hit = null; if (!isObj(c) || c.npc || c.ownerId !== pid || c.making === 1 || !isObj(c.links)) return null;
    sys.links.forEach(function(k) { if (!hit && isObj(k) && k.kind === 'crew' && k.press === true && c.links[k.id] === vehId) hit = { char: c, link: k, stns: isObj(c.stn) ? stationsIn(k, c.stn[k.id]) : [] }; });
    return hit;
}
// What one crew member may press on a vehicle, from its copy in the players' view: a system roll, and a list's roll on each row its Shown where lets stand. A
// roll that answers something (Resists an attempt), one used on someone next to you, the initiative roll and one that asks a level are not on offer
function crewRollsOf(view, veh, stns, F, named) {
    var out = [], vars = null; if (!isObj(view) || !isObj(veh)) return out;
    var offered = function(r) { return isObj(r) && typeof r.formula === 'string' && r.formula && !r.apply && r.init !== true && r.resist !== true && !onOther(r) && r.askLvl !== true && rollStationOk(r, stns, named); };
    var nameOf = function(r) { var t = typeof r.label === 'string' ? r.label.trim() : ''; return t && t.indexOf('{') < 0 ? t : 'Roll'; };
    (Array.isArray(view.rolls) ? view.rolls : []).forEach(function(r) { if (out.length < CREW_ROLLS && offered(r)) out.push({ act: r.id, expr: r.formula, label: nameOf(r) }); });
    (Array.isArray(view.fields) ? view.fields : []).forEach(function(f) {
        var sp = isObj(f) && f.kind === 'item-list' && isObj(f.list) ? f.list : null, rows = sp && Array.isArray(sp.rolls) && sp.rolls.length && isObj(veh.values) && Array.isArray(veh.values[f.id]) ? veh.values[f.id] : null; if (!rows) return;
        rows.forEach(function(row) {
            var d = isObj(row) && typeof row.id === 'string' ? rowDef(view, row) : null; if (!d || !d.def) return;
            sp.rolls.forEach(function(lr, i) {
                if (out.length >= CREW_ROLLS || !offered(lr)) return;
                if (typeof lr.showIf === 'string' && lr.showIf) { if (!F) return; vars = vars || makeResolver(view, veh, F); var rv = vars.row(f.id, row.id); if (!rv || !rollNeedsOk({ needs: lr.showIf }, rv, F)) return; }
                out.push({ f: f.id, r: row.id, i: i, expr: lr.formula, label: (d.def.name || 'Row') + ' \u00b7 ' + nameOf(lr) });
            });
        });
    });
    return out;
}
// A player's app takes the list as data: an entry by its shape, a label as text, a formula only as text the host will rebuild and compare
function cleanCr(raw, sys) {
    if (!isObj(raw) || !sys || !Array.isArray(sys.links)) return null;
    var out = null;
    sys.links.forEach(function(k) {
        var l = isObj(k) && k.kind === 'crew' && k.press === true && hasOwn(raw, k.id) && Array.isArray(raw[k.id]) ? raw[k.id] : null; if (!l) return;
        var o = []; l.slice(0, CREW_ROLLS).forEach(function(e) {
            if (!isObj(e) || typeof e.expr !== 'string' || !e.expr || e.expr.length > LIMITS.formula) return;
            var label = str(e.label, LIMITS.label).replace(CTRL_RE_G, ' ').trim() || 'Roll', a = typeof e.act === 'string' && /^r_[A-Za-z0-9_]{1,24}$/.test(e.act) ? e.act : '';
            if (a) { o.push({ act: a, expr: e.expr, label: label }); return; }
            if (typeof e.f === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(e.f) && typeof e.r === 'string' && /^w_[A-Za-z0-9_]{1,24}$/.test(e.r) && typeof e.i === 'number' && e.i >= 0 && e.i < LIMITS.rowRolls && Math.floor(e.i) === e.i) o.push({ f: e.f, r: e.r, i: e.i, expr: e.expr, label: label });
        });
        if (o.length) (out = out || {})[k.id] = o;
    });
    return out;
}
// The press made by a crew sheet: Presser.<name> reads that sheet alone, by the link's group, with the link's own figures, as <group>.sum.<name> reads it
function withPresser(tctx, link, id) { return Object.assign({}, isObj(tctx) ? tctx : {}, { press: { link: link, id: id } }); }
// The figures a vehicle's own copy carries for its crew, worked out by the host with the players' view through the crew source: { <link id>:
// { v: { <name as the system writes it, lower case>: number } } } or null; a player's resolver reads these in place of the crew
function crewFigs(sys, char, F) {
    var ks = sys && Array.isArray(sys.links) ? sys.links.filter(function(k) { return groupLink(k) && typeof k.group === 'string' && k.group; }) : [];
    if (!ks.length || !isObj(char) || typeof char.id !== 'string' || !F || !_crewSrc) return null;
    var ixC = keyIndex(sys), plain = Object.assign({}, char), out = null; delete plain.ck;
    var r = makeResolver(sys, plain, F);
    ks.forEach(function(k) { if (ixC[lower(k.group)]) return; var v = {}; linkNamesIn(sys, k.group).forEach(function(w) { var x; try { x = r(k.group + '.' + w); } catch (e) { x = undefined; } if (typeof x === 'number' && fin(x)) v[w] = x; }); (out = out || {})[k.id] = { v: v }; });
    return out;
}
function cleanCk(raw, sys) {
    if (!isObj(raw) || !sys || !Array.isArray(sys.links)) return null;
    var out = null;
    sys.links.forEach(function(k) {
        var e = groupLink(k) && typeof k.group === 'string' && hasOwn(raw, k.id) ? raw[k.id] : null; if (!isObj(e)) return;
        var v = {}, n = 0, src = isObj(e.v) ? e.v : {};   // a plain object, named only by names no prototype holds
        Object.keys(src).forEach(function(w) { if (n >= LIMITS.linkNames || !LINK_NAME.test(w) || w in Object.prototype) return; var x = src[w]; if (typeof x === 'number' && fin(x)) { v[w] = x; n++; } });
        (out = out || {})[k.id] = { v: v };
    });
    return out;
}
// A name read through a link (Mount.Move) judged as the name it reads on the linked sheet (Move), as On.<name> is: the GM-only judges and the
// players' view's mention check. Any other name as it is
function linkBare(sys, ix, name) {
    var hb = /^(owner|holder)\.(.+)$/i.exec(String(name)); if (hb && sheetsAny(sys) && !(ix || keyIndex(sys))[lower(hb[1])] && !linkByKey(sys)[lower(hb[1])] && !groupByKey(sys)[lower(hb[1])]) return hb[2];   // 1.6.2: Owner.X and Holder.X as X
    if (/^row\.sheet\./i.test(String(name)) && String(name).length > 10 && sheetsAny(sys)) return String(name).slice(10);   // 1.6.2 (vehicles, fold (a)): a row's sheet's name as the name it reads there
    var s = String(name), d = s.indexOf('.'); if (d <= 0 || !sys || !Array.isArray(sys.links) || !sys.links.length) return s;
    var k = lower(s.slice(0, d)), gkB = groupByKey(sys)[k]; if (gkB && !(ix || keyIndex(sys))[k]) return crewBare(gkB, s.slice(d + 1)) || s;   // 1.6.0 (CORE gap 16): Crew.max.Piloting as Piloting
    if (k === 'presser' && !(ix || keyIndex(sys))[k] && !linkByKey(sys)[k]) return s.slice(d + 1);   // 1.6.0: and Presser.Piloting
    if (!linkByKey(sys)[k]) return s;
    if ((ix || keyIndex(sys))[k]) return s;   // a field of the system's own keyed so keeps its name
    if (crewStation(linkByKey(sys)[k], lower(s.slice(d + 1)), ix || keyIndex(sys))) return s;   // 1.6.0: <Key>.station.<Station> reads this very sheet's own station, no figure of the linked sheet
    return s.slice(d + 1);
}
// 1.6.2 (the owner, 2026-11-08: "Add reading names for the row and its owner regardless, as a general builder option"): a sheet a row is
// joined to (Rows are sheets) reads the row that holds it as Holder.<stat> and the character that holds that row as Owner.<name>, one level
// deep, as a link reads its sheet. The source: fn(id, sys) answers { c: the character holding the row, f: its list, row: its id } (sheets.js),
// that character then read through the link source as it is to be read with that system. A player's copy reads the figures its host worked
// out (char.hk). None: both read 0. A field, a link or a crew group keyed Owner or Holder keeps its own name
function holdNamesIn(sys) { return { owner: linkNamesIn(sys, 'Owner'), holder: linkNamesIn(sys, 'Holder') }; }
function holdFigs(sys, char, F) {
    if (!sheetsAny(sys) || !isObj(char) || !F || !_holdSrc || !_linkSrc) return null;
    var h = null; try { h = _holdSrc(char.id, sys); } catch (e) { h = null; } if (!isObj(h) || typeof h.id !== 'string' || h.id === char.id) return null;
    var o = null; try { o = _linkSrc(h.id, sys); } catch (e) { o = null; } if (!isObj(o) || o.id !== h.id) return null;
    var rr = makeResolver(sys, o, F, { linkDepth: 1 }), rw = typeof rr.row === 'function' ? rr.row(h.f, h.row) : null, nm = holdNamesIn(sys), out = { of: o.id, owner: {}, holder: {} };   // plain objects: they travel
    var keep = function(bag, w, x) { if (typeof x === 'number' && fin(x)) bag[w] = x; else if (typeof x === 'boolean') bag[w] = x; };
    nm.owner.forEach(function(w) { var x; try { x = rr(w); } catch (e) { x = undefined; } keep(out.owner, w, x); });
    nm.holder.forEach(function(w) { var x; try { x = rw ? rw('row.' + w) : undefined; } catch (e) { x = undefined; } keep(out.holder, w, x); });
    return out;
}
function cleanHk(raw, sys) {
    if (!isObj(raw) || !sheetsAny(sys) || typeof raw.of !== 'string' || !CHAR_ID.test(raw.of)) return null;
    var bag = function(src) { var v = {}, n = 0; src = isObj(src) ? src : {}; Object.keys(src).forEach(function(w) { if (n >= LIMITS.linkNames || !LINK_NAME.test(w) || w === 'has' || w in Object.prototype) return; var x = src[w]; if (typeof x === 'number' && fin(x)) { v[w] = x; n++; } else if (typeof x === 'boolean') { v[w] = x; n++; } }); return v; };
    return { of: raw.of, owner: bag(raw.owner), holder: bag(raw.holder) };
}
function cleanCharLinks(raw, sys, selfId) {
    if (!isObj(raw) || !sys || !Array.isArray(sys.links)) return null;
    var out = {}, n = 0;
    sys.links.forEach(function(k) { if (!isObj(k) || !hasOwn(raw, k.id)) return; var v = raw[k.id]; if (typeof v === 'string' && CHAR_ID.test(v) && v !== selfId) { out[k.id] = v; n++; } });
    return n ? out : null;
}
// The names under one link that a system's formulas, captions and labels write (Mount.Move -> move), each once, lower case, the first
// LIMITS.linkNames; never has (worked out on each machine)
function linkNamesIn(sys, key) {
    var s = ''; try { s = JSON.stringify(sys) || ''; } catch (e) { s = ''; }
    var esc = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), re = new RegExp('(^|[^A-Za-z0-9_.])' + esc + '\\.([A-Za-z_][A-Za-z0-9_]*(?:\\.[A-Za-z_][A-Za-z0-9_]*){0,6})', 'gi'), m, out = [], seen = map();
    var lkCrew = linkByKey(sys)[lower(key)], crewK = !!(lkCrew && lkCrew.kind === 'crew');   // 1.6.0: a crew sheet's own stations are no figure of its vehicle
    var ixN = crewK && sys && Array.isArray(sys.fields) ? keyIndex(sys) : null;   // a field keyed Station that reads the third part itself keeps it a figure of the vehicle
    while ((m = re.exec(s)) && out.length < LIMITS.linkNames) { var w = lower(m[2]); if (w === 'has' || (crewK && (w === 'stations' || crewStation(lkCrew, w, ixN))) || seen[w] || w in Object.prototype) continue; seen[w] = 1; out.push(w); }
    return out;
}
// "Only the figures read": the figures a character's own copy carries for each link it holds, worked out by the host with the players' view
// through the source (the linked sheet as its owner holds it), so a GM-only value never travels: { <link id>: { id, name, v: { <name>: value } } }
// or null. A player's resolver reads these in place of the linked sheet
function linkFigs(sys, char, F) {
    var ks = sys && Array.isArray(sys.links) ? sys.links : null; if (!ks || !ks.length || !isObj(char) || !isObj(char.links) || !F || !_linkSrc) return null;
    var out = null, ixL = keyIndex(sys);
    ks.forEach(function(k) {
        var id = isObj(k) && hasOwn(char.links, k.id) ? char.links[k.id] : ''; if (typeof id !== 'string' || !CHAR_ID.test(id) || id === char.id || ixL[lower(k.key)]) return;
        var o = null; try { o = _linkSrc(id, sys); } catch (e) { o = null; } if (!isObj(o) || o.id !== id) return;
        var r = makeResolver(sys, o, F, { linkDepth: 1 }), v = {};   // a plain object: it travels (the wire's packer reads a prototype)
        linkNamesIn(sys, k.key).forEach(function(w) { var x; try { x = r(w); } catch (e) { x = undefined; } if (typeof x === 'number' && fin(x)) v[w] = x; else if (typeof x === 'boolean') v[w] = x; else if (typeof x === 'string') v[w] = x.slice(0, 120).replace(CTRL_RE_G, ' '); });
        (out = out || {})[k.id] = { id: id, name: str(o.name, LIMITS.charName).replace(CTRL_RE_G, ' ').trim() || 'Character', v: v };
    });
    return out;
}
var LINK_NAME = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*){0,6}$/;   // 1.6.0: seven parts, so a table read by a name reaches a player's copy (a crew group's max too)
function cleanLk(raw, sys) {
    if (!isObj(raw) || !sys || !Array.isArray(sys.links)) return null;
    var out = null;
    sys.links.forEach(function(k) {
        var e = isObj(k) && hasOwn(raw, k.id) ? raw[k.id] : null; if (!isObj(e) || typeof e.id !== 'string' || !CHAR_ID.test(e.id)) return;
        var v = {}, n = 0, src = isObj(e.v) ? e.v : {};   // a plain object, named only by names no prototype holds
        Object.keys(src).forEach(function(w) { if (n >= LIMITS.linkNames || !LINK_NAME.test(w) || w === 'has' || w in Object.prototype) return; var x = src[w]; if (typeof x === 'number' && fin(x)) { v[w] = x; n++; } else if (typeof x === 'boolean') { v[w] = x; n++; } else if (typeof x === 'string') { v[w] = x.slice(0, 120).replace(CTRL_RE_G, ' '); n++; } });
        (out = out || {})[k.id] = { id: e.id, name: str(e.name, LIMITS.charName).replace(CTRL_RE_G, ' ').trim() || 'Character', v: v };
    });
    return out;
}
// The one judge of a link set on a character, the GM's own and a player's on the host: { ok, links } (links null: none left) or
// { ok: false, reason, msg }. A player sets a link its Who edits gives them, or any while their character is open to them, and links only a
// character of their own. A Mount has one rider: a mount another character already rides is refused. A Crew link has no such rule
function linkSet(sys, chars, c, linkId, toId, opts) {
    opts = opts || {};
    var k = null; (sys && Array.isArray(sys.links) ? sys.links : []).forEach(function(x) { if (!k && isObj(x) && x.id === linkId) k = x; });
    if (!k || !isObj(c)) return { ok: false, reason: 'field', msg: 'That link is not in this system.' };
    if (opts.player && k.edit !== 'owner' && !openChar(c)) return { ok: false, reason: 'field', msg: 'Only the GM sets ' + k.label + ' here.' };
    var cur = isObj(c.links) ? c.links : {}, next = {}, n = 0;
    Object.keys(cur).forEach(function(id) { if (id !== linkId && LINK_ID.test(id) && typeof cur[id] === 'string') { next[id] = cur[id]; n++; } });
    var stC = isObj(c.stn) ? c.stn : {}, stN = {}, stOut = function(o) { var sn = Object.keys(stN).length ? stN : null; if (sn || isObj(c.stn)) o.stn = sn; return o; };   // 1.6.0 (CORE gap 16): its stations, this link's judged below (opts.stn: a station, '' none; none given: kept); answered where it has or had one
    Object.keys(stC).forEach(function(id) { if (id !== linkId && LINK_ID.test(id) && typeof stC[id] === 'string' && typeof next[id] === 'string') stN[id] = stC[id]; });
    if (toId === '' || toId === null) return stOut({ ok: true, links: n ? next : null });
    if (typeof toId !== 'string' || !CHAR_ID.test(toId)) return { ok: false, reason: 'value', msg: 'That is not a character.' };
    if (toId === c.id) return { ok: false, reason: 'value', msg: 'A sheet cannot link to itself.' };
    var t = isObj(chars) && hasOwn(chars, toId) ? chars[toId] : null; if (!isObj(t)) return { ok: false, reason: 'missing', msg: 'That character is not here now.' };
    if (opts.player && (t.npc || !t.ownerId || t.ownerId !== opts.pid || t.partial === true)) return { ok: false, reason: 'owner', msg: 'You can link only a character of your own.' };
    if (k.kind === 'mount') {
        var by = null; Object.keys(chars).forEach(function(id) { var x = chars[id]; if (!by && id !== c.id && isObj(x) && isObj(x.links) && x.links[linkId] === toId) by = x; });
        if (by) return { ok: false, reason: 'error', msg: (t.name || 'That mount') + ' already has a rider' + (opts.player ? '.' : ': ' + (by.name || 'another character') + '. Take that link off first.') };
    }
    next[linkId] = toId;
    if (opts.stn !== undefined) {   // a station, '' none, or a list of them, each judged, at most the link's most
        var stA = Array.isArray(opts.stn) ? opts.stn.slice(0, STATION_MOST + 1) : typeof opts.stn === 'string' && opts.stn ? [opts.stn] : [], stG = [];
        for (var si = 0; si < stA.length; si++) { var s1 = typeof stA[si] === 'string' ? stationOf(k, stA[si]) : ''; if (!s1) return { ok: false, reason: 'value', msg: 'That station is not on ' + k.label + '.' }; if (stG.indexOf(s1) < 0) stG.push(s1); }
        var stMost = typeof k.most === 'number' ? k.most : 1; if (stG.length > stMost) return { ok: false, reason: 'value', msg: stMost === 1 ? 'One station at a time on ' + k.label + '.' : 'At most ' + stMost + ' stations at a time on ' + k.label + '.' };
        if (stG.length) stN[linkId] = stG.length === 1 ? stG[0] : stG;
    } else { var stK = stationsIn(k, stC[linkId]); if (stK.length) stN[linkId] = stK.length === 1 ? stK[0] : stK; }
    var fitW = ''; stationsIn(k, stN[linkId]).forEach(function(s) { if (!fitW) fitW = stationFit(sys, k, s, c, opts.F); });   // 1.6.2 (218): who may sit there
    if (fitW) { if (opts.player) return { ok: false, reason: 'value', msg: fitW }; }
    var full = seatsFull(k, chars, c.id, linkId, toId, stationsIn(k, stN[linkId]));   // 1.6.2 (205): a station's seats
    if (full) { var seW = full.station + ' on ' + (t.name || 'that sheet') + ' seats ' + full.seats + (full.seats === 1 ? ' and has someone there.' : ' and they are taken.'); if (opts.player) return { ok: false, reason: 'value', msg: seW }; return stOut(fitW ? { ok: true, links: next, seatSays: seW, fitSays: fitW } : { ok: true, links: next, seatSays: seW }); }
    return stOut(fitW ? { ok: true, links: next, fitSays: fitW } : { ok: true, links: next });
}
// [split:body-end]
return { LINK_FIGS: LINK_FIGS, LINK_ID: LINK_ID, LINK_KINDS: LINK_KINDS, LINK_NAME: LINK_NAME, LINK_NOT: LINK_NOT, LINK_STATIONS: LINK_STATIONS, STATION_KEY: STATION_KEY, STATION_MOST: STATION_MOST, cleanCharLinks: cleanCharLinks, cleanCharStn: cleanCharStn, cleanCk: cleanCk, cleanCr: cleanCr, cleanHk: cleanHk, cleanLinks: cleanLinks, cleanLk: cleanLk, crewFigs: crewFigs, crewParts: crewParts, crewPressOf: crewPressOf, crewRollsOf: crewRollsOf, crewStation: crewStation, figExpand: figExpand, figRead: figRead, figVeh: figVeh, groupByKey: groupByKey, groupLink: groupLink, holdFigs: holdFigs, holdNamesIn: holdNamesIn, linkBare: linkBare, linkByKey: linkByKey, linkFig: linkFig, linkFigs: linkFigs, linkNamesIn: linkNamesIn, linkSet: linkSet, rollStationOk: rollStationOk, rollStations: rollStations, stationOf: stationOf, stationsIn: stationsIn, withPresser: withPresser };   // [split:glue]
}   // [split:glue]
