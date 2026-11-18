/* netlink.js: a part of net.js (docs/REFACTOR_SPLIT_PLAN.md, area 3, linked sheets; split 2026-11-18 with no change in behavior).
   What it holds: what the host tells a player of the sheets their own sheets are linked to. An owner's whole copy with the figures
   of the sheets it links (withLinkFigs: lk, ck, hk and sk, worked out through the players' view), the rolls a crew may press on a
   vehicle (crewRollsFor), and the word sent again when a linked sheet, a held row or a joined sheet moves (heldSheetTell, sheetTell,
   linkTell). The host's char-link branch, which sets a link, and the crew who act in a vehicle's turn (crewturn) stay in net.js.
   Why it looks this way: these lines stood in net.js, and they still run exactly where they stood. net.js calls netLink() at its line
   `// [split:netlink.js]`, so the body below runs in the old order, after everything above that line and before everything below it.
   The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads net.js (through
   tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of net.js (live, so a
   value net.js changes later is read as it is then); the last line hands back the names net.js uses of it. Neither side may assign
   the other's names (tools/splitcheck.js holds it). Change the code here as if it still stood in net.js. Like net.js, this file is
   kept byte for byte by git (.gitattributes), with its CRLF line endings. */
// [split:of net.js]
import { SC, charViewFor, fxLib, getActiveCampaign, handsTo, itemLib, net, own, peerProfileId, sendFailed } from './net.js';   // [split:glue]
export function netLink() {   // [split:glue]
// [split:body-start]
// [netcheck:linktell-start]
// 1.6.0 linked sheets: an owner's whole copy (never a teammate's) with the figures of the sheets it links, worked out through view (systemcore linkFigs)
function withLinkFigs(v, view) { var S = SC(); if (!v || v.partial || !S || !window.wpFormula) return v; if (v.links && S.linkFigs) { var lk = S.linkFigs(view, v, window.wpFormula); if (lk) v.lk = lk; } if (S.crewFigs) { var ck = S.crewFigs(view, v, window.wpFormula); if (ck) v.ck = ck; } if (S.holdFigs) { var hk = S.holdFigs(view, v, window.wpFormula); if (hk) v.hk = hk; } if (S.sheetFigs) { var sk = S.sheetFigs(view, v, window.wpFormula); if (sk) v.sk = sk; } if (typeof crewRollsFor === 'function') { var cr = crewRollsFor(v, view); if (cr) v.cr = cr; } return v; }   // 1.6.0 (CORE gap 16): and a vehicle's crew figures
// 1.6.0 linked sheets ("Only the figures read"): a character's change reaches the figures of every sheet that links it. That sheet's owner gets
// their copy again, whole, where the figures it carries moved since the host last sent them
// 1.6.0 Its crew may press this sheet's rolls: what the crew member this copy is for may press, by link, each vehicle read through the players' view
function crewRollsFor(v, view) {
    if (!v.links || !view || !Array.isArray(view.links) || !view.links.some(function(k) { return k && k.press === true; })) return null;
    var S = SC(), camp = getActiveCampaign(), F = window.wpFormula, out = null; if (!S || !S.crewRollsOf || !camp || !camp.chars) return null;
    view.links.forEach(function(k) {
        if (!k || k.kind !== 'crew' || k.press !== true || typeof v.links[k.id] !== 'string') return;
        var veh = own(camp.chars, v.links[k.id]) ? camp.chars[v.links[k.id]] : null; if (!veh || veh.making === 1) return;
        var copy = S.charForView(veh, view, { lib: fxLib(camp.system), items: itemLib(camp.system), full: camp.system }), l = copy ? S.crewRollsOf(view, copy, v.stn ? S.stationsIn(k, v.stn[k.id]) : [], F, k.pressNamed === true) : [];
        if (l.length) (out = out || {})[k.id] = l;
    });
    return out;
}
var _lkSent = Object.create(null), _ckSent = Object.create(null);   // 1.6.0 (CORE gap 16): the crew figures last sent, by peer and vehicle
// 1.6.2 (vehicles, fold (a)): a row's owner gets their copy again where the figures of the sheet the row is joined to moved (sheetFigs), once a change
var _skSent = Object.create(null), _hkSent = Object.create(null);
// 1.6.2: a joined sheet's owner gets their copy again where the figures of the row that holds it, or of that row's owner, moved (holdFigs)
function heldSheetTell(id) {
    var S = SC(), camp = getActiveCampaign(); if (!S || typeof S.sheetRows !== 'function' || !camp || !camp.system || !camp.chars) return 0;
    var n = 0; S.sheetRows(camp.system, camp.chars).forEach(function(h) {
        if (h.c.id !== id) return; var t = own(camp.chars, h.r.sh) ? camp.chars[h.r.sh] : null; if (!t || t.npc || !t.ownerId) return;
        net.conns.forEach(function(c) {
            if (!c.open || !net.roster[c.peer] || !(typeof handsTo === 'function' ? handsTo(t, peerProfileId(c)) : peerProfileId(c) === t.ownerId)) return;
            var v = charViewFor(t.id, peerProfileId(c)); if (!v || v.partial) return;
            var sig = JSON.stringify(v.hk || null), key = c.peer + '|' + t.id; if (_hkSent[key] === sig) return; _hkSent[key] = sig;
            try { c.send({ type: 'char', campId: camp.id, char: v }); n++; } catch (e) { sendFailed(e); }
        });
    });
    if (n && window.wpStepLog) window.wpStepLog('rowsheet v1', 'held told', { copies: n });
    return n;
}
function sheetTell(id) {
    var S = SC(), camp = getActiveCampaign(); if (!S || typeof S.sheetRows !== 'function' || !camp || !camp.system || !camp.chars) return 0;
    var hold = Object.create(null), n = 0; S.sheetRows(camp.system, camp.chars).forEach(function(h) { if (h.r.sh === id) hold[h.c.id] = 1; });
    Object.keys(hold).forEach(function(rid) {
        var r = own(camp.chars, rid) ? camp.chars[rid] : null; if (!r || r.npc || !r.ownerId) return;
        net.conns.forEach(function(c) {
            if (!c.open || !net.roster[c.peer] || !(typeof handsTo === 'function' ? handsTo(r, peerProfileId(c)) : peerProfileId(c) === r.ownerId)) return;
            var v = charViewFor(rid, peerProfileId(c)); if (!v || v.partial) return;
            var sig = JSON.stringify(v.sk || null), key = c.peer + '|' + rid; if (_skSent[key] === sig) return; _skSent[key] = sig;
            try { c.send({ type: 'char', campId: camp.id, char: v }); n++; } catch (e) { sendFailed(e); }
        });
    });
    if (n && window.wpStepLog) window.wpStepLog('rowsheet v1', 'told', { copies: n });
    return n;
}
function linkTell(id) {
    if (!net.active || net.role !== 'host') return;
    if (typeof sheetTell === 'function') sheetTell(id);   // 1.6.2 (vehicles, fold (a)): the rows joined to it
    if (typeof heldSheetTell === 'function') heldSheetTell(id);   // 1.6.2: and the sheets its own rows are joined to
    var camp = getActiveCampaign(); if (!camp || !camp.chars || !camp.system || !Array.isArray(camp.system.links) || !camp.system.links.length) return;
    var n = 0;
    Object.keys(camp.chars).forEach(function(rid) {
        var r = camp.chars[rid]; if (!r || rid === id || !r.links || typeof r.links !== 'object' || r.npc || !r.ownerId) return;
        if (!Object.keys(r.links).some(function(k) { return r.links[k] === id; })) return;
        net.conns.forEach(function(c) {
            if (!c.open || !net.roster[c.peer] || !(typeof handsTo === 'function' ? handsTo(r, peerProfileId(c)) : peerProfileId(c) === r.ownerId)) return;
            var v = charViewFor(rid, peerProfileId(c)); if (!v || v.partial) return;
            var sig = JSON.stringify(v.cr ? [v.lk || null, v.cr] : v.lk || null), key = c.peer + '|' + rid; if (_lkSent[key] === sig) return; _lkSent[key] = sig;
            try { c.send({ type: 'char', campId: camp.id, char: v }); n++; } catch (e) { sendFailed(e); }
        });
    });
    var grpK = Object.create(null); camp.system.links.forEach(function(k) { if (k && (k.kind === 'crew' || k.kind === 'mount') && k.group) grpK[k.id] = 1; });   // a mount that reads its riders too (1.6.0)
    if (Object.keys(grpK).length) {   // 1.6.0 (CORE gap 16): a vehicle that reads its crew gets its copy again where its crew figures moved (one crewed now, or sent figures before)
        var vsK = Object.create(null); Object.keys(camp.chars).forEach(function(cid) { var x = camp.chars[cid]; if (x && x.links && typeof x.links === 'object') Object.keys(x.links).forEach(function(l) { if (grpK[l] === 1 && typeof x.links[l] === 'string') vsK[x.links[l]] = 1; }); });
        Object.keys(_ckSent).forEach(function(key) { var vid0 = key.split('|')[1]; if (vid0) vsK[vid0] = 1; });
        Object.keys(vsK).forEach(function(vid) {
            var vr = own(camp.chars, vid) ? camp.chars[vid] : null; if (!vr || vr.npc || !vr.ownerId) return;
            net.conns.forEach(function(c) {
                if (!c.open || !net.roster[c.peer] || !(typeof handsTo === 'function' ? handsTo(vr, peerProfileId(c)) : peerProfileId(c) === vr.ownerId)) return;
                var v = charViewFor(vid, peerProfileId(c)); if (!v || v.partial) return;
                var sig = JSON.stringify(v.ck || null), key = c.peer + '|' + vid; if (_ckSent[key] === sig) return; _ckSent[key] = sig;
                try { c.send({ type: 'char', campId: camp.id, char: v }); n++; } catch (e) { sendFailed(e); }
            });
        });
    }
    if (n && window.wpStepLog) window.wpStepLog('links v1', 'told', { copies: n });
}
// [netcheck:linktell-end]
// [split:body-end]
return { linkTell: linkTell, withLinkFigs: withLinkFigs };   // [split:glue]
}   // [split:glue]
