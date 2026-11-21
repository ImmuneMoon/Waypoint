/* netfog.js: a part of net.js (docs/REFACTOR_SPLIT_PLAN.md, area 9, fog and fights on the host; split 2026-11-19 with no change in behavior).
   What it holds: a map on the wire. On the host: what each player's copy of a fogged map leaves out (fogDrop, fogFilterClean,
   fogCopyFor, fogOwnSenses, fogPartyCopy, the senses' signature a copy was made by), which maps a connection holds whole and the stub
   it holds of the others (mapHeld, mapStub, mapGive, mapTake, mapLeft, net.syncMapStubs), the join snapshot's state (sanitizeAppState),
   an open drag judged where it began (fogLanded, fogDragSweep), what each connection's copy holds (fogSeed), the remembered ground sent
   to a player (memSendTo), the step-back numbers on every copy (withAck, ackSend), a drawing hidden from its player (hidNote,
   net.strokesBack), the catch-up of a player's copies in place when a move lands (fogArm, fogMoveFire, fogCatchUp, fogRoster), and
   where a player lands and is staged (landingFor, currentStage, applyStage). On a player's app and on both ends: the step-back record
   (actlog), a whole item and a player's map copy taken by the host (applyItem, applyClientItemFiltered with strokeActs and the patch
   gate, a drawing to show), the snapshot (snapItems, applySnapshot), broadcast() and sendFailed, the delta between two copies
   (itemDelta, applyItemDelta) and a player's catch-up (applyFogDiff). sendItem and the rest of a map's sends stay in net.js, below
   this part; the baseline they share (_lastSent) stands in net.js just above it.
   Why it looks this way: these lines stood in net.js, and they still run exactly where they stood. net.js calls netFog() at its line
   `// [split:netfog.js]`, so the body below runs in the old order, after everything above that line and before everything below it.
   The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads net.js (through
   tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of net.js (live, so a
   value net.js changes later is read as it is then); the last line hands back the names net.js uses of it. Neither side may assign
   the other's names (tools/splitcheck.js holds it): applySnapshot sets net.js's _sheetFilesOk through sheetFilesOkSet. Change the
   code here as if it still stood in net.js. Like net.js, this file is kept byte for byte by git (.gitattributes), with its CRLF line
   endings. */
