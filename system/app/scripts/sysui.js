/* The System editor's layout (1.6.2). The owner, 2026-11-01, of the builder: "it could use more readability and a better user interface", and
   by prompt: "A list beside one open" and "Combat and Rules tabs". This module arranges what the row builders of sheets.js build and decides
   nothing of a system: every control is still the builder's, with its class, its tooltip and its handler. Where a thing would not fit a rule
   here it stays where the builder put it, so that nothing is ever lost (the owner: "lets not remove functionality with these updates").
   Text goes in as text nodes. Nothing here is sent or saved with the campaign; what is kept is this computer's own. */

// [sysuicheck:topics-start]
// The Combat and Rules tabs, each with its topics down the side, one topic at a time. A topic: its id, its name, and one short line
var TOPICS = {
    combat: [['turns', 'Turns', 'What a character may do on its turn, and how long a round lasts.'], ['initiative', 'Initiative', 'Who goes first, and how a tie is settled.'], ['outcomes', 'Roll outcomes', 'How a roll against a target reads its dice.'],
        ['damage', 'Damage', 'What a hit does to a character.'], ['cover', 'Cover', 'What walls and low pieces do for those behind them.'], ['blasts', 'Blasts and throws', 'What happens when something is thrown or goes off.'],
        ['range', 'Range', 'What distance does to a roll.'], ['height', 'Height', 'What standing higher or lower does to a roll.'], ['light', 'Light', 'Your game’s dim, dark and light sources.'],
        ['senses', 'Senses', 'What a character knows of the map besides what it sees.'], ['postures', 'Postures', 'How a token can stand.'], ['holds', 'Who holds whom', 'Grabs, pins and those who break free.'], ['bars', 'Token bars', 'Pools shown as a ring around a token.']],
    rules: [['budgets', 'Point budgets', 'Points a character has and has spent.'], ['env', 'Environment readings', 'What a map gives the characters on it, such as a temperature.'], ['links', 'Linked sheets', 'A rider and a mount, or a crew and a vehicle.'], ['tables', 'Tables', 'Figures a formula reads by a name.']]
};
// Which topic a word of the editor's error boxes stands in
var ERR_TOPIC = { combat: ['combat', 'turns'], initiative: ['combat', 'initiative'], checks: ['combat', 'outcomes'], damage: ['combat', 'damage'], coverhit: ['combat', 'cover'], blastdefend: ['combat', 'blasts'], range: ['combat', 'range'], height: ['combat', 'height'], light: ['combat', 'light'], senses: ['combat', 'senses'], postures: ['combat', 'postures'], holds: ['combat', 'holds'], budgets: ['rules', 'budgets'], env: ['rules', 'env'], links: ['rules', 'links'], tables: ['rules', 'tables'] };
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function topicIn(set, id) { var l = own(TOPICS, set) ? TOPICS[set] : []; for (var i = 0; i < l.length; i++) if (l[i][0] === id) return true; return false; }
// The topics in view, as this computer kept them: only a topic of its set
function topicsRead(store) {
    var out = { combat: TOPICS.combat[0][0], rules: TOPICS.rules[0][0] };
    try { var v = JSON.parse(store.getItem('wp_sysTopics') || '{}'); ['combat', 'rules'].forEach(function(s) { if (v && typeof v === 'object' && own(v, s) && topicIn(s, v[s])) out[s] = v[s]; }); } catch (e) {}
    return out;
}
function topicsKeep(store, now) { try { store.setItem('wp_sysTopics', JSON.stringify({ combat: now.combat, rules: now.rules })); return true; } catch (e) { return false; } }
function dupHead(p, name) {
    for (var c = p.firstChild; c; c = c.nextSibling) {
        var h = /-head$/.test(c.className || '') ? c : c.firstChild;
        if (h && /(^| )sys-[a-z]+-head( |$)/.test(h.className || '') && h.textContent === name) h.hidden = true;
    }
}
// A box of the Combat tab as its builder left it: its children in order, marks saying which topic the next ones stand in. They go into a pane a
// topic, each with its name and its line. What stands before any mark goes to the first topic that names it. A box head that only says the
// topic's own name stands aside, since the pane says it
function topicsBuild(box, set, doc, first) {
    var list = TOPICS[set], panes = {}, cur = first || list[0][0], kids = [];
    for (var n = box.firstChild; n; n = n.nextSibling) kids.push(n);
    kids.forEach(function(k) { box.removeChild(k); });
    list.forEach(function(t) {
        var p = doc.createElement('div'), h = doc.createElement('div'), s = doc.createElement('div');
        p.className = 'sys-topic-pane'; p.dataset.topic = t[0]; h.className = 'sys-topic-title'; h.textContent = t[1]; s.className = 'sys-note sys-topic-line'; s.textContent = t[2];
        p.appendChild(h); p.appendChild(s); panes[t[0]] = p;
    });
    kids.forEach(function(k) {
        if (k.className === 'sys-topic-mark') { if (k.dataset && own(panes, k.dataset.topic)) cur = k.dataset.topic; return; }
        panes[cur].appendChild(k);
    });
    list.forEach(function(t) { dupHead(panes[t[0]], t[1]); box.appendChild(panes[t[0]]); });
    return panes;
}
// Every pane and box of a set, shown or put away, and the side's buttons saying which. Nothing is drawn again, so nothing typed is touched
function topicsShow(box, nav, id) {
    var nb = 0;
    for (var n = box ? box.firstChild : null; n; n = n.nextSibling) if (n.dataset && n.dataset.topic) { n.hidden = n.dataset.topic !== id; if (!n.hidden) nb++; }
    for (var b = nav ? nav.firstChild : null; b; b = b.nextSibling) if (b.dataset && b.dataset.topic) { var on = b.dataset.topic === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; }
    return nb;
}
// The buttons down the side, made once: a name each, and its line as the tooltip
function topicsNav(nav, set, doc) {
    if (!nav || nav.firstChild) return;
    TOPICS[set].forEach(function(t) { var b = doc.createElement('button'); b.type = 'button'; b.className = 'sys-topic'; b.dataset.topic = t[0]; b.dataset.set = set; b.title = t[2]; b.setAttribute('role', 'tab'); b.appendChild(doc.createTextNode(t[1])); nav.appendChild(b); });
}
// A topic with an error wears a red dot, one with a warning a gold one. errs and warns: words of the editor's error boxes, as keys of an object
function topicMarks(nav, set, errs, warns) {
    var had = { e: {}, w: {} }, mark = function(m, k) { Object.keys(m || {}).forEach(function(id) { var t = own(ERR_TOPIC, id) ? ERR_TOPIC[id] : /^b_/.test(id) ? ['rules', 'budgets'] : null; if (t && t[0] === set) had[k][t[1]] = 1; }); };
    mark(errs, 'e'); mark(warns, 'w');
    for (var b = nav ? nav.firstChild : null; b; b = b.nextSibling) if (b.dataset && b.dataset.topic) { b.classList.toggle('err', own(had.e, b.dataset.topic)); b.classList.toggle('warn', !own(had.e, b.dataset.topic) && own(had.w, b.dataset.topic)); }
    return had;
}
// [sysuicheck:topics-end]

