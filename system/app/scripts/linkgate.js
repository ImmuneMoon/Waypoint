/* Links (1.5.0) — the one place that decides what a click on a link does, and the one renderer that draws the web addresses of a
   plain text as links.

   A link reaches the page in three ways: the page sanitiser writes one in a planner's or a page's content (docrender.js: a text
   block's typed link, a styled field's), the play map's text boxes keep theirs through net.js, and fillLinked below draws the
   addresses in a plain text the Journal shows. Whoever wrote it, a click on it — the left button, the middle button, Ctrl or Shift
   with either, Enter on it — comes here first: one listener on the document, in the capture phase, for click and auxclick. The main
   window, the stream window and a pop-out window are the same page, so each has it, and it covers whatever a panel draws later.
   A link is any <a> that carries an address — in href, or in xlink:href, where the diagram library puts the address of a link it
   draws (an SVG <a>, which the engine follows like any other).

   What opens:  only an address textfmt.js cleanLink keeps (the page sanitiser's own rule for an <a href>) that the URL parser reads
                as http or https. Anything else under an <a href> opens nothing at all — the second check, at the click.
   Never:       a link inside a box that is being edited (a text block's box, a play-map text box): there a click places the caret. And a
                link that has just been dragged: a flowchart node with a link is moved and resized in the planner's preview, and the click
                that ends that gesture is no click on the link (planner.js marks the link while it is on its way: data-held).
   Directly:    the app's own words (Help, About, Settings); what the Journal says is yours in the handout viewer (your own note,
                your own handout's preview); a planner or a page where it is drawn to be read (the preview, the reader, the floating
                panel, a pop-out) while this app is not a player at someone's table.
   Asked first: everything else — a page or a handout on a player's screen, a Journal entry that was received (a GM's handout, a
                player's share; on the GM's machine too, and later with no session), and anything whose author the code cannot tell
                (a pop-out whose main window is gone, the stream window, a link anywhere this list does not name). The question is
                the app's own (dialogs.js showConfirm, never answered by Enter, and by its OK only on a single press once it has been
                up a moment — the second click of a double-click on the link lands where OK appears), its words text nodes: who it came from where that is
                known, the site as the URL parser gives it (a look-alike name written in another alphabet shows in its xn-- form; a
                name in front of an @ is not the site), then the whole address as the parser reads it — plain characters only, so
                nothing in an address can make that line read differently from where it leads. One question at a time.
   How:         window.open(address, '_blank', 'noopener,noreferrer') — in the shell that is handed to the system browser by the
                window rules (shellguard.js webLinkOk), in a browser it is a new tab. The engine's own following is always stopped.
   A file the app itself hands over to be saved (an <a download> to a blob: or data: address, clicked by the app) is left alone.
   A script's window.open never steers the window it is made from (openGuard): the diagram library binds a click on a Gantt chart's task
                to window.open(address, '_self') whatever its mode — and it finds the task by its id on the whole page, so the click it
                binds can land on an element of the app's own that shares that id. The target is made into a string once, as the engine
                would, and that string is judged and passed on: one that names this window — _self, _parent, _top, _unfencedTop or any
                other of the engine's own names that begin with _ (in any case, with spaces round it), all but _blank, or the window's own
                name — opens nothing; every other call (a new window, a pop-out) goes through as it was made.
   A drag:      a link is dragged only where a click on it opens it directly. Anywhere else the drag does not begin (a second listener,
                for dragstart): a dragged address dropped on another of the app's windows would be followed there with no question.

   Before:      while the pointer or the keyboard's focus rests on a link that would open or ask, its whole address stands in a strip at the
                window's bottom left, as a browser shows one (the linkpeek slice below).

   linkVerdict(c) is the rule as a pure function, linkWhere(a, win) reads where a link is, fillLinked(el, text, doc) is the renderer
   (elements and text nodes only). tools/sinkcheck.js runs all of it by the markers below.

   A text with a LOOK, where it is read (item 35): fillRuns(el, text, rec, doc, opts), published as window.wpTextRead.fill, so that a
   module that may not name this one (net.js) can reach it. The look is a record of lookcore.js: it names its text, and is cleaned here by
   the rule of the place. A text that may be someone else's is drawn with opts.ask, and then every link in it asks, wherever it stands. */
import { cleanLink, linkParts } from './textfmt.js';
import { showConfirm } from './dialogs.js';
import { runsOf, SIZE_EM, fontCss } from './textfmt.js';
import { cleanRec, ruleLinks } from './lookcore.js';
import { pageLink, mentionLink } from './textfmt.js';   // 1.5.6: a link to a page of the campaign; 1.6.2, a mention

// [sinkcheck:linkgate-start]
var LINK_TARGET = '_blank', LINK_REL = 'noopener noreferrer';   // what the page sanitiser writes on every link (docrender.js aAttrs)
var LINK_ASK = 'Open this link in your web browser?';
var ZONE_VIEWER = '#handoutModal';                                              // the handout viewer: the Journal says whose the entry is
var ZONE_APP = '#helpModal, #aboutModal, #settingsModal';                      // the app's own words
var ZONE_PAGE = '#plannerPreview, #docReaderBody, #docPanelBody, #popoutBody, #prepBody';  // where a planner or a page is drawn to be read

