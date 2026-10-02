/* Offline check of the cleanup classifier (system/app/scripts/cleanup.js) against synthetic saves.
   A GM state with rooms, characters, a hidden token, an owned token, planners and picture categories is
   pushed through a faithful copy of the sanitizer from net.js (sanitizeItem / sanitizeAppState), so every
   fingerprint class exists; the fixtures below are that output and hand-made variations of it. The
   expected tier per fixture follows docs/FOREIGN_DATA_FIX_AND_CLEANUP.md section 4.3 with the owner
   overrides of 2026-09-18. The last check reads saves/data.json READ-ONLY, prints counts only, and is
   skipped when the file is absent. Usage: node tools/cleanupcheck.js   (exit 1 on any failure) */
'use strict';
const fs = require('fs');
const path = require('path');
const mod = path.join(__dirname, '..', 'system', 'app', 'scripts', 'cleanup.js');

/* ---- the sanitizer, as net.js has it ---- */
let DOC = null;   // docrender.js, loaded before the first sanitize call
function sanitizeItem(item) {
    if (!item) return item;
    if (item.type === 'planner') return null;
    if (item.type === 'doc') return DOC ? DOC.cleanDoc(item) : null;
    if (item.type !== 'map') return item;
    var m = JSON.parse(JSON.stringify(item));
    (m.rooms || []).forEach(function(r) {
        delete r.notes;
        delete r.handoutId;
        (r.characters || []).forEach(function(c) { delete c.info; delete c.ref; });
    });
    m.links = (m.links || []).map(function(lk) {
        if (!(lk[3] && typeof lk[3] === 'object')) return lk;
        var keep = lk.slice(0, 3); if (lk[3].label) keep.push({ label: lk[3].label }); return keep;
    });
    m.whiteboard = (m.whiteboard || []).filter(function(w) { return !w.gmNoteFor; }).map(function(w) {
        if (!w.hidden) {
            if (w.sheet) { w = JSON.parse(JSON.stringify(w)); delete w.sheet; }
            return w;
        }
        return { id: w.id, type: 'rect', hidden: true, x: w.x, y: w.y, w: w.w, h: w.h, rot: w.rot || 0, layer: w.layer, locked: true };
    });
    return m;
}
// The sanitizer as it was before 1.5.0 carried every campaign of the GM's (a session carries the hosted one alone since the owner's answer of
// 2026-09-29): saves written then still hold them, and that is what the classifier is given, so this copy keeps them all on purpose
function sanitizeAppState(s) {
    var c = JSON.parse(JSON.stringify(s));
    delete c.imageCats;
    delete c._foreign; delete c._cleanup; delete c._picsV;
    Object.values(c.campaigns || {}).forEach(function(camp) {
        delete camp._foreign; delete camp._keptByUser;
        delete camp.players;
        delete camp.bannedPlayers;
        delete camp.handouts;
        delete camp.handoutReveals;
        delete camp.handoutLog;
        delete camp.cast;
        delete camp.pinnedMaps;
        delete camp.sessionLog;
        delete camp.pictures; delete camp.imageCats;
        delete camp.sounds;
        delete camp.chars;   // per recipient in the real one; the mirror is nobody's copy
        if (camp.system) camp.system = { v: 1, fields: (camp.system.fields || []).filter(function(f) { return f.vis !== 'gm'; }), rolls: (camp.system.rolls || []).filter(function(r) { return r.vis !== 'gm'; }), sheet: { sections: [] } };
        Object.keys(camp.items).forEach(function(id) {
            if (camp.items[id] && camp.items[id].type === 'doc' && camp.id !== c.activeCampaignId) { delete camp.items[id]; return; }
            var it = sanitizeItem(camp.items[id]);
            if (it === null) delete camp.items[id];
            else camp.items[id] = it;
        });
        var actS = camp.items[camp.activeItemId];
        if (!actS || actS.type !== 'map') camp.activeItemId = Object.keys(camp.items).find(function(id) { return camp.items[id].type === 'map'; }) || null;
    });
    return c;
}

/* ---- fixtures ---- */
const clone = o => JSON.parse(JSON.stringify(o));
function room(id, notes) { return { id, x: 100, y: 100, name: id, notes: notes === undefined ? 'GM prep for ' + id : notes, characters: [{ name: 'Someone', info: 'dossier' }] }; }
function tok(id, extra) { return Object.assign({ id, type: 'image', src: '/saves/images/m1/' + id + '.png', x: 10, y: 10, w: 60, h: 52, z: 10, color: 'transparent', isChar: true }, extra); }
function playMap(id, title, rooms, wb, extra) { return Object.assign({ id, type: 'map', meta: { title, updated: 1000 }, rooms, links: [['r1', 'r2', 'road', { label: 'Road', notes: 'a GM link note' }]], whiteboard: wb, cats: {} }, extra); }
function planner(id) { return { id, type: 'planner', meta: { title: 'Notes ' + id, updated: 1000 }, blocks: [{ type: 'h1', title: 'Notes', sub: '' }] }; }
function page(id, extra) { return Object.assign({ id, type: 'doc', meta: { title: 'Page ' + id, updated: 1000, players: true }, blocks: [{ id: 'b1', type: 'h1', title: 'Rules', sub: '' }, { id: 'b2', type: 'text', content: '<p>read me</p>' }] }, extra || {}); }
function gmCampaign(id, name) {
    return {
        id, name, activeItemId: 'm1',
        items: {
            m1: playMap('m1', 'Town', [room('r1'), room('r2')], [tok('t_pc', { ownerId: 'u_player' }), tok('t_npc'), tok('t_hidden', { hidden: true }), { id: 'shape', type: 'rect', x: 0, y: 0, w: 50, h: 50, z: 10, color: 'var(--panel2)' }]),
            m2: playMap('m2', 'Battle', [], [tok('t_a'), tok('t_b', { sheet: { hp: 10 } }), tok('t_h2', { hidden: true })]),   // a hidden monster: a battle map with none would read as local work (4.3, last local mark)
            p1: planner('p1'),
            d1: page('d1'),
            dh: page('dh', { meta: { title: 'Secret', updated: 1000, players: false } })
        },
        players: { u_player: { name: 'Pat' } }, handouts: { h1: { title: 'Map' } }, cast: { c1: { name: 'Cast' } },
        pictures: ['/saves/images/elsewhere/a.png'], imageCats: { list: ['Villains'], by: { '/saves/images/m1/t_a.png': ['Villains'] }, shelf: {} },
        sounds: { v: 1, list: [{ id: 's_1', name: 'Rain', path: '/saves/images/audio/' + id + '/ab12cd34_rain.ogg', kind: 'loop', gain: 1, size: 900000, dur: 60 }] },
        system: { v: 1, name: 'T', updated: 1, fields: [{ id: 'f_str', key: 'STR', kind: 'number', def: 10, vis: 'all' }, { id: 'f_gm', key: 'GMnotes', kind: 'notes', vis: 'gm' }], rolls: [], sheet: { sections: [] } },
        chars: { c_pc: { id: 'c_pc', name: 'Pat', ownerId: 'u_player', npc: false, values: { f_str: 12 } }, c_npc: { id: 'c_npc', name: 'Orc', ownerId: '', npc: true, values: {} } }
    };
}
function tutorialCampaign() {   // the shipped tutorial: rooms with notes, characters with info, hidden IMAGE tokens
    return { id: 'camp_tutorial', name: 'Tutorial', activeItemId: 'tm', items: { tm: playMap('tm', 'Eldara', [room('tr1', '')], [tok('tut_horn', { hidden: true, charName: 'Horn' }), tok('tut_pc')]) } };
}
function gmState() {
    return { activeCampaignId: 'camp_a', _schema: 2, imageCats: { scenes: { label: 'Scenes' } }, campaigns: { camp_a: gmCampaign('camp_a', 'Ahto'), camp_b: gmCampaign('camp_b', 'Taris'), camp_tutorial: tutorialCampaign() } };
}
function ownCampaign(id, name) {   // what a player builds by hand: notes keys (even empty), info keys, coloured items, a planner
    return { id, name, activeItemId: 'o1', items: { o1: playMap('o1', 'Home', [room('h1', ''), room('h2', 'my note')], [tok('mine'), { id: 'merged', type: 'path', x: 0, y: 0, w: 10, h: 10, z: 30, pts: [[0, 0]], layer: 'middle' }]), op: planner('op') } };
}

/* ---- harness ---- */
let pass = 0, fail = 0;
function check(name, ok, detail) { if (ok) { pass++; console.log('ok       ', name); } else { fail++; console.log('FAIL     ', name, detail ? '-> ' + detail : ''); } }
function tiersOf(cls) { return Object.keys(cls.tiers).sort().map(id => id + ':' + cls.tiers[id]).join(' '); }
function all(cls, tier) { const ids = Object.keys(cls.tiers); return ids.length > 0 && ids.every(id => cls.tiers[id] === tier); }

