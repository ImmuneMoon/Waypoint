/* The Image Library's tags (1.6.0, backlog 34; the owner, by prompt: "Categories become Tags (Recommended)"). A tag is what the library
   called a category: a name a picture may wear, several at once, kept in one of two stores of one shape
   { list: [names], by: { path: [names] }, shelf: { name: true } }: appState.imageCats (the shared tags, every campaign sees them) and
   camp.imageCats (the campaign's own). Both are the GM's bookkeeping and never leave this machine (net.js sanitizeAppState deletes them,
   cleanup.js STRIPPED).
   cleanStore is the one cleaner of a store, run on every way in (the load's normaliser in io.js, which a Replace and a Merge run on the
   file first, and main.js's Merge of a campaign's store through mergeStores): names are text, cut to LIMITS.name, with no control or
   direction characters, unique, and never one of the chip row's own words (RESERVED); a picture's key is a path the app could have made;
   a picture's tags are names the store lists. A campaign's store also keeps its saved filters (the owner, by prompt: "chips, kept with
   the campaign, export/ importable from another campaign without always showing by default"): { name, tags, match, words }, cleaned by
   cleanFilter, unique by name; the shared store keeps none.
   drawRow, drawMenu, cellTags and previewTags draw tag names as text nodes only, on any document (the app's, or tools/boxdom.js, which
   refuses markup). Pure but for the document it is handed. Published as window.wpImgTagCore. */

var LIMITS = { name: 40, tags: 400, pics: 20000, perPic: 60, path: 1024, filters: 60, filterTags: 12, words: 80 };
var RESERVED = ['__none', '__bymap'];   // the chip row's own values for No tag and By map: no tag may be named either
var BAD = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\ufff9-\ufffb]/g;
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function cut(s, n) { var a = Array.from(s); return a.length > n ? a.slice(0, n).join('') : s; }
// a tag's name as the app keeps it, or '' when nothing is left
function tagName(s) {
    if (typeof s !== 'string') return '';
    var t = cut(s.replace(BAD, ' ').replace(/\s+/g, ' ').trim(), LIMITS.name).trim();
    return RESERVED.indexOf(t) >= 0 ? '' : t;
}
// a picture's key: a path of the saves folder or the app, as the library lists one
function pathKey(p) { return typeof p === 'string' && p.length > 1 && p.length <= LIMITS.path && p.charAt(0) === '/' && !/[\u0000-\u001f\u007f]/.test(p); }
function names(v) { return Array.isArray(v) ? v : typeof v === 'string' ? [v] : []; }
// A filter's words: text with no control characters, its spaces made one, cut to LIMITS.words
function filterWords(s) { return typeof s === 'string' ? cut(s.replace(BAD, ' ').replace(/\s+/g, ' ').trim(), LIMITS.words).trim() : ''; }
// One saved filter: { name, tags: [names], match: 'all' | 'any', words }, or null (no name, or nothing to filter by)
function cleanFilter(f) {
    if (!isObj(f)) return null;
    var name = tagName(f.name), tags = [];
    names(f.tags).forEach(function(t) { var n = tagName(t); if (n && tags.indexOf(n) < 0 && tags.length < LIMITS.filterTags) tags.push(n); });
    var words = filterWords(f.words);
    if (!name || (!tags.length && !words)) return null;
    return { name: name, tags: tags, match: f.match === 'any' ? 'any' : 'all', words: words };
}
function sameName(a, b) { return String(a).toLowerCase() === String(b).toLowerCase(); }
function cleanFilters(list) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function(f) { var c = cleanFilter(f); if (c && out.length < LIMITS.filters && !out.some(function(o) { return sameName(o.name, c.name); })) out.push(c); });
    return out;
}
// One store cleaned; null for what is no store at all. o.filters: a campaign's store, which keeps its saved filters
function cleanStore(c, o) {
    if (!isObj(c)) return null;
    var out = { list: [], by: {}, shelf: {} }, seen = Object.create(null), was = Object.create(null);
    names(c.list).forEach(function(raw) {
        var n = tagName(raw); if (!n || out.list.length >= LIMITS.tags) return;
        if (typeof raw === 'string') was[raw] = n;
        if (!seen[n]) { seen[n] = 1; out.list.push(n); }
    });
    var by = isObj(c.by) ? c.by : {}, pics = 0;
    Object.keys(by).forEach(function(p) {
        if (!pathKey(p) || pics >= LIMITS.pics) return;
        var got = [];
        names(by[p]).forEach(function(raw) { var n = typeof raw === 'string' ? (own(was, raw) ? was[raw] : tagName(raw)) : ''; if (n && seen[n] && got.indexOf(n) < 0 && got.length < LIMITS.perPic) got.push(n); });
        if (got.length) { out.by[p] = got; pics++; }
    });
    var shelf = isObj(c.shelf) ? c.shelf : {};
    Object.keys(shelf).forEach(function(raw) { var n = own(was, raw) ? was[raw] : tagName(raw); if (n && seen[n] && shelf[raw]) out.shelf[n] = true; });
    if (o && o.filters) { var fl = cleanFilters(c.filters); if (fl.length) out.filters = fl; }
    return out;
}
function storeEmpty(c) { return !c || (!c.list.length && !Object.keys(c.by).length && !Object.keys(c.shelf).length && !(c.filters && c.filters.length)); }
// A Merge of a file's store into this campaign's: the file's tags join, a picture keeps its tags and gains the file's, a shelf stays on
// (a campaign's: a saved filter of the file whose name this campaign has not used joins, ours keep theirs)
function mergeStores(dst, src) {
    var F = { filters: true }, a = cleanStore(dst, F) || { list: [], by: {}, shelf: {} }, b = cleanStore(src, F);
    if (!b) return a;
    b.list.forEach(function(n) { if (a.list.indexOf(n) < 0 && a.list.length < LIMITS.tags) a.list.push(n); });
    Object.keys(b.by).forEach(function(p) { var d = a.by[p] || []; b.by[p].forEach(function(n) { if (a.list.indexOf(n) >= 0 && d.indexOf(n) < 0 && d.length < LIMITS.perPic) d.push(n); }); if (d.length) a.by[p] = d; });
    Object.keys(b.shelf).forEach(function(n) { if (a.list.indexOf(n) >= 0) a.shelf[n] = true; });
    (b.filters || []).forEach(function(f) { a.filters = a.filters || []; if (!a.filters.some(function(x) { return sameName(x.name, f.name); })) a.filters.push(f); });
    return cleanStore(a, F);
}

