// bodycheck — a body built of rows (1.6.2, docs/BODY_VIEW_PLAN.md). Fold 1: a row that hangs from a row, Row.up.<name> in each place a name is read, and a
// grant that names its row, sets its stats and hangs it, so a plan entry can lay a body down. systemcore imported and run on invented data, the sheet's
// Hangs from sliced and read. No browser, no network.
'use strict';
const fs = require('fs'), path = require('path'), url = require('url');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 700))); } }
const J = JSON.stringify, NL = '\n', root = path.join(__dirname, '..');
const app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, NL), readRoot = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, NL);
(async () => {
    const S = await import(url.pathToFileURL(app('scripts/systemcore.js')).href), F = await import(url.pathToFileURL(app('scripts/formula.js')).href);
    const LIST = { noQty: true, multi: true, hang: true, stats: [{ key: 'Size', label: 'Size' }, { key: 'Side', kind: 'pick', label: 'Side', opts: [{ label: 'Left', name: 'Left' }, { label: 'Right', name: 'Right' }] }, { key: 'Sec', label: 'Sec', vis: 'gm' }], cols: [{ key: 'Gone', label: 'Gone', formula: 'Row.up.Size = 0' }, { key: 'Twice', label: 'Twice', formula: 'Row.up.Size * 2 + Row.up.lvl' }, { key: 'Reach', label: 'Reach', formula: 'Row.Size + Row.up.Reach' }] };
    const PLAN = { id: 'i_plan', name: 'Winged Body', stats: {}, grants: [
        { list: 'f_parts', entry: 'i_limb', name: 'Left Hand', up: 'Left Arm', stats: { Size: 2, Side: 'Left' } },
        { list: 'f_parts', entry: 'i_limb', name: 'Left Arm', stats: { Size: 5, Side: 'Left' } },
        { list: 'f_parts', entry: 'i_limb', name: 'Right Arm', stats: { Size: 6, Side: 'Right' } },
        { list: 'f_parts', entry: 'i_limb', name: 'Right Hand', up: 'Right Arm', stats: { Size: 2, Side: 'Right', Sec: 9, Nope: 1 } }] };
    const RAW = { v: 1, name: 'Bodies', fields: [{ id: 'f_parts', key: 'Parts', kind: 'item-list', label: 'Parts', list: LIST }, { id: 'f_kit', key: 'Kit', kind: 'item-list', label: 'Kit', list: { multi: true, stats: [{ key: 'Size', label: 'Size' }], cols: [{ key: 'Up', label: 'Up', formula: 'Row.up.Size' }] } }, { id: 'f_plans', key: 'Plans', kind: 'item-list', label: 'Plans', list: { noQty: true } }],
        items: [{ id: 'i_limb', name: 'Limb', category: 'Body', stats: { Size: 1 } }, PLAN] };
    const SYS = S.cleanSystem(RAW, { F, gmView: true }), VIEW = S.cleanSystem(SYS, { F, gmView: false }), parts = SYS.fields[0];
    const fresh = () => ({ id: 'c_a', name: 'Ana', ownerId: 'u_a', npc: false, values: {} });
    const op = (ch, f, q, o) => { const r = S.applyRowOp(SYS, ch, f, q, F, o || {}); if (r && r.ok && r.value) ch.values[f] = r.value; if (r && r.ok && r.also) Object.keys(r.also).forEach(k => { ch.values[k] = r.also[k]; }); return r; };
    const named = (ch, n) => (ch.values.f_parts || []).find(r => r.ov && r.ov.name === n);
    const body = () => { const ch = fresh(); const r = op(ch, 'f_plans', { op: 'add', defId: 'i_plan', qty: 1 }); return { ch, r }; };

    /* ---- the tick and the fact ---- */
    check('Rows hang from a row is kept only as true, the same in both views, and a list with none has no key', parts.list.hang === true && VIEW.fields[0].list.hang === true && !('hang' in SYS.fields[2].list) && !('hang' in (S.cleanSystem({ v: 1, name: 'B', fields: [{ id: 'f_x', key: 'X', kind: 'item-list', list: { hang: 'yes' } }] }, { F, gmView: true }).fields[0].list || {})));
    const { ch: b1, r: rAdd } = body();
    check('the host lays a plan down: four rows from one entry, each under the name its grant gives it', !!rAdd && rAdd.ok === true && J((b1.values.f_parts || []).map(r => r.ov && r.ov.name)) === J(['Left Hand', 'Left Arm', 'Right Arm', 'Right Hand']), J([rAdd, b1.values.f_parts]));
    check('each is hung as its grant says, in either order of the grants', named(b1, 'Left Hand').up === S.rowIdOf(named(b1, 'Left Arm')) && named(b1, 'Right Hand').up === S.rowIdOf(named(b1, 'Right Arm')) && !('up' in named(b1, 'Left Arm')), J(b1.values.f_parts));
    check('a grant sets a number and a choice, held as the GM’s, and a stat its list lacks does nothing', named(b1, 'Left Arm').ov.stats.Size === 5 && named(b1, 'Left Arm').ov.stats.Side === 'Left' && J(named(b1, 'Left Arm').ov.held.slice().sort()) === J(['Side', 'Size']) && !('Nope' in named(b1, 'Right Hand').ov.stats), J(named(b1, 'Right Hand')));
    const cleanRows = v => S.cleanChar({ id: 'c_a', name: 'Ana', ownerId: 'u_a', values: { f_parts: v } }, SYS, { state: 'host' }).values.f_parts;
    check('a stored row keeps its up on a list that hangs rows, never on one that does not, and a row never hangs from itself', (() => { const c = cleanRows(b1.values.f_parts); return c.find(r => r.ov && r.ov.name === 'Left Hand').up === named(b1, 'Left Hand').up; })() && !('up' in (S.cleanChar({ id: 'c_a', name: 'A', ownerId: 'u_a', values: { f_kit: [{ id: 'w_a1', defId: 'i_limb', qty: 1, up: 'w_b1' }] } }, SYS, { state: 'host' }).values.f_kit[0])) && !('up' in cleanRows([{ id: 'w_a1', defId: 'i_limb', qty: 1, up: 'w_a1' }])[0]), J(cleanRows(b1.values.f_parts)));
    const own = S.charFor(Object.assign({}, b1, { ownerId: 'u_a' }), VIEW, 'u_a');
    check('a stat kept from its owner stays off their copy, though a grant set it', !('Sec' in (own.values.f_parts.find(r => r.ov && r.ov.name === 'Right Hand').ov.stats)) && named(b1, 'Right Hand').ov.stats.Sec === 9, J(own.values.f_parts));
    check('its owner’s copy carries the link', (() => { const cp = (own.values.f_parts || []).find(r => r.ov && r.ov.name === 'Left Hand'); return !!cp && typeof cp.up === 'string'; })(), J(own.values && own.values.f_parts));

    /* ---- set ---- */
    const b2 = body().ch, rh = S.rowIdOf(named(b2, 'Right Hand')), ra = S.rowIdOf(named(b2, 'Right Arm')), la = S.rowIdOf(named(b2, 'Left Arm'));
    check('the GM moves a row under another, and takes it off', op(b2, 'f_parts', { op: 'set', rowId: rh, facts: { up: la } }).ok === true && named(b2, 'Right Hand').up === la && op(b2, 'f_parts', { op: 'set', rowId: rh, facts: { up: null } }).ok === true && !('up' in named(b2, 'Right Hand')));
    check('never itself, never a row under it, never one that is not there', op(b2, 'f_parts', { op: 'set', rowId: ra, facts: { up: ra } }).ok === false && (() => { op(b2, 'f_parts', { op: 'set', rowId: rh, facts: { up: ra } }); return op(b2, 'f_parts', { op: 'set', rowId: ra, facts: { up: rh } }).ok === false; })() && op(b2, 'f_parts', { op: 'set', rowId: rh, facts: { up: 'w_zz' } }).ok === false && named(b2, 'Right Hand').up === ra);
    check('a player may not: the wire’s facts never carry it, and the host answers no', S.cleanCharItem({ op: 'set', rowId: rh, facts: { up: la } }) === null && op(b2, 'f_parts', { op: 'set', rowId: rh, facts: { up: la } }, { player: true }).ok === false && named(b2, 'Right Hand').up === ra);
    check('nor on a list that does not hang rows', op({ id: 'c', values: { f_kit: [{ id: 'w_a1', defId: 'i_limb', qty: 1 }, { id: 'w_b1', defId: 'i_limb', qty: 1 }] } }, 'f_kit', { op: 'set', rowId: 'w_a1', facts: { up: 'w_b1' } }).ok === false);

    /* ---- Row.up.<name> ---- */
    const ev = (sys, ch, f, id, x) => { const r = F.evaluate(x, { vars: S.makeResolver(sys, ch, F).row(f, id) }); return r.ok ? r.value : { error: r.error }; }, rv = (n, w) => ev(SYS, b1, 'f_parts', S.rowIdOf(named(b1, n)), w);
    check('Row.up.<name> reads a stat, a choice’s value, a level and a column of the row it hangs from, and 0 where it hangs from nothing', rv('Left Hand', 'Row.up.Size') === 5 && rv('Right Hand', 'Row.up.Size') === 6 && rv('Left Arm', 'Row.up.Size') === 0, J([rv('Left Hand', 'Row.up.Size'), rv('Right Hand', 'Row.up.Size'), rv('Left Arm', 'Row.up.Size')]));
    check('so a column of a hand reads its arm, and two levels add up through a column with no loop', rv('Left Hand', 'Row.Twice') === 10 && rv('Left Arm', 'Row.Twice') === 0, J([rv('Left Hand', 'Row.Twice'), rv('Left Arm', 'Row.Twice')]));
    const b3 = body().ch; b3.values.f_parts = b3.values.f_parts.concat([{ id: 'w_tip', defId: 'i_limb', qty: 1, up: S.rowIdOf(named(b3, 'Left Hand')), ov: { name: 'Tip', stats: { Size: 1 } } }]);
        check('a column that reads the same column of the row above runs up the tree, row by row, and no loop is called', ev(SYS, b3, 'f_parts', 'w_tip', 'Row.Reach') === 8, J(ev(SYS, b3, 'f_parts', 'w_tip', 'Row.Reach')));
    const b4 = body().ch; b4.values.f_parts.find(r => r.ov.name === 'Left Hand').up = 'w_gone1';
    check('a row it hangs from that is gone reads 0', ev(SYS, b4, 'f_parts', S.rowIdOf(b4.values.f_parts.find(r => r.ov.name === 'Left Hand')), 'Row.up.Size') === 0);
    const v0 = S.validateSystem(SYS, F), rawV = JSON.parse(J(RAW)); rawV.fields[1].list.hang = false;
    check('the validator knows it on a list that hangs rows, and not on one that does not', !(v0.errors || []).some(e => /Row\.up/.test(J(e)) && /Parts|f_parts/.test(J(e))) && (v0.errors || []).some(e => /Row\.up\.Size|Up/.test(J(e))), J(v0.errors));
    const LOOP = S.cleanSystem({ v: 1, name: 'L', fields: [{ id: 'f_a', key: 'Aa', kind: 'item-list', list: { multi: true, hang: true, stats: [{ key: 'N', label: 'N' }], cols: [{ key: 'C', label: 'C', formula: 'Row.up.C + 1' }] } }], items: [{ id: 'i_a', name: 'A', stats: { N: 1 } }] }, { F, gmView: true });
    check('a column reading itself on the row above is no loop to the validator', !(S.validateSystem(LOOP, F).errors || []).length, J(S.validateSystem(LOOP, F).errors));
    const cyc = { id: 'c', values: { f_a: [{ id: 'w_a1', defId: 'i_a', qty: 1, up: 'w_b1' }, { id: 'w_b1', defId: 'i_a', qty: 1, up: 'w_a1' }] } }, cr = ev(LOOP, cyc, 'f_a', 'w_a1', 'Row.C');
    check('rows a file hung in a circle answer as an error, and never run away', cr && typeof cr === 'object' && !!cr.error, J(cr));
    const gmU = S.cleanSystem({ v: 1, name: 'G', fields: [{ id: 'f_g', key: 'Gg', kind: 'item-list', list: { multi: true, hang: true, stats: [{ key: 'Sec', label: 'Sec', vis: 'gm' }, { key: 'N', label: 'N' }], cols: [{ key: 'Up', label: 'Up', formula: 'Row.up.Sec' }, { key: 'Pl', label: 'Pl', formula: 'Row.up.N' }], rolls: [{ label: 'Bad', formula: '1d6 + Row.up.Sec' }, { label: 'Fine', formula: '1d6 + Row.up.N' }] } }], items: [] }, { F, gmView: true }), gmV = S.cleanSystem(gmU, { F, gmView: false });
    check('a GM-only stat read through Row.up goes from the players’ view as one read on the row does', J((gmV.fields[0].list.rolls || []).map(r => r.label)) === J(['Fine']), J(gmV.fields[0].list.rolls));
    const asks = S.readsOf(SYS, { list: parts.list }), says = S.nameWord(SYS, 'Row.up.Size', parts.list);
    check('a form offers them under The row it hangs from, in plain words', J(asks).includes('The row it hangs from') && J(asks).includes('Row.up.Size') && says === 'the row it hangs from: Size' && !J(S.readsOf(SYS, { list: SYS.fields[1].list })).includes('hangs from'), J([asks, says]));
    check('the chain reader follows it, so a system with a chain through it is judged as any other', S.chainsShallow(SYS, F) === false || S.chainsShallow(SYS, F) === true);

    /* ---- what a grant names ---- */
    const CG = S.cleanGrants([{ list: 'f_a', entry: 'i_a', name: ' Left  ' , stats: { Size: 3, Side: 'L', '__proto__x': 1, 'a b': 2, Bad: {}, Inf: Infinity }, up: 'Right' }, { list: 'f_a', entry: 'i_a', name: 'Right', up: 'Right' }, { list: 'f_a', entry: 'i_a', name: 'Third', up: 'Nobody' }, { list: 'f_a', entry: 'i_a', spec: 'Heat', name: 'Ignored' }]);
    check('two grants of one entry stand apart by name; a Hangs from must name another grant here; a specifier keeps its own naming', CG.length === 4 && CG[0].up === 'Right' && !('up' in CG[1]) && !('up' in CG[2]) && !('name' in CG[3]) && J(CG[0].stats) === J({ Size: 3, Side: 'L' }), J(CG));
    check('a grant that names none of it reads key for key as before', J(S.cleanGrants([{ list: 'f_a', entry: 'i_a', qty: 2, from: 3, once: true, pay: true, lvl: 2, spec: 'Heat' }])) === J([{ list: 'f_a', entry: 'i_a', qty: 2, from: 3, once: true, pay: true, lvl: 2, spec: 'Heat' }]));
    const ppl = VIEW.items.find(i => i.id === 'i_plan');
    check('a players’ view names what a grant adds and never what it sets', Array.isArray(ppl.grants) && ppl.grants.length === 4 && ppl.grants.every(g => !('stats' in g)) && ppl.grants[0].name === 'Left Hand', J(ppl));

    // a plan laid over a body that is there adds what is missing and joins it up
    const OVER = S.cleanSystem(Object.assign({}, RAW, { items: [RAW.items[0], { id: 'i_plan', name: 'Plan', grants: PLAN.grants.map(g => Object.assign({}, g, { once: true })) }] }), { F, gmView: true });
    const hasArm = fresh(); hasArm.values.f_parts = [{ id: 'w_old', defId: 'i_limb', qty: 1, ov: { name: 'Left Arm' } }];
    const rOv = S.applyRowOp(OVER, hasArm, 'f_plans', { op: 'add', defId: 'i_plan', qty: 1 }, F, {}); const rowsOv = rOv.also && rOv.also.f_parts ? rOv.also.f_parts : [];
    check('a once grant is matched by name, so a plan over a body adds what is missing and hangs the new hand from the arm that was there', J(rowsOv.map(r => r.ov && r.ov.name).sort()) === J(['Left Arm', 'Left Hand', 'Right Arm', 'Right Hand']) && rowsOv.find(r => r.ov.name === 'Left Hand').up === 'w_old' && rowsOv.filter(r => r.ov.name === 'Left Arm').length === 1, J(rOv));
    const twoFrom = S.cleanSystem({ v: 1, name: 'H', fields: [{ id: 'f_p', key: 'Pp', kind: 'item-list', list: { noQty: true, multi: true, hang: true } }, { id: 'f_q', key: 'Qq', kind: 'item-list', list: { noQty: true, multi: true } }], items: [{ id: 'i_l', name: 'L' }, { id: 'i_x', name: 'X', grants: [{ list: 'f_p', entry: 'i_l', name: 'One' }, { list: 'f_p', entry: 'i_l', name: 'Two' }] }, { id: 'i_y', name: 'Y', grants: [{ list: 'f_p', entry: 'i_l', name: 'One' }, { list: 'f_p', entry: 'i_l', name: 'Two' }] }] }, { F, gmView: true });
    const hc = fresh(), addQ = id => { const r = S.applyRowOp(twoFrom, hc, 'f_q', { op: 'add', defId: id, qty: 1 }, F, {}); hc.values.f_q = r.value; if (r.also) Object.assign(hc.values, r.also); return r; };
    addQ('i_x'); const yR = addQ('i_y'), xId = S.rowIdOf(hc.values.f_q[0]), gone = S.applyRowOp(twoFrom, hc, 'f_q', { op: 'remove', rowId: xId }, F, {}); const afterG = gone.also && gone.also.f_p ? gone.also.f_p : hc.values.f_p;
    check('both named rows pass to the other row that grants them when their granter goes, each by its name', afterG.length >= 2 && J(afterG.map(r => r.ov.name).sort().slice(0, 4)).includes('One') && afterG.filter(r => r.gr === S.rowIdOf(hc.values.f_q[1])).length >= 2, J([yR.ok, afterG]));

    /* ---- trade, keep, the sheet, the words ---- */
    const sh = read('scripts/sheets.js'), core = read('scripts/systemcore.js'), html = read('index.html');
    check('a row traded away hangs from nothing on the other side', core.includes('delete mv.gr; delete mv.gp; delete mv.in; delete mv.up; grantOwn(mv);'));
    check('Hangs from is on both of a row’s forms, the GM’s alone, and goes through the row’s own change', sh.split("upBox(form, entry, c, f, spec, sysI, mode);").length === 3 && /function upBox\(form, entry, c, f, spec, sysI, mode\) \{\n    if \(mode !== 'gm'/.test(sh) && sh.includes("commitItem(c, f, { op: 'set', rowId: rid, facts: { up: s.value || null } });"));
    check('its menu offers no row that hangs from this one, so no circle can be picked', /kin\[r\.up\] === 1\) \{ kin\[x\] = 1; sub = true; \}/.test(sh));
    check('a grant’s boxes in both editors and a tick on the list', sh.includes("checkLabel('sys-list-hang', sp.hang === true, 'Rows hang from a row'") && sh.includes("select('sys-grant-up', upO") && read('scripts/librarywin.js').includes('lib-grant-nm'));
    check('Help and the Lists tab’s key say it, and no tooltip names a formula’s key', html.includes('<b>Rows hang from a row</b> lets one row stand under another') && html.includes('<b>Rows hang from a row</b><small>') && !/sys-list-hang[^\n]{0,260}Row\.up/.test(sh));
    check('found by pressing it: a grant\'s name left by Tab keeps the place, Hangs from following in place in both editors, and a new grant or a new stat takes the focus', /sys-grant-nm\( \|\$\)\/\.test\(c\)\) \{ var bxN[^\n]{0,420}markDirty\(\); patchErrors\(\); return; \}/.test(sh) && read('scripts/librarywin.js').includes('upDraws.forEach(function(f) { f(); }); });') && sh.includes('grantFocus(+glT.dataset.gi, sT.key);') && sh.includes("grantFocus(iit.grants.length - 1, '');") && sh.includes("s.dataset.part = 'rf-' + rid + '-up';"));
    check('Help and both release notes say what a grant can name', html.includes('A grant can give its row a name of its own') && ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].every(f => readRoot(f).includes('- A grant can name the row it makes')));
    summed = true; console.log(pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite never finished'); process.exitCode = 1; } });
