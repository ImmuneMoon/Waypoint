/* Dice (1.5.0) — the UI half: the roller popover beside Table Chat (#diceBtn / #dicePanel), the roll card that
   renderChat draws for a roll entry, the deny / timeout messages, the local Dice cue, and wpDiceSync for the VTT
   feature switch. The wire and the rolling itself live in net.js (net.diceRoll, the roll-req / roll / roll-deny
   handlers); the validators, replay and text in dicecore.js. Design of record: docs/DICE_PLAN.md. */
import { toast } from './io.js';
import { LIMITS, cleanExpr, composeModifier, withAdvantage, verdictOf, critOf, cardText, fmtNum, malfOf, ruleOf, resistWhy } from './dicecore.js';
import { dieNode } from './dieicons.js';   // 1.5.8, backlog 149: the dice drawings (pure)

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

// 1.5.8, backlog 149: a card's die, the one its formula rolls (systemcore dieOf: 3d6 three dice, d20 a d20), drawn first on its dice line with
// createElementNS. Asked through typeof by renderCard, so a harness that slices the card alone draws it as before
function dieInto(host, rec) {
    var core = window.wpSystemCore; if (!host || !rec || typeof rec.expr !== 'string' || !core || typeof core.dieOf !== 'function') return;
    host.insertBefore(dieNode(document, core.dieOf(rec.expr), 'roll-die-ico'), host.firstChild);
}
/* ---------- the card (a chat entry with m.roll = the record and m.res = the replayed result) ---------- */
// 1.5.7: a roll worked out from a sheet, said in plain figures: each dice group with its dice, then what a check came to and what it needed.
// The formula and its whole working stay on the line's hover. Text nodes only.
function readableInto(brk, res, parts, expr) {
    var groups = parts.filter(function(p) { return p && typeof p === 'object' && p.die; }), b = res.breakdown || {}, top = null;
    (Array.isArray(b.checks) ? b.checks : []).forEach(function(c) { if (c && c.top) top = c; });
    groups.forEach(function(p, i) {
        if (i) brk.appendChild(document.createTextNode(' + '));
        var d = p.die, head = d && typeof d.count === 'number' && d.faces !== undefined ? d.count + 'd' + d.faces + ' ' : '';
        brk.appendChild(document.createTextNode(head + '['));
        brk.appendChild(el('span', 'roll-die', p.text));
        brk.appendChild(document.createTextNode(']'));
    });
    if (top && typeof top.left === 'number' && typeof top.right === 'number' && isFinite(top.left) && isFinite(top.right)) {
        var w = top.op === '<=' ? ' or less' : top.op === '>=' ? ' or more' : top.op === '<' ? ', under it' : top.op === '>' ? ', over it' : '';
        brk.appendChild(document.createTextNode((groups.length ? ' = ' : '') + fmtNum(top.left) + ' \u00b7 needs ' + fmtNum(top.right) + w));
    }
    var full = parts.map(function(p) { return typeof p === 'string' ? p : p.text; }).join('');
    brk.title = String(expr || '') + (full ? '\n' + full : '');
}
// 1.5.8 (handoff 90 Part B): what changed the values the roll read, under its dice: each value's name and its figure, before and after where
// effects on it changed it, then each change by its source, and each effect on a value it is worked out from by what it changed, as text
// nodes; nothing where the host named none
function modsInto(wrap, mods) {
    if (!Array.isArray(mods) || !mods.length) return;
    var box = el('div', 'chat-mods'), any = false;
    mods.forEach(function(e) {
        if (!e || typeof e !== 'object') return;
        var row = el('div', 'chat-mod'), mm = Array.isArray(e.m) ? e.m : [], ww = Array.isArray(e.w) ? e.w : [];
        row.appendChild(el('span', 'chat-mod-n', String(e.n).replace(/^Row\./i, '')));
        row.appendChild(document.createTextNode(' ' + (mm.length ? fmtNum(e.b) + ' \u2192 ' : '') + fmtNum(e.a)));
        box.appendChild(row); any = true;
        var sg = function(v) { return (v > 0 ? '+' : '\u2212') + fmtNum(Math.abs(v)); };
        mm.forEach(function(x) { if (x && typeof x === 'object') box.appendChild(el('div', 'chat-mod-src', sg(x.v) + ' ' + x.s)); });
        ww.forEach(function(x) { if (x && typeof x === 'object') box.appendChild(el('div', 'chat-mod-src', sg(x.v) + ' ' + x.s + ' on ' + String(x.t).replace(/^Row\./i, ''))); });
    });
    if (any) wrap.appendChild(box);
}
// 1.6.0 roll switches: the bonuses ticked in the roll's ± window, by name, as text nodes; nothing where it had none
function swInto(wrap, sw) {
    if (!Array.isArray(sw) || !sw.length) return; var box = el('div', 'chat-mods chat-sw');
    sw.forEach(function(x) { if (x && typeof x === 'object' && typeof x.v === 'number') box.appendChild(el('div', 'chat-mod-src', (x.v > 0 ? '+' : '−') + Math.abs(x.v) + ' ' + x.n + ', added')); });
    if (box.firstChild) wrap.appendChild(box);
}
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
    if (rec.dmg === 1) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(el('span', 'chat-dmg', 'damage')); }   // chat cards (owner 2026-09-27): a damage roll's tag
    if (rec.as && rec.as !== rec.from.name) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(el('span', 'chat-tag', 'as ' + rec.as)); }   // the character the roll was made as (1.5.0)
    wrap.appendChild(el('span', 'chat-time', chatTime(rec.ts)));
    wrap.appendChild(el('br'));
    if (rec.label) wrap.appendChild(el('div', 'roll-title', rec.label));   // chat cards: the roll's name as the card's title (his reference cards); the formula on its own line
    if (!res || !res.ok || !Fm) {
        wrap.appendChild(el('div', 'roll-bad', 'a roll that could not be read' + (m.rollBad === 'version' ? ' (a different dice engine)' : '')));
        if (rec.dmg === 1) wrap.className += ' card-dmg';   // a damage roll needs no dice to be one
        return wrap;
    }
    var named = false; try { named = typeof Fm.names === 'function' && Fm.names(rec.expr).length > 0; } catch (e) { named = false; }   // 1.5.7 (the owner: the formula "is showing as the roll information instead of being readable by everyone")
    var exprLine = el('div', 'roll-expr', rec.expr); exprLine.title = rec.expr; if (!named) wrap.appendChild(exprLine);
    var brk = el('div', 'roll-break');
    var sy = window.wpSheets && window.wpSheets.systemOf ? window.wpSheets.systemOf() : null, rule = typeof ruleOf === 'function' ? ruleOf(rec, sy && sy.combat ? sy.combat.checks : '') : sy && sy.combat && sy.combat.checks === 'under3d6' ? 'under3d6' : '';   // Stage 6 F8: the campaign's roll outcomes (1.6.0: or the critical range the host put on the record, asked through typeof for a suite that slices the card)
    var v = verdictOf(res, rule), crit = critOf(res, rule), mf = malfOf(rec, res);   // R3: a malfunction is a failure, whatever the test said
    var parts = typeof Fm.parts === 'function' ? Fm.parts(res, 40) : [Fm.describe(res, { maxChars: LIMITS.cardChars })];
    if (v && v.crit !== undefined && parts.length && typeof parts[parts.length - 1] === 'string') parts[parts.length - 1] = parts[parts.length - 1].replace(/:\s*(success|failure)( by [^:]*)?$/, '');   // F8: the rule's verdict is the line below (never the arithmetic's)
    if (named) readableInto(brk, res, parts, rec.expr);
    else parts.forEach(function(p) { if (typeof p === 'string') brk.appendChild(document.createTextNode(p)); else brk.appendChild(el('span', 'roll-die', p.text)); });
    if (typeof dieInto === 'function') dieInto(brk, rec);   // 1.5.8: the die its formula rolls, first on the dice line
    wrap.appendChild(brk);
    if (typeof modsInto === 'function') modsInto(wrap, rec.mods);
    if (typeof swInto === 'function') swInto(wrap, rec.sw);   // 1.6.0: the roll switches it was rolled with   // 1.5.8: what changed the values it read (asked through typeof for a suite that slices the card alone)
    wrap.className += mf ? ' card-malf' : v && v.kind === 'check' ? (v.pass ? ' card-ok' : ' card-fail') : rec.dmg === 1 ? ' card-dmg' : '';   // chat cards: the left stripe — a malfunction, the check's outcome, else a damage roll, else plain
    var total = el('div', 'roll-total' + (mf ? ' roll-fail roll-malf' : v && v.kind === 'check' ? (v.pass ? ' roll-ok' : ' roll-fail') : rec.dmg === 1 ? ' roll-dmg' : ''), mf ? 'malfunction (Malf ' + rec.malf + ')' : v ? (v.kind === 'check' ? v.text : '= ' + v.text) : '');
    if (crit) total.appendChild(el('span', 'roll-' + crit, v && v.crit ? (crit === 'crit' ? 'critical success' : 'critical failure') : crit === 'crit' ? 'natural 20' : 'natural 1'));
    var tierC = sy && sy.combat && sy.combat.tier && typeof sy.combat.tier === 'object' ? sy.combat.tier : null;   // 1.6.0: a success at or past the Combat card's margin wears its name
    if (!mf && tierC && typeof tierC.name === 'string' && tierC.name && typeof tierC.at === 'number' && v && v.kind === 'check' && v.pass === true && typeof v.margin === 'number' && v.margin >= tierC.at) total.appendChild(el('span', 'roll-tier', tierC.name));
    wrap.appendChild(total);
    var dS = window.wpSheets, dv = res && typeof res.value === 'number' && isFinite(res.value) ? res.value : null;   // 1.5.6, the damage step: the GM takes a damage roll off its target in one press
    if (rec.dmg === 1 && dv !== null && !mf && rec.dmgUsed === 1) wrap.appendChild(el('div', 'chat-dmgdone', 'Applied'));   // 1.5.7: a hit is applied once
    else if (rec.dmg === 1 && dv !== null && !mf && typeof rec.blast === 'string' && typeof window.wpBlastApply === 'function' && dS && typeof dS.damageOn === 'function' && dS.damageOn()) {   // 1.5.8 explosives: a blast's damage, to everyone in it, once
        var bb = el('button', 'tool ghost chat-dmgapply', 'Apply to all in the blast'); bb.type = 'button'; bb.title = 'Take this damage off every character in the blast, each by its distance and through its DR, as the Combat card says. Once applied, the button goes.';
        bb.addEventListener('click', function() { if (rec.dmgUsed === 1) return; if (window.wpBlastApply(rec.blast, dv)) { rec.dmgUsed = 1; if (bb.parentNode) bb.parentNode.replaceChild(el('div', 'chat-dmgdone', 'Applied'), bb); } });
        wrap.appendChild(bb);
    }
    else if (rec.dmg === 1 && dv !== null && !mf && dS && typeof dS.damageOn === 'function' && typeof dS.damageFromRoll === 'function' && dS.damageOn()) {
        var ab = el('button', 'tool ghost chat-dmgapply', 'Apply to target\u2026'); ab.type = 'button'; ab.title = 'Take this damage off the character its roller targets, through its DR. Its window opens first. Once applied, the button goes.';
        var dN = 0; (res.breakdown && Array.isArray(res.breakdown.dice) ? res.breakdown.dice : []).forEach(function(g) { if (g && typeof g.count === 'number' && isFinite(g.count)) dN += g.count; });   // 1.6.0: the dice it rolled, and the armour divisor the host put on the record
        ab.addEventListener('click', function() { if (rec.dmgUsed === 1) return; dS.damageFromRoll(rec.from && rec.from.id, dv, function() { rec.dmgUsed = 1; if (ab.parentNode) ab.parentNode.replaceChild(el('div', 'chat-dmgdone', 'Applied'), ab); }, typeof rec.dtype === 'string' ? rec.dtype : undefined, { dice: dN, ad: typeof rec.ad === 'number' ? rec.ad : 0 }); });
        wrap.appendChild(ab);
    }
    return wrap;
}
// Stage 6 HUD H7: an apply action's card (a chat entry with m.apply = the cleaned record) — who, the tags, the action, then each change
// "Fatigue \u22123 \u2192 0"; text only
// Turn-based combat T2b: a reminder card — what is due, for whom and when, and Run (the sheet's own press: the GM's, or the player's through
// the host); once pressed here it says so. The GM's copy of a player's reminder has no button (theirs to press); nor has a pop-out window
function renderDue(m) {
    var rec = m.due, wrap = el('div', 'chat-roll chat-due whisper');
    var who = el('b', null, 'Due'); who.style.color = 'var(--gold)'; wrap.appendChild(who);
    if (rec.as) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(el('span', 'chat-tag', 'for ' + rec.as)); }
    wrap.appendChild(el('span', 'chat-time', chatTime(rec.ts)));
    wrap.appendChild(el('br'));
    wrap.appendChild(el('div', 'roll-expr', (rec.label || (rec.roll === 1 ? 'A roll' : 'An action')) + ' \u2014 ' + (rec.why === 'turn' ? 'the start of its turn' : rec.why === 'turnEnd' ? 'the end of its turn' : rec.why === 'cross' ? 'a value crossed a step' : rec.why === 'resist' ? (typeof resistWhy === 'function' ? resistWhy(rec) : 'resisting an attempt') : rec.why === 'major' ? 'a Major Wound' : rec.why === 'wound' ? 'a wound' : 'round ' + rec.round)));   // 1.6.0 (B2): an attempt to resist   // 1.6.0 (the core's gap 6): or a wound
    if (rec.theirs) wrap.appendChild(el('div', 'chat-due-note', 'Its player presses it.'));
    else if (m.done) wrap.appendChild(el('div', 'chat-due-note', 'Pressed.'));
    else if (!window.wpPopout) {
        if (rec.why === 'resist' && Array.isArray(rec.or) && rec.or.length) {   // 1.6.0 (the core's gap 5; the owner: "A button each"): a button for each roll it may be resisted with; one press uses the card up
            var picks = [{ act: rec.act, label: rec.label || 'Roll' }].concat(rec.or), bs = [];
            picks.forEach(function(p) {
                var pb = el('button', 'tool chat-due-run', p.label || 'Roll'); pb.type = 'button'; pb.title = 'Resist with ' + (p.label || 'this roll') + ', as its button on the sheet rolls it'; bs.push(pb);
                pb.addEventListener('click', function() { if (m.done) return; m.done = true; bs.forEach(function(x) { x.disabled = true; }); var ok = window.wpSheets && window.wpSheets.runDue ? window.wpSheets.runDue(rec.charId, p.act, rec.att) : false; if (!ok) { m.done = false; bs.forEach(function(x) { x.disabled = false; }); } });   // done first: the press's own card redraws the chat
                wrap.appendChild(pb); wrap.appendChild(document.createTextNode(' '));
            });
            return wrap;
        }
        var runW = rec.roll === 1 ? 'Roll' : 'Run', b = el('button', 'tool chat-due-run', runW); b.type = 'button'; b.title = rec.roll === 1 ? 'Roll it now, as its button on the sheet does' : 'Apply it now, as its button on the sheet does';   // 1.5.9: a roll that is due
        b.addEventListener('click', function() { if (m.done) return; m.done = true; b.disabled = true; b.textContent = 'Pressed'; var ok = window.wpSheets && window.wpSheets.runDue ? window.wpSheets.runDue(rec.charId, rec.act, typeof rec.att === 'string' ? rec.att : undefined) : false; if (!ok) { m.done = false; b.disabled = false; b.textContent = runW; } });   // 1.6.0 (the core's gaps 6 and 7): a blow's card names its record too   // done first: the press's own card redraws the chat
        wrap.appendChild(b);
    }
    return wrap;
}
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
    if (rec.on) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(el('span', 'chat-tag', 'on ' + rec.on)); }   // 1.5.9 (book es/et plan, section 3): the character it was used on, as text
    wrap.appendChild(el('span', 'chat-time', chatTime(rec.ts)));
    wrap.appendChild(el('br'));
    wrap.appendChild(el('div', 'roll-expr', rec.label || 'Applied'));
    var ls = el('div', 'apply-lines');
    rec.lines.forEach(function(l) {
        var s = el('span', 'apply-line'); s.appendChild(el('span', 'apply-n', l.n + ' '));
        if (l.fx === 1 || l.fx === 0) s.appendChild(el('span', 'apply-d ' + (l.fx ? 'apply-add' : 'apply-sub'), l.fx ? 'on' : 'off'));   // 1.6.0: an effect switched on or off
        else if (l.s === 1) s.appendChild(el('span', 'apply-d apply-add', 'set'));   // 1.5.9: a value set on another character, with no figure
        else s.appendChild(el('span', 'apply-d ' + (l.d < 0 ? 'apply-sub' : 'apply-add'), (l.d < 0 ? '\u2212' : '+') + fmtNum(Math.abs(l.d))));
        if (typeof l.v === 'number') { s.appendChild(document.createTextNode(' \u2192 ')); s.appendChild(el('b', null, fmtNum(l.v))); }   // 1.5.9: none where the line has no figure
        if (typeof l.roll === 'string' && l.roll) s.appendChild(el('span', 'apply-roll', ' ' + l.roll));   // 1.5.9: the dice a Rolled amount drew, as text
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
// [floatcheck:dice-start]
// 1.5.4 (floats.js): a box put away on a view it was not asked for on is up but not shown. The roller's button, the Esc key and its
// place against Table Chat go by what is shown; what keeps it in step with the table (panelOpen) goes by what is up
function awayNow(el) { return !!(el && window.wpFloats && window.wpFloats.away(el)); }
function panelShown() { return panelOpen() && !awayNow(ui('dicePanel')); }
function placePanel() {
    var p = ui('dicePanel'), c = ui('chatPanel'); if (!p) return;
    var r = c && c.style.display !== 'none' && !awayNow(c) ? c.getBoundingClientRect() : null;
    if (r) { p.style.right = Math.max(8, window.innerWidth - r.right) + 'px'; p.style.bottom = Math.max(8, window.innerHeight - r.top + 8) + 'px'; }
    else { p.style.right = '20px'; p.style.bottom = '90px'; }
}
// [floatcheck:dice-end]
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
    if (isClient()) list = list.filter(function(c) { return c.ownerId && c.ownerId === me && !c.partial && !c.npc && c.making !== 1; });   // Onboarding F3: not one still in the making
    var was = s.value; s.textContent = '';
    var none = el('option', null, 'No character'); none.value = ''; s.appendChild(none);
    list.forEach(function(c) { var o = el('option', null, c.name + (c.npc ? ' (NPC)' : '')); o.value = c.id; s.appendChild(o); });
    s.value = list.some(function(c) { return c.id === was; }) ? was : '';
    s.style.display = list.length && (!window.wpVtt || window.wpVtt.on('sheets')) ? '' : 'none';
}
// A roll from a sheet button (sheets.js) or the combat roster: the picker follows, the card carries the label and the character
var _rollMore = null;   // 1.5.8 explosives: what rollFor hands the next roll beside its own words, taken once
function rollFor(charId, expr, label, opts) {
    opts = opts || {};
    var s = ui('diceChar'); if (s && panelOpen()) { syncChars(); if (Array.prototype.some.call(s.options, function(o) { return o.value === charId; })) s.value = charId; }
    _rollMore = opts.range || opts.blast || opts.used === true || opts.cross ? { range: opts.range || undefined, blast: opts.blast || undefined, used: opts.used === true ? true : undefined, cross: opts.cross && typeof opts.cross === 'object' ? opts.cross : undefined } : null;   // 1.5.8 explosives: a throw's range to its aim, the blast a damage roll is for (this machine's own words); 1.5.9: a damage roll already applied as it is rolled (a blast's fragmentation)
    var r = roll(expr, { on: typeof opts.on === 'string' && opts.on ? opts.on : undefined, priv: !!opts.priv, gmOnly: !!opts.gmOnly, charId: charId, label: label, source: opts.source || 'sheet', fr: opts.fr || undefined, sw: opts.sw || undefined, row: opts.row || undefined, act: opts.act || undefined, mod: opts.mod || undefined, adv: opts.adv || undefined, dmg: opts.dmg === true ? true : undefined });   // row (F5b): a roll on a list's row; act/mod/adv (R1): a roll with consequences   // gmOnly: a roll made of GM-only data (net.diceRoll keeps it the host's)   // 1.5.9: on, the token of the adjacent character it is used on
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
// What the ± window's Roll sends: a named roll (a system roll, a list's roll by its index, and since 1.6.0 a field's own roll) its modifier,
// advantage and roll switches as data, which the host rebuilds the formula from; a roll that is not named and has a switch ticked is named by
// the roll's swRef first (act, row with its index, fr); any other its formula alone, as before
function modOpts(opts, mod, advMode, pk, rf) {   // rf: the roll's swRef
    var o = opts, named = !!(opts && (opts.act || opts.fr || (opts.row && typeof opts.row.i === 'number')));
    if (pk && pk.length && !named && rf && typeof rf === 'object') { o = Object.assign({}, opts || {}); if (typeof rf.r === 'string') o.act = rf.r; else if (typeof rf.f === 'string') o.fr = rf.f; else if (typeof rf.l === 'string' && typeof rf.row === 'string' && typeof rf.i === 'number') o.row = { f: rf.l, r: rf.row, i: rf.i }; named = !!(o.act || o.fr || o.row); }
    return named ? Object.assign({}, o, { mod: mod || undefined, adv: advMode !== 'normal' ? advMode : undefined, sw: pk && pk.length ? pk : undefined }) : opts;
}
function rollWithMod(charId, expr, label, opts, anchor, swRef) {   // swRef (1.6.0): which roll this is ({ f } | { r } | { l, row, i }), for its roll switches
    var Fm = F(); closeModPop();
    if (!Fm || !Fm.parse) return rollFor(charId, expr, label, opts);
    var mod = 0, advMode = 'normal', numEl, prevEl, advBtns = {};
    var canAdv = withAdvantage(expr, 'adv', Fm.parse).ok;   // a lone plain die can roll twice keep best/worst
    var pop = el('div', 'dice-modpop'); modPop = pop;
    pop.appendChild(el('div', 'dice-modpop-title', label ? 'Roll ' + label : 'Roll with a modifier'));
    // 1.6.0 roll switches (the owner, by prompt: "In the ± window"): the bonuses this character's items and effects offer this roll, each a
    // tick, off at first; the host checks each one ticked is really the character's (systemcore swJudge)
    var swAv = swRef && typeof swRef === 'object' && window.wpSheets && typeof window.wpSheets.rollSwitchesFor === 'function' ? window.wpSheets.rollSwitchesFor(charId, swRef) : [], swOn = {}, swBtns = [];
    if (!Array.isArray(swAv)) swAv = [];
    function swSum() { return swAv.reduce(function(s, w) { return s + (swOn[w.s + '#' + w.i] ? w.v : 0); }, 0); }
    if (swAv.length) {
        var swBox = el('div', 'dice-modsw'); swBox.appendChild(el('div', 'dice-modsw-cap', 'Bonuses you may add'));
        swAv.forEach(function(w) {
            var k = w.s + '#' + w.i, b = el('button', 'tool ghost dice-swbtn'); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
            b.appendChild(el('span', 'dice-swbtn-n', w.name)); b.appendChild(el('span', 'dice-swbtn-v', (w.v > 0 ? '+' : '−') + Math.abs(w.v)));
            b.title = 'Add ' + w.name + ' to this roll'; b.addEventListener('click', function() { swOn[k] = !swOn[k]; refresh(); });
            swBtns.push([b, k]); swBox.appendChild(b);
        });
        pop.appendChild(swBox);
    }
    function applied() {   // advantage first (rewrites the die), then the flat modifier
        var base = expr;
        if (advMode !== 'normal') { var a = withAdvantage(expr, advMode, Fm.parse); if (a.ok) base = a.expr; }
        return composeModifier(base, mod + swSum(), Fm.parse);   // 1.6.0: and the roll switches ticked
    }
    function refresh() { swBtns.forEach(function(p) { p[0].classList.toggle('on', !!swOn[p[1]]); p[0].setAttribute('aria-pressed', swOn[p[1]] ? 'true' : 'false'); }); numEl.textContent = (mod > 0 ? '+' : '') + mod; var r = applied(); prevEl.textContent = r.ok ? r.expr : expr; if (canAdv) ['dis', 'normal', 'adv'].forEach(function(m) { advBtns[m].classList.toggle('on', advMode === m); }); }
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
    var go = el('button', 'tool dice-modpop-go', 'Roll'); go.addEventListener('click', function() { var r = applied(); if (!r.ok) { toast('That roll cannot take that change.'); return; } closeModPop(); rollFor(charId, r.expr, label, modOpts(opts, mod, advMode, swAv.filter(function(w) { return swOn[w.s + '#' + w.i]; }).map(function(w) { return { s: w.s, i: w.i }; }), swRef)); });   // R1: a roll with consequences sends its modifier and advantage as data
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
    var c = ui('chatPanel'); if (c && (c.style.display === 'none' || awayNow(c))) { var cb = ui('chatBtn'); if (cb) cb.click(); }
    p.style.display = 'flex'; if (window.wpFloats) window.wpFloats.reveal(p);   // 1.5.4 (floats.js): asked for here, so it shows on this view
    placePanel(); syncRoleLabels(); syncChars(); clearErr();
    var f = ui('diceExpr'); if (f) { f.focus(); f.select(); }
}
function closePanel() { var p = ui('dicePanel'); if (p) p.style.display = 'none'; }
function remember(expr) { var i = history.indexOf(expr); if (i >= 0) history.splice(i, 1); history.unshift(expr); if (history.length > LIMITS.history) history.length = LIMITS.history; histAt = -1; }
// roll(expr, { priv }) — the one entry point for the roller, the chat commands and the console's /table
function roll(expr, opts) {
    opts = opts || {};
    var more = typeof _rollMore !== 'undefined' ? _rollMore : null; if (more) _rollMore = null;   // taken at once: a roll refused below leaves nothing for the next (asked through typeof: a suite runs roll alone)
    var n = net(); if (!n || !n.diceRoll) return { error: 'Dice are not available.' };
    lastSource = opts.source || 'panel';
    var clean = cleanExpr(expr);
    if (!clean) return { error: 'Type a formula, for example 2d6 + 3 (up to ' + LIMITS.expr + ' characters).' };
    var r = n.diceRoll(clean, { priv: !!opts.priv, gmOnly: !!opts.gmOnly, charId: opts.charId || undefined, label: opts.label || undefined, fr: opts.fr || undefined, sw: opts.sw || undefined, row: opts.row || undefined, act: opts.act || undefined, mod: opts.mod || undefined, adv: opts.adv || undefined, dmg: opts.dmg === true ? true : undefined, on: typeof opts.on === 'string' && opts.on ? opts.on : undefined, range: more ? more.range : undefined, blast: more ? more.blast : undefined, used: more && more.used === true ? true : undefined, cross: more && more.cross ? more.cross : undefined });   // dmg: this machine's own word (a thrown item's damage); the wire never carries it
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
    b.addEventListener('click', function() { if (panelShown()) closePanel(); else openPanel(); });
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
    var cb = ui('chatBtn'); if (cb) cb.addEventListener('click', function() { setTimeout(function() { var c = ui('chatPanel'); if (c && c.style.display === 'none') closePanel(); else if (panelShown()) placePanel(); }, 0); });
    window.addEventListener('resize', function() { if (panelShown()) placePanel(); });
    p.addEventListener('wpfloatback', function() { if (panelShown()) placePanel(); });   // 1.5.4 (floats.js): back on screen with Table Chat, its place against the chat is worked out again
    var cp = ui('chatPanel'); if (cp) cp.addEventListener('wpfloatmoved', function() { if (panelShown()) placePanel(); });   // and when floats.js puts Table Chat clear of the tool bar
    document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && panelShown() && (!window.wpEsc || window.wpEsc.free(e))) closePanel(); }, true);   // a roller put away with its view is not closed by a key; 1.5.4: esckey.js closes it when it is the thing on top, and never with something else
})();
window.wpDiceSync = sync;
setTimeout(sync, 0);
window.wpDice = { roll: roll, rollFor: rollFor, rollWithMod: rollWithMod, syncChars: syncChars, renderCard: renderCard, renderApply: renderApply, renderDue: renderDue, line: line, landed: landed, onDeny: onDeny, onRolled: onRolled, openPanel: openPanel, closePanel: closePanel, sync: sync, LIMITS: LIMITS, history: function() { return history.slice(); } };
