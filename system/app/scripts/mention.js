/* @-mentions (1.6.2, backlog 166 f; the owner, 2026-11-09, by prompt: pages and planners, maps, characters and a map's rooms; in pages and the
   Journal, and in Table Chat and the table notepad; a chip that follows the new name; a press that opens it). Typing @ in a box that takes links
   opens a short list of what the campaign holds that narrows as you type; a pick puts the thing's name in, linked as a mention (textfmt.js
   mentionLink: #wp:@:<kind>:<id>[:<at>]), and a read view draws it as a chip in its current name (pageshelf.js mentionPaint). The editors do the
   writing (planner.js wpTextBox.mentionCan, mentionAt, mention): this module only reads, lists and hands the pick on. The list is made of
   elements and text nodes only. */
import { getActiveCampaign } from './models.js';

// [shelfcheck:mentionpick-start]
var MENTION_MAX = 8, ID = /^[A-Za-z0-9_-]{1,80}$/, AT = /^[A-Za-z0-9_-]{1,64}$/;
function plain(s, n) { return String(s == null ? '' : s).replace(/<[^>]*>/g, '').replace(/[\u0000-\u001f\u007f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n || 80); }
// Everything a mention may name, as { kind, word, label, href }: the pages and planners by title, the maps, each map's named rooms after it, the
// characters. On a player's app only what it holds, which is what the GM let it see
function mentionAll(camp) {
    var out = []; if (!camp) return out;
    var items = camp.items && typeof camp.items === 'object' ? camp.items : {};
    Object.keys(items).forEach(function(id) {
        var it = items[id]; if (!it || typeof it !== 'object' || !ID.test(id)) return;
        var t = plain(it.meta && it.meta.title);
        if (it.type === 'planner' || it.type === 'doc') { if (t) out.push({ kind: 'page', word: it.type === 'planner' ? 'Planner' : 'Page', label: t, href: '#wp:@:page:' + id }); return; }
        if (it.type !== 'map' || it.meta && it.meta.stub === true && !t) return;
        out.push({ kind: 'map', word: 'Map', label: t || 'A map', href: '#wp:@:map:' + id });
        // (name: the room's own name, which a name typed in a text is matched against: mentionIndex, 1.6.4)
        (Array.isArray(it.rooms) ? it.rooms : []).slice(0, 400).forEach(function(r) { var rn = r && plain(r.name); if (rn && typeof r.id === 'string' && AT.test(r.id)) out.push({ kind: 'map', word: 'Room', label: (t || 'A map') + ' \u203a ' + rn, name: rn, href: '#wp:@:map:' + id + ':' + r.id }); });
    });
    // 1.6.3 (the review of pages, finding 38): pages and planners that share a title, ignoring case, each say the page they stand under (or that
    // they stand at the top, and played or skipped where marked) as their gray line, so the list never holds two rows alike
    var twins = Object.create(null);
    out.forEach(function(x) { if (x.kind !== 'page') return; var k = x.label.toLowerCase(); twins[k] = (twins[k] || 0) + 1; });
    out.forEach(function(x) {
        if (x.kind !== 'page' || !(twins[x.label.toLowerCase()] >= 2)) return;
        var it = items[x.href.slice('#wp:@:page:'.length)], pid = it && it.meta && typeof it.meta.parentId === 'string' ? it.meta.parentId : '', up = pid && Object.prototype.hasOwnProperty.call(items, pid) ? items[pid] : null;
        x.sub = (up && up !== it && (up.type === 'planner' || up.type === 'doc') ? 'in ' + (plain(up.meta && up.meta.title) || 'a page') : 'at the top') + (it && it.meta && (it.meta.status === 'played' || it.meta.status === 'skipped') ? ', ' + it.meta.status : '');
    });
    var chars = camp.chars && typeof camp.chars === 'object' ? camp.chars : {};
    Object.keys(chars).forEach(function(id) { var c = chars[id], n = c && plain(c.name); if (n && ID.test(id)) out.push({ kind: 'char', word: c.npc === true ? 'NPC' : 'Character', label: n, href: '#wp:@:char:' + id }); });
    return out;
}
// What matches the words typed after @, the best first: a name that begins with them, then one with a word that does, then one that holds them
function mentionFind(camp, q) {
    var w = plain(q, 40).toLowerCase(), all = mentionAll(camp);
    var rank = function(x) { var l = x.label.toLowerCase(); return !w ? 0 : l.indexOf(w) === 0 ? 0 : l.indexOf(' ' + w) >= 0 || l.indexOf('\u203a ' + w) >= 0 ? 1 : l.indexOf(w) >= 0 ? 2 : 9; };
    return all.map(function(x, i) { return { x: x, r: rank(x), i: i }; }).filter(function(o) { return o.r < 9; }).sort(function(a, b) { return a.r - b.r || a.x.label.localeCompare(b.x.label) || a.i - b.i; }).slice(0, MENTION_MAX).map(function(o) { return o.x; });
}
// The words after an @ the caret stands right after, in the text before it: an @ at the start or after a space or an opening bracket, then up to
// 40 characters with no space and no other @. null where the caret is after none
function mentionQuery(before) { var m = /(?:^|[\s(\[{])@([^\s@]{0,40})$/.exec(String(before == null ? '' : before)); return m ? m[1] : null; }
// [shelfcheck:mentionpick-end]

// [shelfcheck:mentionoffer-start]
/* 1.6.4, mentions offered as you type (Fulllion, 2026-11-23, by prompt, from the Amsel Suite comments: "Dotted underline, Tab accepts" and
   "Pages, planners, notes"). When the words at the caret are the name of a page, a planner, a map, a map's room or a character, they wear a
   faint dotted underline, and Tab or a click on them makes them a mention; anything else leaves them plain. This slice is the pure half: the
   index of names (mentionIndex, made from mentionAll, so it lists exactly what the @ list lists) and the one match at the caret (mentionOffer).
   The rules, so the offer stays quiet:
   - a name is matched as whole words, ignoring case and accents, with any run of spaces standing for one space, never across a line break;
   - a name of fewer than three letters or digits, a name made only of common words ("The Tavern", "Notes") and a map with no title are never
     offered, and neither is a name two different things share (which one Tab should pick cannot be told), but that a room gives way to a
     page, a map or a character of its own name;
   - words that already stand in a link or a mention, or right after an @ (the @ list's own), are never offered;
   - only the longest name the caret stands in, at the end of, or one space after is offered, so there is one offer at a time. */
var OFFER_MIN = 3, OFFER_BACK = 160, OFFER_WORD = /[\p{L}\p{N}]/u;
// Words so common in a game's notes that a name made only of them would be offered all the time. Lower case, with no accents
var OFFER_COMMON = Object.create(null);
('a an the and or but nor of to in on at by for with from into onto upon off over under up down out about after before again also as is are was were be been '
    + 'it its this that these those he she they them we you i me my our your his her their not no yes all any some one two three four five new old big small '
    + 'little great good bad first last next then than now here there where when what who why how which will would can could should may might must '
    + 'have has had do does did get got go goes went come came see say said make made take took just only very more most much many other another '
    + 'still back left right day days night time way man men woman women people thing things part end start home house room rooms door doors hall '
    + 'map maps page pages planner note notes session sessions chapter scene scenes act intro introduction untitled overview summary ideas todo list '
    + 'rules story plot npc npcs combat loot treasure encounter encounters prep character characters journal handout handouts item items '
    + 'road roads town city village forest woods cave dungeon tavern inn shop market castle keep tower temple church river lake sea mountain hill '
    + 'hills north south east west gate bridge camp king queen guard guards boss enemy enemies monster monsters party player players gm '
    + 'kitchen library cellar attic bedroom study vault armory chapel stairs courtyard garden entrance exit hallway corridor barracks stable well '
    + 'world region area level floor quest quests task tasks goal goals hooks hook background history lore notes misc other').split(' ').forEach(function(w) { if (w) OFFER_COMMON[w] = 1; });
// One character as matching reads it, kept one character long so that offsets into the folded text are offsets into the text: lower case,
// with no accent, a curly apostrophe as a straight one, and any space but a line break as a plain space (a line break stays, and is no space)
function offerFold1(c) {
    if (c === '\n') return c;
    if (/\s/.test(c)) return ' ';
    if (c === '‘' || c === '’' || c === 'ʼ') return "'";
    var l = c.toLowerCase(); if (l.length !== 1) l = c;
    try { var d = l.normalize('NFD'); if (d.length > 1 && /^[̀-ͯ]+$/.test(d.slice(1))) l = d.charAt(0); } catch (e) {}
    return l;
}
function offerFold(s) { var t = String(s == null ? '' : s), out = ''; for (var i = 0; i < t.length; i++) out += offerFold1(t.charAt(i)); return out; }
function offerWordAt(t, i) { return i >= 0 && i < t.length && OFFER_WORD.test(t.charAt(i)); }
// The names a text may offer, from what mentionAll lists: { first: { word: [{ f, href, kind }] }, n }, keyed by each name's first word, so a
// match at the caret looks up only the names that begin with the word in front of it. f: the name folded, with its spaces as single spaces
function mentionIndex(all) {
    var by = Object.create(null), seen = Object.create(null), n = 0;
    (Array.isArray(all) ? all : []).forEach(function(x) {
        if (!x || typeof x.href !== 'string' || typeof x.label !== 'string') return;
        var raw = x.word === 'Room' && typeof x.name === 'string' ? x.name : x.label;   // a room by its own name, never by "Map › Room"
        if (x.kind === 'map' && x.word === 'Map' && raw === 'A map') return;           // a map with no title of its own
        var f = offerFold(raw).replace(/\s+/g, ' ').trim(); if (!f) return;
        var words = f.split(/[^\p{L}\p{N}]+/u).filter(Boolean), letters = (f.match(/[\p{L}\p{N}]/gu) || []).length;
        if (letters < OFFER_MIN || !words.length || words.every(function(w) { return OFFER_COMMON[w] === 1; }) || !offerWordAt(f, 0)) return;
        // Two things of one name. A room loses to a page, a map or a character of its name (a room on a data map often stands for the very map
        // it made, "The Inn"); two of the same standing are offered as neither, since which one Tab should pick cannot be told
        var tier = x.word === 'Room' ? 2 : 1;
        if (Object.prototype.hasOwnProperty.call(seen, f)) {
            var o = seen[f];
            if (tier < o.tier) { o.href = x.href; o.kind = x.kind; o.tier = tier; }
            else if (tier === o.tier && o.href !== x.href) o.href = '';
            return;
        }
        var e = { f: f, href: x.href, kind: x.kind, tier: tier }; seen[f] = e; n++;
        (by[words[0]] = by[words[0]] || []).push(e);
    });
    return { first: by, n: n };
}
// Where the folded text t holds the name f from p on, with any run of spaces for one space: the offset its match ends at, or -1
function offerRun(t, p, f) {
    var j = p;
    for (var i = 0; i < f.length; i++) {
        if (f.charAt(i) === ' ') { if (t.charAt(j) !== ' ') return -1; while (t.charAt(j) === ' ') j++; continue; }
        if (t.charAt(j) !== f.charAt(i)) return -1;
        j++;
    }
    return j;
}
// The one offer at the caret: { s, e, href, kind } — the longest name whose words the caret stands in, right after or one space after, as whole words, that
// lies in no link (avoid: [[s, e], ...], in the text's own offsets) and is not self (the page being written in) — or null.
// text: the words around the caret (a field's text, or the paragraph of a text block); at: the caret's offset in it
function mentionOffer(ix, text, at, avoid, self) {
    var t = offerFold(text), best = null;
    if (!ix || !ix.n || typeof at !== 'number' || at < 0 || at > t.length) return null;
    for (var p = Math.max(0, at - OFFER_BACK); p <= at && p < t.length; p++) {
        if (!offerWordAt(t, p) || offerWordAt(t, p - 1)) continue;   // a word starts here
        if (t.charAt(p - 1) === '@') continue;                       // the @ list's own words
        var q = p; while (offerWordAt(t, q)) q++;
        var list = ix.first[t.slice(p, q)]; if (!list) continue;
        for (var k = 0; k < list.length; k++) {
            var x = list[k]; if (!x.href || x.href === self) continue;
            var e = offerRun(t, p, x.f);
            if (e < 0 || offerWordAt(t, e)) continue;   // whole words: no letter right after
            if (e < at && !(e === at - 1 && t.charAt(e) === ' ')) continue;   // reaching the caret, or one space short of it (a name just typed and the space after it)
            if ((Array.isArray(avoid) ? avoid : []).some(function(r) { return Array.isArray(r) && p < r[1] && e > r[0]; })) continue;
            if (!best || e - p > best.e - best.s) best = { s: p, e: e, href: x.href, kind: x.kind };
        }
    }
    return best;
}
// [shelfcheck:mentionoffer-end]

var st = { el: null, q: '', rows: [], i: 0, menu: null };
function menuEl() {
    if (st.menu && st.menu.isConnected) return st.menu;
    var m = document.createElement('div'); m.id = 'mentionMenu'; m.className = 'mention-menu'; m.hidden = true; m.setAttribute('role', 'listbox'); m.setAttribute('aria-label', 'Mention');
    m.addEventListener('mousedown', function(e) { e.preventDefault(); });   // the box keeps the focus and its caret
    m.addEventListener('click', function(e) { var b = e.target && e.target.closest ? e.target.closest('.mention-row') : null; if (!b) return; st.i = Number(b.dataset.i) || 0; pick(); });
    document.body.appendChild(m); st.menu = m; return m;
}
function close() { if (st.menu) { st.menu.hidden = true; st.menu.textContent = ''; } st.el = null; st.rows = []; }
function draw() {
    var m = menuEl(); m.textContent = '';
    if (!st.rows.length) { var none = document.createElement('div'); none.className = 'mention-none'; none.textContent = 'Nothing here by that name'; m.appendChild(none); }
    st.rows.forEach(function(r, i) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'mention-row' + (i === st.i ? ' on' : ''); b.dataset.i = String(i); b.setAttribute('role', 'option'); b.setAttribute('aria-selected', i === st.i ? 'true' : 'false');
        // the name and, under it on a line of its own, where a page of a shared title stands (finding 38): a long title is cut with its own
        // ellipsis and can never push the gray line out of sight (the review of pages cards)
        var n = document.createElement('span'); n.className = 'mention-name'; var lab = document.createElement('span'); lab.className = 'mention-label'; lab.textContent = r.label; n.appendChild(lab); b.appendChild(n);
        if (r.sub) { var sb = document.createElement('span'); sb.className = 'mention-sub'; sb.textContent = r.sub; n.appendChild(sb); }   // 1.6.3 (finding 38): where a page of a shared title stands
        var k = document.createElement('span'); k.className = 'mention-kind'; k.textContent = r.word; b.appendChild(k);
        m.appendChild(b);
    });
    m.hidden = false;
}
function place() {
    var m = st.menu; if (!m || m.hidden) return;
    var r = null; if (!plainBox(st.el)) try { var gs = window.getSelection(); if (gs && gs.rangeCount) { var rg = gs.getRangeAt(0).cloneRange(); rg.collapse(true); var rs = rg.getClientRects(); r = rs && rs.length ? rs[0] : rg.getBoundingClientRect(); } } catch (e) { r = null; }
    if (!r || (!r.left && !r.top)) r = st.el.getBoundingClientRect();
    var w = m.offsetWidth || 260, h = m.offsetHeight || 200, vw = window.innerWidth || 1200, vh = window.innerHeight || 800;
    var x = Math.max(8, Math.min(vw - w - 8, r.left)), y = r.bottom + 4 + h > vh - 8 ? Math.max(8, r.top - h - 4) : r.bottom + 4;
    m.style.left = Math.round(x) + 'px'; m.style.top = Math.round(y) + 'px';
}
// [shelfcheck:mentionplain-start]
// A plain box (an input or a textarea marked data-mentions: Table Chat's) keeps what was picked on itself, { label, href } in order, and hands
// it on with its words when they are sent: mentionTake finds each pick's words in the text as sent, in order and apart, and gives the stretches
// (textfmt cleanMentions cleans them again on every machine). A pick whose words were since typed over is no mention
function plainBox(t) { return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') && t.hasAttribute && t.hasAttribute('data-mentions') ? t : null; }
function mentionTake(picks, text) {
    var out = [], used = [], s = String(text == null ? '' : text);
    (Array.isArray(picks) ? picks : []).slice(0, 40).forEach(function(p) {
        var w = p && typeof p.label === 'string' ? p.label : '', h = p && typeof p.href === 'string' ? p.href : ''; if (!w || !h) return;
        for (var i = s.indexOf(w); i >= 0; i = s.indexOf(w, i + 1)) {
            var e = i + w.length; if (used.some(function(u) { return i < u[1] && e > u[0]; })) continue;
            used.push([i, e]); out.push({ s: i, e: e, h: h }); return;
        }
    });
    return out.sort(function(a, b) { return a.s - b.s; }).slice(0, 20);
}
function plainPut(el, from, to, label, href) {
    var v = String(el.value || ''); if (from < 0 || to > v.length || from > to) return false;
    el.value = v.slice(0, from) + label + ' ' + v.slice(to);
    var c = from + label.length + 1; try { el.setSelectionRange(c, c); } catch (e) {}
    (el._wpMen = Array.isArray(el._wpMen) ? el._wpMen : []).push({ label: label, href: href }); if (el._wpMen.length > 40) el._wpMen.shift();
    return true;
}
// [shelfcheck:mentionplain-end]
function boxOf(t) {
    var pb = plainBox(t); if (pb) return pb;
    var el = t && t.closest ? t.closest('.ts-box, .rte-body') : null, tb = window.wpTextBox;
    return el && tb && typeof tb.mentionCan === 'function' && tb.mentionCan(el) ? el : null;
}
function onInput(e) {
    var el = boxOf(e.target); if (!el) { if (st.el) close(); return; }
    if (el === plainBox(el)) {
        var a = el.selectionStart, b = el.selectionEnd, qp = a === b && typeof a === 'number' ? mentionQuery(String(el.value || '').slice(0, a)) : null;
        if (qp === null) { close(); return; }
        st.el = el; st.q = qp; st.rows = mentionFind(getActiveCampaign(), qp); st.i = 0; draw(); place(); return;
    }
    var gs = window.getSelection ? window.getSelection() : null, n = gs && gs.isCollapsed ? gs.anchorNode : null;
    var q = n && n.nodeType === 3 && el.contains(n) ? mentionQuery(n.nodeValue.slice(0, gs.anchorOffset)) : null;
    if (q === null) { close(); return; }
    st.el = el; st.q = q; st.rows = mentionFind(getActiveCampaign(), q); st.i = 0; draw(); place();
}
function pick() {
    var el = st.el, r = st.rows[st.i], q = st.q, tb = window.wpTextBox; close();
    if (el && r && plainBox(el)) {
        var at = el.selectionStart, okP = typeof at === 'number' && at >= q.length + 1 && plainPut(el, at - q.length - 1, at, r.label, r.href);
        if (typeof window.wpStepLog === 'function') window.wpStepLog('mention v1', okP ? 'put' : 'refused', { kind: r.kind, box: 'plain' });
        return okP;
    }
    if (!el || !r || !tb || typeof tb.mentionAt !== 'function') return false;
    var at = tb.mentionAt(el); if (!(at >= q.length + 1)) return false;
    var ok = tb.mention(el, at - q.length - 1, at, r.label, r.href);
    if (typeof window.wpStepLog === 'function') window.wpStepLog('mention v1', ok ? 'put' : 'refused', { kind: r.kind });
    return ok;
}
function onKey(e) {
    if (!st.el || !st.menu || st.menu.hidden) return;
    var k = e.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') { if (st.rows.length) { st.i = (st.i + (k === 'ArrowDown' ? 1 : st.rows.length - 1)) % st.rows.length; draw(); } }
    else if ((k === 'Enter' || k === 'Tab') && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) { if (!st.rows.length) { close(); return; } pick(); }
    else if (k === 'Escape') close();
    else return;
    e.preventDefault(); e.stopPropagation();
}
if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('input', onInput);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', function(e) { if (st.menu && !st.menu.hidden && !(e.target && e.target.closest && e.target.closest('#mentionMenu'))) close(); }, true);
    document.addEventListener('focusout', function() { setTimeout(function() { if (st.el && document.activeElement !== st.el) close(); }, 0); });
    window.addEventListener('resize', close);
}
// The mentions a plain box holds for the words it now sends, and the box's picks let go of (a sent line starts afresh)
function take(el, text) { var out = el ? mentionTake(el._wpMen, text) : []; if (el) el._wpMen = []; return out; }

/* 1.6.4, mentions offered as you type: the live half (the pure half is the mentionoffer slice above). It follows the box that has the focus:
   after each change and each move of the caret (once a frame at most) it asks the text box module whether the box takes offers and what the
   words around the caret are (planner.js wpTextBox.offerCan, offerSpot), matches them against the index, and draws the one offer as a CSS
   highlight named wp-offer (style.css ::highlight(wp-offer)): a look laid over the words by the browser, which never enters the box, its
   spans or anything stored. Tab with an offer showing, or a press on its words, makes it a mention through the box's own link path
   (wpTextBox.offerTake: one undo step); Tab anywhere else, and every other key, does what it always did. Where the browser draws no
   highlights there is no offer at all, so Tab is never taken for words that show nothing.
   The index is made once per campaign change, never per key: it is kept while the campaign is the same object holding as many items and
   characters, and made again at most every OFFER_STALE ms while typing goes on, so a rename shows within a few seconds. */
var OFFER_STALE = 5000, OFFER_HL = 'wp-offer';
var off = { el: null, s: 0, e: 0, href: '', kind: '', range: null, ix: null, ixCamp: null, ixSig: '', ixAt: 0, raf: 0 };
function offerDraws() { return typeof CSS !== 'undefined' && !!CSS && !!CSS.highlights && typeof Highlight === 'function'; }
function offerIx() {
    var camp = getActiveCampaign(), now = Date.now();
    var sig = camp ? Object.keys(camp.items || {}).length + ':' + Object.keys(camp.chars || {}).length : '';
    if (off.ix && off.ixCamp === camp && off.ixSig === sig && now - off.ixAt < OFFER_STALE) return off.ix;
    off.ix = mentionIndex(mentionAll(camp)); off.ixCamp = camp; off.ixSig = sig; off.ixAt = now;
    return off.ix;
}
function offerHide() {
    if (off.el && offerDraws()) try { CSS.highlights.delete(OFFER_HL); } catch (e) {}
    off.el = null; off.range = null; off.href = '';
}
// The offer worked out again for the box that has the focus, and drawn or taken away
function offerNow() {
    off.raf = 0;
    var tb = window.wpTextBox, a = typeof document !== 'undefined' ? document.activeElement : null;
    var el = a && a.classList && (a.classList.contains('ts-box') || a.classList.contains('rte-body')) ? a : null;
    if (!el || !offerDraws() || !tb || typeof tb.offerSpot !== 'function' || (st.menu && !st.menu.hidden) || !tb.offerCan(el)) { offerHide(); return; }
    var sp = tb.offerSpot(el), hit = sp ? mentionOffer(offerIx(), sp.text, sp.at, sp.links, sp.self) : null;
    var rg = hit ? tb.offerRange(el, sp.base + hit.s, sp.base + hit.e) : null;
    if (!rg) { offerHide(); return; }
    if (off.el === el && off.s === sp.base + hit.s && off.e === sp.base + hit.e && off.href === hit.href) { off.range = rg; try { CSS.highlights.set(OFFER_HL, new Highlight(rg)); } catch (e) {} return; }
    off.el = el; off.s = sp.base + hit.s; off.e = sp.base + hit.e; off.href = hit.href; off.kind = hit.kind; off.range = rg;
    try { CSS.highlights.set(OFFER_HL, new Highlight(rg)); } catch (e) { offerHide(); }
}
function offerSoon() { if (!off.raf && typeof requestAnimationFrame === 'function') off.raf = requestAnimationFrame(offerNow); }
// The offer taken: its words made a mention by the box's own link path. True when they were
function offerTake() {
    var tb = window.wpTextBox, el = off.el, s = off.s, e = off.e, h = off.href, k = off.kind;
    offerHide();
    var ok = !!el && !!tb && typeof tb.offerTake === 'function' && tb.offerTake(el, s, e, h);
    if (typeof window.wpStepLog === 'function') window.wpStepLog('mention offer v1', ok ? 'taken' : 'refused', { kind: k });
    return ok;
}
// Tab with an offer showing takes it. Heard at the window before anything else (the box's own Tab, the bar's, a window's focus ring), and
// only while the box that shows it has the focus, no @ list is open and no composition is under way. The offer is worked out once more first,
// so a key pressed before the next frame never takes words that changed
function offerKey(e) {
    if (e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.metaKey || e.altKey || e.isComposing || !off.el) return;
    if (document.activeElement !== off.el || (st.menu && !st.menu.hidden)) return;
    offerNow(); if (!off.el) return;
    e.preventDefault(); e.stopPropagation();
    offerTake();
}
// A press on the offered words takes it (the box keeps its caret); a press anywhere else is the page's as ever
function offerPress(e) {
    if (!off.el || !off.range || e.button !== 0 || !(e.target && off.el.contains(e.target))) return;
    var rs = []; try { rs = off.range.getClientRects(); } catch (err) { return; }
    var x = e.clientX, y = e.clientY, on = Array.prototype.some.call(rs, function(r) { return x >= r.left && x <= r.right && y >= r.top - 2 && y <= r.bottom + 2; });
    if (!on) return;
    e.preventDefault(); e.stopPropagation();
    offerTake();
}
if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('input', offerSoon);
    document.addEventListener('selectionchange', offerSoon);
    document.addEventListener('compositionstart', offerHide, true);
    document.addEventListener('compositionend', offerSoon, true);
    document.addEventListener('focusout', function() { setTimeout(function() { if (off.el && document.activeElement !== off.el) offerHide(); }, 0); });
    document.addEventListener('mousedown', offerPress, true);
    window.addEventListener('keydown', offerKey, true);
}
window.wpMention = { all: mentionAll, find: mentionFind, query: mentionQuery, take: take, close: close, offer: function() { return off.el ? { s: off.s, e: off.e, href: off.href } : null; } };
export { mentionAll, mentionFind, mentionQuery, mentionIndex, mentionOffer };
