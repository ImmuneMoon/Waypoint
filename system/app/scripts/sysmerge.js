/* sysmerge.js: the System editor's Merge from a file (1.6.4; held over from the System editor review of 2026-11-21, built on Fulllion's pick of
   2026-11-23). Import and Start from replace the whole draft; Merge brings just some fields, lists, rolls, items, effects and point budgets from
   another system file into it, each ticked one by one, under fresh ids.

   What it holds:
   - the pure half, run by the suites as it is: mergeOffer (what a file holds, by kind, in the names the editor shows), mergePlan (what a pick
     would add: fresh ids, short names made unique as keyFromLabel makes them, the references between picked things rewritten to their new ids,
     and what a picked thing still names that the draft lacks), mergeApply (the plan put into a draft) and mergeSays (what the editor says
     under a row after a merge, for each thing that still names something the draft lacks);
   - the window: a question of the app's own (showConfirm, with a body) that lists what the file holds with a tick each, a search over them,
     what the pick still lacks, and Merge.
   sysedtabs.js mergeFile reads the file, cleans it in the GM's view as Import does, and opens the window with a host that makes the change
   (the draft, markDirty, renderAll), so the merge is one step of the editor's Undo and nothing is saved until Save. sysederr.js
   refreshErrors asks mergeSays through window.wpSysMerge.

   How a reference is found. A picked thing's text is walked to its every string:
   - a string that is exactly the id of something in the file is a reference to it (a change aimed at a field, a list's starting entries,
     an effect a roll switches on). A picked one's is rewritten to its new id. One not picked is joined to the draft's own where the draft
     holds the same id, or a field of the same short name, an item of the same short name or name, an effect, a roll or a point budget of
     the same name; with none, the id is left as it is and said as a thing the draft lacks;
   - a string the formula engine reads as a formula (a box that holds plain words or a pick is passed over: PLAIN) has its names read: a name
     whose first part is the old short name of a picked field that had to change is rewritten to the new one, in place, at the name's own
     position, and a name that is the short name of a field of the file left unticked, which the draft has none of, is said as lacking. */
import { findMatch } from './uiparts.js';

// The kinds a merge offers, in the order the window lists them. list: where the system keeps them; pre: their ids' start (systemcore's
// FIELD_ID, ROLL_ID, ITEM_ID, EFFECT_ID and the point budgets' id rule, each up to 24 letters, digits or _ after it); cap: their LIMITS entry
// (fields and lists share the fields' one)
var MERGE_KINDS = [
    { k: 'field', list: 'fields', title: 'Fields', word: 'field', pre: 'f_', cap: 'fields', is: function(x) { return x.kind !== 'item-list'; } },
    { k: 'list', list: 'fields', title: 'Lists', word: 'list', pre: 'f_', cap: 'fields', is: function(x) { return x.kind === 'item-list'; } },
    { k: 'roll', list: 'rolls', title: 'Rolls', word: 'roll', pre: 'r_', cap: 'rolls' },
    { k: 'item', list: 'items', title: 'Items', word: 'item', pre: 'i_', cap: 'items' },
    { k: 'effect', list: 'effects', title: 'Effects', word: 'effect', pre: 'e_', cap: 'effects' },
    { k: 'budget', list: 'budgets', title: 'Point budgets', word: 'point budget', pre: 'b_', cap: 'budgets' }
];
var ID_RE = /^[a-z]_[A-Za-z0-9_]{1,24}$/;
// The boxes that hold plain words, a pick from a short list, or a list's own stat by its key: never a formula, so never read as one, though
// many of their values ("owner", "max", "hp") read as a name to the formula engine
var PLAIN = { id: 1, key: 1, kind: 1, vis: 1, edit: 1, label: 1, labels: 1, name: 1, notes: 1, desc: 1, says: 1, credits: 1, icon: 1, tone: 1, tones: 1,
    category: 1, cats: 1, options: 1, unit: 1, unitShow: 1, place: 1, paidPlace: 1, money: 1, words: 1, columns: 1, cells: 1, dir: 1, u: 1, each: 1,
    side: 1, op: 1, again: 1, stack: 1, posture: 1, postureKeep: 1, part: 1, endGroup: 1, over: 1, when: 1, from: 1, s: 1, c: 1, ct: 1, by: 1, job: 1,
    slot: 1, capBy: 1, sets: 1, placeBy: 1, apart: 1, fall: 1, attemptKey: 1, burst: 1, shape: 1, dtype: 1, dtype2: 1, dtype3: 1, dkind: 1, offLabel: 1,
    rank: 1, free: 1, at: 1, toGm: 1, priceCol: 1, needsMsg: 1, msg: 1, rmMsg: 1, hint: 1, explain: 1, title: 1, text: 1, dur: 1, f: 1, fx: 1, entry: 1,
    tip: 1, low: 1, high: 1, stations: 1, hosts: 1, is: 1, caption: 1, def: 1, sub: 1 };
