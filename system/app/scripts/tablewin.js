/* A big table edited in a window of its own (1.6.2).
   The owner, 2026-11-14, by prompt: "Edit a big table in its own window". The book's largest tables hold 3,300 to 3,650 cells, and the page
   editor drew a box for every one of them, so a page that holds one was slow to open. The page editor now draws a big table as a short card
   with "Edit in its own window" (planner.js tbBig), and that window is a page's pop-out window whose address names the table:
   the page's own pop-out address with /table:<block id> after the page (docpanel.js popOut writes it, the one place that does, popout.js popPlace reads it, and the desktop shell lets it
   open as it lets every pop-out: shellguard.js childWindowOk; shellguard.js TABLE_QUERY gives it a big window).

   What this module does, in that window only (popout.js tickDoc calls twTick at every poll of the save):
     - draws the table as one grid: a row number with a menu, the heads, every cell drawn as a page draws it (docrender.js cellHtml: a cell's
       listed lines as a list; rowJoin and colspan for merged cells and full-width rows). Every text reaches markup only through docrender's
       fmtHtml (escaped text with its format) or, for a planner of this machine's own campaign, fmtRich (through the page sanitiser).
     - lets the GM edit a cell or a head in a plain text box (line breaks and a "• List" button that marks lines, as the page editor's bar
       does; the cell's styling is kept and carried across the edit), add and delete rows, merge and unmerge cells and make a full-width row.
   A pop-out never writes the save (io.js). So every edit is a WORD to the main window over the app's own BroadcastChannel ('waypoint'),
   { type: 'tableEdit', camp, item, block, w, n, op }, which planner.js tbEditOk judges and tbEditDo applies there, as the GM's own edit, with
   a save and an undo step. The main window answers { type: 'tableEditAck', camp, item, block, w, n, ok, why }, w being this window's own id, so
   that another table's window never takes the answer for its own. Every op says what this window saw (rows, and a cell's or a heading's words
   before, was, or a row's words, row: twRowSig), and the main window refuses one that no longer matches, so an edit never lands on another row.
   While a change of the table's rows is on its way no box or row menu opens, since the grid still shows the rows as they were. Until the save comes back in this window's poll the
   cell shows what was typed (twHold), and the grid is never drawn again while a box is open in it, so a poll cannot take the GM's typing. */
'use strict';
import { cellHtml, rowJoin, headJoin, fmtHtml, fmtRich, cellFmtOf, colFmtOf, LIMITS } from './docrender.js';
// text as markup: the page's own escaping (docrender.js esc, which its module does not export by name)
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

// The one state of the window's table (there is one table a window)
var tw = { body: null, key: '', camp: '', item: '', block: '', b: null, rich: false, sig: '', editing: null, pending: null, hold: null, n: 0, sent: 0, menu: null, note: '', chan: null, wired: false, lastText: null, reopen: null, lost: null };
var TW_HOLD_MS = 5000;   // how long a sent edit is shown as typed while the save is on its way (a poll with the old table is passed over)
// This window's own id, made once, which every edit carries and every answer names again (twAck passes over an answer to another window)
var TW_ID = (function() {
    try { var a = new Uint32Array(2); crypto.getRandomValues(a); return 'tw' + a[0].toString(36) + a[1].toString(36); } catch (e) {}
    return 'tw' + Math.floor(Math.random() * 1e12).toString(36) + Date.now().toString(36);
})();
// The edits that change the table's rows (their number or their shape): while one is on its way the grid's row numbers are not to be trusted.
// A heading's merge changes the heading row's shape too: while one is on its way no heading menu opens, or a second Merge with next by the old
// grid would grow the same heading again (the review of e61ed377)
var TW_STRUCT = { addRow: 1, delRow: 1, merge: 1, unmerge: 1, full: 1, headMerge: 1, headUnmerge: 1 };
// The heading row as the grid shows it, the guard a heading's merge carries (planner.js tbHeadSig is the same rule): the headings' words and
// how many columns each one takes (docrender.js headJoin, null where none is merged), so an edit made on a stale merge is refused
function twHeadSig(b) { var cols = twCols(b), w = cols.map(function(c) { return String(c == null ? '' : c); }); return JSON.stringify({ w: w, s: headJoin(b, cols.length) }); }

