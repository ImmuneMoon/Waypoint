// notescheck — a Notes page on every character sheet (1.6.4; Fulllion, 2026-11-23: "there should be a notes sheet that the character sheet
// switches to upon button press that holds any quick notes", each note to the user's Journal with a Delete or Keep question, shared with one,
// several or everyone; the page "optional in the system builder", on everywhere by default). qnotecore.js run for real (the cleaner, the wire's
// shape, the one change, the switch), what each copy of a character keeps through the real systemcore, the System editor's key through the real
// cleaner, the host's char-qnote branch of net.js run for real on stand-ins, and the sheet's page, its head button, Help and both release notes
// pinned. No browser, no network.
'use strict';
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 600))); } }
const J = JSON.stringify, root = path.join(__dirname, '..'), app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, '\n');
const imp = p => import('file:///' + path.resolve(app(p)).replace(/\\/g, '/'));
function between(src, a, b) { const i = src.indexOf(a), j = src.indexOf(b, i); return i >= 0 && j > i ? src.slice(i + a.length, j) : ''; }
(async () => {
    if (typeof globalThis.window === 'undefined') globalThis.window = {};
    const Q = await imp('scripts/qnotecore.js'), L = await imp('scripts/lookcore.js'), S = await imp('scripts/systemcore.js');
    const sig = t => L.textSig(t), lookFor = t => ({ fmt: { spans: [{ s: 0, e: Math.min(3, t.length), b: true }] }, sig: sig(t) });
    // ---- the cleaner
    const c1 = Q.cleanQnotes([
        { id: 'q_abcd', t: '  Clue  ', x: 'line one\r\nline\u0001two\ttab', at: 1700000000000.7, lk: lookFor('line one\nline two\ttab') },
        { id: 'q_abcd', x: 'a second note under the same id' },
        { id: 'bad', x: 'no id of a note' }, null, 'text', ['q_xxxx'],
        { id: 'q_efgh', t: '', x: 42, at: -5, lk: lookFor('other words') },
        { id: 'q_long', t: 'T'.repeat(300), x: 'y'.repeat(5000) }
    ]);
    check('a character’s notes are cleaned in their order: each id once (the first stands), a title trimmed and cut, line ends as \\n and other control characters as spaces, a text cut to 4000, a time a whole positive number else 0, a look kept only for its very words; anything that is no note is left out',
        J(c1.map(n => n.id)) === J(['q_abcd', 'q_efgh', 'q_long']) && c1[0].t === 'Clue' && c1[0].x === 'line one\nline two\ttab' && c1[0].at === 1700000000000 && !!c1[0].lk && c1[0].lk.sig === sig('line one\nline two\ttab')
        && !('t' in c1[1]) && c1[1].x === '' && c1[1].at === 0 && !('lk' in c1[1]) && c1[2].t.length === Q.QN.title && c1[2].x.length === Q.QN.text, J(c1));
    const many = []; for (let i = 0; i < 80; i++) many.push({ id: 'q_n' + String(i).padStart(3, '0'), x: 'n' + i });
    check('a character keeps 50 notes at most, the first 50; no notes, or nothing that is a note, is no key at all', Q.cleanQnotes(many).length === 50 && Q.cleanQnotes(many)[49].id === 'q_n049' && Q.cleanQnotes([]) === undefined && Q.cleanQnotes([{ id: 'x' }]) === undefined && Q.cleanQnotes({ 0: { id: 'q_abcd' } }) === undefined && Q.cleanQnotes(null) === undefined);
    const proto = Object.create({ id: 'q_abcd', x: 'from a prototype' });
    check('a note is read by its own keys alone, never by what a prototype holds', Q.cleanQnote(proto) === null && J(Q.cleanQnote(Object.assign(Object.create({ t: 'P' }), { id: 'q_abcd', x: 'k' }))) === J({ id: 'q_abcd', x: 'k', at: 0 }));
    // ---- the wire's shape
    const m = o => Q.cleanQnoteMsg(Object.assign({ rid: 'r1', charId: 'c_k' }, o));
    check('a player’s message about a note holds its request id, its character, add, set or del, the note’s id and for add and set a title, a text and a look (null takes it off); a del carries nothing else',
        J(m({ op: 'add', id: 'q_abcd', x: 'hi', t: 'T', junk: 1 })) === J({ rid: 'r1', charId: 'c_k', op: 'add', id: 'q_abcd', t: 'T', x: 'hi' }) && J(m({ op: 'set', id: 'q_abcd', lk: null })) === J({ rid: 'r1', charId: 'c_k', op: 'set', id: 'q_abcd', lk: null })
        && J(m({ op: 'del', id: 'q_abcd', x: 'ignored' })) === J({ rid: 'r1', charId: 'c_k', op: 'del', id: 'q_abcd' }));
    check('a malformed message is none: a request id or a character of the wrong form, another op, an id that is no note’s, a text or a title too long or no string, a look that is no object',
        [m({ op: 'add', id: 'q_abcd', rid: 'r 1' }), m({ op: 'add', id: 'q_abcd', charId: '__proto__' }), m({ op: 'move', id: 'q_abcd' }), m({ op: 'add', id: 'q_ab' }), m({ op: 'add', id: 'q_abcd', x: 'x'.repeat(4001) }),
         m({ op: 'add', id: 'q_abcd', x: 5 }), m({ op: 'set', id: 'q_abcd', t: 't'.repeat(241) }), m({ op: 'set', id: 'q_abcd', lk: 'b' }), m({ op: 'set', id: 'q_abcd', lk: [1] }), Q.cleanQnoteMsg(null), Q.cleanQnoteMsg([])].every(v => v === null));
    // ---- the one change
    const a1 = Q.qnoteOp(undefined, { op: 'add', id: 'q_abcd', t: ' A ', x: 'first' }, 1000), a2 = Q.qnoteOp(a1.list, { op: 'add', id: 'q_efgh', x: 'second' }, 2000);
    check('add puts a new note last, stamped with the time handed in, its title and text cleaned; the same id again is refused (have)',
        a1.ok && J(a1.list) === J([{ id: 'q_abcd', t: 'A', x: 'first', at: 1000 }]) && a2.ok && a2.list.length === 2 && a2.list[1].at === 2000 && Q.qnoteOp(a2.list, { op: 'add', id: 'q_abcd' }, 3).reason === 'have');
    const lk = lookFor('first'), s1 = Q.qnoteOp(a2.list, { op: 'set', id: 'q_abcd', lk: lk }, 9), s2 = Q.qnoteOp(s1.list, { op: 'set', id: 'q_abcd', t: 'New' }, 9), s3 = Q.qnoteOp(s2.list, { op: 'set', id: 'q_abcd', x: 'changed' }, 9), s4 = Q.qnoteOp(s3.list, { op: 'set', id: 'q_abcd', x: 'changed' }, 9);
    check('set changes a title, a text or a look and keeps the time it was written; a new title keeps the look, a new text without a look of its own takes it off (it was made for other words); a set that changes nothing answers same; a set or a del of a note that is not there is refused (missing)',
        s1.ok && !!s1.note.lk && s2.ok && s2.note.t === 'New' && !!s2.note.lk && s2.note.at === 1000 && s3.ok && s3.note.x === 'changed' && !('lk' in s3.note) && s4.ok && s4.same === true
        && Q.qnoteOp(a2.list, { op: 'set', id: 'q_zzzz', x: 'a' }, 1).reason === 'missing' && Q.qnoteOp(a2.list, { op: 'del', id: 'q_zzzz' }, 1).reason === 'missing'
        && Q.qnoteOp(a2.list, { op: 'set', id: 'q_abcd', lk: lookFor('other') }, 1).note.lk === undefined && Q.qnoteOp(s1.list, { op: 'set', id: 'q_abcd', lk: null }, 1).note.lk === undefined, J([s1, s2, s3]));
    const d1 = Q.qnoteOp(a2.list, { op: 'del', id: 'q_abcd' }, 1), d2 = Q.qnoteOp(d1.list, { op: 'del', id: 'q_efgh' }, 1), full = Q.cleanQnotes(many);
    check('del takes a note off and the list with its last note goes; the 51st note is refused (full); an op that is none is refused (value)', d1.ok && J(d1.list.map(n => n.id)) === J(['q_efgh']) && d2.ok && d2.list === undefined
        && Q.qnoteOp(full, { op: 'add', id: 'q_new1' }, 1).reason === 'full' && Q.qnoteOp([], { op: 'zap', id: 'q_abcd' }, 1).reason === 'value' && Q.qnoteOp([], null, 1).reason === 'value');
    check('a new note’s id is q_ and ten letters and digits; the switch is on unless a system says sheet.notes false', /^q_[a-z0-9]{10}$/.test(Q.qnoteId()) && Q.QN_ID.test(Q.qnoteId(() => 0.999999))
        && Q.notesOn(null) === true && Q.notesOn({}) === true && Q.notesOn({ sheet: {} }) === true && Q.notesOn({ sheet: { notes: true } }) === true && Q.notesOn({ sheet: { notes: false } }) === false);
    // ---- what each copy keeps (the real systemcore)
    const sys = S.emptySystem(); sys.fields = [{ id: 'f_t', key: 'Nick', label: 'Nick', kind: 'text', vis: 'all', hover: true }];
    const notes = [{ id: 'q_abcd', t: 'Clue', x: 'the key is under the mat', at: 5 }];
    const ch = { id: 'c_k', name: 'Kessa', ownerId: 'u_a', npc: false, values: { f_t: 'K' }, qnotes: notes, shareWith: ['u_c'] };
    const host = S.cleanChar(ch, sys, { state: 'host' }), ownC = S.charFor(host, sys, 'u_a'), shared = S.charFor(host, sys, 'u_c'), mate = S.charFor(host, sys, 'u_b');
    check('the notes stay on the host’s copy, its owner’s and a shared hand’s whole copy, each cleaned again where it lands; a teammate’s hover copy carries none, and a partial copy cleaned keeps none',
        J(host.qnotes) === J(notes) && J(ownC.qnotes) === J(notes) && shared.shared === 1 && J(shared.qnotes) === J(notes) && mate.partial === true && !('qnotes' in mate)
        && J(S.cleanChar(ownC, sys, { state: 'owner' }).qnotes) === J(notes) && !('qnotes' in S.cleanChar(Object.assign({}, ch, { partial: true }), sys, { state: 'owner' })), J([host.qnotes, mate]));
    check('a copy of a sheet (a template’s, a token’s own) starts with no notes; systemcore publishes the notes’ names on the window', !('qnotes' in S.sheetCopy(host, 'c_n', 'Copy', sys)) && typeof window.wpSystemCore.qnoteOp === 'function' && window.wpSystemCore.cleanQnoteMsg === Q.cleanQnoteMsg && window.wpSystemCore.notesOn === Q.notesOn);
    const F = { parse: () => ({ ok: true, ast: { body: { type: 'num', value: 0 } } }), evaluate: () => ({ ok: true, value: 0 }) };
    const sysOff = S.emptySystem(); sysOff.sheet = { sections: [], notes: false }; const sysOn = S.emptySystem(); sysOn.sheet = { sections: [], notes: true };
    const cOff = S.cleanSystem(sysOff, { F: window.wpFormula || F, gmView: true }), cOffP = S.cleanSystem(sysOff, { F: window.wpFormula || F, gmView: false }), cOn = S.cleanSystem(sysOn, { F: window.wpFormula || F, gmView: true });
    check('the System editor’s key is kept by the cleaner only as false, in the GM’s view and the players’, so a system that never set it, or set it true, has the page',
        !!cOff && cOff.sheet.notes === false && !!cOffP && cOffP.sheet.notes === false && !!cOn && !('notes' in cOn.sheet) && Q.notesOn(cOff) === false && Q.notesOn(cOn) === true, J([cOff && cOff.sheet, cOn && cOn.sheet]));
    // ---- the host's branch, run for real
    const net = read('scripts/net.js'), br = between(net, '// [netcheck:charqnote-start]', '// [netcheck:charqnote-end]');
    const runB = (o, msg) => {
        const out = { answer: [], saves: 0, sent: [], changed: [] };
        const camp = o.camp || { system: o.system || { sheet: {} }, chars: {
            c_k: { id: 'c_k', name: 'Kessa', ownerId: 'u_a', npc: false, values: {}, shareWith: ['u_c'], qnotes: [{ id: 'q_abcd', x: 'old', at: 5 }] },
            c_s: { id: 'c_s', name: 'Sam', ownerId: 'u_c', npc: false, values: {}, shareWith: ['u_a'] },
            c_o: { id: 'c_o', name: 'Other', ownerId: 'u_b', npc: false, values: {} },
            c_n: { id: 'c_n', name: 'Npc', npc: true, values: {} } } };
        const conn = { peer: 'p1', send: m => out.answer.push(m) }, netO = { roster: { p1: { id: 'u_a', name: 'Ann' } }, paused: !!o.paused };
        const fn = new Function('msg', 'conn', 'net', 'own', 'getActiveCampaign', 'peerPaused', 'SC', 'allow', 'saveRemoteSoon', 'sendFailed', 'handsTo', 'sendCharTo', 'window', br);
        fn(Object.assign({ type: 'char-qnote', rid: 'r1' }, msg), conn, netO, (x, k) => Object.prototype.hasOwnProperty.call(x, k), () => camp, () => !!o.peerPaused, () => window.wpSystemCore, () => o.slow !== true, () => { out.saves++; }, () => {},
            (c, pid) => !!c && !!pid && (c.ownerId === pid || (Array.isArray(c.shareWith) && c.shareWith.indexOf(pid) >= 0)), (pid, id) => out.sent.push(pid + ':' + id),
            { wpSheets: { charChanged: id => out.changed.push(id) }, wpVtt: { on: k => !(o.off && k === 'sheets') } });
        out.camp = camp; return out;
    };
    const b1 = runB({}, { charId: 'c_k', op: 'add', id: 'q_new1', t: 'Plan', x: 'go north' }), b2 = runB({}, { charId: 'c_k', op: 'set', id: 'q_abcd', x: 'new' }), b3 = runB({}, { charId: 'c_k', op: 'del', id: 'q_abcd' }), b4 = runB({}, { charId: 'c_s', op: 'add', id: 'q_new2', x: 'theirs, shared with me' });
    const okA = r => J(r.answer) === J([{ ok: true, type: 'char-qnote-ans', rid: 'r1' }]);
    check('a player adds, changes and deletes a note of their own character: kept on the host’s copy (an add stamped with the host’s clock), saved, sent whole to the owner and every shared hand, the sheet told, and answered ok',
        okA(b1) && b1.camp.chars.c_k.qnotes.length === 2 && b1.camp.chars.c_k.qnotes[1].t === 'Plan' && b1.camp.chars.c_k.qnotes[1].at > 1e12 && b1.saves === 1 && J(b1.sent) === J(['u_a:c_k', 'u_c:c_k']) && J(b1.changed) === J(['c_k'])
        && okA(b2) && b2.camp.chars.c_k.qnotes[0].x === 'new' && b2.camp.chars.c_k.qnotes[0].at === 5 && okA(b3) && !('qnotes' in b3.camp.chars.c_k) && b3.saves === 1, J([b1, b2, b3].map(r => [r.answer, r.sent])));
    check('a player writes the notes of a sheet shared with them, as its owner does: sent to its owner and to them', okA(b4) && b4.camp.chars.c_s.qnotes[0].x === 'theirs, shared with me' && J(b4.sent) === J(['u_c:c_s', 'u_a:c_s']));
    const ref = (why, o, msg, back) => { const r = runB(o, msg); const ch2 = r.camp.chars[msg.charId]; return J(r.answer) === J([{ reason: why, type: 'char-qnote-ans', rid: 'r1' }]) && r.saves === 0 && r.changed.length === 0 && (!ch2 || J(ch2.qnotes || null) === J(msg.charId === 'c_k' ? [{ id: 'q_abcd', x: 'old', at: 5 }] : null)) && J(r.sent) === J(back ? ['u_a:' + msg.charId] : []); };
    const full50 = { system: { sheet: {} }, chars: { c_k: { id: 'c_k', name: 'K', ownerId: 'u_a', npc: false, values: {}, qnotes: many.slice(0, 50) } } };
    check('refused and answered why, nothing changed: another player’s character or an NPC (owner), one that is not there (missing), the rate (slow) before anything that sends a copy, with no copy back (a whole copy is large, so the limiter bounds every one sent); past those the asker is sent the host’s copy back: a paused table or player (paused), sheets off or the system’s Notes page off (off), a note that is not there (note), an id there already (have)',
        ref('owner', {}, { charId: 'c_o', op: 'add', id: 'q_new1' }, false) && ref('owner', {}, { charId: 'c_n', op: 'add', id: 'q_new1' }, false) && ref('missing', {}, { charId: 'c_9', op: 'add', id: 'q_new1' }, false) && ref('missing', {}, { charId: 'c_constructor', op: 'add', id: 'q_new1' }, false)
        && ref('paused', { paused: true }, { charId: 'c_k', op: 'add', id: 'q_new1' }, true) && ref('paused', { peerPaused: true }, { charId: 'c_k', op: 'add', id: 'q_new1' }, true) && ref('off', { off: true }, { charId: 'c_k', op: 'add', id: 'q_new1' }, true)
        && ref('off', { system: { sheet: { notes: false } } }, { charId: 'c_k', op: 'add', id: 'q_new1' }, true) && ref('slow', { slow: true }, { charId: 'c_k', op: 'add', id: 'q_new1' }, false) && ref('slow', { slow: true, paused: true }, { charId: 'c_k', op: 'add', id: 'q_new1' }, false)
        && ref('note', {}, { charId: 'c_k', op: 'set', id: 'q_zzzz', x: 'a' }, true) && ref('have', {}, { charId: 'c_k', op: 'add', id: 'q_abcd' }, true));
    const bF = runB({ camp: full50 }, { charId: 'c_k', op: 'add', id: 'q_new1' });
    check('the 51st note is refused (full) and the host’s copy sent back; a malformed request or a stranger is answered nothing; a set that changes nothing is answered ok and sends and saves nothing',
        J(bF.answer) === J([{ reason: 'full', type: 'char-qnote-ans', rid: 'r1' }]) && bF.camp.chars.c_k.qnotes.length === 50 && J(bF.sent) === J(['u_a:c_k'])
        && runB({}, { rid: 'r 1', charId: 'c_k', op: 'add', id: 'q_new1' }).answer.length === 0 && runB({}, { charId: 'c_k', op: 'add', id: 'bad' }).answer.length === 0
        && (() => { const r = runB({}, { charId: 'c_k', op: 'set', id: 'q_abcd', x: 'old' }); return okA(r) && r.saves === 0 && r.sent.length === 0; })());
    check('a player’s app sends a note’s change through the one shape the host judges, waits for its answer in its own words, and the answer is one it reads',
        net.includes('net.charQnote = function(charId, q, done) {') && net.includes("return mkSend('char-qnote', o, done);") && net.includes("msg.type === 'char-qnote-ans'") && net.includes("var WK = pK.kind === 'char-qnote' ? QN_NET_WHY :")
        && /note: 'That note is no longer on this sheet\.'/.test(net));
    // ---- the page's own code run for real on stand-ins: a player's change and its refusal, and a player's shares spaced to the host's limit
    {
        const cut = name => { const t = require('./checkkit').defOf('sheets.js', name), i = t.indexOf('function ' + name + '('); let d = 0, j = t.indexOf('{', i); for (; j < t.length; j++) { const ch = t[j]; if (ch === '{') d++; else if (ch === '}' && --d === 0) break; } return t.slice(i, j + 1); };   // each read from the file that holds it (checkkit.defOf)
        const src = ['qnList', 'qnFind', 'qnDo', 'qnSend', 'qnStore'].map(cut).join('\n');
        const mk = o => {
            const out = { toasts: [], sent: [], shares: [], timers: [], draws: 0, fails: 0 }, c = { id: 'c_k', name: 'Kessa', ownerId: 'u_a', qnotes: [{ id: 'q_abcd', x: 'old', at: 5 }] };
            const netS = { charQnote: (id, q, done) => { out.sent.push(q); out.done = done; return o.local ? { error: 'Not at the table yet.' } : { ok: true, pending: true }; }, shareEntry: m => { out.shares.push([m.to, Date.now() - out.t0]); return true; } };
            const env = { _qnLocal: Object.create(null), _qnDraft: Object.create(null), _qnTimer: Object.create(null), _qnShare: 'x', _qnSendNext: 0, QN_SHARE_GAP: 1100, QN_SHARE_MOST: 6, QN_WHY: { value: 'v' } };
            const fn = new Function('E', 'popFwd', 'qnWrites', 'qnoteOp', 'isClient', 'net', 'toast', 'renderViews', 'qnSaved', 'charById', 'sbxFlush', 'setTimeout', 'clearTimeout',
                'var _qnLocal = E._qnLocal, _qnDraft = E._qnDraft, _qnTimer = E._qnTimer, _qnShare = E._qnShare, _qnSendNext = E._qnSendNext, QN_SHARE_GAP = E.QN_SHARE_GAP, QN_SHARE_MOST = E.QN_SHARE_MOST, QN_WHY = E.QN_WHY;\n' + src + '\nreturn { qnDo: qnDo, qnSend: qnSend, qnStore: qnStore, qnList: qnList, local: _qnLocal, draft: _qnDraft };');
            out.t0 = Date.now();
            const api = fn(env, () => false, () => true, Q.qnoteOp, () => o.gm !== true, () => netS, t => out.toasts.push(t), () => { out.draws++; }, () => {}, () => c, () => {}, (f, ms) => { out.timers.push(ms); f(); }, () => {});
            return { api, out, c };
        };
        const t1 = mk({}), ok1 = t1.api.qnDo(t1.c, { op: 'set', id: 'q_abcd', x: 'new' }, () => { t1.out.fails++; }), shown1 = t1.api.qnList(t1.c)[0].x, host1 = t1.c.qnotes[0].x;
        t1.out.done({ ok: true }); const after1 = [Object.keys(t1.api.local).length, t1.api.qnList(t1.c)[0].x];
        const t2 = mk({}); t2.api.qnDo(t2.c, { op: 'set', id: 'q_abcd', x: 'typed' }, () => { t2.out.fails++; }); t2.out.done({ error: 'That character is not yours.' });
        const t3 = mk({ local: true }), ok3 = t3.api.qnDo(t3.c, { op: 'set', id: 'q_abcd', x: 'typed' }, () => { t3.out.fails++; });
        const t4 = mk({}); t4.api.draft['c_k:q_abcd:x'] = 'plain words'; t4.api.qnStore('c_k', 'q_abcd'); t4.out.done({ error: 'The table is paused.' });
        check('a player’s change is shown at once from the app’s own list and the character’s copy stays the host’s; the answer gives the page back to the host’s copy; a refusal by the host or here drops the app’s list and gives the typed words back as a draft',
            ok1 === true && shown1 === 'new' && host1 === 'old' && J(after1) === J([0, 'old']) && J(t1.out.sent) === J([{ op: 'set', id: 'q_abcd', x: 'new' }]) && t1.out.fails === 0
            && Object.keys(t2.api.local).length === 0 && t2.out.fails === 1 && t2.out.toasts[0] === 'That character is not yours.' && t2.api.qnList(t2.c)[0].x === 'old'
            && ok3 === false && t3.out.fails === 1 && Object.keys(t3.api.local).length === 0 && t4.api.draft['c_k:q_abcd:x'] === 'plain words', J([shown1, host1, after1, t2.out, t3.out.fails, t4.api.draft]));
        const s1 = mk({}); s1.api.qnSend('c_k', 'q_abcd', ['*']); const s2 = mk({}); s2.api.qnSend('c_k', 'q_abcd', ['u_b', 'u_c', 'gm']); const s3 = mk({}); s3.api.qnSend('c_k', 'q_abcd', ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']); const s4 = mk({ gm: true }); s4.api.qnSend('c_k', 'q_abcd', ['u_b', 'u_c']);
        check('a player’s shares go one a person, 1.1 s apart (the host takes a player’s share once a second): Everyone is every other player and the GM; at most six at once, the rest named as not sent; the GM’s go at once, with no word of the page’s own',
            J(s1.out.shares.map(x => x[0])) === J(['*', 'gm']) && J(s1.out.timers) === J([1100]) && J(s2.out.shares.map(x => x[0])) === J(['u_b', 'u_c', 'gm']) && J(s2.out.timers) === J([1100, 2200])
            && s3.out.shares.length === 6 && /2 more were not sent/.test(s3.out.toasts[0]) && J(s4.out.shares.map(x => x[0])) === J(['u_b', 'u_c']) && s4.out.timers.length === 0 && s4.out.toasts.length === 0, J([s1.out, s2.out.timers, s3.out.toasts, s4.out]));
    }
    // ---- the sheet's page, its head, the System editor, Help and the release notes
    const sh = read('scripts/sheets.js'), pg = between(sh, '// [notescheck:page-start]', '// [notescheck:page-end]'), bx = between(sh, '// [notescheck:box-start]', '// [notescheck:box-end]'), ix = read('index.html');
    check('the page is drawn of elements and text alone, through the one change (qnDo), a delete asked with Enter answering neither, Add to my Journal through the Journal’s own add then Delete or Keep, Share through the Journal’s own share path, one share a person; a player’s app reads its own list while its changes wait for the host',
        pg.length > 4000 && !/innerHTML|outerHTML|insertAdjacentHTML/.test(pg) && pg.includes('function qnDo(c, q, fail) {') && pg.includes("popFwd('qnDo', [c.id, q])") && pg.includes("n.charQnote(cid, q,") && pg.includes("var r = qnoteOp(qnList(c), q, Date.now());") && pg.includes("if (Lw && --Lw.n <= 0) delete _qnLocal[cid];")
        && pg.includes("{ yes: 'Delete', noEnter: true }") && pg.includes('window.wpJournalAddNote') && pg.includes("{ yes: 'Delete', no: 'Keep', noEnter: true }") && pg.includes('nt.shareEntry({ to: t, entry: entry })') && pg.includes("client ? ['*', 'gm'] : ['*']")
        && pg.includes('typeof n.playerName === \'function\'') && pg.includes('if (n.lk) entry.look = n.lk;'));
    check('a note’s text is typed in the sheet’s own text box under a key of its own, stored as one set of the text and its look by the rule of a Journal note, the draft given back on a refusal; the box’s slice asks it by name',
        bx.includes('var SBX_QN = /^(c_[A-Za-z0-9_]{1,24}):qn:(q_[A-Za-z0-9]{4,24})$/;') && bx.includes("return qnDo(p.c, { op: 'set', id: p.n.id, x: d.text, lk: rec || null }, function() { if (!_sbx.drafts[key]) { _sbx.drafts[key] = d; renderViews(p.c.id); } });") && bx.includes('lookRules.NOTE')
        && sh.includes("var qf = typeof sbxQnField === 'function' ? sbxQnField(key) : null; if (qf) return qf;") && sh.includes("if (typeof SBX_QN !== 'undefined' && SBX_QN.test(key)) return typeof sbxQnCommit === 'function' ? sbxQnCommit(key, d) : false;"));
    check('the sheet’s head has the Notes button beside Edit sheet, lit while the page is shown; the page stands in place of the sections; a closed sheet stores what was typed; a HUD and a window of its own have the switch too',
        ix.includes('<button class="tool ghost notepad-btn sheet-notes-btn" id="sheetNotes" type="button" title="Quick notes on this character" aria-pressed="false" style="display:none;">Notes</button><button class="tool ghost notepad-btn sheet-edit" id="sheetEdit"')
        && sh.includes("if (typeof qnShown === 'function' && qnShown(c, sysD)) {") && sh.includes('qnPage(body, cD, camp, sysD, { seeP: !!seeP });') && sh.includes("if (typeof qnFlush === 'function') qnFlush();")
        && sh.includes("var qnBt = ui('sheetNotes'); if (qnBt) qnBt.addEventListener('click',") && sh.includes("v.qn = qnH;") && sh.includes("qnPage(container, c, camp, sys, { pop: true, live: !!PA })") && sh.includes("else if (m.op === 'qnDo')"));
    const NL = String.fromCharCode(10), CRLF = new RegExp(String.fromCharCode(13) + NL, 'g'), kit = require('./checkkit'), lay = kit.part('sysedlayout.js').replace(CRLF, NL), cc = kit.part('cleancore.js').replace(CRLF, NL);   // parts of sheets.js and systemcore.js, each read by its own name
    check('the System editor’s Layout tab, Sheet look, holds Notes page on character sheets, ticked unless the system says off, kept across the automatic layout and Remove layout; the cleaner keeps the key only as false',
        lay.includes("notesChk.checked = !(draft.sheet && draft.sheet.notes === false);") && lay.includes("document.createTextNode(' Notes page on character sheets')") && lay.includes('if (notesChk.checked) delete draft.sheet.notes; else draft.sheet.notes = false;')
        && lay.includes('if (keepNotes) draft.sheet.notes = false;') && lay.includes('if (keepNotes2) draft.sheet.notes = false;') && cc.includes('if (sheet.notes === false) out.notes = false;'));
    const wn = fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, '\n'), wa = read('assets/whatsnew.txt');
    check('Help says what the page does in plain words, and both release notes carry it marked as a draft', ix.includes('<li><b>Notes</b> in a sheet&rsquo;s head switches the sheet to its Notes page') && ix.includes('<b>Add to my Journal</b> copies a note into your Journal.')
        && ix.includes('<b>Notes page on character sheets</b>, in the same box, is on for every system.') && wn.includes('A Notes page on every sheet [DRAFT]') && wn === wa);
    summed = true; console.log('\n' + pass + ' passed, ' + fail + ' failed.'); process.exitCode = fail ? 1 : 0;
})().catch(e => { console.log('FAIL      the suite threw: ' + (e && e.stack || e)); process.exitCode = 1; summed = true; });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite never finished its checks'); process.exitCode = 1; } });
