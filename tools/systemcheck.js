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
        const fullSecs = []; for (let s = 0; s < 11; s++) fullSecs.push({ id: 's_full' + s, title: 'S' + s, cols: 1, fields: Array.from({ length: 20 }, () => ({ kind: 'divider', w: 'row' })) });   // 220 placements offered, LIMITS.placements kept
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
        check('Stage 5c: buildSections renders the band from sys.sheet before the tab strip and tags its inputs with data-band', /body\.textContent = '';[\s\S]{0,1900}?sys\.sheet\.band[\s\S]{0,900}?'sheet-band'[\s\S]{0,900}?dataset\.band = '1'[\s\S]{0,600}?if \(tabs\) \{/.test(shSrc) && /k\.band \? '\[data-band\]' : ':not\(\[data-band\]\)'/.test(shSrc));
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
            /if \(ledger && f\.kind === 'number' && !en\.error && !c\.partial && \(gm \|\| \(own && f\.edit === 'owner' && f\.vis === 'all'\)\)\)[\s\S]{0,900}?inp\.addEventListener\('change', function\(\) \{ commit\(c, f, Number\(inp\.value\)\); \}\);/.test(hb5)
            && /inp\.dataset\.part = 'hdr';/.test(hb5) && /im\.src = imgSrc\(c\.portrait\);/.test(hb5) && !/innerHTML/.test(hb5) && /block\(sh\.identity, 'sheet-identity', 'sheet-identity-item', false\);/.test(hb5));
        check('Stage 5g: the head and the frame take the sheet look\'s colours through --sheet-ink/--sheet-bg, removed again when the look has none; the accent is a variable set only when the look has one',
            /pair = !!\(style && HEXC\.test\(style\.textColor \|\| ''\) && HEXC\.test\(style\.bgColor \|\| ''\)\);\s*if \(pair\) \{ node\.style\.setProperty\('--sheet-ink', style\.textColor\); node\.style\.setProperty\('--sheet-bg', style\.bgColor\);[\s\S]{0,200}?else \{ node\.style\.removeProperty\('--sheet-ink'\); node\.style\.removeProperty\('--sheet-bg'\); node\.style\.removeProperty\('--sheet-dim'\); \}/.test(sh5)
            && /if \(typeof look\.accent === 'string' && \/\^#\[0-9a-fA-F\]\{6\}\$\/\.test\(look\.accent\)\) \{ body\.style\.setProperty\('--sheet-accent', look\.accent\);[\s\S]{0,300}?else \{ body\.style\.removeProperty\('--sheet-accent'\); body\.style\.removeProperty\('--sheet-accent-ink'\); \}/.test(sh5)
            && /\.sheet-frame \.sheet-tab:not\(\.active\) \{ color: var\(--sheet-dim, var\(--dim\)\); \}/.test(css5) && /\.sheet-frame \.sheet-value:not\(\.sheet-pos\):not\(\.sheet-neg\):not\(\.sheet-err\), \.sheet-frame \.sheet-tab:not\(\.active\):hover \{ color: var\(--sheet-ink, var\(--ink\)\); \}/.test(css5)
            && /\.sheet-head, \.sheet-frame \{ margin: 0 -10px; background: var\(--sheet-bg, var\(--panel2\)\); color: var\(--sheet-ink, var\(--ink\)\);/.test(css5) && /\.sheet-tab\.active \{ color: var\(--sheet-accent, var\(--gold\)\);/.test(css5));
        check('Stage 5g: the pop-out cleans the raw save (system and character) before rendering, so its sinks see validated values like the panel\'s', /var sys = cleanSystem\(raw, \{ F: F\(\), gmView: true \}\), c = sys \? cleanChar\(c0, sys\) : null;\s*if \(!sys \|\| !c\) return null;\s*buildSections\(container, sys, c,/.test(sh5) && /import \{[^}]*\bcleanChar\b[^}]*\} from '\.\/systemcore\.js';/.test(sh5));
        const aInk = (() => { const src = sh5.slice(sh5.indexOf('function accentInk('), sh5.indexOf('function buildSections(')); return new Function(src + '; return accentInk;')(); })();
        check('Stage 5g: the open filled tab\'s label picks near-black on a light accent and white on a dark one', aInk('#e0a54f') === '#111318' && aInk('#4db3d3') === '#111318' && aInk('#7a1f1f') === '#ffffff' && aInk('#101010') === '#ffffff', [aInk('#e0a54f'), aInk('#7a1f1f')].join());
        check('Stage 5g: inside the head and the frame, transparent buttons, slider ends, the GM marker, the open underlined tab and the name follow a look pair (the fallbacks are the old theme values); the filled open tab keeps its own ink; the ledger box shows focus',
            /\.sheet-head \.tool\.ghost, \.sheet-frame \.tool\.ghost, \.sheet-head \.tool\.ghost:hover, \.sheet-frame \.tool\.ghost:hover \{ color: var\(--sheet-ink, var\(--ink\)\); \}/.test(css5) && /\.sheet-frame \.sheet-slider-ends \{ color: var\(--sheet-dim, var\(--dim\)\); \}/.test(css5)
            && /\.sheet-frame \.sheet-tabs:not\(\.sheet-tabs-filled\) > \.sheet-tab\.active \{ color: var\(--sheet-accent, var\(--sheet-ink, var\(--gold\)\)\);/.test(css5) && /\.sheet-head-name \{[^}]*color: var\(--sheet-accent, var\(--sheet-ink, var\(--gold\)\)\);/.test(css5)
            && /\.sheet-hdr-val\.sheet-hdr-edit:focus-within \{ border-color:/.test(css5) && /\.sheet-tabs-filled \.sheet-tab\.active \{ background: var\(--sheet-accent, var\(--gold\)\); color: var\(--sheet-accent-ink, #111318\); \}/.test(css5));
        check('Stage 5g: the item list resolves its definitions from the system being drawn (the pop-out\'s cleaned copy, the preview\'s draft), not the raw campaign', /function fieldNode\(f, c, e, gm, own, sysArg\)/.test(sh5) && /var sysI = sysArg \|\| systemOf\(getActiveCampaign\(\)\)/.test(sh5) && (sh5.match(/fieldNode\([^)]*, gm, own, sys\)/g) || []).length === 2);
        check('Stage 5g: a section is boxed only for a panel, a border or a stripe (an accent with no stripe colours the title alone); headline titles and filled tabs are class-gated',
            /var stripe = !!\(sec\.style && sec\.style\.accent && sec\.style\.stripe !== false\);[\s\S]{0,200}?if \(sec\.style && \(sec\.style\.bg \|\| sec\.style\.border \|\| stripe\)\)/.test(sh5) && /if \(stripe\) s\.style\.borderLeft/.test(sh5)
            && /body\.classList\.toggle\('sheet-titles-headline', look\.titles === 'headline'\);/.test(sh5) && /el\('div', 'sheet-tabs' \+ \(look\.tabs === 'filled' \? ' sheet-tabs-filled' : ''\)\)/.test(sh5)
            && /\.sheet-titles-headline \.sheet-sec-title \{/.test(css5) && /\.sheet-tabs-filled \.sheet-tab\.active \{/.test(css5));
        check('Stage 5g: "Start from the automatic layout" and "Remove your layout" keep the sheet\'s shape (it lives in the Sheet look box); the tab icon edit finds its own row (.sys-row.sys-tab)',
            /var keepLook = [\s\S]{0,200}?draft\.sheet = \{ sections: autoLayout\(cl \|\| draft\)\.sections \}; if \(keepLook\) draft\.sheet\.look = keepLook;/.test(sh5)
            && /var keepShape = draft\.sheet && draft\.sheet\.look; draft\.sheet = \{ sections: \[\] \}; if \(keepShape\) draft\.sheet\.look = keepShape;/.test(sh5)
            && /if \(c\.indexOf\('sys-tab-icon'\) >= 0\) \{ var itr = t\.closest && t\.closest\('\.sys-row\.sys-tab'\);/.test(sh5));
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
