/* Offline check of the character-sheet feature's pure half (system/app/scripts/systemcore.js) against the real
   formula engine (system/app/scripts/formula.js) and the two bundled presets (system/app/assets/systems/*.json):
   keys, cleaners, the GM-view stripping, the validator (carets, loops, dice in definitions), the resolver, the
   per-recipient view, edits, the auto layout and the ShadowBase bridge.
   Usage: node tools/systemcheck.js   (exit 1 on any failure) */
'use strict';
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const app = path.join(__dirname, '..', 'system', 'app');
const url = f => 'file:///' + path.resolve(path.join(app, 'scripts', f)).replace(/[\\]/g, '/');
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail !== undefined ? '-> ' + String(detail).slice(0, 300) : ''); } }
const j = v => JSON.stringify(v);
const ownLines = src => ['function own(', 'function validKey(', 'function campOf('].map(k => { const i = src.indexOf(k); return i < 0 ? '' : src.slice(i, src.indexOf('\n', i)); }).join('\n') + '\n';   // net.js's own-key lookups (the real one-liners) for a sliced gate that uses them

(async () => {
    let S = null, F = null, err = null;
    try { S = await import(url('systemcore.js')); F = await import(url('formula.js')); } catch (e) { err = e; }
    check('modules load in Node with no window', !!S && !!F && !err, err && err.message);
    if (!S || !F) { console.log(NL + pass + ' passed, ' + fail + ' failed.'); process.exit(1); }
    const { LIMITS, validKey, cleanField, cleanSystem, cleanValue, cleanChar, cleanCharEdit, makeResolver, resolveAll, hoverLines, validateSystem, charFor, applyEdit, autoLayout, aliasFromShadowBase, emptySystem } = S;
    const d20 = JSON.parse(fs.readFileSync(path.join(app, 'assets', 'systems', 'd20.json'), 'utf8'));
    const g3d6 = JSON.parse(fs.readFileSync(path.join(app, 'assets', 'systems', '3d6.json'), 'utf8'));

    /* ---- presets ---- */
    [['d20', d20], ['3d6', g3d6]].forEach(([n, p]) => {
        const c = cleanSystem(p, { F, gmView: true });
        check('preset ' + n + ': cleans without loss (ids, keys, rolls, sections)', c && c.fields.length === p.fields.length && c.rolls.length === p.rolls.length && c.sheet.sections.length === p.sheet.sections.length && c.fields.every((f, i) => f.id === p.fields[i].id && f.key === p.fields[i].key), c && j({ f: c.fields.length, r: c.rolls.length, s: c.sheet.sections.length }));
        const v = validateSystem(c, F);
        check('preset ' + n + ': validates with no errors', v.ok, j(v.errors.slice(0, 3)));
        check('preset ' + n + ': every roll parses', c.rolls.every(r => F.parse(r.formula).ok) && c.fields.every(f => !f.roll || F.parse(f.roll).ok));
        check('preset ' + n + ': ids are stable strings', c.fields.every(f => /^f_[a-z0-9_]+$/.test(f.id)) && c.rolls.every(r => /^r_[a-z0-9_]+$/.test(r.id)));
        const pv = cleanSystem(p, { F, gmView: false });
        check('preset ' + n + ': the player view drops the GM-only notes field only', pv.fields.length === p.fields.length - 1 && !pv.fields.some(f => f.vis === 'gm'));
    });

    /* ---- keys ---- */
    check('validKey: names and dotted names pass', validKey('STR', F) && validKey('Skill.Stealth', F) && validKey('_x1', F) && validKey('Skill.Fast_Talk', F));
    check('validKey: dice, functions, reserved words, spaces, parens, reserved suffixes, length refused', !validKey('d6', F) && !validKey('dF', F) && !validKey('floor', F) && !validKey('and', F) && !validKey('true', F) && !validKey('Bad Key', F) && !validKey('(STR)', F) && !validKey('HP.max', F) && !validKey('Skill.X.ranks', F) && !validKey('x'.repeat(65), F) && !validKey('', F) && !validKey('2d6', F) && !validKey('STR+1', F));

    /* ---- fields ---- */
    const fld = (o) => cleanField(Object.assign({ id: 'f_a', key: 'A', kind: 'number' }, o), F, true);
    check('cleanField: number defaults, min>max repaired, step, def clamped', (() => { const f = fld({ min: 10, max: 5, def: 99, step: -1 }); return f.min === 10 && f.max === 10 && f.def === 10 && f.step === 1 && f.edit === 'owner' && f.vis === 'all' && f.label === 'A'; })());
    check('cleanField: bad id, bad key, unknown kind, gm field in the player view -> null', cleanField({ id: 'x', key: 'A', kind: 'number' }, F, true) === null && fld({ key: 'd6' }) === null && fld({ kind: 'weird' }) === null && cleanField({ id: 'f_a', key: 'A', kind: 'number', vis: 'gm' }, F, false) === null);
    check('cleanField: select options unique, capped, def from options', (() => { const f = fld({ kind: 'select', options: ['a', 'A', 'b', 5, 'x'.repeat(100)].concat(new Array(60).fill('z')), def: 'nope' }); return f.options.length === 4 && f.options[0] === 'a' && f.options[2].length === 60 && f.def === 'a'; })());
    check('cleanField: formula kinds keep text, empty -> "", null -> null, control chars refused', fld({ kind: 'formula', formula: ' STR + 1 ' }).formula === 'STR + 1' && fld({ kind: 'formula' }).formula === '' && fld({ kind: 'formula', formula: null }).formula === null && fld({ kind: 'formula', formula: 'A' + String.fromCharCode(7) }).formula === '' && fld({ kind: 'skill', base: 'DEXmod' }).base === 'DEXmod' && fld({ kind: 'resource', maxFormula: 'CON', def: 'max' }).def === 'max');
    check('cleanField: text max capped at 200, roll kept when valid', fld({ kind: 'text', max: 9999, def: 'hi' + String.fromCharCode(0) }).max === 200 && fld({ kind: 'text' }).def === '' && fld({ roll: 'd20 + A' }).roll === 'd20 + A' && fld({ roll: 'x'.repeat(301) }).roll === undefined);

    /* ---- systems ---- */
    const sys = cleanSystem({ v: 1, name: 'T', fields: [
        { id: 'f_str', key: 'STR', kind: 'number', def: 12, min: 1, max: 30 },
        { id: 'f_strmod', key: 'STRmod', kind: 'formula', formula: 'floor((STR - 10) / 2)' },
        { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '10 + STRmod * 2', def: 'max', min: 0, hover: true },
        { id: 'f_stealth', key: 'Skill.Stealth', kind: 'skill', base: 'STRmod', def: 3, min: -10, max: 20, roll: 'd20 + Skill.Stealth' },
        { id: 'f_prone', key: 'Prone', kind: 'toggle', def: false, hover: true },
        { id: 'f_class', key: 'Class', kind: 'text', def: 'Rogue' },
        { id: 'f_notes', key: 'Notes', kind: 'notes' },
        { id: 'f_align', key: 'Alignment', kind: 'select', options: ['Good', 'Evil'], def: 'Good' },
        { id: 'f_secret', key: 'Secret', kind: 'number', def: 7, vis: 'gm' },
        { id: 'f_leak', key: 'Leak', kind: 'formula', formula: 'Secret + 1' },
        { id: 'f_dup', key: 'str', kind: 'number' },
        { id: 'f_bad', key: 'd6', kind: 'number' } ],
      rolls: [ { id: 'r_a', label: 'Attack', formula: 'd20 + STRmod', init: true }, { id: 'r_s', label: 'Sneaky', formula: 'd20 + Secret' }, { id: 'r_x', formula: '' } ],
      sheet: { sections: [ { id: 's_1', title: 'Main', cols: 9, fields: [ { id: 'f_str', w: 1 }, { id: 'f_str', w: 1 }, { id: 'f_nope', w: 1 }, { roll: 'r_a', w: 'row' }, { kind: 'heading', text: 'Hi', w: 'row' }, { kind: 'bogus' } ] }, { id: 'bad', fields: [] } ] } }, { F, gmView: true });
    check('cleanSystem: duplicate keys (case-insensitive) and dice-looking keys dropped, empty roll dropped, sheet cleaned', sys.fields.length === 10 && !sys.fields.some(f => f.id === 'f_dup' || f.id === 'f_bad') && sys.rolls.length === 2 && sys.sheet.sections.length === 1 && sys.sheet.sections[0].cols === 4 && j(sys.sheet.sections[0].fields) === j([{ id: 'f_str', w: 1 }, { roll: 'r_a', w: 'row' }, { kind: 'heading', w: 'row', text: 'Hi' }]), j(sys.sheet));
    const pview = cleanSystem(sys, { F, gmView: false });
    check('cleanSystem (player view): the GM-only field is gone, the formula naming it is nulled, the roll naming it is gone', !pview.fields.some(f => f.id === 'f_secret') && pview.fields.find(f => f.id === 'f_leak').formula === null && !pview.rolls.some(r => r.id === 'r_s') && pview.rolls.length === 1);
    check('cleanSystem: not an object / no engine -> null; caps hold', cleanSystem('x', { F }) === null && cleanSystem({}, {}) === null && cleanSystem({ fields: new Array(400).fill(0).map((_, i) => ({ id: 'f_' + i, key: 'K' + i, kind: 'number' })) }, { F }).fields.length === LIMITS.fields);

    /* ---- validator ---- */
    const v1 = validateSystem(sys, F);
    check('validateSystem: the test system is valid with two warnings (a visible formula and a visible roll name a GM-only field)', v1.ok && v1.warnings.length === 2 && v1.warnings[0].id === 'f_leak' && v1.warnings[1].id === 'r_s', j(v1));
    const bad = cleanSystem({ fields: [
        { id: 'f_a', key: 'A', kind: 'formula', formula: 'B + 1' }, { id: 'f_b', key: 'B', kind: 'formula', formula: 'A + 1' },
        { id: 'f_c', key: 'C', kind: 'formula', formula: 'C' }, { id: 'f_d', key: 'D', kind: 'formula', formula: '2d6 + 1' },
        { id: 'f_e', key: 'E', kind: 'formula', formula: 'floor(' }, { id: 'f_f', key: 'F', kind: 'formula', formula: 'Nam + 1' },
        { id: 'f_name', key: 'Name', kind: 'text' }, { id: 'f_g', key: 'G', kind: 'formula', formula: 'Name + 1' }, { id: 'f_h', key: 'H', kind: 'formula', formula: '' },
        { id: 'f_sk', key: 'Skill.Q', kind: 'skill', base: '' } ], rolls: [ { id: 'r_ok', formula: '2d6 + A' } ] }, { F, gmView: true });
    const v2 = validateSystem(bad, F), msgs = v2.errors.map(e => e.id + ':' + e.message);
    check('validateSystem: loops A->B->A and C->C reported', msgs.some(m => /loop: A → B → A/.test(m)) && msgs.some(m => /loop: C → C/.test(m)), j(msgs));
    check('validateSystem: dice in a definition refused, dice in a roll fine', msgs.some(m => m.indexOf('f_d:Dice are not allowed') === 0) && !msgs.some(m => m.indexOf('r_ok') === 0), j(msgs));
    check('validateSystem: parse error carries pos/len; unknown name suggests; text field named; missing formula; empty skill base fine', (() => { const e = v2.errors.find(x => x.id === 'f_e'); const f = v2.errors.find(x => x.id === 'f_f'); const g = v2.errors.find(x => x.id === 'f_g'); const h = v2.errors.find(x => x.id === 'f_h'); return e && typeof e.pos === 'number' && f && /did you mean "Name"/.test(f.message) && g && /is text/.test(g.message) && h && /Missing formula/.test(h.message) && !v2.errors.some(x => x.id === 'f_sk'); })(), j(msgs));

    /* ---- resolver ---- */
    const ch = { id: 'c_1', name: 'Pat', ownerId: 'u_pat', npc: false, values: { f_str: 16, f_stealth: 4, f_class: 'Rogue', f_prone: true, f_notes: 'secret notes', f_align: 'Evil' } };
    const R = makeResolver(sys, ch, F);
    check('resolver: stored, formula, skill = ranks + base, .ranks, resource cur/max with def max, toggle, text', R('STR') === 16 && R('STRmod') === 3 && R('Skill.Stealth') === 7 && R('Skill.Stealth.ranks') === 4 && R('HP') === 16 && R('HP.max') === 16 && R('Prone') === true && R('Class') === 'Rogue' && R('Notes') === undefined && R('nope') === undefined && R('HP.cur') === 16, j([R('STR'), R('STRmod'), R('Skill.Stealth'), R('HP'), R('HP.max')]));
    check('resolver: through the engine — names resolve, text gives the engine message, notes unknown, GM-only value readable in the GM view', (() => { const a = F.evaluate('d20 + Skill.Stealth', { vars: R, random: () => 10 }); const b = F.evaluate('Class + 1', { vars: R }); const c = F.evaluate('Notes + 1', { vars: R }); const d = F.evaluate('Leak', { vars: R }); return a.ok && a.value === 17 && a.breakdown.names[0].name === 'Skill.Stealth' && !b.ok && /is text/.test(b.error.message) && !c.ok && /Unknown name/.test(c.error.message) && d.ok && d.value === 8; })());
    check('resolver: a stored resource value wins; a player-view resolver reports the nulled formula as an error', (() => { const c2 = Object.assign({}, ch, { values: Object.assign({}, ch.values, { f_hp: { cur: 5 } }) }); const R2 = makeResolver(sys, c2, F); const R3 = makeResolver(pview, ch, F); const d = F.evaluate('Leak + 1', { vars: R3 }); return R2('HP') === 5 && R2('HP.max') === 16 && !d.ok && /GM only/.test(d.error.message); })());
    check('resolver: loops and dice inside definitions fail through the engine, never hang', (() => { const RB = makeResolver(bad, null, F); const a = F.evaluate('A', { vars: RB }); const d = F.evaluate('D', { vars: RB }); return !a.ok && /loop/.test(a.error.message) && !d.ok; })());
    check('resolver: values cached, errors not; reset clears', (() => { let n = 0; const sysX = cleanSystem({ fields: [{ id: 'f_a', key: 'A', kind: 'formula', formula: 'B * 2' }, { id: 'f_b', key: 'B', kind: 'number', def: 3 }] }, { F, gmView: true }); const RX = makeResolver(sysX, null, F); const a1 = RX('A'), a2 = RX('A'); RX.reset(); const a3 = RX('A'); return a1 === 6 && a2 === 6 && a3 === 6; })());
    check('resolveAll: every field, resource text "cur / max", errors marked; hoverLines', (() => { const all = resolveAll(sys, ch, F); const hl = hoverLines(sys, ch, F); return all.f_hp.text === '16 / 16' && all.f_stealth.value === 7 && all.f_leak.value === 8 && all.f_class.text === 'Rogue' && j(hl) === j(['HP 16 / 16', 'Prone']); })(), j(hoverLines(sys, ch, F)));

    /* ---- values and edits ---- */
    {   // the ShadowBase bridge: every value through the field's own rules (bounds, the wire-safe range), as an edit would
        const sbS = cleanSystem({ v: 1, name: 'SB', fields: [{ id: 'f_st', key: 'ST', kind: 'number', def: 10, vis: 'all', min: 1, max: 20 }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '10', vis: 'all' }], rolls: [] }, { F, gmView: true });
        const rA = S.aliasFromShadowBase({ attributes: { strength: 1e20 }, characteristics: { hitPoints: { current: 1e20 } } }, sbS, F);
        const rB = S.aliasFromShadowBase({ attributes: { strength: 14 }, characteristics: { hitPoints: { current: 7 } } }, sbS, F), rC = S.aliasFromShadowBase({ attributes: { strength: 25 } }, sbS, F);
        check('ShadowBase bridge: every value goes through the field\'s own rules — past max it clamps (ST 25 → 20), past the wire-safe range it is dropped (ST, HP 1e20); ordinary values land as they are', !('f_st' in rA.values) && !('f_hp' in rA.values) && rC.values.f_st === 20 && rB.values.f_st === 14 && rB.values.f_hp && rB.values.f_hp.cur === 7, JSON.stringify([rA.values, rB.values, rC.values]));
    }
    {   // the wire's packer refuses a whole number past 64 bits: stored numbers stay within +/-1e15
        const bs = cleanSystem({ v: 1, name: 'B', fields: [{ id: 'f_g', key: 'Gold', kind: 'number', def: 0, vis: 'all', max: 1e20 }, { id: 'f_t', key: 'T', kind: 'number', def: 0, vis: 'all', step: 1e-300 }, { id: 'f_r', key: 'R', kind: 'resource', maxFormula: '10', vis: 'all' }], rolls: [] }, { F, gmView: true });
        const bg = bs.fields.find(f => f.id === 'f_g'), bt = bs.fields.find(f => f.id === 'f_t'), br = bs.fields.find(f => f.id === 'f_r');
        check('numbers: a value, a bound or a resource past +/-1e15 is refused (the packer would refuse it and every join after it); a tiny step never rounds past the bound; ordinary numbers pass',
            !('max' in bg) && cleanValue(bg, 1e20) === undefined && cleanValue(cleanSystem({ v: 1, name: 'M', fields: [{ id: 'f_m', key: 'M', kind: 'number', def: 1, vis: 'all', min: 1, max: 1e15, step: 2 }], rolls: [] }, { F, gmView: true }).fields[0], 1e15) === 1e15 && cleanValue(bg, '99999999999999999999') === undefined && cleanValue(bg, 123456) === 123456 && cleanValue(bt, 1e14) !== Infinity && cleanValue(br, { cur: 1e20 }) === undefined && cleanValue(br, { cur: 7 }).cur === 7,
            JSON.stringify([bg, cleanValue(bg, 1e20), cleanValue(bt, 1e14)]));
    }
    const fld_str = sys.fields.find(f => f.id === 'f_str'), fld_hp = sys.fields.find(f => f.id === 'f_hp'), fld_notes = sys.fields.find(f => f.id === 'f_notes'), fld_align = sys.fields.find(f => f.id === 'f_align');
    check('cleanValue: number clamps and steps; toggle strict; text strips control chars; notes keep newlines; select strict; resource {cur}', cleanValue(fld_str, 99) === 30 && cleanValue(fld_str, 12.4) === 12 && cleanValue(fld_str, 'x') === undefined && cleanValue(sys.fields.find(f => f.id === 'f_prone'), 1) === undefined && cleanValue(sys.fields.find(f => f.id === 'f_class'), 'a' + String.fromCharCode(1) + 'b') === 'ab' && cleanValue(fld_notes, 'a' + NL + 'b' + String.fromCharCode(1)) === 'a' + NL + 'b' && cleanValue(fld_align, 'Nope') === undefined && j(cleanValue(fld_hp, { cur: 99 }, { max: 16 })) === j({ cur: 16 }) && j(cleanValue(fld_hp, -5, { max: 16 })) === j({ cur: 0 }));
    check('applyEdit: a player may edit owner fields within range; not GM-edit, formula, GM-only or missing fields; resource capped by the evaluated max', (() => { const sysE = cleanSystem({ fields: sys.fields.concat([{ id: 'f_locked', key: 'Locked', kind: 'number', edit: 'gm' }]) }, { F, gmView: true }); const ok = applyEdit(sysE, ch, 'f_str', 20, F, { player: true }); const hp = applyEdit(sysE, ch, 'f_hp', { cur: 50 }, F, { player: true }); const lock = applyEdit(sysE, ch, 'f_locked', 1, F, { player: true }); const gmOk = applyEdit(sysE, ch, 'f_locked', 1, F, {}); const fm = applyEdit(sysE, ch, 'f_strmod', 1, F, {}); const sec = applyEdit(sysE, ch, 'f_secret', 1, F, { player: true }); const miss = applyEdit(sysE, ch, 'f_zzz', 1, F, {}); return ok.ok && ok.value === 20 && hp.ok && hp.value.cur === 16 && lock.reason === 'field' && gmOk.ok && fm.reason === 'field' && sec.reason === 'field' && miss.reason === 'field'; })());
    check('cleanChar: bad id null; npc forces no owner; values coerced, unknown ids dropped; portrait rule', (() => { const c = cleanChar({ id: 'c_x', name: 'N'.repeat(100), ownerId: 'u_1', npc: true, portrait: '/saves/images/m/a.png', values: { f_str: '40', f_zzz: 1, f_class: 5, f_prone: true } }, sys); const p = cleanChar({ id: 'c_y', portrait: '/saves/images/../x.png', values: {} }, sys); return cleanChar({ id: 'x' }, sys) === null && c.name.length === 60 && c.ownerId === '' && c.npc && c.portrait === '/saves/images/m/a.png' && c.values.f_str === 30 && !('f_zzz' in c.values) && !('f_class' in c.values) && c.values.f_prone === true && p.portrait === ''; })());
    check('cleanCharEdit: shapes', j(cleanCharEdit({ rid: 'q1', charId: 'c_1', fieldId: 'f_str', value: 5 })) === j({ rid: 'q1', charId: 'c_1', fieldId: 'f_str', value: 5 }) && cleanCharEdit({ rid: 'q1', charId: 'c_1', fieldId: 'f_str', value: 'x'.repeat(20001) }) === null && cleanCharEdit({ rid: 'q1', charId: 'bad', fieldId: 'f_str', value: 1 }) === null && cleanCharEdit({ rid: 'q1', charId: 'c_1', fieldId: 'f_str', value: [1] }) === null && cleanCharEdit({ rid: 'q1', charId: 'c_1', fieldId: 'f_hp', value: { cur: '7', junk: 1 } }).value.cur === 7);

    /* ---- what a player receives ---- */
    check('charFor: NPC and ownerless -> null; owner gets every visible value; another player gets hover fields only; GM-only never', (() => { const own = charFor(ch, sys, 'u_pat'); const other = charFor(ch, sys, 'u_sam'); const npc = charFor(Object.assign({}, ch, { npc: true, ownerId: '' }), sys, 'u_pat'); const c3 = Object.assign({}, ch, { values: Object.assign({}, ch.values, { f_secret: 9 }) }); const own3 = charFor(c3, sys, 'u_pat'); return own && j(Object.keys(own.values)) === j(['f_str', 'f_stealth', 'f_prone', 'f_class', 'f_notes', 'f_align']) && !own.partial && other && j(Object.keys(other.values)) === j(['f_prone']) && other.partial && npc === null && !('f_secret' in own3.values); })(), j(charFor(ch, sys, 'u_sam')));

    /* ---- layout and bridge ---- */
    check('autoLayout: one section per kind group plus rolls, notes full-row', (() => { const a = autoLayout(sys); return j(a.sections.map(s => s.title)) === j(['Attributes', 'Derived', 'Resources', 'Skills', 'Conditions', 'Details', 'Notes', 'Rolls']) && a.sections[6].fields[0].w === 'row' && a.sections[7].fields.length === 2; })(), j(autoLayout(sys).sections.map(s => s.title)));
    check('aliasFromShadowBase: attributes, a resource current, skill level minus base (d20-like) and absolute (3d6)', (() => { const json = { attributes: { strength: { value: 14 }, dexterity: { value: 12 } }, characteristics: { hitPoints: { effective: 14, current: 9 } }, skills: [{ name: 'Stealth', level: 15 }] }; const d = aliasFromShadowBase(json, cleanSystem(d20, { F, gmView: true }), F); const g = aliasFromShadowBase(json, cleanSystem(g3d6, { F, gmView: true }), F); return d.values.f_str === 14 && d.values.f_dex === 12 && j(d.values.f_hp) === j({ cur: 9 }) && d.values.f_sk_stea === 14 && g.values.f_st === 14 && g.values.f_sk_stealth === 15 && j(g.values.f_hp) === j({ cur: 9 }); })(), j(aliasFromShadowBase({ attributes: { strength: { value: 14 }, dexterity: { value: 12 } }, skills: [{ name: 'Stealth', level: 15 }] }, cleanSystem(d20, { F, gmView: true }), F)));
    check('emptySystem shape', j(emptySystem()) === j({ v: 1, name: '', preset: '', updated: 0, fields: [], rolls: [], items: [], combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: '', cover: { on: false, style: 'graded' } }, sheet: { sections: [] } }));

    /* ---- cover (1.5.0): cleanCover whitelist + coverTier mapping ---- */
    check('cleanCover: on boolean, style whitelist (graded default), junk -> off/graded', (() => {
        const a = S.cleanCover({ on: 1, style: 'binary' }), b = S.cleanCover({ on: true, style: 'evil' }), c = S.cleanCover(null);
        return a.on === false && a.style === 'binary' && b.on === true && b.style === 'graded' && c.on === false && c.style === 'graded'; })());
    check('cleanCombat carries a cleaned cover (in key order after hpResource)', (() => {
        const o = S.cleanCombat({ cover: { on: true, style: 'binary' } }, {});
        return o.cover.on === true && o.cover.style === 'binary' && j(Object.keys(o)) === j(['blastAuto', 'blastRoller', 'hpResource', 'cover']); })());
    check('coverTier: off -> null; graded maps coverage to half/three-quarters; no line of effect -> Total(block); binary -> Cover/none', (() => {
        const off = { combat: { cover: { on: false, style: 'graded' } } };
        const gr = { combat: { cover: { on: true, style: 'graded' } } };
        const bn = { combat: { cover: { on: true, style: 'binary' } } };
        return S.coverTier(off, 0.9, true) === null
            && S.coverTier(gr, 0.1, true) === null
            && S.coverTier(gr, 0.25, true).name === 'Half cover'
            && S.coverTier(gr, 0.75, true).name === 'Three-quarters cover'
            && S.coverTier(gr, 0.99, false).name === 'Total cover' && S.coverTier(gr, 0.99, false).block === true
            && S.coverTier(gr, 0.99, true).name === 'Three-quarters cover' && S.coverTier(gr, 0.99, true).block === false
            && S.coverTier(bn, 0.4, true).name === 'Cover' && S.coverTier(bn, 0, true) === null && S.coverTier(bn, 0, false).name === 'Total cover'; })());

    /* ---- rolls from the sheet (SB3) ---- */
    check('gmOnlyNames: a GM-only field by key or by reserved suffix, others not', (() => { const sys = cleanSystem({ v: 1, name: 'T', fields: [{ id: 'f_str', key: 'STR', kind: 'number', def: 10, vis: 'all' }, { id: 'f_sec', key: 'Secret', kind: 'number', def: 1, vis: 'gm' }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '10', vis: 'gm' }], rolls: [], sheet: { sections: [] } }, { F, gmView: true }); const o = S.gmOnlyNames(sys, [{ name: 'STR', value: 10 }, { name: 'secret', value: 1 }, { name: 'HP.max', value: 10 }, { name: 'Nope', value: 0 }]); return o.length === 2 && o[0] === 'secret' && o[1] === 'HP.max' && S.gmOnlyNames(null, []).length === 0 && S.gmOnlyNames(sys, null).length === 0; })());
    check('initRoll: the init-flagged roll or null', (() => { const sys = cleanSystem({ v: 1, name: 'T', fields: [], rolls: [{ id: 'r_a', label: 'A', formula: 'd20', vis: 'all' }, { id: 'r_i', label: 'Init', formula: 'd20 + 1', vis: 'all', init: true }], sheet: { sections: [] } }, { F, gmView: true }); const r = S.initRoll(sys); return r && r.id === 'r_i' && S.initRoll({ rolls: [] }) === null && S.initRoll(null) === null; })());

    check('the automatic layout, saved as a real one, survives cleanSystem section by section', (() => { const c1 = cleanSystem(d20, { F, gmView: true }); const al = autoLayout(c1); const c2 = cleanSystem(Object.assign({}, c1, { sheet: al }), { F, gmView: true }); return c2 && c2.sheet.sections.length === al.sections.length && c2.sheet.sections.every((s, i) => s.id === al.sections[i].id && s.fields.length === al.sections[i].fields.length); })());

    /* ---- Stage 3: per-section styling + stat tiles ---- */
    check('Stage 3: cleanSheet keeps a section style (hex only, lowercased) and drops bad values', (() => {
        const sys = cleanSystem({ v: 1, name: 'T', fields: [{ id: 'f_str', key: 'STR', kind: 'number', def: 10, vis: 'all' }], rolls: [], sheet: { sections: [
            { id: 's_a', title: 'A', cols: 1, style: { accent: '#E0A54F', bg: '#20202c', border: 'red' }, fields: [{ id: 'f_str', w: 1 }] },
            { id: 's_b', title: 'B', cols: 1, style: { accent: 'nope' }, fields: [] }
        ] } }, { F, gmView: true });
        const a = sys.sheet.sections.find(s => s.id === 's_a'), b = sys.sheet.sections.find(s => s.id === 's_b');
        return a && a.style && a.style.accent === '#e0a54f' && a.style.bg === '#20202c' && a.style.border === undefined && b && b.style === undefined;
    })());
    check('Stage 3: cleanField keeps tile on numeric kinds, drops it elsewhere', (() => {
        const sys = cleanSystem({ v: 1, name: 'T', fields: [
            { id: 'f_str', key: 'STR', kind: 'number', def: 10, vis: 'all', tile: true },
            { id: 'f_nm', key: 'Name', kind: 'text', vis: 'all', tile: true }
        ], rolls: [], sheet: { sections: [] } }, { F, gmView: true });
        const s2 = sys.fields.find(f => f.id === 'f_str'), n2 = sys.fields.find(f => f.id === 'f_nm');
        return s2 && s2.tile === true && n2 && n2.tile === undefined;
    })());

    /* ---- Stage 4: rich item tables ---- */
    check('Stage 4: cleanField keeps a rich item table (whitelisted columns, deduped, chips/footer) on item-list only', (() => {
        const sys = cleanSystem({ v: 1, name: 'T', fields: [
            { id: 'f_gear', key: 'Gear', kind: 'item-list', vis: 'all', table: { columns: ['category', 'area', 'category', 'nope', 'cost'], chips: true, footer: true } },
            { id: 'f_bad', key: 'Bag', kind: 'item-list', vis: 'all', table: { columns: [], chips: false } },
            { id: 'f_str', key: 'STR', kind: 'number', def: 10, vis: 'all', table: { columns: ['category'] } }
        ], rolls: [], items: [], sheet: { sections: [] } }, { F, gmView: true });
        const g = sys.fields.find(f => f.id === 'f_gear'), b = sys.fields.find(f => f.id === 'f_bad'), s = sys.fields.find(f => f.id === 'f_str');
        return g && g.table && JSON.stringify(g.table.columns) === JSON.stringify(['category', 'area', 'cost']) && g.table.chips === true && g.table.footer === true
            && b && b.table === undefined            // an empty table config drops back to the plain list
            && s && s.table === undefined;           // a table never attaches to a non-item-list field
    })());
    check('Stage 4: an item table with only a footer survives, and a non-object table is dropped', (() => {
        const sys = cleanSystem({ v: 1, name: 'T', fields: [
            { id: 'f_a', key: 'A', kind: 'item-list', vis: 'all', table: { footer: true } },
            { id: 'f_b', key: 'B', kind: 'item-list', vis: 'all', table: 'yes' }
        ], rolls: [], items: [], sheet: { sections: [] } }, { F, gmView: true });
        const a = sys.fields.find(f => f.id === 'f_a'), b = sys.fields.find(f => f.id === 'f_b');
        return a && a.table && a.table.footer === true && a.table.columns === undefined && b && b.table === undefined;
    })());

    /* ---- Stage 5c: the pinned band — placements under the name on every tab; own cap, own dedupe, band-able kinds only ---- */
    {
        const BAND_FIELDS = [
            { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '10', def: 'max', min: 0, vis: 'all' }, { id: 'f_str', key: 'STR', kind: 'number', def: 10, vis: 'all' },
            { id: 'f_prone', key: 'Prone', kind: 'toggle', def: false, vis: 'all' }, { id: 'f_ac', key: 'AC', kind: 'formula', formula: '10 + STR', vis: 'all' },
            { id: 'f_sw', key: 'Sword', kind: 'skill', base: 'STR', def: 0, vis: 'all' }, { id: 'f_txt', key: 'Name', kind: 'text', def: '', vis: 'all' },
            { id: 'f_notes', key: 'Notes', kind: 'notes', vis: 'all' }, { id: 'f_sel', key: 'Size', kind: 'select', options: ['S', 'M'], def: 'M', vis: 'all' },
            { id: 'f_kit', key: 'Kit', kind: 'item-list', vis: 'all' }
        ];
        const BAND_ROLLS = [{ id: 'r_a', label: 'Attack', formula: 'd20 + STR', vis: 'all' }];
        const bandSys = cleanSystem({ v: 1, name: 'B', fields: BAND_FIELDS, rolls: BAND_ROLLS, sheet: { sections: [{ id: 's_1', title: 'Main', cols: 2, fields: [{ id: 'f_hp', w: 1 }, { roll: 'r_a', w: 1 }] }],
            band: [{ id: 'f_hp', w: 'row', extra: 1 }, { roll: 'r_a' }, { id: 'f_hp' }, { roll: 'r_a' }, { id: 'f_txt' }, { id: 'f_notes' }, { id: 'f_sel' }, { id: 'f_kit' }, { kind: 'heading', text: 'x' }, 'f_str', null, { id: 'f_nope' }, { roll: 'r_nope' }, { id: 'f_prone' }, { id: 'f_ac' }, { id: 'f_sw' }, { id: 'f_str' }] } }, { F, gmView: true });
        check('Stage 5c: the band keeps band-able fields and rolls in order, once each, as bare { id } / { roll }, and drops the rest', j(bandSys.sheet.band) === j([{ id: 'f_hp' }, { roll: 'r_a' }, { id: 'f_prone' }, { id: 'f_ac' }, { id: 'f_sw' }, { id: 'f_str' }]), j(bandSys.sheet.band));
        check('Stage 5c: a field on the band still keeps its section placement (the band never evicts it)', j(bandSys.sheet.sections[0].fields) === j([{ id: 'f_hp', w: 1 }, { roll: 'r_a', w: 1 }]), j(bandSys.sheet.sections[0].fields));
        const many = []; for (let i = 0; i < LIMITS.band + 5; i++) many.push({ id: 'f_n' + i, key: 'N' + i, kind: 'number', def: 0, vis: 'all' });
        const fullSecs = []; for (let s = 0; s < 16; s++) fullSecs.push({ id: 's_full' + s, title: 'S' + s, cols: 1, fields: Array.from({ length: 20 }, () => ({ kind: 'divider', w: 'row' })) });   // 320 placements offered, LIMITS.placements kept
        const capped = cleanSystem({ v: 1, name: 'B', fields: many, rolls: [], sheet: { sections: fullSecs, band: many.map(f => ({ id: f.id })) } }, { F, gmView: true });
        const placedN = capped.sheet.sections.reduce((n, s) => n + s.fields.length, 0);
        check('Stage 5c: the band is capped at LIMITS.band (' + LIMITS.band + ') on its own counter: a full band leaves the sections their whole placements cap', capped.sheet.band.length === LIMITS.band && placedN === LIMITS.placements, j({ band: capped.sheet.band.length, placed: placedN }));
        const noBand = cleanSystem({ v: 1, name: 'B', fields: BAND_FIELDS, rolls: [], sheet: { sections: [] } }, { F, gmView: true });
        const strBand = cleanSystem({ v: 1, name: 'B', fields: BAND_FIELDS, rolls: [], sheet: { sections: [], band: 'f_hp' } }, { F, gmView: true });
        const emptyBand = cleanSystem({ v: 1, name: 'B', fields: BAND_FIELDS, rolls: [], sheet: { sections: [], band: [{ id: 'f_txt' }] } }, { F, gmView: true });
        check('Stage 5c: no band, a non-array band or a band with nothing band-able leaves the key ABSENT (a system without a band is unchanged)', !('band' in noBand.sheet) && !('band' in strBand.sheet) && !('band' in emptyBand.sheet));
        const noSecs = cleanSystem({ v: 1, name: 'B', fields: BAND_FIELDS, rolls: [], sheet: { band: [{ id: 'f_str' }] } }, { F, gmView: true });
        check('Stage 5c: a band survives a sheet with no sections array (the automatic layout + a band)', noSecs.sheet && j(noSecs.sheet.band) === j([{ id: 'f_str' }]) && j(noSecs.sheet.sections) === '[]');
        const pFields = [{ id: 'f_secret', key: 'Secret', kind: 'number', def: 1, vis: 'gm' }, { id: 'f_leak', key: 'Leak', kind: 'formula', formula: 'Secret + 1', vis: 'all' }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '10', def: 'max', min: 0, vis: 'all' }];
        const pRolls = [{ id: 'r_s', label: 'S', formula: 'd20 + Secret', vis: 'all' }, { id: 'r_ok', label: 'Ok', formula: 'd20', vis: 'all' }];
        const pBand = [{ id: 'f_secret' }, { id: 'f_leak' }, { roll: 'r_s' }, { id: 'f_hp' }, { roll: 'r_ok' }];
        const gmB = cleanSystem({ v: 1, name: 'B', fields: pFields, rolls: pRolls, sheet: { sections: [], band: pBand } }, { F, gmView: true });
        const plB = cleanSystem({ v: 1, name: 'B', fields: pFields, rolls: pRolls, sheet: { sections: [], band: pBand } }, { F, gmView: false });
        check('Stage 5c: the GM keeps every pin; the players\' view drops the GM-only field and the roll that named it, keeps the rest in order', j(gmB.sheet.band) === j(pBand) && j(plB.sheet.band) === j([{ id: 'f_leak' }, { id: 'f_hp' }, { roll: 'r_ok' }]) && plB.fields.find(f => f.id === 'f_leak').formula === null, j(plB.sheet.band));
        check('Stage 5c: BAND_KINDS is published and is exactly number/formula/resource/skill/toggle', S.BAND_KINDS && j(Object.keys(S.BAND_KINDS)) === j(['number', 'formula', 'resource', 'skill', 'toggle']));
        // the render: the band is built from sys.sheet (never the auto-layout fallback) BEFORE the tab strip, its inputs tagged for focus restore
        const shSrc = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8');
        check('Stage 5c: buildSections renders the band from sys.sheet before the tab strip and tags its inputs with data-band (Stage 6: through bandInto)', /body\.textContent = '';[\s\S]{0,2200}?var bandDef = \(sys\.sheet && Array\.isArray\(sys\.sheet\.band\)\) \? sys\.sheet\.band : null;[\s\S]{0,900}?bandInto\(frame, bandDef, pctx\);[\s\S]{0,900}?if \(tabs\) \{/.test(shSrc) && /function bandInto\(frame, bandDef, ctx\) \{[\s\S]{0,1500}?'sheet-band'[\s\S]{0,1200}?dataset\.band = '1'/.test(shSrc) && /k\.band \? '\[data-band\]' : ':not\(\[data-band\]\)'/.test(shSrc));
        check('Stage 5c: "Start from the automatic layout" keeps the tabs and the band; "Use the automatic layout" asks about both', /sysLayoutAuto'\) \{[\s\S]{0,700}?keepBand[\s\S]{0,700}?draft\.sheet\.band = keepBand/.test(shSrc) && /sysLayoutClear'\) \{[\s\S]{0,300}?draft\.sheet\.band[\s\S]{0,300}?no pinned band/.test(shSrc));
    }

    /* ---- Stage 5d: the header block (identity rows + ledger figures, read-only) and dashboard sections ---- */
    {
        const HB_FIELDS = [
            { id: 'f_class', key: 'Class', kind: 'text', def: 'Rogue', vis: 'all' }, { id: 'f_size', key: 'Size', kind: 'select', options: ['S', 'M'], def: 'M', vis: 'all' },
            { id: 'f_str', key: 'STR', kind: 'number', def: 10, vis: 'all' }, { id: 'f_ac', key: 'AC', kind: 'formula', formula: '10 + STR', vis: 'all' },
            { id: 'f_sw', key: 'Sword', kind: 'skill', base: 'STR', def: 0, vis: 'all' }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '10', def: 'max', min: 0, vis: 'all' },
            { id: 'f_prone', key: 'Prone', kind: 'toggle', def: false, vis: 'all' }, { id: 'f_notes', key: 'Notes', kind: 'notes', vis: 'all' }, { id: 'f_kit', key: 'Kit', kind: 'item-list', vis: 'all' },
            { id: 'f_secret', key: 'Secret', kind: 'number', def: 1, vis: 'gm' }, { id: 'f_leak', key: 'Leak', kind: 'formula', formula: 'Secret - 5', vis: 'all' }, { id: 'f_empty', key: 'Empty', kind: 'text', def: '', vis: 'all' }
        ];
        const hbSys = cleanSystem({ v: 1, name: 'H', fields: HB_FIELDS, rolls: [{ id: 'r_a', label: 'A', formula: 'd20', vis: 'all' }], sheet: { sections: [{ id: 's_dash', title: 'Pools', cols: 2, pinned: true, fields: [{ id: 'f_hp', w: 1 }] }, { id: 's_tab', title: 'Tab', cols: 1, pinned: 0, fields: [] }],
            identity: [{ id: 'f_class', w: 'row' }, { id: 'f_size' }, { id: 'f_class' }, { id: 'f_notes' }, { id: 'f_kit' }, { roll: 'r_a' }, { kind: 'heading' }, 'f_str', null, { id: 'f_nope' }, { id: 'f_str' }, { id: 'f_ac' }, { id: 'f_sw' }, { id: 'f_hp' }, { id: 'f_prone' }, { id: 'f_secret' }],
            ledger: [{ id: 'f_str' }, { id: 'f_class' }, { id: 'f_size' }, { id: 'f_prone' }, { id: 'f_ac' }, { id: 'f_sw' }, { id: 'f_hp' }, { id: 'f_str' }, { id: 'f_secret' }] } }, { F, gmView: true });
        check('Stage 5d: identity rows keep every read-only kind but notes and item lists, in order, once each, as bare { id }; rolls, headings and junk drop', j(hbSys.sheet.identity) === j([{ id: 'f_class' }, { id: 'f_size' }, { id: 'f_str' }, { id: 'f_ac' }, { id: 'f_sw' }, { id: 'f_hp' }, { id: 'f_prone' }, { id: 'f_secret' }]), j(hbSys.sheet.identity));
        check('Stage 5d: ledger figures keep numeric kinds only (number/formula/skill/resource), in order, once each', j(hbSys.sheet.ledger) === j([{ id: 'f_str' }, { id: 'f_ac' }, { id: 'f_sw' }, { id: 'f_hp' }, { id: 'f_secret' }]), j(hbSys.sheet.ledger));
        check('Stage 5d: a section keeps pinned: true (above the tabs) and drops a falsy flag', hbSys.sheet.sections[0].pinned === true && !('pinned' in hbSys.sheet.sections[1]), j(hbSys.sheet.sections));
        const hbPl = cleanSystem({ v: 1, name: 'H', fields: HB_FIELDS, rolls: [], sheet: { sections: [], identity: [{ id: 'f_secret' }, { id: 'f_class' }, { id: 'f_leak' }], ledger: [{ id: 'f_secret' }, { id: 'f_leak' }, { id: 'f_str' }] } }, { F, gmView: false });
        check('Stage 5d: the players\' view drops the GM-only id from both lists and keeps the rest in order (the formula naming it is nulled, not dropped)', j(hbPl.sheet.identity) === j([{ id: 'f_class' }, { id: 'f_leak' }]) && j(hbPl.sheet.ledger) === j([{ id: 'f_leak' }, { id: 'f_str' }]) && hbPl.fields.find(f => f.id === 'f_leak').formula === null, j([hbPl.sheet.identity, hbPl.sheet.ledger]));
        const manyId = []; for (let i = 0; i < LIMITS.identity + 3; i++) manyId.push({ id: 'f_i' + i, key: 'I' + i, kind: 'number', def: 0, vis: 'all' });
        const hbCap = cleanSystem({ v: 1, name: 'H', fields: manyId, rolls: [], sheet: { sections: [], identity: manyId.map(f => ({ id: f.id })), ledger: manyId.map(f => ({ id: f.id })), band: manyId.map(f => ({ id: f.id })) } }, { F, gmView: true });
        check('Stage 5d: identity and ledger cap on their own counters (' + LIMITS.identity + ' / ' + LIMITS.ledger + '), beside a full band', hbCap.sheet.identity.length === LIMITS.identity && hbCap.sheet.ledger.length === LIMITS.ledger && hbCap.sheet.band.length === LIMITS.band, j({ i: hbCap.sheet.identity.length, l: hbCap.sheet.ledger.length, b: hbCap.sheet.band.length }));
        const hbNone = cleanSystem({ v: 1, name: 'H', fields: HB_FIELDS, rolls: [], sheet: { sections: [] } }, { F, gmView: true }), hbBad = cleanSystem({ v: 1, name: 'H', fields: HB_FIELDS, rolls: [], sheet: { sections: [], identity: 'f_class', ledger: [{ id: 'f_notes' }] } }, { F, gmView: true });
        check('Stage 5d: no list, a non-array or nothing eligible leaves the keys ABSENT', !('identity' in hbNone.sheet) && !('ledger' in hbNone.sheet) && !('identity' in hbBad.sheet) && !('ledger' in hbBad.sheet));
        const hbNoSecs = cleanSystem({ v: 1, name: 'H', fields: HB_FIELDS, rolls: [], sheet: { identity: [{ id: 'f_class' }], ledger: [{ id: 'f_str' }] } }, { F, gmView: true });
        check('Stage 5d: both lists survive a sheet with no sections array (the automatic layout + a header block)', j(hbNoSecs.sheet.identity) === j([{ id: 'f_class' }]) && j(hbNoSecs.sheet.ledger) === j([{ id: 'f_str' }]));
        check('Stage 5d: IDENTITY_KINDS and LEDGER_KINDS are published with exactly the decided kinds', S.IDENTITY_KINDS && j(Object.keys(S.IDENTITY_KINDS)) === j(['number', 'formula', 'resource', 'skill', 'toggle', 'text', 'select']) && S.LEDGER_KINDS && j(Object.keys(S.LEDGER_KINDS)) === j(['number', 'formula', 'resource', 'skill']));
        // headerEntry: what an entry prints, from the same resolved values the sheet prints
        const hbAll = resolveAll(hbSys, { id: 'c_h', name: 'H', ownerId: '', npc: false, values: { f_str: -3, f_prone: true, f_hp: { cur: 4 }, f_sw: 2, f_empty: '' } }, F);
        const fld = id => hbSys.fields.find(f => f.id === id); const HE = S.headerEntry;
        check('Stage 5d: headerEntry prints text/select/number/formula/skill/resource as the sheet does, marks a negative, chips a toggle only while on, keeps an empty text as a dash (5g)',
            j(HE(fld('f_class'), hbAll.f_class)) === j({ text: 'Rogue' }) && j(HE(fld('f_size'), hbAll.f_size)) === j({ text: 'M' }) && j(HE(fld('f_str'), hbAll.f_str)) === j({ text: '-3', neg: true })
            && j(HE(fld('f_ac'), hbAll.f_ac)) === j({ text: '7' }) && j(HE(fld('f_sw'), hbAll.f_sw)) === j({ text: '-1', neg: true }) && j(HE(fld('f_hp'), hbAll.f_hp)) === j({ text: '4 / 10' })
            && j(HE(fld('f_prone'), hbAll.f_prone)) === j({ chip: true, text: 'Prone' }) && HE(fld('f_prone'), { value: false, text: 'no' }) === null && j(HE(fld('f_empty'), hbAll.f_empty)) === j({ text: '\u2014', empty: true }) && HE(fld('f_class'), undefined) === null,
            j([HE(fld('f_class'), hbAll.f_class), HE(fld('f_str'), hbAll.f_str), HE(fld('f_ac'), hbAll.f_ac), HE(fld('f_sw'), hbAll.f_sw), HE(fld('f_hp'), hbAll.f_hp), HE(fld('f_prone'), hbAll.f_prone)]));
        const plAll = resolveAll(hbPl, { id: 'c_h', name: 'H', ownerId: '', npc: false, values: {} }, F);
        check('Stage 5d: a formula a player may not see prints as an em dash with the reason as its title (never blank, never the name)', (e => e && e.text === '\u2014' && /GM only/.test(e.error))(HE(hbPl.fields.find(f => f.id === 'f_leak'), plAll.f_leak)), j(HE(hbPl.fields.find(f => f.id === 'f_leak'), plAll.f_leak)));
        // the render: the header block goes in first (before the band, from sys.sheet), dashboard sections before the strip
        const shSrc2 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8');
        check('Stage 5d: buildSections puts the header block first (its own .sheet-head, not sticky), then dashboard sections, then the frame = band + tab strip', /body\.textContent = '';[\s\S]{0,1500}?var head = el\('div', 'sheet-head'\);\s*headerBlocks\(head, sys, c, all, gm, own\);[\s\S]{0,200}?if \(head\.childNodes\.length\) body\.appendChild\(head\);[\s\S]{0,120}?var frame = el\('div', 'sheet-frame'\);/.test(shSrc2) && /frame\.appendChild\(bandEl\);/.test(shSrc2) && /sec\.pinned[\s\S]{0,200}?'sheet-dash'[\s\S]{0,200}?if \(stripEl\) frame\.appendChild\(stripEl\);\s*if \(frame\.childNodes\.length\) body\.appendChild\(frame\);/.test(shSrc2) && /function headerBlocks\(head, sys, c, all, gm, own\)[\s\S]{0,1800}?if \(c\.partial && !f\.hover\) return;/.test(shSrc2));
        check('Stage 5d: the stuck frame\'s height is reserved as the scroller\'s scroll padding (keyboard focus is never left under it), after every render and after the panel widens', /function syncFramePad\(body\)[\s\S]{0,300}?body\.style\.scrollPaddingTop = fr\.offsetHeight \+ 'px'/.test(shSrc2) && (shSrc2.match(/syncFramePad\((body|container)\);/g) || []).length >= 3);
        check('Stage 5d: a tab opened while the frame is stuck starts at its own top (the scroll returns to where the frame sits in the flow)', /var wasStuck = body\.scrollTop > frameFlowTop\(body\);[\s\S]{0,200}?\(rerender \|\| renderSheet\)\(\);\s*if \(wasStuck\) body\.scrollTop = frameFlowTop\(body\);/.test(shSrc2) && /function frameFlowTop\(body\)/.test(shSrc2));
        const cssSrc = fs.readFileSync(path.join(app, 'style.css'), 'utf8');
        check('Stage 5d: the frame (band + tab strip) is the ONE sticky element; the header block and the band themselves are not sticky', /\.sheet-frame \{ position: sticky; top: 0;/.test(cssSrc) && !/\.sheet-band \{ position: sticky/.test(cssSrc) && !/\.sheet-head \{[^}]*sticky/.test(cssSrc) && /#sheetBody:has\(> \.sheet-frame\)/.test(cssSrc) && !/:has\(> \.sheet-band\)/.test(cssSrc));
        check('Stage 5d: "Start from the automatic layout" keeps the identity rows and ledger figures too', /keepId = sheetList\('identity'\), keepLed = sheetList\('ledger'\)[\s\S]{0,900}?draft\.sheet\.identity = keepId; if \(keepLed\.length\) draft\.sheet\.ledger = keepLed;/.test(shSrc2));
    }

    /* ---- Stage 5e: the gradient slider — a display option on a ranged number ---- */
    {
        const sl = (o) => cleanField(Object.assign({ id: 'f_al', key: 'Align', kind: 'number', def: 0, min: -100, max: 100, vis: 'all' }, o), F, true);
        check('Stage 5e: slider: true on a ranged number keeps an empty slider object (the defaults)', j(sl({ slider: true }).slider) === j({}), j(sl({ slider: true })));
        const rich = sl({ slider: { low: '  Dark\u0001Side ', high: 'x'.repeat(80), lowColor: '#FF0000', highColor: 'nope', evil: '<script>', onclick: 1 } });
        check('Stage 5e: end labels are capped and control-stripped, colours hex-validated and lowercased, anything else dropped', j(rich.slider) === j({ low: 'Dark Side', high: 'x'.repeat(LIMITS.label), lowColor: '#ff0000' }), j(rich.slider));
        check('Stage 5e: a slider is kept on a number before it has a min and a max (the sheet draws it once both exist, so nothing set is lost on Save); none on other kinds, none from a non-object non-true value', j(sl({ max: undefined, slider: { low: 'A', lowColor: '#102030' } }).slider) === j({ low: 'A', lowColor: '#102030' }) && j(sl({ min: undefined, max: undefined, slider: true }).slider) === j({}) && sl({ slider: 'yes' }).slider === undefined && sl({ slider: 1 }).slider === undefined
            && cleanField({ id: 'f_s', key: 'Sw', kind: 'skill', def: 0, min: 0, max: 10, vis: 'all', slider: true }, F, true).slider === undefined && cleanField({ id: 'f_r', key: 'HP', kind: 'resource', maxFormula: '10', def: 'max', min: 0, vis: 'all', slider: true }, F, true).slider === undefined);
        const plSl = cleanSystem({ v: 1, name: 'S', fields: [{ id: 'f_al', key: 'Align', kind: 'number', def: 0, min: -100, max: 100, vis: 'all', slider: { low: 'Dark', high: 'Light' } }], rolls: [], sheet: { sections: [] } }, { F, gmView: false });
        check('Stage 5e: the slider travels in the players\' view and the field is still a plain number to the resolver', j(plSl.fields[0].slider) === j({ low: 'Dark', high: 'Light' }) && resolveAll(plSl, { id: 'c_s', name: 'S', ownerId: '', npc: false, values: { f_al: -40 } }, F).f_al.text === '-40');
        const shSrc3 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), cssSrc3 = fs.readFileSync(path.join(app, 'style.css'), 'utf8');
        check('Stage 5e: the range coalesces its commits (a change per arrow step → one edit after the last) and never re-sends an unchanged value', /rg\.addEventListener\('change', function\(\) \{ clearTimeout\(rgTimer\); rgTimer = setTimeout\(function\(\) \{ if \(rg\.value === rgSent\) return;/.test(shSrc3) && /if \(k === 'number' && f\.slider && f\.min !== undefined && f\.max !== undefined\)/.test(shSrc3));
        check('Stage 5e: the slider row keeps a compact number box (beats input.field width:100%), wraps in a narrow cell, and a tile gives the wrapper an auto basis', /\.sheet-has-slider \.sheet-num \{ flex: 0 0 auto; width: 64px; \}/.test(cssSrc3) && /\.sheet-has-slider \.sheet-ctl \{ align-items: flex-end; flex-wrap: wrap; \}/.test(cssSrc3) && /\.sheet-field\.sheet-tile\.sheet-has-slider \.sheet-slider \{ flex: 0 0 auto;/.test(cssSrc3));
        check('Stage 5e: the sheet renders a ranged number with a slider as a range input on a gradient track beside the number box, and the editor offers the Slider flag with its labels and colours', /if \(k === 'number' && f\.slider && f\.min !== undefined && f\.max !== undefined\)[\s\S]{0,900}?'sheet-range'[\s\S]{0,600}?rg\.dataset\.part = 'range'[\s\S]{0,400}?linear-gradient\(90deg, /.test(shSrc3) && /sys-slider-chk/.test(shSrc3) && /sys-slider-lowColor[\s\S]{0,600}?sys-slider-low'\) >= 0/.test(shSrc3));
    }

    /* ---- Stage 5f: handbook chips on sections + handbook links (a layout placement) ---- */
    {
        const pf = [{ id: 'f_a', key: 'A', kind: 'number', def: 0, vis: 'all' }];
        const mk = (sheet, opts) => cleanSystem({ v: 1, name: 'P', fields: pf, rolls: [], sheet }, Object.assign({ F, gmView: true }, opts || {}));
        const secsIn = [
            { id: 's_1', title: 'A', cols: 1, chip: 'doc_rab12cd', fields: [{ kind: 'link', w: 1, text: ' Craft\u0001ing\u0002 ', page: 'doc_rab12cd', extra: 1 }, { kind: 'link', page: 'bad id!' }, { kind: 'link', w: 'row', page: 'x'.repeat(81) }] },
            { id: 's_2', title: 'B', cols: 1, chip: '__proto__', fields: [] }, { id: 's_3', title: 'C', cols: 1, chip: 'has space', fields: [] }, { id: 's_4', title: 'D', cols: 1, chip: 42, fields: [] }, { id: 's_5', title: 'E', cols: 1, fields: [] }
        ];
        const gm = mk({ sections: secsIn });
        check('Stage 5f: a chip is kept when it names a page id (free-form, capped at 80) and dropped for a prototype name, spaces or a non-string; a section without one is unchanged', gm.sheet.sections[0].chip === 'doc_rab12cd' && !('chip' in gm.sheet.sections[1]) && !('chip' in gm.sheet.sections[2]) && !('chip' in gm.sheet.sections[3]) && j(gm.sheet.sections[4]) === j({ id: 's_5', title: 'E', cols: 1, fields: [] }), j(gm.sheet.sections.map(s => s.chip)));
        check('Stage 5f: a link keeps { kind, w, text, page } in order, its label control-stripped; one with no valid page is kept for the GM with page "" (nothing lost on Save)', j(gm.sheet.sections[0].fields) === j([{ kind: 'link', w: 1, text: 'Craft ing', page: 'doc_rab12cd' }, { kind: 'link', w: 1, text: '', page: '' }, { kind: 'link', w: 'row', text: '', page: '' }]), j(gm.sheet.sections[0].fields));
        const pl = mk({ sections: secsIn }, { gmView: false, pages: ['doc_other', '__proto__', 'constructor'] });
        const pl2 = mk({ sections: secsIn }, { gmView: false, pages: ['doc_rab12cd'] });
        check('Stage 5f: the players\' view keeps chips and links only to pages in the host\'s readable set (a prototype name never counts); a link with no page is dropped for players', !('chip' in pl.sheet.sections[0]) && pl.sheet.sections[0].fields.length === 0 && pl2.sheet.sections[0].chip === 'doc_rab12cd' && j(pl2.sheet.sections[0].fields) === j([{ kind: 'link', w: 1, text: 'Craft ing', page: 'doc_rab12cd' }]), j([pl.sheet.sections[0], pl2.sheet.sections[0].fields]));
        const noSet = mk({ sections: secsIn }, { gmView: false });
        check('Stage 5f: with no page set given (a client re-cleaning what the host sent), ids are checked for format only', noSet.sheet.sections[0].chip === 'doc_rab12cd' && noSet.sheet.sections[0].fields.length === 3);
        check('Stage 5f: validPageId is published and refuses prototype names, over-long and odd ids', S.validPageId && S.validPageId('doc_tut_handbook') && S.validPageId('map_manaan:ahto-1.b') && !S.validPageId('__proto__') && !S.validPageId('constructor') && !S.validPageId('a b') && !S.validPageId('x'.repeat(81)) && !S.validPageId('') && !S.validPageId(null));
        const shSrc5 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), netSrc5 = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8');
        check('Stage 5f: the host filters by page visibility in BOTH players\' views (playerSystem and the join snapshot), failing closed', /cleanSystem\(camp\.system, \{ F: F\(\), gmView: false, pages: readablePages\(camp\) \}\)/.test(shSrc5) && /gmView: false, pages: \(window\.wpSheets && window\.wpSheets\.readablePages\) \? window\.wpSheets\.readablePages\(camp\) : \[\] \}/.test(netSrc5) && /it\.type === 'doc' && !\(it\.meta && it\.meta\.players === false\)/.test(shSrc5));
        check('Stage 5f: a page arriving, changing or going redraws an open sheet only when its chips/links would change (never mid-typing for a content edit); the pickers offer only storable ids', (netSrc5.match(/window\.wpSheets\.sheetRefsChanged && window\.wpSheets\.sheetRefsChanged\(\)\) window\.wpSheets\.renderSheet\(\)/g) || []).length === 3 && !/window\.wpSheets\.sheetOpen\(\)\) window\.wpSheets\.renderSheet\(\)/.test(netSrc5) && /_sheetRefSig = refSig\(sys\);/.test(shSrc5) && /it\.type === 'doc' && validPageId\(id\)/.test(shSrc5));
        check('Stage 5f: a chip click neither folds its section nor bubbles; a player opens the page in the reader, the GM in the doc panel', /var go = function\(e\) \{ e\.preventDefault\(\); e\.stopPropagation\(\);/.test(shSrc5) && /if \(isClient\(\) \|\| \(n && n\.foreign\)\) \{ if \(!\(window\.wpOpenDoc && window\.wpOpenDoc\(id\)\)\)/.test(shSrc5) && /window\.wpDocPanel\.open\(id\);/.test(shSrc5));
    }

    /* ---- Stage 5g (Fold A): look parity — section headers, the tab strip, the header block ---- */
    {
        const gf = [
            { id: 'f_pts', key: 'PTS', kind: 'number', def: 5, vis: 'all', unit: ' pts\u0001 ', sign: true },
            { id: 'f_fm', key: 'FM', kind: 'formula', formula: 'PTS - 9', vis: 'all', unit: 'kg', sign: true },
            { id: 'f_res', key: 'RES', kind: 'resource', maxFormula: '10', vis: 'all', unit: 'xxxxxxxxxxxx', sign: true },
            { id: 'f_txt', key: 'TXT', kind: 'text', def: '', vis: 'all', unit: 'u', sign: true },
            { id: 'f_tg', key: 'TG', kind: 'toggle', def: false, vis: 'all', unit: 'u', sign: true }
        ];
        const mk5g = sheet => cleanSystem({ v: 1, name: 'G', fields: gf, rolls: [], sheet }, { F, gmView: true });
        const g = mk5g({
            tabs: [{ id: 't_a', label: 'Info', icon: ' \u2694\uFE0F\u0001 ' }, { id: 't_b', label: 'Body', icon: 42 }, { id: 't_c', label: 'More', icon: 'abcdefghijk' }, { id: 't_d', label: 'Pair', icon: '\uD83D\uDEE1'.repeat(9) }],
            look: { titles: 'headline', tabs: 'filled', accent: '#4DB3D3', portrait: true, extra: 1 },
            sections: [
                { id: 's_1', title: 'A', cols: 1, icon: '\uD83D\uDEE1', style: { accent: '#AABBCC', stripe: false }, fields: [] },
                { id: 's_2', title: 'B', cols: 1, style: { bg: '#112233', stripe: false }, fields: [] },
                { id: 's_3', title: 'C', cols: 1, style: { accent: '#aabbcc', stripe: 'no' }, icon: '\u0001\u0002', fields: [] }
            ] });
        const T = g.sheet.tabs, SS = g.sheet.sections;
        check('Stage 5g: tab and section icons are kept control-stripped, trimmed and capped at 8 code points (never half a surrogate pair); a non-string or empty one is left out',
            T[0].icon === '\u2694\uFE0F' && !('icon' in T[1]) && T[2].icon === 'abcdefgh' && T[3].icon === '\uD83D\uDEE1'.repeat(8) && SS[0].icon === '\uD83D\uDEE1' && !('icon' in SS[2]), j(T) + ' ' + j(SS.map(s => s.icon)));
        check('Stage 5g: the look keeps only its whitelisted values (headline titles, filled tabs, a hex accent lower-cased, portrait true)', j(g.sheet.look) === j({ titles: 'headline', tabs: 'filled', accent: '#4db3d3', portrait: true }), j(g.sheet.look));
        const gBad = mk5g({ look: { titles: 'big', tabs: 'angled', accent: 'red', portrait: 'yes' }, sections: [] });
        const gNone = mk5g({ tabs: [{ id: 't_a', label: 'Info' }], sections: [{ id: 's_1', title: 'A', cols: 1, style: { accent: '#aabbcc' }, fields: [] }] });
        check('Stage 5g: a look with nothing valid, or none at all, leaves no look key (absent = today\'s sheet); a tab without an icon is { id, label }', !('look' in gBad.sheet) && !('look' in gNone.sheet) && j(gNone.sheet.tabs[0]) === j({ id: 't_a', label: 'Info' }) && j(gNone.sheet.sections[0].style) === j({ accent: '#aabbcc' }), j(gBad.sheet) + ' ' + j(gNone.sheet));
        const gJunk = ['#aabbcc url(https://example.invalid/p.png)', '#aabbcc;x', ' #aabbcc', '#aabbccdd', 'url(x)'].map(a => mk5g({ look: { accent: a }, sections: [{ id: 's_1', title: 'A', cols: 1, style: { accent: a, bg: a, border: a }, fields: [] }] }));
        check('Stage 5g: an accent (sheet or section colour) with anything before or after the six hex digits is dropped — no url() can reach a background', gJunk.every(x => !('look' in x.sheet) && !('style' in x.sheet.sections[0])), j(gJunk.map(x => [x.sheet.look, x.sheet.sections[0].style])));
        const gCp = mk5g({ tabs: [{ id: 't_a', label: 'A', icon: '\u0001'.repeat(63) + '\uD83D\uDEE1' }], sections: [] }), gCpF = cleanSystem({ v: 1, name: 'U', fields: [{ id: 'f_u1', key: 'U1', kind: 'number', def: 0, vis: 'all', unit: 'credits\uD83D\uDCB0' }, { id: 'f_u2', key: 'U2', kind: 'number', def: 0, vis: 'all', unit: 'creditss\uD83D\uDCB0' }, { id: 'f_u3', key: 'U3', kind: 'number', def: 0, vis: 'all', unit: 'ab\uD83D' }], rolls: [] }, { F, gmView: true });
        check('Stage 5g: units and icons are cut by code points after control characters go — an emoji is kept whole or dropped whole, a lone surrogate never survives',
            gCp.sheet.tabs[0].icon === '\uD83D\uDEE1' && gCpF.fields[0].unit === 'credits\uD83D\uDCB0' && gCpF.fields[1].unit === 'creditss' && gCpF.fields[2].unit === 'ab', j([gCp.sheet.tabs[0].icon, gCpF.fields.map(f => f.unit)]));
        const gTrim = mk5g({ tabs: [{ id: 't_a', label: 'A', icon: '        \u2694' }], sections: [] }), gTrimF = cleanSystem({ v: 1, name: 'T', fields: [{ id: 'f_t1', key: 'T1', kind: 'number', def: 0, vis: 'all', unit: ' per turn' }, { id: 'f_t2', key: 'T2', kind: 'number', def: 0, vis: 'all', unit: '\u0001\u0001credits' }], rolls: [] }, { F, gmView: true });
        check('Stage 5g: leading spaces and control characters never use up an icon\'s or a unit\'s 8 code points', gTrim.sheet.tabs[0].icon === '\u2694' && gTrimF.fields[0].unit === 'per turn' && gTrimF.fields[1].unit === 'credits', j([gTrim.sheet.tabs[0].icon, gTrimF.fields.map(f => f.unit)]));
        check('Stage 5g: "no stripe" is kept only as false and only beside an accent', j(SS[0].style) === j({ accent: '#aabbcc', stripe: false }) && j(SS[1].style) === j({ bg: '#112233' }) && j(SS[2].style) === j({ accent: '#aabbcc' }), j(SS.map(s => s.style)));
        const GF = id => g.fields.find(f => f.id === id);
        check('Stage 5g: a unit is kept on number/formula/skill/resource (control-stripped, trimmed, capped at 8); ± colour on number/formula/skill only; neither on text or a toggle',
            GF('f_pts').unit === 'pts' && GF('f_pts').sign === true && GF('f_fm').unit === 'kg' && GF('f_fm').sign === true && GF('f_res').unit === 'xxxxxxxx' && !('sign' in GF('f_res'))
            && !('unit' in GF('f_txt')) && !('sign' in GF('f_txt')) && !('unit' in GF('f_tg')) && !('sign' in GF('f_tg')), j(g.fields.map(f => [f.id, f.unit, f.sign])));
        const HE5 = S.headerEntry;
        check('Stage 5g: headerEntry appends the unit, marks a positive only on a field coloured by sign (zero stays plain, a negative is red either way), and keeps an empty text as a dash',
            j(HE5(GF('f_pts'), { value: 5, text: '5' })) === j({ text: '5 pts', pos: true }) && j(HE5(GF('f_pts'), { value: 0, text: '0' })) === j({ text: '0 pts' })
            && j(HE5(GF('f_fm'), { value: -4, text: '-4' })) === j({ text: '-4 kg', neg: true }) && j(HE5({ kind: 'number', label: 'N' }, { value: 3, text: '3' })) === j({ text: '3' })
            && j(HE5({ kind: 'number', label: 'N' }, { value: -3, text: '-3' })) === j({ text: '-3', neg: true }) && j(HE5(GF('f_txt'), { value: '', text: '' })) === j({ text: '\u2014', empty: true }),
            j([HE5(GF('f_pts'), { value: 5, text: '5' }), HE5(GF('f_txt'), { value: '', text: '' })]));
        const sh5 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), css5 = fs.readFileSync(path.join(app, 'style.css'), 'utf8');
        const hb5 = sh5.slice(sh5.indexOf('function headerBlocks('), sh5.indexOf('function buildSections('));
        check('Stage 5g: a ledger number is a live box only for whoever may edit it (the section\'s own rule, never on another player\'s copy or an error) and commits like the section\'s; the portrait comes through imgSrc; nothing reaches innerHTML',
            /if \(ledger && f\.kind === 'number' && !f\.labels && !en\.error && !c\.partial && \(gm \|\| \(own && f\.edit === 'owner' && f\.vis === 'all'\)\)\)[\s\S]{0,900}?inp\.addEventListener\('change', function\(\) \{ commit\(c, f, Number\(inp\.value\)\); \}\);/.test(hb5)
            && /inp\.dataset\.part = 'hdr';/.test(hb5) && /im\.src = imgSrc\(c\.portrait\);/.test(hb5) && !/innerHTML/.test(hb5) && /block\(sh\.identity, 'sheet-identity', 'sheet-identity-item', false\);/.test(hb5));
        check('Stage 5g: the head and the frame take the sheet look\'s colours through --sheet-ink/--sheet-bg, removed again when the look has none; the accent is a variable set only when the look has one',
            /pair = !!\(style && HEXC\.test\(style\.textColor \|\| ''\) && HEXC\.test\(style\.bgColor \|\| ''\)\);\s*if \(pair\) \{ node\.style\.setProperty\('--sheet-ink', style\.textColor\); node\.style\.setProperty\('--sheet-bg', style\.bgColor\);[\s\S]{0,200}?else \{ node\.style\.removeProperty\('--sheet-ink'\); node\.style\.removeProperty\('--sheet-bg'\); node\.style\.removeProperty\('--sheet-dim'\); \}/.test(sh5)
            && /if \(typeof look\.accent === 'string' && \/\^#\[0-9a-fA-F\]\{6\}\$\/\.test\(look\.accent\)\) \{ body\.style\.setProperty\('--sheet-accent', look\.accent\);[\s\S]{0,300}?else \{ body\.style\.removeProperty\('--sheet-accent'\); body\.style\.removeProperty\('--sheet-accent-ink'\); \}/.test(sh5)
            && /\.sheet-frame \.sheet-tab:not\(\.active\) \{ color: var\(--sheet-dim, var\(--dim\)\); \}/.test(css5) && /\.sheet-frame \.sheet-value:not\(\.sheet-pos\):not\(\.sheet-neg\):not\(\.sheet-err\), \.sheet-frame \.sheet-tab:not\(\.active\):hover \{ color: var\(--sheet-ink, var\(--ink\)\); \}/.test(css5)
            && /\.sheet-head, \.sheet-frame \{ margin: 0 -10px; background: var\(--sheet-bg, var\(--panel2\)\); color: var\(--sheet-ink, var\(--ink\)\);/.test(css5) && /\.sheet-tab\.active \{ color: var\(--sheet-accent, var\(--gold\)\);/.test(css5));
        check('Stage 5g: the pop-out cleans the raw save (system and character) before rendering, so its sinks see validated values like the panel\'s', /var sys = cleanSystem\(raw, \{ F: F\(\), gmView: true \}\), c = sys \? cleanChar\(c0, sys\) : null;\s*if \(!sys \|\| !c\) return null;\s*_fxLive = false; try \{ buildSections\(container, sys, c,/.test(sh5) && /import \{[^}]*\bcleanChar\b[^}]*\} from '\.\/systemcore\.js';/.test(sh5));
        const aInk = (() => { const src = sh5.slice(sh5.indexOf('function accentInk('), sh5.indexOf('function buildSections(')); return new Function(src + '; return accentInk;')(); })();
        check('Stage 5g: the open filled tab\'s label picks near-black on a light accent and white on a dark one', aInk('#e0a54f') === '#111318' && aInk('#4db3d3') === '#111318' && aInk('#7a1f1f') === '#ffffff' && aInk('#101010') === '#ffffff', [aInk('#e0a54f'), aInk('#7a1f1f')].join());
        check('Stage 5g: inside the head and the frame, transparent buttons, slider ends, the GM marker, the open underlined tab and the name follow a look pair (the fallbacks are the old theme values); the filled open tab keeps its own ink; the ledger box shows focus',
            /\.sheet-head \.tool\.ghost, \.sheet-frame \.tool\.ghost, \.sheet-head \.tool\.ghost:hover, \.sheet-frame \.tool\.ghost:hover \{ color: var\(--sheet-ink, var\(--ink\)\); \}/.test(css5) && /\.sheet-frame \.sheet-slider-ends \{ color: var\(--sheet-dim, var\(--dim\)\); \}/.test(css5)
            && /\.sheet-frame \.sheet-tabs:not\(\.sheet-tabs-filled\) > \.sheet-tab\.active \{ color: var\(--sheet-accent, var\(--sheet-ink, var\(--gold\)\)\);/.test(css5) && /\.sheet-head-name \{[^}]*color: var\(--sheet-accent, var\(--sheet-ink, var\(--gold\)\)\);/.test(css5)
            && /\.sheet-hdr-val\.sheet-hdr-edit:focus-within \{ border-color:/.test(css5) && /\.sheet-tabs-filled \.sheet-tab\.active \{ background: var\(--sheet-accent, var\(--gold\)\); color: var\(--sheet-accent-ink, #111318\); \}/.test(css5));
        check('Stage 5g: the item list resolves its definitions from the system being drawn (the pop-out\'s cleaned copy, the preview\'s draft), not the raw campaign', /function fieldNodeBody\(f, c, e, gm, own, sysArg, plc\)/.test(sh5) && /var sysI = sysArg \|\| systemOf\(getActiveCampaign\(\)\)/.test(sh5) && (sh5.match(/fieldNode\([^)]*, gm, own, sys(, all\.vars, pl)?\)/g) || []).length === 2);
        check('Stage 5g: a section is boxed only for a panel, a border or a stripe (an accent with no stripe colours the title alone); headline titles and filled tabs are class-gated',
            /var stripe = !!\(sec\.style && sec\.style\.accent && sec\.style\.stripe !== false\);[\s\S]{0,200}?if \(sec\.style && \(sec\.style\.bg \|\| sec\.style\.border \|\| stripe\)\)/.test(sh5) && /if \(stripe\) s\.style\.borderLeft/.test(sh5)
            && /body\.classList\.toggle\('sheet-titles-headline', look\.titles === 'headline'\);/.test(sh5) && /el\('div', 'sheet-tabs' \+ \(look\.tabs === 'filled' \? ' sheet-tabs-filled' : ''\)\)/.test(sh5)
            && /\.sheet-titles-headline \.sheet-sec-title \{/.test(css5) && /\.sheet-tabs-filled \.sheet-tab\.active \{/.test(css5));
        check('Stage 5g: "Start from the automatic layout" and "Remove your layout" keep the sheet\'s shape (it lives in the Sheet look box); the tab icon edit finds its own row (.sys-row.sys-tab)',
            /var keepLook = [\s\S]{0,200}?draft\.sheet = \{ sections: autoLayout\(cl \|\| draft\)\.sections \}; if \(keepLook\) draft\.sheet\.look = keepLook;/.test(sh5)
            && /var keepShape = draft\.sheet && draft\.sheet\.look; draft\.sheet = \{ sections: \[\] \}; if \(keepShape\) draft\.sheet\.look = keepShape;/.test(sh5)
            && /if \(c\.indexOf\('sys-tab-icon'\) >= 0\) \{ var itr = t\.closest && t\.closest\('\.sys-row\.sys-tab'\);/.test(sh5));
    }

    /* ---- Stage 5g (Fold B): captions, capital labels, a pool's icon / reset / bar, the resizable panel ---- */
    {
        const bf = [
            { id: 'f_st', key: 'ST', kind: 'number', def: 10, vis: 'all', caption: ' Base: {ST * 2} ({Nope}) {d20}\u0001 ' },
            { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '10', vis: 'all', icon: ' \u2764\uFE0F ', reset: true, bar: false, caption: 'x'.repeat(300) },
            { id: 'f_ep', key: 'EP', kind: 'resource', maxFormula: '5', vis: 'all', reset: 'yes', bar: true },
            { id: 'f_n', key: 'N', kind: 'number', def: 1, vis: 'all', icon: '\u2764', reset: true, bar: false }
        ];
        const B = cleanSystem({ v: 1, name: 'FB', fields: bf, rolls: [], sheet: { look: { labels: 'caps' }, sections: [] } }, { F, gmView: true });
        const BF = id => B.fields.find(f => f.id === id);
        check('Fold B: a caption is kept on any kind (control characters out, trimmed, at most 200 code points); a pool keeps an icon, reset only as true, bar only as false; other kinds keep none of them; look.labels "caps"',
            BF('f_st').caption === 'Base: {ST * 2} ({Nope}) {d20}' && BF('f_hp').caption.length === 200 && BF('f_hp').icon === '\u2764\uFE0F' && BF('f_hp').reset === true && BF('f_hp').bar === false
            && !('reset' in BF('f_ep')) && !('bar' in BF('f_ep')) && !('icon' in BF('f_n')) && !('reset' in BF('f_n')) && !('bar' in BF('f_n')) && B.sheet.look && B.sheet.look.labels === 'caps', JSON.stringify(B.fields));
        const cp = S.captionParts(B, { id: 'c', name: 'C', values: { f_st: 12 } }, F, BF('f_st').caption);
        check('Fold B: captionParts works each {formula} out for the character (no dice; an unknown name or a die is an error part, never thrown) and keeps the text around them',
            cp.length === 6 && cp[0].text === 'Base: ' && cp[1].value === 24 && cp[1].text === '24' && cp[2].text === ' (' && typeof cp[3].error === 'string' && cp[4].text === ') ' && typeof cp[5].error === 'string', JSON.stringify(cp));
        const many = S.captionParts(B, { id: 'c', name: 'C', values: {} }, F, Array.from({ length: 10 }, (_, i) => '{' + i + '}').join(' '));
        check('Fold B: at most 8 {formula} values in one caption (the rest stays text); an empty caption is no parts', many.filter(p => p.value !== undefined).length === 8 && many[many.length - 1].text === ' {8} {9}' && S.captionParts(B, {}, F, '').length === 0, JSON.stringify(many.slice(-2)));
        const shB = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), cssB = fs.readFileSync(path.join(app, 'style.css'), 'utf8'), htB = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        check('Fold B: a caption is drawn as text nodes only (no markup), hidden in the band; capital labels are class-gated', /function captionNode\(text, sys, c, vars\) \{[\s\S]{0,600}?document\.createTextNode\(p\.text\)/.test(shB) && !/function captionNode[\s\S]{0,600}?innerHTML/.test(shB) && /\.sheet-band \.sheet-caption \{ display: none; \}/.test(cssB) && /body\.classList\.toggle\('sheet-labels-caps', look\.labels === 'caps'\);/.test(shB));
        check('Fold B: the ↻ button fills to the max through the same commit as an edit, only for whoever may edit, never with no max or when already full; no bar when turned off',
            /rs\.disabled = !editable \|\| max === null \|\| cur === max;\s*rs\.addEventListener\('click', function\(\) \{ if \(max !== null\) commit\(c, f, \{ cur: max \}\); \}\);/.test(shB) && /if \(f\.bar === false\) return box;/.test(shB));
        check('Fold B: the sheet panel resizes from its corner grip, clamped to the window, and the size is remembered with the position (a move keeps the size; double-click forgets it)',
            /<div id="sheetResize" class="sheet-resize"/.test(htB) && /function sizePanel\(p, w, h\) \{ var r = p\.getBoundingClientRect\(\); w = Math\.max\(360, Math\.min\(window\.innerWidth - Math\.max\(0, r\.left\) - 8/.test(shB) && /h = Math\.max\(240, Math\.min\(window\.innerHeight - Math\.max\(0, r\.top\) - 8/.test(shB) && /if \(pos && isFinite\(pos\.w\) && isFinite\(pos\.h\)\) sizePanel\(p, pos\.w, pos\.h\);/.test(shB)
            && /o = panelPref\(\); o\.x = Math\.round\(r\.left\); o\.y = Math\.round\(r\.top\); if \(sized\) \{ o\.w = Math\.round\(r\.width\); o\.h = Math\.round\(r\.height\); \}/.test(shB)
            && /if \(!rz \|\| \(e\.clientX === rz\.x && e\.clientY === rz\.y\)\) return; rz\.moved = true;/.test(shB) && /var moved = rz\.moved; rz = null; if \(!moved\) return;/.test(shB) && /delete o\.w; delete o\.h;/.test(shB) && !/setPref\('wp_sheetPanel', JSON\.stringify\(\{ x:/.test(shB));
    }

    /* ---- Fold B review: captions and GM-only names, the shared resolver, focus after ↻ ---- */
    {
        const gs = { v: 1, name: 'G', fields: [{ id: 'f_sec', key: 'Secret', kind: 'number', def: 7, vis: 'gm' }, { id: 'f_st', key: 'ST', kind: 'number', def: 10, vis: 'all', caption: 'Bonus: {Secret + ST}' }, { id: 'f_dx', key: 'DX', kind: 'number', def: 10, vis: 'all', caption: 'Half: {DX / 2}' }], rolls: [] };
        const gmV = cleanSystem(gs, { F, gmView: true }), plV = cleanSystem(gs, { F, gmView: false });
        const plST = plV.fields.find(f => f.id === 'f_st'), plDX = plV.fields.find(f => f.id === 'f_dx');
        check('Fold B review: a caption whose {formula} names a GM-only field never reaches players (the GM keeps it; a caption without one travels as it is)', gmV.fields.find(f => f.id === 'f_st').caption === 'Bonus: {Secret + ST}' && plST && !('caption' in plST) && plDX.caption === 'Half: {DX / 2}', JSON.stringify(plV.fields));
        const vw = S.validateSystem(cleanSystem({ v: 1, name: 'V', fields: [gs.fields[0], gs.fields[1], { id: 'f_x', key: 'X', kind: 'number', def: 1, vis: 'all', caption: '{Nope} {d20} {Name} {(}' }, { id: 'f_nm', key: 'Name', kind: 'text', def: '', vis: 'all' }], rolls: [] }, { F, gmView: true }), F);
        const cw = vw.warnings.filter(w => w.prop === 'caption').map(w => w.message).join(' | ');
        check('Fold B review: the editor warns about a caption (GM-only name, unknown name, dice, a text field, bad syntax) without blocking a save', vw.ok !== false && /"Secret" is GM only/.test(cw) && /unknown name "Nope"/.test(cw) && /dice are not worked out/.test(cw) && /"Name" is not a number/.test(cw) && (cw.match(/Caption:/g) || []).length >= 5 && !vw.errors.some(e => e.prop === 'caption'), cw + ' || errors: ' + JSON.stringify(vw.errors));
        const chainFields = Array.from({ length: 80 }, (_, i) => i === 0 ? { id: 'f_k0', key: 'K0', kind: 'number', def: 1, vis: 'all' } : { id: 'f_k' + i, key: 'K' + i, kind: 'formula', formula: 'K' + (i - 1) + ' + 1', vis: 'all' });
        const chS = cleanSystem({ v: 1, name: 'CH', fields: chainFields, rolls: [] }, { F, gmView: true }), chC = { id: 'c', name: 'C', values: {} };
        const allCh = S.resolveAll(chS, chC, F), capCh = S.captionParts(chS, chC, F, 'Top: {K79}', allCh.vars);
        check('Fold B review: captions read the render\'s resolver (resolveAll(...).vars, not enumerable): a long chain the field shows is shown in its caption too, and nothing is worked out twice', typeof allCh.vars === 'function' && Object.keys(allCh).indexOf('vars') < 0 && allCh.f_k79.value === 80 && capCh[1] && capCh[1].value === 80, JSON.stringify(capCh));
        const shR = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8');
        check('Fold B review: a control that disabled itself (↻ once full) hands keyboard focus to its field\'s own box; sections pass the resolver to captions, the band does not', /if \(q && q\.disabled && k\.part\) q = root\.querySelector\('\[data-fid="' \+ k\.fid \+ '"\]:not\(\[data-part\]\)'/.test(shR) && /fieldNode\(byId\[pl\.id\], c, all\[pl\.id\], gm, own, sys, all\.vars, pl\)/.test(shR) && /fieldNode\(byId\[q\.id\], c, all\[q\.id\], gm, own, sys\)/.test(shR));
    }

    /* ---- Stage 5h Fold 1: the character-sync fixes effects depend on ---- */
    {
        const fx1 = cleanSystem({ v: 1, name: 'F1', fields: [
            { id: 'f_st', key: 'ST', kind: 'number', def: 10, vis: 'all', edit: 'owner' },
            { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: 'ST', def: 'max', min: 0, vis: 'all', edit: 'owner', hover: true },
            { id: 'f_mp', key: 'MP', kind: 'resource', maxFormula: 'MP.max + 1', def: 'max', vis: 'all' },
            { id: 'f_inv', key: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner' }
        ], rolls: [], items: [{ id: 'i_a', name: 'Rope' }, { id: 'i_b', name: 'Torch' }] }, { F, gmView: true });
        const vo = S.valueOpts(fx1), inv = fx1.fields.find(f => f.id === 'f_inv');
        check('5h F1: valueOpts carries the system\'s item ids, so an item list re-cleaned on a client keeps its entries (it was re-cleaned against nothing and emptied)', j(cleanValue(inv, [{ defId: 'i_a', qty: 2 }, { defId: 'i_zz', qty: 1 }], vo)) === j([{ defId: 'i_a', qty: 2 }]) && Object.getPrototypeOf(vo.items) === null, j(cleanValue(inv, [{ defId: 'i_a', qty: 2 }], vo)));
        const chF = { id: 'c_1', name: 'P', ownerId: 'u_p', npc: false, values: { f_st: 14 } };
        const allF = S.resolveAll(fx1, chF, F), allC = S.resolveAll(fx1, Object.assign({}, chF, { values: { f_st: 14, f_mp: { cur: 3 } } }), F), mpD = S.makeResolver(fx1, chF, F)('MP.max');
        const mpErr = [allF.f_mp && allF.f_mp.error, allC.f_mp && allC.f_mp.error, mpD && mpD.error && mpD.error.message].map(e => String(e || ''));
        check('5h F1: a full pool reads its max through the resolver (HP 14 / 14 from ST 14), and a max naming itself is reported as a loop, not "too deeply" (full pool, a stored cur, a direct MP.max read)', allF.f_hp.value === 14 && allF.f_hp.max === 14 && mpErr.every(m => /loop/.test(m) && !/too deeply/.test(m)), j([allF.f_hp, mpErr]));
        const gmMax = { v: 1, name: 'GM', fields: [{ id: 'f_sec', key: 'Secret', kind: 'number', def: 20, vis: 'gm' }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: 'Secret', def: 'max', min: 0, vis: 'all', edit: 'owner' }], rolls: [] };
        const plG = cleanSystem(gmMax, { F, gmView: false }), gmG = cleanSystem(gmMax, { F, gmView: true }), chG = { id: 'c_1', values: { f_hp: { cur: 7 } } };
        const rG = S.makeResolver(plG, chG, F)('HP.max'), edG = S.applyEdit(plG, chG, 'f_hp', { cur: 12 }, F, { player: true }), edH = S.applyEdit(gmG, chG, 'f_hp', { cur: 999 }, F, { player: true }), edM = S.applyEdit(gmG, chG, 'f_hp', { cur: 999 }, F, {});
        check('5h F1 / 1.5.0: a pool whose max names a GM-only field is GM-only as a whole — the players\' view has no such pool (its max reads nothing), and a player\'s edit of it is refused there and on the host, never clamped against the hidden max (the answer to 999 would be the max); the GM\'s own edit still clamps to it',
            !plG.fields.some(f => f.id === 'f_hp') && rG === undefined && j(edG) === j({ ok: false, reason: 'field' }) && j(edH) === j({ ok: false, reason: 'field' }) && edM.ok && edM.value.cur === 20, j([rG, edG, edH, edM]));
        const gmItems = cleanSystem({ v: 1, name: 'GI', fields: [{ id: 'f_inv', key: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner' }], rolls: [], items: [{ id: 'i_a', name: 'Rope' }, { id: 'i_s', name: 'Cursed ring', vis: 'gm', notes: 'Cold', damage: '2d6', cost: '9', area: { ft: 5 }, rm: 'curse', rmMsg: 'A chill' }] }, { F, gmView: true });
        const giChar = { id: 'c_1', name: 'P', ownerId: 'u_p', npc: false, values: { f_inv: [{ defId: 'i_a', qty: 1 }, { id: 'w_s9', defId: 'i_s', qty: 1 }] } }, giLib = { i_a: gmItems.items[0], i_s: gmItems.items[1] };
        const giView = cleanSystem(gmItems, { F, gmView: false }), giC = S.charFor(giChar, giView, 'u_p'), giL = S.charFor(giChar, giView, 'u_p', { items: giLib }), giRow = giL.values.f_inv[1] || {};
        check('5h F1 / Stage 6: a GM-only item the GM gave a character reaches its owner inline with its players\' fields only (never its damage, cost, area, removal rule or message); without the host\'s library it is left out (fail closed)',
            j(giC.values.f_inv) === j([{ defId: 'i_a', qty: 1 }]) && giL.values.f_inv.length === 2 && giRow.lnk === 1 && giRow.id === 'w_s9' && giRow.def.name === 'Cursed ring' && giRow.def.notes === 'Cold'
            && !['damage', 'cost', 'area', 'rm', 'rmMsg'].some(k => k in giRow.def) && !/2d6|A chill|curse/.test(j(giL)), j(giL.values.f_inv));
        const pc = cleanChar({ id: 'c_1', name: 'P', ownerId: 'u_p', values: {}, partial: true, lines: ['HP 14 / 14', 42, 'x'.repeat(200), 'a\u0001b'].concat(Array(20).fill('y')) }, fx1), full = cleanChar({ id: 'c_1', name: 'P', ownerId: 'u_p', values: {}, lines: ['HP 1'] }, fx1);
        check('5h F1: a teammate\'s copy keeps the host\'s hover lines (strings only, at most 12 of 120 characters, control characters out); an owner\'s or the GM\'s copy never carries lines', pc.lines.length === 12 && pc.lines[0] === 'HP 14 / 14' && pc.lines[1].length === 120 && pc.lines[2] === 'a b' && !('lines' in full), j(pc.lines.slice(0, 3)));
        const netSrcF = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
        const sliceF = (a, b) => { const i = netSrcF.indexOf(a), k = netSrcF.indexOf(b); if (i < 0 || k < 0 || k <= i) throw new Error('marker ' + a); return netSrcF.slice(i + a.length, k); };
        // the client's handler, run on a real cleaned system: an item-list delta keeps its entries
        const charIn0 = new Function('net', 'conn', 'msg', 'window', '_charPending', 'charPendingDone', 'state', 'campOf', 'reapplyPending', '_charHost', 'noteHostCopy', sliceF('// [netcheck:charin-start]', '// [netcheck:charin-end]') + '\nreturn "ran";');
        const charIn = (...a) => charIn0(...a, {}, () => {});   // Stage 6: the host's last copy is kept on the side (the pending slice's own test below)
        const campC = { id: 'camp1', system: fx1, chars: { c_1: cleanChar({ id: 'c_1', name: 'P', ownerId: 'u_p', values: { f_inv: [{ defId: 'i_a', qty: 1 }] } }, fx1) } };
        const envW = { wpSystemCore: S, wpSheets: { charChanged() {}, charGone() {} } }, netC = { foreign: true, stream: false, syncedPeer: 'host' };
        charIn(netC, { peer: 'host' }, { type: 'charDelta', campId: 'camp1', id: 'c_1', values: { f_inv: [{ defId: 'i_a', qty: 3 }, { defId: 'i_b', qty: 1 }, { defId: 'i_nope', qty: 1 }] } }, envW, {}, () => {}, { appState: { activeCampaignId: 'camp1' } }, id => id === 'camp1' ? campC : null, () => {});
        check('5h F1: a player\'s item list survives a delta from the host (the real client handler, sliced from net.js)', j(campC.chars.c_1.values.f_inv) === j([{ defId: 'i_a', qty: 3 }, { defId: 'i_b', qty: 1 }]), j(campC.chars.c_1.values));
        charIn(netC, { peer: 'host' }, { type: 'chars', campId: 'camp1', chars: { c_2: { id: 'c_2', name: 'T', ownerId: 'u_t', partial: true, values: {}, lines: ['HP 9 / 14'] } } }, envW, {}, () => {}, { appState: { activeCampaignId: 'camp1' } }, id => id === 'camp1' ? campC : null, () => {});
        check('5h F1: a teammate\'s copy from the host keeps its partial flag and its hover lines on the client', campC.chars.c_2 && campC.chars.c_2.partial === true && j(campC.chars.c_2.lines) === j(['HP 9 / 14']), j(campC.chars.c_2));
        // the host's per-peer delta: the owner gets the projected value, a teammate gets the whole copy with fresh lines
        const deltaSrc = sliceF('// [netcheck:chardelta-start]', '// [netcheck:chardelta-end]');
        const sent = [], mkConn = peer => ({ peer, open: true, send: m => sent.push({ peer, m }) });
        const hostCamp = { id: 'camp1', system: fx1, chars: { c_1: { id: 'c_1', name: 'P', ownerId: 'u_p', npc: false, values: { f_st: 14, f_inv: [{ defId: 'i_a', qty: 1 }] } } } };
        const netH = { active: true, role: 'host', conns: [mkConn('pOwner'), mkConn('pMate')], roster: { pOwner: { id: 'u_p' }, pMate: { id: 'u_m' } } };
        const envH = { wpSheets: { playerSystem: () => cleanSystem(fx1, { F, gmView: false }) }, wpFormula: F };
        const runDelta = new Function('net', 'getActiveCampaign', 'SC', 'window', 'peerProfileId', 'sendFailed', '_charPending', 'charLimit', deltaSrc + '\nreturn net.syncCharDelta;')(netH, () => hostCamp, () => S, envH, c => netH.roster[c.peer].id, () => {}, {}, null);
        Object.assign(hostCamp.chars.c_1.values, { f_hp: { cur: 5 }, f_inv: [{ defId: 'i_a', qty: 1 }] }); delete hostCamp.chars.c_1.values.f_st;   // the host stores, then syncs (Stage 6: a delta is never sent raw)
        runDelta('c_1', { f_hp: { cur: 5 }, f_inv: [{ defId: 'i_a', qty: 1 }], f_st: null });
        const toOwner = sent.find(s => s.peer === 'pOwner'), toMate = sent.find(s => s.peer === 'pMate');
        check('5h F1: the owner\'s delta carries every changed field they may see (a revert as null); a teammate gets the whole copy (hover fields only, no item list) with host-worked hover lines',
            toOwner && toOwner.m.type === 'charDelta' && j(toOwner.m.values.f_hp) === j({ cur: 5 }) && toOwner.m.values.f_st === null && Array.isArray(toOwner.m.values.f_inv)
            && toMate && toMate.m.type === 'char' && toMate.m.char.partial === true && !('f_inv' in toMate.m.char.values) && !('f_st' in toMate.m.char.values) && Array.isArray(toMate.m.char.lines) && /HP 5 \/ 10/.test(toMate.m.char.lines.join(' ')), j(sent.map(s => [s.peer, s.m.type, s.m.values || s.m.char])));   // the host's own values: HP 5, ST reverted (max 10)
        sent.length = 0; hostCamp.chars.c_1.values.f_st = 16; runDelta('c_1', { f_st: 16 });   // the host stores the value, then syncs
        const mate2 = sent.find(s => s.peer === 'pMate');
        check('5h F1: a change to a non-hover input (ST) re-sends a teammate\'s whole copy, so their hover line reads the new max; the owner gets the delta', mate2 && mate2.m.type === 'char' && /16/.test((mate2.m.char.lines || []).join(' ')) && sent.some(s => s.peer === 'pOwner' && s.m.type === 'charDelta'), j(sent.map(s => [s.peer, s.m.type, s.m.char && s.m.char.lines])));
        const pcEmpty = cleanChar({ id: 'c_3', name: 'Q', ownerId: 'u_q', values: {}, partial: true, lines: [] }, fx1);
        check('5h F1: an empty list of host lines is kept (the owner\'s "no lines" is the answer; the teammate never recomputes from its own defaults)', Array.isArray(pcEmpty.lines) && pcEmpty.lines.length === 0);
        const shF1 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8');
        check('5h F1: the join snapshot gives a teammate\'s copy the host\'s hover lines too, and a teammate\'s hover card draws them', /withHoverLines\(window\.wpSystemCore\.charFor\(camp\.chars\[id\], camp\.system, recipientId, \{ lib: libFx, items: libIt \}\), camp\.chars\[id\], camp\.system, libFx, libIt\)/.test(netSrcF) && /if \(c\.partial && Array\.isArray\(c\.lines\)\) return c\.lines\.slice\(\);/.test(shF1));
    }

    /* ---- Stage 5h Fold 2: status effects ---- */
    {
        const base5 = { v: 1, name: 'FX', fields: [
            { id: 'f_st', key: 'ST', kind: 'number', def: 10, vis: 'all', edit: 'owner' },
            { id: 'f_dx', key: 'DX', kind: 'number', def: 10, vis: 'all', edit: 'owner' },
            { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: 'ST', def: 'max', min: 0, vis: 'all', edit: 'owner', hover: true },
            { id: 'f_spd', key: 'Speed', kind: 'formula', formula: '(DX + 10) / 4', vis: 'all' },
            { id: 'f_dodge', key: 'Dodge', kind: 'formula', formula: 'floor(Speed) + 3', vis: 'all', hover: true },
            { id: 'f_sw', key: 'Sword', kind: 'skill', base: 'DX - 5', def: 2, vis: 'all', edit: 'owner' },
            { id: 'f_prone', key: 'Prone', kind: 'toggle', def: false, vis: 'all', edit: 'owner' },
            { id: 'f_name', key: 'Name', kind: 'text', def: '', vis: 'all' },
            { id: 'f_sec', key: 'Secret', kind: 'number', def: 1, vis: 'gm' },
            { id: 'f_fx', key: 'Fx', label: 'Effects', kind: 'effects', vis: 'all', edit: 'owner', hover: true },
            { id: 'f_fxgm', key: 'FxGM', kind: 'effects', vis: 'all', edit: 'gm' }
        ], rolls: [], effects: [
            { id: 'e_rage', name: 'Rage', icon: '\uD83D\uDE21', tone: 'buff', dur: '3 rounds', vis: 'all', mods: [{ f: 'f_st', op: 'add', v: 2 }, { f: 'f_name', op: 'add', v: 1 }, { f: 'f_prone', op: 'add', v: 1 }, { f: 'f_st', op: 'on' }, { f: 'f_dx', op: 'add', v: 1e20 }, { f: 'f_nope', op: 'add', v: 1 }, { f: 'f_hp', op: 'add', v: 1 }] },
            { id: 'e_knock', name: 'Knocked', tone: 'debuff', vis: 'all', mods: [{ f: 'f_prone', op: 'on' }, { f: 'f_dx', op: 'add', v: -4 }] },
            { id: 'e_bless', name: 'Blessed', vis: 'all', mods: [{ f: 'f_sw', op: 'add', v: 1 }, { f: 'f_hp', op: 'add', v: 5, part: 'max' }] },
            { id: 'e_curse', name: 'Curse', vis: 'gm', mods: [{ f: 'f_st', op: 'add', v: -3 }, { f: 'f_sec', op: 'add', v: 2 }] },
            { id: '__proto__', name: 'Bad', mods: [] }, { id: 'e_rage', name: 'Dup', mods: [] }
        ] };
        const GM5 = cleanSystem(base5, { F, gmView: true }), PL5 = cleanSystem(base5, { F, gmView: false });
        const rage = GM5.effects.find(d => d.id === 'e_rage');
        check('5h: the library keeps valid ids once; a change fits its field (add on a number, skill, formula or a resource max; on only a toggle), is finite and within 1e6; plain objects',
            GM5.effects.map(d => d.id).join() === 'e_rage,e_knock,e_bless,e_curse' && j(rage.mods) === j([{ f: 'f_st', op: 'add', v: 2 }]) && j(GM5.effects[2].mods) === j([{ f: 'f_sw', op: 'add', v: 1 }, { f: 'f_hp', op: 'add', v: 5, part: 'max' }]) && Object.getPrototypeOf(rage) === Object.prototype && Object.getPrototypeOf(rage.mods[0]) === Object.prototype, j(GM5.effects));
        check('5h: the players\' view drops a GM-only effect and any change to a GM-only field; no effects means no "effects" key (a system without them is unchanged)',
            PL5.effects.map(d => d.id).join() === 'e_rage,e_knock,e_bless' && !('effects' in cleanSystem({ v: 1, name: 'N', fields: [], rolls: [] }, { F, gmView: true })), j(PL5.effects));
        const vo5 = S.valueOpts(GM5), fxF = GM5.fields.find(f => f.id === 'f_fx');
        const rowsIn = [{ id: 'x_1', ref: 'e_rage' }, { id: 'x_2', ref: 'e_rage' }, { id: 'x_1', ref: 'e_knock' }, { id: 'x_3', ref: 'e_nope' }, { id: 'x_4', ref: '__proto__' }, { id: 'x_5', name: ' Shaken\u0001 ', tone: 'debuff', on: false, mods: [{ f: 'f_dx', op: 'add', v: -1 }, { f: 'f_name', op: 'add', v: 1 }] }, { id: 'bad', ref: 'e_knock' }];
        const rowsOut = cleanValue(fxF, rowsIn, vo5);
        check('5h: a character\'s rows: a library row once per effect, unknown or prototype refs and bad ids dropped, an ad hoc row cleaned (its changes checked), "on" true unless false',
            j(rowsOut) === j([{ id: 'x_1', ref: 'e_rage', on: true }, { id: 'x_5', name: 'Shaken', icon: '', tone: 'debuff', dur: '', notes: '', on: false, mods: [{ f: 'f_dx', op: 'add', v: -1 }] }]) && cleanValue(fxF, Array.from({ length: 50 }, (_, i) => ({ id: 'x_r' + i, name: 'E' + i })), vo5).length === 30, j(rowsOut));
        const ch5 = (rows) => ({ id: 'c_1', name: 'P', ownerId: 'u_p', npc: false, values: { f_sw: 2, f_fx: rows } });
        const none = S.resolveAll(GM5, ch5([]), F), rg = S.resolveAll(GM5, ch5([{ id: 'x_1', ref: 'e_rage', on: true }]), F);
        check('5h: +2 ST from Rage: ST 12, HP max 12 and a full HP 12 (not counted twice); nothing else moves; with no effects no value carries a breakdown',
            rg.f_st.value === 12 && rg.f_hp.max === 12 && rg.f_hp.value === 12 && rg.f_dodge.value === none.f_dodge.value && Object.keys(none).every(k => !('mods' in none[k]) && !('via' in none[k]) && !('maxMods' in none[k])), j([rg.f_st, rg.f_hp]));
        const kn = S.resolveAll(GM5, ch5([{ id: 'x_1', ref: 'e_knock', on: true }, { id: 'x_2', ref: 'e_bless', on: true }]), F);
        check('5h: Knocked switches Prone on and takes 4 DX, so Speed and Dodge follow (via DX); Blessed adds 1 to the Sword total (ranks stay 2) and 5 to HP\'s max',
            kn.f_prone.value === true && kn.f_dx.value === 6 && kn.f_spd.value === 4 && kn.f_dodge.value === 7 && kn.f_sw.ranks === 2 && kn.f_sw.value === 2 + (6 - 5) + 1 && kn.f_hp.max === 15 && /Knocked/.test(S.fxText(kn.f_dodge)) && /on DX/.test(S.fxText(kn.f_dodge)), j([kn.f_dodge, kn.f_sw, S.fxText(kn.f_dodge)]));
        const off = S.resolveAll(GM5, ch5([{ id: 'x_1', ref: 'e_rage', on: false }, { id: 'x_2', ref: 'e_gone', on: true }]), F);
        const baseSys = cleanSystem(Object.assign({}, base5, { fields: base5.fields.concat([{ id: 'f_cost', key: 'Cost', kind: 'formula', formula: '(ST.base - 10) * 10', vis: 'all' }]) }), { F, gmView: true });
        const baseAll = S.resolveAll(baseSys, ch5([{ id: 'x_1', ref: 'e_rage', on: true }]), F), baseVal = S.validateSystem(baseSys, F);
        check('5h: a formula that should ignore effects reads the stored number as "ST.base" (a points cost stays 0 under Rage), and the editor knows the name', baseAll.f_st.value === 12 && baseAll.f_cost.value === 0 && !baseVal.errors.some(e => /ST\.base/i.test(e.message)), j([baseAll.f_cost, baseVal.errors]));
        check('5h: a row switched off, or naming an effect that is gone, changes nothing', off.f_st.value === 10 && !('mods' in off.f_st));
        check('5h: the breakdown text: "12 base" is the stored base, then each source; a formula built from a changed field names it', S.fxText(rg.f_st) === '10 base \u00b7 Rage +2' && /Rage \+2 on ST/.test(S.fxText(rg.f_hp, true)), [S.fxText(rg.f_st), S.fxText(rg.f_hp, true)].join(' | '));
        // applyEffectOp: rights, ops, the clamp
        const cP = ch5([{ id: 'x_1', ref: 'e_bless', on: true }]); cP.values.f_hp = { cur: 14 };
        const aP = S.applyEffectOp(GM5, cP, 'f_fx', { op: 'add', rowId: 'x_9', ref: 'e_rage' }, F, { player: true, view: PL5 }), aGm = S.applyEffectOp(GM5, cP, 'f_fx', { op: 'add', rowId: 'x_9', ref: 'e_curse' }, F, { player: true, view: PL5 });
        const aLock = S.applyEffectOp(GM5, cP, 'f_fxgm', { op: 'add', rowId: 'x_9', ref: 'e_rage' }, F, { player: true, view: PL5 }), aAdhoc = S.applyEffectOp(GM5, cP, 'f_fx', { op: 'adhoc', row: { id: 'x_8', name: 'Peek', mods: [{ f: 'f_sec', op: 'add', v: 1 }] } }, F, { player: true, view: PL5 });
        check('5h: a player adds a visible effect; a GM-only effect, a GM-edit list and an ad hoc change to a GM-only field are refused; the GM may apply a GM-only effect',
            aP.ok && aP.value.length === 2 && !aGm.ok && aGm.reason === 'missing' && !aLock.ok && aLock.reason === 'field' && !aAdhoc.ok && aAdhoc.reason === 'value' && S.applyEffectOp(GM5, cP, 'f_fx', { op: 'add', rowId: 'x_9', ref: 'e_curse' }, F, {}).ok, j([aP, aGm, aLock, aAdhoc]));
        const again = S.applyEffectOp(GM5, ch5([{ id: 'x_1', ref: 'e_rage', on: false }]), 'f_fx', { op: 'add', rowId: 'x_2', ref: 'e_rage' }, F, {});
        const endBless = S.applyEffectOp(GM5, cP, 'f_fx', { op: 'remove', rowId: 'x_1' }, F, {});
        check('5h: adding an effect a character already has turns it back on (once per character); ending Blessed brings HP 14 down to the new max 10 in the same change',
            again.ok && j(again.value) === j([{ id: 'x_1', ref: 'e_rage', on: true }]) && endBless.ok && endBless.value.length === 0 && endBless.clamp && j(endBless.clamp.f_hp) === j({ cur: 10 }), j([again, endBless]));
        check('5h: switching and ending need an existing row; a plain edit can never set an effects list', !S.applyEffectOp(GM5, cP, 'f_fx', { op: 'on', rowId: 'x_404', on: false }, F, {}).ok && S.applyEffectOp(GM5, cP, 'f_fx', { op: 'on', rowId: 'x_1', on: false }, F, {}).value[0].on === false && !S.applyEdit(GM5, cP, 'f_fx', [], F, {}).ok);
        // the projection: the owner gets a GM-only effect inline, a teammate names only
        const cc = { id: 'c_1', name: 'P', ownerId: 'u_p', npc: false, values: { f_fx: [{ id: 'x_1', ref: 'e_rage', on: true }, { id: 'x_2', ref: 'e_curse', on: true }] } };
        const libAll = {}; GM5.effects.forEach(d => { libAll[d.id] = d; });
        const own = S.charFor(cc, PL5, 'u_p', { lib: libAll }), mate = S.charFor(cc, PL5, 'u_m', { lib: libAll });
        check('5h: the owner holds a visible effect as a reference and a GM-only one inline (changes to GM-only fields removed); a teammate gets names only',
            j(own.values.f_fx[0]) === j({ id: 'x_1', ref: 'e_rage', on: true }) && own.values.f_fx[1].name === 'Curse' && j(own.values.f_fx[1].mods) === j([{ f: 'f_st', op: 'add', v: -3 }]) && !('ref' in own.values.f_fx[1])
            && mate.values.f_fx.every(r => j(r.mods) === '[]' && !('ref' in r)) && mate.values.f_fx.map(r => r.name).join() === 'Rage,Curse', j([own.values.f_fx, mate.values.f_fx]));
        const ownClean = cleanChar(own, PL5), plAll = S.resolveAll(PL5, ownClean, F), gmAll = S.resolveAll(GM5, cc, F);
        check('5h: the player\'s copy works the same numbers out as the GM\'s (ST 10 + 2 − 3 = 9, HP max 9)', plAll.f_st.value === 9 && gmAll.f_st.value === 9 && plAll.f_hp.max === gmAll.f_hp.max, j([plAll.f_st, gmAll.f_st]));
        const hl = S.hoverLines(GM5, cc, F);
        check('5h: the hover card names the active effects, and a GM\'s public roll that a GM-only effect changed stays private', hl.some(l => /^Effects Rage, Curse$/.test(l)) && S.gmEffectNames(S.makeResolver(GM5, cc, F), [{ name: 'ST', value: 9 }]).join() === 'ST' && S.gmEffectNames(S.makeResolver(GM5, ch5([{ id: 'x_1', ref: 'e_rage', on: true }]), F), [{ name: 'ST', value: 12 }]).length === 0, j(hl));
        const cx = S.cleanCharEffect({ rid: 'r1', charId: 'c_1', fieldId: 'f_fx', op: 'adhoc', row: { id: 'x_7', name: 'X', mods: [{ f: 'f_st', op: 'add', v: '2' }] } });
        check('5h: the wire shape: only the known ops, ids and types pass (the rules are applyEffectOp\'s)', cx && cx.row.id === 'x_7' && !S.cleanCharEffect({ rid: 'r1', charId: 'c_1', fieldId: 'f_fx', op: 'nuke', rowId: 'x_1' }) && !S.cleanCharEffect({ rid: 'r1', charId: 'c_1', fieldId: 'f_fx', op: 'add', rowId: 'x_1', ref: '__proto__' }) && !S.cleanCharEffect({ rid: 'r1', charId: 'c_1', fieldId: 'f_fx', op: 'on', rowId: 'x_1', on: 'yes' }));
        // review fixes
        const two = S.resolveAll(GM5, { id: 'c_1', name: 'P', ownerId: 'u_p', npc: false, values: { f_fx: [{ id: 'x_1', ref: 'e_rage', on: true }], f_fxgm: [{ id: 'x_2', ref: 'e_rage', on: true }] } }, F);
        const cross = S.applyEffectOp(GM5, { id: 'c_1', values: { f_fx: [{ id: 'x_1', ref: 'e_rage', on: true }] } }, 'f_fxgm', { op: 'add', rowId: 'x_2', ref: 'e_rage' }, F, {});
        check('5h review: one library effect counts once per character across lists (ST 12, not 14), and adding it to a second list is refused', two.f_st.value === 12 && !cross.ok && cross.reason === 'value', j([two.f_st, cross]));
        const hid = cleanSystem({ v: 1, name: 'H', fields: [{ id: 'f_fx', key: 'Fx', kind: 'effects', vis: 'gm', edit: 'gm' }], rolls: [] }, { F, gmView: true });
        check('5h review: a Status effects list is always visible (GM-only is a property of an effect, never of the list)', hid.fields[0].vis === 'all' && cleanSystem({ v: 1, name: 'H', fields: [{ id: 'f_fx', key: 'Fx', kind: 'effects', vis: 'gm' }], rolls: [] }, { F, gmView: false }).fields.length === 1);
        const knD = S.fxText(kn.f_dodge);
        check('5h review: the breakdown\'s base is the value with no effect, so its parts add up to what is shown ("8 base · Knocked −4 on DX" for Dodge 7); a switched-on toggle reads "(on)"', knD === '8 base \u00b7 Knocked \u22124 on DX' && kn.f_dodge.base === 8 && S.fxText(kn.f_prone) === 'Knocked (on)', [knD, S.fxText(kn.f_prone)].join(' | '));
        const curseFull = { id: 'c_1', name: 'P', ownerId: 'u_p', npc: false, values: { f_fx: [{ id: 'x_1', ref: 'e_curse', on: true }] } };
        const rvC = S.makeResolver(GM5, curseFull, F); rvC('HP');
        check('5h review: a GM-only effect on a full pool (through its max) is found, so a public roll of "HP" stays private', S.gmEffectNames(rvC, [{ name: 'HP', value: 7 }]).join() === 'HP', j(rvC.detail('HP')));
        const fr = { v: 1, name: 'FR', fields: [{ id: 'f_ht', key: 'HT', kind: 'number', def: 11, vis: 'all' }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: 'HT / 2 + 3', def: 'max', min: 0, vis: 'all', edit: 'owner' }, { id: 'f_fx', key: 'Fx', kind: 'effects', vis: 'all', edit: 'owner' }], rolls: [], effects: [{ id: 'e_t', name: 'Tough', vis: 'all', mods: [{ f: 'f_hp', op: 'add', v: 5, part: 'max' }] }, { id: 'e_o', name: 'Other', vis: 'all', mods: [] }] };
        const FRs = cleanSystem(fr, { F, gmView: true }), chFr = { id: 'c_1', values: { f_hp: { cur: 13 }, f_fx: [{ id: 'x_1', ref: 'e_t', on: true }] } };
        const endT = S.applyEffectOp(FRs, chFr, 'f_fx', { op: 'remove', rowId: 'x_1' }, F, {}), other = S.applyEffectOp(FRs, { id: 'c_1', values: { f_hp: { cur: 13 }, f_fx: [] } }, 'f_fx', { op: 'add', rowId: 'x_2', ref: 'e_o' }, F, {});
        check('5h review: the clamp is a whole number (max 8.5 → 8), and only where this change lowered the max (an unrelated add clamps nothing)', endT.ok && j(endT.clamp) === j({ f_hp: { cur: 8 } }) && other.ok && !other.clamp, j([endT.clamp, other.clamp]));
        const kc = S.charFor({ id: 'c_1', name: 'P', ownerId: 'u_p', npc: false, values: { f_name: [{ id: 'x_1', ref: 'e_curse', on: true }], f_st: 12 } }, PL5, 'u_p', { lib: libAll });
        check('5h review: a value from before a kind change (effects rows now in a text field) never travels; a probe still sees every field', !('f_name' in kc.values) && kc.values.f_st === 12 && S.charFor({ id: 'c_1', name: 'P', ownerId: 'u_p', npc: false, values: { f_prone: 0 } }, PL5, 'u_p', { probe: true }).values.f_prone === 0, j(kc.values));
        const al = S.autoLayout(GM5);
        check('5h: the automatic layout gives status effects their own full-row section', al.sections.some(s => s.title === 'Effects' && s.fields.some(p => p.id === 'f_fx' && p.w === 'row')));
        // the host's handler, sliced from net.js and run with the real modules
        const netSrcX = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
        const iX = netSrcX.indexOf('// [netcheck:charfx-start]'), kX = netSrcX.indexOf('// [netcheck:charfx-end]');
        const runFx = new Function('SC', 'window', 'conn', 'msg', 'net', 'peerPaused', 'charLimit', '_charSlowSaid', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', netSrcX.slice(iX, kX) + '\nreturn "ran";');
        const hostRun = (msg, opts) => { opts = opts || {}; const camp = { id: 'camp1', system: GM5, chars: { c_1: JSON.parse(JSON.stringify(cc)), c_2: { id: 'c_2', name: 'Q', ownerId: 'u_q', npc: false, values: {} } } }; const sent = [], deltas = [];
            const netX = { paused: !!opts.paused, roster: { pA: { id: 'u_p' } }, syncCharDelta: (id, d) => deltas.push([id, d]) };
            runFx(() => S, { wpFormula: F, wpVtt: { on: () => !opts.off }, wpSheets: { playerSystem: () => PL5, charChanged() {} } }, { peer: 'pA', send: m => sent.push(m) }, msg, netX, () => false, { allow: () => true }, {}, () => camp, () => {}, () => {});
            return { sent, deltas, camp }; };
        const okR = hostRun({ type: 'char-effect', rid: 'r1', charId: 'c_1', fieldId: 'f_fx', op: 'add', rowId: 'x_9', ref: 'e_bless' });
        const denyOf = r => (r.sent.find(m => m.type === 'char-deny') || {}).reason;
        check('5h host: a player\'s change is judged and stored, acked, then synced; not their character, a GM-only effect, a GM-edit list, paused and sheets off are each refused; junk is dropped silently',
            okR.sent.some(m => m.type === 'char-ack') && okR.deltas.length === 1 && okR.camp.chars.c_1.values.f_fx.length === 3
            && denyOf(hostRun({ type: 'char-effect', rid: 'r2', charId: 'c_2', fieldId: 'f_fx', op: 'add', rowId: 'x_9', ref: 'e_bless' })) === 'owner'
            && denyOf(hostRun({ type: 'char-effect', rid: 'r3', charId: 'c_1', fieldId: 'f_fx', op: 'add', rowId: 'x_9', ref: 'e_curse' })) === 'missing'
            && denyOf(hostRun({ type: 'char-effect', rid: 'r4', charId: 'c_1', fieldId: 'f_fxgm', op: 'add', rowId: 'x_9', ref: 'e_rage' })) === 'field'
            && denyOf(hostRun({ type: 'char-effect', rid: 'r5', charId: 'c_1', fieldId: 'f_fx', op: 'remove', rowId: 'x_1' }, { paused: true })) === 'paused'
            && denyOf(hostRun({ type: 'char-effect', rid: 'r6', charId: 'c_1', fieldId: 'f_fx', op: 'remove', rowId: 'x_1' }, { off: true })) === 'off'
            && hostRun({ type: 'char-effect', charId: 'c_1', fieldId: 'f_fx', op: 'remove', rowId: 'x_1' }).sent.length === 0, j(okR));
        const shX = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), fxSrc = shX.slice(shX.indexOf('function effectsInto('), shX.indexOf('// Stage 5g: a value coloured by its sign'));
        check('5h review UI: the mark\'s direction is the value against its true base; controls are dead in the Layout preview and the pop-out; the New… form survives a re-render; revert restores a clamped pool; a number box is toned by what it shows',
            /var dir = \(typeof v === 'number' && typeof b === 'number'\) \? \(v > b \? 'up' : v < b \? 'down' : 'same'\) : 'same';/.test(shX) && (shX.match(/_fxLive = false; try \{ buildSections\(/g) || []).length === 2 && /editable = editable && _fxLive;/.test(shX)
            && /if \(_fxForm && _fxForm\.charId === c\.id && _fxForm\.fieldId === f\.id\)/.test(shX) && /if \(lastChange\.extra\) Object\.keys\(lastChange\.extra\)/.test(shX) && /signTone\(f, \{ value: Number\(inp\.value\) \}\)/.test(shX));
        check('5h UI: the effects list and its form draw text only (no markup), the editor\'s field dispatch skips effect rows, and every value from the host is re-cleaned against the players\' ids',
            fxSrc.length > 1000 && !/innerHTML/.test(fxSrc) && /row\.dataset\.cid \|\| row\.dataset\.iid \|\| row\.dataset\.eid\) return null;/.test(shX) && /SC2\.cleanValue\(f, msg\.values\[fid\], SC2\.valueOpts\(sysC\)\)/.test(netSrcX));
    }

    /* ---- Stage 6 Fold 0/1: the bridge reads text skill levels; value names; signed caption values; the bigger caps ---- */
    {
        const sb6 = cleanSystem(g3d6, { F, gmView: true }), sbStr = aliasFromShadowBase({ skills: [{ name: 'Stealth', level: '15' }, { name: 'Climbing', level: 'x12' }] }, sb6, F);
        check('6 F0: the bridge reads a skill level the website wrote as text ("15"), and ignores one that is not a number', sbStr.values.f_sk_stealth === 15 && !('f_sk_climbing' in sbStr.values), j(sbStr.values));
        check('6 F1: room for 40 sections and 300 placements', LIMITS.sections === 40 && LIMITS.placements === 300 && LIMITS.labels === 10);
        const lf = cleanField({ id: 'f_stun', key: 'Stun', kind: 'number', def: 7, min: -5, max: 99, step: 0.5, labels: ['Not stunned', 'Physical\u0007', ' Mental ', 5, ''], vis: 'all' }, F, true);
        check('6 F1: a number with value names keeps them cleaned (control characters, trimmed, a non-string kept as a blank place, trailing blanks dropped) and takes their range: 0..n-1, step 1, the default clamped',
            lf && j(lf.labels) === j(['Not stunned', 'Physical', 'Mental']) && lf.min === 0 && lf.max === 2 && lf.step === 1 && lf.def === 2, j(lf));
        const lf2 = cleanField({ id: 'f_x', key: 'X', kind: 'number', labels: Array.from({ length: 14 }, (_, i) => 'L' + i + 'x'.repeat(80)) }, F, true), lf3 = cleanField({ id: 'f_t', key: 'T', kind: 'text', labels: ['a'] }, F, true), lf4 = cleanField({ id: 'f_y', key: 'Y', kind: 'number', labels: ['', ' '] }, F, true);
        check('6 F1: value names are capped (10, each 60 characters), ignored on a kind that cannot show them, and absent when all are blank', lf2.labels.length === 10 && lf2.labels.every(s => s.length <= 60) && !('labels' in lf3) && !('labels' in lf4) && lf4.max === undefined);
        const nsys = cleanSystem({ v: 1, name: 'N', fields: [{ id: 'f_stun', key: 'Stun', kind: 'number', def: 0, labels: ['Not stunned', 'Physical', 'Mental'], vis: 'all', hover: true }, { id: 'f_enc', key: 'Enc', kind: 'formula', formula: 'Stun * 2', labels: ['None', 'Light', 'Medium', 'Heavy', 'X-Heavy'], vis: 'all' }, { id: 'f_def', key: 'Def', kind: 'formula', formula: 'Stun - 4', vis: 'all', caption: 'Active defenses {\u00b1-4 * (Stun > 0)} · {+/-Def} · {Def}' }], rolls: [] }, { F, gmView: true });
        const nr1 = resolveAll(nsys, { id: 'c_1', values: { f_stun: 1 } }, F), nr3 = resolveAll(nsys, { id: 'c_1', values: { f_stun: 2 } }, F);
        check('6 F1: a named number shows its name, a formula shows the name for its value (and the number past the names); formulas read the number; the hover card prints the name',
            nr1.f_stun.text === 'Physical' && nr1.f_stun.value === 1 && nr1.f_enc.text === 'Medium' && nr1.f_enc.value === 2 && nr3.f_enc.text === 'X-Heavy' && resolveAll(nsys, { id: 'c_1', values: { f_stun: 0 } }, F).f_enc.text === 'None'
            && hoverLines(nsys, { id: 'c_1', values: { f_stun: 2 } }, F).join() === 'Stun Mental' && cleanValue(nsys.fields[0], 3.7) === 2 && cleanValue(nsys.fields[0], -1) === 0, j([nr1.f_stun, nr1.f_enc, nr3.f_enc]));
        const nsys2 = cleanSystem({ v: 1, name: 'N', fields: [{ id: 'f_s', key: 'S', kind: 'number', def: 0, vis: 'all' }, { id: 'f_e', key: 'E', kind: 'formula', formula: 'S * 2', labels: ['A', 'B'], vis: 'all' }], rolls: [] }, { F, gmView: true });
        check('6 F1: a value past the names prints the number; a named value in the header is a word (never toned red/green)', resolveAll(nsys2, { id: 'c_1', values: { f_s: 3 } }, F).f_e.text === '6' && !S.headerEntry(nsys.fields[1], nr1.f_enc).neg && !S.headerEntry(nsys.fields[1], nr1.f_enc).pos && S.headerEntry(nsys.fields[1], nr1.f_enc).text === 'Medium');
        const cp1 = S.captionParts(nsys, { id: 'c_1', values: { f_stun: 1 } }, F, nsys.fields[2].caption), cp0 = S.captionParts(nsys, { id: 'c_1', values: { f_stun: 0 } }, F, 'x {\u00b1Stun} y {\u00b1 Stun - 1}');
        check('6 F1: a caption\'s {\u00b1X} (or {+/-X}) shows the value with its sign — +2, -3, +0 — and a plain {X} is unchanged', cp1.map(p => p.text).join('') === 'Active defenses -4 · -3 · -3' && cp0.map(p => p.text).join('') === 'x +0 y -1', j([cp1, cp0]));
        const vsC = validateSystem(nsys, F);
        check('6 F1: validateSystem reads a signed caption like any other (no parse warning)', !vsC.warnings.some(w => w.prop === 'caption'), j(vsC.warnings));
        const gmCap = { v: 1, name: 'G', fields: [{ id: 'f_sec', key: 'Secret', kind: 'number', def: 3, vis: 'gm' }, { id: 'f_a', key: 'A', kind: 'number', def: 1, vis: 'all', caption: 'Sign {\u00b1Secret}' }, { id: 'f_b', key: 'B', kind: 'number', def: 1, vis: 'all', caption: '{A}{A}{A}{A}{A}{A}{A}{A} then {Secret}' }, { id: 'f_c', key: 'C', kind: 'number', def: 1, vis: 'all', caption: 'Fine {\u00b1A}' }], rolls: [] };
        const plC = cleanSystem(gmCap, { F, gmView: false });
        check('6 F1: the players\' view drops a caption naming a GM-only field inside {\u00b1…}, and one naming it past the drawn values; a clean signed caption stays', !('caption' in plC.fields.find(f => f.id === 'f_a')) && !('caption' in plC.fields.find(f => f.id === 'f_b')) && plC.fields.find(f => f.id === 'f_c').caption === 'Fine {\u00b1A}', j(plC.fields));
        // review fixes
        const failC = { v: 1, name: 'G', fields: [{ id: 'f_sec', key: 'Secret', kind: 'number', def: 3, vis: 'gm' }, { id: 'f_a', key: 'A', kind: 'number', def: 1, vis: 'all', caption: 'x {Secret +}' }, { id: 'f_b', key: 'B', kind: 'number', def: 1, vis: 'all', caption: 'x {\u00b1\u00b1Secret}' }, { id: 'f_c', key: 'C', kind: 'number', def: 1, vis: 'all', caption: 'x {max(Secret)' }, { id: 'f_d', key: 'D', kind: 'formula', formula: 'Secret +', vis: 'all' }, { id: 'f_e', key: 'E', kind: 'number', def: 1, vis: 'all', caption: 'Plain words about secrets {A}' }], rolls: [{ id: 'r_x', label: 'X', formula: '3d6 + Secret +', vis: 'all' }] };
        const plF = cleanSystem(failC, { F, gmView: false }), fld = id => plF.fields.find(f => f.id === id);
        check('6 F1 review: the players\' view fails closed — a {…} that does not parse ({Secret +}, {\u00b1\u00b1Secret}, an unclosed {max(Secret)) drops its caption, a broken formula naming a GM-only field reads "GM only", a broken roll is dropped; prose outside braces is not a name',
            !('caption' in fld('f_a')) && !('caption' in fld('f_b')) && !('caption' in fld('f_c')) && fld('f_d').formula === null && !plF.rolls.some(r => r.id === 'r_x') && fld('f_e').caption === 'Plain words about secrets {A}', j(plF));
        const ninth = validateSystem(cleanSystem(gmCap, { F, gmView: true }), F);
        check('6 F1 review: the validator warns about a GM-only name in any {…} of a caption (the 9th too) and that values past the 8th show as written', ninth.warnings.some(w => w.id === 'f_b' && /GM only/.test(w.message)) && ninth.warnings.some(w => w.id === 'f_b' && /only the first 8/.test(w.message)), j(ninth.warnings));
        const tiny = cleanSystem({ v: 1, name: 'T', fields: [{ id: 'f_a', key: 'A', kind: 'number', def: -0.001, step: 0.001, vis: 'all' }], rolls: [] }, { F, gmView: true });
        check('6 F1 review: a signed caption takes its sign from what is printed ({\u00b1A} with A = -0.001 reads +0, never -0)', S.captionParts(tiny, { id: 'c_1', values: {} }, F, '{\u00b1A}').map(p => p.text).join('') === '+0');
        check('6 F1 review: a value name never holds a comma (the editor\'s separator), so a round trip keeps every name in its place', j(cleanField({ id: 'f_x', key: 'X', kind: 'number', labels: ['Stunned, physical', '', 'Out'] }, F, true).labels) === j(['Stunned physical', '', 'Out']));
        let threw = null; try { aliasFromShadowBase({ skills: [null, 5, 'x', { name: 'Stealth', level: '12' }] }, sb6, F); } catch (e) { threw = e.message; }
        check('6 F1 review: the bridge skips a null or non-object skill entry (it checks before it reads)', threw === null && aliasFromShadowBase({ skills: [null, { name: 'Stealth', level: '12' }] }, sb6, F).values.f_sk_stealth === 12, threw);
        check('6 F1 review: a named value is a word — no unit after it in the header', S.headerEntry(Object.assign({}, nsys.fields[1], { unit: 'kg' }), nr1.f_enc).text === 'Medium');
        const sh6 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8');
        check('6 F1 review UI: a stored value past the names shows as its number in the dropdown; a saved system re-checks every character\'s values before the sync; a named value is never toned or given a unit; namesFacing reads {\u00b1…}; the editor keeps blank places and redraws only the default cell',
            /if \(!\(curL === Math\.floor\(curL\) && curL >= 0 && curL < f\.labels\.length\)\)/.test(sh6) && /camp\.system = clean;\n    reCleanChars\(camp, clean\);/.test(sh6.replace(/\r\n/g, '\n')) && /e\.error \|\| e\.label \|\| typeof e\.value/.test(sh6)
            && /hit\(capExpr\(m\[1\]\)\.expr\)/.test(sh6) && /while \(vn\.length && !vn\[vn\.length - 1\]\) vn\.pop\(\);/.test(sh6) && /if \(dcV\) buildDefCell\(dcV, f\);/.test(sh6));
        check('6 F1 UI: a named number draws as a dropdown of its names (text only), the header never makes it an editable number, and the editor has a Value names box with a default picked from the names',
            /if \(k === 'number' && Array\.isArray\(f\.labels\) && f\.labels\.length\) \{   \/\/ Stage 6/.test(sh6) && /if \(ledger && f\.kind === 'number' && !f\.labels && /.test(sh6) && /input\('sys-vnames field'/.test(sh6) && /select\('sys-def-lbl'/.test(sh6));
    }

    /* ---- Stage 5h Fold 3: facing — the arc, threat marks, the built-in names, the dial's cycle, the player's patch ---- */
    {
        const A = (deg, b, sides) => S.threatArc({ deg, sides: sides || 6 }, b);
        check('5h F3: threatArc counts sides from the one the token faces — hex: that side and the two beside it front, the next two side, the back one rear; square: 1 / 2 / 1; a free-angle token reads the side the dial shows (a rear exists at 90 on a hex dial)',
            [0, 60, -60].every(b => A(0, b) === 0) && A(0, 120) === 1 && A(0, -120) === 1 && A(0, 180) === 2 && A(0, 90, 4) === 1 && A(0, -90, 4) === 1 && A(0, 180, 4) === 2 && A(0, 0, 4) === 0 && A(300, 0) === 0 && A(90, 300) === 2 && A(15, 90, 4) === 1 && A(45, 270, 4) === 2
            && S.sideOf(90, 6) === 2 && S.sideOf(-60, 6) === 5 && S.sideOf(359, 4) === 0 && [0, 60, 120, 180, 240, 300].some(b => A(90, b) === 2));
        const ct = S.cleanThreats([0, 0, 360, -180, 181, 'x', NaN, 1e300, null, 60.4, -0.2, 120, 240, 300, 45]);
        check('5h F3: cleanThreats — whole degrees in (-180, 180], each once, junk dropped, at most 6; anything but a list is []', j(ct) === '[0,180,-179,60,120,-120]' && j(S.cleanThreats('x')) === '[]' && j(S.cleanThreats({ 0: 5 })) === '[]' && Object.is(S.cleanThreats([-0.3])[0], 0), j(ct));
        const fcx = S.facingCtx({ meta: { gridType: 'square' } }, { rot: -90, front: 0, threats: [180, 'x'] }, true);
        check('5h F3: facingCtx — rot + front as 0–360 degrees, 4 sides on a square grid and 6 otherwise, cleaned threats; null with facing off, no token, or a facing that is not a bounded number',
            fcx && fcx.deg === 270 && fcx.sides === 4 && j(fcx.threats) === '[180]' && S.facingCtx({}, { rot: 30 }, true).sides === 6 && S.facingCtx({}, { rot: 30, front: 45 }, true).deg === 75
            && S.facingCtx({}, { rot: 10 }, false) === null && S.facingCtx({}, null, true) === null && S.facingCtx({}, { rot: 'x' }, true) === null && S.facingCtx({}, { rot: 1e300 }, true) === null
            && S.facingCtx({}, { rot: { valueOf() { throw new Error('boom'); } } }, true) === null && S.facingCtx({}, { rot: '30' }, true) === null, j(fcx));
        const sq = S.facingCtx({ meta: { gridType: 'square' } }, { rot: 0, threats: [60, 120, 200] }, true);
        check('5h F3: facingCtx puts each mark on its side, one per side (marks set on a hex map read as the square dial shows them)', j(sq.threats) === '[90,180]', j(sq));
        const mapT = { whiteboard: [{ id: 'a', isChar: true, charId: 'c_1', hidden: true, ownerId: 'u_p' }, { id: 'b', charId: 'c_1', ownerId: 'u_p' }, { id: 'c', isChar: true, charId: 'c_1', ownerId: 'u_x' }, { id: 'd', isChar: true, charId: 'c_1', ownerId: 'u_p' }] };
        check('5h F3: charTokenOn — a shown character token only, the owner\'s first, else the first; strict = the owner\'s only; hidden = a hidden one too', S.charTokenOn(mapT, 'c_1', 'u_p').id === 'd' && S.charTokenOn(mapT, 'c_1', 'u_q').id === 'c' && S.charTokenOn(mapT, 'c_2', 'u_p') === null && S.charTokenOn(null, 'c_1') === null && S.charTokenOn(mapT, undefined) === null
            && S.charTokenOn(mapT, 'c_1', 'u_q', { strict: true }) === null && S.charTokenOn(mapT, 'c_1', 'u_p', { strict: true }).id === 'd' && S.charTokenOn({ whiteboard: [mapT.whiteboard[0]] }, 'c_1', null, { hidden: true }).id === 'a' && S.charTokenOn({ whiteboard: [mapT.whiteboard[0]] }, 'c_1', null) === null);
        const cy = S.cycleThreat;
        check('5h F3: cycleThreat — a new side is marked (active when first, else queued); the active one clicked is cleared; a queued one clicked becomes active, the old active queued',
            j(cy([], 60, 6)) === '[60]' && j(cy([60], 120, 6)) === '[60,120]' && j(cy([60, 120], 60, 6)) === '[120]' && j(cy([60, 120, 180], 180, 6)) === '[180,60,120]' && j(cy([60], 61, 6)) === '[]' && j(cy([0], 90, 4)) === '[0,90]' && j(cy([60], NaN, 6)) === '[60]');
        const fsys = cleanSystem({ v: 1, name: 'FC', fields: [{ id: 'f_dg', key: 'Dodge', kind: 'number', def: 8, vis: 'all' }, { id: 'f_ed', key: 'EffDodge', kind: 'formula', formula: 'if(Arc.rear, 0, Dodge - Arc)', vis: 'all' }, { id: 'f_tr', key: 'Rear', kind: 'formula', formula: 'Threats.rear * 10 + Threats', vis: 'all' }, { id: 'f_fc', key: 'Face', kind: 'formula', formula: 'Facing', vis: 'all' }], rolls: [] }, { F, gmView: true });
        const chF3 = { id: 'c_1', values: {} };
        const neutral = S.resolveAll(fsys, chF3, F), sideR = S.resolveAll(fsys, chF3, F, { facing: { deg: 0, sides: 6, threats: [120, 180] } }), rearR = S.resolveAll(fsys, chF3, F, { facing: { deg: 90, sides: 6, threats: [270] } });
        check('5h F3: the built-in names — neutral with no context (Arc 0, no threats, Facing 0); an active side threat takes 1 off Dodge, a rear one zeroes it; the counts by arc',
            neutral.f_ed.value === 8 && neutral.f_tr.value === 0 && neutral.f_fc.value === 0 && sideR.f_ed.value === 7 && sideR.f_tr.value === 12 && rearR.f_ed.value === 0 && rearR.f_fc.value === 90 && rearR.f_tr.value === 11, j([neutral.f_ed, sideR.f_ed, sideR.f_tr, rearR.f_ed, rearR.f_tr]));
        const shadow = cleanSystem({ v: 1, name: 'SH', fields: [{ id: 'f_arc', key: 'Arc', kind: 'number', def: 3, vis: 'all' }, { id: 'f_x', key: 'X', kind: 'formula', formula: 'Arc + Arc.front', vis: 'all' }], rolls: [] }, { F, gmView: true });
        const vs = S.validateSystem(fsys, F), vsh = S.validateSystem(shadow, F), rsh = S.resolveAll(shadow, chF3, F, { facing: { deg: 0, sides: 6, threats: [180] } });
        check('5h F3: validateSystem knows the facing names; a field named Arc keeps the whole family (Arc.front is then unknown) and reads as the field', vs.ok && !vsh.ok && vsh.errors.some(e => /Arc\.front/.test(e.message)) && rsh.f_arc.value === 3, j([vs.errors, vsh.errors]));
        const withDial = cleanSystem({ v: 1, name: 'D', fields: [], rolls: [], sheet: { sections: [{ id: 's_1', title: 'Dash', fields: [{ kind: 'facing', w: 1 }, { kind: 'bogus' }] }] } }, { F, gmView: false });
        check('5h F3: a Facing dial placement is kept (the players\' view too); an unknown kind is dropped', withDial.sheet && withDial.sheet.sections[0].fields.length === 1 && withDial.sheet.sections[0].fields[0].kind === 'facing', j(withDial.sheet));
        // the host's patch gate, sliced from net.js and run with the real module
        const netSrcP = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
        const iP = netSrcP.indexOf('// [netcheck:patch-start]'), kP = netSrcP.indexOf('// [netcheck:patch-end]');
        const mkCamp = () => ({ id: 'camp1', items: { m1: { type: 'map', whiteboard: [{ id: 't1', isChar: true, charId: 'c_1', ownerId: 'u_p', x: 10, y: 10, rot: 0, front: 0 }, { id: 't2', isChar: true, charId: 'c_2', ownerId: 'u_q', x: 50, y: 50, rot: 0, front: 0, threats: [60] }] } } });
        const runP = (camp, wb, on) => new Function('state', 'window', 'playerStroke', 'cleanElevation', 'cleanPosture', 'msg', 'prof', ownLines(netSrcP) + netSrcP.slice(iP, kP) + '\nreturn applyClientItemFiltered(msg, prof);')(
            { appState: { campaigns: { camp1: camp } } }, { wpVtt: { campaignOn: k => k !== 'turning' || on }, wpSystemCore: S }, () => null, v => Number(v) || 0, v => typeof v === 'string' ? v : 'standing', { campId: 'camp1', itemId: 'm1', item: { whiteboard: wb } }, { id: 'u_p' });
        const c1 = mkCamp(), ch1 = runP(c1, [{ id: 't1', x: 10, y: 10, rot: 0, front: 0, threats: [120, 180] }, { id: 't2', x: 50, y: 50, rot: 0, front: 0 }], true);
        const c3 = mkCamp(); c3.items.m1.whiteboard[0].threats = [120]; const ch3 = runP(c3, [{ id: 't1', x: 10, y: 10, rot: 0, front: 0 }], true);
        const c4 = mkCamp(); Object.assign(c4.items.m1.whiteboard[0], { hidden: true, front: 90, elevation: 3, threats: [120] }); const ch4 = runP(c4, [{ id: 't1', type: 'rect', hidden: true, x: 10, y: 10, rot: 0, locked: true }], true);
        check('5h F3 host: a map patch never carries threat marks (a stale copy cannot undo the GM\'s: they come as their own message), and a hidden token\'s stub never overwrites the host\'s token (front, stance, marks kept) — the real applyClientItemFiltered, sliced from net.js',
            iP > 0 && kP > iP && ch1 === false && !('threats' in c1.items.m1.whiteboard[0]) && j(c1.items.m1.whiteboard[1].threats) === '[60]' && ch3 === false && j(c3.items.m1.whiteboard[0].threats) === '[120]'
            && ch4 === false && c4.items.m1.whiteboard[0].front === 90 && c4.items.m1.whiteboard[0].elevation === 3 && j(c4.items.m1.whiteboard[0].threats) === '[120]', j([c1.items.m1.whiteboard, c3.items.m1.whiteboard[0], c4.items.m1.whiteboard[0]]));
        const shF3 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), dialSrc = shF3.slice(shF3.indexOf('function facingNode('), shF3.indexOf('function tokenTurned('));
        check('5h F3 UI: the dial draws with createElementNS and textContent only (no markup), is live only on the real sheet for the GM or the token\'s own unpaused player (never on a token the GM locked), and acts only through the whiteboard setters; the sheet and both roll sites pass the facing context',
            dialSrc.length > 1500 && !/innerHTML/.test(dialSrc) && /var n = net\(\), live = _fxLive && \(gm \|\| \(t\.tok\.ownerId === myId\(\) && !t\.tok\.locked && !\(n && \(n\.paused \|\| n\.selfPaused\)\)\)\);[^\n]*\n\s*if \(live\) wrap\.classList\.add\('sheet-dial-live'\);/.test(dialSrc) && /wpSetTokenFacing/.test(dialSrc) && /wpSetTokenThreats/.test(dialSrc)
            && /var all = resolveAll\(sys, c, F\(\), tokenCtxFor\(c\.id, camp\)\);/.test(shF3) && /resolveAll\(sys, c, F\(\), tokenCtxFor\(c\.id, camp\)\), true, false, function\(\) \{ renderSheetInto/.test(shF3)
            && /if \(inSession\) return \(loc && /.test(shF3) && /charTokenOn\(am, c\.id, myId\(\), \{ strict: true \}\)/.test(shF3) && /if \(body && ae && body\.contains\(ae\) && \/\^\(INPUT\|TEXTAREA\|SELECT\)\$\/\.test\(ae\.tagName\) && !committed\)/.test(shF3)
            && /tcQ = SQ\.tokenCtx\(mapQ, SQ\.charTokenOn\(mapQ, q\.charId, pidQ, \{ strict: true \}\), \{ turning: ruleQ\('turning'\), posture: ruleQ\('posture'\), elevation: ruleQ\('elevation'\) \}\);/.test(netSrcP) && /varsQ = SQ\.makeResolver\(viewQ, chvQ, Fq, tcQ\);/.test(netSrcP)
            && (netSrcP.match(/delete (mine|there|nw|tok)\.threats;/g) || []).length === 4 && /SR\.makeResolver\(campR\.system, chR, F, window\.wpSheets && window\.wpSheets\.tokenCtxFor \? window\.wpSheets\.tokenCtxFor\(chR\.id, campR\) : null\)/.test(netSrcP));
        const wbF3 = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8');
        check('5h F3: the dial\'s setters turn on the token\'s own map under the arrow\'s rule (a player: their own token, not paused, not locked by the GM; facing on) and end with a final pos, or a whole-map send for a map off screen',
            /if \(n && n\.active && n\.role === 'client' && \(n\.paused \|\| n\.selfPaused \|\| tok\.ownerId !== n\.myId \|\| tok\.locked\)\) return null;/.test(wbF3) && /if \(!tok \|\| !tok\.isChar \|\| \(feature !== null && window\.wpVtt && !window\.wpVtt\.on\(feature \|\| 'turning'\)\)\) return null;/.test(wbF3)
            && /window\.wpNet\.streamPos\(t\.tok, true\)/.test(wbF3) && /n\.broadcastItemFiltered\(t\.camp\.id, t\.mapId\)/.test(wbF3) && /var step = facingStepFor\(\(t\.map\.meta && t\.map\.meta\.gridType\) \|\| 'off', t\.tok\);/.test(wbF3));
    }

    /* ---- Stage 6 F4a: carried rows — shapes, the owner's projection, row ops, copies of deleted entries ---- */
    {
        const R4 = cleanSystem({ v: 1, name: 'R', fields: [{ id: 'f_gear', key: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner' }, { id: 'f_gml', key: 'Secret', kind: 'item-list', vis: 'gm', edit: 'owner' }, { id: 'f_gmx', key: 'Locked', kind: 'item-list', vis: 'all', edit: 'gm' }], rolls: [],
            items: [{ id: 'i_rope', name: 'Rope', category: 'Gear' }, { id: 'i_ring', name: 'Cursed ring', vis: 'gm', damage: '1d6', cost: '50', notes: 'It whispers', rm: 'bound', rmMsg: 'It will not\u0007 budge' }, { id: 'i_boom', name: 'Frag', area: { ft: 12 }, damage: '4d6' }, { id: 'i_sword', name: 'Sword', rm: 'curse', rmMsg: 'A chill lingers' }, { id: 'i_chain', name: 'Chain', rm: 'bound' }] }, { F, gmView: true });
        const vo4 = S.valueOpts(R4), fGear = R4.fields[0];
        const legacy = [{ defId: 'i_rope', qty: 2 }, { defId: 'i_boom', qty: 1 }];
        check('6 F4a: a list of today\'s {defId, qty} rows cleans byte-for-byte as before (nothing minted, no new keys)', j(cleanValue(fGear, legacy, vo4)) === j(legacy));
        const mixed = cleanValue(fGear, [{ id: 'w_a1', defId: 'i_rope', qty: 1 }, { defId: 'i_rope', qty: 3 }, { id: 'w_a1', defId: 'i_boom', qty: 1 }, { defId: 'i_gone', qty: 1 }, { id: 'w_b2', defId: 'i_gone', qty: 2, snap: { name: 'Old lamp', vis: 'all', damage: '1d4' } }, { id: 'w_c3', qty: 1, def: { name: 'Keepsake', category: 'Mine', damage: '1d2' } }, { id: 'w_d4', qty: 1, def: { name: 'Inline', vis: 'gm', area: { ft: 5 } }, lnk: 1 }, { id: 'bad', defId: 'i_rope' }, { defId: 'i_boom', qty: 1 }], vo4);
        check('6 F4a: rows — linked with an id, one id-less row per item (the rule before), a row id once, an unknown item dropped unless it carries a copy (snap), custom rows keep their GM texts, an owner\'s inline copy keeps players\' fields only (a GM-only one no area), a bad id is ignored as an id',
            j(mixed.map(r => S.rowIdOf(r))) === j(['w_a1', 'w_b2', 'w_c3', 'w_d4', 'w_boom']) && mixed[1].snap.name === 'Old lamp' && mixed[1].snap.damage === '1d4' && mixed[2].def.damage === '1d2' && !('damage' in mixed[3].def) && !('area' in mixed[3].def) && mixed[3].lnk === 1, j(mixed));
        const back = cleanValue(fGear, [{ id: 'w_b2', defId: 'i_rope', qty: 1, snap: { name: 'Old rope' } }], vo4);
        check('6 F4a: a copy whose entry is back in the library reads the library again (the snapshot is dropped)', j(back) === j([{ id: 'w_b2', defId: 'i_rope', qty: 1 }]), j(back));
        const many = []; for (let i = 0; i < 180; i++) many.push({ id: 'w_m' + i, defId: 'i_rope', qty: 1 });
        check('6 F4a: a list holds at most 150 rows (a big sheet\'s skills)', LIMITS.carried === 150 && cleanValue(fGear, many, vo4).length === 150);
        check('6 F4a: rowDef — the library entry, else the deleted entry\'s copy, else the row\'s own', S.rowDef(R4, { defId: 'i_rope' }).src === 'lib' && S.rowDef(R4, { defId: 'i_x', snap: { name: 'A' } }).src === 'lost' && S.rowDef(R4, { id: 'w_1', def: { name: 'B' } }).src === 'custom' && S.rowDef(R4, { id: 'w_1', def: { name: 'B' }, lnk: 1 }).src === 'inline' && S.rowDef(R4, { defId: 'i_x' }) === null);
        const view4 = cleanSystem(R4, { F, gmView: false }), lib4 = {}; R4.items.forEach(it => { lib4[it.id] = it; });
        const own = { id: 'c_1', name: 'P', ownerId: 'u_p', npc: false, values: { f_gear: [{ defId: 'i_rope', qty: 1 }, { id: 'w_r1', defId: 'i_ring', qty: 1 }, { id: 'w_l1', defId: 'i_lamp', qty: 1, snap: { name: 'Old lamp', vis: 'all', area: { ft: 5 }, damage: '1d4' } }, { id: 'w_k1', qty: 1, def: { name: 'Keepsake', damage: '1d2', cost: '9' } }] } };
        const pOwn = S.charFor(own, view4, 'u_p', { items: lib4 }).values.f_gear, pNo = S.charFor(own, view4, 'u_p', {}).values.f_gear;
        check('6 F4a: the owner\'s copy — a visible item as a pointer; a GM-only item inline with its name and notes (no damage, cost or area); a deleted item\'s copy inline; a custom item without its GM texts; without the host\'s library a GM-only row is left out',
            j(pOwn[0]) === j({ defId: 'i_rope', qty: 1 }) && pOwn[1].lnk === 1 && pOwn[1].def.name === 'Cursed ring' && pOwn[1].def.notes === 'It whispers' && !('rm' in pOwn[1].def) && !('rmMsg' in pOwn[1].def) && !('damage' in pOwn[1].def) && !('cost' in pOwn[1].def) && !JSON.stringify(pOwn).includes('1d6')
            && pOwn[2].lnk === 1 && pOwn[2].def.area.ft === 5 && !('damage' in pOwn[2].def) && j(pOwn[3]) === j({ id: 'w_k1', qty: 1, def: { name: 'Keepsake', category: '', icon: '', notes: '', vis: 'all' } }) && pNo.length === 3 && !pNo.some(r => r.id === 'w_r1'), j(pOwn));
        const cOwn = cleanValue(view4.fields[0], pOwn, S.valueOpts(view4));
        check('6 F4a: the owner\'s client keeps every row of its copy through its own cleaner (pointer, inline, custom)', cOwn.length === 4 && cOwn[1].lnk === 1, j(cOwn));
        const ch4 = () => JSON.parse(JSON.stringify(own)), aro = (q, o, c) => S.applyRowOp(R4, c || ch4(), 'f_gear', q, F, o || {}), P4 = { player: true, view: view4 };
        const a1 = aro({ op: 'add', defId: 'i_rope', qty: 2 }), a2 = aro({ op: 'add', defId: 'i_boom', rowId: 'w_n1' }, P4);
        check('6 F4a: add — the same item again raises its quantity; a new row takes the id its maker gave it', a1.ok && a1.value[0].qty === 3 && a2.ok && j(a2.value[4]) === j({ id: 'w_n1', defId: 'i_boom', qty: 1 }), j([a1, a2]));
        const aTaken = aro({ op: 'add', defId: 'i_boom', rowId: 'w_r1' }), aDerived = aro({ op: 'add', defId: 'i_boom', rowId: 'w_sword' }), aGm = aro({ op: 'add', defId: 'i_ring', rowId: 'w_n2' }, P4), aNo = aro({ op: 'add', defId: 'i_nope', rowId: 'w_n3' }, P4);
        check('6 F4a: add refuses a taken row id and an id an item\'s legacy row would derive (value); to a player a GM-only or unknown item reads as gone (missing, never "exists")', !aTaken.ok && aTaken.reason === 'value' && !aDerived.ok && aDerived.reason === 'value' && aGm.reason === 'missing' && aNo.reason === 'missing', j([aTaken, aDerived, aGm, aNo]));
        const rmLock = aro({ op: 'remove', rowId: 'w_r1' }, P4), zLock = aro({ op: 'setQty', rowId: 'w_r1', qty: 0 }, P4), rmGm = aro({ op: 'remove', rowId: 'w_r1' }), q5 = aro({ op: 'setQty', rowId: 'w_r1', qty: 5 }, P4), rmRope = aro({ op: 'remove', rowId: 'w_rope' }, P4);
        const c3 = ch4(); c3.values.f_gear[1].qty = 3; const down = aro({ op: 'setQty', rowId: 'w_r1', qty: 2 }, P4, c3);
        check('6 F4a: a bound item — a player cannot remove it, take it to zero or lower it ("stays", with the GM\'s message as text and its name for the GM); the GM can; the player may raise it; a legacy row is addressed by its derived id',
            rmLock.ok === false && rmLock.reason === 'stays' && rmLock.msg === 'It will not  budge' && rmLock.name === 'Cursed ring' && zLock.reason === 'stays' && down.reason === 'stays' && rmGm.ok && !rmGm.value.some(r => S.rowIdOf(r) === 'w_r1') && q5.ok && q5.value[1].qty === 5 && rmRope.ok && !rmRope.value.some(r => r.defId === 'i_rope'), j([rmLock, zLock, down, q5]));
        const G = a => Object.assign({ grace: { added: a } }, P4), gOk = aro({ op: 'remove', rowId: 'w_r1' }, G(1)), c4 = ch4(); c4.values.f_gear[1].qty = 3;
        const gBack = aro({ op: 'setQty', rowId: 'w_r1', qty: 1 }, G(2), c4), gPast = aro({ op: 'setQty', rowId: 'w_r1', qty: 0 }, G(2), c4);
        check('6 F4a: inside a pickup\'s Undo window (grace = what its pickups added, by the host\'s count) a bound item may drop by that much, never more', gOk.ok && gOk.undone === 1 && !gOk.value.some(r => S.rowIdOf(r) === 'w_r1') && gBack.ok && gBack.value[1].qty === 1 && gBack.undone === 2 && gPast.reason === 'stays', j([gOk, gBack, gPast]));
        const uIn = aro({ op: 'undo', rowId: 'w_r1', qty: 5 }, G(1), c4), uNone = aro({ op: 'undo', rowId: 'w_r1', qty: 1 }, P4, c4), uSpent = aro({ op: 'undo', rowId: 'w_r1', qty: 1 }, G(0), c4), uGm = aro({ op: 'undo', rowId: 'w_r1', qty: 2 }, {}, c4);
        const csU = ch4(); csU.values.f_gear.push({ id: 'w_s5', defId: 'i_sword', qty: 1 }); const uCurse = aro({ op: 'undo', rowId: 'w_s5', qty: 1 }, G(1), csU);
        check('6 F4a: undo takes back what the window says was picked up (never more, whatever the client asks), is a quiet no-op once the window has nothing left, is a plain drop with no window (a bound item stays), the GM\'s takes back what it names, and a cursed pickup undone is kept hidden like any drop',
            uIn.ok && uIn.value[1].qty === 2 && uIn.undone === 1 && uNone.reason === 'stays' && uSpent.ok && uSpent.value[1].qty === 3 && !uSpent.undone && uGm.ok && uGm.value[1].qty === 1 && uCurse.ok && uCurse.hid === true && uCurse.value.some(r => r.hid === 1 && r.defId === 'i_sword'), j([uIn, uNone, uSpent, uCurse]));
        const up = aro({ op: 'setQty', rowId: 'w_r1', qty: 2 }, P4), upGm = aro({ op: 'setQty', rowId: 'w_r1', qty: 2 }), upRope = aro({ op: 'setQty', rowId: 'w_rope', qty: 3 }, P4);
        check('6 F4a: raising a quantity is a pickup — it answers what it added (the Undo) and, for a player, the item\'s removal rule and name (the GM\'s notice)', up.ok && up.added === 1 && up.note === 'bound' && up.name === 'Cursed ring' && upGm.ok && upGm.added === 1 && !upGm.note && upRope.ok && upRope.added === 2 && !upRope.note, j([up, upGm, upRope]));
        const hidVis = cleanValue(fGear, [{ id: 'w_h1', defId: 'i_sword', qty: 1, hid: 1 }, { defId: 'i_sword', qty: 1 }], vo4);
        const capL = n => { const c = ch4(); c.values.f_gear = []; for (let i = 0; i < n; i++) c.values.f_gear.push({ id: 'w_m' + i, defId: 'i_rope', qty: 1 }); for (let i = 0; i < 5; i++) c.values.f_gear.push({ id: 'w_h' + i, defId: 'i_sword', qty: 1, hid: 1 }); return c; };
        const cap149 = aro({ op: 'add', defId: 'i_boom', rowId: 'w_new' }, P4, capL(149)), cap150 = aro({ op: 'add', defId: 'i_boom', rowId: 'w_new' }, P4, capL(150)), keep155 = cleanValue(fGear, capL(150).values.f_gear, vo4);
        check('6 F4a: a kept curse never blocks a visible row of the same item nor counts against the cap the player sees (visible and kept rows are counted apart)', hidVis.length === 2 && cap149.ok && cap149.value.filter(r => r.hid !== 1).length === 150 && cap150.reason === 'field' && keep155.length === 155, j([hidVis, cap150]));
        const cs = ch4(); cs.values.f_gear.push({ id: 'w_s1', defId: 'i_sword', qty: 2 });
        const cDrop = aro({ op: 'remove', rowId: 'w_s1' }, P4, cs), kRow = cDrop.value ? cDrop.value.find(r => r.hid === 1) : null, kId = kRow ? kRow.id : 'w_x';
        const cs2 = JSON.parse(JSON.stringify(cs)); cs2.values.f_gear = cDrop.value || [];
        const cMiss = aro({ op: 'remove', rowId: kId }, P4, cs2), cOld = aro({ op: 'setQty', rowId: 'w_s1', qty: 1 }, P4, cs2), cAgain = aro({ op: 'add', defId: 'i_sword', rowId: 'w_s2' }, P4, cs2), cDispel = aro({ op: 'remove', rowId: kId }, {}, cs2);
        const cProj = S.charFor(cs2, view4, 'u_p', { items: lib4 }).values.f_gear, cLess = aro({ op: 'setQty', rowId: 'w_s1', qty: 1 }, P4, cs), cKeep = cleanValue(fGear, cs2.values.f_gear, vo4);
        check('6 F4a: curse on contact — a player\'s removal succeeds (its message rides the answer) but the row stays on the character, hidden, under a fresh id; it never reaches the owner, reads as gone to their ops, is never picked up into, survives the cleaner; the GM dispels it; a partial drop is an ordinary change',
            cDrop.ok && cDrop.hid === true && cDrop.msg === 'A chill lingers' && cDrop.name === 'Sword' && !!kRow && kRow.defId === 'i_sword' && kRow.qty === 2 && kRow.id !== 'w_s1' && /^w_[a-z0-9]+$/.test(kRow.id)
            && !cProj.some(r => r.defId === 'i_sword' || r.hid) && cMiss.reason === 'missing' && cOld.reason === 'missing' && cAgain.ok && cAgain.row === 'w_s2' && cAgain.base === 0 && cAgain.value.filter(r => r.defId === 'i_sword').length === 2
            && cDispel.ok && !cDispel.value.some(r => r.defId === 'i_sword') && cLess.ok && !cLess.hid && cLess.value.find(r => r.id === 'w_s1').qty === 1 && cKeep.some(r => r.hid === 1 && r.id === kId), j([cDrop, cAgain]));
        const nAdd = aro({ op: 'add', defId: 'i_chain', rowId: 'w_c9' }, P4), nMerge = aro({ op: 'add', defId: 'i_rope' }, P4), nView = S.applyRowOp(view4, ch4(), 'f_gear', { op: 'add', defId: 'i_chain', rowId: 'w_c9' }, F, P4);
        check('6 F4a: an add answers its row and the quantity before it (the Undo) and its removal rule (the GM\'s notice); a player\'s own copy of the system knows no rule (every item alike)',
            nAdd.ok && nAdd.row === 'w_c9' && nAdd.base === 0 && nAdd.note === 'bound' && nMerge.ok && nMerge.row === 'w_rope' && nMerge.base === 1 && nMerge.qty === 2 && !nMerge.note && nView.ok && nView.row === 'w_c9' && !('note' in nView), j([nAdd, nMerge, nView]));
        const dP = aro({ op: 'add', defId: 'i_boom', rowId: 'w_ring' }, P4), dG = aro({ op: 'add', defId: 'i_boom', rowId: 'w_ring' });
        check('6 F4a: a player\'s new row id is checked against their own view (an id a GM-only item would derive is neither refused nor confirmed); the GM\'s against the whole library', dP.ok && dG.reason === 'value', j([dP, dG]));
        const kGm = aro({ op: 'keep', rowId: 'w_l1' }), kP = aro({ op: 'keep', rowId: 'w_l1' }, P4), kLive = aro({ op: 'keep', rowId: 'w_rope' });
        check('6 F4a: Make custom (keep) turns a deleted item\'s copy into the character\'s own item — the GM\'s only, and only on such a copy', kGm.ok && j(kGm.value[2]) === j({ id: 'w_l1', qty: 1, def: { name: 'Old lamp', category: '', icon: '', notes: '', vis: 'all', area: { ft: 5, shape: 'circle', name: '' }, damage: '1d4' } }) && kP.reason === 'field' && kLive.reason === 'field', j(kGm));
        check('6 F4a: a GM-edit list and a GM-only list refuse a player (field)', S.applyRowOp(R4, ch4(), 'f_gmx', { op: 'add', defId: 'i_rope' }, F, P4).reason === 'field' && S.applyRowOp(R4, ch4(), 'f_gml', { op: 'add', defId: 'i_rope' }, F, P4).reason === 'field');
        const chars4 = { c_1: ch4() }, sysNoRing = Object.assign({}, R4, { items: R4.items.filter(it => it.id !== 'i_ring') }), nOr = S.orphanRows(R4, sysNoRing, chars4);
        check('6 F4a: orphanRows — a row whose entry just left the library keeps a copy of it (the GM view, damage included); rows of entries still there are untouched', nOr === 1 && chars4.c_1.values.f_gear[1].snap.name === 'Cursed ring' && chars4.c_1.values.f_gear[1].snap.damage === '1d6' && !('snap' in chars4.c_1.values.f_gear[0]), j(chars4.c_1.values.f_gear));
        const ci = S.cleanCharItem;
        check('6 F4a: the op message — the keys each op uses, checked by shape (add: an item id and its new row\'s id; every op names a row; undo: how many)', j(ci({ rid: 'r1', charId: 'c_1', fieldId: 'f_gear', op: 'add', defId: 'i_rope', rowId: 'w_x1', qty: 2, junk: 1 })) === j({ rid: 'r1', charId: 'c_1', fieldId: 'f_gear', op: 'add', defId: 'i_rope', rowId: 'w_x1', qty: 2 })
            && ci({ rid: 'r1', charId: 'c_1', fieldId: 'f_gear', op: 'remove' }) === null && ci({ rid: 'r1', charId: 'c_1', fieldId: 'f_gear', op: 'add', defId: 'i_rope' }) === null && j(ci({ rid: 'r1', charId: 'c_1', fieldId: 'f_gear', op: 'undo', rowId: 'w_x1' })) === j({ rid: 'r1', charId: 'c_1', fieldId: 'f_gear', op: 'undo', rowId: 'w_x1', qty: 1 }) && ci({ rid: 'r1', charId: 'c_1', fieldId: 'f_gear', op: 'keep', rowId: 'x' }) === null && j(ci({ rid: 'r1', charId: 'c_1', fieldId: 'f_gear', op: 'setQty', rowId: 'w_rope', qty: 3 })) === j({ rid: 'r1', charId: 'c_1', fieldId: 'f_gear', op: 'setQty', rowId: 'w_rope', qty: 3 }));
        const itLock = S.cleanItemDef({ id: 'i_q', name: 'A\u0007b\u0007c', category: 'x\u0001y', icon: '\uD83D\uDC09\uD83D\uDC09\uD83D\uDC09\uD83D\uDC09\uD83D\uDC09\uD83D\uDC09\uD83D\uDC09\uD83D\uDC09\uD83D\uDC09', rm: 'bound', rmMsg: 'No\u0001 way' }, F, false), itGm = S.cleanItemDef({ id: 'i_q', name: 'A', rm: 'curse', rmMsg: 'x'.repeat(300) }, F, true);
        check('6 F4a: an item cleans every control character, cuts its icon by code points (never half an emoji); its removal rule and message stay on the GM\'s side (neither in the players\' view, nor on an owner\'s inline copy); an unknown rule is dropped; a message a player receives is cleaned as text',
            itLock.name === 'A b c' && itLock.category === 'x y' && Array.from(itLock.icon).length === 8 && !('rm' in itLock) && !('rmMsg' in itLock) && itGm.rm === 'curse' && itGm.rmMsg.length === 200
            && !('rm' in S.cleanItemDef({ id: 'i_q', name: 'A', rm: 'evil' }, F, true)) && !('rm' in S.cleanItemDef({ id: 'i_q', name: 'A', rm: 'constructor' }, F, true)) && S.cleanItemDef({ id: 'i_q', name: 'A', rm: 'bound', rmMsg: 'No\u0001 way' }, F, true).rmMsg === 'No  way'
            && !('rm' in S.cleanRowDef({ name: 'R', rm: 'bound', rmMsg: 'm' }, false)) && S.cleanRowDef({ name: 'R', rm: 'bound', rmMsg: 'm' }, true).rm === 'bound'
            && S.cleanItemMsg(42) === '' && S.cleanItemMsg(' a\u0007b ') === 'a b' && S.cleanItemMsg('y'.repeat(500)).length === 200, j([itLock, itGm]));
        // the host's gate, sliced from net.js and run with the real modules
        const netSrc4 = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
        const i4 = netSrc4.indexOf('// [netcheck:charitem-start]'), k4 = netSrc4.indexOf('// [netcheck:charitem-end]');
        const runI = new Function('SC', 'window', 'conn', 'msg', 'net', 'peerPaused', 'charLimit', '_charSlowSaid', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', '_rowGrace', 'itemNotice', netSrc4.slice(i4, k4) + '\nreturn "ran";');
        const hostI = (msg, o) => { o = o || {}; const camp = o.camp || { id: 'camp1', system: R4, chars: { c_1: ch4(), c_2: { id: 'c_2', name: 'Q', ownerId: 'u_q', npc: false, values: {} } } }; const sent = [], deltas = [], notes = [];
            runI(() => S, { wpFormula: F, wpVtt: { on: () => !o.off }, wpSheets: { playerSystem: () => view4, charChanged() {} } }, { peer: 'pA', send: m => sent.push(m) }, msg, { paused: !!o.paused, roster: { pA: { id: 'u_p' } }, syncCharDelta: (id, d) => deltas.push([id, d]) }, () => false, { allow: () => true }, {}, () => camp, () => {}, () => {}, o.grace || {}, (ch, name, what) => notes.push([ch.name, name, what]));
            return { sent, deltas, camp, notes }; };
        const okI = hostI({ type: 'char-item', rid: 'r1', charId: 'c_1', fieldId: 'f_gear', op: 'add', defId: 'i_boom', rowId: 'w_z1' }), denyOfI = r => (r.sent.find(m => m.type === 'char-deny') || {}).reason;
        check('6 F4a host: a player\'s row op is judged on the players\' view and stored, acked, then synced; another\'s character, a GM-only item, a bound item\'s removal (stays), a GM-edit list, paused and sheets off are each refused; junk is dropped silently (the real handler, sliced from net.js)',
            i4 > 0 && k4 > i4 && okI.sent.some(m => m.type === 'char-ack') && okI.deltas.length === 1 && okI.camp.chars.c_1.values.f_gear.some(r => r.id === 'w_z1')
            && denyOfI(hostI({ type: 'char-item', rid: 'r2', charId: 'c_2', fieldId: 'f_gear', op: 'add', defId: 'i_rope', rowId: 'w_q2' })) === 'owner'
            && denyOfI(hostI({ type: 'char-item', rid: 'r3', charId: 'c_1', fieldId: 'f_gear', op: 'add', defId: 'i_ring', rowId: 'w_z2' })) === 'missing'
            && denyOfI(hostI({ type: 'char-item', rid: 'r4', charId: 'c_1', fieldId: 'f_gear', op: 'remove', rowId: 'w_r1' })) === 'stays'
            && denyOfI(hostI({ type: 'char-item', rid: 'r5', charId: 'c_1', fieldId: 'f_gmx', op: 'add', defId: 'i_rope', rowId: 'w_q5' })) === 'field'
            && hostI({ type: 'char-item', rid: 'r8', charId: 'c_1', fieldId: 'f_gear', op: 'add', defId: 'i_rope' }).sent.length === 0   // an add with no row id never becomes an id-less row
            && denyOfI(hostI({ type: 'char-item', rid: 'r6', charId: 'c_1', fieldId: 'f_gear', op: 'remove', rowId: 'w_rope' }, { paused: true })) === 'paused'
            && denyOfI(hostI({ type: 'char-item', rid: 'r7', charId: 'c_1', fieldId: 'f_gear', op: 'remove', rowId: 'w_rope' }, { off: true })) === 'off'
            && hostI({ type: 'char-item', charId: 'c_1', fieldId: 'f_gear', op: 'remove', rowId: 'w_rope' }).sent.length === 0, j(okI.sent));
        const gr = {}, campS = { id: 'camp1', system: R4, chars: { c_1: ch4() } }, gearS = () => campS.chars.c_1.values.f_gear, H = (m, id) => hostI(Object.assign({ type: 'char-item', rid: id, charId: 'c_1', fieldId: 'f_gear' }, m), { camp: campS, grace: gr });
        const hA = H({ op: 'add', defId: 'i_chain', rowId: 'w_g1' }, 's1'), grA = JSON.parse(JSON.stringify(gr));
        const hU = H({ op: 'undo', rowId: 'w_g1', qty: 1 }, 's2'), afterU = gearS().some(r => r.id === 'w_g1'), grU = gr['c_1|f_gear|w_g1'] ? gr['c_1|f_gear|w_g1'].added : -1;
        H({ op: 'add', defId: 'i_chain', rowId: 'w_g2' }, 's3'); gr['c_1|f_gear|w_g2'].until = Date.now() + 2000;   // late in its window …
        const hA3 = H({ op: 'add', defId: 'i_chain', rowId: 'w_g9' }, 's3b'), grX = JSON.parse(JSON.stringify(gr['c_1|f_gear|w_g2']));   // … a second pickup folds into the same row and extends it
        const hUx = H({ op: 'undo', rowId: 'w_g2', qty: 9 }, 's3c'), afterUx = gearS().some(r => r.id === 'w_g2');
        H({ op: 'add', defId: 'i_chain', rowId: 'w_g3' }, 's3d'); Object.keys(gr).forEach(k => { gr[k].until = 0; });   // the window closes
        const hLate = H({ op: 'remove', rowId: 'w_g3' }, 's4');
        const hPlus = H({ op: 'setQty', rowId: 'w_g3', qty: 2 }, 's4b'), hPlusU = H({ op: 'undo', rowId: 'w_g3', qty: 1 }, 's4c'), qG3 = (gearS().find(r => r.id === 'w_g3') || {}).qty;
        const hR = hostI({ type: 'char-item', rid: 's5', charId: 'c_1', fieldId: 'f_gear', op: 'remove', rowId: 'w_r1' }, { camp: campS, grace: gr });
        gearS().push({ id: 'w_s1', defId: 'i_sword', qty: 1 });
        const hC = hostI({ type: 'char-item', rid: 's6', charId: 'c_1', fieldId: 'f_gear', op: 'remove', rowId: 'w_s1' }, { camp: campS, grace: gr });
        const ackOf = r => r.sent.find(m => m.type === 'char-ack'), denyMsg = r => r.sent.find(m => m.type === 'char-deny');
        check('6 F4a host: a bound pickup can be undone inside its Undo window (by the host\'s own count; a later pickup extends it; + is a pickup too), not after; a bound removal is answered "stays" with the GM\'s message; a curse drop is acked with its message and kept hidden; a plain answer carries no message; the GM alone is told of each (the real handler)',
            !!ackOf(hA) && grA['c_1|f_gear|w_g1'] && grA['c_1|f_gear|w_g1'].added === 1 && grA['c_1|f_gear|w_g1'].until > Date.now() && j(hA.notes) === j([['P', 'Chain', 'bound-pick']])
            && !!ackOf(hU) && !('msg' in ackOf(hU)) && !afterU && grU === 0 && hU.notes.length === 0
            && !!ackOf(hA3) && grX.added === 2 && grX.until > Date.now() + 10000 && !!ackOf(hUx) && !afterUx
            && j(denyMsg(hLate)) === j({ type: 'char-deny', rid: 's4', reason: 'stays', msg: '' }) && gearS().some(r => r.id === 'w_g3') && j(hLate.notes) === j([['P', 'Chain', 'bound-try']])
            && !!ackOf(hPlus) && j(hPlus.notes) === j([['P', 'Chain', 'bound-pick']]) && !!ackOf(hPlusU) && qG3 === 1
            && denyMsg(hR).msg === 'It will not  budge' && j(hR.notes) === j([['P', 'Cursed ring', 'bound-try']])
            && ackOf(hC).msg === 'A chill lingers' && gearS().some(r => r.hid === 1 && r.defId === 'i_sword') && !gearS().some(r => r.id === 'w_s1') && j(hC.notes) === j([['P', 'Sword', 'curse-drop']]) && hC.deltas.length === 1, j([hA.sent, hU.sent, hLate.sent, hR.sent, hC.sent, gr]));
        // the client's pending changes (sliced from net.js): a refusal goes back to the host's LAST copy, the changes still waiting worked out again on it
        const pend = netSrc4.slice(netSrc4.indexOf('// [netcheck:pending-start]'), netSrc4.indexOf('// [netcheck:pending-end]'));
        const mkPend = new Function('getActiveCampaign', 'SC', 'window', 'toast', '_charPending', '_charHost', pend + '\nreturn { charPendingDone: charPendingDone, reapplyPending: reapplyPending, noteHostCopy: noteHostCopy };');
        const campP = { id: 'camp1', system: view4, chars: { c_1: { id: 'c_1', name: 'P', ownerId: 'u_p', npc: false, values: { f_gear: [{ defId: 'i_rope', qty: 1 }] } } } }, pendQ = {}, hostB = {}, seen = [];
        const PF = mkPend(() => campP, () => S, { wpFormula: F, wpSheets: { charChanged() {}, editResult: (rid, ok, reason, msg) => seen.push([rid, ok, reason, msg]) } }, m => seen.push(['toast', m]), pendQ, hostB);
        const cp = campP.chars.c_1, P4v = { player: true, view: view4 }; PF.noteHostCopy('c_1', cp.values);
        const q1 = { op: 'add', defId: 'i_boom', rowId: 'w_p1' }, q2 = { op: 'add', defId: 'i_chain', rowId: 'w_p2' };
        let rq = S.applyRowOp(view4, cp, 'f_gear', q1, F, P4v); cp.values.f_gear = rq.value; pendQ.e1 = { charId: 'c_1', fieldId: 'f_gear', value: rq.value, prev: [{ defId: 'i_rope', qty: 1 }], kind: 'item', q: q1, timer: null };
        rq = S.applyRowOp(view4, cp, 'f_gear', q2, F, P4v); cp.values.f_gear = rq.value; pendQ.e2 = { charId: 'c_1', fieldId: 'f_gear', value: rq.value, prev: null, kind: 'item', q: q2, timer: null };
        cp.values = { f_gear: [{ id: 'w_rope', qty: 1, def: { name: 'Rope', category: 'Gear', icon: '', notes: '', vis: 'all' }, lnk: 1 }] }; PF.noteHostCopy('c_1', cp.values); PF.reapplyPending('c_1');   // a newer copy: Rope is now an inline copy
        const mid = j(cp.values.f_gear.map(r => S.rowIdOf(r)));
        PF.charPendingDone('e1', false, 'missing'); const afterE1 = j(cp.values.f_gear.map(r => S.rowIdOf(r))), inl = cp.values.f_gear[0].lnk === 1;
        PF.charPendingDone('e2', false, 'stays', 'It will not come off'); const afterE2 = j(cp.values.f_gear.map(r => S.rowIdOf(r)));
        pendQ.e3 = { charId: 'c_1', fieldId: 'f_gear', value: cp.values.f_gear, kind: 'item', q: { op: 'remove', rowId: 'w_rope' }, timer: null }; PF.charPendingDone('e3', true, '', 'A chill');
        check('6 F4a client: a refused change goes back to the host\'s LAST copy (never the one it was made on) with the changes still waiting worked out again over it; a bound item\'s message reaches the sheet, a cursed one\'s is shown on the answer (the real code, sliced from net.js)',
            mid === j(['w_rope', 'w_p1', 'w_p2']) && afterE1 === j(['w_rope', 'w_p2']) && inl && afterE2 === j(['w_rope']) && !pendQ.e1 && !pendQ.e2 && !pendQ.e3
            && j(seen) === j([['e1', false, 'missing', undefined], ['e2', false, 'stays', 'It will not come off'], ['toast', 'A chill']]), j([mid, afterE1, afterE2, seen]));
        const campR = { id: 'camp1', system: view4, chars: { c_1: { id: 'c_1', name: 'P', ownerId: 'u_p', npc: false, values: { f_gear: [{ defId: 'i_rope', qty: 1 }], f_x: 3 } } } }, pendR = {}, hostR = {};
        const PR = mkPend(() => campR, () => S, { wpFormula: F, wpSheets: { charChanged() {}, editResult() {} } }, () => {}, pendR, hostR), cr = campR.chars.c_1; PR.noteHostCopy('c_1', cr.values);
        const qm = { op: 'add', defId: 'i_rope', rowId: 'w_m9' }, rmq = S.applyRowOp(view4, cr, 'f_gear', qm, F, P4v); cr.values.f_gear = rmq.value; pendR.m1 = { charId: 'c_1', fieldId: 'f_gear', value: rmq.value, kind: 'item', q: qm, timer: null };
        PR.reapplyPending('c_1'); PR.reapplyPending('c_1'); const q2x = cr.values.f_gear[0].qty;
        pendR.v1 = { charId: 'c_1', fieldId: 'f_x', value: 9, timer: null }; cr.values.f_x = 9; PR.charPendingDone('v1', false, 'slow');
        check('6 F4a client: a pending pickup into a stack is worked out once from the host\'s copy however many copies or refusals arrive (it was applied again each time); a refused value goes back to the host\'s', q2x === 2 && cr.values.f_x === 3 && cr.values.f_gear[0].qty === 2, j(cr.values));
        // gmFacing (sliced from sheets.js): what decides a resend of the owners' inline copies after a system save
        const shG = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), gfS = shG.slice(shG.indexOf('// [systemcheck:gmfacing-start]'), shG.indexOf('// [systemcheck:gmfacing-end]'));
        const gmFacing = new Function('cleanRowDef', gfS + '\nreturn gmFacing;')(S.cleanRowDef), gf0 = gmFacing(R4), gfEdit = fn => { const s = JSON.parse(JSON.stringify(R4)); fn(s); return gmFacing(s); };
        check('6 F4a: gmFacing — a GM-only item\'s name, notes, category or icon changes what its owner holds (a resend); its damage, cost, removal rule or message, and a visible item\'s edit, do not',
            gfS.length > 0 && ['name', 'notes', 'category', 'icon'].every(k => gfEdit(s => { s.items[1][k] = 'Z'; }) !== gf0) && gfEdit(s => { s.items[1].damage = '9d6'; s.items[1].cost = '1'; s.items[1].rm = 'curse'; s.items[1].rmMsg = 'x'; }) === gf0 && gfEdit(s => { s.items[0].name = 'Cord'; }) === gf0);
        const stC = { c_1: { id: 'c_1', values: { f_gear: [{ defId: 'i_rope', qty: 1 }, { defId: 'i_ring', qty: 1 }, { id: 'w_k', defId: 'i_ring', qty: 1 }, { defId: 'i_gone', qty: 1, snap: { name: 'Old', vis: 'gm' } }, { defId: 'i_gone2', qty: 1, snap: { name: 'Old2', vis: 'all' } }] } } };
        const nSt = S.stampRows(R4, stC), stR = stC.c_1.values.f_gear;
        check('6 F4a: stampRows gives a legacy row of a GM-only item (or of a deleted GM-only item\'s copy) its own id, so its owner never sees the item\'s library id; visible and keyed rows are untouched', nSt === 2 && !('id' in stR[0]) && /^w_/.test(stR[1].id) && stR[1].id !== 'w_ring' && stR[2].id === 'w_k' && /^w_/.test(stR[3].id) && !('id' in stR[4]), j(stR));
        const mainSrc4 = fs.readFileSync(path.join(app, 'scripts', 'main.js'), 'utf8');
        check('6 F4a: a merge import keeps copies of items the new system drops (orphanRows before the swap) and keys legacy GM-only rows (stampRows)', /window\.wpSystemCore\.orphanRows\(existing\.system, isys, existing\.chars\);[^\n]*\n\s*existing\.system = isys;/.test(mainSrc4) && /window\.wpSystemCore\.stampRows\(existing\.system, existing\.chars\)/.test(mainSrc4));
        const sh4 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8');
        check('6 F4a UI: rows drawn through rowDef and addressed by row id; controls inert in the preview and a pop-out; a lost copy marked with Make custom for the GM; the editor\'s removal rule and message; the GM throws a GM-only item; every item has the same controls on a player\'s sheet; a pickup opens its Undo; a save keeps copies of deleted items, keys legacy GM-only rows and resends GM-only inline copies',
            /editable = editable && _fxLive; canThrow = canThrow && _fxLive;/.test(sh4) && /var rd = rowDef\(sysI, entry\), def = rd \? rd\.def : null; if \(!def\) return;/.test(sh4) && /commitItem\(c, f, \{ op: 'keep', rowId: rowIdOf\(entry\) \}\)/.test(sh4)
            && /select\('sys-item-rmmode'/.test(sh4) && /input\('sys-item-rmtext field'/.test(sh4) && (sh4.match(/def\.area && canThrow && \(gm \|\| def\.vis !== 'gm'\) && entry\.hid !== 1/g) || []).length === 2 && /stampRows\(clean, camp\.chars \|\| \{\}\)/.test(sh4) && !/canRm/.test(sh4) && /if \(r && r\.error\) toast\(r\.error\); else undoFollow\(r\);/.test(sh4) && /if \(ownerSeesSame\(camp, sys, prev, res\.value\)\) d = \{\};/.test(sh4) && /commitItem\(c, f, \{ op: 'undo', rowId: rid, qty: n \}\)/.test(sh4) && /orphaned = orphanRows\(prevSys, clean, camp\.chars \|\| \{\}\)/.test(sh4) && /gmFacing\(prevSys\) !== gmFacing\(clean\)\) n\.syncChars\(\);/.test(sh4) && !/commitItem\(c, f, '/.test(sh4));
    }

    /* ---- Stage 6 F4b: row facts (level, switch, note), list options, the equip lock, the Lists tab ---- */
    {
        const LS = S.cleanListSpec, C7 = String.fromCharCode(7);
        const sp1 = LS({ lvl: { label: 'Rank', min: 1, labels: ['I', 'II', 'III', 'IV'], def: 9 }, on: { label: 'Active', def: true }, cats: ['Force', 'force', ' Force Power ', '', 'x'.repeat(50)].concat(Array.from({ length: 30 }, (_, i) => 'C' + i)), multi: true, noQty: 1 }, true);
        check('F4b cleanListSpec: value names count from the level\'s minimum (min 1: max 4, step 1, the default clamped to 4); categories cut to 40, once each ignoring case, at most 20; the same item more than once and no quantity only when true; the switch keeps its label, "starts on" only when true',
            j(sp1.lvl) === j({ label: 'Rank', min: 1, max: 4, step: 1, def: 4, labels: ['I', 'II', 'III', 'IV'] }) && j(sp1.on) === j({ label: 'Active', def: true }) && sp1.multi === true && !('noQty' in sp1)
            && sp1.cats.length === 20 && sp1.cats[0] === 'Force' && sp1.cats[1] === 'Force Power' && sp1.cats[2] === 'x'.repeat(40) && sp1.cats[3] === 'C0', j(sp1));
        const sp2 = LS({ lvl: { min: '3', max: 1, step: -2, def: '2.3' }, on: {} }, true), sp3 = LS({ lvl: { max: 5e6, step: 0.5, def: 1.3 } }, true), sp4 = LS({ lvl: { labels: ['Native', 'Broken', 'Fluent'], min: -1.6, def: 'x' } }, true);
        check('F4b cleanListSpec: the editor\'s boxes give strings or numbers; a max below the min is the min; a step of zero or less is 1; a bound past 1e6 is left open; names without a min count from 0 (a fractional min rounds); defaults "Level" / "On" and a default level from the min (else 0); nothing set = null; an empty categories list only in the players\' view (nothing to pick); what the Lists tab\'s ticks make cleans to itself',
            j(sp2) === j({ lvl: { label: 'Level', min: 3, max: 3, step: 1, def: 3 }, on: { label: 'On' } }) && j(sp3) === j({ lvl: { label: 'Level', step: 0.5, def: 1.5 } }) && j(sp4.lvl) === j({ label: 'Level', min: -2, max: 0, step: 1, def: -2, labels: ['Native', 'Broken', 'Fluent'] })
            && LS({}, true) === null && LS(null, true) === null && LS({ cats: [] }, true) === null && j(LS({ cats: [] }, false)) === j({ cats: [] }) && LS({ multi: 'yes', noQty: 1, lvl: 3, on: true }, true) === null
            && j(LS({ lvl: { label: 'Level', min: 0, step: 1, def: 0 }, on: { label: 'On' } }, true)) === j({ lvl: { label: 'Level', min: 0, step: 1, def: 0 }, on: { label: 'On' } }), j([sp2, sp3, sp4]));
        const itK = k => { const c = S.cleanItemDef({ id: 'i_k', name: 'K', key: k }, F, true); return c ? (c.key || '') : null; };
        check('F4b an item\'s key: a letter, then letters, digits and _ (40 at most); never a row word, a reserved suffix, a function name or an Object.prototype name (the wire\'s packer refuses those); only one a formula can address (L.<key>.lvl)',
            itK('Karate') === 'Karate' && itK('Blaster_2') === 'Blaster_2' && itK('a'.repeat(40)) === 'a'.repeat(40) && itK('a'.repeat(41)) === ''
            && ['qty', 'On', 'lvl', 'row', 'has', 'paid', 'count', 'max', 'cur', 'ranks', 'floor', 'if', 'constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf', '2x', 'a b', 'a.b', '_a', '', 7, null].every(k => itK(k) === '')
            && S.cleanItemKey('Karate') === 'Karate' && S.cleanItemKey('toString') === '' && S.cleanItemKey('Karate', F) === 'Karate', j(['qty', 'constructor', '_a'].map(itK)));
        const itG = S.cleanItemDef({ id: 'i_r', name: 'Ring', eq: 'bound', eqMsg: ' It will' + C7 + ' not ', lvl: '12', rm: 'curse' }, F, true), itP = S.cleanItemDef({ id: 'i_r', name: 'Ring', eq: 'bound', eqMsg: 'x', lvl: 12 }, F, false), itX = S.cleanItemDef({ id: 'i_r', name: 'Ring', eq: 'stuck', eqMsg: 'x', lvl: 2e6 }, F, true);
        check('F4b an item\'s equip lock (bound / curse on contact) and its message are the GM\'s alone (never in the players\' view; anything else is no lock); its default level is a number within 1e6',
            itG.eq === 'bound' && itG.eqMsg === 'It will  not' && itG.lvl === 12 && itG.rm === 'curse' && !('eq' in itP) && !('eqMsg' in itP) && itP.lvl === 12 && !('eq' in itX) && !('eqMsg' in itX) && !('lvl' in itX), j([itG, itP, itX]));
        const rdG = S.cleanRowDef({ name: 'Veil', vis: 'gm', key: 'Veil', lvl: 3, eq: 'curse', eqMsg: 'Clings' }, true), rdP = S.cleanRowDef({ name: 'Veil', vis: 'gm', key: 'Veil', lvl: 3, eq: 'curse' }, false), rdV = S.cleanRowDef({ name: 'Blade', vis: 'all', key: 'Blade', eq: 'bound' }, false);
        check('F4b a carried copy keeps its key (a GM-only one\'s in the GM\'s view only: critic 2), its default level, and its equip lock in the GM\'s view only',
            rdG.key === 'Veil' && rdG.lvl === 3 && rdG.eq === 'curse' && rdG.eqMsg === 'Clings' && !('key' in rdP) && rdP.lvl === 3 && !('eq' in rdP) && rdV.key === 'Blade' && !('eq' in rdV), j([rdG, rdP, rdV]));

        const sysB = cleanSystem({ v: 1, name: 'B', rolls: [], fields: [
            { id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', edit: 'owner', vis: 'all', list: { cats: ['Skill', 'Lore'], noQty: true, lvl: { label: 'Level', min: 0, max: 20, def: 10 } } },
            { id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, on: { label: 'Readied' }, cats: ['Gear', 'Jewel'] } },
            { id: 'f_ar', key: 'Arcana', label: 'Arcana', kind: 'item-list', edit: 'owner', vis: 'all', list: { cats: ['Secret'] } },
            { id: 'f_gm', key: 'Locked', label: 'Locked', kind: 'item-list', edit: 'gm', vis: 'all', list: { on: { label: 'On' } } },
            { id: 'f_wn', key: 'Worn', label: 'Worn', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Worn', def: true } } },
            { id: 'f_pl', key: 'Plain', label: 'Plain', kind: 'item-list', edit: 'owner', vis: 'all' }],
            items: [
            { id: 'i_karate', name: 'Karate', category: 'Skill', key: 'Karate', lvl: 12 }, { id: 'i_sneak', name: 'Sneak', category: 'skill' },
            { id: 'i_veil', name: 'Veil', category: 'Secret', vis: 'gm', eq: 'curse', eqMsg: 'It clings' }, { id: 'i_ring', name: 'Ring', category: 'Jewel', eq: 'bound', eqMsg: 'It will not come off' },
            { id: 'i_amu', name: 'Amulet', category: 'Jewel', eq: 'curse', eqMsg: 'It clings' }, { id: 'i_blade', name: 'Blade', category: 'Gear' }],
            sheet: { sections: [{ id: 's_a', title: 'A', cols: 1, fields: [{ id: 'f_wp', w: 'row', on: true }, { id: 'f_sk', w: 1, on: true }, { id: 'f_pl', w: 1, on: 'yes' }] }] } }, { F, gmView: true });
        const pvB = cleanSystem(sysB, { F, gmView: false }), fB = id => sysB.fields.find(f => f.id === id), lib = {}; sysB.items.forEach(i => { lib[i.id] = i; });
        check('F4b the players\' view: a list\'s categories are only those an item they can see has (Skills keeps Skill; Arcana\'s Secret goes: an empty list, nothing to pick); no equip lock reaches it; the view is a fixed point, as the GM\'s is',
            j(pvB.fields.map(f => f.list ? (f.list.cats || null) : null)) === j([['Skill'], ['Gear', 'Jewel'], [], null, null, null]) && !/"eq/.test(j(pvB)) && !/clings|come off/.test(j(pvB))
            && j(cleanSystem(pvB, { F, gmView: false })) === j(pvB) && j(cleanSystem(sysB, { F, gmView: true })) === j(sysB), j(pvB.fields.map(f => f.list)));
        check('F4b a placement of an item list keeps "only rows switched on" (on: true, nothing else); the validator warns when its list has no switch (every row shows)',
            j(sysB.sheet.sections[0].fields) === j([{ id: 'f_wp', w: 'row', on: true }, { id: 'f_sk', w: 1, on: true }, { id: 'f_pl', w: 1 }]) && j(cleanSystem({ v: 1, name: 'X', rolls: [], fields: [{ id: 'f_n', key: 'N', kind: 'number' }], sheet: { sections: [{ id: 's_b', title: 'B', cols: 1, fields: [{ id: 'f_n', w: 1, on: true }] }] } }, { F, gmView: true }).sheet.sections[0].fields) === j([{ id: 'f_n', w: 1 }])
            && validateSystem(sysB, F).warnings.filter(w => /only rows switched on/.test(w.message)).map(w => w.id).join() === 'f_sk', j(validateSystem(sysB, F).warnings));
        const sysK = cleanSystem({ v: 1, name: 'K', rolls: [], fields: [{ id: 'f_s', key: 'Skills', label: 'Skills', kind: 'item-list', list: { cats: ['Skill'] } }, { id: 'f_w', key: 'Weapons', label: 'Weapons', kind: 'item-list', list: { cats: ['Gear'] } }],
            items: [{ id: 'i_a', name: 'Karate', category: 'Skill', key: 'Karate' }, { id: 'i_b', name: 'Sneak', category: 'skill', key: 'karate' }, { id: 'i_c', name: 'Blade', category: 'Gear', key: 'Karate' }] }, { F, gmView: true });
        const vK = validateSystem(sysK, F);
        check('F4b the validator: an item\'s key is once inside each list it can be on, ignoring case (Sneak repeats Karate in Skills); a key repeated across lists that never share an item is fine (the Blade in Weapons)',
            j(vK.errors.map(e => [e.id, e.prop, e.message])) === j([['i_b', 'key', 'Key "karate" is also used by "Karate" in Skills.']]), j(vK.errors));
        const fW = fB('f_sk'), vo = S.valueOpts(sysB);
        const cv = S.cleanValue(fW, [{ id: 'w_1', defId: 'i_karate', qty: 3, lvl: 99, on: 'yes', note: 'n', keptOn: 1 }, { defId: 'i_sneak', qty: 1, lvl: '4', on: true, keptOn: 1 }, { id: 'w_c', qty: 1, lvl: -5, on: false, note: 'x'.repeat(300), keptOn: 1, def: { name: 'Mine' } }, { id: 'w_i', qty: 1, on: true, keptOn: 1, def: { name: 'In' }, lnk: 1 }], vo);
        const cvPlain = S.cleanValue(fB('f_pl'), [{ id: 'w_1', defId: 'i_karate', qty: 3, lvl: 99.5 }, { defId: 'i_sneak', qty: 2 }], vo);
        const dM = S.cleanRowDef({ name: 'Mine' }, true), dI = S.cleanRowDef({ name: 'In' }, false);
        check('F4b row facts, after the quantity: a level clamped to the list (99 to 20, -5 to 0), a string level dropped; the switch only as a boolean; a note cut to 200; keptOn only beside on: true, never on an owner\'s inline copy; a list with no level keeps a level as stored; a legacy row stays as it was',
            j(cv) === j([{ id: 'w_1', defId: 'i_karate', qty: 3, lvl: 20, note: 'n' }, { defId: 'i_sneak', qty: 1, on: true, keptOn: 1 }, { id: 'w_c', qty: 1, lvl: 0, on: false, note: 'x'.repeat(200), def: dM }, { id: 'w_i', qty: 1, on: true, def: dI, lnk: 1 }])
            && j(cvPlain) === j([{ id: 'w_1', defId: 'i_karate', qty: 3, lvl: 99.5 }, { defId: 'i_sneak', qty: 2 }]), j([cv, cvPlain]));
        const swD = { on: { label: 'x', def: true } };
        check('F4b rowOn / rowLvl: a switch as stored, else the list\'s "starts on" (an id-less legacy row follows it: critic 13); a level as stored, else the item\'s own (clamped), else the list\'s default, else 0',
            S.rowOn(swD, { defId: 'i_x', qty: 1 }) === true && S.rowOn(swD, { defId: 'i_x', qty: 1, on: false }) === false && S.rowOn({ on: { label: 'x' } }, { defId: 'i_x' }) === false && S.rowOn(null, {}) === false
            && S.rowLvl(fW.list, { defId: 'i_karate' }, lib.i_karate) === 12 && S.rowLvl(fW.list, { defId: 'i_karate' }, { lvl: 50 }) === 20 && S.rowLvl(fW.list, { defId: 'i_sneak' }, lib.i_sneak) === 10 && S.rowLvl(fW.list, { lvl: 3 }, lib.i_karate) === 3 && S.rowLvl(null, {}, {}) === 0 && S.rowLvl(null, { lvl: 7 }, {}) === 7);

        let chB = { id: 'c_a', name: 'A', ownerId: 'u_a', npc: false, values: {} };
        const op = (fid, q, o) => { const r = S.applyRowOp(sysB, chB, fid, q, F, o || {}); if (r.ok) chB.values[fid] = r.value; return r; }, P = { player: true, view: pvB };
        const a1 = op('f_sk', { op: 'add', defId: 'i_karate', rowId: 'w_k1' }, P), a2 = op('f_sk', { op: 'add', defId: 'i_karate', rowId: 'w_k2' }, P), a3 = op('f_sk', { op: 'add', defId: 'i_sneak', rowId: 'w_s1', qty: 5 }, P);
        const a4 = op('f_sk', { op: 'add', defId: 'i_ring', rowId: 'w_x' }, P), a5 = op('f_ar', { op: 'add', defId: 'i_veil', rowId: 'w_v' }, P), a6 = op('f_sk', { op: 'add', defId: 'i_ring', rowId: 'w_g' }, {});
        check('F4b add: the facts are written as a row is added (the item\'s own level, Karate 12; else the list\'s default, Sneak 10); no quantity: once each ("value") and quantity 1; a player adds only from the list\'s categories (the Ring on Skills and a GM-only Veil read as gone: "missing"); the GM may add outside them',
            a1.ok && a3.ok && j(chB.values.f_sk.slice(0, 2)) === j([{ id: 'w_k1', defId: 'i_karate', qty: 1, lvl: 12 }, { id: 'w_s1', defId: 'i_sneak', qty: 1, lvl: 10 }]) && a2.reason === 'value' && a4.reason === 'missing' && a5.reason === 'missing' && a6.ok && chB.values.f_sk.length === 3, j([a1, a2, a4, a5, a6, chB.values.f_sk]));
        const s1 = op('f_sk', { op: 'set', rowId: 'w_k1', facts: { lvl: 30 } }, P), s2 = op('f_sk', { op: 'set', rowId: 'w_s1', facts: { lvl: null, note: ' tall' + C7 + 'order ' } }, P), s3 = op('f_sk', { op: 'set', rowId: 'w_k1', facts: { on: true } }, P);
        const s4 = op('f_sk', { op: 'set', rowId: 'w_k1', facts: { lvl: 5, on: true } }, P), s5 = op('f_sk', { op: 'set', rowId: 'w_zz', facts: { lvl: 5 } }, P), s6 = op('f_gm', { op: 'set', rowId: 'w_k1', facts: { on: true } }, P), s7 = op('f_sk', { op: 'set', rowId: 'w_k1', facts: {} }, P), s8 = op('f_sk', { op: 'set', rowId: 'w_k1' }, P);
        check('F4b set: a level clamped to the list (30 to 20), null back to the default, a note cut and cleaned; on a list with no switch a switch is refused ("value") and the whole change with it (the level stays 20); an unknown row is "missing"; a list the GM edits is the GM\'s ("field"); no facts is "value"',
            s1.ok && s2.ok && s1.row === 'w_k1' && s1.qty === 1 && chB.values.f_sk[0].lvl === 20 && !('lvl' in chB.values.f_sk[1]) && chB.values.f_sk[1].note === 'tall order' && s3.reason === 'value' && s4.reason === 'value' && chB.values.f_sk[0].lvl === 20
            && s5.reason === 'missing' && s6.reason === 'field' && s7.reason === 'value' && s8.reason === 'value' && S.rowLvl(fW.list, chB.values.f_sk[1], lib.i_sneak) === 10, j([s1, s3, s4, s5, s6, s7, chB.values.f_sk]));
        const w1 = op('f_wp', { op: 'add', defId: 'i_ring', rowId: 'w_r1' }, P), w2 = op('f_wp', { op: 'add', defId: 'i_ring', rowId: 'w_r2' }, P);
        const e1 = op('f_wp', { op: 'set', rowId: 'w_r1', facts: { on: true } }, P), e2 = op('f_wp', { op: 'set', rowId: 'w_r1', facts: { on: false } }, P), e3 = op('f_wp', { op: 'set', rowId: 'w_r1', facts: { on: false } }, Object.assign({ onGrace: true }, P));
        const e4 = op('f_wp', { op: 'set', rowId: 'w_r2', facts: { on: false } }, P), e5 = op('f_wp', { op: 'set', rowId: 'w_r1', facts: { on: false } }, {});
        check('F4b the equip lock, bound: the same item again makes a second row (the list takes it more than once); switching it on answers the row (the grace, the GM\'s notice); switching it off is refused with the GM\'s message ("stays", eq) unless within the grace; an item already off stays off; the GM switches it as they like',
            w1.ok && w2.ok && w2.row === 'w_r2' && chB.values.f_wp.length === 2 && e1.ok && e1.onRow === 'w_r1' && e1.eqNote === 'bound' && e1.name === 'Ring' && j([e2.ok, e2.reason, e2.msg, e2.name, e2.eq]) === j([false, 'stays', 'It will not come off', 'Ring', true])
            && e3.ok && !e3.onRow && chB.values.f_wp[0].on === false && e4.ok && chB.values.f_wp[1].on === false && e5.ok, j([e1, e2, e3, e4, chB.values.f_wp]));
        const c1 = op('f_wp', { op: 'add', defId: 'i_amu', rowId: 'w_a1' }, P), c2 = op('f_wp', { op: 'set', rowId: 'w_a1', facts: { on: true } }, P), c3 = op('f_wp', { op: 'set', rowId: 'w_a1', facts: { on: false } }, P);
        const amu = () => chB.values.f_wp.find(r => r.id === 'w_a1'), projA = () => S.projectRows(chB.values.f_wp, pvB, lib).find(r => r.id === 'w_a1'), viewA = () => S.charFor(chB, pvB, 'u_a', { items: lib }).values.f_wp.find(r => r.id === 'w_a1');
        const kept = j(amu()), keptProj = j(projA()), keptView = j(viewA());
        const c4 = op('f_wp', { op: 'set', rowId: 'w_a1', facts: { on: false } }, P), again = j(amu());
        const c5 = op('f_wp', { op: 'set', rowId: 'w_a1', facts: { on: true } }, P), cleared = j(amu());
        op('f_wp', { op: 'set', rowId: 'w_a1', facts: { on: false } }, P); const c6 = op('f_wp', { op: 'set', rowId: 'w_a1', facts: { on: false } }, {}), gmOff = j(amu());
        check('F4b the equip lock, curse on contact: switched off by its owner it stays on here (keptOn) with the GM\'s message; the owner\'s copy (projectRows, charFor) says off with no keptOn; off again: nothing changes; switched on by the owner, keptOn goes (no new notice); the GM switching it off clears it',
            c1.ok && !c1.onRow && c2.eqNote === 'curse' && c3.ok && c3.keptOn === true && c3.msg === 'It clings' && c3.name === 'Amulet' && kept === j({ id: 'w_a1', defId: 'i_amu', qty: 1, on: true, keptOn: 1 }) && keptProj === j({ id: 'w_a1', defId: 'i_amu', qty: 1, on: false }) && keptView === keptProj
            && c4.ok && again === kept && !c4.keptOn && c5.ok && !c5.eqNote && cleared === j({ id: 'w_a1', defId: 'i_amu', qty: 1, on: true }) && c6.ok && gmOff === j({ id: 'w_a1', defId: 'i_amu', qty: 1, on: false }), j([c3, kept, keptProj, c5, cleared, gmOff]));
        const wn = op('f_wn', { op: 'add', defId: 'i_ring', rowId: 'w_n1' }, P);
        op('f_wp', { op: 'add', defId: 'i_veil', rowId: 'w_v1' }, {}); op('f_wp', { op: 'set', rowId: 'w_v1', facts: { on: true, note: 'veiled' } }, {});
        const v1 = op('f_wp', { op: 'set', rowId: 'w_v1', facts: { on: false } }, P), inl = S.projectRows(chB.values.f_wp, pvB, lib).find(r => r.id === 'w_v1'), pF = pvB.fields.find(f => f.id === 'f_wp');
        const projAll = S.projectRows(chB.values.f_wp, pvB, lib);
        check('F4b a row picked up already on (a list whose switch starts on) opens the grace like a switch; a GM-only item carried reaches its owner inline with its facts (the note; the switch as they see it) and its lock is judged on the host\'s entry; the owner\'s re-clean of the whole list is a fixed point',
            wn.ok && wn.onRow === 'w_n1' && wn.eqNote === 'bound' && j(chB.values.f_wn) === j([{ id: 'w_n1', defId: 'i_ring', qty: 1, on: true }]) && v1.ok && v1.keptOn === true
            && j(inl) === j({ id: 'w_v1', qty: 1, on: false, note: 'veiled', def: S.cleanRowDef(lib.i_veil, false), lnk: 1 }) && !/It clings|"eq"|keptOn/.test(j(projAll)) && j(S.cleanValue(pF, projAll, S.valueOpts(pvB))) === j(projAll), j([wn, v1, inl]));
        chB.values.f_wp = chB.values.f_wp.concat([{ id: 'w_l', defId: 'i_gone', qty: 2, on: true, note: 'old', snap: { name: 'Gone', vis: 'all' } }]);
        const k1 = op('f_wp', { op: 'keep', rowId: 'w_l' }, {});
        check('F4b "Make custom" keeps the row\'s facts (the switch, the note) on the character\'s own item', k1.ok && j(chB.values.f_wp.find(r => r.id === 'w_l')) === j({ id: 'w_l', qty: 2, on: true, note: 'old', def: S.cleanRowDef({ name: 'Gone', vis: 'all' }, true) }), j(chB.values.f_wp));
        const cc = facts => S.cleanCharItem({ type: 'char-item', rid: 'r1', charId: 'c_a', fieldId: 'f_wp', op: 'set', rowId: 'w_a1', facts });
        check('F4b cleanCharItem set: a level (a number, or null), a switch (a boolean), a note (cut to 200); any other key in facts is dropped; a string level, a non-boolean switch, a note past 800, a level past 1e6, no facts or no row refuse the message',
            j(cc({ lvl: null, on: true, note: ' x ', y: 1 }).facts) === j({ lvl: null, on: true, note: 'x' }) && j(cc({ lvl: 3.5 }).facts) === j({ lvl: 3.5 }) && cc({ lvl: '3' }) === null && cc({ on: 1 }) === null && cc({ note: 'x'.repeat(801) }) === null
            && cc({}) === null && cc(null) === null && cc({ lvl: 2e6 }) === null && S.cleanCharItem({ type: 'char-item', rid: 'r1', charId: 'c_a', fieldId: 'f_wp', op: 'set', facts: { on: true } }) === null && cc({ note: 'y'.repeat(300) }).facts.note.length === 200);

        // the sheet: the real item widgets (sliced from sheets.js) on a fake DOM
        const shB = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const cut = (a, b) => { const i = shB.indexOf(a), k = shB.indexOf(b, i + 1); if (i < 0 || k < 0) throw new Error('F4b slice: ' + a); return shB.slice(i, k); };
        const itSrc = cut('// ---- item-list widgets', '// 5h: an effect\'s changes as short text'), fxSrcB = cut('function fxMark(', '// 5h: a character\'s status effects'), fnSrcB = cut('function signTone(', '// A roll from a sheet button:');
        const fe = (tag, cls, text) => ({ tag, className: cls || '', textContent: text === undefined || text === null ? '' : String(text), children: [], title: '', type: '', value: '', checked: false, disabled: false, selected: false, dataset: {}, style: {}, classList: { add() {} }, on: {}, get childNodes() { return this.children; }, appendChild(x) { this.children.push(x); return x; }, insertBefore(x) { this.children.unshift(x); return x; }, addEventListener(k, f) { this.on[k] = f; } });
        const commits = [], optF = (v, t, s) => { const o = fe('option', null, t); o.value = v; if (s) o.selected = true; return o; }, docF = { createTextNode: t => ({ tag: '#text', textContent: t, children: [] }) };
        const deps = ['el', 'iconNode', 'rowDef', 'rowIdOf', 'rowLvl', 'rowOn', 'commitItem', 'opt', 'fmtNum', 'iconText', 'LIMITS', '_fxLive', 'document', 'renderViews', 'closeHud', 'closeSheet', 'window', 'systemOf', 'getActiveCampaign', 'facingTarget', 'uid', 'F', 'fxText', 'canRoll', 'sheetRoll', 'commit', 'valueTone', 'TONE_CLASS'];
        const depV = [fe, (v, cls) => fe('span', cls, v), S.rowDef, S.rowIdOf, S.rowLvl, S.rowOn, (c, f, q) => commits.push([f.id, q]), optF, S.fmtNum, v => v || '', S.LIMITS, true, docF, () => {}, () => {}, () => {}, {}, () => sysB, () => null, () => null, p => p + 'new', () => F, S.fxText, () => true, () => {}, () => {}, S.valueTone, {}];
        const W = new Function(...deps, itSrc + '\nreturn { itemListInto: itemListInto, itemTableInto: itemTableInto, pickerInto: pickerInto, gmItemBits: gmItemBits };')(...depV);
        const FN = new Function(...deps, itSrc + fxSrcB + fnSrcB + '\nreturn fieldNode;')(...depV);
        const kids = n => (n.children || []), cl = n => kids(n).map(k => String(k.className).split(' ').pop()), walk = (n, p, acc) => { if (p(n)) acc.push(n); kids(n).forEach(k => walk(k, p, acc)); return acc; }, find = (n, c) => walk(n, x => (' ' + x.className + ' ').indexOf(' ' + c + ' ') >= 0, []);
        const chS = { id: 'c_a', name: 'A', ownerId: 'u_a', values: { f_sk: [{ id: 'w_k1', defId: 'i_karate', qty: 1, lvl: 20 }, { id: 'w_s1', defId: 'i_sneak', qty: 1 }] } };
        const plainW = fe('div'); W.itemListInto(plainW, fB('f_pl'), chS, [{ id: 'w_1', defId: 'i_blade', qty: 2 }], sysB, false, true, true);
        const listW = fe('div'); W.itemListInto(listW, fW, chS, chS.values.f_sk, sysB, false, true, false);
        const l1 = listW.children[0], lvIn = find(l1, 'sheet-item-lvlin')[0], note1 = listW.children[1], tog = find(l1, 'sheet-item-notes-t')[0], noteIn = find(note1, 'sheet-item-note')[0];
        check('F4b the sheet: a list with no options draws its rows as before (name, the qty −/+, remove); a list with options draws no category chip while its rows share one (Skill and skill), a level box (the list\'s range and step), 📝 and remove, no quantity with No quantity, and the row\'s note line under it, closed',
            j(cl(plainW.children[0])) === j(['sheet-item-name', 'sheet-item-qty', 'sheet-item-rm']) && plainW.children.length === 1
            && j(cl(l1)) === j(['sheet-item-name', 'sheet-item-lvl', 'sheet-item-notes-t', 'sheet-item-rm']) && listW.children.length === 4 && note1.className === 'sheet-item-noteline' && note1.style.display === 'none'
            && lvIn.value === '20' && lvIn.min === '0' && lvIn.max === '20' && lvIn.step === '1' && find(listW.children[2], 'sheet-item-lvlin')[0].value === '10', j([cl(plainW.children[0]), cl(l1), cl(listW)]));
        commits.length = 0; lvIn.value = '7'; lvIn.on.change(); lvIn.value = ''; lvIn.on.change(); const resetTo = lvIn.value; noteIn.value = 'hi'; noteIn.on.change(); tog.on.click(); const opened = note1.style.display;
        check('F4b the sheet: the level box sends one set op per change (an empty box sends nothing and shows the level again); the note sends its text; 📝 opens the note line (kept open across a redraw)',
            j(commits) === j([['f_sk', { op: 'set', rowId: 'w_k1', facts: { lvl: 7 } }], ['f_sk', { op: 'set', rowId: 'w_k1', facts: { note: 'hi' } }]]) && resetTo === '20' && opened === ''
            && (() => { const again = fe('div'); W.itemListInto(again, fW, chS, chS.values.f_sk, sysB, false, true, false); return again.children[1].style.display === ''; })(), j(commits));
        const nmL = { id: 'f_lg', key: 'Langs', label: 'Langs', kind: 'item-list', list: S.cleanListSpec({ lvl: { label: 'Fluency', min: 1, labels: ['Broken', 'Accented', 'Fluent'] }, on: { label: 'Compr.', def: true } }, true), edit: 'owner', vis: 'all' };
        const lgW = fe('div'); W.itemListInto(lgW, nmL, chS, [{ id: 'w_g1', defId: 'i_sneak', qty: 1, lvl: 2 }, { id: 'w_g2', defId: 'i_blade', qty: 1, lvl: 7, on: false }], sysB, false, true, false);
        const sel1 = find(lgW.children[0], 'sheet-item-lvlsel')[0], sel2 = find(lgW.children[2], 'sheet-item-lvlsel')[0], cb1 = find(lgW.children[0], 'sheet-item-on')[0], cb2 = find(lgW.children[2], 'sheet-item-on')[0], onl = find(lgW.children[0], 'sheet-item-onl')[0];
        commits.length = 0; sel1.value = '3'; sel1.on.change(); cb1.checked = false; cb1.on.change();
        const roW = fe('div'); W.itemListInto(roW, nmL, chS, [{ id: 'w_g1', defId: 'i_sneak', qty: 1, lvl: 2 }, { id: 'w_g2', defId: 'i_blade', qty: 1, on: false }], sysB, false, false, false);
        check('F4b the sheet: level names make a dropdown counted from the minimum (1 Broken, 2 Accented, 3 Fluent), a stored level past them an extra greyed entry; the switch is a checkbox with the list\'s label, on by the list\'s "starts on"; each sends a set op. Read-only: the level\'s name and, while on, a chip with the label; no quantity boxes',
            j(kids(sel1).map(o => [o.value, o.textContent, !!o.selected, !!o.disabled])) === j([['1', 'Broken', false, false], ['2', 'Accented', true, false], ['3', 'Fluent', false, false]]) && j(kids(sel2).map(o => [o.value, !!o.selected, !!o.disabled]).slice(3)) === j([['7', true, true]])
            && cb1.checked === false && cb2.checked === false && find(lgW.children[2], 'sheet-item-on')[0].title === 'Compr.' && kids(onl)[1].textContent === 'Compr.' && j(commits) === j([['f_lg', { op: 'set', rowId: 'w_g1', facts: { lvl: 3 } }], ['f_lg', { op: 'set', rowId: 'w_g1', facts: { on: false } }]])
            && find(roW.children[0], 'sheet-item-lvln')[0].textContent === 'Accented' && find(roW.children[0], 'sheet-item-onc')[0].textContent === 'Compr.' && find(roW, 'sheet-item-onc').length === 1 && find(roW, 'sheet-item-qtyn').length === 2 && find(roW, 'sheet-item-note').length === 0, j([kids(sel1).map(o => o.value), commits]));
        const gmB = (def, entry, sw) => { const h = fe('span'); W.gmItemBits(h, def, entry, true, sw); return kids(h).map(k => k.textContent); };
        check('F4b the GM\'s chips on a list with a switch: a bound switch "stays on", a cursed one "curse (on)", a curse its owner switched off "kept on"; on a list with none, nothing of the switch; the removal chips as before; a player sees none',
            j(gmB(lib.i_ring, { id: 'w' }, true)) === j(['stays on']) && j(gmB(lib.i_amu, { id: 'w', on: true, keptOn: 1 }, true)) === j(['kept on']) && j(gmB(lib.i_amu, { id: 'w' }, true)) === j(['curse (on)'])
            && j(gmB(lib.i_ring, { id: 'w' }, false)) === j([]) && j(gmB({ name: 'B', rm: 'bound', eq: 'curse' }, { id: 'w' }, true)) === j(['bound', 'curse (on)']) && (() => { const h = fe('span'); W.gmItemBits(h, lib.i_ring, { id: 'w' }, false, true); return h.children.length === 0; })());
        const tSpec = S.cleanListSpec({ lvl: { label: 'Level', min: 0, max: 5 }, on: { label: 'Readied' }, noQty: true }, true), tF = { id: 'f_t', key: 'T', label: 'T', kind: 'item-list', table: { footer: true }, list: tSpec, edit: 'owner', vis: 'all' }, tP = { id: 'f_t', key: 'T', label: 'T', kind: 'item-list', table: { footer: true }, edit: 'owner', vis: 'all' };
        const tW = fe('div'); W.itemTableInto(tW, tF, chS, [{ id: 'w_t1', defId: 'i_blade', qty: 3, lvl: 2, on: true }], sysB, false, true, false);
        const tPW = fe('div'); W.itemTableInto(tPW, tP, chS, [{ id: 'w_t1', defId: 'i_blade', qty: 3 }], sysB, false, true, false);
        const tE = fe('div'); W.itemTableInto(tE, tF, chS, [], sysB, false, true, false, 'Nothing readied.');
        const thT = t => kids(kids(kids(t.children[0])[0])[0]).map(x => x.textContent), rowT = t => kids(kids(kids(t.children[0])[1])[0]), footT = t => kids(kids(kids(t.children[0])[2])[0]);
        check('F4b the sheet\'s table: a Level and a switch column headed by the list\'s labels, no Qty column with No quantity, the footer spanning them; a table with no options is as before (Item, Qty, actions; its footer\'s quantity); an empty one says the placement\'s note',
            j(thT(tW)) === j(['Item', 'Level', 'Readied', '']) && j(rowT(tW).map(x => x.className)) === j(['sheet-itcol-name', 'sheet-itcol-lvl', 'sheet-itcol-on', 'sheet-itcol-act']) && find(rowT(tW)[2], 'sheet-item-on')[0].checked === true
            && j(footT(tW).map(x => [x.className, x.colSpan || 0])) === j([['sheet-itft', 3], ['', 0]])
            && j(thT(tPW)) === j(['Item', 'Qty', '']) && j(footT(tPW).map(x => x.className)) === j(['sheet-itft', 'sheet-itft-qty', '']) && footT(tPW)[0].colSpan === 1
            && kids(kids(kids(tE.children[0])[1])[0])[0].textContent === 'Nothing readied.' && kids(kids(kids(tE.children[0])[1])[0])[0].colSpan === 4, j([thT(tW), footT(tW).map(x => [x.className, x.colSpan]), thT(tPW)]));
        const pk = fe('select'), nPk = W.pickerInto(pk, sysB.items, { cats: ['Skill', 'Jewel'], noQty: true }, [{ defId: 'i_karate', qty: 1 }, { id: 'w_h', defId: 'i_sneak', qty: 1, hid: 1 }]);
        const pk2 = fe('select'), nPk2 = W.pickerInto(pk2, [{ id: 'i_a', name: 'Loose' }].concat(sysB.items.slice(5)), {}, []), pk3 = fe('select'), nPk3 = W.pickerInto(pk3, sysB.items, { cats: [] }, []);
        const pk4 = fe('select'); W.pickerInto(pk4, sysB.items, { cats: ['Skill'], noQty: true, multi: true }, [{ defId: 'i_karate', qty: 1 }]);
        check('F4b the picker: only the list\'s categories (ignoring case), a group per category in the order met, items with none first; on a list with no quantity that holds an item once, one already carried is greyed (not a kept curse); with the same item more than once, never; an empty categories list offers nothing',
            nPk === 4 && j(kids(pk).map(g => [g.tag, g.label, kids(g).map(o => [o.value, !!o.disabled])])) === j([['optgroup', 'Skill', [['i_karate', true], ['i_sneak', false]]], ['optgroup', 'Jewel', [['i_ring', false], ['i_amu', false]]]])
            && nPk2 === 2 && j(kids(pk2).map(g => g.tag === 'option' ? g.value : g.label)) === j(['i_a', 'Gear']) && nPk3 === 0 && kids(pk3).length === 0 && kids(kids(pk4)[0]).every(o => !o.disabled), j(kids(pk).map(g => [g.label, kids(g).map(o => o.value)])));
        const chN = { id: 'c_a', name: 'A', ownerId: 'u_a', values: { f_wp: [{ id: 'w_r1', defId: 'i_ring', qty: 1, on: true }, { id: 'w_b1', defId: 'i_blade', qty: 1, on: false }], f_pl: [{ id: 'w_p', defId: 'i_blade', qty: 1 }], f_ar: [] } };
        const box = (fid, gm, own, pl, sy, ch) => { const f = (sy || sysB).fields.find(x => x.id === fid); return find(FN(f, ch || chN, null, gm, own, sy || sysB, null, pl), 'sheet-items')[0]; };
        const bOn = box('f_wp', false, true, { id: 'f_wp', w: 'row', on: true }), bAll = box('f_wp', false, true, { id: 'f_wp', w: 'row' }), bNone = box('f_wp', false, true, { id: 'f_wp', w: 1, on: true }, null, { id: 'c_a', name: 'A', ownerId: 'u_a', values: { f_wp: [{ id: 'w_b1', defId: 'i_blade', qty: 1 }] } });
        const bPl = box('f_pl', false, true, { id: 'f_pl', w: 1, on: true }), bAr = box('f_ar', false, true, { id: 'f_ar', w: 1 }, pvB);
        check('F4b fieldNode (run for real): a placement that shows only the rows switched on draws those alone and no picker, "Nothing readied." when none is; without it every row and the grouped picker; a list with no switch ignores the flag (the plain picker as before, "item — category"); a list whose categories the players cannot see gets no picker',
            find(bOn, 'sheet-item-name').map(x => x.textContent).join() === 'Ring' && find(bOn, 'sheet-item-add').length === 0 && find(bAll, 'sheet-item-name').map(x => x.textContent).join() === 'Ring,Blade' && find(bAll, 'sheet-item-add').length === 1 && kids(find(bAll, 'sheet-item-add')[0]).some(g => g.tag === 'optgroup')
            && find(bNone, 'sheet-empty-note')[0].textContent === 'Nothing readied.' && find(bPl, 'sheet-item-name').length === 1 && kids(find(bPl, 'sheet-item-add')[0]).some(o => o.tag === 'option' && /Blade — Gear/.test(o.textContent)) && find(bAr, 'sheet-item-add').length === 0,
            j([find(bOn, 'sheet-item-name').map(x => x.textContent), find(bAll, 'sheet-item-name').map(x => x.textContent), find(bNone, 'sheet-empty-note').map(x => x.textContent)]));

        // the System editor: the Lists tab's card (real), and the handlers that feed it (pinned)
        const lcSrc = cut('function listCard(', 'function renderCombat(');
        const LC = new Function('el', 'input', 'numField', 'document', 'LIMITS', lcSrc + '\nreturn listCard;')(fe, (cls, v, t, ph) => { const i = fe('input', cls); i.value = v == null ? '' : String(v); i.title = t; i.placeholder = ph; return i; }, (cls, v) => { const l = fe('label', 'sys-num'), i = fe('input', cls); i.value = v == null ? '' : String(v); l.appendChild(i); return l; }, docF, S.LIMITS);
        const card = LC(fB('f_wp'), ['Skill', 'Gear']), cbs = find(card, 'sys-list-catcb'), boxOf = c => find(card, c)[0];
        const card2 = LC({ id: 'f_z', key: 'Z', label: 'Z', kind: 'item-list', list: { lvl: { label: 'Rank', min: 1, max: 4, step: 1, def: 1, labels: ['I', 'II'] } } }, []);
        check('F4b the Lists tab: a card per item list — a tick per category the library has, plus one the list names that no item has any more; its options as ticks; the level\'s boxes only while rows have a level, the switch\'s only while they have a switch',
            card.dataset.lid === 'f_wp' && j(cbs.map(c => [c.dataset.cat, c.checked])) === j([['Skill', false], ['Gear', true], ['Jewel', true]]) && boxOf('sys-list-multi').checked === true && boxOf('sys-list-noqty').checked === false
            && boxOf('sys-list-haslvl').checked === false && find(card, 'sys-list-lvlmin').length === 0 && boxOf('sys-list-hason').checked === true && boxOf('sys-list-onlabel').value === 'Readied' && boxOf('sys-list-ondef').checked === false
            && find(card2, 'sys-list-lvlmin')[0].value === '1' && find(card2, 'sys-list-lvlnames')[0].value === 'I, II' && find(card2, 'sys-list-onlabel').length === 0 && find(card2, 'sys-list-catcb').length === 0, j(cbs.map(c => [c.dataset.cat, c.checked])));
        check('F4b the editor\'s handlers: the Lists tab\'s boxes and ticks write the draft\'s list (numbers or nothing, names split on commas; a tick adds or drops its category, the last one leaves "every category"; turning the level or the switch on seeds its defaults); the Items tab\'s switch lock, message, key and level; the Layout toggle; the live key check; the tab is drawn',
            /else if \(lcc\.indexOf\('sys-list-lvlmin'\) >= 0 && lvD\) numOr\(lvD, 'min'\);/.test(shB) && /else if \(lcc\.indexOf\('sys-list-lvlnames'\) >= 0 && lvD\) \{ var lvn = t\.value\.split\(','\)/.test(shB) && /if \(t\.checked && ci < 0\) cur\.push\(cx\); if \(!t\.checked && ci >= 0\) cur\.splice\(ci, 1\); if \(cur\.length\) lsc\.cats = cur; else delete lsc\.cats;/.test(shB)
            && /if \(t\.checked\) lsc\.lvl = \{ label: 'Level', min: 0, step: 1, def: 0 \}; else delete lsc\.lvl;/.test(shB) && /if \(t\.checked\) lsc\.on = \{ label: 'On' \}; else delete lsc\.on;/.test(shB)
            && /if \(c\.indexOf\('sys-item-eqmode'\) >= 0\) \{ if \(t\.value === 'bound' \|\| t\.value === 'curse'\) iit\.eq = t\.value; else delete iit\.eq;/.test(shB) && /else if \(ic\.indexOf\('sys-item-eqtext'\) >= 0\) it\.eqMsg = t\.value\.slice\(0, LIMITS\.rmMsg\);/.test(shB)
            && /else if \(ic\.indexOf\('sys-item-key'\) >= 0\) \{ var ikv = t\.value\.trim\(\)\.slice\(0, 40\); if \(ikv\) it\.key = ikv; else delete it\.key; \}/.test(shB) && /else if \(act === 'plon'\) \{ if \(pl\.on\) delete pl\.on; else pl\.on = true; \}/.test(shB)
            && /if \(it && it\.key && !cleanItemKey\(String\(it\.key\), F\(\)\)\)/.test(shB) && /if \(slEl\) \{ slEl\.style\.display = tab === 'lists' \? '' : 'none'; if \(tab === 'lists'\) renderLists\(\); \}/.test(shB)
            && fs.readFileSync(path.join(app, 'index.html'), 'utf8').indexOf('<div id="sysLists" class="sys-tab" style="display:none;">') > 0);
    }

    /* ---- Stage 6 F4b review: the lock covers dropping while it is on; a stored "on"; the level clamp's fixed point; the UI findings ---- */
    {
        let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
        const pick = a => a[Math.floor(rnd() * a.length)], nums = [undefined, 0, 1, 3, -2, 10, 11, 20.5, 0.3, 999999, -1e6, 1e6, 5e6, 0.7, -0.35], steps = [undefined, 1, 3, 0.5, 0.1, 7, 1e-310, -1, 0, 0.25, 0.3];
        const bad = [];
        for (let i = 0; i < 20000 && bad.length < 3; i++) {
            const raw = { min: pick(nums), max: pick(nums), step: pick(steps), def: pick(nums) };
            if (rnd() < 0.2) raw.labels = ['A', 'B', 'C'].slice(0, 1 + Math.floor(rnd() * 3));
            const a = S.cleanListSpec({ lvl: raw }, true).lvl, b = S.cleanListSpec({ lvl: a }, true).lvl, v = pick(nums.filter(x => x !== undefined)), c1 = S.lvlClamp(a, v), c2 = S.lvlClamp(a, c1);
            const inR = x => (a.min === undefined || x >= a.min) && (a.max === undefined || x <= a.max) && Math.abs(x) <= 1e6;
            if (j(a) !== j(b) || c1 !== c2 || !inR(c1) || !inR(a.def)) bad.push([raw, a, v, c1, c2]);
        }
        check('F4b review: the level clamp is its own fixed point on 20000 random ranges (a bound off the step grid is never landed on, so the GM\'s view, the players\' and every reload agree), inside the range and 1e6 with no float noise, and the list\'s default with it; a denormal step reads 1; value names never run past 1e6',
            bad.length === 0 && S.lvlClamp({ min: 0, max: 10, step: 3 }, 11) === 9 && S.lvlClamp({ min: 0, max: 0.3, step: 0.1 }, 0.3) === 0.3 && S.lvlClamp({ min: -1e6, max: 0.7, step: 0.1 }, 5) === 0.7
            && j(S.cleanListSpec({ lvl: { min: 0, max: 10, step: 3, def: 11 } }, true).lvl) === j({ label: 'Level', min: 0, max: 10, step: 3, def: 9 }) && S.cleanListSpec({ lvl: { step: 1e-310 } }, true).lvl.step === 1
            && S.cleanListSpec({ lvl: { min: 999999, labels: ['a', 'b', 'c'] } }, true).lvl.max === 1e6, j(bad));

        const sysL = cleanSystem({ v: 1, name: 'L', rolls: [], fields: [{ id: 'f_w', key: 'Worn', label: 'Worn', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Worn', def: true }, multi: true } }],
            items: [{ id: 'i_ring', name: 'Ring', eq: 'bound', eqMsg: 'Stuck' }, { id: 'i_amu', name: 'Amulet', eq: 'curse', eqMsg: 'Warm' }, { id: 'i_band', name: 'Band', rm: 'bound', rmMsg: 'Bound band', eq: 'curse' }, { id: 'i_hat', name: 'Hat' }] }, { F, gmView: true });
        const pvL = cleanSystem(sysL, { F, gmView: false }), PL = { player: true, view: pvL };
        const runL = (rows, q, o) => { const ch = { id: 'c_l', values: { f_w: JSON.parse(JSON.stringify(rows)) } }, r = S.applyRowOp(sysL, ch, 'f_w', q, F, o || PL); return [r, r.ok ? r.value : null]; };
        const [d1] = runL([{ id: 'w_r', defId: 'i_ring', qty: 1, on: true }], { op: 'remove', rowId: 'w_r' });
        const [d2] = runL([{ id: 'w_r', defId: 'i_ring', qty: 2, on: true }], { op: 'setQty', rowId: 'w_r', qty: 1 });
        const [d3, v3] = runL([{ id: 'w_r', defId: 'i_ring', qty: 1, on: true }], { op: 'remove', rowId: 'w_r' }, Object.assign({ onGrace: true }, PL));
        const [d4, v4] = runL([{ id: 'w_r', defId: 'i_ring', qty: 1, on: false }], { op: 'remove', rowId: 'w_r' });
        const [d5, v5] = runL([{ id: 'w_r', defId: 'i_ring', qty: 1, on: true }], { op: 'remove', rowId: 'w_r' }, Object.assign({ grace: { added: 1 } }, PL));
        const [d6, v6] = runL([{ id: 'w_a', defId: 'i_amu', qty: 1, on: true, keptOn: 1 }], { op: 'remove', rowId: 'w_a' });
        const [d7, v7] = runL([{ id: 'w_a', defId: 'i_amu', qty: 1, on: true }], { op: 'remove', rowId: 'w_a' }, {});
        const [d8] = runL([{ id: 'w_b', defId: 'i_band', qty: 1, on: true }], { op: 'remove', rowId: 'w_b' });
        const [d9, v9] = runL([{ defId: 'i_ring', qty: 1 }], { op: 'remove', rowId: 'w_ring' });
        const [d10, v10] = runL([{ id: 'w_a', defId: 'i_amu', qty: 3, on: true }], { op: 'setQty', rowId: 'w_a', qty: 1 });
        check('F4b review (owner: the lock covers dropping while it is on): a bound switch that is on cannot be dropped or lowered ("stays", its switch message, eq) unless the switch\'s grace (then spent) or a pickup\'s Undo covers it; off, it drops as usual; a cursed one that is on, kept on or not, leaves the owner\'s sheet and stays on the character hidden, with its message (a partial drop is ordinary); the GM drops it as they like; a removal rule of its own wins with its own message; a row on only by the list\'s "starts on" is not locked',
            j([d1.ok, d1.reason, d1.msg, d1.eq]) === j([false, 'stays', 'Stuck', true]) && d2.reason === 'stays' && d3.ok && d3.onGraceUsed === true && j(v3) === j([]) && d4.ok && j(v4) === j([]) && d5.ok && !d5.onGraceUsed && j(v5) === j([])
            && d6.ok && d6.hid === true && d6.msg === 'Warm' && d6.name === 'Amulet' && v6.length === 1 && v6[0].hid === 1 && v6[0].on === true && v6[0].id !== 'w_a' && d7.ok && j(v7) === j([])
            && j([d8.ok, d8.reason, d8.msg, 'eq' in d8]) === j([false, 'stays', 'Bound band', false]) && d9.ok && j(v9) === j([]) && d10.ok && j(v10) === j([{ id: 'w_a', defId: 'i_amu', qty: 1, on: true }]),
            j([d1, d2, d3, d6, v6, d8, d9, d10]));
        const [s1, sv1] = runL([{ defId: 'i_ring', qty: 1 }], { op: 'set', rowId: 'w_ring', facts: { on: false } });
        const [s2] = runL([{ id: 'w_r', defId: 'i_ring', qty: 1 }], { op: 'set', rowId: 'w_r', facts: { on: true } });
        const [s3] = runL([{ id: 'w_r', defId: 'i_ring', qty: 1, on: true }], { op: 'set', rowId: 'w_r', facts: { on: false } }, Object.assign({ onGrace: true }, PL));
        check('F4b review: the switch lock engages only on a row stored on; one on only by the list\'s "starts on" switches off freely (its off is stored); switching it on stores it and opens the grace; a grace that lets a switch go is spent',
            s1.ok && j(sv1) === j([{ defId: 'i_ring', qty: 1, on: false }]) && s2.ok && s2.onRow === 'w_r' && s2.eqNote === 'bound' && s3.ok && s3.onGraceUsed === true, j([s1, sv1, s2, s3]));
        const vD = validateSystem(cleanSystem({ v: 1, name: 'D', rolls: [], fields: [{ id: 'f_1', key: 'A1', label: 'A1', kind: 'item-list' }, { id: 'f_2', key: 'A2', label: 'A2', kind: 'item-list' }], items: [{ id: 'i_x', name: 'X', key: 'Ax' }, { id: 'i_y', name: 'Y', key: 'ax' }] }, { F, gmView: true }), F);
        check('F4b review: a key two items share is one error, on the second, however many lists hold them both', j(vD.errors.map(e => e.id)) === j(['i_y']), j(vD.errors));

        const shR = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), ntR = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
        const cutR = (a, b) => { const i = shR.indexOf(a), k = shR.indexOf(b, i + 1); if (i < 0 || k < 0) throw new Error('F4b review slice: ' + a); return shR.slice(i, k); };
        const feR = (tag, cls, text) => ({ tag, className: cls || '', textContent: text === undefined || text === null ? '' : String(text), children: [], title: '', type: '', value: '', checked: false, disabled: false, dataset: {}, style: {}, classList: { add() {} }, on: {}, get childNodes() { return this.children; }, appendChild(x) { this.children.push(x); return x; }, insertBefore(x) { this.children.unshift(x); return x; }, addEventListener(k, f) { this.on[k] = f; } });
        const optR = (v, t, s) => { const o = feR('option', null, t); o.value = v; if (s) o.selected = true; return o; }, docR = { createTextNode: t => ({ tag: '#text', textContent: t, children: [] }) };
        const WR = new Function('el', 'iconNode', 'rowDef', 'rowIdOf', 'rowLvl', 'rowOn', 'commitItem', 'opt', 'fmtNum', 'iconText', 'LIMITS', '_fxLive', 'document', 'renderViews', 'closeHud', 'closeSheet', 'window', cutR('// ---- item-list widgets', '// 5h: an effect\'s changes as short text') + '\nreturn { itemListInto: itemListInto };')(
            feR, (v, cls) => feR('span', cls, v), S.rowDef, S.rowIdOf, S.rowLvl, S.rowOn, () => {}, optR, S.fmtNum, v => v || '', S.LIMITS, true, docR, () => {}, () => {}, () => {}, {});
        const sysC = cleanSystem({ v: 1, name: 'C', rolls: [], fields: [{ id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Readied' }, lvl: { min: 0, max: 5 } } }], items: [{ id: 'i_a', name: 'A', category: 'Blade' }, { id: 'i_b', name: 'B', category: 'blade' }, { id: 'i_c', name: 'C', category: 'Jewel' }] }, { F, gmView: true });
        const chC = { id: 'c_c', name: 'C', ownerId: 'u_c', values: {} }, drawC = rows => { const w = feR('div'); WR.itemListInto(w, sysC.fields[0], chC, rows, sysC, false, true, false); return w; };
        const one = drawC([{ id: 'w_a', defId: 'i_a', qty: 1 }, { id: 'w_b', defId: 'i_b', qty: 1 }]), two = drawC([{ id: 'w_a', defId: 'i_a', qty: 1, lvl: 2 }, { id: 'w_c', defId: 'i_c', qty: 1 }]);
        const chipsOf = w => w.children.filter(x => x.className.indexOf('sheet-item') === 0 && x.className.indexOf('noteline') < 0).map(r => r.children.filter(k => k.className === 'sheet-chip').map(k => k.textContent).join());
        const lvIn = two.children[0].children.find(k => k.className === 'sheet-item-lvl').children[0], cbOn = two.children[0].children.find(k => k.className === 'sheet-item-onl').children[0], noteIn = two.children[1].children.find(k => /sheet-item-note$/.test(k.className));
        const LCR = new Function('el', 'input', 'numField', 'document', 'LIMITS', cutR('function listCard(', 'function renderCombat(') + '\nreturn listCard;')(feR, (cls, v) => { const i = feR('input', cls); i.value = v == null ? '' : String(v); return i; }, (cls, v) => { const l = feR('label', 'sys-num'), i = feR('input', cls); i.value = v == null ? '' : String(v); l.appendChild(i); return l; }, docR, S.LIMITS);
        const cats20 = Array.from({ length: 20 }, (_, i) => 'K' + i), cardC = LCR({ id: 'f_z', key: 'Z', label: 'Z', kind: 'item-list', list: { cats: cats20 } }, cats20.concat(['X1', 'X2'])), cbsC = [];
        const walkR = n => { if ((' ' + n.className + ' ').indexOf(' sys-list-catcb ') >= 0) cbsC.push(n); (n.children || []).forEach(walkR); }; walkR(cardC);
        check('F4b review, the sheet: a category chip only while the rows drawn span two or more categories (Blade and blade are one); the level box, the switch and the note carry the field and a per-row part, so focus comes back after a commit\'s redraw; the Lists card greys further categories once 20 are ticked',
            j(chipsOf(one)) === j(['', '']) && j(chipsOf(two)) === j(['Blade', 'Jewel']) && lvIn.dataset.fid === 'f_g' && lvIn.dataset.part === 'lvl-w_a' && cbOn.dataset.part === 'on-w_a' && noteIn && noteIn.dataset.part === 'note-w_a'
            && cbsC.length === 22 && cbsC.filter(c => c.disabled).map(c => c.dataset.cat).join() === 'X1,X2', j([chipsOf(one), chipsOf(two), lvIn.dataset, cbsC.filter(c => c.disabled).length]));
        const rvS = (shR.match(/function revertLast\(\) \{[\s\S]*?\n\}/) || [''])[0], keptRow = [{ id: 'w_1', defId: 'i_a', qty: 1, on: true, keptOn: 1 }], prevRow = [{ id: 'w_1', defId: 'i_a', qty: 1, on: true }];
        const mkRv = seen => {
            const out = { deltas: [], asked: null }, ch = { id: 'c_r', values: { f_g: JSON.parse(JSON.stringify(keptRow)) } }, camp = { system: sysC, chars: { c_r: ch } };
            new Function('getActiveCampaign', 'systemOf', 'isClient', 'charById', 'afterCharChange', 'toast', 'clone', 'fieldById', 'ownerSeesSame', 'var lastChange = { charId: "c_r", fieldId: "f_g", prev: ' + j(prevRow) + ' };\n' + rvS + '\nreturn revertLast;')(
                () => camp, () => sysC, () => false, id => camp.chars[id], (c, w, d) => out.deltas.push(JSON.parse(JSON.stringify(d))), () => {}, x => JSON.parse(JSON.stringify(x)), S.fieldById, (cp, sy, a, b) => { out.asked = [a, b]; return seen; })();
            return { out, ch };
        };
        const rvA = mkRv(true), rvB = mkRv(false);
        check('F4b review: Revert (run for real) takes back a change to an item list its owner never saw (the GM switching off a kept-on curse) without sending anything, asking with the row as it was and as it goes back; one the owner saw is sent as before',
            rvS.length > 0 && j(rvA.out.deltas) === j([{}]) && j(rvA.ch.values.f_g) === j(prevRow) && j(rvA.out.asked) === j([keptRow, prevRow]) && j(rvB.out.deltas) === j([{ f_g: prevRow }]), j([rvA.out, rvB.out]));
        check('F4b review, the source: a refused switch says "It stays on." unless the GM wrote a message (the client passes the op); Revert of a change its owner never held sends nothing; the Layout toggle stays while it is set, so it can be cleared after the list lost its switch; the key\'s error names every reason; the host spends a switch\'s grace once and lets it cover a drop',
            /function editResult\(rid, ok, reason, msg, op\) \{ if \(!ok\) toast\(reason === 'stays' \? \(msg \|\| \(op === 'set' \? 'It stays on\.' :/.test(shR) && /window\.wpSheets\.editResult\(rid, false, reason, msg, p\.q \? p\.q\.op : ''\)/.test(ntR)
            && /if \(fR && fR\.kind === 'item-list' && ownerSeesSame\(camp, sysR, curR, lastChange\.prev\)\) delete d\[fidR\];/.test(shR) && /if \(plOn \|\| \(pl\.on && plf && plf\.kind === 'item-list'\)\)/.test(shR)
            && /not a word formulas already use \(count, qty, on, has, lvl, paid, row; max, cur, ranks, base;/.test(shR) && /if \(resI\.onGraceUsed\) delete _rowGrace\[gkI \+ '\|on'\];/.test(ntR) && /var ogI = !!\(_rowGrace\[gkI \+ '\|on'\] && _rowGrace\[gkI \+ '\|on'\]\.until > nowI\);/.test(ntR));
    }

    /* ---- Stage 6 look fold (L1): the sheet palette ---- */
    {
        const crypto = require('crypto'), H = o => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
        const tutSrc = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8');
        const fnSrc = name => { const i = tutSrc.indexOf('function ' + name + '('); let d = 0; const k = tutSrc.indexOf('{', i); for (let p = k; p < tutSrc.length; p++) { if (tutSrc[p] === '{') d++; else if (tutSrc[p] === '}') { d--; if (d === 0) return tutSrc.slice(i, p + 1); } } return ''; };
        const tutorialSystem = new Function(fnSrc('tutorialEffects') + '\n' + fnSrc('tutorialHud') + '\n' + fnSrc('tutorialSystem') + '\nreturn tutorialSystem;')();
        const preset = n => JSON.parse(fs.readFileSync(path.join(app, 'assets', 'systems', n + '.json'), 'utf8'));
        // the pre-fold hashes (taken at 516b22b, before any look-fold key existed): a system without the new keys cleans exactly as before
        const PRE = {
            d20: ['96c44fc592448813542d72f24129e788304634fcdab1649e3942daa6ae42b894', 'c8733a11848517e9b02ffaf86072506ef224cccbbb4eca17d6403b6d3c1de269', '32be92883bbdfd0fb9975e29bf00f9632b296a13d1fdab3c0e801458f9f97cc8'],
            '3d6': ['0292986b3be8f1c8b5d38c000e66b7a15cc9569b1a318a96d9a1bb395dd2e756', 'a7733f1f3820bbcfc1fdacb52e767e78df634d323e2cca503254d8977c7e29f8', '37fe78c2036ca85291471ddac6f04a816257e02bc78763df705390136a92c992'],
            // re-taken after the L3 seed change (the tour's identity is Class alone, edited in the header; the abilities stay tiles) — a deliberate change, not drift;
            // re-taken again at HUD frame HF2a: a deliberate change, the tour's HUD seed (the automatic layout's hash is unchanged);
            // and at HF4a: a deliberate change, the tour's HUD Checks section draws as inline rows (the automatic layout's hash is unchanged);
            // and at HF4b: a deliberate change, the tour's HUD Condition section carries Reset all (the automatic layout's hash is unchanged)
            tutorial: ['7937c05606b629a8cc30a0ee0e9a4d653b1fb6ea9b039fcaf3e9089f86ecf3e1', 'c4ebf55e31db11a0942a9f4ecae0f6f5b7408eaf28fa474f4911c51cf48a134b', 'ca140918d060af6f2949d30e7ba68e3b559fa4142b5101ee8ab04f34b7306e41']
        };
        const absent = [['d20', preset('d20')], ['3d6', preset('3d6')], ['tutorial', tutorialSystem()]].map(([n, raw]) => { const gm = cleanSystem(raw, { F, gmView: true }), pv = cleanSystem(raw, { F, gmView: false }); return [n, [H(gm), H(pv), H(S.autoLayout(gm))], gm]; });
        check('look L1: the bundled presets and the tutorial\'s system clean byte-for-byte as before the look fold (GM view, players\' view, automatic layout), with no look key', absent.every(([n, h, gm]) => j(h) === j(PRE[n]) && !(gm.sheet && gm.sheet.look && gm.sheet.look.palette)), j(absent.map(([n, h]) => [n, h.map((x, i) => x === PRE[n][i])])));
        const GRAPH = { text: '#ADD8E6', muted: '#8c8c8c', panel: '#1a1a1a', card: '#212121', field: '#1a1a1a', edge: '#333333', primary: '#add8e6', danger: '#cc3333', good: '#4ade80', warn: '#f59e0b' };
        const mkL = look => cleanSystem({ v: 1, name: 'L', fields: [{ id: 'f_a', key: 'A', kind: 'number', def: 1, vis: 'all' }], rolls: [], sheet: { sections: [], look } }, { F, gmView: true });
        const lk = mkL({ labels: 'caps', palette: Object.assign({ extra: '#000000' }, GRAPH), titles: 'headline' }).sheet.look;
        check('look L1: a palette is kept whole — ten hex colours, lower-cased, extra keys dropped, a plain object after the existing look keys', !!lk && j(Object.keys(lk)) === j(['titles', 'labels', 'palette']) && lk.palette.text === '#add8e6' && Object.keys(lk.palette).length === 10 && !('extra' in lk.palette) && Object.getPrototypeOf(lk.palette) === Object.prototype, j(lk));
        const nine = Object.assign({}, GRAPH); delete nine.warn;
        const bads = ['#abc', '#aabbccdd', ' #aabbcc', '#aabbcc;x', 'url(x)', 'red', 'var(--x)', 42, null].map(b => mkL({ palette: Object.assign({}, GRAPH, { edge: b }) }).sheet);
        check('look L1: a palette missing one colour, or with any one colour that is not six hex digits (#abc, 8 digits, a leading space, ;x, url(), a name, var(), a number), is dropped whole — a look with nothing else leaves no look key', !('look' in mkL({ palette: nine }).sheet) && bads.every(s => !('look' in s)) && !('look' in mkL({ palette: '#aabbcc' }).sheet), j(bads.map(s => s.look)));
        const pvL = cleanSystem({ v: 1, name: 'L', fields: [], rolls: [], sheet: { sections: [], look: { palette: GRAPH } } }, { F, gmView: false });
        check('look L1: the players\' view keeps the palette (nothing in a look is secret)', pvL.sheet && pvL.sheet.look && pvL.sheet.look.palette && pvL.sheet.look.palette.primary === '#add8e6', j(pvL.sheet));
        // the two look test systems (tools/fixtures): clean once and again to the same thing, on the GM's side and the way a client re-cleans the players' view
        const fixtures = ['look-d20', 'look-3d6'].map(n => [n, JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8'))]);
        const fixOk = fixtures.map(([n, raw]) => { const g1 = cleanSystem(raw, { F, gmView: true }), g2 = cleanSystem(g1, { F, gmView: true }), p1 = cleanSystem(raw, { F, gmView: false }), p2 = cleanSystem(p1, { F, gmView: false }), v = S.validateSystem(g1, F); return [n, j(g1) === j(g2) && j(p1) === j(p2) && v.errors.length === 0 && !!(p1.sheet.look && p1.sheet.look.palette) && g1.fields.length === raw.fields.length]; });
        check('look L1: both look test systems (generic d20 on Parchment, 3d6 points on Graphite) clean idempotently in both views, validate with no errors, and keep their palette for players', fixOk.every(x => x[1]), j(fixOk));
        // the sink, sliced from sheets.js (the live panel draws the campaign's raw system, so the palette is checked again where it meets a style)
        const shL = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8');
        const accSrc = shL.slice(shL.indexOf('function accentInk('), shL.indexOf('// [systemcheck:palette-start]')), palSrc = shL.slice(shL.indexOf('// [systemcheck:palette-start]'), shL.indexOf('// [systemcheck:palette-end]'));
        const PL = new Function(accSrc + palSrc + '\nreturn { applyPaletteTo: applyPaletteTo, PAL_VARS: PAL_VARS, PAL_ALL: PAL_ALL };')();
        const node = () => { const props = {}, cls = {}; const n = { props, cls, style: { colorScheme: '', setProperty: (k, v) => { props[k] = v; }, removeProperty: k => { delete props[k]; } }, classList: { toggle: (c, on) => { cls[c] = !!on; } } }; return n; };
        const n0 = node(); PL.PAL_ALL.forEach(v => { n0.props[v] = 'x'; }); n0.style.colorScheme = 'dark'; const r0 = PL.applyPaletteTo(n0, {});
        const nU = node(), rU = PL.applyPaletteTo(nU, { palette: Object.fromEntries(Object.keys(GRAPH).map(k => [k, 'url(x)'])) }), n1 = node(), r1 = PL.applyPaletteTo(n1, { palette: Object.assign({}, GRAPH, { text: '#add8e6', edge: 'red' }) });
        const G = Object.assign({}, GRAPH, { text: '#add8e6' }), nG = node(), rG = PL.applyPaletteTo(nG, { palette: G, accent: '#ab94b3' }), nP = node(), PARCH = { text: '#2b2118', muted: '#6b5a48', panel: '#f3ead6', card: '#e8dcc0', field: '#fbf6ea', edge: '#c4b393', primary: '#7a2e1f', danger: '#a3261b', good: '#2f7a3b', warn: '#9a6410' }, rP = PL.applyPaletteTo(nP, { palette: PARCH });
        const mapped = Object.keys(PL.PAL_VARS).every(k => PL.PAL_VARS[k].every(v => nG.props[v] === G[k])), extras = ['--sheet-primary-ink', '--sheet-danger-ink', '--gold', '--scroll', '--scroll-hover'];
        check('look L1: applyPaletteTo (sliced from sheets.js) — no palette removes every variable and the class; a palette with any value that is not a hex colour sets nothing; a whole one sets exactly its variables, the inks, --gold (the accent, else primary), a colour scheme of dark or light and matching scrollbars',
            !r0 && Object.keys(n0.props).length === 0 && n0.cls['sheet-paletted'] === false && n0.style.colorScheme === '' && !rU && Object.keys(nU.props).length === 0 && !r1 && Object.keys(n1.props).length === 0
            && rG && mapped && Object.keys(nG.props).length === PL.PAL_ALL.length && extras.every(v => v in nG.props) && nG.props['--gold'] === '#ab94b3' && nG.style.colorScheme === 'dark' && nG.cls['sheet-paletted'] === true && nG.props['--sheet-danger-ink'] === '#ffffff'
            && rP && nP.props['--gold'] === '#7a2e1f' && nP.style.colorScheme === 'light' && /^rgba\(0,0,0,/.test(nP.props['--scroll']), j([nG.props, nP.style.colorScheme]));
        const cssL = fs.readFileSync(path.join(app, 'style.css'), 'utf8'), palCss = cssL.slice(cssL.indexOf('/* Stage 6 look fold (L1): a sheet palette.'), cssL.indexOf('.sys-lookpalette {'));
        const palRules = palCss.split('\n').filter(l => /\{/.test(l) && !/^\s*\/\*/.test(l));
        check('look L1: the renders — applyLook before the frame is measured in buildSections; the look (and its font) before syncFramePad in the live panel and the pop-out; the palette on the whole panel; a palette drops the page colours (font and picture stay); the preview\'s children are inert; every palette CSS rule is gated by .sheet-paletted',
            /applyLook\(body, look, vctx\);[^\n]*\n\s*syncFramePad\(body\);\s*\n\s*if \(tabs \? !tabN : !secN\)/.test(shL) && /applySheetLookTo\(body, sheetLook\(camp, sys\)\);\s*\n\s*syncFramePad\(body\);/.test(shL) && /applySheetLookTo\(container, sheetLook\(camp, sys\)\);\s*\n\s*syncFramePad\(container\);/.test(shL)
            && /applyPaletteTo\(p, sys\.sheet && sys\.sheet\.look\);/.test(shL) && /if \(st && paletteOf\(sys && sys\.sheet && sys\.sheet\.look\)\) \{ st = Object\.assign\(\{\}, st\); delete st\.textColor; delete st\.bgColor; \}/.test(shL)
            && /Array\.prototype\.forEach\.call\(box\.children, function\(ch\) \{ ch\.inert = true; \}\);/.test(shL) && palRules.length >= 18 && palRules.every(l => /\.sheet-paletted/.test(l)), j(palRules.filter(l => !/\.sheet-paletted/.test(l))));
    }

    /* ---- Onboarding F0: who plays what — the binding by id, one chooser for owned tokens, one resolver for a player's token ---- */
    {
        const tok = (id, o) => Object.assign({ id, type: 'circle', isChar: true, x: 0, y: 0, w: 60, h: 52 }, o || {});
        const base = () => ({
            chars: { c_a: { id: 'c_a', name: 'Brakka', ownerId: 'u_a', npc: false, values: {}, updated: 5 }, c_w: { id: 'c_w', name: 'Wolf', ownerId: 'u_a', npc: false, values: {}, updated: 9 },
                     c_b: { id: 'c_b', name: 'Mira', ownerId: 'u_b', npc: false, values: {}, updated: 1 }, c_n: { id: 'c_n', name: 'Guard', ownerId: '', npc: true, values: {}, updated: 1 } },
            players: { u_a: { name: 'Alice', charName: 'Brakka', lastMap: 'm1' }, u_b: { name: 'Bob' } },
            items: { m1: { id: 'm1', type: 'map', whiteboard: [] }, m2: { id: 'm2', type: 'map', whiteboard: [] }, d1: { id: 'd1', type: 'doc' } } });
        // activeCharOf: the record, the only one, the guess (old name, then a token on their last map, then the most recent); NPCs and drafts never
        const a1 = base(); a1.players.u_a.charId = 'c_w';
        const a2 = base(); a2.players.u_a.charId = 'c_b';   // names another player's character: not theirs
        const a3 = base(); delete a3.players.u_a.charName; a3.items.m1.whiteboard.push(tok('t1', { charId: 'c_a', ownerId: 'u_a' }));
        const a4 = base(); delete a4.players.u_a.charName;
        const a5 = base(); a5.chars.c_a.draft = true; a5.chars.c_w.npc = true;
        const r = [S.activeCharOf(a1, 'u_a'), S.activeCharOf(a2, 'u_a'), S.activeCharOf(a3, 'u_a'), S.activeCharOf(a4, 'u_a'), S.activeCharOf(base(), 'u_b'), S.activeCharOf(a5, 'u_a'), S.activeCharOf(base(), 'u_z'), S.activeCharOf(base(), '__proto__')];
        check('onboarding F0: activeCharOf — the record when it still names one of theirs; else their only one; else a guess (their old name, then a token they hold on their last map, then the most recently changed); never an NPC, a draft or another player\'s; nobody for a player with none',
            j(r) === j([{ id: 'c_w', how: 'record' }, { id: 'c_a', how: 'guess' }, { id: 'c_a', how: 'guess' }, { id: 'c_w', how: 'guess' }, { id: 'c_b', how: 'only' }, { id: null, how: 'none' }, { id: null, how: 'none' }, { id: null, how: 'none' }]), j(r));
        // ownedTokenPlan: one owned token per character per map, only for the character in play; keep, then already held, then topmost
        const p1 = base(); p1.players.u_a.charId = 'c_a';
        p1.items.m1.whiteboard.push(tok('t1', { charId: 'c_a', ownerId: 'u_a' }), tok('t2', { charId: 'c_a', layer: 'front' }), tok('t3', { charId: 'c_w', ownerId: 'u_a' }), tok('t4', { charName: 'Pet', ownerId: 'u_a' }),
            tok('t5', { charName: 'Pet', ownerId: 'u_a' }), tok('t6', { charId: 'c_n', ownerId: 'u_a' }), tok('t7', { charId: 'c_gone', ownerId: 'u_a' }), tok('t8', { charName: 'Horse', ownerId: 'u_a' }));
        p1.items.m2.whiteboard.push(tok('t9', { charId: 'c_a' }), tok('t10', { charId: 'c_b' }));
        const pl1 = S.ownedTokenPlan(p1, {}), plK = S.ownedTokenPlan(p1, { keep: 't2' }), plM = S.ownedTokenPlan(p1, { mapId: 'm2' });
        const want1 = [{ mapId: 'm1', wbId: 't3', ownerId: '' }, { mapId: 'm1', wbId: 't6', ownerId: '' }, { mapId: 'm1', wbId: 't4', ownerId: '' }, { mapId: 'm2', wbId: 't9', ownerId: 'u_a' }, { mapId: 'm2', wbId: 't10', ownerId: 'u_b' }];
        const byKey = l => l.map(o => o.mapId + '|' + o.wbId + '|' + o.ownerId).sort();
        check('onboarding F0: ownedTokenPlan — the copy the player already holds stays theirs, a kept character\'s token and an NPC\'s pass to the GM, one token per name for tokens without a character (the topmost), a token of a missing character is left alone, and a map with none held gives the character\'s owner one',
            j(byKey(pl1)) === j(byKey(want1)), j(pl1));
        check('onboarding F0: ownedTokenPlan — keep (a give) wins over the copy already held, which passes to the GM still linked; mapId limits the plan to one map',
            byKey(plK).indexOf('m1|t2|u_a') >= 0 && byKey(plK).indexOf('m1|t1|') >= 0 && plM.every(o => o.mapId === 'm2') && plM.length === 2, j([plK, plM]));
        S.applyOwnerOps(p1, pl1);
        const after = p1.items.m1.whiteboard.map(w => w.id + ':' + (w.ownerId || '')).join(',');
        check('onboarding F0: applying the plan, then planning again, changes nothing (stable), and links are never removed',
            after === 't1:u_a,t2:,t3:,t4:,t5:u_a,t6:,t7:u_a,t8:u_a' && S.ownedTokenPlan(p1, {}).length === 0 && p1.items.m1.whiteboard.filter(w => w.charId).length === 5, after);
        // the undo-shaped merge: two copies both owned (live owner, snapshot link) — exactly one stays owned; the topmost with nothing held
        const p2 = base(); p2.players.u_a.charId = 'c_a'; p2.items.m1.whiteboard.push(tok('u1', { charId: 'c_a', ownerId: 'u_a' }), tok('u2', { charId: 'c_a', ownerId: 'u_a' }));
        S.applyOwnerOps(p2, S.ownedTokenPlan(p2, {}));
        const p3 = base(); p3.players.u_a.charId = 'c_a'; p3.items.m1.whiteboard.push(tok('v1', { charId: 'c_a', z: 40 }), tok('v2', { charId: 'c_a' }));
        S.applyOwnerOps(p3, S.ownedTokenPlan(p3, {}));
        check('onboarding F0: after an undo brings back two owned copies, exactly one stays owned; with none held, the topmost (its layer or z, then the later one) is given',
            p2.items.m1.whiteboard.filter(w => w.ownerId === 'u_a').length === 1 && p3.items.m1.whiteboard.map(w => w.ownerId || '').join(',') === 'u_a,', j([p2.items.m1.whiteboard, p3.items.m1.whiteboard]));
        // migrateBindings: the one in play written once, name-only tokens THEY hold linked, idempotent, never a prototype write
        const m1 = base();
        m1.chars.c_c = { id: 'c_c', name: 'Cato', ownerId: 'u_c', npc: false, values: {}, updated: 2 };
        m1.chars.c_p = { id: 'c_p', name: 'Poison', ownerId: '__proto__', npc: false, values: {}, updated: 2 };
        m1.items.m1.whiteboard.push(tok('n1', { charId: 'c_a', ownerId: 'u_a' }), tok('n2', { charId: 'c_w', ownerId: 'u_a' }));
        m1.items.m2.whiteboard.push(tok('n3', { charName: 'Brakka', ownerId: 'u_a' }), tok('n4', { charName: 'Brakka' }), tok('n5', { charName: 'Mira', ownerId: 'u_a' }));
        const mg = S.migrateBindings(m1), snapM = j(m1), mg2 = S.migrateBindings(m1);
        check('onboarding F0: migrateBindings — each KNOWN owner gets the character in play written down (a guess listed, a player with several listed with the kept ones), the name kept in step; an owner with no record gets none (a Forget stays forgotten); only a name-only token THEY hold is linked (never an unowned one or a different name); a second run changes nothing; a prototype owner is skipped',
            m1.players.u_a.charId === 'c_a' && m1.players.u_a.charName === 'Brakka' && m1.players.u_b.charId === 'c_b' && !('u_c' in m1.players)
            && mg.bound === 2 && mg.linked === 1 && j(mg.guesses) === j([{ pid: 'u_a', id: 'c_a' }]) && j(mg.several) === j([{ pid: 'u_a', id: 'c_a', kept: ['c_w'] }])
            && m1.items.m2.whiteboard[0].charId === 'c_a' && !m1.items.m2.whiteboard[1].charId && !m1.items.m2.whiteboard[2].charId
            && mg2.bound === 0 && mg2.linked === 0 && j(m1) === snapM && ({}).charId === undefined && ({}).charName === undefined, j([mg, m1.players]));
        const m2 = base(); m2.items.m1.whiteboard.push(tok('k1', { charName: 'Brakka', ownerId: 'u_a' })); const mgNo = S.migrateBindings(m2, { link: false });
        check('onboarding F0: migrateBindings { link: false } (syncOwners\' heal) writes the binding but links nothing', mgNo.linked === 0 && !m2.items.m1.whiteboard[0].charId && m2.players.u_a.charId === 'c_a', j(mgNo));
        // tokenSourceFor: keep, adopt (never a hidden copy), prefer, clone (theirs first, never another player's), link by name, spawn; the legacy path
        const s = base(); s.players.u_a.charId = 'c_a';
        const src = (camp, pid, map, o) => { const x = S.tokenSourceFor(camp, pid, map, o); return x.op + (x.tok ? ':' + x.tok.id : '') + (x.here === false ? '@far' : ''); };
        const sK = base(); sK.players.u_a.charId = 'c_a'; sK.items.m1.whiteboard.push(tok('s1', { charId: 'c_a', ownerId: 'u_a' }), tok('s2', { charId: 'c_a' }));
        const sA = base(); sA.players.u_a.charId = 'c_a'; sA.items.m1.whiteboard.push(tok('s3', { charId: 'c_a', hidden: true }), tok('s4', { charId: 'c_a' }));
        const sH = base(); sH.players.u_a.charId = 'c_a'; sH.items.m1.whiteboard.push(tok('s5', { charId: 'c_a', hidden: true }));
        const sC = base(); sC.players.u_a.charId = 'c_a'; sC.items.m2.whiteboard.push(tok('s6', { charId: 'c_a' }), tok('s7', { charId: 'c_a', ownerId: 'u_a' }), tok('s8', { charId: 'c_a', ownerId: 'u_b' }));
        const sX = base(); sX.players.u_a.charId = 'c_a'; sX.items.m2.whiteboard.push(tok('s9', { charId: 'c_a', ownerId: 'u_b' }));
        const sL = base(); sL.players.u_a.charId = 'c_a'; sL.items.m1.whiteboard.push(tok('l1', { charName: 'Brakka', ownerId: 'u_b' }), tok('l2', { charName: 'Brakka' }));
        const sF = base(); sF.players.u_a.charId = 'c_a'; sF.items.m2.whiteboard.push(tok('l3', { charName: 'Brakka', ownerId: 'u_a' }));
        const drag = tok('dr', { charId: 'c_a', ownerId: 'u_a' });
        const rs = [src(sK, 'u_a', 'm1'), src(sA, 'u_a', 'm1'), src(sH, 'u_a', 'm1'), src(sC, 'u_a', 'm1'), src(sX, 'u_a', 'm1'), src(sL, 'u_a', 'm1'), src(sF, 'u_a', 'm1'), src(s, 'u_a', 'm1', { prefer: drag }), src(sK, 'u_a', 'm1', { prefer: drag }), src(s, 'u_a', 'd1'), src(s, 'u_a', 'nope')];
        check('onboarding F0: tokenSourceFor — their own copy here is kept; an unowned copy here adopted (a hidden one is GM staging: a copy is made instead); a copy from another map, theirs first and never another player\'s; a token bound only by name (theirs or nobody\'s, never another player\'s) linked, here or from afar; the GM\'s dragged token preferred over a copy but never over one already here; a new token when there is none; nothing for a map that is not a play map',
            j(rs) === j(['keep:s1', 'adopt:s4', 'spawn', 'clone:s7', 'spawn', 'link:l2', 'link:l3@far', 'clone:dr', 'keep:s1', 'none', 'none']), j(rs));
        // the legacy name binding (a player without a character): never another player's token (H2), never a linked one, nothing once unbound (H1)
        const g = base(); delete g.chars.c_b; g.players.u_b.charName = 'Mira';
        g.items.m1.whiteboard.push(tok('g1', { charName: 'Mira', ownerId: 'u_x' }), tok('g2', { charName: 'Mira', charId: 'c_a' }));
        g.items.m2.whiteboard.push(tok('g3', { charName: 'Mira', ownerId: 'u_x' }), tok('g4', { charName: 'Mira' }));
        const g2 = base(); delete g2.chars.c_b; g2.players.u_b.charName = 'Mira'; g2.items.m1.whiteboard.push(tok('g5', { charName: 'Mira', hidden: true }), tok('g6', { charName: 'Other', ownerId: 'u_b' }));
        const g3 = base(); delete g3.chars.c_b;
        const lg = [src(g, 'u_b', 'm1'), src(g2, 'u_b', 'm1'), src(g3, 'u_b', 'm1')];
        check('onboarding F0: the old name binding (no character) — a copy of an unowned, unlinked token of that name; never another player\'s token or one linked to a character (H2); a token they hold is kept; nothing without a binding (H1: the GM took it back)',
            j(lg) === j(['clone:g4', 'keep:g6', 'none']), j(lg));
        const pa = base(); pa.players.u_a.charId = 'c_w'; const pg = base(); delete pg.chars.c_b; pg.players.u_b.charName = 'Mira';
        check('onboarding F0: playsAs — the character in play, else the old name binding, else nothing', S.playsAs(pa, 'u_a') === 'Wolf' && S.playsAs(pg, 'u_b') === 'Mira' && S.playsAs(base(), 'u_z') === '');
        const ow = ['u_a', '__proto__', 'constructor', 'bad id!', ''].map(o => cleanChar({ id: 'c_1', name: 'X', ownerId: o, values: {} }, cleanSystem({ v: 1, name: 'O', fields: [], rolls: [] }, { F, gmView: true })).ownerId);
        check('onboarding F0: cleanChar keeps an owner only when it is a profile id (never a prototype key or a stray string)', j(ow) === j(['u_a', '', '', '', '']), j(ow));
        // the critic's fixes: a guess without a record is stable (by name, never "whoever was touched last"); sheets off keeps every owned character
        // in play; an unowned namesake elsewhere or a room roster's token is never captured by name; nothing is made on arrival with sheets off
        const q = base(); q.chars.c_z = { id: 'c_z', name: 'Zed', ownerId: 'u_q', npc: false, values: {}, updated: 99 }; q.chars.c_y = { id: 'c_y', name: 'Abe', ownerId: 'u_q', npc: false, values: {}, updated: 1 };
        const qa = S.activeCharOf(q, 'u_q'); q.chars.c_y.updated = 500; const qb = S.activeCharOf(q, 'u_q');
        const al = base(); al.players.u_a.charId = 'c_a'; al.items.m1.whiteboard.push(tok('a1', { charId: 'c_w', ownerId: 'u_a' }), tok('a2', { charId: 'c_w' }));
        const alOps = S.ownedTokenPlan(al, { all: true }), alKept = S.ownedTokenPlan(al, {});
        const nm = base(); nm.players.u_a.charId = 'c_a'; nm.items.m2.whiteboard.push(tok('x1', { charName: 'Brakka' })); nm.items.m1.whiteboard.push(tok('x2', { charName: 'Brakka', charRef: 'r_npc' }));
        const nmR = [src(nm, 'u_a', 'm1'), src(nm, 'u_a', 'm1', { noSpawn: true }), src(base(), 'u_b', 'm1', { noSpawn: true })];
        const opsMaps = (() => { const x = base(); x.players.u_a.charId = 'c_a'; x.items.m2.whiteboard.push(tok('y1', { charId: 'c_a' })); return S.applyOwnerOps(x, S.ownedTokenPlan(x, {})); })();
        check('onboarding F0 (critic): a guess without a record is by name and stays put when a character is edited; sheets off keeps every owned character in play (no kept stripping); a namesake elsewhere or a room roster\'s token is never captured; nothing is made on arrival with sheets off; applyOwnerOps names the maps it changed (the host sends them)',
            qa.id === 'c_y' && qb.id === 'c_y' && qa.how === 'guess' && alOps.length === 0 && byKey(alKept).indexOf('m1|a1|') >= 0 && j(nmR) === j(['spawn', 'none', 'none']) && j(opsMaps) === j(['m2']), j([qa, qb, alOps, alKept, nmR, opsMaps]));
        // the code review's fixes: a hidden copy nobody holds is never handed out (a shown one wins; a hidden one they hold stays theirs); their own
        // name-bound token here is linked before anything is copied in; name links happen once (not again at a later load)
        const h1 = base(); h1.players.u_a.charId = 'c_a'; h1.items.m1.whiteboard.push(tok('h1', { charId: 'c_a', hidden: true }));
        const h2 = base(); h2.players.u_a.charId = 'c_a'; h2.items.m1.whiteboard.push(tok('h2s', { charId: 'c_a', layer: 'middle' }), tok('h2h', { charId: 'c_a', layer: 'front', hidden: true }));
        const h3 = base(); h3.players.u_a.charId = 'c_a'; h3.items.m1.whiteboard.push(tok('h3s', { charId: 'c_a', ownerId: 'u_a' }), tok('h3h', { charId: 'c_a', ownerId: 'u_a', hidden: true, layer: 'front' }));
        const h4 = base(); h4.players.u_a.charId = 'c_a'; h4.items.m1.whiteboard.push(tok('h4', { charId: 'c_a', ownerId: 'u_a', hidden: true }));
        const hr = [S.ownedTokenPlan(h1, {}), S.ownedTokenPlan(h2, {}), S.ownedTokenPlan(h3, {}), S.ownedTokenPlan(h4, {})].map(byKey);
        const ln = base(); ln.players.u_a.charId = 'c_a'; ln.items.m1.whiteboard.push(tok('ln1', { charName: 'Brakka', ownerId: 'u_a' })); ln.items.m2.whiteboard.push(tok('ln2', { charId: 'c_a', ownerId: 'u_a' }));
        const once = base(); once.players.u_a.charId = 'c_a'; once.items.m1.whiteboard.push(tok('o1', { charId: 'c_a', ownerId: 'u_a' }), tok('o2', { charName: 'Brakka', ownerId: 'u_a' }));
        const onceR = S.migrateBindings(once);
        check('onboarding F0 (review): a hidden copy nobody holds gets no owner and a shown one beats a hidden one on a higher layer; among held copies the shown one stays; a hidden token they hold stays theirs; their name-bound token here is linked before a copy comes in from another map; a later load links nothing by name',
            j(hr) === j([[], ['m1|h2s|u_a'], ['m1|h3h|'], []]) && src(ln, 'u_a', 'm1') === 'link:ln1' && onceR.linked === 0 && !once.items.m1.whiteboard[1].charId, j([hr, src(ln, 'u_a', 'm1'), onceR]));
        const shF = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), ioF = fs.readFileSync(path.join(app, 'scripts', 'io.js'), 'utf8').replace(/\r\n/g, '\n'), inF = fs.readFileSync(path.join(app, 'scripts', 'inspector.js'), 'utf8').replace(/\r\n/g, '\n');
        check('onboarding F0: every owner write goes through giveCharacter (no bindPlayer left; newCharacter is born unassigned); syncOwners is the shared chooser; the loader and undo run the same chooser; Player Owner is disabled on an NPC\'s token and binds by name only a token without a character',
            !/bindPlayer/.test(shF) && /ownerId: '', portrait: o && o\.portrait/.test(shF) && /var maps = applyOwnerOps\(camp, ownedTokenPlan\(camp, \{ keep: keep \|\| '', all: !sheetsOnIn\(camp\) \}\)\);\n\s*if \(maps\.length && n && n\.active && n\.role === 'host' && n\.pushItems/.test(shF)
            && (shF.match(/giveCharacter\(/g) || []).length >= 6 && /SCm\.applyOwnerOps\(c, SCm\.ownedTokenPlan\(c, \{ all: !sheetsOnM \}\)\)/.test(ioF) && /if \(SCm\.migrateBindings && !c\._foreign\)/.test(ioF) && /applyContent\(item, parsed\);\n\n\s*if \(item\.type === 'map' && window\.wpSheets && window\.wpSheets\.syncOwners\) window\.wpSheets\.syncOwners\(camp\);/.test(ioF)
            && /if \(campO && w\.charName && !linkedO\) \{/.test(inF) && /disabled title="An NPC/.test(inF)
            && /var pid = w\.ownerId, playing = activeCharOf\(camp, pid\)\.id, play = !playing;\n\s*giveCharacter\(pid, c\.id, \{ keep: w\.id, play: play, nearTok: w \}\);/.test(shF)
            && /if \(!c\.ownerId && !w\.ownerId\) return;\n\s*giveCharacter\(w\.ownerId \|\| '', c\.id, \{ keep: w\.id \}\);/.test(shF) && (shF.match(/giveTokenChar\(camp, w, c\)/g) || []).length === 3);
    }

    /* ---- Stage 6 HUD frame (HF0): the section options dispatch by exact class token ---- */
    {
        const shH0 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const body = h => { const i = shH0.indexOf(h); return shH0.slice(i, shH0.indexOf('\n}\n', i)); };
        const inp0 = body('function onLayoutInput(t) {'), chg0 = body('function onLayoutChange(t) {');
        check('HUD frame HF0: no section option is matched by substring any more ("sys-sec-pinned" contains "sys-sec-pin": the Above-the-tabs select set a Pin and never pinned); both use the exact class token',
            !/c\.indexOf\('sys-sec-/.test(inp0) && !/c\.indexOf\('sys-sec-/.test(chg0) && /if \(t\.classList\.contains\('sys-sec-pinned'\)\) \{ if \(t\.value\) sec\.pinned = true;/.test(chg0) && /if \(t\.classList\.contains\('sys-sec-pin'\)\) \{ if \(t\.value && PIN_GID\.test\(t\.value\)\) sec\.pin = t\.value;/.test(chg0));
    }

    /* ---- Stage 6 HUD frame (HF1): the HUD as a second layout of the sheet — cleaners, views, the editor's Sheet | HUD switch ---- */
    {
        const crypto = require('crypto'), Hh = o => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
        const fxr = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8'));
        const PRE = {   // pinned at c2f49a7, before the cleaner was factored: [GM view, players' view, players' view re-cleaned, autoLayout of the GM view]
            'look-d20': ['e46258b85f4df4533bd53ee7064205bd18d293839f2cf6df405b5344e6df2efb', '78dcf72d18152dfad687a5a1a3d87a38fbaa393c3418fce820b4a04389339274', '78dcf72d18152dfad687a5a1a3d87a38fbaa393c3418fce820b4a04389339274', 'd3e733be3aaf6440c1730d2a7493f341ae36fc60ce538982ef3c0e8c76301a1f'],
            'look-3d6': ['26286986661a2a2ca236db06a3327b4196e750f6a4923fc50f97fd06932eb408', '26286986661a2a2ca236db06a3327b4196e750f6a4923fc50f97fd06932eb408', '26286986661a2a2ca236db06a3327b4196e750f6a4923fc50f97fd06932eb408', '800aebd280bb7aacdb6a84b6c8b6888c2c14edd1bb0ff8accd49ff889e483cb7']
        };
        const now = Object.keys(PRE).map(n => { const raw = fxr(n), gm = cleanSystem(raw, { F, gmView: true }), pv = cleanSystem(raw, { F, gmView: false }); return [Hh(gm), Hh(pv), Hh(cleanSystem(pv, { F, gmView: false })), Hh(autoLayout(gm))]; });
        check('HUD frame HF1: factoring the sheet cleaner is behaviour-preserving — both look fixtures clean byte-for-byte as before (GM view, players\' view, a re-clean, the automatic layout)', j(now) === j(Object.keys(PRE).map(n => PRE[n])), j(now));

        const hD = fxr('hud-d20'), h3 = fxr('hud-3d6'), hB = fxr('hud-bare');
        const gD = cleanSystem(hD, { F, gmView: true }), pD = cleanSystem(hD, { F, gmView: false }), g3 = cleanSystem(h3, { F, gmView: true }), p3 = cleanSystem(h3, { F, gmView: false }), gB = cleanSystem(hB, { F, gmView: true });
        const base = cleanSystem(fxr('look-d20'), { F, gmView: true });
        const withHud = h => { const s = JSON.parse(JSON.stringify(fxr('look-d20'))); s.sheet.hud = h; return s; };
        const cl = (h, gv) => cleanSystem(withHud(h), { F, gmView: gv !== false }).sheet;
        check('HUD frame HF1: absent — no hud key, the sheet\'s keys in their order; {} and a HUD of junk leave no key either',
            !('hud' in base.sheet) && j(Object.keys(base.sheet)) === j(['tabs', 'sections', 'band', 'bandGroups', 'identity', 'ledger', 'look'])
            && !('hud' in cl({})) && !('hud' in cl({ band: [{ id: 'f_nope' }], ledger: 'x', sections: 'y', tabs: [{ id: 'bad id' }], title: '   ' })) && !('hud' in cl([1, 2])) && !('hud' in cl('hud')));
        check('HUD frame HF1: the GM view keeps a HUD with only a title, only tabs or an empty section (nothing set is lost on Save); the players\' view drops each',
            j(cl({ title: 'Combat HUD' }).hud) === j({ title: 'Combat HUD', tabs: [], sections: [] }) && cl({ tabs: [{ id: 't_x', label: 'X' }] }).hud.tabs.length === 1 && cl({ sections: [{ id: 's_e', title: 'Empty', fields: [] }] }).hud.sections.length === 1
            && !('hud' in cl({ title: 'Combat HUD' }, false)) && !('hud' in cl({ tabs: [{ id: 't_x', label: 'X' }] }, false)) && !('hud' in cl({ sections: [{ id: 's_e', title: 'Empty', fields: [] }] }, false)));
        const secOf = (sh, id) => sh.sections.find(s => s.id === id), ids = s => s.fields.map(p => p.id || p.roll || p.kind);
        const tabX = cl({ tabs: [{ id: 't_hx', label: 'X' }], sections: [{ id: 's_a', title: 'A', tab: 't_main', fields: [{ id: 'f_str' }] }, { id: 's_b', title: 'B', tab: 't_hx', fields: [{ id: 'f_dex' }] }] });
        const many = []; for (let i = 0; i < 40; i++) many.push({ id: 's_m' + i, title: 'M', fields: Array.from({ length: 10 }, () => ({ id: 'f_str' })).concat([{ kind: 'heading', text: 'h' }, { kind: 'divider' }, { kind: 'heading', text: 'h' }, { kind: 'divider' }, { kind: 'heading', text: 'h' }, { kind: 'divider' }, { kind: 'heading', text: 'h' }, { kind: 'divider' }]) });
        const capH = cl({ sections: many }), capCount = capH.hud.sections.reduce((n, s) => n + s.fields.length, 0);
        check('HUD frame HF1: once per layout — f_st and f_hp sit on the sheet AND in the HUD; within the HUD a second f_sl1 is dropped; a HUD section\'s tab resolves against the HUD\'s own tabs only; the placement cap is counted per layout',
            ids(secOf(g3.sheet, 's_attr')).includes('f_st') && ids(secOf(g3.sheet.hud, 's_hattr')).includes('f_st')
            && ids(secOf(gD.sheet, 's_combat')).includes('f_hp') && ids(secOf(gD.sheet.hud, 's_hstat')).includes('f_hp')
            && j(ids(secOf(gD.sheet.hud, 's_hstat'))) === j(['f_hp', 'f_fx', 'f_dsv', 'pin']) && j(ids(secOf(gD.sheet.hud, 's_hslots'))) === j(['f_sl1', 'f_sl2', 'f_sl3'])
            && !('tab' in secOf(tabX.hud, 's_a')) && secOf(tabX.hud, 's_b').tab === 't_hx'
            && capCount === LIMITS.placements && gD.sheet.sections.reduce((n, s) => n + s.fields.length, 0) > 0, j({ capCount, a: secOf(tabX.hud, 's_a') }));
        const pinPl = s => s.fields.filter(p => p.kind === 'pin').map(p => p.g);
        const gmOnly = cl({ band: [{ id: 'f_gmfig' }], sections: [{ id: 's_g', title: 'G', fields: [{ id: 'f_gmfig' }] }] }, false);
        const pagesSys = o => { const s = withHud({ sections: [{ id: 's_l', title: 'L', fields: [{ kind: 'link', page: 'p_open', text: 'Open' }, { kind: 'link', page: 'p_secret', text: 'Secret' }, { id: 'f_str' }] }] }); return cleanSystem(s, Object.assign({ F, gmView: false }, o)); };
        const pg = pagesSys({ pages: ['p_open'] });
        const re1 = cleanSystem(pg, { F, gmView: false, pages: ['p_open'] }), re2 = cleanSystem(pg, { F, gmView: false });
        const pDb = pD.sheet.hud.band.map(q => q.id || q.roll), pDg = pD.sheet.bandGroups.map(g => g.id);
        check('HUD frame HF1: the players\' view — the GM-only figure leaves the HUD band and its GM section; g_gm is pruned; g_hud (on the HUD band only, pinned only in the HUD) survives with its Pin; g_slots and its section Pin survive; a HUD of GM-only content is dropped; a link to a page they cannot read is dropped; idempotent under both client re-cleans',
            !pDb.includes('f_gmfig') && j(ids(secOf(pD.sheet.hud, 's_hgm'))) === j([]) && !pDg.includes('g_gm') && pDg.includes('g_hud') && j(pinPl(secOf(pD.sheet.hud, 's_hstat'))) === j(['g_hud'])
            && pDg.includes('g_slots') && secOf(pD.sheet.hud, 's_hslots').pin === 'g_slots' && !('hud' in gmOnly)
            && j(secOf(pg.sheet.hud, 's_l').fields.map(p => p.page || p.id)) === j(['p_open', 'f_str']) && j(re1) === j(pg) && j(re2) === j(pg)
            && j(cleanSystem(pD, { F, gmView: false })) === j(pD) && j(cleanSystem(p3, { F, gmView: false })) === j(p3), j({ pDb, pDg }));
        const before = j(gD), hv = S.hudView(gD), after = j(gD);
        check('HUD frame HF1: hudView — the HUD\'s layout in the sheet\'s place; fields and rolls shared by reference; the input untouched; the look without portrait and sticky but with its palette; the groups shared',
            before === after && hv.fields === gD.fields && hv.rolls === gD.rolls && hv.sheet.sections === gD.sheet.hud.sections && hv.sheet.band === gD.sheet.hud.band && hv.sheet.ledger === gD.sheet.hud.ledger && hv.sheet.bandGroups === gD.sheet.bandGroups
            && !('portrait' in hv.sheet.look) && !('sticky' in hv.sheet.look) && j(hv.sheet.look.palette) === j(gD.sheet.look.palette) && hv.sheet.look.accent === gD.sheet.look.accent && gD.sheet.look.portrait === true && !('identity' in hv.sheet));
        const pT = S.pinTargets(gD.sheet.sections), pA = S.pinTargetsAll(gD.sheet), bandG = sh => (sh.band || []).filter(q => q.id === 'f_hp').map(q => q.g || '');
        check('HUD frame HF1: hudHasContent / pinTargetsAll — no HUD is null and false; the bare system (fields only) has one; the sheet\'s Pins alone lack g_hud and both layouts\' have it; in the 3d6 HUD f_hp is ungrouped where the sheet\'s band groups it',
            S.hudView(base) === null && S.hudHasContent(base) === false && S.hudHasContent(null) === false && S.hudHasContent(gB) === true && S.hudHasContent(gD) === true
            && pT.g_hud !== 1 && pA.g_hud === 1 && pA.g_slots === 1 && pA.g_gm === 1 && Object.getPrototypeOf(pA) === null
            && j(bandG(g3.sheet)) === j(['g_pools']) && j(bandG(g3.sheet.hud)) === j(['']));
        const heSys = withHud({ ledger: [{ id: 'f_gold' }, { id: 'f_prof' }], sections: [{ id: 's_x', title: 'Wallet', fields: [{ id: 'f_gold' }] }] });
        const heG = cleanSystem(heSys, { F, gmView: true }), heH = S.headerEdits(heG, heG.sheet.hud), heV = validateSystem(heG, F);
        const errsN = [gD, g3, gB].map(s => validateSystem(s, F).errors.length);
        check('HUD frame HF1: headerEdits(sys, layout) — the HUD\'s plain ledger number is edited in its header (a formula is not); no argument still means the sheet; the duplicate warning names the HUD; no "no Pin" warning for g_hud; the three HUD fixtures validate with no errors',
            j(Object.keys(heH)) === j(['f_gold']) && Object.keys(S.headerEdits(heG)).indexOf('f_gold') < 0 && Object.keys(S.headerEdits(null)).length === 0 && Object.keys(S.headerEdits({ fields: heG.fields }, null)).length === 0
            && heV.warnings.some(w => w.id === 'f_gold' && /placed again in the HUD\u2019s Wallet\./.test(w.message))
            && !validateSystem(gD, F).warnings.some(w => w.id === 'g_hud') && j(errsN) === j([0, 0, 0]), j({ heH: Object.keys(heH), errsN, w: heV.warnings }));

        // the editor and the drawing (source checks; the live preview is verified in the browser)
        const shH1 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const bodyH = h => { const i = shH1.indexOf(h); return i < 0 ? '' : shH1.slice(i, shH1.indexOf('\n}\n', i)); };
        const clickH = bodyH('function onLayoutClick(b) {'), inputH = bodyH('function onLayoutInput(t) {'), layH = bodyH('function renderLayout() {'), prevH = bodyH('function renderPreview() {');
        const iHa = clickH.indexOf("if (b.id === 'sysLayoutAuto' && layoutView === 'hud')"), iHc = clickH.indexOf("if (b.id === 'sysLayoutClear' && layoutView === 'hud')"), iSa = clickH.indexOf("if (b.id === 'sysLayoutAuto') {"), iSc = clickH.indexOf("if (b.id === 'sysLayoutClear') {");
        check('HUD frame HF1: buildSections draws the HUD without an automatic-layout fallback; a Pin in either view drives the band (vctx.targets, else both layouts); the sheet\'s regexes and counts still hold',
            /var sheet = \(hudV \|\| \(sys\.sheet && sys\.sheet\.sections && sys\.sheet\.sections\.length\)\) \? sys\.sheet : autoLayout\(sys\);/.test(shH1) && /targets: \(vctx && vctx\.targets\) \|\| pinTargetsAll\(sys\.sheet\), vctx: vctx,/.test(shH1)
            && (shH1.match(/_fxLive = false; try \{ buildSections\(/g) || []).length === 2 && (shH1.match(/fieldNode\([^)]*, gm, own, sys(, all\.vars, pl)?\)/g) || []).length === 2
            && /var secKey = \(hudV \? 'h:' : ''\) \+ sec\.id;/.test(shH1) && /if \(\(_fxForm\.view \|\| 'sheet'\) === fxV\)/.test(shH1)
            && /import \{[^}]*pinTargetsAll, hudView, hudHasContent[, A-Za-z]* \} from '\.\/systemcore\.js';/.test(shH1));
        check('HUD frame HF1: the Layout tab — layoutRoot routes the sections, the tabs and the band / ledger boxes; the switch never dirties the draft; the HUD\'s Copy / Remove come before the sheet\'s Auto / Clear, which keep the HUD; deleteGroup cleans both layouts; the HUD title is handled before the section lookup; the Identity box is the sheet\'s alone; the preview draws hudView',
            /function layoutSections\(\) \{ var r = layoutRoot\(\);/.test(shH1) && /function layoutTabs\(\) \{ var r = layoutRoot\(\);/.test(shH1) && /var lroot = layoutRoot\(\), list = Array\.isArray\(lroot\[cfg\.key\]\)/.test(layH) && !/draft\.sheet\[cfg\.key\]/.test(layH)
            && /var draft = null, dirty = false, tab = 'fields', errorsById = \{\}, warningsById = \{\}, layoutView = 'sheet';/.test(shH1) && /tab = which \|\| 'fields'; layoutView = 'sheet';/.test(shH1)
            && /if \(b\.closest && b\.closest\('#sysLayoutView'\)[^\n]*renderLayout\(\); \} return true; \}/.test(clickH) && !/if \(b\.closest && b\.closest\('#sysLayoutView'\)[^\n]*markDirty/.test(clickH)
            && iHa > 0 && iHc > iHa && iSa > iHc && iSc > iSa && /if \(keepHud\) draft\.sheet\.hud = keepHud;/.test(clickH) && /if \(keepHud\) \{ draft\.sheet\.hud = keepHud;/.test(clickH) && /the Sheet look box and the HUD are kept/.test(clickH)
            && /var hd = draft\.sheet\.hud; if \(hd && typeof hd === 'object'\)/.test(layH) && /var targetsG = pinTargetsAll\(draft\.sheet\);/.test(layH)
            && inputH.indexOf("contains('sys-hud-title')") > 0 && inputH.indexOf("contains('sys-hud-title')") < inputH.indexOf('if (!lsec)') && /if \(!hudOn\) pinBox\(\{ key: 'identity'/.test(layH)
            && /var pv = layoutView === 'hud' \? hudView\(clean\) : clean;/.test(prevH) && /view: layoutView, preview: true, targets: pinTargetsAll\(clean\.sheet\)/.test(prevH) && /box\.classList\.toggle\('sys-layout-preview-hud', layoutView === 'hud'\)/.test(prevH), j({ iHa, iHc, iSa, iSc }));
        const htmlH1 = fs.readFileSync(path.join(app, 'index.html'), 'utf8'), cssH1 = fs.readFileSync(path.join(app, 'style.css'), 'utf8'), tutH1 = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8');
        const iBlk = cssH1.indexOf('/* ---- Stage 6 HUD frame:'), iPort = cssH1.indexOf('#sheetPanel.sheet-has-headportrait #sheetTitle');
        check('HUD frame HF1: the Sheet | HUD switch leads the Layout toolbar; the note is addressable; the CSS lives in one block after the look fold\'s; the tour and Help name the switch',
            /<div class="sys-toolbar"><span id="sysLayoutView" class="sys-seg"[^>]*><button class="tool ghost sys-btn on" data-view="sheet" aria-pressed="true">Sheet<\/button><button class="tool ghost sys-btn" data-view="hud" aria-pressed="false">HUD<\/button><\/span><button class="tool" id="sysAddSection"/.test(htmlH1) && /<span class="sys-note" id="sysLayoutNote">/.test(htmlH1)
            && iPort > 0 && iBlk > iPort && !/\/\* Stage 6 look fold \(L/.test(cssH1.slice(iBlk)) && /\.sys-seg \{/.test(cssH1.slice(iBlk)) && /\.sys-layout-preview-hud \{ max-width: 470px; \}/.test(cssH1.slice(iBlk))
            && /The <b>Sheet \| HUD<\/b> switch at the top lays out the character&rsquo;s HUD window the same way\./.test(tutH1) && /The <b>Sheet \| HUD<\/b> switch at the top of the tab lays out a second view, the <b>HUD<\/b>/.test(htmlH1));
    }

    /* ---- Stage 6 HUD frame (HF2a): the HUD window — one per character, drawn from sys.sheet.hud by the sheet's own renderer ---- */
    {
        const sh2 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), html2 = fs.readFileSync(path.join(app, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
        const css2 = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, '\n'), tut2 = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8').replace(/\r\n/g, '\n'), wb2 = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8');
        const hudSlice = sh2.slice(sh2.indexOf('// [systemcheck:hud-start]'), sh2.indexOf('// [systemcheck:hud-end]'));
        const tpl = (html2.match(/<template id="hudTpl">([\s\S]*?)<\/template>/) || [])[1] || '';
        const iSheet = html2.indexOf('<div id="sheetPanel"'), iLayer = html2.indexOf('<div id="hudLayer"></div>'), iDoc = html2.indexOf('<div id="docPanel"');
        check('HUD frame HF2a: the markup — #hudLayer and the template sit between the sheet panel and the doc panel (the handbook still lands on top by DOM order); the template holds the head, body, foot and grip and no id; the sheet head\'s HUD button starts hidden',
            ['hud-panel', 'hud-head', 'hud-portrait', 'hud-name', 'hud-sub', 'hud-sheet', 'hud-close', 'hud-body', 'hud-foot', 'hud-resize'].every(c => new RegExp('class="[^"]*\\b' + c + '\\b').test(tpl)) && !/\sid=/.test(tpl)
            && iSheet > 0 && iLayer > iSheet && html2.indexOf('<template id="hudTpl">') > iLayer && iDoc > html2.indexOf('<template id="hudTpl">')
            && /<button class="tool ghost notepad-btn" id="sheetHud" title="Open the HUD" style="display:none;">/.test(html2), j({ iSheet, iLayer, iDoc }));
        check('HUD frame HF2a: the HUD slice writes no markup; one window per character (opening it again brings it forward); openHud gates on the character id, canOpen and a HUD with content; a tab is checked before it reaches the body; the panel\'s character id is checked before it is stored; the place and size are one record',
            hudSlice.length > 3000 && !/innerHTML|outerHTML|insertAdjacentHTML/.test(hudSlice)
            && /function openHud\(charId, opts\) \{\n    if \(!HUD_CID\.test\(String\(charId\)\)\) return;\n    if \(!canOpen\(charId\)\) \{[^\n]*\n    if \(!hudHasContent\(systemOf\(getActiveCampaign\(\)\)\)\) \{/.test(hudSlice)
            && /if \(opts && typeof opts\.tab === 'string' && HUD_TAB\.test\(opts\.tab\)\) v\.body\.dataset\.wpTab = opts\.tab;/.test(hudSlice) && /HUD_TAB = \/\^t_\[A-Za-z0-9_\]\{1,24\}\$\//.test(hudSlice)
            && /!HUD_CID\.test\(String\(charId\)\)\) return null;\n    var p = tpl\.content\.firstElementChild\.cloneNode\(true\); p\.dataset\.cid = charId;/.test(hudSlice)
            && /var v = huds\[charId\];\n    if \(!v\) \{/.test(hudSlice) && (hudSlice.match(/setPref\('wp_hudPanel'/g) || []).length === 2 && !/wp_sheetPanel/.test(hudSlice)
            && /var sys = hudView\(full\)/.test(hudSlice) && /\{ campId: camp\.id, view: 'hud', preview: false, targets: pinTargetsAll\(full\.sheet\) \}/.test(hudSlice) && /v\.name\.textContent = c\.name; v\.sub\.textContent = /.test(hudSlice));
        // raisePanel / resetZ / floatPanels, run for real
        const zSrc = sh2.slice(sh2.indexOf('var _zTop = 9000;'), sh2.indexOf('// Where a handbook page opens beside'));
        const mkP = n => ({ n, style: { zIndex: '' } }), sp = mkP('sheet'), dp = mkP('doc'), h1 = mkP('hud1'), h2 = mkP('hud2'), hudsZ = Object.create(null);
        const Z = new Function('ui', 'huds', zSrc + '\nreturn { raisePanel: raisePanel, resetZ: resetZ, floatPanels: floatPanels, top: function() { return _zTop; } };')(id => id === 'sheetPanel' ? sp : id === 'docPanel' ? dp : null, hudsZ);
        Z.raisePanel(sp); const noHud = sp.style.zIndex === '' && Z.top() === 9000;
        hudsZ.c_a = { panel: h1 }; Z.raisePanel(sp); Z.raisePanel(h1); Z.raisePanel(dp);
        const order0 = [sp, h1, dp].sort((a, b) => +a.style.zIndex - +b.style.zIndex).map(p => p.n).join(',');
        let maxZ = 0, topOk = true; const seq = [sp, h1, dp];
        for (let k = 0; k < 1000; k++) { const p = seq[k % 3]; Z.raisePanel(p); maxZ = Math.max(maxZ, +sp.style.zIndex, +dp.style.zIndex, +h1.style.zIndex); if (+p.style.zIndex !== Math.max(+sp.style.zIndex, +dp.style.zIndex, +h1.style.zIndex)) topOk = false; }
        Z.raisePanel(dp); Z.raisePanel(sp); const before = [h1, dp, sp].map(p => +p.style.zIndex); for (let k = 0; k < 500; k++) Z.raisePanel(k % 2 ? h1 : h1 === h1 ? h1 : h1);
        const keptOrder = +dp.style.zIndex < +sp.style.zIndex;   // raising only the HUD, renumbering keeps the others' order (doc under sheet)
        hudsZ.c_b = { panel: h2 }; const fl = Z.floatPanels().map(p => p.n).join(',');
        Z.resetZ(); const reset = sp.style.zIndex === '' && dp.style.zIndex === '' && Z.top() === 9000;
        check('HUD frame HF2a: click-to-raise (the owner\'s Q5) — a no-op with no HUD open; with one, the raised panel is on top, 1000 raises never pass 9400, renumbering keeps the others\' order; every HUD is a floating panel; closing the last HUD puts back today\'s stacking',
            noHud && order0 === 'sheet,hud1,doc' && topOk && maxZ <= 9400 && maxZ > 9000 && keptOrder && fl === 'sheet,doc,hud1,hud2' && reset && before.length === 3, j({ noHud, order0, topOk, maxZ, keptOrder, fl, reset }));
        // renderViews, run for real
        const rvSrc = sh2.slice(sh2.indexOf('function renderViews(charId, skip) {'), sh2.indexOf('// A token turned (tokenTurned)'));
        const painted = [], sb = { n: 'sheetBody' }, hb1 = { n: 'b1' }, hb2 = { n: 'b2' }, hudsV = Object.create(null); hudsV.c_a = { body: hb1 }; hudsV.c_b = { body: hb2 };
        const RV = so => new Function('ui', 'huds', 'sheetOpen', 'renderSheet', 'renderHud', rvSrc + '\nreturn renderViews;')(() => sb, hudsV, so, () => painted.push('sheet'), id => painted.push(id));
        const run = (so, ...a) => { painted.length = 0; RV(so)(...a); return painted.join(','); };
        const rv = [run('c_a', null), run('c_a'), run('c_b', 'c_a'), run('c_a', 'c_a'), run('c_a', 'c_a', sb), run('c_a', null, hb2), run(null, null)];
        check('HUD frame HF2a: renderViews — null or nothing paints every view; a character paints its sheet and its HUD only; the body that just painted itself is skipped',
            j(rv) === j(['sheet,c_a,c_b', 'sheet,c_a,c_b', 'c_a', 'sheet,c_a', 'c_a', 'sheet,c_a', 'c_a,c_b']), j(rv));
        const body = h => { const i = sh2.indexOf(h); return i < 0 ? '' : sh2.slice(i, sh2.indexOf('\n}\n', i)); };
        const commits = ['function commit(c, f, value) {', 'function commitEffect(c, f, q) {', 'function commitItem(c, f, q) {'].map(body);
        check('HUD frame HF2a: one refresh path — no sheetOpen guard wraps a repaint any more; a change, an Undo expiring, a result, a save, a pin in another window, the feature and the campaign reach the HUDs with or without a sheet; a lost or deleted character closes its HUD (one notice)',
            !/sheetOpen[^;\n]{0,40}\)\s*(renderViews|renderSheet)\(/.test(sh2.replace(/function renderViews[\s\S]*?\n\}\n/, '')) && commits.every(b => b.length > 100 && !/renderSheet\(\)/.test(b) && /renderViews\(c\.id\)/.test(b))
            && /if \(window\.appRender\) window\.appRender\(\);\n    renderViews\(c\.id\);/.test(body('function afterCharChange(')) && /delete _undo\[k\]; renderViews\(c\.id\);/.test(sh2)
            && /'That value was not accepted\.'\); renderViews\(null\); \}/.test(sh2) && /renderAll\(\); renderViews\(null\);/.test(sh2) && /if \(!e \|\| e\.key !== PIN_KEY\) return; renderViews\(null\);/.test(sh2)
            && /if \(!featureOn\(\)\) \{ if \(sheetOpen\) closeSheet\(\); closeHuds\(\); \}/.test(sh2) && /if \(_lastCamp !== null && id !== _lastCamp\) \{ if \(sheetOpen\) closeSheet\(\); closeHuds\(\); \}/.test(sh2)
            && /if \(sheetOpen === id\) closeSheet\(\);\n    closeHud\(id\);/.test(sh2) && /if \(typeof id === 'string' && huds\[id\]\) \{ closeHud\(id\); shown = true; \}/.test(sh2)
            && /if \(isClient\(\)\) Object\.keys\(huds\)\.forEach\(function\(hid\) \{[^\n]*closeHud\(hid\); if \(!lost\[hid\]\)/.test(sh2) && /lost\[gone\.id\] = 1; closeSheet\(\);/.test(sh2)
            && /if \(!\(ctx\.vctx && ctx\.vctx\.preview\)\) renderViews\(ctx\.c\.id, ctx\.body\);/.test(sh2) && /var hp = tb\.closest\('\.hud-panel'\); if \(hp\) closeHud\(hp\.dataset\.cid\); else closeSheet\(\);/.test(sh2)
            && /Object\.keys\(huds\)\.forEach\(function\(id\) \{ syncFramePad\(huds\[id\]\.body\); \}\)/.test(sh2) && /if \(!sheetOpen && !Object\.keys\(huds\)\.length\) return false;/.test(sh2) && /sh\.sections\.concat\(sh\.hud && Array\.isArray\(sh\.hud\.sections\) \? sh\.hud\.sections : \[\]\)/.test(sh2));
        const tt = body('function tokenTurned(tokId, final) {'), rf = body('function redrawForFacing(v) {');
        check('HUD frame HF2a: a turn reaches every HUD first, whatever the sheet does; the dial and stance swap is one function for both; a HUD\'s redraw waits for its own focus and repaints the HUD, with its own timer',
            /^function tokenTurned\(tokId, final\) \{\n    try \{ Object\.keys\(huds\)\.forEach\(function\(id\) \{ turnView\(huds\[id\], final\); \}\); \} catch \(e\) \{\}[^\n]*\n    try \{\n        if \(!sheetOpen\) return;/.test(tt) && /swapTokenControls\(p, c, camp\);/.test(tt) && /swapTokenControls\(v\.panel, c, camp\);/.test(hudSlice)
            && sh2.indexOf('function swapTokenControls(') > sh2.indexOf('function facingNode(') && sh2.indexOf('function swapTokenControls(') < sh2.indexOf('function tokenTurned(')
            && /var body = v \? v\.body : ui\('sheetBody'\)/.test(rf) && /setTimeout\(function\(\) \{ redrawForFacing\(v\); \}, 0\)/.test(rf) && /if \(v\) \{ if \(huds\[v\.charId\] === v\) renderHud\(v\.charId\); \} else renderSheet\(\);/.test(rf) && /if \(v\) v\.redraw = tmr; else _dialRedraw = tmr;/.test(rf));
        check('HUD frame HF2a: the entries and exports — the sheet head\'s HUD button shows only for a HUD they can open; the sheet and the doc panel come forward when clicked or shown; a page opens beside the view in front; window.wpSheets carries openHud/closeHud/closeHuds/hudFor and renderSheet repaints every view; a click inside a HUD keeps the map\'s selection',
            /var hOn = hudHasContent\(sys\) && canOpen\(c\.id\); hb\.style\.display = hOn \? '' : 'none';/.test(sh2) && /if \(hdB\) hdB\.addEventListener\('click', function\(\) \{ if \(sheetOpen\) openHud\(sheetOpen\); \}\);/.test(sh2)
            && /p\.addEventListener\('pointerdown', function\(\) \{ raisePanel\(p\); \}, true\);/.test(sh2) && /if \(now && !dpShown\) raisePanel\(dpn\);/.test(sh2) && /placeSheet\(\); raisePanel\(p\); renderSheet\(\);/.test(sh2)
            && /var dp = ui\('docPanel'\), sp = frontView\(\);/.test(sh2) && /\n    raisePanel\(dp\);/.test(sh2)
            && /openHud: openHud, closeHud: closeHud, closeHuds: closeHuds, hudFor: hudFor,/.test(sh2) && /renderSheet: renderViews,/.test(sh2) && !/renderSheet: renderSheet/.test(sh2)
            && /\[id\$="Modal"\], #sheetPanel, \.hud-panel, #soundPanel,/.test(wb2));
        const iBlk2 = css2.indexOf('/* ---- Stage 6 HUD frame:'), blk = css2.slice(iBlk2);
        check('HUD frame HF2a: the window\'s CSS lives in the HUD block (after the look fold\'s): the panel, the grip strip, the twins of the sheet panel\'s field rules, the palette on its head, GM-only fields hidden from players as on the sheet; the glyph files exist',
            iBlk2 > 0 && /\.hud-panel \{ position: fixed;[^}]*width: 470px;[^}]*height: min\(760px, calc\(100vh - 140px\)\);/.test(blk) && /\.hud-foot:empty \{ display: none; \}/.test(blk) && /body\.net-client \.hud-panel \.sheet-gm \{ display: none; \}/.test(blk)
            && /\.hud-panel input\.field, \.hud-panel select\.field, \.hud-panel textarea\.field \{ padding: 3px 6px; font-size: 12\.5px; \}/.test(blk) && /\.hud-panel\.sheet-paletted \.hud-name \{ color: var\(--sheet-primary\); \}/.test(blk)
            && ['user', 'wave-square'].every(g => fs.existsSync(path.join(app, 'assets', 'icons', 'fa', 'solid', g + '.svg')) && blk.indexOf('assets/icons/fa/solid/' + g + '.svg') > 0) && !/Stage 6 look fold \(L/.test(blk));
        // the tour: its seed, run for real on an older campaign, and the step that opens its own target
        const fnT = name => { const i = tut2.indexOf('function ' + name + '('); let d = 0; const k = tut2.indexOf('{', i); for (let p = k; p < tut2.length; p++) { if (tut2[p] === '{') d++; else if (tut2[p] === '}') { d--; if (d === 0) return tut2.slice(i, p + 1); } } return ''; };
        const T = new Function(['tutorialEffects', 'tutorialHud', 'tutorialSystem', 'tutorialCharacter', 'ensureTutorialSheet'].map(fnT).join('\n') + '\nvar TUTORIAL_ART_URL = "/x/";\nreturn { sys: tutorialSystem, hud: tutorialHud, ch: tutorialCharacter, ensure: ensureTutorialSheet };')();
        const older = { system: T.sys(), chars: { c_tut_bren: T.ch('/x/') }, items: {} }; delete older.system.sheet.hud;
        const pre = JSON.parse(JSON.stringify(older)), ch1 = T.ensure(older), post = JSON.parse(JSON.stringify(older)); delete post.system.sheet.hud; delete post.tutorialSeed;   // HF4a: the one-shot seed marker, checked below
        const built = { system: T.sys(), chars: {}, items: {} }; delete built.system.sheet.hud; built.system.sheet.sections = [{ id: 's_mine', title: 'Mine', fields: [] }]; T.ensure(built);
        const again = T.ensure(older);
        check('HUD frame HF2a: the tour\'s HUD seed — an older Tutorial (band present, no HUD, no sections) gains exactly the HUD and nothing else, once; a layout someone built there is left alone; the seed validates',
            ch1 === true && j(older.system.sheet.hud) === j(T.hud()) && j(post) === j(pre) && older.tutorialSeed === 2 && again === false && !('hud' in built.system.sheet)
            && validateSystem(cleanSystem(T.sys(), { F, gmView: true }), F).errors.length === 0 && S.hudHasContent(cleanSystem(T.sys(), { F, gmView: false })), j({ ch1, again }));
        check('HUD frame HF2a: the tour step opens its own target (show() does not skip it for a missing target before its setup runs); every other step starts with no HUD floating, and ending the tour closes them',
            /STEPS\[i\]\.target && !STEPS\[i\]\.opens && !document\.querySelector\(STEPS\[i\]\.target\)/.test(tut2) && /if \(!step\.opens && window\.wpSheets && window\.wpSheets\.closeHuds\) window\.wpSheets\.closeHuds\(\);[^\n]*\n    try \{ if \(step\.before\) step\.before\(\); \}/.test(tut2)
            && /\{ target: '#hudLayer \.hud-panel', opens: true, title: 'The HUD',/.test(tut2) && /window\.wpSheets\.openSheet\('c_tut_bren'\); if \(window\.wpSheets\.openHud\) window\.wpSheets\.openHud\('c_tut_bren'\);/.test(tut2)
            && /window\.wpSheets\.closeSheet\(\); if \(window\.wpSheets\.closeHuds\) window\.wpSheets\.closeHuds\(\); window\.wpSheets\.close\(true\);/.test(tut2)
            && tut2.indexOf("{ target: '#hudLayer .hud-panel'") > tut2.indexOf("{ target: '#sheetPanel', title: 'A character sheet'") && tut2.indexOf("{ target: '#hudLayer .hud-panel'") < tut2.indexOf("target: '#netBtn'")
            && /<li><b>The HUD\.<\/b> When the saved system has a HUD/.test(html2));
    }

    /* ---- Stage 6 HUD frame (HF2b): the HUD's entry points and the HUD button placement ---- */
    {
        const fx2 = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8'));
        const GV = { F, gmView: true }, PV = { F, gmView: false };
        const hubtn = (sh, sid) => { const s = (sh.sections || []).find(x => x.id === sid); return s ? s.fields.filter(q => q.kind === 'hud') : null; };
        const gD2 = cleanSystem(fx2('hud-d20'), GV), pD2 = cleanSystem(fx2('hud-d20'), PV), g32 = cleanSystem(fx2('hud-3d6'), GV), p32 = cleanSystem(fx2('hud-3d6'), PV);
        const mk = (btn, hud, gmView) => { const s = fx2('look-d20'); s.sheet.sections.find(x => x.id === 's_combat').fields.push(btn); if (hud !== undefined) s.sheet.hud = hud; return cleanSystem(s, gmView === false ? PV : GV); };
        const aHud = { tabs: [{ id: 't_ha', label: 'A' }, { id: 't_hb', label: 'B' }], sections: [{ id: 's_h1', title: 'H', tab: 't_ha', fields: [{ id: 'f_str' }, { kind: 'hud', tab: 't_ha', text: 'Nested' }] }] };
        const tabOf = t => hubtn(mk({ kind: 'hud', tab: t, text: 'Go' }, aHud).sheet, 's_combat');
        const ctl = hubtn(mk({ kind: 'hud', text: 'Open\u0007the\u001bHUD' + 'x'.repeat(200) }, aHud).sheet, 's_combat')[0];
        const pvIdem = [pD2, p32].every(v => j(cleanSystem(v, PV)) === j(v) && j(cleanSystem(v, Object.assign({ pages: [] }, PV))) === j(v));
        check('HUD frame HF2b: the HUD button placement — kept on the sheet with its tab and words in both views of both HUD systems; a tab that is not one of the HUD\'s is dropped (the button stays); its words lose control characters and are capped; dropped inside the HUD\'s own layout, with no HUD, and from a players\' view whose HUD did not survive (kept for the GM with a title-only HUD); a players\' view re-cleans to itself',
            j(hubtn(gD2.sheet, 's_combat')) === j([{ kind: 'hud', w: 1, text: 'Conditions', tab: 't_hstat' }]) && j(hubtn(pD2.sheet, 's_combat')) === j(hubtn(gD2.sheet, 's_combat'))
            && j(hubtn(g32.sheet, 's_combat')) === j([{ kind: 'hud', w: 1, text: 'Active Effects', tab: 't_hst' }]) && j(hubtn(p32.sheet, 's_combat')) === j(hubtn(g32.sheet, 's_combat'))
            && j(tabOf('t_hb')) === j([{ kind: 'hud', w: 1, text: 'Go', tab: 't_hb' }]) && ['t_main', '__proto__', 'constructor', 'toString', 5, null].every(t => j(tabOf(t)) === j([{ kind: 'hud', w: 1, text: 'Go' }]))
            && !!ctl && !/[\u0000-\u001f]/.test(ctl.text) && ctl.text.length <= LIMITS.label
            && j(hubtn(mk({ kind: 'hud' }, aHud).sheet.hud, 's_h1')) === j([]) && j(hubtn(mk({ kind: 'hud' }).sheet, 's_combat')) === j([])
            && j(hubtn(mk({ kind: 'hud', text: 'T' }, { title: 'Only a title' }).sheet, 's_combat')) === j([{ kind: 'hud', w: 1, text: 'T' }]) && j(hubtn(mk({ kind: 'hud', text: 'T' }, { title: 'Only a title' }, false).sheet, 's_combat')) === j([])
            && j(hubtn(mk({ kind: 'hud' }, { sections: [{ id: 's_g', title: 'G', fields: [{ id: 'f_gmfig' }] }] }, false).sheet, 's_combat')) === j([]) && !('hud' in mk({ kind: 'hud' }, { sections: [{ id: 's_g', title: 'G', fields: [{ id: 'f_gmfig' }] }] }, false).sheet)
            && pvIdem && validateSystem(gD2, F).errors.length === 0 && validateSystem(g32, F).errors.length === 0, j({ ctl, t: tabOf('t_main') }));
        // hudButton, run for real against a minimal element stub
        const sh3 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const hbSrc = sh3.slice(sh3.indexOf('function hudButton(pl, c, sys, vctx) {'), sh3.indexOf('// [systemcheck:hud-end]'));
        const mkEl = (tag, cls, text) => { const e = { tag, className: cls || '', textContent: text === undefined ? '' : text, kids: [], ls: {}, disabled: false, title: '', appendChild(k) { this.kids.push(k); return k; }, addEventListener(ev, fn) { this.ls[ev] = fn; }, closest() { return null; } }; return e; };
        const opened = [], sysH = { sheet: { hud: { title: 'Combat HUD', tabs: [{ id: 't_x', label: 'Status' }] } } };
        const HB = (fxLive, win, hudOk) => new Function('el', 'iconNode', 'hudFor', 'openHud', '_fxLive', 'window', hbSrc + '\nreturn hudButton;')(mkEl, v => mkEl('span', 'icon ' + v), id => hudOk && id === 'c_a', (id, o) => opened.push([id, o]), fxLive, win);
        const live = HB(true, {}, true)({ kind: 'hud', tab: 't_x', text: '' }, { id: 'c_a' }, sysH, { view: 'sheet', preview: false }), lb = live.kids[0];
        lb.ls.click && lb.ls.click({ preventDefault() {} });
        const prev = HB(false, {}, true)({ kind: 'hud' }, { id: 'c_a' }, sysH, { preview: true }).kids[0], pop = HB(true, { wpPopout: true }, true)({ kind: 'hud' }, { id: 'c_a' }, sysH, {}).kids[0], none = HB(true, {}, false)({ kind: 'hud', text: 'Mine' }, { id: 'c_a' }, sysH, {}).kids[0];
        check('HUD frame HF2b: the HUD button — live only on the real sheet for a HUD they can open (decided when drawn); a click opens this character\'s HUD at its tab; inert (disabled, no handler) in the Layout preview, a pop-out, or with no HUD to open; its words are its own or "Open" and the HUD\'s title',
            live.className === 'sheet-field sheet-kind-hud' && lb.disabled === false && j(opened) === j([['c_a', { tab: 't_x' }]]) && lb.kids[1].textContent === 'Open Combat HUD' && /at its Status tab/.test(lb.title)
            && [prev, pop, none].every(b => b.disabled === true && !b.ls.click) && none.kids[1].textContent === 'Mine'
            && /var live = _fxLive && !\(vctx && vctx\.preview\) && !window\.wpPopout,/.test(hbSrc) && /, ok = live && hudFor\(c\.id\);/.test(hbSrc) && !/innerHTML/.test(hbSrc) && /if \(b\.closest\('#systemModal'\)\) return; openHud\(c\.id, pl\.tab \? \{ tab: pl\.tab \} : null\);/.test(hbSrc), j({ opened, t: lb.title }));
        const wb3 = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
        const incs = [...wb3.matchAll(/action\.includes\('([^']+)'\)/g)].map(m => m[1]).filter(x => x !== 'cm-hud'), iHud = wb3.indexOf("} else if (action.includes('cm-hud')) {"), iLayers = wb3.indexOf("var layers = ['back', 'back-mid', 'middle', 'front-mid', 'front'];");
        check('HUD frame HF2b: every entry point asks hudFor — the GM\'s token menu (a static row, its own branch before the layer fallback, the menu closed after), the player\'s own-token menu (its own listener that stops the click), the party strip, token Properties and the Characters row; no other menu action is matched by "cm-hud"',
            /if \(isWb && firstItem && firstItem\.charId && window\.wpSheets && window\.wpSheets\.hudFor && window\.wpSheets\.hudFor\(firstItem\.charId\)\) html \+= '<div class="menu-item cm-hud">&#12336; HUD&hellip;<\/div>';/.test(wb3)
            && iHud > wb3.indexOf("} else if (action.includes('cm-sheet')) {") && iHud < iLayers && /action\.includes\('cm-hud'\)\) \{[^\n]*\n[^\n]*\n\s*cMenu\.style\.display = 'none';\n[^\n]*openHud\(itH\.charId\);\n\s*return;/.test(wb3)
            && incs.length > 10 && incs.every(x => 'menu-item cm-hud'.indexOf(x) < 0 && 'menu-item cm-hud-own'.indexOf(x) < 0)
            && /var hudRow = tok\.charId && window\.wpSheets && window\.wpSheets\.hudFor && window\.wpSheets\.hudFor\(tok\.charId\) \? '<div class="menu-item cm-hud-own">&#12336; HUD&hellip;<\/div>' : '';/.test(wb3) && /if \(!rows && !sheetRow && !hudRow\) return;/.test(wb3)
            && /if \(ownHud\) ownHud\.addEventListener\('click', function\(ce\) \{ ce\.stopPropagation\(\); cMenu\.style\.display = 'none'; window\.wpSheets\.openHud\(tok\.charId\); \}\);/.test(wb3)
            && /if \(loc && loc\.tok && loc\.tok\.charId && window\.wpSheets && window\.wpSheets\.hudFor && window\.wpSheets\.hudFor\(loc\.tok\.charId\)\) items\.push\(\{ act: 'hud', label: '\\u3030 HUD\\u2026' \}\);/.test(wb3) && /else if \(act === 'hud'\) \{[^\n]*window\.wpSheets\.openHud\(locH\.tok\.charId\); \}/.test(wb3)
            && /\(cur && hudFor\(cur\) \? '<button class="tool ghost" id="wbHudOpen"/.test(sh3) && /var hob = ui\('wbHudOpen'\); if \(hob\) hob\.addEventListener\('click', function\(\) \{ openHud\(w\.charId\); \}\);/.test(sh3)
            && /if \(hudFor\(c\.id\)\) \{ var hudB = el\('button', 'tool ghost sys-btn', 'HUD'\); hudB\.dataset\.act = 'hud';/.test(sh3) && /if \(b\.dataset\.act === 'hud'\) \{ openHud\(ch\.id\); return; \}/.test(sh3), j({ iHud, iLayers, bad: incs.filter(x => 'menu-item cm-hud-own'.indexOf(x) >= 0) }));
        const css3b = fs.readFileSync(path.join(app, 'style.css'), 'utf8'), blk3 = css3b.slice(css3b.indexOf('/* ---- Stage 6 HUD frame:'));
        check('HUD frame HF2b: the editor offers a HUD button on the sheet only once the system has a HUD, as one column with its own words and a HUD tab (checked before it is stored); its CSS lives in the HUD block; the tour and Help name every way in',
            /if \(!hudOn && draftHasHud\(\)\) opts\.push\(\['k:hud', 'HUD button'\]\);/.test(sh3) && /id === 'stance' \|\| id === 'hud' \? 1 : 'row' \}; if \(id === 'heading' \|\| id === 'hud'\) pl\.text = '';/.test(sh3)
            && /if \(t\.classList\.contains\('sys-pl-hudtab'\)\) \{[^\n]*if \(plx && plx\.kind === 'hud'\) \{ if \(\/\^t_\[A-Za-z0-9_\]\{1,24\}\$\/\.test\(t\.value\)\) plx\.tab = t\.value; else delete plx\.tab;/.test(sh3) && /if \(pl\.kind === 'hud'\) return 'HUD button';/.test(sh3)
            && /\.sheet-hud-link \{ width: 100%;/.test(blk3) && /a <b>HUD button<\/b> placed on the sheet \(which can open it at one of its tabs\)/.test(fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8')) && /or a <b>HUD button<\/b> you place on the sheet/.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')));
    }

    /* ---- Stage 6 HUD frame (HF2b review): hudFor run for real, the placement's dispatch and editor, a tab asked of an open HUD, window stacking ---- */
    {
        const sh4 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), fx4 = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8'));
        const hfSrc = sh4.slice(sh4.indexOf('function hudFor(charId) {'), sh4.indexOf('function openHud('));
        const cidRe = new Function('return ' + ((sh4.match(/HUD_CID = (\/[^\n]*?\/),/) || [])[1] || 'null'))();
        const HF = (can, sys) => new Function('HUD_CID', 'canOpen', 'hudHasContent', 'systemOf', 'getActiveCampaign', hfSrc + '\nreturn hudFor;')(cidRe, () => can, S.hudHasContent, () => sys, () => ({}));
        const gD4 = cleanSystem(fx4('hud-d20'), { F, gmView: true }), lk = fx4('look-d20'); lk.sheet.hud = { title: 'Only a title' };
        const titleOnly = cleanSystem(lk, { F, gmView: true }), noHud = cleanSystem(fx4('look-d20'), { F, gmView: true });
        check('HUD frame HF2b review: hudFor — the one gate every way in asks — is true only for a character id they may open, in a system whose saved HUD holds something (a title alone is not enough)',
            cidRe instanceof RegExp && HF(true, gD4)('c_a') === true && HF(true, titleOnly)('c_a') === false && HF(true, noHud)('c_a') === false && HF(false, gD4)('c_a') === false && HF(true, null)('c_a') === false
            && ['x', '__proto__', '', null, undefined, 'c_' + 'a'.repeat(25), 'c_a b'].every(id => HF(true, gD4)(id) === false));
        const dhSrc = (sh4.match(/function draftHasHud\(\) \{[^\n]*\}/) || [''])[0];
        const DH = draft => new Function('draft', dhSrc + '\nreturn draftHasHud();')(draft);
        check('HUD frame HF2b review: draftHasHud — the editor offers a HUD button (and Remove the HUD acts) only when the draft\'s HUD holds something: a title, a tab, a section, a band or a ledger figure; never for the empty one the HUD view makes by looking',
            dhSrc.length > 50 && DH({ sheet: { hud: { tabs: [], sections: [] } } }) === false && DH({ sheet: {} }) === false && DH(null) === false && DH({ sheet: { hud: [] } }) === false
            && [{ title: 'T' }, { tabs: [{ id: 't_a' }] }, { sections: [{ id: 's_a' }] }, { band: [{ id: 'f_a' }] }, { ledger: [{ id: 'f_a' }] }].every(h => DH({ sheet: { hud: h } }) === true)
            && /if \(!draftHasHud\(\)\) return true;   \/\/ nothing set/.test(sh4));
        const oh = sh4.slice(sh4.indexOf('function openHud(charId, opts) {'), sh4.indexOf('function makeHud('));
        check('HUD frame HF2b review: the placement is drawn by the section renderer; the editor\'s tab picker lists the HUD\'s tabs (a lost one marked) and says what no tab means; another tab asked of an open, scrolled HUD starts at its own top, measured before the change and only while the window is still the same',
            /else if \(pl\.kind === 'hud'\) node = hudButton\(pl, c, sys, vctx\);/.test(sh4) && /hOpts = \[\['', 'Its current tab \(first when closed\)'\]\];/.test(sh4) && /hOpts\.push\(\[x\.id, 'Tab: ' \+ \(x\.label \|\| 'Tab'\)\]\)/.test(sh4) && /hOpts\.push\(\[pl\.tab, '\(tab not found\)'\]\)/.test(sh4)
            && /var existed = !!huds\[charId\];\n    var v = huds\[charId\];/.test(oh) && oh.indexOf('var was = v.body.dataset.wpTab') < oh.indexOf('v.body.dataset.wpTab = opts.tab') && /if \(stuck && huds\[charId\] === v && v\.body\.dataset\.wpTab !== was\) v\.body\.scrollTop = frameFlowTop\(v\.body\);/.test(oh));
        const css4 = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, '\n'), zOf = re => { const m = css4.match(re); return m ? +m[1] : NaN; };
        const zSel = zOf(/#selToolbar \{\n\s*position: absolute; z-index: (\d+);/), zBar = zOf(/\.floating-toolbar \{[^}]*?z-index: (\d+);/), zSheet = zOf(/#sheetPanel \{[^}]*?z-index: (\d+);/), zHud = zOf(/\.hud-panel \{[^}]*?z-index: (\d+);/), zDoc = zOf(/#docPanel \{[^}]*?z-index: (\d+);/), zStrip = zOf(/#combatStrip \{[^}]*?z-index: (\d+);/);
        check('HUD frame HF2b: the floating windows (the sheet, a HUD, the doc panel) sit over the map\'s own toolbars — the token\'s selection toolbar and the tool bars under every window, still over the party and combat strips',
            [zSel, zBar, zSheet, zHud, zDoc, zStrip].every(isFinite) && zSel < Math.min(zSheet, zHud, zDoc) && zBar < Math.min(zSheet, zHud, zDoc) && zSel > zStrip && zBar > zStrip && zBar < zSel, j({ zSel, zBar, zSheet, zHud, zDoc, zStrip }));
    }

    /* ---- Stage 6 HUD frame (HF3): the docked roll history — the footer run for real on a tiny DOM, its gate, NEW, Clear, depth, the hook ---- */
    {
        const sh5 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), fx5 = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8'));
        const ftSrc = sh5.slice(sh5.indexOf('var _histCleared = '), sh5.indexOf('// One refresh path for every view of a character'));
        // a DOM just big enough for the footer: elements with classes, text, children, attributes, listeners and focus
        const mkDoc = () => {
            const doc = { activeElement: null };
            const E = tag => { const e = { tag, className: '', children: [], attrs: {}, on: {}, style: {}, title: '', type: '', value: '', scrollTop: 0, _t: '', parent: null,
                get textContent() { return this._t + this.children.map(c => c.textContent).join(''); }, set textContent(v) { this.children.forEach(c => { c.parent = null; }); this.children = []; this._t = String(v); },
                appendChild(c) { c.parent = this; this.children.push(c); if (c.tag === 'option' && !this.value) this.value = c.value; return c; }, setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener(k, f) { this.on[k] = f; },
                get classList() { const s = this; return { contains: k => s.className.split(/\s+/).includes(k) }; },
                all() { return this.children.flatMap(c => [c, ...c.all()]); }, querySelector(q) { return this.all().find(c => c.classList.contains(q.slice(1))) || null; }, querySelectorAll(q) { return this.all().filter(c => c.classList.contains(q.slice(1))); },
                contains(x) { return x === this || this.all().includes(x); }, focus() { doc.activeElement = this; }, click() { if (this.on.click) this.on.click({ preventDefault() {} }); } }; return e; };
            doc.E = E; return doc;
        };
        // o: { sys, rolls, diceOff, open, prefs, label } — read at call time, so a test can switch dice or the system between repaints
        const run = o => {
            const doc = mkDoc(), prefs = Object.assign({}, o.prefs), calls = [];
            const el = (t, c, x) => { const e = doc.E(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
            const iconNode = (v, c) => el('span', c + ' wp-glyph');
            const chars = { c_a: { id: 'c_a', name: 'Bren' }, c_b: { id: 'c_b', name: 'Ana' } };
            const netS = { myId: 'u_me', rollSeq: () => 42, rollsFor: (cid, name, since, max) => { calls.push([cid, name, since, max]); return (o.rolls || []).filter(r => !since || r.seq > since).slice(0, max); } };
            const win = { wpVtt: { on: k => k !== 'dice' || !o.diceOff }, wpDice: { renderCard: m => { const c = el('div', 'chat-roll'); c.textContent = 'card ' + m.roll.id; return c; } }, wpDiceCore: { LIMITS: { label: o.label || 60 } } };
            const huds = {}, fresh = id => (huds[id] = { charId: id, foot: el('div', 'hud-foot'), histOpen: !!o.open });
            ['c_a', 'c_b'].forEach(fresh);
            const api = new Function('el', 'iconNode', 'pref', 'setPref', 'getActiveCampaign', 'charById', 'net', 'systemOf', 'huds', 'document', 'window', ftSrc + '\nreturn { renderHudFoot, rolled, histDepth, rollName, cleared: _histCleared };')(
                el, iconNode, (k, d) => (k in prefs ? prefs[k] : d), (k, v) => { prefs[k] = String(v); }, () => ({ id: 'k1' }), id => chars[id] || null, () => netS, () => o.sys, huds, doc, win);
            return { api, huds, doc, prefs, calls, fresh, cls: (v, q) => v.foot.querySelectorAll(q) };
        };
        const sD = cleanSystem(fx5('hud-d20'), { F, gmView: true }), sB = cleanSystem(fx5('hud-bare'), { F, gmView: true }), s3 = cleanSystem(fx5('hud-3d6'), { F, gmView: true });
        const rollsOf = n => Array.from({ length: n }, (_, i) => ({ roll: { id: 'r' + i }, seq: i + 1 }));
        const bare = run({ sys: sB, rolls: rollsOf(2) }), off = run({ sys: sD, diceOff: true, rolls: rollsOf(2) }), none = run({ sys: null, rolls: rollsOf(2) });
        [bare, off, none].forEach(r => r.api.renderHudFoot(r.huds.c_a));
        check('HUD frame HF3: the footer builds NOTHING (the foot hides) when the system the viewer holds has nothing to roll (hud-bare), the table cannot roll (dice off), or there is no system',
            [bare, off, none].every(r => r.huds.c_a.foot.children.length === 0) && sB.rolls.length === 0 && sD.rolls.length > 0 && s3.fields.some(f => f.roll), j([bare, off, none].map(r => r.huds.c_a.foot.children.length)));
        const gO = { sys: sD, rolls: rollsOf(2) }, gt = run(gO), gv = gt.huds.c_a, bars = [];
        gt.api.renderHudFoot(gv); bars.push(gt.cls(gv, '.hud-hist-bar').length);
        gO.diceOff = true; gt.api.renderHudFoot(gv); bars.push(gv.foot.children.length);
        gO.diceOff = false; gt.api.renderHudFoot(gv); bars.push(gt.cls(gv, '.hud-hist-bar').length);
        gO.sys = sB; gt.api.rolled(null, ''); bars.push(gv.foot.children.length);
        check('HUD frame HF3: a drawer already drawn goes at the next repaint once Dice is switched off or the system has nothing to roll, and comes back with Dice',
            j(bars) === j([1, 0, 1, 0]), j(bars));
        const f3 = fx5('hud-3d6'); f3.rolls = []; const sF = cleanSystem(f3, { F, gmView: true }), f3n = fx5('hud-3d6'); f3n.rolls = []; f3n.fields.forEach(f => { delete f.roll; }); const sN = cleanSystem(f3n, { F, gmView: true });
        const fr = run({ sys: sF, rolls: rollsOf(1) }), frn = run({ sys: sN, rolls: rollsOf(1) }); fr.api.renderHudFoot(fr.huds.c_a); frn.api.renderHudFoot(frn.huds.c_a);
        check('HUD frame HF3: a system whose only rolls are fields\' own Roll buttons has the drawer; with those gone too it has none',
            sF.rolls.length === 0 && sF.fields.some(f => f.roll) && fr.cls(fr.huds.c_a, '.hud-hist-bar').length === 1 && !sN.fields.some(f => f.roll) && frn.huds.c_a.foot.children.length === 0);
        const cl = run({ sys: s3, rolls: rollsOf(3) }), v = cl.huds.c_a; cl.api.renderHudFoot(v);
        const tg = () => v.foot.querySelector('.hud-hist-toggle');
        check('HUD frame HF3: closed, with rolls — the bar holds the toggle (history glyph, ROLL HISTORY, a NEW pill, a chevron), aria-expanded false, and no list, Clear or depth; it asked net.rollsFor for this character by the name its rolls carry, with no Clear mark and the default depth 10',
            v.foot.children.length === 1 && v.foot.children[0].className === 'hud-hist-bar' && tg() && tg().attrs['aria-expanded'] === 'false' && cl.cls(v, '.hud-hist-new').length === 1 && cl.cls(v, '.hud-hist-new')[0].textContent === 'NEW'
            && cl.cls(v, '.hud-hist-ico').length === 1 && cl.cls(v, '.hud-hist-chev').length === 1 && cl.cls(v, '.hud-hist-list').length === 0 && cl.cls(v, '.hud-hist-clear').length === 0 && cl.cls(v, '.hud-hist-depth').length === 0
            && j(cl.calls[0]) === j(['c_a', 'Bren', 0, 10]), j(cl.calls));
        tg().focus(); tg().click();
        check('HUD frame HF3: the toggle opens the drawer — no NEW, aria-expanded true, Clear and the depth (10/25/50/100, showing the saved 10) in the tools, one dice card per roll in the list, newest first as net.rollsFor gives them, and focus back on the new toggle',
            v.histOpen === true && cl.cls(v, '.hud-hist-new').length === 0 && tg().attrs['aria-expanded'] === 'true' && cl.cls(v, '.hud-hist-clear').length === 1
            && j(cl.cls(v, '.hud-hist-depth')[0].children.map(o => o.value)) === j(['10', '25', '50', '100']) && cl.cls(v, '.hud-hist-depth')[0].value === '10'
            && j(cl.cls(v, '.chat-roll').map(c => c.textContent)) === j(['card r0', 'card r1', 'card r2']) && cl.doc.activeElement === tg());
        const lst = cl.cls(v, '.hud-hist-list')[0]; lst.scrollTop = 120; cl.api.rolled(null, '');
        check('HUD frame HF3: a repaint keeps the open list where the reader had scrolled it', cl.cls(v, '.hud-hist-list')[0] !== lst && cl.cls(v, '.hud-hist-list')[0].scrollTop === 120);
        cl.cls(v, '.hud-hist-clear')[0].focus(); cl.cls(v, '.hud-hist-clear')[0].click();
        check('HUD frame HF3: Clear marks this viewer\'s history for that character at the ring\'s seq (the next list asks for rolls after it; the other character\'s is untouched); with the list now empty, Clear itself goes and focus lands on the toggle (never on the page)',
            cl.api.cleared.c_a === 42 && !('c_b' in cl.api.cleared) && cl.calls[cl.calls.length - 1][2] === 42 && cl.cls(v, '.hud-hist-clear').length === 0 && cl.cls(v, '.hud-hist-empty').length === 1 && cl.doc.activeElement === tg());
        const v2 = cl.fresh('c_a'); cl.api.renderHudFoot(v2);
        check('HUD frame HF3: Clear lasts the session — the same character\'s HUD closed and opened again (a new window) still lists only what came after it, with no NEW; nothing but the Clear button writes the mark',
            cl.calls[cl.calls.length - 1][0] === 'c_a' && cl.calls[cl.calls.length - 1][2] === 42 && cl.cls(v2, '.hud-hist-new').length === 0
            && (ftSrc.match(/_histCleared\[/g) || []).length === 2 && /_histCleared\[v\.charId\] = n\.rollSeq\(\);/.test(ftSrc) && !/delete _histCleared|_histCleared = /.test(sh5.replace('var _histCleared = Object.create(null)', '')));
        cl.huds.c_a = v;   // the first window again
        const dep = cl.cls(v, '.hud-hist-depth')[0]; dep.focus(); dep.value = '50'; dep.on.change(); const bad = cl.calls.length; const dep2 = cl.cls(v, '.hud-hist-depth')[0];
        const depOk = dep2 !== dep && dep2.value === '50' && cl.doc.activeElement === dep2; dep2.value = '7'; dep2.on.change();
        const dp = p => run({ sys: sD, prefs: { wp_hudHistDepth: p } }).api.histDepth(), seeded = run({ sys: sD, open: true, rolls: rollsOf(1), prefs: { wp_hudHistDepth: '25' } }); seeded.api.renderHudFoot(seeded.huds.c_a);
        check('HUD frame HF3: the depth is the shared pref wp_hudHistDepth (every open HUD repaints with it; the rebuilt select shows it and keeps the focus); only 10/25/50/100 are taken, anything else reads as 10; a drawer opened later shows the saved depth',
            depOk && cl.prefs.wp_hudHistDepth === '50' && cl.calls[bad - 1][3] === 50 && cl.calls[bad - 2][3] === 50 && cl.calls.length === bad && dp('25') === 25 && dp('100') === 100 && dp('7') === 10 && dp('abc') === 10 && dp('1e2') === 10
            && seeded.cls(seeded.huds.c_a, '.hud-hist-depth')[0].value === '25', j([depOk, cl.calls.slice(-3)]));
        const em = run({ sys: sD, rolls: [], open: true }); em.api.renderHudFoot(em.huds.c_b);
        const emC = run({ sys: sD, rolls: [] }); emC.api.renderHudFoot(emC.huds.c_b);
        check('HUD frame HF3: open and empty — the text names the character, no Clear; closed and empty — no NEW',
            em.cls(em.huds.c_b, '.hud-hist-empty')[0].textContent === 'No rolls as Ana yet this session.' && em.cls(em.huds.c_b, '.hud-hist-clear').length === 0 && emC.cls(emC.huds.c_b, '.hud-hist-new').length === 0);
        const hk = run({ sys: sD, rolls: rollsOf(1), label: 3 }), mark = () => ['c_a', 'c_b'].forEach(id => { hk.huds[id].foot.textContent = ''; hk.huds[id].foot.appendChild(hk.doc.E('i')); }), hit = () => ['c_a', 'c_b'].filter(id => hk.huds[id].foot.children[0].tag !== 'i');
        const hits = [], GMf = { id: 'u_gm', gm: true };
        mark(); hk.api.rolled({ roll: { as: 'Bre' }, from: { id: 'u_mate', gm: false } }, 'c_b'); hits.push(hit());
        mark(); hk.api.rolled({ roll: { as: 'Bre' }, from: GMf }, ''); hits.push(hit());
        mark(); hk.api.rolled({ roll: { as: 'Bre' }, from: { id: 'u_me', gm: false } }, ''); hits.push(hit());
        mark(); hk.api.rolled({ roll: { as: 'Bre' }, from: { id: 'u_mate', gm: false } }, ''); hits.push(hit());
        mark(); hk.api.rolled({ roll: { as: 'Bre' } }, ''); hits.push(hit());
        mark(); hk.api.rolled({ roll: { as: 'Zed' }, from: GMf }, ''); hits.push(hit());
        mark(); hk.api.rolled({ roll: {}, from: GMf }, ''); hits.push(hit());
        mark(); hk.api.rolled(null, ''); hits.push(hit());
        check('HUD frame HF3: the hook repaints the foot of the HUD a roll was made as — by its tag, else by the name it carries (capped as a roll\'s "as" is) only for the GM\'s roll or this machine\'s own, never a teammate\'s — and every foot for a repaint with no roll',
            j(hits) === j([['c_b'], ['c_a'], ['c_a'], [], [], [], [], ['c_a', 'c_b']]) && hk.api.rollName({ name: 'Brennan' }) === 'Bre', j(hits));
        const hs = sh5.slice(sh5.indexOf('// [systemcheck:hud-start]'), sh5.indexOf('// [systemcheck:hud-end]')), rd = (ftSrc.match(/function rolled\(m, cid\) \{[\s\S]*?\n\}/) || [''])[0];
        check('HUD frame HF3: the footer is inside the HUD slice and writes no markup (el/textContent and the dice card only); the hook repaints the foot, never the body; renderHud gives the panel the look\'s accent (the foot is the body\'s sibling) and ends by drawing its foot; makeHud starts the drawer closed; wpSheets exports rolled; the tour and Help name it',
            hs.indexOf('function renderHudFoot(v)') > 0 && !/innerHTML|outerHTML|insertAdjacentHTML/.test(ftSrc) && /D\.renderCard\(m\)/.test(ftSrc) && rd.length > 50 && /renderHudFoot\(v\)/.test(rd) && !/renderHud\(|renderViews\(/.test(rd)
            && /    syncFramePad\(v\.body\);\n    \['--sheet-accent', '--sheet-accent-ink'\]\.forEach\(function\(k\) \{ var a = v\.body\.style\.getPropertyValue\(k\); if \(a\) v\.panel\.style\.setProperty\(k, a\); else v\.panel\.style\.removeProperty\(k\); \}\);[^\n]*\n    restoreFocus\(v\.body, fk\);\n    renderHudFoot\(v\);\n\}/.test(hs)
            && /v\.foot = q\('hud-foot'\); v\.histOpen = false;/.test(hs) && /hudFor: hudFor, rolled: rolled,/.test(sh5)
            && /When the system has rolls, its <b>Roll history<\/b> drawer/.test(fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8')) && /<b>Roll history<\/b> \(when the system has rolls\)/.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')));
        const css5 = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, '\n'), b5 = css5.slice(css5.indexOf('/* ---- Stage 6 HUD frame:')), rx5 = (b5.match(/\.hud-hist-list \.roll-expr \{([^}]*)\}/) || [])[1];
        check('HUD frame HF3: the drawer\'s CSS lives in the HUD block — the 44px bar, NEW still under reduced motion, the list at 18rem; the history\'s label-and-formula line is never uppercased (the formula\'s keys would shout)',
            /\.hud-hist-bar \{ flex: none; height: 44px;/.test(b5) && /@media \(prefers-reduced-motion: reduce\) \{ \.hud-hist-new \{ animation: none; \} \}/.test(b5) && /\.hud-hist-list \{ max-height: 18rem; flex: 1 1 auto; min-height: 0; overflow: auto;/.test(b5)
            && typeof rx5 === 'string' && !/text-transform/.test(rx5) && !/\.roll-expr[^{]*\{[^}]*text-transform/.test(b5), rx5);
        check('HUD frame HF3: in a short window the open drawer gives way instead of being clipped — the foot shrinks as a column over a body that keeps a floor, the list shrinks and scrolls; the grip\'s strip stays under an open list (never over its scrollbar)',
            /\.hud-foot \{ flex: 0 1 auto; min-height: 45px; display: flex; flex-direction: column;/.test(b5) && /\.hud-body:has\(\+ \.hud-foot:not\(:empty\)\) \{ margin-bottom: 0; flex-basis: 0; min-height: 4\.5rem; \}/.test(b5)
            && /\.hud-foot:has\(> \.hud-hist-list\) \{ padding-bottom: 12px; \}/.test(b5) && /\.hud-body \{ flex: 1 1 auto; min-height: 0;[^}]*margin-bottom: 12px;/.test(b5));
    }

    /* ---- Stage 6 HUD frame (HF4a): inline rows (H2) and the counter (H8) — the cleaner, both run for real, the editor, the tour's seed ---- */
    {
        const sh6 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), fx6 = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8'));
        const GV = { F, gmView: true }, PV = { F, gmView: false };
        const gD = cleanSystem(fx6('hud-d20'), GV), pD = cleanSystem(fx6('hud-d20'), PV), g3 = cleanSystem(fx6('hud-3d6'), GV), p3 = cleanSystem(fx6('hud-3d6'), PV);
        const secIn = (sh, id) => sh.sections.find(s => s.id === id), fld = (sys, id) => sys.fields.find(f => f.id === id);
        const mkS = (secs, flds) => cleanSystem({ v: 1, name: 'I', fields: flds || [{ id: 'f_a', key: 'A', kind: 'number', def: 1, vis: 'all' }], rolls: [], sheet: { bandGroups: [{ id: 'g_a', label: 'A' }], band: [{ id: 'f_a', g: 'g_a' }], sections: secs } }, GV);
        const inl = [true, 'yes', 1, false, null].map(v => mkS([{ id: 's_a', title: 'A', pin: 'g_a', inline: v, fields: [{ id: 'f_a' }] }]).sheet.sections[0]);
        check('HUD frame HF4a: a section\'s Inline rows is kept only as true, after its Pin; in the sheet\'s layout and the HUD\'s, in the players\' view too (d20 Checks, 3d6 Core and Attributes; their other sections stay stacked)',
            inl[0].inline === true && Object.keys(inl[0]).indexOf('inline') === Object.keys(inl[0]).indexOf('pin') + 1 && inl.slice(1).every(s => !('inline' in s))
            && secIn(gD.sheet.hud, 's_hchk').inline === true && secIn(pD.sheet.hud, 's_hchk').inline === true && secIn(g3.sheet.hud, 's_hcore').inline === true && secIn(g3.sheet.hud, 's_hattr').inline === true && secIn(p3.sheet.hud, 's_hattr').inline === true
            && !('inline' in secIn(gD.sheet.hud, 's_hatk')) && !('inline' in secIn(g3.sheet.hud, 's_hpools')) && gD.sheet.sections.every(s => !('inline' in s)), j(inl));
        const cf = (kind, extra) => { const f = Object.assign({ id: 'f_c', key: 'C', kind, def: 0, vis: 'all', counter: true }, extra || {}); return fld(cleanSystem({ v: 1, name: 'C', fields: [f], rolls: [] }, GV), 'f_c'); };
        const cOn = [cf('number'), cf('skill'), cf('number', { min: 0, max: 3 })], cOff = [cf('number', { labels: ['a', 'b'] }), cf('number', { slider: {}, min: 0, max: 5 }), cf('number', { counter: 'yes' }), cf('formula', { formula: '1' }), cf('resource', { max: 5 }), cf('text'), cf('toggle', { def: false })];
        check('HUD frame HF4a: Counter is kept on a number or a skill only as true, and never with value names or a slider (a number is a dropdown, a range or a counter); both fixtures\' counters survive in the GM\'s and the players\' view and sit on their HUD band',
            cOn.every(f => f && f.counter === true) && cOff.every(f => f && !('counter' in f)) && cf('number', { slider: {}, min: 0, max: 5 }).slider
            && fld(gD, 'f_dsv').counter === true && fld(pD, 'f_dsv').counter === true && fld(g3, 'f_turn').counter === true && fld(p3, 'f_turn').counter === true
            && gD.sheet.hud.band.some(q => q.id === 'f_dsv') && pD.sheet.hud.band.some(q => q.id === 'f_dsv') && g3.sheet.hud.band.some(q => q.id === 'f_turn') && p3.sheet.hud.band.some(q => q.id === 'f_turn')
            && fld(gD, 'f_ac').tile === true && fld(g3, 'f_st').tile === true && S.validateSystem(gD, F).errors.length === 0 && S.validateSystem(g3, F).errors.length === 0, j([cOn, cOff]));
        // inlineRow, run for real on a small fake DOM
        const irSrc = sh6.slice(sh6.indexOf('var INLINE_KINDS = '), sh6.indexOf('// Stage 6 look fold (L8): a number box'));
        const mkE = (cls, text) => { const e = { className: cls || '', textContent: text || '', children: [], parent: null,
            get classList() { const s = this; return { add: k => { if (!s.className.split(' ').includes(k)) s.className = (s.className + ' ' + k).trim(); }, remove: k => { s.className = s.className.split(' ').filter(x => x && x !== k).join(' '); }, contains: k => s.className.split(' ').includes(k) }; },
            appendChild(c) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = this; this.children.push(c); return c; },
            insertBefore(c, ref) { if (c.parent) c.parent.children.splice(c.parent.children.indexOf(c), 1); c.parent = this; const i = ref ? this.children.indexOf(ref) : -1; if (i < 0) this.children.push(c); else this.children.splice(i, 0, c); return c; },
            all() { return this.children.flatMap(c => [c, ...c.all()]); }, querySelector(q) { return this.all().find(c => c.classList.contains(q.slice(1))) || null; } }; return e; };
        const inlineRow = new Function(irSrc + '\nreturn inlineRow;')();
        const mkField = (kind, o) => { o = o || {}; const box = mkE('sheet-field sheet-kind-' + kind + (o.tile ? ' sheet-tile' : '') + (o.drawnSlider ? ' sheet-has-slider' : '')), lab = box.appendChild(mkE('sheet-label', 'AC')); if (o.roll) lab.appendChild(mkE('tool ghost sheet-field-roll', 'die')); box.appendChild(mkE(kind === 'formula' ? 'sheet-value' : 'sheet-ctl')); if (o.cap) box.appendChild(mkE('sheet-caption', 'cap')); return box; };
        const n1 = mkField('formula', { tile: true, roll: true, cap: true }); inlineRow(n1, { kind: 'formula' });
        const n2 = mkField('number', { roll: true }); inlineRow(n2, { kind: 'number' });
        const n3 = mkField('number', { tile: true, drawnSlider: true }); inlineRow(n3, { kind: 'number', slider: {}, min: 0, max: 5 });
        const n4 = mkField('formula', { tile: true }), n5 = mkField('number'), n6 = mkField('number', { tile: true }), n7 = mkField('number');
        let threw = ''; try { inlineRow(n4, { kind: 'formula' }); inlineRow(n5, { kind: 'number' }); inlineRow(n6, { kind: 'number', slider: {}, min: 0, max: 2, labels: ['a', 'b', 'c'] }); inlineRow(n7, { kind: 'number', slider: {} }); } catch (e) { threw = e.message; }
        const others = ['resource', 'effects', 'notes', 'item-list', 'constructor', '__proto__'].map(k => { const n = mkField(k, { tile: true, roll: true }); inlineRow(n, { kind: k }); return n; });
        const kids = n => n.children.map(c => c.className.split(' ').filter(x => /^sheet-(label|value|ctl|caption|field-roll)$/.test(x))[0]);
        check('HUD frame HF4a: inlineRow (run for real) makes a field one line — the row class on, a stat tile\'s class off (the section beats the tile), its own roll moved out of the label to the end of the line reading "Roll", before any caption; a field without a roll (the f_ac tile, a plain number) only gains the class, without throwing; a slider that was not drawn (no range, or a named number) becomes a row; a drawn slider and the kinds a line cannot hold (a pool) are left alone',
            n1.classList.contains('sheet-inline-row') && !n1.classList.contains('sheet-tile') && j(kids(n1)) === j(['sheet-label', 'sheet-value', 'sheet-field-roll', 'sheet-caption']) && n1.children[2].textContent === 'Roll' && n1.children[2].classList.contains('sheet-inline-roll') && n1.children[0].children.length === 0
            && j(kids(n2)) === j(['sheet-label', 'sheet-ctl', 'sheet-field-roll']) && n2.children[2].textContent === 'Roll'
            && !threw && [n4, n5, n6, n7].every(n => n.classList.contains('sheet-inline-row') && !n.classList.contains('sheet-tile') && n.children[0].children.length === 0) && j(kids(n4)) === j(['sheet-label', 'sheet-value']) && j(kids(n5)) === j(['sheet-label', 'sheet-ctl'])
            && !n3.classList.contains('sheet-inline-row') && n3.classList.contains('sheet-tile') && others.every(n => !n.classList.contains('sheet-inline-row') && n.classList.contains('sheet-tile') && n.children[0].children.length === 1)
            && /Object\.freeze\(\{ number: 1, formula: 1, skill: 1, toggle: 1, select: 1, text: 1 \}\)/.test(irSrc) && /Object\.prototype\.hasOwnProperty\.call\(INLINE_KINDS, f\.kind\) \|\| node\.classList\.contains\('sheet-has-slider'\)\) return;/.test(irSrc), j([kids(n1), kids(n2)]));
        check('HUD frame HF4a: the renderer marks an inline section by comparison and makes each FIELD placement a line (a roll placement stays a button); a counter is drawn before the look\'s arrows (and never also gets them)',
            /'sheet-section' \+ \(collap \? ' sheet-collap' : ''\) \+ \(isChild \? ' sheet-subsection' : ''\) \+ \(sec\.inline === true \? ' sheet-inline' : ''\)/.test(sh6)
            && /\n            if \(!node\) return;\n            if \(sec\.inline === true && pl\.id && byId\[pl\.id\]\) inlineRow\(node, byId\[pl\.id\]\);[^\n]*\n            if \(pl\.w === 'row'\)/.test(sh6)
            && /\n        if \(f\.counter\) row\.appendChild\(stepWrap\(inp, f, c, editable, true\)\);[^\n]*\n        else if \(lkS\.steppers === 'inside' && [^\n]*\n        else row\.appendChild\(inp\);/.test(sh6) && (sh6.match(/inlineRow\(/g) || []).length === 2);
        // stepWrap's counter path, run for real (the L8 harness's fake DOM: classList has add() only)
        const swSrc6 = sh6.slice(sh6.indexOf('function stepWrap('), sh6.indexOf('// Stage 6 look fold (L7): a badge'));
        const fakeEl6 = (tag, cls, text) => { const e = { tag, className: cls || '', textContent: text || '', dataset: {}, children: [], disabled: false, title: '', type: '', listeners: {}, appendChild(x) { this.children.push(x); return x; }, addEventListener(t, fn) { (this.listeners[t] = this.listeners[t] || []).push(fn); } }; e.classList = { add: k => { if (!e.className.split(' ').includes(k)) e.className = (e.className + ' ' + k).trim(); } }; e.fire = t => (e.listeners[t] || []).forEach(fn => fn()); return e; };
        // a clock: setTimeout keeps its callback under an id until due; clearTimeout removes only that id; advance(t) runs what is due, in order
        const mkClock = () => { let now = 0, seq = 0; const q = new Map(); return { set: (fn, ms) => { q.set(++seq, { at: now + ms, fn }); return seq; }, clear: id => { q.delete(id); }, pending: () => q.size, advance(t) { for (;;) { const due = [...q].filter(([, x]) => x.at <= t).sort((a, b) => a[1].at - b[1].at)[0]; if (!due) break; q.delete(due[0]); now = due[1].at; due[1].fn(); } now = t; } }; };
        const mkStep = () => { const clock = mkClock(), commits = []; const stepWrap = new Function('el', 'commit', 'setTimeout', 'clearTimeout', swSrc6 + '\nreturn stepWrap;')(fakeEl6, (c, f, v) => commits.push(v), (fn, ms) => clock.set(fn, ms), id => clock.clear(id)); return { stepWrap, clock, commits }; };
        // acts: +1 / -1 a click, 'n' a value typed into the box; clicks 50 ms apart (one burst) unless an act is { wait: ms }
        const runCnt = (field, start, acts, editable) => {
            const { stepWrap, clock, commits } = mkStep(); let t = 0;
            const inp = fakeEl6('input', 'field sheet-num'); inp.value = String(start);
            const w = stepWrap(inp, field, { id: 'c_1' }, editable !== false, true), down = w.children[0], up = w.children[2];
            acts.forEach(a => { if (a && a.wait) { t += a.wait; clock.advance(t); return; } if (typeof a === 'string') { inp.value = a; inp.fire('change'); } else (a > 0 ? up : down).fire('click'); t += 50; clock.advance(t); });
            const shown = inp.value, pend = clock.pending(); clock.advance(t + 1000);
            return { w, shown, commits, down, up, pend, inp, inpMid: w.children[1] === inp };
        };
        const k1 = runCnt({ id: 'f_dsv', min: 0, max: 3 }, 1, [1, 1, 1]), k2 = runCnt({ id: 'f_turn', min: 0 }, 4, [1, -1]), k3 = runCnt({ id: 'f_turn', min: 0 }, 0, [-1, -1]), k4 = runCnt({ id: 'f_dsv', min: 0, max: 3 }, 1, [1], false);
        const k5 = runCnt({ id: 'f_turn', min: 0 }, 5, ['7', -1, -1]), k6 = runCnt({ id: 'f_turn', min: 0 }, 5, ['7', 1, -1]), k7 = runCnt({ id: 'f_turn', min: 0 }, 5, [1, { wait: 250 }, 1]), k8 = runCnt({ id: 'f_turn', min: 0 }, 5, [1, '9']);   // k8: a value typed mid-burst ends the burst (the box commits it itself); the click's timer must not overwrite it
        // a redraw in the middle of a burst (a player's own edit comes back as an ack and a delta within a round trip): the pending value survives,
        // the next click carries on from it under the one timer — and a band copy and a section copy of one counter share the burst
        const rd = (() => { const { stepWrap, clock, commits } = mkStep(), f = { id: 'f_turn', min: 0 }, c = { id: 'c_1' }; let stored = 0, t = 0; const draw = () => { const i = fakeEl6('input', 'field sheet-num'); i.value = String(stored); const w = stepWrap(i, f, c, true, true); return { i, up: w.children[2], down: w.children[0] }; };
            const at = (ms, fn) => { clock.advance(ms); t = ms; fn(); }; let v = draw(); const band = draw(); const seen = [];
            at(0, () => v.up.fire('click')); at(120, () => v.up.fire('click')); at(150, () => { v = draw(); seen.push(v.i.value); }); at(200, () => v.up.fire('click')); at(230, () => band.up.fire('click')); clock.advance(2000);
            return { commits: commits.slice(), seen, pend: clock.pending() }; })();
        const stepped = (() => { const { stepWrap } = mkStep(), a = fakeEl6('input', 'field sheet-num'), b = fakeEl6('input', 'field sheet-num'); stepWrap(a, { id: 'f_a' }, { id: 'c_1' }, true, true); stepWrap(b, { id: 'f_b' }, { id: 'c_1' }, true); return [a.className, b.className]; })();
        check('HUD frame HF4a: the counter (the real stepWrap, flank) — span.sheet-counter holding [\u2212, the box, +] with the field id and parts down/up, titled One less / One more, disabled with the box, the box without native arrows (num-stepped, both paths); a burst of three clicks shows 3 at once (0\u20133 clamps) and sends ONE commit (one timer pending); clicks more than 200 ms apart are two commits; up then down sends nothing; the min holds at 0; a value typed into the box ends a burst in flight and is the new start; a redraw in the middle of a burst keeps the pending value and the burst is still ONE commit, shared by the band copy and a section copy',
            k1.w.className === 'sheet-counter' && k1.inpMid && k1.w.children.length === 3 && k1.down.className === 'tool ghost sheet-count' && k1.up.className === 'tool ghost sheet-count' && k1.down.dataset.part === 'down' && k1.up.dataset.part === 'up' && k1.down.dataset.fid === 'f_dsv'
            && k1.down.title === 'One less' && k1.up.title === 'One more' && k1.up.textContent === '+' && k1.down.textContent === '\u2212' && !k1.up.disabled && k4.up.disabled && k4.down.disabled
            && k1.shown === '3' && j(k1.commits) === j([3]) && k1.pend === 1 && k2.shown === '4' && k2.commits.length === 0 && k3.shown === '0' && k3.commits.length === 0 && k5.shown === '5' && j(k5.commits) === j([5]) && k6.shown === '7' && k6.commits.length === 0
            && j(k7.commits) === j([6, 7]) && k8.commits.length === 0 && k8.shown === '9' && k8.pend === 0 && j(rd.commits) === j([4]) && j(rd.seen) === j(['2']) && rd.pend === 0 && stepped.every(cn => /\bnum-stepped\b/.test(cn)),
            j([k1.commits, k1.pend, k2.commits, k3.commits, k5.commits, k6.commits, k7.commits, rd, stepped]));
        check('HUD frame HF4a: the editor — a section\'s Stacked fields / Inline rows select (set or cleared by its exact class); a Counter box on a number without value names or a slider and on a skill; ticking one of Counter and Slider clears the other in the draft (a set slider keeps its box so it can be turned off); giving or clearing value names brings the Counter box or takes it away; the new classes contain no other editor class and none contains them',
            /top\.appendChild\(select\('sys-sec-inline', \[\['', 'Stacked fields'\], \['1', 'Inline rows'\]\], sec\.inline \? '1' : '',/.test(sh6)
            && /if \(t\.classList\.contains\('sys-sec-inline'\)\) \{ if \(t\.value\) sec\.inline = true; else delete sec\.inline; markDirty\(\); renderPreview\(\); return true; \}/.test(sh6)
            && /if \(\(f\.kind === 'number' && !f\.slider && !\(Array\.isArray\(f\.labels\) && f\.labels\.length\)\) \|\| f\.kind === 'skill'\) \{ var cnl = [^\n]*cnc\.className = 'sys-counter-chk';/.test(sh6) && /if \(f\.kind === 'number' && \(!f\.counter \|\| f\.slider\)\) \{ var sl = /.test(sh6)
            && /else if \(c\.indexOf\('sys-slider-chk'\) >= 0\) \{ if \(t\.checked\) \{ f\.slider = f\.slider \|\| \{\}; delete f\.counter; \} else delete f\.slider;/.test(sh6)
            && /wantCnt = !f\.slider && !\(Array\.isArray\(f\.labels\) && f\.labels\.length\); if \(rwV && !!rwV\.querySelector\('\.sys-counter-chk'\) !== wantCnt\) \{ if \(Array\.isArray\(f\.labels\) && f\.labels\.length\) delete f\.counter; markDirty\(\); renderAll\(\); return; \}/.test(sh6)
            && /else if \(c\.indexOf\('sys-counter-chk'\) >= 0\) \{ if \(t\.checked\) \{ f\.counter = true; delete f\.slider; \} else delete f\.counter; markDirty\(\); renderAll\(\); return; \}/.test(sh6)
            && (() => { const disp = (sh6.match(/c\.indexOf\('sys-[a-z0-9-]+'\)/g) || []).map(m => m.slice(11, -2)), cls = new Set(sh6.match(/sys-[a-z0-9-]+/g) || []); return disp.length > 50 && ['sys-sec-inline', 'sys-counter-chk'].every(n => disp.every(t => t === n || n.indexOf(t) < 0) && [...cls].every(o => o === n || o.indexOf(n) < 0)); })());
        // the tour's seed and its guarded migration, run for real
        const tut6 = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8').replace(/\r\n/g, '\n');
        const fnT6 = name => { const i = tut6.indexOf('function ' + name + '('); let d = 0; const k = tut6.indexOf('{', i); for (let p = k; p < tut6.length; p++) { if (tut6[p] === '{') d++; else if (tut6[p] === '}') { d--; if (d === 0) return tut6.slice(i, p + 1); } } return ''; };
        const T6 = new Function(['tutorialEffects', 'tutorialHud', 'tutorialSystem', 'tutorialCharacter', 'ensureTutorialSheet'].map(fnT6).join('\n') + '\nvar TUTORIAL_ART_URL = "/x/";\nreturn { sys: tutorialSystem, hud: tutorialHud, ch: tutorialCharacter, ensure: ensureTutorialSheet };')();
        const hf2a = () => { const s = T6.sys(); const h = s.sheet.hud.sections.find(x => x.id === 's_tut_hchk'); delete h.inline; return { system: s, chars: { c_tut_bren: T6.ch('/x/') }, items: {} }; };
        const mig = hf2a(), migC = hf2a(), cleanedH = cleanSystem(migC.system, GV); migC.system.sheet.hud = JSON.parse(JSON.stringify(cleanedH.sheet.hud)); delete migC.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk').inline;
        const edited = [s => { s.title = 'My checks'; }, s => { s.cols = 2; }, s => { s.fields.push({ id: 'f_tut_dex', w: 1 }); }, s => { s.collapsible = true; }, s => { s.inline = false; }, s => { s.tab = 't_tut_hstat'; }].map(fn => { const c = hf2a(); fn(c.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk')); const before = JSON.stringify(c.system.sheet.hud); T6.ensure(c); return before === JSON.stringify(c.system.sheet.hud); });
        const r1 = T6.ensure(mig), r2 = T6.ensure(mig), rC = T6.ensure(migC);
        // the owner sets it back to Stacked fields (the editor deletes inline) and Saves (the cleaner writes the HF2a shape again): it stays stacked
        const back = JSON.parse(JSON.stringify(mig)); back.system = cleanSystem(back.system, GV); delete back.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk').inline; back.system = cleanSystem(back.system, GV); const rB = T6.ensure(back);
        const freshC = { system: T6.sys(), chars: { c_tut_bren: T6.ch('/x/') }, items: {}, tutorialSeed: 1 }; delete freshC.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk').inline; T6.ensure(freshC); const fresh = 'inline' in freshC.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk');
        check('HUD frame HF4a: the tour\'s HUD Checks section draws as inline rows; an older tutorial gains it once (a one-shot marker a fresh build carries) and only on the untouched HF2a seed (as seeded or as a Save cleaned it); a Checks section someone changed (its title, columns, fields, tab, collapsing) or later set back to Stacked fields is left alone',
            T6.hud().sections.find(x => x.id === 's_tut_hchk').inline === true && r1 === true && r2 === false && mig.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk').inline === true
            && rC === true && migC.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk').inline === true && edited.every(Boolean) && mig.tutorialSeed === 2
            && rB === false && !('inline' in back.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk')) && fresh === false && /camp\.tutorialSeed = [1-9];[^\n]*\n    camp\.vtt = tutorialVtt\(\);/.test(tut6)
            && j(cleanSystem(mig.system, GV).sheet.hud) === j(cleanSystem(T6.sys(), GV).sheet.hud), j({ r1, r2, rC, edited }));
        const css6 = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, '\n'), b6 = css6.slice(css6.indexOf('/* ---- Stage 6 HUD frame:')), i6 = b6.indexOf('/* HF4a (H2)'), r6 = i6 >= 0 ? b6.slice(i6, b6.indexOf('/* HF4b (H13)')).split('\n').filter(l => /^  [.@]/.test(l)) : [];
        check('HUD frame HF4a: the CSS lives in the HUD block, every rule gated by an HF4a class (the inline row, its Roll, the counter and its buttons), none touching the L8 arrows; the tour and Help describe inline rows and counters',
            r6.length >= 10 && r6.every(l => l.split('{')[0].split(',').every(m => /\.sheet-(inline-row|inline-roll|counter|count)\b/.test(m))) && !r6.some(l => /sheet-step\b|sheet-steps/.test(l)) && r6.filter(l => /sheet-numwrap/.test(l)).every(l => /^  \.sheet-field\.sheet-inline-row > \.sheet-ctl > input\.sheet-num, \.sheet-field\.sheet-inline-row > \.sheet-ctl > \.sheet-numwrap > input\.sheet-num \{ width: 4\.5em; flex: none; \}/.test(l))
            && /\.sheet-field\.sheet-tile \.sheet-counter \{ display: grid;/.test(b6) && /\.sheet-count \{ flex: none;/.test(b6)
            && /A section can show its fields as <b>inline rows<\/b> &mdash; label and value on the left, Roll on the right &mdash; and a number can be a <b>counter<\/b> with &minus; and \+ either side\./.test(tut6)
            && /<li><b>Inline rows and counters\.<\/b> A section set to <b>Inline rows<\/b> draws each field on one line[^<]*(<[^l][^<]*)*a number, formula or skill shown as a stat tile draws as a row there \(a pool and a number drawn as a slider keep their own look\)/.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')), j(r6.filter(l => !l.split('{')[0].split(',').every(m => /\.sheet-(inline-row|inline-roll|counter|count)\b/.test(m)))));
    }

    /* ---- Stage 6 HUD frame (HF4b): Reset all (H13) — the cleaner, its targets and commitMany run for real, a batch's rollback, the editor, the tour's seed ---- */
    {
        const sh7 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), nt7 = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
        const fx7 = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8')), GV7 = { F, gmView: true }, PV7 = { F, gmView: false };
        const gD7 = cleanSystem(fx7('hud-d20'), GV7), pD7 = cleanSystem(fx7('hud-d20'), PV7), g37 = cleanSystem(fx7('hud-3d6'), GV7), p37 = cleanSystem(fx7('hud-3d6'), PV7);
        const sec7 = (lay, id) => lay.sections.find(s => s.id === id), BEL = String.fromCharCode(7), noCtrl = t => ![...t].some(ch => ch.charCodeAt(0) < 32);
        const mkR = o => cleanSystem({ v: 1, name: 'R', fields: [{ id: 'f_p', key: 'P', kind: 'resource', maxFormula: '5', def: 'max', min: 0, vis: 'all', edit: 'owner' }], rolls: [], sheet: { sections: [Object.assign({ id: 's_r', title: 'R', fields: [{ id: 'f_p' }] }, o)] } }, GV7).sheet.sections[0];
        const rA = mkR({ inline: true, resetAll: true, resetText: '  Long rest  ' }), rB = mkR({ resetAll: 'yes', resetText: 'x' }), rC = mkR({ resetText: 'orphan' }), rD = mkR({ resetAll: true, resetText: 'a'.repeat(80) + BEL }), rE = mkR({ resetAll: true, resetText: 'Long' + BEL + 'rest' }), rF = mkR({ resetAll: true, resetText: '   ' });
        check('HUD frame HF4b: a section\'s Reset all is kept only as true, after Inline rows; its own words only with it — trimmed, control characters out, cut to the label cap; the players\' view keeps both (d20: the sheet\'s Spellcasting, the HUD\'s Long rest slots and Status; 3d6: Resource Pools)',
            rA.resetAll === true && rA.resetText === 'Long rest' && Object.keys(rA).indexOf('resetAll') === Object.keys(rA).indexOf('inline') + 1 && !('resetAll' in rB) && !('resetText' in rB) && !('resetText' in rC)
            && rD.resetText.length === 60 && noCtrl(rD.resetText) && rE.resetText === 'Long rest' && !('resetText' in rF) && rF.resetAll === true
            && sec7(gD7.sheet, 's_spell').resetAll === true && sec7(pD7.sheet, 's_spell').resetAll === true && sec7(gD7.sheet.hud, 's_hslots').resetText === 'Long rest' && sec7(pD7.sheet.hud, 's_hslots').resetText === 'Long rest'
            && sec7(pD7.sheet.hud, 's_hstat').resetAll === true && sec7(p37.sheet.hud, 's_hpools').resetAll === true && sec7(g37.sheet.hud, 's_hpools').resetAll === true, j([rA, rB, rC, rD, rE, rF]));
        // the targets, worked out for real (systemcore's resetTargets, as the chip calls it)
        const chD = { id: 'c_d', ownerId: 'u_p', values: { f_level: 5, f_sl1: { cur: 0 }, f_sl2: { cur: 1 }, f_sl3: { cur: 2 }, f_hp: { cur: 3 }, f_dsv: 2 } };
        const RT = (sys, sc, ch, who) => S.resetTargets(sys, ch, sc, F, who), tv = r => j(r.targets.map(t => [t.fieldId, t.value]));
        const tSl = RT(gD7, sec7(gD7.sheet.hud, 's_hslots'), chD, { gm: true }), tSp = RT(gD7, sec7(gD7.sheet, 's_spell'), chD, { gm: true }), tSt = RT(pD7, sec7(pD7.sheet.hud, 's_hstat'), chD, { own: true });
        const t3 = RT(p37, sec7(p37.sheet.hud, 's_hpools'), { id: 'c_3', values: { f_st: 12, f_hp: { cur: 4 }, f_ep: { cur: 10 } } }, { own: true });
        const full = RT(gD7, sec7(gD7.sheet.hud, 's_hslots'), { id: 'c_f', values: { f_level: 5 } }, { gm: true }), noPools = RT(gD7, sec7(gD7.sheet.hud, 's_hchk'), chD, { gm: true });
        const gmEd = JSON.parse(JSON.stringify(fx7('hud-d20'))); gmEd.fields.find(f => f.id === 'f_sl1').edit = 'gm'; const gGm = cleanSystem(gmEd, GV7);
        const asOwner = RT(gGm, sec7(gGm.sheet.hud, 's_hslots'), chD, { own: true }), asGm = RT(gGm, sec7(gGm.sheet.hud, 's_hslots'), chD, { gm: true }), part = RT(gD7, sec7(gD7.sheet.hud, 's_hslots'), Object.assign({ partial: true }, chD), { own: true }), nobody = RT(gD7, sec7(gD7.sheet.hud, 's_hslots'), chD, {});
        const f12 = Array.from({ length: 12 }, (_, i) => ({ id: 'f_c' + i, key: 'C' + i, kind: 'number', def: 0, min: 0, max: 9, vis: 'all', edit: 'owner', counter: true }));
        const s12 = cleanSystem({ v: 1, name: 'C', fields: f12, rolls: [], sheet: { sections: [{ id: 's_many', title: 'Tallies', resetAll: true, fields: f12.map(f => ({ id: f.id })) }], hud: { sections: [{ id: 's_hm', title: 'Many', resetAll: true, fields: f12.map(f => ({ id: f.id })) }] } } }, GV7);
        const v12 = {}; f12.forEach(f => { v12[f.id] = 3; }); const t12 = RT(s12, sec7(s12.sheet, 's_many'), { id: 'c_m', values: v12 }, { gm: true }), w12 = S.validateSystem(s12, F).warnings.filter(w => w.prop === 'resetAll').map(w => w.message);
        check('HUD frame HF4b: Reset all\'s targets (run for real) — a pool not full goes back to its max, a counter away from its start back to its default; full pools and counters at their start are left; the viewer\'s rights (a GM-edit pool is the GM\'s, a teammate\'s copy and a stranger reset nothing); a section with no pool or counter has no button; at most 10, and validateSystem says so in either layout',
            tv(tSl) === j([['f_sl1', { cur: 2 }], ['f_sl2', { cur: 2 }]]) && tv(tSp) === tv(tSl) && tv(tSt) === j([['f_dsv', 0], ['f_hp', { cur: 10 }]]) && tSt.targets[1].label === 'Hit points' && tSt.targets[0].label === 'Death saves' && tSt.allowed === 2 && asOwner.allowed === 2 && part.allowed === 0 && nobody.allowed === 0 && tv(t3) === j([['f_hp', { cur: 12 }]])
            && full.any === true && full.targets.length === 0 && noPools.any === false && tSl.any === true
            && tv(asOwner) === j([['f_sl2', { cur: 2 }]]) && tv(asGm) === tv(tSl) && part.targets.length === 0 && nobody.targets.length === 0
            && t12.targets.length === 10 && t12.targets[9].fieldId === 'f_c9' && j(w12) === j(['Reset all resets the first 10 in Tallies.', 'Reset all resets the first 10 in the HUD' + String.fromCharCode(8217) + 's Many.'])
            && S.validateSystem(gD7, F).warnings.every(w => w.prop !== 'resetAll'), j([tSl, tSt, t3, asOwner, w12]));
        // one press leaves nothing to reset: a default off the step grid and a fractional max are sent as the field stores them; a counter that feeds
        // a pool's max is reset first, and the pool fills to the max it will have (raised or lowered)
        const mk2 = (fields, secFields) => cleanSystem({ v: 1, name: 'M', fields, rolls: [], sheet: { sections: [{ id: 's_x', title: 'X', resetAll: true, fields: secFields.map(id => ({ id })) }] } }, GV7);
        const press = (sys, ch) => { const r1 = RT(sys, sys.sheet.sections[0], ch, { gm: true }), after = { id: ch.id, values: Object.assign({}, ch.values) }; r1.targets.forEach(t => { const e = S.applyEdit(sys, after, t.fieldId, t.value, F, {}); if (e.ok) after.values[t.fieldId] = e.value; }); return { r1, again: RT(sys, sys.sheet.sections[0], after, { gm: true }), after }; };
        const grid = mk2([{ id: 'f_am', key: 'Ammo', kind: 'number', def: 2, min: 1, step: 2, max: 9, vis: 'all', counter: true }], ['f_am']), pG = press(grid, { id: 'c', values: { f_am: 5 } });
        const frac = mk2([{ id: 'f_st', key: 'ST', kind: 'number', def: 10, vis: 'all' }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: 'ST / 3', def: 'max', min: 0, vis: 'all' }], ['f_hp']), pF = press(frac, { id: 'c', values: { f_hp: { cur: 1 } } });
        const up = mk2([{ id: 'f_aid', key: 'Aid', kind: 'number', def: 0, min: 0, max: 9, vis: 'all', counter: true }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '20 + Aid', def: 'max', min: 0, vis: 'all' }], ['f_hp', 'f_aid']), pU = press(up, { id: 'c', values: { f_hp: { cur: 10 }, f_aid: 5 } });
        const down = mk2([{ id: 'f_ex', key: 'Exh', kind: 'number', def: 0, min: 0, max: 6, vis: 'all', counter: true }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '20 - 2 * Exh', def: 'max', min: 0, vis: 'all' }], ['f_hp', 'f_ex']), pDn = press(down, { id: 'c', values: { f_hp: { cur: 5 }, f_ex: 3 } });
        const skill = mk2([{ id: 'f_sk', key: 'Tally', kind: 'skill', def: 0, min: 0, max: 5, vis: 'all', counter: true }], ['f_sk']), pS = press(skill, { id: 'c', values: { f_sk: 4 } });
        const atStart = RT(skill, skill.sheet.sections[0], { id: 'c', values: { f_sk: 0 } }, { gm: true }), unsetC = RT(skill, skill.sheet.sections[0], { id: 'c', values: {} }, { gm: true });
        const warnN = n => { const fl = Array.from({ length: n }, (_, i) => ({ id: 'f_n' + i, key: 'N' + i, kind: 'number', def: 0, min: 0, max: 9, vis: 'all', counter: true })); return S.validateSystem(cleanSystem({ v: 1, name: 'N', fields: fl, rolls: [], sheet: { sections: [{ id: 's_n', title: 'N', resetAll: true, fields: fl.map(f => ({ id: f.id })) }] } }, GV7), F).warnings.filter(w => w.prop === 'resetAll').length; };
        check('HUD frame HF4b: one press leaves nothing to reset — a default off the step grid (Ammo def 2, step 2 from 1: 3) and a fractional max (ST / 3: 3) are sent as the field stores them; a counter feeding a pool\'s max is reset first and the pool fills to the max it will have (20 + Aid at Aid 5: 20, not 25; 20 - 2 x Exh at Exh 3: 20, not 14); a skill counter resets; a counter at its start, or never set, is not a target; the warning starts at 11',
            tv(pG.r1) === j([['f_am', 3]]) && pG.again.targets.length === 0 && tv(pF.r1) === j([['f_hp', { cur: 3 }]]) && pF.again.targets.length === 0
            && tv(pU.r1) === j([['f_aid', 0], ['f_hp', { cur: 20 }]]) && pU.again.targets.length === 0 && j(pU.after.values.f_hp) === j({ cur: 20 })
            && tv(pDn.r1) === j([['f_ex', 0], ['f_hp', { cur: 20 }]]) && pDn.again.targets.length === 0 && tv(pS.r1) === j([['f_sk', 0]]) && pS.again.targets.length === 0 && atStart.targets.length === 0 && unsetC.targets.length === 0
            && warnN(10) === 0 && warnN(11) === 1, j([pG.r1, pF.r1, pU.r1, pU.again, pDn.r1, pDn.again, pS.r1, warnN(10), warnN(11)]));
        // commitMany and revertLast, run for real on a fake GM (and a fake player)
        const cmSrc = sh7.slice(sh7.indexOf('function commitMany('), sh7.indexOf('// One inventory change on the open sheet'));
        const rvSrc = (sh7.match(/function revertLast\(\) \{[\s\S]*?\n\}/) || [''])[0];
        const mkCM = (client, sys, ch, cw) => {
            const log = { deltas: [], toasts: [], sent: [] }, camp = { system: sys, chars: { [ch.id]: ch } };
            const api = new Function('getActiveCampaign', 'systemOf', 'isClient', 'canWrite', 'applyEdit', 'F', 'clone', 'afterCharChange', 'toast', 'renderViews', 'net', 'LIMITS', 'charById', 'fieldById', 'ownerSeesSame', 'var lastChange = null;\n' + cmSrc + '\n' + rvSrc + '\nreturn { commitMany: commitMany, revertLast: revertLast, last: function() { return lastChange; } };')(
                () => camp, () => sys, () => client, () => cw !== false, S.applyEdit, () => F, x => JSON.parse(JSON.stringify(x)), (c, whole, d) => log.deltas.push(JSON.parse(JSON.stringify(d))), m => log.toasts.push(m), () => {},
                () => ({ charEdits: (id, list) => { log.sent.push([id, JSON.parse(JSON.stringify(list))]); return { ok: true }; } }), LIMITS, id => camp.chars[id], S.fieldById, () => false);   // F4b review: Revert asks whether an item list's owner saw the change (these fields are not lists)
            return { api, ch, log };
        };
        const g1 = mkCM(false, gD7, JSON.parse(JSON.stringify(chD))); g1.api.commitMany(g1.ch, tSt.targets.map(t => ({ fieldId: t.fieldId, value: t.value })));
        const after1 = j([g1.ch.values.f_hp, g1.ch.values.f_dsv]), last1 = g1.api.last(); g1.api.revertLast(); const back1 = j([g1.ch.values.f_hp, g1.ch.values.f_dsv]);
        const g2 = mkCM(false, s12, { id: 'c_m', values: Object.assign({}, v12) }); g2.api.commitMany(g2.ch, f12.map(f => ({ fieldId: f.id, value: 0 })));
        const g3b = mkCM(false, gD7, JSON.parse(JSON.stringify(chD))); g3b.api.commitMany(g3b.ch, [{ fieldId: 'f_hp', value: { cur: 10 } }, { fieldId: 'f_nope', value: 1 }]);
        const pl = mkCM(true, gD7, JSON.parse(JSON.stringify(chD))); pl.api.commitMany(pl.ch, f12.map(f => ({ fieldId: f.id, value: 0 })));
        const gG = mkCM(false, gGm, JSON.parse(JSON.stringify(chD))); gG.api.commitMany(gG.ch, asGm.targets.map(t => ({ fieldId: t.fieldId, value: t.value })));   // a pool set to GM edits: the GM's own rules
        const nw = mkCM(false, gD7, JSON.parse(JSON.stringify(chD)), false); nw.api.commitMany(nw.ch, tSt.targets.map(t => ({ fieldId: t.fieldId, value: t.value })));   // a view that cannot write
        check('HUD frame HF4b: commitMany (run for real) — the GM\'s Reset all is ONE change (one delta with every value) and ONE Revert brings every value back; at most 10 values; one value that is not allowed changes nothing; the GM resets a pool set to GM edits by the GM\'s rules; a view that cannot write changes nothing; a player\'s goes as one batched edit of at most 10',
            g1.log.deltas.length === 2 && j(Object.keys(g1.log.deltas[0])) === j(['f_dsv', 'f_hp']) && after1 === j([{ cur: 10 }, 0]) && last1.fieldId === 'f_dsv' && last1.prev === 2 && j(last1.extra) === j({ f_hp: { cur: 3 } }) && back1 === j([{ cur: 3 }, 2]) && g1.log.toasts.includes('Reverted.')
            && g2.log.deltas.length === 1 && Object.keys(g2.log.deltas[0]).length === 10 && g2.ch.values.f_c10 === 3 && g2.ch.values.f_c0 === 0
            && g3b.log.deltas.length === 0 && j(g3b.ch.values.f_hp) === j({ cur: 3 }) && g3b.log.toasts.length === 1
            && pl.log.sent.length === 1 && pl.log.sent[0][0] === 'c_d' && pl.log.sent[0][1].length === 10 && pl.log.deltas.length === 0
            && gG.log.deltas.length === 1 && j(Object.keys(gG.log.deltas[0]).sort()) === j(['f_sl1', 'f_sl2']) && gG.log.toasts.length === 0 && nw.log.deltas.length === 0 && j(nw.ch.values.f_hp) === j({ cur: 3 }) && nw.api.last() === null, j([g1.log, last1, g2.log.deltas, g3b.log, pl.log.sent.length]));
        // the client's batch (the pending slice from net.js): applied at once; a refusal takes every value of it back to the host's copy, the changes still waiting laid over again
        const pend7 = nt7.slice(nt7.indexOf('// [netcheck:pending-start]'), nt7.indexOf('// [netcheck:pending-end]'));
        const mkPend7 = new Function('getActiveCampaign', 'SC', 'window', 'toast', '_charPending', '_charHost', pend7 + '\nreturn { charPendingDone: charPendingDone, reapplyPending: reapplyPending, noteHostCopy: noteHostCopy };');
        const campB = { id: 'camp1', system: pD7, chars: { c_d: { id: 'c_d', ownerId: 'u_p', values: { f_hp: { cur: 3 }, f_dsv: 2, f_sl1: { cur: 0 } } } } }, pendB = {}, hostB = {}, seenB = [];
        const PB = mkPend7(() => campB, () => S, { wpFormula: F, wpSheets: { charChanged: id => seenB.push(['ok', id]), editResult: (rid, ok, reason) => seenB.push([rid, ok, reason]) } }, () => {}, pendB, hostB), cb = campB.chars.c_d;
        PB.noteHostCopy('c_d', cb.values);
        cb.values.f_hp = { cur: 10 }; cb.values.f_dsv = 0; pendB.b1 = { charId: 'c_d', fieldId: 'f_hp', value: { cur: 10 }, prev: { cur: 3 }, batch: [{ fieldId: 'f_hp', value: { cur: 10 }, prev: { cur: 3 } }, { fieldId: 'f_dsv', value: 0, prev: 2 }], timer: null };
        cb.values.f_sl1 = { cur: 1 }; pendB.v2 = { charId: 'c_d', fieldId: 'f_sl1', value: { cur: 1 }, prev: { cur: 0 }, timer: null };
        cb.values = { f_hp: { cur: 5 }, f_dsv: 1, f_sl1: { cur: 0 } }; PB.noteHostCopy('c_d', cb.values); PB.reapplyPending('c_d');   // a newer copy: everything still waiting is laid over it
        const midB = j(cb.values); PB.charPendingDone('b1', false, 'slow'); const afterB = j(cb.values);
        pendB.b2 = { charId: 'c_d', fieldId: 'f_hp', value: { cur: 10 }, prev: { cur: 5 }, batch: [{ fieldId: 'f_hp', value: { cur: 10 }, prev: { cur: 5 } }], timer: null }; PB.charPendingDone('b2', true);
        check('HUD frame HF4b: a player\'s batch (the real pending code) — a newer host copy gets every waiting value laid over it again; a refused batch takes ALL its values back to the host\'s last copy (never the one it was made on), the other changes still waiting kept; one answer for the batch',
            midB === j({ f_hp: { cur: 10 }, f_dsv: 0, f_sl1: { cur: 1 } }) && afterB === j({ f_hp: { cur: 5 }, f_dsv: 1, f_sl1: { cur: 1 } }) && !pendB.b1 && !!pendB.v2 && !pendB.b2 && j(seenB) === j([['b1', false, 'slow'], ['ok', 'c_d']]), j([midB, afterB, seenB]));
        check('HUD frame HF4b: the chip — drawn only behind sec.resetAll === true, in the header after the Pin; live decided when drawn (the real sheet or HUD, never the Layout preview or a pop-out), inert with nothing to reset; the client sends ONE char-edits message and keeps ONE pending entry for the batch',
            /var rsCh = sec\.resetAll === true \? resetChip\(sec, pctx\) : null;/.test(sh7) && /if \(pinCh\) head\.appendChild\(pinCh\);\n            if \(rsCh\) head\.appendChild\(rsCh\);/.test(sh7) && /\|\| chipNode \|\| pinCh \|\| rsCh\) \{/.test(sh7)
            && /var live = _fxLive && !\(ctx\.vctx && ctx\.vctx\.preview\) && !window\.wpPopout, targets = rt\.targets, on = live && targets\.length > 0;/.test(sh7)
            && /ch\.setAttribute\('aria-disabled', on \? 'false' : 'true'\);/.test(sh7)
            && /import \{[^}]*resetTargets[^}]*\} from '\.\/systemcore\.js';/.test(sh7) && (sh7.match(/resetChip\(/g) || []).length === 2
            && /try \{ net\.conns\[0\]\.send\(\{ type: 'char-edits', rid: rid, charId: charId, values: batch\.map\(/.test(nt7) && /_charPending\[rid\] = \{ charId: charId, fieldId: batch\[0\]\.fieldId, value: batch\[0\]\.value, prev: batch\[0\]\.prev, batch: batch, timer:/.test(nt7));
        // the chip, run for real on a small fake DOM
        const rcSrc = sh7.slice(sh7.indexOf('function resetChip('), sh7.indexOf('// Stage 5c / Stage 6 (L4): the pinned band'));
        const fe = (tag, cls, text) => { const e = { tag, className: cls || '', textContent: text || '', children: [], attrs: {}, dataset: {}, title: '', tabIndex: -1, on: {}, inModal: false, appendChild(x) { this.children.push(x); return x; }, setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener(k, f) { this.on[k] = f; }, closest(q) { return q === '#systemModal' && e.inModal ? {} : null; } }; return e; };
        const chipRun = (sys, sc, ch, o) => { o = o || {}; const calls = [], redraws = [], pend = o.pend || {};
            const make = new Function('resetTargets', 'F', '_fxLive', 'window', 'el', 'iconNode', 'commitMany', 'renderViews', '_stepPend', rcSrc + '\nreturn resetChip;')(S.resetTargets, () => F, o.fxLive !== false, { wpPopout: o.popout || null }, fe, (v, c) => fe('span', c + ' wp-glyph'), (c, list) => calls.push(JSON.parse(JSON.stringify(list))), id => redraws.push(id), pend);
            const chip = make(sc, { sys, c: ch, gm: !!o.gm, own: !!o.own, vctx: { preview: !!o.preview } }), ev = k => ({ key: k, preventDefault() {}, stopPropagation() {} });
            return { chip, calls, redraws, pend, click() { chip.on.click(ev()); }, key(k) { chip.on.keydown(ev(k)); }, text: chip && chip.children[1] ? chip.children[1].textContent : null }; };
        const hst = sec7(gD7.sheet.hud, 's_hstat'), cln = () => JSON.parse(JSON.stringify(chD));
        const cGm = chipRun(gD7, hst, cln(), { gm: true, pend: { 'c_d|f_dsv': { timer: null, value: '1' }, 'c_x|f_dsv': { timer: null, value: '1' } } }), a0 = j([cGm.chip.attrs, cGm.chip.tabIndex, cGm.chip.dataset.reset, cGm.text, cGm.chip.title]);
        cGm.key('a'); const k0 = cGm.calls.length; cGm.key('Enter');
        const chT = cln(), cT = chipRun(gD7, hst, chT, { gm: true }); chT.values.f_hp = { cur: 10 }; cT.click();   // the values moved after the chip was drawn
        const chN = cln(), cN = chipRun(gD7, hst, chN, { gm: true }); chN.values.f_hp = { cur: 10 }; chN.values.f_dsv = 0; cN.click();
        const cM = chipRun(gD7, hst, cln(), { gm: true }); cM.chip.inModal = true; cM.click();
        const cP = chipRun(gD7, hst, cln(), { gm: true, preview: true }); cP.click(); const cO = chipRun(gD7, hst, cln(), { gm: true, popout: {} }), cF = chipRun(gD7, hst, cln(), { gm: true, fxLive: false });
        const allGm = JSON.parse(JSON.stringify(fx7('hud-d20'))); ['f_sl1', 'f_sl2', 'f_sl3'].forEach(id => { allGm.fields.find(f => f.id === id).edit = 'gm'; }); const sAll = cleanSystem(allGm, GV7);
        const cOnlyGm = chipRun(sAll, sec7(sAll.sheet.hud, 's_hslots'), cln(), { own: true }), cFull = chipRun(gD7, sec7(gD7.sheet.hud, 's_hslots'), { id: 'c_d', values: { f_level: 5 } }, { gm: true }), cNone = chipRun(gD7, sec7(gD7.sheet.hud, 's_hchk'), cln(), { gm: true }), cLong = chipRun(pD7, sec7(pD7.sheet.hud, 's_hslots'), cln(), { own: true });
        check('HUD frame HF4b: the chip (run for real) — a button chip with its words, focusable, marked with its section; Enter or a click resets the targets as they are AT THE CLICK (a minus/plus burst of this character\'s counters dropped first, another character\'s kept) and a click with nothing left only redraws; nothing in the System editor; inert and saying why in the Layout preview, a pop-out, a view whose pools are the GM\'s alone, and when everything is full; no chip without a pool or a counter; a player\'s Long rest is live',
            a0 === j([{ role: 'button', 'aria-disabled': 'false' }, 0, 's_hstat', 'Reset all', 'Resets Death saves, Hit points']) && k0 === 0 && j(cGm.calls) === j([[{ fieldId: 'f_dsv', value: 0 }, { fieldId: 'f_hp', value: { cur: 10 } }]]) && !('c_d|f_dsv' in cGm.pend) && ('c_x|f_dsv' in cGm.pend)
            && j(cT.calls) === j([[{ fieldId: 'f_dsv', value: 0 }]]) && cN.calls.length === 0 && j(cN.redraws) === j(['c_d']) && cM.calls.length === 0
            && cP.chip.attrs['aria-disabled'] === 'true' && /on the sheet itself/.test(cP.chip.title) && cP.calls.length === 0 && cO.chip.attrs['aria-disabled'] === 'true' && cF.chip.attrs['aria-disabled'] === 'true'
            && cOnlyGm.chip.attrs['aria-disabled'] === 'true' && cOnlyGm.chip.title === 'Only the GM resets these' && cOnlyGm.chip.tabIndex === 0 && cFull.chip.tabIndex === 0 && cFull.chip.attrs['aria-disabled'] === 'true' && /^Nothing to reset/.test(cFull.chip.title) && cNone.chip === null
            && cLong.text === 'Long rest' && cLong.chip.attrs['aria-disabled'] === 'false' && cLong.chip.tabIndex === 0, j([a0, cGm.calls, cT.calls, cN.redraws, cOnlyGm.chip && cOnlyGm.chip.title, cFull.chip && cFull.chip.title]));
        // the focus: a Reset all pressed from the keyboard keeps it (focusKeyOf / restoreFocus, run for real)
        const fkSrc = (sh7.match(/function focusKeyOf\(root\) \{[^\n]*/) || [''])[0], rfSrc = (sh7.match(/function restoreFocus\(root, k\) \{[^\n]*/) || [''])[0], doc7 = { activeElement: null }, focused = [];
        const FK = new Function('document', 'PIN_GID', fkSrc + '\n' + rfSrc + '\nreturn { focusKeyOf: focusKeyOf, restoreFocus: restoreFocus };')(doc7, /^g_[A-Za-z0-9_]{1,24}$/);
        doc7.activeElement = { dataset: { reset: 's_hstat' }, closest: () => null }; const fk7 = FK.focusKeyOf({ contains: () => true });
        FK.restoreFocus({ querySelector: q => (q === '.sheet-sec-title [data-reset="s_hstat"]' ? { focus: () => focused.push('chip') } : null) }, fk7);
        doc7.activeElement = { dataset: { reset: 's_x"] body' }, closest: () => null }; const fkBad = FK.focusKeyOf({ contains: () => true });
        check('HUD frame HF4b: the focus stays on Reset all after the redraw it causes (its section is the key); a key that is not a section id is never used in a selector',
            j(fk7) === j({ reset: 's_hstat' }) && j(focused) === j(['chip']) && fkBad === null, j([fk7, focused, fkBad]));
        check('HUD frame HF4b: the editor — a Reset row under a section that places a pool or a counter (or already has Reset all): its checkbox, and while it is ticked its own words; each set or cleared by its exact class; more than 10 of them says so in the row itself',
            /if \(canReset \|\| sec\.resetAll\) \{/.test(sh7) && /var rsc = el\('input', 'sys-sec-resetall'\); rsc\.type = 'checkbox'; rsc\.checked = !!sec\.resetAll;/.test(sh7) && /if \(sec\.resetAll\) rsRow\.appendChild\(input\('sys-sec-resettext field', sec\.resetText,/.test(sh7)
            && /if \(t\.classList\.contains\('sys-sec-resetall'\)\) \{ if \(t\.checked\) sec\.resetAll = true; else delete sec\.resetAll; markDirty\(\); renderLayout\(\); return true; \}/.test(sh7)
            && /else if \(t\.classList\.contains\('sys-sec-resettext'\)\) \{ if \(t\.value\.trim\(\)\) sec\.resetText = t\.value\.slice\(0, LIMITS\.label\); else delete sec\.resetText; \}/.test(sh7)
            && /if \(sec\.resetAll && nRs > LIMITS\.editBatch\) rsRow\.appendChild\(el\('span', 'sys-warn-line sys-reset-note', 'Reset all resets the first ' \+ LIMITS\.editBatch \+ ' of these ' \+ nRs \+ '\.'\)\);/.test(sh7)
            && (() => { const disp = (sh7.match(/c\.indexOf\('sys-[a-z0-9-]+'\)/g) || []).map(m => m.slice(11, -2)), cls = new Set(sh7.match(/sys-[a-z0-9-]+/g) || []); return ['sys-sec-resetall', 'sys-sec-resettext'].every(n => disp.every(t => n.indexOf(t) < 0) && [...cls].every(o => o === n || o.indexOf(n) < 0)); })());
        // the tour's seed and its one-shot migration (seed 2), run for real
        const tut7 = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8').replace(/\r\n/g, '\n');
        const fnT7 = name => { const i = tut7.indexOf('function ' + name + '('); let d = 0; const k = tut7.indexOf('{', i); for (let p = k; p < tut7.length; p++) { if (tut7[p] === '{') d++; else if (tut7[p] === '}') { d--; if (d === 0) return tut7.slice(i, p + 1); } } return ''; };
        const T7 = new Function(['tutorialEffects', 'tutorialHud', 'tutorialSystem', 'tutorialCharacter', 'ensureTutorialSheet'].map(fnT7).join('\n') + '\nvar TUTORIAL_ART_URL = "/x/";\nreturn { sys: tutorialSystem, hud: tutorialHud, ch: tutorialCharacter, ensure: ensureTutorialSheet };')();
        const hfx = sys => sys.sheet.hud.sections.find(x => x.id === 's_tut_hfx');
        const old7 = () => { const s = T7.sys(); delete s.sheet.hud.sections.find(x => x.id === 's_tut_hchk').inline; delete hfx(s).resetAll; return { system: s, chars: { c_tut_bren: T7.ch('/x/') }, items: {} }; };
        const m1 = old7(), r71 = T7.ensure(m1), m2 = old7(); hfx(m2.system).title = 'My condition'; T7.ensure(m2); const m3 = old7(); m3.tutorialSeed = 1; T7.ensure(m3); const m4 = old7(); m4.tutorialSeed = 2; T7.ensure(m4);
        const edits7 = [s => { s.collapsible = true; }, s => { s.tab = 't_tut_hact'; }, s => { s.cols = 2; }, s => { s.fields.pop(); }].map(fn => { const m = old7(); fn(hfx(m.system)); T7.ensure(m); return !('resetAll' in hfx(m.system)); });
        check('HUD frame HF4b: the tour\'s HUD Condition section carries Reset all (HP back to full); an older tutorial gains it once (seed 2, which a fresh build carries) and only on the untouched seed; a section someone changed, or a tutorial already past it, is left alone',
            T7.hud().sections.find(x => x.id === 's_tut_hfx').resetAll === true && r71 === true && hfx(m1.system).resetAll === true && m1.system.sheet.hud.sections.find(x => x.id === 's_tut_hchk').inline === true && m1.tutorialSeed === 2
            && !('resetAll' in hfx(m2.system)) && edits7.every(Boolean) && m2.tutorialSeed === 2 && hfx(m3.system).resetAll === true && m3.tutorialSeed === 2 && !('resetAll' in hfx(m4.system))
            && /camp\.tutorialSeed = 2;[^\n]*\n    camp\.vtt = tutorialVtt\(\);/.test(tut7), j([r71, m1.tutorialSeed, hfx(m2.system), hfx(m4.system)]));
        // window.wpSystemCore (what net.js and the other plain scripts call) carries every name the module exports, and nothing else — a new
        // export missing there fails only on a live table (the host's char-edits handler did, before this check)
        const core7 = fs.readFileSync(path.join(app, 'scripts', 'systemcore.js'), 'utf8').replace(/\r\n/g, '\n');
        const apiKeys = ((core7.match(/\nvar API = \{([^\n]*)\};/) || [])[1] || '').split(',').map(x => x.split(':')[0].trim()).filter(Boolean).sort(), expKeys = ((core7.match(/\nexport \{([^}]*)\};/) || [])[1] || '').split(',').map(x => x.trim()).filter(Boolean).sort();
        check('HUD frame HF4b: window.wpSystemCore carries exactly the names systemcore exports (cleanCharEdits and resetTargets among them), so the host\'s handlers find every helper they call',
            apiKeys.length >= 90 && j(apiKeys) === j(expKeys) && apiKeys.includes('cleanCharEdits') && apiKeys.includes('resetTargets'), j([apiKeys.filter(k => !expKeys.includes(k)), expKeys.filter(k => !apiKeys.includes(k))]));
        const css7 = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, '\n'), b7 = css7.slice(css7.indexOf('/* HF4b (H13)')), r7 = b7.split('\n').filter(l => /^  [.@]/.test(l));
        check('HUD frame HF4b: the chip\'s CSS lives in the HUD block, gated by the reset chip (greyed and unlit when inert); the tour and Help describe Reset all',
            r7.length >= 1 && r7.every(l => l.split('{')[0].split(',').every(m => /\.sheet-sec-reset\b/.test(m))) && /\[aria-disabled="true"\]/.test(r7[0])
            && /A section can carry <b>Reset all<\/b> \(or your own words, like <i>Long rest<\/i>\) in its header: its pools back to full, its counters back to their start\./.test(tut7)
            && /<b>Reset all<\/b>: a section holding pools or counters can show a button in its header \(its text is yours, e\.g\. <i>Long rest<\/i>\) that fills its pools back to full and sets its counters back to their start \(players reset their own\)\./.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')), j(r7));
    }

    /* ---- Stage 6 HUD frame (HF5a): values in roll labels (H3) — the label and the button run for real, the players' scrub, the validator, the privacy names ---- */
    {
        const sh8 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), DC8 = await import(url('dicecore.js'));
        const BS8 = String.fromCharCode(92), PM8 = String.fromCharCode(0xB1), DASH8 = String.fromCharCode(0x2014), BEL8 = String.fromCharCode(7), EMO8 = String.fromCharCode(0xD83D, 0xDE00);
        const fx8 = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8')), GV8 = { F, gmView: true }, PV8 = { F, gmView: false };
        const gD8 = cleanSystem(fx8('hud-d20'), GV8), pD8 = cleanSystem(fx8('hud-d20'), PV8), g38 = cleanSystem(fx8('hud-3d6'), GV8), p38 = cleanSystem(fx8('hud-3d6'), PV8);
        const rl8 = (sys, id) => sys.rolls.find(r => r.id === id), lone8 = s => [...s].some(ch => ch.length === 1 && ch.charCodeAt(0) >= 0xD800 && ch.charCodeAt(0) <= 0xDFFF);
        // the real slice — rollLabel, labelSecret and rollNode — on a fake DOM
        const rnSrc = sh8.slice(sh8.indexOf('var LABEL_CTRL_G = '), sh8.indexOf('// A roll from this character\'s sheet: the dice feature on'));
        const fe8 = (tag, cls, text) => ({ tag, className: cls || '', textContent: text || '', children: [], title: '', disabled: false, firstChild: null, on: {}, appendChild(x) { this.children.push(x); if (!this.firstChild) this.firstChild = x; return x; }, insertBefore(x) { this.children.unshift(x); this.firstChild = x; return x; }, addEventListener(k, f) { this.on[k] = f; } });
        const btn = (sys, r, ch, o) => { o = o || {}; const rolls = [], toasts = [], all = S.resolveAll(sys, ch, F, null);
            const mk = new Function('F', 'net', 'isClient', 'captionParts', 'labelNames', 'labelGmNames', 'gmDerivedNames', 'gmEffectNames', 'el', 'iconNode', 'canRoll', 'sheetRoll', 'toast', 'ROLL_TONE_CLS', 'getActiveCampaign', 'charById', 'resolveAll', 'tokenCtxFor', rnSrc + '\nreturn { rollLabel: rollLabel, labelSecret: labelSecret, rollNode: rollNode };')(
                () => (o.noF ? null : F), () => o.net || null, () => !!o.client, S.captionParts, S.labelNames, S.labelGmNames, S.gmDerivedNames, S.gmEffectNames, fe8, (v, c) => fe8('span', c), () => true, (e, cid, expr, label, opts) => rolls.push([cid, expr, label, opts]), t => toasts.push(t), { primary: ' p' }, () => ({ chars: {} }), () => null, S.resolveAll, () => null);
            const box = mk.rollNode(r, ch, sys, all.vars), b = box.children[0]; return { text: b.textContent, rolls, toasts, click() { b.on.click({}); }, secret: mk.labelSecret(sys, all.vars, r.label) }; };
        const chA = { id: 'c_a', values: { f_str: 14, f_level: 5 } }, host = { active: true, role: 'host' };
        const bAtk = btn(gD8, rl8(gD8, 'r_atk'), chA), bAtkH = btn(gD8, rl8(gD8, 'r_atk'), chA, { net: host }), bTrap = btn(gD8, rl8(gD8, 'r_trap'), chA, { net: host }), bTrapOff = btn(gD8, rl8(gD8, 'r_trap'), chA), bTrapP = btn(pD8, rl8(pD8, 'r_trap'), chA, { net: { active: true, role: 'client' }, client: true });
        bAtk.click(); bAtkH.click(); bTrap.click(); bTrapOff.click(); bTrapP.click();
        const b3 = btn(g38, rl8(g38, 'r_punch'), { id: 'c_3', values: { f_dx: 12, f_brawl: 2 } }), bNoF = btn(gD8, rl8(gD8, 'r_atk'), chA, { noF: true }), bPlain = btn(gD8, rl8(gD8, 'r_dmg'), chA, { net: host }); bPlain.click();
        check('HUD frame HF5a: a roll\'s label shows its value (run for real) — d20 Attack ({' + PM8 + 'AtkBonus}) reads "Attack (+5)" at STR 14, Level 5 (signed), 3d6 Attack ({Skill.Brawling}) "Attack (10)" (ranks 2 + DX 12 - 4, unsigned); the click rolls the formula under the label as shown; a plain label and a label without the engine are as written',
            bAtk.text === 'Attack (+5)' && j(bAtk.rolls) === j([['c_a', 'd20 + STRmod + Prof', 'Attack (+5)', undefined]]) && bAtk.toasts.length === 0 && b3.text === 'Attack (10)' && bNoF.text === 'Attack ({' + PM8 + 'AtkBonus})' && bPlain.text === 'Damage' && j(bPlain.rolls) === j([['c_a', '1d8 + STRmod', 'Damage', undefined]]), j([bAtk.text, bAtk.rolls, b3.text, bNoF.text, bPlain.rolls]));
        check('HUD frame HF5a: a public roll never carries a GM-only value — on the host in a session, Trap save ({GMFig}) rolls PRIVATE with a toast naming the field, while Attack (+5) stays public; with no table nothing is private; a player holds the scrubbed "Trap save" (nothing left to judge)',
            bTrap.text === 'Trap save (0)' && j(bTrap.rolls) === j([['c_a', 'd20 + DEXmod', 'Trap save (0)', { priv: true }]]) && bTrap.toasts.length === 1 && /GM-only value \(GMFig\)/.test(bTrap.toasts[0]) && bTrap.secret === 'GMFig'
            && j(bAtkH.rolls) === j([['c_a', 'd20 + STRmod + Prof', 'Attack (+5)', undefined]]) && bAtkH.secret === '' && bAtkH.toasts.length === 0 && bTrapOff.secret === '' && bTrapOff.rolls[0][3] === undefined && bTrapOff.toasts.length === 0
            && bTrapP.text === 'Trap save' && bTrapP.secret === '' && j(bTrapP.rolls) === j([['c_a', 'd20 + DEXmod', 'Trap save', undefined]]), j([bTrap.text, bTrap.rolls, bTrap.toasts, bAtkH.rolls, bTrapOff.rolls, bTrapP.text]));
        // a GM-only effect on a value the label shows makes the GM's roll private too (gmEffectNames through the render's resolver)
        const fxSys = cleanSystem({ v: 1, name: 'E', fields: [{ id: 'f_a', key: 'A', kind: 'number', def: 3, vis: 'all' }, { id: 'f_fx', key: 'Effects', kind: 'effects', vis: 'all' }], rolls: [{ id: 'r_a', label: 'Swing ({A})', formula: 'd6 + A', vis: 'all' }], effects: [{ id: 'e_g', name: 'Blessed', vis: 'gm', mods: [{ f: 'f_a', op: 'add', v: 2 }] }, { id: 'e_p', name: 'Rage', mods: [{ f: 'f_a', op: 'add', v: 1 }] }] }, GV8);
        const chG = () => ({ id: 'c_e', values: { f_fx: [{ id: 'x_1', ref: 'e_g', on: true }] } }), bFxG = btn(fxSys, fxSys.rolls[0], chG(), { net: host }), bFxP = btn(fxSys, fxSys.rolls[0], { id: 'c_e', values: { f_fx: [{ id: 'x_2', ref: 'e_p', on: true }] } }, { net: host });
        const bFxC = btn(fxSys, fxSys.rolls[0], chG(), { net: { active: true, role: 'client' }, client: true }), bFxI = btn(fxSys, fxSys.rolls[0], chG(), { net: { active: false, role: 'host' } }); bFxG.click(); bFxP.click(); bFxC.click(); bFxI.click();
        check('HUD frame HF5a: a value a GM-only effect changed makes the host\'s roll private (Swing ({A}) at A 3 + 2 reads "Swing (5)" and goes to the GM alone); a public effect leaves it public; a player\'s own copy, and a host whose table is not up, never mark a roll private (the host judges a player\'s roll)',
            bFxG.text === 'Swing (5)' && bFxG.secret === 'A' && j(bFxG.rolls[0][3]) === j({ priv: true }) && bFxP.text === 'Swing (4)' && bFxP.secret === '' && bFxP.rolls[0][3] === undefined
            && bFxC.text === 'Swing (5)' && bFxC.secret === '' && bFxC.rolls[0][3] === undefined && bFxC.toasts.length === 0 && bFxI.secret === '' && bFxI.rolls[0][3] === undefined, j([bFxG.text, bFxG.secret, bFxP.text, bFxP.secret, bFxC.secret, bFxI.secret]));
        // what the dice path must accept: a text or select value prints a dash (the engine yields numbers and booleans only, as in a caption), a long
        // result is cut to 60, a label whose own cap split a surrogate pair loses the lone half, a value that fails prints a dash
        const ctlSys = cleanSystem({ v: 1, name: 'C', fields: [{ id: 'f_m', key: 'Mode', kind: 'select', options: ['a' + BEL8 + 'b' + BEL8 + 'c'] }, { id: 'f_a', key: 'A', kind: 'number', def: 5 }, { id: 'f_on', key: 'On', kind: 'toggle', def: true }], rolls: [{ id: 'r_m', label: 'Do {Mode}', formula: 'd6' }, { id: 'r_l', label: 'x'.repeat(48) + ' {A} {A} {A}', formula: 'd6' }, { id: 'r_e', label: 'Zap ({Nope})', formula: 'd6' }, { id: 'r_b', label: '{On} {A}', formula: 'd6' }] }, GV8);
        const lbOf = (id, vals) => btn(ctlSys, rl8(ctlSys, id), { id: 'c_c', values: vals || {} }).text, capM = S.captionParts(ctlSys, { id: 'c_c', values: {} }, F, 'Do {Mode}', null);
        const lMode = lbOf('r_m'), lLong = lbOf('r_l', { f_a: 1000000 }), rawS8 = { id: 'r_s', label: '{A}' + EMO8.repeat(28) + String.fromCharCode(0xD83D), formula: 'd6' }, lSurr = btn(ctlSys, rawS8, { id: 'c_c', values: {} }).text, lErr = lbOf('r_e'), lBool = lbOf('r_b');
        check('HUD frame HF5a: the label the dice path gets — a text or select value prints a dash, as a caption does; a long result is cut to 60; a label whose own 60 cap split a surrogate pair loses the lone half; a value that fails prints a dash; a toggle reads yes; each one passes dicecore.cleanLabel',
            capM.length === 2 && !!capM[1].error && lMode === 'Do ' + DASH8 && lLong.length === 60 && lLong.indexOf('x'.repeat(48) + ' 1000000 ') === 0 && rawS8.label.length === 60 && lone8(rawS8.label) && lSurr === '5' + EMO8.repeat(28) && !lone8(lSurr)
            && lErr === 'Zap (' + DASH8 + ')' && lBool === 'yes 5' && [lMode, lLong, lSurr, lErr, lBool].every(l => DC8.cleanLabel(l) !== null && DC8.cleanLabel(l) !== ''), j([lMode, lLong, lSurr.length, lErr, lBool]));
        // the players' scrub
        const scrub = labels => cleanSystem({ v: 1, name: 'G', fields: [{ id: 'f_g', key: 'G', kind: 'number', def: 1, vis: 'gm' }, { id: 'f_a', key: 'A', kind: 'number', def: 1 }], rolls: labels.map((lb, i) => ({ id: 'r_' + i, label: lb, formula: 'd6' })) }, PV8).rolls.map(r => r.label);
        const eight = Array.from({ length: 8 }, () => '{A}').join('');
        const scr = scrub(['Trap ({G})', 'Hit {G', 'Fire ' + eight + ' {G}', '{G}', 'Plain {A}', 'Both [{A}] - {G}', 'X: {G.max}', 'Sign ({' + PM8 + 'G})', 'Hi {!}']);
        check('HUD frame HF5a: the players\' view keeps only the plain text before a {...} that names a GM-only value (a trailing separator dropped; an unclosed "{" and a value past the 8th count too; "Roll" when nothing is left); a label naming no GM-only value is kept, brace and all; a second clean changes nothing (d20 Trap save ({GMFig}) reads "Trap save")',
            j(scr) === j(['Trap', 'Hit', 'Fire', 'Roll', 'Plain {A}', 'Both', 'X', 'Sign', 'Hi {!}']) && rl8(pD8, 'r_trap').label === 'Trap save' && rl8(gD8, 'r_trap').label === 'Trap save ({GMFig})' && rl8(pD8, 'r_atk').label === 'Attack ({' + PM8 + 'AtkBonus})' && rl8(p38, 'r_punch').label === 'Attack ({Skill.Brawling})'
            && j(cleanSystem(pD8, PV8).rolls) === j(pD8.rolls) && j(cleanSystem(p38, PV8).rolls) === j(p38.rolls) && j(scrub(scr)) === j(scr)
            && [gD8, pD8].every(s => s.sheet.hud.sections.find(x => x.id === 's_hatk').fields.some(p => p.roll === 'r_trap')) && rl8(gD8, 'r_trap').vis === 'all', j([scr, rl8(pD8, 'r_trap')]));
        // the validator
        const lw = sys => S.validateSystem(sys, F).warnings.filter(w => w.prop === 'label').map(w => w.message), vD = S.validateSystem(gD8, F), v3 = S.validateSystem(g38, F);
        const vSys = labels => cleanSystem({ v: 1, name: 'V', fields: [{ id: 'f_g', key: 'G', kind: 'number', def: 1, vis: 'gm' }, { id: 'f_m', key: 'Mode', kind: 'select', options: ['a'] }, { id: 'f_a', key: 'A', kind: 'number', def: 1 }], rolls: labels.map((lb, i) => Object.assign({ id: 'r_' + i, formula: 'd6' }, lb)) }, GV8);
        const vw = lw(vSys([{ label: 'Hi {!}' }, { label: '{d6}' }, { label: '{Nope}' }, { label: '{Mode}' }, { label: 'Trap ({G})' }, { label: 'Secret {G}', vis: 'gm' }, { label: 'Nine ' + eight + '{Nope}' }, { label: 'Fine {A} {Facing}' }, { label: 'No brace' }]));
        check('HUD frame HF5a: validateSystem checks a label\'s {...} like a caption\'s — a parse error, dice, an unknown name, a value that is not a number, a GM-only name in a visible roll (saying what players see instead), a ninth value; a GM-only roll, a facing name and a plain label pass; both fixtures validate with no error, the d20 one warning about Trap save',
            vw.length === 6 && /^Label: /.test(vw[0]) && vw[1] === 'Label: dice are not worked out in a label; put them in the formula.' && vw[2] === 'Label: unknown name "Nope".' && vw[3] === 'Label: "Mode" is not a number.' && vw[4] === 'Label: "G" is GM only, so players see only "Trap".' && vw[5] === 'Label: only the first 8 {' + String.fromCharCode(0x2026) + '} values are worked out; the rest show as written.'
            && vD.ok && j(lw(gD8)) === j(['Label: "GMFig" is GM only, so players see only "Trap save".']) && v3.ok && lw(g38).length === 0, j([vw, vD.errors, v3.errors]));
        // labelNames and the cleaner's control characters
        check('HUD frame HF5a: labelNames reads the first 8 {...} of a label as [{ name }], each name once (case folded), the sign stripped, dice and a parse error skipped, nothing without the engine; gmOnlyNames picks the GM-only ones from it; cleanRollDef now replaces EVERY control character in a label (the dice path refused a second one)',
            j(S.labelNames(F, 'A ({' + PM8 + 'AtkBonus}) {STRmod} {atkbonus} {1d6 + Prof} {!}')) === j([{ name: 'AtkBonus' }, { name: 'STRmod' }, { name: 'Prof' }]) && j(S.labelNames(F, eight + '{STRmod}')) === j([{ name: 'A' }]) && S.labelNames(F, 'no braces').length === 0 && S.labelNames(null, '{A}').length === 0
            && j(S.gmOnlyNames(gD8, S.labelNames(F, 'x {GMFig} {STRmod}'))) === j(['GMFig']) && S.cleanRollDef({ id: 'r_x', label: 'a' + BEL8 + 'b' + BEL8 + 'c', formula: 'd6' }, true).label === 'a b c' && DC8.cleanLabel(S.cleanRollDef({ id: 'r_x', label: 'a' + BEL8 + 'b' + BEL8 + 'c', formula: 'd6' }, true).label) === 'a b c');
        // namesFacing, run for real: a label showing a facing or stance value redraws on a finished turn
        const nfSrc = sh8.slice(sh8.indexOf('function namesFacing(sys) {'), sh8.indexOf('// A finished turn redraws the numbers that read facing'));
        const NF = new Function('F', 'capExpr', nfSrc + '\nreturn namesFacing;')(() => F, S.capExpr), nfSys = (rolls, fields) => ({ fields: fields || [{ key: 'A', formula: 'A' }], rolls });
        check('HUD frame HF5a: namesFacing (run for real) sees a roll label that shows a facing or stance value, so a finished turn redraws it; a plain label, no rolls, or a label naming a field of the system\'s own called Facing do not; a formula naming Facing still does',
            NF(nfSys([{ label: 'Hit ({Arc.front})' }])) === true && NF(nfSys([{ label: 'Hit ({' + PM8 + 'Posture})' }])) === true && NF(nfSys([{ label: 'Hit ({A})' }])) === false && NF(nfSys([{ label: 'Hit' }])) === false && NF(nfSys([])) === false && NF({ fields: [{ key: 'A', formula: 'A' }] }) === false
            && NF(nfSys([{ label: '{Facing}' }], [{ key: 'Facing', kind: 'number' }])) === false && NF({ fields: [{ key: 'X', formula: 'Facing + 1' }], rolls: [] }) === true);
        check('HUD frame HF5a (source): both roll buttons (the band and a section) are drawn with the system and the render\'s resolver, and nothing else builds one; the initiative roll resolves its label and its privacy the same way; the privacy check is the host\'s alone; the label input says so; the tour and Help describe it',
            /rollNode\(rollById\[q\.roll\], c, sys, all\.vars\)/.test(sh8) && /rollNode\(rollById\[pl\.roll\], c, sys, all\.vars\)/.test(sh8) && (sh8.match(/rollNode\(/g) || []).length === 3
            && /lbI = allI \? rollLabel\(r, sys, c, allI\.vars\) : r\.label, whyI = allI \? labelSecret\(sys, allI\.vars, r\.label\) : ''/.test(sh8) && /rollFor\(charId, r\.formula, lbI \|\| 'Initiative', \{ source: 'combat', priv: !!whyI, gmOnly: r\.vis === 'gm' \}\)/.test(sh8)
            && /if \(isClient\(\) \|\| !\(n && n\.active && n\.role === 'host'\)/.test(sh8) && /import \{[^}]*labelGmNames, gmEffectNames, labelNames[^}]*\} from '\.\/systemcore\.js';/.test(sh8) && sh8.indexOf('{formula} shows a value: Attack ({' + BS8 + 'u00b1AtkBonus})') > 0
            && /A roll&rsquo;s label can show a value: <code>Attack \(\{&plusmn;AtkBonus\}\)<\/code>\./.test(fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8'))
            && /<b>Values in labels<\/b>: a roll&rsquo;s label can carry <code>\{formula\}<\/code> values like a caption/.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')));
    }

    /* ---- Stage 6 HUD frame (HF5b): the built-in CombatRound (H8) — withRound and the resolver run for real, the validator, the fixtures, the views' round signature ---- */
    {
        const sh9 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), nt9 = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
        const fx9 = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8')), GV9 = { F, gmView: true }, PV9 = { F, gmView: false };
        const gD9 = cleanSystem(fx9('hud-d20'), GV9), pD9 = cleanSystem(fx9('hud-d20'), PV9), g39 = cleanSystem(fx9('hud-3d6'), GV9), p39 = cleanSystem(fx9('hud-3d6'), PV9), gB9 = cleanSystem(fx9('hud-bare'), GV9);
        const tc0 = { facing: null, stance: { posture: 0, elevation: 0 } }, tcJ = j(tc0);
        const w4 = S.withRound(tc0, { round: 4.7 }), wBig = S.withRound(tc0, { round: 1e9 }), wNeg = S.withRound(tc0, { round: -2 });
        check('HUD frame HF5b: withRound (run for real) — a NEW context carrying the combat\'s round, floored and kept within 0..9999, the facing and stance as they were, the input untouched; the context itself comes back for no context, no combat, or a round that is not a finite number',
            j(w4) === j({ facing: null, stance: { posture: 0, elevation: 0 }, combat: { round: 4 } }) && w4 !== tc0 && j(tc0) === tcJ && wBig.combat.round === 9999 && wNeg.combat.round === 0
            && S.withRound(null, { round: 2 }) === null && S.withRound(tc0, null) === tc0 && S.withRound(tc0, {}) === tc0 && S.withRound(tc0, { round: 'x' }) === tc0 && S.withRound(tc0, { round: NaN }) === tc0 && S.withRound(tc0, { round: Infinity }) === tc0 && S.withRound(undefined, { round: 2 }) === undefined, j([w4, wBig, wNeg]));
        // the built-in through the resolver and resolveAll: the round, 0 without one, a field of the system's own keeps the name, Round is no name and round() the function
        const cSys = cleanSystem({ v: 1, name: 'R', fields: [{ id: 'f_r', key: 'RoundNow', kind: 'formula', formula: 'CombatRound' }, { id: 'f_t', key: 'Tally', kind: 'formula', formula: 'CombatRound * 2 + round(2.5)' }, { id: 'f_c', key: 'C', kind: 'number', def: 1, caption: 'round {CombatRound}' }], rolls: [] }, GV9);
        const own9 = cleanSystem({ v: 1, name: 'O', fields: [{ id: 'f_cr', key: 'CombatRound', kind: 'number', def: 7 }, { id: 'f_r', key: 'RoundNow', kind: 'formula', formula: 'CombatRound' }], rolls: [] }, GV9);
        const ch9 = { id: 'c_9', values: {} }, ctx3 = S.withRound(tc0, { round: 3 });
        const r3 = S.resolveAll(cSys, ch9, F, ctx3), r0 = S.resolveAll(cSys, ch9, F, tc0), rN = S.resolveAll(cSys, ch9, F, null), rO = S.resolveAll(own9, ch9, F, ctx3);
        const vars3 = S.makeResolver(cSys, ch9, F, ctx3), evR = F.evaluate('Round', { vars: vars3 }), evF = F.evaluate('round(2.5)', { vars: vars3 }), evC = F.evaluate('CombatRound', { vars: vars3 }), evM = F.evaluate('CombatRound.max', { vars: vars3 });
        const fxR = cleanSystem({ v: 1, name: 'X', fields: [{ id: 'f_r', key: 'RoundNow', kind: 'formula', formula: 'CombatRound' }, { id: 'f_fx', key: 'Effects', kind: 'effects' }], rolls: [], effects: [{ id: 'e_b', name: 'Haste', mods: [{ f: 'f_r', op: 'add', v: 2 }] }] }, GV9);
        const rFx = S.resolveAll(fxR, { id: 'c_x', values: { f_fx: [{ id: 'x_1', ref: 'e_b', on: true }] } }, F, ctx3);
        check('HUD frame HF5b: CombatRound reads the round of the context (3), 0 with a context without a combat and 0 with none; a field of the system\'s own keyed CombatRound keeps the name (7, and its formula reads it); Round is still an unknown name, round(2.5) still the function, CombatRound.max no name; a caption reads it; an effect on a value reading it shows its base from the same round; validKey allows CombatRound and refuses Round',
            r3.f_r.value === 3 && r3.f_t.value === 9 && r0.f_r.value === 0 && rN.f_r.value === 0 && rO.f_cr.value === 7 && rO.f_r.value === 7 && evC.ok && evC.value === 3 && !evR.ok && /Unknown name/.test(evR.error.message) && evF.ok && evF.value === 3 && !evM.ok
            && j(S.captionParts(cSys, ch9, F, 'round {CombatRound}', r3.vars).map(p => p.text)) === j(['round ', '3']) && j(S.captionParts(cSys, ch9, F, 'round {CombatRound}', rN.vars).map(p => p.text)) === j(['round ', '0'])
            && rFx.f_r.value === 5 && rFx.f_r.base === 3 && S.validKey('CombatRound', F) && !S.validKey('Round', F) && !S.validKey('round', F), j([r3.f_r, r3.f_t, r0.f_r, rO.f_cr, rO.f_r, evR.error, evM.error, rFx.f_r]));
        const vC = S.validateSystem(cSys, F), vO = S.validateSystem(own9, F), vBad = S.validateSystem(cleanSystem({ v: 1, name: 'B', fields: [{ id: 'f_r', key: 'R', kind: 'formula', formula: 'Round + 1' }], rolls: [] }, GV9), F);
        check('HUD frame HF5b: validateSystem knows CombatRound as a number (a formula, a caption and a label may read it; a system\'s own field of that name is that field); Round alone is still an unknown name',
            vC.ok && vC.warnings.every(w => w.prop !== 'caption') && vO.ok && !vBad.ok && /Unknown name "Round"/.test(vBad.errors[0].message) && S.TOKEN_NAMES.indexOf('CombatRound') >= 0 && S.TOKEN_NAMES.indexOf('Round') < 0, j([vC.errors, vO.errors, vBad.errors]));
        // the fixtures: d20 RoundNow on the HUD band, 3d6 Turn's caption; 0 without a combat; the bare fixture reads 0 and never errs
        const chD9 = { id: 'c_d', values: {} }, dR = S.resolveAll(gD9, chD9, F, S.withRound(tc0, { round: 5 })), dP = S.resolveAll(pD9, chD9, F, S.withRound(tc0, { round: 5 })), d0 = S.resolveAll(gD9, chD9, F, tc0);
        const t3 = S.resolveAll(g39, { id: 'c_3', values: {} }, F, S.withRound(tc0, { round: 2 })), t3c = g39.fields.find(f => f.id === 'f_turn').caption, cap3 = S.captionParts(g39, { id: 'c_3', values: {} }, F, t3c, t3.vars).map(p => p.text).join(''), cap0 = S.captionParts(p39, { id: 'c_3', values: {} }, F, p39.fields.find(f => f.id === 'f_turn').caption, S.resolveAll(p39, { id: 'c_3', values: {} }, F, null).vars).map(p => p.text).join('');
        const bare9 = S.resolveAll(gB9, { id: 'c_b', values: {} }, F, S.withRound(tc0, { round: 9 })), bareR = S.makeResolver(gB9, { id: 'c_b', values: {} }, F, null)('CombatRound');
        check('HUD frame HF5b (both fixtures + bare): d20 RoundNow (a formula CombatRound) sits on the HUD band in the Quick figures group and reads 5 in a combat at round 5 (the players\' view too), 0 without; 3d6 Turn\'s caption "round {CombatRound}" reads "round 2" and "round 0"; the bare fixture resolves with a combat context without error and CombatRound reads 0 there; all three validate',
            gD9.fields.some(f => f.id === 'f_round' && f.formula === 'CombatRound') && j(gD9.sheet.hud.band.find(b => b.id === 'f_round')) === j({ id: 'f_round', g: 'g_hud' }) && j(pD9.sheet.hud.band.find(b => b.id === 'f_round')) === j({ id: 'f_round', g: 'g_hud' }) && dR.f_round.value === 5 && dP.f_round.value === 5 && d0.f_round.value === 0 && !dR.f_round.error
            && t3c === 'round {CombatRound}' && cap3 === 'round 2' && cap0 === 'round 0' && Object.keys(bare9).every(k => !bare9[k].error) && bareR === 0
            && S.validateSystem(gD9, F).ok && S.validateSystem(g39, F).ok && S.validateSystem(gB9, F).ok, j([dR.f_round, d0.f_round, cap3, cap0, bareR]));
        // namesFacing (run for real) treats CombatRound as built in, so a round change (or a turn) redraws a sheet that reads it
        const nfSrc9 = sh9.slice(sh9.indexOf('function namesFacing(sys) {'), sh9.indexOf('// A finished turn redraws the numbers that read facing'));
        const NF9 = new Function('F', 'capExpr', nfSrc9 + '\nreturn namesFacing;')(() => F, S.capExpr);
        check('HUD frame HF5b: namesFacing (run for real) sees CombatRound in a formula, a caption or a roll label; a system whose own field is CombatRound, or one only calling round(), is left alone',
            NF9({ fields: [{ key: 'X', formula: 'CombatRound' }], rolls: [] }) === true && NF9({ fields: [{ key: 'X', formula: '1', caption: 'round {CombatRound}' }], rolls: [] }) === true && NF9({ fields: [{ key: 'X', formula: '1' }], rolls: [{ label: 'Hit ({CombatRound})' }] }) === true
            && NF9({ fields: [{ key: 'CombatRound', formula: '1' }, { key: 'X', formula: 'CombatRound' }], rolls: [] }) === false && NF9({ fields: [{ key: 'X', formula: 'round(2.5)' }], rolls: [] }) === false);
        check('HUD frame HF5b (source): the sheet\'s and the hover card\'s token context carry the round through withRound; every view keeps a round signature beside its dial\'s and marks itself stale when it changes; the host\'s roll for a player merges the combat on the map they are on, right after its token context and before the resolver; no fin() outside systemcore; the tour and Help say what reads 0',
            /function combatOn\(mapId\) \{ var n = net\(\); return n && n\.combatFor && typeof mapId === 'string' \? n\.combatFor\(mapId\) : null; \}/.test(sh9)
            && /function tokenCtxFor\(charId, camp\) \{ var c = charById\(charId, camp\), t = c \? facingTarget\(c, camp\) : null; return t \? withRound\(tokenCtx\(t\.map, t\.tok, tokenFlags\(\)\), combatOn\(t\.mapId\)\) : null; \}/.test(sh9)
            && /return hoverLines\(sys, c, F\(\), withRound\(tokenCtx\(amH, w, tokenFlags\(\)\), combatOn\(midH\)\)\); \} catch \(e\) \{ return \[\]; \}/.test(sh9)
            && /function roundSigOf\(c, camp\) \{ var t = c \? facingTarget\(c, camp\) : null, cb = t \? combatOn\(t\.mapId\) : null; return cb && typeof cb\.round === 'number' \? String\(cb\.round\) : ''; \}/.test(sh9)
            && /_dialOn = JSON\.stringify\(tokenFlags\(\)\); _roundSig = roundSigOf\(c, camp\);/.test(sh9) && /v\.dialOn = JSON\.stringify\(tokenFlags\(\)\); v\.roundSig = roundSigOf\(c, camp\);/.test(sh9) && /dialOn: null, roundSig: '', redraw: null \}/.test(sh9)
            && /swapTokenControls\(p, c, camp\);\n        \}\n        var rsS = roundSigOf\(c, camp\); if \(rsS !== _roundSig\) \{ _roundSig = rsS; _dialStale = true; \}[^\n]*\n        if \(final && _dialStale\)/.test(sh9)
            && /swapTokenControls\(v\.panel, c, camp\);\n    \}\n    var rs = roundSigOf\(c, camp\); if \(rs !== v\.roundSig\) \{ v\.roundSig = rs; v\.dialStale = true; \}[^\n]*\n    if \(final && v\.dialStale\)/.test(sh9)
            && /import \{[^}]*labelNames, withRound, rowLvl, rowOn, cleanItemKey \} from '\.\/systemcore\.js';/.test(sh9)
            && /elevation: ruleQ\('elevation'\) \}\);[^\n]*\n            tcQ = SQ\.withRound\(tcQ, mapQ && own\(net\.combats, locQ\) \? net\.combats\[locQ\] : null\);[^\n]*\n            chQ = srcQ; varsQ = SQ\.makeResolver\(viewQ, chvQ, Fq, tcQ\);/.test(nt9)
            && !/\bfin\(/.test(nt9) && !/\bfin\(/.test(sh9)
            && /net\.combats = \{\}; combatAsked = \{\};\n[^\n]*\n[^\n]*\n    if \(window\.wpSheets && window\.wpSheets\.tokenTurned\) setTimeout\(function\(\) \{ window\.wpSheets\.tokenTurned\(null, true\); \}, 0\);/.test(nt9)
            && /Formulas can read <b>CombatRound<\/b>, the round of the combat on the character&rsquo;s map\./.test(fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8'))
            && /Formulas can read <b>CombatRound<\/b>, the round of the combat on the map of the character&rsquo;s token \(0 with no token, no combat, or offline; a pool&rsquo;s maximum, sight ranges and teammates&rsquo; lines always read 0, as they read Facing neutral\)\. A field of your own named CombatRound keeps the name\./.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')));
    }

    /* ---- Stage 6 HUD frame (HF5 review): the party strip reads the token's own map; a GM-only name anywhere in a label; the label at the click; rollInit, turnView, tokenTurned and the band run for real ---- */
    {
        const shR = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const fxR = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8')), GVR = { F, gmView: true }, PVR = { F, gmView: false };
        const gDR = cleanSystem(fxR('hud-d20'), GVR), g3R = cleanSystem(fxR('hud-3d6'), GVR), PMR = String.fromCharCode(0xB1);
        const tcR = { facing: null, stance: { posture: 0, elevation: 0 } }, flagsR = { turning: true, posture: true, elevation: true };
        // the hover card and the party strip: hoverLines carries the round; the strip reads the combat on the map the token stands on
        const hSys = cleanSystem({ v: 1, name: 'H', fields: [{ id: 'f_r', key: 'RoundNow', label: 'Round', kind: 'formula', formula: 'CombatRound', hover: true }], rolls: [] }, GVR), chH = { id: 'c_h', name: 'H', values: {} };
        const hl3 = S.hoverLines(hSys, chH, F, S.withRound(tcR, { round: 3 })), hl0 = S.hoverLines(hSys, chH, F, tcR), hlN = S.hoverLines(hSys, chH, F, null);
        const hlSrc = shR.slice(shR.indexOf('function hoverLinesForToken(w, camp'), shR.indexOf('/* ---------- the facing dial'));
        const campH = { id: 'k', activeItemId: 'm_a', system: hSys, chars: { c_h: chH }, items: { d_1: { type: 'doc' }, m_a: { type: 'map', whiteboard: [{ id: 't_x', isChar: true, charId: 'c_h', x: 0, y: 0 }] }, m_b: { type: 'map', whiteboard: [{ id: 't_h', isChar: true, charId: 'c_h', x: 0, y: 0 }] } } };
        const cmbH = { m_a: { round: 5 }, m_b: { round: 3 } };
        const HL = new Function('featureOn', 'F', 'getActiveCampaign', 'systemOf', 'charById', 'isClient', 'hoverLines', 'withRound', 'tokenCtx', 'tokenFlags', 'combatOn', hlSrc + '\nreturn { byTok: hoverLinesForToken, byId: hoverLinesForTokenId };')(
            () => true, () => F, () => campH, c => c.system, (id, c) => c.chars[id] || null, () => false, S.hoverLines, S.withRound, S.tokenCtx, () => flagsR, id => (typeof id === 'string' && Object.prototype.hasOwnProperty.call(cmbH, id) ? cmbH[id] : null));
        const onB = HL.byId(campH, 't_h'), onA = HL.byId(campH, 't_x'), card = HL.byTok(campH.items.m_a.whiteboard[0]), junkMap = HL.byTok(campH.items.m_b.whiteboard[0], campH, '__proto__'), gone = HL.byId(campH, 't_zz');
        delete cmbH.m_b; const offB = HL.byId(campH, 't_h');
        check('HUD frame HF5 review: the hover lines carry the round (hoverLines with a combat context reads it, 0 without one); the party strip reads the combat on the map the token stands on (round 3 on B while the GM views A at round 5), the map\'s own hover card the viewed map\'s; a map id that is not a map falls back to the viewed one; a token on no map has no lines',
            j(hl3) === j(['Round 3']) && j(hl0) === j(['Round 0']) && j(hlN) === j(['Round 0']) && j(onB) === j(['Round 3']) && j(onA) === j(['Round 5']) && j(card) === j(['Round 5']) && j(junkMap) === j(['Round 5']) && j(gone) === j([]) && j(offB) === j(['Round 0']), j([hl3, hl0, hlN, onB, onA, card, junkMap, offB]));
        // a GM-only name anywhere in a label: the host's check fails closed exactly where the players' view scrubs
        const lgSys = cleanSystem({ v: 1, name: 'L', fields: [{ id: 'f_g', key: 'GMFig', kind: 'number', def: 1, vis: 'gm' }, { id: 'f_a', key: 'A', kind: 'number', def: 1 }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '5', def: 'max', vis: 'gm' }], rolls: [] }, GVR);
        const E8R = Array.from({ length: 8 }, () => '{A}').join('');
        const cases = [['Trap {GMFig', ['GMFig']], ['Nine ' + E8R + '{GMFig}', ['GMFig']], ['Bad ({GMFig +})', ['GMFig']], ['Max {HP.max}', ['HP.max']], ['Sign ({' + PMR + 'GMFig})', ['GMFig']], ['Twice {GMFig} {gmfig}', ['GMFig']], ['Plain {A}', []], ['GMFig first {A}', []], ['No brace', []], ['{}', []]];
        const lgOut = cases.map(([t]) => S.labelGmNames(lgSys, F, t));
        const scrubbed = cleanSystem({ v: 1, name: 'L', fields: lgSys.fields, rolls: cases.map(([t], i) => ({ id: 'r_' + i, label: t, formula: 'd6' })) }, PVR).rolls.map(r => r.label);
        const rnSrcR = shR.slice(shR.indexOf('var LABEL_CTRL_G = '), shR.indexOf('// A roll from this character\'s sheet: the dice feature on'));
        const feR = (tag, cls, text) => ({ tag, className: cls || '', textContent: text || '', children: [], title: '', disabled: false, firstChild: null, on: {}, appendChild(x) { this.children.push(x); if (!this.firstChild) this.firstChild = x; return x; }, insertBefore(x) { this.children.unshift(x); this.firstChild = x; return x; }, addEventListener(k, f) { this.on[k] = f; } });
        const mkR = o => { o = o || {}; const sent = [], toasts = [];
            const api = new Function('F', 'net', 'isClient', 'captionParts', 'labelNames', 'labelGmNames', 'gmDerivedNames', 'gmEffectNames', 'el', 'iconNode', 'canRoll', 'sheetRoll', 'toast', 'ROLL_TONE_CLS', 'getActiveCampaign', 'charById', 'resolveAll', 'tokenCtxFor', rnSrcR + '\nreturn { rollLabel: rollLabel, labelSecret: labelSecret, rollNode: rollNode };')(
                () => F, () => (o.net === undefined ? { active: true, role: 'host' } : o.net), () => !!o.client, S.captionParts, S.labelNames, S.labelGmNames, S.gmDerivedNames, S.gmEffectNames, feR, (v, c) => feR('span', c), () => true, (e, cid, expr, label, opts) => sent.push([label, opts]), t => toasts.push(t), {},
                () => (o.camp || { chars: {} }), (id, c) => (c && c.chars && c.chars[id]) || null, S.resolveAll, () => (o.tctx ? o.tctx() : null));
            api.sent = sent; api.toasts = toasts; return api; };
        const hostR = mkR(), varsL = S.resolveAll(lgSys, { id: 'c_l', values: {} }, F, null).vars, secR = cases.map(([t]) => hostR.labelSecret(lgSys, varsL, t));
        const fxG = cleanSystem({ v: 1, name: 'E', fields: [{ id: 'f_g', key: 'G', kind: 'number', def: 3, vis: 'gm' }, { id: 'f_fx', key: 'Effects', kind: 'effects' }], rolls: [], effects: [{ id: 'e_g', name: 'Veil', vis: 'gm', mods: [{ f: 'f_g', op: 'add', v: 2 }] }] }, GVR);
        const secFx = hostR.labelSecret(fxG, S.resolveAll(fxG, { id: 'c_e', values: { f_fx: [{ id: 'x_1', ref: 'e_g', on: true }] } }, F, null).vars, 'X {G}');
        const secOff = mkR({ net: null }).labelSecret(lgSys, varsL, 'Trap {GMFig'), secCl = mkR({ client: true, net: { active: true, role: 'client' } }).labelSecret(lgSys, varsL, 'Trap {GMFig');
        check('HUD frame HF5 review: a GM-only name ANYWHERE in a label (a "{" left open, past the 8th value, a {...} that is not a formula, a reserved suffix, with the sign) makes the host\'s public roll private — exactly the labels the players\' view scrubs, and no others; each name once (a GM-only field a GM-only effect moved named once); never offline or on a client',
            j(lgOut) === j(cases.map(c => c[1])) && cases.every(([t], i) => (scrubbed[i] !== t) === (lgOut[i].length > 0)) && j(secR) === j(cases.map(c => c[1].join(', '))) && secFx === 'G' && secOff === '' && secCl === ''
            && j(S.labelGmNames(lgSys, null, 'x {GMFig}')) === j([]) && j(S.labelGmNames(null, F, 'x {GMFig}')) === j([]), j([lgOut, scrubbed, secR, secFx]));
        // the validator: a "{" left open, and a GM-only name no {...} draws, each said once per label
        const vwR = S.validateSystem(cleanSystem({ v: 1, name: 'V', fields: [{ id: 'f_g', key: 'GMFig', kind: 'number', def: 1, vis: 'gm' }, { id: 'f_a', key: 'A', kind: 'number', def: 1 }], rolls: [{ id: 'r_1', label: 'Trap {GMFig', formula: 'd6' }, { id: 'r_2', label: 'Odd {A', formula: 'd6' }, { id: 'r_3', label: 'Two {GMFig} {GMFig}', formula: 'd6' }, { id: 'r_4', label: 'Hid {GMFig', formula: 'd6', vis: 'gm' }, { id: 'r_5', label: 'Ok {A} {' + PMR + 'A}', formula: 'd6' }, { id: 'r_6', label: 'Bad {GMFig +}', formula: 'd6' }] }, GVR), F).warnings.filter(w => w.prop === 'label').map(w => w.id + ' ' + w.message);
        const UNC = 'Label: a "{" without its "}" shows as written.', GMW = h => 'Label: "GMFig" is GM only, so players see only "' + h + '".', r6 = vwR.filter(w => /^r_6 /.test(w));
        check('HUD frame HF5 review: validateSystem says when a label leaves a "{" open and names a GM-only value no {...} draws — once per label (the same name twice is one warning); a GM-only roll is told only of the open brace; a {...} that does not parse names its GM-only word too',
            j(vwR.filter(w => !/^r_6 /.test(w))) === j(['r_1 ' + UNC, 'r_1 ' + GMW('Trap'), 'r_2 ' + UNC, 'r_3 ' + GMW('Two'), 'r_4 ' + UNC]) && r6.length === 2 && r6[1] === 'r_6 ' + GMW('Bad'), j(vwR));
        // the 3d6 Turn caption is drawn: a caption needs a section (the band draws none)
        const placedR = sys => { const s = new Set(); [sys.sheet].concat(sys.sheet.hud ? [sys.sheet.hud] : []).forEach(l => (l.sections || []).forEach(sc => (sc.fields || []).forEach(p => { if (p.id) s.add(p.id); }))); return s; };
        const capsR = sys => sys.fields.filter(f => typeof f.caption === 'string' && f.caption.indexOf('{') >= 0);
        check('HUD frame HF5 review: every caption holding a {...} value in both HUD fixtures sits in a section (the band draws no captions), so 3d6 Turn\'s "round {CombatRound}" is drawn: Turn is in Core & Defenses as well as on the band',
            capsR(g3R).some(f => f.id === 'f_turn') && [gDR, g3R].every(sys => capsR(sys).every(f => placedR(sys).has(f.id))) && g3R.sheet.hud.sections.find(sc => sc.id === 's_hcore').fields.some(p => p.id === 'f_turn') && g3R.sheet.hud.band.some(p => p.id === 'f_turn'), j([capsR(g3R).map(f => f.id), capsR(gDR).map(f => f.id)]));
        // the label is worked out again at the click
        const rSys = cleanSystem({ v: 1, name: 'K', fields: [{ id: 'f_r', key: 'RoundNow', kind: 'formula', formula: 'CombatRound' }], rolls: [{ id: 'r_k', label: 'Hit ({RoundNow})', formula: 'd20 + RoundNow' }] }, GVR);
        let roundK = 2; const chK = { id: 'c_k', values: {} }, apiK = mkR({ net: null, camp: { chars: { c_k: chK } }, tctx: () => S.withRound(tcR, { round: roundK }) });
        const btnK = apiK.rollNode(rSys.rolls[0], chK, rSys, S.resolveAll(rSys, chK, F, S.withRound(tcR, { round: 2 })).vars).children[0];
        roundK = 3; btnK.on.click({}); const apiP = mkR({ net: null }); apiP.rollNode({ id: 'r_p', label: 'Plain', formula: 'd6' }, chK, rSys, S.resolveAll(rSys, chK, F, null).vars).children[0].on.click({});
        check('HUD frame HF5 review: a label is worked out again at the click, so it matches what the roll reads then: drawn "Hit (2)", a round later the click sends "Hit (3)"; a label without a value goes as drawn',
            btnK.textContent === 'Hit (2)' && j(apiK.sent) === j([['Hit (3)', undefined]]) && j(apiP.sent) === j([['Plain', undefined]]), j([btnK.textContent, apiK.sent, apiP.sent]));
        // rollInit, run for real
        const riSrc = shR.slice(shR.indexOf('function rollInit(charId) {'), shR.indexOf('// One value changed on the open sheet'));
        const runInit = (label, o) => { o = o || {}; const sysI = JSON.parse(JSON.stringify(gDR)); sysI.rolls.find(r => r.init).label = label;
            const calls = [], toasts = [], ch = { id: 'c_i', name: 'I', values: { f_dex: 14 } }, camp = { id: 'k', system: sysI, chars: { c_i: ch } }, api = mkR({ net: o.net === undefined ? { active: true, role: 'host' } : o.net });
            const ri = new Function('getActiveCampaign', 'systemOf', 'charById', 'initRoll', 'window', 'F', 'resolveAll', 'tokenCtxFor', 'rollLabel', 'labelSecret', 'toast', riSrc + '\nreturn rollInit;')(
                () => camp, c => c.system, (id, c) => (c.chars[id] || null), S.initRoll, { wpDice: { rollFor: (...a) => { calls.push(a); return { ok: true }; } }, wpVtt: { on: () => true } }, () => (o.noF ? null : F), S.resolveAll, () => null, api.rollLabel, api.labelSecret, t => toasts.push(t));
            ri('c_i'); return { calls, toasts }; };
        const iA = runInit('Init ({' + PMR + 'DEXmod})'), iG = runInit('Init ({GMFig})'), iOff = runInit('Init ({GMFig})', { net: null }), iNoF = runInit('Init ({' + PMR + 'DEXmod})', { noF: true });
        check('HUD frame HF5 review: rollInit (run for real) sends the label as worked out ("Init (+2)" at DEX 14) from the combat roster; one naming a GM-only value goes private with one toast on a hosting GM and public offline; with no formula engine the label goes as written',
            j(iA.calls) === j([['c_i', 'd20 + DEXmod', 'Init (+2)', { source: 'combat', priv: false, gmOnly: false }]]) && iA.toasts.length === 0 && j(iG.calls[0].slice(2)) === j(['Init (0)', { source: 'combat', priv: true, gmOnly: false }]) && iG.toasts.length === 1 && /GMFig/.test(iG.toasts[0])
            && j(iOff.calls[0].slice(2)) === j(['Init (0)', { source: 'combat', priv: false, gmOnly: false }]) && iOff.toasts.length === 0 && j(iNoF.calls[0].slice(2)) === j(['Init ({' + PMR + 'DEXmod})', { source: 'combat', priv: false, gmOnly: false }]), j([iA.calls, iG.calls, iG.toasts, iOff.calls, iNoF.calls]));
        // turnView and the sheet's branch of tokenTurned, run for real: a round change marks the view stale and the final call redraws it once
        const flJ = JSON.stringify(flagsR); let rNow = '', nfR = true, swapsR = 0; const redrawsV = [], redrawsS = [];
        const tvSrc = shR.slice(shR.indexOf('function turnView(v, final) {'), shR.indexOf('// The floating panels'));
        const TV = new Function('getActiveCampaign', 'charById', 'dialSigOf', 'tokenFlags', 'swapTokenControls', 'roundSigOf', 'namesFacing', 'systemOf', 'redrawForFacing', tvSrc + '\nreturn turnView;')(() => ({}), () => ({ id: 'c_a' }), () => 'd', () => flagsR, () => { swapsR++; }, () => rNow, () => nfR, () => ({}), v => redrawsV.push(v));
        const vT = { charId: 'c_a', dialSig: 'd', dialStale: false, dialOn: flJ, roundSig: '', panel: {} };
        const stepV = (r, fin, nf) => { rNow = r; nfR = nf !== false; TV(vT, fin); return redrawsV.length; };
        const seqV = [stepV('', true), stepV('1', true), stepV('1', true), stepV('2', false), vT.dialStale, stepV('2', true), stepV('', true, false), vT.roundSig, stepV('3', true), stepV('', true)];
        const ttSrc = shR.slice(shR.indexOf('function tokenTurned(tokId, final) {'), shR.indexOf('/* ---------- the sheet panel'));
        const TT = new Function('huds', 'turnView', 'sheetOpen', 'ui', 'getActiveCampaign', 'charById', 'dialSigOf', 'tokenFlags', 'swapTokenControls', 'roundSigOf', 'namesFacing', 'systemOf', 'redrawForFacing', 'var _dialSig = "d", _dialStale = false, _dialOn = ' + JSON.stringify(flJ) + ', _roundSig = "";\n' + ttSrc + '\nreturn tokenTurned;')(
            {}, () => {}, 'c_a', () => ({ style: { display: 'flex' } }), () => ({}), () => ({ id: 'c_a' }), () => 'd', () => flagsR, () => { swapsR++; }, () => rNow, () => nfR, () => ({}), v => redrawsS.push(v === undefined ? 'sheet' : v));
        const stepS = (r, fin) => { rNow = r; nfR = true; TT(null, fin); return redrawsS.length; };
        const seqS = [stepS('', true), stepS('1', true), stepS('1', true), stepS('2', false), stepS('2', true), stepS('', true)];
        check('HUD frame HF5 review: turnView and the sheet\'s branch of tokenTurned (run for real) — a round change marks the view stale and the final call redraws it once (a combat starting, a new round, the combat ending so CombatRound falls to 0); the same round, or a system reading no built-in name, redraws nothing; the dial is left alone',
            j(seqV) === j([0, 1, 1, 1, true, 2, 2, '', 3, 4]) && redrawsV.every(v => v === vT) && j(seqS) === j([0, 1, 1, 1, 2, 3]) && redrawsS.every(v => v === 'sheet') && swapsR === 0, j([seqV, seqS, swapsR]));
        // the band, run for real: its rolls get the system and the render's own resolver
        const biSrc = shR.slice(shR.indexOf('function bandInto(frame, bandDef, ctx) {'), shR.indexOf('var _glyphPop = null;'));
        const fe2 = (tag, cls) => { const e = { tag, className: cls || '', children: [], childNodes: [], dataset: {}, classList: { add(k) { e.className += ' ' + k; }, remove() {} }, querySelectorAll: () => [], appendChild(x) { e.children.push(x); e.childNodes.push(x); return x; }, addEventListener() {} }; return e; };
        const chB = { id: 'c_b', values: { f_str: 14, f_level: 5 } }, allB = S.resolveAll(gDR, chB, F, S.withRound(tcR, { round: 4 })), rnCalls = [];
        const BI = new Function('el', 'PIN_GID', 'groupShown', 'fieldNode', 'rollNode', 'iconNode', 'pinToggle', biSrc + '\nreturn bandInto;')(fe2, /^g_[A-Za-z0-9_]{1,24}$/, () => true, () => fe2('div', 'sheet-field'),
            (r, c, sys, vars) => { rnCalls.push([r.id, sys === gDR, typeof vars === 'function' ? [vars('AtkBonus'), vars('RoundNow')] : null]); return fe2('div', 'sheet-field'); }, () => fe2('span'), () => {});
        const byIdB = {}, rollByIdB = {}; gDR.fields.forEach(f => { byIdB[f.id] = f; }); gDR.rolls.forEach(r => { rollByIdB[r.id] = r; });
        const frameB = fe2('div'); BI(frameB, [{ roll: 'r_atk' }, { id: 'f_hp' }, { roll: 'r_init' }], { c: chB, all: allB, gm: true, own: true, sys: gDR, byId: byIdB, rollById: rollByIdB, grpById: {}, targets: {}, vctx: {} });
        check('HUD frame HF5 review: the band (bandInto, run for real) draws each roll with the system and the render\'s own resolver, the one the sections use (AtkBonus 5, RoundNow 4 in a round-4 combat); the section context hands the band that result by reference, never a copy (whose hidden resolver a copy would lose)',
            j(rnCalls) === j([['r_atk', true, [5, 4]], ['r_init', true, [5, 4]]]) && frameB.children.length === 1 && /var pctx = \{ byId: byId, rollById: rollById, c: c, all: all, /.test(shR), j(rnCalls));
    }

    /* ---- 1.5.0 derived GM-only values: a value worked out from a GM-only field is GM-only too — gmDerivedNames on its own, then labelSecret, rollNode and rollInit run for real ---- */
    {
        const shD = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), ntD = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
        const GVD = { F, gmView: true }, PVD = { F, gmView: false }, ND = a => a.map(name => ({ name })), PMD = String.fromCharCode(0xB1);
        const dRaw = { v: 1, name: 'D', rolls: [], fields: [
            { id: 'f_g', key: 'GMFig', kind: 'number', def: 12, vis: 'gm' }, { id: 'f_gt', key: 'GMT', kind: 'toggle', def: true, vis: 'gm' },
            { id: 'f_b', key: 'Bonus', kind: 'formula', formula: 'GMFig + 1' }, { id: 'f_at', key: 'Atk', kind: 'formula', formula: 'Bonus + 2' }, { id: 'f_tg', key: 'TG', kind: 'formula', formula: 'if(GMT, 5, 0)' },
            { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: 'GMFig * 2', def: 'max' }, { id: 'f_hq', key: 'HQ', kind: 'resource', maxFormula: 'GMFig * 2', def: 3 },
            { id: 'f_hm', key: 'HM', kind: 'formula', formula: 'HQ.max' }, { id: 'f_w', key: 'W', kind: 'formula', formula: 'HP + 0' }, { id: 'f_w2', key: 'W2', kind: 'formula', formula: 'HQ + 0' },
            { id: 'f_sk', key: 'Sk', kind: 'skill', base: 'GMFig', def: 3 }, { id: 'f_sr', key: 'SR', kind: 'formula', formula: 'Sk.ranks * 2' },
            { id: 'f_a', key: 'A', kind: 'number', def: 4 }, { id: 'f_fl', key: 'Flag', kind: 'number', def: 0 },
            { id: 'f_l1', key: 'L1', kind: 'formula', formula: 'L2 + 1' }, { id: 'f_l2', key: 'L2', kind: 'formula', formula: 'L1 + GMFig' },
            { id: 'f_ga', key: 'GA', kind: 'formula', formula: 'if(Flag, GB, GMFig)' }, { id: 'f_gb', key: 'GB', kind: 'formula', formula: 'if(Flag, 1, GA)' },
            { id: 'f_v1', key: 'V1', kind: 'formula', formula: 'V2' }, { id: 'f_v2', key: 'V2', kind: 'formula', formula: 'V1' },
            { id: 'f_bad', key: 'Bad', kind: 'formula', formula: 'GMFig +' }, { id: 'f_cr', key: 'CR', kind: 'formula', formula: 'CombatRound + A' }, { id: 'f_pa', key: 'PA', kind: 'formula', formula: 'A * 2' }] };
        const gD = cleanSystem(dRaw, GVD), chE = { id: 'c_d', values: {} }, chS = { id: 'c_d', values: { f_hp: { cur: 5 }, f_hq: { cur: null } } };
        const ASK = ['Bonus', 'atk', 'TG', 'HP', 'HP.max', 'HP.cur', 'HQ', 'HQ.cur', 'HQ.max', 'HM', 'W', 'W2', 'Sk', 'Sk.base', 'Sk.ranks', 'SR', 'A', 'Flag', 'L1', 'L2', 'GA', 'GB', 'V1', 'Bad', 'CR', 'PA', 'Nope', 'Facing', 'GMFig', 'GMFig.base', 'Bonus.max', 'CombatRound'];
        const gN = S.gmDerivedNames(gD, F, ND(ASK)), gE = S.gmDerivedNames(gD, F, ND(ASK), chE), gS = S.gmDerivedNames(gD, F, ND(ASK), chS);   // a character handed in as before changes nothing
        check('derived GM-only values: gmDerivedNames lists a GM-only field (by key or a suffix) and every visible value worked out from one, however deep — a formula (a branch of if() too), a formula over a formula, a skill and its .base (never .ranks), a pool whose max is one (its .max, the pool and .cur, full or stored: GM-only as a whole) and what reads it; a loop (a real one, or one if() keeps from running) ends; a stored number, an unknown name, a suffix a formula has not, a built-in name and a definition that does not parse are not listed; each name once, as spelled',
            j(gN) === j(['Bonus', 'atk', 'TG', 'HP', 'HP.max', 'HP.cur', 'HQ', 'HQ.cur', 'HQ.max', 'HM', 'W', 'W2', 'Sk', 'Sk.base', 'L1', 'L2', 'GA', 'GB', 'GMFig', 'GMFig.base']) && j(gE) === j(gN) && j(gS) === j(gN)
            && j(S.gmDerivedNames(gD, F, ND(['Bonus', 'bonus', 'BONUS', 'A']))) === j(['Bonus']) && j(S.gmDerivedNames(gD, F, ['Atk', { name: 'Sk' }, 7, null])) === j(['Atk', 'Sk']) && S.gmDerivedNames.length === 3, j([gN, gE, gS]));
        const throwsD = { names() { throw new Error('boom'); } };
        check('derived GM-only values: gmDerivedNames returns [] with no system, fields, engine or list, and never throws — an engine that throws lists every name asked, each once (fail closed)',
            [S.gmDerivedNames(null, F, ND(['Bonus'])), S.gmDerivedNames({ fields: null }, F, ND(['Bonus'])), S.gmDerivedNames(gD, null, ND(['Bonus'])), S.gmDerivedNames(gD, {}, ND(['Bonus'])), S.gmDerivedNames(gD, F, null), S.gmDerivedNames(gD, F, 'Bonus')].every(x => j(x) === '[]')
            && j(S.gmDerivedNames(gD, throwsD, ND(['A', 'a', 'Nope']))) === j(['A', 'Nope']));
        const chainD = []; for (let i = 0; i < LIMITS.fields - 1; i++) chainD.push({ id: 'f_c' + i, key: 'C' + i, kind: 'formula', formula: i ? 'C' + (i - 1) + ' + 1' : 'GMFig' });
        const chSysD = cleanSystem({ v: 1, name: 'C', rolls: [], fields: [{ id: 'f_g', key: 'GMFig', kind: 'number', def: 1, vis: 'gm' }].concat(chainD.reverse()) }, GVD), lastD = 'C' + (LIMITS.fields - 2);
        const t0D = process.hrtime.bigint(), chHitD = S.gmDerivedNames(chSysD, F, ND([lastD, 'C0', 'Nope'])), msD = Number(process.hrtime.bigint() - t0D) / 1e6;
        check('derived GM-only values: gmDerivedNames follows a chain of LIMITS.fields fields to the GM-only one at its end, whatever the order the fields are in, in one pass (well under 2 s)', chSysD.fields.length === LIMITS.fields && j(chHitD) === j([lastD, 'C0']) && msD < 2000, j([chSysD.fields.length, chHitD, msD]));
        // the property: a visible name is listed exactly when the players' view reads it as an error (never another number: a skill over a
        // GM-only base read ranks + 0 there), and a name not listed reads there as the GM's resolver has it
        const namesD = f => [f.key].concat(f.kind === 'resource' ? [f.key + '.max', f.key + '.cur'] : f.kind === 'skill' ? [f.key + '.base', f.key + '.ranks'] : []), isValD = v => v !== undefined && !(v && typeof v === 'object');
        const parityD = (raw, ch) => { const g = cleanSystem(raw, GVD), p = cleanSystem(raw, PVD), gv = S.makeResolver(g, ch, F, null), pv = S.makeResolver(p, ch, F, null), off = [];
            g.fields.filter(f => f.vis !== 'gm').forEach(f => namesD(f).forEach(n => { const a = gv(n); if (!isValD(a)) return; const b = pv(n); const listed = S.gmDerivedNames(g, F, [{ name: n }]).length > 0; if (listed !== !isValD(b) || (!listed && b !== a)) off.push(n); })); return off; };
        const fxD = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8'));
        const parD = [[dRaw, chE], [dRaw, chS], [d20, chE], [g3d6, chE], [fxD('hud-d20'), chE], [fxD('hud-3d6'), chE]].map(([r, c]) => parityD(r, c)), countD = namesD(gD.fields.find(f => f.key === 'HP')).length;
        check('derived GM-only values: gmDerivedNames lists a visible name exactly when the players\' view reads it as an error (a skill over a GM-only base too, never ranks + 0), and every name it does not list reads there as the GM\'s resolver has it — on this system with its pools full and stored, both presets and both HUD fixtures',
            parD.every(x => x.length === 0) && countD === 3, j(parD));
        // labelSecret, rollNode and rollInit, run for real
        const rnSrcD = shD.slice(shD.indexOf('var LABEL_CTRL_G = '), shD.indexOf('// A roll from this character\'s sheet: the dice feature on')), lsD0 = shD.slice(shD.indexOf('function labelSecret('), shD.indexOf('function rollNode('));
        const feD = (tag, cls, text) => ({ tag, className: cls || '', textContent: text || '', children: [], title: '', disabled: false, firstChild: null, on: {}, appendChild(x) { this.children.push(x); if (!this.firstChild) this.firstChild = x; return x; }, insertBefore(x) { this.children.unshift(x); this.firstChild = x; return x; }, addEventListener(k, f) { this.on[k] = f; } });
        const mkD = o => { o = o || {}; const sent = [], toasts = [];
            const api = new Function('F', 'net', 'isClient', 'captionParts', 'labelNames', 'labelGmNames', 'gmDerivedNames', 'gmEffectNames', 'el', 'iconNode', 'canRoll', 'sheetRoll', 'toast', 'ROLL_TONE_CLS', 'getActiveCampaign', 'charById', 'resolveAll', 'tokenCtxFor', rnSrcD + '\nreturn { rollLabel: rollLabel, labelSecret: labelSecret, rollNode: rollNode };')(
                () => F, () => (o.net === undefined ? { active: true, role: 'host' } : o.net), () => !!o.client, S.captionParts, S.labelNames, S.labelGmNames, S.gmDerivedNames, S.gmEffectNames, feD, (v, c) => feD('span', c), () => true, (e, cid, expr, label, opts) => sent.push([label, opts]), t => toasts.push(t), {},
                () => (o.camp || { chars: {} }), (id, c) => (c && c.chars && c.chars[id]) || null, S.resolveAll, () => null);
            api.sent = sent; api.toasts = toasts; return api; };
        const E8D = Array.from({ length: 8 }, () => '{A}').join('');
        const lCasesD = [['Attack ({Bonus})', 'Bonus'], ['Hit ({' + PMD + 'Atk})', 'Atk'], ['Skill {Sk}', 'Sk'], ['Base {Sk.base}', 'Sk.base'], ['Ranks {Sk.ranks}', ''], ['Plain {A} {SR}', ''], ['Pool {HP}', 'HP'], ['Max {HQ.max}', 'HQ.max'], ['Stored {HQ}', 'HQ'],
            ['Nine ' + E8D + '{Bonus}', ''], ['Open {Bonus', ''], ['Both {GMFig} {Bonus}', 'GMFig, Bonus'], ['Case {bonus} {BONUS}', 'bonus'], ['Loop {GB}', 'GB'], ['None', ''], ['Odd {GMFIG y {gmfig}', 'GMFIG'],
            ['Swing {if(Flag, Atk, 0)}', ''], ['Hid {if(Flag, GMFig, 0)}', 'GMFig'], ['Fails {Bad} {HP.base}', '']];
        const hostD = mkD(), varsE = S.resolveAll(gD, chE, F, null).vars, varsS = S.resolveAll(gD, chS, F, null).vars;
        const secD = lCasesD.map(([t]) => hostD.labelSecret(gD, varsE, t)), secSD = hostD.labelSecret(gD, varsS, 'Pool {HP}'), secND = hostD.labelSecret(gD, varsE, 'Stored {HQ}');
        const offD = lCasesD.map(([t]) => mkD({ net: null }).labelSecret(gD, varsE, t)), clD = lCasesD.map(([t]) => mkD({ client: true, net: { active: true, role: 'client' } }).labelSecret(gD, varsE, t));
        const scrubD = cleanSystem({ v: 1, name: 'D', fields: dRaw.fields, rolls: lCasesD.map(([t], i) => ({ id: 'r_' + i, label: t, formula: 'd6' })) }, PVD).rolls.map(r => r.label);
        check('derived GM-only values: a label that shows a value worked out from a GM-only field (in one of the 8 {...} it draws) makes the host\'s public roll private — with the sign, a suffix, a pool whose max is one (full or stored), a loop; each name once whatever its case, a direct GM-only name too; never offline or on a client; labelGmNames stays direct, and the players\' view keeps a label over a derived formula (players see the error) but cuts one over such a pool (the pool is not theirs)',
            j(secD) === j(lCasesD.map(c => c[1])) && secSD === 'HP' && secND === 'HQ' && offD.every(x => x === '') && clD.every(x => x === '')
            && j(S.labelGmNames(gD, F, 'Attack ({Bonus})')) === '[]' && scrubD[0] === 'Attack ({Bonus})' && scrubD[11] === 'Both' && j(scrubD.slice(6, 9)) === j(['Pool', 'Max', 'Stored']), j([secD, secSD, secND, scrubD]));
        const chF = { id: 'c_d', values: { f_fl: 1 } }, varsF = S.resolveAll(gD, chF, F, null).vars, swF = hostD.labelSecret(gD, varsF, 'Swing {if(Flag, Atk, 0)}', chF);
        const lnW = S.labelNames(F, 'a {if(Flag, Atk, 0)} {A} {' + PMD + 'Bad}'), lnE = S.labelNames(F, 'a {if(Flag, Atk, 0)} {A} {' + PMD + 'Bad}', varsE), lnF = S.labelNames(F, 'a {if(Flag, Atk, 0)} {A}', varsF), lnT = S.labelNames({ names: F.names, evaluate() { throw new Error('x'); } }, 'a {if(Flag, Atk, 0)}', varsE);
        check('derived GM-only values: with the label\'s resolver, labelNames lists only the names the drawn values actually read (a branch if() does not take, and a value that fails, read nothing), so a derived value in a branch not taken leaves the roll public — as net.diceRoll reads its breakdown — and goes private once the branch is taken; a GM-only name written anywhere still counts (the players\' view scrubs it); without a resolver every name written; an engine that throws reads as every name written',
            swF === 'Atk' && j(lnW) === j(ND(['Flag', 'Atk', 'A', 'Bad'])) && j(lnE) === j(ND(['Flag', 'A'])) && j(lnF) === j(ND(['Flag', 'Atk', 'A'])) && j(lnT) === j(ND(['Flag', 'Atk'])) && /var ns = labelNames\(Fm, text, vars\)/.test(lsD0), j([swF, lnW, lnE, lnF, lnT]));
        const rollDD = { id: 'r_d', label: 'Attack ({Bonus})', formula: 'd6 + Bonus' }, rollPD = { id: 'r_p', label: 'Pool ({HP})', formula: 'd6' };
        const apiA = mkD({ camp: { chars: { c_d: chE } } }); apiA.rollNode(rollDD, chE, gD, varsE).children[0].on.click({});
        const apiB = mkD({ camp: { chars: { c_d: chE } } }), btnB = apiB.rollNode(rollPD, chS, gD, varsS).children[0]; btnB.on.click({});   // drawn from a copy whose pool was stored; full by the click
        const apiC = mkD({ camp: { chars: { c_d: chS } } }); apiC.rollNode(rollPD, chS, gD, varsS).children[0].on.click({});
        check('derived GM-only values: a roll button (rollNode, run for real) whose label shows a derived value sends it private with one toast naming it; the label reads the character at the click (drawn stored, full by the click: the full value), and a pool whose max is GM-only keeps it private, full or stored',
            j(apiA.sent) === j([['Attack (13)', { priv: true }]]) && apiA.toasts.length === 1 && /GM-only value \(Bonus\)/.test(apiA.toasts[0])
            && btnB.textContent === 'Pool (5)' && j(apiB.sent) === j([['Pool (24)', { priv: true }]]) && apiB.toasts.length === 1 && j(apiC.sent) === j([['Pool (5)', { priv: true }]]) && apiC.toasts.length === 1 && /GM-only value \(HP\)/.test(apiC.toasts[0]), j([apiA.sent, apiA.toasts, btnB.textContent, apiB.sent, apiC.sent, apiC.toasts]));
        const riSrcD = shD.slice(shD.indexOf('function rollInit(charId) {'), shD.indexOf('// One value changed on the open sheet'));
        const runInitD = (label, vals, o) => { o = o || {}; const sysI = Object.assign({}, gD, { rolls: [{ id: 'r_i', label: label, formula: 'd20 + A', init: true, vis: o.vis }] }), calls = [], toasts = [], ch = { id: 'c_i', name: 'I', values: vals || {} }, camp = { id: 'k', system: sysI, chars: { c_i: ch } }, api = mkD({ net: o.net === undefined ? { active: true, role: 'host' } : o.net });
            const ri = new Function('getActiveCampaign', 'systemOf', 'charById', 'initRoll', 'window', 'F', 'resolveAll', 'tokenCtxFor', 'rollLabel', 'labelSecret', 'toast', riSrcD + '\nreturn rollInit;')(
                () => camp, c => c.system, (id, c) => (c.chars[id] || null), S.initRoll, { wpDice: { rollFor: (...a) => { calls.push(a); return { ok: true }; } }, wpVtt: { on: () => true } }, () => F, S.resolveAll, () => null, api.rollLabel, api.labelSecret, t => toasts.push(t));
            ri('c_i'); return { calls, toasts }; };
        const iBD = runInitD('Init ({Bonus})'), iOffD = runInitD('Init ({Bonus})', {}, { net: null }), iFullD = runInitD('Init ({HP})'), iStD = runInitD('Init ({HP})', { f_hp: { cur: 7 } });
        check('derived GM-only values: rollInit (run for real) with a label showing a derived value goes private with one toast on a hosting GM and public offline; a pool whose max is GM-only keeps it private, full or stored',
            j(iBD.calls[0].slice(2)) === j(['Init (13)', { source: 'combat', priv: true, gmOnly: false }]) && iBD.toasts.length === 1 && /\(Bonus\)/.test(iBD.toasts[0]) && j(iOffD.calls[0].slice(2)) === j(['Init (13)', { source: 'combat', priv: false, gmOnly: false }]) && iOffD.toasts.length === 0
            && j(iFullD.calls[0].slice(2)) === j(['Init (24)', { source: 'combat', priv: true, gmOnly: false }]) && j(iStD.calls[0].slice(2)) === j(['Init (7)', { source: 'combat', priv: true, gmOnly: false }]) && iStD.toasts.length === 1, j([iBD, iOffD, iFullD, iStD]));
        const lsD = shD.slice(shD.indexOf('function labelSecret('), shD.indexOf('function rollNode('));
        check('derived GM-only values (source): labelSecret asks gmDerivedNames of the drawn names beside the direct and the effect checks (no character: a pool whose max is GM-only counts whole); net.diceRoll asks gmOnlyNames of every name the formula writes and gmDerivedNames of the names it read, once each, before the whisper; the export and the window API carry it; Help says so',
            (lsD.match(/gmDerivedNames\(/g) || []).length === 1 && /gmDerivedNames\(sys, Fm, ns\)/.test(lsD) && /var why = labelSecret\(sys, vv, r\.label\);/.test(shD) && /whyI = allI \? labelSecret\(sys, allI\.vars, r\.label\) : ''/.test(shD)
            && (ntD.match(/gmDerivedNames\(/g) || []).length === 1 && /SR\.gmOnlyNames\(campR\.system, F\.names\(expr\)\.map\(/.test(ntD) && /SR\.gmDerivedNames\(campR\.system, F, rec\.names\)/.test(ntD)
            && ntD.indexOf('else if (gmR.length)') > 0 && ntD.indexOf('else if (gmR.length)') < ntD.indexOf("var toKey = ui('chatTo')") && typeof S.gmDerivedNames === 'function'
            && /A GM&rsquo;s roll that names a GM-only field, or uses a value worked out from one \(a formula or a skill&rsquo;s base built on it, or a pool whose maximum is, full or not\), is kept private\./.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')));
        // A skill whose base names a GM-only field: the players' view nulls the base, and the resolver reads that as "GM only" for the skill and its
        // .base, as it does a nulled formula or pool max (it read ranks + 0: a plausible, wrong total on the sheet and in the player's own roll); .ranks is stored
        const kRaw = { v: 1, name: 'K', rolls: [], fields: [
            { id: 'f_g', key: 'GMFig', kind: 'number', def: 12, vis: 'gm' }, { id: 'f_z', key: 'GZ', kind: 'number', def: 0, vis: 'gm' }, { id: 'f_a', key: 'A', kind: 'number', def: 4, caption: 'Sneak {Sk}, ranks {Sk.ranks}' },
            { id: 'f_sk', key: 'Sk', kind: 'skill', base: 'GMFig', def: 3, hover: true, edit: 'owner' }, { id: 'f_sz', key: 'SZ', kind: 'skill', base: 'GZ', def: 2, hover: true },
            { id: 'f_se', key: 'SE', kind: 'skill', base: '', def: 2, hover: true }, { id: 'f_sn', key: 'SN', kind: 'skill', def: 1, hover: true }, { id: 'f_sa', key: 'SA', kind: 'skill', base: 'A - 1', def: 1, hover: true },
            { id: 'f_sr', key: 'SR', kind: 'formula', formula: 'Sk.ranks * 2', hover: true }, { id: 'f_sb', key: 'SB', kind: 'formula', formula: 'Sk + 1', hover: true },
            { id: 'f_hk', key: 'HK', kind: 'resource', maxFormula: 'Sk.base * 2', def: 'max', hover: true }] };
        const gK = cleanSystem(kRaw, GVD), pK = cleanSystem(kRaw, PVD), chK = { id: 'c_k', ownerId: 'u_p', values: {} }, gvK = S.makeResolver(gK, chK, F), pvK = S.makeResolver(pK, chK, F);
        const fK = (sy, k) => sy.fields.find(f => f.key === k), msgK = v => (v && typeof v === 'object' && v.error) ? String(v.error.message) : null;
        const dieK = F.evaluate('d20 + Sk', { vars: pvK }), dieKR = F.evaluate('d20 + Sk.ranks', { vars: pvK });
        check('derived GM-only values: a skill whose base names a GM-only field reads "GM only" on the players\' view, the skill and its .base (and a formula over them; a pool whose max reads one is GM-only as a whole, gone from the view), as a nulled formula does, never ranks + 0 (the base stays null through the client\'s own clean of what the host sends); its .ranks still reads; a skill with no base (empty, absent, or absent from an uncleaned field) is ranks alone and a visible base still adds; the GM\'s view is unchanged',
            fK(pK, 'Sk').base === null && fK(pK, 'SZ').base === null && fK(pK, 'SE').base === '' && fK(pK, 'SN').base === '' && fK(pK, 'SA').base === 'A - 1' && fK(gK, 'Sk').base === 'GMFig' && fK(cleanSystem(JSON.parse(j(pK)), PVD), 'Sk').base === null
            && msgK(pvK('Sk')) === 'GM only' && msgK(pvK('Sk.base')) === 'GM only' && ['SZ', 'SZ.base', 'SB'].every(n => /GM only/.test(msgK(pvK(n)))) && pvK('HK') === undefined && pvK('HK.max') === undefined && !pK.fields.some(f => f.key === 'HK') && pvK('Sk.ranks') === 3 && pvK('SZ.ranks') === 2 && pvK('SR') === 6
            && pvK('SE') === 2 && pvK('SE.base') === 0 && pvK('SN') === 1 && pvK('SA') === 4 && pvK('SA.base') === 3 && S.makeResolver({ fields: [{ id: 'f_q', key: 'Q', kind: 'skill', def: 2, vis: 'all' }] }, { id: 'c', values: { f_q: 5 } }, F)('Q') === 5
            && !dieK.ok && /GM only/.test(dieK.error.message) && dieKR.ok && gvK('Sk') === 15 && gvK('Sk.base') === 12 && gvK('SZ') === 2 && gvK('SB') === 16 && gvK('HK') === 24,
            j(['Sk', 'Sk.base', 'Sk.ranks', 'SZ', 'SB', 'HK', 'SE', 'SE.base', 'SN', 'SA'].map(n => [n, pvK(n)]).concat([dieK.error || dieK.value])));
        const allPK = S.resolveAll(pK, chK, F), allGK = S.resolveAll(gK, chK, F), heK = S.headerEntry(fK(pK, 'Sk'), allPK.f_sk), capK = S.captionParts(pK, chK, F, fK(pK, 'A').caption, allPK.vars);
        check('derived GM-only values: on the players\' view such a skill resolves as an error — an em dash with "GM only", its ranks kept for the box; the header block prints the dash with the reason as its title, the hover lines leave it out (a teammate\'s too: the host works them out on the same view), a caption shows "Sk: GM only" for it; the GM\'s view shows the total',
            allPK.f_sk.error === 'GM only' && allPK.f_sk.text === '\u2014' && allPK.f_sk.value === undefined && allPK.f_sk.ranks === 3 && allPK.f_sz.error === 'GM only' && allPK.f_se.text === '2' && allPK.f_sa.text === '4'
            && j(heK) === j({ text: '\u2014', error: 'GM only' }) && allGK.f_sk.text === '15' && allGK.f_sk.error === null
            && j(S.hoverLines(pK, chK, F)) === j(['SE 2', 'SN 1', 'SA 4', 'SR 6']) && j(S.hoverLines(gK, chK, F)) === j(['Sk 15', 'SZ 2', 'SE 2', 'SN 1', 'SA 4', 'SR 6', 'SB 16', 'HK 24 / 24'])
            && j(capK) === j([{ text: 'Sneak ' }, { error: 'Sk: GM only' }, { text: ', ranks ' }, { value: 3, text: '3' }]),
            j([allPK.f_sk, heK, S.hoverLines(pK, chK, F), capK]));
        const vK = validateSystem(gK, F);
        check('derived GM-only values: the editor\'s warning for such a skill ("players will see an error for this field") is what players see',
            vK.warnings.some(w => w.id === 'f_sk' && w.prop === 'base' && w.message === '"GMFig" is GM only: players will see an error for this field.') && vK.warnings.some(w => w.id === 'f_sz' && w.prop === 'base'), j(vK.warnings));
        // the row the sheet draws: fieldNode, run for real (the band draws a field through it at bandInto, and the sheet's and the HUD's sections at buildSections)
        const fnSrcK = shD.slice(shD.indexOf('function signTone('), shD.indexOf('// A roll from a sheet button:')), fxSrcK = shD.slice(shD.indexOf('function fxMark('), shD.indexOf('// 5h: a character\'s status effects'));
        const feK = (tag, cls, text) => ({ tag, className: cls || '', textContent: text === undefined ? '' : String(text), children: [], title: '', type: '', value: '', disabled: false, dataset: {}, classList: { add() {} }, appendChild(x) { this.children.push(x); return x; }, addEventListener() {} });
        const fieldNodeK = new Function('el', 'F', 'fxText', 'fmtNum', 'canRoll', 'sheetRoll', 'commit', 'valueTone', 'TONE_CLASS', fxSrcK + fnSrcK + '\nreturn fieldNode;')(feK, () => F, S.fxText, S.fmtNum, () => true, () => {}, () => {}, S.valueTone, {});
        const rowK = (sy, all, key, gm, own) => { const f = fK(sy, key), row = fieldNodeK(f, chK, all[f.id], gm, own, sy).children[1], inp = row.children[0], tot = row.children[1]; return [inp.value, inp.disabled, tot.textContent, tot.className, tot.title]; };
        check('derived GM-only values: the sheet row such a skill draws on the players\' view (fieldNode, run for real — the band and the sheet\'s and the HUD\'s sections draw through it): the ranks box keeps the player\'s ranks, theirs to edit, and the total is an em dash marked as an error with "GM only" as its title; a skill with no base, or a visible one, shows its total; the GM\'s row shows the whole total',
            j(rowK(pK, allPK, 'Sk', false, true)) === j(['3', false, '\u2014', 'sheet-total sheet-err', 'GM only']) && j(rowK(pK, allPK, 'SE', false, true)) === j(['2', false, '= 2', 'sheet-total', 'ranks'])
            && j(rowK(pK, allPK, 'SA', false, true)) === j(['1', false, '= 4', 'sheet-total', 'ranks + A - 1']) && j(rowK(gK, allGK, 'Sk', true, false)) === j(['3', false, '= 15', 'sheet-total', 'ranks + GMFig'])
            && /var node = \(q\.id && byId\[q\.id\]\) \? fieldNode\(byId\[q\.id\], c, all\[q\.id\], gm, own, sys\)/.test(shD) && /node = fieldNode\(byId\[pl\.id\], c, all\[pl\.id\], gm, own, sys, all\.vars, pl\)/.test(shD),
            j([rowK(pK, allPK, 'Sk', false, true), rowK(pK, allPK, 'SE', false, true), rowK(pK, allPK, 'SA', false, true), rowK(gK, allGK, 'Sk', true, false)]));
        const parK = parityD(kRaw, chK);
        check('derived GM-only values: on this system too, gmDerivedNames lists a visible name exactly when the players\' view reads it as an error — SZ included, a skill over a GM-only field that is 0, whose ranks + 0 was the GM\'s very total',
            parK.length === 0 && j(S.gmDerivedNames(gK, F, ND(['SZ', 'SZ.base', 'SZ.ranks', 'SE']))) === j(['SZ', 'SZ.base']), j(parK));

        /* 1.5.0 GM-only rolls: a GM-only field's own roll, a GM-only roll (initiative too) and the throw of a GM-only item (or of one on a GM-only list)
           tell the dice path so (gmOnly); net.diceRoll keeps such a roll the hosting GM's (netcheck). The field's button, rollNode, rollInit,
           itemThrowBtn, sheetRoll and dice.js's rollFor and roll run for real */
        const gRG = cleanSystem({ v: 1, name: 'G', fields: dRaw.fields.concat([{ id: 'f_hs', key: 'Sanity', label: 'Hidden Sanity', kind: 'formula', formula: '50', vis: 'gm', roll: 'd100' }, { id: 'f_lk', key: 'Luck', kind: 'formula', formula: '3', roll: 'd6 + Luck' }]),
            rolls: [{ id: 'r_gs', label: 'Secret check', formula: 'd20', vis: 'gm' }, { id: 'r_op', label: 'Open check', formula: 'd20' }, { id: 'r_gv', label: 'Veiled ({Bonus})', formula: 'd20', vis: 'gm' }] }, GVD);
        const fbSrcG = shD.slice(shD.indexOf('function fieldNodeBody('), shD.indexOf('// A roll from a sheet button: shift/alt-click'));
        const feG = (tag, cls, text) => Object.assign(feD(tag, cls, text), { classList: { add() {} }, closest: () => null });
        const fieldG = key => { const sent = [], f = gRG.fields.find(x => x.key === key);
            const fnb = new Function('el', 'canRoll', 'sheetRoll', 'signTone', 'valueTone', 'TONE_CLASS', 'fxMark', fbSrcG + '\nreturn fieldNodeBody;')(feG, () => true, (e, cid, expr, label, opts) => sent.push([cid, expr, label, opts]), () => '', () => '', {}, () => null);
            const box = fnb(f, chE, { value: 1, text: '1' }, true, true, gRG), rb = box.children[0].children[0]; rb.on.click({}); return { sent, f }; };
        const fHs = fieldG('Sanity'), fLk = fieldG('Luck');
        check('GM-only rolls: a GM-only field\'s own roll button (fieldNodeBody, run for real) tells the dice path the roll is GM-only, with the field\'s label; a visible field\'s asks nothing',
            fHs.f.vis === 'gm' && fHs.f.roll === 'd100' && j(fHs.sent) === j([['c_d', 'd100', 'Hidden Sanity', { gmOnly: true }]]) && j(fLk.sent) === j([['c_d', 'd6 + Luck', 'Luck', undefined]]), j([fHs.f, fHs.sent, fLk.sent]));
        const varsG = S.resolveAll(gRG, chE, F, null).vars, rollG = id => gRG.rolls.find(r => r.id === id);
        const clickG = (id, o) => { const api = mkD(Object.assign({ camp: { chars: { c_d: chE } } }, o || {})); api.rollNode(rollG(id), chE, gRG, varsG).children[0].on.click({}); return api; };
        const rGs = clickG('r_gs'), rGsOff = clickG('r_gs', { net: null }), rOp = clickG('r_op'), rGv = clickG('r_gv');
        check('GM-only rolls: a GM-only roll (rollNode, run for real) tells the dice path so, hosting or not (net.diceRoll decides, and says so; no toast here); a visible roll asks nothing; a GM-only roll whose label shows a GM-only value goes private with the label\'s one toast',
            rollG('r_gs').vis === 'gm' && j(rGs.sent) === j([['Secret check', { gmOnly: true }]]) && rGs.toasts.length === 0 && j(rGsOff.sent) === j([['Secret check', { gmOnly: true }]]) && j(rOp.sent) === j([['Open check', undefined]])
            && j(rGv.sent) === j([['Veiled (13)', { priv: true }]]) && rGv.toasts.length === 1 && /\(Bonus\)/.test(rGv.toasts[0]), j([rGs.sent, rGsOff.sent, rOp.sent, rGv.sent, rGv.toasts]));
        const iGs = runInitD('Init', {}, { vis: 'gm' }), iGsOff = runInitD('Init', {}, { vis: 'gm', net: null }), iOp = runInitD('Init');
        check('GM-only rolls: a GM-only initiative roll (rollInit, run for real) tells the dice path so from the combat roster, hosting or not; a visible one asks nothing',
            j(iGs.calls[0].slice(1)) === j(['d20 + A', 'Init', { source: 'combat', priv: false, gmOnly: true }]) && iGs.toasts.length === 0 && j(iGsOff.calls[0].slice(2)) === j(['Init', { source: 'combat', priv: false, gmOnly: true }])
            && j(iOp.calls[0].slice(2)) === j(['Init', { source: 'combat', priv: false, gmOnly: false }]), j([iGs.calls, iGsOff.calls, iOp.calls]));
        const itSrcG = shD.slice(shD.indexOf('function itemThrowBtn('), shD.indexOf('function itemQtyCell('));
        const throwG = (def, f) => { const arms = []; let closed = 0;
            const itb = new Function('el', 'window', 'closeHud', 'closeSheet', itSrcG + '\nreturn itemThrowBtn;')(feG, { wpArmBlast: (...a) => arms.push(JSON.parse(JSON.stringify(a))) }, () => {}, () => { closed++; });
            itb(def, { id: 'c_n', name: 'Nix' }, f, 'w_1').on.click({}); return { arms, closed }; };
        const dGI = { name: 'Orb', vis: 'gm', area: { ft: 10, name: '' }, damage: '3d6' }, dVI = { name: 'Grenade', vis: 'all', area: { ft: 15, name: 'Frag' }, damage: '2d6' }, lA = { id: 'f_it', vis: 'all' }, lG = { id: 'f_ig', vis: 'gm' };
        const tGA = throwG(dGI, lA), tVA = throwG(dVI, lA), tVG = throwG(dVI, lG);
        check('GM-only rolls: a sheet Throw (itemThrowBtn, run for real) arms the blast marked GM-only for a GM-only item or an item on a GM-only list, and unmarked for a visible item on a visible list; the rest of the throw as before',
            j(tGA.arms) === j([[10, 'Orb', { charId: 'c_n', fieldId: 'f_it', rowId: 'w_1', by: 'Nix', damage: '3d6', gmOnly: true }]]) && j(tVA.arms) === j([[15, 'Frag', { charId: 'c_n', fieldId: 'f_it', rowId: 'w_1', by: 'Nix', damage: '2d6', gmOnly: false }]])
            && tVG.arms.length === 1 && tVG.arms[0][2].gmOnly === true && tVG.arms[0][2].fieldId === 'f_ig' && tGA.closed === 1, j([tGA.arms, tVA.arms, tVG.arms]));
        const srSrcG = shD.slice(shD.indexOf('function sheetRoll('), shD.indexOf('var ROLL_TONE_CLS'));
        const dkG = fs.readFileSync(path.join(app, 'scripts', 'dice.js'), 'utf8').replace(/\r\n/g, '\n'), DCG = await import(url('dicecore.js'));
        const cutG = (s, a, b) => { const i = s.indexOf(a), k = s.indexOf(b, i); return i < 0 || k < 0 ? '' : s.slice(i, k); };
        const rfSrcG = cutG(dkG, 'function rollFor(', '/* ---------- Stage 5a'), roSrcG = cutG(dkG, 'function roll(expr, opts) {', 'function rollFromPanel()');
        const askedG = [], diceG = new Function('ui', 'panelOpen', 'syncChars', 'toast', 'net', 'cleanExpr', 'LIMITS', 'remember', "var lastSource = 'panel';\n" + rfSrcG + roSrcG + '\nreturn rollFor;')(
            () => null, () => false, () => {}, () => {}, () => ({ diceRoll: (expr, o) => { askedG.push([expr, o]); return { ok: true, priv: false }; } }), DCG.cleanExpr, DCG.LIMITS, () => {});
        diceG('c_d', 'd100', 'Hidden Sanity', { gmOnly: true }); diceG('c_d', 'd6', 'Luck'); diceG('c_d', 'd6', 'Both', { priv: true, gmOnly: true });
        const viaG = [], srG = new Function('window', srSrcG + '\nreturn sheetRoll;')({ wpDice: { rollFor: (...a) => viaG.push(['plain'].concat(a)), rollWithMod: (...a) => viaG.push(['mod'].concat(a.slice(0, 4))) } });
        srG({}, 'c_d', 'd100', 'Hidden Sanity', { gmOnly: true }); srG({ shiftKey: true, currentTarget: null }, 'c_d', 'd100', 'Hidden Sanity', { gmOnly: true });
        check('GM-only rolls: the hint reaches net.diceRoll unchanged — sheetRoll hands it to a plain roll and to the modifier popover (whose Roll passes it on), and dice.js\'s rollFor and roll (run for real) give net.diceRoll gmOnly beside priv; a roll without it asks gmOnly false',
            j(viaG) === j([['plain', 'c_d', 'd100', 'Hidden Sanity', { gmOnly: true }], ['mod', 'c_d', 'd100', 'Hidden Sanity', { gmOnly: true }]])
            && j(askedG) === j([['d100', { priv: false, gmOnly: true, charId: 'c_d', label: 'Hidden Sanity' }], ['d6', { priv: false, gmOnly: false, charId: 'c_d', label: 'Luck' }], ['d6', { priv: true, gmOnly: true, charId: 'c_d', label: 'Both' }]])
            && /closeModPop\(\); rollFor\(charId, r\.expr, label, opts\); \}\);/.test(dkG), j([viaG, askedG]));
        const hG = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        check('GM-only rolls (source): Help says a GM-only field\'s own roll, a GM-only roll and the damage of a GM-only item (or one thrown from a GM-only list) are kept private, and what a visible item\'s damage and a GM-only item\'s blast show',
            /So are a GM-only field&rsquo;s own roll, a GM-only roll, and the damage of an item that is GM-only or thrown from a GM-only list\./.test(hG) && /A visible item&rsquo;s damage is rolled at the table like any roll; the damage of a GM-only item, or of one thrown from a GM-only list, goes to you alone, and its blast reaches players without its name\./.test(hG) && !/Item formulas never leave your machine/.test(hG));
    }

    /* ---- 1.5.0 GM-only pools: a visible pool whose max is worked out from a GM-only field is GM-only as a whole — gmPools, the players' view,
       the validator, a player's edit and what a player receives (the host's clamp, a fill or damage from full never reach one) ---- */
    {
        const GVP = { F, gmView: true }, PVP = { F, gmView: false }, keysP = o => Object.keys(o).sort();
        const pRaw = { v: 1, name: 'P', fields: [
            { id: 'f_g', key: 'GMFig', kind: 'number', def: 12, vis: 'gm' }, { id: 'f_wis', key: 'Wis', kind: 'number', def: 5, edit: 'owner' }, { id: 'f_bon', key: 'Bonus', kind: 'formula', formula: 'GMFig + 1' },
            { id: 'f_vig', key: 'Vigor', kind: 'resource', maxFormula: 'GMFig * 2', def: 'max', min: 0, edit: 'owner', hover: true, reset: true, caption: 'of {Vigor.max}' },   // the max names a GM-only field
            { id: 'f_gri', key: 'Grit', kind: 'resource', maxFormula: 'Bonus', def: 3, min: 0, edit: 'owner' },   // through a visible formula (a pool counting up)
            { id: 'f_ech', key: 'Echo', kind: 'resource', maxFormula: 'Grit.cur + 1', def: 'max', edit: 'owner' },   // through another such pool's current value
            { id: 'f_mana', key: 'Mana', kind: 'resource', maxFormula: 'Wis * 2', def: 'max', min: 0, edit: 'owner', hover: true, caption: 'Vigor {Vigor}' },   // a visible max: as before
            { id: 'f_sec', key: 'Secret', kind: 'resource', maxFormula: 'GMFig', def: 'max', vis: 'gm' },
            { id: 'f_low', key: 'Low', kind: 'formula', formula: 'Vigor < 5' }, { id: 'f_mr', key: 'ManaR', kind: 'formula', formula: 'Mana + Wis' }, { id: 'f_fx', key: 'Fx', kind: 'effects', edit: 'owner' }],
            rolls: [{ id: 'r_v', label: 'Vigor save', formula: 'd20 + Vigor' }, { id: 'r_g', label: 'Burn ({Grit})', formula: 'd6 + Mana' }, { id: 'r_w', label: 'Wis', formula: 'd20 + Wis' }],
            effects: [{ id: 'e_dr', name: 'Drain', mods: [{ f: 'f_vig', op: 'add', v: -5, part: 'max' }, { f: 'f_mana', op: 'add', v: -3, part: 'max' }] }],
            combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: 'f_vig' },
            sheet: { identity: [{ id: 'f_vig' }], ledger: [{ id: 'f_gri' }, { id: 'f_wis' }], band: [{ id: 'f_vig' }, { id: 'f_mana' }],
                sections: [{ id: 's_a', title: 'Pools', cols: 2, fields: [{ id: 'f_vig', w: 1 }, { id: 'f_gri', w: 1 }, { id: 'f_ech', w: 1 }, { id: 'f_mana', w: 1 }, { roll: 'r_v', w: 1 }] }],
                hud: { band: [{ id: 'f_ech' }], sections: [{ id: 's_h', title: 'HUD', cols: 1, fields: [{ id: 'f_vig', w: 1 }, { id: 'f_mana', w: 1 }] }] } } };
        const gP = cleanSystem(pRaw, GVP), vP = cleanSystem(pRaw, PVP), fxP = n => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', n + '.json'), 'utf8'));
        const throwsP = { names() { throw new Error('boom'); } }, noneP = [d20, g3d6, fxP('hud-d20'), fxP('hud-3d6')].map(r => keysP(S.gmPools(cleanSystem(r, GVP), F)));
        check('GM-only pools: gmPools names the visible pools whose max is worked out from a GM-only field — directly, through a visible formula, through another such pool — never one with a visible max or one GM-only already; none in either preset or HUD fixture; a prototype-free set; no engine or an engine that throws hides every visible pool (fail closed); no system, nothing',
            j(keysP(S.gmPools(gP, F))) === j(['f_ech', 'f_gri', 'f_vig']) && Object.getPrototypeOf(S.gmPools(gP, F)) === null && noneP.every(k => k.length === 0)
            && j(keysP(S.gmPools(gP, null))) === j(['f_ech', 'f_gri', 'f_mana', 'f_vig']) && j(keysP(S.gmPools(gP, throwsP))) === j(keysP(S.gmPools(gP, null))) && [null, {}, { fields: 'x' }].every(s => keysP(S.gmPools(s, F)).length === 0), j([keysP(S.gmPools(gP, F)), noneP]));
        const vJ = j(vP), fOf = (s, id) => s.fields.find(f => f.id === id);
        check('GM-only pools: the players\' view drops such a pool as it drops a GM-only field — its placements (sections, band, identity, ledger, the HUD\'s band and sections), the damage resource, an effect\'s change to it, a caption and a roll that name it go, a formula that names it reads "GM only", a roll label that shows it keeps its plain text; nothing of it is left',
            !/f_vig|f_gri|f_ech|Vigor|Grit|Echo/.test(vJ) && j(vP.fields.map(f => f.id)) === j(['f_wis', 'f_bon', 'f_mana', 'f_low', 'f_mr', 'f_fx']) && fOf(vP, 'f_low').formula === null && fOf(vP, 'f_mr').formula === 'Mana + Wis' && fOf(vP, 'f_mana').maxFormula === 'Wis * 2' && !('caption' in fOf(vP, 'f_mana'))
            && j(vP.rolls.map(r => r.id + ':' + r.label)) === j(['r_g:Burn', 'r_w:Wis']) && vP.combat.hpResource === '' && j(vP.effects[0].mods.map(m => m.f)) === j(['f_mana'])
            && j(vP.sheet.band) === j([{ id: 'f_mana' }]) && j(vP.sheet.ledger) === j([{ id: 'f_wis' }]) && !('identity' in vP.sheet) && j(vP.sheet.sections[0].fields.map(p => p.id)) === j(['f_mana']) && !('band' in vP.sheet.hud) && j(vP.sheet.hud.sections[0].fields.map(p => p.id)) === j(['f_mana']), vJ.slice(0, 600));
        const visP = raw => { const g = cleanSystem(raw, GVP), p = cleanSystem(raw, PVP); return j(p.fields.map(f => f.id)) === j(g.fields.filter(f => f.vis !== 'gm').map(f => f.id)); };
        const openP = JSON.parse(j(pRaw)); openP.fields[0].vis = 'all';   // the same system with its GM-only field made visible: nothing is hidden
        const dupP = cleanSystem({ v: 1, name: 'X', rolls: [], fields: [{ id: 'f_x1', key: 'X', kind: 'number', def: 3, vis: 'gm' }, { id: 'f_x2', key: 'X', kind: 'number', def: 4 }, { id: 'f_p', key: 'P', kind: 'resource', maxFormula: 'X', def: 'max' }] }, PVP);
        check('GM-only pools: a system without such a pool gets the view it always did (both presets, both HUD fixtures, this system with its GM-only field made visible); a raw system where a GM-only and a visible field share a key hides the pool whose max names it (the GM-only one wins, fail closed)',
            [d20, g3d6, fxP('hud-d20'), fxP('hud-3d6'), openP].every(visP) && cleanSystem(openP, PVP).fields.some(f => f.id === 'f_vig') && !dupP.fields.some(f => f.id === 'f_p'), j(dupP.fields.map(f => f.id)));
        const vwP = validateSystem(gP, F), wOf = id => vwP.warnings.filter(w => w.id === id).map(w => w.message);
        check('GM-only pools: the validator says such a pool is GM only (on its max) in place of "players will see an error" for the GM-only name its max reads; a formula, a caption, a roll and a roll label that name it are warned about as a GM-only name is; a pool with a visible max says nothing',
            vwP.ok && ['f_vig', 'f_gri', 'f_ech'].every(id => j(wOf(id)) === j(['The max reads a GM-only value, so this pool is GM only: players will not see it.'])) && vwP.warnings.filter(w => w.id === 'f_vig').every(w => w.prop === 'maxFormula')
            && j(wOf('f_low')) === j(['"Vigor" is GM only: players will see an error for this field.']) && j(wOf('f_mana')) === j(['Caption: "Vigor" is GM only, so players will not see this caption.']) && j(wOf('f_bon')) === j(['"GMFig" is GM only: players will see an error for this field.'])
            && j(wOf('r_v')) === j(['"Vigor" is GM only: players will see an error for this roll.']) && j(wOf('r_g')) === j(['Label: "Grit" is GM only, so players see only "Burn".']) && wOf('r_w').length === 0 && wOf('f_mr').length === 0, j(vwP.warnings));
        const chP = { id: 'c_1', values: { f_vig: { cur: 20 }, f_gri: { cur: 4 } } }, edP = (sys, id, v, o) => S.applyEdit(sys, chP, id, { cur: v }, F, o);
        const refP = ['f_vig', 'f_gri', 'f_ech'].map(id => edP(gP, id, 999, { player: true })).concat([edP(vP, 'f_vig', 999, { player: true }), edP(gP, 'f_vig', 1, { player: true })]);
        check('GM-only pools: a player\'s edit of such a pool is refused as a GM-only field\'s is ("field"), whatever the value (never clamped against the hidden max and answered), on the host\'s system and on the players\' view; a pool with a visible max is still clamped to it; the GM\'s own edit still clamps to the real max',
            refP.every(r => j(r) === j({ ok: false, reason: 'field' })) && j(edP(gP, 'f_mana', 999, { player: true })) === j({ ok: true, value: { cur: 10 } }) && j(edP(gP, 'f_vig', 999, {})) === j({ ok: true, value: { cur: 24 } }) && j(edP(gP, 'f_gri', 999, {})) === j({ ok: true, value: { cur: 13 } }), j(refP));
        const cP = { id: 'c_1', name: 'Ana', ownerId: 'u_a', npc: false, values: { f_vig: { cur: 20 }, f_gri: { cur: 4 }, f_ech: { cur: 1 }, f_mana: { cur: 7 }, f_wis: 5 } };
        const ownP = charFor(cP, vP, 'u_a'), mateP = charFor(cP, vP, 'u_b'), probeP = charFor(cP, vP, 'u_a', { probe: true }), linesP = hoverLines(vP, ownP, F);
        check('GM-only pools: what a player receives is read through the players\' view, so neither the owner (their whole copy, the probe that decides a delta) nor a teammate (hover fields and the host-worked lines) gets such a pool\'s value, stored or full',
            j(keysP(ownP.values)) === j(['f_mana', 'f_wis']) && j(keysP(mateP.values)) === j(['f_mana']) && j(keysP(probeP.values)) === j(['f_mana', 'f_wis']) && !linesP.some(l => /Vigor|Grit|Echo/.test(l)) && linesP.some(l => /^Mana 7/.test(l)), j([ownP.values, mateP.values, linesP]));
        // the property: a visible name is listed exactly when the players' view cannot give the value the GM's resolver has, pools full and stored
        const namesP = f => [f.key].concat(f.kind === 'resource' ? [f.key + '.max', f.key + '.cur'] : f.kind === 'skill' ? [f.key + '.base', f.key + '.ranks'] : []), isValP = v => v !== undefined && !(v && typeof v === 'object');
        const offP = [{ id: 'c_1', values: {} }, chP].map(ch => { const gv = S.makeResolver(gP, ch, F), pv = S.makeResolver(vP, ch, F), off = [];
            gP.fields.filter(f => f.vis !== 'gm').forEach(f => namesP(f).forEach(n => { const a = gv(n); if (!isValP(a)) return; const b = pv(n); if ((S.gmDerivedNames(gP, F, [{ name: n }]).length > 0) !== (!isValP(b) || b !== a)) off.push(n); })); return off; });
        check('GM-only pools: gmDerivedNames lists a name exactly when the players\' view cannot give the GM\'s value — every name of such a pool and what reads it, full or stored', offP.every(o => o.length === 0), j(offP));
        check('GM-only pools: Help (sheets, Visible to players or GM only) says such a pool is GM only as a whole',
            /A resource whose maximum is worked out from a GM-only field, directly or through a visible formula, is GM only as a whole: its value would tell players the maximum, so it never leaves your machine either\./.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')));
    }

    /* ---- Stage 6 look fold (L8): monospaced numbers, band inline / chips, arrows inside, boxed results, item cards ---- */
    {
        const sys8 = look => cleanSystem({ v: 1, name: 'L8', fields: [{ id: 'f_a', key: 'A', kind: 'number', def: 1, vis: 'all', edit: 'owner' }], rolls: [], sheet: { sections: [{ id: 's_a', title: 'A', cols: 1, fields: [{ id: 'f_a', w: 1 }] }], look } }, { F, gmView: true }).sheet.look;
        const pal8 = { text: '#111111', muted: '#222222', panel: '#333333', card: '#444444', field: '#555555', edge: '#666666', primary: '#777777', danger: '#888888', good: '#999999', warn: '#aaaaaa' };
        const all8 = sys8({ rows: 'cards', palette: pal8, effects: 'cards', values: 'boxed', steppers: 'inside', band: 'chips', numbers: 'mono', sticky: true, labels: 'caps', portrait: true, accent: '#123456', tabs: 'angular', titles: 'accordion' });
        const bad8 = [{ numbers: 'serif' }, { band: 'tiles' }, { band: 'constructor' }, { steppers: 'beside' }, { values: 'box' }, { rows: 'card' }, { rows: '__proto__' }].map(sys8);
        check('look L8: cleanLook keeps numbers mono, band inline|chips, steppers inside, values boxed and rows cards, and every look key comes out in the spec order (titles, tabs, accent, portrait, labels, sticky, numbers, band, steppers, values, effects, rows, palette); other values leave no look key',
            all8 && j(Object.keys(all8)) === j(['titles', 'tabs', 'accent', 'portrait', 'labels', 'sticky', 'numbers', 'band', 'steppers', 'values', 'effects', 'rows', 'palette']) && sys8({ band: 'inline' }).band === 'inline' && bad8.every(x => x === undefined), j([all8 && Object.keys(all8), bad8]));
        const sh8 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        // the real stepWrap, run against a small fake DOM: the box changes at once, one commit after the last click, none when back where it started
        const swSrc = sh8.slice(sh8.indexOf('function stepWrap('), sh8.indexOf('// Stage 6 look fold (L7): a badge'));
        const fakeEl = (tag, cls, text) => ({ tag, className: cls || '', textContent: text || '', dataset: {}, children: [], disabled: false, title: '', type: '', listeners: {}, appendChild(x) { this.children.push(x); return x; }, classList: { add() {} }, addEventListener(t, fn) { this.listeners[t] = fn; } });
        const runStep = (field, start, clicks, editable) => {
            const timers = [], commits = [];
            const stepWrap = new Function('el', 'commit', 'setTimeout', 'clearTimeout', swSrc + '\nreturn stepWrap;')(fakeEl, (c, f, v) => commits.push(v), fn => { timers.push(fn); return timers.length; }, () => { timers.length = 0; });
            const inp = fakeEl('input'); inp.value = String(start);
            const w = stepWrap(inp, field, { id: 'c_1' }, editable), btns = w.children[1].children, up = btns.find(b => b.dataset.part === 'up'), down = btns.find(b => b.dataset.part === 'down');
            clicks.forEach(k => (k > 0 ? up : down).listeners.click());
            const shown = inp.value; timers.splice(0).forEach(fn => fn());
            return { shown, commits, disabled: up.disabled && down.disabled, parts: btns.map(b => b.dataset.part + ':' + b.dataset.fid) };
        };
        const r1 = runStep({ id: 'f_a', step: 1, min: 0, max: 10 }, 5, [1, 1, 1], true), r2 = runStep({ id: 'f_a', step: 1 }, 5, [1, -1], true), r3 = runStep({ id: 'f_a', step: 2, min: 0, max: 10 }, 9, [1, 1], true), r4 = runStep({ id: 'f_a', step: 0.5 }, 1, [-1], false);
        check('look L8: arrows inside (the real stepWrap) — three clicks show 8 at once and send ONE commit of 8; up then down sends nothing; the step and the max clamp (9 + 2 + 2 stops at 10); up and down carry the field id and are disabled exactly when the box is',
            r1.shown === '8' && j(r1.commits) === j([8]) && r2.shown === '5' && r2.commits.length === 0 && r3.shown === '10' && j(r3.commits) === j([10]) && r4.disabled && !r1.disabled && j(r1.parts) === j(['up:f_a', 'down:f_a']), j([r1, r2, r3, r4]));
        check('look L8: the band class is picked by comparison; the arrows are added only under the look and never over a drawn slider; a pop-out disables them; applyLook toggles the four body classes',
            /var lkB = \(sys && sys\.sheet && sys\.sheet\.look\) \|\| \{\}; if \(lkB\.band === 'inline'\) bandEl\.classList\.add\('sheet-band-inline'\); else if \(lkB\.band === 'chips'\) bandEl\.classList\.add\('sheet-band-chips'\);/.test(sh8)
            && /if \(lkS\.steppers === 'inside' && !\(k === 'number' && f\.slider && f\.min !== undefined && f\.max !== undefined\)\) row\.appendChild\(stepWrap\(inp, f, c, editable\)\);[^\n]*\n\s*else row\.appendChild\(inp\);/.test(sh8)
            && /container\.querySelectorAll\('\[data-part="up"\], \[data-part="down"\]'\)\.forEach\(function\(el\) \{ el\.disabled = true; \}\);/.test(sh8)
            && /body\.classList\.toggle\('sheet-num-mono', L\.numbers === 'mono'\); body\.classList\.toggle\('sheet-steppers-inside', L\.steppers === 'inside'\);/.test(sh8) && /body\.classList\.toggle\('sheet-values-boxed', L\.values === 'boxed'\); body\.classList\.toggle\('sheet-rows-cards', L\.rows === 'cards'\);/.test(sh8)
            && (sh8.match(/fieldNode\([^)]*, gm, own, sys(, all\.vars, pl)?\)/g) || []).length === 2);
        const css8 = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, '\n'), l8css = css8.slice(css8.indexOf('/* Stage 6 look fold (L8)'), css8.indexOf('/* Stage 6 look fold (L7)'));
        const l8rules = l8css.split('\n').filter(x => /\{/.test(x) && !/^\s*\/\*/.test(x)), ungated8 = l8rules.filter(x => !/\.sheet-num-mono|\.sheet-band-inline|\.sheet-band-chips|\.sheet-steppers-inside|\.sheet-values-boxed|\.sheet-rows-cards/.test(x.split('{')[0]));
        check('look L8: every rule is gated by its class; the arrow masks are literal URLs to bundled files; the editor offers all five in the details row; tour and Help say so',
            l8rules.length >= 28 && ungated8.length === 0 && ['chevron-up', 'chevron-down'].every(n => l8css.indexOf('url("assets/icons/fa/solid/' + n + '.svg")') >= 0 && fs.existsSync(path.join(app, 'assets', 'icons', 'fa', 'solid', n + '.svg')))
            && ['sys-look-numbers', 'sys-look-band', 'sys-look-steppers', 'sys-look-values', 'sys-look-rows'].every(c => sh8.indexOf("select('" + c + "'") >= 0)
            && /numbers can be <b>monospaced<\/b>, the band a row of <b>chips<\/b>/.test(fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8')) && /The same box sets <b>monospaced numbers<\/b>/.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')), j([l8rules.length, ungated8]));
    }

    /* ---- Stage 6 look fold (L7): a formula as a badge coloured by its value name; a pool's own colour ---- */
    {
        const fl7 = [
            { id: 'f_lvl', key: 'Lvl', kind: 'number', def: 1, vis: 'all', edit: 'owner' },
            { id: 'f_st', key: 'Stun', kind: 'formula', formula: 'Lvl', labels: ['Ready', 'Shaken', 'Down'], tones: ['good', 'constructor', 'danger', 'warn', 'accent'], badge: true, vis: 'all' },
            { id: 'f_b2', key: 'Plain', kind: 'formula', formula: 'Lvl', badge: true, tones: ['good'], vis: 'all' },
            { id: 'f_bl', key: 'Blank', kind: 'formula', formula: 'Lvl', labels: ['A', 'B'], tones: ['', 'x'], vis: 'all' },
            { id: 'f_nb', key: 'NumB', kind: 'number', def: 0, badge: true, tones: ['good'], color: '#AABBCC', vis: 'all', edit: 'owner' },
            { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '10', def: 'max', color: '#AABBCC', badge: true, vis: 'all', edit: 'owner' },
            { id: 'f_fp', key: 'FP', kind: 'resource', maxFormula: '10', def: 'max', color: 'red', vis: 'all', edit: 'owner' },
            { id: 'f_gm', key: 'Secret', kind: 'formula', formula: 'Lvl', labels: ['a', 'b'], tones: ['good', 'danger'], badge: true, vis: 'gm' }
        ];
        const s7 = cleanSystem({ v: 1, name: 'L7', fields: fl7, rolls: [] }, { F, gmView: true }), fb = id => s7.fields.find(x => x.id === id);
        check('look L7: badge is kept only on a formula; tones only with value names, each a known tone (good|warn|danger|accent|primary) or blank, cut to the names, trailing blanks trimmed, all-blank = absent; color only on a resource, hex, lower-cased',
            fb('f_st').badge === true && j(fb('f_st').tones) === j(['good', '', 'danger']) && fb('f_b2').badge === true && !('tones' in fb('f_b2')) && !('tones' in fb('f_bl')) && !('badge' in fb('f_bl'))
            && !('badge' in fb('f_nb')) && !('tones' in fb('f_nb')) && !('color' in fb('f_nb')) && fb('f_hp').color === '#aabbcc' && !('badge' in fb('f_hp')) && !('color' in fb('f_fp')), j(s7.fields.map(x => [x.id, x.badge, x.tones, x.color])));
        const p7 = cleanSystem(s7, { F, gmView: false }), pb = id => p7.fields.find(x => x.id === id);
        check('look L7: the players\' view keeps badge, tones and color on visible fields; a GM-only field is still dropped whole', pb('f_st').badge === true && j(pb('f_st').tones) === j(['good', '', 'danger']) && pb('f_hp').color === '#aabbcc' && !pb('f_gm'), j(p7.fields.map(x => x.id)));
        const vt = S.valueTone, ft = fb('f_st');
        const tonesOut = [vt(ft, { value: 0, label: 'Ready' }), vt(ft, { value: 1, label: 'Shaken' }), vt(ft, { value: 2, label: 'Down' }), vt(ft, { value: 3, label: '3' }), vt(ft, { value: 0.5, label: 'x' }), vt(ft, { value: 0, error: 'bad' }), vt(ft, { value: 0 }), vt({ tones: ['__proto__'] }, { value: 0, label: 'a' }), vt(null, { value: 0, label: 'a' })];
        check('look L7: valueTone gives the value name\'s tone, and "" out of range, for a fraction, on an error, with no name, for an unknown tone or a prototype name', j(tonesOut) === j(['good', '', 'danger', '', '', '', '', '', '']), j(tonesOut));
        const sh7 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        check('look L7: the badge wraps the value\'s text only with no error, its class from the constant TONE_CLASS map (never built from the stored tone); the pool colour is checked again as hex at the sink and set as a CSS variable',
            /if \(f\.badge && e && !e\.error\) \{ var tnB = valueTone\(f, e\), bd = el\('span', 'sheet-badge' \+ \(Object\.prototype\.hasOwnProperty\.call\(TONE_CLASS, tnB\) \? TONE_CLASS\[tnB\] : ''\), v\.textContent\); v\.textContent = ''; v\.appendChild\(bd\); \}/.test(sh7)
            && /var TONE_CLASS = Object\.freeze\(\{ good: ' sheet-tone-good', warn: ' sheet-tone-warn', danger: ' sheet-tone-danger', accent: ' sheet-tone-accent', primary: ' sheet-tone-primary' \}\);/.test(sh7)
            && /if \(typeof f\.color === 'string' && \/\^#\[0-9a-fA-F\]\{6\}\$\/\.test\(f\.color\)\) \{ box\.classList\.add\('sheet-pool-colored'\); box\.style\.setProperty\('--sheet-pool', f\.color\); \}/.test(sh7));
        check('look L7: the Fields tab has Badge on a formula, a colour and "No colour" on a resource, and a colour per value name for a badge with names; each change goes through its own branch',
            /bgc\.className = 'sys-badge-chk'/.test(sh7) && /rci\.className = 'sys-res-color'/.test(sh7) && /rcc\.dataset\.act = 'rescolorclr'/.test(sh7) && /select\('sys-tone-sel', \[\['', 'Plain'\], \['good', 'Good \(green\)'\], \['warn', 'Warning \(amber\)'\], \['danger', 'Danger \(red\)'\], \['accent', 'Accent'\], \['primary', 'Primary'\]\]/.test(sh7)
            && /else if \(c\.indexOf\('sys-badge-chk'\) >= 0\) \{ if \(t\.checked\) f\.badge = true; else delete f\.badge;/.test(sh7) && /else if \(act === 'rescolorclr'\) \{ delete item\.color; \}/.test(sh7));
        const css7 = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, '\n'), l7css = css7.slice(css7.indexOf('/* Stage 6 look fold (L7)'), css7.indexOf('/* Stage 6 look fold (L6)'));
        check('look L7: the badge, its five tones and the pool colour rules are there (a pool rule only under .sheet-pool-colored); tour and Help say so',
            /\.sheet-badge \{ display: inline-flex;/.test(l7css) && ['good', 'warn', 'danger', 'accent', 'primary'].every(t => l7css.indexOf('.sheet-badge.sheet-tone-' + t + ' {') >= 0)
            && /\.sheet-pool-colored \.sheet-pool-icon \{ color: var\(--sheet-pool\); \}/.test(l7css) && /\.sheet-pool-colored \.sheet-bar-fill \{ background: var\(--sheet-pool\); \}/.test(l7css)
            && /a formula with value names can show as a coloured <b>badge<\/b>, and a resource can have its own <b>colour<\/b>/.test(fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8')) && /On the Fields tab a formula can show as a <b>badge<\/b>/.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')));
    }

    /* ---- Stage 6 look fold (L6): status effects as cards, a pill per change ---- */
    {
        const sysL6 = look => cleanSystem({ v: 1, name: 'L6', fields: [{ id: 'f_a', key: 'A', kind: 'number', def: 1, vis: 'all', edit: 'owner' }], rolls: [], sheet: { sections: [{ id: 's_a', title: 'A', cols: 1, fields: [{ id: 'f_a', w: 1 }] }], look } }, { F, gmView: true });
        const l6 = sysL6({ effects: 'cards', sticky: true, titles: 'accordion' }), l6bad = ['card', 'lines', 'constructor', true, 1].map(v => sysL6({ effects: v }));
        check('look L6: cleanLook keeps effects "cards" only, after sticky (titles, tabs, accent, portrait, labels, sticky, effects, palette); any other value leaves no look key; the players\' view keeps it',
            l6.sheet.look && j(Object.keys(l6.sheet.look)) === j(['titles', 'sticky', 'effects']) && l6bad.every(s => !s.sheet.look) && cleanSystem(l6, { F, gmView: false }).sheet.look.effects === 'cards', j([l6.sheet.look, l6bad.map(s => s.sheet.look)]));
        const sh6 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const fxSlice6 = sh6.slice(sh6.indexOf('function effectsInto('), sh6.indexOf('// Stage 5g: a value coloured by its sign'));
        const pillSrc = sh6.slice(sh6.indexOf('function fxPillText('), sh6.indexOf('\n', sh6.indexOf('function fxPillText(')));
        const fxPillText = new Function('fmtNum', pillSrc + '\nreturn fxPillText;')(S.fmtNum);
        const lab6 = { f_st: 'ST', f_hp: 'HP', f_pr: 'Prone' };
        const pills = [fxPillText({ f: 'f_st', op: 'add', v: 2 }, lab6), fxPillText({ f: 'f_hp', op: 'add', v: -5, part: 'max' }, lab6), fxPillText({ f: 'f_pr', op: 'on' }, lab6), fxPillText({ f: 'f_gone', op: 'add', v: 0.5 }, lab6)];
        check('look L6: a pill reads amount first (the owner\'s Q10) — "+2 ST", "−5 HP max", the name alone for a switch, "?" for a field that is gone', j(pills) === j(['+2 ST', '\u22125 HP max', 'Prone', '+0.5 ?']), j(pills));
        check('look L6: fxCard and fxPillText sit inside the effects slice (no innerHTML there); the card is used only when the look asks, with the switch built once above the branch; a pill\'s class is picked by comparison; the × is the existing remove, for whoever may end it',
            /function fxCard\(/.test(fxSlice6) && /function fxPillText\(/.test(fxSlice6) && !/innerHTML/.test(fxSlice6)
            && /var cards = !!\(sys && sys\.sheet && sys\.sheet\.look && sys\.sheet\.look\.effects === 'cards'\);/.test(fxSlice6)
            && /sw\.addEventListener\('change', function\(\) \{ commitEffect\(c, f, \{ op: 'on', rowId: r\.id, on: sw\.checked \}\); \}\);\n\s*if \(cards\) \{ wrap\.appendChild\(fxCard\(line, sw, r, d, f, c, labels, editable\)\); return; \}/.test(fxSlice6)
            && /'sheet-fx-mod ' \+ \(m\.op === 'on' \? 'sheet-fx-mod-on' : m\.v >= 0 \? 'sheet-fx-mod-pos' : 'sheet-fx-mod-neg'\)/.test(fxSlice6)
            && /if \(editable\) \{ var rm = el\('button', 'tool ghost sheet-pm sheet-fx-rm sheet-fx-x', '\\u00d7'\);[^\n]*commitEffect\(c, f, \{ op: 'remove', rowId: r\.id \}\)/.test(fxSlice6)
            && /iconNode\('icon:hourglass-half', 'sheet-fx-durico'\)/.test(fxSlice6));
        const css6 = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, '\n'), l6css = css6.slice(css6.indexOf('/* Stage 6 look fold (L6)'), css6.indexOf('/* Stage 6 look fold (L5)'));
        const l6rules = l6css.split('\n').filter(x => /\{/.test(x) && !/^\s*\/\*/.test(x)), ungated = l6rules.filter(x => !/\.sheet-fx-cards /.test(x.split('{')[0]));
        check('look L6: every card rule is gated by .sheet-fx-cards; the only global rules are the pill\'s own (.sheet-fx-mod, -pos, -neg, -on), which exist only on cards; applyLook toggles the class by comparison; the Sheet look box offers Effect cards; tour and Help say so',
            l6rules.length === 16 && j(ungated.map(x => x.trim().split(' {')[0])) === j(['.sheet-fx-mod', '.sheet-fx-mod-pos', '.sheet-fx-mod-neg', '.sheet-fx-mod-on'])
            && /body\.classList\.toggle\('sheet-fx-cards', L\.effects === 'cards'\);/.test(sh6) && /\['cards', 'Effect cards'\]/.test(sh6) && /fxSel\.addEventListener\('change', function\(\) \{ setShape\('effects', fxSel\.value\); \}\);/.test(sh6)
            && /status effects can show as <b>cards<\/b> with a pill per change/.test(fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8')) && /<b>Effect cards<\/b> show each status effect as a card/.test(fs.readFileSync(path.join(app, 'index.html'), 'utf8')), j([l6rules.length, ungated]));
    }

    /* ---- Stage 6 look fold (L5): accordion titles, sticky titles, angular tabs ---- */
    {
        const pal10 = { text: '#111111', muted: '#222222', panel: '#333333', card: '#444444', field: '#555555', edge: '#666666', primary: '#777777', danger: '#888888', good: '#999999', warn: '#aaaaaa' };
        const withLook = look => cleanSystem({ v: 1, name: 'L5', fields: [{ id: 'f_a', key: 'A', kind: 'number', def: 1, vis: 'all', edit: 'owner' }], rolls: [], sheet: { sections: [{ id: 's_a', title: 'A', cols: 1, fields: [{ id: 'f_a', w: 1 }] }], look } }, { F, gmView: true });
        const lookOf = look => { const s = withLook(look); return s && s.sheet ? s.sheet.look : undefined; };
        const full = lookOf({ palette: pal10, sticky: true, labels: 'caps', portrait: true, accent: '#AABBCC', tabs: 'angular', titles: 'accordion' });
        check('look L5: cleanLook keeps accordion titles, angular tabs and sticky (true only), in the order titles, tabs, accent, portrait, labels, sticky, palette',
            full && j(Object.keys(full)) === j(['titles', 'tabs', 'accent', 'portrait', 'labels', 'sticky', 'palette']) && full.titles === 'accordion' && full.tabs === 'angular' && full.sticky === true, j(full));
        const bad = [{ titles: 'angled' }, { tabs: 'angled' }, { titles: 'constructor' }, { tabs: '__proto__' }, { titles: 'toString' }, { sticky: 'yes' }, { sticky: 1 }, { sticky: {} }].map(lookOf);
        check('look L5: other title and tab values, a prototype name and a sticky that is not true are dropped (a look with nothing valid leaves no look key)', bad.every(x => x === undefined), j(bad));
        const pv = cleanSystem(withLook({ titles: 'accordion', tabs: 'angular', sticky: true }), { F, gmView: false });
        check('look L5: the players\' view keeps the three (nothing in a look is secret)', pv && pv.sheet && pv.sheet.look && pv.sheet.look.titles === 'accordion' && pv.sheet.look.tabs === 'angular' && pv.sheet.look.sticky === true, j(pv && pv.sheet));
        const sh = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), css = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, '\n');
        check('look L5: applyLook sets the two classes by comparison (never a class built from a stored string); the angular class is added on its own line after the asserted strip line; a filled or angular tab carries its label as a title',
            /body\.classList\.toggle\('sheet-titles-accordion', L\.titles === 'accordion'\); body\.classList\.toggle\('sheet-sticky-titles', L\.sticky === true\);/.test(sh)
            && /var strip = el\('div', 'sheet-tabs' \+ \(look\.tabs === 'filled' \? ' sheet-tabs-filled' : ''\)\);[^\n]*\n\s*if \(look\.tabs === 'angular'\) strip\.classList\.add\('sheet-tabs-angular'\);/.test(sh)
            && /if \(look\.tabs === 'filled' \|\| look\.tabs === 'angular'\) tb\.title = t\.label \|\| 'Tab';/.test(sh));
        check('look L5: syncFramePad keeps its asserted line and sets --sheet-frame-h only with sticky titles; applySheetLookTo gives a stuck title the sheet\'s own panel colour (--sheet-canvas) and removes it otherwise',
            /body\.style\.scrollPaddingTop = fr\.offsetHeight \+ 'px'; else if \(body\.style\.scrollPaddingTop\) body\.style\.scrollPaddingTop = '';\n\s*if \(fr && body\.classList\.contains\('sheet-sticky-titles'\)\) body\.style\.setProperty\('--sheet-frame-h', fr\.offsetHeight \+ 'px'\); else body\.style\.removeProperty\('--sheet-frame-h'\);/.test(sh)
            && /if \(style && style\.bgColor\) node\.style\.setProperty\('--sheet-canvas', style\.bgColor\); else node\.style\.removeProperty\('--sheet-canvas'\);/.test(sh));
        check('look L5: the Sheet look box offers Accordion titles, Angular tabs and a Sticky titles checkbox, each through setShape',
            /\['accordion', 'Accordion titles'\]/.test(sh) && /\['angular', 'Angular tabs'\]/.test(sh) && /stickyChk\.addEventListener\('change', function\(\) \{ setShape\('sticky', stickyChk\.checked\); \}\);/.test(sh));
        const l5css = css.slice(css.indexOf('/* Stage 6 look fold (L5)'), css.indexOf('#sheetPanel.sheet-has-headportrait #sheetTitle'));
        const l5rules = l5css.split('\n').filter(x => /\{/.test(x) && !/^\s*\/\*/.test(x));
        check('look L5: every new rule is gated by its class (.sheet-titles-accordion, .sheet-sticky-titles, .sheet-tabs-angular); the chevron is a literal URL to a bundled file that exists; a hovered angular tab has dark text on the accent (the owner\'s Q9)',
            l5rules.length >= 18 && l5rules.every(x => /\.sheet-titles-accordion|\.sheet-sticky-titles|\.sheet-tabs-angular/.test(x.split('{')[0]))
            && /url\("assets\/icons\/fa\/solid\/chevron-down\.svg"\)/.test(l5css) && fs.existsSync(path.join(app, 'assets', 'icons', 'fa', 'solid', 'chevron-down.svg'))
            && /\.sheet-tabs-angular > \.sheet-tab:not\(\.active\):hover \{ background: color-mix\(in srgb, var\(--sheet-accent, var\(--gold\)\) 75%, transparent\); color: var\(--sheet-accent-ink, #111318\); \}/.test(l5css)
            && /\.sheet-sticky-titles > \.sheet-section:not\(\.sheet-subsection\):not\(\.sheet-dash\) > \.sheet-sec-title \{ position: sticky; top: var\(--sheet-frame-h, 0px\);/.test(l5css), j(l5rules.filter(x => !/\.sheet-titles-accordion|\.sheet-sticky-titles|\.sheet-tabs-angular/.test(x.split('{')[0]))));
        const tut5 = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8'), help5 = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        check('look L5: the tour and Help both describe accordion titles, sticky titles and angular tabs', /<b>accordion<\/b> titles that <b>stay at the top<\/b>[^']*<b>angular<\/b>/.test(tut5) && /<b>accordion<\/b> titles[^<]*<b>Sticky titles<\/b>[^<]*<b>angular<\/b> tabs/.test(help5.replace(/&rsquo;/g, "'")));
    }

    /* ---- Stage 6 look fold (L4): pin groups — band groups, the Pin button, a viewer's pins per character ---- */
    {
        const gf4 = [{ id: 'f_a', key: 'A', kind: 'number', def: 1, vis: 'all' }, { id: 'f_b', key: 'B', kind: 'number', def: 1, vis: 'all' }, { id: 'f_s', key: 'S', kind: 'number', def: 1, vis: 'gm' }];
        const mk4 = (sheet, gmView) => cleanSystem({ v: 1, name: 'P', fields: gf4, rolls: [{ id: 'r_i', label: 'I', formula: 'd20', vis: 'all' }], sheet }, { F, gmView: gmView !== false });
        const g4 = mk4({ bandGroups: [{ id: 'g_a', label: ' Points\u0001 ', icon: 'x', on: true }, { id: 'g_a', label: 'Dup' }, { id: 'bad', label: 'B' }, { id: 'g_b', label: '' }, { id: 'g_c' }, { id: 'g_d' }, { id: 'g_e' }, { id: 'g_f' }, { id: 'g_g' }, 'x', null],
            band: [{ id: 'f_a', g: 'g_a' }, { id: 'f_b', g: 'g_zz' }, { roll: 'r_i', g: 'g_b' }], sections: [{ id: 's_1', title: 'T', cols: 1, pin: 'g_a', fields: [{ kind: 'pin', g: 'g_b', w: 1, text: ' Keep\u0007it ' }, { kind: 'pin', g: 'g_nope', w: 1 }, { kind: 'pin', w: 1 }] }, { id: 's_2', title: 'U', cols: 1, pin: 'g_zz', fields: [] }] });
        check('look L4: band groups — ids g_…, once, at most 6, the label cleaned (blank reads "Group"), nothing else kept; a band entry keeps its group only when it exists; a Pin placement and a section-header pin only for a group that exists (the label optional, cleaned)',
            j(g4.sheet.bandGroups) === j([{ id: 'g_a', label: 'Points' }, { id: 'g_b', label: 'Group' }, { id: 'g_c', label: 'Group' }, { id: 'g_d', label: 'Group' }, { id: 'g_e', label: 'Group' }, { id: 'g_f', label: 'Group' }]) && LIMITS.bandGroups === 6
            && j(g4.sheet.band) === j([{ id: 'f_a', g: 'g_a' }, { id: 'f_b' }, { roll: 'r_i', g: 'g_b' }]) && j(g4.sheet.sections[0].fields) === j([{ kind: 'pin', w: 1, g: 'g_b', text: 'Keep it' }]) && g4.sheet.sections[0].pin === 'g_a' && !('pin' in g4.sheet.sections[1])
            && j(Object.keys(g4.sheet)) === j(['tabs', 'sections', 'band', 'bandGroups']), j(g4.sheet));
        const none = mk4({ band: [{ id: 'f_a' }], sections: [] });
        check('look L4: a sheet with no groups is unchanged — no bandGroups key, band entries as bare { id }', !('bandGroups' in none.sheet) && j(none.sheet.band) === j([{ id: 'f_a' }]));
        const gmOnly = { bandGroups: [{ id: 'g_v', label: 'Visible' }, { id: 'g_h', label: 'Secret figures' }, { id: 'g_e', label: 'Empty' }], band: [{ id: 'f_a', g: 'g_v' }, { id: 'f_s', g: 'g_h' }], sections: [{ id: 's_1', title: 'T', cols: 1, pin: 'g_h', fields: [{ kind: 'pin', g: 'g_h', w: 1 }, { kind: 'pin', g: 'g_v', w: 1 }] }] };
        const gmV = mk4(gmOnly), plV = mk4(gmOnly, false);
        check('look L4: the players\' view keeps a group only while a visible band entry of it survives — a group over GM-only figures, and its Pins, never travel (its label is the GM\'s text); the GM keeps an empty group (nothing set is lost on Save)',
            j(gmV.sheet.bandGroups.map(g => g.id)) === j(['g_v', 'g_h', 'g_e']) && j(plV.sheet.bandGroups) === j([{ id: 'g_v', label: 'Visible' }]) && !('pin' in plV.sheet.sections[0]) && j(plV.sheet.sections[0].fields) === j([{ kind: 'pin', w: 1, g: 'g_v' }]) && !/Secret figures/.test(j(plV)), j(plV.sheet));
        const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'look-d20.json'), 'utf8')), fxP = cleanSystem(fx, { F, gmView: false }), fxG = cleanSystem(fx, { F, gmView: true });
        const pr2 = S.pruneGroups({ list: [{ id: 'g_1', label: 'A' }, { id: 'g_2', label: 'B' }], ids: Object.assign(Object.create(null), { g_1: 1, g_2: 1 }) }, [[{ id: 'f_a', g: 'g_1' }], [{ id: 'f_b', g: 'g_2' }]]);
        const pt = S.pinTargets([{ id: 's', pin: 'g_x', fields: [{ kind: 'pin', g: 'g_y' }, { id: 'f_a' }] }, null, { id: 't', fields: 'x' }]);
        const vw4 = S.validateSystem(fxG, F).warnings.filter(w => /band group/.test(w.message));
        check('look L4: on the d20 test system the players lose the GM figures\' group and its Pin but keep Spell slots (with its header Pin) and Rest; pruneGroups keeps a group used only on a second band (a later view); pinTargets finds both Pin forms; the editor says a group with no Pin is always shown',
            j(fxP.sheet.bandGroups.map(g => g.id)) === j(['g_slots', 'g_rest']) && fxP.sheet.sections.find(s => s.id === 's_spell').pin === 'g_slots' && !fxP.sheet.sections.some(s => (s.fields || []).some(p => p.kind === 'pin' && p.g === 'g_gm'))
            && j(pr2.list.map(g => g.id)) === j(['g_1', 'g_2']) && j(Object.keys(pt).sort()) === j(['g_x', 'g_y']) && Object.getPrototypeOf(pt) === null
            && vw4.length === 1 && vw4[0].id === 'g_rest', j([fxP.sheet.bandGroups, vw4]));
        // a viewer's pins (sliced from sheets.js): stored per campaign and character, on this machine only; every read re-checks the shape
        const sh4p = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), pinSrc = sh4p.slice(sh4p.indexOf('// [systemcheck:pins-start]'), sh4p.indexOf('// [systemcheck:pins-end]'));
        let store = null, thrown = false; const pref = (k, d) => { if (thrown) throw new Error('blocked'); return store === null ? d : store; }, setPref = (k, v) => { store = String(v); };
        const P = new Function('pref', 'setPref', pinSrc + '\nreturn { pinState: pinState, isPinned: isPinned, setPinned: setPinned, groupShown: groupShown };')(pref, setPref);
        const bads = ['{nope', '[1,2]', '"x"', '42', 'null'].map(v => { store = v; return j(P.pinState('camp1', 'c_a')); });
        thrown = true; let threw = false; try { P.pinState('camp1', 'c_a'); } catch (e) { threw = true; } thrown = false;
        store = null; P.setPinned('camp1', 'c_a', 'g_pts', true); P.setPinned('camp1', 'c_a', 'g_pools', false); P.setPinned('camp1', 'c_b', 'g_pts', false);
        const aPts = P.isPinned('camp1', 'c_a', 'g_pts'), bPts = P.isPinned('camp1', 'c_b', 'g_pts'), aPools = P.isPinned('camp1', 'c_a', 'g_pools'), other = P.isPinned('camp2', 'c_a', 'g_pts');
        P.setPinned('camp1', 'c_a', 'bad id', true); P.setPinned('camp1', 'constructor', 'g_x', true); P.setPinned('__proto__', 'c_z', 'g_x', true);
        const raw = JSON.parse(store);
        store = JSON.stringify({ 'c:camp1': { c_a: { g_ok: 1, g_two: 2, 'no-good': 1, constructor: 1 }, junk: 5 } }); const rd = P.pinState('camp1', 'c_a');
        store = null; for (let i = 0; i < 20; i++) P.setPinned('camp1', 'c_a', 'g_' + i, true); const gCount = Object.keys(P.pinState('camp1', 'c_a')).length; for (let i = 0; i < 65; i++) P.setPinned('camp1', 'c_' + i, 'g_x', true); for (let i = 0; i < 45; i++) P.setPinned('k' + i, 'c_a', 'g_x', true);
        const capped = JSON.parse(store);
        const tg = Object.assign(Object.create(null), { g_p: 1 });
        check('look L4: pins (sliced from sheets.js) — corrupt, wrong-shaped or blocked storage reads as nothing and never throws; a pin belongs to one campaign AND one character (hidden until pinned); bad group or character ids are never stored; a "__proto__" campaign is stored under its "c:" key and leaves Object.prototype alone; stored junk is re-checked on read; caps of 16 groups, 60 characters and 40 campaigns; the Layout preview shows every group, a group with no Pin always shows',
            bads.every(b => b === '{}') && !threw && aPts && !bPts && !aPools && !other && j(Object.keys(raw)) === j(['c:camp1', 'c:__proto__']) && !('constructor' in raw['c:camp1'] && raw['c:camp1'].constructor !== Object) && j(Object.keys(raw['c:camp1'])) === j(['c_a', 'c_b']) && ({}).g_x === undefined
            && j(rd) === j({ g_ok: 1 }) && gCount === 16 && Object.keys(capped).length === 40 && Object.keys(capped['c:camp1'] || {}).length <= 60
            && P.groupShown({ id: 'g_p' }, tg, { preview: true, campId: 'camp1' }, 'c_a') === true && P.groupShown({ id: 'g_q' }, tg, { campId: 'camp1' }, 'c_a') === true && P.groupShown({ id: 'g_p' }, tg, { campId: 'camp1' }, 'c_nobody') === false, j([bads, raw, rd, gCount, Object.keys(capped).length]));
        const pinUI = sh4p.slice(sh4p.indexOf('function pinToggle('), sh4p.indexOf('function bandInto('));
        check('look L4: the Pin controls — a pin toggles only outside the Layout preview and never moves the content (scroll corrected by the clicked control, or the first section for the band\'s unpin); the header Pin never folds its section and does nothing inside the editor; a pin changed in another window redraws this one; no innerHTML',
            /if \(!g \|\| !ctx \|\| !ctx\.c \|\| \(ctx\.vctx && ctx\.vctx\.preview\) \|\| !PIN_GID\.test\(g\.id\)\) return;/.test(pinUI) && /body\.scrollTop \+= nb\.getBoundingClientRect\(\)\.top - top0;/.test(pinUI)
            && /var go = function\(e\) \{ e\.preventDefault\(\); e\.stopPropagation\(\); if \(ch\.closest\('#systemModal'\)\) return;/.test(pinUI) && !/innerHTML/.test(pinUI) && /window\.addEventListener\('storage', function\(e\) \{ if \(!e \|\| e\.key !== PIN_KEY\) return;/.test(sh4p));
    }

    /* ---- Stage 6 look fold (L3): identity rows edited in the header — one field, once; the name shown once ---- */
    {
        const hf = [
            { id: 'f_t', key: 'Cls', kind: 'text', def: '', vis: 'all', edit: 'owner' }, { id: 'f_s', key: 'Bg', kind: 'select', options: ['A', 'B'], def: 'A', vis: 'all', edit: 'owner' },
            { id: 'f_n', key: 'Lvl', kind: 'number', def: 1, vis: 'all', edit: 'owner' }, { id: 'f_g', key: 'Insp', kind: 'toggle', def: false, vis: 'all', edit: 'owner' },
            { id: 'f_f', key: 'Prof', kind: 'formula', formula: 'Lvl + 1', vis: 'all' }, { id: 'f_r', key: 'HP', kind: 'resource', maxFormula: '10', def: 'max', vis: 'all', edit: 'owner' },
            { id: 'f_k', key: 'Skill.X', kind: 'skill', base: '', def: 0, vis: 'all', edit: 'owner' }, { id: 'f_p', key: 'Pts', kind: 'number', def: 5, vis: 'all', edit: 'owner' },
            { id: 'f_v', key: 'Stun', kind: 'number', def: 0, labels: ['No', 'Yes'], vis: 'all', edit: 'owner' }, { id: 'f_x', key: 'Other', kind: 'number', def: 0, vis: 'all', edit: 'owner' }
        ];
        const hs = cleanSystem({ v: 1, name: 'H', fields: hf, rolls: [], sheet: { sections: [{ id: 's_a', title: 'Details', cols: 1, fields: [{ id: 'f_t', w: 1 }, { id: 'f_x', w: 1 }] }], identity: ['f_t', 'f_s', 'f_n', 'f_g', 'f_f', 'f_r', 'f_k'].map(id => ({ id })), ledger: ['f_p', 'f_v', 'f_f'].map(id => ({ id })) } }, { F, gmView: true });
        const he = S.headerEdits(hs), heIds = Object.keys(he).sort();
        check('look L3: headerEdits — identity rows that are text, a select, a number or a toggle, and ledger numbers without value names; never a formula, a skill, a resource or a named ledger number; a prototype-free set', j(heIds) === j(['f_g', 'f_n', 'f_p', 'f_s', 'f_t']) && Object.getPrototypeOf(he) === null && Object.keys(S.headerEdits({ fields: hf })).length === 0 && Object.keys(S.headerEdits(null)).length === 0, j(heIds));
        const al = S.autoLayout(hs), alIds = al.sections.flatMap(s => s.fields.map(p => p.id));
        check('look L3: the automatic layout leaves out exactly the fields the header edits (formulas, skills and resources in the header still get their section)', ['f_t', 'f_s', 'f_n', 'f_g', 'f_p'].every(id => alIds.indexOf(id) < 0) && ['f_f', 'f_r', 'f_k', 'f_v', 'f_x'].every(id => alIds.indexOf(id) >= 0), j(alIds));
        const vw = S.validateSystem(hs, F).warnings.filter(w => w.prop === 'layout');
        check('look L3: validateSystem warns when a field the header edits is also placed in a section (and only then)', vw.length === 1 && vw[0].id === 'f_t' && /edited in the header and placed again in Details/.test(vw[0].message), j(vw));
        const sh3 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), hb3 = sh3.slice(sh3.indexOf('function headerBlocks('), sh3.indexOf('function buildSections(')), idn = sh3.slice(sh3.indexOf('function idnControl('), sh3.indexOf('function accentInk('));
        check('look L3: the header edits a row in place only for whoever may edit the field (the section\'s rule, never on a teammate\'s copy) and never on an error, after the ledger branch; every control is data-part "idn" and goes through commit; nothing in the header uses innerHTML',
            idn.length > 0 && hb3.indexOf('function idnControl(') > 0 && !/innerHTML/.test(hb3) && /var idnOk = function\(f\) \{ return !c\.partial && \(gm \|\| \(own && f\.edit === 'owner' && f\.vis === 'all'\)\); \};/.test(hb3)
            && /it\.appendChild\(ed\); box\.appendChild\(it\); return;\s*\n\s*\}\s*\n\s*if \(!ledger && IDN_EDIT\[f\.kind\] === 1 && !en\.error && idnOk\(f\)\) \{ it\.appendChild\(idnControl\(f, c, all\[f\.id\], tone\)\);/.test(hb3)
            && /ctl\.dataset\.fid = f\.id; ctl\.dataset\.part = 'idn';/.test(idn) && (idn.match(/commit\(c, f, /g) || []).length === 5);
        const css3 = fs.readFileSync(path.join(app, 'style.css'), 'utf8'), tut3 = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8');
        check('look L3: with the portrait and name in the header, the title bar\'s name (and the pop-out\'s) is hidden visually but kept for screen readers; the tour seeds Class alone and moves an old seed (abilities stay tiles)',
            /#sheetPanel\.sheet-has-headportrait #sheetTitle, body:has\(#popoutBody \.sheet-head-name\) #popoutTitle \{ position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset\(50%\);/.test(css3)
            && (tut3.match(/identity = \[\{ id: 'f_tut_class' \}\]|identity: \[\{ id: 'f_tut_class' \}\]/g) || []).length === 3 && !/identity: \[\{ id: 'f_tut_class' \}, \{ id: 'f_tut_str' \}/.test(tut3));
    }

    /* ---- Stage 6 look fold (L2): bundled glyphs, roll tone and icon ---- */
    {
        const GL = S.GLYPHS, gp = S.glyphPath, W = 'icon:wand-magic-sparkles';
        const sysG = ic => cleanSystem({ v: 1, name: 'G', fields: [{ id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '10', def: 'max', vis: 'all', icon: ic }], rolls: [{ id: 'r_a', label: 'A', formula: 'd20', vis: 'all', icon: ic }], effects: [{ id: 'e_a', name: 'E', icon: ic, vis: 'all', mods: [] }], items: [{ id: 'i_a', name: 'I', icon: ic }], sheet: { tabs: [{ id: 't_a', label: 'T', icon: ic }], sections: [{ id: 's_a', title: 'S', cols: 1, icon: ic, fields: [] }] } }, { F, gmView: true });
        const iconsOf = s => [s.fields[0].icon, s.rolls[0].icon, s.effects[0].icon, s.items[0].icon, s.sheet.tabs[0].icon, s.sheet.sections[0].icon, S.cleanRowDef({ name: 'R', icon: s === null ? '' : W }, false).icon];
        const every = iconsOf(sysG(W)), upper = sysG(' ICON:Dice ');
        check('look L2: a bundled glyph ("icon:<name>") is kept on every icon — a pool, a roll, an effect, an item, a tab, a section and a carried row\'s copy — and a name in any case is kept lower-cased', every.every(v => v === W) && upper.sheet.tabs[0].icon === 'icon:dice' && upper.rolls[0].icon === 'icon:dice', j(every));
        const junk = ['icon:nope', 'icon:constructor', 'icon:__proto__', 'icon:../x', 'icon:dice.svg', 'icon:dice?x', 'icon:', 'icon:DICE%2e', 'icon:solid/dice', 'icon:dice\u0000x'].map(v => sysG(v));
        check('look L2: an "icon:" name that is not bundled is dropped, never kept as text (unknown, a prototype key, a path, an extension, a query, empty, percent-encoded, a folder, a control character)', junk.every(s => !('icon' in s.fields[0]) && !('icon' in s.rolls[0]) && !('icon' in s.sheet.tabs[0]) && !('icon' in s.sheet.sections[0]) && s.items[0].icon === '' && s.effects[0].icon === ''), j(junk.map(s => s.sheet.tabs[0])));
        const txt = sysG('fa:dice'), emo = sysG('\u2694\uFE0F'), dup = ['minus-circle', 'dizzy', 'thumbtack-slash', 'file-magnifying-glass', 'dice-d20', 'skull'].map(n => sysG('icon:' + n).sheet.tabs[0].icon);
        check('look L2: anything else stays on the emoji/text path as before ("fa:dice" is just text, an emoji is kept); the renamed and added glyphs are accepted', txt.sheet.tabs[0].icon === 'fa:dice' && emo.sheet.tabs[0].icon === '\u2694\uFE0F' && j(dup) === j(['icon:minus-circle', 'icon:dizzy', 'icon:thumbtack-slash', 'icon:file-magnifying-glass', 'icon:dice-d20', 'icon:skull']), j([txt.sheet.tabs[0], dup]));
        const gv = Object.keys(GL);
        check('look L2: the glyph table is prototype-free and frozen, 161 names (the 141 the reference sheet uses and 20 general tabletop icons); glyphPath answers only its values', Object.getPrototypeOf(GL) === null && Object.isFrozen(GL) && gv.length === 161 && gp('icon:dice') === 'solid/dice' && gp('icon:circle') === 'regular/circle' && gp('dice') === '' && gp('icon:constructor') === '' && gp(42) === '' && gv.every(n => /^[a-z0-9-]+$/.test(n) && /^(solid|regular)\/[a-z0-9-]+$/.test(GL[n])), gv.length);
        // the bundled files: one per name, each a plain Font Awesome Free SVG with its attribution, nothing active in it
        const faDir = path.join(app, 'assets', 'icons', 'fa'), files = ['solid', 'regular'].flatMap(st => fs.readdirSync(path.join(faDir, st)).map(f => st + '/' + f.replace(/\.svg$/, '')));
        const bad = gv.filter(n => { const f = path.join(faDir, GL[n] + '.svg'); if (!fs.existsSync(f)) return true; const s = fs.readFileSync(f, 'utf8'); return !/^<svg /.test(s) || !/Font Awesome Free/.test(s) || !/fontawesome\.com\/license/.test(s) || /<script|\son\w+\s*=|href|<foreignObject|url\(|<!ENTITY/i.test(s); });
        const woff = ['normal', 'italic'].map(st => fs.readFileSync(path.join(app, 'assets', 'fonts', 'inter', 'inter-latin-wght-' + st + '.woff2')).slice(0, 4).toString('latin1'));
        check('look L2: every glyph has its file (and no file lacks a name); each is a plain SVG keeping its Font Awesome Free attribution, with no script, handler, link, foreign object, url() or entity; the licence texts sit beside them; both Inter files are woff2',
            bad.length === 0 && files.length === gv.length && files.every(p => gv.some(n => GL[n] === p)) && ['LICENSE.txt', 'SUBSTITUTIONS.txt'].every(f => fs.existsSync(path.join(faDir, f))) && fs.existsSync(path.join(app, 'assets', 'fonts', 'inter', 'LICENSE')) && woff.every(m => m === 'wOF2'), j([bad, files.length, woff]));
        const rk = cleanSystem({ v: 1, name: 'R', fields: [], rolls: ['primary', 'danger', 'neutral', 'outline', 'quiet', 'constructor', 42].map((t, i) => ({ id: 'r_' + i, label: 'R', formula: 'd20', vis: 'all', tone: t, icon: 'icon:burst' })).concat([{ id: 'r_gm', label: 'G', formula: 'd20', vis: 'gm', tone: 'danger' }]) }, { F, gmView: false });
        check('look L2: a roll keeps a tone of filled, red, grey or outline (anything else dropped) and an icon, in the players\' view too; a GM-only roll is still left out', j(rk.rolls.map(r => r.tone || '')) === j(['primary', 'danger', 'neutral', 'outline', '', '', '']) && rk.rolls.every(r => r.icon === 'icon:burst') && !rk.rolls.some(r => r.id === 'r_gm'), j(rk.rolls));
        const shG2 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), iconFn = shG2.slice(shG2.indexOf('function iconNode('), shG2.indexOf('function iconText('));
        const pickSrc = shG2.slice(shG2.indexOf('var _glyphPop = null;'), shG2.indexOf('function buildSections('));
        check('look L2: the renderer builds a glyph URL only from glyphPath\'s answer; no innerHTML in iconNode or the picker; the picker keeps Escape and Enter from the editor, never lets its search box read as an edit, offers Icons and Emoji, and closes on a redraw; the option lists use iconText; a roll\'s tone class comes from an own-key lookup',
            /var p = glyphPath\(v\); if \(!p\) return el\('span', cls, v\);/.test(iconFn) && /var u = 'url\("' \+ GLYPH_BASE \+ p \+ '\.svg"\)';/.test(iconFn) && !/innerHTML/.test(iconFn) && !/innerHTML/.test(pickSrc) && pickSrc.length > 0
            && /if \(e\.key === 'Escape'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\);/.test(pickSrc) && /else if \(e\.key === 'Enter'\) \{ e\.preventDefault\(\); e\.stopPropagation\(\);/.test(pickSrc) && /q\.addEventListener\('input', function\(e\) \{ e\.stopPropagation\(\);/.test(pickSrc) && /'Emoji'/.test(pickSrc) && /EMOJI_SET/.test(shG2)
            && /function renderAll\(\) \{\s*\n\s*closeGlyphPicker\(\);/.test(shG2) && (shG2.match(/iconText\((d2|it)\.icon\)/g) || []).length === 6 && /Object\.prototype\.hasOwnProperty\.call\(ROLL_TONE_CLS, r\.tone\) \? ROLL_TONE_CLS\[r\.tone\] : ''/.test(shG2)
            && ['sys-tab-icon', 'sys-sec-icon', 'sys-res-icon', 'sys-fx-icon', 'sys-item-icon', 'sys-roll-icon'].every(c => new RegExp("input\\('" + c + " field'[^\\n]*glyphButton\\(").test(shG2)));
        const cssG = fs.readFileSync(path.join(app, 'style.css'), 'utf8'), faces = cssG.match(/url\("assets\/fonts\/inter\/[^"]+"\)/g) || [];
        check('look L2: Inter is declared from the bundled files (both exist), a glyph is a mask in currentColor, the servers send the font\'s type', faces.length === 2 && faces.every(u => fs.existsSync(path.join(app, u.slice(5, -2)))) && /\.wp-glyph \{[^}]*background-color: currentColor;[^}]*mask-size: contain;/.test(cssG)
            && /'\.woff2': 'font\/woff2'/.test(fs.readFileSync(path.join(__dirname, 'dev-server.js'), 'utf8')) && /if \(ext === '\.woff2'\) mime = 'font\/woff2';/.test(fs.readFileSync(path.join(__dirname, '..', 'system', 'resources', 'app', 'main.js'), 'utf8')), j(faces));
    }

    /* ---- Stage 6 Fold 2: the token's stance — Posture / Elevation names, the Stance placement ---- */
    {
        const SC6 = S.stanceCtx, on2 = { posture: true, elevation: true };
        check('6 F2: stanceCtx — the posture as its index (the 1.4.6 ids prone / supine too; anything else standing), the elevation in yards (bounded, a non-number reads 0), each 0 while its feature is off; null with no token or both features off',
            j(SC6({ posture: 'kneeling', elevation: 3.26 }, on2)) === j({ posture: 3, elevation: 3.3 }) && SC6({ posture: 'prone' }, on2).posture === 5 && SC6({ posture: 'supine' }, on2).posture === 6 && SC6({ posture: 'flying' }, on2).posture === 0 && SC6({ posture: 7 }, on2).posture === 0
            && SC6({ elevation: 'high' }, on2).elevation === 0 && SC6({ elevation: 1e9 }, on2).elevation === 999 && Object.is(SC6({ elevation: -0.04 }, on2).elevation, 0) && j(SC6({ posture: 'sitting', elevation: 4 }, { posture: false, elevation: true })) === j({ posture: 0, elevation: 4 })
            && SC6({ posture: 'sitting' }, { posture: false, elevation: false }) === null && SC6(null, on2) === null && S.POSTURE_IDS.length === 7 && S.POSTURE_NAMES.length === 7);
        const tc = S.tokenCtx({ meta: { gridType: 'hex' } }, { rot: 60, posture: 'crouching', elevation: 2 }, { turning: true, posture: true, elevation: true });
        check('6 F2: tokenCtx gives facing and stance of one token (null with no token)', tc && tc.facing.deg === 60 && tc.stance.posture === 1 && tc.stance.elevation === 2 && S.tokenCtx({}, null, on2) === null && S.tokenCtx({}, { rot: 0 }, { turning: false, posture: false, elevation: false }).facing === null, j(tc));
        const pS = cleanSystem({ v: 1, name: 'P', fields: [{ id: 'f_atk', key: 'PostureAtk', kind: 'formula', formula: 'if(Posture = 0, 0, if(Posture <= 3, -2, -4))', vis: 'all' }, { id: 'f_h', key: 'High', kind: 'formula', formula: 'Elevation * 2 + Posture', vis: 'all' }], rolls: [] }, { F, gmView: true });
        const pN = resolveAll(pS, { id: 'c_1', values: {} }, F), pK = resolveAll(pS, { id: 'c_1', values: {} }, F, { stance: { posture: 5, elevation: 3 } }), pC = resolveAll(pS, { id: 'c_1', values: {} }, F, { facing: null, stance: { posture: 1, elevation: 0 } });
        check('6 F2: Posture and Elevation in formulas — neutral (0) with no token context, the token\'s values with one', pN.f_atk.value === 0 && pN.f_h.value === 0 && pK.f_atk.value === -4 && pK.f_h.value === 11 && pC.f_atk.value === -2, j([pN.f_h, pK.f_atk, pK.f_h, pC.f_atk]));
        const pShadow = cleanSystem({ v: 1, name: 'P', fields: [{ id: 'f_p', key: 'Posture', kind: 'number', def: 9, vis: 'all' }, { id: 'f_x', key: 'X', kind: 'formula', formula: 'Posture + Elevation', vis: 'all' }], rolls: [] }, { F, gmView: true });
        check('6 F2: validateSystem knows Posture and Elevation; a field named Posture keeps the name (and reads as the field)', validateSystem(pS, F).ok && resolveAll(pShadow, { id: 'c_1', values: {} }, F, { stance: { posture: 3, elevation: 1 } }).f_x.value === 10 && validateSystem(pShadow, F).ok);
        // review fixes: one reading of a posture everywhere (the chip's normalizePosture, sliced from whiteboard.js); a text elevation
        const wbSrcP = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n');
        const npSrc = wbSrcP.slice(wbSrcP.indexOf('function normalizePosture('), wbSrcP.indexOf('function tokenElevation('));
        const normP = new Function(npSrc + '\nreturn normalizePosture;')();
        const spell = ['standing', 'crouching', 'sitting', 'kneeling', 'crawling', 'lying-prone', 'lying-face-up', 'Lying prone', 'Lying Face Up', 'lying_prone', 'face down', 'crouch', 'prone', 'supine', 'on their back', 'Kneel', '', 'flying', 'Stand'];
        const mism = spell.filter(x => SC6({ posture: x }, on2).posture !== S.POSTURE_IDS.indexOf(normP(x)));
        check('6 F2 review: a posture reads the same on the sheet as on the map chip (every spelling the chip accepts: long names, underscores, face down, crouch, the 1.4.6 ids)', npSrc.length > 100 && mism.length === 0, j(mism));
        check('6 F2 review: an elevation authored as text ("3") reads as the chip shows it; anything else not a number reads 0', SC6({ elevation: '3' }, on2).elevation === 3 && SC6({ elevation: ' -2.5 ' }, on2).elevation === -2.5 && SC6({ elevation: '3yd' }, on2).elevation === 0 && SC6({ elevation: { valueOf() { throw new Error('x'); } } }, on2).elevation === 0);
        // the host's patch gate for stance, with the real cleaners (sliced from net.js): own token only, each feature on
        const netSrc2 = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
        const cleanersSrc = netSrc2.slice(netSrc2.indexOf('var POSTURE_SET = '), netSrc2.indexOf('function sanitizeItem('));
        const cln = new Function(cleanersSrc + '\nreturn { cleanElevation: cleanElevation, cleanPosture: cleanPosture };')();
        const iPS = netSrc2.indexOf('// [netcheck:patch-start]'), kPS = netSrc2.indexOf('// [netcheck:patch-end]');
        const runPS = (feat, wb) => { const camp = { id: 'camp1', items: { m1: { type: 'map', whiteboard: [{ id: 't1', isChar: true, charId: 'c_1', ownerId: 'u_p', x: 10, y: 10, rot: 0, front: 0 }, { id: 't2', isChar: true, charId: 'c_2', ownerId: 'u_q', x: 50, y: 50, rot: 0, front: 0 }] } } };
            const ch = new Function('state', 'window', 'playerStroke', 'cleanElevation', 'cleanPosture', 'msg', 'prof', ownLines(netSrc2) + netSrc2.slice(iPS, kPS) + '\nreturn applyClientItemFiltered(msg, prof);')({ appState: { campaigns: { camp1: camp } } }, { wpVtt: { campaignOn: k => !!feat[k] }, wpSystemCore: S }, () => null, cln.cleanElevation, cln.cleanPosture, { campId: 'camp1', itemId: 'm1', item: { whiteboard: wb } }, { id: 'u_p' });
            return { ch, t1: camp.items.m1.whiteboard[0], t2: camp.items.m1.whiteboard[1] }; };
        const wbStance = [{ id: 't1', x: 10, y: 10, rot: 0, front: 0, posture: 'lying-prone', elevation: 3 }, { id: 't2', x: 50, y: 50, rot: 0, front: 0, posture: 'sitting', elevation: 9 }];
        const psOn = runPS({ posture: true, elevation: true }, wbStance), psOff = runPS({ posture: false, elevation: false }, wbStance);
        check('6 F2 review: the host takes a player\'s posture and elevation from their patch on their own token only, and only while each feature is on (the real gate and cleaners)',
            psOn.ch === true && psOn.t1.posture === 'lying-prone' && psOn.t1.elevation === 3 && !('posture' in psOn.t2) && !('elevation' in psOn.t2) && psOff.ch === false && !('posture' in psOff.t1) && !('elevation' in psOff.t1), j([psOn, psOff]));
        const shR = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), fogR = fs.readFileSync(path.join(app, 'scripts', 'fog.js'), 'utf8');
        check('6 F2 review: the sheet, the host\'s roll and fog sight read the token names through the same table-level gate (rulesOn), and fog sight passes the token context',
            /function tokenFlags\(\) \{ return \{ turning: ruleOn\('turning'\), posture: ruleOn\('posture'\), elevation: ruleOn\('elevation'\) \}; \}/.test(shR) && /vt\.rulesOn \? vt\.rulesOn\(k\) : vt\.on\(k\)/.test(fogR) && /S0\.makeResolver\(camp\.system, ch, window\.wpFormula, tc\)/.test(fogR)
            && /if \(d\.dataset\.sig === stanceSigOf\(c, camp\)\) return;/.test(shR) && /\[em, ep\]\.forEach\(function\(b\) \{ b\.addEventListener\('mousedown'/.test(shR) && /committed = inStance && /.test(shR));
        const lay = cleanSystem({ v: 1, name: 'L', fields: [], rolls: [], sheet: { sections: [{ id: 's_1', title: 'D', fields: [{ kind: 'stance', w: 1 }] }] } }, { F, gmView: false });
        check('6 F2: a Stance placement is kept (the players\' view too)', lay.sheet.sections[0].fields.length === 1 && lay.sheet.sections[0].fields[0].kind === 'stance', j(lay.sheet));
        const sh2 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), stSrc = sh2.slice(sh2.indexOf('function stanceNode('), sh2.indexOf('// whiteboard.js / net.js / main.js: a token turned'));
        const wb2 = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8');
        check('6 F2 UI: the stance control draws text only, is live only on the real sheet for the GM or the token\'s own unpaused player (never on a token the GM locked), sets the token through the whiteboard setter (each part only while its feature is on), and redraws in place like the dial',
            stSrc.length > 800 && !/innerHTML/.test(stSrc) && /var n = net\(\), live = _fxLive && \(gm \|\| \(t\.tok\.ownerId === myId\(\) && !t\.tok\.locked && !\(n && \(n\.paused \|\| n\.selfPaused\)\)\)\);/.test(stSrc) && /wpSetTokenStance/.test(stSrc)
            && /if \(typeof st\.posture === 'string' && stanceOn\('posture'\)\)/.test(wb2) && /if \(st\.elevation !== undefined && stanceOn\('elevation'\) && isFinite\(Number\(st\.elevation\)\)\)/.test(wb2) && /var t = tokenOnMap\(mapId, tokId, null\);/.test(wb2)
            && /querySelectorAll\('\.sheet-dial, \.sheet-stance'\)/.test(sh2));
    }

    /* ---- the System editor's click dispatch: the Layout handler must claim only its own buttons ---- */
    {
        const shSrcD = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8');
        const olc = shSrcD.slice(shSrcD.indexOf('function onLayoutClick(b)'), shSrcD.indexOf('function wireLayoutDrag'));
        check('editor: onLayoutClick claims a tab-manager button only from its own row (.sys-row.sys-tab), never from the pane (every pane is a .sys-tab), so Fields/Rolls/Items/Characters buttons reach their handlers', olc.length > 100 && /b\.closest\('\.sys-row\.sys-tab'\)/.test(olc) && !/b\.closest\('\.sys-tab'\)/.test(olc));
    }

    /* ---- publication ---- */
    global.window = {};
    const S2 = await import(url('systemcore.js') + '?x');
    check('window.wpSystemCore published', !!(global.window.wpSystemCore && global.window.wpSystemCore.cleanSystem && global.window.wpSystemCore.VERSION === S2.VERSION));
    delete global.window;

    /* ---- the sheet's own look (doc theming): bounded plain values, players' view included; docrender validates strictly at render ---- */
    {
        const withLook = cleanSystem({ v: 1, name: 'L', fields: [], rolls: [], sheetStyle: { font: 'mono', textColor: '#fff', bgColor: '#102030', bgImage: '/saves/images/m/a b.png', bgDim: 140, evil: '<script>', onclick: 'x' } }, { F, gmView: true });
        check('cleanSystem: sheetStyle keeps the look fields, clamps bgDim, drops anything else', withLook && withLook.sheetStyle && withLook.sheetStyle.font === 'mono' && withLook.sheetStyle.textColor === '#fff' && withLook.sheetStyle.bgColor === '#102030' && withLook.sheetStyle.bgImage === '/saves/images/m/a b.png' && withLook.sheetStyle.bgDim === 90 && !('evil' in withLook.sheetStyle) && !('onclick' in withLook.sheetStyle), JSON.stringify(withLook && withLook.sheetStyle));
        const playerLook = cleanSystem({ v: 1, name: 'L', fields: [], rolls: [], sheetStyle: { font: 'serif', bgDim: 20 } }, { F, gmView: false });
        check('cleanSystem: the sheet look travels in the players\' view too', playerLook && playerLook.sheetStyle && playerLook.sheetStyle.font === 'serif' && playerLook.sheetStyle.bgDim === 20);
        const noLook = cleanSystem({ v: 1, name: 'L', fields: [], rolls: [], sheetStyle: 'red' }, { F, gmView: true }), longLook = cleanSystem({ v: 1, name: 'L', fields: [], rolls: [], sheetStyle: { font: 'x'.repeat(401), bgColor: 'a\u0001b' } }, { F, gmView: true });
        check('cleanSystem: a non-object, over-long or control-character look is absent', noLook && !('sheetStyle' in noLook) && longLook && !('sheetStyle' in longLook));
        // The sheet builder's picture picker (the library at z 99999) opens from a modal at z 100000: the library must lift over it and settle back
        const wbSrc = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8');
        check('image library: a pick lifts the library above the caller and every close path settles it back', /window\.wpPickImage = async function[\s\S]{0,600}?imgLibLift\(true\)/.test(wbSrc) && (wbSrc.match(/imgLibLift\(false\)/g) || []).length >= 3 && /m\.style\.zIndex = '100005'/.test(wbSrc));
    }
    console.log(NL + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
