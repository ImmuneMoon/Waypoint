/* Offline check of the item-library / blast-from-sheet pure model in system/app/scripts/systemcore.js
   (Stage-5 slice 1): item defs, the item-list value kind, per-recipient stripping, the per-entry
   inventory op, the throw item lookup, and validation. Runs under Node against the real formula engine.
   Usage: node tools/itemcheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path');
const NL = String.fromCharCode(10);
const app = path.join(__dirname, '..', 'system', 'app');
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).replace(/[\\]/g, '/');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }
const j = v => JSON.stringify(v);

(async () => {
    let S = null, F = null, err = null;
    try { S = await import(url('systemcore.js')); F = await import(url('formula.js')); } catch (e) { err = e; }
    check('modules load in Node with no window', !!S && !!F && !err, err && err.message);
    if (!S || !F) { console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const { LIMITS, KINDS, STORED, emptySystem, cleanItemDef, cleanCombat, cleanSystem, cleanValue, cleanChar, cleanCharItem, applyItemOp, itemDef, resolveAll, hoverLines, validateSystem, charFor, autoLayout } = S;

    /* ---- KINDS / emptySystem ---- */
    check('item-list is a KIND and STORED, not a formula-namable numeric', KINDS['item-list'] === 1 && STORED['item-list'] === 1 && !S.DEF_PROP['item-list']);
    check('emptySystem carries items[] and a default combat', (() => { const e = emptySystem(); return Array.isArray(e.items) && e.items.length === 0 && e.combat && e.combat.blastAuto === 'full' && e.combat.blastRoller === 'owner' && e.combat.hpResource === ''; })());

    /* ---- cleanItemDef ---- */
    const it = (o) => cleanItemDef(Object.assign({ id: 'i_a', name: 'A' }, o), F, true);
    check('cleanItemDef: bad id -> null; area ft clamped; shape defaults circle', cleanItemDef({ id: 'x', name: 'A' }, F, true) === null && it({ area: { ft: 99999, shape: 'weird' } }).area.ft === LIMITS.maxBlastFt && it({ area: { ft: 12 } }).area.shape === 'circle' && it({ area: { ft: 0 } }).area === null);
    check('cleanItemDef: keeps damage/cost/throwSkill for the GM; validKey gates throwSkill', (() => { const d = it({ damage: ' 3d6 ', cost: 'STR*2', throwSkill: 'STR' }); const bad = it({ throwSkill: 'd6' }); return d.damage === '3d6' && d.cost === 'STR*2' && d.throwSkill === 'STR' && bad.throwSkill === ''; })());
    check('cleanItemDef: player view drops a vis:gm item and strips all formula/skill text', (() => {
        const gm = cleanItemDef({ id: 'i_s', name: 'S', vis: 'gm', damage: '2d6', area: { ft: 10 } }, F, false);
        const pl = cleanItemDef({ id: 'i_p', name: 'P', vis: 'all', damage: '2d6 + Secret', cost: 'STR', throwSkill: 'STR', area: { ft: 10 } }, F, false);
        return gm === null && pl && pl.damage === '' && pl.cost === '' && pl.throwSkill === '' && pl.area.ft === 10;
    })());

    /* ---- cleanCombat ---- */
    check('cleanCombat: defaults + enum + hpResource must be a known resource id', (() => {
        const res = { f_hp: 1 };
        const a = cleanCombat(null, res); const b = cleanCombat({ blastAuto: 'roll', blastRoller: 'gm', hpResource: 'f_hp' }, res); const c = cleanCombat({ blastAuto: 'nope', hpResource: 'f_nope' }, res);
        return a.blastAuto === 'full' && a.hpResource === '' && b.blastAuto === 'roll' && b.blastRoller === 'gm' && b.hpResource === 'f_hp' && c.blastAuto === 'full' && c.hpResource === '';
    })());

    /* ---- a whole system round-trip ---- */
    const rawSys = {
        name: 'T', fields: [
            { id: 'f_str', key: 'STR', kind: 'number', def: 10, hover: true },
            { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: 'STR', def: 'max' },
            { id: 'f_secret', key: 'Secret', kind: 'number', vis: 'gm', def: 3 },
            { id: 'f_kit', key: 'Kit', kind: 'item-list', edit: 'owner', vis: 'all', hover: true },
            { id: 'f_gmkit', key: 'GmKit', kind: 'item-list', edit: 'gm', vis: 'all' }
        ],
        rolls: [],
        items: [
            { id: 'i_frag', name: 'Splinter Charge', category: 'Explosives', vis: 'all', area: { ft: 12, shape: 'circle', name: 'Splinter' }, damage: '3d6', cost: 'STR * 10', throwSkill: 'STR' },
            { id: 'i_secret', name: 'Prototype', vis: 'gm', area: { ft: 30 }, damage: '2d6 + Secret', cost: 'STR' },
            { id: 'i_badcost', name: 'BadCost', vis: 'all', cost: '2d6', damage: '1d6' },
            { id: 'i_badts', name: 'BadTS', vis: 'all', throwSkill: 'Nope' }
        ],
        combat: { blastAuto: 'roll', blastRoller: 'gm', hpResource: 'f_hp' }
    };
    const gm = cleanSystem(rawSys, { F, gmView: true });
    const pv = cleanSystem(rawSys, { F, gmView: false });
    check('cleanSystem: GM view keeps all items + combat', gm.items.length === 4 && gm.combat.blastAuto === 'roll' && gm.combat.hpResource === 'f_hp' && itemDef(gm, 'i_frag').area.ft === 12);
    check('cleanSystem: player view drops the vis:gm item and strips visible formulas', (() => {
        const frag = itemDef(pv, 'i_frag');
        return pv.items.length === 3 && !itemDef(pv, 'i_secret') && frag && frag.area.ft === 12 && frag.damage === '' && frag.cost === '' && frag.throwSkill === '';
    })());

    /* ---- cleanValue: the item-list value ---- */
    const items = Object.create(null); gm.items.forEach(i => { items[i.id] = 1; });
    check('cleanValue item-list: drops unknown/dup/bad-id, clamps qty, non-array -> undefined', (() => {
        const v = cleanValue({ kind: 'item-list' }, [{ defId: 'i_frag', qty: 999 }, { defId: 'i_frag', qty: 4 }, { defId: 'i_nope', qty: 1 }, { defId: '__proto__', qty: 1 }, { defId: 'i_secret', qty: 0 }], { items });
        return Array.isArray(v) && v.length === 2 && v[0].defId === 'i_frag' && v[0].qty === LIMITS.maxQty && v[1].defId === 'i_secret' && v[1].qty === 1 && cleanValue({ kind: 'item-list' }, 'x', { items }) === undefined;
    })());
    check('cleanValue item-list: caps at LIMITS.carried', (() => {
        const big = Object.create(null); const raw = []; for (let i = 0; i < 130; i++) { big['i_x' + i] = 1; raw.push({ defId: 'i_x' + i, qty: 1 }); }
        const v = cleanValue({ kind: 'item-list' }, raw, { items: big });
        return v.length === LIMITS.carried;
    })());

    /* ---- cleanChar cleans the item-list value against the system's items ---- */
    check('cleanChar: item-list value cleaned against sys.items', (() => {
        const c = cleanChar({ id: 'c_a', name: 'A', ownerId: 'p1', values: { f_kit: [{ defId: 'i_frag', qty: 2 }, { defId: 'i_nope', qty: 1 }] } }, gm);
        return c && Array.isArray(c.values.f_kit) && c.values.f_kit.length === 1 && c.values.f_kit[0].defId === 'i_frag' && c.values.f_kit[0].qty === 2;
    })());

    /* ---- cleanCharItem: the per-entry op message ---- */
    check('cleanCharItem: valid ops pass; bad op/defId/qty rejected', (() => {
        const ok = cleanCharItem({ rid: 'r1', charId: 'c_a', fieldId: 'f_kit', op: 'add', defId: 'i_frag', qty: 3 });
        return ok && ok.op === 'add' && ok.qty === 3
            && cleanCharItem({ rid: 'r1', charId: 'c_a', fieldId: 'f_kit', op: 'nope', defId: 'i_frag' }) === null
            && cleanCharItem({ rid: 'r1', charId: 'c_a', fieldId: 'f_kit', op: 'add', defId: 'x' }) === null
            && cleanCharItem({ rid: 'r1', charId: 'c_a', fieldId: 'f_kit', op: 'add', defId: 'i_frag', qty: -1 }) === null;
    })());

    /* ---- applyItemOp: host-side add/remove/setQty + permissions ---- */
    const charA = { id: 'c_a', values: {} };
    check('applyItemOp: add/remove/setQty over a growing list', (() => {
        let r = applyItemOp(gm, charA, 'f_kit', 'add', 'i_frag', 1, {}); if (!r.ok) return false; charA.values.f_kit = r.value;
        r = applyItemOp(gm, charA, 'f_kit', 'add', 'i_frag', 1, {}); charA.values.f_kit = r.value; if (r.value[0].qty !== 2) return false;
        r = applyItemOp(gm, charA, 'f_kit', 'setQty', 'i_frag', 5, {}); charA.values.f_kit = r.value; if (r.value[0].qty !== 5) return false;
        r = applyItemOp(gm, charA, 'f_kit', 'setQty', 'i_frag', 0, {}); charA.values.f_kit = r.value; return r.value.length === 0;
    })());
    check('applyItemOp: player cannot touch a GM-edit list, a GM-only item, or an unknown item', (() => {
        const asPlayer = { player: true };
        return applyItemOp(gm, charA, 'f_gmkit', 'add', 'i_frag', 1, asPlayer).ok === false
            && applyItemOp(gm, charA, 'f_kit', 'add', 'i_secret', 1, asPlayer).ok === false
            && applyItemOp(gm, charA, 'f_kit', 'add', 'i_nope', 1, asPlayer).reason === 'missing'
            && applyItemOp(gm, charA, 'f_kit', 'add', 'i_secret', 1, {}).ok === true;   // the GM may
    })());

    /* ---- charFor: an item-list never travels to another player, even with hover set ---- */
    check('charFor: item-list excluded for a non-owner (hover ignored), included for the owner', (() => {
        const c = cleanChar({ id: 'c_b', name: 'B', ownerId: 'p1', values: { f_str: 12, f_kit: [{ defId: 'i_frag', qty: 1 }] } }, gm);
        const own = charFor(c, gm, 'p1'), other = charFor(c, gm, 'p2');
        return own.values.f_kit && !('f_kit' in other.values) && other.values.f_str === 12;
    })());

    /* ---- resolveAll / hoverLines do not choke on a list value ---- */
    check('resolveAll: item-list resolves to its list with no error; hoverLines skips it', (() => {
        const c = cleanChar({ id: 'c_c', name: 'C', ownerId: 'p1', values: { f_kit: [{ defId: 'i_frag', qty: 1 }] } }, gm);
        const all = resolveAll(gm, c, F);
        const hov = hoverLines(gm, c, F);
        return all.f_kit && !all.f_kit.error && Array.isArray(all.f_kit.value) && !hov.some(l => /Kit/.test(l));
    })());

    /* ---- validateSystem: item damage (dice ok), cost (dice error), bad throwSkill warns ---- */
    check('validateSystem: dice in an item cost errors; dice in damage is fine; unknown throwSkill warns', (() => {
        const v = validateSystem(gm, F);
        const costErr = v.errors.some(e => e.id === 'i_badcost' && e.prop === 'cost' && /Dice are not allowed/.test(e.message));
        const damageOk = !v.errors.some(e => e.id === 'i_frag');
        const tsWarn = v.warnings.some(w => w.id === 'i_badts' && w.prop === 'throwSkill');
        return costErr && damageOk && tsWarn;
    })());

    /* ---- autoLayout places item-list fields (full-row Items section) ---- */
    check('autoLayout: item-list fields land in an Items section as full rows', (() => {
        const lay = autoLayout(gm);
        const sec = lay.sections.find(s => s.title === 'Items');
        return !!sec && sec.fields.some(p => p.id === 'f_kit' && p.w === 'row') && sec.fields.some(p => p.id === 'f_gmkit');
    })());

    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    process.exit(fail ? 1 : 0);
})();
