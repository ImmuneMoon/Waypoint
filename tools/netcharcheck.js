/* netcharcheck.js: a character on the wire, the tests that came out of netcheck.js with their area
   (docs/REFACTOR_SPLIT_PLAN.md, "Finishing the test split", step 5, 2026-11-19), each block word for word with the comment that heads it.
   What it covers, each block as it stood in netcheck.js: status effects on the wire (5h), the Stage 6 look fold's players' view, a
   player's ask for their copy's stats (char-ask, 1.5.5), a batched edit (HF4b, char-edits), a file an outside reader on the host writes
   (sheet-out), a field Locked while a test holds (backlog 170) and its review, GM-only pools, a timed effect's countdown pressed (T5b),
   At most at a level and Levels it may be, a row's facts (F4b) and its review, a GM-only stat, When a row is taken off, a refused
   attempt's notice, a pick over a hidden choice (F5a2 #3), stats and what was paid (F4c1), custom rows (F4c3) and an own row's text
   (155), an entry only a GM-only pack holds (F4c3 #2), a copy's own values (F4c2), a kept curse (F6), a sheet upload (U2), a player's
   own edit of a row's changes (F11b R3), point budgets (126), what an entry needs (126b), Loads from, Chambers from, the look of a
   sheet's text (item 35, char-style) and the damage step on the wire (char-damage).
   It reads the joined net.js through srcjoin, as netcheck did.
   Run: node tools/netcharcheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const fs = require('fs'), path = require('path');
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const T = kit.suite('net'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
// netcheck's slice helpers over the joined net.js; a call that names a part's file reads that part by its own name
const { src, between, fnSrc } = kit.netSlices('netcharcheck');
// the harness pieces netcheck keeps at its top, the very code (checkkit netHarness)
const { H } = kit.netHarness('netcharcheck');
const j = JSON.stringify;

/* ================= status effects on the wire (5h): the host handler's gates, the per-peer projection ================= */
{
    const fxR = (() => { const i = src.indexOf('// [netcheck:charfx-start]'), k = src.indexOf('// [netcheck:charfx-end]'); return i >= 0 && k > i ? src.slice(i, k) : ''; })();
    const order = ['Sx.cleanCharEffect(msg); if (!qx) return;', "denyX('paused')", "denyX('slow')", "denyX('off')", "denyX('missing')", "denyX('owner')", 'Sx.applyEffectOp(campX.system, chX, qx.fieldId, qx, Fx, { player: true, view:', "conn.send({ type: 'char-ack', rid: qx.rid })", 'net.syncCharDelta(qx.charId, dX);'];
    let at = -1; const inOrder = order.every(s => { const p = fxR.indexOf(s, at + 1); if (p < 0) return false; at = p; return true; });
    check('char-effect (host): shape, pause, rate, feature, existence and ownership are checked in that order before the list\'s own rules; then store, ack, sync (behavior: systemcheck runs this slice)', fxR.length > 0 && inOrder);
    check('char-effect (host): every projection carries the full library (a GM-only effect reaches its owner inline, never as a bare id); the probe that decides who sees a field is marked',
        /S\.charFor\(src, view, pid, \{ lib: libD, items: itD, full: camp\.system \}\)/.test(src) && /S\.charFor\(probe, view, pid, \{ probe: true \}\)/.test(src) && /charFor\(camp\.chars\[id\], camp\.system, recipientId, \{ lib: libFx, items: libIt, full: fullSys \}\)/.test(require('./checkkit').part('netfog.js')) && /SQ\.charFor\(srcQ, viewQ, pidQ, \{ lib: fxLib\(campQ\.system\), items: itemLib\(campQ\.system\), full: campQ\.system \}\)/.test(src)
        && /S\.charFor\(camp\.chars\[charId\], view, recipientId, \{ lib: lib, items: items, full: camp\.system \}\)/.test(src) && /S\.charFor\(src, view, src\.ownerId, \{ lib: lib \|\| null, items: items \|\| null, full: full \|\| null \}\)/.test(src));
    const ciR = (() => { const i = src.indexOf('// [netcheck:charitem-start]'), k = src.indexOf('// [netcheck:charitem-end]'); return i >= 0 && k > i ? src.slice(i, k) : ''; })();
    const ciOrder = ['Si.cleanCharItem(msg); if (!qi) return;', "denyI('paused')", "denyI('slow')", "denyI('off')", "denyI('missing')", "denyI('owner')", 'Si.applyRowOp(campI.system, chI, qi.fieldId, qi, Fi, { player: true, view:', "{ type: 'char-ack', rid: qi.rid }", 'net.syncCharDelta(qi.charId, dI);'];
    let ciAt = -1; const ciIn = ciOrder.every(s => { const p = ciR.indexOf(s, ciAt + 1); if (p < 0) return false; ciAt = p; return true; });
    check('char-item (host, Stage 6 F4a): shape, pause, rate, feature, existence and ownership are checked in that order before the list\'s own rules (applyRowOp on the players\' view); then store, ack, sync; a delta never sends a value raw (fail closed)',
        ciR.length > 0 && ciIn && /if \(values\[f\] === null\) sub\[f\] = null; else if \(proj && proj\.values\[f\] !== undefined\) sub\[f\] = proj\.values\[f\];/.test(src));
    check('throw-req (host, Stage 6 F4a): the throw names a row of a VISIBLE item list; the definition is read on the host through rowDef (a GM-only item or one with no blast is never thrown by a player)',
        /var fT = St\.fieldById\(campT\.system, msg\.fieldId\); if \(!fT \|\| fT\.kind !== 'item-list' \|\| fT\.vis !== 'all'\) return;/.test(src) && /var rdT = St\.rowDef\(campT\.system, rowT\), defT = rdT \? rdT\.def : null; if \(!defT \|\| defT\.vis === 'gm' \|\| !defT\.area\) return;/.test(src) && /vT\.find\(function\(r\) \{ return r && r\.hid !== 1 && St\.rowIdOf\(r\) === msg\.rowId; \}\)/.test(src));
    check('Stage 6: a joining player\'s client keeps the host\'s whole copy of every character from the snapshot, and a delta only updates that copy (never starts a partial one a refusal would read as "no value")',
        /charSessionReset\(\);\s*\n\s*Object\.values\(state\.appState\.campaigns \|\| \{\}\)\.forEach\(function\(cs\) \{ if \(cs && cs\.chars && typeof cs\.chars === 'object'\) Object\.keys\(cs\.chars\)\.forEach\(function\(id\) \{ noteHostCopy\(id, cs\.chars\[id\]\.values\); \}\); \}\);/.test(require('./checkkit').part('netfog.js'))
        && /hb = Object\.prototype\.hasOwnProperty\.call\(_charHost, msg\.id\) \? _charHost\[msg\.id\] : null;/.test(src) && !/_charHost\[msg\.id\] = \{\}/.test(src));
    check('Stage 6: the host\'s Undo window — every pickup opens or extends it, a drop inside it lowers its count and never closes it (it lapses)',
        /if \(gA\) \{ gA\.added \+= resI\.added; gA\.until = nowI \+ Si\.LIMITS\.undoGraceMs; \} else _rowGrace\[gkA\] = \{ until: nowI \+ Si\.LIMITS\.undoGraceMs, added: resI\.added \};/.test(ciR) && /else if \(grI && resI\.undone > 0\) grI\.added = Math\.max\(0, grI\.added - resI\.undone\);/.test(ciR) && !/delete _rowGrace\[gkI\]/.test(ciR));
    check('Stage 6 removal rules on the wire: a bound item\'s refusal and a cursed one\'s answer carry the GM\'s message, which the client cleans as text (cleanItemMsg) before a toast shows it; the host keys legacy GM-only rows before hosting sends anything',
        /conn\.send\(\{ type: 'char-deny', rid: qi\.rid, reason: 'stays', msg: resI\.msg \|\| '' \}\)/.test(ciR) && /var itMI = resI\.hid && resI\.msg \? resI\.msg : resI\.keptOn && resI\.keptMsg \? resI\.keptMsg : typeof resI\.raised === 'string' \? resI\.raised : typeof resI\.needsWarn === 'string' && resI\.needsWarn \? resI\.needsWarn : '';/.test(ciR) /* 1.6.2 (167 C): and needs that only warn (moved on purpose) */ && /conn\.send\(itMI \? \{ type: 'char-ack', rid: qi\.rid, msg: itMI \} : \{ type: 'char-ack', rid: qi\.rid \}\)/.test(ciR)
        && /var rsH = SC2\.cleanDenyReason\(msg\.reason\), msH = SC2\.cleanItemMsg\(msg\.msg\);[^\n]*charPendingDone\(msg\.rid, msg\.type === 'char-ack', rsH, msH\)/.test(src) && /Sh\.stampRows\(campH\.system, campH\.chars \|\| \{\}\);[^\n]*\n\s*net\.applyingRemote = true; save\(true\);/.test(src));
}

// Stage 6 look fold: the players' view of a system carrying every look-fold key packs for the wire (no prototype-free object —
// the lesson of the roster bug), for both look test systems
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const errs = ['look-d20', 'look-3d6'].map(n => { try { const sys = Sx.cleanSystem(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8')), { F: Fx, gmView: false }); packCheck(sys); return sys && sys.sheet && sys.sheet.look && sys.sheet.look.palette ? null : n + ': no palette'; } catch (e) { return n + ': ' + e.message; } }).filter(Boolean);
    check('look: the players\' view of both look test systems (a palette, and every later look key) packs for the wire', errs.length === 0, errs.join('; '));
    const errsH = ['hud-d20', 'hud-3d6', 'hud-bare'].map(n => { try { const sys = Sx.cleanSystem(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8')), { F: Fx, gmView: false }); packCheck(sys); return sys && sys.sheet && sys.sheet.hud && Array.isArray(sys.sheet.hud.sections) ? null : n + ': no HUD'; } catch (e) { return n + ': ' + e.message; } }).filter(Boolean);
    check('HUD frame HF1: the players\' view of the three HUD test systems (the HUD a second layout of the sheet) packs for the wire — no prototype-free object in it', errsH.length === 0, errsH.join('; '));
    const trapP = Sx.cleanSystem(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'hud-d20.json'), 'utf8')), { F: Fx, gmView: false }); packCheck(trapP);
    check('HUD frame HF5a: the players\' view that goes over the wire carries a label naming a GM-only value scrubbed ("Trap save"), and the GM-only field\'s key nowhere in it', ((trapP.rolls.find(r => r.id === 'r_trap') || {}).label === 'Trap save') && JSON.stringify(trapP).indexOf('GMFig') < 0, JSON.stringify(trapP.rolls));
})());

// 1.5.5 (the owner at the table, 2026-10-18: "lets allow it, but i approve the change after review"): a player's ask for their copy's stats.
// The host's char-ask branch, sliced by its markers and run for real with the real core, the formula engine and askStats from net.js: under
// the list rule statsAsk it becomes one line of the character's ask (a Review entry marked ask), the character unchanged, the GM told by a
// toast, the log and a card; a newer ask of the same stat replaces the older line, another stat adds one, an ask back to the row's own figure
// takes its line away (and the entry with its last line); every refusal answered once with nothing kept, saved or told
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const askSrc = between('// [netcheck:charask-start]', '// [netcheck:charask-end]', 'charask'), asF = fnSrc('function askStats(v) {', '\n}\n', 'askStats') + '\n}\n';
    const raw = (rules, extra) => Object.assign({ v: 1, name: 'A', rolls: [], items: [{ id: 'i_gust', name: 'Gust', key: 'Gust', category: 'Power', stats: { cp: 10 } }, { id: 'i_gm', name: 'Secret', key: 'Secret', category: 'Power', vis: 'gm', stats: { cp: 5 } }],
        fields: [{ id: 'f_pw', key: 'Powers', label: 'Powers', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'granted', label: 'Granted points' }, { key: 'cp', label: 'CP' }, { key: 'al', label: 'Alignment', kind: 'pick', opts: [{ label: 'Dark', name: 'DarkA' }, { label: 'Light', name: 'LightA' }] }], custom: true } },
            { id: 'f_gmL', key: 'Gifts', label: 'Gifts', kind: 'item-list', vis: 'all', edit: 'gm', list: { stats: [{ key: 'granted', label: 'Granted points' }] } }, { id: 'f_n', key: 'Num', label: 'Num', kind: 'number', vis: 'all', edit: 'owner' }],
        listRules: rules }, extra || {});
    const run = (o, msg) => {
        o = o || {};
        const camp = { id: 'k', system: Sx.cleanSystem(raw(o.rules === undefined ? { statsAsk: true } : o.rules), { F: Fx, gmView: true }), uploads: JSON.parse(JSON.stringify(o.uploads || [])),
            chars: { c_a: { id: 'c_a', name: 'Ann', ownerId: 'u_a', npc: false, values: { f_pw: [{ id: 'w_1', defId: 'i_gust', qty: 1 }, { id: 'w_2', defId: 'i_gust', qty: 1, ov: { stats: { granted: 4 }, held: ['granted'] } }, { id: 'w_own', qty: 1, def: { name: 'Mine', stats: { cp: 3 } } }, { id: 'w_hid', defId: 'i_gust', qty: 1, hid: 1 }, { id: 'w_gm', defId: 'i_gm', qty: 1 }], f_gmL: [{ id: 'w_g', defId: 'i_gust', qty: 1 }] } },
                c_b: { id: 'c_b', name: 'Bo', ownerId: 'u_b', npc: false, values: { f_pw: [{ id: 'w_1', defId: 'i_gust', qty: 1 }] } }, c_n: { id: 'c_n', name: 'Nix', ownerId: 'u_a', npc: true, values: { f_pw: [{ id: 'w_1', defId: 'i_gust', qty: 1 }] } } } };
        if (o.chars) Object.assign(camp.chars, o.chars);
        const before = JSON.stringify(camp.chars), out = { answer: [], toasts: [], logs: [], saves: 0, notes: [], changed: [], allowed: [], camp };
        const conn = { peer: o.from || 'pA', send: m => { packCheck(m); out.answer.push(JSON.parse(JSON.stringify(m))); } };
        const net = { active: true, role: 'host', paused: !!o.paused, roster: { pA: { id: 'u_a', name: 'Pat' }, pB: { id: 'u_b', name: 'Bea' } } };
        const win = { wpFormula: Fx, wpVtt: { on: k => k !== 'sheets' || !o.sheetsOff }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), approveNote: (id, t, k) => out.notes.push([id, t, k]), uploadsChanged: id => out.changed.push(id) } };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'toast', 'logEvent', 'own', 'allow', asF + askSrc)(
            Object.assign({ type: 'char-ask', rid: 'q1', charId: 'c_a', fieldId: 'f_pw', rowId: 'w_1', stats: { granted: 10 } }, msg || {}), conn, net, () => Sx, win, () => !!o.peerPaused, () => camp, () => { out.saves++; }, e => { throw e; },
            t => out.toasts.push(t), (k, t) => out.logs.push([k, t]), H.own, k => { out.allowed.push(k); return o.slow !== k; });
        out.charsSame = JSON.stringify(camp.chars) === before;
        return out;
    };
    const j = JSON.stringify, ask0 = run(), e0 = ask0.camp.uploads[0] || {};
    check('1.5.5 char-ask (host, run for real): an ask is one line of the character\'s ask — a Review entry marked ask, from its player by name, the line a stat change ticked with the list\'s and the row\'s names and the figures before and after; the character unchanged; saved once, the GM told by a toast, the log and a card that opens the Review; answered ok',
        j(ask0.answer) === j([{ ok: true, type: 'char-ask-ans', rid: 'q1' }]) && ask0.camp.uploads.length === 1 && e0.ask === true && e0.charId === 'c_a' && e0.from === 'u_a' && e0.name === 'Pat' && /^up_[a-z0-9]+$/.test(e0.id) && typeof e0.at === 'number'
        && j(e0.changes) === j([{ kind: 'stat', f: 'f_pw', row: 'w_1', label: 'Powers: Gust', from: 'Granted points 0', to: 'Granted points 10', ov: { stats: { granted: 10 } }, accept: true, held: false, id: 'u_1' }])
        && ask0.charsSame && ask0.saves === 1 && j(ask0.toasts) === j(['Pat asks to change Ann: Powers: Gust, Granted points 0 to Granted points 10.']) && j(ask0.logs) === j([['char', ask0.toasts[0]]]) && j(ask0.notes) === j([['c_a', ask0.toasts[0], 'review']]) && j(ask0.changed) === j(['c_a']) && j(ask0.allowed) === j(['charask'])
        && (cl => cl.length === 1 && cl[0].ask === true && cl[0].id === e0.id && j(cl[0].changes[0].ov) === j({ stats: { granted: 10 } }) && cl[0].changes[0].row === 'w_1' && cl[0].changes[0].accept === true)(Sx.cleanUploads(ask0.camp.uploads)), j([ask0.answer, ask0.camp.uploads, ask0.toasts, ask0.notes]));
    const up0 = ask0.camp.uploads, ask1 = run({ uploads: up0 }, { stats: { granted: 5 } }), ask2 = run({ uploads: up0 }, { stats: { cp: 12 } }), back = run({ uploads: ask2.camp.uploads }, { stats: { granted: 0 } }), backAll = run({ uploads: up0 }, { stats: { granted: null } });
    const sheetUp = [{ id: 'up_file', charId: 'c_a', from: 'u_a', name: 'Pat', at: 1, changes: [{ id: 'u_1', kind: 'value', f: 'f_n', label: 'Num', from: '0', to: '3', value: 3, accept: true }] }], withFile = run({ uploads: sheetUp });
    check('1.5.5 char-ask: a newer ask of the same stat of a row replaces the older line; another stat adds a line of its own; an ask back to the row\'s own figure takes its line away (answered ok and back, the GM not told again), and with the entry\'s last line the entry; a sheet update waiting for the character stays beside the ask',
        ask1.camp.uploads.length === 1 && j(ask1.camp.uploads[0].changes.map(c => [c.id, c.to])) === j([['u_1', 'Granted points 5']]) && ask1.camp.uploads[0].id === e0.id
        && j(ask2.camp.uploads[0].changes.map(c => [c.id, c.to])) === j([['u_1', 'Granted points 10'], ['u_2', 'CP 12']])
        && j(back.answer) === j([{ ok: true, back: true, type: 'char-ask-ans', rid: 'q1' }]) && j(back.camp.uploads[0].changes.map(c => c.id)) === j(['u_2']) && back.toasts.length === 0 && back.notes.length === 0 && back.saves === 1 && back.charsSame
        && j(backAll.answer) === j([{ ok: true, back: true, type: 'char-ask-ans', rid: 'q1' }]) && backAll.camp.uploads.length === 0
        && withFile.camp.uploads.length === 2 && withFile.camp.uploads[0].id === 'up_file' && withFile.camp.uploads[1].ask === true, j([ask1.camp.uploads, ask2.camp.uploads, back.answer, back.camp.uploads, backAll.camp.uploads, withFile.camp.uploads.map(u => u.id)]));
    const held = run({}, { rowId: 'w_2', stats: { granted: 9 } }), pick = run({}, { stats: { al: 'Light' } });
    check('1.5.5 char-ask: a stat the GM set on the copy is asked all the same, its line unticked and marked as the GM\'s; a choice by its label',
        j(held.camp.uploads[0].changes[0]) === j({ kind: 'stat', f: 'f_pw', row: 'w_2', label: 'Powers: Gust', from: 'Granted points 4', to: 'Granted points 9', ov: { stats: { granted: 9 } }, accept: false, held: true, id: 'u_1' })
        && pick.camp.uploads[0].changes[0].to === 'Alignment Light' && pick.answer[0].ok === true, j([held.camp.uploads, pick.camp.uploads, pick.answer]));
    const refused = (why, o, msg) => { const t = run(o, msg); return j(t.answer) === j([{ reason: why, type: 'char-ask-ans', rid: 'q1' }]) && t.camp.uploads.length === (o && o.uploads ? o.uploads.length : 0) && t.saves === 0 && t.toasts.length === 0 && t.notes.length === 0 && t.charsSame; };
    const many = {}; for (let i = 0; i < 25; i++) many['s' + i] = 1;
    check('1.5.5 char-ask refused, answered why, nothing kept, saved or told: paused (the table or the player), sheets off, a character gone, a prototype\'s name for it, another player\'s, an NPC; the rate; stats that are none, empty, of a key a prototype holds or no stat\'s name, nested, a text with a control character, too long or 25 of them, a number past its bound, a stat the list lacks, a choice no option names; a row of their own, a row kept from them, a GM-only entry\'s copy, a row gone; a list only the GM changes, a field that is no list; the rule GM only or Players may change them; the same figure with nothing waiting',
        refused('paused', { paused: true }) && refused('paused', { peerPaused: true }) && refused('off', { sheetsOff: true }) && refused('missing', {}, { charId: 'c_9' }) && refused('missing', {}, { charId: '__proto__' }) && refused('owner', {}, { charId: 'c_b' }) && refused('owner', {}, { charId: 'c_n' }) && refused('slow', { slow: 'charask' })
        && refused('value', {}, { stats: null }) && refused('value', {}, { stats: {} }) && refused('value', {}, { stats: JSON.parse('{"__proto__":1}') }) && refused('value', {}, { stats: { '1x': 1 } }) && refused('value', {}, { stats: { granted: { a: 1 } } }) && refused('value', {}, { stats: { al: 'Li\u0007ght' } }) && refused('value', {}, { stats: { al: 'x'.repeat(61) } }) && refused('value', {}, { stats: many }) && refused('value', {}, { stats: { granted: 1e16 } }) && refused('value', {}, { stats: [1] })
        && refused('value', {}, { stats: { nope: 1 } }) && refused('value', {}, { stats: { al: 'Grey' } })
        && refused('field', {}, { rowId: 'w_own', stats: { cp: 4 } }) && refused('missing', {}, { rowId: 'w_hid' }) && refused('missing', {}, { rowId: 'w_gm' }) && refused('missing', {}, { rowId: 'w_9' }) && refused('value', {}, { rowId: 'bad id' })
        && refused('field', {}, { fieldId: 'f_gmL', rowId: 'w_g' }) && refused('field', {}, { fieldId: 'f_n' }) && refused('field', { rules: null }) && refused('field', { rules: { ownerStats: true } })
        && refused('same', {}, { stats: { granted: 0 } }) && run({}, { rid: 'q 1' }).answer.length === 0 && run({ from: 'pZ' }).answer.length === 0);
    // the rule: a player's own hand never makes the change directly under it (Setting A alone does), and a sheet update never takes an ask away
    const sysA = Sx.cleanSystem(raw({ statsAsk: true }), { F: Fx, gmView: true }), chA = { id: 'c_a', ownerId: 'u_a', values: { f_pw: [{ id: 'w_1', defId: 'i_gust', qty: 1 }] } };
    const direct = Sx.applyRowOp(sysA, chA, 'f_pw', { op: 'ov', rowId: 'w_1', ov: { stats: { granted: 10 } } }, Fx, { player: true, view: Sx.cleanSystem(raw({ statsAsk: true }), { F: Fx, gmView: false }) });
    check('1.5.5 char-ask: under the rule a player\'s own char-item change of a copy\'s stats is refused as it always was (only Players may change them lets their hand make it); the host\'s sheet update replaces an older sheet update of the character and never its ask; the answers\' branch takes char-ask-ans',
        direct.ok === false && direct.reason === 'field' && /filter\(function\(u\) \{ return u && \(u\.charId !== qu\.charId \|\| u\.ask === true\); \}\)/.test(src) && /msg\.type === 'char-ask-ans' \|\| msg\.type === 'char-make-ans'/.test(src), j(direct));
})());

// HUD frame (HF4b): a player's batched edit (a section's Reset all) — one message, one rate token, judged whole by the host
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const E = (n, extra) => Array.from({ length: n }, (_, i) => Object.assign({ fieldId: 'f_' + i, value: i }, extra || {}));
    const okC = Sx.cleanCharEdits({ rid: 'e1', charId: 'c_1', values: [{ fieldId: 'f_a', value: 3, junk: 1 }, { fieldId: 'f_b', value: { cur: '4', junk: 1 } }, { fieldId: 'f_c', value: true }], extra: 1 });
    const badC = [
        { rid: 'e1', charId: 'c_1', values: [] }, { rid: 'e1', charId: 'c_1', values: E(101) }, { rid: 'e1', charId: 'c_1', values: [{ fieldId: 'f_a', value: 1 }, { fieldId: 'f_a', value: 2 }] },
        { rid: 'bad rid!', charId: 'c_1', values: E(1) }, { rid: 'e1', charId: 'x', values: E(1) }, { rid: 'e1', charId: 'c_1', values: 'f_a' }, { rid: 'e1', charId: 'c_1', values: [{ fieldId: 'f_a', value: [1] }] },
        { rid: 'e1', charId: 'c_1', values: [null] }, { rid: 'e1', charId: 'c_1', values: [{ fieldId: '__proto__', value: 1 }] }, { rid: 'e1', charId: 'c_1', values: [{ fieldId: 'f_a', value: NaN }] }, null
    ].map(m => Sx.cleanCharEdits(m));
    check('HF4b cleanCharEdits: one to a hundred values of one character, each field once, each value by char-edit\'s own shape rules (only the keys it knows); anything else is dropped',
        j(okC) === j({ rid: 'e1', charId: 'c_1', values: [{ fieldId: 'f_a', value: 3 }, { fieldId: 'f_b', value: { cur: 4 } }, { fieldId: 'f_c', value: true }] }) && Sx.cleanCharEdits({ rid: 'e1', charId: 'c_1', values: E(100) }).values.length === 100 && badC.every(x => x === null), j([okC, badC]));
    // the host's handler, sliced from net.js and run against the real systemcore
    const chSrc = between('// [netcheck:charedits-start]', '// [netcheck:charedits-end]', 'charedits');
    const sys = Sx.cleanSystem({ v: 1, name: 'T', rolls: [], fields: [
        { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '10', def: 'max', min: 0, edit: 'owner', vis: 'all' },
        { id: 'f_ds', key: 'DS', kind: 'number', def: 0, min: 0, max: 3, edit: 'owner', vis: 'all', counter: true },
        { id: 'f_gm', key: 'G', kind: 'number', def: 0, edit: 'gm', vis: 'all' }] }, { F: Fx, gmView: true });
    const run = (msg, tweak) => {
        const sent = [], deltas = [], saves = [], env = { tokens: 0 }, o = { paused: false, peerPaused: false, on: true, limited: false, owner: 'u_a', char: true };
        if (tweak) tweak(o);
        const camp = { system: sys, chars: o.char ? { c_1: { id: 'c_1', name: 'A', ownerId: 'u_a', npc: false, values: { f_hp: { cur: 2 }, f_ds: 3 } } } : {} };
        const conn = { peer: 'pA', send(m) { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } };
        const net = { paused: o.paused, roster: { pA: { id: o.owner } }, syncCharDelta: (id, d) => deltas.push([id, JSON.parse(JSON.stringify(d))]) };
        const lim = { allow: () => { env.tokens++; return o.limited ? 'slow' : true; } };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'lim', 'own', 'var charLimit = lim, _charSlowSaid = {};\n' + chSrc)(
            msg, conn, net, () => Sx, { wpFormula: Fx, wpVtt: { on: k => k !== 'sheets' || o.on }, wpSheets: { charChanged() {} }, wpDiceCore: null }, () => o.peerPaused, () => camp, () => saves.push(1), () => {}, lim, H.own);
        return { sent, deltas, saves: saves.length, tokens: env.tokens, vals: camp.chars.c_1 ? camp.chars.c_1.values : null };
    };
    const M = values => ({ type: 'char-edits', rid: 'e1', charId: 'c_1', values });
    const good = run(M([{ fieldId: 'f_hp', value: { cur: 99 } }, { fieldId: 'f_ds', value: 0 }]));
    check('HF4b char-edits (host): a Reset all of two values takes ONE rate token and is stored whole — each value by its field\'s rules (the pool clamped to its max), ONE ack, ONE delta carrying both, one save; every message packs for the wire',
        good.tokens === 1 && j(good.sent) === j([{ type: 'char-ack', rid: 'e1' }]) && j(good.deltas) === j([['c_1', { f_hp: { cur: 10 }, f_ds: 0 }]]) && good.saves === 1 && j(good.vals) === j({ f_hp: { cur: 10 }, f_ds: 0 }), j(good));
    const oneBad = run(M([{ fieldId: 'f_hp', value: { cur: 10 } }, { fieldId: 'f_gm', value: 5 }])), badVal = run(M([{ fieldId: 'f_ds', value: 0 }, { fieldId: 'f_hp', value: 'lots' }])), noField = run(M([{ fieldId: 'f_hp', value: { cur: 10 } }, { fieldId: 'f_zz', value: 1 }]));
    const untouched = r => r.deltas.length === 0 && r.saves === 0 && j(r.vals) === j({ f_hp: { cur: 2 }, f_ds: 3 });
    check('HF4b char-edits (host): one value it may not set (a GM-edit field, a value that is not a number, a field that is not there) refuses the whole batch with ONE deny — nothing stored, no delta, no save',
        untouched(oneBad) && j(oneBad.sent) === j([{ type: 'char-deny', rid: 'e1', reason: 'field' }]) && untouched(badVal) && j(badVal.sent) === j([{ type: 'char-deny', rid: 'e1', reason: 'value' }]) && untouched(noField) && noField.sent.length === 1 && noField.sent[0].type === 'char-deny', j([oneBad.sent, badVal.sent, noField.sent]));
    const two = [{ fieldId: 'f_hp', value: { cur: 10 } }, { fieldId: 'f_ds', value: 0 }];
    const gates = [['paused', o => { o.paused = true; }], ['paused', o => { o.peerPaused = true; }], ['slow', o => { o.limited = true; }], ['off', o => { o.on = false; }], ['missing', o => { o.char = false; }], ['owner', o => { o.owner = 'u_b'; }]].map(([why, tw]) => [why, run(M(two), tw)]);
    const junk = run({ type: 'char-edits', rid: 'e1', charId: 'c_1', values: E(101) });
    check('HF4b char-edits (host): the same gates as one char-edit, in its order — a paused table or player, the rate (one "slow" answer), the sheets feature, a character that is gone, one that is not theirs — each refused with ONE deny and nothing stored; a malformed batch is dropped unanswered',
        gates.every(([why, r]) => j(r.sent) === j([{ type: 'char-deny', rid: 'e1', reason: why }]) && r.deltas.length === 0 && r.saves === 0) && gates[0][1].tokens === 0 && gates[2][1].tokens === 1 && junk.sent.length === 0 && junk.tokens === 0,
        j(gates.map(([w, r]) => [w, r.sent, r.tokens])));
    const ceOrder = ['Sm.cleanCharEdits(msg); if (!qm) return;', "denyM('paused')", 'charLimit.allow(conn.peer, Date.now())', "denyM('off')", "denyM('missing')", "denyM('owner')", 'Sm.applyEdit(campM.system, workM,', "{ type: 'char-ack', rid: qm.rid }", 'net.syncCharDelta(qm.charId, dM);'];
    let ceAt = -1; const ceIn = ceOrder.every(t => { const p = chSrc.indexOf(t, ceAt + 1); if (p < 0) return false; ceAt = p; return true; });
    check('HF4b char-edits (source): the gates run in char-edit\'s order before any value is judged, the values are judged on a working copy and stored only after all pass; the client sends one message of the cleaned values',
        ceIn && /if \(!resM\.ok\) \{ denyM\(resM\.reason\); return; \}/.test(chSrc) && chSrc.indexOf('chM.values = workM.values') > chSrc.indexOf('for (var iM = 0;')
        && /net\.charEdits = function\(charId, list\) \{/.test(src) && (src.match(/type: 'char-edits'/g) || []).length === 1);
})());
// 1.6.0: a file an outside reader on the host writes for a player's own character: the real branch on the host, the real question and answer on a
// player's app, with the real core and a reader of the suite's own that writes everything it is handed
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const askSrc = between('// [netcheck:sheetoutask-start]', '// [netcheck:sheetoutask-end]', 'sheetoutask'), brSrc = between('// [netcheck:sheetout-start]', '// [netcheck:sheetout-end]', 'sheetout'), ansSrc = between('// [netcheck:sheetoutans-start]', '// [netcheck:sheetoutans-end]', 'sheetoutans');
    const SECRET = 'GM-ONLY-WORDS', raw = { v: 1, name: 'O', fields: [{ id: 'f_a', key: 'Open', label: 'Open', kind: 'text', vis: 'all', edit: 'owner' }, { id: 'f_b', key: 'Secret', label: 'Secret', kind: 'text', vis: 'gm', edit: 'gm' }] };
    const sysO = Sx.cleanSystem(raw, { F: Fx, gmView: true }), viewO = Sx.cleanSystem(raw, { F: Fx, gmView: false });
    const reader = (o) => ({ id: 'testr', ui: { playerFile: { label: 'For elsewhere (.json)', sub: 'A file', write: (ctx) => { if (o.boom) throw new Error('no'); if (o.bad) return { name: '../../evil.exe', text: 'x' }; if (o.note) return { name: 'a.json', text: '{}', note: ' A thinner\n file, as this one has no build. ' }; return Promise.resolve({ name: '..\\my <b>sheet</b>.json', text: JSON.stringify({ ctx: { c: ctx.char, s: ctx.system, id: ctx.campId } }) + (o.long ? 'y'.repeat(700000) : '') }); } } } });
    const host = async (msg, o) => {
        o = o || {}; const sent = [], allowed = [], ch = { id: 'c_a', name: 'Ann', ownerId: o.owner === undefined ? 'u_a' : o.owner, npc: !!o.npc, values: { f_a: 'mine', f_b: SECRET } };
        const camp = { id: 'camp1', system: sysO, chars: { c_a: ch } }, conn = { peer: 'pA', send(m) { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } };
        const S2 = Object.assign({}, Sx, { readers: () => (o.none ? [] : [reader(o)]) });
        const helpers = 'function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }\nfunction peerProfileId(c) { return "u_a"; }\nvar OUT_PARTS = 20, OUT_PART = 300000;\n';
        new Function('msg', 'conn', 'SC', 'window', 'getActiveCampaign', 'sendFailed', 'allow', 'charViewFor', helpers + 'if (true) {\n' + brSrc + '\n}')(Object.assign({ type: 'sheet-out', rid: 'qa1', id: 'testr', charId: 'c_a' }, msg || {}), conn, () => S2, { wpFormula: Fx, wpVtt: { on: () => o.off !== true }, wpSheets: { playerSystem: () => viewO } }, () => camp, e => { throw e; }, (n, c, p) => { allowed.push(n); return o.slow !== true; }, (id, pid) => Sx.charFor(ch, viewO, pid, {}));
        await new Promise(r => setTimeout(r, 5));
        return { sent, allowed };
    };
    const j = JSON.stringify, a1 = await host(), aLong = await host(null, { long: true }), aBad = await host(null, { bad: true }), aBoom = await host(null, { boom: true }), aSlow = await host(null, { slow: true }), aOff = await host(null, { off: true }), aMate = await host(null, { owner: 'u_q' }), aNpc = await host(null, { npc: true }), aNone = await host(null, { none: true }), aOdd = await host({ rid: '<x>' }), aId = await host({ id: 'NOT VALID' }), aChar = await host({ charId: 'c_nope' });
    const words = r => r.sent.map(m => m.reason || 'file').join(), f1 = a1.sent[0] || {}, whole = (f1.parts || []).join('');
    check('1.6.0 a reader\'s file for a player (sheet-out, the host\'s branch run for real): their own character is written from the owner\'s copy and the players\' view alone, so a GM-only field and its value are in nothing sent; a name is cleaned to a plain file name, a long file goes in parts the wire takes; a name that is no .json, a write that throws, the rate, the feature off, another\'s character, an NPC, no such reader are each answered in a word; a malformed ask is answered nothing',
        f1.type === 'sheet-out-ans' && f1.rid === 'qa1' && f1.name === 'my bsheetb.json' && whole.includes('mine') && !j(a1.sent).includes(SECRET) && !j(a1.sent).includes('f_b') && aLong.sent[0].parts.length === 3 && aLong.sent[0].parts.every(p => p.length <= 300000) && !j(aLong.sent).includes(SECRET)
        && words(aBad) === 'unread' && words(aBoom) === 'unread' && words(aSlow) === 'slow' && words(aOff) === 'off' && words(aMate) === 'owner' && words(aNpc) === 'owner' && words(aNone) === 'none' && aOdd.sent.length === 0 && aId.sent.length === 0 && words(aChar) === 'owner' && j(a1.allowed) === j(['sheetout']),
        j([a1.sent.map(m => [m.name, m.reason]), words(aLong), words(aBad), words(aBoom), words(aSlow), words(aOff), words(aMate), words(aNpc), words(aNone), aOdd.sent, aId.sent, words(aChar)]));
    const player = () => {
        const sent = [], got = [], net = { active: true, role: 'client', foreign: true, syncedPeer: 'pH', conns: [{ open: true, send(m) { sent.push(m); } }] };
        const api = new Function('net', 'SC', 'getActiveCampaign', askSrc + '\nreturn { know: sheetOutsKnow, ans: function(msg, conn) { if (true) {\n' + ansSrc + '\n} } };')(net, () => Sx, () => null);
        return { net, api, sent, got, ask: () => net.sheetOut('testr', 'c_a', (f, why) => got.push([f, why])) };
    };
    const aNote = await host(null, { note: true }), N = player(); N.ask(); N.api.ans({ rid: N.sent[0].rid, name: 'a.json', parts: ['{}'], note: ' Thin. ' }, { peer: 'pH' });
    const N2 = player(); N2.ask(); N2.api.ans({ rid: N2.sent[0].rid, name: 'a.json', parts: ['{}'], note: 7 }, { peer: 'pH' });
    check('1.6.0 a reader may say a word with a player\'s file: the host sends it cleaned, one line of plain text, a player\'s app cleans it again and shows it with the saved file, and a file with none has no such key (the host\'s branch, the question and the answer, run for real)',
        aNote.sent[0].note === 'A thinner file, as this one has no build.' && aNote.sent[0].name === 'a.json' && !('note' in a1.sent[0]) && j(N.got) === j([[{ name: 'a.json', text: '{}', note: 'Thin.' }, '']]) && j(N2.got) === j([[{ name: 'a.json', text: '{}' }, '']])
        && fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8').includes("(file.note ? ' ' + file.note : '')"), j([aNote.sent, N.got, N2.got]));
    const P = player(); P.api.know([{ id: 'testr', label: 'For <b>x</b>', sub: 7 }, { id: 'BAD ID', label: 'No' }, { id: 'testr', label: 'Twice' }, { id: 'other' }, 'nope']); const offered = P.net.sheetOuts();
    P.ask(); const rid = P.sent[0].rid; P.api.ans({ rid: 'other', name: 'a.json', parts: ['x'] }, { peer: 'pH' }); P.api.ans({ rid, name: 'a.json', parts: ['x'] }, { peer: 'pEvil' }); const quiet = P.got.length; P.api.ans({ rid, name: '../a.json', parts: ['{', '}'] }, { peer: 'pH' }); const first = P.got.slice(); P.api.ans({ rid, name: 'b.json', parts: ['z'] }, { peer: 'pH' });
    const Q = player(); Q.ask(); Q.api.ans({ rid: Q.sent[0].rid, reason: 'slow' }, { peer: 'pH' }); const R2 = player(); R2.ask(); R2.api.ans({ rid: R2.sent[0].rid, name: 'a.json', parts: new Array(21).fill('x') }, { peer: 'pH' }); const T2 = player(); T2.ask(); T2.api.ans({ rid: T2.sent[0].rid, name: 'a.exe', parts: ['x'] }, { peer: 'pH' }); const U2 = player(); U2.ask(); U2.api.ans({ rid: U2.sent[0].rid, name: 'a.json', parts: ['x'.repeat(300000), 'x'.repeat(300000)].concat(new Array(14).fill('y'.repeat(300000))) }, { peer: 'pH' });
    check('1.6.0 a reader\'s file on a player\'s app (the question and the answer, run for real): what a host offers is cleaned, an id once with a name as text; the answer is taken from the synced host alone, for the question still open, once; its name and its size are cleaned here again, and a reason comes back as a word',
        j(offered) === j([{ id: 'testr', label: 'For <b>x</b>', sub: '' }]) && P.sent[0].type === 'sheet-out' && P.sent[0].id === 'testr' && P.sent[0].charId === 'c_a' && quiet === 0 && j(first) === j([[{ name: 'a.json', text: '{}' }, '']]) && P.got.length === 1 && j(Q.got) === j([[null, 'slow']]) && j(R2.got) === j([[null, 'unread']]) && j(T2.got) === j([[null, 'unread']]) && U2.got.length === 1 && U2.got[0][0] === null,
        j([offered, P.got, Q.got, R2.got, T2.got, U2.got.length]));
    check('1.6.0 a reader\'s file: nothing of it where no reader offers one (the snapshot names it only with a row to name), a player\'s Download menu asks net.sheetOuts for their own character alone and saves what comes back as any export is, its words as text',
        ['cleanSheetOuts', 'cleanSheetOutReq', 'cleanSheetFile'].every(n => fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'systemcore.js'), 'utf8').includes(n + ': ' + n + ',')) && src.includes("var soSnap = typeof sheetOutsHere === 'function' ? sheetOutsHere() : []; if (soSnap.length) snap.sheetOut = soSnap;") && require('./checkkit').part('netfog.js').includes("if (typeof sheetOutsKnow === 'function') sheetOutsKnow(msg.sheetOut);") && /if \(!gm && c\.ownerId === myId\(\)\) \{ var nO = net\(\);/.test(fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8')) && /saveTextFile\(file\.name, file\.text, 'application\/json'\)/.test(fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8')));
})());

// 1.6.3 (backlog 170): a field Locked while a test of the character holds. The host's char-edit and char-edits (sliced, run for real with the real
// systemcore and formula engine and the host's own per-peer sync) refuse a player's change to it in the lock's own words while the test holds,
// store, send and save nothing, and let it through once the test no longer holds. A player is judged by their own view's lock, so a lock whose
// test reads a GM-only value never holds them back, and the host works their view out only where the field has a lock
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const edSrc = between('// [netcheck:charedit-start]', '// [netcheck:charedit-end]', 'charedit'), msSrc = between('// [netcheck:charedits-start]', '// [netcheck:charedits-end]', 'charedits'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const lkSrcL = between('// [netcheck:lockopts-start]', '// [netcheck:lockopts-end]', 'lockopts');   // the review: how the host judges a player's lock
    const sysL = Sx.cleanSystem({ v: 1, name: 'L', rolls: [], fields: [
        { id: 'f_off', key: 'Off', kind: 'toggle', edit: 'owner' }, { id: 'f_sec', key: 'Secret', kind: 'number', def: 2, vis: 'gm' },
        { id: 'f_hp', key: 'HP', kind: 'number', def: 5, edit: 'owner', lock: { 'if': 'Off', says: 'Switched off.' } },
        { id: 'f_gr', key: 'Grit', kind: 'number', def: 1, edit: 'owner', lock: { 'if': 'Secret > 0' } }] }, { F: Fx, gmView: true });
    const host = (src, msg, off) => {
        const camp = { id: 'k', system: sysL, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_off: off, f_hp: 5, f_gr: 1 } } } };
        const out = { answer: [], owner: [], saves: 0, views: 0 }, box = bx => m => { packCheck(m); bx.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: 'pA', send: box(out.answer) };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => { out.views++; return Sx.cleanSystem(c.system, { F: Fx, gmView: false }); }, charChanged() {} }, wpDiceCore: null };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + lkSrcL + '\n' + dlSrc + '\n' + src)(
            msg, conn, net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true });
        out.vals = camp.chars.c_1.values; return out;
    };
    const E1 = (fid, v) => ({ type: 'char-edit', rid: 'e1', charId: 'c_1', fieldId: fid, value: v }), B = values => ({ type: 'char-edits', rid: 'e1', charId: 'c_1', values });
    const said = r => j(r.answer) === j([{ type: 'char-deny', rid: 'e1', reason: 'value', msg: 'Switched off.' }]) && r.owner.length === 0 && r.saves === 0 && r.vals.f_hp === 5 && r.vals.f_gr === 1;
    const lock1 = host(edSrc, E1('f_hp', 9), true), open1 = host(edSrc, E1('f_hp', 9), false), gm1 = host(edSrc, E1('f_gr', 7), true), plain1 = host(edSrc, E1('f_off', false), true);
    check('1.6.3 Locked while (host char-edit): a player\'s change to a locked field is refused in the lock\'s own words while its test holds, nothing stored, sent or saved; once it no longer holds the change is acked and stored; every message packs',
        said(lock1) && j(open1.answer) === j([{ type: 'char-ack', rid: 'e1' }]) && open1.vals.f_hp === 9 && open1.saves === 1 && open1.owner.length === 1, j([lock1.answer, open1.answer, open1.vals]));
    check('1.6.3 Locked while (host char-edit): a lock whose test reads a GM-only value is not in the player\'s view, so it never holds them back; the player\'s view is worked out only for a field with a lock (the host\'s own sync to the owner counts one more where a change is stored)',
        j(gm1.answer) === j([{ type: 'char-ack', rid: 'e1' }]) && gm1.vals.f_gr === 7 && gm1.views === plain1.views + 1 && j(plain1.answer) === j([{ type: 'char-ack', rid: 'e1' }]) && lock1.views === 1, j([gm1.answer, gm1.views, plain1.views, lock1.views]));
    const lockB = host(msSrc, B([{ fieldId: 'f_gr', value: 4 }, { fieldId: 'f_hp', value: 9 }]), true), openB = host(msSrc, B([{ fieldId: 'f_gr', value: 4 }, { fieldId: 'f_hp', value: 9 }]), false);
    check('1.6.3 Locked while (host char-edits): one locked field refuses the whole batch in the lock\'s words with nothing stored, and the batch goes through whole once the test no longer holds; the view is worked out once a batch',
        said(lockB) && j(openB.answer) === j([{ type: 'char-ack', rid: 'e1' }]) && openB.vals.f_gr === 4 && openB.vals.f_hp === 9 && openB.views === lockB.views + 1 && lockB.views === 1, j([lockB.answer, openB.answer, openB.vals, openB.views]));
})());

// 1.6.3, the review of backlog 170: the host judges a player's change by hand to a locked field as their own sheet judges it (lockOptsHost, sliced
// and run for real): by their own view's lock, on the copy of the character they hold (systemcore charFor), in their token's context on the map
// they are on, so a lock on a posture holds on the host as their sheet draws it; a field their typing fills is passed over while its lock holds, the typed field still stored; and a look on a text is held by
// the lock as an edit is, in the lock's own words, while a lock whose test reads a GM-only value never holds it back
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const edSrc = between('// [netcheck:charedit-start]', '// [netcheck:charedit-end]', 'charedit'), msSrc = between('// [netcheck:charedits-start]', '// [netcheck:charedits-end]', 'charedits'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const lkSrc = between('// [netcheck:lockopts-start]', '// [netcheck:lockopts-end]', 'lockopts'), stSrc = between('// [netcheck:charstyle-start]', '// [netcheck:charstyle-end]', 'charstyle');
    const sysK = Sx.cleanSystem({ v: 1, name: 'K', rolls: [], combat: { postures: [{ id: 'p_stand', name: 'Standing' }, { id: 'p_prone', name: 'Prone' }] }, items: [{ id: 'i_a', key: 'Ring', name: 'Ring', category: 'Gear' }, { id: 'i_g', key: 'Gem', name: 'Gem', category: 'Gear', vis: 'gm', mods: [{ f: 'f_st', op: 'add', v: 2 }] }], fields: [
        { id: 'f_off', key: 'Off', kind: 'toggle', edit: 'owner' }, { id: 'f_sec', key: 'Secret', kind: 'number', def: 2, vis: 'gm' },
        { id: 'f_gear', key: 'Gear', kind: 'item-list', edit: 'owner', list: { cats: ['Gear'], on: {} } }, { id: 'f_st', key: 'ST', kind: 'number', def: 1, edit: 'owner' },
        { id: 'f_hp', key: 'HP', kind: 'number', def: 5, edit: 'owner', lock: { 'if': 'Posture = Posture.Prone', says: 'Down.' } },
        { id: 'f_cnt', key: 'Charm', kind: 'number', edit: 'owner', lock: { 'if': 'ST < 2', says: 'Too weak.' } },
        { id: 'f_ht', key: 'Ht', kind: 'number', edit: 'owner', fills: [{ f: 'f_wt', formula: 'Ht * 2' }] }, { id: 'f_wt', key: 'Wt', kind: 'number', edit: 'owner', lock: { 'if': 'Off', says: 'Switched off.' } },
        { id: 'f_nk', key: 'Nick', kind: 'text', edit: 'owner', lock: { 'if': 'Off', says: 'Switched off.' } }, { id: 'f_ng', key: 'Tag', kind: 'text', edit: 'owner', lock: { 'if': 'Secret > 0' } }] }, { F: Fx, gmView: true });
    const chK = (off, rows) => ({ id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_off: off, f_hp: 5, f_nk: 'Bo', f_ng: 'Al', f_gear: rows || [{ id: 'r_1', defId: 'i_a', qty: 1 }, { id: 'r_2', defId: 'i_g', qty: 1 }] } });
    const host = (src, msg, off, pos, rows) => {   // pos: the posture of the player's token on the map they are on; rows: the character's Gear, where it differs
        const camp = { id: 'k', system: sysK, chars: { c_1: chK(off, rows) }, items: { m_1: { id: 'm_1', type: 'map', meta: {}, whiteboard: [{ id: 't_1', type: 'rect', isChar: true, charId: 'c_1', ownerId: 'u_a', posture: pos || 'p_stand', x: 0, y: 0, width: 50, height: 50 }] } } };
        const out = { answer: [], owner: [], saves: 0 }, box = bx => m => { packCheck(m); bx.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: 'pA', send: box(out.answer) };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a', location: 'm_1' } }, syncCharStyle() {} };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'var charLimit = lim, styleLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + lkSrc + '\n' + dlSrc + '\n' + src)(
            msg, conn, net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true });
        out.ch = camp.chars.c_1; return out;
    };
    const E1 = (fid, v) => ({ type: 'char-edit', rid: 'e1', charId: 'c_1', fieldId: fid, value: v }), ack = [{ type: 'char-ack', rid: 'e1' }];
    const B1 = (fid, v) => ({ type: 'char-edits', rid: 'e1', charId: 'c_1', values: [{ fieldId: fid, value: v }] }), down = [{ type: 'char-deny', rid: 'e1', reason: 'value', msg: 'Down.' }];
    const prE = host(edSrc, E1('f_hp', 9), false, 'p_prone'), stE = host(edSrc, E1('f_hp', 9), false, 'p_stand'), prB = host(msSrc, B1('f_hp', 9), false, 'p_prone'), stB = host(msSrc, B1('f_hp', 9), false, 'p_stand');
    check('the review of backlog 170 (host char-edit and char-edits): a lock that reads the token (Posture = Posture.Prone) is judged in the player\'s token context on the map they are on, as their own sheet draws it: refused in its words while their token lies prone, nothing stored, and acked while it stands',
        j(prE.answer) === j(down) && prE.ch.values.f_hp === 5 && prE.saves === 0 && j(stE.answer) === j(ack) && stE.ch.values.f_hp === 9 && j(prB.answer) === j(down) && prB.ch.values.f_hp === 5 && j(stB.answer) === j(ack) && stB.ch.values.f_hp === 9, j([prE.answer, stE.answer, prB.answer, stB.answer]));
    const lohF = new Function('window', 'net', lkSrc + '\nreturn lockOptsHost;'), campO = { system: sysK, items: {} }, ownCp = Sx.charFor(chK(true), Sx.cleanSystem(sysK, { F: Fx, gmView: false }), 'u_a', { full: sysK });
    const lo = lohF({ wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) } }, {})(Sx, campO, chK(true), { id: 'u_a' }, Fx), loNo = lohF({}, {})(Sx, campO, chK(true), { id: 'u_a' }, Fx);
    check('the review of backlog 170 (lockOptsHost): it answers the player\'s own view and the copy of the character they hold (charFor\'s, the same values key for key), with no token context where they stand on no map; with no view to be had it answers a plain player\'s mark, which judges by the GM\'s own lock',
        j(Object.keys(lo)) === j(['player', 'view', 'lockChar']) && j(lo.lockChar.values) === j(ownCp.values) && lo.view.fields.every(f => f.id !== 'f_sec') && j(loNo) === j({ player: true }), j([Object.keys(lo), loNo]));
    // A GM-only item whose change raises ST reaches its owner as a nameless inline row (F4a), which their sheet counts, while the players'
    // view of the system has no such item, so the GM's own character read on that view leaves the change out. The lock "ST < 2" is open on
    // their sheet (ST 3, with the row as a plain GM-only row or as a curse the GM keeps on) and held on that wrong reading (ST 1)
    const curse = [{ id: 'r_1', defId: 'i_a', qty: 1 }, { id: 'r_2', defId: 'i_g', qty: 1, on: true, keptOn: 1 }], viewK = Sx.cleanSystem(sysK, { F: Fx, gmView: false }), itemsK = {}; sysK.items.forEach(d => { itemsK[d.id] = d; });
    const cntG = host(edSrc, E1('f_cnt', 3), false), cntC = host(edSrc, E1('f_cnt', 3), false, null, curse), cntB = host(msSrc, B1('f_cnt', 3), false, null, curse), cntL = host(edSrc, E1('f_cnt', 3), false, null, [{ id: 'r_1', defId: 'i_a', qty: 1 }]);
    const oldWay = Sx.applyEdit(sysK, chK(false, curse), 'f_cnt', 3, Fx, { player: true, view: viewK }), ownOf = rows => Sx.resolveAll(viewK, Sx.charFor(chK(false, rows), viewK, 'u_a', { items: itemsK, full: sysK }), Fx).f_cnt.locked;
    check('the review of backlog 170 (host char-edit and char-edits, finding 4): a lock is read on the copy of the character the player holds, so a GM-only row, or a curse the GM keeps on, counts on the host exactly as on their sheet: a lock their sheet shows open (ST 3, its change carried inline) is open on the host and the value stored, where judging the GM\'s own character on their view refused it; a lock that holds on their sheet is still refused in its words, nothing stored',
        ownOf(curse) === undefined && ownOf(chK(false).values.f_gear) === undefined && oldWay.locked === true && j(cntG.answer) === j(ack) && cntG.ch.values.f_cnt === 3 && j(cntC.answer) === j(ack) && cntC.ch.values.f_cnt === 3 && j(cntB.answer) === j(ack) && cntB.ch.values.f_cnt === 3
        && ownOf([{ id: 'r_1', defId: 'i_a', qty: 1 }]) === 'Too weak.' && j(cntL.answer) === j([{ type: 'char-deny', rid: 'e1', reason: 'value', msg: 'Too weak.' }]) && cntL.ch.values.f_cnt === undefined && cntL.saves === 0, j([oldWay, cntG.answer, cntC.answer, cntB.answer, cntL.answer]));
    const fl = host(edSrc, E1('f_ht', 5), true), flO = host(edSrc, E1('f_ht', 5), false), flB = host(msSrc, { type: 'char-edits', rid: 'e1', charId: 'c_1', values: [{ fieldId: 'f_ht', value: 5 }] }, true);
    check('the review of backlog 170 (host char-edit and char-edits): typing a field never fills a field locked for that player now; the typed field is stored and acked, and once the lock no longer holds the fill is written',
        j(fl.answer) === j(ack) && fl.ch.values.f_ht === 5 && fl.ch.values.f_wt === undefined && j(flB.answer) === j(ack) && flB.ch.values.f_wt === undefined && flO.ch.values.f_wt === 10, j([fl.ch.values, flO.ch.values, flB.ch.values]));
    const S1 = fid => ({ type: 'char-style', rid: 'y1', charId: 'c_1', fieldId: fid, look: null });
    const stL = host(stSrc, S1('f_nk'), true), stO = host(stSrc, S1('f_nk'), false), stG = host(stSrc, S1('f_ng'), true);
    check('the review of backlog 170 (host char-style): a look on a locked text is refused in the lock\'s own words, nothing stored or saved; with the lock not holding it is acked; a lock whose test reads a GM-only value never holds a player\'s look back, as their own view has none',
        j(stL.answer) === j([{ type: 'charstyle-deny', rid: 'y1', reason: 'value', msg: 'Switched off.' }]) && stL.saves === 0 && j(stO.answer) === j([{ type: 'charstyle-ack', rid: 'y1' }]) && j(stG.answer) === j([{ type: 'charstyle-ack', rid: 'y1' }]), j([stL.answer, stO.answer, stG.answer]));
})());

// 1.5.0 GM-only pools: a visible pool whose max is worked out from a GM-only field is GM-only as a whole. The host's char-edit, char-edits and
// char-effect (sliced, run for real with the real systemcore, formula engine and the host's own per-peer sync, also sliced) never let the hidden
// max reach a player: an edit of such a pool is refused (never clamped and answered), and what the host stores in it (an effect's clamp, the GM's
// own fill or damage) never travels, to its owner or a teammate
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const edSrc = between('// [netcheck:charedit-start]', '// [netcheck:charedit-end]', 'charedit'), msSrc = between('// [netcheck:charedits-start]', '// [netcheck:charedits-end]', 'charedits');
    const fxSrc = between('// [netcheck:charfx-start]', '// [netcheck:charfx-end]', 'charfx'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const sysP = Sx.cleanSystem({ v: 1, name: 'P', rolls: [], fields: [
        { id: 'f_g', key: 'GMFig', kind: 'number', def: 12, vis: 'gm' }, { id: 'f_wis', key: 'Wis', kind: 'number', def: 5, edit: 'owner' }, { id: 'f_bon', key: 'Bonus', kind: 'formula', formula: 'GMFig + 1' },
        { id: 'f_vig', key: 'Vigor', kind: 'resource', maxFormula: 'GMFig * 2', def: 'max', min: 0, edit: 'owner', hover: true },
        { id: 'f_gri', key: 'Grit', kind: 'resource', maxFormula: 'Bonus', def: 0, min: 0, edit: 'owner' },
        { id: 'f_mana', key: 'Mana', kind: 'resource', maxFormula: 'Wis * 2', def: 'max', min: 0, edit: 'owner', hover: true }, { id: 'f_fx', key: 'Fx', kind: 'effects', edit: 'owner' }],
        effects: [{ id: 'e_dr', name: 'Drain', mods: [{ f: 'f_vig', op: 'add', v: -5, part: 'max' }, { f: 'f_mana', op: 'add', v: -3, part: 'max' }] }] }, { F: Fx, gmView: true });
    const hideP = /f_vig|f_gri|Vigor|Grit/;
    const host = (src, msg) => {
        const camp = { id: 'k', system: sysP, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_vig: { cur: 20 }, f_gri: { cur: 4 }, f_mana: { cur: 10 } } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
        const out = { answer: [], owner: [], mate: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: 'pA', send: box(out.answer) };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + (src || ''))(
            msg, conn, net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true });
        out.camp = camp; out.net = net; out.vals = camp.chars.c_1.values; return out;
    };
    const quiet = r => r.owner.length === 0 && r.mate.length === 0 && r.saves === 0 && j(r.vals) === j({ f_vig: { cur: 20 }, f_gri: { cur: 4 }, f_mana: { cur: 10 } });
    const E1 = (fid, cur) => ({ type: 'char-edit', rid: 'e1', charId: 'c_1', fieldId: fid, value: { cur } }), deny = r => j(r.answer) === j([{ type: 'char-deny', rid: 'e1', reason: 'field' }]);
    const eV = host(edSrc, E1('f_vig', 999)), eV1 = host(edSrc, E1('f_vig', 1)), eG = host(edSrc, E1('f_gri', 999)), eM = host(edSrc, E1('f_mana', 999));
    check('GM-only pools: a player\'s char-edit of a pool whose max is GM-only (directly, or through a visible formula) is refused like a GM-only field\'s ("field") whatever the value — never clamped against the hidden max and answered: nothing stored, sent or saved; a pool with a visible max is still clamped, acked and synced; every message packs',
        [eV, eV1, eG].every(r => deny(r) && quiet(r)) && j(eM.answer) === j([{ type: 'char-ack', rid: 'e1' }]) && j(eM.vals.f_mana) === j({ cur: 10 }) && j(eM.owner) === j([{ type: 'charDelta', campId: 'k', id: 'c_1', values: { f_mana: { cur: 10 } } }]) && eM.saves === 1,
        j([eV.answer, eG.answer, eM.answer, eM.owner]));
    const B = values => ({ type: 'char-edits', rid: 'e1', charId: 'c_1', values }), bV = host(msSrc, B([{ fieldId: 'f_mana', value: { cur: 3 } }, { fieldId: 'f_vig', value: { cur: 999 } }])), bG = host(msSrc, B([{ fieldId: 'f_gri', value: { cur: 0 } }]));
    check('GM-only pools: a player\'s char-edits (a Reset all) naming such a pool is refused whole with ONE "field" deny, nothing stored, sent or saved',
        [bV, bG].every(r => deny(r) && quiet(r)), j([bV.answer, bV.owner, bG.answer]));
    const fX = host(fxSrc, { type: 'char-effect', rid: 'e1', charId: 'c_1', fieldId: 'f_fx', op: 'add', rowId: 'x_1', ref: 'e_dr' });
    const fOwn = fX.owner.length === 1 ? fX.owner[0] : {}, fMate = fX.mate.length === 1 ? fX.mate[0] : {};
    check('GM-only pools: an effect a player adds that lowers such a pool\'s max is stored with the host\'s clamp (Vigor 20 to 19, Mana 10 to 7) and acked, but the owner\'s delta carries the effect and Mana only, and a teammate\'s copy (hover fields, host-worked lines) nothing of Vigor',
        j(fX.answer) === j([{ type: 'char-ack', rid: 'e1' }]) && j(fX.vals.f_vig) === j({ cur: 19 }) && j(fX.vals.f_mana) === j({ cur: 7 })
        && fOwn.type === 'charDelta' && j(Object.keys(fOwn.values || {}).sort()) === j(['f_fx', 'f_mana']) && j(fOwn.values.f_mana) === j({ cur: 7 })
        && fMate.type === 'char' && fMate.char.partial === true && !hideP.test(j(fMate.char)) && (fMate.char.lines || []).some(l => /^Mana 7/.test(l)), j([fX.answer, fX.vals, fX.owner, fX.mate]));
    const gm = host('');   // the GM's own changes: a fill, Reset all, damage from full — the host stores the number, then syncs it as every change is
    Object.assign(gm.vals, { f_vig: { cur: 24 }, f_gri: { cur: 13 } }); gm.net.syncCharDelta('c_1', { f_vig: { cur: 24 }, f_gri: { cur: 13 } });
    const gmOnlyOut = gm.owner.length + gm.mate.length;
    gm.vals.f_vig = { cur: 11 }; gm.vals.f_mana = { cur: 9 }; gm.net.syncCharDelta('c_1', { f_vig: { cur: 11 }, f_mana: { cur: 9 } }); gm.net.syncChars(); gm.net.syncChar('c_1');
    check('GM-only pools: a number the GM\'s machine stores in such a pool (a fill, Reset all, blast damage) reaches no one — alone, nothing is sent; beside a visible change, the owner gets only that; a whole resend (syncChars, syncChar) carries it to no one',
        gmOnlyOut === 0 && j(gm.owner[0]) === j({ type: 'charDelta', campId: 'k', id: 'c_1', values: { f_mana: { cur: 9 } } }) && gm.owner.length === 3 && gm.mate.length === 3 && !gm.owner.concat(gm.mate).some(m => hideP.test(j(m))), j([gm.owner, gm.mate]));
})());

// Turn-based combat T5b on the wire: a player's press on a timed effect's countdown (pause, resume, reset, dismiss) through the host's
// char-effect (the [netcheck:charfx] slice, run for real with the real systemcore): its owner may unless the campaign keeps timers the GM's;
// a teammate never; an unknown act never passes the shape. And the player's own machine (net.charEffect, sliced) sends the act, and holds
// back a press the campaign keeps the GM's
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const fxSrc = between('// [netcheck:charfx-start]', '// [netcheck:charfx-end]', 'charfx'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const sysQ = Sx.cleanSystem({ v: 1, name: 'Q', rolls: [], fields: [{ id: 'f_fx', key: 'Fx', kind: 'effects', edit: 'owner' }], effects: [{ id: 'e_b', name: 'Bless', dur: '2 turns', mods: [] }] }, { F: Fx, gmView: true });
    const row0 = () => [{ id: 'x_1', ref: 'e_b', on: true, t: { left: 12, at: 0 } }];
    const host = (act, rules, from) => {
        const camp = { id: 'k', system: sysQ, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_fx: row0() } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
        if (rules) camp.turnRules = rules;
        const out = { answer: [], owner: [], mate: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: from || 'pA', send: box(out.answer) };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const msg = { type: 'char-effect', rid: 'e1', charId: 'c_1', fieldId: 'f_fx', op: 'timer', rowId: 'x_1', act };
        new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + fxSrc)(
            msg, conn, net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true });
        out.list = camp.chars.c_1.values.f_fx; return out;
    };
    const same = r => j(r.list) === j(row0()) && r.owner.length === 0 && r.mate.length === 0 && r.saves === 0;
    const pA = host('pause'), pG = host('pause', { timers: 'gm' }), pO = host('pause', { timers: 'owner' }), pB = host('pause', null, 'pB'), pX = host('explode'), rA = host('reset'), dA = host('dismiss');
    const ownT = r => { const d = r.owner.find(m => m.type === 'charDelta'); return d && d.values && d.values.f_fx ? d.values.f_fx[0].t : undefined; };
    check('T5b on the wire (host): the owner\'s pause is stored, acked, saved and synced to them with the paused countdown (a teammate\'s copy carries none); with Effect timers "You only" refused as "field", nothing stored, sent or saved; a teammate\'s press refused as not theirs; an unknown act dropped unanswered; reset from now, dismiss drops the countdown',
        j(pA.answer) === j([{ type: 'char-ack', rid: 'e1' }]) && j(pA.list[0].t) === j({ left: 12, at: 0, p: 1 }) && j(ownT(pA)) === j({ left: 12, at: 0, p: 1 }) && pA.saves === 1 && !/"t":/.test(j(pA.mate))
        && j(pG.answer) === j([{ type: 'char-deny', rid: 'e1', reason: 'field' }]) && same(pG) && j(pO.list[0].t) === j({ left: 12, at: 0, p: 1 })
        && j(pB.answer) === j([{ type: 'char-deny', rid: 'e1', reason: 'owner' }]) && same(pB) && pX.answer.length === 0 && same(pX)
        && rA.list[0].t.left === 12 && rA.list[0].t.at > 0 && !('t' in dA.list[0]) && j(dA.answer) === j([{ type: 'char-ack', rid: 'e1' }]), j([pA.answer, pA.list, pA.owner, pG.answer, pB.answer, pX.answer, rA.list, dA.list]));
    const ceSrc = src.replace(/\r\n/g, '\n'), ceA = ceSrc.indexOf('net.charEffect = function'), ceB = ceSrc.indexOf('// A player throws an item from their sheet');
    const client = (rules) => {
        const sent = [], camp = { id: 'k', system: Sx.cleanSystem(sysQ, { F: Fx, gmView: false }), chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_fx: [{ id: 'x_1', ref: 'e_b', on: true, t: { left: 12, at: Date.now() } }] } } } };
        if (rules) camp.turnRules = rules;
        const net = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', conns: [{ peer: 'h', open: true, send: m => sent.push(JSON.parse(JSON.stringify(m))) }] };
        new Function('net', 'SC', 'getActiveCampaign', 'window', 'charPendingDone', 'setTimeout', 'var _charPending = {};\n' + ceSrc.slice(ceA, ceB))(net, () => Sx, () => camp, { wpFormula: Fx, wpVtt: { on: () => true } }, () => {}, () => 0);
        const r = net.charEffect('c_1', 'f_fx', { op: 'timer', rowId: 'x_1', act: 'pause' });
        return { r, sent, t: camp.chars.c_1.values.f_fx[0].t };
    };
    const cO = client(null), cG = client({ timers: 'gm' });
    check('T5b on the wire (player): the press is applied at once (paused) and sent with its act and nothing else; kept the GM\'s, it is refused on the player\'s machine and nothing is sent',
        ceA > 0 && ceB > ceA && cO.r.ok && cO.t.p === 1 && cO.sent.length === 1 && j(Object.keys(cO.sent[0]).sort()) === j(['act', 'charId', 'fieldId', 'op', 'rid', 'rowId', 'type']) && cO.sent[0].act === 'pause' && cO.sent[0].op === 'timer'
        && cG.r.error === 'That list cannot be changed.' && cG.sent.length === 0 && !cG.t.p, j([cO, cG]));
    // the option mid-session: the host's sync (sliced) and a client's take (sliced), run for real
    const trS = between('// [netcheck:turnrulessync-start]', '// [netcheck:turnrulessync-end]', 'turnrulessync'), trR = between('// [netcheck:turnrules-start]', '// [netcheck:turnrules-end]', 'turnrules');
    const sentT = { a: [], w: [] }, campT = { id: 'k_1', turnRules: { walls: 'warn', timers: 'owner' } };
    const netT = { active: true, role: 'host', conns: [{ peer: 'pA', open: true, send: m => { packCheck(m); sentT.a.push(JSON.parse(JSON.stringify(m))); } }, { peer: 'pW', open: true, send: m => sentT.w.push(m) }], roster: { pA: { id: 'u_a' } } };
    new Function('net', 'getActiveCampaign', 'own', 'sendFailed', trS)(netT, () => campT, (o, k) => Object.prototype.hasOwnProperty.call(o, k), e => { throw e; });
    netT.syncTurnRules(); netT.syncTurnRules(); campT.turnRules.timers = 'gm'; netT.syncTurnRules(); campT.turnRules.walls = 'off'; netT.syncTurnRules(); campT.turnRules.time = 'auto'; netT.syncTurnRules(); campT.turnRules.fill = 'gm'; netT.syncTurnRules(); campT.turnRules.hideRolls = true; netT.syncTurnRules(); campT.turnRules.hideRolls = 'yes'; netT.syncTurnRules(); campT.turnRules.typedRolls = 'all'; netT.syncTurnRules(); netT.role = 'client'; campT.turnRules.timers = 'owner'; netT.syncTurnRules();
    // 1.6.3 (Fulllion, 2026-11-19): the campaign's two dice settings ride the same word, Players may hide rolls (true only: 'yes' is no change) and Typed rolls in words ('all')
    const T0 = { type: 'turnRules', campId: 'k_1', hideRolls: false, typedRolls: 'gm' };
    check('T5b the option mid-session (host): sent to admitted players once per change of who may press or (item 20 K5b) who fills pools or (1.6.3) the two dice settings (a waiting peer gets nothing; a change to another rule, the mode of the time rules among them, sends nothing, and a hideRolls of any shape but true is off), those words only; a client never sends one; it follows every host save and the snapshot sets its signature',
        j(sentT.a) === j([Object.assign({}, T0, { timers: 'owner', fill: 'owner' }), Object.assign({}, T0, { timers: 'gm', fill: 'owner' }), Object.assign({}, T0, { timers: 'gm', fill: 'gm' }), Object.assign({}, T0, { timers: 'gm', fill: 'gm', hideRolls: true }), Object.assign({}, T0, { timers: 'gm', fill: 'gm' }), Object.assign({}, T0, { timers: 'gm', fill: 'gm', typedRolls: 'all' })].map(m => ({ type: m.type, campId: m.campId, timers: m.timers, fill: m.fill, hideRolls: m.hideRolls, typedRolls: m.typedRolls }))) && sentT.w.length === 0
        && /net\.syncCampName\(\); \/\/ [^\n]*\n\s*net\.syncTurnRules\(\);/.test(src.replace(/\r\n/g, '\n')) && src.includes('var trm = net.turnRulesMessage(); if (trm) net._lastTurnRulesSig = turnRulesSig(trm);')
        && !/msg\.type === 'turnRules' && net\.role === 'host'/.test(src), j(sentT));
    const runT = (netC, msg, peer) => { const st = { appState: { activeCampaignId: 'k_1', campaigns: { k_1: { id: 'k_1', turnRules: { walls: 'warn' } } } } }; let drawn = 0;
        new Function('net', 'conn', 'msg', 'state', 'campOf', 'window', trR)(netC, { peer }, msg, st, id => (Object.prototype.hasOwnProperty.call(st.appState.campaigns, id) ? st.appState.campaigns[id] : null), { wpSheetsSync: () => { drawn++; } });
        return [st.appState.campaigns.k_1.turnRules, drawn]; };
    const cl = { foreign: true, syncedPeer: 'h', stream: false }, TR = t => ({ type: 'turnRules', campId: 'k_1', timers: t });
    const tOk = runT(cl, TR('gm'), 'h'), tBad = runT(cl, TR('everyone'), 'h'), tOther = runT(cl, TR('gm'), 'x'), tCamp = runT(cl, { type: 'turnRules', campId: 'k_2', timers: 'gm' }, 'h'), tStream = runT({ foreign: true, syncedPeer: 'h', stream: true }, TR('gm'), 'h'), tProto = runT(cl, { type: 'turnRules', campId: '__proto__', timers: 'gm' }, 'h'), tFill = runT(cl, { type: 'turnRules', campId: 'k_1', timers: 'owner', fill: 'gm' }, 'h'), tFillJ = runT(cl, { type: 'turnRules', campId: 'k_1', timers: 'owner', fill: 'everyone' }, 'h'), tHide = runT(cl, { type: 'turnRules', campId: 'k_1', timers: 'owner', hideRolls: true, typedRolls: 'all' }, 'h'), tHideJ = runT(cl, { type: 'turnRules', campId: 'k_1', timers: 'owner', hideRolls: 'yes', typedRolls: '<b>' }, 'h');
    check('T5b the option mid-session (player): taken from the synced host only, for the hosted campaign, gm or owner only; who fills pools (item 20 K5b) gm or else owner, an older host\'s none owner; the other rules kept; the sheet redrawn; anything else changes nothing',
        j(tOk) === j([{ walls: 'warn', timers: 'gm', fill: 'owner', hideRolls: false, typedRolls: 'gm' }, 1]) && j(tFill) === j([{ walls: 'warn', timers: 'owner', fill: 'gm', hideRolls: false, typedRolls: 'gm' }, 1]) && j(tFillJ) === j([{ walls: 'warn', timers: 'owner', fill: 'owner', hideRolls: false, typedRolls: 'gm' }, 1])
        && j(tHide) === j([{ walls: 'warn', timers: 'owner', fill: 'owner', hideRolls: true, typedRolls: 'all' }, 1]) && j(tHideJ) === j([{ walls: 'warn', timers: 'owner', fill: 'owner', hideRolls: false, typedRolls: 'gm' }, 1])   /* 1.6.3: the dice settings taken true only and 'all' only */ && [tBad, tOther, tCamp, tStream, tProto].every(r => j(r) === j([{ walls: 'warn' }, 0])), j([tOk, tBad, tOther, tCamp, tStream, tProto]));
})());

// 1.6.0 At most at a level on the wire (the owner, by prompt, 2026-10-29: "Passes, and the GM is told"): the host's char-item branch, run for real,
// refuses a player's add or raise into a full level in the core's own words, with nothing stored, and lets one into a level with room
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), J = JSON.stringify;
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysC = Sx.cleanSystem({ v: 1, name: 'Cap', rolls: [], fields: [{ id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', vis: 'all', edit: 'owner', list: { lvl: { label: 'Level', min: 0, max: 10, def: 1, caps: [{ at: 1, n: 1 }, { at: 5, n: 1, up: true }] } } }],
        items: [{ id: 'i_climb', name: 'Climb' }, { id: 'i_swim', name: 'Swim' }, { id: 'i_ride', name: 'Ride', lvl: 3 }, { id: 'i_sing', name: 'Sing', lvl: 3 }] }, { F: Fx, gmView: true });
    const START = [{ id: 'w_1', defId: 'i_climb', qty: 1, lvl: 1 }, { id: 'w_2', defId: 'i_ride', qty: 1, lvl: 5 }, { id: 'w_3', defId: 'i_ride', qty: 1, lvl: 3 }];
    const host = msg => {
        const camp = { id: 'k', system: sysC, chars: { c_1: { id: 'c_1', name: 'Sela', ownerId: 'u_a', npc: false, values: { f_sk: JSON.parse(J(START)) } } } }, ans = [], owner = [], box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
        const netH = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(owner) }], roster: { pA: { id: 'u_a' } }, syncCharDelta() {} };
        const winH = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        let saves = 0;
        new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn function(msg, conn) {\n' + ciSrc + '\n};')(
            netH, () => Sx, winH, () => false, () => camp, () => { saves++; }, e => { throw e; }, c => (netH.roster[c.peer] ? netH.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {})(Object.assign({ type: 'char-item', rid: 'ri1', charId: 'c_1', fieldId: 'f_sk' }, msg), { peer: 'pA', send: box(ans) });
        return { ans, owner, saves, rows: camp.chars.c_1.values.f_sk };
    };
    const add = host({ op: 'add', defId: 'i_swim', rowId: 'w_9' }), raise = host({ op: 'set', rowId: 'w_3', facts: { lvl: 6 } }), room = host({ op: 'add', defId: 'i_sing', rowId: 'w_8' });
    check('1.6.0 At most at a level, the host\'s char-item branch (run for real): Sela\'s own Swim into the full Level 1, and Ride raised into the full 5 or higher, are each refused to her in the core\'s words with nothing stored or saved; a Sing that starts at 3, where no cap stands, is stored',
        J(add.ans) === J([{ type: 'char-deny', rid: 'ri1', reason: 'value', msg: 'Skills holds at most 1 row at Level 1.' }]) && J(add.rows) === J(START) && add.saves === 0
        && J(raise.ans) === J([{ type: 'char-deny', rid: 'ri1', reason: 'value', msg: 'Skills holds at most 1 row at Level 5 or higher.' }]) && J(raise.rows) === J(START) && raise.saves === 0
        && room.ans.length === 1 && room.ans[0].type === 'char-ack' && room.rows.length === 4 && room.saves >= 1, J([add.ans, raise.ans, room.ans, room.rows.length, room.saves]));
})());

// 1.6.3 a part taken out of its host on the wire (the port round test, before release): the host's char-item branch, run for real, takes a
// player's own unfit through applyRowOp, stores the part as a loose row and answers with an ack; a curse kept on comes out as any part does and
// stays a curse (a refusal would have told the player of it); a part of a host kept from its player is refused in plain words that tell them
// nothing, with nothing stored or saved; another player's character is refused as not theirs
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), J = JSON.stringify;
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysU = Sx.cleanSystem({ v: 1, name: 'Unfit', rolls: [], fields: [{ id: 'f_p', key: 'Powers', label: 'Powers', kind: 'item-list', vis: 'all', edit: 'owner', list: { parts: { from: 'f_o' } } },
        { id: 'f_o', key: 'Opts', label: 'Opts', kind: 'item-list', vis: 'all', edit: 'owner', list: {} }], items: [{ id: 'i_gust', name: 'Gust' }, { id: 'i_wide', name: 'Wider' }] }, { F: Fx, gmView: true });
    const START = [{ id: 'w_a1', defId: 'i_wide', qty: 2, in: 'w_g' }, { id: 'w_ko', defId: 'i_wide', qty: 1, in: 'w_g', keptOn: 1, on: true }, { id: 'w_hh', defId: 'i_wide', qty: 1, in: 'w_h' }];
    const host = (msg, who) => {
        const camp = { id: 'k', system: sysU, chars: { c_1: { id: 'c_1', name: 'Sela', ownerId: 'u_a', npc: false, values: { f_p: [{ id: 'w_g', defId: 'i_gust', qty: 1 }, { id: 'w_h', defId: 'i_gust', qty: 1, hid: 1 }], f_o: JSON.parse(J(START)) } } } }, ans = [], owner = [], box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
        const netH = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(owner) }], roster: { pA: { id: who || 'u_a' } }, syncCharDelta() {} };
        const winH = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        let saves = 0;
        new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn function(msg, conn) {\n' + ciSrc + '\n};')(
            netH, () => Sx, winH, () => false, () => camp, () => { saves++; }, e => { throw e; }, c => (netH.roster[c.peer] ? netH.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {})(Object.assign({ type: 'char-item', rid: 'ri1', charId: 'c_1', fieldId: 'f_o' }, msg), { peer: 'pA', send: box(ans) });
        return { ans, owner, saves, rows: camp.chars.c_1.values.f_o };
    };
    const out = host({ op: 'unfit', rowId: 'w_a1' }), kept = host({ op: 'unfit', rowId: 'w_ko' }), hidH = host({ op: 'unfit', rowId: 'w_hh' }), other = host({ op: 'unfit', rowId: 'w_a1' }, 'u_b');
    check('1.6.3 a part taken out on the wire, the host\'s char-item branch (run for real): Sela\'s own Wider leaves its Gust and stays on her list as a loose row of 2, acked and saved; a curse kept on comes out as any part does and stays a curse, so its player learns nothing of it; a part of a host kept from her is refused in plain words with nothing stored or saved; another player\'s unfit of her part is refused as not theirs',
        out.ans.length === 1 && out.ans[0].type === 'char-ack' && J(out.rows[0]) === J({ id: 'w_a1', defId: 'i_wide', qty: 2 }) && out.rows.length === 3 && out.rows[1].in === 'w_g' && out.saves >= 1
        && kept.ans.length === 1 && kept.ans[0].type === 'char-ack' && kept.rows[1].in === undefined && kept.saves >= 1
        && J(hidH.ans) === J([{ type: 'char-deny', rid: 'ri1', reason: 'value', msg: 'This part cannot be taken out now.' }]) && J(hidH.rows) === J(START) && hidH.saves === 0
        && J(other.ans) === J([{ type: 'char-deny', rid: 'ri1', reason: 'owner' }]) && J(other.rows) === J(START) && other.saves === 0, J([out.ans, out.rows, out.saves, kept.ans, kept.rows, hidH.ans, other.ans]));
})());

// 1.6.0 Levels it may be on the wire (the owner, 2026-10-30, by prompt: "Player refused, GM told"): the host's char-item branch and a player's own app, each run
// for real, refuse a level the entry does not allow in the core's own words, with nothing stored, sent or saved, and take one it does allow
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), J = JSON.stringify;
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysL = Sx.cleanSystem({ v: 1, name: 'Lv', rolls: [], fields: [{ id: 'f_k', key: 'Knacks', label: 'Knacks', kind: 'item-list', vis: 'all', edit: 'owner', list: { lvl: { label: 'Rank', min: 1, max: 6, def: 1 } } }],
        items: [{ id: 'i_two', name: 'Pebble Sense', lvlOnly: '2, 4' }, { id: 'i_three', name: 'Kite Reading', lvlOnly: '3 to 5' }] }, { F: Fx, gmView: true }), viewL = Sx.cleanSystem(sysL, { F: Fx, gmView: false });
    const START = [{ id: 'w_1', defId: 'i_two', qty: 1, lvl: 2 }, { id: 'w_2', defId: 'i_two', qty: 1, lvl: 3 }];
    const host = msg => {
        const camp = { id: 'k', system: sysL, chars: { c_1: { id: 'c_1', name: 'Sela', ownerId: 'u_a', npc: false, values: { f_k: JSON.parse(J(START)) } } } }, ans = [], owner = [], box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
        const netH = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(owner) }], roster: { pA: { id: 'u_a' } }, syncCharDelta() {} };
        const winH = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        let saves = 0;
        new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn function(msg, conn) {\n' + ciSrc + '\n};')(
            netH, () => Sx, winH, () => false, () => camp, () => { saves++; }, e => { throw e; }, c => (netH.roster[c.peer] ? netH.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {})(Object.assign({ type: 'char-item', rid: 'ri1', charId: 'c_1', fieldId: 'f_k' }, msg), { peer: 'pA', send: box(ans) });
        return { ans, owner, saves, rows: camp.chars.c_1.values.f_k };
    };
    const no = host({ op: 'set', rowId: 'w_1', facts: { lvl: 3 } }), down = host({ op: 'set', rowId: 'w_1', facts: { lvl: 1 } }), ok = host({ op: 'set', rowId: 'w_1', facts: { lvl: 4 } }), add = host({ op: 'add', defId: 'i_three', rowId: 'w_9' }), kept = host({ op: 'set', rowId: 'w_2', facts: { note: 'old' } });
    check('1.6.0 Levels it may be, the host\'s char-item branch (run for real): a level the entry does not allow, up or down, is refused to Sela in the core\'s words with nothing stored or saved; one it allows is stored; a new row starts at the first it may be; a row already at another level keeps it through a change of its note',
        J(no.ans) === J([{ type: 'char-deny', rid: 'ri1', reason: 'value', msg: 'Pebble Sense may only be Rank 2 or 4.' }]) && J(no.rows) === J(START) && no.saves === 0 && J(down.ans) === J(no.ans) && J(down.rows) === J(START)
        && ok.ans[0].type === 'char-ack' && ok.rows[0].lvl === 4 && ok.saves >= 1 && add.ans[0].type === 'char-ack' && add.rows[2].lvl === 3 && kept.ans[0].type === 'char-ack' && kept.rows[1].lvl === 3 && kept.rows[1].note === 'old', J([no.ans, down.ans, ok.ans, add.rows, kept.rows]));
    const cA = src.indexOf('net.charItem = function('), cZ = src.indexOf('\n};\n', cA) + 3, sentC = [], lvlL = { id: 'i_lib', name: 'Sparrow Step', vis: 'all', lvlOnly: [2, 4] };
    const rowsP = Sx.projectRows([{ id: 'w_1', defId: 'i_lib', qty: 1, lvl: 2 }, { id: 'w_2', defId: 'i_two', qty: 1, lvl: 2 }], viewL, id => (id === 'i_lib' ? lvlL : null), sysL.fields[0].list);
    const campC = { id: 'k', system: viewL, chars: { c_1: { id: 'c_1', name: 'Sela', ownerId: 'u_a', npc: false, values: { f_k: rowsP } } } };
    const netC = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', libEntry: () => null, conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sentC.push(JSON.parse(J(m))); } }] };
    new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', src.slice(cA, cZ))(netC, () => Sx, () => campC, { wpFormula: Fx, wpVtt: { on: () => true } }, {}, () => {}, () => 0);
    const before = J(campC.chars.c_1.values.f_k), inl = netC.charItem('c_1', 'f_k', { op: 'set', rowId: 'w_1', facts: { lvl: 3 } }), ptr = netC.charItem('c_1', 'f_k', { op: 'set', rowId: 'w_2', facts: { lvl: 3 } }), same = J(campC.chars.c_1.values.f_k) === before, sentNo = sentC.length, yes = netC.charItem('c_1', 'f_k', { op: 'set', rowId: 'w_1', facts: { lvl: 4 } });
    check('1.6.0 Levels it may be, a player\'s own app (the real net.charItem): a library row\'s inline copy and a system item\'s pointer each answer a level it does not allow at once, in the core\'s words, with nothing sent or kept; one it allows goes to the host',
        rowsP[0].lnk === 1 && J(rowsP[0].def.lvlOnly) === '[2,4]' && inl.error === 'Sparrow Step may only be Rank 2 or 4.' && ptr.error === 'Pebble Sense may only be Rank 2 or 4.' && same && sentNo === 0 && yes.ok === true && sentC.length === 1 && sentC[0].facts.lvl === 4, J([inl, ptr, same, sentNo, yes, sentC]));
})());

// Stage 6 F4b: a row's facts on the wire — the real char-item handler (with the real delta and the GM's notice, sliced from net.js) on ONE
// host whose state carries across messages: a bound switch's grace, a curse kept on, the owner's delta, the notices; every message packs
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysF = Sx.cleanSystem({ v: 1, name: 'F', rolls: [], fields: [{ id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Readied' }, lvl: { min: 0, max: 5, def: 1 } } }],
        items: [{ id: 'i_ring', name: 'Ring', eq: 'bound', eqMsg: 'It will not come off' }, { id: 'i_amu', name: 'Amulet', eq: 'curse', eqMsg: 'It clings' }, { id: 'i_blade', name: 'Blade' }, { id: 'i_veil', name: 'Veil', vis: 'gm', eq: 'curse' }] }, { F: Fx, gmView: true });
    const camp = { id: 'k', system: sysF, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_r1', defId: 'i_ring', qty: 1, on: false }, { id: 'w_a1', defId: 'i_amu', qty: 1, on: false }, { id: 'w_b1', defId: 'i_blade', qty: 1 }, { id: 'w_v1', defId: 'i_veil', qty: 1, on: true }] } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
    const out = { answer: [], owner: [], mate: [], notes: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
    const connA = { peer: 'pA', send: box(out.answer) }, connB = { peer: 'pB', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
    const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n}, grace: function() { return _rowGrace; } };')(
        net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), () => {});
    const SET = (rid, rowId, facts, conn) => { out.answer.length = 0; out.owner.length = 0; out.mate.length = 0; out.notes.length = 0; H.handle({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_wp', op: 'set', rowId, facts }, conn || connA); return { answer: out.answer.slice(), owner: out.owner.slice(), mate: out.mate.slice(), notes: out.notes.slice() }; };
    const row = id => camp.chars.c_1.values.f_wp.find(r => r.id === id), ownRow = (d, id) => (((d[0] || {}).values || {}).f_wp || []).find(r => r.id === id);
    const r1 = SET('q1', 'w_r1', { on: true }), g1 = Object.keys(H.grace());
    const r2 = SET('q2', 'w_r1', { on: false });
    const r3 = SET('q3', 'w_r1', { on: true }); Object.keys(H.grace()).forEach(k => { H.grace()[k].until = 0; });
    const r4 = SET('q4', 'w_r1', { on: false });
    check('F4b on the wire, bound: switching the Ring on is acked, synced to its owner (a teammate\'s copy carries nothing of the list) and told to the GM ("switched on Ring ... bound"), and opens the switch\'s grace; switched off inside it, it comes off; once it lapses the host refuses with the GM\'s message ("stays"), tells the GM, and stores or sends nothing',
        j(r1.answer) === j([{ type: 'char-ack', rid: 'q1' }]) && ownRow(r1.owner, 'w_r1').on === true && !/f_wp|Ring|Readied|w_r1/.test(j(r1.mate)) && r1.notes.length === 1 && /switched on Ring .* bound: it stays on/.test(r1.notes[0]) && j(g1) === j(['c_1|f_wp|w_r1|on'])
        && j(r2.answer) === j([{ type: 'char-ack', rid: 'q2' }]) && ownRow(r2.owner, 'w_r1').on === false && r3.notes.length === 1
        && j(r4.answer) === j([{ type: 'char-deny', rid: 'q4', reason: 'stays', msg: 'It will not come off' }]) && r4.owner.length === 0 && row('w_r1').on === true && r4.notes.length === 1 && /tried to switch off Ring .* it stays on \(bound\)/.test(r4.notes[0]),
        j([r1, r2, r4, g1]));
    const c1 = SET('q5', 'w_a1', { on: true }), c2 = SET('q6', 'w_a1', { on: false });
    check('F4b on the wire, curse on contact: switched off by its owner the host keeps it on (keptOn) and acks with the GM\'s message; the owner\'s delta says off with no keptOn; the GM alone is told, both when it went on and when it stays on out of their sight',
        c1.notes.length === 1 && /switched on Amulet .* curse on contact/.test(c1.notes[0]) && j(c2.answer) === j([{ type: 'char-ack', rid: 'q6', msg: 'It clings' }]) && j(row('w_a1')) === j({ id: 'w_a1', defId: 'i_amu', qty: 1, on: true, keptOn: 1 })
        && j(ownRow(c2.owner, 'w_a1')) === j({ id: 'w_a1', defId: 'i_amu', qty: 1, on: false }) && !/keptOn|clings/.test(j(c2.owner)) && !/f_wp|Amulet|clings|keptOn|w_a1/.test(j(c2.mate)) && c2.notes.length === 1 && /switched off Amulet .* out of their sight/.test(c2.notes[0]),
        j([c1, c2, row('w_a1')]));
    const l1 = SET('q7', 'w_b1', { lvl: 9, note: 'my blade' }), v1 = SET('q8', 'w_v1', { on: false }), x1 = SET('q9', 'w_b1', { lvl: 2 }, connB), x2 = SET('q10', 'w_b1', { on: 'yes' }), x3 = SET('q11', 'w_b1', { lvl: '3' });
    check('F4b on the wire: a level is clamped by the host (9 to 5) and a note stored, both in the owner\'s delta; a GM-only item\'s curse is judged on the host\'s own entry and its inline copy reads off (no message: none was set); another player\'s change is "owner"; a malformed fact (a string switch or level) is dropped unanswered',
        j(row('w_b1')) === j({ id: 'w_b1', defId: 'i_blade', qty: 1, lvl: 5, note: 'my blade' }) && j(ownRow(l1.owner, 'w_b1')) === j(row('w_b1')) && j(l1.answer) === j([{ type: 'char-ack', rid: 'q7' }])
        && row('w_v1').keptOn === 1 && j(ownRow(v1.owner, 'w_v1')) === j({ id: 'w_v1', qty: 1, on: false, def: Sx.cleanRowDef({ name: 'Veil', vis: 'gm' }, false), lnk: 1 }) && j(v1.answer) === j([{ type: 'char-ack', rid: 'q8' }])
        && j(x1.answer) === j([{ type: 'char-deny', rid: 'q9', reason: 'owner' }]) && x2.answer.length === 0 && x3.answer.length === 0 && row('w_b1').lvl === 5,
        j([l1, v1, x1, row('w_v1')]));
    check('F4b the client sends a set op\'s facts beside the keys each op uses; the host judges them with the switch\'s grace from its own clock',
        /if \(q\.facts !== undefined\) mI\.facts = q\.facts;/.test(src) && /var ogI = !!\(_rowGrace\[gkI \+ '\|on'\] && _rowGrace\[gkI \+ '\|on'\]\.until > nowI\);/.test(src));
})());

// Stage 6 F4b review: the switch's grace is spent once (the GM switching it on again is not undone by it), and the lock covers dropping while it
// is on (owner) — the real char-item handler, delta and notice again, on one host whose state carries across messages
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysR = Sx.cleanSystem({ v: 1, name: 'R', rolls: [], fields: [{ id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Readied' } } }],
        items: [{ id: 'i_ring', name: 'Ring', eq: 'bound', eqMsg: 'It will not come off' }, { id: 'i_amu', name: 'Amulet', eq: 'curse', eqMsg: 'It clings' }] }, { F: Fx, gmView: true });
    const camp = { id: 'k', system: sysR, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_r1', defId: 'i_ring', qty: 1, on: false }, { id: 'w_a1', defId: 'i_amu', qty: 1, on: true }] } } } };
    const out = { answer: [], owner: [], notes: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
    const connA = { peer: 'pA', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
    const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n}, grace: function() { return _rowGrace; } };')(
        net, () => Sx, win, () => false, () => camp, () => {}, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), () => {});
    const SEND = (rid, q) => { out.answer.length = 0; out.owner.length = 0; out.notes.length = 0; H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_wp' }, q), connA); return { answer: out.answer.slice(), owner: out.owner.slice(), notes: out.notes.slice() }; };
    const vals = () => camp.chars.c_1.values.f_wp, row = id => vals().find(r => r.id === id);
    const g1 = SEND('q1', { op: 'set', rowId: 'w_r1', facts: { on: true } }), g2 = SEND('q2', { op: 'set', rowId: 'w_r1', facts: { on: false } }), spent = !('c_1|f_wp|w_r1|on' in H.grace());
    row('w_r1').on = true;   // the GM switches it on again, on their own sheet (a local change, not through this handler)
    const g3 = SEND('q3', { op: 'set', rowId: 'w_r1', facts: { on: false } });
    check('F4b review on the wire: a bound switch\'s grace lets it go once and is spent; the GM switching it on again inside what was left of the window holds (the player\'s switch-off is refused with the message)',
        j(g1.answer) === j([{ type: 'char-ack', rid: 'q1' }]) && j(g2.answer) === j([{ type: 'char-ack', rid: 'q2' }]) && spent && j(g3.answer) === j([{ type: 'char-deny', rid: 'q3', reason: 'stays', msg: 'It will not come off' }]) && row('w_r1').on === true,
        j([g1.answer, g2.answer, g3.answer, H.grace()]));
    const r1 = SEND('q4', { op: 'remove', rowId: 'w_r1' }), r2 = SEND('q5', { op: 'remove', rowId: 'w_a1' }), kept = vals().filter(r => r.defId === 'i_amu');
    check('F4b review on the wire (owner: the lock covers dropping while it is on): dropping the Ring while it is on is refused with its switch message and the GM is told of the attempt; dropping the Amulet while it is on leaves the owner\'s sheet (their delta has no Amulet) but stays on the character, hidden, under an id they never held, with the GM\'s message and a notice',
        j(r1.answer) === j([{ type: 'char-deny', rid: 'q4', reason: 'stays', msg: 'It will not come off' }]) && r1.owner.length === 0 && r1.notes.length === 1 && /tried to remove Ring/.test(r1.notes[0])
        && j(r2.answer) === j([{ type: 'char-ack', rid: 'q5', msg: 'It clings' }]) && kept.length === 1 && kept[0].hid === 1 && kept[0].on === true && kept[0].id !== 'w_a1' && !/i_amu|Amulet/.test(j(r2.owner)) && r2.notes.length === 1 && /dropped Amulet/.test(r2.notes[0]),
        j([r1, r2, kept]));
})());

// 1.6.0 a GM-only stat on the wire: the real char-item branch, the real char-ask branch's core and the real delta. A player's change naming it is answered as a
// change naming no stat at all; the GM's change of it tells the owner nothing; and no copy, delta or answer holds it
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysG = Sx.cleanSystem({ v: 1, name: 'G', rolls: [], listRules: { ownerStats: true }, fields: [{ id: 'f_l', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { custom: true, on: { label: 'On' }, stats: [{ key: 'Skill', label: 'Skill' }, { key: 'Flaw', label: 'Flaw', vis: 'gm' }] } }], items: [{ id: 'i_a', name: 'Pebbles', stats: { Skill: 9 } }] }, { F: Fx, gmView: true });
    const camp = { id: 'k', system: sysG, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_l: [{ id: 'w_a', defId: 'i_a', qty: 1, on: true, ov: { stats: { Flaw: 2 }, held: ['Flaw'] } }, { id: 'w_m', def: { name: 'Mine', category: '', icon: '', notes: '', vis: 'all', stats: { Skill: 1, Flaw: 3 } }, own: 1, qty: 1 }] } } } };
    const out = { answer: [], owner: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); }, connA = { peer: 'pA', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
    const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
        net, () => Sx, win, () => false, () => camp, () => {}, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
    const SEND = (rid, q) => { out.answer.length = 0; out.owner.length = 0; H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_l' }, q), connA); return { answer: out.answer.slice().map(a => Object.assign({}, a, { rid: 'x' })), owner: out.owner.slice() }; };
    const held = () => j(camp.chars.c_1.values.f_l.map(r => (r.ov && r.ov.stats) || (r.def && r.def.stats)));
    const before = held(), a1 = SEND('q1', { op: 'ov', rowId: 'w_a', ov: { stats: { Flaw: 0 } } }), a2 = SEND('q2', { op: 'ov', rowId: 'w_a', ov: { stats: { Nope: 0 } } }), c1 = SEND('q3', { op: 'custom', rowId: 'w_m', def: { stats: { Flaw: 0 } } }), c2 = SEND('q4', { op: 'custom', rowId: 'w_m', def: { stats: { Nope: 0 } } }), after = held();
    const ok = SEND('q5', { op: 'ov', rowId: 'w_a', ov: { stats: { Skill: 4 } } }), kept = camp.chars.c_1.values.f_l[0].ov.stats.Flaw === 2;
    out.owner.length = 0; camp.chars.c_1.values.f_l[0].ov.stats.Flaw = 5; net.syncCharDelta('c_1', { f_l: camp.chars.c_1.values.f_l });
    const toldOwner = j(out.owner), viewS = win.wpSheets.playerSystem(camp), skY = Sx.statAsk(Object.assign({}, sysG, { listRules: { statsAsk: true } }), camp.chars.c_1, 'f_l', 'w_a', { Flaw: 0 }, Fx, { view: viewS }), skN = Sx.statAsk(Object.assign({}, sysG, { listRules: { statsAsk: true } }), camp.chars.c_1, 'f_l', 'w_a', { Nope: 0 }, Fx, { view: viewS });
    check('1.6.0 a GM-only stat on the wire (the real char-item branch and delta): a player\'s own-values change and their row of their own naming it are each answered exactly as a stat that does not exist, and nothing moves; a stat of their view goes through and leaves it standing; what the GM\'s change sends the owner holds none of it, nor any mark that one is held; an ask naming it is answered as no stat',
        j(a1.answer) === j(a2.answer) && a1.answer[0].type === 'char-deny' && j(c1.answer) === j(c2.answer) && c1.answer[0].type === 'char-deny' && before === after && ok.answer[0].type === 'char-ack' && kept && !/flaw/i.test(j([a1, a2, c1, c2, ok])) && !/flaw/i.test(toldOwner) && j(skY) === j(skN) && !skY.ok, j([a1.answer, a2.answer, c1.answer, c2.answer, ok.answer, toldOwner.slice(0, 300), skY, skN]));
})());


// 1.6.0 When a row is taken off, on the wire: the real char-item handler and delta: a player's removal moves the fields with it on the host, tells the
// owner in one delta and keeps the Undo on the host; a word of the player's own never reaches the Undo; the changes never reach a player's view
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysR = Sx.cleanSystem({ v: 1, name: 'R', rolls: [], fields: [{ id: 'f_u', key: 'Unspent', label: 'Unspent', kind: 'number', vis: 'all', edit: 'gm' }, { id: 'f_l', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'On' }, stats: [{ key: 'gave', label: 'Gave' }], onRemove: [{ f: 'f_u', formula: 'Row.gave', add: true }] } }],
        items: [{ id: 'i_a', name: 'Pebbles', stats: { gave: 10 } }] }, { F: Fx, gmView: true });
    const camp = { id: 'k', system: sysR, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_u: 25, f_l: [{ id: 'w_a', defId: 'i_a', qty: 1, on: true }] } } } };
    const out = { answer: [], owner: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); }, connA = { peer: 'pA', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
    const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null, wpStepLog: (a, b, d) => logs.push([a, b, j(d)]) }, logs = [];
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n}, grace: function() { return _rowGrace; } };')(
        net, () => Sx, win, () => false, () => camp, () => {}, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
    const SEND = (rid, q) => { out.answer.length = 0; out.owner.length = 0; H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_l' }, q), connA); return { answer: out.answer.slice(), owner: out.owner.slice() }; };
    const vals = () => camp.chars.c_1.values;
    const sw = SEND('q0', { op: 'set', rowId: 'w_a', facts: { on: false } }), swU = vals().f_u, rm = SEND('q1', { op: 'remove', rowId: 'w_a' }), afterU = vals().f_u, gone = !vals().f_l.length, rec = H.grace()['c_1|f_l|w_a|gone'], hasBack = !!(rec && rec.rmBack), lg = j(logs);
    vals().f_u = 40;
    const bk = SEND('q2', { op: 'restore', rowId: 'w_a', rmBack: { f_u: { b: 999, a: 40 } } }), backU = vals().f_u, backRow = vals().f_l.length === 1;
    const pv = win.wpSheets.playerSystem(camp), pvL = Sx.fieldById(pv, 'f_l').list;
    check('1.6.0 When a row is taken off (the real char-item branch): a player\'s switch-off moves nothing; their removal moves the field they may not edit with it, on the host, told to the owner in one delta, logged by structure alone, with its Undo kept on the host; their Undo comes back by the host\'s own record and never by a word of theirs (Unspent moved to 40 since: 30, not 999); the changes are in no players\' view',
        swU === 25 && sw.answer.length === 1 && afterU === 35 && gone && rm.owner.length === 1 && rm.owner[0].values && rm.owner[0].values.f_u === 35 && hasBack && /onremove v1/.test(lg) && !/Pebbles/.test(lg)
        && j(bk.answer) === j([{ type: 'char-ack', rid: 'q2' }]) && backU === 30 && backRow && !('onRemove' in pvL), j([sw, rm, bk, afterU, backU, rec, lg]));
})());

// 1.6.4 Buy off on the wire (the real char-item handler and delta): on a list set to Warn a player who cannot pay goes through, is told in the
// answer and the GM is told and logs it; the row-gone word (marked bought) comes before the answer and the host keeps the charge and the line for
// the Undo, and the word says how far short she went; a cursed row and a row kept on refuse her (Fulllion: "Refuse for a cursed row") and the GM's
// own hand still buys one off; On removal runs beside the charge; a cost
// that reads a GM-only value takes Buy off out of the players' view, and a ledger list of no item kind is dropped while the charge stays
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const rawB = { v: 1, name: 'B', rolls: [], fields: [{ id: 'f_p', key: 'Marks', label: 'Marks', kind: 'number', vis: 'all', edit: 'gm' }, { id: 'f_t', key: 'Tally', label: 'Tally', kind: 'number', vis: 'all', edit: 'gm' }, { id: 'f_g', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm', edit: 'gm' },
        { id: 'f_led', key: 'Owed', label: 'Owed', kind: 'item-list', vis: 'all', edit: 'gm', list: {} },
        { id: 'f_l', key: 'Quirks', label: 'Quirks', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'On' }, stats: [{ key: 'tier', label: 'Tier' }], onRemove: [{ f: 'f_t', formula: '1', add: true }], buyOff: { cost: 'Row.tier + 1', f: 'f_p', over: 'warn', ledger: { to: 'f_led', says: 'Paid away' } } } },
        { id: 'f_s', key: 'Hidden', label: 'Hidden', kind: 'item-list', edit: 'owner', vis: 'all', list: { buyOff: { cost: 'Secret', f: 'f_p', ledger: { to: 'f_t' } } } }],
        items: [{ id: 'i_a', name: 'Short Fuse', stats: { tier: 4 } }, { id: 'i_c', name: 'Old Hex', stats: { tier: 1 }, rm: 'curse', rmMsg: 'It clings.' }] };
    const sysB = Sx.cleanSystem(rawB, { F: Fx, gmView: true });
    const camp = { id: 'k', system: sysB, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_p: 3, f_t: 0, f_g: 7, f_led: [], f_s: [{ id: 'w_s', defId: 'i_a', qty: 1 }], f_l: [{ id: 'w_a', defId: 'i_a', qty: 1 }, { id: 'w_c', defId: 'i_c', qty: 1 }, { id: 'w_k', defId: 'i_a', qty: 1, on: true, keptOn: 1 }] } } } };
    const out = { answer: [], owner: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); }, connA = { peer: 'pA', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
    const told = [], logged = [], win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n}, grace: function() { return _rowGrace; } };')(
        net, () => Sx, win, () => false, () => camp, () => {}, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => told.push(t), (k, t) => logged.push(t));
    const SEND = (rid, q) => { out.answer.length = 0; out.owner.length = 0; H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_l' }, q), connA); return { answer: out.answer.slice(), owner: out.owner.slice() }; };
    const vals = () => camp.chars.c_1.values;
    const b1 = SEND('q1', { op: 'buyoff', rowId: 'w_a', cost: 5 }), v1 = JSON.parse(JSON.stringify(vals())), rec = H.grace()['c_1|f_l|w_a|gone'];
    const lineOk = v1.f_led.length === 1 && v1.f_led[0].def.name === 'Short Fuse' && v1.f_led[0].note === 'Paid away: 5 Marks' && !v1.f_led[0].own;
    const recOk = !!rec && rec.rmBack && rec.rmBack.f_p.b === 3 && rec.rmBack.f_p.a === -2 && rec.rmBack.f_led.cut === v1.f_led[0].id && rec.rmBack.f_t.b === 0;
    const b2 = SEND('q2', { op: 'buyoff', rowId: 'w_c' }), v2 = JSON.parse(JSON.stringify(vals())), recC = H.grace()['c_1|f_l|w_c|gone'];
    const b4 = SEND('q4', { op: 'buyoff', rowId: 'w_k' }), v4 = JSON.parse(JSON.stringify(vals())), gmC = Sx.applyRowOp(sysB, camp.chars.c_1, 'f_l', { op: 'buyoff', rowId: 'w_c' }, Fx, {});
    const b3 = SEND('q3', { fieldId: 'f_s', op: 'buyoff', rowId: 'w_s', cost: 0 }), v3 = JSON.parse(JSON.stringify(vals()));
    const pv = win.wpSheets.playerSystem(camp), pvL = Sx.fieldById(pv, 'f_l').list, pvS = Sx.fieldById(pv, 'f_s').list, gvS = Sx.fieldById(sysB, 'f_s').list;
    check('1.6.4 Buy off (the real char-item branch): on a list set to Warn, Ana with 3 Marks buys off Short Fuse for 5: the row-gone word marked bought comes before the plain answer (the notice of her Undo would take the place of any words), one delta tells her the row, the Marks at -2, the line and On removal\'s Tally; the GM is told and the log keeps it; the host keeps the charge, the line and On removal for the Undo; the word says she went 2 short; a cursed row is refused her in the words the GM gave it and a row kept on in plain words, nothing charged, while the own hand of the GM buys the cursed row off; a cost reading a GM-only value is in no players\' view, and a ledger that is no item list goes while the charge stays; a message of hers on that list is refused as a list with no Buy off, telling nothing of the figure and moving nothing',
        b1.answer.length === 2 && b1.answer[0].type === 'row-gone' && b1.answer[0].items[0].b === 1 && b1.answer[0].items[0].s === 2 && b1.answer[1].type === 'char-ack' && !b1.answer[1].msg
        && b1.owner.length === 1 && b1.owner[0].values.f_p === -2 && b1.owner[0].values.f_t === 1 && Array.isArray(b1.owner[0].values.f_led) && v1.f_l.length === 2 && !v1.f_l.some(r => r.id === 'w_a') && lineOk && recOk
        && told.some(t => /Ana bought off Short Fuse for 5 Marks\. Buying off/.test(t)) && logged.some(t => /Ana bought off Short Fuse/.test(t))
        && v2.f_p === -2 && v2.f_l.length === 2 && v2.f_l.some(r => r.id === 'w_c' && r.hid !== 1) && v2.f_led.length === 1 && !recC && !b2.owner.length && j(b2.answer.map(m => [m.type, m.msg])) === j([['char-deny', 'It clings.']])
        && v4.f_p === -2 && v4.f_l.length === 2 && j(b4.answer.map(m => [m.type, m.msg])) === j([['char-deny', 'Short Fuse cannot be bought off.']]) && gmC.ok && gmC.also.f_p === -4
        && b3.answer.length === 1 && b3.answer[0].type === 'char-deny' && b3.answer[0].reason === 'field' && !b3.answer[0].msg && v3.f_s.length === 1 && v3.f_p === v2.f_p && !b3.owner.length
        && !!pvL.buyOff && !(pvS && pvS.buyOff) && !!gvS.buyOff && !('ledger' in gvS.buyOff),
        j([b1, b2, b4, v1, v2, rec, told, logged, pvS, gvS, gmC.ok]));
})());

// Stage 6 F4b follow-up: a refused attempt repeated is one notice per quiet window — the real char-item handler, delta and notice on one host;
// the player still gets every refusal, the GM one notice, and the next one after the window counts the tries that went unsaid
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysQ = Sx.cleanSystem({ v: 1, name: 'Q', rolls: [], fields: [{ id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Readied' } } }],
        items: [{ id: 'i_ring', name: 'Ring', eq: 'bound', eqMsg: 'It will not come off' }] }, { F: Fx, gmView: true });
    const camp = { id: 'k', system: sysQ, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_r1', defId: 'i_ring', qty: 1, on: true }] } } } };
    const out = { answer: [], owner: [], notes: [], logs: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
    const connA = { peer: 'pA', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
    const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n}, tried: function() { return _triedSaid; } };')(
        net, () => Sx, win, () => false, () => camp, () => {}, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), (k, t) => out.logs.push(k + ':' + t));
    const SEND = (rid, q) => { out.answer.length = 0; out.owner.length = 0; out.notes.length = 0; out.logs.length = 0; H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_wp' }, q), connA); return { answer: out.answer.slice(), notes: out.notes.slice(), logs: out.logs.slice() }; };
    const OFF = rid => SEND(rid, { op: 'set', rowId: 'w_r1', facts: { on: false } }), deny = rid => j([{ type: 'char-deny', rid, reason: 'stays', msg: 'It will not come off' }]);
    const t1 = OFF('q1'), t2 = OFF('q2'), t3 = OFF('q3'), d1 = SEND('q4', { op: 'remove', rowId: 'w_r1' });
    Object.keys(H.tried()).forEach(k => { H.tried()[k].at = 0; });   // the quiet window lapses
    const t4 = OFF('q5'), t5 = OFF('q6');
    check('F4b follow-up on the wire: a player repeating a refused switch-off gets every refusal, but the GM one notice (toast and log) per 30 s quiet window; a refused drop is its own kind and still told; after the window the next notice counts the tries that went unsaid, and the count starts again',
        [t1, t2, t3, t4, t5].every((r, i) => j(r.answer) === deny('q' + [1, 2, 3, 5, 6][i])) && camp.chars.c_1.values.f_wp[0].on === true
        && t1.notes.length === 1 && /tried to switch off Ring/.test(t1.notes[0]) && !/more tr/.test(t1.notes[0]) && t1.logs.length === 1 && t2.notes.length === 0 && t2.logs.length === 0 && t3.notes.length === 0
        && d1.notes.length === 1 && /tried to remove Ring/.test(d1.notes[0])
        && t4.notes.length === 1 && /\(2 more tries since the last notice\)$/.test(t4.notes[0]) && t4.logs.length === 1 && t5.notes.length === 0
        && /_rowGrace = \{\}; _triedSaid = \{\};/.test(src),
        j([t1, t2, t3, d1, t4, t5]));
})());

// owed review F5a2 #3 (owner 2026-09-27): a player's pick over a hidden choice the GM set and holds on their copy — the real char-item handler
// (with the real delta and the GM's notice, sliced from net.js) on one host: acked and stored as theirs, the GM alone told; a GM-held visible
// choice or number still refused
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const a2_ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), a2_dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const a2_ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const a2_sys = Sx.cleanSystem({ v: 1, name: 'P', rolls: [], listRules: { ownerStats: true }, fields: [
        { id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all', def: 12 }, { id: 'f_dx', key: 'DX', label: 'DX', kind: 'number', vis: 'all', def: 10 }, { id: 'f_gm', key: 'GMFig', label: 'G', kind: 'number', vis: 'gm', def: 17 },
        { id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Acc' }, { key: 'Ability', kind: 'pick', def: 'Plain', opts: [{ label: 'Plain', name: 'ST' }, { label: 'Other', name: 'DX' }, { label: 'Secret', name: 'GMFig' }] }] } }],
        items: [{ id: 'i_rp', name: 'Rapier', key: 'Rapier', stats: { Acc: 2 } }] }, { F: Fx, gmView: true });
    const camp = { id: 'k', system: a2_sys, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_rp', defId: 'i_rp', qty: 1, ov: { stats: { Ability: 'Secret' }, held: ['Ability'] } }, { id: 'w_r2', defId: 'i_rp', qty: 1, ov: { stats: { Acc: 5, Ability: 'Other' }, held: ['Acc', 'Ability'] } }] } } } };
    const out = { answer: [], owner: [], notes: [], logs: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
    const connA = { peer: 'pA', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
    const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + a2_dlSrc + '\n' + a2_ntSrc + '\nreturn { handle: function(msg, conn) {\n' + a2_ciSrc + '\n} };')(
        net, () => Sx, win, () => false, () => camp, () => {}, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), (k, t) => out.logs.push(k + ':' + t));
    const SEND = (rid, q) => { out.answer.length = 0; out.owner.length = 0; out.notes.length = 0; out.logs.length = 0; H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_wp' }, q), connA); return { answer: out.answer.slice(), owner: out.owner.slice(), notes: out.notes.slice(), logs: out.logs.slice() }; };
    const row = id => camp.chars.c_1.values.f_wp.find(r => r.id === id), ownRow = (d, id) => (((d[0] || {}).values || {}).f_wp || []).find(r => r.id === id), r2Before = j(row('w_r2'));
    const p1 = SEND('q1', { op: 'ov', rowId: 'w_rp', ov: { stats: { Ability: 'Other' } } }), p2 = SEND('q2', { op: 'ov', rowId: 'w_r2', ov: { stats: { Ability: 'Plain' } } }), p3 = SEND('q3', { op: 'ov', rowId: 'w_r2', ov: { stats: { Acc: 1 } } });
    const a2_note = 'Ana changed Rapier’s Ability — their pick replaced the hidden choice you set (set it again on the row if you want it back).';
    check('F5a2 owed review #3 on the wire (owner 2026-09-27): a player\'s pick over a hidden choice the GM set on their copy is acked plainly and stored as theirs (their delta carries Other, nothing of Secret or GMFig), and the GM alone is told whose pick replaced which item\'s choice (a toast and the Items log); a GM-held visible choice or number is refused (field) with nothing stored, sent or told',
        j(p1.answer) === j([{ type: 'char-ack', rid: 'q1' }]) && j(row('w_rp').ov) === j({ stats: { Ability: 'Other' } }) && j(ownRow(p1.owner, 'w_rp')) === j({ id: 'w_rp', defId: 'i_rp', qty: 1, ov: { stats: { Ability: 'Other' } } }) && !/Secret|GMFig|hidden/.test(j(p1.owner))
        && j(p1.notes) === j([a2_note]) && j(p1.logs) === j(['items:' + a2_note])
        && j(p2.answer) === j([{ type: 'char-deny', rid: 'q2', reason: 'field' }]) && j(p3.answer) === j([{ type: 'char-deny', rid: 'q3', reason: 'field' }]) && p2.owner.length + p3.owner.length + p2.notes.length + p3.notes.length === 0 && j(row('w_r2')) === r2Before,
        j([p1, p2, p3, row('w_rp')]));
})());
// Stage 6 F4c1: stats and what was paid on the wire — the real char-item handler (with the real delta and the GM's notice, sliced from net.js) on
// one host; the players' view of both rows test systems and of a system keyed to trip the packer; 150 rows at their largest within budget
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), J = JSON.stringify;
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const fxV = ['rows-d20', 'rows-3d6'].map(n => { try { const v = Sx.cleanSystem(JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8')), { F: Fx, gmView: false }); packCheck(v); return [n, !/Heat|Vorpal|Hidden/.test(J(v)) && v.fields.some(f => f.list && Array.isArray(f.list.stats) && f.list.price) && v.items.some(i => i.stats)]; } catch (e) { return [n, false, e.message]; } });
    const trap = Sx.cleanSystem({ v: 1, name: 'T', rolls: [], fields: [{ id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', list: { stats: [{ key: 'constructor' }, { key: 'toString' }, { key: 'hasOwnProperty' }, { key: 'BYTES_PER_ELEMENT' }, { key: 'Acc' }] } }], items: [{ id: 'i_t', name: 'T', stats: JSON.parse('{"constructor":1,"toString":2,"hasOwnProperty":3,"BYTES_PER_ELEMENT":5,"Acc":4}') }] }, { F: Fx, gmView: false });
    let trapOk = true; try { packCheck(trap); } catch (e) { trapOk = e.message; }
    check('F4c1 on the wire: the players\' view of both rows test systems (list stats, a price, entry stats) packs and carries no GM-only list, item or key (Heat, Vorpal, Hidden); a list or an item keyed with the packer\'s own names (constructor, toString, hasOwnProperty) keeps none of them and packs',
        fxV.every(x => x[1]) && trapOk === true && J(trap.fields[0].list.stats.map(s => s.key)) === J(['Acc']) && J(trap.items[0].stats) === J({ Acc: 4 }), J([fxV, trapOk]));
    const sysP = Sx.cleanSystem({ v: 1, name: 'P', rolls: [], fields: [
        { id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, price: 'Cost', stats: [{ key: 'Acc', show: true }, { key: 'Cost' }] } },
        { id: 'f_sc', key: 'Secret', label: 'Secret', kind: 'item-list', edit: 'owner', vis: 'gm', list: { stats: [{ key: 'Heat' }] } }],
        items: [{ id: 'i_blaster', name: 'Blaster', stats: { Acc: 2, Cost: 500, Heat: 7 } }, { id: 'i_rune', name: 'Rune', vis: 'gm', stats: { Acc: 5, Cost: 10, Heat: 9 } }] }, { F: Fx, gmView: true });
    const camp = { id: 'k', system: sysP, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_r', defId: 'i_rune', qty: 1, paid: 10 }] } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
    const out = { answer: [], owner: [], mate: [], notes: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); };
    const connA = { peer: 'pA', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
    const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
        net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), () => {});
    const SEND = (rid, q) => { out.answer.length = 0; out.owner.length = 0; out.mate.length = 0; out.notes.length = 0; const s0 = out.saves; H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_wp' }, q), connA); return { answer: out.answer.slice(), owner: out.owner.slice(), mate: out.mate.slice(), saves: out.saves - s0 }; };
    const row = id => camp.chars.c_1.values.f_wp.find(r => r.id === id), ownRow = (d, id) => (((d[0] || {}).values || {}).f_wp || []).find(r => r.id === id);
    const a1 = SEND('q1', { op: 'add', defId: 'i_blaster', rowId: 'w_n1' }), afterAdd = J(row('w_n1'));
    const s1 = SEND('q2', { op: 'set', rowId: 'w_n1', facts: { paid: 1 } });
    const m1 = SEND('q3', { op: 'set', rowId: 'w_n1', facts: { paid: '5' } }), m2 = SEND('q4', { op: 'set', rowId: 'w_n1', facts: { paid: -1 } }), m3 = SEND('q5', { op: 'set', rowId: 'w_n1', facts: { note: 'hi', paid: '5' } });
    check('F4c1 on the wire: a player\'s add is acked and records what one cost from the host\'s own entry (500), stored and in their delta — beside their GM-only item\'s inline copy with its list\'s stats only (no Heat); a teammate\'s copy carries nothing of the list',
        J(a1.answer) === J([{ type: 'char-ack', rid: 'q1' }]) && afterAdd === J({ id: 'w_n1', defId: 'i_blaster', qty: 1, paid: 500 }) && J(ownRow(a1.owner, 'w_n1')) === afterAdd && a1.saves === 1
        && J((ownRow(a1.owner, 'w_r') || {}).def && ownRow(a1.owner, 'w_r').def.stats) === J({ Acc: 5, Cost: 10 }) && ownRow(a1.owner, 'w_r').paid === 10 && !/Heat|f_sc/.test(J(a1.owner)) && !/f_wp|Blaster|Rune/.test(J(a1.mate)), J([a1, afterAdd]));
    check('F4c1 on the wire: a player\'s change of what was paid is refused ("field") with nothing stored, sent or saved; a malformed paid (a string, below 0, beside another fact) is dropped unanswered and changes nothing',
        J(s1.answer) === J([{ type: 'char-deny', rid: 'q2', reason: 'field' }]) && s1.owner.length === 0 && s1.saves === 0 && [m1, m2, m3].every(r => r.answer.length === 0 && r.owner.length === 0 && r.saves === 0) && J(row('w_n1')) === afterAdd, J([s1, m1, m3, row('w_n1')]));
    const stats10 = Array.from({ length: Sx.LIMITS.listStats }, (_, i) => ({ key: 'S' + i, label: 'Stat number ' + i, show: i < 3 })), vals10 = v => { const o = {}; stats10.forEach((s, i) => { o[s.key] = v * (i + 1) + 0.25; }); return o; };
    const big = Sx.cleanSystem({ v: 1, name: 'B', rolls: [], fields: [{ id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, price: 'S0', stats: stats10 } }],
        items: [{ id: 'i_pub', name: 'A public item with a long name', notes: 'n'.repeat(200), stats: vals10(99) }, { id: 'i_gm', name: 'A GM-only item with a long name', vis: 'gm', notes: 'g'.repeat(200), stats: vals10(-999999) }] }, { F: Fx, gmView: true });
    const rowsB = []; for (let i = 0; i < 150; i++) rowsB.push(i % 2 ? { id: 'w_p' + i, defId: 'i_pub', qty: 99, paid: 99999999.25, note: 'x'.repeat(200) } : { id: 'w_g' + i, defId: 'i_gm', qty: 99, paid: 123456.789, note: 'y'.repeat(200) });
    const viewB = Sx.cleanSystem(big, { F: Fx, gmView: false }), libB = {}; big.items.forEach(i => { libB[i.id] = i; });
    const projB = Sx.charFor({ id: 'c_b', name: 'B', ownerId: 'u_b', npc: false, values: { f_wp: rowsB } }, viewB, 'u_b', { items: libB }), msgB = { type: 'char', campId: 'k', char: projB };
    let packedB = true; try { packCheck(msgB); } catch (e) { packedB = e.message; }
    const sizeB = J(msgB).length, inlB = projB.values.f_wp.filter(r => r.lnk === 1);
    check('F4c1 on the wire: 150 rows at their largest (pointers with what was paid, GM-only items inline with every stat a list may carry (' + Sx.LIMITS.listStats + '), 200-character notes) project, pack and stay within 1,400,000 bytes (' + sizeB + ' bytes)',
        packedB === true && sizeB < 1400000 && projB.values.f_wp.length === 150 && inlB.length === 75 && Object.keys(inlB[0].def.stats).length === Sx.LIMITS.listStats && Sx.LIMITS.listStats >= 24 && projB.values.f_wp.every(r => typeof r.paid === 'number'), String(packedB) + ' ' + sizeB);
})());

// Stage 6 F4c3: custom rows on the wire — the real char-item handler (with the real delta and the GM's notice, sliced from net.js) on one host:
// a player's own row (acked, own in their delta, its Undo window open), the GM's fields refused, a GM-made row theirs to leave alone, a derived id,
// the list's tick, a key a GM-only entry has (accepted: never confirmed) and a visible one (refused with the reason alone); 150 custom rows in budget
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), J = JSON.stringify;
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysC = Sx.cleanSystem({ v: 1, name: 'C', rolls: [], fields: [{ id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', edit: 'owner', vis: 'all', list: { custom: true, cats: ['Skill'], stats: [{ key: 'Rel' }] } }],
        items: [{ id: 'i_karate', name: 'Karate', category: 'Skill', key: 'Karate' }, { id: 'i_hidden', name: 'Hidden', category: 'Skill', key: 'Hidden', vis: 'gm' }] }, { F: Fx, gmView: true });
    const camp = { id: 'k', system: sysC, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_sk: [{ id: 'w_g', qty: 1, def: { name: 'Relic', damage: '2d6', rm: 'bound' } }] } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
    const out = { answer: [], owner: [], mate: [], saves: 0 }, all = [], box = b => m => { packCheck(m); const c = JSON.parse(J(m)); b.push(c); all.push(c); };
    const connA = { peer: 'pA', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
    const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n}, grace: function() { return _rowGrace; } };')(
        net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
    const SEND = (rid, q) => { out.answer.length = 0; out.owner.length = 0; out.mate.length = 0; const s0 = out.saves, before = J(camp.chars.c_1.values.f_sk); H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_sk', op: 'custom' }, q), connA); return { answer: out.answer.slice(), owner: out.owner.slice(), mate: out.mate.slice(), saves: out.saves - s0, same: J(camp.chars.c_1.values.f_sk) === before }; };
    const row = id => camp.chars.c_1.values.f_sk.find(r => r.id === id), ownRow = (d, id) => (((d[0] || {}).values || {}).f_sk || []).find(r => r.id === id), deny = (rid, reason) => J([{ type: 'char-deny', rid, reason }]);
    const n1 = SEND('q1', { rowId: 'w_p1', def: {} }), g1 = Object.keys(H.grace()), n2 = SEND('q2', { rowId: 'w_p1', def: { name: 'Tarot', key: 'Hidden', stats: { Rel: 2 } } });
    const n3 = SEND('q3', { rowId: 'w_p1', def: { damage: '1d6' } }), n4 = SEND('q4', { rowId: 'w_g', def: { name: 'Mine' } }), n5 = SEND('q5', { rowId: 'w_karate', def: {} }), n6 = SEND('q6', { rowId: 'w_p2', def: { key: 'Karate' } });
    const n7 = SEND('q7', { rowId: 'w_p1', def: JSON.parse('{"stats":{"toString":1}}') }), n8 = SEND('q8', { rowId: 'w_p1' });
    delete camp.system.fields[0].list.custom; const n9 = SEND('q9', { rowId: 'w_p1', def: { name: 'X' } }); camp.system.fields[0].list.custom = true;
    check('F4c3 on the wire: a player\'s new custom row is acked, stored as theirs (own) and in their delta (a teammate gets nothing of the list), and opens its Undo window; their key a GM-only entry has is accepted (never confirmed) while a visible one\'s is refused with the reason alone; the GM\'s fields, a GM-made row, a derived id and a list without Custom rows are refused, storing and sending nothing; a malformed message is dropped unanswered; the GM\'s damage never reaches its owner',
        J(n1.answer) === J([{ type: 'char-ack', rid: 'q1' }]) && row('w_p1').own === 1 && ownRow(n1.owner, 'w_p1').own === 1 && !/f_sk/.test(J(n1.mate)) && g1.some(k => /w_p1/.test(k))
        && J(n2.answer) === J([{ type: 'char-ack', rid: 'q2' }]) && row('w_p1').def.key === 'Hidden' && ownRow(n2.owner, 'w_p1').def.name === 'Tarot'
        && n3.answer.length === 1 && J(n3.answer) === deny('q3', 'field') && n3.same && n3.saves === 0 && J(n4.answer) === deny('q4', 'field') && n4.same && J(n5.answer) === deny('q5', 'value') && n5.same
        && J(n6.answer) === deny('q6', 'value') && n6.same && n7.answer.length === 0 && n7.same && n8.answer.length === 0 && J(n9.answer) === deny('q9', 'field') && n9.same
        && !/2d6|"bound"/.test(J(all.filter(m => m.type !== 'char-ack' && m.type !== 'char-deny'))),
        J([n1.answer, g1, n2.answer, n3.answer, n4.answer, n5.answer, n6.answer, n7.answer, n8.answer, n9.answer, row('w_p1')]));
    const many = Array.from({ length: 150 }, (_, i) => ({ id: 'w_c' + i, qty: 1, own: 1, def: { name: 'Custom ' + i, icon: '', category: 'Skill', notes: 'n'.repeat(200), key: 'K' + i, stats: { Rel: i } } }));
    const view = Sx.cleanSystem(sysC, { F: Fx, gmView: false }), projM = Sx.projectRows(many, view, {}, view.fields[0].list); let packedM = true; try { packCheck({ type: 'charDelta', charId: 'c_1', values: { f_sk: projM } }); } catch (e) { packedM = e.message; }
    check('F4c3 on the wire: 150 custom rows (a key, a note, a stat each) project and pack within the budget; the client sends a custom op\'s def',
        packedM === true && projM.length === 150 && J(projM).length < 200000 && /if \(q\.def !== undefined\) mI\.def = q\.def;/.test(src), J([packedM, J(projM).length]));
})());
// 155 (1.5.5): a row of the character's own keeps a description and By level text of its own, as a library entry does. The real char-item
// handler (with the real delta, sliced from net.js) on one host: a player's own row stored and sent cleaned, a change past the list's room
// refused ("long") with nothing stored, a change that brings an over-full list down taken, a GM-only row's text never on its owner's copy;
// their own app refusing the same in its own words (the real net.charItem); the host's word in its join snapshot, and a player's app taking it
// (rowTextKnows and net.rowTextOk, sliced and run)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), J = JSON.stringify;
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysR = Sx.cleanSystem({ v: 1, name: 'R', rolls: [], fields: [{ id: 'f_kn', key: 'Knacks', label: 'Knacks', kind: 'item-list', edit: 'owner', vis: 'all', list: { custom: true, stats: [{ key: 'Rank' }] } }], items: [] }, { F: Fx, gmView: true });
    const FULL = () => ({ desc: 'd'.repeat(4000), lvls: Array.from({ length: 20 }, (_, i) => ({ lvl: i + 1, text: 't'.repeat(600), tag: 'g'.repeat(40) })) });   // one row's long text at its largest: 16,960 as the room counts it
    const longOf = d => !d ? 0 : (typeof d.desc === 'string' ? d.desc.length : 0) + (Array.isArray(d.lvls) ? d.lvls.reduce((n, r) => n + r.text.length + (r.tag ? r.tag.length : 0) + 8, 0) : 0);   // the suite's own count
    const ownR = (id, def, more) => Object.assign({ id, qty: 1, own: 1, def: Object.assign({ name: 'Knack ' + id, category: '', icon: '', notes: '', vis: 'all' }, def) }, more || {});
    const gmR = (id, def, more) => Object.assign({ id, qty: 1, def: Object.assign({ name: 'Lore ' + id, category: '', icon: '', notes: '', vis: 'all' }, def) }, more || {});
    const mk = rows => {
        const camp = { id: 'k', system: JSON.parse(J(sysR)), chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_kn: JSON.parse(J(rows)) } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
        const out = { answer: [], owner: [], mate: [], saves: 0 }, all = [], box = b => m => { packCheck(m); const c = JSON.parse(J(m)); b.push(c); all.push(c); };
        const connA = { peer: 'pA', send: box(out.answer) };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const Hh = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n}, view: function(id, pid) { return charViewFor(id, pid); } };')(
            net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
        const SEND = (rid, q) => { out.answer.length = 0; out.owner.length = 0; out.mate.length = 0; const s0 = out.saves, before = J(camp.chars.c_1.values.f_kn); Hh.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_kn', op: 'custom' }, q), connA); return { answer: out.answer.slice(), owner: out.owner.slice(), mate: out.mate.slice(), saves: out.saves - s0, same: J(camp.chars.c_1.values.f_kn) === before }; };
        const row = id => camp.chars.c_1.values.f_kn.find(r => r.id === id) || null, sent = (d, id) => ((((d[0] || {}).values || {}).f_kn) || []).find(r => r.id === id) || null;
        return { camp, SEND, row, sent, all, view: (id, pid) => Hh.view(id, pid) };
    };
    const ack = rid => J([{ type: 'char-ack', rid }]), deny = (rid, reason) => J([{ type: 'char-deny', rid, reason }]);

    // (a) a row of the player's own: stored cleaned, in their delta; cleared; cut; the GM's rows theirs to leave alone; a malformed text dropped unanswered
    const A = mk([gmR('w_gm', { name: 'Sealed', notes: 'Kept close', vis: 'gm', stats: { Rank: 4 }, desc: 'The sealed truth', lvls: [{ lvl: 1, text: 'A hidden gift' }] }),
        gmR('w_gv', { name: 'Open', desc: 'Open lore', lvls: [{ lvl: 2, text: 'An open gift', tag: 'Second' }] })]);
    const lv1 = [{ lvl: 1, text: 'First gift' }, { lvl: 3, text: 'Third gift', tag: 'Rank three' }];
    const a1 = A.SEND('q1', { rowId: 'w_p1', def: { name: 'Knack', desc: 'Line one\r\nLine two\u0007end', lvls: [{ lvl: 3, text: 'Third gift', tag: 'Rank three' }, { lvl: 1, text: 'First\tgift' }, { lvl: 1, text: 'A second first' }] } });
    const p1 = A.row('w_p1'), p1s = A.sent(a1.owner, 'w_p1'), gmS = A.sent(a1.owner, 'w_gm'), gvS = A.sent(a1.owner, 'w_gv'), copy1 = A.view('c_1', 'u_a'), copyGm = ((copy1 && copy1.values.f_kn) || []).find(r => r.id === 'w_gm') || null;
    check('155 on the wire: a player\'s own row takes a description and By level text in one change (the real char-item handler): acked, stored as the core cleans it (its line breaks kept, a control character a space; the levels one a level, in level order, a tab a space) as the row\'s last keys, saved once, and in their delta just so; a teammate\'s copy carries nothing of the list',
        J(a1.answer) === ack('q1') && a1.saves === 1 && !!p1 && p1.own === 1 && p1.def.name === 'Knack' && p1.def.desc === 'Line one\nLine two end' && J(p1.def.lvls) === J(lv1) && J(Object.keys(p1.def).slice(-2)) === J(['desc', 'lvls'])
        && !!p1s && p1s.own === 1 && p1s.def.desc === 'Line one\nLine two end' && J(p1s.def.lvls) === J(lv1) && !/f_kn/.test(J(a1.mate)), J([a1.answer, a1.saves, p1, p1s]));
    check('155 on the wire: a GM-only row of the character\'s own keeps its text on the host through a player\'s change, and its owner\'s delta and whole copy carry its name, notes and stats with none of that text (nothing sent holds it); a row the GM made that players see carries its own',
        !!gmS && gmS.def.name === 'Sealed' && gmS.def.notes === 'Kept close' && J(gmS.def.stats) === J({ Rank: 4 }) && !('desc' in gmS.def) && !('lvls' in gmS.def)
        && !!copyGm && copyGm.def.name === 'Sealed' && !('desc' in copyGm.def) && !('lvls' in copyGm.def) && !/sealed truth|hidden gift/i.test(J(A.all)) && !/sealed truth|hidden gift/i.test(J(copy1))
        && A.row('w_gm').def.desc === 'The sealed truth' && J(A.row('w_gm').def.lvls) === J([{ lvl: 1, text: 'A hidden gift' }])
        && !!gvS && gvS.def.desc === 'Open lore' && J(gvS.def.lvls) === J([{ lvl: 2, text: 'An open gift', tag: 'Second' }]), J([gmS, copyGm, gvS, A.row('w_gm')]));
    const a2 = A.SEND('q2', { rowId: 'w_p1', def: { desc: '   ', lvls: null } }), p2 = J(A.row('w_p1').def), p2s = A.sent(a2.owner, 'w_p1');
    const a3 = A.SEND('q3', { rowId: 'w_p1', def: { desc: 'Back again', lvls: [{ lvl: 2, text: 'Two' }] } }), p3 = J(A.row('w_p1').def);
    const a4 = A.SEND('q4', { rowId: 'w_p1', def: { desc: null, lvls: [] } }), p4 = J(A.row('w_p1').def), p4s = A.sent(a4.owner, 'w_p1');
    const a5 = A.SEND('q5', { rowId: 'w_p1', def: { desc: 'p'.repeat(6000), lvls: Array.from({ length: 800 }, (_, i) => ({ lvl: 800 - i, text: 'L' + (800 - i) })) } }), p5 = A.row('w_p1').def, p5s = A.sent(a5.owner, 'w_p1');
    check('155 on the wire: a player clears their own row\'s text (a blank description and no levels, then null and an empty list), each acked with neither kept nor sent; sets it again; and a description past the core\'s length is cut to it, 800 levels kept as the first 200 in level order',
        J(a2.answer) === ack('q2') && !/"desc"|"lvls"/.test(p2) && !!p2s && !('desc' in p2s.def) && !('lvls' in p2s.def) && J(a3.answer) === ack('q3') && JSON.parse(p3).desc === 'Back again' && J(JSON.parse(p3).lvls) === J([{ lvl: 2, text: 'Two' }])
        && J(a4.answer) === ack('q4') && !/"desc"|"lvls"/.test(p4) && !!p4s && !('desc' in p4s.def) && !('lvls' in p4s.def)
        && J(a5.answer) === ack('q5') && p5.desc === 'p'.repeat(4000) && J(p5.lvls.map(l => l.lvl)) === J(Array.from({ length: 200 }, (_, i) => 601 + i)) && !!p5s && p5s.def.desc.length === 4000 && p5s.def.lvls.length === 200,
        J([a2.answer, p2, a3.answer, p3, a4.answer, p4, a5.answer, p5 && p5.lvls && p5.lvls.map(l => l.lvl)]));
    const bad = [{ desc: 7 }, { desc: 'q'.repeat(16001) }, { lvls: 'x' }, { lvls: {} }, { lvls: Array.from({ length: 801 }, (_, i) => ({ lvl: i, text: 'x' })) }, { lvls: [{ lvl: '1', text: 'x' }] }, { lvls: [{ lvl: NaN, text: 'x' }] },
        { lvls: [{ lvl: 1, text: 7 }] }, { lvls: [{ lvl: 1, text: 'x'.repeat(2401) }] }, { lvls: [{ lvl: 1, text: 'x', tag: 5 }] }, { lvls: [{ lvl: 1, text: 'x', tag: 'g'.repeat(161) }] }, { lvls: ['x'] }].map((d, i) => A.SEND('m' + i, { rowId: 'w_p1', def: d }));
    const edge = [A.SEND('e1', { rowId: 'w_p1', def: { desc: 'q'.repeat(16000) } }), A.SEND('e2', { rowId: 'w_p1', def: { lvls: [{ lvl: 1, text: 'x'.repeat(2400), tag: 'g'.repeat(160) }] } })];
    const a6 = A.SEND('q6', { rowId: 'w_gm', def: { desc: 'Mine now' } }), a7 = A.SEND('q7', { rowId: 'w_gv', def: { lvls: [{ lvl: 1, text: 'Mine now' }] } });
    check('155 on the wire: a malformed text is dropped unanswered and changes nothing (a description that is no text or past 16,000 characters; levels that are no list, more than 800, a level that is no number, a text that is no text or past 2,400, a tag that is no text or past 160, an entry that is no object), one at each bound is taken; the GM\'s rows, a GM-only one and one players see, are refused ("field") with their text as it was',
        bad.every(r => r.answer.length === 0 && r.owner.length === 0 && r.saves === 0 && r.same) && edge.every((r, i) => J(r.answer) === ack('e' + (i + 1)))
        && J(a6.answer) === deny('q6', 'field') && a6.same && J(a7.answer) === deny('q7', 'field') && a7.same && A.row('w_gm').def.desc === 'The sealed truth' && A.row('w_gv').def.desc === 'Open lore',
        J([bad.map(r => r.answer), edge.map(r => r.answer), a6.answer, a7.answer]));

    // (b) the list's room: its own rows hold 2,000,000 characters of long text in all (a kept curse's copy not counted)
    const B = mk(Array.from({ length: 117 }, (_, i) => ownR('w_f' + i, FULL())).concat([gmR('w_hc', Object.assign({ name: 'Clinging', rm: 'curse' }, FULL()), { hid: 1 })]));   // 117 x 16,960 = 1,984,320
    const b1 = B.SEND('b1', { rowId: 'w_n1', def: FULL() }), b1row = B.row('w_n1');
    const b2 = B.SEND('b2', { rowId: 'w_n2', def: { name: 'Short', desc: 'x'.repeat(4000) } });   // 1,988,320
    const copyB = JSON.parse(J(B.view('c_1', 'u_a')));   // the owner's whole copy at this point: their own app's starting point below
    const b3 = B.SEND('b3', { rowId: 'w_n2', def: { lvls: FULL().lvls } });
    check('155 on the wire: a player\'s change that would take the list\'s own rows past ' + Sx.LIMITS.ownText + ' characters of long text is refused ("long") with nothing stored, sent or saved (a new row whole, and levels added to a row of theirs); one that fits is acked and stored; a kept curse\'s copy counts for nothing',
        Sx.LIMITS.ownText === 2000000 && J(b1.answer) === deny('b1', 'long') && b1.same && b1.saves === 0 && b1.owner.length === 0 && b1.mate.length === 0 && b1row === null
        && J(b2.answer) === ack('b2') && B.row('w_n2').def.desc.length === 4000 && J(b3.answer) === deny('b3', 'long') && b3.same && b3.saves === 0 && b3.owner.length === 0 && !('lvls' in B.row('w_n2').def),
        J([b1.answer, b1.saves, b2.answer, b3.answer]));
    B.camp.chars.c_1.values.f_kn.push(gmR('w_g1', FULL()), gmR('w_g2', FULL()));   // the GM's own rows take it over the room: 2,022,240
    const b5 = B.SEND('b5', { rowId: 'w_f0', def: { name: 'Renamed' } }), b6 = B.SEND('b6', { rowId: 'w_f1', def: { desc: 'Cut short' } });
    const shown = ((((b6.owner[0] || {}).values || {}).f_kn) || []).filter(r => r.lnk !== 1), shownN = shown.reduce((n, r) => n + longOf(r.def), 0);
    const b7 = B.SEND('b7', { rowId: 'w_f1', def: { desc: 'y'.repeat(4000) } }), b8 = B.SEND('b8', { rowId: 'w_f2', def: { desc: 'z'.repeat(4000) } });
    check('155 on the wire: over the room, a change that names no long text is taken, one that brings the text down is taken (still over), one that leaves it as it was is taken, and one that takes it up again is refused ("long") with nothing stored',
        J(b5.answer) === ack('b5') && B.row('w_f0').def.name === 'Renamed' && J(b6.answer) === ack('b6') && B.row('w_f1').def.desc === 'Cut short'
        && J(b7.answer) === deny('b7', 'long') && b7.same && b7.saves === 0 && B.row('w_f1').def.desc === 'Cut short' && J(b8.answer) === ack('b8') && B.row('w_f2').def.desc === 'z'.repeat(4000),
        J([b5.answer, b6.answer, b7.answer, b8.answer]));
    check('155 on the wire: an owner\'s delta carries at most ' + Sx.LIMITS.ownText + ' characters of their character\'s own rows\' long text, in the list\'s order (rows past the room go without, the GM\'s copy keeps theirs), a room apart from the library rows\'',
        shownN === 1984329 && shownN <= Sx.LIMITS.ownText && shown.find(r => r.id === 'w_f0').def.desc.length === 4000 && shown.find(r => r.id === 'w_n2').def.desc.length === 4000
        && ['w_g1', 'w_g2'].every(id => { const r = shown.find(x => x.id === id); return !!r && !('desc' in r.def) && !('lvls' in r.def) && B.row(id).def.desc.length === 4000; }) && !shown.some(r => r.id === 'w_hc'),
        J([shownN, shown.map(r => [r.id, longOf(r.def)])]));

    // (c) their own app: the real net.charItem over the owner's copy the host sent (1,988,320 of long text)
    const cA = src.indexOf('net.charItem = function('), cZ = src.indexOf('\n};\n', cA) + 3, viewR = Sx.cleanSystem(sysR, { F: Fx, gmView: false }), sentC = [];
    const campC = { id: 'k', system: viewR, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_kn: JSON.parse(J(copyB.values.f_kn)) } } } };
    const netC = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', libEntry: null, conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sentC.push(JSON.parse(J(m))); } }] };
    new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', src.slice(cA, cZ))(netC, () => Sx, () => campC, { wpFormula: Fx, wpVtt: { on: () => true } }, {}, () => {}, () => 0);
    const c0 = J(campC.chars.c_1.values.f_kn), cl1 = netC.charItem('c_1', 'f_kn', { op: 'custom', rowId: 'w_n9', def: FULL() }), cl1same = J(campC.chars.c_1.values.f_kn) === c0, cl1sent = sentC.length;
    const cl2 = netC.charItem('c_1', 'f_kn', { op: 'custom', rowId: 'w_n2', def: { lvls: [{ lvl: 1, text: 'One gift' }] } });
    check('155 their own app (the real net.charItem): a change past the room is refused at once in its own words ("This list’s own rows hold all the long text they may.") with nothing sent or kept; one that fits goes to the host as it was asked and lands on their copy',
        longOf({ desc: '' }) === 0 && copyB.values.f_kn.filter(r => r.lnk !== 1).reduce((n, r) => n + longOf(r.def), 0) === 1988320
        && J(cl1) === J({ error: 'This list’s own rows hold all the long text they may.' }) && cl1same && cl1sent === 0
        && cl2.ok === true && sentC.length === 1 && sentC[0].type === 'char-item' && sentC[0].op === 'custom' && J(sentC[0].def) === J({ lvls: [{ lvl: 1, text: 'One gift' }] })
        && J(campC.chars.c_1.values.f_kn.find(r => r.id === 'w_n2').def.lvls) === J([{ lvl: 1, text: 'One gift' }]), J([cl1, cl1same, cl1sent, cl2, sentC]));

    // (d) the host's word: its join snapshot says rowText, and a player's app takes it as true only (rowTextKnows and net.rowTextOk, sliced and run)
    const rtA = src.indexOf('var _rowTextOk = false;'), rtB = rtA < 0 ? -1 : src.indexOf('net.rowTextOk = function(', rtA), rtZ = rtB < 0 ? -1 : src.indexOf('\n', rtB);
    const rtSrc = rtA >= 0 && rtB > rtA && rtZ > rtB ? src.slice(rtA, rtZ) : 'throw new Error("the rowText lines are not found");';
    const mkRT = role => { const n = { role }; let P = null; try { P = new Function('net', "'use strict';\n" + rtSrc + '\nreturn { knows: rowTextKnows };')(n); } catch (e) { P = null; } return { n, P };};
    const rtWays = (() => { try {
        const f = mkRT('client'), w0 = f.n.rowTextOk(); f.P.knows(true); const w1 = f.n.rowTextOk(); f.P.knows(undefined); const w2 = f.n.rowTextOk();
        const odd = [undefined, null, false, 1, 'true', {}, [], 'yes'].map(v => { const t = mkRT('client'); t.P.knows(v); return t.n.rowTextOk(); });
        const h = mkRT('host'), h0 = h.n.rowTextOk(); h.P.knows(false); const h1 = h.n.rowTextOk(), o = mkRT(null), o0 = o.n.rowTextOk(), o1 = mkRT(undefined).n.rowTextOk();
        return [w0, w1, w2, odd, h0, h1, o0, o1];
    } catch (e) { return String(e && e.message); } })();
    const snP = require('./checkkit').part('netfog.js'), snA = snP.indexOf('function applySnapshot(msg) {'), snZ = snA < 0 ? -1 : snP.indexOf('\n}\n', snA), snCall = snP.indexOf("    if (typeof rowTextKnows === 'function') rowTextKnows(msg.rowText);");   // applySnapshot stands in netfog.js, a part of net.js
    check('155 the host\'s word (rowTextKnows and net.rowTextOk, sliced and run): a player\'s app offers a row of its own\'s long text only once its host\'s snapshot says rowText, and only as true (a later snapshot that does not say it takes the word back); the machine that owns the campaign, and one at no table, always may; the snapshot says it beside looks, and applySnapshot takes it through typeof right after the looks, the one place that sets the word',
        J(rtWays) === J([false, true, false, [false, false, false, false, false, false, false, false], true, true, true, true])
        && /combats: combatsFor\(prof\.id, prof\.location\), fights: true, looks: true, rowText: true, notepad: notepadMsg\(\) \};/.test(src)
        && /\n    if \(typeof styleHostKnows === 'function'\) styleHostKnows\(msg\.looks\);[^\n]*\n    if \(typeof rowTextKnows === 'function'\) rowTextKnows\(msg\.rowText\);/.test(require('./checkkit').part('netfog.js'))
        && snA > 0 && snCall > snA && snCall < snZ && src.split('rowTextKnows(').length === 3 && src.split('_rowTextOk =').length === 3, J(rtWays));
})());

// owed review F4c3#2 (c3_): an entry only a GM-only library pack holds reads GM-only wherever the GM's machine hands it out — library.js entryFor
// (sliced, run on a stubbed library) behind rowDef, the rows' copies and the wire's itemLib: given to a player it reaches them with no key or
// blast, the host refuses its throw, and its key is free to that player's custom op, on the host and on their client (the real net.charItem, #8)
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Lx = await import(url('librarycore.js')), J = JSON.stringify;
    const c3_lb = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'library.js'), 'utf8').replace(/\r\n/g, '\n');
    const c3_la = c3_lb.indexOf('function entry(id)'), c3_lz = c3_lb.indexOf('function entriesOf(', c3_la); if (c3_la < 0 || c3_lz < 0) throw new Error('netcheck: library.js entryFor not found');
    const c3_mp = o => Object.assign(Object.create(null), o);
    const c3_byId = c3_mp({ i_sec: { id: 'i_sec', name: 'Assassin blade', category: 'Blade', key: 'AssassinBlade', vis: 'all', damage: '2d6', area: { ft: 10, shape: 'circle', name: 'Arc' } },
        i_pub: { id: 'i_pub', name: 'Longsword', category: 'Blade', key: 'Longsword', vis: 'all', damage: '1d8', area: { ft: 5, shape: 'circle', name: 'Sweep' } }, i_own: { id: 'i_own', name: 'Own secret', category: 'Blade', key: 'OwnSecret', vis: 'gm' } });
    const c3_cur = { campId: 'k', sig: '', byId: c3_byId, packs: c3_mp({ p_gm: ['i_sec'], p_pub: ['i_pub', 'i_own'] }), n: 3, state: 'ready', error: '' };
    const c3_sys = Sx.cleanSystem({ v: 1, name: 'G', rolls: [], fields: [{ id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { custom: true, cats: ['Blade'] } }], items: [] }, { F: Fx, gmView: true });
    const c3_camp = { id: 'k', library: { dir: 'lib1', packs: [{ id: 'p_gm', name: 'Secrets', rev: 1, count: 1, vis: 'gm' }, { id: 'p_pub', name: 'Gear', rev: 1, count: 2 }] }, system: c3_sys,
        chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [] } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
    const c3_L = new Function('getActiveCampaign', 'cur', 'manifestSig', 'map', c3_lb.slice(c3_la, c3_lz) + '\nreturn { entry: entry, entryFor: entryFor };')(() => c3_camp, c3_cur, Lx.manifestSig, () => Object.create(null));
    const c3_e1 = c3_L.entryFor('i_sec'), c3_e1b = c3_L.entryFor('i_sec'), c3_e2 = c3_L.entryFor('i_pub'), c3_e3 = c3_L.entryFor('i_own'), c3_e4 = c3_L.entryFor('i_zz');
    delete c3_camp.library.packs[0].vis; const c3_e5 = c3_L.entryFor('i_sec'); c3_camp.library.packs[0].vis = 'gm'; const c3_e6 = c3_L.entryFor('i_sec');
    check('owed review F4c3#2 entryFor (library.js, sliced and run): an entry of a GM-only pack reads as a copy marked GM-only (its key and blast as stored; the same copy each call) while the pack\'s own copy keeps its vis; a visible pack\'s entry is the stored one; an entry marked GM-only itself as stored; an unknown id nothing; the pack\'s mark is read at each call (made visible: the stored entry); it is the lookup systemcore reads and the one the rows\' copies are kept current from and taken from when the items move in',
        c3_e1.vis === 'gm' && c3_e1.key === 'AssassinBlade' && c3_e1.area.ft === 10 && c3_e1 !== c3_byId.i_sec && c3_byId.i_sec.vis === 'all' && c3_e1b === c3_e1 && c3_e2 === c3_byId.i_pub && c3_e3 === c3_byId.i_own && c3_e4 === null
        && c3_e5 === c3_byId.i_sec && c3_e6.vis === 'gm' && /\nsetLibraryFind\(entryFor\);\n/.test(c3_lb) && /var r = libSnaps\(camp\.system, camp\.chars, entryFor\);/.test(c3_lb) && /\n\s*libSnaps\(sysAfter, camp\.chars \|\| \{\}, entryFor\);/.test(c3_lb),
        J([c3_e1, c3_e2 === c3_byId.i_pub, c3_e3 === c3_byId.i_own, c3_e4, c3_e5 && c3_e5.vis, c3_e6 && c3_e6.vis]));

    // the host: the GM gives both entries (the rows keep their copies), then the player's custom op goes through the real char-item handler
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const c3_out = { answer: [], owner: [], mate: [] }, c3_box = b => m => { packCheck(m); b.push(JSON.parse(J(m))); }, c3_placed = [];
    const c3_net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: c3_box(c3_out.owner) }, { peer: 'pB', open: true, send: c3_box(c3_out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
    const c3_win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null,
        wpLibrary: { size: () => 3, entry: c3_L.entry, entryFor: c3_L.entryFor, playerEntry: () => null }, wpPlaceThrownBlast: b => c3_placed.push(b) };
    const c3_H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n}, view: function(id, pid) { return charViewFor(id, pid); } };')(
        c3_net, () => Sx, c3_win, () => false, () => c3_camp, () => {}, e => { throw e; }, c => (c3_net.roster[c.peer] ? c3_net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
    const c3_thI = src.indexOf("} else if (msg.type === 'throw-req' && net.role === 'host') {"), c3_thS = src.slice(c3_thI, src.indexOf('\n    } else if', c3_thI + 10)), c3_thBody = c3_thS.slice(c3_thS.indexOf('\n') + 1);
    const c3_map = { id: 'm1', whiteboard: [{ id: 't1', isChar: true, ownerId: 'u_a', charId: 'c_1' }] };
    const c3_throw = rowId => { const n0 = c3_placed.length; new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'charLimit', 'getActiveCampaign', 'getActiveMap', c3_thBody)({ type: 'throw-req', charId: 'c_1', fieldId: 'f_wp', rowId, mapId: 'm1', x: 100, y: 120 }, { peer: 'pA' }, c3_net, () => Sx, c3_win, () => false, { allow: () => true }, () => c3_camp, () => c3_map); return c3_placed.slice(n0); };
    const c3_SEND = (rid, q) => { c3_out.answer.length = 0; c3_out.owner.length = 0; c3_out.mate.length = 0; c3_H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_wp', op: 'custom' }, q), { peer: 'pA', send: c3_box(c3_out.answer) }); return { answer: c3_out.answer.slice(), owner: c3_out.owner.slice(), mate: c3_out.mate.slice() }; };
    let c3_add, c3_proj, c3_tSec, c3_tPub, c3_s1, c3_s2; Sx.setLibraryFind(c3_L.entryFor);
    try {
        c3_add = Sx.applyRowOp(c3_sys, c3_camp.chars.c_1, 'f_wp', { op: 'add', defId: 'i_sec', rowId: 'w_sec' }, Fx, {}); c3_camp.chars.c_1.values.f_wp = c3_add.value;
        const c3_add2 = Sx.applyRowOp(c3_sys, c3_camp.chars.c_1, 'f_wp', { op: 'add', defId: 'i_pub', rowId: 'w_pub' }, Fx, {}); c3_camp.chars.c_1.values.f_wp = c3_add2.value;
        c3_proj = c3_H.view('c_1', 'u_a'); c3_tSec = c3_throw('w_sec'); c3_tPub = c3_throw('w_pub');
        c3_s1 = c3_SEND('q1', { rowId: 'w_n1', def: { name: 'Mine', key: 'AssassinBlade' } }); c3_s2 = c3_SEND('q2', { rowId: 'w_n2', def: { key: 'Longsword' } });
    } finally { Sx.setLibraryFind(null); }
    const c3_rowOf = (rows, id) => (rows || []).find(r => r.id === id) || null, c3_secP = c3_rowOf(c3_proj && c3_proj.values.f_wp, 'w_sec'), c3_pubP = c3_rowOf(c3_proj && c3_proj.values.f_wp, 'w_pub');
    const c3_ownD = ((c3_s1.owner[0] || {}).values || {}).f_wp || [], c3_secD = c3_rowOf(c3_ownD, 'w_sec'), c3_stored = c3_rowOf(c3_camp.chars.c_1.values.f_wp, 'w_sec');
    check('owed review F4c3#2 a GM-only pack\'s entry on a player\'s row (the host, the real delta and char-item handler): the row keeps a GM-only copy; its owner gets it inline with no key, blast or damage (a visible pack\'s entry keeps its key); the host refuses to throw it (the visible one is thrown); its key reads as free to that player\'s custom op (acked) while the visible entry\'s is taken',
        c3_add.ok && !!c3_stored && c3_stored.snap && c3_stored.snap.vis === 'gm' && !!c3_secP && c3_secP.lnk === 1 && c3_secP.def.name === 'Assassin blade' && !('key' in c3_secP.def) && !('area' in c3_secP.def) && !/AssassinBlade|2d6|"Arc"/.test(J(c3_proj))
        && !!c3_pubP && /Longsword/.test(J(c3_pubP)) && c3_tSec.length === 0 && c3_tPub.length === 1 && c3_tPub[0].ft === 5
        && J(c3_s1.answer) === J([{ type: 'char-ack', rid: 'q1' }]) && !!c3_secD && !('key' in c3_secD.def) && !('area' in c3_secD.def) && c3_rowOf(c3_ownD, 'w_n1').def.key === 'AssassinBlade' && !/f_wp/.test(J(c3_s1.mate))
        && J(c3_s2.answer) === J([{ type: 'char-deny', rid: 'q2', reason: 'value' }]),
        J([c3_add.ok, c3_stored, c3_secP, c3_tSec, c3_tPub, c3_s1.answer, c3_secD, c3_s2.answer]));

    // their client: the real net.charItem over the copy the host sent (its system is their view) — the same answers, in words (#8)
    const c3_cA = src.indexOf('net.charItem = function('), c3_cZ = src.indexOf('\n};\n', c3_cA) + 3, c3_sentC = [];
    const c3_view = Sx.cleanSystem(c3_sys, { F: Fx, gmView: false }), c3_campC = { id: 'k', system: c3_view, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: JSON.parse(J(c3_proj.values.f_wp)) } } } };
    const c3_netC = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', libEntry: null, conns: [{ peer: 'h', open: true, send: m => c3_sentC.push(JSON.parse(J(m))) }] };
    new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', src.slice(c3_cA, c3_cZ))(c3_netC, () => Sx, () => c3_campC, { wpFormula: Fx, wpVtt: { on: () => true } }, {}, () => {}, () => 0);
    const c3_cSec = c3_netC.charItem('c_1', 'f_wp', { op: 'custom', rowId: 'w_n1', def: { name: 'Mine', key: 'AssassinBlade' } }), c3_cPub = c3_netC.charItem('c_1', 'f_wp', { op: 'custom', rowId: 'w_n2', def: { key: 'Longsword' } }), c3_cBad = c3_netC.charItem('c_1', 'f_wp', { op: 'custom', rowId: 'w_n3', def: { key: '1x' } });
    check('owed review F4c3#2/#8 their client agrees (the real net.charItem): the GM-only pack\'s key is free (sent to the host), the visible entry\'s is taken ("That key is already used in this list."), a key that is not one says so ("Not a usable key: …"); only the accepted op is sent',
        c3_cSec.ok === true && c3_cPub.error === 'That key is already used in this list.' && c3_cBad.error === 'Not a usable key: a letter, then letters, digits and _ (up to 40).' && c3_sentC.length === 1 && c3_sentC[0].def.key === 'AssassinBlade',
        J([c3_cSec, c3_cPub, c3_cBad, c3_sentC]));
})());
// Stage 6 F4c2: a copy's own values on the wire — the real char-item handler (with the real delta and the GM's notice, sliced from net.js) on one
// host, Setting A switched off and on between messages; a copy's formulas and locks never reach its owner; 150 rows with their own values in budget
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), J = JSON.stringify;
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
    const sysV = Sx.cleanSystem({ v: 1, name: 'V', rolls: [], fields: [{ id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, on: { label: 'Readied' }, price: 'Cost', stats: [{ key: 'Acc', show: true }, { key: 'Dmg', show: true }, { key: 'Cost' }] } }],
        items: [{ id: 'i_blaster', name: 'Blaster', damage: '2d6', stats: { Acc: 2, Dmg: 3, Cost: 500 } }, { id: 'i_rune', name: 'Rune', vis: 'gm', stats: { Acc: 5 } }] }, { F: Fx, gmView: true });
    const camp = { id: 'k', system: sysV, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_wp: [{ id: 'w_b', defId: 'i_blaster', qty: 1, paid: 500 }, { id: 'w_g', defId: 'i_blaster', qty: 1, paid: 500, ov: { name: 'Tide', stats: { Dmg: 5 }, held: ['Dmg'], damage: '9d6', rm: 'bound', rmMsg: 'Bound here', eq: 'curse', eqMsg: 'Clings' } }, { id: 'w_r', defId: 'i_rune', qty: 1 }] } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
    const out = { answer: [], owner: [], mate: [], notes: [], saves: 0 }, all = [], box = b => m => { packCheck(m); const c = JSON.parse(J(m)); b.push(c); all.push(c); };
    const connA = { peer: 'pA', send: box(out.answer) };
    const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
    const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
        net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), () => {});
    const SEND = (rid, q) => { out.answer.length = 0; out.owner.length = 0; out.mate.length = 0; out.notes.length = 0; const s0 = out.saves, before = J(camp.chars.c_1.values.f_wp); H.handle(Object.assign({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_wp', op: 'ov' }, q), connA); return { answer: out.answer.slice(), owner: out.owner.slice(), mate: out.mate.slice(), saves: out.saves - s0, same: J(camp.chars.c_1.values.f_wp) === before }; };
    const row = id => camp.chars.c_1.values.f_wp.find(r => r.id === id), ownRow = (d, id) => (((d[0] || {}).values || {}).f_wp || []).find(r => r.id === id), deny = (rid, reason) => J([{ type: 'char-deny', rid, reason }]);
    const o1 = SEND('q1', { rowId: 'w_b', ov: { stats: { Acc: 9 } } });
    camp.system.listRules = { ownerStats: true };
    const o2 = SEND('q2', { rowId: 'w_b', ov: { stats: { Acc: 9 } } }), o3 = SEND('q3', { rowId: 'w_b', ov: { name: 'X' } }), o4 = SEND('q4', { rowId: 'w_r', ov: { stats: { Acc: 1 } } });
    const o5 = SEND('q5', { rowId: 'w_g', ov: { stats: { Acc: 8 } } }), mid5 = J(row('w_g').ov), o6 = SEND('q6', { rowId: 'w_g', ov: null }), o7 = SEND('q7', { rowId: 'w_g', ov: { stats: { Dmg: 1 } } });
    check('F4c2 on the wire: with Setting A off a player\'s own stat is refused ("field") with nothing stored, sent or saved; turned on, it is acked, stored and in their delta (Acc 9, a teammate\'s copy carries nothing of the list); another key ("field"), a GM-only item\'s inline copy ("missing", the answer carries nothing else) and a stat the GM set ("field", Q1 A) are refused; their null takes back their own stats only — the GM\'s name, stat, formula and locks stay on the host',
        J(o1.answer) === deny('q1', 'field') && o1.owner.length === 0 && o1.saves === 0 && o1.same
        && J(o2.answer) === J([{ type: 'char-ack', rid: 'q2' }]) && J(row('w_b').ov) === J({ stats: { Acc: 9 } }) && J(ownRow(o2.owner, 'w_b').ov) === J({ stats: { Acc: 9 } }) && o2.saves === 1 && !/f_wp|Blaster|w_b/.test(J(o2.mate))
        && J(o3.answer) === deny('q3', 'field') && o3.same && J(o4.answer) === deny('q4', 'missing') && o4.same && o4.owner.length === 0
        && o5.answer[0].type === 'char-ack' && mid5 === J({ name: 'Tide', stats: { Dmg: 5, Acc: 8 }, held: ['Dmg'], damage: '9d6', rm: 'bound', rmMsg: 'Bound here', eq: 'curse', eqMsg: 'Clings' })
        && o6.answer[0].type === 'char-ack' && J(row('w_g').ov) === J({ name: 'Tide', stats: { Dmg: 5 }, held: ['Dmg'], damage: '9d6', rm: 'bound', rmMsg: 'Bound here', eq: 'curse', eqMsg: 'Clings' }) && J(ownRow(o6.owner, 'w_g').ov) === J({ name: 'Tide', stats: { Dmg: 5 }, held: ['Dmg'] })
        && J(o7.answer) === deny('q7', 'field') && o7.same,
        J([o1, o2, o3, o4, o6, o7, row('w_g')]));
    const junk = [{ ov: { stats: JSON.parse('{"toString":1}') } }, { ov: {} }, {}, { ov: { held: ['Acc'] } }, { ov: { foo: 1 } }, { ov: 'x' }, { ov: { stats: {} } }].map((q, i) => SEND('j' + i, Object.assign({ rowId: 'w_b' }, q))), strV = SEND('j7', { rowId: 'w_b', ov: { stats: { Acc: '3' } } });
    check('F4c2 on the wire (critic 5): a malformed ov is dropped unanswered, with nothing stored, sent or saved — a stat key that is not one (toString), an empty patch, no ov at all, held alone, unknown keys, not an object, empty stats; a string for a number stat (F5a2: a choice\'s label travels) is refused by the host with value, nothing stored',
        junk.every(r => r.answer.length === 0 && r.owner.length === 0 && r.saves === 0 && r.same) && J(strV.answer) === J([{ type: 'char-deny', rid: 'j7', reason: 'value' }]) && strV.same && strV.saves === 0, J(junk.map(r => [r.answer, r.same]).concat([[strV.answer, strV.same]])));
    check('F4c2 on the wire: nothing a player receives in any of these holds a copy\'s formula, lock or lock message (9d6, bound, Clings, rm, eq); the client sends a copy\'s own values beside the keys each op uses (null travels)',
        all.length > 0 && !/9d6|bound|Bound here|Clings|curse|"rm"|"eq"|rmMsg|eqMsg/.test(J(all)) && /if \(q\.ov !== undefined\) mI\.ov = q\.ov;/.test(src) && /if \(q\.facts !== undefined\) mI\.facts = q\.facts;/.test(src), J(all).slice(0, 400));
    const stats10 = Array.from({ length: Sx.LIMITS.listStats }, (_, i) => ({ key: 'S' + i, label: 'Stat number ' + i, show: i < 3 })), ovStats = {}; stats10.forEach((s, i) => { ovStats[s.key] = -99999999.25 + i; });
    const big = Sx.cleanSystem({ v: 1, name: 'B', rolls: [], listRules: { ownerStats: true }, fields: [{ id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, price: 'S0', stats: stats10 } }], items: [{ id: 'i_pub', name: 'A public item with a long name', notes: 'n'.repeat(200) }] }, { F: Fx, gmView: true });
    const rowsB = []; for (let i = 0; i < 150; i++) rowsB.push({ id: 'w_p' + i, defId: 'i_pub', qty: 99, paid: 99999999.25, note: 'x'.repeat(200), ov: { name: 'N'.repeat(60), icon: 'icon:bolt', category: 'C'.repeat(40), notes: 'o'.repeat(200), stats: ovStats, held: stats10.map(s => s.key), area: { ft: 3000, shape: 'circle', name: 'A'.repeat(60) }, damage: '9d6', cost: '9', rm: 'curse', rmMsg: 'r'.repeat(200), eq: 'bound', eqMsg: 'e'.repeat(200) } });
    const viewB = Sx.cleanSystem(big, { F: Fx, gmView: false }), libB = {}; big.items.forEach(i => { libB[i.id] = i; });
    const stored = Sx.cleanValue(big.fields[0], rowsB, Sx.valueOpts(big)), projB = Sx.charFor({ id: 'c_b', name: 'B', ownerId: 'u_b', npc: false, values: { f_wp: stored } }, viewB, 'u_b', { items: libB }), msgB = { type: 'char', campId: 'k', char: projB };
    let packedB = true; try { packCheck(msgB); } catch (e) { packedB = e.message; }
    const sizeB = J(msgB).length, p0 = projB.values.f_wp[0];
    check('F4c2 on the wire: 150 rows each with every value of its own at its largest (every stat a list may carry, all held, a blast, 200-character notes) project, pack and stay within 3,200,000 bytes (' + sizeB + ' bytes; 200,000 while a list carried twelve stats, 250,000 while it carried thirty-two, 350,000 while it carried forty-eight: the core handbook session\'s ask beside ask 19, moved on purpose), with no formula or lock in them',
        packedB === true && sizeB < 3200000 && projB.values.f_wp.length === 150 && Object.keys(p0.ov.stats).length === Sx.LIMITS.listStats && p0.ov.held.length === Sx.LIMITS.listStats && Sx.LIMITS.listStats >= 24 && !/9d6|curse|bound|rrrr|eeee/.test(J(msgB)), String(packedB) + ' ' + sizeB);
})());

// Stage 6 F6 (owner, 2026-09-27): a kept curse keeps working, nameless — the real char-item handler drops a cursed item (it stays on the
// character, hidden), the real delta carries the owner's nameless changes with the list, and the real client handler takes them onto the
// owner's own copy only (cleaned again); nothing of it names the item
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), J = JSON.stringify;
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); return src.slice(i, k); })();
    const sysU = Sx.cleanSystem({ v: 1, name: 'U', rolls: [], fields: [{ id: 'f_dx', key: 'DX', kind: 'number', def: 10, vis: 'all' }, { id: 'f_gm', key: 'Luck', kind: 'number', vis: 'gm' }, { id: 'f_rg', key: 'Rings', label: 'Rings', kind: 'item-list', edit: 'owner', vis: 'all' }],
        items: [{ id: 'i_cur', name: 'Cursed ring', category: 'Ring', rm: 'curse', rmMsg: 'A chill lingers', mods: [{ f: 'f_dx', op: 'add', v: -2 }, { f: 'f_gm', op: 'add', v: -5 }] }] }, { F: Fx, gmView: true });
    const campU = { id: 'k', system: sysU, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_rg: [{ id: 'w_r', defId: 'i_cur', qty: 1 }] } } } };
    const outU = { owner: [], mate: [] };
    const netU = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: m => { packCheck(m); outU.owner.push(JSON.parse(J(m))); } }, { peer: 'pM', open: true, send: m => { packCheck(m); outU.mate.push(JSON.parse(J(m))); } }], roster: { pA: { id: 'u_a' }, pM: { id: 'u_m' } } };
    const winU = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
    const HU = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
        'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { handle: function(msg, conn) {\n' + ciSrc + '\n} };')(
        netU, () => Sx, winU, () => false, () => campU, () => {}, e => { throw e; }, c => (netU.roster[c.peer] ? netU.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
    const ans = []; HU.handle({ type: 'char-item', rid: 'd1', charId: 'c_1', fieldId: 'f_rg', op: 'setQty', rowId: 'w_r', qty: 0 }, { peer: 'pA', send: m => { packCheck(m); ans.push(JSON.parse(J(m))); } });
    const kept = campU.chars.c_1.values.f_rg[0], delta = outU.owner.find(m => m.type === 'charDelta');
    check('F6 a cursed item dropped (host, the real handlers): it stays on the character hidden; the owner\'s delta carries their list without it and the curse\'s changes as nameless amounts on the fields they can see (DX −2; a GM-only field\'s never); nothing sent names or points at the item',
        ans[0].type === 'char-ack' && kept.hid === 1 && kept.defId === 'i_cur' && !!delta && J(delta.values.f_rg) === '[]' && J(delta.unseen) === J([{ f: 'f_dx', op: 'add', v: -2 }])
        && !/Cursed|i_cur|f_gm|w_r|Luck/.test(J(outU.owner.concat(outU.mate))) && outU.mate.every(m => !('unseen' in m)), J([ans, delta, outU.mate]));
    const inSrc = between('// [netcheck:charin-start]', '// [netcheck:charin-end]', 'charin');
    const view = Sx.cleanSystem(sysU, { F: Fx, gmView: false });
    const runIn = (chars, msg, peer) => { const st = { appState: { activeCampaignId: 'k', campaigns: { k: { id: 'k', system: view, chars } } } };
        new Function('net', 'conn', 'msg', 'state', 'campOf', 'window', '_charPending', '_charHost', 'charPendingDone', 'reapplyPending', 'noteHostCopy', inSrc)({ foreign: true, syncedPeer: 'h', stream: false, myId: 'u_a' }, { peer }, msg, st, id => st.appState.campaigns[id] || null, { wpSystemCore: Sx, wpSheets: { charChanged() {}, charGone() {} } }, {}, {}, () => {}, () => {}, () => {});
        return st.appState.campaigns.k.chars; };
    const mine = () => ({ c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_rg: [] }, partial: false }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {}, partial: true } });
    const D = (id, unseen) => ({ type: 'charDelta', campId: 'k', id, values: { f_dx: 10 }, unseen });
    const c1 = runIn(mine(), D('c_1', [{ f: 'f_dx', op: 'add', v: -2 }, { f: 'f_gm', op: 'add', v: 9 }, { f: 'f_dx', op: 'add', v: 'x' }, { f: 'f_dx', op: 'add', v: 1, name: 'Leak' }]), 'h');
    const c2 = runIn(mine(), D('c_2', [{ f: 'f_dx', op: 'add', v: -2 }]), 'h'), c3 = (() => { const m0 = mine(); m0.c_1.unseen = [{ f: 'f_dx', op: 'add', v: -2 }]; return runIn(m0, D('c_1', []), 'h'); })(), c4 = runIn(mine(), D('c_1', [{ f: 'f_dx', op: 'add', v: -2 }]), 'x');
    check('F6 a player takes nameless changes onto their own copy only, cleaned again (fields of their view, amounts only, nothing else kept); an empty list clears them; a teammate\'s copy and anyone but the synced host change nothing',
        J(c1.c_1.unseen) === J([{ f: 'f_dx', op: 'add', v: -2 }, { f: 'f_dx', op: 'add', v: 1 }]) && !('unseen' in c2.c_2) && !('unseen' in c3.c_1) && !('unseen' in c4.c_1)
        && /withHoverLines\(window\.wpSystemCore\.charFor\(camp\.chars\[id\], camp\.system, recipientId, \{ lib: libFx, items: libIt, full: fullSys \}\)/.test(require('./checkkit').part('netfog.js')) && (src.match(/full: camp[AQ]?\.system \}/g) || []).length >= 5, J([c1.c_1, c2.c_2, c3.c_1]));
    {   // 1.6.3 (the improvement week's review of sheets and rolls, finding 23): a player's own press was drawn three times (laid at once, then the
        // host's answer, then its delta). The charin branch, run for real: a delta that only says what the player's copy already holds draws
        // nothing again (no charChanged) and still gives a row of theirs it used up its Undo (goneFire); a delta that moves a value draws as before
        const seen = [], winD = { wpSystemCore: Sx, wpSheets: { charChanged: id => seen.push('changed:' + id), charGone() {}, goneFire: id => seen.push('gone:' + id) } };
        const runD = (chars, msg) => { const st = { appState: { activeCampaignId: 'k', campaigns: { k: { id: 'k', system: view, chars } } } };
            new Function('net', 'conn', 'msg', 'state', 'campOf', 'window', '_charPending', '_charHost', 'charPendingDone', 'reapplyPending', 'noteHostCopy', inSrc)({ foreign: true, syncedPeer: 'h', stream: false, myId: 'u_a' }, { peer: 'h' }, msg, st, id => st.appState.campaigns[id] || null, winD, {}, {}, () => {}, () => {}, () => {});
            return st.appState.campaigns.k.chars; };
        const held = () => ({ c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_dx: 10, f_rg: [] }, partial: false } });
        seen.length = 0; runD(held(), { type: 'charDelta', campId: 'k', id: 'c_1', values: { f_dx: 10 } }); const same = seen.slice();
        seen.length = 0; const moved = runD(held(), { type: 'charDelta', campId: 'k', id: 'c_1', values: { f_dx: 12 } }); const diff = seen.slice();
        check('1.6.3 (finding 23) a delta that only says what the player\'s copy already holds draws nothing again (the charin branch, run for real): no charChanged, and goneFire still runs for a row it used up; a delta that moves a value draws as before',
            J(same) === J(['gone:c_1']) && J(diff) === J(['changed:c_1']) && moved.c_1.values.f_dx === 12, J([same, diff]));
    }
})());
// Stage 6 U2: a player's sheet upload (the [netcheck:charupload] slice, run for real with the real systemcore): their own character only, one
// every 10 s, oversize dropped; the proposal waits for the GM in camp.uploads (never in a snapshot); under setting B their own row facts apply
// at once and are synced to them. And the player's machine (net.charUpload, sliced) sends the file without its portrait, only for their own
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const upSrc = between('// [netcheck:charupload-start]', '// [netcheck:charupload-end]', 'charupload');
    const lst = { id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', vis: 'all', edit: 'owner', list: { cats: ['Skill'], noQty: true, custom: true, multi: true, lvl: { label: 'Level', min: -10, max: 40, def: 10 }, stats: [{ key: 'attr', labels: ['ST', 'DX', 'IQ'] }, { key: 'diff' }] } };
    const sysU = (rules, gmList) => Sx.cleanSystem(Object.assign({ v: 1, name: 'U', rolls: [], fields: [{ id: 'f_st', key: 'ST', label: 'ST', kind: 'number', vis: 'all', def: 10 }, gmList ? Object.assign({}, lst, { edit: 'gm' }) : lst], items: [{ id: 'i_climb', name: 'Climbing', key: 'Climbing', category: 'Skill', stats: { attr: 1, diff: 1 } }] }, rules ? { listRules: rules } : {}), { F: Fx, gmView: true });
    const find = s => nm => s.items.filter(e => e.name.toLowerCase() === String(nm).trim().toLowerCase());
    // an outside sheet reader of the suite's own (none ships with the app; systemcore registerReader): it claims a file with a name and no format, and
    // proposes a value (ST) and a row's level as a reader does; its row op is applyRowOp. Registered for one run of the branch at a time
    const stubR = { id: 'test', name: 'Test sheets', claims: js => !!js && typeof js === 'object' && typeof js.name === 'string' && js.format === undefined, fill: () => ({ values: {}, lists: [], ops: [], fxLists: [], fx: [], skipped: [] }),
        propose: (sys, ch, js) => { const out = { changes: [] }, st = js.attributes && js.attributes.strength ? js.attributes.strength.value : undefined, sk = (js.skills || [])[0], row = (ch.values.f_sk || [])[0];
            if (typeof st === 'number' && st !== ch.values.f_st) out.changes.push({ id: 'u_1', kind: 'value', f: 'f_st', label: 'ST', from: String(ch.values.f_st), to: String(st), value: st, accept: true });
            if (sk && row && row.hid !== 1 && Number(sk.level) !== row.lvl) out.changes.push({ id: 'u_2', kind: 'fact', f: 'f_sk', row: row.id, label: 'Skills: ' + sk.name, from: String(row.lvl), to: String(sk.level), facts: { lvl: Number(sk.level) }, accept: true });
            return out; },
        rowOp: (sys, ch, fid, q, F, opts) => Sx.applyRowOp(sys, ch, fid, q, F, opts) };
    const dossier = (st, lvl) => ({ name: 'Ana', attributes: { strength: { value: st } }, skills: [{ name: 'Climbing', level: String(lvl), relativeLevel: 'DX/Average' }] });
    const host = (o) => {
        o = o || {}; const sys = sysU(o.rules, o.gmList), ch = { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: !!o.npc, values: { f_st: 12, f_sk: [Object.assign({ id: 'w_c', defId: 'i_climb', qty: 1, lvl: 12 }, o.hid ? { hid: 1 } : {})] } };
        const camp = { id: 'k', system: sys, chars: { c_1: ch, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
        if (o.queue) camp.uploads = o.queue;
        const out = { answer: [], deltas: [], toasts: [], logs: [], told: [], saves: 0, camp }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: o.from || 'pA', send: box(out.answer) };
        const net = { active: true, role: 'host', paused: !!o.paused, conns: [], roster: { pA: { id: 'u_a', name: 'Pat' }, pB: { id: 'u_b', name: 'Bea' } }, syncCharDelta: (id, d) => out.deltas.push([id, JSON.parse(JSON.stringify(d))]) };
        const win = { wpFormula: Fx, wpVtt: { on: k => !(o.off && k === 'sheets') }, wpSheets: { gmFinder: (cp, s) => find(s), charChanged() {}, uploadsChanged: id => out.told.push(id), playerSystem: cp => Sx.cleanSystem(cp.system, { F: Fx, gmView: false }) } };
        const msg = Object.assign({ type: 'char-upload', rid: 'e1', charId: 'c_1', sheet: dossier(13, 14) }, o.msg || {});
        const at = o.at || {};
        if (!o.noReader) Sx.registerReader(stubR);
        try {
            new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'toast', 'logEvent', '_uploadAt', 'UPLOAD_GAP_MS', 'sheetsOnFor', 'allow', upSrc)(
                msg, conn, net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, t => out.toasts.push(t), (k, t) => out.logs.push([k, t]), at, 10000, () => true, () => true);
        } finally { Sx.dropReader('test'); }
        out.at = at; out.ch = ch; return out;
    };
    const kinds = r => (r.camp.uploads || []).map(u => [u.charId, u.from, u.name, u.changes.map(c => c.kind + ':' + c.label).join('|')]);
    const own = host(), mate = host({ from: 'pB' }), slow = host({ at: { pA: Date.now() - 2000 } }), later = host({ at: { pA: Date.now() - 11000 } }), npc = host({ npc: true });
    const big = host({ msg: { sheet: { name: 'Ana', notes: 'a'.repeat(10485761) } } }), badRid = host({ msg: { rid: 'e 1' } }), paused = host({ paused: true }), off = host({ off: true }), gone = host({ msg: { charId: 'c_9' } });
    const same = host({ msg: { sheet: { name: 'Ana', attributes: { strength: { value: 12 } }, skills: [{ name: 'Climbing', level: '12', relativeLevel: 'DX/Average' }] } } });
    const nobody = host({ noReader: true }), unclaimed = host({ msg: { sheet: { format: 'elsewhere', name: 'Ana' } } });
    const untouched = r => r.ch.values.f_st === 12 && r.ch.values.f_sk[0].lvl === 12 && r.deltas.length === 0;
    const denied = (r, why) => j(r.answer) === j([{ reason: why, type: 'char-upload-ans', rid: 'e1' }]) && !r.camp.uploads && r.saves === 0 && r.toasts.length === 0 && untouched(r);
    check('U2 on the wire (host): the owner\'s file becomes a proposal kept for the GM (camp.uploads: who, which character, its changes, the reader that read it; a toast, a log line, the sheet told) and answered with its count; the character itself unchanged until the GM applies it',
        j(own.answer) === j([{ n: 2, auto: 0, type: 'char-upload-ans', rid: 'e1' }]) && j(kinds(own)) === j([['c_1', 'u_a', 'Pat', 'value:ST|fact:Skills: Climbing']]) && /^up_[a-z0-9]+$/.test(own.camp.uploads[0].id) && own.camp.uploads[0].reader === 'test'
        && own.toasts.length === 1 && /Pat sent a sheet update for Ana: 2 changes to review/.test(own.toasts[0]) && j(own.logs) === j([['char', own.toasts[0]]]) && j(own.told) === j(['c_1']) && own.saves === 1 && untouched(own), j([own.answer, kinds(own), own.toasts]));
    check('U2 on the wire (host): refused and answered why — a teammate\'s upload of another\'s character (owner), an NPC (owner), a second upload within 10 s (slow; after it, read), a paused table, sheets off, a character gone, a file no reader here takes (unread: none registered, or none that claims it); nothing kept, saved or said',
        denied(mate, 'owner') && denied(npc, 'owner') && denied(slow, 'slow') && denied(paused, 'paused') && denied(off, 'off') && denied(gone, 'missing') && denied(nobody, 'unread') && denied(unclaimed, 'unread') && later.answer[0].n === 2 && mate.at.pB === undefined && own.at.pA > 0,
        j([mate.answer, npc.answer, slow.answer, paused.answer, off.answer, gone.answer]));
    const wpcU = host({ msg: { sheet: { format: 'waypoint-character', v: 1, name: 'Ana', values: {} } } });
    check('F2a on the wire (host), moved on purpose in 1.6.0: a character file sent for a character in play is never read as an outside sheet file and is judged as a new sheet is, for the GM\'s review; a reason of ours is all a refusal shows, and an older host\'s word is still said',
        wpcU.answer.length === 1 && wpcU.answer[0].reason !== 'file' && wpcU.answer[0].type === 'char-upload-ans' && /\{ error: Object\.prototype\.hasOwnProperty\.call\(UP_WHY, msg\.reason\) \? UP_WHY\[msg\.reason\] : 'The GM could not read it\.' \}/.test(src.replace(/\r\n/g, '\n')) && /file: 'A character file only fills a character you are still making\.'/.test(src), j(wpcU.answer));
    const sameB = host({ rules: { uploadFacts: true }, msg: { sheet: { name: 'Ana', attributes: { strength: { value: 12 } }, skills: [{ name: 'Climbing', level: '12', relativeLevel: 'DX/Average' }] } } });
    check('U2 on the wire (host): an oversize file or a malformed request is dropped unanswered; a file matching the sheet answers 0, keeps nothing and (cluster J #8, 2026-10-01) saves nothing — under setting B too, where nothing applied and nothing waits',
        big.answer.length === 0 && !big.camp.uploads && badRid.answer.length === 0 && j(same.answer) === j([{ n: 0, auto: 0, type: 'char-upload-ans', rid: 'e1' }]) && !same.camp.uploads && same.toasts.length === 0 && same.saves === 0 && j(sameB.answer) === j([{ n: 0, auto: 0, type: 'char-upload-ans', rid: 'e1' }]) && sameB.saves === 0 && sameB.deltas.length === 0, j([same.saves, sameB.answer, sameB.saves]));
    const b = host({ rules: { uploadFacts: true } }), bOnly = host({ rules: { uploadFacts: true }, msg: { sheet: dossier(12, 15) } }), bGm = host({ rules: { uploadFacts: true }, gmList: true }), bHid = host({ rules: { uploadFacts: true }, hid: true });
    const old = [{ id: 'up_old', charId: 'c_1', from: 'u_a', name: 'Pat', at: 1, changes: [] }, { id: 'up_bo', charId: 'c_2', from: 'u_b', name: 'Bea', at: 1, changes: [] }], rep = host({ queue: old });
    check('U2 setting B (host): the owner\'s own row facts apply at once (a skill\'s level), synced to them as a delta, and answered as applied; the rest (a value) still waits; with only facts, nothing waits and the GM is not asked',
        j(b.answer) === j([{ n: 1, auto: 1, type: 'char-upload-ans', rid: 'e1' }]) && b.ch.values.f_sk[0].lvl === 14 && b.ch.values.f_st === 12 && j(b.deltas.map(d => [d[0], Object.keys(d[1])])) === j([['c_1', ['f_sk']]]) && j(kinds(b)) === j([['c_1', 'u_a', 'Pat', 'value:ST']])
        && j(bOnly.answer) === j([{ n: 0, auto: 1, type: 'char-upload-ans', rid: 'e1' }]) && bOnly.ch.values.f_sk[0].lvl === 15 && !bOnly.camp.uploads && bOnly.toasts.length === 0 && bOnly.saves === 1 && own.ch.values.f_sk[0].lvl === 12,
        j([b.answer, b.ch.values, kinds(b), bOnly.answer]));
    check('U2 setting B applies only what the owner could do by hand: on a list only the GM changes the fact waits for the GM with the rest; a row the GM keeps from them is never touched by their file',
        j(bGm.answer) === j([{ n: 2, auto: 0, type: 'char-upload-ans', rid: 'e1' }]) && bGm.ch.values.f_sk[0].lvl === 12 && bGm.deltas.length === 0 && j(kinds(bGm)) === j([['c_1', 'u_a', 'Pat', 'value:ST|fact:Skills: Climbing']])
        && bHid.ch.values.f_sk[0].lvl === 12 && bHid.deltas.length === 0 && !/fact:/.test(j(kinds(bHid))), j([bGm.answer, kinds(bGm), bHid.answer, kinds(bHid)]));
    check('U2 a newer upload of a character replaces its older one in the queue (another character\'s stays); the players\' snapshot drops the queue beside the library',
        j(rep.camp.uploads.map(u => u.id === 'up_old' ? 'old' : u.charId)) === j(['c_2', 'c_1']) && /        delete camp\.library;[^\n]*\n        delete camp\.uploads;/.test(require('./checkkit').part('netfog.js')), j(rep.camp.uploads.map(u => u.id)));
    const cs = src.replace(/\r\n/g, '\n'), cA = cs.indexOf('var _uploadPending = {}, _sheetFilesOk = false;'), cB = cs.indexOf('// U2: the host tells a character\'s owner'), dB = cs.indexOf('// A player throws an item from their sheet');
    const client = (charId, sheet, o) => {
        o = o || {}; const sent = [], answered = [], camp = { id: 'k', chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: {} }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} }, c_p: { id: 'c_p', name: 'P', ownerId: 'u_a', partial: true } } };
        const net = { active: true, role: o.role || 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } }] };
        new Function('net', 'SC', 'getActiveCampaign', 'window', 'setTimeout', 'clearTimeout', cs.slice(cA, cB))(net, () => Sx, () => camp, { wpVtt: { on: () => !o.off } }, () => 0, () => {});
        return { r: net.charUpload(charId, sheet, a => answered.push(a)), sent };
    };
    const cOk = client('c_1', { name: 'Ana', portrait: 'data:image/png;base64,AAAA', skills: [] }), cMate = client('c_2', { name: 'Bo' }), cPart = client('c_p', { name: 'P' }), cBig = client('c_1', { name: 'A', notes: 'a'.repeat(10485761) }), cGm = client('c_1', {}, { role: 'host' }), cOff = client('c_1', {}, { off: true });
    const told = []; const hostNet = { active: true, role: 'host', roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } }, conns: [{ peer: 'pA', open: true, send: m => told.push(['pA', m]) }, { peer: 'pB', open: true, send: m => told.push(['pB', m]) }, { peer: 'pC', open: false, send: m => told.push(['pC', m]) }] };
    new Function('net', 'getActiveCampaign', 'sendFailed', cs.slice(cB, dB))(hostNet, () => ({ chars: { c_1: { id: 'c_1', ownerId: 'u_a' } } }), () => {});
    hostNet.uploadDone('c_1', 3, 5); hostNet.uploadDone('c_9', 1, 1);
    check('U2 on the wire (player): their own whole character\'s file is sent as { type, rid, charId, sheet } without its portrait; another\'s, a hover-only copy, an oversize file, the GM\'s own machine or sheets off send nothing and say why; the GM\'s verdict reaches the owner\'s machines only',
        cA > 0 && cB > cA && dB > cB && cOk.r.ok === true && cOk.sent.length === 1 && j(Object.keys(cOk.sent[0]).sort()) === j(['charId', 'rid', 'sheet', 'type']) && j(cOk.sent[0].sheet) === j({ name: 'Ana', skills: [] }) && cOk.sent[0].type === 'char-upload'
        && [cMate, cPart].every(c => c.r.error === 'That character is not yours.' && c.sent.length === 0) && cBig.r.error === 'That file is too large, or not a sheet.' && cBig.sent.length === 0 && cGm.r.error === 'Not at a table.' && cOff.r.error === 'Character sheets are off here.' && cOff.sent.length === 0
        && j(told) === j([['pA', { type: 'char-upload-done', charId: 'c_1', done: 3, of: 5 }]]), j([cOk, cMate.r, cPart.r, cBig.r, cGm.r, told]));
    // 2026-10-18: whether this table reads a sheet file made elsewhere (an outside reader registered on the host, none shipped with the app)
    const sfOk = (role, active, word, reader) => { const netS = { active, role, conns: [] }; if (reader) Sx.registerReader(stubR); try { return new Function('net', 'SC', 'getActiveCampaign', 'window', 'setTimeout', 'clearTimeout', cs.slice(cA, cB) + '\n_sheetFilesOk = ' + JSON.stringify(word) + ';\nreturn net.sheetFilesOk();')(netS, () => Sx, () => null, {}, () => 0, () => {}); } finally { Sx.dropReader('test'); } };
    const sfWays = [sfOk('host', true, false, false), sfOk('host', true, false, true), sfOk(null, false, true, true), sfOk('client', true, true, false), sfOk('client', true, false, true), sfOk('client', true, 'true', false), sfOk('client', false, true, false)];
    check('sheet files on the wire (net.sheetFilesOk run for real): the GM\'s machine reads a sheet file made elsewhere only while an outside reader is registered; a player\'s app takes the host\'s word from its snapshot, true only, and only while it is at the table; the host says it in the snapshot only while a reader is registered, beside looks, and a player\'s app keeps the word as true only',
        j(sfWays) === j([false, true, true, true, false, false, false]) && /notepad: notepadMsg\(\) \}; if \(sheetFilesHere\(\)\) snap\.sheetFiles = true; var soSnap = [^\n]*?snap\.sheetOut = soSnap; gmSignSnap\(snap, conn\); \};/.test(cs) && /\n    sheetFilesOkSet\(msg\.sheetFiles === true\);/.test(require('./checkkit').part('netfog.js')) && /\nfunction sheetFilesOkSet\(v\) \{ _sheetFilesOk = v; \}/.test(cs)
        && /function sheetFilesHere\(\) \{ var S = SC\(\), cR = getActiveCampaign\(\); return !!\(S && typeof S\.readers === 'function' && S\.readers\(cR && cR\.system\)\.length > 0\); \}/.test(cs), j(sfWays));
})());
// A player's own edit of a row's changes (F11b R3: the host's char-item handler, sliced, with the real delta): the changes the host set on fields
// they cannot see stay after their own
pendingChecks.push((async () => {
    const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
    const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
    const dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
    const lvl = { label: 'Level', min: 0, max: 20, def: 0 }, num = ks => ks.map(k => ({ key: k }));
    const L = (id, key, cat, list) => ({ id, key, label: key, kind: 'item-list', vis: 'all', edit: 'owner', list: Object.assign({ cats: [cat], lvl }, list) });
    const dgA = v => ({ f: 'f_dg', op: 'add', v }), dxA = v => ({ f: 'f_dx', op: 'add', v });
    // R3: a player's own edit of a row's changes (the real char-item handler, sliced, with the real delta): the changes the host set on fields they cannot see stay
    const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem');
    const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); return i < 0 || k < 0 ? '' : src.slice(i, k); })();
    const editRun = dx => {
        const sys = Sx.cleanSystem({ v: 1, name: 'E', rolls: [], fields: [{ id: 'f_dg', key: 'Dodge', label: 'Dodge', kind: 'number', vis: 'all', edit: 'gm', def: 8 }, { id: 'f_dx', key: 'DX', label: 'DX', kind: 'number', vis: dx, edit: 'gm', def: 10 },
            L('f_ft', 'Feats', 'Trait', { noQty: true, custom: true, on: { label: 'Active' } })], items: [] }, { F: Fx, gmView: true });
        const own = (id, name, mods) => ({ id, qty: 1, lvl: 0, on: false, own: 1, def: { name, category: 'Trait', icon: '', notes: '', vis: 'all', mods, modsOn: true } });
        const camp = { id: 'k', system: sys, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_ft: [own('w_t', 'Calm', [dgA(1), dxA(2)]), own('w_u', 'Plain', [dgA(1)])] } }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: {} } } };
        const out = { answer: [], owner: [], mate: [], all: [] }, box = b => m => { packCheck(m); const c = JSON.parse(j(m)); b.push(c); out.all.push(c); };
        const net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }], roster: { pA: { id: 'u_a' }, pB: { id: 'u_b' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
        const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn function(msg, conn) {\n' + ciSrc + '\n};')(
            net, () => Sx, win, () => false, () => camp, () => {}, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
        const row = id => { const r = camp.chars.c_1.values.f_ft.find(x => x.id === id) || { def: {} }; return [r.def.mods || null, r.def.modsOn === true]; };
        const send = (rid, rowId, mods) => { out.answer.length = 0; out.owner.length = 0; H({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_ft', op: 'custom', rowId, def: { mods } }, { peer: 'pA', send: box(out.answer) });
            const ow = (((out.owner[out.owner.length - 1] || {}).values || {}).f_ft || []).find(x => x.id === rowId) || { def: {} }; return { answer: out.answer.slice(), host: row(rowId), mine: [ow.def.mods || null, ow.def.modsOn === true] }; };
        const e1 = send('r1', 'w_t', [dgA(2)]), e2 = send('r2', 'w_t', null), e3 = send('r3', 'w_t', [dgA(3)]), e4 = send('r4', 'w_t', []);
        const e5 = send('r5', 'w_t', Array.from({ length: Sx.LIMITS.effectMods }, (_, i) => dgA(i + 1))), e6 = send('r6', 'w_u', null);
        return { e1, e2, e3, e4, e5, e6, all: out.all, ok: ciSrc.length > 0 && ntSrc.length > 0 };
    };
    const EG = editRun('gm'), EV = editRun('all'), ack = rid => j([{ type: 'char-ack', rid }]);
    check('a player\'s own edit of a row\'s changes (F11b, the host\'s char-item handler, run for real): the changes the host set on a field they cannot see stay, after their own, after an edit and after clearing with nothing or an empty list, with the row\'s switch; a player who fills the row with their own keeps all of theirs (their copy never shows fewer than they sent); a row with nothing hidden is cleared of its changes and its switch as before; a field they may see is theirs to change',
        EG.ok && j(EG.e1.host) === j([[dgA(2), dxA(2)], true]) && j(EG.e2.host) === j([[dxA(2)], true]) && j(EG.e3.host) === j([[dgA(3), dxA(2)], true]) && j(EG.e4.host) === j([[dxA(2)], true])
        && j(EG.e5.host[0]) === j(Array.from({ length: Sx.LIMITS.effectMods }, (_, i) => dgA(i + 1))) && EG.e5.host[1] === true && j(EG.e5.mine[0]) === j(EG.e5.host[0]) && j(EG.e6.host) === j([null, false])
        && j(EV.e1.host) === j([[dgA(2)], true]) && j(EV.e2.host) === j([null, false]),
        j([EG.e1.host, EG.e2.host, EG.e3.host, EG.e4.host, EG.e5.host, EG.e6.host, EV.e1.host, EV.e2.host]));
    check('a player\'s own edit of a row\'s changes (F11b): the answer is the plain acknowledgment, the same whether a hidden change was kept or not, and their copy shows their own changes alone — with the switch while they have one, without either once they cleared theirs; nothing sent to anyone names the hidden field',
        ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].every((k, i) => j(EG[k].answer) === ack('r' + (i + 1)) && j(EV[k].answer) === j(EG[k].answer))
        && j(EG.e1.mine) === j([[dgA(2)], true]) && j(EG.e2.mine) === j([null, false]) && j(EG.e3.mine) === j([[dgA(3)], true]) && j(EG.e4.mine) === j([null, false]) && j(EG.e6.mine) === j([null, false])
        && EG.all.length > 0 && !/f_dx/.test(j(EG.all)),
        j([EG.e1, EG.e2, EG.e3, EG.e4, EG.e6.mine]));
})());
pendingChecks.push((async () => {
    /* ---- 126: point budgets, the host's watch on a player's own change (the owner: "A budget you define"; a breach and its watch "per system dictation") ---- */
    {
        const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
        const edSrc = between('// [netcheck:charedit-start]', '// [netcheck:charedit-end]', 'charedit'), msSrc = between('// [netcheck:charedits-start]', '// [netcheck:charedits-end]', 'charedits'), ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem');
        const dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta'), bnSrc = between('// [netcheck:budgetnote-start]', '// [netcheck:budgetnote-end]', 'budgetnote');
        const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();   // the item notice, the budget notice and what both keep
        const mk = (rule, vals, charMore, fieldsMore) => {
            const sys = Sx.cleanSystem({ v: 1, name: 'B', rolls: [], items: [{ id: 'i_x', name: 'X' }, { id: 'i_y', name: 'Y' }, { id: 'i_z', name: 'Z' }], fields: [{ id: 'f_st', key: 'ST', kind: 'number', def: 10 }, { id: 'f_dx', key: 'DX', kind: 'number', def: 10 },
                { id: 'f_cp', key: 'CP', kind: 'number', def: 100, edit: 'gm' }, { id: 'f_kit', key: 'Kit', kind: 'item-list' }].concat(fieldsMore || []), budgets: rule ? [Object.assign({ id: 'b_cp', name: 'Character points', has: 'CP', spent: '(ST - 10) * 10 + (DX - 10) * 10 + Kit.count * 5' }, rule)] : undefined }, { F: Fx, gmView: true });
            const camp = { id: 'k', system: sys, chars: { c_1: Object.assign({ id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: vals || { f_st: 19 } }, charMore) } };
            const out = { answer: [], owner: [], notes: [], logs: [], saves: 0, clock: 1000000 }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
            const conn = { peer: 'pA', send: box(out.answer) }, net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
            const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null };
            const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent', 'Date',
                'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn { edit: function(msg, conn) {\n' + edSrc + '\n}, edits: function(msg, conn) {\n' + msSrc + '\n}, item: function(msg, conn) {\n' + ciSrc + '\n} };')(
                net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), (k, t) => out.logs.push([k, t]), { now: () => out.clock });
            const run = (kind, msg) => { out.answer.length = 0; out.owner.length = 0; out.notes.length = 0; out.logs.length = 0; const s0 = out.saves; H[kind](msg, conn);
                return { answer: out.answer.slice(), sent: out.owner.length, notes: out.notes.slice(), logs: out.logs.slice(), saved: out.saves - s0, vals: JSON.parse(JSON.stringify(camp.chars.c_1.values)) }; };
            return { run, out, camp };
        };
        const E = (fid, v) => ({ type: 'char-edit', rid: 'e1', charId: 'c_1', fieldId: fid, value: v }), M = (...vals) => ({ type: 'char-edits', rid: 'm1', charId: 'c_1', values: vals.map(p => ({ fieldId: p[0], value: p[1] })) });
        const ADD = k => ({ type: 'char-item', rid: 'i1', charId: 'c_1', fieldId: 'f_kit', op: 'add', defId: 'i_' + k, rowId: 'w_' + k + '1', qty: 1 });
        const ACK = rid => j([{ type: 'char-ack', rid }]), SAYS = (spent, by) => 'Character points: ' + spent + ' of 100 spent. That is ' + by + ' over.', NO = (rid, spent, by) => j([{ type: 'char-deny', rid, reason: 'budget', msg: SAYS(spent, by) }]), WARN = (rid, spent, by) => j([{ type: 'char-ack', rid, msg: SAYS(spent, by) }]);
        {   // 1.6.2: a toggle worked out until set (the ask of the session that builds a game system), on the host: the real edit and batch branches fill it, a player's own setting stands, and a null gives the worked-out one back
            const T = mk(null, { f_st: 10 }, null, [{ id: 'f_sz', key: 'Size', kind: 'number', def: 2, fills: [{ f: 'f_big', formula: 'Size >= 3' }] }, { id: 'f_big', key: 'Big', kind: 'toggle', auto: 'Size >= 3' }]);
            const afOf = () => JSON.parse(JSON.stringify(T.camp.chars.c_1.af || null));
            const t1 = T.run('edit', E('f_sz', 4)), a1 = afOf(), t2 = T.run('edit', E('f_big', false)), a2 = afOf(), t3 = T.run('edit', E('f_sz', 1)), t4 = T.run('edit', E('f_big', null)), t5 = T.run('edits', M(['f_sz', 5])), a5 = afOf();
            check('1.6.2 a toggle worked out until set, on the host (the real edit and batch branches, with the real core): typing a figure fills the toggle in the same change and marks it; the player switching it, off too, takes the mark and no fill writes over it; a null gives it back to its worked-out setting (stored as none); a batch fills it again',
                j(t1.answer) === j([{ type: 'char-ack', rid: 'e1' }]) && j(t1.vals) === j({ f_st: 10, f_sz: 4, f_big: true }) && j(a1) === j({ f_big: 1 })
                && j(t2.vals) === j({ f_st: 10, f_sz: 4, f_big: false }) && a2 === null && j(t3.vals) === j({ f_st: 10, f_sz: 1, f_big: false })
                && j(t4.answer) === j([{ type: 'char-ack', rid: 'e1' }]) && j(t4.vals) === j({ f_st: 10, f_sz: 1 }) && j(t5.vals) === j({ f_st: 10, f_sz: 5, f_big: true }) && j(a5) === j({ f_big: 1 }),
                j([t1.answer, t1.vals, a1, t2.vals, a2, t3.vals, t4.answer, t4.vals, t5.vals, a5]));
        }
        const quiet = (r, vals) => r.sent === 0 && r.saved === 0 && r.notes.length === 0 && r.logs.length === 0 && j(r.vals) === j(vals), went = r => r.sent === 1 && r.saved === 1;
        // a budget that refuses, watched always
        const R = mk({ over: 'refuse', when: 'always' });
        const r1 = R.run('edit', E('f_st', 20)), r2 = R.run('edit', E('f_st', 21)), r3 = R.run('edits', M(['f_st', 20], ['f_dx', 11])), r4 = R.run('edits', M(['f_st', 18], ['f_dx', 11]));
        const r5 = R.run('item', ADD('x')), r6 = R.run('item', ADD('y')), r7 = R.run('item', ADD('z')), kit2 = r6.vals.f_kit;
        check('126 a budget that refuses, on the host (the real edit, batch and row branches, with the real core): a player\'s own change that keeps their character within its points is stored, answered and sent on as ever, at the very limit too; one that would take it over is refused BEFORE anything is stored, with the reason "budget" and the budget\'s own words, its name and its figures: nothing is stored, sent or saved, and the GM is not told; a batch is judged whole, so two values that together go over are refused together; and so is a row picked up',
            j(r1.answer) === ACK('e1') && went(r1) && r1.vals.f_st === 20 && r1.notes.length === 0
            && j(r2.answer) === NO('e1', 110, 10) && quiet(r2, { f_st: 20 })
            && j(r3.answer) === NO('m1', 110, 10) && quiet(r3, { f_st: 20 }) && j(r4.answer) === ACK('m1') && went(r4) && j([r4.vals.f_st, r4.vals.f_dx]) === j([18, 11])
            && j(r5.answer) === ACK('i1') && went(r5) && r5.vals.f_kit.length === 1 && j(r6.answer) === ACK('i1') && r6.vals.f_kit.length === 2
            && j(r7.answer) === NO('i1', 105, 5) && quiet(r7, { f_st: 18, f_dx: 11, f_kit: kit2 }),
            j([r1.answer, r2, r3.answer, r4.answer, r5.answer, r7.answer]));
        // a budget that warns: the change goes through, with its words to the player and to the GM
        const Wn = mk({ over: 'warn', when: 'always' });
        const w1 = Wn.run('edit', E('f_st', 21)), w2 = Wn.run('edit', E('f_st', 22)); Wn.out.clock += 31000; const w3 = Wn.run('edit', E('f_st', 23)), w4 = Wn.run('edits', M(['f_dx', 11])), w5 = Wn.run('item', ADD('x'));
        Wn.out.clock += 31000; const w6 = Wn.run('edit', E('f_st', 12)), w7 = Wn.run('edit', E('f_st', 30));
        check('126 a budget that warns, on the host: the change is stored and sent on, the answer carries the budget\'s words for the player, and the GM is told, by name, in a notice that is also logged; a budget breached again within the quiet window is not said again, and the next notice says how many went unsaid; a batch and a row are warned of alike; a change that brings the character back within its points is answered plainly, with nothing said',
            j(w1.answer) === WARN('e1', 110, 10) && went(w1) && w1.vals.f_st === 21 && j(w1.notes) === j(['Ana went over. ' + SAYS(110, 10)]) && j(w1.logs) === j([['items', 'Ana went over. ' + SAYS(110, 10)]])
            && j(w2.answer) === WARN('e1', 120, 20) && went(w2) && w2.notes.length === 0
            && j(w3.answer) === WARN('e1', 130, 30) && j(w3.notes) === j(['Ana went over. ' + SAYS(130, 30) + ' 1 more since the last notice.'])
            && j(w4.answer) === WARN('m1', 140, 40) && went(w4) && w4.notes.length === 0 && j(w5.answer) === WARN('i1', 145, 45) && went(w5) && w5.vals.f_kit.length === 1
            && j(w6.answer) === ACK('e1') && went(w6) && w6.notes.length === 0 && j(w7.answer) === WARN('e1', 215, 115) && j(w7.notes) === j(['Ana went over. ' + SAYS(215, 115) + ' 2 more since the last notice.']),
            j([w1, w3.notes, w4.answer, w5.answer, w6.answer, w7]));
        // off, and the two watches
        const off = mk({ over: 'off', when: 'always' }).run('edit', E('f_st', 30)), none = mk(null).run('edit', E('f_st', 30));
        const mkPlay = mk({ over: 'refuse', when: 'making' }).run('edit', E('f_st', 30)), mkMake = mk({ over: 'refuse', when: 'making' }, null, { making: 1 }).run('edit', E('f_st', 30));
        const plMake = mk({ over: 'refuse', when: 'play' }, null, { making: 1 }).run('edit', E('f_st', 30)), plPlay = mk({ over: 'refuse', when: 'play' }).run('edit', E('f_st', 30)), plOpen = mk({ over: 'refuse', when: 'play' }, null, { unlocked: 1 }).run('edit', E('f_st', 30));
        const shB = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8');
        check('126 a budget that only shows, and the two watches, on the host: a budget set to off judges nothing, and a system with no budget answers as it always did; a budget watched while a character is made refuses a character in the making and lets one in play through; a budget watched in play does the reverse, an unlocked character being in play; the notice is the one place that tells the GM, each branch asks the core before it stores, and a player\'s app has words for the refusal',
            j(off.answer) === ACK('e1') && went(off) && off.notes.length === 0 && j(none.answer) === ACK('e1') && went(none)
            && j(mkPlay.answer) === ACK('e1') && went(mkPlay) && j(mkMake.answer) === NO('e1', 200, 100) && quiet(mkMake, { f_st: 19 })
            && j(plMake.answer) === ACK('e1') && went(plMake) && j(plPlay.answer) === NO('e1', 200, 100) && quiet(plPlay, { f_st: 19 }) && j(plOpen.answer) === NO('e1', 200, 100)
            && bnSrc.length > 300 && !/innerHTML/.test(bnSrc) && src.split('budgetNotice(').length === 5 && src.split('.budgetWatch(').length === 4
            && edSrc.indexOf('Se.budgetWatch(campE.system, chE, bcE, Fe)') < edSrc.indexOf('chE.values[q.fieldId] = resE.value') && edSrc.indexOf('Se.budgetWatch(') > edSrc.indexOf('Se.applyEdit(')
            && msSrc.indexOf('Sm.budgetWatch(campM.system, chM, dM, Fm)') < msSrc.indexOf('chM.values = workM.values') && msSrc.indexOf('Sm.budgetWatch(') > msSrc.indexOf('for (var iM = 0;')
            && ciSrc.indexOf('Si.budgetWatch(campI.system, chI, bcI, Fi)') < ciSrc.indexOf('chI.values[qi.fieldId] = resI.value') && ciSrc.indexOf('Si.budgetWatch(') > ciSrc.indexOf('Si.applyRowOp(')
            && shB.split("reason === 'budget' ? (msg || 'That would take the character over a point budget.')").length === 2 && Sx.cleanDenyReason('budget') === 'budget',
            j([off.answer, none.answer, mkPlay.answer, mkMake.answer, plMake.answer, plPlay.answer, src.split('budgetNotice(').length, src.split('.budgetWatch(').length]));
        // The owed review, 2026-10-09 (backlog 135): a budget whose figure a player's own change makes impossible to work out. It was then judged
        // by nothing, and stayed so while they spent and put the value back
        const DIV = { spent: '(ST - 10) * 10 / DX' }, LOSTW = 'Character points cannot be worked out with that change.';
        const Lz = mk(Object.assign({ over: 'refuse', when: 'always' }, DIV));
        const z1 = Lz.run('edit', E('f_dx', 0)), z2 = Lz.run('edits', M(['f_dx', 0], ['f_st', 99])), z3 = Lz.run('edit', E('f_st', 99)), z4 = Lz.run('edit', E('f_dx', 1));
        const Lw = mk(Object.assign({ over: 'warn', when: 'always' }, DIV));
        const y1 = Lw.run('edit', E('f_dx', 0)); Lw.out.clock += 31000; const y2 = Lw.run('edit', E('f_st', 99)), y3 = Lw.run('edit', E('f_dx', 1));
        check('126 a budget a player\'s own change would leave impossible to work out, on the host (the owed review of 2026-10-09; the real edit and batch branches with the real core): under a budget that refuses, the change is refused BEFORE anything is stored, with the reason "budget" and one fixed sentence, alone and as part of a batch, and nothing is stored, sent or saved; the spend it was meant to hide is judged as ever, and so is the value put back; under a budget that warns the change goes through with those words to the player and, by the character\'s name, to the GM, a change made while the figure is lost is not judged, and the change that brings the figure back over is said as going over',
            j(z1.answer) === j([{ type: 'char-deny', rid: 'e1', reason: 'budget', msg: LOSTW }]) && quiet(z1, { f_st: 19 }) && j(z2.answer) === j([{ type: 'char-deny', rid: 'm1', reason: 'budget', msg: LOSTW }]) && quiet(z2, { f_st: 19 })
            && j(z3.answer) === ACK('e1') && went(z3) && z3.vals.f_st === 99 && j(z4.answer) === NO('e1', 890, 790) && quiet(z4, { f_st: 99 })
            && j(y1.answer) === j([{ type: 'char-ack', rid: 'e1', msg: LOSTW }]) && went(y1) && y1.vals.f_dx === 0 && j(y1.notes) === j(['Ana: ' + LOSTW]) && j(y1.logs) === j([['items', 'Ana: ' + LOSTW]])
            && j(y2.answer) === ACK('e1') && went(y2) && y2.notes.length === 0 && j(y3.answer) === WARN('e1', 890, 790) && j(y3.notes) === j(['Ana went over. ' + SAYS(890, 790)]),
            j([z1, z2.answer, z3.answer, z4.answer, y1, y2.answer, y3]));
    }
})());
pendingChecks.push((async () => {
    /* ---- 126b: what an entry needs, judged by the host for a player's own pick (the owner: "the host judges a player's pick") ---- */
    {
        const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
        const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
        const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
        const sys = Sx.cleanSystem({ v: 1, name: 'N', rolls: [], fields: [{ id: 'f_kit', key: 'Kit', kind: 'item-list' }], items: [{ id: 'i_med', name: 'MED' }, { id: 'i_dark', name: 'DARK', vis: 'gm' }, { id: 'i_two', name: 'TWO', needs: [{ id: 'i_med' }, { id: 'i_dark' }] },
            { id: 'i_own', name: 'OWN', needs: [{ id: 'i_med' }], needsMsg: 'Train first.' }, { id: 'i_free', name: 'FREE' }] }, { F: Fx, gmView: true });
        const libE = { i_lib: { id: 'i_lib', name: 'LIB', vis: 'all', needs: [{ id: 'i_med' }] } };
        const camp = { id: 'k', system: sys, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: {} } } };
        const out = { answer: [], owner: [], notes: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: 'pA', send: box(out.answer) }, net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null, wpLibrary: { playerEntry: id => (Object.prototype.hasOwnProperty.call(libE, id) ? {} : null), entry: id => (Object.prototype.hasOwnProperty.call(libE, id) ? libE[id] : null) } };
        const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn function(msg, conn) {\n' + ciSrc + '\n};')(
            net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), () => {});
        const ADD = k => { out.answer.length = 0; out.owner.length = 0; out.notes.length = 0; const s0 = out.saves; H({ type: 'char-item', rid: 'i1', charId: 'c_1', fieldId: 'f_kit', op: 'add', defId: 'i_' + k, rowId: 'w_' + k + '1', qty: 1 }, conn);
            return { answer: out.answer.slice(), sent: out.owner.length, notes: out.notes.slice(), saved: out.saves - s0, kit: (camp.chars.c_1.values.f_kit || []).map(r => r.defId) }; };
        const NO = msg => j([{ type: 'char-deny', rid: 'i1', reason: 'needs', msg }]), ACK = j([{ type: 'char-ack', rid: 'i1' }]), quiet = (r, kit) => r.sent === 0 && r.saved === 0 && r.notes.length === 0 && j(r.kit) === j(kit);
        const n1 = ADD('two'), n2 = ADD('own'), n3 = ADD('lib'), n4 = ADD('free'), n5 = ADD('med'), n6 = ADD('own'), n7 = ADD('lib'), n8 = ADD('two');
        check('126b what an entry needs, on the host (the real row branch with the real core): a player\'s pick of an entry whose needs their character does not meet is answered char-deny with the reason "needs" and the words, the GM\'s own where the entry has them, else the needs by name; nothing is stored, sent or saved, and the GM is not told; an entry of the library is judged alike, through the host\'s own copy of it; an entry that needs nothing, and one whose needs are met, are picked as ever; a need that names a GM-only entry is never named to the player, whose id the host alone holds; every message packs',
            j(n1.answer) === NO('That needs MED and something else.') && quiet(n1, []) && j(n2.answer) === NO('Train first.') && quiet(n2, []) && j(n3.answer) === NO('That needs MED.') && quiet(n3, [])
            && j(n4.answer) === ACK && n4.saved === 1 && j(n5.answer) === ACK && j(n6.answer) === ACK && j(n7.answer) === ACK && j(n7.kit) === j(['i_free', 'i_med', 'i_own', 'i_lib'])
            && j(n8.answer) === NO('That needs something you do not have.') && quiet(n8, ['i_free', 'i_med', 'i_own', 'i_lib']) && !/DARK|i_dark/.test(j([n1.answer, n8.answer]))
            && ciSrc.indexOf("if (resI.reason === 'needs') {") > ciSrc.indexOf('Si.applyRowOp(') && ciSrc.indexOf("if (resI.reason === 'needs') {") < ciSrc.indexOf('chI.values[qi.fieldId] = resI.value') && Sx.cleanDenyReason('needs') === 'needs',
            j([n1.answer, n2.answer, n3.answer, n4.answer, n7.kit, n8.answer]));
        {   // 1.5.6 buying and selling on the host (the real row branch with the real core): the money moves with the row, all or nothing
            const sysB = Sx.cleanSystem({ v: 1, name: 'B', rolls: [], fields: [
                { id: 'f_chips', key: 'Chips', label: 'Chips', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, lvl: { label: 'Stored', min: 0, max: 100000, step: 0.01, def: 0 }, money: '@lvl' } },
                { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { price: 'cr', stats: [{ key: 'cr', label: 'Cost' }] } }],
                items: [{ id: 'i_chip', name: 'Chip' }, { id: 'i_lamp', name: 'Lamp', stats: { cr: 25 } }] }, { F: Fx, gmView: true });
            const campB = { id: 'k', system: sysB, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_chips: [{ id: 'w_c1', defId: 'i_chip', qty: 1, lvl: 30 }, { id: 'w_c2', defId: 'i_chip', qty: 1, lvl: 100 }], f_gear: [] } } } };
            const outB = { answer: [], owner: [], saves: 0, logs: [] }, connB = { peer: 'pA', send: box(outB.answer) }, netB = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(outB.owner) }], roster: { pA: { id: 'u_a' } } };
            const winB = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null, wpLibrary: null };
            const HB = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
                'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn function(msg, conn) {\n' + ciSrc + '\n};')(
                netB, () => Sx, winB, () => false, () => campB, () => { outB.saves++; }, e => { throw e; }, c => (netB.roster[c.peer] ? netB.roster[c.peer].id : null), { allow: () => true }, () => {}, (k, t) => outB.logs.push(t));
            const BUY = (rid, pay, rowId) => { outB.answer.length = 0; outB.owner.length = 0; const s0 = outB.saves; HB({ type: 'char-item', rid, charId: 'c_1', fieldId: 'f_gear', op: 'add', defId: 'i_lamp', rowId, qty: 2, pay }, connB); return { answer: outB.answer.slice(), owner: outB.owner.slice(), saved: outB.saves - s0 }; };
            const b1 = BUY('b1', 45, 'w_g1'), chips1 = campB.chars.c_1.values.f_chips.map(x => x.lvl), gear1 = campB.chars.c_1.values.f_gear.map(x => [x.qty, x.paid]);
            const b2 = BUY('b2', 900, 'w_g2'), chips2 = campB.chars.c_1.values.f_chips.map(x => x.lvl), gear2 = campB.chars.c_1.values.f_gear.length;
            const deltaKeys = b1.owner.filter(m => m.type === 'charDelta' || m.type === 'char-delta' || m.values).map(m => Object.keys(m.values || m.delta || {}).sort());
            check('1.5.6 buying on the host (the real row branch with the real core): a player\'s two lamps bought for 45 take 45 from the smallest chip first (the 30, then 15 of the 100), stamp each lamp 22.5 as Paid, are stored, saved once, acked, sent to the owner with both lists and logged; one they cannot pay for is answered char-deny with the reason money and the words, and nothing is stored, sent or saved',
                j(b1.answer) === j([{ type: 'char-ack', rid: 'b1' }]) && b1.saved === 1 && j(chips1) === j([85]) && j(gear1) === j([[2, 22.5]]) && b1.owner.length >= 1 && j(deltaKeys[0] || []) === j(['f_chips', 'f_gear']) && outB.logs.some(t => /Ana bought .* for 45/.test(t))
                && b2.answer.length === 1 && b2.answer[0].type === 'char-deny' && b2.answer[0].reason === 'money' && /85 held, 900 needed/.test(b2.answer[0].msg) && b2.saved === 0 && b2.owner.length === 0 && j(chips2) === j([85]) && gear2 === 1,
                j([b1, b2, chips1, gear1]));
        }
    }
})());
pendingChecks.push((async () => {
    /* ---- 126b: a player's own app answers a pick its character does not meet in the core's words, and sends nothing ---- */
    {
        const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
        const cA = src.indexOf('net.charItem = function('), cZ = src.indexOf('\n};\n', cA) + 3, sent = [], ciSrc = src.slice(cA, cZ);
        const view = Sx.cleanSystem({ v: 1, name: 'N', rolls: [], fields: [{ id: 'f_kit', key: 'Kit', kind: 'item-list' }], items: [{ id: 'i_med', name: 'MED' }, { id: 'i_two', name: 'TWO', needs: [{ id: 'i_med' }, { id: 'i_lib9' }] },
            { id: 'i_own', name: 'OWN', needs: [{ id: 'i_med' }], needsMsg: 'Train first.' }, { id: 'i_hid', name: 'HID', needsHid: true }] }, { F: Fx, gmView: false, needShown: true });
        const campC = { id: 'k', system: view, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: {} } } };
        const libE = { i_lib8: { id: 'i_lib8', name: 'LIB8', vis: 'all', needs: [{ id: 'i_med' }] } };
        const netC = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', libEntry: id => (Object.prototype.hasOwnProperty.call(libE, id) ? libE[id] : null), conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } }] };
        new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', ciSrc)(netC, () => Sx, () => campC, { wpFormula: Fx, wpVtt: { on: () => true } }, {}, () => {}, () => 0);
        const ADD = k => netC.charItem('c_1', 'f_kit', { op: 'add', defId: 'i_' + k, rowId: 'w_' + k + '1', qty: 1 }), kit =() => (campC.chars.c_1.values.f_kit || []).map(r => r.defId);
        const r1 = ADD('two'), r2 = ADD('own'), r3 = ADD('lib8'), n0 = sent.length, k0 = kit(), r4 = ADD('med'), r5 = ADD('own'), r6 = ADD('lib8'), r7 = ADD('two'), r8 = ADD('hid'), r9 = ADD('gone');
        check('126b a player\'s own app (the real net.charItem with the real core): a pick their character does not meet, by the needs their own copy of the entry names, is answered at once in the core\'s words, the GM\'s own where the entry has them, and nothing is stored or sent; an entry of the library is judged alike from the copy their app fetched; once the need is carried the same picks are stored and sent; a need their copy does not name is left to the host, so that pick is sent; an entry that is gone still says so; a refusal with words of its own says them (the pin moved on purpose in 1.5.9, Chambers from: a launcher made a stack is refused in words); every message packs',
            r1.error === 'That needs MED and something else.' && r2.error === 'Train first.' && r3.error === 'That needs MED.' && n0 === 0 && k0.length === 0
            && r4.ok === true && r5.ok === true && r6.ok === true && r7.error === 'That needs something you do not have.' && r8.ok === true && r9.error === 'That item is gone.'
            && j(sent.map(m => [m.type, m.op, m.defId])) === j([['char-item', 'add', 'i_med'], ['char-item', 'add', 'i_own'], ['char-item', 'add', 'i_lib8'], ['char-item', 'add', 'i_hid']]) && j(kit()) === j(['i_med', 'i_own', 'i_lib8', 'i_hid'])
            && ciSrc.includes("res.reason === 'needs' ? (res.msg || 'Your character does not meet what that needs.') : res.reason === 'value' && typeof res.msg === 'string' && res.msg ? res.msg : 'That change is not allowed.' };"),
            j([r1, r2, r3, r7, r8, r9, sent.map(m => m.defId)]));
    }
})());
pendingChecks.push((async () => {
    /* ---- 1.5.8 Loads from: the host stores both lists a load moves, and a player's own app sends a load and waits for the host's word ---- */
    {
        const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
        const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
        const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); return src.slice(i, k); })();
        const raw = { v: 1, name: 'L', rolls: [], fields: [
            { id: 'f_tools', key: 'Tools', label: 'Tools', kind: 'item-list', edit: 'owner', vis: 'all', list: { counters: [{ key: 'ch', label: 'Charge', max: 'Row.loadmax' }], load: { from: 'f_cells', ct: 'ch' } } },
            { id: 'f_cells', key: 'Cells', label: 'Cells', kind: 'item-list', edit: 'owner', vis: 'all', list: { lvl: { label: 'Charge', min: 0, max: 500, def: 0 } } }],
            items: [{ id: 'i_glow', name: 'Glowstick' }, { id: 'i_cell', name: 'Cell', lvl: 50 }] };
        const sysL = Sx.cleanSystem(raw, { F: Fx, gmView: true });
        const camp = { id: 'k', system: sysL, chars: { c_1: { id: 'c_1', name: 'Kael', ownerId: 'u_k', npc: false, values: { f_tools: [{ id: 'w_t1', defId: 'i_glow', qty: 1 }], f_cells: [{ id: 'w_c1', defId: 'i_cell', qty: 2, lvl: 50 }] } } } };
        const out = { answer: [], owner: [], saves: 0 }, conn = { peer: 'pK', send: m => { packCheck(m); out.answer.push(JSON.parse(JSON.stringify(m))); } };
        const netH = { active: true, role: 'host', paused: false, conns: [{ peer: 'pK', open: true, send: m => { packCheck(m); out.owner.push(JSON.parse(JSON.stringify(m))); } }], roster: { pK: { id: 'u_k' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null, wpLibrary: null };
        const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn function(msg, conn) {\n' + ciSrc + '\n};')(
            netH, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (netH.roster[c.peer] ? netH.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
        const SEND = msg => { out.answer.length = 0; out.owner.length = 0; const s0 = out.saves; H(Object.assign({ type: 'char-item', charId: 'c_1', fieldId: 'f_tools', rowId: 'w_t1' }, msg), conn); return { answer: out.answer.slice(), owner: out.owner.slice(), saved: out.saves - s0 }; };
        const a1 = SEND({ rid: 'l1', op: 'load', from: 'w_c1', back: 'w_b1' }), t1 = j(camp.chars.c_1.values.f_tools), c1 = j(camp.chars.c_1.values.f_cells.map(r => [r.id, r.qty, r.lvl]));
        const keys1 = a1.owner.filter(m => m.values).map(m => Object.keys(m.values).sort());
        const a2 = SEND({ rid: 'l2', op: 'load', from: 'w_zz', back: 'w_b2' }), t2 = j(camp.chars.c_1.values.f_tools);
        const a3 = SEND({ rid: 'l3', op: 'load', from: null, back: 'w_b3' }), c3 = j(camp.chars.c_1.values.f_cells.map(r => [r.id, r.qty, r.lvl]));
        check('1.5.8 Loads from on the host (the real row branch with the real core): a player\'s load takes one unit off the stack and keeps its copy and its charge on the row, stored, saved once, acked and sent to the owner with both lists; a source row that is not there is answered char-deny and nothing moves; an unload puts the full unit back onto its stack; every message packs',
            j(a1.answer) === j([{ type: 'char-ack', rid: 'l1' }]) && a1.saved === 1 && t1 === j([{ id: 'w_t1', defId: 'i_glow', qty: 1, ct: { ch: 50 }, ld: { defId: 'i_cell' } }]) && c1 === j([['w_c1', 1, 50]]) && j(keys1[0] || []) === j(['f_cells', 'f_tools'])
            && a2.answer.length === 1 && a2.answer[0].type === 'char-deny' && a2.answer[0].reason === 'missing' && a2.saved === 0 && a2.owner.length === 0 && t2 === t1
            && j(a3.answer) === j([{ type: 'char-ack', rid: 'l3' }]) && c3 === j([['w_c1', 2, 50]]),
            j([a1, t1, c1, keys1, a2.answer, a3.answer, c3]));
        // a player's own app: a load is sent with its from and back and waits for the host's word (nothing laid over their copy first)
        const cA = src.indexOf('net.charItem = function('), cZ = src.indexOf('\n};\n', cA) + 3, sent = [], pend = {};
        const view = Sx.cleanSystem(raw, { F: Fx, gmView: false });
        const campP = { id: 'k', system: view, chars: { c_1: { id: 'c_1', name: 'Kael', ownerId: 'u_k', npc: false, values: { f_tools: [{ id: 'w_t1', defId: 'i_glow', qty: 1 }], f_cells: [{ id: 'w_c1', defId: 'i_cell', qty: 2, lvl: 50 }] } } } };
        const before = j(campP.chars.c_1.values);
        const netP = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_k', libEntry: () => null, conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } }] };
        new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', src.slice(cA, cZ))(netP, () => Sx, () => campP, { wpFormula: Fx, wpVtt: { on: () => true } }, pend, () => {}, () => 0);
        const p1 = netP.charItem('c_1', 'f_tools', { op: 'load', rowId: 'w_t1', from: 'w_c1', back: 'w_b1' }), p2 = netP.charItem('c_1', 'f_tools', { op: 'load', rowId: 'w_t1', from: null, back: 'w_b2' });
        const pk = Object.keys(pend);
        check('1.5.8 Loads from on a player\'s own app (the real net.charItem): a load and an unload are each sent with their from and back and wait for the host\'s word, their copy left as it was until it comes, as a purchase is',
            p1.ok && p1.pending && p2.ok && p2.pending && j(campP.chars.c_1.values) === before && sent.length === 2
            && j(sent.map(m => [m.type, m.op, m.rowId, m.from, m.back])) === j([['char-item', 'load', 'w_t1', 'w_c1', 'w_b1'], ['char-item', 'load', 'w_t1', null, 'w_b2']]) && pk.length === 2 && pk.every(k => pend[k].kind === 'item' && Array.isArray(pend[k].batch)),
            j([p1, p2, sent, pk.length]));
    }
})());
pendingChecks.push((async () => {
    /* ---- 1.5.9 Chambers from: a player's chamber and unchamber through the host's real row branch, and their own app waiting for its word ---- */
    {
        const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
        const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
        const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); return src.slice(i, k); })();
        const raw = { v: 1, name: 'C', rolls: [], fields: [
            { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, stats: [{ key: 'ammo', label: 'Ammo' }, { key: 'kind', label: 'Kind' }], chamber: { from: 'f_gear', cats: ['Round'], by: 'ammo', to: 'kind', cap: 1 } } },
            { id: 'f_bag', key: 'Bag', label: 'Bag', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true } }],
            items: [{ id: 'i_tube', name: 'Spark Tube', category: 'Launcher', stats: { ammo: 4 } }, { id: 'i_fizz', name: 'Fizz Charge', category: 'Round', stats: { kind: 4 } }, { id: 'i_dud', name: 'Dud Charge', category: 'Round', stats: { kind: 9 } }] };
        const sysC = Sx.cleanSystem(raw, { F: Fx, gmView: true });
        const camp = { id: 'k', system: sysC, chars: { c_1: { id: 'c_1', name: 'Kael', ownerId: 'u_k', npc: false, values: { f_gear: [{ id: 'w_t1', defId: 'i_tube', qty: 1 }, { id: 'w_f1', defId: 'i_fizz', qty: 2 }, { id: 'w_d1', defId: 'i_dud', qty: 1 }], f_bag: [{ id: 'w_b1', defId: 'i_tube', qty: 1 }, { id: 'w_bf', defId: 'i_fizz', qty: 1 }] } } } };
        const out = { answer: [], owner: [], saves: 0 }, conn = { peer: 'pK', send: m => { packCheck(m); out.answer.push(JSON.parse(JSON.stringify(m))); } };
        const netH = { active: true, role: 'host', paused: false, conns: [{ peer: 'pK', open: true, send: m => { packCheck(m); out.owner.push(JSON.parse(JSON.stringify(m))); } }], roster: { pK: { id: 'u_k' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null, wpLibrary: null };
        const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn function(msg, conn) {\n' + ciSrc + '\n};')(
            netH, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (netH.roster[c.peer] ? netH.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
        const SEND = msg => { out.answer.length = 0; out.owner.length = 0; const s0 = out.saves; H(Object.assign({ type: 'char-item', charId: 'c_1', fieldId: 'f_gear', rowId: 'w_t1' }, msg), conn); return { answer: out.answer.slice(), owner: out.owner.slice(), saved: out.saves - s0 }; };
        const gear = () => j(camp.chars.c_1.values.f_gear);
        const a1 = SEND({ rid: 'c1', op: 'chamber', from: 'w_f1' }), g1 = gear();
        const a2 = SEND({ rid: 'c2', op: 'chamber', from: 'w_f1' }), g2 = gear();
        const a7 = SEND({ rid: 'c7', op: 'setQty', qty: 2 }), g7 = gear();
        const a3 = SEND({ rid: 'c3', op: 'unchamber', back: 'w_bk' }), g3 = gear();
        const a4 = SEND({ rid: 'c4', op: 'chamber', from: 'w_d1' }), g4 = gear();
        const a5 = SEND({ rid: 'c5', op: 'chamber', fieldId: 'f_bag', rowId: 'w_b1', from: 'w_bf' });
        const a6 = SEND({ rid: 'c6', op: 'chamber', from: 5 });
        check('1.5.9 Chambers from on the host (the real row branch with the real core): a player\'s chamber takes one unit off the stack into the launcher\'s chamber, stored, saved once, acked and sent to its owner; a second refused in words while the chamber is full; unchamber gives it back onto its stack; a round that does not fit refused in words; a list with no chamber answered field; a message of the wrong shape answered nothing; a launcher holding a round made a stack refused in words (its rounds would be lost); nothing moves on a refusal; every message packs',
            j(a1.answer) === j([{ type: 'char-ack', rid: 'c1' }]) && a1.saved === 1 && g1 === j([{ id: 'w_t1', defId: 'i_tube', qty: 1, rd: [{ defId: 'i_fizz' }] }, { id: 'w_f1', defId: 'i_fizz', qty: 1 }, { id: 'w_d1', defId: 'i_dud', qty: 1 }]) && a1.owner.some(m => m.values && m.values.f_gear)
            && a2.answer.length === 1 && a2.answer[0].type === 'char-deny' && /full/.test(a2.answer[0].msg || '') && a2.saved === 0 && a2.owner.length === 0 && g2 === g1
            && j(a3.answer) === j([{ type: 'char-ack', rid: 'c3' }]) && g3 === j([{ id: 'w_t1', defId: 'i_tube', qty: 1 }, { id: 'w_f1', defId: 'i_fizz', qty: 2 }, { id: 'w_d1', defId: 'i_dud', qty: 1 }])
            && a4.answer.length === 1 && a4.answer[0].type === 'char-deny' && a4.answer[0].reason === 'value' && /does not fit/.test(a4.answer[0].msg || '') && g4 === g3
            && a5.answer.length === 1 && a5.answer[0].type === 'char-deny' && a5.answer[0].reason === 'field' && a6.answer.length === 0
            && a7.answer.length === 1 && a7.answer[0].type === 'char-deny' && a7.answer[0].reason === 'value' && /Unchamber it first/.test(a7.answer[0].msg || '') && a7.saved === 0 && g7 === g1,
            j([a1, g1, a2.answer, a3.answer, g3, a4.answer, a5.answer, a6.answer, a7.answer]));
        const cA = src.indexOf('net.charItem = function('), cZ = src.indexOf('\n};\n', cA) + 3, sent = [], pend = {};
        const campP = { id: 'k', system: Sx.cleanSystem(raw, { F: Fx, gmView: false }), chars: { c_1: { id: 'c_1', name: 'Kael', ownerId: 'u_k', npc: false, values: { f_gear: [{ id: 'w_t1', defId: 'i_tube', qty: 1 }, { id: 'w_f1', defId: 'i_fizz', qty: 2 }] } } } };
        const before = j(campP.chars.c_1.values);
        const netP = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_k', libEntry: () => null, conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } }] };
        new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', src.slice(cA, cZ))(netP, () => Sx, () => campP, { wpFormula: Fx, wpVtt: { on: () => true } }, pend, () => {}, () => 0);
        const p1 = netP.charItem('c_1', 'f_gear', { op: 'chamber', rowId: 'w_t1', from: 'w_f1' }), p2 = netP.charItem('c_1', 'f_gear', { op: 'unchamber', rowId: 'w_t1', back: 'w_b2' });
        check('1.5.9 Chambers from on a player\'s own app (the real net.charItem): a chamber and an unchamber are each sent with their from and back and wait for the host\'s word, their copy left as it was until it comes',
            p1.ok && p1.pending && p2.ok && p2.pending && j(campP.chars.c_1.values) === before && j(sent.map(m => [m.type, m.op, m.rowId, m.from, m.back])) === j([['char-item', 'chamber', 'w_t1', 'w_f1', undefined], ['char-item', 'unchamber', 'w_t1', undefined, 'w_b2']]) && Object.keys(pend).length === 2,
            j([p1, p2, sent]));
        // 1.5.9 Chambers only where: the host's real row branch refuses a chamber on a row that does not meet it, in its words, and still lets its rounds out; a player's own app answers at once and sends nothing
        const rawN = JSON.parse(j(raw)); rawN.fields[0].list.chamber.needs = 'Row.ammo = 5'; rawN.fields[0].list.chamber.needsText = 'That tube takes no round.';
        const sysN = Sx.cleanSystem(rawN, { F: Fx, gmView: true }), sysKeep = camp.system; camp.system = sysN;
        const gN0 = gear(), n1 = SEND({ rid: 'n1', op: 'chamber', from: 'w_f1' }), gN1 = gear();
        camp.chars.c_1.values.f_gear[0].rd = [{ defId: 'i_fizz' }]; const n2 = SEND({ rid: 'n2', op: 'chamber', from: 'w_f1' }), n3 = SEND({ rid: 'n3', op: 'unchamber', back: 'w_bn' }), gN3 = camp.chars.c_1.values.f_gear;
        camp.system = sysKeep;
        const sentN = [], pendN = {}, campPN = { id: 'k', system: Sx.cleanSystem(rawN, { F: Fx, gmView: false }), chars: { c_1: { id: 'c_1', name: 'Kael', ownerId: 'u_k', npc: false, values: { f_gear: [{ id: 'w_t1', defId: 'i_tube', qty: 1, rd: [{ defId: 'i_fizz' }] }, { id: 'w_f1', defId: 'i_fizz', qty: 2 }] } } } };
        const beforeN = j(campPN.chars.c_1.values), netPN = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_k', libEntry: () => null, conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sentN.push(JSON.parse(JSON.stringify(m))); } }] };
        new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', src.slice(cA, cZ))(netPN, () => Sx, () => campPN, { wpFormula: Fx, wpVtt: { on: () => true } }, pendN, () => {}, () => 0);
        const q1 = netPN.charItem('c_1', 'f_gear', { op: 'chamber', rowId: 'w_t1', from: 'w_f1' }), q2 = netPN.charItem('c_1', 'f_gear', { op: 'unchamber', rowId: 'w_t1', back: 'w_b3' });
        check('1.5.9 Chambers only where on the host (the real row branch with the real core) and on a player\'s own app (the real net.charItem): a chamber on a row that does not meet it is denied with the reason needs and its words, nothing stored, saved or sent, also while the row holds a round, which still unchambers, acked and back onto its stack; on the player\'s own app the same chamber is answered at once in those words and nothing is sent, while the unchamber is sent and waits, their copy as it was; the players\' view keeps the formula, which reads no GM-only value',
            n1.answer.length === 1 && n1.answer[0].type === 'char-deny' && n1.answer[0].reason === 'needs' && n1.answer[0].msg === 'That tube takes no round.' && n1.saved === 0 && n1.owner.length === 0 && gN1 === gN0
            && n2.answer.length === 1 && n2.answer[0].reason === 'needs' && j(n3.answer) === j([{ type: 'char-ack', rid: 'n3' }]) && gN3[0].rd === undefined && gN3[1].qty === 3
            && q1.error === 'That tube takes no round.' && !q1.pending && q2.ok && q2.pending && sentN.length === 1 && sentN[0].op === 'unchamber' && j(campPN.chars.c_1.values) === beforeN && Object.keys(pendN).length === 1
            && Sx.fieldById(campPN.system, 'f_gear').list.chamber.needs === 'Row.ammo = 5',
            j([n1, n2.answer, n3.answer, gN3, q1, q2, sentN]));
        const rq = between('// [netcheck:rollreq-start]', '// [netcheck:rollreq-end]', 'rollreq'), dr = between('// [netcheck:diceroll-start]', '// [netcheck:diceroll-end]', 'diceroll');
        check('1.5.9 Chambers from, a launched round (net.js, pinned): after a roll\'s Then is applied, a round it fired on a hit, not a jam, goes off at the roller\'s target through the board\'s wpLaunchHit, asked through typeof, in the host\'s roll branch and the GM\'s own roll; a miss goes to the board\'s wpLaunchMiss instead (1.5.9 (es), moved on purpose: before, a miss placed nothing)',
            rq.includes("if (taQ && taQ.ok && taQ.fired && !mfHitQ && vdQ && vdQ.kind === 'check' && (vdQ.pass === true || recQ.body === 1) && tcQ && tcQ.range && typeof tcQ.range.tid === 'string' && typeof window.wpLaunchHit === 'function') window.wpLaunchHit({ charId: q.charId, fieldId: taQ.fired.f, rowId: taQ.fired.r, tid: tcQ.range.tid, mapId: tcQ.range.mapId, margin: vdQ.margin });")
            && dr.includes("if (taR && taR.ok && taR.fired && !mfHitR && vdR && vdR.kind === 'check' && (vdR.pass === true || rec.body === 1) && tcR && tcR.range && typeof tcR.range.tid === 'string' && typeof window.wpLaunchHit === 'function') window.wpLaunchHit({ charId: chR.id, fieldId: taR.fired.f, rowId: taR.fired.r, tid: tcR.range.tid, mapId: tcR.range.mapId, margin: vdR.margin });"));
    }
})());
pendingChecks.push((async () => {
    /* ---- 126b: only a player's own app believes a src; the host judges by its own rows ---- */
    {
        const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
        const rawS = { v: 1, name: 'N', rolls: [], fields: [{ id: 'f_kit', key: 'Kit', kind: 'item-list' }], items: [{ id: 'i_two', name: 'TWO', needs: [{ id: 'i_lib1' }] }] };
        const view = Sx.cleanSystem(rawS, { F: Fx, gmView: false, needShown: true }), inline = () => [{ id: 'w_1', qty: 1, def: { name: 'L1' }, lnk: 1, src: 'i_lib1' }], PICK = { op: 'add', defId: 'i_two', rowId: 'w_two1', qty: 1 };
        // a player's own app: the pick, and the changes still waiting laid over a newer host copy
        const cA = src.indexOf('net.charItem = function('), cZ = src.indexOf('\n};\n', cA) + 3, sentC = [];
        const campC = { id: 'k', system: view, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_kit: inline() } } } };
        const netC = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', libEntry: () => null, conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sentC.push(m.defId); } }] };
        new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', src.slice(cA, cZ))(netC, () => Sx, () => campC, { wpFormula: Fx, wpVtt: { on: () => true } }, {}, () => {}, () => 0);
        const rOwn = netC.charItem('c_1', 'f_kit', PICK);
        const rA = src.indexOf('function reapplyPending(charId) {'), rZ = src.indexOf('\n}\n', rA) + 3, rpSrc = rA > 0 ? src.slice(rA, rZ) : '';
        const campR = { id: 'k', system: view, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_kit: [] } } } };
        new Function('getActiveCampaign', 'SC', '_charHost', '_charPending', 'window', 'net', rpSrc + '\nreturn reapplyPending;')(() => campR, () => Sx, { c_1: { f_kit: inline() } }, { e1: { charId: 'c_1', fieldId: 'f_kit', kind: 'item', q: JSON.parse(JSON.stringify(PICK)) } }, { wpFormula: Fx }, { libEntry: () => null })('c_1');
        const kitR = campR.chars.c_1.values.f_kit.map(r => r.defId || r.src);
        // the host: the same pick for a character one of whose own stored rows carries a src (a campaign from a file may hold one)
        const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
        const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
        const sysH = Sx.cleanSystem(rawS, { F: Fx, gmView: true }), campH = { id: 'k', system: sysH, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_kit: inline() } } } }, ans = [];
        const conn = { peer: 'pA', send: m => { packCheck(m); ans.push(JSON.parse(JSON.stringify(m))); } }, netH = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send() {} }], roster: { pA: { id: 'u_a' } } };
        const winH = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false, needShown: () => true }), charChanged() {} }, wpDiceCore: null, wpLibrary: null };
        new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn function(msg, conn) {\n' + ciSrc + '\n};')(
            netH, () => Sx, winH, () => false, () => campH, () => {}, e => { throw e; }, c => (netH.roster[c.peer] ? netH.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {})(Object.assign({ type: 'char-item', rid: 'i1', charId: 'c_1', fieldId: 'f_kit' }, PICK), conn);
        check('126b only a player\'s own app believes a src (the real net.charItem, reapplyPending and host row branch, with the real core): on a player\'s app a pick whose need is carried as an inline copy of a library row goes through and is sent, and a change still waiting for the host is laid over a newer host copy the same way, so the row they picked does not drop out of sight; the host, judging the very same rows as its own, does not believe the src and refuses, storing nothing; the host\'s call says nothing of a copy, both of a player\'s calls do',
            rOwn.ok === true && j(sentC) === j(['i_two']) && j(kitR) === j(['i_lib1', 'i_two'])
            && j(ans) === j([{ type: 'char-deny', rid: 'i1', reason: 'needs', msg: 'That needs something you do not have.' }]) && campH.chars.c_1.values.f_kit.length === 1
            && src.includes("{ player: true, view: camp.system, lib: net.libEntry, copy: true });") && rpSrc.includes("var o = { player: true, view: camp.system, lib: net.libEntry, copy: true },")
            && ciSrc.includes("{ player: true, view: window.wpSheets ? window.wpSheets.playerSystem(campI) : null, grace: grI, onGrace: !!ogI, graceOf: gofI, lib: libI, libPl: window.wpLibrary && window.wpLibrary.playerEntry ? function(id) { return window.wpLibrary.playerEntry(id); } : null });") && !/copy:/.test(ciSrc),
            j([rOwn, sentC, kitR, ans]));
    }
})());
pendingChecks.push((async () => {
    /* ---- 126b: an index row's needs on a player's app (the real loader) ---- */
    {
        const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Lx = await import(url('librarycore.js'));
        const lcSrc = between('// [netcheck:libclient-start]', '// [netcheck:libclient-end]', 'libclient'), wait0 = () => new Promise(r => setImmediate(r));
        const timers = [], fakeSet = (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, fakeClear = id => { if (timers[id - 1]) timers[id - 1].fn = null; };
        const sent = [], conn = { peer: 'h', open: true, send: m => { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } };
        const netL = { active: true, role: 'client', syncedPeer: 'h', conns: [conn] }, stL = { appState: { activeCampaignId: 'k' } };
        const campL = { id: 'k', system: Sx.cleanSystem({ v: 1, name: 'P', rolls: [], fields: [{ id: 'f_inv', key: 'Gear', kind: 'item-list' }] }, { F: Fx, gmView: false }) };
        new Function('net', 'state', 'window', 'getActiveCampaign', 'setTimeout', 'clearTimeout', lcSrc)(netL, stL, { wpLibraryCore: Lx, wpFormula: Fx }, () => campL, fakeSet, fakeClear);
        netL.libTake({ campId: 'k', packs: [{ id: 'p_a', name: 'A', count: 6, hash: 'aaaaaaaa' }] });
        const row = (id, name, more) => [id, '', name, 'Gear', '', [], '12345678'].concat(more === undefined ? [] : [more]);
        const load = netL.libLoad('p_a'); await wait0();
        const ask = sent[sent.length - 1];
        netL.libAnswer({ type: 'lib-idx-ans', rid: ask.rid, packId: 'p_a', hash: 'aaaaaaaa', page: 0, pages: 1, rows: [row('i_1', 'One'), row('i_2', 'Two', [{ id: 'i_1', lvl: 2, name: 'x' }, { id: 'i_1' }, { id: '__proto__' }]), row('i_3', 'Three', 'junk'), row('i_4', 'Four', []),
            row('i_5', 'Five', [{ id: 'i_1' }]).concat(['ST >= 2', 'extra']), row('i_6', 'Six', [{ id: 'bad' }])] });
        const ok = await load, got = netL.libRows('p_a').map(r => [r[0], r.length, r.length === 8 ? r[7] : null]);
        check('126b an index row\'s needs on a player\'s app (the real loader with the real library core): a row of seven is taken as ever; a row of eight is taken with its needs cleaned again, an id once by its pattern, a level as a number, no name; a row whose eighth place is no list, an empty one or holds no need, and a row of ten, are left out whole; the ask packs',
            ok === true && ask.type === 'lib-idx' && ask.packId === 'p_a' && j(got) === j([['i_1', 7, null], ['i_2', 8, [{ id: 'i_1', lvl: 2 }]]]) && netL.libLoaded('p_a') === 2,
            j(got));
    }
})());
pendingChecks.push((async () => {
    /* ---- 126b, the rule on the wire: the host judges a player's pick by the rule and says its text only where players may read it ---- */
    {
        const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Lx = await import(url('librarycore.js'));
        const rawS = { v: 1, name: 'N', rolls: [], fields: [{ id: 'f_st', key: 'ST', kind: 'number' }, { id: 'f_sec', key: 'Secret', kind: 'number', vis: 'gm' }, { id: 'f_kit', key: 'Kit', kind: 'item-list' }],
            items: [{ id: 'i_a', name: 'A', needsIf: 'ST >= 12' }, { id: 'i_b', name: 'B', needsIf: 'Secret >= 1' }, { id: 'i_w', name: 'W', needsIf: 'ST >= 12', needsMsg: 'Be strong.' }, { id: 'i_c', name: 'C' }] };
        const sysH = Sx.cleanSystem(rawS, { F: Fx, gmView: true }), gmLib = { i_l1: { id: 'i_l1', name: 'L1', vis: 'all', needsIf: 'ST >= 5' }, i_l2: { id: 'i_l2', name: 'L2', vis: 'all', needsIf: 'Secret >= 1' } }, plLib = { i_l1: { id: 'i_l1', name: 'L1', needsIf: 'ST >= 5' }, i_l2: { id: 'i_l2', name: 'L2', needsHid: true } };
        const own = (o, k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null);
        const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
        const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
        const campH = { id: 'k', system: sysH, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_st: 1 } } } }, ans = [];
        const conn = { peer: 'pA', send: m => { packCheck(m); ans.push(JSON.parse(JSON.stringify(m))); } }, netH = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send() {} }], roster: { pA: { id: 'u_a' } } };
        const winH = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null, wpLibrary: { playerEntry: id => own(plLib, id), entry: id => own(gmLib, id) } };
        const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn function(msg, conn) {\n' + ciSrc + '\n};')(
            netH, () => Sx, winH, () => false, () => campH, () => {}, e => { throw e; }, c => (netH.roster[c.peer] ? netH.roster[c.peer].id : null), { allow: () => true }, () => {}, () => {});
        let nRow = 0; const ADD = k => { ans.length = 0; nRow++; H({ type: 'char-item', rid: 'i1', charId: 'c_1', fieldId: 'f_kit', op: 'add', defId: 'i_' + k, rowId: 'w_r' + nRow, qty: 1 }, conn); return ans.length === 1 && ans[0].type === 'char-ack' ? 'ack' : ans.map(m => [m.type, m.reason, m.msg]); };
        const NO = t => j([['char-deny', 'needs', t]]), kit = () => (campH.chars.c_1.values.f_kit || []).map(r => r.defId);
        const h1 = ADD('a'), h2 = ADD('b'), h3 = ADD('w'), h4 = ADD('l1'), h5 = ADD('l2'), h6 = ADD('c'), k0 = kit();
        campH.chars.c_1.values.f_st = 12; const h7 = ADD('a'), h8 = ADD('l1'), h9 = ADD('b'), h10 = ADD('w');
        campH.chars.c_1.values.f_sec = 1; const h11 = ADD('b'), h12 = ADD('l2');
        // a player's own app: the same rule on their copy, said at once and nothing sent
        const view = Sx.cleanSystem(rawS, { F: Fx, gmView: false }), cA = src.indexOf('net.charItem = function('), cZ = src.indexOf('\n};\n', cA) + 3, sentC = [];
        const campC = { id: 'k', system: view, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_st: 1 } } } };
        const netC = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', libEntry: id => own(plLib, id), conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sentC.push(m.defId); } }] };
        new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', src.slice(cA, cZ))(netC, () => Sx, () => campC, { wpFormula: Fx, wpVtt: { on: () => true } }, {}, () => {}, () => 0);
        let nC = 0; const CADD = k => { nC++; const r = netC.charItem('c_1', 'f_kit', { op: 'add', defId: 'i_' + k, rowId: 'w_c' + nC, qty: 1 }); return r.ok ? 'ok' : r.error; };
        const c1 = CADD('a'), c2 = CADD('w'), c3 = CADD('l1'), n0 = sentC.length, c4 = CADD('b'), c5 = CADD('l2'); campC.chars.c_1.values.f_st = 12; const c6 = CADD('a'), c7 = CADD('l1');
        // a player's app taking index rows: a row of nine, with the real loader
        const lcSrc = between('// [netcheck:libclient-start]', '// [netcheck:libclient-end]', 'libclient'), wait0 = () => new Promise(r => setImmediate(r));
        const sentL = [], netL = { active: true, role: 'client', syncedPeer: 'h', conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sentL.push(JSON.parse(JSON.stringify(m))); } }] };
        new Function('net', 'state', 'window', 'getActiveCampaign', 'setTimeout', 'clearTimeout', lcSrc)(netL, { appState: { activeCampaignId: 'k' } }, { wpLibraryCore: Lx, wpFormula: Fx }, () => campC, () => 1, () => {});
        netL.libTake({ campId: 'k', packs: [{ id: 'p_a', name: 'A', count: 7, hash: 'aaaaaaaa' }] });
        const row = (id, more) => [id, '', id, 'Gear', '', [], '12345678'].concat(more || []);
        const load = netL.libLoad('p_a'); await wait0();
        netL.libAnswer({ type: 'lib-idx-ans', rid: sentL[sentL.length - 1].rid, packId: 'p_a', hash: 'aaaaaaaa', page: 0, pages: 1, rows: [row('i_1'), row('i_2', [null, '  ST >= 2 ']), row('i_3', [[{ id: 'i_1', name: 'x' }], 'ST >= 2']), row('i_4', [null, '1d6 > 2']), row('i_5', [null, 7]), row('i_6', ['junk', 'ST >= 2']), row('i_7', [null, 'ST >= 2', 'x'])] });
        const okL = await load, gotL = netL.libRows('p_a').map(r => [r[0], r.slice(7)]);
        check('126b the rule on the wire (the real host row branch, the real net.charItem and the real loader, with the real core): the host judges a player\'s pick by the entry\'s rule against its own copy of the character and answers char-deny with the reason of a need, storing nothing; the rule is said by its text where the players\' view of the entry holds it, in the GM\'s own words where the entry has them, and as something you do not have where the rule reads what players may not read, its text never sent; an entry of the library is judged the same way through the host\'s own copy, its rule said only as the players\' copy holds it; once the rule holds each pick goes through; a player\'s own app answers by the rule its copy holds, at once and with nothing sent, and leaves a rule it does not hold to the host; a player\'s app takes a row of nine with its rule trimmed and its needs cleaned, and leaves out whole one whose rule rolls dice or is no text, one whose eighth place is no list, and a row of ten',
            j(h1) === NO('That needs ST >= 12.') && j(h2) === NO('That needs something you do not have.') && j(h3) === NO('Be strong.') && j(h4) === NO('That needs ST >= 5.') && j(h5) === NO('That needs something you do not have.') && h6 === 'ack' && j(k0) === j(['i_c'])
            && h7 === 'ack' && h8 === 'ack' && j(h9) === NO('That needs something you do not have.') && h10 === 'ack' && h11 === 'ack' && h12 === 'ack' && j(kit()) === j(['i_c', 'i_a', 'i_l1', 'i_w', 'i_b', 'i_l2']) && !/Secret/.test(j([h2, h5, h9]))
            && c1 === 'That needs ST >= 12.' && c2 === 'Be strong.' && c3 === 'That needs ST >= 5.' && n0 === 0 && c4 === 'ok' && c5 === 'ok' && c6 === 'ok' && c7 === 'ok' && j(sentC) === j(['i_b', 'i_l2', 'i_a', 'i_l1']) && !/Secret/.test(j(view))
            && okL === true && j(gotL) === j([['i_1', []], ['i_2', [null, 'ST >= 2']], ['i_3', [[{ id: 'i_1' }], 'ST >= 2']]]),
            j([h1, h2, h4, h5, c1, c3, sentC, gotL]));
    }
    /* ---- 126b, a level's own needs on the wire (the owner: "Yes, on each need": raising a level is judged like a pick) ---- */
    {
        const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
        const ciSrc = between('// [netcheck:charitem-start]', '// [netcheck:charitem-end]', 'charitem'), dlSrc = between('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]', 'chardelta');
        const ntSrc = (() => { const i = src.indexOf('function itemNotice('), k = src.indexOf('net.syncChars = function', i); if (i < 0 || k < 0) throw new Error('netcheck: itemNotice not found'); return src.slice(i, k); })();
        const raw = { v: 1, name: 'N', rolls: [], fields: [{ id: 'f_st', key: 'ST', kind: 'number', def: 10 }, { id: 'f_sk', key: 'Skills', kind: 'item-list', list: { multi: true, lvl: { min: 0, max: 5, def: 1 } } }],
            items: [{ id: 'i_med', name: 'MED' }, { id: 'i_dark', name: 'DARK', vis: 'gm' }, { id: 'i_pow', name: 'POW', needs: [{ id: 'i_med', from: 2 }, { id: 'i_dark', from: 4 }] }, { id: 'i_rule', name: 'RULE', needsIf: 'ST >= 12', needsFrom: 3 }] };
        const sys = Sx.cleanSystem(raw, { F: Fx, gmView: true }), row = (id, lvl) => ({ id: 'w_' + id, defId: 'i_' + id, qty: 1, lvl });
        const camp = { id: 'k', system: sys, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_sk: [row('pow', 1), row('rule', 2)] } } } };
        const out = { answer: [], owner: [], notes: [], saves: 0 }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
        const conn = { peer: 'pA', send: box(out.answer) }, net = { active: true, role: 'host', paused: false, conns: [{ peer: 'pA', open: true, send: box(out.owner) }], roster: { pA: { id: 'u_a' } } };
        const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }), charChanged() {} }, wpDiceCore: null, wpLibrary: { playerEntry: () => null, entry: () => null } };
        const H = new Function('net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'toast', 'logEvent',
            'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {}, _rowGrace = {};\n' + dlSrc + '\n' + ntSrc + '\nreturn function(msg, conn) {\n' + ciSrc + '\n};')(
            net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true }, t => out.notes.push(t), () => {});
        const lvls = () => camp.chars.c_1.values.f_sk.map(r => r.defId.slice(2) + ':' + r.lvl).join(' ');
        const SET = (id, lvl) => { out.answer.length = 0; out.owner.length = 0; const s0 = out.saves; H({ type: 'char-item', rid: 'i1', charId: 'c_1', fieldId: 'f_sk', op: 'set', rowId: 'w_' + id, facts: { lvl } }, conn); return [j(out.answer), out.owner.length, out.saves - s0, lvls()]; };
        const NO = msg => j([{ type: 'char-deny', rid: 'i1', reason: 'needs', msg }]), ACK = j([{ type: 'char-ack', rid: 'i1' }]);
        const h1 = SET('pow', 2), h2 = SET('rule', 3), h3 = SET('pow', 0), h4 = SET('pow', 1);
        camp.chars.c_1.values.f_sk.push(row('med', 1)); camp.chars.c_1.values.f_st = 12;
        const h5 = SET('pow', 2), h6 = SET('pow', 3), h7 = SET('pow', 4), h8 = SET('rule', 3);
        // a player's own app: its copy of the character, with the players' view of the system
        const cA = src.indexOf('net.charItem = function('), cZ = src.indexOf('\n};\n', cA) + 3, sent = [], clSrc = src.slice(cA, cZ);
        const view = Sx.cleanSystem(JSON.parse(j(Sx.cleanSystem(raw, { F: Fx, gmView: false, needShown: id => id !== 'i_dark' }))), { F: Fx, gmView: false, needShown: true });
        const campC = { id: 'k', system: view, chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_sk: [row('pow', 1), row('rule', 2)] } } } };
        const netC = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'h', myId: 'u_a', libEntry: () => null, conns: [{ peer: 'h', open: true, send: m => { packCheck(m); sent.push(JSON.parse(JSON.stringify(m))); } }] };
        new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', clSrc)(netC, () => Sx, () => campC, { wpFormula: Fx, wpVtt: { on: () => true } }, {}, () => {}, () => 0);
        const CS = (id, lvl) => { const r = netC.charItem('c_1', 'f_sk', { op: 'set', rowId: 'w_' + id, facts: { lvl } }); return r.ok === true ? 'ok' : r.error; }, cl = () => campC.chars.c_1.values.f_sk.map(r => r.defId.slice(2) + ':' + r.lvl).join(' ');
        const c1 = CS('pow', 2), c2 = CS('rule', 3), n0 = sent.length, l0 = cl(); campC.chars.c_1.values.f_sk.push(row('med', 1)); campC.chars.c_1.values.f_st = 12;
        const c3 = CS('pow', 2), c4 = CS('rule', 3), c5 = CS('pow', 4);
        check('126b a level\'s own needs on the wire (the real host row branch and the real net.charItem, with the real core): a player\'s raise of a row\'s level past where a need begins, without carrying it, is answered char-deny with the reason needs and the words, with nothing stored, sent or saved; a rule that begins at a level refuses alike, by its text where players may read it; a level taken down and one put back below the level go through; once the character carries the need and meets the rule, each raise goes through, up to the level where a need the players may not see begins, which is refused and never named; a player\'s own app answers the same raises first, in the core\'s words, and sends nothing, and leaves to the host the need it cannot see',
            j(h1) === j([NO('That needs MED.'), 0, 0, 'pow:1 rule:2']) && j(h2) === j([NO('That needs ST >= 12.'), 0, 0, 'pow:1 rule:2']) && h3[0] === ACK && h3[3] === 'pow:0 rule:2' && h4[0] === ACK && h4[3] === 'pow:1 rule:2'
            && h5[0] === ACK && h5[2] === 1 && h6[0] === ACK && h6[3] === 'pow:3 rule:2 med:1' && j(h7) === j([NO('That needs something you do not have.'), 0, 0, 'pow:3 rule:2 med:1']) && h8[0] === ACK && h8[3] === 'pow:3 rule:3 med:1' && !/DARK|i_dark/.test(j([h1, h7]))
            && c1 === 'That needs MED.' && c2 === 'That needs ST >= 12.' && n0 === 0 && l0 === 'pow:1 rule:2' && c3 === 'ok' && c4 === 'ok' && c5 === 'ok'
            && j(sent.map(m => [m.op, m.rowId, m.facts && m.facts.lvl])) === j([['set', 'w_pow', 2], ['set', 'w_rule', 3], ['set', 'w_pow', 4]]) && !/i_dark/.test(j(view)), j([h1, h2, h5, h7, c1, c2, c5, l0]));
    }
})());
pendingChecks.push((async () => {
    /* ---- item 35, fold 1b-i: the look of a sheet's text on the wire, in messages of its own (char-style, charstyle-ack / -deny, charStyle) ---- */
    {
        const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).split(String.fromCharCode(92)).join('/');
        const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js')), Dx = await import(url('dicecore.js')), Lx = await import(url('lookcore.js'));
        const lookSrc = between('// [netcheck:charlook-start]', '// [netcheck:charlook-end]', 'charlook'), hostSrc = between('// [netcheck:charstyle-start]', '// [netcheck:charstyle-end]', 'charstyle'), inSrc = between('// [netcheck:charstylein-start]', '// [netcheck:charstylein-end]', 'charstylein');
        const RAW = { v: 1, name: 'T', rolls: [], fields: [{ id: 'f_name', key: 'Name', kind: 'text' }, { id: 'f_bio', key: 'Bio', kind: 'notes' }, { id: 'f_st', key: 'ST', kind: 'number', def: 10 }, { id: 'f_secret', key: 'Secret', kind: 'text', vis: 'gm' }, { id: 'f_gmtxt', key: 'Title', kind: 'text', edit: 'gm' }, { id: 'f_hov', key: 'Motto', kind: 'text', hover: true }] };
        const NAME = 'Bren the Bold', BIO = 'Line one\nsee https://a.example/x', sysGM = () => Sx.cleanSystem(RAW, { F: Fx, gmView: true }), sysPL = () => Sx.cleanSystem(RAW, { F: Fx, gmView: false });
        const ruleOf = fid => Sx.lookRule(Sx.fieldById(sysGM(), fid)), vals = () => ({ f_name: NAME, f_bio: BIO, f_st: 10, f_secret: 'hidden', f_gmtxt: 'GM words', f_hov: 'Onward' });
        const BOLD = Lx.makeRec({ spans: [{ s: 0, e: 4, b: true }] }, '', NAME, ruleOf('f_name')), ITAL = Lx.makeRec({ spans: [{ s: 5, e: 8, i: true }] }, '', NAME, ruleOf('f_name'));
        const LINKED = Lx.makeRec({ spans: [{ s: 0, e: 4, link: 'https://a.example/' }, { s: 5, e: 8, size: 'large' }] }, '', BIO, ruleOf('f_bio')), SECRET = Lx.makeRec({ b: true }, '', 'hidden', ruleOf('f_secret')), HOV = Lx.makeRec({ i: true }, '', 'Onward', ruleOf('f_hov'));
        const ARGS = ['net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'toast', 'Date', 'fxLib', 'itemLib', 'setTimeout', 'clearTimeout', 'state', 'campOf'];
        const BODY = "'use strict';\nvar _charSlowSaid = {}, _charHost = Object.create(null), charLimit = null;\n" + lookSrc + '\nreturn { style: function(msg, conn) {\n' + hostSrc + '\n}, inn: function(msg, conn) {\n' + inSrc + '\n}, peek: function() { return { pend: Object.keys(_stylePending), hostLook: _charHostLook, hostOk: _styleHostOk, lim: styleLimit, charLimit: charLimit }; }, hostCopy: function(id, v) { _charHost[id] = JSON.parse(JSON.stringify(v)); }, styleLay: styleLay, styleDone: styleDone, noteHostLook: noteHostLook, noteHostLooks: noteHostLooks, noteHostChar: noteHostChar, styleReset: styleReset, styleGone: styleGone, styleHostKnows: styleHostKnows };';
        const cp = v => JSON.parse(JSON.stringify(v === undefined ? null : v));
        // --- the host
        const mkHost = o => { o = o || {};
            const out = { sends: {}, saves: 0, changed: [], clock: 1000000 }, box = name => m => { packCheck(m); (out.sends[name] = out.sends[name] || []).push(cp(m)); };
            const camp = { id: 'k', system: o.noSys ? null : sysGM(), chars: { c_1: { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: vals() }, c_2: { id: 'c_2', name: 'Bo', ownerId: 'u_b', npc: false, values: vals() }, c_n: { id: 'c_n', name: 'Orc', ownerId: '', npc: true, values: vals() } } };
            const conns = ['pA', 'pA2', 'pB', 'pX', 'pC'].map(p => ({ peer: p, open: p !== 'pC', send: box(p) }));
            const net = { active: true, role: 'host', paused: false, conns, roster: { pA: { id: 'u_a' }, pA2: { id: 'u_a' }, pB: { id: 'u_b' }, pC: { id: 'u_a' } } };
            const win = { wpFormula: o.noF ? null : Fx, wpVtt: { on: () => !o.off }, wpSheets: { playerSystem: c => (c.system ? Sx.cleanSystem(c.system, { F: Fx, gmView: false }) : null), charChanged: id => out.changed.push(id) }, wpDiceCore: Dx };
            const H = new Function(...ARGS, BODY)(net, () => (o.noCore ? null : Sx), win, p => o.pPaused === p, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), () => {}, { now: () => out.clock }, () => ({}), () => ({}), () => 0, () => {}, null, null);
            const wipe = () => { Object.keys(out.sends).forEach(k => { delete out.sends[k]; }); };
            const send = (msg, peer) => { wipe(); out.clock += 150; const s0 = out.saves, c0 = out.changed.length; H.style(msg, conns.find(x => x.peer === (peer || 'pA'))); return { sends: cp(out.sends), saved: out.saves - s0, changed: out.changed.slice(c0), looks: cp(camp.chars.c_1.looks) }; };
            const sync = (id, looks) => { wipe(); net.syncCharStyle(id, looks); return cp(out.sends); };
            return { send, sync, out, camp, net, H };
        };
        const Y = (fid, look, more) => Object.assign({ type: 'char-style', rid: 'y1', charId: 'c_1', fieldId: fid, look }, more);
        const ACK = { type: 'charstyle-ack', rid: 'y1' }, TOLD = looks => ({ type: 'charStyle', campId: 'k', id: 'c_1', looks });
        const h1 = mkHost(), r1 = h1.send(Y('f_name', BOLD)), r2 = h1.send(Y('f_bio', LINKED)), r3 = h1.send(Y('f_name', null)), r4 = h1.send(Y('f_bio', null)), gone4 = h1.camp.chars.c_1.looks === undefined, r5 = h1.send(Y('f_name', null));
        check('char-style on the host (its branch run for real with the real core, the real limiter and every send packed for the wire): a player\'s look for a text of their own character is stored beside the value, saved once, acked to the sender and then told to each of the owner\'s open connections, and to nobody else: not a teammate, not a connection that was never admitted, not a closed one; a look on a notes field keeps its link and its size; null takes a look off and tells null, the last one gone leaves no key, and taking off a look that is not there is acked too',
            j(r1) === j({ sends: { pA: [ACK, TOLD({ f_name: BOLD })], pA2: [TOLD({ f_name: BOLD })] }, saved: 1, changed: ['c_1'], looks: { f_name: BOLD } })
            && j(r2) === j({ sends: { pA: [ACK, TOLD({ f_bio: LINKED })], pA2: [TOLD({ f_bio: LINKED })] }, saved: 1, changed: ['c_1'], looks: { f_name: BOLD, f_bio: LINKED } }) && LINKED.fmt.spans.length === 2 && LINKED.fmt.spans[0].link === 'https://a.example/' && LINKED.fmt.spans[1].size === 'large'
            && j(r3) === j({ sends: { pA: [ACK, TOLD({ f_name: null })], pA2: [TOLD({ f_name: null })] }, saved: 1, changed: ['c_1'], looks: { f_bio: LINKED } })
            && j(r4.sends) === j({ pA: [ACK, TOLD({ f_bio: null })], pA2: [TOLD({ f_bio: null })] }) && gone4 === true && j(r5.sends.pA[0]) === j(ACK) && h1.camp.chars.c_1.looks === undefined,
            j([r1, r2.looks, r3, r4.sends, gone4, r5.sends]));
        // every refusal: nothing stored, saved, told or redrawn; answered once to the sender alone, or not at all
        const why = (msg, o, peer) => { const h = mkHost(o); if (o && o.before) o.before(h); const r = h.send(msg, peer), mine = r.sends[peer || 'pA'] || [];
            return [mine.length === 1 && mine[0].type === 'charstyle-deny' && mine[0].rid === msg.rid && Object.keys(mine[0]).length === 3 ? mine[0].reason : mine.length ? 'odd' : 'silent', Object.keys(r.sends).length, r.saved, r.changed.length, j(r.looks), j(h.camp.chars.c_2.looks === undefined && h.camp.chars.c_n.looks === undefined)].join('|'); };
        const NO = r => r + '|1|0|0|null|true', SILENT = 'silent|0|0|0|null|true', SIZED = { fmt: { spans: [{ s: 0, e: 4, size: 'large' }] }, sig: BOLD.sig };
        const whys = { other: why(Y('f_name', BOLD, { charId: 'c_2' })), npc: why(Y('f_name', BOLD, { charId: 'c_n' })), gone: why(Y('f_name', BOLD, { charId: 'c_zz' })), number: why(Y('f_st', BOLD)), gmOnly: why(Y('f_secret', SECRET)), gmEdit: why(Y('f_gmtxt', Lx.makeRec({ b: true }, '', 'GM words', ruleOf('f_gmtxt')))), noField: why(Y('f_zzz', BOLD)),
            stale: why(Y('f_name', Lx.makeRec({ b: true }, '', 'Other words', ruleOf('f_name')))), typed: why(Y('f_name', new Uint8Array(4))), fmtList: why(Y('f_name', { fmt: [1, 2], sig: BOLD.sig })), junk: why(Y('f_name', { fmt: { b: true }, junk: 1, sig: BOLD.sig })), sized: why(Y('f_name', SIZED)), font: why(Y('f_bio', { fmt: { b: true }, font: 'Lora', sig: Lx.textSig(BIO) })),
            paused: why(Y('f_name', BOLD), { before: h => { h.net.paused = true; } }), pPaused: why(Y('f_name', BOLD), { pPaused: 'pA' }), off: why(Y('f_name', BOLD), { off: true }), noSys: why(Y('f_name', BOLD), { noSys: true }), stranger: why(Y('f_name', BOLD), {}, 'pX'), noCore: why(Y('f_name', BOLD), { noCore: true }), noF: why(Y('f_name', BOLD), { noF: true }) };
        const shapes = [Y('f_name', BOLD, { rid: '' }), Y('f_name', BOLD, { rid: 'a b' }), Y('f_name', BOLD, { rid: 7 }), Y('f_name', BOLD, { charId: 'x' }), Y('f_name', BOLD, { charId: '__proto__' }), Y('f_name', BOLD, { fieldId: 'name' }), Y('f_name', BOLD, { fieldId: 'constructor' }), Y('f_name', 'x'), Y('f_name', 7), Y('f_name', [1]), Y('f_name', true), { type: 'char-style', rid: 'y1', charId: 'c_1', fieldId: 'f_name' }].map(m => why(m));
        const fontKept = (() => { const h = mkHost(), r = h.send(Y('f_bio', { fmt: { b: true }, font: 'Lora', sig: Lx.textSig(BIO) })); return j(r.looks); })();
        check('char-style refused (each on a fresh host): another player\'s character, an NPC and one the GM never admitted are not theirs, a character that is gone is missing, a number, a GM-only text, a text only the GM edits and a field that is not there are no field of theirs, a look made for other words is stale, a typed array, a list for a format, an unknown key and a size on a one-line field are no look, a paused table and a paused player are paused, sheets off is off, no system is missing: each answered once to the sender alone in three keys, with nothing stored, saved, told or drawn; with no core or no formula engine, and for any message whose ids or look have the wrong shape, nothing at all; a font on a sheet\'s text is dropped and the rest kept',
            j(whys) === j({ other: NO('owner'), npc: NO('owner'), gone: NO('missing'), number: NO('field'), gmOnly: NO('field'), gmEdit: NO('field'), noField: NO('field'), stale: NO('stale'), typed: NO('style'), fmtList: NO('style'), junk: NO('style'), sized: NO('style'), font: 'odd|2|1|1|' + j({ f_bio: { fmt: { b: true }, sig: Lx.textSig(BIO) } }) + '|true',
                paused: NO('paused'), pPaused: NO('paused'), off: NO('off'), noSys: NO('missing'), stranger: 'owner|1|0|0|null|true', noCore: SILENT, noF: SILENT })
            && shapes.length === 12 && shapes.every(s => s === SILENT) && fontKept === j({ f_bio: { fmt: { b: true }, sig: Lx.textSig(BIO) } }),
            j([whys, shapes, fontKept]));
        // the limiter is the look's own, and the record is not read before it
        const hl = mkHost(), tally = { ack: 0, slow: 0, silent: 0 }; for (let k = 0; k < 25; k++) { const r = hl.send(Y('f_name', k % 2 ? BOLD : ITAL, { rid: 'y' + k })), m = (r.sends.pA || [])[0]; tally[!m ? 'silent' : m.type === 'charstyle-ack' ? 'ack' : m.reason] = (tally[!m ? 'silent' : m.type === 'charstyle-ack' ? 'ack' : m.reason] || 0) + 1; }
        const own26 = hl.H.peek(); hl.H.styleReset(); const fresh = (hl.send(Y('f_name', ITAL)).sends.pA || [])[0]; for (let k = 0; k < 25; k++) hl.send(Y('f_name', BOLD, { rid: 'z' + k })); hl.out.clock += Sx.LIMITS.editWindowMs + 1; const after = (hl.send(Y('f_name', BOLD)).sends.pA || [])[0];
        const hq = mkHost(), quick = [hq.send(Y('f_name', BOLD)), (() => { hq.out.clock -= 150; return hq.send(Y('f_name', ITAL, { rid: 'y2' })); })()].map(r => ((r.sends.pA || [])[0] || {}).reason || ((r.sends.pA || [])[0] || {}).type);
        const spy = { n: 0 }, peeking = () => ({ get sig() { spy.n++; return BOLD.sig; }, get fmt() { spy.n++; return BOLD.fmt; } });
        const hp = mkHost(); hp.net.paused = true; hp.send(Y('f_name', peeking())); const readPaused = spy.n; hp.net.paused = false;
        for (let k = 0; k < 20; k++) hp.send(Y('f_name', BOLD, { rid: 'y' + k })); spy.n = 0; hp.send(Y('f_name', peeking())); const readSlow = spy.n; hp.out.clock += Sx.LIMITS.editWindowMs + 1; hp.send(Y('f_name', peeking())); const readOpen = spy.n;
        check('char-style and its limiter: twenty looks in the window are taken, the next is answered slow once and the ones after it not at all, and after the window they are taken again, as they are at once at a new table; two inside a tenth of a second are one too many; the limiter is the look\'s own, so the edit path\'s is never made by a look; and a record is not read at all while the table is paused or the limiter says no: only its being an object is',
            j(tally) === j({ ack: 20, slow: 1, silent: 4 }) && own26.lim !== null && own26.charLimit === null && fresh && fresh.type === 'charstyle-ack' && after && after.type === 'charstyle-ack' && j(quick) === j(['charstyle-ack', 'slow']) && readPaused === 0 && readSlow === 0 && readOpen > 0, j([tally, quick, readPaused, readSlow, readOpen]));
        // what each connection is told is its own copy's look, never a record as handed in
        const hs = mkHost(); hs.camp.chars.c_1.looks = { f_name: BOLD, f_secret: SECRET, f_hov: HOV };
        const told1 = hs.sync('c_1', { f_name: { evil: 1 }, f_secret: SECRET, f_st: BOLD, f_hov: null, f_zzz: BOLD, constructor: BOLD, f_bio: null });
        hs.camp.chars.c_1.values.f_name = 'Bren the Bald'; const told2 = hs.sync('c_1', { f_name: BOLD });
        const told3 = [hs.sync('c_2', { f_name: null }), hs.sync('c_n', { f_name: null }), hs.sync('c_zz', { f_name: null }), hs.sync('__proto__', { f_name: null }), hs.sync('c_1', null), hs.sync('c_1', 'x'), (() => { hs.net.role = 'client'; const s = hs.sync('c_1', { f_name: null }); hs.net.role = 'host'; return s; })(), (() => { hs.net.active = false; const s = hs.sync('c_1', { f_name: null }); hs.net.active = true; return s; })()];
        check('net.syncCharStyle (run for real): the fields named are told as the look each connection\'s OWN copy holds now, or null where it holds none, so a record handed in is never sent, a look whose text changed is told as gone, a GM-only text\'s look, a number and a name that is no field are told to nobody, and a hover text\'s look goes to its owner alone: a teammate\'s copy holds no look and is told nothing; an NPC, a character that is not there, a call that names no fields, a player\'s app and a closed table send nothing',
            j(told1) === j({ pA: [TOLD({ f_name: BOLD, f_hov: HOV, f_bio: null })], pA2: [TOLD({ f_name: BOLD, f_hov: HOV, f_bio: null })] }) && j(told2) === j({ pA: [TOLD({ f_name: null })], pA2: [TOLD({ f_name: null })] })
            && j(told3[0]) === j({ pB: [{ type: 'charStyle', campId: 'k', id: 'c_2', looks: { f_name: null } }] }) && told3.slice(1).every(s => j(s) === '{}'), j([told1, told2, told3]));
        // --- a player's app
        const mkPlayer = o => { o = o || {};
            const out = { sent: [], toasts: [], results: [], changed: [], timers: [], off: false };
            const hostC = c => Sx.cleanChar(c, sysGM(), { state: 'host' }), mineSrc = Sx.charFor(hostC({ id: 'c_1', name: 'Ana', ownerId: 'u_a', values: vals(), looks: o.looks }), sysPL(), 'u_a', {}), mateSrc = Sx.charFor(hostC({ id: 'c_2', name: 'Bo', ownerId: 'u_b', values: vals(), looks: { f_hov: HOV } }), sysPL(), 'u_a', {});
            const mine = Sx.cleanChar(mineSrc, sysPL(), { state: 'owner' }), mate = Sx.cleanChar(mateSrc, sysPL(), { state: 'owner' }); mine.partial = false; mate.partial = true;
            const camp = { id: 'k', system: sysPL(), chars: { c_1: mine, c_2: mate } }, st = { appState: { activeCampaignId: 'k', campaigns: { k: camp, k2: { id: 'k2', system: sysPL(), chars: { c_1: cp(mine) } } } } };
            const net = { active: true, role: 'client', foreign: true, syncedPeer: 'h', stream: false, myId: 'u_a', conns: [{ peer: 'h', open: true, send: m => { if (out.sendFails) throw new Error('closed'); packCheck(m); out.sent.push(cp(m)); } }] };
            const win = { wpFormula: Fx, wpSystemCore: Sx, wpVtt: { on: () => !out.off }, wpSheets: { charChanged: id => out.changed.push(id), styleResult: (rid, ok, reason) => out.results.push([ok, reason]) } };
            const P = new Function(...ARGS, BODY)(net, () => Sx, win, () => false, () => camp, () => {}, e => { throw e; }, () => null, t => out.toasts.push(t), Date, () => ({}), () => ({}), (fn, ms) => { out.timers.push({ fn, ms, live: true }); return out.timers.length; }, id => { if (out.timers[id - 1]) out.timers[id - 1].live = false; }, st, id => (Object.prototype.hasOwnProperty.call(st.appState.campaigns, id) ? st.appState.campaigns[id] : null));
            P.hostCopy('c_1', mine.values); P.noteHostLooks(camp.chars); P.styleHostKnows(o.oldHost ? undefined : true);   // the host's snapshot said it knows looks (an older host's says nothing)
            return { P, net, camp, out, st, win, mate, got: (msg, peer) => P.inn(msg, { peer: peer || 'h' }), fire: n => { const t = out.timers[n]; if (t && t.live) { t.live = false; t.fn(); return true; } return false; }, look: fid => cp(camp.chars.c_1.looks ? camp.chars.c_1.looks[fid] : undefined), rid: () => out.sent[out.sent.length - 1].rid };
        };
        const p1 = mkPlayer(), s1 = p1.net.charStyle('c_1', 'f_name', BOLD), laid1 = p1.look('f_name'), sent1 = cp(p1.out.sent), t1 = p1.out.timers.map(t => [t.ms, t.live]), pend1 = p1.P.peek().pend.length;
        const errs = (() => { const e = (fn, a) => { const p = mkPlayer(); if (fn) fn(p); const r = p.net.charStyle.apply(null, a || ['c_1', 'f_name', BOLD]); return [r.error || 'ok', p.out.sent.length, p.P.peek().pend.length, j(p.look('f_name'))].join('|'); };
            return { host: e(p => { p.net.role = 'host'; }), closedTable: e(p => { p.net.active = false; }), stream: e(p => { p.net.stream = true; }), own: e(p => { p.net.foreign = false; }), unsynced: e(p => { p.net.syncedPeer = null; }), otherPeer: e(p => { p.net.syncedPeer = 'x'; }), shut: e(p => { p.net.conns[0].open = false; }), off: e(p => { p.out.off = true; }),
                mate: e(null, ['c_2', 'f_hov', HOV]), none: e(null, ['c_zz', 'f_name', BOLD]), proto: e(null, ['__proto__', 'f_name', BOLD]), npc: e(p => { p.camp.chars.c_1.npc = true; }), noSys: e(p => { p.camp.system = null; }),
                stale: e(null, ['c_1', 'f_name', Lx.makeRec({ b: true }, '', 'Other words', ruleOf('f_name'))]), sized: e(null, ['c_1', 'f_name', SIZED]), number: e(null, ['c_1', 'f_st', BOLD]), gmEdit: e(null, ['c_1', 'f_gmtxt', Lx.makeRec({ b: true }, '', 'GM words', ruleOf('f_gmtxt'))]), fails: e(p => { p.out.sendFails = true; }) }; })();
        const BAD = w => w + '|0|0|null';
        check('net.charStyle on a player\'s app (run for real): a look for a text of their own sheet is judged by the host\'s own rule, laid over at once, kept as waiting with the edit\'s five seconds and sent as one message that packs for the wire; it is refused in the app\'s own words, with nothing sent, kept or laid, on the GM\'s machine, at no table, in the stream window, before the table is taken, with the connection shut, with sheets off, for a teammate\'s copy, a character that is not there or is named by a prototype\'s key, an NPC, no system, a look made for other words, a size on a one-line field, a number and a text only the GM edits; and a send that fails puts the look back',
            j(s1) === j({ ok: true, pending: true }) && j(laid1) === j(BOLD) && sent1.length === 1 && /^y[a-z0-9]{1,8}$/.test(sent1[0].rid) && j(sent1[0]) === j({ type: 'char-style', rid: sent1[0].rid, charId: 'c_1', fieldId: 'f_name', look: BOLD }) && j(t1) === j([[Sx.LIMITS.editTimeoutMs, true]]) && pend1 === 1 && Sx.cleanCharStyle(sent1[0]) !== null
            && j(errs) === j({ host: BAD('Not at a table.'), closedTable: BAD('Not at a table.'), stream: BAD('Not at a table.'), own: BAD('Not at the table yet.'), unsynced: BAD('Not at the table yet.'), otherPeer: BAD('Not at the table yet.'), shut: BAD('Not at the table yet.'), off: BAD('Character sheets are off here.'),
                mate: BAD('That character is not yours.'), none: BAD('That character is not yours.'), proto: BAD('That character is not yours.'), npc: BAD('That character is not yours.'), noSys: BAD('No system at this table.'),
                stale: BAD('That text changed. Its look was not kept.'), sized: BAD('That look cannot be kept here.'), number: BAD('That text cannot be styled.'), gmEdit: BAD('That text cannot be styled.'), fails: BAD('Could not reach the GM.') }),
            j([s1, laid1, sent1, t1, pend1, errs]));
        // the host's answer
        const pa = mkPlayer(); pa.net.charStyle('c_1', 'f_name', BOLD); const ridA = pa.rid(); pa.got({ type: 'charstyle-ack', rid: ridA }, 'x'); const wrongPeer = pa.P.peek().pend.length; pa.net.stream = true; pa.got({ type: 'charstyle-ack', rid: ridA }); const inStream = pa.P.peek().pend.length; pa.net.stream = false;
        ['nope', 'constructor', '__proto__', 7, null].forEach(r => pa.got({ type: 'charstyle-ack', rid: r })); const oddRid = pa.P.peek().pend.length; pa.got({ type: 'charstyle-ack', rid: ridA });
        const acked = [pa.P.peek().pend.length, j(pa.look('f_name')), j(pa.P.peek().hostLook.c_1), pa.out.timers[0].live, pa.out.results.length, pa.out.toasts.length, pa.P.peek().hostOk];
        const pd = mkPlayer({ looks: { f_name: ITAL } }); pd.net.charStyle('c_1', 'f_name', BOLD); const before = j(pd.look('f_name')); pd.got({ type: 'charstyle-deny', rid: pd.rid(), reason: 'stale' }); const denied = [j(pd.look('f_name')), j(pd.out.results), pd.P.peek().pend.length, pd.out.toasts.length];
        pd.net.charStyle('c_1', 'f_name', null); const offNow = pd.look('f_name'); pd.got({ type: 'charstyle-deny', rid: pd.rid(), reason: 'constructor' }); const denied2 = [j(pd.look('f_name')), j(pd.out.results[1])];
        check('a look\'s answer on a player\'s app (the client branch run for real): an ack from the synced host lets go of the waiting look and keeps what was sent as the host\'s; one from another connection, in the stream window, or for a request id that is not waiting or that a prototype holds changes nothing; a refusal puts back the look the host last said the text has and says why once, a reason that is no reason read as a value refused; nothing is said for a look that was kept',
            wrongPeer === 1 && inStream === 1 && oddRid === 1 && j(acked) === j([0, j(BOLD), j({ f_name: BOLD }), false, 0, 0, true]) && before === j(BOLD) && j(denied) === j([j(ITAL), j([[false, 'stale']]), 0, 0]) && offNow === null && j(denied2) === j([j(ITAL), j([false, 'value'])]), j([wrongPeer, inStream, oddRid, acked, before, denied, offNow, denied2]));
        // silence, and a host from before text looks: the host says in its snapshot that it knows them, so nothing is guessed
        const OLD = 'The GM\'s Waypoint is older than yours. It keeps no text style on sheets.';
        const pt = mkPlayer(); pt.net.charStyle('c_1', 'f_name', BOLD); pt.fire(0); const quiet1 = [j(pt.look('f_name')), pt.out.toasts.length, j(pt.out.results), pt.P.peek().pend.length];
        pt.net.charStyle('c_1', 'f_name', BOLD); pt.got({ type: 'charstyle-ack', rid: pt.rid() }); const lateFire = pt.fire(1); pt.net.charStyle('c_1', 'f_name', ITAL); pt.fire(2); const quiet3 = [j(pt.look('f_name')), pt.out.toasts.length, j(pt.out.results)];
        const po = mkPlayer({ oldHost: true }), oldTry = [po.net.charStyle('c_1', 'f_name', BOLD), po.net.charStyle('c_1', 'f_name', null)].map(r => r.error), oldState = [po.out.sent.length, po.P.peek().pend.length, po.out.timers.length, po.look('f_name'), po.net.looksOk()];
        const flags = [undefined, null, false, 1, 'true', {}, []].map(v => { const p = mkPlayer(); p.P.styleHostKnows(v); return p.net.looksOk(); });
        const okNow = (() => { const p = mkPlayer(), a = p.net.looksOk(); p.P.styleReset(); const b = p.net.looksOk(); p.net.role = 'host'; const c = p.net.looksOk(); p.net.role = null; return [a, b, c, p.net.looksOk()]; })();
        check('a look the host never answers, and a host from before text looks (run for real): at a host that said in its snapshot that it knows looks, a look unanswered after the edit\'s five seconds goes back to what the host last said and is said as any unanswered change is, every time, and a timer whose look was answered is dead; at a host that said nothing, no look is sent, laid or waited for, and the app says at once that the GM\'s Waypoint is older, for a look set and for one taken off; only true counts as that word, a new session forgets it, and the machine that owns the campaign needs none',
            j(quiet1) === j(['null', 0, j([[false, 'timeout']]), 0]) && lateFire === false && j(quiet3) === j([j(BOLD), 0, j([[false, 'timeout'], [false, 'timeout']])]) && j(oldTry) === j([OLD, OLD]) && j(oldState) === j([0, 0, 0, null, false]) && flags.every(v => v === false) && j(okNow) === j([true, false, true, true]),
            j([quiet1, lateFire, quiet3, oldTry, oldState, flags, okNow]));
        // the host's word on looks
        const TELL = (looks, more) => Object.assign({ type: 'charStyle', campId: 'k', id: 'c_1', looks }, more);
        const pc = mkPlayer(); pc.got(TELL({ f_name: BOLD, f_bio: LINKED })); const took = [j(pc.look('f_name')), j(pc.look('f_bio')), j(pc.out.changed)];
        pc.got(TELL({ f_name: { fmt: { b: true }, sig: '5:00000000' } })); const staleIn = pc.look('f_name'); pc.got(TELL({ f_name: BOLD })); pc.got(TELL({ f_name: { fmt: [1], sig: BOLD.sig } })); const hostileIn = pc.look('f_name'); pc.got(TELL({ f_name: BOLD })); pc.got(TELL({ f_name: null })); const nullIn = [pc.look('f_name'), j(pc.look('f_bio'))];
        const protoBefore = j(Object.keys(Object.prototype)); pc.got(TELL(JSON.parse('{"__proto__":' + j(BOLD) + ',"constructor":' + j(BOLD) + ',"f_secret":' + j(SECRET) + ',"f_zzz":' + j(BOLD) + ',"f_st":' + j(BOLD) + '}'))); const oddKeys = [j(pc.camp.chars.c_1.looks), j(Object.keys(Object.prototype)) === protoBefore, ({}).fmt === undefined];
        const idle = (() => { const p = mkPlayer({ looks: { f_name: ITAL } }), was = () => j([p.camp.chars.c_1.looks, p.camp.chars.c_2.looks, p.P.peek().hostLook, p.st.appState.campaigns.k2.chars.c_1.looks]), w0 = was(), n0 = p.out.changed.length;
            p.got(TELL({ f_name: BOLD }), 'x'); p.net.stream = true; p.got(TELL({ f_name: BOLD })); p.net.stream = false; p.net.foreign = false; p.got(TELL({ f_name: BOLD })); p.net.foreign = true; p.camp.chars.c_1.partial = true; p.got(TELL({ f_name: BOLD })); p.camp.chars.c_1.partial = false;
            [TELL({ f_name: BOLD }, { campId: 'other' }), TELL({ f_name: BOLD }, { campId: 'k2' }), TELL({ f_name: BOLD }, { campId: 7 }), TELL({ f_hov: HOV }, { id: 'c_2' }), TELL({ f_name: BOLD }, { id: 'c_zz' }), TELL({ f_name: BOLD }, { id: '__proto__' }), TELL({ f_name: BOLD }, { id: 7 }), TELL([BOLD]), TELL('x'), TELL(null), TELL(undefined)].forEach(m => p.got(m));
            p.win.wpSystemCore = null; p.got(TELL({ f_name: BOLD })); p.win.wpSystemCore = Sx; return [was() === w0, p.out.changed.length - n0]; })();
        check('charStyle on a player\'s app (the client branch run for real): a look from the synced host is cleaned again, against the text the host last said the field holds and by this app\'s own rule, and kept beside the value; a look made for other words, a record of the wrong shape and null leave the field with no look, and the other fields as they were; a name that is a prototype\'s key, a GM-only field\'s, a number\'s and one that is no field are passed over and write nothing anywhere; and nothing at all is taken from another connection, in the stream window, at a table of one\'s own, for another campaign though the app holds it, for a teammate\'s copy, for our own copy while it is marked a teammate\'s or a character that is not there, from a list, a word or nothing in place of the looks, or with no core',
            j(took) === j([j(BOLD), j(LINKED), j(['c_1'])]) && staleIn === null && hostileIn === null && j(nullIn) === j([null, j(LINKED)]) && j(oddKeys) === j([j({ f_bio: LINKED }), true, true]) && j(idle) === j([true, 0]), j([took, staleIn, hostileIn, nullIn, oddKeys, idle]));
        // a waiting look is never taken off by an older word of the host's; the looks follow the text
        const pw = mkPlayer(); pw.net.charStyle('c_1', 'f_name', ITAL); const ridW = pw.rid(); pw.got(TELL({ f_name: BOLD })); const held = [j(pw.look('f_name')), j(pw.P.peek().hostLook.c_1)]; pw.got({ type: 'charstyle-deny', rid: ridW, reason: 'slow' }); const fellBack = j(pw.look('f_name'));
        const ph = mkPlayer(); ph.camp.chars.c_1.values.f_name = 'Bren the Bald'; ph.got(TELL({ f_name: BOLD })); const during = [ph.look('f_name'), j(ph.P.peek().hostLook.c_1)]; ph.camp.chars.c_1.values.f_name = NAME; ph.P.styleLay('c_1'); const afterBack = j(ph.look('f_name'));
        const pm = mkPlayer({ looks: { f_name: BOLD } }); pm.camp.chars.c_1.values.f_name = 'Bren the Bald'; pm.P.styleLay('c_1'); const moved = pm.look('f_name'); pm.camp.chars.c_1.values.f_name = NAME; pm.P.styleLay('c_1'); const back = j(pm.look('f_name'));
        pm.net.charStyle('c_1', 'f_name', ITAL); pm.camp.chars.c_1.ownerId = 'u_b'; pm.P.styleLay('c_1'); const notOurs = [pm.P.peek().pend.length, pm.out.timers[0].live, 'looks' in pm.camp.chars.c_1]; pm.camp.chars.c_1.ownerId = 'u_a';
        const pf = mkPlayer({ looks: { f_name: BOLD, f_bio: LINKED } }), hostSays = t => { pf.P.hostCopy('c_1', Object.assign({}, vals(), { f_name: t })); pf.camp.chars.c_1.values.f_name = t; pf.P.styleLay('c_1'); return [pf.look('f_name'), j(pf.P.peek().hostLook.c_1)]; };
        const forgot = [hostSays('Bren the Bald'), hostSays(NAME)];   // the host's text changed, and then is the old words again: the look made for them is gone for good
        const pg = mkPlayer({ looks: { f_name: BOLD } }); pg.net.charStyle('c_1', 'f_name', ITAL); pg.P.styleGone('c_1'); const gone = [pg.P.peek().pend.length, pg.out.timers[0].live, pg.P.peek().hostLook.c_1 === undefined, pg.fire(0), pg.out.toasts.length];
        const pr = mkPlayer({ looks: { f_name: BOLD } }); pr.net.charStyle('c_1', 'f_name', ITAL); pr.got({ type: 'charstyle-ack', rid: pr.rid() }); pr.net.charStyle('c_1', 'f_name', BOLD); pr.P.styleReset(); const reset = [pr.P.peek().pend.length, Object.keys(pr.P.peek().hostLook).length, pr.P.peek().hostOk, pr.out.timers[1].live];
        const strangers = { c_2: pr.mate, c_9: { id: 'c_9', ownerId: 'u_a', partial: false, looks: { f_x: 1 } }, c_8: { id: 'c_8', ownerId: 'u_a', partial: true, looks: { f_x: 1 } }, c_7: { id: 'c_7', ownerId: 'u_b', partial: false, looks: { f_x: 1 } }, c_6: { id: 'c_6', ownerId: 'u_a', npc: true, partial: false, looks: { f_x: 1 } }, c_5: { id: 'c_5', ownerId: '', partial: false, looks: { f_x: 1 } } };
        pr.P.noteHostLook('c_1', { f_name: BOLD }); pr.P.noteHostLooks(strangers); const notedAll = j(pr.P.peek().hostLook), stripped = j(['c_9', 'c_8', 'c_7', 'c_6', 'c_5'].map(id => 'looks' in strangers[id])); pr.P.noteHostLook('c_9', null); pr.P.noteHostLook(7, { a: 1 }); pr.P.noteHostChar(null); pr.P.noteHostChar({ id: 7, ownerId: 'u_a', looks: { f_x: 1 } }); const noted = j(pr.P.peek().hostLook);
        check('a player\'s looks as they stand (styleLay and its kin, run for real): while a look waits for the host\'s answer, the host\'s word on that field is noted and the waiting look stays, and a refusal then falls back to that word; a look the host tells while the text has a change of its own waiting here is judged against the text the host last said, kept as its word though it fits no text the app holds yet, and is there once the text is back; once the text the HOST holds is another, its word for the old one is forgotten for good, so the old words typed again find no look, and the other fields keep theirs; a text that changed under a look leaves the field plain, and the look is back when the text is; a copy that is no longer ours lets go of its waiting looks and their timers; a character that went takes its waiting looks, their timers and the host\'s word with it, and says nothing later; a new session forgets every waiting look, every word of the host\'s and that the host knows looks; the host\'s looks are noted for whole copies of our own only, and taken off every other copy: a teammate\'s, a whole copy that is someone else\'s, an NPC\'s and one that is nobody\'s',
            j(held) === j([j(ITAL), j({ f_name: BOLD })]) && fellBack === j(BOLD) && j(during) === j([null, j({ f_name: BOLD })]) && afterBack === j(BOLD) && j(forgot) === j([[null, j({ f_bio: LINKED })], [null, j({ f_bio: LINKED })]]) && moved === null && back === j(BOLD) && j(notOurs) === j([0, false, false]) && j(gone) === j([0, false, true, false, 0]) && j(reset) === j([0, 0, false, false]) && notedAll === j({ c_9: { f_x: 1 } }) && stripped === j([true, false, false, false, false]) && noted === '{}', j([held, fellBack, moved, back, notOurs, gone, reset, notedAll, stripped, noted]));
        // both ends together: what the player sent is what the host keeps and what the player then holds
        const eh = mkHost(), ep = mkPlayer(); ep.net.charStyle('c_1', 'f_bio', LINKED); const wire = eh.send(ep.out.sent[0]); (wire.sends.pA || []).forEach(m => ep.got(m));
        const ends = [j(eh.camp.chars.c_1.looks), j(ep.camp.chars.c_1.looks), ep.P.peek().pend.length, j(ep.P.peek().hostLook.c_1), ep.out.results.length, ep.out.toasts.length];
        ep.net.charStyle('c_1', 'f_bio', null); (eh.send(ep.out.sent[1]).sends.pA || []).forEach(m => ep.got(m)); const endsOff = [eh.camp.chars.c_1.looks === undefined, ep.camp.chars.c_1.looks === undefined, ep.P.peek().pend.length];
        check('a look end to end (a player\'s app and the host, both run for real, the message of each fed to the other): the host keeps exactly the record the player sent, the player holds it as the host\'s once the answer and the host\'s word are in, nothing waits and nothing is said; taking it off again leaves neither side a key',
            j(ends) === j([j({ f_bio: LINKED }), j({ f_bio: LINKED }), 0, j({ f_bio: LINKED }), 0, 0]) && j(endsOff) === j([true, true, 0]), j([ends, endsOff]));
        // wired
        const pendSrc = between('// [netcheck:pending-start]', '// [netcheck:pending-end]', 'pending'), chinSrc = between('// [netcheck:charin-start]', '// [netcheck:charin-end]', 'charin'), ord = (s, list) => list.map(x => s.indexOf(x)), rising = a => a.every((v, k) => v >= 0 && (k === 0 || v > a[k - 1]));
        // --- the whole path of a player's app, driven by messages alone (the review of 3128b34): the pending and charin slices beside the look's own,
        // with the real net.charEdit. Nothing is set by hand, and what a reader would draw is asked of the real cleaner
        const editSrc = (() => { const i = src.indexOf('net.charEdit = function(charId, fieldId, value) {'), k = src.indexOf('\n};\n', i); if (i < 0 || k < 0) throw new Error('netcheck: net.charEdit not found'); return src.slice(i, k + 4); })();
        const BODY2 = "'use strict';\nvar _charSlowSaid = {}, _charHost = Object.create(null), _charPending = Object.create(null), charLimit = null;\n" + lookSrc + '\n' + pendSrc + '\n' + editSrc + '\nreturn { got: function(msg, conn) { if (msg.type === "charStyle" || msg.type === "charstyle-ack" || msg.type === "charstyle-deny") { (function() {\n' + inSrc + '\n})(); } else { (function() {\n' + chinSrc + '\n})(); } }, peek: function() { return { pend: Object.keys(_stylePending), edits: Object.keys(_charPending), hostLook: _charHostLook, host: _charHost, hostOk: _styleHostOk }; }, knows: styleHostKnows };';
        const mkWhole = () => { const out = { sent: [], toasts: [], results: [], changed: [], gone: [], timers: [] }, camp = { id: 'k', system: sysPL(), chars: {} }, st = { appState: { activeCampaignId: 'k', campaigns: { k: camp } } };
            const net = { active: true, role: 'client', foreign: true, syncedPeer: 'h', stream: false, myId: 'u_a', libEntry: () => null, conns: [{ peer: 'h', open: true, send: m => { packCheck(m); out.sent.push(cp(m)); } }] };
            const win = { wpFormula: Fx, wpSystemCore: Sx, wpVtt: { on: () => true }, wpSheets: { charChanged: id => out.changed.push(id), charGone: id => out.gone.push(id), editResult: (rid, ok, reason) => out.results.push(['edit', ok, reason]), styleResult: (rid, ok, reason) => out.results.push(['style', ok, reason]) } };
            const W = new Function(...ARGS, BODY2)(net, () => Sx, win, () => false, () => camp, () => {}, e => { throw e; }, () => null, t => out.toasts.push(t), Date, () => ({}), () => ({}), (fn, ms) => { out.timers.push({ fn, ms, live: true }); return out.timers.length; }, id => { if (out.timers[id - 1]) out.timers[id - 1].live = false; }, st, id => (Object.prototype.hasOwnProperty.call(st.appState.campaigns, id) ? st.appState.campaigns[id] : null));
            W.knows(true);
            const hostC = (id, owner, looks) => Sx.cleanChar({ id, name: id, ownerId: owner, values: vals(), looks }, sysGM(), { state: 'host' }), copyFor = c => Sx.charFor(c, sysPL(), 'u_a', {});
            const c1 = () => camp.chars.c_1, shown = fid => { const c = c1(), l = c ? Sx.cleanLooks(c.looks, c.values || {}, camp.system) : null; return l && l[fid] ? j(l[fid]) : null; };
            const fire = n => { const t = out.timers[n]; if (t && t.live) { t.live = false; t.fn(); return true; } return false; }, last = type => { for (let k = out.sent.length - 1; k >= 0; k--) if (out.sent[k].type === type) return out.sent[k]; return null; };
            return { W, net, camp, out, got: m => W.got(m, { peer: 'h' }), c1, shown, fire, last, hostC, copyFor }; };
        const w = mkWhole(), HOSTILE_MATE = Object.assign({}, w.copyFor(w.hostC('c_2', 'u_b')), { looks: { f_hov: HOV } }), HOSTILE_OTHER = Object.assign({}, w.copyFor(w.hostC('c_3', 'u_b')), { partial: false, values: vals(), looks: { f_name: BOLD } });
        const DENY = () => ({ type: 'char-deny', rid: w.last('char-edit').rid, reason: 'field' }), CHAR = looks => ({ type: 'char', campId: 'k', char: w.copyFor(w.hostC('c_1', 'u_a', looks)) }), DELTA = t => ({ type: 'charDelta', campId: 'k', id: 'c_1', values: { f_name: t } });
        w.got({ type: 'chars', campId: 'k', chars: { c_1: w.copyFor(w.hostC('c_1', 'u_a', { f_name: BOLD })), c_2: HOSTILE_MATE, c_3: HOSTILE_OTHER } });
        const start = [w.shown('f_name'), 'looks' in w.camp.chars.c_2, 'looks' in w.camp.chars.c_3, Object.keys(w.W.peek().hostLook).join(), w.camp.chars.c_2.partial, w.camp.chars.c_3.partial, w.camp.chars.c_3.values.f_name];
        w.net.charEdit('c_1', 'f_name', 'Bren the Bald'); const waiting = [w.c1().values.f_name, w.shown('f_name'), w.W.peek().edits.length]; w.got(DENY()); const deniedE = [w.c1().values.f_name, w.shown('f_name'), w.W.peek().edits.length];
        w.net.charEdit('c_1', 'f_name', 'Bren the Bald'); const midT = w.shown('f_name'); w.fire(w.out.timers.length - 1); const timedE = [midT, w.c1().values.f_name, w.shown('f_name')];
        w.got(DELTA('Bren the Bald')); const away = [w.shown('f_name'), j(w.W.peek().hostLook.c_1 || null)]; w.got(DELTA(NAME)); const backAgain = [w.c1().values.f_name, w.shown('f_name')];
        w.got(CHAR({ f_name: ITAL })); const freshLook = w.shown('f_name'); w.net.charEdit('c_1', 'f_name', 'A new name'); w.got(CHAR({ f_name: BOLD })); const mid = [w.c1().values.f_name, w.shown('f_name'), j(w.W.peek().hostLook.c_1)]; w.got(DENY()); const afterWhole = [w.c1().values.f_name, w.shown('f_name')];
        w.got({ type: 'char', campId: 'k', char: Object.assign({}, HOSTILE_MATE) }); w.got({ type: 'char', campId: 'k', char: Object.assign({}, HOSTILE_OTHER) }); const single = ['looks' in w.camp.chars.c_2, 'looks' in w.camp.chars.c_3, Object.keys(w.W.peek().hostLook).join()];
        w.got(CHAR()); w.net.charStyle('c_1', 'f_name', ITAL); const tS = w.out.timers.length - 1, beforeGone = [w.W.peek().pend.length, w.out.timers[tS].live, w.shown('f_name')]; w.got({ type: 'charGone', campId: 'k', id: 'c_1' }); const goneW = [w.W.peek().pend.length, w.out.timers[tS].live, 'c_1' in w.W.peek().hostLook, w.fire(tS), 'c_1' in w.camp.chars, j(w.out.gone)];
        const g = mkWhole(); g.got({ type: 'chars', campId: 'k', chars: { c_1: g.copyFor(g.hostC('c_1', 'u_a', { f_name: BOLD })) } }); g.net.charStyle('c_1', 'f_name', ITAL); g.got({ type: 'chars', campId: 'k', chars: { c_1: Object.assign({}, g.copyFor(g.hostC('c_1', 'u_b')), { looks: { f_hov: HOV } }) } });
        const givenAway = ['looks' in g.camp.chars.c_1, g.camp.chars.c_1.partial, g.W.peek().pend.length, g.out.timers[0].live, Object.keys(g.W.peek().hostLook).length];
        const g2 = mkWhole(); g2.got({ type: 'chars', campId: 'k', chars: { c_1: g2.copyFor(g2.hostC('c_1', 'u_a', { f_name: BOLD })) } }); const had = Object.keys(g2.W.peek().hostLook).join(); g2.got({ type: 'char', campId: 'k', char: Object.assign({}, g2.copyFor(g2.hostC('c_1', 'u_b')), { looks: { f_hov: HOV } }) });
        const givenSingle = [had, 'looks' in g2.camp.chars.c_1, Object.keys(g2.W.peek().hostLook).length];
        check('a player\'s app end to end, driven by messages alone (the pending and charin slices beside the look\'s own, with the real net.charEdit; what a reader would draw asked of the real cleaner): a look arrives with a whole copy of our own, and a look a host lays on a teammate\'s hover copy or on a whole copy that is someone else\'s is taken off, in a list of copies and in a single one, and never noted as the host\'s word; while a text change of ours waits the field draws plain, and a refusal or a silence brings the old look back with the old text; once the HOST changes the text its word for the old one is forgotten, and the old words back find no look; a newer whole copy that arrives while a change of ours waits is noted before the waiting change is laid over it, so a refusal then falls back to the newer look; a character that went takes its waiting look, the timer and the host\'s word with it; a character given to someone else loses its looks and its waiting looks at once',
            j(start) === j([j(BOLD), false, false, 'c_1', true, false, NAME]) && j(waiting) === j(['Bren the Bald', null, 1]) && j(deniedE) === j([NAME, j(BOLD), 0]) && j(timedE) === j([null, NAME, j(BOLD)]) && j(away) === j([null, 'null']) && j(backAgain) === j([NAME, null])
            && freshLook === j(ITAL) && j(mid) === j(['A new name', null, j({ f_name: BOLD })]) && j(afterWhole) === j([NAME, j(BOLD)]) && j(single) === j([false, false, 'c_1']) && j(beforeGone) === j([1, true, j(ITAL)]) && j(goneW) === j([0, false, false, false, false, j(['c_1'])]) && j(givenAway) === j([false, true, 0, false, 0]) && j(givenSingle) === j(['c_1', false, 0]),
            j([start, waiting, deniedE, timedE, away, backAgain, freshLook, mid, afterWhole, single, beforeGone, goneW, givenAway, givenSingle]));
        const gates = ord(hostSrc, ['Sy.cleanCharStyle(msg)', "denyY('paused')", 'styleLimit.allow(conn.peer', "denyY('off')", "denyY('missing')", "denyY('owner')", 'Sy.applyStyle(', 'chY.looks[qy.fieldId] = resY.look', 'saveRemoteSoon();', "type: 'charstyle-ack'", 'net.syncCharStyle(qy.charId']);
        check('char-style (wired, pinned): the host\'s branch is one, between its markers, with char-edit\'s gates in char-edit\'s order (the ids\' shape, the pause, the limiter, the feature, the character by its own key, whose it is) before the record is judged, then stored, saved, acked and told; it names neither the edit path\'s limiter nor its delta, nor the request\'s own word for the look after the cleaner; a player\'s app takes the three new kinds in one branch under the very guard line a character\'s values have; the looks are noted with each whole copy before the waiting changes are laid over it, at the snapshot, and let go with a character that went and at a new session, each through typeof inside the slices other suites run alone; nothing after the host\'s word is read, to the end of applySnapshot, wipes it or reads it again',
            rising(gates) && src.split("msg.type === 'char-style' && net.role === 'host'").length === 2 && !/charLimit|syncCharDelta|msg\.look/.test(hostSrc) && src.split("(msg.type === 'charStyle' || msg.type === 'charstyle-ack' || msg.type === 'charstyle-deny') && net.role === 'client'").length === 2
            && inSrc.includes('if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || !window.wpSystemCore) return;') && chinSrc.includes('if (!net.foreign || conn.peer !== net.syncedPeer || net.stream || !window.wpSystemCore) return;')
            && pendSrc.includes("    if (typeof styleLay === 'function') styleLay(charId);") && chinSrc.includes("if (typeof noteHostLooks === 'function') noteHostLooks(outC);") && chinSrc.indexOf('noteHostLooks(outC)') < chinSrc.indexOf('Object.keys(outC).forEach(reapplyPending)')
            && chinSrc.includes("if (typeof noteHostChar === 'function') noteHostChar(c1); if (c1.partial || c1.ownerId !== net.myId) dropP(c1.id);") && /\n    if \(typeof styleLay === 'function'\) styleLay\(charId\);[^\n]*\n\}\nfunction noteHostCopy\(/.test(pendSrc) && chinSrc.includes("delete _charHost[msg.id]; if (typeof styleGone === 'function') styleGone(msg.id);")
            && /noteHostCopy\(id, cs\.chars\[id\]\.values\); \}\); \}\);[^\n]*\n    if \(typeof noteHostChar === 'function'\) Object\.values\(state\.appState\.campaigns \|\| \{\}\)\.forEach\(function\(cs\) \{[^\n]*noteHostChar\(cs\.chars\[id\]\);/.test(require('./checkkit').part('netfog.js'))
            && src.includes("if (charLimit) charLimit.reset(); if (typeof styleReset === 'function') styleReset(); }") && /noteHostChar\(cs\.chars\[id\]\); \}\); \}\);[^\n]*\n    if \(typeof styleHostKnows === 'function'\) styleHostKnows\(msg\.looks\);/.test(require('./checkkit').part('netfog.js')) && /combats: combatsFor\(prof\.id, prof\.location\), fights: true, looks: true, rowText: true, notepad: notepadMsg\(\) \}; if \(sheetFilesHere\(\)\) snap\.sheetFiles = true; var soSnap = [^\n]*?snap\.sheetOut = soSnap; gmSignSnap\(snap, conn\); \};/.test(src) && !/_styleKnown|_styleOldSaid|styleHeard/.test(src)
            && (() => { const sp = require('./checkkit').part('netfog.js'), a0 = sp.indexOf('function applySnapshot(msg) {'), a = sp.indexOf('styleHostKnows(msg.looks);'), z = a < 0 ? -1 : sp.indexOf('\n}\n', a), tail = a0 >= 0 && a > a0 && z > a ? sp.slice(a + 26, z) : 'styleReset('; return require('./checkkit').familyCount('net.js', 'styleHostKnows(msg.looks)') === 1 && sp.slice(a0, a).indexOf('\n}\n') < 0 && !/styleReset\(|charSessionReset\(|diceSessionReset\(|leaveSession\(|_styleHostOk|styleHostKnows\(/.test(tail); })() && src.split('net.syncCharStyle(').length === 2 && src.split('net.charStyle = function(').length === 2, j(gates));
    }
})());
    /* ---- 1.5.6, the damage step on the wire: the host's char-damage branch, net.damageCard and net.charDamage, run for real ---- */
    pendingChecks.push((async () => {
        const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
        const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
        const nsD = src.split('\r\n').join('\n'), cut =(a, b) => { const i = nsD.indexOf(a), k = nsD.indexOf(b, i); if (i < 0 || k < 0) throw new Error('damage slice ' + a.slice(0, 40)); return nsD.slice(i, k); };
        const brD = cut('        // [netcheck:chardamage-start]', '        // [netcheck:chardamage-end]'), dlD = cut('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]');
        const cardD = cut('net.damageCard = function(ch, lines, name) {', /* 1.6.3 (the release click test): its third argument, a name for the line (moved on purpose) */ '// Turn-based combat T2 (owner, 2026-09-26)'), sendD = cut('net.charDamage = function(charId, q) {', '// 1.5.6, the damage step: what a blow did');
        const sysD = Sx.cleanSystem({ v: 1, name: 'D', rolls: [], fields: [
            { id: 'f_hp', key: 'HP', label: 'Hit Points', kind: 'resource', maxFormula: '12', def: 'max', min: -50, edit: 'owner', vis: 'all' },
            { id: 'f_ep', key: 'EP', label: 'Endurance', kind: 'resource', maxFormula: '10', def: 'max', min: 0, edit: 'owner', vis: 'all' },
            { id: 'f_locs', key: 'Locs', label: 'Locations', kind: 'item-list', edit: 'owner', vis: 'all', list: { stats: [{ key: 'loc', label: 'Loc' }, { key: 'nat', label: 'Natural' }], cols: [{ key: 'DR', label: 'DR', formula: 'Row.nat + if(Row.loc = 3, Kit.on.drBody, 0)' }] } },
            { id: 'f_kit', key: 'Kit', label: 'Kit', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Worn' }, stats: [{ key: 'drBody', label: 'Body' }, { key: 'wear', label: 'Wear' }] } }],
            items: [{ id: 'i_body', name: 'Body', stats: { loc: 3, nat: 0 } }, { id: 'i_plate', name: 'Plate', stats: { drBody: 6 } }],
            combat: { hpResource: 'f_hp', damage: { pool: 'f_hp', major: 'HP.max / 2', locs: { list: 'f_locs', dr: 'DR' }, types: [{ key: 'cut', label: 'Cutting', mult: 1.5 }, { key: 'stun', label: 'Stun', pool: 'f_ep', noWear: true }], layers: [{ list: 'f_kit', at: 'if(Hit.loc = 3, Row.drBody, 0)', wear: 'wear' }] } } }, { F: Fx, gmView: true });
        const START = () => ({ f_locs: [{ defId: 'i_body', qty: 1 }], f_kit: [{ defId: 'i_plate', qty: 1, on: true }] });
        const runD = (msg, o) => {
            o = o || {};
            const camp = { id: 'k', system: o.sys || sysD, items: {}, chars: { c_1: { id: 'c_1', name: 'Kael', ownerId: 'u_a', npc: false, values: START() }, c_2: { id: 'c_2', name: 'Pebbles', ownerId: 'u_b', npc: false, values: START() }, c_3: { id: 'c_3', name: 'Grunt', npc: true, values: START() } } };
            const out = { owner: [], mate: [], chat: [], logs: [], saves: 0, changed: [] }, box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
            const conns = [{ peer: 'pA', open: true, send: box(out.owner) }, { peer: 'pB', open: true, send: box(out.mate) }];
            const net = { active: true, role: 'host', paused: !!o.paused, combats: {}, conns, myId: 'gm', roster: { pA: { id: 'u_a', name: 'Kael P' }, pB: { id: 'u_b', name: 'Bo P' } } };
            const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { charChanged(id) { out.changed.push(id); }, playerSystem: c => Sx.cleanSystem(c.system, { F: Fx, gmView: false }) }, wpDiceCore: null };
            new Function('msg', 'conn', 'net', 'SC', 'window', 'peerPaused', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'lim', 'own', 'pushChat', 'logEvent',
                'var charLimit = lim, _charSlowSaid = {}, _charPending = {}, _charHost = {};\n' + dlD + '\n' + cardD + '\nif (msg.type === "char-damage" && net.role === "host") {\n' + brD + '\n}')(
                msg, conns[0], net, () => Sx, win, () => false, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), { allow: () => true },
                (ob, k) => !!ob && Object.prototype.hasOwnProperty.call(ob, k), m => out.chat.push(JSON.parse(JSON.stringify(m))), (k, tx) => out.logs.push([k, tx]));
            out.camp = camp; return out;
        };
        const typ = list => list.map(m => m.type + (m.reason ? ':' + m.reason : ''));
        const SCd = Sx, hp = (c) => SCd.makeResolver(sysD, c, Fx)('hp'), wear = (c) => { const r = c.values.f_kit[0]; return r.ov && r.ov.stats ? r.ov.stats.wear : undefined; };
        const okT = runD({ type: 'char-damage', rid: 'd2', charId: 'c_1', amt: 14, dtype: 'cut', loc: 'w_body' }), okS = runD({ type: 'char-damage', rid: 'd2', charId: 'c_1', amt: 10, dtype: 'stun', loc: 'w_body' });
        check('1.5.6 the damage step (the host, char-damage run for real): the owner\'s blow on their own character is worked out with the GM\'s full system, stored (HP 12, DR 6 at the body: cut: 8 through x1.5, 12 HP, a Major Wound, the worn plate loses a quarter of 6 rounded up, 2), saved once, acked once, its delta to the owner, the sheet told, and the line said to the GM and to the owner alone, not the other player; a stun of 10 against DR 6 takes 4 EP and wears nothing',
            hp(okT.camp.chars.c_1) === 0 && SCd.makeResolver(sysD, okS.camp.chars.c_1, Fx)("ep") === 6 && hp(okS.camp.chars.c_1) === 12 && wear(okS.camp.chars.c_1) === undefined && wear(okT.camp.chars.c_1) === 2 && okT.saves === 1 && j(typ(okT.owner).filter(x => x !== 'charDelta')) === j(['char-ack', 'chat']) && okT.owner.some(m => m.type === 'charDelta') && j(okT.changed) === j(['c_1'])
            && okT.chat.length === 1 && /^Kael: Cutting 14 to Body, DR 6: 8 through \u00d71\.5, 12 Hit Points A Major Wound\. Plate: 6 \u2192 4/.test(okT.chat[0].text) && okT.chat[0].scope === 'whisper' && !okT.mate.some(m => m.type === 'chat') && okT.logs.some(l => l[0] === 'char'), j([hp(okT.camp.chars.c_1), SCd.makeResolver(sysD, okS.camp.chars.c_1, Fx)('ep'), hp(okS.camp.chars.c_1), wear(okS.camp.chars.c_1), wear(okT.camp.chars.c_1), okT.saves, okT.changed, okT.mate.length]));
        const quiet = r => r.saves === 0 && r.mate.length === 0 && r.chat.length === 0 && j(r.camp.chars.c_1.values) === j(START()) && j(r.camp.chars.c_2.values) === j(START());
        const sysSpD = Sx.cleanSystem(Object.assign({}, sysD, { fields: sysD.fields.map(f => f.id === 'f_ep' ? Object.assign({}, f, { spill: { to: 'f_hp' } }) : f) }), { F: Fx, gmView: true }), spD = runD({ type: 'char-damage', rid: 'd2', charId: 'c_1', amt: 20, dtype: 'stun' }, { sys: sysSpD });
        check('1.6.0 Spills into, char-damage (the host, run for real): a stun of 20 on Kael\'s Endurance 10 (least 0) stops it at 0 and spills the 10 past it into Hit Points (12 to 2), stored, saved once, both in the owner\'s delta, and the line says it to the GM and the owner alone',
            SCd.makeResolver(sysSpD, spD.camp.chars.c_1, Fx)('ep') === 0 && SCd.makeResolver(sysSpD, spD.camp.chars.c_1, Fx)('hp') === 2 && spD.saves === 1 && spD.owner.some(m => m.type === 'charDelta' && j(Object.keys(m.values).sort()) === j(['f_ep', 'f_hp']))
            && spD.chat.length === 1 && /Stun 20: 20 through, 20 Endurance 10 spill into Hit Points\./.test(spD.chat[0].text) && spD.chat[0].scope === 'whisper' && !spD.mate.some(m => m.type === 'chat'), j([spD.camp.chars.c_1.values, spD.owner, spD.chat]));
        const dOther = runD({ type: 'char-damage', rid: 'd3', charId: 'c_2', amt: 5 }), dNpc = runD({ type: 'char-damage', rid: 'd4', charId: 'c_3', amt: 5 }), dLoc = runD({ type: 'char-damage', rid: 'd5', charId: 'c_1', amt: 5, loc: 'w_nope' }), dPause = runD({ type: 'char-damage', rid: 'd6', charId: 'c_1', amt: 5 }, { paused: true });
        const junk = [{ type: 'char-damage', rid: 'd7', charId: 'c_1', amt: -1 }, { type: 'char-damage', rid: 'd8', charId: 'c_1', amt: '5' }, { type: 'char-damage', rid: 'd9', charId: 'c_1', amt: 5, loc: '<b>' }, { type: 'char-damage', rid: 'da', charId: 'c_1', amt: 5, ad: 0 }, { type: 'char-damage', charId: 'c_1', amt: 5 }, { type: 'char-damage', rid: 'db', charId: 'c_1', amt: 2e6 }].map(m => runD(m));
        check('1.5.6 the damage step (the host): another player\'s character and an NPC are refused as not theirs, a location they do not have as missing, a paused table as paused, each with nothing stored, saved or said; a message of the wrong shape (a negative, a text or a huge amount, a hostile location, an armor divisor of 0, no request id) is not answered at all',
            j(typ(dOther.owner)) === j(['char-deny:owner']) && j(typ(dNpc.owner)) === j(['char-deny:owner']) && j(typ(dLoc.owner)) === j(['char-deny:missing']) && j(typ(dPause.owner)) === j(['char-deny:paused'])
            && [dOther, dNpc, dLoc, dPause].every(quiet) && junk.every(r => r.owner.length === 0 && quiet(r)), j([dOther.owner, dNpc.owner, dLoc.owner, dPause.owner, junk.map(r => r.owner)]));
        // the card: an NPC's line is the GM's alone
        const cardOut = { sent: [], chat: [] }, netC = { active: true, role: 'host', myId: 'gm', roster: { pA: { id: 'u_a' } }, conns: [{ peer: 'pA', open: true, send: m => cardOut.sent.push(m) }] };
        new Function('net', 'peerProfileId', 'sendFailed', 'pushChat', 'logEvent', cardD + '\nnet.damageCard({ name: "Grunt", npc: true, ownerId: "u_a" }, ["Cutting 5: nothing gets through"]);')(netC, c => netC.roster[c.peer].id, () => {}, m => cardOut.chat.push(m), () => {});
        check('1.5.6 the damage step (the line): an NPC\'s blow is said to the GM alone, never to a player, even one named as its owner', cardOut.sent.length === 0 && cardOut.chat.length === 1 && cardOut.chat[0].text === 'Grunt: Cutting 5: nothing gets through');
        // a player's send: their own character, one at a time, the shape cleaned before it leaves
        const sentP = [], pend = {}, campP = { system: sysD, chars: { c_1: { id: 'c_1', ownerId: 'u_a' }, c_2: { id: 'c_2', ownerId: 'u_b' } } };
        const netP = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'H', myId: 'u_a', conns: [{ peer: 'H', open: true, send: m => sentP.push(JSON.parse(JSON.stringify(m))) }] };
        const send = new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', sendD + '\nreturn net.charDamage;')(netP, () => Sx, () => campP, {}, pend, () => {}, () => 0);
        const s1 = send('c_1', { amt: 9, type: 'cut', loc: 'w_body', ad: 2 }), s2 = send('c_1', { amt: 3 }), s3 = send('c_2', { amt: 3 });
        check('1.5.6 the damage step (a player\'s app): a blow on their own character goes to the host as one char-damage with its damage, type, location and armor divisor, and waits; a second while the first waits, and one on a character not theirs, are refused here in words',
            s1.ok === true && sentP.length === 1 && sentP[0].type === 'char-damage' && sentP[0].amt === 9 && sentP[0].dtype === 'cut' && sentP[0].loc === 'w_body' && sentP[0].ad === 2 && typeof s2.error === 'string' && typeof s3.error === 'string', j([s1, s2, s3, sentP]));
        {   /* 1.6.0 (the v2 combat module): the dice a blow rolled ride with a player's blow, and the host works out what they add */
            const sysDd = JSON.parse(JSON.stringify(sysD)); sysDd.combat.damage.types.push({ key: 'bore', label: 'Bore', mult: 1, dieWound: 1 });
            const dB = runD({ type: 'char-damage', rid: 'dc', charId: 'c_1', amt: 8, dtype: 'bore', loc: 'w_body', dice: 3 }, { sys: sysDd }), dB0 = runD({ type: 'char-damage', rid: 'dd', charId: 'c_1', amt: 8, dtype: 'bore', loc: 'w_body' }, { sys: sysDd });
            const dJunk = [2.5, -1, 101, '3'].map((v, i) => runD({ type: 'char-damage', rid: 'de' + i, charId: 'c_1', amt: 8, dtype: 'bore', loc: 'w_body', dice: v }, { sys: sysDd }));
            const sentQ = [], sendQ = new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', sendD + '\nreturn net.charDamage;')(Object.assign({}, netP, { conns: [{ peer: 'H', open: true, send: m => sentQ.push(JSON.parse(JSON.stringify(m))) }] }), () => Sx, () => campP, {}, {}, () => {}, () => 0);
            const sQ = sendQ('c_1', { amt: 8, type: 'cut', loc: 'w_body', dice: 3 });
            check('1.6.0 the damage step (the host, char-damage run for real): a player\'s blow carries the dice it rolled, and the host adds a type\'s wound a die (8 on DR 6: 2 through, 3 more for 3 dice, 5 off HP), said on the line; with no dice as before; dice that are no whole number from 0 to 100 are not answered; a player\'s app sends them',
                hp(dB.camp.chars.c_1) === 7 && /2 through \+3 for 3 dice, 5 Hit Points/.test(dB.chat[0].text) && hp(dB0.camp.chars.c_1) === 10 && dJunk.every(r => r.owner.length === 0 && quiet(r))
                && sQ.ok === true && sentQ.length === 1 && sentQ[0].dice === 3 && sentQ[0].dtype === 'cut', j([hp(dB.camp.chars.c_1), dB.chat, hp(dB0.camp.chars.c_1), sentQ]));
        }
        {   /* 1.6.0: a player's own blow lands its kind and each part's: DR reads the part it judges */
            const dmK = JSON.parse(JSON.stringify(sysD)); dmK.combat.damage.kinds = [{ key: 'close', label: 'Close' }, { key: 'shot', label: 'Shot' }]; dmK.fields.find(f => f.id === 'f_locs').list.cols[0].formula = 'Row.nat + if(Row.loc = 3, Kit.on.drBody, 0) + if(Blow.kind = Kind.close, 4, 0)';
            const sysDk = Sx.cleanSystem(dmK, { F: Fx, gmView: true }), kCl = runD({ type: 'char-damage', rid: 'dk1', charId: 'c_1', amt: 10, dtype: 'cut', dkind: 'close', loc: 'w_body', part2: { amt: 8, type: 'cut', kind: 'shot' } }, { sys: sysDk }), kNo = runD({ type: 'char-damage', rid: 'dk2', charId: 'c_1', amt: 10, dtype: 'cut', loc: 'w_body', part2: { amt: 8, type: 'cut' } }, { sys: sysDk });
            const kBad = runD({ type: 'char-damage', rid: 'dk3', charId: 'c_1', amt: 10, dtype: 'cut', dkind: 'nope', loc: 'w_body' }, { sys: sysDk }), kJunk = runD({ type: 'char-damage', rid: 'dk4', charId: 'c_1', amt: 10, dkind: '<b>' }, { sys: sysDk }), kPart = runD({ type: 'char-damage', rid: 'dk5', charId: 'c_1', amt: 10, part2: { amt: 1, kind: 4 } }, { sys: sysDk });
            const sentK = [], sendK = new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', sendD + '\nreturn net.charDamage;')(Object.assign({}, netP, { conns: [{ peer: 'H', open: true, send: m => sentK.push(JSON.parse(JSON.stringify(m))) }] }), () => Sx, () => campP, {}, {}, () => {}, () => 0);
            sendK('c_1', { amt: 8, type: 'cut', kind: 'close', loc: 'w_body', part2: { amt: 2, kind: 'shot' } });
            const hpK = r => r.camp.chars.c_1.values.f_hp.cur;
            check('1.6.0 a player\'s own blow with a kind (char-damage run for real): a card\'s kind rides as dkind and each part\'s as its kind, and DR reads the part it judges: Close 10 against DR 10 gets nothing through and a Shot 8 against DR 6 does (3 at the times 1.5), where the same blow of no kind takes 9; a kind that is none is refused in the step\'s words and changes nothing; one that is no key or a part\'s that is no key is not answered; a player\'s app sends both',
                hpK(kCl) === 9 && hpK(kNo) === 3 && typ(kBad.owner).join().indexOf('char-deny') >= 0 && quiet(kBad) && kJunk.owner.length === 0 && quiet(kJunk) && kPart.owner.length === 0 && quiet(kPart) && sentK[0].dkind === 'close' && !('kind' in sentK[0]) && j(sentK[0].part2) === j({ amt: 2, kind: 'shot' }), j([kCl.owner, kNo.owner, kBad.owner, sentK]));
        }
        {   /* 1.6.0: a player's own blow of two parts is one blow on the host */
            const dP = runD({ type: 'char-damage', rid: 'dp', charId: 'c_1', amt: 8, dtype: 'cut', loc: 'w_body', part2: { amt: 16, type: 'stun' } }), dP0 = runD({ type: 'char-damage', rid: 'dq', charId: 'c_1', amt: 8, dtype: 'cut', loc: 'w_body' });
            const dPbad = runD({ type: 'char-damage', rid: 'dr', charId: 'c_1', amt: 8, dtype: 'cut', loc: 'w_body', part2: { amt: -4 } });
            const sentR = [], sendR = new Function('net', 'SC', 'getActiveCampaign', 'window', '_charPending', 'charPendingDone', 'setTimeout', sendD + '\nreturn net.charDamage;')(Object.assign({}, netP, { conns: [{ peer: 'H', open: true, send: m => sentR.push(JSON.parse(JSON.stringify(m))) }] }), () => Sx, () => campP, {}, {}, () => {}, () => 0);
            sendR('c_1', { amt: 8, type: 'cut', loc: 'w_body', part2: { amt: 16, type: 'stun' }, part3: { amt: 2 } });
            const epOf = r => j(r.camp.chars.c_1.values.f_ep);
            check('1.6.0 a player\'s own blow of several parts (char-damage run for real): the second part lands on its own pool in the same blow, where the blow with no part leaves that pool alone; a part that does not clean is not answered and changes nothing; a player\'s app sends every part',
                hp(dP.camp.chars.c_1) === hp(dP0.camp.chars.c_1) && epOf(dP) !== epOf(dP0) && dPbad.owner.length === 0 && quiet(dPbad) && j(sentR[0].part2) === j({ amt: 16, type: 'stun' }) && j(sentR[0].part3) === j({ amt: 2 }), j([epOf(dP), epOf(dP0), hp(dP.camp.chars.c_1), sentR]));
        }
        check('1.5.6 the damage step (pinned): one host branch for char-damage, named in the host\'s count; the GM\'s token menu and a damage roll\'s card open the window through wpSheets alone',
            (nsD.match(/msg\.type === 'char-damage' && net\.role === 'host'/g) || []).length === 1);
    })());

// From netcheck.js's closing block ("Finishing the test split", step 6), where it ran after every pending check (it leans on none of them):
    /* ---- 1.5.4: a player deletes an extra sheet of their own (char-delete) ---- */
    {
        const NL = '\n', delSrc = src.slice(src.indexOf('// [netcheck:chardelete-start]'), src.indexOf('// [netcheck:chardelete-end]'));
        const runX = o => { o = o || {};
            const camp = { id: 'k', chars: { c_play: { id: 'c_play', name: 'Ror', ownerId: 'u_a', npc: false }, c_mk: { id: 'c_mk', name: 'Ror', ownerId: 'u_a', npc: false, making: 1 }, c_kept: { id: 'c_kept', name: 'Old', ownerId: 'u_a', npc: false }, c_b: { id: 'c_b', name: 'Bea', ownerId: 'u_b', npc: false }, c_npc: { id: 'c_npc', name: 'N', npc: true, ownerId: 'u_a' } },
                items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 't1', charId: 'c_kept' }, { id: 't2', charId: 'c_play' }] }, m2: { id: 'm2', type: 'map', whiteboard: [null, { id: 't3', charId: 'c_mk' }] }, m3: { id: 'm3', type: 'map', whiteboard: [{ id: 't4', charId: 'c_kept' }] }, pg: { id: 'pg', type: 'doc', whiteboard: [{ id: 't5', charId: 'c_kept' }] }, gone: null, bare: { id: 'bare', type: 'map' } } };
            const out = { ans: [], deleted: [], toasts: [], flushed: 0, allowed: [], remote: [], maps: [] };
            const conn = { peer: o.from || 'pA', send: m => out.ans.push(JSON.parse(JSON.stringify(m))) };
            const net = { role: 'host', paused: !!o.paused, applyingRemote: o.remoteWas === true, roster: { pA: { id: 'u_a', name: 'Pat' }, pB: { id: 'u_b', name: 'Bea' } } };
            if (!o.noSend) net.broadcastItemFiltered = (cid, mid) => { out.maps.push([cid, mid, net.applyingRemote, out.deleted.length, out.toasts.length]); };
            const win = { wpSheets: o.noSheets ? null : { deleteCharacter: id => { out.deleted.push([id, out.flushed]); out.remote.push(net.applyingRemote); if (o.boom) throw new Error('boom'); delete camp.chars[id]; } }, wpHistFlush: () => { out.flushed++; } };
            try { new Function('msg', 'conn', 'net', 'own', 'getActiveCampaign', 'SC', 'window', 'peerPaused', 'allow', 'toast', 'sendFailed', 'cleanCharName', "'use strict';" + NL + delSrc)(
                o.msg, conn, net, H.own, () => camp, () => (o.noCore ? null : { activeCharOf: (c, pid) => ({ id: o.active || (pid === 'u_a' ? 'c_play' : 'c_b') }) }), win, () => !!o.peerPaused, (k, lim, peer) => { out.allowed.push([k, peer]); return o.slow !== true; }, t => out.toasts.push(t), () => {}, n => String(n || '').slice(0, 40)); } catch (e) { out.threw = String(e && e.message); }
            out.after = net.applyingRemote; return out; };
        const mX = (id, rid) => ({ type: 'char-delete', rid: rid === undefined ? 'r1' : rid, charId: id }), why = o => (o.ans[0] ? o.ans[0].reason || (o.ans[0].ok ? 'ok' : '?') : 'silent');
        const mk = runX({ msg: mX('c_mk') }), kept = runX({ msg: mX('c_kept') }), play = runX({ msg: mX('c_play') }), mkOnly = runX({ msg: mX('c_mk'), active: 'c_mk' });
        const nestX = runX({ msg: mX('c_kept'), remoteWas: true }), boomX = runX({ msg: mX('c_kept'), boom: true }), noSendX = runX({ msg: mX('c_kept'), noSend: true });   // the owed review, 2026-10-09: the delete runs as a change from the table
        check('a player deletes an extra sheet of their own (the host\'s char-delete, sliced by its chardelete markers and run for real): one still being made, or one they do not play, is deleted by the host\'s own delete after the GM\'s pending edit is flushed, the GM is told whose and which, with no promise of a way back since a sheet is not in the undo history, and the player is answered; the delete runs as a change from the table, so the unlinking of its tokens is no step of the GM\'s undo, and that mark is put back as it was, after a delete that throws too; each map that held a token of the sheet, and no other item, is sent to the table once the delete is done, since a save marked so sends no map by itself; the one they play is refused and stays, while one still being made goes even where it counts as the one in play',
            j(mk.deleted) === j([['c_mk', 1]]) && j(mk.ans) === j([{ ok: true, type: 'char-delete-ans', rid: 'r1' }]) && j(mk.toasts) === j(['Pat deleted their sheet Ror (it was still being made).']) && j(mk.allowed) === j([['chardel', 'pA']])
            && j(kept.deleted) === j([['c_kept', 1]]) && j(kept.toasts) === j(['Pat deleted their sheet Old.']) && j(mk.remote) === j([true]) && mk.after === false && j(nestX.remote) === j([true]) && nestX.after === true && boomX.threw === 'boom' && boomX.after === false && boomX.toasts.length === 0 && boomX.ans.length === 0 && !/Undo brings/.test(delSrc)
            && j(kept.maps) === j([['k', 'm1', false, 1, 0], ['k', 'm3', false, 1, 0]]) && j(mk.maps) === j([['k', 'm2', false, 1, 0]]) && j(nestX.maps) === j([['k', 'm1', true, 1, 0], ['k', 'm3', true, 1, 0]]) && play.maps.length === 0 && boomX.maps.length === 0 && why(noSendX) === 'ok' && noSendX.deleted.length === 1 && why(play) === 'inplay' && play.deleted.length === 0 && play.toasts.length === 0 && play.allowed.length === 0 && j(mkOnly.deleted) === j([['c_mk', 1]]) && why(mkOnly) === 'ok', j([mk, kept, play, mkOnly]));
        const refs = { other: runX({ msg: mX('c_b') }), npc: runX({ msg: mX('c_npc') }), gone: runX({ msg: mX('c_zz') }), proto: runX({ msg: mX('__proto__') }), ctor: runX({ msg: mX('constructor') }), notText: runX({ msg: mX({ toString: () => 'c_mk' }) }),
            paused: runX({ msg: mX('c_mk'), paused: true }), pPaused: runX({ msg: mX('c_mk'), peerPaused: true }), off: runX({ msg: mX('c_mk'), noSheets: true }), noCore: runX({ msg: mX('c_mk'), noCore: true }), slow: runX({ msg: mX('c_mk'), slow: true }),
            badRid: runX({ msg: mX('c_mk', 'bad rid!') }), noRid: runX({ msg: mX('c_mk', 7) }), stranger: runX({ msg: mX('c_mk'), from: 'pZ' }), another: runX({ msg: mX('c_mk'), from: 'pB' }) };
        const whys = Object.keys(refs).map(k => k + ':' + why(refs[k]));
        check('char-delete refuses everything else and deletes nothing: another player\'s sheet and an NPC\'s (owner), one that is not there or named by a prototype\'s key or by a value that is no text (missing), a paused table or player, sheets off, a request past the rate; a request with no usable id of its own and one from a connection that is not admitted are not answered at all',
            j(whys) === j(['other:owner', 'npc:owner', 'gone:missing', 'proto:missing', 'ctor:missing', 'notText:missing', 'paused:paused', 'pPaused:paused', 'off:off', 'noCore:missing', 'slow:slow', 'badRid:silent', 'noRid:silent', 'stranger:silent', 'another:owner'])
            && Object.keys(refs).every(k => refs[k].deleted.length === 0 && refs[k].toasts.length === 0 && refs[k].flushed === 0 && refs[k].maps.length === 0), j(whys));
        check('char-delete on the player\'s side: one request through the same sender as the other character requests, its answer taken with theirs, the refusal for the character in play in the app\'s own words',
            src.includes("net.charDelete = function(charId, done) { return mkSend('char-delete', { charId: String(charId) }, done); };") && src.includes("msg.type === 'char-done-ans' || msg.type === 'char-delete-ans' || msg.type === 'char-token-ans'")
            && src.includes("inplay: 'That is the character you play: only your GM can delete it.'") && src.split("msg.type === 'char-delete'").length === 2);
    }

/* ================= 1.6.3 (the improvement week's review of sheets and rolls, finding 7): a player's quick presses on one field ================= */
{
    // net.charEdit and the pending slice, run for real on a stub world with a clock and timers of the suite's own: six presses of a pool's − land as
    // one edit with the host and the newest value after it, a "too quick" is sent again and never undone, and the host's char-edit answers every refusal
    const editSrc = (() => { const i = src.indexOf('net.charEdit = function(charId, fieldId, value) {'), k = src.indexOf('\n};\n', i); return src.slice(i, k + 4); })();
    const pendSrc = between('// [netcheck:pending-start]', '// [netcheck:pending-end]', 'pending');
    const mkW = () => {
        const out = { sent: [], timers: [], toasts: [], results: [], now: 1000 }, ch = { id: 'c_1', ownerId: 'p1', values: { f_hp: 10 } }, camp = { chars: { c_1: ch }, system: { fields: [] } };
        const S = { LIMITS: { editTimeoutMs: 5000 }, applyEdit: (sys, c, f, v) => ({ ok: true, value: v }), editHasLock: () => false };
        const net = { active: true, role: 'client', stream: false, foreign: true, syncedPeer: 'H', myId: 'p1', conns: [{ peer: 'H', open: true, send: m => out.sent.push(JSON.parse(JSON.stringify(m))) }] };
        const win = { wpVtt: null, wpFormula: {}, wpSheets: { editResult: (rid, ok, reason) => out.results.push(reason), charChanged: () => {} } };
        const st = (f, ms) => { out.timers.push({ f, at: out.now + (ms || 0) }); return out.timers.length; }, ct = id => { if (id && out.timers[id - 1]) out.timers[id - 1].f = null; };
        const api = new Function('getActiveCampaign', 'SC', 'net', 'toast', 'window', 'setTimeout', 'clearTimeout', 'Date',
            'var _charPending = Object.create(null), _charHost = Object.create(null);\n' + editSrc + '\n' + pendSrc + '\nreturn { done: charPendingDone, pend: function() { return _charPending; }, noteHostCopy: noteHostCopy };')(
            () => camp, () => S, net, t => out.toasts.push(t), win, st, ct, { now: () => out.now });
        const tick = ms => { out.now += ms; let ran = true; while (ran) { ran = false; out.timers.forEach(t => { if (t.f && t.at <= out.now) { const f = t.f; t.f = null; f(); ran = true; } }); } };
        api.noteHostCopy('c_1', ch.values);
        return { out, ch, net, api, tick };
    };
    // six presses of − at once
    const w1 = mkW(); for (let v = 9; v >= 4; v--) w1.net.charEdit('c_1', 'f_hp', v);
    const first = [w1.out.sent.map(m => m.value), w1.ch.values.f_hp, Object.keys(w1.api.pend()).length];
    w1.api.done(w1.out.sent[0].rid, true); w1.tick(0); const early = w1.out.sent.length; w1.tick(200);
    const second = [w1.out.sent.map(m => m.value), w1.ch.values.f_hp];
    w1.api.done(w1.out.sent[1].rid, true); w1.tick(6000);
    const done1 = [Object.keys(w1.api.pend()).length, w1.out.results.length, w1.ch.values.f_hp, w1.out.sent.length];
    // a "too quick" from the host: sent again a little later, the value kept on the sheet meanwhile, and no word of an undo
    const w2 = mkW(); w2.net.charEdit('c_1', 'f_hp', 7); const r2 = w2.out.sent[0].rid; w2.api.done(r2, false, 'slow');
    const kept2 = [w2.ch.values.f_hp, w2.out.results.length, w2.out.sent.length]; w2.tick(300); const again2 = [w2.out.sent.length, w2.out.sent[1] && w2.out.sent[1].value, w2.out.sent[1] && w2.out.sent[1].rid === r2];
    w2.net.charEdit('c_1', 'f_hp', 6); const held2 = w2.out.sent.length; w2.api.done(r2, true); w2.tick(300);
    const after2 = [w2.out.sent.length, w2.out.sent[w2.out.sent.length - 1].value, w2.ch.values.f_hp];
    // a newer value held while one waits to be sent again takes its place: one edit goes, with the newer value
    const w3 = mkW(); w3.net.charEdit('c_1', 'f_hp', 8); w3.net.charEdit('c_1', 'f_hp', 7); w3.api.done(w3.out.sent[0].rid, false, 'slow'); w3.tick(1000);
    const one3 = [w3.out.sent.map(m => m.value), Object.keys(w3.api.pend()).length];
    // past EDIT_TRIES it is undone as any refusal, back to the host's copy
    const w4 = mkW(); w4.net.charEdit('c_1', 'f_hp', 3); let rr = w4.out.sent[0].rid; for (let k = 0; k < 9; k++) { w4.api.done(rr, false, 'slow'); w4.tick(2500); rr = w4.out.sent[w4.out.sent.length - 1].rid; }
    const gave4 = [w4.ch.values.f_hp, w4.out.results.indexOf('slow') >= 0, Object.keys(w4.api.pend()).length];
    // another field goes at once, beside one waiting
    const w5 = mkW(); w5.ch.values.f_mp = 4; w5.net.charEdit('c_1', 'f_hp', 9); w5.net.charEdit('c_1', 'f_mp', 3); const both5 = w5.out.sent.map(m => m.fieldId + '=' + m.value);
    const edR = between('// [netcheck:charedit-start]', '// [netcheck:charedit-end]', 'charedit');
    check('1.6.3 (finding 7): quick presses on one field of a player\'s own sheet are one edit at a time with the host: the first goes at once, each later press is shown at once and held with the newest value, sent once the one before is answered (spaced from it), so six presses of a pool\'s \u2212 store its last value with no undo; a "too quick" answer is sent again a little later and never undone (a newer value held meanwhile goes in its place), and only past its tries is it undone as any refusal; another field goes beside one waiting; the host\'s char-edit answers every refusal by the limiter, never in silence',
        j(first) === j([[9], 4, 2]) && early === 1 && j(second) === j([[9, 4], 4]) && j(done1) === j([0, 0, 4, 2])
        && j(kept2) === j([7, 0, 1]) && j(again2) === j([2, 7, true]) && held2 === 2 && j(after2) === j([3, 6, 6])
        && j(one3) === j([[8, 7], 1]) && j(gave4) === j([10, true, 0]) && j(both5) === j(['f_hp=9', 'f_mp=3'])
        && edR.includes("if (limE !== true) { denyE('slow'); return; }") && !edR.includes('_charSlowSaid[skE]'),
        j({ first, early, second, done1, kept2, again2, held2, after2, one3, gave4, both5 }));
}

T.finish();
