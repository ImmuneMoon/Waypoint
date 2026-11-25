/* sheetlink.js: a part of sheets.js (docs/REFACTOR_SPLIT_PLAN.md, area 3, linked sheets; split 2026-11-18 with no change in behavior).
   What it holds: linked sheets on the sheet itself. The sources the core reads a linked sheet through (linkSource, holderSource,
   crewSource, registered with systemcore.js as these lines run), what an every-row change wrote on a linked sheet (linkValuesWrite),
   a sheet shared with other players (shareToggle), the riders and crew a sheet lists (linkRiders), the link bar under a sheet's head
   (linkBar, in the [systemcheck:linkbar-*] lines, with + Crew... in the [systemcheck:crewpick-*] lines: crewCandidates, crewAddPick),
   a sheet's category in the Characters list (charCatSet, charCatNow) and a link set from the menu (setLink). The judge of a link is
   systemcore.js's (linkcore.js); the System editor's Linked sheets box is sheetlinkbox.js.
   NOT linked sheets, though they stand here: the sheet's other registrations with systemcore.js, which stood among the link sources
   in sheets.js and came with them, since moving them back would change the joined text (the review of area 3, 2026-11-18). Look here
   for: setTagSource and setTagSink (a map's marks, vehicles fold (c)), setSetOffSink (a change that sets off a placed blast),
   setLaunchSink (what an act launches, things in flight), setGateEngine (Changes apply where), setValueSource and setValueSink
   (shared values, G8) with valuesMoved, and setDeckSource and setDeckSink (decks, G9).
   Why it looks this way: these lines stood in sheets.js, and they still run exactly where they stood. sheets.js calls sheetLink() at
   its line `// [split:sheetlink.js]`, so the body below runs in the old order, after everything above that line and before everything
   below it. The body keeps its lines at the left margin inside the install function, unchanged, so that every test that reads
   sheets.js (through tools/srcjoin.js, which puts these lines back) sees the old file. The first lines import what the body uses of
   sheets.js (live, so a value sheets.js changes later is read as it is then); the last line hands back the names sheets.js uses of it.
   Neither side may assign the other's names (the load menu's _ldPop is set through sheets.js's ldPopSet; tools/splitcheck.js holds
   it). Change the code here as if it still stood in sheets.js. */
