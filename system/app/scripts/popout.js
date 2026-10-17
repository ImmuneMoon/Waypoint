/* Pop-out window — Waypoint opened with ?popout=<kind>:<arg>.
   An in-app floating panel (a handbook/planner in #docPanel, a character sheet in #sheetPanel) can be
   "popped out" into this full window (e.g. onto a second monitor); a "dock back" button here returns it
   to the in-app floating panel in the opener. Read-only + live (polls the local save), like the Stream
   window; nothing here ever writes the save (io.js no-ops save while window.wpPopout is set).
     kind 'doc'   → arg = "<campId>/<itemId>"   (a planner or handbook page, rendered via docrender.js)
     kind 'sheet' → arg = "<charId>"            (a character sheet, rendered read-only via wpSheets)  */
import { state } from './state.js';

// [textcheck:popland-start]
// 1.5.4: a page's window is told where to land in its own address, after the item (docs/PLANNER_ORG_DESIGN.md 4.1): <campaign>/<item>/at:<block
// id> or <campaign>/<item>/q:<words>, each part encoded by docpanel.js popOut and read here as the browser decoded it. The campaign runs to its
// slash, the item to the next one, and after it a landing begins with at: or q: (words run to the end, slashes and all). Anything else after
// the item is no landing. pagenav.js (wpPageNav.landOf) cleans the landing where it is used. head is what stands before the item
function popPlace(a) {
    a = typeof a === 'string' ? a : '';
    var s1 = a.indexOf('/'), rest = s1 >= 0 ? a.slice(s1 + 1) : a, s2 = rest.indexOf('/'), item = s2 >= 0 ? rest.slice(0, s2) : rest, tail = s2 >= 0 ? rest.slice(s2 + 1) : '';
    var land = tail.indexOf('at:') === 0 ? { at: tail.slice(3) } : tail.indexOf('q:') === 0 ? { q: tail.slice(2) } : null;
    return { camp: s1 >= 0 ? a.slice(0, s1) : '', head: s1 >= 0 ? a.slice(0, s1 + 1) : '', item: item, rest: rest, land: land };
}
// the page the window shows: the item its address names; where that is no page of the campaign, the address names no landing and the whole of
// what follows the campaign is a page (an id with a slash in it, as an address made before 1.5.4 was read), that page
function popItem(pl, items) {
    var page = function(id) { var it = items && typeof items === 'object' && Object.prototype.hasOwnProperty.call(items, id) ? items[id] : null; return !!it && typeof it === 'object' && (it.type === 'doc' || it.type === 'planner'); };
    return !pl.land && pl.rest !== pl.item && !page(pl.item) && page(pl.rest) ? pl.rest : pl.item;
}
// a page opened at its landing once it is drawn: words go into the window's own Find, which marks them and goes to the first (finder: a
// wpDocPanel.finder of the window's page); a block, and words where there is no Find, are landed on by wpPageNav.land. again: the landing made
// once more after the page's charts were drawn, with the words the Find holds and nothing lit twice
function popLandNow(pl, nav, body, it, finder, box, again) {
    var L = nav && typeof nav.landOf === 'function' ? nav.landOf(pl.land) : null; if (!L) return false;
    if (L.q && finder) { if (!again && box) box.value = L.q; return finder.land(again ? finder.words() : L.q, again); }
    return typeof nav.land === 'function' ? nav.land(body, it, L, again) : false;
}
// [textcheck:popland-end]

