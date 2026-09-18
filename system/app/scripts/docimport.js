/* Markdown in and out for planners and handbook pages (1.5.0, handbook slice 3) — the app half.
   docmd.js parses and writes the dialect; this module owns the files, the preview dialog
   (#docImportModal), the uploads and the entry points:
     • "Import document…" in the planner toolbar (#plannerImportBtn): appends to the open planner or page;
     • the Planners / Handbook header file buttons (#plannerFromFileBtn / #docFromFileBtn): a new item;
     • the global Import button (main.js hands .md / .markdown / .txt-that-is-not-JSON files and zips
       that hold a .md to importFile(): the dialog asks whether it becomes a planner or a page);
     • "Save Markdown" on the Export menu (#exportMdBtn): the open planner or page, a .zip when it
       has pictures (images/<itemId>/<name> beside the .md), else a .md;
     • the template download in Help (#helpMdTemplateBtn).
   Pictures are uploaded first, every upload awaited, then the blocks are built and saved once — one
   undo step, and Cancel leaves no files and no save. Everything goes through wpCanPersistLocal. */
import { state } from './state.js';
import { uid, createNewPlanner, createNewDoc, getActiveCampaign, getActiveMap } from './models.js';
import { save, toast } from './io.js';
import { updateSidebarNav } from './sidebar.js';
import { getUniqueItemTitle } from './dialogs.js';
import { zipRead, zipCreate } from './zip.js';
import { DOC_BLOCKS } from './docrender.js';
import { markdownToBlocks, docToMarkdown, detectBundle, PLANNER_BLOCKS, LIMITS, TEMPLATE } from './docmd.js';

var ui = function(id) { return document.getElementById(id); };
function render() { if (window.appRender) window.appRender(); }
function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function canWrite() { if (window.wpStream) return false; if (!window.wpCanPersistLocal || !window.wpCanPersistLocal()) { toast('Not while you\'re at someone else\'s table.'); return false; } return true; }
function downloadBlob(name, blob) { var url = URL.createObjectURL(blob); var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function() { URL.revokeObjectURL(url); }, 1000); }
function slug(s) { return String(s || 'document').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'document'; }
var TYPE_LABEL = { h1: 'Title', h2: 'Section', h3: 'Sub-heading', text: 'Text', lede: 'Lead text', oneline: 'One-line summary', callout: 'Callout', flare: 'Flare', image: 'Picture', table: 'Table', node: 'Scene node', rule: 'Line', diagram: 'Diagram', flowchart: 'Flowchart' };
// Which types a row may be flipped to: prose among prose, headings among headings, table ↔ scene node on a planner
function alternatives(type, kind) {
    if (type === 'text' || type === 'lede' || type === 'oneline' || type === 'callout' || type === 'flare') return ['text', 'lede', 'oneline', 'callout', 'flare'];
    if (type === 'h2' || type === 'h3') return kind === 'doc' ? ['h2', 'h3'] : ['h2'];
    if (type === 'node' && kind === 'planner') return ['node'];
    return [type];
}
function snippet(b) {
    var s = b.title || b.caption || (b.content ? String(b.content).replace(/<[^>]+>/g, ' ') : '') || (b.cols ? b.cols.join(' | ') : '') || (b.nodes ? b.nodes.map(function(n) { return n.text; }).join(' → ') : '');
    s = String(s).replace(/\s+/g, ' ').trim();
    return s.length > 90 ? s.slice(0, 88) + '…' : s;
}

