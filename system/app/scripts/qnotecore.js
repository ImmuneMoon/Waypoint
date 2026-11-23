/* qnotecore.js — 1.6.4, a Notes page on every character sheet (Fulllion, 2026-11-23: "there should be a notes sheet that the character
   sheet switches to upon button press that holds any quick notes"). The pure half: what a character's quick notes are, how they are
   cleaned, the one change a note may take, what a player's message about one may hold, and whether the system shows the page at all.

   A character's quick notes live on the character itself, under the key qnotes, as a list in the order they were written:

     { id, t?, x, at, lk? }    id: 'q_' and 4 to 24 letters or digits, made by whoever writes the note (so the sheet's text box can
                               name it before the host has answered); t: an optional title of at most QN.title characters (absent
                               when blank); x: the text, at most QN.text characters, control characters but a tab and a line break
                               written as one space; at: when it was written, in milliseconds (the host's clock); lk: the look of the
                               text (item 35), a record cleaned by the rule of a Journal note (lookcore RULES.NOTE), kept only while
                               it is the look of these very words.

   systemcore cleanChar keeps the list on every whole copy (the host's and its owner's or a shared hand's), never on a teammate's hover
   copy, and charView sends it only on a whole copy. A player's change reaches the host as a char-qnote message (net.js), judged there
   by qnoteOp on the host's own copy. Nothing here reads the page, the wire or a clock: the caller hands in the time.

   A pure module: it imports lookcore.js alone, has no DOM and no state, and runs under Node (tools/notescheck.js). Its names are
   published through systemcore.js (window.wpSystemCore), which imports it. */
'use strict';
import { cleanRec, RULES } from './lookcore.js';