// Is this app a player at someone's table? true, false — or null where that cannot be told (the answer is then "ask"). A pop-out window
// holds no session of its own: it is asked of the window that opened it.
function atTable(win) {
    try {
        var w = win && win.wpPopout ? win.opener : win;
        if (!w || w.closed) return null;
        var n = w.wpNet;
        if (!n || typeof n !== 'object') return null;
        return !!(n.foreign || (n.active && n.role === 'client'));
    } catch (e) { return null; }
}
// Where a link is, and whose: { editing, held, zone, own, gm, who, player }.
//   editing: it lies in a box that is being edited;  held: it was just dragged (the app's own mark on the link);  zone: 'viewer' | 'app' | 'page' | 'other';
//   own: the handout viewer shows something of your own (handouts.js says so, on the viewer's element);  gm / who: who it came from, where
//   that is known — the GM, or a player's name as the Journal shows it;  player: atTable.
function linkWhere(a, win) {
    var c = { editing: false, held: !!(a.hasAttribute && a.hasAttribute('data-held')), zone: 'other', own: false, gm: false, who: '', player: atTable(win) };
    if (!(a.closest && a.closest('[data-reads]'))) for (var n = a; n; n = n.parentNode) if (n.isContentEditable === true) { c.editing = true; break; }   // 1.6.2: a box editable for its caret alone (data-reads: a player's notepad) is read, not edited
    var ask = !!a.closest('[data-ask]');   // a text that may be someone else's, drawn by the reader with the word that it asks (fillRuns): no place it stands in makes its links open directly, the viewer's own entry included
    var v = a.closest(ZONE_VIEWER);
    if (v) {
        var d = v.dataset || {};
        c.zone = 'viewer'; c.own = !ask && d.linksOwn === '1'; c.gm = !c.own && d.linksGm === '1'; c.who = !c.own && !c.gm && typeof d.linksWho === 'string' ? d.linksWho.slice(0, 60) : '';
        return c;
    }
    if (ask) return c;
    if (a.closest(ZONE_APP)) { c.zone = 'app'; return c; }
    if (a.closest(ZONE_PAGE)) { c.zone = 'page'; c.gm = c.player === true; return c; }
    return c;
}
// The rule. c: linkWhere's answer with the address under the click as c.link. 'none' — nothing opens; 'open' — it opens; 'ask' — the
// question first. Everything that is not known to be yours asks.
function linkVerdict(c) {
    if (!c || typeof c !== 'object' || typeof c.link !== 'string' || !c.link || cleanLink(c.link) !== c.link) return 'none';   // no web address
    if (c.editing !== false) return 'none';                                 // a box that is being edited
    if (c.held === true) return 'none';                                     // the end of a drag or a resize of a linked shape: no click on its link
    if (c.zone === 'app') return 'open';                                    // the app's own words
    if (c.zone === 'viewer') return c.own === true ? 'open' : 'ask';        // the handout viewer: only what the Journal knows to be yours
    if (c.zone === 'page') return c.player === false ? 'open' : 'ask';      // your planners and pages, while you are not at someone's table
    return 'ask';
}
// What the URL parser makes of an address: { site, href } — the host with its port, and the whole address as it will be asked for. Both
// are plain characters: a name in another alphabet is in its xn-- form and whatever is not one of an address's own characters is
// percent-encoded, so no character (a direction override, a look-alike letter) can make either line read differently from what it
// is. null for an address the parser cannot read or one that is not the web's — such an address is not opened.
function readUrl(link) {
    try { var u = new URL(link); return (u.protocol === 'http:' || u.protocol === 'https:') && typeof u.host === 'string' && u.host ? { site: u.host, href: String(u.href) } : null; } catch (e) { return null; }
}
// The question's words under its title: elements this builds and text nodes, nothing else
function askBody(doc, url, c) {
    var mk = function(cls, text) { var el = doc.createElement('div'); el.className = cls; el.appendChild(doc.createTextNode(String(text))); return el; };
    var box = doc.createElement('div'); box.className = 'linkask';
    box.appendChild(mk('linkask-from', c && c.gm === true ? 'It came from the GM.' : c && typeof c.who === 'string' && c.who ? 'It came from a player: ' + c.who : 'It may have been written by someone else.'));
    box.appendChild(mk('linkask-label', 'It leads to the site'));
    box.appendChild(mk('linkask-site', url.site));
    box.appendChild(mk('linkask-label', 'The whole address'));
    box.appendChild(mk('linkask-url', url.href));
    return box;
}
function openLink(win, link) { try { win.open(link, '_blank', 'noopener,noreferrer'); } catch (e) {} }
// 1.5.6: a link from one page to another (textfmt.js pageLink). It leads nowhere outside the app, so it is never asked about: the press opens
// the page by pageshelf.js's own ways (on the play map over the map, elsewhere the page itself, Ctrl a window of its own), from a window of its
// own a window of its own, and the right button a window of its own too. The main window holds the campaign, so a pop-out asks the window that
// opened it. Nothing opens in the stream window.
function pageHost(win) {
    try { var w = win && win.wpPopout ? win.opener : win; return w && !w.closed && w.wpPageShelf && typeof w.wpPageShelf.linkGo === 'function' ? w : null; }
    catch (e) { return null; }
}
// 1.5.8 (Back and Forward): a plain press on a page link that stands in a place a page is read (pagenav.js NAV_PLACES), and Open here, open the
// page in that same place, which notes where it stood first (wpPageNav.follow), so Back brings the reader back to the very spot. A press with a
// key held, and a link anywhere else, open as before. way 'here' is Open here
function pageGo(win, pg, way, e, a) {
    var d = win && win.document, b = d && d.body;
    if (b && b.classList && b.classList.contains('stream-mode')) return false;
    if (!pg) return false;
    var nav = win.wpPageNav, plain = !(e && (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)), root = null;
    if ((way === 'here' || (!way && plain)) && a && nav && typeof nav.placeOf === 'function' && typeof nav.follow === 'function') { try { root = nav.placeOf(a); } catch (err) { root = null; } }
    if (root) { try { return !!nav.follow(root, pg.id, pg.at || ''); } catch (err) { return false; } }
    var w = pageHost(win); if (!w) return false;
    if (way === 'here') way = '';
    try { var sh = w.wpPageShelf; sh.linkGo(pg.id, pg.at || '', way || (win.wpPopout ? 'window' : sh.wayNow(e))); } catch (err) { return false; }
    return true;
}
// 1.6.2 (backlog 166 f): a mention. A page opens as a page link does; a map or a character is the main window's to open (pageshelf.js mentionGo)
function mentionGo(win, mn, way, e, a) {
    if (!mn) return false;
    if (mn.kind === 'page') return pageGo(win, { id: mn.id, at: mn.at }, way, e, a);
    var d = win && win.document, b = d && d.body; if (b && b.classList && b.classList.contains('stream-mode')) return false;
    var w = pageHost(win); if (!w || typeof w.wpPageShelf.mentionGo !== 'function') return false;
    try { w.wpPageShelf.mentionGo(mn.kind, mn.id, mn.at); return true; } catch (err) { return false; }
}
// 1.5.8: the right button on a page link shows where it may open (its own slice, below); with no menu to be had, a window of its own as before
function pageMenu(win) {
    return function(e) {
        var a = linkAt(e.target); if (!a) return;
        var lk = cleanLink(linkOf(a)), mnP = typeof mentionLink === 'function' ? mentionLink(lk) : null, pg = typeof pageLink === 'function' ? pageLink(lk) : null; if (!pg && mnP && mnP.kind === 'page') pg = { id: mnP.id, at: mnP.at }; if (!pg) return;   // 1.6.2: a page's mention as a page link
        var c = linkWhere(a, win); if (c.editing !== false || c.held === true) return;
        e.preventDefault(); e.stopPropagation();
        var d = win && win.document, b = d && d.body;
        if (b && b.classList && b.classList.contains('stream-mode')) return;
        if (typeof lmOpen === 'function' && d && typeof d.createElement === 'function' && lmOpen(win, d, a, pg, e)) return;
        pageGo(win, pg, 'window', e, a);
    };
}
// The address an <a> carries — null where it carries none. A diagram draws its links as SVG <a> elements whose address is in
// xlink:href, not href: the engine follows either, so either makes a link here.
var XLINK = 'http://www.w3.org/1999/xlink';
function linkOf(a) {
    if (!a || !a.hasAttribute) return null;
    if (a.hasAttribute('href')) return String(a.getAttribute('href'));
    if (a.hasAttributeNS && a.hasAttributeNS(XLINK, 'href')) return String(a.getAttributeNS(XLINK, 'href'));
    return a.hasAttribute('xlink:href') ? String(a.getAttribute('xlink:href')) : null;
}
// The link around an event's target: the nearest <a> that carries an address (one that carries none is no link, but an <a> around it may be one)
function linkAt(t) {
    if (t && t.nodeType === 3) t = t.parentNode;
    for (var a = t && t.closest ? t.closest('a') : null; a; a = a.parentNode && a.parentNode.closest ? a.parentNode.closest('a') : null) if (linkOf(a) !== null) return a;
    return null;
}
// The listener: (win, doc, ask) -> a handler for click and auxclick. ask is dialogs.js showConfirm.
function linkGate(win, doc, ask) {
    var asking = false;
    return function(e) {
        if (e.type === 'auxclick' ? e.button !== 1 : !!e.button) return;   // a click, or the middle button — the right button is the menu's
        var a = linkAt(e.target);
        if (!a) return;
        var raw = linkOf(a);
        if (a.hasAttribute('download') && /^(blob|data):/i.test(raw)) return;   // a file the app itself hands over to be saved
        e.preventDefault();   // the engine follows nothing: whatever opens is opened below
        var c = linkWhere(a, win); c.link = cleanLink(raw);
        var pg = typeof pageLink === 'function' ? pageLink(c.link) : null;   // 1.5.6: a link to a page of the campaign opens it, with no question; the middle button, a window of its own
        if (pg) { if (c.editing === false && c.held !== true) pageGo(win, pg, e.type === 'auxclick' ? 'window' : '', e, a); return; }
        var mn = typeof mentionLink === 'function' ? mentionLink(c.link) : null;   // 1.6.2 (backlog 166 f): a mention opens what it names, with no question
        if (mn) { if (c.editing === false && c.held !== true) mentionGo(win, mn, e.type === 'auxclick' ? 'window' : '', e, a); return; }
        var v = linkVerdict(c), url = v === 'none' ? null : readUrl(c.link);
        if (!url) return;   // no link, a link in a box that is being edited, or an address the parser cannot read: nothing opens
        var link = c.link;
        if (v === 'open') { openLink(win, link); return; }
        if (asking) return;   // one question at a time: a click while it is up asks nothing more
        asking = true;
        // careful: the question's OK takes only a single, deliberate press once the question has been up a moment (dialogs.js) — the
        // second click of a double-click on the link lands where OK appears, and must not answer a question nobody has read
        try { ask(LINK_ASK, function(yes) { asking = false; if (yes === true) openLink(win, link); }, { noEnter: true, careful: true, body: askBody(doc, url, c) }); }
        catch (err) { asking = false; }
    };
}
// A drag that begins on a link carries its address: dropped on another of the app's windows it would be followed there, with no
// question. So a link is dragged only where a click on it opens it directly; anywhere else the drag does not begin.
function dragGate(win) {
    return function(e) {
        var a = linkAt(e.target);
        if (!a) return;
        var c = linkWhere(a, win); c.link = cleanLink(linkOf(a));
        if (linkVerdict(c) !== 'open') e.preventDefault();
    };
}
// A script's window.open, guarded (see the comment at the top). The guard is put in once per window.
function openGuard(win) {
    var open = win && win.open;
    if (typeof open !== 'function' || open.wpGuarded === true) return;
    var guarded = function(url, target) {
        var t, own = '', args = Array.prototype.slice.call(arguments);
        try { t = target === undefined ? undefined : String(target); own = typeof win.name === 'string' ? win.name : ''; } catch (e) { return null; }   // read once: an object is never asked twice
        var k = t === undefined ? '' : t.trim();
        if (k.charAt(0) === '_' && k.toLowerCase() !== '_blank') return null;   // _self, _parent, _top, _unfencedTop, any other of the engine's own: this window, never steered
        if (own && t !== undefined && (t === own || k === own)) return null;   // the window's own name
        if (args.length > 1) args[1] = t;   // the very string judged here is what the engine reads
        return open.apply(win, args);
    };
    guarded.wpGuarded = true;
    try { win.open = guarded; } catch (e) {}
}
function wireLinks(win, doc, ask) {
    openGuard(win);
    var h = linkGate(win, doc, ask);
    doc.addEventListener('click', h, true);
    doc.addEventListener('auxclick', h, true);
    doc.addEventListener('dragstart', dragGate(win), true);
    doc.addEventListener('contextmenu', pageMenu(win), true);   // 1.5.6: the right button on a page link, a window of its own
    if (typeof peekWire === 'function') peekWire(win, doc);   // the address in sight before a press (its own slice, below)
    return h;
}
// A plain text drawn with its web addresses as links (textfmt.js linkParts): a text node for every part, and around an address an <a>
// this makes — its href the cleaned address, the sanitiser's target and rel, its text the address itself. Line breaks and spaces are
// the text's own (the element keeps them by its style). Never markup.
function fillLinked(el, text, doc) {
    while (el.firstChild) el.removeChild(el.firstChild);
    linkParts(text).forEach(function(p) {
        var node = doc.createTextNode(p.t), href = p.href === undefined ? '' : cleanLink(p.href);
        if (!href || href !== p.t) { el.appendChild(node); return; }
        var a = doc.createElement('a');
        a.setAttribute('href', href); a.setAttribute('target', LINK_TARGET); a.setAttribute('rel', LINK_REL);
        a.appendChild(node);
        el.appendChild(a);
    });
    return el;
}
// [sinkcheck:linkgate-end]