// The table block of a page by its id: a page's table, or a planner's table card. null where there is none
function twBlock(it, id) {
    var bl = it && Array.isArray(it.blocks) ? it.blocks : [];
    for (var i = 0; i < bl.length; i++) { var b = bl[i]; if (b && typeof b === 'object' && b.id === id && (b.type === 'table' || (b.type === 'node' && b.mode === 'table'))) return b; }
    return null;
}
// The heads a table shows: its own, or the editor's three where it has none (planner.js tsDefaultCols)
function twCols(b) { return Array.isArray(b.cols) && b.cols.length ? b.cols.slice(0, LIMITS.cols) : ['Item', 'Detail', 'Notes']; }
// One cell's text as stored, from a row of either form (a list, or { col1, … })
function twText(r, ci) { var v = Array.isArray(r) ? r[ci] : r && typeof r === 'object' ? r['col' + (ci + 1)] : ''; return typeof v === 'string' ? v : v == null ? '' : String(v); }
// A row's words as one text, the guard a row's edit carries (planner.js tbRowSig is the same rule): every cell the row holds, in order, with
// trailing empty cells left out, so a list row and the same row as { col1, … } read alike
function twRowSig(r) {
    var n = 0;
    if (Array.isArray(r)) n = r.length; else if (r && typeof r === 'object') Object.keys(r).forEach(function(k) { var m = /^col([1-9]\d{0,2})$/.exec(k); if (m && +m[1] > n) n = +m[1]; });
    var t = []; for (var i = 0; i < n; i++) t.push(twText(r, i));
    while (t.length && t[t.length - 1] === '') t.pop();
    return JSON.stringify(t);
}
// The lines of a text that a selection [s, e) touches, each { at, mark }: the same rule as the page editor's Bullets (planner.js tsBulletLines)
function twBulletLines(text, s, e) {
    var out = [], at = 0, lines = String(text || '').split('\n');
    for (var i = 0; i < lines.length; i++) {
        var end = at + lines[i].length, touched = s === e ? (at <= s && s <= end) : (at < e && (end > s || (end === at && at >= s)));
        if (touched) out.push({ at: at, mark: /^[-•][ \t]/.test(lines[i]) ? 2 : 0 });
        at = end + 1;
    }
    return out;
}
// A press of "• List" in the box: every touched line's mark taken off where all have one, else "• " put on each that has none. { text, s, e }
function twBullets(text, s, e) {
    var lines = twBulletLines(text, s, e), off = lines.length > 0 && lines.every(function(l) { return l.mark > 0; }), t = String(text || '');
    for (var i = lines.length - 1; i >= 0; i--) {
        var L = lines[i]; if (!off && L.mark) continue;
        var n = off ? L.mark : 2;
        t = off ? t.slice(0, L.at) + t.slice(L.at + n) : t.slice(0, L.at) + '• ' + t.slice(L.at);
        var move = function(x) { return off ? (x >= L.at + n ? x - n : x > L.at ? L.at : x) : (x >= L.at ? x + n : x); };
        s = move(s); e = move(e);
    }
    return { text: t, s: s, e: e };
}