// a box of words by its name's ending too (needsText, fitSays, throwSays, a message), whatever its owner calls it (the review of the merge)
function plainProp(prop) { return !!PLAIN[prop] || /(Says|Text|Msg|Words|Label|Note|Notes)$/.test(String(prop)); }
// a word in any text that is exactly an id (a formula's Fx.e_x.on, a reference such as f_weapons#3), bounded by what no id holds
var ID_WORD = /(^|[^A-Za-z0-9_])([a-z]_[A-Za-z0-9_]{1,24})(?![A-Za-z0-9_])/g;

function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function low(s) { return String(s || '').toLowerCase(); }
function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
function kindOf(k) { return MERGE_KINDS.filter(function(m) { return m.k === k; })[0] || null; }
// the name the editor shows for a thing: a field's and a list's label (its short name where it has none), a roll's label, an item's, an
// effect's and a point budget's name
function nameOf(k, x) { if (!x) return ''; var n = k === 'field' || k === 'list' || k === 'roll' ? x.label : x.name; return String(n || x.key || '').trim(); }
// the things a system holds of one kind, each with an id of its own form
function thingsOf(sys, m) { var l = isObj(sys) && Array.isArray(sys[m.list]) ? sys[m.list] : []; return l.filter(function(x) { return isObj(x) && typeof x.id === 'string' && ID_RE.test(x.id) && (!m.is || m.is(x)); }); }

// What a file holds, by kind, in the window's order: [{ k, title, rows: [{ id, name, sub }] }], a kind with nothing left out. sub is a few gray
// words beside the name (GM only, or a field's kind in the words the host gives: kindWord)
function mergeOffer(src, kindWord) {
    var out = [];
    MERGE_KINDS.forEach(function(m) {
        var rows = thingsOf(src, m).map(function(x) {
            var sub = []; if (m.k === 'field' && typeof kindWord === 'function') { var w = kindWord(x); if (w) sub.push(w); }
            if (x.vis === 'gm') sub.push('GM only');
            return { id: x.id, name: nameOf(m.k, x) || '(no name)', sub: sub.join(', ') };
        });
        if (rows.length) out.push({ k: m.k, title: m.title, rows: rows });
    });
    return out;
}

// a short name made from a base and free in taken (lower case to 1), as sysedlayout.js keyFromLabel makes one: the base, else the base with
// 2, 3 and on after it. ok(k) says whether a short name can be used at all; a base that cannot takes Value after it, as keyFromLabel's does
function freeKey(base, taken, ok, cap) {
    var k = String(base || '').slice(0, cap); if (!k) return '';
    if (ok && !ok(k)) k = (k + 'Value').slice(0, cap);
    var out = k, n = 2; while (taken[low(out)] && n < 10000) { var tail = String(n++); out = k.slice(0, cap - tail.length) + tail; }
    return ok && !ok(out) ? '' : out;
}
// a short name made from a name, as keyFromLabel makes one: each word with a capital, run together, no figure at its start
function keyFromName(label) { return String(label || '').replace(/[^A-Za-z0-9 ]/g, ' ').trim().split(/ +/).map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join('').replace(/^[0-9]+/, '').slice(0, 24); }

// every name node of a parsed formula, at any depth of its tree
function nameNodes(ast, out) {
    if (Array.isArray(ast)) { ast.forEach(function(x) { nameNodes(x, out); }); return out; }
    if (!isObj(ast)) return out;
    if (ast.t === 'name' && typeof ast.text === 'string' && typeof ast.pos === 'number') out.push(ast);
    Object.keys(ast).forEach(function(k) { if (k !== 'top' && ast[k] && typeof ast[k] === 'object') nameNodes(ast[k], out); });
    return out;
}