const spec = new URLSearchParams(location.search).get('popout');
if (spec) {
    window.wpPopout = true;
    document.body.classList.add('popout-mode');
    var colon = spec.indexOf(':');
    var kind = colon >= 0 ? spec.slice(0, colon) : spec;
    var arg = colon >= 0 ? spec.slice(colon + 1) : '';
    var pp = popPlace(arg), itemNow = pp.item;   // 1.5.4: the campaign, the page and where it lands, read apart
    if (kind === 'doc') window.wpPopoutKey = pp.head + pp.item;   // pagenav.js keeps the page's folds under it, as every other place keeps them
    var dockArg = function() { return kind === 'doc' ? pp.head + itemNow : arg; };   // what the main window is handed back: never the landing

    var wrap = document.createElement('div');
    wrap.id = 'popoutWrap';
    wrap.innerHTML = '<div id="popoutBar"><span id="popoutTitle"></span>'
        + (kind === 'doc' ? '<span id="popoutFindRow"><input id="popoutFind" type="text" placeholder="Find on this page&hellip;" autocomplete="off" spellcheck="false" title="Find words on this page. Enter goes to the next match and Shift+Enter to the one before. Esc clears. Ctrl+F takes you here.">'
            + '<span id="popoutFindCount" class="docpanel-count"></span><button id="popoutFindPrev" type="button" aria-label="Previous match" title="Previous match (Shift+Enter)">&#9650;</button><button id="popoutFindNext" type="button" aria-label="Next match" title="Next match (Enter)">&#9660;</button></span>' : '')
        + '<button id="popoutDock" title="Put this back into a floating panel in the main window">⤡ Dock back in the app</button></div>'
        + '<div id="popoutBody"></div>';
    document.body.appendChild(wrap);
    var body = wrap.querySelector('#popoutBody');
    var titleEl = wrap.querySelector('#popoutTitle');

    // 1.5.4: a page's window has a Find of its own: wpDocPanel's highlighter on this window's page, kept through the page's redraws. Enter and
    // Shift+Enter go to the next and the previous match, Esc clears it, Ctrl+F (Cmd+F) takes the box
    // [textcheck:popfind-start]
    var findBox = document.getElementById('popoutFind'), findCnt = document.getElementById('popoutFindCount'), finder = null, findT = null;
    if (findBox && window.wpDocPanel && typeof window.wpDocPanel.finder === 'function') {
        finder = window.wpDocPanel.finder(function() { return body; }, function() { return findCnt; });
        findBox.addEventListener('input', function() { clearTimeout(findT); findT = setTimeout(function() { finder.find(findBox.value, true); }, 130); });
        findBox.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); clearTimeout(findT); if (finder.words() !== findBox.value) finder.find(findBox.value, true); else finder.step(e.shiftKey ? -1 : 1); }
            else if (e.key === 'Escape' && findBox.value) { e.preventDefault(); clearTimeout(findT); findBox.value = ''; finder.clear(); }
        });
        document.getElementById('popoutFindNext').addEventListener('click', function() { finder.step(1); });
        document.getElementById('popoutFindPrev').addEventListener('click', function() { finder.step(-1); });
        document.addEventListener('keydown', function(e) { if ((e.ctrlKey || e.metaKey) && !e.altKey && String(e.key).toLowerCase() === 'f') { e.preventDefault(); e.stopPropagation(); findBox.focus(); findBox.select(); } }, true);
    } else if (findBox) findBox.parentNode.style.display = 'none';
    // [textcheck:popfind-end]
    // [textcheck:popcharted-start]
    var landed = false, landPend = null, drawGen = 0;   // the landing is made once, at the first drawing that holds the page; then once more when its charts are drawn
    var popHand = kind === 'doc' && window.wpDocPanel && typeof window.wpDocPanel.hand === 'function' ? window.wpDocPanel.hand(body) : null;   // the reader's own input on the page (docpanel.js readerHand)
    function charted(gen, it) {
        if (finder && findBox.value.trim()) finder.find(findBox.value);   // a chart's labels are searched once it is drawn; a landing keeps the focus in its block (hlFinder)
        var p = landPend; if (!p || p.gen !== gen) return; landPend = null;
        if (!(popHand && popHand.since(p.hand))) popLandNow(pp, window.wpPageNav, body, it, finder, findBox, true);   // never against the reader's own hand: judged by their input on the page, never by scrollTop, which the browser moves itself when a chart above is drawn
    }
    // [textcheck:popcharted-end]

    // Dock back: reopen the matching in-app panel in the opener, then close this window.
    document.getElementById('popoutDock').addEventListener('click', function() {
        try {
            var op = window.opener;
            if (op && !op.closed) {
                if (kind === 'doc' && op.wpDocPanel) op.wpDocPanel.open(itemNow);
                else if (kind === 'sheet' && op.wpSheets) op.wpSheets.openSheet(arg.slice(arg.indexOf('/') + 1));
                else if (kind === 'chat' && op.wpChat) op.wpChat.openPanel();
                op.focus();
            }
        } catch (e) {}
        try { new BroadcastChannel('waypoint').postMessage({ type: 'dock', kind: kind, arg: dockArg() }); } catch (e) {}   // fallback: reaches the main window even if the opener is gone
        window.close();
        // If this window can't self-close (it wasn't script-opened — e.g. an in-app browser that reused the tab),
        // return to the app instead of leaving the pop-out stuck, reopening the panel there.
        setTimeout(function() { if (!window.closed) location.href = location.origin + '/?reopen=' + encodeURIComponent(kind + (arg ? '|' + dockArg() : '')); }, 200);
    });

    var mmMode = '';
    function setMermaidStrict() { if (!window.mermaid || !window.wpMermaidConfig || mmMode === 'strict') return; try { window.mermaid.initialize(Object.assign({}, window.wpMermaidConfig, { securityLevel: 'strict' })); mmMode = 'strict'; } catch (e) {} }
    function msg(t) { body.innerHTML = '<div class="popout-msg">' + t + '</div>'; }

    var lastSig = '';
    function tickDoc(data) {
        var campId = pp.camp;
        var camp = (campId && data.campaigns[campId]) || (data.activeCampaignId && data.campaigns[data.activeCampaignId]) || data.campaigns[Object.keys(data.campaigns)[0]];
        if (!camp) return;
        body.classList.add('doc-view');
        var itemId = itemNow = popItem(pp, camp.items); window.wpPopoutKey = pp.head + itemId;
        var it = camp.items && camp.items[itemId];
        if (!it || (it.type !== 'doc' && it.type !== 'planner')) { if (lastSig !== ' GONE') { lastSig = ' GONE'; msg('This page is no longer in the campaign.'); document.title = 'Waypoint — (removed)'; } return; }
        var title = (it.meta && it.meta.title) || it.name || 'Page';
        var sig = title + ' ' + JSON.stringify(it.blocks || []) + ' ' + JSON.stringify((it.meta && it.meta.style) || null) + ' ' + JSON.stringify(camp.docStyle || null);
        if (sig === lastSig) return; lastSig = sig;
        document.title = 'Waypoint — ' + title; if (titleEl) titleEl.textContent = title;
        var DR = window.wpDocRender; if (!DR || !DR.renderDoc) return;
        setMermaidStrict();
        var keep = body.scrollTop;
        var ph = it.type === 'planner' && typeof window.wpPlannerRead === 'function' ? window.wpPlannerRead(it, camp, '<div class="popout-msg">This planner has no content yet.</div>') : null;   // 1.5.4: a planner by its own renderer (a node table and a Raw HTML block are a planner's alone)
        if (typeof ph === 'string') body.innerHTML = ph;
        else body.innerHTML = DR.renderDoc(it, { mermaid: !!window.mermaid, docStyle: camp.docStyle, empty: '<div class="popout-msg">This page has no content yet.</div>' });
        body.scrollTop = keep;
        var gen = ++drawGen; landPend = null;
        if (finder && findBox.value.trim()) finder.find(findBox.value);   // the window's own Find kept through a redraw, with the page where it was
        if (!landed && itemId === pp.item) { landed = true; popLandNow(pp, window.wpPageNav, body, it, finder, findBox, false); landPend = { gen: gen, hand: popHand ? popHand.mark() : null }; }   // 1.5.4: once, at the first drawing that holds the page
        if (window.mermaid) { var nodes = Array.prototype.slice.call(body.querySelectorAll('pre.mermaid')); if (nodes.length) { try { Promise.resolve(window.mermaid.run({ nodes: nodes })).then(function() { if (window.wpFcPostProcess) window.wpFcPostProcess(body, it); }).catch(function() {}).then(function() { charted(gen, it); }).catch(function() {}); } catch (e) {} } }   // 1.5.4 (the review of step 1): a chart the library could not draw stops neither the Find nor the landing (it rejects the whole run for one)
    }
    // [systemcheck:popsheet-start]
    function tickSheet(data) {
        var slash = arg.indexOf('/'), campId = slash >= 0 ? arg.slice(0, slash) : '', charId = slash >= 0 ? arg.slice(slash + 1) : arg;
        var camp = (campId && data.campaigns[campId]) || (data.activeCampaignId && data.campaigns[data.activeCampaignId]) || data.campaigns[Object.keys(data.campaigns)[0]];
        if (!camp) return;
        data.activeCampaignId = camp.id || campId;   // so sheets.js getActiveCampaign() resolves to this campaign
        try { state.appState = data; } catch (e) {}   // the full app is loaded here; wpSheets reads state.appState (raw save — GM content, not sanitised)
        var WS = window.wpSheets; if (!WS || !WS.renderSheetInto) return;
        var c = WS.charById ? WS.charById(charId, camp) : null;
        if (!c) { if (lastSig !== ' NOSHEET') { lastSig = ' NOSHEET'; body.className = ''; msg('That character is no longer here.'); document.title = 'Waypoint — (removed)'; } return; }
        var sig = JSON.stringify(c) + ' ' + JSON.stringify(camp.system || null) + '\n' + (WS.dialSig ? WS.dialSig(charId, camp) : '');   // 1.5.4: and what the sheet reads of its token (its facing, posture and elevation), so a turn, a posture or a height redraws it
        if (sig === lastSig) return; lastSig = sig;
        body.className = 'sheet-view';
        var keep = body.scrollTop;
        var sr = WS.renderSheetInto(body, charId, camp);
        body.scrollTop = keep;
        var title = (sr && sr.title) || (c.name || 'Character');
        document.title = 'Waypoint — ' + title; if (titleEl) titleEl.textContent = title;
    }
    // [systemcheck:popsheet-end]

    async function tick() {
        var data; try { data = await (await fetch('/api/data', { cache: 'no-store' })).json(); } catch (e) { return; }
        if (!data || !data.campaigns || !Object.keys(data.campaigns).length) return;
        if (kind === 'doc') tickDoc(data);
        else if (kind === 'sheet') tickSheet(data);
    }
    if (kind === 'chat') {
        // Chat has no save to poll — it is relayed live from the main window over BroadcastChannel. Reuse #chatPanel.
        document.body.classList.add('popout-chat');
        var cp = document.getElementById('chatPanel'); if (cp) cp.style.display = 'flex';
        document.title = 'Waypoint — Table Chat'; if (titleEl) titleEl.textContent = 'Table Chat';
        var reqBC = null; try { reqBC = new BroadcastChannel('waypoint'); } catch (e) {}
        var reqChat = function() { if (reqBC) try { reqBC.postMessage({ type: 'chatReq' }); } catch (e) {} };
        reqChat(); setTimeout(reqChat, 500); setTimeout(reqChat, 1600);   // ask the main window for the current log (retries if it opened after)
    } else {
        setTimeout(tick, 150);
        setInterval(tick, 1000);
    }
    try { new BroadcastChannel('waypoint').onmessage = function(e) { if (e.data && e.data.type === 'reload') location.reload(); }; } catch (e) {}
}

