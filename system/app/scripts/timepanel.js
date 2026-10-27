// Backlog 173 (1.6.0; the owner, 2026-10-27, by prompt from the mock-up: "A Time rules panel (Recommended)", and of a rule's Notes, "Add
// Players never told"): every run of the time rules is kept here, for the GM's machine alone and in memory alone (the Session Log keeps every
// line), and chat gets ONE line a run with an Open button that brings up the Time rules panel: the newest run first, players then NPCs by the
// map they stand on, each folding open to what changed, a search, a filter and a Mute per rule. A rule set Panel only, or muted here, counts
// for nothing on the chat line; its lines stay in the panel. Mute is this computer's own, per campaign (wp_timeMute)
import { getActiveCampaign } from './models.js';

// [systemcheck:timepanel-start]
var TP_RUNS = 30, TP_SEEN = 6;
var _tp = { runs: Object.create(null), seq: 0, pick: '', filt: 'all', q: '', open: Object.create(null) };
function tpText(v, n) { return typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, n) : ''; }
function tpMuteAll() { try { var v = JSON.parse(localStorage.getItem('wp_timeMute') || '{}'); return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { return {}; } }
function tpMuted(campId, ruleId) { var all = tpMuteAll(), l = typeof campId === 'string' && Object.prototype.hasOwnProperty.call(all, campId) && Array.isArray(all[campId]) ? all[campId] : []; return typeof ruleId === 'string' && l.indexOf(ruleId) >= 0; }
function tpMuteSet(campId, ruleId, on) {
    if (typeof campId !== 'string' || !campId || typeof ruleId !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(ruleId)) return false;
    var all = tpMuteAll(), l = Object.prototype.hasOwnProperty.call(all, campId) && Array.isArray(all[campId]) ? all[campId].filter(function(x) { return typeof x === 'string' && x !== ruleId; }) : [];
    if (on) l.push(ruleId); l = l.slice(-200);
    var out = {}; Object.keys(all).forEach(function(k) { if (k !== campId && k !== '__proto__') out[k] = all[k]; }); if (l.length) out[campId] = l;
    try { localStorage.setItem('wp_timeMute', JSON.stringify(out)); } catch (e) { return false; }
    return true;
}
// One run from what runTimeRules hands over: { c, gm, lines: [{ r, head, body, notes, roll }] } a character. who: player id -> name; mapOf(c): the
// title of the map its token stands on, or ''. Players first, by name; then NPCs by map, the maps by name and no map last, each by name
function tpRun(id, words, chars, who, mapOf, campId) {
    var list = [];
    (Array.isArray(chars) ? chars : []).forEach(function(e) {
        var c = e && e.c; if (!c || typeof c !== 'object' || !Array.isArray(e.lines) || !e.lines.length) return;
        var npc = c.npc === true || !c.ownerId, owner = typeof c.ownerId === 'string' ? c.ownerId : '';
        var lines = e.lines.filter(function(l) { return l && typeof l.r === 'string'; }).slice(0, 40).map(function(l) { var nt = l.notes === 'panel' || l.notes === 'quiet' ? l.notes : ''; return { r: l.r, head: tpText(l.head, 160) || 'A rule', body: tpText(l.body, 600), notes: nt, roll: l.roll === true, chat: nt === '' && !tpMuted(campId, l.r) }; });
        if (!lines.length) return;
        list.push({ id: typeof c.id === 'string' ? c.id : '', name: tpText(c.name, 80) || 'A character', who: npc ? '' : (owner && who && Object.prototype.hasOwnProperty.call(who, owner) ? tpText(String(who[owner]), 40) : '') || (owner ? 'a player' : ''), npc: npc, map: npc ? tpText(typeof mapOf === 'function' ? mapOf(c) : '', 80) : '', gm: e.gm === true, lines: lines });
    });
    var by = function(a, b) { return a.name.localeCompare(b.name); };
    var pl = list.filter(function(x) { return !x.npc; }).sort(by), np = list.filter(function(x) { return x.npc; }).sort(function(a, b) { return a.map === b.map ? by(a, b) : !a.map ? 1 : !b.map ? -1 : a.map.localeCompare(b.map); });
    var all = pl.concat(np), changes = 0, rolls = 0, chat = 0;
    all.forEach(function(x) { x.lines.forEach(function(l) { changes++; if (l.roll) rolls++; if (l.chat) chat++; }); });
    return { id: id, words: tpText(words, 120), chars: all, changes: changes, rolls: rolls, chat: chat };
}
// The chat line's words: what ran and how much
function tpLine(run) {
    var n = run.chars.length;
    return { title: 'Time rules: ' + (run.words || 'a run'), sub: n + (n === 1 ? ' character, ' : ' characters, ') + run.changes + (run.changes === 1 ? ' change.' : ' changes.') + (run.rolls ? ' ' + run.rolls + (run.rolls === 1 ? ' roll.' : ' rolls.') : '') };
}
// What the panel shows of a run: its groups by the filter (all, pl, npc, roll) and the words searched (a character's name, a player's or a rule's)
function tpView(run, filt, q) {
    var qq = tpText(q, 80).toLowerCase(), groups = [], seen = Object.create(null);
    (run && Array.isArray(run.chars) ? run.chars : []).forEach(function(x) {
        if (filt === 'pl' && x.npc || filt === 'npc' && !x.npc) return;
        var lines = x.lines.filter(function(l) { return filt !== 'roll' || l.roll; });
        if (qq) { var hit = (x.name + ' ' + x.who).toLowerCase().indexOf(qq) >= 0; if (!hit) lines = lines.filter(function(l) { return l.head.toLowerCase().indexOf(qq) >= 0; }); }
        if (!lines.length) return;
        var g = x.npc ? 'NPCs' + (x.map ? ' · ' + x.map : ' · No map') : 'Players';
        if (!seen[g]) { seen[g] = { name: g, rows: [] }; groups.push(seen[g]); }
        seen[g].rows.push({ id: x.id, name: x.name, who: x.who, lines: lines });
    });
    return groups;
}
// [systemcheck:timepanel-end]

function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
var CLOCK = 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l-3 2.2';
function icon() { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('class', 'ico'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', CLOCK); s.appendChild(p); return s; }
function campNow() { var c = getActiveCampaign(); return c && typeof c.id === 'string' ? c : null; }
function namesOf(camp) {
    var out = Object.create(null), n = window.wpNet;
    if (camp && camp.players && typeof camp.players === 'object') Object.keys(camp.players).forEach(function(pid) { var p = camp.players[pid]; if (p && typeof p === 'object') out[pid] = p.name || pid; });
    if (n && n.roster && typeof n.roster === 'object') Object.keys(n.roster).forEach(function(k) { var p = n.roster[k]; if (p && p.id) out[p.id] = p.name || p.id; });
    return out;
}
function mapOfFn(camp) {
    return function(c) {
        var items = camp && camp.items && typeof camp.items === 'object' ? camp.items : {}, ids = Object.keys(items), act = camp.activeItemId;
        if (act && Object.prototype.hasOwnProperty.call(items, act)) ids = [act].concat(ids.filter(function(x) { return x !== act; }));
        for (var i = 0; i < ids.length; i++) { var m = items[ids[i]]; if (m && m.type === 'map' && Array.isArray(m.whiteboard) && m.whiteboard.some(function(w) { return w && w.isChar && w.charId === c.id && !w.waiting; })) return (m.meta && m.meta.title) || 'A map'; }
        return '';
    };
}
// A run from runTimeRules (sheets.js), on the machine that owns the campaign: kept, the panel drawn again if it is up, and the chat line posted
function add(camp, sys, words, chars) {
    if (!camp || typeof camp.id !== 'string') return null;
    var n = window.wpNet; if (n && (n.role === 'client' || n.stream)) return null;
    var run = tpRun('tr' + (++_tp.seq), words, chars, namesOf(camp), mapOfFn(camp), camp.id); if (!run.chars.length) return null;
    run.at = Date.now();
    var CC = window.wpCalendarCore; try { run.when = CC && typeof CC.fmtWhen === 'function' ? tpText(CC.fmtWhen(sys && sys.calendar ? sys.calendar : null, camp.clock && typeof camp.clock.t === 'number' ? camp.clock.t : 0), 60) : ''; } catch (e) { run.when = ''; }   // the game date it ran at, so two runs of one hour are told apart
    var list = _tp.runs[camp.id] || (_tp.runs[camp.id] = []); list.push(run); if (list.length > TP_RUNS) list.splice(0, list.length - TP_RUNS);
    if (shown()) { _tp.pick = run.id; draw(); }
    if (run.chat && n && typeof n.timeRunLine === 'function') { var w = tpLine(run); n.timeRunLine({ id: run.id, text: w.title, sub: w.sub }); }
    if (window.wpStepLog) window.wpStepLog('timepanel v1', 'run', { chars: run.chars.length, changes: run.changes, chat: run.chat });
    return run;
}
function muted(ruleId) { var c = campNow(); return !!c && tpMuted(c.id, ruleId); }
function panel() { return document.getElementById('timePanel'); }
function shown() { var p = panel(); return !!p && p.style.display !== 'none' && !(window.wpFloats && window.wpFloats.away(p)); }
function runsNow() { var c = campNow(); return c && _tp.runs[c.id] ? _tp.runs[c.id] : []; }
function open(id) {
    var p = panel(); if (!p) return;
    var list = runsNow(); _tp.pick = typeof id === 'string' && list.some(function(r) { return r.id === id; }) ? id : (list.length ? list[list.length - 1].id : '');
    p.style.display = 'flex'; if (window.wpFloats) window.wpFloats.reveal(p);
    draw();
}
function chipWords(r) { return (r.when ? r.when + ' · ' : '') + (r.words || 'A run'); }
function close() { var p = panel(); if (p) p.style.display = 'none'; }
function draw() {
    var body = document.getElementById('timeBody'); if (!body) return;
    var list = runsNow(), run = list.filter(function(r) { return r.id === _tp.pick; })[0] || list[list.length - 1] || null, camp = campNow();
    body.textContent = '';
    if (!run) { body.appendChild(el('div', 'tp-empty', 'No time rules have run yet this session. The Session Log keeps every line.')); return; }
    var runs = el('div', 'tp-runs');
    list.slice().reverse().slice(0, TP_SEEN).forEach(function(r) { var b = el('button', 'tp-chip' + (r.id === run.id ? ' on' : ''), chipWords(r)); b.type = 'button'; b.dataset.tprun = r.id; b.title = tpLine(r).sub; runs.appendChild(b); });
    if (list.length > TP_SEEN) { var s = el('select', 'field tp-older'); s.title = 'An earlier run of this session'; s.appendChild(el('option', '', 'Earlier…')); list.slice().reverse().slice(TP_SEEN).forEach(function(r) { var o = el('option', '', chipWords(r)); o.value = r.id; if (r.id === run.id) o.selected = true; s.appendChild(o); }); runs.appendChild(s); }
    body.appendChild(runs);
    var tools = el('div', 'tp-tools'), q = el('input', 'field tp-find'); q.type = 'search'; q.placeholder = 'Find a character or a rule'; q.value = _tp.q; q.setAttribute('aria-label', 'Find a character or a rule'); tools.appendChild(q);
    [['all', 'All'], ['pl', 'Players'], ['npc', 'NPCs'], ['roll', 'Rolls']].forEach(function(f) { var b = el('button', 'tp-chip' + (_tp.filt === f[0] ? ' on' : ''), f[1]); b.type = 'button'; b.dataset.tpfilt = f[0]; tools.appendChild(b); });
    body.appendChild(tools);
    var groups = tpView(run, _tp.filt, _tp.q), wrap = el('div', 'tp-list');
    if (!groups.length) wrap.appendChild(el('div', 'tp-empty', 'Nothing in this run matches.'));
    groups.forEach(function(g) {
        wrap.appendChild(el('div', 'tp-grp', g.name));
        g.rows.forEach(function(x) {
            var key = run.id + '|' + x.id, isOpen = _tp.open[key] === true, ch = el('div', 'tp-ch');
            var h = el('button', 'tp-ch-h'); h.type = 'button'; h.dataset.tpopen = key; h.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            h.appendChild(el('span', 'tp-arrow', isOpen ? '▾' : '▸')); var nm = el('span', 'tp-n', x.name); if (x.who) nm.appendChild(el('small', '', ' ' + x.who)); h.appendChild(nm);
            var rl = x.lines.filter(function(l) { return l.roll; }).length; h.appendChild(el('small', 'tp-count', x.lines.length + (x.lines.length === 1 ? ' change' : ' changes') + (rl ? ', ' + rl + (rl === 1 ? ' roll' : ' rolls') : '')));
            ch.appendChild(h);
            if (isOpen) {
                var chg = el('div', 'tp-chg');
                x.lines.forEach(function(l) {
                    var row = el('div', 'tp-line'); row.appendChild(el('span', 'tp-r', l.head)); row.appendChild(el('span', 'tp-v', l.body || 'No change'));
                    if (l.notes) row.appendChild(el('small', 'tp-tag', l.notes === 'quiet' ? 'Panel only, players not told' : 'Panel only'));
                    var mu = camp && tpMuted(camp.id, l.r), mb = el('button', 'tp-mute' + (mu ? ' on' : ''), mu ? 'Unmute' : 'Mute'); mb.type = 'button'; mb.dataset.tpmute = l.r; mb.title = mu ? 'Count this rule on the chat line again' : 'Leave this rule off the chat line. It keeps running and stays here and in the Session Log.'; row.appendChild(mb);
                    chg.appendChild(row);
                });
                ch.appendChild(chg);
            }
            wrap.appendChild(ch);
        });
    });
    body.appendChild(wrap);
    var foot = el('div', 'tp-foot'), all = camp ? tpMuteAll()[camp.id] : null, names = Object.create(null);
    list.forEach(function(r) { r.chars.forEach(function(x) { x.lines.forEach(function(l) { names[l.r] = l.head.replace(/ ×\d+.*$/, ''); }); }); });
    if (Array.isArray(all) && all.length) { foot.appendChild(document.createTextNode('Muted: ')); all.forEach(function(rid, i) { if (i) foot.appendChild(document.createTextNode(', ')); var u = el('button', 'tp-unmute', (names[rid] || 'a rule') + ' (unmute)'); u.type = 'button'; u.dataset.tpmute = rid; foot.appendChild(u); }); foot.appendChild(document.createTextNode('. ')); }
    foot.appendChild(document.createTextNode('The Session Log keeps every line.')); body.appendChild(foot);
}
// The chat line (net.js renderChat hands a run's record here): the clock, the run's words, how much, and Open
function renderLine(m) {
    var t = m && m.trun && typeof m.trun === 'object' ? m.trun : null, box = el('div', 'chat-trun');
    box.appendChild(icon());
    var g = el('div', 'chat-trun-txt'); g.appendChild(el('div', '', tpText(m && m.text, 300))); g.appendChild(el('small', '', tpText(t && t.sub, 200))); box.appendChild(g);
    var b = el('button', 'tool ghost chat-trun-open', 'Open'); b.type = 'button'; b.title = 'Open the Time rules panel on this run'; if (t && typeof t.id === 'string') b.dataset.tprunopen = t.id; box.appendChild(b);
    return box;
}
(function wire() {
    if (typeof document === 'undefined') return;
    var p = panel(); if (!p) return;
    var cl = document.getElementById('timeCloseBtn'); if (cl) cl.addEventListener('click', close);
    p.addEventListener('click', function(e) {
        var b = e.target && e.target.closest ? e.target.closest('button') : null; if (!b) return;
        if (b.dataset.tprun) { _tp.pick = b.dataset.tprun; draw(); return; }
        if (b.dataset.tpfilt) { _tp.filt = b.dataset.tpfilt; draw(); return; }
        if (b.dataset.tpopen) { _tp.open[b.dataset.tpopen] = _tp.open[b.dataset.tpopen] !== true; draw(); return; }
        if (b.dataset.tpmute) { var c = campNow(); if (c && tpMuteSet(c.id, b.dataset.tpmute, !tpMuted(c.id, b.dataset.tpmute))) { if (window.wpStepLog) window.wpStepLog('timepanel v1', 'mute', { on: tpMuted(c.id, b.dataset.tpmute) }); draw(); } }
    });
    p.addEventListener('change', function(e) { if (e.target && e.target.classList && e.target.classList.contains('tp-older') && e.target.value) { _tp.pick = e.target.value; draw(); } });
    p.addEventListener('input', function(e) { if (e.target && e.target.classList && e.target.classList.contains('tp-find')) { _tp.q = e.target.value; var pos = e.target.selectionStart; draw(); var f = p.querySelector('.tp-find'); if (f) { f.focus(); try { f.setSelectionRange(pos, pos); } catch (er) {} } } });
    document.addEventListener('click', function(e) { var b = e.target && e.target.closest ? e.target.closest('[data-tprunopen]') : null; if (b) open(b.dataset.tprunopen); });
    var head = document.getElementById('timeHead'), drag = null;
    if (head) {
        head.addEventListener('pointerdown', function(e) { if (e.target.closest('button')) return; var r = p.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top }; head.setPointerCapture(e.pointerId); });
        head.addEventListener('pointermove', function(e) { if (!drag) return; p.style.left = (e.clientX - drag.dx) + 'px'; p.style.top = (e.clientY - drag.dy) + 'px'; p.style.right = 'auto'; });
        head.addEventListener('pointerup', function() { drag = null; });
    }
})();
window.wpTimePanel = { add: add, open: open, close: close, muted: muted, renderLine: renderLine, draw: draw };
export { tpRun, tpLine, tpView, tpMuted, tpMuteSet };
