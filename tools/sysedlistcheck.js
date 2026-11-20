'use strict';
/* sysedlistcheck.js: the System editor's Rolls, Lists, Combat and Calendar boxes, the tests that came out of systemcheck.js
   with their area (docs/REFACTOR_SPLIT_PLAN.md, area 7, "Tests move with their area", 2026-11-19). The editor's code lives in parts of
   sheets.js, each read here by its own name (kit.part, kit.cut and kit.cutEnd): the Rolls tab's rows and a change's targets
   (sysedroll.js), the Lists tab and a list's card (sysedlist.js), the Combat tab's first boxes and the Rules tab's lists
   (sysedcombat.js), and the Calendar tab and the Rests box (sysedcal.js); slices of other areas read the joined sheets.js and the core
   as systemcheck.js always has.
   What it covers, each block as it stood in systemcheck.js: the system's roll outcomes (F8), the map environment's bands, a list's
   rows and parts (Takes rows where, a counter keyed paid, GM only and Shown where on a roll, Figures as boxes, Levels from the entry,
   a choice set by its player, which rows hold parts, Rolls unheld entries, Keeps the starting level, Row.parts' highest and lowest,
   Host.<w>, Stands at, Fits where, parts of parts, specialties' reference, Changes apply where, a blast's Defense roll, Shown on rows
   where), an effect's change sized by a formula, an entry held again under another name, a roll that sets off a placed blast, a roll
   that draws a card as its die, and the system's rests (fold R1 and the review's wiring).
   Usage: node tools/sysedlistcheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const app = kit.APP, url = kit.url;
const T = kit.suite('system'), check = T.check;
const j = v => JSON.stringify(v);
const flatKids = kit.flatKids;   // every box under a node of a page of plain objects, at any depth (tools/checkkit.js)

(async () => {
    // the core and the formula engine, imported as systemcheck.js imports them (the joined systemcore.js, srcjoin's answer), so each block
    // runs on the module state it ran on there
    const core = await kit.sysCore();   // systemcore.js and formula.js imported, the names systemcheck.js unpacks, the two presets and flatKids
    const { S, F, err } = core;
    check('sysedlistcheck: the core and the formula engine load in Node with no window', !!S && !!F && !err, err && err.message);
    if (!S || !F) { await T.finish(); return; }
    const { LIMITS, validKey, cleanField, cleanSystem, cleanValue, cleanChar, cleanCharEdit, makeResolver, resolveAll, hoverLines, validateSystem, charFor, applyEdit, autoLayout, emptySystem } = core;   // the names systemcheck.js unpacks, which its blocks read
    const { d20, g3d6 } = core;
    check('sysedlistcheck: sysedroll.js, sysedlist.js, sysedcombat.js, sysedcal.js are parts of sheets.js, each read here by its own name', ['sysedroll.js', 'sysedlist.js', 'sysedcombat.js', 'sysedcal.js'].every(p => /^\/\* [a-z]+\.js: a part of sheets\.js/.test(kit.part(p))));

    /* ---- Stage 6 F8: the roll outcomes option ---- */
    {
        const base = { v: 1, name: 'O', rolls: [], fields: [] };
        const on = cleanSystem(Object.assign({}, base, { combat: { checks: 'under3d6' } }), { F, gmView: true }), off = cleanSystem(Object.assign({}, base, { combat: { checks: 'd20ish' } }), { F, gmView: true }), pv = cleanSystem(Object.assign({}, base, { combat: { checks: 'under3d6' } }), { F, gmView: false });
        const shO = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8');
        check('F8 the system\'s roll outcomes: 3d6 roll-under kept (the players\' view too), anything else left out (absent: success or failure by the margin, a system unchanged); the Combat tab sets and clears it',
            on.combat.checks === 'under3d6' && !('checks' in off.combat) && pv.combat.checks === 'under3d6' && /labeledSelect\('sys-combat-checks', 'Roll outcomes'/.test(require('./checkkit').part('sysedcombat.js')) && /if \(t\.value === 'under3d6' \|\| t\.value === 'fixed'\) draft\.combat\.checks = t\.value; else delete draft\.combat\.checks;/.test(require('./checkkit').part('sysedtabs.js')), JSON.stringify([on.combat, off.combat]));
    }
    {   // 1.6.2 Takes rows where (a campaign build: a row in storage could still be loaded or chambered): a test of each source row, read with its own names
        const lw = { id: 'f_lw', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { cats: ['Gear'], multi: true, counters: [{ key: 'ch', label: 'Charge', max: 'Row.loadmax' }], load: { from: 'f_lc', ct: 'ch', takeIf: 'Row.subject = 0' } } };
        const lc = { id: 'f_lc', key: 'Cells', label: 'Cells', kind: 'item-list', vis: 'all', edit: 'owner', list: { cats: ['Cell'], multi: true, subject: ['Carried', 'Stored'], lvl: { label: 'Charge', min: 0, max: 100, def: 0 } } };
        const sysT = S.cleanSystem({ fields: [lw, lc], items: [{ id: 'i_glow', name: 'Glowstick', category: 'Gear' }, { id: 'i_cell', name: 'Cell', category: 'Cell', lvl: 40 }] }, { F, gmView: true });
        const sysTP = S.cleanSystem(sysT, { F, gmView: false }), lfT = S.fieldById(sysT, 'f_lw'), sfT = S.fieldById(sysT, 'f_lc');
        const kT = { id: 'c_k', name: 'Kael', values: { f_lw: [{ id: 'w_glow', defId: 'i_glow', qty: 1 }], f_lc: [{ id: 'w_c1', defId: 'i_cell', qty: 1, lvl: 40, sj: 1 }, { id: 'w_c2', defId: 'i_cell', qty: 1, lvl: 40 }] } };
        const shTk = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8');
        const tNo = S.applyRowOp(sysT, kT, 'f_lw', { op: 'load', rowId: 'w_glow', from: 'w_c1', back: 'w_b1' }, F, {}), tYes = S.applyRowOp(sysT, kT, 'f_lw', { op: 'load', rowId: 'w_glow', from: 'w_c2', back: 'w_b2' }, F, {});
        check('1.6.2 Takes rows where: kept in both views; a source row it does not hold for is refused (a stored cell), one it holds for loads; with none, every row; the editor’s box reads the source list’s rows',
            lfT.list.load.takeIf === 'Row.subject = 0' && S.fieldById(sysTP, 'f_lw').list.load.takeIf === 'Row.subject = 0' && tNo.ok === false && /cannot take that one/.test(tNo.msg || '') && tYes.ok === true
            && S.takeOk(sysT, kT, sfT, kT.values.f_lc[0], '', F) === true && S.takeOk(sysT, kT, sfT, kT.values.f_lc[0], 'Row.subject = 1', F) === true && S.takeOk(sysT, kT, sfT, kT.values.f_lc[0], 'Row.nope = 1', F) === false
            && !(S.validateSystem(sysT, F).errors || []).some(e => /Row\.subject/.test(e.message || ''))
            && require('./checkkit').part('sysedlist.js').includes("tkLi.dataset.rl = ldS.from || '';") && shTk.includes("!window.wpSystemCore.takeOk(sys, c, sf, s, ld.takeIf, F())") && shTk.includes("!window.wpSystemCore.takeOk(sys, c, sf, s, spec.chamber.takeIf, F())"),
            [lfT.list.load, tNo, tYes.ok, S.validateSystem(sysT, F).errors]);
    }
    {   // 1.6.0 (CORE gap 12; the owner, by prompt: "Sheet before effects"): an effect's change sized by a formula (vf), on invented data
        const J = JSON.stringify;
        const rawV = { v: 1, name: 'V', rolls: [], fields: [
            { id: 'f_agi', key: 'Agility', kind: 'number', def: 10, vis: 'all' },
            { id: 'f_mp', key: 'MP', kind: 'resource', maxFormula: '10', def: 'max', vis: 'all' },
            { id: 'f_sec', key: 'Secret', kind: 'number', def: 4, vis: 'gm' },
            { id: 'f_fx', key: 'Effects', kind: 'effects', vis: 'all', edit: 'owner' }],
            effects: [
                { id: 'e_over', name: 'Overdrawn', auto: 'MP < 0', mods: [{ f: 'f_agi', op: 'add', vf: '-max(0, -MP)' }] },
                { id: 'e_haste', name: 'Haste', mods: [{ f: 'f_agi', op: 'add', v: 2 }] },
                { id: 'e_echo', name: 'Echo', mods: [{ f: 'f_agi', op: 'add', vf: 'Agility', v: 99 }] },
                { id: 'e_cap', name: 'Cap', mods: [{ f: 'f_agi', op: 'min', vf: 'MP' }] },
                { id: 'e_hid', name: 'Hidden', vis: 'gm', mods: [{ f: 'f_agi', op: 'add', vf: 'MP - 1' }] },
                { id: 'e_bad', name: 'Bad', mods: [{ f: 'f_agi', op: 'add', vf: '1d6' }, { f: 'f_agi', op: 'add', vf: 'Secret' }, { f: 'f_agi', op: 'add', vf: '(' }, { f: 'f_agi', op: 'add', v: 1 }] }],
            items: [{ id: 'i_x', name: 'Charm', mods: [{ f: 'f_agi', op: 'add', vf: 'MP' }, { f: 'f_agi', op: 'add', v: 1 }] }],
            sheet: { sections: [] } };
        const gV = cleanSystem(rawV, { F, gmView: true }), pV = cleanSystem(rawV, { F, gmView: false }), modsOf = (sy, id) => (sy.effects.find(e => e.id === id) || {}).mods;
        const chV = (mp, rows) => ({ id: 'c_v', name: 'V', ownerId: 'u_v', values: { f_mp: { cur: mp }, f_fx: rows.map((r, i) => ({ id: 'x_' + i, ref: r })) } });
        const ag = (sy, ch) => S.makeResolver(sy, ch, F)('Agility');
        const over = S.makeResolver(gV, chV(-3, []), F), overA = over('Agility'), od = over.detail('agility');
        check('CORE gap 12: an effect\'s change may be sized by a formula (vf, its v then 0): Overdrawn, on by itself while MP < 0, takes 1 off Agility for each MP below 0 (MP -3: 7; MP 4: 10, and off); the breakdown says Overdrawn -3; the formula reads the sheet with no effect applied (Echo adds Agility as it stands before effects, 10, never Haste\'s +2: 22); a formula may set a ceiling (Cap at most MP 5: 5 with Haste on); the same in the players\' view',
            J(modsOf(gV, 'e_over')) === J([{ f: 'f_agi', op: 'add', v: 0, vf: '-max(0, -MP)' }]) && J(modsOf(gV, 'e_echo')) === J([{ f: 'f_agi', op: 'add', v: 0, vf: 'Agility' }])
            && overA === 7 && !!od && od.mods.length === 1 && od.mods[0].name === 'Overdrawn' && od.mods[0].v === -3 && ag(gV, chV(4, [])) === 10
            && ag(gV, chV(5, ['e_haste', 'e_echo'])) === 22 && ag(gV, chV(5, ['e_haste', 'e_cap'])) === 5 && ag(pV, chV(-3, [])) === 7 && ag(pV, chV(5, ['e_haste', 'e_echo'])) === 22,
            J([over('Agility'), od, ag(gV, chV(5, ['e_haste', 'e_echo'])), ag(gV, chV(5, ['e_haste', 'e_cap'])), ag(pV, chV(-3, []))]));
        const own = S.charFor(Object.assign(chV(3, []), { values: { f_mp: { cur: 3 }, f_fx: [{ id: 'x_h', ref: 'e_hid' }] } }), pV, 'u_v', { lib: Object.fromEntries(gV.effects.map(e => [e.id, e])) });
        const adP = S.applyEffectOp(gV, chV(3, []), 'f_fx', { op: 'adhoc', row: { id: 'x_9', name: 'Mine', mods: [{ f: 'f_agi', op: 'add', vf: 'MP' }] } }, F, { player: true, view: pV });
        const adG = S.applyEffectOp(gV, chV(3, []), 'f_fx', { op: 'adhoc', row: { id: 'x_9', name: 'Mine', mods: [{ f: 'f_agi', op: 'add', vf: 'MP' }] } }, F, {});
        check('CORE gap 12: what Save drops of a change by a formula, in both views alike: one that rolls dice, reads a GM-only value or does not parse (the plain change beside them stays); an item\'s change may be by a formula since 1.6.2 (205, moved on purpose); a GM-only effect\'s change reaches its player inline with its formula, and reads there as on the GM\'s sheet (MP 3 - 1: Agility 12); a player\'s own ad hoc effect changes by plain numbers (refused), the GM\'s may be by a formula',
            J(modsOf(gV, 'e_bad')) === J([{ f: 'f_agi', op: 'add', v: 1 }]) && J(modsOf(pV, 'e_bad')) === J([{ f: 'f_agi', op: 'add', v: 1 }]) && J(gV.items[0].mods) === J([{ f: 'f_agi', op: 'add', v: 0, vf: 'MP' }, { f: 'f_agi', op: 'add', v: 1 }])
            && J(own.values.f_fx[0].mods) === J([{ f: 'f_agi', op: 'add', v: 0, vf: 'MP - 1' }]) && ag(pV, own) === 12 && ag(gV, Object.assign(chV(3, []), { values: { f_mp: { cur: 3 }, f_fx: [{ id: 'x_h', ref: 'e_hid' }] } })) === 12
            && !adP.ok && adP.reason === 'value' && adG.ok && J(adG.value[0].mods) === J([{ f: 'f_agi', op: 'add', v: 0, vf: 'MP' }]),
            J([modsOf(gV, 'e_bad'), gV.items[0].mods, own.values.f_fx, ag(pV, own), adP, adG.value]));
        const shV = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), ixV = fs.readFileSync(path.join(app, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
        const ntV = [path.join(app, 'assets', 'whatsnew.txt'), path.join(app, '..', '..', 'WHATSNEW.txt')].map(f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
        check('CORE gap 12 is in the editor and said (source): an effect\'s change has a by-a-formula box after its number, whose handler writes vf (emptied, the number again); the validator says what Save drops; the sheet says the formula in words (1.6.3); Help and both 1.6.0 notes say it',
            require('./checkkit').part('sysedroll.js').includes("var amF = input('sys-fx-amtf field'") && require('./checkkit').part('sysedtabs.js').includes("if (vfV.trim()) { mmF.vf = vfV; mmF.v = 0; } else delete mmF.vf;") && require('./checkkit').part('sysederr.js').includes("hd + 'the formula cannot roll dice: Save drops the change.'")
            && shV.includes("if (typeof m.vf === 'string' && m.vf) return nm + (m.part === 'max' ? ' max' : '') + (m.op === 'max' ? ' at least ' : m.op === 'min' ? ' at most ' : ' by ') + (typeof amountSays === 'function' ? amountSays(null, m.vf) : 'an amount');")   /* 1.6.3 (finding 10), moved on purpose: the sheet says the formula in words */
            && ixV.includes('A change&rsquo;s amount may be <b>by a formula</b>') && ntV.every(t => t.indexOf("- An effect's change can be sized by a formula") > 0 && t.indexOf("- An effect's change can be sized by a formula") < t.indexOf('WAYPOINT 1.5.')));
    }
    {   // the core handbook session's asks (a) and (b) (2026-10-29): a counter keyed paid, and a list action's needs, on invented data
        const J = JSON.stringify;
        const rawN = { v: 1, name: 'N', rolls: [], fields: [{ id: 'f_mp', key: 'MP', kind: 'resource', maxFormula: '10', def: 'max', vis: 'all', edit: 'owner' }, { id: 'f_sg', key: 'Sight', kind: 'number', def: 0, vis: 'gm' },
            { id: 'f_wd', key: 'Wands', kind: 'item-list', vis: 'all', edit: 'owner', list: { counters: [{ key: 'Charges', def: 2 }, { key: 'paid' }, { key: 'Paid' }], stats: [{ key: 'Pow' }],
                rolls: [{ label: 'Zap', apply: [{ f: 'f_mp', formula: '1' }], needs: 'Row.Charges >= 1', needsText: 'Out of charges' }, { label: 'Peek', apply: [{ f: 'f_mp', formula: '1' }], needs: 'Sight > 2' }] } }],
            items: [{ id: 'i_w', name: 'Wand', stats: { Pow: 1 } }], sheet: { sections: [] } };
        const gN = cleanSystem(rawN, { F, gmView: true }), pN = cleanSystem(rawN, { F, gmView: false }), lrN = sy => sy.fields.find(f => f.id === 'f_wd').list;
        const cleanN = J(lrN(gN).counters.map(t => t.key)) === J(['Charges']) && lrN(gN).rolls[0].needs === 'Row.Charges >= 1' && lrN(gN).rolls[0].needsText === 'Out of charges' && lrN(gN).rolls[1].needs === 'Sight > 2'
            && !('needs' in lrN(pN).rolls[1]) && lrN(pN).rolls[0].needs === 'Row.Charges >= 1' && J(cleanSystem(gN, { F, gmView: true })) === J(gN);
        const chN = ct => ({ id: 'c_n', values: { f_mp: { cur: 10 }, f_wd: [{ id: 'w_1', defId: 'i_w', qty: 1, ct: { Charges: ct } }] } });
        const actN = (ch, ri) => S.applyAct(gN, ch, lrN(gN).rolls[ri], S.makeResolver(gN, ch, F).row('f_wd', 'w_1'), F, null, { f: 'f_wd', r: 'w_1' });
        const okN = actN(chN(1), 0), noN = actN(chN(0), 0), allN = S.resolveAll(gN, chN(0), F).f_wd;
        const vN = S.validateSystem(gN, F), vBadN = S.validateSystem(cleanSystem(Object.assign(JSON.parse(J(rawN)), { fields: [rawN.fields[0], rawN.fields[1], Object.assign(JSON.parse(J(rawN.fields[2])), { list: Object.assign({}, rawN.fields[2].list, { rolls: [{ label: 'Zap', apply: [{ f: 'f_mp', formula: '1' }], needs: 'Row.Nope >= 1' }] }) })] }), { F, gmView: true }), F);
        const judgeN = okN.ok && !noN.ok && noN.message === 'Out of charges' && allN.rn && J(allN.rn.w_1) === J([false, false]) && !vN.errors.length && vBadN.errors.some(e => /Unknown name "Row\.Nope"/.test(e.message));
        const shN = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), ctT = require('./checkkit').part('sysedlist.js'), cs0 = ctT.indexOf('function ctKeySays('), cs1 = ctT.indexOf('\n}\n', cs0) + 3;
        const CKS = new Function('statKey', ctT.slice(cs0, cs1) + '\nreturn ctKeySays;')(S.statKey);
        const saysN = CKS({ stats: [{ key: 'Pow' }], cols: [{ key: 'Reach' }], counters: [{ key: 'Charges' }, { key: 'paid' }, { key: 'pow' }, { key: 'charges' }, { key: '' }] }, F);
        check('the core handbook session\'s asks (a) and (b) (2026-10-29): a list counter keyed paid (any case) is no counter, as a stat keyed so is not, and the Lists tab says why under the list (ctKeySays: a word formulas use, a stat\'s or column\'s key, another counter\'s, no key); a list\'s apply action keeps its needs and their words as a list roll does (the players\' view dropping needs read from a GM-only value), applyAct refuses it on a row that does not meet them in their words, the sheet\'s row reads them (e.rn), and the validator reads them with the row\'s names',
            cleanN && judgeN && saysN.length === 4 && /^Counter key "paid" is not usable: .*paid.*Save drops it\.$/.test(saysN[0]) && saysN[1] === 'Counter key "pow" is already a stat\u2019s or a column\u2019s key of this list: Save drops it.' && saysN[2] === 'Counter key "charges" is already another counter\u2019s key: Save drops it.' && saysN[3] === 'Counter 5 needs a name: Save drops it.'
            && require('./checkkit').part('sysederr.js').includes("if (typeof ctKeySays === 'function') ctKeySays(sp, F()).forEach(") && shN.includes("var nOkA = !(r.needs || r.needsWhy) || !(res && res.rn && res.rn[rid]) || res.rn[rid][ri] !== false;") && require('./checkkit').part('sysedlist.js').includes("var ndA = el('div', 'sys-flags sys-list-needsrow');"),
            J([lrN(gN), lrN(pN), okN, noN, allN.rn, vN.errors, vBadN.errors, saysN]));
    }
    {   // 1.6.0: a list's roll or action only the GM presses (gm)
        const J = JSON.stringify;
        const rawG = { v: 1, name: 'G', rolls: [], fields: [{ id: 'f_wear', key: 'Wear', kind: 'number', def: 0, edit: 'owner' }, { id: 'f_kit', key: 'Kit', kind: 'item-list', edit: 'owner', list: { counters: [{ key: 'Jam' }], rolls: [
            { label: 'Repaired', apply: [{ c: 'Jam', formula: '0', set: true }, { f: 'f_wear', formula: '0', set: true }], gm: true },
            { label: 'Check', formula: '3d6 <= 10', gm: true }, { label: 'Use', apply: [{ f: 'f_wear', formula: '1', add: true }] }, { label: 'Swing', formula: 'd6', gm: 'yes' }] } }], sheet: { sections: [] } };
        const gG = cleanSystem(rawG, { F, gmView: true }), pG = cleanSystem(rawG, { F, gmView: false }), lbl = sy => sy.fields[1].list.rolls.map(r => r.label + (r.gm ? '*' : ''));
        const shG = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        check('1.6.0 a list\'s roll or action ticked GM only (gm, true only) stays in the GM\'s view and is left out of the players\' (their sheet draws no button, and the host judges their press by that view, so an index of theirs never reaches it); a fixed point both ways; the Lists card\'s tick and its handler',
            J(lbl(gG)) === J(['Repaired*', 'Check*', 'Use', 'Swing']) && J(lbl(pG)) === J(['Use', 'Swing']) && J(cleanSystem(pG, { F, gmView: false })) === J(pG) && J(cleanSystem(gG, { F, gmView: true })) === J(gG)
            && require('./checkkit').part('sysedlist.js').includes("rw.appendChild(checkLabel('sys-list-gmonly', rr.gm === true, 'GM only',") && require('./checkkit').part('sysedtabs.js').includes("if (t.checked) rgD.gm = true; else delete rgD.gm; }"), J([lbl(gG), lbl(pG)]));
    }
    {   // 1.6.0, the campaign build: a list's roll or action shown only on rows where it applies (showIf, Shown where)
        const J = JSON.stringify;
        const rawV = { v: 1, name: 'V', items: [{ id: 'i_a', name: 'Lamp', stats: { Kind: 1 } }, { id: 'i_b', name: 'Kit', stats: { Kind: 2 } }],
            fields: [{ id: 'f_hp', key: 'HP', label: 'HP', kind: 'number' }, { id: 'f_sec', key: 'Sec', label: 'Sec', kind: 'number', vis: 'gm' },
                { id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', list: { stats: [{ key: 'Kind' }], rolls: [
                    { label: 'Light', formula: '1d6', showIf: 'Row.Kind = 1' }, { label: 'Fix', apply: [{ f: 'f_hp', formula: '1', add: true }], showIf: 'Row.Kind = 2' },
                    { label: 'Plain', formula: '1d6', showIf: '  ' }, { label: 'Hush', formula: '1d6', showIf: 'Sec > 0' }] } }], sheet: { sections: [] } };
        const gV = S.cleanSystem(rawV, { F, gmView: true }), pV = S.cleanSystem(rawV, { F, gmView: false }), gOf = v => v.fields.filter(x => x.id === 'f_g')[0], rsG = gOf(gV).list.rolls, rsP = gOf(pV).list.rolls;
        const clOk = rsG[0].showIf === 'Row.Kind = 1' && rsG[1].showIf === 'Row.Kind = 2' && Array.isArray(rsG[1].apply) && !('showIf' in rsG[2]) && rsG[3].showIf === 'Sec > 0'
            && rsP[0].showIf === 'Row.Kind = 1' && rsP[1].showIf === 'Row.Kind = 2' && !('showIf' in rsP[3]) && J(S.cleanSystem(gV, { F, gmView: true })) === J(gV);
        const chV = { id: 'c_v', name: 'Kael', values: { f_hp: 3, f_sec: 0, f_g: [{ id: 'w_a', defId: 'i_a', qty: 1 }, { id: 'w_b', defId: 'i_b', qty: 1 }] } };
        const rs = S.resolveAll(gV, chV, F).f_g.rs;
        const rsOk = J(rs) === J({ w_a: [true, false, true, false], w_b: [false, true, true, false] }) && !('rs' in S.resolveAll(S.cleanSystem({ v: 1, name: 'N', fields: [{ id: 'f_g', key: 'G', label: 'G', kind: 'item-list', list: { rolls: [{ label: 'R', formula: '1d6' }] } }], sheet: { sections: [] } }, { F, gmView: true }), { id: 'c', values: { f_g: [{ id: 'w_x', custom: { name: 'X' } }] } }, F).f_g);
        const rv = S.makeResolver(gV, chV, F, null), fixA = S.applyAct(gV, chV, rsG[1], rv.row('f_g', 'w_a'), F, null, { f: 'f_g', r: 'w_a' }), fixB = S.applyAct(gV, chV, rsG[1], rv.row('f_g', 'w_b'), F, null, { f: 'f_g', r: 'w_b' });
        const actOk = fixA.ok === false && fixA.message === 'That is not offered on this row.' && fixB.ok === true && fixB.values.f_hp === 4;
        const bad = J(S.validateSystem(S.cleanSystem(Object.assign({}, rawV, { fields: [rawV.fields[0], rawV.fields[1], Object.assign({}, rawV.fields[2], { list: { stats: [{ key: 'Kind' }], rolls: [{ label: 'Light', formula: '1d6', showIf: 'Row.Nope = 1' }] } })] }), { F, gmView: true }), F));
        const vOk = /list\.show\.0\.Light/.test(bad) && !/list\.show[^}]*Unknown name/.test(J(S.validateSystem(gV, F)));
        const shR = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), ntR = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
        const srcOk = shR.includes("if (res && res.rs && res.rs[rid] && res.rs[rid][ri] === false) return;   // 1.6.0") && shR.includes('!!r.dmg || !!r.showIf;') && require('./checkkit').part('sysedlist.js').includes("input('sys-list-rollshow field',")
            && require('./checkkit').part('sysedtabs.js').includes("if (lcc.indexOf('sys-list-rollshow') >= 0) { var rsv = t.value.slice(0, LIMITS.formula).trim(); if (rsv) rD.showIf = rsv; else delete rD.showIf; }")
            && ntR.includes("if (q.row && typeof actQ.showIf === 'string' && actQ.showIf && !SQ.rollNeedsOk({ needs: actQ.showIf }, varsQ, Fq)) { denyQ('error'") && ntR.includes("if (o.row && entR && typeof entR.showIf === 'string' && entR.showIf && varsR && !SR.rollNeedsOk({ needs: entR.showIf }, varsR, F)) return { error: 'That roll is not offered on this row.' };")
            && ntR.indexOf('actQ.showIf') < ntR.indexOf("if ((actQ.needs || actQ.needsWhy) && !SQ.rollNeedsOk(actQ, varsQ, Fq))");
        check('1.6.0 a list\'s roll or action Shown where (showIf: the campaign build, a roll only on the rows it applies to): kept on a roll and an action as a formula, an empty one none, alike in both views but dropped from the players\' view where it reads a GM-only value; resolveAll says each row\'s answer per roll (rs), a formula that fails reading as shown, and adds nothing to a list with none; applyAct refuses a list\'s action on a row where it does not hold and runs it where it does; the validator reads it with the row\'s names; the sheet draws no button where it does not hold and names the roll\'s index so the host judges it; the host\'s roll-req branch and the GM\'s own roll refuse it there, before its needs; the Lists card\'s box and its handler',
            clOk && rsOk && actOk && vOk && srcOk, J([clOk, rs, rsOk, fixA, fixB && fixB.values, vOk, srcOk]));
    }
    {   // 1.6.0, the campaign build: an entry a list holds once, held again under another name (again: 'name'; a rank held once per organization)
        const J = JSON.stringify;
        const rawA = { v: 1, name: 'A', items: [{ id: 'i_r', name: 'Rank', again: 'name' }, { id: 'i_s', name: 'Badge' }, { id: 'i_x', name: 'Odd', again: 'yes' }],
            fields: [{ id: 'f_r', key: 'Ranks', label: 'Ranks', kind: 'item-list', edit: 'owner', list: { noQty: true } }], sheet: { sections: [] } };
        const gA = S.cleanSystem(rawA, { F, gmView: true }), pA = S.cleanSystem(rawA, { F, gmView: false }), iOf = (s, id) => s.items.filter(x => x.id === id)[0] || {};
        const clOk = iOf(gA, 'i_r').again === 'name' && iOf(pA, 'i_r').again === 'name' && !('again' in iOf(gA, 'i_s')) && !('again' in iOf(gA, 'i_x')) && J(S.cleanSystem(gA, { F, gmView: true })) === J(gA);
        const wireOk = J(S.cleanCharItem({ charId: 'c_a', f: 'f_r', op: 'add', defId: 'i_r', rowId: 'w_2', qty: 1, name: '  Guild  ' })) === J(S.cleanCharItem({ charId: 'c_a', f: 'f_r', op: 'add', defId: 'i_r', rowId: 'w_2', qty: 1, name: 'Guild' }))
            && S.cleanCharItem({ charId: 'c_a', f: 'f_r', op: 'add', defId: 'i_r', rowId: 'w_2', qty: 1, name: 5 }) === null && S.cleanCharItem({ charId: 'c_a', f: 'f_r', op: 'add', defId: 'i_r', rowId: 'w_2', qty: 1, name: '   ' }) === null
            && !('name' in (S.cleanCharItem({ charId: 'c_a', f: 'f_r', op: 'add', defId: 'i_r', rowId: 'w_2', qty: 1 }) || {}));
        const ch = () => ({ id: 'c_a', ownerId: 'u_a', values: { f_r: [{ id: 'w_1', defId: 'i_r', qty: 1 }, { id: 'w_b', defId: 'i_s', qty: 1 }] } });
        const add = (c, q, o) => S.applyRowOp(gA, c, 'f_r', Object.assign({ op: 'add', rowId: 'w_n' + Math.random().toString(36).slice(2, 8), qty: 1 }, q), F, o || {});
        const c1 = ch(), plain = add(c1, { defId: 'i_r' }), named = add(c1, { defId: 'i_r', name: 'Guild' });
        c1.values.f_r = named.value; const dupG = add(c1, { defId: 'i_r', name: 'guild' }), dupE = add(c1, { defId: 'i_r', name: 'Rank' }), nmB = add(c1, { defId: 'i_s', name: 'Other' }), pl = add(c1, { defId: 'i_r', name: 'Navy' }, { player: true, view: pA });
        const names = (pl.value || []).map(r => S.rowDef(gA, r).def.name);
        const opOk = plain.ok === false && named.ok === true && J(named.value[2].ov) === J({ name: 'Guild' }) && named.value[2].defId === 'i_r'
            && dupG.ok === false && dupG.reason === 'value' && dupG.msg === 'Another Rank already has that name.' && dupE.ok === false && nmB.ok === false && nmB.reason === 'value'
            && pl.ok === true && J(names) === J(['Rank', 'Badge', 'Guild', 'Navy']);
        const shA = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), lwA = fs.readFileSync(path.join(app, 'scripts', 'librarywin.js'), 'utf8').replace(/\r\n/g, '\n'), lcA = fs.readFileSync(path.join(app, 'scripts', 'librarycore.js'), 'utf8').replace(/\r\n/g, '\n');
        const srcOk = shA.includes('function againAsk(spec, carried, id, ent, go) {') && shA.includes("if (have[it.id] === 1 && it.again !== 'name') {") && shA.includes("if (typeof againAsk === 'function') againAsk(specI, carried, avA, againEnt(sysI, avA), goA); else goA(null);")
            && require('./checkkit').part('sysedroll.js').includes("select('sys-item-again', [['', 'Held once'], ['name', 'Held again under another name']]") && require('./checkkit').part('sysedtabs.js').includes("if (c.indexOf('sys-item-again') >= 0) { if (t.value === 'name') iit.again = 'name'; else delete iit.again;")
            && lwA.includes("field(form, 'again', 'Held again',") && lwA.includes("again: g('again'), rm: g('rm'), ") && lcA.includes("if (f.again === 'name') out.again = 'name';");
        let asked = 0, got = []; const ask = new Function('showPrompt', shA.slice(shA.indexOf('function againAsk('), shA.indexOf('function pickerInto(')) + '\nreturn againAsk;')((t, d, cb) => { asked++; cb(asked === 1 ? '  Guild ' : '  '); });
        const rows = [{ id: 'w_1', defId: 'i_r' }], ent = { id: 'i_r', name: 'Rank', again: 'name' };
        ask({ noQty: true }, rows, 'i_r', ent, nm => got.push(nm)); ask({ noQty: true }, rows, 'i_r', ent, nm => got.push(nm)); ask({ noQty: true }, rows, 'i_r', { id: 'i_r', name: 'Rank' }, nm => got.push(nm));
        ask({ noQty: true }, [], 'i_r', ent, nm => got.push(nm)); ask({ noQty: true, multi: true }, rows, 'i_r', ent, nm => got.push(nm)); ask({ noQty: true }, [{ id: 'w_1', src: 'i_r', def: {} }], 'i_r', ent, nm => got.push(nm));
        const askOk = J(got) === J(['Guild', null, null, null]) && asked === 3;
        check('1.6.0 an entry held again under another name (again: the campaign build, a rank held once per organization): the cleaner keeps it only as the word name, alike in both views; the wire takes a copy\'s name on an add, trimmed, and nothing that is no name; applyRowOp adds such an entry again on a list that holds each once only with a name, as a row of its own whose own name it is, and refuses one with no name, a name another copy of it carries (ignoring case, the first copy by the entry\'s own), and a name on an entry not ticked so, for the GM and a player alike; the sheet\'s againAsk asks for the name only where the entry is ticked and the list already holds it (a player\'s copy by its src), an empty answer adding nothing; the pickers keep it offered; the Items tab and the Library window set it',
            clOk && wireOk && opOk && srcOk && askOk, J([clOk, wireOk, opOk, plain.ok, named.ok, dupG, nmB.reason, pl.ok, names, srcOk, got, asked]));
    }
    {   // 1.6.0: the map environment, fold 4: the bands judged in one place (systemcore envBands), the figure's words and color, the token's badge, and the System editor's readings box
        const J = JSON.stringify;
        const sysB = S.cleanSystem({ v: 1, name: 'B', sheet: { sections: [] }, rolls: [], fields: [{ id: 'f_t', key: 'Temp', label: 'Temperature', kind: 'number', min: -100, max: 100 }, { id: 'f_tol', key: 'Tol', label: 'Tolerance', kind: 'number' }, { id: 'f_g', key: 'Grav', label: 'Gravity', kind: 'number' }, { id: 'f_s', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm' }],
            env: [{ key: 'temp', label: 'Temperature', field: 'f_t', unit: 'temp', warnLow: '10 - Tol * 5', dangerLow: '-18 - Tol * 5', warnHigh: '32', dangerHigh: '43' }, { key: 'grav', field: 'f_g', unit: 'g', warnHigh: '1.5', dangerHigh: 'Secret' }] }, { F, gmView: true });
        const at = (t, tol, g) => S.envBands(sysB, { id: 'a', values: Object.assign({ f_tol: tol || 0, f_s: 3 }, t === undefined ? {} : { f_t: t }, g === undefined ? {} : { f_g: g }) }, F);
        const bd = r => r.map(x => x.key + ':' + x.band + (x.side ? '/' + x.side : '')).join(',');
        const cases = [bd(at(20, 0, 1)), bd(at(10, 0)), bd(at(9.9, 0)), bd(at(-18, 0)), bd(at(-18.5, 0)), bd(at(5, 2)), bd(at(33)), bd(at(44)), bd(at(undefined, 0, 2)), bd(at(undefined, 0, 4)), bd(at(undefined))];
        const worst = [S.envWorst(at(5, 0, 2)), S.envWorst(at(5, 0, 4)), S.envWorst(at(20, 0, 1)), S.envWorst(null)].map(r => r ? r.key + ':' + r.band : null);
        const plV = S.cleanSystem(sysB, { F, gmView: false }), plB = (plV.env || []).map(r => r.key + ':' + ['warnLow', 'dangerLow', 'warnHigh', 'dangerHigh'].filter(k => r[k]).join('|'));
        const shB = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), sl = (m) => shB.slice(shB.indexOf('// [systemcheck:' + m + '-start]'), shB.indexOf('// [systemcheck:' + m + '-end]'));
        const W = { metric: false };
        const B = new Function('envBands', 'envWorst', 'F', 'unitsMetric', 'getActiveCampaign', 'systemOf', 'charById', 'myId', 'window', sl('envband') + '\nreturn { envWords: envWords, envMark: envMark, tokenEnv: tokenEnv };');
        const camp = { system: sysB, chars: { a: { id: 'a', ownerId: 'u_a', values: { f_t: -30, f_tol: 0 } }, n: { id: 'n', npc: true, values: { f_t: -30 } }, b: { id: 'b', ownerId: 'u_b', values: { f_t: 20 } }, p: { id: 'p', ownerId: 'u_a', partial: true, values: { f_t: -30 } } } };
        const win = { wpNet: null, wpVtt: { on: () => true } };
        const T = B(S.envBands, S.envWorst, () => F, () => W.metric, () => camp, c => c.system, (id, c) => c.chars[id] || null, () => win.me, win);
        const words = [T.envWords({ label: 'Temperature', unit: 'temp', v: -30, band: 'danger', side: 'low' })]; W.metric = true;
        words.push(T.envWords({ label: 'Temperature', unit: 'temp', v: 33, band: 'warn', side: 'high' }), T.envWords({ label: 'Gravity', unit: 'g', v: 2, band: 'warn', side: 'high' })); W.metric = false;
        const tk = id => { const r = T.tokenEnv({ isChar: true, charId: id }); return r ? r.band : null; };
        const gmT = [tk('a'), tk('n'), tk('b'), T.tokenEnv({ isChar: true, charId: 'a', waiting: true })];
        win.wpNet = { active: true, role: 'client' }; win.me = 'u_a'; const plT = [tk('a'), tk('p'), tk('b')]; win.wpNet = { stream: true }; const stT = tk('a'); win.wpNet = null;
        const box = { cls: [], title: '', classList: { add: c => box.cls.push(c) } }; T.envMark(box, { id: 'f_t' }, camp.chars.a, sysB); const box2 = { cls: [], title: '', classList: { add: c => box2.cls.push(c) } }; T.envMark(box2, { id: 'f_t' }, camp.chars.b, sysB); T.envMark(box2, { id: 'f_tol' }, camp.chars.a, sysB);
        const X = new Function('LIMITS', 'hasDice', require('./checkkit').cut('sysedcombat.js', '// [systemcheck:envbox-start]', '// [systemcheck:envbox-end]') + '\nreturn { envSays: envSays };')(S.LIMITS, S.hasDice);
        const flds = sysB.fields.concat([{ id: 'f_on', kind: 'toggle', key: 'On', label: 'On' }]);
        const says = X.envSays([{ key: 'temp', field: 'f_t', placed: 'f_on', warnLow: '1d6', dangerLow: 'Tol +', warnHigh: 'Secret' }, { key: 'Temp', field: 'f_g' }, { key: '9x', field: 'f_g' }, { key: 'grav', field: 'f_on' }, { key: 'grav', field: 'f_t' }, { key: 'air', field: 'f_g', placed: 'f_t' }], flds, F, ns => ns.filter(n => n === 'Secret'));
        const sayW = says.errs.map(e => e.message).concat(says.warns.map(e => 'W ' + e.message));
        check('1.6.0 the map environment, fold 4 (systemcore envBands, the one judge; sheets.js\'s envband and envbox slices run for real; the owner, by prompt: "As drawn"): a reading is judged only where its field holds a number, its bands worked out with the sheet\'s resolver from the character\'s own names (Tolerance widens them), red below Danger below or above Danger above and else amber below Warn below or above Warn above, a band that is no number counting for nothing; the badge speaks for the worst reading; a band that reads a GM-only value is left out of the players\' view; the figure\'s words are the viewer\'s °F or °C for a temperature; the sheet marks the reading\'s own field alone; the badge shows on the GM\'s screen for a character a player plays, on a player\'s app for their own whole copy, never for an NPC, a teammate, a waiting token or in the stream window; and the System editor\'s box says what Save does with each reading as cleanEnv reads it',
            J(cases) === J(['temp:,grav:', 'temp:', 'temp:warn/low', 'temp:warn/low', 'temp:danger/low', 'temp:', 'temp:warn/high', 'temp:danger/high', 'grav:warn/high', 'grav:danger/high', '']) && J(worst) === J(['temp:warn', 'grav:danger', null, null])
            && J(plB) === J(['temp:warnLow|dangerLow|warnHigh|dangerHigh', 'grav:warnHigh'])
            && J(words) === J(['Temperature -22 °F: dangerously cold', 'Temperature 33 °C: getting hot', 'Gravity 2 g: getting high'])
            && J(gmT) === J(['danger', null, null, null]) && J(plT) === J(['danger', null, null]) && stT === null
            && J(box.cls) === J(['sheet-env-danger']) && box.title === 'Temperature -22 °F: dangerously cold' && J(box2.cls) === J([])
            && sayW.length === 8 && /Warn below: a band rolls no dice\. Save drops that band\./.test(sayW[0]) && /Reading 1, Danger below: .*Save drops that band\./.test(sayW[1]) && /another reading has the key Temp/.test(sayW[2]) && /Reading 3: its key is a letter/.test(sayW[3]) && /Reading 4: it needs a number field/.test(sayW[4]) && /Reading 5: another reading is written into Temperature. Save drops it./.test(sayW[5]) && /Reading 6: the field kept on while it applies must be a toggle/.test(sayW[6]) && says.warns.length === 1 && /reads Secret, which players cannot read/.test(says.warns[0].message),
            J([words, gmT, plT, stT, box.cls, box2.cls, sayW]));
    }
    {   // 1.6.0, backlog 180 R3 (the owner, by prompt: "A. A list ticks it", "A. Stats, columns and Paid", "A. In the box and on the chip"): a row's figures as boxes, and a column an effect changed marked
        const J = JSON.stringify;
        const rawX = { v: 1, name: 'X', rolls: [], sheet: { sections: [] },
            items: [{ id: 'i_sk', key: 'skiff', name: 'Skiff', stats: { spd: 12, cost: 900 }, mods: [{ f: 'f_g', op: 'add', v: 2, key: 'skiff', col: 'Speed' }, { f: 'f_g', op: 'add', v: -1, key: 'skiff', col: 'Top' }] }, { id: 'i_bt', key: 'boat', name: 'Boat', stats: { spd: 8, cost: 50 } }],
            fields: [{ id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', list: { boxes: true, price: 'cost', stats: [{ key: 'spd', label: 'Spd' }, { key: 'cost', label: 'Cost' }, { key: 'step', label: 'Step', hide: true }],
                cols: [{ key: 'Speed', label: 'Speed', formula: 'Row.spd', place: 'details' }, { key: 'Top', label: 'Top', formula: 'Row.spd + 1' }] } },
                { id: 'f_o', key: 'Other', label: 'Other', kind: 'item-list', list: { boxes: 'yes', stats: [{ key: 'spd', label: 'Spd' }] } }] };
        const gX = S.cleanSystem(rawX, { F, gmView: true }), pX = S.cleanSystem(rawX, { F, gmView: false }), lX = (sy, id) => sy.fields.find(x => x.id === id).list;
        const cleanOk = lX(gX, 'f_g').boxes === true && lX(pX, 'f_g').boxes === true && !('boxes' in lX(gX, 'f_o')) && J(S.cleanSystem(gX, { F, gmView: true })) === J(gX) && J(S.cleanSystem(pX, { F, gmView: false })) === J(pX);
        const chX = { id: 'c_x', name: 'Kael', ownerId: 'u_x', values: { f_g: [{ id: 'w_a', defId: 'i_sk', qty: 1, paid: 900 }, { id: 'w_b', defId: 'i_bt', qty: 1, paid: 50 }] } };
        const resX = S.resolveAll(gX, chX, F, null).f_g;
        const resOk = J(resX.cfx) === J({ w_a: [{ base: 12, mods: [{ name: 'Skiff', op: 'add', v: 2, gm: false }], via: [] }, { base: 13, mods: [{ name: 'Skiff', op: 'add', v: -1, gm: false }], via: [] }] })
            && J(resX.cells.w_a.map(c => c.value)) === J([14, 12]) && S.resolveAll(S.cleanSystem({ v: 1, name: 'N', items: [{ id: 'i_n', name: 'N', stats: { spd: 1 } }], fields: [{ id: 'f_n', key: 'N', label: 'N', kind: 'item-list', list: { stats: [{ key: 'spd', label: 'Spd' }], cols: [{ key: 'A', label: 'A', formula: 'Row.spd' }] } }] }, { F, gmView: true }), { id: 'c', name: 'c', values: { f_n: [{ id: 'w_n', defId: 'i_n', qty: 1 }] } }, F, null).f_n.cfx === undefined;
        // the sheet: the real item widgets and fxMark, on a page of plain objects
        const shX = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const cutX = (a, b) => { const i = shX.indexOf(a), k = shX.indexOf(b, i + 1); if (i < 0 || k < 0) throw new Error('r3 slice: ' + a); return shX.slice(i, k); };
        const itX = cutX('// ---- item-list widgets', '// 5h: an effect\'s changes as short text'), fmX = cutX('// 5h: a ▲ / ▼ beside a value an effect touched', '// 5h: a character\'s status effects');
        const mkX = (tag, cls, text) => { const e = { tag, className: cls || '', children: [], attrs: {}, title: '', type: '', value: '', checked: false, disabled: false, dataset: {}, style: {}, on: {},
            classList: { toggle(c, on) { const k = e.className.split(' ').filter(Boolean); const has = k.includes(c), want = on === undefined ? !has : !!on; if (want && !has) k.push(c); if (!want && has) k.splice(k.indexOf(c), 1); e.className = k.join(' '); return want; }, add(c) { this.toggle(c, true); }, remove(c) { this.toggle(c, false); }, contains(c) { return e.className.split(' ').includes(c); } },
            get childNodes() { return e.children; }, get firstChild() { return e.children[0] || null; }, get lastChild() { return e.children[e.children.length - 1] || null; }, appendChild(x) { e.children.push(x); return x; }, insertBefore(x, r) { const i = r ? e.children.indexOf(r) : -1; if (i < 0) e.children.push(x); else e.children.splice(i, 0, x); return x; },
            setAttribute(k, v) { e.attrs[k] = String(v); }, addEventListener(k, fn) { e.on[k] = fn; }, click() { if (e.on.click) e.on.click({}); }, focus() {} };
            if (text !== undefined && text !== null) e.children.push({ tag: '#text', textContent: String(text), children: [] }); return e; };
        const txX = n => !n ? '' : n.tag === '#text' ? n.textContent : (n.children || []).map(txX).join('');
        const docX = { createTextNode: t => ({ tag: '#text', textContent: t, children: [] }), createElementNS: (ns, tag) => Object.assign(mkX(tag), { ns }) };
        const depsX = ['el', 'iconNode', 'rowDef', 'rowIdOf', 'rowLvl', 'rowOn', 'commitItem', 'opt', 'fmtNum', 'iconText', 'LIMITS', '_fxLive', 'document', 'renderViews', 'closeHud', 'closeSheet', 'window', 'systemOf', 'getActiveCampaign', 'facingTarget', 'uid', 'F', 'fxText', 'canRoll', 'sheetRoll', 'commit', 'valueTone', 'TONE_CLASS', 'rowStat', 'rowPaid', '_fxView'];
        const valsX = view => [mkX, (v, cls) => mkX('span', cls), S.rowDef, S.rowIdOf, S.rowLvl, S.rowOn, () => {}, (v, t) => mkX('option', null, t), S.fmtNum, v => v || '', S.LIMITS, true, docX, () => {}, () => {}, () => {}, {}, () => gX, () => null, () => null, p => p + 'new', () => F, S.fxText, () => true, () => {}, () => {}, S.valueTone, {}, S.rowStat, S.rowPaid, view];
        const WX = new Function(...depsX, fmX + itX + '\nreturn { itemListInto, itemTableInto, statBoxes, colBoxes, cellMark, figBox };')(...valsX('sheet'));
        const byX = (n, c) => { const acc = []; const w = k => { if ((' ' + (k.className || '') + ' ').indexOf(' ' + c + ' ') >= 0) acc.push(k); (k.children || []).forEach(w); }; w(n); return acc; };
        const fG = gX.fields.find(x => x.id === 'f_g'), wX = mkX('div'); WX.itemListInto(wX, fG, chX, chX.values.f_g, gX, false, true, true, '', resX);
        const rowsX = wX.children.filter(n => n.className.split(' ').includes('sheet-item')), notesX = wX.children.filter(n => n.className === 'sheet-item-noteline');
        const grids = byX(notesX[0], 'sheet-item-boxes'), boxesA = grids[0] ? grids[0].children.map(b => [b.children[0] && txX(b.children[0]), txX(b.children[1])]) : null;
        const markBox = grids[0] ? byX(grids[0], 'sheet-eff')[0] : null, chipTop = byX(rowsX[0], 'sheet-item-col')[0], markChip = chipTop ? byX(chipTop, 'sheet-eff')[0] : null;
        const drawOk = grids.length === 1 && J(boxesA) === J([['Spd', '12'], ['Cost', '900'], ['Paid', '900'], ['Speed', '14▲']]) && byX(notesX[0], 'sheet-item-statline').length === 0
            && markBox && markBox.className === 'sheet-eff sheet-eff-up' && markBox.title === '12 base · Skiff +2' && markChip && markChip.className === 'sheet-eff sheet-eff-down' && markChip.title === '13 base · Skiff −1'
            && byX(rowsX[1], 'sheet-eff').length === 0 && byX(notesX[1], 'sheet-eff').length === 0;
        // a list not ticked: its one gray line and its columns as chips, as before
        const gN = S.cleanSystem(Object.assign({}, rawX, { fields: [Object.assign({}, rawX.fields[0], { list: Object.assign({}, rawX.fields[0].list, { boxes: false }) })] }), { F, gmView: true }), wN = mkX('div');
        WX.itemListInto(wN, gN.fields[0], chX, chX.values.f_g, gN, false, true, true, '', S.resolveAll(gN, chX, F, null).f_g);
        const plainOk = byX(wN, 'sheet-item-boxes').length === 0 && byX(wN, 'sheet-item-statline').length === 2 && byX(wN, 'sheet-item-col').length === 4;
        // the rich table: a column's mark in its cell
        const wT = mkX('div'); WX.itemTableInto(wT, Object.assign({}, fG, { table: { columns: [] } }), chX, chX.values.f_g, gX, false, true, true, '', resX);
        const tdTop = byX(wT, 'sheet-itcol-col').filter(td => /^12/.test(txX(td)))[0];
        const tableOk = !!tdTop && byX(tdTop, 'sheet-eff-down').length === 1;
        const pureOk = WX.cellMark(null, 0, { value: 1 }) === null && WX.cellMark([null], 0, { value: 1 }) === null && WX.cellMark([{ base: 1, mods: [{ name: 'A', op: 'add', v: 1 }], via: [] }], 0, { error: 'x' }) === null && WX.statBoxes({}, {}, { stats: [{ key: 'a', label: 'A', hide: true }] }, null) === null;
        const cssX = fs.readFileSync(path.join(app, 'style.css'), 'utf8'), ixX = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        const wiredOk = require('./checkkit').part('sysedlist.js').includes("fl.appendChild(checkLabel('sys-list-boxes', sp.boxes === true, 'Figures as boxes',") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-boxes') >= 0) { if (t.checked) lsc.boxes = true; else delete lsc.boxes; }")
            && /\.sheet-item-box \{[^}]*flex-direction: column;/.test(cssX) && ixX.includes('<b>Figures as boxes</b> shows a row');
        check('1.6.0, backlog 180 R3: a list ticked Figures as boxes (boxes, true only, the same in both views and a fixed point) draws a row\'s details as small boxes, each its label above its figure: every stat that is not Hidden, Paid, then the columns placed in the details, in one grid with no gray line; '
            + 'the resolver keeps each cell\'s effects (cfx, only where one reached a cell), and a column an effect changed carries ▲ or ▼ with its breakdown on its box, its chip and its rich table cell (itemListInto and itemTableInto with the real fxMark, run for real); a list not ticked draws its line and its chips as before; the editor\'s tick and its handler',
            cleanOk && resOk && drawOk && plainOk && tableOk && pureOk && wiredOk, J([cleanOk, resOk, drawOk, plainOk, tableOk, pureOk, wiredOk, resX.cfx, boxesA, markBox && markBox.title, markChip && markChip.title]));
    }
    {   // 1.6.0, backlog 180 R8 (the owner, by prompt: "A list ticks it", and of each choice "10 pts could be in its own darker box like we have in the option b of r7")
        const J = JSON.stringify;
        const rawL = { v: 1, name: 'L', rolls: [], sheet: { sections: [] }, items: [],
            fields: [{ id: 'f_g', key: 'Feats', label: 'Feats', kind: 'item-list', list: { lvl: { label: 'Rank', min: 1, max: 9, entry: true } } }, { id: 'f_o', key: 'Other', label: 'Other', kind: 'item-list', list: { lvl: { label: 'Rank', entry: 'yes' } } }] };
        const gL = S.cleanSystem(rawL, { F, gmView: true }), pL = S.cleanSystem(rawL, { F, gmView: false });
        const cleanOk = gL.fields[0].list.lvl.entry === true && pL.fields[0].list.lvl.entry === true && !('entry' in gL.fields[1].list.lvl) && J(S.cleanSystem(gL, { F, gmView: true })) === J(gL) && J(S.cleanSystem(pL, { F, gmView: false })) === J(pL);
        const shL = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const cutL = (a, b) => { const i = shL.indexOf(a), k = shL.indexOf(b, i + 1); if (i < 0 || k < 0) throw new Error('r8 slice: ' + a); return shL.slice(i, k); };
        const itL = cutL('// ---- item-list widgets', '// 5h: an effect\'s changes as short text');
        const docL = { listeners: {}, activeElement: null, body: null, createTextNode: t => ({ tag: '#text', textContent: t, children: [] }), addEventListener(k, fn) { (this.listeners[k] = this.listeners[k] || []).push(fn); }, removeEventListener(k, fn) { this.listeners[k] = (this.listeners[k] || []).filter(x => x !== fn); } };
        const hasCls = (n, sel) => sel.split('.').filter(Boolean).every(c => (' ' + (n.className || '') + ' ').indexOf(' ' + c + ' ') >= 0);
        const mkL = (tag, cls, text) => { const e = { tag, className: cls || '', children: [], attrs: {}, title: '', type: '', value: '', dataset: {}, style: {}, on: {}, parent: null,
            classList: { add(c) { if (!hasCls(e, c)) e.className = (e.className + ' ' + c).trim(); }, contains(c) { return hasCls(e, c); } },
            get childNodes() { return e.children; }, appendChild(x) { x.parent = e; e.children.push(x); return x; }, insertBefore(x, r) { x.parent = e; const i = r ? e.children.indexOf(r) : -1; if (i < 0) e.children.push(x); else e.children.splice(i, 0, x); return x; },
            remove() { if (e.parent) { e.parent.children = e.parent.children.filter(k => k !== e); e.parent = null; } }, contains(x) { let n = x; while (n) { if (n === e) return true; n = n.parent; } return false; },
            querySelectorAll(sel) { const acc = []; const w = n => (n.children || []).forEach(k => { if (k.tag !== '#text' && hasCls(k, sel)) acc.push(k); w(k); }); w(e); return acc; }, querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
            setAttribute(k, v) { e.attrs[k] = String(v); }, getBoundingClientRect() { return { left: 100, right: 160, top: 50, bottom: 74 }; }, addEventListener(k, fn) { e.on[k] = fn; }, click() { if (e.on.click) e.on.click({ preventDefault() {} }); }, focus() { docL.activeElement = e; } };
            if (text !== undefined && text !== null) e.children.push({ tag: '#text', textContent: String(text), children: [] }); return e; };
        docL.body = mkL('body');
        const txL = n => !n ? '' : n.tag === '#text' ? n.textContent : (n.children || []).map(txL).join('');
        const sentL = [];
        const depsL = ['el', 'iconNode', 'rowDef', 'rowIdOf', 'rowLvl', 'rowOn', 'commitItem', 'opt', 'fmtNum', 'iconText', 'LIMITS', '_fxLive', 'document', 'renderViews', 'closeHud', 'closeSheet', 'window', 'systemOf', 'getActiveCampaign', 'facingTarget', 'uid', 'F', 'fxText', 'canRoll', 'sheetRoll', 'commit', 'valueTone', 'TONE_CLASS', 'rowStat', 'rowPaid', '_fxView'];
        const WL = new Function(...depsL, itL + '\nreturn { lvlCtl, openLvlMenu, closeLoadMenu, lvlWord, entryLvls, getPop: function() { return _ldPop; } };')(mkL, (v, cls) => mkL('span', cls), S.rowDef, S.rowIdOf, S.rowLvl, S.rowOn, (c, f, op) => sentL.push(op), (v, t, sl) => { const o = mkL('option', null, t); o.value = v; if (sl) o.selected = true; return o; }, S.fmtNum, v => v || '', S.LIMITS, true, docL, () => {}, () => {}, () => {}, { innerWidth: 1000, innerHeight: 800 }, () => gL, () => null, () => null, p => p + 'new', () => F, S.fxText, () => true, () => {}, () => {}, S.valueTone, {}, S.rowStat, S.rowPaid, 'sheet');
        const fL = gL.fields[0], spL = fL.list, defL = { name: 'Quick Draw', lvls: [{ lvl: 1, text: 'a', tag: '2 pts' }, { lvl: 2, text: 'b', tag: '4 pts' }, { lvl: 3, text: 'c' }] }, chL = { id: 'c_l', name: 'Kael' };
        const kidsL = n => n.children.map(k => k.tag === '#text' ? '#' + k.textContent : k.className + ':' + txL(k));
        const w1 = WL.lvlCtl({ id: 'w_a', lvl: 2 }, defL, chL, fL, spL, true), btn = w1.children[0];
        const btnOk = btn && btn.tag === 'button' && btn.className === 'tool ghost sheet-item-lvlbtn' && J(kidsL(btn)) === J(['sheet-item-lvlword:Rank 2', 'sheet-item-lvltagbox:4 pts']) && btn.attrs['aria-haspopup'] === 'menu';
        btn.click(); const pop = WL.getPop(), items = pop ? pop.querySelectorAll('.sheet-dl-item') : [];
        const popOk = !!pop && pop.parent === docL.body && hasCls(pop, 'sheet-dl-pop') && J(items.map(kidsL)) === J([['sheet-item-lvlword:Rank 1', 'sheet-item-lvltagbox:2 pts'], ['sheet-item-lvlword:Rank 2', 'sheet-item-lvltagbox:4 pts'], ['sheet-item-lvlword:Rank 3']])
            && J(items.map(b => b.attrs['aria-checked'])) === J(['false', 'true', 'false']) && hasCls(items[1], 'on') && docL.activeElement === items[1] && pop.style.left === '100px' && pop.style.top === '80px';
        items[2].click(); const pickOk = WL.getPop() === null && pop.parent === null && J(sentL) === J([{ op: 'set', rowId: 'w_a', facts: { lvl: 3 } }]) && docL.activeElement === btn && (docL.listeners.keydown || []).length === 0;
        btn.click(); btn.click(); const toggleOk = WL.getPop() === null;
        btn.click(); (docL.listeners.keydown || []).slice().forEach(fn => fn({ key: 'Escape', preventDefault() {}, stopPropagation() {} })); const escOk = WL.getPop() === null && docL.activeElement === btn;
        btn.click(); WL.getPop().querySelectorAll('.sheet-dl-item')[1].click(); const sameOk = sentL.length === 1;
        const w5 = WL.lvlCtl({ id: 'w_b', lvl: 5 }, defL, chL, fL, spL, true), outOk = J(kidsL(w5.children[0])) === J(['sheet-item-lvlword:Rank 5']);
        const wR = WL.lvlCtl({ id: 'w_a', lvl: 1 }, defL, chL, fL, spL, false), readOk = J(kidsL(wR)) === J(['sheet-item-lvlword:Rank 1', 'sheet-item-lvltagbox:2 pts']);
        const wN = WL.lvlCtl({ id: 'w_a', lvl: 1 }, { name: 'Plain' }, chL, fL, spL, true), noneOk = wN.children[0].className === 'field sheet-item-lvlin';
        const wO = WL.lvlCtl({ id: 'w_a', lvl: 1 }, defL, chL, fL, Object.assign({}, spL, { lvl: { label: 'Rank', min: 1 } }), true), offOk = wO.children[0].className === 'field sheet-item-lvlin';
        const namedOk = WL.lvlWord({ label: 'Rank', min: 1, labels: ['Novice', 'Adept'] }, 2) === 'Adept' && WL.lvlWord({ label: 'Rank', min: 1, labels: ['Novice', 'Adept'] }, 5) === 'Rank 5' && WL.lvlWord({}, 3) === 'Level 3' && J(WL.entryLvls({ lvls: [null, { lvl: 'x' }, { lvl: 2 }] })) === J([{ lvl: 2 }]) && J(WL.entryLvls(null)) === '[]';
        const cssL = fs.readFileSync(path.join(app, 'style.css'), 'utf8');
        const wiredOk = require('./checkkit').part('sysedlist.js').includes("lr.appendChild(checkLabel('sys-list-lvlentry', lv.entry === true, 'Levels from the entry',") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-lvlentry') >= 0) { if (lsc.lvl && typeof lsc.lvl === 'object') { if (t.checked) lsc.lvl.entry = true; else delete lsc.lvl.entry; } }") && /\.sheet-item-lvltagbox \{[^}]*background: color-mix\(in srgb, #000 35%, transparent\);/.test(cssL);
        check('1.6.0, backlog 180 R8: a list\'s level may be ticked Levels from the entry (entry, true only, the same in both views and a fixed point); where the row\'s entry has By level rows the level is a button (lvlCtl, run for real) of the level\'s word and its tag in a darker box, opening the Load menu\'s own pop of every listed level, '
            + 'the row\'s own one marked and focused, a pick committing the level once and closing it, the button again or Escape closing it, the same level committing nothing; a stored level outside the list still on the button; read-only the words and the box; an entry with none, or a list not ticked, keeps the level box; a named level by its name; the editor\'s tick, its handler and the box\'s style',
            cleanOk && btnOk && popOk && pickOk && toggleOk && escOk && sameOk && outOk && readOk && noneOk && offOk && namedOk && wiredOk, J([cleanOk, btnOk, popOk, pickOk, toggleOk, escOk, sameOk, outOk, readOk, noneOk, offOk, namedOk, wiredOk, btn && kidsL(btn), pop && pop.style, sentL]));
        // 1.6.0 Levels it may be: the level menu offers only the entry's own levels (sheets.js lvlOnlyMenu, lvlCtl and openLvlMenu, run for real)
        const WO = plr => new Function(...depsL, 'lvlOnlyList', 'isClient', itL + '\nreturn { lvlCtl, getPop: function() { return _ldPop; }, closeLoadMenu };')(mkL, (v, cls) => mkL('span', cls), S.rowDef, S.rowIdOf, S.rowLvl, S.rowOn, (c, f, op) => sentL.push(op), (v, t, sl) => { const o = mkL('option', null, t); o.value = v; if (sl) o.selected = true; return o; }, S.fmtNum, v => v || '', S.LIMITS, true, docL, () => {}, () => {}, () => {}, { innerWidth: 1000, innerHeight: 800 }, () => gL, () => null, () => null, p => p + 'new', () => F, S.fxText, () => true, () => {}, () => {}, S.valueTone, {}, S.rowStat, S.rowPaid, 'sheet', S.lvlOnlyList, () => plr);
        const popLv = (W, entry, def, sp, ed) => { const w = W.lvlCtl(entry, def, chL, fL, sp, ed === undefined ? true : ed), b = w.children[0]; if (b.tag !== 'button') return { kind: b.className || b.tag }; b.click(); const p = W.getPop(), its = p ? p.querySelectorAll('.sheet-dl-item') : []; const out = { kind: 'menu', face: kidsL(b), items: its.map(kidsL), out: its.map(i => hasCls(i, 'sheet-lvl-out')), tips: its.map(i => i.title) }; W.closeLoadMenu(); return out; };
        const dO = Object.assign({}, defL, { lvlOnly: [1, 3] }), spP = { label: 'Rank', min: 1, max: 6 }, plainSp = { lvl: spP }, GMw = WO(false), PLw = WO(true);
        const pT = popLv(PLw, { id: 'w_a', lvl: 1 }, dO, spL), gT = popLv(GMw, { id: 'w_a', lvl: 1 }, dO, spL), pU = popLv(PLw, { id: 'w_a', lvl: 3 }, { name: 'K', lvlOnly: [[2, 3]] }, plainSp), gU = popLv(GMw, { id: 'w_a', lvl: 3 }, { name: 'K', lvlOnly: [[2, 3]] }, plainSp), pR = popLv(PLw, { id: 'w_a', lvl: 3 }, { name: 'K', lvlOnly: [[2, 3]] }, plainSp, false), pS = popLv(PLw, { id: 'w_a', lvl: 5 }, dO, spL), pN = popLv(PLw, { id: 'w_a', lvl: 2 }, defL, spL);
        check('1.6.0 Levels it may be in the level menu: a player offered the entry\'s own levels alone, each with its By level tag, whatever the list ticks; the GM\'s menu also lists its other By level rows, marked, since the GM\'s hand passes; on a list with no menu the GM keeps the box, and a player read-only keeps the figure; a stored level outside them still shows on the button; an entry that names none is as before',
            J(pT.items) === J([['sheet-item-lvlword:Rank 1', 'sheet-item-lvltagbox:2 pts'], ['sheet-item-lvlword:Rank 3']]) && J(gT.items) === J([['sheet-item-lvlword:Rank 1', 'sheet-item-lvltagbox:2 pts'], ['sheet-item-lvlword:Rank 2', 'sheet-item-lvltagbox:4 pts'], ['sheet-item-lvlword:Rank 3']]) && J(gT.out) === J([false, true, false]) && gT.tips[1] === 'Not one of this entry’s levels. A player would be refused.' && J(pT.out) === J([false, false])
            && J(pU.items) === J([['sheet-item-lvlword:Rank 2'], ['sheet-item-lvlword:Rank 3']]) && gU.kind === 'field sheet-item-lvlin' && pR.kind === 'sheet-item-lvln' && J(pS.face) === J(['sheet-item-lvlword:Rank 5']) && pN.items.length === 3 && pN.out.every(x => !x), J([pT, gT, pU, gU, pR, pS]));
    }
    {   // 1.6.0, backlog 180 R10 (the owner's order of 2026-10-27): a choice stat on a row as a menu, where the list ticks Choices as menus
        const J = JSON.stringify;
        const raw10 = { v: 1, name: 'C', rolls: [], items: [{ id: 'i_sp', name: 'Spear', stats: { Grip: 'Two hands', Cond: 0 } }], sheet: { sections: [] },
            fields: [{ id: 'f_w', key: 'Weap', label: 'Weapons', kind: 'item-list', edit: 'owner', list: { menus: true, stats: [{ key: 'Grip', label: 'Grip', kind: 'pick', opts: [{ label: 'One hand', name: 'ST' }, { label: 'Two hands', name: 'ST' }], show: true }, { key: 'Cond', label: 'Condition', labels: ['Fine', 'Worn', 'Broken'], show: true }, { key: 'Wt', label: 'Wt', show: true }] } },
                { id: 'f_o', key: 'Other', label: 'Other', kind: 'item-list', list: { menus: 'yes' } }] };
        const g10 = S.cleanSystem(raw10, { F, gmView: true }), p10 = S.cleanSystem(raw10, { F, gmView: false }), sp10 = g10.fields[0].list;
        const cleanOk = sp10.menus === true && p10.fields[0].list.menus === true && !(g10.fields[1].list && 'menus' in g10.fields[1].list) && J(S.cleanSystem(g10, { F, gmView: true })) === J(g10);
        const sh10 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const a10 = sh10.indexOf('// [systemcheck:statmenu-start]'), b10 = sh10.indexOf('// [systemcheck:statmenu-end]'), sent10 = [];
        const mk10 = (tag, cls, text) => { const e = { tag, className: cls || '', children: [], dataset: {}, value: '', selected: false, disabled: false, on: {}, title: '', ariaLabel: '', textContent: text === undefined ? '' : String(text), get firstChild() { return e.children[0] || null; }, appendChild(x) { e.children.push(x); return x; }, insertBefore(x, r) { const i = e.children.indexOf(r); if (i < 0) e.children.push(x); else e.children.splice(i, 0, x); return x; }, addEventListener(k, fn) { e.on[k] = fn; } }; return e; };
        const opt10 = (v, t, s) => { const o = mk10('option', null, t); o.value = v; if (s) o.selected = true; return o; };
        let rights10 = 'gm';
        {   // body fold 0: Player sets this, on the sheet (statMenuMode and statMenu), and Rows gather by (groupRows)
            const SO = new Function('el', 'opt', 'statShown', 'rowStat', 'commitItem', 'rowIdOf', 'rowRights', sh10.slice(a10, b10) + '\nreturn { statMenuMode, statMenu };')(() => ({ dataset: {}, appendChild() {}, addEventListener() {}, insertBefore() {} }), () => ({}), () => '', () => '', () => {}, () => 'w', () => '');
            const own = { key: 'Hand', kind: 'pick', own: true, opts: [{ label: 'Left' }, { label: 'Right' }] }, plain = { key: 'Grip', kind: 'pick', opts: [{ label: 'One' }] }, spO = { stats: [own, plain] }, ent = { id: 'w_a', defId: 'i_a' };
            const mO = (e, sp, gm, ed, ow, src) => SO.statMenuMode(e, { def: {}, src: src || 'lib' }, sp, gm, {}, ed, ow);
            const modes = [mO(ent, spO, false, false, true), mO(ent, spO, false, false, false), mO(ent, spO, true, false, true), mO(ent, { stats: [plain] }, false, false, true), mO(Object.assign({ hid: 1 }, ent), spO, false, false, true), mO(Object.assign({ opn: 'w_b' }, ent), spO, false, false, true), mO(Object.assign({ src: 'i_a' }, ent), spO, false, false, true, 'inline'), mO(ent, spO, false, false, true, 'inline'), mO(ent, spO, false, false, true, 'custom')];
            const menus = [!!SO.statMenu(own, 'Left', ent, { base: {} }, {}, { id: 'f' }, spO, 'own'), SO.statMenu(plain, 'One', ent, { base: {} }, {}, { id: 'f' }, spO, 'own'), SO.statMenu(own, 'Left', { ov: { held: ['hand'] }, id: 'w_a' }, { base: {} }, {}, { id: 'f' }, spO, 'own')];
            const ga = sh10.indexOf('// [systemcheck:grouprows-start]'), gb = sh10.indexOf('// [systemcheck:grouprows-end]');
            const GR = new Function('placeVal', sh10.slice(ga, gb) + '\nreturn groupRows;')((s, sp, r) => r.k || '');
            const rowsG = [{ id: 'a', k: 'Shield' }, { id: 'b', k: '' }, { id: 'c', k: 'Blade' }, { id: 'd', k: 'Shield' }, { id: 'e', k: 'blade' }, { id: 'f', k: 'Odd' }], gOrder = GR(rowsG, { placeBy: 'Kind', stats: [{ key: 'kind', kind: 'pick', opts: [{ label: 'Blade' }, { label: 'Shield' }] }] }, {}).map(r => r.id).join('');
            const gNames = GR(rowsG, { placeBy: 'kind', stats: [{ key: 'Kind', labels: ['Shield', 'Blade'] }] }, {}).map(r => r.id).join('');
            check('body fold 0, the sheet (statMenuMode, statMenu and groupRows, run for real): a stat ticked Player sets this is a menu for its owner on a row they may not otherwise change, and only that stat; none where the sheet says it is not open to them, for the GM, on a list with none, on a row kept from them or one another row opens, a copy that names no entry and a row of the character\u2019s own; a player\u2019s inline copy naming its entry takes one; a stat the GM set stays the GM\u2019s. Rows gather by keeps the stat\u2019s own order of values, ignoring case, each group in its own order, with what has no value of the stat last',
                j(modes) === j(['own', '', '', '', '', '', 'own', '', '']) && j(menus) === j([true, null, null]) && gOrder === 'ceadbf' && gNames === 'adcebf', j([modes, menus, gOrder, gNames]));
            check('body fold 0, what the sheet is told: fieldNodeBody works out whether the stat may be set here from the sheet\u2019s own lock and hands it to both of a list\u2019s drawings, and a rich table gives such a stat a column with its menu', /var ownOk = !gm && !!own && f\.vis === 'all' && !lk && !c\.partial/.test(sh10) && /s\.show === true \|\| s\.own === true/.test(sh10) && /mnT = smT \? statMenu\(s, svT, entry, rd, c, f, spec, smT\) : null/.test(sh10) && !/_lockNow\b[^\n]*statMenuMode/.test(sh10) && /\.sheet-chip\.sheet-item-statpick \{ flex: none; \}/.test(fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'style.css'), 'utf8')));
        }
        const SM = new Function('el', 'opt', 'statShown', 'rowStat', 'commitItem', 'rowIdOf', 'rowRights', sh10.slice(a10, b10) + '\nreturn { statMenuMode, statMenu };')(mk10, opt10, (s, v) => s.kind === 'pick' ? String(v) : Array.isArray(s.labels) && s.labels[v] ? s.labels[v] : String(v), S.rowStat, (c, f, q) => sent10.push(q), S.rowIdOf, () => rights10);
        const ent10 = { id: 'w_s', defId: 'i_sp', qty: 1 }, rd10 = { src: 'lib', def: { name: 'Spear', stats: { Grip: 'Two hands', Cond: 0 } }, base: { stats: { Grip: 'Two hands', Cond: 0 } } };
        const lrA = { listRules: { ownerStats: true } }, lrQ = { listRules: { ownerStats: true, statsAsk: true } };
        const modeOk = SM.statMenuMode(ent10, rd10, sp10, true, g10, true) === 'gm' && SM.statMenuMode(ent10, rd10, sp10, true, g10, false) === '' && SM.statMenuMode(ent10, rd10, g10.fields[1].list || {}, true, g10, true) === ''
            && SM.statMenuMode(Object.assign({}, ent10, { hid: 1 }), rd10, sp10, true, g10, true) === '' && SM.statMenuMode(Object.assign({}, ent10, { opn: 'w_x' }), rd10, sp10, true, g10, true) === ''
            && (rights10 = 'stats', SM.statMenuMode(ent10, rd10, sp10, false, lrA, true) === 'stats' && SM.statMenuMode(ent10, rd10, sp10, false, lrQ, true) === '' && SM.statMenuMode(ent10, rd10, sp10, false, {}, true) === '') && (rights10 = '', SM.statMenuMode(ent10, rd10, sp10, false, lrA, true) === '');
        const fG = { id: 'f_w' }, gripS = sp10.stats[0], condS = sp10.stats[1], wtS = sp10.stats[2];
        const mG = SM.statMenu(gripS, 'Two hands', ent10, rd10, {}, fG, sp10, 'gm'), mC = SM.statMenu(condS, 1, ent10, rd10, {}, fG, sp10, 'gm'), mX = SM.statMenu(condS, 7, ent10, rd10, {}, fG, sp10, 'gm');
        const drawOk = mG && J(mG.children.map(o => [o.value, o.textContent, o.selected])) === J([['One hand', 'One hand', false], ['Two hands', 'Two hands', true]]) && mG.ariaLabel === 'Grip' && mG.dataset.part === 'st-w_s-Grip'
            && mC && J(mC.children.map(o => [o.value, o.textContent, o.selected])) === J([['0', 'Fine', false], ['1', 'Worn', true], ['2', 'Broken', false]])
            && mX && mX.children[0].disabled === true && mX.children[0].selected === true && mX.children.length === 4 && SM.statMenu(wtS, 2, ent10, rd10, {}, fG, sp10, 'gm') === null
            && SM.statMenu(condS, 1, Object.assign({}, ent10, { ov: { held: ['cond'] } }), rd10, {}, fG, sp10, 'stats') === null && !!SM.statMenu(condS, 1, Object.assign({}, ent10, { ov: { held: ['cond'] } }), rd10, {}, fG, sp10, 'gm');
        mG.value = 'One hand'; mG.on.change(); mG.value = 'Two hands'; mG.on.change(); mC.value = '2'; mC.on.change(); mC.value = '0'; mC.on.change(); mX.value = ''; mX.on.change();
        const sendOk = J(sent10) === J([{ op: 'ov', rowId: 'w_s', ov: { stats: { Grip: 'One hand' } } }, { op: 'ov', rowId: 'w_s', ov: { stats: { Grip: null } } }, { op: 'ov', rowId: 'w_s', ov: { stats: { Cond: 2 } } }, { op: 'ov', rowId: 'w_s', ov: { stats: { Cond: null } } }]);
        const ht10 = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        const wiredOk = sh10.includes("_rowMenu = smR ? function(s, sv) { return statMenu(s, sv, entry, rd, c, f, spec, smR); } : null;") && sh10.includes("        _rowMenu = null;\n") && sh10.includes("mnC = typeof _rowMenu === 'function' ? _rowMenu(s, sv) : null;") && sh10.includes("mnB = typeof _rowMenu === 'function' ? _rowMenu(s, sv) : null;")
            && require('./checkkit').part('sysedlist.js').includes("checkLabel('sys-list-menus', sp.menus === true, 'Choices as menus'") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-menus') >= 0) { if (t.checked) lsc.menus = true; else delete lsc.menus; }") && ht10.includes('<li><b>Choices as menus</b> makes a choice stat on a row a menu');
        check('1.6.0, backlog 180 R10: a list may tick Choices as menus (menus, true only, the same in both views and a fixed point); then a choice stat (a pick, or a number with value names, never a set of places or a Hidden stat) is a menu on its row and in its boxes (statMenu, run for real) for whoever may set the copy\'s own stats there: '
            + 'the GM, or its owner where players set their copies\' stats and no ask rule holds, never a stat the GM set for that owner, a locked sheet, a row kept from its player or one another row opens; the value it holds marked, a value past the names shown and not offered; a pick sent as the copy\'s own stat, the library\'s own value as none; its wiring, its tick and Help',
            cleanOk && modeOk && drawOk && sendOk && wiredOk, J([cleanOk, modeOk, drawOk, sendOk, wiredOk, mG && mG.children.map(o => [o.value, o.textContent, o.selected]), mG && [mG.ariaLabel, mG.dataset.part], mC && mC.children.map(o => [o.value, o.textContent, o.selected]), mX && mX.children.map(o => [o.value, o.disabled, o.selected])]));
    }
    {   // 198 (a build session, 2026-10-28): which rows hold parts (parts.hosts), and a row of the character's own as a part (the custom op's in)
        const J = JSON.stringify;
        const rawH = { v: 1, name: 'H', rolls: [], items: [{ id: 'i_arm', name: 'Arm', category: 'Limb' }, { id: 'i_eye', name: 'Eye', category: 'Implant' }, { id: 'i_up', name: 'Grip', category: 'Upgrade' }],
            fields: [{ id: 'f_c', key: 'Cyber', label: 'Cyber', kind: 'item-list', vis: 'all', edit: 'owner', list: { custom: true, parts: { from: 'f_c', cats: ['Upgrade'], hosts: ['Limb', 'limb', '', 7] } } }], sheet: { sections: [] } };
        const gH = cleanSystem(rawH, { F, gmView: true }), pH = cleanSystem(rawH, { F, gmView: false }), spH = gH.fields[0].list;
        const cleanOk = J(spH.parts) === J({ from: 'f_c', cats: ['Upgrade'], hosts: ['Limb'] }) && J(pH.fields[0].list.parts) === J(spH.parts) && J(cleanSystem(gH, { F, gmView: true })) === J(gH);
        const rows0 = () => ({ id: 'c1', values: { f_c: [{ id: 'w_arm', defId: 'i_arm', qty: 1 }, { id: 'w_eye', defId: 'i_eye', qty: 1 }, { id: 'w_own', qty: 1, def: { name: 'Hand', category: 'Limb', icon: '', notes: '', vis: 'all' } }] } });
        const okRows = S.partHostOk(gH, spH, rows0().values.f_c[0]) && !S.partHostOk(gH, spH, rows0().values.f_c[1]) && S.partHostOk(gH, spH, rows0().values.f_c[2]) && !S.partHostOk(gH, spH, { id: 'w_p', defId: 'i_arm', in: 'w_arm' })
            && S.partHostOk(gH, { parts: { from: 'f_c' } }, rows0().values.f_c[1]) && !S.partHostOk(gH, spH, null);
        const op = (ch, q, o) => S.applyRowOp(gH, ch, 'f_c', q, F, o || {});
        const a1 = op(rows0(), { op: 'add', defId: 'i_up', rowId: 'w_u1', in: 'w_arm' }), a2 = op(rows0(), { op: 'add', defId: 'i_up', rowId: 'w_u2', in: 'w_eye' }), a3 = op(rows0(), { op: 'add', defId: 'i_up', rowId: 'w_u3', in: 'w_own' });
        const addOk = a1.ok && a1.value.some(r => r.id === 'w_u1' && r.in === 'w_arm') && J(a2) === J({ ok: false, reason: 'missing' }) && a3.ok;
        const c1 = op(rows0(), { op: 'custom', rowId: 'w_c1', in: 'w_arm', def: { name: 'Own grip', category: 'Upgrade' } }), c1p = op(rows0(), { op: 'custom', rowId: 'w_c1', in: 'w_arm', def: { name: 'Own grip', category: 'Upgrade' } }, { player: true, view: pH });
        const c2 = op(rows0(), { op: 'custom', rowId: 'w_c2', in: 'w_arm', def: { name: 'Own toy', category: 'Junk' } }), c3 = op(rows0(), { op: 'custom', rowId: 'w_c3', in: 'w_eye', def: { name: 'X', category: 'Upgrade' } });
        const c4 = op(rows0(), { op: 'custom', rowId: 'w_c4', in: 'w_c4', def: { name: 'X', category: 'Upgrade' } }), c5 = op(rows0(), { op: 'custom', rowId: 'w_c5', in: 'nope', def: { name: 'X' } });
        const chE = rows0(); chE.values.f_c = c1.value; const e1 = op(chE, { op: 'custom', rowId: 'w_c1', in: 'w_arm', def: { notes: 'Kept' } }), e2 = op(chE, { op: 'custom', rowId: 'w_c1', in: 'w_own', def: { notes: 'Moved' } }), e3 = op(chE, { op: 'custom', rowId: 'w_c1', def: { notes: 'Plain' } });
        const custOk = c1.ok && c1.value.some(r => r.id === 'w_c1' && r.in === 'w_arm' && r.def.name === 'Own grip') && c1p.ok && c1p.value.some(r => r.id === 'w_c1' && r.in === 'w_arm' && r.own === 1)
            && J(c2) === J({ ok: false, reason: 'missing' }) && J(c3) === J({ ok: false, reason: 'missing' }) && J(c4) === J({ ok: false, reason: 'value' }) && J(c5) === J({ ok: false, reason: 'value' })
            && e1.ok && e1.value.some(r => r.id === 'w_c1' && r.in === 'w_arm' && r.def.notes === 'Kept') && J(e2) === J({ ok: false, reason: 'value' }) && e3.ok && e3.value.some(r => r.id === 'w_c1' && r.in === 'w_arm');
        const ci = S.cleanCharItem({ rid: 'e12345678', charId: 'c_1', fieldId: 'f_c', op: 'custom', rowId: 'w_x', in: 'w_arm', def: { name: 'A' } }), ciB = S.cleanCharItem({ rid: 'e12345678', charId: 'c_1', fieldId: 'f_c', op: 'custom', rowId: 'w_x', in: '!!', def: { name: 'A' } });
        const wireOk = !!ci && ci.in === 'w_arm' && ciB === null;
        const shH = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const sheetOk = shH.includes("if (chg && typeof partHostOk === 'function' && !partHostOk(sysI, spec, entry)) chg = false;") && require('./checkkit').part('sysedlist.js').includes("el('input', 'field sys-list-partshosts')") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-partshosts') >= 0)");
        check('198 which rows hold parts: a list\'s parts.hosts (the categories, each once, the same in both views) judged by partHostOk, a row of another category or a part itself holding none and the host refusing an add to it; a row of the character\'s own made as a part through the custom op\'s in, judged as add\'s (a host that may hold parts, the parts\' categories, never itself), its in kept through later changes and never moved; the wire keeps it; the sheet\'s add control only on a host and the Lists tab\'s Held by',
            cleanOk && okRows && addOk && custOk && wireOk && sheetOk, J([cleanOk, okRows, addOk, custOk, wireOk, sheetOk, spH.parts, a2, c2, c3, c4, c5, e2]));
    }
    {   // 1.6.0 Rolls unheld entries (the owner, by prompt: "On the list (Recommended)", "The library picker (Recommended)", "GM and owner, by a tick (Recommended)")
        const J = JSON.stringify;
        const rawU = { v: 1, name: 'U', rolls: [], items: [{ id: 'i_st', name: 'Stealth', category: 'Skill', stats: { Dflt: -4 } }, { id: 'i_sec', name: 'Secret art', category: 'Skill', vis: 'gm' }],
            fields: [{ id: 'f_dx', key: 'DX', label: 'DX', kind: 'number', vis: 'all' }, { id: 'f_hid', key: 'Hid', label: 'Hid', kind: 'number', vis: 'gm' },
                { id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', vis: 'all', edit: 'owner', list: { noQty: true, cats: ['Skill'], lvl: { min: -10, max: 20, def: 0 }, unheld: 'Row.Dflt', stats: [{ key: 'Dflt', label: 'Default' }], cols: [{ key: 'Eff', label: 'Eff', formula: 'DX + Row.lvl' }], rolls: [{ label: 'Check', formula: '3d6 <= Row.Eff' }] } },
                { id: 'f_gm', key: 'Arts', label: 'Arts', kind: 'item-list', vis: 'all', list: { lvl: { min: 0, def: 0 }, unheld: 'Hid - 5' } },
                { id: 'f_nl', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', list: { unheld: '-5' } }], sheet: { sections: [] } };
        const gU = cleanSystem(rawU, { F, gmView: true }), pU = cleanSystem(rawU, { F, gmView: false }), skG = gU.fields[2].list;
        const offU = JSON.parse(J(rawU)); offU.fields.forEach(f => { if (f.list) delete f.list.unheld; });
        const cleanOk = skG.unheld === 'Row.Dflt' && pU.fields.find(f => f.id === 'f_sk').list.unheld === 'Row.Dflt' && gU.fields[3].list.unheld === 'Hid - 5' && !('unheld' in pU.fields.find(f => f.id === 'f_gm').list)
            && !(gU.fields[4].list && 'unheld' in gU.fields[4].list) && J(cleanSystem(gU, { F, gmView: true })) === J(gU) && !J(cleanSystem(offU, { F, gmView: true })).includes('unheld') && S.validateSystem(gU, F).errors.length === 0
            && !('unheld' in cleanSystem(Object.assign(JSON.parse(J(rawU)), { fields: [Object.assign(JSON.parse(J(rawU.fields[2])), { list: Object.assign({}, rawU.fields[2].list, { unheld: '   ' }) })] }), { F, gmView: true }).fields[0].list);
        const badD = JSON.parse(J(rawU)); badD.fields[2].list.unheld = '1d6 - 5'; const badN = JSON.parse(J(rawU)); badN.fields[2].list.unheld = 'Nope.x';
        const valOk = S.validateSystem(cleanSystem(badD, { F, gmView: true }), F).errors.length > 0 && S.validateSystem(cleanSystem(badN, { F, gmView: true }), F).errors.length > 0;
        const climb = { id: 'i_cl', name: 'Climb', category: 'Skill', stats: { Dflt: -5 } }, cake = { id: 'i_ck', name: 'Cake', category: 'Food' };
        const kael = { id: 'c_k', name: 'Kael', values: { f_dx: 12, f_sk: [{ id: 'w_s', defId: 'i_st', lvl: 2 }, { id: 'w_c', defId: 'i_cl', hid: 1 }] } };
        const jd = (sys, f, d, c) => S.unheldJudge(sys, c || kael, f, d);
        const judgeOk = jd(gU, 'f_sk', climb).ok === true && jd(gU, 'f_sk', climb).f.id === 'f_sk' && J(jd(gU, 'f_sk', gU.items[0])) === J({ ok: false, msg: 'Kael holds Stealth. Roll it from its row.' })
            && J(jd(gU, 'f_sk', cake)) === J({ ok: false, msg: 'Cake is not an entry of Skills.' }) && J(jd(gU, 'f_nl', climb)) === J({ ok: false, msg: 'That list does not roll entries nobody holds.' })
            && J(jd(gU, 'f_sk', null)) === J({ ok: false, msg: 'That entry is not there now.' }) && J(jd(gU, 'f_dx', climb)) === J({ ok: false, msg: 'That list does not roll entries nobody holds.' })
            && jd(pU, 'f_sk', climb, { name: 'Sela', values: { f_sk: [{ id: 'w_x', lnk: 1, src: 'i_cl', def: { name: 'Climb' } }] } }).msg === 'Sela holds Climb. Roll it from its row.';
        const vs = S.makeResolver(gU, kael, F), uv = vs.unheld('f_sk', climb), ev = t => F.evaluate(t, { vars: uv }).value;
        const resOk = !!uv && ev('Row.lvl') === -5 && ev('Row.has') === false && ev('Row.qty') === 0 && ev('Row.Eff') === 7 && ev('Row.Dflt') === -5 && ev('DX') === 12
            && vs.unheld('f_nl', climb) === null && vs.unheld('f_sk', null) === null && F.evaluate('Row.lvl', { vars: vs.unheld('f_sk', { id: 'i_z', name: 'Zip', category: 'Skill' }) }).value === 0
            && S.makeResolver(cleanSystem(badN, { F, gmView: true }), kael, F).unheld('f_sk', climb) === null && J(S.resolveAll(gU, kael, F, null)) === J(S.resolveAll(cleanSystem(offU, { F, gmView: true }), kael, F, null));
        check('1.6.0 Rolls unheld entries: a list with a level keeps unheld, its Unheld level (a formula, in both views; none on a list with no level or an empty one), and the players\' view drops one that reads a GM-only value; the validator reads it with the row\'s names and no dice; the one judge (unheldJudge) says why not in words that name the entry (held, on the host or as an owner\'s copy, outside the list\'s categories, no tick, not there); the resolver\'s unheld reads the entry\'s own names with Row.lvl at that level, Row.has 0, a column worked out at it, and null where the list rolls none or the level cannot be worked out; a system without it resolves as before',
            cleanOk && valOk && judgeOk && resOk, J([cleanOk, valOk, judgeOk, resOk, skG, jd(gU, 'f_sk', climb), uv && ev('Row.Eff')]));
        const shU = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), lpU = fs.readFileSync(path.join(app, 'scripts', 'libpicker.js'), 'utf8').replace(/\r\n/g, NL), ixU = fs.readFileSync(path.join(app, 'index.html'), 'utf8').replace(/\r\n/g, NL);
        const a0 = shU.indexOf('function unheldRolls('), a1 = shU.indexOf('\n}\n', shU.indexOf('function unheldOpts(')) + 3, optSrc = a0 > 0 && a1 > a0 ? shU.slice(a0, a1) : '';
        const runOpts = (client, owner, spec, rollOnly) => { const rolled = []; const o = new Function('isClient', 'myId', 'charById', 'getActiveCampaign', 'window', optSrc + NL + 'return unheldOpts;')(() => client, () => 'u_k', () => null, () => null, { wpDice: { rollFor: (cid, ex, lb, op) => { rolled.push([cid, ex, lb, op]); return {}; } } })({ id: 'c_k', ownerId: owner, values: kael.values }, { id: 'f_sk', label: 'Skills' }, spec, rollOnly, { title: 'Add to Skills', once: { x: 1 }, needs: () => [] }); return { o, rolled }; };
        const gmO = runOpts(false, 'u_other', skG, false); if (gmO.o.roll) gmO.o.roll.go('i_cl', 0, 'p_1', 'Climb');
        const plO = runOpts(true, 'u_k', skG, true), notO = runOpts(true, 'u_other', skG, false), offO = runOpts(false, 'u_k', cleanSystem(offU, { F, gmView: true }).fields[2].list, false);
        const pickOk = !!gmO.o.roll && J(gmO.o.roll.rolls) === J([{ i: 0, label: 'Check' }]) && gmO.o.roll.held.i_st === 1 && !gmO.o.roll.held.i_cl && J(gmO.rolled) === J([['c_k', '3d6 <= Row.Eff', 'Climb \u00b7 Check (unheld)', { row: { f: 'f_sk', k: 'i_cl', i: 0 } }]])
            && gmO.o.title === 'Add to Skills' && !gmO.o.rollOnly && !!plO.o.roll && plO.o.rollOnly === true && plO.o.title === 'Roll unheld on Skills' && plO.o.once === null && !('needs' in plO.o) && !notO.o.roll && !offO.o.roll;
        const edOk = lpU.includes("roll = el('button', 'tool lib-pick-roll', 'Roll unheld')") && lpU.includes("if (!opts.noQty && !opts.rollOnly) foot.appendChild(qty); if (!opts.rollOnly) foot.appendChild(add); if (rsel) foot.appendChild(rsel); if (roll) foot.appendChild(roll);")
            && lpU.includes("b.disabled = !x || !!x.hdr || held;") && !/innerHTML|insertAdjacentHTML|outerHTML/.test(lpU)
            && (shU.match(/    LP = unheldVia\(LP, c, f, spec, rollOnly\);/g) || []).length === 2 && shU.includes("function unheldVia(LP, c, f, spec, rollOnly) { return { open: function(o) { return LP.open(unheldOpts(c, f, spec, rollOnly, o)); } }; }") && shU.includes("openLibPicker(uhB, c, f, specI, carried, undefined, true);")
            && require('./checkkit').part('sysedlist.js').includes("checkLabel('sys-list-unheldon', typeof sp.unheld === 'string', 'Rolls unheld entries'") && require('./checkkit').part('sysedtabs.js').includes("else if (lcc.indexOf('sys-list-unheldlvl') >= 0 && lvD) lsp.unheld = t.value.slice(0, LIMITS.formula);")
            && require('./checkkit').part('sysederr.js').includes("errs.push({ message: 'Rolls unheld entries needs an Unheld level. Save drops the tick.' });") && ixU.includes('<b>Rolls unheld entries</b>')
            && [path.join(app, 'assets', 'whatsnew.txt'), path.join(app, '..', '..', 'WHATSNEW.txt')].map(f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, NL)).every(t => { const i = t.indexOf('Systems, more'), k = t.indexOf('- A list with a level can tick Rolls unheld entries.'); return i >= 0 && k > i && k < t.indexOf(NL + NL, i); });
        check('1.6.0 Rolls unheld entries on the sheet (sheets.js unheldOpts, run for real): the picker gets Roll unheld for the GM and the character\'s owner on a list that ticks it, the list\'s rolls by index, the entries held grayed, its press rolling the list\'s formula named Climb \u00b7 Check (unheld) with the list, the entry\'s id and the roll\'s index; opened to roll alone it says so and asks no needs; no one else and no unticked list gets it; the picker\'s button, the list\'s Roll unheld\u2026, the Lists tab\'s tick, box and words, Help and both release notes',
            pickOk && edOk, J([pickOk, edOk, gmO.o.roll && gmO.o.roll.rolls, gmO.rolled, plO.o.title]));
    }
    {   // 1.6.0 Keeps the starting level (the owner, by prompt: "Row.startlvl (Recommended)"): a row remembers the level it started at
        const J = JSON.stringify;
        const rawS = { v: 1, name: 'S', rolls: [], items: [{ id: 'i_luck', name: 'Bad luck', key: 'BadLuck', lvl: 3 }, { id: 'i_bold', name: 'Bold' }],
            fields: [{ id: 'f_dr', key: 'Flaws', label: 'Flaws', kind: 'item-list', vis: 'all', edit: 'owner', list: { lvl: { min: 0, max: 5, def: 1, start: true }, custom: true, cols: [{ key: 'Off', label: 'Bought off', formula: '(Row.startlvl - Row.lvl) * 5' }, { key: 'St', label: 'St', formula: 'Row.startlvl' }] } }], sheet: { sections: [] } };
        const gS = cleanSystem(rawS, { F, gmView: true }), pS = cleanSystem(rawS, { F, gmView: false });
        const offS = JSON.parse(J(rawS)); delete offS.fields[0].list.lvl.start; const gOff = cleanSystem(offS, { F, gmView: true });
        const cleanOk = gS.fields[0].list.lvl.start === true && pS.fields[0].list.lvl.start === true && J(cleanSystem(gS, { F, gmView: true })) === J(gS) && !('start' in gOff.fields[0].list.lvl)
            && !('start' in cleanSystem(Object.assign(JSON.parse(J(offS)), {}), { F, gmView: true }).fields[0].list.lvl) && S.validateSystem(gS, F).errors.length === 0;
        const ch = (rows, making) => ({ id: 'c_k', name: 'Kael', ownerId: 'u_k', making: making ? 1 : undefined, values: { f_dr: rows } });
        const op = (sys, c, q, o) => S.applyRowOp(sys, c, 'f_dr', q, F, o || {});
        const aOn = op(gS, ch([]), { op: 'add', defId: 'i_luck', rowId: 'w_l' }), aOff = op(gOff, ch([]), { op: 'add', defId: 'i_luck', rowId: 'w_l' });
        const cOn = op(gS, ch([]), { op: 'custom', rowId: 'w_c', def: { name: 'Own flaw' } }), cOff = op(gOff, ch([]), { op: 'custom', rowId: 'w_c', def: { name: 'Own flaw' } });
        const addOk = aOn.ok && J(aOn.value) === J([{ id: 'w_l', defId: 'i_luck', qty: 1, lvl: 3, sl: 3 }]) && J(aOff.value) === J([{ id: 'w_l', defId: 'i_luck', qty: 1, lvl: 3 }])
            && cOn.value[0].sl === 1 && !('sl' in cOff.value[0]) && J(Object.keys(cOff.value[0])) === J(Object.keys(cOn.value[0]).filter(k => k !== 'sl'));
        const play = op(gS, ch(aOn.value), { op: 'set', rowId: 'w_l', facts: { lvl: 1 } }), play2 = op(gS, ch(play.value), { op: 'set', rowId: 'w_l', facts: { lvl: 2 } });
        const mk = op(gS, ch(aOn.value, true), { op: 'set', rowId: 'w_l', facts: { lvl: 4 } }, { player: true, view: pS });
        const old = op(gS, ch([{ id: 'w_l', defId: 'i_luck', qty: 1, lvl: 4 }]), { op: 'set', rowId: 'w_l', facts: { lvl: 2 } }), oldMk = op(gS, ch([{ id: 'w_l', defId: 'i_luck', qty: 1, lvl: 4 }], true), { op: 'set', rowId: 'w_l', facts: { lvl: 2 } });
        const back = op(gS, ch(play.value), { op: 'set', rowId: 'w_l', facts: { lvl: null } }), offSet = op(gOff, ch(aOff.value), { op: 'set', rowId: 'w_l', facts: { lvl: 1 } });
        const setOk = play.value[0].lvl === 1 && play.value[0].sl === 3 && play2.value[0].sl === 3 && mk.ok && mk.value[0].lvl === 4 && mk.value[0].sl === 4 && old.value[0].sl === 4 && oldMk.value[0].sl === 2
            && back.value[0].sl === 3 && !('lvl' in back.value[0]) && J(offSet.value) === J([{ id: 'w_l', defId: 'i_luck', qty: 1, lvl: 1 }]);
        const cR = S.cleanChar(ch(play.value), gS, { state: 'host' }), rv = S.resolveAll(gS, cR, F, null), cell = id => rv.f_dr.cells[id];
        const cOffR = S.cleanChar(ch(play.value), gOff, { state: 'host' }), rvOff = S.resolveAll(gOff, cOffR, F, null);
        const own = S.charFor(cR, pS, 'u_k'), rvP = S.resolveAll(pS, own, F, null);
        const resOk = cR.values.f_dr[0].sl === 3 && cell('w_l')[0].value === 10 && cell('w_l')[1].value === 3 && rvOff.f_dr.cells.w_l[0].value === 0 && rvOff.f_dr.cells.w_l[1].value === 1
            && own.values.f_dr[0].sl === 3 && rvP.f_dr.cells.w_l[0].value === 10;
        const keyS = JSON.parse(J(rawS)); keyS.fields[0].list.stats = [{ key: 'StartLvl', label: 'Start' }]; keyS.items[0].stats = { StartLvl: 9 };
        const gK = cleanSystem(keyS, { F, gmView: true }), rvK = S.resolveAll(gK, S.cleanChar(ch(play.value), gK, { state: 'host' }), F, null);
        const noLvl = cleanSystem({ v: 1, name: 'N', rolls: [], fields: [{ id: 'f_g', key: 'Gear', kind: 'item-list', list: { cols: [{ key: 'S', label: 'S', formula: 'Row.startlvl' }] } }], sheet: { sections: [] } }, { F, gmView: true });
        const softOk = S.ROW_WORDS.startlvl === 1 && gK.fields[0].list.stats.length === 1 && rvK.f_dr.cells.w_l[1].value === 9 && S.validateSystem(gK, F).errors.length === 0
            && S.cleanItemKey('StartLvl', F) === 'StartLvl' && S.validateSystem(noLvl, F).errors.length > 0
            && S.cleanCharItem({ rid: 'e12345678', charId: 'c_1', fieldId: 'f_dr', op: 'add', defId: 'i_luck', rowId: 'w_x', sl: 9 }).sl === undefined;
        const shS = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), ixS = fs.readFileSync(path.join(app, 'index.html'), 'utf8').replace(/\r\n/g, NL);
        const notesS = [path.join(app, 'assets', 'whatsnew.txt'), path.join(app, '..', '..', 'WHATSNEW.txt')].map(f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, NL));
        const edOk = require('./checkkit').part('sysedlist.js').includes("checkLabel('sys-list-lvlstart', lv.start === true, 'Keeps the starting level'") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-lvlstart') >= 0) { if (lsc.lvl && typeof lsc.lvl === 'object') { if (t.checked) lsc.lvl.start = true; else delete lsc.lvl.start; } }")
            && require('./checkkit').part('sysederr.js').includes("message: 'Row.startlvl reads each row\\u2019s level now. Tick Keeps the starting level, and new rows remember the level they start at.'") && ixS.includes('<b>Keeps the starting level</b>')
            && notesS.every(t => { const i = t.indexOf('Systems, more'), k = t.indexOf('- A list\'s level can tick Keeps the starting level.'); return i >= 0 && k > i && k < t.indexOf(NL + NL, i); });
        check('1.6.0 Keeps the starting level: lvl.start is kept by cleanLvlSpec in both views, absent unticked; a row added or made the character\'s own on such a list is stamped sl, the level it starts at (an unticked list stores what it always did, key for key); a level changed in play keeps it, one changed while the character is being made moves it, a row made before the tick is stamped by its first change in play',
            cleanOk && addOk && setOk, J([cleanOk, addOk, setOk, aOn.value, cOn.value, play.value, mk.value, old.value, oldMk.value]));
        check('1.6.0 Row.startlvl: a column reads where a row started, (Row.startlvl - Row.lvl) * 5 prices a drawback bought down from 3 to 1 as 10, on the host and on the owner\'s copy (projFacts carries sl); unticked it reads the level now; a list that keys a stat StartLvl reads its stat (a soft row word, as Row.made); the validator knows it only on a list with a level; the wire never carries sl; the Lists tab\'s tick, its warning, Help and both release notes',
            resOk && softOk && edOk, J([resOk, softOk, edOk, rv.f_dr.cells, rvOff.f_dr.cells, rvP.f_dr && rvP.f_dr.cells, rvK.f_dr.cells]));
    }
    {   // 205 (1) (the core handbook session's parts brief, 2026-10-29): Row.parts.max.<w> and Row.parts.min.<w>, the highest and the lowest one part gives
        const J = JSON.stringify;
        const rawX = { v: 1, name: 'X', rolls: [], items: [{ id: 'i_wp', name: 'Staff', category: 'Weapon' }, { id: 'i_hd', name: 'Head', category: 'Comp', stats: { Dmg: 5, Reach: 1 } }, { id: 'i_sh', name: 'Shaft', category: 'Comp', stats: { Dmg: 1, Reach: 2 } }, { id: 'i_wt', name: 'Weight', category: 'Comp', stats: { Dmg: 3, Reach: -1 } }],
            fields: [{ id: 'f_n', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm' }, { id: 'f_pl', key: 'Plain', label: 'Plain', kind: 'number', vis: 'all' },
                { id: 'f_w', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', edit: 'owner', list: { parts: { from: 'f_c' }, cols: [{ key: 'Hi', label: 'Hi', formula: 'Row.parts.max.Dmg' }, { key: 'Lo', label: 'Lo', formula: 'Row.parts.min.Dmg' }, { key: 'Sum', label: 'Sum', formula: 'Row.parts.Dmg' }, { key: 'HiW', label: 'HiW', formula: 'Row.parts.max.Wt' }, { key: 'LoR', label: 'LoR', formula: 'Row.parts.min.Reach' }] } },
                { id: 'f_c', key: 'Comps', label: 'Comps', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Dmg', label: 'Dmg' }, { key: 'Reach', label: 'Reach' }, { key: 'Kind', label: 'Kind', kind: 'pick', opts: [{ label: 'A', name: 'Plain' }, { label: 'B', name: 'Plain' }] }], cols: [{ key: 'Wt', label: 'Wt', formula: 'Row.Dmg * 2' }] } }], sheet: { sections: [] } };
        const gX = cleanSystem(rawX, { F, gmView: true });
        const ch = { id: 'c1', values: { f_w: [{ id: 'w_1', defId: 'i_wp', qty: 1 }, { id: 'w_2', defId: 'i_wp', qty: 1 }], f_c: [{ id: 'w_h', defId: 'i_hd', qty: 2, in: 'w_1' }, { id: 'w_s', defId: 'i_sh', qty: 1, in: 'w_1' }, { id: 'w_t', defId: 'i_wt', qty: 1, in: 'w_1' }, { id: 'w_k', defId: 'i_hd', qty: 1, in: 'w_1', hid: 1 }, { id: 'w_l', defId: 'i_wt', qty: 1 }] } };
        const cells = S.resolveAll(gX, ch, F, null).f_w.cells;
        const resOk = J(cells.w_1.map(x => x.value)) === J([5, 1, 14, 10, -1]) && J(cells.w_2.map(x => x.value)) === J([0, 0, 0, 0, 0]);
        const withCol = (fid, formula) => { const s = JSON.parse(J(gX)); s.fields.find(f => f.id === fid).list.cols.push({ key: 'Q', label: 'Q', formula }); return s; };
        const errsOf = s => S.validateSystem(s, F).errors.map(e => e.message);
        const valOk = errsOf(gX).length === 0 && /Unknown name/.test(errsOf(withCol('f_w', 'Row.parts.max.Kind')).join()) && /Unknown name/.test(errsOf(withCol('f_w', 'Row.parts.max.Nope')).join())
            && /Unknown name/.test(errsOf(withCol('f_w', 'Row.parts.mid.Dmg')).join()) && /Unknown name/.test(errsOf(withCol('f_c', 'Row.parts.max.Dmg')).join()) && /Unknown name/.test(errsOf(withCol('f_w', 'Row.parts.max.Dmg.Dmg')).join())
            && /known only in a list/.test(errsOf(Object.assign(JSON.parse(J(gX)), { fields: gX.fields.concat([{ id: 'f_z', key: 'Z', label: 'Z', kind: 'formula', vis: 'all', formula: 'Row.parts.min.Dmg' }]) })).join());
        const loopy = JSON.parse(J(gX)); loopy.fields.find(f => f.id === 'f_c').list.cols.push({ key: 'Lp', label: 'Lp', formula: 'Weapons.LpH' }); loopy.fields.find(f => f.id === 'f_w').list.cols.push({ key: 'LpH', label: 'LpH', formula: 'Row.parts.max.Lp' });
        const lpCell = S.resolveAll(loopy, ch, F, null).f_w.cells.w_1[5];
        const loopOk = S.chainsShallow(gX, F) === true && S.chainsShallow(loopy, F) === false && !!(lpCell && /loop/.test(lpCell.error));
        const gmy = JSON.parse(J(gX)); gmy.fields.find(f => f.id === 'f_c').list.cols.push({ key: 'Gs', label: 'Gs', formula: 'Secret' }); gmy.fields.find(f => f.id === 'f_w').list.cols.push({ key: 'HiG', label: 'HiG', formula: 'Row.parts.min.Gs' });
        const gmOk = J(S.gmDerivedNames(gmy, F, [{ name: 'Weapons.HiG' }, { name: 'Plain' }])) === J(['Weapons.HiG']) && S.gmDerivedNames(gX, F, [{ name: 'Weapons.Hi' }, { name: 'Weapons.Sum' }]).length === 0;
        const shX = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const LNx = new Function(require('./checkkit').cut('sysedlist.js', 'function listNamesText(', 'function checkLabel(') + '\nreturn listNamesText;')();
        const namesOk = LNx('Weapons', gX.fields[2].list).includes('Row.parts.max.\u2026 and Row.parts.min.\u2026 the highest and the lowest one part gives') && !LNx('Comps', gX.fields[3].list).includes('Row.parts');
        check('205 (1) Row.parts.max.<w> and Row.parts.min.<w>: the highest and the lowest figure one part of a host gives of a number stat or a column of the parts\' list (never times its quantity, mixed signs, a kept curse\'s part nowhere, 0 with no part); the validator knows them only in a column of a list that takes parts and never for a choice, an unknown word or a fifth segment; a loop through them is caught by the resolver and the chain reader; a GM-derived column of the parts read through them, or through Row.parts.<w>, makes the host\'s list names GM-derived (gmDerivedNames); the Lists card names them',
            resOk && valOk && loopOk && gmOk && namesOk, J([resOk, valOk, loopOk, gmOk, namesOk, cells, lpCell]));
    }
    {   // 205 (3) (the core handbook session's parts brief, 2026-10-29: Durability by material, Row.dur * Host.matMult): a part reads its host row as Host.<w>
        const J = JSON.stringify;
        const rawH = { v: 1, name: 'H', rolls: [], items: [{ id: 'i_ar', name: 'Mail', category: 'Armor', stats: { MatMult: 2, Mat: 'Steel' } }, { id: 'i_sd', name: 'Buckler', category: 'Shield', stats: { MatMult: 0.5, Mat: 'Wood' } }, { id: 'i_pl', name: 'Plate', category: 'Plate', stats: { Dur: 10 } }],
            fields: [{ id: 'f_n', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm', def: 4 }, { id: 'f_st', key: 'SteelBonus', label: 'Steel', kind: 'number', vis: 'all', def: 3 }, { id: 'f_wo', key: 'WoodBonus', label: 'Wood', kind: 'number', vis: 'all', def: 1 },
                { id: 'f_a', key: 'Armor', label: 'Armor', kind: 'item-list', vis: 'all', edit: 'owner', list: { parts: { from: 'f_p' }, stats: [{ key: 'MatMult', label: 'Mult' }, { key: 'Mat', label: 'Material', kind: 'pick', opts: [{ label: 'Steel', name: 'SteelBonus' }, { label: 'Wood', name: 'WoodBonus' }] }], cols: [{ key: 'Gauge', label: 'Gauge', formula: 'Row.MatMult * 2' }, { key: 'Prot', label: 'Prot', formula: 'Row.parts.D' }] } },
                { id: 'f_s', key: 'Shields', label: 'Shields', kind: 'item-list', vis: 'all', edit: 'owner', list: { parts: { from: 'f_p' }, stats: [{ key: 'MatMult', label: 'Mult' }] } },
                { id: 'f_p', key: 'Plates', label: 'Plates', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Dur', label: 'Dur' }], cols: [{ key: 'D', label: 'D', formula: 'Row.Dur * Host.MatMult' }, { key: 'G', label: 'G', formula: 'Host.Gauge' }, { key: 'M', label: 'M', formula: 'Host.Mat' }] } }], sheet: { sections: [] } };
        const gH = cleanSystem(rawH, { F, gmView: true });
        const ch = { id: 'c1', values: { f_a: [{ id: 'w_a', defId: 'i_ar', qty: 1 }, { id: 'w_k', defId: 'i_ar', qty: 1, hid: 1 }], f_s: [{ id: 'w_s', defId: 'i_sd', qty: 1 }], f_p: [{ id: 'w_1', defId: 'i_pl', qty: 2, in: 'w_a' }, { id: 'w_2', defId: 'i_pl', qty: 1, in: 'w_s' }, { id: 'w_3', defId: 'i_pl', qty: 1 }, { id: 'w_4', defId: 'i_pl', qty: 1, in: 'w_k' }] } };
        const rH = S.resolveAll(gH, ch, F, null), pc = rH.f_p.cells;
        const resOk = J(['w_1', 'w_2', 'w_3', 'w_4'].map(id => pc[id].map(x => x.value))) === J([[20, 4, 3], [5, 0, 0], [0, 0, 0], [0, 0, 0]]) && J(rH.f_a.cells.w_a.map(x => x.value)) === J([4, 40]);
        const withCol = (fid, formula) => { const s = JSON.parse(J(gH)); s.fields.find(f => f.id === fid).list.cols = (s.fields.find(f => f.id === fid).list.cols || []).concat([{ key: 'Q', label: 'Q', formula }]); return s; };
        const errsOf = s => S.validateSystem(s, F).errors.map(e => e.message);
        const plainErr = s => errsOf(s).join();
        const valOk = errsOf(gH).length === 0 && /Unknown name/.test(plainErr(withCol('f_p', 'Host.Nope'))) && /Unknown name/.test(plainErr(withCol('f_a', 'Host.MatMult'))) && /Unknown name/.test(plainErr(withCol('f_p', 'Host.MatMult.x')))
            && /Unknown name "Host.MatMult"/.test(plainErr(Object.assign(JSON.parse(J(gH)), { fields: gH.fields.concat([{ id: 'f_z', key: 'Z', label: 'Z', kind: 'formula', vis: 'all', formula: 'Host.MatMult' }]) })));
        const keyed = JSON.parse(J(gH)); keyed.fields.push({ id: 'f_ho', key: 'Host', label: 'Host', kind: 'number', vis: 'all', def: 7 }); keyed.fields.find(f => f.id === 'f_p').list.cols.push({ key: 'K', label: 'K', formula: 'Host.base' });
        const keyedOk = errsOf(keyed).some(e => /Host\.MatMult/.test(e)) && S.resolveAll(keyed, ch, F, null).f_p.cells.w_1[3].value === 7;
        const loopy = JSON.parse(J(gH)); loopy.fields.find(f => f.id === 'f_a').list.cols.push({ key: 'LA', label: 'LA', formula: 'Row.parts.LP' }); loopy.fields.find(f => f.id === 'f_p').list.cols.push({ key: 'LP', label: 'LP', formula: 'Host.LA' });
        const lpCell = S.resolveAll(loopy, ch, F, null).f_a.cells.w_a[2];
        const loopOk = S.chainsShallow(gH, F) === true && S.chainsShallow(loopy, F) === false && /loop/.test(lpCell.error);
        const gmy = JSON.parse(J(gH)); gmy.fields.find(f => f.id === 'f_s').list.cols = [{ key: 'GmC', label: 'GmC', formula: 'Secret' }]; gmy.fields.find(f => f.id === 'f_p').list.cols.push({ key: 'HG', label: 'HG', formula: 'Host.GmC' });
        const gmOk = J(S.gmDerivedNames(gmy, F, [{ name: 'Plates.HG' }, { name: 'SteelBonus' }])) === J(['Plates.HG']) && S.gmDerivedNames(gH, F, [{ name: 'Plates.D' }]).length === 0
            && S.validateSystem(withCol('f_p', 'Host.MatMult'), F).warnings.length === S.validateSystem(gH, F).warnings.length;
        const shH = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const LNh = new Function(require('./checkkit').cut('sysedlist.js', 'function listNamesText(', 'function checkLabel(') + '\nreturn listNamesText;')();
        const namesOk = LNh('Plates', gH.fields[5].list, true).includes('A row that is a part reads its host row as Host.<stat>') && !LNh('Plates', gH.fields[5].list, false).includes('Host')
            && require('./checkkit').part('sysedlist.js').includes("listNamesText(f.key, sp, partsHostIn(f.id))") && require('./checkkit').part('sysedtabs.js').includes("listNamesText(lcd.key, lsp, partsHostIn(lcd.id))");
        check('205 (3) Host.<w>: a column of a list another list takes parts from reads its host row, the row its in names, as that row\'s own Row.<w> (a number stat, a choice\'s value, a column), on whichever list the host is in; 0 for a loose row or a kept curse\'s part; the validator knows it only in such a column and never with a dot more, a field keyed Host keeps the name; a loop through it is caught by the resolver and the chain reader; a GM-derived column of a host makes its parts\' names GM-derived; the Lists card names it',
            resOk && valOk && keyedOk && loopOk && gmOk && namesOk, J([resOk, valOk, keyedOk, loopOk, gmOk, namesOk, pc, rH.f_a.cells, lpCell]));
    }
    {   // 1.6.0 Stands at (asked by the campaign build's session, for an implant that reads the location it sits at): Row.<by>.<w>
        const J = JSON.stringify;
        const rawA = { v: 1, name: 'At', rolls: [], sheet: { sections: [] },
            items: [{ id: 'i_arm', key: 'Arm', name: 'Arm', category: 'Spot', stats: { slot: 4 } }, { id: 'i_ut', key: 'UpperTorso', name: 'Upper Torso', category: 'Spot', stats: { slot: 8 } }, { id: 'i_vi', key: 'Vitals', name: 'Vitals', category: 'Spot', stats: { slot: 8 } },
                { id: 'i_hd', key: 'Hand', name: 'Hand', category: 'Spot', stats: { slot: 6 } }, { id: 'i_gl', key: 'Gills', name: 'Gill Slits', category: 'Spot', stats: { slot: 2 } },
                { id: 'i_lim', key: 'Limb', name: 'Steel Limb', category: 'Implant', stats: { cloc: 1 } }, { id: 'i_eye', key: 'Eyepiece', name: 'Eyepiece', category: 'Implant', stats: { cloc: 2 } }, { id: 'i_hk', key: 'Hook', name: 'Hook', category: 'Implant', stats: { cloc: 3 } },
                { id: 'i_fin', key: 'Fin', name: 'Fin', category: 'Implant', stats: { cloc: 4 } }, { id: 'i_bad', key: 'Plug', name: 'Plug', category: 'Implant', stats: { cloc: 0 } }],
            fields: [{ id: 'f_sec', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm', def: 9 },
                { id: 'f_loc', key: 'Spots', label: 'Spots', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'slot', label: 'Slot' }, { key: 'sev', label: 'Severed' }], cols: [{ key: 'Hurt', label: 'Hurt', formula: 'Row.sev * 2' }] } },
                { id: 'f_imp', key: 'Implants', label: 'Implants', kind: 'item-list', vis: 'all', edit: 'owner', list: { at: { from: 'f_loc', by: 'CLOC' }, stats: [{ key: 'cloc', label: 'Location', labels: ['None', 'Arm', 'Upper Torso', 'Hand', 'Gill Slits'] }],
                    cols: [{ key: 'Cut', label: 'Cut', formula: 'Row.cloc.sev' }, { key: 'H', label: 'H', formula: 'Row.cloc.Hurt' }, { key: 'Off', label: 'Off', formula: 'if(Row.cloc.sev >= 5, 1, 0)' }] } }] };
        const gA = cleanSystem(rawA, { F, gmView: true }), pA = cleanSystem(rawA, { F, gmView: false }), byId = (s, id) => s.fields.find(x => x.id === id);
        const chA = () => ({ id: 'c', values: { f_loc: [{ id: 'w_a', defId: 'i_arm', qty: 1, ov: { stats: { sev: 6 } } }, { id: 'w_u', defId: 'i_ut', qty: 1 }, { id: 'w_v', defId: 'i_vi', qty: 1, ov: { stats: { sev: 2 } } }, { id: 'w_g', defId: 'i_gl', qty: 1, ov: { stats: { sev: 3 } }, hid: 1 }],
            f_imp: [{ id: 'w_l', defId: 'i_lim', qty: 1 }, { id: 'w_e', defId: 'i_eye', qty: 1 }, { id: 'w_h', defId: 'i_hk', qty: 1 }, { id: 'w_f', defId: 'i_fin', qty: 1 }, { id: 'w_p', defId: 'i_bad', qty: 1 }] } });
        const cellsOf = (s, c) => { const cl = S.resolveAll(s, c, F, null).f_imp.cells; return ['w_l', 'w_e', 'w_h', 'w_f', 'w_p'].map(id => cl[id].map(x => x.value === undefined ? (x.error || null) : x.value)); };
        const gone = chA(); gone.values.f_loc = gone.values.f_loc.filter(r => r.id !== 'w_a');
        const resOk = J(cellsOf(gA, chA())) === J([[6, 12, 1], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]) && J(cellsOf(gA, gone)) === J([[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]]);
        const cleanOk = J(byId(gA, 'f_imp').list.at) === J({ from: 'f_loc', by: 'cloc' }) && J(byId(pA, 'f_imp').list.at) === J({ from: 'f_loc', by: 'cloc' }) && J(cleanSystem(gA, { F, gmView: true })) === J(gA)
            && [{ from: 'f_loc', by: 'slotless' }, { from: 'f_imp', by: 'cloc' }, { from: 'f_none', by: 'cloc' }, { by: 'cloc' }, { from: 'f_loc' }, 'junk'].every(at => { const s = JSON.parse(J(rawA)); byId(s, 'f_imp').list.at = at; return !('at' in byId(cleanSystem(s, { F, gmView: true }), 'f_imp').list); })
            && (() => { const s = JSON.parse(J(rawA)); byId(s, 'f_imp').list.stats.push({ key: 'parts', label: 'P', labels: ['A', 'B'] }, { key: 'plain', label: 'Plain' }); byId(s, 'f_imp').list.at = { from: 'f_loc', by: 'parts' }; const a = byId(cleanSystem(s, { F, gmView: true }), 'f_imp').list; byId(s, 'f_imp').list.at = { from: 'f_loc', by: 'plain' }; return !('at' in a) && !('at' in byId(cleanSystem(s, { F, gmView: true }), 'f_imp').list); })();
        const noAt = JSON.parse(J(rawA)); delete byId(noAt, 'f_imp').list.at; const gN = cleanSystem(noAt, { F, gmView: true }), gNoAt = JSON.parse(J(gA)); delete byId(gNoAt, 'f_imp').list.at;
        const plainOk = J(gN) === J(gNoAt) && J(cleanSystem(noAt, { F, gmView: false })) === J((() => { const p = JSON.parse(J(pA)); delete byId(p, 'f_imp').list.at; return p; })()) && /Unknown name/.test(S.validateSystem(gN, F).errors.map(e => e.message).join());
        const withCol = (s0, fid, formula) => { const s = JSON.parse(J(s0)); byId(s, fid).list.cols = (byId(s, fid).list.cols || []).concat([{ key: 'Q', label: 'Q', formula }]); return s; };
        const errsA = s => S.validateSystem(s, F).errors.map(e => e.message).join();
        const valOk = errsA(gA) === '' && /Unknown name/.test(errsA(withCol(gA, 'f_imp', 'Row.cloc.nope'))) && /Unknown name/.test(errsA(withCol(gA, 'f_loc', 'Row.cloc.sev'))) && /Unknown name/.test(errsA(withCol(gA, 'f_imp', 'Row.cloc.sev.x')))
            && /Unknown name/.test(errsA(Object.assign(JSON.parse(J(gA)), { fields: gA.fields.concat([{ id: 'f_z', key: 'Z', label: 'Z', kind: 'formula', vis: 'all', formula: 'Row.cloc.sev' }]) })));
        const loopy = JSON.parse(J(gA)); byId(loopy, 'f_imp').list.cols.push({ key: 'LA', label: 'LA', formula: 'Row.cloc.LB' }); byId(loopy, 'f_loc').list.cols.push({ key: 'LB', label: 'LB', formula: 'Implants.LA' });
        const lpCell = S.resolveAll(loopy, chA(), F, null).f_imp.cells.w_l.find(x => x.key === 'LA');
        const loopOk = S.chainsShallow(gA, F) === true && S.chainsShallow(loopy, F) === false && /loop/i.test(String(lpCell && lpCell.error));
        const gmL = JSON.parse(J(rawA)); byId(gmL, 'f_loc').vis = 'gm'; const gmLP = cleanSystem(gmL, { F, gmView: false }), gmLG = cleanSystem(gmL, { F, gmView: true });
        const gmC = JSON.parse(J(rawA)); byId(gmC, 'f_loc').list.cols.push({ key: 'Mark', label: 'Mark', formula: 'Secret' }); byId(gmC, 'f_imp').list.cols.push({ key: 'Seen', label: 'Seen', formula: 'Row.cloc.Mark' }); const gmCG = cleanSystem(gmC, { F, gmView: true });
        const viewOk = !byId(gmLP, 'f_loc') && !('at' in byId(gmLP, 'f_imp').list) && byId(gmLP, 'f_imp').list.cols.every(c => c.formula === null) && J(byId(gmLG, 'f_imp').list.at) === J({ from: 'f_loc', by: 'cloc' })
            && J(S.gmDerivedNames(gmCG, F, [{ name: 'Implants.Seen' }, { name: 'Implants.Cut' }])) === J(['Implants.Seen', 'Implants.Cut']) && S.gmDerivedNames(gA, F, [{ name: 'Implants.Cut' }]).length === 0
            && J(S.rowAsks(gA, byId(gA, 'f_imp'), ['Row.cloc.sev']).map(n => n.name)) === J(['Implants.count', 'Spots.count']);
        const shA = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), ixA = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        const uiOk = require('./checkkit').part('sysedlist.js').includes("atS = el('select', 'sys-list-atfrom')") && require('./checkkit').part('sysedlist.js').includes("abS = el('select', 'sys-list-atby')") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-atfrom') >= 0)") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-atby') >= 0) { if (lsc.at) lsc.at.by = t.value; }")
            && ixA.includes('Formulas of the list then read it as <code>Row.Loc.Sev</code>') && fs.readFileSync(path.join(app, '..', '..', 'CAMPAIGN_INTEGRATION.md'), 'utf8').includes('as `Row.<by>.<name>` (`Row.cloc.sev`)')
            && [path.join(app, 'assets', 'whatsnew.txt'), path.join(app, '..', '..', 'WHATSNEW.txt')].map(f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')).every(t => t.indexOf('- A row can stand at a row of another list') > 0 && t.indexOf('- A row can stand at a row of another list') < t.indexOf('WAYPOINT 1.5.'));
        check('1.6.0 Stands at: a list\'s at names another item list and a choice stat of its own (a number with value names, spelled as the list spells it), the same in both views and a fixed point; one that names no such stat (a plain number, one keyed parts), itself, a list that is not there or half of it is dropped; a row reads the row its stat names as Row.<by>.<w>, a stat or a column of that list: an implant at a severed arm (entry key Arm) reads its sev 6, Hurt 12 and Off 1, one at the Upper Torso (by the entry key UpperTorso, folded) reads 0 for an unharmed spot, one whose spot is not held (Hand), is kept from its owner (a kept curse) or names nothing (value 0, or past its names) reads 0, and so does the severed arm once it is gone; the validator knows Row.cloc.<w> only in that list and only for a name of the other list; a loop through it is caught by the resolver and the chain reader; a GM-only spot list drops at from the players\' view and blanks every column that reads it, and a spot column worked out from a GM-only value makes the implants\' names GM-derived; rowAsks asks the other list\'s count too; a system without it is byte for byte as before; the Lists tab, Help, both release notes and the guide say it',
            resOk && cleanOk && plainOk && valOk && loopOk && viewOk && uiOk, J([resOk, cleanOk, plainOk, valOk, loopOk, viewOk, uiOk, cellsOf(gA, chA()), cellsOf(gA, gone), lpCell, byId(gmLP, 'f_imp').list.cols, S.gmDerivedNames(gmCG, F, [{ name: 'Implants.Seen' }, { name: 'Implants.Cut' }]), S.rowAsks(gA, byId(gA, 'f_imp'), ['Row.cloc.sev'])]));
    }
    {   // 1.6.0 Fits where (the core handbook session's ask 18): a part where its host's list says it does not fit, on invented data
        const J = JSON.stringify;
        const mkFi = parts => ({ v: 1, name: 'Fi', rolls: [], items: [{ id: 'i_sl', name: 'Sling', category: 'Gear', stats: { Grip: 2 } }, { id: 'i_lo', name: 'Small scope', category: 'Mod', stats: { Grip: 1 } }, { id: 'i_hi', name: 'Big scope', category: 'Mod', stats: { Grip: 3 } }],
            fields: [{ id: 'f_s', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm', def: 3 }, { id: 'f_k', key: 'Knack', label: 'Knack', kind: 'number', vis: 'all', edit: 'owner', def: 2 },
                { id: 'f_g', key: 'Slings', label: 'Slings', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Grip', label: 'Grip' }], parts: parts } },
                { id: 'f_m', key: 'Mods', label: 'Mods', kind: 'item-list', vis: 'all', edit: 'owner', list: { custom: true, stats: [{ key: 'Grip', label: 'Grip' }] } }], sheet: { sections: [] } });
        const byId = (s, id) => s.fields.filter(x => x.id === id)[0], ptsOf = s => J(byId(s, 'f_g').list.parts);
        const rawA = mkFi({ from: 'f_m', fitIf: ' Row.Grip * Row.qty <= Host.Grip and Knack >= 1 ', fitIfSays: 'Too big for that grip.' }), gA = cleanSystem(rawA, { F, gmView: true }), pA = cleanSystem(rawA, { F, gmView: false });
        const rawW = mkFi({ from: 'f_m', fitIf: 'Row.Grip <= Host.Grip' }), gW = cleanSystem(rawW, { F, gmView: true }), pW = cleanSystem(rawW, { F, gmView: false });
        const rawS = mkFi({ from: 'f_m', fitIf: 'Row.Grip <= Host.Grip - Secret', fitIfSays: 'No.' }), gS = cleanSystem(rawS, { F, gmView: true }), pS = cleanSystem(rawS, { F, gmView: false });
        const rawN = mkFi({ from: 'f_m' }), gN = cleanSystem(rawN, { F, gmView: true }), pN = cleanSystem(rawN, { F, gmView: false });
        const clean = ptsOf(gA) === J({ from: 'f_m', fitIf: 'Row.Grip * Row.qty <= Host.Grip and Knack >= 1', fitIfSays: 'Too big for that grip.' }) && ptsOf(pA) === ptsOf(gA) && J(cleanSystem(pA, { F, gmView: false })) === J(pA) && J(cleanSystem(gA, { F, gmView: true })) === J(gA)
            && ptsOf(gS) === J({ from: 'f_m', fitIf: 'Row.Grip <= Host.Grip - Secret', fitIfSays: 'No.' }) && ptsOf(pS) === J({ from: 'f_m' })
            && ptsOf(cleanSystem(mkFi({ from: 'f_m', fitIf: 'Row.Grip <= d6', fitIfSays: 'No.' }), { F, gmView: true })) === J({ from: 'f_m' }) && ptsOf(cleanSystem(mkFi({ from: 'f_m', fitIf: 'Row.Grip <=' }), { F, gmView: true })) === J({ from: 'f_m' })
            && ptsOf(cleanSystem(mkFi({ from: 'f_m', fitIfSays: 'Words alone.' }), { F, gmView: true })) === J({ from: 'f_m' }) && ptsOf(gN) === J({ from: 'f_m' }) && ptsOf(pN) === J({ from: 'f_m' });
        let chF = null; const fresh = () => { chF = { id: 'c1', ownerId: 'u1', values: { f_k: 2, f_g: [{ id: 'w_s', defId: 'i_sl', qty: 1 }], f_m: [] } }; };
        const opF = (sys, q, o) => { const r = S.applyRowOp(sys, chF, 'f_m', q, F, o || {}); if (r.ok) chF.values = Object.assign({}, chF.values, { f_m: r.value }); return r.ok ? 'ok' + (r.fitSays ? ' told: ' + r.fitSays : '') : r.reason + (r.msg ? ': ' + r.msg : ''); };
        fresh(); const stepsA = [opF(gA, { op: 'add', defId: 'i_lo', rowId: 'w_1', in: 'w_s' }, { player: true, view: pA }), opF(gA, { op: 'add', defId: 'i_hi', rowId: 'w_2', in: 'w_s' }, { player: true, view: pA }),
            opF(gA, { op: 'setQty', rowId: 'w_1', qty: 3 }, { player: true, view: pA }), opF(gA, { op: 'setQty', rowId: 'w_1', qty: 2 }, { player: true, view: pA }),
            opF(gA, { op: 'custom', rowId: 'w_o', in: 'w_s', def: { name: 'Own scope', category: 'Mod', stats: { Grip: 5 } } }, { player: true, view: pA }), opF(gA, { op: 'add', defId: 'i_hi', rowId: 'w_3', in: 'w_s' })];
        const rowsA = J(chF.values.f_m.map(r => r.id + ':' + r.qty));
        fresh(); chF.values.f_k = 0; const knack0 = opF(gA, { op: 'add', defId: 'i_lo', rowId: 'w_1', in: 'w_s' }, { player: true, view: pA });
        fresh(); const words = opF(gW, { op: 'add', defId: 'i_hi', rowId: 'w_2', in: 'w_s' }, { player: true, view: pW }), noView = S.partFitSays(gW, chF, { f: byId(gW, 'f_g'), row: chF.values.f_g[0] }, byId(gW, 'f_m'), { id: 'w_x', def: { name: 'Big scope', stats: { Grip: 3 } }, qty: 1 }, F, { player: true });
        fresh(); const gmOnlyP = opF(gS, { op: 'add', defId: 'i_lo', rowId: 'w_1', in: 'w_s' }, { player: true, view: pS }); fresh(); const gmOnlyG = opF(gS, { op: 'add', defId: 'i_lo', rowId: 'w_1', in: 'w_s' });
        fresh(); const plainN = [opF(gN, { op: 'add', defId: 'i_hi', rowId: 'w_2', in: 'w_s' }, { player: true, view: pN }), opF(gN, { op: 'setQty', rowId: 'w_2', qty: 4 }, { player: true, view: pN })];
        const ops = J(stepsA) === J(['ok', 'value: Too big for that grip.', 'value: Too big for that grip.', 'ok', 'value: Too big for that grip.', 'ok told: Too big for that grip.']) && rowsA === J(['w_1:2', 'w_3:1'])
            && knack0 === 'value: Too big for that grip.' && words === 'value: Big scope does not fit Sling.'   /* 1.6.3: never the formula, moved on purpose */ && noView === 'That part does not fit there.'
            && gmOnlyP === 'ok' && gmOnlyG === 'ok told: No.' && J(plainN) === J(['ok', 'ok']);
        fresh(); const ent = (S.partFitEntry(pA, chF, 'f_m', 'w_s', { id: 'i_hi', name: 'Big scope', category: 'Mod', stats: { Grip: 3 } }, F, true) === 'Too big for that grip.') && S.partFitEntry(pA, chF, 'f_m', 'w_s', { id: 'i_lo', name: 'Small scope', stats: { Grip: 1 } }, F, true) === ''
            && S.partFitEntry(pA, chF, 'f_m', 'w_none', { id: 'i_hi', name: 'Big scope', stats: { Grip: 3 } }, F, true) === '' && S.partFitEntry(pN, chF, 'f_m', 'w_s', { id: 'i_hi', name: 'Big scope', stats: { Grip: 3 } }, F, true) === '' && S.partFitEntry(gS, chF, 'f_m', 'w_s', { id: 'i_lo', name: 'Small scope', stats: { Grip: 1 } }, F, false) === 'No.';
        const vA = S.validateSystem(gA, F), vS = S.validateSystem(gS, F), vU = S.validateSystem(cleanSystem(mkFi({ from: 'f_m', fitIf: 'Row.Grip <= Host.Nope' }), { F, gmView: true }), F);
        const val = vA.errors.length === 0 && vA.warnings.length === 0 && vS.errors.length === 0 && vS.warnings.some(w => w.prop === 'list.fitif' && /the players’ view drops it, so their parts are not judged by it/.test(w.message)) && vU.errors.some(e => e.prop === 'list.fitif' && /Unknown name "Host\.Nope"/.test(e.message));
        const shF = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), pkF = fs.readFileSync(path.join(app, 'scripts', 'libpicker.js'), 'utf8').replace(/\r\n/g, '\n');
        const wired = require('./checkkit').part('sysedlist.js').includes("pfW.appendChild(document.createTextNode('Fits where ')); pfW.appendChild(pfI);") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-partsfitif') >= 0) { if (lsc.parts) { var pfv = String(t.value || '').trim(), pfWas = typeof lsc.parts.fitIf === 'string' && !!lsc.parts.fitIf.trim(); if (pfv) lsc.parts.fitIf = pfv.slice(0, LIMITS.formula); else delete lsc.parts.fitIf; if (pfv && !pfWas && !(typeof lsc.parts.fitIfSays === 'string' && lsc.parts.fitIfSays.trim())) lsc.parts.fitIfSays = PART_FIT_WORDS;")   /* 1.6.3: its Refused with starts filled, moved on purpose */
            && shF.includes("pickerInto(add, (sysI && sysI.items) || [], fit, partsL, fitOf)") && shF.includes("if (typeof res.fitSays === 'string' && res.fitSays) toast(") && (shF.match(/fit: partIn && typeof partFitEntry === 'function' \? function\(e\)/g) || []).length === 2
            && pkF.includes("function cant(x) { return !st.opts.gm && ((missOf(x).length > 0 && !warnOf(x)) || !!fitOf(x)); }");   // 1.6.2 (167 C): needs that only warn gray nothing (moved on purpose)
        check('1.6.0 Fits where (the core handbook session\'s ask 18): a list\'s parts.fitIf, a formula with no dice read with the part\'s own names (Row.*), its would-be host\'s (Host.*) and the character\'s, trimmed and kept with its words (fitIfSays) the same in both views and a fixed point; one that rolls dice or does not parse dropped, words alone none, and one that reads a GM-only value kept for the GM and dropped from the players\' view; a list without it key for key as before. Judged where a part comes to a host: a player\'s add, a raised count and a row of their own made as a part refused in its words, else words naming the part, the host and the formula, with no view words that name nothing; the character\'s own names count; the GM\'s hand passes and is told (fitSays); a player is never held back by a formula their view does not hold; partFitEntry says the same for an entry before it is a row; the validator reads it with Row.* and Host.* and warns where it reads a GM-only value; the Lists tab\'s box, its handler, the pickers and the GM\'s notice wired',
            clean && ops && ent && val && wired, J([ptsOf(gA), ptsOf(pA), ptsOf(gS), ptsOf(pS), stepsA, rowsA, knack0, words, noView, gmOnlyP, gmOnlyG, plainN, ent, vA, vS.warnings, vU.errors, wired]));
    }
    {   // 205 (4) (the owner, 2026-10-29, by prompt: "Yes, open it"): parts of parts, Row.parts.all.<w>, the whole tree removed and brought back
        const J = JSON.stringify;
        const rawD = { v: 1, name: 'D', rolls: [], items: [{ id: 'i_ch', name: 'Chassis', category: 'Body', stats: { Wt: 10 } }, { id: 'i_ar', name: 'Arm', category: 'Limb', stats: { Wt: 4 } }, { id: 'i_hn', name: 'Hand', category: 'Limb', stats: { Wt: 1 } }, { id: 'i_fg', name: 'Finger', category: 'Limb', stats: { Wt: 0.5 } }, { id: 'i_wp', name: 'Staff', category: 'Weapon' }],
            fields: [{ id: 'f_c', key: 'Cyber', label: 'Cyber', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Wt', label: 'Wt' }, { key: 'Kind', label: 'Kind', kind: 'pick', opts: [{ label: 'A', name: 'Cyber.count' }] }], parts: { from: 'f_c', deep: true }, cols: [{ key: 'Own', label: 'Own', formula: 'Row.parts.Wt' }, { key: 'All', label: 'All', formula: 'Row.parts.all.Wt' }] } },
                { id: 'f_w', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', edit: 'owner', list: { parts: { from: 'f_k', deep: true }, cols: [{ key: 'Own', label: 'Own', formula: 'Row.parts.Wt' }, { key: 'All', label: 'All', formula: 'Row.parts.all.Wt' }] } },
                { id: 'f_k', key: 'Comps', label: 'Comps', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Wt', label: 'Wt' }], parts: { from: 'f_k', deep: true } } }], sheet: { sections: [] } };
        const gD = cleanSystem(rawD, { F, gmView: true }), pD = cleanSystem(rawD, { F, gmView: false }), fOf = (s, id) => s.fields.find(f => f.id === id);
        const flat = JSON.parse(J(gD)); delete fOf(flat, 'f_c').list.parts.deep; delete fOf(flat, 'f_k').list.parts.deep;
        const cleanOk = fOf(gD, 'f_c').list.parts.deep === true && !('deep' in fOf(gD, 'f_w').list.parts) && fOf(gD, 'f_k').list.parts.deep === true && J(fOf(pD, 'f_c').list.parts) === J(fOf(gD, 'f_c').list.parts) && J(cleanSystem(gD, { F, gmView: true })) === J(gD) && S.PART_DEPTH === 6;
        const tree = () => ({ id: 'c1', values: { f_c: [{ id: 'w_c', defId: 'i_ch', qty: 1 }, { id: 'w_a', defId: 'i_ar', qty: 1, in: 'w_c' }, { id: 'w_h', defId: 'i_hn', qty: 1, in: 'w_a' }, { id: 'w_f', defId: 'i_fg', qty: 3, in: 'w_h' }, { id: 'w_x', defId: 'i_ar', qty: 1 }],
            f_w: [{ id: 'w_w', defId: 'i_wp', qty: 1 }], f_k: [{ id: 'w_k1', defId: 'i_ar', qty: 1, in: 'w_w' }, { id: 'w_k2', defId: 'i_hn', qty: 2, in: 'w_k1' }, { id: 'w_k3', defId: 'i_fg', qty: 1, in: 'w_x9' }] } });
        const rT = S.resolveAll(gD, tree(), F, null), cc = rT.f_c.cells, wc = rT.f_w.cells;
        const resOk = J(['w_c', 'w_a', 'w_h', 'w_f', 'w_x'].map(id => cc[id].map(x => x.value))) === J([[4, 6.5], [1, 2.5], [1.5, 1.5], [0, 0], [0, 0]]) && J(wc.w_w.map(x => x.value)) === J([4, 6])
            && J(S.resolveAll(flat, tree(), F, null).f_c.cells.w_c.map(x => x.value)) === J([4, 4]);
        const opOn = (sys, ch, fid, q, o) => { const r = S.applyRowOp(sys, ch, fid, q, F, o || {}); if (r.ok) { ch.values = Object.assign({}, ch.values, { [fid]: r.value }, r.also || {}); } return r; };
        const said = r => r.ok ? 'ok' : r.reason;
        const chA = tree(), adds = [opOn(gD, chA, 'f_c', { op: 'add', defId: 'i_fg', rowId: 'w_n1', in: 'w_h' }), opOn(gD, chA, 'f_c', { op: 'add', defId: 'i_fg', rowId: 'w_n2', in: 'w_a' }, { player: true, view: pD }), opOn(flat, tree(), 'f_c', { op: 'add', defId: 'i_fg', rowId: 'w_n3', in: 'w_a' }), opOn(gD, chA, 'f_k', { op: 'add', defId: 'i_fg', rowId: 'w_n4', in: 'w_k2' })].map(said);
        const deepRows = [{ id: 'w_0', defId: 'i_ch', qty: 1 }].concat([1, 2, 3, 4, 5, 6].map(i => ({ id: 'w_' + i, defId: 'i_ar', qty: 1, in: 'w_' + (i - 1) })));
        const loopRows = [{ id: 'w_p', defId: 'i_ar', qty: 1, in: 'w_q' }, { id: 'w_q', defId: 'i_ar', qty: 1, in: 'w_p' }];
        const depthOk = J(adds) === J(['ok', 'ok', 'missing', 'ok']) && J(deepRows.map(r => S.partDepth(deepRows, r))) === J([0, 1, 2, 3, 4, 5, 6]) && S.partDepth(loopRows, loopRows[0]) === S.PART_DEPTH + 1
            && said(S.applyRowOp(gD, { id: 'c2', values: { f_c: deepRows } }, 'f_c', { op: 'add', defId: 'i_fg', rowId: 'w_z', in: 'w_5' }, F, {})) === 'ok' && said(S.applyRowOp(gD, { id: 'c2', values: { f_c: deepRows } }, 'f_c', { op: 'add', defId: 'i_fg', rowId: 'w_z', in: 'w_6' }, F, {})) === 'missing'
            && said(S.applyRowOp(gD, { id: 'c3', values: { f_c: loopRows } }, 'f_c', { op: 'add', defId: 'i_fg', rowId: 'w_z', in: 'w_p' }, F, {})) === 'missing';
        const ids = ch => J(Object.keys(ch.values).sort().map(k => [k, ch.values[k].map(r => r.id)]));
        const chR = tree(); opOn(gD, chR, 'f_c', { op: 'remove', rowId: 'w_a' }); const rmArm = ids(chR); opOn(gD, chR, 'f_w', { op: 'remove', rowId: 'w_w' }); const rmWp = ids(chR);
        const chF = tree(); opOn(flat, chF, 'f_c', { op: 'remove', rowId: 'w_c' });
        const rmOk = rmArm === J([['f_c', ['w_c', 'w_x']], ['f_k', ['w_k1', 'w_k2', 'w_k3']], ['f_w', ['w_w']]]) && rmWp === J([['f_c', ['w_c', 'w_x']], ['f_k', ['w_k3']], ['f_w', []]]) && J(chF.values.f_c.map(r => r.id)) === J(['w_h', 'w_f', 'w_x']);
        const gCu = JSON.parse(J(gD)); gCu.items[0].rm = 'curse'; const chC = tree(), rc = S.applyRowOp(gCu, chC, 'f_c', { op: 'remove', rowId: 'w_c' }, F, { player: true, view: pD });
        const kv = rc.ok ? rc.value : [], kHost = kv.find(r => r.defId === 'i_ch'), kArm = kv.find(r => r.defId === 'i_ar' && r.hid === 1), kHand = kv.find(r => r.defId === 'i_hn'), kFin = kv.find(r => r.defId === 'i_fg');
        const curseOk = rc.ok && kv.length === 5 && kHost.hid === 1 && kHost.id !== 'w_c' && kArm.in === kHost.id && kHand.in === kArm.id && kFin.in === kHand.id && [kArm, kHand, kFin].every(r => r.hid === 1 && !/^w_[ahf]$/.test(r.id)) && kv.some(r => r.id === 'w_x' && !r.in);
        const kept = S.partsKept(gD, fOf(gD, 'f_c').list, tree().values, 'w_c');
        const keptOk = J(kept.rows.map(p => [p.row.id, p.at])) === J([['w_a', 1], ['w_h', 2], ['w_f', 3]]) && J(Object.keys(S.partsTree(tree().values.f_c, 'w_c', fOf(gD, 'f_c').list, 'f_c'))) === J(['w_c', 'w_a', 'w_h', 'w_f']) && J(Object.keys(S.partsTree(tree().values.f_c, 'w_c', fOf(flat, 'f_c').list, 'f_c'))) === J(['w_c', 'w_a']);
        const chU = tree(), before = J(chU.values.f_c), keptU = S.partsKept(gD, fOf(gD, 'f_c').list, chU.values, 'w_c'), rowU = JSON.parse(J(chU.values.f_c[0]));
        opOn(gD, chU, 'f_c', { op: 'remove', rowId: 'w_c' }); const mid = J(chU.values.f_c.map(r => r.id)); const ru = opOn(gD, chU, 'f_c', { op: 'restore', rowId: 'w_c', row: rowU, at: 0, parts: keptU });
        const undoOk = mid === J(['w_x']) && ru.ok && J(chU.values.f_c) === before && S.partsPut([], { rows: [{ row: { id: 'w_s', in: 'w_t' }, at: 0 }] }, 'w_c') === 0;
        const errsOf = s => S.validateSystem(s, F).errors.map(e => e.message);
        const wPick = JSON.parse(J(gD)); fOf(wPick, 'f_c').list.cols.push({ key: 'Q', label: 'Q', formula: 'Row.parts.all.Kind' });
        const valOk = errsOf(gD).length === 0 && /Unknown name "Row.parts.all.Kind"/.test(errsOf(wPick).join()) && S.chainsShallow(gD, F) === true;
        // the sheet's pills, a level in, run for real on a page of plain objects
        const shD = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), sxD = fs.readFileSync(path.join(app, 'scripts', 'sheetexport.js'), 'utf8').replace(/\r\n/g, '\n'), csD = fs.readFileSync(path.join(app, 'style.css'), 'utf8');
        const ppD = shD.slice(shD.indexOf('// [systemcheck:partpills-start]'), shD.indexOf('// [systemcheck:partpills-end]'));
        const mkD = (tag, cls, tx) => ({ tag, className: cls || '', textContent: tx === undefined ? '' : String(tx), kids: [], childNodes: [], title: '', value: '', on: {}, appendChild(k) { this.kids.push(k); this.childNodes.push(k); return k; }, addEventListener(t, fn) { this.on[t] = fn; } });
        const PPD = new Function('el', 'opt', 'partsSrc', 'partsOf', 'rowDef', 'rowLvl', 'rowIdOf', 'statChips', 'pickerInto', 'commitItem', 'isClient', 'uid', 'openLibPicker', 'window', 'partHostOk', 'PART_DEPTH', ppD + '\nreturn { pills: partPills, hosts: partHostIds };')(
            mkD, (v, t) => Object.assign(mkD('option', '', t), { value: v }), S.partsSrc, S.partsOf, S.rowDef, S.rowLvl, S.rowIdOf, () => {}, (sel, items) => { items.forEach(it => sel.appendChild(Object.assign(mkD('option', '', it.name), { value: it.id }))); return items.length; }, () => {}, () => false, () => 'w_new', () => {}, {}, S.partHostOk, S.PART_DEPTH);
        const chP = tree(), wP = mkD('div'), wR = mkD('div'); PPD.pills(wP, chP, fOf(gD, 'f_c'), fOf(gD, 'f_c').list, gD, chP.values.f_c[0], true); PPD.pills(wR, chP, fOf(gD, 'f_c'), fOf(gD, 'f_c').list, gD, chP.values.f_c[0], false);
        const shape = n => n.className === 'sheet-part' ? 'pill:' + n.kids[0].textContent : n.className.indexOf('sheet-parts') === 0 ? [n.className].concat(n.kids.map(shape)) : n.className.indexOf('sheet-part-add') >= 0 ? 'add' : n.className;
        const deepEnd = mkD('div'); PPD.pills(deepEnd, { values: { f_c: deepRows } }, fOf(gD, 'f_c'), fOf(gD, 'f_c').list, gD, deepRows[5], true, 5);
        const drawOk = J(shape(wP.kids[0])) === J(['sheet-parts', 'pill:Arm', ['sheet-parts sheet-parts-sub', 'pill:Hand', ['sheet-parts sheet-parts-sub', 'pill:Finger', ['sheet-parts sheet-parts-sub', 'add'], 'add'], 'add'], 'add'])
            && J(shape(wR.kids[0])) === J(['sheet-parts', 'pill:Arm', ['sheet-parts sheet-parts-sub', 'pill:Hand', ['sheet-parts sheet-parts-sub', 'pill:Finger']]])
            && J(shape(deepEnd.kids[0])) === J(['sheet-parts', 'pill:Arm', 'add']) && J(PPD.hosts(gD, chP, 'f_c')) === J({ w_c: 1, w_a: 1, w_h: 1, w_f: 1, w_x: 1 }) && J(PPD.hosts(flat, chP, 'f_c')) === J({ w_c: 1, w_x: 1 })
            && require('./checkkit').part('sysedlist.js').includes("if (sp.parts.from === f.id) fl.appendChild(checkLabel('sys-list-partsdeep', sp.parts.deep === true, 'Parts hold parts',") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-partsdeep') >= 0) { if (lsc.parts) { if (t.checked) lsc.parts.deep = true; else delete lsc.parts.deep; } }")
            && sxD.includes("var sub = deep ? partNames(psp, p, dep + 1) : [];") && csD.includes('.sheet-parts.sheet-parts-sub {');
        check('205 (4) parts of parts (the owner\'s word): a list whose parts come from itself may say deep (Parts hold parts; kept only there, the same in both views); a part there holds parts of its own, six levels under its top row at most and never round a loop (partDepth), while elsewhere a part still holds none; Row.parts.all.<w> sums every level under a row, each times its own quantity, Row.parts.<w> its own parts alone, the same down another list\'s parts; removing a row takes its whole tree, through another list too, a kept curse keeping the tree under new ids as it stood; partsKept and partsPut keep and bring back the whole tree, so its Undo restores the list as it was; the validator knows Row.parts.all.<w> for a number stat or a column; the sheet draws a part\'s parts under it a level in (partPills, run for real), no add past the depth, a part of a part never among the list\'s own rows; the Lists tab\'s tick and the readable page',
            cleanOk && resOk && depthOk && rmOk && curseOk && keptOk && undoOk && valOk && drawOk, J([cleanOk, resOk, depthOk, rmOk, curseOk, keptOk, undoOk, valOk, drawOk, cc, wc.w_w, adds, rmArm, rmWp, mid, shape(wP.kids[0])]));
    }
    {   // 1.6.0 Specialties, round two (the core handbook session's answers, the campaign build's): a parent named by a choice stat or a key Parent__Spec, a family held by specialty in the name, a copy held again under a name its player wrote, the Fallback read on the parent's entry, and a three-part name on such a list finding a row by its name
        const J = JSON.stringify;
        const rawR = () => ({ v: 1, name: 'T', rolls: [], fields: [
            { id: 'f_agi', key: 'Agility', label: 'Agility', kind: 'number', def: 10, vis: 'all' },
            { id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', vis: 'all', edit: 'owner', list: { cats: ['Skill'], noQty: true, custom: true, multi: true, lvl: { label: 'Level', min: 0, max: 20, def: 1 },
                stats: [{ key: 'fbk', label: 'Fallback' }, { key: 'par', label: 'Parent', kind: 'pick', opts: [{ label: 'Blade', name: 'Agility' }] }], cols: [{ key: 'Target', label: 'Target', formula: 'if(Row.has, Row.lvl + Agility, Agility - 5)' }], specs: { of: 'par', fall: 'fbk' } } }],
            items: [
                { id: 'i_bl', key: 'Blade', name: 'Blade', category: 'Skill', vis: 'all', stats: { fbk: -2 } },
                { id: 'i_blls', key: 'Blade__Longsword', name: 'Blade: Longsword', category: 'Skill', vis: 'all', stats: { fbk: 0 } },
                { id: 'i_club', key: 'axe_mace', name: 'Club', category: 'Skill', vis: 'all', again: 'name', stats: { fbk: -1 } },
                { id: 'i_lore', key: 'Lore', name: 'Lore', category: 'Skill', vis: 'all', again: 'name' },
                { id: 'i_mel', key: 'MeleeArms', name: 'Melee Arms', category: 'Skill', vis: 'all', again: 'name' },
                { id: 'i_snk', key: 'Sneak', name: 'Sneak', category: 'Skill', vis: 'all' }] });
        const chR = () => ({ id: 'c_tov', name: 'Tov', ownerId: 'u_p', npc: false, values: { f_agi: 10, f_sk: [
            { id: 'w_a', defId: 'i_blls', qty: 1, lvl: 5 }, { id: 'w_b', def: { name: 'Shiv', category: 'Skill', stats: { par: 'Blade' } }, own: 1, qty: 1, lvl: 2 },
            { id: 'w_c', defId: 'i_club', qty: 1, lvl: 9, ov: { name: 'Club: Axe and Mace' } }, { id: 'w_d', defId: 'i_club', qty: 1, lvl: 4, ov: { name: 'Club: Baton' } },
            { id: 'w_e', defId: 'i_lore', qty: 1, lvl: 3, ov: { name: 'Starships' } }, { id: 'w_f', defId: 'i_mel', qty: 1, lvl: 6, ov: { name: 'Baton' } }, { id: 'w_g', defId: 'i_snk', qty: 1, lvl: 1 }] } });
        const gR = cleanSystem(rawR(), { F, gmView: true }), pR = cleanSystem(rawR(), { F, gmView: false }), RR = makeResolver(gR, cleanChar(chR(), gR, { state: 'gm' }), F);
        const rd = n => { const v = RR(n); return [v, RR.refs([{ name: n, value: v }])]; };
        const r4 = ['Skills.Blade.Longsword.Target', 'Skills.Blade.Shiv.Target', 'Skills.Blade.Saber.Target', 'Skills.axe_mace.Baton.Target', 'Skills.axe_mace.Tonfa.Target', 'Skills.Lore.Starships.Target'].map(rd);
        check('1.6.0 Specialties, round two, the reference: a specialty that is its own entry keyed Blade__Longsword (5 + 10 = 15), a row of the character\'s own named Shiv whose Parent choice is Blade (12), a family held by specialty in the name on its own key (Club: Baton on axe_mace, 14, while Club: Axe and Mace stands at 19), a copy held again under a name its player wrote (Lore as Starships, 13); a missing specialty reads the best row of the family plus the Fallback read on the parent\'s own entry (Blade -2 from Blade, never the 0 of the Longsword entry: 15 - 2 = 13; Club -1: 19 - 1 = 18)',
            J(r4) === J([[15, [{ s: 'as Blade: Longsword', c: 1 }]], [12, [{ s: 'as Shiv', c: 1 }]], [13, [{ s: 'as Blade: Longsword \u22122', c: 2 }]], [14, [{ s: 'as Club: Baton', c: 1 }]], [18, [{ s: 'as Club: Axe and Mace \u22121', c: 2 }]], [13, [{ s: 'as Starships', c: 1 }]]])
            && J(gR.fields[1].list.specs) === J({ of: 'par', fall: 'fbk' }) && J(pR.fields[1].list.specs) === J({ of: 'par', fall: 'fbk' }) && S.chainsShallow(gR, F) === true,
            J(r4));
        const r3 = ['Skills.axe_mace.Target', 'Skills.Baton.Target', 'Skills.Lore.Target', 'Skills.Sneak.Target', 'Skills.Stealth.Target'].map(rd), h3 = [RR('Skills.Sneak.has'), RR('Skills.Stealth.has'), RR('Skills.Baton.has'), RR('Skills.Sneak.lvl')];
        const nR = cleanSystem(Object.assign(rawR(), { fields: rawR().fields.map(f => f.id === 'f_sk' ? Object.assign({}, f, { list: Object.assign({}, f.list, { specs: undefined }) }) : f) }), { F, gmView: true }), RN3 = makeResolver(nR, cleanChar(chR(), nR, { state: 'gm' }), F);
        check('1.6.0 Specialties, round two, a three-part name on such a list: the best row of that key, not the first (Club 19, said as Club: Axe and Mace), else the best row whose own name or specialty is the key (Melee Arms held again as Baton, 16), a row read under another name said as such (Lore as Starships), a plain row said not at all (Sneak 11), none held said as untrained (Stealth 5); has and lvl read as ever; on a list without Specialties the same names read as before (the first row, a held copy unknown by its name)',
            J(r3) === J([[19, [{ s: 'as Club: Axe and Mace', c: 1 }]], [16, [{ s: 'as Baton', c: 1 }]], [13, [{ s: 'as Starships', c: 1 }]], [11, null], [5, [{ s: 'untrained Stealth', c: 3 }]]]) && J(h3) === J([true, false, true, 1])
            && RN3('Skills.axe_mace.Target') === 19 && RN3('Skills.Baton.Target') === 5 && RN3('Skills.Baton.has') === false && RN3('Skills.Blade.Saber.Target') === undefined,
            J([r3, h3, RN3('Skills.axe_mace.Target'), RN3('Skills.Baton.Target')]));
        const rawR2 = rawR(); rawR2.items.push({ id: 'i_gh', key: 'Ghost', name: 'Blade: Ghost', category: 'Skill', vis: 'gm', stats: { par: 'Blade' } });
        const gR2 = cleanSystem(rawR2, { F, gmView: true }), pR2 = cleanSystem(rawR2, { F, gmView: false }), cR2 = chR(); cR2.values.f_sk.push({ id: 'w_h', defId: 'i_gh', qty: 1, lvl: 12 });
        const own2 = charFor(cR2, pR2, 'u_p', { full: gR2, F }), RP2 = makeResolver(pR2, cleanChar(JSON.parse(J(own2)), pR2, { state: 'owner' }), F), RG2 = makeResolver(gR2, cleanChar(cR2, gR2, { state: 'gm' }), F);
        check('1.6.0 Specialties, round two, both views: a GM-only specialty entry whose Parent choice is a visible parent counts on neither machine (Blade.Ghost reads Longsword less the Fallback, 13, on the GM\'s machine and the owner\'s alike), and the owner\'s copy reads every case above as the host does',
            RG2('Skills.Blade.Ghost.Target') === 13 && RP2('Skills.Blade.Ghost.Target') === 13 && ['Skills.Blade.Longsword.Target', 'Skills.Blade.Shiv.Target', 'Skills.axe_mace.Baton.Target', 'Skills.axe_mace.Tonfa.Target', 'Skills.Lore.Starships.Target', 'Skills.Baton.Target'].every(n => RP2(n) === RG2(n)),
            J([RG2('Skills.Blade.Ghost.Target'), RP2('Skills.Blade.Ghost.Target'), RP2('Skills.Baton.Target')]));
        check('1.6.0 Specialties, round two, the helpers and the editor: specInfo reads a parent and a specialty from a choice stat, a key Parent__Spec, a name and a copy held again; the Lists tab has Parent from, and Save says when it names no choice stat',
            J(S.specInfo({ specs: {} }, { key: 'Blade__Long_Sword', name: 'x' })) === J({ p: ['blade'], s: 'longsword', n: 'x' }) && J(S.specInfo({ specs: {} }, { name: 'Club: Baton' })) === J({ p: ['club'], s: 'baton', n: 'clubbaton' }) && J(S.specInfo({ specs: {} }, { key: 'Lore', name: 'Star Ships' }, 'Lore')) === J({ p: ['lore'], s: 'starships', n: 'starships' })
            && S.specSquash('Ter\u00e4s K\u00e4si') === 'teraskasi' && S.specSquash('Jitte/Sai') === 'jittesai' && S.specInfo({ specs: {} }, { name: 'Lone' }) === null && S.specInfo({ specs: {} }, null) === null
            && require('./checkkit').part('sysedlist.js').includes("soS = el('select', 'sys-list-specof')") && require('./checkkit').part('sysederr.js').includes("['of', 'Parent from names no choice stat of this list']"));
    }
    {   // 1.6.0 Changes apply where (list.modsIf; the campaign build's ask): a formula of the holder's names and each row's own, read with no item or effect change applied; a row where it does not hold gives none of its changes
        const J = JSON.stringify;
        const rawM = (gear, garb, hex, quiet, more) => ({ v: 1, name: 'T', rolls: [], fields: [
            { id: 'f_con', key: 'Construct', label: 'Construct', kind: 'toggle', vis: 'all' },
            { id: 'f_sec', key: 'Secret', label: 'Secret', kind: 'toggle', vis: 'gm' },
            { id: 'f_car', key: 'Carry', label: 'Carry', kind: 'number', def: 10, vis: 'all' },
            { id: 'f_agi', key: 'Agility', label: 'Agility', kind: 'number', def: 10, vis: 'all' },
            { id: 'f_sly', key: 'Sly', label: 'Sly', kind: 'formula', formula: 'Secret + 1', vis: 'all' },
            { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'over', label: 'Over' }], modsIf: gear } },
            { id: 'f_wear', key: 'Garb', label: 'Garb', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'layer', label: 'Layer' }], cols: [{ key: 'Under', label: 'Under', formula: 'Row.layer - 1' }].concat(more || []), modsIf: garb } },
            { id: 'f_cur', key: 'Hexes', label: 'Hexes', kind: 'item-list', vis: 'all', edit: 'owner', list: { on: { label: 'On', def: true }, modsIf: hex } },
            { id: 'f_hid', key: 'Quiet', label: 'Quiet', kind: 'item-list', vis: 'gm', edit: 'owner', list: { modsIf: quiet } }],
            items: [
                { id: 'i_pack', name: 'Pack', vis: 'all', mods: [{ f: 'f_car', op: 'add', v: 5 }] },
                { id: 'i_vest', name: 'Vest', vis: 'all', mods: [{ f: 'f_agi', op: 'add', v: -1 }] },
                { id: 'i_plate', name: 'Plate', vis: 'all', stats: { over: 1 }, mods: [{ f: 'f_agi', op: 'add', v: 2 }] },
                { id: 'i_coat', key: 'coat', name: 'Coat', vis: 'all', stats: { layer: 1 }, mods: [{ f: 'f_agi', op: 'add', v: 100 }] },
                { id: 'i_harn', name: 'Harness', vis: 'all', stats: { layer: 1 }, mods: [{ f: 'f_wear', op: 'add', v: 5, key: 'coat', col: 'Under' }] },
                { id: 'i_hex', name: 'Hex', vis: 'all', mods: [{ f: 'f_car', op: 'add', v: 1000 }] },
                { id: 'i_hush', name: 'Hush', vis: 'gm', mods: [{ f: 'f_car', op: 'add', v: 20000 }] }] });
        const GATE = 'not Construct or Row.over > 0';
        const gM = cleanSystem(rawM(GATE, 'Row.Under < 1', 'not Row.on', 'Secret'), { F, gmView: true }), pM = cleanSystem(rawM(GATE, 'Row.Under < 1', 'not Row.on', 'Secret'), { F, gmView: false });
        const nM = cleanSystem(rawM(undefined, undefined, undefined, undefined), { F, gmView: true });
        const gi = (s, k) => (s.fields.filter(f => f.key === k)[0] || {}).list || {};
        const clM = v => (S.cleanListSpec({ stats: [{ key: 'over', label: 'Over' }], modsIf: v }, true, F) || {}).modsIf;
        check('1.6.0 Changes apply where, the cleaner: a list keeps its gate as trimmed formula text, the same in both views; one that is no text, empty or blank is none; a list with none holds no modsIf key',
            gi(gM, 'Gear').modsIf === GATE && gi(pM, 'Gear').modsIf === GATE && gi(gM, 'Garb').modsIf === 'Row.Under < 1' && gi(pM, 'Garb').modsIf === 'Row.Under < 1' && gi(pM, 'Hexes').modsIf === 'not Row.on'
            && clM('  Carry > 1  ') === 'Carry > 1' && clM('') === undefined && clM('   ') === undefined && clM(5) === undefined && clM(null) === undefined
            && !J(nM).includes('modsIf') && (S.cleanListSpec({ stats: [{ key: 'over', label: 'Over' }] }, true, F) || {}).modsIf === undefined,
            J([gi(gM, 'Gear'), gi(pM, 'Gear'), clM('  Carry > 1  ')]));
        // what cannot stand goes in both views: no formula, dice, a GM-only value read directly, through a field worked out from one, or through a column of the list; a GM-only list's gate stands
        const dM = (gear, garb, more) => { const r = rawM(gear, garb, undefined, 'Secret and Sly > 0', more); return [cleanSystem(JSON.parse(J(r)), { F, gmView: true }), cleanSystem(JSON.parse(J(r)), { F, gmView: false })]; };
        const [dg1, dp1] = dM('((', '1d6 > 2'), [dg2, dp2] = dM('Secret', 'Sly > 1'), [dg3, dp3] = dM(GATE, 'Row.Hush < 1', [{ key: 'Hush', label: 'Hush', formula: 'Secret + 0' }]), [dg4, dp4] = dM(GATE, 'Row.layer < 2', [{ key: 'Hush', label: 'Hush', formula: 'Secret + 0' }]);
        check('1.6.0 Changes apply where, what Save drops, in both views alike (modsIfOk, judged over the GM\'s view): one that does not parse, one that rolls dice, and on a list players see one that reads a GM-only value at any depth (Secret itself, Sly worked out from it, a row\'s own names where a column of the list reads one, so the owner\'s copy and the host give the same figures); a GM-only list keeps a gate that reads one, since its rows reach their owner only as amounts the host works out; a sound gate stays',
            gi(dg1, 'Gear').modsIf === undefined && gi(dp1, 'Gear').modsIf === undefined && gi(dg1, 'Garb').modsIf === undefined && gi(dp1, 'Garb').modsIf === undefined
            && gi(dg2, 'Gear').modsIf === undefined && gi(dp2, 'Gear').modsIf === undefined && gi(dg2, 'Garb').modsIf === undefined && gi(dp2, 'Garb').modsIf === undefined
            && gi(dg3, 'Garb').modsIf === undefined && gi(dp3, 'Garb').modsIf === undefined && gi(dg4, 'Garb').modsIf === undefined && gi(dg3, 'Gear').modsIf === GATE && gi(dp3, 'Gear').modsIf === GATE
            && gi(dg2, 'Quiet').modsIf === 'Secret and Sly > 0' && !dp2.fields.some(f => f.key === 'Quiet')
            && S.modsIfOk(gM, F, gM.fields.filter(f => f.key === 'Gear')[0], GATE) === true && S.modsIfOk(gM, F, gM.fields.filter(f => f.key === 'Gear')[0], 'Sly') === false && S.modsIfOk(gM, null, gM.fields[5], GATE) === false,
            J([gi(dg1, 'Gear'), gi(dg2, 'Gear'), gi(dg3, 'Garb'), gi(dg4, 'Garb'), gi(dg2, 'Quiet')]));
        // the resolver, on the host and on the owner's copy
        const chM = (con, sec) => ({ id: 'c_kael', name: 'Kael', ownerId: 'u_p', npc: false, values: { f_con: con, f_sec: !!sec,
            f_gear: [{ id: 'w_a', defId: 'i_pack', qty: 1 }, { id: 'w_b', defId: 'i_vest', qty: 1 }, { id: 'w_c', defId: 'i_plate', qty: 1 }, { id: 'w_d', def: { name: 'Charm', stats: { over: 0 }, mods: [{ f: 'f_car', op: 'add', v: 50 }] }, own: 1, qty: 1 }, { id: 'w_k', defId: 'i_pack', qty: 1, hid: 1 }],
            f_wear: [{ id: 'w_e', defId: 'i_coat', qty: 1 }, { id: 'w_f', defId: 'i_harn', qty: 1 }],
            f_cur: [{ id: 'w_h', defId: 'i_hex', qty: 1, on: true }, { id: 'w_i', defId: 'i_hex', qty: 1, on: true, keptOn: 1 }], f_hid: [{ id: 'w_j', defId: 'i_hush', qty: 1 }] } });
        const both = (c, o) => { const R = resolveAll(gM, c, F), ownC = charFor(c, pM, 'u_p', Object.assign({ full: gM }, o || { F })), RP = ownC ? resolveAll(pM, cleanChar(JSON.parse(J(ownC)), pM, { state: 'owner' }), F) : null; return { h: [R.f_car.value, R.f_agi.value], o: RP ? [RP.f_car.value, RP.f_agi.value] : null, un: ownC && ownC.unseen, cell: (R.f_wear.cells || {}).w_e }; };
        const mFlesh = both(chM(false)), mCon = both(chM(true)), mSec = both(chM(false, true)), RNone = resolveAll(nM, chM(true), F);
        check('1.6.0 Changes apply where, the resolver: judged row by row with the holder\'s names and the row\'s own, so a character that is no Construct takes every change of Gear (Carry 10 + 5 pack + 50 a row of its own + 5 a kept curse, Agility -1 vest +2 plate), and a Construct only the plate\'s, whose Over is above 0 (Carry 10, Agility +2): an item\'s changes, a row of the character\'s own and a kept curse\'s alike; the other lists keep theirs; with no gate every row gives its changes as before (Carry 22070 with every list, a Construct alike)',
            J(mFlesh.h) === J([1070, 111]) && J(mCon.h) === J([1010, 112]) && RNone.f_car.value === 22070 && RNone.f_agi.value === 111,
            J([mFlesh.h, mCon.h, RNone.f_car.value, RNone.f_agi.value]));
        check('1.6.0 Changes apply where reads the sheet before any item or effect changes it, and never loops: the coat\'s Under column, which the harness moves to 5, is read as 0 by Garb\'s gate, so the coat gives its +100; a gate that reads the very figure its own rows change (Carry < 12, while the pack makes Carry 15) reads Carry as 10 and holds; a gate that reads its own list\'s total holds too; one that cannot be worked out does not hold',
            J(mFlesh.cell) === J([{ key: 'Under', value: 5, text: '5' }]) && mFlesh.h[1] === 111
            && (() => { const g5 = cleanSystem(rawM('Carry < 12', undefined, undefined, undefined), { F, gmView: true }), c5 = { id: 'c_vesk', name: 'Vesk', ownerId: 'u_p', npc: false, values: { f_gear: [{ id: 'w_a', defId: 'i_pack', qty: 1 }] } }; const R5 = resolveAll(g5, c5, F);
                const g6 = cleanSystem(rawM('Gear.count > 0 and Carry < 11', undefined, undefined, undefined), { F, gmView: true }), R6 = resolveAll(g6, c5, F), g7 = cleanSystem(rawM('Nope > 1', undefined, undefined, undefined), { F, gmView: true }), R7 = resolveAll(g7, c5, F);
                return R5.f_car.value === 15 && !R5.f_car.error && R6.f_car.value === 15 && R7.f_car.value === 10; })(),
            J(mFlesh.cell));
        check('1.6.0 Changes apply where, the two machines: the owner\'s copy gives the host\'s very figures, for a Construct and not (the kept curse\'s +5 as the nameless amount the host works out); a curse the GM keeps on reads Row.on as off on both, so its +1000 counts on both; a GM-only list whose gate reads a GM-only value is judged on the host alone and reaches the owner as its amount (Carry 21070 on both); with the engine registered in place of charView\'s own the same',
            J(mFlesh.o) === J(mFlesh.h) && J(mCon.o) === J(mCon.h) && J(mFlesh.un) === J([{ f: 'f_car', op: 'add', v: 5 }]) && mCon.un === undefined && mSec.h[0] === 21070 && J(mSec.o) === J(mSec.h)
            && (() => { const was = S.setGateEngine(() => F), r = both(chM(true, true), {}); S.setGateEngine(null); return was === true && J(r.o) === J(r.h) && r.h[0] === 21010; })(),
            J([mFlesh, mCon, mSec]));
        // the validator: the holder's names and Row.* are known there, no dice, said as the gate's
        const vM = s => validateSystem(s, F), rawV = rawM('Row.nope + Carry2', '1d6 > 2', 'Row.on', undefined);
        const vE = vM(JSON.parse(J(rawV))), vOk = vM(gM), vG = vM(JSON.parse(J(rawM('Secret', undefined, undefined, undefined))));
        const vRow = vM(JSON.parse(J(Object.assign(rawM(undefined, undefined, undefined, undefined), { fields: rawM().fields.concat([{ id: 'f_bad', key: 'Bad', label: 'Bad', kind: 'formula', formula: 'Row.over', vis: 'all' }]) }))));
        check('1.6.0 Changes apply where, the validator: it reads the gate with the holder\'s names and the row\'s own (no error for a sound gate), says an unknown name and dice as the gate\'s ("Changes apply where: ..."), warns that Save drops one that reads a GM-only value, and Row.* is known on that list alone (a field\'s formula that reads Row.over is still an error)',
            vOk.errors.length === 0 && vE.errors.some(e => e.id === 'f_gear' && e.message === 'Changes apply where: Unknown name "Row.nope"') && vE.errors.some(e => e.id === 'f_gear' && /^Changes apply where: Unknown name "Carry2"/.test(e.message))
            && vE.errors.some(e => e.id === 'f_wear' && /^Changes apply where: Dice are not allowed/.test(e.message)) && !vE.errors.some(e => e.id === 'f_cur')
            && vG.warnings.some(e => e.id === 'f_gear' && e.message === 'Changes apply where: "Secret" is GM only: Save drops it, so the rows give their changes whatever it says.')
            && vRow.errors.some(e => e.id === 'f_bad'),
            J([vE.errors, vG.warnings, vOk.errors]));
        // the System editor, Help and the release notes
        const shM = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), ixM = fs.readFileSync(path.join(app, 'index.html'), 'utf8'), wnM = fs.readFileSync(path.join(__dirname, '..', 'WHATSNEW.txt'), 'utf8').replace(/\r\n/g, '\n'), wnM2 = fs.readFileSync(path.join(app, 'assets', 'whatsnew.txt'), 'utf8').replace(/\r\n/g, '\n');
        check('1.6.0 Changes apply where in the System editor: the Lists tab\'s box after Tradable with its handler, what refreshErrors says Save drops as the cleaner reads it, the engine registered for the host\'s hidden rows; the Lists key, Help and both release notes say it',
            require('./checkkit').part('sysedlist.js').includes("var miW = el('label', 'sys-check'), miI = el('input', 'field sys-list-modsif');") && require('./checkkit').part('sysedlist.js').includes("miW.appendChild(document.createTextNode('Changes apply where '));")
            && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-modsif') >= 0) { var miV = String(t.value || '').trim(); if (miV) lsc.modsIf = miV.slice(0, LIMITS.formula); else delete lsc.modsIf; }")
            && require('./checkkit').part('sysederr.js').includes("var cf = (clean.fields || []).filter(function(x) { return x && x.id === f.id; })[0]; if (!cf || (cf.list && cf.list.modsIf)) return;") && require('./checkkit').part('sheetlink.js').includes("if (typeof setGateEngine === 'function') setGateEngine(F);")   /* sheetlink.js, read by its own name */
            && ixM.includes('<b>Changes apply where</b><small>A row gives its changes only where this formula holds.</small>') && ixM.includes('<li><b>Changes apply where</b> is a formula that says where a list&rsquo;s rows give their changes.')
            && ixM.includes('It reads the sheet before any item or effect changes it, so a column an item change moves is read before that change.')
            && wnM.includes("- A list can say where its rows' changes apply. Changes apply where, in the") && wnM2.includes("- A list can say where its rows' changes apply. Changes apply where, in the"));
    }
    {   // 1.6.0 A blast's own Defense roll: the cleaner, what the editor says, its control and the wiring
        const j2 = JSON.stringify, cd = S.cleanBlastDefend, rb2 = v => S.cleanBlastRules(v, F);
        check('1.6.0 cleanBlastDefend: a roll by its id with what it does, yards above 0 to the hundredth and 100 at most, noFrag true only, a posture and a field by id; no roll, nothing; the rest as it was',
            j2(cd({ roll: 'r_a', yards: 2.005, noFrag: true, posture: 'lying-prone', count: 'f_d', x: 1 })) === j2({ roll: 'r_a', yards: 2.01, noFrag: true, posture: 'lying-prone', count: 'f_d' }) && j2(cd({ roll: 'r_a', yards: 900 })) === j2({ roll: 'r_a', yards: 100 }) && j2(cd({ roll: 'r_a', yards: 0, noFrag: 1, posture: '<x>', count: 'x' })) === j2({ roll: 'r_a' }) && j2(cd({ roll: 'r_a', yards: 0.001 })) === j2({ roll: 'r_a' }) && cd({ yards: 2 }) === null && cd('x') === null && !('defend' in (rb2({ fall: 'BlastDamage', defend: { yards: 2 } }) || {})) && rb2({ defend: { roll: 'r_a' } }).defend.roll === 'r_a', j2(cd({ roll: 'r_a', yards: 2.005 })));
        const shD = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), dfSrc = require('./checkkit').cut('sysedlist.js', 'function defendOpts(', "var STRAY_LINE = ");
        let dr0 = { combat: {} }, redraw = 0, marks = 0; const dfA = new Function('draft', 'markDirty', 'patchErrors', 'renderCombat', 'window', 'var DEFEND_LINE = "";\n' + dfSrc + '\nreturn { onDefendChange, defendSays };')(dr0, () => marks++, () => {}, () => redraw++, { wpSystemCore: S }), press = (c, v) => dfA.onDefendChange({ className: 'field ' + c, value: v });
        const d1 = press('sys-combat-dfroll', 'r_a'), d2 = (press('sys-combat-dfyards', '2'), press('sys-combat-dfnofrag', 'no'), press('sys-combat-dfposture', 'p_x'), press('sys-combat-dfcount', 'f_d'), j2(dr0.combat.blast.defend)), d3 = (press('sys-combat-dfnofrag', ''), press('sys-combat-dfyards', ''), j2(dr0.combat.blast.defend)), d4 = (press('sys-combat-dfroll', ''), j2(dr0.combat));
        check('1.6.0 the Defense roll\'s controls (onDefendChange, run for real): each stores what the cleaner keeps, emptying one takes it away, and no roll takes the whole away with the blast rules it left empty; another box is not theirs',
            d1 === true && d2 === j2({ roll: 'r_a', yards: 2, noFrag: true, posture: 'p_x', count: 'f_d' }) && d3 === j2({ roll: 'r_a', posture: 'p_x', count: 'f_d' }) && d4 === '{}' && redraw === 2 && dfA.onDefendChange({ className: 'sys-combat-bfuse', value: '' }) === false, j2([d2, d3, d4]));
        const say = dfA.defendSays, ok = say({ roll: 'r_a', yards: 2, posture: 'p_x', count: 'f_d' }, [{ id: 'r_a' }], { postures: [{ id: 'p_x' }] }, [{ id: 'f_d', kind: 'number' }]), gone = say({ roll: 'r_a', yards: -1, posture: 'p_x', count: 'f_d' }, [], {}, []), noR = say({ yards: 2 }, [], {}, []), big = say({ roll: 'r_a', yards: 500 }, [{ id: 'r_a' }], {}, []), none = say(undefined, [], {}, []);
        check('1.6.0 defendSays (run for real, with the cleaner itself): silent on what Save keeps and on none; a drop said as an error, what is gone as a warning, and a figure Save holds at the top said',
            ok.errs.length === 0 && ok.warns.length === 0 && gone.errs.length === 1 && gone.warns.length === 3 && noR.errs.length === 1 && /names no roll/.test(noR.errs[0].message) && /Save keeps 100/.test(big.warns[0].message) && none.errs.length === 0 && none.warns.length === 0, j2([ok, gone, noR, big]));
        const idxD = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'index.html'), 'utf8'), wnD = fs.readFileSync(path.join(__dirname, '..', 'WHATSNEW.txt'), 'utf8'), wnE = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'assets', 'whatsnew.txt'), 'utf8'), giD = fs.readFileSync(path.join(__dirname, '..', 'CAMPAIGN_INTEGRATION.md'), 'utf8');
        const wbD = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8');
        check('1.6.0 a launched round carries what its list says of it, as a throw does, so an item no drop answers asks no Defense roll', require('./checkkit').part('wbblast.js').includes('var fsL = typeof blastStats === \'function\' ? blastStats(camp.system, lr.f, d) : null;') && require('./checkkit').part('wbblast.js').includes('if (fsL.noDrop === true) po.noDrop = true;') && require('./checkkit').part('wbblast.js').includes('if (!d || b.defGo === true || b.noDrop === true ||'));
        check('1.6.0 the wiring of the Defense roll: drawn after the blast rows, its change handler and refreshErrors; Help, both release notes and the guide',
            require('./checkkit').part('sysedcombat.js').includes("if (typeof defendBox === 'function') defendBox(box,") && require('./checkkit').part('sysedtabs.js').includes('onDefendChange(t)) return;') && require('./checkkit').part('sysederr.js').includes('errorsById.blastdefend = dfS.errs') && idxD.includes('<b>A blast&rsquo;s Defense roll:</b>') && wnD.includes("A system can name a blast's own Defense roll.") && wnE.includes("A system can name a blast's own Defense roll.") && giD.includes('`combat.blast.defend`'));
    }
    {   // 1.6.2 (the CORE session's batch 6, 10): a roll's Then or an action may set off the placed blast nearest the token it is used from
        const J = v => JSON.stringify(v);
        const raw = { v: 1, name: 'M', sheet: { sections: [] }, rolls: [{ id: 'r_dis', label: 'Disarm', formula: '3d6 <= 10', then: [{ when: 'fumble', setOff: true }, { when: 'fumble', setOff: true }] }],
            fields: [{ id: 'f_k', key: 'Kit', label: 'Kit', kind: 'item-list', list: { rolls: [{ label: 'Fiddle', formula: '3d6 <= 9', then: [{ when: 'miss', setOff: true }] }] } }] };
        const sy = S.cleanSystem(raw, { F, gmView: true }), pl = S.cleanSystem(raw, { F, gmView: false }), vr = S.validateSystem(sy, F);
        const got = []; S.setSetOffSink(list => { got.push(list); return 1; });
        const ch = { id: 'c_1', values: {} }, act = { apply: [{ setOff: true }] };
        const aOn = S.applyAct(sy, ch, act, S.makeResolver(sy, ch, F), F, { self: 'w_1', selfMap: 'm_1' });
        S.setSetOffSink(() => 0); const aNone = S.applyAct(sy, ch, act, S.makeResolver(sy, ch, F), F, { self: 'w_1', selfMap: 'm_1' });
        const aNoTok = S.applyAct(sy, ch, act, S.makeResolver(sy, ch, F), F, {}); S.setSetOffSink(null);
        const wbO = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'whiteboard.js'), 'utf8'), shO = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8');
        check('1.6.2 a roll\'s Then or an action may set off the placed blast nearest the token it is used from (within 2 yards, armed or not): the cleaner keeps it once a when, on a system roll and a list\'s, in both views; applyAct hands it to the host\'s sink once the rest stands and says what came of it; with no token on the map nothing goes off; the validator asks no amount; the board, the sink and the editors are there',
            J(sy.rolls[0].then) === J([{ setOff: true, when: 'fumble' }]) && J(pl.rolls[0].then) === J([{ setOff: true, when: 'fumble' }]) && J(sy.fields[0].list.rolls[0].then) === J([{ setOff: true, when: 'miss' }])
            && aOn.ok && aOn.setOff === 1 && J(got) === J([[{ by: 'c_1', from: 'w_1', map: 'm_1' }]]) && aOn.lines.some(l => l.say === 'Set off.')
            && aNone.ok && aNone.setOff === 0 && aNone.lines.some(l => /None lies within 2 yards/.test(l.say)) && aNoTok.ok && aNoTok.lines.some(l => /No token on the map/.test(l.say))
            && !vr.errors.length && require('./checkkit').part('wbblast.js').includes('window.wpSetOffNear = function(list) {') && require('./checkkit').part('sheetlink.js').includes("setSetOffSink(function(list) { return typeof window.wpSetOffNear === 'function' ? window.wpSetOffNear(list) : 0; });")   /* sheetlink.js, read by its own name */
            && require('./checkkit').part('sysedroll.js').includes("else if (v === 'setoff') { ch.setOff = true;") && require('./checkkit').familyCount('sheets.js', "'Set off the placed blast nearest it'") === 2,
            J([sy.rolls[0].then, pl.rolls[0].then, sy.fields[0].list.rolls[0].then, aOn, aNone, aNoTok, vr.errors]));
    }
    {   // 1.6.2 (the owner, by prompt: "Yes, build it" and "One card each"): a roll that draws a card as its die, and a hand of single cards
        const J = JSON.stringify, rD = S.cleanRollDef({ id: 'r_a', label: 'Fate', formula: 'Deck.D1.last.Value >= 10', drawFirst: 'D1' }, true), rP = S.cleanRollDef({ id: 'r_a', label: 'Fate', formula: '1d6', drawFirst: 'D1' }, false);
        const bad = ['C1', 'D0', 'd1', 'D1000', '__proto__', 5, null].map(v => S.cleanRollDef({ id: 'r_a', label: 'F', formula: '1d6', drawFirst: v }, true));
        check('1.6.2 a roll may draw a card as its die: cleanRollDef keeps a system deck\'s key in both views and names the roll, so the host knows it by its press; anything else is no deck and a roll without one is as before',
            rD.drawFirst === 'D1' && rD.named === true && rP.drawFirst === 'D1' && rP.named === true && bad.every(x => !('drawFirst' in x) && !('named' in x)) && J(S.cleanRollDef({ id: 'r_a', label: 'F', formula: '1d6' }, true)) === J({ id: 'r_a', label: 'F', formula: '1d6', vis: 'all' }), J([rD, bad]));
        const shD = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').split('\r\n').join('\n'), uiD = fs.readFileSync(path.join(app, 'scripts', 'sysui.js'), 'utf8');
        check('1.6.2 the Rolls tab offers it under How it rolls, as the deck\'s name, with a deck that is gone named so; its handler sets or takes it off; and a hand\'s rows show no count and no minus or plus, in a list and a table',
            require('./checkkit').part('sysedroll.js').includes("dkO = [['', 'Rolls dice']].concat(dkR.map(function(d) { return [d.key, 'Draws a card from ' + (d.label || 'a deck') + ' first']; }));") && require('./checkkit').part('sysedroll.js').includes("dkO.push([r.drawFirst, 'A deck that is gone']);") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-roll-drawfirst') >= 0) { if (t.value) r.drawFirst = t.value; else { delete r.drawFirst; delete r.drawN; } markDirty(); renderAll(); return; }") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-roll-drawn') >= 0) { var drN = Math.floor(Number(t.value)); if (drN >= 2 && drN <= 20) r.drawN = drN; else delete r.drawN; }") && require('./checkkit').part('sysedroll.js').includes(' if (r.drawFirst) top.appendChild(drawHow(r.drawN));')
            && uiD.includes("['how', 'How it rolls', 1, ['sys-roll-drawfirst',") && shD.split("spec.noQty || (typeof isHand === 'function' && isHand(spec))").length === 4
            && new Function(shD.slice(shD.indexOf('function isHand('), shD.indexOf('\n', shD.indexOf('function isHand('))) + '\nreturn isHand;')()({ hand: {} }) === true && new Function(shD.slice(shD.indexOf('function isHand('), shD.indexOf('\n', shD.indexOf('function isHand('))) + '\nreturn isHand;')()({ hand: true }) === false, '');
    }
    {   // 1.6.2 (the owner, by prompt: "When a roll is offered"): a list roll's Shown where stands beside its Needs, in one row; and a box left empty is said in words
        const shM = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').split('\r\n').join('\n');
        check('1.6.2 a list roll\'s Shown on rows where stands in its When it can be used row beside Pressed only while and Hidden, for a roll and an action alike, and its handler finds the roll from either row; a fault for a box left empty says Nothing is set here yet',
            require('./checkkit').part('sysedlist.js').includes("ndRow.appendChild(el('span', 'sys-num-cap sys-offered', 'When it can be used')); ndRow.appendChild(rsI);") && require('./checkkit').part('sysedlist.js').includes("ndA.appendChild(el('span', 'sys-num-cap sys-offered', 'When it can be used')); ndA.appendChild(rsI);") && require('./checkkit').part('sysedtabs.js').includes("var rrw = t.closest('.sys-list-roll') || t.closest('.sys-list-needsrow'),")
            && !shM.includes('rsI.maxLength = LIMITS.formula; rw.appendChild(rsI);') && S.plainMessage({ fields: [] }, 'Roll “A”: Missing formula') === 'Roll “A”: Nothing is set here yet.' && S.plainMessage({ fields: [] }, 'Missing formula') === 'Nothing is set here yet.', '');
    }
    {   // 1.6.2 (backlog 138 (j), docs/REST_DESIGN.md fold R1; the owner, 2026-10-16, by prompt): the system's rests, the GM's alone
        const J = JSON.stringify, rs = [{ id: 'rs_a', name: ' A full night ', len: { n: 8, u: 'hour' } }, { id: 'rs_a', name: 'Twice', len: { n: 1, u: 'hour' } }, { id: 'rs_w', name: 'Watch', len: { n: 2, u: 'Watch' }, time: false },
            { id: 'rs_x', name: '', len: { n: 1, u: 'hour' } }, { id: 'bad', name: 'Bad id', len: { n: 1, u: 'hour' } }, { id: 'rs_r', name: 'Rounds', len: { n: 3, u: 'round' } }, { id: 'rs_n', name: 'Half', len: { n: 1.5, u: 'hour' } }, { id: 'rs_m', name: 'Long', len: { n: 1001, u: 'day' } }, { id: 'rs_t', name: 'True', len: { n: 1, u: 'week' }, time: true }];
        const kept = S.cleanRests(rs, ['Watch']), noUnit = S.cleanRests(rs, []), many = S.cleanRests(Array.from({ length: 12 }, (_, k) => ({ id: 'rs_' + k, name: 'R' + k, len: { n: 1, u: 'min' } })), []);
        const skips = [S.cleanRestSkip('rest', kept), S.cleanRestSkip('rs_w', kept), S.cleanRestSkip('rs_gone', kept), S.cleanRestSkip('', kept), S.cleanRestSkip(3, kept)];
        const base = { v: 1, name: 'T', fields: [{ id: 'f_h', key: 'HP', kind: 'number', def: 1 }], rests: rs, restSkip: 'rs_a' };
        const gm = cleanSystem(base, { F, gmView: true }), pl = cleanSystem(base, { F, gmView: false }), none = cleanSystem({ v: 1, name: 'T', fields: [{ id: 'f_h', key: 'HP', kind: 'number', def: 1 }] }, { F, gmView: true });
        check('backlog 138 (j) fold R1: cleanRests keeps up to 8 rests, each an id rs_ once, a name, a whole length of 1 to 1000 in minutes, hours, days, weeks or one of the system\'s own time units (never a round), and time only as false; cleanRestSkip keeps rest or a kept rest\'s id; the GM\'s view keeps both after the calendar, a players\' view neither, and a system with none has no key',
            J(kept) === J([{ id: 'rs_a', name: 'A full night', len: { n: 8, u: 'hour' } }, { id: 'rs_w', name: 'Watch', len: { n: 2, u: 'Watch' }, time: false }, { id: 'rs_t', name: 'True', len: { n: 1, u: 'week' } }]) && J(noUnit.map(r => r.id)) === J(['rs_a', 'rs_t']) && many.length === S.REST_MAX && S.REST_MAX === 8
            && J(skips) === J(['rest', 'rs_w', '', '', '']) && J(gm.rests.map(r => r.id)) === J(['rs_a', 'rs_t']) && gm.restSkip === 'rs_a' && !('rests' in pl) && !('restSkip' in pl) && !('rests' in none) && !('restSkip' in none)
            && Object.keys(gm).indexOf('rests') === Object.keys(gm).indexOf('restSkip') - 1, J([kept, skips, gm.rests, gm.restSkip, Object.keys(pl)]));
        const shR = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), rsT = require('./checkkit').part('sysedcal.js'), ra = rsT.indexOf('// [systemcheck:restsbox-start]'), rb = rsT.indexOf('// [systemcheck:restsbox-end]');
        const C2 = await import(url('calendarcore.js'));
        const box = ra > 0 && rb > ra ? new Function('cleanCalendar', 'everySecs', 'fmtSpan', 'REST_MAX', rsT.slice(ra, rb) + '\nreturn { restUnits, restPreview, restSays };')(C2.cleanCalendar, C2.everySecs, C2.fmtSpan, S.REST_MAX) : null;
        const sysB = { combat: { turn: { units: [{ key: 'Watch', label: 'Watches', secs: 7200 }, { key: 'round', label: 'Round', secs: 6 }] } }, rolls: [{ label: 'Quiet rest', every: { n: 10, u: 'min', rest: true } }, { label: 'Any time', every: { n: 1, u: 'hour' } }, { label: 'Tiny', every: { n: 1, u: 'min' } }, { label: 'No clock' }],
            rests: [{ id: 'rs_a', name: 'A full night', len: { n: 8, u: 'hour' } }, { id: 'rs_b', name: '', len: { n: 1, u: 'hour' } }, { id: 'rs_c', name: 'Odd', len: { n: 0, u: 'hour' } }, { id: 'rs_d', name: 'Gone', len: { n: 1, u: 'fortnight' } }, { id: 'rs_w', name: 'On watch', len: { n: 1, u: 'Watch' }, time: false }], restSkip: 'rs_b' };
        const units = box ? box.restUnits(sysB).map(u => u[0]) : null, pv = box ? [box.restPreview(sysB, sysB.rests[0]), box.restPreview(sysB, sysB.rests[4]), box.restPreview({}, sysB.rests[0])] : null, says = box ? box.restSays(sysB) : null;
        check('backlog 138 (j) fold R1: the Rests box (sheets.js restsbox, run for real) offers minutes, hours, days, weeks and the system\'s own time units but a round; its preview counts what the time rules By the clock give in its length from nothing, 500 at most, a rest whose time is activity leaving the rest-only rules out; what Save drops is said in words, the default too',
            J(units) === J(['min', 'hour', 'day', 'week', 'Watch']) && pv[0] === 'In 8 hours of rest, each who rests gets: Quiet rest \u00d748, Any time \u00d78, Tiny \u00d7480.' && pv[1] === 'Its 2 hours count as activity: Any time \u00d72, Tiny \u00d7120.' && pv[2] === 'In 8 hours of rest no time rule runs. Rules are set By the clock on the Rolls tab.'
            && J(says) === J(['Rest 2: it needs a name. Until it has one, Save drops it.', 'Odd: Lasts takes a whole number from 1 to 1000. Save drops it.', 'Gone: its unit is not one of the system\u2019s time units now. Save drops it.', 'A time skip counts as names a rest Save drops, so the Calendar window opens on Active.']), J([units, pv, says]));
    }
    {   // the review of 2026-11-10: a correction is no event, and the Rests box holds a press over its own redraw
        const shQ = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        check('the review of 2026-11-10, wired: while a rest cut short takes back what its start gave, a crossing, an effect\'s end and a tile\'s state only note what they see and run nothing (followQuiet, asked by each through typeof), while a posture still follows; the Rests box draws itself only once a press that began in it has landed (io.js pressHold), so a tick pressed straight after a name is typed is not lost, and every redraw of the box gives the focus back to the control that held it (io.js keepPlace), so a box clicked into keeps the cursor',
            shQ.split("(typeof followIsQuiet === 'function' && followIsQuiet())").length - 1 === 3 && shQ.includes('function followQuiet(on) { _followQuiet = Math.max(0, _followQuiet + (on ? 1 : -1)); }') && !/function postureFollow[^\n]*\n[^\n]*followIsQuiet/.test(shQ)
            && shQ.includes("import { save, toast, toastAction, pressHold, keepPlace } from './io.js';") && require('./checkkit').part('sysedcal.js').includes("? pressHold(wrap, window) : null;") && require('./checkkit').part('sysedcal.js').includes("if (!redraw) return; var again = function() { if (typeof keepPlace === 'function') keepPlace(wrap, draw); else draw(); }; if (hold && hold.busy()) hold.then(again); else again(); };"), '');
    }
    {   // 1.6.3 (docs/EDITOR_COVERAGE.md, gaps 1 to 3; Fulllion's rule that every value a system holds can be made by hand in the editor): what
        // only a file could set before. Each block runs the real renderer and the real handler on a page of plain objects, with the very shapes the
        // owner's live system holds, and then asks the cleaner whether Save keeps what the handler wrote
        const J = JSON.stringify, NLx = String.fromCharCode(10);
        const elQ = (tag, cls, txt) => ({ tag: tag, className: cls || '', textContent: txt || '', title: '', kids: [], dataset: {}, appendChild(k) { this.kids.push(k); return k; } });
        const inpQ = (cls, v, title, ph) => { const i = elQ('input', cls); i.value = v; i.title = title; i.placeholder = ph; return i; };
        const byCls = (root, c) => flatKids(root).filter(k => typeof k.className === 'string' && k.className.split(' ').indexOf(c) >= 0);
        // gap 1: the Combat tab's Blast radius. sysedlist.js blastBox drew its box, but onBlastInput's test of the box's class left radius out, so what was
        // typed never reached the draft. Every box of BLAST_BOXES is typed into here, so a box added later with the same miss fails too
        const bbSrcQ = kit.cut('sysedlist.js', '// [systemcheck:blastbox-start]', '// [systemcheck:blastbox-end]');
        const selQ = (cls, cap, opts, val, title) => { const l = elQ('label', 'sys-combat-item'); l.sel = { cls: cls, cap: cap, opts: opts, val: val, title: title }; return l; };
        let draftQ = { combat: {} }, FQ = null, fqErr = '';
        try {
            FQ = new Function('el', 'input', 'lineUnder', 'labeledSelect', 'ui', 'F', 'markDirty', 'getDraft', 'window', 'LIMITS', "'use strict';" + NLx + 'var draft = getDraft();' + NLx + bbSrcQ + NLx
                + 'return { box: blastBox, input: function(t) { draft = getDraft(); return onBlastInput(t); }, keys: BLAST_BOXES.map(function(d) { return d[0]; }) };')(
                elQ, inpQ, () => {}, selQ, () => null, () => F, () => {}, () => draftQ, { wpSystemCore: S }, LIMITS);
        } catch (e) { fqErr = String(e); }
        const RAD = 'if(Env.air = 3, BlastRadius * 2, BlastRadius)';   // the live system's own Blast radius
        let radOut = null;
        if (FQ) {
            const bx = elQ('div'); FQ.box(bx, { blast: { radius: RAD } }); const drawn = byCls(bx, 'sys-combat-bradius')[0];
            draftQ = { combat: {} }; const took = FQ.input({ className: 'sys-combat-bradius field', value: ' ' + RAD + ' ', dataset: { bk: 'radius' } }), stored = draftQ.combat.blast && draftQ.combat.blast.radius;
            const every = FQ.keys.map(k => { draftQ = { combat: {} }; FQ.input({ className: 'sys-combat-b' + k + ' field', value: '2', dataset: { bk: k } }); return [k, draftQ.combat.blast ? draftQ.combat.blast[k] : null]; });
            draftQ = { combat: { blast: { radius: RAD } } }; FQ.input({ className: 'sys-combat-bradius field', value: '', dataset: { bk: 'radius' } }); const cleared = J(draftQ.combat);
            radOut = { drawn: drawn ? [drawn.value, drawn.dataset.bk] : null, took: took, stored: stored, every: every, cleared: cleared, kept: (S.cleanBlastRules({ radius: stored }, F) || {}).radius };
        }
        check('1.6.3 gap 1, the Combat tab’s Blast radius (sysedlist.js blastBox and onBlastInput, run for real): the box shows the live system’s stored radius, what is typed there reaches the draft trimmed and Save keeps it, an emptied box takes it away, and every box of BLAST_BOXES reaches the draft',
            !fqErr && !!radOut && J(radOut.drawn) === J([RAD, 'radius']) && radOut.took === true && radOut.stored === RAD && radOut.kept === RAD && radOut.cleared === J({})
            && radOut.every.length === 8 && radOut.every.every(e => e[1] === '2') && FQ.keys.indexOf('radius') >= 0, fqErr || J(radOut));
        // gaps 2 and 3: the Lists tab's change rows (sysedlist.js listApplyEditor, with renderLists' own line of targets and sheets.js fxHolds), and the
        // input handler of the number an effect goes on with (sysedtabs.js onInput, its sys-list-applyfxn line)
        const laSrcQ = kit.cut('sysedlist.js', NLx + 'function listApplyEditor(box, rr, ri, key, sp, targets, row) {', NLx + '// [systemcheck:blastbox-start]');
        const shQx = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NLx), fxhLine = (shQx.match(/\nfunction fxHolds\(id\) \{[^\n]*\n/) || [''])[0];
        const tgLine = (kit.part('sysedlist.js').replace(/\r\n/g, NLx).match(/\n\s*var tgL = [^\n]*\n/) || [''])[0];
        const draftL = { effects: [{ id: 'e_stimk1', name: 'Stimulant: Adrenal Alacrity', val: { start: 1 } }, { id: 'e_plain', name: 'Plain' }], fields: [
            { id: 'f_hp', key: 'HP', label: 'Hit points', kind: 'resource' }, { id: 'f_st', key: 'ST', label: 'Strength', kind: 'number' }, { id: 'f_angry', key: 'Angry', label: 'Angry', kind: 'toggle' },
            { id: 'f_note', key: 'Note', label: 'Note', kind: 'text' }, { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', list: {} }] };
        let tgQ = null, LAE = null, laErr = '';
        try {
            tgQ = new Function('draft', 'APPLY_KINDS', tgLine + NLx + 'return tgL;')(draftL, S.APPLY_KINDS);
            LAE = new Function('el', 'input', 'LIMITS', 'draft', "'use strict';" + NLx + fxhLine + laSrcQ + NLx + 'return listApplyEditor;')(elQ, inpQ, LIMITS, draftL);
        } catch (e) { laErr = String(e); }
        const rowOf = (key, ch, ri) => {
            const bx = elQ('div'), rr = {}; rr[key] = [ch]; LAE(bx, rr, ri || 0, key, {}, tgQ, elQ('div')); const rw = byCls(bx, 'sys-list-applyrow')[0];
            const tg = rw ? byCls(rw, 'sys-list-applytarget')[0] : null, op = rw ? byCls(rw, 'sys-list-applyop')[0] : null, fn = rw ? byCls(rw, 'sys-list-applyfxn') : [];
            return { target: tg ? tg.value : null, opts: tg ? tg.kids.map(o => [o.value, o.textContent]) : [], op: op ? op.value : null, fxn: fn.map(i => [i.value, i.placeholder, i.title, i.maxLength]) };
        };
        // f_disadv's Temper roll and f_gear's Inject: Adrenal Alacrity, as the live system holds them, then the other cases of the number's box
        const toggleRow = laErr ? null : rowOf('then', { f: 'f_angry', formula: 'if(Row.ang > 0, 1, if(Angry, 1, 0))', set: true, when: 'miss' });
        const actRow = laErr ? null : rowOf('apply', { fx: 'e_stimk1', on: true, n: '2' }, 6);
        const more = laErr ? null : [
            rowOf('apply', { fx: 'e_stimk1', on: true }), rowOf('apply', { fx: 'e_plain', on: true, n: '3' }), rowOf('apply', { fx: 'e_plain', on: true }),
            rowOf('apply', { fx: 'e_stimk1', on: false }), rowOf('then', { fx: 'e_stimk1', on: true, n: '1', when: 'hit' })];
        const rollsTitle = 'The number the effect goes on with, as Bleeding 3. Empty: its own start. Added again while it is on, the effect\\u2019s rule says what happens';
        check('1.6.3 gap 2, a toggle as a list change’s target (sysedlist.js renderLists’ targets and listApplyEditor, run for real): the picker offers the toggles beside the pools and numbers as the Rolls tab does, never a text, and a stored toggle target shows as itself with its Set to and its amount, not as a field that is gone',
            !laErr && J(tgQ.map(f => f.id)) === J(['f_hp', 'f_st', 'f_angry']) && toggleRow.target === 'f_angry' && toggleRow.opts.some(o => o[0] === 'f_angry' && o[1] === 'Angry') && !toggleRow.opts.some(o => /gone/.test(o[1]) || o[0] === 'f_note')
            && toggleRow.op === 'set' && toggleRow.opts[0][1] === 'Pick a pool, number, toggle or counter…', laErr || J([tgQ && tgQ.map(f => f.id), toggleRow]));
        check('1.6.3 gap 3, the number an effect switched on goes on with, on a list’s action and a list roll’s Then (listApplyEditor, run for real): the stored number shows in the Rolls tab’s own box with its words, an effect that holds a number gets an empty box, a stored number on one that holds none still shows, and no box stands for an effect with neither or one switched off',
            !laErr && actRow.target === 'fx+:e_stimk1' && J(actRow.fxn) === J([['2', 'With number', JSON.parse('"' + rollsTitle + '"'), LIMITS.formula]]) && kit.part('sysedroll.js').includes(rollsTitle)
            && J(more.map(r => r.fxn.map(f => f[0]))) === J([[''], ['3'], [], [], ['1']]), laErr || J([actRow, more]));
        const tbX = kit.part('sysedtabs.js').replace(/\r\n/g, NLx), hxA = tbX.indexOf("else if (lcc.indexOf('sys-list-applyfxn') >= 0) {"), hxLine = hxA < 0 ? '' : tbX.slice(hxA, tbX.indexOf(NLx, hxA)), onAx = tbX.indexOf('function onInput(');
        const typeX = (lsp, ri, ai, k, value) => new Function('lcc', 't', 'lsp', 'LIMITS', 'if (false) {} ' + (hxLine || 'else throw new Error("the handler");') + NLx + 'else return "not mine"; return lsp;')(
            'sys-list-applyfxn field', { value: value, closest: s => s === '.sys-list-applyrow' ? { dataset: { ri: String(ri), ai: String(ai), k: k } } : null }, lsp, LIMITS);
        const lspX = { rolls: [{ label: 'Temper', then: [{ fx: 'e_stimk1', on: true, when: 'hit' }] }, { label: 'Inject', apply: [{ q: true, formula: '1' }, { fx: 'e_stimk1', on: true, n: '2' }] }] };
        let typedX = null, hxErr = '';
        try {
            typedX = [J(typeX(lspX, 1, 1, 'apply', '4').rolls[1].apply[1]), J(typeX(lspX, 0, 0, 'then', 'Row.Dose').rolls[0].then[0]), J(typeX(lspX, 1, 1, 'apply', '  ').rolls[1].apply[1]), typeX(lspX, 5, 0, 'apply', '9')];
        } catch (e) { hxErr = String(e); }
        const savedX = S.cleanSystem({ v: 1, name: 'G', effects: [{ id: 'e_stimk1', name: 'Stim', val: { start: 1 } }], fields: [{ id: 'f_angry', key: 'Angry', label: 'Angry', kind: 'toggle' }, { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', list: { rolls: [
            { label: 'Inject', apply: [{ q: true, formula: '1' }, { fx: 'e_stimk1', on: true, n: '4' }] }, { label: 'Temper', formula: '3d6 <= 10', then: [{ f: 'f_angry', formula: '1', set: true, when: 'miss' }] }] } }] }, { F, gmView: true });
        const rollsX = S.fieldById(savedX, 'f_gear').list.rolls;
        check('1.6.3 gap 3, its handler (sysedtabs.js onInput, the sys-list-applyfxn line run for real): what is typed is stored as the change’s number, on an action and on a roll’s Then, an emptied box takes it off, a row that is not there writes nothing; and Save keeps the number and a toggle target on a list’s change, as the live system holds them',
            !hxErr && hxA > onAx && onAx > 0 && typedX[0] === J({ fx: 'e_stimk1', on: true, n: '4' }) && typedX[1] === J({ fx: 'e_stimk1', on: true, when: 'hit', n: 'Row.Dose' }) && typedX[2] === J({ fx: 'e_stimk1', on: true }) && typedX[3] === undefined
            && J(rollsX[0].apply[1]) === J({ fx: 'e_stimk1', on: true, n: '4' }) && J(rollsX[1].then[0]) === J({ f: 'f_angry', formula: '1', set: true, when: 'miss' }), hxErr || J([typedX, rollsX]));
        // the review of that fold: the With number box stands inside the list card, so its form offers the row's own figures (Row.Dose) and applyAct works
        // the number out with the row's resolver. The validator's fxSays checked it with no list, so a value the form offers failed the editor's own check.
        // validcore.js now hands fxSays the list field on a list's action and Then; a system roll's Then still knows no Row.* name
        const fxV = (rolls, sysRolls) => S.validateSystem(S.cleanSystem({ v: 1, name: 'G', effects: [{ id: 'e_stimk1', name: 'Stim', val: { start: 1 } }], rolls: sysRolls || [], fields: [
            { id: 'f_fx', key: 'Fx', label: 'Effects', kind: 'effects' },
            { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', list: { stats: [{ key: 'Dose', label: 'Dose' }], rolls: rolls } }] }, { F, gmView: true }), F);
        const rowErrs = v => (v.errors || []).filter(e => /names a row|Unknown name|Row./.test(e.message || ''));
        const fxRowOk = [
            fxV([{ label: 'Inject', apply: [{ fx: 'e_stimk1', on: true, n: 'Row.Dose' }] }]),
            fxV([{ label: 'Temper', formula: '3d6 <= 10', then: [{ fx: 'e_stimk1', on: true, when: 'hit', n: 'Row.Dose * 2' }] }]),
            fxV([{ label: 'Inject', apply: [{ fx: 'e_stimk1', on: true, n: 'Row.Nope' }] }]),
            fxV([], [{ id: 'r_t', label: 'Temper', formula: '3d6 <= 10', then: [{ fx: 'e_stimk1', on: true, when: 'hit', n: 'Row.Dose' }] }])];
        check('1.6.3 the review of gap 3: a list’s action and a list roll’s Then may give an effect a number read from the row’s own figures (Row.Dose), as the box’s form offers it, and the System editor’s check takes it; a name the list does not have is still an error, and a system roll’s Then still knows no row',
            rowErrs(fxRowOk[0]).length === 0 && rowErrs(fxRowOk[1]).length === 0 && rowErrs(fxRowOk[2]).length > 0 && rowErrs(fxRowOk[3]).length > 0
            && (fxRowOk[0].errors || []).length === 0 && (fxRowOk[1].errors || []).length === 0, J(fxRowOk.map(v => v.errors)));
    }
    {   // 1.6.3 (gap 4 of docs/EDITOR_COVERAGE.md; the owner, 2026-11-19): a choice stat's option that stands for a figure of one row of
        // another list, List.Entry.Figure or, on a list with Specialties, List.Parent.Specialty.Figure. The core keeps such an option word for
        // word, the validator takes it, the resolver reads the stat through it, and the option's form writes it as the Lists tab's box then
        // reads it (the statopts line of sysedtabs.js onChange). Invented data (no game named)
        const J = JSON.stringify, C3 = await import(url('formcore.js'));
        const optsIn = [{ label: 'Knife', name: 'Skills.knife.Target' }, { label: 'Off Hand', name: 'Skills.knife.OffHand.Target' }, { label: 'Swim', name: 'Skills.swim.lvl' }, { label: 'Iron', name: 'Iron' }];
        const rawG = { v: 1, name: 'G', rolls: [], fields: [
            { id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', vis: 'all', list: { cats: ['Skill'], custom: true, lvl: { label: 'Level', min: 0, max: 30, def: 10 }, stats: [{ key: 'bonus', label: 'Bonus' }], cols: [{ key: 'Target', label: 'Target', formula: 'Row.lvl + Row.bonus' }], specs: {} } },
            { id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', list: { custom: true, stats: [{ key: 'sk', label: 'Skill', kind: 'pick', opts: optsIn }], cols: [{ key: 'Skill', label: 'Skill', formula: 'Row.sk' }] } }],
            items: [{ id: 'i_knife', name: 'Knife', key: 'knife', category: 'Skill', stats: { bonus: 1 } }, { id: 'i_swim', name: 'Swimming', key: 'swim', category: 'Skill', stats: { bonus: 0 } }] };
        const sG = cleanSystem(rawG, { F, gmView: true }), vG = validateSystem(sG, F), keptO = sG.fields.find(f => f.id === 'f_wp').list.stats[0].opts;
        const chG = { id: 'c_g', name: 'G', ownerId: '', npc: true, values: { f_sk: [{ id: 'w_s1', defId: 'i_knife', qty: 1, lvl: 12 }, { id: 'w_s2', qty: 1, lvl: 15, def: { name: 'Knife (Off Hand)', category: 'Skill', stats: { bonus: 0 } } }, { id: 'w_s3', defId: 'i_swim', qty: 1, lvl: 9 }],
            f_wp: [{ id: 'w_a', qty: 1, def: { name: 'Dagger', stats: { sk: 'Knife' } } }, { id: 'w_b', qty: 1, def: { name: 'Parrying dagger', stats: { sk: 'Off Hand' } } }, { id: 'w_c', qty: 1, def: { name: 'Float', stats: { sk: 'Swim' } } }, { id: 'w_d', qty: 1, def: { name: 'Bar', stats: { sk: 'Iron' } } }] } };
        const aG = resolveAll(sG, chG, F), cellG = ['w_a', 'w_b', 'w_c', 'w_d'].map(r => aG.f_wp.cells[r] ? aG.f_wp.cells[r][0].text : '?');
        check('gap 4: an option that stands for a row of another list (an entry\u2019s column, a specialty\u2019s, an entry\u2019s level) is kept word for word, taken by the validator and read through the stat as the formula would read it',
            J(keptO) === J(optsIn) && vG.errors.length === 0 && J(cellG) === J(['13', '15', '9', '0']), J([keptO, vG.errors, cellG]));
        const tabsS = require('./checkkit').part('sysedtabs.js'), lnA = tabsS.indexOf("stD.opts = t.value.split(',')"), lnB = lnA < 0 ? -1 : tabsS.indexOf('.slice(0, LIMITS.pickOpts);', lnA);
        const parse = lnA > 0 && lnB > lnA ? new Function('t', 'LIMITS', 'return ' + tabsS.slice(lnA + 'stD.opts = '.length, lnB) + '.slice(0, LIMITS.pickOpts);') : null;
        const lists = C3.optLists(sG, []), text0 = C3.writeOpts(optsIn.map(o => ({ label: o.label, name: o.name === o.label ? '' : o.name })));
        const rows0 = C3.readOpts(text0); rows0[3].name = C3.optRowWrite({ list: 'Skills', entry: 'swim', spec: C3.optSpecWord('free style'), fig: 'Target' });
        const back = parse ? parse({ value: C3.writeOpts(rows0) }, LIMITS) : null, sG2 = back ? cleanSystem(Object.assign({}, rawG, { fields: [rawG.fields[0], Object.assign({}, rawG.fields[1], { list: Object.assign({}, rawG.fields[1].list, { stats: [{ key: 'sk', label: 'Skill', kind: 'pick', opts: back }] }) })] }), { F, gmView: true }) : null;
        check('gap 4: what the option\u2019s picks write reaches the Lists tab\u2019s box, which reads every option back as it stood, the new one too, and Save keeps it',
            !!parse && J(parse({ value: text0 }, LIMITS)) === J(optsIn) && rows0[3].name === 'Skills.swim.FreeStyle.Target' && back[3].name === 'Skills.swim.FreeStyle.Target' && back[3].label === 'Iron'
            && sG2.fields[1].list.stats[0].opts[3].name === 'Skills.swim.FreeStyle.Target' && validateSystem(sG2, F).errors.length === 0 && lists.map(l => l.key).join() === 'Skills,Weapons', J([back, lists.map(l => l.key)]));
    }
    {   // 1.6.3 (Fulllion's rulings of 2026-11-20: "if there's other gaps where a ruling or field is dependent on another, and the system doesn't require
        // that other field to be filled then that should be fixed", "it makes sense to have fields be required when other fields depend on them", "none isn't
        // a good default substitution"): the Lists tab's boxes that another box depends on start filled, and an emptied one is said under the list as a
        // fault that holds no Save. Each part below runs the real code: the input handlers' lines of sysedtabs.js, the boxes of sysedbox.js, and
        // refreshErrors with the two helpers of sysederr.js it asks. Invented data (no game named)
        const J = JSON.stringify, NLx = String.fromCharCode(10), tabsP = kit.part('sysedtabs.js');
        // (a) a needs box's words start filled as the needs are first typed, and go with them where untouched (sysedtabs.js needsWordsFollow, run for real)
        const nwSrc = kit.cut('sysedtabs.js', 'var STAND_OFF_WORD', 'function onInput(');
        const NW = new Function(nwSrc + NLx + 'return { follow: needsWordsFollow, words: NEEDS_WORDS, figs: listRollFigs, stand: STAND_OFF_WORD, part: PART_FIT_WORDS };')();
        const rowOf = (rowCls, boxCls) => { const bx = { value: '' }; return { bx: bx, t: { closest: s => s === rowCls ? { querySelector: q => q === '.' + boxCls ? bx : null } : null } }; };
        const nwRun = (cls, o, was) => { const w = NW.words[cls], r = rowOf(w[1], w[0]); r.bx.value = typeof o.needsText === 'string' ? o.needsText : ''; NW.follow(o, was, r.t, cls); return [J(o), r.bx.value]; };
        const nwOut = Object.keys(NW.words).map(cls => [cls, nwRun(cls, { needs: 'Row.Charge > 0' }, false), nwRun(cls, { needs: 'Row.Charge > 0', needsText: 'Out of fuel' }, false), nwRun(cls, { needsText: NW.words[cls][2] }, true), nwRun(cls, { needsText: 'Out of fuel' }, true), nwRun(cls, { needs: 'Row.Charge > 1' }, true)]);
        check('1.6.3 a needs box’s words (the switch, a load, a chamber, a list roll) start filled as its needs are first typed, in the draft and in the box beside it; words typed by hand are never touched; emptied needs take the words they filled, and nothing is filled again once its words were emptied by hand',
            nwOut.length === 4 && nwOut.every(([cls, fill, typed, gone, kept, again]) => {
                const w = NW.words[cls][2]; return fill[0] === J({ needs: 'Row.Charge > 0', needsText: w }) && fill[1] === w && typed[0] === J({ needs: 'Row.Charge > 0', needsText: 'Out of fuel' }) && gone[0] === J({}) && gone[1] === '' && kept[0] === J({ needsText: 'Out of fuel' }) && again[0] === J({ needs: 'Row.Charge > 1' }); })
            && J(Object.values(NW.words).map(w => w[2])) === J(['This cannot be switched on now.', 'This cannot load now.', 'This cannot take a round now.', 'This cannot be used now.']), J(nwOut));
        // ... and the handlers' own lines ask it (each line of onInput run for real on a draft list)
        const lineOf = start => { const a = tabsP.indexOf(start); return a < 0 ? '' : tabsP.slice(a, tabsP.indexOf(NLx, a)); };
        const handle = (start, cls, lsp, value, rowCls, boxCls) => { const r = rowOf(rowCls, boxCls); r.t.value = value; r.t.closest = (s => s === rowCls ? { querySelector: q => q === '.' + boxCls ? r.bx : null, dataset: { ri: '0' } } : null);
            new Function('lcc', 't', 'lsp', 'LIMITS', 'needsWordsFollow', 'if (false) {} ' + (lineOf(start) || 'else throw new Error("no line");') + NLx + 'else return;')(cls + ' field', r.t, lsp, LIMITS, NW.follow); return [J(lsp), r.bx.value]; };
        const hOut = [
            handle("        else if (lcc.indexOf('sys-list-swneeds') >= 0", 'sys-list-swneeds', { on: { label: 'On' } }, 'Row.Charge > 0', '.sys-list-on', 'sys-list-swwords'),
            handle("        else if (lcc.indexOf('sys-list-loadneeds') >= 0", 'sys-list-loadneeds', { load: { from: 'f_m', ct: 'ch' } }, 'Row.Kind = 1', '.sys-list-load', 'sys-list-loadneedstext'),
            handle("        else if (lcc.indexOf('sys-list-chamberneeds') >= 0", 'sys-list-chamberneeds', { chamber: { from: 'f_m', cap: 1 } }, 'Row.Kind = 1', '.sys-list-chamber', 'sys-list-chamberneedstext')];
        check('1.6.3 the Lists tab’s needs handlers (sysedtabs.js onInput, the switch’s, a load’s and a chamber’s lines run for real) store the needs and fill the words beside them',
            hOut[0][0] === J({ on: { label: 'On', needs: 'Row.Charge > 0', needsText: 'This cannot be switched on now.' } }) && hOut[0][1] === 'This cannot be switched on now.'
            && hOut[1][0] === J({ load: { from: 'f_m', ct: 'ch', needs: 'Row.Kind = 1', needsText: 'This cannot load now.' } }) && hOut[2][0] === J({ chamber: { from: 'f_m', cap: 1, needs: 'Row.Kind = 1', needsText: 'This cannot take a round now.' } }), J(hOut));
        // (b) a test picked for Rolls by starts on the row's first figure, so its formula is written at once (the rolltest line, run for real)
        const rtLine = lineOf("            else if (lcc.indexOf('sys-list-rolltest') >= 0 || lcc.indexOf('sys-list-rollof') >= 0)");
        const rtRun = (lsp, cls, value) => { new Function('lcc', 't', 'rD', 'lsp', 'draft', 'listRollFigs', 'cleanTests', 'testFormula', 'markDirty', 'renderLists', 'patchErrors', 'if (false) {} ' + (rtLine || 'else throw new Error("no line");') + NLx + 'else return;')(cls, { value: value }, lsp.rolls[0], lsp, { tests: [{ key: 'T1', label: 'Check', shape: 'under', dice: '3d6' }] }, NW.figs, S.cleanTests, S.testFormula, () => {}, () => {}, () => {}); return lsp.rolls[0]; };
        const rt1 = rtRun({ stats: [{ key: 'Kind', kind: 'pick' }, { key: 'Skill', label: 'Skill' }], cols: [{ key: 'Total' }], rolls: [{ label: 'Use', formula: '' }] }, 'sys-list-rolltest', 'T1');
        const rt2 = rtRun({ stats: [{ key: 'Skill' }, { key: 'Edge' }], rolls: [{ label: 'Use', test: 'T1', of: 'Edge' }] }, 'sys-list-rolltest', 'T1');
        const rt3 = rtRun({ stats: [{ key: 'Kind', kind: 'pick' }], rolls: [{ label: 'Use' }] }, 'sys-list-rolltest', 'T1');
        check('1.6.3 Rolls by: a test picked starts on the row’s first number stat or column, as the with list offers them, and its formula is written; a figure already picked stays; a list with none leaves it for the fault to say',
            rt1.test === 'T1' && rt1.of === 'Skill' && /Row\.Skill/.test(rt1.formula || '') && rt2.of === 'Edge' && rt3.test === 'T1' && !('of' in rt3)
            && J(NW.figs({ stats: [{ key: 'A', kind: 'text' }, { key: 'B' }], cols: [{ key: 'C' }] })) === J(['B', 'C']), J([rt1, rt2, rt3]));
        // (c) what refreshErrors says of an emptied box, with the box it names (the real refreshErrors, its two helpers and the cleaner)
        const reQ = require('./checkkit').cutEnd('sysederr.js', '\nfunction refreshErrors() {').replace(/\n$/, '');
        const runQ = draft => new Function('draft', 'F', 'validKey', 'KINDS', 'cleanItemKey', 'cleanSystem', 'validateSystem', 'statKey', 'LIMITS', 'getActiveCampaign', 'systemOf', 'gmViewFields', 'gmDerivedNames', 'TIME_WORDS', 'cleanFieldUnit', 'cleanFieldLock', 'cleanFormulaText', 'hasDice', 'standSays', 'modsIfOk', 'FEEDS_MAX',
            'var errorsById = {}, warningsById = {};\n' + reQ + '\nrefreshErrors(); return { e: errorsById, w: warningsById };')(draft, () => F, S.validKey, S.KINDS, S.cleanItemKey, S.cleanSystem, S.validateSystem, S.statKey, S.LIMITS, () => ({ chars: {} }), () => null, S.gmViewFields, S.gmDerivedNames, S.TIME_WORDS, S.cleanFieldUnit, S.cleanFieldLock, S.cleanFormulaText, S.hasDice,
            new Function(kit.cut('sysedtabs.js', '// [bodycheck:standsays-start]', '// [bodycheck:standsays-end]') + NLx + 'return standSays;')(), S.modsIfOk, S.FEEDS_MAX);
        const mag = { id: 'f_mag', key: 'Mags', label: 'Mags', kind: 'item-list', list: { lvl: { label: 'Rounds', min: 0 }, stats: [{ key: 'Cal', label: 'Caliber' }] } };
        const gun = { id: 'f_gun', key: 'Guns', label: 'Guns', kind: 'item-list', list: {
            stats: [{ key: 'Cal', label: 'Caliber' }, { key: 'Slots', label: 'Slots' }, { key: 'Tone', label: 'Tone', kind: 'pick', opts: [{ label: 'Steel' }] }], counters: [{ key: 'ch', label: 'Charge' }, { key: 'f2', label: 'Feed' }],
            on: { label: 'On', needs: 'Row.ch > 0', icon: 'icon:bolt' },
            load: { from: 'f_mag', ct: 'ch', needs: 'Row.ch >= 0', by: 'Cal' },
            feeds: [{ key: 'Cell', from: 'f_mag', ct: 'f2', by: 'Nope', to: 'Cal' }],
            chamber: { from: 'f_mag', cap: 1, needsText: 'No round fits.', by: 'Cal' },
            stand: { from: 'f_mag', counts: 'Row.Cal > 0' },
            rolls: [{ label: 'Shoot', formula: '3d6 <= 10', needs: 'Row.ch > 0', dtype: 'stun', dkind: 'cut', test: 'T1' }, { label: 'Fix', apply: [{ s: 'Slots', formula: '1', add: true }], needsText: 'Not jammed', hideOff: true }, { label: 'Aim', formula: '3d6 <= 10', test: 'Gone' }],
            parts: { from: 'f_mag', fitIf: 'Row.Cal = Host.Cal', fitMore: [{ 'if': 'Row.Cal > 0' }, { says: 'Too big' }], caps: [{ cats: [], by: '' }] },
            badges: [{ words: 'Jammed', 'if': '' }, { words: '', 'if': 'Row.ch = 0' }, { words: 'Hot', 'if': '1d6 > 3' }],
            onTrade: [{ s: 'Cal', to: 'Cal' }, { s: 'Tone' }],
            lay: { from: 'f_mag', rules: [{ cats: [], each: 'row' }] },
            look: { by: 'Tone' } } };
        const outQ = runQ({ name: 'D', rolls: [], items: [], tests: [{ key: 'T1', label: 'Check', shape: 'under', dice: '3d6' }], sheet: { sections: [] }, fields: [mag, gun] }), says = (outQ.e['list:f_gun'] || []).map(x => [x.prop || '', x.message]);
        const want = [
            // 1.6.3 (the review of the Lists tab's fix): the words read as a sentence, has no words, where they read Its words is empty before
            ['list.swwords', 'Needs to switch on has no words. Say in plain words why a row cannot be switched on now, or a player is told only Not now.'],
            ['list.swicon', 'The switch’s icon shows only with a word while off, so Save drops the icon. Write a word while off to keep it.'],
            ['list.loadwords', 'Loads only where has no words. Say in plain words why a load is refused, or a player is told only Not now.'],
            ['list.chamberwords', 'Chambers only where has words but no test beside them, so Save drops its words.'],
            ['list.loadmatch', 'Matched by needs a stat of this list and a stat of the list it loads from. Save drops it, and the row loads anything its categories take.'],
            ['list.feedmatch.0', 'Feed 1: Matched by names no stat of this list. Save drops it, and the row loads anything its categories take.'],
            // the review of the Lists tab's fix: Chambers from's Matched by, kept by the cleaner as a load's is, lands on its own box and says what the row then chambers
            ['list.chambermatch', 'Chambers from: Matched by needs a stat of this list and a stat of the round’s list. Save drops it, and the row chambers anything its categories take.'],
            // ... and Counts where's Otherwise it says lands on its own box (it was a line of standSays with no box of its own)
            ['list.standoff', 'Counts where: Otherwise it says is empty. Name what a placed row says while it does not count, such as Not worn.'],
            ['list.needstext.0', 'Roll 1, Shoot: the words for the grayed button are empty. Say in plain words why it cannot be used now, or a player is told only Not now.'],
            // the review of the Lists tab's fix: these name their roll by its place, which sysui.js reads from each box's data-ri
            ['list.dtype.0', 'Roll 1, Shoot: a damage type needs Damage ticked, so Save drops it.'],
            ['list.dkind.0', 'Roll 1, Shoot: a kind of blow needs Damage ticked, so Save drops it.'],
            ['list.rollof.0', 'Roll 1, Shoot: Rolls by needs the row’s figure it is made with. Pick it, or Save drops the test and the roll keeps its own formula.'],
            ['list.rolltest.2', 'Roll 3, Aim: Rolls by names a test that is gone. Save drops it, and the roll keeps its own formula.'],
            ['list.needstext.1', 'Action 2, Fix: the words for the grayed button need Needs beside them, so Save drops the words.'],
            ['list.hideoff.1', 'Action 2, Fix: Hidden until it can be used needs Needs beside it, so Save drops the tick.'],
            ['list.layrcats.0', 'By category: no rule names a category, so Save drops them all and this list lays a row for every row of Mags.'],
            ['list.fitwords', 'Fits where: Refused with is empty. A player it stops is told only that the part does not fit.'],
            ['list.pfitwords.0', 'Fits where, rule 2: Refused with is empty. A player it stops is told only that the part does not fit.'],
            ['list.pfit.1', 'Fits where, rule 3 has words but no test, so Save drops it.'],
            ['list.pcap.0', 'Holds by kind, line 1 counts nothing yet. Name its categories, or pick the value it counts, or Save drops the line.'],
            ['list.pcap.0', 'Holds by kind, line 1 says no how many yet. Pick the row’s stat or write a formula, or Save drops the line.'],
            ['list.badge.0', 'Badge 1 (Jammed) has no Shown where, so it never shows and Save drops it. Say when it shows.'],
            ['list.badgewords.1', 'Badge 2 says nothing, so Save drops it. Give it words.'],
            ['list.trade', 'When traded, line 1 moves its stat to nothing. Pick another number stat it moves to, or Save drops the line.'],
            ['list.trade', 'When traded, line 2 names no number stat of this list, so Save drops it.']];
        const cleanSaid = [['list.badge.2', 'Badge 3’s Shown where rolls dice, and it is read with none, so Save drops the badge.'], ['list.lkshades', 'Shade by is picked, but Shades holds no line Save keeps, so no row takes a shade. Give each value of that stat a line, such as Steel = #8a8f99.']];
        check('1.6.3 refreshErrors says each emptied box another box depends on, under the list, in plain words and on the box it names (the switch’s words and icon, a load’s and a chamber’s words, Matched by, a roll’s and an action’s words and Hidden tick, a damage type off Damage, Rolls by, a rule with no category, Fits where’s words, Holds by kind, badges, When traded, Shade by)',
            want.every(w => says.some(s => s[0] === w[0] && s[1] === w[1])) && cleanSaid.every(w => says.some(s => s[0] === w[0] && s[1] === w[1])), J(says));
        // a list that names everything its boxes depend on is said nothing of them
        const fullG = JSON.parse(J(gun)), fl = fullG.list; fl.chamber.to = 'Cal'; fl.stand.offWord = 'Stowed'; fl.rolls[2].test = 'T1'; fl.rolls[2].of = 'Slots'; fl.on.needsText = 'No charge.'; fl.on.offLabel = 'Off'; fl.load.needsText = 'Wrong load.'; fl.load.to = 'Cal'; fl.feeds[0].by = 'Cal'; fl.chamber.needs = 'Row.ch >= 0'; fl.rolls[0].needsText = 'Empty.'; fl.rolls[0].dmg = true; fl.rolls[0].of = 'Slots'; fl.rolls[1].needs = 'Row.ch = 0';
        fl.lay.rules[0].cats = ['Mag']; fl.parts.fitIfSays = 'It does not fit.'; fl.parts.fitMore = [{ 'if': 'Row.Cal > 0', says: 'Too small.' }]; fl.parts.caps = [{ cats: ['Mag'], by: 'Slots' }]; fl.badges = [{ words: 'Jammed', 'if': 'Row.ch = 0' }]; fl.onTrade = [{ s: 'Cal', to: 'Slots' }]; fl.look = { by: 'Tone', shades: [{ v: 'Steel', c: '#8a8f99' }] };
        const outF = runQ({ name: 'D', rolls: [], items: [], tests: [{ key: 'T1', label: 'Check', shape: 'under', dice: '3d6' }], sheet: { sections: [] }, fields: [mag, fullG] }), saysF = (outF.e['list:f_gun'] || []).map(x => x.message);
        check('1.6.3 ... and a list whose every such box is filled is said none of them, and the cleaner keeps what each one fills',
            !saysF.some(m => /is empty|need Needs|needs Needs|Matched by|Damage ticked|Rolls by|names no category|says nothing|has no Shown where|counts nothing|no how many|moves its stat to nothing|holds no line Save keeps|icon shows only/.test(m)), J(saysF));
        // the review of the Lists tab's fix: a When traded line that moves its stat, on a list with no other number stat, says so, since the target list offers nothing to pick
        const oneN = { id: 'f_one', key: 'Ones', label: 'Ones', kind: 'item-list', list: { stats: [{ key: 'Cal', label: 'Caliber' }, { key: 'Kind', label: 'Kind', kind: 'pick', opts: [{ label: 'A' }] }], onTrade: [{ s: 'Cal', to: 'Cal' }] } };
        const oneS = (runQ({ name: 'D', rolls: [], items: [], sheet: { sections: [] }, fields: [oneN] }).e['list:f_one'] || []).filter(x => x.prop === 'list.trade').map(x => x.message);
        check('1.6.3 When traded on a list of one number stat says there is no other stat to move it to, and how to keep the line',
            J(oneS) === J(['When traded, line 1 moves its stat, but this list has no other number stat to move it to. Add one, or have the line clear the stat or set it to a figure, or Save drops the line.']), J(oneS));
        // Keeps paying, which Save drops whole, says its first cause (listCleanSays, run in the real refreshErrors)
        const upOf = up => { const g = { id: 'f_up', key: 'Gear', label: 'Gear', kind: 'item-list', list: { on: { label: 'On' }, upkeep: up } }, o = runQ({ name: 'D', rolls: [], items: [], sheet: { sections: [] }, fields: [{ id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', maxFormula: '10' }, g] }); return (o.e['list:f_up'] || []).filter(x => /Keeps paying/.test(x.message)).map(x => [x.prop, x.message]); };
        const upS = [upOf({ pool: 'f_gone', amt: '1', each: 'turn' }), upOf({ pool: 'f_hp', amt: '', each: 'turn' }), upOf({ pool: 'f_hp', amt: '1d6', each: 'turn' }), upOf({ pool: 'f_hp', amt: '2', each: 'turn' })];
        check('1.6.3 Keeps paying, dropped whole by Save, says why under the list: no pool, no amount, an amount with dice; and nothing where it is kept',
            J(upS[0]) === J([['list.uppool', 'Keeps paying needs a pool to pay from. Pick one, or Save drops Keeps paying.']]) && J(upS[1]) === J([['list.upamt', 'Keeps paying needs what it pays, a figure with no dice such as 3. Save drops Keeps paying.']])
            && J(upS[2]) === J([['list.upamt', 'Keeps paying pays a figure with no dice, so Save drops Keeps paying.']]) && upS[3].length === 0, J(upS));
        // (d) the boxes start filled: + Kind takes the first number stat, + Badge has words, a further Fits where rule's Refused with follows its test, and When traded offers no move to the line's own stat
        const mkD = (tag, cls) => { const e = { tag, className: cls || '', kids: [], title: '', value: '', placeholder: '', disabled: false, on: {}, appendChild(k) { e.kids.push(k); return k; }, addEventListener(t, fn) { e.on[t] = fn; }, focus() { e.focused = true; }, select() { e.picked = true; }, click() { if (e.on.click) e.on.click({ stopPropagation() {} }); },
            querySelectorAll(sel) { const c = sel.replace(/^\./, ''), acc = [], w = n => (n.kids || []).forEach(k => { if ((' ' + k.className + ' ').includes(' ' + c + ' ')) acc.push(k); w(k); }); w(e); return acc; } };
            Object.defineProperty(e, 'textContent', { get() { return e._t || ''; }, set(v) { e._t = String(v); e.kids = []; } }); return e; };
        const inpD = (cls, v, t, ph) => Object.assign(mkD('input', cls), { value: v, title: t, placeholder: ph });
        const selD = (cls, opts, cur, tip) => { const s = mkD('select', cls); s.title = tip; opts.forEach(o => { const op = mkD('option'); op.value = o[0]; op.textContent = o[1]; op.selected = o[0] === cur; s.appendChild(op); }); s.value = cur; return s; };
        const boxSrc = kit.cut('sysedbox.js', '// 1.6.2: what a trade does to a row of this list', '// [systemcheck:partcaps-end]') + NLx + kit.cut('sysedbox.js', '// [systemcheck:badgebox-start]', '// [systemcheck:badgebox-end]');
        const BX = new Function('el', 'input', 'select', 'numInput', 'markDirty', 'patchErrors', 'LIMITS', 'PART_CAPS', 'PART_FITS', 'BADGE_MAX', 'document', 'draft', boxSrc + NLx + 'return { caps: partCapsBox, fits: partFitsBox, badges: badgeBox, trade: tradeRulesBox };')(
            mkD, inpD, selD, (c, v) => inpD(c, v), () => {}, () => {}, LIMITS, S.PART_CAPS, S.PART_FITS, S.BADGE_MAX, { createTextNode: t => ({ textContent: t }) }, { fields: [] });
        const spC = { stats: [{ key: 'Kind', kind: 'pick' }, { key: 'Grip', label: 'Grip' }], parts: { from: 'f_mag' } }, bC = BX.caps(spC); bC.querySelectorAll('.sys-pcap-add')[0].click();
        const spB = { badges: [{ words: 'A', 'if': '1' }] }, bB = BX.badges(spB); bB.querySelectorAll('.sys-badge-add')[0].click(); const bW = bB.querySelectorAll('.sys-badge-words');
        const spP = { parts: { from: 'f_mag', fitMore: [{ 'if': '' }] } }, bP = BX.fits(spP), pI = bP.querySelectorAll('.sys-pfit-if')[0], pS = bP.querySelectorAll('.sys-pfit-says')[0];
        pI.value = 'Row.Cal > 0'; pI.on.input({ stopPropagation() {} }); const pFill = [J(spP.parts.fitMore[0]), pS.value]; pI.value = ''; pI.on.input({ stopPropagation() {} }); const pGone = [J(spP.parts.fitMore[0]), pS.value];
        const spT = { stats: [{ key: 'Cal', label: 'Caliber' }, { key: 'Wear', label: 'Wear' }], onTrade: [{ s: 'Cal', to: '' }] }, bT = BX.trade(spT), toS = bT.querySelectorAll('.sys-trade-to')[0];
        const spT1 = { stats: [{ key: 'Cal', label: 'Caliber' }], onTrade: [{ s: 'Cal' }] }, bT1 = BX.trade(spT1), how1 = bT1.querySelectorAll('.sys-trade-how')[0];
        check('1.6.3 a new line or row starts filled where a sensible value exists: Holds by kind’s How many on the list’s first number stat, a badge’s words (picked, so typing replaces them), a further Fits where rule’s Refused with as its test is first typed (and gone with it); When traded never offers the line’s own stat as its target, shows an empty one as Pick a stat, and offers no move on a list of one number stat',
            J(spC.parts.caps) === J([{ cats: [], by: 'Grip' }]) && spB.badges[1].words === 'Badge 2' && bW[1].value === 'Badge 2' && bW[1].picked === true
            && pFill[0] === J({ 'if': 'Row.Cal > 0', says: 'That part does not fit there.' }) && pFill[1] === 'That part does not fit there.' && pGone[0] === J({}) && pGone[1] === ''
            && J(toS.kids.map(o => o.value)) === J(['', 'Wear']) && toS.value === '' && J(how1.kids.map(o => o.value)) === J(['clear', 'v']), J([spC.parts.caps, spB.badges, pFill, pGone, toS.kids.map(o => o.value), how1.kids.map(o => o.value)]));
        // (e) the readers: a refusal never says its formula (systemcore rollNeedsSays and partFitSays), the words boxes' tooltips no longer promise it, and the
        // list's own card draws a damage type and a kind only beside Damage or a stray value, starts a new Laid from rule on a category, and its Help says the switch's words are required
        const lp = kit.part('sysedlist.js');
        check('1.6.3 a refusal with no words of its own says Not now and never its formula; the Lists tab no longer promises the formula, draws a damage type only beside Damage or a stray value, and a new rule of Laid from starts on a category',
            S.rollNeedsSays({ needs: 'Row.ch > 0' }) === 'Not now.' && S.rollNeedsSays({ needs: 'Row.ch > 0', needsText: 'Empty.' }) === 'Empty.' && !lp.includes('blank: Not now: it needs and the formula') && !lp.includes("'Out of charges'")
            && lp.includes("if (rr.dmg === true || (typeof rr.dtype === 'string' && rr.dtype.trim())) { var rdt = input('sys-list-rolldtype field',")
            // the review of the Lists tab's fix: each of the four boxes drawn on only some rolls carries its roll's place, which sysui.js boxIn reads
            && lp.includes('rdt.dataset.ri = String(ri);') && lp.includes('rdk.dataset.ri = String(ri);') && lp.includes('rtSel.dataset.ri = String(ri);') && lp.includes('roSel.dataset.ri = String(ri);') && lp.includes("if ((dkLOn && rr.dmg === true) || rr.dkind) {") && lp.includes("lyS.rules.push({ cats: layCatFirst(lyS), each: 'row' })")
            && /Its words say why not, and must be filled in\./.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')), lp.indexOf('layCatFirst'));
        const lcLine = (lp.match(/\n\s*var layCatFirst = function\(ly\) \{[^\n]*\n[^\n]*\n/) || [''])[0];
        const LCF = d => new Function('draft', lcLine + NLx + 'return layCatFirst;')(d);
        check('1.6.3 a new rule of Laid from starts on the source list’s first category, else the first category an item of the system holds, else none (its fault then says so)',
            !!lcLine && J(LCF({ fields: [{ id: 'f_s', list: { cats: [' Limb ', 'Head'] } }], items: [] })({ from: 'f_s' })) === J(['Limb']) && J(LCF({ fields: [{ id: 'f_s', list: {} }], items: [{ category: 'Gear' }] })({ from: 'f_s' })) === J(['Gear']) && J(LCF({ fields: [], items: [] })({ from: 'f_s' })) === J([]), lcLine.slice(0, 80));
    }
    await T.finish();
})();
