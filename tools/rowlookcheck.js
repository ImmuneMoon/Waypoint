// rowlookcheck — the look of a row's own text (item 35, fold 1d; the owner, 2026-11-03, by prompt: "A row's note", "Own row's description",
// "Own row's name", "On-the-spot effect's name"). systemcore keeps each look beside its text on the row (nlk, mlk, dlk) or on an effect made on
// the spot (lk), cleaned for the very words it was made for, never on a definition; the row ops and the wire carry it; the sheet draws the
// texts in its own text box and reads them with their looks. No browser, no network.
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 600))); } }
const J = JSON.stringify, root = path.join(__dirname, '..'), app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, '\n');
const imp = p => import('file:///' + path.resolve(app(p)).replace(/\\/g, '/'));
function between(src, a, b) { const i = src.indexOf(a), j = src.indexOf(b, i); return i >= 0 && j > i ? src.slice(i, j) : ''; }
(async () => {
    if (typeof globalThis.window === 'undefined') globalThis.window = {};
    const S = await imp('scripts/systemcore.js'), L = await imp('scripts/lookcore.js'), F = await imp('scripts/formula.js');
    const R = S.rowTextRule;
    // ---- the rules
    check('a note and a name are one line with no size and no font, a description is prose with a size and no font, an effect’s name is one line held to a name’s length; all take a link',
        R('note').multi === false && R('note').size === false && R('note').font === false && R('note').link === true && R('note').max === S.LIMITS.rowNote
        && R('name').multi === false && R('name').max === S.LIMITS.itemName && R('desc').multi === true && R('desc').size === true && R('desc').font === false && R('desc').max === S.LIMITS.desc
        && R('fx').multi === false && R('fx').max === S.LIMITS.name && R('fx').link === true, J([R('note'), R('desc'), R('fx')]));
    const rec = (text, spans, part) => L.makeRec({ spans: spans }, '', text, R(part));
    const bold = (t, s, e, part) => rec(t, [{ s: s, e: e, b: true }], part || 'note');
    // ---- a system with a list that takes rows of the character's own, and an effects list
    const raw = { v: 1, name: 'K', rolls: [], fields: [
        { id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', edit: 'owner', vis: 'all', list: { custom: true, cats: ['Skill'] } },
        { id: 'f_fx', key: 'Fx', label: 'Effects', kind: 'effects', edit: 'owner', vis: 'all' }],
        items: [{ id: 'i_karate', name: 'Karate', category: 'Skill', key: 'Karate' }] };
    const sys = S.cleanSystem(raw, { F, gmView: true }), pv = S.cleanSystem(sys, { F, gmView: false });
    const ch = (rows, fx) => ({ id: 'c_k', name: 'Kessa', ownerId: 'u_k', npc: false, values: { f_sk: rows || [], f_fx: fx || [] } });
    const op = (c, q, pl) => S.applyRowOp(pl ? pv : sys, c, 'f_sk', q, F, pl ? { player: true, view: pv } : {});
    // ---- a row's note
    const n1 = op(ch(), { op: 'add', defId: 'i_karate', rowId: 'w_a' });
    const n2 = op(ch(n1.value), { op: 'set', rowId: 'w_a', facts: { note: 'Cracked lens', nlk: bold('Cracked lens', 0, 7) } }, true);
    const rowA = v => (v || []).find(r => r && r.id === 'w_a');
    check('a player’s own note is stored with the look made for it, beside the note on the row and not on its definition',
        n2.ok && rowA(n2.value).note === 'Cracked lens' && J(rowA(n2.value).nlk) === J(bold('Cracked lens', 0, 7)) && !('nlk' in (rowA(n2.value).def || {})), J(n2));
    const n3 = op(ch(n2.value), { op: 'set', rowId: 'w_a', facts: { note: 'Cracked visor' } });
    check('a note written again without a look loses the look made for the old words; a look named null takes it off; a note and its look come in one change',
        n3.ok && rowA(n3.value).note === 'Cracked visor' && !('nlk' in rowA(n3.value))
        && (() => { const x = op(ch(n2.value), { op: 'set', rowId: 'w_a', facts: { note: 'Cracked lens', nlk: null } }); return x.ok && !('nlk' in rowA(x.value)) && rowA(x.value).note === 'Cracked lens'; })(), J(n3));
    const n4 = op(ch(n2.value), { op: 'set', rowId: 'w_a', facts: { note: 'Cracked lens', nlk: bold('Other words', 0, 5) } });
    check('a look made for other words is dropped, and the note stays', n4.ok && rowA(n4.value).note === 'Cracked lens' && !('nlk' in rowA(n4.value)), J(n4));
    const cl = S.cleanChar(ch(n2.value), sys, { state: 'host' }), own = S.charFor(ch(n2.value), sys, 'u_k');
    check('the note’s look is kept by a load (cleanChar) and carried to its owner’s copy, and a load with a look for other words drops it',
        J(rowA(cl.values.f_sk).nlk) === J(bold('Cracked lens', 0, 7)) && own && J(rowA(own.values.f_sk).nlk) === J(bold('Cracked lens', 0, 7))
        && (() => { const bad = JSON.parse(J(n2.value)); bad[0].nlk = bold('Elsewhere', 0, 4); const c2 = S.cleanChar(ch(bad), sys, { state: 'host' }); return !('nlk' in rowA(c2.values.f_sk)); })(), J([cl.values.f_sk, own && own.values.f_sk]));
    check('the wire takes a note’s look by its shape and refuses one that is no record',
        (() => { const g = S.cleanCharItem({ type: 'char-item', rid: 'r1', charId: 'c_k', fieldId: 'f_sk', op: 'set', rowId: 'w_a', facts: { note: 'x', nlk: bold('x', 0, 1) } }), b = S.cleanCharItem({ type: 'char-item', rid: 'r1', charId: 'c_k', fieldId: 'f_sk', op: 'set', rowId: 'w_a', facts: { note: 'x', nlk: { fmt: 'evil' } } }), z = S.cleanCharItem({ type: 'char-item', rid: 'r1', charId: 'c_k', fieldId: 'f_sk', op: 'set', rowId: 'w_a', facts: { note: 'x', nlk: null } });
            return !!g && J(g.facts.nlk) === J(bold('x', 0, 1)) && b === null && !!z && z.facts.nlk === null; })());
    // ---- a row of the character's own: its name and its description
    const c1 = op(ch(), { op: 'custom', rowId: 'w_m', def: { name: 'Pebble kick', desc: 'A kick, then a spin.' }, looks: { name: bold('Pebble kick', 0, 6, 'name'), desc: rec('A kick, then a spin.', [{ s: 0, e: 6, i: true, size: 'big' }], 'desc') } }, true);
    const rowM = v => (v || []).find(r => r && r.id === 'w_m');
    check('a player’s own row keeps the looks of its name and its description beside them (mlk, dlk), never inside its definition',
        c1.ok && rowM(c1.value).def.name === 'Pebble kick' && J(rowM(c1.value).mlk) === J(bold('Pebble kick', 0, 6, 'name')) && rowM(c1.value).dlk && rowM(c1.value).dlk.fmt.spans[0].i === true
        && !('mlk' in rowM(c1.value).def) && !('looks' in rowM(c1.value).def), J(c1));
    const c2 = op(ch(c1.value), { op: 'custom', rowId: 'w_m', def: { name: 'Coin toss' } }, true);
    check('a name changed with no look loses the look made for the old name and keeps the description’s',
        c2.ok && rowM(c2.value).def.name === 'Coin toss' && !('mlk' in rowM(c2.value)) && !!rowM(c2.value).dlk, J(c2));
    const c3 = op(ch(c1.value), { op: 'custom', rowId: 'w_m', def: { desc: 'Two kicks.' }, looks: { desc: null } }, true);
    check('a description’s look named null goes, and the name keeps its own', c3.ok && !('dlk' in rowM(c3.value)) && !!rowM(c3.value).mlk, J(c3));
    const lib = S.cleanChar(ch(n1.value.concat([])), sys, { state: 'host' }), libR = rowA(lib.values.f_sk);
    check('a row of the library holds no name or description look, whatever a file names', (() => { const bad = JSON.parse(J(n1.value)); bad[0].mlk = bold('Karate', 0, 3, 'name'); bad[0].dlk = bold('Karate', 0, 3, 'desc'); const cc = S.cleanChar(ch(bad), sys, { state: 'host' }); const r = rowA(cc.values.f_sk); return !('mlk' in r) && !('dlk' in r); })() && !!libR);
    const own2 = S.charFor(ch(c1.value), sys, 'u_k'), mate = S.charFor(ch(c1.value), sys, 'u_b');
    check('the looks go to the owner’s copy, and a load keeps them for the words they were made for',
        own2 && J(rowM(own2.values.f_sk).mlk) === J(rowM(c1.value).mlk) && J(rowM(own2.values.f_sk).dlk) === J(rowM(c1.value).dlk)
        && (() => { const c = S.cleanChar(ch(c1.value), sys, { state: 'host' }); return J(rowM(c.values.f_sk).mlk) === J(rowM(c1.value).mlk); })()
        && (!mate || !mate.values || !Array.isArray(mate.values.f_sk) || !rowM(mate.values.f_sk) || !('mlk' in rowM(mate.values.f_sk)) || J(rowM(mate.values.f_sk).mlk) === J(rowM(c1.value).mlk)), J(own2 && own2.values.f_sk));
    check('the wire takes an own row’s looks by their shape, name and description alone, and refuses one that is no record',
        (() => { const base = { type: 'char-item', rid: 'r1', charId: 'c_k', fieldId: 'f_sk', op: 'custom', rowId: 'w_m', def: { name: 'A' } };
            const g = S.cleanCharItem(Object.assign({}, base, { looks: { name: bold('A', 0, 1, 'name'), desc: null, evil: 1 } })), b = S.cleanCharItem(Object.assign({}, base, { looks: { name: { fmt: 1 } } })), b2 = S.cleanCharItem(Object.assign({}, base, { looks: 'x' }));
            return !!g && J(Object.keys(g.looks)) === J(['name', 'desc']) && g.looks.desc === null && b === null && b2 === null; })());
    // ---- an effect made on the spot: its name
    const fxRec = rec('Shaken badly', [{ s: 7, e: 12, i: true }], 'fx');
    const fxOp = (c, q, pl) => S.applyEffectOp(pl ? pv : sys, c, 'f_fx', q, F, pl ? { player: true, view: pv, now: 0 } : { now: 0 });
    const e1 = fxOp(ch(), { op: 'adhoc', row: { id: 'x_1', name: 'Shaken badly', icon: '', tone: '', dur: '', notes: '', on: true, mods: [], lk: fxRec } }, true);
    check('an effect a player makes on the spot keeps the look of its name, and the name made again keeps it while the words stand',
        e1.ok && J(e1.value[0].lk) === J(fxRec)
        && (() => { const e2 = fxOp(ch([], e1.value), { op: 'adhoc', row: { id: 'x_1', name: 'Shaken badly', icon: '', tone: 'debuff', dur: '', notes: '', on: true, mods: [] } }, true); return e2.ok && J(e2.value[0].lk) === J(fxRec) && e2.value[0].tone === 'debuff'; })()
        && (() => { const e3 = fxOp(ch([], e1.value), { op: 'adhoc', row: { id: 'x_1', name: 'Calm', icon: '', tone: '', dur: '', notes: '', on: true, mods: [] } }, true); return e3.ok && !('lk' in e3.value[0]); })(), J(e1));
    check('the wire carries an effect’s look by its shape, and the owner’s copy and a load keep it',
        (() => { const g = S.cleanCharEffect({ type: 'char-effect', rid: 'r1', charId: 'c_k', fieldId: 'f_fx', op: 'adhoc', row: { id: 'x_1', name: 'Shaken badly', mods: [], lk: fxRec } }), b = S.cleanCharEffect({ type: 'char-effect', rid: 'r1', charId: 'c_k', fieldId: 'f_fx', op: 'adhoc', row: { id: 'x_1', name: 'S', mods: [], lk: 'x' } }); return !!g && J(g.row.lk) === J(fxRec) && b === null; })()
        && (() => { const o = S.charFor(ch([], e1.value), sys, 'u_k'), c = S.cleanChar(ch([], e1.value), sys, { state: 'host' }); return !!o && J(o.values.f_fx[0].lk) === J(fxRec) && J(c.values.f_fx[0].lk) === J(fxRec); })());
    // ---- the sheet
    const sh = read('scripts/sheets.js'), slice = between(sh, '// [systemcheck:sheetbox-start]', '// [systemcheck:sheetbox-end]');
    check('the sheet’s text box host keys a row’s text as charId:fieldId:rowId:part, a note, an own row’s name and description, and an effect’s name',
        /var SBX_ROW = \/\^\(c_\[A-Za-z0-9_\]\{1,24\}\):\(f_\[A-Za-z0-9_\]\{1,24\}\):\(\(\?:w\|x\)_\[A-Za-z0-9_\]\{1,24\}\):\(note\|name\|desc\|fx\)\$\//.test(slice)
        && /function sbxIsKey\(key\) \{ return typeof key === 'string' && \(SBX_KEY\.test\(key\) \|\| SBX_ROW\.test\(key\)\); \}/.test(slice)
        && /var rf = sbxRowField\(key\); if \(rf\) return rf;/.test(slice) && /if \(SBX_ROW\.test\(key\)\) return sbxRowCommit\(key, d\);/.test(slice), slice.length);
    check('a row’s text is committed by its own op, the text and its look together: a note by the row’s set, a name and a description by the custom op, an effect’s name by the effect made again whole',
        /commitItem\(p\.c, p\.f, \{ op: 'set', rowId: rowIdOf\(p\.row\), facts: \{ note: d\.text, nlk: rec \|\| null \} \}\)/.test(slice)
        && /commitItem\(p\.c, p\.f, \{ op: 'custom', rowId: rowIdOf\(p\.row\), def: df, looks: lk \}\)/.test(slice)
        && /commitEffect\(p\.c, p\.f, \{ op: 'adhoc', row: \{ id: rx\.id, name: nmX \|\| 'Effect'[^\n]*lk: recX \|\| null \} \}\)/.test(slice));
    check('a name and a description are a row of the character’s own alone, and an effect’s name one made on the spot alone',
        /if \(fx \? typeof row\.ref === 'string' : m\[4\] !== 'note' && \(!row\.def \|\| row\.lnk === 1 \|\| typeof row\.defId === 'string'\)\) return null;/.test(slice));
    check('where the box cannot serve the sheet draws the plain control it always drew, and where a text is only read it is drawn through the reader with links asking first',
        /var nbx = editable && typeof sbxRowNode === 'function' \? sbxRowNode\(c, f, entry, 'note', 'A note on this one', 'Note'\) : null;/.test(sh)
        && /else if \(editable\) \{ var ni = el\('input', 'field sheet-item-note'\);/.test(sh)
        && /typeof rowRead === 'function' \? rowRead\(entry\.note, entry\.nlk, 'note', 'div', 'sheet-item-rownote'\)/.test(sh)
        && /else nb = text\('name', 'Name', LIMITS\.itemName, d\.name \|\| '', 'Its name \(blank keeps it\)'\);/.test(sh)
        && /else area\('desc', 'Description'/.test(sh) && /function fxNameNode\(c, f, r, d, mk\) \{/.test(sh)
        && /rd\.fill\(d, String\(text \|\| ''\), lk, document, \{ rule: _sbx\.paper \? Object\.assign\(\{\}, rule, \{ link: false \}\) : rule, typed: false, ask: true \}\);/.test(slice));
    check('an own row’s name is read with its look in the list, in a rich table and its description in the details',
        /if \(entry\.mlk && typeof rowReadInto === 'function'\) rowReadInto\(nm, def\.name, entry\.mlk, 'name'\);/.test(sh)
        && /entry\.mlk && typeof rowRead === 'function' \? rowRead\(def\.name, entry\.mlk, 'name', 'span', 'sheet-item-tname'\)/.test(sh)
        && /entry && entry\.dlk && typeof rowRead === 'function' \? rowRead\(d, entry\.dlk, 'desc', 'div', 'sheet-item-desc'\)/.test(sh));
    const nt = read('scripts/net.js');
    check('a player’s app waits for the host with an own row’s looks, as it waits with the rest of the op',
        /if \(q\.looks !== undefined\) mI\.looks = q\.looks;/.test(nt) && /'name', 'look', 'looks', 'work',/.test(nt));
    const help = read('index.html'), wn = fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8'), wn2 = read('assets/whatsnew.txt');
    check('Help and both release notes say which of a row’s texts take a look',
        /A row&rsquo;s note, a name and a description of a row of the character&rsquo;s own, and the name of an effect made on the spot take a look too\./.test(help)
        && /A row's note, a name and a description of a row of the character's own/.test(wn) && /A row's note, a name and a description of a row of the character's own/.test(wn2));
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite threw -> ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) console.log('FAIL      the suite never reached its summary'); });