let summed = false;   // a check that never settles (a promise nothing answers) would let Node exit with no summary and code 0: that is a failure
process.on('exit', code => { if (!summed && !code) { console.log('\nFAIL      the asynchronous checks never finished (a promise was left waiting)'); process.exitCode = 1; } });
(async () => {
    const url = 'file:///' + path.resolve(mod).replace(/\\/g, '/');
    const { classifyState, fileVerdict, pickRecovery, inspectCampaign, removeCampaign, unmovePlanners, runSweep, cleanImport, cleanImportItems, dropWaiting } = await import(url);
    DOC = await import('file:///' + path.resolve(path.join(__dirname, '..', 'system', 'app', 'scripts', 'docrender.js')).replace(/\\/g, '/'));
    const KNOWN = { images: [] };          // list-images answered: nothing on disk
    const UNKNOWN = { images: null };      // list-images failed
    const M0 = sanitizeAppState(gmState());

    // the sanitizer really produced every fingerprint class
    const ia = inspectCampaign(M0.campaigns.camp_a);
    check('sanitizer leaves F1..F4 on the GM campaign', ia.fp.F1 > 0 && ia.fp.F2 > 0 && ia.fp.F3 > 0 && ia.fp.F4 > 0 && ia.lmCount === 0, JSON.stringify(ia));

    // M0: contaminated whole-file
    let c = classifyState(M0, KNOWN);
    check('M0 whole-file shape holds', c.whole === true);
    check('M0 every campaign CERTAIN (images known, none on disk)', all(c, 'CERTAIN'), tiersOf(c));
    check('M0 sanitized tutorial is CERTAIN too', c.tiers.camp_tutorial === 'CERTAIN');
    c = classifyState(M0, UNKNOWN);
    check('M0 with the image check unknown: only the marker is certain, so ASK', all(c, 'ASK'), tiersOf(c));
    c = classifyState(M0, { isImport: true });
    check('M0 as an import: CERTAIN by W without an image check', all(c, 'CERTAIN'), tiersOf(c));

    // clean GM save shape
    c = classifyState(gmState(), KNOWN);
    check('clean GM save (planners, players, notes, imageCats) all OWN', all(c, 'OWN') && c.whole === false, tiersOf(c));

    // picture bookkeeping (1.5.0): never on the wire, a shaped-empty category store is not a local mark
    check('sanitizer: camp.pictures, camp.imageCats and _picsV never travel', !('pictures' in M0.campaigns.camp_a) && !('imageCats' in M0.campaigns.camp_a) && !('_picsV' in M0) && !('imageCats' in M0), JSON.stringify(Object.keys(M0.campaigns.camp_a)));
    { const e = clone(M0); e.campaigns.camp_a.imageCats = { list: [], by: {}, shelf: {} }; const ce = classifyState(e, KNOWN);
      check('a shaped-empty imageCats on a contaminated campaign is not a local mark (still CERTAIN)', ce.tiers.camp_a === 'CERTAIN', tiersOf(ce));
      e.campaigns.camp_a.imageCats.list.push('Mine'); const cf = classifyState(e, KNOWN);
      check('a real per-campaign category is a local mark (ASK)', cf.tiers.camp_a === 'ASK', tiersOf(cf)); }
    // the sound index (1.5.0): never on the wire, a shaped-empty index is not a local mark
    check('sanitizer: camp.sounds never travels', !('sounds' in M0.campaigns.camp_a) && !('sounds' in M0.campaigns.camp_b), JSON.stringify(Object.keys(M0.campaigns.camp_a)));
    { const e = clone(M0); e.campaigns.camp_a.sounds = { v: 1, list: [] }; const ce = classifyState(e, KNOWN);
      check('a shaped-empty sound index on a contaminated campaign is not a local mark (still CERTAIN)', ce.tiers.camp_a === 'CERTAIN', tiersOf(ce));
      e.campaigns.camp_a.sounds.list.push({ id: 's_1', name: 'Rain', path: '/saves/images/audio/camp_a/x.ogg', kind: 'loop' }); const cf = classifyState(e, KNOWN);
      check('a real sound entry is a local mark (ASK)', cf.tiers.camp_a === 'ASK', tiersOf(cf)); }
    // character sheets (1.5.0): the system travels as the players' view; only a GM-only field is a local mark
    check('sanitizer mirror: the system travels with its GM-only field gone', !!(M0.campaigns.camp_a.system && M0.campaigns.camp_a.system.fields.length === 1 && M0.campaigns.camp_a.system.fields[0].id === 'f_str'), JSON.stringify(M0.campaigns.camp_a.system));
    { const e = classifyState(clone(M0), KNOWN); check('an all-visible system on a contaminated campaign is not a local mark (still CERTAIN)', e.tiers.camp_a === 'CERTAIN', tiersOf(e));
      const g = clone(M0); g.campaigns.camp_a.system.fields.push({ id: 'f_gm', key: 'GMnotes', kind: 'notes', vis: 'gm' }); const cg = classifyState(g, KNOWN);
      check('a GM-only field in a system is a local mark (ASK)', cg.tiers.camp_a === 'ASK', tiersOf(cg)); }
    { const gi = clone(M0); gi.campaigns.camp_a.system.items = [{ id: 'i_secret', name: 'Prototype', vis: 'gm' }]; const cgi = classifyState(gi, KNOWN);
      check('a GM-only item in a system is a local mark (ASK)', cgi.tiers.camp_a === 'ASK', tiersOf(cgi));
      const vi = clone(M0); vi.campaigns.camp_a.system.items = [{ id: 'i_pub', name: 'Sword', vis: 'all' }]; const cvi = classifyState(vi, KNOWN);
      check('an all-visible item is not a local mark (still CERTAIN)', cvi.tiers.camp_a === 'CERTAIN', tiersOf(cvi)); }
    { const ge = clone(M0); ge.campaigns.camp_a.system.effects = [{ id: 'e_secret', name: 'Curse', vis: 'gm', mods: [] }]; const cge = classifyState(ge, KNOWN);
      check('a GM-only status effect in a system is a local mark (ASK)', cge.tiers.camp_a === 'ASK', tiersOf(cge));
      const ve = clone(M0); ve.campaigns.camp_a.system.effects = [{ id: 'e_pub', name: 'Blessed', vis: 'all', mods: [] }]; const cve = classifyState(ve, KNOWN);
      check('an all-visible status effect is not a local mark (still CERTAIN)', cve.tiers.camp_a === 'CERTAIN', tiersOf(cve)); }
    { const e = clone(M0); e.campaigns.camp_a.chars = { c_pc: { id: 'c_pc', name: 'Pat', ownerId: 'u_player', npc: false, values: { f_str: 12 }, partial: false } }; const ce = classifyState(e, KNOWN);
      check('a player\'s own character on a contaminated campaign is not a local mark (still CERTAIN)', ce.tiers.camp_a === 'CERTAIN', tiersOf(ce));
      e.campaigns.camp_a.chars.c_npc = { id: 'c_npc', name: 'Orc', ownerId: '', npc: true, values: {} }; const cn = classifyState(e, KNOWN);
      check('an NPC character is a local mark (ASK)', cn.tiers.camp_a === 'ASK', tiersOf(cn)); }
    { const tier = rows => { const e = clone(M0); e.campaigns.camp_a.chars = { c_pc: { id: 'c_pc', name: 'Pat', ownerId: 'u_player', npc: false, values: { f_gear: rows }, partial: false } }; return classifyState(e, KNOWN).tiers.camp_a; };
      check('Stage 6: a carried row that never travels as stored is a local mark (ASK): a copy of a deleted item, a custom item with GM texts, a curse kept out of its owner\'s sight', tier([{ id: 'w_l', defId: 'i_x', qty: 1, snap: { name: 'L' } }]) === 'ASK' && tier([{ id: 'w_c', qty: 1, def: { name: 'C', damage: '1d6' } }]) === 'ASK' && tier([{ id: 'w_h', defId: 'i_x', qty: 1, hid: 1 }]) === 'ASK');
      const bi = clone(M0); bi.campaigns.camp_a.system.items = [{ id: 'i_band', name: 'Band', vis: 'all', rm: 'bound', rmMsg: 'Stuck' }];
      check('Stage 6: a removal rule on an item, or on a custom row, is a local mark (ASK): players never receive one', classifyState(bi, KNOWN).tiers.camp_a === 'ASK' && tier([{ id: 'w_c', qty: 1, def: { name: 'C', rm: 'curse' } }]) === 'ASK' && tier([{ id: 'w_c', qty: 1, def: { name: 'C', throwSkill: 'DX' } }]) === 'ASK');
      const be = clone(M0); be.campaigns.camp_a.system.items = [{ id: 'i_ring', name: 'Ring', vis: 'all', eq: 'curse' }];
      check('Stage 6 F4b: an equip lock on an item or a custom row, a curse kept on out of its owner\'s sight, and a GM-only custom item\'s key are local marks (ASK); a row\'s level, switch and note travel as stored (still CERTAIN)',
        classifyState(be, KNOWN).tiers.camp_a === 'ASK' && tier([{ id: 'w_c', qty: 1, def: { name: 'C', eq: 'bound' } }]) === 'ASK' && tier([{ id: 'w_c', qty: 1, def: { name: 'C', eqMsg: 'Stuck' } }]) === 'ASK' && tier([{ id: 'w_k', defId: 'i_x', qty: 1, on: true, keptOn: 1 }]) === 'ASK'
        && tier([{ id: 'w_c', qty: 1, def: { name: 'C', vis: 'gm', key: 'Veil' } }]) === 'ASK' && tier([{ id: 'w_f', defId: 'i_x', qty: 1, lvl: 3, on: true, note: 'mine' }, { id: 'w_c', qty: 1, on: false, def: { name: 'C', key: 'Mine' } }]) === 'CERTAIN');
      check('Stage 6: rows a player\'s own copy holds are not a local mark (still CERTAIN): a pointer, an inline copy, a custom item without GM texts', tier([{ defId: 'i_x', qty: 1 }, { id: 'w_s', qty: 1, def: { name: 'R', vis: 'gm' }, lnk: 1 }, { id: 'w_c', qty: 1, def: { name: 'C' } }]) === 'CERTAIN');
      const ls = clone(M0); ls.campaigns.camp_a.system.fields.push({ id: 'f_wp', key: 'Weapons', kind: 'item-list', vis: 'all', edit: 'owner', list: { stats: [{ key: 'Acc', show: true }, { key: 'Cost' }], price: 'Cost' } }); ls.campaigns.camp_a.system.items = [{ id: 'i_b', name: 'Blaster', vis: 'all', stats: { Acc: 2, Cost: 500 } }];
      check('Stage 6 F4c1: what travels as stored is not a local mark (still CERTAIN): a row\'s paid, a custom item\'s or an inline copy\'s stats, a list\'s stats and price, a visible item\'s stats',
        tier([{ id: 'w_b', defId: 'i_x', qty: 1, paid: 500 }, { id: 'w_c', qty: 1, paid: 0, def: { name: 'C', stats: { Acc: 1 } } }, { id: 'w_i', qty: 1, def: { name: 'R', vis: 'gm', stats: { Acc: 5 } }, lnk: 1 }]) === 'CERTAIN' && classifyState(ls, KNOWN).tiers.camp_a === 'CERTAIN', tiersOf(classifyState(ls, KNOWN)));
      const lr = clone(M0); lr.campaigns.camp_a.system.listRules = { ownerStats: true };
      check('Stage 6 F4c2: a copy\'s own formulas and locks never travel, so they are a local mark (ASK: damage, cost, a lock of either kind or its message); its own name, icon, category, notes, stats, held and blast travel (still CERTAIN), and so does a system\'s Setting A',
        ['damage', 'cost', 'rm', 'rmMsg', 'eq', 'eqMsg'].every(k => { const ov = {}; ov[k] = k === 'rm' || k === 'eq' ? 'none' : 'x'; return tier([{ id: 'w_b', defId: 'i_x', qty: 1, ov }]) === 'ASK'; })
        && tier([{ id: 'w_b', defId: 'i_x', qty: 1, ov: { name: 'N', icon: 'x', category: 'c', notes: 'n', stats: { Acc: 1 }, held: ['Acc'], area: { ft: 5, shape: 'circle', name: '' } } }]) === 'CERTAIN' && classifyState(lr, KNOWN).tiers.camp_a === 'CERTAIN', tiersOf(classifyState(lr, KNOWN)));
      check('Stage 6 F4c3: a row its player made (own) travels to them whole, so it stays CERTAIN; the GM\'s formulas or lock on a custom row, or a GM only one with a key, stay a local mark (ASK)',
        tier([{ id: 'w_o', qty: 1, own: 1, def: { name: 'Pazaak', key: 'Pazaak', stats: { Acc: 1 } } }]) === 'CERTAIN' && tier([{ id: 'w_o', qty: 1, own: 1, def: { name: 'P', damage: '1d6' } }]) === 'ASK' && tier([{ id: 'w_g', qty: 1, def: { name: 'G', vis: 'gm', key: 'Gk' } }]) === 'ASK'); }

    // handbook pages (1.5.0): the hosted campaign's visible pages travel cleaned, hidden pages and other campaigns' pages do not
    check('sanitizer: hosted campaign keeps its visible page (cleaned), loses the hidden one; other campaigns lose theirs', M0.campaigns.camp_a.items.d1 && M0.campaigns.camp_a.items.d1.meta.players === true && !M0.campaigns.camp_a.items.dh && !M0.campaigns.camp_b.items.d1 && !M0.campaigns.camp_b.items.dh, JSON.stringify(Object.keys(M0.campaigns.camp_a.items)) + ' ' + JSON.stringify(Object.keys(M0.campaigns.camp_b.items)));
    { const s2 = gmState(); s2.campaigns.camp_a.activeItemId = 'd1'; s2.campaigns.camp_b.activeItemId = 'p1'; const m2 = sanitizeAppState(s2);
      check('sanitizer: a client\'s active item is always a map (open page or planner on the host → first map)', m2.campaigns.camp_a.activeItemId === 'm1' && m2.campaigns.camp_b.activeItemId === 'm1', m2.campaigns.camp_a.activeItemId + ' ' + m2.campaigns.camp_b.activeItemId); }
    check('a page in a GM campaign is neither a local mark nor a fingerprint', inspectCampaign(gmCampaign('x', 'X')).docs === 2 && inspectCampaign(M0.campaigns.camp_a).docs === 1 && inspectCampaign(M0.campaigns.camp_a).lmCount === 0);
    { const withPages = clone(M0); withPages.campaigns.camp_p = { id: 'camp_p', name: 'Pages only', activeItemId: 'pd', items: { pd: page('pd') } };
      const cp = classifyState(withPages, KNOWN);
      check('a page-only own campaign is OWN, and beside it the GM copies are asked about, never removed unasked', cp.tiers.camp_p === 'OWN' && cp.tiers.camp_a !== 'CERTAIN' && cp.tiers.camp_b !== 'CERTAIN', tiersOf(cp)); }
    { const own = clone(gmState()); const movedOwn = removeCampaign(own, 'camp_a', true);
      check('removeCampaign as the player\'s own answer rescues pages beside planners', movedOwn.indexOf('p1') >= 0 && movedOwn.indexOf('d1') >= 0 && movedOwn.indexOf('dh') >= 0 && own.campaigns.camp_recovered.items.d1 && own.campaigns.camp_recovered.items.dh, JSON.stringify(movedOwn));
      const cert = clone(gmState()); const movedCert = removeCampaign(cert, 'camp_a');
      check('removeCampaign of a CERTAIN copy drops its pages with it (planners still rescued)', movedCert.join() === 'p1' && !cert.campaigns.camp_recovered.items.d1, JSON.stringify(movedCert)); }

    // mixed
    let mixed = clone(M0); mixed.campaigns.camp_new = ownCampaign('camp_new', 'My new one');
    c = classifyState(mixed, KNOWN);
    check('mixed: own new campaign OWN, GM copies ASK (W fails)', c.tiers.camp_new === 'OWN' && c.tiers.camp_a === 'ASK' && c.tiers.camp_b === 'ASK', tiersOf(c));
    mixed = clone(M0); mixed.campaigns.camp_a.items.pp = planner('pp');
    c = classifyState(mixed, KNOWN);
    check('mixed: a planner inside a GM campaign makes it ASK and breaks W for the file', c.tiers.camp_a === 'ASK' && c.whole === false && c.tiers.camp_b === 'ASK', tiersOf(c));
    mixed = clone(M0); mixed.campaigns.camp_a.items.m1.rooms[0].notes = '';
    c = classifyState(mixed, KNOWN);
    check('mixed: notes typed on one room (even "") is a local mark: that campaign ASK, its sibling still CERTAIN', c.tiers.camp_a === 'ASK' && c.tiers.camp_b === 'CERTAIN', tiersOf(c));
    mixed = clone(M0); mixed.campaigns.camp_a.items.m3 = playMap('m3', 'Token map', [], [tok('x1'), tok('x2')]);
    c = classifyState(mixed, KNOWN);
    check('mixed: a token-only map with no fingerprint beside fingerprinted ones is a local mark (ASK)', c.tiers.camp_a === 'ASK', tiersOf(c));

    // friend's map-scope export: no players key, ownerId tokens, full notes
    const scoped = { activeCampaignId: 'camp_f', campaigns: { camp_f: { id: 'camp_f', name: 'Friend', activeItemId: 'fm', items: { fm: playMap('fm', 'Map', [room('fr1')], [tok('ft', { ownerId: 'u_someone' })]) } } } };
    c = classifyState(scoped, { isImport: true });
    check('scoped export (F4 only, notes present) is ASK, never CERTAIN', c.tiers.camp_f === 'ASK', tiersOf(c));

    // F4 alone is never the bug's shape: a rooms-less item-scope export (no players key, owned tokens, no link notes, under 4 pictures)
    function bareBattle(id, name, extra) { return Object.assign({ id, name, activeItemId: 'bm', items: { bm: playMap('bm', 'Battle', [], [tok('a', { ownerId: 'u_x' }), tok('b', { ownerId: 'u_y' }), { id: 'pic', type: 'image', src: '/saves/images/bm/p.png', x: 0, y: 0, w: 1, h: 1, z: 1, color: 'transparent' }], { links: [] }) } }, extra || {}); }
    const bare = { activeCampaignId: 'camp_f', campaigns: { camp_f: bareBattle('camp_f', 'Friend battle') } };
    check('bare battle-map export carries F4 and nothing else', inspectCampaign(bare.campaigns.camp_f).fp.F4 === 2 && inspectCampaign(bare.campaigns.camp_f).lmCount === 0);
    c = classifyState(bare, { isImport: true });
    check('rooms-less scoped export (F4 only) is ASK on import, W does not hold', c.tiers.camp_f === 'ASK' && c.whole === false, tiersOf(c));
    c = classifyState(bare, KNOWN);
    check('the same campaign in a save with pictures known is ASK, never CERTAIN', c.tiers.camp_f === 'ASK', tiersOf(c));
    const forgot = { activeCampaignId: 'camp_g', campaigns: { camp_g: bareBattle('camp_g', 'My battle', { players: {} }), camp_g2: bareBattle('camp_g2', 'Other battle', { players: {} }) } };
    c = classifyState(forgot, KNOWN);
    check('a GM\'s own battle maps after forgetting every player (players:{}, F4 only) are never CERTAIN', c.tiers.camp_g !== 'CERTAIN' && c.tiers.camp_g2 !== 'CERTAIN', tiersOf(c));
    const vb = fileVerdict(forgot, { images: [], myId: 'u_me', journalKeys: {} }, [], {});
    check('a backup holding only such campaigns is not contaminated', !vb.contaminated && !vb.hasCertain);
    const f4beside = clone(M0); f4beside.campaigns.camp_f = bareBattle('camp_f', 'Friend battle');
    c = classifyState(f4beside, KNOWN);
    check('an F4-only campaign inside a W file is ASK while its fingerprinted siblings stay CERTAIN', c.tiers.camp_f === 'ASK' && c.tiers.camp_a === 'CERTAIN' && c.whole === true, tiersOf(c));

    // hand-authored import: rooms lacking notes AND characters lacking info, in a file with planners
    const hand = { activeCampaignId: 'camp_h', campaigns: { camp_h: { id: 'camp_h', name: 'Handmade', activeItemId: 'hm', items: { hm: playMap('hm', 'Map', [{ id: 'x', x: 1, y: 1, name: 'X', characters: [{ name: 'Y' }] }], [tok('ht')]), hp: planner('hp') } } } };
    c = classifyState(hand, { isImport: true });
    check('hand-authored import (two fingerprint classes, planners in the file) is ASK', c.tiers.camp_h === 'ASK' && c.whole === false, tiersOf(c));

    // own tutorial-like campaign with hidden image tokens
    c = classifyState({ activeCampaignId: 'camp_tutorial', campaigns: { camp_tutorial: tutorialCampaign() } }, KNOWN);
    check('own tutorial (hidden image tokens with src, notes, info) is OWN', c.tiers.camp_tutorial === 'OWN', tiersOf(c));

    // own campaign with a merged drawing (a path item with no colour key) stays OWN
    c = classifyState({ activeCampaignId: 'camp_o', campaigns: { camp_o: ownCampaign('camp_o', 'Own') } }, KNOWN);
    check('own campaign with a colourless merged path item is OWN', c.tiers.camp_o === 'OWN', tiersOf(c));

    // marker only
    const marked = { activeCampaignId: 'camp_o', campaigns: { camp_o: ownCampaign('camp_o', 'Own') }, _foreign: { at: 1, gm: 'g' } };
    marked.campaigns.camp_o._foreign = { at: 1, gm: 'g' };
    c = classifyState(marked, UNKNOWN);
    check('marker without fingerprints is ASK when local marks exist', c.tiers.camp_o === 'ASK', tiersOf(c));
    const markedGm = sanitizeAppState(gmState()); markedGm._foreign = { at: 1, gm: 'g' }; Object.values(markedGm.campaigns).forEach(x => { x._foreign = { at: 1, gm: 'g' }; });
    c = classifyState(markedGm, UNKNOWN);
    check('marked sanitized state is CERTAIN even with the image check unknown', all(c, 'CERTAIN'), tiersOf(c));
    const markedEmpty = { activeCampaignId: 'e', campaigns: { e: { id: 'e', name: 'Empty', items: {}, activeItemId: null, _foreign: { at: 1 } } }, _foreign: { at: 1 } };
    c = classifyState(markedEmpty, UNKNOWN);
    check('marker alone on an empty campaign is CERTAIN', c.tiers.e === 'CERTAIN', tiersOf(c));
    const sib = clone(markedGm); sib.campaigns.camp_empty = { id: 'camp_empty', name: 'Blank', items: {}, activeItemId: null };
    c = classifyState(sib, UNKNOWN);
    check('an unmarked empty campaign beside certain ones is ASK, never removed by association', c.tiers.camp_empty === 'ASK', tiersOf(c));

    // empty stripped keys on a contaminated campaign
    const emptyKeys = clone(M0); Object.values(emptyKeys.campaigns).forEach(x => { x.cast = {}; x.handouts = {}; x.handoutReveals = {}; x.players = {}; });
    c = classifyState(emptyKeys, KNOWN);
    check('cast:{} handouts:{} players:{} are not local marks: still CERTAIN, F4 kept', all(c, 'CERTAIN') && c.info.camp_a.fp.F4 > 0, tiersOf(c));

    // sanitized copy of OWN campaigns whose pictures resolve on this disk
    const refs = ['/saves/images/m1/t_pc.png', '/saves/images/m1/t_npc.png', '/saves/images/m1/t_a.png', '/saves/images/m1/t_b.png'];   // the four unhidden tokens' pictures (hidden ones lost their src)
    c = classifyState(M0, { images: refs });
    check('pictures resolving on this disk contradict: ASK, never CERTAIN', c.tiers.camp_a === 'ASK' && c.tiers.camp_b === 'ASK', tiersOf(c));
    c = classifyState(M0, { images: refs.slice(0, 1) });
    check('one of four pictures resolving does not contradict', c.tiers.camp_a === 'CERTAIN', tiersOf(c));

    // kept by the player
    const keptM = clone(M0); keptM.campaigns.camp_a._keptByUser = 5;
    c = classifyState(keptM, KNOWN);
    check('_keptByUser makes a contaminated campaign OWN from then on', c.tiers.camp_a === 'OWN' && c.tiers.camp_b === 'CERTAIN', tiersOf(c));

    // journal veto
    c = classifyState(M0, { images: [], myId: 'u_me', journalKeys: { camp_a__u_me: true } });
    check('a Journal key for this install vetoes automatic removal (ASK)', c.tiers.camp_a === 'ASK' && c.tiers.camp_b === 'CERTAIN', tiersOf(c));

    // fresh install
    c = classifyState({}, KNOWN);
    check('{} has nothing to judge', Object.keys(c.tiers).length === 0 && c.whole === false);
    c = classifyState({ activeCampaignId: null, campaigns: {} }, KNOWN);
    check('empty campaigns dict has nothing to judge', Object.keys(c.tiers).length === 0);
    const seed = { activeCampaignId: 'camp_1', campaigns: { camp_1: { id: 'camp_1', name: 'Default Campaign', activeItemId: 'd', items: { d: { id: 'd', type: 'map', meta: { title: 'Default Map' }, rooms: [], links: [], whiteboard: [], cats: {} } } } } };
    c = classifyState(seed, KNOWN);
    check('seed campaign is OWN', c.tiers.camp_1 === 'OWN', tiersOf(c));

    // idempotency: the cleaned object is OWN throughout; removal rescues planners
    const cleaned = clone(mixed); Object.keys(classifyState(cleaned, KNOWN).tiers).forEach(id => { if (classifyState(cleaned, KNOWN).tiers[id] === 'CERTAIN') removeCampaign(cleaned, id); });
    const withPlanner = clone(M0); withPlanner.campaigns.camp_a.items.pp = planner('pp');
    const moved = removeCampaign(withPlanner, 'camp_a');
    check('removing a campaign moves its planner pages into "Recovered notes"', moved.length === 1 && moved[0] === 'pp' && withPlanner.campaigns.camp_recovered && withPlanner.campaigns.camp_recovered.items.pp && !withPlanner.campaigns.camp_a, JSON.stringify(Object.keys(withPlanner.campaigns)));
    const home = clone(withPlanner); unmovePlanners(home, moved);
    check('putting the campaign back takes its pages home: no second copy, an emptied "Recovered notes" goes', !home.campaigns.camp_recovered, JSON.stringify(Object.keys(home.campaigns)));
    const shared = clone(withPlanner); shared.campaigns.camp_recovered.items.other = planner('other'); unmovePlanners(shared, moved);
    check('"Recovered notes" stays when it still holds other pages', shared.campaigns.camp_recovered && !shared.campaigns.camp_recovered.items.pp && shared.campaigns.camp_recovered.items.other && shared.campaigns.camp_recovered.activeItemId === 'other');
    const after = clone(M0); Object.keys(after.campaigns).forEach(id => removeCampaign(after, id));
    c = classifyState(after, KNOWN);
    check('a cleaned save classifies clean (running it twice changes nothing)', c.counts.certain === 0 && c.counts.ask === 0, tiersOf(c));
    c = classifyState(withPlanner, KNOWN);
    check('"Recovered notes" (planners only) is OWN', c.tiers.camp_recovered === 'OWN', tiersOf(c));

    // backup verdicts
    const ctx = { images: [], myId: 'u_me', journalKeys: {} };
    const own = ownCampaign('camp_o', 'Own');
    const current = { camp_o: own };
    let bk = { activeCampaignId: 'camp_o', campaigns: { camp_o: clone(own), camp_a: clone(M0.campaigns.camp_a) } };
    let v = fileVerdict(bk, ctx, ['camp_a'], current);
    check('mixed backup with a confirmed-removed GM copy (fingerprints, no marks) is contaminated and pure', v.contaminated && !v.hasCertain && v.uniqueOwn.length === 0, JSON.stringify(v.uniqueOwn));
    v = fileVerdict(bk, ctx, [], current);
    check('the same file without the removed id is not contaminated (W fails, nothing certain)', !v.contaminated);
    bk.campaigns.camp_a._keptByUser = 3;
    v = fileVerdict(bk, ctx, ['camp_a'], current);
    check('a kept copy never contaminates', !v.contaminated);
    delete bk.campaigns.camp_a._keptByUser;
    v = fileVerdict(bk, { images: [], myId: 'u_me', journalKeys: { camp_a__u_me: true } }, ['camp_a'], current);
    check('a Journal key never lets a copy contaminate', !v.contaminated);
    bk = { activeCampaignId: 'camp_o', campaigns: { camp_o: clone(own), camp_z: ownCampaign('camp_z', 'Lost'), camp_a: clone(M0.campaigns.camp_a) } };
    v = fileVerdict(bk, ctx, ['camp_a'], current);
    check('a contaminated backup that also holds own work absent from the save names it', v.contaminated && v.uniqueOwn.join() === 'camp_z' && v.unique.join() === 'camp_z', JSON.stringify(v.uniqueOwn));
    bk = { activeCampaignId: 'camp_o', campaigns: { camp_o: clone(own), camp_f: bareBattle('camp_f', 'Friend battle'), camp_a: clone(M0.campaigns.camp_a) } };
    v = fileVerdict(bk, ctx, ['camp_a'], current);
    check('a contaminated backup holding an ambiguous copy absent from the save names it too (asked before the file goes)', v.contaminated && v.uniqueOwn.length === 0 && v.uniqueAsk.join() === 'camp_f' && v.unique.join() === 'camp_f', JSON.stringify(v.unique));
    v = fileVerdict(bk, ctx, ['camp_a'], { camp_o: own, camp_f: bareBattle('camp_f', 'Friend battle') });
    check('an ambiguous copy the save still has is not unique', v.unique.length === 0);
    v = fileVerdict(clone(M0), ctx, [], current);
    check('a whole-file GM backup is contaminated by W', v.contaminated && v.hasCertain);
    v = fileVerdict({ activeCampaignId: 'camp_tutorial', campaigns: { camp_tutorial: tutorialCampaign(), camp_o: clone(own) } }, ctx, ['camp_tutorial'], current);
    check('a player\'s own tutorial in a clean backup never matches the removed-id rule', !v.contaminated && v.uniqueOwn.join() === 'camp_tutorial');

    // recovery picks
    const src = { activeCampaignId: 'camp_o', campaigns: { camp_o: clone(own), camp_z: ownCampaign('camp_z', 'Lost'), camp_k: Object.assign(ownCampaign('camp_k', 'Kept once'), { _keptByUser: 1 }), camp_f: clone(scoped.campaigns.camp_f) } };
    const scls = classifyState(src, ctx);
    const picks = pickRecovery(src, scls, current);
    check('recovery takes only OWN copies absent from the save: not the present one, not the kept one, not the ASK-tier one', picks.join() === 'camp_z', JSON.stringify(picks) + ' ' + tiersOf(scls));

    // Stage B end to end against a stand-in page and server: every dialog is answered as soon as it opens, every
    // request is recorded in order, /api/data is a fake disk. What is checked: a copy is deleted only after what
    // was merged from it is written and read back; a failed write keeps the copy; pending recovery skips the copies
    // taken after the clean and merges before any question or deletion.
    function makeDom(answer) {
        const els = [];
        const mk = () => ({ children: [], h: {}, style: {}, lastChild: null,
            appendChild(ch) { this.children.push(ch); this.lastChild = ch; return ch; },
            addEventListener(t, f) { (this.h[t] = this.h[t] || []).push(f); },
            removeEventListener() {}, focus() {},
            remove() { const i = els.indexOf(this); if (i >= 0) els.splice(i, 1); } });
        const dom = { dialogs: 0, shown: [], body: mk(), getElementById(id) { return els.find(e => e.id === id) || null; }, createElement() { return mk(); }, addEventListener() {}, removeEventListener() {} };
        dom.body.appendChild = function(overlay) {
            els.push(overlay); dom.dialogs++; dom.shown.push(overlay.id);
            setTimeout(() => {
                const buttons = []; (function walk(e) { if (e.h.click && typeof e.textContent === 'string') buttons.push(e); e.children.forEach(walk); })(overlay);   // buttons, not the backdrop
                const b = buttons.find(x => x.textContent === answer) || buttons[0];
                b.h.click.forEach(f => f());
            }, 0);
        };
        return dom;
    }
    function makeServer(files, disk, failWrite) {
        const calls = [];
        const res = (ok, body) => ({ ok, json: async () => body });
        const fetch = async (url, init) => {
            init = init || {};
            const del = url === '/api/delete-backup' ? ' ' + JSON.parse(init.body).file : '';
            calls.push((init.method || 'GET') + ' ' + url + del);
            if (url === '/api/backups') return res(true, Object.keys(files).map(n => ({ file: n, size: 1, at: files[n].at })));
            if (url.indexOf('/saves/backups/') === 0) { const n = url.slice(15); return files[n] ? res(true, clone(files[n].state)) : res(false, null); }
            if (url === '/api/data' && init.method === 'POST') { if (failWrite) return res(false, null); disk = JSON.parse(init.body); return res(true, {}); }
            if (url === '/api/data') return res(true, clone(disk));
            if (url === '/api/delete-backup') { delete files[del.slice(1)]; return res(true, {}); }
            if (url === '/api/list-images') return res(true, []);
            if (url === '/api/log' || url === '/api/backup-now') return res(true, {});
            return res(false, null);
        };
        return { fetch, calls, files, disk: () => disk };
    }
    async function sweep(live, files, answer, failWrite) {
        const dom = makeDom(answer), srv = makeServer(files, clone(live), failWrite), toasts = [];
        let saves = 0;
        globalThis.window = { wpNet: null, __wpNoSave: false };
        globalThis.document = dom;
        globalThis.fetch = srv.fetch;
        globalThis.localStorage = { s: {}, get length() { return Object.keys(this.s).length; }, key(i) { return Object.keys(this.s)[i] || null; }, getItem(k) { return k in this.s ? this.s[k] : null; }, setItem(k, v) { this.s[k] = String(v); }, removeItem(k) { delete this.s[k]; } };
        await runSweep({ toast: m => toasts.push(m), save: () => { saves++; }, getState: () => live, refresh: () => {}, migrate: d => d });
        await new Promise(r => setTimeout(r, 5));   // a summary shown at the end answers itself on the next tick
        const idx = s => srv.calls.findIndex(x => x.indexOf(s) === 0);
        return { calls: srv.calls, idx, files: srv.files, disk: srv.disk(), dialogs: dom.dialogs, shown: dom.shown, toasts, saves };
    }
    const gmCopy = () => clone(M0.campaigns.camp_a);
    let live = { activeCampaignId: 'camp_o', campaigns: { camp_o: ownCampaign('camp_o', 'Own') }, _cleanup: { v: 1, removed: ['camp_a'], at: 1, pendingRecover: false } };
    let r = await sweep(live, { 'data-1.json': { at: 10, state: { activeCampaignId: 'camp_o', campaigns: { camp_o: ownCampaign('camp_o', 'Own'), camp_z: ownCampaign('camp_z', 'Lost'), camp_a: gmCopy() } } } }, 'Bring it back');
    check('Stage B: "Bring it back" merges, writes and reads back before the copy is deleted', r.dialogs === 1 && r.idx('POST /api/data') >= 0 && r.idx('POST /api/data') < r.idx('POST /api/delete-backup data-1.json') && !r.files['data-1.json'] && live.campaigns.camp_z && r.disk.campaigns.camp_z, r.calls.join(' | '));
    live = { activeCampaignId: 'camp_o', campaigns: { camp_o: ownCampaign('camp_o', 'Own') }, _cleanup: { v: 1, removed: ['camp_a'], at: 1, pendingRecover: false } };
    r = await sweep(live, { 'data-1.json': { at: 10, state: { activeCampaignId: 'camp_o', campaigns: { camp_o: ownCampaign('camp_o', 'Own'), camp_z: ownCampaign('camp_z', 'Lost'), camp_a: gmCopy() } } } }, 'Bring it back', true);
    check('Stage B: a failed write keeps the copy that held the merged campaign', r.dialogs === 1 && r.idx('POST /api/delete-backup') < 0 && r.files['data-1.json'] && live.campaigns.camp_z, r.calls.join(' | '));
    live = { activeCampaignId: 'camp_o', campaigns: { camp_o: ownCampaign('camp_o', 'Own') }, _cleanup: { v: 1, removed: ['camp_a'], at: 1, pendingRecover: false } };
    r = await sweep(live, { 'data-1.json': { at: 10, state: { activeCampaignId: 'camp_o', campaigns: { camp_o: ownCampaign('camp_o', 'Own'), camp_f: bareBattle('camp_f', 'Friend battle'), camp_a: gmCopy() } } } }, 'No, clear it');
    check('Stage B: an ambiguous absent copy is asked about; "No, clear it" clears the file', r.dialogs === 1 && !r.files['data-1.json'] && !live.campaigns.camp_f, r.calls.join(' | '));
    live = { activeCampaignId: 'camp_o', campaigns: { camp_o: ownCampaign('camp_o', 'Own') }, _cleanup: { v: 1, removed: ['camp_a'], at: 1, pendingRecover: false } };
    r = await sweep(live, { 'data-1.json': { at: 10, state: { activeCampaignId: 'camp_o', campaigns: { camp_o: ownCampaign('camp_o', 'Own'), camp_f: bareBattle('camp_f', 'Friend battle'), camp_a: gmCopy() } } } }, 'Bring it back');
    check('Stage B: "Bring it back" on an ambiguous copy keeps it from then on', r.dialogs === 1 && live.campaigns.camp_f && live.campaigns.camp_f._keptByUser > 0 && r.disk.campaigns.camp_f, r.calls.join(' | '));
    live = { activeCampaignId: 'camp_s', campaigns: { camp_s: clone(seed.campaigns.camp_1) }, _cleanup: { v: 1, removed: ['camp_a', 'camp_b', 'camp_tutorial'], at: 1, pendingRecover: true } };
    live.campaigns.camp_s.id = 'camp_s';
    const postClean = { activeCampaignId: 'camp_s', campaigns: { camp_s: clone(live.campaigns.camp_s) }, _cleanup: { v: 1, removed: ['camp_a', 'camp_b', 'camp_tutorial'], at: 1, pendingRecover: true } };
    r = await sweep(live, {
        'data-3.json': { at: 30, state: postClean },
        'data-2.json': { at: 20, state: clone(M0) },
        'data-1.json': { at: 10, state: { activeCampaignId: 'camp_o', campaigns: { camp_o: ownCampaign('camp_o', 'Own'), camp_z: ownCampaign('camp_z', 'Lost'), camp_a: gmCopy() } } }
    }, 'No, clear it');
    check('Stage B pending: the copy taken after the clean is skipped, the pure copy goes, the older mixed copy is the source', live.campaigns.camp_o && live.campaigns.camp_z && !live.campaigns.camp_a && !r.files['data-2.json'] && r.files['data-3.json'], r.calls.join(' | '));
    check('Stage B pending: the source is merged and written before its file is deleted, with no question about the merged campaigns (only the summary)', r.shown.join() === 'cleanupSummaryModal' && r.idx('POST /api/data') < r.idx('POST /api/delete-backup data-1.json') && !r.files['data-1.json'] && r.disk.campaigns.camp_z, r.shown.join() + ' :: ' + r.calls.join(' | '));
    check('Stage B pending: pendingRecover is cleared once a source was used', !(live._cleanup && live._cleanup.pendingRecover) && live._cleanup && live._cleanup.removed.length === 3, JSON.stringify(live._cleanup));
    live = { activeCampaignId: 'camp_s', campaigns: { camp_s: clone(postClean.campaigns.camp_s) }, _cleanup: { v: 1, removed: ['camp_a'], at: 1, pendingRecover: true } };
    r = await sweep(live, { 'data-3.json': { at: 30, state: clone(postClean) } }, 'No, clear it');
    check('Stage B pending: with only post-clean copies nothing is recovered, the full read clears the flag', r.dialogs === 0 && Object.keys(live.campaigns).join() === 'camp_s' && !(live._cleanup && live._cleanup.pendingRecover), JSON.stringify(live._cleanup));
    delete globalThis.window; delete globalThis.document; delete globalThis.localStorage;

    /* ---- the wire's asset gate, sliced out of net.js: an admitted player may only pull /saves/images/ files ---- */
    // Before 020a8b4 the RAW string was checked, but the browser collapses %2e%2e (and .%2e, %2e.) into dot segments before a
    // request leaves, so an asset-req for /saves/images/%2e%2e/%2e%2e/api/data fetched the GM's whole data.json. The real
    // function is taken from the source so a rewrite back to a raw-string check fails here, not on a player's screen.
    const netSrc = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'net.js'), 'utf8');
    const gA = netSrc.indexOf('function assetPathOk(raw)'), gB = netSrc.indexOf('net._assetPathOk = assetPathOk');
    check('net.js defines assetPathOk and exposes it as net._assetPathOk', gA > 0 && gB > gA);
    const assetPathOk = gA > 0 && gB > gA ? new Function('location', netSrc.slice(gA, gB) + '\nreturn assetPathOk;')({ origin: 'http://localhost:3000' }) : () => 'no gate';
    const serverSees = p => { const u = new URL(p, 'http://localhost'); try { return decodeURIComponent(u.pathname); } catch (e) { return u.pathname; } };   // main.js's static branch
    const refused = [
        '/saves/images/%2e%2e/%2e%2e/api/data', '/saves/images/%2E%2E/%2E%2E/api/data', '/saves/images/%2e%2e/data.json', '/saves/images/.%2e/data.json',
        '/saves/images/%2e./data.json', '/saves/images/../data.json', '/saves/images/c1/..%2fdata.json', '/saves/images/c1/..%5cdata.json',
        '/saves/images/%2e%2e%5cdata.json', '/saves/images/c1/%5c..%5cdata.json', '/saves/images/c1/a%00.png', '/saves/images/c1/a.png?x=1',
        '/saves/images/c1/a.png#h', 'http://evil.example/saves/images/c1/a.png', '//evil.example/saves/images/c1/a.png',
        'https://localhost:3000/saves/images/c1/a.png', 'file:///saves/images/c1/a.png', '/saves/imagesX/a.png', '/saves/data.json', '/api/data',
        '', 42, null, '/saves/images/' + 'a'.repeat(400) + '.png',
        // security R2 cluster C (2026-10-01): this machine's Journal (private shares, notes, other tables' journals) and the video library are never served to a peer —
        // in any case, with trailing dots or spaces, percent-encoded, through an empty or a dot segment, or as an NTFS stream name: every spelling reaches the same folder on Windows
        '/saves/images/journal/c1__g1/journal.json', '/saves/images/journal/journals.json', '/saves/images/journal/c1__g1/sh_p1_e1.png', '/saves/images/JOURNAL/journals.json',
        '/saves/images//journal/journals.json', '/saves/images/./journal/journals.json', '/saves/images/%6Aournal/journals.json', '/saves/images/journal./journals.json',
        '/saves/images/journal%20/journals.json', '/saves/images/journal::$INDEX_ALLOCATION/journals.json', '/saves/images/journal:x/journals.json',
        '/saves/images/video/c1/ab12cd34_clip.mp4', '/saves/images/Video/c1/x.mp4', '/saves/images/video./c1/x.mp4', '/saves/images/c1/a:b.png'
    ];
    refused.forEach(p => check('asset gate refuses ' + String(JSON.stringify(p)).slice(0, 60), assetPathOk(p) === '', JSON.stringify(assetPathOk(p))));
    const served = [   // raw stored path -> the pathname the host fetches -> the on-disk name main.js resolves it to (null = not asserted)
        ['/saves/images/c1/plain.png', '/saves/images/c1/plain.png', '/saves/images/c1/plain.png'],
        ['saves/images/c1/plain.png', '/saves/images/c1/plain.png', '/saves/images/c1/plain.png'],   // assetSrc tolerates a missing leading slash
        ["/saves/images/c1/Ror'Chiir — token (v2).png", "/saves/images/c1/Ror'Chiir%20%E2%80%94%20token%20(v2).png", "/saves/images/c1/Ror'Chiir — token (v2).png"],
        ['/saves/images/audio/c1/日本語 ♪.mp3', '/saves/images/audio/c1/%E6%97%A5%E6%9C%AC%E8%AA%9E%20%E2%99%AA.mp3', '/saves/images/audio/c1/日本語 ♪.mp3'],
        ['/saves/images/c1/a[1] b|c^d "q".png', '/saves/images/c1/a[1]%20b|c%5Ed%20%22q%22.png', '/saves/images/c1/a[1] b|c^d "q".png'],
        ['/saves/images/c1/pic%20already.png', '/saves/images/c1/pic%20already.png', null],   // pre-encoded: kept as is, never doubled to %2520
        ['/saves/images/audio/c1/100% rock.mp3', '/saves/images/audio/c1/100%25%20rock.mp3', '/saves/images/audio/c1/100% rock.mp3'],   // a lone % re-encoded, as encodeURI did for the host's own playback
        ['/saves/images/journalism/a.png', '/saves/images/journalism/a.png', '/saves/images/journalism/a.png'],   // the Journal rule is a folder's name, never a prefix: real campaign art beside it is served
        ['/saves/images/videos/c1/poster.png', '/saves/images/videos/c1/poster.png', '/saves/images/videos/c1/poster.png']
    ];
    // The gate hands back what the runtime's URL parser makes of the path, and parsers differ on two bytes: Node 22 leaves
    // ^ and | raw, Node 24 encodes ^ (%5E) and leaves |, Chromium 152 encodes both (%5E, %7C) — the first live CI run (Node
    // 22) failed on exactly that. Every form reaches the same stored file (the disk assertion below proves it), so the
    // spellings of ^ and | count as the same answer here; everything else (spaces, quotes, a lone %, pre-encoded) stays strict.
    const sameSpelling = s => String(s).replace(/%5E/g, '^').replace(/%7C/g, '|');
    served.forEach(([raw, want, disk]) => {
        const got = assetPathOk(raw);
        check('asset gate serves ' + raw + ' as ' + want, sameSpelling(got) === sameSpelling(want), got);
        if (disk) check('  ...and the server resolves that to the stored file ' + disk, serverSees(got) === disk, serverSees(got));
    });

    /* ---- imports: a Replace (or a legacy file) is shaped by the load's own normaliser and cleaned like a Merge (cleanup.js cleanImport) ---- */
    {
        const scripts = path.join(__dirname, '..', 'system', 'app', 'scripts'), surl = f => 'file:///' + path.resolve(path.join(scripts, f)).replace(/\\/g, '/');
        const readSrc = f => fs.readFileSync(path.join(scripts, f), 'utf8').replace(/\r\n/g, '\n');
        const ioSrc = readSrc('io.js'), mainSrc = readSrc('main.js'), netSrc = readSrc('net.js');
        const S = await import(surl('systemcore.js')), F = await import(surl('formula.js')), LBC = await import(surl('librarycore.js'));
        // the REAL load normaliser (io.js migrateAppState) and the REAL rich-text sanitiser (net.js; under node it keeps text only), sliced, never copied
        const mi = ioSrc.indexOf('  function hexCenterFlat('), mk = ioSrc.indexOf('  // What the cleanup (scripts/cleanup.js) may do');
        const migrate = new Function('window', 'CATS', 'CURRENT_SCHEMA', 'createNewCampaign', '"use strict";\n' + ioSrc.slice(mi, mk) + '\nreturn function(d) { return migrateAppState(d).data; };')(   // strict, as the module runs
            { wpSystemCore: S, wpFormula: F, wpLibraryCore: LBC }, { default: { label: 'Default', color: '#ccc' } }, 2, nm => ({ id: 'camp_v0', name: nm, items: {} }));
        const libLoad = migrate({ activeCampaignId: 'cL', campaigns: { cL: { id: 'cL', name: 'L', items: {}, library: { dir: 'l_abcd1234', packs: [{ id: 'p_a', name: 'Gear\u0000', rev: 2, count: 3, secret: 'x' }, { id: '../x' }] } }, cM: { id: 'cM', name: 'M', items: {}, library: { dir: '../../saves', packs: [] } } } });
        const keepNoCore = new Function('window', 'CATS', 'CURRENT_SCHEMA', 'createNewCampaign', ioSrc.slice(mi, mk) + '\nreturn function(d) { return migrateAppState(d).data; };')({ wpSystemCore: S, wpFormula: F }, { default: { label: 'Default', color: '#ccc' } }, 2, nm => ({ id: 'camp_v0', name: nm, items: {} }))({ activeCampaignId: 'cL', campaigns: { cL: { id: 'cL', name: 'L', items: {}, library: { dir: 'l_abcd1234', packs: [] } } } });
        check('L1c the load cleans a campaign\'s library manifest (its folder a generated name, each pack once, nothing else riding along) and drops one that names a path; with its cleaner not loaded it leaves the manifest as it is (never lost)',
            JSON.stringify(libLoad.campaigns.cL.library) === JSON.stringify({ v: 1, dir: 'l_abcd1234', packs: [{ id: 'p_a', name: 'Gear', vis: 'all', rev: 2, count: 3, bytes: 0, hash: '' }] }) && !('library' in libLoad.campaigns.cM) && keepNoCore.campaigns.cL.library.dir === 'l_abcd1234', JSON.stringify([libLoad.campaigns.cL.library, libLoad.campaigns.cM.library]));
        // item 21 V1: a campaign's video library from a file, cleaned by the real load normaliser with the real videocore; left as it is without the cleaner
        const VCl = await import(surl('videocore.js'));
        const migV = win => new Function('window', 'CATS', 'CURRENT_SCHEMA', 'createNewCampaign', '"use strict";\n' + ioSrc.slice(mi, mk) + '\nreturn function(d) { return migrateAppState(d).data; };')(win, { default: { label: 'Default', color: '#ccc' } }, 2, nm => ({ id: 'camp_v0', name: nm, items: {} }));
        const fileV = () => ({ activeCampaignId: 'vA', campaigns: {
            vA: { id: 'vA', name: 'A', items: {}, videos: [
                { id: 'v_abcdefgh', name: ' Intro\u0000 <b>x</b> ', path: '/saves/images/video/vA/k3j9_intro.mp4', size: 1000.7, dur: 12.34, w: 1920, h: 1080, secret: 'x' },
                { id: 'v_abcdefgh', name: 'again', path: '/saves/images/video/vA/other.mp4', size: 1 },
                { id: 'v_bbbbbbbb', name: 'web', path: 'https://evil.example/x.mp4', size: 1 },
                { id: 'v_cccccccc', name: 'page', path: '/saves/images/video/vA/x.html', size: 1 },
                { id: 'v_dddddddd', name: 'walk', path: '/saves/images/video/vA/..%2f..%2fdata.mp4', size: 1 },
                { id: 'v_eeeeeeee', name: 'picture folder', path: '/saves/images/map1/x.mp4', size: 1 },
                { id: '../x', name: 'id', path: '/saves/images/video/vA/y.mp4', size: 1 },
                { id: 'v_ffffffff', name: 'no size', path: '/saves/images/video/vA/z.webm' },
                { id: 'v_gggggggg', name: 'Twice', path: '/saves/images/video/vA/k3j9_intro.mp4', size: 5 },
                { id: 'v_hhhhhhhh', path: '/saves/images/video/vA/q_clip.webm', size: 0, dur: -4, w: 'wide' } ] },
            vB: { id: 'vB', name: 'B', items: {}, videos: 'a list' },
            vC: { id: 'vC', name: 'C', items: {}, videos: [{ id: 'bad' }] },
            vD: { id: 'vD', name: 'D', items: {} } } });
        const withV = migV({ wpSystemCore: S, wpFormula: F, wpLibraryCore: LBC, wpVideoCore: VCl })(fileV()), noV = migV({ wpSystemCore: S, wpFormula: F, wpLibraryCore: LBC })(fileV());
        const vidsOf = st => ['vA', 'vB', 'vC', 'vD'].map(id => ('videos' in st.campaigns[id] ? st.campaigns[id].videos : 'none'));
        check('item 21 V1 the load cleans a campaign\'s video library (the real load normaliser with the real videocore): an entry by its id pattern once and its file once, its name as one plain line, only an uploaded video\'s path (never a web address, a page, a walk out of the folder or a picture folder), a size in bytes, a length and picture size only as numbers, nothing else riding along; a library that is no list or holds nothing that cleans goes; a campaign without one gets none; with the cleaner not loaded it is left as it is (never lost: the panel cleans it again as it reads)',
            JSON.stringify(vidsOf(withV)) === JSON.stringify([[{ id: 'v_abcdefgh', name: 'Intro <b>x</b>', path: '/saves/images/video/vA/k3j9_intro.mp4', size: 1000, dur: 12.3, w: 1920, h: 1080 }, { id: 'v_hhhhhhhh', name: 'Video', path: '/saves/images/video/vA/q_clip.webm', size: 0 }], 'none', 'none', 'none'])
            && JSON.stringify(vidsOf(noV)) === JSON.stringify(vidsOf({ campaigns: fileV().campaigns })), JSON.stringify([vidsOf(withV), vidsOf(noV)]));
        // the campaign's music library from a file, cleaned by the real load normaliser as the app reads it (musiccore musicView); left as it is without the cleaner
        const MCl = await import(surl('musiccore.js'));
        const fileM = () => ({ activeCampaignId: 'mA', campaigns: {
            mA: { id: 'mA', name: 'A', items: {}, music: { v: 1, tracks: [
                { id: 't_one', name: ' Rain\u0000 <b>x</b> ', path: '/saves/images/audio/mA/k3j9_rain.ogg', size: 1000.7, dur: 12.34, secret: 'x' },
                { id: 't_one', name: 'again', path: '/saves/images/audio/mA/other.ogg', size: 1 },
                { id: 't_web', name: 'web', path: 'https://evil.example/x.mp3', size: 1 },
                { id: 't_walk', name: 'walk', path: '/saves/images/audio/mA/..%2f..%2fdata.ogg', size: 1 },
                { id: '../x', name: 'id', path: '/saves/images/audio/mA/y.ogg', size: 1 },
                { id: 't_nosize', name: 'no size', path: '/saves/images/audio/mA/z.ogg' },
                { id: 't_ref', name: 'Brought in', path: '/saves/images/audio/mB/song.ogg', size: 5 } ],
              playlists: [{ id: 'pl_a', name: ' Mood ', tracks: ['t_one', 't_web', 't_ref', 'nope', 7] }, { id: 'pl_a', name: 'twice', tracks: [] }, { id: 'bad id!', tracks: ['t_one'] }, 'x'] } },
            mB: { id: 'mB', name: 'B', items: {}, music: [{ id: 't_l', path: '/saves/images/audio/mB/l.ogg', size: 1 }] },
            mC: { id: 'mC', name: 'C', items: {}, music: { tracks: [{ id: 'bad' }], playlists: [] } },
            mD: { id: 'mD', name: 'D', items: {} } } });
        const withM = migV({ wpSystemCore: S, wpFormula: F, wpLibraryCore: LBC, wpMusicCore: MCl })(fileM()), noM = migV({ wpSystemCore: S, wpFormula: F, wpLibraryCore: LBC })(fileM());
        const musOf = st => ['mA', 'mB', 'mC', 'mD'].map(id => ('music' in st.campaigns[id] ? st.campaigns[id].music : 'none'));
        check('the load cleans a campaign\'s music library (the real load normaliser with the real musiccore, as the app reads the music): a track by its id pattern once, its name as one plain line, only an uploaded song\'s path (its own folder\'s or another campaign\'s: a song brought in by reference), a size in bytes and a length as numbers, nothing else riding along; a playlist by its id once naming only tracks that are there; a library that is a list, or holds nothing that cleans, goes; a campaign without one gets none; with the cleaner not loaded it is left as it is (never lost: the panel reads it through the same view)',
            JSON.stringify(musOf(withM)) === JSON.stringify([{ v: 1, tracks: [{ id: 't_one', name: 'Rain  <b>x</b>', path: '/saves/images/audio/mA/k3j9_rain.ogg', size: 1000, dur: 12.34 }, { id: 't_ref', name: 'Brought in', path: '/saves/images/audio/mB/song.ogg', size: 5, dur: 0 }], playlists: [{ id: 'pl_a', name: 'Mood', tracks: ['t_one', 't_ref'] }] }, 'none', 'none', 'none'])
            && JSON.stringify(musOf(noM)) === JSON.stringify(musOf({ campaigns: fileM().campaigns })), JSON.stringify([musOf(withM), musOf(noM)]));
        // item 21, the zip fold: an export's archive carries the campaign's videos with its pictures and sounds (each file read from disk in
        // parts, the archive of any size: tools/zipcheck.js)
        const cipSrc = ioSrc.slice(ioSrc.indexOf('  function collectImagePaths('), ioSrc.indexOf('  // [zipcheck:exportfile-start]'));
        const filterLine = (/      var paths = collectImagePaths\(payload\);/.exec(ioSrc) || [''])[0];
        const pathsOf = new Function('payload', cipSrc + '\n' + filterLine + '\nreturn paths;');
        const exP = pathsOf({ campaigns: { c: { items: { m: { whiteboard: [{ src: '/saves/images/m/a.png' }] } }, sounds: [{ path: '/saves/images/audio/c/rain.ogg' }], music: { tracks: [{ id: 't_1', path: '/saves/images/audio/other/song.mp3' }] }, videos: [{ path: '/saves/images/video/c/k_intro.mp4' }, { path: '/saves/images/video/c/k_big.webm' }] } } });
        check('item 21 an export bundles the pictures, the sounds, the songs and the videos its campaign names — a song brought in from another campaign too, from that campaign\'s folder: no path of the video folder is filtered out any more (the files travel whole)',
            !!filterLine && !/collectImagePaths\(payload\)\.filter/.test(ioSrc) && JSON.stringify(exP.slice().sort()) === JSON.stringify(['/saves/images/audio/c/rain.ogg', '/saves/images/audio/other/song.mp3', '/saves/images/m/a.png', '/saves/images/video/c/k_big.webm', '/saves/images/video/c/k_intro.mp4']), JSON.stringify(exP));
        // the outside audit of 2026-10-01 (cluster V): any text in a campaign can hold "/saves/images/…" — a player's name is enough — and the export
        // fetches whatever such a string names. Only a plain path under saves/images is a file to bundle: nothing that walks out of the folder (the
        // browser collapses dot segments, so "/saves/images/../data.json" asks for the save itself, with every table key), nothing in the Journal
        const hostP = { campaigns: { c: { players: { u_a: { name: '/saves/images/../data.json' }, u_b: { name: '/saves/images/../preferences.json' } }, chars: { ch1: { name: '/saves/images/m/../../error.log' } },
            items: { m: { whiteboard: [{ src: '/saves/images/m/a.png' }, { type: 'text', text: 'see /saves/images/../backups/data-x.json and /saves/images/./journal/journals.json and /saves/images//journal/journals.json' }, { text: '/saves/images/journal/journals.json' }, { text: '/saves/images/JOURNAL./c/journal.json' }, { text: '/saves/images/journal /c/h.png' },
                { text: '/saves/images/journal/c1__gm/journal.json' }, { text: '/saves/images/m/a.png?x' }, { text: '/saves/images/m/b.png#frag' }, { text: '/saves/images/m:stream/c.png' }, { text: '/saves/images/m/..hidden/d.png' }, { text: '/saves/images/' }, { src: '/saves/images/journalism/a.png' }, { src: '/saves/images/m/50% off.png' }, { src: '/saves/images/m/a.b.c.png' }] } },
            sounds: [{ path: '/saves/images/audio/other/song.mp3' }], videos: [{ path: '/saves/images/video/c/k.mp4' }] } } };
        const hostPaths = pathsOf(hostP).slice().sort(), okPaths = ['/saves/images/audio/other/song.mp3', '/saves/images/journalism/a.png', '/saves/images/m/..hidden/d.png', '/saves/images/m/50% off.png', '/saves/images/m/a.b.c.png', '/saves/images/m/a.png', '/saves/images/video/c/k.mp4'];   // a name that only holds dots (a picture from before 1.5.0 may) is no walk
        const landed = hostPaths.map(p => { try { return decodeURIComponent(new URL(encodeURI(p), 'http://localhost').pathname); } catch (e) { return 'bad'; } });
        check('an export bundles only files under saves/images that a path names plainly (collectImagePaths, run for real): a string in the campaign that walks out of the folder — a player called "/saves/images/../data.json", a character, a text naming the profile store, the log or a backup — names no file, nor does one in the Journal\'s folder in any spelling, one with an empty or dot segment, a query, a fragment or a stream name; a picture, a sound, a video, a folder that merely begins with journal and a name with dots, a space or a percent sign are bundled as before; every path kept is fetched from under /saves/images/ and is no Journal file',
            JSON.stringify(hostPaths) === JSON.stringify(okPaths) && landed.every(p => p.indexOf('/saves/images/') === 0 && !/^\/saves\/images\/journal[. ]*\//i.test(p)) && /function exportPathOk\(p\) \{/.test(cipSrc), JSON.stringify([hostPaths, landed]));
        // item 20 K2: a campaign's clock from a file, cleaned by the real load normaliser with the real calendarcore; none without the cleaner
        const CCl = await import(surl('calendarcore.js'));
        const migK = win => new Function('window', 'CATS', 'CURRENT_SCHEMA', 'createNewCampaign', '"use strict";\n' + ioSrc.slice(mi, mk) + '\nreturn function(d) { return migrateAppState(d).data; };')(win, { default: { label: 'Default', color: '#ccc' } }, 2, nm => ({ id: 'camp_v0', name: nm, items: {} }));
        const fileK = () => ({ activeCampaignId: 'cA', campaigns: { cA: { id: 'cA', name: 'A', items: {}, clock: { t: 3600.5, hide: 'yes', notes: '<b>', x: 1 } }, cB: { id: 'cB', name: 'B', items: {}, clock: 'noon' }, cC: { id: 'cC', name: 'C', items: {}, clock: { t: -9, hide: true } }, cD: { id: 'cD', name: 'D', items: {} } } });
        const withK = migK({ wpSystemCore: S, wpFormula: F, wpLibraryCore: LBC, wpCalendarCore: CCl })(fileK()), noK = migK({ wpSystemCore: S, wpFormula: F, wpLibraryCore: LBC })(fileK());
        const clkK = st => ['cA', 'cB', 'cC', 'cD'].map(id => ('clock' in st.campaigns[id] ? st.campaigns[id].clock : 'none'));
        check('item 20 K2 the load cleans a campaign\'s clock (the real load normaliser with the real calendarcore): its time as whole seconds from 0 and the hide flag only as true, nothing else riding along; one that is no object dropped; a campaign without one gets none; with its cleaner not loaded none at all (never the raw value)',
            JSON.stringify(clkK(withK)) === JSON.stringify([{ t: 3600 }, 'none', { t: 0, hide: true }, 'none']) && JSON.stringify(clkK(noK)) === JSON.stringify(['none', 'none', 'none', 'none']), JSON.stringify([clkK(withK), clkK(noK)]));
        const notesK = migK({ wpSystemCore: S, wpFormula: F, wpLibraryCore: LBC, wpCalendarCore: CCl })({ activeCampaignId: 'cN', campaigns: { cN: { id: 'cN', name: 'N', items: {}, clock: { t: 5, notes: [{ id: 'n_bbbbbbbb', day: 7, text: 'Later', vis: 'all', x: '<b>' }, { id: 'n_aaaaaaaa', day: 2, text: ' Fair\u0000day ', vis: 'yes' }, { id: 'n_aaaaaaaa', day: 3, text: 'again' }, { id: '../x', day: 1, text: 'path' }, { id: 'n_cccccccc', day: -2, text: 'before' }, { id: 'n_dddddddd', day: 4, text: '' }] } } } });
        check('item 20 K3 the load cleans a clock\'s dated notes (the real load normaliser with the real calendarcore): each id of the pattern once, a whole day from 0, one line of text, vis only as all, in day order; anything else dropped',
            JSON.stringify(notesK.campaigns.cN.clock) === JSON.stringify({ t: 5, notes: [{ id: 'n_aaaaaaaa', day: 2, text: 'Fair day' }, { id: 'n_bbbbbbbb', day: 7, text: 'Later', vis: 'all' }] }), JSON.stringify(notesK.campaigns.cN.clock));
        const upLoad = migrate({ activeCampaignId: 'cU', campaigns: { cU: { id: 'cU', name: 'U', items: {}, uploads: [{ id: 'up_a', charId: 'c_1', name: 'Pat', at: 1, changes: [{ id: 'u_1', kind: 'fact', f: 'f_sk', row: 'w_a', label: 'L', facts: { lvl: 2 }, accept: true, junk: 1 }, { id: 'u_2', kind: 'nope', f: 'f_sk' }] }, { id: '../x', charId: 'c_2' }] }, cV: { id: 'cV', name: 'V', items: {}, uploads: 'junk' } } });
        check('U2 the load (and an import) cleans the GM\'s queue of players\' sheet uploads as the review reads it (a change of a known kind only, nothing riding along) and drops an empty one',
            JSON.stringify(upLoad.campaigns.cU.uploads) === JSON.stringify([{ id: 'up_a', charId: 'c_1', from: '', name: 'Pat', at: 1, changes: [{ id: 'u_1', kind: 'fact', f: 'f_sk', label: 'L', from: '', to: '', accept: true, held: false, row: 'w_a', facts: { lvl: 2 } }] }]) && !('uploads' in upLoad.campaigns.cV), JSON.stringify(upLoad.campaigns.cU.uploads));
        const si = netSrc.indexOf('function escAttr('), sk = netSrc.indexOf('net.sanitizeRichText = sanitizeRichText;');
        const sanitize = new Function(netSrc.slice(si, sk) + '\nreturn sanitizeRichText;')();
        const deps = { migrate, DR: DOC, sanitize };
        check('import: the load normaliser and the rich-text sanitiser slice out of io.js and net.js', mi > 0 && mk > mi && si > 0 && sk > si && typeof migrate === 'function' && typeof sanitize === 'function');
        // a file from elsewhere, as JSON.parse reads it: "__proto__" is an own key there, as it would be in a real file
        const hostileText = JSON.stringify({ activeCampaignId: 'constructor', campaigns: {
            cA: { id: 'cA', name: 'Theirs', activeItemId: 'toString',
                system: { v: 1, name: 'SB', fields: [{ id: 'f_st', key: 'ST', kind: 'number', def: 10, vis: 'all', min: 1, max: 20 }], rolls: [] },
                chars: { c_1: { id: 'c_1', name: 'Hero', ownerId: 'u_x', values: { f_st: 12, f_zz: 5 } }, c_bad: { id: 'c_other', name: 'Liar' } },
                items: {
                    p1: { id: 'p1', type: 'planner', meta: { title: 'Notes' }, blocks: [{ type: 'raw', content: '<img src=x onerror=alert(1)><b>hi</b>' }, { type: 'diagram', content: 'graph TD\nA-->B\nclick A "javascript:alert(1)"' }] },
                    m1: { id: 'm1', type: 'map', meta: { title: 'Map' }, rooms: [], links: [], whiteboard: [{ id: 'w1', type: 'text', text: '<script>alert(1)</script>hey', x: 1, y: 1, w: 50, h: 20 }, { id: 't1', isChar: true, charId: 'c_1', x: 100, y: 100, w: 60, h: 52 }] },
                    bare: { type: 'map' },
                    constructor: { id: 'constructor', type: 'planner', meta: { title: 'Sneak' }, blocks: [] }
                } },
            cB: { id: 'cB', name: 'No system', chars: { c_9: { id: 'c_9', name: 'Orphan' } }, items: { q1: { id: 'q1', type: 'planner', meta: { title: 'Q' }, blocks: [] } } },
            constructor: { id: 'constructor', name: 'Proto', items: {} },
            ZZPROTO: { id: '__proto__', name: 'Proto2', items: {} }
        } }).replace('"ZZPROTO":', '"__proto__":');
        const out = cleanImport(JSON.parse(hostileText), deps);
        const cA = out && out.campaigns.cA, cB = out && out.campaigns.cB;
        check('import: no campaign under a prototype key comes in ("constructor", "__proto__"), and a prototype-key active campaign is repaired to one that did',
            !!out && JSON.stringify(Object.keys(out.campaigns)) === '["cA","cB"]' && out.activeCampaignId === 'cA', out && JSON.stringify([Object.keys(out.campaigns), out.activeCampaignId]));
        check('import: no item under a prototype key comes in, and an active item that is not an own key is repaired',
            !!cA && !Object.prototype.hasOwnProperty.call(cA.items, 'constructor') && Object.prototype.hasOwnProperty.call(cA.items, cA.activeItemId), cA && JSON.stringify([Object.keys(cA.items), cA.activeItemId]));
        const p1 = cA && cA.items.p1, m1 = cA && cA.items.m1;
        check('import: a planner\'s raw HTML goes through the rich-text sanitiser, a diagram loses its click directive, a play map\'s text item is rebuilt',
            !!p1 && !/[<>]/.test(p1.blocks[0].content) && /hi/.test(p1.blocks[0].content) && !/click|javascript/.test(p1.blocks[1].content) && /A-->B/.test(p1.blocks[1].content) && !/<script/i.test(m1.whiteboard[0].text), p1 && JSON.stringify([p1.blocks, m1.whiteboard[0].text]));
        check('import: shaped by the load\'s normaliser — an item with no meta gets its title and a map its rooms, links, play map and categories; the schema is stamped',
            !!cA && cA.items.bare.meta.title === 'Map' && Array.isArray(cA.items.bare.rooms) && Array.isArray(cA.items.bare.links) && Array.isArray(cA.items.bare.whiteboard) && !!cA.items.bare.cats && out._schema === 2, cA && JSON.stringify(cA.items.bare));
        check('import: the system is cleaned and each character cleaned against it (an unknown value goes, a character whose id disagrees goes), and its owner is stamped on its token; characters with no system go',
            !!cA && !!cA.system && Object.keys(cA.chars).join() === 'c_1' && !('f_zz' in cA.chars.c_1.values) && m1.whiteboard[1].ownerId === 'u_x' && !!cB && !('chars' in cB), cA && JSON.stringify([cA.chars, m1.whiteboard[1], cB && cB.chars]));
        // senses S1: a file's senses (the system's combat.senses) come in cleaned as the app cleans them, on Replace (the load's normaliser) and on Merge (main.js)
        const sensesSys = () => ({ v: 1, name: 'Sn', rolls: [], fields: [{ id: 'f_st', key: 'Sight', label: 'S', kind: 'number', def: 6, vis: 'all' }, { id: 'f_gm', key: 'GMFig', label: 'G', kind: 'number', def: 5, vis: 'gm' }],
            combat: { senses: { vis: 'gm', blind: { field: 'f_gm' }, list: [
                { id: 'sn_force001', name: 'Force' + String.fromCharCode(7) + 'Sight', range: { by: 'field', field: 'f_st', formula: 'x' }, grade: 'full', walls: 'pass', shows: 'dim', glyph: 'heat', junk: 1 },
                { id: 'sn_secret01', name: 'Secret', range: { by: 'field', field: 'f_gm' }, grade: 'mark' }, { id: 'bad', name: 'Bad', range: { by: 'n', n: 1 }, grade: 'full' }] } } });
        const sensesWant = JSON.stringify({ list: [{ id: 'sn_force001', name: 'Force Sight', range: { by: 'field', field: 'f_st' }, grade: 'full', walls: 'pass', shows: 'dim' }] });
        const outS = cleanImport({ campaigns: { cS: { id: 'cS', name: 'S', items: {}, system: sensesSys() } } }, deps);
        const mergeS = S.cleanSystem(sensesSys(), { F, gmView: true });
        check('S1 import: a file\'s senses come in cleaned — on Replace by the load\'s own normaliser (junk keys cut, a name cleaned, a sense or blind on a GM-only value gone, a bad id gone) and on Merge by the same cleaner main.js runs on a new campaign and on one already here',
            !!outS && JSON.stringify(outS.campaigns.cS.system.combat.senses) === sensesWant && JSON.stringify(mergeS.combat.senses) === sensesWant
            && (mainSrc.match(/window\.wpSystemCore\.cleanSystem\(ic\.system, \{ F: window\.wpFormula, gmView: true \}\)/g) || []).length === 2, outS && JSON.stringify(outS.campaigns.cS.system.combat));
        // text style: a planner's and a page's formats (the look of a plain field, stored beside its text) come in cleaned against their texts — on Merge, on Replace and on a load
        {
            const RED = '#d9534f';
            const styledPlanner = () => ({ id: 'pf', type: 'planner', meta: { title: 'Styled' }, blocks: [
                { id: 'b1', type: 'h1', title: 'Title', sub: 'sub', fmt: { title: { color: '#D9534F', b: 'yes', onclick: 'alert(1)', spans: [{ s: 0, e: 2, b: true, style: 'x' }, { s: 3, e: 99, color: 'url(//evil.example/c)' }, { s: -1, e: 4, i: true }] }, sub: { size: '99em;position:fixed' }, evil: { b: true } } },
                { id: 'b2', type: 'node', title: 'N', tag: 't', must: 'm', cols: ['A', 'B'], colFmt: [{ b: true }, 'x', { i: true }], fmt: { tag: { i: true }, must: 'bold' },
                  rows: [{ col1: 'cell', col2: 'y', fmt: { col1: { spans: [{ s: 1, e: 3, color: RED }] }, col2: { color: 'red' }, col9: { b: true }, junk: { b: true } } }, { col1: 'q', fmt: [{ b: true }] }] },
                { id: 'b3', type: 'flowchart', nodes: [{ id: 'n1', text: 'label', fmt: { size: 'huge', spans: [{ s: 2, e: 400, i: true }] } }, { id: 'n2', text: 'x', fmt: { color: 'javascript:alert(1)' } }], edges: [{ from: 'n1', to: 'n2', text: 'go', fmt: { b: true, x: 1 } }, { from: 'n2', to: 'n1', text: '', fmt: { spans: [{ s: 0, e: 1, b: true }] } }] },
                { id: 'b4', type: 'image', src: '/saves/images/x.png', caption: 'cap', fmt: { caption: { size: 'small', color: '#fff' } } }
            ] });
            const styledPage = () => ({ id: 'df', type: 'doc', meta: { title: 'Page', players: true }, blocks: [
                { id: 'c1', type: 'h2', title: 'Sec', fmt: { title: { color: '#D9534F', spans: [{ s: 0, e: 9, b: true }, { s: 1, e: 2, color: 'red' }] } } },
                { id: 'c2', type: 'table', title: 'T', cols: ['A'], colFmt: [{ i: true, evil: 1 }], rows: [{ col1: 'x', fmt: { col1: { b: true, onclick: 'x' } } }] }
            ] });
            const wantPlanner = JSON.stringify([
                { id: 'b1', type: 'h1', title: 'Title', sub: 'sub', fmt: { title: { color: RED, spans: [{ s: 0, e: 2, b: true }] } } },
                { id: 'b2', type: 'node', title: 'N', tag: 't', must: 'm', cols: ['A', 'B'], colFmt: [{ b: true }], fmt: { tag: { i: true } }, rows: [{ col1: 'cell', col2: 'y', fmt: { col1: { spans: [{ s: 1, e: 3, color: RED }] } } }, { col1: 'q' }] },
                { id: 'b3', type: 'flowchart', nodes: [{ id: 'n1', text: 'label', fmt: { size: 'huge', spans: [{ s: 2, e: 5, i: true }] } }, { id: 'n2', text: 'x' }], edges: [{ from: 'n1', to: 'n2', text: 'go', fmt: { b: true } }, { from: 'n2', to: 'n1', text: '' }] },
                { id: 'b4', type: 'image', src: '/saves/images/x.png', caption: 'cap', fmt: { caption: { size: 'small' } } }
            ]);
            const icF = JSON.parse(JSON.stringify({ items: { pf: styledPlanner(), df: styledPage() } }));
            cleanImportItems(icF, deps);
            const pageOk = c => !!c && JSON.stringify(c.blocks[0].fmt) === JSON.stringify({ title: { color: RED, spans: [{ s: 0, e: 3, b: true }] } }) && JSON.stringify(c.blocks[1].colFmt) === '[{"i":true}]' && JSON.stringify(c.blocks[1].rowFmt) === '[[{"b":true}]]' && JSON.stringify(c.blocks[1].rows) === '[["x"]]';
            check('text style import (Merge): every format a planner\'s blocks carry is cleaned against its own text — a title\'s, a tag\'s, a head\'s, a cell\'s, a node\'s label\'s, an arrow\'s, a caption\'s — hostile keys and values gone, an emptied holder gone; a page\'s through cleanDoc',
                JSON.stringify(icF.items.pf.blocks) === wantPlanner && pageOk(icF.items.df), JSON.stringify(icF.items.pf.blocks));
            const outF = cleanImport(JSON.parse(JSON.stringify({ activeCampaignId: 'cF', campaigns: { cF: { id: 'cF', name: 'F', items: { pf: styledPlanner(), df: styledPage() } } } })), deps);
            check('text style import (Replace): the same, after the load\'s normaliser', !!outF && JSON.stringify(outF.campaigns.cF.items.pf.blocks) === wantPlanner && pageOk(outF.campaigns.cF.items.df), outF && JSON.stringify(outF.campaigns.cF.items.pf.blocks));
            const bare = b => JSON.stringify(b).indexOf('"fmt"') < 0 && JSON.stringify(b).indexOf('"colFmt"') < 0 && JSON.stringify(b).indexOf('"rowFmt"') < 0;
            const icN = JSON.parse(JSON.stringify({ items: { pf: styledPlanner(), df: styledPage() } })); cleanImportItems(icN, { sanitize });
            const icO = JSON.parse(JSON.stringify({ items: { pf: styledPlanner(), df: styledPage() } })); cleanImportItems(icO, { sanitize, DR: { cleanDoc: DOC.cleanDoc, stripMermaidLinks: DOC.stripMermaidLinks } });
            check('text style import: none without the core — with no cleaner on hand a planner comes in with no format at all (its text as it was), and a page does not come in',
                bare(icN.items.pf.blocks) && icN.items.pf.blocks[0].title === 'Title' && icN.items.pf.blocks[1].rows[0].col1 === 'cell' && icN.items.pf.blocks[2].nodes[0].text === 'label' && !icN.items.df && bare(icO.items.pf.blocks) && icO.items.pf.blocks.length === 4, JSON.stringify(icN.items.pf.blocks));
            const mkMig = win => new Function('window', 'CATS', 'CURRENT_SCHEMA', 'createNewCampaign', '"use strict";\n' + ioSrc.slice(mi, mk) + '\nreturn function(d) { return migrateAppState(d).data; };')(win, { default: { label: 'Default', color: '#ccc' } }, 2, nm => ({ id: 'camp_v0', name: nm, items: {} }));
            const loadF = mkMig({ wpSystemCore: S, wpFormula: F, wpDocRender: DOC })({ activeCampaignId: 'cF', campaigns: { cF: { id: 'cF', name: 'F', items: { pf: styledPlanner(), df: styledPage() } } } });
            const loadN = mkMig({ wpSystemCore: S, wpFormula: F })({ activeCampaignId: 'cF', campaigns: { cF: { id: 'cF', name: 'F', items: { pf: styledPlanner() } } } });
            check('text style load: a save\'s planner and page formats are cleaned in place as the app reads them (a page keeps its rows as the editor wrote them); with the cleaner not loaded they are left as they are (never lost — every draw cleans again)',
                JSON.stringify(loadF.campaigns.cF.items.pf.blocks) === wantPlanner && JSON.stringify(loadF.campaigns.cF.items.df.blocks[0].fmt) === JSON.stringify({ title: { color: RED, spans: [{ s: 0, e: 3, b: true }] } }) && JSON.stringify(loadF.campaigns.cF.items.df.blocks[1].rows) === JSON.stringify([{ col1: 'x', fmt: { col1: { b: true } } }])
                && JSON.stringify(loadN.campaigns.cF.items.pf.blocks) === JSON.stringify(styledPlanner().blocks), JSON.stringify(loadF.campaigns.cF.items.df.blocks));
            {   // a diagram's link from a file (1.5.0): a flowchart node's link by the one rule, a diagram block's link statements as canonical lines — on Merge, on Replace and on a load
                const OKL = 'https://ok.example/a?b=1&c=2#f', LINE = 'click A href "' + OKL + '"', Jl = JSON.stringify;
                const blocksL = () => [
                    { id: 'f1', type: 'flowchart', nodes: [{ id: 'a', text: 'A', link: '  ' + OKL + ' ' }, { id: 'b', text: 'B', link: 'javascript:alert(1)' }, { id: 'c', text: 'C', link: 'https://ok.example/"\nclick a call alert(1)' }, { id: 'd', text: 'D', link: { href: OKL } }, { id: 'e', text: 'E', link: '//evil.example/x' }, { id: 'g', text: 'G', link: 'data:text/html,<script>alert(1)</script>' }, { id: 'h', text: 'H' }, { id: 'i', text: 'I', link: 'https://ok.example/#a;b' }], edges: [{ from: 'a', to: 'b', text: 'go', link: OKL }] },
                    { id: 'd1', type: 'diagram', content: ['graph TD', 'A-->B', 'click A "' + OKL + '" "tip <img src=x onerror=alert(1)>" _top', 'click B call alert(1)', 'click B href "javascript:alert(1)"', 'click A,B "' + OKL + '"', 'click __proto__ "' + OKL + '"', 'callback B "f"'].join('\n') },
                    { id: 'd2', type: 'diagram', content: ['gantt', 'section S', 'T :A, 2024-01-01, 1d', 'click A href "' + OKL + '"'].join('\n') },
                    { id: 'd3', type: 'diagram', content: 'graph TD\nA-->B\n' + Array.from({ length: 10000 }, (x, i) => i % 2 ? 'click N' + i + ' href "https://ok.example/' + i + '" _blank' : 'click N' + i + ' call f' + i + '()').join('\n') }
                ];
                const itemsL = () => ({ pl: { id: 'pl', type: 'planner', meta: { title: 'P' }, blocks: blocksL() }, pg: { id: 'pg', type: 'doc', meta: { title: 'G', players: true }, blocks: blocksL().slice(0, 3) } });
                const linksOf = b => (b.nodes || []).map(n => 'link' in n ? n.link : null), wantLinks = Jl([OKL, null, null, null, null, null, null, null]);
                const okItem = (it, n) => !!it && it.blocks.length === n && Jl(linksOf(it.blocks[0])) === wantLinks && it.blocks[0].nodes.length === 8 && it.blocks[0].edges.length === 1 && !('link' in it.blocks[0].edges[0])
                    && it.blocks[1].content === 'graph TD\nA-->B\n' + LINE && it.blocks[2].content === 'gantt\nsection S\nT :A, 2024-01-01, 1d';
                const manyOk = it => { const l = it.blocks[3].content.split('\n'); return l.length === 5002 && l.slice(2).every(x => !!DOC.readLinkLine(x)); };
                const icL = JSON.parse(Jl({ items: itemsL() })); cleanImportItems(icL, deps);
                check('a diagram\'s link (import, Merge): a planner\'s and a page\'s flowchart nodes keep a link only by the one rule — the allowed one trimmed; a script, data: or protocol-relative address, one that tries to end the statement, one that is no string and one the diagram library would not read back are taken off while the node stays; an arrow\'s is taken off — and a diagram block\'s link statements come in as canonical lines only (a callback, a call, a tooltip, a target, a list of ids, an id every object carries are gone; a Gantt chart keeps none; of 10,000 link lines the 5,000 the rule keeps)',
                    okItem(icL.items.pl, 4) && manyOk(icL.items.pl) && okItem(icL.items.pg, 3), Jl([icL.items.pl && linksOf(icL.items.pl.blocks[0]), icL.items.pl && icL.items.pl.blocks[1].content, icL.items.pg && linksOf(icL.items.pg.blocks[0])]));
                const outL = cleanImport(JSON.parse(Jl({ activeCampaignId: 'cL', campaigns: { cL: { id: 'cL', name: 'L', items: itemsL() } } })), deps);
                check('a diagram\'s link (import, Replace): the same, after the load\'s normaliser', !!outL && okItem(outL.campaigns.cL.items.pl, 4) && manyOk(outL.campaigns.cL.items.pl) && okItem(outL.campaigns.cL.items.pg, 3), outL && Jl(linksOf(outL.campaigns.cL.items.pl.blocks[0])));
                const icN2 = JSON.parse(Jl({ items: itemsL() })); cleanImportItems(icN2, { sanitize });
                const loadL = mkMig({ wpSystemCore: S, wpFormula: F, wpDocRender: DOC })({ activeCampaignId: 'cL', campaigns: { cL: { id: 'cL', name: 'L', items: itemsL() } } });
                check('a diagram\'s link (import with no cleaner on hand; a load): with no cleaner a planner\'s nodes come in with no link at all and its diagrams empty, and a page does not come in; on a load a planner\'s and a page\'s node links are cleaned in place by the same rule (a diagram\'s own text is judged where it is drawn and where it is sent)',
                    !!icN2.items.pl && icN2.items.pl.blocks[0].nodes.length === 8 && icN2.items.pl.blocks[0].nodes.every(n => !('link' in n)) && !('link' in icN2.items.pl.blocks[0].edges[0]) && icN2.items.pl.blocks.slice(1).every(b => b.content === '') && !icN2.items.pg
                    && Jl(linksOf(loadL.campaigns.cL.items.pl.blocks[0])) === wantLinks && !('link' in loadL.campaigns.cL.items.pl.blocks[0].edges[0]) && Jl(linksOf(loadL.campaigns.cL.items.pg.blocks[0])) === wantLinks && !('link' in loadL.campaigns.cL.items.pg.blocks[0].edges[0]), Jl([icN2.items.pl && icN2.items.pl.blocks[0], linksOf(loadL.campaigns.cL.items.pl.blocks[0])]));
            }
            const plainPl = () => ({ id: 'pp', type: 'planner', meta: { title: 'Plain' }, blocks: [{ id: 'b1', type: 'h1', title: 'T', sub: '' }, { id: 'b2', type: 'node', title: 'N', cols: ['A'], rows: [{ col1: 'x' }] }, { id: 'b3', type: 'flowchart', nodes: [{ id: 'a', text: 'x' }], edges: [] }] });
            const icP = { items: { pp: plainPl() } }; cleanImportItems(icP, deps);
            check('text style import: a planner with no format comes in exactly as it was', JSON.stringify(icP.items.pp) === JSON.stringify(plainPl()));
            // a size on a part, underline, strike and a link (the owner, 2026-10-02): a hostile link in a file is dropped on Merge, on Replace and on a load — the text and the rest of its look kept
            {
                const OK = 'https://ok.example/p?a=1&b=2', J = JSON.stringify;
                const BADL = ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'https://a.example/' + String.fromCharCode(0), 'https://a.example/' + String.fromCharCode(10) + 'x', 'https://a b', '//evil.example/x', 'https://' + 'a'.repeat(2000), 7];
                const linkPlanner = v => ({ id: 'pl', type: 'planner', meta: { title: 'L' }, blocks: [
                    { id: 'b1', type: 'h1', title: 'Title', sub: 'sub', fmt: { title: { link: v, u: true, spans: [{ s: 0, e: 2, size: 'large', link: OK }] }, sub: { link: v } } },
                    { id: 'b2', type: 'node', title: 'N', tag: 't', must: 'm', cols: ['A'], colFmt: [{ link: v, st: 1 }], fmt: { tag: { link: v, st: true } }, rows: [{ col1: 'cell', fmt: { col1: { spans: [{ s: 0, e: 2, link: v, size: '9em' }, { s: 2, e: 4, link: OK }] } } }] },
                    { id: 'b3', type: 'flowchart', nodes: [{ id: 'n1', text: 'label', fmt: { link: OK, spans: [{ s: 0, e: 2, link: v, u: true }] } }], edges: [{ from: 'n1', to: 'n1', text: 'go', fmt: { link: v } }] },
                    { id: 'b4', type: 'image', src: '/saves/images/x.png', caption: 'cap', fmt: { caption: { link: v } } } ] });
                const linkPage = v => ({ id: 'dl', type: 'doc', meta: { title: 'Page', players: true }, blocks: [{ id: 'c1', type: 'h2', title: 'Sec', fmt: { title: { link: v, spans: [{ s: 0, e: 1, link: OK, st: true }] } } }, { id: 'c2', type: 'table', title: 'T', cols: ['A'], colFmt: [{ link: v }], rows: [{ col1: 'x', fmt: { col1: { link: v, u: true } } }] }] });
                const wantL = J([
                    { id: 'b1', type: 'h1', title: 'Title', sub: 'sub', fmt: { title: { u: true, spans: [{ s: 0, e: 2, size: 'large', link: OK }] } } },
                    { id: 'b2', type: 'node', title: 'N', tag: 't', must: 'm', cols: ['A'], fmt: { tag: { st: true } }, rows: [{ col1: 'cell', fmt: { col1: { spans: [{ s: 2, e: 4, link: OK }] } } }] },
                    { id: 'b3', type: 'flowchart', nodes: [{ id: 'n1', text: 'label', fmt: { spans: [{ s: 0, e: 2, u: true }] } }], edges: [{ from: 'n1', to: 'n1', text: 'go' }] },
                    { id: 'b4', type: 'image', src: '/saves/images/x.png', caption: 'cap' } ]);
                const pageL = c => !!c && J(c.blocks[0].fmt) === J({ title: { spans: [{ s: 0, e: 1, st: true, link: OK }] } }) && c.blocks[0].title === 'Sec' && !('colFmt' in c.blocks[1]) && J(c.blocks[1].rowFmt) === '[[{"u":true}]]' && J(c.blocks[1].rows) === '[["x"]]';
                const quiet = o => !/javascript|vbscript|data:text|evil\.example|"link":(?!"https:\/\/ok\.example\/p\?a=1&b=2")/i.test(J(o));   // no link left but the allowed one
                const merged = BADL.map(v => { const ic = JSON.parse(J({ items: { pl: linkPlanner(v), dl: linkPage(v) } })); cleanImportItems(ic, deps); return ic; });
                check('text style import (Merge, a hostile link): javascript:, data:, a control character, white space inside, a protocol-relative one, an over-long one, one that is no string — dropped from every field of a planner and a page, the text and the rest of the look kept, the allowed link beside it kept; a flowchart label keeps no link at all',
                    merged.every(ic => J(ic.items.pl.blocks) === wantL && pageL(ic.items.dl) && quiet(ic)), J(merged.filter(ic => J(ic.items.pl.blocks) !== wantL).map(ic => ic.items.pl.blocks)[0]));
                const replaced = BADL.map(v => cleanImport(JSON.parse(J({ activeCampaignId: 'cL', campaigns: { cL: { id: 'cL', name: 'L', items: { pl: linkPlanner(v), dl: linkPage(v) } } } })), deps));
                check('text style import (Replace, a hostile link): the same, after the load\'s normaliser', replaced.every(o => !!o && J(o.campaigns.cL.items.pl.blocks) === wantL && pageL(o.campaigns.cL.items.dl) && quiet(o)), J(replaced[0] && replaced[0].campaigns.cL.items.pl.blocks));
                const loaded = BADL.map(v => mkMig({ wpSystemCore: S, wpFormula: F, wpDocRender: DOC })(JSON.parse(J({ activeCampaignId: 'cL', campaigns: { cL: { id: 'cL', name: 'L', items: { pl: linkPlanner(v), dl: linkPage(v) } } } }))));
                check('text style load (a hostile link): a save that holds one is cleaned as the app reads it — the planner\'s and the page\'s formats lose the link, keep the text and the rest',
                    loaded.every(o => J(o.campaigns.cL.items.pl.blocks) === wantL && J(o.campaigns.cL.items.dl.blocks[0].fmt) === J({ title: { spans: [{ s: 0, e: 1, st: true, link: OK }] } }) && !('colFmt' in o.campaigns.cL.items.dl.blocks[1]) && J(o.campaigns.cL.items.dl.blocks[1].rows) === J([{ col1: 'x', fmt: { col1: { u: true } } }]) && quiet(o)), J(loaded[0].campaigns.cL.items.dl.blocks));
                const kept = JSON.parse(J({ items: { pl: linkPlanner(OK), dl: linkPage(OK) } })); cleanImportItems(kept, deps);
                check('text style import (a link that is allowed): kept in a title, a tag, a head, a cell and a caption — and still never on a flowchart label',
                    J(kept.items.pl.blocks[0].fmt) === J({ title: { u: true, link: OK, spans: [{ s: 0, e: 2, size: 'large' }] }, sub: { link: OK } }) && J(kept.items.pl.blocks[1].fmt) === J({ tag: { st: true, link: OK } }) && J(kept.items.pl.blocks[1].colFmt) === J([{ link: OK }])
                    && J(kept.items.pl.blocks[1].rows[0].fmt) === J({ col1: { link: OK } }) && J(kept.items.pl.blocks[3].fmt) === J({ caption: { link: OK } }) && J(kept.items.pl.blocks[2].nodes[0].fmt) === J({ spans: [{ s: 0, e: 2, u: true }] }) && !('fmt' in kept.items.pl.blocks[2].edges[0])
                    && J(kept.items.dl.blocks[0].fmt) === J({ title: { link: OK, spans: [{ s: 0, e: 1, st: true }] } }) && J(kept.items.dl.blocks[1].colFmt) === J([{ link: OK }]) && J(kept.items.dl.blocks[1].rowFmt) === J([[{ u: true, link: OK }]]), J(kept.items.pl.blocks));
            }
        }
        // a page cleanDoc refuses takes nobody with it: its child comes in at the top of the tree
        const pages = { campaigns: { cP: { id: 'cP', name: 'P', items: { d1: { id: 'd1', type: 'doc', meta: { title: 'refuse me' }, blocks: [] }, d2: { id: 'd2', type: 'doc', meta: { title: 'Child', parentId: 'd1' }, blocks: [] } } } } };
        const outP = cleanImport(pages, { migrate, sanitize, DR: { cleanDoc: (d, o) => d.meta && d.meta.title === 'refuse me' ? null : DOC.cleanDoc(d, o), stripMermaidLinks: DOC.stripMermaidLinks } });
        check('import: a page that does not come in leaves no child hidden under it', !!outP && !outP.campaigns.cP.items.d1 && !!outP.campaigns.cP.items.d2 && !outP.campaigns.cP.items.d2.meta.parentId, outP && JSON.stringify(outP.campaigns.cP.items));
        // fail closed
        const noMig = cleanImport(JSON.parse(hostileText), { DR: DOC, sanitize });
        const ic = JSON.parse(JSON.stringify({ items: { p: { type: 'planner', blocks: [{ type: 'raw', content: '<b onclick=x>t</b>' }, { type: 'diagram', content: 'click A x' }] }, m: { type: 'map', whiteboard: [{ id: 'w', type: 'text', text: '<i>x</i>' }] }, d: { type: 'doc', meta: {}, blocks: [] } } }));
        cleanImportItems(ic, {});
        check('import: fails closed — no normaliser, nothing comes in; no sanitiser, a raw block, a diagram and a text item come in empty and a page does not come in',
            noMig === null && ic.items.p.blocks[0].content === '' && ic.items.p.blocks[1].content === '' && ic.items.m.whiteboard[0].text === '' && !ic.items.d, JSON.stringify([noMig, ic.items]));
        // a planner from before blocks: its one text string opens as a raw HTML block, so it is cleaned as one — on Merge (no normaliser) and on Replace (after it)
        const oldPlan = () => ({ id: 'op', type: 'planner', meta: { title: 'Old' }, content: '<img src=x onerror="window.__pwned=9"><b>old notes</b>' });
        const icM = { items: { op: oldPlan() } }; cleanImportItems(icM, deps);
        const outWt = cleanImport({ campaigns: { cW: { id: 'cW', name: 'W', items: { mw: { id: 'mw', type: 'map', meta: { title: 'M' }, rooms: [], links: [], whiteboard: [{ id: 'wa', type: 'circle', waiting: 1, ownerId: 'u_a', x: 0, y: 0 }, { id: 'ok', type: 'rect', x: 1, y: 1, w: 5, h: 5 }] } } } } }, deps);
        const cD = { items: { m1: { type: 'map', whiteboard: [{ id: 'a', waiting: 1 }, { id: 'b', type: 'rect' }] }, m2: { type: 'map', whiteboard: [{ id: 'c', waiting: 1 }] }, p1: { type: 'planner', whiteboard: [{ id: 'd', waiting: 1 }] } } };
        const d1 = dropWaiting(cD), d2 = dropWaiting(cD), j = JSON.stringify;
        const ioW = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'io.js'), 'utf8').replace(/\r\n/g, '\n');
        check('F1a a waiting token never outlives its session: an import drops it (Replace and Merge), dropWaiting takes it from every play map (idempotent; a planner untouched), and the load, an undo, an export, a copy and a cut or delete handle it',
            outWt && j(outWt.campaigns.cW.items.mw.whiteboard.map(w => w.id)) === j(['ok']) && d1 === 2 && d2 === 0 && j(cD.items.m1.whiteboard.map(w => w.id)) === j(['b']) && cD.items.p1.whiteboard.length === 1 && dropWaiting(null) === 0
            && /state\.appState = migrated\.data;\n\s*Object\.keys\(state\.appState\.campaigns \|\| \{\}\)\.forEach\(function\(k\) \{ dropWaiting\(state\.appState\.campaigns\[k\]\); \}\);/.test(ioW)
            && /var parsed = JSON\.parse\(snap\);\n\n\s*if \(item\.type === 'map' && parsed && parsed\.c && Array\.isArray\(parsed\.c\.whiteboard\)\) parsed\.c\.whiteboard = parsed\.c\.whiteboard\.filter\(function\(w\) \{ return !\(w && w\.waiting\); \}\);[^\n]*\n[\s\S]{0,200}mergeLivePlayerState\(parsed\.c, item\)/.test(ioW)
            && /delete c\._cleanup; dropWaiting\(c\); \}\);/.test(ioW) && /var wUndo = hosting && item\.type === 'map' && window\.wpNet && window\.wpNet\.tidyWaiting \? window\.wpNet\.tidyWaiting\(\{ quiet: true, mapId: item\.id \}\) : \[\];/.test(ioW) && /wUndo\.forEach\(function\(id\) \{ if \(id !== item\.id && window\.wpNet\.broadcastItemFiltered\) window\.wpNet\.broadcastItemFiltered\(camp\.id, id\); \}\);/.test(ioW) && /\.filter\(function\(x\) \{ return x && !x\.waiting; \}\)\.map\(clone\);/.test(ioW) && (ioW.match(/x\.waiting && window\.wpNet && window\.wpNet\.noWaiting\) window\.wpNet\.noWaiting\(x\.ownerId\);/g) || []).length === 2, j([outWt && outWt.campaigns.cW.items.mw.whiteboard, d1, d2]));
        const outR = cleanImport({ campaigns: { cO: { id: 'cO', name: 'O', items: { op: oldPlan() } } } }, deps);
        const icN = { items: { op: oldPlan() } }; cleanImportItems(icN, {});
        const rawOf = it => it && Array.isArray(it.blocks) && it.blocks.length === 1 && it.blocks[0].type === 'raw' ? it.blocks[0].content : null;
        check('import: a planner from before blocks (its text one string) comes in as a raw block that has been through the sanitiser — on Merge and on Replace — and fails closed with no sanitiser; the old string never stays',
            /old notes/.test(rawOf(icM.items.op) || '') && !/[<>]/.test(rawOf(icM.items.op) || '<') && /old notes/.test(rawOf(outR && outR.campaigns.cO.items.op) || '') && !/[<>]/.test(rawOf(outR && outR.campaigns.cO.items.op) || '<')
            && rawOf(icN.items.op) === '' && !('content' in icM.items.op) && !('content' in outR.campaigns.cO.items.op), JSON.stringify([icM.items.op, outR && outR.campaigns.cO.items.op, icN.items.op]));
        check('import: a file with nothing but prototype-key campaigns brings nothing in', cleanImport(JSON.parse('{"campaigns":{"__proto__":{"id":"x","items":{}},"constructor":{"items":{}}}}'), deps) === null && cleanImport(null, deps) === null && cleanImport({ campaigns: 5 }, deps) === null);
        // a list's entry that is not an object (a null, a number, a string or a list, from a hand-edited or generated file) is dropped by the load's own
        // normaliser before anything reads its fields: it threw there, so a Replace failed with no word and a save holding one did not load. The load runs
        // as the app runs it: strict (an ES module), with the real fogcore and the real picture migration (whiteboard.js, sliced), which walks every item's lists
        {
            const jl = JSON.stringify, wbSrc = readSrc('whiteboard.js'), FCj = await import(surl('fogcore.js'));
            const cut = (from, to) => { const i = wbSrc.indexOf(from), k = wbSrc.indexOf(to, i); return i > 0 && k > i ? wbSrc.slice(i, k) : null; };
            const picParts = [cut('  var EMPTY_CATS = ', '  var _imgLibCat = '), cut('  function fixCats(', '  function catStore(store, create)'), cut('  function tagsIn(', '  function imgCatsOf('),
                cut('  function pathKeys(', '  function buildImgIndex()'), cut('  function folderOf(', '  function imgCamps(im)'), cut('  window.wpMigratePictures = function', '  // A campaign is going')];
            const picWin = {};
            if (picParts.every(Boolean)) new Function('window', '"use strict";\n' + picParts.join(''))(picWin);
            const loadWin = { wpSystemCore: S, wpFormula: F, wpLibraryCore: LBC, wpFogCore: FCj, wpMigratePictures: picWin.wpMigratePictures };
            const loadNorm = new Function('window', 'CATS', 'CURRENT_SCHEMA', 'createNewCampaign', '"use strict";\n' + ioSrc.slice(mi, mk) + '\nreturn migrateAppState;')(
                loadWin, { default: { label: 'Default', color: '#ccc' } }, 2, nm => ({ id: 'camp_v0', name: nm, items: {} }));
            const junk = () => [null, 5, 'x', [], true];
            const junkFile = () => JSON.parse(jl({ imageCats: { list: ['Default', 'Maps'], by: { '/saves/images/a.png': ['Maps'] }, shelf: {} }, activeCampaignId: 'c', campaigns: { c: { id: 'c', name: 'C', activeItemId: 'm', items: {
                m: { id: 'm', type: 'map', meta: { title: 'M', gridType: 'hex' }, cats: { default: { label: 'Default', color: '#ccc' } }, blocks: true,
                    rooms: [null, { id: 'r1', x: 1, y: 1, characters: [null, { id: 'k1', name: 'Kay' }, 5, []] }].concat(junk(), [{ id: 'r2', x: 2, y: 2, characters: 'x' }]),
                    links: [null, ['r1', 'r2'], 5, 'x', { 0: 'r1', 1: 'r2' }, ['r2', 'r1', 'route']],
                    whiteboard: [null, { id: 'a', type: 'image', src: '/saves/images/a.png', x: 0, y: 0, w: 60, h: 52 }].concat(junk(), [{ id: 'b', type: 'rect', x: 1, y: 1, w: 5, h: 5 }]) },
                p: { id: 'p', type: 'planner', meta: { title: 'P' }, blocks: [null, { id: 'pb', type: 'text', content: 'hi' }, 7, []], whiteboard: 'x', rooms: 5 },
                d: { id: 'd', type: 'doc', meta: { title: 'D' }, blocks: [{ id: 'db', type: 'h3', title: 'T' }, null, 'x', []] } } } } }));
            const kept = st => { const c = st && st.campaigns && st.campaigns.c, m = c && c.items.m; return m ? { rooms: m.rooms.map(r => r.id), chars: m.rooms.map(r => (r.characters || []).map(k => k.id)), links: m.links, wb: m.whiteboard.map(w => w.id), p: c.items.p.blocks.map(b => b.id), d: c.items.d ? c.items.d.blocks.map(b => b.id) : null } : null; };
            const want = jl({ rooms: ['r1', 'r2'], chars: [['k1'], []], links: [['r1', 'r2'], ['r2', 'r1', 'route']], wb: ['a', 'b'], p: ['pb'], d: ['db'] });
            const run = fn => { try { return { v: fn(), err: '' }; } catch (e) { return { v: null, err: e.message }; } };
            const repro = run(() => cleanImport({ campaigns: { c: { id: 'c', name: 'C', items: { m: { id: 'm', type: 'map', meta: { title: 'M' }, rooms: [], links: [], whiteboard: [null, { id: 'a', type: 'rect', x: 0, y: 0, w: 5, h: 5 }] } } } } }, deps));
            check('import: a Replace whose play map holds a null comes in (the normaliser threw on it: nothing replaced and no word), the null dropped and the good item kept whole',
                !repro.err && !!repro.v && jl(repro.v.campaigns.c.items.m.whiteboard) === jl([{ id: 'a', type: 'rect', x: 0, y: 0, w: 5, h: 5 }]), repro.err || jl(repro.v));
            const ld = run(() => loadNorm(junkFile())), ldK = ld.v && kept(ld.v.data);
            check('load: a save whose lists hold entries that are not objects loads: a null, a number, a string or a list dropped from a map\'s rooms, its play map, a room\'s characters and a planner\'s and a page\'s blocks, a link that is not a list dropped, a room\'s characters that are not a list emptied; every good entry kept, in order',
                picParts.every(Boolean) && typeof loadWin.wpMigratePictures === 'function' && !ld.err && jl(ldK) === want, ld.err || jl(ldK));
            check('load: the repair is a change, so the load saves it once (the original kept in saves/backups) and says so', !!ld.v && ld.v.changed === true);
            const pics = ld.v && ld.v.data, cCats = pics && pics.campaigns.c.imageCats;
            check('load: the picture migration skips a key that holds no list (a planner\'s stray play map and rooms, a map\'s blocks, a room\'s characters) and still reads the good pictures: the category moves into the campaign that uses it',
                !!pics && pics._picsV === 1 && !!cCats && cCats.list.indexOf('Maps') >= 0 && pics.imageCats.list.indexOf('Maps') < 0, jl([pics && pics.imageCats, cCats]));
            const rp = run(() => cleanImport(junkFile(), { migrate: d => loadNorm(d).data, DR: DOC, sanitize, FC: FCj })), rpK = rp.v && kept(rp.v);
            check('import: the same file comes in by Replace through the load\'s normaliser with the app\'s own helpers, the same entries kept', !rp.err && jl(rpK) === want, rp.err || jl(rpK));
            const wellFormed = () => ({ _schema: 2, _picsV: 1, activeCampaignId: 'c', campaigns: { c: { id: 'c', name: 'C', activeItemId: 'm', items: {
                m: { id: 'm', type: 'map', meta: { title: 'M' }, cats: { default: { label: 'Default', color: '#ccc' } }, rooms: [{ id: 'r1', x: 1, y: 1, characters: [{ id: 'k1', name: 'Kay' }] }, { id: 'r2', x: 2, y: 2 }, { id: 'r3', x: 3, y: 3, characters: [] }],
                    links: [['r1', 'r2'], ['r2', 'r3', 'route', { label: 'L' }]], whiteboard: [{ id: 'a', type: 'rect', x: 0, y: 0, w: 5, h: 5 }] },
                p: { id: 'p', type: 'planner', meta: { title: 'P' }, blocks: [{ id: 'pb', type: 'text', content: 'hi' }] },
                d: { id: 'd', type: 'doc', meta: { title: 'D' }, blocks: [{ id: 'db', type: 'h3', title: 'T' }] } } } } });
            const wf = run(() => loadNorm(wellFormed()));
            check('load: a save that was already well formed comes through byte for byte, not marked changed (no "Save upgraded" note)', !wf.err && !!wf.v && wf.v.changed === false && jl(wf.v.data) === jl(wellFormed()), wf.err || jl(wf.v));
            // R3 (the 1.4.9 -> 1.5.0 upgrade path, 2026-10-01): a whole save from before 1.5.0 (no _schema, no per-campaign vtt set, none of the
            // 1.5.0 keys: system, chars, fog, music, videos, clock, library, uploads) loads through the real migrateAppState with a wpVtt present —
            // every old thing kept, the VTT feature set filled once per campaign, the schema stamped, nothing of 1.5.0 invented, and silently
            // (changed false: the fill and the stamp are not announced, so no backup churn and no "Save upgraded" toast on a plain older save)
            const vttCalls = [];
            const vttStub = { fill: function(c) { vttCalls.push(c.id); if (!c.vtt) { c.vtt = { v: 1, master: true, features: { sound: true, dice: true, fog: true } }; return true; } return false; } };
            const upWin = { wpSystemCore: S, wpFormula: F, wpLibraryCore: LBC, wpFogCore: FCj, wpMigratePictures: picWin.wpMigratePictures, wpVtt: vttStub };
            const upNorm = new Function('window', 'CATS', 'CURRENT_SCHEMA', 'createNewCampaign', '"use strict";\n' + ioSrc.slice(mi, mk) + '\nreturn migrateAppState;')(
                upWin, { default: { label: 'Default', color: '#ccc' } }, 2, nm => ({ id: 'camp_v0', name: nm, items: {} }));
            const old149 = () => ({ _picsV: 1, activeCampaignId: 'c', campaigns: { c: { id: 'c', name: 'Keep', activeItemId: 'm', sounds: { v: 1, master: 1, list: [{ id: 's1', name: 'Rain', path: '/saves/images/audio/c/ab_rain.ogg', kind: 'loop', gain: 1, size: 9, dur: 6 }] }, items: {
                m: { id: 'm', type: 'map', meta: { title: 'Hall', gridType: 'square' }, cats: { default: { label: 'Default', color: '#ccc' } }, rooms: [{ id: 'r1', x: 10, y: 20, characters: [{ id: 'k1', name: 'Bren', info: 'the smith' }] }], links: [['r1', 'r1', 'loop']], whiteboard: [{ id: 'a', type: 'image', src: '/saves/images/a.png', x: 0, y: 0, w: 60, h: 52 }, { id: 't', isChar: true, charName: 'Orc', x: 100, y: 100, w: 60, h: 52 }] },
                p: { id: 'p', type: 'planner', meta: { title: 'Plan' }, blocks: [{ id: 'pb', type: 'text', content: 'the raid' }] },
                d: { id: 'd', type: 'doc', meta: { title: 'Lore' }, blocks: [{ id: 'db', type: 'h3', title: 'The Fort' }] } } } } });
            vttCalls.length = 0;
            const up = run(() => upNorm(old149()));
            const upD = up.v && up.v.data, upC = upD && upD.campaigns.c;
            const newKeys = upC ? ['system', 'chars', 'fog', 'videos', 'music', 'clock', 'library', 'uploads'].filter(k => k in upC) : ['(no campaign)'];
            const oldKept = upC && jl({ sounds: upC.sounds, m: upC.items.m, p: upC.items.p, d: upC.items.d, active: upC.activeItemId }) === jl({ sounds: old149().campaigns.c.sounds, m: old149().campaigns.c.items.m, p: old149().campaigns.c.items.p, d: old149().campaigns.c.items.d, active: 'm' });
            check('R3 the 1.4.9 -> 1.5.0 upgrade (the real migrateAppState with a wpVtt present): a whole older save keeps every map, room, character-in-room, play-map item, planner, page and the sound library byte for byte; its VTT feature set is filled once per campaign (window.wpVtt.fill) and the schema is stamped to 2; no 1.5.0 key (system, chars, fog, videos, music, clock, library, uploads) is invented; and it loads silently (changed false: no backup churn, no upgrade toast for a plain older save)',
                !up.err && !!upC && jl(vttCalls) === jl(['c']) && !!upC.vtt && upC.vtt.v === 1 && !!upC.vtt.features && upD._schema === 2 && !('_schema' in old149()) && jl(newKeys) === jl([]) && oldKept && up.v.changed === false,
                up.err || jl([vttCalls, newKeys, upD && upD._schema, up.v && up.v.changed, upC && upC.vtt]));
            // and a 1.4.9 save that DID carry app-wide picture categories is a real (announced) upgrade: the categories move into the campaign and it saves once
            const oldPics = () => ({ activeCampaignId: 'c', imageCats: { list: ['Default', 'Maps'], by: { '/saves/images/a.png': ['Maps'] }, shelf: {} }, campaigns: { c: { id: 'c', name: 'Keep', activeItemId: 'm', items: {
                m: { id: 'm', type: 'map', meta: { title: 'Hall', gridType: 'square' }, cats: { default: { label: 'Default', color: '#ccc' } }, rooms: [], links: [], whiteboard: [{ id: 'a', type: 'image', src: '/saves/images/a.png', x: 0, y: 0, w: 60, h: 52 }] } } } } });
            vttCalls.length = 0;
            const upP = run(() => upNorm(oldPics())), upPD = upP.v && upP.v.data;
            check('R3: a 1.4.9 save with app-wide picture categories is a real upgrade — the Maps category moves into the campaign that uses it (once, _picsV stamped) and the load saves it, while the VTT set is still filled',
                !upP.err && !!upPD && up.v.changed !== undefined && upP.v.changed === true && upPD._picsV === 1 && jl(vttCalls) === jl(['c']) && upPD.campaigns.c.imageCats && upPD.campaigns.c.imageCats.list.indexOf('Maps') >= 0 && upPD.imageCats.list.indexOf('Maps') < 0, upP.err || jl([upP.v && upP.v.changed, upPD && upPD._picsV]));
        }
        // lighting L4: a light from a file is cleaned as the app reads one (the real fogcore.js), on Replace and on Merge
        {
            const FCr = await import(surl('fogcore.js')), depsL = { migrate, DR: DOC, sanitize, FC: FCr }, jl = JSON.stringify;
            const HT = '<img src=x onerror=alert(1)>', longName = HT + 'n'.repeat(200), ctrl = ' Torch' + String.fromCharCode(0) + String.fromCharCode(9) + 'of' + String.fromCharCode(31) + String.fromCharCode(127) + 'fire ';
            const board = () => [
                { id: 'a', type: 'light', x: 0, y: 0, light: { bright: 5000, dim: -3, off: true, unit: 'furlongs', name: longName, extra: HT, pick: true } },
                { id: 'b', type: 'circle', isChar: true, x: 0, y: 0, light: { bright: '5', dim: 'x" onfocus="y', unit: 'ft', name: 'None' } },
                { id: 'c', type: 'light', x: 0, y: 0, light: HT },
                { id: 'd', type: 'rect', x: 0, y: 0, w: 5, h: 5 },
                { id: 'e', type: 'light', x: 0, y: 0 },
                { id: 'f', type: 'circle', isChar: true, x: 0, y: 0, light: { bright: 2, dim: 6, unit: 'cells', name: ctrl, off: 'yes' } },
                { id: 'g', type: 'circle', isChar: true, x: 0, y: 0, light: null },
                { id: 'h', type: 'circle', isChar: true, x: 0, y: 0, light: { bright: 4, dim: 2, unit: 'constructor', name: 7 } },
                { id: 'i', type: 'light', x: 0, y: 0, light: { bright: 1.5, dim: 3, unit: 'm', name: 'Glow rod' } }
            ];
            const want = { a: { bright: 1000, dim: 1000, off: true, name: longName.slice(0, FCr.LIMITS.lightName) }, c: { bright: 0, dim: 0 }, f: { bright: 2, dim: 6, unit: 'cells', name: 'Torch  of  fire' }, h: { bright: 4, dim: 4 }, i: { bright: 1.5, dim: 3, unit: 'm', name: 'Glow rod' } };
            const lightsOf = wb => { const o = {}; (wb || []).forEach(w => { if ('light' in w) o[w.id] = w.light; }); return o; };
            const outL = cleanImport(JSON.parse(jl({ campaigns: { cL: { id: 'cL', name: 'L', items: { mL: { id: 'mL', type: 'map', meta: { title: 'M' }, rooms: [], links: [], whiteboard: board() } } } } })), depsL);
            const wbR = outL && outL.campaigns.cL.items.mL.whiteboard;
            const icL = { items: { mL: { id: 'mL', type: 'map', whiteboard: board() }, pL: { id: 'pL', type: 'planner', blocks: [], whiteboard: [{ id: 'z', type: 'light', light: { bright: 5000, dim: 1 } }] } } }; cleanImportItems(icL, depsL);
            const wbM = icL.items.mL.whiteboard;
            check('import: an item\'s light from a file is cleaned on Replace and on Merge — its numbers clamped (dim at least bright), a unit the app does not know dropped, its name short plain text (control characters to spaces), on or off only as true, nothing else riding along',
                !!wbR && jl(lightsOf(wbR)) === jl(want) && jl(lightsOf(wbM)) === jl(want) && want.a.name.length === 60 && wbR.length === 9 && wbM.length === 9, jl([lightsOf(wbR || []), lightsOf(wbM)]));
            check('import: a light that gives none is taken off a token and reads { bright: 0, dim: 0 } on a light source; an item that had no light gains no light key (a light source with none set stays so)',
                !!wbR && [wbR, wbM].every(wb => { const by = {}; wb.forEach(w => { by[w.id] = w; }); return !('light' in by.b) && !('light' in by.g) && jl(by.c.light) === jl({ bright: 0, dim: 0 }) && !('light' in by.d) && !('light' in by.e) && Object.keys(by.d).join() === 'id,type,x,y,w,h'; }), jl([wbR, wbM]));
            check('import: a light is only a play map\'s item\'s — a planner\'s own list is not walked', jl(icL.items.pL.whiteboard[0].light) === jl({ bright: 5000, dim: 1 }));
            const icN = { items: { mL: { id: 'mL', type: 'map', whiteboard: board() } } }; cleanImportItems(icN, { DR: DOC, sanitize });
            const icB = { items: { mL: { id: 'mL', type: 'map', whiteboard: board() } } }; cleanImportItems(icB, { DR: DOC, sanitize, FC: { LIMITS: FCr.LIMITS } });
            const icU = { items: { mL: { id: 'mL', type: 'map', whiteboard: board() } } }; cleanImportItems(icU, undefined);
            const outN = cleanImport(JSON.parse(jl({ campaigns: { cL: { id: 'cL', name: 'L', items: { mL: { id: 'mL', type: 'map', meta: { title: 'M' }, rooms: [], links: [], whiteboard: board() } } } } })), deps);
            check('import: fails closed — with no light cleaner on hand (none, or one that cleans nothing) no light comes in, not even a light source\'s empty one, on Merge and on Replace; the items themselves stay',
                jl(lightsOf(icN.items.mL.whiteboard)) === '{}' && jl(lightsOf(icB.items.mL.whiteboard)) === '{}' && jl(lightsOf(icU.items.mL.whiteboard)) === '{}' && !!outN && jl(lightsOf(outN.campaigns.cL.items.mL.whiteboard)) === '{}' && icN.items.mL.whiteboard.length === 9 && outN.campaigns.cL.items.mL.whiteboard.length === 9, jl([lightsOf(icN.items.mL.whiteboard), outN && lightsOf(outN.campaigns.cL.items.mL.whiteboard)]));
            const again = { items: { mL: { id: 'mL', type: 'map', whiteboard: JSON.parse(jl(wbM)) } } }; cleanImportItems(again, depsL);
            check('import: a light already cleaned comes through a second clean unchanged', jl(again.items.mL.whiteboard) === jl(wbM));
            // senses S2b: a token's own ranges for its senses from a file, cleaned as the app reads them (fogcore cleanTokSenses), on Replace and on Merge
            const snBoard = (withNull) => [{ id: 's1', type: 'circle', isChar: true, x: 0, y: 0, senses: [{ id: 'sn_force001', n: 1e9 }, { id: 'sn_force001', n: 3 }, { id: 'sn_BAD', n: 1 }, { id: 'sn_other001', n: -5, extra: HT }, { id: 'sn_text0001', n: '4' }] },
                { id: 's2', type: 'circle', isChar: true, x: 0, y: 0, senses: HT }, { id: 's3', type: 'circle', isChar: true, x: 0, y: 0, senses: [] }, { id: 's4', type: 'rect', x: 0, y: 0, w: 5, h: 5 }, { id: 's5', type: 'circle', isChar: true, x: 0, y: 0, senses: null }].concat(withNull ? [null] : []);
            const sensesOf = wb => { const o = {}; (wb || []).forEach(w => { if (w && 'senses' in w) o[w.id] = w.senses; }); return o; };
            const wantSn = { s1: [{ id: 'sn_force001', n: 100000 }, { id: 'sn_other001', n: 0 }] };
            const fileSn = () => JSON.parse(jl({ campaigns: { cS: { id: 'cS', name: 'S', items: { mS: { id: 'mS', type: 'map', meta: { title: 'M' }, rooms: [], links: [], whiteboard: snBoard() } } } } }));
            const outSn = cleanImport(fileSn(), depsL), wbSnR = outSn && outSn.campaigns.cS.items.mS.whiteboard;
            const icSn = { items: { mS: { id: 'mS', type: 'map', whiteboard: snBoard(true) }, pS: { id: 'pS', type: 'planner', blocks: [], whiteboard: [{ id: 'z', senses: [{ id: 'sn_force001', n: 1e9 }] }] } } }; cleanImportItems(icSn, depsL);
            const againSn = { items: { mS: { id: 'mS', type: 'map', whiteboard: JSON.parse(jl(icSn.items.mS.whiteboard)) } } }; cleanImportItems(againSn, depsL);
            check('import: a token\'s own ranges for its senses from a file are cleaned as the app reads them, on Replace and on Merge — each sense once (the first kept), its range a number clamped to 0 to 100000, a bad id dropped, nothing else riding along; a list that gives none is taken off; an item without one gains none; a planner\'s own list is not walked; cleaned once, a second clean changes nothing',
                !!wbSnR && jl(sensesOf(wbSnR)) === jl(wantSn) && jl(sensesOf(icSn.items.mS.whiteboard)) === jl(wantSn) && wbSnR.filter(Boolean).length === 5 && Object.keys(wbSnR[3]).join() === 'id,type,x,y,w,h'
                && jl(icSn.items.pS.whiteboard[0].senses) === jl([{ id: 'sn_force001', n: 1e9 }]) && jl(againSn.items.mS.whiteboard) === jl(icSn.items.mS.whiteboard), jl([sensesOf(wbSnR || []), sensesOf(icSn.items.mS.whiteboard)]));
            // senses S3: the GM's Blind tick from a file, true only, on Replace and on Merge
            const blBoard = () => [{ id: 'b1', type: 'circle', isChar: true, x: 0, y: 0, blind: true }, { id: 'b2', type: 'circle', isChar: true, x: 0, y: 0, blind: 'yes' }, { id: 'b3', type: 'circle', isChar: true, x: 0, y: 0, blind: 1 }, { id: 'b4', type: 'circle', isChar: true, x: 0, y: 0, blind: false }, { id: 'b5', type: 'rect', x: 0, y: 0, w: 5, h: 5 }];
            const blindOf = wb => { const o = {}; (wb || []).forEach(w => { if (w && 'blind' in w) o[w.id] = w.blind; }); return o; };
            const outBl = cleanImport(JSON.parse(jl({ campaigns: { cB: { id: 'cB', name: 'B', items: { mB: { id: 'mB', type: 'map', meta: { title: 'M' }, rooms: [], links: [], whiteboard: blBoard() } } } } })), depsL);
            const icBl = { items: { mB: { id: 'mB', type: 'map', whiteboard: blBoard() } } }; cleanImportItems(icBl, depsL); const icBlN = { items: { mB: { id: 'mB', type: 'map', whiteboard: blBoard() } } }; cleanImportItems(icBlN, { DR: DOC, sanitize });
            check('import: the GM\'s Blind tick on a token from a file comes in only as true, on Replace and on Merge (with or without the senses cleaner); anything else is taken off; an item without one gains none',
                !!outBl && jl(blindOf(outBl.campaigns.cB.items.mB.whiteboard)) === jl({ b1: true }) && jl(blindOf(icBl.items.mB.whiteboard)) === jl({ b1: true }) && jl(blindOf(icBlN.items.mB.whiteboard)) === jl({ b1: true }), jl([outBl && blindOf(outBl.campaigns.cB.items.mB.whiteboard), blindOf(icBl.items.mB.whiteboard), blindOf(icBlN.items.mB.whiteboard)]));
            // owner 2026-09-29: a whole file the normaliser or a cleaner cannot read brings nothing in (null: the importer's "Nothing in that file could be brought in."), never a throw
            const boom = () => { throw new Error('boom'); }, fileOk = () => JSON.parse(jl({ campaigns: { cT: { id: 'cT', name: 'T', items: { d1: { id: 'd1', type: 'doc', meta: { title: 'P' }, blocks: [{ id: 'b1', type: 'text', html: 'x' }] }, m1: { id: 'm1', type: 'map', meta: { title: 'M' }, rooms: [], links: [], whiteboard: [{ id: 'l1', type: 'light', x: 0, y: 0, w: 40, h: 40, light: { bright: 1, dim: 2 } }] } } } } }));
            const thrown = [{ migrate: boom }, Object.assign({}, depsL, { DR: { cleanDoc: boom } }), Object.assign({}, depsL, { FC: { cleanLight: boom, cleanTokSenses: boom } }), Object.assign({}, depsL, { migrate: () => { throw 'text'; } })].map(d => { let t = false, r; try { r = cleanImport(fileOk(), d); } catch (e) { t = true; } return t ? 'threw' : r; });
            check('import: a file the load\'s normaliser or a cleaner cannot read (a throw anywhere, even a thrown text) brings nothing in and never throws, so the importer says "Nothing in that file could be brought in."; a readable file still comes in',
                jl(thrown) === jl([null, null, null, null]) && !!cleanImport(fileOk(), depsL) && /if \(!cleanR\) \{ importNothing\(\); return; \}/.test(mainSrc) && /if \(!cleanL \|\| !Object\.prototype\.hasOwnProperty\.call\(cleanL\.campaigns, defaultCamp\.id\)\) \{ importNothing\(\); return; \}/.test(mainSrc), jl(thrown));
            // senses S4a: a file's map never brings a player's own notes (fogMarks, fogOff, fogLit, lightsCapped); a token's unsensed comes in cleaned
            const s4Map = () => ({ id: 'mK', type: 'map', meta: { title: 'M' }, rooms: [], links: [], fogMarks: [{ c: 1, r: 1, k: 1 }], fogOff: { t1: ['sn_aaaaaaaa'] }, fogLit: [{ c: 1, r: 1, t: 2 }], lightsCapped: true,
                whiteboard: [{ id: 'u1', type: 'circle', isChar: true, x: 0, y: 0, unsensed: true }, { id: 'u2', type: 'circle', isChar: true, x: 0, y: 0, unsensed: ['sn_aaaaaaaa', 'bad', 'sn_aaaaaaaa'] }, { id: 'u3', type: 'circle', isChar: true, x: 0, y: 0, unsensed: 'yes' }] });
            const outK = cleanImport(JSON.parse(jl({ campaigns: { cK: { id: 'cK', name: 'K', items: { mK: s4Map() } } } })), depsL), icK = { items: { mK: s4Map() } }; cleanImportItems(icK, depsL); const icKN = { items: { mK: s4Map() } }; cleanImportItems(icKN, { DR: DOC, sanitize });
            const s4Of = m => [['fogMarks', 'fogOff', 'fogLit', 'lightsCapped'].filter(k => k in m), m.whiteboard.map(w => ('unsensed' in w ? w.unsensed : 'none'))];
            check('import: a file\'s map never brings a player\'s own notes on their copy (marks, switched-off senses, lit cells, the light cap), on Replace and on Merge; a token\'s ticks of senses that never mark it come in cleaned (true, or sense ids each once), none without the cleaner',
                !!outK && jl(s4Of(outK.campaigns.cK.items.mK)) === jl([[], [true, ['sn_aaaaaaaa'], 'none']]) && jl(s4Of(icK.items.mK)) === jl([[], [true, ['sn_aaaaaaaa'], 'none']]) && jl(s4Of(icKN.items.mK)) === jl([[], ['none', 'none', 'none']]), jl([outK && s4Of(outK.campaigns.cK.items.mK), s4Of(icK.items.mK), s4Of(icKN.items.mK)]));
            const s7Map = () => ({ id: 'mN', type: 'map', meta: { title: 'N' }, rooms: [], links: [], whiteboard: [{ id: 'z1', type: 'rect', x: 0, y: 0, w: 50, h: 50, nulls: ['sn_aaaaaaaa', 'bad', 'sn_aaaaaaaa'] }, { id: 'z2', type: 'rect', x: 0, y: 0, w: 50, h: 50, nulls: 'x' }, { id: 'z3', type: 'rect', x: 0, y: 0, w: 50, h: 50, hidden: true, nulls: true }] });
            const outNul = cleanImport(JSON.parse(jl({ campaigns: { cN: { id: 'cN', name: 'N', items: { mN: s7Map() } } } })), depsL), icNul = { items: { mN: s7Map() } }; cleanImportItems(icNul, depsL); const icNulN = { items: { mN: s7Map() } }; cleanImportItems(icNulN, { DR: DOC, sanitize });
            const s7Of = m => m.whiteboard.map(w => ('nulls' in w ? w.nulls : 'none'));
            check('import: a null area\'s senses (S7a) come in cleaned — sense ids by pattern, each once — on Replace and on Merge; anything else none, and none without the cleaner; the areas themselves stay',
                !!outNul && jl(s7Of(outNul.campaigns.cN.items.mN)) === jl([['sn_aaaaaaaa'], 'none', 'none']) && jl(s7Of(icNul.items.mN)) === jl([['sn_aaaaaaaa'], 'none', 'none']) && jl(s7Of(icNulN.items.mN)) === jl(['none', 'none', 'none']) && icNulN.items.mN.whiteboard.length === 3, jl([outNul && s7Of(outNul.campaigns.cN.items.mN), s7Of(icNul.items.mN), s7Of(icNulN.items.mN)]));
            const trMap = () => ({ id: 'mT', type: 'map', meta: { title: 'T' }, rooms: [], links: [], whiteboard: [{ id: 't1', type: 'rect', x: 0, y: 0, w: 50, h: 50, terrain: 3 }, { id: 't2', type: 'hexagon', x: 0, y: 0, w: 60, h: 52, fill: true, terrain: 2.6 }, { id: 't3', type: 'rect', x: 0, y: 0, w: 50, h: 50, terrain: 40 },
                { id: 't4', type: 'rect', x: 0, y: 0, w: 50, h: 50, terrain: '3' }, { id: 't5', type: 'circle', x: 0, y: 0, w: 50, h: 50, terrain: 1 }, { id: 't6', type: 'rect', x: 0, y: 0, w: 50, h: 50, terrain: { cost: 3 } }, { id: 't7', type: 'rect', x: 0, y: 0, w: 50, h: 50 }] });
            const outTr = cleanImport(JSON.parse(jl({ campaigns: { cT: { id: 'cT', name: 'T', items: { mT: trMap() } } } })), depsL), icTr = { items: { mT: trMap() } }; cleanImportItems(icTr, depsL); const icTrN = { items: { mT: trMap() } }; cleanImportItems(icTrN, { DR: DOC, sanitize });
            const trOf = m => m.whiteboard.map(w => ('terrain' in w ? w.terrain : 'none'));
            check('import: a piece\'s difficult terrain (T1) comes in as its cost, a whole number 2 to 10 (40 reads 10), on Replace and on Merge; a word, 1 or an object none; none without the cleaner; the pieces themselves stay',
                !!outTr && jl(trOf(outTr.campaigns.cT.items.mT)) === jl([3, 3, 10, 'none', 'none', 'none', 'none']) && jl(trOf(icTr.items.mT)) === jl([3, 3, 10, 'none', 'none', 'none', 'none']) && jl(trOf(icTrN.items.mT)) === jl(['none', 'none', 'none', 'none', 'none', 'none', 'none']) && icTrN.items.mT.whiteboard.length === 7, jl([outTr && trOf(outTr.campaigns.cT.items.mT), trOf(icTr.items.mT), trOf(icTrN.items.mT)]));
            const htMap = () => ({ id: 'mH', type: 'map', meta: { title: 'H' }, rooms: [], links: [], whiteboard: [{ id: 'h1', type: 'rect', x: 0, y: 0, w: 50, h: 50, height: 2 }, { id: 'h2', type: 'path', x: 0, y: 0, w: 50, h: 50, pts: [[0, 0], [1, 1]], height: 2.345 }, { id: 'h3', type: 'rect', x: 0, y: 0, w: 50, h: 50, height: 1e9 },
                { id: 'h4', type: 'rect', x: 0, y: 0, w: 50, h: 50, height: '3' }, { id: 'h5', type: 'image', x: 0, y: 0, w: 50, h: 50, height: -1 }, { id: 'h6', type: 'rect', x: 0, y: 0, w: 50, h: 50, height: { v: 2 } }, { id: 'h7', type: 'rect', x: 0, y: 0, w: 50, h: 50 }] });
            const outHt = cleanImport(JSON.parse(jl({ campaigns: { cH: { id: 'cH', name: 'H', items: { mH: htMap() } } } })), depsL), icHt = { items: { mH: htMap() } }; cleanImportItems(icHt, depsL); const icHtN = { items: { mH: htMap() } }; cleanImportItems(icHtN, { DR: DOC, sanitize });
            const htOf = m => m.whiteboard.map(w => ('height' in w ? w.height : 'none'));
            check('import: a piece\'s height (item 19 H1) comes in as yards above 0 to the hundredth, at most 10,000, on Replace and on Merge; text, a number not above 0 or an object none; none without the cleaner; the pieces themselves stay',
                !!outHt && jl(htOf(outHt.campaigns.cH.items.mH)) === jl([2, 2.35, 10000, 'none', 'none', 'none', 'none']) && jl(htOf(icHt.items.mH)) === jl([2, 2.35, 10000, 'none', 'none', 'none', 'none']) && jl(htOf(icHtN.items.mH)) === jl(Array(7).fill('none')) && icHtN.items.mH.whiteboard.length === 7, jl([outHt && htOf(outHt.campaigns.cH.items.mH), htOf(icHt.items.mH), htOf(icHtN.items.mH)]));
            const grMap = () => ({ id: 'mG5', type: 'map', meta: { title: 'G' }, rooms: [], links: [], whiteboard: [{ id: 'g1', type: 'rect', x: 0, y: 0, w: 50, h: 50, ground: 3 }, { id: 'g2', type: 'path', tip: 'fill', x: 0, y: 0, w: 50, h: 50, pts: [[0, 0], [1, 1], [0, 1]], ground: -2.346 }, { id: 'g3', type: 'image', x: 0, y: 0, w: 50, h: 50, ground: 1e9 },
                { id: 'g4', type: 'rect', x: 0, y: 0, w: 50, h: 50, ground: '3' }, { id: 'g5', type: 'circle', x: 0, y: 0, w: 50, h: 50, ground: 0 }, { id: 'g6', type: 'rect', x: 0, y: 0, w: 50, h: 50, ground: { v: 2 } }, { id: 'g7', type: 'rect', x: 0, y: 0, w: 50, h: 50 }, { id: 'g8', type: 'rect', x: 0, y: 0, w: 50, h: 50, hidden: true, ground: -1e9 }] });
            const outGr = cleanImport(JSON.parse(jl({ campaigns: { cG5: { id: 'cG5', name: 'G', items: { mG5: grMap() } } } })), depsL), icGr = { items: { mG5: grMap() } }; cleanImportItems(icGr, depsL); const icGrN = { items: { mG5: grMap() } }; cleanImportItems(icGrN, { DR: DOC, sanitize });
            const grOf = m => m.whiteboard.map(w => ('ground' in w ? w.ground : 'none'));
            check('import: a piece\'s ground height (item 19b H5) comes in as yards from -1000 to 1000 to the hundredth, below 0 for a pit, on Replace and on Merge, a hidden piece\'s too; text, 0 or an object none; none without the cleaner; the pieces themselves stay',
                !!outGr && jl(grOf(outGr.campaigns.cG5.items.mG5)) === jl([3, -2.35, 1000, 'none', 'none', 'none', 'none', -1000]) && jl(grOf(icGr.items.mG5)) === jl([3, -2.35, 1000, 'none', 'none', 'none', 'none', -1000]) && jl(grOf(icGrN.items.mG5)) === jl(Array(8).fill('none')) && icGrN.items.mG5.whiteboard.length === 8, jl([outGr && grOf(outGr.campaigns.cG5.items.mG5), grOf(icGr.items.mG5), grOf(icGrN.items.mG5)]));
            const fbMap = () => ({ id: 'mF', type: 'map', meta: { title: 'F' }, rooms: [], links: [], whiteboard: [{ id: 'q1', type: 'image', isChar: true, charId: 'c_x', x: 0, y: 0, w: 50, h: 50, fxb: [{ n: 'Forged', i: 'icon:bolt', t: 'buff' }] }, { id: 'q2', type: 'rect', x: 0, y: 0, w: 50, h: 50, fxb: 'x' }] });
            const outFb = cleanImport(JSON.parse(jl({ campaigns: { cF: { id: 'cF', name: 'F', items: { mF: fbMap() } } } })), depsL), icFb = { items: { mF: fbMap() } }; cleanImportItems(icFb, depsL); const icFbN = { items: { mF: fbMap() } }; cleanImportItems(icFbN, { DR: DOC, sanitize });
            check('import: a token\'s effects as a table sees them (conditions C1, fxb) never come in from a file, on Replace and on Merge, with or without the cleaner — a host works them out; the pieces themselves stay',
                !!outFb && ![outFb.campaigns.cF.items.mF, icFb.items.mF, icFbN.items.mF].some(m => m.whiteboard.some(w => 'fxb' in w)) && icFbN.items.mF.whiteboard.length === 2, jl([outFb && outFb.campaigns.cF.items.mF.whiteboard, icFbN.items.mF.whiteboard]));
            const tfMap = () => ({ id: 'mG', type: 'map', meta: { title: 'G' }, rooms: [], links: [], whiteboard: [{ id: 'g1', type: 'image', isChar: true, x: 0, y: 0, w: 50, h: 50, fx: [{ id: 'x_1', ref: 'e_a' }, { id: 'x_1', ref: 'e_b' }, { id: 'bad', name: 'N' }, { id: 'x_2', name: 'Hexed', tone: 'evil' }] }, { id: 'g2', type: 'image', isChar: true, x: 0, y: 0, w: 50, h: 50, fx: 'x' }] });
            const outTf = cleanImport(JSON.parse(jl({ campaigns: { cG: { id: 'cG', name: 'G', items: { mG: tfMap() } } } })), depsL), icTf = { items: { mG: tfMap() } }; cleanImportItems(icTf, depsL); const icTfN = { items: { mG: tfMap() } }; cleanImportItems(icTfN, { DR: DOC, sanitize });
            const tfOf = m => m.whiteboard.map(w => ('fx' in w ? w.fx : 'none'));
            check('import: a token\'s own effects (conditions C2) come in cleaned — rows by id once, a library effect by its id, one made on the spot with a plain name and a tone of the two words — on Replace and on Merge; anything else none, and none without the cleaner',
                !!outTf && jl(tfOf(outTf.campaigns.cG.items.mG)) === jl([[{ id: 'x_1', ref: 'e_a' }, { id: 'x_2', name: 'Hexed', icon: '', tone: '' }], 'none']) && jl(tfOf(icTf.items.mG)) === jl(tfOf(outTf.campaigns.cG.items.mG)) && jl(tfOf(icTfN.items.mG)) === jl(['none', 'none']), jl([outTf && tfOf(outTf.campaigns.cG.items.mG), tfOf(icTfN.items.mG)]));
            const smMap = () => ({ id: 'mM', type: 'map', meta: { title: 'M' }, rooms: [], links: [], whiteboard: [{ id: 'k1', type: 'rect', x: 0, y: 0, w: 50, h: 50, smoke: true }, { id: 'k2', type: 'rect', x: 0, y: 0, w: 50, h: 50, smoke: 'yes' }, { id: 'k3', type: 'circle', x: 0, y: 0, w: 50, h: 50, smoke: { on: true } }, { id: 'k4', type: 'rect', x: 0, y: 0, w: 50, h: 50, smoke: 1 }, { id: 'k5', type: 'rect', x: 0, y: 0, w: 50, h: 50 }] });
            const outSm = cleanImport(JSON.parse(jl({ campaigns: { cM: { id: 'cM', name: 'M', items: { mM: smMap() } } } })), depsL), icSm = { items: { mM: smMap() } }; cleanImportItems(icSm, depsL); const icSmN = { items: { mM: smMap() } }; cleanImportItems(icSmN, { DR: DOC, sanitize });
            const smOf = m => m.whiteboard.map(w => ('smoke' in w ? w.smoke : 'none'));
            check('import: a piece\'s smoke (S7b) comes in only as true, on Replace and on Merge, with or without the cleaner; anything else none; the pieces themselves stay',
                !!outSm && jl(smOf(outSm.campaigns.cM.items.mM)) === jl([true, 'none', 'none', 'none', 'none']) && jl(smOf(icSm.items.mM)) === jl([true, 'none', 'none', 'none', 'none']) && jl(smOf(icSmN.items.mM)) === jl([true, 'none', 'none', 'none', 'none']) && icSmN.items.mM.whiteboard.length === 5, jl([outSm && smOf(outSm.campaigns.cM.items.mM), smOf(icSm.items.mM), smOf(icSmN.items.mM)]));
            const icSnN = { items: { mS: { id: 'mS', type: 'map', whiteboard: snBoard(true) } } }; cleanImportItems(icSnN, { DR: DOC, sanitize, FC: { LIMITS: FCr.LIMITS, cleanLight: FCr.cleanLight } });
            const icSnU = { items: { mS: { id: 'mS', type: 'map', whiteboard: snBoard() } } }; cleanImportItems(icSnU, { DR: DOC, sanitize });
            const outSnN = cleanImport(fileSn(), deps);
            check('import: fails closed — with no senses cleaner on hand (none, or a fogcore without one) no token\'s ranges come in, on Merge and on Replace; the items themselves stay',
                jl(sensesOf(icSnN.items.mS.whiteboard)) === '{}' && jl(sensesOf(icSnU.items.mS.whiteboard)) === '{}' && !!outSnN && jl(sensesOf(outSnN.campaigns.cS.items.mS.whiteboard)) === '{}' && icSnN.items.mS.whiteboard.filter(Boolean).length === 5 && outSnN.campaigns.cS.items.mS.whiteboard.filter(Boolean).length === 5,
                jl([sensesOf(icSnN.items.mS.whiteboard), outSnN && sensesOf(outSnN.campaigns.cS.items.mS.whiteboard)]));
        }
        // the app routes every whole-file import through it, before the state is replaced or the modal is even closed
        const repl = mainSrc.slice(mainSrc.indexOf("_el_importReplaceBtn.addEventListener('click'"), mainSrc.indexOf('var _el_importCancelBtn'));
        const legacy = mainSrc.slice(mainSrc.indexOf('// Legacy single-campaign format'), mainSrc.indexOf('} else if (data.campaigns) {'));
        check('import (main.js): Replace cleans first (cleanImport with the app\'s real normaliser, docrender and the wire\'s sanitiser) and only then may replace the state; the raw file never becomes the state',
            /var cleanR = cleanImport\(pendingImport, importDeps\(\)\);[\s\S]*if \(!cleanR\) \{ importNothing\(\); return; \}[\s\S]*var guard = [\s\S]*state\.appState = cleanR;/.test(repl) && !/state\.appState = pendingImport/.test(mainSrc)
            && /function importDeps\(\) \{ return \{ migrate: function\(d\) \{ return migrateAppState\(d\)\.data; \}, DR: window\.wpDocRender, sanitize: window\.wpNet && window\.wpNet\.sanitizeRichText, FC: window\.wpFogCore \}; \}/.test(mainSrc) && /\n    migrateAppState   \/\/ main\.js/.test(ioSrc));
        check('import (main.js): a legacy single-campaign file is wrapped and cleaned the same way before it joins the campaigns; Merge cleans its items with the same cleaner',
            /var cleanL = cleanImport\(wrapL, importDeps\(\)\);[\s\S]*var guardL = [\s\S]*state\.appState\.campaigns\[defaultCamp\.id\] = cleanL\.campaigns\[defaultCamp\.id\];/.test(legacy) && !/state\.appState\.campaigns\[defaultCamp\.id\] = defaultCamp;/.test(legacy)
            && /function cleanImportedItems\(ic\) \{ cleanImportItems\(ic, importDeps\(\)\); \}/.test(mainSrc) && /cleanImportedItems\(ic\);/.test(mainSrc));
        // a table key from a file proves nothing (the security pass of 2026-10-01): an imported campaign's players come in without their keys, on
        // Replace (cleanImport, after the load's normaliser) and on Merge (cleanImportItems, which main.js runs on each campaign before it is kept),
        // so whoever wrote the file is asked at the GM's table like anyone new — the host's own gate line, sliced from net.js, says so; the file's
        // bans stay (they can only refuse). A record that is no object goes; players that are no object go
        {
            const playersIn = () => ({ u_a: { name: 'Pat', key: 'k_file', charName: 'Hero', firstSeen: 1 }, u_b: 'junk', u_c: { key: 'k_only' } });
            const playersOut = JSON.stringify({ u_a: { name: 'Pat', charName: 'Hero', firstSeen: 1 }, u_c: {} });
            const outKy = cleanImport({ campaigns: { cX: { id: 'cX', name: 'X', items: {}, players: playersIn(), bannedPlayers: { u_z: { name: 'Z', bannedAt: 1 } } } } }, deps);
            const icKy = { items: {}, players: playersIn() }; cleanImportItems(icKy, deps);
            const icKn = { players: playersIn() }; cleanImportItems(icKn, {});   // a campaign with no items yet: the keys go before anything returns early
            const icKs = { items: {}, players: 'junk' }; cleanImportItems(icKs, deps);
            // the host's gate (net.js, since the key became a proof): a hello's raw key is compared with nothing — a known record with a key is challenged (keyed0) and the
            // proof is judged over the host's own room, so a key a file carried could admit nobody even if it stayed; it goes all the same, so the file's author is simply new
            const gateSrc = (/var rec0 = [^\n]+\n\s*var keyed0 = [^\n]+/.exec(netSrc) || [''])[0];
            const gateOk = gateSrc.length > 80 && /typeof rec0\.key === 'string'/.test(gateSrc) && !/msg\.key === rec0\.key/.test(netSrc) && !/rec0\.key === msg\.key/.test(netSrc);
            const mergeSrc = mainSrc.slice(mainSrc.indexOf('  function mergeAppState(imported) {'), mainSrc.indexOf('var _el_importMergeBtn'));
            check('import: a table key from a file proves nothing — an imported campaign\'s players keep their names, bindings and history but no key, on Replace and on Merge (with or without items), and the host\'s own gate (net.js) compares no raw key at all — a known record with a key is challenged for a proof over the host\'s own room, so a hello carrying the file\'s key goes to the GM\'s Allow/Deny; the file\'s bans stay; Merge cleans each campaign before it is kept',
                !!outKy && JSON.stringify(outKy.campaigns.cX.players) === playersOut && JSON.stringify(outKy.campaigns.cX.bannedPlayers) === JSON.stringify({ u_z: { name: 'Z', bannedAt: 1 } })
                && JSON.stringify(icKy.players) === playersOut && JSON.stringify(icKn.players) === playersOut && !('players' in icKs)
                && gateOk
                && /cleanImportedItems\(ic\);[\s\S]*?if \(!existing\) \{[\s\S]*?state\.appState\.campaigns\[ic\.id\] = ic;/.test(mergeSrc) && mergeSrc.indexOf('cleanImportedItems(ic);') < mergeSrc.indexOf('state.appState.campaigns[ic.id] = ic;'),
                JSON.stringify([outKy && outKy.campaigns.cX.players, icKy.players, icKn.players, icKs.players, gateSrc.length]));
        }
        // the dev console's reload: never under a table, the GM's or someone else's
        const ri = ioSrc.indexOf('window.wpReloadFromDisk = function() {'), rk = ioSrc.indexOf('\n};', ri);
        const reload = (n) => { const calls = { load: 0, cleared: 0, toasts: [] }; const w = { wpNet: n };
            new Function('window', 'toast', 'load', 'clearTimeout', 'saveTimeout', ioSrc.slice(ri, rk + 3))(w, m => calls.toasts.push(m), () => { calls.load++; }, () => { calls.cleared++; }, 1);
            calls.ret = w.wpReloadFromDisk(); return calls; };
        const rHost = reload({ active: true, role: 'host' }), rClient = reload({ active: true, role: 'client' }), rOff = reload({ active: false, role: null }), rNone = reload(undefined);
        check('reload from disk: refused while hosting (the load\'s normaliser and cleanup never run under the live table) and while joined; allowed otherwise',
            ri > 0 && rHost.load === 0 && rHost.ret === false && /hosting/.test(rHost.toasts[0] || '') && rClient.load === 0 && rClient.ret === false && rOff.load === 1 && rOff.cleared === 1 && rOff.ret === true && rNone.load === 1, JSON.stringify([rHost, rClient, rOff]));
        // lighting L5: the GM's undo while hosting (io.js mergeLivePlayerState, sliced and run strict) — a player's own light stays as it is live, its lock follows the snapshot
        {
            const gi = ioSrc.indexOf('  function mergeLivePlayerState(snapC, live) {'), gk = ioSrc.indexOf('  // Where the planner was being looked at', gi);
            const jm = JSON.stringify, cp = o => JSON.parse(jm(o));
            let merge = null, mergeErr = '';
            try { if (gi > 0 && gk > gi) merge = new Function('"use strict";\n' + ioSrc.slice(gi, gk) + '\nreturn mergeLivePlayerState;')(); } catch (e) { mergeErr = e.message; }
            check('undo merge: the host\'s merge is found in io.js and runs on its own, strict, with nothing of the page on hand', typeof merge === 'function', mergeErr || jm([gi, gk]));
            if (typeof merge === 'function') {
                const torch = { bright: 4, dim: 8, unit: 'cells', name: 'Torch' }, lamp = { bright: 2, dim: 4, unit: 'ft', name: 'Lamp' }, glow = { bright: 1, dim: 2, name: 'Glow' };
                const tok = (id, more) => Object.assign({ id: id, type: 'circle', isChar: true, charId: 'c_' + id, charName: 'N' + id, x: 1, y: 2, rot: 0 }, more);
                // what the map held when the snapshot was taken
                const snapBoard = [
                    tok('lit', { ownerId: 'u_a' }),                                               // lit since the snapshot
                    tok('out', { ownerId: 'u_a', light: cp(torch) }),                              // put out since
                    tok('gone', { ownerId: 'u_b', light: cp(torch) }),                             // its light taken off since
                    tok('swap', { ownerId: 'u_b', light: cp(torch) }),                             // another light picked since
                    tok('same', { ownerId: 'u_b', light: cp(lamp), lightLock: true }),             // untouched, locked in the snapshot
                    tok('npc', { light: cp(lamp) }),                                               // nobody's: the GM's own
                    tok('npcOff', {}),                                                             // nobody's, no light in the snapshot
                    tok('demoted', { ownerId: 'u_c', light: cp(lamp) }),                           // owned then, nobody's now
                    tok('locked', { ownerId: 'u_a', light: cp(lamp), lightLock: true }),           // locked in the snapshot, unlocked since
                    tok('freed', { ownerId: 'u_a', light: cp(lamp) }),                             // free in the snapshot, locked since
                    tok('moved', { ownerId: 'u_d', x: 10, y: 20, rot: 90, front: 1, elevation: 15, posture: 'prone', hidden: true, name: 'Snapshot name', w: 50 }),
                    { id: 'lamp', type: 'light', x: 5, y: 5, light: cp(lamp) },                     // a placed light source
                    { id: 'erased', type: 'path', byPlayer: 'u_a', ownerId: 'u_a', pts: [1, 2] },   // a player erased it since
                    { id: 'gmPath', type: 'path', pts: [3, 4] },                                    // the GM deleted it since
                    { id: 'stroke', type: 'path', byPlayer: 'u_a', ownerId: 'u_a', pts: [5, 6], color: '#111111' }
                ];
                const liveBoard = [
                    tok('lit', { ownerId: 'u_a', light: cp(torch) }),
                    tok('out', { ownerId: 'u_a', light: Object.assign(cp(torch), { off: true }) }),
                    tok('gone', { ownerId: 'u_b' }),
                    tok('swap', { ownerId: 'u_b', light: cp(glow) }),
                    tok('same', { ownerId: 'u_b', light: cp(lamp), lightLock: true }),
                    tok('npc', { light: cp(torch) }),
                    tok('npcOff', { light: cp(torch) }),
                    tok('demoted', { light: cp(torch) }),
                    tok('locked', { ownerId: 'u_a', light: cp(lamp) }),
                    tok('freed', { ownerId: 'u_a', light: cp(lamp), lightLock: true }),
                    tok('moved', { ownerId: 'u_d', x: 77, y: 88, rot: 180, posture: 'crouched', name: 'Live name', w: 99 }),
                    { id: 'lamp', type: 'light', x: 5, y: 5, light: Object.assign(cp(glow), { off: true }) },
                    { id: 'stroke', type: 'path', byPlayer: 'u_a', ownerId: 'u_a', pts: [5, 6, 7, 8], color: '#222222' },
                    tok('newcomer', { ownerId: 'u_e', light: cp(glow), lightLock: true })
                ];
                const live = { id: 'm', type: 'map', whiteboard: liveBoard }, liveWas = jm(live);
                const snapC = { whiteboard: cp(snapBoard), rooms: [] };
                let threw = '';
                try { merge(snapC, live); } catch (e) { threw = e.message; }
                const by = {}; (Array.isArray(snapC.whiteboard) ? snapC.whiteboard : []).forEach(w => { if (w && w.id) by[w.id] = w; });
                const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
                check('undo merge: runs through a map of owned and unowned tokens, light sources and strokes, and leaves the live map exactly as it was', threw === '' && jm(live) === liveWas && Array.isArray(snapC.whiteboard), threw || jm(snapC.whiteboard));
                check('undo merge: a light a player lit since the snapshot stays lit', jm(by.lit && by.lit.light) === jm(torch), jm(by.lit));
                check('undo merge: a light a player put out since the snapshot stays out', jm(by.out && by.out.light) === jm(Object.assign(cp(torch), { off: true })) && !!by.out && by.out.light.off === true, jm(by.out));
                check('undo merge: a player\'s token with no light live ends with none, though the snapshot held one', !!by.gone && !has(by.gone, 'light') && by.gone.ownerId === 'u_b', jm(by.gone));
                check('undo merge: a player\'s token keeps the light picked since the snapshot, whole — nothing of the snapshot\'s light mixed in', jm(by.swap && by.swap.light) === jm(glow) && !!by.swap && !has(by.swap.light, 'unit'), jm(by.swap));
                check('undo merge: a player\'s light nobody touched comes through unchanged', jm(by.same && by.same.light) === jm(lamp), jm(by.same));
                const owned = ['lit', 'out', 'swap', 'same', 'locked', 'freed'];
                const apart = owned.every(id => { const lv = liveBoard.find(w => w.id === id); return !!by[id] && !!by[id].light && by[id].light !== lv.light; });
                const before = jm(liveBoard);
                owned.forEach(id => { if (by[id] && by[id].light) { by[id].light.bright = 999; by[id].light.name = 'changed'; by[id].light.off = true; } });
                check('undo merge: the kept light is a copy — changing the merged light afterwards never changes the live token\'s', apart && jm(liveBoard) === before && liveBoard[0].light.bright === 4, jm([apart, liveBoard[0]]));
                check('undo merge: a token with no owner takes the snapshot\'s light — the one it held, or none', jm(by.npc && by.npc.light) === jm(lamp) && !!by.npcOff && !has(by.npcOff, 'light') && !has(by.npc, 'ownerId'), jm([by.npc, by.npcOff]));
                check('undo merge: a token that is nobody\'s live, though owned in the snapshot, takes the snapshot\'s light and no owner', jm(by.demoted && by.demoted.light) === jm(lamp) && !!by.demoted && !has(by.demoted, 'ownerId'), jm(by.demoted));
                check('undo merge: a placed light source takes the snapshot\'s light', jm(by.lamp && by.lamp.light) === jm(lamp), jm(by.lamp));
                check('undo merge: the lock on a player\'s light follows the snapshot — one locked then stays locked, one locked since is free again', !!by.locked && by.locked.lightLock === true && !!by.same && by.same.lightLock === true && !!by.freed && !has(by.freed, 'lightLock') && !!by.lit && !has(by.lit, 'lightLock'), jm([by.locked, by.same, by.freed, by.lit]));
                const mv = by.moved || {};
                check('undo merge: a player\'s token keeps its live place, turn and posture (a key it lacks live is dropped), while what is the GM\'s — hidden, the name, the size — follows the snapshot',
                    mv.x === 77 && mv.y === 88 && mv.rot === 180 && mv.posture === 'crouched' && !has(mv, 'front') && !has(mv, 'elevation') && mv.hidden === true && mv.name === 'Snapshot name' && mv.w === 50 && mv.ownerId === 'u_d' && !has(mv, 'light'), jm(mv));
                check('undo merge: a token with no owner takes the snapshot\'s place as well', !!by.npc && by.npc.x === 1 && by.npc.y === 2, jm(by.npc));
                check('undo merge: a stroke a player erased stays erased, one the GM deleted comes back, and a player\'s stroke stays as they have it now', !by.erased && jm(by.gmPath) === jm(snapBoard[13]) && jm(by.stroke) === jm(liveBoard[12]) && by.stroke !== liveBoard[12], jm([by.erased, by.gmPath, by.stroke]));
                check('undo merge: a player\'s token that arrived since the snapshot stays, with its light and lock as they are live, as a copy', jm(by.newcomer) === jm(liveBoard[13]) && by.newcomer !== liveBoard[13] && snapC.whiteboard.length === 15, jm([by.newcomer, snapC.whiteboard.length]));
                check('undo merge: every item comes through once, in the snapshot\'s order', jm(snapC.whiteboard.map(w => w.id)) === jm(['lit', 'out', 'gone', 'swap', 'same', 'npc', 'npcOff', 'demoted', 'locked', 'freed', 'moved', 'lamp', 'gmPath', 'newcomer', 'stroke']), jm(snapC.whiteboard.map(w => w.id)));
                // a second undo over the merged result changes nothing more (the live map is what the first left)
                const live2 = { id: 'm', type: 'map', whiteboard: cp(liveBoard) }, snap2 = { whiteboard: cp(snapBoard) }, snap3 = { whiteboard: cp(snapBoard) };
                merge(snap2, live2); merge(snap3, { id: 'm', type: 'map', whiteboard: cp(snap2.whiteboard) });
                check('undo merge: merging the same snapshot over its own result changes nothing more', jm(snap3.whiteboard) === jm(snap2.whiteboard), jm([snap2.whiteboard, snap3.whiteboard]));
            }
            // where it is called: the host only, a map only, before the snapshot is applied
            const ui = ioSrc.indexOf('var parsed = JSON.parse(snap);'), ua = ioSrc.indexOf('applyContent(item, parsed);', ui), undoSrc = ui > 0 && ua > ui ? ioSrc.slice(ui, ua) : '';
            check('undo merge: called for a map only while hosting, on the snapshot before it is applied, and nowhere else',
                /var hosting = !!\(window\.wpNet && window\.wpNet\.active && window\.wpNet\.role === 'host'\);\n\s*if \(hosting && item\.type === 'map'\) mergeLivePlayerState\(parsed\.c, item\);/.test(undoSrc) && (ioSrc.match(/mergeLivePlayerState\(/g) || []).length === 2, jm([ui, ua, (ioSrc.match(/mergeLivePlayerState\(/g) || []).length]));
        }
    }

    // the owner's real save, read-only, counts only
    const real = path.join(__dirname, '..', 'saves', 'data.json');
    if (fs.existsSync(real)) {
        try {
            const d = JSON.parse(fs.readFileSync(real, 'utf8'));
            const rc = classifyState(d, UNKNOWN);
            const n = Object.keys(rc.tiers).length;
            check('saves/data.json classifies OWN throughout (' + n + ' campaign(s): own=' + rc.counts.own + ' certain=' + rc.counts.certain + ' ask=' + rc.counts.ask + ', whole=' + rc.whole + ')', n > 0 && rc.counts.certain === 0 && rc.counts.ask === 0);
        } catch (e) { check('saves/data.json parses', false, e.message); }
    } else console.log('skip      saves/data.json not present');

    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
