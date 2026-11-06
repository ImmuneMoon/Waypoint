/* The System editor's layout (1.6.2). The owner, 2026-11-01, of the builder: "it could use more readability and a better user interface", and
   by prompt: "A list beside one open" and "Combat and Rules tabs". This module arranges what the row builders of sheets.js build and decides
   nothing of a system: every control is still the builder's, with its class, its tooltip and its handler. Where a thing would not fit a rule
   here it stays where the builder put it, so that nothing is ever lost (the owner: "lets not remove functionality with these updates").
   Text goes in as text nodes. Nothing here is sent or saved with the campaign; what is kept is this computer's own. */

// [sysuicheck:topics-start]
// The Combat and Rules tabs, each with its topics down the side, one topic at a time. A topic: its id, its name, and one short line
var TOPICS = {
    combat: [['turns', 'Turns', 'What a character may do on its turn, and how long a round lasts.'],
        ['damage', 'Damage', 'What a hit does to a character.'], ['cover', 'Cover', 'What walls and low pieces do for those behind them.'], ['blasts', 'Blasts and throws', 'What happens when something is thrown or goes off.'],
        ['range', 'Range', 'What distance does to a roll.'], ['height', 'Height', 'What standing higher or lower does to a roll.'], ['light', 'Light', 'Your game’s dim, dark and light sources.'],
        ['senses', 'Senses', 'What a character knows of the map besides what it sees.'], ['initiative', 'Initiative', 'Who goes first, and how a tie is settled.'], ['outcomes', 'Roll outcomes', 'How a roll against a target reads its dice.'], ['postures', 'Postures', 'How a token can stand.'], ['holds', 'Who holds whom', 'Grabs, pins and those who break free.'], ['bars', 'Token bars', 'Pools shown as a ring around a token.'], ['arcs', 'Arcs', 'The arcs a hit can come from, and a gun can fire into.'], ['mapkinds', 'Map kinds', 'The scales a map can be switched to, and what a rule reads on each.']],
    rules: [['budgets', 'Point budgets', 'Points a character has and has spent.'], ['env', 'Environment readings', 'What a map gives the characters on it, such as a temperature.'], ['links', 'Linked sheets', 'A rider and a mount, or a crew and a vehicle.'], ['tables', 'Tables', 'Figures a formula reads by a name.'], ['results', 'Result tables', 'A roll that lands on a row of words.'], ['values', 'Shared values', 'A number the whole table shares.'], ['tags', 'Marks', 'A mark one token holds on another.'], ['money', 'Money', 'The currencies money is counted in.'], ['decks', 'Decks and bags', 'A set of things you draw from.'], ['tests', 'Tests', 'The kinds of roll a figure is tested with.']]
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
function shortNames(doc) {   // the foot's tick: this computer's own
    var d = doc || document, m = d.getElementById('systemModal'), b = d.getElementById('sysShowKeys'), on = false; if (!m || !b) return; try { on = localStorage.getItem('wp_sysShort') === '1'; } catch (e) {} b.checked = on; m.classList.toggle('sys-show-keys', on);
    b.addEventListener('change', function() { m.classList.toggle('sys-show-keys', b.checked); try { if (b.checked) localStorage.setItem('wp_sysShort', '1'); else localStorage.removeItem('wp_sysShort'); } catch (e) {} });
}
if (typeof document !== 'undefined') { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function() { shortNames(document); }); else shortNames(document); }
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
    var k = b.childNodes[0], n = b.childNodes[1], t = b.childNodes[2], nm = r.name || r.key || 'No name yet';
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

