/* Dice (1.5.0) — the UI half: the roller popover beside Table Chat (#diceBtn / #dicePanel), the roll card that
   renderChat draws for a roll entry, the deny / timeout messages, the local Dice cue, and wpDiceSync for the VTT
   feature switch. The wire and the rolling itself live in net.js (net.diceRoll, the roll-req / roll / roll-deny
   handlers); the validators, replay and text in dicecore.js. Design of record: docs/DICE_PLAN.md. */
import { toast } from './io.js';
import { LIMITS, cleanExpr, composeModifier, withAdvantage, verdictOf, critOf, cardText, fmtNum } from './dicecore.js';

var ui = function(id) { return document.getElementById(id); };
var NL = String.fromCharCode(10);
function net() { return window.wpNet || null; }
function F() { return window.wpFormula || null; }
function featureOn() { return window.wpVtt ? !!window.wpVtt.on('dice') : true; }
function isClient() { var n = net(); return !!(n && n.active && n.role === 'client' && !n.stream); }
function pref(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
function setPref(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
function playerHue(id) { var h = 0, s = String(id); for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return ((h % 360) + 360) % 360; }
function chatTime(ts) { if (!ts) return ''; var d = new Date(ts); return (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(); }

/* ---------- the card (a chat entry with m.roll = the record and m.res = the replayed result) ---------- */
function renderCard(m) {
    var rec = m.roll, res = m.res, n = net(), Fm = F();
    var priv = !!(rec.priv || rec.to);
    var wrap = el('div', 'chat-roll' + (priv ? ' whisper' : ''));
    var mine = n && ((rec.from.gm && (!n.active || n.role === 'host')) || (n.myId && rec.from.id === n.myId));
    var who = el('b', null, mine ? 'You' : (rec.from.name || 'Player'));
    who.style.color = rec.from.gm ? 'var(--gold)' : 'hsl(' + playerHue(rec.from.id) + ', 55%, 68%)';
    wrap.appendChild(who);
    if (rec.from.gm) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(el('span', 'chat-gm', 'GM')); }
    var tag = rec.priv === 'gm' ? (rec.from.gm ? 'private' : 'to the GM') : rec.to ? (m.toName ? 'to ' + m.toName : 'private') : '';
    if (tag) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(el('span', 'chat-tag', tag)); }
    if (rec.as && rec.as !== rec.from.name) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(el('span', 'chat-tag', 'as ' + rec.as)); }   // the character the roll was made as (1.5.0)
    wrap.appendChild(el('span', 'chat-time', chatTime(rec.ts)));
    wrap.appendChild(el('br'));
    if (!res || !res.ok || !Fm) {
        wrap.appendChild(el('div', 'roll-bad', 'a roll that could not be read' + (m.rollBad === 'version' ? ' (a different dice engine)' : '')));
        return wrap;
    }
    var exprLine = el('div', 'roll-expr', rec.label ? rec.label + String.fromCharCode(32, 183, 32) + rec.expr : rec.expr); exprLine.title = rec.expr; wrap.appendChild(exprLine);
    var brk = el('div', 'roll-break');
    var parts = typeof Fm.parts === 'function' ? Fm.parts(res, 40) : [Fm.describe(res, { maxChars: LIMITS.cardChars })];
    parts.forEach(function(p) { if (typeof p === 'string') brk.appendChild(document.createTextNode(p)); else brk.appendChild(el('span', 'roll-die', p.text)); });
    wrap.appendChild(brk);
    var v = verdictOf(res), crit = critOf(res);
    var total = el('div', 'roll-total' + (v && v.kind === 'check' ? (v.pass ? ' roll-ok' : ' roll-fail') : ''), v ? (v.kind === 'check' ? v.text : '= ' + v.text) : '');
    if (crit) total.appendChild(el('span', 'roll-' + crit, crit === 'crit' ? 'natural 20' : 'natural 1'));
    wrap.appendChild(total);
    return wrap;
}
// Stage 6 HUD H7: an apply action's card (a chat entry with m.apply = the cleaned record) — who, the tags, the action, then each change
// "Fatigue \u22123 \u2192 0"; text only
function renderApply(m) {
    var rec = m.apply, n = net(), priv = rec.priv === 'gm';
    var wrap = el('div', 'chat-roll chat-apply' + (priv ? ' whisper' : ''));
    var mine = n && ((rec.from.gm && (!n.active || n.role === 'host')) || (n.myId && rec.from.id === n.myId));
    var who = el('b', null, mine ? 'You' : (rec.from.name || 'Player'));
    who.style.color = rec.from.gm ? 'var(--gold)' : 'hsl(' + playerHue(rec.from.id) + ', 55%, 68%)';
    wrap.appendChild(who);
    if (rec.from.gm) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(el('span', 'chat-gm', 'GM')); }
    if (priv) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(el('span', 'chat-tag', 'private')); }
    if (rec.as && rec.as !== rec.from.name) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(el('span', 'chat-tag', 'as ' + rec.as)); }
    wrap.appendChild(el('span', 'chat-time', chatTime(rec.ts)));
    wrap.appendChild(el('br'));
    wrap.appendChild(el('div', 'roll-expr', rec.label || 'Applied'));
    var ls = el('div', 'apply-lines');
    rec.lines.forEach(function(l) {
        var s = el('span', 'apply-line'); s.appendChild(el('span', 'apply-n', l.n + ' '));
        s.appendChild(el('span', 'apply-d ' + (l.d < 0 ? 'apply-sub' : 'apply-add'), (l.d < 0 ? '\u2212' : '+') + fmtNum(Math.abs(l.d))));
        s.appendChild(document.createTextNode(' \u2192 ')); s.appendChild(el('b', null, fmtNum(l.v)));
        ls.appendChild(s);
    });
    wrap.appendChild(ls);
    return wrap;
}
// one line for toasts, the unread badge and the log
function line(m) { return cardText(m.roll, m.res, F(), { toName: m.toName }); }