// What ticking `ticked` (an id to true) of `src` would add to `draft`. o: { F (the formula engine), keyOk (a field's short name can be used:
// systemcore validKey), itemKeyOk (an item's: cleanItemKey), uid (a fresh id after a start), limits (LIMITS), keyCap (LIMITS.key) }.
// Answers { things: [{ k, list, from (the file's id), obj (the new thing) }], n, idMap, keyMap, gaps: [{ from: { k, id (new), name },
// to: { k, id (the file's), name }, how: 'id' | 'reads' }], over: [{ title, n, max }], lacks (the file's ids the gaps name, to tick) }.
// Nothing of draft or src is changed
function mergePlan(src, draft, ticked, o) {
    o = o || {}; ticked = ticked || {};
    var F = o.F, cap = o.keyCap || 64, lim = o.limits || {};
    var byId = Object.create(null), picked = [];
    MERGE_KINDS.forEach(function(m) { thingsOf(src, m).forEach(function(x) { if (!byId[x.id]) byId[x.id] = { k: m.k, m: m, x: x }; }); });
    // the picked ones in the file's own order, list by list, so fields and lists keep their order among each other as the file has them
    ['fields', 'rolls', 'items', 'effects', 'budgets'].forEach(function(l) { (isObj(src) && Array.isArray(src[l]) ? src[l] : []).forEach(function(x) { var s = isObj(x) && typeof x.id === 'string' ? byId[x.id] : null; if (s && s.x === x && s.m.list === l && ticked[x.id] === true && picked.indexOf(s) < 0) picked.push(s); }); });
    // the ids the draft holds, so a fresh one is none of them
    var taken = Object.create(null); MERGE_KINDS.forEach(function(m) { thingsOf(draft, m).forEach(function(x) { taken[x.id] = 1; }); });
    var fresh = function(pre) { var id = ''; for (var i = 0; i < 50 && (!id || taken[id] || !ID_RE.test(id)); i++) id = (typeof o.uid === 'function' ? o.uid(pre) : pre + Math.random().toString(36).slice(2, 10)); taken[id] = 1; return id; };
    var idMap = Object.create(null); picked.forEach(function(p) { idMap[p.x.id] = fresh(p.m.pre); });
    // short names: a picked field keeps its own where the draft holds none of that name, else one made unique; an item's likewise
    var fKeys = Object.create(null), dFieldKey = Object.create(null), iKeys = Object.create(null), dItemKey = Object.create(null), dItemName = Object.create(null);
    (isObj(draft) && Array.isArray(draft.fields) ? draft.fields : []).forEach(function(f) { if (isObj(f) && typeof f.key === 'string' && f.key) { fKeys[low(f.key)] = 1; if (typeof f.id === 'string') dFieldKey[low(f.key)] = f; } });
    (isObj(draft) && Array.isArray(draft.items) ? draft.items : []).forEach(function(it) { if (!isObj(it)) return; if (typeof it.key === 'string' && it.key) { iKeys[low(it.key)] = 1; dItemKey[low(it.key)] = it; } if (typeof it.name === 'string' && it.name.trim()) dItemName[low(it.name.trim())] = it; });
    var keyMap = Object.create(null), itemKeyMap = Object.create(null), newKey = Object.create(null);
    picked.forEach(function(p) {
        if (p.k === 'field' || p.k === 'list') {
            var was = typeof p.x.key === 'string' ? p.x.key : '', k = freeKey(was || keyFromName(p.x.label), fKeys, o.keyOk, cap);
            if (k) fKeys[low(k)] = 1; newKey[p.x.id] = k; if (was && k && k !== was) keyMap[low(was)] = k;
        } else if (p.k === 'item' && typeof p.x.key === 'string' && p.x.key) {
            var ik = freeKey(p.x.key, iKeys, o.itemKeyOk, 40); if (ik) iKeys[low(ik)] = 1; newKey[p.x.id] = ik; if (ik && ik !== p.x.key) itemKeyMap[low(p.x.key)] = ik;
        }
    });
    // the file's fields by short name, for a formula that reads one; and where a thing left unticked stands in the draft, if anywhere
    var srcKey = Object.create(null); MERGE_KINDS.slice(0, 2).forEach(function(m) { thingsOf(src, m).forEach(function(x) { if (typeof x.key === 'string' && x.key && !srcKey[low(x.key)]) srcKey[low(x.key)] = byId[x.id]; }); });
    var linkOf = function(s) {
        var dl = thingsOf(draft, s.m), same = dl.filter(function(y) { return y.id === s.x.id; })[0]; if (same) return same.id;
        // a field or a list: the draft's of the same short name, else of the same name, and of the same kind only (Fulllion, 2026-11-23: "link to this
        // system's thing of the same name and kind"; a change that switches a toggle is dropped on a number)
        if (s.k === 'field' || s.k === 'list') {
            var df = typeof s.x.key === 'string' && s.x.key ? dFieldKey[low(s.x.key)] : null; if (df && df.kind === s.x.kind) return df.id;
            var labelLow = low(String(s.x.label || '').trim()), sameLabel = labelLow ? (isObj(draft) && Array.isArray(draft.fields) ? draft.fields : []).filter(function(y) { return isObj(y) && typeof y.id === 'string' && y.kind === s.x.kind && low(String(y.label || '').trim()) === labelLow; })[0] : null;
            return sameLabel ? sameLabel.id : '';
        }
        if (s.k === 'item') { var di = (typeof s.x.key === 'string' && s.x.key && dItemKey[low(s.x.key)]) || (typeof s.x.name === 'string' && dItemName[low(s.x.name.trim())]) || null; return di && typeof di.id === 'string' ? di.id : ''; }
        var nm = low(nameOf(s.k, s.x)); if (!nm) return ''; var hit = dl.filter(function(y) { return low(nameOf(s.k, y)) === nm; })[0]; return hit ? hit.id : '';
    };
    var gaps = [], gapSeen = Object.create(null), lacks = Object.create(null);
    var gap = function(p, s, how) { var g = p.x.id + '>' + s.x.id; if (gapSeen[g]) return; gapSeen[g] = 1; lacks[s.x.id] = 1; gaps.push({ from: { k: p.k, id: idMap[p.x.id], name: nameOf(p.k, p.x) }, to: { k: s.k, id: s.x.id, name: nameOf(s.k, s.x) }, how: how }); };
    // every word of a text that is exactly the id of something in the file: a picked one's new id, else the draft's own, else left and said
    var ids = function(p, str) {
        return str.replace(ID_WORD, function(all, before, id) {
            if (idMap[id]) return before + idMap[id];
            var s = byId[id]; if (!s) return all;
            var ln = linkOf(s); if (ln) return before + ln;
            gap(p, s, 'id'); return all;
        });
    };
    // a formula's names rewritten where a picked short name changed, and read for a field of the file left unticked. A short name may hold dots
    // (Skill.Acrobatics), so a name is matched by its longest leading part that is a short name: of a picked field, of a field of the file, or of
    // the draft's. A lone lower-case word is renamed where it is a short name that changed, but never said as lacking: it is more often a pick
    var formula = function(p, str) {
        if (!F || typeof F.parse !== 'function') return str;
        var lone = /^[a-z][a-z0-9_]*$/.test(str), pr = null; try { pr = F.parse(str); } catch (e) { pr = null; } if (!pr || !pr.ok) return str;
        var edits = [];
        nameNodes(pr.ast, []).forEach(function(nd) {
            if (str.substr(nd.pos, nd.len) !== nd.text) return;   // where the engine's place for the name is not the text's own, it is left alone
            var parts = nd.text.split('.'), changed = false, at = 1;
            for (var i = parts.length; i >= 1; i--) {
                var pre = low(parts.slice(0, i).join('.'));
                if (keyMap[pre]) { parts = [keyMap[pre]].concat(parts.slice(i)); changed = true; break; }
                if (srcKey[pre]) { if (!lone && ticked[srcKey[pre].x.id] !== true && !dFieldKey[pre]) gap(p, srcKey[pre], 'reads'); parts = [parts.slice(0, i).join('.')].concat(parts.slice(i)); break; }
                if (dFieldKey[pre]) { parts = [parts.slice(0, i).join('.')].concat(parts.slice(i)); break; }
            }
            if (parts.length > at && itemKeyMap[low(parts[at])]) { parts[at] = itemKeyMap[low(parts[at])]; changed = true; }   // a list's entry by its short name, as a list's column reads it
            if (changed && !edits.some(function(e) { return e.at === nd.pos; })) edits.push({ at: nd.pos, len: nd.len, text: parts.join('.') });   // a node met twice in the tree is rewritten once
        });
        edits.sort(function(a, b) { return b.at - a.at; }).forEach(function(e) { str = str.slice(0, e.at) + e.text + str.slice(e.at + e.len); });
        return str;
    };
    // a name a box of words shows in braces (a label "Punch attack {UnarmedAtk}", a caption) follows as a formula's does
    var braces = function(p, str) { return str.indexOf('{') < 0 ? str : str.replace(/\{([^{}]{1,300})\}/g, function(all, inner) { return '{' + formula(p, inner) + '}'; }); };
    var walk = function(p, v, prop, path, host) {
        if (typeof v === 'string') {
            if (idMap[v]) return idMap[v];
            var s = byId[v]; if (s) { var ln = linkOf(s); if (ln) return ln; gap(p, s, 'id'); return v; }
            // a change or a bonus aimed at an item by its short name: a nested key of a part that is no column, counter or stat (each of those
            // carries a label or a formula, and its key is the list's own)
            if (prop === 'key' && path.length > 1 && path.indexOf('stats') < 0 && isObj(host) && !('label' in host) && !('formula' in host) && itemKeyMap[low(v)]) return itemKeyMap[low(v)];
            var t = ids(p, v);
            return plainProp(prop) ? braces(p, t) : formula(p, t);
        }
        if (Array.isArray(v)) return v.map(function(x, i) { return walk(p, x, prop, path.concat([i]), host); });
        if (isObj(v)) { var out = {}; Object.keys(v).forEach(function(k) { out[k] = walk(p, v[k], k, path.concat([k]), v); }); return out; }
        return v;
    };
    // names (Fulllion, 2026-11-23: "number duplicate names of effects, rolls and items too (Bleeding 2), as fields are"): an effect, a roll or an
    // item whose name the draft, or an earlier pick of this merge, already uses gets a number after it, 2, 3 and on, cut to fit the name's limit.
    // A field's and a list's label stays as it is: its short name tells it apart
    var NAME_OF = { roll: 'label', effect: 'name', item: 'name' }, nameCap = { roll: lim.label || 60, effect: lim.name || 60, item: lim.itemName || 240 }, takenName = {};
    Object.keys(NAME_OF).forEach(function(k) { var t = takenName[k] = Object.create(null); thingsOf(draft, kindOf(k)).forEach(function(y) { var n = typeof y[NAME_OF[k]] === 'string' ? y[NAME_OF[k]].trim() : ''; if (n) t[low(n)] = 1; }); });
    var freeName = function(k, nm) {
        var base = String(nm).trim(), out = base, n = 2, t = takenName[k];
        while (t[low(out)] && n < 10000) { var tail = ' ' + (n++); out = base.slice(0, nameCap[k] - tail.length).trim() + tail; }
        t[low(out)] = 1; return out;
    };
    // the roll that orders a fight is one in a system (the editor's tick clears the others): a merged roll that carries it keeps it only where the
    // draft names none and no earlier pick of this merge took it; else it comes in as a plain roll, and the merge's notice says so (initOff)
    var initTaken = (isObj(draft) && Array.isArray(draft.rolls) ? draft.rolls : []).some(function(r) { return isObj(r) && r.init === true; }), initOff = '';
    var things = picked.map(function(p) {
        var src0 = clone(p.x), id0 = src0.id, key0 = src0.key; delete src0.id; delete src0.key;
        var obj = walk(p, src0, '', []); var out = { id: idMap[id0] };
        if (p.k === 'field' || p.k === 'list') out.key = newKey[id0] || ''; else if (p.k === 'item' && typeof key0 === 'string' && key0) out.key = newKey[id0] || '';
        Object.keys(obj).forEach(function(k) { out[k] = obj[k]; });
        var np = NAME_OF[p.k]; if (np && typeof out[np] === 'string' && out[np].trim()) out[np] = freeName(p.k, out[np]);   // the walked name, so a {name} in a roll's label has followed first
        if (p.k === 'roll' && out.init === true) { if (initTaken) { delete out.init; initOff = initOff || out.label || 'A roll'; } else initTaken = true; }
        return { k: p.k, list: p.m.list, from: id0, obj: out };
    });
    // the limits: what the draft holds and the pick together, by the LIMITS entry each counts against
    var over = [], counts = Object.create(null); picked.forEach(function(p) { counts[p.m.cap] = (counts[p.m.cap] || 0) + 1; });
    Object.keys(counts).forEach(function(c) { var m = MERGE_KINDS.filter(function(x) { return x.cap === c; })[0], has = isObj(draft) && Array.isArray(draft[m.list]) ? draft[m.list].length : 0, max = lim[c]; if (typeof max === 'number' && has + counts[c] > max) over.push({ title: c === 'fields' ? 'fields and lists' : m.title.toLowerCase(), n: has + counts[c], max: max }); });
    var file = isObj(src) && typeof src.name === 'string' ? src.name : ''; gaps.forEach(function(g) { g.file = file; });   // which file a gap is of, so a later merge points it only at a thing of that same file
    return { things: things, n: things.length, idMap: idMap, keyMap: keyMap, gaps: gaps, over: over, lacks: Object.keys(lacks), file: file, initOff: initOff };
}

