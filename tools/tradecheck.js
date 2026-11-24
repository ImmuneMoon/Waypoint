'use strict';
/* tradecheck.js: trade and money, the tests that came out of systemcheck.js and netcheck.js with their area (docs/REFACTOR_SPLIT_PLAN.md,
   area 6, "Tests move with their area", 2026-11-18). A trade moves rows and money between two characters once both sides confirm; a
   sheet's money is held in a list with a Money box and moves by the site's own rules. The code lives in parts of the giant scripts,
   each read here by its own name: tradecore.js and moneycore.js (parts of systemcore.js), imported from a private copy of
   systemcore.js and its parts (tools/checkkit.js fresh) so each runs as the module it is with the real split wiring, their functions
   run through systemcore.js, which installs them and is the only way to reach them; and nettrade.js (a part of net.js), whose trade
   lines the host's block cuts by its name. Slices of other areas (the host's trade branch and a player's tradeState branch, which
   stand in handleMessage, and the off-turn lines) still read the joined net.js through srcjoin, as the suites always have; the
   blocks that read sheets.js, style.css, index.html and the release notes read them as they always did.
   What it covers, each block as it stood in its giant: from systemcheck.js, trading (Split in trades, what a side may offer, an
   offer cleaned, tradeApply and where an amount lands), a row traded whole with the rows it granted and the parts it holds, buying
   and selling (the Money box, moneyHeld and moneyMove by the site's rules, a row op's price), a list roll's Then that moves the
   sheet's money and what it asks of the money before any die (moneyDue; its code stays in systemcore.js beside applyAct, but it is
   money's), and Price from, a list's price read from one of its own columns (priceColOf); from netcheck.js, trading on the wire
   (the host's trade branch, tradeDo and the API, and a player's tradeState branch, run for real).
   A failure prints its whole detail, as netcheck printed it (kit.suite('whole')): the host's block says every message sent.
   Usage: node tools/tradecheck.js   (exit 1 on any failure) */
require('./srcjoin').install();   // a split giant script reads joined, exactly as it was before the split (tools/srcjoin.js)
const kit = require('./checkkit');   // what the suites that came out of the giant ones share (tools/checkkit.js)
const path = require('path'), fs = require('fs');
const NL = String.fromCharCode(10);
const app = kit.APP, url = kit.url;
const T = kit.suite('whole'), check = T.check, pendingChecks = T.pending, packCheck = kit.packCheck;
const j = v => JSON.stringify(v);
// netcheck's joined net.js, which the host's block cuts its branches from (the trade lines themselves it reads from nettrade.js by name)
const { src } = kit.netSlices('tradecheck');
check('tradecheck: tradecore.js and moneycore.js are parts of systemcore.js and nettrade.js a part of net.js, each read by its own name', kit.part('tradecore.js').includes('\nfunction tradeApply(') && kit.part('moneycore.js').includes('\nfunction moneyMove(') && kit.part('nettrade.js').includes('// [netcheck:trade-start]') && kit.part('nettrade.js').includes('\nfunction tradeDo('));