// The grid as markup. Every text through draw (fmtHtml on a page, fmtRich on a planner): the heads, the cells and the title; the numbers
// (row numbers, colspans, indexes) are the module's own
function twHtml(b, rich, note) {
    var cols = twCols(b), n = cols.length, rows = Array.isArray(b.rows) ? b.rows.slice(0, LIMITS.rows) : [], draw = rich ? fmtRich : function(t, f) { return fmtHtml(t, f); };
    var cells = 0; rows.forEach(function() { cells += n; });
    var h = '<div class="tw-head"><b class="tw-title">' + (b.title ? draw(String(b.title), b.fmt && b.fmt.title) : 'Table') + '</b>'
        + '<span class="tw-size">' + rows.length + ' rows, ' + n + ' columns, ' + cells.toLocaleString('en-US') + ' cells</span>'
        + '<button type="button" class="tool ghost tw-addrow" title="Add a row at the end of the table">+ Row at the end</button>'
        + '<span class="tw-note" role="status">' + esc(note || '') + '</span>'
        + '<span class="tw-help">Click a cell or a heading to change it. Right-click a cell or a heading, or press a row&rsquo;s number, for more.</span></div>';
    h += '<div class="tw-scroll"><table class="tw-grid doc-table"><thead><tr><th class="tw-rn"></th>';
    var hs = headJoin(b, n);   // 1.6.2: a merged heading by its colspan, one under it not drawn (docrender.js headJoin)
    cols.forEach(function(c, ci) { var hk = hs ? hs[ci] : 1; if (hk === 0) return; h += '<th tabindex="0" data-ci="' + ci + '"' + (hk > 1 ? ' colspan="' + hk + '"' : '') + ' title="Click to change this heading. Right-click to merge it with the next or unmerge it.">' + draw(String(c == null ? '' : c), colFmtOf(b, ci)) + '</th>'; });
    h += '</tr></thead><tbody>';
    rows.forEach(function(r, ri) {
        var j = rowJoin(b, ri, n);
        h += '<tr' + (j.full ? ' class="t-full"' : '') + '><th class="tw-rn"><button type="button" class="tw-rowmenu" data-ri="' + ri + '" aria-haspopup="menu" title="Row ' + (ri + 1) + ': add a row, delete it, or make it a full-width row">' + (ri + 1) + '</button></th>';
        for (var ci = 0; ci < n; ci++) {
            var k = j.full ? (ci === 0 ? n : 0) : j.spans ? j.spans[ci] : 1; if (k === 0) continue;
            h += '<td tabindex="0" data-ri="' + ri + '" data-ci="' + ci + '"' + (k > 1 ? ' colspan="' + k + '"' : '') + (ci === 0 ? ' class="tw-c0"' : '') + '>' + cellHtml(twText(r, ci), cellFmtOf(b, ri, ci), draw) + '</td>';
        }
        h += '</tr>';
    });
    return h + '</tbody></table></div>';
}

// What has the keyboard's focus in the grid, as a selector that finds the same control in a grid drawn anew: a cell or a heading by its row
// and column, a row's number by its row, + Row at the end. '' where the focus is elsewhere
function twFocusSel(el, body) {
    if (!el || !body || el === body || typeof body.contains !== 'function' || !body.contains(el) || !el.matches) return '';
    var d = el.dataset || {}, num = function(v) { return /^\d{1,4}$/.test(String(v)) ? String(v) : ''; };
    if (el.matches('.tw-grid td[data-ci]') && num(d.ri) && num(d.ci)) return '.tw-grid td[data-ri="' + d.ri + '"][data-ci="' + d.ci + '"]';
    if (el.matches('.tw-grid th[data-ci]') && num(d.ci)) return '.tw-grid thead th[data-ci="' + d.ci + '"]';
    if (el.matches('.tw-rowmenu') && num(d.ri)) return '.tw-rowmenu[data-ri="' + d.ri + '"]';
    if (el.matches('.tw-addrow')) return '.tw-addrow';
    return '';
}
// Draw the grid again, the scroll kept where it was, and the keyboard's focus put back on the same control (a save's poll draws the grid a
// moment after each edit: without this the focus fell to the page and a GM working from the keys lost their place). Never while a box is
// open: what came in waits for it (tw.pending)
function twDraw() {
    if (!tw.body || !tw.b) return;
    if (tw.editing) { tw.pending = true; return; }
    var sc = tw.body.querySelector('.tw-scroll'), x = sc ? sc.scrollLeft : 0, y = tw.body.scrollTop;
    var fsel = twFocusSel(typeof document !== 'undefined' ? document.activeElement : null, tw.body);
    tw.body.innerHTML = twHtml(tw.b, tw.rich, tw.note);
    var sc2 = tw.body.querySelector('.tw-scroll'); if (sc2) sc2.scrollLeft = x; tw.body.scrollTop = y;
    var back = fsel ? tw.body.querySelector(fsel) : null; if (back) try { back.focus({ preventScroll: true }); } catch (e) {}
    tw.pending = false;
    if (tw.reopen) { var L = tw.reopen; tw.reopen = null; twReopen(L); }   // words the main window did not take, back in their box (twLost)
    twLostDraw();   // words that could not go back in their cell stay to copy through every later draw (twLostDraw)
}