/* ---- filtering ---- */
// a picture's tags against the picked ones: every one (all) or at least one (any); none picked passes everything
function matchTags(has, picked, match) {
    if (!picked || !picked.length) return true;
    return match === 'any' ? picked.some(function(t) { return has.indexOf(t) >= 0; }) : picked.every(function(t) { return has.indexOf(t) >= 0; });
}
// the words typed in the search box, each in lower case
function words(q) { return filterWords(q).toLowerCase().split(' ').filter(Boolean); }
// every word appears in one of the texts (a picture's name, its map, its tags), case aside
function matchWords(texts, ws) {
    if (!ws.length) return true;
    var hay = texts.map(function(t) { return String(t || '').toLowerCase(); });
    return ws.every(function(w) { return hay.some(function(h) { return h.indexOf(w) >= 0; }); });
}
// what is shown now ({ tags, match, words }) is that saved filter: the same tags in any order, the same switch where it counts, the same words
function sameFilter(f, cur) {
    if (!f || !cur) return false;
    var a = f.tags.slice().sort(), b = (cur.tags || []).slice().sort();
    if (a.join('\n') !== b.join('\n')) return false;
    if (a.length > 1 && f.match !== (cur.match === 'any' ? 'any' : 'all')) return false;
    return words(f.words).join(' ') === words(cur.words).join(' ');
}
// a name none of the list has: the name, else the name (2), (3)...
function freeName(name, list) {
    var taken = function(n) { return (list || []).some(function(f) { return sameName(f.name, n); }); };
    if (!taken(name)) return name;
    for (var i = 2; i < 1000; i++) { var s = ' (' + i + ')', n = cut(name, LIMITS.name - s.length).trim() + s; if (!taken(n)) return n; }
    return '';
}