// [sinkcheck:linkpeek-start]
// A link's address in sight BEFORE a press (the owner, 2026-10-09, of links in more places: "it shows the address in a way a browser does
// before opening as well as warning"). While the pointer, or the keyboard's focus, rests on a link the gate would open or ask about, its
// address stands in a strip at the window's bottom left, where a browser shows one. It is the very address the gate judges (cleaned as the
// gate cleans it) as the URL parser reads it, so plain characters only, and it is said as peekText says it: the site it names is the site
// the question names. The strip is ONE element this makes, holding ONE text node whose value is the address: nothing of a link is ever
// markup or an attribute. The style sheet wraps the strip and never cuts it, so what peekText keeps is in sight at any window width.
// Nothing shows for a link the gate opens nothing for: one in a box that is being edited, one that was just dragged, an address that is
// not the web's, a file the app itself hands over to be saved. Nothing shows in the stream window.
var PEEK_MAX = 300, PEEK_SITE = 120;
// What the strip says for an address: its scheme, its site and what follows the site, as a browser's own strip says it. The name and password an
// address may carry before its site are left out: they are no part of where it leads, and can be written to read as a site. A site too long to
// show whole is cut at its FRONT, since its end is what names whose it is. So the end of the site is in sight whatever the address holds
function peekText(href) {
    var s = typeof href === 'string' ? href : '', u = null;
    try { u = new URL(s); } catch (e) { u = null; }
    if (u && (u.protocol === 'http:' || u.protocol === 'https:') && typeof u.host === 'string' && u.host) {
        var site = u.host; if (site.length > PEEK_SITE) site = '…' + site.slice(site.length - (PEEK_SITE - 1));
        s = u.protocol + '//' + site + String(u.pathname) + String(u.search) + String(u.hash);
    }
    return s.length > PEEK_MAX ? s.slice(0, PEEK_MAX - 1) + '…' : s;
}
function peekOf(win, a) {   // the address to show for a link, '' for none
    var raw = linkOf(a); if (raw === null) return '';
    if (a.hasAttribute('download') && /^(blob|data):/i.test(raw)) return '';
    var c = linkWhere(a, win); c.link = cleanLink(raw);
    var pg = typeof pageLink === 'function' ? pageLink(c.link) : null;   // 1.5.6: a page link says which page, and which part of it
    if (pg) {
        if (c.editing !== false || c.held === true) return '';
        var w = typeof pageHost === 'function' ? pageHost(win) : null, words = '';
        try { words = w ? String(w.wpPageShelf.linkWords(pg.id, pg.at) || '') : ''; } catch (e) { words = ''; }
        return words ? peekText('Page: ' + words) : 'A page that is not here';
    }
    var mnK = typeof mentionLink === 'function' ? mentionLink(c.link) : null;   // 1.6.2 (backlog 166 f): a mention says what it names
    if (mnK) {
        if (c.editing !== false || c.held === true) return '';
        var wm = typeof pageHost === 'function' ? pageHost(win) : null, mw = '';
        try { mw = wm && typeof wm.wpPageShelf.mentionWords === 'function' ? String(wm.wpPageShelf.mentionWords(mnK.kind, mnK.id, mnK.at) || '') : ''; } catch (e) { mw = ''; }
        return mw ? peekText(mw) : 'Not in this campaign';
    }
    if (linkVerdict(c) === 'none') return '';
    var url = readUrl(c.link); return url ? peekText(url.href) : '';
}
function peekEl(doc, make) {   // the one strip of this document; made on first use, inside the pop-out's own box where the page is one
    var el = doc.getElementById('linkPeek'); if (el || !make) return el || null;
    el = doc.createElement('div'); el.id = 'linkPeek'; el.className = 'linkpeek'; el.hidden = true; el.setAttribute('aria-hidden', 'true');
    el.appendChild(doc.createTextNode(''));
    var home = doc.body && doc.body.classList && doc.body.classList.contains('popout-mode') ? doc.getElementById('popoutWrap') : null;
    (home || doc.body).appendChild(el);
    return el;
}
function peekHide(doc) { var el = peekEl(doc, false); if (el && el.hidden !== true) el.hidden = true; if (typeof popHide === 'function') popHide(doc, false); }   // 1.5.8: and the open-in-a-new-window button beside a page link, a moment later
function peekShow(win, doc, a, e) {
    var text = a ? peekOf(win, a) : '';
    if (text && doc.body && doc.body.classList && doc.body.classList.contains('stream-mode')) text = '';   // the stream window is a picture for an audience: nobody clicks there, and nothing is said over it
    if (!text) { peekHide(doc); return false; }
    if (typeof popShow === 'function') popShow(win, doc, a);   // 1.5.8: beside a page link, a button that opens it in a new window
    var el = peekEl(doc, true); if (!el) return false;
    if (el.firstChild) el.firstChild.nodeValue = text; else el.appendChild(doc.createTextNode(text));
    el.hidden = false;
    // out of the way of what it names, as a browser's is: with the pointer (or, for the keyboard's focus, the link) low on the left the strip
    // stands on the right. Low is within the strip's own height of the bottom: a long address wraps, and the strip is then several lines tall
    var tall = (el.offsetHeight || 40) + 24, px = e && typeof e.clientX === 'number' ? e.clientX : null, py = e && typeof e.clientY === 'number' ? e.clientY : null;
    if ((px === null || py === null) && a.getBoundingClientRect) { var r = a.getBoundingClientRect(); px = r.left; py = r.bottom; }   // no pointer (the keyboard's focus): where the link itself is
    var low = !!(win && typeof px === 'number' && typeof py === 'number' && py > (win.innerHeight || 0) - tall && px < (win.innerWidth || 0) * 0.5);   // the strip is at most half the window wide, so one side is always clear
    el.classList.toggle('peek-right', low);
    return true;
}
// The strip stands while the pointer, or the keyboard's focus, RESTS on a link, and for no longer. An element that is taken off the page, or
// that scrolls from under a still pointer, sends no word of leaving, so each way the strip can outlive its link is closed here by name.
function peekWire(win, doc) {
    var at = null, how = '';   // the link the strip stands for, and what brought it up: 'ptr' the pointer, 'key' the keyboard's focus
    var lost = null;           // a link under the pointer whose strip a scroll or the window's blur put away: the pointer's next move on it brings it back
    var keyed = false;         // the last press was a key, so a focus that FOLLOWS is the keyboard's (a press of the pointer focuses a link too, and shows nothing by itself)
    var kf = null;             // the link the keyboard's focus rests on: noted as the focus arrives, so a key pressed later never makes a pointer's focus the keyboard's
    var back = null, gone = false;   // across the window's absence: the link the keyboard's focus rested on as the window lost the focus, and that the window was away. The focus that comes back with the window is the keyboard's only if it was before
    var away = function() { at = null; how = ''; lost = null; peekHide(doc); };
    // no link under the pointer any more: the address of the link the keyboard's focus rests on, if it rests on one, else nothing
    var rest = function() {
        var f = kf && doc.activeElement === kf ? kf : null;   // (a link taken off the page is never the element with the focus)
        if (f && peekShow(win, doc, f, null)) { at = f; how = 'key'; lost = null; } else away();
    };
    doc.addEventListener('mouseover', function(e) {
        var a = linkAt(e.target);
        if (a && a === at && how === 'ptr') return;   // onto a part of the same link: it stays
        if (a && peekShow(win, doc, a, e)) { at = a; how = 'ptr'; lost = null; return; }
        rest();
    }, true);
    doc.addEventListener('mouseout', function(e) { if (!at || how !== 'ptr') return; var to = e.relatedTarget ? linkAt(e.relatedTarget) : null; if (to !== at) rest(); }, true);
    doc.addEventListener('mousemove', function(e) {
        if (at && at.isConnected === false) { away(); return; }   // its link was taken off the page under a resting pointer
        if (!lost) return;
        var was = lost, a = linkAt(e.target); lost = null;
        if (a === was && !at && peekShow(win, doc, a, e)) { at = a; how = 'ptr'; }
    }, true);
    doc.addEventListener('focusin', function(e) {
        var a = linkAt(e.target);
        if (gone) { gone = false; kf = a && a === back ? a : null; } else kf = a && keyed ? a : null;
        back = null;
        if (kf && peekShow(win, doc, kf, null)) { at = kf; how = 'key'; lost = null; return; }
        if (how === 'key') away();   // the focus went on to something that shows nothing (a link taken off the page sends no focusout)
    }, true);
    doc.addEventListener('focusout', function(e) { var a = linkAt(e.target); if (a) back = a === kf ? a : null; if (a && a === kf) kf = null; if (at && how === 'key' && a === at) away(); }, true);
    doc.addEventListener('scroll', function(e) {
        if (!at) return;
        if (how === 'key') { if (doc.activeElement !== at) away(); return; }   // the focus itself scrolls its link into view: the strip is fixed to the window, and stays
        var t = e && e.target;
        if (t && t !== doc && typeof t.contains === 'function' && !t.contains(at)) return;   // another box scrolled (a chat line arriving): the link has not moved
        var was = at; away(); lost = was;   // the link may have moved from under the pointer
    }, true);
    doc.addEventListener('mousedown', function() { keyed = false; gone = false; back = null; }, true);   // a press leaves the strip: the pointer still rests on the link, and what follows is the gate's
    doc.addEventListener('dragstart', function() { if (at) away(); }, true);   // while something is dragged the pointer sends no word of where it is
    doc.addEventListener('keydown', function(e) {
        keyed = true; gone = false;
        if (e.key === 'Escape') kf = null;   // put away by hand: it stays away until the focus moves (and across the window's absence: what is noted then is noted from kf)
        if (e.key === 'Escape' || (at && at.isConnected === false)) away();   // Escape; or the focused link was taken off the page, which sends no focusout
    }, true);
    if (win && typeof win.addEventListener === 'function') win.addEventListener('blur', function() { var was = how === 'ptr' ? at : null; gone = true; if (kf) back = kf; kf = null; away(); lost = was; });   // (the focus comes back to its link with the window, and is noted again then)
}
// [sinkcheck:linkpeek-end]