// [sysuicheck:groups-start]
// The open row's controls in named groups. Each builder is as it was: its row is taken apart here, each piece going to the group that names one of
// its classes, in the order built. A piece no group names goes to More, so a control added later is never lost. A word ending in * is a beginning.
// A group: its id, its name, whether it starts open, and the classes that send a piece to it. Groups that are rarely used start folded, and open by
// themselves where the row uses them
var GROUPS = {
    fields: { split: ['sys-row-main', 'sys-flags'], pull: ['sys-round', 'sys-roundto', 'sys-roundat'], head: ['sys-key', 'sys-label', 'sys-kind', 'sys-btns'], list: [
        ['value', 'The number', 1, ['sys-def']],
        ['who', 'Who sees and changes it', 1, ['sys-edit', 'sys-vis', 'sys-live-sel']],
        ['sheet', 'How it shows', 1, ['sys-hover-chk', 'sys-tile-chk', 'sys-slider-chk', 'sys-counter-chk', 'sys-res-icon', 'sys-glyph-btn', 'sys-reset-chk', 'sys-res-color', 'act:rescolorclr', 'sys-colorband-chk', 'sys-bar-chk', 'sys-badge-chk', 'sys-tones-row', 'sys-slider-row', 'sys-trackshape', 'sys-trackof']],
        ['figs', 'Units and figures', 0, ['sys-unit', 'sys-unit-text', 'sys-metricshow', 'sys-dec', 'sys-group-chk', 'sys-sign-chk', 'sys-caption'], null, 'say'],   // 1.6.2 (the owner, by prompt: "Split in two"): folded, its heading saying what is set
        ['rules', 'Rolls and rules', 0, ['sys-fieldtest', 'sys-roll', 'sys-fielddie', 'sys-vnames', 'sys-ovr-value', 'sys-ovr-when', 'sys-spill-*']],
        ['auto', 'Worked out and filled', 0, ['sys-wout-box']],   // 1.6.2 (auto apply)
        ['round', 'Rounding', 0, ['sys-round', 'sys-roundto', 'sys-roundat']]] },
    rolls: { split: ['sys-row-main'], head: ['sys-label', 'sys-roll-kind', 'sys-formula', 'sys-btns'], list: [
        ['how', 'How it rolls', 1, ['sys-roll-drawfirst', 'sys-drawnrow', 'sys-roll-drawn', 'sys-roll-malf', 'sys-roll-critat', 'sys-roll-fumbleat', 'sys-roll-bigat', 'sys-init-chk', 'sys-roll-anytime']],
        ['look', 'Who sees it and how it looks', 1, ['sys-vis', 'sys-roll-togm', 'sys-roll-tone', 'snd-on-btn', 'sys-roll-die', 'sys-roll-icon', 'sys-glyph-btn']],
        ['use', 'When it can be used', 1, ['sys-roll-needsrow', 'sys-roll-cost', 'sys-costhowrow', 'sys-costhow', 'sys-clockrow', 'sys-clockn', 'sys-roll-near', 'sys-roll-each', 'sys-roll-by', 'sys-crewstn']],
        ['damage', 'Damage', 0, ['sys-dmg-chk', 'sys-roll-hits', 'sys-roll-mjif', 'sys-roll-mjdmg', 'sys-roll-dtype', 'sys-roll-dkind', 'sys-roll-p2*', 'sys-roll-p3*', 'sys-roll-p4*', 'sys-roll-p5*', 'sys-area']],
        ['resist', 'Resisting it', 0, ['sys-roll-rsist', 'sys-roll-rsby', 'sys-rsor', 'sys-roll-rsnocrit']],
        ['clock', 'By the clock and in a fight', 0, ['sys-roll-everyrow', 'sys-roll-fightrow', 'sys-roll-askrow', 'sys-roll-noterow']],
        ['cross', 'When a value crosses a step', 0, ['sys-roll-xsrow']],
        ['asks', 'What it asks when pressed', 0, ['sys-asks']],
        ['card', 'On the card', 0, ['sys-cardacts']],
        ['help', 'Help from others', 0, ['sys-help']],
        ['calls', 'Calls for', 0, ['sys-calls']],
        ['bands', 'Result bands', 0, ['sys-bands']],
        ['then', 'What it changes', 1, ['sys-apply']]] },
    items: { split: ['sys-row-main', 'sys-flags'], head: ['sys-item-name', 'sys-item-cat', 'sys-btns'], list: [
        ['what', 'What it is', 1, ['sys-item-damage', 'sys-item-cost', 'sys-item-throw', 'sys-item-key', 'sys-item-lvl', 'sys-item-only', 'sys-item-again', 'sys-item-notes']],
        ['look', 'Who sees it and how it looks', 1, ['sys-item-vis', 'sys-item-icon', 'sys-glyph-btn']],
        ['stats', 'Stats', 1, ['sys-item-stats']],
        ['mods', 'What it changes', 0, ['sys-item-mods']],
        ['grants', 'Rows it grants', 0, ['sys-grant-box']],
        ['sw', 'Roll bonuses', 0, ['sys-sw-box']],
        ['keep', 'Taking it off', 0, ['sys-item-rmmode', 'sys-item-rmtext', 'sys-item-eqmode', 'sys-item-eqtext']],
        ['blast', 'Blast', 0, ['sys-item-area', 'sys-item-affs', 'sys-fly']]] },
    lists: { split: ['sys-flags', 'sys-list-cols'], head: ['sys-list-title'], list: [
        ['holds', 'What it holds', 1, ['sys-list-cats', 'sys-starts']],
        ['rows', 'What a row may be', 1, ['sys-list-multi', 'sys-list-noqty', 'sys-list-custom', 'sys-ownsw', 'sys-list-graise', 'sys-list-sheets', 'sys-list-sheettpl', 'sys-list-sheeton', 'sys-list-hand', 'sys-list-handgm']],   // 1.6.2 (the owner: "Three groups"): the list's ticks by what they are for
        ['rowlook', 'How it looks', 0, ['sys-list-open', 'sys-list-edge', 'sys-list-groupby', 'sys-list-menus', 'sys-list-boxes']],
        ['rowrules', 'Rules', 0, ['sys-list-trade', 'sys-list-togm', 'sys-traderules']],
        ['level', 'Level', 1, ['sys-list-lvl', 'sys-list-lcaps']],
        ['on', 'Switch', 1, ['sys-list-on', 'sys-list-upkeep']],
        ['stats', 'Stats', 1, ['sys-list-stats']],
        ['cols', 'Columns', 0, ['sys-list-col', 'sys-list-coladd']],
        ['cts', 'Counters', 0, ['sys-list-ct', 'sys-list-ctadd']],
        ['rolls', 'Rolls', 1, ['sys-list-roll', 'sys-list-needsrow', 'sys-list-rolladd', 'sys-list-xsrow', 'sys-calls', 'sys-help']],
        ['ties', 'Tied to other rows', 0, ['sys-list-hang'].concat(['sys-list-partsfrom', 'sys-list-partscats', 'sys-list-partshosts', 'sys-list-partscap', 'sys-pcaps', 'sys-list-partsfitif', 'sys-list-partsfitwords', 'sys-pfits', 'sys-list-partslabel', 'sys-list-partsdeep'], ['sys-list-standfrom', 'sys-list-standfits', 'sys-list-standsays', 'sys-list-standreach', 'sys-list-standcounts', 'sys-list-standoff', 'sys-list-standbox', 'sys-list-standpieces', 'sys-sthen'], ['sys-list-atfrom', 'sys-list-atby']), [['hang', 'Hangs from a row of this list', ['sys-list-hang']], ['parts', 'Holds parts', ['sys-list-partsfrom', 'sys-list-partscats', 'sys-list-partshosts', 'sys-list-partscap', 'sys-pcaps', 'sys-list-partsfitif', 'sys-list-partsfitwords', 'sys-pfits', 'sys-list-partslabel', 'sys-list-partsdeep']], ['stand', 'Stands at a row of another list', ['sys-list-standfrom', 'sys-list-standfits', 'sys-list-standsays', 'sys-list-standreach', 'sys-list-standcounts', 'sys-list-standoff', 'sys-list-standbox', 'sys-list-standpieces', 'sys-sthen']], ['at', 'Names a row of another list by a stat', ['sys-list-atfrom', 'sys-list-atby']]]],   // 1.6.2 (the owner, by prompt: "Rows tied to rows"): the four ways a row ties to another row, in one place, a kind at a time
        ['tiles', 'Tiles', 0, ['sys-list-tileside', 'sys-list-tiletop', 'sys-list-tiledraw', 'sys-list-tilemake', 'sys-tboxes', 'sys-tstates']],
        ['badges', 'Badges', 0, ['sys-badges']],
        ['loads', 'Loads, feeds and chambers', 0, ['sys-list-load', 'sys-list-feed', 'sys-list-feedadd', 'sys-list-chamber']],
        ['specs', 'Specialties', 0, ['sys-list-specs', 'sys-list-specof', 'sys-list-speccover', 'sys-list-specby', 'sys-list-specfall', 'sys-list-specnever', 'sys-list-specpen', 'sys-list-specsum', 'sys-list-specdflt']],
        ['once', 'Counted once', 0, ['sys-list-once', 'sys-list-oncenote']],
        ['look', 'Look and work log', 0, ['sys-list-rowlook', 'sys-list-lkmain', 'sys-list-lkby', 'sys-list-worklog']],
        ['other', 'Other rules', 0, ['sys-list-layfrom', 'sys-list-layif', 'sys-list-laystat', 'sys-list-lockif', 'sys-list-lockcell', 'sys-list-locksays', 'sys-list-modsif', 'sys-list-subject', 'sys-list-sjif', 'sys-list-throwif', 'sys-list-throwsays', 'sys-list-sets', 'sys-list-placeby', 'sys-list-onrm']],
        ['arcs', 'Arcs', 0, ['sys-list-arcby', 'sys-arcs']],
        ['names', 'What formulas read', 0, ['sys-list-names']]] },
    effects: { split: ['sys-row-main', 'sys-flags'], head: ['sys-fx-icon', 'sys-glyph-btn', 'sys-fx-name', 'sys-fx-tone', 'sys-btns'], list: [
        ['changes', 'What it changes', 1, ['sys-fx-target', 'act:fxmodadd']],
        ['time', 'How long it lasts', 1, ['sys-fx-dur', 'sys-fx-agbox', 'sys-fx-endsbox', 'sys-fx-egbox', 'sys-fx-autorow']],
        ['val', 'Its number', 0, ['sys-fxv-box']],
        ['who', 'Who sees it', 1, ['sys-fx-vis', 'sys-fx-notes']],
        ['posture', 'Posture', 0, ['sys-fx-posture', 'sys-fx-postureback', 'sys-fx-keepbox']],
        ['sw', 'Roll bonuses', 0, ['sys-sw-box']]] }
};
var VALUE_TITLE = { toggle: 'The switch', text: 'The text', notes: 'The text', select: 'The options', 'item-list': 'The list', effects: 'The list' };
// Every class in a piece, and each button's action as act:name
function classWords(n, out) {
    out = out || {};
    if (typeof n.className === 'string') n.className.split(/\s+/).forEach(function(c) { if (c) out[c] = 1; });
    if (n.dataset && typeof n.dataset.act === 'string') out['act:' + n.dataset.act] = 1;
    for (var c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) classWords(c, out);
    return out;
}
function wordIn(words, list) {
    for (var i = 0; i < list.length; i++) {
        var w = list[i]; if (w.charAt(w.length - 1) !== '*') { if (own(words, w)) return true; continue; }
        var b = w.slice(0, -1); for (var k in words) if (k.indexOf(b) === 0) return true;
    }
    return false;
}
function groupOf(spec, words) { for (var i = 0; i < spec.list.length; i++) if (wordIn(words, spec.list[i][3])) return spec.list[i][0]; return 'more'; }
function hasClass(n, c) { return typeof n.className === 'string' && n.className.split(/\s+/).indexOf(c) >= 0; }
// Whether a group holds anything set: a tick ticked, a box written in, a list off its first choice
// 1.6.2 (the owner, by prompt: "Split in two"): what a folded Units and figures holds, in words for its heading: the unit, then each thing set
function figsSay(b) {
    var find = function(n, c) { if (!n || n.nodeType !== 1) return null; if (hasClass(n, c)) return n; for (var k = n.firstChild; k; k = k.nextSibling) { var x = find(k, c); if (x) return x; } return null; };
    var val = function(c) { var n = find(b, c); return n ? String(n.value || '').trim() : ''; }, on = function(c) { var n = find(b, c); return !!n && n.checked === true; }, out = [];
    var u = val('sys-unit') || val('sys-unit-text'); if (u) out.push(u);
    var m = find(b, 'sys-metricshow'); if (m && usedIn(m)) out.push('metric');
    if (val('sys-decmin') || val('sys-decmax')) out.push('decimals'); if (on('sys-group-chk')) out.push('1,000s'); if (on('sys-sign-chk')) out.push('\u00b1 colour'); if (val('sys-caption')) out.push('a caption');
    return out.join(', ');
}
function usedIn(n) {
    if (n.tagName === 'INPUT') { var t = n.type; if (t === 'checkbox' || t === 'radio') return n.checked === true; return t !== 'color' && String(n.value || '') !== ''; }
    if (n.tagName === 'SELECT') {
        if (hasClass(n, 'sys-roll-evu') && n.parentNode && n.parentNode.querySelector) { var every = n.parentNode.querySelector('.sys-roll-evn'); if (every && !every.value) return false; }   // a unit with no number beside it sets nothing
        return String(n.value || '') !== '' && n.firstChild !== null && n.firstChild.value !== n.value;
    }
    for (var c = n.firstChild; c; c = c.nextSibling) if (c.nodeType === 1 && usedIn(c)) return true;
    return false;
}
function keptGroups(store) {
    var out = {}; try { var v = JSON.parse(store.getItem('wp_sysGroups') || '{}'); if (v && typeof v === 'object') Object.keys(v).forEach(function(k) { if (/^[a-z]+:[a-z]+$/.test(k) && (v[k] === 0 || v[k] === 1)) out[k] = v[k]; }); } catch (e) {}
    return out;
}
function groupsKeep(store, kept) { try { store.setItem('wp_sysGroups', JSON.stringify(kept)); return true; } catch (e) { return false; } }
// The pieces of a row, in the order built: its children, those the table names taken apart into theirs, and what a piece the table pulls out of the value holds
function piecesOf(row, spec) {
    var out = [], walk = function(n) { for (var c = n.firstChild; c; c = c.nextSibling) { if (spec.split.indexOf(c.className) >= 0) walk(c); else out.push(c); } };   // a row of its own (sys-flags and a word more) stays whole
    walk(row);
    if (spec.pull) out.slice().forEach(function(p) {
        if (!hasClass(p, 'sys-def')) return; var at = out.indexOf(p), moved = [];
        for (var c = p.firstChild; c; c = c.nextSibling) if (wordIn(classWords(c), spec.pull)) moved.push(c);
        moved.forEach(function(m, i) { out.splice(at + 1 + i, 0, m); });
    });
    return out;
}
// A row built, arranged: the head, what Save says of it, then a group a name. Nothing is made again, so every control keeps its class and its handlers
function arrange(row, kind, doc, kept, touched) {
    if (!own(GROUPS, kind)) return row;
    var spec = GROUPS[kind], pieces = piecesOf(row, spec), head = [], errs = [], by = {}, wait = [], order = [];
    pieces.forEach(function(p) {
        if (p.nodeType !== 1) { wait.push(p); return; }
        var w = classWords(p);
        if (hasClass(p, 'sys-err') || p.dataset && p.dataset.errFor !== undefined) { errs.push(p); return; }
        if (wordIn(p.tagName === 'LABEL' ? w : classWords({ className: p.className, dataset: {} }), spec.head)) { head.push(p); return; }   // a caption's label by what it holds; a box by itself, never by a button deep inside it
        if (hasClass(p, 'sys-num-cap')) { wait.push(p); return; }   // a caption goes where what it heads goes
        var g = groupOf(spec, w); if (!by[g]) { by[g] = []; order.push(g); }
        wait.forEach(function(x) { by[g].push(x); }); wait = []; by[g].push(p);
    });
    if (wait.length) { if (!by.more) { by.more = []; order.push('more'); } wait.forEach(function(x) { by.more.push(x); }); }
    while (row.firstChild) row.removeChild(row.firstChild);
    var top = doc.createElement('div'); top.className = kind === 'lists' ? 'sys-list-head' : 'sys-row-main'; head.forEach(function(p) { top.appendChild(p); }); row.appendChild(top);
    errs.forEach(function(p) { row.appendChild(p); });
    var kindBox = row.querySelector ? row.querySelector('.sys-kind') : null;
    spec.list.concat([['more', 'More', 1, []]]).forEach(function(g) {
        var ps = by[g[0]]; if (!ps) return;
        var d = doc.createElement('details'), s = doc.createElement('summary'), b = doc.createElement('div'), key = kind + ':' + g[0], name = g[0] === 'value' && kindBox && own(VALUE_TITLE, kindBox.value) ? VALUE_TITLE[kindBox.value] : g[1];
        d.className = 'sys-grp'; d.dataset.grp = key; s.className = 'sys-grp-head'; s.appendChild(doc.createTextNode(name)); b.className = 'sys-flags sys-grp-body';
        ps.forEach(function(p) { b.appendChild(p); });
        if (g[4]) kindsArrange(b, g[4], doc, kind + ':' + ((row.dataset && row.dataset.lid) || ''));
        var used = usedIn(b), said = used && g[5] === 'say' ? figsSay(b) : ''; if (used && !g[2]) { var u = doc.createElement('small'); u.className = 'sys-grp-used'; u.textContent = said || 'in use'; s.appendChild(u); }
        d.open = kept && own(kept, key) ? kept[key] === 1 : !!g[2] || (used && g[5] !== 'say') || !!(touched && touched[key]);   // a group that says what is set stays folded
        d.appendChild(s); d.appendChild(b); row.appendChild(d);
    });
    return row;
}
// 1.6.2 (the owner, by prompt: "Rows tied to rows"): a group whose pieces are kinds of one thing sets them out a kind at a time. A kind that is in use, or
// that was picked from Add a tie, shows with its name; the rest wait in that list. Nothing is made again: each control keeps its class and its handler
var kindsShown = {};
function kindsArrange(b, kinds, doc, rowKey) {
    var blocks = {}, wait = [], kids = []; for (var c = b.firstChild; c; c = c.nextSibling) kids.push(c);
    kinds.forEach(function(k) { var blk = doc.createElement('div'), h = doc.createElement('div'); blk.className = 'sys-flags sys-kind-block'; blk.dataset.kind = k[0]; h.className = 'sys-kind-head'; h.textContent = k[1]; blk.appendChild(h); blocks[k[0]] = blk; });
    kids.forEach(function(p) { if (p.nodeType !== 1 || hasClass(p, 'sys-num-cap')) { wait.push(p); return; } var w = classWords(p), to = null; kinds.forEach(function(k) { if (!to && wordIn(w, k[2])) to = blocks[k[0]]; }); to = to || blocks[kinds[0][0]]; wait.forEach(function(x) { to.appendChild(x); }); wait = []; to.appendChild(p); });
    while (b.firstChild) b.removeChild(b.firstChild);
    var hidden = [];
    kinds.forEach(function(k) { var blk = blocks[k[0]], has = blk.childNodes.length > 1, show = has && (usedIn(blk) || kindsShown[rowKey + ':' + k[0]] === 1); blk.hidden = !show; if (!show && has) hidden.push(k); b.appendChild(blk); });   // a kind this list cannot take here, with no control of its own, is neither shown nor offered
    if (hidden.length) {
        var sel = doc.createElement('select'), o0 = doc.createElement('option'); sel.className = 'sys-kind-pick'; sel.title = 'Show the boxes of another way a row ties to another row'; o0.value = ''; o0.textContent = 'Add a tie…'; sel.appendChild(o0);
        hidden.forEach(function(k) { var o = doc.createElement('option'); o.value = k[0]; o.textContent = k[1]; sel.appendChild(o); });
        var stop = function(e) { if (e && e.stopPropagation) e.stopPropagation(); };
        sel.addEventListener('input', stop);
        sel.addEventListener('change', function(e) { stop(e); var v = sel.value; if (!v || !blocks[v]) return; kindsShown[rowKey + ':' + v] = 1; blocks[v].hidden = false; for (var i = 0; i < sel.options.length; i++) if (sel.options[i].value === v) { sel.removeChild(sel.options[i]); break; } sel.value = ''; if (sel.options.length < 2) sel.hidden = true; if (typeof log === 'function') log('tie', { kind: v }); });
        b.insertBefore(sel, b.firstChild);
    }
}
// [sysuicheck:groups-end]