/* ---- drawing: elements and text nodes only ---- */
function el(doc, tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text !== undefined && text !== null && text !== '') e.appendChild(doc.createTextNode(String(text))); return e; }
function data(e, k, v) { e.dataset[k] = String(v); return e; }
// a chip: { text, count?, active?, title?, cls?, cat?, scope?, act?, mark? }
function chip(doc, o) {
    var b = el(doc, 'button', 'journal-from' + (o.active ? ' active' : '') + (o.cls ? ' ' + o.cls : ''), o.text);
    b.type = 'button';
    if (o.title) b.title = o.title;
    if (o.cat !== undefined) data(b, 'cat', o.cat);
    if (o.scope !== undefined) data(b, 'scope', o.scope);
    if (o.act !== undefined) data(b, 'act', o.act);
    if (o.mark) { var m = el(doc, 'span', 'img-cat-mark', o.mark); m.setAttribute('aria-hidden', 'true'); b.appendChild(m); }
    if (typeof o.count === 'number') { b.appendChild(doc.createTextNode(' ')); b.appendChild(el(doc, 'span', 'journal-count', String(o.count))); }
    return b;
}
/* The chip row above the grid. m: { scopes: [{ scope, text, count, title, active }] (none in the picker), imp: true for Import from
   another campaign\u2026, all: { count, active }, bymap: active, tags: [{ name, store, count, active }], none: { count, active }, make: true
   for + New tag and + New shared tag, tools: null or { shelf, shared } for the one tag in view, match: null or 'all' | 'any' once two or
   more tags are picked, saved: null or { list: [{ name, active }], save: true for Save this filter\u2026, imp: true for Import from another
   campaign\u2026, tools: true for the active one's Rename and Delete } } */