// [sinkcheck:linkmenu-start]
// 1.5.8: where a page link may open (the owner, 2026-10-25, by prompt: "Both"). The right button on a page link shows a small menu: Open here, as
// a press opens it; Open in a new window; Open in the panel over the map, from the main window or through it from a window of its own, and never
// from the panel itself. A player's app opens a page in its reader alone, so there it holds Open here alone. Nothing in the stream window.
// ONE menu a document, made here of elements and text nodes: the page's name is a text node. The arrow keys, Home and End go through its rows,
// Enter or a press takes one, Escape and Tab put it away (esckey.js leaves it its own Escape: ESC_OWN_MENUS) and give the focus back to the link
var LM_ID = 'pageLinkMenu';
function lmRows(win, a) {
    var nav = win && win.wpPageNav, root = null, w = pageHost(win), rows = [];
    try { root = nav && typeof nav.placeOf === 'function' ? nav.placeOf(a) : null; } catch (e) { root = null; }
    if (root || w) rows.push(['here', root ? 'Open here' : 'Open']);
    if (atTable(win) === true || !w) return rows;
    rows.push(['window', 'Open in a new window']);
    if (!(root && root.id === 'docPanelBody')) rows.push(['panel', 'Open in the panel over the map']);
    return rows;
}
function lmEl(doc, make) {
    var m = doc.getElementById(LM_ID); if (m || !make) return m || null;
    m = doc.createElement('div'); m.id = LM_ID; m.className = 'linkmenu'; m.setAttribute('role', 'menu'); m.hidden = true;
    var home = doc.body && doc.body.classList && doc.body.classList.contains('popout-mode') ? doc.getElementById('popoutWrap') : null;
    (home || doc.body).appendChild(m);
    m.addEventListener('click', function(e) {
        var r = e.target && e.target.closest ? e.target.closest('.linkmenu-row') : null; if (!r) return;
        e.preventDefault(); e.stopPropagation();
        var s = m.wpAt; lmClose(doc, false); if (s) pageGo(s.win, s.pg, r.dataset.way, null, s.a);
    });
    m.addEventListener('keydown', function(e) {
        var rows = Array.prototype.slice.call(m.querySelectorAll('.linkmenu-row')), at = rows.indexOf(doc.activeElement), to = -1;
        if (e.key === 'Tab') { e.preventDefault(); lmClose(doc, true); return; }
        if (e.key === 'ArrowDown') to = at < 0 || at === rows.length - 1 ? 0 : at + 1;
        else if (e.key === 'ArrowUp') to = at <= 0 ? rows.length - 1 : at - 1;
        else if (e.key === 'Home') to = 0;
        else if (e.key === 'End') to = rows.length - 1;
        if (to < 0 || !rows[to]) return;
        e.preventDefault(); e.stopPropagation(); rows[to].focus();
    });
    doc.addEventListener('keydown', function(e) { if (e.key === 'Escape' && lmShown(doc)) { e.preventDefault(); e.stopPropagation(); lmClose(doc, true); } }, true);
    doc.addEventListener('pointerdown', function(e) { var t = e.target; if (lmShown(doc) && !(t && typeof m.contains === 'function' && m.contains(t))) lmClose(doc, false); }, true);
    doc.addEventListener('scroll', function(e) { if (lmShown(doc) && !(e && e.target && typeof m.contains === 'function' && m.contains(e.target))) lmClose(doc, false); }, true);
    var win = doc.defaultView; if (win && typeof win.addEventListener === 'function') { win.addEventListener('blur', function() { lmClose(doc, false); }); win.addEventListener('resize', function() { lmClose(doc, false); }); }
    return m;
}
function lmShown(doc) { var m = lmEl(doc, false); return !!m && m.hidden !== true; }
function lmClose(doc, refocus) {
    var m = lmEl(doc, false); if (!m || m.hidden === true) return false;
    var s = m.wpAt; m.hidden = true; m.wpAt = null;
    if (refocus && s && s.a && s.a.isConnected !== false && typeof s.a.focus === 'function') { try { s.a.focus(); } catch (e) {} }
    return true;
}
// the menu for a link: its heading the page's own name, then a row a way. Answers whether it is up
function lmOpen(win, doc, a, pg, e) {
    var rows = lmRows(win, a); if (!rows.length) return false;
    var m = lmEl(doc, true); if (!m) return false;
    while (m.firstChild) m.removeChild(m.firstChild);
    var w = pageHost(win), words = '';
    try { words = w ? String(w.wpPageShelf.linkWords(pg.id, pg.at) || '') : ''; } catch (err) { words = ''; }
    var head = doc.createElement('div'); head.className = 'linkmenu-head'; head.appendChild(doc.createTextNode(words || (w ? 'A page that is not here' : 'A page'))); m.appendChild(head);
    rows.forEach(function(r) {
        var b = doc.createElement('button'); b.type = 'button'; b.className = 'linkmenu-row'; b.setAttribute('role', 'menuitem'); b.dataset.way = r[0];
        b.appendChild(doc.createTextNode(r[1])); m.appendChild(b);
    });
    m.wpAt = { win: win, a: a, pg: pg };
    if (typeof peekHide === 'function') peekHide(doc);
    if (typeof popHide === 'function') popHide(doc, true);
    m.style.left = '0px'; m.style.top = '0px'; m.hidden = false;
    var px = e && e.button === 2 && typeof e.clientX === 'number' ? e.clientX : null, py = px !== null && typeof e.clientY === 'number' ? e.clientY : null;
    if ((px === null || py === null) && a.getBoundingClientRect) { var r = a.getBoundingClientRect(); px = r.left; py = r.bottom + 2; }   // by the keyboard: under the link itself
    var vw = (win && win.innerWidth) || 0, vh = (win && win.innerHeight) || 0, mw = m.offsetWidth || 0, mh = m.offsetHeight || 0;
    m.style.left = Math.max(4, Math.min(+px || 0, vw - mw - 4)) + 'px'; m.style.top = Math.max(4, Math.min(+py || 0, vh - mh - 4)) + 'px';
    if (!(e && e.button === 2)) { var first = m.querySelector('.linkmenu-row'); if (first) first.focus(); }   // opened by the keyboard (the menu key, Shift+F10): its first row has the focus
    return true;
}
// [sinkcheck:linkmenu-end]

