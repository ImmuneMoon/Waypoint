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
function marks(errs, warns) { topicMarks(byId('sysCombatNav'), 'combat', errs, warns); topicMarks(byId('sysRulesNav'), 'rules', errs, warns); }
// The arrow keys go down the side, each press showing its topic
function onKey(e) {
    var t = e.target; if (!t || !t.classList) return;
    if (t.classList.contains('sys-topic')) {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
        var nav = t.parentNode, n = e.key === 'Home' ? nav.firstChild : e.key === 'End' ? nav.lastChild : e.key === 'ArrowDown' ? t.nextSibling : t.previousSibling; e.preventDefault(); e.stopPropagation();
        if (n && n.dataset && n.dataset.topic) { showTopic(n.dataset.set, n.dataset.topic); n.focus(); }
    }
}
function wire() { var m = byId('systemModal'); if (m) m.addEventListener('keydown', onKey); }
window.wpSysUi = { topicPress: topicPress, combatDrawn: combatDrawn, rulesDrawn: rulesDrawn, marks: marks };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
