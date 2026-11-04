// fxvalcheck — effects with a value (1.6.2; the owner, 2026-11-03, by prompt: added again "Each effect says", over time "it stays, or falls by a
// figure each turn of its character, each round, or each minute or hour on the game clock. At 0 the effect ends", by hand "as the effects list
// allows"). systemcore's cleaner, a row's number through applyEffectOp and a real action, a change Times its number in the sheet's figures, the
// fall in fxTick, the owner's copy and the wire's cleaner; the sheet's number and the editor's controls, Help and both notes. No browser.
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 600))); } }
const J = JSON.stringify, root = path.join(__dirname, '..'), app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, '\n');
const imp = p => import('file:///' + path.resolve(app(p)).replace(/\\/g, '/'));
(async () => {
    if (typeof globalThis.window === 'undefined') globalThis.window = {};
    const S = await imp('scripts/systemcore.js'), F = await imp('scripts/formula.js');
    const cv = S.cleanFxVal;
    check('the cleaner: a start of 1 to 9999 (else 1), again as higher or replace (else add), and a fall only with a figure and when',
        J(cv({})) === J({ start: 1 }) && J(cv({ start: 3, again: 'higher', by: 1, each: 'turn' })) === J({ start: 3, again: 'higher', by: 1, each: 'turn' }) && J(cv({ start: 0, again: 'add', by: 2 })) === J({ start: 1 })
        && J(cv({ start: 20000, each: 'hour', by: 0 })) === J({ start: 1 }) && J(cv({ by: 1, each: 'minute' })) === J({ start: 1, by: 1, each: 'minute' }) && cv(null) === null && cv(3) === null);
    const raw = { v: 1, name: 'V', fields: [
        { id: 'f_hp', key: 'HP', label: 'HP', kind: 'number', def: 10 },
        { id: 'f_fx', key: 'Fx', label: 'Effects', kind: 'effects', vis: 'all', edit: 'owner' }],
        effects: [{ id: 'e_bleed', name: 'Bleeding', mods: [{ f: 'f_hp', op: 'add', v: -1, perVal: true }], val: { start: 2, by: 1, each: 'turn' } },
            { id: 'e_hex', name: 'Hex', mods: [{ f: 'f_hp', op: 'add', v: -1, perVal: true }], val: { start: 1, again: 'higher', by: 1, each: 'hour' } },
            { id: 'e_mark', name: 'Mark', mods: [{ f: 'f_hp', op: 'add', v: 5, perVal: true }], val: { start: 4, again: 'replace' } },
            { id: 'e_plain', name: 'Plain', mods: [{ f: 'f_hp', op: 'add', v: -2, perVal: true }] }],
        rolls: [{ id: 'r_cut', label: 'Cut', apply: [{ fx: 'e_bleed', on: true, n: '3' }] }] };
    const sys = S.cleanSystem(raw, { F, gmView: true }), pv = S.cleanSystem(sys, { F, gmView: false }), fx = id => sys.effects.find(e => e.id === id);
    check('the system keeps an effect’s number the same in both views, and Times its number only on an effect’s change', J(fx('e_bleed').val) === J({ start: 2, by: 1, each: 'turn' }) && J(pv.effects[0].val) === J(fx('e_bleed').val) && fx('e_bleed').mods[0].perVal === true && fx('e_plain').val === undefined && J(sys.rolls[0].apply) === J([{ fx: 'e_bleed', on: true, n: '3' }]));
    const ch = (rows) => ({ id: 'c_k', name: 'Kessa', ownerId: 'u_k', npc: false, values: { f_hp: 10, f_fx: rows || [] } });
    const op = (c, q, pl) => S.applyEffectOp(sys, c, 'f_fx', q, F, pl ? { player: true, view: pv, now: 0 } : { now: 0 });
    const a1 = op(ch(), { op: 'add', rowId: 'x_b', ref: 'e_bleed' });
    check('an effect goes on at its start, and a number given takes its place', a1.ok && a1.value[0].v === 2 && op(ch(), { op: 'add', rowId: 'x_b', ref: 'e_bleed', v: 5 }).value[0].v === 5 && op(ch(), { op: 'add', rowId: 'x_b', ref: 'e_bleed', v: 0 }).value[0].v === 1, J(a1));
    const ag = (id, was, v) => op(ch([{ id: 'x_' + id, ref: 'e_' + id, on: true, v: was }]), { op: 'add', rowId: 'x_' + id, ref: 'e_' + id, v: v }).value[0].v;
    check('added again while on: adds by default, keeps the higher, or replaces; added again while off takes the new number', ag('bleed', 3, 2) === 5 && ag('hex', 3, 2) === 3 && ag('hex', 3, 7) === 7 && ag('mark', 3, 1) === 1
        && op(ch([{ id: 'x_bleed', ref: 'e_bleed', on: false, v: 3 }]), { op: 'add', rowId: 'x_bleed', ref: 'e_bleed', v: 2 }).value[0].v === 2);
    const v1 = op(ch([{ id: 'x_b', ref: 'e_bleed', on: true, v: 3 }]), { op: 'val', rowId: 'x_b', v: 4 }, true), v0 = op(ch([{ id: 'x_b', ref: 'e_bleed', on: true, v: 3 }]), { op: 'val', rowId: 'x_b', v: 0 }, true), vN = op(ch([{ id: 'x_p', ref: 'e_plain', on: true }]), { op: 'val', rowId: 'x_p', v: 2 });
    check('by hand: a player sets the number on their own character, 0 ends the effect, and an effect with no number refuses', v1.ok && v1.value[0].v === 4 && v0.ok && v0.value.length === 0 && !vN.ok && vN.reason === 'value');
    const res = S.resolveAll(sys, ch([{ id: 'x_b', ref: 'e_bleed', on: true, v: 3 }, { id: 'x_m', ref: 'e_mark', on: true, v: 2 }]), F), resP = S.resolveAll(sys, ch([{ id: 'x_p', ref: 'e_plain', on: true }]), F);
    check('a change ticked Times its number counts that many times: Bleeding 3 takes 3 off, Mark 2 adds 10; an effect with no number counts once', res.f_hp.value === 10 - 3 + 10 && resP.f_hp.value === 8, J([res.f_hp, resP.f_hp]));
    const act = S.applyAct(sys, ch(), sys.rolls[0], S.makeResolver(sys, ch(), F), F);
    const act2 = S.applyAct(sys, ch([{ id: 'x_bleed', ref: 'e_bleed', on: true, v: 2 }]), sys.rolls[0], S.makeResolver(sys, ch(), F), F);
    check('an action that switches it on gives it its With number, and pressed again while it is on adds by the effect’s rule', act.ok && act.values.f_fx[0].v === 3 && act2.ok && act2.values.f_fx[0].v === 5, J([act, act2]));
    const t1 = S.fxTick(sys, ch([{ id: 'x_b', ref: 'e_bleed', on: true, v: 2 }]), 'turn', 0), t2 = S.fxTick(sys, ch([{ id: 'x_b', ref: 'e_bleed', on: true, v: 1 }]), 'turn', 0);
    check('it falls each turn of its character, and at 0 the effect ends', J(t1.values.f_fx) === J([{ id: 'x_b', ref: 'e_bleed', on: true, v: 1 }]) && J(t2.values.f_fx) === J([]) && J(t2.expired) === J(['Bleeding']), J([t1, t2]));
    const g1 = S.fxTick(sys, ch([{ id: 'x_h', ref: 'e_hex', on: true, v: 3 }]), 'game', 0, 5400), g2 = S.fxTick(sys, ch([{ id: 'x_h', ref: 'e_hex', on: true, v: 3, vt: 1800 }]), 'game', 0, 5400);
    check('by the game clock a part of an hour is kept toward the next fall: an hour and a half takes one off and keeps half an hour, and two hours in all two', J(g1.values.f_fx) === J([{ id: 'x_h', ref: 'e_hex', on: true, v: 2, vt: 1800 }]) && J(g2.values.f_fx) === J([{ id: 'x_h', ref: 'e_hex', on: true, v: 1 }]), J([g1, g2]));
    check('a number that stays, and one switched off, do not fall; a turn moves nothing that falls by the clock',
        J(S.fxTick(sys, ch([{ id: 'x_m', ref: 'e_mark', on: true, v: 2 }]), 'turn', 0).values) === J({}) && J(S.fxTick(sys, ch([{ id: 'x_b', ref: 'e_bleed', on: false, v: 2 }]), 'turn', 0).values) === J({}) && J(S.fxTick(sys, ch([{ id: 'x_h', ref: 'e_hex', on: true, v: 2 }]), 'turn', 0).values) === J({}));
    const own = S.charFor(ch([{ id: 'x_b', ref: 'e_bleed', on: true, v: 3, vt: 10 }]), sys, 'u_k'), cl = S.cleanChar(ch([{ id: 'x_b', ref: 'e_bleed', on: true, v: 3, vt: 10 }, { id: 'x_z', ref: 'e_mark', on: true, v: -2 }]), sys, { state: 'host' });
    check('the owner’s copy carries the number and not the clock’s part; a load keeps a whole number from 1 and drops one below', own && J(own.values.f_fx[0]) === J({ id: 'x_b', ref: 'e_bleed', on: true, v: 3 }) && cl.values.f_fx[0].v === 3 && cl.values.f_fx[0].vt === 10 && cl.values.f_fx[1].v === undefined, J([own && own.values.f_fx, cl.values.f_fx]));
    check('the wire takes a number for the op val alone', (() => { const g = S.cleanCharEffect({ type: 'char-effect', rid: 'r1', charId: 'c_k', fieldId: 'f_fx', op: 'val', rowId: 'x_b', v: 2 }), b = S.cleanCharEffect({ type: 'char-effect', rid: 'r1', charId: 'c_k', fieldId: 'f_fx', op: 'val', rowId: 'x_b', v: 'lots' }); return !!g && g.v === 2 && b === null; })());
    const vs = S.validateSystem(Object.assign({}, sys, { rolls: [{ id: 'r_x', label: 'X', apply: [{ fx: 'e_plain', on: true, n: '2' }] }, { id: 'r_y', label: 'Y', apply: [{ fx: 'e_bleed', on: true, n: 'Nope' }] }] }), F);
    check('the validator warns of With number on an effect that holds none, and reads one that does', vs.warnings.some(w => w.id === 'r_x' && /holds no number/.test(w.message)) && vs.errors.concat(vs.warnings).some(w => w.id === 'r_y'), J(vs));
    // ---- the sheet and the editor
    const sh = read('scripts/sheets.js');
    check('the sheet shows the number beside the effect with − and + for whoever may change that list, and sends the op val',
        sh.includes("var fvN = typeof fxValNode === 'function' ? fxValNode(c, f, r, d, editable) : null; if (fvN) line.appendChild(fvN);") && sh.includes("var fvC = typeof fxValNode === 'function' ? fxValNode(c, f, r, d, editable) : null;") && sh.includes("commitEffect(c, f, { op: 'val', rowId: r.id, v: n });"));
    check('the Effects tab has Holds a number with its start, added again and fall, Times its number on a change, and With number on an action',
        sh.includes("fvC.className = 'sys-fxv-chk'") && sh.includes("select('sys-fxv-again', [['', 'Add the numbers'], ['higher', 'Keep the higher'], ['replace', 'Replace it']]") && sh.includes("select('sys-fxv-each', [['', 'It stays'], ['turn', 'each turn of its character'], ['minute', 'each game minute'], ['hour', 'each game hour']]")
        && sh.includes("pvC.className = 'sys-fxv-per'") && sh.includes("input('sys-apply-fxn field'") && read('scripts/formbox.js').includes("'sys-apply-fxn': 'amt'") && read('scripts/sysui.js').includes("['val', 'Its number', 0, ['sys-fxv-box']]"));
    check('net.charEffect sends the number of the op val', read('scripts/net.js').includes("if (q.op === 'val') m.v = Number(q.v);"));
    const help = read('index.html'), wn = fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8'), wn2 = read('assets/whatsnew.txt');
    check('Help and both release notes say it', help.includes('<li><b>Effects with a number.</b> An effect can hold a number, as Bleeding 3.') && help.includes('<b>Times its number</b>') && wn.includes('- An effect can hold a number, as Bleeding 3.') && wn2.includes('- An effect can hold a number, as Bleeding 3.'));
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite threw -> ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) console.log('FAIL      the suite never reached its summary'); });
