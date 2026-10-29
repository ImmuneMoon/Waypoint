/* The export share sheet (1.6.0, backlog 34): the window that comes up before Export This Campaign, Share This Campaign and Export
   Everything write their file, and the card an import shows at the top of its box. The owner's answers are in sharecore.js, its pure half.

   The sheet: a cover picked from the pictures the file would carry, a title (the campaign's name to start with), an author, a version and a
   few words, then the contents by kind, each with its count and the size of its files, and a tick to keep it. Share This Campaign starts
   with Players unticked. Left as it came, the sheet hands the export nothing and the file is the one it always was. What was typed is
   remembered for the campaign on this computer (wp_shareCards), never sent.

   Every step logs to /api/log as "share v1 <step>" (steplog.js): counts and truth values, never a name or a word typed.
   Published as window.wpShare: open(scope, share), hide(). */
import * as SC from './sharecore.js';
import { picRef } from './safecore.js';
import { toast } from './io.js';

var MEM_KEY = 'wp_shareCards', MEM_MAX = 30, GRID_MAX = 300;
var _s = { open: false, gen: 0, scope: '', share: false, plan: null, sets: null, tally: null, data: 0, pics: [], cover: '', title0: '', built: false };
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
function drawKinds() {
    var t = _s.tally, total = _s.data;
    SC.KINDS.forEach(function(k) {
        var e = t[k], box = kindBox(k), nEl = el('shareN_' + k), bEl = el('shareB_' + k), file = SC.FILE_KINDS.indexOf(k) >= 0;
        if (nEl) nEl.textContent = e.n > 0 ? String(e.n) : 'none';
        if (bEl) bEl.textContent = file && e.bytes > 0 ? (e.unknown ? 'over ' : '') + SC.sizeWords(e.bytes) : '';
        if (box) { box.disabled = e.n <= 0 && !(file && e.bytes > 0); if (box.disabled) box.checked = true; }
        if (file && box && box.checked) total += e.bytes;
    });
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
    _s.title0 = _s.scope === 'all' ? 'My campaigns' : (plan.name || 'My campaign');
    var mem = memOf(), set = function(id, v) { var f = el(id); if (f) f.value = v; };
    set('shareName', str(mem.title) || _s.title0); set('shareAuthor', str(mem.author)); set('shareVersion', str(mem.version)); set('shareDesc', str(mem.desc));
    _s.cover = _s.pics.indexOf(mem.cover) >= 0 ? mem.cover : '';
    var head = el('shareTitle'); if (head) head.textContent = _s.share ? 'Share this campaign' : _s.scope === 'all' ? 'Export everything' : 'Export this campaign';
    var all = el('shareAllLine'); if (all) { all.hidden = _s.scope !== 'all'; all.textContent = _s.scope !== 'all' ? '' : plan.camps === 1 ? 'The counts cover your one campaign.' : 'The counts cover all ' + plan.camps + ' of your campaigns.'; }
    SC.KINDS.forEach(function(k) { var b = kindBox(k); if (b) b.checked = !(_s.share && k === 'players'); });
    var g = el('shareCoverGrid'); if (g) { g.hidden = true; g.textContent = ''; }
    _s.built = false;
    var pk = el('shareCoverPick'); if (pk) pk.disabled = false;
    drawCover(); drawKinds();
    m.style.display = 'flex'; _s.open = true;
    var t = _s.tally;
    log('shown', { maps: t.maps.n, pages: t.pages.n, chars: t.chars.n, pictures: t.pictures.n, sounds: t.sounds.n, music: t.music.n, videos: t.videos.n, players: t.players.n, camps: plan.camps, cover: !!_s.cover });
    var first = el('shareName'); if (first) first.focus();
}
function hide(why) {
    var m = el('shareModal'); if (!m || !shown()) return;
    m.style.display = 'none'; _s.open = false; _s.gen++;
    var g = el('shareCoverGrid'); if (g) { g.hidden = true; g.textContent = ''; }
    _s.built = false;
    if (why) log(why, {});
    var b = el('moreMenuBtn'); if (b && typeof b.focus === 'function') b.focus();
}
function go() {
    if (!shown() || !_s.plan) return;
    var v = function(id) { var f = el(id); return f ? str(f.value) : ''; };
    var form = { title: v('shareName'), author: v('shareAuthor'), version: v('shareVersion'), desc: v('shareDesc'), cover: _s.cover ? _s.cover.replace(/^\/saves\//, '') : '', leave: leaveList() };
    var blank = SC.isBlank(form, _s.title0);
    memPut({ title: form.title.trim() === _s.title0 ? '' : form.title, author: form.author, version: form.version, desc: form.desc, cover: _s.cover });
    var share = blank ? undefined : { card: { title: form.title.trim() || _s.title0, author: form.author, version: form.version, desc: form.desc }, cover: _s.cover, leave: form.leave, sizes: _s.plan.sizes };
    log('export', { scope: _s.scope, card: !blank, cover: !!_s.cover, left: form.leave.length, author: !!form.author.trim(), version: !!form.version.trim(), desc: !!form.desc.trim() });
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
    SC.KINDS.forEach(function(k) { var b = kindBox(k); if (b) b.addEventListener('change', function() { drawKinds(); log('tick', { kind: k, keep: !!this.checked }); }); });
}

wire();
var API = { open: open, hide: hide };
window.wpShare = API;
export { open, hide };
