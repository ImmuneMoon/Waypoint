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
    var out = { camp: s1 >= 0 ? a.slice(0, s1) : '', head: s1 >= 0 ? a.slice(0, s1 + 1) : '', item: item, rest: rest, land: land };
    if (!land && tail.indexOf('part:') === 0 && /^[A-Za-z0-9_-]{1,64}$/.test(tail.slice(5))) out.part = tail.slice(5);   // 1.6.2: a part of the page shown alone (popPart)
    return out;
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
// 1.6.2 (docs/PLANNER_ORG_DESIGN.md 6.1): a part of a page shown alone in its window. The block of that id: a heading with what stands under
// it, down to the next heading of its level or a higher one (as a fold reads a section), and any other block by itself. { blocks, name },
// or null where the page holds no such block. Of two blocks of a file that share an id the first is the part. The name is the block's
// title as words: its typed tags left out and the few entities a title may hold read once
function popPart(it, id) {
    var bl = it && Array.isArray(it.blocks) ? it.blocks : [], at = -1, i;
    if (typeof id !== 'string' || !id) return null;
    for (i = 0; i < bl.length && at < 0; i++) if (bl[i] && typeof bl[i] === 'object' && bl[i].id === id) at = i;
    if (at < 0) return null;
    // a Raw HTML block that opens with a heading is drawn, folded and listed as that heading, so it is one here too
    // The page reads a drawn block's first ELEMENT, so words and comments before the heading are passed over here too, and so is a "<" that opens
    // no tag (a < b, 2 <3, x<=y: a browser reads one as a word unless a letter, a /, a ! or a ? follows it). [tag, level, its words]
    var rawH = function(b) {
        if (b.type !== 'raw' || typeof b.content !== 'string') return null;
        var c = b.content.slice(0, 1200).replace(/^(?:[^<]|<!--[\s\S]*?-->|<(?![a-zA-Z\/!?]))*/, ''), m = /^<h([123])(?:\s[^<>]*)?>/i.exec(c); if (!m) return null;
        var rest = c.slice(m[0].length), end = rest.search(new RegExp('</h' + m[1] + '\\s*>', 'i'));
        return [m[0], m[1], end >= 0 ? rest.slice(0, end) : rest.slice(0, 300)];
    };
    var lv = function(b) { if (!b || typeof b !== 'object' || typeof b.type !== 'string') return 0; var m = /^h([123])$/.exec(b.type) || rawH(b); return m ? +m[1] : 0; }, mine = lv(bl[at]), end = at + 1;
    if (mine) while (end < bl.length && !(lv(bl[end]) && lv(bl[end]) <= mine)) end++;
    var raw0 = rawH(bl[at]), t = typeof bl[at].title === 'string' ? bl[at].title.slice(0, 2000) : raw0 ? raw0[2] : '', ent = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
    t = t.replace(/<\/?[a-zA-Z!?][^<>]*>/g, '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, function(all, k) { return ent[k]; }).replace(/\s+/g, ' ').trim();
    return { blocks: bl.slice(at, end), name: Array.from(t).slice(0, 80).join('') };
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
        + (kind === 'doc' && pp.part ? '<button id="popoutWhole" type="button" title="Show the whole page in this window, at this part">Whole page</button>' : '')
        + '<button id="popoutDock" title="Put this back into a floating panel in the main window">⤡ Dock back in the app</button></div>'
        + '<div id="popoutBody"></div>';
    document.body.appendChild(wrap);
    var body = wrap.querySelector('#popoutBody');
    var titleEl = wrap.querySelector('#popoutTitle');
    var wholeBtn = document.getElementById('popoutWhole');   // 1.6.2: a part's window shows the whole page at that part when asked (popGo), and is then a page's window
    if (wholeBtn) wholeBtn.addEventListener('click', function() { var at = pp.part; if (at) popGo(itemNow, { at: at }); });

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
        if (!it || (it.type !== 'doc' && it.type !== 'planner')) { window.wpPopoutPart = ''; window.wpPopoutFoldKey = ''; }   // a page that is gone shows no part
        if (!it || (it.type !== 'doc' && it.type !== 'planner')) { if (lastSig !== ' GONE') { lastSig = ' GONE'; msg('This page is no longer in the campaign.'); document.title = 'Waypoint — (removed)'; } return; }
        var title = (it.meta && it.meta.title) || it.name || 'Page';
        // 1.6.2: a part alone is the page with that part's blocks and nothing else, drawn by the page's own renderers, so it follows its edits
        var partId = itemId === pp.item && typeof pp.part === 'string' ? pp.part : '';   // a page whose own id ends as a part's address would is that page, whole
        var part = partId ? popPart(it, partId) : null, shown = part && part.name ? title + ' \u203a ' + part.name : title;
        if (wholeBtn) wholeBtn.style.display = partId ? '' : 'none';
        window.wpPopoutPart = part ? partId : '';   // what pagenav.js reads: the part a place's history names, and the key the part's own folds are kept under
        window.wpPopoutFoldKey = part ? pp.head + itemId + '/part:' + partId : '';
        if (partId && !part) { if (lastSig !== '\x00NOPART') { lastSig = '\x00NOPART'; msg('This part is no longer on the page. Whole page shows what is there now.'); document.title = 'Waypoint \u2014 ' + title; if (titleEl) titleEl.textContent = title; } return; }
        if (part) it = Object.assign({}, it, { blocks: part.blocks });
        var sig = (part ? 'part' : '') + title + ' ' + JSON.stringify(it.blocks || []) + ' ' + JSON.stringify((it.meta && it.meta.style) || null) + ' ' + JSON.stringify(camp.docStyle || null);
        if (sig === lastSig) return; lastSig = sig;
        document.title = 'Waypoint — ' + shown; if (titleEl) titleEl.textContent = shown;
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
    // [textcheck:popgo-start]
    // 1.5.8: a page link followed in this window opens its page here (pagenav.js histFollow, and Back and Forward): the window shows that page of
    // its campaign from its next drawing, at the top or where the link lands, its folds and Dock back following it; the landing is cleaned by
    // pagenav.js. The window keeps its address and its name: docpanel.js popOut alone writes a window's address. Answers whether it was taken
    function popGo(id, land, part) {
        if (kind !== 'doc' || typeof id !== 'string' || !id) return false;
        var nav = window.wpPageNav, L = nav && typeof nav.landOf === 'function' ? nav.landOf(land) : null;
        pp = { camp: pp.camp, head: pp.head, item: id, rest: id, land: L };
        if (!L && typeof part === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(part)) pp.part = part;   // 1.6.2: Back to a part this window showed (pagenav.js histStep)
        window.wpPopoutPart = pp.part || '';   // said at once, with the page: the history reads both before the next drawing (the fold key waits for that drawing, which it belongs to)
        itemNow = id; window.wpPopoutKey = pp.head + id; landed = false; lastSig = ''; landPend = null; body.scrollTop = 0;
        if (finder && findBox.value) { findBox.value = ''; finder.clear(); }
        tick();
        return true;
    }
    window.wpPopoutGo = popGo;
    // [textcheck:popgo-end]
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
