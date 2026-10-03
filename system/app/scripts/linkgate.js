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

if (typeof window !== 'undefined' && typeof document !== 'undefined') wireLinks(window, document, showConfirm);

export { linkVerdict, linkWhere, linkOf, linkAt, readUrl, askBody, linkGate, dragGate, wireLinks, fillLinked, atTable };
