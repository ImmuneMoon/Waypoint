'use strict';
/* listrowcheck.js: a list's rows, backlog 180 R1 to R16 (rows that open, badges and tones, a switch's two words and a roll's figure, a count in a
   placement, a roll that asks the level, a row's edge, places split by a choice stat, sets, parts and their Undo, a split stack), parts
   from several lists, Row.made and a host's room, grants, row states as names, Costs more while, Laid from and its rules, Fx.<effect>,
   Doesn't stack, darkness steps, a cloud an explosive leaves and the scene's context,
   the tests that came out of systemcheck.js with their area (docs/REFACTOR_SPLIT_PLAN.md, "Finishing the test split", step 1,
   2026-11-19). Their code is systemcore.js's own lines, which no part holds yet, so the suite imports systemcore.js as
   systemcheck.js does (kit.sysCore, the top every suite out of it starts from) and cuts its slices of sheets.js and the System
   editor's parts as they stood there, a part by its own name. Each block is as it stood in systemcheck.js, word for word.
   Usage: node tools/listrowcheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const app = kit.APP, url = kit.url;
const T = kit.suite('system'), check = T.check;
const j = v => JSON.stringify(v);

(async () => {
    const core = await kit.sysCore();   // systemcore.js and formula.js imported, the names systemcheck.js unpacks, the two presets and flatKids
    const { S, F, err } = core;
    check('listrowcheck: systemcore.js and formula.js load in Node with no window', !!S && !!F && !err, err && err.message);
    if (!S || !F) { await T.finish(); return; }
    const { cleanSystem, makeResolver, validateSystem } = core;

    {   // 1.6.0, backlog 180 R1 and R2 (the owner, by prompt: "A. Arrow before the name", "A. A Shows list beside each part", "A tick the builder sets"): rows that open, and where each part of a row stands
        const J = JSON.stringify;
        const rawR = { v: 1, name: 'R', rolls: [], sheet: { sections: [] },
            items: [{ id: 'i_bl', name: 'Blaster', stats: { Dmg: 3, Cost: 5 } }, { id: 'i_kn', name: 'Knife', stats: { Dmg: 1, Cost: 2 } }, { id: 'i_pb', name: 'Pebbles', stats: {} }],
            fields: [{ id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', list: { open: true, price: 'Cost', paidPlace: 'details',
                stats: [{ key: 'Dmg', label: 'Dmg', show: true }, { key: 'Cost', label: 'Cost' }],
                lvl: { label: 'Rank', min: 0, max: 5, place: 'hide' }, on: { label: 'Ready', place: 'details' },
                cols: [{ key: 'Hit', label: 'Hit', formula: 'Row.Dmg + 1', place: 'details' }, { key: 'Sec', label: 'Sec', formula: '1', hide: true, place: 'details' }, { key: 'Wt', label: 'Wt', formula: '2', place: 'bogus' }],
                counters: [{ key: 'Ammo', label: 'Ammo', max: '10', place: 'details' }, { key: 'Heat', label: 'Heat', max: '5', place: 'hide' }, { key: 'Jam', label: 'Jam', max: '1', place: 7 }],
                rolls: [{ label: 'Shoot', formula: '3d6' }, { label: 'Clear', formula: '3d6', place: 'details' }, { label: 'Fix', formula: '3d6', place: 'hide' }] } },
                { id: 'f_x', key: 'Other', label: 'Other', kind: 'item-list', list: { open: 'yes', paidPlace: 'details', stats: [{ key: 'Wt', label: 'Wt' }] } }] };
        const gR = S.cleanSystem(rawR, { F, gmView: true }), pR = S.cleanSystem(rawR, { F, gmView: false }), lw = (sy, id) => sy.fields.find(x => x.id === id).list;
        const placesOf = l => J([l.open, l.paidPlace, l.lvl.place, l.on.place, l.cols.map(c => [c.place, c.hide]), l.counters.map(c => c.place), l.rolls.map(r => r.place)]);
        const want = J([true, 'details', 'hide', 'details', [['details', undefined], [undefined, true], [undefined, undefined]], ['details', 'hide', undefined], [undefined, 'details', 'hide']]);
        const cleanOk = placesOf(lw(gR, 'f_g')) === want && placesOf(lw(pR, 'f_g')) === want && J(S.cleanSystem(gR, { F, gmView: true })) === J(gR) && J(S.cleanSystem(pR, { F, gmView: false })) === J(pR)
            && !('open' in lw(gR, 'f_x')) && !('paidPlace' in lw(gR, 'f_x'));
        // the drawing: the real item widgets (sliced from sheets.js) on a page of plain objects that knows a class list, a click and an svg
        const shR = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const cutR = (a, b) => { const i = shR.indexOf(a), k = shR.indexOf(b, i + 1); if (i < 0 || k < 0) throw new Error('rows slice: ' + a); return shR.slice(i, k); };
        const itR = cutR('// ---- item-list widgets', '// 5h: an effect\'s changes as short text'), plR = cutR('// [systemcheck:placesel-start]', '// [systemcheck:placesel-end]');
        const mkE = (tag, cls, text) => { const e = { tag, className: cls || '', textContent: text === undefined || text === null ? '' : String(text), children: [], attrs: {}, title: '', type: '', value: '', checked: false, disabled: false, selected: false, dataset: {}, style: {}, on: {},
            classList: { toggle(c, on) { const k = e.className.split(' ').filter(Boolean); const has = k.includes(c), want = on === undefined ? !has : !!on; if (want && !has) k.push(c); if (!want && has) k.splice(k.indexOf(c), 1); e.className = k.join(' '); return want; }, add(c) { this.toggle(c, true); }, remove(c) { this.toggle(c, false); }, contains(c) { return e.className.split(' ').includes(c); } },
            get childNodes() { return e.children; }, get firstChild() { return e.children[0] || null; }, appendChild(x) { e.children.push(x); return x; }, insertBefore(x, r) { const i = r ? e.children.indexOf(r) : -1; if (i < 0) e.children.push(x); else e.children.splice(i, 0, x); return x; },
            setAttribute(k, v) { e.attrs[k] = String(v); }, addEventListener(k, fn) { e.on[k] = fn; }, click() { if (e.on.click) e.on.click({}); } }; return e; };
        const docR = { createTextNode: t => ({ tag: '#text', textContent: t, children: [] }), createElementNS: (ns, tag) => Object.assign(mkE(tag), { ns }) };
        const optR = (v, t, sl) => { const o = mkE('option', null, t); o.value = v; if (sl) o.selected = true; return o; };
        const depsR = ['el', 'iconNode', 'rowDef', 'rowIdOf', 'rowLvl', 'rowOn', 'commitItem', 'opt', 'fmtNum', 'iconText', 'LIMITS', '_fxLive', 'document', 'renderViews', 'closeHud', 'closeSheet', 'window', 'systemOf', 'getActiveCampaign', 'facingTarget', 'uid', 'F', 'fxText', 'canRoll', 'sheetRoll', 'commit', 'valueTone', 'TONE_CLASS', 'rowStat', 'rowPaid', '_fxView'];
        const depsV = view => [mkE, (v, cls) => mkE('span', cls, v), S.rowDef, S.rowIdOf, S.rowLvl, S.rowOn, () => {}, optR, S.fmtNum, v => v || '', S.LIMITS, true, docR, () => {}, () => {}, () => {}, {}, () => gR, () => null, () => null, p => p + 'new', () => F, S.fxText, () => true, () => {}, () => {}, S.valueTone, {}, S.rowStat, S.rowPaid, view];
        const back = '\nreturn { itemListInto, itemTableInto, partPlace, partHere, rowOpener, openAllBar, _noteOpen };';
        const WS = new Function(...depsR, itR + back)(...depsV('sheet')), WHd = new Function(...depsR, itR + back)(...depsV('hud'));
        const walkR = (n, p, acc) => { if (n && p(n)) acc.push(n); ((n && n.children) || []).forEach(k => walkR(k, p, acc)); return acc; }, byR = (n, c) => walkR(n, x => (' ' + x.className + ' ').indexOf(' ' + c + ' ') >= 0, []);
        const txR = n => !n ? '' : (n.textContent || '') + (n.children || []).map(txR).join('|');
        const chR = { id: 'c_r', name: 'Kael', ownerId: 'u_r', values: { f_g: [{ id: 'w_b', defId: 'i_bl', qty: 1, paid: 5 }, { id: 'w_k', defId: 'i_kn', qty: 1 }, { id: 'w_p', defId: 'i_pb', qty: 3 }] } };
        const resR = S.resolveAll(gR, chR, F, null).f_g, fG = gR.fields.find(x => x.id === 'f_g');
        const wrapS = mkE('div'); WS.itemListInto(wrapS, fG, chR, chR.values.f_g, gR, false, true, true, '', resR);
        const lines = wrapS.children.filter(n => n.className.split(' ').includes('sheet-item')), notes = wrapS.children.filter(n => n.className === 'sheet-item-noteline');
        const bl = lines[0], blNote = notes[0], opB = byR(bl, 'sheet-item-opener')[0], parts = byR(blNote, 'sheet-item-parts')[0];
        const rowTx = txR(bl), partTx = txR(parts);
        const drawOk = byR(wrapS, 'sheet-item-openall').length === 1 && bl.children[0].className === 'sheet-item-opslot' && !!opB && opB.tag === 'button' && byR(bl, 'sheet-item-notes-t').length === 0
            && !!parts && blNote.children[0].className === 'sheet-item-dname' && blNote.children[0].textContent === 'Blaster' && blNote.children[1] === parts && /Shoot/.test(rowTx) && !/Clear|Fix|Hit|Ammo|Heat|Rank/.test(rowTx) && /Jam/.test(rowTx) && /Clear/.test(partTx) && /Ammo/.test(partTx) && /Hit/.test(partTx) && !/Fix|Heat|Sec|Shoot|Jam/.test(partTx)
            && byR(lines[2], 'sheet-item-opener-none').length === 0;
        const closed0 = [blNote.style.display, opB.ariaExpanded, opB.ariaLabel, opB.className.includes('is-open')];
        opB.click(); const open1 = [blNote.style.display, opB.ariaExpanded, opB.ariaLabel, opB.className.includes('is-open')];
        byR(bl, 'sheet-item-name')[0].click(); const byName = [blNote.style.display, opB.ariaExpanded];
        const bar = byR(wrapS, 'sheet-item-openall')[0], allOpen = () => notes.map(n => n.style.display);
        const oaSeg = bar.children[0], oaSegOk = bar.children.length === 1 && oaSeg.className === 'ui-seg' && oaSeg.children.length === 2; /* 1.6.2 (backlog 225): the two stand in one .ui-seg, moved on purpose */
        oaSeg.children[0].click(); const afterOpen = allOpen(); oaSeg.children[1].click(); const afterClose = allOpen();
        const svgOk = opB.children[0].tag === 'svg' && opB.children[0].children[0].attrs.d === 'M6 9.5l6 6 6-6' && opB.children[0].attrs['aria-hidden'] === 'true';
        // the same rows again keep a row opened (the 📝 line's own memory)
        opB.click(); const wrap2 = mkE('div'); WS.itemListInto(wrap2, fG, chR, chR.values.f_g, gR, false, true, true, '', resR); const kept = wrap2.children.filter(n => n.className === 'sheet-item-noteline')[0].style.display; opB.click();
        // the HUD has no details: every part not hidden stands on the row, no arrow, no Open all
        const wrapH = mkE('div'); WHd.itemListInto(wrapH, fG, chR, chR.values.f_g, gR, false, true, true, '', resR);
        const hTx = txR(wrapH.children.filter(n => n.className.split(' ').includes('sheet-item'))[0]);
        const hudOk = byR(wrapH, 'sheet-item-opener').length === 0 && byR(wrapH, 'sheet-item-openall').length === 0 && byR(wrapH, 'sheet-item-parts').length === 0 && /Shoot/.test(hTx) && /Clear/.test(hTx) && /Ammo/.test(hTx) && /Hit/.test(hTx) && !/Fix|Heat|Rank/.test(hTx);
        // a list not ticked Rows open draws its 📝 as before and no arrow
        const gN = S.cleanSystem(Object.assign({}, rawR, { fields: [Object.assign({}, rawR.fields[0], { list: Object.assign({}, rawR.fields[0].list, { open: false }) })] }), { F, gmView: true });
        const wrapN = mkE('div'); WS.itemListInto(wrapN, gN.fields[0], chR, chR.values.f_g, gN, false, true, true, '', S.resolveAll(gN, chR, F, null).f_g);
        const plainOk = byR(wrapN, 'sheet-item-opener').length === 0 && byR(wrapN, 'sheet-item-openall').length === 0 && byR(wrapN, 'sheet-item-notes-t').length >= 1;
        const pp = WS.partPlace, ph = WS.partHere;
        const pureOk = pp({ place: 'details' }, false) === 'details' && pp({ place: 'details' }, true) === 'row' && pp({ hide: true, place: 'details' }) === 'hide' && pp({ place: 'hide' }, true) === 'hide' && pp(null) === 'row' && pp({ place: 'x' }) === 'row' && pp('details') === 'row'
            && !ph({ place: 'details' }, 'row', false) && ph({ place: 'details' }, 'details', false) && ph({ place: 'details' }, 'row', true) && !ph({ place: 'hide' }, null) && ph({}, null) && ph(undefined, 'row');
        // the editor: the Shows list and its one handler
        const PL = new Function('el', plR + '\nreturn { placeSel, placeSet };')(mkE);
        const sel = PL.placeSel('ct:2', 'details'), selS = sel.children[1], hideSel = PL.placeSel('col:0', 'hide'), plainSel = PL.placeSel('lvl', 'nope');
        const selOk = sel.children[0].textContent === 'Shows' && selS.className === 'sys-list-place' && selS.dataset.part === 'ct:2' && J(selS.children.map(o => [o.value, o.textContent, o.selected])) === J([['', 'On the row', false], ['details', 'In the details', true], ['hide', 'Hidden', false]])
            && hideSel.children[1].children[2].selected && plainSel.children[1].children[0].selected && !plainSel.children[1].children[1].selected;
        const lsc = { cols: [{ key: 'A', hide: true }], counters: [{ key: 'C' }], rolls: [{ label: 'R' }], lvl: {}, on: { place: 'details' }, price: 'Cost' };
        const sets = [PL.placeSet(lsc, 'col:0', 'details'), J(lsc.cols[0]), PL.placeSet(lsc, 'col:0', 'hide'), J(lsc.cols[0]), PL.placeSet(lsc, 'ct:0', 'hide'), PL.placeSet(lsc, 'roll:0', 'details'), PL.placeSet(lsc, 'lvl', 'details'), PL.placeSet(lsc, 'on', ''), PL.placeSet(lsc, 'paid', 'hide'),
            PL.placeSet(lsc, 'col:9', 'details'), PL.placeSet(lsc, 'x', 'details'), PL.placeSet(lsc, 'roll:0', 'bogus'), PL.placeSet({}, 'lvl', 'details')];
        const setOk = J(sets) === J([true, J({ key: 'A', place: 'details' }), true, J({ key: 'A', hide: true }), true, true, true, true, true, false, false, true, false])
            && J(lsc) === J({ cols: [{ key: 'A', hide: true }], counters: [{ key: 'C', place: 'hide' }], rolls: [{ label: 'R' }], lvl: { place: 'details' }, on: {}, price: 'Cost', paidPlace: 'hide' });
        const css = fs.readFileSync(path.join(app, 'style.css'), 'utf8');
        const wiredOk = require('./checkkit').part('sysedlist.js').includes("cr.appendChild(placeSel('col:' + ci, cc.hide === true ? 'hide' : cc.place));") && require('./checkkit').part('sysedlist.js').includes("rw.appendChild(placeSel('ct:' + ti, tt.place));") && require('./checkkit').part('sysedlist.js').includes("rw.appendChild(placeSel('roll:' + ri, rr.place));")
            && require('./checkkit').part('sysedlist.js').includes("lr.appendChild(placeSel('lvl', lv.place));") && require('./checkkit').part('sysedlist.js').includes("orow.appendChild(placeSel('on', sw.place));") && require('./checkkit').part('sysedlist.js').includes("sb.appendChild(placeSel('paid', sp.paidPlace));")
            && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-place') >= 0) { if (typeof placeSet === 'function') placeSet(lsc, t.dataset.part, t.value); }") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-open') >= 0) { if (t.checked) lsc.open = true; else delete lsc.open; }")
            && !shR.includes("checkLabel('sys-list-colhide'") &&/\.sheet-item-ct \.sheet-item-ctb \{[^}]*height: 24px; min-width: 24px;/.test(css) && /\.sheet-item-opener\.is-open \.ico \{ transform: none; \}/.test(css) && /prefers-reduced-motion: reduce\) \{ \.sheet-item-opener \.ico \{ transition: none; \}/.test(css);
        check('1.6.0, backlog 180 R1 and R2: a list may be ticked Rows open (open, true only) and each part of its row given a place, On the row, In the details or Hidden (place on the level, the switch, a column, a counter and a roll; paidPlace beside a price; '
            + 'a column\'s Hidden stays its own hide), the same in both views and a fixed point; on the sheet (itemListInto, sliced and run for real) a row with details gets an arrow before its name, a real button whose name says what it does and whether it is open, '
            + 'opened by the arrow, by a press on the name and by Open all, closed by Close all, kept across a redraw, with no 📝; the parts In the details stand at the top of the details and nowhere on the row; Hidden is drawn nowhere; '
            + 'the HUD has no details, so there every part not hidden stands on its row with no arrow; a list not ticked draws its 📝 as before; the editor\'s Shows list and its one handler (placeSel, placeSet), the wiring and the styles',
            cleanOk && drawOk && J(closed0) === J(['none', 'false', 'Show details of Blaster', false]) && J(open1) === J(['', 'true', 'Hide details of Blaster', true]) && J(byName) === J(['none', 'false'])
            && oaSegOk && afterOpen.every(d => d === '') && afterClose.every(d => d === 'none') && svgOk && kept === '' && hudOk && plainOk && pureOk && selOk && setOk && wiredOk,
            J([cleanOk, drawOk, svgOk, kept, hudOk, plainOk, pureOk, selOk, wiredOk, closed0, open1, byName, afterOpen, afterClose, sets, J(lsc), rowTx, partTx, hTx]));
    }

    {   // 1.6.0, backlog 180 R4 and R5 (the owner, by prompt: "A. After the name", "A. Tint and an edge", "A. The badge itself", "A. Label, then badge"): a row's badges and a value name's tone
        const J = JSON.stringify;
        const rawB = { v: 1, name: 'B', rolls: [], sheet: { sections: [] },
            items: [{ id: 'i_rf', name: 'Ember Rifle', stats: { cond: 1 } }, { id: 'i_hb', name: 'Hookblade', stats: { cond: 0 } }, { id: 'i_br', name: 'Broken Pole', stats: { cond: 2 } }],
            fields: [{ id: 'f_hid', key: 'Hid', label: 'Hid', kind: 'number', vis: 'gm' },
                { id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', list: {
                stats: [{ key: 'cond', label: 'Cond', labels: ['Fine', 'Worn', 'Broken'], tones: ['good', 'warn', 'danger', 'good'], show: true }, { key: 'plain', label: 'Plain', labels: ['A', 'B'], tones: ['', ''] }],
                counters: [{ key: 'jam', label: 'Jammed', max: '1' }],
                cols: [{ key: 'st', label: 'State', formula: 'Row.cond', labels: ['Fine', 'Worn', 'Broken'], tones: ['', 'bogus', 'danger'] }],
                badges: [{ words: 'Jammed', if: 'Row.jam > 0', tone: 'danger', tint: true, pulse: true, tip: 'Clear it', extra: 1 }, { words: 'Secret', if: 'Hid > 0', tone: 'warn', tint: true },
                    { words: 'Rolls', if: '1d6 > 2' }, { words: 'Needs a check at the next rest.', if: 'Row.cond >= 1', line: true, tone: 'nope', tint: 'yes', pulse: 1 }, { words: '', if: '1' }, { words: 'No formula' },
                    { words: 'Worn out', if: 'Row.cond = 1', tone: 'warn', tint: true }] } }] };
        const gB = S.cleanSystem(rawB, { F, gmView: true }), pB = S.cleanSystem(rawB, { F, gmView: false }), lB = sy => sy.fields.find(x => x.id === 'f_g').list;
        const cleanOk = J(lB(gB).badges) === J([{ words: 'Jammed', if: 'Row.jam > 0', tone: 'danger', tint: true, pulse: true, tip: 'Clear it' }, { words: 'Secret', if: 'Hid > 0', tone: 'warn', tint: true },
                { words: 'Needs a check at the next rest.', if: 'Row.cond >= 1', line: true }, { words: 'Worn out', if: 'Row.cond = 1', tone: 'warn', tint: true }])
            && J(lB(pB).badges.map(b => b.words)) === J(['Jammed', 'Needs a check at the next rest.', 'Worn out'])
            && J(lB(gB).stats[0].tones) === J(['good', 'warn', 'danger']) && !('tones' in lB(gB).stats[1]) && J(lB(gB).cols[0].tones) === J(['', '', 'danger']) && J(lB(pB).stats[0].tones) === J(lB(gB).stats[0].tones)
            && J(S.cleanSystem(gB, { F, gmView: true })) === J(gB) && J(S.cleanSystem(pB, { F, gmView: false })) === J(pB)
            && S.cleanBadges(Array.from({ length: 12 }, (x, i) => ({ words: 'b' + i, if: 'Row.cond = ' + i }))) === null
            && S.cleanBadges(Array.from({ length: 126 }, (x, i) => ({ words: 'b' + i, if: 'Row.cond = ' + i })), F).length === S.BADGE_MAX && S.BADGE_MAX === 120   /* backlog 195: twelve; 120 since 1.6.2, moved on purpose */ && S.cleanBadges('x', F) === null && S.cleanBadges([], F) === null
            && !('badges' in (S.cleanSystem({ v: 1, name: 'N', fields: [{ id: 'f_n', key: 'N', label: 'N', kind: 'item-list', list: {} }] }, { F, gmView: true }).fields[0].list || {}));
        // the resolver: which badges hold on each row; a row whose formula cannot be worked out shows none
        const chB = { id: 'c_b', name: 'Kael', ownerId: 'u_b', values: { f_hid: 2, f_g: [{ id: 'w_rf', defId: 'i_rf', qty: 1, ct: { jam: 1 } }, { id: 'w_hb', defId: 'i_hb', qty: 1 }, { id: 'w_br', defId: 'i_br', qty: 1 }] } };
        const resG = S.resolveAll(gB, chB, F, null).f_g, resP = S.resolveAll(pB, chB, F, null).f_g;
        const resOk = J(resG.bd) === J({ w_rf: [0, 1, 2, 3], w_hb: [1], w_br: [1, 2] }) && J(resP.bd) === J({ w_rf: [0, 1, 2], w_hb: [], w_br: [1] })
            && S.resolveAll(S.cleanSystem({ v: 1, name: 'N', fields: [{ id: 'f_n', key: 'N', label: 'N', kind: 'item-list', list: {} }] }, { F, gmView: true }), { id: 'c', name: 'c', values: {} }, F, null).f_n.bd === undefined;
        const vB = S.validateSystem(Object.assign({}, gB, { fields: gB.fields.map(f => f.id !== 'f_g' ? f : Object.assign({}, f, { list: Object.assign({}, f.list, { badges: [{ words: 'Odd', if: 'Nope > 0' }] }) })) }), F);
        const valOk = vB.errors.some(x => /^list\.badge\.0\.Odd/.test(x.prop || '')) && !S.validateSystem(gB, F).errors.some(x => /badge/.test(x.prop || ''));
        // the sheet: the real item widgets (sliced from sheets.js) on a page of plain objects
        const shB2 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const cutB = (a, b) => { const i = shB2.indexOf(a), k = shB2.indexOf(b, i + 1); if (i < 0 || k < 0) throw new Error('badges slice: ' + a); return shB2.slice(i, k); };
        const itB = cutB('// ---- item-list widgets', '// 5h: an effect\'s changes as short text'), bbB = require('./checkkit').cut('sysedbox.js', '// [systemcheck:badgebox-start]', '// [systemcheck:badgebox-end]');
        const mkB = (tag, cls, text) => { const e = { tag, className: cls || '', textContent: text === undefined || text === null ? '' : String(text), children: [], attrs: {}, title: '', type: '', value: '', checked: false, disabled: false, selected: false, dataset: {}, style: {}, on: {}, maxLength: 0, placeholder: '',
            classList: { toggle(c, on) { const k = e.className.split(' ').filter(Boolean); const has = k.includes(c), want = on === undefined ? !has : !!on; if (want && !has) k.push(c); if (!want && has) k.splice(k.indexOf(c), 1); e.className = k.join(' '); return want; }, add(c) { this.toggle(c, true); }, remove(c) { this.toggle(c, false); }, contains(c) { return e.className.split(' ').includes(c); } },
            get childNodes() { return e.children; }, get firstChild() { return e.children[0] || null; }, appendChild(x) { e.children.push(x); return x; }, insertBefore(x, r) { const i = r ? e.children.indexOf(r) : -1; if (i < 0) e.children.push(x); else e.children.splice(i, 0, x); return x; },
            querySelectorAll(sel) { const c = sel.replace(/^\./, ''), acc = []; const w = n => { (n.children || []).forEach(k => { if ((' ' + (k.className || '') + ' ').indexOf(' ' + c + ' ') >= 0) acc.push(k); w(k); }); }; w(e); return acc; }, focus() {},
            setAttribute(k, v) { e.attrs[k] = String(v); }, addEventListener(k, fn) { e.on[k] = fn; }, click() { if (e.on.click) e.on.click({ stopPropagation() {} }); } };
            Object.defineProperty(e, 'textContent', { get() { return e._t; }, set(v) { e._t = v === undefined || v === null ? '' : String(v); e.children = []; }, configurable: true }); e.textContent = text === undefined || text === null ? '' : String(text); return e; };
        const docB = { createTextNode: t => ({ tag: '#text', textContent: t, children: [] }), createElementNS: (ns, tag) => Object.assign(mkB(tag), { ns }) };
        const optB = (v, t, sl) => { const o = mkB('option', null, t); o.value = v; if (sl) o.selected = true; return o; };
        const depsB = ['el', 'iconNode', 'rowDef', 'rowIdOf', 'rowLvl', 'rowOn', 'commitItem', 'opt', 'fmtNum', 'iconText', 'LIMITS', '_fxLive', 'document', 'renderViews', 'closeHud', 'closeSheet', 'window', 'systemOf', 'getActiveCampaign', 'facingTarget', 'uid', 'F', 'fxText', 'canRoll', 'sheetRoll', 'commit', 'valueTone', 'TONE_CLASS', 'rowStat', 'rowPaid', '_fxView'];
        const depsBV = view => [mkB, (v, cls) => mkB('span', cls, v), S.rowDef, S.rowIdOf, S.rowLvl, S.rowOn, () => {}, optB, S.fmtNum, v => v || '', S.LIMITS, true, docB, () => {}, () => {}, () => {}, {}, () => gB, () => null, () => null, p => p + 'new', () => F, S.fxText, () => true, () => {}, () => {}, S.valueTone, {}, S.rowStat, S.rowPaid, view];
        const backB = '\nreturn { itemListInto, itemTableInto, badgeBits, nameTone, tonedChip };';
        const WB = new Function(...depsB, itB + backB)(...depsBV('sheet')), WBh = new Function(...depsB, itB + backB)(...depsBV('hud'));
        const walkB = (n, p, acc) => { if (n && p(n)) acc.push(n); ((n && n.children) || []).forEach(k => walkB(k, p, acc)); return acc; }, byB = (n, c) => walkB(n, x => (' ' + x.className + ' ').indexOf(' ' + c + ' ') >= 0, []);
        const fGB = gB.fields.find(x => x.id === 'f_g'), wB = mkB('div'); WB.itemListInto(wB, fGB, chB, chB.values.f_g, gB, false, true, true, '', resG);
        const rowsB = wB.children.filter(n => n.className.split(' ').includes('sheet-item')), rf = rowsB[0], hb = rowsB[1], br = rowsB[2];
        const pillsOf = r => byB(r, 'sheet-item-badge').map(b => [b.className, b.textContent, b.title]);
        const nmIdx = r => r.children.findIndex(k => k.className === 'sheet-item-name'), bxIdx = r => r.children.findIndex(k => k.className === 'sheet-item-badges');
        const condOf = r => byB(r, 'sheet-item-stat').map(c => [c.className, c.children.map(k => k.tag + ':' + (k.className || '') + ':' + k.textContent)]);
        const drawOk = rf.className === 'sheet-item sheet-item-badged sheet-tint-danger' && bxIdx(rf) === nmIdx(rf) + 1
            && J(pillsOf(rf)) === J([['sheet-badge sheet-item-badge sheet-tone-danger sheet-badge-pulse', 'Jammed', 'Clear it'], ['sheet-badge sheet-item-badge sheet-tone-warn', 'Secret', ''], ['sheet-badge sheet-item-badge sheet-tone-warn', 'Worn out', '']])
            && wB.children[wB.children.indexOf(rf) + 1].className === 'sheet-item-badgelines' && J(byB(wB.children[wB.children.indexOf(rf) + 1], 'sheet-item-badgeline').map(l => [l.className, l.textContent])) === J([['sheet-item-badgeline sheet-tone-plain', 'Needs a check at the next rest.']])
            && hb.className === 'sheet-item sheet-item-badged sheet-tint-warn' && br.className === 'sheet-item sheet-item-badged sheet-tint-warn' && J(pillsOf(hb).map(p => p[1])) === J(['Secret']) && wB.children[wB.children.indexOf(hb) + 1].className !== 'sheet-item-badgelines'
            && J(condOf(rf)) === J([['sheet-chip sheet-item-stat sheet-item-toned', ['small::Cond', '#text:: ', 'span:sheet-badge sheet-tone-warn:Worn']]]) && J(condOf(hb)[0][1][2]) === J('span:sheet-badge sheet-tone-good:Fine')
            && J(byB(br, 'sheet-item-col').map(c => [c.className, c.children.map(k => k.className + ':' + k.textContent)])) === J([['sheet-chip sheet-item-col sheet-item-toned', [':State', 'undefined: ', 'sheet-badge sheet-tone-danger:Broken']]])
            && byB(br, 'sheet-item-toned').length === 2 && byB(rf, 'sheet-item-toned').length === 1;
        // the HUD: pills on the row, no line under it
        const wH = mkB('div'); WBh.itemListInto(wH, fGB, chB, chB.values.f_g, gB, false, true, true, '', resG);
        const hudOk = byB(wH, 'sheet-item-badgelines').length === 0 && byB(wH, 'sheet-item-badge').length === 5;
        // a rich table: the badges and a line in the name's cell, the tint on the row, a toned name as a badge in its cell
        const fT = Object.assign({}, fGB, { table: { columns: [] } }), wT = mkB('div'); WB.itemTableInto(wT, fT, chB, chB.values.f_g, gB, false, true, true, '', resG);
        const trs = byB(wT, 'sheet-tint-danger'), nameTd = trs[0] && trs[0].children.find(k => k.className === 'sheet-itcol-name');
        const tableOk = trs.length === 1 && trs[0].tag === 'tr' && byB(nameTd, 'sheet-item-badge').length === 3 && byB(nameTd, 'sheet-item-badgeline').length === 1
            && J(walkB(trs[0], x => x.tag === 'td' && x.className === 'sheet-itcol-stat', []).map(td => td.children.map(k => k.className + ':' + k.textContent))) === J([['sheet-badge sheet-tone-warn:Worn']]);
        // the pure helpers
        const pureOk = WB.nameTone({ labels: ['a', 'b'], tones: ['good', 'nope'] }, 0) === 'good' && WB.nameTone({ labels: ['a', 'b'], tones: ['good', 'nope'] }, 1) === '' && WB.nameTone({ labels: ['a'], tones: ['good', 'warn'] }, 1) === ''
            && WB.nameTone({ labels: ['a'], tones: ['good'] }, 0.5) === '' && WB.nameTone({ labels: ['a'], tones: ['good'] }, -1) === '' && WB.nameTone(null, 0) === '' && WB.nameTone({ labels: ['a'], tones: ['__proto__'] }, 0) === ''
            && WB.badgeBits(mkB('div'), { badges: [] }, [0], null) === null && WB.badgeBits(mkB('div'), null, [0], null) === null;
        // the editor's Badges box and a value name's tones (sliced and run for real)
        let dirtyB = 0;
        const inputB = (cls, value, title, ph) => { const i = mkB('input', cls); i.value = value || ''; i.title = title || ''; i.placeholder = ph || ''; return i; };
        const BB = new Function('el', 'input', 'markDirty', 'patchErrors', 'LIMITS', 'BADGE_MAX', 'document', bbB + '\nreturn { badgeBox, toneRow };')(mkB, inputB, () => { dirtyB++; }, () => {}, S.LIMITS, S.BADGE_MAX, docB);
        const spE = { badges: [{ words: '<b>x</b>', if: 'Row.jam > 0', tone: 'danger', tint: true }] }, boxE = BB.badgeBox(spE);
        const rowE = byB(boxE, 'sys-badge-row')[0], fire = (n, k, v) => { if (v !== undefined) { if (typeof v === 'boolean') n.checked = v; else n.value = v; } n.on[k]({ stopPropagation() {} }); };
        const lbl = n => byB(rowE, n)[0];
        const editOk0 = byB(boxE, 'sys-badge-row').length === 1 && lbl('sys-badge-words').value === '<b>x</b>' && lbl('sys-badge-tone').children.filter(o => o.selected).map(o => o.value).join() === 'danger' && lbl('sys-badge-tint').checked === true && lbl('sys-badge-pulse').checked === false
            && J(lbl('sys-badge-kind').children.map(o => o.value)) === J(['', 'line']) && J(lbl('sys-badge-tone').children.map(o => o.value)) === J(['', 'good', 'warn', 'danger', 'accent', 'primary']);
        fire(lbl('sys-badge-words'), 'input', 'Jammed'); fire(lbl('sys-badge-kind'), 'change', 'line'); fire(lbl('sys-badge-pulse'), 'change', true); fire(lbl('sys-badge-tint'), 'change', false); fire(lbl('sys-badge-tone'), 'change', ''); fire(lbl('sys-badge-tip'), 'input', 'Clear it');
        const afterE = J(spE.badges);
        byB(boxE, 'sys-badge-add')[0].click(); const twoE = spE.badges.length; byB(boxE, 'sys-badge-del')[0].click(); byB(boxE, 'sys-badge-del')[0].click();
        const spF = { badges: Array.from({ length: S.BADGE_MAX }, () => ({ words: 'w', if: '1' })) }, boxF = BB.badgeBox(spF);   // backlog 195: full at the cap (twelve), moved on purpose
        const editOk = editOk0 && afterE === J([{ words: 'Jammed', if: 'Row.jam > 0', line: true, pulse: true, tip: 'Clear it' }]) && twoE === 2 && !('badges' in spE) && dirtyB > 6 && byB(boxF, 'sys-badge-add')[0].disabled === true;
        const stE = { key: 'cond', labels: ['Fine', '', 'Broken'] }, trE = BB.toneRow(stE), selsE = byB(trE, 'sys-ltone-sel');
        fire(selsE[1], 'change', 'danger'); const t1 = J(stE.tones); fire(selsE[0], 'change', 'good'); const t2 = J(stE.tones); fire(selsE[1], 'change', ''); const t3 = J(stE.tones); fire(selsE[0], 'change', ''); const t4 = 'tones' in stE;
        const toneOk = selsE.length === 2 && t1 === J(['', '', 'danger']) && t2 === J(['good', '', 'danger']) && t3 === J(['good']) && t4 === false && BB.toneRow({ key: 'x' }) === null && BB.toneRow({ labels: ['', ''] }) === null;
        // the readable page: the badges after the name as words; a list with none as before
        const XB = await import(url('sheetexport.js')), mdB = XB.sheetToMarkdown(gB, chB, S.resolveAll(gB, chB, F, null), { F, gm: true });
        const mdOk = mdB.includes('Ember Rifle (Jammed, Secret, Needs a check at the next rest., Worn out)') && mdB.includes('Hookblade (Secret)');
        const cssB = fs.readFileSync(path.join(app, 'style.css'), 'utf8');
        const wiredOk = shB2.includes("var bdLn = typeof badgeBits === 'function' ? badgeBits(line, spec, res && res.bd ? res.bd[rid] : null, line, hudRow) : null;") && shB2.includes("if (bdLn) wrap.appendChild(bdLn);")
            && require('./checkkit').part('sysedlist.js').includes("if (typeof badgeBox === 'function') card.appendChild(badgeBox(sp));") && require('./checkkit').part('sysedlist.js').includes("var stR = toneRow(s); if (stR) sr.appendChild(stR);") && require('./checkkit').part('sysedlist.js').includes("var ctR = toneRow(cc); if (ctR) cr.appendChild(ctR);")
            && shB2.includes("import { roundSays, BADGE_MAX } from './systemcore.js';")
            && /@media \(prefers-reduced-motion: reduce\) \{ \.sheet-badge-pulse \{ animation: none; \} \}/.test(cssB) && /\.sheet-item\.sheet-tint-danger, tr\.sheet-tint-danger > td:first-child \{ box-shadow: inset 3px 0 0 var\(--red\); \}/.test(cssB) && /\.sheet-badge\.sheet-tone-plain \{ color: var\(--dim\); \}/.test(cssB);
        check('1.6.0, backlog 180 R4 and R5: a list\'s row badges (badges, 120 at most since 1.6.2, twelve since backlog 195: words and a Shown where formula with no dice, a tone of the app\'s own or plain, a line, a tint, a pulse and a tip, each only as the cleaner keeps it) and a tone per value name of a stat or a column (tones, as a field\'s), '
            + 'the same in both views and a fixed point, a badge that reads a GM-only name the GM\'s alone; the resolver says which hold on each row (bd), the validator reads each formula; on the sheet (itemListInto and itemTableInto, sliced and run for real) a badge stands right after the name as a pill, '
            + 'a line under its row, the first that tints gives its row its tint and edge, one that pulses pulses itself and the style sheet stills it where motion is reduced; a toned value name is its label small, then the word as a badge, in a table the badge alone; '
            + 'the HUD has the pills and no lines; the editor\'s Badges box and Colors row (badgeBox, toneRow, run for real) edit the draft in place; the readable page says the badges after the name',
            cleanOk && resOk && valOk && drawOk && hudOk && tableOk && pureOk && editOk && toneOk && mdOk && wiredOk, J([cleanOk, resOk, valOk, drawOk, hudOk, tableOk, pureOk, editOk, toneOk, mdOk, wiredOk, resG.bd, pillsOf(rf), rf.className, condOf(rf), afterE, t1, t2, t3, vB.errors.map(x => x.prop).slice(0, 4)]));
    }
    {   // 1.6.0, backlog 180 R6 and R7 (the owner, by prompt: "A. Button, filled while on", "B. An icon from the set", "B. In a small box at the end", "A. Its target or its dice"; and "lets add icons before other buttons too")
        const J = JSON.stringify;
        const rawS = { v: 1, name: 'S', rolls: [], sheet: { sections: [] },
            items: [{ id: 'i_rf', name: 'Ember Rifle', stats: { skill: 14, n: 2 } }],
            fields: [{ id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', list: {
                stats: [{ key: 'skill', label: 'Skill' }, { key: 'n', label: 'N' }],
                cols: [{ key: 'Hit', label: 'Hit', formula: 'Row.skill + 1' }],
                on: { label: 'Readied', offLabel: 'Ready', icon: 'icon:hand-fist' },
                rolls: [{ label: 'Attack', formula: '3d6 <= Row.skill', show: '@fig', icon: 'icon:bullseye' }, { label: 'Damage', formula: '(Row.n)d6 + 1', show: '@FIG' }, { label: 'Hit', formula: '1d20', show: 'hit' }, { label: 'Odd', formula: '1d6', show: 'nope', icon: 'icon:nope-not-a-glyph' },
                    { label: 'Use', apply: [], icon: 'icon:bolt' }] } },
                { id: 'f_x', key: 'Other', label: 'Other', kind: 'item-list', list: { on: { label: 'On', icon: 'icon:hand-fist' } } }] };
        const gS = S.cleanSystem(rawS, { F, gmView: true }), pS = S.cleanSystem(rawS, { F, gmView: false }), lS = sy => sy.fields.find(x => x.id === 'f_g').list;
        const cleanOk = J(lS(gS).on) === J({ label: 'Readied', offLabel: 'Ready', icon: 'icon:hand-fist' }) && J(gS.fields.find(x => x.id === 'f_x').list.on) === J({ label: 'On' })
            && J(lS(gS).rolls.map(r => [r.show, r.icon])) === J([['@fig', 'icon:bullseye'], [undefined, undefined], ['Hit', undefined], [undefined, undefined], [undefined, 'icon:bolt']])
            && J(lS(pS).on) === J(lS(gS).on) && J(lS(pS).rolls.filter(r => !r.apply).map(r => r.show)) === J(lS(gS).rolls.filter(r => !r.apply).map(r => r.show))
            && J(S.cleanSystem(gS, { F, gmView: true })) === J(gS) && J(S.cleanSystem(pS, { F, gmView: false })) === J(pS)
            && S.rollShowOf('@fig', []) === '@fig' && S.rollShowOf('HIT', [{ key: 'Hit' }]) === 'Hit' && S.rollShowOf('x', [{ key: 'Hit' }]) === '' && S.rollShowOf(5, [{ key: 'Hit' }]) === '' && S.rollShowOf('Hit', null) === '';
        // a roll's own figure: a check its target, a sum of plain dice and a number its dice, anything else nothing
        const vF = { 'Row.skill': 14, 'Row.n': 2, 'Row.add': 1 }, fig = t => S.rollFigOf(t, vF, F);
        const figOk = fig('3d6 <= Row.skill') === '14' && fig('3d6 >= 10') === '10' && fig('Row.skill >= 3d6') === '14' && fig('(Row.n)d6 + Row.add') === '2d6+1' && fig('2d6+1d4-2') === '2d6+1d4-2' && fig('1d20 + 5') === '1d20+5' && fig('3d6') === '3d6'
            && fig('Row.skill') === '14' && fig('4d6kh3') === '' && fig('2d6*2') === '' && fig('10 - 1d6') === '' && fig('1d6!') === '' && fig('1d6 <= 2d6') === '' && fig('Nope + 1d6') === '' && fig('') === '' && S.rollFigOf('1d6', vF, null) === '' && fig(5) === '';
        const chS = { id: 'c_s', name: 'Kael', ownerId: 'u_s', values: { f_g: [{ id: 'w_rf', defId: 'i_rf', qty: 1 }, { id: 'w_on', defId: 'i_rf', qty: 1, on: true }] } };
        const resS = S.resolveAll(gS, chS, F, null).f_g;
        const resOk = J(resS.rf) === J({ w_rf: ['14', '', '', '', ''], w_on: ['14', '', '', '', ''] }) && S.resolveAll(S.cleanSystem({ v: 1, name: 'N', fields: [{ id: 'f_n', key: 'N', label: 'N', kind: 'item-list', list: { rolls: [{ label: 'R', formula: '1d6' }] } }] }, { F, gmView: true }), { id: 'c', name: 'c', values: {} }, F, null).f_n.rf === undefined;
        // the sheet: the real item widgets on a page of plain objects
        const shS = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const cutS = (a, b) => { const i = shS.indexOf(a), k = shS.indexOf(b, i + 1); if (i < 0 || k < 0) throw new Error('r67 slice: ' + a); return shS.slice(i, k); };
        const itS = cutS('// ---- item-list widgets', '// 5h: an effect\'s changes as short text'), rbS = require('./checkkit').cut('sysedbox.js', '// [systemcheck:rowswitchbox-start]', '// [systemcheck:rowswitchbox-end]');
        const mkS = (tag, cls, text) => { const e = { tag, className: cls || '', children: [], attrs: {}, title: '', type: '', value: '', checked: false, disabled: false, selected: false, dataset: {}, style: {}, on: {}, maxLength: 0, placeholder: '',
            classList: { toggle(c, on) { const k = e.className.split(' ').filter(Boolean); const has = k.includes(c), want = on === undefined ? !has : !!on; if (want && !has) k.push(c); if (!want && has) k.splice(k.indexOf(c), 1); e.className = k.join(' '); return want; }, add(c) { this.toggle(c, true); }, remove(c) { this.toggle(c, false); }, contains(c) { return e.className.split(' ').includes(c); } },
            get childNodes() { return e.children; }, get firstChild() { return e.children[0] || null; }, get lastChild() { return e.children[e.children.length - 1] || null; }, appendChild(x) { e.children.push(x); return x; }, insertBefore(x, r) { const i = r ? e.children.indexOf(r) : -1; if (i < 0) e.children.push(x); else e.children.splice(i, 0, x); return x; },
            setAttribute(k, v) { e.attrs[k] = String(v); }, addEventListener(k, fn) { e.on[k] = fn; }, click() { if (e.on.click) e.on.click({ stopPropagation() {} }); }, focus() {} };
            if (text !== undefined && text !== null) e.children.push({ tag: '#text', textContent: String(text), children: [] }); return e; };
        const txS = n => !n ? '' : n.tag === '#text' ? n.textContent : (n.children || []).map(txS).join('');
        const docS = { createTextNode: t => ({ tag: '#text', textContent: t, children: [] }), createElementNS: (ns, tag) => Object.assign(mkS(tag), { ns }) };
        const optS = (v, t, sl) => { const o = mkS('option', null, t); o.value = v; if (sl) o.selected = true; return o; };
        const sent = [];
        const depsN = ['el', 'iconNode', 'rowDef', 'rowIdOf', 'rowLvl', 'rowOn', 'commitItem', 'opt', 'fmtNum', 'iconText', 'LIMITS', '_fxLive', 'document', 'renderViews', 'closeHud', 'closeSheet', 'window', 'systemOf', 'getActiveCampaign', 'facingTarget', 'uid', 'F', 'fxText', 'canRoll', 'sheetRoll', 'commit', 'valueTone', 'TONE_CLASS', 'rowStat', 'rowPaid', '_fxView', 'canApply', 'applyTitle'];
        const depsV = view => [mkS, (v, cls) => mkS('span', cls + ' ico:' + v), S.rowDef, S.rowIdOf, S.rowLvl, S.rowOn, (c, f, op) => sent.push(op), optS, S.fmtNum, v => v || '', S.LIMITS, true, docS, () => {}, () => {}, () => {}, {}, () => gS, () => null, () => null, p => p + 'new', () => F, S.fxText, () => true, () => {}, () => {}, S.valueTone, {}, S.rowStat, S.rowPaid, view, () => true, () => 'it moves'];
        const WS = new Function(...depsN, itS + '\nreturn { itemListInto, swButton, rollFigText };')(...depsV('sheet'));
        const fG = gS.fields.find(x => x.id === 'f_g'), wS = mkS('div'); WS.itemListInto(wS, fG, chS, chS.values.f_g, gS, false, true, true, '', resS);
        const byS = (n, c) => { const acc = []; const w = k => { if ((' ' + (k.className || '') + ' ').indexOf(' ' + c + ' ') >= 0) acc.push(k); (k.children || []).forEach(w); }; w(n); return acc; };
        const rowsS = wS.children.filter(n => n.className.split(' ').includes('sheet-item')), off = byS(rowsS[0], 'sheet-item-onb')[0], onB = byS(rowsS[1], 'sheet-item-onb')[0];
        const rbs = byS(rowsS[0], 'sheet-item-roll'), att = rbs.find(b => /Attack/.test(txS(b))), dmg = rbs.find(b => /Damage/.test(txS(b))), hitB = rbs.find(b => /^.*Hit/.test(txS(b)) && !/Attack/.test(txS(b))), use = rbs.find(b => /Use/.test(txS(b)));
        const kidsS = b => b ? b.children.map(k => k.tag === '#text' ? '#' + k.textContent : k.className) : null;
        const drawOk = off && off.tag === 'button' && off.className === 'tool sheet-item-onb' && off.ariaPressed === 'false' && J(kidsS(off)) === J(['sheet-item-onico ico:icon:hand-fist', '#Ready']) && off.title === 'Ready. Press for Readied.'
            && onB && onB.className === 'tool sheet-item-onb on' && onB.ariaPressed === 'true' && txS(onB) === 'Readied'
            && J(kidsS(att).slice(-3)) === J(['sheet-item-rollico ico:icon:bullseye', '#Attack', 'sheet-item-rollfig']) && txS(att).endsWith('14')
            && dmg && byS(dmg, 'sheet-item-rollfig').length === 0 && hitB && txS(byS(hitB, 'sheet-item-rollfig')[0]) === '15';
        off.click(); onB.click(); const pressOk = J(sent) === J([{ op: 'set', rowId: 'w_rf', facts: { on: true } }, { op: 'set', rowId: 'w_on', facts: { on: false } }]);
        const chip = WS.swButton(chS.values.f_g[1], chS, fG, fG.list.on, true, false), chipOff = WS.swButton(chS.values.f_g[0], chS, fG, { label: 'Installed', offLabel: 'Fitted' }, false, false);
        const chipOk = chip.className === 'sheet-chip sheet-item-onc sheet-item-onw is-on' && txS(chip) === 'Readied' && chipOff.className === 'sheet-chip sheet-item-onc sheet-item-onw' && txS(chipOff) === 'Fitted' && chipOff.children[0].className === 'sheet-item-onico ico:icon:check'
            && WS.rollFigText({ show: '@fig' }, 0, fG.list, null, 'w_rf') === '' && WS.rollFigText({}, 0, fG.list, resS, 'w_rf') === '' && WS.rollFigText({ show: 'Hit' }, 0, fG.list, { cells: { w_rf: [{ error: 'x' }] } }, 'w_rf') === '';
        // the editor: Word while off, an icon, and a roll's Shows list (sliced and run for real)
        let dirtyS = 0; const inS = (cls, value, title, ph) => { const i = mkS('input', cls); i.value = value || ''; i.title = title || ''; i.placeholder = ph || ''; return i; };
        const RB = new Function('el', 'input', 'markDirty', 'patchErrors', 'LIMITS', rbS + '\nreturn { swWordsBox, rollExtras };')(mkS, inS, () => { dirtyS++; }, () => {}, S.LIMITS);
        const swD = { label: 'Readied' }, rowD = mkS('div'); RB.swWordsBox(rowD, swD); const offIn = byS(rowD, 'sys-swoff')[0], icIn = byS(rowD, 'sys-swicon')[0];
        offIn.value = 'Ready'; offIn.on.input(); icIn.value = 'icon:check'; icIn.on.input(); const sw1 = J(swD); offIn.value = '  '; offIn.on.input(); icIn.value = ''; icIn.on.input(); const sw2 = J(swD);
        const rrD = { label: 'Attack' }, rrRow = mkS('div'); RB.rollExtras(rrRow, rrD, { cols: [{ key: 'Hit', label: 'To hit' }] }, false); const figSel = byS(rrRow, 'sys-rlfig')[0];
        const optsS = J(figSel.children.map(o => [o.value, txS(o)])); figSel.value = '@fig'; figSel.on.change({ stopPropagation() {} }); const rr1 = J(rrD); figSel.value = ''; figSel.on.change({ stopPropagation() {} });
        const apD = { label: 'Use', apply: [] }, apRow = mkS('div'); RB.rollExtras(apRow, apD, {}, true);
        const editOk = sw1 === J({ label: 'Readied', offLabel: 'Ready', icon: 'icon:check' }) && sw2 === J({ label: 'Readied' }) && optsS === J([['', 'Shows no figure'], ['@fig', 'Shows its figure'], ['Hit', 'Shows To hit']]) && rr1 === J({ label: 'Attack', show: '@fig' }) && !('show' in rrD)
            && byS(apRow, 'sys-rlfig').length === 0 && byS(apRow, 'sys-rlicon').length === 1 && dirtyS >= 6;
        const cssS = fs.readFileSync(path.join(app, 'style.css'), 'utf8');
        const wiredOk = shS.includes("if (typeof swButton === 'function' && typeof S.offLabel === 'string' && S.offLabel) return swButton(entry, c, f, S, on, editable, okOn);") && require('./checkkit').part('sysedlist.js').includes("if (typeof swWordsBox === 'function') swWordsBox(orow, sw);") && require('./checkkit').part('sysedlist.js').includes("if (typeof rollExtras === 'function') rollExtras(rw, rr, sp, rApply);")
            && shS.includes("b.insertBefore(iconNode(r.icon || 'icon:bolt', 'sheet-roll-icon'), b.firstChild);") && shS.includes("ab.insertBefore(iconNode(typeof r.icon === 'string' && r.icon ? r.icon : 'icon:bolt', 'sheet-item-rollico'), ab.firstChild);") && /\.sheet-item-rollfig \{[^}]*border-radius: 4px;/.test(cssS) && /\.sheet-item-onb \{[^}]*height: 24px;/.test(cssS);
        check('1.6.0, backlog 180 R6 and R7: a list\'s switch may have a word while off (offLabel, beside its label) and an icon (an icon the cleaner keeps, only beside it); a list roll may show a figure (show: its own, @fig, or a column of the list by its key) and wear an icon, an apply action too; the same in both views and a fixed point; '
            + 'rollFigOf: a check whose one side is rolled its target, a sum of plain dice and a number its dice with the row\'s names worked out, anything else nothing; the resolver\'s rf per row; on the sheet (itemListInto, sliced and run for real) the switch is a button that says what the row is now, filled while on and pressed, '
            + 'its icon the list\'s or a check, one press switching it; where it cannot be used a chip of its word; a roll\'s figure in a small box at the end of its button, its own icon after its die, an apply action\'s icon its own or a bolt (the System editor\'s apply action too); the editor\'s Word while off, Icon and Shows (swWordsBox, rollExtras, run for real)',
            cleanOk && figOk && resOk && drawOk && pressOk && chipOk && editOk && wiredOk, J([cleanOk, figOk, resOk, drawOk, pressOk, chipOk, editOk, wiredOk, resS.rf, kidsS(off), kidsS(att), sent, sw1, optsS]));
    }
    {   // 1.6.0, backlog 180 R9 (the owner's order of 2026-10-27): a count in a placement's section title
        const J = JSON.stringify;
        const raw9 = { v: 1, name: 'C', rolls: [],
            items: [{ id: 'i_sw', name: 'Sword', category: 'Melee' }, { id: 'i_ax', name: 'Axe', category: 'Melee' }, { id: 'i_bw', name: 'Bow', category: 'Ranged' }, { id: 'i_rp', name: 'Rope' }],
            fields: [{ id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', list: { on: { label: 'Ready' } } }, { id: 'f_n', key: 'Note', label: 'Note', kind: 'text' }],
            sheet: { sections: [{ id: 's_m', title: 'Melee', fields: [{ id: 'f_g', cats: ['Melee'], count: true }] }, { id: 's_r', title: 'Ranged', fields: [{ id: 'f_g', cats: ['Ranged'], count: 'yes' }] }, { id: 's_n', title: 'Notes', fields: [{ id: 'f_n', count: true }] }] } };
        const g9 = S.cleanSystem(raw9, { F, gmView: true }), p9 = S.cleanSystem(raw9, { F, gmView: false }), pl9 = s => g9.sheet.sections.find(x => x.id === s).fields[0];
        const cleanOk = pl9('s_m').count === true && !('count' in pl9('s_r')) && !('count' in pl9('s_n')) && J(p9.sheet.sections[0].fields[0]) === J(pl9('s_m')) && J(S.cleanSystem(g9, { F, gmView: true })) === J(g9)
            && !('count' in S.cleanSystem({ v: 1, name: 'C', rolls: [], items: [], fields: raw9.fields, sheet: { sections: [{ id: 's_m', title: 'M', fields: [{ id: 'f_g' }] }] } }, { F, gmView: true }).sheet.sections[0].fields[0]);
        const sh9 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const a9 = sh9.indexOf('// [systemcheck:placecount-start]'), b9 = sh9.indexOf('// [systemcheck:placecount-end]');
        const PC = new Function('catPlace', 'rowOn', 'rowDef', sh9.slice(a9, b9) + '\nreturn placeCount;')(S.catPlace, S.rowOn, S.rowDef);
        const f9 = g9.fields.find(x => x.id === 'f_g'), c9 = { id: 'c_k', name: 'Kael', values: { f_g: [{ id: 'w_1', defId: 'i_sw', qty: 1, on: true }, { id: 'w_2', defId: 'i_ax', qty: 2 }, { id: 'w_3', defId: 'i_bw', qty: 1, on: true }, { id: 'w_4', defId: 'i_rp', qty: 1 }, { id: 'w_5', defId: 'i_sw', qty: 1, hid: 1 }, { id: 'w_6', defId: 'i_gone', qty: 1 }] } };
        const mPl = g9.sheet.sections[0].fields[0], rPl = g9.sheet.sections[1].fields[0];
        const gOn = S.cleanSystem(Object.assign({}, raw9, { sheet: { sections: [{ id: 's_m', title: 'Melee', fields: [{ id: 'f_g', cats: ['Melee'], count: true, on: true }] }, { id: 's_r', title: 'Ranged', fields: [{ id: 'f_g', cats: ['Ranged'] }] }] } }), { F, gmView: true });   // its placement shows only the rows switched on, the rows no place names standing in the other
        const countOk = PC(f9, c9, mPl, g9) === 3 && PC(f9, c9, rPl, g9) === 1 && PC(f9, c9, gOn.sheet.sections[0].fields[0], gOn) === 1 && PC(f9, c9, { id: 'f_g' }, { v: 1, items: g9.items, sheet: { sections: [{ id: 's_x', fields: [{ id: 'f_g' }] }] } }) === 4
            && PC(f9, { id: 'c_e', values: {} }, mPl, g9) === 0 && PC(g9.fields.find(x => x.id === 'f_n'), c9, mPl, g9) === null && PC(f9, null, mPl, g9) === null;
        const css9 = fs.readFileSync(path.join(app, 'style.css'), 'utf8'), ht9 = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        const wiredOk = sh9.includes("var k = placeCount(byId[pl.id], c, pl, sys); return k === null ? n : (n === null ? 0 : n) + k; }, null) : null;") && sh9.includes("if (cntN !== null) nameSpan.appendChild(el('span', 'sheet-sec-count', '(' + cntN + ')'));")
            && require('./checkkit').part('sysedlayout.js').includes("else if (act === 'plcount') { if (pl.count === true) delete pl.count; else pl.count = true; }") && require('./checkkit').part('sysedlayout.js').includes("pl.count === true ? 'Rows counted' : 'Count rows'")
            && /\.sheet-sec-count \{[^}]*color: var\(--dim\);/.test(css9) && ht9.includes('<li>Press <b>Count rows</b> on a list&rsquo;s place.');
        check('1.6.0, backlog 180 R9: an item list\'s placement may count its rows in its section\'s title (count, true only, kept on an item list\'s placement alone, the same in both views and a fixed point); placeCount (run for real) counts the rows that placement shows, by its categories and its Only switched on, '
            + 'never a row kept hidden from its player nor one with no definition, so the GM and the player see one number; the header draws it after the title, its style, the Layout tab\'s button and its handler, and Help',
            cleanOk && countOk && wiredOk, J([cleanOk, countOk, wiredOk, mPl, PC(f9, c9, mPl, g9), PC(f9, c9, rPl, g9), PC(f9, c9, gOn.sheet.sections[0].fields[0], gOn), PC(f9, c9, { id: 'f_g' }, { v: 1, items: g9.items, sheet: { sections: [{ id: 's_x', fields: [{ id: 'f_g' }] }] } }), PC(f9, { id: 'c_e', values: {} }, mPl, g9), PC(g9.fields.find(x => x.id === 'f_n'), c9, mPl, g9)]));
    }
    {   // 1.6.0, backlog 180 R12 (the owner's order of 2026-10-27): a list roll that asks the level runs at one from the list's lowest to the row's own
        const J = JSON.stringify;
        const raw12 = { v: 1, name: 'C', rolls: [], sheet: { sections: [] }, items: [{ id: 'i_bolt', name: 'Bolt', lvl: 3, lvls: [{ lvl: 1, text: 'a', tag: '2 FP' }, { lvl: 2, text: 'b', tag: '4 FP' }, { lvl: 3, text: 'c', tag: '6 FP' }] }],
            fields: [{ id: 'f_p', key: 'Pow', label: 'Powers', kind: 'item-list', list: { lvl: { label: 'Level', min: 1, max: 5 }, cols: [{ key: 'Cost', label: 'Cost', formula: 'Row.lvl * 2' }], rolls: [{ label: 'Cast', formula: 'Row.lvl + 10', askLvl: true }, { label: 'Plain', formula: '1d6', askLvl: 'yes' }] } },
                { id: 'f_q', key: 'Gear', label: 'Gear', kind: 'item-list', list: { rolls: [{ label: 'Use', formula: '1', askLvl: true }] } }] };
        const g12 = S.cleanSystem(raw12, { F, gmView: true }), p12 = S.cleanSystem(raw12, { F, gmView: false }), rl12 = g12.fields[0].list.rolls;
        const cleanOk = rl12[0].askLvl === true && !('askLvl' in rl12[1]) && !('askLvl' in g12.fields[1].list.rolls[0]) && p12.fields[0].list.rolls[0].askLvl === true && J(S.cleanSystem(g12, { F, gmView: true })) === J(g12);
        const ch12 = { id: 'c_k', name: 'Kael', values: { f_p: [{ id: 'w_b', defId: 'i_bolt', qty: 1, lvl: 3 }] } };
        const R12 = S.makeResolver(g12, ch12, F), num = (vars, nm) => { const v = F.evaluate(nm, { vars }); return v.ok ? v.value : 'err'; };
        const at1 = R12.row('f_p', 'w_b', 1), at3 = R12.row('f_p', 'w_b', 3), own = R12.row('f_p', 'w_b');
        const rowOk = num(own, 'Row.lvl') === 3 && num(at1, 'Row.lvl') === 1 && num(at1, 'Row.Cost') === 2 && num(own, 'Row.Cost') === 6 && num(at3, 'Row.Cost') === 6 && num(R12.row('f_p', 'w_b', 2), 'Row.Cost') === 4
            && R12.row('f_p', 'w_b', 4) === null && R12.row('f_p', 'w_b', 0) === null && R12.row('f_p', 'w_b', 1.5) === null && R12.row('f_p', 'w_b', '2') === null && R12.row('f_p', 'w_zz', 1) === null;
        const D12 = require(path.join(app, 'scripts', 'dicecore.js'));
        const rq = row => D12.cleanRollReq({ type: 'roll-req', rid: 'r1abc', expr: '1d6', charId: 'c_k', row });
        const wireOk = J((rq({ f: 'f_p', r: 'w_b', i: 0, lv: 2 }) || {}).row) === J({ f: 'f_p', r: 'w_b', i: 0, lv: 2 }) && rq({ f: 'f_p', r: 'w_b', lv: 2 }) === null && rq({ f: 'f_p', r: 'w_b', i: 0, lv: 2.5 }) === null && J((rq({ f: 'f_p', r: 'w_b', i: 0 }) || {}).row) === J({ f: 'f_p', r: 'w_b', i: 0 });
        const sh12 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), nt12 = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8');
        const a12 = sh12.indexOf('// [systemcheck:asklvl-start]'), b12 = sh12.indexOf('// [systemcheck:asklvl-end]'), menus12 = [];
        const AL = new Function('rowLvl', 'entryLvls', 'openLvlMenu', sh12.slice(a12, b12) + '\nreturn askRollLvl;')(S.rowLvl, d => (d && Array.isArray(d.lvls) ? d.lvls : []).filter(r => r && typeof r.lvl === 'number'), (an, lvs, L, lv, go, always) => { menus12.push([lvs.map(r => r.lvl), lv, always]); go(lvs[0].lvl); });
        const sp12 = g12.fields[0].list, picked = [];
        const r1 = AL({}, { id: 'w_b', lvl: 3 }, g12.items[0], sp12, n => picked.push(n)), r2 = AL({}, { id: 'w_b', lvl: 1 }, g12.items[0], sp12, n => picked.push(n)), r3 = AL({}, { id: 'w_c', lvl: 4 }, { name: 'Plain' }, sp12, n => picked.push(n)), r4 = AL({}, { id: 'w_d', lvl: 2 }, {}, {}, n => picked.push(n));
        const askOk = r1 === true && r2 === false && r3 === true && r4 === false && J(menus12) === J([[[1, 2, 3], 3, true], [[1, 2, 3, 4], 4, true]]) && J(picked) === J([1, 1]);
        const wiredOk = sh12.includes("if (r.askLvl === true && typeof askRollLvl === 'function' && !(e && e.wpLvl !== undefined))") && sh12.includes("if (e && typeof e.wpLvl === 'number') oL.row.lv = e.wpLvl;") && sh12.includes("if (always === true || r.lvl !== lv) go(r.lvl);")
            && require('./checkkit').part('sysedbox.js').includes("checkLabel('sys-rlasklvl', rr.askLvl === true, 'Asks the level'") && nt12.includes("if (q.row && typeof q.row.lv === 'number' && !(actQ && actQ.askLvl === true)) { denyQ('char'); return; }") && nt12.includes("if (o.row && typeof o.row.lv === 'number' && !(entR && entR.askLvl === true)) return { error: D.denyText('char') };");
        check('1.6.0, backlog 180 R12: a list roll may Ask the level (askLvl, true only, only on a list with a level, the same in both views and a fixed point); the resolver reads a row at a chosen level (fn.row\'s third argument: Row.lvl and the columns worked out from it at that level, apart from the row\'s own; none for a level below the list\'s lowest, above the row\'s own or not whole); '
            + 'the wire carries it as a whole number beside the roll\'s index only; askRollLvl (run for real) opens the level menu of the entry\'s own levels, else every whole level, up to the row\'s own with its own a choice too, and lets a row at the lowest level just roll; the sheet, the editor\'s tick, and the host and the GM refusing a level for a roll that does not ask it',
            cleanOk && rowOk && wireOk && askOk && wiredOk, J([cleanOk, rowOk, wireOk, askOk, wiredOk, menus12, picked, [num(own, 'Row.Cost'), num(at1, 'Row.Cost')]]));
    }
    {   // 1.6.0, backlog 180 R16 (the owner's order of 2026-10-27, and of state colors "the card edge only beside a badge"): a row's edge follows its state
        const J = JSON.stringify;
        const raw16 = { v: 1, name: 'C', rolls: [], items: [], sheet: { sections: [] }, fields: [{ id: 'f_w', key: 'Weap', label: 'Weapons', kind: 'item-list', list: { edge: true, on: { label: 'Ready' }, badges: [{ words: 'Worn', if: '1', tone: 'warn' }, { words: 'Jammed', if: '1', tone: 'danger' }, { words: 'Odd', if: '1' }, { words: 'Blessed', if: '1', tone: 'good', tint: true }] } }, { id: 'f_x', key: 'X', label: 'X', kind: 'item-list', list: { edge: 1 } }] };
        const g16 = S.cleanSystem(raw16, { F, gmView: true }), sp16 = g16.fields[0].list;
        const cleanOk = sp16.edge === true && S.cleanSystem(raw16, { F, gmView: false }).fields[0].list.edge === true && !(g16.fields[1].list && 'edge' in g16.fields[1].list) && J(S.cleanSystem(g16, { F, gmView: true })) === J(g16);
        const sh16 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const a16 = sh16.indexOf('// [systemcheck:rowedge-start]'), b16 = sh16.indexOf('// [systemcheck:rowedge-end]');
        const RE = new Function('badgeTone', sh16.slice(a16, b16) + '\nreturn rowEdge;')(t => ['good', 'warn', 'danger', 'accent', 'primary'].includes(t) ? t : '');
        const e = cls => ({ className: cls || 'sheet-item' });
        const x1 = e(), x2 = e(), x3 = e(), x4 = e(), x5 = e(), x6 = e('sheet-item sheet-tint-good'), x7 = e(), x8 = e();
        const r = [RE(x1, sp16, [0, 1], false, true), RE(x2, sp16, [0, 2], true, true), RE(x3, sp16, [2], true, true), RE(x4, sp16, [], true, false), RE(x5, sp16, [], false, true), RE(x6, sp16, [1], false, true), RE(x7, Object.assign({}, sp16, { edge: undefined }), [1], true, true), RE(x8, sp16, [9], false, true)];
        const edgeOk = J(r) === J(['danger', 'warn', 'accent', '', '', '', '', '']) && x1.className === 'sheet-item sheet-edge-danger' && x3.className === 'sheet-item sheet-edge-accent' && x6.className === 'sheet-item sheet-tint-good' && x7.className === 'sheet-item';
        const css16 = fs.readFileSync(path.join(app, 'style.css'), 'utf8');
        const wiredOk = sh16.includes("if (typeof rowEdge === 'function') rowEdge(line, spec,") && sh16.includes("if (typeof rowEdge === 'function') rowEdge(tr, spec,") && require('./checkkit').part('sysedlist.js').includes("checkLabel('sys-list-edge', sp.edge === true, 'Edge follows its state'")
            && /\.sheet-item\.sheet-edge-danger, tr\.sheet-edge-danger > td:first-child \{ box-shadow: inset 3px 0 0 var\(--red\); \}/.test(css16) && !/sheet-edge-[a-z]+[^{]*\{[^}]*background/.test(css16);
        check('1.6.0, backlog 180 R16: a list may tick Edge follows its state (edge, true only, the same in both views and a fixed point); rowEdge (run for real) gives a row the edge of the strongest toned badge it shows (danger before warn, a plain badge none), else the accent while it is switched on and its switch stands on the row, nothing for a row a badge already tints, '
            + 'nothing without the tick; drawn on the list and the rich table, an edge with no tint in the style sheet, and the editor\'s tick',
            cleanOk && edgeOk && wiredOk, J([cleanOk, edgeOk, wiredOk, r]));
    }

    {   // 1.6.0, backlog 180 R13 (the owner's order of 2026-10-27): a list's places split by a choice stat's value (a body slot, a container) in place of categories
        const J = JSON.stringify;
        const raw13 = { v: 1, name: 'C', rolls: [], items: [{ id: 'i_helm', name: 'Helm', category: 'Armor', stats: { Slot: 'Head' } }, { id: 'i_mail', name: 'Mail', category: 'Armor', stats: { Slot: 'Torso' } }, { id: 'i_ring', name: 'Ring', category: 'Jewel', stats: { Slot: 'Hands' } }, { id: 'i_belt', name: 'Belt', category: 'Armor' }],
            fields: [{ id: 'f_a', key: 'Worn', label: 'Worn', kind: 'item-list', list: { placeBy: 'slot', stats: [{ key: 'Slot', label: 'Slot', kind: 'pick', opts: [{ label: 'Head', name: 'H' }, { label: 'Torso', name: 'T' }, { label: 'Hands', name: 'N' }] }, { key: 'Cond', label: 'Condition', labels: ['Fine', 'Worn'] }, { key: 'Wt', label: 'Wt' }] } },
                { id: 'f_b', key: 'B', label: 'B', kind: 'item-list', list: { placeBy: 'Wt', stats: [{ key: 'Wt', label: 'Wt' }] } }, { id: 'f_c', key: 'C', label: 'C', kind: 'item-list', list: { placeBy: 'Cond', stats: [{ key: 'Cond', label: 'Condition', labels: ['Fine', 'Worn'] }] } }],
            sheet: { sections: [{ id: 's_h', title: 'Head', fields: [{ id: 'f_a', cats: ['Head'] }] }, { id: 's_t', title: 'Body', fields: [{ id: 'f_a', cats: ['Torso', 'Hands'] }] }] } };
        const g13 = S.cleanSystem(raw13, { F, gmView: true }), p13 = S.cleanSystem(raw13, { F, gmView: false }), sp13 = g13.fields[0].list;
        const cleanOk = sp13.placeBy === 'Slot' && !('placeBy' in g13.fields[1].list) && g13.fields[2].list.placeBy === 'Cond' && J(S.cleanSystem(g13, { F, gmView: true })) === J(g13)
            && J(p13.sheet.sections.map(s => s.fields[0].cats)) === J([['Head'], ['Torso', 'Hands']]);
        const rows13 = [{ id: 'w_1', defId: 'i_helm', qty: 1 }, { id: 'w_2', defId: 'i_mail', qty: 1 }, { id: 'w_3', defId: 'i_ring', qty: 1 }, { id: 'w_4', defId: 'i_belt', qty: 1 }, { id: 'w_5', defId: 'i_mail', qty: 1, ov: { stats: { Slot: 'Head' } } }];
        const valOk = J(rows13.map(r => S.placeVal(g13, sp13, r))) === J(['Head', 'Torso', 'Hands', '', 'Head']) && S.placeVal(g13, { stats: [] }, rows13[0]) === 'Armor' && S.placeVal(g13, sp13, { id: 'w_x', defId: 'i_gone' }) === ''
            && S.placeVal(g13, g13.fields[2].list, { id: 'w_c', defId: 'i_helm', qty: 1, ov: { stats: { Cond: 1 } } }) === 'Worn';
        const secs13 = g13.sheet.sections, tH = S.catPlace(secs13, secs13[0].fields[0], sp13), tB = S.catPlace(secs13, secs13[1].fields[0], sp13);
        const placeOk = J(rows13.map(r => tH(S.placeVal(g13, sp13, r)))) === J([true, false, false, true, true]) && J(rows13.map(r => tB(S.placeVal(g13, sp13, r)))) === J([false, true, true, false, false]);
        const sh13 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), sx13 = fs.readFileSync(path.join(app, 'scripts', 'sheetexport.js'), 'utf8');
        const wiredOk = sh13.includes("return catT ? !!catT(typeof placeVal === 'function' ? placeVal(sysI, spec, r) : (rd.def.category || '')) : true;") && sh13.includes("if (catT && specI && specI.placeBy) catAt = '';") && sx13.includes("return catT(placeVal(sys, spec, r)); });")
            && sh13.includes("var pbS = el('select', 'sys-list-placeby')") === false && require('./checkkit').part('sysedlist.js').includes("pbS = el('select', 'sys-list-placeby')") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-placeby') >= 0) { if (t.value) lsc.placeBy = t.value; else delete lsc.placeBy; }") && require('./checkkit').part('sysedlayout.js').includes("byLabel ? 'By ' + byLabel : 'By category'");
        check('1.6.0, backlog 180 R13: a list may split its places by a choice stat (placeBy, a pick or a number with value names, spelled as the list spells it, never a plain number, the same in both views and a fixed point); placeVal is a row\'s value name there (a copy\'s own value too), else its category, \'\' for none; each place shows the rows of the values it ticks and the home place the rest; '
            + 'the players\' view keeps the places\' value names; the sheet, a count in a title and the readable page read it, a place by a value starts no row in a category, and the Lists tab\'s Places split by and the place\'s By <stat> button',
            cleanOk && valOk && placeOk && wiredOk, J([cleanOk, valOk, placeOk, wiredOk, rows13.map(r => S.placeVal(g13, sp13, r)), p13.sheet.sections.map(s => s.fields[0].cats)]));
    }
    {   // 1.6.0, backlog 180 R15 (the owner, 2026-10-28, by prompt on docs/sheets/row-sets-sheet.html: "A. A stat the list names", "A. A strip above the list", "A. Badge and Row.setall"): rows switched on together
        const J = JSON.stringify;
        const raw15 = { v: 1, name: 'C', rolls: [], items: [{ id: 'i_bp', name: 'Breastplate', stats: { Set: 'Durasteel Suit' } }, { id: 'i_hm', name: 'Helm', stats: { Set: 'durasteel suit' } }, { id: 'i_bt', name: 'Scout Boots', stats: { Set: 'Scout Gear' } }, { id: 'i_ck', name: 'Scout Cloak', stats: { Set: 'Scout Gear' } }, { id: 'i_gl', name: 'Gloves' }],
            fields: [{ id: 'f_w', key: 'Worn', label: 'Armor', kind: 'item-list', list: { sets: 'set', on: { label: 'Worn' }, badges: [{ words: 'Set bonus', if: 'Row.setall' }], stats: [{ key: 'Set', label: 'Set', kind: 'pick', opts: [{ label: 'Durasteel Suit', name: 'D' }, { label: 'Scout Gear', name: 'S' }] }, { key: 'Grade', label: 'Grade', labels: ['Plain', 'Fine'] }, { key: 'Wt', label: 'Wt' }] } },
                { id: 'f_n', key: 'N', label: 'N', kind: 'item-list', list: { sets: 'Set', stats: [{ key: 'Set', label: 'Set', kind: 'pick', opts: [{ label: 'A', name: 'A' }] }] } },
                { id: 'f_x', key: 'X', label: 'X', kind: 'item-list', list: { sets: 'Wt', on: { label: 'On' }, stats: [{ key: 'Wt', label: 'Wt' }] } },
                { id: 'f_g', key: 'G', label: 'G', kind: 'item-list', list: { sets: 'Grade', on: { label: 'On' }, stats: [{ key: 'Grade', label: 'Grade', labels: ['Plain', 'Fine'] }] } }],
            sheet: { sections: [] } };
        const g15 = S.cleanSystem(raw15, { F, gmView: true }), p15 = S.cleanSystem(raw15, { F, gmView: false }), sp15 = g15.fields[0].list;
        const cleanOk = sp15.sets === 'Set' && p15.fields[0].list.sets === 'Set' && !('sets' in g15.fields[1].list) && !('sets' in g15.fields[2].list) && g15.fields[3].list.sets === 'Grade' && J(S.cleanSystem(g15, { F, gmView: true })) === J(g15) && S.ROW_WORDS.setall === 1;
        const rows15 = [{ id: 'w_1', defId: 'i_bp', qty: 1, on: true }, { id: 'w_2', defId: 'i_hm', qty: 1, on: true }, { id: 'w_3', defId: 'i_bt', qty: 1, on: true }, { id: 'w_4', defId: 'i_ck', qty: 1 }, { id: 'w_5', defId: 'i_gl', qty: 1, on: true }, { id: 'w_6', defId: 'i_gl', qty: 1, ov: { stats: { Set: 'Scout Gear' } }, hid: 1 }];
        const sets15 = S.setsOf(g15, sp15, rows15), shape = sets15.map(g => [g.name, g.n, g.on, g.all, g.rows.map(r => r.id)]);
        const setsOk = J(shape) === J([['Durasteel Suit', 2, 2, true, ['w_1', 'w_2']], ['Scout Gear', 2, 1, false, ['w_3', 'w_4']]]) && S.setOf(g15, sp15, rows15[4]) === '' && S.setOf(g15, sp15, rows15[5]) === '' && S.setOf(g15, { stats: sp15.stats }, rows15[0]) === ''
            && J(S.setsOf(g15, sp15, [{ id: 'k', defId: 'i_bp', qty: 1, on: true, keptOn: 1 }]).map(g => [g.on, g.all])) === J([[0, false]]) && S.statName(g15.fields[3].list, { stats: { Grade: 1 } }, 'Grade') === 'Fine' && S.setsOf(g15, sp15, null).length === 0;
        const ch15 = { id: 'c_1', values: { f_w: rows15 } }, bd15 = S.resolveAll(g15, ch15, F, null).f_w.bd || {};
        const ch15b = { id: 'c_1', values: { f_w: rows15.map(r => r.id === 'w_4' ? Object.assign({}, r, { on: true }) : r) } }, bd15b = S.resolveAll(g15, ch15b, F, null).f_w.bd || {};
        const resOk = J(['w_1', 'w_2', 'w_3', 'w_4', 'w_5'].map(k => !!(bd15[k] && bd15[k].length))) === J([true, true, false, false, false]) && J(['w_3', 'w_4'].map(k => !!(bd15b[k] && bd15b[k].length))) === J([true, true]);
        const noSets = Object.assign({}, g15, { fields: g15.fields.map(f => f.id !== 'f_w' ? f : Object.assign({}, f, { list: Object.assign({}, f.list, { sets: undefined }) })) });
        const valOk = !S.validateSystem(g15, F).errors.some(x => /badge/.test(x.prop || '')) && S.validateSystem(JSON.parse(J(noSets)), F).errors.some(x => /badge/.test(x.prop || ''));
        // the strip, run for real on a page of plain objects
        const sh15 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), sx15 = fs.readFileSync(path.join(app, 'scripts', 'sheetexport.js'), 'utf8').replace(/\r\n/g, '\n');
        const stSrc = sh15.slice(sh15.indexOf('// [systemcheck:setstrip-start]'), sh15.indexOf('// [systemcheck:setstrip-end]'));
        const mk = (tag, cls, tx) => { const n = { tag, className: cls || '', textContent: tx === undefined ? '' : String(tx), kids: [], title: '', disabled: false, on: {}, appendChild(k) { this.kids.push(k); return k; }, addEventListener(t, fn) { this.on[t] = fn; } }; return n; };
        const commits = [], run = (editable, client, res) => { commits.length = 0; const ST = new Function('el', 'setsOf', 'rowOn', 'rowIdOf', 'commitItem', 'charById', 'isClient', '_fxLive', stSrc + '\nreturn setStrip;')(mk, S.setsOf, S.rowOn, S.rowIdOf, (c, f, q) => commits.push([c.id, f.id, J(q)]), id => ({ id: id + '!' }), () => client, true); const w = mk('div', 'sheet-items'); ST(w, ch15, g15.fields[0], sp15, g15, rows15, editable, res); return w; };
        const flat15 = l => l.kids.reduce((a, k) => a.concat(/(^| )ui-seg( |$)/.test(k.className || '') ? k.kids : [k]), []); /* 1.6.2 (backlog 225): the two stand in one .ui-seg, moved on purpose */
        const wA = run(true, false, null), box = wA.kids[0], lines = box ? box.kids.map(l => [l.className, flat15(l).map(k => k.className + ':' + k.textContent + (k.tag === 'button' ? ':' + k.disabled : ''))]) : null;
        const drawOk = J(lines) === J([['sheet-set sheet-set-all', ['sheet-set-name:Durasteel Suit', 'sheet-badge sheet-tone-good:Complete', 'sheet-set-sum:2/2 worn', 'tool ghost sheet-set-btn:All on:true', 'tool ghost sheet-set-btn:All off:false']], ['sheet-set', ['sheet-set-name:Scout Gear', 'sheet-set-sum:1/2 worn', 'tool ghost sheet-set-btn:All on:false', 'tool ghost sheet-set-btn:All off:false']]]);
        const segs15 = box ? box.kids.every(l => l.kids.filter(k => k.className === 'ui-seg sheet-set-seg' && k.kids.length === 2).length === 1) : false;
        flat15(box.kids[1])[2].on.click(); const onC = commits.slice(); flat15(box.kids[0])[4].on.click(); const offC = commits.slice();
        const pressOk = J(onC) === J([['c_1!', 'f_w', J({ op: 'set', rowId: 'w_4', facts: { on: true } })]]) && J(offC.slice(1)) === J([['c_1!', 'f_w', J({ op: 'set', rowId: 'w_1', facts: { on: false } })], ['c_1!', 'f_w', J({ op: 'set', rowId: 'w_2', facts: { on: false } })]]);
        const wP = run(true, true, { onOk: { w_4: false } }); flat15(wP.kids[0].kids[1])[2].on.click(); const heldC = commits.length;
        const wS = run(true, false, { onShow: { w_4: false } }); flat15(wS.kids[0].kids[1])[2].on.click(); const hidC = commits.length;
        const wR = run(false, false, null), readOnly = wR.kids[0].kids.map(l => l.kids.filter(k => k.tag === 'button').length);
        const ruleOk = heldC === 0 && hidC === 0 && J(readOnly) === J([0, 0]) && run(true, false, null) && (() => { const w = mk('div'); new Function('el', 'setsOf', 'rowOn', 'rowIdOf', 'commitItem', 'charById', 'isClient', '_fxLive', stSrc + '\nreturn setStrip;')(mk, S.setsOf, S.rowOn, S.rowIdOf, () => {}, null, null, true)(w, ch15, g15.fields[1], g15.fields[1].list, g15, rows15, true, null); return w.kids.length === 0; })();
        const wiredOk = sh15.includes("if (typeof setStrip === 'function' && !onOnly && (!catT || catT.home)) setStrip(wrap, c, f, specI, sysI, carried, playOk, e);") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-sets') >= 0) { if (t.value) lsc.sets = t.value; else delete lsc.sets; }") && require('./checkkit').part('sysedlist.js').includes("el('select', 'sys-list-sets')")
            && sx15.includes("setsOf(sys, spec, vals[f.id])") && sx15.includes("'<p><b>Sets:</b> '");
        check('1.6.0, backlog 180 R15: a list may set its rows in sets by a choice stat (sets, a pick or a number with value names on a list with a switch, spelled as the list spells it, the same in both views and a fixed point); setOf and setsOf count the whole list (a set by name ignoring case, a row the GM keeps from its owner in none, a curse kept on read off); Row.setall is 1 while its whole set is on and is known only to a list that has sets; '
            + 'the strip (setStrip, run for real) draws a line a set above its rows, with Complete, n/m and All on and All off, each pressing the row\'s own switch one row at a time, passing over a row whose switch is not shown or whose needs a player\'s app says fail, no buttons where the switch may not be used, and nothing for a list without sets; the sheet, the Lists tab\'s Sets by and the readable page',
            cleanOk && setsOk && resOk && valOk && drawOk && segs15 && pressOk && ruleOk && wiredOk, J([segs15, cleanOk, setsOk, resOk, valOk, drawOk, pressOk, ruleOk, wiredOk, shape, lines, onC, offC, heldC, hidC, readOnly]));
    }
    {   // 1.6.2 (the owner, by prompt: "Several lists. Parts from becomes ticks"): a gun takes an attachment from one list and a scope from another
        const J = JSON.stringify;
        const rawM = { v: 1, name: 'M', rolls: [], items: [{ id: 'i_gun', name: 'Rifle', category: 'Gun', stats: { Slots: 2 } }, { id: 'i_ub', name: 'Launcher', category: 'Gun', stats: { Acc: 1 } }, { id: 'i_sc', name: 'Scope', category: 'Mod', stats: { Acc: 2, Slot: 0 } }, { id: 'i_gr', name: 'Grip', category: 'Mod', stats: { Acc: 1, Slot: 1 } }],
            fields: [{ id: 'f_w', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Slots', label: 'Slots' }, { key: 'Acc', label: 'Acc' }], parts: { from: 'f_m', also: ['f_w', 'f_m', 'f_none', 7], capBy: 'Slots' }, cols: [{ key: 'N', label: 'N', formula: 'Row.parts' }, { key: 'A', label: 'A', formula: 'Row.parts.Acc' }, { key: 'Best', label: 'Best', formula: 'Row.parts.max.Acc' }] } },
                { id: 'f_m', key: 'Mods', label: 'Mods', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Acc', label: 'Acc' }, { key: 'Slot', label: 'Slot', labels: ['Sights', 'Grip'] }] } },
                { id: 'f_g', key: 'Secret', label: 'Secret', kind: 'item-list', vis: 'gm', list: { parts: { from: 'f_g', also: ['f_m'] } } }], sheet: { sections: [] } };
        const gM = cleanSystem(rawM, { F, gmView: true }), pM = cleanSystem(rawM, { F, gmView: false });
        const cleanM = J(S.cleanListSpec(rawM.fields[0].list, true, F).parts) === J({ from: 'f_m', also: ['f_w', 'f_none'], capBy: 'Slots' }) && J(gM.fields[0].list.parts) === J({ from: 'f_m', also: ['f_w'], capBy: 'Slots' }) && J(S.partsFrom(gM.fields[0].list.parts)) === J(['f_m', 'f_w']) && S.partsSrcs(gM, gM.fields[0].list).map(f => f.id).join() === 'f_m,f_w'
            && J(cleanSystem(gM, { F, gmView: true }).fields[0].list.parts) === J({ from: 'f_m', also: ['f_w'], capBy: 'Slots' }) && J(pM.fields[0].list.parts) === J({ from: 'f_m', also: ['f_w'], capBy: 'Slots' }) && !pM.fields.some(f => f.id === 'f_g');
        let chM = { id: 'c_m', values: { f_w: [{ id: 'w_r', defId: 'i_gun', qty: 1 }], f_m: [] } };
        const opM = (fid, q, o) => { const r = S.applyRowOp(gM, chM, fid, q, F, o || {}); if (r.ok) { chM.values = Object.assign({}, chM.values); chM.values[fid] = r.value; if (r.also) Object.assign(chM.values, r.also); } return r; };
        const a1 = opM('f_m', { op: 'add', defId: 'i_sc', rowId: 'w_s', in: 'w_r' }).ok, a2 = opM('f_w', { op: 'add', defId: 'i_ub', rowId: 'w_u', in: 'w_r' }).ok, a3 = S.applyRowOp(gM, chM, 'f_m', { op: 'add', defId: 'i_gr', rowId: 'w_g', in: 'w_r' }, F, {});
        const hostM = S.partHost(gM, chM, 'f_m', 'w_r', false), hostW = S.partHost(gM, chM, 'f_w', 'w_r', false), ofM = S.partsOf(gM, chM, gM.fields[0].list, 'w_r').map(r => r.id);
        const rM = S.resolveAll(gM, chM, F, null).f_w.cells.w_r.map(x => x.value);
        const addM = a1 === true && a2 === true && a3.ok === true && /holds 2 parts at most/.test(a3.fitSays || '') && !!hostM && !!hostW && J(ofM) === J(['w_s', 'w_u']) && J(rM) === J([2, 3, 2]);
        const keptM = S.partsKept(gM, gM.fields[0].list, chM.values, 'w_r'), chK = JSON.parse(J(chM)), rmM = opM('f_w', { op: 'remove', rowId: 'w_r' });
        const rmOk = rmM.ok && chM.values.f_w.length === 0 && chM.values.f_m.length === 0 && keptM && keptM.f === 'f_m' && keptM.more && keptM.more[0].f === 'f_w' && keptM.more[0].rows[0].row.id === 'w_u';
        const rsM = opM('f_w', { op: 'restore', rowId: 'w_r', row: chK.values.f_w[0], at: 0, parts: keptM });
        const backM = rsM.ok && J(chM.values.f_w.map(r => r.id)) === J(['w_r', 'w_u']) && J(chM.values.f_m.map(r => r.id)) === J(['w_s']);
        const vM = S.validateSystem(gM, F);
        check('1.6.2 a list may take parts from several lists (parts.from and then parts.also, four in all): kept in order, each once, a list the view lacks left out and the first left being from; a part of either list stands in its host, Holds counts both, Row.parts, Row.parts.<stat> and its highest read across them, removing the host takes the parts of each list, and its Undo brings each back to its own list',
            cleanM && addM && rmOk && backM && !vM.errors.length, J([cleanM, addM, rmOk, backM, a3, rM, ofM, keptM, vM.errors]));
        const sysH = cleanSystem({ v: 1, name: 'H', rolls: [], items: [], fields: [{ id: 'f_h', key: 'H', label: 'H', kind: 'item-list', vis: 'all', list: { parts: { from: 'f_q', also: ['f_v'] } } }, { id: 'f_q', key: 'Q', label: 'Q', kind: 'item-list', vis: 'gm' }, { id: 'f_v', key: 'V', label: 'V', kind: 'item-list', vis: 'all' }], sheet: { sections: [] } }, { F, gmView: false });
        check('1.6.2 the players\u2019 view of a list whose first parts list is the GM\u2019s keeps the next one as its parts list', J(sysH.fields[0].list.parts) === J({ from: 'f_v' }), J(sysH.fields[0].list));
    }
    {   // 1.6.0, backlog 180 R14 (the owner, 2026-10-28, by prompt on docs/sheets/row-parts-sheet.html: "A. A row of a list", "A. Pills under the row", "A. Count and totals"): rows in rows
        const J = JSON.stringify;
        const raw14 = { v: 1, name: 'P', rolls: [], items: [{ id: 'i_gust', name: 'Gust', category: 'Power' }, { id: 'i_wide', name: 'Wider', category: 'Option', stats: { XP: 4 } }, { id: 'i_long', name: 'Longer', category: 'Option', stats: { XP: 3 } }, { id: 'i_rock', name: 'Rock', category: 'Junk', stats: { XP: 9 } }],
            fields: [{ id: 'f_p', key: 'Powers', label: 'Powers', kind: 'item-list', vis: 'all', edit: 'owner', list: { parts: { from: 'f_o', cats: ['Option', 'option'], label: 'Option' }, cols: [{ key: 'Cost', label: 'Cost', formula: 'Row.parts.XP' }, { key: 'N', label: 'N', formula: 'Row.parts' }] } },
                { id: 'f_o', key: 'Opts', label: 'Opts', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'XP', label: 'XP', show: true }] } },
                { id: 'f_s', key: 'Self', label: 'Self', kind: 'item-list', list: { parts: { from: 'f_s' } } }, { id: 'f_x', key: 'X', label: 'X', kind: 'item-list', list: { parts: { from: 'f_nope' } } }], sheet: { sections: [] } };
        const g14 = cleanSystem(raw14, { F, gmView: true }), p14 = cleanSystem(raw14, { F, gmView: false });
        const cleanOk = J(g14.fields[0].list.parts) === J({ from: 'f_o', cats: ['Option'], label: 'Option' }) && J(p14.fields[0].list.parts) === J(g14.fields[0].list.parts) && g14.fields[2].list.parts.from === 'f_s' && !(g14.fields[3].list && g14.fields[3].list.parts)
            && J(cleanSystem(g14, { F, gmView: true })) === J(g14) && S.ROW_WORDS.parts === 1 && S.partsSrc(g14, g14.fields[0].list).id === 'f_o' && S.partsSrc(g14, {}) === null;
        let ch = { id: 'c1', values: { f_p: [{ id: 'w_g', defId: 'i_gust', qty: 1 }, { id: 'w_h', defId: 'i_gust', qty: 1, hid: 1 }], f_o: [] } };
        const op = (fid, q, o) => { const r = S.applyRowOp(g14, ch, fid, q, F, o || {}); if (r.ok) { ch.values = Object.assign({}, ch.values); ch.values[fid] = r.value; if (r.also) Object.assign(ch.values, r.also); } return r; };
        const adds = [op('f_o', { op: 'add', defId: 'i_wide', rowId: 'w_a1', in: 'w_g' }).ok, op('f_o', { op: 'add', defId: 'i_wide', rowId: 'w_a2', in: 'w_g' }).ok, op('f_o', { op: 'add', defId: 'i_long', rowId: 'w_a3', in: 'w_g' }).ok,
            op('f_o', { op: 'add', defId: 'i_rock', rowId: 'w_a4', in: 'w_g' }).reason, op('f_o', { op: 'add', defId: 'i_wide', rowId: 'w_a5', in: 'w_zz' }).reason, op('f_o', { op: 'add', defId: 'i_wide', rowId: 'w_a6' }).ok,
            op('f_o', { op: 'add', defId: 'i_wide', rowId: 'w_a7', in: 'w_h' }, { player: true, view: p14 }).reason, op('f_o', { op: 'add', defId: 'i_wide', rowId: 'w_a8', in: 'w_a1' }).reason, op('f_o', { op: 'add', defId: 'i_wide', rowId: 'w_a9', in: 7 }).reason];
        const addOk = J(adds) === J([true, true, true, 'missing', 'missing', true, 'missing', 'missing', 'value']) && J(ch.values.f_o) === J([{ id: 'w_a1', defId: 'i_wide', qty: 2, in: 'w_g' }, { id: 'w_a3', defId: 'i_long', qty: 1, in: 'w_g' }, { id: 'w_a6', defId: 'i_wide', qty: 1 }])
            && J(S.partsOf(g14, ch, g14.fields[0].list, 'w_g').map(r => r.id)) === J(['w_a1', 'w_a3']) && S.partHost(g14, ch, 'f_o', 'w_g', false).row.id === 'w_g' && S.partHost(g14, ch, 'f_o', 'w_h', true) === null;
        const r14 = S.resolveAll(g14, ch, F, null), cells = r14.f_p.cells;
        const resOk = J(cells.w_g.map(x => x.value)) === J([11, 3]) && J(cells.w_h.map(x => x.value)) === J([0, 0]);
        const vB = S.validateSystem(g14, F), bad = Object.assign({}, g14, { fields: g14.fields.map(f => f.id !== 'f_o' ? f : Object.assign({}, f, { list: Object.assign({}, f.list, { cols: [{ key: 'C', label: 'C', formula: 'Row.parts.XP' }] }) })) });
        const valOk = !vB.errors.length && S.validateSystem(JSON.parse(J(bad)), F).errors.some(e => /parts/i.test(J(e))) === true;
        const wire = [S.cleanCharItem({ rid: 'e12345678', charId: 'c_1', fieldId: 'f_o', op: 'add', defId: 'i_wide', rowId: 'w_x', in: 'w_g' }), S.cleanCharItem({ rid: 'e12345678', charId: 'c_1', fieldId: 'f_o', op: 'add', defId: 'i_wide', rowId: 'w_x', in: 'nope' })];
        const wireOk = wire[0] && wire[0].in === 'w_g' && wire[1] === null;
        const chK = JSON.parse(J(ch)), rm = op('f_p', { op: 'remove', rowId: 'w_g' });
        const rmOk = rm.ok && J(ch.values.f_p.map(r => r.id)) === J(['w_h']) && J(ch.values.f_o.map(r => r.id)) === J(['w_a6']);
        ch = chK; const gC = JSON.parse(J(g14)); gC.items[0].rm = 'curse'; const rc = S.applyRowOp(gC, ch, 'f_p', { op: 'remove', rowId: 'w_g' }, F, { player: true, view: p14 });
        const keptId = rc.ok ? rc.value.filter(r => r.hid === 1 && r.id !== 'w_h').map(r => r.id)[0] : '', keptParts = rc.ok && rc.also ? rc.also.f_o.filter(r => r.in === keptId) : [];
        const curseOk = rc.ok && !!keptId && keptParts.length === 2 && keptParts.every(r => r.hid === 1) && rc.also.f_o.some(r => r.id === 'w_a6' && !r.in);
        let chS = { id: 'c2', values: { f_s: [{ id: 'w_s1', defId: 'i_gust', qty: 1 }] } }; const r1 = S.applyRowOp(g14, chS, 'f_s', { op: 'add', defId: 'i_wide', rowId: 'w_s2', in: 'w_s1' }, F, {}); chS.values.f_s = r1.value; const r2 = S.applyRowOp(g14, chS, 'f_s', { op: 'remove', rowId: 'w_s1' }, F, {});
        const selfOk = r1.ok && J(r1.value.map(r => [r.id, r.in || ''])) === J([['w_s1', ''], ['w_s2', 'w_s1']]) && r2.ok && r2.value.length === 0;
        // the sheet's pills, run for real on a page of plain objects
        const sh14 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), sx14 = fs.readFileSync(path.join(app, 'scripts', 'sheetexport.js'), 'utf8').replace(/\r\n/g, '\n'), nt14 = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
        const ppSrc = sh14.slice(sh14.indexOf('// [systemcheck:partpills-start]'), sh14.indexOf('// [systemcheck:partpills-end]'));
        const mk = (tag, cls, tx) => ({ tag, className: cls || '', textContent: tx === undefined ? '' : String(tx), kids: [], childNodes: [], title: '', value: '', on: {}, appendChild(k) { this.kids.push(k); this.childNodes.push(k); return k; }, addEventListener(t, fn) { this.on[t] = fn; } });
        const commits = [], PP = new Function('el', 'opt', 'partsSrc', 'partsOf', 'rowDef', 'rowLvl', 'rowIdOf', 'statChips', 'pickerInto', 'commitItem', 'isClient', 'uid', 'openLibPicker', 'window', ppSrc + '\nreturn { pills: partPills, hosts: partHostIds };')(
            mk, (v, t) => Object.assign(mk('option', '', t), { value: v }), S.partsSrc, S.partsOf, S.rowDef, S.rowLvl, S.rowIdOf, (host, d) => host.appendChild(mk('span', 'sheet-chip', 'XP ' + d.stats.XP)), (sel, items, spec) => { let n = 0; items.forEach(it => { if (!spec.cats || spec.cats.map(x => x.toLowerCase()).includes(String(it.category).toLowerCase())) { sel.appendChild(Object.assign(mk('option', '', it.name), { value: it.id })); n++; } }); return n; },
            (c, f, q) => commits.push([f.id, J(q)]), () => false, () => 'w_new', () => {}, {});
        const ch2 = JSON.parse(J(chK)), host = ch2.values.f_p[0], wrapE = mk('div'), wrapR = mk('div');
        PP.pills(wrapE, ch2, g14.fields[0], g14.fields[0].list, g14, host, true); PP.pills(wrapR, ch2, g14.fields[0], g14.fields[0].list, g14, host, false);
        const box = wrapE.kids[0], pills = box.kids.filter(k => k.className === 'sheet-part').map(p => p.kids.map(k => k.className + ':' + k.textContent)), addSel = box.kids.find(k => k.className === 'field sheet-part-add');
        const drawOk = J(pills) === J([['sheet-part-name:Wider', 'sheet-chip:XP 4', 'tool ghost sheet-part-pm:−', 'sheet-part-n:2', 'tool ghost sheet-part-pm:+', 'tool ghost sheet-part-rm:×'], ['sheet-part-name:Longer', 'sheet-chip:XP 3', 'tool ghost sheet-part-pm:−', 'sheet-part-n:1', 'tool ghost sheet-part-pm:+', 'tool ghost sheet-part-rm:×']])
            && J(addSel.kids.map(o => o.value)) === J(['', 'i_wide', 'i_long']) && addSel.kids[0].textContent === '+ Option…'
            && J(wrapR.kids[0].kids.map(p => p.kids.map(k => k.textContent))) === J([['Wider', 'XP 4', '×2'], ['Longer', 'XP 3']]);
        box.kids[0].kids[4].on.click(); box.kids[1].kids[5].on.click(); addSel.value = 'i_long'; addSel.on.change();
        const pressOk = J(commits) === J([['f_o', J({ op: 'setQty', rowId: 'w_a1', qty: 3 })], ['f_o', J({ op: 'remove', rowId: 'w_a3' })], ['f_o', J({ op: 'add', defId: 'i_long', rowId: 'w_new', in: 'w_g' })]]) && addSel.value === '';
        const hostsOk = J(PP.hosts(g14, ch2, 'f_o')) === J({ w_g: 1, w_h: 1 }) && PP.hosts(g14, ch2, 'f_p') === null;
        const wiredOk = sh14.includes("if (spec && spec.parts && typeof partPills === 'function') partPills(wrap, c, f, spec, sysI, entry, chg && !hudRow);") && sh14.includes("if (phI) rowsI = rowsI.filter(function(r) { return !(r && typeof r.in === 'string' && phI[r.in]); });")
            && sh14.includes("var wR = [nP ? 'its ' + (nP === 1 ? 'part' : nP + ' parts') : '', nG ? 'the ' + (nG === 1 ? 'row' : nG + ' rows') + ' it granted' : ''].filter(Boolean).join(' and '), mR = nP + nG > 1;") && sh14.includes("(mR ? ' go' : ' goes') + ' with it. Undo brings ' + (mR ? 'them' : 'it') + ' back too.'") && sh14.includes("if (partIn) qL.in = partIn;") && sh14.includes("if (partIn) qP.in = partIn;")
            && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-partsfrom') >= 0) {") && sh14.includes("var ptTr = el('tr', 'sheet-itemtable-parts'), ptTd = el('td'); ptTd.colSpan = span;") && require('./checkkit').part('sysedlist.js').includes("ptC = el('input', 'sys-list-partsfrom'); ptC.type = 'checkbox'; ptC.dataset.pf = x.id;") /* 1.6.2: Parts from is a tick a list (moved on purpose) */ && sx14.includes("+ bdW(r) + partW(r); } }];")
            && nt14.includes("var ptW = (q.op === 'add' && q.in !== undefined)") && nt14.includes("['defId', 'rowId', 'qty', 'pay', 'get', 'from', 'back', 'fill', 'in', 'name', 'look', 'looks', 'work', 'drop', 'feed', 'more', 'ov', 'at']");   /* item 35, fold 1d: an own row's text looks travel too (moved on purpose) */   // 1.6.0, backlog 206: moved on purpose, a look, a work line and a line's place travel too   // 1.6.0 (v2, B4): a held-again copy's name, now that a granting add waits too
        check('1.6.0, backlog 180 R14: a list may take parts from an item list (parts { from, cats, label }, this list too, the same in both views and a fixed point, none from a list the view lacks); a part is a row of that list carrying in, its host\'s id, added to a host that is there and no part itself, of a category it takes, stacking only with its own kind in the same host; '
            + 'removing a host removes its parts (a kept curse keeps them, kept too); Row.parts and Row.parts.<stat> read their count and totals, known only on a list that takes parts; the wire\'s add carries in; the sheet\'s pills (partPills, run for real) with - + and x where the character may be changed and the entries that fit, the add a row op of the parts\' list; a part drawn under its host alone; a removal of a host that holds parts asked first; the library pickers, the Lists tab, the readable page and a player\'s app waiting for the host',
            cleanOk && addOk && resOk && valOk && wireOk && rmOk && curseOk && selfOk && drawOk && pressOk && hostsOk && wiredOk, J([cleanOk, addOk, resOk, valOk, wireOk, rmOk, curseOk, selfOk, drawOk, pressOk, hostsOk, wiredOk, adds, ch.values && ch.values.f_o, cells, pills, commits]));
    }
    {   // 1.6.0 R14 (the owner, 2026-10-28: "make Undo after removing a row bring its parts back too, for the GM and for players"): a host's parts come back with it
        const J = JSON.stringify;
        const rawU = { v: 1, name: 'P', rolls: [], items: [{ id: 'i_gust', name: 'Gust', category: 'Power' }, { id: 'i_wide', name: 'Wider', category: 'Option', stats: { XP: 4 } }, { id: 'i_long', name: 'Longer', category: 'Option', stats: { XP: 3 } }],
            fields: [{ id: 'f_p', key: 'Powers', label: 'Powers', kind: 'item-list', vis: 'all', edit: 'owner', list: { parts: { from: 'f_o', cats: ['Option'] }, rolls: [{ label: 'Spend', apply: [{ q: true, formula: '1' }] }] } },
                { id: 'f_o', key: 'Opts', label: 'Opts', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'XP', label: 'XP' }] } },
                { id: 'f_s', key: 'Self', label: 'Self', kind: 'item-list', vis: 'all', edit: 'owner', list: { parts: { from: 'f_s' }, rolls: [{ label: 'Spend', apply: [{ q: true, formula: '1' }] }] } }], sheet: { sections: [] } };
        const gU = cleanSystem(rawU, { F, gmView: true }), spP = gU.fields[0].list, spS = gU.fields[2].list;
        const base = () => ({ id: 'c1', values: { f_p: [{ id: 'w_0', defId: 'i_gust', qty: 1 }, { id: 'w_g', defId: 'i_gust', qty: 1 }], f_o: [{ id: 'w_a1', defId: 'i_wide', qty: 2, in: 'w_g' }, { id: 'w_z', defId: 'i_long', qty: 1, in: 'w_0' }, { id: 'w_a3', defId: 'i_long', qty: 1, in: 'w_g', hid: 1 }],
            f_s: [{ id: 'w_s0', defId: 'i_wide', qty: 1 }, { id: 'w_s1', defId: 'i_gust', qty: 1 }, { id: 'w_s2', defId: 'i_wide', qty: 1, in: 'w_s1' }, { id: 'w_s3', defId: 'i_long', qty: 1 }, { id: 'w_s4', defId: 'i_long', qty: 1, in: 'w_s1' }] } });
        const put = (ch, fid, r) => { ch.values = Object.assign({}, ch.values); ch.values[fid] = r.value; if (r.also) Object.assign(ch.values, r.also); return r; };
        const kept = S.partsKept(gU, spP, base().values, 'w_g'), keptS = S.partsKept(gU, spS, base().values, 'w_s1');
        const keptOk = J(kept) === J({ f: 'f_o', rows: [{ row: { id: 'w_a1', defId: 'i_wide', qty: 2, in: 'w_g' }, at: 0 }, { row: { id: 'w_a3', defId: 'i_long', qty: 1, in: 'w_g', hid: 1 }, at: 2 }] }) && J(keptS.rows.map(p => [p.row.id, p.at])) === J([['w_s2', 2], ['w_s4', 4]])
            && S.partsKept(gU, spP, base().values, 'w_0').rows.length === 1 && S.partsKept(gU, spP, base().values, 'w_nope') === null && S.partsKept(gU, {}, base().values, 'w_g') === null && S.partsKept(gU, spP, null, 'w_g') === null;
        // the other list: removed, then the restore with the kept parts puts the host and its parts back as they stood
        const chA = base(), b0 = J(chA.values); put(chA, 'f_p', S.applyRowOp(gU, chA, 'f_p', { op: 'remove', rowId: 'w_g' }, F, {}));
        const goneA = J(chA.values.f_o.map(r => r.id)), rA = put(chA, 'f_p', S.applyRowOp(gU, chA, 'f_p', { op: 'restore', rowId: 'w_g', row: { id: 'w_g', defId: 'i_gust', qty: 1 }, at: 1, parts: kept }, F, {}));
        const otherOk = goneA === J(['w_z']) && rA.ok && J(chA.values) === b0;
        // the same list
        const chB = base(), bS = J(chB.values.f_s); put(chB, 'f_s', S.applyRowOp(gU, chB, 'f_s', { op: 'remove', rowId: 'w_s1' }, F, {}));
        const goneB = J(chB.values.f_s.map(r => r.id)), rB = put(chB, 'f_s', S.applyRowOp(gU, chB, 'f_s', { op: 'restore', rowId: 'w_s1', row: { id: 'w_s1', defId: 'i_gust', qty: 1 }, at: 1, parts: keptS }, F, {}));
        const sameOk = goneB === J(['w_s0', 'w_s3']) && rB.ok && J(chB.values.f_s) === bS && !rB.also;
        // no parts named: the host alone, as before; parts of another host, another list, or a row already there: passed over
        const chC = base(); put(chC, 'f_p', S.applyRowOp(gU, chC, 'f_p', { op: 'remove', rowId: 'w_g' }, F, {})); const rC = S.applyRowOp(gU, chC, 'f_p', { op: 'restore', rowId: 'w_g', row: { id: 'w_g', defId: 'i_gust', qty: 1 }, at: 1 }, F, {});
        const fake = { f: 'f_o', rows: [{ row: { id: 'w_q', defId: 'i_wide', qty: 1, in: 'w_0' }, at: 0 }, { row: { id: 'w_z', defId: 'i_long', qty: 1, in: 'w_g' }, at: 0 }, 'junk', { row: 7 }] };
        const rD = S.applyRowOp(gU, chC, 'f_p', { op: 'restore', rowId: 'w_g', row: { id: 'w_g', defId: 'i_gust', qty: 1 }, at: 1, parts: fake }, F, {}), rE = S.applyRowOp(gU, chC, 'f_p', { op: 'restore', rowId: 'w_g', row: { id: 'w_g', defId: 'i_gust', qty: 1 }, at: 1, parts: { f: 'f_p', rows: kept.rows } }, F, {});
        const guardOk = rC.ok && !rC.also && rD.ok && !rD.also && rE.ok && !rE.also;
        // an action that uses a host up takes its parts with it, and keeps them for its Undo
        const chE = base(), rv = (c, f, r) => S.makeResolver(gU, c, F, null).row(f, r);
        const uE = S.applyAct(gU, chE, spP.rolls[0], rv(chE, 'f_p', 'w_g'), F, null, { f: 'f_p', r: 'w_g' }), uS = S.applyAct(gU, chE, spS.rolls[0], rv(chE, 'f_s', 'w_s1'), F, null, { f: 'f_s', r: 'w_s1' });
        const actOk = uE.ok && J(uE.values.f_p.map(r => r.id)) === J(['w_0']) && J(uE.values.f_o.map(r => r.id)) === J(['w_z']) && J(uE.gone[0].parts) === J(kept)
            && uS.ok && J(uS.values.f_s.map(r => r.id)) === J(['w_s0', 'w_s3']) && J(uS.gone[0].parts) === J(keptS) && !('f_o' in uS.values);
        const chF = base(); Object.assign(chF.values, uE.values); const rF = put(chF, 'f_p', S.applyRowOp(gU, chF, 'f_p', { op: 'restore', rowId: 'w_g', row: uE.gone[0].row, at: uE.gone[0].at, parts: uE.gone[0].parts }, F, {}));
        const actUndoOk = rF.ok && J(chF.values) === J(base().values);
        // the GM's sheet keeps the parts for its Undo, and the host keeps them in its own record for a player's
        const shU = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), ntU = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
        const wireOk = shU.includes("pk = f.list && f.list.parts && typeof partsKept === 'function' ? partsKept(systemOf(getActiveCampaign()), f.list, c.values, q.rowId) : null; if (pk) g0.parts = pk;")   // 1.6.0 (v2, B4): the pins moved on purpose, a granting row's Undo rides beside its parts'
            && shU.includes("var qR = { op: 'restore', rowId: rid, row: g.row, at: g.at }; if (g.parts) qR.parts = g.parts; if (g.grants) qR.grants = g.grants; if (g.rmBack) qR.rmBack = g.rmBack; commitItem(cN, f, qR);") && shU.includes("var gx = { row: g.row, at: g.at }; if (g.parts) gx.parts = g.parts; if (g.grants) gx.grants = g.grants; goneNote(c, f, gx);")
            && ntU.includes("if (goI.parts) qi.parts = JSON.parse(JSON.stringify(goI.parts));") && ntU.includes("pkG = fdG && fdG.list && fdG.list.parts && Si.partsKept ? Si.partsKept(campI.system, fdG.list, befV, qi.rowId) : null; if (pkG) _rowGrace[gkI + '|gone'].parts = pkG;")
            && ntU.includes("if (g.parts) _rowGrace[charId + '|' + g.f + '|' + g.r + '|gone'].parts = JSON.parse(JSON.stringify(g.parts));");
        check('1.6.0 R14 a removed host\'s Undo brings its parts back (partsKept: the parts as they stood, by their places, kept ones too; the restore puts each back at its place, in the same list or another through also, never one of another host, one already there or into another list; with none named the host alone); an action that uses a host up takes its parts with it and keeps them for its Undo; the GM\'s sheet and the host\'s own record for a player keep them, and the host hands its own to the restore',
            keptOk && otherOk && sameOk && guardOk && actOk && actUndoOk && wireOk, J([keptOk, otherOk, sameOk, guardOk, actOk, actUndoOk, wireOk, kept, goneA, goneB, uE.gone, uS.gone]));
    }
    {   // 1.6.0 (v2, B5 and B6; a build session's sort, 2026-10-29): Row.made, and a host row's room for parts (parts.capBy)
        const J = JSON.stringify;
        const rawM = { v: 1, name: 'M', rolls: [], items: [{ id: 'i_arm', name: 'Arm', category: 'Limb', stats: { Slots: 2 } }, { id: 'i_hand', name: 'Hand', category: 'Limb', stats: { Slots: 1 } }, { id: 'i_eye', name: 'Eye', category: 'Limb' }, { id: 'i_up', name: 'Grip', category: 'Upgrade' }],
            fields: [{ id: 'f_c', key: 'Cyber', label: 'Cyber', kind: 'item-list', vis: 'all', edit: 'owner', list: { custom: true, stats: [{ key: 'Slots', label: 'Slots' }], parts: { from: 'f_c', cats: ['Upgrade'], capBy: 'slots' }, cols: [{ key: 'Bought', label: 'Bought', formula: 'Row.made' }] } }], sheet: { sections: [] } };
        const gM = cleanSystem(rawM, { F, gmView: true }), pM = cleanSystem(rawM, { F, gmView: false }), spM = gM.fields[0].list;
        const pick = JSON.parse(J(rawM)); pick.fields[0].list.stats.push({ key: 'Kind', label: 'Kind', kind: 'pick', opts: ['A', 'B'] }); pick.fields[0].list.parts.capBy = 'Kind'; const none = JSON.parse(J(rawM)); none.fields[0].list.parts.capBy = 'Nope';
        const cleanOk = spM.parts.capBy === 'Slots' && J(pM.fields[0].list.parts) === J(spM.parts) && J(cleanSystem(gM, { F, gmView: true })) === J(gM)
            && !('capBy' in cleanSystem(pick, { F, gmView: true }).fields[0].list.parts) && !('capBy' in cleanSystem(none, { F, gmView: true }).fields[0].list.parts);
        const base = (making) => ({ id: 'c1', making: making ? 1 : undefined, values: { f_c: [{ id: 'w_arm', defId: 'i_arm', qty: 1 }, { id: 'w_hand', defId: 'i_hand', qty: 1 }, { id: 'w_eye', defId: 'i_eye', qty: 1 }] } });
        const op = (ch, q, o) => S.applyRowOp(gM, ch, 'f_c', q, F, o || {});
        const ch1 = base(); const r1 = op(ch1, { op: 'add', defId: 'i_up', rowId: 'w_u1', in: 'w_arm' }); ch1.values.f_c = r1.value;
        const r2 = op(ch1, { op: 'add', defId: 'i_up', rowId: 'w_u2', in: 'w_arm' }); ch1.values.f_c = r2.value;
        const r3 = op(ch1, { op: 'add', defId: 'i_up', rowId: 'w_u3', in: 'w_arm' }), r3p = op(ch1, { op: 'add', defId: 'i_up', rowId: 'w_u3', in: 'w_arm' }, { player: true, view: pM });
        const pvM = { player: true, view: pM }, rQ = op(base(), { op: 'add', defId: 'i_up', rowId: 'w_q', in: 'w_arm', qty: 3 }, pvM), rH = op(base(), { op: 'add', defId: 'i_up', rowId: 'w_h', in: 'w_hand', qty: 1 }), rE = op(base(), { op: 'add', defId: 'i_up', rowId: 'w_e', in: 'w_eye' }, pvM);
        const rC = op(ch1, { op: 'custom', rowId: 'w_cu', in: 'w_arm', def: { name: 'Own grip', category: 'Upgrade' } }, pvM), rCg = op(ch1, { op: 'custom', rowId: 'w_cu', in: 'w_arm', def: { name: 'Own grip', category: 'Upgrade' } }), rCh = op(base(), { op: 'custom', rowId: 'w_cu', in: 'w_hand', def: { name: 'Own grip', category: 'Upgrade' } });
        const full = 'Arm holds 2 parts at most, and has 2 already.';
        const roomOk = r1.ok && r2.ok && r3.ok === true && r3.fitSays === full && rCg.ok === true && rCg.fitSays === full && J(r3p) === J({ ok: false, reason: 'value', msg: full }) && J(rQ) === J({ ok: false, reason: 'value', msg: 'Arm holds 2 parts at most, and that would be more.' }) && rH.ok
            && J(rE) === J({ ok: false, reason: 'value', msg: 'Eye holds no parts.' }) && J(rC) === J({ ok: false, reason: 'value', msg: full }) && rCh.ok
            && S.partsRoom(gM, spM, { id: 'w_arm', defId: 'i_arm', qty: 1 }, ch1.values.f_c, 'w_arm').used === 2 && S.partsRoom(gM, { parts: { from: 'f_c' } }, { id: 'w_arm', defId: 'i_arm' }, [], 'w_arm') === null;
        const mk1 = op(base(true), { op: 'add', defId: 'i_up', rowId: 'w_m', in: 'w_hand' }), mk0 = op(base(), { op: 'add', defId: 'i_up', rowId: 'w_m', in: 'w_hand' }), mkC = op(base(true), { op: 'custom', rowId: 'w_mc', def: { name: 'Own', category: 'Junk' } }), mkC0 = op(base(), { op: 'custom', rowId: 'w_mc', def: { name: 'Own', category: 'Junk' } });
        const rowOf = (r, id) => r.value.find(x => x.id === id);
        const madeOk = rowOf(mk1, 'w_m').mk === 1 && rowOf(mk0, 'w_m').mk === undefined && rowOf(mkC, 'w_mc').mk === 1 && rowOf(mkC0, 'w_mc').mk === undefined && S.ROW_WORDS.made === 1
            && S.cleanCharItem({ rid: 'e12345678', charId: 'c_1', fieldId: 'f_c', op: 'add', defId: 'i_up', rowId: 'w_x', mk: 1 }).mk === undefined;
        const chR = { id: 'c_mk', name: 'Kael', values: { f_c: [{ id: 'w_a', defId: 'i_up', qty: 1, mk: 1 }, { id: 'w_b', defId: 'i_up', qty: 1 }] } }, cR = S.cleanChar(chR, gM, { state: 'host' }), rv = S.resolveAll(gM, cR, F, null).f_c;
        const resOk = cR.values.f_c[0].mk === 1 && cR.values.f_c[1].mk === undefined && rv.cells.w_a[0].value === 1 && rv.cells.w_b[0].value === 0 && S.validateSystem(gM, F).errors.length === 0;
        const shM = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const edOk = require('./checkkit').part('sysedlist.js').includes("pkS = el('select', 'sys-list-partscap')") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-partscap') >= 0) { if (lsc.parts) { if (t.value) lsc.parts.capBy = t.value; else delete lsc.parts.capBy; } }");
        check('1.6.0 (v2, B6) a host row\'s room for parts: a list\'s parts.capBy names one of its number stats (spelled as the list spells it, never a pick, the same in both views); a host holds as many parts as its own figure reads, their quantities added; one more is refused for a player, and the GM\'s hand fits it and is told (1.6.2, moved on purpose: the GM\'s override), a quantity that would pass it too, a row of the character\'s own made as a part too, each in words that name the host; a host whose figure is 0 holds none; no capBy no limit; the Lists tab\'s Holds list',
            cleanOk && roomOk && edOk, J([cleanOk, roomOk, edOk, spM.parts, r3, rQ, rE, rC]));
        const rawO = JSON.parse(J(rawM)); rawO.fields[0].list.stats = [{ key: 'Slots', label: 'Slots' }, { key: 'Made', label: 'Maker' }]; rawO.items[3].stats = { Made: 7 }; rawO.fields[0].list.cols = [{ key: 'Bought', label: 'Bought', formula: 'Row.made' }];
        const gO = cleanSystem(rawO, { F, gmView: true }), cO = S.cleanChar({ id: 'c_mo', name: 'Kael', values: { f_c: [{ id: 'w_a', defId: 'i_up', qty: 1, mk: 1 }] } }, gO, { state: 'host' }), rO = S.resolveAll(gO, cO, F, null).f_c;
        const ownOk = gO.fields[0].list.stats.some(s => s.key === 'Made') && rO.cells.w_a[0].value === 7 && S.validateSystem(gO, F).errors.length === 0 && gO.fields[0].list.stats.length === 2;
        check('1.6.0 (v2, B5) additive (the owner: "we arent removing usable features"): a list that keys a stat Made keeps it, and its formulas read that stat under the name, Row.made reading the mark only in a list with no such key', ownOk, J([gO.fields[0].list.stats, rO.cells]));
        check('1.6.0 (v2, B5) additive: an item or library entry keyed Made keeps its key (cleanItemKey passes over a soft row word, as statKey does); a hard row word still refused',
            S.cleanItemKey('Made', F) === 'Made' && S.cleanItemKey('made') === 'made' && S.cleanItemKey('Count', F) === '' && S.cleanItemKey('Qty') === '', j([S.cleanItemKey('Made', F), S.cleanItemKey('Count', F)]));
        check('1.6.0 (v2, B5) Row.made: a row added, or made the character\'s own, while its character is in the making is marked mk: 1 by applyRowOp from the character as the host holds it, never from a message (the wire keeps no mk); the cleaner keeps it, a column reads Row.made as 1 or 0, the validator knows the name',
            madeOk && resOk, J([madeOk, resOk, cR.values.f_c]));
    }
    {   // 1.6.0 (v2, B4; a build session's sort, 2026-10-29): an entry, or one level of it, grants rows of another list
        const J = JSON.stringify;
        const rawG = { v: 1, name: 'G', rolls: [], items: [
            { id: 'i_ward', name: 'Warden', category: 'Calling', grants: [{ list: 'f_ge', entry: 'i_lamp', qty: 2 }, { list: 'f_ge', entry: 'i_rope', from: 2 }, { list: 'f_tr', entry: 'i_scar', from: 3 }, { list: 'f_ge', entry: 'i_lamp', qty: 1, from: 3 },
                { list: 'f_nope', entry: 'i_rope' }, { list: 'f_x', entry: 'i_rope' }, { list: 'f_tr', entry: 'i_ward' }, { list: 'f_ge', entry: 'i_rope', from: 2, qty: 5 }, { list: 'f_ge', entry: 'i_veil', qty: 2500 }, { list: 'f_ge', entry: 'nope' }] },
            { id: 'i_lamp', name: 'Lamp', category: 'Gear', stats: { Cost: 5 } }, { id: 'i_rope', name: 'Rope', category: 'Gear', stats: { Cost: 2 }, grants: [{ list: 'f_ge', entry: 'i_hook' }] }, { id: 'i_hook', name: 'Hook', category: 'Gear', stats: { Cost: 1 } },
            { id: 'i_scar', name: 'Old scar', category: 'Flaw' }, { id: 'i_veil', name: 'Veil', category: 'Gear', vis: 'gm' }, { id: 'i_mark', name: 'Grim mark', category: 'Calling', rm: 'curse', grants: [{ list: 'f_ge', entry: 'i_lamp' }] }],
            fields: [{ id: 'f_tr', key: 'Traits', label: 'Traits', kind: 'item-list', vis: 'all', edit: 'owner', list: { lvl: { min: 1, max: 5, def: 1 }, rolls: [{ label: 'Spend', apply: [{ q: true, formula: '1' }] }] } },
                { id: 'f_ge', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Cost', label: 'Cost' }], price: 'Cost', cols: [{ key: 'Pay', label: 'Pay', formula: 'Row.Cost * (1 - Row.granted)' }, { key: 'Gr', label: 'Gr', formula: 'Row.granted' }] } },
                { id: 'f_x', key: 'X', label: 'X', kind: 'number', vis: 'all' }], sheet: { sections: [] } };
        const gG = cleanSystem(rawG, { F, gmView: true }), pG = cleanSystem(rawG, { F, gmView: false }), wG = gG.items[0], wP = pG.items.find(i => i.id === 'i_ward');
        const want5 = [{ list: 'f_ge', entry: 'i_lamp', qty: 2 }, { list: 'f_ge', entry: 'i_rope', qty: 1, from: 2 }, { list: 'f_tr', entry: 'i_scar', qty: 1, from: 3 }, { list: 'f_ge', entry: 'i_lamp', qty: 1, from: 3 }, { list: 'f_ge', entry: 'i_veil', qty: 999 }];
        const ten = Array.from({ length: 90 }, (_, i) => ({ list: 'f_ge', entry: 'i_e' + i }));
        const cleanOk = J(wG.grants) === J(want5) && J(wP.grants) === J(want5.slice(0, 4)) && J(cleanSystem(gG, { F, gmView: true })) === J(gG) && J(cleanSystem(pG, { F, gmView: false })) === J(pG)
            && S.cleanGrants(ten).length === S.GRANT_MAX && S.GRANT_MAX === 80 && S.cleanGrants([]) === undefined && S.cleanGrants('x') === undefined && !('grants' in gG.items[1]) && Object.keys(wG).indexOf('grants') === Object.keys(wG).length - 1
            && J(S.hideGrants({ grants: want5.slice() }, id => id === 'i_lamp').grants) === J([want5[0], want5[3]]) && !('grants' in S.hideGrants({ grants: want5.slice() })) && validateSystem(gG, F).errors.length === 0;
        const put = (ch, f, r) => { if (r.ok) { ch.values[f] = r.value; if (r.also) Object.keys(r.also).forEach(k => { ch.values[k] = r.also[k]; }); } return r; };
        const base = () => ({ id: 'c_g', name: 'Ilsa', values: { f_tr: [], f_ge: [{ id: 'w_own', defId: 'i_lamp', qty: 1, paid: 5 }] } });
        const op = (ch, q, o, f) => put(ch, f || 'f_tr', S.applyRowOp(gG, ch, f || 'f_tr', q, F, o || {}));
        const gs = (ch, f) => ch.values[f].filter(r => r.gr).map(r => r.defId + ':' + r.qty + ':' + (r.gr === 'w_wd' ? 'wd' : r.gr === ((ch.values.f_ge.find(x => x.defId === 'i_rope' && x.gr) || {}).id) ? 'rope' : r.gr));
        const ch = base(), a1 = op(ch, { op: 'add', defId: 'i_ward', rowId: 'w_wd' }), s1 = J([gs(ch, 'f_ge'), gs(ch, 'f_tr')]), grRow = ch.values.f_ge.find(r => r.gr === 'w_wd');
        const addOk = a1.ok && J(Object.keys(a1.also)) === J(['f_ge']) && s1 === J([['i_lamp:2:wd', 'i_veil:999:wd'], []]) && grRow.paid === 0 && /^w_[a-z0-9]{8}$/.test(grRow.id) && ch.values.f_ge[0].qty === 1 && !('gr' in ch.values.f_ge[0]);
        const a2 = op(ch, { op: 'set', rowId: 'w_wd', facts: { lvl: 2 } }), s2 = J([gs(ch, 'f_ge'), gs(ch, 'f_tr')]);
        const a3 = op(ch, { op: 'set', rowId: 'w_wd', facts: { lvl: 3 } }), s3 = J([gs(ch, 'f_ge'), gs(ch, 'f_tr')]), at3 = J(ch.values);
        const a4 = op(ch, { op: 'set', rowId: 'w_wd', facts: { lvl: 1 } }), s4 = J([gs(ch, 'f_ge'), gs(ch, 'f_tr')]);
        const lvlOk = a2.ok && s2 === J([['i_lamp:2:wd', 'i_veil:999:wd', 'i_rope:1:wd', 'i_hook:1:rope'], []]) && a3.ok && s3 === J([['i_lamp:3:wd', 'i_veil:999:wd', 'i_rope:1:wd', 'i_hook:1:rope'], ['i_scar:1:wd']]) && a4.ok && s4 === J([['i_lamp:2:wd', 'i_veil:999:wd'], []]);
        // removed, and its Undo (the GM's sheet and the host keep grantsKept as they stood); a restore names only rows of that row's grants
        const chU = base(); op(chU, { op: 'add', defId: 'i_ward', rowId: 'w_wd' }); op(chU, { op: 'set', rowId: 'w_wd', facts: { lvl: 3 } }); const befU = J(chU.values), kept = S.grantsKept(gG, chU.values, 'w_wd'), wdRow = chU.values.f_tr[0];
        const rm = op(chU, { op: 'remove', rowId: 'w_wd' }), afterRm = J(chU.values), junk = { rows: kept.rows.concat([{ f: 'f_ge', row: { id: 'w_zz', defId: 'i_hook', qty: 1, gr: 'w_other' }, at: 0 }, 'x', { f: 'f_ge', row: 7 }]) };
        const rs = op(chU, { op: 'restore', rowId: 'w_wd', row: wdRow, at: 0, grants: junk });
        const undoOk = kept.rows.length === 5 && rm.ok && afterRm === J({ f_tr: [], f_ge: [{ id: 'w_own', defId: 'i_lamp', qty: 1, paid: 5 }] }) && rs.ok && J(chU.values) === befU && S.grantsKept(gG, base().values, 'w_own') === null && S.grantsKept(gG, null, 'w_wd') === null;
        // an action that uses the granting row up takes its grants with it and keeps them for its Undo
        const chA = base(); op(chA, { op: 'add', defId: 'i_ward', rowId: 'w_wd' }); const befA = J(chA.values), keptA = S.grantsKept(gG, chA.values, 'w_wd');
        const uA = S.applyAct(gG, chA, gG.fields[0].list.rolls[0], S.makeResolver(gG, chA, F, null).row('f_tr', 'w_wd'), F, null, { f: 'f_tr', r: 'w_wd' });
        const chA2 = base(); Object.assign(chA2.values, uA.values); const rA = op(chA2, { op: 'restore', rowId: 'w_wd', row: uA.gone[0].row, at: uA.gone[0].at, grants: uA.gone[0].grants });
        const actOk = uA.ok && J(uA.values.f_tr) === '[]' && J(uA.values.f_ge.map(r => r.id)) === J(['w_own']) && J(uA.gone[0].grants) === J(keptA) && rA.ok && J(chA2.values) === befA;
        // a row with no id of its own takes one where it grants; a kept curse keeps what it granted, kept too; a list with no room refuses; a player's own app never grants; held once is granted once
        const chN = base(), aN = op(chN, { op: 'add', defId: 'i_ward' }), nId = chN.values.f_tr[0].id;
        const chK = base(); op(chK, { op: 'add', defId: 'i_mark', rowId: 'w_mk' }); const rK = op(chK, { op: 'remove', rowId: 'w_mk' }, { player: true, view: pG }), kRow = chK.values.f_tr[0], kGr = chK.values.f_ge.find(r => r.gr);
        const chF = base(); chF.values.f_ge = Array.from({ length: S.LIMITS.carried }, (_, i) => ({ id: 'w_h' + i, defId: 'i_hook', qty: 1 })); const rF = S.applyRowOp(gG, chF, 'f_tr', { op: 'add', defId: 'i_ward', rowId: 'w_wd' }, F, {});
        const chP = base(), rP = S.applyRowOp(pG, chP, 'f_tr', { op: 'add', defId: 'i_ward', rowId: 'w_wd' }, F, { player: true, view: pG, copy: true });
        const rawO = JSON.parse(J(rawG)); rawO.fields[1].list.noQty = true; const gO = cleanSystem(rawO, { F, gmView: true }), chO = base(), rO = S.applyRowOp(gO, chO, 'f_tr', { op: 'add', defId: 'i_ward', rowId: 'w_wd' }, F, {});
        const chO2 = { id: 'c_o', name: 'O', values: { f_tr: [], f_ge: [] } }; put(chO2, 'f_tr', S.applyRowOp(gO, chO2, 'f_tr', { op: 'add', defId: 'i_ward', rowId: 'w_wd' }, F, {})); const rO2 = S.applyRowOp(gO, chO2, 'f_ge', { op: 'add', defId: 'i_lamp', rowId: 'w_l2' }, F, { player: true, view: cleanSystem(rawO, { F, gmView: false }) });
        const edgeOk = aN.ok && /^w_[a-z0-9]{8}$/.test(nId) && chN.values.f_ge.filter(r => r.gr === nId).length === 2
            && rK.ok && kRow.hid === 1 && kRow.id !== 'w_mk' && kGr && kGr.hid === 1 && kGr.gr === kRow.id && kGr.id !== 'w_mk'
            && J(rF) === J({ ok: false, reason: 'value', msg: 'No room on Gear for Lamp.' }) && rP.ok && !rP.also && J(rP.value.map(r => r.id)) === J(['w_wd'])
            && rO.ok && J(rO.also.f_ge.map(r => r.defId)) === J(['i_lamp', 'i_veil']) && rO.also.f_ge[0].id === 'w_own' && J(rO2) === J({ ok: false, reason: 'value' });
        // a character file brings its granted rows as they come: the file's mark names the new row, a mark whose row never came goes, nothing is granted again
        const XG = await import(url('sheetexport.js')), chE = base(); op(chE, { op: 'add', defId: 'i_ward', rowId: 'w_wd' }); chE.values.f_ge.push({ id: 'w_lost', defId: 'i_hook', qty: 1, gr: 'w_gone' });
        const fileG = XG.charToJson(gG, chE, null, {}), flG = XG.charFromJson(pG, JSON.parse(J(fileG)), () => []), mkG = { id: 'c_m', name: 'Pax', ownerId: 'u_a', npc: false, making: 1, values: {} }, fG = S.fillMaking(gG, mkG, flG, F, { view: pG, lib: null });
        const wdF = fG.values.f_tr[0], geF = fG.values.f_ge;
        const fileOk = fG.ok && wdF.defId === 'i_ward' && J(geF.map(r => [r.defId, r.gr === wdF.id ? 'wd' : r.gr === undefined ? '-' : r.gr])) === J([['i_lamp', '-'], ['i_lamp', 'wd'], ['i_hook', '-']]);
        // Row.granted: 1 on a granted row, so a cost column charges nothing; a list's own stat of that name is read instead; the wire never names one
        const chR = base(); op(chR, { op: 'add', defId: 'i_ward', rowId: 'w_wd' }); const cR = S.cleanChar(Object.assign({}, chR, { id: 'c_gr' }), gG, { state: 'host' }), rvR = S.resolveAll(gG, cR, F, null).f_ge, gid = cR.values.f_ge[1].id;
        const rawS = JSON.parse(J(rawG)); rawS.fields[1].list.stats.push({ key: 'Granted', label: 'Granted' }); rawS.items[1].stats.Granted = 7; const gS = cleanSystem(rawS, { F, gmView: true }), rvS = S.resolveAll(gS, S.cleanChar({ id: 'c_s', name: 'S', values: { f_ge: [{ id: 'w_own', defId: 'i_lamp', qty: 1 }] } }, gS, { state: 'host' }), F, null).f_ge;
        const wordOk = cR.values.f_ge[1].gr === 'w_wd' && J(rvR.cells.w_own) === J([{ key: 'Pay', value: 5, text: '5' }, { key: 'Gr', value: 0, text: '0' }]) && J(rvR.cells[gid]) === J([{ key: 'Pay', value: 0, text: '0' }, { key: 'Gr', value: 1, text: '1' }])
            && gS.fields[1].list.stats.length === 2 && rvS.cells.w_own[1].value === 7 && !S.ROW_WORDS.granted && validateSystem(gS, F).errors.length === 0
            && S.cleanCharItem({ rid: 'e12345678', charId: 'c_1', fieldId: 'f_tr', op: 'add', defId: 'i_ward', rowId: 'w_x', gr: 'w_wd' }).gr === undefined
            && S.grantWaits(pG, base(), { op: 'add', defId: 'i_ward' }, null) && !S.grantWaits(pG, base(), { op: 'add', defId: 'i_lamp' }, null) && S.grantWaits(gG, chR, { op: 'remove', rowId: 'w_wd' }, null) && !S.grantWaits(gG, chR, { op: 'remove', rowId: 'w_own' }, null)
            && S.grantWaits(pG, base(), { op: 'add', defId: 'i_x9' }, id => (id === 'i_x9' ? { id: 'i_x9', grants: [{ list: 'f_ge', entry: 'i_lamp', qty: 1 }] } : null));
        // the Items tab's Grants box (sliced and run for real), what Save drops said by refreshErrors, and the wiring
        const shG = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), ntG = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
        const mkE = (tag, cls, text) => ({ tag, className: cls || '', textContent: text === undefined ? '' : String(text), kids: [], dataset: {}, appendChild(c) { this.kids.push(c); return c; } });
        const selG = (cls, options, value, title) => Object.assign(mkE('select', cls), { opts: options, value, title });
        const nfG = (cls, value, title, cap) => { const l = mkE('label', 'sys-num'); l.kids.push(mkE('span', 'sys-num-cap', cap)); l.kids.push(Object.assign(mkE('input', cls), { value: value === '' ? '' : String(value), title })); return l; };
        const brG = list => Object.assign(mkE('span', 'sys-btns'), { acts: list.map(b => b[0]) });
        const gbT = require('./checkkit').part('sysedtabs.js'), gbA = gbT.indexOf('// [systemcheck:grantbox-start]'), gbZ = gbT.indexOf('// [systemcheck:grantbox-end]');
        const drG = { fields: rawG.fields, items: [{ id: 'i_a', name: 'Kit', grants: [{ list: 'f_ge', entry: 'i_b', qty: 2, from: 3 }, { list: 'f_gone', entry: 'i_b' }, { entry: 'i_b' }, { list: 'f_ge', entry: 'i_a' }, { list: 'f_ge', entry: 'i_b', from: 3 }, { list: 'f_ge', entry: 'i_lib', qty: 1.5 }, { list: 'f_ge', entry: 'i_none' }] }, { id: 'i_b', name: 'Bell', vis: 'gm' }] };
        const libG = { whole: () => true, entry: id => (id === 'i_lib' ? { id: 'i_lib', name: 'Lantern' } : null), entriesOf: () => [{ id: 'i_lib', name: 'Lantern' }] };
        const GB = new Function('el', 'select', 'numField', 'btnRow', 'draft', 'window', 'getActiveCampaign', 'GRANT_MAX', 'LIMITS', gbT.slice(gbA, gbZ) + '\nreturn { grantBox: grantBox, grantSays: grantSays, grantListFor: grantListFor };')(mkE, selG, nfG, brG, drG, { wpLibrary: libG }, () => ({ library: { packs: [{ id: 'p' }] } }), S.GRANT_MAX, S.LIMITS);
        const boxG = GB.grantBox(drG.items[0]), lnG = boxG.kids.filter(k => /sys-grant( |$)/.test(k.className)), addG = boxG.kids[boxG.kids.length - 1], saysG = GB.grantSays(drG.items[0]);
        const boxOk = lnG.length === 7 && lnG[0].kids[0].textContent === 'Bell' && lnG[0].kids[1].value === 'f_ge' && J(lnG[0].kids[1].opts.map(o => o[0])) === J(['f_tr', 'f_ge']) && lnG[0].kids[2].kids[1].value === '2' && lnG[0].kids[3].kids[1].value === '3' && lnG[0].kids[4].kids[1].value === '' /* 1.6.0: a grant's Level box after From level, so the remove button moved on purpose */ && lnG[0].kids[5].className === 'field sys-grant-spec' && lnG[0].kids[5].value === '' /* 1.6.0 Specialties: a grant's specifier after its Level (moved on purpose) */ && J(lnG[0].kids[6].acts) === J(['grantdel'])
            && J(lnG[1].kids[1].opts[2]) === J(['f_gone', 'On a list that is gone']) && J(lnG[2].kids[1].opts[0]) === J(['', 'Pick a list']) && lnG[5].kids[0].textContent === 'Lantern' && lnG[6].kids[0].textContent === 'An entry that is not here'
            && addG.className === 'sys-grant-add' && J(addG.opts.map(o => o[0])) === J(['', 'i_b', 'i_lib']) && addG.opts[1][1] === 'Bell (GM only)' && GB.grantListFor('i_lib') === 'f_tr'
            && J(saysG) === J({ drop: ['Grant 2: its list is gone, so Save drops it.', 'Grant 3: it needs a list, so Save drops it.', 'Grant 4: an item cannot grant itself, so Save drops it.', 'Grant 5: it repeats grant 1, so Save drops it.'], warn: ['Grant 6: how many is a whole number from 1 to 999, so Save keeps 2.', 'Grant 7: that entry is gone, so it grants nothing until it is back.'] });
        const wireOk = require('./checkkit').part('sysedroll.js').includes("if (typeof grantBox === 'function') row.appendChild(grantBox(it));") && require('./checkkit').part('sysederr.js').includes("if (typeof grantSays === 'function') (draft.items || []).forEach(function(it) { var gS = grantSays(it);")
            && require('./checkkit').part('sysedtabs.js').includes("else if (/(^| )sys-grant-(qty|from|lvl)( |$)/.test(ic)) {") /* 1.6.0: and a grant's Level (moved on purpose) */ && require('./checkkit').part('sysedtabs.js').includes("if (/(^| )sys-grant-add( |$)/.test(c)) { var gv = t.value;") && require('./checkkit').part('sysedtabs.js').includes("if (/(^| )sys-grant-list( |$)/.test(c)) {") && require('./checkkit').part('sysedtabs.js').includes("else if (iact === 'grantdel') {")
            && shG.includes("if (gk0) g0.grants = gk0; return g0; }") && shG.includes("if (g.grants) qR.grants = g.grants; if (g.rmBack) qR.rmBack = g.rmBack; commitItem(cN, f, qR);")
            && ntG.includes("if (goI.grants) qi.grants = JSON.parse(JSON.stringify(goI.grants));") && ntG.includes("var gkG = Si.grantsKept ? Si.grantsKept(campI.system, befV, qi.rowId) : null; if (gkG) _rowGrace[gkI + '|gone'].grants = gkG; }")
            && ntG.includes("if (g.grants) _rowGrace[charId + '|' + g.f + '|' + g.r + '|gone'].grants = JSON.parse(JSON.stringify(g.grants));") && ntG.includes("if (!ptW && typeof S.grantWaits === 'function' && S.grantWaits(camp.system, c, q, net.libEntry)) ptW = true;");
        check('1.6.0 (v2, B4) an entry grants rows: an item\'s grants (list, entry, qty, from) kept by the cleaner, at most 80, each list, entry and level once, never itself, never on a list the view lacks or that holds no rows, a quantity 1 to 999, the last key before the needs; the players\' view leaves out a grant of an entry they cannot see; both views fixed points; an item with none holds no key',
            cleanOk, J([cleanOk, wG.grants, wP.grants]));
        check('1.6.0 (v2, B4) applyRowOp grants in the same change: a row added grants its entry\'s rows on their lists (another through also), at Paid 0, marked gr by the granting row, never merged into a row bought before; a level that rises past a from grants it (what a granted row grants in turn too) and one that falls takes it, a quantity moved by the difference; removed, the granting row takes them all; its Undo brings back each as it stood (grantsKept, the restore\'s grants) and never a row of another; an action that uses it up takes them and keeps them for the same Undo',
            addOk && lvlOk && undoOk && actOk, J([addOk, lvlOk, undoOk, actOk, s1, s2, s3, s4, afterRm, uA.values]));
        check('1.6.0 (v2, B4) the edges: a granting row with no id takes one of its own; a kept curse keeps what it granted, kept from its player under the kept row\'s id; a list with no room refuses the whole change in words; a player\'s own app never grants (its host does); a list that holds each entry once grants none it holds, and a player\'s buy of a granted one is refused; a character file brings its granted rows as they come, a mark whose row never came dropped, nothing granted twice',
            edgeOk && fileOk, J([edgeOk, fileOk, rF, rO && rO.also, rO2, geF]));
        check('1.6.0 (v2, B4) Row.granted reads 1 on a granted row, so a cost column charges nothing for it; never a reserved word: a list\'s own stat named Granted is read instead and still kept; the wire never carries a gr; a player\'s app waits for the host where an add grants or a removal takes granted rows (grantWaits)',
            wordOk, J([wordOk, rvR.cells, rvS.cells]));
        check('1.6.0 (v2, B4) the Items tab\'s Grants box (grantBox, run for real): a line per grant with the entry\'s name as text (a library entry\'s too), the list it lands on, how many, From level and a remove button; a list that is gone and none picked said as options; + Grants offers the system\'s items and the library\'s, never the item itself, and a new grant starts on the list whose categories take it; what Save drops or changes said under the item by refreshErrors (grantSays); wired to the handlers, the GM\'s Undo and the host\'s record',
            boxOk && wireOk, J([boxOk, wireOk, saysG, lnG.map(l => l.kids.map(k => k.textContent || k.value))]));
    }
    {   // 193 (a build session, 2026-10-28): row states as Row names: Row.again anywhere, Row.needsMet in a badge alone
        const J = JSON.stringify;
        const rawA = { v: 1, name: 'A', rolls: [], items: [{ id: 'i_a', name: 'Charm', again: 'name' }, { id: 'i_b', name: 'Ward', needs: [{ id: 'i_a' }] }],
            fields: [{ id: 'f_k', key: 'Kit', label: 'Kit', kind: 'item-list', vis: 'all', edit: 'owner', list: { badges: [{ words: 'Again', if: 'Row.again = 1' }, { words: 'Unmet', if: 'Row.needsMet = 0' }], cols: [{ key: 'G', label: 'G', formula: 'Row.again' }] } }], sheet: { sections: [] } };
        const gA = cleanSystem(rawA, { F, gmView: true }), fk = gA.fields[0];
        const chA = { id: 'c1', values: { f_k: [{ id: 'w_1', defId: 'i_a', qty: 1 }, { id: 'w_2', defId: 'i_a', qty: 1, ov: { name: 'Second' } }, { id: 'w_3', defId: 'i_b', qty: 1 }] } };
        const chB = { id: 'c2', values: { f_k: [{ id: 'w_3', defId: 'i_b', qty: 1 }] } };
        const rA = S.resolveAll(gA, chA, F, null).f_k, rB = S.resolveAll(gA, chB, F, null).f_k;
        const resOk = J(rA.bd) === J({ w_1: [], w_2: [0], w_3: [] }) && J(rB.bd) === J({ w_3: [1] }) && rA.cells.w_2[0].value === 1 && rA.cells.w_1[0].value === 0;
        const rv = S.makeResolver(gA, chA, F, null), outside = rv.needsOk(fk, chA.values.f_k[2], 'Row.needsMet = 1'), inside = rv.needsOk(fk, chA.values.f_k[2], 'Row.needsMet = 1', false, true);
        const gateOk = outside === false && inside === true;
        const vOk = S.validateSystem(gA, F).errors.length === 0;
        const bad = JSON.parse(J(gA)); bad.fields[0].list.cols.push({ key: 'N', label: 'N', formula: 'Row.needsMet' }); const vBad = S.validateSystem(bad, F).errors.some(e => /needsmet/i.test(J(e)));
        const plain = { id: 'w_9', qty: 1, lnk: 1, ag: 1, def: { name: 'Second', category: '', icon: '', notes: '', vis: 'all' } }, cAg = S.cleanChar({ id: 'c_agc', name: 'Kael', values: { f_k: [plain, { id: 'w_8', defId: 'i_a', qty: 1, ag: 1 }] } }, gA, { state: 'host' });
        const rowsAg = cAg && cAg.values && cAg.values.f_k ? cAg.values.f_k : [];
        const copyOk = rowsAg.length === 2 && rowsAg[0].ag === 1 && rowsAg[1].ag === undefined && S.ROW_WORDS.again === 1 && S.ROW_WORDS.needsmet === 1;
        check('193 Row.again (a copy held again under its own name; an owner\'s inline copy says so as ag, kept only there) read anywhere, and Row.needsMet (its entry\'s needs met at the row\'s level, by the definition this machine holds) read in a badge alone: the resolver answers it only for a badge, the validator knows it only in a badge\'s Shown where',
            resOk && gateOk && vOk && vBad && copyOk, J([resOk, gateOk, vOk, vBad, copyOk, rA.bd, rB.bd, rowsAg]));
    }
    {   // 1.6.0, backlog 180 R11 (the owner's order of 2026-10-27; a removed row's Undo is 1.5.8's): split a stack into a row of its own
        const J = JSON.stringify;
        const sys11 = S.cleanSystem({ v: 1, name: 'C', rolls: [], items: [{ id: 'i_gr', name: 'Grenade', category: 'Explosive' }, { id: 'i_rp', name: 'Rope' }],
            fields: [{ id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', list: { on: { label: 'Ready' } } }, { id: 'f_s', key: 'Skill', label: 'Skill', kind: 'item-list', edit: 'owner', list: { noQty: true } }], sheet: { sections: [] } }, { F, gmView: true });
        const ch11 = () => ({ id: 'c_k', name: 'Kael', ownerId: 'p_1', values: { f_g: [{ id: 'w_a', defId: 'i_gr', qty: 5, on: true, paid: 30 }, { id: 'w_b', defId: 'i_rp', qty: 1 }, { id: 'w_k', defId: 'i_gr', qty: 3, hid: 1 }], f_s: [{ id: 'w_s', defId: 'i_rp', qty: 4 }] } });
        const op = (q, pl, c) => S.applyRowOp(sys11, c || ch11(), q.f || 'f_g', Object.assign({ op: 'split' }, q), F, pl ? { player: true } : {});
        const r1 = op({ rowId: 'w_a', qty: 2, back: 'w_new' }), v1 = r1.value;
        const splitOk = r1.ok === true && r1.row === 'w_new' && r1.qty === 2 && r1.split === true && J(v1.map(r => [r.id, r.qty, r.on === true])) === J([['w_a', 3, true], ['w_new', 2, false], ['w_b', 1, false], ['w_k', 3, false]]) && v1[1].defId === 'i_gr' && v1[1].paid === 30
            && op({ rowId: 'w_a', qty: 1, back: 'w_p1' }, true).ok === true;
        const refuseOk = op({ rowId: 'w_a', qty: 5, back: 'w_x' }).reason === 'value' && /from 1 to 4/.test(op({ rowId: 'w_a', qty: 0, back: 'w_x' }).msg) && op({ rowId: 'w_a', qty: 1.5, back: 'w_x' }).reason === 'value'
            && op({ rowId: 'w_b', qty: 1, back: 'w_x' }).reason === 'value' && op({ rowId: 'w_a', qty: 2, back: 'w_b' }).reason === 'value' && op({ rowId: 'w_a', qty: 2 }).reason === 'value'
            && op({ rowId: 'w_k', qty: 1, back: 'w_x' }, true).reason === 'missing' && op({ rowId: 'w_zz', qty: 1, back: 'w_x' }).reason === 'missing' && op({ f: 'f_s', rowId: 'w_s', qty: 1, back: 'w_x' }).reason === 'field'
            && (function() { const c = ch11(); c.values.f_g[0].ld = { defId: 'i_rp' }; return /Unload it first/.test(op({ rowId: 'w_a', qty: 1, back: 'w_x' }, false, c).msg); })();
        const wireOk = J(S.cleanCharItem({ rid: 'e1abc', charId: 'c_k', fieldId: 'f_g', op: 'split', rowId: 'w_a', qty: 2, back: 'w_new' })) === J({ rid: 'e1abc', charId: 'c_k', fieldId: 'f_g', op: 'split', rowId: 'w_a', qty: 2, back: 'w_new' })
            && S.cleanCharItem({ rid: 'e1abc', charId: 'c_k', fieldId: 'f_g', op: 'split', rowId: 'w_a', qty: 2 }) === null && S.cleanCharItem({ rid: 'e1abc', charId: 'c_k', fieldId: 'f_g', op: 'split', rowId: 'w_a', qty: 0, back: 'w_n' }) === null
            && S.cleanCharItem({ rid: 'e1abc', charId: 'c_k', fieldId: 'f_g', op: 'split', rowId: 'w_a', qty: 2.5, back: 'w_n' }) === null && S.cleanCharItem({ rid: 'e1abc', charId: 'c_k', fieldId: 'f_g', op: 'split', rowId: 'w_a', qty: 2, back: '../x' }) === null;
        const sh11 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), nt11 = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8');
        const a11 = sh11.indexOf('// [systemcheck:split-start]'), b11 = sh11.indexOf('// [systemcheck:split-end]'), sent11 = [], toasts11 = [];
        let ans11 = '2';
        const SA = new Function('showPrompt', 'toast', 'commitItem', 'rowIdOf', 'uid', 'charById', sh11.slice(a11, b11) + '\nreturn splitAsk;')((t, d, cb) => { toasts11.push('ask:' + t + '|' + d); cb(ans11); }, m => toasts11.push(m), (c, f, q) => sent11.push([c.fresh === true, q]), S.rowIdOf, () => 'w_fresh', id => id === 'c_k' ? { id: 'c_k', fresh: true } : null);
        SA({ id: 'w_a', qty: 5 }, { id: 'c_k' }, {}); ans11 = '5'; SA({ id: 'w_a', qty: 5 }, { id: 'c_k' }, {}); ans11 = null; SA({ id: 'w_a', qty: 5 }, { id: 'c_k' }, {}); SA({ id: 'w_b', qty: 1 }, { id: 'c_k' }, {}); ans11 = '2'; SA({ id: 'w_a', qty: 5 }, { id: 'c_gone' }, {});
        const askOk = J(sent11) === J([[true, { op: 'split', rowId: 'w_a', qty: 2, back: 'w_fresh' }]]) && toasts11[0] === 'ask:Split how many into a row of their own? From 1 to 4.|2' && toasts11.includes('Split off a whole number from 1 to 4.') && toasts11.length === 5;   // the character read afresh at the answer (the sheet may be drawn again while the question is up, found live), and nothing sent for one gone since
        const uiOk = sh11.includes("var spB = el('button', 'tool ghost sheet-pm sheet-split', 'Split');") && nt11.includes("q.op === 'unchamber' || q.op === 'split' ||")
            && sh11.includes("var undoFollow = function(r) { if (!r || !r.ok || q.op === 'split') return;");   // found live: a split right after a + was read as a drop, and the pickup's Undo took the + back
        check('1.6.0, backlog 180 R11: Split takes part of a stack into a row of its own right after it (applyRowOp split, run for real): the rest stays, the part keeps its entry and Paid, starts off where the list has a switch, and the GM\'s hand and a player\'s alike; refused for a count that is not 1 to one less than the stack, '
            + 'a stack of one, an id taken or missing, a row kept from its player or gone, a list with no quantity and a row that holds a load; the wire keeps a split\'s count and new id only; the sheet\'s Split asks how many (splitAsk, run for real) and sends one op, a player\'s waited for',
            splitOk && refuseOk && wireOk && askOk && uiOk, J([splitOk, refuseOk, wireOk, askOk, uiOk, r1, sent11, toasts11]));
    }
    {   // 1.6.0 (the book's ruling of 2026-10-29: only a natural 3 or 18 is a critical; a widened range lands as a Big Hit): bigAt, bigOf, RollBig
        const J = JSON.stringify, D6 = await import(url('dicecore.js'));
        const fldG = [{ id: 'f_e', key: 'Edge', kind: 'number', def: 4, vis: 'all' }, { id: 'f_s', key: 'Secret', kind: 'number', def: 2, vis: 'gm' }, { id: 'f_c', key: 'Crits', kind: 'number', def: 0, vis: 'all' },
            { id: 'f_t', key: 'Tricks', label: 'Tricks', kind: 'item-list', vis: 'all', list: { rolls: [{ label: 'Feint', formula: '3d6 <= 12', bigAt: '5' }, { label: 'Hidden', formula: '3d6 <= 12', bigAt: 'Secret + 2' }] } }];
        const rawG = { v: 1, name: 'G', fields: fldG, rolls: [{ id: 'r_a', label: 'Lunge', formula: '3d6 <= 12', malf: '17', critAt: '3', bigAt: 'Edge' }, { id: 'r_g', label: 'Sly', formula: '3d6 <= 12', bigAt: 'Secret + 2' }], combat: { checks: 'fixed' } };
        const gG = cleanSystem(rawG, { F, gmView: true }), pG = cleanSystem(rawG, { F, gmView: false }), lst = s => s.fields.filter(f => f.id === 'f_t')[0].list.rolls;
        const keptOk = gG.rolls[0].bigAt === 'Edge' && J(Object.keys(gG.rolls[0]).slice(-2)) === J(['bigAt', 'named']) && gG.rolls[1].bigAt === 'Secret + 2' && pG.rolls[0].bigAt === 'Edge' && !('bigAt' in pG.rolls[1])
            && lst(gG)[0].bigAt === '5' && lst(gG)[1].bigAt === 'Secret + 2' && lst(pG)[0].bigAt === '5' && !('bigAt' in lst(pG)[1]) && !('bigAt' in cleanSystem({ v: 1, name: 'N', fields: [], rolls: [{ id: 'r_n', formula: 'd20' }] }, { F, gmView: true }).rolls[0]);
        const rollOf = (e, d) => { const q = d.slice(); return F.evaluate(e, { random: () => q.shift() }); }, vG = makeResolver(gG, { id: 'c_g', name: 'Ana', values: {} }, F);
        const bg = (ent, e, d, malf) => { const res = rollOf(e, d), vd = D6.verdictOf(res, { at: 3, fumble: 18 }); return S.bigOf(ent, vG, F, D6, res, vd, malf === true); };
        const bigs = [bg(gG.rolls[0], '3d6 <= 12', [1, 1, 2]), bg(gG.rolls[0], '3d6 <= 12', [1, 2, 2]), bg(gG.rolls[0], '3d6 <= 12', [1, 1, 1]), bg(gG.rolls[0], '3d6 <= 3', [1, 2, 2]), bg(gG.rolls[0], '3d6 <= 12', [1, 1, 2], true),
            bg({ bigAt: '' }, '3d6 <= 12', [1, 1, 1]), bg(gG.rolls[0], '3d6', [1, 1, 1]), bg({ bigAt: 'd6' }, '3d6 <= 12', [1, 1, 1]), bg({ bigAt: 'Nope' }, '3d6 <= 12', [1, 1, 1]), bg(gG.rolls[0], '3d6 + 4 <= 12', [1, 1, 2])];
        const bigOk = J(bigs) === J([true, false, true, false, false, false, false, false, false, true]);
        const vRB = S.withRollCrit(vG, '', 0, true), vR0 = S.withRollCrit(vG, 'crit', 0, false), own = makeResolver(cleanSystem({ v: 1, name: 'O', fields: [{ id: 'f_rb', key: 'RollBig', kind: 'number', def: 7, vis: 'all' }], rolls: [] }, { F, gmView: true }), { id: 'c_o', name: 'O', values: {} }, F);
        const nameOk = vRB('RollBig') === 1 && vRB('RollCrit') === 0 && vR0('RollBig') === 0 && vR0('RollCrit') === 1 && S.withRollCrit(own, '', 0, true)('RollBig') === 7;
        const msgsG = (v, id) => v.errors.concat(v.warnings).filter(e => e.id === id).map(e => (e.prop || '') + '|' + e.message);
        const vB = validateSystem(cleanSystem(Object.assign({}, rawG, { rolls: [{ id: 'r_a', label: 'Lunge', formula: '3d6 <= 12', bigAt: 'd6', then: [{ f: 'f_c', formula: 'RollBig + RollCrit', add: true, when: 'hit' }] }, rawG.rolls[1]], fields: fldG.map(f => f.id === 'f_t' ? Object.assign({}, f, { list: { rolls: [{ label: 'Feint', formula: '3d6 <= 12', bigAt: 'd6' }] } }) : f) }), { F, gmView: true }), F);
        const vB2 = validateSystem(cleanSystem(Object.assign({}, rawG, { rolls: [{ id: 'r_x', label: 'Plain', formula: 'd20', then: [{ f: 'f_c', formula: '1', add: true }] }], fields: [fldG[2]] }), { F, gmView: true }), F), vB3 = validateSystem(cleanSystem({ v: 1, name: 'X', fields: [fldG[2]], rolls: [], sheet: { sections: [] }, effects: [] }, { F, gmView: true }), F);
        const valOk = msgsG(vB, 'r_a').some(m => m === 'bigAt|Dice are not allowed in a definition; put the dice in a roll.') && !msgsG(vB, 'r_a').some(m => /RollBig/.test(m)) && msgsG(vB, 'f_t').some(m => m === 'list|Roll “Feint”, lands as a heavy hit at: Dice are not allowed in a definition; put the dice in a roll.')
            && msgsG(vB, 'r_g').some(m => m === 'bigAt|"Secret" is GM only: players’ rolls never land as a heavy hit by it.') && !!vB2 && !!vB3;
        let qG = []; const FG = Object.assign({}, F, { evaluate: (e, o) => F.evaluate(e, Object.assign({ random: () => { if (!qG.length) throw new Error('no die left'); return qG.shift(); } }, o)) });
        const trG = cleanSystem({ v: 1, name: 'T', fields: [fldG[2]], combat: { checks: 'fixed' }, rolls: [{ id: 'r_w', label: 'Wide', formula: '3d6 <= 12', bigAt: '4', then: [{ f: 'f_c', formula: 'RollBig + RollCrit * 10', add: true, when: 'hit' }, { f: 'f_c', formula: '100', add: true, when: 'crit' }] }] }, { F, gmView: true });
        const runG = dice => { qG = dice.slice(); return J(S.timeRuleRun(trG, { id: 'c_t', name: 'T', values: {} }, trG.rolls[0], 1, FG, D6).values); };
        const ruleG = [runG([1, 1, 2]), runG([1, 2, 2]), runG([1, 1, 1])], ruleOk = J(ruleG) === J([J({ f_c: 1 }), '{}', J({ f_c: 111 })]);
        const ixG = fs.readFileSync(path.join(app, 'index.html'), 'utf8'), helpOk = ixG.includes('A natural 3 is a critical success and a natural 18 a critical failure.') && ixG.includes('A roll can also say what <b>Lands as a heavy hit</b>.') /* 1.6.2: the engine's own word, moved on purpose */;
        check('1.6.0 a Big Hit (the book\'s ruling of 2026-10-29): a system roll and a list roll keep bigAt last (the players\' view drops one reading a GM-only value); bigOf marks a success whose natural roll is at or under it (a critical too, a natural 3), never a failure, a malfunction, a value, nothing or a formula that cannot be worked out; RollBig reads 1 or 0 beside RollCrit, and a field of the system named RollBig keeps its own; the validator reads bigAt and knows RollBig in a Then; a time rule\'s Then reads it; Help leads with natural rolls',
            keptOk && bigOk && nameOk && valOk && ruleOk && helpOk, J([keptOk, bigOk, nameOk, valOk, ruleOk, helpOk, bigs, ruleG, msgsG(vB, 'r_a'), msgsG(vB, 'f_t'), msgsG(vB, 'r_g')]));
    }
    {   // 1.6.2 Costs more while (a campaign build's ask, the CORE session's reading: every cost, read before it is paid; never damage nor a loss inflicted), on invented data
        const J = JSON.stringify, sysS = cleanSystem({ v: 1, name: 'Sc', fields: [
            { id: 'f_fp', key: 'Grit', label: 'Grit', kind: 'resource', maxFormula: '10', min: 0, minNeg: true, vis: 'all', edit: 'owner', surcharge: { 'if': 'Grit <= 0', add: 1 } },
            { id: 'f_sec', key: 'Hush', label: 'Hush', kind: 'number', vis: 'gm' },
            { id: 'f_q', key: 'Pluck', label: 'Pluck', kind: 'resource', maxFormula: '10', vis: 'all', surcharge: { 'if': 'Hush > 0', add: 500 } },
            { id: 'f_z', key: 'Zest', label: 'Zest', kind: 'resource', maxFormula: '10', vis: 'all', surcharge: { add: 3 } }],
            rolls: [{ id: 'r_cost', label: 'Strain', apply: [{ f: 'f_fp', formula: '2' }] }, { id: 'r_drain', label: 'Drain', apply: [{ f: 'f_fp', formula: '2', loss: true }] }, { id: 'r_set', label: 'Reset', apply: [{ f: 'f_fp', formula: '0', set: true, loss: true }] }, { id: 'r_add', label: 'Rest', apply: [{ f: 'f_fp', formula: '2', add: true, loss: true }] }],
            combat: { hpResource: 'f_fp', damage: { pool: 'f_fp' } } }, { F, gmView: true });
        const fO = (sy, id) => sy.fields.filter(f => f.id === id)[0], rO = id => sysS.rolls.filter(r => r.id === id)[0];
        const ana = cur => ({ id: 'c_a', name: 'Ana', ownerId: 'u_a', values: { f_fp: { cur: cur } } });
        const run = (id, cur) => { const r = S.applyAct(sysS, ana(cur), rO(id), makeResolver(sysS, ana(cur), F), F, null, null); return [r.ok, r.values.f_fp, r.lines[0] && r.lines[0].d, r.lines[0] && r.lines[0].sur]; };
        const pv = cleanSystem(sysS, { F, gmView: false });
        const kept = [J(fO(sysS, 'f_fp').surcharge), J(fO(sysS, 'f_q').surcharge), 'surcharge' in fO(sysS, 'f_z'), 'surcharge' in fO(pv, 'f_q'), J(fO(pv, 'f_fp').surcharge), J(rO('r_drain').apply), J(rO('r_set').apply), J(rO('r_add').apply)];
        const runs = [run('r_cost', 0), run('r_cost', 2), run('r_cost', 1), run('r_cost', -3), run('r_drain', 0), run('r_set', -2), run('r_add', 0)];
        const hit = S.damageStep(sysS, ana(0), { amt: 2 }, F);
        {   // 1.6.2, a teammate's report: Costs more while is read when a cost is paid, never as the pool's value, so a pool may read itself there
            const sysV = cleanSystem({ v: 1, name: 'V', fields: [{ id: 'f_ep', key: 'EP', label: 'EP', kind: 'resource', maxFormula: '10', vis: 'all', surcharge: { 'if': 'EP <= 0', add: 1 } }, { id: 'f_ex', key: 'ExhStrain', label: 'Strain', kind: 'formula', formula: 'EP <= 0', vis: 'all' }, { id: 'f_e2', key: 'EP2', label: 'EP2', kind: 'resource', maxFormula: '10', vis: 'all', surcharge: { 'if': 'ExhStrain', add: 1 } }, { id: 'f_lp', key: 'Loop', label: 'Loop', kind: 'resource', maxFormula: 'Loop + 1', vis: 'all' }] }, { F, gmView: true });
            const errsV = S.validateSystem(sysV, F).errors.map(e => e.message), loopsV = errsV.filter(m => /loop/.test(m));
            check('Costs more while may read the pool itself, or a formula that reads it, with no loop said (a teammate\'s report): it is read only when a cost is paid; a pool\'s most that reads itself is still a loop',
                loopsV.length === 1 && /Loop/.test(loopsV[0]) && !loopsV.some(m => /EP/.test(m)), J(errsV));
        }
        check('1.6.2 Costs more while: the cleaner keeps a pool\'s test and how much more (1 to 99, 1 unless set) and nothing with no test, the same in both views but where the test reads a GM-only value; a change keeps Not a cost (loss) only on a Subtract; while the test holds, read before the cost is paid, a Subtract takes that much more and its line says so (from 0 a cost of 2 pays 3, from 2 or from 1 only its own), a Subtract ticked Not a cost, a Set, an Add and damage never do',
            J(kept) === J([J({ 'if': 'Grit <= 0', add: 1 }), J({ 'if': 'Hush > 0', add: 99 }), false, false, J({ 'if': 'Grit <= 0', add: 1 }), J([{ f: 'f_fp', formula: '2', loss: true }]), J([{ f: 'f_fp', formula: '0', set: true }]), J([{ f: 'f_fp', formula: '2', add: true }])])
            && J(runs) === J([[true, { cur: -3 }, -3, 1], [true, { cur: 0 }, -2, undefined], [true, { cur: -1 }, -2, undefined], [true, { cur: -6 }, -3, 1], [true, { cur: -2 }, -2, undefined], [true, { cur: 0 }, 2, undefined], [true, { cur: 2 }, 2, undefined]])
            && hit.ok && J(hit.values.f_fp) === J({ cur: -2 }),
            J([kept, runs, hit.values]));
        const shS = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), fbS = fs.readFileSync(path.join(app, 'scripts', 'formbox.js'), 'utf8'), ixS = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        const ntS = [path.join(app, 'assets', 'whatsnew.txt'), path.join(app, '..', '..', 'WHATSNEW.txt')].map(f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, NL));
        check('1.6.2 Costs more while (source): the Fields tab draws it beside Spills into, a form of the character, how much more once a test is written; a change offers Subtract, not a cost where the draft has such a pool or the change says so; Help and both release notes say it',
            /spillCtl\(flags, f\);   \/\/ 1\.6\.0 Spills into\n\s*surchargeCtl\(flags, f\);/.test(shS.replace(/\r\n/g, NL)) && /'sys-surch-if': 'cond'/.test(fbS) && /\['loss', 'Subtract, not a cost'\]/.test(shS)
            && ixS.includes('A resource can <b>Cost more while</b>') && ntS.every(t => t.includes('A pool can cost more while a test holds')));
    }
    {   // 1.6.2 Laid from by category (the owner, by prompt: "Three options on Laid from"; a robot's locations from its parts), on invented data
        const J = JSON.stringify, sysL = cleanSystem({ v: 1, name: 'Ly', fields: [
            { id: 'f_parts', key: 'Parts', label: 'Parts', kind: 'item-list', list: { cats: ['Chassis', 'Arm', 'Sensor', 'Processor', 'Memory Core', 'Upgrade'] } },
            { id: 'f_locs', key: 'Locs', label: 'Locations', kind: 'item-list', list: { stats: [{ key: 'side', label: 'Side', labels: ['None', 'Left', 'Right'] }, { key: 'dmg', label: 'Damage' }],
                lay: { from: 'f_parts', side: 'side', sides: [2, 1], rules: [{ cats: ['Chassis'], name: 'Torso' }, { cats: 'Arm', name: '{side} Arm', each: 'unit' }, { cats: ['Sensor'], name: 'Face (Sensors)', each: 'kind' }, { cats: ['Processor', 'Memory Core'], name: 'Processor/Memory Core', each: 'kind' }, { cats: [], name: 'Nothing' }] } } }],
            items: [{ id: 'i_ch', name: 'Chassis', category: 'Chassis' }, { id: 'i_arm', name: 'Arm', category: 'Arm' }, { id: 'i_opt', name: 'Optic', category: 'Sensor' }, { id: 'i_aud', name: 'Audio Receptor', category: 'Sensor' }, { id: 'i_pro', name: 'Processor', category: 'Processor' }, { id: 'i_mem', name: 'Memory Core', category: 'Memory Core' }, { id: 'i_up', name: 'Booster', category: 'Upgrade' }] }, { F, gmView: true });
        const parts = () => [{ id: 'w_ch', defId: 'i_ch', qty: 1 }, { id: 'w_arm', defId: 'i_arm', qty: 2 }, { id: 'w_opt', defId: 'i_opt', qty: 2 }, { id: 'w_aud', defId: 'i_aud', qty: 1 }, { id: 'w_pro', defId: 'i_pro', qty: 1 }, { id: 'w_mem', defId: 'i_mem', qty: 1 }, { id: 'w_up', defId: 'i_up', qty: 1 }];
        const robot = { id: 'c_d', values: { f_parts: parts(), f_locs: [{ id: 'w_old', qty: 1, def: { name: 'Torso', category: '', icon: '', notes: '', vis: 'all', stats: { dmg: 3 } } }] } };
        S.laySync(sysL, robot, F, {});
        const locs = robot.values.f_locs.map(r => [r.def.name, r.def.stats ? (r.def.stats.side === undefined ? null : r.def.stats.side) : null, r.lf]), torso = robot.values.f_locs.filter(r => r.def.name === 'Torso');
        const drop = JSON.parse(J(robot)); drop.values.f_parts = drop.values.f_parts.filter(r => r.id !== 'w_opt' && r.id !== 'w_pro'); S.laySync(sysL, drop, F, {}); const after = drop.values.f_locs.map(r => r.def.name).sort();
        check('1.6.2 Laid from by category: the cleaner keeps the rules (categories, a name with {side}, one a row, a unit or between them; a rule with no category dropped), the side stat and the sides in order; Chassis lays Torso, taking over the row of its own already called Torso with its damage; an Arm of quantity 2 lays Right Arm then Left Arm with their sides; two sensors lay one Face (Sensors); Processor and Memory Core lay one row between them; an Upgrade no rule names lays nothing; one sensor gone keeps the Face, and Processor gone with Memory Core there keeps that row too; the side is locked on a laid row',
            sysL.fields[1].list.lay.rules.length === 4 && sysL.fields[1].list.lay.side === 'side' && J(sysL.fields[1].list.lay.sides) === J([2, 1])
            && J(locs) === J([['Torso', 0, 'w_ch'], ['Right Arm', 2, 'w_arm#1'], ['Left Arm', 1, 'w_arm#2'], ['Face (Sensors)', 0, 'k:2'], ['Processor/Memory Core', 0, 'k:3']]) && torso.length === 1 && torso[0].id === 'w_old' && torso[0].def.stats.dmg === 3
            && J(after) === J(['Face (Sensors)', 'Left Arm', 'Processor/Memory Core', 'Right Arm', 'Torso']) && S.layCells(sysL.fields[1].list, robot.values.f_locs[1])['s:side'] === 1, J([sysL.fields[1].list.lay, locs, torso, after]));
    }
    {   // 1.6.2 a rule's {n} and its own Only where (asked by a campaign's build: a part x3 opens three locations), on invented data
        const J = JSON.stringify, sysN = cleanSystem({ v: 1, name: 'Ln', fields: [
            { id: 'f_parts', key: 'Parts', label: 'Parts', kind: 'item-list', list: { cats: ['Arm', 'Hand'], stats: [{ key: 'opens', label: 'Opens' }] } },
            { id: 'f_locs', key: 'Locs', label: 'Locations', kind: 'item-list', list: { stats: [{ key: 'side', label: 'Side', labels: ['None', 'Left', 'Right'] }],
                lay: { from: 'f_parts', side: 'side', sides: [2, 1], rules: [{ cats: ['Arm'], name: '{side} Arm {n}', each: 'unit' }, { cats: ['Hand'], name: 'Hand {n}', 'if': 'Row.opens > 0' }] } } }],
            items: [{ id: 'i_arm', name: 'Arm', category: 'Arm' }, { id: 'i_h', name: 'Hand', category: 'Hand', stats: { opens: 1 } }, { id: 'i_h0', name: 'Glove', category: 'Hand', stats: { opens: 0 } }] }, { F, gmView: true });
        const ch = { id: 'c_f', values: { f_parts: [{ id: 'w_a', defId: 'i_arm', qty: 5 }, { id: 'w_h1', defId: 'i_h', qty: 1 }, { id: 'w_h2', defId: 'i_h', qty: 1 }, { id: 'w_g', defId: 'i_h0', qty: 1 }], f_locs: [] } };
        S.laySync(sysN, ch, F, {}); const nms = ch.values.f_locs.map(r => r.def.name), vN = S.validateSystem(sysN, F).errors.filter(e => e.prop === 'list.layrif');
        check('1.6.2 Laid from: {n} in a rule\'s name is the row\'s number among the rows that rule lays on that side (Right Arm 1, Left Arm 1, then Arm 1 to 3 past the sides), and a rule\'s own Only where, a test of the source row, lays nothing for a row where it fails (the Glove); the cleaner keeps it and the validator reads it as the list\'s',
            J(nms) === J(['Right Arm 1', 'Left Arm 1', 'Arm 1', 'Arm 2', 'Arm 3', 'Hand 1', 'Hand 2']) && sysN.fields[1].list.lay.rules[1]['if'] === 'Row.opens > 0' && vN.length === 0, J([nms, sysN.fields[1].list.lay, vN]));
    }
    {   // 1.6.2 Laid from, four more (asked by a campaign's build: a robot's locations from its parts), on invented data
        const J = JSON.stringify, sysD = cleanSystem({ v: 1, name: 'Ld', fields: [
            { id: 'f_parts', key: 'Parts', label: 'Parts', kind: 'item-list', list: { cats: ['Chassis', 'Head', 'Sensor', 'Arm', 'Leg', 'Motive', 'Utility'], stats: [{ key: 'hlo', label: 'Holds' }, { key: 'bhead', label: 'Built-in head' }] } },
            { id: 'f_locs', key: 'Locs', label: 'Locations', kind: 'item-list', list: { stats: [{ key: 'side', label: 'Side', labels: ['None', 'Left', 'Right'] }, { key: 'dmg', label: 'Damage' }], lay: { from: 'f_parts', side: 'side', all: true, rules: [
                { cats: ['Chassis'], name: 'Torso' }, { cats: ['Head'], name: 'Head' }, { cats: ['Head', 'Sensor'], name: 'Face', each: 'kind' },
                { cats: ['Arm'], name: '{side} Arm', each: 'unit', sides: [2, 1] }, { cats: ['Leg'], name: '{side} Leg', each: 'unit', sides: [2, 1] },
                { cats: ['Motive'], name: '{side} Foot', each: 'unit', sides: [2, 1], upTo: 4, rest: 'Motive System {n}' }, { cats: ['Utility'], name: 'Utility Mount', each: 'unit', sides: [], 'if': 'Row.hlo > 0' },
                { cats: ['Chassis'], name: 'Head', 'if': 'Row.bhead > 0' }] } } }],
            items: [{ id: 'i_ch', name: 'Chassis', category: 'Chassis' }, { id: 'i_bh', name: 'Dome Chassis', category: 'Chassis', stats: { bhead: 1 } }, { id: 'i_hd', name: 'Head', category: 'Head' }, { id: 'i_arm', name: 'Arm', category: 'Arm' }, { id: 'i_leg', name: 'Strut', category: 'Leg' },
                { id: 'i_tr', name: 'Tread', category: 'Motive' }, { id: 'i_um', name: 'Tool Mount', category: 'Utility', stats: { hlo: 1 } }, { id: 'i_ep', name: 'Expanded Housing', category: 'Utility', stats: { hlo: 0 } }] }, { F, gmView: true });
        const t3 = { id: 'c_t', values: { f_parts: [{ id: 'w_ch', defId: 'i_ch', qty: 1 }, { id: 'w_hd', defId: 'i_hd', qty: 1 }, { id: 'w_arm', defId: 'i_arm', qty: 3 }, { id: 'w_leg', defId: 'i_leg', qty: 2 }, { id: 'w_tr', defId: 'i_tr', qty: 4 }, { id: 'w_um', defId: 'i_um', qty: 2 }, { id: 'w_ep', defId: 'i_ep', qty: 1 }], f_locs: [] } };
        S.laySync(sysD, t3, F, {}); const t3n = t3.values.f_locs.map(r => [r.def.name, r.def.stats ? r.def.stats.side || 0 : 0]);
        const ge = { id: 'c_g', values: { f_parts: [{ id: 'w_bh', defId: 'i_bh', qty: 1 }, { id: 'w_arm', defId: 'i_arm', qty: 2 }], f_locs: [] } }; S.laySync(sysD, ge, F, {}); const ge1 = ge.values.f_locs.map(r => r.def.name + '|' + r.lf);
        const right = ge.values.f_locs.filter(r => r.lf === 'w_arm@3#1')[0]; right.def = Object.assign({}, right.def, { stats: Object.assign({}, right.def.stats, { dmg: 4 }) });
        ge.values.f_parts[1].qty = 3; S.laySync(sysD, ge, F, {}); const ge2 = ge.values.f_locs.map(r => r.def.name + '|' + r.lf), right2 = ge.values.f_locs.filter(r => r.lf === 'w_arm@3#1')[0];
        check('1.6.2 Laid from: two laid rows never share a name, each numbered where they would (Right Arm 1 and 2, Utility Mount 1 and 2, a lone Right Arm unnumbered); a rule\'s own sides repeat over its units, and None lays no side; Sided only as many as another rule lays (two Struts make Right Foot and Left Foot, the other treads Motive System 1 and 2 with no side); Each rule that takes it lays (a head lays Head and Face, a chassis with a built-in head a Head), each by its own Only where (an Expanded Housing lays nothing); a renamed row keeps its source and its damage',
            J(t3n) === J([['Torso', 0], ['Head', 0], ['Face', 0], ['Right Arm 1', 2], ['Left Arm', 1], ['Right Arm 2', 2], ['Right Leg', 2], ['Left Leg', 1], ['Right Foot', 2], ['Left Foot', 1], ['Motive System 1', 0], ['Motive System 2', 0], ['Utility Mount 1', 0], ['Utility Mount 2', 0]])
            && ge1.some(x => /^Head\|w_bh@7$/.test(x)) && ge1.some(x => /^Right Arm\|/.test(x)) && !ge1.some(x => /Right Arm 1/.test(x))
            && ge2.some(x => /^Right Arm 1\|/.test(x)) && ge2.some(x => /^Right Arm 2\|/.test(x)) && right2 && right2.def.name === 'Right Arm 1' && right2.def.stats.dmg === 4
            && J(sysD.fields[1].list.lay.rules[5]) === J({ cats: ['Motive'], each: 'unit', name: '{side} Foot', sides: [2, 1], upTo: 4, rest: 'Motive System {n}' }) && sysD.fields[1].list.lay.all === true && J(sysD.fields[1].list.lay.rules[6].sides) === '[]',
            J([t3n, ge1, ge2, sysD.fields[1].list.lay.rules[5]]));
    }
    {   // 1.6.2 Laid from, Alone (asked by a campaign's build: one strut and one pad on a robot are its Center Leg and Center Foot), on invented data
        const J = JSON.stringify, sysL = cleanSystem({ v: 1, name: 'Lo', fields: [
            { id: 'f_parts', key: 'Parts', label: 'Parts', kind: 'item-list', list: { cats: ['Leg', 'Motive'], stats: [] } },
            { id: 'f_locs', key: 'Locs', label: 'Locations', kind: 'item-list', list: { stats: [{ key: 'side', label: 'Side', labels: ['None', 'Left', 'Right', 'Center'] }], lay: { from: 'f_parts', side: 'side', rules: [
                { cats: ['Leg'], name: '{side} Leg', each: 'unit', sides: [2, 1], lone: 3 }, { cats: ['Motive'], name: '{side} Foot', each: 'unit', sides: [2, 1], upTo: 0, rest: 'Motive System {n}', lone: 3 },
                { cats: ['Leg'], name: 'Odd', each: 'kind', lone: 3 }, { cats: ['Leg'], name: 'Bad', lone: 0 }, { cats: ['Leg'], name: 'Half', lone: 1.5 }] } } }],
            items: [{ id: 'i_leg', name: 'Strut', category: 'Leg' }, { id: 'i_pad', name: 'Pad', category: 'Motive' }] }, { F, gmView: true });
        const lay = (legs, pads) => { const c = { id: 'c', values: { f_parts: [{ id: 'w_leg', defId: 'i_leg', qty: legs }, { id: 'w_pad', defId: 'i_pad', qty: pads }], f_locs: [] } }; S.laySync(sysL, c, F, {}); return c.values.f_locs.map(r => [r.def.name, r.def.stats ? r.def.stats.side || 0 : 0]); };
        const one = lay(1, 1), two = lay(2, 2), padsMore = lay(1, 3), rs = sysL.fields[1].list.lay.rules;
        check('1.6.2 Laid from, Alone: where a rule lays only one unit with a side, that one takes the rule\'s lone side (one strut and one pad lay Center Leg and Center Foot, the foot sided as many as the legs); two of each take the rule\'s own sides as before; past the count the rest take no side; the cleaner keeps a whole side from 1 and never on a rule that lays one row a kind',
            J(one) === J([['Center Leg', 3], ['Center Foot', 3]]) && J(two) === J([['Right Leg', 2], ['Left Leg', 1], ['Right Foot', 2], ['Left Foot', 1]]) && J(padsMore) === J([['Center Leg', 3], ['Center Foot', 3], ['Motive System 1', 0], ['Motive System 2', 0]])
            && rs[0].lone === 3 && rs[1].lone === 3 && !('lone' in rs[2]) && !('lone' in rs[3]) && !('lone' in rs[4]), J([one, two, padsMore, rs]));
    }
    {   // 1.6.2 Fx.<effect>.on and .n (asked by a campaign's build: temporary HP that falls to the largest stim still on), on invented data
        const J = JSON.stringify, sysF = cleanSystem({ v: 1, name: 'Fx', fields: [{ id: 'f_fx', key: 'Fx1', label: 'Effects', kind: 'effects' }, { id: 'f_t', key: 'Temp', label: 'Temp', kind: 'formula', formula: 'max(if(Fx.e_a.on, 3, 0), if(Fx.e_b.on, 9, 0)) + Fx.e_b.n' }],
            effects: [{ id: 'e_a', name: 'Stim A' }, { id: 'e_b', name: 'Stim B', val: { start: 2 } }, { id: 'e_g', name: 'Secret', vis: 'gm' }] }, { F, gmView: true });
        const chF = { id: 'c', values: { f_fx: [{ id: 'x1', ref: 'e_a', on: true }, { id: 'x2', ref: 'e_b', on: false, v: 4 }] } }, R1 = S.makeResolver(sysF, chF, F);
        const chF2 = { id: 'c', values: { f_fx: [{ id: 'x1', ref: 'e_a', on: true }, { id: 'x2', ref: 'e_b', v: 4 }, { id: 'x3', ref: 'e_b', v: 6 }] } }, R2 = S.makeResolver(sysF, chF2, F);
        const vF = S.validateSystem(cleanSystem({ v: 1, name: 'V', fields: [], effects: [{ id: 'e_a', name: 'Stim A' }], rolls: [{ id: 'r_a', label: 'A', formula: '1d6 + Fx.e_a.on' }, { id: 'r_b', label: 'B', formula: '1d6 + Fx.e_zz.on' }] }, { F, gmView: true }), F).errors;
        const gmF = cleanSystem({ v: 1, name: 'G', fields: [{ id: 'f_fx', key: 'Fx1', label: 'Effects', kind: 'effects' }, { id: 'f_s', key: 'Sec', label: 'Sec', kind: 'formula', formula: 'Fx.e_g.on' }], effects: [{ id: 'e_g', name: 'Secret', vis: 'gm' }] }, { F, gmView: true }), plF = cleanSystem(gmF, { F, gmView: false });
        check('1.6.2 Fx.<effect>.on reads 1 while a row of that library effect is switched on in any effects list, and Fx.<effect>.n the largest number such a row holds, 0 off; the validator knows an effect the system holds and no other; a formula reading a GM-only effect is GM-only, so it leaves the players\' view; the builder says them by the effect\'s name',
            R1('Fx.e_a.on') === 1 && R1('Fx.e_b.on') === 0 && R1('Fx.e_b.n') === 0 && R1('Temp') === 3 && R2('Fx.e_b.on') === 1 && R2('Fx.e_b.n') === 6 && R2('Temp') === 15
            && vF.length === 1 && vF[0].id === 'r_b' && S.gmOnlyNames(gmF, [{ name: 'Fx.e_g.on' }]).length === 1 && J(plF.fields.filter(f => f.id === 'f_s').map(f => f.formula)) !== J(['Fx.e_g.on'])
            && /Stim A is on/.test(S.nameWord(sysF, 'Fx.e_a.on')) && /Stim B.s number/.test(S.nameWord(sysF, 'Fx.e_b.n')), J([R1('Temp'), R2('Temp'), R2('Fx.e_b.n'), vF, S.gmOnlyNames(gmF, [{ name: 'Fx.e_g.on' }]), plF.fields, S.nameWord(sysF, 'Fx.e_a.on')]));
    }
    {   // 1.6.2 Doesn't stack (the campaign build's stims; Ch14: two that raise the same thing give the larger bonus, never the sum), on invented data
        const J = JSON.stringify, sysSt = cleanSystem({ v: 1, name: 'St', fields: [{ id: 'f_agi', key: 'AGI', label: 'Agility', kind: 'number' }, { id: 'f_fx', key: 'Effects', label: 'Effects', kind: 'effects' }],
            effects: [{ id: 'e_alac', name: 'Adrenal Alacrity', mods: [{ f: 'f_agi', op: 'add', v: 2, stack: 'stim' }] }, { id: 'e_hyper', name: 'Hyper-Adrenal', mods: [{ f: 'f_agi', op: 'add', v: 4, stack: ' Stim ' }] },
                { id: 'e_drill', name: 'Drill', mods: [{ f: 'f_agi', op: 'add', v: 1 }] }, { id: 'e_shake', name: 'Shakes', mods: [{ f: 'f_agi', op: 'add', v: -1, stack: 'stim' }, { f: 'f_agi', op: 'add', v: -2, stack: 'stim' }] }, { id: 'e_bad', name: 'Bad', mods: [{ f: 'f_agi', op: 'add', v: 1, stack: '9 nope' }] }] }, { F, gmView: true });
        const on = ids => ({ id: 'c', values: { f_agi: 10, f_fx: ids.map((id, i) => ({ id: 'x_' + i, ref: id, on: true })) } }), agi = ids => S.makeResolver(sysSt, on(ids), F, null)('AGI');
        const got = [agi(['e_alac']), agi(['e_hyper']), agi(['e_alac', 'e_hyper']), agi(['e_hyper', 'e_alac']), agi(['e_alac', 'e_hyper', 'e_drill']), agi(['e_shake']), agi(['e_alac', 'e_shake']), agi(['e_bad'])];
        check('1.6.2 Doesn\'t stack: a change that adds keeps its kind of bonus as a word, trimmed, and none that is no word; of the changes on one figure that share a kind only the largest bonus counts, in either order (Adrenal Alacrity +2 and Hyper-Adrenal +4 give +4), a change with no kind still adds beside it, and penalties of a kind still add',
            sysSt.effects[1].mods[0].stack === 'Stim' && !('stack' in sysSt.effects[4].mods[0]) && J(got) === J([12, 14, 14, 14, 15, 7, 9, 11]), J([got, sysSt.effects.map(e => e.mods)]));
    }
    {   // 1.6.2 darkness steps (the CORE session's answer 7): the cleaner and the names
        const J = JSON.stringify, sysDk = cleanSystem({ v: 1, name: 'Dk', fields: [], dark: [{ label: 'Dim', pen: -1 }, { label: 'Pitch black', pen: -8.4 }, { label: 'Dim', pen: 3 }, { label: '' }] }, { F, gmView: true });
        const mapDk = { id: 'm', meta: { gridType: 'square' }, whiteboard: [] }, rcDk = S.rangeCtx(sysDk, mapDk, { id: 't', x: 0, y: 0, w: 50, h: 50 }, { id: 'n', x: 100, y: 0, w: 50, h: 50 }, { F });
        if (rcDk) { rcDk.dk = 2; rcDk.dkp = -8; }
        const Rd = S.makeResolver(sysDk, { id: 'c', values: {} }, F, S.withRange(S.tokenCtx(mapDk, { id: 't', x: 0, y: 0, w: 50, h: 50 }, {}), rcDk)), R0d = S.makeResolver(sysDk, { id: 'c', values: {} }, F, null);
        const vDk = S.validateSystem(cleanSystem({ v: 1, name: 'V', fields: [], rolls: [{ id: 'r_a', label: 'A', formula: '3d6 + TargetDarkPen + TargetDark' }] }, { F, gmView: true }), F).errors;
        check('1.6.2 darkness steps: the system\'s steps keep a name, a short name made once from it and a whole penalty, each once, the same in both views; TargetDark and TargetDarkPen read the step at the target through the range, 0 with no target; the validator knows both',
            J(sysDk.dark) === J([{ key: 'Dim', label: 'Dim', pen: -1 }, { key: 'PitchBlack', label: 'Pitch black', pen: -8 }]) && J(cleanSystem(sysDk, { F, gmView: false }).dark) === J(sysDk.dark)
            && Rd('TargetDark') === 2 && Rd('TargetDarkPen') === -8 && R0d('TargetDarkPen') === 0 && vDk.length === 0, J([sysDk.dark, Rd('TargetDark'), Rd('TargetDarkPen'), vDk]));
        const rgA = S.withRange({}, { mod: 0, dist: 3, adk: 1, adkp: -1, dk: 2 }).range, RAd = S.makeResolver(sysDk, { id: 'c', values: {} }, F, S.withAttempt(null, 3, undefined, { '@dk': 2, '@dkp': -8 })), RAd0 = S.makeResolver(sysDk, { id: 'c', values: {} }, F, S.withAttempt(null, 3));
        const vAd = S.validateSystem(cleanSystem({ v: 1, name: 'V', fields: [], rolls: [{ id: 'r_d', label: 'Defend', formula: '3d6 <= 10 + AttackerDarkPen', resist: true }, { id: 'r_p', label: 'Plain', formula: '3d6 + AttackerDark' }] }, { F, gmView: true }), F).errors;
        const offA = S.readsOf(sysDk, { roll: { resist: true } }), wordA = S.nameWord(sysDk, 'AttackerDarkPen');
        check('1.6.2 a Defense reads the darkness at the attacker\'s place (the CORE session\'s answer 7): the range carries the attacker\'s own step and its penalty, a resist roll reads them from the attempt as AttackerDark and AttackerDarkPen, 0 with none, the validator knows them only in a roll ticked Resists an attempt, a sheet never grays by them, and the builder offers them in words',
            rgA.adk === 1 && rgA.adkp === -1 && RAd('AttackerDark') === 2 && RAd('AttackerDarkPen') === -8 && RAd0('AttackerDarkPen') === 0 && R0d('AttackerDark') === 0
            && vAd.length === 1 && vAd[0].id === 'r_p' && /Resists an attempt/.test(vAd[0].message) && S.readsAttempt('AttackerDarkPen', F) === true
            && /attacker stands/.test(wordA) && J(offA).indexOf('AttackerDarkPen') >= 0, J([rgA, RAd('AttackerDark'), vAd, wordA, offA]));
    }
    {   // 1.6.2 a cloud an explosive leaves: the cleaner in both views, blastcore's copy of it and the validator
        const J = JSON.stringify, BCc = await import(url('blastcore.js'));
        const raw = { v: 1, name: 'C', fields: [], effects: [{ id: 'e_cough', name: 'Coughing' }], rolls: [{ id: 'r_ht', label: 'HT', formula: '3d6 <= 10' }], items: [{ id: 'i_s', name: 'Smoke', area: { ft: 15, shape: 'circle', cloud: { n: '1d6+2', u: 'turns', r: 3.04, smoke: true, fx: 'e_cough', roll: 'r_ht', junk: 1 } } }, { id: 'i_g', name: 'Gone', area: { ft: 15, shape: 'circle', cloud: { n: '2', u: 'fortnights', fx: 'e_none', roll: 'r_none' } } }, { id: 'i_e', name: 'Haze', area: { ft: 15, shape: 'circle', cloud: {} } }] };
        const gmC = cleanSystem(raw, { F, gmView: true }), plC = cleanSystem(raw, { F, gmView: false }), vC = S.validateSystem(gmC, F);
        const seeds = [null, 'x', [], {}, { n: 5 }, { n: ' 2 ', u: 'hours', r: -1, smoke: 'yes' }, { n: 'a\u0001b', u: '9x', r: 2000, fx: 'bad', roll: 'r_ok' }, { u: 'turns' }], same = seeds.every(v => J(S.cleanCloud(v)) === J(BCc.cleanCloud(v)));
        check('1.6.2 a cloud an explosive leaves (cleanCloud): how long a formula with its unit (rounds by default), its radius held to 0.5 to 1000 yards by the tenth, smoke only as true, an effect and a roll by their ids, nothing else; an empty one is a cloud that stays; kept in the GM\'s view alone; blastcore keeps it the same way on a mine; the validator says a unit, an effect or a roll that is not there',
            J(gmC.items[0].area.cloud) === J({ n: '1d6+2', u: 'turns', r: 3, smoke: true, fx: 'e_cough', roll: 'r_ht' }) && J(gmC.items[2].area.cloud) === J({}) && !('cloud' in plC.items[0].area) && same
            && J(S.cleanCloud({ n: ' 2 ', u: 'hours', r: -1, smoke: 'yes' })) === J({ n: '2', u: 'hours' }) && vC.warnings.filter(w => w.id === 'i_g' && w.prop === 'cloud').length === 3 && !vC.warnings.some(w => w.id === 'i_s' && w.prop === 'cloud'),
            J([gmC.items.map(i => i.area.cloud), plC.items[0].area, vC.warnings.filter(w => w.prop === 'cloud')]));
    }
    {   // 1.6.2 scene context (the owner, by prompt: "The scene carries it", "A Scene row on the map's menu", "A roll ticked Kept for the scene"), on invented data
        const J = JSON.stringify, sysSc = cleanSystem({ v: 1, name: 'Sc', fields: [{ id: 'f_wits', key: 'Wits', label: 'Wits', kind: 'number' }],
            scenes: [{ label: 'In person' }, { label: 'Heard only' }, { label: 'In person' }, { label: '' }, { key: '9bad', label: 'Written' }],
            rolls: [{ id: 'r_react', label: 'Reaction', formula: '3d6', keep: 'scene' }, { id: 'r_talk', label: 'Talk', formula: '3d6 + Scene.Inperson + Target.Reaction' }] }, { F, gmView: true });
        const pvSc = cleanSystem(sysSc, { F, gmView: false }), map = { id: 'm', meta: { scene: 'InPerson', gridType: 'square' }, whiteboard: [] }, ch = { id: 'c', values: { f_wits: 1 } };
        const tc = S.tokenCtx(map, { id: 't', x: 0, y: 0, w: 50, h: 50 }, {}), rc = S.rangeCtx(sysSc, map, { id: 't', x: 0, y: 0, w: 50, h: 50 }, { id: 'n', x: 100, y: 0, w: 50, h: 50, reaction: 14 }, { F });
        const R = S.makeResolver(sysSc, ch, F, S.withRange(tc, rc)), R0 = S.makeResolver(sysSc, ch, F, S.tokenCtx({ id: 'm2', meta: {}, whiteboard: [] }, { id: 't', x: 0, y: 0 }, {}));
        const reads = [R('Scene.InPerson'), R('Scene.HeardOnly'), R('Target.Reaction'), R0('Scene.InPerson'), R0('Target.Reaction'), rc ? rc.re : 'no range'];
        const vErr = S.validateSystem(cleanSystem({ v: 1, name: 'V', fields: [], rolls: [{ id: 'r_a', label: 'A', formula: 'Scene.Nope + Target.Reaction' }] }, { F, gmView: true }), F).errors.map(e => e.message);
        check('1.6.2 scene context: the system\'s channels keep a name and a short name made once from it, each once, the same in both views; a map\'s channel reaches a roll as Scene.<channel>, 1 in it and 0 otherwise or with none; a roll ticked Kept for the scene keeps the tick, and Target.Reaction reads what it came to on the target, 0 with none; the validator says a channel the system lacks, and Target.Reaction only where a roll is so ticked',
            J(sysSc.scenes) === J([{ key: 'InPerson', label: 'In person' }, { key: 'HeardOnly', label: 'Heard only' }, { key: 'Written', label: 'Written' }]) && J(pvSc.scenes) === J(sysSc.scenes) && sysSc.rolls[0].keep === 'scene' && !('keep' in sysSc.rolls[1])
            && J(reads) === J([1, 0, 14, 0, 0, 14]) && vErr.some(m => /no scene channel Nope/.test(m)) && vErr.some(m => /known only where a roll is ticked Kept for the scene/.test(m)), J([sysSc.scenes, reads, vErr]));
        const ntS = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8'), wbS = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8'), ixS = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        check('1.6.2 scene context (source): the host keeps a roll\'s result on its target after both roll paths, a reaction never leaves the host, a player\'s app cleans the map\'s channel, the map\'s menu sets the channel and ends the scene; Help says it',
            (ntS.match(/sceneKeep\(camp[QR], (actQ|entR), (resQ|res), tc[QR]\)/g) || []).length === 2 && (ntS.match(/delete w\.burns; delete w\.reaction;/g) || []).length === 2 && /m\.meta\.scene !== undefined/.test(ntS)
            && /act === 'scch' \|\| act === 'scend'/.test(wbS) && ixS.includes('<b>Kept for the scene</b>'));
    }

    await T.finish();
})();