// [split:of net.js]
import { SC, _barSent, _dragFrom, _faceRefused, _lastSent, _refusedAt, applyNotepad, boxForgetConn, broadcastRoster, camGiven, camHold, camLand, camMine, camOf, campOf, charSessionReset, cleanCombats, cleanElevation, cleanFightsIn, cleanHostMap, cleanHostWbItem, cleanPosture, cleanStance, cleanStanceCamps, cleanTargets, clockOut, combatForget, combatsFor, combatsSentForget, combatsTo, connMap, dateFigOut, decksFor, dragEnd, escAttr, escText, faceCount, faceDeg, faceJudge, faceRefusedText, faceRelay, fightsKeep, fightsKnow, fightsOn, fxLib, getActiveCampaign, heldSync, hitsKnow, hostTravel, itemLib, landingPoint, landsKnow, load, mapFogged, marksOwnMoved, moveCounted, moveRefused, net, noteHostChar, noteHostCopy, noteOwner, openDrag, openDrags, own, ownCellKeysOf, ownTokIdsOf, peerPaused, recLine, render, renderRoster, restLogOut, rowTextKnows, sanitizeItem, save, setPausedLocal, setSelfPausedLocal, setTravelLockLocal, sheetFilesOkSet, sheetOutsKnow, snapBack, stageConn, state, styleHostKnows, targetsFor, toast, tokBarsSoon, tradeLost, trkSendTo, ui, updateCampaignSelect, updateSidebarNav, validKey, validProfileId, webJoinOnly, wireWbItem, withHoverLines, withLinkFigs } from './net.js';   // [split:glue]
export function netFog() {   // [split:glue]
// [split:body-start]
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
// R2 #14 (the owner's ruling of 2026-10-01: the stream window "should be a combined view of the players, each of them being represented from a 3rd
// party perspective"): the stream window's copy of a fogged map of the hosted campaign is the PARTY VIEW, a spectator's standpoint — the creatures no
// player's own token sees are dropped (wpFog.fogDropIds with its PARTY owner: every token that is a player's, each read as its own player reads it,
// never an NPC's eyes), every player's token stays, and the cells the players' tokens see together ride on the copy as map.fogParty (fogPartyCells,
// each with its tier) for the window's fog to draw — the host's own judgment from its own campaign, never one player's own view and never the GM's
// whole map. Never on a copy made for a player (fogCopyFor) and never on the wire: the stream window reads its copy from this machine alone. With
// no fog module the copy fails closed: every creature that is no player's goes and nothing is said seen
function fogPartyCopy(clean, camp, map) {
    if (!clean || clean.type !== 'map' || !mapFogged(map)) return clean;
    var F = window.wpFog, cp, k;
    if (!F || typeof F.PARTY !== 'string' || typeof F.fogDropIds !== 'function' || typeof F.fogPartyCells !== 'function') {
        var d = Object.create(null), any = false;
        (clean.whiteboard || []).forEach(function(w) { if (w && w.type !== 'light' && (w.isChar || w.waiting) && !(typeof w.ownerId === 'string' && w.ownerId !== '')) { d[w.id] = 1; any = true; } });
        var shut = fogFilterClean(clean, any ? d : null); cp = {}; for (k in shut) cp[k] = shut[k]; cp.fogParty = { list: [] }; return cp;
    }
    var out = fogFilterClean(clean, F.fogDropIds(F.PARTY, camp, map)), cells = F.fogPartyCells(camp, map);
    if (cells === null) return out;
    cp = {}; for (k in out) cp[k] = out[k]; cp.fogParty = cells; return cp;
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
// [netcheck:mapheld-start]
// Per-player map possession (security, the owner's ruling of 2026-10-01: "build per-player possession now"): a player's app holds only the maps
// they have reached. The join snapshot carries a STUB for every hosted map the recipient is not on — its type, its id and the meta the Maps
// list and a portal's hover need (title, lock, nesting), nothing drawn, no rooms, no links; the whole map is given to a connection when its
// player arrives there (stageConn, hostTravel, the summons), before the word that they are on it; and a copy, a delta, a catch-up or a live
// position of a map goes only to the connections holding it whole. The host's memory only, per connection (its id may hold any character:
// prototype-free, never parsed): which maps were given whole; forgotten with the connection, with the map and at a new table. A player's app
// asking for a map it was never given gets nothing
var _mapHeld = Object.create(null);
function mapHeld(conn, mapId) { return !!(conn && typeof conn.peer === 'string' && typeof mapId === 'string' && own(_mapHeld, conn.peer) && _mapHeld[conn.peer][mapId] === 1); }
function mapHeldNote(conn, mapId) { if (!conn || typeof conn.peer !== 'string' || typeof mapId !== 'string') return; if (typeof tokBarsSoon === 'function') tokBarsSoon(); (own(_mapHeld, conn.peer) ? _mapHeld[conn.peer] : (_mapHeld[conn.peer] = Object.create(null)))[mapId] = 1; }
function mapHeldOf(conn) { return conn && typeof conn.peer === 'string' && own(_mapHeld, conn.peer) ? _mapHeld[conn.peer] : Object.create(null); }
function mapForgetConn(peer) { if (typeof peer === 'string') { delete _mapHeld[peer]; if (typeof _barSent === 'object' && _barSent) delete _barSent[peer]; } }
function mapForgetMap(mapId) { Object.keys(_mapHeld).forEach(function(p) { delete _mapHeld[p][mapId]; }); if (typeof mapId === 'string') delete _stubSaid[mapId]; }
function mapForgetAll() { _mapHeld = Object.create(null); _stubSaid = Object.create(null); }
// the stub a player holds for a map they have not reached: its name, its lock and its place in the Maps list; nothing of what is on it
function mapStub(map) {
    var meta = map && map.meta && typeof map.meta === 'object' ? map.meta : {}, out = { title: typeof meta.title === 'string' ? meta.title.slice(0, 200) : '' };
    if (meta.playerLock) out.playerLock = true;
    if (typeof meta.parentId === 'string') out.parentId = meta.parentId.slice(0, 160);
    if (typeof meta.sortIndex === 'number' && isFinite(meta.sortIndex)) out.sortIndex = meta.sortIndex;
    return { type: 'map', id: map.id, stub: true, meta: out, whiteboard: [], rooms: [], links: [], cats: {} };
}
// A stub afresh: a connection holding only a map's stub hears when what the stub says changes — its title, its lock, its place in the Maps list
// (nesting, sort order) — so their Maps list and a portal's hover on another map give the map's present name. The host keeps what each map's
// stub last said (_stubSaid, by map id: prototype-free, the host's memory only): read at every admission (the snapshot carries every stub as
// it stands) and compared at every save of the GM's — a map whose stub now says otherwise, or one made since, goes to the connections holding
// its stub AS its stub: nothing of what is on it. A connection holding the map whole hears the usual way, by its own copy (net.syncMapStubs).
var _stubSaid = Object.create(null);
function mapStubMsg(campId, itemId, it) { return { type: 'item', campId: campId, itemId: itemId, item: mapStub(it) }; }
function mapStubSend(msg) {   // to every admitted connection that holds this map's stub — not one holding it whole, not one arriving on it now (the whole map follows: mapGive)
    var n = 0; _stubSaid[msg.itemId] = JSON.stringify(msg.item.meta);
    net.conns.forEach(function(c) { if (!c.open || !own(net.roster, c.peer) || mapHeld(c, msg.itemId) || net.roster[c.peer].location === msg.itemId) return; try { c.send(msg); n++; } catch (e) { sendFailed(e); } });
    return n;
}
function mapStubSync(camp, tell) {   // tell false: read what every stub says now (an admission); true: also send each one that changed. Returns the ids that changed
    var changed = [];
    if (!camp || !camp.items || typeof camp.items !== 'object') return changed;
    Object.keys(camp.items).forEach(function(id) {
        var it = camp.items[id]; if (!it || typeof it !== 'object' || it.type !== 'map') return;
        var msg = mapStubMsg(camp.id, id, it), sig = JSON.stringify(msg.item.meta);
        if (_stubSaid[id] === sig) return;
        if (tell) { changed.push(id); mapStubSend(msg); } else _stubSaid[id] = sig;
    });
    Object.keys(_stubSaid).forEach(function(id) { if (!own(camp.items, id)) delete _stubSaid[id]; });   // a map that is gone
    return changed;
}
net.syncMapStubs = function() {   // (host) at every save of the GM's own: a rename, a re-nesting or a new place in the Maps list reaches the stubs
    if (!net.active || net.role !== 'host') return [];
    var camp = getActiveCampaign(); if (!camp) return [];
    if (!net.conns.some(function(c) { return c.open && own(net.roster, c.peer); })) { mapStubSync(camp, false); return []; }   // nobody at the table: nothing to tell — what the stubs say is read, as at an admission
    var changed = mapStubSync(camp, true);
    changed.forEach(function(id) { if (id !== camp.activeItemId && net.conns.some(function(c) { return c.open && mapHeld(c, id); })) net.sendItem(camp.id, id); });   // a connection holding it whole: its own copy, as any change to a map reaches it (the map on the GM's screen goes with the save itself; one nobody holds is not copied at all)
    return changed;
};
// a map given whole to one connection as its player arrives there: the table's other holders are brought up to date first (an unfogged map's
// shared delta baseline is then the very copy about to go, so their later deltas apply exactly), then the copy is recorded as held and sent;
// one held already is left to its deltas. at: the action of theirs this copy answers (14c)
function mapGive(conn, campId, mapId, at) {
    var camp = state.appState && state.appState.campaigns && own(state.appState.campaigns, campId) ? state.appState.campaigns[campId] : null, it = camp && own(camp.items, mapId) ? camp.items[mapId] : null;
    if (!conn || !conn.open || !it || it.type !== 'map' || !own(net.roster, conn.peer) || mapHeld(conn, mapId)) return false;
    if (!mapFogged(it)) net.sendItem(campId, mapId);
    mapHeldNote(conn, mapId);
    net.sendItem(campId, mapId, conn, null, at);
    return true;
}
// The take-back (the owner's ruling of 2026-10-01: a map is taken back when a player leaves it): a connection holds whole only the map its
// player is on. Once that map has been given and the stage word sent (stageConn, hostTravel — the only places besides the join that set a
// roster location, and the join's snapshot replaces the whole record), every other map the connection holds is forgotten for it: no later
// copy, delta, catch-up, put-back, needItem answer or live position of that map reaches the connection, and what the host knew of its copy
// goes too (fogForgetOne), so the map given again starts afresh. The connection is sent one word for it, 'mapBack', carrying the stub's meta
// alone (its name, its lock, its place in the Maps list) — nothing of what is on the map; the player's app puts the stub back in the map's
// place. Per connection: a player's other window still on the map keeps its own copy. Nothing is taken while the map they are on is not
// held whole (the stage named no map, the connection is closed), so a player's screen never loses the map it shows
function mapTake(conn, campId, mapId) {
    if (!mapHeld(conn, mapId)) return false;
    delete _mapHeld[conn.peer][mapId];
    if (typeof fogForgetOne === 'function') fogForgetOne(conn.peer, mapId);
    var camp = state.appState && state.appState.campaigns && own(state.appState.campaigns, campId) ? state.appState.campaigns[campId] : null, it = camp && own(camp.items, mapId) ? camp.items[mapId] : null;
    if (conn.open && it && it.type === 'map') { try { conn.send({ type: 'mapBack', campId: campId, itemId: mapId, meta: mapStub(it).meta }); } catch (e) { sendFailed(e); } }
    return true;
}
function mapLeft(conn, campId) {
    var pr = conn && typeof conn.peer === 'string' && own(net.roster, conn.peer) ? net.roster[conn.peer] : null, here = pr ? pr.location : null, n = 0;
    if (typeof here !== 'string' || !mapHeld(conn, here)) return 0;
    Object.keys(mapHeldOf(conn)).forEach(function(id) { if (id !== here && mapTake(conn, campId, id)) n++; });
    return n;
}
// [netcheck:mapheld-end]
function sanitizeAppState(s, recipientId, held) {   // recipientId: the player this copy is for (characters are per recipient); absent = the stream window's: the party view of every fogged map (fogPartyCopy), no characters; held: the maps this connection holds whole (mapHeldOf) — every other map of the hosted campaign goes as its stub; absent, every map whole (the stream window, an older caller)
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
        delete camp.pinnedPages; delete camp.groups; delete camp.panelOrder; delete camp.fogMem;   // 1.6.3 (finding 13): the players' explored ground, which the host keeps and sends each player their own of (memSendTo)   // 1.5.4 (pageshelf.js): the pages pinned for the session name planners, which never leave this machine; backlog 31: and the GM's encounter groups
        delete camp.buildPins;   // 1.6.2: the GM's own palette in Build
        delete camp.opensOn;   // 1.6.2 (backlog 221): which view the GM's maps open on, the GM's own (io.js opensOf)
        delete camp.fxSaved;   // 1.6.2 (backlog 81): the GM's saved effects (fxcore cleanSaved)
        if (camp.piles || Array.isArray(camp.decks) || (camp.system && Array.isArray(camp.system.decks))) camp.pileN = typeof decksFor === 'function' ? decksFor(camp) : {}; delete camp.piles; delete camp.spreads; if (Array.isArray(camp.decks)) { camp.decks = window.wpDeckCore ? window.wpDeckCore.cleanDecks(camp.decks, false, /^C[0-9]+$/) : []; if (!camp.decks.length) delete camp.decks; }   // 1.6.2 (G9): never the order of a pile
        if (camp.shared) { var shS = window.wpSystemCore && window.wpSystemCore.cleanShared ? window.wpSystemCore.cleanShared(camp.shared, camp.system, false) : null; if (shS) camp.shared = shS; else delete camp.shared; }   // 1.6.2 (G8): a GM-only value never leaves the host
        delete camp.fights;   // 1.6.0: a running fight as the host keeps it, numbers, rolls and all (fightsKeep)
        delete camp.sessionLog;
        delete camp.pictures; delete camp.imageCats;   // the picture library's per-campaign bookkeeping (1.5.0)
        delete camp.sounds;   // the sound index (1.5.0): the hosted campaign's playable list goes as its own message, validated on arrival
        delete camp.music;    // the music library (1.5.0): likewise travels only as the validated 'music' message, never raw in the snapshot
        delete camp.library;  // the item library's manifest (Stage 6 L1c): the GM's; a player holds only the copies the host puts on their rows
        delete camp.uploads;  // Stage 6 U2: the GM's queue of players' sheet uploads to review
        delete camp.videos;   // item 21: the video library is the GM's alone (a video reaches players as a live stream, never as a file or a list)
        delete camp.trackers; // backlog 29: the table trackers go to each player as the list they may see ('trackers', trkSendTo), never raw in the snapshot
        delete camp.trkHide;  // backlog 29: the players the GM keeps the trackers from are the GM's to know
        delete camp.soundOn;  // 1.6.2: the sounds the GM ties to actions (soundon.js) are the GM's alone: a player gets the cue and nothing of the list
        delete camp.boxes;   // 1.6.2 (backlog 42): what containers hold, the GM's until opened
        delete camp.furnPacks;   // 1.6.2 (backlog 222): the GM's furnishing packs; what a piece wears goes as its own picture
        delete camp.objects;  // 1.6.0: the GM's own map objects (objcore.js): the GM's to place, as the system's set is left out of the players' view
        if (window.wpDocRender && window.wpDocRender.cleanDocStyle) { var _cds = window.wpDocRender.cleanDocStyle(camp.docStyle); if (_cds) camp.docStyle = _cds; else delete camp.docStyle; }   // the campaign's document appearance travels (validated: fonts from the list, hex colors) so a player's Handbook matches; the client re-validates at render too
        var libFx = fxLib(camp.system), libIt = itemLib(camp.system), fullSys = camp.system;   // 5h / Stage 6: the full libraries (and F6: the full system), before the players' view replaces the system (a GM-only effect or item reaches its owner inline)
        if (camp.id === c.activeCampaignId && camp.system && window.wpSystemCore && window.wpFormula) {   // character sheets (1.5.0): the hosted campaign's system travels as the players' view, GM-only fields gone
            var psys = window.wpSystemCore.cleanSystem(camp.system, { F: window.wpFormula, gmView: false, pages: (window.wpSheets && window.wpSheets.readablePages) ? window.wpSheets.readablePages(camp) : [], libCats: window.wpLibrary && window.wpLibrary.catsFor ? window.wpLibrary.catsFor() : null, needShown: window.wpLibrary && window.wpLibrary.needShown ? window.wpLibrary.needShown : null, ruleShown: window.wpLibrary && window.wpLibrary.needRuleShown ? window.wpLibrary.needRuleShown : null }); if (psys) camp.system = psys; else delete camp.system;   // chips/links only to pages players may read (Stage 5f; fails closed)
        } else delete camp.system;
        if (camp.id === c.activeCampaignId && recipientId && camp.chars && camp.system && window.wpSystemCore) {   // characters (1.5.0): this recipient's own in full, other PCs' hover fields, NPCs never
            var outCh = {}; Object.keys(camp.chars).forEach(function(id) { var v = (typeof withLinkFigs === 'function' ? withLinkFigs : function(v0) { return v0; })(withHoverLines(window.wpSystemCore.charFor(camp.chars[id], camp.system, recipientId, { lib: libFx, items: libIt, full: fullSys }), camp.chars[id], camp.system, libFx, libIt, fullSys), camp.system); if (v) outCh[id] = v; }); camp.chars = outCh;   // 1.6.0: an owner's copy with the figures of the sheets it links
        } else delete camp.chars;
        // fog of war (1.5.0 FV2): the sight-field mapping + default travel for the hosted campaign, so a client resolves
        // its own sight the same way the host does (character sheets already travel per recipient above)
        if (camp.id === c.activeCampaignId && window.wpFogCore) camp.fog = window.wpFogCore.cleanCampFog(camp.fog);
        else delete camp.fog;
        var rlS = camp.id === c.activeCampaignId && typeof restLogOut === 'function' ? restLogOut(camp) : null; if (rlS && rlS.length) camp.restLog = rlS; else delete camp.restLog;   // 138 (j) fold R3: the records of rests players may see
        var ckS = camp.id === c.activeCampaignId && typeof clockOut === 'function' ? clockOut(camp) : null; if (ckS) { camp.clock = ckS; delete camp.dateFig; } else { delete camp.clock; var fgS = camp.id === c.activeCampaignId && typeof dateFigOut === 'function' ? dateFigOut(camp) : null; if (fgS) camp.dateFig = fgS; else delete camp.dateFig; }   // 1.6.0: the date's numbers alone where no clock goes   // item 20 K2: the hosted campaign's clock, its time alone, while players may see it
        Object.keys(camp.items).forEach(function(id) {
            var orig = camp.items[id];
            if (orig && orig.type === 'doc' && camp.id !== c.activeCampaignId) { delete camp.items[id]; return; }   // a session is one campaign: only the hosted campaign's pages travel
            if (orig && orig.type === 'map' && recipientId && held && typeof mapStub === 'function' && !(own(held, id) && held[id] === 1)) { camp.items[id] = mapStub(orig); return; }   // possession: a map this player has not reached travels as its stub (name, lock, nesting), nothing of what is on it
            var it = sanitizeItem(orig, recipientId);   // 1.6.3 (finding 18): a page's blocks kept back reach only the players they name, and none the stream window (no recipient)
            if (it === null) { delete camp.items[id]; return; }
            if (it.type === 'map' && recipientId && camp.id === c.activeCampaignId) it = fogCopyFor(it, (s.campaigns && s.campaigns[camp.id]) || camp, orig, recipientId);   // drop the creatures this player cannot see (judged on the host's own campaign, as every later send is), with their lit cells
            else if (it.type === 'map' && !recipientId && camp.id === c.activeCampaignId) it = fogPartyCopy(it, (s.campaigns && s.campaigns[camp.id]) || camp, orig);   // R2 #14: the stream window's copy is the party view — the creatures no player's token sees dropped, the cells the players' tokens see together on it
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
    var toks = []; fightsOn(mapId).forEach(function(fid) { net.combats[fid].rows.forEach(function(r) { if (r && r.tokId) toks.push(r.tokId); }); });   // fold 2: every fight on that map
    Object.keys(net.targets || {}).forEach(function(p) { var t = net.targets[p]; if (t && t.mapId === mapId && t.id) toks.push(t.id); });
    return toks.some(function(id) { return !was.ids[id] !== !ids[id]; });
}
function fogSeedSnapshot(conn, snap) {   // every fogged map of the hosted campaign, as the join snapshot carried it
    var camp = getActiveCampaign(), cs = snap && snap.appState && snap.appState.campaigns, sc = camp && cs && own(cs, camp.id) ? cs[camp.id] : null;
    if (!sc || !sc.items || !camp.items) return;
    Object.keys(camp.items).forEach(function(id) { if (mapFogged(camp.items[id]) && own(sc.items, id) && sc.items[id].stub !== true) { fogSeed(conn, id, sc.items[id]); var prS = net.roster[conn.peer]; if (prS && typeof prS.id === 'string') memSendTo(conn, prS.id, camp, id); } });   // possession: a stub is no copy of the map; 1.6.3 (finding 13): and their explored ground of each map they hold
}
// [netcheck:memsend-start]
// 1.6.3 (the owner's ruling of 2026-11-17, finding 13: "Keep it across sessions"): a player's explored ground of a fogged map, which the host
// keeps (fog.js memHostNote, camp.fogMem), sent to one connection of theirs as the message fogMem { campId, itemId, k, c } once for each map and
// for each grid and fog epoch, right after a whole copy of that map goes to it (the join snapshot, a whole copy sent alone or to the table). Their
// app lays it into its own store (fog.js memSeed); what their tokens see afterwards their own screen adds to it as before. _memSent: the key last
// sent, by connection and map, the host's memory only, forgotten with the connection, the map and the table. Where memOut sends nothing the record
// still follows the key the host is at now (fog.js memKeyNow), an empty store's too: the live two-peer check of 1.6.3 found that after Cover all
// (a new epoch, nothing kept under it) the record stayed at the old epoch's key, so Undo, which brings that key back, read as already sent and
// the player, whose screen had emptied its store at the epoch change, saw their ground again only after a reload
var _memSent = Object.create(null);
function memSendTo(conn, pid, camp, mapId) {
    var F = window.wpFog; if (!conn || !conn.open || typeof conn.peer !== 'string' || !F || typeof F.memOut !== 'function' || !camp || !camp.items || !own(camp.items, mapId)) return;
    var per = own(_memSent, conn.peer) ? _memSent[conn.peer] : (_memSent[conn.peer] = Object.create(null)), out = F.memOut(camp, camp.items[mapId], pid, own(per, mapId) ? per[mapId] : null);
    if (!out) { var kn = typeof F.memKeyNow === 'function' ? F.memKeyNow(camp, camp.items[mapId]) : null; if (typeof kn === 'string') per[mapId] = kn; return; }   // nothing to send: the connection now stands at this key all the same
    try { conn.send({ type: 'fogMem', campId: camp.id, itemId: mapId, k: out.k, c: out.c }); } catch (e) { sendFailed(e); return; }
    per[mapId] = out.k;
}
function memSentForget(peer, mapId) { if (typeof peer === 'string') { delete _memSent[peer]; return; } if (typeof mapId === 'string') Object.keys(_memSent).forEach(function(p) { delete _memSent[p][mapId]; }); else _memSent = Object.create(null); }
// [netcheck:memsend-end]
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
function ackSend(msg, mapId) {   // a map for every admitted, open connection, each with its own number (a shared broadcast cannot carry one); mapId: only the connections holding that map whole (possession)
    net.conns.forEach(function(c) { if (!c.open || (net.role === 'host' && !own(net.roster, c.peer))) return; if (mapId && typeof mapHeld === 'function' && !mapHeld(c, mapId)) return; try { c.send(withAck(msg, c)); } catch (e) { sendFailed(e); } });
}
// [netcheck:acks-end]
// [netcheck:hidpend-start]
// hidden pieces (owner, 2026-10-01): a drawing of a player's that the GM hid is on no copy of theirs, so a map copy of theirs that leaves it out
// is no erase — and still none once the GM shows it again, until a copy of theirs names it (a copy made before the shown drawing reached them
// lacks it too). The host's memory only, per connection and map: the ids of their own drawings seen hidden at a send of the map or at their
// join — for a connection holding that map whole (possession: one holding its stub has no copy to lack the drawing, and the whole map notes it
// when its player arrives) — forgotten one by one as a copy of theirs names them or the host puts their copy right, with the map as it is
// taken back from that connection, and with the connection, the map or the table.
// A patch that leaves such a drawing out, or names one still hidden here, came from a stale copy: that connection is sent the map whole, with
// the patch's number, so their app takes it as the word on everything up to that patch (applyClientItemFiltered, the item branch)
var _hidPend = Object.create(null);
function hidMark(mapId, ownerId, id, back) {   // back: a note made by the GM's undo ({ at: its time }); none: a drawing seen hidden (1)
    net.conns.forEach(function(c) {
        var pr = c && typeof c.peer === 'string' && own(net.roster, c.peer) ? net.roster[c.peer] : null; if (!pr || pr.id !== ownerId) return;
        if (typeof mapHeld === 'function' && !mapHeld(c, mapId)) return;   // possession: only a connection holding this map whole has a copy of it
        var per = own(_hidPend, c.peer) ? _hidPend[c.peer] : (_hidPend[c.peer] = Object.create(null)), ids = own(per, mapId) ? per[mapId] : (per[mapId] = Object.create(null));
        ids[id] = back || 1;
    });
}
function hidNote(map) {
    if (!map || map.type !== 'map' || typeof map.id !== 'string' || !Array.isArray(map.whiteboard)) return;
    map.whiteboard.forEach(function(w) {
        if (!w || !w.hidden || w.type !== 'path' || !w.byPlayer || typeof w.ownerId !== 'string' || typeof w.id !== 'string') return;
        hidMark(map.id, w.ownerId, w.id);
    });
}
// The owed review, 2026-10-09: the same for a drawing of a player's that the GM's undo or redo brought back (io.js stepHistory tells which, as
// the merge names them). Its player's copy does not hold it until the restored map reaches them, so a copy of theirs made before that
// lacks it: read as their erase, it took the GM's undo back in silence and noted an erase that no later undo could bring back. This note
// carries its time: EVERY copy of theirs that lacks the drawing within HID_BACK_MS of the step is no erase (two may be on their way), and
// after that the note is spent, so that an erase of their own is an erase at once however long they waited
function hidBack(mapId, list) {
    if (typeof mapId !== 'string' || !mapId || !Array.isArray(list)) return;
    var at = typeof fogNow === 'function' ? fogNow() : Date.now();
    list.forEach(function(b) { if (b && typeof b.id === 'string' && b.id && typeof b.ownerId === 'string' && b.ownerId) hidMark(mapId, b.ownerId, b.id, { at: at }); });
}
net.strokesBack = function(mapId, list) { if (net.role === 'host') hidBack(mapId, list); };
function hidNoteAll() { var camp = getActiveCampaign(); if (camp && camp.items) Object.keys(camp.items).forEach(function(id) { hidNote(camp.items[id]); }); }
function hidPendOf(peer, mapId) { return typeof peer === 'string' && own(_hidPend, peer) && typeof mapId === 'string' && own(_hidPend[peer], mapId) ? _hidPend[peer][mapId] : null; }
function hidNamed(peer, mapId, ids) { var p = hidPendOf(peer, mapId); if (p) Object.keys(ids).forEach(function(id) { delete p[id]; }); }
function hidForgetMap(mapId) { Object.keys(_hidPend).forEach(function(p) { delete _hidPend[p][mapId]; }); }
// [netcheck:hidpend-end]
function fogForgetConn(peer) { if (typeof memSentForget === 'function') memSentForget(peer); if (typeof peer === 'string') { delete _fogHeld[peer]; delete _acks[peer]; delete _hidPend[peer]; if (typeof boxForgetConn === 'function') boxForgetConn(peer); } if (typeof mapForgetConn === 'function') mapForgetConn(peer); if (typeof combatsSentForget === 'function') combatsSentForget(peer); }   // 14c: and how far its copies go; hidden pieces: and the drawings of theirs the GM hid
function fogForgetMap(mapId) { Object.keys(_fogHeld).forEach(function(p) { delete _fogHeld[p][mapId]; }); if (typeof memSentForget === 'function') memSentForget(null, mapId); }
function fogForgetOne(peer, mapId) { if (typeof peer !== 'string' || typeof mapId !== 'string') return; if (own(_fogHeld, peer)) delete _fogHeld[peer][mapId]; if (typeof _memSent === 'object' && _memSent && own(_memSent, peer)) delete _memSent[peer][mapId];   /* the review of 1.6.3 (finding 13): the explored ground of a map they leave is sent again on their return, since their screen may have let it go meanwhile */ if (own(_hidPend, peer)) delete _hidPend[peer][mapId]; }   // possession (the take-back): one connection's copy of one map is gone — what it held (fold M5) and the drawings of theirs the GM hid on it (the whole copy they get on their return notes those afresh)
function fogForgetAll() { if (typeof window !== 'undefined' && window.wpNotice) window.wpNotice.forget(); if (typeof memSentForget === 'function') memSentForget(null, null); _fogHeld = Object.create(null); _acks = Object.create(null); _hidPend = Object.create(null); if (typeof mapForgetAll === 'function') mapForgetAll(); Object.keys(_fogPend).forEach(function(k) { clearTimeout(_fogPend[k]); }); _fogPend = Object.create(null); _fogCost = Object.create(null); if (typeof combatForget === 'function') combatForget(); }   // a new table: no fight's rows seen
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
net.noticeArm = function(mapId) { fogArm(mapId); };   // 1.6.0: a side vision check changed what a player holds
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
    if (typeof mapHeld === 'function' && !mapHeld(c, m.id)) return false;   // possession: a map this connection was never given whole is not caught up (nor sent whole here)
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
    if (moved) {
        fogRoster(c, pid, m.id);
        if (typeof recLine === 'function') { var seer = (net.roster[c.peer] || {}).name || 'A player', wbS = Array.isArray(m.whiteboard) ? m.whiteboard : [], nmS = function(id) { var f = wbS.find(function(x) { return x && x.id === id; }); return String(f && (f.charName || f.name) || 'a token'); }; add.forEach(function(a) { recLine('bg', seer, 'Now sees ' + nmS(a.item.id), 'Worked out by the fog, on ' + String(m.meta && m.meta.title || 'a map'), 1); }); drop.forEach(function(id) { recLine('bg', seer, 'No longer sees ' + nmS(id), 'Worked out by the fog, on ' + String(m.meta && m.meta.title || 'a map'), 1); }); }   // 1.6.0: the game record
    }
    return moved;
}
// the turn order and the pointers to that connection, where that map has a fight or a pointer, judged with every open drag at its start
function fogRoster(c, pid, mapId) {
    var inFight = fightsOn(mapId).length > 0, aimed = Object.keys(net.targets || {}).some(function(p) { var t = net.targets[p]; return !!t && t.mapId === mapId; });   // fold 2: any fight on that map
    if (!inFight && !aimed) return;
    fogLanded(null, function() {
        try {
            if (inFight) combatsTo(c, combatsFor(pid, connMap(c)));
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

// [netcheck:landing-start]
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
    net.stageMode = pick ? pick.mode : 'last';   // the owner's ruling of 2026-10-04: "players should never follow me automatically" — a table follows the GM only when the GM sets it to (it began on Follow me while the campaign had had no player)
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
        return { stage: currentStage(), detached: true };   // a first-timer under "Follow me": on the map the GM is on, ONCE — they do not follow the GM's browsing afterwards (they did, from map to map, until they rejoined)
    }
    return { stage: currentStage(), detached: false };
}
// [netcheck:landing-end]

// [netcheck:curstage-start]
// The map this computer last had open in a campaign (sidebar.js keeps the list, wp_recent_<campaign>, newest first): the stage while the GM is
// on a planner or a page and no map has been the table's yet. 1.5.6 (found live on 2026-10-24): the stage was noted only when the host saved
// while the GM was on a map, so a GM who began hosting on a map and opened a planner before any save there gave a new player no landing at
// all (no token, and their screen on a map they did not hold), while the Multiplayer window said Follow me with that map's name.
function recentMapOf(camp) {
    try {
        var v = JSON.parse(localStorage.getItem('wp_recent_' + camp.id) || '[]');
        if (!Array.isArray(v)) return null;
        for (var i = 0; i < v.length && i < 8; i++) { var id = v[i]; if (typeof id === 'string' && own(camp.items, id) && camp.items[id] && camp.items[id].type === 'map') return id; }
    } catch (e) {}
    return null;
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
    // if the GM is on a planner, players stay on the last map; with none yet, the map last open here
    if (net.lastMapStageObj) return net.lastMapStageObj;
    var rid = recentMapOf(camp);
    return rid ? { campId: camp.id, itemId: rid } : null;
}
// [netcheck:curstage-end]

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
if (_makeFile) _makeFile.addEventListener('change', function() { setNewPlayers({ fromFile: this.checked }); toast(this.checked ? 'Players may start a character from a file (their own sheet download).' : 'Players make a character by hand only.'); });
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
    var stF = (it && it.type === 'map') ? null : currentStage();   // 1.5.6: the label names the very map a new player would land on
    var followTitle = (it && it.type === 'map' && it.meta) ? it.meta.title
        : (stF && stF.campId === camp.id && camp.items[stF.itemId] && camp.items[stF.itemId].meta && camp.items[stF.itemId].meta.title) || 'your current map';
    var maps = Object.values(camp.items).filter(function(m) { return m.type === 'map'; });
    maps.sort(function(a, b) { return String((a.meta && a.meta.title) || '').localeCompare(String((b.meta && b.meta.title) || '')); });
    var mapOpts = maps.map(function(m) { return '<option value="' + escAttr(m.id) + '">' + escText((m.meta && m.meta.title) || m.id) + '</option>'; }).join('');
    defaultStageMode(camp);
    // the mode in force stays listed even if the last map it relied on has since been deleted
    var lastOpt = '<option value="last">Player\'s last location</option>';   // always offered: it is the mode a table starts in
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
    if (camp.items[stage.itemId] && camp.items[stage.itemId].type === 'map' && camp.items[stage.itemId].stub === true && net.needItem) net.needItem(stage.campId, stage.itemId);   // possession: put on a map this app holds only as a stub (its whole copy did not come): ask for it
    state.viewMode = 'visual';
    state.selId = null; state.selWbId = null; state.selWbIds = [];
    // Personal travel names a landing room: open the map looking at it
    if (stage.landRoomId && camp.items[stage.itemId]) {
        var destS = camp.items[stage.itemId];
        var landS = (destS.rooms || []).find(function(r) { return r.id === stage.landRoomId; });
        var ptS = landS && landingPoint(destS, landS);
        if (ptS && ptS.wbX != null) { destS.meta = destS.meta || {}; destS.meta.lastWbX = ptS.wbX; destS.meta.lastWbY = ptS.wbY; }
    }
    if (typeof camLand === 'function' && (net.role === 'client' || window.wpStream)) camLand(camp.items[stage.itemId], net.myId, !!window.wpStream);   // the camera: a map this app holds no view of opens on a token of its own there, never where the GM last looked (the host sends no camera)
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
    if (camp.items[camp.activeItemId].stub === true) return null;   // possession: a stub is no copy of the map — a player's app sends nothing of one (the host would read a copy with nothing on it as their drawings erased)
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
    if (incoming && incoming.type === 'doc') { incoming = window.wpDocRender ? window.wpDocRender.cleanDoc(incoming, { keepHidden: true }) : null; if (!incoming) return; }   // a page is normalized before it is stored (a hostile host can send shapes, not just markup)
    if (!incoming || typeof incoming !== 'object') return;
    if (incoming.type !== 'map' && incoming.type !== 'doc') return;   // security (2026-10-01): a player's copy holds maps and pages, nothing else a host names (a planner never ships; an unknown kind used to be stored as sent)
    var camWas = incoming.type === 'map' && typeof camOf === 'function' && Object.prototype.hasOwnProperty.call(camp.items, msg.itemId) ? camOf(camp.items[msg.itemId]) : null;   // the camera this app had for the map (none a host names)
    var mineWas = camWas && typeof camMine === 'function' ? camMine(camp.items[msg.itemId], net.myId) : null;
    if (incoming.type === 'map') incoming = cleanHostMap(incoming);   // text items rebuilt, colors checked, bounded
    if (camWas && typeof camHold === 'function') camHold(incoming, camWas);
    if (incoming.type === 'map' && typeof actOver === 'function') actOver(msg.itemId, incoming, ackIn(msg.ack));   // 14c: what this copy lacks of their own actions, written back
    net.applyingRemote = true;
    camp.items[msg.itemId] = incoming;
    var myActive = getActiveCampaign();
    if (myActive && myActive.id === msg.campId && myActive.activeItemId === msg.itemId && incoming.type === 'map') { var gaveI = mineWas && typeof camGiven === 'function' ? camGiven(incoming, net.myId, mineWas) : null; render(); if (gaveI && window.appRestoreCamera) window.appRestoreCamera(); }
    updateSidebarNav();
    if (incoming.type === 'doc') { try { if (window.wpDocReaderRefresh) window.wpDocReaderRefresh(msg.campId, msg.itemId); } catch (e) {} try { if (window.wpSheets && window.wpSheets.sheetRefsChanged && window.wpSheets.sheetRefsChanged()) window.wpSheets.renderSheet(); } catch (e) {} }   // never let the reader wedge applyingRemote; a sheet's handbook chips/links follow their page (Stage 5f) — only when what they show changes
    if (window.wpFog) { window.wpFog.invalidateVision(); window.wpFog.redraw(); }   // a received map may change sight-blockers (doors/walls) — recompute occlusion
    net.applyingRemote = false;
}

// [netcheck:strokeacts-start]
// 127 (the owner, by prompt, 2026-10-06: the GM's Undo takes back what the GM did to a player's drawing, "and still never moves or erases what
// the player did themselves"): what players did to their own drawings, by the host's own count — which they added and which they redrew (and
// when: a number that only goes up, a new one for each), and which they erased — noted in the one place a player's drawing is taken
// (applyClientItemFiltered). The GM's undo reads it
// (io.js mergeLivePlayerState) to tell a player's erase from the GM's own delete, a drawing a player added after a step was taken from a piece
// the GM's eraser cut, and a player's redraw from the GM's move. Kept for the app's run, as the undo history is, and never for one table (a
// step may be older than the session); a map's count goes with the map. Bounded: the added and redrawn ids are of drawings a player has not
// erased (at most the drawings a map may hold, and those the GM removed), the erased ids the newest STROKE_ERASED_CAP a map. The undo is given
// three questions about an id (strokeActs), never the sets
var _strokeActs = Object.create(null), _strokeSeq = 0, STROKE_ERASED_CAP = 5000;
function strokeNote(campId, mapId, what, id) {
    if (typeof campId !== 'string' || typeof mapId !== 'string' || typeof id !== 'string' || !campId || !mapId || !id) return;   // what is no text, or empty, names nothing
    var k = campId + '|' + mapId, a = _strokeActs[k] || (_strokeActs[k] = { added: new Map(), redrawn: new Map(), erased: new Set() });
    if (what === 'added') { a.added.set(id, ++_strokeSeq); a.erased.delete(id); }
    else if (what === 'redrawn') a.redrawn.set(id, ++_strokeSeq);   // numbered as an added drawing is: a state taken at this number or after it already holds the redraw
    else if (what === 'erased') { a.added.delete(id); a.redrawn.delete(id); a.erased.delete(id); a.erased.add(id); if (a.erased.size > STROKE_ERASED_CAP) a.erased.delete(a.erased.values().next().value); }   // the oldest goes first
}
function strokeActs(campId, mapId) {
    var of = function() { return (typeof campId === 'string' && typeof mapId === 'string' && _strokeActs[campId + '|' + mapId]) || null; };   // read when a question is asked, so an answer is never older than the count
    return { addedAt: function(id) { var a = of(); return (a && a.added.get(id)) || 0; }, redrawnAt: function(id) { var a = of(); return (a && a.redrawn.get(id)) || 0; }, erased: function(id) { var a = of(); return !!(a && a.erased.has(id)); } };
}
function strokeActsForget(campId, mapId) { delete _strokeActs[campId + '|' + mapId]; }
net.strokeActs = strokeActs; net.strokeSeq = function() { return _strokeSeq; };
// [netcheck:strokeacts-end]
// Host-side validation: from a player's patch, apply ONLY position/rotation of
// whiteboard items owned by that player. Everything else is ignored.
// [netcheck:patch-start]
var STROKE_CAP = 600, STROKE_PTS_CAP = 60000, HID_BACK_MS = 5000;   // a player's drawings on one map: their count, and their points in all (a drawing is 4000 points at most) — what bounds the GM's save and every copy of the map
// 49 (c) (the owner, by prompt, 2026-10-06: "Lock it for its player"): a player's drawing the GM made a wall (Blocks sight) or a see-through
// barrier (Stops movement only) is the GM's piece from then on — its player neither redraws nor erases it, as with one the GM locked, until
// the GM unticks it. fogcore strokeHeld is the one judge (a player's own eraser asks it too). A copy of theirs that would change or drop
// such a drawing changes nothing here and is answered with the map whole (out.whole), so their screen holds the line again
function strokeHeldOn(w) { var FCh = window.wpFogCore; return !!(FCh && typeof FCh.strokeHeld === 'function' && FCh.strokeHeld(w)); }
function applyClientItemFiltered(msg, profile, out) {   // fold M10: out.strokes, set when a drawing of theirs was added, redrawn or erased
    if (!profile) return false;
    if (typeof profile.location === 'string' && msg.itemId !== profile.location) return false;   // the map they are on, as the pos gate and the threats branch have it: a copy of another map — one they left a token on, one closed to players — moves nothing there, draws nothing and finds no room's handout (and a stale copy of the map the GM just moved them from is dropped, as a final pos is)
    var camp = campOf(msg.campId);   // own keys only: a campId or itemId such as "constructor" names nothing (it used to reach a prototype's function and throw)
    if (!camp || !validKey(msg.itemId) || !own(camp.items, msg.itemId)) return false;
    var liveItem = camp.items[msg.itemId];
    if (!liveItem || liveItem.type !== 'map' || !msg.item || !Array.isArray(msg.item.whiteboard)) return false;
    var changed = false;
    var liveById = Object.create(null);
    (liveItem.whiteboard || []).forEach(function(w) { liveById[w.id] = w; });
    var sentIds = Object.create(null);
    var pend = out && out.conn && typeof hidPendOf === 'function' ? hidPendOf(out.conn.peer, msg.itemId) : null;   // hidden pieces: their drawings the GM hid, which a copy of theirs may lack by the GM's hand
    var ownStrokes = 0, ownPts = 0;   // this player's drawings already on the map, and their points: the caps are per map, not per patch
    (liveItem.whiteboard || []).forEach(function(w) { if (w && w.type === 'path' && w.byPlayer && w.ownerId === profile.id) { ownStrokes++; ownPts += Array.isArray(w.pts) ? w.pts.length : 0; } });
    var fkP = [];   // fold M7: each own token's where-it-sees-from before this copy lands (at the drag's start while one is open)
    msg.item.whiteboard.forEach(function(w) {
        if (!w || !validKey(w.id)) return;   // an id that is no key (empty, past 160, a prototype's) names nothing here
        sentIds[w.id] = true;
        var lw = liveById[w.id];
        if (!lw) {
            if (w.ownerId === profile.id && typeof showGoneHas === 'function' && showGoneHas(msg.itemId, w.id)) { if (out) out.whole = true; return; }   // 1.6.2: a drawing to show that was taken away a moment ago: a copy made before that reached them adds nothing, and the whole map puts their screen right
            // New item: only a drawing signed with this player's id, in a sane shape
            var stroke = playerStroke(w, profile.id);
            if (!stroke || ownStrokes >= STROKE_CAP || ownPts + stroke.pts.length > STROKE_PTS_CAP) return;   // past either cap the drawing is not taken (their own copy keeps it until the next copy of the map, as ever)
            if (typeof strokeShow === 'function') strokeShow(stroke, w, msg.itemId);   // 1.6.2: a player's new drawing is one to show, by the host's rule and whatever their copy says
            ownStrokes++; ownPts += stroke.pts.length; liveItem.whiteboard.push(stroke); liveById[stroke.id] = stroke; changed = true; if (out) out.strokes = true;   // noted under its id: the same new id again in this copy redraws it instead of adding a second
            if (typeof strokeNote === 'function') strokeNote(msg.campId, msg.itemId, 'added', stroke.id);   // 127: the host's count of what players did to their own drawings (the GM's undo reads it)
            return;
        }
        if (lw.ownerId !== profile.id) return;   // ownership is judged on the HOST's copy
        if (lw.hidden) { if (out && lw.type === 'path' && lw.byPlayer) out.whole = true; return; }   // a piece the GM hid is not on its player's copy at all: nothing a patch says of it overwrites the host's; a copy naming a drawing of theirs hidden here was made before the hide reached them, and their app writes such a drawing back over every copy of that age — the whole map puts it right (the item branch)
        if (lw.locked) {   // the GM locked it: frozen for its player — no move, turn, facing, stance or redrawn stroke (their app stops them too)
            if (out && lw.type === 'path' && lw.byPlayer && strokeHeldOn(lw)) { var reL = playerStroke(w, profile.id); if (reL && (JSON.stringify(reL.pts) !== JSON.stringify(lw.pts) || reL.x !== lw.x || reL.y !== lw.y)) out.whole = true; }   // ...and where it is a wall or a barrier too, their copy of it says no lock (no plain wall carries one to players): a redraw is answered with the map whole, as for any held wall
            return;
        }
        if (lw.type === 'path' && lw.byPlayer) {
            var re = playerStroke(w, profile.id), hadPts = Array.isArray(lw.pts) ? lw.pts.length : 0;
            if (strokeHeldOn(lw)) { if (out && re && (JSON.stringify(re.pts) !== JSON.stringify(lw.pts) || re.x !== lw.x || re.y !== lw.y)) out.whole = true; return; }   // 49 (c): a wall or a barrier now — a redraw of it is refused, and their screen is put right
            if (re && ownPts - hadPts + re.pts.length > STROKE_PTS_CAP) return;   // a redraw that would take their points past the budget is refused whole
            if (re && JSON.stringify(re.pts) !== JSON.stringify(lw.pts) || (re && (re.x !== lw.x || re.y !== lw.y))) { ownPts += re.pts.length - hadPts; if (lw.tip === 'fill') delete re.tip; Object.assign(lw, re); if (!re.tip && (lw.tip === 'square' || lw.tip === 'flat')) delete lw.tip; changed = true; if (out) out.strokes = true; if (typeof strokeNote === 'function') strokeNote(msg.campId, msg.itemId, 'redrawn', lw.id); }
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
        if (lw.isChar && typeof faceJudge === 'function') {   // 1.6.2 (backlog 70): a turn that reaches the host in a map copy is judged as a final's is, from the facing its drag began with where one was open (the host's own followed the drag)
            var drF = typeof frP === 'object' && frP && typeof frP.rot === 'number' ? frP : lw, fjP = faceJudge(camp, liveItem, msg.itemId, lw, faceDeg(drF), faceDeg(w)), dkF = msg.itemId + '|' + lw.id, seenF = _faceRefused[dkF] === faceDeg(w); delete _faceRefused[dkF];
            if (fjP && fjP.refuse) {   // the copy's sender always gets the map whole: their put-back may have crossed this very copy and been passed over as older (the review)
                var wasR = Number(lw.rot) || 0, wasFr = Number(lw.front) || 0; w.rot = Number(drF.rot) || 0; w.front = Number(drF.front) || 0; if (out) out.whole = true;
                if (!seenF && typeof noteOwner === 'function') noteOwner(profile.id, faceRefusedText(fjP), lw.charId);
                if ((wasR !== w.rot || wasFr !== w.front) && typeof faceRelay === 'function') faceRelay(camp, liveItem, msg, lw, w, out && out.conn);
            }
            else if (fjP) { var ntF = faceCount(lw, fjP); if (typeof noteOwner === 'function') noteOwner(profile.id, ntF, lw.charId); }
            if (whyP && out && frP && typeof frP.rot === 'number' && ((Number(w.rot) || 0) !== frP.rot || (Number(w.front) || 0) !== (Number(frP.front) || 0))) out.whole = true;   // the check: the put-back told the mover the drag's start facing, and this copy's lands
        }
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
        if (!(w.type === 'path' && w.byPlayer && w.ownerId === profile.id) || w.hidden || sentIds[w.id]) return true;   // one the GM hid stays: it left their copy by the GM's hand, not theirs
        if (w.locked) { if (out && strokeHeldOn(w)) out.whole = true; return true; }   // a locked one stays; where it is a wall or a barrier too, their copy of it says no lock, so the copy that left it out gets the map back
        if (pend && pend[w.id] === 1) { delete pend[w.id]; if (out) out.whole = true; return true; }   // ...and one the GM hid and has shown again, this once: this copy may be older than the showing (their app may have dropped the shown drawing meanwhile: the whole map puts it right, and a later copy without it is an erase)
        if (pend && pend[w.id] && typeof pend[w.id] === 'object') {   // ...and one the GM's undo or redo brought back (hidBack), for a short while after the step: this copy was made before the restored map reached them
            var nowB = typeof fogNow === 'function' ? fogNow() : Date.now(), atB = pend[w.id].at;
            if (typeof atB === 'number' && nowB >= atB && nowB - atB <= HID_BACK_MS) { if (out) out.whole = true; return true; }
            delete pend[w.id];   // past its time: the restored map reached them long ago, and this copy is their own erase
        }
        if (strokeHeldOn(w)) { if (out) out.whole = true; return true; }   // 49 (c): one the GM made a wall or a barrier stays, and the copy that left it out gets the map back
        if (typeof strokeNote === 'function') strokeNote(msg.campId, msg.itemId, 'erased', w.id);   // 127: erased by its player — the GM's undo never brings it back
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

// [netcheck:drawshow-start]
// Drawings to show (1.6.2; the owner, by prompt: "To show, map by ask (Recommended)": a player draws To show, over the fog for everyone on that map, with the
// ground under it still hidden, and asks to put it on the map). A player's NEW drawing is one to show whatever their copy says, so no patched app draws
// on the map without the GM's word, and only its new drawing is stamped: playerStroke's keys are what a player may hand the host again and again, and a
// redraw never changes the mark. With no core at hand it is a plain drawing, as before. fogcore holds the rule, drawshow.js the rest. A host that knows the
// mark says so in its join snapshot (drawShow: true, read as true only): an older one would stay silent, so a player's app offers neither To show nor the
// ask there. What the host takes away of them is noted for a few seconds (showGoneHas), since a copy of a player's made before that reached them still
// names the drawing, which would read as a new one
var SHOW_ASK_MOST = 60, SHOW_GONE_MS = 10000, SHOW_GONE_MOST = 400, _showGone = new Map(), _showKnown = false;
function showKnows(v) { _showKnown = v === true; }
net.showKnown = function() { return net.role === 'client' ? _showKnown : true; };
function strokeShow(stroke, w, mapId) {
    var FCn = typeof window === 'object' && window ? window.wpFogCore : null; if (!FCn || typeof FCn.cleanShowFor !== 'function') return stroke;
    stroke.toShow = true; var sf = FCn.cleanShowFor(w.showFor); if (sf) stroke.showFor = sf;
    if (window.wpDrawShow && typeof window.wpDrawShow.touch === 'function') window.wpDrawShow.touch(mapId);
    return stroke;
}
function showGoneHas(mapId, id) {
    var k = mapId + '|' + id, at = _showGone.get(k); if (at === undefined) return false;
    if (Date.now() - at > SHOW_GONE_MS) { _showGone.delete(k); return false; }
    return true;
}
net.showDropped = function(mapId, ids) {
    (Array.isArray(ids) ? ids : []).forEach(function(id) { if (typeof id !== 'string') return; var k = mapId + '|' + id; _showGone.delete(k); _showGone.set(k, Date.now()); if (_showGone.size > SHOW_GONE_MOST) _showGone.delete(_showGone.keys().next().value); });
};
// A player's app: asks the host to put drawings of their own on the map. The host's branch judges every id
net.showAsk = function(mapId, ids) {
    var c = net.conns && net.conns[0], camp = getActiveCampaign();
    if (!net.active || net.role !== 'client' || !net.foreign || !_showKnown || !c || !c.open || !camp || typeof mapId !== 'string' || !Array.isArray(ids) || !ids.length) return false;
    try { c.send({ type: 'show-ask', campId: camp.id, itemId: mapId, ids: ids.slice(0, SHOW_ASK_MOST) }); return true; } catch (e) { return false; }
};
net.showTell = function(pid, words) { if (net.active && net.role === 'host' && typeof noteOwner === 'function') noteOwner(pid, words); };   // the GM's answer, to its player
// [netcheck:drawshow-end]
// A drawing a player may hand the host: a freehand path signed with their id, whitelisted fields only.
function playerStroke(w, pid) {
    if (!w || w.type !== 'path' || w.ownerId !== pid || !Array.isArray(w.pts)) return null;
    if (typeof w.id !== 'string' || !/^[A-Za-z0-9_.:-]{1,80}$/.test(w.id) || (w.id in Object.prototype)) return null;   // its id: short plain text (the app's own are 'wb' + a few characters), never a prototype's key (a drawing called "constructor" was kept past its erasing on every other copy), never megabytes stored in the GM's save and sent in every copy
    if (w.pts.length < 2 || w.pts.length > 4000) return null;
    var num = function(v, d) { return (typeof v === 'number' && isFinite(v)) ? Math.max(-1e6, Math.min(1e6, v)) : d; };   // bounded: the packer refuses a whole number past 64 bits
    var pts = [];
    for (var i = 0; i < w.pts.length; i++) { var p = w.pts[i]; if (!Array.isArray(p) || p.length < 2) return null; pts.push([num(p[0], 0), num(p[1], 0)]); }
    var color = (typeof w.color === 'string' && /^(#[0-9a-f]{3,8}|rgba?\([\d.,\s%]+\)|var\(--[a-z0-9-]+\)|[a-z]{3,20})$/i.test(w.color)) ? w.color : '#e9e9f0';
    var out = { id: w.id, type: 'path', x: num(w.x, 0), y: num(w.y, 0), w: Math.max(1, num(w.w, 10)), h: Math.max(1, num(w.h, 10)),
                baseW: Math.max(1, num(w.baseW, num(w.w, 10))), baseH: Math.max(1, num(w.baseH, num(w.h, 10))), z: 35, pts: pts,
                color: color, strokeWidth: Math.min(40, Math.max(1, num(w.strokeWidth, 3))), ownerId: pid, byPlayer: true };
    if (typeof w.opacity === 'number' && w.opacity >= 0 && w.opacity <= 1) out.opacity = w.opacity;
    if (w.tip === 'square' || w.tip === 'flat') out.tip = w.tip;   // the nib it was drawn with, so every screen draws it as its drawer's does (round where none is named, as before); never the Fill tip
    return out;
}

// [netcheck:snapitems-start]
// A snapshot's items, as a player's app keeps them: a map and a page, each cleaned as a whole item of its kind is, and NOTHING of any other
// kind. A planner never ships, and until 1.5.4 one a host named in its snapshot was kept as sent (a whole item of another kind was already
// refused: applyItem). No id a prototype holds; items that are no plain object are none; a prototype of the host's choosing is taken off
function snapItems(cS) {
    if (!cS.items || typeof cS.items !== 'object' || Array.isArray(cS.items)) { cS.items = {}; return; }
    if (Object.getPrototypeOf(cS.items) !== Object.prototype) Object.setPrototypeOf(cS.items, Object.prototype);
    Object.keys(cS.items).forEach(function(id) {
        var itS = cS.items[id];
        if (id in Object.prototype) { delete cS.items[id]; return; }
        if (itS && itS.type === 'doc') { var cd = window.wpDocRender ? window.wpDocRender.cleanDoc(itS, { keepHidden: true }) : null; if (cd) cS.items[id] = cd; else delete cS.items[id]; }
        else if (itS && itS.type === 'map') cleanHostMap(itS);
        else delete cS.items[id];
    });
}
// [netcheck:snapitems-end]
function applySnapshot(msg) {
    if (!msg || !msg.appState || typeof msg.appState !== 'object' || !msg.appState.campaigns || typeof msg.appState.campaigns !== 'object') return;   // a host that sends no state gets nothing applied — and nothing left half-set
    if (typeof window !== 'undefined' && window.wpClearSharedBlasts) window.wpClearSharedBlasts();   // 1.6.0: a table taken afresh holds no circle of the table before it, so a GM's reload leaves both sides alike
    if (typeof tradeLost === 'function') tradeLost('The connection dropped, so the trade ended.');   // 1.6.0: nor a trade: the host ended it when the connection went
    // BinaryPack decodes a map by ASSIGNING its keys, so a packed "__proto__" re-parents the decoded object: the state and the campaign map get
    // a plain prototype back first, or a campaign (or a field deleted below) could still be inherited from the host's choice
    [msg.appState, msg.appState.campaigns].forEach(function(o) { if (Object.getPrototypeOf(o) !== Object.prototype) Object.setPrototypeOf(o, Object.prototype); });
    ['__proto__', 'constructor', 'prototype'].forEach(function(k) { if (Object.prototype.hasOwnProperty.call(msg.appState.campaigns, k)) delete msg.appState.campaigns[k]; });
    net.applyingRemote = true;
    // Origin marker: this state came from someone else's table. Lives in the appState so it rides
    // through every copy; a marked state is never written to disk and never installed by undo.
    var mark = { at: Date.now(), gm: validProfileId(msg.gmId) ? msg.gmId : null };   // security (2026-10-01): the origin mark carries a profile id or nothing (never a host's unbounded text)
    msg.appState._foreign = mark;
    Object.values(msg.appState.campaigns || {}).forEach(function (c) { c._foreign = mark; });
    state.appState = msg.appState;
    net.foreign = true;   // cleared only when load() brings this machine's own campaign back
    // handbook pages are normalized before anything renders them, and the active item is a map (never a page: guard 1 client-side)
    Object.values(state.appState.campaigns || {}).forEach(function(cS) {
        if (!cS || typeof cS !== 'object') return;
        if (Object.getPrototypeOf(cS) !== Object.prototype) Object.setPrototypeOf(cS, Object.prototype);   // (see above) or the delete below is a no-op for an inherited players map
        delete cS.players;   // names and table keys are the host's (sanitizeAppState strips them); the Players panel and the owner pickers must never draw a hostile snapshot's
        snapItems(cS);   // a map and a page, each cleaned, and nothing of any other kind
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
            var snapSys = (cs.system && window.wpFormula) ? window.wpSystemCore.cleanSystem(cs.system, { F: window.wpFormula, gmView: false, libCats: {}, needShown: true }) : null;   // libCats: the host's view, nothing GM-only in hand to hide
            if (snapSys) cs.system = snapSys; else delete cs.system;
        }
        if (!cs.chars || typeof cs.chars !== 'object') return;
        if (!cs.system) { delete cs.chars; return; }
        var cleanCh = {}; Object.keys(cs.chars).forEach(function(id) { var cc = window.wpSystemCore.cleanChar(cs.chars[id], cs.system, { state: 'owner' }); if (cc && cc.id === id) { cc.partial = cs.chars[id].partial === true; cleanCh[id] = cc; } }); cs.chars = cleanCh;
    });
    charSessionReset();
    Object.values(state.appState.campaigns || {}).forEach(function(cs) { if (cs && cs.chars && typeof cs.chars === 'object') Object.keys(cs.chars).forEach(function(id) { noteHostCopy(id, cs.chars[id].values); }); });   // Stage 6: the host's copy of every character, whole, from the start (a refusal goes back to it)
    if (typeof noteHostChar === 'function') Object.values(state.appState.campaigns || {}).forEach(function(cs) { if (cs && cs.chars && typeof cs.chars === 'object') Object.keys(cs.chars).forEach(function(id) { noteHostChar(cs.chars[id]); }); });   // item 35: and its looks, on our own whole copies alone
    if (typeof styleHostKnows === 'function') styleHostKnows(msg.looks);   // item 35: a host that knows text looks says so here; an older one says nothing
    if (typeof rowTextKnows === 'function') rowTextKnows(msg.rowText);   // 155: a host that keeps a row of its own's long text says so here; an older one would drop it unanswered
    if (typeof hitsKnow === 'function') hitsKnow(msg.hits); if (typeof landsKnow === 'function') landsKnow(msg.lands);   // 1.6.0 (B5): a host that answers which locations a target has says so here; 1.6.3 (defense fold 1): and one that knows a landed attack (an older one would drop a Take it unanswered)
    if (typeof showKnows === 'function') showKnows(msg.drawShow);   // 1.6.2: a host that knows a drawing to show says so here
    sheetFilesOkSet(msg.sheetFiles === true);   // 2026-10-18: a host that reads a sheet file made elsewhere says so here, true only
    if (typeof sheetOutsKnow === 'function') sheetOutsKnow(msg.sheetOut);   // 1.6.0: and a file a reader there writes for a player's own character
    net.stanceCamps = cleanStanceCamps(msg.stanceCamps);   // null from an older host: msg.stance governs every campaign
    net.targets = cleanTargets(msg.targets);
    if (typeof fightsKnow === 'function') fightsKnow(msg.fights);   // fold 2: a host whose fights have ids of their own says so here (fights: true); an older one keys them by the map
    net.combats = typeof cleanFightsIn === 'function' ? cleanFightsIn(msg.combats) : cleanCombats(msg.combats);
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
    try { if (typeof heldSync === 'function') heldSync(); } catch (e) {}   // 1.6.0 (backlog 190): out of date as we join
    try { if (window.wpSheets && window.wpSheets.charChanged) window.wpSheets.charChanged(null); } catch (e) {}   // Onboarding F0: a sheet whose character was reassigned while we were away closes now
    if (net.fromWelcome || (typeof webJoinOnly === 'function' && webJoinOnly())) { net.fromWelcome = false; if (window.wpHideWelcome) window.wpHideWelcome(); }   // a join started from the welcome screen: its campaign is here, so leave the welcome for the table (1.5.5: and every join on a website whose plan joins tables alone, where the welcome is the only other screen)
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
function uniqueIds(list) { var seen = {}; return Array.isArray(list) && list.every(function(x) { if (!x || typeof x.id !== 'string' || !x.id || seen[x.id]) return false; seen[x.id] = 1; return true; }); }
function itemDelta(itemId, clean) {
    var base = arguments.length > 2 ? arguments[2] : _lastSent[itemId];   // 1.6.3 (the review of pages reveal): a page cut per reader hands the copy one connection holds as a third argument, so its delta is worked out against that copy; null there means no copy, which sends whole
    if (!base || clean.type !== base.type || (clean.type !== 'map' && clean.type !== 'doc')) return null;      // no baseline: send whole
    if (clean.type === 'doc' && !(uniqueIds(clean.blocks) && uniqueIds(base.blocks))) return null;             // block deltas key on ids
    var d = { type: 'itemDelta', itemId: itemId }, any = false;
    function coll(key) {
        var was = Object.create(null), now = Object.create(null), set = [], del = [], added = false;   // keyed off the prototype: a drawing named "constructor" (an older save's) is one more drawing, deleted like any other — it used to read as still there, a ghost on every other copy
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
    if (!it || it.stub === true) { broadcast({ type: 'needItem', campId: msg.campId, itemId: msg.itemId }, null); return; }   // never had it, or holds only its stub (possession): ask for the whole thing
    var camWas = it.type === 'map' && typeof camOf === 'function' ? camOf(it) : null;   // the camera this app had for the map: a delta's meta names none, and cleanHostMap takes any off
    var mineWas = camWas && typeof camMine === 'function' ? camMine(it, net.myId) : null;
    net.applyingRemote = true;
    (it.type === 'doc' ? ['blocks'] : ['whiteboard', 'rooms']).forEach(function(key) {   // a page has blocks, a map has the rest — a delta never adds the other kind
        var ch = msg[key]; if (!ch || typeof ch !== 'object') return;
        if (!Array.isArray(ch.del)) ch.del = []; if (!Array.isArray(ch.set)) ch.set = []; if (ch.order !== undefined && !Array.isArray(ch.order)) delete ch.order;
        ch.set = ch.set.filter(function(x) { return x && typeof x === 'object' && typeof x.id === 'string'; });
        var list = it[key] = it[key] || [];
        var at = Object.create(null); list.forEach(function(x, i) { at[x.id] = i; });   // off the prototype, as itemDelta's
        (ch.del || []).forEach(function(id) { if (at[id] !== undefined) list[at[id]] = null; });
        (ch.set || []).forEach(function(x) { if (at[x.id] !== undefined && list[at[x.id]]) list[at[x.id]] = x; else list.push(x); });
        it[key] = list.filter(Boolean);
        if (ch.order) { var pos = Object.create(null); ch.order.forEach(function(id, i) { pos[id] = i; }); it[key].sort(function(a, b) { return (pos[a.id] === undefined ? 1e9 : pos[a.id]) - (pos[b.id] === undefined ? 1e9 : pos[b.id]); }); }
    });
    ['links', 'meta', 'cats'].forEach(function(k) { if (msg[k] !== undefined) it[k] = msg[k]; });
    if (it.type === 'map') cleanHostMap(it);   // whatever the delta touched: text items rebuilt, colors checked, bounded
    if (it.type === 'map' && camWas && typeof camHold === 'function') camHold(it, camWas);
    if (it.type === 'map' && typeof actOver === 'function') actOver(msg.itemId, it, ackIn(msg.ack));   // 14c: what this change lacks of their own actions, written back
    if (it.type === 'doc') {   // re-normalized after every delta, then the reader (if it shows this page) follows
        var cd = window.wpDocRender ? window.wpDocRender.cleanDoc(it, { keepHidden: true }) : null;
        if (cd) camp.items[msg.itemId] = cd; else delete camp.items[msg.itemId];
        try { if (window.wpDocReaderRefresh) window.wpDocReaderRefresh(msg.campId, msg.itemId); } catch (e) {}
        try { if (window.wpSheets && window.wpSheets.sheetRefsChanged && window.wpSheets.sheetRefsChanged()) window.wpSheets.renderSheet(); } catch (e) {}   // a renamed page's chips/links follow (Stage 5f)
    }
    var myActive = getActiveCampaign();
    if (myActive && myActive.id === msg.campId && myActive.activeItemId === msg.itemId && it.type === 'map') { var gaveD = mineWas && typeof camGiven === 'function' ? camGiven(it, net.myId, mineWas) : null; render(); if (gaveD && window.appRestoreCamera) window.appRestoreCamera(); }
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
    if (!map || map.stub === true) { ask(); return; }   // never had it, or holds only its stub (possession): the whole thing
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
// [split:body-end]
return { SHOW_ASK_MOST: SHOW_ASK_MOST, _lastPatchHash: _lastPatchHash, _sensesAt: _sensesAt, _sensesSig: _sensesSig, ackIn: ackIn, ackSend: ackSend, ackTook: ackTook, actForget: actForget, actNext: actNext, actNote: actNote, actPos: actPos, activeItemPatch: activeItemPatch, anyFog: anyFog, applyClientItemFiltered: applyClientItemFiltered, applyFogDiff: applyFogDiff, applyItem: applyItem, applyItemDelta: applyItemDelta, applySnapshot: applySnapshot, applyStage: applyStage, broadcast: broadcast, currentStage: currentStage, defaultStageMode: defaultStageMode, fogArm: fogArm, fogCatchUp: fogCatchUp, fogCopyFor: fogCopyFor, fogDiffId: fogDiffId, fogDragSweep: fogDragSweep, fogDrop: fogDrop, fogFilterClean: fogFilterClean, fogForgetAll: fogForgetAll, fogForgetConn: fogForgetConn, fogForgetMap: fogForgetMap, fogLanded: fogLanded, fogNow: fogNow, fogOwnLive: fogOwnLive, fogRoster: fogRoster, fogSeed: fogSeed, fogSeedSnapshot: fogSeedSnapshot, hidForgetMap: hidForgetMap, hidNote: hidNote, hidNoteAll: hidNoteAll, itemDelta: itemDelta, landingFor: landingFor, mapForgetConn: mapForgetConn, mapForgetMap: mapForgetMap, mapGive: mapGive, mapHeld: mapHeld, mapHeldNote: mapHeldNote, mapHeldOf: mapHeldOf, mapLeft: mapLeft, mapStub: mapStub, mapStubMsg: mapStubMsg, mapStubSend: mapStubSend, mapStubSync: mapStubSync, memSendTo: memSendTo, quickHash: quickHash, refreshStageSelect: refreshStageSelect, sanitizeAppState: sanitizeAppState, sendFailed: sendFailed, strokeActsForget: strokeActsForget, wireNum: wireNum, withAck: withAck };   // [split:glue]
}   // [split:glue]