// [sysuicheck:ticks-start]
// A list of ticks a type, such as Adds to DR, as one table: the types across the top, what they may add down the side. The ticks are the builder's,
// each in a cell that stands for its type as its row did (sys-dmgr-type, data-yi), so its handler reads it as before. The tooltip moves to the cell
function tickTable(wrap, doc) {
    var cols = [], rows = [], seen = {}, add = null;
    for (var c = wrap.firstChild; c; c = c.nextSibling) {
        if (c.dataset && c.dataset.act === 'dmgryadd') add = c;
        if (!hasClass(c, 'sys-dmgr-type')) continue;
        var p = c.querySelector('.sys-dmgr-plus'); if (!p) continue;
        var lb = c.querySelector('.sys-dmgr-ylabel'), ky = c.querySelector('.sys-dmgr-ykey'), col = { yi: c.dataset.yi, name: (lb && lb.value) || (ky && ky.value) || 'Type ' + (cols.length + 1), ticks: {} };
        p.querySelectorAll('label').forEach(function(l) {
            var box = l.querySelector('input'), k = box && box.dataset ? box.dataset.k : ''; if (!k) return;
            if (!own(seen, k)) { seen[k] = 1; rows.push({ k: k, name: String(l.textContent || '').trim(), title: l.title || '' }); }
            col.ticks[k] = box;
        });
        cols.push(col); p.parentNode.removeChild(p);
    }
    if (!cols.length || !rows.length) return null;
    var make = function(t, cls, text) { var e = doc.createElement(t); if (cls) e.className = cls; if (text !== undefined) e.appendChild(doc.createTextNode(text)); return e; };
    var scroll = make('div', 'sys-tick-scroll'), table = make('table', 'sys-tick-table'), head = make('thead'), hr = make('tr'), body = make('tbody');
    hr.appendChild(make('th', null, 'Adds to DR'));
    cols.forEach(function(c2) { var th = make('th', 'sys-tick-col', c2.name); th.dataset.yi = c2.yi; hr.appendChild(th); });
    head.appendChild(hr); table.appendChild(head);
    rows.forEach(function(r) {
        var tr = make('tr'); tr.appendChild(make('th', null, r.name));
        cols.forEach(function(c2) { var td = make('td', 'sys-dmgr-type sys-tick-cell'), box = c2.ticks[r.k]; td.dataset.yi = c2.yi; if (box) { td.title = r.title; box.setAttribute('aria-label', r.name + ' adds to DR against ' + c2.name); td.appendChild(box); } tr.appendChild(td); });
        body.appendChild(tr);
    });
    table.appendChild(body); scroll.appendChild(table);
    wrap.insertBefore(scroll, add ? add.nextSibling : null);
    return table;
}
// [sysuicheck:ticks-end]