// [pagecheck:twlost-start]
// 1.6.3 (the review of pages and planners, finding 12). A cell's or a heading's new words were thrown away when the main window refused them
// or never answered: the grid was drawn again from the save, and only a line of gray text said so. Now the last words sent (tw.lastText, set
// as Done sends them) are kept until the save holds them. If the main window refuses them, or no save comes in time, twLost marks them to
// come back, and the next draw of the grid opens that very cell's box again with the words still in it (twReopen), so Done tries again. Where
// the table changed meanwhile so the cell is no longer the one the words were typed for (other rows, or other words in it), the words stand
// under the note in a box of their own to copy, never on another cell
function twLost(why) {
    var L = tw.lastText; tw.lastText = null;
    if (!L) { twNote(why); return; }
    tw.reopen = L;
    twNote(why + ' Your words are back in the box: press Done to try again.');
}
function twReopen(L) {
    if (!tw.b || !tw.body || !L) return;
    var cols = twCols(tw.b), head = L.k === 'head', rows = Array.isArray(tw.b.rows) ? tw.b.rows : [];
    var same = rows.length === L.rows && L.ci < cols.length && (head ? String(cols[L.ci] == null ? '' : cols[L.ci]) === L.was : (L.ri < rows.length && twText(rows[L.ri], L.ci) === L.was));
    var el = same ? tw.body.querySelector(head ? '.tw-grid thead th[data-ci="' + L.ci + '"]' : '.tw-grid td[data-ri="' + L.ri + '"][data-ci="' + L.ci + '"]') : null;
    if (el) { twEdit(el, L.text); return; }
    twNote('The table changed, so your words were not put back in their cell. Here they are to copy.');
    tw.lost = L.text;   // kept in the window's state, so the next draw of the grid draws the box again (twDraw asks twLostDraw after this)
}
// The box of words to copy (1.6.3, the review of pages editor). The table changed because someone else is working on it, so another save
// and another draw of the grid will come soon, and twDraw rewrites the whole window body. The words therefore live in tw.lost, and every
// draw puts this box back under the note from that. They go only when the GM presses Close, or when the window turns to another table
// (twTick's change of key). A box already there is filled again, never doubled
function twLostDraw() {
    if (!tw.body || typeof tw.lost !== 'string' || typeof document === 'undefined') return;
    var note = tw.body.querySelector('.tw-note'), head0 = note && note.parentNode;
    if (!head0) return;
    var box = head0.querySelector ? head0.querySelector('.tw-lost') : null, ta = box && box.querySelector('textarea');
    if (box && ta) { ta.value = tw.lost; return; }
    box = document.createElement('div'); box.className = 'tw-lost';
    ta = document.createElement('textarea'); ta.readOnly = true; ta.value = tw.lost; ta.rows = Math.min(8, Math.max(2, tw.lost.split('\n').length)); ta.setAttribute('aria-label', 'Your words that were not saved');
    var close = document.createElement('button'); close.type = 'button'; close.className = 'tool ghost tw-lost-close'; close.textContent = 'Close'; close.title = 'Put these words away. Copy them first if you still want them.';
    close.addEventListener('click', function() {
        tw.lost = null; if (box.parentNode) box.parentNode.removeChild(box);
        if (/Here they are to copy/.test(tw.note)) twNote('');   // the note pointed at the box, which is gone now
    });
    box.appendChild(ta); box.appendChild(close); head0.appendChild(box);
}
// [pagecheck:twlost-end]

