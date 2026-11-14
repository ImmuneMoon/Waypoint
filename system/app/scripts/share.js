/* The export share sheet (1.6.0, backlog 34): the window that comes up before Export this campaign, Share this campaign and Export
   Everything write their file, and the card an import shows at the top of its box. The owner's answers are in sharecore.js, its pure half.

   The sheet: a cover picked from the pictures the file would carry, a title (the campaign's name to start with), an author, a version and a
   few words, then the contents by kind, each with its count and the size of its files, and a tick to keep it. Full export (once Share this
   campaign) starts with Players unticked. Left as it came, the sheet hands the export nothing and the file is the one it always was. What was typed is
   remembered for the campaign on this computer (wp_shareCards), never sent.

   The import: readCard reads share.json from the archive (64 KB at most) and cleans it (sharecore cleanCard), then reads the cover's own entry
   (16 MB at most, its checksum checked), takes it only when its first bytes say it is a PNG, JPEG, GIF or WebP picture, and makes it a blob
   address on this machine. showCard draws the card into #importCard: every word as text, the picture through picRef. Nothing of the file is
   drawn as markup, and a file with no card shows the Import box as it always was.

   Export all (1.6.2, backlog 227; the owner: "just full export and have options on whether that means with images or not, and other
   helpful options"): Share this campaign became Full export, plain ticks and no preset. Templates are a kind of their own. Below the
   kinds, the pictures by the Image
   Library's tags, each tag with its count, its tick and its Private switch (written to the store that holds the tag, imgtagcore; on Full
   export a private tag starts unticked), and Pick..., a grid that leaves single pictures out or puts them back. A picture left out keeps its place in data.json, and share.json names it.

   Every step logs to /api/log as "share v1 <step>" (steplog.js): counts and truth values, never a name or a word typed.
   Published as window.wpShare: open(scope, share), hide(), readCard(entries), showCard(read). */
import * as SC from './sharecore.js';
import { picRef } from './safecore.js';
import { toast, save } from './io.js';
import { state } from './state.js';
import { getActiveCampaign } from './models.js';
import * as ITC from './imgtagcore.js';

var MEM_KEY = 'wp_shareCards', MEM_MAX = 30, GRID_MAX = 300, PICK_MAX = 600;
var _s = { open: false, gen: 0, scope: '', share: false, plan: null, sets: null, tally: null, data: 0, pics: [], cover: '', title0: '', built: false,
    allPics: [], stores: [], off: {}, pickOut: {}, pickIn: {}, picked: false };   // 1.6.2 (backlog 227)
function el(id) { return document.getElementById(id); }
function log(step, facts) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('share v1', step, facts); } catch (e) {} }
// [sinkcheck:sharetip-start]
function tip(e, text) { if (!e) return; e.removeAttribute('title'); e.setAttribute('data-tip', text); }   // a tooltip set while the page runs (tooltips.js)
// [sinkcheck:sharetip-end]

