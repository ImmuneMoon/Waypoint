/* Start a campaign with questions (1.6.2, backlog 166 e; the owner, 2026-11-09, by prompt: offered "After naming it", with Skip, and from the
   campaign menu later; "Spine, then beats"; "A planner, beats as scenes"; a question left empty "Keep it as a prompt"). A short run of
   questions writes one planner, Campaign outline: a heading a question with the answer under it, and each beat a scene card marked Ahead. A
   question left empty keeps its heading with the question in grey under it, and a beat left empty is a card titled with its question, to
   fill in later. Skip writes nothing. What is typed is kept in memory for the campaign until the outline is made, so a dialog closed by
   mistake opens again as it was. Generic words: no game is named. The pure half is the core slice; the dialog is fixed words in the page. */
import { state } from './state.js';
import { getActiveCampaign, uid } from './models.js';
import { save } from './io.js';
import { updateSidebarNav } from './sidebar.js';
import { getUniqueItemTitle } from './dialogs.js';

// [campquestcheck:core-start]
var SPINE = Object.freeze([
    Object.freeze({ head: 'The idea', ask: 'What is the campaign about, in a sentence or two?' }),
    Object.freeze({ head: 'The mood', ask: 'What should it feel like at the table? Name a genre, a theme or a mood.' }),
    Object.freeze({ head: 'The world now', ask: 'How do things stand when the story begins?' }),
    Object.freeze({ head: 'The main threat', ask: 'Who or what stands against the heroes? What do they want, why, and by when?' }),
    Object.freeze({ head: 'How it might end', ask: 'How might it all end?' })
]);
var BEATS = Object.freeze([
    Object.freeze({ head: 'The start', ask: 'How does it begin?' }),
    Object.freeze({ head: 'What leads on', ask: 'What happens after the start?' }),
    Object.freeze({ head: 'The turning point', ask: 'What changes everything?' }),
    Object.freeze({ head: 'What leads to the end', ask: 'What happens after the turning point?' }),
    Object.freeze({ head: 'The end', ask: 'How does it end?' })
]);
var SPINE_CHARS = 2000, BEAT_CHARS = 120, OUTLINE = 'Campaign outline', PROMPT_INK = '#8a8f98';
// One answer as typed: text, its line ends as \n, no control character, trimmed, cut to its length by whole characters
function cleanAnswer(v, n) {
    var s = typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim() : '';
    var a = Array.from(s); return a.length > n ? a.slice(0, n).join('').trim() : s;
}
// The answers as the dialog hands them over, { spine: [5], beats: [5] }, each cleaned; anything else an empty answer. A beat is one line
function cleanAnswers(raw) {
    var r = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}, sp = Array.isArray(r.spine) ? r.spine : [], bt = Array.isArray(r.beats) ? r.beats : [];
    return { spine: SPINE.map(function(q, i) { return cleanAnswer(sp[i], SPINE_CHARS); }), beats: BEATS.map(function(q, i) { return cleanAnswer(bt[i], BEAT_CHARS).replace(/\s*\n\s*/g, ' '); }) };
}
function anyAnswer(a) { var c = cleanAnswers(a); return c.spine.concat(c.beats).some(function(s) { return !!s; }); }
function escHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
// An answer as a text block: a paragraph a stretch between blank lines, a line end a <br>; the words escaped
function proseOf(text) { return text.split(/\n\s*\n/).map(function(p) { return '<p>' + p.split('\n').map(escHtml).join('<br>') + '</p>'; }).join(''); }
// A question kept as a prompt: in grey and italic, the sanitiser's own span form, so the editor and every reader keep it
function promptOf(ask) { return '<p><span style="color:' + PROMPT_INK + '"><i>' + escHtml(ask) + '</i></span></p>'; }
// The outline's blocks, each with an id from mk(): its title and the campaign's name, a heading a spine question with the answer or the
// question as a prompt under it, then Beats and a scene card a beat, marked Ahead: titled by the answer, or by its question where empty
function outlineBlocks(raw, name, mk) {
    var a = cleanAnswers(raw), id = function() { return 'b_' + mk(); }, out = [{ id: id(), type: 'h1', title: OUTLINE, sub: cleanAnswer(name, 80) }];
    SPINE.forEach(function(q, i) { out.push({ id: id(), type: 'h2', title: q.head }); out.push({ id: id(), type: 'text', content: a.spine[i] ? proseOf(a.spine[i]) : promptOf(q.ask) }); });
    out.push({ id: id(), type: 'h2', title: 'Beats' });
    BEATS.forEach(function(q, i) { out.push({ id: id(), type: 'node', title: a.beats[i] || q.ask, tag: q.head, must: '', cols: [], rows: [], when: 'ahead' }); });
    return out;
}
function outlinePlanner(raw, name, title, mk, now) {
    return { type: 'planner', id: 'plan_' + mk(), meta: { title: title || OUTLINE, updated: typeof now === 'number' ? now : 0 }, blocks: outlineBlocks(raw, name, mk) };
}
// [campquestcheck:core-end]

