// markcheck — track displays (1.6.2; the owner, 2026-11-03, by prompt: "Numbers, pools and formulas", a press sets the value or takes the top
// one off, boxes marked one by one with "the box asked for, or the next one up"; the looks picked on the track sheet, all four A). systemcore's
// cleaner, the words of marked boxes, how many marks a track draws, the fill rule through a real action, the players' view and the validator;
// the sheet's trackNode run on a page of plain objects; the editor's controls, the style sheet, Help and both notes. No browser, no network.
'use strict';
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0, summed = false;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (detail === undefined ? '' : ' -> ' + String(detail).slice(0, 600))); } }
const J = JSON.stringify, root = path.join(__dirname, '..'), app = p => path.join(root, 'system', 'app', p), read = p => fs.readFileSync(app(p), 'utf8').replace(/\r\n/g, '\n');
const imp = p => import('file:///' + path.resolve(app(p)).replace(/\\/g, '/'));
function between(src, a, b) { const i = src.indexOf(a), j = src.indexOf(b, i); return i >= 0 && j > i ? src.slice(i, j + b.length) : ''; }
(async () => {
    if (typeof globalThis.window === 'undefined') globalThis.window = {};
    const S = await imp('scripts/systemcore.js'), F = await imp('scripts/formula.js');
    // ---- the cleaner
    const cf = (f) => S.cleanField(Object.assign({ id: 'f_a', key: 'A', label: 'A' }, f), F, true);
    check('a track is kept on a number, a pool and a formula, as dots, a row of boxes or a clock, and on nothing else',
        J(cf({ kind: 'number', min: 0, max: 5, track: { shape: 'dots' } }).track) === J({ shape: 'dots' }) && J(cf({ kind: 'resource', maxFormula: '5', track: { shape: 'clock' } }).track) === J({ shape: 'clock' })
        && J(cf({ kind: 'formula', formula: '2', track: { shape: 'boxes', of: '4' } }).track) === J({ shape: 'boxes', of: '4' })
        && !cf({ kind: 'text', track: { shape: 'dots' } }).track && !cf({ kind: 'skill', track: { shape: 'dots' } }).track && !cf({ kind: 'number', track: { shape: 'stars' } }).track && !cf({ kind: 'number', track: 'dots' }).track);
    check('boxes marked one by one are a number’s alone: they hold a set from 0 to 65535, and never beside value names or a slider; a track takes a counter’s place',
        (() => { const e = cf({ kind: 'number', min: 2, max: 9, def: 3, track: { shape: 'boxes', each: true, of: '4' } }); return J(e.track) === J({ shape: 'boxes', each: true, of: '4' }) && e.min === 0 && e.max === 65535 && e.step === 1 && e.def === 3; })()
        && !cf({ kind: 'resource', maxFormula: '5', track: { shape: 'boxes', each: true } }).track.each && !cf({ kind: 'number', track: { shape: 'dots', each: true } }).track.each
        && !cf({ kind: 'number', labels: ['a', 'b'], track: { shape: 'dots' } }).track && !cf({ kind: 'number', min: 0, max: 5, slider: true, track: { shape: 'dots' } }).track
        && !cf({ kind: 'number', min: 0, max: 5, counter: true, track: { shape: 'dots' } }).counter);
    // ---- words and marks
    check('marked boxes say which', S.trackWords(0) === 'no box marked' && S.trackWords(1) === 'box 1' && S.trackWords(5) === 'boxes 1 and 3' && S.trackWords(7) === 'boxes 1, 2 and 3' && S.trackWords(-4) === 'no box marked'
        && S.figText({ track: { shape: 'boxes', each: true } }, 5) === 'boxes 1 and 3' && S.figText({ kind: 'number' }, 5) === '5');
    const tm = S.trackMarks;
    check('how many marks: Out of first, else a number’s range, a pool’s max, a formula’s figure; held to 30, boxes one by one to 16, none with nothing to count',
        tm({ kind: 'number', min: 0, max: 5, track: { shape: 'dots' } }, {}) === 5 && tm({ kind: 'number', min: 1, max: 4, track: { shape: 'dots' } }, {}) === 3
        && tm({ kind: 'resource', track: { shape: 'dots' } }, { max: 7 }) === 7 && tm({ kind: 'formula', track: { shape: 'dots' } }, { value: 2.7 }) === 2
        && tm({ kind: 'number', track: { shape: 'dots', of: 'x' } }, { tof: 6 }) === 6 && tm({ kind: 'resource', track: { shape: 'dots' } }, { max: 500 }) === 30
        && tm({ kind: 'number', track: { shape: 'boxes', each: true } }, { tof: 40 }) === 16 && tm({ kind: 'number', track: { shape: 'dots' } }, {}) === 0
        && tm({ kind: 'number', track: { shape: 'boxes', each: true } }, {}) === 0 && tm({ kind: 'formula', track: { shape: 'dots' } }, { value: -3 }) === 0 && tm(null) === 0);
    // ---- a system with tracks
    const raw = { v: 1, name: 'T', rolls: [{ id: 'r_mark', label: 'Take stress', apply: [{ f: 'f_st', formula: 'Hit', mark: 'up' }] }, { id: 'r_clr', label: 'Rest', apply: [{ f: 'f_st', formula: '1', mark: 'off' }] }, { id: 'r_bad', label: 'Odd', apply: [{ f: 'f_wp', formula: '2', mark: 'on' }] }], fields: [
        { id: 'f_hit', key: 'Hit', label: 'Hit', kind: 'number', def: 2 },
        { id: 'f_st', key: 'Stress', label: 'Stress', kind: 'number', track: { shape: 'boxes', each: true, of: '2 + Hit' } },
        { id: 'f_wp', key: 'Will', label: 'Willpower', kind: 'number', min: 0, max: 5, def: 3, track: { shape: 'dots' } },
        { id: 'f_sec', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm', def: 4 },
        { id: 'f_bl', key: 'Bleed', label: 'Bleeding', kind: 'formula', formula: 'Hit', track: { shape: 'dots', of: 'Secret' } }] };
    const sys = S.cleanSystem(raw, { F, gmView: true }), pv = S.cleanSystem(sys, { F, gmView: false });
    check('the change’s fill rule is kept as on, off or up on a field, and takes the place of Add and Set to',
        J(sys.rolls[0].apply) === J([{ f: 'f_st', formula: 'Hit', mark: 'up' }]) && (() => { const s2 = S.cleanSystem(Object.assign({}, raw, { rolls: [{ id: 'r_x', label: 'X', apply: [{ f: 'f_st', formula: '1', mark: 'side', set: true }] }, { id: 'r_y', label: 'Y', apply: [{ f: 'f_st', formula: '1', mark: 'on', add: true }] }] }), { F, gmView: true }); return J(s2.rolls[0].apply) === J([{ f: 'f_st', formula: '1', set: true }]) && J(s2.rolls[1].apply) === J([{ f: 'f_st', formula: '1', mark: 'on' }]); })());
    check('Out of that reads a GM-only value goes from the players’ view, and the rest of the track stays', J(sys.fields[4].track) === J({ shape: 'dots', of: 'Secret' }) && J(pv.fields.find(f => f.id === 'f_bl').track) === J({ shape: 'dots' }));
    const vErr = S.validateSystem(Object.assign({}, sys, { fields: sys.fields.map(f => f.id === 'f_wp' ? Object.assign({}, f, { track: { shape: 'dots', of: 'Nope + 1' } }) : f) }), F);
    check('the validator reads Out of as a formula of the sheet, under its own name', (vErr.errors || []).concat(vErr.warnings || []).some(e => e.id === 'f_wp' && e.prop === 'track') && !(S.validateSystem(sys, F).errors || []).some(e => e.prop === 'track'), J(vErr));
    const ch = { id: 'c_k', name: 'Kessa', ownerId: 'u_k', npc: false, values: { f_hit: 2, f_st: 5 } };
    const res = S.resolveAll(sys, ch, F);
    check('the sheet works Out of out as it stands, and a set of boxes reads as which are marked', res.f_st.tof === 4 && res.f_st.text === 'boxes 1 and 3' && res.f_bl.tof === 4 && res.f_wp.tof === undefined, J([res.f_st, res.f_bl]));
    const act = (r, c) => S.applyAct(sys, c, sys.rolls.find(x => x.id === r), S.makeResolver(sys, c, F), F);
    const a1 = act('r_mark', ch), a2 = act('r_mark', Object.assign({}, ch, { values: { f_hit: 3, f_st: 5 } })), a3 = act('r_mark', Object.assign({}, ch, { values: { f_hit: 3, f_st: 29 } }));   // five boxes with Hit 3: 1, 3, 4 and 5 marked
    check('the fill rule through a real action: box 2 marked where it is free, the next free one up where box 3 is marked, and nothing where none is left',
        a1.ok && a1.values.f_st === 7 && a1.lines[0].say === 'marked box 2' && a2.ok && a2.values.f_st === 13 && a2.lines[0].say === 'marked box 4, the next free from 3'
        && a3.ok && a3.values.f_st === 29 && a3.lines[0].say === 'no free box from 3 up' && a3.lines[0].d === 0, J([a1, a2, a3]));
    const a4 = act('r_clr', ch), a5 = act('r_bad', ch);
    check('a clear takes one box off, and a mark on a field that is no set of boxes moves nothing', a4.ok && a4.values.f_st === 4 && a4.lines[0].say === 'cleared box 1' && !a5.ok && a5.reason === 'none', J([a4, a5]));
    const mk = S.trackMark;
    check('trackMark, the one reading: on, off and up, a box past the set or below 1, a box already as asked',
        J(mk(0, 'on', 3, 4)) === J({ bits: 4, box: 3, say: 'marked box 3' }) && J(mk(4, 'on', 3, 4)) === J({ bits: 4, box: 0, say: 'box 3 was marked already' }) && J(mk(4, 'off', 3, 4)) === J({ bits: 0, box: 3, say: 'cleared box 3' })
        && J(mk(0, 'off', 2, 4)) === J({ bits: 0, box: 0, say: 'box 2 was clear' }) && mk(1, 'on', 5, 4).box === 0 && mk(1, 'on', 0, 4).box === 0 && mk(15, 'up', 1, 4).say === 'no free box from 1 up' && mk(1, 'up', 1, 16).bits === 3);
    // ---- the sheet's drawing, on a page of plain objects
    const sh = read('scripts/sheets.js'), slice = between(sh, '// [markcheck:track-start]', '// [markcheck:track-end]');
    const mkEl = (tag) => { const n = { tag: tag, children: [], attrs: {}, dataset: {}, style: { props: {}, setProperty(k, v) { this.props[k] = v; } }, listeners: {}, className: '', textContent: '', disabled: false,
        appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); } }; return n; };
    const doc = { createElementNS: (ns, t) => mkEl(t) };
    const el = (tag, cls, text) => { const n = mkEl(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = String(text); return n; };
    let commits = [];
    const T = new Function('document', 'el', 'trackMarks', 'trackWords', 'fmtNum', 'commit', slice + '\nreturn { trackNode: trackNode, trackPress: trackPress, trackFill: trackFill };')(doc, el, S.trackMarks, S.trackWords, S.fmtNum, (c, f, v) => commits.push(v));
    const walk = (n, out) => { out.push(n); (n.children || []).forEach(k => walk(k, out)); return out; };
    const fWp = sys.fields.find(f => f.id === 'f_wp'), nWp = T.trackNode(fWp, ch, { value: 3 }, true, 3), marks = walk(nWp, []).filter(n => /(^| )sheet-trk-mark( |$)/.test(n.className));
    check('dots: five marks as buttons, three filled, the words 3 / 5; a press on the fourth sets 4, on the third takes one off',
        /sheet-trk-dots/.test(nWp.className) && marks.length === 5 && marks.filter(m => /\bon\b/.test(m.className)).length === 3 && marks.every(m => m.tag === 'button') && walk(nWp, []).some(n => n.className === 'sheet-trk-words' && n.textContent === '3 / 5')
        && (() => { commits = []; marks[3].listeners.click[0](); marks[2].listeners.click[0](); return J(commits) === J([4, 2]); })(), J(commits));
    const fSt = sys.fields.find(f => f.id === 'f_st'), nSt = T.trackNode(fSt, ch, res.f_st, true, 5), bx = walk(nSt, []).filter(n => /(^| )sheet-trk-mark( |$)/.test(n.className));
    check('boxes one by one: four boxes, 1 and 3 marked, each with its number and a cross; a press marks or clears that box alone',
        /sheet-trk-each/.test(nSt.className) && bx.length === 4 && J(bx.map(b => /\bon\b/.test(b.className))) === J([true, false, true, false]) && bx.every(b => b.children.some(k => k.className === 'sheet-trk-n'))
        && bx.every(b => walk(b, []).some(k => k.attrs && k.attrs.class === 'sheet-trk-cross')) && (() => { commits = []; bx[1].listeners.click[0](); bx[2].listeners.click[0](); return J(commits) === J([7, 1]); })(), J(commits));
    const nRo = T.trackNode(sys.fields.find(f => f.id === 'f_bl'), ch, { value: 2, text: '2', tof: 4 }, true, undefined);
    check('a formula’s track only shows: its marks are no buttons and take no press', walk(nRo, []).filter(n => /(^| )sheet-trk-mark( |$)/.test(n.className)).every(m => m.tag === 'span' && !m.listeners.click));
    const clk = T.trackNode({ id: 'f_c', key: 'Alarm', label: 'Alarm', kind: 'resource', track: { shape: 'clock' } }, ch, { value: 3, max: 6 }, true, undefined), wedges = walk(clk, []).filter(n => n.attrs && /sheet-trk-wedge/.test(n.attrs.class || ''));
    check('a clock: one wedge a part, the filled ones marked, a press on a wedge sets the pool by it',
        wedges.length === 6 && wedges.filter(w => /\bon\b/.test(w.attrs.class)).length === 3 && (() => { commits = []; const hold = walk(clk, []).find(n => n.className === 'sheet-trk-clockbtn'); hold.listeners.click[0]({ target: { closest: () => ({ dataset: { i: '5' } }) } }); hold.listeners.click[0]({ target: { closest: () => ({ dataset: { i: '3' } }) } }); return J(commits) === J([{ cur: 5 }, { cur: 2 }]); })(), J(commits));
    check('nothing to count draws nothing, so the field is drawn as before', T.trackNode({ id: 'f_n', key: 'N', kind: 'number', track: { shape: 'dots' } }, ch, { value: 1 }, true, 1) === null);
    check('the sheet asks for a track before every other way a number, a pool or a formula is drawn, never over an error or an override',
        sh.includes("if (f.track && typeof trackNode === 'function' && !(e && e.error) && !(k === 'number' && e && e.over === true)) { var trN = trackNode(f, c, e, k === 'formula' ? false : use, raw);") && /function trkSvg\(tag, attrs\) \{ var n = document\.createElementNS\(TRK_NS, tag\);/.test(slice) && !/innerHTML/.test(slice));
    // ---- the editor, the style sheet, Help and notes
    check('the Fields tab offers Shows as and Out of, and an action’s change on such a field offers the fill rule',
        sh.includes("select('sys-trackshape', tkO,") && sh.includes("input('sys-trackof field'") && sh.includes("return [['mark', 'Mark box'], ['up', 'Mark box, or the next free one up'], ['clear', 'Clear box']];") && /var MARK_HOW = Object\.freeze\(\{ mark: 'on', up: 'up', clear: 'off' \}\);/.test(sh)
        && read('scripts/sysui.js').includes("'sys-trackshape', 'sys-trackof'") && read('scripts/formbox.js').includes("'sys-trackof': 'amt'"));
    const css = read('style.css');
    check('the style sheet draws the looks the owner picked', css.includes('.sheet-trk-mark.on .sheet-trk-dot { fill: var(--trk); stroke: var(--trk); }') && css.includes('.sheet-trk-each .sheet-trk-mark.on .sheet-trk-cross { stroke: var(--trk); }') && css.includes('.sheet-trk-wedge.on { fill: var(--trk);'));
    const help = read('index.html'), wn = fs.readFileSync(path.join(root, 'WHATSNEW.txt'), 'utf8'), wn2 = read('assets/whatsnew.txt');
    check('Help and both release notes say it', help.includes('<li><b>Tracks.</b> A number, a pool or a formula can show as a track.') && help.includes('<b>Mark box, or the next free one up</b>') && wn.includes('a clock in parts. Press a mark to set it.') && wn2.includes('a clock in parts. Press a mark to set it.'));
    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    process.exit(fail ? 1 : 0);
})().catch(e => { console.log('FAIL      the suite threw -> ' + (e && e.stack || e)); process.exit(1); });
process.on('exit', () => { if (!summed) console.log('FAIL      the suite never reached its summary'); });