// [sysuicheck:errors-start]
// Which box an error names, by what the validator calls it. A word it does not know goes to what Save says under the row, which is in sight
var PROP_BOX = [[/^(?:apply|then)\.(\d+)$/, ['sys-apply-formula']], [/^(?:formula|maxFormula)$/, ['sys-formula']], [/^roll$/, ['sys-roll']], [/^key$/, ['sys-key', 'sys-item-key']], [/^label$/, ['sys-label', 'sys-fx-name', 'sys-item-name']], [/^caption$/, ['sys-caption']], [/^track$/, ['sys-trackof']],
    [/^needs$/, ['sys-roll-needs']], [/^malf$/, ['sys-roll-malf']], [/^critAt$/, ['sys-roll-critat']], [/^fumbleAt$/, ['sys-roll-fumbleat']], [/^bigAt$/, ['sys-roll-bigat']], [/^hits$/, ['sys-roll-hits']], [/^dmgMajorIf$/, ['sys-roll-mjif']], [/^dtype$/, ['sys-roll-dtype']], [/^dkind$/, ['sys-roll-dkind']], [/^dmg2$/, ['sys-roll-p2f']], [/^dmg3$/, ['sys-roll-p3f']], [/^dmg4$/, ['sys-roll-p4f']], [/^dmg5$/, ['sys-roll-p5f']],
    [/^cost$/, ['sys-roll-cost', 'sys-item-cost']], [/^damage$/, ['sys-item-damage']], [/^throwSkill$/, ['sys-item-throw']], [/^lvlOnly$/, ['sys-item-only']], [/^to$/, ['sys-roll-near']], [/^resistBy$/, ['sys-roll-rsby']], [/^resistOr$/, ['sys-rsor']], [/^calls$/, ['sys-calls']],
    [/^list\.col\.(\d+)/, ['sys-list-colformula']], [/^list\.col\./, ['sys-list-colformula']], [/^list\.roll\.(\d+)/, ['sys-list-rollformula']], [/^list\.roll\./, ['sys-list-rollformula']], [/^list\.needs\.(\d+)/, ['sys-list-needs']], [/^list\.malf\.(\d+)/, ['sys-list-malf']], [/^list\.critAt\.(\d+)/, ['sys-list-critat']], [/^list\.fumbleAt\.(\d+)/, ['sys-list-fumbleat']], [/^list\.bigAt\.(\d+)/, ['sys-list-bigat']], [/^list\.(?:apply|then)\.(\d+)/, ['sys-list-applyformula']], [/^list\.ctr\.(\d+)/, ['sys-list-ctmax']],
    [/^list\.tile(if|taken)$/, ['sys-tboxes']], [/^list\.colshow$/, ['sys-list-colshow']], [/^list\.throwif$/, ['sys-list-throwif']], [/^list\.tradeif$/, ['sys-trade-if']], [/^list\.tilestate$/, ['sys-tstates']], [/^list\.sthen$/, ['sys-sthen']], [/^list\.standfits$/, ['sys-list-standfits']], [/^list\.standreach$/, ['sys-list-standreach']], [/^list\.standcounts$/, ['sys-list-standcounts']], [/^list\.modsif$/, ['sys-list-modsif']], [/^list\.fitif$/, ['sys-list-partsfitif']], [/^list\.capf$/, ['sys-pcaps']], [/^list\.subjectif$/, ['sys-list-sjif']], [/^list\.upamt$/, ['sys-list-upamt']], [/^list\.onneeds$/, ['sys-list-swneeds']], [/^list\.onshow$/, ['sys-list-swshow']], [/^list\.chneeds$/, ['sys-list-chamberneeds']], [/^list\.feedturns/, ['sys-list-feedturns']], [/^list\.feedif/, ['sys-list-feedif']], [/^list\.unheld$/, ['sys-list-unheldlvl']],
    [/^turn\.move$/, ['sys-turn-mvf']], [/^turn\.run$/, ['sys-turn-runf']], [/^turn\.holdLost$/, ['sys-turn-lostf']], [/^has$/, ['sys-bud-has']], [/^spent$/, ['sys-bud-spent']]];