function log(step, facts) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('campquest v1', step, facts || {}); } catch (e) {} }
var _cq = { camp: '', step: 1, drafts: Object.create(null) };
function el(id) { return document.getElementById(id); }
function foreign() { return !!((window.wpNet && window.wpNet.foreign) || (state.appState && state.appState._foreign)); }
function boxes(kind) { return Array.prototype.slice.call(document.querySelectorAll('#campQuestModal [data-cq="' + kind + '"]')); }
function readDraft() { return { spine: boxes('spine').map(function(b) { return b.value; }), beats: boxes('beat').map(function(b) { return b.value; }) }; }
function fillDraft(d) { boxes('spine').forEach(function(b, i) { b.value = d && d.spine && typeof d.spine[i] === 'string' ? d.spine[i] : ''; }); boxes('beat').forEach(function(b, i) { b.value = d && d.beats && typeof d.beats[i] === 'string' ? d.beats[i] : ''; }); }
function showStep(n) {
    _cq.step = n === 2 ? 2 : 1;
    var s1 = el('cqStep1'), s2 = el('cqStep2');
    if (s1) s1.hidden = _cq.step !== 1; if (s2) s2.hidden = _cq.step !== 2;
    var back = el('cqBack'), next = el('cqNext'), go = el('cqGo'), st = el('cqStepWord');
    if (back) back.hidden = _cq.step !== 2; if (next) next.hidden = _cq.step !== 1; if (go) go.hidden = _cq.step !== 2;
    if (st) st.textContent = _cq.step === 1 ? 'Step 1 of 2: the spine' : 'Step 2 of 2: five beats';
    var first = boxes(_cq.step === 1 ? 'spine' : 'beat')[0]; if (first) setTimeout(function() { try { first.focus(); } catch (e) {} }, 0);
}
function open(campId, why) {
    var m = el('campQuestModal'), camp = getActiveCampaign(); if (!m || !camp || foreign() || (campId && camp.id !== campId)) return false;
    _cq.camp = camp.id; fillDraft(_cq.drafts[camp.id]);
    var nm = el('cqCampName'); if (nm) nm.textContent = camp.name || 'This campaign';
    m.style.display = 'flex'; showStep(1);
    log('open', { from: why || 'menu' });
    return true;
}
function close(kept) {
    var m = el('campQuestModal'); if (!m || m.style.display === 'none') return;
    if (_cq.camp) { if (kept) _cq.drafts[_cq.camp] = readDraft(); else delete _cq.drafts[_cq.camp]; }
    m.style.display = 'none';
}
// Skip: nothing is written, and what was typed is kept for this campaign in case it was a slip
function skip() { log('skip', { step: _cq.step, answered: anyAnswer(readDraft()) }); close(true); }
function make() {
    var camp = getActiveCampaign(); if (!camp || camp.id !== _cq.camp || foreign()) { close(true); return false; }
    var d = readDraft(), title = getUniqueItemTitle(OUTLINE, null), pl = outlinePlanner(d, camp.name, title, uid, Date.now());
    camp.items = camp.items || {}; camp.items[pl.id] = pl;
    close(false); updateSidebarNav(); save(true);
    var a = cleanAnswers(d); log('made', { spine: a.spine.filter(Boolean).length, beats: a.beats.filter(Boolean).length });
    if (window.wpPageShelf && typeof window.wpPageShelf.open === 'function') { try { window.wpPageShelf.open(pl.id, 'go'); } catch (e) {} }
    return true;
}
if (typeof document !== 'undefined' && document.addEventListener) {
    var on = function(id, f) { var b = el(id); if (b) b.addEventListener('click', f); };
    on('cqSkip', skip); on('cqNext', function() { showStep(2); }); on('cqBack', function() { showStep(1); }); on('cqGo', make);
    on('campQuestBtn', function() { if (foreign()) { if (typeof window.toast === 'function') window.toast('Not while you’re at someone else’s table.'); return; } open('', 'menu'); });
    var mq = el('campQuestModal'); if (mq) mq.addEventListener('keydown', function(e) {
        e.stopPropagation();   // the page reads keys as its own: typing here is the dialog's
        if (e.key === 'Enter' && !e.shiftKey && e.target && e.target.tagName === 'INPUT') { e.preventDefault(); if (_cq.step === 2) make(); }
    });
}
window.wpCampQuest = { open: open, offer: function(campId) { return open(campId, 'new'); }, close: close, outlineBlocks: outlineBlocks };
export { SPINE, BEATS, cleanAnswers, outlineBlocks, outlinePlanner };
