'use strict';
/* applycheck.js: what an action applies and when: End turn and apply actions at a turn's start (T2, T2b), an effect's time from its note
   (T5a), the bell, the handbook search placement (H12), the library's import counts, lookup, core and how far an edit reaches (L0
   to L4), item mods and a custom row's changes (F6, F6b), a choice reading a list (F3, F7), Applies to an adjacent character and to
   the user or their target, On.<name>, one Revert after a press used on another, a change that switches an effect or sets a row's
   quantity, its stat or every row's, a custom roller's starting text, grants (raising a held row, once a character, their own
   terms), Off a character's turn, Counts at its turn's end, an effect added again, a switch by where rows sit, the campaign build's
   gaps, the campaign's date, roll switches, a formula's rounding, <Pool>.full, CrossStep and Crossed, and a set of places.
   These are the tests that came out of systemcheck.js with their area (docs/REFACTOR_SPLIT_PLAN.md, "Finishing the test split",
   step 2, 2026-11-19). Their code is systemcore.js's own lines and the parts and slices each block reads by name, so the suite
   imports systemcore.js as systemcheck.js does (kit.sysCore, the top every suite out of it starts from). Each block is as it stood
   in systemcheck.js, word for word, with the comment that heads it.
   Usage: node tools/applycheck.js   (exit 1 on any failure) */
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
    check('applycheck: systemcore.js and formula.js load in Node with no window', !!S && !!F && !err, err && err.message);
    if (!S || !F) { await T.finish(); return; }
    const { LIMITS, cleanSystem, makeResolver, resolveAll, validateSystem } = core;

    /* ---- Turn-based combat T2: End turn in the sheet's and each HUD's head, and on the turn strip ---- */
    {
        const shE = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL);
        const seSrc = shE.slice(shE.indexOf('function syncEndTurn() {'), shE.indexOf('\n', shE.indexOf('function endTurn() {')) + 1);
        const runSE = (tok, open, hudIds) => {
            const btn = () => ({ style: { display: 'x' } }), sb = btn(), hs = {}; (hudIds || []).forEach(id => { const b = btn(); hs[id] = { panel: { querySelector: s => s === '.hud-endturn' ? b : null }, b: b }; });
            const toasts = [], ends = [];
            const api = new Function('net', 'ui', 'huds', 'toast', 'var sheetOpen = ' + JSON.stringify(open) + ';' + NL + seSrc + NL + 'return { syncEndTurn: syncEndTurn, endTurn: endTurn };')(
                () => ({ myTurnTok: () => tok, turnEnd: () => { ends.push(1); return tok ? { ok: true } : { error: 'It is not your turn.' }; } }), id => id === 'sheetEndTurn' ? sb : null, hs, t => toasts.push(t));
            api.syncEndTurn(); api.endTurn(); return { sheet: sb.style.display, huds: Object.keys(hs).map(k => k + ':' + hs[k].b.style.display), toasts: toasts, ends: ends.length };
        };
        const onT = runSE({ tok: { charId: 'c_p' } }, 'c_p', ['c_p', 'c_q']), offT = runSE(null, 'c_p', ['c_p']), otherT = runSE({ tok: { charId: 'c_q' } }, 'c_p', ['c_p']);
        check('T2 End turn in the heads (sheets.js, run for real): shown on the sheet and the HUD of the character whose token has the turn (the player\'s own), hidden on every other; pressed, it asks the host and says why not',
            onT.sheet === '' && j(onT.huds) === j(['c_p:', 'c_q:none']) && offT.sheet === 'none' && j(offT.huds) === j(['c_p:none']) && otherT.sheet === 'none' && j(offT.toasts) === j(['It is not your turn.']) && !onT.toasts.length && onT.ends === 1, j([onT, offT, otherT]));
        const wbE = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, NL), hmE = fs.readFileSync(path.join(app, 'index.html'), 'utf8'), vtE = fs.readFileSync(path.join(app, 'scripts', 'vtt.js'), 'utf8');
        check('T2 the turn strip, the heads and the feature (source): the strip draws End turn for the player on turn and presses it before the GM-only buttons; the sheet and each HUD sync it when drawn and after every render; Turn-based combat is a GM-controlled VTT feature on by default (every feature is opt-out, owner 2026-09-30), with its settings rows; Help says so',
            /mine = !host && n\.myTurnTok \? n\.myTurnTok\(\) : null;/.test(wbE) && /\(mine \? '<button class="combat-strip-btn combat-strip-endturn" data-act="endturn"/.test(wbE) && /if \(b\.dataset\.act === 'endturn'\) \{ var rt = n && n\.turnEnd \? n\.turnEnd\(\) : null; if \(rt && rt\.error\) toast\(rt\.error\); return; \}[^\n]*\n(?:        if \(n && n\.role !== 'host' && \(b\.dataset\.act === 'hold'[^\n]*\n)?        if \(!\(n && n\.role === 'host' && am\)\) return;/.test(wbE)
            && (shE.match(/try \{ syncEndTurn\(\); \} catch \(e\) \{\}/g) || []).length === 3 && /q\('hud-endturn'\)\.addEventListener\('click', endTurn\);/.test(shE) && /etB\.addEventListener\('click', endTurn\);/.test(shE)
            && /\{ id: 'turns',     label: 'Turn-based combat', legacyKey: null, noLocal: true \}/.test(vtE) && /id="sheetEndTurn"/.test(hmE) && /hud-endturn/.test(hmE) && /id="setTurnsBtn"/.test(hmE) && /id="setVttGlobalTurnsBtn"/.test(hmE)
            && /<b>Turn-based combat<\/b> is a VTT feature under <svg class="ico"[^>]*>.*?<\/svg> Settings &#9656; This campaign, on by default\. With it on, the player whose token has the turn gets <b>End turn<\/b>/.test(hmE));
    }
    /* ---- Turn-based combat T2b: apply actions at a character's turn's start; run automatically, or as a reminder the GM or its player presses ---- */
    {
        const rawB = { v: 1, name: 'B', fields: [{ id: 'f_hp', key: 'HP', kind: 'number', def: 10 }, { id: 'f_r', key: 'Reaction', kind: 'number', def: 0 }, { id: 'f_g', key: 'Secret', kind: 'number', def: 0, vis: 'gm' }],
            rolls: [{ id: 'r_bl', label: 'Bleed', apply: [{ f: 'f_hp', formula: '1' }], each: 'turn' },
                { id: 'r_re', label: 'Reaction back', apply: [{ f: 'f_r', formula: '0', set: true }], each: 'turn', by: 'owner' },
                { id: 'r_gm', label: 'GM tick {Secret}', apply: [{ f: 'f_g', formula: '1', add: true }], each: 'turn', by: 'owner', vis: 'gm' },
                { id: 'r_rd', label: 'Round due', apply: [{ f: 'f_r', formula: '0', set: true }], each: 'round', by: 'gm' },
                { id: 'r_old', label: 'Old', apply: [{ f: 'f_r', formula: '0', set: true }], round: true, by: 'gm' },
                { id: 'r_nb', label: 'By alone', apply: [{ f: 'f_r', formula: '0', set: true }], by: 'owner' },
                { id: 'r_xb', label: 'Odd by', apply: [{ f: 'f_r', formula: '0', set: true }], each: 'turn', by: 'player' },
                { id: 'r_xe', label: 'Odd each', apply: [{ f: 'f_r', formula: '0', set: true }], each: 'always', by: 'gm' }], sheet: { sections: [] } };
        const gmB = cleanSystem(rawB, { F, gmView: true }), plB = cleanSystem(rawB, { F, gmView: false }), rB = (s, id) => s.rolls.find(r => r.id === id), eb = r => r ? (r.each || '') + '/' + (r.by || '') : 'gone';
        check('T2b the cleaner: each turn or round with by gm or owner (absent: automatically); by with no each goes, another value too; an older round: true keeps its by; both views; fixed points',
            j(['r_bl', 'r_re', 'r_rd', 'r_old', 'r_nb', 'r_xb', 'r_xe'].map(id => eb(rB(gmB, id)))) === j(['turn/', 'turn/owner', 'round/gm', 'round/gm', '/', 'turn/', '/']) && eb(rB(plB, 'r_re')) === 'turn/owner' && !rB(plB, 'r_gm')
            && j(cleanSystem(gmB, { F, gmView: true })) === j(gmB) && j(cleanSystem(plB, { F, gmView: false })) === j(plB), j(gmB.rolls.map(r => r.id + ':' + eb(r))));
        check('T2b roundActs and dueActs by kind: at the turn\'s start the automatic ones (Bleed, and one with an unknown by) and the ones to press (Reaction back, the GM tick); each round the ones to press (Round due, Old)',
            j(S.roundActs(gmB, 'turn').map(r => r.id)) === j(['r_bl', 'r_xb']) && j(S.dueActs(gmB, 'turn').map(r => r.id)) === j(['r_re', 'r_gm']) && j(S.roundActs(gmB).map(r => r.id)) === '[]' && j(S.dueActs(gmB, 'round').map(r => r.id)) === j(['r_rd', 'r_old']) && j(S.dueActs(null, 'turn')) === '[]');
        const mpB = { type: 'map', whiteboard: [{ id: 't_a', isChar: true, charId: 'c_a', ownerId: 'u_a' }, { id: 't_b', isChar: true, charId: 'c_b' }] };
        const cbB = { round: 2, turn: 1, rows: [{ id: 'x1', tokId: 't_b' }, { id: 'x2', tokId: 't_a' }] };
        const shB = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL);
        const hkB = shB.slice(shB.indexOf('// Stage 6 HUD G10: the host\'s round hook'), shB.indexOf('// The combat roster (whiteboard.js): initiative from the system\'s init roll'));
        const runB = (kind, o) => {
            o = o || {}; const out = { deltas: [], dues: [], toasts: [], pressed: [] }, chars = { c_a: { id: 'c_a', name: 'Ana', ownerId: 'u_a', values: { f_hp: 10, f_r: 1 } }, c_b: { id: 'c_b', name: 'Orc', npc: true, values: { f_hp: 7 } } }, camp = { items: { m1: mpB }, chars: chars, system: gmB };
            const n = { role: 'host', active: true, syncCharDelta: (id, d) => out.deltas.push([id, JSON.parse(JSON.stringify(d))]), postDue: (c, a, k, r, own) => out.dues.push([c.id, a.id, k, r, own]) };
            const api = new Function('getActiveCampaign', 'systemOf', 'net', 'F', 'window', 'combatChars', 'charsOf', 'charById', 'withRound', 'tokenCtx', 'tokenFlags', 'applyRound', 'dueActs', 'resolveAll', 'renderViews', 'save', 'toast', 'canApply', 'applyAction', hkB + NL + 'return { roundHook: roundHook, turnHook: turnHook, runDue: runDue };')(
                () => camp, c => c.system, () => n, () => F, { wpVtt: { on: () => true } }, S.combatChars, c => c.chars, (id, c) => (c || camp).chars[id] || null, S.withRound, S.tokenCtx, () => ({}), S.applyRound, S.dueActs, S.resolveAll, () => {}, () => {}, t => out.toasts.push(t), c => o.can !== false, (r, c, l) => out.pressed.push([r.id, c.id, l]));
            out.ret = kind === 'due' ? api.runDue(o.charId, o.actId) : api[kind + 'Hook']('m1', cbB); out.chars = chars; return out;
        };
        const tB = runB('turn'), rdB = runB('round');
        check('T2b the turn\'s start (sheets.js, run for real): only the character whose turn begins — its automatic actions run (Bleed: HP 10 \u2192 9; the one whose by was not a press: Reaction 0) and its reminders go out (Reaction back to its player; the GM-only one to the GM); each round: every combatant\'s reminders (the GM\'s), nothing automatic',
            tB.ret === 1 && j(tB.deltas) === j([['c_a', { f_hp: 9, f_r: 0 }]]) && j(tB.dues) === j([['c_a', 'r_re', 'turn', 2, true], ['c_a', 'r_gm', 'turn', 2, false]]) && tB.chars.c_b.values.f_hp === 7
            && rdB.ret === 0 && j(rdB.dues) === j([['c_b', 'r_rd', 'round', 2, false], ['c_b', 'r_old', 'round', 2, false], ['c_a', 'r_rd', 'round', 2, false], ['c_a', 'r_old', 'round', 2, false]]), j([tB, rdB.dues]));
        const dOk = runB('due', { charId: 'c_a', actId: 'r_re' }), dGone = runB('due', { charId: 'c_a', actId: 'r_zz' }), dRoll = runB('due', { charId: 'c_zz', actId: 'r_re' }), dNo = runB('due', { charId: 'c_a', actId: 'r_re', can: false }), dLab = runB('due', { charId: 'c_a', actId: 'r_gm' });
        check('T2b a reminder\'s Run (runDue, run for real): presses the character\'s saved action as its button does (a label with a {value} as Apply); an action or a character not there, or one not theirs to change, says so and presses nothing',
            dOk.ret === true && j(dOk.pressed) === j([['r_re', 'c_a', 'Reaction back']]) && j(dLab.pressed) === j([['r_gm', 'c_a', 'Apply']])
            && [dGone, dRoll, dNo].every(d => d.ret === false && !d.pressed.length && d.toasts.length === 1), j([dOk, dGone.toasts, dNo.toasts]));
        // the reminder card (dice.js renderDue, run for real on a fake page)
        const dsB = fs.readFileSync(path.join(app, 'scripts', 'dice.js'), 'utf8').replace(/\r\n/g, NL), rdSrc = dsB.slice(dsB.indexOf('function renderDue(m) {'), dsB.indexOf('function renderApply(m) {'));
        const fakeEl = (tag, cls, text) => { const n = { tag, className: cls || '', textContent: text === undefined ? '' : String(text), children: [], style: {}, on: {}, disabled: false, appendChild(c) { this.children.push(c); return c; }, addEventListener(t, f) { this.on[t] = f; } }; return n; };
        const drawOver = (o) => { const m = { due: { id: 'r_o', charId: 'c_1', act: 'r_d', why: 'called', round: 1, roll: 1, att: 'a_abcd1234', ts: 1, label: 'Dodge', by: 'a blast' }, over: 1 }; if (o) m.due.theirs = 1; const n = new Function('el', 'chatTime', 'document', 'window', rdSrc + NL + 'return renderDue;')(fakeEl, () => '12:00', { createTextNode: t => ({ tag: '#text', textContent: t, children: [] }) }, { wpSheets: { runDue: () => true } })(m), wk = x => [x].concat((x.children || []).flatMap(wk)), all = wk(n); return { btn: all.filter(x => x.tag === 'button').length, said: all.some(x => /went off, so this roll is over/.test(x.textContent || '')) }; };
        check('1.6.0 ... after Apply now a Defense card (renderDue, run for real) says it is over, with no button, on the presser\'s copy and the GM\'s', [drawOver(false), drawOver(true)].every(x => x.btn === 0 && x.said), JSON.stringify([drawOver(false), drawOver(true)]));
        const drawDue = (m, o) => { o = o || {}; const runs = []; const node = new Function('el', 'chatTime', 'document', 'window', rdSrc + NL + 'return renderDue;')(fakeEl, () => '12:00', { createTextNode: t => ({ tag: '#text', textContent: t, children: [] }) }, { wpPopout: !!o.pop, wpSheets: { runDue: (c, a) => { runs.push([c, a]); return o.ok !== false; } } })(m); return { node, runs }; };
        {   // 1.6.0: a press on a grayed roll or action says what holds it back, run for real on buttons of plain objects
            const shG = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), slG = shG.slice(shG.indexOf('// [systemcheck:greypress-start]'), shG.indexOf('// [systemcheck:greypress-end]')), said = [], heard = [];
            const gp = new Function('toast', 'document', slG + NL + 'return { greyPress, greyWords };')(w => said.push(w), { addEventListener(t, f, c) { heard.push([t, f, c]); } });
            const btn = (cls, title, off, tip) => ({ disabled: off !== false, title, dataset: tip ? { tip } : {}, closest(s) { return s.split(', ').includes('.' + cls) ? this : null; } });
            const press = (b, o) => { said.length = 0; gp.greyPress(Object.assign({ target: b, button: 0 }, o)); return said.slice(); };
            check('1.6.0 a press on a grayed roll says what holds it back: a player\'s words as they are, the GM\'s without the formula, a cost\'s words without the roll, a tooltip the page moved read from its new place, dice off in plain words with no formula, the small plus and minus too; nothing for a button that is not grayed, another mouse button, another button of the page or one with no words; one listener in the capture phase',
                JSON.stringify(press(btn('sheet-roll', 'Not ready, or no shot'))) === '["Not ready, or no shot"]' && JSON.stringify(press(btn('sheet-item-roll', 'Not ready \u2014 it needs and(Row.on, Row.Shot)'))) === '["Not ready"]' && JSON.stringify(press(btn('sheet-roll', 'Not your turn \u2014 3d6 <= Row.Attack'))) === '["Not your turn"]'
                && JSON.stringify(press(btn('sheet-roll', '', true, 'Moved to the tip'))) === '["Moved to the tip"]' && JSON.stringify(press(btn('sheet-roll', '3d6 <= Secret (dice are off here, or this is not your character)'))) === '["Dice are off here, or this is not your character."]' && JSON.stringify(press(btn('sheet-roll-mod', 'Not ready'))) === '["Not ready"]'
                && press(btn('sheet-roll', 'Words', false)).length === 0 && press(btn('sheet-roll', 'Words'), { button: 2 }).length === 0 && press(btn('tool', 'Words')).length === 0 && press(btn('sheet-roll', '')).length === 0 && press(null).length === 0
                && heard.length === 1 && heard[0][0] === 'pointerdown' && heard[0][2] === true && shG.includes("if (pid && !prev) { var srG = window.wpSystemCore"), JSON.stringify(said));
        }
        const flat = n => n.textContent + (n.children || []).map(flat).join('');
        const btnOf = n => n.tag === 'button' ? n : (n.children || []).map(btnOf).find(Boolean) || null;
        const mD = { due: { charId: 'c_a', act: 'r_re', label: '<b>Reaction back</b>', as: 'Ana', why: 'turn', round: 2, ts: 1 } }, dd = drawDue(mD), bD = btnOf(dd.node);
        bD.on.click(); bD.on.click();
        const dTheirs = drawDue({ due: Object.assign({}, mD.due, { theirs: 1 }) }), dPop = drawDue({ due: mD.due }, { pop: true }), dFail = drawDue({ due: mD.due }, { ok: false }), bF = btnOf(dFail.node); bF.on.click();
        check('T2b the reminder card (dice.js, run for real): Due, for whom, what and when as text; Run presses it once (the card then says so); the GM\'s copy of a player\'s reminder and a pop-out window have no Run; a refused press leaves Run to try again',
            /^Due for Ana12:00<b>Reaction back<\/b> \u2014 the start of its turn/.test(flat(dd.node)) && j(dd.runs) === j([['c_a', 'r_re']]) && mD.done === true && bD.disabled === true
            && !btnOf(dTheirs.node) && /Its player presses it\./.test(flat(dTheirs.node)) && !btnOf(dPop.node) && dFail.runs.length === 1 && !bF.disabled && /round 7/.test(flat(drawDue({ due: Object.assign({}, mD.due, { why: 'round', round: 7 }) }).node)), flat(dd.node));
        {   // 1.6.3 (finding 36): a crossing's card says which value crossed which step; an action's button says Apply; the press says what it did in place of Pressed
            const DCX = await import(url('dicecore.js')), drawX = (m, ok) => { const runs = []; const nx = new Function('el', 'chatTime', 'document', 'window', 'crossWhy', rdSrc + NL + 'return renderDue;')(fakeEl, () => '12:00', { createTextNode: t => ({ tag: '#text', textContent: t, children: [] }) }, { wpSheets: { runDue: (c, a) => { runs.push([c, a]); return ok !== false; } } }, DCX.crossWhy)(m); return { node: nx, runs }; };
            const mX = { due: { charId: 'c_a', act: 'r_dc', label: 'Death check', as: 'Ana', why: 'cross', round: 1, ts: 1, xf: 'Hit Points', xs: 0 } }, dX = drawX(mX), bX = btnOf(dX.node);
            const mR = { due: Object.assign({}, mX.due, { roll: 1 }) }, dR = drawX(mR), bR = btnOf(dR.node);
            const textX = flat(dX.node), bXw = bX ? bX.textContent : '', bRw = bR ? bR.textContent : ''; bX.on.click(); bR.on.click();
            const againX = flat(drawX(mX).node), againR = flat(drawX(mR).node), mF = { due: mX.due }, dF = drawX(mF, false), bF2 = btnOf(dF.node); bF2.on.click();
            check('1.6.3 (finding 36) a crossing\'s reminder card says the field and the step (Hit Points fell to 0 or less), an action\'s button says Apply and a roll\'s Roll; pressed, the card says Applied. or Rolled. Its card is below. in place of Pressed., and a refused press leaves the button to try again',
                /Death check \u2014 Hit Points fell to 0 or less/.test(textX) && bXw === 'Apply' && bRw === 'Roll' && /Applied\./.test(againX) && !/Pressed/.test(againX) && /Rolled\. Its card is below\./.test(againR) && mF.done === false && !bF2.disabled && bF2.textContent === 'Apply', j([textX, bXw, bRw, againX, againR]));
            // the review of rolls (finding 4): on a player's app an action's press goes to the host, which may still refuse it, so the card says Sent, never
            // Applied; a roll still says Rolled (a refusal of it makes the card live again); the GM's own press of an action says Applied, as it lands at once
            const drawC = (m, cli) => new Function('el', 'chatTime', 'document', 'window', 'crossWhy', 'isClient', rdSrc + NL + 'return renderDue;')(fakeEl, () => '12:00', { createTextNode: t => ({ tag: '#text', textContent: t, children: [] }) }, { wpSheets: { runDue: () => true } }, DCX.crossWhy, () => cli)(m);
            const mC = { due: Object.assign({}, mX.due) }, bC = btnOf(drawC(mC, true)); bC.on.click(); const cAfter = flat(drawC(mC, true)), cBtn = bC.textContent;
            const mCr = { due: Object.assign({}, mX.due, { roll: 1 }) }, bCr = btnOf(drawC(mCr, true)); bCr.on.click(); const crAfter = flat(drawC(mCr, true));
            const mCg = { due: Object.assign({}, mX.due) }, bCg = btnOf(drawC(mCg, false)); bCg.on.click(); const cgAfter = flat(drawC(mCg, false));
            check('1.6.3 (the review of rolls, finding 4) a player\'s press of an action says Sent, since the host may still refuse it, and never Applied; a player\'s roll says Rolled; the GM\'s own press of an action says Applied',
                cBtn === 'Sent' && /Sent\./.test(cAfter) && !/Applied/.test(cAfter) && /Rolled\. Its card is below\./.test(crAfter) && /Applied\./.test(cgAfter), j([cBtn, cAfter, crAfter, cgAfter]));
        }
        const spentD = new Function('el', 'chatTime', 'document', 'window', rdSrc + NL + 'return renderDue;')(fakeEl, () => '12:00', { createTextNode: t => ({ tag: '#text', textContent: t, children: [] }) }, { wpSheets: { runDue: () => true, dueBlock: (c, a) => c === 'c_a' && a === 'r_re' ? 'No Reaction left this turn' : '' } })({ due: mD.due }), spentB = btnOf(spentD);
        check('the live test, 2026-10-30: a Due card whose roll costs what is left none of says so and is grayed, never disabled: no new turn draws it again, and the host judges the press; its line is the one that wraps',
            /No Reaction left this turn\./.test(flat(spentD)) && /chat-due-spent/.test(spentD.className) && !!spentB && !spentB.disabled && /'roll-expr chat-due-what'/.test(rdSrc) && !/chat-due-spent/.test(dd.node.className), flat(spentD));
        const mR = { due: mD.due }, seenR = [], nodeR = new Function('el', 'chatTime', 'document', 'window', rdSrc + NL + 'return renderDue;')(fakeEl, () => '', { createTextNode: t => ({ tag: '#text', textContent: t, children: [] }) }, { wpSheets: { runDue: () => { seenR.push(mR.done); return true; } } })(mR); btnOf(nodeR).on.click();
        check('T2b a reminder is marked pressed before its press runs (the GM\'s own press posts its card, and the chat redraws the reminder then: it must already read Pressed)', j(seenR) === j([true]) && mR.done === true, j(seenR));
        {   // 1.6.3 (defense fold 1): the cards of an attack that carries its damage (dice.js landBtns and renderDue, run for real on a fake page)
            const lbSrc = dsB.slice(dsB.indexOf('function landBtns(wrap, rec, m, bs, theirs) {'), dsB.indexOf('function renderApply(m) {')), calls = [];
            const drawL = (due, o) => { o = o || {}; const m = o.m || { due }; if (o.over) { m.over = 1; m.overSay = o.over; } const n = { role: o.client ? 'client' : 'host', landsOk: () => o.ok !== false, landTake: a => { calls.push(['take', a]); return true; }, landNoDefense: a => { calls.push(['nodef', a]); return true; }, landNow: a => { calls.push(['now', a]); return true; }, landStuck: () => o.stuck === true, sendStuck: () => o.sstuck === true, sendOn: (a, h) => { calls.push(['send', a, h]); return true; }, sendOnAsk: (a, h) => { calls.push(['ask', a, h]); return true; } };
                const node = new Function('el', 'chatTime', 'document', 'window', 'net', 'landWhy', lbSrc + NL + 'return renderDue;')(fakeEl, () => '12:00', { createTextNode: t => ({ tag: '#text', textContent: t, children: [] }) }, { wpSheets: { runDue: () => { calls.push(['due']); return true; }, runLand: (c, a, t, r) => { calls.push(['land', c, a, t, r]); return true; } } }, () => n, r => 'the attack' + (r.on ? ' on ' + r.on : '') + ' landed')(m);
                const wk = x => [x].concat((x.children || []).flatMap(wk)); return { node, m, btns: wk(node).filter(x => x.tag === 'button'), text: flat(node) }; };
            const res = { charId: 'c_s', act: 'r_def', why: 'resist', roll: 1, att: 'a_abcd1234', round: 1, ts: 1, label: 'Dodge', by: 'Kael', lnd: 1 };
            const pl = drawL(res, { client: true }), plB = pl.btns.map(b => b.textContent); pl.btns[1].on.click();
            const plOff = drawL(res, { client: true, ok: false }), offB = plOff.btns[1];
            const gmT = drawL(Object.assign({}, res, { theirs: 1 })), gmTB = gmT.btns.map(b => b.textContent); gmT.btns[0].on.click();
            const gmO = drawL(res), gmOB = gmO.btns.map(b => b.textContent);
            const dmgC = { charId: 'c_a', act: 'r_row', why: 'called', roll: 1, att: 'a_abcd1234', round: 1, ts: 1, label: 'Blast', lnd: 1, on: 'Pebbles', nm: 1, or: [{ row: { f: 'f_g', r: 'w_g1', i: 1 } }], now: 1 };
            const pd = drawL(dmgC, { client: true }); pd.btns[0].on.click(); const gd = drawL(Object.assign({}, dmgC, { theirs: 1 })), gdB = gd.btns.map(b => b.textContent); gd.btns[0].on.click();
            const ov1 = drawL(res, { over: 'land' }), ov2 = drawL(dmgC, { over: 'rolled' }), ov3 = drawL(dmgC, { over: 'gone' });
            // the review of defense fold 4 (finding 6): a card to send it on. The defender's own offers both; the GM's copy of a player's offers Turn it aside alone,
            // and Send it on too while that player is away (sendStuck), which the GM presses through sendOn
            const sndC = { charId: 'c_s', why: 'send', round: 1, att: 'a_abcd1234', ts: 1, label: 'Send it on', by: 'Kael', as: 'Sela' };
            const sOwn = drawL(sndC, { client: true }).btns.map(b => b.textContent), sTheirs = drawL(Object.assign({}, sndC, { theirs: 1 })).btns.map(b => b.textContent), sStuckL = drawL(Object.assign({}, sndC, { theirs: 1 }), { sstuck: true }), sStuck = sStuckL.btns.map(b => b.textContent);
            sStuckL.btns[0].on.click();
            check('1.6.3 the review of defense fold 4 (finding 6): a card to send it on offers its defender Send it on and Turn it aside; the GM\'s copy of a player\'s card offers Turn it aside alone, and Send it on as well while that player is away, which the GM sends through the host\'s own judge',
                j(sOwn) === j(['Send it on', 'Turn it aside']) && j(sTheirs) === j(['Turn it aside']) && j(sStuck) === j(['Send it on', 'Turn it aside']) && j(calls[calls.length - 1]) === j(['send', 'a_abcd1234', 'send']) && /not at the table/.test(sStuckL.btns[0].title), j([sOwn, sTheirs, sStuck, calls[calls.length - 1]]));
            check('1.6.3 (defense fold 1) the cards of an attack that carries its damage (renderDue and landBtns, run for real): a player\'s own defense card has its roll and Take it, which asks the host; Take it is off where the host is older; the GM\'s copy of a player\'s defense card and the GM\'s own card for an NPC offer No defense; the damage card says the attack on whom landed, and its press rolls it through runLand with its row; the GM\'s copy under Both offers Roll it now; a closed card says why, in the host\'s fixed word',
                j(plB) === j(['Roll', 'Take it']) && j(calls[0]) === j(['take', 'a_abcd1234']) && pl.m.done === true && pl.btns.every(b => b.disabled) && offB.disabled === true && /older/.test(offB.title)
                && j(gmTB) === j(['No defense']) && /Its player presses it\./.test(gmT.text) && j(calls[1]) === j(['nodef', 'a_abcd1234']) && j(gmOB) === j(['Roll', 'No defense'])
                && /Blast — the attack on Pebbles landed/.test(pd.text) && j(calls[2]) === j(['land', 'c_a', 'r_row', 'a_abcd1234', { f: 'f_g', r: 'w_g1', i: 1 }]) && j(gdB) === j(['Roll it now']) && j(calls[3]) === j(['now', 'a_abcd1234'])
                && /The attack landed, so this roll is over\./.test(ov1.text) && /Its damage was rolled\./.test(ov2.text) && /That attack did not land/.test(ov3.text) && ov1.btns.length === 0 && ov2.btns.length === 0, j([plB, gmTB, gmOB, gdB, calls, pd.text]));
            // 1.6.3 (found in a live two-peer check): No defense says what comes next under the Combat tab's When an attack lands (net.landBy, the host's own
            // rule), and a player's Take it, which cannot know that rule, says only that the damage follows
            const ndTip = new Function('el', 'document', 'window', 'net', lbSrc + NL + 'return noDefTip;')(fakeEl, {}, {}, () => null);
            check('1.6.3 (a live two-peer check) No defense says what comes next by the Combat tab\'s When an attack lands (dice.js noDefTip, run for real): a card for the attacker by default, the damage rolled at once under It is rolled at once, both under Both; with no rule told, a card; and a player\'s Take it says only that its damage follows',
                /comes to the attacker as a card$/.test(ndTip('card')) && /rolled at once$/.test(ndTip('now')) && !/attacker/.test(ndTip('now')) && /as a card, and your copy of it can roll it now$/.test(ndTip('both')) && ndTip('nonsense') === ndTip('card')
                && gmO.btns[1].title === ndTip('card') && /its damage follows$/.test(pl.btns[1].title) && dsB.includes("mk('No defense', noDefTip(typeof n.landBy === 'function' ? n.landBy() : 'card'),"), j([ndTip('card'), ndTip('now'), ndTip('both'), gmO.btns[1].title, pl.btns[1].title]));
            // the review of fold 1: the host's land-deny clears the pressed mark (landcheck runs that branch), and the card drawn again is live: its roll and Take it; the GM's copy under a card's own setting offers Roll it now only while the attacker's player is away
            const plPressed = drawL(res, { client: true, m: pl.m }), plPressedB = plPressed.btns.length; pl.m.done = false; const plRe = drawL(res, { client: true, m: pl.m }), plReB = plRe.btns.map(b => b.textContent), plReOn = plRe.btns.every(b => !b.disabled);
            const dmgCard = Object.assign({}, dmgC, { theirs: 1 }); delete dmgCard.now; const gst = drawL(dmgCard, { stuck: true }), gstB = gst.btns.map(b => b.textContent), gns = drawL(dmgCard, { stuck: false }), gnsB = gns.btns.map(b => b.textContent);
            check('1.6.3 (the review of defense fold 1) a player\'s defense card pressed and held shows no button; once the host\'s refusal clears its mark it is drawn live again with its roll and Take it; the GM\'s copy of a damage card under a card\'s own setting offers Roll it now only while the attacker\'s player is away, its tooltip saying so',
                plPressedB === 0 && /Pressed\./.test(plPressed.text) && j(plReB) === j(['Roll', 'Take it']) && plReOn && j(gstB) === j(['Roll it now']) && /not at the table/.test(gst.btns[0].title) && j(gnsB) === j([]), j([plPressedB, plReB, gstB, gnsB]));
        }
    }
    /* ---- Turn-based combat T5a: an effect's time from its note; a row's one remaining amount; the ticks; what the owner sees; the chip ---- */
    {
        const sysD = { combat: { turn: { secs: 1, units: [{ key: 'watch', label: 'Watch', secs: 14400 }] } } }, pl = S.parseLasts, ls = S.lastsSecs;
        check('T5a parseLasts / lastsSecs: a note that reads as an amount and a unit — turns or rounds (the System\'s A round is, else 6 s), seconds, minutes, hours, days, the system\'s own units by key or label, a plural s dropped, "next turn" one — is its time in game seconds; any other note none',
            j(pl('10 seconds')) === j({ n: 10, u: 'seconds' }) && j(pl(' 3  Turns ')) === j({ n: 3, u: 'turns' }) && j(pl('next turn')) === j({ n: 1, u: 'turns' }) && pl('until dawn') === null && pl('0 turns') === null && pl('3') === null && pl(5) === null && pl('10 parsecs') === null
            && ls({ dur: '3 turns' }, null) === 18 && ls({ dur: '3 turns' }, sysD) === 3 && ls({ dur: '1.5 minutes' }, sysD) === 90 && ls({ dur: '2 watches' }, sysD) === 28800 && ls({ dur: '1 Watch' }, sysD) === 14400 && ls({ dur: '2 hours' }, null) === 7200 && ls({ dur: 'until dawn' }, sysD) === 0 && S.roundSecs({ combat: { turn: { secs: 0 } } }) === 6);
        const rawT = { v: 1, name: 'T', fields: [{ id: 'f_hp', key: 'HP', kind: 'number', def: 10 }, { id: 'f_fx', key: 'Effects', kind: 'effects', edit: 'owner', hover: true }], rolls: [],
            effects: [{ id: 'e_b', name: 'Bless', dur: '2 turns', mods: [] }, { id: 'e_q', name: 'Quick', dur: '10 seconds', mods: [] }, { id: 'e_n', name: 'Mark', dur: 'until dawn', mods: [] }, { id: 'e_s', name: 'Secret', dur: '1 minute', vis: 'gm', mods: [] }], sheet: { sections: [] } };
        const gmT = cleanSystem(rawT, { F, gmView: true }), plT = cleanSystem(rawT, { F, gmView: false });
        const opA = (list, q, o) => S.applyEffectOp(gmT, { id: 'c_p', values: { f_fx: list } }, 'f_fx', q, F, o || {});
        const add1 = opA([], { op: 'add', rowId: 'x_1', ref: 'e_b' }, { now: 5000 }), add2 = opA([], { op: 'add', rowId: 'x_1', ref: 'e_b' }, { now: 5000, inCombat: true }), add3 = opA([], { op: 'add', rowId: 'x_1', ref: 'e_n' }, { now: 5000 });
        const again = opA([{ id: 'x_1', ref: 'e_b', on: false, t: { left: 2, at: 0 } }], { op: 'add', rowId: 'x_9', ref: 'e_b' }, { now: 7000 });
        const ah1 = opA([], { op: 'adhoc', row: { id: 'x_2', name: 'Stun', dur: '1 turn', mods: [] } }, { now: 9000 }), ah2 = opA([{ id: 'x_2', name: 'Stun', dur: '1 turn', mods: [], on: true, t: { left: 3, at: 0 } }], { op: 'adhoc', row: { id: 'x_2', name: 'Stunned', dur: '1 turn', mods: [] } }, { now: 9000 }), ah3 = opA([{ id: 'x_2', name: 'Stun', dur: '1 turn', mods: [], on: true, t: { left: 3, at: 0 } }], { op: 'adhoc', row: { id: 'x_2', name: 'Stun', dur: '2 turns', mods: [] } }, { now: 9000 });
        check('T5a an effect added starts its timer: its time from now (out of combat) or stopped (in a combat); added again, afresh; a note with no time none; a new ad hoc row one, an edit keeps it unless its duration changed',
            j(add1.value[0].t) === j({ left: 12, at: 5000 }) && j(add2.value[0].t) === j({ left: 12, at: 0 }) && !('t' in add3.value[0]) && j(again.value[0]) === j({ id: 'x_1', ref: 'e_b', on: true, t: { left: 12, at: 7000 } })
            && j(ah1.value[0].t) === j({ left: 6, at: 9000 }) && j(ah2.value[0].t) === j({ left: 3, at: 0 }) && j(ah3.value[0].t) === j({ left: 12, at: 9000 }), j([add1.value, add2.value, again.value, ah1.value, ah2.value, ah3.value]));
        const cv = v => S.cleanValue(gmT.fields.find(f => f.id === 'f_fx'), v, S.valueOpts(gmT));
        check('T5a a row keeps its timer through the cleaner (a number of seconds, 0 to 1e9, to the thousandth; at a whole ms or 0; p only as 1); a malformed one goes; a row without one stays as it was',
            j(cv([{ id: 'x_1', ref: 'e_b', on: true, t: { left: 12.34567, at: 5000.7, p: 1, x: 2 } }])) === j([{ id: 'x_1', ref: 'e_b', on: true, t: { left: 12.346, at: 5000, p: 1 } }]) && j(cv([{ id: 'x_1', ref: 'e_b', on: true, t: { left: -3, at: -1, p: true } }])[0].t) === j({ left: 0, at: 0 })
            && !('t' in cv([{ id: 'x_1', ref: 'e_b', on: true, t: { left: 'x' } }])[0]) && !('t' in cv([{ id: 'x_1', ref: 'e_b', on: true }])[0]) && j(cv([{ id: 'x_3', name: 'S', dur: '', mods: [], t: { left: 5, at: 0 } }])[0].t) === j({ left: 5, at: 0 }));
        const chT = { id: 'c_p', ownerId: 'u_a', values: { f_fx: [{ id: 'x_1', ref: 'e_b', on: true, t: { left: 12, at: 0 } }, { id: 'x_2', ref: 'e_s', on: true, t: { left: 60, at: 1000 } }, { id: 'x_3', name: 'Stun', dur: '1 turn', mods: [], t: { left: 6, at: 0 } }] } };
        const own = S.charFor(chT, plT, 'u_a', { lib: { e_b: gmT.effects[0], e_s: gmT.effects[3] } }), mate = S.charFor(chT, plT, 'u_b', { lib: { e_b: gmT.effects[0], e_s: gmT.effects[3] } });
        const ownRows = own && own.values.f_fx, mateRows = mate && mate.values && mate.values.f_fx;
        check('T5a the owner receives each timer (a library row\'s reference, a GM-only one inline, an ad hoc row); a teammate gets names only, never a timer — and never the GM-only effect (secrets R2 #17: the library row and the ad hoc row alone)',
            !!ownRows && ownRows.every(r => r.t) && j(ownRows.map(r => r.t.left)) === j([12, 60, 6]) && Array.isArray(mateRows) && mateRows.length === 2 && mateRows.every(r => !r.t) && !j(mateRows).includes('Secret') && mateRows[1].name === 'Stun', j([ownRows, mateRows]));
        const chK = { id: 'c_p', values: { f_hp: 3, f_fx: [{ id: 'x_1', ref: 'e_b', on: true, t: { left: 12, at: 0 } }, { id: 'x_2', ref: 'e_q', on: true, t: { left: 10, at: 1000 } }, { id: 'x_3', name: 'Stun', dur: '1 turn', mods: [], t: { left: 6, at: 0, p: 1 } }, { id: 'x_4', ref: 'e_n', on: true }, { id: 'x_5', ref: 'e_gone', on: true, t: { left: 1, at: 0 } }] } };
        const kT = S.fxTick(gmT, chK, 'turn', 5000), kB = S.fxTick(gmT, chK, 'bank', 5000), kR = S.fxTick(gmT, chK, 'resume', 5000), kC = S.fxTick(gmT, chK, 'clock', 12000), kC2 = S.fxTick(gmT, chK, 'clock', 5000);
        const tOf = (res, id) => { const l = res.values.f_fx; const r = l && l.find(x => x.id === id); return r ? r.t : null; };
        check('T5a fxTick: a turn banks a running clock then takes one round (6 s); a combat\'s start stops the clock, keeping what ran; its end starts it again unless paused; outside combat the clock alone; what runs out comes off by its name (the library\'s, or the row\'s, "An effect" when the definition is gone); a row with no timer is untouched',
            j(tOf(kT, 'x_1')) === j({ left: 6, at: 0 }) && tOf(kT, 'x_2') === null && j(kT.expired) === j(['Quick', 'Stun', 'An effect']) && kT.values.f_fx.some(r => r.id === 'x_4' && !r.t)
            && j(tOf(kB, 'x_2')) === j({ left: 6, at: 0 }) && j(tOf(kB, 'x_1')) === j({ left: 12, at: 0 }) && j(kB.expired) === '[]'
            && j(tOf(kR, 'x_1')) === j({ left: 12, at: 5000 }) && j(tOf(kR, 'x_3')) === j({ left: 6, at: 0, p: 1 }) && j(tOf(kR, 'x_2')) === j({ left: 10, at: 1000 })
            && j(kC.expired) === j(['Quick']) && j(kC2.values) === '{}' && j(S.fxTick(gmT, { id: 'c', values: {} }, 'turn', 1)) === j({ values: {}, expired: [], gone: [] }) /* 1.6.2: and gone, moved on purpose */ && j(kT.gone) === j([{ ref: 'e_q', v: 0 }]), j([kT, kB, kR, kC.expired, kC2]));
        const kG1 = S.fxTick(gmT, chK, 'game', 5000, 4), kG2 = S.fxTick(gmT, chK, 'game', 5000, 20), kG0 = [S.fxTick(gmT, chK, 'game', 5000, 0), S.fxTick(gmT, chK, 'game', 5000, -3), S.fxTick(gmT, chK, 'game', 5000, NaN), S.fxTick(gmT, chK, 'game', 5000), S.fxTick(gmT, chK, 'game', 5000, '4')];
        check('item 20 K4 fxTick by the game clock (the Calendar on, outside a fight): the move\'s seconds come off every row not paused, a clock still running banked first (10 s running since 1000, at 5000: 6 left, then 2), and each stops; a paused row waits; what runs out comes off by its name; no move, one back, or one that is no number changes nothing',
            j(tOf(kG1, 'x_1')) === j({ left: 8, at: 0 }) && j(tOf(kG1, 'x_2')) === j({ left: 2, at: 0 }) && j(tOf(kG1, 'x_3')) === j({ left: 6, at: 0, p: 1 }) && j(kG1.expired) === j(['An effect']) && kG1.values.f_fx.some(r => r.id === 'x_4' && !r.t)
            && tOf(kG2, 'x_1') === null && tOf(kG2, 'x_2') === null && j(kG2.expired) === j([gmT.effects.find(e => e.id === 'e_b').name, 'Quick', 'An effect']) && j(tOf(kG2, 'x_3')) === j({ left: 6, at: 0, p: 1 }) && kG0.every(r => j(r.values) === '{}' && r.expired.length === 0), j([kG1, kG2.expired, kG0]));
        // the sheet's chip and the effects list drawn for real (both looks), so a missing name in a render path fails here
        const shF = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), fxS = shF.slice(shF.indexOf('function fxLeftText('), shF.indexOf('// Stage 5g: a value colored by its sign'));
        const mkEl = (tag, cls, text) => ({ tag, className: cls || '', textContent: text === undefined ? '' : String(text), children: [], get childNodes() { return this.children; }, style: {}, dataset: {}, classList: { add() {}, toggle() {} }, appendChild(c) { this.children.push(c); return c; }, addEventListener(ev, fn) { this['_on' + ev] = fn; }, insertBefore(c) { this.children.unshift(c); return c; } });
        let campH = null, clientH = false; const cmts = [];
        const docF = { createTextNode: t => ({ textContent: t, children: [] }), querySelectorAll: () => [] };
        const API = new Function('el', 'iconNode', 'commitEffect', 'fxChangeText', 'opt', 'uid', 'iconText', 'effectForm', 'document', 'window', 'roundSecs', 'fxLeftNow', 'getActiveCampaign', 'isClient', 'lastsSecs', 'autoEffectsOn', 'F', 'var _fxLive = true, _fxForm = null, _fxView = "sheet";' + NL + fxS + NL + 'return { fxLeftText: fxLeftText, effectsInto: effectsInto };')(
            mkEl, () => mkEl('i'), (c, f, q) => cmts.push(q), () => 'x', mkEl, () => 'x_n', () => '', () => mkEl('div'), docF, {}, S.roundSecs, S.fxLeftNow, () => campH, () => clientH, S.lastsSecs, S.autoEffectsOn, () => F);   // conditions C4: the automatic rows
        const flat = n => (n.textContent || '') + (n.children || []).map(flat).join('|');
        const rowsF = [{ id: 'x_1', ref: 'e_b', on: true, t: { left: 12, at: 0 } }], sysL = gmT, sysC = Object.assign({}, gmT, { sheet: { sections: [], look: { effects: 'cards' } } });
        const wL = mkEl('div'), wC = mkEl('div'); API.effectsInto(wL, { id: 'f_fx' }, { id: 'c_p' }, rowsF, sysL, false); API.effectsInto(wC, { id: 'f_fx' }, { id: 'c_p' }, rowsF, sysC, false);
        const now0 = Date.now(), ft = API.fxLeftText;
        check('T5a what a timed effect shows (sheets.js, run for real): in a combat the rounds left (2 rounds, 1 round), by the clock the time (1:05, 42s, 2h 5m), paused held, run out "ending"; drawn as a list row and as a card, each with its chip',
            ft({ left: 12, at: 0 }, gmT) === '2 rounds left' && ft({ left: 5, at: 0 }, gmT) === '1 round left' && ft({ left: 65, at: now0 }, gmT) === '1:05 left' && ft({ left: 42, at: now0 }, gmT) === '42s left' && ft({ left: 7500, at: now0 }, gmT) === '2h 5m left'
            && ft({ left: 90, at: 0, p: 1 }, gmT) === 'paused, 1:30 left' && ft({ left: 0, at: 0 }, gmT) === 'ending' && /2 rounds left/.test(flat(wL)) && /2 rounds left/.test(flat(wC)), j([flat(wL).slice(0, 200), flat(wC).slice(0, 200)]));
        /* ---- T5b: pause / resume, reset, dismiss a row's countdown ---- */
        const cT = m => S.cleanCharEffect(Object.assign({ rid: 'r1', charId: 'c_1', fieldId: 'f_fx', op: 'timer', rowId: 'x_1' }, m));
        check('T5b the wire shape: a timer op carries its row and one of pause, resume, reset, dismiss (nothing else passes)',
            j(cT({ act: 'pause' })) === j({ rid: 'r1', charId: 'c_1', fieldId: 'f_fx', op: 'timer', rowId: 'x_1', act: 'pause' }) && ['resume', 'reset', 'dismiss'].every(a => cT({ act: a }) && cT({ act: a }).act === a)
            && cT({ act: 'explode' }) === null && cT({}) === null && cT({ act: 1 }) === null && cT({ act: '__proto__' }) === null && cT({ act: 'pause', rowId: 5 }) === null, j(cT({ act: 'pause' })));
        const TQ = act => ({ op: 'timer', rowId: 'x_1', act }), rB = t => [Object.assign({ id: 'x_1', ref: 'e_b', on: true }, t ? { t } : {})], tq = (res) => res.ok ? res.value[0].t : res.reason;
        const pz = opA(rB({ left: 12, at: 5000 }), TQ('pause'), { now: 8000 }), pzC = opA(rB({ left: 12, at: 0 }), TQ('pause'), { now: 8000, inCombat: true });
        const rs1 = opA(rB({ left: 9, at: 0, p: 1 }), TQ('resume'), { now: 20000 }), rs2 = opA(rB({ left: 9, at: 0, p: 1 }), TQ('resume'), { now: 20000, inCombat: true });
        check('T5b pause holds what is left (its clock stops, 3 s having run: 9 left; in a combat as it stands); resume carries on from there — by the clock from now, in a combat stopped for its turns; pausing a paused or untimed row, or resuming a running one, is refused',
            j(tq(pz)) === j({ left: 9, at: 0, p: 1 }) && j(tq(pzC)) === j({ left: 12, at: 0, p: 1 }) && j(tq(rs1)) === j({ left: 9, at: 20000 }) && j(tq(rs2)) === j({ left: 9, at: 0 })
            && tq(opA(rB({ left: 9, at: 0, p: 1 }), TQ('pause'), { now: 1 })) === 'value' && tq(opA(rB(null), TQ('pause'), { now: 1 })) === 'value' && tq(opA(rB({ left: 9, at: 5 }), TQ('resume'), { now: 1 })) === 'value', j([pz, pzC, rs1, rs2]));
        const re1 = opA(rB({ left: 3, at: 100 }), TQ('reset'), { now: 30000 }), re2 = opA(rB({ left: 3, at: 0 }), TQ('reset'), { now: 30000, inCombat: true }), re3 = opA(rB({ left: 3, at: 0, p: 1 }), TQ('reset'), { now: 30000 });
        const re4 = opA(rB(null), TQ('reset'), { now: 30000 }), re5 = opA([{ id: 'x_1', ref: 'e_n', on: true }], TQ('reset'), { now: 1 }), re6 = opA([{ id: 'x_1', name: 'Stun', dur: '1 turn', mods: [], on: true, t: { left: 1, at: 0 } }], TQ('reset'), { now: 1, inCombat: true });
        check('T5b reset starts its full time again (Bless 2 turns = 12 s): by the clock from now, in a combat stopped, a paused one stays paused; a row whose countdown was stopped gets one again; an ad hoc row by its own note; a note with no time is refused',
            j(tq(re1)) === j({ left: 12, at: 30000 }) && j(tq(re2)) === j({ left: 12, at: 0 }) && j(tq(re3)) === j({ left: 12, at: 0, p: 1 }) && j(tq(re4)) === j({ left: 12, at: 30000 }) && tq(re5) === 'value' && j(tq(re6)) === j({ left: 6, at: 0 }), j([re1, re2, re3, re4, re5, re6]));
        const dm = opA(rB({ left: 3, at: 100 }), TQ('dismiss'), { now: 1 });
        check('T5b dismiss stops the countdown: the effect stays, applied, until someone ends it; a row with none is refused; a missing row is "missing"',
            dm.ok && j(dm.value) === j([{ id: 'x_1', ref: 'e_b', on: true }]) && tq(opA(rB(null), TQ('dismiss'), { now: 1 })) === 'value' && tq(opA(rB({ left: 3, at: 0 }), { op: 'timer', rowId: 'x_9', act: 'pause' }, { now: 1 })) === 'missing', j(dm));
        const rawG = JSON.parse(JSON.stringify(rawT)); rawG.fields[1].edit = 'gm'; const gmG = cleanSystem(rawG, { F, gmView: true });
        const opP = (sys, o) => S.applyEffectOp(sys, { id: 'c_p', values: { f_fx: rB({ left: 12, at: 5000 }) } }, 'f_fx', TQ('pause'), F, Object.assign({ player: true, now: 8000 }, o));
        check('T5b who may: a player on a list they may change, unless the campaign keeps timers the GM\'s (timersGm); never on a list the GM alone changes; the GM always',
            opP(gmT, {}).ok && opP(gmT, { timersGm: true }).reason === 'field' && opP(gmG, {}).reason === 'field' && S.applyEffectOp(gmT, { id: 'c_p', values: { f_fx: rB({ left: 12, at: 5000 }) } }, 'f_fx', TQ('pause'), F, { now: 8000, timersGm: true }).ok);
        const bt = w => { const out = []; const walk = n => { if (/sheet-fx-tbtn/.test(n.className || '')) out.push(n); (n.children || []).forEach(walk); }; walk(w); return out; };
        const drawT = (rows, sys, ed) => { const w = mkEl('div'); API.effectsInto(w, { id: 'f_fx' }, { id: 'c_p' }, rows, sys, ed); return w; };
        const bRun = bt(drawT(rB({ left: 12, at: 5 }), sysL, true)), bPau = bt(drawT(rB({ left: 12, at: 0, p: 1 }), sysL, true)), bOff = bt(drawT(rB(null), sysL, true)), bNone = bt(drawT([{ id: 'x_1', ref: 'e_n', on: true }], sysL, true));
        const bCard = bt(drawT(rB({ left: 12, at: 5 }), sysC, true)), bRO = bt(drawT(rB({ left: 12, at: 5 }), sysL, false));
        clientH = true; campH = { turnRules: { timers: 'gm' } }; const bGm = bt(drawT(rB({ left: 12, at: 5 }), sysL, true)); campH = { turnRules: { timers: 'owner' } }; const bOwn = bt(drawT(rB({ left: 12, at: 5 }), sysL, true)); clientH = false; campH = null;
        cmts.length = 0; const press = bn => { if (bn && bn._onclick) bn._onclick({ stopPropagation() {} }); }; press(bRun[0]); press(bPau[0]); press(bRun[1]); press(bRun[2]);
        const tx = a => a.map(b => (/\bwi-(\w+)/.exec(b.className) || [])[1]).join(' ');
        check('T5b the controls (sheets.js, run for real): a running countdown shows pause, reset, stop; a paused one resume, reset, stop; one stopped reset only; an effect with no time none; a card the same; none where the list is not changeable, nor on a player\'s machine when the campaign keeps timers the GM\'s; each press sends its op',
            tx(bRun) === 'pause refresh stop' && tx(bPau) === 'play refresh stop' && tx(bOff) === 'refresh' && bNone.length === 0 && tx(bCard) === tx(bRun) && bRO.length === 0 && bGm.length === 0 && tx(bOwn) === tx(bRun)
            && j(cmts) === j([TQ('pause'), TQ('resume'), TQ('reset'), TQ('dismiss')]), j([tx(bRun), tx(bPau), tx(bOff), bNone.length, tx(bCard), bRO.length, bGm.length, tx(bOwn), cmts]));
        // 1.6.3, found by hand on 2026-11-20: the plain list's row draws its changes again (from 1.6.2 the statement that drew them stood inside a
        // trailing comment of the line before, so a row showed none), and a change that Times its number says it beside the change
        const sysM = Object.assign({}, gmT, { effects: gmT.effects.map(e => e.id === 'e_b' ? Object.assign({}, e, { mods: [{ f: 'f_hp', op: 'add', v: 1, perVal: true }] }) : e) });
        const modsOf = w => { const out = []; const walk = n => { if (/sheet-fx-mods/.test(n.className || '')) out.push(n.textContent); (n.children || []).forEach(walk); }; walk(w); return out; };
        check('effects list (sheets.js, run for real): a plain list row draws its changes line, a change that Times its number with its number after it; an effect with no change draws none',
            j(modsOf(drawT([{ id: 'x_1', ref: 'e_b', on: true, v: 3 }], sysM, false))) === j(['x × 3']) && j(modsOf(drawT([{ id: 'x_1', ref: 'e_b', on: true }], sysM, false))) === j(['x']) && modsOf(drawT([{ id: 'x_1', ref: 'e_q', on: true }], sysM, false)).length === 0,
            j([modsOf(drawT([{ id: 'x_1', ref: 'e_b', on: true, v: 3 }], sysM, false))]));
        const shT = fs.readFileSync(path.join(app, 'scripts', 'settings.js'), 'utf8'), hmT = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        check('T5b the option and the docs (source): Effect timers is a GM-only select writing camp.turnRules.timers (gm or owner); Help names the controls and the option',
            /<span class="set-name">Effect timers<small>Who may pause, reset or stop the countdown of a timed effect\.<\/small><\/span> <select id="setTimersMode"/.test(hmT) && /var val = _timersSel\.value === 'gm' \? 'gm' : 'owner';\s+camp\.turnRules = Object\.assign\(\{\}, camp\.turnRules && typeof camp\.turnRules === 'object' \? camp\.turnRules : \{\}, \{ timers: val \}\);/.test(shT)
            && /Those buttons are for its player and you, or for you only\. <b>Effect timers<\/b> sets which, and reaches players at the table at once\./.test(hmT));
    }
    /* ---- The bell (the HUD's notes, 2026-09-26): the log, pins on this machine, the panel, the effects feed — sheets.js run for real ---- */
    {
        const shB = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), DCB = await import(url('dicecore.js'));
        const bSrc = shB.slice(shB.indexOf('var BELL_DEPTHS = '), shB.indexOf('// One refresh path for every view of a character'));
        const mkDoc = () => {
            const doc = { activeElement: null };
            const E = tag => { const e = { tag, className: '', children: [], attrs: {}, on: {}, style: {}, title: '', type: '', value: '', disabled: false, scrollTop: 0, _t: '', parent: null,
                get textContent() { return this._t + this.children.map(c => c.textContent).join(''); }, set textContent(v) { this.children.forEach(c => { c.parent = null; }); this.children = []; this._t = String(v); },
                appendChild(c) { c.parent = this; this.children.push(c); if (c.tag === 'option' && !this.value) this.value = c.value; return c; }, setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener(k, f) { this.on[k] = f; },
                get classList() { const s = this; return { contains: k => s.className.split(/\s+/).includes(k) }; },
                all() { return this.children.flatMap(c => [c, ...c.all()]); }, querySelector(q) { return this.all().find(c => c.classList.contains(q.slice(1))) || null; }, querySelectorAll(q) { return this.all().filter(c => c.classList.contains(q.slice(1))); },
                contains(x) { return x === this || this.all().includes(x); }, focus() { doc.activeElement = this; }, click() { if (this.on.click) this.on.click({ preventDefault() {} }); } }; return e; };
            doc.E = E; return doc;
        };
        const rawFx = { v: 1, name: 'B', rolls: [{ id: 'r_a', label: 'Attack', formula: '1d20' }], fields: [{ id: 'f_hp', key: 'HP', kind: 'number', def: 10 }, { id: 'f_fx', key: 'Effects', kind: 'effects', edit: 'owner' }],
            effects: [{ id: 'e_b', name: 'Bless', mods: [], tone: 'buff' }, { id: 'e_p', name: 'Poisoned', mods: [], tone: 'debuff' }], sheet: { sections: [] } };
        const sysB = cleanSystem(rawFx, { F, gmView: true }), sysNoRoll = cleanSystem(Object.assign({}, rawFx, { rolls: [] }), { F, gmView: true });
        // o: { client, me, sys, prefs, rolls, open, diceOff } — read at call time
        const run = o => {
            o = o || {}; const doc = mkDoc(), prefs = Object.assign({}, o.prefs), toasts = [];
            const el = (t, c, x) => { const e = doc.E(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
            const iconNode = (v, c) => { const e = el('span', c + ' wp-glyph'); e.attrs.icon = v; return e; };
            const camp = { id: 'k1', chars: { c_a: { id: 'c_a', name: 'Bren', ownerId: 'u_me', values: { f_fx: [] } }, c_b: { id: 'c_b', name: 'Ana', ownerId: 'u_mate', values: { f_fx: [] } }, c_c: { id: 'c_c', name: 'Bren', ownerId: 'u_other', values: {} } } };
            const netS = { myId: 'u_me', rollSeq: () => 1, rollsFor: () => (o.rolls || []) };
            const win = { wpVtt: { on: k => k !== 'dice' || !o.diceOff }, wpDice: { renderCard: m => el('div', 'chat-roll', 'card') }, wpDiceCore: DCB };
            const huds = {}, fresh = id => (huds[id] = { charId: id, foot: el('div', 'hud-foot'), histOpen: false, bellOpen: !!o.open });
            const canOpen = id => !!camp.chars[id] && (!o.client || camp.chars[id].ownerId === (o.me || 'u_me'));
            const api = new Function('el', 'iconNode', 'pref', 'setPref', 'getActiveCampaign', 'charById', 'net', 'systemOf', 'huds', 'document', 'window', 'HUD_CID', 'isClient', 'myId', 'canOpen', 'toast', 'featureOn',
                bSrc + '\nreturn { bellNote, bellPin, bellDrop, bellClear, bellLog, bellFx, bellText, bellAgo, bellDepth, renderHudFoot, logs: _bell };')(
                el, iconNode, (k, d) => (k in prefs ? prefs[k] : d), (k, v) => { prefs[k] = String(v); }, () => camp, (id, cp) => (cp || camp).chars[id] || null, () => netS, () => (o.sys === undefined ? sysB : o.sys), huds, doc, win,
                /^c_[A-Za-z0-9_]{1,24}$/, () => !!o.client, () => o.me || 'u_me', canOpen, m => toasts.push(m), () => true);
            return { api, camp, huds, fresh, prefs, toasts, doc, cls: (v, q) => v.foot.querySelectorAll(q) };
        };
        const b1 = run(), A = b1.api;
        const nA = A.bellNote('c_a', { title: 'Hit\u202e  by  \u0007 a trap', text: 'x'.repeat(400), bad: true }), nB = A.bellNote('c_a', { title: '', text: 'plain' }), nC = A.bellNote('c_a', { title: '', text: ' \u200b ' });
        const nApply = A.bellNote('c_a', { apply: { label: 'Apply wounds', lines: [{ n: 'HP', d: -3, v: 7 }, { n: 'FP', d: 2, v: 5 }] } }), nApply0 = A.bellNote('c_a', { apply: { lines: [{ n: 'HP', d: -1, v: 9 }] } });
        const nDue = A.bellNote('c_a', { due: { label: 'Regenerate', as: 'Bren', why: 'turn' } }), nX = A.bellNote('c_x', { title: 'T' }), nBad = A.bellNote('../x', { title: 'T' });
        check('The bell: a note is text only (controls and bidi marks gone, spaces folded, title 60, text 300), newest first; one with nothing left is dropped; an apply card is its action and changes ("HP \u22123 \u2192 7, FP +2 \u2192 5", "Applied" without a label), a reminder its line; a character not here or a bad id takes none',
            nA.title === 'Hit by a trap' && nA.text.length === 300 && nA.bad === 1 && nB.title === '' && nB.text === 'plain' && nC === null && nApply.title === 'Apply wounds' && nApply.text === 'HP \u22123 \u2192 7, FP +2 \u2192 5' && nApply.bad === 0
            && nApply0.title === 'Applied' && nDue.title === 'Reminder' && nDue.text === 'Regenerate for Bren is due (the start of its turn)' && nX === null && nBad === null && j(A.bellLog('c_a').recs.map(r => r.id)) === j(['n5', 'n4', 'n3', 'n2', 'n1']), j(A.bellLog('c_a').recs));
        const cl = run({ client: true }), CA = cl.api, byAs = n => CA.bellNote('', { apply: { label: 'X', lines: [{ n: 'HP', d: 1, v: 2 }] } }, n);
        const own1 = byAs('Bren'), mate = byAs('Ana'), none = byAs('Nobody'), noAs = byAs(''), gmBlank = A.bellNote('', { title: 'T' }, 'Bren');
        cl.camp.chars.c_d = { id: 'c_d', name: 'Bren', ownerId: 'u_me', values: {} }; const two = byAs('Bren');
        check('The bell: on a player\'s machine a card found by its name lands on their own one character of that name (Bren, not the other player\'s Bren); a teammate\'s, an unknown name, no name, or two of theirs so named: none; the GM\'s machine never guesses by name; a player\'s bell takes notes for their own characters only',
            own1 && CA.bellLog('c_a').recs.length === 1 && mate === null && none === null && noAs === null && two === null && gmBlank === null && CA.bellNote('c_b', { title: 'T' }) === null && CA.bellNote('c_a', { title: 'T' }) !== null);
        const cp = run(); for (let i = 0; i < 14; i++) cp.api.bellNote('c_a', { title: 'n' + i });
        const capped = cp.api.bellLog('c_a').recs.map(r => r.title);
        const pinT = run(); for (let i = 0; i < 3; i++) pinT.api.bellNote('c_a', { title: 'p' + i }); pinT.api.bellPin('c_a', 'n1'); pinT.api.bellPin('c_a', 'n2'); for (let i = 0; i < 20; i++) pinT.api.bellNote('c_a', { title: 'q' + i });
        const kept = pinT.api.bellLog('c_a').recs;
        check('The bell: it keeps the depth (12 by default: the 14th note pushes out the two oldest), never a pinned note (two pinned from the start survive twenty more, the list still 12)',
            capped.length === 12 && capped[0] === 'n13' && capped[11] === 'n2' && kept.length === 12 && kept.filter(r => r.pinned).map(r => r.title).sort().join() === 'p0,p1' && A.bellDepth() === 12, j([capped, kept.map(r => r.title)]));
        const lim = run(); for (let i = 0; i < 12; i++) lim.api.bellNote('c_a', { title: 'l' + i }); const pinned = []; for (let i = 1; i <= 12; i++) pinned.push(lim.api.bellPin('c_a', 'n' + i));
        check('The bell: at most depth \u2212 1 pinned (11 at 12): the twelfth pin is refused with a notice; unpinning frees a place',
            pinned.slice(0, 11).every(x => x === true) && pinned[11] === false && j(lim.toasts) === j(['At most 11 notes can be pinned.']) && lim.api.bellPin('c_a', 'n3') === false && lim.api.bellPin('c_a', 'n12') === true && lim.api.bellPin('c_a', 'n99') === null);
        const st = run(); st.api.bellNote('c_a', { title: 'Keep me', text: 'why', bad: true }); st.api.bellNote('c_a', { title: 'Loose' }); st.api.bellNote('c_b', { title: 'Other' }); st.api.bellPin('c_a', 'n1'); st.api.bellPin('c_b', 'n1');
        const stored = JSON.parse(st.prefs['wp_bellPins.k1']);
        const st2 = run({ prefs: st.prefs }), restored = st2.api.bellLog('c_a').recs.slice(), next = st2.api.bellNote('c_a', { title: 'After' });
        check('The bell: a pin is saved on this machine (wp_bellPins.<campaign>: each character\'s pinned notes, id, title, text, time, bad only when set) and a new session restores them pinned, its next note numbered past them',
            j(Object.keys(stored)) === j(['c_a', 'c_b']) && j(Object.keys(stored.c_a[0]).sort()) === j(['at', 'bad', 'id', 'text', 'title']) && stored.c_a[0].title === 'Keep me' && !('bad' in stored.c_b[0])
            && restored.length === 1 && restored[0].pinned === true && restored[0].title === 'Keep me' && restored[0].bad === 1 && next.id === 'n2', j([stored, restored]));
        st.api.bellPin('c_a', 'n1'); const unp = JSON.parse(st.prefs['wp_bellPins.k1']); st.api.bellDrop('c_b', 'n1'); const dropped = JSON.parse(st.prefs['wp_bellPins.k1']);
        st.api.bellNote('c_a', { title: 'x' }); st.api.bellPin('c_a', 'n3'); const before = st.prefs['wp_bellPins.k1']; st.api.bellClear('c_a');
        check('The bell: unpinning or removing a pinned note takes it out of the store; Clear drops the unpinned only and leaves the store as it was',
            !('c_a' in unp) && 'c_b' in unp && j(dropped) === '{}' && st.api.bellLog('c_a').recs.map(r => r.title).join() === 'x' && st.prefs['wp_bellPins.k1'] === before, j([unp, dropped, st.api.bellLog('c_a').recs]));
        const junk = { c_a: [{ id: 'n1', title: 'ok', text: '', at: 5 }, { id: 'x1', title: 'bad id', at: 1 }, { id: 'n2', title: 'no time' }, { id: 'n3', title: '', text: '', at: 1 }, { id: 'n4', title: 5, text: 'num title', at: 2 }, 'str', null], '../c': [{ id: 'n1', title: 'path', at: 1 }], c_b: 'nope' };
        const jr = run({ prefs: { 'wp_bellPins.k1': JSON.stringify(junk) } }), jl = jr.api.bellLog('c_a').recs.slice(), jw = (jr.api.bellPin('c_a', 'n4'), jr.api.bellPin('c_a', 'n4'), JSON.parse(jr.prefs['wp_bellPins.k1'])), gar = run({ prefs: { 'wp_bellPins.k1': '{not json' } }), arr = run({ prefs: { 'wp_bellPins.k1': '[1,2]' } });
        const proto = run({ prefs: { 'wp_bellPins.k1': '{"__proto__":[{"id":"n1","title":"p","at":1}],"constructor":[{"id":"n1","title":"c","at":1}]}' } });
        check('The bell: saved pins are read like a file — a note with a bad id, no time or nothing to show is dropped (a number title becomes text), a bad character id or a non-list is skipped (and gone from the store at its next write), a broken store is none, and no key reaches the prototype',
            j(jl.map(r => [r.id, r.title, r.text])) === j([['n1', 'ok', ''], ['n4', '5', 'num title']]) && j(Object.keys(jw)) === j(['c_a']) && jw.c_a.length === 2 && gar.api.bellLog('c_a').recs.length === 0 && arr.api.bellLog('c_a').recs.length === 0 && proto.api.bellLog('c_a').recs.length === 0 && ({}).title === undefined, j(jl));
        const ui = run({ rolls: [{ roll: { id: 'r1' } }] }), v = ui.fresh('c_a'); ui.api.renderHudFoot(v);
        const bellB = () => v.foot.querySelector('.hud-bell-btn');
        const closedNone = bellB() && !ui.cls(v, '.hud-bell-count').length && bellB().attrs['aria-expanded'] === 'false' && bellB().title === 'Notes: none yet this session' && v.foot.children.length === 1;
        ui.api.bellNote('c_a', { title: 'A' }); ui.api.bellNote('c_a', { title: 'B', text: 'bee', bad: true }); ui.api.bellNote('c_a', { title: 'C' }); ui.api.bellPin('c_a', 'n1'); ui.api.renderHudFoot(v);
        const counted = ui.cls(v, '.hud-bell-count')[0] && ui.cls(v, '.hud-bell-count')[0].textContent === '3' && bellB().title === '3 notes kept, 1 pinned';
        bellB().focus(); bellB().click();
        const order = ui.cls(v, '.hud-bell-ntitle').map(e => e.textContent), notes = ui.cls(v, '.hud-bell-note');
        check('The bell (the panel, run for real): the bell sits in the foot\'s bar (none noted: no count); with notes a count and a title saying what is kept; pressed, the panel opens ABOVE the bar, pinned first then newest, a bad note marked, a pinned one marked, each with a pin and a remove, a time, and focus back on the bell',
            closedNone && counted && v.foot.children[0].className === 'hud-bell' && v.foot.children[1].className === 'hud-hist-bar' && j(order) === j(['A', 'C', 'B'])
            && notes[0].className.includes('hud-bell-pinned') && notes[2].className.includes('hud-bell-bad') && ui.cls(v, '.hud-bell-pin')[0].children[0].attrs.icon === 'icon:thumbtack-slash' && ui.cls(v, '.hud-bell-pin')[1].children[0].attrs.icon === 'icon:thumbtack'
            && ui.cls(v, '.hud-bell-rm').length === 3 && ui.cls(v, '.hud-bell-ago')[0].textContent === 'just now' && ui.cls(v, '.hud-bell-text').map(e => e.textContent).join() === 'bee' && ui.cls(v, '.hud-bell-pins')[0].textContent === '1 of 11 pinned' && ui.doc.activeElement === bellB(), j(order));
        ui.cls(v, '.hud-bell-pin')[1].click(); const afterPin = ui.cls(v, '.hud-bell-ntitle').map(e => e.textContent);
        ui.cls(v, '.hud-bell-rm')[2].click(); const afterRm = ui.cls(v, '.hud-bell-ntitle').map(e => e.textContent), noClr = ui.cls(v, '.hud-bell-clear').length === 0; ui.api.bellNote('c_a', { title: 'D' });
        ui.cls(v, '.hud-bell-clear')[0].click(); const afterClr = ui.cls(v, '.hud-bell-ntitle').map(e => e.textContent), clrGone = ui.cls(v, '.hud-bell-clear').length === 0;
        const dsel = ui.cls(v, '.hud-bell-depth')[0], dOpts = dsel.children.map(o => o.value); dsel.value = '25'; dsel.on.change(); const d25 = ui.prefs.wp_hudBellDepth;
        check('The bell (the panel): its pin pins (C goes up, the pinned newest first), its remove removes, Clear shows only with an unpinned note, keeps the pinned and then goes; the depth is 12, 25 or 50, kept as the pref wp_hudBellDepth',
            j(afterPin) === j(['C', 'A', 'B']) && ui.api.bellLog('c_a').recs.filter(r => r.pinned).length === 2 && j(afterRm) === j(['C', 'A']) && noClr && j(afterClr) === j(['C', 'A']) && clrGone && j(dOpts) === j(['12', '25', '50']) && d25 === '25' && ui.api.bellDepth() === 25
            && run({ prefs: { wp_hudBellDepth: '7' } }).api.bellDepth() === 12, j([afterPin, afterRm, afterClr]));
        const lim2 = run({ open: true, rolls: [{ roll: { id: 'r1' } }] }), vL = lim2.fresh('c_a'); vL.bellOpen = true; for (let i = 0; i < 12; i++) lim2.api.bellNote('c_a', { title: 't' + i }); for (let i = 1; i <= 11; i++) lim2.api.bellPin('c_a', 'n' + i); lim2.api.renderHudFoot(vL);
        const unpinned = lim2.cls(vL, '.hud-bell-pin').filter(b => b.children[0].attrs.icon === 'icon:thumbtack');
        const nr = run({ sys: sysNoRoll }), vN = nr.fresh('c_a'); nr.api.renderHudFoot(vN); const hid = vN.foot.children.length; nr.api.bellNote('c_a', { title: 'x' });
        const em = run({ open: true, rolls: [] }), vE = em.fresh('c_b'); em.api.renderHudFoot(vE);
        check('The bell (the panel): at the limit the unpinned note\'s pin is disabled and says why; a system with nothing to roll shows no foot until the bell holds a note, then the bar with the bell alone; open and empty it names the character',
            unpinned.length === 1 && unpinned[0].disabled === true && unpinned[0].title === 'At most 11 notes can be pinned' && hid === 0 && vN.foot.children.length === 1 && nr.cls(vN, '.hud-hist-toggle').length === 0 && nr.cls(vN, '.hud-bell-btn').length === 1
            && em.cls(vE, '.hud-bell-empty')[0].textContent === 'No notes for Ana yet this session.');
        const fx = run(), FA = fx.api, fxr = fx.camp.chars.c_a.values.f_fx; fx.camp.chars.c_b.values.f_fx.push({ id: 'x_8', ref: 'e_p', on: true });
        FA.bellFx(null); const first = FA.bellLog('c_a').recs.length + FA.bellLog('c_b').recs.length;
        fxr.push({ id: 'x_1', ref: 'e_b', on: true }, { id: 'x_2', ref: 'e_p', on: true }, { id: 'x_3', name: 'Stun', dur: '', mods: [], on: true }); FA.bellFx('c_a');
        const added = FA.bellLog('c_a').recs.map(r => [r.title, r.text, r.bad]);
        fxr[0].on = false; FA.bellFx('c_a'); fxr[0].on = true; FA.bellFx(null); fxr.splice(1, 1); FA.bellFx('c_a'); FA.bellFx('c_a');
        const later = FA.bellLog('c_a').recs.slice(0, 3).map(r => [r.title, r.text]);
        const fxP = run({ client: true }); fxP.api.bellFx(null); fxP.camp.chars.c_b.values.f_fx.push({ id: 'x_9', ref: 'e_b', on: true }); fxP.api.bellFx('c_b');
        const fxN = run({ sys: cleanSystem(Object.assign({}, rawFx, { fields: [rawFx.fields[0]] }), { F, gmView: true }) }); fxN.api.bellFx(null); fxN.camp.chars.c_a.values.f_fx.push({ id: 'x_1', ref: 'e_b', on: true }); fxN.api.bellFx('c_a');
        check('The bell\'s effects feed: the first look records only (an effect already on is no news); then an effect applied (a debuff marked bad; an ad hoc row by its own name), suspended, resumed and ended each make one note, and nothing when nothing changed; a character this viewer cannot open takes none; a system with no effects list feeds nothing',
            first === 0 && j(added) === j([['Effect applied', 'Stun', 0], ['Effect applied', 'Poisoned', 1], ['Effect applied', 'Bless', 0]])
            && j(later) === j([['Effect ended', 'Poisoned'], ['Effect resumed', 'Bless'], ['Effect suspended', 'Bless']]) && FA.bellLog('c_a').recs.length === 6 && fxP.api.bellLog('c_b').recs.length === 0 && fxN.api.bellLog('c_a').recs.length === 0, j([added, later]));
        const hmB = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        check('The bell (source): every repaint of a character\'s views and the one-second watch run the effects feed; a HUD window starts with the bell closed; Help says what it keeps and that pins stay on this computer',
            /function renderViews\(charId, skip\) \{\n    if \(typeof _chgNow === 'number' && _chgNow > 0 && typeof chgDefer === 'function'\) \{ chgDefer\(charId, skip\); return; \}[^\n]*\n    if \(typeof bellFx === 'function'\) \{ try \{ bellFx\(charId\); \}/.test(shB) && /_lastCamp = id; try \{ bellFx\(null\); \}/.test(shB) && /v\.histOpen = false; v\.bellOpen = false;/.test(shB) && /window\.wpSheets = \{ bellNote: bellNote,/.test(shB)
            && /The <b>bell<\/b> beside it keeps the character&rsquo;s <b>notes<\/b>/.test(hmB) && /Pins stay on this computer, never on the character/.test(hmB));
    }
    /* ---- Stage 6 HUD H12: the handbook search placement — sheets.js run for real on a tiny DOM, with the real docrender search ---- */
    {
        const shH = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), DRH = await import(url('docrender.js'));
        const hSrc = shH.slice(shH.indexOf('/* Stage 6 HUD H12: the handbook search placement'), shH.indexOf('// A handbook link placement'));
        const mkH = o => {
            o = o || {}; const doc = { activeElement: null, roots: [] };
            const matches = (e, q) => { const m = /^\.([\w-]+)(?:\[data-hb="([^"]*)"\])?$/.exec(q); if (m) return e.className.split(/\s+/).includes(m[1]) && (m[2] === undefined || e.dataset.hb === m[2]); const b = /^\[data-blk="(\d+)"\]$/.exec(q); return !!b && e.dataset.blk === b[1]; };
            const E = tag => { const e = { tag, className: '', children: [], attrs: {}, on: {}, dataset: {}, style: {}, title: '', type: '', value: '', disabled: false, placeholder: '', maxLength: 0, _t: '', isConnected: true,
                classList: { add(k) { e.className += ' ' + k; }, contains: k => e.className.split(/\s+/).includes(k) },
                get textContent() { return this._t + this.children.map(c => c.textContent).join(''); }, set textContent(v) { this.children = []; this._t = String(v); },
                appendChild(c) { this.children.push(c); return c; }, setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener(k, f) { this.on[k] = f; },
                all() { return this.children.flatMap(c => c.all ? [c, ...c.all()] : [c]); }, querySelector(q) { return this.all().find(c => c.className !== undefined && matches(c, q)) || null; }, querySelectorAll(q) { return this.all().filter(c => c.className !== undefined && matches(c, q)); },
                focus() { doc.activeElement = e; }, click() { if (this.on.click) this.on.click({ preventDefault() {}, stopPropagation() {} }); }, scrollIntoView() { e.scrolled = true; } }; return e; };
            const el = (t, c, x) => { const e = E(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
            doc.createTextNode = t => ({ textContent: String(t) }); doc.querySelector = q => { for (const r of doc.roots) { if (matches(r, q)) return r; const f = r.querySelector(q); if (f) return f; } return null; };
            const camp = { items: o.items || { d_c: { type: 'doc', meta: { title: 'Combat' }, blocks: [{ type: 'h1', title: 'Combat', sub: 'Rules of the fight' }, { type: 'h2', title: 'Movement' }, { type: 'text', content: 'Move your Speed.' }, { type: 'h2', title: 'Moving diagonally' }, { type: 'h3', title: 'Moves in water' }, { type: 'h3', title: 'Moves in mud' }, { type: 'text', content: 'Mud costs double.' }] },
                d_s: { type: 'doc', meta: { title: 'Secrets', players: false }, blocks: [{ type: 'text', content: 'The dragon sleeps.' }] }, m_1: { type: 'map', meta: { title: 'Not a page' } } } };
            const timers = [], opened = [], rendered = [];
            const win = { wpDocRender: DRH, wpDocRenderPage: (page, it) => { rendered.push(it.meta.title); (it.blocks || []).forEach((b, i) => { const d = el('div', 'pv-blk'); d.dataset.blk = String(i); page.appendChild(d); }); } };
            const api = new Function('el', 'iconNode', 'getActiveCampaign', 'window', 'document', 'openPage', 'setTimeout', 'clearTimeout', hSrc + '\nreturn { hbNode, hbKey, hbState, state: _hb };')(
                el, (v, c) => el('span', c), () => camp, win, doc, id => opened.push(id), (f, ms) => { timers.push([f, ms]); return timers.length; }, () => {});
            const mount = key => { const b = api.hbNode(key); doc.roots = [b]; return b; };
            const type = (b, v) => { const i = b.querySelector('.sheet-hb-q'); i.value = v; i.on.input(); };
            const texts = (b, q) => b.querySelectorAll(q).map(x => x.textContent);
            return { api, camp, doc, timers, opened, rendered, mount, type, texts };
        };
        const H = mkH(), b0 = H.mount('h-c_a-s_x-0');
        check('H12 the placement (run for real): nothing typed, it lists the pages here by title (the GM-only one marked), never another kind of item; the text button waits for two characters',
            JSON.stringify(H.texts(b0, '.sheet-hb-ptitle')) === JSON.stringify(['Combat', 'Secrets']) && b0.querySelectorAll('.sheet-chip-gm').length === 1 && b0.querySelector('.sheet-hb-q').placeholder === 'Search the handbook' && b0.querySelector('.sheet-hb-deep').disabled === true
            && b0.querySelector('.sheet-hb-q').dataset.fid === 'h-c_a-s_x-0' && b0.querySelector('.sheet-hb-q').dataset.part === 'q', JSON.stringify(H.texts(b0, '.sheet-hb-ptitle')));
        H.type(b0, 'mov');
        const heads1 = H.texts(b0, '.sheet-hb-head'), more1 = H.texts(b0, '.sheet-hb-more');
        b0.querySelector('.sheet-hb-more').click(); const heads2 = H.texts(b0, '.sheet-hb-head');
        check('H12 typing searches the headings: the page, then three of its matching headings and "+N more", which shows the rest; the text button is ready',
            JSON.stringify(heads1) === JSON.stringify(['Movement', 'Moving diagonally', 'Moves in water']) && JSON.stringify(more1) === JSON.stringify(['+1 more']) && heads2.length === 4 && !b0.querySelector('.sheet-hb-more') && b0.querySelector('.sheet-hb-deep').disabled === false, JSON.stringify([heads1, more1, heads2]));
        H.type(b0, 'dragon'); const waiting = H.texts(b0, '.sheet-hb-empty'), t1 = H.timers.length;
        H.timers[t1 - 1][0](); const deep1 = H.texts(b0, '.sheet-hb-sub'), marks = b0.all().filter(m => m.tag === 'mark').map(m => m.textContent), where = H.texts(b0, '.sheet-hb-where');
        check('H12 no heading matching three characters or more: it says it is looking in the text and does, by itself 450 ms later — each place with its page (and heading), the words marked',
            JSON.stringify(waiting) === JSON.stringify(['No heading matches \u2014 looking in the text\u2026']) && H.timers[t1 - 1][1] === 450 && JSON.stringify(deep1) === JSON.stringify(['In the text: 1 place']) && JSON.stringify(marks) === JSON.stringify(['dragon']) && JSON.stringify(where) === JSON.stringify(['Secrets']), JSON.stringify([waiting, deep1, marks, where]));
        H.type(b0, 'rules of'); H.timers[H.timers.length - 1][0](); const once = H.texts(b0, '.sheet-hb-where');
        const tb = H.timers.length; H.type(b0, 'xy'); const short = H.texts(b0, '.sheet-hb-empty'), t2 = H.timers.length;
        b0.querySelector('.sheet-hb-q').on.keydown({ key: 'Enter', preventDefault() {}, stopPropagation() {} }); const none = H.texts(b0, '.sheet-hb-sub');
        H.type(b0, 'double'); b0.querySelector('.sheet-hb-deep').click(); const deep2 = H.texts(b0, '.sheet-hb-where');
        check('H12 two characters wait for Enter (no timer); Enter or the button searches the text now (nothing found says so); a place under the page\'s own title heading names the page once',
            JSON.stringify(once) === JSON.stringify(['Combat']) && JSON.stringify(short) === JSON.stringify(['No heading matches. Press Enter to look in the text.']) && t2 === tb && JSON.stringify(none) === JSON.stringify(['Nothing in the text either.']) && JSON.stringify(deep2) === JSON.stringify(['Combat \u203a Moves in mud']), JSON.stringify([short, none, deep2]));
        b0.querySelector('.sheet-hb-hit').click(); const b1 = H.doc.roots[0], pg = b1.querySelector('.sheet-hb-page'), target = pg && pg.querySelector('[data-blk="5"]');
        const tScroll = H.timers[H.timers.length - 1]; tScroll[0]();
        check('H12 a place opens its page right here: back to the results, the page\'s title, Open in reader; the reader\'s own render in a doc-view box, taken to the heading once (marked)',
            JSON.stringify(H.texts(b1, '.sheet-hb-rtitle')) === JSON.stringify(['Combat']) && b1.querySelectorAll('.sheet-hb-back').length === 1 && b1.querySelectorAll('.sheet-hb-open').length === 1 && pg && pg.className === 'doc-view sheet-hb-page'
            && JSON.stringify(H.rendered) === JSON.stringify(['Combat']) && target && target.scrolled === true && target.className.includes('sheet-hb-here') && H.api.state['h-c_a-s_x-0'].go === false, JSON.stringify(H.rendered));
        const nT = H.timers.length, b2 = H.mount('h-c_a-s_x-0');
        check('H12 what it shows is kept for the session: a repaint draws the same page again without taking the reader back to the heading',
            b2.querySelectorAll('.sheet-hb-page').length === 1 && H.timers.length === nT && H.rendered.length === 2);
        b2.querySelector('.sheet-hb-open').click(); b2.querySelector('.sheet-hb-back').click(); const b3 = H.doc.roots[0];
        check('H12 Open in reader opens that page there; back returns to the results, the words still typed and the search box focused',
            JSON.stringify(H.opened) === JSON.stringify(['d_c']) && b3.querySelector('.sheet-hb-q').value === 'double' && H.doc.activeElement === b3.querySelector('.sheet-hb-q') && H.texts(b3, '.sheet-hb-where').length === 1);
        b3.querySelector('.sheet-hb-q').on.keydown({ key: 'Escape', preventDefault() {}, stopPropagation() {} }); const cleared = H.texts(b3, '.sheet-hb-ptitle');
        const g = mkH(); const gb = g.mount('s-c_a-s_x-1'); g.type(gb, 'secrets'); gb.querySelector('.sheet-hb-page-row').click(); delete g.camp.items.d_s; const gb2 = g.mount('s-c_a-s_x-1');
        const e = mkH({ items: {} }), eb = e.mount('p-x-x-0');
        check('H12 Esc empties the words (back to the list); a page gone (or hidden from this player since) falls back to the results; no pages: says so; keys are made of safe characters only',
            JSON.stringify(cleared) === JSON.stringify(['Combat', 'Secrets']) && gb2.querySelectorAll('.sheet-hb-page').length === 0 && gb2.querySelectorAll('.sheet-hb-q').length === 1 && JSON.stringify(e.texts(eb, '.sheet-hb-empty')) === JSON.stringify(['No handbook pages here yet.'])
            && g.api.hbKey({ view: 'hud' }, { id: 'c_a"]x' }, { id: 's_1' }, 2) === 'h-c_ax-s_1-2' && g.api.hbKey({ preview: true, view: 'hud' }, null, null, 0) === 'p-x-x-0' && g.api.hbKey({ view: 'sheet' }, { id: 'c_b' }, { id: 's_2' }, 3) === 's-c_b-s_2-3');
        const rawH = { v: 1, name: 'H', fields: [], rolls: [], sheet: { sections: [{ id: 's_a', title: 'Rules', fields: [{ kind: 'search', w: 'row' }, { kind: 'search', w: 1, text: 'x' }] }] } };
        const gH = cleanSystem(rawH, { F, gmView: true }), pH = cleanSystem(rawH, { F, gmView: false });
        const hbC = fs.readFileSync(path.join(app, 'scripts', 'handbook.js'), 'utf8').replace(/\r\n/g, '\n'), hmH = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
        check('H12 the kind: a search placement is kept in both views (no GM data rides on it: the pages are the viewer\'s own); the section draws it keyed by view, character, section and place; the editor offers it beside Handbook link; the reader and the placement share one render; Help says so',
            JSON.stringify(gH.sheet.sections[0].fields) === JSON.stringify([{ kind: 'search', w: 'row' }, { kind: 'search', w: 1 }]) && JSON.stringify(pH.sheet.sections[0].fields) === JSON.stringify(gH.sheet.sections[0].fields)
            && /else if \(pl\.kind === 'search'\) node = printV \? null : hbNode\(hbKey\(vctx, c, sec, pli\)\);/.test(shH) && /opts\.push\(\['k:link', 'Handbook link'\], \['k:search', 'Handbook search'\]\);/.test(require('./checkkit').part('sysedlayout.js')) && /if \(pl\.kind === 'search'\) return 'Handbook search';/.test(require('./checkkit').part('sysedlayout.js'))
            && /function renderInto\(body, it\) \{ renderPage\(body, it\); openSig = sigOf\(it\); \}/.test(hbC) && /window\.wpDocRenderPage = renderPage;/.test(hbC)
            && /A <b>Handbook search<\/b> placement lists the pages the viewer can read and searches them\. Put it on a HUD&rsquo;s Handbook tab, say\./.test(hmH));
        // H12b: a chip or a Handbook link opens its page in the character's HUD search when the HUD has one (the reference's openHandbook)
        const mkJ = o => {
            const opened = [], huds = [], win = { wpDocRender: DRH, wpPopout: !!o.popout };
            const sysJ = { sheet: { hud: { sections: o.secs } } };
            const api = new Function('el', 'iconNode', 'getActiveCampaign', 'window', 'document', 'openPage', 'setTimeout', 'clearTimeout', 'hudFor', 'systemOf', 'openHud', hSrc + '\nreturn { hbHudTarget, openPageFor, state: _hb };')(
                () => ({}), () => ({}), () => ({ items: {} }), win, {}, id => opened.push(id), () => 0, () => {}, id => o.may !== false && id === 'c_a', () => sysJ, (id, op) => huds.push([id, op]));
            return { api, opened, huds };
        };
        const secsJ = [{ id: 's_top', tab: 't_act', fields: [{ id: 'f_hp' }, { kind: 'link', page: 'd_c' }] }, { id: 's_rules', tab: 't_hb', fields: [{ kind: 'heading' }, { kind: 'search', w: 'row' }] }, { id: 's_more', tab: 't_hb', fields: [{ kind: 'search' }] }];
        const j1 = mkJ({ secs: secsJ }); j1.api.openPageFor({ id: 'c_a' }, 'd_c');
        const j2 = mkJ({ secs: secsJ, may: false }); j2.api.openPageFor({ id: 'c_a' }, 'd_c');
        const j3 = mkJ({ secs: [{ id: 's_x', tab: 't_a', fields: [{ kind: 'link' }] }] }); j3.api.openPageFor({ id: 'c_a' }, 'd_c');
        const j4 = mkJ({ secs: secsJ, popout: true }); j4.api.openPageFor({ id: 'c_a' }, 'd_c');
        const j5 = mkJ({ secs: [{ id: 's_n', fields: [{ kind: 'search' }] }] }); j5.api.openPageFor({ id: 'c_a' }, 'd_c');
        check('H12b a chip or Handbook link (run for real): when the character\'s HUD (theirs to open) has a Handbook search, the first one takes the page (at its top, taken there once) and the HUD opens at its tab; otherwise — no HUD of theirs, no search in it, a pop-out sheet — the page opens as before; a search on no tab opens the HUD as it is',
            JSON.stringify(j1.huds) === JSON.stringify([['c_a', { tab: 't_hb' }]]) && !j1.opened.length && JSON.stringify(j1.api.state['h-c_a-s_rules-1'].view) === JSON.stringify({ id: 'd_c', bi: -1 }) && j1.api.state['h-c_a-s_rules-1'].go === true && !('h-c_a-s_more-0' in j1.api.state)
            && JSON.stringify(j2.opened) === '["d_c"]' && !j2.huds.length && JSON.stringify(j3.opened) === '["d_c"]' && !j3.huds.length && JSON.stringify(j4.opened) === '["d_c"]' && !j4.huds.length && JSON.stringify(j5.huds) === JSON.stringify([['c_a', null]]), JSON.stringify([j1.huds, j1.opened]));
        check('H12b the chips and links pass their character: a section\'s chip and a Handbook link open through openPageFor (never openPage directly any more)',
            /var chipNode = sec\.chip \? pageChip\(sec\.chip, c\) : null;/.test(shH) && /else if \(pl\.kind === 'link'\) node = linkNode\(pl, c\);/.test(shH) && /if \(ch\.closest\('#systemModal'\)\) return; openPageFor\(c, id\); \};/.test(shH) && /if \(b\.closest\('#systemModal'\)\) return; openPageFor\(c, pl\.page\); \}\);/.test(shH)
            && /When the character&rsquo;s HUD has a Handbook search, the page opens right there in it\./.test(hmH) && /\(hbHudTarget\(c\) \? 'in the HUD\\u2019s handbook search' : 'over the map'\)/.test(shH));
    }
    /* ---- Stage 6 library L0: a system import counts what it left out ---- */
    {
        const rawL = { v: 1, name: 'Big', fields: [{ id: 'f_a', key: 'A', kind: 'number' }, { id: 'f_a', key: 'Dup', kind: 'number' }, 'junk'], rolls: [{ id: 'r_1', label: 'R', formula: '1d6' }],
            items: Array.from({ length: 2005 }, (_, i) => ({ id: 'i_' + i, name: 'Item ' + i })), effects: [{ id: 'e_1', name: 'E', mods: [] }, { nope: 1 }] };
        const cL = cleanSystem(rawL, { F, gmView: true }), dL = S.droppedCounts(rawL, cL);
        const shL = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        check('L0 droppedCounts: per kind, what the file had that cleaning left out (205 items past the 200 limit: 5; a duplicate and a junk field: 2; a bad effect: 1); a kind that lost nothing is not listed; nothing for a non-object',
            JSON.stringify(dL) === JSON.stringify({ fields: 2, items: 5, effects: 1 }) && cL.items.length === 2000 && JSON.stringify(S.droppedCounts(null, cL)) === '{}' && JSON.stringify(S.droppedCounts({ items: 'x' }, cL)) === '{}', JSON.stringify(dL));
        check('L0 the import\'s notice names the items it kept and counts what it left out ("Left out (over the limits, or not valid): 5 items"), singular for one',
            /var dr = droppedCounts\(j, c\), drT = typeof droppedWords === 'function' \? droppedWords\(dr\) : Object\.keys\(dr\)\.map\(function\(k\) \{ return dr\[k\] \+ ' ' \+ \(dr\[k\] === 1 \? k\.slice\(0, -1\) : k\); \}\)\.join\(', '\);/.test(require('./checkkit').part('sysedtabs.js')) && /\(drT \? ' Left out \(over the limits, or not valid\): ' \+ drT \+ '\.' : ''\)/.test(require('./checkkit').part('sysedtabs.js')) && /nN\(c\.fields\.length, 'field'\) \+ ', ' \+ nN\(c\.rolls\.length, 'roll'\)/.test(require('./checkkit').part('sysedtabs.js')));   // moved on purpose (1.6.0): the words through droppedWords, the one wording
        // 1.6.0 (the owner, 2026-10-28: "count dropped sections and placements, sheet and HUD, with what is said today, and warn in the System editor too")
        const fsL = [{ id: 'f_a', key: 'A', kind: 'number' }], secL = (n, per) => Array.from({ length: n }, (_, i) => ({ id: 's_' + i, title: 'S', fields: Array.from({ length: per }, () => ({ kind: 'divider' })) }));
        const rawS = { v: 1, name: 'S', rolls: [], fields: fsL, sheet: { sections: secL(1003, 1).concat([{ id: 's_x', title: 'X', fields: [{ id: 'f_gone' }] }]), hud: { title: 'H', tabs: [], sections: [{ id: 's_h1', title: 'H', fields: [{ id: 'f_a' }, { id: 'f_nope' }, { kind: 'divider' }] }] } } };
        const cS = cleanSystem(rawS, { F, gmView: true }), dS = S.droppedCounts(rawS, cS);
        const capS = S.capsAt(cS), capW = S.droppedWords(dS);
        {   // 1.6.0: a text a limit cuts short is said; a system's caps at a campaign's size
            const rawT = { v: 1, name: 'T', fields: [{ id: 'f_a', key: 'A', label: 'A', kind: 'number', caption: 'c'.repeat(450) }, { id: 'f_b', key: 'B', label: 'B', kind: 'number', labels: ['One, two', 'Three'] }, { id: 'f_c', key: 'C', label: 'C', kind: 'number', caption: 'short  ' }], rolls: [{ id: 'r_a', label: 'R', formula: 'd6', needs: 'A > 0', needsText: 'n'.repeat(220) }], effects: [{ id: 'e_a', name: 'E', notes: 'e'.repeat(1100) }, { id: 'e_b', name: 'F', notes: 'e'.repeat(1000) }], items: [{ id: 'i_a', name: 'I', notes: 'i'.repeat(1100) }] };
            {   // 1.6.2 (found by the CORE session): a counter keyed as a stat of its list is left out, and the job that counted on it with it; both are said
                const rawK = { v: 1, name: 'K', rolls: [], fields: [{ id: 'f_w', key: 'Weap', label: 'Weapons', kind: 'item-list', vis: 'all', list: { stats: [{ key: 'Rld', label: 'Reload' }, { key: 'Rld', label: 'Twice' }], counters: [{ key: 'rld', label: 'Reloading' }, { key: 'Used', label: 'Used' }],
                    rolls: [{ label: 'Reload', apply: [{ c: 'Used', formula: '0', set: true }], job: { turns: 'Row.Rld', ct: 'rld' } }, { label: 'Fire', formula: '3d6', job: { turns: '2', ct: 'Used' } }] } }] };
                const cK = cleanSystem(rawK, { F, gmView: true }), dK = S.droppedCounts(rawK, cK);
                check('1.6.2 a list\'s stats, counters and jobs left out are said: a counter keyed as a stat and the job that counted on it, a stat keyed twice; a job kept on its own counter not counted; the words say each; a fresh clean of a clean system counts none',
                    j(dK) === j({ 'list stats': 1, 'list counters': 1, jobs: 1 }) && S.droppedWords(dK) === '1 list stat, 1 list counter, 1 job' && cK.fields[0].list.counters.length === 1 && !('job' in cK.fields[0].list.rolls[0]) && j(cK.fields[0].list.rolls[1].job) === j({ turns: '2', ct: 'Used' })
                    && j(S.droppedCounts(cK, cleanSystem(cK, { F, gmView: true }))) === '{}', j(dK));
            }
            {   // 1.6.2 (the CORE session): a bundled icon the app does not know is cleared to none; counted wherever the file names one
                const known = Object.keys(S.GLYPHS || {})[0] || 'check', rawI = { v: 1, name: 'I', rolls: [], fields: [], effects: [{ id: 'e_a', name: 'Fallen', icon: 'icon:pebble-falling' }, { id: 'e_b', name: 'Fine', icon: 'icon:' + known }, { id: 'e_c', name: 'Plain', icon: '\u2605' }] };
                const cI = cleanSystem(rawI, { F, gmView: true }), dI = S.droppedCounts(rawI, cI);
                check('1.6.2 an icon the app does not know is counted and said (an emoji and a known icon are not), and a fresh clean of a clean system counts none',
                    dI.icons === 1 && S.droppedWords({ icons: 1 }) === '1 icon' && !('icons' in S.droppedCounts(cI, cleanSystem(cI, { F, gmView: true }))), j([dI, cI.effects.map(e => e.icon), known]));
            }
            const cT = cleanSystem(rawT, { F, gmView: true }), dT = S.droppedCounts(rawT, cT);
            check('1.6.0 a text a limit cuts short is said: a caption past 400, a roll\'s words past 200, notes past 1,000 each counted once, a text at its limit and one only trimmed not counted, a comma taken out of a value name no cut; the words say it, a fresh clean of a clean system counts none, and the caps stand where they were read',
                dT.texts === 4 && S.droppedWords({ texts: 4 }) === '4 texts cut short' && S.droppedWords({ texts: 1 }) === '1 text cut short' && S.droppedWords({ fields: 1, texts: 2 }) === '1 field, 2 texts cut short' && !('texts' in S.droppedCounts(cT, cleanSystem(cT, { F, gmView: true }))) && !('texts' in S.droppedCounts({ __proto__: { x: 'y' }, fields: 'no' }, cT))
                && cT.fields[0].caption.length === 400 && cT.rolls[0].needsText.length === 200 && cT.effects[0].notes.length === 1000 && cT.effects[1].notes.length === 1000 && cT.items[0].notes.length === 1000, JSON.stringify(dT));
            const rawL = { v: 1, name: 'L', fields: [{ id: 'f_n', key: 'N', label: 'N', kind: 'number' }, { id: 'f_l', key: 'L', label: 'L', kind: 'item-list', list: { rolls: [{ label: 'R', formula: 'd6', needs: 'N > 0', needsText: 'n'.repeat(190) }, { label: 'S', formula: 'd6', needs: 'N > 0', needsText: 'n'.repeat(230) }] } }], rolls: [] };
            const cL = cleanSystem(rawL, { F, gmView: true }), lR = cL.fields.find(f => f.id === 'f_l').list.rolls;
            check('1.6.0 a list roll\'s words keep what a system roll\'s keep: 190 characters whole, more held to 200 and said', lR[0].needsText.length === 190 && lR[1].needsText.length === 200 && S.droppedCounts(rawL, cL).texts === 1, JSON.stringify(lR.map(r => (r.needsText || '').length)));
            const rawE = { v: 1, name: 'E', fields: [], rolls: [], effects: Array.from({ length: 2005 }, (_, i) => ({ id: 'e_' + i, name: 'E' + i })) };
            const cE = cleanSystem(rawE, { F, gmView: true });
            check('1.6.0 a system holds 200 effects: the last taken and more left out, said on load and in the editor as at the limit', cE.effects.length === 2000 && S.droppedCounts(rawE, cE).effects === 5 && S.capsAt(cE).some(x => x.what === 'effects' && x.n === 2000 && x.max === 2000) && !S.capsAt({ effects: cE.effects.slice(1) }).length, JSON.stringify(S.capsAt(cE)));
        }
        const at400 = cleanSystem({ v: 1, name: 'P', rolls: [], fields: fsL, sheet: { sections: secL(2, LIMITS.placements / 2) } }, { F, gmView: true }), capP = S.capsAt(at400);
        const ioL = fs.readFileSync(path.join(app, 'scripts', 'io.js'), 'utf8').replace(/\r\n/g, '\n');
        const cnSrc = require('./checkkit').cut('sysedtabs.js', '// [systemcheck:capnote-start]', '// [systemcheck:capnote-end]');
        const CL = new Function('droppedWords', 'capsAt', cnSrc + '\nreturn capLines;')(S.droppedWords, S.capsAt);
        const linesS = CL(cS, dS), linesNone = CL(cleanSystem({ v: 1, name: 'N', rolls: [], fields: fsL }, { F, gmView: true }), null);
        check('1.6.0 a system\'s drops counted for its layouts too: droppedCounts names the sheet\'s sections past the limit (104 read, 100 kept: 4) and the placements its kept sections lost, a section left out taking its own with it, the HUD\'s apart; droppedWords says them in the one wording; capsAt names what stands at its limit (100 sections on the sheet, 800 placements since 1.6.0, moved on purpose), nothing for a small system',
            JSON.stringify(dS) === JSON.stringify({ sections: 4, 'HUD placements': 1 }) && cS.sheet.sections.length === 1000 && capW === '4 sections, 1 HUD placement' && S.droppedWords({}) === '' && S.droppedWords(null) === ''
            && JSON.stringify(capS) === JSON.stringify([{ what: 'sections', n: 1000, max: 1000 }]) && JSON.stringify(capP.map(a => a.what)) === JSON.stringify(['placements']) && S.capsAt(null).length === 0,
            JSON.stringify([dS, capS, capW, capP]));
        check('1.6.0 the load says what it left out of a campaign\'s system once, on the GM\'s own save, logged as a step and kept for the System editor; the System editor\'s note (capLines, run for real) says that and what is at its limit, as text nodes, nothing where there is nothing to say',
            ioL.includes("if (csys && window.wpSystemCore.droppedCounts) { var sdr = window.wpSystemCore.droppedCounts(c.system, csys); if (Object.keys(sdr).length) _dropNotes.push({ camp: c, dr: sdr }); }")
            && ioL.includes("if (typeof _dropNotes !== 'undefined') { if (_dropNotes.length && canPersistLocal() && typeof noteDrops === 'function') noteDrops(_dropNotes); _dropNotes = []; }") && ioL.includes("window.wpStepLog('system v1', 'dropped', f);") && ioL.includes("window.wpSysDrops[c.id] = n.dr;")
            && JSON.stringify(linesS) === JSON.stringify(['When this campaign loaded, its system held more than Waypoint keeps, so this was left out: 4 sections, 1 HUD placement.', 'At the limit: 1000 sections on the sheet. One more would be left out.'])
            && linesNone.length === 0 && /while \(box\.firstChild\) box\.removeChild\(box\.firstChild\);\n    lines\.forEach\(function\(t\) \{ box\.appendChild\(el\('div', null, t\)\); \}\);/.test(cnSrc) && !/innerHTML/.test(cnSrc)
            && require('./checkkit').part('sysedtabs.js').includes("if (typeof capNoteSync === 'function') capNoteSync();"), JSON.stringify([linesS, linesNone]));
    }
    /* ---- Stage 6 library L1c: the library lookup (rowDef, projections), a library row kept through cleaning, the runtime's wiring ---- */
    {
        const rawK = { v: 1, name: 'K', rolls: [], items: [{ id: 'i_own', name: 'Own', category: 'Gear' }], fields: [{ id: 'f_inv', key: 'Gear', kind: 'item-list', edit: 'owner', list: { stats: [{ key: 'Wt', label: 'Weight' }] } }] };
        const sK = cleanSystem(rawK, { F, gmView: true }), pK = cleanSystem(rawK, { F, gmView: false });
        const libE = { id: 'i_lib', name: 'Rope', category: 'Gear', notes: '', vis: 'all', area: null, damage: '1d4', cost: '', throwSkill: '', stats: { Wt: 10 } }, snapE = { id: 'i_lib', name: 'Old rope', category: 'Old', notes: '', vis: 'all', area: null, damage: '', cost: '', throwSkill: '' };
        const row = { id: 'w_1', defId: 'i_lib', qty: 2, ov: { name: 'My rope' }, snap: snapE };
        const before = S.rowDef(sK, row);
        S.setLibraryFind(id => (id === 'i_lib' ? libE : id === 'i_bad' ? 'text' : id === 'i_own' ? Object.assign({}, libE, { id: 'i_own', name: 'Shadow' }) : null));
        const withLib = S.rowDef(sK, row), own = S.rowDef(sK, { id: 'w_2', defId: 'i_own', qty: 1 }), badLook = S.rowDef(sK, { id: 'w_3', defId: 'i_bad', qty: 1, snap: snapE });
        S.setLibraryFind(null); const after = S.rowDef(sK, row); S.setLibraryFind('nope'); const notFn = S.rowDef(sK, row); S.setLibraryFind(null);
        check('L1c rowDef reads the system\'s own items first, then the library this machine holds (its own values on top), then the row\'s copy; a lookup that answers no object, or none registered, leaves the copy',
            before.src === 'lost' && before.def.name === 'My rope' && withLib.src === 'lib' && withLib.def.name === 'My rope' && withLib.base === libE && withLib.def.damage === '1d4' && own.src === 'lib' && own.base.id === 'i_own' && own.def.name === 'Own'
            && badLook.src === 'lost' && after.src === 'lost' && notFn.src === 'lost', j([before.src, withLib.src, after.src]));
        const projF = S.projectRows([row], pK, id => (id === 'i_lib' ? libE : null), null), projN = S.projectRows([row], pK, () => null, null), projM = S.projectRows([row], pK, { i_lib: libE }, null), projT = S.projectRows([row], pK, () => 'text', null);
        check('L1c a projection takes the host\'s items as a lookup too (the library is never copied into a map): the entry inline for its owner with their values folded in and players\' fields only; nothing found, the copy; a map still works as before',
            projF[0].lnk === 1 && projF[0].def.name === 'My rope' && projF[0].def.category === 'Gear' && !projF[0].def.damage && projN[0].def.category === 'Old' && projT[0].def.category === 'Old' && j(projM) === j(projF), j([projF, projN]));
        const kept = S.cleanChar({ id: 'c_k', name: 'K', values: { f_inv: [row, { id: 'w_9', defId: 'i_gone', qty: 1 }] } }, sK);
        check('L1c a row that points at a library entry keeps its copy through cleaning (the system\'s items never list library entries), so a save loaded before its library arrives loses nothing; one with no copy is dropped as before',
            kept.values.f_inv.length === 1 && kept.values.f_inv[0].defId === 'i_lib' && kept.values.f_inv[0].snap.name === 'Old rope' && kept.values.f_inv[0].ov.name === 'My rope', j(kept.values.f_inv));
        const lbSrc = fs.readFileSync(path.join(app, 'scripts', 'library.js'), 'utf8').replace(/\r\n/g, '\n'), ioK = fs.readFileSync(path.join(app, 'scripts', 'io.js'), 'utf8').replace(/\r\n/g, '\n'), hmK = fs.readFileSync(path.join(app, 'index.html'), 'utf8'), stK = fs.readFileSync(path.join(app, 'scripts', 'settings.js'), 'utf8');
        check('L1c the runtime (library.js): only on the GM\'s own machine; each pinned revision read through librarycore; a newer read wins over a stale one; a pack written as its next revision before the manifest pins it; a new pack undone if its first write fails; the last pack deleted leaves no library (and no folder); its lookup registered with systemcore; the manifest watched each second; an old core said once',
            /function gmHere\(\) \{\n\s*var n = window\.wpNet; if \(n && n\.active && n\.role === 'client'\) return false; if \(n && \(n\.foreign \|\| n\.stream\)\) return false;/.test(lbSrc) && /fetch\('\/api\/library\?dir=' \+ m\.dir \+ '&pack=' \+ p\.id \+ '&rev=' \+ p\.rev\)/.test(lbSrc)
            && /var rd = readPackFile\(await res\.text\(\), ctx, seen\); if \(cur !== mine\) return cur;/.test(lbSrc) && /if \(!res \|\| !res\.ok\) \{ if \(res && res\.status === 404\) oldCore\(\); return \{ error:/.test(lbSrc)
            && lbSrc.indexOf("method: 'POST', body: body") < lbSrc.indexOf('p.rev = rev; p.count = meta.count;') && /if \(r\.error\) \{ if \(had\) camp\.library = had; else delete camp\.library; return r; \}/.test(lbSrc) && /var last = !m\.packs\.length; if \(last\) delete camp\.library; else camp\.library = m;/.test(lbSrc) && /\nsetLibraryFind\(entryFor\);\n/.test(lbSrc) && /if \(sig !== cur\.sig \|\| \(camp \? camp\.id : null\) !== cur\.campId\) load\(camp\); \}, 1000\);/.test(lbSrc)
            && /if \(c\.library !== undefined && window\.wpLibraryCore && window\.wpLibraryCore\.cleanManifest\) \{ var lman = window\.wpLibraryCore\.cleanManifest\(c\.library\); if \(lman\) c\.library = lman; else delete c\.library; \}/.test(ioK)
            && hmK.indexOf('scripts/librarycore.js') > hmK.indexOf('scripts/systemcore.js') && hmK.indexOf('scripts/librarycore.js') < hmK.indexOf('scripts/main.js') && hmK.indexOf('scripts/library.js') > 0 && /var SHELL_WANTED = '1\.6\.2';   \/\/ 1\.6\.2 adds \/api\/cloud [^;]*; 1\.6\.0 adds \/api\/account [^;]*; 1\.5\.9 carries [^;]*; 1\.5\.6 adds [^;]*; 1\.5\.0 added \/api\/library/.test(stK));
    }
    /* ---- Stage 6 library L1c2: exports and imports carry the library (source; the plan itself is librarycheck's) ---- */
    {
        const ioX = fs.readFileSync(path.join(app, 'scripts', 'io.js'), 'utf8').replace(/\r\n/g, '\n'), mnX = fs.readFileSync(path.join(app, 'scripts', 'main.js'), 'utf8').replace(/\r\n/g, '\n'), lbX = fs.readFileSync(path.join(app, 'scripts', 'library.js'), 'utf8').replace(/\r\n/g, '\n');
        check('L1c2 an export of a campaign (or everything) carries each pack file its manifest pins as library/<dir>/<id>.<rev>.json, so a campaign with a library always travels as a zip',
            /if \(scope === 'campaign' \|\| scope === 'all'\) \{\n\s*var libCamps = /.test(ioX) && /libFiles\.push\(\{ name: 'library\/' \+ lm\.dir \+ '\/' \+ pk\.id \+ '\.' \+ pk\.rev \+ '\.json', data: /.test(ioX) && /if \(!paths\.length && !libFiles\.length && !handle && !shareE\) return \{ name: base \+ '\.json', text: json, libMissing: libMissing, unlisted: unlisted \};/.test(ioX)
            && /var entries = \[\{ name: 'data\.json', data: enc\.encode\(json\) \}\]\.concat\(libFiles\);/.test(ioX));
        check('L1c2 an import uses a campaign\'s library manifest only with its pack files (a zip\'s library/ entries by exact name; a plain file carries none), a fresh folder for a new or replaced campaign, the folder here for a merge; the files are copied once the import is done',
            /var libE = entries\.filter\(function\(en\) \{ return \/\^library\\\/l_\[a-z0-9\]\{8\}\\\/p_\[A-Za-z0-9_\]\{1,24\}\\\.\[0-9\]\{1,10\}\\\.json\$\/\.test\(en\.name\) && en\.size <= 16 \* 1024 \* 1024; \}\);/.test(mnX)
            && /pendingImportImages = null; pendingImportLibrary = null;   \/\/ a plain file carries no pack files/.test(mnX) && /plan = pendingImportLibrary && ic && ic\.library && L && L\.importPlan \? L\.importPlan\(existingLib \|\| null, ic\.library\) : null;/.test(mnX) && /if \(!plan\) \{ if \(existingLib\) target\.library = existingLib; else delete target\.library; return; \}/.test(mnX)
            && /state\.appState\.campaigns\[ic\.id\] = ic;\n\s*takeImportedLibrary\(ic, ic, null\);/.test(mnX) && /if \(ic\.library\) takeImportedLibrary\(existing, ic, existing\.library\);/.test(mnX) && /state\.appState = cleanR;\n\n\s*Object\.values\(state\.appState\.campaigns \|\| \{\}\)\.forEach\(function\(c\) \{ if \(c && c\.library\) takeImportedLibrary\(c, c, null\); \}\);/.test(mnX)
            && /if \(libJobs\.length && window\.wpLibrary && window\.wpLibrary\.importFiles && !webI\) window\.wpLibrary\.importFiles\(libJobs, libFiles \|\| \{\}\);/.test(mnX));
        check('L1c2 an import\'s pack files are cleaned like any pack read (the file\'s own id must match), written at the revision the manifest now pins, with the manifest watch held until they are all there; then the library is read again',
            /var feD = null; if \(fe\) \{ try \{ feD = fe\.data \|\| await fe\.bytes\(\); \} catch \(eF\) \{ feD = null; \} \}[^\n]*\n\s*var rd = feD \? readPackFile\(new TextDecoder\(\)\.decode\(feD\), ctx\) : null; if \(!rd \|\| rd\.error \|\| rd\.pack\.id !== u\.pack\) \{ bad\+\+; if \(rows\) rows\.push\(\{ camp: camp, upload: u, how: 'left', why: 'damaged', max: 0 \}\); continue; \}\n\s*rd\.pack\.rev = u\.rev;/.test(lbX) && /setInterval\(function\(\) \{ if \(busy\) return;/.test(lbX) && /\} finally \{ busy--; \}/.test(lbX) && /load\(getActiveCampaign\(\)\);\n\s*return \{ ok: ok, bad: bad, rows: rows \};/.test(lbX));
    }
    /* ---- Stage 6 library L1d: the core (addressed library entries copied into the system) and the memoised players' view ---- */
    {
        const rawC = { v: 1, name: 'C', rolls: [{ id: 'r_s', label: 'Stealth', formula: '3d6 <= Skills.Stealth.Rank' }], items: [{ id: 'i_own', name: 'Climb', key: 'Climb', category: 'Skill', stats: { Rank: 2 } }],
            fields: [{ id: 'f_sk', key: 'Skills', kind: 'item-list', edit: 'owner', list: { cats: ['Skill'], stats: [{ key: 'Rank', label: 'Level' }] } }, { id: 'f_a', key: 'Pick', kind: 'formula', formula: 'Skills.Lockpick.Rank + Skills.Climb.Rank + Skills.on.Rank + Skills.count' },
                { id: 'f_note', key: 'Note', kind: 'text', caption: 'See Skills.Swim.x' }] };
        const sC = cleanSystem(rawC, { F, gmView: true });
        const lib = { stealth: [{ id: 'i_stl_gear', name: 'Stealth kit', key: 'Stealth', category: 'Gear' }, { id: 'i_stl', name: 'Stealth', key: 'Stealth', category: 'Skill', stats: { Rank: 12 } }], lockpick: [{ id: 'i_lp', name: 'Lockpick', key: 'Lockpick', category: 'Skill', vis: 'gm', stats: { Rank: 9 } }],
            climb: [{ id: 'i_climb_lib', name: 'Climb (lib)', key: 'Climb', category: 'Skill' }], count: [{ id: 'i_cnt', name: 'Count', key: 'Count', category: 'Skill' }], swim: [{ id: 'i_swim', name: 'Swim', key: 'Swim', category: 'Skill' }] };
        const asked = [], co = S.coreOf(sC, k => { asked.push(k); return lib[k] || []; });
        check('L1d coreOf: every List.Key.<name> any text of the system addresses (a roll, a formula, even a caption), for each item list — the library entry with that key in the list\'s categories (a Gear one of the same key passed over); none for a key the system\'s own items answer, for List.on.x or a list total; nothing without a lookup',
            j(co.core.map(e => e.id).sort()) === j(['i_lp', 'i_stl', 'i_swim']) && !asked.includes('climb') && !asked.includes('on') && !asked.includes('count') && co.over === 0 && j(S.coreOf(sC, null)) === j({ core: [], over: 0 }) && j(S.coreOf(null, () => [])) === j({ core: [], over: 0 }), j([co, asked]));
        const many = Array.from({ length: 10005 }, (_, i) => 'Skills.K' + i + '.Rank').join(' + '), sBig = Object.assign({}, sC, { fields: sC.fields.concat([{ id: 'f_big', key: 'Big', kind: 'text', caption: many }]) });
        const big = S.coreOf(sBig, k => (/^k\d+$/.test(k) ? [{ id: 'i_' + k, name: k, key: k, category: 'Skill' }] : lib[k] || []));
        check('L1d the core holds at most ' + S.LIMITS.core + ' entries (and ' + S.LIMITS.coreBytes + ' bytes); the rest are counted', big.core.length === S.LIMITS.core && big.over === 10005 + 3 - S.LIMITS.core, j([big.core.length, big.over]));
        const withCore = cleanSystem(Object.assign({}, rawC, { core: co.core.concat([{ id: 'i_own', name: 'Dup of an item' }, { id: 'i_stl', name: 'Dup' }, { nope: 1 }, { id: 'i_climb_lib', name: 'Climb (lib)', key: 'Climb', category: 'Skill', stats: { Rank: 5 } }]) }), { F, gmView: true }), plCore = cleanSystem(Object.assign({}, rawC, { core: co.core }), { F, gmView: false });
        check('L1d a system keeps its core cleaned as items are — one per id, never one of its own items, junk gone, at most ' + S.LIMITS.core + '; the players\' view leaves a GM-only entry out; a system without one has no core key at all (byte-identical)',
            j(withCore.core.map(e => e.id).sort()) === j(['i_climb_lib', 'i_lp', 'i_stl', 'i_swim']) && cleanSystem(Object.assign({}, rawC, { core: Array.from({ length: S.LIMITS.core + 5 }, (_, i) => ({ id: 'i_z' + i, name: 'Z' })) }), { F, gmView: true }).core.length === S.LIMITS.core && j(plCore.core.map(e => e.id).sort()) === j(['i_stl', 'i_swim']) && !('core' in sC) && j(cleanSystem(rawC, { F, gmView: true })) === j(sC));
        const chC = { id: 'c_c', name: 'C', values: { f_sk: [] } }, resCore = resolveAll(withCore, chC, F), resNone = resolveAll(sC, chC, F);
        check('L1d an addressed row not carried reads the core after the system\'s items (Skills.Lockpick.Rank reads 9 from the core; Skills.Climb.Rank reads the item\'s 2, never the core\'s 5 of the same key; without the core, only the item)',
            resCore.f_a.value === 11 && resNone.f_a.value === 2, j([resCore.f_a, resNone.f_a]));
        const lbD = fs.readFileSync(path.join(app, 'scripts', 'library.js'), 'utf8').replace(/\r\n/g, '\n'), shD = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        check('L1d the GM machine keeps the core current after every library change and every System save (the draft then carries it; never mid-load or at another\'s table), stored only when it changed and cleaned as a system; the players\' view is worked out once per exact system text and page set and handed out as a copy',
            /function after\(\) \{   \/\/ [^\n]*\n\s*try \{ refreshCore\(\); \}/.test(lbD) && /if \(!camp \|\| !camp\.system \|\| !gmHere\(\) \|\| cur\.campId !== camp\.id \|\| cur\.state === 'loading'\) return false;/.test(lbD) && /if \(before === nowT\) return false;/.test(lbD)
            && /var pages = readablePages\(camp\), key = JSON\.stringify\(camp\.system\) \+ '\\n' \+ pages\.join\(','\) \+ '\\n' \+ JSON\.stringify\(lcs\);\n[^\n]*\n[^\n]*key \+= n && nsh\(n\.id\) === true \? '1' : '0';[^\n]*\n[^\n]*\n[^\n]*key \+= rsh\(it\.needsIf\) === true \? 'R' : 'r';[^\n]*\n\s*if \(_pvMemo\.key !== key\) \{ var v = cleanSystem\(camp\.system, \{ F: F\(\), gmView: false, pages: pages, libCats: lcs, needShown: nsh, ruleShown: rsh, libWait: [^\n]*\}\);/.test(shD) && /return _pvMemo\.text === null \? null : JSON\.parse\(_pvMemo\.text\);/.test(shD)
            && /if \(window\.wpLibrary && window\.wpLibrary\.refreshCore\) \{ try \{ if \(window\.wpLibrary\.refreshCore\(camp, true\)\) clean = camp\.system; \}[^\n]*\n\s*draftSet\(clone\(clean\)\);/.test(require('./checkkit').part('sysederr.js'))
            && (lbD.match(/refreshCore\(/g) || []).length === 3 && /try \{ refreshCore\(\); \} catch/.test(lbD) && /refreshCore\(camp\); save\(true\); after\(\);/.test(lbD) && require('./checkkit').familyCount('sheets.js', /refreshCore\(/g) === 1);   // one caller says this is the editor's Save, counted over sheets.js and all its parts
        // the System editor's Save while the library holds no pack (found at the import of 2026-10-03): library.js refreshCore, sliced by its libcore markers
        // and run for real with the real keyIndex, coreOf and cleanSystem. The file's core: the three entries rawC's formulas address (Lockpick, Stealth, Swim)
        {
            const LCc = await import(url('librarycore.js')), cA = lbD.indexOf('// [systemcheck:libcore-start]'), cB = lbD.indexOf('// [systemcheck:libcore-end]');
            const runCore = o => {
                const camp = { id: 'k', system: cleanSystem(Object.assign({}, rawC, o.sys || {}, { core: o.core || co.core }), { F, gmView: true }) }; if (o.library !== undefined) camp.library = o.library;
                const out = { saves: 0 }, cur = Object.assign({ campId: 'k', state: 'none' }, o.cur || {}), before = j(camp.system.core || null);
                const fn = new Function('getActiveCampaign', 'gmHere', 'cur', 'keyIndex', 'entriesOf', 'coreOf', 'cleanSystem', 'F', 'toast', 'save', 'map', lbD.slice(cA, cB) + '\nreturn refreshCore;')(
                    () => camp, () => o.gm !== false, cur, LCc.keyIndex, pid => (o.packs && o.packs[pid]) || [], S.coreOf, cleanSystem, () => F, () => {}, () => { out.saves++; }, () => Object.create(null));
                const ret = 'atSave' in o ? fn(camp, o.atSave) : fn(camp);
                return [ret, out.saves, (camp.system.core || []).map(e => e.id).sort().join(','), j(camp.system.core || null) === before, 'core' in camp.system];
            };
            const ALL = 'i_lp,i_stl,i_swim', KEPT = j([false, 0, ALL, true, true]), GONE = j([true, 1, '', false, false]);
            const pack1 = { library: { packs: [{ id: 'p1', vis: 'all' }] }, packs: { p1: [{ id: 'i_stl2', name: 'Stealth', key: 'Stealth', category: 'Skill', stats: { Rank: 3 } }] } };
            const kept = [runCore({ atSave: true }), runCore({ atSave: true, library: { packs: [] } }), runCore({ atSave: true, library: {} })], gone = [runCore({}), runCore({ atSave: 1 }), runCore({ atSave: 'yes' }), runCore({ atSave: {} }), runCore({ atSave: false })];
            const fewer = runCore({ atSave: true, sys: { fields: rawC.fields.filter(f => f.id !== 'f_note') } }), extra = runCore({ atSave: true, core: co.core.concat([{ id: 'i_x', name: 'Extra', key: 'Xtra', category: 'Skill' }]) }), turned = runCore({ atSave: true, core: co.core.slice().reverse() });
            const withLib = [runCore(Object.assign({ atSave: true }, pack1)), runCore(pack1)], held = [runCore({ atSave: true, gm: false }), runCore({ atSave: true, cur: { campId: 'other' } }), runCore({ atSave: true, cur: { state: 'loading' } })];
            check('L1d the System editor\'s Save while the library holds no pack (library.js refreshCore, run for real): the core a system file came with is worked out again from itself — every entry a formula still addresses stays, nothing is saved, the core is the very text it was (no library, a manifest with no pack, a manifest with no list); an entry no formula names any more goes, and so does one nothing ever addressed; a core in another order is put in the order the core is always worked out in, with the same entries; only at that Save (true only): any other caller empties the core as before; with a pack in the library the library alone is read, at Save or not (the file\'s entries it does not hold go, its own entry of the key is taken); never on another machine, for another campaign or mid-load',
                cA > 0 && cB > cA && kept.every(r => j(r) === KEPT) && gone.every(r => j(r) === GONE) && j(fewer) === j([true, 1, 'i_lp,i_stl', false, true]) && j(extra) === j([true, 1, ALL, false, true]) && j(turned.slice(0, 3)) === j([true, 1, ALL]) && turned[4] === true
                && withLib.every(r => j(r) === j([true, 1, 'i_stl2', false, true])) && held.every(r => j(r) === KEPT), j([kept, gone, fewer, extra, turned, withLib, held]));
        }
    }
    /* ---- Stage 6 library L2c: the GM adds a library entry (its row carries the copy); the copies kept current ---- */
    {
        const rawC = { v: 1, name: 'C', rolls: [], items: [{ id: 'i_own', name: 'Own', category: 'Gear' }], fields: [{ id: 'f_inv', key: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { lvl: { name: 'Level', min: 0, max: 5, def: 1 }, price: 'Cost', stats: [{ key: 'Cost', label: 'Cost' }] } }, { id: 'f_multi', key: 'Many', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true } }] };
        const sC = cleanSystem(rawC, { F, gmView: true }), pC = cleanSystem(rawC, { F, gmView: false });
        const libR = { id: 'i_rope', name: 'Rope', category: 'Gear', notes: 'Fifty feet.', vis: 'all', area: null, damage: '1d4', cost: '', throwSkill: '', rm: 'bound', rmMsg: 'Tied on.', lvl: 3, stats: { Cost: 2 }, desc: 'Long text', gmNotes: 'x' };
        const chC = () => ({ id: 'c_1', name: 'C', values: { f_inv: [], f_multi: [] } });
        S.setLibraryFind(id => (id === 'i_rope' ? libR : null));
        const a1 = S.applyRowOp(sC, chC(), 'f_inv', { op: 'add', defId: 'i_rope', rowId: 'w_a1', qty: 1 }, F, {});
        const c2 = chC(); c2.values.f_inv = a1.value; const a2 = S.applyRowOp(sC, c2, 'f_inv', { op: 'add', defId: 'i_rope', rowId: 'w_a2', qty: 2 }, F, {});
        const m1 = S.applyRowOp(sC, chC(), 'f_multi', { op: 'add', defId: 'i_rope', rowId: 'w_m1' }, F, {}), c3 = chC(); c3.values.f_multi = m1.value; const m2 = S.applyRowOp(sC, c3, 'f_multi', { op: 'add', defId: 'i_rope', rowId: 'w_m2' }, F, {});
        const pl = S.applyRowOp(sC, chC(), 'f_inv', { op: 'add', defId: 'i_rope', rowId: 'w_p1' }, F, { player: true, view: pC });
        S.setLibraryFind(null); const none = S.applyRowOp(sC, chC(), 'f_inv', { op: 'add', defId: 'i_rope', rowId: 'w_n1' }, F, {});
        const r1 = a1.value && a1.value[0];
        check('L2c the GM adds a library entry: its row carries the copy (the GM\'s view of it, no library text), starts at its level and records its price; the same entry again raises the quantity (a list that takes it more than once: a new row); a player\'s pick of one is refused until the wire (L3); no library, none',
            a1.ok && r1.id === 'w_a1' && r1.defId === 'i_rope' && r1.qty === 1 && r1.lvl === 3 && r1.paid === 2 && r1.snap && r1.snap.name === 'Rope' && r1.snap.rm === 'bound' && r1.snap.damage === '1d4' && !('desc' in r1.snap) && !('gmNotes' in r1.snap) && a1.note === 'bound'
            && a2.ok && a2.value.length === 1 && a2.value[0].qty === 3 && m2.ok && m2.value.length === 2 && pl.ok === false && pl.reason === 'missing' && none.ok === false && none.reason === 'missing', j([a1, a2.value, pl, none]));
        const kC = S.cleanChar({ id: 'c_1', name: 'C', values: { f_inv: a1.value } }, sC);
        check('L2c a library row survives cleaning with its copy (no library loaded: it draws from the copy)', kC.values.f_inv.length === 1 && kC.values.f_inv[0].snap.name === 'Rope' && S.rowDef(sC, kC.values.f_inv[0]).src === 'lost', j(kC.values.f_inv));
        const libR2 = Object.assign({}, libR, { name: 'Silk rope', notes: 'Lighter.' });
        const chars = { c_1: { id: 'c_1', values: { f_inv: [JSON.parse(JSON.stringify(r1)), { id: 'w_o', defId: 'i_own', qty: 1 }, { id: 'w_g', defId: 'i_gone', qty: 1, snap: { name: 'Gone', category: '', icon: '', notes: '', vis: 'all' } }] } }, c_2: { id: 'c_2', values: { f_inv: [{ id: 'w_x', defId: 'i_rope', qty: 1, snap: S.cleanRowDef(libR2, true) }] } }, c_3: 'junk' };
        const ownBefore = JSON.stringify(chars.c_1.values.f_inv[1]), goneBefore = JSON.stringify(chars.c_1.values.f_inv[2]);
        const sn = S.libSnaps(sC, chars, id => (id === 'i_rope' ? libR2 : id === 'i_own' ? libR2 : null)), again = S.libSnaps(sC, chars, id => (id === 'i_rope' ? libR2 : null));
        check('L2c libSnaps: a library row\'s copy becomes the entry as it is now (counted by rows and characters; one already current is left); a row of the system\'s own item, or of an entry gone, is untouched; run again, nothing; no lookup, nothing',
            sn.rows === 1 && sn.chars === 1 && chars.c_1.values.f_inv[0].snap.name === 'Silk rope' && chars.c_1.values.f_inv[0].snap.notes === 'Lighter.' && JSON.stringify(chars.c_1.values.f_inv[1]) === ownBefore && JSON.stringify(chars.c_1.values.f_inv[2]) === goneBefore
            && again.rows === 0 && S.libSnaps(sC, chars, null).rows === 0 && S.libSnaps(null, chars, () => libR2).rows === 0, j([sn, again]));
        const lbC = fs.readFileSync(path.join(app, 'scripts', 'library.js'), 'utf8').replace(/\r\n/g, '\n');
        check('L2c the GM machine keeps the copies current after every library change (never mid-load or at another\'s table; saved only when one changed)',
            /function after\(\) \{   \/\/ [^\n]*\n\s*try \{ refreshCore\(\); \} catch \(e\) \{ console\.error\(e\); \}\n\s*try \{ syncSnaps\(\); \}/.test(lbC)
            && /if \(!camp \|\| !camp\.system \|\| !camp\.chars \|\| !gmHere\(\) \|\| cur\.campId !== camp\.id \|\| cur\.state === 'loading'\) return 0;\n\s*var r = libSnaps\(camp\.system, camp\.chars, entryFor\); if \(r\.rows\) save\(true\);/.test(lbC));
    }
    /* ---- Stage 6 F6: item mods — cleaned, applied from rows, per level, while switched on, a kept curse's changes nameless ---- */
    {
        const rawF = { v: 1, name: 'F6', rolls: [], fields: [
            { id: 'f_dx', key: 'DX', kind: 'number', def: 10 }, { id: 'f_mv', key: 'Move', kind: 'formula', formula: 'DX / 2' }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '10', def: 'max', vis: 'all' }, { id: 'f_fly', key: 'Fly', kind: 'toggle' }, { id: 'f_gm', key: 'Luck', kind: 'number', vis: 'gm', def: 0 },
            { id: 'f_arm', key: 'Armor', kind: 'item-list', edit: 'owner', vis: 'all', list: { on: { label: 'Equipped' }, lvl: { label: 'Level', min: 0, max: 5, def: 1 } } }, { id: 'f_sec', key: 'Hidden', kind: 'item-list', vis: 'gm', edit: 'gm' }],
            items: [{ id: 'i_mail', name: 'Chain mail', category: 'Armor', modsOn: true, mods: [{ f: 'f_dx', op: 'add', v: -1 }, { f: 'f_hp', op: 'add', v: 5, part: 'max' }, { f: 'f_gm', op: 'add', v: 3 }, { f: 'f_nope', op: 'add', v: 1 }, { f: 'f_fly', op: 'add', v: 2 }] },
                { id: 'i_tr', name: 'Nimble', category: 'Trait', mods: [{ f: 'f_dx', op: 'add', v: 1, lvl: true }, { f: 'f_fly', op: 'on' }] },
                { id: 'i_cur', name: 'Cursed ring', category: 'Ring', rm: 'curse', mods: [{ f: 'f_dx', op: 'add', v: -2 }, { f: 'f_gm', op: 'add', v: -5 }] },
                { id: 'i_hex', name: 'Hex', category: 'Ring', mods: [{ f: 'f_hp', op: 'add', v: -3, part: 'max' }] },
                { id: 'i_plain', name: 'Rope', category: 'Gear' }] };
        const sF = cleanSystem(rawF, { F, gmView: true }), pF = cleanSystem(rawF, { F, gmView: false }), mail = sF.items[0], mailP = pF.items[0];
        check('F6 an item\'s mods are cleaned as status-effect changes (a number, skill or formula +/−, a pool\'s max, a toggle on; the field must be there and of that kind), a change per level kept, "while switched on" kept; the players\' view drops a change to a GM-only field; an item with none has no key at all',
            j(mail.mods) === j([{ f: 'f_dx', op: 'add', v: -1 }, { f: 'f_hp', op: 'add', v: 5, part: 'max' }, { f: 'f_gm', op: 'add', v: 3 }]) && mail.modsOn === true && j(mailP.mods) === j([{ f: 'f_dx', op: 'add', v: -1 }, { f: 'f_hp', op: 'add', v: 5, part: 'max' }])
            && j(sF.items[1].mods) === j([{ f: 'f_dx', op: 'add', v: 1, lvl: true }, { f: 'f_fly', op: 'on' }]) && !('mods' in sF.items[4]) && !('modsOn' in sF.items[4]) && S.cleanItemMods(Array.from({ length: 140 }, () => ({ f: 'f_dx', op: 'add', v: 1 })), S.fieldKinds(sF)).length === S.LIMITS.effectMods, j([mail, mailP, sF.items[1]]));
        const chF = (rows, hidRows) => S.cleanChar({ id: 'c_f', name: 'F', ownerId: 'u_p', values: { f_arm: rows, f_sec: hidRows || [] } }, sF);
        const r0 = resolveAll(sF, chF([]), F), rOff = resolveAll(sF, chF([{ id: 'w_m', defId: 'i_mail', qty: 1, on: false }]), F), rOn = resolveAll(sF, chF([{ id: 'w_m', defId: 'i_mail', qty: 3, on: true }]), F);
        const rTr = resolveAll(sF, chF([{ id: 'w_t', defId: 'i_tr', qty: 1, lvl: 3 }]), F);
        check('F6 on the sheet: an item that works while switched on changes nothing while off, and once on its changes land once (three of it still once): DX 10 → 9, Move follows (a formula reads the changed DX), HP\'s max 10 → 15; .base keeps the stored value; the breakdown names the item; a trait\'s per-level change times its level (+3 at level 3) and a toggle switched on',
            r0.f_dx.value === 10 && rOff.f_dx.value === 10 && rOn.f_dx.value === 9 && rOn.f_mv.value === 4.5 && rOn.f_hp.max === 15 && rOn.f_dx.base === 10 && /Chain mail/.test(S.fxText(rOn.f_dx)) && rOn.f_gm.value === 3
            && rTr.f_dx.value === 13 && rTr.f_fly.value === true && /Nimble \+3/.test(S.fxText(rTr.f_dx)), j([rOn.f_dx, rOn.f_hp, rTr.f_dx, rTr.f_fly]));
        const kept = chF([{ id: 'w_c', defId: 'i_cur', qty: 1, hid: 1 }], [{ id: 'w_h', defId: 'i_hex', qty: 1 }]);
        const gmK = resolveAll(sF, kept, F), items = {}; sF.items.forEach(i => { items[i.id] = i; });
        const own = S.charFor(kept, pF, 'u_p', { items, full: sF }), mate = S.charFor(kept, pF, 'u_q', { items, full: sF }), noFull = S.charFor(kept, pF, 'u_p', { items });
        const ownC = S.cleanChar(own, pF), plK = resolveAll(pF, ownC, F);
        check('F6 a kept curse keeps working (owner, 2026-09-27): the GM\'s sheet names it; its owner\'s copy carries only nameless amounts on the fields they can see (DX −2; a GM-only field\'s change never travels), as does a row of a list they cannot see (HP max −3), so their sheet agrees with the GM\'s — the breakdown says "An unseen effect"; a teammate\'s copy carries none; nothing of it names the item',
            gmK.f_dx.value === 8 && /Cursed ring/.test(S.fxText(gmK.f_dx)) && gmK.f_hp.max === 7 && j(own.unseen) === j([{ f: 'f_dx', op: 'add', v: -2 }, { f: 'f_hp', op: 'add', v: -3, part: 'max' }]) && !('unseen' in mate)
            && plK.f_dx.value === 8 && plK.f_hp.max === 7 && /An unseen effect/.test(S.fxText(plK.f_dx)) && !/Cursed|Hex|i_cur|i_hex|w_c|w_h/.test(j(own)) && j(noFull.unseen) === j([{ f: 'f_dx', op: 'add', v: -2 }]), j([own, plK.f_dx, noFull.unseen]));
        const visK = chF([{ id: 'w_m', defId: 'i_mail', qty: 1, on: true }, { id: 'w_t', defId: 'i_tr', qty: 1, lvl: 2 }]), ownVis = S.charFor(visK, pF, 'u_p', { items, full: sF }), ownVisC = S.cleanChar(ownVis, pF);
        check('F6 rows their owner holds send no nameless changes (the owner works them out from the rows): the same DX on both machines, never counted twice',
            !('unseen' in ownVis) && resolveAll(pF, ownVisC, F).f_dx.value === resolveAll(sF, visK, F).f_dx.value && resolveAll(sF, visK, F).f_dx.value === 11, j([ownVis.unseen, resolveAll(pF, ownVisC, F).f_dx, resolveAll(sF, visK, F).f_dx]));
        const onK = chF([{ id: 'w_m', defId: 'i_mail', qty: 1, on: true, keptOn: 1 }]), ownOn = S.charFor(onK, pF, 'u_p', { items, full: sF }), ownOnC = S.cleanChar(ownOn, pF);
        check('F6 a curse kept switched on (it looks off to its owner): its "while switched on" changes reach them nameless, so their DX agrees with the GM\'s; the row itself shows as off',
            ownOnC.values.f_arm[0].on === false && j(ownOn.unseen) === j([{ f: 'f_dx', op: 'add', v: -1 }, { f: 'f_hp', op: 'add', v: 5, part: 'max' }]) && resolveAll(pF, ownOnC, F).f_dx.value === resolveAll(sF, onK, F).f_dx.value, j([ownOn.unseen, ownOnC.values.f_arm]));
        const hostile = S.cleanChar({ id: 'c_f', name: 'F', ownerId: 'u_p', values: {}, unseen: [{ f: 'f_dx', op: 'add', v: 'x' }, { f: 'f_gm', op: 'add', v: 99 }, { f: 'f_dx', op: 'add', v: 1e9 }, { f: 'f_dx', op: 'add', v: -1, lvl: true, name: 'Leak' }, 5] }, pF), part = S.cleanChar({ id: 'c_f', name: 'F', ownerId: 'u_p', partial: true, values: {}, unseen: [{ f: 'f_dx', op: 'add', v: -1 }] }, pF);
        check('F6 a player cleans what the host sends as unseen again: changes to fields of their view only, amounts in range, nothing but field, kind and amount; a teammate\'s copy takes none',
            j(hostile.unseen) === j([{ f: 'f_dx', op: 'add', v: -1 }]) && !('unseen' in part), j([hostile.unseen, part.unseen]));
        const libEntry = { id: 'i_lib', name: 'Ring', modsOn: true, mods: [{ f: 'f_dx', op: 'add', v: 2 }, { f: 'f_gm', op: 'add', v: 1 }, { f: 'f_hp', op: 'add', v: 5, part: 'max' }] }, snapT = S.cleanRowDef(libEntry, true);
        const inl = S.projectRows([{ id: 'w_x', defId: 'i_lib', qty: 1, on: true, snap: snapT }], pF, id => (id === 'i_lib' ? libEntry : null), pF.fields.find(f => f.id === 'f_arm').list);
        check('F6 an inline copy (a GM-only or library item on its owner\'s sheet) carries its changes on their fields only; a row\'s copy keeps them by their shape',
            j(inl[0].def.mods) === j([{ f: 'f_dx', op: 'add', v: 2 }, { f: 'f_hp', op: 'add', v: 5, part: 'max' }]) && inl[0].def.modsOn === true && inl[0].lnk === 1 && j(snapT.mods) === j([{ f: 'f_dx', op: 'add', v: 2 }, { f: 'f_gm', op: 'add', v: 1 }, { f: 'f_hp', op: 'add', v: 5, part: 'max' }]), j([inl[0], snapT]));
    }
    /* ---- Stage 6 F6b: a custom row's changes (the GM's, a player's on their fields) and the chips on rows ---- */
    {
        const rawB = { v: 1, name: 'B', rolls: [], fields: [{ id: 'f_dx', key: 'DX', kind: 'number', def: 10 }, { id: 'f_gm', key: 'Luck', kind: 'number', vis: 'gm' }, { id: 'f_c', key: 'Kit', label: 'Kit', kind: 'item-list', edit: 'owner', vis: 'all', list: { custom: true, on: { label: 'Worn' } } }, { id: 'f_n', key: 'Plain', kind: 'item-list', edit: 'owner', vis: 'all', list: { custom: true } }] };
        const sB = cleanSystem(rawB, { F, gmView: true }), pB = cleanSystem(rawB, { F, gmView: false }), chB = () => ({ id: 'c_b', name: 'B', ownerId: 'u_p', values: { f_c: [{ id: 'w_1', qty: 1, own: 1, def: { name: 'Charm', category: '', icon: '', notes: '', vis: 'all' } }], f_n: [] } });
        const P = { player: true, view: pB }, cu = (q, o, ch) => S.applyRowOp(sB, ch || chB(), q.f || 'f_c', Object.assign({ op: 'custom', rowId: 'w_1' }, q), F, o || {});
        const okP = cu({ def: { mods: [{ f: 'f_dx', op: 'add', v: 2 }] } }, P), gmFld = cu({ def: { mods: [{ f: 'f_gm', op: 'add', v: 9 }] } }, P), gmOk = cu({ def: { mods: [{ f: 'f_gm', op: 'add', v: 9 }] } }, {});
        const badK = cu({ def: { mods: [{ f: 'f_dx', op: 'on' }] } }, P), badMix = cu({ def: { mods: [{ f: 'f_dx', op: 'add', v: 1 }, { f: 'f_dx', op: 'on' }] } }, P), clr = (() => { const c0 = chB(); c0.values.f_c[0].def.mods = [{ f: 'f_dx', op: 'add', v: 1 }]; c0.values.f_c[0].def.modsOn = true; return cu({ def: { mods: [] } }, P, c0); })();
        const withM = () => { const c1 = chB(); c1.values.f_c[0].def.mods = [{ f: 'f_dx', op: 'add', v: 1 }]; return c1; }, onOk = cu({ def: { modsOn: true } }, P, withM()), onBare = cu({ def: { modsOn: true } }, P), onNo = cu({ f: 'f_n', rowId: 'w_2', def: { modsOn: true } }, P);
        check('F6b a custom row\'s changes: a player\'s own row takes changes to fields of their view (as their ad hoc effects do) — one to a GM-only field, or of a kind the field does not take, is refused; the GM\'s takes any field; an empty list clears them and "only while switched on"; that tick needs a list with a switch (and means nothing without changes: a row with none keeps no tick)',
            okP.ok && j(okP.value[0].def.mods) === j([{ f: 'f_dx', op: 'add', v: 2 }]) && gmFld.ok === false && gmFld.reason === 'value' && gmOk.ok && j(gmOk.value[0].def.mods) === j([{ f: 'f_gm', op: 'add', v: 9 }])
            && badK.ok === false && badMix.ok === false && clr.ok && !('mods' in clr.value[0].def) && !('modsOn' in clr.value[0].def) && onOk.ok && onOk.value[0].def.modsOn === true && onBare.ok && !('modsOn' in onBare.value[0].def) && onNo.ok === false, j([okP, gmFld, badK, clr.value, onNo]));
        const msgOk = S.cleanCharItem({ rid: 'r1', charId: 'c_b', fieldId: 'f_c', op: 'custom', rowId: 'w_1', def: { mods: [{ f: 'f_dx', op: 'add', v: 2, lvl: true, name: 'x' }], modsOn: true } });
        const msgBad = [{ mods: 'x' }, { mods: [{ f: 'f_dx', op: 'add', v: 'x' }] }, { mods: [{ f: 'bad id', op: 'add', v: 1 }] }, { mods: Array.from({ length: 121 }, () => ({ f: 'f_dx', op: 'on' })) }, { modsOn: 'yes' }].map(d => S.cleanCharItem({ rid: 'r1', charId: 'c_b', fieldId: 'f_c', op: 'custom', rowId: 'w_1', def: d }));
        check('F6b on the wire: a custom op carries its changes by shape only (field, kind, amount, per level) and "only while switched on"; a malformed one refuses the whole message',
            j(msgOk.def) === j({ mods: [{ f: 'f_dx', op: 'add', v: 2, lvl: true }], modsOn: true }) && msgBad.every(m => m === null), j([msgOk, msgBad]));
        const shB = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        check('F6b the sheet shows each row\'s changes as chips (list and table), and a custom row\'s form edits them — the whole list with each change, a field of the system the sheet draws',
            /keyShareChip\(line, entry, rd, unseenL\); modsBits\(line, def, entry, spec, sysI, c, f\);/.test(shB) /* the pre-Sunday review: the gate (moved on purpose) */ && /keyShareChip\(nameTd, entry, rd, unseenT\); modsBits\(nameTd, def, entry, spec, sysI, c, f\);/.test(shB)
            && /var mTg = typeof fxTargets === 'function' \? fxTargets\(sysI\) : \[\], mCur = Array\.isArray\(d\.mods\) \? d\.mods : \[\];/.test(shB) && /sendM = function\(arr\) \{ one\('mods', arr\.length \? arr : null\); \}/.test(shB) && /one\('modsOn', moc\.checked \? true : null\)/.test(shB));
    }
    /* ---- Stage 6 library L4: how far a library edit reaches ---- */
    {
        const rawL = { v: 1, name: 'L', rolls: [], fields: [{ id: 'f_dx', key: 'DX', kind: 'number' }, { id: 'f_inv', key: 'Gear', kind: 'item-list', list: { stats: [{ key: 'Wt', label: 'Weight' }] } }, { id: 'f_b', key: 'Bag', kind: 'item-list' }] };
        const sL = cleanSystem(rawL, { F, gmView: true }), e0 = { id: 'i_rope', name: 'Rope', category: 'Gear', stats: { Wt: 10 } }, e1 = Object.assign({}, e0, { name: 'Silk rope' }), e2 = Object.assign({}, e0, { mods: [{ f: 'f_dx', op: 'add', v: 1 }] });
        const chars = { c_1: { id: 'c_1', values: { f_inv: [{ id: 'w_1', defId: 'i_rope', qty: 1, snap: S.cleanRowDef(e0, true) }, { id: 'w_2', defId: 'i_rope', qty: 2, snap: S.cleanRowDef(e0, true), ov: { name: 'My rope' } }], f_b: [{ id: 'w_3', defId: 'i_rope', qty: 1, snap: S.cleanRowDef(e0, true) }] } }, c_2: { id: 'c_2', values: { f_inv: [{ id: 'w_4', defId: 'i_rope', qty: 1, snap: S.cleanRowDef(e0, true) }] } }, c_3: { id: 'c_3', values: {} } };
        const rNo = S.itemReach({ fields: sL.fields, items: [e0] }, { fields: sL.fields, items: [e1] }, chars), rLib = S.itemReach({ fields: sL.fields, items: [e0] }, { fields: sL.fields, items: [e1] }, chars, { lib: true }), rMods = S.itemReach({ fields: sL.fields, items: [e0] }, { fields: sL.fields, items: [e2] }, chars, { lib: true });
        const cb = S.carriedBy(sL, chars, 'i_rope'), cbNone = S.carriedBy(sL, chars, 'i_zz');
        check('L4 a library edit\'s reach: its rows always carry a copy, so they count (without the library mode a copy is a deleted item\'s, and says nothing); a changed name reaches 2 characters, one holding its own name; a change to what it changes on the character (F6) reaches them too; carriedBy counts rows and characters across every list',
            rNo.text === '' && /Silk rope: affects 2 characters; 1 has its own name/.test(rLib.text) && /affects 2 characters/.test(rMods.text) && j(cb) === j({ rows: 4, chars: 2 }) && j(cbNone) === j({ rows: 0, chars: 0 }), j([rNo, rLib, rMods, cb]));
        const wnL = fs.readFileSync(path.join(app, 'scripts', 'librarywin.js'), 'utf8').replace(/\r\n/g, '\n');
        check('L4 the Library window tells the reach of an entry saved and of a bulk change (each line into the session log), and its form says how many carry the entry',
            /var was = i >= 0 \? list\[i\] : null;/.test(wnL) && /var rt = was \? reachOf\(\[was\], \[c\]\) : '';/.test(wnL) && /var tellE = \[rt, kgS, ctS, entryNotes\(raw\)\]\.filter\(Boolean\)\.join\(' '\); if \(tellE\) toast\(tellE\);/.test(wnL) && /r\.lines\.forEach\(function\(l\) \{ n\.logEvent\('items', l\); \}\);/.test(wnL) && /c\.chars \|\| \{\}, \{ lib: true \}\), n = window\.wpNet;/.test(wnL) && /carriedBy\(camp\(\)\.system, camp\(\)\.chars \|\| \{\}, e\.id\)/.test(wnL));   // 1.6.3: the saved entry also says what it keeps that does nothing (entryNotes; moved on purpose)
    }
    /* ---- a choice's option reading a list's name, and the validator over the lists' choices (Stage 6 F3 and F7). They read the public core
       alone: back from the bridge's own suite, where they stood for a while after 2026-10-18 ---- */
    {
        const n = (id, key, extra) => Object.assign({ id: 'f_' + id, key, label: key, kind: 'number', vis: 'all' }, extra || {});
        const lst = (id, key, list) => ({ id: 'f_' + id, key, label: key, kind: 'item-list', vis: 'all', list });
        const rawC = { v: 1, name: 'C', rolls: [], fields: [
            n('st', 'ST', { def: 11 }), { id: 'f_gm', key: 'Hid', label: 'H', kind: 'number', vis: 'gm', def: 4 },
            { id: 'f_sk', key: 'Skills', label: 'Skills', kind: 'item-list', vis: 'all', list: { cats: ['Skill'], lvl: { label: 'Level', min: 0, max: 30, def: 10 }, custom: true, stats: [{ key: 'bonus' }], cols: [{ key: 'Target', label: 'Target', formula: 'Row.lvl + Row.bonus' }] } },
            { id: 'f_wp', key: 'Weapons', label: 'Weapons', kind: 'item-list', vis: 'all', list: { custom: true, stats: [{ key: 'sk', kind: 'pick', opts: [{ label: 'Guns', name: 'Skills.Guns.Target' }, { label: 'Rows', name: 'Skills.count' }, { label: 'Strength', name: 'ST' }, { label: 'Secret', name: 'Skills.Secret.Target' }, { label: 'Library', name: 'Skills.Lib.Target' }] }], cols: [{ key: 'Skill', label: 'Skill', formula: 'Row.sk' }] } },
            { id: 'f_x', key: 'LibT', label: 'L', kind: 'formula', vis: 'all', formula: 'Skills.Lib.Target + Skills.Nope.Target' }],
            items: [{ id: 'i_guns', name: 'Guns', key: 'Guns', category: 'Skill', stats: { bonus: 1 } }, { id: 'i_sec', name: 'Secret', key: 'Secret', category: 'Skill', vis: 'gm', stats: { bonus: 2 } }],
            core: [{ id: 'i_lib', name: 'Lib', key: 'Lib', category: 'Skill', stats: { bonus: 5 } }] };
        const sC = cleanSystem(rawC, { F, gmView: true }), vC = validateSystem(sC, F), pC = cleanSystem(rawC, { F, gmView: false });
        const chC = { id: 'c_c', name: 'C', ownerId: '', npc: true, values: { f_sk: [{ id: 'w_s1', defId: 'i_guns', qty: 1, lvl: 12 }], f_wp: [{ id: 'w_a', qty: 1, def: { name: 'Pistol', stats: { sk: 'Guns' } } }, { id: 'w_b', qty: 1, def: { name: 'Count', stats: { sk: 'Rows' } } }, { id: 'w_c', qty: 1, def: { name: 'Club', stats: { sk: 'Strength' } } }, { id: 'w_d', qty: 1, def: { name: 'Book', stats: { sk: 'Library' } } }] } };
        const aC = resolveAll(sC, chC, F), cells = ['w_a', 'w_b', 'w_c', 'w_d'].map(r => aC.f_wp.cells[r] ? aC.f_wp.cells[r][0].text : '?');
        const bad2 = rawC.fields.slice(); bad2[3] = JSON.parse(j(rawC.fields[3])); bad2[3].list.stats[0].opts.push({ label: 'Own', name: 'Row.lvl' }, { label: 'Nope', name: 'Skills.Guns.Nothing' });
        const eC2 = validateSystem(cleanSystem(Object.assign({}, rawC, { fields: bad2 }), { F, gmView: true }), F).errors.map(e => e.message);
        check('F3 a choice\'s option may read a list\'s name, as a formula can — a row by key (Skills.Guns.Target: 12 + 1), a total (Skills.count), an entry the library\'s core holds (Lib: 10 + 5) — beside a field (ST); the validator takes them, warns of a GM-only entry\'s row (players do not get that option) and still refuses a row\'s own name or a word the list lacks',
            vC.errors.length === 0 && j(cells) === j(['13', '1', '11', '15']) && vC.warnings.some(w => /option “Secret” reads a GM-only value/.test(w.message))
            && pC.fields.find(f => f.id === 'f_wp').list.stats[0].opts.map(o => o.label).join() === 'Guns,Rows,Strength,Library'
            && eC2.some(m => /option “Own” points at “Row\.lvl”/.test(m)) && eC2.some(m => /option “Nope” points at “Skills\.Guns\.Nothing”/.test(m)), j([vC.errors, vC.warnings, cells, eC2]));
        check('F3 the validator: a key only the library\'s core holds is a known row (no "reads as not carried" warning); a key nothing holds still warns',
            !vC.warnings.some(w => /key "Lib"/.test(w.message)) && vC.warnings.some(w => /key "Nope"/.test(w.message)), j(vC.warnings));
        const rawW = { v: 1, name: 'W', rolls: [], fields: [n('a', 'A'), n('b', 'B'),
            lst('l1', 'One', { stats: [{ key: 'pk', kind: 'pick', opts: [{ label: 'Ay', name: 'A' }] }] }), lst('l2', 'Two', { stats: [{ key: 'PK', kind: 'pick', opts: [{ label: 'Bee', name: 'B' }] }] }), lst('l3', 'Three', { stats: [{ key: 'pk', kind: 'pick', opts: [{ label: 'ay', name: 'A' }] }] })] };
        const wW = validateSystem(cleanSystem(rawW, { F, gmView: true }), F).warnings.filter(w => /is a choice on One too/.test(w.message));
        check('F7 the validator warns when two lists share a choice key with other options (an item holds one choice under a key, read against the first list\'s options); the same options, in any case, say nothing',
            wW.length === 1 && wW[0].id === 'f_l2' && /Give this list its own key/.test(wW[0].message), j(wW));
    }
    // 1.5.9 (docs/BOOK_ES_ET_PLAN.md section 3; the book: an item used "to oneself or an adjacent ally"): Applies to an adjacent character in the
    // core. The cleaner keeps to: 'near' only as that word, never on the initiative roll, alike in both views; OnSelf reads 1 on oneself and 0 on
    // another, and a field keyed OnSelf keeps its own; applyAct with on lands a field's change on a copy of that character, keeps a row's counters
    // on the user, answers onValues and onLines, leaves the character it was handed as it was, and without on answers as before
    {
        const J = JSON.stringify;
        const base = { v: 1, name: 'N', fields: [
            { id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', maxFormula: '20', def: 'max', min: -20 },
            { id: 'f_kit', key: 'Kit', label: 'Kit', kind: 'item-list', list: { counters: [{ key: 'Uses', label: 'Uses', def: 3 }], rolls: [
                { label: 'Wrap', apply: [{ f: 'f_hp', formula: '2 + OnSelf', add: true }, { c: 'Uses', formula: '1' }], to: 'near' },
                { label: 'Odd', apply: [{ f: 'f_hp', formula: '1', add: true }], to: 'far' }] } }],
            items: [{ id: 'i_kit', name: 'Kit' }],
            rolls: [
                { id: 'r_aid', label: 'Aid', apply: [{ f: 'f_hp', formula: '4', add: true }], to: 'near' },
                { id: 'r_chk', label: 'Check', formula: '3d6 <= 10', to: 'near' },
                { id: 'r_odd', label: 'Odd', apply: [{ f: 'f_hp', formula: '1', add: true }], to: 'NEAR' },
                { id: 'r_ini', label: 'Init', formula: '1d6', init: true, to: 'near' }] };
        const gm = S.cleanSystem(base, { F, gmView: true }), pl = S.cleanSystem(base, { F, gmView: false });
        const rolOf = (s, id) => (s.rolls || []).filter(r => r.id === id)[0] || {}, lr = s => s.fields.filter(f => f.id === 'f_kit')[0].list.rolls;
        const clOk = rolOf(gm, 'r_aid').to === 'near' && rolOf(gm, 'r_chk').to === 'near' && !('to' in rolOf(gm, 'r_odd')) && !('to' in rolOf(gm, 'r_ini'))
            && lr(gm)[0].to === 'near' && !('to' in lr(gm)[1]) && J(gm.rolls.map(r => r.to)) === J(pl.rolls.map(r => r.to)) && J(lr(gm).map(r => r.to)) === J(lr(pl).map(r => r.to))
            && J(S.cleanSystem(gm, { F, gmView: true })) === J(gm);
        const sysOs = S.cleanSystem({ v: 1, name: 'O', fields: [{ id: 'f_os', key: 'OnSelf', label: 'OnSelf', kind: 'number', def: 7 }] }, { F, gmView: true });
        const vN = S.makeResolver(gm, { id: 'c', values: {} }, F, null), vO = S.makeResolver(sysOs, { id: 'c', values: {} }, F, null);
        const osOk = typeof S.withOnSelf === 'function' && S.withOnSelf(vN, true)('OnSelf') === 1 && S.withOnSelf(vN, false)('OnSelf') === 0 && S.withOnSelf(vN, false)('onself') === 0
            && vN('OnSelf') === undefined && S.withOnSelf(vO, false)('OnSelf') === 7 && S.withOnSelf(vN, false)('HP') === vN('HP') && S.withOnSelf(5, true) === 5;
        const user = { id: 'c_a', name: 'Kael', values: { f_hp: { cur: 10 }, f_kit: [{ id: 'w_1', defId: 'i_kit', ct: { Uses: 3 } }] } }, other = { id: 'c_b', name: 'Bo', values: { f_hp: { cur: 5 } } };
        const otherWas = J(other), actA = rolOf(gm, 'r_aid'), wrap = lr(gm)[0];
        const vU = S.makeResolver(gm, user, F, null), rA = S.applyAct(gm, user, actA, S.withOnSelf(vU, false), F, null, null, undefined, null, { char: other, tctx: null });
        const vRow = vU.row('f_kit', 'w_1'), rW = S.applyAct(gm, user, wrap, S.withOnSelf(vRow, false), F, null, { f: 'f_kit', r: 'w_1' }, undefined, null, { char: other, tctx: null });
        const rS = S.applyAct(gm, user, actA, S.withOnSelf(vU, true), F, null, null, undefined, null);
        const onOk = rA.ok === true && J(rA.onValues) === J({ f_hp: { cur: 9 } }) && J(rA.values) === J({}) && rA.onLines.length === 1 && rA.onLines[0].v === 9 && rA.lines.length === 0 && J(other) === otherWas
            && rW.ok === true && J(rW.onValues) === J({ f_hp: { cur: 7 } }) && J(rW.values.f_kit[0].ct) === J({ Uses: 2 }) && !('f_hp' in rW.values) && J(other) === otherWas
            && rS.ok === true && J(rS.values) === J({ f_hp: { cur: 14 } }) && !('onValues' in rS) && !('onLines' in rS);
        check('1.5.9 Applies to an adjacent character in the core: the cleaner keeps to near only as that very word on a system roll, an apply action and a list\'s action, never on the initiative roll, alike in both views and cleaned twice alike; OnSelf reads 1 on oneself and 0 on another and a field keyed OnSelf keeps its own; applyAct with on lands the field\'s change on a copy of that character (Bo\'s HP 5 + 4), keeps a row\'s counter on the user (Uses 3 - 1) with OnSelf 0 in its amount (2 + 0), answers onValues and onLines, leaves the character it was handed untouched, and without on answers as before',
            clOk && osOk && onOk, J([clOk, osOk, onOk, rolOf(gm, 'r_odd'), rA, rW, rS]));
    }
    // 1.6.2 (the builder trial's survey): Applies to the user or their target, kept as near is: that very word on a system roll, an action and a list's
    // roll or action, never on the initiative roll, alike in both views; onOther is the one test of both
    {
        const J = JSON.stringify, base = { v: 1, name: 'T', fields: [{ id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', maxFormula: '20', def: 'max' },
            { id: 'f_kit', key: 'Kit', label: 'Kit', kind: 'item-list', list: { rolls: [{ label: 'Bless', apply: [{ f: 'f_hp', formula: '1', add: true }], to: 'target' }, { label: 'Hex', formula: '3d6 <= 10', to: 'target' }, { label: 'Odd', formula: '3d6 <= 10', to: 'TARGET' }] } }],
            rolls: [{ id: 'r_m', label: 'Mend', apply: [{ f: 'f_hp', formula: '3', add: true }], to: 'target' }, { id: 'r_c', label: 'Curse', formula: '3d6 <= 10', to: 'target' }, { id: 'r_i', label: 'Init', formula: '1d6', init: true, to: 'target' }] };
        const gm = S.cleanSystem(base, { F, gmView: true }), pl = S.cleanSystem(base, { F, gmView: false }), ro = (s, id) => s.rolls.find(r => r.id === id) || {}, lr = s => s.fields.find(f => f.id === 'f_kit').list.rolls;
        const ok = ro(gm, 'r_m').to === 'target' && ro(gm, 'r_c').to === 'target' && !('to' in ro(gm, 'r_i')) && lr(gm)[0].to === 'target' && lr(gm)[1].to === 'target' && !('to' in lr(gm)[2])
            && J(gm.rolls.map(r => r.to)) === J(pl.rolls.map(r => r.to)) && J(lr(gm).map(r => r.to)) === J(lr(pl).map(r => r.to)) && J(S.cleanSystem(gm, { F, gmView: true })) === J(gm)
            && S.onOther({ to: 'near' }) && S.onOther({ to: 'target' }) && !S.onOther({ to: 'far' }) && !S.onOther({}) && !S.onOther(null);
        check('1.6.2 Applies to the user or their target in the core: the cleaner keeps to target only as that very word on a system roll, an apply action and a list\'s roll and action, never on the initiative roll, alike in both views and cleaned twice alike; onOther is true for near and target alone', ok, J([ro(gm, 'r_m'), ro(gm, 'r_i'), lr(gm)]));
    }
    {   // 1.6.0 (the review of 96e39ae6): one Revert after a press used on another takes both sheets back
        const shV = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), rvV = (shV.match(/function revertLast\(\) \{[\s\S]*?\n\}/) || [''])[0];
        const chU = { id: 'c_u', values: { f_kit: [{ id: 'w_1', ct: { Uses: 2 } }] } }, chT = { id: 'c_t', values: { f_hp: { cur: 9 }, f_dn: false } }, campV = { system: { fields: [] }, chars: { c_u: chU, c_t: chT } }, outV = [];
        const lcV = { charId: 'c_u', fieldId: 'f_kit', prev: [{ id: 'w_1', ct: { Uses: 3 } }], extra: null, also: { charId: 'c_t', fieldId: 'f_hp', prev: { cur: 5 }, extra: { f_dn: true } } };
        new Function('getActiveCampaign', 'systemOf', 'isClient', 'charById', 'afterCharChange', 'toast', 'clone', 'fieldById', 'ownerSeesSame', 'var lastChange = ' + JSON.stringify(lcV) + ';\n' + rvV + '\nreturn revertLast;')(
            () => campV, () => campV.system, () => false, id => campV.chars[id] || null, (c, w, d) => outV.push([c.id, JSON.parse(JSON.stringify(d))]), () => {}, x => JSON.parse(JSON.stringify(x)), () => null, () => false)();
        check('1.6.0 (the review of 96e39ae6) Revert (run for real) after a press used on an adjacent character takes back both: the user\'s row (Uses 2 back to 3) and the other\'s fields (HP 9 back to 5, Down back on), each sheet stored and sent once, the user\'s first',
            JSON.stringify(chU.values.f_kit) === JSON.stringify([{ id: 'w_1', ct: { Uses: 3 } }]) && JSON.stringify(chT.values) === JSON.stringify({ f_hp: { cur: 5 }, f_dn: true })
            && JSON.stringify(outV) === JSON.stringify([['c_u', { f_kit: [{ id: 'w_1', ct: { Uses: 3 } }] }], ['c_t', { f_hp: { cur: 5 }, f_dn: true }]]), JSON.stringify([chU.values, chT.values, outV]));
    }
    {   // 1.6.0: a change may switch an effect on or off, and a list's may set its row's quantity or one of its own number stats
        const J = JSON.stringify;
        const rawT = { v: 1, name: 'T', fields: [{ id: 'f_hp', key: 'HP', kind: 'number', def: 8 }, { id: 'f_fx', key: 'Conditions', label: 'Conditions', kind: 'effects' },
            { id: 'f_kit', key: 'Kit', label: 'Kit', kind: 'item-list', list: { stats: [{ key: 'Wear', label: 'Wear' }, { key: 'Kind', label: 'Kind', kind: 'pick', opts: [{ name: 'A' }] }], rolls: [
                { label: 'Use', apply: [{ q: true, formula: '1' }, { s: 'Wear', formula: '2', add: true }, { fx: 'e_calm' }] },
                { label: 'Fix', formula: '3d6 <= 10', then: [{ s: 'Wear', formula: '0', set: true, when: 'hit' }, { fx: 'e_calm', on: false }] },
                { label: 'Hide', apply: [{ fx: 'e_gm' }] }, { label: 'Bad', apply: [{ s: 'Kind', formula: '1' }, { s: 'Nope', formula: '1' }, { s: '9x', formula: '1' }] }] } }],
            items: [{ id: 'i_pac', name: 'Medpac', stats: { Wear: 1 } }], effects: [{ id: 'e_calm', name: 'Calm', mods: [], dur: '1 minute' }, { id: 'e_gm', name: 'Secret', vis: 'gm', mods: [] }],
            rolls: [{ id: 'r_up', label: 'Calm', apply: [{ fx: 'e_calm' }], to: 'near' }, { id: 'r_gm', label: 'G', apply: [{ fx: 'e_gm' }] }, { id: 'r_q', label: 'Q', apply: [{ q: true, formula: '1' }, { s: 'Wear', formula: '1' }, { fx: 'e_calm' }, { fx: 'e_calm', on: false }, { fx: 'bad id' }] }] };
        const gT = cleanSystem(rawT, { F, gmView: true }), pT = cleanSystem(rawT, { F, gmView: false }), lrT = sx => sx.fields.filter(x => x.id === 'f_kit')[0].list.rolls;
        check('1.6.0 the cleaner keeps a change that switches an effect on or off (once per effect and when), and a list\'s that sets its row\'s quantity or one of its own stats, alike in both views; a quantity or a row stat on a system roll reads as a change with no target (Pick the pool), and a bad effect id and a second switch of one effect go; the players\' view drops an action that switches a GM-only effect or names a stat the list does not have as a number',
            J(gT.rolls.filter(r => r.id === 'r_q')[0].apply) === J([{ f: '', formula: '1' }, { f: '', formula: '1' }, { fx: 'e_calm', on: true }]) && J(lrT(gT)[0].apply) === J([{ q: true, formula: '1' }, { s: 'Wear', formula: '2', add: true }, { fx: 'e_calm', on: true }])
            && J(lrT(gT)[1].then) === J([{ s: 'Wear', formula: '0', set: true, when: 'hit' }, { fx: 'e_calm', on: false }]) && J(lrT(pT).map(r => r.label)) === J(['Use', 'Fix']) && J(pT.rolls.map(r => r.id)) === J(['r_up'])
            && J(lrT(gT)[3].apply) === J([{ s: 'Kind', formula: '1' }, { s: 'Nope', formula: '1' }]) && J(cleanSystem(gT, { F, gmView: true })) === J(gT), J([gT.rolls, lrT(gT), lrT(pT).map(r => r.label)]));
        const chT = { id: 'c', values: { f_hp: 8, f_kit: [{ id: 'w_1', defId: 'i_pac', qty: 2 }, { id: 'w_2', qty: 1, def: { name: 'Own kit', stats: { Wear: 4 } } }] } }, rvT = (c, r) => S.makeResolver(gT, c, F, null).row('f_kit', r), useT = lrT(gT)[0];
        const u1 = S.applyAct(gT, chT, useT, rvT(chT, 'w_1'), F, null, { f: 'f_kit', r: 'w_1' }, undefined, null, null, { now: 1000 }), ch2 = { id: 'c', values: Object.assign({}, chT.values, u1.values) };
        const u2 = S.applyAct(gT, ch2, useT, rvT(ch2, 'w_1'), F, null, { f: 'f_kit', r: 'w_1' }, undefined, null, null, { now: 2000 });
        const u3 = S.applyAct(gT, chT, { apply: [{ s: 'Wear', formula: '1' }] }, rvT(chT, 'w_2'), F, null, { f: 'f_kit', r: 'w_2' });
        const offT = S.applyAct(gT, ch2, { apply: [{ fx: 'e_calm', on: false }] }, S.makeResolver(gT, ch2, F, null), F), noneT = S.applyAct(gT, chT, { apply: [{ fx: 'e_calm', on: false }] }, S.makeResolver(gT, chT, F, null), F);
        const tgT = { id: 't', values: {} }, nearT = S.applyAct(gT, chT, gT.rolls[0], S.makeResolver(gT, chT, F, null), F, null, null, undefined, null, { char: tgT }, { now: 50, onInCombat: true });
        check('1.6.0 applyAct: a list\'s action takes its row\'s quantity down (2 to 1), raises its own stat over the entry\'s (Wear 1 + 2, on the row), and switches an effect on with its timer from the clock it is handed; at 0 the row goes, kept whole as it was for its Undo, and a change after it on that row is passed over; a row of its own takes its stat in its own copy; an effect off goes off, and one already as asked moves nothing; on an adjacent character the effect lands on them, in their fight\'s time',
            J(u1.values.f_kit[0]) === J({ id: 'w_1', defId: 'i_pac', qty: 1, ov: { stats: { Wear: 3 } } }) && J(u1.values.f_fx) === J([{ id: 'x_calm', ref: 'e_calm', on: true, t: { left: 60, at: 1000 } }])
            && J(u1.lines) === J([{ f: 'f_kit', n: 'Medpac', d: -1, v: 1 }, { f: 'f_kit', n: 'Wear', d: 2, v: 3 }, { f: 'f_fx', n: 'Calm', fx: 1 }]) && !u1.gone
            && u2.ok && J(u2.values.f_kit.map(r => r.id)) === J(['w_2']) && J(u2.gone) === J([{ f: 'f_kit', r: 'w_1', row: { id: 'w_1', defId: 'i_pac', qty: 1, ov: { stats: { Wear: 3 } } }, at: 0 }]) && u2.lines.length === 1
            && u3.values.f_kit[1].def.stats.Wear === 3 && chT.values.f_kit[1].def.stats.Wear === 4 && J(offT.values.f_fx) === J([{ id: 'x_calm', ref: 'e_calm', on: false, t: { left: 60, at: 1000 } }]) && J(offT.lines) === J([{ f: 'f_fx', n: 'Calm', fx: 0 }]) && noneT.ok === false && noneT.reason === 'none'
            && J(nearT.values) === '{}' && J(nearT.onValues.f_fx) === J([{ id: 'x_calm', ref: 'e_calm', on: true, t: { left: 60, at: 0 } }]) && J(nearT.onLines) === J([{ f: 'f_fx', n: 'Calm', fx: 1 }]), J([u1, u2, u3.values, offT, noneT, nearT]));
        const scT = [S.applyScope(gT, { id: 'c', ownerId: 'u', values: {} }, { vis: 'all', apply: [{ fx: 'e_calm' }] }, false, F), S.applyScope(gT, { id: 'c', ownerId: 'u', values: {} }, { vis: 'all', apply: [{ fx: 'e_gm' }] }, false, F), S.applyScope(gT, { id: 'c', ownerId: 'u', values: {} }, { vis: 'all', apply: [{ q: true, formula: '1' }] }, false, F)];
        const vT = S.validateSystem(gT, F), msgT = [].concat(vT.errors, vT.warnings).map(e => e.message);
        check('1.6.0 a card of such a change goes to its owner (the GM alone for a GM-only effect); the editor says an effect that is gone, a GM-only one on a visible entry, a stat the list does not have as a number, and a sheet with no effects list',
            J(scT) === J(['owner', 'gm', 'owner']) && msgT.includes('"Secret" is GM only: players will not get this.') && S.validateSystem(cleanSystem(Object.assign({}, rawT, { rolls: [{ id: 'r_x', label: 'X', apply: [{ fx: 'e_gone' }] }] }), { F, gmView: true }), F).errors.some(e => e.message === 'Pick the effect this switches: that one is gone.') && msgT.some(m => m.endsWith('Pick the stat this changes: "Kind" is no number stat of this list.')) && msgT.some(m => m.endsWith('Pick the stat this changes: "Nope" is no number stat of this list.'))
            && S.validateSystem(cleanSystem({ v: 1, name: 'N', fields: [{ id: 'f_hp', key: 'HP', kind: 'number' }], effects: [{ id: 'e_a', name: 'A', mods: [] }], rolls: [{ id: 'r_a', label: 'A', apply: [{ fx: 'e_a' }] }] }, { F, gmView: true }), F).errors.some(e => /has no status effects list/.test(e.message)), J(msgT));
        // the sheet: a used-up row's notice with Undo, at once on the GM's machine, after the change lands on a player's app
        const shG = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), gS = shG.slice(shG.indexOf('// [systemcheck:gonethen-start]'), shG.indexOf('// [systemcheck:gonethen-end]'));
        const notes = [], campG = { system: gT, chars: { c: { id: 'c', values: { f_kit: [{ id: 'w_1', defId: 'i_pac', qty: 1 }, { id: 'w_2', qty: 1, def: { name: 'X' } }] } } } };
        const apiG = new Function('getActiveCampaign', 'systemOf', 'charById', 'fieldById', 'goneNote', 'rowIdOf', 'clone', gS + '\nreturn { goneLocal: goneLocal, goneWait: goneWait, goneFire: goneFire };')(
            () => campG, k => k.system, (id, k) => (k || campG).chars[id] || null, S.fieldById, (c, f, g) => notes.push([c.id, f.id, g.row.id, g.at]), S.rowIdOf, x => JSON.parse(JSON.stringify(x)));
        const nL = apiG.goneLocal('c', [{ f: 'f_kit', r: 'w_9', row: { id: 'w_9' }, at: 2 }, { f: 'f_nope', r: 'w_1', row: { id: 'w_1' }, at: 0 }]);
        const w1 = apiG.goneWait('c', 'f_kit', 'w_1'), w0 = apiG.goneWait('c', 'f_kit', 'w_7'), f0 = apiG.goneFire('c');
        campG.chars.c.values.f_kit = [{ id: 'w_2', qty: 1, def: { name: 'X' } }]; const f1 = apiG.goneFire('other'), f2 = apiG.goneFire('c'), f3 = apiG.goneFire('c');
        check('1.6.0 a row used up gets its Undo (sheets.js goneLocal, goneWait and goneFire, run for real): on the GM\'s machine at once, for a list of the system; on a player\'s app the host\'s word takes the row as this copy holds it and the notice waits until the change takes it off, once, and never for a row it does not hold',
            nL === 1 && w1 === true && w0 === false && f0 === 0 && f1 === 0 && f2 === 1 && f3 === 0 && J(notes) === J([['c', 'f_kit', 'w_9', 2], ['c', 'f_kit', 'w_1', 0]]), J([nL, w1, w0, f0, f1, f2, f3, notes]));
        check('1.6.0 the editor (source): a change\'s target writes through one function, setChangeTarget (a field, a counter, Fire, an effect on or off, the row\'s quantity or a stat), an effect\'s change shows no amount; the Rolls tab offers each effect on and off, the Lists card each effect, the row\'s quantity and its number stats; the GM\'s press and the round hook hand the clock an effect starts by; charChanged asks goneFire',
            /function setChangeTarget\(ch, v\) \{/.test(require('./checkkit').part('sysedroll.js')) && /if \(typeof ch\.fx !== 'string' && typeof ch\.tag !== 'string' && typeof ch\.rand !== 'string' && typeof ch\.sw !== 'boolean'\) \{   \/\/ 1\.6\.0: an effect switched has no amount; 1\.6\.2: nor a mark/.test(require('./checkkit').part('sysedroll.js')) && /if \(ch\.fire !== true && ch\.feed !== true && ch\.launch !== true && ch\.off !== true && typeof ch\.fx !== 'string' && typeof ch\.money !== 'string'\) \{/.test(require('./checkkit').part('sysedlist.js'))
            && /fxT\.push\(\['fx\+:' \+ d\.id, 'Switch on: '/.test(require('./checkkit').part('sysedroll.js')) && /opts\.push\(\['q', 'This row\\u2019s quantity'\]\)/.test(require('./checkkit').part('sysedlist.js')) && /if \(res\.gone\) goneLocal\(c\.id, res\.gone\);/.test(shG) && /if \(typeof goneFire === 'function'\) goneFire\(id\);/.test(shG)
            && /onInCombat: !!\(onT && n && n\.charInCombat && n\.charInCombat\(onT\.ch\.id\)\) \}\);/.test(shG));
    }
    {   // 1.6.0: the host's word that rows were used up, as a player's app cleans it
        const okR = S.cleanRowGone({ type: 'row-gone', charId: 'c_a', items: [{ f: 'f_kit', r: 'w_1', x: 1 }] }), many = Array.from({ length: 9 }, (_, i) => ({ f: 'f_kit', r: 'w_' + i }));
        check('1.6.0 cleanRowGone keeps a character\'s id and 1 to 8 rows by list and row id, nothing else, and refuses anything malformed whole',
            JSON.stringify(okR) === JSON.stringify({ charId: 'c_a', items: [{ f: 'f_kit', r: 'w_1' }] }) && [null, {}, { charId: 'x', items: [{ f: 'f_kit', r: 'w_1' }] }, { charId: 'c_a', items: [] }, { charId: 'c_a', items: many }, { charId: 'c_a', items: [{ f: 'bad', r: 'w_1' }] }, { charId: 'c_a', items: [{ f: 'f_kit', r: 'x_1' }] }, { charId: 'c_a', items: 'w_1' }].every(m => S.cleanRowGone(m) === null), JSON.stringify(okR));
    }
    {   // 1.6.0 (asked by a campaign build's session: a crippled limb works again once the hit points are full): a system entry's change may set
        // one number stat on EVERY row of an item list ({ list, s }), its amount worked out once with the character's names
        const J = JSON.stringify, D6 = await import(url('dicecore.js'));
        const rawA = { v: 1, name: 'A', fields: [
            { id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', maxFormula: '12', def: 'max', min: -12 }, { id: 'f_bo', key: 'Bonus', kind: 'number', def: 2 }, { id: 'f_gx', key: 'GmFig', kind: 'number', def: 1, vis: 'gm' },
            { id: 'f_loc', key: 'Locs', label: 'Locations', kind: 'item-list', list: { stats: [{ key: 'Cripd', label: 'Crippled' }, { key: 'Side', label: 'Side', kind: 'pick', opts: [{ name: 'L' }] }], rolls: [{ label: 'Own', apply: [{ list: 'f_loc', s: 'Cripd', formula: '1' }] }] } },
            { id: 'f_sec', key: 'Sec', label: 'Secrets', kind: 'item-list', vis: 'gm', list: { stats: [{ key: 'Mark', label: 'Mark' }] } }],
            items: [{ id: 'i_arm', name: 'Arm', stats: { Cripd: 2 } }, { id: 'i_leg', name: 'Leg', stats: { Cripd: 0 } }],
            rolls: [
                { id: 'r_heal', label: 'Mend all', apply: [{ list: 'f_loc', s: 'cripd', formula: '0', set: true }] },
                { id: 'r_add', label: 'Worsen', apply: [{ list: 'f_loc', s: 'Cripd', formula: 'Bonus', add: true }] },
                { id: 'r_sub', label: 'Ease', apply: [{ list: 'f_loc', s: 'Cripd', formula: '1' }] },
                { id: 'r_chk', label: 'Check', formula: '3d6 <= 10', then: [{ list: 'f_loc', s: 'Cripd', formula: '0', set: true, when: 'hit' }] },
                { id: 'r_gml', label: 'GmList', apply: [{ list: 'f_sec', s: 'Mark', formula: '1', add: true }] },
                { id: 'r_gmf', label: 'GmFormula', apply: [{ list: 'f_loc', s: 'Cripd', formula: 'GmFig', add: true }] },
                { id: 'r_bad', label: 'Bad', apply: [{ list: 'f_loc', s: 'Side', formula: '1' }, { list: 'f_gone', s: 'Cripd', formula: '1' }, { list: 'f_loc', s: '9x', formula: '1' }] },
                { id: 'r_near', label: 'Mend them', apply: [{ list: 'f_loc', s: 'Cripd', formula: '0', set: true }], to: 'near' },
                { id: 'r_t', label: 'Rest', apply: [{ list: 'f_loc', s: 'Cripd', formula: '1' }], every: { n: 1, u: 'hour' } }] };
        const gA = cleanSystem(rawA, { F, gmView: true }), pA = cleanSystem(rawA, { F, gmView: false }), rA = id => gA.rolls.filter(r => r.id === id)[0] || {}, rP = id => pA.rolls.filter(r => r.id === id)[0] || {};
        check('1.6.0 every row of a list (the cleaner, both views): a system apply action\'s change and a system roll\'s Then may name an item list and one of its number stats, the stat spelled as the list spells it, alike in both views and the same cleaned twice; a list\'s own change keeps no list; a list or a stat that is not there, or a choice stat, leaves the amount with nothing to change in the GM\'s view; the players\' view drops an action whose list is GM only, one whose formula reads a GM-only value and one left unfinished',
            J(rA('r_heal').apply) === J([{ list: 'f_loc', s: 'Cripd', formula: '0', set: true }]) && J(rA('r_chk').then) === J([{ list: 'f_loc', s: 'Cripd', formula: '0', set: true, when: 'hit' }])
            && J(rA('r_bad').apply) === J([{ f: '', formula: '1' }, { f: '', formula: '1' }]) && J(gA.fields.filter(f => f.id === 'f_loc')[0].list.rolls[0].apply) === J([{ s: 'Cripd', formula: '1' }])
            && J(pA.rolls.map(r => r.id)) === J(['r_heal', 'r_add', 'r_sub', 'r_chk', 'r_near', 'r_t']) && J(rP('r_heal')) === J(rA('r_heal')) && J(rP('r_chk').then) === J(rA('r_chk').then) && J(cleanSystem(gA, { F, gmView: true })) === J(gA),
            J([gA.rolls, pA.rolls.map(r => r.id)]));
        const rowsA = () => [{ id: 'w_a', defId: 'i_arm', qty: 1 }, { id: 'w_l', defId: 'i_leg', qty: 1, ov: { stats: { Cripd: 3 } } }, { id: 'w_o', qty: 1, def: { name: 'Tail', stats: { Cripd: 1 } } }, { id: 'w_h', defId: 'i_arm', qty: 1, hid: 1 }, { id: 'w_k', defId: 'i_leg', qty: 1, on: true, keptOn: 1, ov: { stats: { Cripd: 5 } } }];
        const chA = { id: 'c', ownerId: 'u', values: { f_hp: { cur: 4 }, f_loc: rowsA() } }, vA = S.makeResolver(gA, chA, F, null);
        const h1 = S.applyAct(gA, chA, rA('r_heal'), vA, F), chH = { id: 'c', ownerId: 'u', values: Object.assign({}, chA.values, h1.values) }, h2 = S.applyAct(gA, chH, rA('r_heal'), S.makeResolver(gA, chH, F, null), F);
        const ad = S.applyAct(gA, chA, rA('r_add'), vA, F), sb = S.applyAct(gA, chA, rA('r_sub'), vA, F), mx = S.applyAct(gA, chA, { apply: [{ f: 'f_hp', formula: '1' }, { list: 'f_loc', s: 'Cripd', formula: '0', set: true }] }, vA, F);
        const cr = (v, a) => (v.values.f_loc || []).map(r => r.id + ':' + (r.def ? r.def.stats.Cripd : r.ov && r.ov.stats ? r.ov.stats.Cripd : '-') + (a && r.ov && r.ov.held ? '!' : '')).join(' ');
        check('1.6.0 every row of a list (applyAct, set and add): Set to 0 writes the stat on each row it moves, a library row\'s figure in its ov.stats held as the GM\'s and a row of its own in its def.stats; a row kept from its player is passed over and a curse kept on moves as any row; one line names the list and the stat once with how many rows moved; Add and Subtract move each row by the amount worked out once (Bonus 2), with the line saying the amount; rows already at the figure move nothing, and an action that moves nothing is none; beside a field\'s change in one press; the character handed in is never changed',
            J(h1.values.f_loc) === J([{ id: 'w_a', defId: 'i_arm', qty: 1, ov: { stats: { Cripd: 0 }, held: ['Cripd'] } }, { id: 'w_l', defId: 'i_leg', qty: 1, ov: { stats: { Cripd: 0 }, held: ['Cripd'] } }, { id: 'w_o', qty: 1, def: { name: 'Tail', stats: { Cripd: 0 } } }, { id: 'w_h', defId: 'i_arm', qty: 1, hid: 1 }, { id: 'w_k', defId: 'i_leg', qty: 1, on: true, keptOn: 1, ov: { stats: { Cripd: 0 }, held: ['Cripd'] } }])
            && J(h1.lines) === J([{ f: 'f_loc', n: 'Locations: Crippled (4 rows)', d: 0, v: 0, all: 4, k: 'Cripd', set: true }]) && h2.ok === false && h2.reason === 'none'
            && cr(ad) === 'w_a:4 w_l:5 w_o:3 w_h:- w_k:7' && J(ad.lines) === J([{ f: 'f_loc', n: 'Locations: Crippled (4 rows)', d: 2, v: 0, all: 4, k: 'Cripd' }]) && cr(sb) === 'w_a:1 w_l:2 w_o:0 w_h:- w_k:4' && sb.lines[0].d === -1
            && J(mx.values.f_hp) === J({ cur: 3 }) && mx.lines.length === 2 && mx.lines[1].all === 4 && J(chA.values.f_loc) === J(rowsA()) && J(chA.values.f_hp) === J({ cur: 4 }),
            J([h1, h2, cr(ad), ad.lines, cr(sb), mx.lines]));
        const th1 = S.applyAct(gA, chA, { apply: S.thenChanges(rA('r_chk'), true) }, vA, F), th0 = S.thenChanges(rA('r_chk'), false);
        const tgA = { id: 't', values: { f_loc: [{ id: 'w_x', defId: 'i_arm', qty: 1 }] } }, nr = S.applyAct(gA, chA, rA('r_near'), S.withOnSelf(vA, false), F, null, null, undefined, null, { char: tgA });
        const t1 = S.timeRuleRun(gA, chA, rA('r_t'), 2, F);
        check('1.6.0 every row of a list from a roll\'s Then (on success, none on a failure), on the adjacent character it is used on (on their rows, none on the user\'s, the line theirs), and by the clock (two runs, a stat going below 0 as a row\'s own change takes it, the run\'s line adding up its amount)',
            J(th1.values.f_loc) === J(h1.values.f_loc) && th0.length === 0 && J(nr.values) === '{}' && J(nr.onValues.f_loc) === J([{ id: 'w_x', defId: 'i_arm', qty: 1, ov: { stats: { Cripd: 0 }, held: ['Cripd'] } }]) && J(nr.onLines) === J([{ f: 'f_loc', n: 'Locations: Crippled (1 row)', d: 0, v: 0, all: 1, k: 'Cripd', set: true }])
            && t1.ran === 2 && cr(t1) === 'w_a:0 w_l:1 w_o:-1 w_h:- w_k:3' && J(t1.lines) === J([{ f: 'f_loc', n: 'Locations: Crippled (4 rows)', d: -2, v: 0, all: 4, k: 'Cripd' }]),
            J([th1.values, nr, t1]));
        const scA = [S.applyScope(gA, chA, rA('r_heal'), false, F), S.applyScope(gA, chA, rA('r_gml'), false, F), S.applyScope(gA, Object.assign({}, chA, { npc: true }), rA('r_heal'), false, F), S.applyScope(gA, chA, { vis: 'all', apply: [{ list: 'f_gone', s: 'X', formula: '1' }] }, false, F)];
        const vB = S.validateSystem(Object.assign({}, gA, { rolls: [{ id: 'r_v', label: 'V', vis: 'all', apply: [{ list: 'f_loc', s: 'Side', formula: '1' }, { list: 'f_gone', s: 'X', formula: '1' }, { list: 'f_sec', s: 'Mark', formula: '1' }, { list: 'f_loc', s: 'Cripd', formula: '1d6' }] }, { id: 'r_w', label: 'W', vis: 'all', formula: '3d6 <= 10', then: [{ list: 'f_sec', s: 'Mark', formula: '1', when: 'hit' }] }] }), F), mB = [].concat(vB.errors, vB.warnings).map(e => e.message);
        const vG = S.validateSystem(gA, F), mG = [].concat(vG.errors, vG.warnings).filter(e => ['r_heal', 'r_add', 'r_sub', 'r_chk', 'r_near', 'r_t'].indexOf(e.id) >= 0).map(e => e.message);
        check('1.6.0 every row of a list: the card is its owner\'s (a list hidden from its owner, a list that is gone and an NPC keep it the GM\'s); the validator says a stat that is no number stat of the list, a list that is gone, a GM-only list on a visible action or roll, and dice in the amount, and says nothing of the ones that are sound',
            J(scA) === J(['owner', 'gm', 'gm', 'gm']) && mB.includes('Pick the stat this changes on every row: "Side" is no number stat of Locations.') && mB.includes('Pick the list this changes on every row: that one is gone.')
            && mB.includes('"Sec" is GM only: players will not get this action.') && mB.includes('"Sec" is GM only: players’ rolls will not change it.') && mB.some(m => /cannot roll dice/.test(m)) && mG.length === 0, J([scA, mB, mG]));
        // from a crossing, through crossFollow's own path: sheets.js crossFollow and applyAction sliced and run for real
        const shY = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const aaSrc = shY.slice(shY.indexOf('function applyAction('), shY.indexOf('// Stage 6 HUD G10: the host\'s round hook')), xsSrc = shY.slice(shY.indexOf('// [systemcheck:cross-start]'), shY.indexOf('// [systemcheck:cross-end]'));
        const gX = cleanSystem(Object.assign({}, rawA, { rolls: rawA.rolls.concat([{ id: 'r_full', label: 'Full again', apply: [{ list: 'f_loc', s: 'Cripd', formula: '0', set: true }], cross: { f: 'f_hp', dir: 'up', at: 'HP.max' } }]) }), { F, gmView: true });
        const cardsX = [], storedX = [], cX = { id: 'c_a', name: 'Ana', ownerId: 'u_a', values: { f_hp: { cur: 5 }, f_loc: rowsA() } }, campX = { id: 'k', system: gX, chars: { c_a: cX } }, nX = { postApplyCard: (ch, lb, ls, sc) => cardsX.push([ch.id, lb, ls, sc]) };
        const applyActionX = new Function('net', 'getActiveCampaign', 'systemOf', 'F', 'isClient', 'canWrite', 'fieldById', 'facingTarget', 'tokenCtxFor', 'withCross', 'resolveAll', 'withOnSelf', 'makeResolver', 'applyAct', 'window', 'toast', 'clone', 'afterCharChange', 'rowRollNames', 'gmOnlyNames', 'gmDerivedNames', 'gmEffectNames', 'labelSecret', 'applyScope', 'goneLocal', 'var lastChange = null;\n' + aaSrc + '\nreturn applyAction;')(
            () => nX, () => campX, k => k.system, () => F, () => false, () => true, S.fieldById, () => null, () => null, S.withCross, S.resolveAll, S.withOnSelf, S.makeResolver, S.applyAct, { wpDiceCore: null }, t => cardsX.push(['toast', t]), x => JSON.parse(JSON.stringify(x)),
            (ch, w, vals) => storedX.push([ch.id, Object.keys(vals)]), S.rowRollNames, S.gmOnlyNames, S.gmDerivedNames, S.gmEffectNames, () => '', S.applyScope, () => {});
        const apiX = new Function('isClient', 'canWrite', 'F', 'crossings', 'makeResolver', 'getActiveCampaign', 'fieldById', 'tokenCtxFor', 'charById', 'net', 'toast', 'applyAction', 'window', xsSrc + '\nreturn { crossFollow: crossFollow, crossSeed: crossSeed };')(
            () => false, () => true, () => F, S.crossings, S.makeResolver, () => campX, S.fieldById, () => null, (id, k) => k.chars[id] || null, () => nX, t => cardsX.push(['toast', t]), applyActionX, { wpDice: null, wpCalendar: { rulesRun: () => null } });
        const seedX = apiX.crossSeed(); cX.values.f_hp = { cur: 9 }; const x1 = apiX.crossFollow(cX, campX); cX.values.f_hp = { cur: 12 }; const x2 = apiX.crossFollow(cX, campX);
        check('1.6.0 every row of a list from a crossing (sheets.js crossFollow and applyAction run for real): hit points rising to full run the action as the GM\'s own press, which sets the stat on every row of the list but the one kept from its player, stores the list once and posts its one line to the owner',
            seedX === 1 && x1 === 0 && x2 === 1 && J(cX.values.f_loc) === J(h1.values.f_loc) && J(storedX) === J([['c_a', ['f_loc']]]) && J(cardsX) === J([['c_a', 'Full again', [{ f: 'f_loc', n: 'Locations: Crippled (4 rows)', d: 0, v: 0, all: 4, k: 'Cripd', set: true }], 'owner']]),
            J([seedX, x1, x2, cX.values.f_loc, storedX, cardsX]));
        // the summary of a time rule, the card on the wire and the editor
        const rmApi = new Function('makeResolver', 'F', 'figText', require('./checkkit').cut('sheettime.js', 'function ruleReads(', 'function ruleDice(') + '\nreturn { ruleMoves: ruleMoves, ruleLineWords: ruleLineWords };')(S.makeResolver, () => F, S.figText);
        const mvA = rmApi.ruleMoves(gA, chA, ['f_loc'], {}, null, t1.lines);
        const cardA = { type: 'apply', id: 'r_x', from: { id: 'u', name: 'U', gm: false }, lines: [{ n: 'Locations: Crippled (4 rows)', s: 1, v: 0 }, { n: 'Locations: Crippled (4 rows)', d: 2 }], ts: 1 };
        const ceApi = new Function('draft', require('./checkkit').cut('sysedroll.js', 'function allRowTargets(', 'function applyChangeOf(') + '\nreturn { allRowTargets: allRowTargets, allRowValue: allRowValue, setChangeTarget: setChangeTarget };')({ fields: rawA.fields });
        const tgE = ceApi.allRowTargets(), chE = { f: 'f_hp', formula: '1', set: true }; ceApi.setChangeTarget(chE, 'all:f_loc:Cripd'); const chE1 = J(chE); ceApi.setChangeTarget(chE, 'f_hp');
        check('1.6.0 every row of a list: a time rule\'s summary says the run\'s line as it is (its rows, an amount on each, a Set its figure), a plain line as before; the card says Set with its figure and an Add as its amount (dicecore cleanApply and applyText), a figure that is no number refused; the Rolls tab offers every number stat of every item list as Every row of, and setChangeTarget writes the list and the stat, and takes them off for a field',
            J(mvA) === J(t1.lines) && rmApi.ruleLineWords(t1.lines[0]) === 'Locations: Crippled (4 rows) -2 each' && rmApi.ruleLineWords(h1.lines[0]) === 'Locations: Crippled (4 rows) set to 0' && rmApi.ruleLineWords({ n: 'HP', d: -1, v: 3 }) === 'HP -1 → 3'
            && J(D6.cleanApply(cardA).lines) === J(cardA.lines) && D6.applyText(cardA) === 'U applied an action: Locations: Crippled (4 rows) set → 0, Locations: Crippled (4 rows) +2'
            && D6.cleanApply(Object.assign({}, cardA, { lines: [{ n: 'L', s: 1, v: 'x' }] })) === null && D6.cleanApply(Object.assign({}, cardA, { lines: [{ n: 'L', s: 1, v: 1e16 }] })) === null
            && J(tgE) === J([['all:f_loc:Cripd', 'Every row of Locations: Crippled'], ['all:f_sec:Mark', 'Every row of Secrets: Mark']]) && chE1 === J({ formula: '1', set: true, list: 'f_loc', s: 'Cripd' }) && J(chE) === J({ formula: '1', set: true, f: 'f_hp' })
            && ceApi.allRowValue({ list: 'f_loc', s: 'cripd' }, tgE) === 'all:f_loc:Cripd' && /var opts = \[\['', 'Pick a pool, number or effect\\u2026'\]\]\.concat\(targets, fxT, key === 'end' \? \[\] : allT\);/.test(require('./checkkit').part('sysedroll.js')) /* 1.6.2: an effect's end offers no list's rows, moved on purpose */ && /'Every row of: that list is gone'/.test(require('./checkkit').part('sysederr.js')),
            J([mvA, D6.applyText(cardA), tgE, chE1, J(chE)]));
        // a system that names no list on any change: cleaned, applied, run by the clock, judged and carded byte for byte as before (the hash the code before this fold gave)
        const rawP = { v: 1, name: 'P', fields: [
            { id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', maxFormula: '12', def: 'max', min: -12 }, { id: 'f_bo', key: 'Bonus', kind: 'number', def: 2 },
            { id: 'f_loc', key: 'Locs', label: 'Locations', kind: 'item-list', list: { stats: [{ key: 'Cripd', label: 'Crippled' }], rolls: [{ label: 'Wear', apply: [{ s: 'Cripd', formula: '1', add: true }, { q: true, formula: '1' }] }] } }],
            items: [{ id: 'i_arm', name: 'Arm', stats: { Cripd: 2 } }],
            rolls: [{ id: 'r_a', label: 'Hurt', apply: [{ f: 'f_hp', formula: 'Bonus' }, { s: 'Cripd', formula: '1' }] }, { id: 'r_b', label: 'Check', formula: '3d6 <= 10', then: [{ f: 'f_hp', formula: '0', set: true, when: 'hit' }] },
                { id: 'r_t', label: 'Rest', apply: [{ f: 'f_hp', formula: '1', add: true }], every: { n: 1, u: 'hour' } }] };
        const gP = S.cleanSystem(rawP, { F, gmView: true }), pP = S.cleanSystem(rawP, { F, gmView: false });
        const chP = { id: 'c', ownerId: 'u', values: { f_hp: { cur: 6 }, f_loc: [{ id: 'w_a', defId: 'i_arm', qty: 2 }] } }, vP = S.makeResolver(gP, chP, F, null);
        const a1 = S.applyAct(gP, chP, gP.rolls[0], vP, F), a2 = S.applyAct(gP, chP, gP.fields[2].list.rolls[0], vP.row('f_loc', 'w_a'), F, null, { f: 'f_loc', r: 'w_a' }), a3 = S.applyAct(gP, chP, { apply: S.thenChanges(gP.rolls[1], true) }, vP, F);
        const tP = S.timeRuleRun(gP, chP, gP.rolls[2], 3, F), scP = [S.applyScope(gP, chP, gP.rolls[0], false, F), S.applyScope(gP, chP, gP.rolls[2], false, F)], vaP = S.validateSystem(gP, F);
        const cardP = { type: 'apply', id: 'r_x', from: { id: 'u', name: 'U', gm: false }, lines: [{ n: 'HP', d: -2, v: 4 }, { n: 'HP', s: 1 }, { n: 'X', fx: 1 }], ts: 1 }, badP = Object.assign({}, cardP, { lines: [{ n: 'HP', s: 1, d: 1 }] });
        const hashP = require('crypto').createHash('sha256').update(JSON.stringify([gP, pP, a1, a2, a3, tP, scP, vaP, D6.cleanApply(cardP), D6.applyText(cardP), D6.cleanApply(badP)])).digest('hex');
        check('1.6.0 every row of a list: a system that names no list on any change is cleaned in both views, applied (a field, a list\'s own row, a Then), run by the clock, judged, and its cards cleaned and said byte for byte as before (pinned by the hash the code before the fold gave)',
            hashP === 'c3e94a07df9473b1c7b3757cf56b003b2e445e5dd99a4cdadddda2270477c0d9', hashP);
        const rdN = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'), helpN = rdN(path.join(app, 'index.html')), wn1 = rdN(path.join(app, '..', '..', 'WHATSNEW.txt')), wn2 = rdN(path.join(app, 'assets', 'whatsnew.txt')), guideN = rdN(path.join(app, '..', '..', 'CAMPAIGN_INTEGRATION.md'));
        const wnSays = '- A change of the system\'s own apply action or roll can move one number\n  stat on every row of a list, such as Every row of Locations: Crippled,\n  Set to 0.';
        check('1.6.0 every row of a list: Help, both release notes and the integration guide say it',
            helpN.indexOf('<li>A change of the system&rsquo;s own apply action or roll can move one number stat on <b>every row</b> of a list, such as Every row of Locations: Crippled, Set to 0. Its amount is worked out once with the character&rsquo;s names. A row kept from its player is passed over.') >= 0
            && wn1.indexOf(wnSays) >= 0 && wn2.indexOf(wnSays) >= 0 && guideN.indexOf('may instead be `{ "list": an item list\'s field id, "s": a number stat\'s key of that list, "formula", "add" or "set" }` (1.6.0)') >= 0);
    }
    {   // 1.6.0 (asked by a campaign build's session): a change on every row of a list whose amount reads each row's own names (Row.*), worked out
        // row by row with that row's resolver: Set if(Row.Sev >= 5, Row.Sev, 0) clears a crippling of 1 to 4 and keeps a severing of 5 or more
        const J = JSON.stringify, D6 = await import(url('dicecore.js'));
        const rawR = { v: 1, name: 'R', fields: [
            { id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', maxFormula: '12', def: 'max', min: -12 }, { id: 'f_bo', key: 'Bonus', kind: 'number', def: 2 }, { id: 'f_gx', key: 'GmFig', kind: 'number', def: 1, vis: 'gm' },
            { id: 'f_loc', key: 'Locs', label: 'Locations', kind: 'item-list', list: { stats: [{ key: 'Sev', label: 'Severity' }, { key: 'Wt', label: 'Weight' }] } },
            { id: 'f_sec', key: 'Sec', label: 'Secrets', kind: 'item-list', list: { stats: [{ key: 'Mk', label: 'Mark' }], cols: [{ key: 'Hid', label: 'Hidden', formula: 'GmFig + Row.Mk' }] } }],
            items: [{ id: 'i_arm', name: 'Arm', stats: { Sev: 3, Wt: 2 } }, { id: 'i_leg', name: 'Leg', stats: { Sev: 6, Wt: 1 } }, { id: 'i_gem', name: 'Gem', stats: { Mk: 1 } }],
            rolls: [
                { id: 'r_cut', label: 'Mend', apply: [{ list: 'f_loc', s: 'Sev', formula: 'if(Row.Sev >= 5, Row.Sev, 0)', set: true }] },
                { id: 'r_wear', label: 'Wear', apply: [{ list: 'f_loc', s: 'Sev', formula: 'Row.Wt', add: true }] },
                { id: 'r_one', label: 'One', apply: [{ list: 'f_loc', s: 'Sev', formula: 'Row.Wt * 0 + Bonus', add: true }] },
                { id: 'r_ease', label: 'Ease', apply: [{ list: 'f_loc', s: 'Sev', formula: 'Row.Wt - 2' }] },
                { id: 'r_div', label: 'Div', apply: [{ list: 'f_loc', s: 'Sev', formula: '12 / Row.Wt', set: true }] },
                { id: 'r_dice', label: 'Dice', apply: [{ list: 'f_loc', s: 'Sev', formula: '1d6 + Row.Wt', add: true, roll: true }] },
                { id: 'r_sec', label: 'SecAll', apply: [{ list: 'f_sec', s: 'Mk', formula: 'Row.Mk + 1', set: true }] },
                { id: 'r_chk', label: 'Check', formula: '3d6 <= 10', then: [{ list: 'f_sec', s: 'Mk', formula: 'Row.Mk', set: true, when: 'hit' }, { f: 'f_hp', formula: '1', when: 'hit' }] },
                { id: 'r_near', label: 'Mend them', apply: [{ list: 'f_loc', s: 'Sev', formula: 'if(Row.Sev >= 5, Row.Sev, 0)', set: true }], to: 'near' },
                { id: 'r_t', label: 'Rest', apply: [{ list: 'f_loc', s: 'Sev', formula: 'Row.Wt', add: true }], every: { n: 1, u: 'hour' } },
                { id: 'r_ts', label: 'Rest set', apply: [{ list: 'f_loc', s: 'Sev', formula: 'Row.Wt * 0', set: true }], every: { n: 1, u: 'hour' } }] };
        const gR = cleanSystem(rawR, { F, gmView: true }), pR = cleanSystem(rawR, { F, gmView: false }), rR = id => gR.rolls.filter(r => r.id === id)[0] || {}, rP = id => pR.rolls.filter(r => r.id === id)[0] || null;
        check("1.6.0 every row of a list worked out row by row (the cleaner, both views): a formula that reads Row. names is kept as it is in the GM's view and cleaned twice alike; the players' view keeps it on a list whose own names read nothing GM-only, and drops it where a column of the list reads a GM-only value, as Changes apply where is judged (an apply action whole, a roll's Then step alone, which the host runs, the roll kept); readsRow tells Row. and Host. names, a formula with none is told apart",
            J(rR('r_cut').apply) === J([{ list: 'f_loc', s: 'Sev', formula: 'if(Row.Sev >= 5, Row.Sev, 0)', set: true }]) && J(cleanSystem(gR, { F, gmView: true })) === J(gR)
            && J(pR.rolls.map(r => r.id)) === J(['r_cut', 'r_wear', 'r_one', 'r_ease', 'r_div', 'r_dice', 'r_chk', 'r_near', 'r_t', 'r_ts']) && J(rP('r_cut')) === J(rR('r_cut')) && rP('r_chk') && J(rP('r_chk').then) === J([{ f: 'f_hp', formula: '1', when: 'hit' }]) && J(rP('r_chk').thenGm) === '[0]' && J(rR('r_chk').then.length) === '2'
            && S.readsRow('if(Row.Sev >= 5, Row.Sev, 0)', F) === true && S.readsRow('Host.Mk + 1', F) === true && S.readsRow('Bonus + 1', F) === false && S.readsRow('', F) === false && S.readsRow('Row.Sev', null) === false
            && S.allRowOk({ fields: S.gmViewFields(rawR, F) }, F, rawR.fields[3], 'Row.Wt + Bonus') === true && S.allRowOk({ fields: S.gmViewFields(rawR, F) }, F, rawR.fields[4], 'Row.Mk') === false && S.allRowOk({ fields: S.gmViewFields(rawR, F) }, F, rawR.fields[3], 'Row.Wt + GmFig') === false,
            J([gR.rolls, pR.rolls.map(r => r.id)]));
        const rowsR = () => [{ id: 'w_a', defId: 'i_arm', qty: 1 }, { id: 'w_l', defId: 'i_leg', qty: 1 }, { id: 'w_o', qty: 1, def: { name: 'Tail', stats: { Sev: 2, Wt: 4 } } }, { id: 'w_h', defId: 'i_arm', qty: 1, hid: 1 }, { id: 'w_z', qty: 1, def: { name: 'Fin', stats: { Sev: 1, Wt: 0 } } }];
        const chR = { id: 'c', ownerId: 'u', values: { f_hp: { cur: 4 }, f_loc: rowsR(), f_sec: [{ id: 'w_g', defId: 'i_gem', qty: 1 }] } }, vR = S.makeResolver(gR, chR, F, null);
        const sv = (v, fid) => ((v && v.values ? v.values[fid || 'f_loc'] : null) || []).map(r => r.id + ':' + (r.def ? r.def.stats[fid ? 'Mk' : 'Sev'] : r.ov && r.ov.stats ? r.ov.stats[fid ? 'Mk' : 'Sev'] : '-')).join(' ');
        const cut = S.applyAct(gR, chR, rR('r_cut'), vR, F), wear = S.applyAct(gR, chR, rR('r_wear'), vR, F), one = S.applyAct(gR, chR, rR('r_one'), vR, F), ease = S.applyAct(gR, chR, rR('r_ease'), vR, F), div = S.applyAct(gR, chR, rR('r_div'), vR, F);
        check("1.6.0 every row of a list worked out row by row (applyAct, the severing example and Set): if(Row.Sev >= 5, Row.Sev, 0) clears a crippling of 3 and of 2 and keeps the severing of 6, each row by its own Severity, the row kept from its player passed over; every row moved by the same figure says it once, Set to 0; what it read is named as the list's own (Locs.count) for the GM-only judges; the character handed in is never changed",
            sv(cut) === 'w_a:0 w_l:- w_o:0 w_h:- w_z:0' && J(cut.lines) === J([{ f: 'f_loc', n: 'Locations: Severity (3 rows)', d: 0, v: 0, all: 3, k: 'Sev', set: true }]) && J(cut.names) === J([{ name: 'Locs.count' }])
            && J(cut.values.f_loc[0]) === J({ id: 'w_a', defId: 'i_arm', qty: 1, ov: { stats: { Sev: 0 }, held: ['Sev'] } }) && J(cut.values.f_loc[3]) === J({ id: 'w_h', defId: 'i_arm', qty: 1, hid: 1 }) && J(chR.values.f_loc) === J(rowsR()),
            J([sv(cut), cut.lines, cut.names]));
        check("1.6.0 every row of a list worked out row by row (applyAct, Add and Subtract): Add Row.Wt moves each row by its own Weight, and the line, its figure differing by row, says none (vary); a figure that is the same on every row is the line's own as before; Subtract keeps each row's amount at 0 or more, so a row whose amount reads below 0 is passed over; a row whose figure cannot be worked out (12 / Row.Wt on a Weight of 0) is passed over and the rest move",
            sv(wear) === 'w_a:5 w_l:7 w_o:6 w_h:- w_z:1' && J(wear.lines) === J([{ f: 'f_loc', n: 'Locations: Severity (3 rows)', d: 0, v: 0, all: 3, k: 'Sev', vary: true }])
            && sv(one) === 'w_a:5 w_l:8 w_o:4 w_h:- w_z:3' && J(one.lines) === J([{ f: 'f_loc', n: 'Locations: Severity (4 rows)', d: 2, v: 0, all: 4, k: 'Sev' }])
            && sv(ease) === 'w_a:- w_l:- w_o:0 w_h:- w_z:1' && J(ease.lines) === J([{ f: 'f_loc', n: 'Locations: Severity (1 row)', d: -2, v: 0, all: 1, k: 'Sev' }])
            && sv(div) === 'w_a:6 w_l:12 w_o:3 w_h:- w_z:1' && J(div.lines) === J([{ f: 'f_loc', n: 'Locations: Severity (3 rows)', d: 0, v: 0, all: 3, k: 'Sev', set: true, vary: true }]),
            J([sv(wear), wear.lines, sv(one), one.lines, sv(ease), ease.lines, sv(div), div.lines]));
        const dnoD = S.applyAct(gR, chR, rR('r_dice'), vR, F), dD = S.applyAct(gR, chR, rR('r_dice'), vR, F, null, null, undefined, { random: () => 1 });
        const tgR = { id: 't', values: { f_loc: [{ id: 'w_x', defId: 'i_leg', qty: 1 }, { id: 'w_y', qty: 1, def: { name: 'Wing', stats: { Sev: 4, Wt: 1 } } }] } }, vT = S.makeResolver(gR, tgR, F, null);
        const nr1 = S.applyAct(gR, chR, rR('r_near'), S.withOnSelf(vR, false, vT), F, null, null, undefined, null, { char: tgR }), nr2 = S.applyAct(gR, chR, rR('r_near'), S.withOnSelf(vR, false), F, null, null, undefined, null, { char: tgR });
        check("1.6.0 every row of a list worked out row by row: a Rolled amount rolls on each row (the host's dice), its line saying each row's draw, and with no dice core it is refused as ever; used on an adjacent character, each of their rows is read through their own resolver (withOnSelf's onRes, else one made for them), the severing kept on their rows and none of the user's moved",
            dnoD.ok === false && /cannot roll dice/.test(dnoD.message || '') && sv(dD) === 'w_a:6 w_l:8 w_o:7 w_h:- w_z:2' && J(dD.lines) === J([{ f: 'f_loc', n: 'Locations: Severity (4 rows)', d: 0, v: 0, all: 4, k: 'Sev', vary: true, roll: '1d6: 1; 1d6: 1; 1d6: 1; 1d6: 1' }]) && dD.drew === true
            && J(nr1.values) === '{}' && J(nr1.onValues.f_loc) === J([{ id: 'w_x', defId: 'i_leg', qty: 1 }, { id: 'w_y', qty: 1, def: { name: 'Wing', stats: { Sev: 0, Wt: 1 } } }]) && J(nr1.onLines) === J([{ f: 'f_loc', n: 'Locations: Severity (1 row)', d: 0, v: 0, all: 1, k: 'Sev', set: true }]) && J(nr2.onValues) === J(nr1.onValues),
            J([dnoD, sv(dD), dD.lines, nr1, nr2.onValues]));
        const t2 = S.timeRuleRun(gR, chR, rR('r_t'), 2, F), t3 = S.timeRuleRun(gR, chR, rR('r_ts'), 1, F);
        const shR = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const rmR = new Function('makeResolver', 'F', 'figText', require('./checkkit').cut('sheettime.js', 'function ruleReads(', 'function ruleDice(') + '\nreturn { ruleMoves: ruleMoves, ruleLineWords: ruleLineWords };')(S.makeResolver, () => F, S.figText);
        check("1.6.0 every row of a list worked out row by row by the clock (timeRuleRun, ruleMoves, ruleLineWords): two runs of Add Row.Wt move each row twice by its own Weight and add up as one line that says the figure differs by row; a Set worked out row by row to the same figure says it; a time rule's summary says moved row by row, set row by row, or the figure",
            t2.ran === 2 && sv(t2) === 'w_a:7 w_l:8 w_o:10 w_h:- w_z:1' && J(t2.lines) === J([{ f: 'f_loc', n: 'Locations: Severity (3 rows)', d: 0, v: 0, all: 3, k: 'Sev', vary: true }])
            && J(t3.lines) === J([{ f: 'f_loc', n: 'Locations: Severity (4 rows)', d: 0, v: 0, all: 4, k: 'Sev', set: true }]) && J(rmR.ruleMoves(gR, chR, ['f_loc'], {}, null, t2.lines)) === J(t2.lines)
            && rmR.ruleLineWords(t2.lines[0]) === 'Locations: Severity (3 rows) moved row by row' && rmR.ruleLineWords(div.lines[0]) === 'Locations: Severity (3 rows) set row by row' && rmR.ruleLineWords(t3.lines[0]) === 'Locations: Severity (4 rows) set to 0',
            J([t2, t3.lines]));
        // from a crossing, through crossFollow's own path: sheets.js crossFollow and applyAction sliced and run for real
        const aaR = shR.slice(shR.indexOf('function applyAction('), shR.indexOf('// Stage 6 HUD G10: the host\'s round hook')), xsR = shR.slice(shR.indexOf('// [systemcheck:cross-start]'), shR.indexOf('// [systemcheck:cross-end]'));
        const gY = cleanSystem(Object.assign({}, rawR, { rolls: rawR.rolls.concat([{ id: 'r_full', label: 'Full again', apply: [{ list: 'f_loc', s: 'Sev', formula: 'if(Row.Sev >= 5, Row.Sev, 0)', set: true }], cross: { f: 'f_hp', dir: 'up', at: 'HP.max' } }]) }), { F, gmView: true });
        const cardsY = [], storedY = [], cY = { id: 'c_a', name: 'Ana', ownerId: 'u_a', values: { f_hp: { cur: 5 }, f_loc: rowsR() } }, campY = { id: 'k', system: gY, chars: { c_a: cY } }, nY = { postApplyCard: (ch, lb, ls, sc) => cardsY.push([ch.id, lb, ls, sc]) };
        const applyActionY = new Function('net', 'getActiveCampaign', 'systemOf', 'F', 'isClient', 'canWrite', 'fieldById', 'facingTarget', 'tokenCtxFor', 'withCross', 'resolveAll', 'withOnSelf', 'makeResolver', 'applyAct', 'window', 'toast', 'clone', 'afterCharChange', 'rowRollNames', 'gmOnlyNames', 'gmDerivedNames', 'gmEffectNames', 'labelSecret', 'applyScope', 'goneLocal', 'var lastChange = null;\n' + aaR + '\nreturn applyAction;')(
            () => nY, () => campY, k => k.system, () => F, () => false, () => true, S.fieldById, () => null, () => null, S.withCross, S.resolveAll, S.withOnSelf, S.makeResolver, S.applyAct, { wpDiceCore: null }, t => cardsY.push(['toast', t]), x => JSON.parse(JSON.stringify(x)),
            (ch, w, vals) => storedY.push([ch.id, Object.keys(vals)]), S.rowRollNames, S.gmOnlyNames, S.gmDerivedNames, S.gmEffectNames, () => '', S.applyScope, () => {});
        const apiY = new Function('isClient', 'canWrite', 'F', 'crossings', 'makeResolver', 'getActiveCampaign', 'fieldById', 'tokenCtxFor', 'charById', 'net', 'toast', 'applyAction', 'window', xsR + '\nreturn { crossFollow: crossFollow, crossSeed: crossSeed };')(
            () => false, () => true, () => F, S.crossings, S.makeResolver, () => campY, S.fieldById, () => null, (id, k) => k.chars[id] || null, () => nY, t => cardsY.push(['toast', t]), applyActionY, { wpDice: null, wpCalendar: { rulesRun: () => null } });
        const seedY = apiY.crossSeed(); cY.values.f_hp = { cur: 9 }; const y1 = apiY.crossFollow(cY, campY); cY.values.f_hp = { cur: 12 }; const y2 = apiY.crossFollow(cY, campY);
        check("1.6.0 every row of a list worked out row by row from a crossing (sheets.js crossFollow and applyAction run for real): hit points rising to full run the severing example as the GM's own press, which clears each crippling and keeps the severing, stores the list once and posts its one line to the owner",
            seedY === 1 && y1 === 0 && y2 === 1 && sv(cY) === 'w_a:0 w_l:- w_o:0 w_h:- w_z:0' && J(storedY) === J([['c_a', ['f_loc']]]) && J(cardsY) === J([['c_a', 'Full again', [{ f: 'f_loc', n: 'Locations: Severity (3 rows)', d: 0, v: 0, all: 3, k: 'Sev', set: true }], 'owner']]),
            J([seedY, y1, y2, sv(cY), storedY, cardsY]));
        // the card, the judges and the validator
        const cardR = { type: 'apply', id: 'r_x', from: { id: 'u', name: 'U', gm: false }, lines: [{ n: 'Locations: Severity (4 rows)', s: 1 }, { n: 'Locations: Severity (3 rows)', s: 1, v: 0 }], ts: 1 };
        const chS = { id: 'c', ownerId: 'u', values: { f_sec: [{ id: 'w_g', defId: 'i_gem', qty: 1 }] } }, scR = [S.applyScope(gR, chR, rR('r_wear'), false, F), S.applyScope(gR, chS, rR('r_sec'), false, F), S.applyScope(gR, chR, { vis: 'all', apply: [{ list: 'f_loc', s: 'Sev', formula: 'Row.Wt + GmFig', add: true }] }, false, F)];
        const vV = S.validateSystem(Object.assign({}, gR, { rolls: [
            { id: 'r_v1', label: 'V1', vis: 'all', apply: [{ list: 'f_loc', s: 'Sev', formula: 'Row.Mk', add: true }] }, { id: 'r_v2', label: 'V2', vis: 'all', apply: [{ f: 'f_hp', formula: 'Row.Wt' }] },
            { id: 'r_v3', label: 'V3', vis: 'all', apply: [{ list: 'f_sec', s: 'Mk', formula: 'Row.Mk + 1', set: true }] }, { id: 'r_v4', label: 'V4', vis: 'all', formula: '3d6 <= 10', then: [{ list: 'f_sec', s: 'Mk', formula: 'Row.Mk', set: true, when: 'hit' }] }] }), F);
        const mV = id => [].concat(vV.errors, vV.warnings).filter(e => e.id === id).map(e => e.message), vG = S.validateSystem(gR, F), mG = [].concat(vG.errors, vG.warnings).filter(e => /^r_/.test(e.id) && e.id !== 'r_sec' && e.id !== 'r_chk').map(e => e.message);
        check("1.6.0 every row of a list worked out row by row: the card says Set with no figure where it differs by row and with its figure where it does not (dicecore cleanApply and applyText); the card is its owner's, and the GM's where its row names read a GM-only value; the validator knows Row. names only on a change on every row of that very list, with that list's names, and warns where its row names read a GM-only value; the sound ones say nothing",
            J(D6.cleanApply(cardR).lines) === J(cardR.lines) && D6.applyText(cardR) === 'U applied an action: Locations: Severity (4 rows) set, Locations: Severity (3 rows) set → 0'
            && J(scR) === J(['owner', 'gm', 'gm'])
            && mV('r_v1').some(m => /Unknown name "Row\.Mk"/.test(m)) && mV('r_v2').some(m => /names a row, so it is known only/.test(m))
            && J(mV('r_v3')) === J(['Its row names read a value worked out from a GM-only one in Secrets: players will not get this action.']) && J(mV('r_v4')) === J(['Its row names read a value worked out from a GM-only one in Secrets: players’ rolls will not change it.'])
            && mG.length === 0, J([D6.applyText(cardR), scR, mV('r_v1'), mV('r_v2'), mV('r_v3'), mV('r_v4'), mG]));
        const rdN2 = p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'), helpR = rdN2(path.join(app, 'index.html')), wR1 = rdN2(path.join(app, '..', '..', 'WHATSNEW.txt')), wR2 = rdN2(path.join(app, 'assets', 'whatsnew.txt')), guideR = rdN2(path.join(app, '..', '..', 'CAMPAIGN_INTEGRATION.md'));
        const wnR = '  Its amount may read each row\'s own names, such as Row.Sev: it is then\n  worked out for each row, and a row it cannot work out is passed over.';
        check('1.6.0 every row of a list worked out row by row: Help, both release notes and the integration guide say it',
            helpR.indexOf('Where its amount reads a row&rsquo;s own names, such as Row.Sev, it is worked out for each row. Set to <code>if(Row.Sev &gt;= 5, Row.Sev, 0)</code> clears a crippling of 1 to 4 and keeps a severing of 5 or more.') >= 0
            && wR1.indexOf(wnR) >= 0 && wR2.indexOf(wnR) >= 0 && guideR.indexOf('or, where it reads a row\'s own names (`Row.<name>`), for each row with that row\'s names') >= 0);
    }
    {   // 1.6.0 (the owner, by prompt: "On.<name>"): an entry used on an adjacent character reads that character's figures
        const J = JSON.stringify, rawO = { v: 1, name: 'T', fields: [{ id: 'f_hp', key: 'HP', kind: 'number', def: 8 }, { id: 'f_dr', key: 'Robot', kind: 'toggle' }, { id: 'f_sec', key: 'Sec', kind: 'number', vis: 'gm', def: 5 }],
            rolls: [{ id: 'r_med', label: 'Medpac', apply: [{ f: 'f_hp', formula: '2 + On.HP', add: true }], needs: 'not(On.Robot)', needsText: 'Not on a robot', to: 'near' }, { id: 'r_sec', label: 'S', apply: [{ f: 'f_hp', formula: 'On.Sec', add: true }], to: 'near' },
                { id: 'r_plain', label: 'P', apply: [{ f: 'f_hp', formula: 'On.HP', add: true }] }] };
        const gO = cleanSystem(rawO, { F, gmView: true }), pO = cleanSystem(rawO, { F, gmView: false }), med = gO.rolls[0];
        const user = { id: 'u', values: { f_hp: 5 } }, robot = { id: 'd', values: { f_hp: 3, f_dr: true } }, man = { id: 'm', values: { f_hp: 4 } }, vu = S.makeResolver(gO, user, F, null);
        const onD = S.applyAct(gO, user, med, S.withOnSelf(vu, false, S.makeResolver(gO, robot, F, null)), F, null, null, undefined, null, { char: robot });
        const onM = S.applyAct(gO, user, med, S.withOnSelf(vu, false, S.makeResolver(gO, man, F, null)), F, null, null, undefined, null, { char: man });
        const self = S.applyAct(gO, user, med, S.withOnSelf(vu, true), F), noOn = S.applyAct(gO, user, med, S.withOnSelf(vu, false), F, null, null, undefined, null, { char: man });
        const msgO = S.validateSystem(gO, F).errors.map(e => e.id + ': ' + e.message);
        check('1.6.0 On.<name> (withOnSelf, run for real): an entry\'s needs and amounts read the figures of the one it is used on (Medpac refused on a robot in its own words; on another, 2 + their HP), on oneself one\'s own, and with no resolver of the other nothing (the press fails); readsOn tells such a formula; the GM-only judges read On.Sec as Sec; the players\' view drops an entry whose On. name is GM-only; the editor knows On. only where the entry Applies to an adjacent character',
            onD.ok === false && onD.message === 'Not on a robot' && J(onM.onValues) === J({ f_hp: 10 }) && J(self.values) === J({ f_hp: 12 }) && noOn.ok === false
            && S.readsOn('not(On.Robot)', F) === true && S.readsOn('not(Robot)', F) === false && S.readsOn('OnSelf', F) === false && J(S.gmOnlyNames(gO, [{ name: 'On.Sec' }, { name: 'On.HP' }])) === J(['On.Sec'])
            && J(pO.rolls.map(r => r.id)) === J(['r_med', 'r_plain']) && J(msgO) === J(['r_plain: "On.HP" reads the one it is used on, so it is known only in a roll or an action that Applies to the user or an adjacent character.']), J([onD, onM, self.values, noOn, pO.rolls.map(r => r.id), msgO]));
        const shO = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8');
        check('1.6.0 On.<name> on the sheet (source): a button whose needs read the one it is used on never grays by them (the host judges them once the press names someone), on a roll and on an action; the GM\'s press reads On. through the system with the target in its own token\'s context',
            (shO.match(/rollNeedsFails\(r, \(r\.to === 'near' \|\| r\.to === 'target'\) && typeof withOnSelf === 'function' \? withOnSelf\(vars, true\) : vars, F\(\), undefined, true\)/g) || []).length === 2 && /onOther\(entry\) && readsOn\(t, F\)/.test(fs.readFileSync(path.join(app, 'scripts', 'systemcore.js'), 'utf8')) && shO.includes('vv = withOnSelf(vv, !onT, onT ? makeResolver(sys, onT.ch, F(),'));
    }
    {   // 1.6.0: a custom roller's starting text that the player finishes
        const rlS = t => S.validateSystem(cleanSystem({ v: 1, name: 'R', fields: [{ id: 'f_dx', key: 'DX', kind: 'number', def: 10 }], sheet: { sections: [{ id: 's_a', title: 'A', fields: [{ kind: 'roller', text: 'Roll', formula: t }] }] } }, { F, gmView: true }), F).warnings.filter(w => /Custom roller/.test(w.message)).map(w => w.message);
        check('1.6.0 a Custom roller may start with a formula the player finishes (3d6 <=, d20 +, 3d6 <= DX -): no warning; a text that is no formula even so still warns, and a name it reads is still judged',
            ['3d6 <=', '3d6 <= ', 'd20 +', '3d6 <= DX -', '2d6 >', '1d6 *', '3d6 <= DX + 2'].every(t => rlS(t).length === 0) && rlS('3d6 <= (').length === 1 && rlS('3d6 <= Nope +').length === 1 && /unknown name "Nope"/.test(rlS('3d6 <= Nope +')[0]),
            JSON.stringify(['3d6 <=', '3d6 <= (', '3d6 <= Nope +'].map(rlS)));
    }
    {   // 1.6.0 (a builder audit, the core's rule: the higher, with no double): a grant of an entry its list already holds raises the held row, on invented data
        const J = JSON.stringify;
        const rawR = { v: 1, name: 'R', rolls: [], items: [
            { id: 'i_amu', name: 'Amulet', category: 'Gear', grants: [{ list: 'f_tr', entry: 'i_acu', lvl: 4 }, { list: 'f_bg', entry: 'i_rop' }] },
            { id: 'i_rng', name: 'Ring', category: 'Gear', grants: [{ list: 'f_tr', entry: 'i_acu', lvl: 3 }] },
            { id: 'i_ban', name: 'Band', category: 'Gear', grants: [{ list: 'f_tr', entry: 'i_acu', lvl: 5, once: true }, { list: 'f_bq', entry: 'i_rop', once: true }] },
            { id: 'i_acu', name: 'Keen Ears', category: 'Trait' }, { id: 'i_rop', name: 'Rope', category: 'Gear' }],
            fields: [{ id: 'f_gr', key: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { trade: true } },
                { id: 'f_tr', key: 'Traits', kind: 'item-list', vis: 'all', edit: 'owner', list: { noQty: true, trade: true, lvl: { min: 1, max: 6, def: 1 } } },
                { id: 'f_bg', key: 'Bag', kind: 'item-list', vis: 'all', edit: 'owner', list: { grantRaise: true } },
                { id: 'f_bq', key: 'Pack', kind: 'item-list', vis: 'all', edit: 'owner' }], sheet: { sections: [] } };
        const gR = cleanSystem(rawR, { F, gmView: true }), pR = cleanSystem(rawR, { F, gmView: false });
        const putR = (ch, f, r) => { if (r.ok) { ch.values[f] = r.value; if (r.also) Object.keys(r.also).forEach(k => { ch.values[k] = r.also[k]; }); } return r; };
        const opR = (ch, f, q, o) => putR(ch, f, S.applyRowOp(gR, ch, f, q, F, o || {}));
        const trR = ch => ch.values.f_tr.map(r => [r.defId, r.lvl === undefined ? '-' : r.lvl, r.gb || '', r.gl === undefined ? '-' : r.gl, r.gr || ''].join(':'));
        const mkR = (lvl) => ({ id: 'c_r', name: 'Rin', ownerId: 'u_p', npc: false, values: { f_gr: [], f_tr: [lvl === undefined ? { id: 'w_own', defId: 'i_acu', qty: 1 } : { id: 'w_own', defId: 'i_acu', qty: 1, lvl: lvl }], f_bg: [{ id: 'w_rp', defId: 'i_rop', qty: 2 }], f_bq: [{ id: 'w_rq', defId: 'i_rop', qty: 1 }] } });
        const c1 = mkR(1), a1 = opR(c1, 'f_gr', { op: 'add', defId: 'i_amu', rowId: 'w_am' }), s1 = trR(c1), bag1 = J(c1.values.f_bg);
        const r1 = opR(c1, 'f_gr', { op: 'remove', rowId: 'w_am' }), s2 = trR(c1);
        const raiseOk = a1.ok && a1.raised === 'Keen Ears raised to 4 by Amulet.' && J(s1) === J(['i_acu:4:w_am:1:']) && bag1 === J([{ id: 'w_rp', defId: 'i_rop', qty: 2, gb: 'w_am' }]) && r1.ok && J(s2) === J(['i_acu:1::-:']) && J(c1.values.f_bg) === J([{ id: 'w_rp', defId: 'i_rop', qty: 2 }]);
        check('1.6.0 (a builder audit) a grant of an entry its list already holds (applyRowOp, run for real): on a list with no quantity the held row is raised to the grant\'s level and marked as backed by it (gb, its own level before kept as gl), never doubled, and the answer says "Keen Ears raised to 4 by Amulet."; on a list ticked A grant raises a held row the same, adding no second row; when the granting row goes the held row falls back to the level it stood at and loses its marks',
            raiseOk, J([a1.raised, s1, bag1, s2, c1.values.f_bg]));
        const c2 = mkR(), b2 = opR(c2, 'f_gr', { op: 'add', defId: 'i_amu', rowId: 'w_am' }), s3 = trR(c2); opR(c2, 'f_gr', { op: 'remove', rowId: 'w_am' }); const s4 = trR(c2);
        const c3 = mkR(2); opR(c3, 'f_gr', { op: 'add', defId: 'i_amu', rowId: 'w_am' }); const h1 = opR(c3, 'f_tr', { op: 'set', rowId: 'w_own', facts: { lvl: 5 } }), s5 = trR(c3); const h2 = opR(c3, 'f_tr', { op: 'set', rowId: 'w_own', facts: { lvl: 1 } }), s6 = trR(c3);
        opR(c3, 'f_tr', { op: 'set', rowId: 'w_own', facts: { lvl: 6 } }); opR(c3, 'f_gr', { op: 'remove', rowId: 'w_am' }); const s7 = trR(c3);
        check('1.6.0 (a builder audit) a held row\'s own level (run for real): a row that stored no level falls back to none, reading its entry\'s again; a level set by hand while it is backed is its own level, so one above the grant stays when the granting row goes, and one below it reads the grant\'s while it is backed',
            b2.ok && J(s3) === J(['i_acu:4:w_am:-:']) && J(s4) === J(['i_acu:-::-:']) && h1.ok && J(s5) === J(['i_acu:5:w_am:5:']) && h2.ok && J(s6) === J(['i_acu:4:w_am:1:']) && J(s7) === J(['i_acu:6::-:']), J([s3, s4, s5, s6, s7]));
        const c4 = mkR(1); opR(c4, 'f_gr', { op: 'add', defId: 'i_amu', rowId: 'w_am' }); opR(c4, 'f_gr', { op: 'add', defId: 'i_rng', rowId: 'w_rg' }); const s8 = trR(c4);
        opR(c4, 'f_gr', { op: 'remove', rowId: 'w_am' }); const s9 = trR(c4); opR(c4, 'f_gr', { op: 'remove', rowId: 'w_rg' }); const s10 = trR(c4);
        const c4b = mkR(1); opR(c4b, 'f_gr', { op: 'add', defId: 'i_rng', rowId: 'w_rg' }); opR(c4b, 'f_gr', { op: 'add', defId: 'i_amu', rowId: 'w_am' }); const s11 = trR(c4b); opR(c4b, 'f_gr', { op: 'remove', rowId: 'w_am' }); const s12 = trR(c4b);
        check('1.6.0 (a builder audit) an heir (grantHeirs, run for real): a second row that grants the entry at a level no higher leaves the row backed by the first; when the first goes the row passes to the second, at the higher of its own level and that grant\'s, and falls back with the last; a grant that raises it higher takes it over, and the one it took over takes it back when it goes',
            J(s8) === J(['i_acu:4:w_am:1:']) && J(s9) === J(['i_acu:3:w_rg:1:']) && J(s10) === J(['i_acu:1::-:']) && J(s11) === J(['i_acu:4:w_am:1:']) && J(s12) === J(['i_acu:3:w_rg:1:']), J([s8, s9, s10, s11, s12]));
        const c5 = mkR(1); opR(c5, 'f_gr', { op: 'add', defId: 'i_ban', rowId: 'w_bn' }); const s13 = trR(c5), pk5 = J(c5.values.f_bq);
        const c6 = mkR(1); opR(c6, 'f_gr', { op: 'add', defId: 'i_amu', rowId: 'w_am' }); const rm6 = opR(c6, 'f_tr', { op: 'remove', rowId: 'w_own' }), s14 = c6.values.f_tr.map(r => [r.defId, r.lvl, r.gr || ''].join(':'));
        const kept6 = J(c6.values); const re6 = opR(c6, 'f_gr', { op: 'remove', rowId: 'w_am' }), s15 = J(c6.values.f_tr);
        check('1.6.0 (a builder audit) once and a list with a quantity: a grant ticked Once a character backs and raises the row a list with no quantity holds as any grant does, while on a list with a quantity that is not ticked it grants nothing as before; the held row taken off by hand lets its grant give a row of its own again, at its level, and that row goes with the granting row',
            J(s13) === J(['i_acu:5:w_bn:1:']) && pk5 === J([{ id: 'w_rq', defId: 'i_rop', qty: 1 }]) && rm6.ok && s14.length === 1 && s14[0] === 'i_acu:4:w_am' && re6.ok && s15 === '[]', J([s13, pk5, s14, s15]));
        const rawQ = JSON.parse(J(rawR)); delete rawQ.fields[2].list.grantRaise; const gQ = cleanSystem(rawQ, { F, gmView: true });
        const cQ = mkR(1); putR(cQ, 'f_gr', S.applyRowOp(gQ, cQ, 'f_gr', { op: 'add', defId: 'i_amu', rowId: 'w_am' }, F, {})); const bagQ = cQ.values.f_bg.map(r => r.defId + ':' + r.qty + ':' + (r.gr || 'own') + ':' + (r.gb || ''));
        const viewOk = gR.fields[2].list.grantRaise === true && pR.fields[2].list.grantRaise === true && !(gQ.fields[2].list && 'grantRaise' in gQ.fields[2].list) && J(cleanSystem(gR, { F, gmView: true })) === J(gR) && J(cleanSystem(gQ, { F, gmView: true })) === J(gQ);
        const c7 = mkR(1); opR(c7, 'f_gr', { op: 'add', defId: 'i_amu', rowId: 'w_am' }); const own7 = S.charFor(c7, pR, 'u_p'), ownRow = own7 && own7.values.f_tr[0];
        const ldR = S.cleanChar({ id: 'c_r', name: 'Rin', values: { f_tr: [{ id: 'w_own', defId: 'i_acu', qty: 1, lvl: 4, gb: 'w_am', gl: 1 }, { id: 'w_x', defId: 'i_rop', qty: 1, gl: 2 }] } }, gR);
        check('1.6.0 (a builder audit) the option in both views and a system without it byte for byte: A grant raises a held row (grantRaise, true only) is kept in both views and absent where not ticked; a list with a quantity that is not ticked grants a second row as before and marks nothing; the owner\'s copy of a backed row says it is backed (gb) and never the level it stood at (gl), as the players\' view reads it; a load keeps gb and keeps gl only beside it',
            viewOk && J(bagQ) === J(['i_rop:2:own:', 'i_rop:1:w_am:']) && !!ownRow && typeof ownRow === 'object' && ownRow.gb === 'w_am' && !('gl' in ownRow) && ownRow.lvl === 4
            && J(ldR && ldR.values.f_tr.map(r => [r.gb || '', r.gl === undefined ? '-' : r.gl])) === J([['w_am', 1], ['', '-']]), J([viewOk, bagQ, ownRow, ldR && ldR.values.f_tr]));
        const c8 = mkR(1); opR(c8, 'f_gr', { op: 'add', defId: 'i_amu', rowId: 'w_am' }); const kp8 = S.grantsKept(gR, c8.values, 'w_am'); opR(c8, 'f_gr', { op: 'remove', rowId: 'w_am' }); const u8 = opR(c8, 'f_gr', { op: 'restore', rowId: 'w_am', row: { id: 'w_am', defId: 'i_amu', qty: 1 }, at: 0, grants: kp8 || undefined }), s16 = trR(c8);
        const c9a = mkR(1), c9b = { id: 'c_s', name: 'Vo', values: { f_gr: [], f_tr: [], f_bg: [], f_bq: [] } }; opR(c9a, 'f_gr', { op: 'add', defId: 'i_amu', rowId: 'w_am' });
        const tA = S.tradeApply(gR, c9a, c9b, [{ fid: 'f_gr', rowId: 'w_am', qty: 1 }], [], 'gm', 'gm'), tB = S.tradeApply(gR, c9a, c9b, [{ fid: 'f_tr', rowId: 'w_own', qty: 1 }], [], 'gm', 'gm');
        const tAok = tA.ok && J(tA.valuesA.f_tr) === J([{ id: 'w_own', defId: 'i_acu', qty: 1, lvl: 1 }]), tBok = tB.ok && J((tB.valuesB.f_tr || []).map(r => [r.defId, r.lvl, r.gb || '', r.gl === undefined ? '-' : r.gl])) === J([['i_acu', 1, '', '-']]);
        const fill = S.fillMaking(gR, { id: 'c_m', name: 'Pax', ownerId: 'u_a', npc: false, making: 1, values: { f_gr: [], f_tr: [], f_bg: [], f_bq: [] } }, { lists: ['f_gr', 'f_tr'], ops: [{ f: 'f_gr', q: { op: 'add', defId: 'i_amu', rowId: 'w_fa', qty: 1 } }, { f: 'f_tr', q: { op: 'add', defId: 'i_acu', rowId: 'w_fk', qty: 1, gb: 'w_fa', gl: 2 } }, { f: 'f_tr', q: { op: 'set', rowId: 'w_fk', facts: { lvl: 4 } } }] }, F, { view: pR, lib: null });
        const fill2 = S.fillMaking(gR, { id: 'c_m', name: 'Pax', ownerId: 'u_a', npc: false, making: 1, values: { f_gr: [], f_tr: [], f_bg: [], f_bq: [] } }, { lists: ['f_tr'], ops: [{ f: 'f_tr', q: { op: 'add', defId: 'i_acu', rowId: 'w_fk', qty: 1, gb: 'w_gone', gl: 2 } }, { f: 'f_tr', q: { op: 'set', rowId: 'w_fk', facts: { lvl: 4 } } }] }, F, { view: pR, lib: null });
        const fillOk = fill.ok && J(fill.values.f_tr.map(r => [r.lvl, r.gb, r.gl])) === J([[4, 'w_fa', 2]]) && fill2.ok && J(fill2.values.f_tr.map(r => [r.lvl, r.gb || '', r.gl === undefined ? '-' : r.gl])) === J([[2, '', '-']]);
        check('1.6.0 (a builder audit) the mark goes where the row goes: an Undo that puts the granting row back backs the held row again; a trade of the granting row leaves the giver\'s held row at its own level, and a held row traded alone arrives at its own level with no mark; a character file brings the mark and the level it stood at (fillMaking), and a row backed by a row the file did not bring is at its own level',
            u8.ok && J(s16) === J(['i_acu:4:w_am:1:']) && tAok && tBok && fillOk, J([s16, tA.ok && tA.valuesA.f_tr, tB.ok && tB.valuesB.f_tr, fill.values && fill.values.f_tr, fill2.values && fill2.values.f_tr]));
        const shR = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), ixR = fs.readFileSync(path.join(app, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
        const ntR = [path.join(app, 'assets', 'whatsnew.txt'), path.join(app, '..', '..', 'WHATSNEW.txt')].map(f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')), giR = fs.readFileSync(path.join(app, '..', '..', 'CAMPAIGN_INTEGRATION.md'), 'utf8');
        check('1.6.0 (a builder audit) said and wired (source): the Lists tab ticks A grant raises a held row and its handler writes grantRaise true or takes it off; the sheet says what was raised; Help, both 1.6.0 notes and the integration guide say it',
            require('./checkkit').part('sysedlist.js').includes("fl.appendChild(checkLabel('sys-list-graise', sp.grantRaise === true, 'A grant raises a held row'") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-graise') >= 0) { if (t.checked) lsc.grantRaise = true; else delete lsc.grantRaise; }")
            && shR.includes("if (typeof res.raised === 'string' && res.raised) toast(res.raised);") && ixR.includes('<li><b>A grant raises a held row</b> is for a list with a quantity.') && ixR.includes('When the row that granted it goes, the held row falls back to the level it had.')
            && ntR.every(t => t.includes('- A grant of a trait you already hold raises it to the grant\'s level')) && giR.includes('`"grantRaise": true`') && giR.includes('marked `"gb"`'));
    }
    {   // 1.6.0 Off a character's turn, the system's half, on invented data
        const J = JSON.stringify;
        const rawO = { v: 1, name: 'O', effects: [], items: [], rolls: [{ id: 'r_hit', label: 'Hit', formula: '3d6 <= 10' }, { id: 'r_any', label: 'Spot', formula: '3d6 <= 10', free: true }, { id: 'r_def', label: 'Dodge', formula: '3d6 <= 10', resist: true }, { id: 'r_ini', label: 'Init', formula: '1d6', init: true }, { id: 'r_due', label: 'Stay up', formula: '3d6 <= 10', each: 'turn', by: 'owner' }, { id: 'r_app', label: 'Rest', apply: [{ f: 'f_hp', formula: '1', add: true }], free: true }, { id: 'r_odd', label: 'Odd', formula: '1d6', free: 'yes' }],
            fields: [{ id: 'f_hp', key: 'HP', label: 'HP', kind: 'number', vis: 'all' }, { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', list: { rolls: [{ label: 'Swing', formula: '3d6 <= 10' }, { label: 'Parry', formula: '3d6 <= 10', free: true }, { label: 'Tend', apply: [{ f: 'f_hp', formula: '1', add: true }], free: true }] } }],
            combat: { turn: { off: 'refuse' } }, sheet: { sections: [] } };
        const gO = cleanSystem(rawO, { F, gmView: true }), pO = cleanSystem(rawO, { F, gmView: false }), byId = (s, id) => s.rolls.filter(r => r.id === id)[0];
        const offKept = v => (cleanSystem(Object.assign({}, rawO, { combat: { turn: { off: v } } }), { F, gmView: true }).combat || {}).turn;
        check('1.6.0 Off a character\'s turn, the cleaners: the Turns box keeps refuse or warn alone, the same in both views, and a roll, an action or a list\'s of either keeps Any time only as true, in both views; a system that names none keeps no key',
            gO.combat.turn.off === 'refuse' && pO.combat.turn.off === 'refuse' && offKept('warn').off === 'warn' && !(offKept('other') || {}).off && byId(gO, 'r_any').free === true && byId(pO, 'r_any').free === true && byId(gO, 'r_app').free === true && !('free' in byId(gO, 'r_hit')) && !('free' in byId(gO, 'r_odd')) && gO.fields[1].list.rolls[1].free === true && gO.fields[1].list.rolls[2].free === true && !('free' in gO.fields[1].list.rolls[0]) && J(cleanSystem(gO, { F, gmView: true })) === J(gO), J(gO.combat));
        const fr = [S.offTurnFree(gO, 'r_hit'), S.offTurnFree(gO, 'r_any'), S.offTurnFree(gO, 'r_def'), S.offTurnFree(gO, 'r_ini'), S.offTurnFree(gO, 'r_due'), S.offTurnFree(gO, 'r_app'), S.offTurnFree(gO, undefined, { f: 'f_gear', i: 0 }), S.offTurnFree(gO, undefined, { f: 'f_gear', i: 1 }), S.offTurnFree(gO), S.offTurnFree(gO, 'r_gone')];
        check('1.6.0 Off a character\'s turn, the one judge of what is called for (offTurnFree): a plain chosen roll or a list\'s is not, and one ticked Any time, one that resists, initiative and one due at a turn are; so is what is no entry of the system, a stat\'s own roll or a typed one', J(fr) === J([false, true, true, true, true, true, false, true, true, true]), J(fr));
        const rawF = { v: 1, name: 'F', rolls: [], items: [], effects: [{ id: 'e_a', name: 'Shaken', dur: 'next turn', ends: 'turnEnd', again: 'longer' }], fields: [{ id: 'f_fx', key: 'Fx', kind: 'effects', vis: 'all', edit: 'owner' }], sheet: { sections: [] } }, gF = cleanSystem(rawF, { F, gmView: true });
        const ag = t0 => S.applyEffectOp(gF, { id: 'c', name: 'Rin', values: { f_fx: [{ id: 'x_1', ref: 'e_a', on: true, t: t0 }] } }, 'f_fx', { op: 'add', rowId: 'x_1', ref: 'e_a' }, F, { now: 1000, inCombat: true, secs: 6 });
        const marked = ag({ left: 6, at: 0, e: 1 }), plain = ag({ left: 6, at: 0 });
        check('1.6.0 Counts at, added again under Keep the longer: a row marked for this turn\'s end is shorter than a fresh time of the same length, so the fresh one is kept with no mark and lasts through the next turn; a row not marked keeps its own', marked.ok && !('e' in marked.value[0].t) && marked.value[0].t.left === 6 && plain.ok, J([marked.value, plain.value]));
    }
    {   // 1.6.0 Counts at its turn's end: an effect "until the end of your next turn", on invented data
        const J = JSON.stringify, RND = 6;
        const rawE = { v: 1, name: 'E', rolls: [], items: [], effects: [{ id: 'e_st', name: 'Dazed', dur: '1 turn' }, { id: 'e_en', name: 'Shaken', dur: 'next turn', ends: 'turnEnd' }, { id: 'e_tw', name: 'Slowed', dur: '2 turns', ends: 'turnEnd' }, { id: 'e_bad', name: 'Odd', ends: 'turnStart' }],
            fields: [{ id: 'f_fx', key: 'Fx', kind: 'effects', vis: 'all', edit: 'owner' }], sheet: { sections: [] } };
        const gE = cleanSystem(rawE, { F, gmView: true }), pE = cleanSystem(rawE, { F, gmView: false }), en = s => s.effects.map(d => d.ends || '-');
        check('1.6.0 Counts at, the cleaner: a library effect keeps ends only as turnEnd, the same in both views, and a system that names none keeps no key, cleaned twice alike',
            J(en(gE)) === J(['-', 'turnEnd', 'turnEnd', '-']) && J(en(pE)) === J(en(gE)) && !('ends' in gE.effects[0]) && !('ends' in gE.effects[3]) && J(cleanSystem(gE, { F, gmView: true })) === J(gE), J(en(gE)));
        const chr = rows => ({ id: 'c_e', name: 'Rin', values: { f_fx: rows } }), row = (ref, left) => ({ id: 'x_' + ref, ref: ref, on: true, t: { left: left, at: 0 } });
        const step = (c, kind) => { const r = S.fxTick(gE, c, kind, 1000); Object.keys(r.values).forEach(k => { c.values[k] = r.values[k]; }); return r.expired; };
        const a = chr([row('e_st', RND), row('e_en', RND)]);
        const s1 = step(a, 'turn'), left1 = a.values.f_fx.map(r => [r.ref, r.t.left, r.t.e === 1]), e1 = step(a, 'turnEnd');
        check('1.6.0 Counts at, fxTick: at its turn\'s start an effect of 1 turn counted there runs out as before and one counted at the end stays on, whole and marked; at that turn\'s end it runs out, so its character holds it through the whole turn',
            J(s1) === J(['Dazed']) && J(left1) === J([['e_en', RND, true]]) && J(e1) === J(['Shaken']) && a.values.f_fx.length === 0, J([s1, left1, e1]));
        const b = chr([row('e_en', RND)]), e0 = step(b, 'turnEnd'), b0 = b.values.f_fx[0] && b.values.f_fx[0].t.left; step(b, 'turn'); const e2 = step(b, 'turnEnd');
        check('1.6.0 Counts at, fxTick: one put on during a turn is not marked, so that turn\'s end takes nothing and it lasts through the turn after', J(e0) === J([]) && b0 === RND && J(e2) === J(['Shaken']), J([e0, b0, e2]));
        const c2 = chr([row('e_tw', RND * 2)]); step(c2, 'turn'); step(c2, 'turnEnd'); const l2 = [c2.values.f_fx[0].t.left, 'e' in c2.values.f_fx[0].t]; step(c2, 'turnEnd'); const l3 = c2.values.f_fx[0].t.left; step(c2, 'turn'); const e3 = step(c2, 'turnEnd');
        const d2 = chr([row('e_st', 30), row('e_en', 30)]); step(d2, 'turnEnd'); const un = J(d2.values.f_fx.map(r => r.t));
        step(d2, 'turn'); const m2 = d2.values.f_fx.map(r => r.t.left); step(d2, 'resume'); const r2 = d2.values.f_fx.map(r => 'e' in r.t);
        check('1.6.0 Counts at, fxTick: an effect of 2 turns takes one off each turn\'s end and no more until the next turn begins; a turn\'s end leaves every effect counted at the start alone; an effect counted at the start loses its round as before; a fight\'s end clears the mark, which the timer keeps only as 1',
            J(l2) === J([RND, false]) && l3 === RND && J(e3) === J(['Slowed']) && un === J([{ left: 30, at: 0 }, { left: 30, at: 0 }]) && J(m2) === J([24, 30]) && J(r2) === J([false, false]) && !('e' in S.fxTick(gE, chr([{ id: 'x_o', ref: 'e_st', on: true, t: { left: 30, at: 0, e: 2 } }]), 'turn', 1000).values.f_fx[0].t), J([l2, l3, e3, un, m2, r2]));
        const shE = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), ixE = fs.readFileSync(path.join(app, 'index.html'), 'utf8'), ntE = [path.join(app, '..', '..', 'WHATSNEW.txt'), path.join(app, 'assets', 'whatsnew.txt')].map(p => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n')), giE = fs.readFileSync(path.join(app, '..', '..', 'CAMPAIGN_INTEGRATION.md'), 'utf8');
        check('1.6.0 Counts at is in the System editor and said: an effect\'s row offers Its turn\'s start and Its turn\'s end, its handler writing ends or taking it off; Help, the Items key, the guide and both release notes say it',
            require('./checkkit').part('sysedroll.js').includes("select('sys-fx-ends', [['', 'Its turn\\u2019s start'], ['turnEnd', 'Its turn\\u2019s end']]") && require('./checkkit').part('sysedtabs.js').includes("if (t.value === 'turnEnd') fxc.ends = 'turnEnd'; else delete fxc.ends;") && ixE.includes('An effect&rsquo;s <b>Counts at</b> says when a fight takes a turn off its time.') && ixE.includes('<b>Counts at</b><small>') && giE.includes('"ends": "turnEnd"') && ntE.every(n => n.includes('- An effect can last to the end of a turn:')));
    }
    {   // 1.6.0 (a builder audit): an effect added again while it is on, by its When added again, on invented data
        const J = JSON.stringify;
        const rawE = { v: 1, name: 'E', rolls: [], items: [], effects: [
            { id: 'e_dz', name: 'Dazed', dur: '10 minutes' }, { id: 'e_lg', name: 'Shaken', dur: '10 minutes', again: 'longer' }, { id: 'e_ad', name: 'Slowed', dur: '10 minutes', again: 'add' },
            { id: 'e_no', name: 'Marked', dur: 'until dawn', again: 'longer' }, { id: 'e_na', name: 'Hexed', dur: 'until dawn', again: 'add' }, { id: 'e_bad', name: 'Odd', again: 'both' }],
            fields: [{ id: 'f_fx', key: 'Fx', kind: 'effects', vis: 'all', edit: 'owner' }], sheet: { sections: [] } };
        const gE = cleanSystem(rawE, { F, gmView: true }), pE = cleanSystem(rawE, { F, gmView: false }), ag = s => s.effects.map(d => d.id + ':' + (d.again || '-'));
        const cleanOk = J(ag(gE)) === J(['e_dz:-', 'e_lg:longer', 'e_ad:add', 'e_no:longer', 'e_na:add', 'e_bad:-']) && J(ag(pE)) === J(ag(gE)) && !('again' in gE.effects[0]) && J(cleanSystem(gE, { F, gmView: true })) === J(gE);
        const rawN = JSON.parse(J(rawE)); rawN.effects.forEach(d => { delete d.again; }); const gN = cleanSystem(rawN, { F, gmView: true }), noKey = gN.effects.every(d => !('again' in d));
        const ch = (ref, t, on) => ({ id: 'c_e', name: 'Rin', values: { f_fx: [Object.assign({ id: 'x_1', ref: ref, on: on !== false }, t ? { t: t } : {})] } });
        const add = (ref, t, o, on) => S.applyEffectOp(gE, ch(ref, t, on), 'f_fx', { op: 'add', rowId: 'x_1', ref: ref }, F, Object.assign({ now: 61000 }, o || {}));
        const tOf = r => r.ok ? J(r.value[0].t || null) : 'refused', T600 = { left: 600, at: 1000 };
        const rep6 = add('e_dz', T600, { secs: 6 }), lg6 = add('e_lg', T600, { secs: 6 }), ad6 = add('e_ad', T600, { secs: 6 }), lgBig = add('e_lg', T600, { secs: 900 });
        const repNo = add('e_no', null, { secs: 6 }), lgCurNo = add('e_no', null, { secs: 6 }), lgNewNo = add('e_no', T600, {}), adNo = add('e_na', T600, {}), adOff = add('e_ad', T600, { secs: 6 }, false), adPause = add('e_ad', { left: 100, at: 0, p: 1 }, { secs: 6 }), adFight = add('e_ad', { left: 100, at: 0 }, { secs: 6, inCombat: true });
        const repDz = add('e_dz', T600, {}), repDzNo = S.applyEffectOp(gE, ch('e_dz', T600), 'f_fx', { op: 'add', rowId: 'x_1', ref: 'e_dz' }, F, { now: 61000 });
        check('1.6.0 (a builder audit) When added again (cleanEffectDef, applyEffectOp, run for real): a library effect keeps again only as longer or add, the same in both views, and a system that names none keeps no key; added again while it is on, Replace (none) puts the new time in place of what was left as before, so a 6 s source still cuts 600 s short; Keep the longer keeps what was left, 540 s at the clock\'s 61 s, and takes a longer new time, a source with no timer counting as the longest either way; Add the times adds the new time to what was left, a paused timer staying paused and one stopped in a fight staying stopped, and with no timer on either there is no end; an effect switched off is added afresh whatever its rule; the answer says which time was kept',
            cleanOk && noKey && tOf(rep6) === J({ left: 6, at: 61000 }) && !('again' in rep6) && tOf(lg6) === J(T600) && lg6.again === 'its own time kept, 9 min left' && lg6.againSays === 'Shaken added again: its own time kept, 9 min left.'
            && tOf(lgBig) === J({ left: 900, at: 61000 }) && lgBig.again === 'the new time kept, 15 min left' && tOf(ad6) === J({ left: 546, at: 61000 }) && ad6.again === 'the times added, 9' + '.' + '1 min left'
            && tOf(lgCurNo) === 'null' && lgCurNo.again === 'kept with no end' && tOf(lgNewNo) === 'null' && lgNewNo.again === 'kept with no end' && tOf(adNo) === 'null' && adNo.again === 'kept with no end' && tOf(repNo) === 'null'
            && tOf(adOff) === J({ left: 6, at: 61000 }) && !('again' in adOff) && tOf(adPause) === J({ left: 106, at: 0, p: 1 }) && tOf(adFight) === J({ left: 106, at: 0 }) && tOf(repDz) === J({ left: 600, at: 61000 }) && J(repDz) === J(repDzNo),
            J([cleanOk, noKey, tOf(rep6), tOf(lg6), lg6.again, tOf(lgBig), lgBig.again, tOf(ad6), ad6.again, tOf(lgCurNo), lgCurNo.again, tOf(lgNewNo), tOf(adNo), tOf(adOff), tOf(adPause), tOf(adFight), tOf(repDz)]));
        const chA = ref => ({ id: 'c_e', name: 'Rin', values: { f_fx: [{ id: 'x_1', ref: ref, on: true, t: { left: 600, at: 1000 } }] } });
        const actOf = ref => S.applyAct(gE, chA(ref), { apply: [{ fx: ref, on: true }] }, makeResolver(gE, chA(ref), F), F, null, null, null, null, null, { now: 61000 });
        const aDz = actOf('e_dz'), aAd = actOf('e_ad');
        const lnAd = aAd.ok && Array.isArray(aAd.lines) ? aAd.lines.find(l => l.fx === 1) : null;
        check('1.6.0 (a builder audit) an action that puts on an effect already on (applyAct, run for real): with no When added again it moves nothing and says nothing, as before; with Add the times it goes through the effects\' own rule, the row\'s time added and its line saying which time was kept, which draws no dice',
            !aDz.ok && aDz.reason === 'none' && aAd.ok && !aAd.drew && !!lnAd && lnAd.roll === 'the times added, 19 min left' && J(aAd.values && aAd.values.f_fx && aAd.values.f_fx[0].t) === J({ left: 1140, at: 61000 }), J([aDz, aAd]));
        const shE = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), ixE = fs.readFileSync(path.join(app, 'index.html'), 'utf8').replace(/\r\n/g, '\n'), ntE = [path.join(app, 'assets', 'whatsnew.txt'), path.join(app, '..', '..', 'WHATSNEW.txt')].map(f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n')), giE = fs.readFileSync(path.join(app, '..', '..', 'CAMPAIGN_INTEGRATION.md'), 'utf8');
        check('1.6.0 (a builder audit) When added again is in the System editor and said (source): an effect\'s row offers Replace, Keep the longer and Add the times, its handler writing again or taking it off; the sheet says which time was kept; Help, both 1.6.0 notes and the integration guide say it',
            require('./checkkit').part('sysedroll.js').includes("agW.appendChild(select('sys-fx-again', [['', 'Replace'], ['longer', 'Keep the longer'], ['add', 'Add the times']]") && require('./checkkit').part('sysedtabs.js').includes("if (c.indexOf('sys-fx-again') >= 0) { if (t.value === 'longer' || t.value === 'add') fxc.again = t.value; else delete fxc.again;")
            && shE.includes("if (typeof res.againSays === 'string' && res.againSays) toast(res.againSays);") && ixE.includes('takes its time by its <b>When added again</b>') && ntE.every(t => t.includes('- An effect can say what happens when it is added again while it is')) && giE.includes('`"again"` (When added again)'));
    }
    {   // 1.6.0 (CORE gap 15, an implant's mandatory flaws once a character): a grant counted once per character, on invented data
        const J = JSON.stringify;
        const rawO = { v: 1, name: 'O', rolls: [], items: [
            { id: 'i_eye', name: 'Eye', category: 'Implant', grants: [{ list: 'f_fl', entry: 'i_dep', once: true }, { list: 'f_fl', entry: 'i_dep', once: 'yes', from: 4 }] },
            { id: 'i_arm', name: 'Arm', category: 'Implant', grants: [{ list: 'f_fl', entry: 'i_dep', once: true }] },
            { id: 'i_hub', name: 'Hub', category: 'Implant', grants: [{ list: 'f_fl', entry: 'i_dep', once: true, from: 2 }] },
            { id: 'i_old', name: 'Old', category: 'Implant', grants: [{ list: 'f_fl', entry: 'i_dep' }] },
            { id: 'i_dep', name: 'Dependence', category: 'Flaw' }],
            fields: [{ id: 'f_im', key: 'Implants', kind: 'item-list', vis: 'all', edit: 'owner', list: { lvl: { min: 1, max: 5, def: 1 } } },
                { id: 'f_fl', key: 'Flaws', kind: 'item-list', vis: 'all', edit: 'owner' }], sheet: { sections: [] } };
        const gO = cleanSystem(rawO, { F, gmView: true }), pO = cleanSystem(rawO, { F, gmView: false });
        const put = (ch, f, r) => { if (r.ok) { ch.values[f] = r.value; if (r.also) Object.keys(r.also).forEach(k => { ch.values[k] = r.also[k]; }); } return r; };
        const op = (ch, q) => put(ch, 'f_im', S.applyRowOp(gO, ch, 'f_im', q, F, {})), fl = ch => ch.values.f_fl.map(r => r.defId + ':' + r.qty + ':' + (r.gr || 'own'));
        const cleanOk = J(gO.items[0].grants) === J([{ list: 'f_fl', entry: 'i_dep', qty: 1, once: true }, { list: 'f_fl', entry: 'i_dep', qty: 1, from: 4 }]) && J(pO.items[0].grants) === J(gO.items[0].grants) && !('once' in gO.items[3].grants[0])
            && J(S.grantWant(gO.items[0], 1)) === J({ 'f_fl|i_dep': { list: 'f_fl', entry: 'i_dep', qty: 1, once: true } }) && J(cleanSystem(gO, { F, gmView: true })) === J(gO);
        const c1 = { id: 'c_o', name: 'Rin', values: { f_im: [], f_fl: [] } }, s = [];
        op(c1, { op: 'add', defId: 'i_eye', rowId: 'w_a' }); s.push(fl(c1)); op(c1, { op: 'add', defId: 'i_arm', rowId: 'w_b' }); s.push(fl(c1));
        op(c1, { op: 'remove', rowId: 'w_a' }); s.push(fl(c1)); op(c1, { op: 'remove', rowId: 'w_b' }); s.push(fl(c1));
        const onceOk = J(s) === J([['i_dep:1:w_a'], ['i_dep:1:w_a'], ['i_dep:1:w_b'], []]);
        const c2 = { id: 'c_o', name: 'Rin', values: { f_im: [], f_fl: [] } }, t = [];
        op(c2, { op: 'add', defId: 'i_hub', rowId: 'w_c' }); op(c2, { op: 'set', rowId: 'w_c', facts: { lvl: 2 } }); t.push(fl(c2)); op(c2, { op: 'add', defId: 'i_eye', rowId: 'w_a' }); t.push(fl(c2));
        op(c2, { op: 'set', rowId: 'w_c', facts: { lvl: 1 } }); t.push(fl(c2)); op(c2, { op: 'set', rowId: 'w_c', facts: { lvl: 2 } }); t.push(fl(c2));
        const lvlOk = J(t) === J([['i_dep:1:w_c'], ['i_dep:1:w_c'], ['i_dep:1:w_a'], ['i_dep:1:w_a']]);
        const c3 = { id: 'c_o', name: 'Rin', values: { f_im: [], f_fl: [{ id: 'w_own', defId: 'i_dep', qty: 1 }] } }; op(c3, { op: 'add', defId: 'i_arm', rowId: 'w_b' }); const held = fl(c3);
        op(c3, { op: 'add', defId: 'i_old', rowId: 'w_o' }); op(c3, { op: 'add', defId: 'i_eye', rowId: 'w_a' }); const both = fl(c3);
        const heldOk = J(held) === J(['i_dep:1:own']) && J(both) === J(['i_dep:1:own', 'i_dep:1:w_o']);
        check('CORE gap 15: a grant ticked Once a character (once, kept by cleanGrants as true only, in both views, carried by grantWant): a second implant grants no second flaw; when the first goes the flaw passes to the second (its gr names it) and stays, and goes with the last; a granter whose level falls below its From passes it to another that grants it once, and its level back grants none again; a row the character holds of its own counts as held; a grant with no tick grants as before',
            cleanOk && onceOk && lvlOk && heldOk, J([cleanOk, s, t, held, both]));
        const shO = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), lbO = fs.readFileSync(path.join(app, 'scripts', 'librarywin.js'), 'utf8').replace(/\r\n/g, '\n'), ixO = fs.readFileSync(path.join(app, 'index.html'), 'utf8').replace(/\r\n/g, '\n');
        const ntO = [path.join(app, 'assets', 'whatsnew.txt'), path.join(app, '..', '..', 'WHATSNEW.txt')].map(f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
        const rawH = { v: 1, name: 'H', rolls: [], items: [
            { id: 'i_ka', name: 'Knee', category: 'Implant', grants: [{ list: 'f_one', entry: 'i_ache' }, { list: 'f_bag', entry: 'i_oil', qty: 2 }] },
            { id: 'i_kb', name: 'Hip', category: 'Implant', grants: [{ list: 'f_one', entry: 'i_ache' }, { list: 'f_bag', entry: 'i_oil', qty: 1 }] },
            { id: 'i_ache', name: 'Ache', category: 'Flaw' }, { id: 'i_oil', name: 'Oil', category: 'Gear' }],
            fields: [{ id: 'f_im', key: 'Implants', kind: 'item-list', vis: 'all', edit: 'owner' }, { id: 'f_one', key: 'Flaws', kind: 'item-list', vis: 'all', edit: 'owner', list: { noQty: true } },
                { id: 'f_bag', key: 'Bag', kind: 'item-list', vis: 'all', edit: 'owner' }], sheet: { sections: [] } };
        const gH = cleanSystem(rawH, { F, gmView: true }), opH = (ch, q) => put(ch, 'f_im', S.applyRowOp(gH, ch, 'f_im', q, F, {}));
        const sh = ch => [ch.values.f_one.map(r => r.defId + ':' + (r.gr || 'own')), ch.values.f_bag.map(r => r.defId + ':' + r.qty + ':' + (r.gr || 'own'))];
        const cH = { id: 'c_h', name: 'Vo', values: { f_im: [], f_one: [], f_bag: [] } }, u = [];
        opH(cH, { op: 'add', defId: 'i_ka', rowId: 'w_a' }); opH(cH, { op: 'add', defId: 'i_kb', rowId: 'w_b' }); u.push(sh(cH)); opH(cH, { op: 'remove', rowId: 'w_a' }); u.push(sh(cH)); opH(cH, { op: 'remove', rowId: 'w_b' }); u.push(sh(cH));
        check('CORE gap 15, every grant (the core\'s ruling, implant flaws leave with the last implant): with no tick too, a row granted on a list that holds each entry once passes to another row that grants it and holds none of it, and goes with the last; a row whose grant is filled already is handed none (two Oil rows, each its own, never one doubled)',
            J(u) === J([[['i_ache:w_a'], ['i_oil:2:w_a', 'i_oil:1:w_b']], [['i_ache:w_b'], ['i_oil:1:w_b']], [[], []]]), J(u));
        check('CORE gap 15 is in both editors and said (source): the System editor\'s and the Library\'s grant lines tick Once a character, each handler writing once true or taking it off; Help and both 1.6.0 notes say it',
            require('./checkkit').part('sysedtabs.js').includes("if (typeof checkLabel === 'function') ln.appendChild(checkLabel('sys-grant-once', g.once === true, 'Once a character'") && require('./checkkit').part('sysedtabs.js').includes("if (gO) { if (t.checked) gO.once = true; else delete gO.once; markDirty(); }")
            && lbO.includes("var ol = el('label', 'lib-mod-lvl lib-grant-once'), oc = el('input'); oc.type = 'checkbox'; oc.checked = g.once === true;") && lbO.includes("ol.appendChild(el('span', null, ' Once a character'))") && lbO.indexOf("var ol = el('label', 'lib-mod-lvl lib-grant-once')") > lbO.indexOf("x.title = 'It no longer grants this'") && lbO.includes("oc.addEventListener('change', function() { if (oc.checked) g.once = true; else delete g.once; }); ln.appendChild(ol);")
            && ixO.includes('<li>Tick <b>Once a character</b> on a grant') && ntO.every(t => t.indexOf("- A grant can come once a character") > 0 && t.indexOf("- A grant can come once a character") < t.indexOf('WAYPOINT 1.5.')));
    }
    {   // 1.6.0 (a grant's own terms, asked by a build session: one drawback granted free by a package and paying back from an implant): a grant's
        // Pays back (pay: true, the row marked gp, Row.paysback) and the level it grants at (lvl, held to the list's level rules), on invented data
        const J = JSON.stringify;
        const rawP = { v: 1, name: 'P', rolls: [], items: [
            { id: 'i_pk', name: 'Ferry kit', category: 'Package', grants: [{ list: 'f_dr', entry: 'i_ache' }] },
            { id: 'i_im', name: 'Brass lung', category: 'Implant', grants: [{ list: 'f_dr', entry: 'i_ache', pay: true, lvl: 9 }] },
            { id: 'i_bad', name: 'Odd', category: 'Implant', grants: [{ list: 'f_dr', entry: 'i_ache', pay: 'yes', lvl: '2' }, { list: 'f_dr', entry: 'i_chip', pay: 1, lvl: 1e9 }] },
            { id: 'i_hub', name: 'Hub', category: 'Implant', grants: [{ list: 'f_one', entry: 'i_hum', pay: true, lvl: 2 }] },
            { id: 'i_eye', name: 'Eye', category: 'Implant', grants: [{ list: 'f_one', entry: 'i_hum' }] },
            { id: 'i_ear', name: 'Ear', category: 'Implant', grants: [{ list: 'f_one', entry: 'i_hum', lvl: 1 }] },
            { id: 'i_o1', name: 'Coil', category: 'Implant', grants: [{ list: 'f_one', entry: 'i_tic', once: true, pay: true }] },
            { id: 'i_o2', name: 'Spur', category: 'Implant', grants: [{ list: 'f_one', entry: 'i_tic', once: true }] },
            { id: 'i_tr', name: 'Tier', category: 'Package', grants: [{ list: 'f_one', entry: 'i_hum', lvl: 1 }, { list: 'f_one', entry: 'i_hum', lvl: 2, pay: true, from: 3 }] },
            { id: 'i_ache', name: 'Ache', category: 'Flaw', lvl: 1, stats: { Pts: -5 } }, { id: 'i_hum', name: 'Hum', category: 'Flaw', stats: { Pts: -3 } },
            { id: 'i_tic', name: 'Tic', category: 'Flaw', stats: { Pts: -2 } }, { id: 'i_chip', name: 'Chip', category: 'Flaw' }],
            fields: [{ id: 'f_im', key: 'Kit', label: 'Kit', kind: 'item-list', vis: 'all', edit: 'owner', list: { lvl: { min: 1, max: 5, def: 1 } } },
                { id: 'f_dr', key: 'Drawbacks', label: 'Drawbacks', kind: 'item-list', vis: 'all', edit: 'owner', list: { noQty: true, multi: true, lvl: { min: 1, max: 3, def: 1 }, stats: [{ key: 'Pts', label: 'Pts' }], cols: [{ key: 'Net', label: 'Net', formula: 'if(and(Row.granted > 0, Row.paysback = 0), 0, Row.Pts * Row.lvl)' }, { key: 'Pb', label: 'Pb', formula: 'Row.paysback' }] } },
                { id: 'f_one', key: 'Flaws', label: 'Flaws', kind: 'item-list', vis: 'all', edit: 'owner', list: { noQty: true, lvl: { min: 1, max: 4, def: 1 } } }], sheet: { sections: [] } };
        const gP = cleanSystem(rawP, { F, gmView: true }), pP = cleanSystem(rawP, { F, gmView: false }), itP = id => gP.items.find(i => i.id === id);
        const cleanOk = J(itP('i_im').grants) === J([{ list: 'f_dr', entry: 'i_ache', qty: 1, pay: true, lvl: 9 }]) && J(itP('i_bad').grants) === J([{ list: 'f_dr', entry: 'i_ache', qty: 1 }, { list: 'f_dr', entry: 'i_chip', qty: 1 }])
            && J(itP('i_pk').grants) === J([{ list: 'f_dr', entry: 'i_ache', qty: 1 }]) && J(pP.items.find(i => i.id === 'i_im').grants) === J(itP('i_im').grants)
            && J(cleanSystem(gP, { F, gmView: true })) === J(gP) && J(cleanSystem(pP, { F, gmView: false })) === J(pP) && validateSystem(gP, F).errors.length === 0
            && J(S.hideGrants({ grants: itP('i_im').grants.slice() }, id => id === 'i_ache').grants) === J(itP('i_im').grants)
            && J(S.grantWant(itP('i_tr'), 1)) === J({ 'f_one|i_hum': { list: 'f_one', entry: 'i_hum', qty: 1, lvl: 1 } }) && J(S.grantWant(itP('i_tr'), 3)) === J({ 'f_one|i_hum': { list: 'f_one', entry: 'i_hum', qty: 2, pay: true, lvl: 2 } });
        const put = (ch, f, r) => { if (r.ok) { ch.values[f] = r.value; if (r.also) Object.keys(r.also).forEach(k => { ch.values[k] = r.also[k]; }); } return r; };
        const op = (ch, q) => put(ch, 'f_im', S.applyRowOp(gP, ch, 'f_im', q, F, {})), mk = () => ({ id: 'c_p', name: 'Tam', ownerId: 'u_t', values: { f_im: [], f_dr: [], f_one: [] } });
        const of = (ch, f) => ch.values[f].map(r => r.defId + ':' + (r.lvl === undefined ? '-' : r.lvl) + ':' + (r.gp === 1 ? 'pay' : 'free') + ':' + (r.gr ? ch.values.f_im.find(x => x.id === r.gr).defId : 'own'));
        // two grants of one entry: the package's free, the implant's paying back at its tier, clamped to the list's most
        const c1 = mk(); op(c1, { op: 'add', defId: 'i_pk', rowId: 'w_p1' }); op(c1, { op: 'add', defId: 'i_im', rowId: 'w_i1' });
        const cR = S.cleanChar(c1, gP, { state: 'host' }), rvH = S.resolveAll(gP, cR, F, null).f_dr, idOf = d => cR.values.f_dr.find(r => r.gr === d).id;
        const twoOk = J(of(c1, 'f_dr')) === J(['i_ache:1:free:i_pk', 'i_ache:3:pay:i_im']) && rvH.cells[idOf('w_p1')][0].value === 0 && rvH.cells[idOf('w_p1')][1].value === 0
            && rvH.cells[idOf('w_i1')][0].value === -15 && rvH.cells[idOf('w_i1')][1].value === 1 && J(cR.values) === J(c1.values);
        // the owner's copy reads what the host reads (projFacts carries gp beside gr; their app keeps it only beside its mark); the wire never names it
        const own = S.charFor(cR, pP, 'u_t'), rvO = S.resolveAll(pP, S.cleanChar(own, pP), F, null).f_dr, ownDr = own.values.f_dr;
        const ownOk = ownDr.filter(r => r.gp === 1).length === 1 && ownDr.find(r => r.gp === 1).gr === 'w_i1' && J(rvO.cells) === J(rvH.cells)
            && !('gp' in S.cleanChar({ id: 'c_x', name: 'X', values: { f_dr: [{ id: 'w_q', defId: 'i_ache', qty: 1, gp: 1 }] } }, gP, { state: 'host' }).values.f_dr[0])
            && S.cleanCharItem({ rid: 'e12345678', charId: 'c_1', fieldId: 'f_im', op: 'add', defId: 'i_pk', rowId: 'w_x', gr: 'w_i1', gp: 1 }).gp === undefined;
        // an heir takes the row on its own terms: Pays back as it says, its level where it names one, else the row keeps its own
        const c2 = mk(); op(c2, { op: 'add', defId: 'i_hub', rowId: 'w_h1' }); const h0 = of(c2, 'f_one'); op(c2, { op: 'add', defId: 'i_eye', rowId: 'w_e1' }); const h1 = of(c2, 'f_one'); op(c2, { op: 'remove', rowId: 'w_h1' }); const h2 = of(c2, 'f_one');
        const c3 = mk(); op(c3, { op: 'add', defId: 'i_eye', rowId: 'w_e1' }); op(c3, { op: 'add', defId: 'i_hub', rowId: 'w_h1' }); op(c3, { op: 'remove', rowId: 'w_e1' }); const h3 = of(c3, 'f_one');
        const c4 = mk(); op(c4, { op: 'add', defId: 'i_hub', rowId: 'w_h1' }); op(c4, { op: 'add', defId: 'i_ear', rowId: 'w_r1' }); op(c4, { op: 'remove', rowId: 'w_h1' }); const h4 = of(c4, 'f_one');
        const heirOk = J(h0) === J(['i_hum:2:pay:i_hub']) && J(h1) === J(h0) && J(h2) === J(['i_hum:2:free:i_eye']) && J(h3) === J(['i_hum:2:pay:i_hub']) && J(h4) === J(['i_hum:1:free:i_ear']);
        // once: the first implant's paying row; the second grants none, and takes it free when the first goes
        const c5 = mk(); op(c5, { op: 'add', defId: 'i_o1', rowId: 'w_c1' }); op(c5, { op: 'add', defId: 'i_o2', rowId: 'w_c2' }); const o1 = of(c5, 'f_one'); op(c5, { op: 'remove', rowId: 'w_c1' }); const o2 = of(c5, 'f_one');
        const onceOk = J(o1) === J(['i_tic:1:pay:i_o1']) && J(o2) === J(['i_tic:1:free:i_o2']);
        // the terms follow the granting row's level: past its From the later grant's level and Pays back; back below, the first grant's
        const c6 = mk(); op(c6, { op: 'add', defId: 'i_tr', rowId: 'w_t1' }); const t1 = of(c6, 'f_one'); op(c6, { op: 'set', rowId: 'w_t1', facts: { lvl: 3 } }); const t3 = of(c6, 'f_one'); op(c6, { op: 'set', rowId: 'w_t1', facts: { lvl: 1 } }); const tb = of(c6, 'f_one');
        const tierOk = J(t1) === J(['i_hum:1:free:i_tr']) && J(t3) === J(['i_hum:2:pay:i_tr']) && J(tb) === J(t1);
        // a trade and a character file: alone it is no one's grant (gp goes with gr); a file keeps its mark and its Pays back
        const XP = await import(url('sheetexport.js')), fileP = XP.charToJson(gP, c1, null, {}), flP = XP.charFromJson(pP, JSON.parse(J(fileP)), () => []);
        const fP = S.fillMaking(gP, { id: 'c_m', name: 'Pax', ownerId: 'u_a', npc: false, making: 1, values: {} }, flP, F, { view: pP, lib: null });
        const imF = fP.values.f_im.find(r => r.defId === 'i_im'), drF = fP.values.f_dr;
        const fileOk = fP.ok && J(drF.map(r => [r.lvl, r.gp === 1 ? 'pay' : 'free', r.gr === imF.id ? 'im' : r.gr ? 'pk' : '-'])) === J([[1, 'free', 'pk'], [3, 'pay', 'im']]);
        const lone = { id: 'c_l', name: 'L', values: { f_im: [], f_dr: [{ id: 'w_g', defId: 'i_ache', qty: 1, lvl: 3, gr: 'w_none', gp: 1 }], f_one: [] } };
        const fl2 = S.fillMaking(gP, { id: 'c_n', name: 'N', ownerId: 'u_a', npc: false, making: 1, values: {} }, XP.charFromJson(pP, JSON.parse(J(XP.charToJson(gP, lone, null, {}))), () => []), F, { view: pP, lib: null });
        const loneOk = fl2.ok && !('gr' in fl2.values.f_dr[0]) && !('gp' in fl2.values.f_dr[0]);
        const rawT = JSON.parse(J(rawP)); rawT.fields.forEach(f => { if (f.list) f.list.trade = true; }); const gT = cleanSystem(rawT, { F, gmView: true });
        const ta = mk(), tb2 = { id: 'c_q', name: 'Ula', ownerId: 'u_u', values: { f_im: [], f_dr: [], f_one: [] } }; ['w_p1', 'w_i1'].forEach(id => op(ta, { op: 'add', defId: id === 'w_p1' ? 'i_pk' : 'i_im', rowId: id }));
        const trW = S.tradeApply(gT, ta, tb2, [{ fid: 'f_im', rowId: 'w_i1', qty: 1 }], [], 'gm', 'gm');
        const ln = { id: 'c_l', name: 'L', values: { f_im: [], f_dr: [{ id: 'w_g', defId: 'i_ache', qty: 1, lvl: 3, gr: 'w_none', gp: 1 }], f_one: [] } }, trL = S.tradeApply(gT, ln, tb2, [{ fid: 'f_dr', rowId: 'w_g', qty: 1 }], [], 'gm', 'gm');
        const wholeB = trW.ok ? trW.valuesB.f_dr : null, aloneB = trL.ok ? trL.valuesB.f_dr : null;
        const tradeOk = !!wholeB && wholeB.length === 1 && wholeB[0].gp === 1 && wholeB[0].gr === trW.valuesB.f_im[0].id && wholeB[0].lvl === 3 && !!aloneB && aloneB.length === 1 && !('gr' in aloneB[0]) && !('gp' in aloneB[0]);
        // a system without the keys is key for key what it was: rows and grants as before
        const rawN = JSON.parse(J(rawP)); rawN.items.forEach(i => { (i.grants || []).forEach(g => { delete g.pay; delete g.lvl; }); }); const gN = cleanSystem(rawN, { F, gmView: true });
        const cN = mk(); put(cN, 'f_im', S.applyRowOp(gN, cN, 'f_im', { op: 'add', defId: 'i_im', rowId: 'w_i1' }, F, {}));
        const noneOk = J(gN.items.find(i => i.id === 'i_im').grants) === J([{ list: 'f_dr', entry: 'i_ache', qty: 1 }]) && J(Object.keys(cN.values.f_dr[0])) === J(['id', 'defId', 'qty', 'lvl', 'gr']) && cN.values.f_dr[0].lvl === 1;
        check('1.6.0 a grant\'s own terms: Pays back (pay, kept by cleanGrants only as true) and Level (lvl, only as a number), the grant\'s last keys, the same in both views and fixed points; grantWant carries them from the holding grant with the highest From; two grants of one entry give a free row and one that pays back at its tier, held to its list\'s most (Row.paysback 1 on it alone, so a cost column charges it as bought); the owner\'s copy reads every figure the host reads; the wire and a row with no mark carry no gp',
            cleanOk && twoOk && ownOk, J([cleanOk, twoOk, ownOk, of(c1, 'f_dr'), rvH.cells, rvO.cells]));
        check('1.6.0 a grant\'s own terms pass with the row: an heir holds it on the heir\'s terms (Pays back as the heir says, its level where it names one, else the row keeps its own); once a character, the first grant\'s Pays back and then the second\'s free; a granter whose level passes a From takes the later grant\'s level and Pays back, and back below the first\'s; a character file keeps its mark and Pays back, a row whose granter never came keeps neither; a trade of the granter carries gp with gr, the row traded alone keeps neither; a system without the keys grants key for key as before',
            heirOk && onceOk && tierOk && fileOk && loneOk && tradeOk && noneOk, J([heirOk, onceOk, tierOk, fileOk, loneOk, tradeOk, noneOk, h0, h1, h2, h3, h4, o1, o2, t1, t3, tb, drF, trW, trL, cN.values.f_dr]));
        // the Items tab's grant line (grantBox, sliced and run for real with a tick of the suite's own), what Save says, the handlers, Help, the notes and the guide
        const shQ = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), lbQ = fs.readFileSync(path.join(app, 'scripts', 'librarywin.js'), 'utf8').replace(/\r\n/g, '\n');
        const ixQ = fs.readFileSync(path.join(app, 'index.html'), 'utf8').replace(/\r\n/g, '\n'), igQ = fs.readFileSync(path.join(app, '..', '..', 'CAMPAIGN_INTEGRATION.md'), 'utf8').replace(/\r\n/g, '\n');
        const ntQ = [path.join(app, 'assets', 'whatsnew.txt'), path.join(app, '..', '..', 'WHATSNEW.txt')].map(f => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'));
        const mkQ = (tag, cls, text) => ({ tag, className: cls || '', textContent: text === undefined ? '' : String(text), kids: [], dataset: {}, appendChild(c) { this.kids.push(c); return c; } });
        const selQ = (cls, options, value, title) => Object.assign(mkQ('select', cls), { opts: options, value, title });
        const nfQ = (cls, value, title, cap) => { const l = mkQ('label', 'sys-num'); l.kids.push(mkQ('span', 'sys-num-cap', cap)); l.kids.push(Object.assign(mkQ('input', cls), { value: value === '' ? '' : String(value), title })); return l; };
        const ckQ = (cls, on, text, title) => { const l = mkQ('label', 'sys-check', ' ' + text); l.title = title; l.kids.push(Object.assign(mkQ('input', cls), { checked: !!on })); return l; };
        const gqT = require('./checkkit').part('sysedtabs.js'), qA = gqT.indexOf('// [systemcheck:grantbox-start]'), qZ = gqT.indexOf('// [systemcheck:grantbox-end]');
        const drQ = { fields: rawP.fields.concat([{ id: 'f_bag', key: 'Bag', label: 'Bag', kind: 'item-list', list: {} }]), items: [{ id: 'i_a', name: 'Kit', grants: [{ list: 'f_dr', entry: 'i_b', pay: true, lvl: 2 }, { list: 'f_bag', entry: 'i_b', lvl: 1, once: true }] }, { id: 'i_b', name: 'Ache' }] };
        const GQ = new Function('el', 'select', 'numField', 'btnRow', 'checkLabel', 'draft', 'window', 'getActiveCampaign', 'GRANT_MAX', 'LIMITS', gqT.slice(qA, qZ) + '\nreturn { grantBox: grantBox, grantSays: grantSays };')(mkQ, selQ, nfQ, l => Object.assign(mkQ('span', 'sys-btns'), { acts: l.map(x => x[0]) }), ckQ, drQ, {}, () => null, S.GRANT_MAX, S.LIMITS);
        const lnQ = GQ.grantBox(drQ.items[0]).kids.filter(k => /sys-grant( |$)/.test(k.className)), cls = l => l.kids.map(k => k.kids.length ? k.kids[k.kids.length - 1].className : k.className);
        const boxQ = lnQ.length === 2 && J(cls(lnQ[0])) === J(['sys-grant-name', 'sys-grant-list', 'sys-grant-qty', 'sys-grant-from', 'sys-grant-lvl', 'field sys-grant-spec', 'sys-grant-once', 'sys-grant-pay', 'sys-btns', 'sys-grant-stat']) /* 1.6.0 Specialties: a grant's specifier after its Level (moved on purpose); 1.6.2: what it names, on a line of its own after them (moved on purpose) */
            && lnQ[0].kids[4].kids[1].value === '2' && lnQ[0].kids[4].kids[0].textContent === 'level' && lnQ[0].kids[7].kids[0].checked === true && lnQ[0].kids[7].textContent === ' Pays back' && /marked as paying back/.test(lnQ[0].kids[7].title)
            && lnQ[1].kids[4].kids[1].value === '1' && lnQ[1].kids[7].kids[0].checked === false && lnQ[1].kids[6].kids[0].checked === true
            && J(GQ.grantSays(drQ.items[0])) === J({ drop: [], warn: ['Grant 2: its list has no level, so its Level does nothing.'] });
        const wireQ = require('./checkkit').part('sysedtabs.js').includes("else if (/(^| )sys-grant-(qty|from|lvl)( |$)/.test(ic)) {") && require('./checkkit').part('sysedtabs.js').includes("kG = /sys-grant-qty/.test(ic) ? 'qty' : /sys-grant-lvl/.test(ic) ? 'lvl' : 'from';")
            && require('./checkkit').part('sysedtabs.js').includes("if (gP) { if (t.checked) gP.pay = true; else delete gP.pay; markDirty(); } return; }   // 1.6.0: Pays back")
            && lbQ.includes("var lv = el('input', 'field lib-mod-amt lib-grant-lvl');") && lbQ.includes("pc.addEventListener('change', function() { if (pc.checked) g.pay = true; else delete g.pay; }); ln.appendChild(pl);");
        const saidQ = ixQ.includes('<li>Tick <b>Pays back</b> on a grant, and <code>Row.paysback</code> reads 1 on the row it grants.') && ixQ.includes('<li>A grant&rsquo;s <b>Level</b> is the level the row it grants starts at')
            && ixQ.includes('<b>Pays back</b><small>A row a grant gives counts as bought, so its cost can be left out of a total.</small><b>When added again</b>') /* 1.6.0 (a builder audit): When added again now follows Pays back in the Items key (moved on purpose) */ && igQ.includes('**Grants (1.6.0):**') && igQ.includes('"pay": true (Pays back), "lvl": a number')
            && ntQ.every(t => { const i = t.indexOf('- A grant can pay back: tick Pays back'), k = t.indexOf('- A grant can set the level its row starts at'); return i > 0 && k > i && k < t.indexOf('WAYPOINT 1.5.'); });
        check('1.6.0 a grant\'s own terms in the editors and said: the Items tab\'s grant line has a Level box after From level and a Pays back tick after Once a character, before its remove button; Save says a Level on a list with no level does nothing; the handlers write lvl and pay or take them off, as the Library window\'s line does; Help, the Items key, the integration guide and both release notes say it',
            boxQ && wireQ && saidQ, J([boxQ, wireQ, saidQ, lnQ.map(cls), GQ.grantSays(drQ.items[0])]));
    }
    {   // 1.6.0 O1: a switch that goes by where rows sit (on.over: a number stat read as a set of places)
        const J = JSON.stringify;
        const PL = ['Head', 'Body', 'Left hand', 'Right hand', 'Brow', 'Jaw'];
        const rawO = { v: 1, name: 'O', rolls: [], fields: [{ id: 'f_kit', key: 'Kit', label: 'Kit', kind: 'item-list', edit: 'owner', list: { on: { label: 'Worn', over: 'covers', per: 'Covers', one: true }, stats: [{ key: 'Covers', label: 'Covers', labels: PL }, { key: 'Kind', kind: 'pick', opts: [{ label: 'A', name: 'KA' }] }] } }],
            items: [{ id: 'i_glv', name: 'Gloves', stats: { Covers: 12 } }, { id: 'i_lg', name: 'Left gauntlet', stats: { Covers: 4 } }, { id: 'i_hlm', name: 'Great helm', stats: { Covers: 49 } }, { id: 'i_sat', name: 'Satchel' },
                { id: 'i_ves', name: 'Quilted vest', stats: { Covers: 2 } }, { id: 'i_mai', name: 'Mail shirt', stats: { Covers: 2 }, eq: 'bound' }], sheet: { sections: [] } };
        const gO = cleanSystem(rawO, { F, gmView: true }), pO = cleanSystem(rawO, { F, gmView: false }), spO = gO.fields[0].list;
        const badO = cleanSystem({ v: 1, name: 'B', rolls: [], fields: [{ id: 'f_k', key: 'K', kind: 'item-list', list: { on: { label: 'On', over: 'Kind', per: 'Kind' }, stats: [{ key: 'Kind', kind: 'pick', opts: [{ label: 'A', name: 'KA' }] }] } }] }, { F, gmView: true }).fields[0].list.on;
        const rows = () => ['glv', 'lg', 'hlm', 'sat', 'ves', 'mai'].map(k => ({ id: 'w_' + k, defId: 'i_' + k, qty: 1 }));
        let chO = { id: 'c_o', name: 'Pat', ownerId: 'u_p', values: { f_kit: rows() } };
        const on = (rid, o) => { const r = S.applyRowOp(gO, chO, 'f_kit', { op: 'set', rowId: rid, facts: { on: true } }, F, o || {}); if (r.ok) chO = Object.assign({}, chO, { values: { f_kit: r.value } }); return r; };
        const onIds = () => chO.values.f_kit.filter(r => r.on === true).map(r => r.id.slice(2));
        const r1 = on('w_glv'), s1 = onIds(), r2 = on('w_lg'), s2 = onIds(), r3 = on('w_hlm'), r4 = on('w_sat'), s4 = onIds(), r5 = on('w_ves'), r6 = on('w_mai'), s6 = onIds();
        check('1.6.0 O1 the switch\'s over (cleanListSpec): a number stat of the list, spelled as the list spells it, wins over per and one, and marks its stat set; a choice is never one (per stays); the same in both views and a fixed point',
            J(spO.on) === J({ label: 'Worn', over: 'Covers' }) && spO.stats[0].set === true && !('set' in spO.stats[1]) && J(badO) === J({ label: 'On', per: 'Kind' })
            && J(pO.fields[0].list.on) === J(spO.on) && J(cleanSystem(gO, { F, gmView: true })) === J(gO), J([spO, badO]));
        check('1.6.0 O1 one rule, where places meet (applyRowOp run for real): Gloves on; the Left gauntlet takes Gloves off where they share the left hand, said as it came off and where; the Great helm and a Satchel that covers nothing take nothing off; the Mail shirt takes the Quilted vest off on the body (overSays\' words)',
            r1.ok && J(s1) === J(['glv']) && r2.ok && J(s2) === J(['lg']) && J(r2.offRows) === J([{ off: 'Gloves', on: 'Left gauntlet', at: 'Left hand' }]) && r3.ok && !r3.offRows && r4.ok && !r4.offRows && J(s4) === J(['lg', 'hlm', 'sat'])
            && r5.ok && r6.ok && J(s6) === J(['lg', 'hlm', 'sat', 'mai']) && S.overSays(r6.offRows[0]) === 'Quilted vest came off: Mail shirt is worn on Body.' && J(S.overNames(spO.stats[0], 49)) === J(['Head', 'Brow', 'Jaw']),
            J([s1, s2, r2.offRows, s4, s6, r6.offRows]));
        chO = Object.assign({}, chO, { values: { f_kit: chO.values.f_kit.map(r => Object.assign({}, r, r.id === 'w_mai' ? { on: true } : {})) } });
        const pv = on('w_ves', { player: true, view: pO }), gmv = on('w_ves');
        check('1.6.0 O1 a bound row holds its place: a player\'s switch-on of the Quilted vest over the bound Mail shirt is refused in words that name both; the GM\'s own hand takes the shirt off',
            pv.ok === false && pv.reason === 'stays' && /Mail shirt is bound and stays on, so Quilted vest stays off\./.test(pv.msg) && gmv.ok === true && J(onIds()) === J(['lg', 'hlm', 'sat', 'ves']), J([pv, onIds()]));
        const hv = t => { const r = F.evaluate(t, {}); return r.ok ? r.value : 'err'; };
        const shO = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), lwO = fs.readFileSync(path.join(app, 'scripts', 'librarywin.js'), 'utf8');
        check('1.6.0 O1 has(set, n) reads place n of a set, 1 to 16 (has(12, 3) for a left hand); a place out of range is an error; the sheet says a set of places by their names, the Items tab ticks a place each and the Library window writes the ticks as the stat\'s number',
            hv('has(12, 3)') === true && hv('has(12, 1)') === false && hv('has(49, 6)') === true && hv('has(12, 17)') === 'err' && hv('has(12, 0)') === 'err'
            && shO.includes("if (st && st.set === true && typeof v === 'number') { var stB = [],") && require('./checkkit').part('sysedroll.js').includes("pbc = el('input', 'sys-item-placebit')") && require('./checkkit').part('sysedtabs.js').includes("var pnx = t.checked ? (pcur | (1 << pbn)) : (pcur & ~(1 << pbn));")
            && lwO.includes('function placeTicks(form, inp, names)') && require('./checkkit').part('sysedlist.js').includes("return ['over:' + s.key, 'Where ' + (s.label || s.key) + ' meet']; }))"));
    }
    {   // 1.6.0, the campaign build's three gaps: an up timer stops at its row's most; a list switch's Shown where; a file filling a character in the making sets its counters
        const J = JSON.stringify;
        const rawU = { v: 1, name: 'U', rolls: [], fields: [{ id: 'f_g', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', list: { on: { label: 'Lit', showIf: 'Row.Kind = 1' }, stats: [{ key: 'Kind' }, { key: 'Cap' }],
            counters: [{ key: 'Days', max: 'Row.Cap', timer: { dir: 'up', per: { n: 1, u: 'day' } } }, { key: 'Jam', roll: true }] } }],
            items: [{ id: 'i_a', name: 'Ration', stats: { Kind: 1, Cap: 3 } }, { id: 'i_b', name: 'Rope', stats: { Kind: 2, Cap: 0 } }], sheet: { sections: [] } };
        const gU = cleanSystem(rawU, { F, gmView: true }), pU = cleanSystem(rawU, { F, gmView: false });
        const chU = { id: 'c_u', name: 'Pat', ownerId: 'u_p', values: { f_g: [{ id: 'w_a', defId: 'i_a', qty: 1, ct: { Days: 2 } }, { id: 'w_b', defId: 'i_b', qty: 1 }] } };
        const perU = p => p.u === 'day' ? 86400 * p.n : 0, t5 = S.rowTimers(gU, chU, 5 * 86400, perU, F), tNoF = S.rowTimers(gU, chU, 5 * 86400, perU);
        const atCap = Object.assign({}, chU, { values: { f_g: [{ id: 'w_a', defId: 'i_a', qty: 1, ct: { Days: 3 }, tt: { Days: 100 } }] } }), tCap = S.rowTimers(gU, atCap, 86400, perU, F);
        check('1.6.0 a count up by the clock stops at its row\'s most (rowTimers with the formula engine, run for real): Days from 2 reaches its most of 3 and stands; a row whose most is 0 never starts; a row at its most lets its part of a step go; with no engine, as before',
            J(t5.values.f_g.map(r => r.ct || null)) === J([{ Days: 3 }, null]) && J(t5.values.f_g.map(r => r.tt || null)) === J([null, null]) && J(tNoF.values.f_g.map(r => r.ct || null)) === J([{ Days: 7 }, { Days: 5 }])
            && J(tCap.values.f_g[0]) === J({ id: 'w_a', defId: 'i_a', qty: 1, ct: { Days: 3 } }), J([t5.values, tNoF.values, tCap.values]));
        const show = S.resolveAll(gU, chU, F).f_g.onShow, onB = S.applyRowOp(gU, chU, 'f_g', { op: 'set', rowId: 'w_b', facts: { on: true } }, F, { player: true, view: pU }), onA = S.applyRowOp(gU, chU, 'f_g', { op: 'set', rowId: 'w_a', facts: { on: true } }, F, { player: true, view: pU }), gmB = S.applyRowOp(gU, chU, 'f_g', { op: 'set', rowId: 'w_b', facts: { on: true } }, F, {});
        const shU = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        check('1.6.0 a list switch\'s Shown where (on.showIf): kept in both views as a formula; the sheet is told row by row (onShow) and draws no switch where it does not hold; a player\'s switch-on there is refused, the GM\'s goes; the Lists card has its box and its handler; the validator reads it',
            gU.fields[0].list.on.showIf === 'Row.Kind = 1' && pU.fields[0].list.on.showIf === 'Row.Kind = 1' && J(show) === J({ w_a: true, w_b: false }) && onB.ok === false && onB.reason === 'field' && onA.ok === true && gmB.ok === true
            && shU.includes("if (!S || typeof S !== 'object' || show === false) return null;") && require('./checkkit').part('sysedlist.js').includes("orow.appendChild(input('sys-list-swshow field',") && require('./checkkit').part('sysedtabs.js').includes("lsp.on.showIf = t.value.slice(0, LIMITS.formula); else delete lsp.on.showIf;")
            && S.validateSystem(cleanSystem(Object.assign({}, rawU, { fields: [Object.assign({}, rawU.fields[0], { list: Object.assign({}, rawU.fields[0].list, { on: { label: 'Lit', showIf: 'Row.Nope = 1' } }) })] }), { F, gmView: true }), F).errors.concat(S.validateSystem(cleanSystem(Object.assign({}, rawU, { fields: [Object.assign({}, rawU.fields[0], { list: Object.assign({}, rawU.fields[0].list, { on: { label: 'Lit', showIf: 'Row.Nope = 1' } }) })] }), { F, gmView: true }), F).warnings).some(e => e.prop === 'list.onshow'),
            J([show, onB, onA.ok, gmB.ok]));
        const mk = Object.assign({}, chU, { making: 1 }), playJam = S.applyRowOp(gU, chU, 'f_g', { op: 'set', rowId: 'w_a', facts: { ct: { Jam: 1 } } }, F, { player: true, view: pU }), makeJam = S.applyRowOp(gU, mk, 'f_g', { op: 'set', rowId: 'w_a', facts: { ct: { Jam: 1, Days: 1 } } }, F, { player: true, view: pU });
        check('1.6.0 a character in the making takes a counter set by rolls only or by the clock from its player (a file that fills it brings a weapon\'s jam or the days without), while one in play never does',
            playJam.ok === false && playJam.reason === 'field' && makeJam.ok === true && J(makeJam.value[0].ct) === J({ Days: 1, Jam: 1 }), J([playJam, makeJam.ok && makeJam.value[0]]));
    }
    {   // 1.6.0, the campaign build: the campaign's date in formulas (the owner, by prompt: "The real date everywhere")
        const J = JSON.stringify, CCd = await import(url('calendarcore.js'));
        const calUp = CCd.cleanCalendar({ periods: [{ name: 'A', days: 10 }, { name: 'B', days: 10 }], one: 100 }), calDown = CCd.cleanCalendar({ periods: [{ name: 'A', days: 10 }, { name: 'B', days: 10 }], one: 3963, down: true });
        const dl = CCd.dayLength(calUp), t = 25 * dl + 13 * 3600 + 7 * 60;   // day 26 of the world: the second year's first period, its sixth day, 13:07
        const nUp = CCd.dateNames(calUp, t), nDn = CCd.dateNames(calDown, t);
        const coreOk = J(nUp) === J({ year: 101, day: 6, days: 25, hour: 13, minute: 7 }) && J(nDn) === J({ year: -3962, day: 6, days: 25, hour: 13, minute: 7 })
            && J(CCd.cleanDateFig({ year: -3962.4, day: 6, days: 25, hour: 13, minute: 7, x: 1 })) === J({ year: -3962, day: 6, days: 25, hour: 13, minute: 7 }) && CCd.cleanDateFig({ year: 'a', day: 1, days: 1, hour: 1, minute: 1 }) === null && CCd.cleanDateFig(null) === null && CCd.cleanDateFig({ year: 1e13, day: 1, days: 1, hour: 1, minute: 1 }) === null;
        const sysD = S.cleanSystem({ v: 1, name: 'D', fields: [{ id: 'f_e', key: 'Era', label: 'Era', kind: 'formula', formula: 'Date.year <= -3959' }, { id: 'f_h', key: 'Hr', label: 'Hr', kind: 'formula', formula: 'Date.hour * 60 + Date.minute' }], sheet: { sections: [] } }, { F, gmView: true });
        const ch = { id: 'c', values: {} }, read = () => { const r = S.resolveAll(sysD, ch, F); return [r.f_e.value, r.f_h.value]; };
        S.setDateSource(() => nDn); const a = read(); S.setDateSource(() => nUp); const b = read(); S.setDateSource(() => { throw new Error('x'); }); const c = read(); S.setDateSource(null); const d = read();
        const resOk = J([a, b, c, d]) === J([[true, 787], [false, 787], [false, 0], [false, 0]]);
        const vOk = !/Unknown name/.test(J(S.validateSystem(sysD, F))) && /Unknown name \\"Date\.week/.test(J(S.validateSystem(S.cleanSystem({ v: 1, name: 'D', fields: [{ id: 'f_e', key: 'Era', label: 'Era', kind: 'formula', formula: 'Date.week' }], sheet: { sections: [] } }, { F, gmView: true }), F)));
        const own = S.cleanSystem({ v: 1, name: 'O', fields: [{ id: 'f_d', key: 'Date', label: 'Date', kind: 'number' }, { id: 'f_x', key: 'X', label: 'X', kind: 'formula', formula: 'Date + 1' }], sheet: { sections: [] } }, { F, gmView: true });
        S.setDateSource(() => nUp); const ownV = S.resolveAll(own, { id: 'c', values: { f_d: 4 } }, F).f_x.value; S.setDateSource(null);
        const readsOk = S.dateReads(sysD) === true && S.dateReads(own) === false && J(S.DATE_NAMES) === J(['Date.year', 'Date.day', 'Date.days', 'Date.hour', 'Date.minute']);
        const calS = fs.readFileSync(path.join(app, 'scripts', 'calendar.js'), 'utf8').replace(/\r\n/g, '\n'), netS = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n');
        const wireOk = calS.includes('setDateSource(dateNow);') && netS.includes("if (m.clock === null) { var fg = dateFigOut(camp); if (fg) m.date = fg; } return m;") && netS.includes("var fgIn = !ckIn && CCk.cleanDateFig ? CCk.cleanDateFig(msg.date) : null; if (fgIn) campCk.dateFig = fgIn; else delete campCk.dateFig;")
            && require('./checkkit').part('netfog.js').includes("if (ckS) { camp.clock = ckS; delete camp.dateFig; } else { delete camp.clock; var fgS = camp.id === c.activeCampaignId && typeof dateFigOut === 'function' ? dateFigOut(camp) : null;");
        check('1.6.0 the campaign\'s date in formulas (the campaign build; the owner, by prompt: "The real date everywhere"): calendarcore dateNames gives the year signed, a year counting down read as negative, the day of its period, whole days since the first, the hour and the minute, and cleanDateFig takes those five numbers alone; the resolver reads Date.year, Date.day, Date.days, Date.hour and Date.minute through the one registered source, 0 with none or one that throws; the validator knows the five and no other; a field named Date keeps its own name; dateReads says whether a system names the date; calendar.js registers the source, and the host sends a player the five numbers alone where no clock goes, in a clock message and the join snapshot, which a player\'s app keeps cleaned',
            coreOk && resOk && vOk && ownV === 5 && readsOk && wireOk, J([coreOk, nUp, nDn, [a, b, c, d], vOk, ownV, readsOk, wireOk]));
    }
    {   // 1.6.0 roll switches (the owner, by prompt: "In the ± window"): a bonus an item or an effect offers to some rolls, ticked in the roll's ± window, judged by the host
        const J = JSON.stringify, DCw = await import(url('dicecore.js'));
        const sysW = S.cleanSystem({ v: 1, name: 'W', fields: [
            { id: 'f_st', key: 'Stealth', label: 'Stealth', kind: 'skill', roll: '3d6' },
            { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', list: { on: { label: 'Ready' }, rolls: [{ label: 'Hit', formula: '3d6' }] } },
            { id: 'f_fx', key: 'Fx', label: 'Fx', kind: 'effects' }],
            rolls: [{ id: 'r_dodge', label: 'Dodge', formula: '3d6' }],
            items: [{ id: 'i_cloak', name: 'Cloak', key: 'cloak', rollSw: [{ name: 'In shadow', v: 2.4, to: [{ f: 'f_st' }, { f: 'f_zz' }, { l: 'f_gear', key: 'cloak' }, { f: 'f_st' }] }, { name: 'Nothing', v: 0, to: [{ f: 'f_st' }] }, { name: '', v: 1, to: [{ r: 'r_dodge' }] }, { name: 'No roll', v: 1, to: [] }] },
                { id: 'i_sword', name: 'Sword', key: 'sword', modsOn: true, mods: [{ f: 'f_st', op: 'add', v: 1 }], rollSw: [{ name: 'Riposte', v: 1, to: [{ r: 'r_dodge' }] }] },
                { id: 'i_amul', name: 'Amulet', vis: 'gm', rollSw: [{ name: 'Hex', v: 3, to: [{ r: 'r_dodge' }] }] }],
            effects: [{ id: 'e_aim', name: 'Aimed', rollSw: [{ name: 'Aim', v: 1, to: [{ l: 'f_gear' }] }, { name: 'Steady', v: -1, to: [{ r: 'r_dodge' }] }] }],
            sheet: { sections: [] } }, { F, gmView: true });
        const it = id => sysW.items.find(x => x.id === id);
        const cleanOk = J(it('i_cloak').rollSw) === J([{ name: 'In shadow', v: 2, to: [{ f: 'f_st' }, { l: 'f_gear', key: 'cloak' }] }]) && J(sysW.effects[0].rollSw) === J([{ name: 'Aim', v: 1, to: [{ l: 'f_gear' }] }, { name: 'Steady', v: -1, to: [{ r: 'r_dodge' }] }])
            && S.cleanRollSw(Array.from({ length: 44 }, (x, i) => ({ name: 'A' + i, v: 1, to: [{ f: 'f_st' }] }))).length === 40 && S.cleanRollSw('x') === null && S.cleanRollSw([{ name: 'A', v: 100, to: [{ f: 'f_st' }] }]) === null;
        const pl = S.cleanSystem(sysW, { F, gmView: false }), plOk = !pl.items.some(x => x.id === 'i_amul') && J(pl.items.find(x => x.id === 'i_cloak').rollSw) === J(it('i_cloak').rollSw);
        const ch = { id: 'c_1', values: { f_gear: [{ id: 'w_a', defId: 'i_cloak', qty: 1 }, { id: 'w_b', defId: 'i_sword', qty: 1, on: false }, { id: 'w_c', defId: 'i_amul', qty: 1 }], f_fx: [{ id: 'x_1', ref: 'e_aim' }] } };
        const rs = ref => S.rollSwitches(sysW, ch, ref).map(w => w.s + '#' + w.i + ':' + w.name + (w.gm ? '!' : ''));
        const offOk = J(rs({ f: 'f_st' })) === J(['f_gear|w_a#0:In shadow']) && J(rs({ l: 'f_gear', row: 'w_a' })) === J(['f_gear|w_a#0:In shadow', 'f_fx|e_aim#0:Aim']) && J(rs({ l: 'f_gear', row: 'w_b' })) === J(['f_fx|e_aim#0:Aim'])
            && J(rs({ r: 'r_dodge' })) === J(['f_gear|w_c#0:Hex!', 'f_fx|e_aim#1:Steady']) && J(rs({ l: 'f_gear', row: 'w_zz' })) === '[]';
        ch.values.f_gear[1].on = true; const onOk = rs({ r: 'r_dodge' }).includes('f_gear|w_b#0:Riposte'); ch.values.f_fx[0].on = false; const fxOffOk = !rs({ r: 'r_dodge' }).some(x => /Steady/.test(x)); ch.values.f_fx[0].on = true;
        const jg = (ref, p) => S.swJudge(sysW, ch, ref, p);
        const judgeOk = J(jg({ l: 'f_gear', row: 'w_a' }, [{ s: 'f_gear|w_a', i: 0 }, { s: 'f_fx|e_aim', i: 0 }])) === J({ ok: true, v: 3, names: [{ n: 'In shadow', v: 2 }, { n: 'Aim', v: 1 }] })
            && jg({ f: 'f_st' }, [{ s: 'f_fx|e_aim', i: 0 }]).ok === false && jg({ f: 'f_st' }, [{ s: 'f_gear|w_a', i: 0 }, { s: 'f_gear|w_a', i: 0 }]).ok === false && jg({ f: 'f_st' }, [{ s: 'f_gear|w_a', i: 1 }]).ok === false
            && J(jg({ r: 'r_dodge' }, [{ s: 'f_gear|w_c', i: 0 }])) === J({ ok: true, v: 3, names: [{ n: 'Hex', v: 3, gm: true }] }) && J(jg({ f: 'f_st' }, [])) === J({ ok: true, v: 0, names: [] });
        const rq = m => DCw.cleanRollReq(Object.assign({ rid: 'q1', expr: '3d6', charId: 'c_1' }, m));
        const wireOk = J(rq({ fr: 'f_st', mod: 2, sw: [{ s: 'f_gear|w_a', i: 0 }] })) === J({ rid: 'q1', expr: '3d6', charId: 'c_1', fr: 'f_st', mod: 2, sw: [{ s: 'f_gear|w_a', i: 0 }] })
            && rq({ sw: [{ s: 'f_gear|w_a', i: 0 }] }) === null && rq({ fr: 'f_st', act: 'r_dodge' }) === null && rq({ fr: 'bad' }) === null && rq({ fr: 'f_st', sw: [{ s: 'f_gear|w_a', i: 0 }, { s: 'f_gear|w_a', i: 0 }] }) === null
            && rq({ fr: 'f_st', sw: [{ s: 'f_gear|<b>', i: 0 }] }) === null && rq({ fr: 'f_st', sw: [{ s: 'f_gear|w_a', i: 40 }] }) === null && rq({ act: 'r_dodge', sw: [] }) === null
            && J(rq({ row: { f: 'f_gear', r: 'w_a', i: 0 }, sw: [{ s: 'f_fx|e_aim', i: 0 }] }).sw) === J([{ s: 'f_fx|e_aim', i: 0 }]) && DCw.cleanRollReq({ rid: 'q1', expr: '3d6', fr: 'f_st' }) === null;
        const cardOk = J(DCw.cleanSwNames([{ n: 'Aim', v: 1 }, { n: 'Hex', v: -3 }])) === J([{ n: 'Aim', v: 1 }, { n: 'Hex', v: -3 }]) && DCw.cleanSwNames([{ n: 'A', v: 0 }]) === null && DCw.cleanSwNames([{ n: '', v: 1 }]) === null && DCw.cleanSwNames('x') === null;
        const netS = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'utf8').replace(/\r\n/g, '\n'), diceS = fs.readFileSync(path.join(app, 'scripts', 'dice.js'), 'utf8').replace(/\r\n/g, '\n'), shS = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        const hostOk = netS.includes("SQ.swJudge(viewQ, chvQ, q.act ? { r: q.act } : q.fr ? { f: q.fr } : { l: q.row.f, row: q.row.r, i: q.row.i }, q.sw)")   /* 1.6.0: the roll's index too, for a bonus on one roll of a list (moved on purpose) */ && netS.includes("Dq.composeModifier(wantQ, (q.mod || 0) + (swQ ? swQ.v : 0), Fq.parse, (q.modD || '') + (swQ && swQ.d ? swQ.d : ''))")   /* 1.6.2: and their dice (moved on purpose) */ && netS.includes("else if (q.fr) (Array.isArray(viewQ.fields) ? viewQ.fields : []).forEach(function(f) { if (f && f.id === q.fr && typeof f.roll === 'string' && f.roll) actQ = { formula: f.roll }; });")
            && netS.includes("SR.swJudge(campR.system, chR, refSw, o.sw)") && netS.includes("toast('Kept private: it adds a GM-only bonus (");
        // the ± window's Roll, sliced and run: a roll that is not named is named by its swRef once a bonus is ticked; one with none goes as before
        const mo = diceS.slice(diceS.indexOf('function modOpts('), diceS.indexOf('function rollWithMod('));
        const modOpts = new Function(mo + '; return modOpts;')();
        // 1.6.3 (finding 13), moved on purpose: a roll changed by hand alone is named by its swRef too, so the host checks it and its card says what was added.
        // The review of words, moved on purpose again: it is not named for that alone (naming it made the host judge it as its entry, off a turn and for
        // card actions, where the plain press went through); it goes as its formula alone with hm, what was added by hand, words for its card
        const moOk = J(modOpts(undefined, 2, 'normal', [{ s: 'f_gear|w_a', i: 0 }], { f: 'f_st' })) === J({ fr: 'f_st', mod: 2, sw: [{ s: 'f_gear|w_a', i: 0 }] })
            && J(modOpts({ gmOnly: true }, 0, 'adv', [{ s: 'f_fx|e_aim', i: 1 }], { r: 'r_dodge' })) === J({ gmOnly: true, act: 'r_dodge', adv: 'adv', sw: [{ s: 'f_fx|e_aim', i: 1 }] })
            && J(modOpts({ row: { f: 'f_gear', r: 'w_a' } }, 1, 'normal', [{ s: 'f_fx|e_aim', i: 0 }], { l: 'f_gear', row: 'w_a', i: 0 }).row) === J({ f: 'f_gear', r: 'w_a', i: 0 })
            && J(modOpts(undefined, 2, 'normal', [], { f: 'f_st' })) === J({ hm: { v: 2 } }) && J(modOpts({ priv: true }, 0, 'dis', [], { l: 'f_gear', row: 'w_a', i: 0 })) === J({ priv: true, hm: { adv: 'dis' } }) && modOpts(undefined, 0, 'normal', [], { f: 'f_st' }, '+1d6') === undefined
            && modOpts(undefined, 0, 'normal', [], { f: 'f_st' }) === undefined && J(modOpts({ act: 'r_dodge' }, 1, 'normal', [])) === J({ act: 'r_dodge', mod: 1 });
        const sheetOk = shS.includes("sheetRoll(e, c.id, f.roll, f.label || 'this field', f.vis === 'gm' ? { gmOnly: true, fr: f.id } : { fr: f.id }, { f: f.id });")   /* 1.6.3 (finding 26, moved on purpose): every field roll names its field */ && shS.includes("sheetRoll(e, c.id, r.formula, lb, oR, { r: r.id });") && shS.includes("sheetRoll(e, c.id, r.formula, nm + ' \\u00b7 ' + lb, oL, { l: f.id, row: rid, i: ri });") && shS.includes("window.wpDice.rollWithMod(charId, expr, label, opts, e.currentTarget, swRef);") && shS.includes("pm.classList.add('sheet-roll-mod-sw');") && require('./checkkit').part('sysedroll.js').includes("row.appendChild(swBox(it));   // 1.6.0: its roll bonuses (asked") && diceS.includes("if (typeof swInto === 'function') swInto(wrap, rec.sw);");
        check('1.6.0 roll switches (the owner, by prompt: "In the ± window"): an item or an effect offers a named bonus to some rolls (a field\'s own roll, a system roll, any roll on a list\'s rows or only on rows of one entry by its key), kept by cleanRollSw (a name, a whole 1 to 99 either way, the rolls it names, four a holder) and in the players\' view where its holder is; rollSwitches finds those a character holds for one roll (a row carried and not a kept curse, an item that works while switched on only while its row is on, a library effect switched on), swJudge is the one judge of what was ticked (each once, each one this character has for this roll); the dice wire names a field\'s own roll (fr) and the switches ticked (sw) only on a named roll; the host judges them through the roller\'s view and composes them with the modifier, the GM\'s own roll keeps a GM-only bonus private, the card names what was added; the ± window names an unnamed roll by its swRef once a bonus is ticked; the ± is marked where one applies',
            cleanOk && plOk && offOk && onOk && fxOffOk && judgeOk && wireOk && cardOk && hostOk && moOk && sheetOk, J([cleanOk, plOk, offOk, rs({ r: 'r_dodge' }), onOk, fxOffOk, judgeOk, wireOk, cardOk, hostOk, moOk, sheetOk]));
    }
    // Clarity package: a formula's rounding picked from a list (cleanField keeps it, roundBy works it in whole millionths, the resolver rounds
    // before the effects add), and the editor's boxes captioned (capBox above a box, capInline before one on the row of ticks)
    {
        const J = j, { roundBy, ROUND_TO } = S;
        const rawR = { v: 1, name: 'R', fields: [
            { id: 'f_dex', key: 'DEX', kind: 'number', def: 8 }, { id: 'f_con', key: 'CON', kind: 'number', def: 13 }, { id: 'f_int', key: 'INT', kind: 'number', def: 11 },
            { id: 'f_per', key: 'PER', kind: 'formula', formula: '(INT / 2) + (CON / 2)', round: 'down' },
            { id: 'f_ini', key: 'Initiative', kind: 'formula', formula: '((DEX / 2) + (CON / 4) + (PER / 1.75)) / 3', round: 'near', roundTo: 2 },
            { id: 'f_dod', key: 'Dodge', kind: 'formula', formula: 'Initiative + 3.25', round: 'from', roundAt: 0.95 },
            { id: 'f_big', key: 'Big', kind: 'formula', formula: 'DEX > 5', round: 'up' },
            { id: 'f_odd', key: 'Odd', kind: 'formula', formula: '1', round: 'sideways', roundTo: 2, roundAt: 0.9 },
            { id: 'f_far', key: 'Far', kind: 'formula', formula: '1', round: 'from', roundTo: 9, roundAt: 0.999 },
            { id: 'f_low', key: 'Low', kind: 'formula', formula: '1', round: 'from' },
            { id: 'f_num', key: 'Num', kind: 'number', round: 'down', roundTo: 2 },
            { id: 'f_fx', key: 'Fx', kind: 'effects', vis: 'all', edit: 'owner' }] };
        const gR = cleanSystem(rawR, { F, gmView: true }), pR = cleanSystem(rawR, { F, gmView: false }), rnd = s => s.fields.map(f => [f.key, f.round, f.roundTo, f.roundAt]);
        check('clarity package: a formula field\'s rounding is kept as the GM picked it, the same in both views (down; normally to hundredths; up only from .95; up), a way that is none is dropped whole, a To past thousandths is dropped, a point is held to 0.01 to 0.99 and is 0.5 with none, and a field that is no formula keeps none',
            J(rnd(gR)) === J([['DEX'], ['CON'], ['INT'], ['PER', 'down'], ['Initiative', 'near', 2], ['Dodge', 'from', undefined, 0.95], ['Big', 'up'], ['Odd'], ['Far', 'from', undefined, 0.99], ['Low', 'from', undefined, 0.5], ['Num'], ['Fx']].map(r => [r[0], r[1], r[2], r[3]]))
            && J(rnd(pR)) === J(rnd(gR)) && ROUND_TO === 3, J(rnd(gR)));
        const rb = [roundBy(7.65, 'from', 0, 0.95), roundBy(4.7 + 3.25, 'from', 0, 0.95), roundBy(5.7 + 3.25, 'from', 0, 0.95), roundBy(7.94, 'from', 0, 0.95), roundBy(2.5, 'near'), roundBy(-2.5, 'near'), roundBy(-2.4, 'down'), roundBy(2.01, 'up'), roundBy(2, 'up'),
            roundBy(4.405, 'near', 2), roundBy(0.1 + 0.2, 'down', 1), roundBy(3.75, 'from', 1, 0.5), roundBy(1e12 + 0.5, 'down'), roundBy(true, 'up'), roundBy(3.7, 'sideways'), roundBy(Infinity, 'near'), String(roundBy(NaN, 'near'))];
        check('clarity package: roundBy works in whole millionths of the kept place, so a figure the computer holds a hair under its written value rounds as written (5.7 + 3.25 is 8.95, so up from .95 gives 9, where mod(x, 1) >= 0.95 gave 8; 4.405 to hundredths is 4.41, where round() gives 4.4; 0.1 + 0.2 down to tenths is 0.3); near is half up as round() is, down and up go that way always, past a billion the figure is rounded as it is, and a value that is no number, or a way that is none, passes untouched',
            J(rb) === J([7, 8, 9, 7, 3, -2, -3, 3, 2, 4.41, 0.3, 3.8, 1e12, true, 3.7, Infinity, 'NaN']), J(rb));
        const chR = { id: 'c_r', values: {} }, R0 = makeResolver(gR, chR, F), hurt = { id: 'c_h', values: { f_fx: [{ id: 'x_9', name: 'Hurt', tone: 'debuff', on: true, mods: [{ f: 'f_dod', op: 'add', v: -1 }] }] } }, R1 = makeResolver(gR, hurt, F);
        let all = 0, wrong = [];
        for (let D = 1; D <= 30; D++) for (let C = 1; C <= 30; C++) for (let I = 1; I <= 30; I += 7) {   // the book's answer worked in whole hundredths (1 / 1.75 is 4 / 7), against the resolver
            const Rx = makeResolver(gR, { id: 'c_x', values: { f_dex: D, f_con: C, f_int: I } }, F), P = Math.floor(I / 2 + C / 2), i100 = Math.floor((2 * 100 * (14 * D + 7 * C + 16 * P) + 84) / 168), d100 = i100 + 325;
            all++; if (Rx('PER') !== P || Rx('Initiative') !== i100 / 100 || Rx('Dodge') !== Math.floor(d100 / 100) + (d100 % 100 >= 95 ? 1 : 0)) wrong.push([D, C, I, Rx('PER'), Rx('Initiative'), Rx('Dodge')]);
        }
        check('clarity package: the resolver rounds a formula field as picked, then adds its effects: Mith\'s Perception (down), Initiative (normally, to hundredths) and Dodge (up only from .95) written plainly come out as the book has them for every DEX and CON from 1 to 30 (DEX 8, CON 13, INT 11: Initiative 4.7 and Dodge 7.95 up to 8), a Hurt of -1 on Dodge is added after (7), and a comparison stays true',
            wrong.length === 0 && all === 4500 && R0('PER') === 12 && R0('Initiative') === 4.7 && R0('Dodge') === 8 && R1('Dodge') === 7 && R0('Big') === true, J([wrong.slice(0, 3), R0('Initiative'), R0('Dodge'), R1('Dodge'), R0('Big')]));
        const shC = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), frC = shC.slice(shC.indexOf('\nfunction fieldRow(f) {'), shC.indexOf('\n    flags.appendChild(btnRow(', shC.indexOf('\nfunction fieldRow(f) {'))), dcC = shC.slice(shC.indexOf('\nfunction buildDefCell(def, f) {'), shC.indexOf('\n// Clarity package: how a formula'));
        const bare = (frC + dcC).match(/appendChild\(input\('[a-z-]+ field'/g) || [];
        check('clarity package: every box of a field\'s row says what it is once filled (the editor\'s rows as written): Key, Label and Kind, a formula, a pool\'s Max formula and Starting value, a skill\'s Base formula, a text\'s and a choice\'s defaults and a choice\'s options each captioned above; Unit, Roll, Value names, Caption and a pool\'s Icon named before them; the decimals read Decimals: 1 to 2; no text box is put on the row bare; and a formula has Rounding, its To and Up from',
            ["top.appendChild(capBox(input('sys-key field',", "top.appendChild(capBox(input('sys-label field',", "top.appendChild(capBox(select('sys-kind',"].every(s => frC.includes(s))
            && [["'(STR - 10) / 2'), 'Formula')); roundCells(def, f); def.appendChild(el('div', 'sys-line sys-kind-line',", 1], ["'10 + CONmod * 2'), 'Max formula'));", 1], ["'Starting value: a number, or \"max\" for full', 'max'), 'Starting value'));", 1], ["'optional: DEXmod'), 'Base formula'));", 1], ["'optional'), 'Default text'));", 1], ["'Fighter, Rogue, Mage'), 'Options, separated by commas'));", 1], ["'the first'), 'Default option'));", 1]].every(p => dcC.split(p[0]).length - 1 === p[1])
            && ["flags.appendChild(capInline(uIn, 'Unit: '));", "'optional'), 'Roll: '));", "'optional'), 'Value names: '));", "'optional'), 'Caption: '));", "flags.appendChild(capInline(rIcoIn, 'Icon: '));"].every(s => frC.includes(s)) && bare.length === 0
            && shC.includes("function capBox(box, cap) { var l = el('label', 'sys-num sys-cap'); l.appendChild(el('span', 'sys-num-cap', cap)); l.appendChild(box); return l; }") && shC.includes("function capInline(box, words) { var l = el('label', 'sys-hover sys-capin'); l.appendChild(document.createTextNode(words)); l.appendChild(box); return l; }")
            && shC.includes("if (i) l.appendChild(document.createTextNode(' to '));")
            && require('./checkkit').part('sysedroll.js').includes("def.appendChild(labeledSelect('sys-round', 'Rounding', ROUND_WORDS, how, ") && require('./checkkit').part('sysedroll.js').includes("def.appendChild(labeledSelect('sys-roundto', 'To', [['0', 'whole numbers'], ['1', 'tenths'], ['2', 'hundredths'], ['3', 'thousandths']], ") && require('./checkkit').part('sysedroll.js').includes("if (how === 'from') def.appendChild(numField('sys-roundat', ")
            && require('./checkkit').part('sysedtabs.js').includes("else if (t.classList.contains('sys-round')) { if (t.value) f.round = t.value; else { delete f.round; delete f.roundTo; } if (t.value !== 'from') delete f.roundAt; markDirty(); renderAll(); return; }")
            && require('./checkkit').part('sysedtabs.js').includes("if (f.kind !== 'formula' && f.kind !== 'resource') { delete f.round; delete f.roundTo; delete f.roundAt; }"), J(bare));
        // the owner's session's answers (2026-10-26): a pool's Max formula rounds by the same list, and the sheet's tooltip says how a value was rounded
        const rawP = { v: 1, name: 'P', fields: [{ id: 'f_st', key: 'ST', kind: 'number', def: 10 }, { id: 'f_hp', key: 'HP', kind: 'resource', maxFormula: '(ST * 0.75) + (13 * 0.25)', round: 'near' },
            { id: 'f_ep', key: 'EP', kind: 'resource', maxFormula: '9.5', round: 'down', roundTo: 9 }, { id: 'f_fp', key: 'FP', kind: 'resource', maxFormula: '9.5' }, { id: 'f_wd', key: 'Wd', kind: 'formula', formula: '7.94', round: 'from', roundAt: 0.95 },
            { id: 'f_pl', key: 'Pl', kind: 'formula', formula: 'ST + 2', round: 'down' }, { id: 'f_in', key: 'In', kind: 'formula', formula: '4.70238', round: 'near', roundTo: 2 }] };
        const gP = cleanSystem(rawP, { F, gmView: true }), aP = S.resolveAll(gP, { id: 'c_p', values: { f_hp: { cur: 3 } } }, F), fP = k => gP.fields.find(f => f.key === k), eP = k => aP[fP(k).id];
        const sayP = [S.roundSays(fP('HP'), eP('HP').maxUnrounded), S.roundSays(fP('Wd'), eP('Wd').unrounded), S.roundSays(fP('In'), eP('In').unrounded), S.roundSays(gR.fields.find(f => f.key === 'Dodge'), 7.95), S.roundSays(fP('Pl'), 12), S.roundSays(fP('FP'), 9.5), S.roundSays(null, 1)];
        check('clarity package, the answers: a pool\'s Max formula keeps a rounding as a formula does and its most is rounded by it (10.75 to 11; 9.5 down to 9, a To past thousandths dropped; one with none stays 9.5), the sheet\'s entry carries the figure before the rounding only where the rounding changed it, and roundSays words it for the tooltip: 10.75, rounded; 7.94, rounded down, below .95; 4.7024, rounded to hundredths; 7.95, rounded up from .95',
            J([fP('HP').round, fP('EP').round, fP('EP').roundTo, eP('HP').max, eP('EP').max, eP('FP').max, eP('HP').maxUnrounded, eP('FP').maxUnrounded, eP('Pl').value, 'unrounded' in eP('Pl'), 'maxUnrounded' in eP('FP')]) === J(['near', 'down', undefined, 11, 9, 9.5, 10.75, undefined, 12, false, false])
            && J(sayP) === J(['10.75, rounded', '7.94, rounded down, below .95', '4.7024, rounded to hundredths', '7.95, rounded up from .95', '12, rounded down', '', ''])
            && shC.includes("'Max formula')); roundCells(def, f);") && shC.includes("if (e && !e.error && e.unrounded !== undefined && typeof roundSays === 'function') v.title += '\\n' + roundSays(f, e.unrounded);")
            && shC.includes("if (e && !e.error && e.maxUnrounded !== undefined && typeof roundSays === 'function') mx.title += '\\n' + roundSays(f, e.maxUnrounded);"), J([sayP, eP('HP'), eP('EP').max]));
    }
    {   // 1.6.0: <Pool>.full (the campaign build's ask): 1 while a pool is full with nothing stored, 0 once a current is stored, even one at its max
        const J = JSON.stringify;
        const sysP = S.cleanSystem({ v: 1, name: 'P', fields: [
            { id: 'f_ep', key: 'EP', label: 'EP', kind: 'resource', maxFormula: '10', def: 'max' },
            { id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', maxFormula: '8', def: 3 },
            { id: 'f_c', key: 'Cost', label: 'Cost', kind: 'formula', formula: 'if(EP.full, 0, 2)' },
            { id: 'f_x', key: 'Stat.full', label: 'X', kind: 'number', def: 7 }], sheet: { sections: [] } }, { F, gmView: true });
        const rd = (vals, names) => { const r = S.makeResolver(sysP, { id: 'c', values: vals }, F); return names.map(n => r(n)); };
        const full = rd({}, ['EP.full', 'EP', 'EP.cur', 'EP.max', 'Cost', 'HP.full', 'HP', 'Stat.full']);
        const atMax = rd({ f_ep: { cur: 10 } }, ['EP.full', 'EP', 'Cost']), part = rd({ f_ep: { cur: 4 } }, ['EP.full', 'EP', 'Cost']);
        const vOk = !/Unknown name/.test(J(S.validateSystem(sysP, F))) && /Unknown name/.test(J(S.validateSystem(S.cleanSystem({ v: 1, name: 'Q', fields: [{ id: 'f_ep', key: 'EP', label: 'EP', kind: 'resource', maxFormula: '10' }, { id: 'f_c', key: 'C', label: 'C', kind: 'formula', formula: 'EP.empty' }], sheet: { sections: [] } }, { F, gmView: true }), F)));
        const keyOk = S.validKey('Stat.full', F) === true;
        const sysG = S.cleanSystem({ v: 1, name: 'G', fields: [{ id: 'f_s', key: 'Sec', label: 'Sec', kind: 'resource', maxFormula: '5', vis: 'gm' }, { id: 'f_o', key: 'Open', label: 'Open', kind: 'resource', maxFormula: '5' }], sheet: { sections: [] } }, { F, gmView: true });
        const gmOk = J(S.gmOnlyNames(sysG, [{ name: 'Sec.full' }, { name: 'Open.full' }])) === J(['Sec.full']);
        check('1.6.0 <Pool>.full (the campaign build\'s ask: a cost taken off current EP once, where the max was lowered by it too): the resolver reads 1 while a pool is full with nothing stored and 0 once a current is stored, even one exactly at its max, so a formula tells the two apart; a pool that starts at a number reads 0; the validator knows the name; .full is not a reserved ending, so a field keyed Stat.full is still a key and is read as itself; a GM-only pool\'s .full is a GM-only name',
            J(full) === J([1, 10, 10, 10, 0, 0, 3, 7]) && J(atMax) === J([0, 10, 2]) && J(part) === J([0, 4, 2]) && vOk && keyOk && gmOk, J([full, atMax, part, vOk, keyOk, gmOk]));
    }
    {   // 1.6.0: CrossStep and Crossed (docs/BOOK_ES_ET_PLAN.md 4a): a crossing's run reads the step it runs for and how many the change passed
        const J = JSON.stringify;
        const sysC = S.cleanSystem({ v: 1, name: 'C', fields: [{ id: 'f_hp', key: 'HP', label: 'HP', kind: 'resource', maxFormula: '10', def: 'max', min: -40 }, { id: 'f_n', key: 'N', label: 'N', kind: 'number', def: 0 }],
            rolls: [{ id: 'r_dc', label: 'Death check', formula: '3d6 + CrossStep - Crossed', cross: { f: 'f_hp', at: '-HP.max', step: 'HP.max', count: 2 }, then: [{ f: 'f_n', formula: 'CrossStep * 10 + Crossed', set: true }] },
                { id: 'r_a', label: 'A', apply: [{ f: 'f_n', formula: 'CrossStep', set: true }] }], sheet: { sections: [] } }, { F, gmView: true });
        const ch = { id: 'c', values: {} }, v0 = S.makeResolver(sysC, ch, F, null), v1 = S.makeResolver(sysC, ch, F, S.withCross(null, { step: 2, n: 3 })), v2 = S.makeResolver(sysC, ch, F, S.withCross({ combat: { round: 4 } }, { step: 1.7, n: -2 }));
        const rd = [v0('CrossStep'), v0('Crossed'), v1('CrossStep'), v1('Crossed'), v1('crossstep'), v2('CrossStep'), v2('Crossed'), v2('CombatRound')], ra = S.resolveAll(sysC, ch, F, S.withCross(null, { step: 3, n: 2 })).vars;   // found live: the whole sheet's resolver, which an action is worked out with, reads them too
        rd.push(ra('CrossStep'), ra('Crossed'), S.resolveAll(sysC, ch, F, null).vars('CrossStep'));
        const vr = S.validateSystem(sysC, F), errs = Array.isArray(vr) ? vr : (vr && Array.isArray(vr.errors) ? vr.errors : []);
        const vOk = errs.some(e => e.id === 'r_a' && /"CrossStep" is known only in a roll or an action that runs When a value crosses\./.test(e.message)) && !errs.some(e => e.id === 'r_dc');
        const sysK = S.cleanSystem({ v: 1, name: 'K', fields: [{ id: 'f_k', key: 'CrossStep', label: 'K', kind: 'number', def: 5 }], rolls: [], sheet: { sections: [] } }, { F, gmView: true });
        const own = S.makeResolver(sysK, { id: 'c', values: {} }, F, S.withCross(null, { step: 2, n: 1 }))('CrossStep');
        const tc0 = { facing: 1 }, same = S.withCross(tc0, 'x') === tc0 && S.withCross(tc0, null) === tc0 && J(S.withCross(tc0, { step: 2, n: 1 })) === J({ facing: 1, cross: { step: 2, n: 1 } }) && J(tc0) === J({ facing: 1 });
        check('1.6.0 CrossStep and Crossed (docs/BOOK_ES_ET_PLAN.md 4a): a crossing\'s run reads the step it runs for and how many steps the change passed, laid on its token context by withCross (whole numbers 0 to 999, nothing else of the context changed, the context handed in left as it was); with no crossing both read 0, so a press or a reminder works the formula out; a field of the system\'s own named CrossStep keeps its name; the validator knows the two names in a rule that runs When a value crosses, its formula and its Then, and says they are known only there anywhere else',
            J(rd) === J([0, 0, 2, 3, 2, 1, 0, 4, 3, 2, 0]) && vOk && own === 5 && same, J([rd, errs.map(e => [e.id, e.message]), own, same]));
    }
    {   // 1.6.0: a set of places in a row's own-values form, one button a place (sheets.js placeBtns and rfUnlabel, sliced by their rfplaces markers and run for real)
        const J = JSON.stringify, shP = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n'), pa = shP.indexOf('// [systemcheck:rfplaces-start]'), pz = shP.indexOf('// [systemcheck:rfplaces-end]');
        const mkEl = (tag, cls, txt) => { const e = { tagName: tag.toUpperCase(), className: cls || '', textContent: txt === undefined ? '' : txt, children: [], attrs: {}, on: {}, disabled: false, type: '',
            get firstChild() { return this.children[0] || null; }, get lastChild() { return this.children[this.children.length - 1] || null; },
            appendChild(c) { const p = c.parent; if (p) p.children.splice(p.children.indexOf(c), 1); c.parent = this; this.children.push(c); return c; }, replaceChild(n, o) { const i = this.children.indexOf(o); n.parent = this; this.children[i] = n; return o; },
            setAttribute(k, v) { this.attrs[k] = String(v); }, addEventListener(k, f) { this.on[k] = f; } }; return e; };
        const P = new Function('el', shP.slice(pa, pz) + '\nreturn { placeBtns: placeBtns, rfUnlabel: rfUnlabel };')(mkEl);
        const sent = [], st = { key: 'Covers', set: true, labels: ['Head', 'Body', 'Left hand', 'Right hand'] }, box = P.placeBtns(st, 5, n => sent.push(n), false);
        const words = box.children.map(b => [b.textContent, b.attrs['aria-pressed'], /\bon\b/.test(b.className), b.type]);
        box.children[1].on.click(); box.children[0].on.click(); box.children[3].on.click();
        const lockB = P.placeBtns(st, 2, n => sent.push('no'), true), noNames = P.placeBtns({ key: 'X', set: true }, 'x', () => {}, false), wide = P.placeBtns({ key: 'Y', set: true, labels: new Array(20).fill('p') }, 1, () => {}, false);
        const grid = mkEl('div', 'sheet-rf-grid'), lab = grid.appendChild(mkEl('label', 'sheet-rf-f')), cap = lab.appendChild(mkEl('span', 'sheet-rf-cap', 'Covers')), bx = lab.appendChild(box); P.rfUnlabel(grid);
        const grid2 = mkEl('div', 'g'), dv = grid2.appendChild(mkEl('div', 'x')); P.rfUnlabel(grid2); P.rfUnlabel(mkEl('div', 'empty'));
        check('1.6.0 a set of places in a row\'s own-values form (sheets.js placeBtns and rfUnlabel, run for real): one button a place named by the stat\'s value names, pressed in where the row takes that place (aria-pressed and the gold of a tool that is on); a press sends the set with that place taken or given back; a stat the GM holds draws its buttons off; with no value names one place, at most 16; the form\'s label around them made a div, so a press on its caption presses nothing, its caption and buttons kept in order; a wrapper that is no label left alone',
            J(words) === J([['Head', 'true', true, 'button'], ['Body', 'false', false, 'button'], ['Left hand', 'true', true, 'button'], ['Right hand', 'false', false, 'button']]) && J(sent) === J([7, 4, 13])
            && lockB.children.every(b => b.disabled) && J(noNames.children.map(b => [b.textContent, b.attrs['aria-pressed']])) === J([['Place 1', 'false']]) && wide.children.length === 16
            && grid.children.length === 1 && grid.children[0].tagName === 'DIV' && grid.children[0].className === 'sheet-rf-f sheet-rf-wide' && grid.children[0].children[0] === cap && grid.children[0].children[1] === bx
            && grid2.children[0] === dv && shP.includes('ctl = placeBtns(s, typeof mine === \'number\' ? mine : bv, put, lock);') && shP.includes('ctl = placeBtns(s, typeof mine === \'number\' ? mine : dv, put, false);') && (shP.match(/if \(s\.set === true\) rfUnlabel\(grid\);/g) || []).length === 2,
            J([words, sent, noNames.children.length, wide.children.length, grid.children.map(x => [x.tagName, x.className])]));
    }
    {   // 1.6.0: a roll bonus aimed at one roll of a list, by its label (the campaign build: Aimed a turn on a weapon's Attack, not its Damage)
        const J = JSON.stringify;
        const sysW = S.cleanSystem({ v: 1, name: 'W', fields: [{ id: 'f_w', key: 'Weapons', label: 'Weapons', kind: 'item-list', list: { rolls: [{ label: 'Attack', formula: '3d6' }, { label: 'Damage', formula: '2d6' }, { label: 'Parry', formula: '3d6' }] } }],
            items: [{ id: 'i_b', name: 'Blaster', key: 'Blaster', rollSw: [{ name: 'Aimed', v: 2, to: [{ l: 'f_w', roll: '  attack ' }] }, { name: 'Any', v: 1, to: [{ l: 'f_w' }] }, { name: 'Gone', v: 1, to: [{ l: 'f_w', roll: 'Feint' }] }] }], sheet: { sections: [] } }, { F, gmView: true });
        const kept = J(sysW.items[0].rollSw.map(s => s.to)), ch = { id: 'c', values: { f_w: [{ id: 'r1', defId: 'i_b', qty: 1 }] } };
        const at = i => S.rollSwitches(sysW, ch, { l: 'f_w', row: 'r1', i: i }).map(w => w.name), noI = S.rollSwitches(sysW, ch, { l: 'f_w', row: 'r1' }).map(w => w.name);
        const jA = S.swJudge(sysW, ch, { l: 'f_w', row: 'r1', i: 0 }, [{ s: 'f_w|r1', i: 0 }]), jD = S.swJudge(sysW, ch, { l: 'f_w', row: 'r1', i: 1 }, [{ s: 'f_w|r1', i: 0 }]);
        const nt = fs.readFileSync(path.join(app, 'scripts', 'net.js'), 'latin1');
        check('1.6.0 a roll bonus on one roll of a list (the campaign build: Aimed a turn helps a weapon\'s Attack and not its Damage or Parry): the cleaner keeps a list target\'s roll as its label; the bonus offers itself to that list roll alone, by its label in any case, and to no roll with no index; a bonus with no roll named offers itself to every roll on the row; one naming a roll the list does not have offers itself to none; the host judges a tick by the roll\'s index on both ways a roll comes in',
            kept === J([[{ l: 'f_w', roll: 'attack' }], [{ l: 'f_w' }], [{ l: 'f_w', roll: 'Feint' }]]) && J([at(0), at(1), at(2), noI]) === J([['Aimed', 'Any'], ['Any'], ['Any'], ['Any']])
            && jA.ok && jA.v === 2 && !jD.ok && nt.includes("{ l: q.row.f, row: q.row.r, i: q.row.i }, q.sw)") && nt.includes("{ l: String(o.row.f), row: String(o.row.r), i: typeof o.row.i === 'number' ? o.row.i : undefined }"),
            J([kept, at(0), at(1), at(2), noI, jA, jD]));
    }
    {   // 1.6.3 (the improvement week's review of sheets and rolls, findings 38 and 32): an apply card leaves out a value the change left where it stood,
        // and a value's breakdown leaves out a change of +0 and names a value it moved by its label (applyAct and fxText, run for real)
        const sysU = S.cleanSystem({ v: 1, name: 'U', fields: [{ id: 'f_bl', key: 'Bleed', label: 'Bleeding wounds', kind: 'number', vis: 'all', edit: 'owner' }, { id: 'f_hp', key: 'HP', label: 'Health', kind: 'number', vis: 'all', edit: 'owner' }, { id: 'f_tt', key: 'ToughT', label: 'Toughness', kind: 'number', vis: 'all', edit: 'owner' }],
            rolls: [{ id: 'r_mix', label: 'Patch', apply: [{ f: 'f_bl', formula: '0', set: true }, { f: 'f_hp', formula: '2', add: true }] }, { id: 'r_same', label: 'Rest', apply: [{ f: 'f_bl', formula: '0', set: true }] }] }, { F, gmView: true });
        const chU = { id: 'c_u', name: 'Kael', values: { f_bl: 0, f_hp: 5 } }, rollU = id => sysU.rolls.filter(r => r.id === id)[0];
        const mix = S.applyAct(sysU, chU, rollU('r_mix'), S.makeResolver(sysU, chU, F, null), F, null, null, undefined, null), same = S.applyAct(sysU, chU, rollU('r_same'), S.makeResolver(sysU, chU, F, null), F, null, null, undefined, null);
        check('1.6.3 (finding 38) an apply card leaves out a value the change left where it stood (Bleeding wounds set to 0 when it was 0), so long as something else moved; a press that moved nothing still says what it set, as before',
            mix.ok === true && j(mix.lines.map(l => l.n)) === j(['Health']) && mix.values.f_hp === 7 && same.ok === true && j(same.lines.map(l => [l.n, l.v])) === j([['Bleeding wounds', 0]]), j([mix, same]));
        const eU = { base: 10, mods: [{ name: 'Stamina', op: 'add', v: 0 }, { name: 'Rage', op: 'add', v: 2 }], via: [{ name: 'Tough', op: 'add', v: 2, through: 'ToughT' }, { name: 'Calm', op: 'add', v: 0, through: 'ToughT' }] };
        check('1.6.3 (finding 32) a value\'s breakdown leaves out a change of +0 and, with the sheet\'s system handed in, names the value it moved by its label; with none it reads as before; with only changes of +0 it says nothing',
            S.fxText(eU, false, sysU) === '10 base · Rage +2 · Tough +2 on Toughness' && S.fxText(eU) === '10 base · Rage +2 · Tough +2 on ToughT' && S.fxText({ base: 4, mods: [{ name: 'Stamina', op: 'add', v: 0 }], via: [] }) === '', S.fxText(eU, false, sysU));
        // 1.6.3 (finding 41): a grayed die beside a field says why in one plain sentence (sheets.js rollWhyNot, sliced and run for real), its press says it
        // (the field roll is a gray button greyPress hears), and its words never fall back to the field's key
        const shW = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), rwSrc = shW.slice(shW.indexOf('function rollWhyNot(c) {'), shW.indexOf('// Stage 6 HUD H7: a viewer who may press an apply action'));
        const why = (win, client, me, c) => new Function('window', 'isClient', 'myId', rwSrc + '\nreturn rollWhyNot;')(win, () => client, () => me)(c);
        const wDice = { wpDice: { rollFor() {} } }, wOff = { wpDice: { rollFor() {} }, wpVtt: { on: k => k !== 'dice' } };
        check('1.6.3 (finding 41) a grayed field roll says why: dice off at this table, rolls open once the character is done (finding 22, moved on purpose), not your character; the gray press hears a field\'s die; no key in its words',
            why(wOff, true, 'u1', { ownerId: 'u1' }) === 'Dice are off at this table.' && why(wDice, true, 'u1', { ownerId: 'u1', making: 1 }) === 'Rolls open once the character is done.' && why(wDice, true, 'u1', { ownerId: 'u2' }) === 'This is not your character to roll for.' && why({}, false, '', {}) === 'Dice are not available here.'
            && shW.includes("var GREY_BTN = '.sheet-roll, .sheet-roll-mod, .sheet-item-roll, .sheet-field-roll';") && shW.includes("rb.disabled = !canRoll(c); rb.title = rb.disabled ? (typeof rollWhyNot === 'function' ? rollWhyNot(c) : '(dice are off here, or this is not your character)') : 'Roll ' + (f.label || 'this field') + ' · shift-click to add a modifier';") && !shW.includes("'Roll ' + (f.label || f.key)"));
    }

    await T.finish();
})();