(async () => {
    // The area's parts are imported by their own names from a private copy of systemcore.js and its parts (kit.fresh), so each runs as
    // the module it is, with the real split wiring, entered from the part as parsecheck enters it; their functions are then run through
    // systemcore.js, which installs the parts and is the only way to reach them
    const real = kit.fresh('systemcore.js', 'tradecheck');
    let P1 = null, P2 = null, S = null, F = null, err = null;
    try { P1 = await import(real('tradecore.js')); P2 = await import(real('moneycore.js')); S = await import(real('systemcore.js')); F = await import(url('formula.js')); } catch (e) { err = e; }
    check('tradecheck: tradecore.js and moneycore.js load by name as modules of their own in Node with no window, each with the install systemcore.js calls, and systemcore.js installs them (tradeApply and moneyMove reached through it)', !!P1 && typeof P1.tradeCore === 'function' && !!P2 && typeof P2.moneyCore === 'function' && !!S && typeof S.tradeApply === 'function' && typeof S.moneyMove === 'function' && !!F && !err, err && err.message);
    if (!S || !F) { await T.finish(); return; }
    const { LIMITS, validKey, cleanField, cleanSystem, cleanValue, cleanChar, cleanCharEdit, makeResolver, resolveAll, hoverLines, validateSystem, charFor, applyEdit, autoLayout, emptySystem } = S;   // the names systemcheck.js unpacks, which its blocks read

    {   // 1.5.6 trading (backlog 157): Split in trades, what a side may offer, an offer cleaned, and the trade itself (systemcore, run for real)
        const j = JSON.stringify, sysT = (gm) => S.cleanSystem({ v: 1, name: 'T', rolls: [], fields: [
            { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { trade: true, on: { label: 'Stowed' }, price: 'cr', stats: [{ key: 'cr', label: 'Cost' }, { key: 'pts', label: 'Points', split: true }, { key: 'kind', label: 'Kind', kind: 'pick', opts: [{ label: 'A' }], split: true }] } },
            { id: 'f_chips', key: 'Chips', label: 'Chips', kind: 'item-list', edit: 'owner', vis: 'all', list: { trade: true, multi: true, on: { label: 'Stowed' }, lvl: { label: 'Stored value', min: 0, max: 1000, step: 0.01, def: 0, split: true } } },
            { id: 'f_one', key: 'One', label: 'Feats', kind: 'item-list', edit: 'owner', vis: 'all', list: { trade: true, noQty: true } },
            { id: 'f_gmed', key: 'Gmed', label: 'Kept', kind: 'item-list', edit: 'gm', vis: 'all', list: { trade: true } },
            { id: 'f_sec', key: 'Sec', label: 'Secret', kind: 'item-list', edit: 'owner', vis: 'gm', list: { trade: true } },
            { id: 'f_skill', key: 'Skill', label: 'Skills', kind: 'item-list', edit: 'owner', vis: 'all', list: {} }],
            items: [{ id: 'i_lamp', name: 'Lamp', stats: { cr: 20, pts: 5 } }, { id: 'i_chip', name: 'Glimmer chip' }, { id: 'i_gm', name: 'Cursed', vis: 'gm' }, { id: 'i_bound', name: 'Collar', eq: 'bound' }, { id: 'i_ring', name: 'Ring', rm: 'bound' }, { id: 'i_feat', name: 'Feat' }] }, { F, gmView: gm });
        const sG = sysT(true), sP = sysT(false), noSplit = S.cleanSystem({ v: 1, name: 'T', rolls: [], fields: [{ id: 'f_chips', key: 'Chips', label: 'Chips', kind: 'item-list', edit: 'owner', vis: 'all', list: { lvl: { label: 'Stored', split: false, labels: ['x', 'y'] }, stats: [{ key: 'pts', label: 'P' }] } }] }, { F, gmView: true });
        check('1.5.6 trading, the builder option: Split in trades kept only as true, on a number stat and on a level with no value names, never on a choice; the same in both views; none where it is not ticked',
            sG.fields[1].list.lvl.split === true && sP.fields[1].list.lvl.split === true && sG.fields[0].list.stats[1].split === true && sP.fields[0].list.stats[1].split === true && sG.fields[0].list.stats[2].split === undefined && sG.fields[0].list.stats[0].split === undefined
            && noSplit.fields[0].list.lvl.split === undefined && noSplit.fields[0].list.stats[0].split === undefined && j(sG.fields[1].list) === j(sP.fields[1].list));
        const mk = () => ({ kael: { id: 'c_k', values: { f_chips: [{ id: 'w_k1', defId: 'i_chip', qty: 1, lvl: 500, on: false }, { id: 'w_k2', defId: 'i_chip', qty: 2, lvl: 5, on: false }], f_gear: [{ id: 'w_kc', defId: 'i_bound', qty: 1, on: true }, { id: 'w_kr', defId: 'i_ring', qty: 1, on: false }, { id: 'w_kk', defId: 'i_lamp', qty: 1, on: false, keptOn: 1 }], f_sec: [{ id: 'w_ks', defId: 'i_lamp', qty: 1 }], f_skill: [{ id: 'w_sk', defId: 'i_feat', qty: 1 }], f_gmed: [{ id: 'w_kg', defId: 'i_lamp', qty: 1 }] } },
            grunt: { id: 'c_g', npc: true, values: { f_gear: [{ id: 'w_g1', defId: 'i_lamp', qty: 5, on: true }, { id: 'w_g2', defId: 'i_gm', qty: 1 }, { id: 'w_g3', def: { name: 'Map scrap', stats: { pts: 3 } }, qty: 1 }], f_chips: [{ id: 'w_g9', defId: 'i_chip', qty: 1, lvl: 10, on: true }, { id: 'w_g8', defId: 'i_chip', qty: 1, lvl: 2, on: false }], f_one: [{ id: 'w_gf', defId: 'i_feat', qty: 1 }] } } });
        const W = mk(), oK = S.tradeOfferable(sG, W.kael, 'player'), oG = S.tradeOfferable(sG, W.grunt, 'gm'), byId = (l, id) => l.filter(e => e.rowId === id)[0];
        check('1.5.6 trading, tradeOfferable: only a list ticked Tradable (kept only as true, the same in both views), never a skill list left unticked; a player offers from lists players see and they may change, never a GM-only list or a list the GM edits; never a GM-only entry on either side; a row of quantity 1 offers its split figures, a stack none; a row that cannot be taken off is listed with its reason (a bound item on, a kept curse, a removal lock) for a player and offered by the GM; the list price where there is one',
            !oK.some(e => e.fid === 'f_sec' || e.fid === 'f_gmed' || e.fid === 'f_skill') && sG.fields[0].list.trade === true && sP.fields[0].list.trade === true && noSplit.fields[0].list.trade === undefined && byId(oK, 'w_k1').split.length === 1 && byId(oK, 'w_k1').split[0].key === '@lvl' && byId(oK, 'w_k1').split[0].max === 500 && byId(oK, 'w_k2').split.length === 0
            && typeof byId(oK, 'w_kc').no === 'string' && typeof byId(oK, 'w_kk').no === 'string' && typeof byId(oK, 'w_kr').no === 'string' && !byId(oG, 'w_g2') && byId(oG, 'w_g1').price === 20 && byId(oG, 'w_g1').no === undefined
            && byId(oG, 'w_g3').split.length === 1 && byId(oG, 'w_g3').split[0].max === 3 && S.tradeOfferable(sG, W.grunt, 'player').some(e => e.fid === 'f_one'), j([oK, oG]));
        const cl = S.cleanTradeOffer(sG, W.kael, [{ fid: 'f_chips', rowId: 'w_k1', key: '@lvl', amt: 40.004 }, { fid: 'f_chips', rowId: 'w_k1', qty: 1 }, { fid: 'f_chips', rowId: 'w_k1', key: '@lvl', amt: 2 }, { fid: 'f_gear', rowId: 'w_kc', qty: 1 },
            { fid: 'f_chips', rowId: 'w_k2', qty: 3 }, { fid: 'f_chips', rowId: 'w_k2', qty: 1.7 }, { fid: 'f_sec', rowId: 'w_ks', qty: 1 }, { fid: 'f_chips', rowId: 'w_nope', qty: 1 }, { fid: 'f_chips', rowId: 'w_k1', key: '@lvl', amt: 9e9 }, null, 'x', { fid: 'f_chips', rowId: 'w_k1', key: '__proto__', amt: 1 }], 'player');
        const many = S.cleanTradeOffer(sG, { values: { f_gear: Array.from({ length: 460 }, (x, i) => ({ id: 'w_m' + i, defId: 'i_lamp', qty: 1 })) } }, Array.from({ length: 460 }, (x, i) => ({ fid: 'f_gear', rowId: 'w_m' + i, qty: 1 })), 'player');
        check('1.5.6 trading, cleanTradeOffer: an amount on the figure\'s step, no more than it holds; a row once by quantity or by amount, never both; a quantity a whole number no more than the stack; a row that cannot be taken off, a GM-only list, a row that is not there and junk dropped; 40 lines at most',
            j(cl) === j([{ fid: 'f_chips', rowId: 'w_k1', key: '@lvl', amt: 40 }, { fid: 'f_chips', rowId: 'w_k2', qty: 1 }]) && many.length === 400, j(cl));
        const W2 = mk(), offK = S.cleanTradeOffer(sG, W2.kael, [{ fid: 'f_chips', rowId: 'w_k1', key: '@lvl', amt: 40 }], 'player'), offG = S.cleanTradeOffer(sG, W2.grunt, [{ fid: 'f_gear', rowId: 'w_g1', qty: 2 }, { fid: 'f_gear', rowId: 'w_g3', key: 'pts', amt: 1 }], 'gm');
        const kBefore = j(W2.kael), gBefore = j(W2.grunt), r = S.tradeApply(sG, W2.kael, W2.grunt, offK, offG, 'player', 'gm');
        const lampK = r.ok && r.valuesA.f_gear.filter(x => x.defId === 'i_lamp' && !x.keptOn)[0], scrapK = r.ok && r.valuesA.f_gear.filter(x => x.def && x.def.name === 'Map scrap')[0];
        check('1.5.6 trading, tradeApply: all of it at once on copies (the characters handed in untouched): 40 of a chip\'s 500 to the receiver\'s chip that is not stowed (2 + 40, not the stowed 10); two lamps off a stack of five come in as a row of their own, switched off; 1 of a custom row\'s Points arrives as a new row of that custom row with 1; each side\'s words',
            r.ok && kBefore === j(W2.kael) && gBefore === j(W2.grunt) && r.valuesA.f_chips[0].lvl === 460 && r.valuesB.f_chips[1].lvl === 42 && r.valuesB.f_chips[0].lvl === 10 && r.valuesB.f_gear[0].qty === 3
            && lampK && lampK.qty === 2 && lampK.on === false && /^w_/.test(lampK.id) && scrapK && scrapK.def.stats.pts === 1 && r.valuesB.f_gear.filter(x => x.def && x.def.name === 'Map scrap')[0].def.stats.pts === 2
            && j(r.linesA) === j(['40 Stored value from Glimmer chip']) && j(r.linesB) === j(['Lamp x2', '1 Points from Map scrap']), j(r));
        const W3 = mk(); W3.kael.values.f_gear.push({ id: 'w_kl', defId: 'i_lamp', qty: 1, on: false });
        const r3 = S.tradeApply(sG, W3.grunt, W3.kael, [{ fid: 'f_gear', rowId: 'w_g1', qty: 5 }], [], 'gm', 'player');
        const W4 = mk(), rCh = S.tradeApply(sG, W4.kael, W4.grunt, [{ fid: 'f_chips', rowId: 'w_k1', key: '@lvl', amt: 600 }], [], 'player', 'gm'), rEmpty = S.tradeApply(sG, W4.kael, W4.grunt, [], [], 'player', 'gm');
        const W5 = mk(); W5.kael.values.f_one = [{ id: 'w_kf', defId: 'i_feat', qty: 1 }]; const rOne = S.tradeApply(sG, W5.grunt, W5.kael, [{ fid: 'f_one', rowId: 'w_gf', qty: 1 }], [], 'gm', 'player');
        const W6 = mk(); W6.kael.values.f_chips[0].lvl = 999; const rMax = S.tradeApply(sG, W6.grunt, W6.kael, [{ fid: 'f_chips', rowId: 'w_g8', key: '@lvl', amt: 2 }], [], 'gm', 'player');
        check('1.5.6 trading, tradeApply refuses whole: a whole stack moving merges into the receiver\'s own loose row of the same entry; an offer that no longer holds (a chip spent below it since), an empty table, a one-of-each list that already holds it, and a figure past its most each refuse with nothing changed',
            r3.ok && r3.valuesA.f_gear.every(x => x.id !== 'w_g1') && r3.valuesB.f_gear.filter(x => x.id === 'w_kl')[0].qty === 6 && rCh.ok === false && rCh.reason === 'changed' && rEmpty.reason === 'empty' && rOne.reason === 'one' && rMax.reason === 'max', j([r3, rCh, rOne, rMax]));
        {   // the receiver picks a chip (tradeInto, tradeApply's into)
            const W7 = mk(), give = [{ fid: 'f_chips', rowId: 'w_k1', key: '@lvl', amt: 40 }], k1 = j(W7.kael), g1 = j(W7.grunt);
            const opts = S.tradeInto(sG, W7.grunt, 'f_chips', '@lvl', W7.kael.values.f_chips[0]), none = S.tradeInto(sG, W7.kael, 'f_gear', 'pts', W7.grunt.values.f_gear[2]);
            W7.kael.values.f_gear.push({ id: 'w_ks2', def: { name: 'Map scrap', stats: { pts: 1 } }, qty: 1 }); const some = S.tradeInto(sG, W7.kael, 'f_gear', 'pts', W7.grunt.values.f_gear[2]); W7.kael.values.f_gear.pop();
            const rPick = S.tradeApply(sG, W7.kael, W7.grunt, give, [], 'player', 'gm', { b: { f_chips: 'w_g9' } }), rNew = S.tradeApply(sG, W7.kael, W7.grunt, give, [], 'player', 'gm', { b: { f_chips: '+' } });
            const rGone = S.tradeApply(sG, W7.kael, W7.grunt, give, [], 'player', 'gm', { b: { f_chips: 'w_nope' } }), rDef = S.tradeApply(sG, W7.kael, W7.grunt, give, [], 'player', 'gm', { b: {} }), rJunk = S.tradeApply(sG, W7.kael, W7.grunt, give, [], 'player', 'gm', { b: { f_chips: 7 }, a: 'x' });
            const newRow = rNew.ok && rNew.valuesB.f_chips.filter(x => x.id !== 'w_g9' && x.id !== 'w_g8')[0];
            check('1.5.6 trading, the receiver picks a chip: tradeInto lists the receiver\'s rows of quantity 1 an amount may land on (a level any chip of the list, stowed or not; a stat only a row of the same entry, none where there is none); a pick lands it there (40 onto the stowed chip, 10 + 40), A new one makes a row of its own holding 40, a pick that is gone refuses whole, no pick and a pick that is no word land as before, and the characters handed in stay untouched',
                j(opts.map(o => [o.rowId, o.cur])) === j([['w_g9', 10], ['w_g8', 2]]) && none.length === 0 && some.length === 1 && some[0].rowId === 'w_ks2' && some[0].cur === 1
                && rPick.ok && rPick.valuesB.f_chips.filter(x => x.id === 'w_g9')[0].lvl === 50 && rPick.valuesB.f_chips.filter(x => x.id === 'w_g8')[0].lvl === 2
                && newRow && newRow.lvl === 40 && newRow.on === false && rGone.ok === false && rGone.reason === 'changed'
                && rDef.ok && rDef.valuesB.f_chips.filter(x => x.id === 'w_g8')[0].lvl === 42 && rJunk.ok && rJunk.valuesB.f_chips.filter(x => x.id === 'w_g8')[0].lvl === 42 && k1 === j(W7.kael) && g1 === j(W7.grunt), j([opts, rPick, rNew, rGone]));
        }
    }
    {   // 1.6.0 (v2): a row traded whole carries the rows it granted (B4, gr) and the parts it holds (R14, in); a granted row is never traded apart
        const j = JSON.stringify, sC = S.cleanSystem({ v: 1, name: 'C', rolls: [], fields: [
            { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { trade: true, on: { label: 'Worn' }, parts: { from: 'f_mods', cats: ['Mod'] } } },
            { id: 'f_mods', key: 'Mods', label: 'Mods', kind: 'item-list', edit: 'owner', vis: 'all', list: { trade: true, noQty: true } },
            { id: 'f_abil', key: 'Abil', label: 'Abilities', kind: 'item-list', edit: 'owner', vis: 'all', list: { trade: true, noQty: true } }],
            items: [{ id: 'i_staff', name: 'Staff', category: 'Gear', grants: [{ list: 'f_abil', entry: 'i_glow' }, { list: 'f_abil', entry: 'i_rune' }] }, { id: 'i_glow', name: 'Glow', grants: [{ list: 'f_abil', entry: 'i_spark' }] }, { id: 'i_spark', name: 'Spark' },
                { id: 'i_rune', name: 'Hidden rune', vis: 'gm' }, { id: 'i_gem', name: 'Gem', category: 'Mod' }, { id: 'i_band', name: 'Band', category: 'Mod', rm: 'bound' }, { id: 'i_rope', name: 'Rope', category: 'Gear' }] }, { F, gmView: true });
        const mk = () => ({ kael: { id: 'c_k', values: {
                f_gear: [{ id: 'w_st', defId: 'i_staff', qty: 1, on: true }, { id: 'w_rp', defId: 'i_rope', qty: 3 }, { id: 'w_bd', defId: 'i_rope', qty: 1 }],
                f_mods: [{ id: 'w_gm', defId: 'i_gem', qty: 1, in: 'w_st' }, { id: 'w_gx', defId: 'i_gem', qty: 2, in: 'w_rp' }, { id: 'w_bn', defId: 'i_band', qty: 1, in: 'w_bd' }],
                f_abil: [{ id: 'w_gl', defId: 'i_glow', qty: 1, gr: 'w_st' }, { id: 'w_sp', defId: 'i_spark', qty: 1, gr: 'w_gl' }, { id: 'w_ru', defId: 'i_rune', qty: 1, gr: 'w_st' }, { id: 'w_xx', defId: 'i_spark', qty: 1 }] } },
            sela: { id: 'c_s', npc: true, values: { f_gear: [{ id: 'w_st', defId: 'i_rope', qty: 1 }], f_abil: [{ id: 'w_s1', defId: 'i_spark', qty: 1 }] } } });
        const W = mk(), oK = S.tradeOfferable(sC, W.kael, 'player'), byId = id => oK.filter(e => e.rowId === id)[0];
        check('1.6.0 trading what a row holds, tradeOfferable: a row that holds parts or granted rows says how many go with it, never counting a GM-only entry; a granted row is listed with its reason, never traded apart while its granter is there; a part may go alone; a host whose part a player may not give away is listed with its reason',
            byId('w_st').with === 3 && byId('w_st').name === 'Staff, with 3 more' && byId('w_st').no === undefined && /came with Staff, and goes with it/.test(byId('w_gl').no || '') && typeof byId('w_sp').no === 'string'
            && byId('w_gm').no === undefined && byId('w_xx').no === undefined && byId('w_ru') === undefined && /Something with it cannot be given away/.test(byId('w_bd').no || '') && S.tradeOfferable(sC, W.kael, 'gm').filter(e => e.rowId === 'w_bd')[0].no === undefined, j(oK));
        const k0 = j(W.kael), s0 = j(W.sela), r = S.tradeApply(sC, W.kael, W.sela, [{ fid: 'f_gear', rowId: 'w_st', qty: 1 }], [], 'player', 'gm');
        const stB = r.ok && r.valuesB.f_gear.filter(x => x.defId === 'i_staff')[0], gemB = r.ok && r.valuesB.f_mods.filter(x => x.defId === 'i_gem')[0], ab = r.ok ? r.valuesB.f_abil : [];
        const glB = ab.filter(x => x.defId === 'i_glow')[0], spB = ab.filter(x => x.defId === 'i_spark' && x.gr), ruB = ab.filter(x => x.defId === 'i_rune')[0];
        check('1.6.0 trading what a row holds, tradeApply: a staff traded whole takes its part and every row it granted, and theirs, off the giver and onto the receiver, each linked to the staff\'s new id there (its own id taken on that side), switched off as the staff is; a grant the receiver holds once already is not granted again; the giver keeps its other rows; the line says how many came with it; the characters handed in untouched',
            r.ok && k0 === j(W.kael) && s0 === j(W.sela) && stB && stB.id !== 'w_st' && stB.on === false && stB.gr === undefined && gemB && gemB.in === stB.id && glB && glB.gr === stB.id && ruB && ruB.gr === stB.id && spB.length === 0
            && ab.filter(x => x.defId === 'i_spark').length === 1 && r.valuesA.f_gear.every(x => x.id !== 'w_st') && j(r.valuesA.f_mods.map(x => x.id)) === j(['w_gx', 'w_bn']) && j(r.valuesA.f_abil.map(x => x.id)) === j(['w_xx'])
            && j(r.linesA) === j(['Staff, with 3 more']), j(r));
        const W2 = mk(); W2.sela.values.f_abil = [];
        const r2 = S.tradeApply(sC, W2.kael, W2.sela, [{ fid: 'f_gear', rowId: 'w_st', qty: 1 }], [], 'gm', 'gm'), ab2 = r2.ok ? r2.valuesB.f_abil : [], gl2 = ab2.filter(x => x.defId === 'i_glow')[0], sp2 = ab2.filter(x => x.defId === 'i_spark')[0];
        const W3 = mk(), r3 = S.tradeApply(sC, W3.kael, W3.sela, [{ fid: 'f_gear', rowId: 'w_rp', qty: 1 }], [], 'player', 'gm'), W4 = mk(), r4 = S.tradeApply(sC, W4.kael, W4.sela, [{ fid: 'f_mods', rowId: 'w_gm', qty: 1 }], [], 'player', 'gm');
        const W5 = mk(), r5 = S.tradeApply(sC, W5.kael, W5.sela, [{ fid: 'f_mods', rowId: 'w_gm', qty: 1 }, { fid: 'f_gear', rowId: 'w_st', qty: 1 }], [], 'player', 'gm'), W6 = mk(), r6 = S.tradeApply(sC, W6.kael, W6.sela, [{ fid: 'f_gear', rowId: 'w_st', qty: 1 }, { fid: 'f_mods', rowId: 'w_gm', qty: 1 }], [], 'player', 'gm');
        const W7 = mk(); W7.sela.values.f_mods = [{ id: 'w_sg', defId: 'i_gem', qty: 1 }]; const r7 = S.tradeApply(sC, W7.kael, W7.sela, [{ fid: 'f_gear', rowId: 'w_st', qty: 1 }], [], 'player', 'gm');
        const W8 = mk(), r8 = S.tradeApply(sC, W8.kael, W8.sela, [{ fid: 'f_abil', rowId: 'w_gl', qty: 1 }], [], 'gm', 'gm');
        check('1.6.0 trading what a row holds, tradeApply: a grant of a grant comes in linked to its own granter\'s new id; part of a stack that holds parts moves alone and the giver keeps its parts on the rest; a part traded alone leaves its host and lands loose; a part put on the table beside its host goes once, with it or alone first, either order; a part the receiver\'s one-of-each list holds already refuses whole; a granted row put on the table alone refuses whole',
            r2.ok && gl2 && sp2 && sp2.gr === gl2.id && r3.ok && r3.valuesA.f_gear.filter(x => x.id === 'w_rp')[0].qty === 2 && r3.valuesA.f_mods === undefined && r3.valuesB.f_gear.filter(x => x.defId === 'i_rope' && x.in === undefined).length === 1
            && r4.ok && r4.valuesB.f_mods.length === 1 && r4.valuesB.f_mods[0].in === undefined && r4.valuesA.f_mods.every(x => x.id !== 'w_gm')
            && r5.ok && r5.valuesB.f_mods.length === 1 && r5.valuesB.f_mods[0].in === undefined && r6.ok && r6.valuesB.f_mods.length === 1 && typeof r6.valuesB.f_mods[0].in === 'string'
            && r7.ok === false && r7.reason === 'one' && r8.ok === false && r8.reason === 'changed', j([r2, r3, r4, r5, r6, r7, r8]));
    }
    {   // 1.5.6 buying and selling: the Money box, the site's rules for money in and out, and a row op's price (systemcore, run for real)
        const j = JSON.stringify, mkS = (gm) => S.cleanSystem({ v: 1, name: 'M', rolls: [], fields: [
            { id: 'f_chips', key: 'Chips', label: 'Chips', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, cats: ['Credit Chip'], on: { label: 'Stowed' }, lvl: { label: 'Stored', min: 0, max: 100000, step: 0.01, def: 0 }, money: '@lvl' } },
            { id: 'f_bars', key: 'Bars', label: 'Bars', kind: 'item-list', edit: 'owner', vis: 'all', list: { multi: true, stats: [{ key: 'cr', label: 'Denom' }, { key: 'kind', label: 'K', kind: 'pick', opts: [{ label: 'a' }] }], money: 'CR' } },
            { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { price: 'cr', stats: [{ key: 'cr', label: 'Cost' }], money: 'kind' } },
            { id: 'f_odd', key: 'Odd', label: 'Odd', kind: 'item-list', edit: 'owner', vis: 'all', list: { lvl: { label: 'L', labels: ['x', 'y'] }, money: '@lvl' } }],
            items: [{ id: 'i_chip', name: 'Chip' }, { id: 'i_b100', name: 'Bar 100', stats: { cr: 100 } }, { id: 'i_b10', name: 'Bar 10', stats: { cr: 10 } }, { id: 'i_lamp', name: 'Lamp', stats: { cr: 25 } }] }, { F, gmView: gm });
        const sM = mkS(true), sMp = mkS(false), mk = () => ({ values: { f_chips: [{ id: 'w_c1', defId: 'i_chip', qty: 1, lvl: 30 }, { id: 'w_c2', defId: 'i_chip', qty: 1, lvl: 500 }, { id: 'w_c3', defId: 'i_chip', qty: 1, lvl: 9999, keptOn: 1 }], f_bars: [{ id: 'w_b1', defId: 'i_b100', qty: 3 }, { id: 'w_b2', defId: 'i_b10', qty: 2 }] } });
        check('1.5.6 the Money box: a list holds money by each row\'s level (only with a level that has no value names) or by a number stat each piece is worth, spelled as the list spells it, never a choice; the same in both views; none where it is not set',
            j(sM.fields.map(f => f.list.money)) === j(['@lvl', 'cr', undefined, undefined]) && j(sMp.fields.map(f => f.list.money)) === j(['@lvl', 'cr', undefined, undefined]) && j(S.moneyBoxes(sM).map(b => [b.f.id, b.chip])) === j([['f_chips', true], ['f_bars', false]]));
        const W = mk(), w0 = j(W), lines = r => r.ok ? Object.keys(r.values).sort().map(k => k + ':' + r.values[k].map(x => (x.lvl !== undefined ? 'L' + x.lvl : '') + 'q' + x.qty + (x.defId || x.def.name)).join(',')).join(' ') : r.reason;
        const m20 = S.moneyMove(sM, W, -20), m100 = S.moneyMove(sM, W, -100), m600 = S.moneyMove(sM, W, -600), m845 = S.moneyMove(sM, W, -845), m851 = S.moneyMove(sM, W, -851), g50 = S.moneyMove(sM, W, 50), junk = S.moneyMove(sM, W, 'x');
        const noChip = { values: { f_bars: [{ id: 'w_b1', defId: 'i_b100', qty: 1 }] } }, g7 = S.moneyMove(sM, noChip, 7), noBox = S.moneyMove(S.cleanSystem({ v: 1, name: 'N', rolls: [], fields: [] }, { F, gmView: true }), W, -1);
        const onlyBars = S.cleanSystem({ v: 1, name: 'B', rolls: [], fields: [sM.fields[1]], items: sM.items }, { F, gmView: true }), gb = S.moneyMove(onlyBars, { values: { f_bars: [{ id: 'w_b1', defId: 'i_b100', qty: 1 }, { id: 'w_b2', defId: 'i_b10', qty: 1 }] } }, 230), gbOdd = S.moneyMove(onlyBars, { values: { f_bars: [{ id: 'w_b1', defId: 'i_b100', qty: 1 }] } }, 7);
        check('1.5.6 the site\'s money rules (moneyHeld, moneyMove, run for real): 850 held, a kept curse\'s chip never counted; paying drains the smallest chips first (20 from the 30; 100 takes the 30 and 70 of the 500), then breaks the largest bars and hands back the change in the fewest bars (600: both chips, a 100 broken, 3 tens back); what no bar can hold goes onto a new chip named for the list (845 leaves a chip of 5); more than is held refuses; what comes in lands on the largest chip (550), with no chip a new one, and with no chip list in the fewest bars, refused where no bar can hold it; no Money box and junk refuse; the character handed in stays untouched',
            S.moneyHeld(sM, W) === 850 && lines(m20) === 'f_bars:q3i_b100,q2i_b10 f_chips:L10q1i_chip,L500q1i_chip,L9999q1i_chip' && lines(m100) === 'f_bars:q3i_b100,q2i_b10 f_chips:L430q1i_chip,L9999q1i_chip'
            && lines(m600) === 'f_bars:q2i_b100,q5i_b10 f_chips:L9999q1i_chip' && lines(m845) === 'f_bars: f_chips:L9999q1i_chip,L5q1Credit Chip' && m851.ok === false && m851.reason === 'money' && /850 held, 851 needed/.test(m851.msg)
            && lines(g50) === 'f_chips:L30q1i_chip,L550q1i_chip,L9999q1i_chip' && lines(g7) === 'f_chips:L7q1Credit Chip' && lines(gb) === 'f_bars:q3i_b100,q4i_b10' && gbOdd.ok === false && gbOdd.reason === 'change' && noBox.ok === false && junk.ok === false && w0 === j(W),
            j([m600, m845, g7, gb]));
        const add = { op: 'add', defId: 'i_lamp', qty: 2, rowId: 'w_g1' }, rA = S.applyRowOp(sM, W, 'f_gear', add, F, {}), pA = S.rowOpMoney(sM, W, 'f_gear', Object.assign({ pay: 45 }, add), rA), freeA = S.rowOpMoney(sM, W, 'f_gear', add, rA), tooMuch = S.rowOpMoney(sM, W, 'f_gear', Object.assign({ pay: 9000 }, add), rA);
        const W2 = mk(); W2.values.f_gear = [{ id: 'w_g1', defId: 'i_lamp', qty: 2, paid: 20 }]; const add2 = { op: 'add', defId: 'i_lamp', qty: 1 }, rA2 = S.applyRowOp(sM, W2, 'f_gear', add2, F, {}), pA2 = S.rowOpMoney(sM, W2, 'f_gear', Object.assign({ pay: 35 }, add2), rA2);
        const rm = { op: 'setQty', rowId: 'w_g1', qty: 1 }, rR = S.applyRowOp(sM, W2, 'f_gear', rm, F, {}), sold = S.rowOpMoney(sM, W2, 'f_gear', Object.assign({ get: 18 }, rm), rR), up = { op: 'setQty', rowId: 'w_g1', qty: 3 }, rU = S.applyRowOp(sM, W2, 'f_gear', up, F, {}), upGet = S.rowOpMoney(sM, W2, 'f_gear', Object.assign({ get: 18 }, up), rU);
        const ci = S.cleanCharItem({ rid: 'r1', charId: 'c_1', fieldId: 'f_gear', op: 'add', defId: 'i_lamp', rowId: 'w_g1', pay: 12.257 }), ciBad = [-1, 'x', 2e15, NaN].map(p => S.cleanCharItem({ rid: 'r1', charId: 'c_1', fieldId: 'f_gear', op: 'add', defId: 'i_lamp', rowId: 'w_g1', pay: p })), ciGet = S.cleanCharItem({ rid: 'r1', charId: 'c_1', fieldId: 'f_gear', op: 'remove', rowId: 'w_g1', get: 4, pay: 9 });
        check('1.5.6 a row op\'s price (rowOpMoney, cleanCharItem, run for real): two lamps bought for 45 take 45 by the money rules and stamp each 22.5 as Paid; with no price the row moves alone; a price past what is held refuses; one more bought for 35 into a stack of two paid 20 each stamps the average, 25; a quantity lowered with its price pays it onto the largest chip, one raised moves no money; the wire keeps pay on an add and get on a remove or a quantity, a number 0 or more rounded to the hundredth, and refuses any other',
            pA.ok && pA.values.f_gear[0].paid === 22.5 && j(pA.values.f_chips.map(x => x.lvl)) === j([485, 9999]) && freeA.ok && j(Object.keys(freeA.values)) === j(['f_gear']) && freeA.values.f_gear[0].paid === 25 && tooMuch.ok === false && tooMuch.reason === 'money'
            && pA2.ok && pA2.values.f_gear[0].qty === 3 && pA2.values.f_gear[0].paid === 25 && sold.ok && sold.values.f_chips.filter(x => x.id === 'w_c2')[0].lvl === 518 && upGet.ok && j(Object.keys(upGet.values)) === j(['f_gear'])
            && ci.pay === 12.26 && ciBad.every(x => x === null) && ciGet.get === 4 && ciGet.pay === undefined && S.cleanDenyReason('money') === 'money' && S.cleanDenyReason('change') === 'change', j([pA, pA2, sold]));
    }
    {   // 1.6.0: a list roll's Then moves the sheet's money ({ money: <formula>, when }), run for real
        const sysM = gm => cleanSystem({ v: 1, name: 'M', fields: [{ id: 'f_ch', key: 'Chips', label: 'Chips', kind: 'item-list', vis: 'all', edit: 'owner', list: { multi: true, lvl: { label: 'Held', min: 0, max: 100000, step: 0.01, def: 0 }, money: '@lvl' } },
            { id: 'f_sec', key: 'Sec', label: 'S', kind: 'number', vis: 'gm', edit: 'gm' },
            { id: 'f_ge', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Cost', label: 'Cost' }], counters: [{ key: 'Done', label: 'Done' }], rolls: [{ label: 'Mend', formula: '3d6 <= 10', then: [{ money: 'ceil(Row.Cost * 0.3) * -1', when: 'hit' }, { money: 'Row.Cost', when: 'hit' }, { money: '1', when: 'miss' }, { money: 'x y' }, { c: 'Done', formula: '1', add: true, when: 'hit' }] }, { label: 'Hush', formula: '3d6 <= 10', then: [{ money: 'Sec' }] }, { label: 'Dice', formula: '3d6', then: [{ money: '1d6' }] }] } }],
            rolls: [{ id: 'r_a', label: 'A', formula: '3d6', then: [{ money: '5' }] }], items: [{ id: 'i_s', name: 'Pebble Sword', stats: { Cost: 123 } }] }, { F, gmView: gm });
        const sG = sysM(true), sP = sysM(false), th = sG.fields[2].list.rolls[0].then;
        check('Money: cleaned on a list roll\'s Then alone, once per when, a figure kept as a formula with its When; a system roll\'s Then holds none; the players\' view keeps it and drops a Then that reads a GM-only value, as any Then',
            j(th.filter(c => 'money' in c).map(c => [c.money, c.when])) === j([['ceil(Row.Cost * 0.3) * -1', 'hit'], ['1', 'miss'], ['x y', undefined]]) && !('then' in sG.rolls[0]) && Array.isArray(sP.fields.find(f => f.id === 'f_ge').list.rolls[0].then) && !('then' in sP.fields.find(f => f.id === 'f_ge').list.rolls[1]), j(th));
        const v0 = validateSystem(sG, F);
        check('Money: the validator reads its figure with Row.* known and dice refused, and says where no list keeps money',
            v0.errors.some(e => /Mend.*then 3.*operator/.test(e.message)) && v0.errors.some(e => /Dice.*then 1.*dice/i.test(e.message)) && !v0.errors.some(e => /Mend.*then 1:/.test(e.message)) && validateSystem(cleanSystem({ v: 1, name: 'N', rolls: [], fields: [{ id: 'f_g', key: 'G', label: 'G', kind: 'item-list', vis: 'all', list: { rolls: [{ label: 'R', formula: '3d6', then: [{ money: '5' }] }] } }] }, { F, gmView: true }), F).errors.some(e => /no Money|Money box/.test(e.message)), j(v0.errors.slice(0, 4)));
        const ch = lvl => ({ id: 'c_a', ownerId: 'u1', name: 'Kael', values: { f_ch: [{ id: 'w_c', def: { name: 'Chip' }, qty: 1, lvl }], f_ge: [{ id: 'w_s', defId: 'i_s', qty: 1 }] } });
        const act = (c, ap, o) => S.applyAct(sG, c, { apply: ap }, makeResolver(sG, c, F).row('f_ge', 'w_s'), F, null, { f: 'f_ge', r: 'w_s' }, undefined, null, null, o);
        const pay = [{ money: '0 - ceil(Row.Cost * 0.3)' }, { c: 'Done', formula: '1', add: true }];
        const a1 = act(ch(100), pay), a2 = act(ch(10), pay), a3 = act(ch(10), pay, { gmHand: true }), a4 = act(ch(100), [{ money: 'Row.Cost' }]), a5 = act(ch(100), [{ money: '0' }]), a6 = act(ch(0), [{ money: '-5' }], { gmHand: true }), lv = r => ((r.values.f_ch || [])[0] || {}).lvl;
        check('Money: moved by the money rules with the rest of the Then, a figure below 0 paid out and one above paid in, each said on a line with what is held after it; a figure of 0 moves nothing',
            a1.ok && lv(a1) === 63 && a1.values.f_ge[0].ct.Done === 1 && a1.paid === true && j(a1.lines[0]) === j({ f: 'f_ch', n: 'Money', d: -37, v: 63 }) && a4.ok && lv(a4) === 223 && a4.lines[0].d === 123 && !a5.ok && a5.reason === 'none', j([a1, a4, a5]));
        check('Money: too little held refuses the whole Then for a player, nothing of it landing and the words said; the GM\'s hand takes what is held, says what it was short of, and still lands the rest',
            !a2.ok && a2.reason === 'money' && /Not enough money: 10 held, 37 needed/.test(a2.message) && !a2.values && a3.ok && (a3.values.f_ch || []).length === 0 && a3.values.f_ge[0].ct.Done === 1 && j(a3.short) === j({ held: 10, need: 37 }) && j(a3.lines[0]) === j({ f: 'f_ch', n: 'Money', d: -10, v: 0 }) && a6.ok === false && a6.reason === 'none', j([a2, a3, a6]));
        const noBox = cleanSystem({ v: 1, name: 'N', rolls: [], fields: [{ id: 'f_g', key: 'G', label: 'G', kind: 'item-list', vis: 'all', list: { stats: [{ key: 'Cost', label: 'Cost' }] } }] }, { F, gmView: true }), nb = S.applyAct(noBox, { id: 'c', values: { f_g: [] } }, { apply: [{ money: '5' }] }, makeResolver(noBox, { id: 'c', values: {} }, F), F);
        check('Money: a sheet with no list that keeps money refuses it in words; its card is its owner\'s', !nb.ok && nb.reason === 'money' && /keeps no money/.test(nb.message) && S.applyScope(sG, ch(1), { apply: [{ money: '1' }] }, false, F) === 'owner', j(nb));
        const shS = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8'), SCT = new Function(require('./checkkit').cut('sysedroll.js', 'function setChangeTarget(ch, v) {', 'function applyChangeOf(t, r)') + NL + 'return setChangeTarget;')(), ct = { f: 'f_x', formula: '1', add: true, roll: true }; SCT(ct, 'money'); const ct2 = { money: '5', when: 'hit' }; SCT(ct2, 'f_x');
        const docs = fs.readFileSync(path.join(app, 'index.html'), 'utf8'), wn = [fs.readFileSync(path.join(__dirname, '..', 'WHATSNEW.txt'), 'utf8'), fs.readFileSync(path.join(app, 'assets', 'whatsnew.txt'), 'utf8')];
        check('Money: the Then row\'s target (setChangeTarget, run for real) starts a figure with nothing else of an amount, and another target leaves it; the list\'s row, its box and its handler, Help, both release notes and the guide',
            j(ct) === j({ money: '' }) && j(ct2) === j({ when: 'hit', f: 'f_x', formula: '' }) && require('./checkkit').part('sysedlist.js').includes("opts.push(['money', 'The sheet\\u2019s money'])") && require('./checkkit').part('sysedlist.js').includes("input('sys-list-applymoney field'") && require('./checkkit').part('sysedtabs.js').includes("lcc.indexOf('sys-list-applymoney') >= 0") && /The sheet&rsquo;s money/.test(docs) && wn.every(t => /move the sheet's money/.test(t)) && fs.readFileSync(path.join(__dirname, '..', 'CAMPAIGN_INTEGRATION.md'), 'utf8').includes('"money": "<formula>"'), j([ct, ct2]));
    }
    {   // 1.6.0 (the owner's ruling after the hand test): what a list roll's Then asks of the money before any die (moneyDue, e.rp, the row's button), run for real
        const chips = { id: 'f_ch', key: 'Chips', label: 'Chips', kind: 'item-list', vis: 'all', edit: 'owner', list: { multi: true, lvl: { label: 'Held', min: 0, max: 100000, step: 0.01, def: 0 }, money: '@lvl' } };
        const gear = (rolls, o) => Object.assign({ id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', vis: 'all', edit: 'owner' }, { list: Object.assign({ stats: [{ key: 'Cost', label: 'Cost' }], counters: [{ key: 'Done', label: 'Done' }], lvl: { label: 'Rank', min: 1, max: 9, def: 3 }, rolls }, o) });
        const sysD = (rolls, more, gm, moneyOff) => cleanSystem({ v: 1, name: 'D', rolls: [], combat: { checks: 'under3d6' }, fields: [moneyOff ? Object.assign({}, chips, { list: { multi: true } }) : chips, gear(rolls)].concat(more || []), items: [{ id: 'i_s', name: 'Pebble Spanner', stats: { Cost: 7 } }] }, { F, gmView: gm !== false });
        const chD = (lvl, more) => ({ id: 'c_a', ownerId: 'u1', name: 'Pat', values: Object.assign({ f_ch: [{ id: 'w_c', def: { name: 'Chip' }, qty: 1, lvl }], f_gear: [{ id: 'w_s', defId: 'i_s', qty: 1, lvl: 3 }] }, more) });
        const due = (then, lvl, more, vals, moneyOff) => { const s = sysD([{ label: 'Mend', formula: '3d6 <= 10', then }], more, true, moneyOff), c = chD(lvl, vals); return S.moneyDue(s, c, s.fields[1].list.rolls[0], makeResolver(s, c, F).row('f_gear', 'w_s'), F); };
        const NO = '{"no":"Not enough money: 4 held, 7 needed.","may":"You may not be able to pay this"}', MAY = '{"may":"You may not be able to pay this"}', sNo = sysD([{ label: 'Mend', formula: '3d6 <= 10', then: [{ money: '0 - Row.Cost' }] }]);
        check('money before the dice: a change with no when whose figure reads no name of the roll is due whatever the dice say: too little held is a refusal in moneyMove\'s own words, paid in full it is nothing, a figure of 0 or above asks nothing',
            j(due([{ money: '0 - Row.Cost' }], 4)) === NO && JSON.parse(NO).no === S.moneyMove(sNo, chD(4), -7).msg && due([{ money: '0 - Row.Cost' }], 7) === null && due([{ money: '-7' }], 8) === null && due([{ money: 'Row.Cost' }], 0) === null && due([{ money: '0' }], 0) === null && due([{ c: 'Done', formula: '1', add: true }], 0) === null && S.moneyDue(sNo, chD(0), { label: 'X', formula: '3d6' }, () => undefined, F) === null,
            j([due([{ money: '0 - Row.Cost' }], 4), due([{ money: '0 - Row.Cost' }], 7)]));
        const whens = ['hit', 'miss', 'crit', 'fumble', 'malf'], whenAt = lvl => whens.map(w => j(due([{ money: '-7', when: w }], lvl)));
        const bothWays = due([{ money: '-7', when: 'hit' }, { money: '-7', when: 'miss' }], 4);
        check('money before the dice: a When of hit, miss, crit, fumble or malf hangs on the dice: a warning, never a refusal, even where every way the roll lands would be short, and nothing where it can be paid', j(whenAt(4)) === j(whens.map(() => MAY)) && j(whenAt(7)) === j(whens.map(() => 'null')) && j(bothWays) === MAY, j([whenAt(4), bothWays]));
        const reads = [due([{ money: '0 - RollMargin' }], 4), due([{ money: 'RollCrit * 7' }], 4), due([{ money: 'RollCrit * -7' }], 4), due([{ money: '0 - RollBig * 7' }], 4), due([{ money: '0 - RollMargin', when: 'hit' }], 4), due([{ money: 'RollMargin', when: 'miss' }], 4)];
        check('money before the dice: a figure that reads the roll (RollMargin, RollCrit, RollBig) hangs on the dice: a warning, however it is signed, tried across what the roll can read',
            reads.every(d => j(d) === MAY) && due([{ money: '0 - RollMargin' }], 5000) === null && due([{ money: 'RollMargin', when: 'hit' }], 0) === null && due([{ money: '0 - RollMargin', when: 'miss' }], 0) === null && due([{ money: '0 - RollBig * 7', when: 'miss' }], 0) === null, j(reads));
        const firstIn = due([{ money: '20', when: 'hit' }, { money: '-7' }], 4), lastIn = due([{ money: '-7' }, { money: '20', when: 'hit' }], 4), stack = due([{ money: '-5' }, { money: '-5', when: 'hit' }], 7), both = due([{ money: '-3', when: 'hit' }, { money: '-3', when: 'crit' }], 5), plainFum = due([{ money: '20', when: 'malf' }, { money: '-7', when: 'fumble' }], 4), keyed = due([{ money: '0 - RollMargin' }], 4, [{ id: 'f_rm', key: 'RollMargin', label: 'M', kind: 'number', vis: 'all', edit: 'gm' }], { f_rm: 9 });
        check('money before the dice: the Then is walked in its own order on each way the roll lands, as applyAct walks it: a hit that pays in first leaves a warning, one that pays in after it is no help, what is paid first is gone, a critical runs its hit too; a field keyed RollMargin keeps that name, so it hangs on nothing',
            j(firstIn) === MAY && j(lastIn) === NO && j(stack) === MAY && j(both) === MAY && j(plainFum) === MAY && due([{ money: '-3', when: 'hit' }, { money: '-3', when: 'crit' }], 6) === null && keyed && keyed.no === 'Not enough money: 4 held, 9 needed.', j([firstIn, lastIn, stack, both, keyed]));
        const noBoxD = due([{ money: '-7' }], 4, null, null, true), oddD = [due([{ money: 'x y' }], 0), due([{ money: 'Nope - 1' }], 0), due([{ money: '0 - 1d6' }], 0)];
        check('money before the dice: a sheet that keeps no money refuses in moneyMove\'s words; a figure that cannot be worked out judges nothing here, as applyAct says so after the dice', noBoxD && noBoxD.no === 'This sheet keeps no money.' && oddD.every(d => d === null), j([noBoxD, oddD]));
        const rlsR = [{ label: 'Pay', formula: '3d6 <= 10', then: [{ money: '-7' }] }, { label: 'Mend', formula: '3d6 <= 10', then: [{ money: '-7', when: 'hit' }] }, { label: 'Look', formula: '3d6 <= 10' }, { label: 'Tier', formula: '3d6 <= 10', askLvl: true, then: [{ money: '0 - Row.lvl * 9' }] }, { label: 'Aid', formula: '3d6 <= 10', to: 'near', then: [{ money: '0 - OnSelf * 7' }] }, { label: 'Lend', formula: '3d6 <= 10', to: 'near', then: [{ money: '-7' }] }];
        const sR = sysD(rlsR), eR = resolveAll(sR, chD(4), F).f_gear, sN = sysD([{ label: 'Look', formula: '3d6 <= 10', then: [{ c: 'Done', formula: '1', add: true }] }]), eN = resolveAll(sN, chD(4), F).f_gear;
        const sV = cleanSystem({ v: 1, name: 'V', rolls: [], fields: [Object.assign({}, chips, { vis: 'gm', edit: 'gm' }), gear([rlsR[0]])], items: [{ id: 'i_s', name: 'Pebble Spanner', vis: 'all', stats: { Cost: 7 } }] }, { F, gmView: false }), eV = resolveAll(sV, { id: 'c_a', values: { f_gear: chD(4).values.f_gear } }, F).f_gear;
        const keptR = resolveAll(sR, chD(4, { f_gear: [{ id: 'w_s', defId: 'i_s', qty: 1, hid: 1 }] }), F).f_gear, noRowsR = resolveAll(sR, chD(4), F, null, { noRows: true }).f_gear;
        check('money before the dice: the resolver answers each row\'s rolls (e.rp) in list order: a refusal, a warning, nothing for a roll with no money; what only the press says cannot be refused on the sheet, so a roll that asks its level, or a figure that reads whom it is used on, warns there and the host judges the press; a figure that reads neither stays a refusal',
            j(eR.rp.w_s[0]) === NO && j(eR.rp.w_s[1]) === MAY && eR.rp.w_s[2] === null && j(eR.rp.w_s[3]) === MAY && j(eR.rp.w_s[4]) === MAY && j(eR.rp.w_s[5]) === NO, j(eR.rp));
        check('money before the dice: e.rp stands only on a list with money in a Then, so a system with none is as it was, and a view that keeps no money box leaves it to the host; no row of a resolve that draws no rows; a row kept from its player has no names and no answer',
            !('rp' in eN) && !('rp' in eV) && !('rp' in noRowsR) && keptR.rp && !('w_s' in keptR.rp), j([Object.keys(eN), Object.keys(eV), keptR.rp]));
        const shS = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, NL), rrS = shS.slice(shS.indexOf('function rowRollBtns('), shS.indexOf('// Stage 6 HUD R2: a row\'s counters')), pmS = shS.slice(shS.indexOf('function rollModBtn('), shS.indexOf('var ROLL_TONE_CLS')), glS = shS.slice(shS.indexOf('// [systemcheck:greypress-start]'), shS.indexOf('// [systemcheck:greypress-end]'));
        const grey = new Function('toast', 'document', glS + NL + 'return greyWords;')(() => {}, { addEventListener() {} });
        const elM = (tag, cls, text) => ({ tag, className: cls || '', textContent: text || '', title: '', disabled: false, type: '', dataset: {}, children: [], on: {}, classList: { add() {} }, appendChild(x) { this.children.push(x); return x; }, insertBefore(x) { this.children.unshift(x); return x; }, setAttribute() {}, addEventListener(t, f) { this.on[t] = f; } });
        const row = (res, client) => { const host = elM('div', 'host'), sent = []; new Function('_fxLive', 'window', 'rowIdOf', 'canRoll', 'canApply', 'el', 'sheetRoll', 'isClient', "'use strict';" + NL + rrS + pmS + NL + 'return rowRollBtns;')(true, { wpPrintCopy: false }, r => r.id, () => true, () => false, elM, (e, cid, expr) => sent.push(expr), () => client)(host, sR.fields[1].list, { id: 'w_s' }, { name: 'Pebble Spanner' }, { id: 'c_a' }, { id: 'f_gear' }, res); return { kids: host.children, sent }; };
        const flatM = ks => ks.reduce((a, k) => a.concat(k.className === 'sheet-item-moneyroll' ? k.children : [k]), []), named = (o, l) => flatM(o.kids).findIndex(k => k.textContent === l), warnOf = (o, l) => { const n = flatM(o.kids)[named(o, l) + 2]; return n && n.className === 'sheet-item-moneywarn' ? n : { textContent: '', title: '', none: true }; }, groupOf = (o, l) => o.kids.find(k => k.className === 'sheet-item-moneyroll' && k.children.some(x => x.textContent === l)) || { children: [], none: true };
        const pl = row(eR, true), gm = row(eR, false), plain = row({}, true), payP = flatM(pl.kids)[named(pl, 'Pay')], payG = flatM(gm.kids)[named(gm, 'Pay')], mendP = flatM(pl.kids)[named(pl, 'Mend')];
        check('money before the dice (rowRollBtns, run for real on the resolver\'s answer): on a player\'s app a roll in the refusal case grays with the words first in its tooltip, its ± with it, and a press on it says them; no warning stands beside a button that cannot be pressed',
            payP.disabled === true && payP.title.startsWith('Not enough money: 4 held, 7 needed.\n') && grey(payP) === 'Not enough money: 4 held, 7 needed.' && flatM(pl.kids)[named(pl, 'Pay') + 1].disabled === true && warnOf(pl, 'Pay').none === true && groupOf(pl, 'Pay').none === true, j([payP.disabled, payP.title]));
        check('money before the dice: a roll that hangs on the dice stays live on a player\'s app, with "You may not be able to pay this" beside it in sight, in one group with its button and ± so a row that wraps keeps them together, its press going on; the GM\'s own sheet leaves the refusal case live, shows the same words and says in the tooltip that the press goes through',
            mendP.disabled === false && warnOf(pl, 'Mend').textContent === 'You may not be able to pay this' && j(groupOf(pl, 'Mend').children.map(k => k.className.split(' ').pop())) === j(['sheet-item-roll', 'sheet-roll-mod', 'sheet-item-moneywarn']) && payG.disabled === false && warnOf(gm, 'Pay').textContent === 'You may not be able to pay this' && /^Not enough money: 4 held, 7 needed\. Your press goes through and takes what is held\.$/.test(warnOf(gm, 'Pay').title) && !/Not enough/.test(payG.title) && !/press goes through/.test(warnOf(pl, 'Mend').title)
            && (mendP.on.click({}), pl.sent.length === 1) && (payG.on.click({}), gm.sent.length === 1), j([warnOf(gm, 'Pay'), warnOf(pl, 'Mend')]));
        check('money before the dice: a row with no money answer draws what it drew, a button and a ± each and nothing beside them', plain.kids.length === 12 && !plain.kids.some(k => k.tag === 'span') && !plain.kids.some(k => k.disabled), j(plain.kids.map(k => k.className)));
        const css = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, NL), prtA = css.lastIndexOf('@media print', css.indexOf('#sheetPrint button:not(.sheet-roll)')), prt = css.slice(prtA, css.indexOf('.hud-ico-wave {', prtA));
        const docsD = fs.readFileSync(path.join(app, 'index.html'), 'utf8'), wnD = [fs.readFileSync(path.join(__dirname, '..', 'WHATSNEW.txt'), 'utf8'), fs.readFileSync(path.join(app, 'assets', 'whatsnew.txt'), 'utf8')].map(t => t.replace(/\r\n/g, NL));
        check('money before the dice: the words wear the warn tone and stay off paper; Help, both release notes and the guide say it',
            /\.sheet-item-moneywarn \{[^}]*color: var\(--sheet-warn, var\(--gold\)\)/.test(css) && /\.sheet-item-moneyroll \{ display: inline-flex;/.test(css) && /#sheetPrint \.sheet-item-moneywarn \{ display: none !important; \}/.test(prt) && docsD.includes('<b>You may not be able to pay this</b> before the press') && wnD.every(t => t.includes('no longer rolls for a player') && t.includes('"You may not be able to pay') && t.includes('Your own press always goes through')) && fs.readFileSync(path.join(__dirname, '..', 'CAMPAIGN_INTEGRATION.md'), 'utf8').includes('refuses a player\'s press before anything is rolled or spent'), '');
    }
    {   // 1.6.2, backlog 234 (asked by a build session: a limb priced at its wearer's size): Price from, one of the list's own columns
        const J = JSON.stringify, cyOf = s => s.fields.find(x => x.id === 'f_cy'), rawP = { v: 1, name: 'P', rolls: [], fields: [
            { id: 'f_gf', key: 'GearFac', label: 'Gear factor', kind: 'number', vis: 'all', edit: 'owner' },
            { id: 'f_gm', key: 'Secret', label: 'Secret', kind: 'number', vis: 'gm' },
            { id: 'f_cy', key: 'Cyber', label: 'Cyber', kind: 'item-list', edit: 'owner', vis: 'all', list: { price: 'cr', priceCol: 'limbcr', stats: [{ key: 'cr' }], cols: [{ key: 'LimbCr', label: 'Limb Cr', formula: 'Row.cr * GearFac' }, { key: 'Bad', formula: 'Nope + 1' }, { key: 'Hid', formula: 'Row.cr * Secret' }] } }],
            items: [{ id: 'i_arm', name: 'Arm', stats: { cr: 1908 } }] };
        const sysP = cleanSystem(rawP, { F, gmView: true }), spP = cyOf(sysP).list, withCol = k => cleanSystem(Object.assign({}, rawP, { fields: rawP.fields.slice(0, 2).concat([Object.assign({}, rawP.fields[2], { list: Object.assign({}, rawP.fields[2].list, { priceCol: k }) })]) }), { F, gmView: true });
        const addP = (s, gf, Fx, vals) => { const r = S.applyRowOp(s, { values: Object.assign({ f_gf: gf, f_gm: 3, f_cy: [] }, vals || {}) }, 'f_cy', { op: 'add', defId: 'i_arm', rowId: 'w_a1' }, Fx, {}); return r.ok ? r.value : r; };
        const merged = addP(sysP, 2, F, { f_cy: [{ id: 'w_a1', defId: 'i_arm', qty: 1, paid: 3816 }] });
        check('backlog 234: Price from names a column of the list, kept by its own spelling only beside a price stat and only where the list has that column, the same in both views; a row added records that column worked out for itself on the sheet that adds it (gear factor 2: 3816, gear factor 1: the listed 1908), and the price stat where no engine is at hand, the column errors or gives no number, or the players\' view blanks it; a list without it records the stat as before; an add that fills a stack keeps its Paid',
            spP.priceCol === 'LimbCr' && cyOf(cleanSystem(sysP, { F, gmView: false })).list.priceCol === 'LimbCr'
            && S.cleanListSpec({ priceCol: 'LimbCr', stats: [{ key: 'cr' }], cols: [{ key: 'LimbCr', formula: '1' }] }, F).priceCol === undefined && cyOf(withCol('Nothing')).list.priceCol === undefined
            && addP(sysP, 2, F)[0].paid === 3816 && addP(sysP, 1, F)[0].paid === 1908 && addP(sysP, 2, null)[0].paid === 1908 && addP(withCol('Bad'), 2, F)[0].paid === 1908
            && addP(cleanSystem(withCol('Hid'), { F, gmView: false }), 2, F)[0].paid === 1908 && cyOf(withCol('Hid')).list.priceCol === undefined && addP(withCol('Hid'), 2, F)[0].paid === 1908   /* the review of 234: a column that reads a GM-only value is no price in either view, so the host records the stat */ && addP(withCol(''), 2, F)[0].paid === 1908
            && merged.length === 1 && merged[0].qty === 2 && merged[0].paid === 3816
            && S.priceColOf(sysP, { values: { f_gf: 1.5 } }, cyOf(sysP), { id: 'w_x', defId: 'i_arm', qty: 1 }, F) === 2862 && S.priceColOf(sysP, null, sysP.fields[0], {}, F) === null,
            J([spP.priceCol, addP(sysP, 2, F), merged]));
        const shP = fs.readFileSync(path.join(app, 'scripts', 'sheets.js'), 'utf8').replace(/\r\n/g, '\n');
        check('backlog 234, the sheet and the editor: a buy\'s or a sale\'s price box reads the column for the row on that sheet; the Lists tab offers Price from beside Price, the Price stat or each column by its name, its own handler',
            shP.includes("pcv = sp && sp.priceCol && typeof priceColOf === 'function' ? priceColOf(sys, c, f, row, F()) : null;") && shP.includes("unit = priceUnit(sys, sp, row, c, f);") && shP.includes("unit = priceUnit(sys, sp, was, c, f);")
            && require('./checkkit').part('sysedlist.js').includes("pcs = el('select', 'sys-list-paycol');") && require('./checkkit').part('sysedtabs.js').includes("else if (c.indexOf('sys-list-paycol') >= 0) { if (t.value) lsc.priceCol = t.value; else delete lsc.priceCol; }") && require('./checkkit').part('sysedlist.js').includes("st = el('option', null, 'The Price stat');"));
    }

    // ---- the host's block (netcheck.js) ----
    /* ---- 1.5.6 trading on the wire: the host's trade branch, tradeDo and the API, and a player's tradeState branch, run for real ---- */
    pendingChecks.push((async () => {
        const url = f => 'file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', f)).replace(/[\\]/g, '/');
        const Sx = await import(url('systemcore.js')), Fx = await import(url('formula.js'));
        const nsT = src.split('\r\n').join('\n'), cutT = (a, b) => { const i = nsT.indexOf(a), k = nsT.indexOf(b, i); if (i < 0 || k < 0) throw new Error('trade slice ' + a.slice(0, 40)); return nsT.slice(i, k); };
        const apiT = require('./checkkit').cut('nettrade.js', '// [netcheck:trade-start]', '// [netcheck:trade-end]'),   // the trade lines, read from nettrade.js (a part of net.js) by its name
            brT = cutT('        // [netcheck:tradebranch-start]', '        // [netcheck:tradebranch-end]'), stT = cutT('        // [netcheck:tradestate-start]', '        // [netcheck:tradestate-end]');
        const sysT = Sx.cleanSystem({ v: 1, name: 'T', rolls: [], fields: [
            { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { trade: true, price: 'cr', stats: [{ key: 'cr', label: 'Cost' }] } },
            { id: 'f_chips', key: 'Chips', label: 'Chips', kind: 'item-list', edit: 'owner', vis: 'all', list: { trade: true, multi: true, lvl: { label: 'Stored value', min: 0, max: 1000, step: 0.01, def: 0, split: true } } }],
            items: [{ id: 'i_lamp', name: 'Lamp', stats: { cr: 20 } }, { id: 'i_chip', name: 'Glimmer chip' }, { id: 'i_gm', name: 'Cursed', vis: 'gm' }] }, { F: Fx, gmView: true });
        const mkW = (o) => {
            o = o || {};
            const camp = { id: 'k', system: o.sys || sysT, items: o.items || {}, chars: {
                c_1: { id: 'c_1', name: 'Kael', ownerId: 'u_a', npc: false, values: { f_chips: [{ id: 'w_k1', defId: 'i_chip', qty: 1, lvl: 500 }], f_gear: [] } },
                c_2: { id: 'c_2', name: 'Pebbles', ownerId: 'u_b', npc: false, values: {} },
                c_3: { id: 'c_3', name: 'Grunt', npc: true, values: { f_gear: [{ id: 'w_g1', defId: 'i_lamp', qty: 5 }, { id: 'w_g2', defId: 'i_gm', qty: 1 }], f_chips: [{ id: 'w_g9', defId: 'i_chip', qty: 1, lvl: 10 }] } },
                c_4: { id: 'c_4', name: 'Sela', npc: true, values: {} } } };
            const out = { a: [], b: [], gm: [], chat: [], logs: [], saves: 0, deltas: [], changed: [], waits: [], dones: [] };
            const box = b => m => { packCheck(m); b.push(JSON.parse(JSON.stringify(m))); };
            const conns = [{ peer: 'pA', open: true, send: box(out.a) }, { peer: 'pB', open: true, send: box(out.b) }];
            const net = { active: true, role: o.role || 'host', paused: !!o.paused, conns, myId: 'gm', roster: { pA: { id: 'u_a', name: 'Kael P' }, pB: { id: 'u_b', name: 'Bo P' } }, foreign: true, syncedPeer: 'H', stream: false };
            net.syncCharDelta = (id, v) => out.deltas.push([id, Object.keys(v).sort()]);
            if (o.loc) { net.roster.pA.location = o.loc; net.roster.pB.location = o.loc; } net.turnSpent = {}; net.turnMax = {}; net.combats = o.combats || {};
            const win = { wpFormula: Fx, wpVtt: { on: () => true }, wpSheets: { charChanged(id) { out.changed.push(id); } }, wpNotices: { wait: (k) => { out.waits.push(k); return true; }, done: (k) => { out.dones.push(k); } }, dispatchEvent: e => out.gm.push(e.detail) };
            function CustomEvent(type, init) { this.type = type; this.detail = init.detail; }
            const api = new Function('net', 'SC', 'window', 'getActiveCampaign', 'saveRemoteSoon', 'sendFailed', 'peerProfileId', 'logEvent', 'pushChat', 'CustomEvent', 'allow', 'peerPaused', 'toast', 'OPT',
                (o.pre || '') + apiT + '\nreturn { actsSendTo: typeof actsSendTo === "function" ? actsSendTo : null, tradeMoved: tradeMoved, tradeLost: tradeLost, tradeDo: tradeDo, tradeConnGone: tradeConnGone, trades: function() { return _trades; }, cleanTradeView: cleanTradeView, tradeKeep: tradeKeep,\n' +
                ' branch: function(msg, conn) { if (msg.type === "trade" && net.role === "host") {\n' + brT + '\n} },\n client: function(msg, conn) { if (msg.type === "tradeState" && net.role === "client") {\n' + stT + '\n} } };')(
                net, () => Sx, win, () => camp, () => { out.saves++; }, e => { throw e; }, c => (net.roster[c.peer] ? net.roster[c.peer].id : null), (k, tx) => out.logs.push([k, tx]), m => out.chat.push(JSON.parse(JSON.stringify(m))), CustomEvent,
                (name, cfg, peer) => o.limit !== true, () => false, m => out.toasts = (out.toasts || []).concat([m]), o);
            return { camp, out, net, api, conns };
        };
        const st = l => l.filter(m => m.type === 'tradeState').map(m => m.view ? m.view.status + ':' + m.view.you : 'refused:' + m.refused);
        {   // 1.6.0 a GM-only stat in a trade (the real trade branch): the row goes as it is on the host, and nothing a side is sent names it
            const sysF = Sx.cleanSystem({ v: 1, name: 'T', rolls: [], fields: [{ id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { trade: true, stats: [{ key: 'Flaw', label: 'Flaw', vis: 'gm', split: true }] } }, { id: 'f_chips', key: 'Chips', label: 'Chips', kind: 'item-list', edit: 'owner', vis: 'all', list: { trade: true } }], items: [{ id: 'i_lamp', name: 'Lamp', stats: { Flaw: 1 } }, { id: 'i_chip', name: 'Glimmer chip' }] }, { F: Fx, gmView: true });
            const M = mkW({ sys: sysF }), B = M.api, c0 = M.conns[0], c1 = M.conns[1]; M.camp.chars.c_1.values.f_gear = [{ id: 'w_f', defId: 'i_lamp', qty: 1, ov: { stats: { Flaw: 4 }, held: ['Flaw'] } }];
            B.branch({ type: 'trade', op: 'ask', from: 'c_1', to: 'c_2' }, c0); const tid = Object.keys(B.trades())[0]; B.branch({ type: 'trade', op: 'answer', tid, yes: true }, c1);
            B.branch({ type: 'trade', op: 'put', tid, offer: [{ fid: 'f_gear', rowId: 'w_f', qty: 1 }] }, c0); const split = (B.branch({ type: 'trade', op: 'put', tid, offer: [{ fid: 'f_gear', rowId: 'w_f', key: 'Flaw', amt: 1 }] }, c0), j(B.trades()[tid] ? B.trades()[tid].a : null));
            B.branch({ type: 'trade', op: 'put', tid, offer: [{ fid: 'f_gear', rowId: 'w_f', qty: 1 }] }, c0); B.branch({ type: 'trade', op: 'confirm', tid, on: true }, c0); B.branch({ type: 'trade', op: 'confirm', tid, on: true }, c1);
            const gained = (M.camp.chars.c_2.values.f_gear || [])[0];
            check('1.6.0 a GM-only stat in a trade (the real trade branch): a row that holds one is traded whole and keeps its figure on the host, nothing either side is sent names it, and it can never be offered as an amount',
                !!gained && !!gained.ov && gained.ov.stats.Flaw === 4 && !/flaw/i.test(j([M.out.a, M.out.b, M.out.chat])) && !/"key":"Flaw"/.test(split), j([gained, M.out.a.slice(-1), split]));
        }
        {   // 1.6.2 (backlog 226): a trade's line carries its picture and icon, the row's own picture else its entry's, through the core's cleaners, and a player's app cleans them again
            const sysP = Sx.cleanSystem({ v: 1, name: 'T', rolls: [], fields: JSON.parse(JSON.stringify(sysT.fields)),
                items: [{ id: 'i_lamp', name: 'Lamp', icon: 'icon:star', pic: '/saves/images/lamp.png', stats: { cr: 20 } }, { id: 'i_chip', name: 'Glimmer chip', icon: '*' }, { id: 'i_gm', name: 'Cursed', vis: 'gm', pic: '/saves/images/cursed.png' }] }, { F: Fx, gmView: true });
            const M = mkW({ sys: sysP }), B = M.api, c0 = M.conns[0];
            M.camp.chars.c_3.values.f_gear = [{ id: 'w_g1', defId: 'i_lamp', qty: 5, pic: '/saves/images/own-lamp.png' }, { id: 'w_g3', defId: 'i_lamp', qty: 1 }, { id: 'w_g4', defId: 'i_lamp', qty: 1, pic: 'https://evil.example/x.png' }, { id: 'w_g2', defId: 'i_gm', qty: 1 }];
            B.branch({ type: 'trade', op: 'ask', from: 'c_1', to: 'c_3' }, c0); const tid = Object.keys(B.trades())[0]; B.tradeDo({}, { op: 'answer', tid, yes: true });
            B.tradeDo({}, { op: 'put', tid, offer: [{ fid: 'f_gear', rowId: 'w_g1', qty: 1 }, { fid: 'f_gear', rowId: 'w_g3', qty: 1 }, { fid: 'f_gear', rowId: 'w_g4', qty: 1 }, { fid: 'f_gear', rowId: 'w_g2', qty: 1 }, { fid: 'f_chips', rowId: 'w_g9', qty: 1 }] });
            const vw = M.out.a.filter(m => m.view).slice(-1)[0].view, ln = vw.b.lines, face = ln.map(l => [l.rowId, l.pic || '', l.icon || '']);
            const Cp = mkW({ role: 'client' }), cl = Cp.api.cleanTradeView(vw), cl2 = Cp.api.cleanTradeView(Object.assign({}, vw, { b: Object.assign({}, vw.b, { lines: vw.b.lines.map(l => Object.assign({}, l, { pic: l.rowId === 'w_g1' ? '/saves/images/journal/x.png' : l.rowId === 'w_g3' ? 'javascript:alert(1)' : { a: 1 }, icon: '<b>x</b>'.repeat(40) })) }) }));
            check('backlog 226 a trade\'s lines carry their faces (the real trade branch): a row\'s own picture before its entry\'s, the entry\'s icon beside it, a row\'s own picture the cleaner refuses giving way to its entry\'s, a GM-only entry never offered; a player\'s app keeps a picture of the campaign\'s own and an icon, cleaned again, and drops any other picture',
                j(face) === j([['w_g1', '/saves/images/own-lamp.png', 'icon:star'], ['w_g3', '/saves/images/lamp.png', 'icon:star'], ['w_g4', '/saves/images/lamp.png', 'icon:star'], ['w_g9', '', '*']]) && !/cursed/.test(j([M.out.a, M.out.b]))
                && j(cl.b.lines.map(l => [l.pic || '', l.icon || ''])) === j(face.map(f => [f[1], f[2]])) && cl2.b.lines.every(l => !('pic' in l)) && cl2.b.lines.every(l => typeof l.icon === 'string' && l.icon.length <= 40 || !('icon' in l)), j([face, cl2.b.lines]));
        }
        {   // 1.6.0 A trade in a fight (combat.turn.trade): the host spends the action, with the real actSpend and the real Off a character's turn, and a player's message names none of it
            const acT = cutT('function actsMaxOf(camp, ch, map, w, c)', 'function turnActsStart(mapId, c)'), offT = cutT('// [netcheck:offturn-start]', '// [netcheck:offturn-end]');
            const pre = acT + offT + '\nfunction own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }\nfunction moveMode() { return OPT.mode || "refuse"; }\nfunction fightOfTok(m, t) { return OPT.fight && OPT.fight.rows.some(function(r) { return r.tokId === t; }) ? "f1" : null; }\nfunction orderOfIn(camp, charId) { var mp = camp.items.m1; return OPT.fight && OPT.fight.rows.some(function(r) { return mp.whiteboard.some(function(w) { return w.id === r.tokId && w.charId === charId; }); }) ? "f1" : ""; }\nfunction turnNote(conn, text) { OPT.notes.push(text); }\n';
            const sysC = t => { const s = JSON.parse(JSON.stringify(sysT)); s.combat = Object.assign({}, s.combat, { turn: t }); return s; }, ACT = { acts: [{ key: 'Action', n: 1, label: 'Action' }], trade: 'Action' };
            const mkF = (o2, turn) => { const fight = o2 && o2.noFight ? null : { id: 'f1', mapId: 'm1', turn: turn || 0, rows: [{ tokId: 't1' }, { tokId: 't2' }, { tokId: 't3' }] };
                return mkW(Object.assign({ sys: sysC(ACT), loc: 'm1', pre, notes: [], fight, combats: fight ? { f1: fight } : {}, items: { m1: { id: 'm1', type: 'map', whiteboard: [{ id: 't1', isChar: true, charId: 'c_1', ownerId: 'u_a' }, { id: 't2', isChar: true, charId: 'c_2', ownerId: 'u_b' }, { id: 't3', isChar: true, charId: 'c_3' }] } } }, o2)); };
            const pass = (M, from, to, offA, offB, other) => { const B = M.api, c0 = M.conns[0], by2 = other ? m => B.branch(Object.assign({ type: 'trade' }, m), other) : m => B.tradeDo({}, m);
                B.branch({ type: 'trade', op: 'ask', from, to }, c0); const tid = Object.keys(B.trades())[0]; by2({ op: 'answer', tid, yes: true }); if (offA) B.branch({ type: 'trade', op: 'put', tid, offer: offA }, c0); if (offB) by2({ op: 'put', tid, offer: offB });
                B.branch({ type: 'trade', op: 'confirm', tid, on: true }, c0); by2({ op: 'confirm', tid, on: true }); return tid; };
            const CHIP = [{ fid: 'f_chips', rowId: 'w_k1', key: '@lvl', amt: 40 }], LAMP = [{ fid: 'f_gear', rowId: 'w_g1', qty: 1 }], OWN = [{ fid: 'f_gear', rowId: 'w_p1', qty: 1 }], lvlOf = M => M.camp.chars.c_1.values.f_chips[0].lvl, spent = (M, id) => (M.net.turnSpent[id] || {}).Action || 0;
            const open = M => M.out.a.filter(m => m.view && m.view.status === 'open').slice(-1)[0].view, said = M => open(M).msg;

            const A = mkF(); pass(A, 'c_1', 'c_3', CHIP); const leftA = A.out.a.filter(m => m.type === 'acts-left').slice(-1)[0];
            check('1.6.0 A trade in a fight: a player\'s side that gives spends the action the system names as the trade completes, on the host, told what is left; the GM\'s side spends nothing',
                spent(A, 'c_1') === 1 && spent(A, 'c_3') === 0 && !Object.keys(A.api.trades()).length && lvlOf(A) === 460 && !!leftA && leftA.left.Action === 0 && A.out.saves >= 1, JSON.stringify([A.net.turnSpent, leftA, lvlOf(A)]));
            const savesA = A.out.saves; const t2 = pass(A, 'c_1', 'c_3', CHIP), refA = said(A), heldA = A.api.trades()[t2];
            check('1.6.0 A trade in a fight: with no action left it is refused before anything moves, both confirms cleared and both sides told who is short',
                refA === 'Kael: No Action left this turn.' && lvlOf(A) === 460 && spent(A, 'c_1') === 1 && A.out.saves === savesA && !!heldA && heldA.okA === false && heldA.okB === false && heldA.status === 'open', j([refA, lvlOf(A), A.out.saves, savesA]));
            const T = mkF(); pass(T, 'c_1', 'c_3', null, LAMP);
            check('1.6.0 A trade in a fight: one who only takes spends nothing', spent(T, 'c_1') === 0 && T.camp.chars.c_1.values.f_gear.length === 1 && !Object.keys(T.api.trades()).length, j(T.net.turnSpent));
            const mkSwap = o2 => { const M = mkF(o2); M.camp.chars.c_2.values.f_gear = [{ id: 'w_p1', defId: 'i_lamp', qty: 2 }]; return M; };
            const S1 = mkSwap(); pass(S1, 'c_1', 'c_2', CHIP, OWN, S1.conns[1]);
            const S2 = mkSwap(); S2.net.turnSpent.c_2 = { Action: 1 }; pass(S2, 'c_1', 'c_2', CHIP, OWN, S2.conns[1]);
            check('1.6.0 A trade in a fight: a swap is two hand-overs, so both sides pay, and one side short of its action costs the other nothing and moves nothing',
                spent(S1, 'c_1') === 1 && spent(S1, 'c_2') === 1 && lvlOf(S1) === 460 && spent(S2, 'c_1') === 0 && spent(S2, 'c_2') === 1 && lvlOf(S2) === 500 && said(S2) === 'Pebbles: No Action left this turn.', j([S1.net.turnSpent, S2.net.turnSpent, said(S2)]));
            const W = mkF({ mode: 'warn' }); W.net.turnSpent.c_1 = { Action: 1 }; pass(W, 'c_1', 'c_3', CHIP); const Of = mkF({ mode: 'off' }); pass(Of, 'c_1', 'c_3', CHIP);
            check('1.6.0 A trade in a fight: the table\'s Warn lets it through past what a turn allows and tells the GM, and Off counts nothing', lvlOf(W) === 460 && spent(W, 'c_1') === 2 && (W.out.toasts || []).some(m => /past what a turn allows/.test(m)) && lvlOf(Of) === 460 && spent(Of, 'c_1') === 0, j([lvlOf(W), W.out.toasts, Of.net.turnSpent]));
            const N1 = mkF({ sys: sysC({ acts: ACT.acts }) }); pass(N1, 'c_1', 'c_3', CHIP); const nV = N1.out.a.filter(m => m.view).map(m => m.view); const N2 = mkF({ noFight: true }); pass(N2, 'c_1', 'c_3', CHIP); const nV2 = N2.out.a.filter(m => m.view).map(m => m.view);
            check('1.6.0 A trade in a fight: a system that names no action costs nothing and says nothing, and out of a fight nothing changes', lvlOf(N1) === 460 && spent(N1, 'c_1') === 0 && !nV.some(v => 'cost' in v) && N1.net.tradeFights() === false && lvlOf(N2) === 460 && spent(N2, 'c_1') === 0 && !nV2.some(v => 'cost' in v), j([N1.net.turnSpent, N2.net.turnSpent]));
            const costM = mkF(); costM.api.branch({ type: 'trade', op: 'ask', from: 'c_1', to: 'c_3' }, costM.conns[0]); const tC0 = Object.keys(costM.api.trades())[0]; costM.api.tradeDo({}, { op: 'answer', tid: tC0, yes: true }); const vC = open(costM);
            const cl = costM.api.cleanTradeView(Object.assign({}, vC, { cost: 'x'.repeat(200) })), cl2 = costM.api.cleanTradeView(Object.assign({}, vC, { cost: { a: 1 } }));
            check('1.6.0 A trade in a fight: the window says what giving spends, and a player\'s app keeps that word only as short text', vC.cost === 'Giving in this fight costs Kael one Action.' && cl.cost.length === 200 && !('cost' in cl2) && costM.net.tradeFights() === true, j([vC.cost, cl.cost.length, cl2.cost]));
            const twoM = mkF(); twoM.api.branch({ type: 'trade', op: 'ask', from: 'c_1', to: 'c_2' }, twoM.conns[0]); const tTw = Object.keys(twoM.api.trades())[0]; twoM.api.branch({ type: 'trade', op: 'answer', tid: tTw, yes: true }, twoM.conns[1]);
            check('1.6.0 A trade in a fight: the window names both sides where both would pay', open(twoM).cost === 'Giving in this fight costs Kael and Pebbles one Action each.', j(open(twoM).cost));
            const S0 = mkF(); S0.net.turnSpent.c_1 = { Action: 1 }; S0.conns[0].sent = []; S0.api.actsSendTo(S0.conns[0]); const sN = S0.out.a.filter(m => m.type === 'acts-left').slice(-1)[0];
            const S1b = mkF({ noFight: true }), nb0 = S1b.out.a.filter(m => m.type === 'acts-left').length; S1b.api.actsSendTo(S1b.conns[0]);
            check('1.6.0 the turn strip: one who comes to the table mid-turn hears what their own character in a fight has left, and nothing with no fight', !!sN && sN.charId === 'c_1' && j(sN.left) === j({ Action: 0 }) && sN.mode === 'refuse' && S1b.out.a.filter(m => m.type === 'acts-left').length === nb0, j([sN]));
            A.net.role = 'host'; Of.net.role = 'host'; const nowA = A.net.actsNow('c_1'), nowNpc = A.net.actsNow('c_3'), nowOff = Of.net.actsNow('c_1'); const P = mkF(); P.net.role = 'client'; P.net.actsLeft = { c_1: { left: { Action: 1 }, mode: 'warn' }, c_2: { left: { Action: 1 }, mode: 'off' } };
            check('1.6.0 the turn strip\'s question: the host answers what a player\'s character has left, nothing for an NPC, whose actions the GM counts, nor where actions are not counted; a player\'s app answers what the host last told it, and nothing under Off',
                j(nowA) === j({ left: { Action: 0 }, mode: 'refuse' }) && nowNpc === null && nowOff === null && P.net.actsNow('c_1').left.Action === 1 && P.net.actsNow('c_2') === null && P.net.actsNow('c_3') === null, j([nowA, nowNpc, nowOff]));
            const Bar = mkF({ sys: sysC(Object.assign({ off: 'refuse' }, ACT)) }, 1); pass(Bar, 'c_1', 'c_3', CHIP); const Hold = mkF({ sys: sysC(Object.assign({ off: 'refuse' }, ACT)) }, 1); Hold.net.combats.f1.rows[0].held = 1; pass(Hold, 'c_1', 'c_3', CHIP);
            const notesW = [], Wn = mkF({ sys: sysC(Object.assign({ off: 'warn' }, ACT)), notes: notesW }, 1); pass(Wn, 'c_1', 'c_3', CHIP); const Free = mkF({ sys: sysC(Object.assign({ off: 'refuse' }, ACT)) }, 1); pass(Free, 'c_1', 'c_3', null, LAMP);
            check('1.6.0 A trade in a fight: Off a character\'s turn judges the side that gives: refused off their turn with the GM told, through for a held turn, with a word under Warn, and one who only takes is not judged',
                said(Bar) === 'It is not Kael\u2019s turn.' && lvlOf(Bar) === 500 && spent(Bar, 'c_1') === 0 && (Bar.out.toasts || []).some(m => /tried a trade out of turn/.test(m)) && lvlOf(Hold) === 460 && spent(Hold, 'c_1') === 1
                && lvlOf(Wn) === 460 && spent(Wn, 'c_1') === 1 && (Wn.out.toasts || []).some(m => /traded out of turn/.test(m)) && notesW.includes('It is not your turn. The GM is told.') && Free.camp.chars.c_1.values.f_gear.length === 1, j([said(Bar), Bar.out.toasts, lvlOf(Bar), lvlOf(Hold), lvlOf(Wn), Wn.out.toasts, notesW, st(Free.out.a).slice(-1)]));
        }
        {   // 1.6.0, found by hand: the GM took away a row on offer and the window went on showing it until a Confirm was refused
            const M = mkW(), B = M.api; M.net.syncCharDelta = id => B.tradeMoved(id);
            B.branch({ type: 'trade', op: 'ask', from: 'c_1', to: 'c_3' }, M.conns[0]); const tidM = Object.keys(B.trades())[0]; B.tradeDo({}, { op: 'answer', tid: tidM, yes: true });
            B.tradeDo({}, { op: 'put', tid: tidM, offer: [{ fid: 'f_gear', rowId: 'w_g1', qty: 2 }] }); B.branch({ type: 'trade', op: 'confirm', tid: tidM, on: true }, M.conns[0]);
            const n0 = M.out.a.length; M.camp.chars.c_1.values.f_gear = [{ id: 'w_x', defId: 'i_lamp', qty: 1 }]; B.tradeMoved('c_1'); const quiet = M.out.a.length === n0;
            M.camp.chars.c_3.values.f_gear = [{ id: 'w_g1', defId: 'i_lamp', qty: 1 }, { id: 'w_g2', defId: 'i_gm', qty: 1 }]; B.tradeMoved('c_3'); const less = M.out.a.filter(m => m.view).slice(-1)[0].view;
            B.branch({ type: 'trade', op: 'confirm', tid: tidM, on: true }, M.conns[0]); M.camp.chars.c_3.values.f_gear = []; B.tradeMoved('c_3'); const gone = M.out.a.filter(m => m.view).slice(-1)[0].view;
            check('a trade window follows a row on offer (tradeMoved, run for real): a change to a row not on offer says nothing and clears no confirm; a row on offer that shrinks clears both confirms and says to confirm again; one that goes leaves the table in the window, as the host reads it',
                quiet && less.a.ok === false && /confirm again/.test(less.msg || '') && gone.b.lines.length === 0 && gone.a.ok === false, j([quiet, less.msg, gone.b.lines]));
            const D = mkW(), E = D.api; D.net.syncCharDelta = id => E.tradeMoved(id);
            E.branch({ type: 'trade', op: 'ask', from: 'c_1', to: 'c_3' }, D.conns[0]); const tidD = Object.keys(E.trades())[0]; E.tradeDo({}, { op: 'answer', tid: tidD, yes: true }); E.tradeDo({}, { op: 'put', tid: tidD, offer: [{ fid: 'f_gear', rowId: 'w_g1', qty: 2 }] });
            E.branch({ type: 'trade', op: 'confirm', tid: tidD, on: true }, D.conns[0]); E.tradeDo({}, { op: 'confirm', tid: tidD, on: true }); const lastD = D.out.a.filter(m => m.view).slice(-1)[0].view;
            check('a trade that completes is not told its own rows changed: it ends done, with no word to confirm again', lastD.status === 'done' && !/confirm again/.test(lastD.msg || '') && Object.keys(E.trades()).length === 0, j(lastD));
        }
        // a player asks the GM's NPC, the GM answers, both put and confirm
        const W = mkW(), A = W.api;
        A.branch({ type: 'trade', op: 'ask', from: 'c_1', to: 'c_3' }, W.conns[0]);
        const tid = Object.keys(A.trades())[0], afterAsk = [st(W.out.a), W.out.gm.map(v => v.status + ':' + v.you), W.out.waits.slice()];
        const gmYes = A.tradeDo({}, { op: 'answer', tid, yes: true });
        A.branch({ type: 'trade', op: 'put', tid, offer: [{ fid: 'f_chips', rowId: 'w_k1', key: '@lvl', amt: 40 }] }, W.conns[0]);
        A.tradeDo({}, { op: 'put', tid, offer: [{ fid: 'f_gear', rowId: 'w_g1', qty: 2 }, { fid: 'f_gear', rowId: 'w_g2', qty: 1 }] });
        A.branch({ type: 'trade', op: 'confirm', tid, on: true }, W.conns[0]);
        const lastA = W.out.a.filter(m => m.view).slice(-1)[0].view;
        A.tradeDo({}, { op: 'put', tid, offer: [{ fid: 'f_gear', rowId: 'w_g1', qty: 2 }] });   // a change clears both confirms
        const cleared = W.out.a.filter(m => m.view).slice(-1)[0].view;
        A.branch({ type: 'trade', op: 'confirm', tid, on: true }, W.conns[0]); const savesBefore = W.out.saves; A.tradeDo({}, { op: 'confirm', tid, on: true });
        const kael = W.camp.chars.c_1, grunt = W.camp.chars.c_3;
        check('1.5.6 trading (the host, run for real): a player asks the GM\'s NPC and waits, the GM is asked on its own screen and in the bell; the GM says yes and the window opens for both; each side puts its offer (a GM-only row of the NPC never on the table); the player\'s view shows the NPC\'s lamps with their price; a change after a confirm clears both confirms and says so; when both confirm, everything moves at once: 40 of the chip\'s 500 to the NPC\'s chip, two lamps to the player, one save, both deltas, both sheets told, a private line to the player and the GM, and the trade forgotten with done said to both',
            j(afterAsk[0]) === j(['asking:a']) && j(afterAsk[1]) === j(['asking:b']) && j(afterAsk[2]) === j(['trade:' + tid]) && gmYes.ok === true && W.out.a.some(m => m.view && m.view.status === 'open')
            && lastA.b.lines.length === 1 && lastA.b.lines[0].name === 'Lamp' && lastA.b.lines[0].price === 20 && lastA.a.ok === true && cleared.a.ok === false && cleared.b.ok === false && /confirm again/.test(cleared.msg || '')
            && kael.values.f_chips[0].lvl === 460 && grunt.values.f_chips[0].lvl === 50 && kael.values.f_gear.length === 1 && kael.values.f_gear[0].qty === 2 && grunt.values.f_gear[0].qty === 3 && W.out.saves === savesBefore + 1
            && j(W.out.deltas) === j([['c_1', ['f_chips', 'f_gear']], ['c_3', ['f_chips', 'f_gear']]]) && j(W.out.changed) === j(['c_1', 'c_3']) && W.out.chat.length === 1 && /Kael gave 40 Stored value from Glimmer chip\. Grunt gave Lamp x2\./.test(W.out.chat[0].text)
            && W.out.a.some(m => m.type === 'chat') && W.out.b.length === 0 && Object.keys(A.trades()).length === 0 && W.out.a.filter(m => m.view).slice(-1)[0].view.status === 'done' && W.out.gm.slice(-1)[0].status === 'done' && W.out.dones.indexOf('trade:' + tid) >= 0,
            j([afterAsk, W.out.a.map(m => m.view ? m.view.status : m.type), W.out.chat, kael.values, grunt.values]));
        // the receiver picks a chip: the GM, receiving for the NPC, picks A new one; the player's view never names the NPC's rows
        const P = mkW(), PA = P.api;
        PA.branch({ type: 'trade', op: 'ask', from: 'c_1', to: 'c_3' }, P.conns[0]); const tP = Object.keys(PA.trades())[0]; PA.tradeDo({}, { op: 'answer', tid: tP, yes: true });
        PA.branch({ type: 'trade', op: 'put', tid: tP, offer: [{ fid: 'f_chips', rowId: 'w_k1', key: '@lvl', amt: 40 }] }, P.conns[0]);
        const gmGets = P.out.gm.slice(-1)[0].b.gets, plView = P.out.a.filter(m => m.view).slice(-1)[0].view;
        PA.branch({ type: 'trade', op: 'confirm', tid: tP, on: true }, P.conns[0]);
        const pickR = PA.tradeDo({}, { op: 'into', tid: tP, fid: 'f_chips', row: '+' }), afterPick = P.out.a.filter(m => m.view).slice(-1)[0].view, gmPick = P.out.gm.slice(-1)[0].b.gets[0].pick;
        const badFid = PA.tradeDo({}, { op: 'into', tid: tP, fid: 'f_skill', row: '+' }), badRow = PA.tradeDo({}, { op: 'into', tid: tP, fid: 'f_chips', row: '<x>' });
        PA.branch({ type: 'trade', op: 'confirm', tid: tP, on: true }, P.conns[0]); PA.tradeDo({}, { op: 'confirm', tid: tP, on: true });
        const gChips = P.camp.chars.c_3.values.f_chips;
        check('1.5.6 trading, the receiver picks a chip (the host, run for real): the view of the one who receives an amount lists their own rows it may land on with what each holds, the first that fits picked; the other side\'s view names none of them; a pick clears both confirms and says so; a list that is not Tradable or a row that is no id is refused; once both confirm the 40 lands where it was picked, a chip of its own, and the NPC\'s other chip keeps its 10',
            Array.isArray(gmGets) && gmGets.length === 1 && gmGets[0].fid === 'f_chips' && gmGets[0].pick === '' && j(gmGets[0].opts.map(o => [o.rowId, o.cur])) === j([['w_g9', 10]]) && gmGets[0].label === 'Stored value'
            && plView.a.gets === undefined && plView.b.gets === undefined && pickR.ok === true && afterPick.a.ok === false && /confirm again/.test(afterPick.msg || '') && gmPick === '+'
            && typeof badFid.error === 'string' && typeof badRow.error === 'string' && gChips.length === 2 && gChips[0].lvl === 10 && gChips[1].lvl === 40 && P.camp.chars.c_1.values.f_chips[0].lvl === 460,
            j([gmGets, plView, gChips]));
        const cg = PA.cleanTradeView({ tid: 't_abcdefgh', status: 'open', you: 'b', a: { charId: 'c_1', name: 'K', lines: [] }, b: { charId: 'c_3', name: 'G', lines: [], gets: [{ fid: 'f_chips', list: '<i>Chips</i>', label: 'Stored\u202e', pick: '<x>', opts: [{ rowId: 'w_g9', name: 'Chip', cur: 10 }, { rowId: '__x y', name: 'Bad' }, { rowId: 'w_g8', name: 9, cur: 'many' }, null] }, 'junk', { fid: 7 }] } });
        check('1.5.6 trading, a player\'s app cleans the rows it is offered to receive on: ids by their pattern, names and labels as text, a figure only as a number, a pick that is no id read as the first that fits, junk dropped',
            cg && cg.b.gets.length === 1 && cg.b.gets[0].pick === '' && cg.b.gets[0].label === 'Stored' && j(cg.b.gets[0].opts) === j([{ rowId: 'w_g9', name: 'Chip', cur: 10 }, { rowId: 'w_g8', name: 'Item', cur: null }]) && cg.a.gets === undefined, j(cg));
        {   // 1.6.0 (v2): a row traded whole takes what it granted and the parts it holds, through the host's one judge
            const C = mkW(), CA = C.api; C.camp.system = Sx.cleanSystem({ v: 1, name: 'C', rolls: [], fields: [
                { id: 'f_gear', key: 'Gear', label: 'Gear', kind: 'item-list', edit: 'owner', vis: 'all', list: { trade: true, parts: { from: 'f_mods', cats: ['Mod'] } } },
                { id: 'f_mods', key: 'Mods', label: 'Mods', kind: 'item-list', edit: 'owner', vis: 'all', list: { trade: true } },
                { id: 'f_abil', key: 'Abil', label: 'Abilities', kind: 'item-list', edit: 'owner', vis: 'all', list: { trade: true, noQty: true } }],
                items: [{ id: 'i_staff', name: 'Staff', category: 'Gear', grants: [{ list: 'f_abil', entry: 'i_glow' }] }, { id: 'i_glow', name: 'Glow' }, { id: 'i_gem', name: 'Gem', category: 'Mod' }] }, { F: Fx, gmView: true });
            C.camp.chars.c_1.values = { f_gear: [{ id: 'w_st', defId: 'i_staff', qty: 1 }], f_mods: [{ id: 'w_gm', defId: 'i_gem', qty: 1, in: 'w_st' }], f_abil: [{ id: 'w_gl', defId: 'i_glow', qty: 1, gr: 'w_st' }] };
            C.camp.chars.c_3.values = {};
            CA.branch({ type: 'trade', op: 'ask', from: 'c_1', to: 'c_3' }, C.conns[0]); const tC = Object.keys(CA.trades())[0]; CA.tradeDo({}, { op: 'answer', tid: tC, yes: true });
            CA.branch({ type: 'trade', op: 'put', tid: tC, offer: [{ fid: 'f_abil', rowId: 'w_gl', qty: 1 }] }, C.conns[0]);
            const apart = C.out.a.filter(m => m.view).slice(-1)[0].view.a.lines.length;
            CA.branch({ type: 'trade', op: 'put', tid: tC, offer: [{ fid: 'f_gear', rowId: 'w_st', qty: 1 }] }, C.conns[0]);
            const lineC = C.out.a.filter(m => m.view).slice(-1)[0].view.a.lines;
            CA.branch({ type: 'trade', op: 'confirm', tid: tC, on: true }, C.conns[0]); CA.tradeDo({}, { op: 'confirm', tid: tC, on: true });
            const kv = C.camp.chars.c_1.values, gv = C.camp.chars.c_3.values, stG = (gv.f_gear || [])[0];
            check('1.6.0 trading what a row holds (the host, run for real): a granted row put on the table alone is never offered; the staff\'s line says what goes with it; once both confirm the staff, its part and the row it granted leave the player together and land on the NPC linked to the staff there, with one delta for each list each side touched and the private line saying so',
                apart === 0 && lineC.length === 1 && lineC[0].name === 'Staff, with 2 more' && j(kv.f_gear) === '[]' && j(kv.f_mods) === '[]' && j(kv.f_abil) === '[]' && stG && stG.defId === 'i_staff'
                && gv.f_mods.length === 1 && gv.f_mods[0].in === stG.id && gv.f_abil.length === 1 && gv.f_abil[0].gr === stG.id
                && j(C.out.deltas) === j([['c_1', ['f_abil', 'f_gear', 'f_mods']], ['c_3', ['f_abil', 'f_gear', 'f_mods']]]) && /Kael gave Staff, with 2 more\./.test((C.out.chat[0] || {}).text || ''), j([apart, lineC, kv, gv, C.out.deltas, C.out.chat]));
        }
        // refusals
        const R = mkW(), RA = R.api;
        RA.branch({ type: 'trade', op: 'ask', from: 'c_2', to: 'c_3' }, R.conns[0]);   // not theirs
        RA.branch({ type: 'trade', op: 'ask', from: 'c_1', to: 'c_1' }, R.conns[0]);
        RA.branch({ type: 'trade', op: 'ask', from: 'c_1', to: 'c_3' }, R.conns[0]); const tR = Object.keys(RA.trades())[0];
        RA.branch({ type: 'trade', op: 'ask', from: 'c_2', to: 'c_3' }, R.conns[1]);   // the NPC is busy
        RA.branch({ type: 'trade', op: 'answer', tid: tR, yes: true }, R.conns[0]);   // only the side asked answers
        RA.branch({ type: 'trade', op: 'cancel', tid: tR }, R.conns[1]);   // not their trade
        const npcPair = RA.tradeDo({}, { op: 'ask', from: 'c_4', to: 'c_3' });
        RA.branch({ type: 'trade', op: 'ask' }, { peer: 'zz', open: true, send: () => { throw new Error('a stranger is answered'); } });
        check('1.5.6 trading (the host): a character not theirs, a trade with itself and an NPC already in a trade are refused in words to that player alone; only the side asked answers; another player cannot end a trade not theirs; two NPCs trade by hand; a connection not admitted is not answered; one trade at a time',
            j(st(R.out.a)) === j(['refused:You can only trade for your own character.', 'refused:That trade cannot start.', 'asking:a', 'refused:There is nothing to answer.']) && j(st(R.out.b)) === j(['refused:Grunt is trading with someone else. Ask again in a moment.', 'refused:That trade is not yours.'])
            && typeof npcPair.error === 'string' && Object.keys(RA.trades()).length === 1, j([st(R.out.a), st(R.out.b), npcPair]));
        // the GM trades both sides for a player who is away; a paused table; the last connection closing
        const G = mkW(); G.net.conns = [G.conns[1]]; const gA = G.api.tradeDo({}, { op: 'ask', from: 'c_3', to: 'c_1' }), tG = Object.keys(G.api.trades())[0];
        const gView = G.out.gm.slice(-1)[0];
        G.api.tradeDo({}, { op: 'put', tid: tG, side: 'a', offer: [{ fid: 'f_gear', rowId: 'w_g1', qty: 1 }] }); G.api.tradeDo({}, { op: 'confirm', tid: tG, side: 'a', on: true }); G.api.tradeDo({}, { op: 'confirm', tid: tG, side: 'b', on: true });
        const Pz = mkW({ paused: true }), pz = Pz.api.tradeDo({}, { op: 'ask', from: 'c_3', to: 'c_1' });
        const C = mkW(); C.api.branch({ type: 'trade', op: 'ask', from: 'c_1', to: 'c_3' }, C.conns[0]); C.api.tradeConnGone('u_a');
        check('1.5.6 trading (the host): with the player away the GM holds both sides in one view and moves the lamp; a paused table refuses; a player\'s last connection closing ends their trade and the GM is told',
            gA.ok && gView.status === 'open' && gView.you === 'both' && G.camp.chars.c_1.values.f_gear[0].qty === 1 && G.camp.chars.c_3.values.f_gear[0].qty === 4 && typeof pz.error === 'string' && Object.keys(Pz.api.trades()).length === 0
            && Object.keys(C.api.trades()).length === 0 && C.out.gm.slice(-1)[0].status === 'cancelled' && /left the table/.test(C.out.gm.slice(-1)[0].msg), j([gView, C.out.gm]));
        // a player's app: the host's view cleaned again, from the synced host only
        const Cl = mkW({ role: 'client' }), host = { peer: 'H' }, other = { peer: 'X' }, good = { tid: 't_abcdefgh', status: 'open', you: 'a', a: { charId: 'c_1', name: 'Kael', ok: false, lines: [{ fid: 'f_gear', rowId: 'w_1', name: 'Lamp', list: 'Gear', qty: 2, price: 20 }] }, b: { charId: 'c_3', name: 'Grunt', ok: true, lines: [] } };
        Cl.api.client({ type: 'tradeState', view: good }, other); const fromOther = Cl.out.gm.length;
        Cl.api.client({ type: 'tradeState', view: good }, host); const kept = Cl.out.gm.slice(-1)[0];
        const bad = [Object.assign({}, good, { tid: '__proto__' }), Object.assign({}, good, { status: 'own' }), Object.assign({}, good, { a: { charId: 'x', name: 'K', lines: [] } }), null, 'x'].map(v => Cl.api.cleanTradeView(v));
        const ugly = Cl.api.cleanTradeView(Object.assign({}, good, { a: { charId: 'c_1', name: '<b>K\u202e</b>', ok: 'yes', lines: [{ fid: 'f', rowId: 'w', name: 7, qty: -1 }, { fid: 'f', rowId: 'w', name: 'Lamp', qty: 2.7, price: 'x' }, { fid: 'f', rowId: 'w', key: '@lvl', amt: 'no' }] } }));
        Cl.api.client({ type: 'tradeState', refused: 'Nope\u0007.' }, host);
        check('1.5.6 trading (a player\'s app): a host\'s view taken from the synced host alone and cleaned again, ids by their patterns, names as text, numbers as numbers, an ok only as true; a view that is no view kept as nothing; a refusal said as plain text',
            fromOther === 0 && kept.tid === 't_abcdefgh' && kept.a.lines[0].price === 20 && bad.every(b => b === null) && ugly.a.name === '<b>K </b>' && ugly.a.ok === false && ugly.a.lines.length === 1 && ugly.a.lines[0].qty === 2 && ugly.a.lines[0].price === undefined && j(Cl.out.toasts) === j(['Nope .']),
            j([kept, ugly, Cl.out.toasts]));
        const Lo = mkW({ role: 'client' }); Lo.api.client({ type: 'tradeState', view: good }, host); Lo.api.tradeLost('Gone.'); Lo.api.tradeLost('Again.');
        const loE = Lo.out.gm.slice(-1)[0], loN = Lo.out.gm.filter(v => v.status === 'cancelled').length;
        check('1.6.0 trading: a trade open on a player\'s screen when its connection went ends there once, with the words given; a table taken afresh and a table left each say so',
            loE.status === 'cancelled' && loE.msg === 'Gone.' && loE.tid === 't_abcdefgh' && loN === 1 && /tradeLost\('The connection dropped/.test(nsT) && /if \(!silent && typeof tradeLost === 'function'\)/.test(nsT), j(Lo.out.gm));
        check('1.5.6 trading (pinned): one host branch for trade, its step judged in one place (tradeDo), the GM\'s side local; a trade ends with a player\'s last connection and a new table starts with none',
            (nsT.match(/msg\.type === 'trade' && net\.role === 'host'/g) || []).length === 1 && nsT.indexOf("if (net.role === 'host' && typeof fogDragSweep === 'function') fogDragSweep();") >= 0 && /tradeConnGone\(p\.id\);/.test(nsT) && /diceSessionReset\(true\);[^\n]*\n\s*if \(typeof tradeForget === 'function'\) tradeForget\(\);/.test(nsT));
    })());

    await T.finish();
})();