/* ---------- reading what was picked or dropped ---------- */
function readText(file) { return file.text(); }
function dataUrlToBlob(u) {
    var m = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(u); if (!m) return null;
    try {
        if (m[2]) { var bin = atob(m[3].replace(/\s/g, '')), arr = new Uint8Array(bin.length); for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); return new Blob([arr], { type: m[1] || 'application/octet-stream' }); }
        return new Blob([decodeURIComponent(m[3])], { type: m[1] || 'text/plain' });
    } catch (e) { return null; }
}
function extOf(mime) { return { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' }[String(mime || '').toLowerCase()] || 'png'; }
// files: File[] (a .md / .markdown / .txt, its pictures, or a .zip bundle) → { text, fileName, pictures: [{ path, blob }] } or null
async function gather(files) {
    var text = null, fileName = '', pictures = [];
    for (var i = 0; i < files.length; i++) {
        var f = files[i], nm = f.name || 'file';
        if (/\.zip$/i.test(nm)) {
            var entries;
            try { entries = await zipRead(await f.arrayBuffer()); } catch (e) { toast('Could not read the zip: ' + e.message); return null; }
            var bundle = detectBundle(entries);
            if (!bundle) { toast('That zip holds no Markdown file.'); return null; }
            text = new TextDecoder().decode(bundle.md.data); fileName = bundle.md.name.split('/').pop();
            bundle.files.forEach(function(en) { if (en !== bundle.md && /\.(png|jpe?g|gif|webp|svg)$/i.test(en.name)) pictures.push({ path: en.name.indexOf(bundle.base) === 0 ? en.name.slice(bundle.base.length) : en.name, blob: new Blob([en.data]) }); });
        } else if (/\.(md|markdown|txt)$/i.test(nm)) {
            if (text === null) { text = await readText(f); fileName = nm; } else toast('Only the first Markdown file was read (' + fileName + ').');
        } else if (/^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|svg)$/i.test(nm)) {
            pictures.push({ path: (f.webkitRelativePath || nm), blob: f });
        }
    }
    if (text === null) { toast('Pick a Markdown file (.md), or a zip that holds one.'); return null; }
    if (text.length > LIMITS.text) toast('The file is longer than 2 MB; only the first 2 MB were read.');
    return { text: text, fileName: fileName, pictures: pictures };
}
// A picture reference from the file → the picked picture (full relative path first, then the file name alone, case-insensitive)
function findPicture(pictures, ref) {
    var want = String(ref).replace(/\\/g, '/').replace(/^\.\//, '').toLowerCase(), base = want.split('/').pop();
    return pictures.find(function(p) { return p.path.replace(/\\/g, '/').toLowerCase() === want; }) || pictures.find(function(p) { return p.path.replace(/\\/g, '/').toLowerCase().split('/').pop() === base; }) || null;
}

/* ---------- the dialog ---------- */
var pending = null;   // { kind, mode, parentId, parsed, sources: [{ index, blob, name } | null], fileName }
function targetKind(opts) {
    if (opts.kind === 'planner' || opts.kind === 'doc') return opts.kind;
    var am = getActiveMap(); return am && (am.type === 'planner' || am.type === 'doc') ? am.type : 'doc';
}
async function openImport(opts) {
    opts = opts || {};
    if (!canWrite()) return;
    var camp = getActiveCampaign(); if (!camp) { toast('Open a campaign first.'); return; }
    if (!opts.files || !opts.files.length) {
        var inp = ui('docImportFile'); if (!inp) return;
        inp.value = '';
        inp.onchange = function() { var fl = Array.from(inp.files || []); inp.onchange = null; if (fl.length) openImport(Object.assign({}, opts, { files: fl })); };
        inp.click();
        return;
    }
    var got = await gather(Array.from(opts.files)); if (!got) return;
    var kind = targetKind(opts);
    var parsed;
    try { parsed = markdownToBlocks(got.text, { kind: kind, items: camp.items }); } catch (e) { console.error(e); toast('Could not read that file as Markdown: ' + e.message); return; }
    if (!parsed.blocks.length) { toast('Nothing in that file became a block.'); return; }
    // pictures: what each image block will upload (nothing uploads until Import)
    var sources = parsed.images.map(function(im) {
        if (im.kind === 'data') { var bl = dataUrlToBlob(im.value); if (!bl) { parsed.notes.push('An embedded picture could not be decoded.'); return null; } return { index: im.index, blob: bl, name: 'picture.' + extOf(bl.type) }; }
        var pic = findPicture(got.pictures, im.value);
        if (!pic) { parsed.notes.push('Picture "' + im.name + '" was not among the files picked — an empty picture block keeps its caption.'); return null; }
        return { index: im.index, blob: pic.blob, name: pic.path.split('/').pop() };
    });
    parsed._text = got.text;   // kept for a planner ↔ page re-parse from the dialog's target select
    var byRef = {}; sources.forEach(function(s, j) { var im = parsed.images[j]; if (s && im) byRef[im.value] = s; });
    pending = { kind: kind, mode: opts.mode || 'new', parentId: opts.parentId || null, parsed: parsed, sources: sources, sourcesByRef: byRef, fileName: got.fileName, ask: opts.kind !== 'planner' && opts.kind !== 'doc' };
    showDialog();
}
function showDialog() {
    var m = ui('docImportModal'); if (!m || !pending) return;
    var p = pending.parsed, kind = pending.kind, am = getActiveMap();
    var counts = {}; p.blocks.forEach(function(b) { counts[b.type] = (counts[b.type] || 0) + 1; });
    ui('docImportSummary').textContent = p.blocks.length + ' block' + (p.blocks.length === 1 ? '' : 's') + ' from ' + pending.fileName + ': ' + Object.keys(counts).map(function(t) { return counts[t] + ' ' + (TYPE_LABEL[t] || t).toLowerCase() + (counts[t] === 1 ? '' : 's'); }).join(', ') + '.';
    var rows = p.blocks.map(function(b, i) {
        var alts = alternatives(b.type, kind);
        return '<div class="dimp-row" data-i="' + i + '"><input type="checkbox" class="dimp-keep" checked title="Untick to leave this block out">' +
            (alts.length > 1 ? '<select class="dimp-type">' + alts.map(function(t) { return '<option value="' + t + '"' + (t === b.type ? ' selected' : '') + '>' + TYPE_LABEL[t] + '</option>'; }).join('') + '</select>' : '<span class="dimp-typelabel">' + (TYPE_LABEL[b.type] || b.type) + '</span>') +
            '<span class="dimp-snip">' + esc(snippet(b)) + '</span></div>';
    });
    ui('docImportRows').innerHTML = rows.join('');
    ui('docImportNotes').innerHTML = p.notes.length ? '<div class="dimp-notes-title">Notes</div>' + p.notes.map(function(n) { return '<div class="dimp-note">' + esc(n) + '</div>'; }).join('') : '';
    var sel = ui('docImportTarget'), opts = [];
    var canAppend = am && (am.type === kind) && (pending.mode === 'append' || pending.ask);
    if (canAppend) opts.push('<option value="append">Append to “' + esc((am.meta && am.meta.title) || '') + '”</option>');
    if (pending.ask || kind === 'planner') opts.push('<option value="new:planner"' + (kind === 'planner' && pending.mode !== 'append' ? ' selected' : '') + '>New planner' + (pending.parentId ? ' nested here' : '') + '</option>');
    if (pending.ask || kind === 'doc') opts.push('<option value="new:doc"' + (kind === 'doc' && pending.mode !== 'append' ? ' selected' : '') + '>New handbook page' + (pending.parentId ? ' nested here' : '') + '</option>');
    sel.innerHTML = opts.join('');
    if (pending.mode === 'append' && canAppend) sel.value = 'append';
    sel.onchange = function() {   // planner ↔ page changes the roster: parse again for that kind
        var v = sel.value; if (v.indexOf('new:') !== 0) return;
        var k2 = v.slice(4); if (k2 === pending.kind) return;
        pending.kind = k2;
        var camp = getActiveCampaign();
        try { var reparsed = markdownToBlocks(pending.parsed._text || '', { kind: k2, items: camp.items }); } catch (e) { return; }
        reparsed._text = pending.parsed._text;
        pending.parsed = reparsed;
        pending.sources = reparsed.images.map(function(im) { var old = pending.sourcesByRef && pending.sourcesByRef[im.value]; return old ? { index: im.index, blob: old.blob, name: old.name } : null; });
        showDialog();
    };
    m.style.display = 'flex';
}
function closeDialog() { var m = ui('docImportModal'); if (m) m.style.display = 'none'; pending = null; }
// Change a block's type where the dialog allows it
function retype(b, t) {
    if (b.type === t) return b;
    var o = Object.assign({}, b, { type: t });
    if (t === 'h2' || t === 'h3') { delete o.cols; }
    return o;
}
async function doImport() {
    if (!pending) return;
    if (!canWrite()) { closeDialog(); return; }
    var camp = getActiveCampaign(); if (!camp) { closeDialog(); return; }
    var target = ui('docImportTarget').value || 'new:' + pending.kind;
    var kind = target === 'append' ? pending.kind : target.slice(4);
    var rowsEl = Array.from(ui('docImportRows').querySelectorAll('.dimp-row'));
    var keep = {}, types = {};
    rowsEl.forEach(function(r) { var i = +r.dataset.i; keep[i] = r.querySelector('.dimp-keep').checked; var s = r.querySelector('.dimp-type'); if (s) types[i] = s.value; });
    var p = pending.parsed, blocks = [], indexMap = {};
    p.blocks.forEach(function(b, i) { if (!keep[i]) return; indexMap[i] = blocks.length; blocks.push(types[i] ? retype(b, types[i]) : Object.assign({}, b)); });
    if (!blocks.length) { toast('Every block is unticked — nothing to import.'); return; }
    // the target item (a new one is built now so the uploads know its folder; it enters the campaign only after they finish)
    var item, isNew = target !== 'append';
    if (isNew) {
        var title = getUniqueItemTitle((p.meta.title || (blocks.find(function(b) { return b.type === 'h1'; }) || {}).title || pending.fileName.replace(/\.[^.]*$/, '') || 'Imported').slice(0, 300), pending.parentId || null);
        item = kind === 'doc' ? createNewDoc(title) : createNewPlanner(title);
        if (kind === 'planner') item.id = 'plan_' + uid().replace(/^b_/, '');
        if (pending.parentId && camp.items[pending.parentId] && camp.items[pending.parentId].type === kind) { item.meta.parentId = pending.parentId; camp.items[pending.parentId].meta.collapsed = false; }
        if (kind === 'planner' && p.meta.status) item.meta.status = p.meta.status;
        if (kind === 'doc' && p.meta.players === false) item.meta.players = false;
        if (!blocks.some(function(b) { return b.type === 'h1'; })) blocks.unshift({ id: 'b_' + uid().replace(/^b_/, ''), type: 'h1', title: title, sub: p.meta.subtitle || '' });
    } else {
        item = getActiveMap();
        if (!item || item.type !== kind) { toast('The open document changed; import again.'); closeDialog(); return; }
    }
    // uploads first, all awaited; a failure leaves the block with its caption
    var go = ui('docImportGo'); if (go) { go.disabled = true; go.textContent = 'Uploading pictures…'; }
    var failed = 0;
    for (var s = 0; s < pending.sources.length; s++) {
        var src = pending.sources[s]; if (!src || indexMap[src.index] === undefined) continue;
        var b = blocks[indexMap[src.index]];
        if (src.blob.size > LIMITS.picture) { failed++; p.notes.push('Picture "' + src.name + '" is over 8 MB and was not uploaded.'); continue; }
        try { b.src = await window.wpUploadBlob(item.id, src.name, src.blob); } catch (e) { failed++; }
    }
    if (go) { go.disabled = false; go.textContent = 'Import'; }
    // the blocks
    blocks.forEach(function(b) { if (!b.id) b.id = 'b_' + uid().replace(/^b_/, ''); });
    if (isNew) { item.blocks = blocks; camp.items[item.id] = item; camp.activeItemId = item.id; state.selId = null; state.selWbId = null; state.linkStart = null; }
    else { item.blocks = (item.blocks || []).concat(blocks); }
    closeDialog();
    save(true); updateSidebarNav(); render();
    toast((isNew ? 'Imported “' + (item.meta.title || '') + '”' : 'Imported ' + blocks.length + ' block' + (blocks.length === 1 ? '' : 's')) + (failed ? ' — ' + failed + ' picture' + (failed === 1 ? '' : 's') + ' could not be uploaded.' : '.'));
}

/* ---------- export ---------- */
async function exportMarkdown(item) {
    item = item || getActiveMap();
    if (!item || (item.type !== 'planner' && item.type !== 'doc')) { toast('Open a planner or a handbook page to save it as Markdown.'); return; }
    var camp = getActiveCampaign();
    var out = docToMarkdown(item, { items: camp ? camp.items : {} });
    var name = slug(item.meta && item.meta.title);
    if (!out.images.length) { downloadBlob(name + '.md', new Blob([out.text], { type: 'text/markdown' })); toast('Markdown saved.'); return; }
    var entries = [{ name: name + '.md', data: new TextEncoder().encode(out.text) }], missing = 0;
    for (var k = 0; k < out.images.length; k++) {
        try { var r = await fetch(encodeURI(out.images[k].path)); if (!r.ok) { missing++; continue; } entries.push({ name: 'images/' + item.id + '/' + out.images[k].name, data: new Uint8Array(await r.arrayBuffer()) }); }
        catch (e) { missing++; }
    }
    downloadBlob(name + '.zip', zipCreate(entries));
    toast('Markdown saved with ' + (entries.length - 1) + ' picture' + (entries.length === 2 ? '' : 's') + (missing ? ' (' + missing + ' missing)' : '') + '.');
}

/* ---------- wiring ---------- */
function importFile(file) { openImport({ kind: 'ask', mode: 'new', files: [file] }); }
var b1 = ui('plannerImportBtn'); if (b1) b1.addEventListener('click', function() { var am = getActiveMap(); if (!am || (am.type !== 'planner' && am.type !== 'doc')) return; openImport({ kind: am.type, mode: 'append' }); });
var b2 = ui('plannerFromFileBtn'); if (b2) b2.addEventListener('click', function() { openImport({ kind: 'planner', mode: 'new' }); });
var b3 = ui('docFromFileBtn'); if (b3) b3.addEventListener('click', function() { openImport({ kind: 'doc', mode: 'new' }); });
var b4 = ui('exportMdBtn'); if (b4) b4.addEventListener('click', function() { exportMarkdown(); });
var b5 = ui('helpMdTemplateBtn'); if (b5) b5.addEventListener('click', function() { downloadBlob('handbook-template.md', new Blob([TEMPLATE], { type: 'text/markdown' })); toast('Template saved.'); });
var goBtn = ui('docImportGo'); if (goBtn) goBtn.addEventListener('click', function() { doImport(); });
var cancelBtn = ui('docImportCancel'); if (cancelBtn) cancelBtn.addEventListener('click', closeDialog);
var guideBtn = ui('docImportGuide'); if (guideBtn) guideBtn.addEventListener('click', function() { if (window.wpOpenHelp) window.wpOpenHelp('handbook', 'helpMdGuide'); });
document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && pending && ui('docImportModal') && ui('docImportModal').style.display !== 'none') { e.preventDefault(); e.stopPropagation(); closeDialog(); } }, true);

window.wpDocImport = { openImport: openImport, importFile: importFile, exportMarkdown: exportMarkdown, detectBundle: detectBundle, TEMPLATE: TEMPLATE };
