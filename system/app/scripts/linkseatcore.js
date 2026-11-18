/* linkseatcore.js: a part of systemcore.js (docs/REFACTOR_SPLIT_PLAN.md, area 3, linked sheets; split 2026-11-18 with no change in behavior).
   What it holds: who may sit where on a Crew link and what goes with a character. Whether a sheet is one a Crew link crews (crewHost);
   whether a sheet may sit at a station (stationFit) and whether a station's seats are taken (seatsFull); the sheets a character is
   linked from (linkedFrom); and every link to a character that is deleted (linksDrop). The rest of linked sheets is in linkcore.js;
   the sheet categories and the (i) explain record stand between the two in systemcore.js, as they always did.
   Why it looks this way: these lines stood in systemcore.js, and they still run exactly where they stood. systemcore.js calls
   linkSeatCore() at its line `// [split:linkseatcore.js]`, so the body below runs in the old order. The body keeps its lines at the
   left margin inside the install function, unchanged, so that every test that reads systemcore.js (through tools/srcjoin.js, which puts
   these lines back) sees the old file. The first lines import what the body uses of systemcore.js; the last line hands back the names
   systemcore.js uses of it. Neither side may assign the other's names (tools/splitcheck.js holds it). Change the code here as if it
   still stood in systemcore.js. */
// [split:of systemcore.js]
import { isObj, makeResolver, noDice, stationsIn } from './systemcore.js';   // [split:glue]
export function linkSeatCore() {   // [split:glue]
// [split:body-start]
// 1.6.2 (218): whether a sheet is one a Crew link crews (its Crewed sheets are where, read on that sheet); with none set, no sheet is
function crewHost(sys, k, char, F) {
    if (!isObj(k) || k.kind !== 'crew' || typeof k.veh !== 'string' || !k.veh || !isObj(char) || !F || typeof F.evaluate !== 'function') return false;
    var r = null; try { r = F.evaluate(k.veh, { vars: makeResolver(sys, char, F), random: noDice }); } catch (e) { r = null; }
    return !!(r && r.ok && (r.value === true || (typeof r.value === 'number' && r.value !== 0)));
}
// 1.6.2 (218; the owner, by prompt: "A rule, with Show all"): whether a sheet may sit at a station of a Crew link: '' where it may, else the
// system's own words for why not (or plain words naming the station). The filter is read on that sheet; one that cannot be worked out does not hold
function stationFit(sys, k, station, char, F) {
    var fo = isObj(k) && isObj(k.fit) ? k.fit[station] : null; if (!fo || typeof fo['if'] !== 'string') return '';
    var no = fo.says || ((char && char.name ? char.name : 'This sheet') + ' does not fit ' + station + '.');
    if (!F || typeof F.evaluate !== 'function' || !isObj(char)) return no;
    var r = null; try { r = F.evaluate(fo['if'], { vars: makeResolver(sys, char, F), random: noDice }); } catch (e) { r = null; }
    return r && r.ok && (r.value === true || (typeof r.value === 'number' && r.value !== 0)) ? '' : no;
}
// 1.6.2 (205; the owner, by prompt: "Player refused, GM told"): the first station of these whose seats the other sheets linked to that very
// sheet already fill, { station, seats }, or null. A sheet already there is never counted against itself
function seatsFull(k, chars, selfId, linkId, toId, stations) {
    if (!isObj(k) || !isObj(k.seats) || !isObj(chars) || !Array.isArray(stations) || !stations.length) return null;
    var hit = null;
    stations.forEach(function(s) {
        if (hit || typeof k.seats[s] !== 'number') return; var n = 0;
        Object.keys(chars).forEach(function(cid) { var x = chars[cid]; if (cid === selfId || !isObj(x) || x.partial === true || !isObj(x.links) || x.links[linkId] !== toId) return; if (stationsIn(k, isObj(x.stn) ? x.stn[linkId] : null).indexOf(s) >= 0) n++; });
        if (n >= k.seats[s]) hit = { station: s, seats: k.seats[s] };
    });
    return hit;
}
// Who links to a character, for its sheet: [{ link, by: [{ id, name }] }] in the system's order (a Mount's rider, a vehicle's crew)
function linkedFrom(sys, chars, id) {
    var out = []; if (!isObj(chars) || typeof id !== 'string') return out;
    (sys && Array.isArray(sys.links) ? sys.links : []).forEach(function(k) { if (!isObj(k)) return; var by = []; Object.keys(chars).forEach(function(cid) { var x = chars[cid]; if (cid !== id && isObj(x) && x.partial !== true && isObj(x.links) && x.links[k.id] === id) { var bo = { id: cid, name: x.name || 'Character' }; if (isObj(x.stn) && typeof x.stn[k.id] === 'string') bo.stn = x.stn[k.id]; by.push(bo); } }); if (by.length) out.push({ link: k, by: by }); });
    return out;
}
// A character gone: every link to it goes. The ids of the characters whose links changed
function linksDrop(chars, id) {
    var out = []; if (!isObj(chars) || typeof id !== 'string') return out;
    Object.keys(chars).forEach(function(cid) { var x = chars[cid]; if (!isObj(x) || !isObj(x.links)) return; var hit = false; Object.keys(x.links).forEach(function(l) { if (x.links[l] === id) { delete x.links[l]; if (isObj(x.stn)) { delete x.stn[l]; if (!Object.keys(x.stn).length) delete x.stn; } hit = true; } }); if (hit) { if (!Object.keys(x.links).length) delete x.links; out.push(cid); } });
    return out;
}
// [split:body-end]
return { crewHost: crewHost, linkedFrom: linkedFrom, linksDrop: linksDrop, seatsFull: seatsFull, stationFit: stationFit };   // [split:glue]
}   // [split:glue]