// [sysuicheck:pick-start]
// A list beside one open (the owner, by prompt): what a tab holds stands as a list down the left, one line a row, and the right shows the one picked.
// A system may hold 600 fields, so a row is built only when it is opened, and the list is made again only when its rows change
var PICK = { fields: { list: 'sysFieldList', find: 'sysFieldFind', pane: 'sysFieldRows' }, rolls: { list: 'sysRollList', find: 'sysRollFind', pane: 'sysRollRows' }, items: { list: 'sysItemList', find: 'sysItemFind', pane: 'sysItemRows' }, lists: { list: 'sysListList', find: 'sysListFind', pane: 'sysListRows' }, effects: { list: 'sysEffectList', find: 'sysEffectFind', pane: 'sysEffectRows' } };
// Which row is open once the rows are these: a row that has just come is the one, else the one open, else the row now at its place
function pickNext(st, ids) {
    var known = Object.create(null), fresh = [], at = -1, i;
    for (i = 0; i < ids.length; i++) { known[ids[i]] = 1; if (st.known && !st.known[ids[i]]) fresh.push(ids[i]); if (ids[i] === st.id) at = i; }
    if (fresh.length === 1) at = ids.indexOf(fresh[0]); else if (at < 0) at = Math.min(st.at || 0, ids.length - 1);
    return { id: at >= 0 ? ids[at] : '', at: Math.max(at, 0), known: known };
}
// One row moved to stand before or after another. Answers whether anything moved
function moveIn(arr, id, toId, after) {
    if (!Array.isArray(arr) || id === toId) return false;
    var of = function(x) { for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === x) return i; return -1; }, from = of(id);
    if (from < 0 || of(toId) < 0) return false;
    var it = arr.splice(from, 1)[0], to = of(toId) + (after ? 1 : 0); arr.splice(to, 0, it); return to !== from;
}
function pickWords(text) { return String(text || '').toLowerCase().split(/\s+/).filter(Boolean); }
function rowFinds(hay, words) { for (var i = 0; i < words.length; i++) if (hay.indexOf(words[i]) < 0) return false; return true; }
// A row of the list: its key, its name and what it is, each a text node. Written again only where the words moved
function rowWrite(b, r) {
    var k = b.childNodes[0], n = b.childNodes[1], t = b.childNodes[2], nm = r.name || 'No name yet';
    if (k.textContent !== (r.key || '')) k.textContent = r.key || '';
    if (n.textContent !== nm) n.textContent = nm;
    n.classList.toggle('none', !r.name);
    if (t.textContent !== (r.tag || '')) t.textContent = r.tag || '';
    b.wpFind = ((r.key || '') + ' ' + (r.name || '') + ' ' + (r.tag || '') + ' ' + (r.more || '')).toLowerCase();
}
function rowMake(doc, kind, r) {
    var b = doc.createElement('button'); b.type = 'button'; b.className = 'sys-pick-row'; b.draggable = true; b.dataset.kind = kind; b.dataset.id = r.id; b.dataset.err = r.err || r.id; b.setAttribute('role', 'option');
    ['sys-pick-key', 'sys-pick-name', 'sys-pick-tag'].forEach(function(c) { var s = doc.createElement('span'); s.className = c; b.appendChild(s); });
    rowWrite(b, r); return b;
}
// The list as these rows say: made again only where the rows themselves changed, so the focus and the scroll stay
function listWrite(list, kind, rows, doc) {
    var els = [], n, i, same = list.childNodes.length === rows.length;
    for (n = list.firstChild, i = 0; n && same; n = n.nextSibling, i++) { if (n.dataset.id !== rows[i].id) same = false; els.push(n); }
    if (same) { rows.forEach(function(r, j) { rowWrite(els[j], r); }); return false; }
    while (list.firstChild) list.removeChild(list.firstChild);
    rows.forEach(function(r) { list.appendChild(rowMake(doc, kind, r)); });
    return true;
}
function listShow(list, id, errs, warns) {
    var found = null;
    for (var b = list.firstChild; b; b = b.nextSibling) {
        var on = b.dataset.id === id, e = b.dataset.err; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; if (on) found = b;
        var bad = !!errs && own(errs, e) && errs[e].length > 0; b.classList.toggle('err', bad); b.classList.toggle('warn', !bad && !!warns && own(warns, e) && warns[e].length > 0);
    }
    return found;
}
// The search: a row stays where every word stands in its key, its name or what it is. The list is never made again for it
function findApply(list, none, text) {
    var words = pickWords(text), shown = 0;
    for (var b = list.firstChild; b; b = b.nextSibling) { var hit = rowFinds(b.wpFind || '', words); b.hidden = !hit; if (hit) shown++; }
    if (none) none.hidden = shown > 0 || !list.firstChild;
    return shown;
}
function rowStep(b, dir) { var n = b ? (dir > 0 ? b.nextSibling : b.previousSibling) : null; while (n && n.hidden) n = dir > 0 ? n.nextSibling : n.previousSibling; return n; }
function rowEnd(list, dir) { var n = dir > 0 ? list.firstChild : list.lastChild; while (n && n.hidden) n = dir > 0 ? n.nextSibling : n.previousSibling; return n; }
// [sysuicheck:pick-end]