function drawRow(doc, row, m) {
    while (row.firstChild) row.removeChild(row.firstChild);
    if (m.scopes && m.scopes.length) {
        row.appendChild(el(doc, 'span', 'journal-chip-label', 'Pictures'));
        m.scopes.forEach(function(s) { row.appendChild(chip(doc, { text: s.text, count: s.count, title: s.title, active: s.active, scope: s.scope })); });
        if (m.imp) row.appendChild(chip(doc, { text: 'Import from another campaign\u2026', cls: 'img-lib-import', act: 'picker', title: 'Pick pictures from another campaign, Shared or Unfiled and bring them into this one' }));
        row.appendChild(el(doc, 'span', 'img-scope-break'));
    }
    row.appendChild(el(doc, 'span', 'journal-chip-label', 'Show'));
    row.appendChild(chip(doc, { text: 'All', count: m.all.count, active: m.all.active, cat: '' }));
    row.appendChild(chip(doc, { text: 'By map', active: m.bymap, cat: '__bymap', title: 'Grouped under the map, planner or page each picture was uploaded from' }));
    m.tags.forEach(function(t) {
        var sh = t.store === 'shared';
        row.appendChild(chip(doc, { text: t.name, count: t.count, active: t.active, cat: t.name, cls: sh ? 'img-cat-shared' : '', mark: sh ? '\u25C7' : '', title: (sh ? 'A shared tag: every campaign sees it' : 'This campaign\'s tag') + '. Ctrl-click to add it to the tags you filter by' }));
    });
    row.appendChild(chip(doc, { text: 'No tag', count: m.none.count, active: m.none.active, cat: '__none', title: 'Pictures with no tag' }));
    if (m.match) {
        var sw = el(doc, 'span', 'seg-control img-match'); sw.title = 'Which pictures show when you pick several tags';
        sw.appendChild(el(doc, 'span', 'img-match-label', 'Match'));
        [['all', 'all', 'Pictures with every tag you picked'], ['any', 'any', 'Pictures with at least one tag you picked']].forEach(function(o) {
            var b = el(doc, 'button', 'seg-btn' + (m.match === o[0] ? ' active' : ''), o[1]); b.type = 'button'; data(b, 'match', o[0]); b.title = o[2]; sw.appendChild(b);
        });
        row.appendChild(sw);
    }
    if (m.make) {
        row.appendChild(chip(doc, { text: '+ New tag', cls: 'img-cat-new', act: 'new', title: 'Make a tag for this campaign' }));
        row.appendChild(chip(doc, { text: '+ New shared tag', cls: 'img-cat-new', act: 'new-shared', title: 'Make a tag every campaign sees' }));
    }
    if (m.tools) {
        var tl = el(doc, 'div', 'img-cat-tools');
        tl.appendChild(chip(doc, { text: m.tools.shelf ? 'Own shelf: on' : 'Own shelf: off', cls: 'img-cat-tool', act: 'shelf', title: 'Own shelf: its pictures show under this chip only, not under All' }));
        tl.appendChild(chip(doc, { text: m.tools.shared ? 'Shared \u2192 this campaign\'s' : 'Make shared', cls: 'img-cat-tool', act: 'share', title: m.tools.shared ? 'Make it this campaign\'s own: only this campaign sees it' : 'Make it shared: every campaign sees it' }));
        tl.appendChild(chip(doc, { text: 'Rename', cls: 'img-cat-tool', act: 'rename', title: 'Rename this tag' }));
        tl.appendChild(chip(doc, { text: 'Delete tag', cls: 'img-cat-tool danger', act: 'delete', title: 'Delete this tag (the pictures stay)' }));
        row.appendChild(tl);
    }
    if (m.saved) {
        row.appendChild(el(doc, 'span', 'img-scope-break'));
        row.appendChild(el(doc, 'span', 'journal-chip-label', 'Saved'));
        m.saved.list.forEach(function(f, i) { var b = chip(doc, { text: '\u2605 ' + f.name, active: f.active, cls: 'img-saved', title: 'Show what this saved filter picks: its tags and its words' }); data(b, 'saved', i); row.appendChild(b); });
        if (!m.saved.list.length) row.appendChild(el(doc, 'span', 'img-saved-none', 'None yet: pick tags or type words, then save them.'));
        if (m.saved.save) row.appendChild(chip(doc, { text: 'Save this filter\u2026', cls: 'img-cat-new', act: 'filter-save', title: 'Keep what is picked now, the tags, the switch and the words, under a name of yours' }));
        if (m.saved.imp) row.appendChild(chip(doc, { text: 'Import from another campaign\u2026', cls: 'img-cat-new', act: 'filter-import', title: 'Bring in a saved filter of another campaign of yours' }));
        if (m.saved.tools) {
            var ft = el(doc, 'div', 'img-cat-tools');
            ft.appendChild(chip(doc, { text: 'Rename', cls: 'img-cat-tool', act: 'filter-rename', title: 'Rename this saved filter' }));
            ft.appendChild(chip(doc, { text: 'Delete saved filter', cls: 'img-cat-tool danger', act: 'filter-delete', title: 'Delete this saved filter (no tag or picture changes)' }));
            row.appendChild(ft);
        }
    }
    return row;
}
/* Import from another campaign\u2026 for saved filters: groups: [{ camp: id, name, filters: [{ name, tags }] }], each filter a row */
function drawFilterMenu(doc, menu, groups) {
    while (menu.firstChild) menu.removeChild(menu.firstChild);
    menu.appendChild(el(doc, 'div', 'party-menu-head', 'Bring in a saved filter'));
    if (!groups.length) menu.appendChild(el(doc, 'div', 'party-menu-note', 'No other campaign of yours has one.'));
    groups.forEach(function(g) {
        menu.appendChild(el(doc, 'div', 'party-menu-head', g.name));
        g.filters.forEach(function(f, i) { var b = menuItem(doc, { text: '\u2605 ' + f.name, act: 'filter-take', title: f.tags.length ? 'Tags: ' + f.tags.join(', ') : 'Words only' }); data(b, 'camp', g.camp); data(b, 'i', i); menu.appendChild(b); });
    });
    return menu;
}
// a menu row: { text, act, cat?, cls?, title?, mark? }
function menuItem(doc, o) {
    var b = el(doc, 'button', 'wb-tool-btn party-menu-item' + (o.cls ? ' ' + o.cls : ''), o.text);
    b.type = 'button';
    data(b, 'act', o.act); if (o.cat !== undefined) data(b, 'cat', o.cat);
    if (o.title) b.title = o.title;
    if (o.mark) b.appendChild(doc.createTextNode(' ' + o.mark));
    return b;
}
/* The tag menu of one picture or of the picked set (the owner, by prompt: "Add a Select button (Recommended)", with a Tags\u2026 list that adds
   to all or takes from all). m: { scene: true for Show as a scene\u2026, head, tags: [{ name, store, state: 'all' | 'some' | 'none', n, of }],
   from: '' or the one tag in view, move: [{ name, store }] }. A tag's row is a toggle: the caller takes it from all when every picture
   has it, else gives it to all. */