// Every poll of the save (popout.js tickDoc): the table as the save holds it now. Answers { title } for the window's bar, or null where the
// page or the table is gone (the window then says so). A table that has not changed is not drawn again; one that changed while an edit is
// on its way, and still holds what was there before it, is passed over until the save comes (twHold). want: the campaign the window's address names
// (popout.js passes it). Where it is given and the campaign handed in is another (the window's own was deleted, and the window fell back to
// the campaign the main window has open, whose page of the same id a test copy shares), nothing is drawn or sent: the window says so
function twTick(body, camp, it, blockId, pageTitle, want) {
    if (want !== undefined && !(camp && typeof camp.id === 'string' && camp.id === want)) {
        tw.key = ''; tw.camp = ''; tw.item = ''; tw.block = ''; tw.b = null; tw.hold = null; tw.body = body; twWire(body);
        if (tw.sig !== '\u0000NOCAMP') { tw.sig = '\u0000NOCAMP'; if (body) body.innerHTML = '<div class="popout-msg">This table&rsquo;s campaign is no longer here.</div>'; }
        return null;
    }
    var key = (camp && camp.id) + '\u0000' + (it && it.id) + '\u0000' + blockId;
    if (tw.key !== key) { tw.key = key; tw.sig = ''; tw.hold = null; tw.note = ''; tw.lost = null; }   // another table: its words to copy were this table's
    tw.body = body; tw.camp = camp && typeof camp.id === 'string' ? camp.id : ''; tw.item = it && typeof it.id === 'string' ? it.id : ''; tw.block = blockId;
    twWire(body);
    var b = twBlock(it, blockId);
    if (!b) { if (tw.sig !== '\u0000GONE') { tw.sig = '\u0000GONE'; tw.b = null; body.innerHTML = '<div class="popout-msg">This table is no longer on the page.</div>'; } return null; }
    tw.rich = it.type === 'planner' && !(camp && camp._foreign);   // a planner's cells read typed markup (as plannerRead draws them), only for this machine's own campaign
    var sig = JSON.stringify(b);
    if (tw.hold) {
        if (Date.now() < tw.hold.until && sig === tw.hold.was) return twTitle(pageTitle, b);   // the save is still on its way
        if (sig === tw.hold.was) { tw.sig = ''; twLost('The main window did not take the change. Is Waypoint still open there?'); }   // no save came: the grid shows the table as it is, and the words come back (twLost)
        else { tw.note = 'Saved.'; tw.lastText = null; }   // the save holds the change (the main window's answer may come before or after it)
        tw.hold = null;
    }
    if (sig !== tw.sig) { tw.sig = sig; tw.b = JSON.parse(sig); twDraw(); }
    return twTitle(pageTitle, b);
}
function twTitle(pageTitle, b) { var t = typeof b.title === 'string' && b.title.trim() ? b.title.trim() : 'Table'; return { title: String(pageTitle || 'Page') + ' › ' + Array.from(t.replace(/\s+/g, ' ')).slice(0, 80).join('') }; }

// An edit to the main window. op: { k: 'cell' | 'head' | 'addRow' | 'delRow' | 'merge' | 'unmerge' | 'full', ri, ci, at, text }. The grid shows
// it at once where it can (a cell's or a head's new words), and holds what the poll brings until the save holds it
// op.rows: the number of rows the grid showed when the edit began (a box or a menu opened); where the caller gives none, the grid's now
function twSend(op) {
    if (!tw.camp || !tw.item || !tw.block || !tw.b) return false;
    if (typeof op.rows !== 'number') op.rows = Array.isArray(tw.b.rows) ? tw.b.rows.length : 0;
    var msg = { type: 'tableEdit', camp: tw.camp, item: tw.item, block: tw.block, w: TW_ID, n: ++tw.n, op: op };
    try { if (!tw.chan) tw.chan = new BroadcastChannel('waypoint'); tw.chan.postMessage(msg); } catch (e) { twNote('This window cannot reach the main window, so the change was not made.'); return false; }
    tw.hold = { was: tw.sig, until: Date.now() + TW_HOLD_MS, n: tw.n, struct: Object.prototype.hasOwnProperty.call(TW_STRUCT, op.k) }; tw.sent = tw.n;
    twNote('Saving…');
    return true;
}
function twNote(t) { tw.note = t; var el = tw.body && tw.body.querySelector('.tw-note'); if (el) el.textContent = t; }
// A change of the table's rows is on its way: the grid's row numbers may no longer be the table's, so no box or row menu opens until the save
// is here (twTick lets the hold go), and the note says why nothing opened
function twBusy() { if (!(tw.hold && tw.hold.struct)) return false; twNote('Saving…'); return true; }
// The main window's answer: saved, or refused and why (the poll then shows the table as it is)
function twAck(d) {
    if (!d || d.type !== 'tableEditAck' || typeof d.n !== 'number' || !tw.sent || d.n !== tw.sent) return;   // the answer to the last edit this window sent
    if (d.w !== TW_ID || d.camp !== tw.camp || d.item !== tw.item || d.block !== tw.block) return;   // and to this window, about this very table
    if (d.ok === true) { twNote('Saved.'); tw.lastText = null; }
    else { tw.hold = null; tw.sig = ''; tw.sent = 0; twLost(typeof d.why === 'string' && d.why ? d.why.slice(0, 200) : 'The change was not made.'); }   // the poll draws the grid, and the words come back (twLost)
}