// [notescheck:core-start]
// The limits of one character's notes. Fifty notes of four thousand characters each keeps a whole copy of a character, which the host
// sends again after every change, well under the size a table's message may be (about 200 KB of words at the very most)
var QN = Object.freeze({ max: 50, text: 4000, title: 120 });
var QN_ID = /^q_[A-Za-z0-9]{4,24}$/;
var RID = /^[A-Za-z0-9_-]{1,24}$/, CHAR_ID = /^c_[A-Za-z0-9_]{1,24}$/;
// What a note's text may hold: a tab and a line break stay; every other control character is written as one space, as a sheet's notes
// field cleans its text, so a look made in the box for the text as typed is a look for the words as kept
var CTRL_NL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, CTRL = /[\u0000-\u001f\u007f]/g;
function isObj(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
// A note's text as it is kept: a string, its line ends as \n, its control characters as spaces, cut to QN.text. Anything that is no
// string is an empty text
function qnText(v) { return typeof v === 'string' ? v.replace(/\r\n?/g, '\n').replace(CTRL_NL, ' ').slice(0, QN.text) : ''; }
// A note's title as it is kept: one line, trimmed, cut to QN.title; '' when blank or no string
function qnTitle(v) { return typeof v === 'string' ? v.replace(CTRL, ' ').trim().slice(0, QN.title).trim() : ''; }
// One note as it is kept, or null where it cannot be one (no object, no id of the note's form). Read only by its own keys, so a key a
// prototype holds is never read
function cleanQnote(n) {
    if (!isObj(n) || !own(n, 'id') || typeof n.id !== 'string' || !QN_ID.test(n.id)) return null;
    var x = own(n, 'x') ? qnText(n.x) : '', t = own(n, 't') ? qnTitle(n.t) : '', at = own(n, 'at') ? Number(n.at) : 0;
    var out = { id: n.id }; if (t) out.t = t; out.x = x; out.at = isFinite(at) && at > 0 ? Math.floor(at) : 0;
    var lk = own(n, 'lk') ? cleanRec(n.lk, x, RULES.NOTE) : undefined; if (lk) out.lk = lk;   // the look of these very words, else none (lookcore's one stale rule)
    return out;
}
// A character's notes as they are kept: the notes in their order, each id once (the first stands), QN.max at most; undefined for none,
// so a character with no notes keeps exactly the keys it had. Asked by systemcore cleanChar and charView on every copy that may hold them
function cleanQnotes(v) {
    if (!Array.isArray(v)) return undefined;
    var out = [], seen = Object.create(null);
    for (var i = 0; i < v.length && i < QN.max * 4 && out.length < QN.max; i++) { var n = cleanQnote(v[i]); if (n && !seen[n.id]) { seen[n.id] = 1; out.push(n); } }
    return out.length ? out : undefined;
}
// What a player's message about a note may hold, judged by its shape alone in constant time before the host's limiter: { rid, charId,
// op, id, t?, x?, lk? } or null. op is 'add' (a new note under id), 'set' (its title, its text or its look; lk null takes the look off)
// or 'del'. A text or a title longer than a note keeps is refused here rather than cut, since a cut text would no longer be the words its
// look was made for. The look is judged later by qnoteOp, against the text it will be stored with. Asked by net.js's char-qnote branch
function cleanQnoteMsg(msg) {
    if (!isObj(msg) || typeof msg.rid !== 'string' || !RID.test(msg.rid) || typeof msg.charId !== 'string' || !CHAR_ID.test(msg.charId)) return null;
    if (msg.op !== 'add' && msg.op !== 'set' && msg.op !== 'del') return null;
    if (typeof msg.id !== 'string' || !QN_ID.test(msg.id)) return null;
    var out = { rid: msg.rid, charId: msg.charId, op: msg.op, id: msg.id };
    if (msg.op === 'del') return out;
    if (msg.t !== undefined) { if (typeof msg.t !== 'string' || msg.t.length > QN.title * 2) return null; out.t = msg.t; }
    if (msg.x !== undefined) { if (typeof msg.x !== 'string' || msg.x.length > QN.text) return null; out.x = msg.x; }
    if (msg.lk !== undefined) { if (msg.lk !== null && !isObj(msg.lk)) return null; out.lk = msg.lk; }
    return out;
}
// The one change a note takes, on the host's copy or on the GM's own: list is the character's notes as they stand (cleaned or not), q
// an op as cleanQnoteMsg gives it, now the time it is written at. Answers { ok: true, list, note? } with the whole new list (undefined
// when it is empty) and the note as it now stands, or { ok: false, reason }: 'full' (QN.max notes already), 'have' (an add under an id
// that is there), 'missing' (a set or a del of a note that is not there), 'value' (anything else). A set that changes nothing answers
// ok with same: true, so the caller sends nothing again. An add takes its time here; a set keeps the time the note was written
function qnoteOp(list, q, now) {
    if (!isObj(q) || typeof q.id !== 'string' || !QN_ID.test(q.id)) return { ok: false, reason: 'value' };
    var cur = cleanQnotes(list) || [], at = -1;
    for (var i = 0; i < cur.length; i++) if (cur[i].id === q.id) { at = i; break; }
    if (q.op === 'add') {
        if (at >= 0) return { ok: false, reason: 'have' };
        if (cur.length >= QN.max) return { ok: false, reason: 'full' };
        var nw = cleanQnote({ id: q.id, t: q.t, x: q.x, at: typeof now === 'number' && isFinite(now) && now > 0 ? now : 1, lk: q.lk });
        if (!nw) return { ok: false, reason: 'value' };
        cur.push(nw); return { ok: true, list: cur, note: nw };
    }
    if (q.op === 'del') {
        if (at < 0) return { ok: false, reason: 'missing' };
        cur.splice(at, 1); return { ok: true, list: cur.length ? cur : undefined };
    }
    if (q.op !== 'set') return { ok: false, reason: 'value' };
    if (at < 0) return { ok: false, reason: 'missing' };
    var was = cur[at], x = q.x !== undefined ? q.x : was.x, t = q.t !== undefined ? q.t : (was.t || ''), lk = q.lk !== undefined ? q.lk : (q.x !== undefined ? undefined : was.lk);   // a new text without a look of its own has none: the old look was made for other words
    var nn = cleanQnote({ id: was.id, t: t, x: x, at: was.at, lk: lk === null ? undefined : lk });
    if (!nn) return { ok: false, reason: 'value' };
    if (JSON.stringify(nn) === JSON.stringify(was)) return { ok: true, list: cur, note: was, same: true };
    cur[at] = nn; return { ok: true, list: cur, note: nn };
}
// A file's notes brought into a character's (1.6.4, Fulllion, 2026-11-23: the character file carries the notes and "brings them back on
// import"): every note the character has stays as it is, and each of the file's whose id the character does not hold already is added after
// them, cleaned, while there is room (QN.max). A note is never replaced, so a file read twice adds nothing the second time, and a note the
// player changed since keeps their words. { list, added }: the whole list (undefined when empty) and how many were added. Asked by net.js's
// char-upload branch (a player's file) and sheets.js's Review (the GM's own)
function qnoteMerge(cur, add) {
    var list = cleanQnotes(cur) || [], have = Object.create(null), added = 0;
    list.forEach(function(n) { have[n.id] = 1; });
    (cleanQnotes(add) || []).forEach(function(n) { if (list.length < QN.max && !have[n.id]) { have[n.id] = 1; list.push(n); added++; } });
    return { list: list.length ? list : undefined, added: added };
}
// A new note's id: 'q_' and ten letters and digits from the random source handed in (Math.random by default), so the sheet's text box
// can name the note at once
function qnoteId(rnd) { var r = typeof rnd === 'function' ? rnd : Math.random, s = ''; for (var i = 0; i < 10; i++) s += 'abcdefghijklmnopqrstuvwxyz0123456789'.charAt(Math.floor(r() * 36) % 36); return 'q_' + s; }
// Whether a system shows the Notes page on its character sheets (Fulllion, 2026-11-23: "this notes page should be optional in the system
// builder for the character sheet", on everywhere by default). The System editor's switch is kept only as sheet.notes === false (cleancore
// cleanSheet), so a system that never set it has the page, old or new. With it off the notes stay stored: only the page is not offered
function notesOn(sys) { return !(isObj(sys) && isObj(sys.sheet) && sys.sheet.notes === false); }
// [notescheck:core-end]

var API = { QN: QN, QN_ID: QN_ID, cleanQnote: cleanQnote, cleanQnotes: cleanQnotes, cleanQnoteMsg: cleanQnoteMsg, qnoteOp: qnoteOp, qnoteMerge: qnoteMerge, qnoteId: qnoteId, notesOn: notesOn, qnText: qnText, qnTitle: qnTitle };
export { QN, QN_ID, cleanQnote, cleanQnotes, cleanQnoteMsg, qnoteOp, qnoteMerge, qnoteId, notesOn, qnText, qnTitle, API as qnoteApi };
