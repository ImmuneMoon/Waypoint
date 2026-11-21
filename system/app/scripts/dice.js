/* Dice (1.5.0) — the UI half: the roller popover beside Table Chat (#diceBtn / #dicePanel), the roll card that
   renderChat draws for a roll entry, the deny / timeout messages, the local Dice cue, and wpDiceSync for the VTT
   feature switch. The wire and the rolling itself live in net.js (net.diceRoll, the roll-req / roll / roll-deny
   handlers); the validators, replay and text in dicecore.js. Design of record: docs/DICE_PLAN.md. */
import { toast } from './io.js';
import { crossWhy, cleanDiceBonus, malfWords, coverHitWords, LIMITS, cleanExpr, composeModifier, withAdvantage, verdictOf, critOf, cardText, fmtNum, malfOf, ruleOf, resistWhy, landWhy, sendWhy, dueMajor, hitFaces, cleanPos, posWords } from './dicecore.js';
import { getActiveCampaign } from './models.js';   // 1.6.2: the campaign a player's roller reads its character from
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
// 1.6.2 (the owner, 2026-11-02: "we shouldnt be using code expressions on the user side"): what a formula read of its dice, in words
function readWords(r) {
    if (!r || typeof r !== 'object' || typeof r.value !== 'number') return ''; var v = fmtNum(r.value), at = typeof r.at === 'number' ? fmtNum(r.at) : '', nth = at === '1' ? '1st' : at === '2' ? '2nd' : at === '3' ? '3rd' : at + 'th';
    switch (r.fn) {
        case 'count': return !r.op ? v + (r.value === 1 ? ' die' : ' dice') : r.op === '>=' ? v + ' at ' + at + ' or more' : r.op === '<=' ? v + ' at ' + at + ' or less' : r.op === '>' ? v + ' over ' + at : r.op === '<' ? v + ' under ' + at : r.op === '=' ? v + ' showing ' + at : v + ' not showing ' + at;
        case 'high': return 'highest ' + v;
        case 'low': return 'lowest ' + v;
        case 'nth': return nth + ' highest ' + v;
        case 'best': return 'best ' + at + ' make ' + v;
        case 'worst': return 'worst ' + at + ' make ' + v;
        case 'sets': return v + ' matching';
        case 'setface': return 'most match on ' + v;
        case 'pairs': return v + (r.value === 1 ? ' pair' : ' pairs');
        case 'total': return 'total ' + v;
    }
    return '';
}
function readableInto(brk, res, parts, expr) {
    var all = parts.filter(function(p) { return p && typeof p === 'object' && p.die; }), groups = all.filter(function(p) { return !p.die.plus; }), plus = all.filter(function(p) { return p.die.plus; }), b = res.breakdown || {}, top = null;   // 1.6.2: dice added as a bonus are said apart
    (Array.isArray(b.checks) ? b.checks : []).forEach(function(c) { if (c && c.top) top = c; });
    groups.forEach(function(p, i) {
        var d = p.die, was = i ? groups[i - 1].die : null;
        if (i) brk.appendChild(document.createTextNode((d && d.aside) || (was && was.aside) ? ' \u00b7 ' : ' + '));   // 1.6.2: dice rolled to read are not added to the roll's
        var head = d && typeof d.count === 'number' && d.faces !== undefined ? d.count + 'd' + d.faces + ' ' : '';
        brk.appendChild(document.createTextNode(head + '['));
        brk.appendChild(el('span', 'roll-die', p.text));
        brk.appendChild(document.createTextNode(']'));
    });
    (Array.isArray(b.reads) ? b.reads : []).forEach(function(r) { var w = readWords(r); if (w) brk.appendChild(document.createTextNode(' \u00b7 ' + w)); });
    if (!top && groups.length && typeof res.value === 'number' && isFinite(res.value) && dicePlainAdd(expr)) {   // 1.6.0: dice and adds, a sheet's value among them: the add said, or the sum after it reads as a slip. A formula that does more than add says its total alone (1.6.3: judged by where its dice stand, so brackets around the add no longer hide it)
        plusInto(brk, plus, expr, ' + '); plus = [];
        var diceSum = all.reduce(function(n, p) { return n + (p.die && typeof p.die.total === 'number' ? p.die.total * plusSign(p.die, expr) : NaN); }, 0), addN = res.value - diceSum;
        if (isFinite(addN) && addN !== 0) brk.appendChild(document.createTextNode((addN > 0 ? ' + ' : ' \u2212 ') + fmtNum(Math.abs(addN))));
    }
    if (top && typeof top.left === 'number' && typeof top.right === 'number' && isFinite(top.left) && isFinite(top.right)) {
        var w = top.op === '<=' ? ' or less' : top.op === '>=' ? ' or more' : top.op === '<' ? ', under it' : top.op === '>' ? ', over it' : '';
        brk.appendChild(document.createTextNode((groups.length ? ' = ' : '') + fmtNum(top.left) + ' \u00b7 needs ' + fmtNum(top.right) + w));
    }
    if (plus.length) { brk.appendChild(document.createTextNode(' \u00b7 added ')); plusInto(brk, plus, expr, ''); }
    var full = parts.map(function(p) { return typeof p === 'string' ? p : p.text; }).join('');
    var Fw = F();   // 1.6.2: a formula that reads the sheet keeps its names off the card, and renderCard says them in words
    brk.title = Fw && Fw.plainDice && !Fw.plainDice(String(expr || '')) ? '' : String(expr || '').replace(/@_bonus/g, '') + (full ? '\n' + full : '');
}
// 1.6.3 (the improvement week's review of sheets and rolls, finding 12): whether a card may say "+ N" after its dice, N being the total less
// what the dice came to. That holds only where every die is simply added to the total: each dice term stands in the formula's top sum (any
// depth of brackets, which the parser keeps as a sum of their own), taken away only where it is a bonus die the ± window added (its sign
// said by plusSign), and never inside a product, a division, a function, a minus sign of its own or another die's count. A damage roll
// written 5d6 + (Row.Bonus) once said 27 under dice that came to 22, since any bracket used to hide the add. A formula that cannot be read
// here falls back to the old rule (no *, /, % or bracket anywhere). Read by readableInto alone
function dicePlainAdd(expr) {
    var s = String(expr || ''), Fm = typeof F === 'function' ? F() : null, p = null;
    try { p = Fm && typeof Fm.parse === 'function' ? Fm.parse(s) : null; } catch (e) { p = null; }
    if (!p || !p.ok || !p.ast || typeof p.ast !== 'object') return !/[*\/%(]/.test(s);
    var all = 0, lin = 0;
    (function count(n) { if (!n || typeof n !== 'object') return; if (n.t === 'dice') all++; Object.keys(n).forEach(function(k) { var v = n[k]; if (Array.isArray(v)) v.forEach(count); else if (v && typeof v === 'object') count(v); }); })(p.ast.body || p.ast);   // every die, those rolled to read aside (with) among them
    (function walk(n, sign) {   // the dice the top sum adds, each counted once
        if (!n || typeof n !== 'object') return;
        if (n.t === 'dice') { if (sign === 1 || n.as === '_bonus') lin++; return; }
        if (n.t === 'sum' && Array.isArray(n.items)) n.items.forEach(function(it) { if (it && typeof it === 'object') walk(it.node, it.op === '-' ? -sign : sign); });
    })(p.ast.top || p.ast.body, 1);
    return all > 0 && lin === all;
}
// 1.6.2: an added die's sign, read from the formula just before it (composeModifier writes ' - 1d4@_bonus' for one taken away), and the dice said
function plusSign(d, expr) { if (!d || !d.plus || typeof d.pos !== 'number') return 1; return /-\s*$/.test(String(expr || '').slice(0, d.pos)) ? -1 : 1; }
function plusInto(brk, plus, expr, first) {
    plus.forEach(function(p, i) {
        var d = p.die, neg = plusSign(d, expr) < 0; brk.appendChild(document.createTextNode(neg ? (i || first ? ' \u2212 ' : '\u2212') : (i ? ' + ' : first)));
        brk.appendChild(document.createTextNode(d.count + 'd' + d.faces + ' [')); brk.appendChild(el('span', 'roll-die', p.text)); brk.appendChild(document.createTextNode(']'));
    });
}
// A card's hover, what the roll read, a name a line in words. 1.6.3 (finding 32): a name that read 0 or nothing is left out, since it said
// nothing about this roll and hid the one or two figures that did, and a yes or no reads as yes or no, never as true or false
function namesHover(rec) {
    var w = window.wpSheets && typeof window.wpSheets.nameWord === 'function' ? window.wpSheets.nameWord : null; if (!w || !Array.isArray(rec.names)) return '';
    return rec.names.filter(function(n) { return n && n.value !== 0 && n.value !== false && n.value !== null && n.value !== undefined && n.value !== ''; }).map(function(n) { return w(n.name) + ': ' + (typeof n.value === 'boolean' ? (n.value ? 'yes' : 'no') : typeof n.value === 'number' ? fmtNum(n.value) : n.value); }).join('\n');
}
// 1.6.3 (finding 9): a value a card names, in the sheet's own words (wpSheets.nameWord, the System editor's labels), never its formula name.
// A row's own figure reads as the figure alone (this row's Damage is Damage on a card about that row). With no sheets module, as before:
// the name with a leading Row. taken off
function modWord(n) {
    var s = String(n == null ? '' : n), W = typeof window !== 'undefined' && window && window.wpSheets && typeof window.wpSheets.nameWord === 'function' ? window.wpSheets.nameWord : null;
    if (!W) return s.replace(/^Row\./i, '');
    var w = ''; try { w = String(W(s) || ''); } catch (e) { w = ''; } if (!w) return s.replace(/^Row\./i, '');
    w = w.replace(/^this row’s /, ''); return w.charAt(0).toUpperCase() + w.slice(1);
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
        if (!mm.length && e.a === 0) return;   // 1.6.3 (finding 9): a value no effect moved that adds nothing to the roll says nothing of what is inside it ("Conditions 0, already in 0: +2 Tough", found live)
        row.appendChild(el('span', 'chat-mod-n', typeof modWord === 'function' ? modWord(e.n) : String(e.n).replace(/^Row\./i, '')));   // 1.6.3 (finding 9): by its label, never its key
        row.appendChild(document.createTextNode(' ' + (mm.length ? fmtNum(e.b) + ' \u2192 ' : '') + fmtNum(e.a)));
        box.appendChild(row); any = true;
        var sg = function(v) { return (v > 0 ? '+' : '\u2212') + fmtNum(Math.abs(v)); };
        mm.forEach(function(x) { if (x && typeof x === 'object') box.appendChild(el('div', 'chat-mod-src', sg(x.v) + ' ' + x.s)); });
        // an effect on a value this one is worked out from is inside the figure already: said so, so that it never reads as one more change to this roll
        ww.forEach(function(x) { if (x && typeof x === 'object') box.appendChild(el('div', 'chat-mod-src chat-mod-via', 'already in ' + fmtNum(e.b) + ': ' + sg(x.v) + ' ' + x.s + ' on ' + (typeof modWord === 'function' ? modWord(x.t) : String(x.t).replace(/^Row\./i, '')))); });
    });
    if (any) wrap.appendChild(box);
}
// 1.6.2: a bonus as it reads, its figure and its dice (+2 +1d6, +1d6, −1d4)
function bonusWords(v, d) { var w = typeof v === 'number' && v ? (v > 0 ? '+' : '−') + Math.abs(v) : ''; if (typeof d === 'string' && d) w += (w ? ' ' : '') + d.replace(/-/g, '−').replace(/(.)([+−])/g, '$1 $2'); return w || '+0'; }
// 1.6.0 roll switches: the bonuses ticked in the roll's ± window, by name, as text nodes; nothing where it had none
function swInto(wrap, sw) {
    if (!Array.isArray(sw) || !sw.length) return; var box = el('div', 'chat-mods chat-sw');
    sw.forEach(function(x) { if (x && typeof x === 'object' && typeof x.v === 'number') box.appendChild(el('div', 'chat-mod-src', bonusWords(x.v, x.d) + ' ' + x.n + ', added')); });
    if (box.firstChild) wrap.appendChild(box);
}
// 1.6.3 (the improvement week's review of sheets and rolls, finding 26; Fulllion: "these, as settings"): a roll typed in the roller hides its formula
// where it reads the sheet (renderCard's named), so a +10 typed by hand showed nowhere. typedWords says the formula in words: each name the sheet's own
// word for it (wpSheets.nameWord, as the card's hover says it), everything typed beside it as written, the comparisons as signs. typedInto puts it on
// the card for the GM's machine always, and for everyone where the host marked the card tws (the campaign's Typed rolls in words). Text nodes only
function typedWords(expr) {
    var s = String(expr || '').replace(/@_bonus/g, ''), Fm = F(), W = window.wpSheets && typeof window.wpSheets.nameWord === 'function' ? window.wpSheets.nameWord : null, names = [];
    try { names = Fm && typeof Fm.names === 'function' ? Fm.names(s) : []; } catch (e) { names = []; }
    var map = {}; names.forEach(function(nm) { var w = ''; try { w = W ? String(W(nm) || '') : ''; } catch (e) { w = ''; } map[String(nm).toLowerCase()] = w || 'a value'; });   // the review of rolls (finding 5): a name with no word for it (no sheet here, a name this view lacks) reads as a value, never its key
    var keys = Object.keys(map).sort(function(a, b) { return b.length - a.length; }).map(function(k) { return k.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&'); });
    if (keys.length) s = s.replace(new RegExp('(^|[^A-Za-z0-9_.])(' + keys.join('|') + ')(?![A-Za-z0-9_.])', 'gi'), function(m0, pre, nm) { var w = map[nm.toLowerCase()]; return pre + (w === undefined ? nm : w); });
    return s.replace(/<=/g, '\u2264').replace(/>=/g, '\u2265').replace(/!=/g, '\u2260').replace(/\*/g, '\u00d7').replace(/\s+/g, ' ').trim();
}
function typedInto(wrap, rec, n) {
    // the review of rolls (finding 3): the GM's own machine, as net.js chatGmSide says it, so a player's chat in a window of its own (net not active there) is
    // not taken for the GM's; with no such word, only a main window whose table is not someone else's
    var gm = n && typeof n.chatGmSide === 'function' ? n.chatGmSide() === true : !!(n && (!n.active || n.role === 'host')) && !window.wpPopout && !window.wpStream;
    if (!gm && rec.tws !== 1) return;
    var w = typedWords(rec.expr); if (!w) return;
    var box = el('div', 'chat-mods chat-typedw'); box.appendChild(el('div', 'chat-mod-src', 'Typed: ' + w)); wrap.appendChild(box);
}
// 1.6.3 (the improvement week's review of sheets and rolls, finding 13): what the roller added by hand in the ± window, said on the card for the
// whole table, as the host recorded it (rec.hmod, dicecore cleanHmod: a figure and advantage; dice added already show through plusInto). A
// roll with a hand modifier once read only "needs 18", with nothing to say why it no longer matched the line above it. Text nodes only
function hmodInto(wrap, hm) {
    if (!hm || typeof hm !== 'object') return; var w = [];
    if (typeof hm.v === 'number' && isFinite(hm.v) && hm.v) w.push((hm.v > 0 ? '+' : '−') + Math.abs(hm.v) + ' added by hand');
    if (hm.adv === 'adv' || hm.adv === 'dis') w.push(hm.adv === 'adv' ? 'with advantage' : 'with disadvantage');
    if (!w.length) return; var box = el('div', 'chat-mods chat-hmod'); box.appendChild(el('div', 'chat-mod-src', w.join(', '))); wrap.appendChild(box);
}
// 1.6.0 Specialties: the case each reference the roll read used, such as as Blade (Longsword) \u22122, as text nodes; nothing where it read none
// 1.6.3 (the improvement week's review of sheets and rolls, finding 9): as a short sentence, "Rolled as Blade (Longsword)" and "Odd Anatomy, rolled
// untrained (−5)", where the host's words alone ("untrained Odd Anatomy") said nothing of what happened; words of the reference's own are as written
function refsInto(wrap, refs) {
    if (!Array.isArray(refs) || !refs.length) return; var box = el('div', 'chat-mods chat-refs');
    var say = function(s) { var u = /^untrained (.+?)( \([^()]*\))?$/.exec(s); if (u) return u[1] + ', rolled untrained' + (u[2] || ''); return /^as /.test(s) ? 'Rolled ' + s : s; };
    refs.forEach(function(x) { if (x && typeof x === 'object' && typeof x.s === 'string' && x.s) box.appendChild(el('div', 'chat-mod-src', say(x.s))); });
    if (box.firstChild) wrap.appendChild(box);
}
// 1.6.2, backlog 35: a card's "as" or "for" and the character's name, the name in its personal look where the card carries one
function asTag(word, rec, card) {
    var t = el('span', 'chat-tag', word), n = el('span', 'chat-as', rec.as); t.appendChild(n);
    var P = typeof window !== 'undefined' ? window.wpPlook : null; if (P && rec.pl && P.on()) { P.dress(n, rec.pl); if (card && card.style && /^#[0-9a-f]{6}$/.test(rec.pl.color || '')) card.style.boxShadow = 'inset 0 0 0 1px ' + rec.pl.color; }   // and the card edged in its color
    return t;
}
function renderCard(m) {
    var rec = m.roll, res = m.res, n = net(), Fm = F();
    var priv = !!(rec.priv || rec.to);
    var wrap = el('div', 'chat-roll' + (priv ? ' whisper' : ''));
    if (wrap.dataset && typeof rec.id === 'string') wrap.dataset.rid = rec.id;   // 1.6.2, backlog 212: the animated dice find their own card by it
    var mine = n && ((rec.from.gm && (!n.active || n.role === 'host')) || (n.myId && rec.from.id === n.myId));
    var who = el('b', null, mine ? 'You' : (rec.from.name || 'Player'));
    who.style.color = rec.from.gm ? 'var(--gold)' : 'hsl(' + playerHue(rec.from.id) + ', 55%, 68%)';
    wrap.appendChild(who);
    if (rec.from.gm) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(el('span', 'chat-gm', 'GM')); }
    var tag = rec.mk === 2 ? 'only you' : rec.priv === 'gm' ? (rec.from.gm ? 'private' : 'to the GM') : rec.to ? (m.toName ? 'to ' + m.toName : 'private') : '';   // 1.6.3 (finding 22): a roll while making that the system keeps its roller's alone
    if (tag) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(el('span', 'chat-tag', tag)); }
    if (rec.rev === 1) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(el('span', 'chat-tag chat-rev', rec.priv === 'gm' ? 'shown to the table' : 'revealed')); }   // 1.6.3: a roll the GM hid and then showed to the table
    if (rec.dmg === 1) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(el('span', 'chat-dmg', 'damage')); }   // chat cards (owner 2026-09-27): a damage roll's tag
    if (rec.typed === 1) { wrap.appendChild(document.createTextNode(' ')); var tyT = el('span', 'chat-tag chat-typed', 'typed'); tyT.title = 'Typed in the roller, not pressed on a sheet'; wrap.appendChild(tyT); }   // 1.6.3 (finding 26): a roll typed in the roller says so, so that the GM never takes it for a sheet's roll
    if (rec.mk === 1 || rec.mk === 2) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(el('span', 'chat-tag chat-making', 'while making')); }   // 1.6.3 (finding 22): rolled on a character still being made
    if (rec.as && rec.as !== rec.from.name) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(typeof asTag === 'function' ? asTag('as ', rec, wrap) : el('span', 'chat-tag', 'as ' + rec.as)); }   // the character the roll was made as (1.5.0)
    wrap.appendChild(el('span', 'chat-time', chatTime(rec.ts)));
    wrap.appendChild(el('br'));
    if (rec.label) wrap.appendChild(el('div', 'roll-title', rec.label + (typeof rec.onName === 'string' && rec.onName ? ': ' + rec.onName : '')));
    if ((rec.mk === 1 || rec.mk === 2) && typeof rec.mkFor === 'string' && rec.mkFor) wrap.appendChild(el('div', 'roll-for', 'For ' + rec.mkFor));   // 1.6.3 (finding 22): the field a roll while making is for, as text
    if (rec.hid === 'gm') { wrap.appendChild(el('div', 'roll-togm', 'Sent to the GM.')); return wrap; }   // HR1: its roller sees that it went, and nothing of it   // chat cards: the roll's name as the card's title (his reference cards); the formula on its own line
    if (!res || !res.ok || !Fm) {
        wrap.appendChild(el('div', 'roll-bad', 'a roll that could not be read' + (m.rollBad === 'version' ? ' (a different dice engine)' : '')));
        if (rec.dmg === 1) wrap.className += ' card-dmg';   // a damage roll needs no dice to be one
        return wrap;
    }
    var coin = rec.expr === '1d2' && rec.label === 'Coin flip';   // 1.6.2: the Coin button's roll says heads or tails, with no dice line
    var named = !!rec.hid || coin; try { named = named || (typeof Fm.names === 'function' && Fm.names(rec.expr).length > 0) || (typeof Fm.plainDice === 'function' && !Fm.plainDice(rec.expr)); } catch (e) { named = false; }   // 1.5.7 (the owner: the formula "is showing as the roll information instead of being readable by everyone")
    var exprLine = el('div', 'roll-expr', rec.expr); exprLine.title = rec.expr; if (!named) wrap.appendChild(exprLine);
    var brk = el('div', 'roll-break');
    var sy = window.wpSheets && window.wpSheets.systemOf ? window.wpSheets.systemOf() : null, rule = typeof ruleOf === 'function' ? ruleOf(rec, sy && sy.combat ? sy.combat.checks : '') : sy && sy.combat && sy.combat.checks === 'under3d6' ? 'under3d6' : '';   // Stage 6 F8: the campaign's roll outcomes (1.6.0: or the critical range the host put on the record, asked through typeof for a suite that slices the card)
    var v = verdictOf(res, rule), crit = critOf(res, rule), mf = malfOf(rec, res);   // R3: a malfunction is a failure, whatever the test said
    if (rec.hid) { v = rec.hid === 'rolled' ? null : { kind: 'check', pass: rec.hid === 'pass', text: rec.hid === 'pass' ? 'success' : 'failure', crit: rec.hidc || '' }; crit = rec.hidc || null; }   // 1.6.2: a figure kept from this table: the dice and the host's word, and nothing worked out here
    var parts = typeof Fm.parts === 'function' ? Fm.parts(res, 40) : [Fm.describe(res, { maxChars: LIMITS.cardChars })];
    if (v && v.crit !== undefined && parts.length && typeof parts[parts.length - 1] === 'string') parts[parts.length - 1] = parts[parts.length - 1].replace(/:\s*(success|failure)( by [^:]*)?$/, '');   // F8: the rule's verdict is the line below (never the arithmetic's)
    if (named) { readableInto(brk, res, parts, rec.expr); if (!brk.title) brk.title = namesHover(rec); }
    else parts.forEach(function(p) { if (typeof p === 'string') brk.appendChild(document.createTextNode(p)); else brk.appendChild(el('span', 'roll-die', p.text)); });
    if (typeof dieInto === 'function') dieInto(brk, rec);   // 1.5.8: the die its formula rolls, first on the dice line
    var hmC = rec.dmg === 1 && Array.isArray(rec.more) ? rec.more : [];   // 1.6.0 A burst: each hit after the first, its total on a line of its own, as text
    if ((!hmC.length || mf) && !coin) wrap.appendChild(brk);   // the live test, 2026-10-30: several hits show their dice on their own lines, and this line was only the first's
    if (typeof modsInto === 'function') modsInto(wrap, rec.mods);
    if (typeof refsInto === 'function') refsInto(wrap, rec.refs);   // 1.6.0 Specialties: which row a reference read
    if (typeof swInto === 'function') swInto(wrap, rec.sw);   // 1.6.0: the roll switches it was rolled with
    if (rec.typed === 1 && named && !rec.hid && typeof typedInto === 'function') typedInto(wrap, rec, n);   // 1.6.3 (finding 26): a typed roll that reads the sheet, its formula in words, for the GM (and everyone where the campaign says)
    if (typeof hmodInto === 'function') hmodInto(wrap, rec.hmod);   // 1.6.3 (finding 13): and what was added by hand   // 1.5.8: what changed the values it read (asked through typeof for a suite that slices the card alone)
    wrap.className += mf ? ' card-malf' : v && v.kind === 'check' ? (v.pass ? ' card-ok' : ' card-fail') : rec.dmg === 1 ? ' card-dmg' : '';   // chat cards: the left stripe — a malfunction, the check's outcome, else a damage roll, else plain
    var csAll = !!v && v.kind === 'value' && typeof v.value === 'number' && Math.floor(v.value) === v.value && !!res && !!res.breakdown && Array.isArray(res.breakdown.dice) && res.breakdown.dice.some(function(d) { return !!d && !d.aside; }) && res.breakdown.dice.every(function(d) { return !d || d.aside || !!d.cs; });   // 1.6.2 (the builder trial): a roll that only counts hits says how many
    var lastPt = !named && parts.length && typeof parts[parts.length - 1] === 'string' ? parts[parts.length - 1] : '', saidTot = !!v && v.kind === 'value' && rec.dmg !== 1 && !!lastPt && lastPt.slice(-(' = ' + v.text).length) === ' = ' + v.text;   // 1.6.3 (finding 39): a typed roll's working already ends in its total, so the line under it does not say it twice (the line stays for a critical, a band or a tier; a damage roll keeps its total in sight, the figure Apply takes)
    var total = el('div', 'roll-total' + (mf ? ' roll-fail roll-malf' : v && v.kind === 'check' ? (v.pass ? ' roll-ok' : ' roll-fail') : rec.dmg === 1 ? ' roll-dmg' : ''), mf ? malfWords(rec) : v ? (v.kind === 'check' ? v.text : hmC.length ? (hmC.length + 1) + ' hits' : csAll ? v.value + (v.value === 1 ? ' hit' : ' hits') : saidTot ? '' : '= ' + v.text) : '');
    if (coin) total.textContent = res.value === 1 ? 'Heads' : 'Tails';
    if (crit) total.appendChild(el('span', 'roll-' + crit, v && v.crit ? (crit === 'crit' ? 'critical success' : 'critical failure') : crit === 'crit' ? 'natural 20' : 'natural 1'));
    var tierC = sy && sy.combat && sy.combat.tier && typeof sy.combat.tier === 'object' ? sy.combat.tier : null;   // 1.6.0: a success at or past the Combat tab's margin wears its name
    if (!mf && tierC && typeof tierC.name === 'string' && tierC.name && typeof tierC.at === 'number' && v && v.kind === 'check' && v.pass === true && typeof v.margin === 'number' && v.margin >= tierC.at) total.appendChild(el('span', 'roll-tier', tierC.name));
    if (typeof rec.band === 'string' && rec.band) total.appendChild(el('span', 'roll-tier', rec.band));   // 1.6.2: the result band the host found
    if (typeof rec.card === 'string' && rec.card) wrap.appendChild(el('div', 'roll-aim', 'Drew ' + rec.card));   // 1.6.2: the card a roll drew as its die
    wrap.appendChild(total);
    var posC = typeof cleanPos === 'function' ? cleanPos(rec.pos) : null;   // 1.6.0: a target's posture on the attack, and which of it and cover counted
    if (posC) wrap.appendChild(el('div', 'roll-aim', posWords(posC)));
    else if (typeof rec.cov === 'string' && rec.cov) wrap.appendChild(el('div', 'roll-aim', 'Target in ' + rec.cov.toLowerCase()));   // 1.6.0: the number alone did not say why
    var amR = rec.aim && typeof rec.aim === 'object' && typeof rec.aim.n === 'string' && rec.aim.n ? rec.aim : null;   // 1.6.0 (B5): where a called shot was aimed, and what its location gave
    (Array.isArray(rec.asked) ? rec.asked : []).forEach(function(a) { if (a && typeof a.l === 'string' && typeof a.w === 'string') wrap.appendChild(el('div', 'roll-aim', a.l + ' ' + a.w)); });   // 1.6.2: what its roller answered
    if (typeof rec.pend === 'number' && rec.pend > 0) {   // 1.6.2 (G5): held until it is accepted, and it says so, so that nobody takes it for landed
        wrap.appendChild(el('div', 'roll-pend', 'Pending. Nothing has landed yet.'));
        if (rec.pts && typeof rec.pts === 'object' && typeof rec.pts.n === 'number') wrap.appendChild(el('div', 'roll-pend', rec.pts.n + ' ' + String(rec.pts.w || (rec.pts.n === 1 ? 'point' : 'points')) + ' to spend'));   // 1.6.2 (G5)
        var nP = net(), meP = !!(nP && nP.myId && rec.from && rec.from.id === nP.myId), gmP = !!(nP && (!nP.active || nP.role === 'host')), barP = el('div', 'roll-pend-bar');
        if (meP || (gmP && rec.from && rec.from.gm)) (Array.isArray(rec.offers) ? rec.offers : []).forEach(function(a) { var b = el('button', 'tool ghost', a.l); b.type = 'button'; b.addEventListener('click', function() { if (nP.cardAct) nP.cardAct(rec.id, a.k); }); barP.appendChild(b); });
        if (meP || gmP) { var ac = el('button', 'tool', 'Accept'); ac.type = 'button'; ac.title = 'Let it land as it stands. It lands by itself after ' + rec.pend + ' seconds'; ac.addEventListener('click', function() { if (nP.cardAct) nP.cardAct(rec.id, 'accept'); }); barP.appendChild(ac); }
        if (barP.childNodes.length) wrap.appendChild(barP);
    }
    if (amR) { var amF = Array.isArray(amR.f) ? amR.f.filter(function(x) { return x && typeof x.v === 'number' && isFinite(x.v); }) : [], amS = function(n) { return n < 0 ? '\u2212' + (-n) : n > 0 ? '+' + n : '0'; }; wrap.appendChild(el('div', 'roll-aim', 'at ' + amR.n + (amF.length === 1 ? ' (' + amS(amF[0].v) + ')' : amF.length ? ' (' + amF.map(function(x) { return x.k + ' ' + amS(x.v); }).join(', ') + ')' : ''))); }
    if (rec.cvh && typeof rec.cvh === 'object' && typeof rec.cvh.n === 'string' && typeof coverHitWords === 'function') wrap.appendChild(el('div', 'roll-aim', coverHitWords(rec.cvh)));
    var bodyN = typeof rec.bodyName === 'string' && rec.bodyName ? rec.bodyName : '';   // 1.6.2: named to those who can see the target
    if (rec.body === 1) wrap.appendChild(el('div', 'roll-aim', bodyN ? 'It misses the target and hits ' + bodyN + ', in the way.' : 'It misses the target and hits the body in the way.'));   // 1.6.2: a miss within a body's cover
    if (rec.bodyOn === 1) wrap.appendChild(el('div', 'roll-aim', bodyN ? 'On ' + bodyN + ', in the way.' : 'On the body in the way.'));   // 1.6.0: where a hit behind cover landed, and the die
    var p2c = rec.dmg === 1 && rec.dmg2 && typeof rec.dmg2 === 'object' && typeof rec.dmg2.t === 'number' && isFinite(rec.dmg2.t) ? rec.dmg2 : null;   // 1.6.0 (B3): the blow's second part, of another type, rolled by the host
    if (p2c && !mf) { var p2y = sy && sy.combat && sy.combat.damage && Array.isArray(sy.combat.damage.types) ? sy.combat.damage.types.filter(function(y) { return y && y.key === p2c.dtype; })[0] : null; wrap.appendChild(el('div', 'roll-part2', 'and ' + p2c.t + (p2y ? ' ' + (p2y.label || p2y.key) : typeof p2c.dtype === 'string' ? ' ' + p2c.dtype : '') + ' in the same blow')); }
    var pkc = {}; [3, 4, 5].forEach(function(k) { var pk = rec.dmg === 1 && rec['dmg' + k] && typeof rec['dmg' + k] === 'object' && typeof rec['dmg' + k].t === 'number' && isFinite(rec['dmg' + k].t) ? rec['dmg' + k] : null; if (!pk) return; pkc[k] = pk; if (mf) return; var pky = sy && sy.combat && sy.combat.damage && Array.isArray(sy.combat.damage.types) ? sy.combat.damage.types.filter(function(y) { return y && y.key === pk.dtype; })[0] : null; wrap.appendChild(el('div', 'roll-part2', 'and ' + pk.t + (pky ? ' ' + (pky.label || pky.key) : typeof pk.dtype === 'string' ? ' ' + pk.dtype : '') + ' in the same blow')); });   // 1.6.0: a third and a fourth part, said and handed on as the second
    if (rec.dmg === 1 && !hmC.length && !mf && roundWords(rec)) wrap.appendChild(el('div', 'roll-hit', 'Hit: ' + roundWords(rec)));   // a burst with one hit says which round it was
    if (hmC.length && !mf) { var hnY = function(k) { var y = sy && sy.combat && sy.combat.damage && Array.isArray(sy.combat.damage.types) ? sy.combat.damage.types.filter(function(t) { return t && t.key === k; })[0] : null; return y ? ' ' + (y.label || y.key) : typeof k === 'string' ? ' ' + k : ''; }; hitInto(wrap, 1, rec, typeof res.value === 'number' && isFinite(res.value) ? Math.floor(res.value) : '', hnY(rec.dtype), typeof hitFaces === 'function' ? hitFaces(res) : []); hmC.forEach(function(h, i) { var w = hnY(h.dtype); [2, 3, 4, 5].forEach(function(k) { var p = h['dmg' + k]; if (p && typeof p.t === 'number') w += ' and ' + p.t + hnY(p.dtype); }); hitInto(wrap, i + 2, h, h.t, w, h.f); }); }
    if (rec.dmg === 1 && !mf && rec.ans && typeof rec.ans === 'object' && Array.isArray(rec.ans.say)) rec.ans.say.slice(0, 4).forEach(function(w) { if (typeof w === 'string' && w) wrap.appendChild(el('div', 'roll-aim roll-ans', w.slice(0, 160))); });   // 1.6.3 (defense fold 3): what the defense let through, on the GM's own copy alone (the host stamps it past the table's), as text
    var dS = window.wpSheets, dv = res && typeof res.value === 'number' && isFinite(res.value) ? res.value : null;   // 1.5.6, the damage step: the GM takes a damage roll off its target in one press
    if (rec.dmg === 1 && dv !== null && !mf && rec.dmgUsed === 1) wrap.appendChild(el('div', 'chat-dmgdone', rec.dmgWait === 1 ? 'Applied once the Defense rolls are in' : 'Applied'));   // 1.5.7: a hit is applied once
    else if (rec.dmg === 1 && dv !== null && !mf && typeof rec.blast === 'string' && typeof window.wpBlastApply === 'function' && dS && typeof dS.damageOn === 'function' && dS.damageOn()) {   // 1.5.8 explosives: a blast's damage, to everyone in it, once
        var bb = el('button', 'tool ghost chat-dmgapply', 'Apply to all in the blast'); bb.type = 'button'; bb.title = 'Take this damage off every character in the blast, each by its distance and through its DR, as the Combat tab says. Once applied, the button goes.';
        bb.addEventListener('click', function() { if (rec.dmgUsed === 1) return; if (window.wpBlastApply(rec.blast, dv)) { rec.dmgUsed = 1; if (bb.parentNode) bb.parentNode.replaceChild(el('div', 'chat-dmgdone', 'Applied'), bb); } });
        wrap.appendChild(bb);
    }
    else if (rec.dmg === 1 && dv !== null && !mf && dS && typeof dS.damageOn === 'function' && typeof dS.damageFromRoll === 'function' && dS.damageOn() && !(rec.ans && rec.ans.keep === 0)) {   /* 1.6.3 (defense fold 3): nothing to apply where the defense stopped every hit */
        var ab = el('button', 'tool ghost chat-dmgapply', rec.dmgOn ? 'Apply to this character\u2026' : 'Apply to target\u2026'); ab.type = 'button'; ab.title = rec.dmgOn ? 'Take this damage off the character who rolled it, through its DR. Its window opens first. Once applied, the button goes.' : 'Take this damage off the character its roller targets, through its DR. Its window opens first, with a Who list of the characters on this map. The target comes first, then the token you selected, and with neither it asks who. Once applied, the button goes.';   // 1.6.3 (finding 29): sheets.js damageFromRoll and dmgWhoList
        if (!rec.dmgOn && rec.dmgAim === 1) { ab.textContent = 'Apply to the selected token\u2026'; ab.title = 'It had no one to land on when its card came. Select the token it lands on, or pick who in its window, which opens first with a Who list of the characters on this map. Once applied, the button goes.'; }   // 1.6.3 (the review of defense fold 0): never the roller's pointer
        if (rec.dmgOn && typeof rec.onName === 'string' && rec.onName) { ab.textContent = 'Apply to ' + rec.onName + '\u2026'; ab.title = 'Take this damage off ' + rec.onName + ', the one it lands on, through its DR. Its window opens first. Once applied, the button goes.'; }   // 1.6.3 (defense fold 0): a card that lands on someone else names them, as text
        var dN = 0; (res.breakdown && Array.isArray(res.breakdown.dice) ? res.breakdown.dice : []).forEach(function(g) { if (g && typeof g.count === 'number' && isFinite(g.count)) dN += g.count; });   // 1.6.0: the dice it rolled, and the armor divisor the host put on the record
        ab.addEventListener('click', function() { if (rec.dmgUsed !== 1 && typeof dS.aimNext === 'function') dS.aimNext(typeof rec.hit === 'string' ? rec.hit : ''); });   // 1.6.0 (B5): the location it was aimed at, picked in the window first (before the press below opens it)
        ab.addEventListener('click', function() { if (rec.dmgUsed === 1) return; dmgCall(dS, rec, rec.from && rec.from.id, dv, function() { rec.dmgUsed = 1; if (ab.parentNode) ab.parentNode.replaceChild(el('div', 'chat-dmgdone', 'Applied'), ab); }, typeof rec.dtype === 'string' ? rec.dtype : undefined, { on: typeof rec.dmgOn === 'string' ? rec.dmgOn : undefined, tb: typeof rec.tb === 'number' ? rec.tb : undefined, dice: dN, ad: typeof rec.ad === 'number' ? rec.ad : 0, major: rec.major === 1, big: rec.blowBig === 1 ? true : undefined, kind: typeof rec.dkind === 'string' ? rec.dkind : undefined, part2: p2c ? { amt: p2c.t, type: p2c.dtype, ad: p2c.ad, dice: p2c.n, kind: p2c.dkind } : undefined, part3: pkc[3] ? { amt: pkc[3].t, type: pkc[3].dtype, ad: pkc[3].ad, dice: pkc[3].n, kind: pkc[3].dkind } : undefined, part4: pkc[4] ? { amt: pkc[4].t, type: pkc[4].dtype, ad: pkc[4].ad, dice: pkc[4].n, kind: pkc[4].dkind } : undefined, part5: pkc[5] ? { amt: pkc[5].t, type: pkc[5].dtype, ad: pkc[5].ad, dice: pkc[5].n, kind: pkc[5].dkind } : undefined, hits: hmC.length ? hmC.map(function(h) { var o = { amt: h.t, type: h.dtype, ad: h.ad, dice: h.n, kind: h.dkind, major: h.major === 1 }; [2, 3, 4, 5].forEach(function(k) { var p = h['dmg' + k]; if (p) o['part' + k] = { amt: p.t, type: p.dtype, ad: p.ad, dice: p.n, kind: p.dkind }; }); return o; }) : undefined, aim: rec.dmgAim === 1 ? true : undefined, thru: typeof rec.thru === 'string' ? rec.thru : undefined }); });   /* thru (1.6.3, the review of defense fold 1): the row a parry took the blow on, from the landing's record */
        wrap.appendChild(ab);
    }
    if (n && typeof n.toGmButtons === 'function') n.toGmButtons(wrap, rec);   // HR1: on the GM's own card of a roll that went to them
    if (n && rec.priv === 'gm' && rec.rev !== 1 && !rec.pend && typeof n.revealOk === 'function' && typeof n.revealRoll === 'function' && n.revealOk(rec.id)) {   // 1.6.3: the GM's card of a roll hidden by choice alone, which the host says may be shown
        var rvB = el('button', 'tool ghost chat-reveal', 'Show to the table'); rvB.type = 'button'; rvB.title = 'Send this roll to everyone as it was rolled. Only what a card would show them goes, and nothing of it runs again';
        rvB.addEventListener('click', function() { if (n.revealRoll(rec.id) && rvB.parentNode) rvB.parentNode.removeChild(rvB); });
        wrap.appendChild(rvB);
    }
    return wrap;
}
// [dicecheck:ansapply-start]
// 1.6.3 (defense fold 3; docs/DEFENSE_INTERACTIONS_DESIGN.md 4.2): the GM's Apply on a damage roll a defense answered. The host stamped what the line comes to
// on the GM's own copy (net.js ansStamp: rec.ans), so the Take damage window opens with it laid on: each part's share where some was let through, only the
// hits that were not stopped, and the type it lands as. A landing's damage roll (rec.landed) names the parrying row from its record alone, so the window never
// falls back on the defender's last parry (noThru). Every figure is read as a whole number of 0 or more, else the figure as rolled stands
function ansOn(a, dv, type, more) {
    var m = Object.assign({}, more || {}), n = function(v, d) { return typeof v === 'number' && isFinite(v) && v >= 0 ? Math.floor(v) : d; }, ks = [2, 3, 4, 5];
    var partSet = function(o, key, put) { var p = o[key]; if (p && typeof p === 'object') o[key] = Object.assign({}, p, put); };
    if (typeof a.amt === 'number') {
        // Dice counted per die (Fulllion's ruling of 2026-11-18): where the host stamped dc, the line said The same share of the dice, so the dice a part
        // hands the damage step are cut by the same fraction as its damage (got of was), rounded down, at least 1 where any gets through and none where
        // none does. A part rolled as 0, a share that keeps it whole, or no dice count leaves the count as it was, and with no dc nothing changes at all
        var cutD = function(d, was, got) { if (a.dc !== 1 || typeof d !== 'number' || !isFinite(d) || d <= 0 || typeof was !== 'number' || !isFinite(was) || was <= 0 || got >= was) return d; return got > 0 ? Math.max(1, Math.floor(d * got / was)) : 0; };
        var put = function(pk, got) { var o = { amt: got }; if (a.dc === 1 && typeof pk.dice === 'number') o.dice = cutD(pk.dice, pk.amt, got); return o; };
        var dv0 = dv; dv = n(a.amt, dv); if (a.dc === 1 && typeof m.dice === 'number') m.dice = cutD(m.dice, dv0, dv);
        ks.forEach(function(k) { var pk = m['part' + k]; if (pk && a.p && typeof a.p[k] === 'number') partSet(m, 'part' + k, put(pk, n(a.p[k], pk.amt))); });
        if (Array.isArray(m.hits) && Array.isArray(a.hits)) m.hits = m.hits.map(function(h, i) { var s = a.hits[i]; if (!h || !s || typeof s !== 'object') return h; var o = Object.assign({}, h, put(h, n(s.amt, h.amt))); ks.forEach(function(k) { if (o['part' + k] && s.p && typeof s.p[k] === 'number') partSet(o, 'part' + k, put(o['part' + k], n(s.p[k], o['part' + k].amt))); }); return o; });
    }
    if (typeof a.keep === 'number' && isFinite(a.keep) && Array.isArray(m.hits)) { var kp = Math.max(1, Math.floor(a.keep)); m.hits = kp > 1 ? m.hits.slice(0, kp - 1) : undefined; }   // the first hits land, the rest were stopped
    if (typeof a.type === 'string' && a.type) {
        type = a.type;
        if (a.all === true) ks.forEach(function(k) { partSet(m, 'part' + k, { type: a.type }); });
        if (Array.isArray(m.hits)) m.hits = m.hits.map(function(h) { if (!h || typeof h !== 'object') return h; var o = Object.assign({}, h, { type: a.type }); if (a.all === true) ks.forEach(function(k) { partSet(o, 'part' + k, { type: a.type }); }); return o; });
    }
    return { dv: dv, type: type, more: m };
}
function dmgCall(dS, rec, from, dv, done, type, more) {
    if (rec && rec.ans && typeof rec.ans === 'object') { var a = ansOn(rec.ans, dv, type, more); dv = a.dv; type = a.type; more = a.more; }
    if (rec && rec.landed === 1 && more && typeof more === 'object' && typeof more.thru !== 'string') more = Object.assign({}, more, { noThru: true });
    return dS.damageFromRoll(from, dv, done, type, more);
}
// [dicecheck:ansapply-end]
// 1.6.0 (the live test, 2026-10-30): which round a hit was, in words; '' where it names none
function roundWords(h) { return typeof h.rno === 'number' ? 'round ' + h.rno + (typeof h.rnd === 'string' && h.rnd ? ' (' + h.rnd + ')' : '') : ''; }
// A hit's line on a burst's card, as text: its number, its round, its total and damage type, then its own dice and what the total added to them
function hitInto(wrap, i, h, t, words, faces) {
    var rw = roundWords(h), d = el('div', 'roll-hit', 'Hit ' + i + (rw ? ', ' + rw : '') + ': ' + t + words), sum = 0;
    (Array.isArray(faces) ? faces : []).forEach(function(f) { sum += f; d.appendChild(document.createTextNode(' ')); d.appendChild(el('span', 'roll-die', String(f))); });
    if (Array.isArray(faces) && faces.length && typeof t === 'number' && t !== sum) d.appendChild(document.createTextNode(' ' + (t < sum ? '\u2212' : '+') + ' ' + Math.abs(t - sum)));
    wrap.appendChild(d);
}
// Stage 6 HUD H7: an apply action's card (a chat entry with m.apply = the cleaned record) — who, the tags, the action, then each change
// "Fatigue \u22123 \u2192 0"; text only
// Turn-based combat T2b: a reminder card — what is due, for whom and when, and Run (the sheet's own press: the GM's, or the player's through
// the host); once pressed here it says so. The GM's copy of a player's reminder has no button (theirs to press); nor has a pop-out window
// 1.6.3 (defense fold 1; Fulllion's decisions 1 and 5 of 2026-11-17): the buttons of an attack that carries its damage. On a defense card: Take it, the
// defender's own (a player's app asks the host, which judges it; off where the host is older and would not answer it), and No defense, the GM's, on their
// copy of a player's card and on their own card for an NPC. On the GM's copy of a player's damage card under the Combat tab's Both: Roll it now, which the
// host rolls as the attacker. bs: the card's other buttons, put out of reach with these once one is pressed. theirs: the GM's copy of a player's card
function landBtns(wrap, rec, m, bs, theirs) {
    var n = net(); if (!n || m.done || m.over) return;
    var host = n.role !== 'client', all = bs.slice();
    var mk = function(word, tip, go) {
        var x = el('button', 'tool chat-due-run chat-land', word); x.type = 'button'; x.title = tip; all.push(x);
        x.addEventListener('click', function() { if (m.done) return; m.done = true; all.forEach(function(y) { y.disabled = true; }); var ok = false; try { ok = go(); } catch (e) { ok = false; } if (!ok) { m.done = false; all.forEach(function(y) { y.disabled = false; }); } });
        wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(x); return x;
    };
    if (rec.why === 'resist') {
        if (host) mk('No defense', noDefTip(typeof n.landBy === 'function' ? n.landBy() : 'card'), function() { return typeof n.landNoDefense === 'function' && n.landNoDefense(rec.att); });
        else if (!theirs) { var tk = mk('Take it', 'Make no roll to resist it: the attack lands now, and its damage follows', function() { return typeof n.landTake === 'function' && n.landTake(rec.att); }); if (typeof n.landsOk === 'function' && !n.landsOk()) { tk.disabled = true; tk.title = 'The GM\u2019s Waypoint is older and cannot take this. Roll to resist it, or ask the GM'; } }
    } else if (rec.why === 'called' && theirs && host && (rec.now === 1 || (typeof n.landStuck === 'function' && n.landStuck(rec.att)))) mk('Roll it now', rec.now === 1 ? 'Roll this damage now, as the attacker, without waiting for their press' : 'Its player is not at the table. Roll this damage now, as the attacker', function() { return typeof n.landNow === 'function' && n.landNow(rec.att); });   // the review of fold 1: offered under any setting while the attacker's player is away, so the damage never waits with nobody to roll it
}
// 1.6.3 (found in a live two-peer check of the defense folds): what No defense says it does follows the Combat tab's When an attack lands (by, from
// net.landBy, the host's own rule: 'card', 'now' or 'both'), since under 'now' no card comes to the attacker at all. A player's Take it cannot know the rule,
// which is the GM's view alone, so its words say only that the damage follows
function noDefTip(by) {
    var lead = 'The attack lands now, with no roll to resist it. ';
    return lead + (by === 'now' ? 'Its damage is then rolled at once' : by === 'both' ? 'Its damage then comes to the attacker as a card, and your copy of it can roll it now' : 'Its damage then comes to the attacker as a card');
}
// 1.6.3 (defense fold 4; docs/DEFENSE_INTERACTIONS_DESIGN.md 4.3, backlog 243): the buttons of a card to send an attack on. Send it on aims it at the one this
// screen's player (or, for an NPC, the GM) points at now, and Turn it aside closes it with no roll; the host judges both from its own record (net.sendOn on the
// GM's machine, net.sendOnAsk from a player's app). theirs: the GM's copy of a player's card, which offers Turn it aside alone, so the player keeps the aim
function sendBtns(wrap, rec, m, theirs) {
    var n = net(); if (!n || m.done || m.over) return;
    var host = n.role !== 'client', all = [];
    var mk = function(word, tip, how) {
        var x = el('button', 'tool chat-due-run chat-land', word); x.type = 'button'; x.title = tip; all.push(x);
        x.addEventListener('click', function() { if (m.done) return; m.done = true; all.forEach(function(y) { y.disabled = true; }); var ok = false; try { ok = host ? typeof n.sendOn === 'function' && n.sendOn(rec.att, how) : typeof n.sendOnAsk === 'function' && n.sendOnAsk(rec.att, how); } catch (e) { ok = false; } if (!ok) { m.done = false; all.forEach(function(y) { y.disabled = false; }); } });
        wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(x); return x;
    };
    if (!theirs) mk('Send it on', 'Send the attack at the one you point at now. Its roll is made as you, from where you stand, and its damage stays the first attack\u2019s', 'send');
    else if (host && typeof n.sendStuck === 'function' && n.sendStuck(rec.att)) mk('Send it on', 'Its player is not at the table. Send the attack at the one you point at now: its roll is made as their character, from where it stands', 'send');   // the review of defense fold 4 (finding 6): while the defender's player is away
    mk('Turn it aside', 'Send it nowhere: the attack is stopped, with no roll', 'aside');
}
// 1.6.3 (defense fold 3; Fulllion's decision 8): on the GM's copy of a weapon test's card under the Combat tab's Both, Roll it now, which the host rolls as the
// weapon's owner (net.testNow). The mark is the GM's copy's alone (net.js postDue's gmX), never on the player's card
function testNowBtn(wrap, rec, m) {
    var n = net(); if (!n || m.done || m.over || n.role === 'client' || typeof n.testNow !== 'function') return;
    var x = el('button', 'tool chat-due-run chat-land', 'Roll it now'); x.type = 'button'; x.title = 'Roll this test now, as the weapon\u2019s owner, without waiting for their press';
    x.addEventListener('click', function() { if (m.done) return; m.done = true; x.disabled = true; var ok = false; try { ok = n.testNow(rec.att); } catch (e) { ok = false; } if (!ok) { m.done = false; x.disabled = false; } });
    wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(x);
}
function renderDue(m) {
    var rec = m.due, wrap = el('div', 'chat-roll chat-due whisper');
    var who = el('b', null, 'Due'); who.style.color = 'var(--gold)'; wrap.appendChild(who);
    if (rec.as) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(typeof asTag === 'function' ? asTag('for ', rec, wrap) : el('span', 'chat-tag', 'for ' + rec.as)); }
    wrap.appendChild(el('span', 'chat-time', chatTime(rec.ts)));
    wrap.appendChild(el('br'));
    var whD = rec.why === 'called' && rec.lnd === 1 ? (typeof landWhy === 'function' ? landWhy(rec) : 'the attack landed') : rec.why === 'called' ? (rec.by ? 'called for by ' + rec.by : 'called for') : rec.why === 'turn' ? 'the start of its turn' : rec.why === 'turnEnd' ? 'the end of its turn' : rec.why === 'cross' ? (typeof crossWhy === 'function' ? crossWhy(rec) : 'a value crossed a step') : rec.why === 'resist' ? (typeof resistWhy === 'function' ? resistWhy(rec) : 'resisting an attempt') : rec.why === 'send' ? (typeof sendWhy === 'function' ? sendWhy(rec) : 'your defense stopped the attack') : rec.why === 'major' ? (typeof dueMajor === 'function' ? dueMajor(rec) : 'a Major Wound') : rec.why === 'wound' ? 'a wound' : rec.hold === 1 ? 'waiting for their roll' : rec.why === 'blast' ? 'a blast' : 'round ' + rec.round;
    wrap.appendChild(el('div', 'roll-expr chat-due-what', (rec.label || (rec.roll === 1 ? 'A roll' : 'An action')) + (whD ? ' \u2014 ' + whD : '')));   // 1.6.0 (B2): an attempt to resist   // 1.6.0 (the core's gap 6): or a wound
    if (m.over) wrap.appendChild(el('div', 'chat-due-note', m.overSay === 'land' ? 'The attack landed, so this roll is over.' : m.overSay === 'rolled' ? 'Its damage was rolled.' : m.overSay === 'gone' ? 'That attack did not land, so this card is over.' : m.overSay === 'sent' ? 'It was sent on.' : m.overSay === 'aside' ? 'It was turned aside.' : m.overSay === 'missed' ? 'It was sent on, and missed.' : m.overSay === 'reload' ? 'The GM’s Waypoint reloaded, so this card is over.' : rec.hold === 1 ? (m.rolled ? 'Their roll is in.' : 'Applied.') : rec.why === 'resist' ? 'The GM applied it, so this roll is over.' : 'The blast went off, so this roll is over.'));   // 1.6.3 (defense fold 1): why a landing's card is over, in the host's fixed word
    else if (rec.theirs) { wrap.appendChild(el('div', 'chat-due-note', 'Its player presses it.')); if (rec.lnd === 1 && !window.wpPopout) landBtns(wrap, rec, m, [], true); if (rec.tnow === 1 && !window.wpPopout) testNowBtn(wrap, rec, m); if (rec.why === 'send' && !window.wpPopout) sendBtns(wrap, rec, m, true); }   /* 1.6.3 (defense fold 4): and Turn it aside on a card to send an attack on */   // 1.6.3 (defense fold 1): the GM's copy of a player's card offers No defense, or Roll it now
    else if (m.done) wrap.appendChild(el('div', 'chat-due-note', typeof m.doneSay === 'string' && m.doneSay ? m.doneSay : 'Pressed.'));   // 1.6.3 (finding 36): what the press did, where it is known
    else if (!window.wpPopout) {
        var spentD = rec.lnd !== 1 && window.wpSheets && window.wpSheets.dueBlock ? window.wpSheets.dueBlock(rec.charId, rec.act) : '';   /* 1.6.3: a landed attack's damage card spends nothing */   // 1.6.0 (the live test, 2026-10-30): it looked ready with none left. Grayed and said, never disabled: a card is not drawn again when a new turn gives them back, and the host judges the press
        if (spentD) { wrap.className += ' chat-due-spent'; wrap.appendChild(el('div', 'chat-due-note', spentD + '.')); }
        if (rec.why === 'send') { wrap.appendChild(el('div', 'chat-due-note', 'Point at who you send it to, then press Send it on.')); sendBtns(wrap, rec, m, false); return wrap; }   // 1.6.3 (defense fold 4)
        if (rec.why === 'blast') {   // 1.6.0 (the core's gap 8): its own dice of a blast, rolled by the host on the press (whiteboard.js wpBlastOwedPress)
            var bbW = rec.go === 1 ? 'Apply now' : 'Roll', bb = el('button', 'tool chat-due-run', bbW); bb.type = 'button'; bb.title = rec.hold === 1 ? 'Land the hold now, without their roll' : rec.go === 1 ? 'Let the blast go off now. Anyone who has not rolled takes it with no Defense' : 'Roll your own dice of this blast; the GM\u2019s machine rolls them and applies what gets through';   // 1.6.0: go, the GM's card that stops waiting for a blast's Defense rolls
            bb.addEventListener('click', function() { if (m.done) return; m.done = true; bb.disabled = true; bb.textContent = 'Pressed'; var ok = rec.hold === 1 ? !!(window.wpNet && typeof window.wpNet.holdGo === 'function' && window.wpNet.holdGo(rec.att)) : typeof window.wpBlastOwedPress === 'function' ? window.wpBlastOwedPress(rec.att) : false; if (!ok) { m.done = false; bb.disabled = false; bb.textContent = bbW; } });
            wrap.appendChild(bb); return wrap;
        }
        if (rec.why === 'resist' && Array.isArray(rec.or) && rec.or.length) {   // 1.6.0 (the core's gap 5; the owner: "A button each"): a button for each roll it may be resisted with; one press uses the card up
            var picks = [{ act: rec.act, label: rec.label || 'Roll' }].concat(rec.or), bs = []; if (rec.nm === 1) picks.shift();   // 1.6.0: nm, only the rows it offers
            picks.forEach(function(p) {
                var pb = el('button', 'tool chat-due-run', p.label || 'Roll'); pb.type = 'button'; pb.title = 'Resist with ' + (p.label || 'this roll') + ', as its button on the sheet rolls it'; bs.push(pb);
                pb.addEventListener('click', function() { if (m.done) return; m.done = true; bs.forEach(function(x) { x.disabled = true; }); var ok = (typeof duePress === 'function' ? duePress : function(rq, f) { return f(); })(rec, function() { return window.wpSheets && window.wpSheets.runDue ? window.wpSheets.runDue(rec.charId, p.act, rec.att, p.row, undefined, p.w) : false; });   /* 1.6.3 (defense fold 2): p.w, the row a roll answered with a row is pressed with; the review of input: duePress knows the card by its own id */ if (!ok) { m.done = false; bs.forEach(function(x) { x.disabled = false; }); } });   // done first: the press's own card redraws the chat
                wrap.appendChild(pb); wrap.appendChild(document.createTextNode(' '));
            });
            if (rec.lnd === 1) landBtns(wrap, rec, m, bs, false); return wrap;   // 1.6.3 (defense fold 1): and Take it, or No defense
        }
        var runW = rec.roll === 1 ? 'Roll' : 'Apply', b = el('button', 'tool chat-due-run', runW); b.type = 'button'; b.title = rec.roll === 1 ? 'Roll it now, as its button on the sheet does' : 'Apply it now, as its button on the sheet does';   // 1.5.9: a roll that is due; 1.6.3 (finding 36): an action's button says Apply
        b.addEventListener('click', function() { if (m.done) return; var cliD = typeof isClient === 'function' && isClient(); m.done = true; m.doneSay = rec.roll === 1 ? 'Rolled. Its card is below.' : cliD ? 'Sent.' : 'Applied.'; b.disabled = true; b.textContent = rec.roll === 1 ? 'Rolled' : cliD ? 'Sent' : 'Applied';   /* the review of rolls (finding 4): a player's app hands an action to the host, which may still refuse it, so it says Sent; the GM's own press lands at once */ var gotW = null; var ok = (typeof duePress === 'function' ? duePress : function(rq, f) { return f(); })(rec, function() { gotW = (function() { return rec.lnd === 1 && rec.why === 'called' && window.wpSheets && window.wpSheets.runLand ? window.wpSheets.runLand(rec.charId, rec.act, rec.att, rec.nm === 1 && Array.isArray(rec.or) && rec.or[0] ? rec.or[0].row : undefined) : window.wpSheets && window.wpSheets.runDue ? window.wpSheets.runDue(rec.charId, rec.act, typeof rec.att === 'string' ? rec.att : undefined, rec.why === 'called' && rec.nm === 1 && Array.isArray(rec.or) && rec.or[0] ? rec.or[0].row : undefined) : false; })(); return gotW; }); if (gotW === 'wait') m.doneSay = 'Answer what it asks, and it rolls.'; if (!ok) { m.done = false; m.doneSay = ''; b.disabled = false; b.textContent = runW; } });   // 1.6.3 (finding 36): the outcome said in place of Pressed; a press refused here, or later by the host (dueLive), makes the card live again   // 1.6.0 (the core's gaps 6 and 7): a blow's card names its record too   // done first: the press's own card redraws the chat
        wrap.appendChild(b); if (rec.lnd === 1 && rec.why === 'resist') landBtns(wrap, rec, m, [b], false);   // 1.6.3 (defense fold 1): and Take it, or No defense
    }
    return wrap;
}
// 1.6.2 Assist: a roll that waits for help. Who it is for and what it is, who has helped and with what, the help so far, and while it waits a Help button for
// each character this machine may help with (by each roll it may help by) and Roll for its roller and the GM. The host judges every press
function renderHelp(m) {
    var rec = m.help, wrap = el('div', 'chat-roll chat-help'), n = net();
    var who = el('b', null, 'Help'); who.style.color = 'var(--gold)'; wrap.appendChild(who);
    if (rec.as) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(typeof asTag === 'function' ? asTag('for ', rec, wrap) : el('span', 'chat-tag', 'for ' + rec.as)); }
    wrap.appendChild(el('span', 'chat-time', chatTime(rec.ts)));
    wrap.appendChild(el('br'));
    wrap.appendChild(el('div', 'roll-expr chat-help-what', (rec.label || 'A roll') + (rec.done ? (rec.why === 'left' ? ' was not rolled: its roller left.' : ' is rolled.') : ' waits for help.')));
    rec.lines.forEach(function(l) { wrap.appendChild(el('div', 'chat-help-line', l.n + ': ' + l.w)); });
    if (rec.lines.length || rec.cap) wrap.appendChild(el('div', 'chat-help-total', 'Help so far: ' + (rec.total > 0 ? '+' : rec.total < 0 ? '\u2212' : '') + Math.abs(rec.total) + (rec.cap ? ', at most +' + rec.cap : '')));
    if (rec.done || window.wpPopout) return wrap;
    var left = Math.max(0, Math.ceil((rec.ends - Date.now()) / 1000)); wrap.appendChild(el('div', 'chat-due-note', 'It rolls by itself ' + (left > 0 ? 'in ' + left + ' seconds' : 'now') + (rec.mine || rec.gm ? ', or press Roll.' : '.')));
    var can = Array.isArray(rec.can) ? rec.can : [], rolls = Array.isArray(rec.rolls) ? rec.rolls : null, bs = [];
    can.forEach(function(c) { (rolls && rolls.length ? rolls : [null]).forEach(function(r) {
        if (bs.length >= 12) return;
        var many = can.length > 1 || rec.gm === 1, w = r ? (many ? c.name + ': ' : 'Help with ') + r.label : many ? 'Help as ' + c.name : 'Help', b = el('button', 'tool chat-due-run chat-help-btn', w); b.type = 'button'; b.title = 'Help as ' + c.name + (r ? ', with ' + r.label : ''); bs.push(b);
        b.addEventListener('click', function() { if (m.pressed) return; m.pressed = true; bs.forEach(function(x) { x.disabled = true; }); var ok = n && typeof n.helpAct === 'function' ? n.helpAct(rec.id, 'help', c.id, r ? r.i : undefined) : false; if (!ok) { m.pressed = false; bs.forEach(function(x) { x.disabled = false; }); } });
        wrap.appendChild(b); wrap.appendChild(document.createTextNode(' '));
    }); });
    if (rec.mine || rec.gm) { var rb = el('button', 'tool chat-due-run chat-help-roll', 'Roll'); rb.type = 'button'; rb.title = 'Stop waiting for help and roll now'; rb.addEventListener('click', function() { rb.disabled = true; if (!(n && typeof n.helpAct === 'function' && n.helpAct(rec.id, 'roll'))) rb.disabled = false; }); wrap.appendChild(rb); }
    return wrap;
}
// 1.6.0 (the live test, 2026-10-30): whether a card still asks for a press on this machine: an Apply no one has pressed, or a Due card that is theirs. Table Chat raised by a roll stays up for it (net.js chatWaits)
function waits(m) {
    if (!m) return false;
    if (m.due) return !m.done && !m.over && !m.due.theirs && !window.wpPopout;
    if (m.roll && typeof m.roll.pend === 'number' && m.roll.pend > 0) { var nW = net(); return !!(nW && ((nW.myId && m.roll.from && m.roll.from.id === nW.myId) || !nW.active || nW.role === 'host')); }   // 1.6.2 (G5): held, its roller and the GM have something to press
    if (m.help) return !m.help.done && !window.wpPopout && (m.help.mine === 1 || m.help.gm === 1 || (Array.isArray(m.help.can) && m.help.can.length > 0));   // 1.6.2 Assist
    var rec = m.roll, dS = window.wpSheets; if (!rec || rec.dmg !== 1 || rec.dmgUsed === 1 || !m.res || !m.res.ok) return false;
    return !malfOf(rec, m.res) && !!(dS && typeof dS.damageOn === 'function' && dS.damageOn());
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
    if (rec.as && rec.as !== rec.from.name) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(typeof asTag === 'function' ? asTag('as ', rec, wrap) : el('span', 'chat-tag', 'as ' + rec.as)); }
    if (rec.on) { wrap.appendChild(document.createTextNode(' ')); wrap.appendChild(el('span', 'chat-tag', 'on ' + rec.on)); }   // 1.5.9 (book es/et plan, section 3): the character it was used on, as text
    wrap.appendChild(el('span', 'chat-time', chatTime(rec.ts)));
    wrap.appendChild(el('br'));
    wrap.appendChild(el('div', 'roll-expr', rec.label || 'Applied'));
    (Array.isArray(rec.asked) ? rec.asked : []).forEach(function(a) { if (a && typeof a.l === 'string' && typeof a.w === 'string') wrap.appendChild(el('div', 'roll-aim', a.l + ' ' + a.w)); });   // 1.6.2: what its presser answered
    var ls = el('div', 'apply-lines');
    rec.lines.forEach(function(l) {
        var s = el('span', 'apply-line'); s.appendChild(el('span', 'apply-n', l.n + ' '));
        if (typeof l.say === 'string') s.appendChild(el('span', 'apply-say', l.say));   // 1.6.2 (G7): a result table's words
        else if (l.fx === 1 || l.fx === 0) s.appendChild(el('span', 'apply-d ' + (l.fx ? 'apply-add' : 'apply-sub'), l.fx ? 'on' : 'off'));   // 1.6.0: an effect switched on or off
        else if (l.s === 1) s.appendChild(el('span', 'apply-d apply-add', l.mv === 1 ? 'moved row by row' : 'set'));   // 1.5.9: a value set on another character, with no figure
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
    if (window.wpDice3d) { try { window.wpDice3d.play(m); } catch (e) {} }   // 1.6.2, backlog 212: the dice tumble and land on the faces the roll gave, as this computer's setting says
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
    var hd = typeof document !== 'undefined' && document && typeof document.querySelector === 'function' ? document.querySelector('header') : null, top = hd ? hd.getBoundingClientRect().bottom : 0, h = p.offsetHeight || 0;
    if (r && h && h > r.top - 16 - top) { p.style.right = Math.max(8, window.innerWidth - r.left + 8) + 'px'; p.style.bottom = Math.max(8, window.innerHeight - r.bottom) + 'px'; }   // 1.6.2 (backlog 59 i): where it does not fit above Table Chat, as in a short window, it stands beside it
    else if (r) { p.style.right = Math.max(8, window.innerWidth - r.right) + 'px'; p.style.bottom = Math.max(8, window.innerHeight - r.top + 8) + 'px'; }
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
    if (typeof hideSync === 'function') hideSync();   // 1.6.3: the box shows Hide my rolls on the GM's machine
}
// 1.6.3 (Fulllion, 2026-11-19: "players should only be able to hide rolls when the GM allows it. that recommendation can appear in the window if the gm
// allows it in the campaign"): whether this machine may send a roll to the GM alone. The GM's own machine always may (Hide my rolls). A player's app
// reads the campaign's Players may hide rolls as its host sent it (camp.turnRules.hideRolls, true only, net.js hideRollsOk), and the host judges it
// again at every roll, refusing a hidden roll while it is off. Read by hideSync (the roller's box), roll() and the ± window
function hideAllowed() { if (!isClient()) return true; var c = typeof getActiveCampaign === 'function' ? getActiveCampaign() : null; return !!(c && c.turnRules && typeof c.turnRules === 'object' && c.turnRules.hideRolls === true); }
var HIDE_OFF_WORDS = 'Your GM has not allowed hidden rolls at this table. Roll it for everyone.';
// [dicecheck:hiderolls-start]
// 1.6.3 (Fulllion, 2026-11-19: "we should have a way for the GM to easily hide or unhide rolls"; his pick by prompt: "One switch, plus per NPC"). Hide my
// rolls is the GM's one switch, the eye button at the top of Table Chat: while it is on, every roll the GM's machine makes is private, whatever made it (the
// roller's typed rolls and Coin, every sheet and HUD roll, the ± window, a page's inline dice, a card the GM presses, initiative and a side's initiative, a
// thing in flight arriving). net.js net.diceRoll reads the switch itself through hidden() below (the review of 2026-11-19, finding 2), since some of those
// rolls never pass through roll(). Two kinds of roll are left out of it (finding 3): one made as a player's character, which is that player's to see, and
// one that follows a player's own press (a line's damage). It is ONE state with the roller's Private box on the GM's machine, so the two can never
// disagree: the box shows the switch, and ticking the box sets the switch. On a player's app the box is To the GM only and the switch is not there. The
// switch is this computer's own and each campaign's (wp_hideRolls: { campaign id: true }, read back as data through hideClean, the newest HIDE_MAX), never
// sent: the host reads it on its own machine, and a roll the host keeps private for a reason of its own stays so whatever it says
var HIDE_KEY = 'wp_hideRolls', HIDE_MAX = 200, HIDE_ID = /^[A-Za-z0-9_-]{1,64}$/;
function hideClean(raw) {
    var out = {}; if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    var ks = Object.keys(raw).filter(function(k) { return raw[k] === true && HIDE_ID.test(k) && k !== '__proto__'; });
    ks.slice(-HIDE_MAX).forEach(function(k) { out[k] = true; });   // the newest, which a write puts last
    return out;
}
function hideRead() { try { return hideClean(JSON.parse(localStorage.getItem(HIDE_KEY) || '{}')); } catch (e) { return {}; } }
function hideCampId() { var c = typeof getActiveCampaign === 'function' ? getActiveCampaign() : null; return c && typeof c.id === 'string' && HIDE_ID.test(c.id) ? c.id : ''; }
// Whether this machine hides the GM's rolls now: never on a player's app or in the stream window
function hidden() { var n = net(); if (isClient() || (n && n.stream) || window.wpStream) return false; var id = hideCampId(); return !!id && Object.prototype.hasOwnProperty.call(hideRead(), id); }
// The switch pressed (or the Private box ticked) on the GM's machine: kept for the campaign on screen, the newest HIDE_MAX campaigns. Answers what it is now
function setHidden(on) {
    var n = net(); if (isClient() || (n && n.stream)) return false; var id = hideCampId(); if (!id) return false;
    var all = hideRead(); delete all[id]; if (on) all[id] = true;
    var ks = Object.keys(all); while (ks.length > HIDE_MAX) delete all[ks.shift()];
    setPref(HIDE_KEY, JSON.stringify(all));
    if (window.wpStepLog) window.wpStepLog('hiderolls v1', 'switch', { on: !!on });
    hideSync(); return !!on;
}
// Everything that shows the switch, drawn from the one state: the switch itself, the Private box, and the mark on the Table Chat button. Writes only what
// changed, so main.js render() may ask it at every redraw. A player's app shows no switch and no mark, and a box this machine ticked as the GM is
// unticked once it sits at someone else's table, so that it never sends their rolls to the GM by the GM's own setting
var _hidePrivGm = false;
// A tooltip that changes while the page runs is kept in data-tip, which tooltips.js shows, and written only when its words change (the review of
// 2026-11-19, finding 6): tooltips.js moves a title into data-tip at the first hover, so comparing with title wrote it again at every redraw, and a
// browser's own bubble could show beside the app's. A page with no dataset (a suite's plain objects) keeps a title
function hideTip(el, words) {
    if (!el) return;
    if (el.dataset) { if (el.dataset.tip === words) return; el.dataset.tip = words; if (typeof el.removeAttribute === 'function') el.removeAttribute('title'); return; }
    if (el.title !== words) el.title = words;
}
function hideSync() {
    var on = hidden(), gmSide = !isClient(), b = ui('chatHideRolls'), mk = ui('chatHideMark'), cb = ui('chatBtn'), pv = ui('dicePriv');
    if (b) {
        var disp = gmSide && !window.wpStream ? '' : 'none'; if (b.style.display !== disp) b.style.display = disp;
        if (b.classList.contains('on') !== on) b.classList.toggle('on', on);
        var pr = on ? 'true' : 'false'; if (b.getAttribute('aria-pressed') !== pr) b.setAttribute('aria-pressed', pr);
        hideTip(b, on ? 'Your rolls are hidden: only you see them. Press to roll for the table again' : 'Hide my rolls: every roll you make stays private until you press this again. A roll made as a player’s character still goes to the table');
    }
    if (mk) { var md = on ? '' : 'none'; if (mk.style.display !== md) mk.style.display = md; }
    if (cb) hideTip(cb, on ? 'Table chat. Your rolls are hidden' : 'Table chat');
    if (pv) { if (gmSide) { if (pv.checked !== on) pv.checked = on; _hidePrivGm = true; } else if (_hidePrivGm) { pv.checked = false; _hidePrivGm = false; } }
    var plb = ui('dicePrivLbl'), okH = gmSide || typeof hideAllowed !== 'function' || hideAllowed();   // 1.6.3: a player's To the GM only shows only where the GM allows hidden rolls, and is unticked where not
    if (plb && plb.style) { var pd = okH ? '' : 'none'; if (plb.style.display !== pd) plb.style.display = pd; }
    if (pv && !okH && pv.checked) pv.checked = false;
}
// [dicecheck:hiderolls-end]
// 1.6.2 (the viewing, a player at the table): the first of these characters whose token stands, seated, on the map on screen, else null
function charOnMap(camp, list) {
    var m = camp && camp.items && typeof camp.activeItemId === 'string' && Object.prototype.hasOwnProperty.call(camp.items, camp.activeItemId) ? camp.items[camp.activeItemId] : null, wb = m && Array.isArray(m.whiteboard) ? m.whiteboard : [];
    for (var i = 0; i < wb.length; i++) { var w = wb[i]; if (w && typeof w.charId === 'string' && !w.waiting && list.some(function(c) { return c.id === w.charId; })) return w.charId; }
    return null;
}
// The character picker (character sheets, 1.5.0): a player's own characters, any of the campaign's for the GM; hidden when there are none
function syncChars() {
    var s = ui('diceChar'); if (!s) return;
    var sh = window.wpSheets, list = sh && sh.charList ? sh.charList() : [], n = net(), me = n ? n.myId : null;
    if (isClient()) list = list.filter(function(c) { return c.ownerId && c.ownerId === me && !c.partial && !c.npc && c.making !== 1; });   // Onboarding F3: not one still in the making
    var was = s.value; s.textContent = '';
    var none = el('option', null, 'No character'); none.value = ''; s.appendChild(none);
    list.forEach(function(c) { var o = el('option', null, c.name + (c.npc ? ' (NPC)' : '')); o.value = c.id; s.appendChild(o); });
    if (!was && isClient() && list.length) { var SC = window.wpSystemCore, camp = getActiveCampaign(), pl = SC && typeof SC.activeCharOf === 'function' && camp ? SC.activeCharOf(camp, me).id : null; if (!list.some(function(c) { return c.id === pl; })) pl = charOnMap(camp, list); was = list.some(function(c) { return c.id === pl; }) ? pl : list.length === 1 ? list[0].id : ''; }   // 1.6.2: a player's roller starts on the character they play
    s.value = list.some(function(c) { return c.id === was; }) ? was : '';
    s.style.display = list.length && (!window.wpVtt || window.wpVtt.on('sheets')) ? '' : 'none';
}
// A roll from a sheet button (sheets.js) or the combat roster: the picker follows, the card carries the label and the character
var _rollMore = null;   // 1.5.8 explosives: what rollFor hands the next roll beside its own words, taken once
function rollFor(charId, expr, label, opts) {
    opts = opts || {};
    var popS = typeof window !== 'undefined' && window && window.wpPopout ? window.wpPopoutSheet : null;   // 1.6.3 (finding 25): a sheet in a window of its own: the main window rolls it as its own press (sheets.js popSheetDo)
    if (popS && typeof popS.send === 'function' && popS.send('roll', [charId, expr, label, opts])) return { ok: true, sent: true };
    var s = ui('diceChar'); if (s && panelOpen()) { syncChars(); if (Array.prototype.some.call(s.options, function(o) { return o.value === charId; })) s.value = charId; }
    _rollMore = opts.range || opts.blast || opts.used === true || opts.cross || typeof opts.tok === 'string' ? { range: opts.range || undefined, blast: opts.blast || undefined, used: opts.used === true ? true : undefined, usedWait: opts.usedWait === true ? true : undefined, cross: opts.cross && typeof opts.cross === 'object' ? opts.cross : undefined, tok: typeof opts.tok === 'string' && opts.tok ? opts.tok : undefined } : null;   // 1.6.3 (finding 3): tok, the token a roll is made for (the roster's row), whose name its card wears   // 1.5.8 explosives: a throw's range to its aim, the blast a damage roll is for (this machine's own words); 1.5.9: a damage roll already applied as it is rolled (a blast's fragmentation)
    var cardF = typeof dueTake === 'function' ? dueTake(charId) : '';   // the review of input: the card whose press this roll is (duePress), so a roll refused or never answered makes that card live again
    var r = roll(expr, { card: cardF || undefined, aim: opts.aim && typeof opts.aim === 'object' ? opts.aim : undefined, by: typeof opts.by === 'string' && opts.by ? opts.by : undefined, on: typeof opts.on === 'string' && opts.on ? opts.on : undefined, priv: !!opts.priv, gmOnly: !!opts.gmOnly, hit: typeof opts.hit === 'string' && opts.hit ? opts.hit : undefined, ask: opts.ask && typeof opts.ask === 'object' ? opts.ask : undefined, charId: charId, label: label, source: opts.source || 'sheet', src: opts.src || undefined, fr: opts.fr || undefined, sw: opts.sw || undefined, hide: opts.hide === true ? true : undefined /* 1.6.3: a player's To the GM, picked in the ± window */, row: opts.row || undefined, act: opts.act || undefined, mod: opts.mod || undefined, modD: typeof opts.modD === 'string' && opts.modD ? opts.modD : undefined, adv: opts.adv || undefined, hm: opts.hm && typeof opts.hm === 'object' ? opts.hm : undefined, dmg: opts.dmg === true ? true : undefined });   // the review of words: hm, what was added by hand to a roll that is not named, words for its card alone   // row (F5b): a roll on a list's row; act/mod/adv (R1): a roll with consequences   // gmOnly: a roll made of GM-only data (net.diceRoll keeps it the host's)   // 1.5.9: on, the token of the adjacent character it is used on
    if (r.error) toast(r.error);
    _rollSeq++; _rollLast = r;   // 1.6.3 (finding 6): what the last roll asked for answered, for a card that pressed a sheet's button (lastRoll)
    if (cardF && r && r.error) { var nC = net(); if (nC && typeof nC.dueLive === 'function') nC.dueLive(cardF); }   // refused here, after its card's press: the card is live again
    return r;
}
var _rollSeq = 0, _rollLast = null;
function lastRoll() { return { n: _rollSeq, r: _rollLast }; }
// [netrollcheck:duecard-start]
// 1.6.3 (the review of input): a card pressed whose roll never happens is live again, whatever card it is. A defense card names its attempt, but a reminder
// (its turn, a round, an effect's end) names none, so a card is known by its own id (rec.id). duePress runs a card's press with the card noted as the
// one under way (_dueCard); the first roll this machine makes for that character takes it (dueTake, from rollFor) and carries it to net.diceRoll as card,
// which keeps it with the request, so the host's refusal or no answer at all makes that card live again (net.js dueLive). A press that rolled nothing yet
// because its button asks first (a location, a level, what a roll asks, an aim on the map: sheets.js runDue answers 'wait') is watched: once nothing is
// asked any more (sheets.js rollAsking) and no roll came, or after DUE_WAIT_MS, the card is live again. Nothing of it is sent
var _dueCard = null, DUE_WAIT_MS = 120000, DUE_LOOK_MS = 400;
function duePress(rec, call) {
    var dc = { id: rec && typeof rec.id === 'string' ? rec.id : '', charId: rec ? rec.charId : '', took: false, at: Date.now() }; _dueCard = dc;
    var ok = false; try { ok = call(); } catch (e) { ok = false; }
    if (ok === 'wait' && !dc.took && _dueCard === dc && dc.id) { dueWatch(dc); return true; }   // its roll comes later: the card stays pressed while it is asked
    if (_dueCard === dc) _dueCard = null;
    return !!ok;
}
function dueWatch(dc) {
    var look = function() {
        if (_dueCard !== dc || dc.took) return;   // its roll came, or another card was pressed since
        var sh = typeof window !== 'undefined' ? window.wpSheets : null, asking = !!(sh && typeof sh.rollAsking === 'function' && sh.rollAsking());
        if (asking && Date.now() - dc.at < DUE_WAIT_MS) { setTimeout(look, DUE_LOOK_MS); return; }
        _dueCard = null; var n = net(); if (n && typeof n.dueLive === 'function') n.dueLive(dc.id);   // put away with no roll: the card is live again
    };
    setTimeout(look, DUE_LOOK_MS);
}
function dueTake(charId) { var dc = _dueCard; if (!dc || dc.took || !dc.id || dc.charId !== charId) return ''; dc.took = true; _dueCard = null; return dc.id; }
// [netrollcheck:duecard-end]
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
// the roll's swRef first (act, row with its index, fr); any other its formula alone, as before.
// The review of words (the improvement week's review of sheets and rolls): a roll changed by hand is NOT named for that alone. Naming it made the
// host judge it as its entry (Off a character's turn refusing or reporting it, card actions holding it for Accept) where the same roll pressed
// plainly went through, since a plain roll's button names nothing. Such a roll still goes as its formula alone, which already holds the change,
// and what was added by hand rides beside it as hm, words for its card alone ({ v, adv }, cleaned by dicecore cleanHmod on both machines), which
// the host puts on the record as hmod and no rule reads. Dice added show in the formula itself, so they are not in hm
function modOpts(opts, mod, advMode, pk, rf, md) {   // rf: the roll's swRef; md (1.6.2): the dice the window adds
    var o = opts, named = !!(opts && (opts.act || opts.fr || (opts.row && typeof opts.row.i === 'number')));
    if (pk && pk.length && !named && rf && typeof rf === 'object') { o = Object.assign({}, opts || {}); if (typeof rf.r === 'string') o.act = rf.r; else if (typeof rf.f === 'string') o.fr = rf.f; else if (typeof rf.l === 'string' && typeof rf.row === 'string' && typeof rf.i === 'number') o.row = { f: rf.l, r: rf.row, i: rf.i }; named = !!(o.act || o.fr || o.row); }
    if (named) return Object.assign({}, o, { mod: mod || undefined, modD: md || undefined, adv: advMode !== 'normal' ? advMode : undefined, sw: pk && pk.length ? pk : undefined });
    var hm = mod || (advMode && advMode !== 'normal') ? { v: mod || undefined, adv: advMode && advMode !== 'normal' ? advMode : undefined } : null;
    return hm ? Object.assign({}, opts || {}, { hm: hm }) : opts;
}
function rollWithMod(charId, expr, label, opts, anchor, swRef) {   // swRef (1.6.0): which roll this is ({ f } | { r } | { l, row, i }), for its roll switches
    var Fm = F(); closeModPop();
    if (!Fm || !Fm.parse) return rollFor(charId, expr, label, opts);
    var mod = 0, modD = '', advMode = 'normal', numEl, prevEl, advBtns = {}, dIn = null, dSay = null;   // 1.6.2: modD, dice added, as cleanDiceBonus writes them
    var canAdv = withAdvantage(expr, 'adv', Fm.parse).ok;   // a lone plain die can roll twice keep best/worst
    var pop = el('div', 'dice-modpop'); modPop = pop;
    pop.appendChild(el('div', 'dice-modpop-title', label ? 'Roll ' + label : 'Roll with a modifier'));
    // 1.6.0 roll switches (the owner, by prompt: "In the ± window"): the bonuses this character's items and effects offer this roll, each a
    // tick, off at first; the host checks each one ticked is really the character's (systemcore swJudge)
    var swAv = swRef && typeof swRef === 'object' && window.wpSheets && typeof window.wpSheets.rollSwitchesFor === 'function' ? window.wpSheets.rollSwitchesFor(charId, swRef) : [], swOn = {}, swBtns = [];
    if (!Array.isArray(swAv)) swAv = [];
    function swSum() { return swAv.reduce(function(s, w) { return s + (swOn[w.s + '#' + w.i] ? w.v : 0); }, 0); }
    function swDice() { return swAv.reduce(function(s, w) { return s + (swOn[w.s + '#' + w.i] && typeof w.d === 'string' ? w.d : ''); }, ''); }   // 1.6.2: their dice, in the order offered (as the host adds them)
    if (swAv.length) {
        var swBox = el('div', 'dice-modsw'); swBox.appendChild(el('div', 'dice-modsw-cap', 'Bonuses you may add'));
        swAv.forEach(function(w) {
            var k = w.s + '#' + w.i, b = el('button', 'tool ghost dice-swbtn'); b.type = 'button'; b.setAttribute('aria-pressed', 'false');
            b.appendChild(el('span', 'dice-swbtn-n', w.name)); b.appendChild(el('span', 'dice-swbtn-v', bonusWords(w.v, w.d)));
            b.title = 'Add ' + w.name + ' to this roll'; if (w.cost) { b.appendChild(el('span', 'dice-swbtn-c', w.cost)); b.title += '. Ticking it costs this as you roll: ' + w.cost; } b.addEventListener('click', function() { swOn[k] = !swOn[k]; refresh(); });
            swBtns.push([b, k]); swBox.appendChild(b);
        });
        pop.appendChild(swBox);
    }
    function applied() {   // advantage first (rewrites the die), then the flat modifier
        var base = expr;
        if (advMode !== 'normal') { var a = withAdvantage(expr, advMode, Fm.parse); if (a.ok) base = a.expr; }
        return composeModifier(base, mod + swSum(), Fm.parse, modD + swDice());   // 1.6.0: and the roll switches ticked; 1.6.2: and the dice added
    }
    function prevWords(x) {   // 1.6.2: plain dice as they stand, and a roll that reads the sheet in words: its name and what was added
        if (!Fm.plainDice || (Fm.plainDice(x) && !(typeof Fm.names === 'function' && Fm.names(x).length))) return x;   // 1.6.2: a roll that reads a name is said by its own, never by the name
        var n = mod + swSum(), dd = modD + swDice(), w = [label || 'This roll']; if (n || dd) w.push(bonusWords(n, dd)); if (advMode !== 'normal') w.push(advMode === 'adv' ? 'with advantage' : 'with disadvantage'); return w.join(' ');
    }
    function refresh() { swBtns.forEach(function(p) { p[0].classList.toggle('on', !!swOn[p[1]]); p[0].setAttribute('aria-pressed', swOn[p[1]] ? 'true' : 'false'); }); if (numEl.setValue) numEl.setValue(mod); else numEl.textContent = (mod > 0 ? '+' : '') + mod; var r = applied(); prevEl.textContent = prevWords(r.ok ? r.expr : expr); if (canAdv) ['dis', 'normal', 'adv'].forEach(function(m) { advBtns[m].classList.toggle('on', advMode === m); }); }
    if (canAdv) {
        var advRow = el('div', 'dice-modadv'), advSeg = advRow.appendChild(el('span', 'ui-seg ui-seg-wide'));   /* 1.6.2 (backlog 225): the three in one frame, equal thirds */
        [['dis', 'Disadvantage', 'Dis'], ['normal', 'Normal', 'Normal'], ['adv', 'Advantage', 'Adv']].forEach(function(m) { var b = el('button', 'tool ghost dice-advbtn', m[2]); b.title = m[1] + ' (roll twice, keep the ' + (m[0] === 'dis' ? 'worse' : m[0] === 'adv' ? 'better' : 'roll as written') + ')'; b.addEventListener('click', function() { advMode = m[0]; refresh(); }); advBtns[m[0]] = b; advSeg.appendChild(b); });
        pop.appendChild(advRow);
    }
    var chips = el('div', 'dice-modpop-chips'), chipSeg = chips.appendChild(el('span', 'ui-seg ui-seg-wide'));   /* 1.6.2 (backlog 225): the quick chips in one frame */
    [['−5', -5], ['+5', 5]].forEach(function(q) { var b = el('button', 'tool ghost dice-modchip', q[0]); b.addEventListener('click', function() { mod = clampMod(mod + q[1]); refresh(); }); chipSeg.appendChild(b); });   // 1.6.3 (finding 31; Fulllion's pick): the big steps alone, since the counter below steps by one
    pop.appendChild(chips);
    var numRow = el('div', 'dice-modpop-num');
    var Ud = (typeof window !== 'undefined' && window.wpUi && window.wpUi.step ? window.wpUi : null);   // 1.6.2: the app's own counter, the modifier typed
    if (Ud) { numEl = Ud.step({ value: 0, min: -99, max: 99, label: 'Modifier', lessTip: 'One less', moreTip: 'One more', valCls: 'dice-modpop-in', set: function(n) { mod = clampMod(n); refresh(); } }); numRow.appendChild(numEl); if (numEl.input) numEl.input.addEventListener('keydown', function(e) { if (e.key === 'Enter' && !e.isComposing) go.click(); }); }   // 1.6.3 (finding 4): Enter in the modifier rolls, as Enter in Dice to add does (the counter's own Enter has handed the figure on first)
    else {
    var minus = el('button', 'tool ghost dice-modpm', '−'); minus.title = 'One less'; minus.addEventListener('click', function() { mod = clampMod(mod - 1); refresh(); });
    numEl = el('span', 'dice-modpop-val', '0');
    var plus = el('button', 'tool ghost dice-modpm', '+'); plus.title = 'One more'; plus.addEventListener('click', function() { mod = clampMod(mod + 1); refresh(); });
    numRow.appendChild(minus); numRow.appendChild(numEl); numRow.appendChild(plus);
    }
    pop.appendChild(numRow);
    // 1.6.2 dice as bonuses (the owner: "A GM often calls for a one-off die ('+1d6 for the high ground')"): dice to add, typed as a table says them
    var dRow = el('label', 'dice-moddice'); dRow.appendChild(el('span', 'dice-moddice-cap', 'Dice to add'));
    dIn = el('input', 'field dice-moddice-in'); dIn.type = 'text'; dIn.maxLength = 40; dIn.placeholder = '+1d6'; dIn.title = 'Dice added to this roll, such as +1d6 or +1d6 \u2212 1d4. They add to its total and never make a critical'; dIn.setAttribute('autocomplete', 'off');
    dIn.addEventListener('input', function() { var v = cleanDiceBonus(dIn.value); modD = v || ''; dSay.textContent = v === null ? 'Write dice as 1d6, or +1d6 \u2212 1d4: up to 4, each up to 20 dice.' : ''; refresh(); });
    dIn.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); go.click(); } });
    dRow.appendChild(dIn); pop.appendChild(dRow); dSay = el('div', 'dice-moddice-say', ''); dSay.setAttribute('aria-live', 'polite'); pop.appendChild(dSay);
    prevEl = el('div', 'dice-modpop-prev', ''); pop.appendChild(prevEl);
    // 1.6.3 (Fulllion: "that recommendation can appear in the window if the gm allows it in the campaign"): on a player's app where the GM allows hidden
    // rolls, how this roll goes, for everyone (the default) or to the GM alone, in one joined pair; it starts as the roller's To the GM only box stands
    var toGm = false, howBtns = null;
    if (isClient() && typeof hideAllowed === 'function' && hideAllowed()) {
        var pvM = ui('dicePriv'); toGm = !!(pvM && pvM.checked);
        var howRow = el('div', 'dice-modhow'), howSeg = howRow.appendChild(el('span', 'ui-seg ui-seg-wide')); howBtns = {};
        [['all', 'Everyone', 'The whole table sees this roll'], ['gm', 'To the GM', 'Only you and the GM see this roll']].forEach(function(h) { var b = el('button', 'tool ghost dice-howbtn', h[1]); b.type = 'button'; b.title = h[2]; b.addEventListener('click', function() { toGm = h[0] === 'gm'; howSync(); }); howBtns[h[0]] = b; howSeg.appendChild(b); });
        pop.appendChild(howRow);
    }
    function howSync() { if (!howBtns) return; ['all', 'gm'].forEach(function(k) { var on = (k === 'gm') === toGm; howBtns[k].classList.toggle('on', on); howBtns[k].setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
    howSync();
    var go = el('button', 'tool dice-modpop-go', 'Roll'); go.addEventListener('click', function() { if (numEl && typeof numEl.flush === 'function') numEl.flush(); var r = applied();   /* 1.6.3 (finding 4): the modifier typed and not yet handed on counts */ if (dIn && cleanDiceBonus(dIn.value) === null) { toast('Write the dice to add as 1d6, or +1d6 \u2212 1d4.'); dIn.focus(); return; } if (!r.ok) { toast('That roll cannot take that change.'); return; } closeModPop(); var moR = modOpts(opts, mod, advMode, swAv.filter(function(w) { return swOn[w.s + '#' + w.i]; }).map(function(w) { return { s: w.s, i: w.i }; }), swRef, modD); rollFor(charId, r.expr, label, toGm ? Object.assign({}, moR || {}, { hide: true }) : moR); });   // 1.6.3: To the GM, picked in this window   // R1: a roll with consequences sends its modifier and advantage as data
    pop.appendChild(go);
    document.body.appendChild(pop);
    var rct = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: 120, top: 120, bottom: 140 };
    var pw = pop.offsetWidth, ph = pop.offsetHeight;
    var left = Math.max(8, Math.min(window.innerWidth - pw - 8, rct.left));
    var top = rct.bottom + 6; if (top + ph > window.innerHeight - 8) top = Math.max(8, rct.top - ph - 6);
    pop.style.left = left + 'px'; pop.style.top = top + 'px';
    refresh();
    setTimeout(function() { document.addEventListener('pointerdown', onModOutside, true); document.addEventListener('keydown', onModKey, true); var inM = numEl && numEl.input; if (inM && typeof inM.focus === 'function') { inM.focus(); if (typeof inM.select === 'function') inM.select(); } else go.focus(); }, 0);   // 1.6.3 (finding 31): the modifier's own box takes the focus, so a figure is typed at once and Enter rolls
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
// roll(expr, { priv, hide }) — the one entry point for the roller, the chat commands and the console's /table. hide (1.6.3): hidden by choice, which the
// host may show to the table later. On a player's app it is their To the GM only. On the GM's machine it is /gmroll's word alone (source 'chat'): the
// roller's Private box, Coin and a page's inline dice send their box, and that box IS Hide my rolls, which net.diceRoll reads itself, leaving out a roll
// made as a player's character (the review of 2026-11-19, findings 2 and 3). priv: kept private for a reason
function roll(expr, opts) {
    opts = opts || {};
    var more = typeof _rollMore !== 'undefined' ? _rollMore : null; if (more) _rollMore = null;   // taken at once: a roll refused below leaves nothing for the next (asked through typeof: a suite runs roll alone)
    var n = net(); if (!n || !n.diceRoll) return { error: 'Dice are not available.' };
    lastSource = opts.source || 'panel';
    var clean = cleanExpr(expr);
    if (!clean) return { error: 'Type a formula, for example 2d6 + 3 (up to ' + LIMITS.expr.toLocaleString('en-US') + ' characters).' };
    if (opts.hide === true && isClient() && typeof hideAllowed === 'function' && !hideAllowed()) return { error: HIDE_OFF_WORDS };   // 1.6.3: /gmroll and a stale tick on a player's app, while the GM allows no hidden rolls (the host refuses one too)
    var r = n.diceRoll(clean, { card: typeof opts.card === 'string' && opts.card ? opts.card : undefined, aim: opts.aim && typeof opts.aim === 'object' ? opts.aim : undefined, by: opts.by || undefined, priv: !!opts.priv, gmOnly: !!opts.gmOnly, hit: typeof opts.hit === 'string' && opts.hit ? opts.hit : undefined, ask: opts.ask && typeof opts.ask === 'object' ? opts.ask : undefined, charId: opts.charId || undefined, label: opts.label || undefined, src: opts.src || undefined, fr: opts.fr || undefined, sw: opts.sw || undefined, row: opts.row || undefined, act: opts.act || undefined, mod: opts.mod || undefined, modD: typeof opts.modD === 'string' && opts.modD ? opts.modD : undefined, adv: opts.adv || undefined, hm: opts.hm && typeof opts.hm === 'object' ? opts.hm : undefined, dmg: opts.dmg === true ? true : undefined, on: typeof opts.on === 'string' && opts.on ? opts.on : undefined, range: more ? more.range : undefined, blast: more ? more.blast : undefined, used: more && more.used === true ? true : undefined, usedWait: more && more.usedWait === true ? true : undefined, cross: more && more.cross ? more.cross : undefined, tok: more && typeof more.tok === 'string' ? more.tok : undefined, hide: opts.hide === true && (isClient() || opts.source === 'chat') ? true : undefined, typed: opts.typed === true ? true : undefined });   // dmg: this machine's own word (a thrown item's damage); the wire never carries it
    if (!r.error && !opts.row && !opts.coin) remember(clean);   // Stage 6 F5b: a row roll is not remembered (its Row.* names need its row)
    return r;
}
// 1.6.2: the Coin button, as the roller's own character and Private tick say
function coinFromPanel() {
    var r = roll('1d2', { label: 'Coin flip', coin: true, hide: !!(ui('dicePriv') && ui('dicePriv').checked), source: 'panel', charId: ui('diceChar') && ui('diceChar').value || undefined });
    clearErr(); if (r.error) showErr(r.error, '', 0, 0);
}
function rollFromPanel() {
    var f = ui('diceExpr'); if (!f) return;
    var expr = f.value, priv = !!(ui('dicePriv') && ui('dicePriv').checked), charId = ui('diceChar') && ui('diceChar').value || undefined;
    clearErr();
    var r = roll(expr, { hide: priv, typed: true, source: 'panel', charId: charId });   // 1.6.3 (finding 26): typed, which its card says   // 1.6.3: the box is a choice, which the host may let the GM show later
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
    hideSync();   // 1.6.3: a session that starts or ends changes who this machine is
}
(function wire() {
    var b = ui('diceBtn'), p = ui('dicePanel'); if (!b || !p) return;
    b.addEventListener('click', function() { if (panelShown()) { if (typeof window.wpBoxFront === 'function' && window.wpBoxFront(p)) return; closePanel(); } else openPanel(); });   // 1.6.2: a roller under a box opened after it comes in front first
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
        if (e.target.closest && e.target.closest('button[data-coin]')) { coinFromPanel(); return; }
        var q = e.target.closest && e.target.closest('button[data-die], button[data-op]'); if (!q || !f) return;
        var cur = f.value.trim();
        if (q.dataset.die) f.value = cur ? cur + ' + ' + q.dataset.die : q.dataset.die;
        else if (q.dataset.op) f.value = cur ? cur + ' ' + q.dataset.op + ' ' : '';
        f.focus();
    });
    var sc = ui('diceSoundChk'); if (sc) sc.addEventListener('change', function() { setPref('wp_diceSound', sc.checked ? 'on' : 'off'); });
    var hb2 = ui('chatHideRolls'); if (hb2) hb2.addEventListener('click', function() { setHidden(!hidden()); });   // 1.6.3: Hide my rolls
    var pvB = ui('dicePriv'); if (pvB) pvB.addEventListener('change', function() { if (!isClient()) setHidden(pvB.checked); });   // ... which the GM's Private box is too
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
window.wpDice = { hidden: hidden, setHidden: setHidden, hideSync: hideSync, hideClean: hideClean, waits: waits, roll: roll, rollFor: rollFor, rollWithMod: rollWithMod, syncChars: syncChars, renderCard: renderCard, renderApply: renderApply, renderDue: renderDue, renderHelp: renderHelp, line: line, landed: landed, onDeny: onDeny, onRolled: onRolled, lastRoll: lastRoll, openPanel: openPanel, closePanel: closePanel, sync: sync, LIMITS: LIMITS, history: function() { return history.slice(); } };