// A cell or a head opened for typing: a box in its place with its words, a "• List" button and Done. Enter is a new line (a cell takes
// them); Ctrl+Enter or Done keeps the words, Escape leaves them as they were; leaving the box keeps them too. text: words to show in place of
// the cell's own (1.6.3, twReopen: words the main window did not take, typed again for the GM)
function twEdit(el, text) {
    if (!tw.b || tw.editing || !el || !el.dataset || twBusy()) return;
    var ci = parseInt(el.dataset.ci, 10), ri = el.dataset.ri === undefined ? -1 : parseInt(el.dataset.ri, 10), head = ri < 0, cols = twCols(tw.b);
    if (!(ci >= 0 && ci < cols.length) || (!head && !(ri >= 0 && ri < tw.b.rows.length))) return;
    var was = head ? String(cols[ci] == null ? '' : cols[ci]) : twText(tw.b.rows[ri], ci);
    var box = document.createElement('div'); box.className = 'tw-edit';
    var ta = document.createElement('textarea'); ta.value = typeof text === 'string' ? text : was; ta.rows = Math.min(12, Math.max(2, was.split('\n').length + 1)); ta.setAttribute('aria-label', head ? 'Heading of column ' + (ci + 1) : 'Row ' + (ri + 1) + ', column ' + (ci + 1)); ta.maxLength = head ? 300 : LIMITS.cell;
    var bar = document.createElement('div'); bar.className = 'tw-editbar';
    var list = document.createElement('button'); list.type = 'button'; list.className = 'tool ghost'; list.textContent = '• List'; list.title = 'Make the lines you picked, or the caret’s line, a bulleted list. Press again for plain lines.';
    var done = document.createElement('button'); done.type = 'button'; done.className = 'tool'; done.textContent = 'Done'; done.title = 'Keep these words (Ctrl+Enter)';
    if (!head) bar.appendChild(list);
    bar.appendChild(done);
    box.appendChild(ta); box.appendChild(bar);
    while (el.firstChild) el.removeChild(el.firstChild);
    el.appendChild(box);
    tw.editing = { el: el, ri: ri, ci: ci, was: was, ta: ta, gone: false, rows: tw.b.rows.length };   // rows: what the grid showed as the box opened (the edit's guard)
    var finish = function(keep) {
        var ed = tw.editing; if (!ed || ed.gone) return; ed.gone = true; tw.editing = null;
        var now = ta.value.replace(/\r\n?/g, '\n');
        if (keep && now !== ed.was) {
            if (twSend(head ? { k: 'head', ci: ci, text: now.slice(0, 300), rows: ed.rows, was: ed.was } : { k: 'cell', ri: ri, ci: ci, text: now.slice(0, LIMITS.cell), rows: ed.rows, was: ed.was })) {
                tw.lastText = { k: head ? 'head' : 'cell', ri: ri, ci: ci, text: now, was: ed.was, rows: ed.rows };   // kept until the save holds it (twLost)
                if (head) tw.b.cols = cols.map(function(c, k) { return k === ci ? now : c; });   // shown at once, with no look until the save brings it
                else { var r = tw.b.rows[ri]; if (Array.isArray(r)) r[ci] = now; else { r['col' + (ci + 1)] = now; if (r.fmt) delete r.fmt['col' + (ci + 1)]; } if (Array.isArray(tw.b.rowFmt) && Array.isArray(tw.b.rowFmt[ri])) tw.b.rowFmt[ri][ci] = null; }
            }
        }
        twDraw();
        var back = tw.body && tw.body.querySelector((head ? 'th' : 'td') + '[data-ci="' + ci + '"]' + (head ? '' : '[data-ri="' + ri + '"]'));
        if (back) try { back.focus(); } catch (e) {}
    };
    bar.addEventListener('mousedown', function(e) { e.preventDefault(); });   // the box keeps the focus and its selection
    list.addEventListener('click', function() { var r = twBullets(ta.value, ta.selectionStart, ta.selectionEnd); ta.value = r.text; ta.setSelectionRange(r.s, r.e); ta.focus(); });
    done.addEventListener('click', function() { finish(true); });
    ta.addEventListener('keydown', function(e) {
        e.stopPropagation();   // the window's own keys (Find's Ctrl+F aside) stay out of the box
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); finish(true); }
        else if (e.key === 'Enter' && head) { e.preventDefault(); finish(true); }   // a heading is one line
    });
    ta.addEventListener('blur', function() { setTimeout(function() { if (tw.editing && tw.editing.ta === ta && document.activeElement !== ta) finish(true); }, 0); });
    ta.focus(); try { ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {}
}

