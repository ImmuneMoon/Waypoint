/* Offline check of a band of side vision that notices by a roll (1.6.0). The owner, 2026-10-31: "if the checks for peripheral vision arent a part of
   the sotmw system yet, they need to be"; the rule came from the game system's own session and is kept general here: a system sets it on a sense, off
   unless it does. noticecore.js and notice.js are run for real on stand-ins of the page, and systemcore.js for what a system keeps; the wiring is pinned. */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const dir = path.join(__dirname, '..'), scripts = path.join(dir, 'system', 'app', 'scripts');
let pass = 0, fail = 0, summed = false;
function check(name, ok, info) { if (ok) { pass++; console.log('ok        ' + name); } else { fail++; console.log('FAIL      ' + name + (info !== undefined ? ' -> ' + info : '')); } }
process.on('exit', () => { if (!summed) { console.log('the suite ended before its summary'); process.exitCode = 1; } });
const read = f => fs.readFileSync(path.join(scripts, f), 'utf8').replace(/\r\n/g, '\n');
const readLat = f => fs.readFileSync(path.join(scripts, f), 'latin1').replace(/\r\n/g, '\n');
const J = JSON.stringify;

async function loadCopies() {   // the modules in a folder of their own, so that their imports find each other as plain .mjs files
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-notice-'));
    const sub = t => t.replace(/from '\.\/([a-z]+)\.js'/g, "from './$1.mjs'");
    ['noticecore', 'steplog'].forEach(n => fs.writeFileSync(path.join(tmp, n + '.mjs'), sub(read(n + '.js')), 'utf8'));
    fs.writeFileSync(path.join(tmp, 'notice.mjs'), sub(read('notice.js')), 'utf8');
    const url = n => 'file://' + path.join(tmp, n + '.mjs').replace(/\\/g, '/');
    return { C: await import(url('noticecore')), N: await import(url('notice')) };
}

/* a small world: V a player's token with a sheet, T a creature in its band, on a map; the formula engine, the dice and the fog are the suite's own */
function world(opts) {
    opts = opts || {};
    const rolled = [], recs = [], arms = [], W = { rolled, recs, arms, clock: 1000, pass: opts.pass !== false, facts: { light: 2, cover: 0 }, fight: false, sneak: false };
    const check1 = { check: '3d6 <= 10', sneak: 'Sneaking', stealth: { r: 'stealth' } };
    const camp = { system: { combat: { checks: '', senses: { list: [{ id: 'sn_b', notice: check1 }, { id: 'sn_plain' }] } } }, chars: { c1: { id: 'c1', name: 'Ava' }, c2: { id: 'c2', name: 'Bandit' } }, items: {} };
    const V = { id: 'V', isChar: true, charId: 'c1', ownerId: 'p1', x: 0, y: 0 }, T = { id: 'T', isChar: true, charId: 'c2', name: 'Bandit', x: 100, y: 0 }, map = { id: 'm1', type: 'map', whiteboard: [V, T] };
    camp.items.m1 = map;
    const S = {
        rangeCtx: () => ({ mod: -2, dist: 9 }), withRange: (t, r) => Object.assign({}, t, { range: r }), withAttempt: (t, m) => Object.assign({}, t, { att: m }),
        makeResolver: (s, ch, F, tc) => ({ tc, ch }), thenMargin: vd => vd.margin,
        rollSwitches: (s, ch, ref, all) => all.filter(a => a.to[0].r === ref.r),
    };
    const F = { evaluate: (text, o) => { if (text === 'Sneaking') return { ok: true, value: W.sneak }; rolled.push(o.vars.tc); return { ok: true, value: W.pass }; } };
    const Dc = { checkOf: () => ({ pass: W.pass, total: 9, target: 10 }), ruleOf: () => '' };
    const D = {
        host: () => opts.host !== false, S: () => S, F: () => F, dice: () => Dc, fog: () => ({ noticeFacts: () => W.facts }), fightOf: () => W.fight, ctxFor: () => ({}), ground: () => 0, elev: () => true,
        rec: (w, x, d) => recs.push([w, x, d]), arm: id => arms.push(id), now: () => W.clock, every: () => 7, stop: () => {}, log: () => {},
    };
    W.notice = null; W.camp = camp; W.map = map; W.V = V; W.T = T; W.D = D;
    W.by = { 'c5': [{ t: 'V', ids: ['sn_b'] }] };
    W.key = w => (w === T ? W.cell || 'c5' : 'c0');
    W.judge = (un) => { const j = W.notice.pass(map, camp, 'p1', W.by, W.key, () => un || null, true); return j.missed(T, W.cell || 'c5'); };
    return W;
}