var STATE_MARK = { all: '\u2713', some: '\u2013', none: '' };
function tagState(n, of) { return n <= 0 ? 'none' : n >= of ? 'all' : 'some'; }
function drawMenu(doc, menu, m) {
    while (menu.firstChild) menu.removeChild(menu.firstChild);
    var tagRow = function(act) { return function(t) { menu.appendChild(menuItem(doc, { text: t.name, act: act, cat: t.name, mark: t.store === 'shared' ? '\u25C7' : '' })); }; };
    if (m.scene) menu.appendChild(menuItem(doc, { text: 'Show as a scene\u2026', act: 'scene', title: 'Show this picture big to everyone or to some players' }));
    var head = el(doc, 'div', 'party-menu-head', m.head); head.title = 'A click gives a tag to all of them, or takes it from all when they all have it'; menu.appendChild(head);
    (m.tags || []).forEach(function(t) {
        var st = STATE_MARK[t.state] !== undefined ? t.state : 'none', b = menuItem(doc, { text: '', act: 'toggle', cat: t.name, cls: 'img-tag-row img-tag-' + st });
        var mk = el(doc, 'span', 'img-tag-state', STATE_MARK[st]); mk.setAttribute('aria-hidden', 'true'); b.appendChild(mk);
        b.appendChild(doc.createTextNode(t.name + (t.store === 'shared' ? ' \u25C7' : '')));
        if (st === 'some') b.appendChild(el(doc, 'span', 'img-tag-some', t.n + ' of ' + t.of));
        b.title = st === 'all' ? (t.of > 1 ? 'All ' + t.of + ' have it. Click to take it from all' : 'It has this tag. Click to take it off') : st === 'some' ? t.n + ' of ' + t.of + ' have it. Click to give it to all' : (t.of > 1 ? 'None has it. Click to give it to all ' + t.of : 'Click to give it this tag');
        b.setAttribute('aria-pressed', st === 'all' ? 'true' : st === 'some' ? 'mixed' : 'false');
        menu.appendChild(b);
    });
    menu.appendChild(menuItem(doc, { text: '+ New tag\u2026', act: 'new-add' }));
    if (m.from) {
        menu.appendChild(el(doc, 'div', 'party-menu-head', 'Move from ' + m.from + ' to'));
        (m.move || []).forEach(tagRow('move'));
        menu.appendChild(menuItem(doc, { text: '+ New tag\u2026', act: 'new-move' }));
        menu.appendChild(menuItem(doc, { text: 'Remove from ' + m.from, act: 'remove', cat: m.from, cls: 'danger' }));
    }
    return menu;
}
// A grid cell's tag label (the names joined) and its title, after the cell is drawn
function cellTags(doc, cell, tags, label, hint) {
    var old = cell.querySelector ? cell.querySelector('.img-lib-tag') : null; if (old) old.parentNode.removeChild(old);
    var txt = tags.join(', ');
    if (label && txt) cell.insertBefore(el(doc, 'span', 'img-lib-tag', txt), cell.childNodes[1] || null);
    cell.title = (cell.dataset.name || '') + (txt ? ' \u00b7 ' + txt : '') + (hint ? ' \u2014 ' + hint : '');
    return cell;
}
// The preview's lines: the map the picture came from and its tags
function previewTags(doc, box, mapName, tags) {
    while (box.firstChild) box.removeChild(box.firstChild);
    var line = function(lead, v) { var d = el(doc, 'div', '', lead); d.appendChild(el(doc, 'b', '', v)); box.appendChild(d); };
    if (mapName) line('Map: ', mapName);
    line(tags.length === 1 ? 'Tag: ' : 'Tags: ', tags.length ? tags.join(', ') : 'none');
    return box;
}

var API = { LIMITS: LIMITS, RESERVED: RESERVED, tagName: tagName, pathKey: pathKey, filterWords: filterWords, cleanFilter: cleanFilter, cleanFilters: cleanFilters, cleanStore: cleanStore, storeEmpty: storeEmpty, mergeStores: mergeStores,
    matchTags: matchTags, words: words, matchWords: matchWords, sameFilter: sameFilter, freeName: freeName,
    chip: chip, drawRow: drawRow, drawFilterMenu: drawFilterMenu, menuItem: menuItem, tagState: tagState, drawMenu: drawMenu, cellTags: cellTags, previewTags: previewTags };
if (typeof window !== 'undefined') window.wpImgTagCore = API;
export { LIMITS, RESERVED, tagName, pathKey, filterWords, cleanFilter, cleanFilters, cleanStore, storeEmpty, mergeStores, matchTags, words, matchWords, sameFilter, freeName, chip, drawRow, drawFilterMenu, menuItem, tagState, drawMenu, cellTags, previewTags };