// The menu for a row (its number's button) or a cell and its row (a right-click). Elements and text alone
function twMenu(ri, ci, x, y, from) {
    var head = ri === -1 && ci >= 0;   // 1.6.2: a heading's menu (its merge alone)
    if (!tw.b || (!head && !(ri >= 0 && ri < tw.b.rows.length)) || twBusy()) return;
    if (!tw.menu) {
        tw.menu = document.createElement('div'); tw.menu.className = 'context-menu tw-menu'; tw.menu.setAttribute('role', 'menu'); tw.menu.style.display = 'none';
        (document.getElementById('popoutWrap') || document.body).appendChild(tw.menu);   // inside the window's own wrapper: the pop-out's style sheet puts away everything else on its page
        tw.menu.addEventListener('click', function(e) {
            var bt = e.target && e.target.closest ? e.target.closest('button') : null; if (!bt || bt.disabled) return;
            var at = tw.menu._at; twMenuAway();
            var k = bt.dataset.act;
            // each edit carries what the grid showed as the menu opened: its rows, and the row's words (twRowSig)
            if (k === 'above') twSend({ k: 'addRow', at: at.ri, rows: at.rows }); else if (k === 'below') twSend({ k: 'addRow', at: at.ri + 1, rows: at.rows }); else if (k === 'del') twSend({ k: 'delRow', ri: at.ri, rows: at.rows, row: at.row });
            else if (k === 'merge' || k === 'unmerge') twSend({ k: k, ri: at.ri, ci: at.ci, rows: at.rows, row: at.row }); else if (k === 'full') twSend({ k: 'full', ri: at.ri, rows: at.rows, row: at.row });
            else if (k === 'hmerge' || k === 'hunmerge') twSend({ k: k === 'hmerge' ? 'headMerge' : 'headUnmerge', ci: at.ci, rows: at.rows, heads: at.heads });   // with the heading row it saw, its words and its merges (twHeadSig; planner.js tbEditOk)
        });
        document.addEventListener('pointerdown', function(e) { if (tw.menu.style.display !== 'none' && !(e.target && e.target.closest && e.target.closest('.tw-menu'))) twMenuAway(); }, true);
        document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && tw.menu.style.display !== 'none') { e.preventDefault(); twMenuAway(); } }, true);
        tw.menu.addEventListener('keydown', function(e) {   // up and down move between the items, as the editor's own menu does
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
            var items = Array.prototype.filter.call(tw.menu.querySelectorAll('button'), function(x) { return !x.disabled; }), at = items.indexOf(document.activeElement);
            if (!items.length) return; e.preventDefault(); e.stopPropagation();
            items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1) + items.length) % items.length].focus();
        });
    }
    var n = twCols(tw.b).length, j = head ? { full: false, spans: headJoin(tw.b, n) } : rowJoin(tw.b, ri, n), k = ci >= 0 && j.spans ? j.spans[ci] : 1, rows = [];
    if (head) { rows.push(['hmerge', 'Merge with next', ci + k >= n]); rows.push(['hunmerge', 'Unmerge', !(k > 1)]); }
    else if (ci >= 0) { rows.push(['merge', 'Merge with next', j.full || ci + k >= n]); rows.push(['unmerge', 'Unmerge', j.full || !(k > 1)]); }
    if (!head) {
        rows.push(['full', (j.full ? '✓ ' : '') + 'Full-width row', false]);
        rows.push(['above', 'Add a row above', tw.b.rows.length >= LIMITS.rows]); rows.push(['below', 'Add a row below', tw.b.rows.length >= LIMITS.rows]); rows.push(['del', 'Delete this row', false]);
    }
    while (tw.menu.firstChild) tw.menu.removeChild(tw.menu.firstChild);
    rows.forEach(function(o) { var d = document.createElement('button'); d.type = 'button'; d.dataset.act = o[0]; d.textContent = o[1]; d.disabled = !!o[2]; d.setAttribute('role', 'menuitem'); if (o[0] === 'del') d.className = 'danger'; tw.menu.appendChild(d); });
    tw.menu._at = { ri: ri, ci: ci, rows: tw.b.rows.length, row: head ? '' : twRowSig(tw.b.rows[ri]), heads: twHeadSig(tw.b) }; tw.menu._back = from || null;
    tw.menu.style.display = 'flex';
    var w = tw.menu.offsetWidth || 180, h = tw.menu.offsetHeight || 160;
    // 1.6.4 window bar: kept below the strip the desktop app draws at the window's top (wpWinBarH, 0 in a browser)
    tw.menu.style.left = Math.max(4, Math.min(x, (window.innerWidth || 1e4) - w - 4)) + 'px'; tw.menu.style.top = Math.max(4 + (window.wpWinBarH ? window.wpWinBarH() : 0), Math.min(y, (window.innerHeight || 1e4) - h - 4)) + 'px';
    var first = Array.prototype.filter.call(tw.menu.querySelectorAll('button'), function(b) { return !b.disabled; })[0]; if (first) try { first.focus(); } catch (e) {}
}
function twMenuAway() { if (!tw.menu) return; tw.menu.style.display = 'none'; var back = tw.menu._back; tw.menu._back = null; if (back && back.isConnected) try { back.focus(); } catch (e) {} }

