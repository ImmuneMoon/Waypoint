'use strict';
/* corecheck.js: the core's first tests, which came out of systemcheck.js with their area (docs/REFACTOR_SPLIT_PLAN.md, area 5, "Tests move
   with their area", 2026-11-18). The core's cleaners live in system/app/scripts/cleancore.js and its validator in validcore.js, both parts
   of systemcore.js; this suite imports each part by its own name, from a private copy of systemcore.js and its parts (tools/checkkit.js
   fresh), so each runs as the module it is with the real split wiring, and runs their functions through systemcore.js, which installs
   them and is the only way to reach them.
   What it covers, each block as it stood at the head of systemcheck.js (its first 1,120 lines, moved whole): the two presets cleaned
   and validated, keys, fields, systems, the validator (carets, loops, dice in definitions), the resolver, values and edits (with the
   wire's 64-bit bound, a character's Template tick and a sheet shared or copied, backlog 237), what a player receives, the layout and
   the bridge, cover and its follow-ups, the System editor on a large system, a place on a list in one view and another, Shares an end,
   Target.<key>, rolls from the sheet (SB3), the sheet's look of Stages 3 to 5g, the character-sync fixes and status effects of Stage
   5h, value names and the bigger caps (Stage 6 fold 0/1), facing (Stage 5h fold 3) and carried rows (Stage 6 F4a). Not all of them are
   the cleaners' and the validator's: they are the core's oldest tests, kept together as they stood, and a block goes to the suite of
   its own area when that area is cut. Slices of sheets.js, net.js and main.js still read the joined roots through srcjoin.
   Usage: node tools/corecheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const app = kit.APP, url = kit.url;
const T = kit.suite('system'), check = T.check;
const j = v => JSON.stringify(v);
// what the moved blocks take from systemcheck.js's top, now in the kit
const { ownLines } = kit;

(async () => {
    // The area's parts are imported by their own names from a private copy of systemcore.js and its parts (kit.fresh), so each runs as
    // the module it is, with the real split wiring, entered from the part as parsecheck enters it; their functions are then run through
    // systemcore.js, which installs the parts and is the only way to reach them
    const real = kit.fresh('systemcore.js', 'corecheck');
    let P1 = null, P2 = null, S = null, F = null, err = null;
    try { P1 = await import(real('cleancore.js')); P2 = await import(real('validcore.js')); S = await import(real('systemcore.js')); F = await import(url('formula.js')); } catch (e) { err = e; }
    check('corecheck: cleancore.js and validcore.js load by name as modules of their own in Node with no window, each with the install systemcore.js calls, and systemcore.js installs them (cleanSystem and validateSystem reached through it)', !!P1 && typeof P1.cleanCore === 'function' && !!P2 && typeof P2.validCore === 'function' && !!S && typeof S.cleanSystem === 'function' && typeof S.validateSystem === 'function' && !!F && !err, err && err.message);
    check('corecheck: the cleaners and the validator are read by name: cleancore.js holds cleanSystem and validcore.js holds validateSystem and the namewords slice', kit.part('cleancore.js').includes('\nfunction cleanSystem(') && kit.part('validcore.js').includes('\nfunction validateSystem(') && kit.part('validcore.js').includes('// [formcheck:namewords-start]'));
    if (!S || !F) { await T.finish(); return; }
    const { LIMITS, validKey, cleanField, cleanSystem, cleanValue, cleanChar, cleanCharEdit, makeResolver, resolveAll, hoverLines, validateSystem, charFor, applyEdit, autoLayout, emptySystem } = S;   // the names systemcheck.js unpacks, which its blocks read
    const { d20, g3d6 } = kit.presets();   // the d20 system and the frozen 3d6 starter (tools/checkkit.js)

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
    check('cleanField: text max capped at 200, roll kept when valid', fld({ kind: 'text', max: 9999, def: 'hi' + String.fromCharCode(0) }).max === 200 && fld({ kind: 'text' }).def === '' && fld({ roll: 'd20 + A' }).roll === 'd20 + A' && fld({ roll: 'x'.repeat(10001) }).roll === undefined);

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
    check('cleanSystem: not an object / no engine -> null; caps hold', cleanSystem('x', { F }) === null && cleanSystem({}, {}) === null && cleanSystem({ fields: new Array(LIMITS.fields + 5).fill(0).map((_, i) => ({ id: 'f_' + i, key: 'K' + i, kind: 'number' })) }, { F }).fields.length === LIMITS.fields);

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
    {   // the wire's packer refuses a whole number past 64 bits: stored numbers stay within +/-1e15
        const bs = cleanSystem({ v: 1, name: 'B', fields: [{ id: 'f_g', key: 'Gold', kind: 'number', def: 0, vis: 'all', max: 1e20 }, { id: 'f_t', key: 'T', kind: 'number', def: 0, vis: 'all', step: 1e-300 }, { id: 'f_r', key: 'R', kind: 'resource', maxFormula: '10', vis: 'all' }], rolls: [] }, { F, gmView: true });
        const bg = bs.fields.find(f => f.id === 'f_g'), bt = bs.fields.find(f => f.id === 'f_t'), br = bs.fields.find(f => f.id === 'f_r');
        check('numbers: a value, a bound or a resource past +/-1e15 is refused (the packer would refuse it and every join after it); a tiny step never rounds past the bound; ordinary numbers pass',
            !('max' in bg) && cleanValue(bg, 1e20) === undefined && cleanValue(cleanSystem({ v: 1, name: 'M', fields: [{ id: 'f_m', key: 'M', kind: 'number', def: 1, vis: 'all', min: 1, max: 1e15, step: 2 }], rolls: [] }, { F, gmView: true }).fields[0], 1e15) === 1e15 && cleanValue(bg, '99999999999999999999') === undefined && cleanValue(bg, 123456) === 123456 && cleanValue(bt, 1e14) !== Infinity && cleanValue(br, { cur: 1e20 }) === undefined && cleanValue(br, { cur: 7 }).cur === 7,
            JSON.stringify([bg, cleanValue(bg, 1e20), cleanValue(bt, 1e14)]));
    }
    const fld_str = sys.fields.find(f => f.id === 'f_str'), fld_hp = sys.fields.find(f => f.id === 'f_hp'), fld_notes = sys.fields.find(f => f.id === 'f_notes'), fld_align = sys.fields.find(f => f.id === 'f_align');
    {   // 1.6.4 (found 2026-11-22, the save rewrite check): a number snapped to its step keeps no float noise, rounded to the decimals its step and its base are written with
        const fs1 = { kind: 'number', min: 0, step: 0.01 }, fs2 = { kind: 'number', min: 0.5, step: 0.1 }, fs3 = { kind: 'number', step: 0.25 }, fs4 = { kind: 'number', min: 0, step: 1e-7 };
        check('a stepped number holds its figure exactly: 1.49 on a step of 0.01, 0.7 from a base of 0.5 on 0.1, 1.25 on a quarter, a whole number on a whole step, and a step written in e-notation keeps the old sum',
            cleanValue(fs1, 1.49) === 1.49 && cleanValue(fs1, 0.29) === 0.29 && cleanValue(fs2, 0.71) === 0.7 && cleanValue(fs3, 1.3) === 1.25 && cleanValue(fld_str, 12.4) === 12 && cleanValue(fs4, 3e-7) === 0 + Math.round(3e-7 / 1e-7) * 1e-7,
            JSON.stringify([cleanValue(fs1, 1.49), cleanValue(fs1, 0.29), cleanValue(fs2, 0.71), cleanValue(fs3, 1.3), cleanValue(fs4, 3e-7)]));
    }
    check('cleanValue: number clamps and steps; toggle strict; text strips control chars; notes keep newlines; select strict; resource {cur}', cleanValue(fld_str, 99) === 30 && cleanValue(fld_str, 12.4) === 12 && cleanValue(fld_str, 'x') === undefined && cleanValue(sys.fields.find(f => f.id === 'f_prone'), 1) === undefined && cleanValue(sys.fields.find(f => f.id === 'f_class'), 'a' + String.fromCharCode(1) + 'b') === 'ab' && cleanValue(fld_notes, 'a' + NL + 'b' + String.fromCharCode(1)) === 'a' + NL + 'b' && cleanValue(fld_align, 'Nope') === undefined && j(cleanValue(fld_hp, { cur: 99 }, { max: 16 })) === j({ cur: 16 }) && j(cleanValue(fld_hp, -5, { max: 16 })) === j({ cur: 0 }));
    check('applyEdit: a player may edit owner fields within range; not GM-edit, formula, GM-only or missing fields; resource capped by the evaluated max', (() => { const sysE = cleanSystem({ fields: sys.fields.concat([{ id: 'f_locked', key: 'Locked', kind: 'number', edit: 'gm' }]) }, { F, gmView: true }); const ok = applyEdit(sysE, ch, 'f_str', 20, F, { player: true }); const hp = applyEdit(sysE, ch, 'f_hp', { cur: 50 }, F, { player: true }); const lock = applyEdit(sysE, ch, 'f_locked', 1, F, { player: true }); const gmOk = applyEdit(sysE, ch, 'f_locked', 1, F, {}); const fm = applyEdit(sysE, ch, 'f_strmod', 1, F, {}); const sec = applyEdit(sysE, ch, 'f_secret', 1, F, { player: true }); const miss = applyEdit(sysE, ch, 'f_zzz', 1, F, {}); return ok.ok && ok.value === 20 && hp.ok && hp.value.cur === 16 && lock.reason === 'field' && gmOk.ok && fm.reason === 'field' && sec.reason === 'field' && miss.reason === 'field'; })());
    check('cleanChar: bad id null; npc forces no owner; values coerced, unknown ids dropped; portrait rule', (() => { const c = cleanChar({ id: 'c_x', name: 'N'.repeat(100), ownerId: 'u_1', npc: true, portrait: '/saves/images/m/a.png', values: { f_str: '40', f_zzz: 1, f_class: 5, f_prone: true } }, sys); const p = cleanChar({ id: 'c_y', portrait: '/saves/images/../x.png', values: {} }, sys); return cleanChar({ id: 'x' }, sys) === null && c.name.length === 60 && c.ownerId === '' && c.npc && c.portrait === '/saves/images/m/a.png' && c.values.f_str === 30 && !('f_zzz' in c.values) && !('f_class' in c.values) && c.values.f_prone === true && p.portrait === ''; })());
    check('F1c a character\'s own face: cleanChar keeps it (the face rule: an emoji, the default or a bundled picture\'s name) only while it has no portrait, never \'photo\'; charFor carries it to every player (it is on its tokens anyway)', (() => {
        const f1 = cleanChar({ id: 'c_f', name: 'F', face: '\u{1F409}', values: {} }, sys), f2 = cleanChar({ id: 'c_f', face: '\u{1F409}', portrait: '/saves/images/a.png', values: {} }, sys), f3 = cleanChar({ id: 'c_f', face: '<b>x</b>', values: {} }, sys), f4 = cleanChar({ id: 'c_f', face: 'photo', values: {} }, sys), f5 = cleanChar({ id: 'c_f', face: 'pic:../x', values: {} }, sys), f6 = cleanChar({ id: 'c_f', values: {} }, sys), f7 = cleanChar({ id: 'c_f', face: 'default', values: {} }, sys);
        const cf = charFor(Object.assign({}, ch, { face: '\u{1F409}' }), sys, 'u_sam'), cf2 = charFor(ch, sys, 'u_pat'), cf3 = charFor(Object.assign({}, ch, { face: '\u{1F409}', portrait: '/saves/images/a.png' }), sys, 'u_pat');
        return f1.face === '\u{1F409}' && !('face' in f2) && !('face' in f3) && !('face' in f4) && !('face' in f5) && !('face' in f6) && f7.face === 'default' && cf.face === '\u{1F409}' && !('face' in cf2) && !('face' in cf3) && S.cleanFace('\u{1F409}\u200D') === '' && S.cleanFace('\u{1F409}') === '\u{1F409}';
    })());
    check('cleanCharEdit: shapes', j(cleanCharEdit({ rid: 'q1', charId: 'c_1', fieldId: 'f_str', value: 5 })) === j({ rid: 'q1', charId: 'c_1', fieldId: 'f_str', value: 5 }) && cleanCharEdit({ rid: 'q1', charId: 'c_1', fieldId: 'f_str', value: 'x'.repeat(20001) }) === null && cleanCharEdit({ rid: 'q1', charId: 'bad', fieldId: 'f_str', value: 1 }) === null && cleanCharEdit({ rid: 'q1', charId: 'c_1', fieldId: 'f_str', value: [1] }) === null && cleanCharEdit({ rid: 'q1', charId: 'c_1', fieldId: 'f_hp', value: { cur: '7', junk: 1 } }).value.cur === 7);

    {   // 1.6.2 (backlog 227; the owner, by prompt: "a Template tick on a character"): the GM's Template tick, New from a template, the list's fold
        const tH = S.cleanChar({ id: 'c_t', name: 'Guard', ownerId: 'u_pat', template: true, values: {}, portrait: '/saves/images/m/g.png' }, sys, { state: 'host' });
        const tO = S.cleanChar({ id: 'c_t', name: 'Guard', ownerId: 'u_pat', template: true, values: {} }, sys, { state: 'owner' }), tN = S.cleanChar({ id: 'c_t', template: true, values: {} }, sys);
        const tP = S.cleanChar({ id: 'c_t', template: true, partial: true, values: {} }, sys, { state: 'host' }), tS = S.cleanChar({ id: 'c_t', template: 'yes', values: {} }, sys, { state: 'host' });
        check('cleanChar: a template is the GM\'s alone: kept as true where the host keeps state, and then with no owner, since no player plays it; never on an owner\'s copy, a plain clean or a teammate\'s copy, and for nothing but true',
            tH.template === true && tH.ownerId === '' && !('template' in tO) && tO.ownerId === 'u_pat' && !('template' in tN) && !('template' in tP) && !('template' in tS), j([tH, tO, tP]));
        const src = Object.assign({}, tH, { npc: true, unique: true, links: [{ key: 'x', to: 'c_o' }], stn: {}, debts: [{ with: 'c_o', v: 3 }], shareWith: ['u_x'], making: 1, review: 1, af: { f_a: 1 }, trader: { buy: 1 }, noLoot: ['r1'], cat: '-' });
        const fr = S.fromTemplate(src, 'c_new', sys), raw = S.fromTemplate(src, 'c_raw');
        check('fromTemplate: a fresh copy of a template under the id it is handed, with no owner and no Template tick; its values, picture, category and an NPC\'s marks come along; what ties it to other sheets or to play (links, stations, debts, shares, the making marks, a fill\'s marks, a trader\'s terms, loot rows) stays behind; cleaned as the host keeps one when the system is given; null for anything that is no template or an id that is no sheet\'s; the template itself untouched',
            !!fr && fr.id === 'c_new' && fr.ownerId === '' && !('template' in fr) && fr.name === 'Guard' && fr.portrait === tH.portrait && fr.npc === true && fr.unique === true && fr.cat === '-'
            && ['links', 'stn', 'debts', 'shareWith', 'making', 'review', 'af', 'trader', 'noLoot'].every(k => !(k in fr) && !(k in raw)) && raw.id === 'c_raw' && raw.ownerId === ''
            && S.fromTemplate(Object.assign({}, src, { template: false }), 'c_n', sys) === null && S.fromTemplate(src, 'bad id', sys) === null && S.fromTemplate(null, 'c_n', sys) === null && src.template === true && src.id === 'c_t', j([fr, raw]));
        {   // the review of backlog 227: a row's ties outside the sheet stay with the template, so one joined sheet is never held from two characters and no card is in two hands
            const sysT = { v: 1, name: 'T', fields: [{ id: 'f_veh', key: 'Veh', label: 'Vehicles', kind: 'item-list', list: { sheets: {}, custom: true } }, { id: 'f_hand', key: 'Hand', label: 'Hand', kind: 'item-list', list: { hand: {}, custom: true } }, { id: 'f_note', key: 'Note', label: 'Note', kind: 'text' }] };
            const cT = S.cleanSystem(sysT, { F, gmView: true }), tpl = S.cleanChar({ id: 'c_t2', name: 'Pilot', template: true, values: { f_veh: [{ id: 'w_v1', def: { name: 'Skiff' }, qty: 1, sh: 'c_ship' }, { id: 'w_v2', def: { name: 'Raft' }, qty: 1 }], f_hand: [{ id: 'w_c1', def: { name: 'Ace' }, qty: 1, cd: ['D1', 3] }, { id: 'w_c2', def: { name: 'Mine' }, qty: 1 }], f_note: 'hi' } }, cT, { state: 'host' });
            const was = j(tpl), cpS = S.fromTemplate(tpl, 'c_cp', cT), cpR = S.fromTemplate(tpl, 'c_cr'), rowsOf = (c, f) => (c && c.values && c.values[f] || []);
            check('fromTemplate (the review of backlog 227): a row joined to a sheet comes without its join, and a hand’s card row stays behind, with a system and without; every other row and value comes along; the template’s own rows unchanged',
                !!tpl && rowsOf(tpl, 'f_veh')[0].sh === 'c_ship' && j(rowsOf(tpl, 'f_hand')[0].cd) === j(['D1', 3])
                && !!cpS && rowsOf(cpS, 'f_veh').length === 2 && rowsOf(cpS, 'f_veh').every(r => !('sh' in r)) && j(rowsOf(cpS, 'f_hand').map(r => r.id)) === j(['w_c2']) && cpS.values.f_note === 'hi'
                && !!cpR && rowsOf(cpR, 'f_veh').every(r => !('sh' in r)) && rowsOf(cpR, 'f_veh').length === 2 && j(rowsOf(cpR, 'f_hand').map(r => r.id)) === j(['w_c2']) && j(tpl) === was, j([tpl, cpS, cpR]));
        }
        check('charFor: a template reaches no player: it has no owner, and the tick never rides on a copy even of one that somehow had one',
            S.charFor(tH, sys, 'u_pat') === null && S.charFor(tH, sys, '') === null && !('template' in (S.charFor(Object.assign({}, tH, { ownerId: 'u_pat' }), sys, 'u_pat') || {})));
        const clX = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'charlist.js'), 'utf8').replace(/\r\n/g, '\n');
        const CL = new Function(clX.slice(clX.indexOf('// [lookcheck:charlist-start]'), clX.indexOf('// [lookcheck:charlist-end]')) + '\nreturn { charRowsOf: charRowsOf, charMenuRows: charMenuRows };')();
        const chs = { c_a: { id: 'c_a', name: 'Ann', ownerId: 'u_1' }, c_t: { id: 'c_t', name: 'Guard', template: true, npc: true }, c_u: { id: 'c_u', name: 'Arch', template: true }, c_n: { id: 'c_n', name: 'Orc', npc: true } };
        const gm = CL.charRowsOf(chs, { u_1: 'Pat' }, ''), pl = CL.charRowsOf(chs, {}, 'u_1'), none = CL.charRowsOf({ c_a: chs.c_a }, {}, '');
        const mT = CL.charMenuRows(false, true, null, true, false, null, false, false, null, true).map(r => r.act || 'rule'), mF = CL.charMenuRows(false, true, null, true, false, null, false, false, null, false).map(r => r.act || 'rule'), mN = CL.charMenuRows(false, true, null, true, false, null, false, false, null, null).map(r => r.act || 'rule');
        check('the Characters list keeps templates apart (charlist charRowsOf, charMenuRows, run for real): the GM sees them under their own fold by name, never among Players or NPCs; a player never; a list with none is what it always was; the menu ticks Template, offers New from this template on one, and never Give to a player there',
            j(gm.templates.map(r => r.name)) === j(['Arch', 'Guard']) && j(gm.players.map(r => r.id)) === j(['c_a']) && j(gm.npcs.map(r => r.id)) === j(['c_n']) && !('templates' in pl) && j(pl.players.map(r => r.id)) === j(['c_a']) && !('templates' in none)
            && j(mT) === j(['sheet', 'rule', 'find', 'template', 'fromtpl', 'rule', 'delete']) && j(mF) === j(['sheet', 'rule', 'find', 'give', 'template', 'rule', 'delete']) && j(mN) === j(['sheet', 'rule', 'find', 'give', 'rule', 'delete']), j([gm, mT, mF]));
        const shT = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), tpl = shT.slice(shT.indexOf('// [systemcheck:template-start]'), shT.indexOf('// [systemcheck:template-end]'));
        check('the Template tick wired (sheets.js): the GM\'s alone where the campaign can be written, never while a character is being made; a character with a player is never made one; New from a template copies through fromTemplate under a new id and logs as template v1; giving a template to a player is refused',
            tpl.length > 500 && /function templateFits\(c, gm\) \{ return !!\(gm && c && !c\.partial && c\.making !== 1 && !isClient\(\)\) && canWrite\(\); \}/.test(tpl) && /if \(c\.template !== true && c\.ownerId\) \{ toast\(/.test(tpl)
            && /var c = SC\.fromTemplate\(t, uid\('c_'\), camp\.system\);/.test(tpl) && /window\.wpStepLog\('template v1', 'new'/.test(tpl) && shT.includes("if (c.template === true && pid) return false;   // 1.6.2 (backlog 227): no player plays a template")
            && shT.includes("if (typeof templateHead === 'function') templateHead(c, gm);"));
    }
    {   // 1.6.2 (backlog 237; the owner, 2026-11-14: "each time i assign a sheet, lets detect other characters using that sheet and ask if it should share stats or be a copy")
        const J = JSON.stringify;
        const guard = { id: 'c_g', name: 'Detention guard', npc: true, ownerId: '', unique: true, values: { f_hp: { cur: 9 }, f_gear: [{ id: 'w_a', def: { name: 'Baton' }, qty: 1 }, { id: 'w_b', def: { name: 'Skiff' }, qty: 1, sh: 'c_ship' }, { id: 'w_c', def: { name: 'Ace' }, qty: 1, cd: ['D1', 3] }] },
            links: { lk_m: 'c_o' }, stn: {}, debts: [{ with: 'c_o', v: 3 }], shareWith: ['u_x'], making: 1, review: 1, af: { f_a: 1 }, trader: { buy: 1 }, noLoot: ['w_a'], lk: {}, cat: '-', portrait: '/saves/images/m/g.png' };
        const was = J(guard), cp = S.sheetCopy(guard, 'c_cp', 'Ommish Daal'), pc = S.sheetCopy({ id: 'c_p', name: 'Vel', ownerId: 'u_pat', npc: false, values: { f_hp: 3 } }, 'c_pc', '');
        check('sheetCopy (backlog 237): a token\'s own copy under the id and name it is handed: the values, picture and category come along, and the Never-looted marks with the rows they name; '
            + 'what ties a sheet to other sheets or to play stays behind as New from a template leaves it (links, stations, debts, shares, the making marks, a fill\'s marks, a trader\'s terms, the host\'s figures), a row joined to a sheet comes without its join and a hand\'s card row stays behind; '
            + 'it is the GM\'s NPC, never Unique, and a copy of a player\'s character has no player; the sheet\'s own name where none is handed; null for a template, no sheet or an id that is no sheet\'s; the original untouched',
            !!cp && cp.id === 'c_cp' && cp.name === 'Ommish Daal' && cp.npc === true && !('ownerId' in cp) && !('unique' in cp) && cp.values.f_hp.cur === 9 && cp.portrait === guard.portrait && cp.cat === '-' && J(cp.noLoot) === J(['w_a'])
            && ['links', 'stn', 'debts', 'shareWith', 'making', 'review', 'af', 'trader', 'lk'].every(k => !(k in cp)) && J(cp.values.f_gear.map(r => [r.id, 'sh' in r])) === J([['w_a', false], ['w_b', false]])
            && !!pc && pc.npc === true && !('ownerId' in pc) && pc.name === 'Vel' && S.sheetCopy(Object.assign({}, guard, { template: true }), 'c_n', 'x') === null && S.sheetCopy(guard, 'bad id', 'x') === null && S.sheetCopy(null, 'c_n', 'x') === null
            && J(guard) === was && S.shareFirst({ npc: true }) === false && S.shareFirst({ npc: true, unique: true }) === true && S.shareFirst({ npc: false, ownerId: 'u_a' }) === true && S.shareFirst({ npc: false, ownerId: '' }) === false && S.shareFirst({ npc: false }) === false && S.splitsOf({ npc: false, ownerId: '' }) === true, J([cp, pc]));
        // a campaign as plain objects: the prison with seven guards on one sheet, Ommish Daal among them; a recurring NPC with one token on each of two maps; a player's character with a token on each map and a second on the prison; a Unique NPC twice; a sheet with no player twice; a template
        const mk = () => {
            const tk = (id, charId, extra) => Object.assign({ id, isChar: true, charId, name: 'Detention guard', x: 0, y: 0, w: 50, h: 50 }, extra || {});
            const prison = { id: 'm_p', type: 'map', whiteboard: [tk('g1', 'c_g'), tk('g2', 'c_g'), tk('g3', 'c_g', { name: 'Ommish Daal' }), tk('g4', 'c_g'), tk('g5', 'c_g'), tk('g6', 'c_g'), tk('g7', 'c_g'), tk('h1', 'c_h', { name: 'Hyval Osk' }), tk('p1', 'c_p', { name: 'Vel', ownerId: 'u_pat' }), tk('p2', 'c_p', { name: 'Vel' }), tk('u1', 'c_u', { name: 'Warden' }), tk('u2', 'c_u', { name: 'Warden' }), tk('n1', 'c_n', { name: 'Stray' }), tk('n2', 'c_n', { name: 'Stray' }), { id: 'r1', type: 'rect', charId: 'c_g' }, tk('w1', 'c_g', { waiting: true }), tk('x1', 'c_g', { isChar: false })] };
            const dock = { id: 'm_d', type: 'map', whiteboard: [tk('h2', 'c_h', { name: 'Hyval Osk' }), tk('p3', 'c_p', { name: 'Vel', ownerId: 'u_pat' }), tk('l1', 'c_l', { name: 'Lone' })] };
            return { id: 'k1', activeItemId: 'm_p', items: { m_p: prison, m_d: dock, pg: { id: 'pg', type: 'planner' } }, chars: { c_g: { id: 'c_g', name: 'Detention guard', npc: true, values: { f_hp: 9 } }, c_h: { id: 'c_h', name: 'Hyval Osk', npc: true, values: {} }, c_p: { id: 'c_p', name: 'Vel', npc: false, ownerId: 'u_pat', values: {} }, c_u: { id: 'c_u', name: 'Warden', npc: true, unique: true, values: {} }, c_n: { id: 'c_n', name: 'Stray', npc: false, ownerId: '', values: {} }, c_l: { id: 'c_l', name: 'Lone', npc: true, values: {} }, c_t: { id: 'c_t', name: 'Tpl', template: true, values: {} }, c_e: { id: 'c_e', name: 'Empty', npc: true, values: {} } } };
        };
        const cA = mk(), P = cA.items.m_p.whiteboard, ids = l => J(l.map(u => u.tok.id));
        check('sheetUsers: the character tokens on every map that name a sheet, but those handed to skip; never a piece that is no character or a player\'s waiting token',
            ids(S.sheetUsers(cA, 'c_g', [])) === J(['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7']) && ids(S.sheetUsers(cA, 'c_g', [P[0]])).indexOf('g1') < 0 && J(S.sheetUsers(cA, 'c_h', null).map(u => u.mapId)) === J(['m_p', 'm_d']) && S.sheetUsers(cA, '', null).length === 0 && S.sheetUsers(cA, 'c_none', null).length === 0, ids(S.sheetUsers(cA, 'c_g', [])));
        const sp = S.splitPlan(cA);
        check('splitPlan (the owner: "split them all individually"): on each map every character token after the first that shares a sheet there; the first keeps it; a character with one token on each of several maps, a player\'s character, a Unique NPC, a waiting token and a piece that is no character are left alone; a sheet with no player is split',
            J(sp.map(p => [p.mapId, p.tok.id, p.charId])) === J([['m_p', 'g2', 'c_g'], ['m_p', 'g3', 'c_g'], ['m_p', 'g4', 'c_g'], ['m_p', 'g5', 'c_g'], ['m_p', 'g6', 'c_g'], ['m_p', 'g7', 'c_g'], ['m_p', 'n2', 'c_n']])
            && S.splitsOf({ npc: true }) && !S.splitsOf({ npc: true, unique: true }) && !S.splitsOf({ npc: false, ownerId: 'u_a' }) && S.splitsOf({ npc: false, ownerId: '' }) && !S.splitsOf({ template: true }) && !S.splitsOf(null), J(sp.map(p => p.tok.id)));
        const byId = id => P.concat(cA.items.m_d.whiteboard).filter(w => w.id === id)[0], op = picks => J(S.ownSheetPlan(cA, picks.map(byId)).map(p => p.tok.id));
        check('ownSheetPlan (Give this token its own sheet): a picked token whose sheet another token uses; where all of a sheet\'s tokens are picked, the first picked keeps it; a character on several maps may be given its own here; a token alone on its sheet, a template\'s, a waiting one or a piece that is no character never',
            op(['g4']) === J(['g4']) && op(['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7']) === J(['g2', 'g3', 'g4', 'g5', 'g6', 'g7']) && op(['g7', 'g7']) === J(['g7']) && op(['h1']) === J(['h1']) && op(['h1', 'h2']) === J(['h2']) && op(['l1']) === J([]) && op(['w1', 'x1']) === J([])
            && J(S.ownSheetPlan(cA, [{ id: 't', isChar: true, charId: 'c_t' }, { id: 't2', isChar: true, charId: 'c_t' }])) === J([]) && J(S.ownSheetPlan(cA, null)) === J([]), op(['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7']));
        // sheets.js, sliced by its sheetshare markers and run for real on a page of plain objects, with the real cores and the real dialog's answers as showConfirm gives them
        const shS = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), a0 = shS.indexOf('// [systemcheck:sheetshare-start]'), a1 = shS.indexOf('// [systemcheck:sheetshare-end]');
        const SU = await import(url('setupcore.js'));
        const page = (camp, o) => {
            o = o || {}; const seen = { asks: [], logs: [], saves: 0, toasts: [], owners: 0, sent: [], pushed: [], renders: 0 };
            const win = Object.assign({ wpStepLog: (area, step, facts) => seen.logs.push([area, step, facts]), wpSetupCore: SU, appRender: () => seen.renders++ }, o.win || {});
            const n = o.host ? Object.assign({ active: true, role: 'host', syncChar: id => seen.sent.push(id), pushItems: ids => seen.pushed.push(ids) }, o.netx ? o.netx(seen) : {}) : null;
            let k = 0;
            const api = new Function('getActiveCampaign', 'charById', 'isClient', 'canWrite', 'showConfirm', 'window', 'sheetUsers', 'shareFirst', 'sheetCopy', 'splitPlan', 'ownSheetPlan', 'uid', 'charList', 'charsOf', 'net', 'syncOwners', 'save', 'renderAll', 'toast',
                shS.slice(a0, a1) + '\nreturn { shareAsk, shareTake, shareOwn, ownSheetCount, ownSheetFor, shareSplitCount, shareSplitAsk };')(
                () => camp, (id, c) => { const cc = c || camp; return cc.chars && Object.prototype.hasOwnProperty.call(cc.chars, id) ? cc.chars[id] : null; }, () => !!o.client, () => !o.foreign,
                (q, cb, opts) => seen.asks.push({ q, cb, opts }), win, S.sheetUsers, S.shareFirst, S.sheetCopy, S.splitPlan, S.ownSheetPlan, p => p + 'new' + (++k), c => Object.values(c.chars), c => c.chars, () => n,
                () => seen.owners++, () => seen.saves++, () => {}, t => seen.toasts.push(t));
            return { api, seen };
        };
        // the ask: an NPC's sheet with others on two maps; a player's character; nobody else; not the GM's
        const cB = mk(), pB = page(cB), ways = [];
        pB.api.shareAsk([cB.items.m_p.whiteboard[0]], 'c_h', w => ways.push(w));
        const askH = pB.seen.asks[0];
        askH.cb(true); askH.cb('alt'); askH.cb(false);
        pB.api.shareAsk([], 'c_p', w => ways.push(w)); const askP = pB.seen.asks[1]; askP.cb(true); askP.cb('alt');
        pB.api.shareAsk([], 'c_e', w => ways.push('alone:' + w)); pB.api.shareAsk([cB.items.m_d.whiteboard[2]], 'c_l', w => ways.push('self:' + w)); pB.api.shareAsk([], 'c_t', w => ways.push('tpl:' + w));
        const pC = page(mk(), { client: true }), pF = page(mk(), { foreign: true }); pC.api.shareAsk([], 'c_g', w => ways.push('client:' + w)); pF.api.shareAsk([], 'c_g', w => ways.push('foreign:' + w));
        const pM = page(mk()); pM.api.shareAsk([{ id: 'a' }, { id: 'b' }], 'c_g', () => {});
        check('the ask (sheets.js shareAsk, run for real): asked only where another character token uses the sheet, saying how many and on how many maps, by buttons alone (noEnter); Its own copy first for an NPC, Share stats first for a player\'s character; Escape answers null; '
            + 'a sheet nobody else uses, the token\'s own and a template are never asked; a player\'s app and someone else\'s table are never asked and assign as before; several tokens are asked of together; logged as sheetshare v1 with counts and answers, never a name',
            J(ways) === J(['copy', 'share', null, 'share', 'copy', 'alone:share', 'self:share', 'tpl:share', 'client:share', 'foreign:share']) && pB.seen.asks.length === 2 && pC.seen.asks.length === 0 && pF.seen.asks.length === 0
            && askH.q === '2 other tokens already use the sheet Hyval Osk, on 2 maps. Should this token share its stats, or get its own copy?' && J(askH.opts) === J({ yes: 'Its own copy', alt: 'Share stats', noEnter: true })
            && askP.q === '3 other tokens already use the sheet Vel, on 2 maps. Should this token share its stats, or get its own copy?' && J(askP.opts) === J({ yes: 'Share stats', alt: 'Its own copy', noEnter: true })
            && pM.seen.asks[0].q === '7 other tokens already use the sheet Detention guard. Should these 2 tokens share its stats, or each get its own copy?'
            && pB.seen.logs.every(l => l[0] === 'sheetshare v1' && !/Hyval|Vel|guard/i.test(J(l[2]))) && J(pB.seen.logs.map(l => l[1])) === J(['ask', 'answer', 'answer', 'cancel', 'ask', 'answer', 'answer']), J([ways, pB.seen.asks.map(a => a.q), pM.seen.asks.map(a => a.q), pB.seen.logs]));
        // its own copy: by the token's own name where it has one, else the sheet's numbered on; one save; the host sends the new sheet
        const cD = mk(), pD = page(cD, { host: true }), wD = cD.items.m_p.whiteboard;
        const c3 = pD.api.shareOwn(wD[2], 'c_g'), c2 = pD.api.shareOwn(wD[1], 'c_g');
        const relink = { id: 'z', isChar: true, charId: 'c_h', name: 'Hyval Osk' }; cD.items.m_p.whiteboard.push(relink); const cz = pD.api.shareTake(relink, 'c_g');
        check('its own copy (sheets.js shareOwn and shareTake, run for real): named by the token where its name is its own (Ommish Daal), else by the sheet numbered on; a token whose name only followed its old sheet takes the new sheet\'s; the token names the copy, its charName and name with it; one save and the table\'s owners worked out once; the host sends the new sheet; the original untouched',
            !!c3 && c3.name === 'Ommish Daal' && wD[2].charId === c3.id && wD[2].charName === 'Ommish Daal' && wD[2].name === 'Ommish Daal' && !!c2 && c2.name === 'Detention guard 2' && wD[1].charId === c2.id && wD[1].name === 'Detention guard 2'
            && !!cz && cz.name === 'Detention guard 3' && relink.charId === cz.id && cD.chars[c3.id] === c3 && c3.npc === true && cD.chars.c_g.values.f_hp === 9 && c3.values.f_hp === 9 && c3.values !== cD.chars.c_g.values
            && pD.seen.saves === 2 && pD.seen.owners === 2 && J(pD.seen.sent) === J([c3.id, c2.id, cz.id]) && J(pD.seen.logs.map(l => l[1])) === J(['copy', 'copy']), J([c3, c2, cz, pD.seen]));
        // Give this token its own sheet, for a selection; and never on a player's app
        const cE = mk(), pE = page(cE), wE = cE.items.m_p.whiteboard, picks = wE.slice(0, 7);
        const nE = pE.api.ownSheetCount(picks), dE = pE.api.ownSheetFor(picks), pEc = page(mk(), { client: true });
        check('Give this token its own sheet (sheets.js ownSheetCount and ownSheetFor, run for real): the menu\'s count; with all seven guards picked the first keeps the sheet and six get their own, numbered on past Ommish Daal\'s own name, in ONE save; nothing on a player\'s app; a token alone on its sheet is told so',
            nE === 6 && dE === 6 && wE[0].charId === 'c_g' && J(wE.slice(1, 7).map(w => w.name)) === J(['Detention guard 2', 'Ommish Daal', 'Detention guard 3', 'Detention guard 4', 'Detention guard 5', 'Detention guard 6']) && new Set(wE.slice(0, 7).map(w => w.charId)).size === 7
            && pE.seen.saves === 1 && pE.seen.owners === 1 && pEc.api.ownSheetCount(picks) === 0 && pEc.api.ownSheetFor(picks) === 0 && pE.api.ownSheetFor([cE.items.m_d.whiteboard[2]]) === 0 && pE.seen.saves === 1 && /No picked token/.test(pE.seen.toasts.slice(-1)[0])
            && J(pE.seen.logs.map(l => l[1])) === J(['own-start', 'own-done', 'own-start', 'own-none']), J([wE.map(w => [w.id, w.charId, w.name]), pE.seen]));
        // the campaign-wide split: asked first with how many, then done in one save; the host sends the other maps it changed
        const cF = mk(), pF2 = page(cF, { host: true }); cF.activeItemId = 'm_d';
        const nF = pF2.api.shareSplitCount(), askedF = pF2.api.shareSplitAsk(), qF = pF2.seen.asks[0], before = J(cF);
        qF.cb(false); const leftAlone = J(cF) === before && pF2.seen.saves === 0; qF.cb(true);
        const wF = cF.items.m_p.whiteboard, cG = mk(), pG = page(cG); const noneG = (() => { cG.items.m_p.whiteboard = cG.items.m_p.whiteboard.filter(w => !/^(g|n2)/.test(w.id)); return pG.api.shareSplitAsk(); })();
        check('the campaign-wide split (sheets.js shareSplitCount and shareSplitAsk, run for real): asked first, by buttons alone, saying how many tokens, maps and sheets and what stays; Cancel changes nothing; Yes gives each guard after the first and the second token of a sheet with no player their own, in ONE save; '
            + 'Hyval Osk on two maps, the player\'s character and the Unique NPC stay as they were; the host sends the map it changed that is not open; a campaign with none to split is told so and asks nothing',
            nF === 7 && askedF === true && qF.q === 'Give 7 tokens their own sheets? On one map, 2 sheets are shared by two or more character tokens. Each token after the first gets its own copy, and the first keeps the original. A character a player plays, an NPC ticked Unique and a character with one token on each of several maps stay as they are.'
            && J(qF.opts) === J({ yes: 'Give them their own', noEnter: true }) && leftAlone && pF2.seen.saves === 1 && pF2.seen.owners === 1 && wF[0].charId === 'c_g' && new Set(wF.slice(0, 7).map(w => w.charId)).size === 7 && wF[13].charId !== 'c_n' && wF[12].charId === 'c_n'
            && ['h1', 'p1', 'p2', 'u1', 'u2'].every(id => wF.filter(w => w.id === id)[0].charId === { h: 'c_h', p: 'c_p', u: 'c_u' }[id[0]]) && J(pF2.seen.pushed) === J([['m_p']]) && pF2.seen.sent.length === 7
            && noneG === false && pG.seen.asks.length === 0 && /No two character tokens/.test(pG.seen.toasts[0]) && J(pF2.seen.logs.map(l => l[1])) === J(['split-ask', 'split-cancel', 'split-start', 'split-done']), J([qF && qF.q, wF.map(w => [w.id, w.charId]), pF2.seen.pushed, pF2.seen.logs]));
        {   // the review of backlog 237: what stands outside the sheet goes with a token's own copy: the GM's Rules run switch and the clock's counts for it (calendarcore clockCopyChar), what a running fight keeps of a turn by character and who holds whom (net.js charSplitFight and holdsRetarget), and the fights' rows named again once (fightRowsRenamed)
            const CKc = await import(url('calendarcore.js')), netx = seen => ({ charSplitFight: (a, b, t) => (seen.split = seen.split || []).push([a, b === seen.newId ? 'new' : b, t]), holdsRetarget: (t, a, b) => (seen.hold = seen.hold || []).push([t, a, 'new']), fightRowsRenamed: ids => (seen.rows = seen.rows || []).push(ids) });
            const cH = mk(); cH.clock = { t: 100, rulesOff: ['c_g'], acc: { c_g: { r_a: 30 } }, lived: { c_g: [200, 0] } };
            const pH = page(cH, { host: true, win: { wpCalendarCore: CKc }, netx }), wH = cH.items.m_p.whiteboard, cH2 = pH.api.shareOwn(wH[1], 'c_g');
            const cI = mk(); cI.clock = { t: 100, rulesOff: ['c_h'] }; const clockI = J(cI.clock), pI = page(cI, { host: true, win: { wpCalendarCore: CKc }, netx }), cI2 = pI.api.shareOwn(cI.items.m_p.whiteboard[1], 'c_g');
            const cJ = mk(), pJ = page(cJ, { host: true, win: { wpCalendarCore: CKc }, netx }), nJ = pJ.api.shareSplitAsk(); pJ.seen.asks[0].cb(true);
            const cK = mk(), pK = page(cK, { host: true, win: { wpCalendarCore: CKc }, netx }), relK = { id: 'zk', isChar: true, charId: 'c_h', name: 'Hyval Osk' }; cK.items.m_p.whiteboard.push(relK); pK.api.shareOwn(relK, 'c_g');
            check('the review of backlog 237 (sheets.js shareTake, run for real): a guard whose sheet\'s time rules the GM switched off is switched off on its own copy too, with what they counted and its own time; a sheet whose rules run adds nothing and leaves the clock as it was; '
                + 'the fight\'s turn state and who holds whom follow the copy from the sheet the token stood on (the turn state only where it stood on it), and the fights\' rows are named again once for every token a split gave its own sheet',
                !!cH2 && J(cH.clock.rulesOff) === J(['c_g', cH2.id]) && J(cH.clock.acc[cH2.id]) === J({ r_a: 30 }) && J(cH.clock.lived[cH2.id]) === J([200, 0])
                && !!cI2 && J(cI.clock) === clockI
                && J(pH.seen.split.map(x => [x[0], x[2]])) === J([['c_g', 'g2']]) && pH.seen.split[0][1] === cH2.id && J(pH.seen.hold) === J([['g2', 'c_g', 'new']]) && J(pH.seen.rows) === J([['g2']])
                && nJ === true && J(pJ.seen.rows) === J([['g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'n2']]) && pJ.seen.split.length === 7 && pJ.seen.hold.length === 7
                && !pK.seen.split && J(pK.seen.hold) === J([['zk', 'c_g', 'new']]), J([cH.clock, cI.clock, pH.seen.split, pH.seen.hold, pH.seen.rows, pJ.seen.rows, pK.seen.split]));
        }
        // a drop from the Campaign Cast asks first (whiteboard.js castPlace, run for real): Its own copy places a token on its own copy; Escape places nothing
        const wbX = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, '\n'), cp0 = wbX.indexOf('// [systemcheck:castplace-start]'), cp1 = wbX.indexOf('// [systemcheck:castplace-end]');
        const castRun = way => {
            const m = { id: 'm1', type: 'map', whiteboard: [] }, camp = { id: 'k1', chars: { c_g: { id: 'c_g', name: 'Guard', npc: true } }, items: { m1: m }, cast: { e1: { id: 'e1', name: 'Guard', kind: 'circle', w: 60, h: 52, color: '#123456', charStats: '', charId: 'c_g' } } }, asked = [];
            const win = { wpSheets: { syncOwners() {}, shareAsk: (t, id, cb) => { asked.push([t, id]); cb(way); }, shareTake: (w, id) => { w.charId = 'c_own'; w.name = w.charName = 'Guard 2'; return { id: 'c_own' }; } } };
            const IO = () => ({ then: f => f({ save() {}, toast() {} }) });
            new Function('getActiveCampaign', 'getActiveMap', 'castOf', 'window', 'IO', wbX.slice(cp0, cp1).replace("import('./io.js')", 'IO()') + '\nreturn castPlace;')(() => camp, () => m, c => c.cast, win, IO)('e1', 100, 100, 1);
            return { toks: m.whiteboard.map(w => [w.charId, w.name]), asked };
        };
        const cOwn = castRun('copy'), cShare = castRun('share'), cEsc = castRun(null);
        check('a drop from the Campaign Cast (whiteboard.js castPlace, run for real): asked first with the sheet it names; Its own copy places the token on its own copy, Share stats on the cast\'s sheet, and Escape places nothing',
            J(cOwn.toks) === J([['c_own', 'Guard 2']]) && J(cShare.toks) === J([['c_g', 'Guard']]) && J(cEsc.toks) === J([]) && J(cOwn.asked) === J([[null, 'c_g']]), J([cOwn, cShare, cEsc]));
        // the wiring: every way a sheet comes to a token, the menus and the quick jump
        const rd2 = f => fs.readFileSync(path.join(app, 'scripts', f), 'utf8').replace(/\r\n/g, '\n'), insX = rd2('inspector.js'), clX2 = rd2('charlist.js'), cmX = rd2('commands.js');
        check('backlog 237 wired: Properties\' Character (sheet) asks before it links, and Escape leaves the token as it was; Is Character ticked on a token that names a sheet asks, and Escape unticks it; the token menu\'s row is the GM\'s and asks the count; the Characters section\'s + menu and the quick jump give shared tokens their own sheets; an encounter group\'s drop copies through the one copy',
            shS.includes("        else if (v && v !== w.charId) {   // 1.6.2 (backlog 237)") && shS.includes("            shareAsk([w], v, function(way) {") && insX.includes("SHi.shareAsk([w], w.charId, function(way) { if (!way) { box.checked = false; return; } go.call(box, way); }); return; }")
            && wbX.includes("else if (action.includes('cm-own-sheet')) {") && wbX.includes("window.wpSheets.ownSheetCount ? window.wpSheets.ownSheetCount(") && wbX.includes("'Give this token its own sheet'") && wbX.includes('var nm = window.wpSetupCore.nextName(ch.name,') && wbX.includes('c = SC.sheetCopy(ch, id, nm, camp.system);')
            && clX2.includes("var spl = typeof S.shareSplitCount === 'function' ? S.shareSplitCount() : 0;") && clX2.includes("row('Give shared tokens their own sheets") && cmX.includes("    { id: 'chars.split', name: 'Give shared tokens their own sheets',")
            && shS.includes('shareAsk: shareAsk, shareTake: shareTake, shareOwn: shareOwn, ownSheetCount: ownSheetCount, ownSheetFor: ownSheetFor, shareSplitCount: shareSplitCount, shareSplitAsk: shareSplitAsk,'));
        const hlp = fs.readFileSync(path.join(app, 'index.html'), 'utf8'), nts = ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n'));
        check('backlog 237 in Help and both release notes: the question and its two answers, Escape, splitting tokens that share, what the campaign-wide split leaves alone, and where its steps are logged',
            hlp.includes('<li><b>Shared sheets.</b> When you give a token a sheet that another token already uses, Waypoint asks first.') && hlp.includes('choose <b>Give this token its own sheet</b>.</li>') && hlp.includes('Each step goes to the app&rsquo;s log as sheetshare v1.')
            && nts.every(t => t.includes("- Give a token a sheet that another token already uses and Waypoint asks\n  first: Share stats, or Its own copy.")));
    }
    /* ---- what a player receives ---- */
    check('charFor: NPC and ownerless -> null; owner gets every visible value; another player gets hover fields only; GM-only never', (() => { const own = charFor(ch, sys, 'u_pat'); const other = charFor(ch, sys, 'u_sam'); const npc = charFor(Object.assign({}, ch, { npc: true, ownerId: '' }), sys, 'u_pat'); const c3 = Object.assign({}, ch, { values: Object.assign({}, ch.values, { f_secret: 9 }) }); const own3 = charFor(c3, sys, 'u_pat'); return own && j(Object.keys(own.values)) === j(['f_str', 'f_stealth', 'f_prone', 'f_class', 'f_notes', 'f_align']) && !own.partial && other && j(Object.keys(other.values)) === j(['f_prone']) && other.partial && npc === null && !('f_secret' in own3.values); })(), j(charFor(ch, sys, 'u_sam')));

    /* ---- layout and bridge ---- */
    check('autoLayout: one section per kind group plus rolls, notes full-row', (() => { const a = autoLayout(sys); return j(a.sections.map(s => s.title)) === j(['Attributes', 'Derived', 'Resources', 'Skills', 'Conditions', 'Details', 'Notes', 'Rolls']) && a.sections[6].fields[0].w === 'row' && a.sections[7].fields.length === 2; })(), j(autoLayout(sys).sections.map(s => s.title)));
    check('emptySystem shape', j(emptySystem()) === j({ v: 1, name: '', preset: '', updated: 0, fields: [], rolls: [], items: [], combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: '', cover: { on: false, style: 'graded' } }, sheet: { sections: [] } }));

    /* ---- cover (1.5.0): cleanCover whitelist + coverTier mapping ---- */
    check('cleanCover: on boolean, style whitelist (graded default), junk -> off/graded', (() => {
        const a = S.cleanCover({ on: 1, style: 'binary' }), b = S.cleanCover({ on: true, style: 'evil' }), c = S.cleanCover(null);
        return a.on === false && a.style === 'binary' && b.on === true && b.style === 'graded' && c.on === false && c.style === 'graded'; })());
    check('cleanCombat carries a cleaned cover (in key order after hpResource)', (() => {
        const o = S.cleanCombat({ cover: { on: true, style: 'binary' } }, {});
        return o.cover.on === true && o.cover.style === 'binary' && j(Object.keys(o)) === j(['blastAuto', 'blastRoller', 'hpResource', 'cover']); })());
    {   // 1.6.0: the System editor on a large system: a tab draws its own rows, a long list fills when it is used, and the focus stays on a list that redraws its row
        const shF = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const lzS = shF.slice(shF.indexOf('function lazySelect('), shF.indexOf('function select(cls, options, value, title)')), mkS = () => ({ kids: [], on: {}, set textContent(v) { this.kids = []; }, appendChild(o) { this.kids.push(o); }, addEventListener(k, f) { this.on[k] = f; } });
        const lazy = new Function('select', 'opt', lzS + '\nreturn lazySelect;')((c, os, v, t) => { const s = mkS(); s.plain = true; os.forEach(o => s.appendChild(o)); return s; }, (v, t, sel) => ({ v, t, sel }));
        const opts41 = Array.from({ length: 41 }, (_, i) => ['v' + i, 'Name ' + i]), ls = lazy('c', opts41, 'v7', 't'), one = ls.kids.length === 1 && ls.kids[0][0] === 'v7'; ls.on.pointerdown(); const whole = ls.kids.length === 41 && ls.kids.filter(o => o.sel).length === 1 && ls.kids[7].sel; ls.on.focus();
        const lf = lazy('c', opts41, 'gone', 't'), lf1 = lf.kids[0][0] === 'v0'; lf.on.focus(); const short = lazy('c', opts41.slice(0, 40), 'v1', 't');
        check('1.6.0 a list of more than 40 choices holds its own choice until it is pressed or reached by the keyboard, then all of them with the same one picked, once; a value it does not hold shows its first; a list of 40 is a plain list',
            one && whole && ls.kids.length === 41 && lf1 && lf.kids.length === 41 && short.plain === true && !short.on.focus);
        const rfS = require('./checkkit').cut('sysedtabs.js', '// [systemcheck:rowfocus-start]', '// [systemcheck:rowfocus-end]'), box = { focused: 0, focus() { this.focused++; } };
        const rows = [{ dataset: { id: 'f_a' }, querySelector: () => null }, { dataset: { id: 'f"]b' }, querySelector: s => (s === '.sys-kind' ? box : null) }];
        const rf = new Function('document', rfS + '\nreturn { rowFocusOf, rowFocusBack };')({ querySelectorAll: () => rows }), inRow = { className: 'sys-kind field', closest: () => rows[1] };
        const was = rf.rowFocusOf(inRow); rf.rowFocusBack(was); rf.rowFocusBack(null); rf.rowFocusBack({ id: 'gone', cls: 'sys-kind' });
        check('1.6.0 a list stepped by the keyboard keeps the focus when its row is drawn again, found by the row\'s id without that id in a selector; nothing that is not a row\'s control is followed',
            JSON.stringify(was) === JSON.stringify({ id: 'f"]b', cls: 'sys-kind' }) && box.focused === 1 && rf.rowFocusOf(null) === null && rf.rowFocusOf({ className: 'x', closest: () => null }) === null, JSON.stringify(was));
        const fbA = { focused: 0, focus() { this.focused++; } }, fbB = { focused: 0, focus() { this.focused++; }, className: 'sys-list-feedfrom', closest: s => (s.includes('.sys-row') ? null : cdOld) }, cdOld = { dataset: { lid: 'f_w' }, querySelectorAll: () => [{}, fbB] }, cdNew = { dataset: { lid: 'f_w' }, querySelectorAll: s => (s === '.sys-list-feedfrom' ? [{}, fbA] : []) }, cdGone = { dataset: { lid: 'f_o' }, querySelectorAll: () => { throw new Error('the wrong card'); } };
        const rfC = new Function('document', rfS + '\nreturn { rowFocusOf, rowFocusBack };')({ querySelectorAll: () => [cdGone, cdNew] }), wasC = rfC.rowFocusOf(fbB); rfC.rowFocusBack(wasC); const combO = { className: 'sys-dmgr-loclist field', closest: s => (s.includes('.sys-row') ? null : { dataset: {}, querySelectorAll: () => [combO] }) }, wasO = rfC.rowFocusOf(combO);
        check('1.6.0 a list stepped by the keyboard keeps the focus in a list\'s card and on the Combat tab too (found live: a press in a Feed row left the focus on the page), by the card\'s own list and the control\'s place among those of its class',
            JSON.stringify(wasC) === JSON.stringify({ lid: 'f_w', cls: 'sys-list-feedfrom', nth: 1 }) && fbA.focused === 1 && JSON.stringify(wasO) === JSON.stringify({ lid: '', cls: 'sys-dmgr-loclist', nth: 0 }), JSON.stringify([wasC, wasO, fbA.focused]));
        const cdS = require('./checkkit').cut('sysedcombat.js', '// [systemcheck:combatdraw-start]', '// [systemcheck:combatdraw-end]'), cdNew2 = { className: 'sys-combat-bfills', focused: 0, focus() { this.focused++; cdDoc.activeElement = this; } }, cdOld2 = { className: 'sys-combat-bfills', closest: s => (s.includes('.sys-row') ? null : cdBox) }, cdBox = { dataset: {}, list: [cdOld2], querySelectorAll() { return this.list; } }, cdDoc = { activeElement: cdOld2, querySelectorAll: () => [cdBox] };
        new Function('document', 'combatBody', rfS + cdS + '\nreturn renderCombat;')(cdDoc, () => { cdBox.list = [cdNew2]; cdDoc.activeElement = { className: '' }; })();
        check('1.6.0 a list of the Combat tab stepped by the keyboard keeps the focus (found by hand: a pick there redraws the card by renderCombat alone, past renderAll\'s keeper, so the next arrow key fell on the page), renderCombat run for real',
            cdNew2.focused === 1 && cdDoc.activeElement === cdNew2, String(cdNew2.focused));
        const raS = require('./checkkit').cut('sysedtabs.js', 'function renderAll() {', '// [systemcheck:rowfocus-start]');
        check('1.6.0 each of the four tabs draws its rows only while it is the tab in view (1.6.2, backlog 59 f: the characters went to a window of their own, drawn by charsDraw: moved on purpose), and a press of a tab runs no check of the draft',
            ['Effect', 'Field', 'Roll', 'Item'].every(k => raS.includes("rowsFor('sys" + k + "Rows', '")) && !raS.includes("rowsFor('sysCharRows'") && raS.includes('    charsDraw();') && raS.includes('if (!_tabPress) refreshErrors();') && raS.includes('if (!_tabPress) patchErrors();') && require('./checkkit').part('sysedtabs.js').includes('_tabPress = true; try { renderAll(); } finally { _tabPress = false; }') && !/\bfr\.textContent = ''/.test(raS));
        check('1.6.0 a called shot\'s menu put away by a press elsewhere says the roll was called off, and no other menu of that pop says it',
            shF.includes("var hitP = _ldPop._hit === true; closeLoadMenu(); if (hitP) toast('Roll called off: no location was picked.')") && shF.split('pop._hit = true').length === 2 && shF.includes("pop.setAttribute('aria-label', 'Where it is aimed'); pop._anchor = anchor; pop._hit = true;"));
    }
    {   // 1.6.0: a place on a list in one view and in another
        const liG = { id: 'f_l', kind: 'item-list', list: { rolls: [{ label: 'A', formula: '1' }, { label: 'B', formula: '2' }, { label: 'B', formula: '2' }, { label: 'C', apply: [{ f: 'x' }] }, { label: 'D', formula: '4' }] } }, liV = { id: 'f_l', kind: 'item-list', list: { rolls: [{ label: 'B', formula: '2' }, { label: 'C', apply: [{ f: 'x' }] }, { label: 'D', formula: '4' }] } }, gm = { fields: [liG] }, pl = { fields: [liV] }, place = (a, b, i) => S.rollPlace(a, b, 'f_l', i);
        check('1.6.0 rollPlace reads a list roll\'s place from one view into another, in order: a player\'s place on the GM\'s list, the GM\'s on the player\'s, an action by its name, a roll a view dropped none, and a list or a place that is not there none',
            place(pl, gm, 0) === 1 && place(pl, gm, 1) === 3 && place(pl, gm, 2) === 4 && place(gm, pl, 4) === 2 && place(gm, pl, 3) === 1 && place(gm, pl, 0) === -1 && place(gm, pl, 9) === -1 && S.rollPlace(gm, pl, 'f_zz', 0) === -1 && S.rollPlace(null, pl, 'f_l', 0) === -1 && place(pl, gm, '0') === -1, [place(pl, gm, 0), place(pl, gm, 1), place(gm, pl, 4)].join());
    }
    {   // 1.6.0 Shares an end, run for real through applyEffectOp and fxTick: invented names, the worked case of a heavy and a light effect at their turn's end
        const fxS = { fields: [{ id: 'f_fx', key: 'Fx', kind: 'effects', edit: 'gm', vis: 'all' }], rolls: [], items: [], combat: { round: 6 },
            effects: [{ id: 'e_heavy', name: 'Heavy', icon: '', tone: '', dur: '1 turn', notes: '', vis: 'all', mods: [], ends: 'turnEnd', again: 'longer', endGroup: 'shaken', endRank: 2 }, { id: 'e_light', name: 'Light', icon: '', tone: '', dur: '1 turn', notes: '', vis: 'all', mods: [], ends: 'turnEnd', again: 'longer', endGroup: 'shaken', endRank: 1 }, { id: 'e_other', name: 'Other', icon: '', tone: '', dur: '3 turns', notes: '', vis: 'all', mods: [], endGroup: 'apart' }] };
        const ch0 = { id: 'c_a', values: { f_fx: [] } }, addFx = (c, ref, id) => { const r = S.applyEffectOp(fxS, c, 'f_fx', { op: 'add', rowId: id, ref }, null, { now: 1000, inCombat: true }); if (!r.ok) throw new Error('add ' + r.reason); c.values.f_fx = r.value; return r; };
        const tick = (c, k) => { const o = S.fxTick(fxS, c, k, 1000); if (o.values.f_fx) c.values.f_fx = o.values.f_fx; return o; }, rowOf = (c, ref) => c.values.f_fx.find(r => r.ref === ref);
        const c1 = JSON.parse(JSON.stringify(ch0)); addFx(c1, 'e_heavy', 'x_h'); tick(c1, 'turn'); addFx(c1, 'e_light', 'x_l'); const moved = rowOf(c1, 'e_heavy').t, same = JSON.stringify(moved) === JSON.stringify(rowOf(c1, 'e_light').t);
        tick(c1, 'turnEnd'); const after5 = c1.values.f_fx.map(r => r.ref).sort().join(); tick(c1, 'turn'); tick(c1, 'turnEnd'); const after6 = c1.values.f_fx.length;
        const c2 = JSON.parse(JSON.stringify(ch0)); addFx(c2, 'e_light', 'x_l'); tick(c2, 'turn'); addFx(c2, 'e_heavy', 'x_h'); const lightKept = rowOf(c2, 'e_light').t.e === 1, heavyOwn = rowOf(c2, 'e_heavy').t.e === undefined;
        const c3 = JSON.parse(JSON.stringify(ch0)); addFx(c3, 'e_heavy', 'x_h'); addFx(c3, 'e_other', 'x_o'); const plain = rowOf(c3, 'e_heavy').t.left;
        check('1.6.0 Shares an end: the heavier effect takes the later end the moment the lighter comes on, so a heavy effect with one turn to go lives through the turn after beside the light one, and both end together; a light effect keeps its own end and a heavy one added last ends no sooner; another group changes nothing',
            same && moved.e === undefined && after5 === 'e_heavy,e_light' && after6 === 0 && lightKept && heavyOwn && plain === 6, JSON.stringify([moved, after5, after6, lightKept, heavyOwn, plain]));
        const cl = (d, gm) => S.cleanSystem({ fields: [{ id: 'f_fx', key: 'Fx', kind: 'effects' }], effects: [Object.assign({ id: 'e_a', name: 'A' }, d)] }, { F: F, gmView: gm !== false }).effects[0];
        const ok1 = cl({ endGroup: 'a-b_1', endRank: 3 }), bad = cl({ endGroup: 'has space', endRank: 3 }), noR = cl({ endRank: 3 }), far = cl({ endGroup: 'g', endRank: 500 });
        check('1.6.0 Shares an end cleaned: a short word and a whole rank 1 to 99, the same in both views, no rank with no word, and none of the keys on an effect that sets neither',
            ok1.endGroup === 'a-b_1' && ok1.endRank === 3 && cl({ endGroup: 'a-b_1', endRank: 3 }, false).endRank === 3 && !('endGroup' in bad) && !('endRank' in bad) && !('endRank' in noR) && far.endGroup === 'g' && !('endRank' in far) && !('endGroup' in cl({})));
    }
    {   // 1.6.0 Target.<key> and The GM may press past it, on invented data
        const raw = { fields: [{ id: 'f_dodge', key: 'Dodge', label: 'Dodge', kind: 'number', vis: 'all', edit: 'owner', default: 3 }, { id: 'f_sec', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm', edit: 'gm' }, { id: 'f_note', key: 'Note', label: 'Note', kind: 'text', vis: 'all', edit: 'owner' }], rolls: [{ id: 'r_a', label: 'Fire', formula: '3d6 <= 10 + Target.Dodge', vis: 'all', needs: 'TargetDistance <= 9', needsGm: true }, { id: 'r_b', label: 'Fire 2', formula: '3d6', vis: 'all', needsGm: true }], combat: { targetReads: ['f_dodge', 'f_sec', 'f_note', 'f_gone', 'f_dodge'] } };
        const sg = S.cleanSystem(raw, { F, gmView: true }), sp = S.cleanSystem(raw, { F, gmView: false }), ch = { id: 'c_t', name: 'Kael', values: { f_dodge: 7 } };
        const reads = S.targetReadsOf(sg, { id: 't' }, { F, charOf: () => ch }), none = S.targetReadsOf(sg, { id: 't' }, { F, charOf: () => null }), bare = S.targetReadsOf(S.cleanSystem({ fields: raw.fields }, { F, gmView: true }), { id: 't' }, { F, charOf: () => ch });
        const tc = S.withRange({}, { mod: 0, dist: 4, reads }), rv = S.makeResolver(sg, { id: 'c_a', values: {} }, F, tc), noT = S.makeResolver(sg, { id: 'c_a', values: {} }, F);
        check('1.6.0 Target.<key>: the Combat tab keeps a number field its viewer can read, each once, the same in both views, never a GM-only one, a text or one that is gone; the target\'s figure reads in a roll, 0 with no target, and counts as reading the range; none where the card names none',
            JSON.stringify(sg.combat.targetReads) === '["f_dodge"]' && JSON.stringify(sp.combat.targetReads) === '["f_dodge"]' && reads.dodge === 7 && none === null && bare === null && rv('target.dodge') === 7 && rv.rangeRead() === true && noT('target.dodge') === 0 && S.validateSystem(sg, F).errors.every(e => !/Target\.Dodge/.test(e.message)), JSON.stringify([sg.combat, reads]));
        const lrs = v => S.cleanSystem({ fields: [{ id: 'f_g', key: 'Gun', label: 'Gun', kind: 'item-list', vis: 'all', edit: 'gm', list: { rolls: [{ label: 'Fire', formula: '3d6', needs: 'TargetDistance <= 9', needsGm: true }, { label: 'Spare', formula: '3d6', needsGm: true }] } }] }, { F, gmView: v }).fields[0].list.rolls;
        check('1.6.0 The GM may press past it: kept only beside needs, true only, the same in both views, on a system roll and on a list\'s roll', sg.rolls[0].needsGm === true && sp.rolls[0].needsGm === true && !('needsGm' in sg.rolls[1]) && lrs(true)[0].needsGm === true && lrs(false)[0].needsGm === true && !('needsGm' in lrs(true)[1]));
    }
    check('1.6.0 coverWord: a grade of TargetCoverGrade in the system\'s own words, as coverTier names it; none with cover off or at grade 0', (() => { const g = { combat: { cover: { on: true, style: 'graded' } } }, b = { combat: { cover: { on: true, style: 'binary' } } }; return S.coverWord(g, 1) === 'Half cover' && S.coverWord(g, 2) === 'Three-quarters cover' && S.coverWord(g, 3) === 'Total cover' && S.coverWord(b, 1) === 'Cover' && S.coverWord(b, 3) === 'Total cover' && S.coverWord(g, 0) === '' && S.coverWord({ combat: { cover: { on: false } } }, 2) === '' && S.coverWord(null, 2) === ''; })());
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

    /* ---- cover follow-ups (owner 2026-09-28): the system's blast outcome per grade; what a total does behind cover ---- */
    check('Cover: cleanCover keeps a blast outcome per grade (half or none; full is the default and never stored; an unknown grade or value dropped, a prototype key ignored) and is exactly {on, style} without one',
        j(S.cleanCover({ on: true, style: 'binary', objects: 3.9 })) === j({ on: true, style: 'binary', objects: 3 }) && j(S.cleanCover({ on: true, objects: 900 })) === j({ on: true, style: 'graded', objects: 100 }) && ['3', 0, -1, NaN, Infinity, null, {}].every(v => S.cleanCover({ on: true, objects: v }).objects === undefined || v === Infinity) && j(S.cleanCover({ on: true, objects: 0.5 })) === j({ on: true, style: 'graded' })
        && j(S.cleanCover({ on: true, style: 'graded', area: { half: 'half', threeq: 'full', total: 'none', bogus: 'none', cover: 'maybe' } })) === j({ on: true, style: 'graded', area: { half: 'half', total: 'none' } })
        && j(S.cleanCover({ on: true, style: 'graded', area: { half: 'full' } })) === j({ on: true, style: 'graded' }) && j(S.cleanCover({ on: false, area: 'x' })) === j({ on: false, style: 'graded' })
        && j(S.cleanCover({ on: true, style: 'graded', area: { threeq: 'half', cover: 'none' } })) === j({ on: true, style: 'graded', area: { threeq: 'half', cover: 'none' } })
        && j(S.cleanCover({ on: false, style: 'graded', area: { total: 'none' } })) === j({ on: false, style: 'graded', area: { total: 'none' } })
        && j(S.cleanCover({ on: true, area: Object.create({ total: 'none' }) })) === j({ on: true, style: 'graded' })
        && j(cleanSystem(cleanSystem({ v: 1, name: 'C', fields: [], rolls: [], combat: { cover: { on: true, area: { total: 'none' } } } }, { F, gmView: true }), { F, gmView: false }).combat.cover) === j({ on: true, style: 'graded', area: { total: 'none' } }));
    check('Cover: coverOutcome / coverDamage — the whole with cover off, no tier or no outcome (an odd outcome reads as full); the system\'s outcome for the grade otherwise (half rounded down, none nothing); the simple style\'s one grade too',
        (() => { const gr = { combat: { cover: { on: true, style: 'graded', area: { half: 'half', total: 'none' } } } }, bn = { combat: { cover: { on: true, style: 'binary', area: { cover: 'half' } } } }, off = { combat: { cover: { on: false, area: { half: 'none' } } } };
            const tH = S.coverTier(gr, 0.5, true), t3 = S.coverTier(gr, 0.8, true), tT = S.coverTier(gr, 0.9, false), tC = S.coverTier(bn, 0.5, true);
            return S.coverDamage(gr, tH, 7) === 3 && S.coverDamage(gr, t3, 7) === 7 && S.coverDamage(gr, tT, 7) === 0 && S.coverDamage(gr, null, 7) === 7 && S.coverDamage(bn, tC, 9) === 4 && S.coverDamage(off, { name: 'Half cover' }, 7) === 7
                && S.coverDamage({ combat: { cover: { on: true } } }, tH, 7) === 7 && S.coverDamage(gr, tH, NaN) === 0 && S.coverDamage(null, tH, 5) === 5 && S.coverDamage(gr, tH, 1) === 0
                && S.coverOutcome(gr, tH) === 'half' && S.coverOutcome(gr, tT) === 'none' && S.coverOutcome(gr, t3) === 'full' && S.coverOutcome(gr, null) === 'full' && S.coverOutcome(bn, tC) === 'half'
                && S.coverOutcome(off, tH) === 'full' && S.coverOutcome({ combat: { cover: { on: true, area: { half: 'weird' } } } }, tH) === 'full' && S.coverOutcome({ combat: { cover: { on: true, area: { half: 'none' } } } }, null) === 'full'; })());
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
        const fullSecs = []; for (let s = 0; s < 420; s++) fullSecs.push({ id: 's_full' + s, title: 'S' + s, cols: 1, fields: Array.from({ length: 20 }, () => ({ kind: 'divider', w: 'row' })) });   // 8400 placements offered, LIMITS.placements kept
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
        check('Stage 5c: buildSections renders the band from sys.sheet before the tab strip and tags its inputs with data-band (Stage 6: through bandInto)', /body\.textContent = '';[\s\S]{0,2700}?var bandDef = \(sys\.sheet && Array\.isArray\(sys\.sheet\.band\)\) \? sys\.sheet\.band : null;[\s\S]{0,900}?bandInto\(frame, bandDef, pctx\);[\s\S]{0,900}?if \(tabs && !printV\) \{/.test(shSrc) && /function bandInto\(frame, bandDef, ctx\) \{[\s\S]{0,1500}?'sheet-band'[\s\S]{0,1200}?dataset\.band = '1'/.test(shSrc) && /k\.band \? '\[data-band\]' : ':not\(\[data-band\]\)'/.test(shSrc));
        check('Stage 5c: "Start from the automatic layout" keeps the tabs and the band; "Use the automatic layout" asks about both', /sysLayoutAuto'\) \{[\s\S]{0,700}?keepBand[\s\S]{0,700}?draft\.sheet\.band = keepBand/.test(require('./checkkit').part('sysedlayout.js')) && /sysLayoutClear'\) \{[\s\S]{0,300}?draft\.sheet\.band[\s\S]{0,300}?no pinned band/.test(require('./checkkit').part('sysedlayout.js')));
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
        check('Stage 5d: buildSections puts the header block first (its own .sheet-head, not sticky), then dashboard sections, then the frame = band + tab strip', /body\.textContent = '';[\s\S]{0,2000}?var head = el\('div', 'sheet-head'\);\s*headerBlocks\(head, sys, c, all, gm, own\);[\s\S]{0,200}?if \(head\.childNodes\.length\) body\.appendChild\(head\);[\s\S]{0,120}?var frame = el\('div', 'sheet-frame'\);/.test(shSrc2) && /frame\.appendChild\(bandEl\);/.test(shSrc2) && /sec\.pinned[\s\S]{0,200}?'sheet-dash'[\s\S]{0,200}?if \(stripEl\) frame\.appendChild\(stripEl\);\s*if \(frame\.childNodes\.length\) body\.appendChild\(frame\);/.test(shSrc2) && /function headerBlocks\(head, sys, c, all, gm, own\)[\s\S]{0,1800}?if \(c\.partial && !f\.hover\) return;/.test(shSrc2));
        check('Stage 5d: the stuck frame\'s height is reserved as the scroller\'s scroll padding (keyboard focus is never left under it), after every render and after the panel widens', /function syncFramePad\(body\)[\s\S]{0,300}?body\.style\.scrollPaddingTop = fr\.offsetHeight \+ 'px'/.test(shSrc2) && (shSrc2.match(/syncFramePad\((body|container)\);/g) || []).length >= 3);
        check('Stage 5d: a tab opened while the frame is stuck starts at its own top (the scroll returns to where the frame sits in the flow)', /var wasStuck = body\.scrollTop > frameFlowTop\(body\);[\s\S]{0,200}?\(rerender \|\| renderSheet\)\(\);\s*if \(wasStuck\) body\.scrollTop = frameFlowTop\(body\);/.test(shSrc2) && /function frameFlowTop\(body\)/.test(shSrc2));
        const cssSrc = fs.readFileSync(path.join(app, 'style.css'), 'utf8');
        check('Stage 5d: the frame (band + tab strip) is the ONE sticky element; the header block and the band themselves are not sticky', /\.sheet-frame \{ position: sticky; top: 0;/.test(cssSrc) && !/\.sheet-band \{ position: sticky/.test(cssSrc) && !/\.sheet-head \{[^}]*sticky/.test(cssSrc) && /#sheetBody:has\(> \.sheet-frame\)/.test(cssSrc) && !/:has\(> \.sheet-band\)/.test(cssSrc));
        check('Stage 5d: "Start from the automatic layout" keeps the identity rows and ledger figures too', /keepId = sheetList\('identity'\), keepLed = sheetList\('ledger'\)[\s\S]{0,900}?draft\.sheet\.identity = keepId; if \(keepLed\.length\) draft\.sheet\.ledger = keepLed;/.test(require('./checkkit').part('sysedlayout.js')));
    }

    /* ---- Stage 5e: the gradient slider — a display option on a ranged number ---- */
    {
        const sl = (o) => cleanField(Object.assign({ id: 'f_al', key: 'Align', kind: 'number', def: 0, min: -100, max: 100, vis: 'all' }, o), F, true);
        check('Stage 5e: slider: true on a ranged number keeps an empty slider object (the defaults)', j(sl({ slider: true }).slider) === j({}), j(sl({ slider: true })));
        const rich = sl({ slider: { low: '  Dusk\u0001Pole ', high: 'x'.repeat(80), lowColor: '#FF0000', highColor: 'nope', evil: '<script>', onclick: 1 } });
        check('Stage 5e: end labels are capped and control-stripped, colors hex-validated and lowercased, anything else dropped', j(rich.slider) === j({ low: 'Dusk Pole', high: 'x'.repeat(LIMITS.label), lowColor: '#ff0000' }), j(rich.slider));
        {   // 1.5.4: a middle color (the owner, 2026-10-17, of the Ether Alignment track the website draws red, gray, blue): kept hex-validated and lowercased beside the two ends, in the cleaner's order; none, or one that is no color, keeps the track as it was
            const mid = sl({ slider: { low: 'D', high: 'L', lowColor: '#EB1E1E', midColor: '#757575', highColor: '#327df5' } }), badMid = sl({ slider: { lowColor: '#eb1e1e', midColor: 'grey', highColor: '#327df5' } });
            const shM = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8');
            check('1.5.4 a slider\'s middle color: kept hex-validated and lowercased (#EB1E1E as #eb1e1e) with the two ends, one that is no color dropped; the sheet draws the track low, middle, high only where it has one (and as before where it has none); the System editor offers the Middle color swatch, its input stores it, and Theme colors takes all three off',
                j(mid.slider) === j({ low: 'D', high: 'L', lowColor: '#eb1e1e', midColor: '#757575', highColor: '#327df5' }) && j(badMid.slider) === j({ lowColor: '#eb1e1e', highColor: '#327df5' })
                && shM.includes("(f.slider.midColor ? f.slider.midColor + ', ' : '')") && shM.includes("['midColor', 'Middle color', '#757575']") && require('./checkkit').part('sysedtabs.js').includes("f.slider.midColor = t.value;") && require('./checkkit').part('sysedtabs.js').includes('delete item.slider.lowColor; delete item.slider.midColor; delete item.slider.highColor;'), j([mid.slider, badMid.slider]));
        }
        check('Stage 5e: a slider is kept on a number before it has a min and a max (the sheet draws it once both exist, so nothing set is lost on Save); none on other kinds, none from a non-object non-true value', j(sl({ max: undefined, slider: { low: 'A', lowColor: '#102030' } }).slider) === j({ low: 'A', lowColor: '#102030' }) && j(sl({ min: undefined, max: undefined, slider: true }).slider) === j({}) && sl({ slider: 'yes' }).slider === undefined && sl({ slider: 1 }).slider === undefined
            && cleanField({ id: 'f_s', key: 'Sw', kind: 'skill', def: 0, min: 0, max: 10, vis: 'all', slider: true }, F, true).slider === undefined && cleanField({ id: 'f_r', key: 'HP', kind: 'resource', maxFormula: '10', def: 'max', min: 0, vis: 'all', slider: true }, F, true).slider === undefined);
        const plSl = cleanSystem({ v: 1, name: 'S', fields: [{ id: 'f_al', key: 'Align', kind: 'number', def: 0, min: -100, max: 100, vis: 'all', slider: { low: 'Dark', high: 'Light' } }], rolls: [], sheet: { sections: [] } }, { F, gmView: false });
        check('Stage 5e: the slider travels in the players\' view and the field is still a plain number to the resolver', j(plSl.fields[0].slider) === j({ low: 'Dark', high: 'Light' }) && resolveAll(plSl, { id: 'c_s', name: 'S', ownerId: '', npc: false, values: { f_al: -40 } }, F).f_al.text === '-40');
        const shSrc3 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), cssSrc3 = fs.readFileSync(path.join(app, 'style.css'), 'utf8');
        check('Stage 5e: the range coalesces its commits (a change per arrow step → one edit after the last) and never re-sends an unchanged value', /rg\.addEventListener\('change', function\(\) \{ clearTimeout\(rgTimer\); rgTimer = setTimeout\(function\(\) \{ if \(rg\.value === rgSent\) return;/.test(shSrc3) && /if \(k === 'number' && f\.slider && f\.min !== undefined && f\.max !== undefined\)/.test(shSrc3));
        check('Stage 5e: the slider row keeps a compact number box (beats input.field width:100%), wraps in a narrow cell, and a tile gives the wrapper an auto basis', /\.sheet-has-slider \.sheet-num \{ flex: 0 0 auto; width: 64px; \}/.test(cssSrc3) && /\.sheet-has-slider \.sheet-ctl \{ align-items: flex-end; flex-wrap: wrap; \}/.test(cssSrc3) && /\.sheet-field\.sheet-tile\.sheet-has-slider \.sheet-slider \{ flex: 0 0 auto;/.test(cssSrc3));
        check('Stage 5e: the sheet renders a ranged number with a slider as a range input on a gradient track beside the number box, and the editor offers the Slider flag with its labels and colors', /if \(k === 'number' && f\.slider && f\.min !== undefined && f\.max !== undefined\)[\s\S]{0,900}?'sheet-range'[\s\S]{0,600}?rg\.dataset\.part = 'range'[\s\S]{0,400}?linear-gradient\(90deg, /.test(shSrc3) && /sys-slider-chk/.test(shSrc3) && /sys-slider-lowColor[\s\S]{0,600}?sys-slider-low'\) >= 0/.test(require('./checkkit').part('sysedtabs.js')));
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
        check('Stage 5f: validPageId is published and refuses prototype names, over-long and odd ids', S.validPageId && S.validPageId('doc_tut_handbook') && S.validPageId('map_oceana:tide-1.b') && !S.validPageId('__proto__') && !S.validPageId('constructor') && !S.validPageId('a b') && !S.validPageId('x'.repeat(81)) && !S.validPageId('') && !S.validPageId(null));
        const shSrc5 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), netSrc5 = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8');
        check('Stage 5f: the host filters by page visibility in BOTH players\' views (playerSystem and the join snapshot), failing closed', /var pages = readablePages\(camp\), key = [^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n\s*if \(_pvMemo\.key !== key\) \{ var v = cleanSystem\(camp\.system, \{ F: F\(\), gmView: false, pages: pages, libCats: lcs, needShown: nsh, ruleShown: rsh, libWait: [^\n]*\}\);/.test(shSrc5) && /gmView: false, pages: \(window\.wpSheets && window\.wpSheets\.readablePages\) \? window\.wpSheets\.readablePages\(camp\) : \[\], libCats: /.test(require('./checkkit').part('netfog.js')) && shSrc5.includes("if (it && it.type === 'doc' && !(typeof pageGmOnly === 'function' ? pageGmOnly(items, id) : !!(it.meta && it.meta.players === false))) out.push(id);"));   // 1.5.6: moved on purpose, a page nested under a GM-only page is not readable either (docrender pageHid)
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
        check('Stage 5g: an accent (sheet or section color) with anything before or after the six hex digits is dropped — no url() can reach a background', gJunk.every(x => !('look' in x.sheet) && !('style' in x.sheet.sections[0])), j(gJunk.map(x => [x.sheet.look, x.sheet.sections[0].style])));
        const gCp = mk5g({ tabs: [{ id: 't_a', label: 'A', icon: '\u0001'.repeat(63) + '\uD83D\uDEE1' }], sections: [] }), gCpF = cleanSystem({ v: 1, name: 'U', fields: [{ id: 'f_u1', key: 'U1', kind: 'number', def: 0, vis: 'all', unit: 'credits\uD83D\uDCB0' }, { id: 'f_u2', key: 'U2', kind: 'number', def: 0, vis: 'all', unit: 'creditss\uD83D\uDCB0' }, { id: 'f_u3', key: 'U3', kind: 'number', def: 0, vis: 'all', unit: 'ab\uD83D' }], rolls: [] }, { F, gmView: true });
        check('Stage 5g: units and icons are cut by code points after control characters go — an emoji is kept whole or dropped whole, a lone surrogate never survives',
            gCp.sheet.tabs[0].icon === '\uD83D\uDEE1' && gCpF.fields[0].unit === 'credits\uD83D\uDCB0' && gCpF.fields[1].unit === 'creditss' && gCpF.fields[2].unit === 'ab', j([gCp.sheet.tabs[0].icon, gCpF.fields.map(f => f.unit)]));
        const gTrim = mk5g({ tabs: [{ id: 't_a', label: 'A', icon: '        \u2694' }], sections: [] }), gTrimF = cleanSystem({ v: 1, name: 'T', fields: [{ id: 'f_t1', key: 'T1', kind: 'number', def: 0, vis: 'all', unit: ' per turn' }, { id: 'f_t2', key: 'T2', kind: 'number', def: 0, vis: 'all', unit: '\u0001\u0001credits' }], rolls: [] }, { F, gmView: true });
        check('Stage 5g: leading spaces and control characters never use up an icon\'s or a unit\'s 8 code points', gTrim.sheet.tabs[0].icon === '\u2694' && gTrimF.fields[0].unit === 'per turn' && gTrimF.fields[1].unit === 'credits', j([gTrim.sheet.tabs[0].icon, gTrimF.fields.map(f => f.unit)]));
        check('Stage 5g: "no stripe" is kept only as false and only beside an accent', j(SS[0].style) === j({ accent: '#aabbcc', stripe: false }) && j(SS[1].style) === j({ bg: '#112233' }) && j(SS[2].style) === j({ accent: '#aabbcc' }), j(SS.map(s => s.style)));
        const GF = id => g.fields.find(f => f.id === id);
        check('Stage 5g: a unit is kept on number/formula/skill/resource (control-stripped, trimmed, capped at 8); ± color on number/formula/skill only; neither on text or a toggle',
            GF('f_pts').unit === 'pts' && GF('f_pts').sign === true && GF('f_fm').unit === 'kg' && GF('f_fm').sign === true && GF('f_res').unit === 'xxxxxxxx' && !('sign' in GF('f_res'))
            && !('unit' in GF('f_txt')) && !('sign' in GF('f_txt')) && !('unit' in GF('f_tg')) && !('sign' in GF('f_tg')), j(g.fields.map(f => [f.id, f.unit, f.sign])));
        const HE5 = S.headerEntry;
        check('Stage 5g: headerEntry appends the unit, marks a positive only on a field colored by sign (zero stays plain, a negative is red either way), and keeps an empty text as a dash',
            j(HE5(GF('f_pts'), { value: 5, text: '5' })) === j({ text: '5 pts', pos: true }) && j(HE5(GF('f_pts'), { value: 0, text: '0' })) === j({ text: '0 pts' })
            && j(HE5(GF('f_fm'), { value: -4, text: '-4' })) === j({ text: '-4 kg', neg: true }) && j(HE5({ kind: 'number', label: 'N' }, { value: 3, text: '3' })) === j({ text: '3' })
            && j(HE5({ kind: 'number', label: 'N' }, { value: -3, text: '-3' })) === j({ text: '-3', neg: true }) && j(HE5(GF('f_txt'), { value: '', text: '' })) === j({ text: '\u2014', empty: true }),
            j([HE5(GF('f_pts'), { value: 5, text: '5' }), HE5(GF('f_txt'), { value: '', text: '' })]));
        const sh5 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), css5 = fs.readFileSync(path.join(app, 'style.css'), 'utf8');
        const hb5 = sh5.slice(sh5.indexOf('function headerBlocks('), sh5.indexOf('function buildSections('));
        check('Stage 5g: a ledger number is a live box only for whoever may edit it (the section\'s own rule, never on another player\'s copy or an error) and commits like the section\'s; the portrait comes through imgSrc; nothing reaches innerHTML',
            /if \(ledger && f\.kind === 'number' && !f\.labels && !en\.error && !c\.partial && !\(all\[f\.id\] && all\[f\.id\]\.over\) && openF\(f\) && \(gm \|\| \(own && f\.vis === 'all' && \(f\.edit === 'owner' \|\| c\.making === 1 \|\| c\.unlocked === 1\)\)\)\)[\s\S]{0,900}?inp\.addEventListener\('change', function\(\) \{ commit\(c, f, Number\(inp\.value\)\); \}\);/.test(hb5)
            && /inp\.dataset\.part = 'hdr';/.test(hb5) && /im\.src = imgSrc\(c\.portrait\);/.test(hb5) && !/innerHTML/.test(hb5) && /block\(sh\.identity, 'sheet-identity', 'sheet-identity-item', false\);/.test(hb5));
        check('Stage 5g: the head and the frame take the sheet look\'s colors through --sheet-ink/--sheet-bg, removed again when the look has none; the accent is a variable set only when the look has one',
            /pair = !!\(style && HEXC\.test\(style\.textColor \|\| ''\) && HEXC\.test\(style\.bgColor \|\| ''\)\);\s*if \(pair\) \{ node\.style\.setProperty\('--sheet-ink', style\.textColor\); node\.style\.setProperty\('--sheet-bg', style\.bgColor\);[\s\S]{0,200}?else \{ node\.style\.removeProperty\('--sheet-ink'\); node\.style\.removeProperty\('--sheet-bg'\); node\.style\.removeProperty\('--sheet-dim'\); \}/.test(sh5)
            && /if \(typeof look\.accent === 'string' && \/\^#\[0-9a-fA-F\]\{6\}\$\/\.test\(look\.accent\)\) \{ body\.style\.setProperty\('--sheet-accent', look\.accent\);[\s\S]{0,300}?else \{ body\.style\.removeProperty\('--sheet-accent'\); body\.style\.removeProperty\('--sheet-accent-ink'\); \}/.test(sh5)
            && /\.sheet-frame \.sheet-tab:not\(\.active\) \{ color: var\(--sheet-dim, var\(--dim\)\); \}/.test(css5) && /\.sheet-frame \.sheet-value:not\(\.sheet-pos\):not\(\.sheet-neg\):not\(\.sheet-err\), \.sheet-frame \.sheet-tab:not\(\.active\):hover \{ color: var\(--sheet-ink, var\(--ink\)\); \}/.test(css5)
            && /\.sheet-head, \.sheet-frame \{ margin: 0 -10px; background: var\(--sheet-bg, var\(--panel2\)\); color: var\(--sheet-ink, var\(--ink\)\);/.test(css5) && /\.sheet-tab\.active \{ color: var\(--sheet-accent, var\(--gold\)\);/.test(css5));
        check('Stage 5g: the pop-out cleans the raw save (system and character) before rendering, so its sinks see validated values like the panel\'s', /var sys = cleanSystem\(raw, \{ F: F\(\), gmView: true \}\), c = sys \? cleanChar\(c0, sys\) : null;\s*if \(!sys \|\| !c\) return null;[\s\S]{0,1200}?_fxLive = !!PA; try \{ buildSections\(container, sys, c,/.test(sh5)   /* 1.6.3 (finding 25, moved on purpose): live where its main window answers */ && /import \{[^}]*\bcleanChar\b[^}]*\} from '\.\/systemcore\.js';/.test(sh5));
        const aInk = (() => { const src = sh5.slice(sh5.indexOf('function accentInk('), sh5.indexOf('function buildSections(')); return new Function(src + '; return accentInk;')(); })();
        check('Stage 5g: the open filled tab\'s label picks near-black on a light accent and white on a dark one', aInk('#e0a54f') === '#111318' && aInk('#4db3d3') === '#111318' && aInk('#7a1f1f') === '#ffffff' && aInk('#101010') === '#ffffff', [aInk('#e0a54f'), aInk('#7a1f1f')].join());
        check('Stage 5g: inside the head and the frame, transparent buttons, slider ends, the GM marker, the open underlined tab and the name follow a look pair (the fallbacks are the old theme values); the filled open tab keeps its own ink; the ledger box shows focus',
            /\.sheet-head \.tool\.ghost, \.sheet-frame \.tool\.ghost, \.sheet-head \.tool\.ghost:hover, \.sheet-frame \.tool\.ghost:hover \{ color: var\(--sheet-ink, var\(--ink\)\); \}/.test(css5) && /\.sheet-frame \.sheet-slider-ends \{ color: var\(--sheet-dim, var\(--dim\)\); \}/.test(css5)
            && /\.sheet-frame \.sheet-tabs:not\(\.sheet-tabs-filled\) > \.sheet-tab\.active \{ color: var\(--sheet-accent, var\(--sheet-ink, var\(--gold\)\)\);/.test(css5) && /\.sheet-head-name \{[^}]*color: var\(--sheet-accent, var\(--sheet-ink, var\(--gold\)\)\);/.test(css5)
            && /\.sheet-hdr-val\.sheet-hdr-edit:focus-within \{ border-color:/.test(css5) && /\.sheet-tabs-filled \.sheet-tab\.active \{ background: var\(--sheet-accent, var\(--gold\)\); color: var\(--sheet-accent-ink, #111318\); \}/.test(css5));
        check('Stage 5g: the item list resolves its definitions from the system being drawn (the pop-out\'s cleaned copy, the preview\'s draft), not the raw campaign', /function fieldNodeBody\(f, c, e, gm, own, sysArg, plc\)/.test(sh5) && /var sysI = sysArg \|\| systemOf\(getActiveCampaign\(\)\)/.test(sh5) && (sh5.match(/fieldNode\([^)]*, gm, own, sys(, all\.vars, pl)?\)/g) || []).length === 2);
        check('Stage 5g: a section is boxed only for a panel, a border or a stripe (an accent with no stripe colors the title alone); headline titles and filled tabs are class-gated',
            /var stripe = !!\(sec\.style && sec\.style\.accent && sec\.style\.stripe !== false\);[\s\S]{0,200}?if \(sec\.style && \(sec\.style\.bg \|\| sec\.style\.border \|\| stripe\)\)/.test(sh5) && /if \(stripe\) s\.style\.borderLeft/.test(sh5)
            && /body\.classList\.toggle\('sheet-titles-headline', look\.titles === 'headline'\);/.test(sh5) && /el\('div', 'sheet-tabs' \+ \(look\.tabs === 'filled' \? ' sheet-tabs-filled' : ''\)\)/.test(sh5)
            && /\.sheet-titles-headline \.sheet-sec-title \{/.test(css5) && /\.sheet-tabs-filled \.sheet-tab\.active \{/.test(css5));
        check('Stage 5g: "Start from the automatic layout" and "Remove your layout" keep the sheet\'s shape (it lives in the Sheet look box); the tab icon edit finds its own row (.sys-row.sys-tab)',
            /var keepLook = [\s\S]{0,200}?draft\.sheet = \{ sections: autoLayout\(cl \|\| draft\)\.sections \}; if \(keepLook\) draft\.sheet\.look = keepLook;/.test(require('./checkkit').part('sysedlayout.js'))
            && /var keepShape = draft\.sheet && draft\.sheet\.look; draft\.sheet = \{ sections: \[\] \}; if \(keepShape\) draft\.sheet\.look = keepShape;/.test(require('./checkkit').part('sysedlayout.js'))
            && /if \(c\.indexOf\('sys-tab-icon'\) >= 0\) \{ var itr = t\.closest && t\.closest\('\.sys-row\.sys-tab'\);/.test(require('./checkkit').part('sysedlayout.js')));
    }

    /* ---- Stage 5g (Fold B): captions, capital labels, a pool's icon / reset / bar, the resizable panel ---- */
    {
        const bf = [
            { id: 'f_st', key: 'ST', kind: 'number', def: 10, vis: 'all', caption: ' Base: {ST * 2} ({Nope}) {d20}\u0001 ' },
            { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '10', vis: 'all', icon: ' \u2764\uFE0F ', reset: true, bar: false, caption: 'x'.repeat(500) },
            { id: 'f_ep', key: 'EP', kind: 'resource', maxFormula: '5', vis: 'all', reset: 'yes', bar: true },
            { id: 'f_n', key: 'N', kind: 'number', def: 1, vis: 'all', icon: '\u2764', reset: true, bar: false }
        ];
        const B = cleanSystem({ v: 1, name: 'FB', fields: bf, rolls: [], sheet: { look: { labels: 'caps' }, sections: [] } }, { F, gmView: true });
        const BF = id => B.fields.find(f => f.id === id);
        check('Fold B: a caption is kept on any kind (control characters out, trimmed, at most 400 code points); a pool keeps an icon, reset only as true, bar only as false; other kinds keep none of them; look.labels "caps"',
            BF('f_st').caption === 'Base: {ST * 2} ({Nope}) {d20}' && BF('f_hp').caption.length === 400 && BF('f_hp').icon === '\u2764\uFE0F' && BF('f_hp').reset === true && BF('f_hp').bar === false
            && !('reset' in BF('f_ep')) && !('bar' in BF('f_ep')) && !('icon' in BF('f_n')) && !('reset' in BF('f_n')) && !('bar' in BF('f_n')) && B.sheet.look && B.sheet.look.labels === 'caps', JSON.stringify(B.fields));
        const cp = S.captionParts(B, { id: 'c', name: 'C', values: { f_st: 12 } }, F, BF('f_st').caption);
        check('Fold B: captionParts works each {formula} out for the character (no dice; an unknown name or a die is an error part, never thrown) and keeps the text around them',
            cp.length === 6 && cp[0].text === 'Base: ' && cp[1].value === 24 && cp[1].text === '24' && cp[2].text === ' (' && typeof cp[3].error === 'string' && cp[4].text === ') ' && typeof cp[5].error === 'string', JSON.stringify(cp));
        const many = S.captionParts(B, { id: 'c', name: 'C', values: {} }, F, Array.from({ length: 82 }, (_, i) => '{' + i + '}').join(' '));
        check('Fold B: at most 80 {formula} values in one caption (8 before 1.6.2; the rest stays text); an empty caption is no parts', many.filter(p => p.value !== undefined).length === 80 && many[many.length - 1].text === ' {80} {81}' && S.captionParts(B, {}, F, '').length === 0, JSON.stringify(many.slice(-2)));
        const shB = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), cssB = fs.readFileSync(path.join(app, 'style.css'), 'utf8'), htB = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        check('Fold B: a caption is drawn as text nodes only (no markup), hidden in the band; capital labels are class-gated', /function captionNode\(text, sys, c, vars\) \{[\s\S]{0,600}?document\.createTextNode\(p\.text\)/.test(shB) && !/function captionNode[\s\S]{0,600}?innerHTML/.test(shB) && /\.sheet-band \.sheet-caption \{ display: none; \}/.test(cssB) && /body\.classList\.toggle\('sheet-labels-caps', look\.labels === 'caps'\);/.test(shB));
        check('Fold B: the ↻ button fills to the max through the same commit as an edit, only for whoever may edit, never with no max or when already full; no bar when turned off',
            /rs\.disabled = !use \|\| max === null \|\| cur === max \|\| fb;[^\n]*\s*rs\.addEventListener\('click', function\(\) \{ if \(max !== null\) commit\(c, f, \{ cur: max \}\); \}\);/.test(shB) && /if \(f\.bar === false\) return box;/.test(shB));
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
        const charIn0 = new Function('net', 'conn', 'msg', 'window', '_charPending', 'charPendingDone', 'state', 'campOf', 'reapplyPending', '_charHost', 'noteHostCopy', 'own', sliceF('// [netcheck:charin-start]', '// [netcheck:charin-end]') + '\nreturn "ran";');
        const ownF = (o, k) => !!o && typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined && o[k] !== null;   // net.js own(), as it is
        const charIn = (...a) => charIn0(...a, Object.create(null), () => {}, ownF);   // Stage 6: the host's last copy is kept on the side (the pending slice's own test below)
        const campC = { id: 'camp1', system: fx1, chars: { c_1: cleanChar({ id: 'c_1', name: 'P', ownerId: 'u_p', values: { f_inv: [{ defId: 'i_a', qty: 1 }] } }, fx1) } };
        const envW = { wpSystemCore: S, wpSheets: { charChanged() {}, charGone() {} } }, netC = { foreign: true, stream: false, syncedPeer: 'host' };
        charIn(netC, { peer: 'host' }, { type: 'charDelta', campId: 'camp1', id: 'c_1', values: { f_inv: [{ defId: 'i_a', qty: 3 }, { defId: 'i_b', qty: 1 }, { defId: 'i_nope', qty: 1 }] } }, envW, {}, () => {}, { appState: { activeCampaignId: 'camp1' } }, id => id === 'camp1' ? campC : null, () => {});
        check('5h F1: a player\'s item list survives a delta from the host (the real client handler, sliced from net.js)', j(campC.chars.c_1.values.f_inv) === j([{ defId: 'i_a', qty: 3 }, { defId: 'i_b', qty: 1 }]), j(campC.chars.c_1.values));
        {   // found during senses S0, (f): a hostile host names a character by a prototype's name in a delta or a removal — nothing is written onto a prototype
            const campP = { id: 'camp1', system: fx1, chars: { c_1: cleanChar({ id: 'c_1', name: 'P', ownerId: 'u_p', values: {} }, fx1) } }, stP = { appState: { activeCampaignId: 'camp1', campaigns: { camp1: campP } } };
            const netP = { role: 'client', syncedPeer: 'host', foreign: true, myId: 'u_p' }, envP = { wpSystemCore: S, wpFormula: F, wpSheets: { charChanged() {}, renderSheet() {} } };
            let thrP = ''; ['__proto__', 'constructor', 'toString', 'hasOwnProperty'].forEach(id => { ['charDelta', 'charGone'].forEach(type => { try { charIn(netP, { peer: 'host' }, { type, campId: 'camp1', id, values: { f_inv: [{ defId: 'i_a', qty: 1 }] } }, envP, {}, () => {}, stP, () => campP, () => {}); } catch (e) { thrP += type + ':' + id + ':' + e.message + ' '; } }); });
            check('found during senses S0 (f): a player\'s app takes a character\'s delta or removal from its host only for a character it holds under that very id — a host naming __proto__, constructor, toString or hasOwnProperty writes nothing onto any prototype or built-in, removes nothing and throws nothing; the character it does hold is left as it was',
                thrP === '' && !Object.prototype.hasOwnProperty.call(Object.prototype, 'values') && ({}).values === undefined && /\[native code\]/.test(String(Object.values)) && /\[native code\]/.test(String(Object.prototype.toString)) && !!campP.chars.c_1 && j(Object.keys(campP.chars)) === j(['c_1']), thrP);
        }
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
        check('5h F1: the join snapshot gives a teammate\'s copy the host\'s hover lines too, and a teammate\'s hover card draws them', /withHoverLines\(window\.wpSystemCore\.charFor\(camp\.chars\[id\], camp\.system, recipientId, \{ lib: libFx, items: libIt, full: fullSys \}\), camp\.chars\[id\], camp\.system, libFx, libIt, fullSys\)/.test(require('./checkkit').part('netfog.js')) && /if \(c\.partial && Array\.isArray\(c\.lines\)\) return c\.lines\.slice\(\);/.test(shF1));
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
            j(rowsOut) === j([{ id: 'x_1', ref: 'e_rage', on: true }, { id: 'x_5', name: 'Shaken', icon: '', tone: 'debuff', dur: '', notes: '', on: false, mods: [{ f: 'f_dx', op: 'add', v: -1 }] }]) && cleanValue(fxF, Array.from({ length: 320 }, (_, i) => ({ id: 'x_r' + i, name: 'E' + i })), vo5).length === 300, j(rowsOut));
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
            again.ok && j(again.value) === j([{ id: 'x_1', ref: 'e_rage', on: true, t: { left: 18, at: 0 } }]) && endBless.ok && endBless.value.length === 0 && endBless.clamp && j(endBless.clamp.f_hp) === j({ cur: 10 }), j([again, endBless]));
        check('5h: switching and ending need an existing row; a plain edit can never set an effects list', !S.applyEffectOp(GM5, cP, 'f_fx', { op: 'on', rowId: 'x_404', on: false }, F, {}).ok && S.applyEffectOp(GM5, cP, 'f_fx', { op: 'on', rowId: 'x_1', on: false }, F, {}).value[0].on === false && !S.applyEdit(GM5, cP, 'f_fx', [], F, {}).ok);
        // the projection: the owner gets a GM-only effect inline, a teammate names only
        const cc = { id: 'c_1', name: 'P', ownerId: 'u_p', npc: false, values: { f_fx: [{ id: 'x_1', ref: 'e_rage', on: true }, { id: 'x_2', ref: 'e_curse', on: true }] } };
        const libAll = {}; GM5.effects.forEach(d => { libAll[d.id] = d; });
        const own = S.charFor(cc, PL5, 'u_p', { lib: libAll }), mate = S.charFor(cc, PL5, 'u_m', { lib: libAll });
        check('5h: the owner holds a visible effect as a reference and a GM-only one inline (changes to GM-only fields removed); a teammate gets the names of the effects in the players\' view only — never a GM-only effect\'s name, icon or tone (secrets, R2 #17: the C1 rule, "a GM-only effect only you see", holds on a teammate\'s copy as on the token)',
            j(own.values.f_fx[0]) === j({ id: 'x_1', ref: 'e_rage', on: true }) && own.values.f_fx[1].name === 'Curse' && j(own.values.f_fx[1].mods) === j([{ f: 'f_st', op: 'add', v: -3 }]) && !('ref' in own.values.f_fx[1])
            && mate.values.f_fx.every(r => j(r.mods) === '[]' && !('ref' in r)) && mate.values.f_fx.map(r => r.name).join() === 'Rage' && !j(mate).includes('Curse') && !j(mate).includes('x_2'), j([own.values.f_fx, mate.values.f_fx]));
        const mateAd = S.charFor({ id: 'c_1', name: 'P', ownerId: 'u_p', npc: false, values: { f_fx: [{ id: 'x_3', name: 'Peek', icon: 'P', tone: 'buff', mods: [{ f: 'f_st', op: 'add', v: 1 }] }, { id: 'x_4', ref: 'e_zz', on: true }] } }, PL5, 'u_m', { lib: libAll });
        const hlMate = S.hoverLines(PL5, own, F, undefined, mate.values), hlMateNone = S.hoverLines(PL5, own, F, undefined, {}), hlOwn = S.hoverLines(PL5, own, F);
        check('secrets: a teammate\'s ad hoc row still reaches them by name (never its changes), a row with no definition anywhere is dropped; hoverLines given the recipient\'s own rows (a fifth argument) names only those on the Effects line while the numbers stay the character\'s (HP 9, the GM-only Curse counted), none when the recipient holds no rows, and without the argument reads the character\'s rows as before',
            mateAd.values.f_fx.map(r => r.name).join() === 'Peek' && j(mateAd.values.f_fx[0].mods) === '[]' && hlMate.includes('Effects Rage') && !hlMate.some(l => /Curse/.test(l)) && hlMate.filter(l => !/^Effects/.test(l)).join('|') === hlOwn.filter(l => !/^Effects/.test(l)).join('|') && hlOwn.some(l => /^HP 9/.test(l)) && !hlMateNone.some(l => /^Effects/.test(l)) && hlMateNone.filter(l => !/^Effects/.test(l)).join('|') === hlOwn.filter(l => !/^Effects/.test(l)).join('|') && hlOwn.includes('Effects Rage, Curse'), j([mateAd.values, hlMate, hlMateNone, hlOwn]));
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
        {   // 1.5.8, book handoff 90 Part B: what changed the values a roll reads, for its card (systemcore rollMods, run for real)
            const rvM = S.makeResolver(GM5, cc, F); rvM('ST');
            const mdM = S.rollMods(rvM, [{ name: 'ST', value: 9 }, { name: 'ST', value: 9 }, { name: 'Nope', value: 3 }, { name: 'ST', value: true }, 'x']);
            const rvR = S.makeResolver(GM5, ch5([{ id: 'x_1', ref: 'e_rage', on: true }]), F); rvR('ST');
            const mdR = S.rollMods(rvR, [{ name: 'ST', value: 12 }]), mdNone = S.rollMods(S.makeResolver(GM5, ch5([]), F), [{ name: 'ST', value: 10 }]);
            const stub = n => null; stub.detail = () => ({ base: 5, mods: [{ name: 'A', op: 'add', v: 2, gm: false }, { name: 'A', op: 'add', v: 2, gm: false }, { name: 'On', op: 'on', v: 0, gm: false }, { name: '\u0007', op: 'add', v: 1 }], via: [{ through: 'DX', name: 'B', op: 'add', v: -1, gm: false }] });
            const mdS = S.rollMods(stub, [{ name: 'Skill', value: 6 }]);
            check('1.5.8 a roll\'s card names what changed the values it reads (rollMods, run for real): each name an effect changed once, its figure before and after the effects on it and each such change by its source; a GM-only effect never named, its amount left in the figure before (ST 9: Rage +2 shown, 7 before, the Curse folded in); an effect on a value it is worked out from listed apart with what it changed, inside the figure before; a toggle switched on, a name with no change, a value that is no number and a source with no name passed over; none with no change',
                j(mdM) === j([{ n: 'ST', b: 7, a: 9, m: [{ s: 'Rage', v: 2 }] }]) && j(mdR) === j([{ n: 'ST', b: 10, a: 12, m: [{ s: 'Rage', v: 2 }] }]) && mdNone === null
                && j(mdS) === j([{ n: 'Skill', b: 4, a: 6, m: [{ s: 'A', v: 2 }], w: [{ s: 'B', v: -1, t: 'DX' }] }]) && S.rollMods(null, []) === null && S.rollMods(stub, 'x') === null, j([mdM, mdR, mdNone, mdS]));
        }
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
        const shX = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), fxSrc = shX.slice(shX.indexOf('function effectsInto('), shX.indexOf('// Stage 5g: a value colored by its sign'));
        check('5h review UI: the mark\'s direction is the value against its true base; controls are dead in the Layout preview and the pop-out; the New… form survives a re-render; revert restores a clamped pool; a number box is toned by what it shows',
            /var dir = \(typeof v === 'number' && typeof b === 'number'\) \? \(v > b \? 'up' : v < b \? 'down' : 'same'\) : 'same';/.test(shX) && (shX.match(/(?:_fxLive = false|_fxLive = !!PA|fxLiveSet\(false\)); try \{ buildSections\(/g) || []).length === 2 && /editable = editable && _fxLive;/.test(shX)
            && /if \(_fxForm && _fxForm\.charId === c\.id && _fxForm\.fieldId === f\.id\)/.test(shX) && /if \(lastChange\.extra\) Object\.keys\(lastChange\.extra\)/.test(shX) && /signTone\(f, \{ value: Number\(inp\.value\) \}\)/.test(shX));
        check('5h UI: the effects list and its form draw text only (no markup), the editor\'s field dispatch skips effect rows, and every value from the host is re-cleaned against the players\' ids',
            fxSrc.length > 1000 && !/innerHTML/.test(fxSrc) && /row\.dataset\.cid \|\| row\.dataset\.iid \|\| row\.dataset\.eid\) return null;/.test(require('./checkkit').part('sysedtabs.js')) && /SC2\.cleanValue\(f, msg\.values\[fid\], SC2\.valueOpts\(sysC\)\)/.test(netSrcX));
    }

    /* ---- Stage 6 Fold 0/1: the bridge reads text skill levels; value names; signed caption values; the bigger caps ---- */
    {
        check('6 F1: room for 1000 sections and 8000 placements a layout, and 6000 fields (1.6.2, the owner: "Safety ceilings only"; 100, 800 and 600 before, moved on purpose)', LIMITS.sections === 1000 && LIMITS.placements === 8000 && LIMITS.fields === 6000 && LIMITS.labels === 640);
        const lf = cleanField({ id: 'f_stun', key: 'Stun', kind: 'number', def: 7, min: -5, max: 99, step: 0.5, labels: ['Not stunned', 'Physical\u0007', ' Mental ', 5, ''], vis: 'all' }, F, true);
        check('6 F1: a number with value names keeps them cleaned (control characters, trimmed, a non-string kept as a blank place, trailing blanks dropped) and takes their range: 0..n-1, step 1, the default clamped',
            lf && j(lf.labels) === j(['Not stunned', 'Physical', 'Mental']) && lf.min === 0 && lf.max === 2 && lf.step === 1 && lf.def === 2, j(lf));
        const lf2 = cleanField({ id: 'f_x', key: 'X', kind: 'number', labels: Array.from({ length: 650 }, (_, i) => 'L' + i + 'x'.repeat(80)) }, F, true), lf3 = cleanField({ id: 'f_t', key: 'T', kind: 'text', labels: ['a'] }, F, true), lf4 = cleanField({ id: 'f_y', key: 'Y', kind: 'number', labels: ['', ' '] }, F, true);
        check('6 F1: value names are capped (640 since 1.6.2, 32 since 1.6.0, 10 before; each 60 characters), ignored on a kind that cannot show them, and absent when all are blank', LIMITS.labels === 640 && lf2.labels.length === 640 && lf2.labels.every(s => s.length <= 60) && !('labels' in lf3) && !('labels' in lf4) && lf4.max === undefined);
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
        const gmCap = { v: 1, name: 'G', fields: [{ id: 'f_sec', key: 'Secret', kind: 'number', def: 3, vis: 'gm' }, { id: 'f_a', key: 'A', kind: 'number', def: 1, vis: 'all', caption: 'Sign {\u00b1Secret}' }, { id: 'f_b', key: 'B', kind: 'number', def: 1, vis: 'all', caption: '{A}'.repeat(80) + ' then {Secret}' }, { id: 'f_c', key: 'C', kind: 'number', def: 1, vis: 'all', caption: 'Fine {\u00b1A}' }], rolls: [] };
        const plC = cleanSystem(gmCap, { F, gmView: false });
        check('6 F1: the players\' view drops a caption naming a GM-only field inside {\u00b1…}, and one naming it past the drawn values; a clean signed caption stays', !('caption' in plC.fields.find(f => f.id === 'f_a')) && !('caption' in plC.fields.find(f => f.id === 'f_b')) && plC.fields.find(f => f.id === 'f_c').caption === 'Fine {\u00b1A}', j(plC.fields));
        // review fixes
        const failC = { v: 1, name: 'G', fields: [{ id: 'f_sec', key: 'Secret', kind: 'number', def: 3, vis: 'gm' }, { id: 'f_a', key: 'A', kind: 'number', def: 1, vis: 'all', caption: 'x {Secret +}' }, { id: 'f_b', key: 'B', kind: 'number', def: 1, vis: 'all', caption: 'x {\u00b1\u00b1Secret}' }, { id: 'f_c', key: 'C', kind: 'number', def: 1, vis: 'all', caption: 'x {max(Secret)' }, { id: 'f_d', key: 'D', kind: 'formula', formula: 'Secret +', vis: 'all' }, { id: 'f_e', key: 'E', kind: 'number', def: 1, vis: 'all', caption: 'Plain words about secrets {A}' }], rolls: [{ id: 'r_x', label: 'X', formula: '3d6 + Secret +', vis: 'all' }] };
        const plF = cleanSystem(failC, { F, gmView: false }), fld = id => plF.fields.find(f => f.id === id);
        check('6 F1 review: the players\' view fails closed — a {…} that does not parse ({Secret +}, {\u00b1\u00b1Secret}, an unclosed {max(Secret)) drops its caption, a broken formula naming a GM-only field reads "GM only", a broken roll is dropped; prose outside braces is not a name',
            !('caption' in fld('f_a')) && !('caption' in fld('f_b')) && !('caption' in fld('f_c')) && fld('f_d').formula === null && !plF.rolls.some(r => r.id === 'r_x') && fld('f_e').caption === 'Plain words about secrets {A}', j(plF));
        const ninth = validateSystem(cleanSystem(gmCap, { F, gmView: true }), F);
        check('6 F1 review: the validator warns about a GM-only name in any {…} of a caption (the 81st too) and that values past the 80th show as written', ninth.warnings.some(w => w.id === 'f_b' && /GM only/.test(w.message)) && ninth.warnings.some(w => w.id === 'f_b' && /only the first 80/.test(w.message)), j(ninth.warnings));
        const tiny = cleanSystem({ v: 1, name: 'T', fields: [{ id: 'f_a', key: 'A', kind: 'number', def: -0.001, step: 0.001, vis: 'all' }], rolls: [] }, { F, gmView: true });
        check('6 F1 review: a signed caption takes its sign from what is printed ({\u00b1A} with A = -0.001 reads +0, never -0)', S.captionParts(tiny, { id: 'c_1', values: {} }, F, '{\u00b1A}').map(p => p.text).join('') === '+0');
        check('6 F1 review: a value name never holds a comma (the editor\'s separator), so a round trip keeps every name in its place', j(cleanField({ id: 'f_x', key: 'X', kind: 'number', labels: ['Stunned, physical', '', 'Out'] }, F, true).labels) === j(['Stunned physical', '', 'Out']));
        check('6 F1 review: a named value is a word — no unit after it in the header', S.headerEntry(Object.assign({}, nsys.fields[1], { unit: 'kg' }), nr1.f_enc).text === 'Medium');
        const sh6 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8');
        check('6 F1 review UI: a stored value past the names shows as its number in the dropdown; a saved system re-checks every character\'s values before the sync; a named value is never toned or given a unit; namesFacing reads {\u00b1…}; the editor keeps blank places and redraws only the default cell',
            /if \(!\(curL === Math\.floor\(curL\) && curL >= 0 && curL < f\.labels\.length\)\)/.test(sh6) && /camp\.system = clean;\n    reCleanChars\(camp, clean\);/.test(require('./checkkit').part('sysederr.js')) && /e\.error \|\| e\.label \|\| typeof e\.value/.test(sh6)
            && /hit\(capExpr\(m\[1\]\)\.expr\)/.test(sh6) && /while \(vn\.length && !vn\[vn\.length - 1\]\) vn\.pop\(\);/.test(require('./checkkit').part('sysedtabs.js')) && /if \(dcV\) buildDefCell\(dcV, f\);/.test(require('./checkkit').part('sysedtabs.js')));
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
        const ptP = require('./checkkit').part('netfog.js'), iP = ptP.indexOf('// [netcheck:patch-start]'), kP = ptP.indexOf('// [netcheck:patch-end]');   // in netfog.js, a part of net.js
        const mkCamp = () => ({ id: 'camp1', items: { m1: { type: 'map', whiteboard: [{ id: 't1', isChar: true, charId: 'c_1', ownerId: 'u_p', x: 10, y: 10, rot: 0, front: 0 }, { id: 't2', isChar: true, charId: 'c_2', ownerId: 'u_q', x: 50, y: 50, rot: 0, front: 0, threats: [60] }] } } });
        const runP = (camp, wb, on) => new Function('state', 'window', 'playerStroke', 'cleanElevation', 'cleanPosture', 'msg', 'prof', ownLines(netSrcP) + ptP.slice(iP, kP) + '\nreturn applyClientItemFiltered(msg, prof);')(
            { appState: { campaigns: { camp1: camp } } }, { wpVtt: { campaignOn: k => k !== 'turning' || on }, wpSystemCore: S }, () => null, v => Number(v) || 0, v => typeof v === 'string' ? v : '', { campId: 'camp1', itemId: 'm1', item: { whiteboard: wb } }, { id: 'u_p' });
        const c1 = mkCamp(), ch1 = runP(c1, [{ id: 't1', x: 10, y: 10, rot: 0, front: 0, threats: [120, 180] }, { id: 't2', x: 50, y: 50, rot: 0, front: 0 }], true);
        const c3 = mkCamp(); c3.items.m1.whiteboard[0].threats = [120]; const ch3 = runP(c3, [{ id: 't1', x: 10, y: 10, rot: 0, front: 0 }], true);
        const c4 = mkCamp(); Object.assign(c4.items.m1.whiteboard[0], { hidden: true, front: 90, elevation: 3, threats: [120] }); const ch4 = runP(c4, [{ id: 't1', type: 'rect', hidden: true, x: 10, y: 10, rot: 0, locked: true }], true);
        check('5h F3 host: a map patch never carries threat marks (a stale copy cannot undo the GM\'s: they come as their own message), and a hidden token\'s stub never overwrites the host\'s token (front, stance, marks kept) — the real applyClientItemFiltered, sliced from net.js',
            iP > 0 && kP > iP && ch1 === false && !('threats' in c1.items.m1.whiteboard[0]) && j(c1.items.m1.whiteboard[1].threats) === '[60]' && ch3 === false && j(c3.items.m1.whiteboard[0].threats) === '[120]'
            && ch4 === false && c4.items.m1.whiteboard[0].front === 90 && c4.items.m1.whiteboard[0].elevation === 3 && j(c4.items.m1.whiteboard[0].threats) === '[120]', j([c1.items.m1.whiteboard, c3.items.m1.whiteboard[0], c4.items.m1.whiteboard[0]]));
        const shF3 = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), dialSrc = shF3.slice(shF3.indexOf('function facingNode('), shF3.indexOf('function tokenTurned('));
        check('5h F3 UI: the dial draws with createElementNS and textContent only (no markup), is live only on the real sheet for the GM or the token\'s own unpaused player (never on a token the GM locked), and acts only through the whiteboard setters; the sheet and both roll sites pass the facing context',
            // 1.6.3 (the multiplayer review, finding 15), moved on purpose: a player's reconnect holds the board as a pause does, so each gate below reads net.reconnecting beside the pause and the hold
            dialSrc.length > 1500 && !/innerHTML/.test(dialSrc) && /var n = net\(\), live = _fxLive && \(gm \|\| \(t\.tok\.ownerId === myId\(\) && !t\.tok\.locked && !\(n && \(n\.paused \|\| n\.selfPaused \|\| n\.selfHeld \|\| n\.reconnecting\)\)\)\);[^\n]*\n\s*if \(live\) wrap\.classList\.add\('sheet-dial-live'\);/.test(dialSrc) && /wpSetTokenFacing/.test(dialSrc) && /wpSetTokenThreats/.test(dialSrc)
            && /var all = allFor\('h:' \+ charId, sys, c, camp, tokenCtxFor\(c\.id, camp\)\);/.test(shF3) && /resolveAll\(sys, c, F\(\), tokenCtxFor\(c\.id, camp\)\), gmP, ownP, function\(\) \{ renderSheetInto/.test(shF3)   /* 1.6.3 (finding 25, moved on purpose): the GM's sheet or the player's own */
            && /if \(inSession\) return \(loc && /.test(shF3) && /charTokenOn\(am, c\.id, myId\(\), \{ strict: true \}\)/.test(shF3) && /if \(body && ae && body\.contains\(ae\) && \/\^\(INPUT\|TEXTAREA\|SELECT\)\$\/\.test\(ae\.tagName\) && !committed\)/.test(shF3)
            && /tcQ = SQ\.tokenCtx\(mapQ, SQ\.charTokenOn\(mapQ, q\.charId, tokOwnQ, tokOptQ\), \{ turning: ruleQ\('turning'\), posture: ruleQ\('posture'\), elevation: ruleQ\('elevation'\), viewer: pidQ \}\);/.test(netSrcP) && /varsQ = SQ\.makeResolver\(viewQ, chvQ, Fq, tcQ\);/.test(netSrcP)
            && (netSrcP.match(/delete (mine|there|nw|tok)\.threats;/g) || []).length === 4 && /tcR = window\.wpSheets && window\.wpSheets\.tokenCtxFor \? window\.wpSheets\.tokenCtxFor\(chR\.id, campR\) : null; varsR = SR\.makeResolver\(campR\.system, chR, F, tcR\);/.test(netSrcP));   // range R3: the token context kept as tcR for the privacy check (a deliberate change of this pin)
        const wbF3 = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8');
        check('5h F3: the dial\'s setters turn on the token\'s own map under the arrow\'s rule (a player: their own token, not paused, not locked by the GM; facing on) and end with a final pos, or a whole-map send for a map off screen',
            // 1.6.3 (the multiplayer review, finding 15), moved on purpose: a player's reconnect holds the board as a pause does, so each gate below reads net.reconnecting beside the pause and the hold
            /if \(n && n\.active && n\.role === 'client' && \(n\.paused \|\| n\.selfPaused \|\| n\.selfHeld \|\| n\.reconnecting \|\| tok\.ownerId !== n\.myId \|\| tok\.locked\)\) return null;/.test(wbF3) && /if \(!tok \|\| !tok\.isChar \|\| \(feature !== null && window\.wpVtt && !window\.wpVtt\.on\(feature \|\| 'turning'\)\)\) return null;/.test(wbF3)
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
        const many = []; for (let i = 0; i < 1530; i++) many.push({ id: 'w_m' + i, defId: 'i_rope', qty: 1 });
        check('6 F4a: a list holds at most 1500 rows (150 before 1.6.2)', LIMITS.carried === 1500 && cleanValue(fGear, many, vo4).length === 1500);
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
        const cap1499 = aro({ op: 'add', defId: 'i_boom', rowId: 'w_new' }, P4, capL(1499)), cap1500 = aro({ op: 'add', defId: 'i_boom', rowId: 'w_new' }, P4, capL(1500)), keep1505 = cleanValue(fGear, capL(1500).values.f_gear, vo4);
        check('6 F4a: a kept curse never blocks a visible row of the same item nor counts against the cap the player sees (visible and kept rows are counted apart)', hidVis.length === 2 && cap1499.ok && cap1499.value.filter(r => r.hid !== 1).length === 1500 && cap1500.reason === 'field' && keep1505.length === 1505, j([hidVis, cap1500]));
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
        const itLock = S.cleanItemDef({ id: 'i_q', name: 'A\u0007b\u0007c', category: 'x\u0001y', icon: '\uD83D\uDC09\uD83D\uDC09\uD83D\uDC09\uD83D\uDC09\uD83D\uDC09\uD83D\uDC09\uD83D\uDC09\uD83D\uDC09\uD83D\uDC09', rm: 'bound', rmMsg: 'No\u0001 way' }, F, false), itGm = S.cleanItemDef({ id: 'i_q', name: 'A', rm: 'curse', rmMsg: 'x'.repeat(500) }, F, true);
        check('6 F4a: an item cleans every control character, cuts its icon by code points (never half an emoji); its removal rule and message stay on the GM\'s side (neither in the players\' view, nor on an owner\'s inline copy); an unknown rule is dropped; a message a player receives is cleaned as text',
            itLock.name === 'A b c' && itLock.category === 'x y' && Array.from(itLock.icon).length === 8 && !('rm' in itLock) && !('rmMsg' in itLock) && itGm.rm === 'curse' && itGm.rmMsg.length === 400
            && !('rm' in S.cleanItemDef({ id: 'i_q', name: 'A', rm: 'evil' }, F, true)) && !('rm' in S.cleanItemDef({ id: 'i_q', name: 'A', rm: 'constructor' }, F, true)) && S.cleanItemDef({ id: 'i_q', name: 'A', rm: 'bound', rmMsg: 'No\u0001 way' }, F, true).rmMsg === 'No  way'
            && !('rm' in S.cleanRowDef({ name: 'R', rm: 'bound', rmMsg: 'm' }, false)) && S.cleanRowDef({ name: 'R', rm: 'bound', rmMsg: 'm' }, true).rm === 'bound'
            && S.cleanItemMsg(42) === '' && S.cleanItemMsg(' a\u0007b ') === 'a b' && S.cleanItemMsg('y'.repeat(500)).length === 400, j([itLock, itGm]));
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
        const mkPend = (...a) => new Function('getActiveCampaign', 'SC', 'window', 'toast', '_charPending', '_charHost', 'net', pend + '\nreturn { charPendingDone: charPendingDone, reapplyPending: reapplyPending, noteHostCopy: noteHostCopy };')(...a, { libEntry: () => null });   // L3b: the client's library (none here)
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
        const shG = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), gfS = require('./checkkit').cut('sysedbox.js', '// [systemcheck:gmfacing-start]', '// [systemcheck:gmfacing-end]');
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
            && /select\('sys-item-rmmode'/.test(require('./checkkit').part('sysedroll.js')) && /input\('sys-item-rmtext field'/.test(require('./checkkit').part('sysedroll.js')) && (sh4.match(/def\.area && canThrow && \(gm \|\| def\.vis !== 'gm'\) && entry\.hid !== 1/g) || []).length === 2 && /stampRows\(clean, camp\.chars \|\| \{\}\)/.test(require('./checkkit').part('sysederr.js')) && !/canRm/.test(sh4) && /if \(r && r\.error\) toast\(r\.error\); else undoFollow\(r\);/.test(sh4) && /if \(ownerSeesSame\(camp, sys, prev, res\.value, f\.id\)\) d = \{\};/.test(sh4) && /commitItem\(c, f, \{ op: 'undo', rowId: rid, qty: n \}\)/.test(sh4) && /orphaned = orphanRows\(prevSys, clean, camp\.chars \|\| \{\}\)/.test(require('./checkkit').part('sysederr.js')) && /gmFacing\(prevSys\) !== gmFacing\(clean\)\) n\.syncChars\(\);/.test(require('./checkkit').part('sysederr.js')) && !/commitItem\(c, f, '/.test(sh4));
    }
    {   // 1.6.3 (the review of the System editor, finding 18): a name that ends in a row's own word says what it asks, and the warning that names an
        // entry by a short name no item holds says the entry in words, never a formula's quoted name
        const sysW = { fields: [{ id: 'f_dr', key: 'Drawbacks', label: 'Drawbacks', kind: 'item-list', list: { stats: [{ key: 'wt', label: 'Weight' }] } }], items: [{ id: 'i_t', key: 'Temper', name: 'Temper', category: '' }], rolls: [] };
        const w = n => S.nameWord(sysW, n), pm = m => S.plainMessage(sysW, m);
        check('1.6.3 (finding 18) a row word of one entry reads as what it asks (whether they hold it, its level, how many, switched on, what it cost), a stat still by its label; the warning of a key no item holds names the entry in words and quotes no formula name',
            w('Drawbacks.Temper.has') === 'whether they hold Temper in Drawbacks' && w('Drawbacks.Temper.lvl') === 'the level of Temper in Drawbacks' && w('Drawbacks.Temper.qty') === 'how many of Temper in Drawbacks they hold' && w('Drawbacks.Temper.on') === 'whether Temper in Drawbacks is switched on' && w('Drawbacks.Temper.paid') === 'what Temper in Drawbacks cost' && w('Drawbacks.Temper.wt') === 'Weight of Temper in Drawbacks'
            && pm('No item in Benefits has the key "KeenSense". "Benefits.KeenSense.has" then finds only rows whose own name says it, and with none it reads as not carried.') === 'No entry of Benefits is named \u201cKeen Sense\u201d. It then finds only rows whose own name says it, and with none it reads as not carried.'
            && pm('No item in Benefits has the key "KeenSense": it reads as not carried until a row its player can see has it.') === 'No entry of Benefits is named \u201cKeen Sense\u201d. It reads as not carried until a row its player can see has it.',
            j([w('Drawbacks.Temper.has'), w('Drawbacks.Temper.lvl'), pm('No item in Benefits has the key "KeenSense": it reads as not carried until a row its player can see has it.')]));
    }

    {   // 1.6.3 (the improvement week's review of the System editor, finding 3): one run of cleanSystem builds the GM-only name graph once, and nothing is kept past it
        const sysD = { fields: [{ id: 'f_a', key: 'A', kind: 'number', vis: 'gm' }, { id: 'f_b', key: 'B', kind: 'formula', formula: 'A + 1' }, { id: 'f_c', key: 'C', kind: 'formula', formula: '2' }], items: [], core: [] };
        const J = JSON.stringify; let calls = 0; const Fc = Object.assign({}, F, { names: t => { calls++; return F.names(t); } });
        const asks = [{ name: 'B' }, { name: 'C' }];
        calls = 0; const o1 = S.gmDerivedNames(sysD, Fc, asks), out1 = calls; calls = 0; S.gmDerivedNames(sysD, Fc, asks); const out2 = calls;
        let in1 = null, in2 = null, inA = -1, inB = -1, vf1 = null, vf2 = null;
        S.derivedScope(() => { calls = 0; in1 = S.gmDerivedNames(sysD, Fc, asks); inA = calls; calls = 0; in2 = S.gmDerivedNames({ fields: sysD.fields, items: sysD.items, core: sysD.core }, Fc, [{ name: 'C' }, { name: 'B' }]); inB = calls; vf1 = S.gmViewFields(sysD, F); vf2 = S.gmViewFields(sysD, F); });
        const vo1 = S.gmViewFields(sysD, F), vo2 = S.gmViewFields(sysD, F);
        sysD.fields[2].formula = 'B * 2';   // the draft changed in place after the run: read afresh
        const o3 = S.gmDerivedNames(sysD, Fc, asks);
        // a system of 40 worked-out fields and 30 automatic effects: the names of every formula are read a few times a run, never once for every effect
        const big = { fields: [{ id: 'f_g', key: 'G', kind: 'number', vis: 'gm' }].concat(Array.from({ length: 40 }, (x, i) => ({ id: 'f_x' + i, key: 'X' + i, kind: 'formula', formula: i >= 20 ? '7 + ' + i : i % 5 ? 'X' + (i - 1) + ' + 1' : 'G + 1' }))),
            effects: Array.from({ length: 30 }, (x, i) => ({ id: 'e_' + i, name: 'E' + i, auto: 'X' + i + ' > 3', mods: [] })), rolls: [], items: [], sheet: { sections: [] } };
        calls = 0; const cl = S.cleanSystem(big, { F: Fc, gmView: true }), bigCalls = calls;
        check('1.6.3 (finding 3) the GM-only name graph is built once inside a derivedScope and handed to every call on the same system (another object of the same parts too, and in any order of names), the fields the GM\'s view cleans are cleaned once there and each caller gets its own list of them; outside a scope each call builds it, and a system changed in place after a run is read afresh; cleanSystem runs in one: 30 automatic effects read the names of 41 fields ' + bigCalls + ' times, not once an effect',
            J(o1) === J(['B']) && out1 > 0 && out2 === out1 && J(in1) === J(['B']) && inA === out1 && J(in2) === J(['B']) && inB === 0
            && vf1 !== vf2 && vf1.length === 3 && vf1.every((f, i) => f === vf2[i]) && vo1[0] !== vo2[0] && J(vo1) === J(vo2)
            && J(o3) === J(['B', 'C']) && !!cl && bigCalls > 0 && bigCalls < 41 * 4 && cl.effects.filter(e => typeof e.auto === 'string').length === 10,
            J([o1, out1, out2, in1, inA, in2, inB, o3, bigCalls, cl && cl.effects.filter(e => typeof e.auto === 'string').length]));
    }

    await T.finish();
})();