// The box a word names in what holds it, the nth of its class where the word says which. Found by comparing, so nothing of a system file reaches a selector
function formToo(b) { if (b && b.hidden && window.wpFormBox && typeof window.wpFormBox.openFor === 'function') window.wpFormBox.openFor(b); return b; }
function boxIn(scope, prop) {
    if (typeof prop !== 'string' || !scope) return null;
    for (var i = 0; i < PROP_BOX.length; i++) {
        var m = PROP_BOX[i][0].exec(prop); if (!m) continue;
        for (var j = 0; j < PROP_BOX[i][1].length; j++) { var l = scope.querySelectorAll('.' + PROP_BOX[i][1][j]), hit = l[m[1] ? Math.min(+m[1], l.length - 1) : 0]; if (hit) return hit; }
    }
    return null;
}
var ERR_ROWS = 200;
// A line for every error and warning: where it stands, and what it says. Errors first
function errRows(errs, warns, whereOf, say) {
    var out = [], add = function(m, warn) { Object.keys(m || {}).forEach(function(id) { (m[id] || []).forEach(function(e) { if (out.length >= ERR_ROWS) return; var w = whereOf(id); out.push({ id: id, prop: e && e.prop, warn: warn, where: w ? w.name : '', text: say(e, warn) }); }); }); };
    add(errs, false); add(warns, true); return out;
}
function errCount(m) { return Object.keys(m || {}).reduce(function(n, k) { return n + ((m[k] || []).length); }, 0); }
function errWords(n, w) { return (n ? n + (n === 1 ? ' error' : ' errors') : '') + (n && w ? ', ' : '') + (w ? w + (w === 1 ? ' warning' : ' warnings') : ''); }
function errDraw(list, rows, doc) {
    while (list.firstChild) list.removeChild(list.firstChild);
    rows.forEach(function(r, i) {
        var b = doc.createElement('button'), a = doc.createElement('span'), t = doc.createElement('span'); b.type = 'button'; b.className = 'sys-err-go' + (r.warn ? ' warn' : ''); b.dataset.at = String(i);
        a.className = 'sys-err-where'; a.textContent = r.where || 'The system'; t.className = 'sys-err-says'; t.textContent = r.text; b.appendChild(a); b.appendChild(t); list.appendChild(b);
    });
}
// [sysuicheck:errors-end]