// The plan put into the draft, in the file's order at the end of each list. rec is what the editor keeps of earlier merges' gaps while it is
// open: a thing merged earlier that still names a file's id this merge brings is pointed at its new id, and this merge's own gaps by id are
// added to it. Answers how many of each kind came in ({ field: 2, roll: 1 })
function mergeApply(draft, plan, rec) {
    if (!isObj(draft) || !plan) return {};
    var got = {};
    plan.things.forEach(function(t) { if (!Array.isArray(draft[t.list])) draft[t.list] = []; draft[t.list].push(t.obj); got[t.k] = (got[t.k] || 0) + 1; });
    if (Array.isArray(rec)) {
        rec.forEach(function(g) {
            var to = plan.idMap[g.to.id]; if (!to || (g.file || '') !== (plan.file || '')) return; var th = findThing(draft, g.from.id); if (!th) return;
            var swap = function(v) { if (typeof v === 'string') return v === g.to.id ? to : v; if (Array.isArray(v)) return v.map(swap); if (isObj(v)) { Object.keys(v).forEach(function(k) { if (k !== 'id') v[k] = swap(v[k]); }); return v; } return v; };
            swap(th.x);
        });
        // every gap is kept, the relinked ones too: an Undo can bring back the draft in which the thing names the file's id again, and mergeSays
        // reads each against the draft as it stands, so a gap that no longer holds says nothing. One line a thing and the id it names
        plan.gaps.forEach(function(g) { if (g.how === 'id' && !rec.some(function(r) { return r.from.id === g.from.id && r.to.id === g.to.id; })) rec.push(clone(g)); });
    }
    return got;
}
function findThing(sys, id) {
    for (var i = 0; i < MERGE_KINDS.length; i++) { var m = MERGE_KINDS[i], x = thingsOf(sys, m).filter(function(y) { return y.id === id; })[0]; if (x) return { m: m, x: x }; }
    return null;
}
function holds(v, s) { if (typeof v === 'string') return v === s; if (Array.isArray(v)) return v.some(function(x) { return holds(x, s); }); if (isObj(v)) return Object.keys(v).some(function(k) { return k !== 'id' && holds(v[k], s); }); return false; }
function article(w) { return /^[aeiou]/.test(w) ? 'an ' : 'a '; }
// What the editor says under a row after a merge (refreshErrors): for each kept gap whose thing still stands in the draft and still names the
// file's id that the draft does not hold, one line, filed where that thing's row reads it ('list:' and the id for an item list's own part,
// 'budgets' for a point budget, else the thing's id), with what Save does with it, read from the cleaned system (clean)
function mergeSays(draft, clean, rec) {
    var out = [];
    (Array.isArray(rec) ? rec : []).forEach(function(g) {
        var th = findThing(draft, g.from.id); if (!th || findThing(draft, g.to.id)) return;
        var inList = th.m.k === 'list' && isObj(th.x.list) && holds(th.x.list, g.to.id); if (!inList && !holds(th.x, g.to.id)) return;
        var ct = clean ? findThing(clean, g.from.id) : null, kept = !!(ct && holds(ct.x, g.to.id)), w = (kindOf(g.to.k) || {}).word || 'thing';
        var says = '“' + g.to.name + '”, ' + article(w) + w + ' of the file this was merged from, is not in this system, so ' + (kept ? 'what names it does nothing. ' : 'Save drops what names it. ') + 'Pick one this system has, or merge it too.';
        out.push({ id: th.m.k === 'budget' ? 'budgets' : inList ? 'list:' + th.x.id : th.x.id, message: th.m.k === 'budget' ? (th.x.name || 'A point budget') + ': ' + says : says });
    });
    return out;
}