// The grid's input, wired once on the window's body: a click or Enter on a cell or a head opens it, a right-click on a cell and a press of
// a row's number open the menu, + Row at the end adds one; the main window's answers come over the same channel
function twWire(body) {
    if (tw.wired || !body) return; tw.wired = true;
    body.addEventListener('click', function(e) {
        var t = e.target, rm = t && t.closest ? t.closest('.tw-rowmenu') : null;
        if (rm) { var r = rm.getBoundingClientRect(); twMenu(parseInt(rm.dataset.ri, 10), -1, r.left, r.bottom + 2, rm); return; }
        if (t && t.closest && t.closest('.tw-addrow')) { if (tw.b && tw.b.rows.length < LIMITS.rows && !twBusy()) twSend({ k: 'addRow', at: tw.b.rows.length, rows: tw.b.rows.length }); return; }
        if (t && t.closest && (t.closest('.tw-edit') || t.closest('a'))) return;   // inside an open box, or a link (linkgate.js takes it)
        var c = t && t.closest ? t.closest('.tw-grid td[data-ci], .tw-grid th[data-ci]') : null; if (c) twEdit(c);
    });
    body.addEventListener('keydown', function(e) {
        var c = e.target && e.target.matches && e.target.matches('.tw-grid td[data-ci], .tw-grid th[data-ci]') ? e.target : null;
        if (c && (e.key === 'Enter' || e.key === 'F2')) { e.preventDefault(); twEdit(c); }
    });
    body.addEventListener('contextmenu', function(e) {
        var c = e.target && e.target.closest ? e.target.closest('.tw-grid td[data-ri], .tw-grid thead th[data-ci]') : null; if (!c || (e.target.closest && e.target.closest('.tw-edit'))) return;
        e.preventDefault(); twMenu(c.dataset.ri === undefined ? -1 : parseInt(c.dataset.ri, 10), parseInt(c.dataset.ci, 10), e.clientX, e.clientY, c);   // a heading (no row) opens the heading's menu
    });
    try { var ch = new BroadcastChannel('waypoint'); ch.addEventListener('message', function(e) { twAck(e.data); }); } catch (e) {}
}

if (typeof window !== 'undefined') window.wpTableWin = { tick: twTick };   // (a suite loads the module under Node, where there is no window)
export { twTick, twHtml, twBlock, twBullets, twBulletLines, twText, twRowSig, twHeadSig, twFocusSel, twSend, twBusy, twMenu, twCols, twEdit, TW_HOLD_MS };   // twSend, twBusy, twMenu and twEdit for a suite