// Returning to the app from a pop-out that couldn't self-close (?reopen=<kind>|<arg>): reopen that panel here.
(function handleReopen() {
    var reopen = new URLSearchParams(location.search).get('reopen');
    if (!reopen || spec) return;
    var rc = reopen.indexOf('|'), rkind = rc >= 0 ? reopen.slice(0, rc) : reopen, rarg = rc >= 0 ? reopen.slice(rc + 1) : '';
    try { history.replaceState(null, '', location.origin + location.hash); } catch (e) {}   // drop the ?reopen from the URL
    var panelId = rkind === 'doc' ? 'docPanel' : rkind === 'sheet' ? 'sheetPanel' : rkind === 'chat' ? 'chatPanel' : '';
    var isOpen = function() { var p = panelId && document.getElementById(panelId); return !!(p && p.style.display && p.style.display !== 'none'); };
    var reopenItems = function() { try { var s = state.appState, c = s && s.campaigns ? s.campaigns[s.activeCampaignId] : null; return c ? c.items : null; } catch (e) { return null; } };
    var tries = 0;
    (function attempt() {
        try {
            if (rkind === 'doc' && window.wpDocPanel) window.wpDocPanel.open(popItem(popPlace(rarg), reopenItems()));   // 1.5.4: the page alone, whatever follows it
            else if (rkind === 'sheet' && window.wpSheets) window.wpSheets.openSheet(rarg.slice(rarg.indexOf('/') + 1));
            else if (rkind === 'chat' && window.wpChat) window.wpChat.openPanel();
        } catch (e) {}
        if (!isOpen() && tries++ < 40) setTimeout(attempt, 400);   // keep trying while the app boots / the GM enters a campaign (a panel only opens once one is active)
    })();
})();