// What was typed, kept per campaign on this computer: { 'c:<id>' or 'all': { title, author, version, desc, cover } }, the newest last
function memAll() { try { var o = JSON.parse(localStorage.getItem(MEM_KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } }
function memKey() { return _s.scope === 'all' ? 'all' : 'c:' + (_s.plan && _s.plan.campId || ''); }
function memOf() { var all = memAll(), k = memKey(), m = Object.prototype.hasOwnProperty.call(all, k) ? all[k] : null; return m && typeof m === 'object' ? m : {}; }
function memPut(rec) {
    try {
        var all = memAll(), k = memKey(); delete all[k];
        if (Object.keys(rec).some(function(f) { return !!rec[f]; })) all[k] = rec;   // an empty sheet is not kept
        var ks = Object.keys(all); while (ks.length > MEM_MAX) delete all[ks.shift()];
        localStorage.setItem(MEM_KEY, JSON.stringify(all));
    } catch (e) {}
}
function str(v) { return typeof v === 'string' ? v : ''; }

/* ---------- the sheet ---------- */
function shown() { var m = el('shareModal'); return !!m && m.style.display === 'flex'; }
function kindBox(k) { return el('shareKeep_' + k); }
function leaveList() { return SC.KINDS.filter(function(k) { var b = kindBox(k); return !!b && !b.disabled && !b.checked; }); }
// [sinkcheck:sharegrid-start]
function picAddr(p) { return picRef(encodeURI(p)); }
function drawCover() {
    var img = el('shareCoverImg'), none = el('shareCoverNone'), clr = el('shareCoverClear'), src = _s.cover ? picAddr(_s.cover) : '';
    if (img) { if (src) { img.src = src; img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; } }
    if (none) none.hidden = !!src;
    if (clr) clr.disabled = !src;
}
function buildGrid() {
    var g = el('shareCoverGrid'); if (!g) return;
    g.textContent = '';
    if (!_s.pics.length) { var w = document.createElement('div'); w.className = 'gen-line'; w.textContent = 'The file carries no picture to use as a cover.'; g.appendChild(w); return; }
    _s.pics.forEach(function(p) {
        var b = document.createElement('button'), im = document.createElement('img');
        b.type = 'button'; b.className = 'share-thumb'; b.setAttribute('data-path', p);
        b.setAttribute('aria-label', p.split('/').pop());
        tip(b, p.split('/').pop());   // the file's own name, as text
        im.alt = ''; im.loading = 'lazy'; im.src = picAddr(p);
        b.appendChild(im);
        b.addEventListener('click', function() { _s.cover = this.getAttribute('data-path') || ''; drawCover(); g.hidden = true; log('cover-pick', { n: _s.pics.length }); var pk = el('shareCoverPick'); if (pk) pk.focus(); });
        g.appendChild(b);
    });
}
// [sinkcheck:sharegrid-end]
/* ---------- 1.6.2 (backlog 227): the starting points, the pictures by tag, Pick... ---------- */
// The Image Library's live stores the file's pictures are tagged in: each campaign's own, then the shared one
function liveStores() {
    var app = state.appState || {}, out = [], add = function(s) { if (s && typeof s === 'object' && Array.isArray(s.list)) out.push(s); };
    if (_s.scope === 'all') Object.keys(app.campaigns || {}).forEach(function(k) { var c = app.campaigns[k]; if (c && typeof c === 'object') add(c.imageCats); });
    else { var c = getActiveCampaign(); if (c) add(c.imageCats); }
    add(app.imageCats);
    return out;
}
function outNow() { return SC.picsOut(_s.allPics, _s.stores, _s.sets, _s.off, _s.pickOut, _s.pickIn); }
function sharedTag(name) { var sh = (state.appState || {}).imageCats; return !!sh && Array.isArray(sh.list) && sh.list.indexOf(name) >= 0 && !(_s.stores.length > 1 && _s.stores.slice(0, -1).some(function(s) { return s.list.indexOf(name) >= 0; })); }
// [sinkcheck:sharetags-start]
function drawTags() {
    var box = el('shareTags'), head = el('shareTagsHead'); if (!box) return;
    var tr = SC.tagRows(_s.allPics, _s.stores, _s.sets), picsOn = !!kindBox('pictures') && kindBox('pictures').checked;
    box.textContent = '';
    var none = !_s.allPics.length; if (head) head.hidden = none; box.hidden = none;
    var row = function(name, n, isNone, priv) {
        var lab = document.createElement('label'), cb = document.createElement('input'), nm = document.createElement('span'), cnt = document.createElement('span');
        lab.className = 'gen-tick share-kind share-tag' + (priv ? ' priv' : '');
        cb.type = 'checkbox'; cb.checked = _s.off[isNone ? SC.TAG_NONE : name] !== true; cb.disabled = !picsOn; cb.setAttribute('data-tag', isNone ? SC.TAG_NONE : name);
        nm.className = 'share-kname'; nm.textContent = isNone ? 'No tag' : name + (sharedTag(name) ? ' \u25C7' : '');
        cnt.className = 'share-kn'; cnt.textContent = String(n);
        lab.appendChild(cb); lab.appendChild(nm); lab.appendChild(cnt);
        tip(lab, isNone ? 'Pictures that wear no tag' : (priv ? 'A private tag: it starts unticked on Full export' : 'Pictures that wear this tag') + '. A picture with several tags goes only when all of them are ticked.');
        if (!isNone) {
            var pb = document.createElement('button'); pb.type = 'button'; pb.className = 'tool ghost share-priv'; pb.textContent = priv ? 'Private \u2713' : 'Private';
            pb.setAttribute('aria-pressed', priv ? 'true' : 'false'); pb.setAttribute('data-priv', name);
            tip(pb, priv ? 'Private: it starts unticked on Full export. Press to clear the mark' : 'Mark the tag private, as in the Image Library: it starts unticked on Full export');
            lab.appendChild(pb);
        }
        box.appendChild(lab);
    };
    tr.rows.forEach(function(r) { row(r.name, r.n, false, r.priv); });
    if (tr.none) row('', tr.none, true, false);
}
function drawPicks() {
    var g = el('sharePickGrid'); if (!g) return;
    if (g.hidden) { g.textContent = ''; return; }   // put away: nothing drawn, nothing kept
    var out = outNow(), set = Object.create(null); out.forEach(function(p) { set[p] = 1; });
    g.textContent = '';
    _s.allPics.slice(0, PICK_MAX).forEach(function(p) {
        var b = document.createElement('button'), im = document.createElement('img'), gone = !!set[p], nm = p.split('/').pop();
        b.type = 'button'; b.className = 'share-thumb share-pick' + (gone ? ' out' : ''); b.setAttribute('data-path', p);
        b.setAttribute('aria-pressed', gone ? 'true' : 'false'); b.setAttribute('aria-label', nm + (gone ? ', left out' : ''));
        tip(b, nm + (gone ? '. Left out: press to put it back' : '. Press to leave it out'));
        im.alt = ''; im.loading = 'lazy'; im.src = picAddr(p);
        im.addEventListener('error', function() { this.hidden = true; b.classList.add('nopic'); });   // a missing file is quiet: the cell stays, empty
        b.appendChild(im);
        g.appendChild(b);
    });
    if (_s.allPics.length > PICK_MAX) { var w = document.createElement('div'); w.className = 'gen-line share-pick-more'; w.textContent = 'The first ' + PICK_MAX + ' of ' + _s.allPics.length + ' pictures. Tags reach the rest.'; g.appendChild(w); }
}
// [sinkcheck:sharetags-end]
function drawPicsLine() {
    var line = el('sharePicsLine'), pk = el('sharePick'); if (!line) return;
    var picsOn = !!kindBox('pictures') && kindBox('pictures').checked, n = picsOn ? outNow().length : _s.allPics.length;
    if (pk) pk.disabled = !picsOn || !_s.allPics.length;
    line.textContent = !_s.allPics.length ? '' : !picsOn ? 'No picture goes in. Their places are kept.' : n ? (n === 1 ? 'One picture is left out. Its place is kept.' : n + ' pictures are left out. Their places are kept.') : 'Every picture goes in.';
}
function allChanged() { drawKinds(); drawTags(); drawPicsLine(); drawPicks(); }
function drawKinds() {
    var t = _s.tally, total = _s.data;
    SC.KINDS.forEach(function(k) {
        var e = t[k], box = kindBox(k), nEl = el('shareN_' + k), bEl = el('shareB_' + k), file = SC.FILE_KINDS.indexOf(k) >= 0;
        if (nEl) nEl.textContent = e.n > 0 ? String(e.n) : 'none';
        if (bEl) bEl.textContent = file && e.bytes > 0 ? (e.unknown ? 'over ' : '') + SC.sizeWords(e.bytes) : '';
        if (box) { box.disabled = e.n <= 0 && !(file && e.bytes > 0); if (box.disabled) box.checked = true; }
        if (file && box && box.checked) total += e.bytes;
    });
    if (_s.plan && _s.plan.sizes && kindBox('pictures') && kindBox('pictures').checked) outNow().forEach(function(p) { var b = _s.plan.sizes[p]; if (typeof b === 'number' && b > 0) total -= b; });   // 1.6.2: the pictures left out one by one
    if (total < 0) total = 0;
    var line = el('shareTotal');
    if (line) line.textContent = 'About ' + SC.sizeWords(total) + ' in all.' + (_s.plan && _s.plan.unlisted ? ' The pictures no map uses yet could not be listed.' : '');
}
async function open(scope, share) {
    if (shown()) return;
    var gen = ++_s.gen, m = el('shareModal');
    if (!m) { if (typeof window.wpExportScope === 'function') window.wpExportScope(scope); return; }
    log('open', { scope: scope === 'all' ? 'all' : 'campaign', share: !!share });
    var plan = typeof window.wpExportPlan === 'function' ? await window.wpExportPlan(scope) : null;
    if (gen !== _s.gen) return;
    if (!plan) { log('open-none', {}); return; }
    _s.scope = scope === 'all' ? 'all' : 'campaign'; _s.share = !!share; _s.plan = plan;
    _s.sets = SC.fileSets(plan.payload);
    _s.tally = SC.tally(plan.payload, plan.paths, plan.sizes);
    try { _s.data = new TextEncoder().encode(JSON.stringify(plan.payload, null, 2)).length; } catch (e) { _s.data = 0; }
    _s.pics = plan.paths.filter(function(p) { return SC.kindOf(p, _s.sets) === 'pictures' && !!SC.coverName(p.replace(/^\/saves\//, '')); }).slice(0, GRID_MAX);
    _s.allPics = plan.paths.filter(function(p) { return SC.kindOf(p, _s.sets) === 'pictures'; });   // 1.6.2 (backlog 227): every picture the file would carry
    _s.stores = liveStores(); _s.off = {}; _s.pickOut = {}; _s.pickIn = {}; _s.picked = false;
    var pg = el('sharePickGrid'); if (pg) { pg.hidden = true; pg.textContent = ''; }
    _s.title0 = _s.scope === 'all' ? 'My campaigns' : (plan.name || 'My campaign');
    var mem = memOf(), set = function(id, v) { var f = el(id); if (f) f.value = v; };
    set('shareName', str(mem.title) || _s.title0); set('shareAuthor', str(mem.author)); set('shareVersion', str(mem.version)); set('shareDesc', str(mem.desc));
    _s.cover = _s.pics.indexOf(mem.cover) >= 0 ? mem.cover : '';
    var head = el('shareTitle'); if (head) head.textContent = _s.share ? 'Full export' : _s.scope === 'all' ? 'Export everything' : 'Export this campaign';
    var all = el('shareAllLine'); if (all) { all.hidden = _s.scope !== 'all'; all.textContent = _s.scope !== 'all' ? '' : plan.camps === 1 ? 'The counts cover your one campaign.' : 'The counts cover all ' + plan.camps + ' of your campaigns.'; }
    SC.KINDS.forEach(function(k) { var b = kindBox(k); if (b) b.checked = !(_s.share && k === 'players'); });
    var g = el('shareCoverGrid'); if (g) { g.hidden = true; g.textContent = ''; }
    _s.built = false;
    var pk = el('shareCoverPick'); if (pk) pk.disabled = false;
    drawCover(); drawKinds();
    _s.off = _s.share ? SC.privOff(_s.stores) : {};   // 1.6.2 (backlog 227): on Full export a private tag starts unticked; the two exports start with every tick on, as before
    drawTags(); drawPicsLine();
    m.style.display = 'flex'; _s.open = true;
    var t = _s.tally;
    log('shown', { maps: t.maps.n, pages: t.pages.n, chars: t.chars.n, pictures: t.pictures.n, sounds: t.sounds.n, music: t.music.n, videos: t.videos.n, players: t.players.n, camps: plan.camps, cover: !!_s.cover, templates: t.templates.n, off: Object.keys(_s.off).length, tags: SC.tagRows(_s.allPics, _s.stores, _s.sets).rows.length });
    var first = el('shareName'); if (first) first.focus();
}
function hide(why) {
    var m = el('shareModal'); if (!m || !shown()) return;
    m.style.display = 'none'; _s.open = false; _s.gen++;
    var g = el('shareCoverGrid'); if (g) { g.hidden = true; g.textContent = ''; }
    var pg = el('sharePickGrid'); if (pg) { pg.hidden = true; pg.textContent = ''; }
    _s.built = false;
    if (why) log(why, {});
    var b = el('moreMenuBtn'); if (b && typeof b.focus === 'function') b.focus();
}
function go() {
    if (!shown() || !_s.plan) return;
    var v = function(id) { var f = el(id); return f ? str(f.value) : ''; };
    var picsOn = !!kindBox('pictures') && kindBox('pictures').checked;
    var form = { title: v('shareName'), author: v('shareAuthor'), version: v('shareVersion'), desc: v('shareDesc'), cover: _s.cover ? _s.cover.replace(/^\/saves\//, '') : '', leave: leaveList(), pics: picsOn ? outNow() : [] };
    var blank = SC.isBlank(form, _s.title0);
    memPut({ title: form.title.trim() === _s.title0 ? '' : form.title, author: form.author, version: form.version, desc: form.desc, cover: _s.cover });
    var share = blank ? undefined : { card: { title: form.title.trim() || _s.title0, author: form.author, version: form.version, desc: form.desc }, cover: _s.cover, leave: form.leave, pics: form.pics, sizes: _s.plan.sizes };
    log('export', { scope: _s.scope, card: !blank, cover: !!_s.cover, left: form.leave.length, pics: form.pics.length, author: !!form.author.trim(), version: !!form.version.trim(), desc: !!form.desc.trim() });
    var scope = _s.scope;
    hide('');
    // straight from the click: a large export asks for its file first, while the press still counts (io.js exportScope)
    var p = typeof window.wpExportScope === 'function' ? window.wpExportScope(scope, share) : null;
    if (p && typeof p.then === 'function') p.then(function(r) { log('done', { ok: !!r, zip: !!(r && !r.text), card: !blank }); }, function() { log('failed', { card: !blank }); toast('The export could not be made.'); });
}
function wire() {
    var m = el('shareModal'); if (!m) return;
    var on = function(id, fn) { var b = el(id); if (b) b.addEventListener('click', fn); };
    on('shareCancel', function() { hide('cancel'); });
    on('shareGo', go);
    on('shareCoverPick', function() {
        var g = el('shareCoverGrid'); if (!g) return;
        if (!_s.built) { buildGrid(); _s.built = true; }
        g.hidden = !g.hidden;
        if (!g.hidden) log('cover-grid', { n: _s.pics.length });
    });
    on('shareCoverClear', function() { _s.cover = ''; drawCover(); log('cover-clear', {}); });
    SC.KINDS.forEach(function(k) { var b = kindBox(k); if (b) b.addEventListener('change', function() { allChanged(); log('tick', { kind: k, keep: !!this.checked }); }); });
    // 1.6.2 (backlog 227)
    var tags = el('shareTags');
    if (tags) {
        tags.addEventListener('change', function(e) { var cb = e.target; if (!cb || !cb.getAttribute || cb.getAttribute('data-tag') === null) return; var k = cb.getAttribute('data-tag'); if (cb.checked) delete _s.off[k]; else _s.off[k] = true; drawKinds(); drawPicsLine(); drawPicks(); log('tag-tick', { keep: !!cb.checked, none: k === SC.TAG_NONE }); });
        tags.addEventListener('click', function(e) {
            var b = e.target && e.target.closest ? e.target.closest('[data-priv]') : null; if (!b) return;
            e.preventDefault(); e.stopPropagation();   // inside the row's label: the press is the switch's, never the tick's
            var name = b.getAttribute('data-priv'), was = _s.stores.some(function(s) { return s.list.indexOf(name) >= 0 && s.priv && s.priv[name] === true; }), now = false;
            _s.stores.forEach(function(s) { if (s.list.indexOf(name) >= 0) now = ITC.setPrivate(s, name, !was) || now; });
            if (now && _s.share) _s.off[name] = true;   // marked private on Full export: its pictures leave the file at once, as a private tag starts
            try { save(true); } catch (err) {}
            drawKinds(); drawTags(); drawPicsLine(); drawPicks();
            log('tag-private', { on: now });
            var again = el('shareTags') && el('shareTags').querySelector('[data-priv="' + String(name).replace(/["\\]/g, '\\$&') + '"]'); if (again) again.focus();
        });
    }
    on('sharePick', function() {
        var g = el('sharePickGrid'); if (!g) return;
        g.hidden = !g.hidden; if (!g.hidden) { drawPicks(); log('pick-grid', { n: _s.allPics.length }); } else g.textContent = '';
    });
    var pg = el('sharePickGrid');
    if (pg) pg.addEventListener('click', function(e) {
        var b = e.target && e.target.closest ? e.target.closest('.share-pick') : null; if (!b) return;
        var p = b.getAttribute('data-path') || '', gone = b.getAttribute('aria-pressed') === 'true';
        if (gone) { if (_s.pickOut[p]) delete _s.pickOut[p]; else _s.pickIn[p] = true; }
        else { if (_s.pickIn[p]) delete _s.pickIn[p]; else _s.pickOut[p] = true; }
        drawKinds(); drawPicsLine(); drawPicks();
        var again = pg.querySelector('[data-path="' + p.replace(/["\\]/g, '\\$&') + '"]'); if (again) again.focus();
        log('pick', { out: !gone });
    });
}

/* ---------- the import's card ---------- */
// [zipcheck:shareread-start]
var _cardUrl = '';
function dropUrl() { if (_cardUrl) { try { URL.revokeObjectURL(_cardUrl); } catch (e) {} _cardUrl = ''; } }
// What a picture's first bytes say it is, or '' for anything else
function picType(b) {
    if (!b || b.length < 12) return '';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
    return '';
}
async function readCard(entries) {
    dropUrl();
    var list = Array.isArray(entries) ? entries : [], find = function(n) { for (var i = 0; i < list.length; i++) if (list[i] && list[i].name === n) return list[i]; return null; };
    var e = find('share.json'); if (!e) return null;
    if (!(typeof e.size === 'number' && e.size > 0 && e.size <= SC.LIMITS.card)) { log('card-refused', { why: 'size' }); return null; }
    var card = null;
    try { card = SC.cleanCard(JSON.parse(new TextDecoder().decode(await e.bytes()))); } catch (err) { card = null; }
    if (!card) { log('card-refused', { why: 'shape' }); return null; }
    var url = '', ce = card.cover ? find(card.cover) : null;
    if (ce && typeof ce.size === 'number' && ce.size > 0 && ce.size <= SC.LIMITS.cover) {
        try { var b = await ce.bytes(), type = picType(b); if (type) url = URL.createObjectURL(new Blob([b], { type: type })); } catch (err) { url = ''; }
    }
    _cardUrl = url;
    log('card-read', { cover: !!card.cover, picture: !!url, left: card.left.length, kinds: Object.keys(card.contents).length });
    return { card: card, url: url };
}
// [zipcheck:shareread-end]
// [sinkcheck:sharecard-start]
function showCard(read) {
    var box = el('importCard'); if (!box) return;
    var img = el('importCardCover'), card = read && read.card ? read.card : null;
    if (!card) { box.hidden = true; if (img) { img.removeAttribute('src'); img.hidden = true; } dropUrl(); if (!read && typeof showLook === 'function') showLook(null); return; }   // 1.6.2: the box put away takes the look with it
    var put = function(id, text) { var t = el(id); if (t) { t.textContent = text; t.hidden = !text; } };
    put('importCardTitle', card.title || 'A shared campaign');
    put('importCardBy', SC.byWords(card));
    put('importCardDesc', card.desc);
    put('importCardContents', SC.contentsWords(card));
    put('importCardLeft', SC.leftWords(card));
    var src = read.url ? picRef(read.url) : '';
    if (img) { if (src) { img.src = src; img.hidden = false; } else { img.removeAttribute('src'); img.hidden = true; } }
    box.hidden = false;
    log('card-shown', { picture: !!src, desc: !!card.desc, left: card.left.length });
}
// [sinkcheck:sharecard-end]
// [sinkcheck:sharelook-start]
// 1.6.2 (backlog 227; the owner, by prompt: "A look before it lands"): what a file holds, by kind, counted from data.json and the archive's
// entry names before anything is written, drawn into #importLook as text. data: null puts it away
function showLook(data, names) {
    var box = el('importLook'), list = el('importLookList'); if (!box || !list) return null;
    list.textContent = '';
    if (!data) { box.hidden = true; return null; }
    var t = SC.lookOf(data, names), words = SC.lookWords(t);
    words.forEach(function(w) { var li = document.createElement('li'); li.textContent = w; list.appendChild(li); });
    if (!words.length) { var li0 = document.createElement('li'); li0.textContent = 'Nothing but the campaign itself'; list.appendChild(li0); }
    box.hidden = false;
    var f = {}; SC.LOOK_KINDS.forEach(function(k) { f[k] = t[k]; }); f.zip = Array.isArray(names);
    log('look-shown', f);
    return t;
}
// [sinkcheck:sharelook-end]

wire();
var API = { open: open, hide: hide, readCard: readCard, showCard: showCard, showLook: showLook, picType: picType, log: log };
window.wpShare = API;
export { open, hide, readCard, showCard, showLook, picType };