// [sysuicheck:notes-start]
// The long notes at the top of a tab fold away once read, and this computer keeps which. Fixed words of the page, moved by nothing but a press
function notesRead(store) { var out = {}; try { var v = JSON.parse(store.getItem('wp_sysNotes') || '{}'); if (v && typeof v === 'object') Object.keys(v).forEach(function(k) { if (/^sys[A-Za-z]+$/.test(k) && v[k] === 1) out[k] = 1; }); } catch (e) {} return out; }
function notesKeep(store, folded) { try { store.setItem('wp_sysNotes', JSON.stringify(folded)); return true; } catch (e) { return false; } }
function noteShow(note, b, folded) { note.hidden = !!folded; b.setAttribute('aria-expanded', folded ? 'false' : 'true'); b.textContent = folded ? 'About this tab' : 'Got it'; }
// [sysuicheck:notes-end]

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
    var dm = box.querySelector('.sys-dmgr'); if (dm) tickTable(dm, document);
}
function rulesDrawn() { var box = byId('sysRulesBox'), nav = byId('sysRulesNav'); topicsNav(nav, 'rules', document); topicsShow(box, nav, topicNow.rules); }
function marks(errs, warns) { lastErrs = errs; lastWarns = warns; topicMarks(byId('sysCombatNav'), 'combat', errs, warns); topicMarks(byId('sysRulesNav'), 'rules', errs, warns); footSync(); }
var picks = {}, lastErrs = null, lastWarns = null, host = null, groupsNow = keptGroups(store), groupsTouched = {};   // touched: a group worked in stays open while the editor is, though the row no longer uses it
function pickState(kind) { return picks[kind] || (picks[kind] = { id: '', at: 0, known: null }); }
// The list drawn for these rows, and which row is open
function pickDraw(kind, rows) {
    var c = own(PICK, kind) ? PICK[kind] : null; if (!c) return '';
    var st = pickState(kind), nx = pickNext(st, rows.map(function(r) { return r.id; })), list = byId(c.list), was = st.id; st.id = nx.id; st.at = nx.at; st.known = nx.known;
    if (!list) return st.id;
    var had = list.contains(document.activeElement), made = listWrite(list, kind, rows, document), b = listShow(list, st.id, lastErrs, lastWarns), box = byId(c.find);
    if (made) findApply(list, list.parentNode.querySelector('.sys-pick-none'), box ? box.value : '');
    if (b && (made || was !== st.id) && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
    if (b && made && had && b.focus) b.focus();
    return st.id;
}
function pickSet(kind, id) { pickState(kind).id = id; }
function pickReset() { picks = {}; groupsTouched = {}; Object.keys(PICK).forEach(function(k) { var f = byId(PICK[k].find), l = byId(PICK[k].list); if (f) f.value = ''; if (l) findApply(l, l.parentNode.querySelector('.sys-pick-none'), ''); }); }
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
    if (e.key === 'Escape' && t.classList.contains('sys-find') && t.value) { e.stopPropagation(); t.value = ''; findApply(t.parentNode.querySelector('.sys-pick-list'), t.parentNode.querySelector('.sys-pick-none'), ''); return; }
    if (e.key === 'Escape' && byId('sysErrList') && !byId('sysErrList').hidden) { e.stopPropagation(); errShow(false); var eb = byId('sysErrBtn'); if (eb && eb.focus) eb.focus(); return; }
    if (t.classList.contains('sys-pick-row')) { pickKey(e, t); return; }
    if (t.classList.contains('sys-topic')) {
        if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
        var nav = t.parentNode, n = e.key === 'Home' ? nav.firstChild : e.key === 'End' ? nav.lastChild : e.key === 'ArrowDown' ? t.nextSibling : t.previousSibling; e.preventDefault(); e.stopPropagation();
        if (n && n.dataset && n.dataset.topic) { showTopic(n.dataset.set, n.dataset.topic); n.focus(); }
    }
}
// The count of errors in the foot, and the list a press on it opens
var errNow = [], errHost = null;
function footSync() {
    var b = byId('sysErrBtn'), list = byId('sysErrList'), n = errCount(lastErrs), w = errCount(lastWarns); if (!b) return;
    b.hidden = !n && !w; b.textContent = errWords(n, w); b.classList.toggle('warn', !n && !!w);
    if (!n && !w) errShow(false); else if (list && !list.hidden) errFill();
}
function errFill() { var list = byId('sysErrList'); if (!list || !errHost) return; errNow = errRows(lastErrs, lastWarns, errHost.where, errHost.say); errDraw(list, errNow, document); }
function errShow(on) { var b = byId('sysErrBtn'), list = byId('sysErrList'); if (!list) return; if (on) errFill(); list.hidden = !on; if (b) b.setAttribute('aria-expanded', on ? 'true' : 'false'); }
// Onto the box an error names: what folds it opened, the box in view, the focus on it
function reach(id, prop) {
    var modal = byId('systemModal'), cells = modal ? modal.querySelectorAll('[data-err-for]') : [], cell = null, i;
    for (i = 0; i < cells.length && !cell; i++) if (cells[i].dataset.errFor === id) cell = cells[i];
    if (!cell) return null;
    var scope = cell.closest('.sys-row') || (hasClass(cell.previousSibling || {}, 'sys-list-card') ? cell.previousSibling : cell.parentNode), box = boxIn(scope, prop), to = box && box.hidden && box.parentNode ? box.parentNode : box || cell;   // a box under a form: its form
    for (var n = to; n && n !== modal; n = n.parentNode) if (n.tagName === 'DETAILS') { n.open = true; if (n.dataset && n.dataset.grp) groupsTouched[n.dataset.grp] = 1; }
    if (to.scrollIntoView) to.scrollIntoView({ block: 'center' });
    if (box && box.hidden) formToo(box); else if (box && box.focus) box.focus();
    return to;
}
function onErrPress(e) {
    var b = e.target && e.target.closest ? e.target.closest('.sys-err-go, #sysErrBtn') : null; if (!b) { if (!(e.target && e.target.closest && e.target.closest('#sysErrList'))) errShow(false); return; }
    e.stopPropagation();
    if (b.id === 'sysErrBtn') { var l = byId('sysErrList'); errShow(!!l && l.hidden); return; }
    var r = errNow[+b.dataset.at]; if (!r || !errHost) return;
    errShow(false); errHost.go(r.id, r.prop); log('error-go', { reached: !!reach(r.id, r.prop) });
}
// A press on a group's name folds or opens it, and this computer keeps which
function onGroupPress(e) {
    var s = e.target && e.target.closest ? e.target.closest('.sys-grp-head') : null, d = s ? s.parentNode : null; if (!d || !d.dataset || !d.dataset.grp) return;
    groupsNow[d.dataset.grp] = d.open ? 0 : 1; groupsKeep(store, groupsNow);   // read before the browser turns it
}
function onGroupFocus(e) { var d = e.target && e.target.closest ? e.target.closest('.sys-grp') : null; if (d && d.dataset && d.dataset.grp) groupsTouched[d.dataset.grp] = 1; }
function arrangeOne(row, kind) { try { return arrange(row, kind, document, groupsNow, groupsTouched); } catch (e) { log('arrange-failed', { kind: kind }); return row; } }
function arrangeIn(box, kind, cls) { for (var c = box.firstChild; c; c = c.nextSibling) if (hasClass(c, cls)) arrangeOne(c, kind); }
var notesFolded = notesRead(store);
function notesWire() {
    var m = byId('systemModal'); if (!m) return;
    m.querySelectorAll('.sys-toolbar .sys-note').forEach(function(note) {
        var bar = note.parentNode, tab = bar ? bar.parentNode : null; if (!tab || !hasClass(tab, 'sys-tab') || !tab.id) return;
        var key = tab.id, b = document.createElement('button'); b.type = 'button'; b.className = 'tool ghost sys-note-btn'; b.dataset.note = key;
        bar.insertBefore(b, note.nextSibling); noteShow(note, b, notesFolded[key] === 1);
        b.addEventListener('click', function(e) { e.stopPropagation(); if (notesFolded[key] === 1) delete notesFolded[key]; else notesFolded[key] = 1; notesKeep(store, notesFolded); noteShow(note, b, notesFolded[key] === 1); });
    });
}
// What a type of damage is called follows what is typed into its name
function onNameInput(e) {
    var t = e.target; if (!t || !t.classList || !(t.classList.contains('sys-dmgr-ylabel') || t.classList.contains('sys-dmgr-ykey'))) return;
    var tw = t.closest('.sys-dmgr-type'), m = byId('sysCombatBox'), th = tw && m ? m.querySelector('th.sys-tick-col[data-yi="' + tw.dataset.yi + '"]') : null; if (!th) return;
    var lb = tw.querySelector('.sys-dmgr-ylabel'), ky = tw.querySelector('.sys-dmgr-ykey'); th.textContent = (lb && lb.value) || (ky && ky.value) || 'Type ' + (+tw.dataset.yi + 1);
}
function wire() { var m = byId('systemModal'); if (m) { m.addEventListener('keydown', onKey); m.addEventListener('click', onGroupPress); m.addEventListener('click', onErrPress); m.addEventListener('input', onNameInput); m.addEventListener('focusin', onGroupFocus); } Object.keys(PICK).forEach(pickWire); notesWire(); }
window.wpSysUi = { topicPress: topicPress, combatDrawn: combatDrawn, rulesDrawn: rulesDrawn, marks: marks, pickDraw: pickDraw, pickSet: pickSet, pickReset: pickReset, moveIn: moveIn, errHost: function(h) { errHost = h; }, topicOf: function(id) { return own(ERR_TOPIC, id) ? ERR_TOPIC[id] : /^b_/.test(id) ? ['rules', 'budgets'] : null; }, topicName: function(s, t) { var l = own(TOPICS, s) ? TOPICS[s] : [], i; for (i = 0; i < l.length; i++) if (l[i][0] === t) return l[i][1]; return ''; }, arrange: arrangeOne, arrangeIn: arrangeIn, isPick: function(k) { return own(PICK, k); }, paneOf: function(k) { return own(PICK, k) ? PICK[k].pane : ''; }, host: function(h) { host = h; } };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