/* ---------- the sound: this machine's own Dice cue, nothing on the wire ---------- */
function soundOn() { return pref('wp_diceSound', 'on') !== 'off'; }
function landed(m) {
    if (!m || !m.roll || !m.res) return;
    if (!soundOn() || !window.wpSound || !window.wpVtt || !window.wpVtt.on('sound') || window.wpVtt.localOff('dice')) return;
    try { window.wpSound.local('dice'); } catch (e) {}
}

/* ---------- the roller ---------- */
var history = [], histAt = -1, lastSource = 'panel';
function panelOpen() { var p = ui('dicePanel'); return !!(p && p.style.display !== 'none'); }
function placePanel() {
    var p = ui('dicePanel'), c = ui('chatPanel'); if (!p) return;
    var r = c && c.style.display !== 'none' ? c.getBoundingClientRect() : null;
    if (r) { p.style.right = Math.max(8, window.innerWidth - r.right) + 'px'; p.style.bottom = Math.max(8, window.innerHeight - r.top + 8) + 'px'; }
    else { p.style.right = '20px'; p.style.bottom = '90px'; }
}
function showErr(message, expr, pos, len) {
    var e = ui('diceErr'); if (!e) return;
    e.textContent = '';
    e.appendChild(el('div', null, message));
    if (expr && len > 0) { var pre = el('pre', 'dice-caret'); pre.textContent = expr + NL + new Array(pos + 1).join(' ') + new Array(len + 1).join('^'); e.appendChild(pre); }
    e.style.display = '';
}
function clearErr() { var e = ui('diceErr'); if (e) { e.style.display = 'none'; e.textContent = ''; } }
function syncRoleLabels() {
    var t = ui('dicePrivText'), lbl = ui('dicePrivLbl');
    if (t) t.textContent = isClient() ? 'To the GM only' : 'Private';
    if (lbl) lbl.title = isClient() ? 'Only you and the GM see this roll' : 'Only you see this roll (it is still logged)';
    var s = ui('diceSoundChk'); if (s) s.checked = soundOn();
}
// The character picker (character sheets, 1.5.0): a player's own characters, any of the campaign's for the GM; hidden when there are none
function syncChars() {
    var s = ui('diceChar'); if (!s) return;
    var sh = window.wpSheets, list = sh && sh.charList ? sh.charList() : [], n = net(), me = n ? n.myId : null;
    if (isClient()) list = list.filter(function(c) { return c.ownerId && c.ownerId === me && !c.partial && !c.npc; });
    var was = s.value; s.textContent = '';
    var none = el('option', null, 'No character'); none.value = ''; s.appendChild(none);
    list.forEach(function(c) { var o = el('option', null, c.name + (c.npc ? ' (NPC)' : '')); o.value = c.id; s.appendChild(o); });
    s.value = list.some(function(c) { return c.id === was; }) ? was : '';
    s.style.display = list.length && (!window.wpVtt || window.wpVtt.on('sheets')) ? '' : 'none';
}
// A roll from a sheet button (sheets.js) or the combat roster: the picker follows, the card carries the label and the character
function rollFor(charId, expr, label, opts) {
    opts = opts || {};
    var s = ui('diceChar'); if (s && panelOpen()) { syncChars(); if (Array.prototype.some.call(s.options, function(o) { return o.value === charId; })) s.value = charId; }
    var r = roll(expr, { priv: !!opts.priv, gmOnly: !!opts.gmOnly, charId: charId, label: label, source: opts.source || 'sheet', row: opts.row || undefined, act: opts.act || undefined, mod: opts.mod || undefined, adv: opts.adv || undefined });   // row (F5b): a roll on a list's row; act/mod/adv (R1): a roll with consequences   // gmOnly: a roll made of GM-only data (net.diceRoll keeps it the host's)
    if (r.error) toast(r.error);
    return r;
}
/* ---------- Stage 5a: the situational-modifier popover (shift/alt-click a sheet roll button) ---------- */
var modPop = null;
function closeModPop() { if (!modPop) return; modPop.remove(); modPop = null; document.removeEventListener('pointerdown', onModOutside, true); document.removeEventListener('keydown', onModKey, true); }
function onModOutside(e) { if (modPop && !modPop.contains(e.target)) closeModPop(); }
function onModKey(e) { if (e.key === 'Escape' && modPop) { e.preventDefault(); e.stopPropagation(); closeModPop(); } }
function clampMod(v) { return v > 99 ? 99 : v < -99 ? -99 : v; }
// Open a small popover by the roll button; a positive modifier always helps (composeModifier places it correctly),
// and on Roll we send the composed formula down the normal wire path. Falls back to a plain roll if the engine is absent.
function rollWithMod(charId, expr, label, opts, anchor) {
    var Fm = F(); closeModPop();
    if (!Fm || !Fm.parse) return rollFor(charId, expr, label, opts);
    var mod = 0, advMode = 'normal', numEl, prevEl, advBtns = {};
    var canAdv = withAdvantage(expr, 'adv', Fm.parse).ok;   // a lone plain die can roll twice keep best/worst
    var pop = el('div', 'dice-modpop'); modPop = pop;
    pop.appendChild(el('div', 'dice-modpop-title', label ? 'Roll ' + label : 'Roll with a modifier'));
    function applied() {   // advantage first (rewrites the die), then the flat modifier
        var base = expr;
        if (advMode !== 'normal') { var a = withAdvantage(expr, advMode, Fm.parse); if (a.ok) base = a.expr; }
        return composeModifier(base, mod, Fm.parse);
    }
    function refresh() { numEl.textContent = (mod > 0 ? '+' : '') + mod; var r = applied(); prevEl.textContent = r.ok ? r.expr : expr; if (canAdv) ['dis', 'normal', 'adv'].forEach(function(m) { advBtns[m].classList.toggle('on', advMode === m); }); }
    if (canAdv) {
        var advRow = el('div', 'dice-modadv');
        [['dis', 'Disadvantage', 'Dis'], ['normal', 'Normal', 'Normal'], ['adv', 'Advantage', 'Adv']].forEach(function(m) { var b = el('button', 'tool ghost dice-advbtn', m[2]); b.title = m[1] + ' (roll twice, keep the ' + (m[0] === 'dis' ? 'worse' : m[0] === 'adv' ? 'better' : 'roll as written') + ')'; b.addEventListener('click', function() { advMode = m[0]; refresh(); }); advBtns[m[0]] = b; advRow.appendChild(b); });
        pop.appendChild(advRow);
    }
    var chips = el('div', 'dice-modpop-chips');
    [['−5', -5], ['−1', -1], ['+1', 1], ['+5', 5]].forEach(function(q) { var b = el('button', 'tool ghost dice-modchip', q[0]); b.addEventListener('click', function() { mod = clampMod(mod + q[1]); refresh(); }); chips.appendChild(b); });
    pop.appendChild(chips);
    var numRow = el('div', 'dice-modpop-num');
    var minus = el('button', 'tool ghost dice-modpm', '−'); minus.title = 'One less'; minus.addEventListener('click', function() { mod = clampMod(mod - 1); refresh(); });
    numEl = el('span', 'dice-modpop-val', '0');
    var plus = el('button', 'tool ghost dice-modpm', '+'); plus.title = 'One more'; plus.addEventListener('click', function() { mod = clampMod(mod + 1); refresh(); });
    numRow.appendChild(minus); numRow.appendChild(numEl); numRow.appendChild(plus); pop.appendChild(numRow);
    prevEl = el('div', 'dice-modpop-prev', expr); pop.appendChild(prevEl);
    var go = el('button', 'tool dice-modpop-go', 'Roll'); go.addEventListener('click', function() { var r = applied(); if (!r.ok) { toast('That roll cannot take that change.'); return; } closeModPop(); rollFor(charId, r.expr, label, opts && opts.act ? Object.assign({}, opts, { mod: mod || undefined, adv: advMode !== 'normal' ? advMode : undefined }) : opts); });   // R1: a roll with consequences sends its modifier and advantage as data
    pop.appendChild(go);
    document.body.appendChild(pop);
    var rct = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 120, top: 120, bottom: 140 };
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = Math.max(8, Math.min(window.innerWidth - pw - 8, rct.left));
    var top = rct.bottom + 6; if (top + ph > window.innerHeight - 8) top = Math.max(8, rct.top - ph - 6);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    refresh();
    setTimeout(function() { document.addEventListener('pointerdown', onModOutside, true); document.addEventListener('keydown', onModKey, true); go.focus(); }, 0);
}
function openPanel() {
    var p = ui('dicePanel'); if (!p || !featureOn()) return;
    var c = ui('chatPanel'); if (c && c.style.display === 'none') { var cb = ui('chatBtn'); if (cb) cb.click(); }
    p.style.display = 'flex'; placePanel(); syncRoleLabels(); syncChars(); clearErr();
    var f = ui('diceExpr'); if (f) { f.focus(); f.select(); }
}
function closePanel() { var p = ui('dicePanel'); if (p) p.style.display = 'none'; }
function remember(expr) { var i = history.indexOf(expr); if (i >= 0) history.splice(i, 1); history.unshift(expr); if (history.length > LIMITS.history) history.length = LIMITS.history; histAt = -1; }
// roll(expr, { priv }) — the one entry point for the roller, the chat commands and the console's /table
function roll(expr, opts) {
    opts = opts || {};
    var n = net(); if (!n || !n.diceRoll) return { error: 'Dice are not available.' };
    lastSource = opts.source || 'panel';
    var clean = cleanExpr(expr);
    if (!clean) return { error: 'Type a formula, for example 2d6 + 3 (up to ' + LIMITS.expr + ' characters).' };
    var r = n.diceRoll(clean, { priv: !!opts.priv, gmOnly: !!opts.gmOnly, charId: opts.charId || undefined, label: opts.label || undefined, row: opts.row || undefined, act: opts.act || undefined, mod: opts.mod || undefined, adv: opts.adv || undefined });
    if (!r.error && !opts.row) remember(clean);   // Stage 6 F5b: a row roll is not remembered (its Row.* names need its row)
    return r;
}
function rollFromPanel() {
    var f = ui('diceExpr'); if (!f) return;
    var expr = f.value, priv = !!(ui('dicePriv') && ui('dicePriv').checked), charId = ui('diceChar') && ui('diceChar').value || undefined;
    clearErr();
    var r = roll(expr, { priv: priv, source: 'panel', charId: charId });
    if (r.error) { showErr(r.error, cleanExpr(expr) || '', r.pos || 0, r.len || 0); return; }
    f.select();
}
// the host refused (or never answered) a request this client sent
function onDeny(d, expr) {
    var D = window.wpDiceCore, msg = D ? D.denyText(d.reason, d.message) : (d.message || 'The GM refused that roll.');
    if (panelOpen() && lastSource === 'panel') showErr(msg, expr || '', d.pos || 0, d.len || 0);
    else toast(msg);
}
function onRolled() { clearErr(); }
// the VTT switch moved (vtt.js fan-out), or a session started / ended
function sync() {
    var on = featureOn(), b = ui('diceBtn');
    if (b) b.style.display = on ? '' : 'none';
    if (!on) closePanel(); else if (panelOpen()) syncChars();
    var n = net(); if (n && n.syncSessionButtons) n.syncSessionButtons();
}
(function wire() {
    var b = ui('diceBtn'), p = ui('dicePanel'); if (!b || !p) return;
    b.addEventListener('click', function() { if (panelOpen()) closePanel(); else openPanel(); });
    var cl = ui('diceCloseBtn'); if (cl) cl.addEventListener('click', closePanel);
    var hb = ui('diceHelpBtn'); if (hb) hb.addEventListener('click', function() { if (window.wpOpenHelp) window.wpOpenHelp('dice'); });
    var rb = ui('diceRollBtn'); if (rb) rb.addEventListener('click', rollFromPanel);
    var f = ui('diceExpr');
    if (f) f.addEventListener('keydown', function(e) {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); rollFromPanel(); }
        else if (e.key === 'Escape') { closePanel(); }
        else if (e.key === 'ArrowUp' && history.length) { e.preventDefault(); histAt = Math.min(history.length - 1, histAt + 1); f.value = history[histAt]; }
        else if (e.key === 'ArrowDown') { e.preventDefault(); histAt = Math.max(-1, histAt - 1); f.value = histAt < 0 ? '' : history[histAt]; }
    });
    p.addEventListener('click', function(e) {
        var q = e.target.closest && e.target.closest('button[data-die], button[data-op]'); if (!q || !f) return;
        var cur = f.value.trim();
        if (q.dataset.die) f.value = cur ? cur + ' + ' + q.dataset.die : q.dataset.die;
        else if (q.dataset.op) f.value = cur ? cur + ' ' + q.dataset.op + ' ' : '';
        f.focus();
    });
    var sc = ui('diceSoundChk'); if (sc) sc.addEventListener('change', function() { setPref('wp_diceSound', sc.checked ? 'on' : 'off'); });
    // the chat panel closing takes the roller with it
    var cc = ui('chatCloseBtn'); if (cc) cc.addEventListener('click', closePanel);
    var cb = ui('chatBtn'); if (cb) cb.addEventListener('click', function() { setTimeout(function() { var c = ui('chatPanel'); if (c && c.style.display === 'none') closePanel(); else if (panelOpen()) placePanel(); }, 0); });
    window.addEventListener('resize', function() { if (panelOpen()) placePanel(); });
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && panelOpen()) closePanel(); }, true);
})();
window.wpDiceSync = sync;
setTimeout(sync, 0);
window.wpDice = { roll: roll, rollFor: rollFor, rollWithMod: rollWithMod, syncChars: syncChars, renderCard: renderCard, renderApply: renderApply, line: line, landed: landed, onDeny: onDeny, onRolled: onRolled, openPanel: openPanel, closePanel: closePanel, sync: sync, LIMITS: LIMITS, history: function() { return history.slice(); } };
