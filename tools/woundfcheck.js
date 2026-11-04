// woundfcheck — a wound worked out by a formula (1.6.2; the owner, 2026-11-03, by prompt: "Once for the system: one formula under Taking damage
// for every type; a type may have its own formula, or its multiplier, in its place. A system with neither works as today", and a wound of 0:
// "The system says ... Default: layers still wear"). systemcore's cleaner and the real damage step on a sheet with a location and a worn layer;
// the editor's boxes, its words, Help and both notes. No browser, no network.
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 700))); } }
const J = JSON.stringify, root = path.join(__dirname, '..'), app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, '\n');
const imp = p => import('file:///' + path.resolve(app(p)).replace(/\\/g, '/'));
(async () => {
    if (typeof globalThis.window === 'undefined') globalThis.window = {};
    const S = await imp('scripts/systemcore.js'), F = await imp('scripts/formula.js');
    const raw = (dmg) => ({ v: 1, name: 'W', rolls: [], fields: [
        { id: 'f_hp', key: 'HP', label: 'Hit Points', kind: 'resource', maxFormula: '20', min: -99, vis: 'all', edit: 'owner' },
        { id: 'f_tough', key: 'Tough', label: 'Toughness', kind: 'number', def: 4, vis: 'all', edit: 'owner' },
        { id: 'f_locs', key: 'Locs', label: 'Locations', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'nat', label: 'Natural' }], cols: [{ key: 'DR', label: 'DR', formula: 'Row.nat + Gear.on.plate' }] } },
        { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { on: { label: 'Worn' }, stats: [{ key: 'plate', label: 'Plate' }, { key: 'pworn', label: 'Plate worn' }] } }],
        items: [{ id: 'i_torso', name: 'Torso', stats: { nat: 0 } }, { id: 'i_coat', name: 'Coat', stats: { plate: 3 } }],
        combat: { damage: Object.assign({ pool: 'f_hp', locs: { list: 'f_locs', dr: 'DR' }, types: [{ key: 'bolt', label: 'Bolt' }, { key: 'burn', label: 'Burn', mult: 2 }, { key: 'cut', label: 'Cut', woundF: 'Blow.through' }],
            layers: [{ list: 'f_gear', at: 'Row.plate', wear: 'pworn' }] }, dmg) } });
    const sysOf = d => S.cleanSystem(raw(d), { F, gmView: true });
    const ch = () => ({ id: 'c_w', name: 'Kael', values: { f_hp: { cur: 20 }, f_tough: 4, f_locs: [{ defId: 'i_torso', qty: 1 }], f_gear: [{ defId: 'i_coat', qty: 1, on: true }] } });
    const hit = (sys, inp) => S.damageStep(sys, ch(), Object.assign({ loc: 'w_torso' }, inp), F);
    // ---- the cleaner
    const s1 = sysOf({ woundF: 'floor(Blow.through / Tough)', zero: 'none' }), pv = S.cleanSystem(s1, { F, gmView: false });
    check('the system keeps a wound formula and what a wound of 0 does in the GM’s view, a type its own formula or its multiplier ticked, and none of it in the players’ view',
        s1.combat.damage.woundF === 'floor(Blow.through / Tough)' && s1.combat.damage.zero === 'none' && s1.combat.damage.types[2].woundF === 'Blow.through'
        && sysOf({ zero: 'some' }).combat.damage.zero === undefined && S.cleanSystem(raw({ types: [{ key: 'bolt', label: 'Bolt', byMult: true }, { key: 'cut', label: 'Cut', woundF: 'Blow.through', byMult: true }] }), { F, gmView: true }).combat.damage.types.map(t => [t.byMult, t.woundF]).join('|') === 'true,|,Blow.through'
        && (!pv.combat || !pv.combat.damage || (pv.combat.damage.woundF === undefined && pv.combat.damage.zero === undefined && pv.combat.damage.types.every(t => t.woundF === undefined))), J([s1.combat.damage, pv.combat && pv.combat.damage]));
    // ---- the damage step
    const plain = hit(sysOf({}), { amt: 10, type: 'bolt' }), burn = hit(sysOf({}), { amt: 10, type: 'burn' });
    check('a system with neither works as today: 10 against DR 3 is 7 through and a wound of 7, a type of times 2 a wound of 14', plain.ok && plain.info.through === 7 && plain.info.wound === 7 && burn.info.wound === 14, J([plain.info, burn.info]));
    const sf = hit(sysOf({ woundF: 'floor(Blow.through / Tough)' }), { amt: 10, type: 'bolt' });
    check('the system’s formula reads what got through and the sheet: 7 through, Toughness 4, a wound of 1, and the line says by its formula',
        sf.ok && sf.info.through === 7 && sf.info.wound === 1 && sf.values.f_hp.cur === 19 && sf.lines.some(l => /7 through, by its formula, 1 Hit Points/.test(l)), J([sf.info, sf.lines]));
    const own = hit(sysOf({ woundF: 'floor(Blow.through / Tough)' }), { amt: 10, type: 'cut' }), keep = hit(S.cleanSystem(raw({ woundF: 'floor(Blow.through / Tough)', types: [{ key: 'burn', label: 'Burn', mult: 2, byMult: true }] }), { F, gmView: true }), { amt: 10, type: 'burn' });
    check('a type’s own formula takes the system’s place, and a type ticked Its multiplier keeps today’s', own.info.wound === 7 && keep.info.wound === 14, J([own.info, keep.info]));
    const zW = hit(sysOf({ woundF: 'floor(Blow.through / 10)' }), { amt: 10, type: 'bolt' }), zN = hit(sysOf({ woundF: 'floor(Blow.through / 10)', zero: 'none' }), { amt: 10, type: 'bolt' });
    check('a wound of 0 is no wound: nothing comes off the pool; armour still wears by default, and with A wound of 0 does nothing it does not',
        zW.ok && zW.info.wound === 0 && !('f_hp' in zW.values) && 'f_gear' in zW.values && zN.ok && zN.info.wound === 0 && !('f_hp' in zN.values) && !('f_gear' in zN.values), J([zW.values, zN.values, zW.info]));
    const wa = hit(sysOf({}), { amt: 10, type: 'bolt' }), wf = hit(sysOf({ woundF: 'floor(Blow.through / Tough)' }), { amt: 10, type: 'bolt' });
    check('a wound the formula gives wears armour as any wound does', 'f_gear' in wa.values && 'f_gear' in wf.values, J([wa.values.f_gear, wf.values.f_gear]));
    const bad = hit(sysOf({ woundF: 'Blow.through / Nope' }), { amt: 10, type: 'bolt' }), none = hit(sysOf({ woundF: 'floor(Blow.through / Tough)' }), { amt: 2, type: 'bolt' });
    check('a formula that cannot be worked out refuses the hit in words, and a hit stopped wholly asks no formula', !bad.ok && /formula/.test(bad.message) && none.ok && none.info.through === 0 && none.info.wound === 0, J([bad, none.info]));
    // ---- the editor, Help and notes
    const sh = read('scripts/sheets.js');
    check('Taking damage has Wound by and what a wound of 0 does, a type its own Wound by and Its multiplier, with their handlers and forms',
        sh.includes("input('sys-dmgr-woundf field'") && sh.includes("select('sys-dmgr-zero', [['', 'A wound of 0 still wears armour'], ['none', 'A wound of 0 does nothing']]") && sh.includes("input('sys-dmgr-ywf field'") && sh.includes("dbxTick('sys-dmgr-ybymult'")
        && sh.includes("else if (dbxHas(c, 'sys-dmgr-woundf')) { dbxSet(dbxDraft(), 'woundF'") && sh.includes("else if (dbxHas(c, 'sys-dmgr-zero')) { dbxSet(dbxDraft(), 'zero', v); }") && read('scripts/formbox.js').includes("'sys-dmgr-woundf': 'amt', 'sys-dmgr-ywf': 'amt'"));
    const help = read('index.html'), wn = fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8'), wn2 = read('assets/whatsnew.txt');
    check('Help and both release notes say it', help.includes('<li><b>Wound by</b> works a wound out by a formula, for every damage type.') && help.includes('A wound of 0 is no wound.') && wn.includes('- A wound can be worked out by a formula of what got through') && wn2.includes('- A wound can be worked out by a formula of what got through'));
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite threw -> ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) console.log('FAIL      the suite never reached its summary'); });