// [split:of sheets.js]
import { F, _ldPop, afterCharChange, askEntry, askThen, canOpen, canWrite, charById, charCatOf, charForView, charList, charsOf, closeLoadMenu, crewHost, el, explainTo, getActiveCampaign, input, isClient, ldKey, ldOutside, ldPopSet, linkSet, linkedFrom, myId, net, open, openSheet, opt, renderViews, rowIdOf, select, setCrewSource, setDeckSink, setDeckSource, setGateEngine, setLaunchSink, setLinkCharSource, setLinkSource, setSetOffSink, setTagSink, setTagSource, setValueSink, setValueSource, stationFit, systemOf, toast } from './sheets.js';   // [split:glue]
export function sheetLink() {   // [split:glue]
// [split:body-start]
// [systemcheck:linksrc-start]
// 1.6.0 linked sheets: the sheet a link holds, as systemcore reads it with the system it is handed (setLinkSource). On the GM's machine the
// character itself for the GM's own system (the campaign's, or one cleaned for the GM), and its owner's projection for any other, so the
// figures worked out for a player never read what players may not see; on a player's app their own whole copy (the host sends the rest)
function linkSource(id, sys) {
    var camp = getActiveCampaign(), c = charById(id, camp); if (!c || c.partial) return null;
    if (isClient()) return c;
    if (sys && (sys === camp.system || sys.gmSide === true)) return c;
    return sys && Array.isArray(sys.fields) ? charForView(c, sys, { full: camp.system }) : null;
}
if (typeof setLinkSource === 'function') setLinkSource(linkSource);   // (a suite's slice of this file holds no import)
// 1.6.2: the row a sheet is joined to, for Holder.<w> and Owner.<name>: the character holding it, its list and the row (the first, none kept from its player)
function holderSource(id, sys) { var S = window.wpSystemCore, camp = getActiveCampaign(); if (!S || typeof S.sheetRows !== 'function' || !camp) return null; var h = null; S.sheetRows(sys && Array.isArray(sys.fields) ? sys : camp.system, charsOf(camp)).forEach(function(x) { if (!h && x.r.sh === id) h = x; }); return h ? { id: h.c.id, f: h.f.id, row: rowIdOf(h.r) } : null; }
if (typeof window !== 'undefined' && window.wpSystemCore && typeof window.wpSystemCore.setHolderSource === 'function') window.wpSystemCore.setHolderSource(holderSource);
if (typeof setTagSource === 'function') setTagSource(function(map) { var n = net(); return n && typeof n.tagsOf === 'function' ? n.tagsOf(map) : []; });   // 1.6.2 (vehicles, fold (c)): a map's marks as this screen holds them
if (typeof setTagSink === 'function') setTagSink(function(moves) { var n = net(); if (n && typeof n.tagsPut === 'function') n.tagsPut(moves); });
if (typeof setSetOffSink === 'function') setSetOffSink(function(list) { return typeof window.wpSetOffNear === 'function' ? window.wpSetOffNear(list) : 0; });   // 1.6.2 (the CORE session's batch 6, 10)
if (typeof setLinkCharSource === 'function') setLinkCharSource(function(id) { var cmL = getActiveCampaign(); return cmL && cmL.chars && typeof id === 'string' && Object.prototype.hasOwnProperty.call(cmL.chars, id) ? cmL.chars[id] : null; });   // 1.6.2 (the CORE session's batch 6, 12)
function linkValuesWrite(lv) { var cmW = getActiveCampaign(), n = 0; if (!cmW || !cmW.chars || !lv || typeof lv !== 'object') return 0; Object.keys(lv).forEach(function(id) { var lc = Object.prototype.hasOwnProperty.call(cmW.chars, id) ? cmW.chars[id] : null, vals = lv[id]; if (!lc || !vals || typeof vals !== 'object') return; lc.values = lc.values || {}; Object.keys(vals).forEach(function(fid) { lc.values[fid] = vals[fid]; }); lc.updated = Date.now(); var nt = net(); if (nt && nt.active && nt.role === 'host' && nt.syncCharDelta) nt.syncCharDelta(lc.id, vals); afterCharChange(lc, false, vals); n++; }); return n; }   // 1.6.2 (12): what moved on a linked sheet, written as the GM's own change
if (typeof window !== 'undefined' && window.wpSystemCore && typeof window.wpSystemCore.setMoveSink === 'function') window.wpSystemCore.setMoveSink(function(list) { var n = net(); return n && typeof n.forcedMoves === 'function' ? n.forcedMoves(list) : null; });   // gap 21: a change that moves a token, made on the host (netfight.js)
if (typeof setLaunchSink === 'function') setLaunchSink(function(list) { if (typeof window.wpFlyLaunch === 'function') window.wpFlyLaunch(list); });   // 1.6.2 (vehicles, fold (d)): what an act launches goes on the map, on the host   // ... and kept on the GM's machine as a change put them on
if (typeof setGateEngine === 'function') setGateEngine(F);   // 1.6.0 Changes apply where: the engine the host judges a hidden row's gate with (systemcore unseenMods)
// 1.6.0 (CORE gap 16): a vehicle's crew, every character whose link holds it, each as linkSource hands a linked sheet (the GM's own for the GM's
// system, the owner's projection for any other, so a GM-only figure never counts for a player); on a player's app none (their copy reads the
// figures its host sent)
function crewSource(id, linkId, sys) {
    var camp = getActiveCampaign(); if (!camp || isClient()) return null;
    var cs = charsOf(camp), out = []; Object.keys(cs).forEach(function(cid) { var x = cs[cid]; if (cid === id || !x || x.partial || !x.links || x.links[linkId] !== id) return; var o = linkSource(cid, sys); if (o) out.push(o); });
    return out;
}
if (typeof setCrewSource === 'function') setCrewSource(crewSource);
// 1.6.2 (G8): the shared values of the campaign on screen, and on the machine that owns it where a move lands
if (typeof setValueSource === 'function') setValueSource(function(k) { var c = getActiveCampaign(); return c && c.shared && Object.prototype.hasOwnProperty.call(c.shared, k) ? c.shared[k] : undefined; });
if (typeof setValueSink === 'function') setValueSink(function(moves) { var n = net(); if (n && typeof n.valuesSet === 'function') n.valuesSet(moves); });
// 1.6.2 (G9): a deck's counts, or with whole true its pile, which only the machine that owns the campaign holds
if (typeof setDeckSource === 'function') setDeckSource(function(k, whole) { var c = getActiveCampaign(), DC = window.wpDeckCore; if (!c || !DC) return null; var d = DC.deckOf(c.system && c.system.decks, k) || DC.deckOf(DC.cleanDecks(c.decks, true, /^C[0-9]+$/), k); if (whole === 'def') return d; if (!d) return null; var p = c.piles && Object.prototype.hasOwnProperty.call(c.piles, k) ? DC.cleanPile(c.piles[k], d) : null; if (whole) return p; if (c.pileN && Object.prototype.hasOwnProperty.call(c.pileN, k)) return c.pileN[k]; return DC.pileCounts(p, d); });
if (typeof setDeckSink === 'function') setDeckSink(function(moves) { var n = net(); if (n && typeof n.decksSet === 'function') n.decksSet(moves); });
// 1.6.2 (G8): the GM ticks who shares a sheet. Each whole copy then goes out as any change of the sheet does, and a player taken off it holds a teammate's copy again
function shareToggle(cid, pid) {
    var camp = getActiveCampaign(), c = charById(cid, camp), n = net(); if (isClient() || !c || !c.ownerId || c.npc || c.making === 1 || typeof pid !== 'string' || !pid || pid === c.ownerId) return null;
    var l = Array.isArray(c.shareWith) ? c.shareWith.slice() : [], i = l.indexOf(pid); if (i < 0 && l.length >= 16) { toast('A sheet is shared with 16 players at most.'); return null; } if (i >= 0) l.splice(i, 1); else l.push(pid);
    if (l.length) c.shareWith = l; else delete c.shareWith; afterCharChange(c, true); if (n && typeof n.logEvent === 'function') n.logEvent('char', (i < 0 ? 'Shared ' : 'Stopped sharing ') + c.name); if (typeof window.wpStepLog === 'function') window.wpStepLog('share v1', i < 0 ? 'on' : 'off', { n: l.length }); return i < 0;
}
function valuesMoved() { renderViews(); }   // every view open here, a box being typed in waiting its turn
// The characters whose sheets link this one (a Mount's rider, a vehicle's crew): their sheets read it live, so they redraw with it
function linkRiders(id) { var camp = getActiveCampaign(), sys = systemOf(camp), out = []; if (!sys || !Array.isArray(sys.links) || !sys.links.length) return out; linkedFrom(sys, charsOf(camp), id).forEach(function(g) { g.by.forEach(function(b) { if (out.indexOf(b.id) < 0) out.push(b.id); }); }); var c0 = charById(id, camp); sys.links.forEach(function(k) { var v = k && (k.kind === 'crew' || k.kind === 'mount') && k.group && c0 && c0.links ? c0.links[k.id] : ''; if (typeof v === 'string' && v && out.indexOf(v) < 0) out.push(v); }); return out; }   // 1.6.0 (CORE gap 16): and the vehicle a crew sheet crews, where it reads its crew
// [systemcheck:linksrc-end]
// [systemcheck:linkbar-start]
// 1.6.0 linked sheets ("A menu on the sheet"): under the head, one row a link of the system: its name, a menu of characters, and Open for the
// sheet it holds. The GM's menu lists every character; a player's lists their own, where the link's Who edits gives it to them or the
// character is open to them. A player sees a link the host sent them by its name alone. Then who links to this sheet: a Mount's rider, a
// vehicle's crew. Nothing at all where the system has no links
function linkBar(box, sys, c, camp, locked) {
    box.textContent = '';
    var ks = sys && Array.isArray(sys.links) ? sys.links : []; if (!ks.length || !c) return false;
    var gm = !isClient(), own = !!(c.ownerId && c.ownerId === myId()), n = 0;
    ks.forEach(function(k) {
        var cur = c.links && typeof c.links[k.id] === 'string' ? c.links[k.id] : '', lkF = c.lk && c.lk[k.id] ? c.lk[k.id] : null, tgt = cur ? charById(cur, camp) : null;
        var tName = tgt && !tgt.partial ? tgt.name : lkF && lkF.id === cur ? lkF.name : ''; if (!tName) cur = '';   // a link to a character not here reads as none
        var may = !locked && !c.partial && (gm ? canWrite() : (isClient() && own && (k.edit === 'owner' || c.making === 1 || c.unlocked === 1)));
        if (!cur && !may) return;
        var row = el('div', 'sheet-lk'); row.appendChild(el('span', 'sheet-lk-name', k.label));
        if (k.explain && typeof explainTo === 'function') explainTo(row, k.explain, c);   // 1.6.2 (backlog 218 fold 3)
        if (may) {
            var s = el('select', 'field sheet-select sheet-lk-pick'), list = charList(camp).filter(function(x) { return x.id !== c.id && !x.partial && (gm || x.ownerId === myId()); });
            s.title = k.kind === 'mount' ? 'The mount this character rides. The sheet reads the mount\u2019s figures while it is picked' : 'The vehicle this character crews. The sheet reads the vehicle\u2019s figures while it is picked';   // 1.6.2: in words, never a short name
            s.appendChild(opt('', 'None', !cur));
            if (cur && !list.some(function(x) { return x.id === cur; })) s.appendChild(opt(cur, tName, true));
            list.forEach(function(x) { s.appendChild(opt(x.id, x.name, x.id === cur)); });
            s.addEventListener('change', function() { setLink(c.id, k.id, s.value); });
            row.appendChild(s);
        } else row.appendChild(el('span', 'sheet-lk-to', tName));
        var stHeld = cur && c.stn ? (Array.isArray(c.stn[k.id]) ? c.stn[k.id].filter(function(x) { return typeof x === 'string'; }) : typeof c.stn[k.id] === 'string' ? [c.stn[k.id]] : []) : [];   // 1.6.0 (CORE gap 16): its stations on the vehicle
        if (cur && k.kind === 'crew' && Array.isArray(k.stations) && k.stations.length) {
            var stMost = typeof k.most === 'number' ? k.most : 1, slots = Math.max(1, Math.min(stMost, stHeld.length + (stHeld.length && stHeld.length < stMost ? 1 : 0)));
            if (may) for (var si = 0; si < slots; si++) (function(i) {
                var ss = el('select', 'field sheet-select sheet-lk-stn'); ss.title = i ? 'A second station this character covers at once. The vehicle reads them at both, and their sheet reads ' + k.key + '.stations as how many they hold' : 'Where this character crews it. The vehicle\u2019s formulas read each station\u2019s crew, such as ' + (k.group || 'Crew') + '.' + k.stations[0] + '.max.<name>';
                ss.appendChild(opt('', i ? 'No other station' : 'No station', !stHeld[i])); k.stations.forEach(function(st0) { if (st0 === stHeld[i] || stHeld.indexOf(st0) < 0) { var o0 = opt(st0, st0, st0 === stHeld[i]), fw0 = typeof stationFit === 'function' ? stationFit(sys, k, st0, c, F()) : ''; if (fw0) { o0.textContent = st0 + ' (does not fit)'; o0.title = fw0; if (!gm && st0 !== stHeld[i]) o0.disabled = true; } ss.appendChild(o0); } });   /* 1.6.2 (218): who may sit there */
                ss.addEventListener('change', function() { var nx = stHeld.slice(); if (ss.value) nx[i] = ss.value; else nx.splice(i, 1); nx = nx.filter(function(x, j) { return x && nx.indexOf(x) === j; }); setLink(c.id, k.id, cur, nx.length > 1 ? nx : (nx[0] || '')); });
                row.appendChild(ss);
            })(si);
            else if (stHeld.length) row.appendChild(el('span', 'sheet-lk-to sheet-lk-stnto', stHeld.join(' & ')));
        }
        if (cur && canOpen(cur)) { var ob = el('button', 'tool ghost sheet-lk-open', 'Open'); ob.title = 'Open ' + tName + '\u2019s sheet'; ob.addEventListener('click', function() { openSheet(cur); }); row.appendChild(ob); }
        box.appendChild(row); n++;
        var crL = cur && own && isClient() && !c.partial && c.cr && Array.isArray(c.cr[k.id]) ? c.cr[k.id] : null;   // 1.6.0 Its crew may press this sheet's rolls: the host's list, each press judged there
        if (crL && crL.length) {
            var crB = el('div', 'sheet-lk-rolls');
            crL.forEach(function(e0) { var bR = el('button', 'tool ghost sheet-lk-roll', e0.label); bR.title = 'Roll ' + e0.label + ' on ' + tName + ' as ' + (c.name || 'this character'); bR.addEventListener('click', function() { var oC = { by: c.id, act: e0.act || undefined, row: e0.f ? { f: e0.f, r: e0.r, i: e0.i } : undefined, source: 'sheet' }, goC = function(ans) { if (window.wpDice) window.wpDice.rollFor(cur, e0.expr, e0.label, ans ? Object.assign({}, oC, { ask: ans }) : oC); }, enC = typeof askEntry === 'function' ? askEntry(oC, null) : null; if (enC) askThen(enC, c, bR, oC, null, goC); else goC(); }); crB.appendChild(bR); });   // 1.6.2: what it asks first
            box.appendChild(crB);
        }
    });
    linkedFrom(sys, charsOf(camp), c.id).forEach(function(g) {
        var same = ks.filter(function(x) { return x.kind === g.link.kind; }).length > 1, word = g.link.kind === 'mount' ? 'Rider' : 'Crew';
        var row = el('div', 'sheet-lk sheet-lk-from'); row.appendChild(el('span', 'sheet-lk-name', same ? g.link.label + ' ' + word.toLowerCase() : word));
        g.by.forEach(function(b) { var bN = b.name + (b.stn ? ' \u00b7 ' + (Array.isArray(b.stn) ? b.stn.join(' & ') : b.stn) : ''); if (canOpen(b.id)) { var bb = el('button', 'tool ghost sheet-lk-by', bN); bb.title = 'Open ' + b.name + '\u2019s sheet'; bb.addEventListener('click', function() { openSheet(b.id); }); row.appendChild(bb); } else row.appendChild(el('span', 'sheet-lk-to', bN)); });   // 1.6.0 (CORE gap 16): with its station
        box.appendChild(row); n++;
    });
    ks.forEach(function(k) {   // 1.6.2 (218; the owner, by prompt: "A tick on the link"): a sheet the link crews shows + Crew…, to pick who sits where from your own sheets
        if (locked || c.partial || k.kind !== 'crew' || !Array.isArray(k.stations) || !k.stations.length || typeof crewHost !== 'function' || !crewHost(sys, k, c, F())) return;
        if (!(gm ? canWrite() : (isClient() && k.edit === 'owner'))) return;
        var row = el('div', 'sheet-lk sheet-lk-addrow'), b = el('button', 'tool ghost sheet-lk-add', '+ Crew\u2026'); b.title = 'Pick who crews ' + (c.name || 'this sheet') + ' from ' + (gm ? 'the campaign\u2019s sheets' : 'your own sheets') + ', and where they sit';
        b.addEventListener('click', function() { crewAddPick(b, sys, k, c, getActiveCampaign()); }); row.appendChild(b); box.appendChild(row); n++;
    });
    return n > 0;
}
// 1.6.2 (218, fold 2): a sheet filed in a category of the Characters list ('' back to its rules, '-' in none): the GM's own hand here, a
// player's own sheet through the host
function charCatSet(cid, cat) {
    var camp = getActiveCampaign(), c = charById(cid, camp); if (!c) return;
    if (isClient()) { var nc = net(), rc = nc && nc.charCat ? nc.charCat(cid, cat, function(a) { if (a && a.reason) toast(a.reason === 'owner' ? 'Only its owner or the GM files that sheet.' : 'That category could not be set.'); }) : { error: 'Not at a table.' }; if (rc && rc.error) toast(rc.error); return; }
    if (!canWrite()) return;
    if (cat) c.cat = cat; else delete c.cat;
    if (window.wpStepLog) window.wpStepLog('charcat v1', 'set', { cat: cat ? 1 : 0 });
    afterCharChange(c, true);
    if (window.wpCharList && window.wpCharList.sync) window.wpCharList.sync();
}
function charCatNow(c) { var camp = getActiveCampaign(), sys = systemOf(camp); return sys && c ? charCatOf(sys, c, F()) : ''; }
// [systemcheck:crewpick-start]
// 1.6.2 (218): the vehicle's + Crew… menu: a station, then the sheets that may sit there, each by its name; Show all lists the rest, each saying why
// not in the system's own words, grayed for a player (the host refuses it) and pressable for the GM (who is told). A pick links that sheet to this one
// at that station, judged as any link is. On the page as the Load menu is: its class, its Escape, a press elsewhere closing it
function crewCandidates(sys, k, c, camp, st, all) {
    var gm = !isClient(), out = [];
    charList(camp).forEach(function(x) {
        if (!x || x.id === c.id || x.partial || (!gm && x.ownerId !== myId())) return;
        var ch = charById(x.id, camp); if (!ch || ch.partial || (ch.links && ch.links[k.id] === c.id)) return;
        var why = typeof stationFit === 'function' ? stationFit(sys, k, st, ch, F()) : '';
        if (why && !all) return;
        out.push({ id: x.id, name: x.name || 'A character', why: why });
    });
    return out;
}
function crewAddPick(anchor, sys, k, c, camp) {
    if (_ldPop) closeLoadMenu();
    var pop = el('div', 'sheet-dl-pop sheet-crew-pop'); pop.setAttribute('role', 'menu'); pop.setAttribute('aria-label', 'Who crews it'); pop._anchor = anchor;
    var st = k.stations[0], all = false, head = el('div', 'sheet-crew-head'), sel = el('select', 'field sheet-select sheet-crew-stn'), lab = el('label', 'sheet-crew-all'), cb = el('input'), list = el('div', 'sheet-crew-list');
    sel.setAttribute('aria-label', 'Where they sit'); k.stations.forEach(function(s) { sel.appendChild(opt(s, s, s === st)); });
    cb.type = 'checkbox'; lab.appendChild(cb); lab.appendChild(document.createTextNode(' Show all')); lab.title = 'Also list the sheets that do not fit this station, each saying why';
    head.appendChild(sel); head.appendChild(lab); pop.appendChild(head); pop.appendChild(list);
    var draw = function() {
        list.textContent = '';
        var got = crewCandidates(sys, k, c, camp, st, all);
        got.forEach(function(o) {
            var b = el('button', 'sheet-dl-item' + (o.why ? ' sheet-crew-nofit' : '')); b.type = 'button'; b.setAttribute('role', 'menuitem');
            b.appendChild(el('span', 'sheet-dl-t', o.name)); b.appendChild(el('span', 'sheet-dl-s', o.why || ('Sits at ' + st)));
            if (o.why && isClient()) b.disabled = true;
            b.addEventListener('click', function(e) { e.preventDefault(); closeLoadMenu(); setLink(o.id, k.id, c.id, st); });
            list.appendChild(b);
        });
        if (!got.length) list.appendChild(el('div', 'sheet-dl-note', all ? 'No other sheet to add.' : 'None of ' + (isClient() ? 'your' : 'the') + ' sheets fit ' + st + '. Tick Show all to see why.'));
    };
    sel.addEventListener('change', function() { st = sel.value; draw(); }); cb.addEventListener('change', function() { all = cb.checked; draw(); });
    pop.addEventListener('mousedown', function(e) { e.stopPropagation(); });
    pop.addEventListener('keydown', function(e) { e.stopPropagation(); });
    draw();
    document.body.appendChild(pop); ldPopSet(pop);
    // 1.6.4 window bar: kept below the strip the desktop app draws at the window's top (wpWinBarH, 0 in a browser)
    var r = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 8, bottom: 8 }; pop.style.left = Math.max(8, Math.min(window.innerWidth - 288, r.left)) + 'px'; pop.style.top = Math.max(8 + (window.wpWinBarH ? window.wpWinBarH() : 0), Math.min(window.innerHeight - 320, r.bottom + 4)) + 'px';
    document.addEventListener('mousedown', ldOutside, true); document.addEventListener('keydown', ldKey, true);
    try { sel.focus(); } catch (er) {}
}
// [systemcheck:crewpick-end]
// A link set from the menu: the GM's own, judged by systemcore linkSet as the host judges a player's, then saved and sent whole; a player's
// asks the host (net.charLink) and changes nothing here until it answers
function setLink(cid, linkId, to, stn) {   // stn (1.6.0, CORE gap 16): a station picked ('' none), or the stations; none given: kept
    var camp = getActiveCampaign(), sys = systemOf(camp), c = charById(cid, camp); if (!c || !sys) return;
    var lg = function(step, facts) { if (window.wpStepLog) window.wpStepLog('links v1', step, facts); };
    if (isClient()) { var nc = net(), rc = nc && nc.charLink ? nc.charLink(cid, linkId, to, stn) : { error: 'Not at a table.' }; lg('sent', { on: to ? 1 : 0, ok: !(rc && rc.error) }); if (rc && rc.error) { toast(rc.error); renderViews(cid); } return; }
    if (!canWrite()) return;
    var was = c.links && typeof c.links[linkId] === 'string' ? c.links[linkId] : '', res = linkSet(sys, charsOf(camp), c, linkId, to, stn !== undefined ? { stn: stn, F: F() } : { F: F() });
    if (!res.ok) { lg('refused', { reason: res.reason }); toast(res.msg || 'That link is not allowed.'); renderViews(cid); return; }
    if (res.links) c.links = res.links; else delete c.links;
    if (res.stn) c.stn = res.stn; else delete c.stn;   // 1.6.0 (CORE gap 16)
    if (res.seatSays) { toast(res.seatSays + ' Your own link goes through all the same.'); lg('seats', { over: 1 }); }
    if (res.fitSays) { toast(res.fitSays + ' Your own link goes through all the same.'); lg('fit', { over: 1 }); }   // 1.6.2 (218)   // 1.6.2 (205): past a station's seats, the GM's own hand goes through and is told
    lg('done', { on: to ? 1 : 0 });
    afterCharChange(c, true);
    [was, to].forEach(function(id) { if (id && id !== cid) renderViews(id); });   // the linked sheets' Rider and Crew rows
}
// [systemcheck:linkbar-end]
// [split:body-end]
return { charCatNow: charCatNow, charCatSet: charCatSet, linkBar: linkBar, linkRiders: linkRiders, linkValuesWrite: linkValuesWrite, shareToggle: shareToggle, valuesMoved: valuesMoved };   // [split:glue]
}   // [split:glue]
