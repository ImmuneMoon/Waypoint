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
        check('Stage 5g: the item list resolves its definitions from the system being drawn (the pop-out\'s cleaned copy, the preview\'s draft), not the raw campaign', /function fieldNodeBody\(f, c, e, gm, own, sysArg\)/.test(sh5) && /var sysI = sysArg \|\| systemOf\(getActiveCampaign\(\)\)/.test(sh5) && (sh5.match(/fieldNode\([^)]*, gm, own, sys(, all\.vars)?\)/g) || []).length === 2);
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
        check('Fold B review: a control that disabled itself (↻ once full) hands keyboard focus to its field\'s own box; sections pass the resolver to captions, the band does not', /if \(q && q\.disabled && k\.part\) q = root\.querySelector\('\[data-fid="' \+ k\.fid \+ '"\]:not\(\[data-part\]\)'/.test(shR) && /fieldNode\(byId\[pl\.id\], c, all\[pl\.id\], gm, own, sys, all\.vars\)/.test(shR) && /fieldNode\(byId\[q\.id\], c, all\[q\.id\], gm, own, sys\)/.test(shR));
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
        const plG = cleanSystem(gmMax, { F, gmView: false }), rG = S.makeResolver(plG, { id: 'c_1', values: { f_hp: { cur: 7 } } }, F)('HP.max'), edG = S.applyEdit(plG, { id: 'c_1', values: { f_hp: { cur: 7 } } }, 'f_hp', { cur: 12 }, F, { player: true });
        check('5h F1: a max the players\' view blanked (it names a GM-only field) reads "GM only", and a player\'s edit is not clamped to 0 (the host clamps it against the real max)', rG && rG.error && /GM only/.test(rG.error.message) && edG.ok && edG.value.cur === 12, j([rG, edG]));
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

    /* ---- Stage 6 look fold (L1): the sheet palette ---- */
    {
        const crypto = require('crypto'), H = o => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex');
        const tutSrc = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8');
        const fnSrc = name => { const i = tutSrc.indexOf('function ' + name + '('); let d = 0; const k = tutSrc.indexOf('{', i); for (let p = k; p < tutSrc.length; p++) { if (tutSrc[p] === '{') d++; else if (tutSrc[p] === '}') { d--; if (d === 0) return tutSrc.slice(i, p + 1); } } return ''; };
        const tutorialSystem = new Function(fnSrc('tutorialEffects') + '\n' + fnSrc('tutorialSystem') + '\nreturn tutorialSystem;')();
        const preset = n => JSON.parse(fs.readFileSync(path.join(app, 'assets', 'systems', n + '.json'), 'utf8'));
        // the pre-fold hashes (taken at 516b22b, before any look-fold key existed): a system without the new keys cleans exactly as before
        const PRE = {
            d20: ['96c44fc592448813542d72f24129e788304634fcdab1649e3942daa6ae42b894', 'c8733a11848517e9b02ffaf86072506ef224cccbbb4eca17d6403b6d3c1de269', '32be92883bbdfd0fb9975e29bf00f9632b296a13d1fdab3c0e801458f9f97cc8'],
            '3d6': ['0292986b3be8f1c8b5d38c000e66b7a15cc9569b1a318a96d9a1bb395dd2e756', 'a7733f1f3820bbcfc1fdacb52e767e78df634d323e2cca503254d8977c7e29f8', '37fe78c2036ca85291471ddac6f04a816257e02bc78763df705390136a92c992'],
            // re-taken after the L3 seed change (the tour's identity is Class alone, edited in the header; the abilities stay tiles) — a deliberate change, not drift
            tutorial: ['1414bb05d14493d5d6640167f65b8c897e232130d9bf5dfe4fd26c97e20109f3', '82a86b0edd99106481b447f3e4a6caa2808ca74966cc06de1c720df457b4a148', 'ca140918d060af6f2949d30e7ba68e3b559fa4142b5101ee8ab04f34b7306e41']
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
            && /function renderAll\(\) \{\s*\n\s*closeGlyphPicker\(\);/.test(shG2) && (shG2.match(/iconText\((d2|it)\.icon\)/g) || []).length === 4 && /Object\.prototype\.hasOwnProperty\.call\(ROLL_TONE_CLS, r\.tone\) \? ROLL_TONE_CLS\[r\.tone\] : ''/.test(shG2)
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