(async () => {
    const { C, N } = await loadCopies();

    /* ---------- the rule ---------- */
    check('moving: a creature that never moved is still', C.moving({ at: 0, turns: 0 }, 9e9, false) === false && C.moving(null, 9e9, true) === false);
    check('moving: out of a fight it counts for a few seconds after its last move, in a fight until the end of its next turn',
        C.moving({ at: 100 }, 100 + C.STILL_MS - 1, false) === true && C.moving({ at: 100 }, 100 + C.STILL_MS, false) === false
        && C.moving({ at: 100, turns: 1 }, 9e9, true) === true && C.moving({ at: 100, turns: 2 }, 9e9, true) === false);
    const d0 = C.decide(undefined, { sig: 'a' });
    check('a still creature with no result is rolled for, at no margin', d0.roll === true && d0.m === 0);
    check('something moving is noticed with no roll', J(C.decide(undefined, { moving: true, sig: 'a' }).e) === J({ ok: true, by: 'move', sig: 'a' }));
    const okE = { ok: true, by: 'roll', sig: 'a' }, noE = { ok: false, by: 'roll', sig: 'a' };
    check('a result sticks while nothing changes', C.decide(okE, { sig: 'a' }).e === okE && C.decide(noE, { sig: 'a' }).e === noE);
    check('the light or the cover changing ends either result', C.decide(okE, { sig: 'b' }).roll === true && C.decide(noE, { sig: 'b' }).roll === true);
    check('moving ends a failure at once, and a success stands', C.decide(noE, { moving: true, sig: 'a' }).e.ok === true && C.decide(noE, { moving: true, sig: 'a' }).e.by === 'move' && C.decide(okE, { moving: true, sig: 'a' }).e === okE);
    check('a creature noticed by moving is rolled for once it stops', C.decide({ ok: true, by: 'move', sig: 'a' }, { sig: 'a' }).roll === true);
    const sk = { n: 3, ok: true, m: 4 };
    check('a sneak with a made roll is checked at minus their margin, once for each Stealth roll', J(C.decide(undefined, { sneak: sk, sig: 'a' })) === J({ roll: true, m: 4, sn: 3 }));
    const skE = { ok: false, by: 'roll', sig: 'a', sn: 3 };
    check('a sneak stays as the check left them while they move on the same roll', C.decide(skE, { sneak: sk, moving: true, sig: 'a' }).e === skE);
    check('a new Stealth roll is checked afresh', C.decide(skE, { sneak: { n: 4, ok: true, m: 1 }, sig: 'a' }).roll === true);
    check('a sneak who failed their roll has lost: noticed with no check', C.decide(undefined, { sneak: { n: 5, ok: false, m: 0 }, sig: 'a' }).e.ok === true);
    check('a live move: anything but a sneak is noticed, and a sneak only by a result that says so', C.moveSeen(undefined, false) === true && C.moveSeen(undefined, true) === false && C.moveSeen({ ok: true }, true) === true && C.moveSeen({ ok: false }, true) === false);

    /* ---------- the host's half ---------- */
    let W = world(); W.notice = N.make(W.D);
    check('it is on only where a system sets it', W.notice.on(W.camp) === true && W.notice.on({ system: { combat: { senses: { list: [{ id: 'x' }] } } } }) === false && W.notice.on({ system: {} }) === false);
    check('no result is rolled on a machine that does not host', (() => { const w = world({ host: false }); w.notice = N.make(w.D); return w.notice.pass(w.map, w.camp, 'p1', w.by, w.key, () => null, true) === null && w.rolled.length === 0; })());
    W.pass = false;
    check('a still creature that fails the check is left out', W.judge() === true && W.rolled.length === 1);
    check('the check names it in the record, with whose check it was and nothing sent', J(W.recs[0]) === J(['Ava', 'Did not notice Bandit', 'Side vision check: 9 against 10']));
    check('the check reads the range, the light, the cover and the attempt\'s margin', (() => { const t = W.rolled[0]; return t.range.mod === -2 && t.range.dist === 9 && t.range.light === 2 && t.range.cover === 0 && t.range.tid === 'T' && t.att === 0; })());
    W.pass = true;
    check('it is once per viewer per creature, the result kept', W.judge() === true && W.rolled.length === 1);
    W.facts = { light: 0, cover: 0 };
    check('the light changing rolls again', W.judge() === false && W.rolled.length === 2);
    W.facts = { light: 0, cover: 1 }; W.pass = false;
    check('moving into cover rolls again', W.judge() === true && W.rolled.length === 3);
    W.cell = 'c6'; W.by = { c6: [{ t: 'V', ids: ['sn_b'] }] }; W.clock += 100;
    check('moving noticed it, with no roll', W.judge() === false && W.rolled.length === 3);
    W.clock += C.STILL_MS; W.notice.tick();
    check('once it has stopped what the player holds is put right', J(W.arms) === J(['m1']));
    check('... and it is checked again', W.judge() === true && W.rolled.length === 4);
    W.fight = true; W.cell = 'c7'; W.by = { c7: [{ t: 'V', ids: ['sn_b'] }] }; W.clock += 100; W.judge(); W.notice.turnEnd('m1', 'T');
    check('in a fight the turn it moved in does not stop it', W.judge() === false);
    W.arms.length = 0; W.notice.turnEnd('m1', 'T');
    check('its next turn\'s end does', J(W.arms) === J(['m1']) && W.judge() === true);
    W.fight = false;
    W.by = {}; W.notice.pass(W.map, W.camp, 'p1', W.by, W.key, () => null, true);
    check('a creature that leaves the band, or a viewer who turns away, lets the result go', Object.keys(W.notice.state.res.m1.V).length === 0);
    W.by = { c7: [{ t: 'V', ids: ['sn_b'] }] }; const n5 = W.rolled.length; W.clock += C.STILL_MS; W.judge();
    check('and one who comes back rolls again', W.rolled.length === n5 + 1);
    check('the party\'s view lets nothing go', (() => { const w = world(); w.notice = N.make(w.D); w.judge(); w.notice.pass(w.map, w.camp, 'p1', {}, w.key, () => null, false); return Object.keys(w.notice.state.res.m1.V).length === 1; })());

    W = world(); W.notice = N.make(W.D); W.sneak = true; W.pass = true;
    check('a creature marked as sneaking with no roll held is read as any other', W.judge() === false && W.rolled.length === 1 && W.rolled[0].att === 0);
    W.notice.stealth(W.camp, 'c2', { r: 'stealth' }, { kind: 'check', pass: true, margin: 4 }, false);
    check('a Stealth roll has what it reaches judged afresh', J(W.arms) === J(['m1']));
    W.pass = false;
    check('each viewer is checked at minus its margin', W.judge() === true && W.rolled[1].att === 4);
    W.cell = 'c6'; W.by = { c6: [{ t: 'V', ids: ['sn_b'] }] }; W.clock += 100; W.pass = true;
    check('moving on the same roll stays unnoticed', W.judge() === true && W.rolled.length === 2);
    const jm = W.notice.pass(W.map, W.camp, 'p1', W.by, W.key, () => null, true);
    check('a live move of a sneak the check missed is not relayed', jm.moved(W.T, 'c6') === false);
    W.notice.stealth(W.camp, 'c2', { r: 'stealth' }, { kind: 'check', pass: false, margin: 3 }, false);
    check('a failed Stealth roll is noticed with no check', W.judge() === false && W.rolled.length === 2);
    const n6 = W.notice.state.seq; W.notice.stealth(W.camp, 'c2', { r: 'other' }, { kind: 'check', pass: true, margin: 3 }, false);
    check('another roll is no Stealth roll', W.notice.state.seq === n6);
    W.sneak = false; W.judge();
    check('a sneak who stops sneaking lets their roll go', Object.keys(W.notice.state.sn).length === 0);

    W = world(); W.notice = N.make(W.D);
    check('the GM\'s tick wins: nothing is rolled for a sense ticked for that token', W.judge(['sn_b']) === true && W.rolled.length === 0);
    check('a band with no check notices, as it does by the tick alone', (() => { const w = world(); w.notice = N.make(w.D); w.by = { c5: [{ t: 'V', ids: ['sn_plain'] }] }; return w.judge() === false && w.rolled.length === 0; })());
    check('one viewer noticing is enough', (() => { const w = world(); w.notice = N.make(w.D); w.pass = true; w.map.whiteboard.push({ id: 'V2', isChar: true, charId: 'c1', ownerId: 'p1', x: 0, y: 0 }); w.by = { c5: [{ t: 'V', ids: ['sn_b'] }, { t: 'V2', ids: ['sn_b'] }] }; return w.judge() === false && w.rolled.length === 1; })());
    check('a viewer with no sheet has nothing to roll, and notices', (() => { const w = world(); w.notice = N.make(w.D); delete w.V.charId; return w.judge() === false && w.rolled.length === 0; })());
    check('a hidden creature is no business of the band', (() => { const w = world(); w.notice = N.make(w.D); w.T.hidden = true; return w.judge() === false && w.rolled.length === 0; })());
    check('a check that cannot be worked out hides nothing', (() => { const w = world(); w.notice = N.make(w.D); const s = w.D.F; w.D.F = () => ({ evaluate: t => t === 'Sneaking' ? { ok: true, value: false } : { ok: false } }); const r = w.judge(); w.D.F = s; return r === false; })());
    W.notice.forget();
    check('a new table holds nothing of the last', Object.keys(W.notice.state.res).length === 0 && Object.keys(W.notice.state.sn).length === 0);

    /* ---------- what a system keeps ---------- */
    const copy = () => { const t = fs.mkdtempSync(path.join(os.tmpdir(), 'wp-notsys-')), all = {}; fs.readdirSync(scripts).filter(f => f.endsWith('.js')).forEach(f => { all[f] = 1; fs.writeFileSync(path.join(t, f.replace(/\.js$/, '.mjs')), read(f).replace(/from '\.\/([a-z0-9]+)\.js'/g, "from './$1.mjs'"), 'utf8'); }); return t; };
    const t = copy(), SC = await import('file://' + path.join(t, 'systemcore.mjs').replace(/\\/g, '/')), FM = await import('file://' + path.join(t, 'formula.mjs').replace(/\\/g, '/'));
    const F = FM.default && FM.default.evaluate ? FM.default : (FM.parse ? FM : FM);
    const sys = { v: 1, name: 'X', fields: [{ id: 'f_spot', key: 'Spot', kind: 'number', label: 'Spot' }, { id: 'f_sn', key: 'Sneaking', kind: 'toggle', label: 'Sneaking' }, { id: 'f_list', key: 'Skills', kind: 'item-list', label: 'Skills', list: {} }], rolls: [{ id: 'r_s', label: 'Stealth', formula: '3d6 <= 10' }], sheet: { sections: [] },
        combat: { blastAuto: 'full', senses: { list: [{ id: 'sn_aaaaaaaa', name: 'Side', range: { by: 'eyes' }, grade: 'full', shows: 'side', notice: { check: '3d6 <= Spot - 2 + TargetSize + TargetLight - TargetCover - AttemptMargin', sneak: 'Sneaking', stealth: { l: 'f_list', key: 'stealth' } } }] } } };
    const gmV = SC.cleanSystem(sys, { F, gmView: true }), plV = SC.cleanSystem(sys, { F, gmView: false });
    const nG = gmV.combat.senses.list[0].notice;
    check('the GM\'s view keeps the check, the mark and the roll', J(nG) === J(sys.combat.senses.list[0].notice), J(nG));
        check('no player is ever told what is rolled against them', J(plV).indexOf('notice') < 0 && J(plV).indexOf('TargetLight') < 0);
    const bad = v => { const s = JSON.parse(J(sys)); s.combat.senses.list[0].notice = v; return SC.cleanSystem(s, { F, gmView: true }).combat.senses.list[0].notice; };
    check('a check that does not read is no check, and nothing is kept with it', bad({ check: '3d6 <= (', sneak: 'Sneaking' }) === undefined && bad({ sneak: 'Sneaking' }) === undefined && bad('x') === undefined);
    check('a mark that rolls dice is no mark, and a roll goes with its mark', J(bad({ check: '3d6 <= 9', sneak: '1d6 > 1', stealth: { r: 'r_s' } })) === J({ check: '3d6 <= 9' }));
    const named = JSON.parse(J(sys)); named.combat.senses.list[0].notice.stealth = { r: 'r_s' };
    const nG2 = SC.cleanSystem(named, { F, gmView: true }), nP2 = SC.cleanSystem(named, { F, gmView: false });
    check('a sneak roll names itself as it is rolled, on a player\'s copy too, which says nothing of why', nG2.rolls[0].named === true && nP2.rolls[0].named === true && J(nP2).indexOf('notice') < 0 && SC.cleanSystem(nP2, { F, gmView: false }).rolls[0].named === true);
    check('no other roll does', SC.cleanSystem(sys, { F, gmView: true }).rolls[0].named === undefined);
    const off = JSON.parse(J(sys)); off.combat.senses.list[0].shows = 'dim';
    check('only a band of side vision keeps it', SC.cleanSystem(off, { F, gmView: true }).combat.senses.list[0].notice === undefined);
    const none = JSON.parse(J(sys)); delete none.combat.senses.list[0].notice;
    check('a system that sets none keeps none', J(SC.cleanSystem(none, { F, gmView: true })).indexOf('notice') < 0);
    const vr = SC.validateSystem(gmV, F), msgs = (vr.errors || vr || []).map(e => e.message).join(' | ');
    check('its names are known in the check', msgs.indexOf('TargetLight') < 0 && msgs.indexOf('AttemptMargin') < 0, msgs);
    const elsewhere = JSON.parse(J(gmV)); elsewhere.rolls[0].formula = '3d6 <= TargetLight';
    const m2 = (SC.validateSystem(elsewhere, F).errors || []).map(e => e.message).join(' | ');
    check('and nowhere else', /known only in a side vision check/.test(m2), m2);
    const keyed = JSON.parse(J(sys)); keyed.fields.push({ id: 'f_tl', key: 'TargetLight', kind: 'number', label: 'L' }); keyed.rolls[0].formula = '3d6 <= TargetLight';
    const m3 = (SC.validateSystem(SC.cleanSystem(keyed, { F, gmView: true }), F).errors || []).map(e => e.message).join(' | ');
    check('a field of that name keeps its name', !/side vision check/.test(m3), m3);
    const res = SC.makeResolver(gmV, { id: 'c', values: { f_spot: 12 } }, F, SC.withAttempt(SC.withRange({}, { mod: 0, dist: 1, size: 2, light: 1, cover: 1 }), 3));
    check('a check reads what the host lays on it', res('targetlight') === 1 && res('targetcover') === 1 && res('targetsize') === 2 && res('attemptmargin') === 3);
    fs.rmSync(t, { recursive: true, force: true });

    /* ---------- the wiring ---------- */
    const fog = read('fog.js'), net = readLat('net.js'), sh = read('sheets.js'), page = fs.readFileSync(path.join(dir, 'system', 'app', 'index.html'), 'utf8'), rd = f => { try { return fs.readFileSync(path.join(dir, f), 'utf8'); } catch (e) { return null; } };
    check('what a player is sent, and a live move, ask the same judge', /nj && nj\.missed\(w, tk\)/.test(fog) && /ce\.nj && !ce\.nj\.moved\(w, pk\)/.test(fog));
    check('the host hears a sneak\'s roll from a player and from its own', net.split('window.wpNotice.stealth(').length === 3);
    check('a creature stops moving by its turn, a new table starts clean, and a result that changes what is held is sent', /window\.wpNotice\.turnEnd\(mapId, row\.tokId\)/.test(net) && /function fogForgetAll\(\) \{ if \(typeof window !== 'undefined' && window\.wpNotice\) window\.wpNotice\.forget\(\);/.test(net) && /net\.noticeArm = function\(mapId\) \{ fogArm\(mapId\); \};/.test(net));
    check('the sheet names such a roll as it is pressed', sh.indexOf('if (r.needs || r.named) { oR = oR || {}; oR.act = r.id; }') >= 0);
    check('the module is in the page', page.indexOf('<script type="module" src="scripts/notice.js"></script>') > 0);
    check('the System editor offers it on a band alone', /if \(s\.shows === 'side' && !mark\) wrap\.appendChild\(noticeRow\(s, i\)\);/.test(sh));
    check('Help says it', /<b>Noticed by<\/b> gives a band a check of your own/.test(page) && /<b>Sneaking where<\/b>/.test(page));
    const g = rd('CAMPAIGN_INTEGRATION.md');
    check('the guide says it', !!g && /"notice"/.test(g) && /TargetLight/.test(g));
    ['WHATSNEW.txt', 'system/app/assets/whatsnew.txt'].forEach(f => check(f + ' says it', /Noticed by/.test(rd(f) || '')));
    check('the record names each check as hidden from players', /window\.wpRecord\.add\('roll', who, what, detail, true\)/.test(read('notice.js')));

    console.log(pass + ' passed, ' + fail + ' failed.');
    summed = true;
    if (fail) process.exitCode = 1;
})().catch(e => { console.log('FAIL      ' + (e && e.stack || e)); summed = true; process.exitCode = 1; });