// [sinkcheck:linkpop-start]
// 1.5.8 (the owner, 2026-10-25, by prompt: "Both"): while the pointer or the keyboard's focus rests on a page link (the strip above says which
// page), a small button beside its end opens the page in a new window. ONE button a document, made here: its drawing is the page panel's own
// pop-out drawing, made by name. Never on a link in a box being edited or just dragged, never on a player's app, where a page opens in the reader
// alone, never in the stream window. It goes a moment after the link is left, so the pointer can reach it, and at once at a scroll or a press
var POP_ID = 'pageLinkPop', POP_PATHS = ['M6.5 3.5H3.2A1.2 1.2 0 0 0 2 4.7v8.1A1.2 1.2 0 0 0 3.2 14h8.1a1.2 1.2 0 0 0 1.2-1.2V9.5', 'M9.5 2.5H14v4.5', 'M14 2.5 7.5 9'];
var SVG_NS = 'http://www.w3.org/2000/svg';
function popEl(doc, make) {
    var el = doc.getElementById(POP_ID); if (el || !make) return el || null;
    el = doc.createElement('button'); el.id = POP_ID; el.type = 'button'; el.className = 'linkpop'; el.hidden = true; el.tabIndex = -1;
    el.title = 'Open this page in a new window'; el.setAttribute('aria-label', 'Open this page in a new window');
    if (typeof doc.createElementNS === 'function') {
        var svg = doc.createElementNS(SVG_NS, 'svg');
        [['viewBox', '0 0 16 16'], ['width', '12'], ['height', '12'], ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', '1.6'], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'], ['aria-hidden', 'true']].forEach(function(x) { svg.setAttribute(x[0], x[1]); });
        POP_PATHS.forEach(function(d) { var p = doc.createElementNS(SVG_NS, 'path'); p.setAttribute('d', d); svg.appendChild(p); });
        el.appendChild(svg);
    }
    var home = doc.body && doc.body.classList && doc.body.classList.contains('popout-mode') ? doc.getElementById('popoutWrap') : null;
    (home || doc.body).appendChild(el);
    el.addEventListener('mouseenter', function() { el.wpHover = true; if (el.wpT) { clearTimeout(el.wpT); el.wpT = null; } });
    el.addEventListener('mouseleave', function() { el.wpHover = false; popHide(doc, false); });
    el.addEventListener('mousedown', function(e) { e.preventDefault(); });   // the focus stays where it is
    el.addEventListener('click', function(e) {
        e.preventDefault(); e.stopPropagation();
        var a = el.wpLink, win = el.wpWin, pg = a ? pageLink(cleanLink(linkOf(a))) : null;
        popHide(doc, true);
        if (a && pg && a.isConnected !== false) pageGo(win, pg, 'window', null, a);
    });
    doc.addEventListener('scroll', function() { popHide(doc, true); }, true);
    return el;
}
function popHide(doc, now) {
    var el = popEl(doc, false); if (!el || el.hidden === true) return false;
    if (el.wpT) { clearTimeout(el.wpT); el.wpT = null; }
    var go = function() { el.wpT = null; if (now !== true && el.wpHover) return; el.hidden = true; el.wpLink = null; el.wpWin = null; el.wpHover = false; };
    if (now === true) go(); else el.wpT = setTimeout(go, 250);
    return true;
}
// shown beside a page link the gate would open, or put away for anything else. Answers whether it is up
function popShow(win, doc, a) {
    var pg = a ? pageLink(cleanLink(linkOf(a))) : null, c = pg ? linkWhere(a, win) : null, b = doc.body;
    if (!pg || c.editing !== false || c.held === true || atTable(win) === true || !pageHost(win) || (b && b.classList && b.classList.contains('stream-mode')) || lmShown(doc)) { popHide(doc, true); return false; }
    var el = popEl(doc, true); if (!el) return false;
    if (el.wpT) { clearTimeout(el.wpT); el.wpT = null; }
    var rs = typeof a.getClientRects === 'function' ? a.getClientRects() : null, r = rs && rs.length ? rs[rs.length - 1] : (a.getBoundingClientRect ? a.getBoundingClientRect() : null);
    var vw = (win && win.innerWidth) || 0, vh = (win && win.innerHeight) || 0;
    el.wpLink = a; el.wpWin = win; el.hidden = false;
    if (r) { el.style.left = Math.max(2, Math.min(Math.round(r.right - 1), vw - 24)) + 'px'; el.style.top = Math.max(2, Math.min(Math.round(r.top + (r.height - 20) / 2), vh - 24)) + 'px'; }
    return true;
}
// [sinkcheck:linkpop-end]

