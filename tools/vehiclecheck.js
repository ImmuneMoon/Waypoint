// vehiclecheck — vehicle and starship combat (1.6.2, docs/VEHICLE_COMBAT_DESIGN.md). Fold (a): a list ticked Rows are sheets, a row joined to a
// character sheet of the campaign, Row.sheet.<name> in each place a name is read, the one judge of a join, a new sheet made from a row, the figures
// a player's copy carries, and a trade that takes the sheet with its row. systemcore imported and run on invented data, the sheet's control sliced
// and run on a page of plain objects. No browser, no network.
'use strict';
const fs = require('fs'), path = require('path'), url = require('url');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 700))); } }
const J = JSON.stringify, NL = '\n', root = path.join(__dirname, '..');
const app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, NL), readRoot = p => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, NL);
(async () => {
    const S = await import(url.pathToFileURL(app('scripts/systemcore.js')).href), F = await import(url.pathToFileURL(app('scripts/formula.js')).href);
    /* ---- fold (a): Rows are sheets ---- */
    const RAW = { v: 1, name: 'Vehicles', fields: [
        { id: 'f_hp', key: 'HP', label: 'Hull', kind: 'number', def: 10 },
        { id: 'f_isv', key: 'IsVehicle', label: 'Is a vehicle', kind: 'toggle' },
        { id: 'f_sec', key: 'Secret', label: 'Secret', kind: 'number', def: 7, vis: 'gm' },
        { id: 'f_note', key: 'Note', label: 'Note', kind: 'text' },
        { id: 'f_veh', key: 'Vehicles', label: 'Vehicles', kind: 'item-list', list: { trade: true, sheets: { on: 'f_isv', tpl: 'c_tpl' }, cols: [{ key: 'Hull', label: 'Hull', formula: 'Row.sheet.HP' }, { key: 'Joined', label: 'Joined', formula: 'Row.sheet.has' }, { key: 'Sneak', label: 'Sneak', formula: 'Row.sheet.Secret + 1' }] } },
        { id: 'f_kit', key: 'Kit', label: 'Kit', kind: 'item-list', list: { cols: [{ key: 'Bad', label: 'Bad', formula: 'Row.sheet.HP' }] } }],
        items: [{ id: 'i_sk', key: 'Skiff', name: 'Skiff', category: '' }, { id: 'i_box', key: 'Box', name: 'Box', category: '' }] };
    const SYS = S.cleanSystem(RAW, { F, gmView: true }), VIEW = S.cleanSystem(RAW, { F, gmView: false }), vl = s => s.fields.find(f => f.id === 'f_veh').list;
    check('Rows are sheets is kept as an object in both views, its template the GM’s alone, its toggle only a toggle of the view, and a list with none has no key',
        J(vl(SYS).sheets) === J({ on: 'f_isv', tpl: 'c_tpl' }) && J(vl(VIEW).sheets) === J({ on: 'f_isv' }) && !('sheets' in (SYS.fields.find(f => f.id === 'f_kit').list || {}))
        && J(S.cleanSystem({ v: 1, name: 'B', fields: [{ id: 'f_n', key: 'N', kind: 'number' }, { id: 'f_x', key: 'X', kind: 'item-list', list: { sheets: { on: 'f_n', tpl: 'nobody' } } }] }, { F, gmView: true }).fields[1].list.sheets) === J({})
        && !('sheets' in (S.cleanSystem({ v: 1, name: 'B', fields: [{ id: 'f_x', key: 'X', kind: 'item-list', list: { sheets: 'yes' } }] }, { F, gmView: true }).fields[0].list || {})), J([vl(SYS), vl(VIEW)]));
    const chars0 = () => ({
        c_kael: { id: 'c_kael', name: 'Kael', ownerId: 'u_a', npc: false, values: { f_veh: [{ id: 'w_s1', defId: 'i_sk', qty: 1 }, { id: 'w_s2', defId: 'i_sk', qty: 1 }] } },
        c_bolt: { id: 'c_bolt', name: 'Bolt', ownerId: 'u_a', npc: false, values: { f_hp: 22, f_sec: 3 } },
        c_mira: { id: 'c_mira', name: 'Mira', ownerId: 'u_b', npc: false, values: { f_veh: [{ id: 'w_m1', defId: 'i_sk', qty: 1 }] } },
        c_tpl: { id: 'c_tpl', name: 'Skiff template', ownerId: '', npc: true, portrait: '/saves/images/skiff.png', values: { f_hp: 40, f_veh: [{ id: 'w_t1', defId: 'i_sk', qty: 1, sh: 'c_ghost' }] } },
        c_cart: { id: 'c_cart', name: 'Old cart', ownerId: '', npc: true, values: { f_hp: 4 } } });
    let C = chars0(); S.setLinkSource(id => C[id] || null);
    const set = (c, row, to, o) => S.rowSheetSet(SYS, C, C[c], 'f_veh', row, to, o);
    const jn = set('c_kael', 'w_s1', 'c_bolt', { player: true, pid: 'u_a' });
    check('a player joins a row of their own character to a sheet of their own: the list as it is to be stored, the row keeping the sheet’s id', jn.ok === true && jn.values.f_veh[0].sh === 'c_bolt' && !('sh' in C.c_kael.values.f_veh[0]), J(jn));
    C.c_kael.values.f_veh = jn.values.f_veh;
    const says = r => [r.ok, r.reason, r.msg];
    check('the one judge refuses, in its words: another player’s sheet, an NPC’s, a row of another player’s character, a sheet joined to another row (a player is never told whose), the sheet the row stands on, a sheet that is not here, a row that is not there',
        J(says(set('c_kael', 'w_s2', 'c_mira', { player: true, pid: 'u_a' }))) === J([false, 'owner', 'You can join only a sheet of your own.'])
        && set('c_kael', 'w_s2', 'c_cart', { player: true, pid: 'u_a' }).reason === 'owner'
        && J(says(set('c_mira', 'w_m1', 'c_bolt', { player: true, pid: 'u_a' }))) === J([false, 'owner', 'That row is not yours.'])
        && J(says(set('c_kael', 'w_s2', 'c_bolt', { player: true, pid: 'u_a' }))) === J([false, 'error', 'Bolt is joined to another row already. Take that join off first.'])
        && J(says(set('c_mira', 'w_m1', 'c_bolt', {}))) === J([false, 'error', 'Bolt is joined to Skiff of Kael already. Take that join off first.'])
        && set('c_kael', 'w_s2', 'c_kael', {}).reason === 'value' && set('c_kael', 'w_s2', 'c_zed', {}).reason === 'missing' && set('c_kael', 'w_zz', 'c_cart', {}).reason === 'missing', J(says(set('c_kael', 'w_s2', 'c_bolt', { player: true, pid: 'u_a' }))));
    check('the GM joins any sheet, an NPC’s too, and takes one off; a row that has none has nothing to take off', set('c_kael', 'w_s2', 'c_cart', {}).ok === true && (() => { const o = set('c_kael', 'w_s1', '', {}); return o.ok === true && !('sh' in o.values.f_veh[0]); })() && set('c_kael', 'w_s2', '', {}).reason === 'same');
    const cleanRows = (v, sys) => S.cleanChar({ id: 'c_kael', name: 'Kael', ownerId: 'u_a', values: v }, sys || SYS, { state: 'host' }).values;
    check('a stored row keeps its sheet on a list ticked Rows are sheets, never on another, and never an id that is no character’s', cleanRows({ f_veh: [{ id: 'w_s1', defId: 'i_sk', qty: 1, sh: 'c_bolt' }, { id: 'w_s2', defId: 'i_sk', qty: 1, sh: 'bolt' }] }).f_veh.map(r => r.sh || '').join() === 'c_bolt,'
        && !('sh' in cleanRows({ f_kit: [{ id: 'w_k1', defId: 'i_box', qty: 1, sh: 'c_bolt' }] }).f_kit[0]));
    /* ---- Row.sheet.<name> ---- */
    const ent = (c, sys) => S.resolveAll(sys || SYS, c, F).f_veh.cells, cell = (cs, row, key) => ((cs[row] || []).find(x => x.key === key) || {}).value;
    const cs1 = ent(C.c_kael);
    check('Row.sheet.<name> reads the joined sheet live, Row.sheet.has is 1 while it is joined, and both read 0 with no sheet', cell(cs1, 'w_s1', 'Hull') === 22 && cell(cs1, 'w_s1', 'Joined') === 1 && cell(cs1, 'w_s2', 'Hull') === 0 && cell(cs1, 'w_s2', 'Joined') === 0, J(cs1));
    C.c_bolt.values.f_hp = 17;
    check('... and follows the sheet as it changes', cell(ent(C.c_kael), 'w_s1', 'Hull') === 17);
    const nest = chars0(); nest.c_bolt.values.f_veh = [{ id: 'w_b1', defId: 'i_sk', qty: 1, sh: 'c_cart' }]; nest.c_kael.values.f_veh[0].sh = 'c_bolt'; C = nest;
    check('one level deep: the joined sheet’s own joins read 0 from it, so two sheets joined each to the other never loop', (() => { C.c_cart.values.f_veh = [{ id: 'w_c1', defId: 'i_sk', qty: 1, sh: 'c_bolt' }]; const r = S.makeResolver(SYS, C.c_kael, F); return cell(ent(C.c_kael), 'w_s1', 'Hull') === 22 && cell(ent(C.c_bolt), 'w_b1', 'Hull') === 4; })(), J(ent(C.c_kael)));
    C = chars0(); C.c_kael.values.f_veh[0].sh = 'c_bolt';
    /* ---- the players' view ---- */
    check('a column that reads a GM-only figure of the joined sheet is GM only in the players’ view, as one that reads the character’s own would be; one that reads a visible figure stays',
        vl(VIEW).cols.find(c => c.key === 'Sneak') && vl(VIEW).cols.find(c => c.key === 'Sneak').formula === null && vl(VIEW).cols.find(c => c.key === 'Hull').formula === 'Row.sheet.HP', J(vl(VIEW).cols));
    check('the GM-only judges read Row.sheet.<name> as the name it reads there', J(S.gmOnlyNames(SYS, [{ name: 'Row.sheet.Secret' }, { name: 'Row.sheet.HP' }])) === J(['Row.sheet.Secret']));
    const own = S.charFor(C.c_kael, VIEW, 'u_a', {});
    check('its owner’s copy carries the row’s sheet', own.values.f_veh[0].sh === 'c_bolt', J(own.values));
    S.setLinkSource((id, s) => { const c = C[id]; return !c ? null : s === SYS ? c : S.charForView(c, s, { full: SYS }); });
    const sk = S.sheetFigs(VIEW, own, F);
    check('the host works out the figures a player’s copy reads, through the players’ view: what the system’s formulas read of a row’s sheet, never a GM-only figure, by row', J(sk) === J({ w_s1: { id: 'c_bolt', name: 'Bolt', v: { hp: 22 } } }), J(sk));
    const back = S.cleanChar(Object.assign(JSON.parse(J(own)), { sk: Object.assign({}, sk, { w_s2: { id: 'nope', v: { hp: 1 } }, __proto__x: 1, w_s3: { id: 'c_cart', name: '<b>x</b>', v: { hp: 'lots', 'x.y.z.a.b.c.d.e': 2, constructor: 3 } } }) }), VIEW, { state: 'owner' });
    S.setLinkSource(null);
    const rP = S.resolveAll(VIEW, back, F).f_veh.cells;
    check('a player’s app keeps the figures only as numbers and true or false, by row ids and plain names, and reads them as the host does', J(back.sk.w_s1) === J({ id: 'c_bolt', name: 'Bolt', v: { hp: 22 } }) && !back.sk.w_s2 && J(back.sk.w_s3.v) === J({}) && cell(rP, 'w_s1', 'Hull') === 22 && cell(rP, 'w_s1', 'Joined') === 1 && cell(rP, 'w_s2', 'Joined') === 0, J([back.sk, rP]));
    S.setLinkSource(id => C[id] || null);
    /* ---- the validator and the words ---- */
    const errs = sys => S.validateSystem(S.cleanSystem(sys, { F, gmView: true }), F).errors.map(e => e.message);
    const vRaw = JSON.parse(J(RAW)); vRaw.fields[4].list.cols.push({ key: 'Nope', label: 'Nope', formula: 'Row.sheet.Nothing' });
    check('the validator takes Row.sheet.<name> where its list is ticked and the name is a field of the system, and refuses one that names nothing, or on a list not ticked', errs(RAW).filter(m => /sheet/i.test(m)).length === 1 && errs(vRaw).filter(m => /Nothing/.test(m)).length === 1, J([errs(RAW), errs(vRaw)]));
    check('it says Row.sheet.<name> in words, and offers the sheet’s figures as a group of its own', S.nameWord(SYS, 'Row.sheet.HP', vl(SYS)) === 'its sheet’s Hull' && S.nameWord(SYS, 'Row.sheet.has', vl(SYS)) === 'whether it is joined to a sheet'
        && S.readsOf(SYS, { list: vl(SYS) }).some(g => g && g.name === 'Its sheet' && g.items.some(i => i.s === 'Row.sheet.HP') && g.items.some(i => i.s === 'Row.sheet.has')), J(S.readsOf(SYS, { list: vl(SYS) })));
    /* ---- a new sheet ---- */
    const nw = S.sheetFromRow(SYS, C, C.c_kael, 'f_veh', C.c_kael.values.f_veh[1], 'c_new');
    check('a new sheet made from a row is a copy of the list’s template, its rows joined to nothing, under the row’s name, its owner the row’s owner, the list’s toggle switched on, and the template’s picture', nw.name === 'Skiff' && nw.ownerId === 'u_a' && nw.npc === false && nw.values.f_hp === 40 && nw.values.f_isv === true && !('sh' in nw.values.f_veh[0]) && nw.portrait === '/saves/images/skiff.png' && C.c_tpl.values.f_veh[0].sh === 'c_ghost', J(nw));
    const noT = JSON.parse(J(RAW)); delete noT.fields[4].list.sheets.tpl; const sysN = S.cleanSystem(noT, { F, gmView: true }), npcRow = S.sheetFromRow(sysN, C, C.c_cart, 'f_veh', { id: 'w_q', defId: 'i_box', qty: 1 }, 'c_n2');
    check('with no template it starts at the system’s defaults with the toggle on, and a row of an NPC makes an NPC', J(npcRow.values) === J({ f_isv: true }) && npcRow.npc === true && npcRow.ownerId === '' && npcRow.name === 'Box', J(npcRow));
    /* ---- a trade takes the sheet with its row ---- */
    const go = (to, vals, camp) => S.sheetsGo(SYS, camp || { chars: C }, C[to], vals);
    const v1 = { f_veh: [{ id: 'w_s1', defId: 'i_sk', qty: 1, sh: 'c_bolt' }] }, g1 = go('c_mira', v1);
    check('a sheet goes with its row to the receiver’s player', J(g1) === J({ drop: 0, give: ['c_bolt'] }) && C.c_bolt.ownerId === 'u_b' && v1.f_veh[0].sh === 'c_bolt', J([g1, C.c_bolt]));
    C = chars0(); const v2 = { f_veh: [{ id: 'w_s1', defId: 'i_sk', qty: 1, sh: 'c_bolt' }] }, g2 = go('c_mira', v2, { chars: C, players: { u_a: { charId: 'c_bolt' } } });
    check('never a player’s character in play: that join is dropped and the sheet stays theirs', J(g2) === J({ drop: 1, give: [] }) && !('sh' in v2.f_veh[0]) && C.c_bolt.ownerId === 'u_a', J([g2, v2]));
    C = chars0(); const v3 = { f_veh: [{ id: 'w_s1', defId: 'i_sk', qty: 1, sh: 'c_mira' }] }, g3 = go('c_mira', v3), v4 = { f_veh: [{ id: 'w_s1', defId: 'i_sk', qty: 1, sh: 'c_cart' }] }, g4 = go('c_cart', v4);
    check('a row that comes to the sheet it is joined to lets it go, and to an NPC a sheet becomes an NPC’s', J(g3) === J({ drop: 1, give: [] }) && !('sh' in v3.f_veh[0]) && J(g4) === J({ drop: 1, give: [] }) && (() => { C = chars0(); const v5 = { f_veh: [{ id: 'w_s1', defId: 'i_sk', qty: 1, sh: 'c_bolt' }] }; S.sheetsGo(SYS, { chars: C }, C.c_cart, v5); return C.c_bolt.npc === true && C.c_bolt.ownerId === ''; })(), J([g3, g4]));
    C = chars0(); C.c_kael.values.f_veh = [{ id: 'w_s1', defId: 'i_sk', qty: 1, sh: 'c_bolt' }]; C.c_mira.values.f_veh = [{ id: 'w_m1', defId: 'i_sk', qty: 1 }];
    const tr = S.tradeApply(SYS, C.c_kael, C.c_mira, [{ fid: 'f_veh', rowId: 'w_s1', qty: 1 }], [], 'gm', 'gm', {});
    check('a traded row joined to a sheet stands alone on the receiver’s list, never stacked onto a row of the same entry, and keeps its sheet', tr.ok === true && (tr.valuesB.f_veh || []).length === 2 && tr.valuesB.f_veh.some(r => r.sh === 'c_bolt'), J(tr));
    C = chars0(); C.c_kael.values.f_veh = [{ id: 'w_s1', defId: 'i_sk', qty: 3, sh: 'c_bolt' }];
    const tr2 = S.tradeApply(SYS, C.c_kael, C.c_mira, [{ fid: 'f_veh', rowId: 'w_s1', qty: 1 }], [], 'gm', 'gm', {});
    check('a stack split by a trade keeps its sheet on the row it came from', tr2.ok === true && tr2.valuesA.f_veh[0].sh === 'c_bolt' && tr2.valuesB.f_veh.every(r => r.sh === undefined), J(tr2));
    /* ---- a sheet deleted, and the player's message ---- */
    C = chars0(); C.c_kael.values.f_veh[0].sh = 'c_bolt';
    check('a sheet deleted: every row joined to it lets it go, and names the characters it changed', J(S.rowSheetsDrop(SYS, C, 'c_bolt')) === J(['c_kael']) && !('sh' in C.c_kael.values.f_veh[0]));
    const cl = m => S.cleanCharLink(Object.assign({ rid: 'k1', charId: 'c_kael' }, m));
    check('a player’s join is a char-link that names a row: a field and a row by their ids, a sheet or none, or make with no sheet named; any other shape is no message', J(cl({ row: { f: 'f_veh', r: 'w_s1' }, to: 'c_bolt' })) === J({ rid: 'k1', charId: 'c_kael', row: { f: 'f_veh', r: 'w_s1' }, to: 'c_bolt' })
        && J(cl({ row: { f: 'f_veh', r: 'w_s1' }, make: true })) === J({ rid: 'k1', charId: 'c_kael', row: { f: 'f_veh', r: 'w_s1' }, to: '', make: true })
        && [cl({ row: { f: 'f_veh', r: 'w_s1' }, to: 'c_bolt', make: true }), cl({ row: { f: 'veh', r: 'w_s1' } }), cl({ row: { f: 'f_veh', r: '__proto__' } }), cl({ row: { f: 'f_veh', r: 'w_s1' }, to: 5 })].every(x => x === null));
    /* ---- the sheet's control, on a page of plain objects ---- */
    {
        const sh = read('scripts/sheets.js'), sl = sh.slice(sh.indexOf('// [sinkcheck:rowsheet-start]'), sh.indexOf('// [sinkcheck:rowsheet-end]'));
        const mk = (tag, cls, text) => { const n = { tag, cls: cls || '', kids: [], attrs: {}, style: {}, title: '', disabled: false, on: {}, appendChild(k) { this.kids.push(k); return k; }, setAttribute(k, v) { this.attrs[k] = v; }, addEventListener(t, f) { this.on[t] = f; }, get childNodes() { return this.kids; } }; if (text !== undefined) n.kids.push({ text: String(text) }); return n; };
        const camp = { system: SYS, chars: chars0() }; camp.chars.c_kael.values.f_veh[0].sh = 'c_bolt'; camp.chars.c_bolt.portrait = '/saves/images/bolt.png'; camp.chars.c_bolt.name = '<img src=x onerror=1>';
        const opened = [], api = new Function('el', 'getActiveCampaign', 'charById', 'canOpen', 'openSheet', 'imgSrc', 'rowIdOf', 'isClient', sl + '\nreturn { sheetCtl: sheetCtl };')(
            mk, () => camp, id => camp.chars[id] || null, () => true, id => opened.push(id), p => 'IMG:' + p, S.rowIdOf, () => false);
        const spec = vl(SYS), w = api.sheetCtl(camp.chars.c_kael.values.f_veh[0], camp.chars.c_kael, { id: 'f_veh' }, spec, true), btn = w.kids[0];
        const txt = n => (n.kids || []).map(k => k.text !== undefined ? k.text : txt(k)).join('');
        check('a joined row shows its sheet’s picture through imgSrc and its name as a text node, and a press opens that sheet', btn.kids[0].tag === 'img' && btn.kids[0].src === 'IMG:/saves/images/bolt.png' && txt(btn) === '<img src=x onerror=1>' && (btn.on.click(), opened[0] === 'c_bolt') && txt(w.kids[1]) === 'Change…', J(w));
        const w2 = api.sheetCtl(camp.chars.c_kael.values.f_veh[1], camp.chars.c_kael, { id: 'f_veh' }, spec, true), w3 = api.sheetCtl(camp.chars.c_kael.values.f_veh[1], camp.chars.c_kael, { id: 'f_veh' }, spec, false), w4 = api.sheetCtl(camp.chars.c_kael.values.f_veh[0], camp.chars.c_kael, { id: 'f_kit' }, {}, true);
        check('a row with no sheet offers Join a sheet to whoever may join it and shows nothing to anyone else, and a list not ticked shows nothing', txt(w2) === 'Join a sheet…' && w3 === null && w4 === null);
        check('the menu lists only the player’s own sheets on a player’s app, never one joined to another row, with Make a new sheet first; every name set as text', /isClient\(\) \|\| \(!x\.npc && x\.ownerId === me && x\.shared !== 1\)/.test(sl) && /!taken\[x\.id\]/.test(sl) && /add\('Make a new sheet'/.test(sl) && !/innerHTML/.test(sl));
        check('on a player’s app a join is sent and waited for, and on the GM’s judged by rowSheetSet and stored with a step log', /nR\.charRowSheet\(c\.id, f\.id, rid, toId, make === true\)/.test(sl) && /rowSheetSet\(sys, cs, c, f\.id, rid, made \? made\.id : toId, \{\}\)/.test(sl) && /wpStepLog\('rowsheet v1'/.test(sl));
        check('the row control stands on a row and in a rich table, for the GM where the sheet may be changed and for a player on their own open sheet', (sh.match(/sheetCtl\(entry, c, f, spec, !hudRow && \(gm \? chg : !!ownOk\)\)/g) || []).length === 2);
    }
    /* ---- fold (c): marks one token holds on another ---- */
    {
        const RAWC = { v: 1, name: 'Craft', fields: [{ id: 'f_pil', key: 'Pilot', label: 'Piloting', kind: 'number', def: 12 }, { id: 'f_hit', key: 'Hit', label: 'To hit', kind: 'formula', formula: 'Pilot + if(Target.marked.Hound, 2, 0)' }, { id: 'f_hd', key: 'Hounded', label: 'Hounded', kind: 'formula', formula: 'Marked.Hound' }],
            tags: [{ key: 'Hound', label: 'Hound', fight: true }, { key: 'Track', label: 'Track', turn: true }, { key: 'Hound', label: 'Twice' }, { key: 'bad key', label: 'x' }, { key: 'Lock', label: '<b>Lock</b>' }],
            rolls: [{ id: 'r_hd', label: 'Hound them', kind: 'apply', apply: [{ tag: 'Hound' }, { tag: 'Track', on: false }, { tag: 'Track', on: false }] }] };
        const SC2 = S.cleanSystem(RAWC, { F, gmView: true }), VC2 = S.cleanSystem(RAWC, { F, gmView: false });
        check('fold (c): a system names its marks, each key once, its label as text, ending with the fight or at its holder\u2019s turn\u2019s end only as true, the same in both views', J(SC2.tags) === J([{ key: 'Hound', label: 'Hound', fight: true }, { key: 'Track', label: 'Track', turn: true }, { key: 'Lock', label: '<b>Lock</b>' }]) && J(VC2.tags) === J(SC2.tags), J(SC2.tags));
        const act = SC2.rolls.find(r => r.id === 'r_hd');
        check('a change puts a mark on the target or takes one off, once a mark and a when, with no amount', J(act.apply) === J([{ tag: 'Hound', on: true }, { tag: 'Track', on: false }]), J(act.apply));
        let sunk = []; S.setTagSink(m => sunk.push(m));
        const ch = { id: 'c_p', name: 'Pilot', ownerId: 'u_a', values: {} }, vars = S.makeResolver(SC2, ch, F);
        const tc = { self: 'tok_a', range: { mod: 0, dist: 5, tid: 'tok_b', mapId: 'm1' } };
        const r1 = S.applyAct(SC2, ch, act, vars, F, tc);
        check('applyAct hands the host what a change put on and took off, from the token it is used by on its target, and says each on the card as an effect is', r1.ok === true && J(sunk[0]) === J([{ mapId: 'm1', by: 'tok_a', on: 'tok_b', k: 'Hound', put: true }, { mapId: 'm1', by: 'tok_a', on: 'tok_b', k: 'Track', put: false }]) && J(r1.lines) === J([{ n: 'Hound', fx: 1 }, { n: 'Track', fx: 0 }]), J([r1, sunk]));
        sunk = []; const r2 = S.applyAct(SC2, ch, act, vars, F, { self: 'tok_a' });
        check('with no target it does nothing, and says so as any change that moves nothing', r2.ok === false && r2.reason === 'none' && sunk.length === 0, J(r2));
        S.setTagSink(null);
        let list = S.tagsMove(SC2, [], [{ mapId: 'm1', by: 'tok_a', on: 'tok_b', k: 'hound', put: true }, { mapId: 'm1', by: 'tok_a', on: 'tok_b', k: 'Hound', put: true }, { mapId: 'm1', by: 'tok_c', on: 'tok_b', k: 'Track', put: true }, { mapId: 'm1', by: 'tok_a', on: 'tok_a', k: 'Hound', put: true }, { mapId: 'm1', by: 'tok_a', on: 'tok_b', k: 'Nope', put: true }]);
        check('a map keeps each mark once a pair, in the system\u2019s spelling, never a token on itself nor a mark the system lacks', list.changed === true && J(list.list) === J([{ k: 'Hound', by: 'tok_a', on: 'tok_b' }, { k: 'Track', by: 'tok_c', on: 'tok_b' }]), J(list));
        const off = S.tagsMove(SC2, list.list, [{ by: 'tok_a', on: 'tok_b', k: 'Hound', put: false }]);
        check('taken off, it is gone, and taking off what is not there changes nothing', J(off.list) === J([{ k: 'Track', by: 'tok_c', on: 'tok_b' }]) && S.tagsMove(SC2, off.list, [{ by: 'tok_a', on: 'tok_b', k: 'Hound', put: false }]).changed === false);
        check('a map\u2019s stored marks are read back as data: a key, two token ids, never junk or a prototype\u2019s key', J(S.cleanMapTags([{ k: 'Hound', by: 'a', on: 'b' }, { k: 'Hound', by: 'a', on: 'b' }, { k: '__proto__', by: 'a', on: 'b' }, { k: 'Hound', by: '<x>', on: 'b' }, 5, null, { k: 'Track', by: 'a', on: 'a' }], SC2)) === J([{ k: 'Hound', by: 'a', on: 'b' }]));
        const ends = S.tagsEnd(SC2, [{ k: 'Hound', by: 'a', on: 'b' }, { k: 'Track', by: 'a', on: 'b' }, { k: 'Track', by: 'c', on: 'b' }, { k: 'Lock', by: 'a', on: 'b' }], { turn: 'a' }), endF = S.tagsEnd(SC2, ends.list, { fight: true });
        check('a mark ticked to end at its holder\u2019s turn\u2019s end goes when that holder\u2019s turn ends, one ticked to end with the fight when the fight ends, and the rest stay', J(ends.list) === J([{ k: 'Hound', by: 'a', on: 'b' }, { k: 'Track', by: 'c', on: 'b' }, { k: 'Lock', by: 'a', on: 'b' }]) && J(endF.list) === J([{ k: 'Track', by: 'c', on: 'b' }, { k: 'Lock', by: 'a', on: 'b' }]), J([ends, endF]));
        const mapT = { id: 'm1', whiteboard: [] };
        S.setTagSource(m => m === mapT ? [{ k: 'Hound', by: 'tok_a', on: 'tok_b' }, { k: 'Track', by: 'tok_c', on: 'tok_a' }] : []);
        const ctxA = S.tokenCtx(mapT, { id: 'tok_a', x: 0, y: 0 }, {}), ctxB = S.tokenCtx(mapT, { id: 'tok_b', x: 0, y: 0 }, {}), ctxZ = S.tokenCtx({ id: 'm2', whiteboard: [] }, { id: 'tok_a' }, {});
        check('the token context says the token it is read for and the marks around it: those it holds by target, those held on it', ctxA.self === 'tok_a' && J(ctxA.tags) === J({ on: { track: 1 }, held: { tok_b: { hound: 1 } } }) && J(ctxB.tags) === J({ on: { hound: 1 }, held: {} }) && !('tags' in ctxZ), J([ctxA, ctxB]));
        const rA = S.makeResolver(SC2, ch, F, Object.assign({}, ctxA, { range: { mod: 0, dist: 3, tid: 'tok_b', mapId: 'm1' } })), rA2 = S.makeResolver(SC2, ch, F, Object.assign({}, ctxA, { range: { mod: 0, dist: 3, tid: 'tok_c', mapId: 'm1' } })), rB = S.makeResolver(SC2, ch, F, ctxB), r0 = S.makeResolver(SC2, ch, F);
        check('Target.marked.<key> reads 1 while this token holds that mark on its target and 0 on any other; Marked.<key> 1 while any token holds it on this one; both 0 with no token', rA('Hit') === 14 && rA2('Hit') === 12 && rB('Hounded') === 1 && rA('Hounded') === 0 && r0('Hit') === 12 && r0('Hounded') === 0, J([rA('Hit'), rA2('Hit'), rB('Hounded'), r0('Hit')]));
        S.setTagSource(null);
        const errsC = raw => S.validateSystem(S.cleanSystem(raw, { F, gmView: true }), F).errors.map(e => e.message);
        const badC = JSON.parse(J(RAWC)); badC.fields.push({ id: 'f_x', key: 'X', kind: 'formula', formula: 'Target.marked.Nope + Marked.Nope' }); badC.rolls.push({ id: 'r_x', label: 'X', kind: 'apply', apply: [{ tag: 'Gone' }] });
        check('the validator knows both names where the system has that mark, and names a mark it does not have, in a formula and in a change', errsC(RAWC).length === 0 && errsC(badC).filter(m => /no mark Nope/.test(m)).length === 2 && errsC(badC).some(m => /That mark is not in this system any more/.test(m)), J([errsC(RAWC), errsC(badC)]));
        check('and says them in words', S.nameWord(SC2, 'Target.marked.Hound') === 'whether you hold Hound on the target' && S.nameWord(SC2, 'Marked.Hound') === 'whether Hound is held on them');
        const sh = read('scripts/sheets.js'), wb = read('scripts/whiteboard.js'), nt = read('scripts/net.js');
        check('the System editor names marks on the Rules tab and a change can put one on or take one off; the sheet registers the map\u2019s marks as this screen holds them', /function renderTags\(\)/.test(sh) && /'Mark the target: '/.test(sh) && /ch\.tag = v\.slice\(4\); ch\.on = v\.charAt\(2\) === '\+';/.test(sh) && /setTagSource\(function\(map\) \{ var n = net\(\); return n && typeof n\.tagsOf === 'function'/.test(sh) && /setTagSink\(function\(moves\)/.test(sh));
        check('a map\u2019s marks are the host\u2019s own, kept off every copy of the map; a player is sent those their own tokens hold or are held by, never one of a hidden token; they end with the fight and at a holder\u2019s turn', (nt.match(/'setups', 'tags'\]\.forEach/g) || []).length === 2 && /mine\(t\.by\) \|\| mine\(t\.on\)/.test(nt) && /!w\.hidden && !w\.waiting/.test(nt) && /tagsEnded\(mapId, \{ fight: true \}\)/.test(nt) && /tagsEnded\(mapId, \{ turn: row\.tokId \}\)/.test(nt));
        // the board's line and tag, on a page of plain objects
        const slT = wb.slice(wb.indexOf('// [vehiclecheck:tagsdraw-start]'), wb.indexOf('// [vehiclecheck:tagsdraw-end]'));
        const mk = tag => ({ tag, attrs: {}, kids: [], on: {}, textContent: '', setAttribute(k, v) { this.attrs[k] = String(v); }, appendChild(k) { this.kids.push(k); return k; }, removeChild(k) { this.kids.splice(this.kids.indexOf(k), 1); }, get firstChild() { return this.kids[0] || null; }, addEventListener(t2, fn) { this.on[t2] = fn; } });
        const layer = mk('svg'), doc = { getElementById: id => id === 'tagLayer' ? layer : null, createElementNS: (ns, t2) => mk(t2) };
        const map2 = { id: 'm1', whiteboard: [{ id: 'tok_a', x: 0, y: 0, w: 60, h: 52, isChar: true }, { id: 'tok_b', x: 200, y: 100, w: 60, h: 52, isChar: true }] }, taken = [];
        const net2 = { tagsOf: () => [{ k: 'Lock', by: 'tok_a', on: 'tok_b' }, { k: 'Hound', by: 'tok_a', on: 'tok_gone' }], tagsTakeOff: (mid, t2) => { taken.push([mid, t2.k]); return true; } };
        const draw = gmT => new Function('document', 'window', 'getActiveCampaign', 'playerScreen', 'state', 'toast', slT + '\nreturn tagsDraw;')(doc, { wpSystemCore: S, wpNet: net2 }, () => ({ system: SC2 }), () => !gmT, { streamMode: false }, () => {});
        draw(true)(map2); const g = layer.kids[0];
        check('the board draws a mark as a dashed line from its holder to its target with a dot at the target and its name as a text node, the GM\u2019s tag taking it off at a press; a mark whose token is gone draws nothing', layer.kids.length === 1 && g.kids[0].tag === 'line' && g.kids[0].attrs.x1 === '30' && g.kids[0].attrs.x2 === '230' && g.kids[1].tag === 'circle' && g.kids[2].textContent === '<b>Lock</b>' && g.kids[2].attrs.class === 'tag-mark-off' && (g.kids[2].on.click({ stopPropagation() {} }), J(taken) === J([['m1', 'Lock']])), J(layer));
        draw(false)(map2);
        check('a player\u2019s board draws the line and the tag, and offers nothing to press', layer.kids.length === 1 && !layer.kids[0].kids[2].attrs.class && !layer.kids[0].kids[2].on.click);
    }
    /* ---- fold (c), part two: what ends a mark by its own rules ---- */
    {
        const RAWD = { v: 1, name: 'Craft', fields: [{ id: 'f_pil', key: 'Pilot', label: 'Piloting', kind: 'number', def: 12 }, { id: 'f_fx', key: 'Fx', label: 'Effects', kind: 'effects' }],
            effects: [{ id: 'e_stun', name: 'Stunned', mods: [] }, { id: 'e_down', name: 'Down', mods: [] }],
            tags: [{ key: 'Hound', label: 'Hound', sight: true, check: 'move' }, { key: 'Track', label: 'Track', keep: 'Pilot > 20' }, { key: 'Lock', label: 'Lock', endFx: ['e_stun', 'e_stun', 'bad', 'e_down'], check: 'turn' }, { key: 'Pin', label: 'Pin', keep: 'Pilot > 1', check: 'turn' }, { key: 'Odd', label: 'Odd', sight: 'yes', check: 'move' }],
            rolls: [{ id: 'r_sh', label: 'Shake it', kind: 'apply', apply: [{ tag: 'Hound', shake: true }, { tag: 'Hound', shake: true }, { tag: 'Hound', on: false }] }] };
        const SD = S.cleanSystem(RAWD, { F, gmView: true }), VD = S.cleanSystem(RAWD, { F, gmView: false });
        check('part two: what ends a mark is kept in the GM\u2019s view alone, each only as written (out of sight only as true, Kept while as text, when it is judged only beside one of those two, an effect by its id once and no more than eight), and the players\u2019 view keeps the mark with none of it',
            J(SD.tags) === J([{ key: 'Hound', label: 'Hound', sight: true, check: 'move' }, { key: 'Track', label: 'Track', keep: 'Pilot > 20' }, { key: 'Lock', label: 'Lock', endFx: ['e_stun', 'e_down'] }, { key: 'Pin', label: 'Pin', keep: 'Pilot > 1', check: 'turn' }, { key: 'Odd', label: 'Odd' }])
            && J(VD.tags) === J([{ key: 'Hound', label: 'Hound' }, { key: 'Track', label: 'Track' }, { key: 'Lock', label: 'Lock' }, { key: 'Pin', label: 'Pin' }, { key: 'Odd', label: 'Odd' }]), J([SD.tags, VD.tags]));
        const shA = SD.rolls.find(r => r.id === 'r_sh');
        check('Shake off is a change of its own, once a mark and a when, beside Take off the target', J(shA.apply) === J([{ tag: 'Hound', shake: true }, { tag: 'Hound', on: false }]), J(shA.apply));
        let sunk = []; S.setTagSink(m => sunk.push(m));
        const chD = { id: 'c_p', name: 'Pilot', ownerId: 'u_a', values: {} }, varsD = S.makeResolver(SD, chD, F);
        const rS = S.applyAct(SD, chD, { id: 'r_x', label: 'X', kind: 'apply', apply: [{ tag: 'Hound', shake: true }] }, varsD, F, { self: 'tok_b', selfMap: 'm1' });
        const rS0 = S.applyAct(SD, chD, { id: 'r_x', label: 'X', kind: 'apply', apply: [{ tag: 'Hound', shake: true }] }, varsD, F, { self: 'tok_b' });
        check('a Shake off hands the host the mark taken off the one it is used by, whoever holds it, and needs no target; with no map it does nothing', rS.ok === true && J(sunk[0]) === J([{ mapId: 'm1', on: 'tok_b', k: 'Hound', put: false, any: true }]) && rS0.ok === false && sunk.length === 1, J([rS, rS0, sunk]));
        S.setTagSink(null);
        const shk = S.tagsMove(SD, [{ k: 'Hound', by: 'tok_a', on: 'tok_b' }, { k: 'Hound', by: 'tok_c', on: 'tok_b' }, { k: 'Track', by: 'tok_a', on: 'tok_b' }, { k: 'Hound', by: 'tok_a', on: 'tok_c' }], [{ mapId: 'm1', on: 'tok_b', k: 'hound', put: false, any: true }]);
        check('the map lets go of that mark on that token from every holder, and of nothing else', shk.changed === true && J(shk.list) === J([{ k: 'Track', by: 'tok_a', on: 'tok_b' }, { k: 'Hound', by: 'tok_a', on: 'tok_c' }]), J(shk));
        const chFx = { id: 'c_q', values: { f_fx: [{ id: 'x_1', ref: 'e_stun', on: true }, { id: 'x_2', ref: 'e_down', on: false }, { id: 'x_3', name: 'Own' }] } };
        check('fxOnIds names the library effects a character has on, by id, and no row switched off', J(S.fxOnIds(SD, chFx, F)) === J({ e_stun: 1 }) && J(S.fxOnIds(SD, { values: {} }, F)) === J({}), J(S.fxOnIds(SD, chFx, F)));
        const badD = JSON.parse(J(RAWD)); badD.tags[1].keep = 'Pilot >'; badD.tags[2].endFx = ['e_gone'];
        const vD = S.validateSystem(S.cleanSystem(badD, { F, gmView: true }), F);
        check('the validator reads Kept while as a formula of the holder\u2019s names and says an effect that ends a mark and is no longer in the system', vD.errors.some(e => e.prop === 'tag.keep') && vD.warnings.some(w => w.prop === 'tag.endfx' && /An effect that ended Lock/.test(w.message)) && S.validateSystem(SD, F).errors.length === 0, J(vD));
        // the judge, sliced from sheets.js and run on stand-ins of the page and the table
        const shJ = read('scripts/sheets.js'), slJ = shJ.slice(shJ.indexOf('// [vehiclecheck:tagjudge-start]'), shJ.indexOf('// [vehiclecheck:tagjudge-end]'));
        const tok = (id, ch, x) => ({ id, charId: ch, isChar: true, x, y: 0, w: 60, h: 52 });
        const mapJ = { id: 'm1', type: 'map', whiteboard: [tok('tA', 'c_a', 0), tok('tB', 'c_b', 120), tok('tC', 'c_c', 240), tok('tD', 'c_d', 360)] };
        let marks = [{ k: 'Hound', by: 'tA', on: 'tB' }, { k: 'Track', by: 'tA', on: 'tC' }, { k: 'Lock', by: 'tD', on: 'tB' }, { k: 'Pin', by: 'tD', on: 'tC' }, { k: 'Pin', by: 'tA', on: 'tGone' }];
        const campJ = { id: 'k', system: SD, items: { m1: mapJ }, chars: { c_a: { id: 'c_a', values: { f_pil: 12 } }, c_b: { id: 'c_b', values: { f_fx: [{ id: 'x_1', ref: 'e_stun', on: true }] } }, c_c: { id: 'c_c', values: {} }, c_d: { id: 'c_d', values: { f_pil: 12 } } } };
        const offs = [], logs = [], netJ = { tagsOf: () => marks.slice(), tagsPut: m => { offs.push(m); marks = S.tagsMove(SD, marks, m).list; return m.length; } }, sees = { v: true };
        const jud = (o) => new Function('window', 'F', 'getActiveCampaign', 'isClient', 'canWrite', 'net', 'tokenFlags', slJ + '\nreturn { tagJudge: tagJudge, tagsMoved: tagsMoved, tagsTurn: tagsTurn };')({ wpSystemCore: S, wpFog: { tokSees: () => sees.v }, wpStepLog: (a, b, c) => logs.push([a, b, c]) }, () => F, () => campJ, () => !!(o && o.client), () => true, () => netJ, () => ({}));
        const J1 = jud();
        sees.v = false; J1.tagJudge(null);
        check('a look ends at once: a mark whose token is gone, one an effect it names is on for either token (here the target is Stunned), and one whose Kept while does not hold; one judged at the end of a move or a turn waits, out of sight or not',
            J(marks) === J([{ k: 'Hound', by: 'tA', on: 'tB' }, { k: 'Pin', by: 'tD', on: 'tC' }]) && J(logs) === J([['marks v1', 'ended', { keep: 1, effect: 1, gone: 1 }]]), J([marks, logs]));
        J1.tagsMoved(mapJ, 'tD');
        check('another token\u2019s move leaves a mark judged at the end of its holder\u2019s move as it is', marks.length === 2);
        J1.tagsMoved(mapJ, 'tA');
        check('its holder\u2019s move ends it where its holder no longer sees the target', J(marks) === J([{ k: 'Pin', by: 'tD', on: 'tC' }]), J(marks));
        campJ.chars.c_d.values.f_pil = 1; J1.tagJudge(null);
        check('a Kept while that fails is not read before the turn it waits for', marks.length === 1);
        J1.tagsTurn('m1', 'tD');
        check('it ends at its holder\u2019s turn\u2019s end where it still does not hold then', marks.length === 0, J(marks));
        marks = [{ k: 'Track', by: 'tA', on: 'tC' }]; const J2 = jud({ client: true }); J2.tagJudge(null);
        check('a player\u2019s app judges nothing: only the machine that owns the campaign ends a mark', marks.length === 1);
        const fgS = read('scripts/fog.js'), ntS = read('scripts/net.js');
        // a map with no grid: the line from one token's middle to the other's against each wall's own lines, sliced from fog.js and run with the real fogcore
        const FC = await import(url.pathToFileURL(app('scripts/fogcore.js')).href), slF = fgS.slice(fgS.indexOf('function tokSeesFree('), fgS.indexOf('function lightSeen('));
        const free = new Function('eligibleBlocker', slF + '\nreturn tokSeesFree;')(w => w.blocksSight === true && !w.hidden);
        const tA = { id: 'a', x: 0, y: 0, w: 60, h: 52 }, tB = { id: 'b', x: 300, y: 0, w: 60, h: 52 }, wl = { id: 'w', type: 'path', x: 150, y: -100, w: 4, h: 300, baseW: 4, baseH: 300, pts: [[0, 0], [0, 300]], blocksSight: true };
        const box = { id: 'k', type: 'rect', x: 140, y: 10, w: 20, h: 20, blocksSight: true, rot: 0 }, see = (wb) => free({ whiteboard: wb }, tA, tB, FC);
        check('on a map with no grid a wall line or a wall block between the two tokens hides one from the other; one beside the line, a hidden wall, a see-through barrier and the tokens themselves do not',
            see([wl]) === false && see([box]) === false && see([Object.assign({}, wl, { x: 400 })]) === true && see([Object.assign({}, wl, { hidden: true })]) === true && see([Object.assign({}, wl, { blocksSight: undefined, barrier: true })]) === true && see([Object.assign({}, tA, { blocksSight: true })]) === true && see([]) === true);
        check('out of sight is the fog\u2019s own sight where the fog is drawn over the target, else the map\u2019s walls; the holder\u2019s move and turn hand the judge what it waits for; the System editor sets each part; Kept while is a form',
            /function tokSees\(map, camp, from, to\)/.test(fgS) && /tokSees: tokSees/.test(fgS) && /if \(drawn\) \{ var t = lightSeen\(from, to, map, camp\); return typeof t === 'number' && t > 0; \}/.test(fgS) && /return C\.lineClear\(a, b, grid, blockersFor\(map, grid\)\);/.test(fgS)
            && /window\.wpSheets\.tagsMoved\(map, item\.id\)/.test(ntS) && /window\.wpSheets\.tagsTurn\(mapId, row\.tokId\)/.test(ntS)
            && /'Ends out of sight'/.test(shJ) && /'sys-tag-keep field'/.test(shJ) && /Judged at the end of its holder/.test(shJ) && /'field sys-tag-fx'/.test(shJ) && /'Shake off: '/.test(shJ) && /'sys-tag-keep': 'cond'/.test(read('scripts/formbox.js')));
    }
    /* ---- fold (b), rebuilt: the system's own arcs, and a row's arc ---- */
    {
        const ARCS = [{ label: 'Front', f: -60, t: 60 }, { label: 'Right', f: 30, t: 150 }, { label: 'Rear', f: 120, t: -120 }, { label: 'Turret', all: true }, { key: 'Bow', label: 'Bow guns', f: -30, t: 30 },
            { label: 'front', f: 0, t: 1 }, { label: '', f: 0, t: 9 }, { label: 'Ghost', f: 0 }, { label: '9 lives', f: 0, t: 9 }, { label: 'Wide', f: 999, t: -181 }, 'junk', null];
        const ARAW = { v: 1, name: 'Guns', combat: { arcs: ARCS }, fields: [
            { id: 'f_hp', key: 'HP', label: 'Hull', kind: 'number', def: 10 },
            { id: 'f_gun', key: 'Guns', label: 'Guns', kind: 'item-list', list: {
                stats: [{ key: 'Mount', label: 'Mount', kind: 'pick', opts: [{ label: 'Front', name: 'Front' }, { label: 'Left', name: 'Left' }, { label: 'Rear', name: 'Rear' }, { label: 'Turret', name: 'Turret' }, { label: 'Bow', name: 'Bow' }] }, { key: 'Secret', label: 'Secret', kind: 'pick', vis: 'gm', opts: [{ label: 'A', name: 'A' }] }],
                arc: { by: 'mount', cover: [{ v: 'Front', f: 0, t: 1 }] },
                rolls: [{ label: 'Fire', formula: '3d6 <= 12', needs: 'Target.inArc = 1' }] } },
            { id: 'f_box', key: 'Box', label: 'Box', kind: 'item-list', list: { stats: [{ key: 'Secret', label: 'Secret', kind: 'pick', vis: 'gm', opts: [{ label: 'A', name: 'A' }] }], arc: { by: 'Secret' } } },
            { id: 'f_bad', key: 'Bad', label: 'Bad', kind: 'formula', formula: 'Target.inArc' },
            { id: 'f_tok', key: 'Tok', label: 'Tok', kind: 'formula', formula: 'Arc.Turret + Threats.Rear' },
            { id: 'f_gh', key: 'Gh', label: 'Gh', kind: 'formula', formula: 'Arc.Ghost' }],
            items: [{ id: 'i_las', key: 'Laser', name: 'Laser', category: '', stats: { Mount: 'Front' } }, { id: 'i_tur', key: 'Turret', name: 'Turret gun', category: '', stats: { Mount: 'Turret' } }, { id: 'i_rr', key: 'Tail', name: 'Tail gun', category: '', stats: { Mount: 'Rear' } }, { id: 'i_bow', key: 'BowGun', name: 'Bow gun', category: '', stats: { Mount: 'Bow' } }, { id: 'i_lft', key: 'Port', name: 'Port gun', category: '', stats: { Mount: 'Left' } }, { id: 'i_none', key: 'Loose', name: 'Loose', category: '' }] };
        const AS = S.cleanSystem(ARAW, { F, gmView: true }), AV = S.cleanSystem(ARAW, { F, gmView: false }), gl = s => s.fields.find(f => f.id === 'f_gun').list;
        const wantArcs = [{ key: 'Front', label: 'Front', f: -60, t: 60 }, { key: 'Right', label: 'Right', f: 30, t: 150 }, { key: 'Rear', label: 'Rear', f: 120, t: -120 }, { key: 'Turret', label: 'Turret', all: true }, { key: 'Bow', label: 'Bow guns', f: -30, t: 30 }, { key: 'Wide', label: 'Wide', f: -81, t: 179 }];
        check('the system names its own arcs, each a name and whole degrees or all round, a short name made from its name where none is given, the same in both views; one with no name, no To, a short name taken or one that cannot begin with a letter goes',
            J(AS.combat.arcs) === J(wantArcs) && J(AV.combat.arcs) === J(wantArcs) && !('arcs' in S.cleanSystem({ v: 1, name: 'B', fields: [] }, { F, gmView: true }).combat) && S.cleanArcs([]) === null && S.cleanArcs('x') === null
            && S.cleanArcs(Array.from({ length: 50 }, (_, i) => ({ label: 'A' + i, all: true }))).length === S.ARC_MAX && S.arcKey('bow guns') === 'bowGuns' && S.arcKey('9 lives') === '', J([AS.combat.arcs]));
        check('an arc is found by its short name, else by its name, either ignoring case', S.arcNamed(AS.combat.arcs, 'bow').label === 'Bow guns' && S.arcNamed(AS.combat.arcs, 'BOW GUNS').key === 'Bow' && S.arcNamed(AS.combat.arcs, 'Nose') === null && S.arcNamed(null, 'Front') === null);
        const ev = (txt, ro, sys) => { const r = F.evaluate(txt, { vars: S.makeResolver(sys || AS, { id: 'c', values: {} }, F, ro) }); return r.ok ? r.value : 'err:' + (r.error && r.error.message || ''); };
        const fx = (deg, th, sides) => ({ facing: { deg, sides: sides || 6, threats: th } });
        const pick = (deg, th) => ['Arc.Front', 'Arc.Right', 'Arc.Rear', 'Arc.Turret', 'Arc.Bow'].map(n => ev(n + ' * 1', fx(deg, th)));
        check('Arc.<name> reads 1 where the hit comes from inside that arc, read from the token\u2019s own facing, and arcs that overlap both read it',
            J(pick(0, [120])) === J([0, 1, 1, 1, 0]) && J(pick(0, [0])) === J([1, 0, 0, 1, 1]) && J(pick(0, [180])) === J([0, 0, 1, 1, 0]) && J(pick(90, [0])) === J([0, 0, 0, 1, 0]) && J(pick(90, [180])) === J([0, 1, 0, 1, 0]) && J(pick(0, [])) === J([1, 0, 0, 1, 1]), J([pick(0, [120]), pick(90, [0]), pick(90, [180])]));
        check('Threats.<name> counts the threats in that arc, each threat in every arc that holds it', ev('Threats.Right', fx(0, [120, 60])) === 2 && ev('Threats.Front', fx(0, [120, 60])) === 1 && ev('Threats.Rear', fx(0, [120, 60])) === 1 && ev('Threats.Turret', fx(0, [120, 60, 0])) === 3 && ev('Threats.Front', fx(0, [])) === 0);
        const SF = S.cleanSystem({ v: 1, name: 'F', combat: { arcs: [{ label: 'front', f: -30, t: 30 }] }, fields: [] }, { F, gmView: true }), S0 = S.cleanSystem({ v: 1, name: 'Z', fields: [] }, { F, gmView: true });
        check('with no arcs named a token reads the front, side and rear its grid gives, as before; an arc of the system named front wins over that one; left and right are no names of their own',
            ev('Arc.front * 1', fx(0, [60]), S0) === 1 && ev('Arc.front * 1', fx(0, [60]), SF) === 0 && ev('Arc.side * 1', fx(0, [120]), S0) === 1 && String(ev('Arc.left', fx(0, [-120]), S0)).indexOf('err:') === 0 && String(ev('Threats.right', fx(0, [120]), S0)).indexOf('err:') === 0
            && S.FACING_NAMES.indexOf('Arc.left') < 0 && S.FACING_NAMES.indexOf('Threats.right') < 0 && J(S.FACING_NAMES) === J(['Facing', 'Arc', 'Arc.front', 'Arc.side', 'Arc.rear', 'Threats', 'Threats.front', 'Threats.side', 'Threats.rear']));
        check('a field named Arc keeps the whole family, the system\u2019s own arcs too', String(ev('Arc.Turret', fx(0, [0]), S.cleanSystem({ v: 1, name: 'A', combat: { arcs: [{ label: 'Turret', all: true }] }, fields: [{ id: 'f_a', key: 'Arc', kind: 'number', def: 4 }] }, { F, gmView: true }))).indexOf('err:') === 0);
        check('Arcs by keeps the stat alone, by its own spelling, the same in both views; never a GM-only stat, and a list that names none has no key',
            J(gl(AS).arc) === J({ by: 'Mount' }) && J(gl(AV).arc) === J({ by: 'Mount' }) && !('arc' in (AS.fields.find(f => f.id === 'f_box').list || {}))
            && !('arc' in (S.cleanSystem({ v: 1, name: 'B', fields: [{ id: 'f_x', key: 'X', kind: 'item-list', list: {} }] }, { F, gmView: true }).fields[0].list || {})) && J(S.cleanArc({ by: 'pos' }, [{ key: 'Pos', kind: 'number', labels: ['Ahead'] }])) === J({ by: 'Pos' }));
        check('an arc holds a bearing from its From clockwise to its To, both ends in, across the turn of the compass; All round holds every bearing; anything else holds none',
            [0, 60, -60].every(b => S.arcHolds({ f: -60, t: 60 }, b)) && ![61, -61, 180].some(b => S.arcHolds({ f: -60, t: 60 }, b)) && [120, 180, -120, -150].every(b => S.arcHolds({ f: 120, t: -120 }, b)) && !S.arcHolds({ f: 120, t: -120 }, 90)
            && S.arcHolds({ all: true }, 37) && S.arcHolds({ f: 10, t: 10 }, 10) && !S.arcHolds({ f: 10, t: 10 }, 11) && !S.arcHolds({ f: 0, t: 90 }, NaN) && !S.arcHolds(null, 0));
        const mapH = { id: 'm1', meta: { gridType: 'hex' }, whiteboard: [] }, ship = { id: 't_s', x: 0, y: 0, w: 60, h: 52, rot: 0 }, east = { id: 't_e', x: 300, y: 0, w: 60, h: 52 }, north = { id: 't_n', x: 0, y: -300, w: 60, h: 52 }, south = { id: 't_x', x: 0, y: 300, w: 60, h: 52 };
        const rcE = S.rangeCtx(AS, mapH, ship, east, { F }), rcN = S.rangeCtx(AS, mapH, ship, north, { F }), rcTurn = S.rangeCtx(AS, mapH, Object.assign({}, ship, { rot: 60, front: 30 }), east, { F }), rcS = S.rangeCtx(AS, mapH, ship, south, { F });
        check('the range carries the target\u2019s bearing from the roller\u2019s facing, turned with its token and its front, and withRange hands it on; a system whose rows say no arc carries none, so every other range is as before',
            rcE.rb === 90 && rcN.rb === 0 && rcTurn.rb === 0 && rcS.rb === 180 && S.withRange({}, rcE).range.rb === 90 && !('rb' in S.rangeCtx(S0, mapH, ship, east, { F })), J([rcE, rcN, rcTurn, rcS]));
        const ch = { id: 'c_s', name: 'Skiff', values: { f_gun: [{ id: 'w_l', defId: 'i_las', qty: 1 }, { id: 'w_t', defId: 'i_tur', qty: 1 }, { id: 'w_r', defId: 'i_rr', qty: 1 }, { id: 'w_b', defId: 'i_bow', qty: 1 }, { id: 'w_p', defId: 'i_lft', qty: 1 }, { id: 'w_n', defId: 'i_none', qty: 1 }] } };
        const inArc = (rc, row) => { const fn = S.makeResolver(AS, ch, F, rc ? S.withRange({}, rc) : {}); const rv = fn.row('f_gun', row); const r = F.evaluate('Target.inArc', { vars: rv }); return [r.ok ? r.value : 'err', fn.rangeRead && fn.rangeRead()]; };
        check('Target.inArc reads 1 where the target stands in the arc the row\u2019s value names, by the arc\u2019s short name or its name, 0 where it does not, for a value that names no arc, a row with no value and with no target, and it counts as reading the range',
            J(inArc(rcN, 'w_l')) === J([1, true]) && J(inArc(rcE, 'w_l')) === J([0, true]) && J(inArc(rcE, 'w_t')) === J([1, true]) && J(inArc(rcS, 'w_r')) === J([1, true]) && J(inArc(rcN, 'w_r')) === J([0, true])
            && J(inArc(rcN, 'w_b')) === J([1, true]) && J(inArc(rcE, 'w_b')) === J([0, true]) && inArc(rcN, 'w_p')[0] === 0 && inArc(rcN, 'w_n')[0] === 0 && inArc(null, 'w_t')[0] === 0 && inArc(rcTurn, 'w_l')[0] === 1, J([inArc(rcN, 'w_l'), inArc(rcE, 'w_l'), inArc(rcE, 'w_t'), inArc(rcS, 'w_r'), inArc(rcN, 'w_b')]));
        const resA = S.resolveAll(AS, ch, F, S.withRange({}, rcE)), resN = S.resolveAll(AS, ch, F, S.withRange({}, rcN)), rnOf = (res, row) => { const rn = res.f_gun && res.f_gun.rn; return rn && rn[row] ? rn[row] : null; };
        check('a roll\u2019s needs read it, so the sheet greys a gun whose target is out of its arc and leaves one in arc to press', J(rnOf(resA, 'w_l')) !== J(rnOf(resN, 'w_l')) && J(rnOf(resA, 'w_t')) === J(rnOf(resN, 'w_t')), J([rnOf(resA, 'w_l'), rnOf(resN, 'w_l')]));
        const vr = S.validateSystem(AS, F), vBad = vr.errors.filter(e => e.id === 'f_bad').map(e => e.message).join('|');
        check('the validator knows Target.inArc in a list\u2019s own formulas where the list says its rows\u2019 arcs, and knows Arc.<name> and Threats.<name> for every arc the system names and no other',
            !vr.errors.some(e => e.id === 'f_gun' || e.id === 'f_tok') && /known only in a list whose rows say their arc/.test(vBad) && vr.errors.some(e => e.id === 'f_gh') && S.nameWord(AS, 'Target.inArc') === 'whether the target stands in this row\u2019s arc'
            && S.nameWord(AS, 'Arc.Bow') === 'whether it is attacked from its Bow guns arc' && S.nameWord(AS, 'Threats.Rear') === 'the threats in its Rear arc', J(vr.errors));
        const rdA = S.readsOf(AS, { list: gl(AS) }), rdB = S.readsOf(AS, {}), tokG = rdB.find(g => g.name === 'This token'), tokS = tokG ? tokG.items.map(x => x.s) : [];
        check('the boxes of such a list offer Target.inArc under Its arc, and every box offers the system\u2019s own arcs under This token', rdA.some(g => g.name === 'Its arc') && !rdB.some(g => g.name === 'Its arc') && ['Arc.Front', 'Arc.Turret', 'Arc.Bow', 'Threats.Turret', 'Threats.Wide'].every(n => tokS.indexOf(n) >= 0), J(tokS));
        const shA = read('scripts/sheets.js'), uiA = read('scripts/sysui.js');
        check('the Combat tab has Arcs, its own listeners and its short name made once, and the Lists tab\u2019s Arcs by says which arc each value reaches, with no degrees of its own; the layout names them so none falls to More',
            /\n    tp\('arcs'\); if \(typeof arcsBox === 'function'\) arcsBox\(box, cm\);/.test(shA) && /^function arcsBox\(box, cm\) \{/m.test(shA) && /input\('sys-arc-label field'/.test(shA) && /checkLabel\('sys-arc-all'/.test(shA) && /'tool ghost sys-btn sys-arc-add', '\+ Arc'/.test(shA) && /if \(a\._new \|\| !a\.key\) a\.key = keyFor\(a, a\.label\)/.test(shA)
            && /names no arc yet, so it reaches nowhere/.test(shA) && !/sys-list-arcf|sys-list-arcall/.test(shA) && /if \(t\.value\) lsc\.arc = \{ by: t\.value \}; else delete lsc\.arc;/.test(shA)
            && /\['arcs', 'Arcs', 0, \['sys-list-arcby', 'sys-arcs'\]\]/.test(uiA) && /\['arcs', 'Arcs', 'The arcs a hit can come from, and a gun can fire into\.'\]\]/.test(uiA));
    }
    /* ---- fold (f): a row picked at random, and a card to the crew ---- */
    {
        const FRAW = { v: 1, name: 'Ship', fields: [
            { id: 'f_hp', key: 'HP', label: 'Hull', kind: 'number', def: 10 },
            { id: 'f_sys', key: 'Systems', label: 'Systems', kind: 'item-list', list: { on: { label: 'Working', def: true }, stats: [{ key: 'State', label: 'State' }, { key: 'Big', label: 'Big' }] } },
            { id: 'f_bag', key: 'Bag', label: 'Bag', kind: 'item-list', list: { stats: [{ key: 'State', label: 'State' }] } },
            { id: 'f_gmq', key: 'Hidden', label: 'Hidden', kind: 'item-list', vis: 'gm', list: { on: { label: 'On' } } }],
            items: [{ id: 'i_eng', key: 'Engine', name: 'Engine', category: '', stats: { Big: 1 } }, { id: 'i_gun', key: 'Gun', name: 'Gun', category: '', stats: { Big: 0 } }, { id: 'i_sen', key: 'Sensor', name: 'Sensor', category: '', vis: 'gm', stats: { Big: 0 } }],
            links: [{ id: 'lk_c', key: 'Ship', label: 'Ship', kind: 'crew', stations: ['Gunner', 'Pilot'], most: 2, edit: 'gm' }],
            rolls: [
                { id: 'r_hit', label: 'Crit', apply: [{ rand: 'f_sys', test: 'Row.Big = 0', offToo: true, next: { s: 'state', formula: '2', set: true } }] },
                { id: 'r_on', label: 'Knock', apply: [{ rand: 'f_sys' }] },
                { id: 'r_bad', label: 'Bad', apply: [{ rand: 'f_bag' }, { rand: 'f_sys', next: { s: 'State', formula: '1', set: true } }] },
                { id: 'r_gm', label: 'Gm', apply: [{ rand: 'f_gmq' }] },
                { id: 'r_dmg', label: 'Shock', formula: '3d6 <= HP' },
                { id: 'r_atk', label: 'Atk', formula: '3d6 <= 12', calls: [{ roll: 'r_dmg', when: 'hit', crew: ['Gunner', 'gunner', 'Bad name!'] }, { roll: 'r_dmg', when: 'miss', crew: 'all' }, { roll: 'r_dmg', crew: 'all', to: 'self', when: 'resisted' }], resistBy: 'r_dmg' }] };
        const FS = S.cleanSystem(FRAW, { F, gmView: true }), FV = S.cleanSystem(FRAW, { F, gmView: false }), rl = (sys, id) => sys.rolls.find(r => r.id === id);
        check('a random row is kept on a system’s change of a list with a switch, its next step respelled as the list spells the stat and kept only beside Rows already off may be picked; a list with no switch keeps none',
            J(rl(FS, 'r_hit').apply) === J([{ rand: 'f_sys', test: 'Row.Big = 0', offToo: true, next: { s: 'State', formula: '2', set: true } }]) && J(rl(FS, 'r_on').apply) === J([{ rand: 'f_sys' }])
            && J(rl(FS, 'r_bad').apply.map(c => c.rand || '')) === J(['', 'f_sys']) && !('next' in rl(FS, 'r_bad').apply[1]), J([rl(FS, 'r_hit'), rl(FS, 'r_bad')]));
        check('the players’ view keeps it where they hold the list, and a pick on a GM-only list leaves their view', J(rl(FV, 'r_hit').apply) === J(rl(FS, 'r_hit').apply) && !(rl(FV, 'r_gm') && (rl(FV, 'r_gm').apply || []).some(c => c.rand)), J([rl(FV, 'r_hit'), rl(FV, 'r_gm')]));
        const shipC = () => ({ id: 'c_ship', name: 'Skiff', ownerId: 'u_a', npc: false, values: { f_hp: 10, f_sys: [{ id: 'w_e', defId: 'i_eng', qty: 1 }, { id: 'w_g', defId: 'i_gun', qty: 1 }, { id: 'w_s', defId: 'i_sen', qty: 1, on: false }] } });
        const pick = (act, face, ch0) => { const ch = ch0 || shipC(); const D = { random: f => Math.min(f, face) }; return S.applyAct(FS, ch, act, S.makeResolver(FS, ch, F), F, null, null, null, D); };
        const p1 = pick(rl(FS, 'r_hit'), 1), p2 = pick(rl(FS, 'r_hit'), 2);
        check('a pick is among the rows its test lets, rows already off too where ticked: a row on is switched off, and the card says so', p1.ok === true && p1.values.f_sys.find(r => r.id === 'w_g').on === false && J(p1.lines[0]) === J({ f: 'f_sys', n: 'Gun switched off', d: -1, v: 0, roll: 'Picked at random' }), J(p1));
        check('a row already off takes its next step, its stat set as the GM’s own figure, and a GM-only row is said as A row', p2.ok === true && p2.values.f_sys.find(r => r.id === 'w_s').ov.stats.State === 2 && /^A row: State$/.test(p2.lines[0].n) && p2.lines[0].roll === 'Picked at random, already off', J(p2));
        const p3 = pick(rl(FS, 'r_on'), 1), chOff = shipC(); chOff.values.f_sys.forEach(r => { r.on = false; }); const p4 = pick(rl(FS, 'r_on'), 1, chOff);
        check('with Rows already off unticked only rows that are on are picked, and with none to pick the card says so and nothing moves', p3.ok === true && p3.values.f_sys.find(r => r.id === 'w_e').on === false && p4.ok === true && p4.lines.some(l => l.say === 'No row to pick.') && !(p4.values && p4.values.f_sys), J([p3, p4]));
        const chN = shipC(); chN.values.f_sys = [{ id: 'w_x', defId: 'i_gun', qty: 1, on: false }];
        const p5 = pick({ id: 'r_x', label: 'X', kind: 'apply', apply: [{ rand: 'f_sys', offToo: true }] }, 1, chN), p6 = S.applyAct(FS, shipC(), rl(FS, 'r_on'), S.makeResolver(FS, shipC(), F), F);
        check('a row already off with no next step: nothing more happens, said; and only the table’s host picks, so with no dice core nothing moves', p5.ok === true && p5.lines.some(l => l.say === 'Already off: nothing more happens.') && p6.ok === false && /host picks a row at random/.test(p6.message || ''), J([p5, p6]));
        check('a pick on a GM-only list is the GM’s card', S.applyScope(FS, shipC(), rl(FS, 'r_gm'), false, F) === 'gm' && S.applyScope(FS, shipC(), rl(FS, 'r_hit'), false, F) === 'owner', J([S.applyScope(FS, shipC(), rl(FS, 'r_gm'), false, F), S.applyScope(FS, shipC(), rl(FS, 'r_hit'), false, F)]));
        const vf = S.validateSystem(Object.assign({}, FS, { rolls: FS.rolls.concat([{ id: 'r_v', label: 'V', apply: [{ rand: 'f_sys', test: 'Row.Nope = 1' }] }]) }), F);
        check('the validator reads the test with the list’s own row names', vf.errors.some(e => e.id === 'r_v') && !vf.errors.some(e => e.id === 'r_hit'), J(vf.errors));
        check('a call’s crew is All crew or up to eight stations each once by its spelling, kept beside a system roll and dropped where the card goes to the roller',
            J(rl(FS, 'r_atk').calls.map(c => c.crew || null)) === J([['Gunner'], 'all', null]) && S.cleanCrew('all') === 'all' && S.cleanCrew([]) === null && S.cleanCrew('Gunner') === null && S.cleanCrew(Array.from({ length: 12 }, (_, i) => 'S' + i)).length === S.CREW_STNS, J(rl(FS, 'r_atk').calls));
        const chars = { c_ship: shipC(), c_g: { id: 'c_g', name: 'Gunner A', ownerId: 'u_b', values: { f_hp: 5 }, links: { lk_c: 'c_ship' }, stn: { lk_c: 'Gunner' } }, c_p: { id: 'c_p', name: 'Pilot B', ownerId: 'u_c', values: {}, links: { lk_c: 'c_ship' }, stn: { lk_c: ['pilot', 'Gunner'] } },
            c_x: { id: 'c_x', name: 'Elsewhere', ownerId: 'u_d', values: {}, links: { lk_c: 'c_other' }, stn: { lk_c: 'Gunner' } }, c_n: { id: 'c_n', name: 'No post', ownerId: '', npc: true, values: {}, links: { lk_c: 'c_ship' } } };
        check('the crew a card goes to: everyone linked to that sheet by a Crew link at a station named, ignoring case, or every one of them for All crew', J(S.crewAt(FS, chars, 'c_ship', ['Gunner'])) === J(['c_g', 'c_p']) && J(S.crewAt(FS, chars, 'c_ship', ['PILOT'])) === J(['c_p'])
            && J(S.crewAt(FS, chars, 'c_ship', 'all')) === J(['c_g', 'c_p', 'c_n']) && J(S.crewAt(FS, chars, 'c_ship', null)) === J([]), J([S.crewAt(FS, chars, 'c_ship', ['Gunner']), S.crewAt(FS, chars, 'c_ship', 'all')]));
        const om = S.cleanSystem(Object.assign({}, FRAW, { combat: { damage: { main: 'f_hp', major: 'Blow.wound > 5', onMajor: [{ roll: 'r_dmg', crew: 'all' }, { roll: 'r_dmg', if: 'Blow.wound > 9', crew: ['Pilot'] }], onWound: [{ roll: 'r_dmg', crew: ['Gunner'] }, { fx: 'nope', crew: 'all' }] } } }), { F, gmView: true }).combat.damage;
        check('a Major Wound’s row and an Any wound row keep their crew beside their roll', om && J((Array.isArray(om.onMajor) ? om.onMajor : [om.onMajor]).map(o => o.crew || null)) === J(['all', ['Pilot']]) && J(om.onWound.map(o => o.crew || null)) === J([['Gunner']]), J(om));
        const netSrc = fs.readFileSync(app('scripts/net.js'), 'latin1').replace(/\r\n/g, NL), a0 = netSrc.indexOf('[netcheck:rollcalls-start]'), a1 = netSrc.indexOf('[netcheck:rollcalls-end]');
        const posted = [], vm = require('vm'), ctx = { window: { wpFormula: F }, net: { blowMake: (c, r) => 'b_' + c.id, postDue: (c, r, why, n, toO, o) => posted.push([c.id, r.id, why, toO, o.by]) }, _attempts: {}, SC: () => S, console };
        vm.createContext(ctx); vm.runInContext(netSrc.slice(netSrc.indexOf(NL, a0) + 1, netSrc.lastIndexOf(NL, a1)), ctx);
        const camp = { system: FS, chars };
        ctx.net.callsAfter(camp, rl(FS, 'r_atk'), true, S.makeResolver(FS, chars.c_ship, F), chars.c_ship, false);
        check('on the host a call to the crew posts one card to each crew sheet at a station it names, to that sheet’s player, and none to the vehicle', J(posted) === J([['c_g', 'r_dmg', 'called', true, 'Atk'], ['c_p', 'r_dmg', 'called', true, 'Atk']]), J(posted));
        posted.length = 0; ctx.net.callsAfter(camp, rl(FS, 'r_atk'), false, S.makeResolver(FS, chars.c_ship, F), chars.c_ship, true);
        check('All crew posts to every one, an NPC’s to the GM, and a private roll’s to the GM alone', J(posted.map(p => [p[0], p[3]])) === J([['c_g', false], ['c_p', false], ['c_n', false]]), J(posted));
        check('Save says what it does with a crew card it cannot keep: no station ticked, or a card to the roller, goes to the character instead', J(S.crewDrops({ calls: [{ roll: 'r_dmg', crew: [] }, { roll: 'r_dmg', crew: 'all' }, { roll: 'r_dmg', when: 'resisted', to: 'self', crew: 'all' }, { roll: 'r_dmg' }] })) === J(['Calls for' + S.CREW_NONE, 'Calls for cannot go to the crew here, so Save sends the card to the character.']) && /none is ticked/.test(S.CREW_NONE), J(S.crewDrops({ calls: [{ roll: 'r_dmg', crew: [] }] })));
        check('the editor says a Major Wound\u2019s or an Any wound row\u2019s crew card with no station ticked', /warn\('A Major Wound' \+ CREW_NONE\)/.test(read('scripts/sheets.js')) && /warn\('Any wound' \+ CREW_NONE\)/.test(read('scripts/sheets.js')) && /crewDrops\(r\)\.forEach/.test(read('scripts/sheets.js')));
        const shF = read('scripts/sheets.js'), fbF = read('scripts/formbox.js');
        check('the System editor offers a random row as a change’s target with its own box, and who a call’s card goes to on Calls for, a Major Wound and Any wound; their formulas are forms reading the list’s rows',
            /^function randTargets\(ch\) \{/m.test(shF) && /^function randBox\(ch\) \{/m.test(shF) && /^function crewPick\(obj, redraw\) \{/m.test(shF) && /if \(v\.indexOf\('rnd:'\) === 0\) \{ ch\.rand = v\.slice\(4\);/.test(shF)
            && /rw\.appendChild\(crewPick\(c, draw\)\)/.test(shF) && /rM\.appendChild\(crewPick\(om,/.test(shF) && /rw\.appendChild\(crewPick\(w,/.test(shF) && /cl\.contains\('sys-rnd-test'\) \|\| cl\.contains\('sys-rnd-next'\)/.test(shF)
            && /'sys-rnd-test': 'cond', 'sys-rnd-next': 'amt'/.test(fbF) && /if \(f\.crew\) \{/.test(shF));
    }
    /* ---- fold (e): blasts at scale ---- */
    {
        const BC = await import(url.pathToFileURL(app('scripts/blastcore.js')).href);
        const ERAW = (unit, scale) => ({ v: 1, name: 'Blasts', combat: Object.assign({ blast: { fall: 'BlastDamage * HitScale', each: '2 + MapCell', radius: 'BlastRadius * MapCell', frag: { reach: 'FragDice * MapCell' }, scale: scale } }, unit ? { unit } : {}),
            fields: [{ id: 'f_hp', key: 'HP', label: 'HP', kind: 'number', def: 10 }, { id: 'f_sz', key: 'Size', label: 'Scale', kind: 'number', def: 1 }, { id: 'f_nm', key: 'Name', label: 'Name', kind: 'text' }, { id: 'f_gm', key: 'Big', label: 'Big', kind: 'number', def: 10, vis: 'gm' }] });
        const ES = S.cleanSystem(ERAW('ft', 'f_sz'), { F, gmView: true }), EV = S.cleanSystem(ERAW('ft', 'f_sz'), { F, gmView: false });
        check('the system\u2019s own distance unit is feet or metres, absent yards, the same in both views', ES.combat.unit === 'ft' && EV.combat.unit === 'ft' && S.cleanSystem(ERAW('m', 'f_sz'), { F, gmView: true }).combat.unit === 'm' && !('unit' in S.cleanSystem(ERAW('yd', 'f_sz'), { F, gmView: true }).combat) && !('unit' in S.cleanSystem(ERAW('km', 'f_sz'), { F, gmView: true }).combat), J([ES.combat, EV.combat]));
        check('a blast\u2019s formulas keep MapCell and HitScale, and a sheet\u2019s scale is a number field of the view, the GM\u2019s own blast rules alone; a text field or one that is not there is dropped',
            J(ES.combat.blast) === J({ fall: 'BlastDamage * HitScale', frag: { reach: 'FragDice * MapCell' }, each: '2 + MapCell', radius: 'BlastRadius * MapCell', scale: 'f_sz' }) && !('blast' in EV.combat)
            && !('scale' in S.cleanSystem(ERAW('', 'f_nm'), { F, gmView: true }).combat.blast) && !('scale' in S.cleanSystem(ERAW('', 'f_nope'), { F, gmView: true }).combat.blast) && S.cleanSystem(ERAW('', 'f_gm'), { F, gmView: true }).combat.blast.scale === 'f_gm', J(ES.combat.blast));
        const mp = (v, u, hex) => ({ meta: { cellValue: v, cellUnit: u, gridType: hex ? 'hex' : 'square' } });
        const yd = S.cleanSystem(ERAW('', 'f_sz'), { F, gmView: true });
        check('MapCell is one cell of the map in the system\u2019s unit, whatever unit the map is set in', S.mapCellIn(yd, mp(50, 'yd', true)) === 50 && S.mapCellIn(yd, mp(1, 'yd', true)) === 1 && S.mapCellIn(yd, mp(15, 'ft')) === 5 && S.mapCellIn(ES, mp(50, 'yd', true)) === 150 && S.mapCellIn(S.cleanSystem(ERAW('m', ''), { F, gmView: true }), mp(1, 'km', true)) === 1000 && S.mapCellIn(yd, null) > 0,
            J([S.mapCellIn(yd, mp(50, 'yd', true)), S.mapCellIn(ES, mp(50, 'yd', true)), S.mapCellIn(S.cleanSystem(ERAW('m', ''), { F, gmView: true }), mp(1, 'km', true))]));
        const shipC = { id: 'c_s', values: { f_sz: 10 } }, man = { id: 'c_m', values: {} };
        check('HitScale is the scale field\u2019s figure on the sheet hit, 1 with no sheet, and the field\u2019s own default where nothing is stored', S.hitScaleOf(ES, shipC, F) === 10 && S.hitScaleOf(ES, man, F) === 1 && S.hitScaleOf(ES, null, F) === 1 && S.hitScaleOf(S.cleanSystem(ERAW('', ''), { F, gmView: true }), shipC, F) === 1, J([S.hitScaleOf(ES, shipC, F), S.hitScaleOf(ES, man, F)]));
        check('a token\u2019s share reads MapCell and HitScale, 1 for each where none is handed in, held to what was rolled', BC.fallShare(F, 'BlastDamage * HitScale / 10', { dmg: 30, scale: 10 }) === 30 && BC.fallShare(F, 'BlastDamage / MapCell', { dmg: 30, cell: 3 }) === 10 && BC.fallShare(F, 'BlastDamage * HitScale', { dmg: 7 }) === 7 && BC.fallShare(F, 'BlastDamage * MapCell', { dmg: 7 }) === 7);
        const wbE = read('scripts/whiteboard.js'), shE = read('scripts/sheets.js');
        check('the host hands MapCell to a blast\u2019s radius, each victim\u2019s dice, the falloff and fragmentation\u2019s reach, and HitScale with the victim\u2019s own sheet; a cell is worked out once a blast and kept on it',
            /l === 'blastradius' \? b\.ft \/ 3 : l === 'mapcell' \? b\.cell/.test(wbE) && /if \(l === 'mapcell'\) return blastCellOf\(b, map\); if \(l === 'hitscale'\) return S\.hitScaleOf \? S\.hitScaleOf\(sys, ch, F\)/.test(wbE)
            && (wbE.match(/env: (o\.)?b\.env, cell: /g) || []).length === 2 && /l === 'mapcell' \? blastCellOf\(b, map\) : undefined/.test(wbE) && /function blastCellOf\(b, map\) \{/.test(wbE) && /\n      blastCellOf\(b, map\);   \/\/ 1\.6\.2/.test(wbE));
        check('the Combat tab\u2019s Blasts and throws has the system\u2019s distance unit and a sheet\u2019s scale, each with its line, and the forms offer MapCell and HitScale', /^function blastScaleInto\(box, cm, bl\) \{/m.test(shE) && /labeledSelect\('sys-combat-bunit'/.test(shE) && /labeledSelect\('sys-combat-bscale'/.test(shE)
            && /'sys-combat-bfall': \['BlastDamage', 'BlastDistance', 'BlastDice', 'Direct', 'Centre', 'BlastFills', 'BlastNoDrop', 'MapCell', 'HitScale'\]/.test(shE) && S.nameWord(ES, 'MapCell') === 'one cell of the map' && S.nameWord(ES, 'HitScale') === 'the scale of the one it hits');
    }
    /* ---- the words ---- */
    const help = read('index.html');
    check('Help says Rows are sheets, in plain words', /<b>Rows are sheets<\/b>/.test(help) && /Make a new sheet/.test(help));
    check('Help says what a mark is, in plain words', /<b>Marks<\/b>/.test(help) && /dashed line/.test(help));
    check('Help says what else ends a mark and what Shake off does', /<b>Ends out of sight<\/b>/.test(help) && /<b>Kept while<\/b>/.test(help) && /<b>Shake off<\/b>/.test(help));
    check('Help says the system\u2019s own arcs and Arcs by, in plain words', /<b>Arcs<\/b> on the Combat tab names the arcs/.test(help) && /<b>Arcs by<\/b> names a choice stat/.test(help) && !/Arc\.left/.test(help));
    check('Help says a row picked at random and a card to the crew, in plain words', /<b>A row picked at random:<\/b>/.test(help) && /<b>Rows already off may be picked<\/b>/.test(help) && /<b>Card to all its crew<\/b>/.test(help));
    check('both release notes say the random row and the crew’s cards', ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].every(p => /a row picked at random from a\n  list with a switch/.test(readRoot(p)) && /Calls for can send its card to the crew/.test(readRoot(p))));
    check('Help says the system\u2019s distance unit, a cell of the map and a sheet\u2019s scale, in plain words', /<b>The system&rsquo;s distances count in<\/b>/.test(help) && /<b>A sheet&rsquo;s scale is<\/b>/.test(help));
    check('both release notes say a blast at scale', ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].every(p => /A blast's formulas can now read one cell of the map/.test(readRoot(p))));
    check('both release notes say it', ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].every(p => /A system can now name its own arcs/.test(readRoot(p)) && /Rows are sheets/.test(readRoot(p)) && /A token can hold a mark on another/.test(readRoot(p)) && /A mark can end by itself/.test(readRoot(p))));
    summed = true; console.log(pass + ' passed, ' + fail + ' failed.'); process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite stopped: ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) { console.log('FAIL      the suite never finished'); process.exitCode = 1; } });
