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
   (elements and text nodes only). tools/sinkcheck.js runs all of it by the markers below. */
import { cleanLink, linkParts } from './textfmt.js';
import { showConfirm } from './dialogs.js';

// [sinkcheck:linkgate-start]
var LINK_TARGET = '_blank', LINK_REL = 'noopener noreferrer';   // what the page sanitiser writes on every link (docrender.js aAttrs)
var LINK_ASK = 'Open this link in your web browser?';
var ZONE_VIEWER = '#handoutModal';                                              // the handout viewer: the Journal says whose the entry is
var ZONE_APP = '#helpModal, #aboutModal, #settingsModal';                      // the app's own words
var ZONE_PAGE = '#plannerPreview, #docReaderBody, #docPanelBody, #popoutBody';  // where a planner or a page is drawn to be read

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
    for (var n = a; n; n = n.parentNode) if (n.isContentEditable === true) { c.editing = true; break; }
    var v = a.closest(ZONE_VIEWER);
    if (v) {
        var d = v.dataset || {};
        c.zone = 'viewer'; c.own = d.linksOwn === '1'; c.gm = !c.own && d.linksGm === '1'; c.who = !c.own && !c.gm && typeof d.linksWho === 'string' ? d.linksWho.slice(0, 60) : '';
        return c;
    }
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
function peekHide(doc) { var el = peekEl(doc, false); if (el && el.hidden !== true) el.hidden = true; }
function peekShow(win, doc, a, e) {
    var text = a ? peekOf(win, a) : '';
    if (text && doc.body && doc.body.classList && doc.body.classList.contains('stream-mode')) text = '';   // the stream window is a picture for an audience: nobody clicks there, and nothing is said over it
    if (!text) { peekHide(doc); return false; }
    var el = peekEl(doc, true); if (!el) return false;
    if (el.firstChild) el.firstChild.nodeValue = text; else el.appendChild(doc.createTextNode(text));
    el.hidden = false;
    // out of the pointer's way, as a browser's is: with the pointer low on the left the strip stands on the right. Low is within the strip's
    // own height of the bottom: a long address wraps, and the strip is then several lines tall
    var tall = (el.offsetHeight || 40) + 24;
    var low = !!(e && typeof e.clientX === 'number' && typeof e.clientY === 'number' && win && e.clientY > (win.innerHeight || 0) - tall && e.clientX < (win.innerWidth || 0) * 0.62);
    el.classList.toggle('peek-right', low);
    return true;
}
// The strip stands while the pointer, or the keyboard's focus, RESTS on a link, and for no longer. An element that is taken off the page, or
// that scrolls from under a still pointer, sends no word of leaving, so each way the strip can outlive its link is closed here by name.
function peekWire(win, doc) {
    var at = null, how = '';   // the link the strip stands for, and what brought it up: 'ptr' the pointer, 'key' the keyboard's focus
    var lost = null;           // a link under the pointer whose strip a scroll or the window's blur put away: the pointer's next move on it brings it back
    var keyed = false;         // the last press was a key, so a focus that follows is the keyboard's (a press of the pointer focuses a link too, and shows nothing by itself)
    var away = function() { at = null; how = ''; lost = null; peekHide(doc); };
    // no link under the pointer any more: the address of the link the keyboard's focus rests on, if it rests on one, else nothing
    var rest = function() {
        var f = keyed ? linkAt(doc.activeElement) : null;
        if (f && f.isConnected !== false && peekShow(win, doc, f, null)) { at = f; how = 'key'; lost = null; } else away();
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
        if (a && keyed) { if (peekShow(win, doc, a, null)) { at = a; how = 'key'; lost = null; } else if (how === 'key') away(); return; }
        if (!a && how === 'key') away();   // the focus went on to something that is no link (a link taken off the page sends no focusout)
    }, true);
    doc.addEventListener('focusout', function(e) { if (at && how === 'key' && linkAt(e.target) === at) away(); }, true);
    doc.addEventListener('scroll', function(e) {
        if (!at) return;
        if (how === 'key') { if (doc.activeElement !== at) away(); return; }   // the focus itself scrolls its link into view: the strip is fixed to the window, and stays
        var t = e && e.target;
        if (t && t !== doc && typeof t.contains === 'function' && !t.contains(at)) return;   // another box scrolled (a chat line arriving): the link has not moved
        var was = at; away(); lost = was;   // the link may have moved from under the pointer
    }, true);
    doc.addEventListener('mousedown', function() { keyed = false; }, true);   // a press leaves the strip: the pointer still rests on the link, and what follows is the gate's
    doc.addEventListener('dragstart', function() { if (at) away(); }, true);   // while something is dragged the pointer sends no word of where it is
    doc.addEventListener('keydown', function(e) {
        keyed = true;
        if (e.key === 'Escape' || (at && at.isConnected === false)) away();   // Escape; or the focused link was taken off the page, which sends no focusout
    }, true);
    if (win && typeof win.addEventListener === 'function') win.addEventListener('blur', function() { var was = how === 'ptr' ? at : null; away(); lost = was; });
}
// [sinkcheck:linkpeek-end]

if (typeof window !== 'undefined' && typeof document !== 'undefined') wireLinks(window, document, showConfirm);

export { linkVerdict, linkWhere, linkOf, linkAt, readUrl, askBody, linkGate, dragGate, wireLinks, fillLinked, atTable, peekText, peekOf, peekShow, peekHide, peekWire };