// [sinkcheck:runs-start]
// A text drawn where it is READ, with its look (item 35; lookcore.js). The look is a record that names its text, cleaned here by the rule of
// the place (opts.rule): a record made for other words, or one that is hostile, draws the text plain. A span for every run, with a strict
// color, fixed words for weight, slant, underline and strike, and one of the size steps; a run's link as ONE <a> this makes, with href,
// target and rel and nothing else, only where the rule takes links (the record came through fieldLook) and the link rule keeps the address
// as it is. opts.typed: the web addresses typed in the text are links too, where the rule takes links: the very addresses fillLinked finds
// in the plain text, each whole, whatever looks lie over it; a linked part is never linked twice. opts.ask: the text may be someone else's, so every link in it asks first wherever the element stands (linkWhere reads the mark).
// The element's font is one of Waypoint's own or none, and is SET OR CLEARED at every draw: an element is used again for the next text.
// With no look and typed, node for node what fillLinked makes. Elements and text nodes only.
function fillRuns(el, text, rec, doc, opts) {
    var o = opts && typeof opts === 'object' ? opts : {}, t = typeof text === 'string' ? text : '', typed = o.typed === true && ruleLinks(o.rule);   // typed addresses are links only where the place takes links at all
    var r = cleanRec(rec, t, o.rule);
    el.style.fontFamily = r && r.font ? fontCss(r.font) : '';
    if (o.ask === true) el.dataset.ask = '1'; else delete el.dataset.ask;
    if (!r || !r.fmt) {
        if (typed) return fillLinked(el, t, doc);
        while (el.firstChild) el.removeChild(el.firstChild);
        if (t) el.appendChild(doc.createTextNode(t));
        return el;
    }
    while (el.firstChild) el.removeChild(el.firstChild);
    var runs = runsOf(t, r.fmt), at = [], pos = 0, typedAt = [];
    runs.forEach(function(run) { var own = typeof run.link === 'string' && run.link && cleanLink(run.link) === run.link ? run.link : ''; at.push({ s: pos, e: pos + run.t.length, link: own }); pos += run.t.length; });
    // The web addresses typed in the text are found ONCE, over the whole text, as the plain renderer finds them: never part by part, where a
    // boundary between two looks inside an address would link a cut address, which is another place. Every piece of a typed address leads
    // to the whole address. One that reaches into a part with a link of its own is not linked at all: whole or none
    if (typed && pos === t.length) { var from = 0; linkParts(t).forEach(function(p) { var href = p.href === undefined ? '' : cleanLink(p.href), s = from, e = from + p.t.length; from = e; if (href && href === p.t && !at.some(function(x) { return x.link && x.s < e && x.e > s; })) typedAt.push({ s: s, e: e, href: href }); }); if (from !== t.length) typedAt = []; }
    var anchor = function(href, words) { var a = doc.createElement('a'); a.setAttribute('href', href); a.setAttribute('target', LINK_TARGET); a.setAttribute('rel', LINK_REL); a.appendChild(doc.createTextNode(words)); return a; };
    runs.forEach(function(run, i) {
        var span = doc.createElement('span'), link = at[i].link, strike = run.st === true;
        span.className = 'wp-run';
        if (typeof run.color === 'string' && /^#[0-9a-f]{6}$/.test(run.color)) span.style.color = run.color;
        if (run.b === true) span.style.fontWeight = 'bold';
        if (run.i === true) span.style.fontStyle = 'italic';
        if (run.u === true || strike) span.style.textDecoration = (run.u === true ? 'underline' : '') + (run.u === true && strike ? ' ' : '') + (strike ? 'line-through' : '');
        if (typeof run.size === 'string' && Object.prototype.hasOwnProperty.call(SIZE_EM, run.size)) span.style.fontSize = SIZE_EM[run.size];
        if (link) span.appendChild(anchor(link, run.t));
        else {
            var cur = at[i].s, end = at[i].e;
            typedAt.forEach(function(ta) {
                if (ta.e <= cur || ta.s >= end) return;
                var a0 = Math.max(ta.s, cur), a1 = Math.min(ta.e, end);
                if (a0 > cur) span.appendChild(doc.createTextNode(t.slice(cur, a0)));
                span.appendChild(anchor(ta.href, t.slice(a0, a1)));
                cur = a1;
            });
            if (cur < end) span.appendChild(doc.createTextNode(t.slice(cur, end)));
        }
        el.appendChild(span);
    });
    return el;
}
// [sinkcheck:runs-end]

if (typeof window !== 'undefined' && typeof document !== 'undefined') wireLinks(window, document, showConfirm);
if (typeof window !== 'undefined') window.wpTextRead = { fill: fillRuns };

export { linkVerdict, linkWhere, linkOf, linkAt, readUrl, askBody, linkGate, dragGate, wireLinks, fillLinked, atTable, peekText, peekOf, peekShow, peekHide, peekWire, fillRuns, lmRows, lmOpen, lmClose, popShow, popHide };
