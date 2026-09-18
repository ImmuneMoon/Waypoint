/* The Handbook at the table (1.5.0).
   Pages (type 'doc') are written in the planner editor and reach joined players over the wire
   (net.js: sanitizeItem → docrender.cleanDoc). On a player's machine this module owns what happens
   next: a page opens in a closable panel over the play map (#docReaderModal) so the table keeps
   running underneath, refreshes when the GM's edits arrive, patches pictures in as their bytes
   land, closes when the GM hides or deletes the page, and runs mermaid in strict mode while the
   campaign on screen is someone else's. A joined player never reaches the editor: render() in
   main.js, applyStage and sanitizeAppState in net.js keep a page from ever being the active item
   on a client, and the sidebar routes a page click here (HANDBOOK_PLAN.md 3.3 / 3.4).
   Everything drawn here comes from docrender.renderDoc: escaped text and sanitized prose only. */
import { state } from './state.js';
import { net } from './net.js';
import { getActiveCampaign } from './models.js';
import { toast } from './io.js';
import { renderDoc } from './docrender.js';

var ui = function(id) { return document.getElementById(id); };
var openDocId = null, openCampId = null, openSig = '';

function foreign() { return !!(window.wpNet && window.wpNet.foreign); }
function isOpen() { var m = ui('docReaderModal'); return !!(m && m.style.display !== 'none'); }
function shown(id) { var el = ui(id); return !!(el && getComputedStyle(el).display !== 'none'); }
// Anything layered above the reader owns Esc while it is up: capture listeners on document all run
// whatever stopPropagation says, so the reader steps back instead of relying on it.
var ABOVE = ['vttNoticeModal', 'handoutModal', 'customConfirm', 'customPrompt', 'netModal', 'cleanupAskModal', 'cleanupSummaryModal', 'cleanupRecoverModal', 'tourOverlay', 'cmdkModal', 'settingsModal', 'helpModal', 'journalModal', 'installerStepsModal', 'whatsNewModal', 'systemModal'];
function somethingAbove() { return ABOVE.some(shown); }

// A cheap signature of what the reader shows, so a delta that touched another page is ignored
function sigOf(it) {
    var s = ((it.meta && it.meta.title) || '') + '\u0000' + JSON.stringify(it.blocks || []);
    var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return s.length + ':' + h;
}
function srcOf(p) { return net.assetSrc ? net.assetSrc(p) : p; }

// Mermaid's security mode: strict while the campaign on screen is someone else's (click / href /
// callback directives are dead; docrender strips those lines anyway), the app's own config again
// once load() brings this machine's campaign back. initialize() rebuilds the whole config, so the
// full object is passed. Re-checked before every render, in case mermaid's CDN load came late.
var mode = null;
function setMermaidMode(m) {
    if (!window.mermaid || !window.wpMermaidConfig || mode === m) return;
    try { mermaid.initialize(Object.assign({}, window.wpMermaidConfig, { securityLevel: m === 'strict' ? 'strict' : (window.wpMermaidConfig.securityLevel || 'loose') })); mode = m; } catch (e) {}
}
function renderInto(body, it) {
    if (foreign()) setMermaidMode('strict');
    body.innerHTML = renderDoc(it, { src: srcOf, mermaid: !!window.mermaid });
    openSig = sigOf(it);
    if (!window.mermaid) return;
    var nodes = Array.from(body.querySelectorAll('pre.mermaid'));
    if (!nodes.length) return;
    var run = function(tries) {
        if (body.clientWidth === 0 && tries < 40) { setTimeout(function() { run(tries + 1); }, 60); return; }   // laid out first, else labels measure wrong
        try { Promise.resolve(mermaid.run({ nodes: nodes })).then(function() { if (window.wpFcPostProcess) window.wpFcPostProcess(body, it); }).catch(function() {}); } catch (e) {}
    };
    run(0);
}

// Open a page of the campaign on screen in the reader. Returns false when there is no such page.
function openDoc(id) {
    var camp = getActiveCampaign(), it = camp && camp.items && camp.items[id];
    if (!it || it.type !== 'doc') return false;
    var m = ui('docReaderModal'), body = ui('docReaderBody'), title = ui('docReaderTitle');
    if (!m || !body) return false;
    var hdr = document.querySelector('header');
    if (hdr) m.style.top = Math.round(hdr.getBoundingClientRect().bottom) + 'px';   // just under the header, whatever its height
    openDocId = id; openCampId = camp.id;
    if (title) title.textContent = (it.meta && it.meta.title) || 'Page';
    m.style.display = 'flex';
    document.body.classList.add('doc-reader-open');
    body.scrollTop = 0;
    renderInto(body, it);
    return true;
}
function closeDoc() {
    var m = ui('docReaderModal'), body = ui('docReaderBody');
    if (m) m.style.display = 'none';
    if (body) body.innerHTML = '';
    document.body.classList.remove('doc-reader-open');
    openDocId = null; openCampId = null; openSig = '';
}
// The GM's edits arrived (net.js applyItem / applyItemDelta): re-render only the page on screen,
// only when it changed, keeping the reader's scroll position.
function refresh(campId, itemId) {
    if (!isOpen() || itemId !== openDocId || (campId && campId !== openCampId)) return;
    var camp = state.appState.campaigns[openCampId], it = camp && camp.items && camp.items[openDocId];
    if (!it || it.type !== 'doc') { gone(openCampId, openDocId); return; }
    if (sigOf(it) === openSig) return;
    var body = ui('docReaderBody'), title = ui('docReaderTitle'); if (!body) return;
    var top = body.scrollTop;
    if (title) title.textContent = (it.meta && it.meta.title) || 'Page';
    renderInto(body, it);
    body.scrollTop = top;
}
// The GM hid or deleted the page (net.js itemGone)
function gone(campId, itemId) {
    if (!isOpen() || itemId !== openDocId) return;
    closeDoc();
    toast('The GM closed this page.');
}
// Whose campaign is on screen changed (net.js applySnapshot → on; io.js load() → off): the reader
// closes on the way out, before the mode goes back, so no strict-rendered diagram is left behind.
function setForeign(on) {
    if (!on) closeDoc();
    setMermaidMode(on ? 'strict' : 'loose');
}

var closeBtn = ui('docReaderClose');
if (closeBtn) closeBtn.addEventListener('click', closeDoc);
document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape' || !isOpen() || somethingAbove()) return;
    e.preventDefault(); e.stopPropagation();
    closeDoc();
}, true);
// A picture's bytes arrived from the host (net.js handleAssetArrival): swap it in where it stands,
// no re-render, no scroll reset, no second mermaid run.
document.addEventListener('wp-asset', function(e) {
    var p = e.detail && e.detail.path; if (!p || !isOpen()) return;
    var body = ui('docReaderBody'); if (!body) return;
    Array.from(body.querySelectorAll('img[data-path]')).forEach(function(img) { if (img.dataset.path === p) img.src = srcOf(p); });
});

window.wpOpenDoc = openDoc;
window.wpCloseDoc = closeDoc;
window.wpDocReaderRefresh = refresh;
window.wpDocGone = gone;
window.wpDocForeign = setForeign;
window.wpDocReaderOpenId = function() { return openDocId; };
if (foreign()) setForeign(true);   // loaded after a snapshot already landed (never in practice; harmless)