// ---- the window ----
// Every feature logs its steps (CLAUDE.md): one line a step through the app's step log, its words 'sysmerge v1' and the step's name, carrying
// structure only (counts, yes or no), never a name or anything of the file's content. sysedtabs.js mergeFile logs its own two failures through it
function logMergeStep(step, fields) { try { if (typeof window !== 'undefined' && window && typeof window.wpStepLog === 'function') window.wpStepLog('sysmerge v1', step, fields || {}); } catch (e) {} }
var _rec = [];   // the gaps of this session's merges that the editor still says (mergeSays), while their things stand
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function joinWords(list) { return list.length < 2 ? list.join('') : list.slice(0, -1).join(', ') + ' and ' + list[list.length - 1]; }
function nOf(n, w) { return n + ' ' + (n === 1 ? w : w === 'point budget' ? 'point budgets' : w + 's'); }
// The lines that say, before Merge, what a pick still names that the draft lacks
function gapWords(g) {
    var fw = (kindOf(g.from.k) || {}).word || 'thing', tw = (kindOf(g.to.k) || {}).word || 'thing';
    return '“' + (g.from.name || 'It') + '” (' + fw + ') ' + (g.how === 'reads' ? 'reads' : 'uses') + ' the ' + tw + ' “' + (g.to.name || '?') + '”, which this system lacks and you have not ticked.';
}
// host: { name (the file's system's name), draft() (the live draft), plan options (F, keyOk, itemKeyOk, uid, limits, keyCap), kindWord(f),
// confirm (showConfirm), toast, apply(plan) (the change, made by the editor) }
function open(src, host) {
    var offer = mergeOffer(src, host.kindWord);
    if (!offer.length) { logMergeStep('empty', {}); host.toast('That file holds no fields, lists, rolls, items, effects or point budgets to merge.'); return; }
    var offered = {}; offer.forEach(function(g) { offered[g.k] = g.rows.length; }); logMergeStep('start', offered);
    var ticked = Object.create(null), plan = null, boxes = [], heads = [], checkT = 0;
    // what the editor's own check of the whole system would say after Merge that it does not say now, worked out a moment after the ticks
    // settle (it reads the whole system): it names what the pick uses that Merge does not bring, such as a linked sheet, a library entry or a
    // Combat tab setting. host.faults answers those lines in the editor's words; a host without it says nothing here
    var faults = el('div', 'sm-says-faults');
    var checkSoon = function() {
        clearTimeout(checkT); faults.textContent = ''; if (typeof host.faults !== 'function' || !plan || !plan.n || plan.over.length) return;
        var at = plan; checkT = setTimeout(function() {
            if (at !== plan) return; var d = host.draft(), lines = []; try { var cand = clone(d); mergeApply(cand, at, null); lines = host.faults(cand) || []; } catch (e) { lines = []; }
            if (at !== plan || !lines.length) return;
            faults.appendChild(el('div', 'sm-gaps-lead', lines.length === 1 ? 'After Merge the editor will also say one thing to fix:' : 'After Merge the editor will also say ' + lines.length + ' things to fix, such as:'));
            lines.slice(0, 3).forEach(function(t) { faults.appendChild(el('div', 'sm-gap', t)); });
        }, 350);
    };
    var body = el('div', 'sm-box'), lead = el('div', 'sm-lead', 'Tick what to bring into this system. Each comes in new, beside what you have, and a name this system already uses gets a number after it. Nothing is saved until you Save, and Undo takes the whole merge back.');
    var find = el('input', 'field sm-find'); find.type = 'search'; find.placeholder = 'Find by name'; find.setAttribute('aria-label', 'Find by name');
    var list = el('div', 'sm-list'), says = el('div', 'sm-says'), count = el('div', 'sm-count');
    body.appendChild(lead); if (host.left) body.appendChild(el('div', 'sm-lead', 'Left out of the file as it was read (over the limits, or not valid): ' + host.left + '.'));
    body.appendChild(find); body.appendChild(list); body.appendChild(count); body.appendChild(says);
    offer.forEach(function(g) {
        var sec = el('div', 'sm-group'), hd = el('label', 'sys-check sm-head'), all = el('input'); all.type = 'checkbox'; hd.appendChild(all); hd.appendChild(document.createTextNode(' ' + g.title + ' (' + g.rows.length + ')')); sec.appendChild(hd);
        var mine = [];
        g.rows.forEach(function(r) {
            var lb = el('label', 'sys-check sm-row'), cb = el('input'); cb.type = 'checkbox'; cb.dataset.id = r.id; lb.appendChild(cb); lb.appendChild(document.createTextNode(' ' + r.name)); if (r.sub) lb.appendChild(el('span', 'sm-sub', r.sub));
            lb._find = { name: r.name, sub: r.sub }; sec.appendChild(lb); boxes.push(cb); mine.push(cb);
        });
        all.addEventListener('change', function() { mine.forEach(function(cb) { if (!cb.parentNode.hidden) { cb.checked = all.checked; ticked[cb.dataset.id] = all.checked; } }); });
        heads.push({ all: all, mine: mine, sec: sec }); list.appendChild(sec);
    });
    var redraw = function() {
        boxes.forEach(function(cb) { ticked[cb.dataset.id] = cb.checked; });
        heads.forEach(function(h) { var on = h.mine.filter(function(cb) { return cb.checked; }).length; h.all.checked = on === h.mine.length; h.all.indeterminate = on > 0 && on < h.mine.length; });
        plan = mergePlan(src, host.draft(), ticked, host);
        var per = {}; plan.things.forEach(function(t) { per[t.k] = (per[t.k] || 0) + 1; });
        count.textContent = plan.n ? 'Merge brings ' + joinWords(MERGE_KINDS.filter(function(m) { return per[m.k]; }).map(function(m) { return nOf(per[m.k], m.word); })) + '.' : 'Nothing is ticked yet.';
        says.textContent = '';
        plan.over.forEach(function(v) { says.appendChild(el('div', 'sm-over', 'That makes ' + v.n + ' ' + v.title + ', and a system holds at most ' + v.max + '. Untick some to merge.')); });
        if (plan.gaps.length) {
            says.appendChild(el('div', 'sm-gaps-lead', plan.gaps.length === 1 ? 'One thing you ticked uses something this system lacks:' : plan.gaps.length + ' things you ticked use something this system lacks:'));
            plan.gaps.slice(0, 12).forEach(function(g) { says.appendChild(el('div', 'sm-gap', gapWords(g))); });
            if (plan.gaps.length > 12) says.appendChild(el('div', 'sm-gap', (plan.gaps.length - 12) + ' more are not listed.'));
            var tk = el('button', 'tool ghost sm-tick-too', 'Tick what they use too'); tk.type = 'button'; tk.title = 'Tick each thing of this file that what you ticked uses and this system lacks';
            tk.addEventListener('click', function(e) { e.preventDefault(); var want = {}; plan.lacks.forEach(function(id) { want[id] = 1; }); boxes.forEach(function(cb) { if (want[cb.dataset.id]) cb.checked = true; }); redraw(); if (typeof Event === 'function') body.dispatchEvent(new Event('change', { bubbles: true })); });   // drawn again here, and told as a change so the question asks again whether Merge is ready
            says.appendChild(tk);
            says.appendChild(el('div', 'sm-gaps-tail', 'Merge them as they are and the editor says each again under its row, until you pick one this system has.'));
        }
        says.appendChild(faults); checkSoon();
    };
    // Find by name: a row whose name and gray words hold every word typed stays, and a kind with no such row is put away with its heading
    find.addEventListener('input', function() { var q = find.value; heads.forEach(function(h) { var any = false; h.mine.forEach(function(cb) { var lb = cb.parentNode; lb.hidden = !!q && !findMatch(lb._find, q); if (!lb.hidden) any = true; }); h.sec.hidden = !any; }); });
    find.addEventListener('keydown', function(e) { if (e.key === 'Enter') e.preventDefault(); });
    body.addEventListener('change', function(e) { if (e.target !== find) redraw(); });
    redraw();
    host.confirm('Merge from “' + (host.name || src.name || 'this file') + '”', function(yes) {
        clearTimeout(checkT); if (yes !== true) { logMergeStep('cancelled', {}); return; }
        var p = mergePlan(src, host.draft(), ticked, host); if (!p.n || p.over.length) return;
        var got = host.apply(p) || {};
        logMergeStep('merged', { field: got.field || 0, list: got.list || 0, roll: got.roll || 0, item: got.item || 0, effect: got.effect || 0, budget: got.budget || 0, gaps: p.gaps.length, renamed: Object.keys(p.keyMap).length, initOff: !!p.initOff });
        var words = MERGE_KINDS.filter(function(m) { return got[m.k]; }).map(function(m) { return nOf(got[m.k], m.word); });
        var nGap = {}; p.gaps.forEach(function(g) { nGap[g.from.id] = 1; }); var gN = Object.keys(nGap).length;
        // a sheet laid out by hand shows only the fields placed on it, so new fields and lists wait on the Layout tab until they are placed
        var dr = host.draft(), laid = !!(dr && dr.sheet && Array.isArray(dr.sheet.sections) && dr.sheet.sections.length) && !!(got.field || got.list);
        host.toast('Merged ' + joinWords(words) + '. ' + (gN ? (gN === 1 ? 'One of them uses' : gN + ' of them use') + ' something this system lacks, said under its row. ' : '') + (laid ? 'Place the new fields on the sheet from the Layout tab. ' : '') + (p.initOff ? '“' + p.initOff + '” does not order a fight, since this system already has a roll that does. Change that on its row. ' : '') + 'Save keeps the merge, and Undo takes it back.');
    }, { body: body, yes: 'Merge', noEnter: true, ready: function() { return !!plan && plan.n > 0 && !plan.over.length; }, shown: function() { try { find.focus(); } catch (e) {} } });
}
// what the editor asks: the window, the change, and what it says under a row
function apply(draft, plan) { return mergeApply(draft, plan, _rec); }
function says(draft, clean) { return mergeSays(draft, clean, _rec); }

var API = { open: open, apply: apply, says: says, logStep: logMergeStep, mergeOffer: mergeOffer, mergePlan: mergePlan, mergeApply: mergeApply, mergeSays: mergeSays, MERGE_KINDS: MERGE_KINDS };
if (typeof window !== 'undefined') window.wpSysMerge = API;
export { open, apply, says, logMergeStep, mergeOffer, mergePlan, mergeApply, mergeSays, MERGE_KINDS };