var store = { getItem: function() { return null; }, setItem: function() {} }; try { if (window.localStorage) store = window.localStorage; } catch (e) {}
var topicNow = topicsRead(store);
function byId(id) { return document.getElementById(id); }
var PANE = { combat: ['sysCombatBox', 'sysCombatNav'], rules: ['sysRulesBox', 'sysRulesNav'] };
function log(step, facts) { try { if (typeof window.wpStepLog === 'function') window.wpStepLog('sysui v1', step, facts || {}); } catch (e) {} }
function showTopic(set, id) {
    if (!own(PANE, set) || !topicIn(set, id)) return false;
    topicNow[set] = id; topicsKeep(store, topicNow); topicsShow(byId(PANE[set][0]), byId(PANE[set][1]), id); return true;
}
// A press on a topic, or a topic asked for from outside (the tour, a menu of the map)
function topicPress(set, id) { var ok = showTopic(set, id); log('topic', { set: set, ok: ok }); return ok; }
// The Combat tab's box once its builder has filled it
function combatDrawn(box) {
    var nav = byId('sysCombatNav'); topicsNav(nav, 'combat', document); topicsBuild(box, 'combat', document, 'blasts'); topicsShow(box, nav, topicNow.combat);
}
function rulesDrawn() { var box = byId('sysRulesBox'), nav = byId('sysRulesNav'); topicsNav(nav, 'rules', document); topicsShow(box, nav, topicNow.rules); }
function marks(errs, warns) { lastErrs = errs; lastWarns = warns; topicMarks(byId('sysCombatNav'), 'combat', errs, warns); topicMarks(byId('sysRulesNav'), 'rules', errs, warns); }
var picks = {}, lastErrs = null, lastWarns = null, host = null, sawPick = {};
function pickState(kind) { return picks[kind] || (picks[kind] = { id: '', at: 0, known: null }); }
// The list drawn for these rows, and which row is open
function pickDraw(kind, rows) {
    var c = own(PICK, kind) ? PICK[kind] : null; if (!c) return '';
    var st = pickState(kind), nx = pickNext(st, rows.map(function(r) { return r.id; })), list = byId(c.list), was = st.id; st.id = nx.id; st.at = nx.at; st.known = nx.known;
    if (!list) return st.id;
    var made = listWrite(list, kind, rows, document), b = listShow(list, st.id, lastErrs, lastWarns), box = byId(c.find);
    if (made) findApply(list, list.parentNode.querySelector('.sys-pick-none'), box ? box.value : '');
    if (b && (made || was !== st.id) && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
    return st.id;
}
function pickSet(kind, id) { pickState(kind).id = id; }
function pickReset() { picks = {}; Object.keys(PICK).forEach(function(k) { var f = byId(PICK[k].find), l = byId(PICK[k].list); if (f) f.value = ''; if (l) findApply(l, l.parentNode.querySelector('.sys-pick-none'), ''); }); }
function openRow(kind, id) { if (host) host.pick(kind, id); }
function moveRow(kind, id, toId, after) { if (host) host.move(kind, id, toId, after); }
// Into the row that is open: its first box
function paneFocus(kind) {
    var p = byId(PICK[kind].pane), box = p ? p.querySelector('input, select, textarea, button') : null;
    if (box && box.focus) box.focus(); return !!box;
}
function pickKey(e, b) {
    var kind = b.dataset.kind, k = e.key, list = b.parentNode, to = k === 'ArrowDown' ? rowStep(b, 1) : k === 'ArrowUp' ? rowStep(b, -1) : k === 'Home' ? rowEnd(list, 1) : k === 'End' ? rowEnd(list, -1) : null;
    if (k === 'Enter') { e.preventDefault(); e.stopPropagation(); openRow(kind, b.dataset.id); paneFocus(kind); return; }
    if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'Home' && k !== 'End') return;
    e.preventDefault(); e.stopPropagation(); if (!to) return;
    if (e.altKey && (k === 'ArrowDown' || k === 'ArrowUp')) { moveRow(kind, b.dataset.id, to.dataset.id, k === 'ArrowDown'); b = list.querySelector('.on') || b; if (b.focus) b.focus(); return; }
    openRow(kind, to.dataset.id); if (to.focus) to.focus();
}
function dropClear(list) { for (var n = list.firstChild; n; n = n.nextSibling) { n.classList.remove('drop-before'); n.classList.remove('drop-after'); } }
function pickWire(kind) {
    var c = PICK[kind], list = byId(c.list), find = byId(c.find), drag = null; if (!list) return;
    list.addEventListener('click', function(e) { var b = e.target && e.target.closest ? e.target.closest('.sys-pick-row') : null; if (!b) return; e.stopPropagation(); openRow(kind, b.dataset.id); });
    list.addEventListener('dragstart', function(e) { var b = e.target && e.target.closest ? e.target.closest('.sys-pick-row') : null; if (!b) return; drag = b.dataset.id; if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); } });
    var at = function(e) { var b = e.target && e.target.closest ? e.target.closest('.sys-pick-row') : null; if (!b || !drag) return null; var r = b.getBoundingClientRect(); return { b: b, after: e.clientY > r.top + r.height / 2 }; };
    list.addEventListener('dragover', function(e) { var t = at(e); if (!t) return; e.preventDefault(); dropClear(list); t.b.classList.add(t.after ? 'drop-after' : 'drop-before'); });
    list.addEventListener('dragleave', function(e) { if (e.target === list) dropClear(list); });
    list.addEventListener('drop', function(e) { var t = at(e), id = drag; drag = null; dropClear(list); if (!t) return; e.preventDefault(); e.stopPropagation(); moveRow(kind, id, t.b.dataset.id, t.after); log('drag', { kind: kind }); });
    list.addEventListener('dragend', function() { drag = null; dropClear(list); });
    if (find) {
        ['input', 'change'].forEach(function(ev) { find.addEventListener(ev, function(e) { e.stopPropagation(); findApply(list, list.parentNode.querySelector('.sys-pick-none'), find.value); }); });
        find.addEventListener('keydown', function(e) {
            if (e.key !== 'ArrowDown' && e.key !== 'Enter') return;
            var b = rowEnd(list, 1); e.preventDefault(); e.stopPropagation(); if (!b) return;
            openRow(kind, b.dataset.id); if (e.key === 'Enter') paneFocus(kind); else if (b.focus) b.focus();
        });
    }
}
// The arrow keys go down the side, each press showing its topic
function onKey(e) {
    var t = e.target; if (!t || !t.classList) return;
    if (t.classList.contains('sys-pick-row')) { pickKey(e, t); return; }
    if (t.classList.contains('sys-topic')) {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
        var nav = t.parentNode, n = e.key === 'Home' ? nav.firstChild : e.key === 'End' ? nav.lastChild : e.key === 'ArrowDown' ? t.nextSibling : t.previousSibling; e.preventDefault(); e.stopPropagation();
        if (n && n.dataset && n.dataset.topic) { showTopic(n.dataset.set, n.dataset.topic); n.focus(); }
    }
}
function wire() { var m = byId('systemModal'); if (m) m.addEventListener('keydown', onKey); Object.keys(PICK).forEach(pickWire); }
window.wpSysUi = { topicPress: topicPress, combatDrawn: combatDrawn, rulesDrawn: rulesDrawn, marks: marks, pickDraw: pickDraw, pickSet: pickSet, pickReset: pickReset, moveIn: moveIn, isPick: function(k) { return own(PICK, k); }, paneOf: function(k) { return own(PICK, k) ? PICK[k].pane : ''; }, host: function(h) { host = h; } };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
