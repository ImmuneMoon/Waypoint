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
        delete camp.pinnedPages;
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
    return { activeCampaignId: 'camp_a', _schema: 2, imageCats: { scenes: { label: 'Scenes' } }, campaigns: { camp_a: gmCampaign('camp_a', 'Tide'), camp_b: gmCampaign('camp_b', 'Spire'), camp_tutorial: tutorialCampaign() } };
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
    const { classifyState, fileVerdict, pickRecovery, inspectCampaign, removeCampaign, unmovePlanners, runSweep, cleanImport, cleanImportItems, cleanWas, dropWaiting } = await import(url);
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
        tier([{ id: 'w_o', qty: 1, own: 1, def: { name: 'Tarot', key: 'Tarot', stats: { Acc: 1 } } }]) === 'CERTAIN' && tier([{ id: 'w_o', qty: 1, own: 1, def: { name: 'P', damage: '1d6' } }]) === 'ASK' && tier([{ id: 'w_g', qty: 1, def: { name: 'G', vis: 'gm', key: 'Gk' } }]) === 'ASK');
      check('155: a GM-only row of the character\'s own keeps its description and levels from its player, so they are a local mark (ASK); a visible row of its own and an inline copy travel with theirs (still CERTAIN)',
        tier([{ id: 'w_g', qty: 1, def: { name: 'G', vis: 'gm', desc: 'words' } }]) === 'ASK' && tier([{ id: 'w_g', qty: 1, def: { name: 'G', vis: 'gm', lvls: [{ lvl: 1, text: 'a' }] } }]) === 'ASK'
        && tier([{ id: 'w_o', qty: 1, own: 1, def: { name: 'O', desc: 'words', lvls: [{ lvl: 1, text: 'a' }] } }, { id: 'w_i', qty: 1, lnk: 1, def: { name: 'R', vis: 'gm', desc: 'kept?' } }]) === 'CERTAIN'); }

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
        ["/saves/images/c1/Bor'Thain — token (v2).png", "/saves/images/c1/Bor'Thain%20%E2%80%94%20token%20(v2).png", "/saves/images/c1/Bor'Thain — token (v2).png"],
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
        const exF = pathsOf({ campaigns: { c: { items: { m: { whiteboard: [{ id: 'f', type: 'rect', texSrc: '/saves/images/m/stone floor.png', texTile: 2 }, { id: 'g', type: 'path', tip: 'fill', texSrc: '/saves/images/lib/moss.webp', texTile: 'whole' }, { id: 'h', type: 'rect', texSrc: '/saves/images/journal/c/page.png' }, { id: 'i', type: 'rect', texSrc: '/saves/images/../data.json' }] } } } } });
        check('map builder B3: an export bundles the picture a piece wears as its fill, with a space in its name, as it bundles a piece\'s own picture; a fill that names the Journal\'s folder or walks out of saves/images names no file',
            JSON.stringify(exF.slice().sort()) === JSON.stringify(['/saves/images/lib/moss.webp', '/saves/images/m/stone floor.png']), JSON.stringify(exF));
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
        // item 35: the looks of a character's texts from a file come in as the app cleans them (cleanChar): on Replace and on a load by the load's
        // own normaliser, on Merge by the same cleaner main.js runs for each character
        {
            const LKi = await import(surl('lookcore.js')), sigI = t => LKi.textSig(t);
            const lookFile = { activeCampaignId: 'cL', campaigns: { cL: { id: 'cL', name: 'L', items: {}, system: { v: 1, name: 'T', rolls: [], fields: [{ id: 'f_name', key: 'Name', kind: 'text' }, { id: 'f_bio', key: 'Bio', kind: 'notes' }, { id: 'f_st', key: 'ST', kind: 'number', def: 10 }] },
                chars: { c_1: { id: 'c_1', name: 'Hero', ownerId: 'u_x', values: { f_name: 'Bren', f_bio: 'Line one', f_st: 12 },
                        looks: { f_bio: { fmt: { spans: [{ s: 0, e: 4, link: 'javascript:alert(1)', b: true, size: 'large' }] }, sig: sigI('Line one') }, f_name: { fmt: { b: true, size: 'huge', color: 'red;x:url(//e)' }, font: 'Evil", serif', sig: sigI('Bren') }, f_st: { fmt: { b: true }, sig: sigI('12') }, f_zz: { fmt: { b: true }, sig: sigI('Bren') } } },
                    c_2: { id: 'c_2', name: 'Stale', ownerId: 'u_y', values: { f_name: 'Now other words' }, looks: { f_name: { fmt: { b: true }, sig: sigI('Bren') } } },
                    c_3: { id: 'c_3', name: 'Odd', ownerId: 'u_z', values: { f_name: 'Bren' }, looks: [1, 2] },
                    c_4: { id: 'c_4', name: 'Shape', ownerId: 'u_w', values: { f_name: 'Bren' }, looks: { f_name: { fmt: { b: true }, sig: sigI('Bren'), onclick: 'x' } } },
                    c_5: { id: 'c_5', name: 'Plain', ownerId: 'u_v', values: { f_name: 'Bren' } } } } } };
            const outL = cleanImport(JSON.parse(JSON.stringify(lookFile)), deps), chL = outL && outL.campaigns.cL && outL.campaigns.cL.chars, l1 = chL && chL.c_1 && chL.c_1.looks, spanL = l1 && l1.f_bio && l1.f_bio.fmt.spans && l1.f_bio.fmt.spans[0];
            check('item 35 import: a file\'s looks of a character\'s texts come in cleaned (the real load normaliser with the real core): a look is kept beside a text or notes value it was made for, in the order of the system\'s fields; an address that is no web address, a colour that is no colour, a size on a one-line text and a font go, and the rest of the look stays; a look for a number or for a field that is not there, one made for other words, one with a key of its own invention and looks that are a list leave no key; a character with none has none; and Merge cleans each character through the same cleaner, main.js naming no look itself',
                !!l1 && Object.keys(l1).join() === 'f_name,f_bio' && JSON.stringify(l1.f_name) === JSON.stringify({ fmt: { b: true }, sig: sigI('Bren') }) && l1.f_bio.sig === sigI('Line one') && l1.f_bio.fmt.spans.length === 1 && !!spanL && spanL.s === 0 && spanL.e === 4 && spanL.b === true && spanL.size === 'large' && !('link' in spanL)
                && ['c_2', 'c_3', 'c_4', 'c_5'].every(id => chL[id] && !('looks' in chL[id])) && !/javascript|url\(|Evil|onclick|huge/.test(JSON.stringify(chL))
                && (mainSrc.match(/window\.wpSystemCore\.cleanChar\(/g) || []).length === 2 && !/\.looks\b/.test(mainSrc) && (ioSrc.match(/window\.wpSystemCore\.cleanChar\(/g) || []).length === 1 && !/\.looks\b/.test(ioSrc), chL && JSON.stringify(chL));
        }
        // senses S1: a file's senses (the system's combat.senses) come in cleaned as the app cleans them, on Replace (the load's normaliser) and on Merge (main.js)
        const sensesSys = () => ({ v: 1, name: 'Sn', rolls: [], fields: [{ id: 'f_st', key: 'Sight', label: 'S', kind: 'number', def: 6, vis: 'all' }, { id: 'f_gm', key: 'GMFig', label: 'G', kind: 'number', def: 5, vis: 'gm' }],
            combat: { senses: { vis: 'gm', blind: { field: 'f_gm' }, list: [
                { id: 'sn_ether001', name: 'Ether' + String.fromCharCode(7) + 'Sight', range: { by: 'field', field: 'f_st', formula: 'x' }, grade: 'full', walls: 'pass', shows: 'dim', glyph: 'heat', junk: 1 },
                { id: 'sn_secret01', name: 'Secret', range: { by: 'field', field: 'f_gm' }, grade: 'mark' }, { id: 'bad', name: 'Bad', range: { by: 'n', n: 1 }, grade: 'full' }] } } });
        const sensesWant = JSON.stringify({ list: [{ id: 'sn_ether001', name: 'Ether Sight', range: { by: 'field', field: 'f_st' }, grade: 'full', walls: 'pass', shows: 'dim' }] });
        const outS = cleanImport({ campaigns: { cS: { id: 'cS', name: 'S', items: {}, system: sensesSys() } } }, deps);
        const mergeS = S.cleanSystem(sensesSys(), { F, gmView: true });
        check('S1 import: a file\'s senses come in cleaned — on Replace by the load\'s own normaliser (junk keys cut, a name cleaned, a sense or blind on a GM-only value gone, a bad id gone) and on Merge by the same cleaner main.js runs on a new campaign and on one already here',
            !!outS && JSON.stringify(outS.campaigns.cS.system.combat.senses) === sensesWant && JSON.stringify(mergeS.combat.senses) === sensesWant
            && (mainSrc.match(/window\.wpSystemCore\.cleanSystem\(ic\.system, \{ F: window\.wpFormula, gmView: true \}\)/g) || []).length === 2, outS && JSON.stringify(outS.campaigns.cS.system.combat));
        // 126: a file's point budgets come in cleaned the same way, on Replace and on Merge
        const budSys = () => ({ v: 1, name: 'Bd', rolls: [], fields: [{ id: 'f_st', key: 'ST', label: 'S', kind: 'number', def: 10, vis: 'all' }, { id: 'f_gm', key: 'GMFig', label: 'G', kind: 'number', def: 5, vis: 'gm' }],
            budgets: [{ id: 'b_ok', name: '  Points ', has: ' 100 ', spent: 'ST * 2', over: 'explode', when: 7, gm: true }, { id: 'b_gm', name: 'Hidden', has: 'GMFig', spent: 'ST' }, { id: 'b_dice', name: 'Dice', has: '1d6', spent: 'ST' }, { id: 'nope', name: 'Bad id', has: '1', spent: '1' },
                { id: 'b_warn', name: 'Warned', has: '5', spent: 'ST', over: 'warn', when: 'making' }, 'junk', { id: 'b_ok', name: 'Twice', has: '1', spent: '1' }] });
        const budWant = JSON.stringify([{ id: 'b_ok', name: 'Points', has: '100', spent: 'ST * 2', over: 'refuse', when: 'always' }, { id: 'b_warn', name: 'Warned', has: '5', spent: 'ST', over: 'warn', when: 'making' }]);
        const outB = cleanImport({ campaigns: { cB: { id: 'cB', name: 'B', items: {}, system: budSys() } } }, deps), mergeB = S.cleanSystem(budSys(), { F, gmView: true }), noB = cleanImport({ campaigns: { cN: { id: 'cN', name: 'N', items: {}, system: Object.assign(budSys(), { budgets: 'x' }) } } }, deps);
        check('126 import: a file\'s point budgets come in cleaned, on Replace by the load\'s own normaliser and on Merge by the same cleaner: a name trimmed, a formula trimmed, a breach and a watch that are no known word made Refuse and Always, a key that is no budget\'s cut, and a budget gone whole when its id is none or is there twice, when a formula rolls dice, or when it reads a GM-only value; budgets that are no list are no budgets',
            !!outB && JSON.stringify(outB.campaigns.cB.system.budgets) === budWant && JSON.stringify(mergeB.budgets) === budWant && !!noB && !('budgets' in noB.campaigns.cN.system), outB && JSON.stringify(outB.campaigns.cB.system.budgets));
        // 1.5.9 (the book's (es)): a file's afflictions on an item's blast and its Combat card's resist roll come in cleaned the same way, on Replace and on Merge
        const affSys = () => ({ v: 1, name: 'Af', rolls: [], fields: [{ id: 'f_ht', key: 'HT', label: 'H', kind: 'number', def: 10, vis: 'all' }, { id: 'f_fx', key: 'Fx', label: 'E', kind: 'effects', vis: 'all' }], effects: [{ id: 'e_stun', name: 'Stunned', vis: 'all', mods: [] }],
            items: [{ id: 'i_sp', name: 'Spark Grenade', vis: 'all', damage: '2d6', area: { ft: 6, aff: [{ vs: ' HT-2 ', fx: 'e_stun', who: 'everyone', needs: 'x\u0007', lasts: { n: '1d6', u: 'minutes' }, junk: 1 }, { vs: 'HT', fx: 'e_gone' }, { vs: 'HT', fx: 'e_stun', who: 'all' }, { vs: 'HT', fx: 'e_stun' }] } }],
            combat: { blastAuto: 'full', blast: { resist: ' 3d6 <= Resist ', hurt: 'share', odd: 1 } } });
        const affWant = JSON.stringify([{ vs: 'HT-2', fx: 'e_stun', lasts: { n: '1d6', u: 'minutes' } }]);
        const outA = cleanImport({ campaigns: { cA: { id: 'cA', name: 'A', items: {}, system: affSys() } } }, deps), mergeA = S.cleanSystem(affSys(), { F, gmView: true });
        check('1.5.9 (es) import: a file\'s afflictions come in cleaned, on Replace by the load\'s own normaliser and on Merge by the same cleaner: a resist target trimmed, a who that is no word dropped, an Only where with a control character dropped, a key that is none cut, the first two read and of them one whose effect the system does not hold gone; the Combat card\'s resist roll trimmed and its hurt word kept',
            !!outA && JSON.stringify(outA.campaigns.cA.system.items[0].area.aff) === affWant && JSON.stringify(mergeA.items[0].area.aff) === affWant && JSON.stringify(outA.campaigns.cA.system.combat.blast) === JSON.stringify({ resist: '3d6 <= Resist', hurt: 'share' }) && JSON.stringify(mergeA.combat.blast) === JSON.stringify({ resist: '3d6 <= Resist', hurt: 'share' }),
            outA && JSON.stringify([outA.campaigns.cA.system.items[0].area, outA.campaigns.cA.system.combat.blast]));
        // the eyes' arc: a file's arc key comes in cleaned the same way — kept on a number its player can read, gone on a GM-only one, a junk one or a field of another kind
        const arcSysOf = arc => { const s = sensesSys(); s.fields.push({ id: 'f_tg', key: 'Tog', label: 'T', kind: 'toggle', vis: 'all' }); s.combat.senses.arc = arc; return s; };
        const arcIn = arc => { const o = cleanImport({ campaigns: { cS: { id: 'cS', name: 'S', items: {}, system: arcSysOf(arc) } } }, deps), m = S.cleanSystem(arcSysOf(arc), { F, gmView: true }); return [o && JSON.stringify(o.campaigns.cS.system.combat.senses.arc), JSON.stringify(m.combat.senses.arc), o && o.campaigns.cS.system.combat.senses.list.length]; };
        const arcFile = [{ field: 'f_st', vis: 'gm', n: 300 }, { field: 'f_gm' }, { field: 'f_tg' }, { field: 'f_nothere' }, 'f_st', 300, null].map(arcIn);
        check('eyes\' arc import: a file\'s arc key comes in cleaned on Replace and on Merge alike — the field it names kept with its junk cut where that is a number its player can read; dropped where it is GM-only, a toggle, a field that is not there, text, a number or null — and the senses beside it stay',
            JSON.stringify(arcFile) === JSON.stringify([['{"field":"f_st"}', '{"field":"f_st"}', 1]].concat([1, 2, 3, 4, 5, 6].map(() => [undefined, undefined, 1]))), JSON.stringify(arcFile));
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
            && /var parsed = JSON\.parse\(snap\);\n\n\s*if \(item\.type === 'map' && parsed && parsed\.c && Array\.isArray\(parsed\.c\.whiteboard\)\) parsed\.c\.whiteboard = parsed\.c\.whiteboard\.filter\(function\(w\) \{ return !\(w && w\.waiting\); \}\);[^\n]*\n[\s\S]{0,200}mergeLivePlayerState\(parsed\.c, item, /.test(ioW)
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
                { id: 'i', type: 'light', x: 0, y: 0, light: { bright: 1.5, dim: 3, unit: 'm', name: 'Lumen rod' } }
            ];
            const want = { a: { bright: 1000, dim: 1000, off: true, name: longName.slice(0, FCr.LIMITS.lightName) }, c: { bright: 0, dim: 0 }, f: { bright: 2, dim: 6, unit: 'cells', name: 'Torch  of  fire' }, h: { bright: 4, dim: 4 }, i: { bright: 1.5, dim: 3, unit: 'm', name: 'Lumen rod' } };
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
            const snBoard = (withNull) => [{ id: 's1', type: 'circle', isChar: true, x: 0, y: 0, senses: [{ id: 'sn_ether001', n: 1e9 }, { id: 'sn_ether001', n: 3 }, { id: 'sn_BAD', n: 1 }, { id: 'sn_other001', n: -5, extra: HT }, { id: 'sn_text0001', n: '4' }] },
                { id: 's2', type: 'circle', isChar: true, x: 0, y: 0, senses: HT }, { id: 's3', type: 'circle', isChar: true, x: 0, y: 0, senses: [] }, { id: 's4', type: 'rect', x: 0, y: 0, w: 5, h: 5 }, { id: 's5', type: 'circle', isChar: true, x: 0, y: 0, senses: null }].concat(withNull ? [null] : []);
            const sensesOf = wb => { const o = {}; (wb || []).forEach(w => { if (w && 'senses' in w) o[w.id] = w.senses; }); return o; };
            const wantSn = { s1: [{ id: 'sn_ether001', n: 100000 }, { id: 'sn_other001', n: 0 }] };
            const fileSn = () => JSON.parse(jl({ campaigns: { cS: { id: 'cS', name: 'S', items: { mS: { id: 'mS', type: 'map', meta: { title: 'M' }, rooms: [], links: [], whiteboard: snBoard() } } } } }));
            const outSn = cleanImport(fileSn(), depsL), wbSnR = outSn && outSn.campaigns.cS.items.mS.whiteboard;
            const icSn = { items: { mS: { id: 'mS', type: 'map', whiteboard: snBoard(true) }, pS: { id: 'pS', type: 'planner', blocks: [], whiteboard: [{ id: 'z', senses: [{ id: 'sn_ether001', n: 1e9 }] }] } } }; cleanImportItems(icSn, depsL);
            const againSn = { items: { mS: { id: 'mS', type: 'map', whiteboard: JSON.parse(jl(icSn.items.mS.whiteboard)) } } }; cleanImportItems(againSn, depsL);
            check('import: a token\'s own ranges for its senses from a file are cleaned as the app reads them, on Replace and on Merge — each sense once (the first kept), its range a number clamped to 0 to 100000, a bad id dropped, nothing else riding along; a list that gives none is taken off; an item without one gains none; a planner\'s own list is not walked; cleaned once, a second clean changes nothing',
                !!wbSnR && jl(sensesOf(wbSnR)) === jl(wantSn) && jl(sensesOf(icSn.items.mS.whiteboard)) === jl(wantSn) && wbSnR.filter(Boolean).length === 5 && Object.keys(wbSnR[3]).join() === 'id,type,x,y,w,h'
                && jl(icSn.items.pS.whiteboard[0].senses) === jl([{ id: 'sn_ether001', n: 1e9 }]) && jl(againSn.items.mS.whiteboard) === jl(icSn.items.mS.whiteboard), jl([sensesOf(wbSnR || []), sensesOf(icSn.items.mS.whiteboard)]));
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
            // map builder B1: a piece's texture from a file — a name the app's table holds (fogcore cleanTexture), on Replace and on Merge; none without the cleaner
            const txMap = () => ({ id: 'mX', type: 'map', meta: { title: 'X' }, rooms: [], links: [], whiteboard: [{ id: 'x1', type: 'rect', x: 0, y: 0, w: 50, h: 50, texture: 'bricks' }, { id: 'x2', type: 'path', tip: 'fill', x: 0, y: 0, w: 50, h: 50, pts: [[0, 0], [50, 0], [50, 50]], texture: 'grass' }, { id: 'x3', type: 'rect', x: 0, y: 0, w: 50, h: 50, texture: 'Bricks' },
                { id: 'x4', type: 'hexagon', x: 0, y: 0, w: 60, h: 52, fill: true, texture: 'url(x)' }, { id: 'x5', type: 'rect', x: 0, y: 0, w: 50, h: 50, texture: '__proto__' }, { id: 'x6', type: 'circle', x: 0, y: 0, w: 50, h: 50, texture: 1 }, { id: 'x7', type: 'rect', x: 0, y: 0, w: 50, h: 50, texture: {} }, { id: 'x8', type: 'rect', x: 0, y: 0, w: 50, h: 50 },
                { id: 'x9', type: 'rect', x: 0, y: 0, w: 50, h: 50, texture: 'forest' }, { id: 'x10', type: 'circle', x: 0, y: 0, w: 50, h: 50, texture: 'snow' }, { id: 'x11', type: 'rect', x: 0, y: 0, w: 50, h: 50, texture: 'Mountains' }] });   // fold B7: a land pattern comes in as any other, and another case of one does not
            const outTx = cleanImport(JSON.parse(jl({ campaigns: { cX: { id: 'cX', name: 'X', items: { mX: txMap() } } } })), depsL), icTx = { items: { mX: txMap() } }; cleanImportItems(icTx, depsL);
            const icTxN = { items: { mX: txMap() } }; cleanImportItems(icTxN, { DR: DOC, sanitize }); const icTxB = { items: { mX: txMap() } }; cleanImportItems(icTxB, { DR: DOC, sanitize, FC: { LIMITS: FCr.LIMITS, cleanLight: FCr.cleanLight } }); const outTxN = cleanImport(JSON.parse(jl({ campaigns: { cX: { id: 'cX', name: 'X', items: { mX: txMap() } } } })), deps);
            const txOf = m => m.whiteboard.map(w => ('texture' in w ? w.texture : 'none')), txKept = ['bricks', 'grass', 'none', 'none', 'none', 'none', 'none', 'none', 'forest', 'snow', 'none'], txNone = Array(11).fill('none');
            check('import: a piece\'s texture (map builder B1) comes in only as a name the app\'s table holds — of ten values bricks, grass and the land patterns forest and snow are kept, another case of a ground pattern and of a land pattern, an address, a prototype\'s name, a number and an object are dropped — on Replace and on Merge; without the cleaner on hand (none, or a fogcore without cleanTexture) every texture is dropped; the pieces themselves stay, a piece without one gains none',
                !!outTx && jl(txOf(outTx.campaigns.cX.items.mX)) === jl(txKept) && jl(txOf(icTx.items.mX)) === jl(txKept) && jl(txOf(icTxN.items.mX)) === jl(txNone) && jl(txOf(icTxB.items.mX)) === jl(txNone) && !!outTxN && jl(txOf(outTxN.campaigns.cX.items.mX)) === jl(txNone)
                && [outTx.campaigns.cX.items.mX, icTx.items.mX, icTxN.items.mX, icTxB.items.mX, outTxN.campaigns.cX.items.mX].every(m => m.whiteboard.length === 11 && jl(m.whiteboard.map(w => w.id)) === jl(['x1', 'x2', 'x3', 'x4', 'x5', 'x6', 'x7', 'x8', 'x9', 'x10', 'x11'])) && Object.keys(icTx.items.mX.whiteboard[7]).join() === 'id,type,x,y,w,h' && icTx.items.mX.whiteboard[1].tip === 'fill',
                jl([outTx && txOf(outTx.campaigns.cX.items.mX), txOf(icTx.items.mX), txOf(icTxN.items.mX), txOf(icTxB.items.mX), outTxN && txOf(outTxN.campaigns.cX.items.mX)]));
            // map builder B3: a piece's picture fill from a file: its path only as a plain picture path under saves/images (fogcore cleanTexSrc), its
            // repeat only as 1, 2, 4 or whole and only beside a path that was kept, on Replace and on Merge; none without the cleaners
            const pfMap = () => ({ id: 'mP', type: 'map', meta: { title: 'P' }, rooms: [], links: [], whiteboard: [{ id: 'p1', type: 'rect', x: 0, y: 0, w: 50, h: 50, texSrc: '/saves/images/m/stone floor.png', texTile: 2 }, { id: 'p2', type: 'path', tip: 'fill', x: 0, y: 0, w: 50, h: 50, pts: [[0, 0], [50, 0], [50, 50]], texSrc: '/saves/images/m/moss.webp', texTile: 'whole' }, { id: 'p3', type: 'rect', x: 0, y: 0, w: 50, h: 50, texSrc: '/saves/images/m/a.png', texTile: 3 }, { id: 'p4', type: 'rect', x: 0, y: 0, w: 50, h: 50, texSrc: '/saves/images/m/a.png' },
                { id: 'p5', type: 'rect', x: 0, y: 0, w: 50, h: 50, texSrc: 'https://x.test/a.png', texTile: 1 }, { id: 'p6', type: 'rect', x: 0, y: 0, w: 50, h: 50, texSrc: 'data:image/png;base64,AA', texTile: 1 }, { id: 'p7', type: 'rect', x: 0, y: 0, w: 50, h: 50, texSrc: '/saves/images/../data.png', texTile: 1 }, { id: 'p8', type: 'rect', x: 0, y: 0, w: 50, h: 50, texSrc: '/saves/images/journal/c/page.png', texTile: 4 }, { id: 'p9', type: 'rect', x: 0, y: 0, w: 50, h: 50, texSrc: 5, texTile: 2 },
                { id: 'p10', type: 'rect', hidden: true, x: 0, y: 0, w: 50, h: 50, texSrc: '/saves/images/m/vault.png', texTile: 4 }, { id: 'p11', type: 'rect', x: 0, y: 0, w: 50, h: 50, texTile: 2 }, { id: 'p12', type: 'rect', x: 0, y: 0, w: 50, h: 50, texture: 'bricks', texSrc: '/saves/images/m/a.png', texTile: 1 }, { id: 'p13', type: 'rect', x: 0, y: 0, w: 50, h: 50 }] });
            const pfFile = () => JSON.parse(jl({ campaigns: { cP: { id: 'cP', name: 'P', items: { mP: pfMap() } } } }));
            const outPf = cleanImport(pfFile(), depsL), icPf = { items: { mP: pfMap() } }; cleanImportItems(icPf, depsL); const icPfN = { items: { mP: pfMap() } }; cleanImportItems(icPfN, { DR: DOC, sanitize }); const icPfB = { items: { mP: pfMap() } }; cleanImportItems(icPfB, { DR: DOC, sanitize, FC: { LIMITS: FCr.LIMITS, cleanLight: FCr.cleanLight, cleanTexture: FCr.cleanTexture } });
            const icPfH = { items: { mP: pfMap() } }; cleanImportItems(icPfH, { DR: DOC, sanitize, FC: { LIMITS: FCr.LIMITS, cleanLight: FCr.cleanLight, cleanTexSrc: FCr.cleanTexSrc } }); const outPfN = cleanImport(pfFile(), deps);
            const pfOf = m => m.whiteboard.map(w => [('texSrc' in w ? w.texSrc : 'none'), ('texTile' in w ? w.texTile : 'none')]), NO2 = ['none', 'none'], A2 = '/saves/images/m/a.png';
            const pfKept = [['/saves/images/m/stone floor.png', 2], ['/saves/images/m/moss.webp', 'whole'], [A2, 'none'], [A2, 'none'], NO2, NO2, NO2, NO2, NO2, ['/saves/images/m/vault.png', 4], NO2, [A2, 1], NO2], pfNone = Array(13).fill(NO2), pfHalf = pfKept.map(r => [r[0], 'none']);
            check('import: a piece\'s picture fill (map builder B3) comes in only as a plain picture path under saves/images with a repeat of 1, 2, 4 or whole, on Replace and on Merge, a hidden piece\'s too; a repeat the list lacks leaves the path alone, and a web address, an inline picture, a path that walks, the Journal\'s folder, a number or a repeat with no path leave neither key; without the cleaners on hand (none, or a fogcore without them) every fill is dropped, and with the path\'s cleaner alone no repeat is kept; the pieces themselves stay, a pattern beside a picture stays, a piece without one gains none',
                !!outPf && jl(pfOf(outPf.campaigns.cP.items.mP)) === jl(pfKept) && jl(pfOf(icPf.items.mP)) === jl(pfKept) && jl(pfOf(icPfN.items.mP)) === jl(pfNone) && jl(pfOf(icPfB.items.mP)) === jl(pfNone) && jl(pfOf(icPfH.items.mP)) === jl(pfHalf) && !!outPfN && jl(pfOf(outPfN.campaigns.cP.items.mP)) === jl(pfNone)
                && [outPf.campaigns.cP.items.mP, icPf.items.mP, icPfN.items.mP, icPfB.items.mP, icPfH.items.mP, outPfN.campaigns.cP.items.mP].every(m => m.whiteboard.length === 13 && jl(m.whiteboard.map(w => w.id)) === jl(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12', 'p13']))
                && icPf.items.mP.whiteboard[11].texture === 'bricks' && icPfB.items.mP.whiteboard[11].texture === 'bricks' && Object.keys(icPf.items.mP.whiteboard[12]).join() === 'id,type,x,y,w,h' && icPf.items.mP.whiteboard[9].hidden === true,
                jl([outPf && pfOf(outPf.campaigns.cP.items.mP), pfOf(icPf.items.mP), pfOf(icPfN.items.mP), pfOf(icPfB.items.mP), pfOf(icPfH.items.mP), outPfN && pfOf(outPfN.campaigns.cP.items.mP)]));
            const fbMap = () => ({ id: 'mF', type: 'map', meta: { title: 'F' }, rooms: [], links: [], whiteboard: [{ id: 'q1', type: 'image', isChar: true, charId: 'c_x', x: 0, y: 0, w: 50, h: 50, fxb: [{ n: 'Forged', i: 'icon:bolt', t: 'buff' }] }, { id: 'q2', type: 'rect', x: 0, y: 0, w: 50, h: 50, fxb: 'x' }] });
            const outFb = cleanImport(JSON.parse(jl({ campaigns: { cF: { id: 'cF', name: 'F', items: { mF: fbMap() } } } })), depsL), icFb = { items: { mF: fbMap() } }; cleanImportItems(icFb, depsL); const icFbN = { items: { mF: fbMap() } }; cleanImportItems(icFbN, { DR: DOC, sanitize });
            check('import: a token\'s effects as a table sees them (conditions C1, fxb) never come in from a file, on Replace and on Merge, with or without the cleaner — a host works them out; the pieces themselves stay',
                !!outFb && ![outFb.campaigns.cF.items.mF, icFb.items.mF, icFbN.items.mF].some(m => m.whiteboard.some(w => 'fxb' in w)) && icFbN.items.mF.whiteboard.length === 2, jl([outFb && outFb.campaigns.cF.items.mF.whiteboard, icFbN.items.mF.whiteboard]));
            const SCtb = await import(surl('systemcore.js')), depsTB = Object.assign({}, depsL, { SC: SCtb });
            const tbMap = () => ({ id: 'mB', type: 'map', meta: { title: 'B' }, rooms: [], links: [], whiteboard: [{ id: 'b1', type: 'image', isChar: true, x: 0, y: 0, w: 50, h: 50, tbr: [{ s: 0, v: 1, m: 1 }], bars: [{ n: '<b>x</b>' + 'y'.repeat(50), cur: 3, max: 4, show: 'all', color: 'red' }, { cur: 2, max: 5, show: 'nobody' }, { cur: 9 }] },
                { id: 'b2', type: 'image', isChar: true, charId: 'c_x', x: 0, y: 0, w: 50, h: 50, bars: [] }, { id: 'b3', type: 'image', isChar: true, x: 0, y: 0, w: 50, h: 50, bars: [null, { f: 'f_hp' }] }, { id: 'b4', type: 'image', isChar: true, x: 0, y: 0, w: 50, h: 50, bars: [{ cur: 'x' }, null] },
                { id: 'b5', type: 'rect', x: 0, y: 0, w: 50, h: 50, bars: 'x', tbr: 'x' }] });
            const outTb = cleanImport(JSON.parse(jl({ campaigns: { cB: { id: 'cB', name: 'B', items: { mB: tbMap() } } } })), depsTB), icTb = { items: { mB: tbMap() } }; cleanImportItems(icTb, depsTB); const icTbN = { items: { mB: tbMap() } }; cleanImportItems(icTbN, { DR: DOC, sanitize });
            const tbOf = m => m.whiteboard.map(w => ('bars' in w ? w.bars : 'none')), tbWant = [[{ show: 'all', cur: 3, max: 4, n: '<b>x</b>' + 'y'.repeat(32), color: '#d9534f' }, { show: 'owner', cur: 2, max: 5, color: '#4f8fd9' }], [null, null], [null, { show: 'owner', f: 'f_hp', color: '#4f8fd9' }], 'none', 'none'];
            check('import: a token\'s bars as a table sees them (backlog 28, tbr) never come in from a file, and a token\'s own bars come in cleaned as the app reads them (two slots, a pool by id or numbers of its own, who sees it, a colour), on Replace and on Merge; a token with no sheet and no bar left keeps no list, a character token keeps an empty one (This token\'s own); without the cleaner none come in; the pieces themselves stay',
                !!outTb && jl(tbOf(outTb.campaigns.cB.items.mB)) === jl(tbWant) && jl(tbOf(icTb.items.mB)) === jl(tbWant) && jl(tbOf(icTbN.items.mB)) === jl(['none', 'none', 'none', 'none', 'none'])
                && ![outTb.campaigns.cB.items.mB, icTb.items.mB, icTbN.items.mB].some(m => m.whiteboard.some(w => 'tbr' in w)) && icTbN.items.mB.whiteboard.length === 5, jl([outTb && tbOf(outTb.campaigns.cB.items.mB), tbOf(icTb.items.mB), tbOf(icTbN.items.mB)]));
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
            // see-through barriers (1.5.1): a piece's barrier flag from a file
            const brMap = () => ({ id: 'mBr', type: 'map', meta: { title: 'B' }, rooms: [], links: [], whiteboard: [{ id: 'r1', type: 'rect', x: 0, y: 0, w: 50, h: 50, barrier: true }, { id: 'r2', type: 'rect', x: 0, y: 0, w: 50, h: 50, barrier: 'yes' }, { id: 'r3', type: 'circle', x: 0, y: 0, w: 50, h: 50, barrier: { on: true } }, { id: 'r4', type: 'rect', x: 0, y: 0, w: 50, h: 50, barrier: 1 },
                { id: 'r5', type: 'rect', x: 0, y: 0, w: 50, h: 50, barrier: false }, { id: 'r6', type: 'rect', x: 0, y: 0, w: 50, h: 50 }, { id: 'r7', type: 'path', x: 0, y: 0, w: 50, h: 50, pts: [[0, 0], [1, 1]], barrier: true, sightType: 'door', doorOpen: true, doorLock: true }, { id: 'r8', type: 'rect', x: 0, y: 0, w: 50, h: 50, hidden: true, barrier: true }] });
            const outBr = cleanImport(JSON.parse(jl({ campaigns: { cBr: { id: 'cBr', name: 'B', items: { mBr: brMap() } } } })), depsL), icBr = { items: { mBr: brMap() } }; cleanImportItems(icBr, depsL); const icBrN = { items: { mBr: brMap() } }; cleanImportItems(icBrN, { DR: DOC, sanitize });
            const icBrO = { items: { mBr: brMap() } }; cleanImportItems(icBrO, { DR: DOC, sanitize, FC: { LIMITS: depsL.FC.LIMITS, cleanLight: depsL.FC.cleanLight } });   // a fogcore from before barriers: no cleaner for the flag
            const brOf = m => m.whiteboard.map(w => ('barrier' in w ? w.barrier : 'none')), brWant = [true, 'none', 'none', 'none', 'none', 'none', true, true], r7 = outBr && outBr.campaigns.cBr.items.mBr.whiteboard[6];
            check('import: a piece\'s barrier flag (see-through barriers, 1.5.1) comes in only as true, on Replace and on Merge, a hidden piece\'s too and a door\'s with its door keys as they were; a word, a number, an object or false none; with no cleaner on hand (none, or a fogcore without one) none comes in at all; the pieces themselves stay',
                !!outBr && jl(brOf(outBr.campaigns.cBr.items.mBr)) === jl(brWant) && jl(brOf(icBr.items.mBr)) === jl(brWant) && jl(brOf(icBrN.items.mBr)) === jl(Array(8).fill('none')) && jl(brOf(icBrO.items.mBr)) === jl(Array(8).fill('none')) && icBrN.items.mBr.whiteboard.length === 8
                && !!r7 && r7.sightType === 'door' && r7.doorOpen === true && r7.doorLock === true, jl([outBr && brOf(outBr.campaigns.cBr.items.mBr), brOf(icBr.items.mBr), brOf(icBrN.items.mBr), brOf(icBrO.items.mBr)]));
            // a barrier's Stops blasts tick from a file (the owner, 2026-10-03): only as true, and only on a piece whose barrier flag came in
            const bsMap = () => ({ id: 'mBs', type: 'map', meta: { title: 'B' }, rooms: [], links: [], whiteboard: [{ id: 's1', type: 'rect', x: 0, y: 0, w: 50, h: 50, barrier: true, blastStop: true }, { id: 's2', type: 'rect', x: 0, y: 0, w: 50, h: 50, barrier: true, blastStop: 'yes' }, { id: 's3', type: 'rect', x: 0, y: 0, w: 50, h: 50, barrier: true, blastStop: 1 },
                { id: 's4', type: 'rect', x: 0, y: 0, w: 50, h: 50, blastStop: true }, { id: 's5', type: 'rect', x: 0, y: 0, w: 50, h: 50, barrier: 'yes', blastStop: true }, { id: 's6', type: 'rect', x: 0, y: 0, w: 50, h: 50, barrier: true }, { id: 's7', type: 'rect', x: 0, y: 0, w: 50, h: 50, blocksSight: true, blastStop: true }, { id: 's8', type: 'rect', x: 0, y: 0, w: 50, h: 50, hidden: true, barrier: true, blastStop: true }] });
            const outBs = cleanImport(JSON.parse(jl({ campaigns: { cBs: { id: 'cBs', name: 'B', items: { mBs: bsMap() } } } })), depsL), icBs = { items: { mBs: bsMap() } }; cleanImportItems(icBs, depsL); const icBsN = { items: { mBs: bsMap() } }; cleanImportItems(icBsN, { DR: DOC, sanitize });
            const icBsO = { items: { mBs: bsMap() } }; cleanImportItems(icBsO, { DR: DOC, sanitize, FC: { LIMITS: depsL.FC.LIMITS, cleanLight: depsL.FC.cleanLight, cleanBarrier: depsL.FC.cleanBarrier } });   // a fogcore that knows barriers and not the tick
            const bsOf = m => m.whiteboard.map(w => ('blastStop' in w ? w.blastStop : 'none')), bsWant = [true, 'none', 'none', 'none', 'none', 'none', 'none', true];
            check('import: a barrier\'s Stops blasts tick comes in only as true and only on a piece whose barrier flag came in, on Replace and on Merge, a hidden barrier\'s too; a word or a number none, and none on a plain piece, a wall or a piece whose barrier flag is no true; with no cleaner on hand (none, or a fogcore without one) none comes in at all; the pieces themselves stay',
                !!outBs && jl(bsOf(outBs.campaigns.cBs.items.mBs)) === jl(bsWant) && jl(bsOf(icBs.items.mBs)) === jl(bsWant) && jl(bsOf(icBsN.items.mBs)) === jl(Array(8).fill('none')) && jl(bsOf(icBsO.items.mBs)) === jl(Array(8).fill('none')) && icBsO.items.mBs.whiteboard.length === 8 && icBsO.items.mBs.whiteboard[0].barrier === true,
                jl([outBs && bsOf(outBs.campaigns.cBs.items.mBs), bsOf(icBs.items.mBs), bsOf(icBsN.items.mBs), bsOf(icBsO.items.mBs)]));
            // a piece's fog mark from a file (1.5.4: Under fog, Always revealed): one of its two words, or it does not come in
            const fhMap = () => ({ id: 'mFh', type: 'map', meta: { title: 'F' }, rooms: [], links: [], whiteboard: [{ id: 'h1', type: 'image', x: 0, y: 0, w: 50, h: 50, fogHand: 'hide' }, { id: 'h2', type: 'rect', x: 0, y: 0, w: 50, h: 50, fogHand: 'show' }, { id: 'h3', type: 'rect', x: 0, y: 0, w: 50, h: 50, fogHand: 'yes' },
                { id: 'h4', type: 'rect', x: 0, y: 0, w: 50, h: 50, fogHand: true }, { id: 'h5', type: 'rect', x: 0, y: 0, w: 50, h: 50, fogHand: { a: 1 } }, { id: 'h6', type: 'rect', x: 0, y: 0, w: 50, h: 50 }, { id: 'h7', type: 'image', x: 0, y: 0, w: 50, h: 50, hidden: true, fogHand: 'hide' }] });
            const outFh = cleanImport(JSON.parse(jl({ campaigns: { cFh: { id: 'cFh', name: 'F', items: { mFh: fhMap() } } } })), depsL), icFh = { items: { mFh: fhMap() } }; cleanImportItems(icFh, depsL); const icFhN = { items: { mFh: fhMap() } }; cleanImportItems(icFhN, { DR: DOC, sanitize });
            const icFhO = { items: { mFh: fhMap() } }; cleanImportItems(icFhO, { DR: DOC, sanitize, FC: { LIMITS: depsL.FC.LIMITS, cleanLight: depsL.FC.cleanLight, cleanBarrier: depsL.FC.cleanBarrier } });   // a fogcore from before the mark
            const fhOf = m => m.whiteboard.map(w => ('fogHand' in w ? w.fogHand : 'none')), fhWant = ['hide', 'show', 'none', 'none', 'none', 'none', 'hide'];
            check('import: a piece\'s fog mark (Under fog, Always revealed) comes in only as one of its two words, on Replace and on Merge, a hidden piece\'s too (it counts again once the piece is shown); another word, true or an object none; with no cleaner on hand (none, or a fogcore without one) none comes in at all; the pieces themselves stay',
                !!outFh && jl(fhOf(outFh.campaigns.cFh.items.mFh)) === jl(fhWant) && jl(fhOf(icFh.items.mFh)) === jl(fhWant) && jl(fhOf(icFhN.items.mFh)) === jl(Array(7).fill('none')) && jl(fhOf(icFhO.items.mFh)) === jl(Array(7).fill('none')) && icFhO.items.mFh.whiteboard.length === 7,
                jl([outFh && fhOf(outFh.campaigns.cFh.items.mFh), fhOf(icFh.items.mFh), fhOf(icFhN.items.mFh), fhOf(icFhO.items.mFh)]));
            // text style in more places (1.5.4): a text box's font from a file: one of Waypoint's own by its name, or a plain family name; with no cleaner on hand none comes in
            const TFc = await import(surl('textfmt.js')), depsF = Object.assign({}, depsL, { TF: TFc });
            const fnMap = () => ({ id: 'mFn', type: 'map', meta: { title: 'F' }, rooms: [], links: [], whiteboard: [{ id: 'f1', type: 'text', text: 'a', font: 'Cinzel' }, { id: 'f2', type: 'text', text: 'b', font: ' im fell english ' }, { id: 'f3', type: 'text', text: 'c', font: 'Georgia' },
                { id: 'f4', type: 'text', text: 'd', font: 'x"; background:url(https://evil.example/x)' }, { id: 'f5', type: 'text', text: 'e', font: 'Arial, Georgia' }, { id: 'f6', type: 'text', text: 'f', font: 7 }, { id: 'f7', type: 'text', text: 'g', font: { toString() { return 'Cinzel'; } } }, { id: 'f8', type: 'text', text: 'h' },
                { id: 'f9', type: 'rect', x: 0, y: 0, w: 50, h: 50, font: '<img src=x onerror=alert(1)>' }, { id: 'f10', type: 'text', text: 'j', font: 'A'.repeat(61) }, { id: 'f11', type: 'text', text: 'k', font: '' }] });
            const outFn = cleanImport(JSON.parse(jl({ campaigns: { cFn: { id: 'cFn', name: 'F', items: { mFn: fnMap() } } } })), depsF), icFn = { items: { mFn: fnMap() } }; cleanImportItems(icFn, depsF); const icFnN = { items: { mFn: fnMap() } }; cleanImportItems(icFnN, depsL);
            const icFnO = { items: { mFn: fnMap() } }; cleanImportItems(icFnO, Object.assign({}, depsL, { TF: { FONTS: TFc.FONTS } }));   // a textfmt from before the cleaner
            const fnOf = m => m.whiteboard.map(w => ('font' in w ? w.font : 'none')), fnWant = ['Cinzel', 'IM Fell English', 'Georgia', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none'];
            check('import: a text box\'s font comes in only as the cleaner keeps one (one of Waypoint\'s own under the list\'s spelling, or a plain family name), on Replace and on Merge; a declaration, a second family, a number, an object, an over-long or an empty name none, on a piece of any kind; with no cleaner on hand (none, or a textfmt without one) none comes in at all; the boxes themselves stay',
                !!outFn && jl(fnOf(outFn.campaigns.cFn.items.mFn)) === jl(fnWant) && jl(fnOf(icFn.items.mFn)) === jl(fnWant) && jl(fnOf(icFnN.items.mFn)) === jl(Array(11).fill('none')) && jl(fnOf(icFnO.items.mFn)) === jl(Array(11).fill('none')) && icFnO.items.mFn.whiteboard.length === 11,
                jl([outFn && fnOf(outFn.campaigns.cFn.items.mFn), fnOf(icFn.items.mFn), fnOf(icFnN.items.mFn), fnOf(icFnO.items.mFn)]));
            // 1.5.4 (gencore.js): the seed and settings a map's dungeon was generated from, from a file
            const GENc = await import(surl('gencore.js')), depsG = Object.assign({}, depsL, { GEN: GENc });
            const gnItems = () => ({ g1: { id: 'g1', type: 'map', meta: { title: 'A', gen: { seed: '4471-fox', w: 30, h: 20, rooms: 'few', corr: 'straight', doors: 'none' } }, rooms: [], links: [], whiteboard: [] }, g2: { id: 'g2', type: 'map', meta: { title: 'B', gen: { seed: '<img src=x onerror=1>', w: 9999, h: '20', rooms: 'lots', corr: 7, doors: null, html: '<b>', __proto__: { seed: 'x' } } }, rooms: [], links: [], whiteboard: [] },
                g3: { id: 'g3', type: 'map', meta: { title: 'C', gen: 'a seed' }, rooms: [], links: [], whiteboard: [] }, g4: { id: 'g4', type: 'map', meta: { title: 'D', gen: ['4471-fox'] }, rooms: [], links: [], whiteboard: [] }, g5: { id: 'g5', type: 'map', meta: { title: 'E', gen: null }, rooms: [], links: [], whiteboard: [] }, g6: { id: 'g6', type: 'map', meta: { title: 'F' }, rooms: [], links: [], whiteboard: [] }, g7: { id: 'g7', type: 'map', meta: 'x', rooms: [], links: [], whiteboard: [] },
                g8: { id: 'g8', type: 'Board', meta: { title: 'H', gen: { seed: 'kept-1', w: 11, h: 12, html: '<b>' } }, rooms: [], links: [], whiteboard: [] }, g9: { id: 'g9', meta: { title: 'I', gen: { seed: '<img src=x onerror=1>', w: 9999 } }, whiteboard: [] } });
            const outGn = cleanImport(JSON.parse(jl({ campaigns: { cGn: { id: 'cGn', name: 'G', items: gnItems() } } })), depsG), icGn = { items: gnItems() }; cleanImportItems(icGn, depsG); const icGnN = { items: gnItems() }; cleanImportItems(icGnN, depsL); const icGnO = { items: gnItems() }; cleanImportItems(icGnO, Object.assign({}, depsL, { GEN: { SIZE: GENc.SIZE } }));
            const gnOf = its => ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g8', 'g9'].map(k => (its[k] && its[k].meta && 'gen' in its[k].meta ? jl(its[k].meta.gen) : 'none')), gnWant = [jl({ seed: '4471-fox', w: 30, h: 20, rooms: 'few', corr: 'straight', doors: 'none' }), jl({ seed: '0000-fox', w: 60, h: 20, rooms: 'some', corr: 'winding', doors: 'most' }), 'none', 'none', 'none', 'none', jl({ seed: 'kept-1', w: 11, h: 12, rooms: 'some', corr: 'winding', doors: 'most' }), jl({ seed: '0000-fox', w: 60, h: 20, rooms: 'some', corr: 'winding', doors: 'most' })];
            check('import: the seed and settings a map\'s dungeon was generated from come in as the generator cleans them (a short plain seed, a size within bounds, one word of each list, own keys only), on Replace and on Merge; a hostile bag comes in as the first settings with nothing of what it held, and a text, a list or nothing in its place is no key; an item of another type, or of none, is read as the map it will be drawn as and its settings are cleaned alike; with no cleaner on hand (none, or a gencore without one) none comes in at all; the maps themselves stay, their titles too',
                !!outGn && jl(gnOf(outGn.campaigns.cGn.items)) === jl(gnWant) && jl(gnOf(icGn.items)) === jl(gnWant) && jl(gnOf(icGnN.items)) === jl(Array(8).fill('none')) && jl(gnOf(icGnO.items)) === jl(Array(8).fill('none')) && Object.keys(icGnN.items).length === 9 && icGn.items.g8.type === 'map' && icGn.items.g9.type === 'map' && icGn.items.g1.meta.title === 'A' && !/onerror|<b>/.test(jl(icGn.items)),
                jl([outGn && gnOf(outGn.campaigns.cGn.items), gnOf(icGn.items), gnOf(icGnN.items), gnOf(icGnO.items)]));
            // 1.5.4 (citycore.js): the seed and settings a map's city was generated from, from a file
            const CITYc = await import(surl('citycore.js')), depsC = Object.assign({}, depsL, { CITY: CITYc });
            const ctItems = () => ({ t1: { id: 't1', type: 'map', meta: { title: 'A', city: { seed: '4471-fox', size: 'village', wall: 'towers', water: 'coast', roofs: 'thatch', fields: false } }, rooms: [], links: [], whiteboard: [] }, t2: { id: 't2', type: 'map', meta: { title: 'B', city: { seed: '<img src=x onerror=1>', size: 'huge', wall: 7, water: null, roofs: ['mixed'], fields: 'no', html: '<b>', __proto__: { seed: 'x' } } }, rooms: [], links: [], whiteboard: [] },
                t3: { id: 't3', type: 'map', meta: { title: 'C', city: 'a seed' }, rooms: [], links: [], whiteboard: [] }, t4: { id: 't4', type: 'map', meta: { title: 'D', city: ['4471-fox'] }, rooms: [], links: [], whiteboard: [] }, t5: { id: 't5', type: 'map', meta: { title: 'E', city: null }, rooms: [], links: [], whiteboard: [] }, t6: { id: 't6', type: 'map', meta: { title: 'F' }, rooms: [], links: [], whiteboard: [] }, t7: { id: 't7', type: 'map', meta: 'x', rooms: [], links: [], whiteboard: [] },
                t8: { id: 't8', type: 'Board', meta: { title: 'H', city: { seed: 'kept-1', size: 'city', html: '<b>' } }, rooms: [], links: [], whiteboard: [] }, t9: { id: 't9', meta: { title: 'I', city: { seed: '<img src=x onerror=1>', wall: 'none' }, gen: { seed: '4471-fox', w: 30, h: 20, rooms: 'few', corr: 'straight', doors: 'none' } }, whiteboard: [] } });
            const outCt = cleanImport(JSON.parse(jl({ campaigns: { cCt: { id: 'cCt', name: 'G', items: ctItems() } } })), depsC), icCt = { items: ctItems() }; cleanImportItems(icCt, depsC); const icCtN = { items: ctItems() }; cleanImportItems(icCtN, depsL); const icCtO = { items: ctItems() }; cleanImportItems(icCtO, Object.assign({}, depsL, { CITY: { SIZES: CITYc.SIZES } }));
            const icCtB = { items: ctItems() }; cleanImportItems(icCtB, Object.assign({}, depsC, { GEN: GENc }));
            const ctOf = its => ['t1', 't2', 't3', 't4', 't5', 't6', 't8', 't9'].map(k => (its[k] && its[k].meta && 'city' in its[k].meta ? jl(its[k].meta.city) : 'none')), ctDef = { seed: '0000-fox', size: 'town', wall: 'gates', water: 'river', roofs: 'mixed', fields: true };
            const ctWant = [jl({ seed: '4471-fox', size: 'village', wall: 'towers', water: 'coast', roofs: 'thatch', fields: false }), jl(ctDef), 'none', 'none', 'none', 'none', jl(Object.assign({}, ctDef, { seed: 'kept-1', size: 'city' })), jl(Object.assign({}, ctDef, { wall: 'none' }))];
            check('import: the seed and settings a map\'s city was generated from come in as the generator cleans them (a short plain seed and one word of each list, own keys only), on Replace and on Merge; a hostile bag comes in as the first settings with nothing of what it held, and a text, a list or nothing in its place is no key; an item of another type, or of none, is read as the map it will be drawn as and its settings are cleaned alike; with no cleaner on hand (none, or a citycore without one) none comes in at all; the dungeon\'s own settings on the same map are cleaned by their own cleaner beside it; the maps themselves stay, their titles too',
                !!outCt && jl(ctOf(outCt.campaigns.cCt.items)) === jl(ctWant) && jl(ctOf(icCt.items)) === jl(ctWant) && jl(ctOf(icCtN.items)) === jl(Array(8).fill('none')) && jl(ctOf(icCtO.items)) === jl(Array(8).fill('none')) && Object.keys(icCtN.items).length === 9 && icCt.items.t8.type === 'map' && icCt.items.t9.type === 'map' && icCt.items.t1.meta.title === 'A' && !/onerror|<b>/.test(jl(icCt.items))
                && jl(icCtB.items.t9.meta.gen) === jl({ seed: '4471-fox', w: 30, h: 20, rooms: 'few', corr: 'straight', doors: 'none' }) && jl(icCtB.items.t9.meta.city) === ctWant[7] && !('gen' in icCt.items.t9.meta),
                jl([outCt && ctOf(outCt.campaigns.cCt.items), ctOf(icCt.items), ctOf(icCtN.items), ctOf(icCtO.items), icCtB.items.t9.meta]));
            {   // 1.6.0: a map's environment from a file, its own readings and its painted cells, cleaned by fogcore on Replace and on Merge, none without the cleaner
                const evItems = () => ({ e1: { id: 'e1', type: 'map', meta: { title: 'Cold', env: { temp: -30, grav: 'x', 'no key': 1 }, envCells: { '2,3': { temp: 45 }, 'x,y': { temp: 1 }, '4,4': {} } }, rooms: [], links: [], whiteboard: [] },
                    e2: { id: 'e2', type: 'map', meta: { title: 'Odd', env: [1, 2], envCells: 'a cell' }, rooms: [], links: [], whiteboard: [] } });
                const outEv = cleanImport(JSON.parse(jl({ campaigns: { cEv: { id: 'cEv', name: 'E', items: evItems() } } })), depsL), icEv = { items: evItems() }; cleanImportItems(icEv, depsL);
                const icEvN = { items: evItems() }; cleanImportItems(icEvN, Object.assign({}, depsL, { FC: null }));
                const evOf = its => ['e1', 'e2'].map(k => jl([its[k].meta.env, its[k].meta.envCells]));
                const evWant = [jl([{ temp: -30 }, { '2,3': { temp: 45 } }]), jl([undefined, undefined])];
                check('import: a map\'s environment (1.6.0), its own readings and its painted cells, comes in as fogcore cleans it, on Replace and on Merge: a reading only under a plain key and as a finite number, a cell only under a key of the grid\'s own form with at least one such reading, and a list or a text in their place none; with no cleaner on hand none comes in at all',
                    !!outEv && jl(evOf(outEv.campaigns.cEv.items)) === jl(evWant) && jl(evOf(icEv.items)) === jl(evWant) && evOf(icEvN.items).every(x => x === jl([undefined, undefined])), jl([outEv && evOf(outEv.campaigns.cEv.items), evOf(icEv.items), evOf(icEvN.items)]));
            }
            // 1.5.4 (worldcore.js, fold B7): the seed and settings a map's world was generated from, from a file
            const WORLDc = await import(surl('worldcore.js')), depsW = Object.assign({}, depsL, { WORLD: WORLDc });
            const wdGood = { seed: '4471-fox', land: 'continent', size: 'large', mountains: 'many', forests: 'none', rivers: 'few', climate: 'dry', towns: 'names' };
            const wdItems = () => ({ w1: { id: 'w1', type: 'map', meta: { title: 'A', world: Object.assign({}, wdGood) }, rooms: [], links: [], whiteboard: [] }, w2: { id: 'w2', type: 'map', meta: { title: 'B', world: { seed: '<img src=x onerror=1>', land: 'moon', size: 7, mountains: null, forests: ['some'], rivers: 'lots', climate: { a: 1 }, towns: 'yes', html: '<b>', __proto__: { seed: 'x', land: 'islands' } } }, rooms: [], links: [], whiteboard: [] },
                w3: { id: 'w3', type: 'map', meta: { title: 'C', world: 'a seed' }, rooms: [], links: [], whiteboard: [] }, w4: { id: 'w4', type: 'map', meta: { title: 'D', world: ['4471-fox'] }, rooms: [], links: [], whiteboard: [] }, w5: { id: 'w5', type: 'map', meta: { title: 'E', world: null }, rooms: [], links: [], whiteboard: [] }, w6: { id: 'w6', type: 'map', meta: { title: 'F' }, rooms: [], links: [], whiteboard: [] }, w7: { id: 'w7', type: 'map', meta: 'x', rooms: [], links: [], whiteboard: [] },
                w8: { id: 'w8', type: 'Board', meta: { title: 'H', world: { seed: 'kept-1', land: 'islands', html: '<b>' } }, rooms: [], links: [], whiteboard: [] }, w9: { id: 'w9', meta: { title: 'I', world: { seed: 'x'.repeat(25), towns: 'marks' }, city: { seed: '4471-fox', size: 'village', wall: 'towers', water: 'coast', roofs: 'thatch', fields: false }, gen: { seed: '4471-fox', w: 30, h: 20, rooms: 'few', corr: 'straight', doors: 'none' } }, whiteboard: [] },
                wA: { id: 'wA', type: 'map', meta: { title: 'J', world: 7 }, rooms: [], links: [], whiteboard: [] }, wB: { id: 'wB', type: 'map', meta: { title: 'K', world: true }, rooms: [], links: [], whiteboard: [] },
                wC: { id: 'wC', type: 'map', meta: { title: 'L', world: Object.assign(Object.create({ land: 'continent', size: 'large', mountains: 'many', forests: 'none', rivers: 'few', climate: 'dry', towns: 'names' }), { seed: 'own-1' }) }, rooms: [], links: [], whiteboard: [] } });   // owns its seed alone: every other setting is only inherited
            const outWd = cleanImport(JSON.parse(jl({ campaigns: { cWd: { id: 'cWd', name: 'G', items: wdItems() } } })), depsW), icWd = { items: wdItems() }; cleanImportItems(icWd, depsW); const icWdN = { items: wdItems() }; cleanImportItems(icWdN, depsL); const icWdO = { items: wdItems() }; cleanImportItems(icWdO, Object.assign({}, depsL, { WORLD: { LANDS: WORLDc.LANDS } }));
            const icWdB = { items: wdItems() }; cleanImportItems(icWdB, Object.assign({}, depsW, { GEN: GENc, CITY: CITYc }));
            const WK = ['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w8', 'w9', 'wA', 'wB', 'wC'], wdOf = its => WK.map(k => (its[k] && its[k].meta && typeof its[k].meta === 'object' && 'world' in its[k].meta ? jl(its[k].meta.world) : 'none')), wdDef = { seed: '0000-fox', land: 'island', size: 'medium', mountains: 'some', forests: 'some', rivers: 'some', climate: 'mild', towns: 'none' };
            const wdWant = [jl(wdGood), jl(wdDef), 'none', 'none', 'none', 'none', jl(Object.assign({}, wdDef, { seed: 'kept-1', land: 'islands' })), jl(Object.assign({}, wdDef, { towns: 'marks' })), 'none', 'none', jl(Object.assign({}, wdDef, { seed: 'own-1' }))], cuSrcW = readSrc('cleanup.js');
            check('import: the seed and settings a map\'s world was generated from (fold B7) come in as the generator cleans them (a short plain seed and one word of each of the seven lists, own keys only: a bag that owns its seed alone and only inherits the rest comes in as the first settings with that seed), on Replace and on Merge; a hostile bag comes in as the first settings with nothing of what it held, a seed of 25 characters as the first seed, and a text, a list, a number, a truth value or nothing in its place is no key; an item of another type, or of none, is read as the map it will be drawn as and its settings are cleaned alike; with no cleaner on hand (none, or a worldcore without one) none comes in at all; the city\'s and the dungeon\'s own settings on the same map are cleaned by their own cleaners beside it; the maps themselves stay, their titles too; and cleanup.js names the three cleaners in its one line of deps and cleans the three keys in one place',
                !!outWd && jl(wdOf(outWd.campaigns.cWd.items)) === jl(wdWant) && jl(wdOf(icWd.items)) === jl(wdWant) && jl(wdOf(icWdN.items)) === jl(Array(11).fill('none')) && jl(wdOf(icWdO.items)) === jl(Array(11).fill('none')) && Object.keys(icWdN.items).length === 12 && icWd.items.w8.type === 'map' && icWd.items.w9.type === 'map' && icWd.items.w1.meta.title === 'A' && icWd.items.w7.meta === 'x' && !/onerror|<b>/.test(jl(icWd.items))
                && jl(icWdB.items.w9.meta.gen) === jl({ seed: '4471-fox', w: 30, h: 20, rooms: 'few', corr: 'straight', doors: 'none' }) && jl(icWdB.items.w9.meta.city) === jl({ seed: '4471-fox', size: 'village', wall: 'towers', water: 'coast', roofs: 'thatch', fields: false }) && jl(icWdB.items.w9.meta.world) === wdWant[7] && !('gen' in icWd.items.w9.meta) && !('city' in icWd.items.w9.meta)
                && cuSrcW.split('GEN: gencore.js (cleanGen), CITY: citycore.js (cleanCity), WORLD: worldcore.js (cleanWorld) }').length === 2 && cuSrcW.split('it.meta.world').length === 7 && cuSrcW.split('WORLDd.cleanWorld(it.meta.world)').length === 2
                && cuSrcW.indexOf('else delete it.meta.city; }') < cuSrcW.indexOf('else delete it.meta.world; }') && cuSrcW.indexOf('else delete it.meta.world; }') - cuSrcW.indexOf('else delete it.meta.gen; }') < 1200,
                jl([outWd && wdOf(outWd.campaigns.cWd.items), wdOf(icWd.items), wdOf(icWdN.items), wdOf(icWdO.items), icWdB.items.w9.meta, cuSrcW.split('it.meta.world').length]));
            // backlog 125: a pin, the page a piece opens, from a file: a short plain id or nothing (pageshelf.js judges whether it names a page where it is read)
            const pgMap = () => ({ id: 'mPg', type: 'map', meta: { title: 'P' }, rooms: [], links: [], whiteboard: [{ id: 'g1', type: 'image', x: 0, y: 0, w: 50, h: 50, page: 'plan_m3_spine' }, { id: 'g2', type: 'rect', x: 0, y: 0, w: 50, h: 50, page: 'doc.one:2-b' }, { id: 'g3', type: 'rect', x: 0, y: 0, w: 50, h: 50, page: '' },
                { id: 'g4', type: 'rect', x: 0, y: 0, w: 50, h: 50, page: 'has space' }, { id: 'g5', type: 'rect', x: 0, y: 0, w: 50, h: 50, page: '<img src=x onerror=alert(1)>' }, { id: 'g6', type: 'rect', x: 0, y: 0, w: 50, h: 50, page: 'constructor' }, { id: 'g7', type: 'rect', x: 0, y: 0, w: 50, h: 50, page: '__proto__' },
                { id: 'g8', type: 'rect', x: 0, y: 0, w: 50, h: 50, page: 'x'.repeat(81) }, { id: 'g9', type: 'rect', x: 0, y: 0, w: 50, h: 50, page: 7 }, { id: 'g10', type: 'rect', x: 0, y: 0, w: 50, h: 50, page: { id: 'plan' } }, { id: 'g11', type: 'rect', x: 0, y: 0, w: 50, h: 50, page: ['plan'] }, { id: 'g12', type: 'rect', x: 0, y: 0, w: 50, h: 50, page: null }, { id: 'g13', type: 'rect', x: 0, y: 0, w: 50, h: 50 }, { id: 'g14', type: 'image', x: 0, y: 0, w: 50, h: 50, hidden: true, page: 'x'.repeat(80) }] });
            const outPg = cleanImport(JSON.parse(jl({ campaigns: { cPg: { id: 'cPg', name: 'P', items: { mPg: pgMap() } } } })), depsL), icPg = { items: { mPg: pgMap() } }; cleanImportItems(icPg, depsL); const icPgN = { items: { mPg: pgMap() } }; cleanImportItems(icPgN, { DR: DOC, sanitize });
            const pgOf = m => m.whiteboard.map(w => ('page' in w ? w.page : 'none')), pgWant = ['plan_m3_spine', 'doc.one:2-b', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'none', 'x'.repeat(80)];
            check('import: a pin, the page a piece opens, comes in only as a short plain id, on Replace and on Merge, a hidden piece\'s too: an empty word, one with a space or markup in it, a name a prototype holds, one past 80 characters, a number, an object, a list and null do not come in; the rule needs no cleaner on hand; the pieces themselves stay',
                !!outPg && jl(pgOf(outPg.campaigns.cPg.items.mPg)) === jl(pgWant) && jl(pgOf(icPg.items.mPg)) === jl(pgWant) && jl(pgOf(icPgN.items.mPg)) === jl(pgWant) && icPg.items.mPg.whiteboard.length === 14,
                jl([outPg && pgOf(outPg.campaigns.cPg.items.mPg), pgOf(icPg.items.mPg), pgOf(icPgN.items.mPg)]));
            // a portal's own lock (the owner, 2026-10-03): a portal piece's portalLock from a file
            const plMap = () => ({ id: 'mPl', type: 'map', meta: { title: 'P' }, rooms: [{ id: 'r1', name: 'Gate', targetMapId: 'mPl2' }], links: [], whiteboard: [{ id: 'p1', type: 'rect', x: 0, y: 0, w: 50, h: 50, targetMapId: 'mPl2', portalLock: true }, { id: 'p2', type: 'rect', x: 0, y: 0, w: 50, h: 50, targetMapId: 'mPl2', portalLock: 'yes' },
                { id: 'p3', type: 'circle', x: 0, y: 0, w: 50, h: 50, targetMapId: 'mPl2', portalLock: { on: true } }, { id: 'p4', type: 'rect', x: 0, y: 0, w: 50, h: 50, targetMapId: 'mPl2', portalLock: 1 }, { id: 'p5', type: 'rect', x: 0, y: 0, w: 50, h: 50, targetMapId: 'mPl2', portalLock: false }, { id: 'p6', type: 'rect', x: 0, y: 0, w: 50, h: 50, targetMapId: 'mPl2' },
                { id: 'p7', type: 'hexagon', x: 0, y: 0, w: 50, h: 50, nodeId: 'r1', portalLock: true }, { id: 'p8', type: 'rect', x: 0, y: 0, w: 50, h: 50, targetMapId: 'mPl2', hidden: true, trap: true, portalLock: true }, { id: 'p9', type: 'rect', x: 0, y: 0, w: 50, h: 50, targetMapId: 'mPl2', portalLock: 'true' }] });
            const plFile = () => ({ campaigns: { cPl: { id: 'cPl', name: 'P', items: { mPl: plMap(), mPl2: { id: 'mPl2', type: 'map', meta: { title: 'Q' }, rooms: [], links: [], whiteboard: [] } } } } });
            const outPl = cleanImport(JSON.parse(jl(plFile())), depsL), icPl = { items: { mPl: plMap() } }; cleanImportItems(icPl, depsL); const icPlN = { items: { mPl: plMap() } }; cleanImportItems(icPlN, { DR: DOC, sanitize });
            const icPlO = { items: { mPl: plMap() } }; cleanImportItems(icPlO, { DR: DOC, sanitize, FC: { LIMITS: depsL.FC.LIMITS, cleanLight: depsL.FC.cleanLight, cleanBarrier: depsL.FC.cleanBarrier } });   // a core from before the lock: no cleaner for the flag
            const plOf = m => m.whiteboard.map(w => ('portalLock' in w ? w.portalLock : 'none')), plWant = [true, 'none', 'none', 'none', 'none', 'none', true, true, 'none'], p8 = outPl && outPl.campaigns.cPl.items.mPl.whiteboard[7], p7 = icPl.items.mPl.whiteboard[6];
            check('import: a portal\'s own lock (portalLock) comes in only as true, on Replace and on Merge — a direct portal\'s, a node-linked portal\'s and a hidden trap tile\'s, with the portal\'s target, node, trap and hidden marks as they were; a word, a number, an object or false none; with no cleaner on hand (none, or a core without one) none comes in at all; the pieces themselves stay; the cleaner itself (fogcore cleanPortalLock) takes true alone',
                !!outPl && jl(plOf(outPl.campaigns.cPl.items.mPl)) === jl(plWant) && jl(plOf(icPl.items.mPl)) === jl(plWant) && jl(plOf(icPlN.items.mPl)) === jl(Array(9).fill('none')) && jl(plOf(icPlO.items.mPl)) === jl(Array(9).fill('none')) && icPlN.items.mPl.whiteboard.length === 9 && icPlO.items.mPl.whiteboard.length === 9
                && !!p8 && p8.targetMapId === 'mPl2' && p8.trap === true && p8.hidden === true && !!p7 && p7.nodeId === 'r1' && icPlN.items.mPl.whiteboard[0].targetMapId === 'mPl2'
                && jl([true, 1, 'true', 'yes', {}, [], null, undefined, false].map(v => FCr.cleanPortalLock(v))) === jl([true, false, false, false, false, false, false, false, false]), jl([outPl && plOf(outPl.campaigns.cPl.items.mPl), plOf(icPl.items.mPl), plOf(icPlN.items.mPl), plOf(icPlO.items.mPl)]));
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
            && /function importDeps\(\) \{ return \{ migrate: function\(d\) \{ return migrateAppState\(d\)\.data; \}, DR: window\.wpDocRender, sanitize: window\.wpNet && window\.wpNet\.sanitizeRichText, FC: window\.wpFogCore, TF: window\.wpTextFmt, GEN: window\.wpGenCore, CITY: window\.wpCityCore, WORLD: window\.wpWorldCore \}; \}/.test(mainSrc) && /\n    migrateAppState   \/\/ main\.js/.test(ioSrc));
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
        // 1.6.0: a player record's was is every id folded into it. A file's comes in as net.js wasList writes it: a list of plain ids, oldest
        // first, an older build's one id kept as its first, the last 20 alone; anything else goes
        {
            const long = Array.from({ length: 30 }, (x, i) => 'u_w' + i), J3 = JSON.stringify;
            const icW = { items: {}, players: { u_s: { name: 'S', was: 'u_old' }, u_l: { name: 'L', was: long.concat(['bad id!', 7, '__proto__', 'u_w29', '<b>x</b>']) }, u_o: { name: 'O', was: { a: 1 } }, u_e: { name: 'E', was: ['', null] }, u_n: { name: 'N' } } };
            cleanImportItems(icW, deps);
            const p = icW.players, solo = { was: '../x' }; cleanWas(solo);
            check('import: a player record\'s was (1.6.0, every id folded into it) comes in a list of plain ids, oldest first: an older one-id was kept as its first, the last 20 of a long one, markup, a path, a number, a prototype key and a repeat dropped; one that is no list or id, or holds none, goes',
                J3(p.u_s.was) === J3(['u_old']) && J3(p.u_l.was) === J3(long.slice(10)) && !('was' in p.u_o) && !('was' in p.u_e) && !('was' in p.u_n) && !('was' in solo) && p.u_l.name === 'L',
                J3([p, solo]));
        }
        // The owed review, 2026-10-09 (backlog 137). (a) The item cleaners ran only for an item whose type was exactly 'map', 'planner' or 'doc',
        // while the app draws every item that is neither a planner nor a page as a map: a file's 'Map' or 'board' kept its whole play map as
        // written, a text box's markup included, and on Merge an item with no type did too. (b) Merge ran the item cleaners alone, never the
        // load's own normaliser, so a file came in shaped as it was written
        {
            const Jt = JSON.stringify, FCt = await import(surl('fogcore.js')), TFt = await import(surl('textfmt.js')), CCt = await import(surl('calendarcore.js'));
            const migT = new Function('window', 'CATS', 'CURRENT_SCHEMA', 'createNewCampaign', '"use strict";\n' + ioSrc.slice(mi, mk) + '\nreturn function(d) { return migrateAppState(d).data; };')(   // the load's normaliser with the fog and the calendar cores at hand, as the app has them
                { wpSystemCore: S, wpFormula: F, wpLibraryCore: LBC, wpFogCore: FCt, wpCalendarCore: CCt }, { default: { label: 'Default', color: '#ccc' } }, 2, nm => ({ id: 'camp_v0', name: nm, items: {} }));
            const depsT = { migrate: migT, DR: DOC, sanitize, FC: FCt, TF: TFt }, rawFog = () => ({ on: true, mode: 'manual', manual: { adds: 'x', cuts: 7 } });
            const odd = t => { const m = { id: 'm', meta: { title: 'x' }, rooms: [], links: [], fogMarks: [{ c: 1, r: 1, g: 1 }], fogLit: { a: 1 },
                whiteboard: [{ id: 'a', type: 'text', x: 1, y: 1, w: 100, h: 100, text: '<img src=x onerror=alert(1)><b>hello</b><script>x()</script>', portalLock: 'yes', barrier: 1, blastStop: 1, fogHand: 'peek', font: 'x;y', page: { a: 1 } }, { id: 'w', type: 'rect', x: 1, y: 1, w: 10, h: 10, waiting: true }] }; if (t !== undefined) m.type = t; return m; };
            const sum = it => (it ? [it.type, it.whiteboard.length, it.whiteboard[0].text, 'fogMarks' in it, 'fogLit' in it, it.whiteboard[0].portalLock, it.whiteboard[0].barrier, it.whiteboard[0].blastStop, it.whiteboard[0].fogHand, it.whiteboard[0].font, typeof it.whiteboard[0].page] : null);
            const replaced = t => { const o = cleanImport({ activeCampaignId: 'c', campaigns: { c: { id: 'c', name: 'n', activeItemId: 'm', items: { m: odd(t) } } } }, depsT); return o ? sum(o.campaigns.c.items.m) : null; };
            const alone = t => { const ic = { items: { m: odd(t) } }; cleanImportItems(ic, depsT); return sum(ic.items.m); };   // the item cleaners with no normaliser before them
            const base = replaced('map'), types = ['Map', 'MAP', 'board', 'map ', 'folder', 7, true, {}, ['map']], noType = [undefined, null, 0, '', false];
            const sameR = types.concat(noType).map(t => Jt(replaced(t)) === Jt(base)), sameA = types.concat(noType).map(t => Jt(alone(t)) === Jt(base));
            const plain = { items: { p: { id: 'p', blocks: [{ id: 'b', type: 'raw', content: '<b>hi</b><script>x()</script>' }] }, q: { id: 'q', type: 'Planner', blocks: [{ id: 'b', type: 'raw', content: '<i>x</i>' }], whiteboard: [{ id: 't', type: 'text', text: '<script>y()</script>z' }] } } }; cleanImportItems(plain, depsT);
            const loaded = migT({ activeCampaignId: 'c', campaigns: { c: { id: 'c', name: 'n', items: { m: odd('board'), p: { id: 'p', type: 'planner', blocks: [] }, d: { id: 'd', type: 'doc', blocks: [] }, u: { id: 'u', blocks: [] }, k: { id: 'k', type: 'kanban', blocks: [] } } } } }).campaigns.c.items;
            check('import: an item is a page, a planner or a map, as the app draws it (the owed review of 2026-10-09; cleanup.js cleanImportItems and the real load normaliser, run for real): a file\'s item of any other type — another spelling of map, a word of its own, a number, an object — is cleaned as the map it will be drawn as, on Replace and by the item cleaners alone, exactly as an item of the type map is: its text box rebuilt by the sanitiser, a waiting token gone, a player\'s own notes gone, a portal\'s lock, a barrier, its Stops blasts tick, a fog mark, a font and a page link each only as their cleaners keep them; an item with no type is a planner where it holds blocks and a map otherwise; a load reads an unknown type as a map too, and leaves a planner and a page as they are',
                !!base && base[0] === 'map' && base[1] === 1 && typeof base[2] === 'string' && !/[<>]/.test(base[2]) && /hello/.test(base[2]) && base[3] === false && base[4] === false && base[5] === undefined && base[6] === undefined && base[7] === undefined && base[8] === undefined && base[9] === undefined && base[10] === 'undefined'
                && sameR.every(Boolean) && sameA.every(Boolean)
                && plain.items.p.type === 'planner' && !/[<>]/.test(plain.items.p.blocks[0].content) && plain.items.q.type === 'map' && !/[<>]/.test(plain.items.q.whiteboard[0].text)
                && loaded.m.type === 'map' && loaded.p.type === 'planner' && loaded.d.type === 'doc' && loaded.u.type === 'planner' && loaded.k.type === 'map' && Array.isArray(loaded.k.whiteboard),
                Jt([base, sameR, sameA, plain.items.p.type, plain.items.q.type, Object.keys(loaded).map(k => loaded[k].type)]));
            // (b) the import's Merge, main.js mergeAppState sliced and run for real with the real cleanImport
            const mergeSrcT = mainSrc.slice(mainSrc.indexOf('  function mergeAppState(imported) {'), mainSrc.indexOf('var _el_importMergeBtn'));
            const merge = (appState, file, bare) => { const st = { appState };
                const r = new Function('state', 'window', 'cleanImportedItems', 'takeImportedLibrary', 'cleanImport', 'importDeps', mergeSrcT + '\nreturn mergeAppState;')(st, {}, ic => cleanImportItems(ic, depsT), () => {}, bare ? undefined : cleanImport, bare ? undefined : () => depsT)(file);
                return { r, camps: st.appState.campaigns }; };
            const here = () => ({ activeCampaignId: 'c1', campaigns: { c1: { id: 'c1', name: 'Mine', activeItemId: 'm0', items: { m0: { id: 'm0', type: 'map', meta: { title: 'Home' }, rooms: [], links: [], whiteboard: [] } } } } });
            const fileB = () => ({ campaigns: {
                c1: { id: 'c1', items: { m1: { id: 'OTHER', type: 'map', meta: { title: 'In' }, fog: rawFog(), rooms: 'junk', whiteboard: [null, 5, 'x', { id: 'ok', type: 'rect', x: 1, y: 1, w: 5, h: 5 }] }, m2: { whiteboard: [{ id: 't', type: 'text', x: 1, y: 1, w: 9, h: 9, text: '<script>z()</script>kept' }] } } },
                c2: { id: 'c2', name: { a: 1 }, clock: { t: 'x', notes: '<b>' }, uploads: 'junk', items: { n1: { type: 'Map', whiteboard: 'junk' } } } } });
            const mg = merge(here(), fileB()), c1 = mg.camps.c1, c2 = mg.camps.c2, m1 = c1 && c1.items.m1, m2 = c1 && c1.items.m2;
            const named = merge(here(), { campaigns: { c1: { id: 'c1', name: 'Theirs', activeItemId: 'm9', items: { m9: { id: 'm9', type: 'map', meta: { title: 'Nine' } } } } } }).camps.c1;
            const bareM = merge(here(), { campaigns: { c1: { id: 'c1', name: 'Theirs', activeItemId: 'm9', items: { m9: { id: 'm9', type: 'map', meta: { title: 'Nine' } } } } } }, true).camps.c1;
            const nothing = merge(here(), { campaigns: 7 }), nothingAt = Jt(nothing.camps) === Jt(here().campaigns);
            check('import: Merge shapes the file as a load does before anything is merged (the owed review of 2026-10-09; main.js mergeAppState, sliced and run for real with the real cleanImport): an item takes the id of its key, a missing type is read, rooms and a play map that are no list become lists, a piece that is no object is dropped, a map\'s own fog is cleaned, a text box of an item that had no type is rebuilt by the sanitiser, once; a new campaign gets a name where the file\'s was no text, and loses a clock and uploads that do not clean; what the normaliser fills in is no word of the file\'s — a campaign already here keeps its own name and its own open item where the file named none, and takes them where the file did; a file that holds nothing merges nothing; run with no cleaner at hand the merge takes the file as it says, as the suites that run it alone expect',
                Jt(mg.r) === Jt({ added: 2, updated: 0, newCamps: 1 }) && !!m1 && m1.id === 'm1' && Array.isArray(m1.rooms) && m1.rooms.length === 0 && m1.whiteboard.length === 1 && m1.whiteboard[0].id === 'ok' && Jt(m1.fog) === Jt(FCt.cleanFog(rawFog()) || undefined) && Jt(m1.fog) !== Jt(rawFog())
                && !!m2 && m2.type === 'map' && m2.id === 'm2' && m2.whiteboard[0].text === sanitize('<script>z()</script>kept') && !/[<>]/.test(m2.whiteboard[0].text) && c1.name === 'Mine' && c1.activeItemId === 'm0'
                && !!c2 && c2.name === 'Campaign' && c2.items.n1.type === 'map' && Array.isArray(c2.items.n1.whiteboard) && Jt(c2.clock) === Jt(CCt.cleanClock({ t: 'x', notes: '<b>' }) || undefined) && Jt(c2.clock) !== Jt({ t: 'x', notes: '<b>' }) && c2.uploads === undefined
                && named.name === 'Theirs' && named.activeItemId === 'm9' && bareM.name === 'Theirs' && bareM.activeItemId === 'm9' && Jt(nothing.r) === Jt({ added: 0, updated: 0, newCamps: 0 }) && nothingAt
                && mainSrc.includes("          imported = cleanImport(imported, importDeps());\n") && mainSrc.includes("          if (nameM) existing.name = nameM;") && mainSrc.includes("          if (openM && Object.prototype.hasOwnProperty.call(existing.items, openM)) existing.activeItemId = openM;"),
                Jt([mg.r, m1 && [m1.id, m1.rooms, m1.whiteboard.length, m1.fog], m2 && [m2.type, m2.whiteboard[0].text], c1 && [c1.name, c1.activeItemId], c2 && [c2.name, c2.items.n1.type, c2.clock, c2.uploads], [named.name, named.activeItemId], [bareM.name, bareM.activeItemId], nothing.r, nothingAt]));
            // The review of the fold's own fixes, 2026-10-09. A Merge file is a PART of a campaign, and the normaliser judged it as a whole save: an
            // item whose parent was not in the file came in un-nested, a file's campaign landed under its key and not in the campaign its id names,
            // the open item a file named was replaced by the file's first item, and a new campaign's one-time notice of who was bound to which
            // character was lost
            const nestHere = () => ({ activeCampaignId: 'c1', campaigns: { c1: { id: 'c1', name: 'Mine', activeItemId: 'top', items: {
                top: { id: 'top', type: 'map', meta: { title: 'Top' }, rooms: [], links: [], whiteboard: [] }, sub: { id: 'sub', type: 'map', meta: { title: 'Sub', parentId: 'top' }, rooms: [], links: [], whiteboard: [] },
                plan: { id: 'plan', type: 'planner', meta: { title: 'Plan' }, blocks: [] }, a: { id: 'a', type: 'map', meta: { title: 'A', parentId: 'b' }, rooms: [], links: [], whiteboard: [] }, b: { id: 'b', type: 'map', meta: { title: 'B' }, rooms: [], links: [], whiteboard: [] } } } } });
            const mapIn = (id, parent) => ({ id, type: 'map', meta: parent === undefined ? { title: id } : { title: id, parentId: parent } });
            const nestOf = items => { const g = merge(nestHere(), { campaigns: { c1: { id: 'c1', items } } }).camps.c1.items, o = {}; Object.keys(items).forEach(k => { o[k] = (g[k] && g[k].meta && g[k].meta.parentId) || ''; }); return o; };
            const nest = [nestOf({ sub: mapIn('sub', 'top') }), nestOf({ fresh: mapIn('fresh', 'top') }), nestOf({ x: mapIn('x', 'plan') }), nestOf({ x: mapIn('x', 'gone') }), nestOf({ x: mapIn('x', 'x') }), nestOf({ b: mapIn('b', 'a') }),
                nestOf({ p: mapIn('p'), q: mapIn('q', 'p') }), nestOf({ x: mapIn('x', '__proto__') }), nestOf({ x: mapIn('x', 'top'), y: mapIn('y', 'x') }), nestOf({ x: mapIn('x', 'top'), top: { id: 'top', type: 'planner', meta: { title: 'T2' }, blocks: [] } })];
            const loops = [nestOf({ d: mapIn('d', 'b'), b: mapIn('b', 'a') }), nestOf({ b: mapIn('b', 'a'), d: mapIn('d', 'b') }), nestOf({ e: mapIn('e', 'd'), d: mapIn('d', 'b'), b: mapIn('b', 'a') })];   // b under a closes a loop with what is here (a is under b): b lets go, and what hangs under b keeps its place
            const keyed = merge(nestHere(), { campaigns: { cX: { id: 'c1', name: 'Mine', items: { n: mapIn('n') } }, cY: { id: '__proto__', items: { z: mapIn('z') } }, cZ: { items: { z: mapIn('z') } }, cW: { id: 'c1', items: { w: mapIn('w') } } } });
            const opens = [['sub', { n: mapIn('n') }], ['nowhere', { n: mapIn('n') }], ['n', { n: mapIn('n') }], [undefined, { n: mapIn('n') }]].map(p => merge(nestHere(), { campaigns: { c1: Object.assign({ id: 'c1', items: p[1] }, p[0] === undefined ? {} : { activeItemId: p[0] }) } }).camps.c1.activeItemId);
            const bindFile = { campaigns: { c7: { id: 'c7', name: 'New', items: { n: mapIn('n') } }, c1: { id: 'c1', items: { n: mapIn('n') } } } }, noted = [], st7 = { appState: nestHere() };
            new Function('state', 'window', 'cleanImportedItems', 'takeImportedLibrary', 'cleanImport', 'importDeps', mergeSrcT + '\nreturn mergeAppState;')(st7, { wpTakeBindNotes: () => [{ camp: bindFile.campaigns.c7, r: { bound: 1, linked: 1 } }, { camp: bindFile.campaigns.c1, r: { bound: 2, linked: 0 } }, null], wpNoteBindings: l => { noted.push(l.map(n => n.camp.id + ':' + n.r.bound)); } }, ic => cleanImportItems(ic, depsT), () => {}, cleanImport, () => depsT)(bindFile);
            check('import: a Merge file is a part of a campaign (the review of the fold\'s own fixes, 2026-10-09; main.js mergeAppState, sliced and run for real with the real cleanImport): an item whose parent is not in the file but is here, and of its kind, keeps its place under it, an item already here and a new one alike; a parent of another kind, one that is nowhere, the item itself and a name a prototype holds nest nothing; a nesting that would close a loop with what is here is let go, and only that one, whatever the order of the file\'s items: what hangs under the loop keeps its place; a parent that is in the file is judged with the file, as ever, and a nesting the file itself rules out is not put back from what is here; a file\'s campaign lands in the campaign its id names whatever its key, one with no id or a prototype\'s name for one is left out, and a second of the same id too; the open item is the one the file named where it is here, never the first item the normaliser fell back to; and a campaign that comes in new has the normaliser\'s one-time notice of who was bound said for it, once, and for no campaign already here',
                Jt(nest) === Jt([{ sub: 'top' }, { fresh: 'top' }, { x: '' }, { x: '' }, { x: '' }, { b: '' }, { p: '', q: 'p' }, { x: '' }, { x: 'top', y: 'x' }, { x: '', top: '' }])
                && Jt(loops) === Jt([{ d: 'b', b: '' }, { b: '', d: 'b' }, { e: 'd', d: 'b', b: '' }])
                && Jt(keyed.r) === Jt({ added: 1, updated: 0, newCamps: 0 }) && Jt(Object.keys(keyed.camps)) === Jt(['c1']) && !!keyed.camps.c1.items.n && !keyed.camps.c1.items.z && !keyed.camps.c1.items.w
                && Jt(opens) === Jt(['sub', 'top', 'n', 'top']) && Jt(noted) === Jt([['c7:1']]) && !!st7.appState.campaigns.c7
                && ioSrc.includes("  window.wpTakeBindNotes = function() { var n = _bindNotes; _bindNotes = []; return n; };") && mainSrc.includes("          if (typeof window.wpTakeBindNotes === 'function') bindsM = window.wpTakeBindNotes() || [];"), Jt([nest, keyed.r, Object.keys(keyed.camps), opens, noted]));
            // backlog 152, fold 1 (the fight clock): a file's Waits in a fight, In a fight and Ask me first (the system's time rules) and the clock's
            // top, lived and rulesOff (the GM's own) come in cleaned, on Replace by the load's own normaliser and on Merge by the same cleaners: a
            // campaign that is new takes the file's clock cleaned, a campaign already here keeps its own clock and takes the file's system cleaned
            {
                const fsys = () => ({ v: 1, name: 'Fc', fields: [{ id: 'f_fp', key: 'FP', label: 'F', kind: 'resource', maxFormula: '10', vis: 'all' }], combat: { turn: { secs: 1 } }, rolls: [
                    { id: 'r_dr', label: 'Drain', apply: [{ f: 'f_fp', formula: '1' }], every: { n: 1, u: 'hour', wait: true, rest: 'no' }, inFight: { n: 1, u: 'min', fresh: true, x: '<b>' }, ask: true },
                    { id: 'r_w2', label: 'W', apply: [{ f: 'f_fp', formula: '1' }], every: { n: 1, u: 'hour', wait: 'yes' }, inFight: { n: 0, u: 'round' }, ask: 1 },
                    { id: 'r_rd', label: 'R', apply: [{ f: 'f_fp', formula: '1' }], every: { n: 2, u: 'round' }, inFight: { n: 2, u: 'Round' }, ask: true },
                    { id: 'r_ch', label: 'C', apply: [{ f: 'f_fp', formula: '1', add: true }], inFight: { n: 4, u: 'round' } }] });
                const fclock = () => JSON.parse('{"t": 100, "top": {"s": 150, "ms": 500, "x": 1}, "lived": {"c_a": [160, 250], "c_b": [140, 0], "c_c": "x", "c_d": [150, 500], "__proto__": [200, 0]}, "rulesOff": ["c_n", "c_n", "<b>", 5, "c_m", "__proto__"], "acc": {"c_a": {"r_dr": 30, "x_dr": 20}}}');
                const rowsW = s => s && Array.isArray(s.rolls) ? s.rolls.map(r => [r.id, r.every || null, r.inFight || null, 'ask' in r ? r.ask : null]) : null;
                const wantR = Jt([['r_dr', { n: 1, u: 'hour', wait: true }, { n: 1, u: 'min', fresh: true }, true], ['r_w2', { n: 1, u: 'hour' }, null, null], ['r_rd', null, null, null], ['r_ch', null, { n: 4, u: 'round' }, null]]);
                const wantC = Jt({ t: 100, acc: { c_a: { r_dr: 30, x_dr: 20 } }, top: { s: 150, ms: 500 }, lived: { c_a: [160, 250] }, rulesOff: ['c_n', 'c_m'] });
                const outW = cleanImport({ activeCampaignId: 'cF', campaigns: { cF: { id: 'cF', name: 'F', items: {}, system: fsys(), clock: fclock() } } }, depsT);
                const mergeW = (appState, f) => { const st = { appState }; const r = new Function('state', 'window', 'cleanImportedItems', 'takeImportedLibrary', 'cleanImport', 'importDeps', mergeSrcT + '\nreturn mergeAppState;')(st, { wpSystemCore: S, wpFormula: F }, ic => cleanImportItems(ic, depsT), () => {}, cleanImport, () => depsT)(f); return { r, camps: st.appState.campaigns }; };
                const ownClock = { t: 10, lived: { c_a: [20, 0] }, rulesOff: ['c_q'] }, hereW = () => ({ activeCampaignId: 'c1', campaigns: { c1: { id: 'c1', name: 'Mine', activeItemId: 'm0', clock: JSON.parse(Jt(ownClock)), items: { m0: { id: 'm0', type: 'map', meta: { title: 'Home' }, rooms: [], links: [], whiteboard: [] } } } } });
                const mgW = mergeW(hereW(), { campaigns: { c1: { id: 'c1', items: {}, system: fsys(), clock: fclock() }, c3: { id: 'c3', name: 'New', items: {}, system: fsys(), clock: fclock() } } });
                check('152 fold 1 import: a file\'s time rules and clock come in cleaned (the real load normaliser and main.js mergeAppState, run for real with the real cores): Waits in a fight and Each fight starts again only as true, a round never By the clock\'s, In a fight only by the units it takes, Ask me first only as true and only beside one of the two; the clock\'s top only as a pair past its time, each character\'s own time only past top, the NPCs whose rules are off by id each once, never a prototype\'s name; on Replace, and on Merge for a new campaign, while a campaign already here keeps its own clock and takes the file\'s system cleaned',
                    !!outW && Jt(rowsW(outW.campaigns.cF.system)) === wantR && Jt(outW.campaigns.cF.clock) === wantC
                    && Jt(mgW.r) === Jt({ added: 0, updated: 0, newCamps: 1 }) && Jt(rowsW(mgW.camps.c1.system)) === wantR && Jt(mgW.camps.c1.clock) === Jt(ownClock) && !!mgW.camps.c3 && Jt(rowsW(mgW.camps.c3.system)) === wantR && Jt(mgW.camps.c3.clock) === wantC && ({}).s === undefined,
                    Jt([outW && rowsW(outW.campaigns.cF.system), outW && outW.campaigns.cF.clock, mgW.r, rowsW(mgW.camps.c1.system), mgW.camps.c1.clock, mgW.camps.c3 && mgW.camps.c3.clock]));
            }
        }
        /* ---- Import Replace says who it bound (a found fault of 1.5.4: a file from before player ids was bound by the normaliser on Replace, and
           nothing was said, while a Merge and a load say it once; the binding is saved with the file, so no later load says it either). main.js's
           Replace handler, sliced and run for real on a page of plain objects ---- */
        {
            const replR = mainSrc.slice(mainSrc.indexOf("_el_importReplaceBtn.addEventListener('click'"), mainSrc.indexOf('var _el_importCancelBtn')), Jr = JSON.stringify;
            const runR = o => {
                const out = { order: [], noted: [], nothing: 0, threw: '' }, c1 = { id: 'c1', name: 'One' }, c2 = { id: 'c2', name: 'Two' }, cleanR = o.empty ? null : { campaigns: { c1, c2 }, activeCampaignId: 'c1' }, st = { appState: { campaigns: {} } };
                const win = { wpTakeBindNotes: () => { out.order.push('take'); return o.notes ? [{ camp: c1, r: { bound: 2, linked: 1 } }, null, { camp: c2, r: { bound: 1, linked: 0 } }, { camp: c2 }] : []; },
                    wpNoteBindings: l => { out.order.push('note'); out.noted.push(l.map(n => n.camp.id + ':' + n.r.bound)); out.liveThen = st.appState === cleanR; } };
                if (o.decline) win.wpConfirmCampaignSwitch = () => {};   // the GM keeps the session: nothing is replaced
                if (o.bare) { delete win.wpTakeBindNotes; delete win.wpNoteBindings; }
                let handler = null;
                try {
                    new Function('_el_importReplaceBtn', 'pendingImport', 'cleanImport', 'importDeps', 'importNothing', 'window', 'state', 'takeImportedLibrary', 'finishImport', replR)(
                        { addEventListener: (k, h) => { if (k === 'click') handler = h; } }, { campaigns: {} }, () => { out.order.push('clean'); return cleanR; }, () => ({}), () => { out.nothing++; }, win, st, () => {}, m => { out.order.push('finish:' + m); });
                    handler();
                } catch (e) { out.threw = String(e && e.message); }
                return out;
            };
            const rN = replR ? runR({ notes: true }) : null, rNone = replR ? runR({}) : null, rDecl = replR ? runR({ notes: true, decline: true }) : null, rEmpty = replR ? runR({ notes: true, empty: true }) : null, rBare = replR ? runR({ notes: true, bare: true }) : null;
            check('import: Replace says who it bound, as a Merge and a load do (main.js\'s Replace handler, sliced and run for real): what the normaliser bound in the file is taken once the file has cleaned and said once the file is the live state, before the import is finished and saved, so its Session Log lines are saved with it; an entry that is no binding is passed over; a file that binds nobody says nothing; a Replace the GM declines while hosting says nothing; a file that cleans to nothing takes nothing; and with no notice at hand it imports as before',
                !!rN && Jr(rN) === Jr({ order: ['clean', 'take', 'note', 'finish:Imported (replaced all data).'], noted: [['c1:2', 'c2:1']], nothing: 0, threw: '', liveThen: true })
                && Jr(rNone) === Jr({ order: ['clean', 'take', 'finish:Imported (replaced all data).'], noted: [], nothing: 0, threw: '' })
                && Jr(rDecl) === Jr({ order: ['clean', 'take'], noted: [], nothing: 0, threw: '' }) && Jr(rEmpty) === Jr({ order: ['clean'], noted: [], nothing: 1, threw: '' })
                && Jr(rBare) === Jr({ order: ['clean', 'finish:Imported (replaced all data).'], noted: [], nothing: 0, threw: '' }), Jr([rN, rNone, rDecl, rEmpty, rBare]));
        }
        /* ---- fold B5: a secret door (the map builder; the owner, by prompt: players see "The wall's look (Recommended)" where a secret door stands
           until it is found, and it is found by "A row, and opening it (Recommended)"). A file's tick (a piece's secret) and the look named for it
           (seenColor, seenTexture) through the real import: on Replace (cleanImport: the load's own normaliser, then the item cleaners), on Merge
           (cleanImportItems alone, as main.js runs it where the whole file has no cleaner) and through main.js mergeAppState itself ---- */
        {
            const FCs = await import(surl('fogcore.js')), Js = JSON.stringify, SEC = ['secret', 'seenColor', 'seenTexture'], depsS = { migrate, DR: DOC, sanitize, FC: FCs };
            const SD = () => ({ blocksSight: true, sightType: 'door' }), LOOK = () => ({ seenColor: '#112233', seenTexture: 'bricks' });   // a wall's door; a look that is kept beside a tick
            const pc = (id, extra) => Object.assign({ id, type: 'rect', x: 100, y: 150, w: 50, h: 50, z: 10, layer: 'middle', color: '#7a5230' }, extra);
            const NOTICK = ['yes', 'true', 'TRUE', 1, 0, 2, {}, { on: true }, [], [true], null, false], KEPT = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8'];
            const sdBoard = () => clone([
                // the tick comes in: a wall's door (open, locked, named, grouped, patterned, turned, pinned to a page), a see-through barrier's door, a door
                // drawn as a line, a hidden door, a filled region, a circle, a painted hex cell and a diamond that are doors
                pc('a1', Object.assign(SD(), { secret: true, doorOpen: true, doorLock: true, name: 'Door', groupId: 'g_7', texture: 'planks', rot: 90, locked: true, height: 3, page: 'plan_1' })),
                pc('a2', { barrier: true, blastStop: true, sightType: 'door', secret: true, doorOpen: true, color: 'transparent' }),
                { id: 'a3', type: 'path', x: 300, y: 100, w: 100, h: 6, baseW: 100, baseH: 6, z: 10, pts: [[0, 3], [100, 3]], strokeWidth: 6, tip: 'square', color: '#8a5a2b', layer: 'back-mid', name: 'Door', blocksSight: true, sightType: 'door', secret: true, doorLock: true },
                pc('a4', Object.assign(SD(), { hidden: true, secret: true, doorOpen: true })),
                { id: 'a5', type: 'path', tip: 'fill', x: 0, y: 0, w: 50, h: 50, z: 10, pts: [[0, 0], [50, 0], [50, 50]], color: '#555555', blocksSight: true, sightType: 'door', doorOpen: false, secret: true },
                Object.assign(pc('a6', SD()), { type: 'circle', secret: true }),
                Object.assign(pc('a7', SD()), { type: 'hexagon', w: 60, h: 52, fill: true, doorOpen: 1, secret: true }),
                Object.assign(pc('a8', { barrier: true, sightType: 'door', doorLock: true, secret: true }), { type: 'diamond' })
            ].concat(
                // no tick: a word, a number, an object, a list, nothing or false on a wall's door that stands open and locked, each with a look named beside it
                NOTICK.map((v, i) => pc('v' + (i + 1), Object.assign(SD(), { secret: v, doorOpen: true, doorLock: true }, LOOK()))),
                [
                    // no tick: true on a piece that may not be a secret door, each with a look named beside it. In their order: a wall, a wall with no
                    // type named, a plain piece, a piece typed a door that is neither a wall nor a barrier, a picture that is a door, a token, a GM-note
                    // card, a GM-note card that is a box, a barrier flag that is no true, a wall flag that is no true, another spelling of the type,
                    // and a waiting token, which no import keeps at all
                    pc('n1', Object.assign({ blocksSight: true, sightType: 'wall', secret: true }, LOOK())),
                    pc('n2', Object.assign({ blocksSight: true, secret: true }, LOOK())),
                    pc('n3', Object.assign({ secret: true }, LOOK())),
                    pc('n4', Object.assign({ sightType: 'door', doorOpen: true, secret: true }, LOOK())),
                    Object.assign(pc('n5', SD()), { type: 'image', src: '/saves/images/m/door.png', doorOpen: true, doorLock: true, secret: true }, LOOK()),
                    Object.assign(pc('n6', SD()), { type: 'circle', isChar: true, charName: 'Mimic', doorOpen: true, secret: true }, LOOK()),
                    Object.assign(pc('n7', SD()), { type: 'text', text: 'A note', gmNoteFor: 'r1', secret: true }, LOOK()),
                    pc('n8', Object.assign(SD(), { gmNoteFor: 'r1', doorOpen: true, secret: true }, LOOK())),
                    pc('n9', Object.assign({ barrier: 'yes', sightType: 'door', doorOpen: true, secret: true }, LOOK())),
                    pc('n10', Object.assign({ blocksSight: 1, sightType: 'door', doorOpen: true, secret: true }, LOOK())),
                    pc('n11', Object.assign({ blocksSight: true, sightType: 'Door', doorOpen: true, secret: true }, LOOK())),
                    pc('w1', Object.assign(SD(), { waiting: true, ownerId: 'u_p', secret: true }, LOOK())),
                    // no tick named: the look alone, on a door that was found and on two plain pieces
                    pc('f1', Object.assign(SD(), { doorOpen: true, seenColor: '#445566', seenTexture: 'stone' })), pc('f2', { seenColor: '#445566' }), pc('f3', { seenTexture: '' }),
                    // none of the three: a plain piece, and an ordinary door that stands open and locked
                    pc('p1'), pc('p2', Object.assign(SD(), { doorOpen: true, doorLock: true }))
                ]));
            const SD_IDS = KEPT.concat(NOTICK.map((v, i) => 'v' + (i + 1)), ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'n9', 'n10', 'n11', 'f1', 'f2', 'f3', 'p1', 'p2']);   // every piece but the waiting token
            const sdMap = () => ({ id: 'mSd', type: 'map', meta: { title: 'S' }, rooms: [], links: [], whiteboard: sdBoard() });
            const fileOf = m => ({ campaigns: { cSd: { id: 'cSd', name: 'S', items: { mSd: m } } } });
            const repl = (mf, d) => { const o = cleanImport(JSON.parse(Js(fileOf(mf()))), d); return (o && o.campaigns && o.campaigns.cSd && o.campaigns.cSd.items && o.campaigns.cSd.items.mSd) || null; };   // Replace
            const merg = (mf, d) => { const ic = { items: { mSd: mf() } }; cleanImportItems(ic, d); return ic.items.mSd || null; };   // Merge: the item cleaners alone
            const wbOf = m => (m && Array.isArray(m.whiteboard) ? m.whiteboard : []), idsOf = m => wbOf(m).map(w => w.id), byId = (m, id) => wbOf(m).find(w => w.id === id) || null;
            const secOf = m => wbOf(m).map(w => SEC.map(k => (k in w ? w[k] : 'none')));
            const miss = (m, want) => { const ids = idsOf(m); return secOf(m).map((g, i) => (Js(g) === Js(want[i]) ? null : ids[i] + '=' + Js(g))).filter(Boolean).concat(ids.length === want.length ? [] : ['count ' + ids.length + ' of ' + want.length]); };
            const less = (w, ks) => { const o = {}; Object.keys(w || {}).forEach(k => { if (ks.indexOf(k) < 0) o[k] = w[k]; }); return o; };
            const bare = mf => () => { const m = mf(); m.whiteboard.forEach(w => SEC.forEach(k => { delete w[k]; })); return m; };   // the same file with none of the three keys
            // a fogcore that holds only some of the secret door's functions, with every cleaner the files' other keys need
            const core = ks => { const o = { LIMITS: FCs.LIMITS, cleanLight: FCs.cleanLight, cleanBarrier: FCs.cleanBarrier, cleanBlastStop: FCs.cleanBlastStop, cleanTexture: FCs.cleanTexture, cleanHeight: FCs.cleanHeight, isDoor: FCs.isDoor }; ks.forEach(k => { o[k] = FCs[k]; }); return { DR: DOC, sanitize, FC: o }; };

            // 1. the tick
            const rSd = repl(sdMap, depsS), mSd = merg(sdMap, depsS), inSd = sdMap(), wantTick = SD_IDS.map(id => (KEPT.indexOf(id) >= 0 ? [true, 'none', 'none'] : ['none', 'none', 'none'])), wantSec = SD_IDS.map(id => (KEPT.indexOf(id) >= 0 ? [true, 'none', 'none'] : /^v\d+$/.test(id) ? ['none', '#112233', 'bricks'] : id === 'f1' ? ['none', '#445566', 'stone'] : ['none', 'none', 'none']));   // wantTick: the ticks alone, as a core with no cleaner for the look brings them in
            const keptAsIs = m => KEPT.every(id => Js(byId(m, id)) === Js(less(byId(inSd, id), ['doorOpen'])));   // shut, and every other key as the file had it, in the file's order
            const vDoors = m => wbOf(m).filter(w => /^v\d+$/.test(w.id));
            const stillOpen = m => vDoors(m).length === NOTICK.length && vDoors(m).every(w => w.doorOpen === true && w.doorLock === true && w.sightType === 'door' && w.blocksSight === true) && ['n4', 'n5', 'n6', 'n8', 'n9', 'n10', 'n11', 'f1', 'p2'].every(id => !!byId(m, id) && byId(m, id).doorOpen === true);
            const judged = m => wbOf(m).length > 0 && wbOf(m).every(w => ('secret' in w) === FCs.secretOn(w) && (!('secret' in w) || w.secret === true));
            check('import: a secret door\'s tick (the map builder, fold B5) comes in only as true and only on a piece that may be one, on Replace and on Merge alike, piece for piece: a wall\'s door, a see-through barrier\'s door, a door drawn as a line, a hidden door, and a filled region, a circle, a painted hex cell and a diamond that are doors; each is then shut (no doorOpen, whatever the file said) and keeps its lock, its type and every other key as the file had it, in the file\'s order; a word, a number, an object, a list, nothing or false is no tick, and such a door stays as open and as locked as the file had it and keeps the look named beside it, as a door that was found does; a wall, a plain piece, a piece typed a door that is neither a wall nor a barrier, a picture that is a door, a token, a GM-note card, a piece whose wall or barrier flag is no true and another spelling of the type take no tick; a waiting token does not come in at all; what came in with a tick is exactly what the one judge (fogcore secretOn) reads as a secret door; the cleaner itself (fogcore cleanSecret) takes true alone',
                !!rSd && !!mSd && Js(idsOf(rSd)) === Js(SD_IDS) && Js(idsOf(mSd)) === Js(SD_IDS) && Js(secOf(rSd)) === Js(wantSec) && Js(secOf(mSd)) === Js(wantSec)
                && keptAsIs(rSd) && keptAsIs(mSd) && !KEPT.some(id => 'doorOpen' in byId(rSd, id) || 'doorOpen' in byId(mSd, id)) && stillOpen(rSd) && stillOpen(mSd) && judged(rSd) && judged(mSd) && Js(wbOf(rSd)) === Js(wbOf(mSd))
                && [rSd, mSd].every(m => byId(m, 'a1').doorLock === true && byId(m, 'a3').doorLock === true && byId(m, 'a8').doorLock === true && byId(m, 'a4').hidden === true && byId(m, 'a2').barrier === true && byId(m, 'a2').blastStop === true && byId(m, 'a3').type === 'path' && byId(m, 'a5').tip === 'fill' && byId(m, 'a1').sightType === 'door')
                && Js([true, 1, 'true', 'yes', {}, [], null, undefined, false, 0].map(v => FCs.cleanSecret(v))) === Js([true, false, false, false, false, false, false, false, false, false]),
                Js([miss(rSd, wantSec), miss(mSd, wantSec), [rSd, mSd].map(m => [keptAsIs(m), stillOpen(m), judged(m)]), Js(wbOf(rSd)) === Js(wbOf(mSd))]));

            // 2. the look named for it
            const NAMES = ['flagstones', 'bricks', 'cobbles', 'planks', 'stone', 'hatching', 'ripples', 'grass', 'shingles', 'pantiles', 'slates', 'thatch', 'forest', 'mountains', 'sand', 'snow'];   // the app's own sixteen, written out: the list itself is fogcheck's to hold
            const COLS = [['#AbCdEf', '#abcdef'], ['#3f3b47', '#3f3b47'], ['#000000', '#000000'], ['#FFFFFF', '#ffffff'], ['red'], ['#abc'], ['#abcd'], ['#abcdef0'], ['#abcdef80'], ['#abcdeg'], ['abcdef'], [' #abcdef'], ['#abcdef '], ['#abcdef\n'], ['rgb(1,2,3)'], ['rgb(1, 2, 3)'], ['hsl(0, 0%, 50%)'],
                ['url(https://x.test/a.png)'], ['var(--panel2)'], ['transparent', 'transparent'], ['#abcdef;background:url(https://x.test/a.png)'], [''], [{ r: 1 }], [['#abcdef']], [11259375], [true], [false], [null],
                ['Transparent'], ['TRANSPARENT'], [' transparent'], ['transparent '], ['transparent\n'], ['#00000000'], ['#0000'], ['rgba(0,0,0,0)'], ['rgba(0, 0, 0, 0)'], ['hsla(0, 0%, 0%, 0)'], [['transparent']]];   // a value, and what it comes in as (nothing: it does not come in). Match a wall, round two: the exact word transparent comes in, and no other spelling of a colour that draws nothing
            const TEXS = [['', '']].concat(NAMES.map(n => [n, n]), [['Bricks'], ['BRICKS'], ['Forest'], ['SNOW'], [' bricks'], ['bricks '], ['bricks\n'], ['brick'], ['/saves/images/m/wall.png'], ['https://x.test/a.png'], ['url(x)'], ['__proto__'], ['constructor'], ['length'], [' '], [{}], [{ name: 'bricks' }], [['bricks']], [0], [1], [true], [false], [null]]);
            const lkBoard = () => clone([].concat(
                COLS.map((c, i) => pc('c' + (i + 1), Object.assign(SD(), { secret: true, doorOpen: true, seenColor: c[0] }))),
                TEXS.map((t, i) => pc('t' + (i + 1), Object.assign(SD(), { secret: true, seenTexture: t[0] }))),
                [pc('b1', Object.assign(SD(), { secret: true, seenColor: '#ABCDEF', seenTexture: 'grass' })), pc('b2', Object.assign(SD(), { secret: true, seenColor: 'red', seenTexture: 'stone' })), pc('b3', Object.assign(SD(), { secret: true, seenColor: '#010203', seenTexture: 'Stone' })),
                    pc('b4', { barrier: true, sightType: 'door', secret: true, seenColor: '#0a0B0c', seenTexture: '' }), pc('b5', Object.assign(SD(), { hidden: true, secret: true, seenColor: '#445566', seenTexture: 'ripples' }))]));
            const lkMap = () => ({ id: 'mSd', type: 'map', meta: { title: 'L' }, rooms: [], links: [], whiteboard: lkBoard() }), LK_IDS = lkBoard().map(w => w.id);
            const wantLk = [].concat(COLS.map(c => [true, c.length > 1 ? c[1] : 'none', 'none']), TEXS.map(t => [true, 'none', t.length > 1 ? t[1] : 'none']), [[true, '#abcdef', 'grass'], [true, 'none', 'stone'], [true, '#010203', 'none'], [true, '#0a0b0c', ''], [true, '#445566', 'ripples']]);
            const rLk = repl(lkMap, depsS), mLk = merg(lkMap, depsS), tLk = merg(lkMap, core(['cleanSecret', 'secretOk'])), cLk = merg(lkMap, core(['cleanSecret', 'secretOk', 'cleanSeenColor'])), xLk = merg(lkMap, core(['cleanSecret', 'secretOk', 'cleanSeenTexture']));
            const colSaid = Js(COLS.map(c => FCs.cleanSeenColor(c[0])).concat([FCs.cleanSeenColor(undefined)])) === Js(COLS.map(c => (c.length > 1 ? c[1] : null)).concat([null]));
            const colStrict = COLS.every(c => FCs.cleanSeenColor(c[0]) === (c.length > 1 ? c[1] : null)) && FCs.cleanSeenColor(undefined) === null;   // each answer itself and not as JSON writes it: the lower-cased hex or the very word back, and null for everything else
            const texSaid = Js(TEXS.map(t => FCs.cleanSeenTexture(t[0])).concat([FCs.cleanSeenTexture(undefined)])) === Js(TEXS.map(t => (t.length > 1 ? t[1] : null)).concat([null]));
            check('import: the look named for a secret door comes in only on a door that may be one, beside its tick or without it, on Replace and on Merge alike, piece for piece, a see-through barrier\'s door\'s and a hidden door\'s too: seenColor only as #rrggbb, lower-cased, or as the exact word transparent (Match a wall, round two: a door matched to a see-through wall is seen as nothing drawn), so a colour word, a short hex, a hex of seven or eight digits, one with a space or a line break beside it, rgb(), hsl(), a url, a variable, the word transparent in another case, with a space or a line break beside it or inside a list, another spelling of a colour that draws nothing (#00000000, #0000, rgba() and hsla() with an alpha of 0), a colour with a declaration after it, an empty text, an object, a list, a number, true, false and nothing are dropped; seenTexture only as an empty text (a plain colour) or a name of the app\'s own sixteen, so another case, a space beside the name, half a name, a picture\'s path, a web address, a url, a name a prototype holds, an object, a list, a number, true, false and nothing are dropped; one of the two that does not clean leaves the other as it cleans; on a piece that may not be a secret door both are dropped, and a door that was found keeps its own; with the tick\'s cleaners at hand and not the look\'s no look comes in, and with one of the look\'s two only what that one keeps; the two cleaners themselves (fogcore cleanSeenColor, cleanSeenTexture) say the same',
                !!rLk && !!mLk && Js(idsOf(rLk)) === Js(LK_IDS) && Js(idsOf(mLk)) === Js(LK_IDS) && LK_IDS.length === COLS.length + TEXS.length + 5 && Js(secOf(rLk)) === Js(wantLk) && Js(secOf(mLk)) === Js(wantLk) && Js(wbOf(rLk)) === Js(wbOf(mLk)) && !wbOf(mLk).concat(wbOf(rLk)).some(w => 'doorOpen' in w) && judged(rLk) && judged(mLk)
                && Js(secOf(tLk)) === Js(wantLk.map(() => [true, 'none', 'none'])) && Js(secOf(cLk)) === Js(wantLk.map(r => [true, r[1], 'none'])) && Js(secOf(xLk)) === Js(wantLk.map(r => [true, 'none', r[2]])) && Js(secOf(merg(sdMap, core(['cleanSecret', 'secretOk'])))) === Js(wantTick)
                && wbOf(rSd).length > 0 && !wbOf(rSd).concat(wbOf(mSd)).some(w => ('seenColor' in w || 'seenTexture' in w) && !FCs.secretOk(w)) && wbOf(mSd).filter(w => !('secret' in w) && 'seenColor' in w).length === NOTICK.length + 1 && colSaid && texSaid && colStrict
                && COLS.filter(c => c.length > 1).length === 5 && COLS[19][0] === 'transparent' && [rLk, mLk, cLk].every(m => byId(m, 'c20').seenColor === 'transparent' && byId(m, 'c20').secret === true && !('doorOpen' in byId(m, 'c20')) && wbOf(m).filter(w => w.seenColor === 'transparent').length === 1) && !('seenColor' in byId(xLk, 'c20')) && !('seenColor' in byId(tLk, 'c20')),
                Js([miss(rLk, wantLk), miss(mLk, wantLk), miss(cLk, wantLk.map(r => [true, r[1], 'none'])), miss(xLk, wantLk.map(r => [true, 'none', r[2]])), colSaid, texSaid]));

            // 3. no cleaner at hand
            const NOCORE = [['no fog core', { DR: DOC, sanitize }], ['a fog core from before the secret door', core([])], ['the tick\'s cleaner without the judge', core(['cleanSecret', 'cleanSeenColor', 'cleanSeenTexture'])], ['the judge without the tick\'s cleaner', core(['secretOk', 'cleanSeenColor', 'cleanSeenTexture'])], ['the look\'s cleaners and the readers\' judge alone', core(['cleanSeenColor', 'cleanSeenTexture', 'secretOn', 'secretSeen'])]];
            const noneIn = m => wbOf(m).length > 0 && !wbOf(m).some(w => SEC.some(k => k in w)), ncBad = [];
            // what a file gives with no cleaner, against the same file without the three keys: a piece whose tick was the word true keeps it and is shut, every other piece is the same, and no look comes in
            const tickOnly = (got, ctl, mf) => { const a = wbOf(got), b = wbOf(ctl), was = {}; wbOf(mf()).forEach(w => { if (w.secret === true) was[w.id] = 1; });
                return a.length > 0 && a.length === b.length && a.every((w, i) => !('seenColor' in w) && !('seenTexture' in w) && (was[w.id] === 1 ? w.secret === true && !('doorOpen' in w) && Js(less(w, ['secret'])) === Js(less(b[i], ['doorOpen'])) : Js(w) === Js(b[i]))) && Js(less(got, ['whiteboard'])) === Js(less(ctl, ['whiteboard'])); };
            NOCORE.forEach(n => [['the file of doors', sdMap, SD_IDS], ['the file of looks', lkMap, LK_IDS]].forEach(f => { const got = merg(f[1], n[1]), ctl = merg(bare(f[1]), n[1]); if (!(tickOnly(got, ctl, f[1]) && Js(idsOf(got)) === Js(f[2]))) ncBad.push(n[0] + ', ' + f[0]); }));
            const rNo = repl(sdMap, deps), rNoCtl = repl(bare(sdMap), deps), rNoLk = repl(lkMap, deps), rNoLkCtl = repl(bare(lkMap), deps), mNo = merg(sdMap, { DR: DOC, sanitize });
            check('import: with no cleaner at hand a tick that is the word true STAYS and its door is shut, since the host still sends a wall for it where dropping it would show the players a door; a tick of any other value and both keys of the look are dropped; on Merge (no fog core, a fog core from before the secret door, the tick\'s cleaner without the judge, the judge without the tick\'s cleaner, the look\'s cleaners with neither) and on Replace (no fog core), from a file of doors and from a file of looks; every piece itself is kept, the waiting token alone left out as ever, and each stands otherwise exactly as the same file stands without the three keys; once the core is at hand such a door is read as a secret door and leaves as a wall, and a picture that kept a tick this way is no secret door and leaves as itself',
                ncBad.length === 0 && tickOnly(rNo, rNoCtl, sdMap) && Js(idsOf(rNo)) === Js(SD_IDS) && tickOnly(rNoLk, rNoLkCtl, lkMap) && Js(idsOf(rNoLk)) === Js(LK_IDS)
                && [rNo, mNo].every(m => byId(m, 'a1').secret === true && !('doorOpen' in byId(m, 'a1')) && !('doorOpen' in byId(m, 'a4')) && !('doorOpen' in byId(m, 'a2')) && byId(m, 'a1').doorLock === true && byId(m, 'v1').doorOpen === true && !('secret' in byId(m, 'v1')) && byId(m, 'n5').secret === true)
                && Js(secOf(mNo)) === Js(sdBoard().filter(w => !w.waiting).map(w => (w.secret === true ? [true, 'none', 'none'] : ['none', 'none', 'none']))) && wbOf(rNoLk).every(w => w.secret === true)
                && FCs.secretOn(byId(mNo, 'a1')) && FCs.secretSeen(byId(mNo, 'a1')).sightType === 'wall' && !('secret' in FCs.secretSeen(byId(mNo, 'a1'))) && FCs.secretOn(byId(mNo, 'n5')) === false && FCs.secretSeen(byId(mNo, 'n5')) === byId(mNo, 'n5') && FCs.secretOn(byId(mNo, 'n1')) === false,
                Js([ncBad, tickOnly(rNo, rNoCtl, sdMap), idsOf(rNo).length, tickOnly(rNoLk, rNoLkCtl, lkMap), secOf(mNo)]));

            // 4. nothing else of a piece changes: each cleaned file against the same file cleaned without the three keys
            const drift = (m, ctl, kept) => { const a = wbOf(m), b = wbOf(ctl), rest = SEC.concat('doorOpen'); if (!m || !ctl || !a.length || a.length !== b.length) return ['count'];
                const out = a.map((w, i) => (Js(less(w, rest)) === Js(less(b[i], rest)) && (kept.indexOf(w.id) >= 0 ? !('doorOpen' in w) : Js(['doorOpen' in w, w.doorOpen]) === Js(['doorOpen' in b[i], b[i].doorOpen])) ? null : w.id)).filter(Boolean);
                if (Js(less(m, ['whiteboard'])) !== Js(less(ctl, ['whiteboard']))) out.push('the map itself'); return out; };
            const moved = [];
            [['Replace', repl, depsS], ['Merge', merg, depsS], ['Merge with the tick\'s cleaners and not the look\'s', merg, core(['cleanSecret', 'secretOk'])]].forEach(r => [['the file of doors', sdMap, KEPT], ['the file of looks', lkMap, LK_IDS]].forEach(f => { const d = drift(r[1](f[1], r[2]), r[1](bare(f[1]), r[2]), f[2]); if (d.length) moved.push(r[0] + ', ' + f[0] + ': ' + d.join(' ')); }));
            const twiceM = (() => { const ic = { items: { mSd: sdMap(), mLk: Object.assign(lkMap(), { id: 'mLk' }) } }; cleanImportItems(ic, depsS); const once = Js(ic); cleanImportItems(ic, depsS); return once === Js(ic) && ic.items.mLk.whiteboard.length === LK_IDS.length; })();
            const twiceR = (() => { const again = cleanImport(JSON.parse(Js({ campaigns: { cSd: { id: 'cSd', name: 'S', items: { mSd: rSd } } } })), depsS); return !!again && Js(again.campaigns.cSd.items.mSd.whiteboard) === Js(wbOf(rSd)); })();
            const oddType = [mf => Object.assign(mf(), { type: 'board' }), mf => { const m = mf(); delete m.type; return m; }].every(alt => { const got = merg(() => alt(sdMap), depsS); return !!got && got.type === 'map' && Js(wbOf(got)) === Js(wbOf(mSd)); });
            check('import: a secret door\'s keys change nothing else: every piece of a file of doors and of a file of looks, cleaned on Replace and on Merge, is key for key the piece the same file gives without the three keys, but for the keys themselves and the doorOpen of a door whose tick came in, and the map around them is the same; a file cleaned twice is the file cleaned once, on Merge and on Replace; a map under another type, or under none, is cleaned as the map it will be drawn as',
                moved.length === 0 && twiceM && twiceR && oddType, Js([moved, twiceM, twiceR, oddType]));

            // 5. what the app itself writes, and a load
            const ownBoard = () => clone([pc('o1', Object.assign(SD(), { doorLock: true, name: 'Door', groupId: 'g_2', secret: true })), pc('o2', Object.assign(SD(), { secret: true, seenColor: '#aabbcc', seenTexture: '' })), pc('o3', { barrier: true, sightType: 'door', color: 'transparent', secret: true, seenColor: '#3f3b47', seenTexture: 'cobbles' }),
                { id: 'o4', type: 'path', x: 300, y: 100, w: 100, h: 6, baseW: 100, baseH: 6, z: 10, pts: [[0, 3], [100, 3]], strokeWidth: 6, tip: 'square', color: '#8a5a2b', layer: 'back-mid', name: 'Door', blocksSight: true, sightType: 'door', secret: true, seenColor: '#555566' },
                pc('o5', Object.assign(SD(), { hidden: true, secret: true })), pc('o6', Object.assign(SD(), { doorOpen: true, seenColor: '#aabbcc', seenTexture: 'stone' }))]);   // o6: a door that was found, which keeps the look named for it on the GM's own save
            const ownMap = () => ({ id: 'mSd', type: 'map', meta: { title: 'O' }, rooms: [], links: [], whiteboard: ownBoard() }), ownWant = ownBoard();
            let ldWb = null, ldErr = '';
            try {
                const migS = new Function('window', 'CATS', 'CURRENT_SCHEMA', 'createNewCampaign', '"use strict";\n' + ioSrc.slice(mi, mk) + '\nreturn function(d) { return migrateAppState(d).data; };')({ wpSystemCore: S, wpFormula: F, wpLibraryCore: LBC, wpFogCore: FCs }, { default: { label: 'Default', color: '#ccc' } }, 2, nm => ({ id: 'camp_v0', name: nm, items: {} }));
                ldWb = migS({ activeCampaignId: 'cSd', campaigns: { cSd: { id: 'cSd', name: 'S', activeItemId: 'mSd', items: { mSd: ownMap() } } } }).campaigns.cSd.items.mSd.whiteboard;
            } catch (e) { ldErr = String((e && e.message) || e); }
            check('a secret door as the app itself writes it (the tick as true on a shut door, a wall\'s, a see-through barrier\'s, a line\'s or a hidden one, with a look as the two cleaners keep one) comes through a Replace and a Merge exactly as it was, key for key; a load is no import: the load\'s own normaliser (io.js migrateAppState, run for real with the fog core at hand) leaves every piece of the GM\'s own save as it stands, so no start of the app loses a secret door, and a door that was found keeps the look named for it there, as it does through a Replace and a Merge',
                !ldErr && Js(ldWb) === Js(ownBoard()) && Js(wbOf(repl(ownMap, depsS))) === Js(ownWant) && Js(wbOf(merg(ownMap, depsS))) === Js(ownWant) && Js(secOf({ whiteboard: ownWant })) === Js([[true, 'none', 'none'], [true, '#aabbcc', ''], [true, '#3f3b47', 'cobbles'], [true, '#555566', 'none'], [true, 'none', 'none'], ['none', '#aabbcc', 'stone']]),
                ldErr || Js([Js(ldWb) === Js(ownBoard()), secOf(repl(ownMap, depsS)), secOf(merg(ownMap, depsS))]));

            // 6. the import's Merge itself: main.js mergeAppState, sliced and run for real
            const mergeSrcS = mainSrc.slice(mainSrc.indexOf('  function mergeAppState(imported) {'), mainSrc.indexOf('var _el_importMergeBtn'));
            const mergeS = (appState, file, d, alone) => { const st = { appState }; let r = null;
                try { r = new Function('state', 'window', 'cleanImportedItems', 'takeImportedLibrary', 'cleanImport', 'importDeps', mergeSrcS + '\nreturn mergeAppState;')(st, {}, ic => cleanImportItems(ic, d), () => {}, alone ? undefined : cleanImport, alone ? undefined : () => d)(file); } catch (e) { r = { err: String((e && e.message) || e) }; }
                const c = st.appState.campaigns.cSd; return { r, map: (c && c.items && c.items.mSd) || null }; };
            const hereNew = () => ({ activeCampaignId: 'cSd', campaigns: { cSd: { id: 'cSd', name: 'Mine', activeItemId: 'm0', items: { m0: { id: 'm0', type: 'map', meta: { title: 'Home' }, rooms: [], links: [], whiteboard: [] } } } } });
            const hereOld = () => { const h = hereNew(); h.campaigns.cSd.items.mSd = { id: 'mSd', type: 'map', meta: { title: 'Old' }, rooms: [], links: [], whiteboard: [pc('a1', Object.assign(SD(), { doorOpen: true })), pc('zz')] }; return h; };   // the map is here already, its a1 an ordinary open door
            const hereElse = () => ({ activeCampaignId: 'cE', campaigns: { cE: { id: 'cE', name: 'Else', activeItemId: 'e0', items: { e0: { id: 'e0', type: 'map', meta: { title: 'E' }, rooms: [], links: [], whiteboard: [] } } } } });
            const gAdd = mergeS(hereNew(), fileOf(sdMap()), depsS), gUpd = mergeS(hereOld(), fileOf(sdMap()), depsS), gNew = mergeS(hereElse(), fileOf(sdMap()), depsS), gAlone = mergeS(hereNew(), fileOf(sdMap()), depsS, true), gNone = mergeS(hereNew(), fileOf(sdMap()), deps), gLk = mergeS(hereNew(), fileOf(lkMap()), depsS);
            check('import (main.js mergeAppState, sliced and run for real with the real cleanImport): a Merge brings a file\'s secret doors in exactly as a Replace does, piece for piece, into a campaign that is here (the map new, or in the place of the map of that id, whose ordinary open door is then the file\'s secret door, shut), into a campaign that comes in new, and where the merge runs the item cleaners alone; the looks of a file of looks as a Replace keeps them, the exact word transparent on the one door that named it and on no door that named another spelling of it; with no fog core at hand the merge keeps a tick that is the word true, drops the look and still brings in every piece',
                Js(gAdd.r) === Js({ added: 1, updated: 0, newCamps: 0 }) && Js(gUpd.r) === Js({ added: 0, updated: 1, newCamps: 0 }) && Js(gNew.r) === Js({ added: 0, updated: 0, newCamps: 1 }) && Js(gAlone.r) === Js({ added: 1, updated: 0, newCamps: 0 }) && mergeSrcS.length > 500
                && wbOf(rSd).length === SD_IDS.length && [gAdd, gUpd, gNew, gAlone].every(g => Js(wbOf(g.map)) === Js(wbOf(rSd)) && Js(secOf(g.map)) === Js(wantSec)) && byId(gUpd.map, 'a1').secret === true && !('doorOpen' in byId(gUpd.map, 'a1')) && !byId(gUpd.map, 'zz')
                && Js(secOf(gLk.map)) === Js(wantLk) && Js(wbOf(gLk.map)) === Js(wbOf(rLk)) && byId(gLk.map, 'c20').seenColor === 'transparent' && wbOf(gLk.map).filter(w => w.seenColor === 'transparent').length === 1 && Js(secOf(gNone.map)) === Js(secOf(mNo)) && !noneIn(gNone.map) && Js(idsOf(gNone.map)) === Js(SD_IDS),
                Js([gAdd.r, gUpd.r, gNew.r, gAlone.r, [gAdd, gUpd, gNew, gAlone].map(g => miss(g.map, wantSec)), miss(gLk.map, wantLk), noneIn(gNone.map)]));

            // 7. the fog core as the app hands it over: the object fogcore.js publishes on the window, which main.js importDeps passes as FC (the checks
            // above hand over the module's own exports). fogcore.js run for real with a window, its one export line left off
            const fcSrcS = readSrc('fogcore.js'), fcCutS = fcSrcS.lastIndexOf('\nexport {'); let FCw = null, fcErrS = '';
            try { const winS = {}; if (fcCutS <= 0) throw new Error('fogcore.js has no export line to leave off'); new Function('window', '"use strict";\n' + fcSrcS.slice(0, fcCutS) + '\n')(winS); FCw = winS.wpFogCore || null; } catch (e) { fcErrS = String((e && e.message) || e); }
            const wSd = FCw ? merg(sdMap, { DR: DOC, sanitize, FC: FCw }) : null, wLk = FCw ? merg(lkMap, { DR: DOC, sanitize, FC: FCw }) : null;
            check('import: the fog core as the app hands it to the import (the object fogcore.js publishes as window.wpFogCore, run for real with a window; main.js importDeps passes it as FC) holds the four functions the import asks for a secret door (cleanSecret, secretOk, cleanSeenColor, cleanSeenTexture), says of every colour and every pattern what the module\'s own exports say (the exact word transparent kept and every other spelling of it dropped, since round two of Match a wall) and brings a file of doors and a file of looks in exactly as the module\'s own exports do, so no secret door of a file is lost, or shown to the table as a door, for a name the published object lacks',
                !fcErrS && !!FCw && ['cleanSecret', 'secretOk', 'cleanSeenColor', 'cleanSeenTexture'].every(k => typeof FCw[k] === 'function') && wbOf(wSd).length === SD_IDS.length && Js(wbOf(wSd)) === Js(wbOf(mSd)) && Js(secOf(wSd)) === Js(wantSec) && Js(wbOf(wLk)) === Js(wbOf(mLk)) && Js(secOf(wLk)) === Js(wantLk)
                && COLS.every(c => FCw.cleanSeenColor(c[0]) === (c.length > 1 ? c[1] : null)) && FCw.cleanSeenColor('transparent') === 'transparent' && FCw.cleanSeenColor(undefined) === null && Js(TEXS.map(t => FCw.cleanSeenTexture(t[0]))) === Js(TEXS.map(t => FCs.cleanSeenTexture(t[0]))) && byId(wLk, 'c20').seenColor === 'transparent'
                && mainSrc.includes('FC: window.wpFogCore,'),
                fcErrS || Js([!!FCw, FCw && ['cleanSecret', 'secretOk', 'cleanSeenColor', 'cleanSeenTexture'].filter(k => typeof FCw[k] !== 'function'), miss(wSd, wantSec), miss(wLk, wantLk)]));
            // 8. the kinds: only a kind of piece a wall may be takes the tick, and a look that does not clean leaves a found door with none
            const kdBoard = () => clone([
                Object.assign(pc('k1', SD()), { type: 'text', text: 'Beware', secret: true }, LOOK()), Object.assign(pc('k2', SD()), { type: 'light', light: { bright: 2, dim: 2, unit: 'cells' }, secret: true }, LOOK()),
                Object.assign(pc('k3', SD()), { type: 'triangle', secret: true }, LOOK()), Object.assign(pc('k4', SD()), { type: 'star', secret: true }, LOOK()), Object.assign(pc('k5', SD()), { type: 'line', secret: true }, LOOK()),
                Object.assign(pc('k6', SD()), { type: 'trigger', secret: true }, LOOK()), pc('k7', Object.assign(SD(), { secret: true }, LOOK())),
                pc('k8', Object.assign(SD(), { doorOpen: true, seenColor: 'red', seenTexture: 'Stone' })), pc('k9', Object.assign(SD(), { doorOpen: true, seenColor: '#AA00FF', seenTexture: '' }))]);
            const kdMap = () => ({ id: 'mSd', type: 'map', meta: { title: 'K' }, rooms: [], links: [], whiteboard: kdBoard() });
            const rKd = repl(kdMap, depsS), mKd = merg(kdMap, depsS), wantKd = [].concat(Array(6).fill(['none', 'none', 'none']), [[true, '#112233', 'bricks'], ['none', 'none', 'none'], ['none', '#aa00ff', '']]);
            check('import: only a kind of piece a wall may be takes a secret door\'s tick: a text box, a light, a triangle, a star, a line piece and a trigger zone that carry a door\'s flags, the tick and a look come in with none of the three keys, on Replace and on Merge, where a rectangle beside them keeps all three and is shut; a door that was found keeps a look that cleans, its colour lower-cased and Plain color as an empty text, stays as open as the file had it, and loses a look that does not clean; none of them is read as a secret door but the rectangle',
                !!rKd && !!mKd && Js(secOf(rKd)) === Js(wantKd) && Js(secOf(mKd)) === Js(wantKd) && Js(wbOf(rKd)) === Js(wbOf(mKd)) && Js(wbOf(mKd).map(w => FCs.secretOn(w))) === Js([false, false, false, false, false, false, true, false, false])
                && !('doorOpen' in byId(mKd, 'k7')) && byId(mKd, 'k8').doorOpen === true && byId(mKd, 'k9').doorOpen === true && byId(mKd, 'k1').text === 'Beware' && byId(mKd, 'k1').type === 'text',
                Js([miss(rKd, wantKd), miss(mKd, wantKd)]));
            // 9. the review of fold B5: a fill mark makes a picture or a text box no kind a wall may be
            const kfBoard = () => clone([
                Object.assign(pc('f1', SD()), { type: 'image', src: '/saves/images/k/vault.png', fill: true, secret: true }, LOOK()), Object.assign(pc('f2', SD()), { type: 'text', text: 'The vault', fill: true, secret: true }, LOOK()),
                Object.assign(pc('f3', SD()), { type: 'image', src: '/saves/images/k/vault.png', fill: 1, secret: true }), pc('f4', Object.assign(SD(), { fill: true, secret: true }, LOOK())), Object.assign(pc('f5', SD()), { type: 'hexagon', fill: true, secret: true, doorOpen: true })]);
            const kfMap = () => ({ id: 'mSd', type: 'map', meta: { title: 'K' }, rooms: [], links: [], whiteboard: kfBoard() });
            const rKf = repl(kfMap, depsS), mKf = merg(kfMap, depsS), wantKf = [['none', 'none', 'none'], ['none', 'none', 'none'], ['none', 'none', 'none'], [true, '#112233', 'bricks'], [true, 'none', 'none']];
            check('import: a fill mark makes no piece a kind a wall may be (the review of fold B5): a picture and a text box that a file marked fill, by true or by 1, flagged as a door and ticked Secret come in with none of the three keys, on Replace and on Merge, so the host never sends the picture or the words as the wall the GM was promised; a painted cell, a rectangle or a hexagon with the mark, keeps its tick and is shut; the picture keeps its path and the text box its words',
                !!rKf && !!mKf && Js(secOf(rKf)) === Js(wantKf) && Js(secOf(mKf)) === Js(wantKf) && Js(wbOf(rKf)) === Js(wbOf(mKf)) && Js(wbOf(mKf).map(w => FCs.secretOn(w))) === Js([false, false, false, true, true])
                && byId(mKf, 'f1').src === '/saves/images/k/vault.png' && byId(mKf, 'f1').type === 'image' && byId(mKf, 'f2').text === 'The vault' && !('doorOpen' in byId(mKf, 'f5')) && byId(mKf, 'f5').fill === true,
                Js([miss(rKf, wantKf), miss(mKf, wantKf), wbOf(mKf).map(w => FCs.secretOn(w))]));
            /* ---- Match a wall (the owner, 2026-10-12, by prompt: "Match a wall (Recommended)": "One press in Properties. The door is then seen with the
               colour, width and opacity of the wall line it meets. Your own screen still shows the door as you drew it."). A secret door DRAWN AS A
               LINE (a pen line: type path, its nib not the fill) may name the width, the opacity and the nib its players see it with: seenWidth,
               seenOpacity and seenTip. A file's three keys through the same real import as the tick and the colour above: on Replace, on Merge and
               through main.js mergeAppState itself ---- */
            {
                const SEEN = ['seenWidth', 'seenOpacity', 'seenTip'], SEENF = ['cleanSeenWidth', 'cleanSeenOpacity', 'cleanSeenTip'], NONE3 = ['none', 'none', 'none'], SEEN3 = () => ({ seenWidth: 4, seenOpacity: 0.5, seenTip: 'round' });
                // a wall's door drawn as a line, 6 px wide with the square nib; lnLess: the same line without some of its keys
                const ln = (id, extra) => Object.assign({ id, type: 'path', x: 300, y: 100, w: 100, h: 6, baseW: 100, baseH: 6, z: 10, pts: [[0, 3], [100, 3]], strokeWidth: 6, tip: 'square', color: '#8a5a2b', layer: 'back-mid', blocksSight: true, sightType: 'door' }, extra);
                const lnLess = (id, ks, extra) => { const w = ln(id, extra); ks.forEach(k => { delete w[k]; }); return w; };
                const seenOf = m => wbOf(m).map(w => SEEN.map(k => (k in w ? w[k] : 'none')));
                const missSeen = (m, want) => { const ids = idsOf(m); return seenOf(m).map((g, i) => (Js(g) === Js(want[i]) ? null : ids[i] + '=' + Js(g))).filter(Boolean).concat(ids.length === want.length ? [] : ['count ' + ids.length + ' of ' + want.length]); };
                const mapOf = (bf, t) => () => ({ id: 'mSd', type: 'map', meta: { title: t }, rooms: [], links: [], whiteboard: bf() });
                const bareSeen = mf => () => { const m = mf(); m.whiteboard.forEach(w => SEEN.forEach(k => { delete w[k]; })); return m; };   // the same file with none of the three keys
                const ticked = m => wbOf(m).filter(w => 'secret' in w).map(w => (w.secret === true ? w.id : w.id + '?'));   // the pieces that carry a tick, in their order
                const only = (want, ix) => want.map(r => r.map((v, i) => (ix.indexOf(i) >= 0 ? v : 'none')));   // what is wanted where only some of the three cleaners are at hand

                // 10. the kinds: which piece keeps the three. The boards are built fresh at every call and never through JSON, so a value a file
                // cannot hold (NaN, Infinity) reaches a Merge as it is, and a Replace as the nothing a file would hold in its place
                const mwBoard = () => [
                    // kept: a wall's door drawn as a line with its tick (open in the file, locked, named, grouped, with an opacity of its own), one that
                    // was found (no tick, open and locked), a see-through barrier's door with no nib named, a hidden one drawn with the flat nib, one
                    // with a colour named beside the three, and three that name ONE of the three and nothing else of a secret door
                    ln('l1', Object.assign({ secret: true, doorOpen: true, doorLock: true, name: 'Door', groupId: 'g_7', opacity: 0.8 }, SEEN3())),
                    ln('l2', Object.assign({ doorOpen: true, doorLock: true }, SEEN3())),
                    lnLess('l3', ['blocksSight', 'tip'], Object.assign({ barrier: true, secret: true }, SEEN3())),
                    ln('l4', { hidden: true, tip: 'flat', secret: true, seenWidth: 2.5, seenOpacity: 1, seenTip: 'square' }),
                    ln('l5', { secret: true, seenColor: '#AABBCC', seenWidth: 12, seenOpacity: 0, seenTip: 'flat' }),
                    ln('l6', { seenWidth: 9 }), ln('l7', { doorOpen: true, seenOpacity: 0 }), ln('l8', { tip: 'round', seenTip: 'flat' }),
                    // and a door that was found and shut again by hand, still locked: it stays shut
                    ln('l9', { doorLock: true, seenWidth: 7, seenOpacity: 0.25, seenTip: 'round' }),
                    // dropped, the tick kept: doors that may be secret and are no line (a box, a filled region, a circle, a painted hex cell, a diamond)
                    pc('x1', Object.assign(SD(), { secret: true }, SEEN3())),
                    ln('x2', Object.assign({ tip: 'fill', secret: true }, SEEN3())),
                    Object.assign(pc('x3', SD()), { type: 'circle', secret: true }, SEEN3()),
                    Object.assign(pc('x4', SD()), { type: 'hexagon', w: 60, h: 52, fill: true, secret: true }, SEEN3()),
                    Object.assign(pc('x5', { barrier: true, sightType: 'door', secret: true }), { type: 'diamond' }, SEEN3()),
                    // dropped: a box door and a filled region that were found
                    pc('x6', Object.assign(SD(), { doorOpen: true }, SEEN3())),
                    ln('x7', Object.assign({ tip: 'fill', doorOpen: true }, SEEN3())),
                    // dropped, with any tick: a wall drawn as a line (typed wall, and with no type), a plain line, a line typed a door that is neither
                    // a wall nor a barrier, a picture and a text box that are doors, a token, a token drawn as a line, a GM-note card, a wall flag
                    // that is no true, another spelling of the type, a barrier flag that is no true, a line piece, and a waiting token, which no
                    // import keeps at all
                    ln('y1', Object.assign({ sightType: 'wall', secret: true }, SEEN3())),
                    lnLess('y2', ['sightType'], SEEN3()),
                    lnLess('y3', ['blocksSight', 'sightType'], SEEN3()),
                    lnLess('y4', ['blocksSight'], Object.assign({ doorOpen: true }, SEEN3())),
                    Object.assign(pc('y5', SD()), { type: 'image', src: '/saves/images/m/door.png', doorOpen: true }, SEEN3()),
                    Object.assign(pc('y6', SD()), { type: 'text', text: 'A note' }, SEEN3()),
                    Object.assign(pc('y7', SD()), { type: 'circle', isChar: true, charName: 'Mimic' }, SEEN3()),
                    ln('y8', Object.assign({ isChar: true, charName: 'Mimic', secret: true }, SEEN3())),
                    ln('y9', Object.assign({ gmNoteFor: 'r1' }, SEEN3())),
                    ln('y10', Object.assign({ blocksSight: 1 }, SEEN3())),
                    ln('y11', Object.assign({ sightType: 'Door' }, SEEN3())),
                    lnLess('y12', ['blocksSight'], Object.assign({ barrier: 'yes' }, SEEN3())),
                    Object.assign(ln('y13', SEEN3()), { type: 'line' }),
                    ln('w1', Object.assign({ waiting: true, ownerId: 'u_p', secret: true }, SEEN3())),
                    // dropped: a plain piece that names one of the three alone
                    pc('z1', { seenWidth: 4 }), pc('z2', { seenOpacity: 0.5 }), pc('z3', { seenTip: 'round' }),
                    // none of the three: a plain piece, an ordinary door drawn as a line and a wall drawn as a line
                    pc('q1'), ln('q2', { doorOpen: true, doorLock: true }), lnLess('q3', ['sightType'])
                ];
                const MW_KEEP = { l1: [4, 0.5, 'round'], l2: [4, 0.5, 'round'], l3: [4, 0.5, 'round'], l4: [2.5, 1, 'square'], l5: [12, 0, 'flat'], l6: [9, 'none', 'none'], l7: ['none', 0, 'none'], l8: ['none', 'none', 'flat'], l9: [7, 0.25, 'round'] };
                const MW_IDS = mwBoard().filter(w => !w.waiting).map(w => w.id), MW_TICK = ['l1', 'l3', 'l4', 'l5', 'x1', 'x2', 'x3', 'x4', 'x5'];
                const mwMap = mapOf(mwBoard, 'W'), wantMw = MW_IDS.map(id => MW_KEEP[id] || NONE3), inMw = mwMap();
                const rMw = repl(mwMap, depsS), mMw = merg(mwMap, depsS);
                // each kept door as the file had it, key for key in the file's order: the ticked one shut, the colour beside the three lower-cased
                const asFile = m => !!m && Js(byId(m, 'l1')) === Js(less(byId(inMw, 'l1'), ['doorOpen'])) && ['l2', 'l3', 'l4', 'l6', 'l7', 'l8', 'l9'].every(id => Js(byId(m, id)) === Js(byId(inMw, id))) && Js(byId(m, 'l5')) === Js(Object.assign({}, byId(inMw, 'l5'), { seenColor: '#aabbcc' }));
                const lineOnly = m => wbOf(m).length > 0 && wbOf(m).every(w => !SEEN.some(k => k in w) || (w.type === 'path' && w.tip !== 'fill' && FCs.lineOf(w) === true && FCs.secretOk(w) === true));
                check('import: Match a wall (the owner, 2026-10-12, by prompt: a secret door drawn as a line is seen with the colour, width and opacity of the wall line it meets): a file\'s seenWidth, seenOpacity and seenTip come in only on a door that may be secret AND is drawn as a line (a pen line: type path, its nib not the fill), on Replace and on Merge alike, piece for piece: a wall\'s door with its tick, a door that was found (no tick, as open or as shut and as locked as the file had it), a see-through barrier\'s door with no nib named, a hidden door drawn with the flat nib, a door with a colour named beside the three, and a door that names one of the three and nothing else of a secret door; an opacity of 0 and an opacity of 1 are kept as they are; each kept door keeps its own width, opacity and nib and every other key as the file had it, in the file\'s order, a ticked one shut; on a box door, a filled region, a circle, a painted hex cell and a diamond that are doors the three are dropped and the tick stays, and on a box door and a filled region that were found they are dropped too; on a wall drawn as a line that is no door (typed wall, or with no type), a plain line, a line typed a door that is neither a wall nor a barrier, a picture, a text box, a token, a token drawn as a line, a GM-note card, a line whose wall or barrier flag is no true, another spelling of the type, a line piece and a plain piece that names one of the three alone, all three are dropped; a waiting token does not come in at all; what kept one of the three is exactly a piece the fog core reads as a line (lineOf) that may be a secret door (secretOk)',
                    !!rMw && !!mMw && MW_IDS.length === mwBoard().length - 1 && Js(idsOf(rMw)) === Js(MW_IDS) && Js(idsOf(mMw)) === Js(MW_IDS) && Js(seenOf(rMw)) === Js(wantMw) && Js(seenOf(mMw)) === Js(wantMw) && Js(wbOf(rMw)) === Js(wbOf(mMw))
                    && Js(ticked(rMw)) === Js(MW_TICK) && Js(ticked(mMw)) === Js(MW_TICK) && asFile(rMw) && asFile(mMw) && lineOnly(rMw) && lineOnly(mMw) && judged(rMw) && judged(mMw)
                    && [rMw, mMw].every(m => !('doorOpen' in byId(m, 'l1')) && byId(m, 'l1').doorLock === true && byId(m, 'l1').strokeWidth === 6 && byId(m, 'l1').opacity === 0.8 && byId(m, 'l1').tip === 'square' && byId(m, 'l2').doorOpen === true && byId(m, 'l2').doorLock === true && !('secret' in byId(m, 'l2'))
                        && byId(m, 'l3').barrier === true && !('tip' in byId(m, 'l3')) && byId(m, 'l4').hidden === true && byId(m, 'l4').tip === 'flat' && byId(m, 'l4').seenOpacity === 1 && byId(m, 'l5').seenColor === '#aabbcc' && byId(m, 'l5').seenOpacity === 0 && byId(m, 'l7').seenOpacity === 0 && byId(m, 'l7').doorOpen === true && !('doorOpen' in byId(m, 'l9')) && byId(m, 'l9').doorLock === true && !('secret' in byId(m, 'l9'))
                        && byId(m, 'x1').secret === true && byId(m, 'x2').tip === 'fill' && byId(m, 'x2').secret === true && byId(m, 'x6').doorOpen === true && byId(m, 'y5').src === '/saves/images/m/door.png' && byId(m, 'y6').text === 'A note' && byId(m, 'y8').isChar === true && byId(m, 'y13').type === 'line' && !byId(m, 'w1')),
                    Js([missSeen(rMw, wantMw), missSeen(mMw, wantMw), ticked(rMw), ticked(mMw), [rMw, mMw].map(m => [asFile(m), lineOnly(m), judged(m)]), Js(wbOf(rMw)) === Js(wbOf(mMw))]));

                // 11. the values: each of the three as its own cleaner keeps it (a value, and what it comes in as; nothing: it does not come in)
                const WIDTHS = [[4, 4], [0.5, 0.5], [3.25, 3.25], [1e-9, 1e-9], [1e15, 1e15], [1e15 + 1], [1e16], [1e300], [0], [-0], [-1], [-0.5], [NaN], [Infinity], [-Infinity], ['4'], ['4px'], [' 4'], ['4\n'], ['<b>4</b>'], ['<img src=x onerror=alert(1)>'], ['__proto__'], ['constructor'], [''], [{}], [{ w: 4 }], [[4]], [[]], [true], [false], [null]];
                const OPACS = [[0, 0], [0.01, 0.01], [0.5, 0.5], [0.999, 0.999], [1, 1], [1.000001], [2], [100], [-0.01], [-1], [NaN], [Infinity], [-Infinity], ['0.5'], ['50%'], [' 0.5'], ['<i>0.5</i>'], ['<img src=x onerror=alert(1)>'], ['__proto__'], [''], [{}], [{ a: 0.5 }], [[0.5]], [[]], [true], [false], [null]];
                const TIPS = [['round', 'round'], ['square', 'square'], ['flat', 'flat'], ['fill'], ['Fill'], ['Round'], ['ROUND'], ['Square'], ['SQUARE'], ['Flat'], ['FLAT'], [' round'], ['round '], ['round\n'], ['roun'], ['butt'], ['<b>round</b>'], ['__proto__'], ['constructor'], ['toString'], [''], [{}], [{ tip: 'round' }], [['round']], [[]], [0], [1], [NaN], [true], [false], [null]];
                const kept = v => (v.length > 1 ? v[1] : 'none');
                const mvBoard = () => [].concat(
                    WIDTHS.map((v, i) => ln('sw' + (i + 1), { secret: true, doorOpen: true, seenWidth: v[0] })),
                    OPACS.map((v, i) => ln('so' + (i + 1), { secret: true, seenOpacity: v[0] })),
                    TIPS.map((v, i) => ln('st' + (i + 1), { secret: true, seenTip: v[0] })),
                    // one of the three that does not clean beside two that do, each way; a door that was found; a hidden see-through barrier's door;
                    // and four doors that name nothing of a secret door but one or all of the three, with values that do not clean
                    [ln('b1', { secret: true, seenWidth: '9', seenOpacity: 0.3, seenTip: 'flat' }), ln('b2', { secret: true, seenWidth: 9, seenOpacity: 2, seenTip: 'flat' }), ln('b3', { secret: true, seenWidth: 9, seenOpacity: 0.3, seenTip: 'fill' }),
                        ln('b4', { doorOpen: true, seenWidth: -3, seenOpacity: 0.3, seenTip: 'Flat' }), lnLess('b5', ['blocksSight'], { barrier: true, hidden: true, secret: true, seenWidth: Infinity, seenOpacity: NaN, seenTip: 'square' }),
                        ln('b6', { seenWidth: '<b>4</b>', seenOpacity: 'x', seenTip: '__proto__' }), ln('b7', { doorOpen: true, seenWidth: NaN }), ln('b8', { seenOpacity: 2 }), ln('b9', { seenTip: 'fill' })]);
                const mvMap = mapOf(mvBoard, 'V'), MV_IDS = mvBoard().map(w => w.id), MV_TICK = mvBoard().filter(w => w.secret === true).map(w => w.id);
                const wantMv = [].concat(WIDTHS.map(v => [kept(v), 'none', 'none']), OPACS.map(v => ['none', kept(v), 'none']), TIPS.map(v => ['none', 'none', kept(v)]),
                    [['none', 0.3, 'flat'], [9, 'none', 'flat'], [9, 0.3, 'none'], ['none', 0.3, 'none'], ['none', 'none', 'square'], NONE3, NONE3, NONE3, NONE3]);
                const rMv = repl(mvMap, depsS), mMv = merg(mvMap, depsS);
                // a cleaner asked for each value by itself: the very value back where it is kept, null where it is not, and null where nothing was named
                const saidBy = (L, f) => typeof f === 'function' && L.every(v => Object.is(f(v[0]), v.length > 1 ? v[1] : null)) && f(undefined) === null;
                const saidW = saidBy(WIDTHS, FCs.cleanSeenWidth), saidO = saidBy(OPACS, FCs.cleanSeenOpacity), saidT = saidBy(TIPS, FCs.cleanSeenTip);
                const bareOf = m => ['b6', 'b8', 'b9'].every(id => Js(byId(m, id)) === Js(ln(id))) && Js(byId(m, 'b7')) === Js(ln('b7', { doorOpen: true })) && Js(byId(m, 'b4')) === Js(ln('b4', { doorOpen: true, seenOpacity: 0.3 }));
                check('import: Match a wall, the values: each of the three comes in as its own cleaner keeps it, on Replace and on Merge alike, piece for piece (a value a file cannot hold, NaN or Infinity, reaches a Merge as it is and a Replace as the nothing a file holds in its place): seenWidth only as a finite number above 0 and at most 1e15, so 0, a negative, a number past the bound, NaN, Infinity, a number written as text, a text with a unit, markup, a name a prototype holds, an empty text, an object, a list, true, false and nothing are dropped; seenOpacity only as a finite number from 0 to 1, both ends kept, so 2, a number a hair past 1, a negative, NaN, Infinity, text, a percentage, markup, an object, a list, true, false and nothing are dropped; seenTip only as round, square or flat, so the fill, another case, a space or a line break beside the word, half a word, another nib, markup, a name a prototype holds, an empty text, an object, a list, a number, true, false and nothing are dropped; one of the three that does not clean leaves the other two as they clean; a door that names only the three (no tick, no colour) is still cleaned, and with values that do not clean it is left exactly the ordinary door it is; a door that was found stays as open as the file had it; a ticked door is shut; the three cleaners themselves (fogcore cleanSeenWidth, cleanSeenOpacity, cleanSeenTip) say the same of every value, hand a kept value back as it is and answer null where nothing was named',
                    !!rMv && !!mMv && MV_IDS.length === WIDTHS.length + OPACS.length + TIPS.length + 9 && Js(idsOf(rMv)) === Js(MV_IDS) && Js(idsOf(mMv)) === Js(MV_IDS) && Js(seenOf(rMv)) === Js(wantMv) && Js(seenOf(mMv)) === Js(wantMv) && Js(wbOf(rMv)) === Js(wbOf(mMv))
                    && Js(ticked(rMv)) === Js(MV_TICK) && Js(ticked(mMv)) === Js(MV_TICK) && MV_TICK.length === MV_IDS.length - 5 && !wbOf(rMv).concat(wbOf(mMv)).some(w => w.secret === true && 'doorOpen' in w) && lineOnly(rMv) && lineOnly(mMv) && judged(rMv) && judged(mMv)
                    && bareOf(rMv) && bareOf(mMv) && saidW && saidO && saidT
                    && WIDTHS.filter(v => v.length > 1).length === 5 && OPACS.filter(v => v.length > 1).length === 5 && TIPS.filter(v => v.length > 1).length === 3,
                    Js([missSeen(rMv, wantMv), missSeen(mMv, wantMv), ticked(rMv).length, ticked(mMv).length, [rMv, mMv].map(m => [lineOnly(m), judged(m), !!m && bareOf(m)]), saidW, saidO, saidT]));

                // 12. only some of the three cleaners at hand: each key by its own cleaner
                const SK = ['cleanSecret', 'secretOk'];
                const PART = [['none of the three', [], []], ['the width\'s alone', ['cleanSeenWidth'], [0]], ['the opacity\'s alone', ['cleanSeenOpacity'], [1]], ['the nib\'s alone', ['cleanSeenTip'], [2]],
                    ['the width\'s and the opacity\'s', ['cleanSeenWidth', 'cleanSeenOpacity'], [0, 1]], ['the width\'s and the nib\'s', ['cleanSeenWidth', 'cleanSeenTip'], [0, 2]], ['the opacity\'s and the nib\'s', ['cleanSeenOpacity', 'cleanSeenTip'], [1, 2]], ['all three', SEENF, [0, 1, 2]]];
                const partBad = [];
                PART.forEach(p => [['the file of lines', mwMap, wantMw, MW_TICK, MW_IDS], ['the file of values', mvMap, wantMv, MV_TICK, MV_IDS]].forEach(f => { const d = core(SK.concat(p[1])), want = only(f[2], p[2]);
                    [['Merge', merg(f[1], d)], ['Replace', repl(f[1], Object.assign({ migrate }, d))]].forEach(g => { const got = g[1];
                        if (!(got && Js(idsOf(got)) === Js(f[4]) && Js(seenOf(got)) === Js(want) && Js(ticked(got)) === Js(f[3]))) partBad.push(g[0] + ', ' + p[0] + ', ' + f[0] + ': ' + missSeen(got, want).slice(0, 6).join(' ')); }); }));
                const oldCore = merg(mwMap, core(SK.concat(['cleanSeenColor', 'cleanSeenTexture']))), oldCoreV = merg(mvMap, core(SK.concat(['cleanSeenColor', 'cleanSeenTexture'])));   // a fog core from before Match a wall
                check('import: Match a wall, with only some of the three cleaners at hand each key comes in by its own cleaner and no other: with the tick\'s cleaners and none of the three no width, opacity or nib comes in; with the width\'s alone only what cleanSeenWidth keeps, and so for the opacity\'s and for the nib\'s; with two of the three those two and never the third; with all three as with the whole core; on Merge and on Replace, from a file of lines and from a file of values, the ticks as with the whole core each time; a fog core from before Match a wall (the tick\'s and the colour\'s cleaners and no more) brings in the tick and the colour and none of the three',
                    partBad.length === 0 && PART.length === 8 && !!oldCore && Js(seenOf(oldCore)) === Js(wantMw.map(() => NONE3)) && Js(ticked(oldCore)) === Js(MW_TICK) && byId(oldCore, 'l5').seenColor === '#aabbcc' && byId(oldCore, 'l5').secret === true && !!oldCoreV && Js(seenOf(oldCoreV)) === Js(wantMv.map(() => NONE3)) && Js(ticked(oldCoreV)) === Js(MV_TICK),
                    Js([partBad, missSeen(oldCore, wantMw.map(() => NONE3)), missSeen(oldCoreV, wantMv.map(() => NONE3))]));

                // 12b. what is written is the cleaner's own answer: a core whose three cleaners answer other values than they are handed (0 and an
                // empty text among them), null for some and nothing at all for others
                const odd = { DR: DOC, sanitize, FC: Object.assign({}, FCs, { cleanSeenWidth: v => (v === 4 ? 0 : v === 9 ? 77 : v === 12 ? undefined : null), cleanSeenOpacity: v => (v === 0.5 ? 0 : v === 0 ? 0.125 : v === 0.25 ? undefined : null), cleanSeenTip: v => (v === 'round' ? '' : v === 'flat' ? 'square' : v === 'square' ? undefined : null) }) };
                const ODD_KEEP = { l1: [0, 0, ''], l2: [0, 0, ''], l3: [0, 0, ''], l5: ['none', 0.125, 'square'], l6: [77, 'none', 'none'], l7: ['none', 0.125, 'none'], l8: ['none', 'none', 'square'], l9: ['none', 'none', ''] }, wantOdd = MW_IDS.map(id => ODD_KEEP[id] || NONE3);
                const mOdd = merg(mwMap, odd), rOdd = repl(mwMap, Object.assign({ migrate }, odd)), oddCtl = merg(bareSeen(mwMap), odd);
                const oddSame = !!mOdd && !!oddCtl && wbOf(mOdd).length === wbOf(oddCtl).length && wbOf(mOdd).every((w, i) => Js(less(w, SEEN)) === Js(wbOf(oddCtl)[i]));
                check('import: Match a wall, what is written is the answer of each key\'s own cleaner and never the file\'s own value: with a core whose three cleaners answer other values than they are handed, a door drawn as a line holds exactly those answers, an answer of 0 and an answer of an empty text among them, and loses a key whose cleaner answers null or nothing at all; a door that may be secret and is no line, and a piece that may not be a secret door, keep none whatever the cleaners would answer; on Replace and on Merge alike, the ticks as ever and nothing else of a piece changed',
                    !!mOdd && !!rOdd && Js(idsOf(mOdd)) === Js(MW_IDS) && Js(seenOf(mOdd)) === Js(wantOdd) && Js(seenOf(rOdd)) === Js(wantOdd) && Js(wbOf(rOdd)) === Js(wbOf(mOdd)) && Js(ticked(mOdd)) === Js(MW_TICK) && oddSame
                    && byId(mOdd, 'l1').seenWidth === 0 && byId(mOdd, 'l1').seenOpacity === 0 && byId(mOdd, 'l1').seenTip === '' && byId(mOdd, 'l6').seenWidth === 77 && !('seenWidth' in byId(mOdd, 'l5')) && !('seenOpacity' in byId(mOdd, 'l9')) && !('seenTip' in byId(mOdd, 'l4')) && byId(mOdd, 'l1').strokeWidth === 6 && byId(mOdd, 'l1').tip === 'square',
                    Js([missSeen(mOdd, wantOdd), missSeen(rOdd, wantOdd), ticked(mOdd), oddSame]));

                // 13. no cleaner at hand: none of the three comes in
                const NOSEEN = [['no fog core', { DR: DOC, sanitize }], ['a fog core from before the secret door', core([])], ['the three cleaners with neither the tick\'s cleaner nor the judge', core(SEENF)],
                    ['the three cleaners and the judge without the tick\'s cleaner', core(['secretOk'].concat(SEENF))], ['the three cleaners and the tick\'s cleaner without the judge', core(['cleanSecret'].concat(SEENF))], ['every cleaner of a secret door but the judge', core(['cleanSecret', 'cleanSeenColor', 'cleanSeenTexture'].concat(SEENF))],
                    ['the whole core without its light cleaner, which the import takes for no fog core', { DR: DOC, sanitize, FC: Object.assign({}, FCs, { cleanLight: null }) }]];
                // what a file gives then, against the same file without the three keys under the same core: every piece the same, and none of the three
                const sameLess = (got, ctl) => { const a = wbOf(got), b = wbOf(ctl); return !!got && !!ctl && a.length > 0 && a.length === b.length && a.every((w, i) => !SEEN.some(k => k in w) && Js(w) === Js(b[i])) && Js(less(got, ['whiteboard'])) === Js(less(ctl, ['whiteboard'])); };
                const noBad = [];
                NOSEEN.forEach(n => [['the file of lines', mwMap, MW_IDS], ['the file of values', mvMap, MV_IDS]].forEach(f => [['Merge', merg, n[1]], ['Replace', repl, Object.assign({ migrate }, n[1])]].forEach(g => { const got = g[1](f[1], g[2]), ctl = g[1](bareSeen(f[1]), g[2]);
                    if (!(sameLess(got, ctl) && Js(idsOf(got)) === Js(f[2]))) noBad.push(g[0] + ', ' + n[0] + ', ' + f[0]); })));
                const rNoMw = repl(mwMap, deps), rNoMv = repl(mvMap, deps), mNoMw = merg(mwMap, { DR: DOC, sanitize }), noL1 = byId(mNoMw, 'l1') || {};
                const wordTrue = mwBoard().filter(w => !w.waiting && w.secret === true).map(w => w.id);   // every piece whose tick was the word true, a wall line and a token among them
                check('import: Match a wall, with no cleaner at hand none of the three comes in, on any piece and whatever its value: on Merge and on Replace (no fog core, a fog core from before the secret door, the three cleaners with neither the tick\'s cleaner nor the judge, with the judge and not the tick\'s cleaner, with the tick\'s cleaner and not the judge, every cleaner of a secret door but the judge, the whole core without its light cleaner, which the import takes for no fog core), from a file of lines and from a file of values; every piece itself is kept, the waiting token alone left out as ever, and each stands exactly as the same file stands without the three keys, so a tick that is the word true still stays and its door is still shut; once the core is at hand such a door is read as a secret door with no width, opacity or nib named for it, and leaves as a wall at the door\'s own width and nib',
                    noBad.length === 0 && NOSEEN.length === 7 && typeof NOSEEN[6][1].FC.cleanSeenWidth === 'function' && typeof NOSEEN[6][1].FC.secretOk === 'function' && sameLess(rNoMw, repl(bareSeen(mwMap), deps)) && sameLess(rNoMv, repl(bareSeen(mvMap), deps)) && Js(idsOf(rNoMw)) === Js(MW_IDS) && Js(idsOf(rNoMv)) === Js(MV_IDS) && Js(wbOf(rNoMw)) === Js(wbOf(mNoMw))
                    && Js(ticked(mNoMw)) === Js(wordTrue) && wordTrue.length === MW_TICK.length + 2 && !('doorOpen' in noL1) && byId(mNoMw, 'l2').doorOpen === true && noL1.strokeWidth === 6 && noL1.opacity === 0.8
                    && FCs.secretOn(noL1) === true && Js(Object.keys(FCs.secretLook(noL1))) === Js(['color', 'texture', 'clear']) && FCs.secretSeen(noL1).strokeWidth === 6 && FCs.secretSeen(noL1).tip === 'square' && FCs.secretSeen(noL1).opacity === 0.8 && FCs.secretSeen(noL1).sightType === 'wall',
                    Js([noBad, sameLess(rNoMw, repl(bareSeen(mwMap), deps)), sameLess(rNoMv, repl(bareSeen(mvMap), deps)), ticked(mNoMw), seenOf(mNoMw).filter(r => Js(r) !== Js(NONE3))]));

                // 14. nothing else of a piece changes: each cleaned file against the same file cleaned without the three keys
                const seenDrift = (got, ctl) => { const a = wbOf(got), b = wbOf(ctl); if (!got || !ctl || !a.length || a.length !== b.length) return ['count'];
                    const out = a.map((w, i) => (Js(less(w, SEEN)) === Js(b[i]) ? null : w.id)).filter(Boolean); if (Js(less(got, ['whiteboard'])) !== Js(less(ctl, ['whiteboard']))) out.push('the map itself'); return out; };
                const mwMoved = [];
                [['Replace', repl, depsS], ['Merge', merg, depsS], ['Merge with the width\'s cleaner alone', merg, core(SK.concat('cleanSeenWidth'))], ['Merge with a fog core from before Match a wall', merg, core(SK.concat(['cleanSeenColor', 'cleanSeenTexture']))]].forEach(r => [['the file of lines', mwMap], ['the file of values', mvMap]].forEach(f => { const d = seenDrift(r[1](f[1], r[2]), r[1](bareSeen(f[1]), r[2])); if (d.length) mwMoved.push(r[0] + ', ' + f[0] + ': ' + d.join(' ')); }));
                const mwTwiceM = (() => { const ic = { items: { mSd: mwMap(), mMv: Object.assign(mvMap(), { id: 'mMv' }) } }; cleanImportItems(ic, depsS); const once = Js(ic); cleanImportItems(ic, depsS); return once === Js(ic) && ic.items.mSd.whiteboard.length === MW_IDS.length && ic.items.mMv.whiteboard.length === MV_IDS.length && Js(seenOf(ic.items.mSd)) === Js(wantMw) && Js(seenOf(ic.items.mMv)) === Js(wantMv); })();
                const mwTwiceR = [rMw, rMv].every(m => { const again = cleanImport(JSON.parse(Js({ campaigns: { cSd: { id: 'cSd', name: 'S', items: { mSd: m } } } })), depsS); return !!again && Js(again.campaigns.cSd.items.mSd.whiteboard) === Js(wbOf(m)); });
                const mwOdd = [mf => Object.assign(mf(), { type: 'board' }), mf => { const m = mf(); delete m.type; return m; }].every(alt => { const got = merg(() => alt(mwMap), depsS); return !!got && got.type === 'map' && Js(wbOf(got)) === Js(wbOf(mMw)); });
                check('import: Match a wall, the three keys change nothing else: every piece of a file of lines and of a file of values, cleaned on Replace and on Merge, with the whole core, with one of the three cleaners and with none of them, is key for key and in the same order the piece the same file gives without the three keys, but for the three keys themselves: the door\'s own width, opacity, nib and colour, its tick, its lock and whether it stands open are as they would be without them, and the map around the pieces is the same; a file cleaned twice is the file cleaned once, on Merge and on Replace; a map under another type, or under none, is cleaned as the map it will be drawn as',
                    mwMoved.length === 0 && mwTwiceM && mwTwiceR && mwOdd, Js([mwMoved, mwTwiceM, mwTwiceR, mwOdd]));

                // 15. the import's Merge itself: main.js mergeAppState, sliced and run for real (mergeS above)
                const gMw = [mergeS(hereNew(), fileOf(mwMap()), depsS), mergeS(hereOld(), fileOf(mwMap()), depsS), mergeS(hereElse(), fileOf(mwMap()), depsS), mergeS(hereNew(), fileOf(mwMap()), depsS, true)];
                const gMv = [mergeS(hereNew(), fileOf(mvMap()), depsS), mergeS(hereOld(), fileOf(mvMap()), depsS), mergeS(hereElse(), fileOf(mvMap()), depsS), mergeS(hereNew(), fileOf(mvMap()), depsS, true)];
                const gNoMw = mergeS(hereNew(), fileOf(mwMap()), deps), gNoMv = mergeS(hereNew(), fileOf(mvMap()), deps), gOldMw = mergeS(hereNew(), fileOf(mwMap()), core(SK.concat(['cleanSeenColor', 'cleanSeenTexture'])), true);
                const noSeenIn = m => wbOf(m).length > 0 && !wbOf(m).some(w => SEEN.some(k => k in w));
                check('import (main.js mergeAppState, sliced and run for real with the real cleanImport): a Merge brings a file\'s matched doors in exactly as a Replace does, piece for piece, into a campaign that is here (the map new, or in the place of the map of that id), into a campaign that comes in new, and where the merge runs the item cleaners alone; a file of values is cleaned the same way on each of those roads, a value a file cannot hold among them; with no fog core at hand the merge drops all three from every piece, keeps a tick that is the word true and still brings in every piece; with a fog core from before Match a wall it brings in the ticks and none of the three',
                    Js(gMw.map(g => g.r)) === Js([{ added: 1, updated: 0, newCamps: 0 }, { added: 0, updated: 1, newCamps: 0 }, { added: 0, updated: 0, newCamps: 1 }, { added: 1, updated: 0, newCamps: 0 }]) && Js(gMv.map(g => g.r)) === Js(gMw.map(g => g.r))
                    && wbOf(rMw).length === MW_IDS.length && gMw.every(g => Js(wbOf(g.map)) === Js(wbOf(rMw)) && Js(seenOf(g.map)) === Js(wantMw) && Js(ticked(g.map)) === Js(MW_TICK)) && !byId(gMw[1].map, 'zz') && !byId(gMw[1].map, 'a1')
                    && wbOf(rMv).length === MV_IDS.length && gMv.every(g => Js(wbOf(g.map)) === Js(wbOf(rMv)) && Js(seenOf(g.map)) === Js(wantMv) && Js(ticked(g.map)) === Js(MV_TICK))
                    && noSeenIn(gNoMw.map) && Js(wbOf(gNoMw.map)) === Js(wbOf(rNoMw)) && Js(idsOf(gNoMw.map)) === Js(MW_IDS) && Js(ticked(gNoMw.map)) === Js(wordTrue) && noSeenIn(gNoMv.map) && Js(wbOf(gNoMv.map)) === Js(wbOf(rNoMv)) && Js(idsOf(gNoMv.map)) === Js(MV_IDS)
                    && noSeenIn(gOldMw.map) && Js(ticked(gOldMw.map)) === Js(MW_TICK) && Js(wbOf(gOldMw.map)) === Js(wbOf(oldCore)),
                    Js([gMw.map(g => [g.r, missSeen(g.map, wantMw)]), gMv.map(g => [g.r, missSeen(g.map, wantMv)]), noSeenIn(gNoMw.map), noSeenIn(gNoMv.map), noSeenIn(gOldMw.map)]));

                // 16. the fog core as the app hands it over (FCw above: fogcore.js run for real with a window), and what the app itself writes
                const wMw = FCw ? merg(mwMap, { DR: DOC, sanitize, FC: FCw }) : null, wMv = FCw ? merg(mvMap, { DR: DOC, sanitize, FC: FCw }) : null;
                check('import: the fog core as the app hands it to the import (the object fogcore.js publishes as window.wpFogCore, run for real with a window) holds the three cleaners the import asks for a matched door (cleanSeenWidth, cleanSeenOpacity, cleanSeenTip), each saying of every value what the module\'s own export says, and brings a file of lines and a file of values in exactly as the module\'s own exports do, so no door\'s match is lost in silence for a name the published object lacks',
                    !fcErrS && !!FCw && SEENF.every(k => typeof FCw[k] === 'function') && saidBy(WIDTHS, FCw.cleanSeenWidth) && saidBy(OPACS, FCw.cleanSeenOpacity) && saidBy(TIPS, FCw.cleanSeenTip)
                    && wbOf(wMw).length === MW_IDS.length && Js(wbOf(wMw)) === Js(wbOf(mMw)) && Js(seenOf(wMw)) === Js(wantMw) && wbOf(wMv).length === MV_IDS.length && Js(wbOf(wMv)) === Js(wbOf(mMv)) && Js(seenOf(wMv)) === Js(wantMv) && mainSrc.includes('FC: window.wpFogCore,'),
                    fcErrS || Js([!!FCw, FCw && SEENF.filter(k => typeof FCw[k] !== 'function'), missSeen(wMw, wantMw), missSeen(wMv, wantMv)]));
                // a door as Properties' Match leaves it: matched in all four, matched without a colour (a wall whose colour is none a secret door can
                // be seen in), a hidden see-through barrier's door, and a matched door that was found since
                const ownMw = () => [ln('m1', { secret: true, seenColor: '#3f3b47', seenWidth: 8, seenOpacity: 1, seenTip: 'round' }), ln('m2', { secret: true, opacity: 0.6, seenWidth: 3, seenOpacity: 0.35, seenTip: 'flat' }),
                    lnLess('m3', ['blocksSight'], { barrier: true, hidden: true, color: 'transparent', secret: true, seenColor: '#555566', seenWidth: 10, seenOpacity: 0.5, seenTip: 'square' }), ln('m4', { doorOpen: true, seenColor: '#aabbcc', seenWidth: 5, seenOpacity: 0.5, seenTip: 'square' })];
                const ownMwMap = mapOf(ownMw, 'O'), rOwn = repl(ownMwMap, depsS), mOwn = merg(ownMwMap, depsS), gOwn = mergeS(hereNew(), fileOf(ownMwMap()), depsS);
                let ldMw = null, ldMwErr = '';
                try {
                    const migM = new Function('window', 'CATS', 'CURRENT_SCHEMA', 'createNewCampaign', '"use strict";\n' + ioSrc.slice(mi, mk) + '\nreturn function(d) { return migrateAppState(d).data; };')({ wpSystemCore: S, wpFormula: F, wpLibraryCore: LBC, wpFogCore: FCs }, { default: { label: 'Default', color: '#ccc' } }, 2, nm => ({ id: 'camp_v0', name: nm, items: {} }));
                    ldMw = migM({ activeCampaignId: 'cSd', campaigns: { cSd: { id: 'cSd', name: 'S', activeItemId: 'mSd', items: { mSd: ownMwMap() } } } }).campaigns.cSd.items.mSd.whiteboard;
                } catch (e) { ldMwErr = String((e && e.message) || e); }
                const SIX = SEC.concat(SEEN), seen1 = FCs.secretSeen(byId(rOwn, 'm1') || {}), seen2 = FCs.secretSeen(byId(rOwn, 'm2') || {});
                check('a matched secret door as the app itself writes it (the tick as true on a shut door drawn as a line, with the width, opacity and nib Match set through the three cleaners, with the wall\'s colour or without one, a hidden see-through barrier\'s door, and a matched door that was found since) comes through a Replace, a Merge and main.js mergeAppState exactly as it was, key for key; a load is no import: the load\'s own normaliser (io.js migrateAppState, run for real with the fog core at hand) leaves every such piece of the GM\'s own save as it stands; and what came in is what the players are then to hold: the door\'s copy is a wall at the matched width and nib, with the matched opacity only where it is under 1, and with none of the six keys',
                    !ldMwErr && Js(ldMw) === Js(ownMw()) && Js(wbOf(rOwn)) === Js(ownMw()) && Js(wbOf(mOwn)) === Js(ownMw()) && Js(wbOf(gOwn.map)) === Js(ownMw()) && Js(seenOf(rOwn)) === Js([[8, 1, 'round'], [3, 0.35, 'flat'], [10, 0.5, 'square'], [5, 0.5, 'square']])
                    && seen1.sightType === 'wall' && seen1.strokeWidth === 8 && seen1.tip === 'round' && !('opacity' in seen1) && seen1.color === '#3f3b47' && !SIX.some(k => k in seen1)
                    && seen2.sightType === 'wall' && seen2.strokeWidth === 3 && seen2.tip === 'flat' && seen2.opacity === 0.35 && !SIX.some(k => k in seen2) && FCs.secretSeen(byId(rOwn, 'm4')) === byId(rOwn, 'm4') && byId(rOwn, 'm2').strokeWidth === 6 && byId(rOwn, 'm2').opacity === 0.6 && byId(rOwn, 'm2').tip === 'square',
                    ldMwErr || Js([Js(ldMw) === Js(ownMw()), seenOf(rOwn), seenOf(mOwn), seenOf(gOwn.map), seen1, seen2]));
                /* ---- Match a wall, round two (what the three reviewers of the first build confirmed, 2026-10-12): A SEE-THROUGH WALL GIVES A
                   SEE-THROUGH DOOR. The colour a secret door is seen in may also be the exact word transparent (fogcore cleanSeenColor), which
                   Properties' Match sets for a door that meets a wall line whose colour draws nothing. A file's seenColor of that word through
                   the same real import as the tick and the hex colour above. And what round two did NOT move: the import still leaves a
                   piece's own width, opacity, nib and lock exactly as the file had them (the WIRE reads a line in one reading and takes a
                   plain wall's lock off, net.js wireWbItem, which is netcheck's to hold; the GM's own save keeps what was drawn) ---- */
                const TR = 'transparent', NOKEY = 'none';
                const bx = (id, extra) => pc(id, Object.assign(SD(), extra));   // a wall's door as a box
                const colOf = m => wbOf(m).map(w => ('seenColor' in w ? w.seenColor : NOKEY));
                const missCol = (m, want) => { const ids = idsOf(m); return colOf(m).map((g, i) => (Js(g) === Js(want[i]) ? null : ids[i] + '=' + Js(g))).filter(Boolean).concat(ids.length === want.length ? [] : ['count ' + ids.length + ' of ' + want.length]); };
                const bareCol = mf => () => { const m = mf(); m.whiteboard.forEach(w => { delete w.seenColor; }); return m; };   // the same file with no seen colour named
                const colDrift = (got, ctl) => { const a = wbOf(got), b = wbOf(ctl); if (!got || !ctl || !a.length || a.length !== b.length) return ['count'];   // each piece against the same file's piece cleaned with no seen colour named: key for key the same but for that one key
                    const out = a.map((w, i) => (Js(less(w, ['seenColor'])) === Js(b[i]) ? null : w.id)).filter(Boolean); if (Js(less(got, ['whiteboard'])) !== Js(less(ctl, ['whiteboard']))) out.push('the map itself'); return out; };

                // 17. where the word is kept: on a door that may be a secret door, a box or a line, with its tick or without it
                const trBoard = () => [
                    // kept. In their order: a box door with its tick (open in the file, locked, named, grouped), a box door that was found, a door
                    // drawn as a line as Match leaves it at a see-through wall, a found line that names the word and nothing else, a hidden box
                    // door, a hidden found line drawn with the flat nib, a see-through barrier's box door, a hidden see-through barrier's line
                    // with no nib named, a box door that names a pattern with the word, a found one that names Plain color with it, a filled
                    // region, a circle, a painted hex cell and a diamond that are doors, and a shut box door that names the word alone; then a
                    // box door and a line whose tick is no tick (a word, a number), both open and the box locked, and a line that names a
                    // pattern with the word
                    bx('t1', { secret: true, doorOpen: true, doorLock: true, name: 'Door', groupId: 'g_7', seenColor: TR }),
                    bx('t2', { doorOpen: true, doorLock: true, seenColor: TR }),
                    ln('t3', { secret: true, seenColor: TR, seenWidth: 4, seenOpacity: 0.5, seenTip: 'round' }),
                    ln('t4', { doorOpen: true, seenColor: TR }),
                    bx('t5', { hidden: true, secret: true, seenColor: TR }),
                    ln('t6', { hidden: true, tip: 'flat', seenColor: TR }),
                    pc('t7', { barrier: true, sightType: 'door', color: 'transparent', secret: true, seenColor: TR }),
                    lnLess('t8', ['blocksSight', 'tip'], { barrier: true, hidden: true, color: 'transparent', secret: true, seenColor: TR, seenOpacity: 1 }),
                    bx('t9', { secret: true, seenColor: TR, seenTexture: 'bricks' }),
                    bx('t10', { doorOpen: true, seenColor: TR, seenTexture: '' }),
                    ln('t11', { tip: 'fill', secret: true, seenColor: TR }),
                    Object.assign(bx('t12', { seenColor: TR }), { type: 'circle' }),
                    Object.assign(bx('t13', { fill: true, secret: true, seenColor: TR }), { type: 'hexagon', w: 60, h: 52 }),
                    Object.assign(pc('t14', { barrier: true, sightType: 'door', secret: true, seenColor: TR }), { type: 'diamond' }),
                    bx('t15', { seenColor: TR }),
                    bx('t16', { secret: 'yes', doorOpen: true, doorLock: true, seenColor: TR }),
                    ln('t17', { secret: 1, doorOpen: true, seenColor: TR, seenWidth: 4 }),
                    ln('t18', { secret: true, seenColor: TR, seenTexture: 'bricks' }),
                    // dropped, with any tick named beside it. In their order: a wall as a box (typed wall, and with no type), the see-through
                    // wall LINE a door would be matched to (the word is its own colour, which stays), a wall line with no type, a plain box, a
                    // plain line, a box and a line typed a door that are neither a wall nor a barrier, a picture and a text box that are doors, a
                    // token, a token drawn as a line, a GM-note card as a box and as a line, a wall flag that is no true, another spelling of the
                    // type, a barrier flag that is no true, a line piece, a trigger zone, a triangle, a picture that a file marked fill, and a
                    // waiting token, which no import keeps at all
                    pc('u1', { blocksSight: true, sightType: 'wall', secret: true, seenColor: TR }),
                    pc('u2', { blocksSight: true, seenColor: TR }),
                    ln('u3', { sightType: 'wall', color: 'transparent', seenColor: TR }),
                    lnLess('u4', ['sightType'], { secret: true, seenColor: TR }),
                    pc('u5', { seenColor: TR }),
                    lnLess('u6', ['blocksSight', 'sightType'], { seenColor: TR }),
                    pc('u7', { sightType: 'door', doorOpen: true, seenColor: TR }),
                    lnLess('u8', ['blocksSight'], { doorOpen: true, secret: true, seenColor: TR }),
                    Object.assign(bx('u9', { doorOpen: true, secret: true, seenColor: TR }), { type: 'image', src: '/saves/images/m/door.png' }),
                    Object.assign(bx('u10', { seenColor: TR }), { type: 'text', text: 'A note' }),
                    Object.assign(bx('u11', { isChar: true, charName: 'Mimic', seenColor: TR }), { type: 'circle' }),
                    ln('u12', { isChar: true, charName: 'Mimic', secret: true, seenColor: TR }),
                    bx('u13', { gmNoteFor: 'r1', seenColor: TR }),
                    ln('u14', { gmNoteFor: 'r1', secret: true, seenColor: TR }),
                    pc('u15', { blocksSight: 1, sightType: 'door', seenColor: TR }),
                    ln('u16', { sightType: 'Door', seenColor: TR }),
                    pc('u17', { barrier: 'yes', sightType: 'door', secret: true, seenColor: TR }),
                    Object.assign(ln('u18', { seenColor: TR }), { type: 'line' }),
                    Object.assign(bx('u19', { seenColor: TR }), { type: 'trigger' }),
                    Object.assign(bx('u20', { secret: true, seenColor: TR }), { type: 'triangle' }),
                    Object.assign(bx('u21', { fill: true, secret: true, seenColor: TR }), { type: 'image', src: '/saves/images/k/vault.png' }),
                    ln('w1', { waiting: true, ownerId: 'u_p', secret: true, seenColor: TR }),
                    // no seen colour named: a plain box, an ordinary box door, and a see-through wall drawn as a line
                    pc('q1'), bx('q2', { doorOpen: true, doorLock: true }), ln('q3', { sightType: 'wall', color: 'transparent' })
                ];
                const trMap = mapOf(trBoard, 'T'), inTr = trMap(), TR_IDS = trBoard().filter(w => !w.waiting).map(w => w.id);
                const TR_KEEP = ['t1', 't2', 't3', 't4', 't5', 't6', 't7', 't8', 't9', 't10', 't11', 't12', 't13', 't14', 't15', 't16', 't17', 't18'], TR_TICK = ['t1', 't3', 't5', 't7', 't8', 't9', 't11', 't13', 't14', 't18'], TR_OUT = TR_IDS.filter(id => /^u\d+$/.test(id));
                const wantTr = TR_IDS.map(id => (TR_KEEP.indexOf(id) >= 0 ? TR : NOKEY));
                const rTr = repl(trMap, depsS), mTr = merg(trMap, depsS);
                // each kept door exactly as the file had it, key for key in the file's order (the one that was open with its tick is shut), and
                // each other piece exactly as the file had it less the seen colour and a tick it may not carry
                const trWas = id => (id === 't1' ? less(byId(inTr, id), ['doorOpen']) : id === 't16' || id === 't17' ? less(byId(inTr, id), ['secret']) : TR_KEEP.indexOf(id) >= 0 ? byId(inTr, id) : less(byId(inTr, id), ['secret', 'seenColor'].concat(id === 'u17' ? ['barrier'] : [])));   // u17: a barrier flag that is no true does not come in either
                const trOff = m => (m ? TR_IDS.filter(id => Js(byId(m, id)) !== Js(trWas(id))) : ['no map']), trAsFile = m => trOff(m).length === 0;
                const trOnlyOk = m => wbOf(m).length > 0 && wbOf(m).every(w => !('seenColor' in w) || (w.seenColor === TR && FCs.secretOk(w) === true));
                check('import: Match a wall, round two (a see-through wall gives a see-through door): a file\'s seenColor that is the exact word transparent comes in as that word, on Replace and on Merge alike, piece for piece, only on a door that may be a secret door, a box or a line, with its tick or without it: a box door with its tick, a box door that was found, a door drawn as a line as Match leaves it at a see-through wall (the word beside a width, an opacity and a nib, all four kept), a found line that names the word and nothing else, a hidden box door and a hidden found line, a see-through barrier\'s door as a box and as a hidden line, a door that names a pattern or Plain color with the word (both kept), a filled region, a circle, a painted hex cell and a diamond that are doors, a shut door that names the word alone, a box door and a line whose tick is a word or a number (no tick comes in, and the door stays as open and as locked as the file had it, the word kept), and a line that names a pattern with the word (both kept, as the file had them); each keeps every other key as the file had it, in the file\'s order, its own colour among them, and a ticked one is shut; on every other piece the word is dropped with any tick beside it and the piece is otherwise as the file had it: a wall as a box, the see-through wall line a door would be matched to (whose own colour is the word and stays), a wall line with no type, a plain box, a plain line, a box and a line typed a door that are neither a wall nor a barrier, a picture, a text box, a token, a token drawn as a line, a GM-note card as a box and as a line, a wall or barrier flag that is no true, another spelling of the type, a line piece, a trigger zone, a triangle and a picture that a file marked fill; a waiting token does not come in at all; what kept a seen colour is exactly a piece the one judge says may be a secret door (fogcore secretOk)',
                    !!rTr && !!mTr && TR_IDS.length === trBoard().length - 1 && TR_OUT.length === 21 && Js(idsOf(rTr)) === Js(TR_IDS) && Js(idsOf(mTr)) === Js(TR_IDS) && Js(colOf(rTr)) === Js(wantTr) && Js(colOf(mTr)) === Js(wantTr) && Js(wbOf(rTr)) === Js(wbOf(mTr))
                    && Js(ticked(rTr)) === Js(TR_TICK) && Js(ticked(mTr)) === Js(TR_TICK) && trAsFile(rTr) && trAsFile(mTr) && trOnlyOk(rTr) && trOnlyOk(mTr) && judged(rTr) && judged(mTr) && lineOnly(rTr) && lineOnly(mTr)
                    && [rTr, mTr].every(m => byId(m, 't1').seenColor === TR && !('doorOpen' in byId(m, 't1')) && byId(m, 't1').doorLock === true && byId(m, 't1').color === '#7a5230' && byId(m, 't2').doorOpen === true && !('secret' in byId(m, 't2')) && Js(SEEN.map(k => byId(m, 't3')[k])) === Js([4, 0.5, 'round']) && byId(m, 't3').color === '#8a5a2b' && byId(m, 't4').doorOpen === true
                        && byId(m, 't5').hidden === true && byId(m, 't6').hidden === true && byId(m, 't6').tip === 'flat' && byId(m, 't7').color === TR && byId(m, 't7').barrier === true && byId(m, 't8').seenOpacity === 1 && byId(m, 't8').hidden === true && byId(m, 't9').seenTexture === 'bricks' && byId(m, 't10').seenTexture === '' && byId(m, 't10').doorOpen === true && byId(m, 't11').tip === 'fill'
                        && byId(m, 't16').doorOpen === true && byId(m, 't16').doorLock === true && !('secret' in byId(m, 't16')) && byId(m, 't17').doorOpen === true && byId(m, 't17').seenWidth === 4 && !('secret' in byId(m, 't17')) && byId(m, 't18').seenTexture === 'bricks' && byId(m, 't18').secret === true && byId(m, 't12').type === 'circle' && byId(m, 't13').fill === true && byId(m, 't14').type === 'diamond' && !('doorOpen' in byId(m, 't15')) && byId(m, 'u3').color === TR && byId(m, 'u3').sightType === 'wall' && byId(m, 'q3').color === TR && byId(m, 'u9').src === '/saves/images/m/door.png' && byId(m, 'u9').doorOpen === true && byId(m, 'u10').text === 'A note' && byId(m, 'u11').isChar === true && !byId(m, 'w1')),
                    Js([missCol(rTr, wantTr), missCol(mTr, wantTr), ticked(rTr), ticked(mTr), [rTr, mTr].map(m => [trOff(m), trOnlyOk(m), judged(m), lineOnly(m)]), Js(wbOf(rTr)) === Js(wbOf(mTr))]));

                // 18. the word itself: no other case of it, nothing beside it, and no other spelling of a colour that draws nothing (a value, and
                // what it comes in as; nothing: it does not come in), each on a box door with its tick and on a found door drawn as a line
                const CLEARS = [[TR, TR], ['Transparent'], ['TRANSPARENT'], ['tRANSPARENT'], ['transparenT'], [' transparent'], ['transparent '], ['\ttransparent'], ['transparent\n'], ['\ntransparent'], ['transparent\r\n'], [' transparent'], ['transparent '], ['trans parent'], ['transparen'], ['ransparent'], ['transparentt'], ['transparent;'], ['transparent;background:url(https://x.test/a.png)'], ['transparent !important'], ['"transparent"'], ['transparent,transparent'],
                    ['#00000000'], ['#0000'], ['#abcdef00'], ['#ABCDEF00'], ['#fff0'], ['rgba(0,0,0,0)'], ['rgba(0, 0, 0, 0)'], ['RGBA(0,0,0,0)'], ['rgba(255, 255, 255, 0.0)'], ['hsla(0, 0%, 0%, 0)'], ['rgb(0 0 0 / 0)'], ['none'], ['clear'], ['inherit'], ['currentColor'], [''], [['transparent']], [['transparent', 'transparent']], [[['transparent']]], [{ color: 'transparent' }], [{ 0: 'transparent', length: 1 }], [0], [1], [true], [false], [null]];
                const keptC = c => (c.length > 1 ? c[1] : NOKEY);
                const tvBoard = () => [].concat(
                    CLEARS.map((c, i) => bx('cb' + (i + 1), { secret: true, doorOpen: true, seenColor: c[0] })),
                    CLEARS.map((c, i) => ln('cl' + (i + 1), { doorOpen: true, seenColor: c[0], seenWidth: 4 })),
                    // the word in another case on a hidden see-through barrier's line, whose own colour is the word: the seen colour goes and the
                    // door's own stays; and a hex colour beside these, which comes in lower-cased as ever
                    [lnLess('cx1', ['blocksSight'], { barrier: true, hidden: true, color: 'transparent', secret: true, seenColor: 'Transparent', seenTip: 'flat' }), bx('cx2', { secret: true, seenColor: '#AbCdEf' }), ln('cx3', { seenColor: '#00FF00' })]);
                const tvMap = mapOf(tvBoard, 'C'), TV_IDS = tvBoard().map(w => w.id), wantTv = [].concat(CLEARS.map(keptC), CLEARS.map(keptC), [NOKEY, '#abcdef', '#00ff00']);
                const rTv = repl(tvMap, depsS), mTv = merg(tvMap, depsS);
                // the cleaner asked for each value by itself: the very word back, null for everything else, and null where nothing was named; a
                // text that is no plain string (an object that reads as the word when it is turned into text) is no word either
                const wordy = [Object('transparent'), { toString: () => TR }, { valueOf: () => TR, toString: () => TR }, [TR], Object.assign(() => TR, { toString: () => TR })];
                const saidC = f => typeof f === 'function' && CLEARS.every(c => f(c[0]) === (c.length > 1 ? c[1] : null)) && f(undefined) === null && f() === null && wordy.every(v => f(v) === null) && f('#AbCdEf') === '#abcdef';
                const tvBare = m => !!m && Js(byId(m, 'cb2')) === Js(bx('cb2', { secret: true })) && Js(byId(m, 'cl2')) === Js(ln('cl2', { doorOpen: true, seenWidth: 4 })) && Js(byId(m, 'cb23')) === Js(bx('cb23', { secret: true })) && Js(byId(m, 'cl28')) === Js(ln('cl28', { doorOpen: true, seenWidth: 4 })) && Js(byId(m, 'cx1')) === Js(lnLess('cx1', ['blocksSight'], { barrier: true, hidden: true, color: 'transparent', secret: true, seenTip: 'flat' }));
                check('import: Match a wall, round two, the word itself: seenColor comes in as transparent only for that exact word, on Replace and on Merge alike, piece for piece, on a box door with its tick and on a found door drawn as a line: the word in another case (Transparent, TRANSPARENT, tRANSPARENT, transparenT), with a space, a tab, a line break or a no-break space before or after it, cut in two, a letter short at either end or a letter long, with a semicolon, a declaration or !important after it, in quotes, twice with a comma, inside a list, inside a list of lists and inside an object, and every other spelling of a colour that draws nothing (#00000000, #0000, #abcdef00 in either case, #fff0, rgba() and hsla() with an alpha of 0, rgb() with a slash, none, clear, inherit, currentColor), an empty text, a number, true, false and nothing are dropped, and such a door is left exactly the door it is without a seen colour, its tick, its width and its own colour as they were; a hex colour beside them comes in lower-cased as ever; the cleaner itself (fogcore cleanSeenColor) says the same of every value, hands the word back as the very word, answers null where nothing was named and null for an object that only reads as the word once it is turned into text',
                    !!rTv && !!mTv && TV_IDS.length === 2 * CLEARS.length + 3 && CLEARS.filter(c => c.length > 1).length === 1 && CLEARS.length === 48 && Js(idsOf(rTv)) === Js(TV_IDS) && Js(idsOf(mTv)) === Js(TV_IDS) && Js(colOf(rTv)) === Js(wantTv) && Js(colOf(mTv)) === Js(wantTv) && Js(wbOf(rTv)) === Js(wbOf(mTv))
                    && colOf(mTv).filter(c => c === TR).length === 2 && colDrift(rTv, repl(bareCol(tvMap), depsS)).length === 0 && colDrift(mTv, merg(bareCol(tvMap), depsS)).length === 0 && tvBare(rTv) && tvBare(mTv) && judged(rTv) && judged(mTv)
                    && wbOf(mTv).filter(w => /^cb\d+$/.test(w.id)).every(w => w.secret === true && !('doorOpen' in w)) && wbOf(mTv).filter(w => /^cl\d+$/.test(w.id)).every(w => w.doorOpen === true && w.seenWidth === 4 && !('secret' in w)) && saidC(FCs.cleanSeenColor),
                    Js([missCol(rTv, wantTv), missCol(mTv, wantTv), colDrift(rTv, repl(bareCol(tvMap), depsS)), colDrift(mTv, merg(bareCol(tvMap), depsS)), [rTv, mTv].map(m => [tvBare(m), judged(m)]), saidC(FCs.cleanSeenColor)]));

                // 19. what is written is the colour cleaner's own answer, and the import knows no word of its own: a core whose colour cleaner
                // answers a hex colour for the word, the word for a hex colour, an empty text, nothing at all and null
                const oddC = { DR: DOC, sanitize, FC: Object.assign({}, FCs, { cleanSeenColor: v => (v === TR ? '#010203' : v === '#445566' ? TR : v === '#778899' ? '' : v === '#aabbcc' ? undefined : null) }) };
                const ocBoard = () => [bx('o1', { secret: true, seenColor: TR }), ln('o2', { doorOpen: true, seenColor: TR, seenWidth: 4 }), bx('o3', { seenColor: '#445566' }), ln('o4', { secret: true, seenColor: '#445566' }), bx('o5', { secret: true, seenColor: '#778899' }), ln('o6', { seenColor: '#aabbcc' }), bx('o7', { secret: true, seenColor: '#123456' }),
                    pc('o8', { blocksSight: true, sightType: 'wall', seenColor: TR }), ln('o9', { sightType: 'wall', seenColor: '#445566' }), pc('o10', { seenColor: TR })];
                const ocMap = mapOf(ocBoard, 'O'), wantOc = ['#010203', '#010203', TR, TR, NOKEY, NOKEY, NOKEY, NOKEY, NOKEY, NOKEY];
                const mOc = merg(ocMap, oddC), rOc = repl(ocMap, Object.assign({ migrate }, oddC));
                // a fog core from before round two: its colour cleaner knows a hex colour and not the word
                const before2 = { DR: DOC, sanitize, FC: Object.assign({}, FCs, { cleanSeenColor: v => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null) }) };
                const mB2 = merg(trMap, before2), rB2 = repl(trMap, Object.assign({ migrate }, before2)), mB2v = merg(tvMap, before2);
                check('import: Match a wall, round two, what is written for a seen colour is the answer of the colour\'s own cleaner and the import knows no word of its own: with a core whose colour cleaner answers a hex colour for the word, a door that named the word holds that hex colour, a box and a line alike; where it answers the word for a hex colour the door holds the word; where it answers an empty text, nothing at all or null the key is gone; a wall and a plain piece keep no seen colour whatever the cleaner would answer; with a fog core from before round two, whose colour cleaner knows a hex colour and not the word, the word comes in on no piece while every tick, every width, opacity and nib and every hex colour comes in as with the whole core; on Replace and on Merge alike, nothing else of a piece changed',
                    !!mOc && !!rOc && Js(colOf(mOc)) === Js(wantOc) && Js(colOf(rOc)) === Js(wantOc) && Js(wbOf(rOc)) === Js(wbOf(mOc)) && colDrift(mOc, merg(bareCol(ocMap), oddC)).length === 0 && Js(ticked(mOc)) === Js(['o1', 'o4', 'o5', 'o7']) && byId(mOc, 'o2').seenWidth === 4 && byId(mOc, 'o2').doorOpen === true
                    && !!mB2 && !!rB2 && !wbOf(mB2).concat(wbOf(rB2)).some(w => 'seenColor' in w) && Js(wbOf(mB2)) === Js(wbOf(rB2)) && Js(ticked(mB2)) === Js(TR_TICK) && Js(seenOf(mB2)) === Js(seenOf(mTr)) && Js(secOf(mB2).map(r => r[2])) === Js(secOf(mTr).map(r => r[2])) && colDrift(mTr, mB2).length === 0
                    && !!mB2v && Js(colOf(mB2v)) === Js(wantTv.map(c => (c === TR ? NOKEY : c))) && byId(mB2v, 'cx2').seenColor === '#abcdef',
                    Js([missCol(mOc, wantOc), missCol(rOc, wantOc), ticked(mOc), colDrift(mOc, merg(bareCol(ocMap), oddC)), colOf(mB2).filter(c => c !== NOKEY), colDrift(mTr, mB2)]));

                // 20. no cleaner at hand: the word does not come in
                const NOCOL = [['no fog core', { DR: DOC, sanitize }], ['a fog core from before the secret door', core([])], ['the tick\'s cleaners and not the look\'s', core(SK)], ['every cleaner of a secret door but the colour\'s', core(SK.concat(['cleanSeenTexture'], SEENF))],
                    ['the look\'s cleaners with neither the tick\'s cleaner nor the judge', core(['cleanSeenColor', 'cleanSeenTexture'].concat(SEENF))], ['the colour\'s cleaner and the judge without the tick\'s cleaner', core(['secretOk', 'cleanSeenColor'])], ['the colour\'s cleaner and the tick\'s cleaner without the judge', core(['cleanSecret', 'cleanSeenColor'])],
                    ['the whole core without its light cleaner, which the import takes for no fog core', { DR: DOC, sanitize, FC: Object.assign({}, FCs, { cleanLight: null }) }]];
                const noColBad = [];
                NOCOL.forEach(n => [['the file of doors', trMap, TR_IDS], ['the file of spellings', tvMap, TV_IDS], ['the file of answers', ocMap, ocBoard().map(w => w.id)]].forEach(f => [['Merge', merg, n[1]], ['Replace', repl, Object.assign({ migrate }, n[1])]].forEach(g => { const got = g[1](f[1], g[2]), ctl = g[1](bareCol(f[1]), g[2]);
                    if (!(got && ctl && Js(idsOf(got)) === Js(f[2]) && !wbOf(got).some(w => 'seenColor' in w) && Js(wbOf(got)) === Js(wbOf(ctl)) && Js(less(got, ['whiteboard'])) === Js(less(ctl, ['whiteboard'])))) noColBad.push(g[0] + ', ' + n[0] + ', ' + f[0]); })));
                const mNoTr = merg(trMap, { DR: DOC, sanitize }), rNoTr = repl(trMap, deps), mTickTr = merg(trMap, core(SK)), mLessC = merg(trMap, core(SK.concat(['cleanSeenTexture'], SEENF)));
                const trWordTrue = trBoard().filter(w => !w.waiting && w.secret === true).map(w => w.id);   // every piece whose tick was the word true, a wall, a picture and a token among them
                check('import: Match a wall, round two, with no cleaner for it at hand the word transparent comes in on no piece: on Merge and on Replace (no fog core, a fog core from before the secret door, the tick\'s cleaners and not the look\'s, every cleaner of a secret door but the colour\'s, the look\'s cleaners with neither the tick\'s cleaner nor the judge, with the judge and not the tick\'s cleaner, with the tick\'s cleaner and not the judge, the whole core without its light cleaner), from a file of doors, a file of spellings and a file of answers; every piece itself is kept and stands exactly as the same file stands with no seen colour named, so with no fog core a tick that is the word true still stays and its door is still shut; with the tick\'s cleaners alone the ticks come in as with the whole core and no look does; with every cleaner but the colour\'s the pattern, the width, the opacity and the nib come in beside the tick and the colour alone does not',
                    noColBad.length === 0 && NOCOL.length === 8 && typeof NOCOL[7][1].FC.cleanSeenColor === 'function' && typeof NOCOL[7][1].FC.secretOk === 'function' && typeof NOCOL[3][1].FC.cleanSeenWidth === 'function' && typeof NOCOL[3][1].FC.cleanSeenColor !== 'function'
                    && Js(ticked(mNoTr)) === Js(trWordTrue) && trWordTrue.length === TR_TICK.length + 9 && Js(wbOf(rNoTr)) === Js(wbOf(mNoTr)) && !('doorOpen' in byId(mNoTr, 't1')) && byId(mNoTr, 't2').doorOpen === true && !wbOf(mNoTr).some(w => SIX.some(k => k !== 'secret' && k in w))
                    && Js(ticked(mTickTr)) === Js(TR_TICK) && !wbOf(mTickTr).some(w => SIX.some(k => k !== 'secret' && k in w))
                    && Js(ticked(mLessC)) === Js(TR_TICK) && !wbOf(mLessC).some(w => 'seenColor' in w) && Js(seenOf(mLessC)) === Js(seenOf(mTr)) && byId(mLessC, 't9').seenTexture === 'bricks' && byId(mLessC, 't10').seenTexture === '' && Js(SEEN.map(k => byId(mLessC, 't3')[k])) === Js([4, 0.5, 'round']),
                    Js([noColBad, ticked(mNoTr), ticked(mTickTr), ticked(mLessC), colOf(mLessC).filter(c => c !== NOKEY)]));

                // 21. what round two did not move: a piece's own width, opacity, nib and lock, and its own colour. A wall drawn as a line as a file
                // may hold one (its width as text, a width of 0, a negative one, none; an opacity of 1, one as text, one past 1, one of 0; a nib
                // the app does not know, another case, none; locked in place by true and by other values), a see-through wall line in four
                // spellings, matched and found secret doors with the same oddities of their own, and locked boxes, a locked token among them
                const wl = (id, extra) => ln(id, Object.assign({ sightType: 'wall' }, extra));   // a wall drawn as a line
                const owBoard = () => [
                    wl('g1', { strokeWidth: '6' }), wl('g2', { strokeWidth: '6px', opacity: 1, tip: 'butt', locked: true }), wl('g3', { strokeWidth: 0, opacity: '0.5', tip: 'Round', locked: 'yes' }), wl('g4', { strokeWidth: -2, opacity: 2, tip: 'flat', locked: 1 }),
                    lnLess('g5', ['strokeWidth', 'tip'], { sightType: 'wall', opacity: 0, locked: false }), wl('g6', { color: 'transparent', locked: true }), wl('g7', { color: 'Transparent', strokeWidth: 12.5, opacity: 0.999 }), wl('g8', { color: '#00000000' }), wl('g9', { color: 'rgba(0, 0, 0, 0)', w: 200, h: 12 }),
                    lnLess('g10', ['blocksSight'], { sightType: 'wall', barrier: true, locked: true, strokeWidth: '3.5', opacity: '1' }),
                    ln('h1', { secret: true, locked: true, strokeWidth: '6', opacity: 1, tip: 'butt', seenColor: TR, seenWidth: 4, seenOpacity: 0.5, seenTip: 'round' }),
                    ln('h2', { secret: true, doorOpen: true, locked: true, color: 'TRANSPARENT', strokeWidth: 0, opacity: '0.5', seenColor: TR }),
                    ln('h3', { doorOpen: true, locked: true, strokeWidth: -2, opacity: 2, tip: 'Round', w: 200, h: 12, seenColor: '#AABBCC', seenWidth: 9 }),
                    lnLess('h4', ['strokeWidth', 'tip'], { secret: true, hidden: true, locked: true, seenColor: TR, seenOpacity: 1, seenTip: 'flat' }),
                    bx('h5', { secret: true, locked: true, opacity: 0.4, seenColor: TR }), bx('h6', { doorOpen: true, locked: true, opacity: '0.4' }),
                    pc('h7', { blocksSight: true, sightType: 'wall', locked: true, opacity: 0.5 }), pc('h8', { locked: true, strokeWidth: '2', tip: 'butt' }), Object.assign(pc('h9', { isChar: true, charName: 'Guard', locked: true, opacity: 1 }), { type: 'circle' })];
                const owMap = mapOf(owBoard, 'G'), inOw = owMap(), OW_IDS = owBoard().map(w => w.id), OWN4 = ['strokeWidth', 'opacity', 'tip', 'locked'];
                const rOw = repl(owMap, depsS), mOw = merg(owMap, depsS), gOw = mergeS(hereNew(), fileOf(owMap()), depsS), mNoOw = merg(owMap, { DR: DOC, sanitize }), rNoOw = repl(owMap, deps);
                const own4 = m => wbOf(m).map(w => OWN4.map(k => (k in w ? w[k] : NOKEY)).concat([w.color])), wantOwn4 = wbOf(inOw).map(w => OWN4.map(k => (k in w ? w[k] : NOKEY)).concat([w.color]));
                // each piece exactly as the file had it: the one door that was open with its tick is shut, and one seen colour is lower-cased
                const owOff = m => (m ? OW_IDS.filter(id => Js(byId(m, id)) !== Js(id === 'h2' ? less(byId(inOw, id), ['doorOpen']) : id === 'h3' ? Object.assign({}, byId(inOw, id), { seenColor: '#aabbcc' }) : byId(inOw, id))) : ['no map']), owAsFile = m => owOff(m).length === 0;
                // with no fog core: the same, less every key of the look (and a see-through barrier's flag, which comes in with no cleaner either)
                const owNoOff = m => (m ? OW_IDS.filter(id => Js(byId(m, id)) !== Js(less(byId(inOw, id), ['seenColor', 'seenTexture'].concat(SEEN, id === 'h2' ? ['doorOpen'] : [], id === 'g10' ? ['barrier'] : [])))) : ['no map']), owNoCore = m => owNoOff(m).length === 0;
                const h1 = byId(rOw, 'h1') || {}, h2 = byId(rOw, 'h2') || {}, h5 = byId(rOw, 'h5') || {}, t9r = byId(rTr, 't9') || {}, t1r = byId(rTr, 't1') || {}, t3r = byId(rTr, 't3') || {}, t18r = byId(rTr, 't18') || {};
                const seenH1 = FCs.secretSeen(h1), seenH2 = FCs.secretSeen(h2), seenH5 = FCs.secretSeen(h5), seenT9 = FCs.secretSeen(t9r), seenT1 = FCs.secretSeen(t1r), seenT3 = FCs.secretSeen(t3r);
                check('import: Match a wall, round two moved nothing else of the import: a piece\'s own width, opacity, nib and lock, and its own colour, come in exactly as the file had them, on Replace, on Merge and through main.js mergeAppState, with the fog core at hand and with none: a wall drawn as a line whose width is text, text with a unit, 0, a negative number or not named, whose opacity is 1, text, past 1 or 0, whose nib is one the app does not know, in another case or not named, and whose lock is true, a word, a number or false; a see-through wall line under four spellings of a colour that draws nothing; a see-through barrier\'s wall line; a matched secret door, a found one and a hidden one with the same oddities of their own and locked in place; a locked box door, a locked wall, a locked plain piece and a locked token; every piece is key for key the file\'s own, in the file\'s order, but for a ticked door that was open (shut) and a seen colour written in capitals (lower-cased), so the GM\'s own save keeps what was drawn; it is the copy made for the players that carries no lock (fogcore secretSeen: a matched door\'s copy at the matched width, opacity and nib, in the word transparent where that was matched, with no lock and none of the six keys; a see-through box door\'s copy with no pattern, and with the pattern where one was named with the word; a line that named a pattern with the word still reads as nothing drawn, since a line wears no pattern), while the door that came in keeps its own',
                    !!rOw && !!mOw && OW_IDS.length === 19 && Js(idsOf(rOw)) === Js(OW_IDS) && Js(idsOf(mOw)) === Js(OW_IDS) && owAsFile(rOw) && owAsFile(mOw) && owAsFile(gOw.map) && Js(wbOf(rOw)) === Js(wbOf(mOw)) && Js(own4(rOw)) === Js(wantOwn4) && Js(own4(mOw)) === Js(wantOwn4) && Js(own4(gOw.map)) === Js(wantOwn4)
                    && owNoCore(mNoOw) && owNoCore(rNoOw) && Js(own4(mNoOw)) === Js(wantOwn4) && Js(own4(rNoOw)) === Js(wantOwn4)
                    && [rOw, mOw].every(m => byId(m, 'g1').strokeWidth === '6' && byId(m, 'g2').strokeWidth === '6px' && byId(m, 'g2').opacity === 1 && byId(m, 'g2').tip === 'butt' && byId(m, 'g2').locked === true && byId(m, 'g3').strokeWidth === 0 && byId(m, 'g3').opacity === '0.5' && byId(m, 'g3').tip === 'Round' && byId(m, 'g3').locked === 'yes' && byId(m, 'g4').strokeWidth === -2 && byId(m, 'g4').opacity === 2 && byId(m, 'g4').locked === 1
                        && !('strokeWidth' in byId(m, 'g5')) && !('tip' in byId(m, 'g5')) && byId(m, 'g5').opacity === 0 && byId(m, 'g5').locked === false && byId(m, 'g6').locked === true && byId(m, 'g6').color === TR && byId(m, 'g7').color === 'Transparent' && byId(m, 'g8').color === '#00000000' && byId(m, 'g9').color === 'rgba(0, 0, 0, 0)' && byId(m, 'g9').w === 200 && byId(m, 'g10').locked === true && byId(m, 'g10').opacity === '1'
                        && byId(m, 'h1').locked === true && byId(m, 'h1').strokeWidth === '6' && byId(m, 'h1').opacity === 1 && byId(m, 'h1').tip === 'butt' && byId(m, 'h1').seenColor === TR && byId(m, 'h2').locked === true && byId(m, 'h2').color === 'TRANSPARENT' && !('doorOpen' in byId(m, 'h2')) && byId(m, 'h3').locked === true && byId(m, 'h3').seenColor === '#aabbcc' && byId(m, 'h3').doorOpen === true
                        && byId(m, 'h4').locked === true && byId(m, 'h4').hidden === true && byId(m, 'h5').locked === true && byId(m, 'h5').opacity === 0.4 && byId(m, 'h6').locked === true && byId(m, 'h6').opacity === '0.4' && byId(m, 'h7').locked === true && byId(m, 'h8').locked === true && byId(m, 'h8').strokeWidth === '2' && byId(m, 'h9').locked === true && byId(m, 'h9').isChar === true)
                    && seenH1 !== h1 && seenH1.sightType === 'wall' && seenH1.color === TR && seenH1.strokeWidth === 4 && seenH1.opacity === 0.5 && seenH1.tip === 'round' && !('locked' in seenH1) && !SIX.some(k => k in seenH1) && h1.locked === true && h1.strokeWidth === '6'
                    && seenH2.color === TR && !('locked' in seenH2) && h2.color === 'TRANSPARENT' && h2.locked === true
                    && seenH5.color === TR && !('texture' in seenH5) && !('locked' in seenH5) && h5.locked === true && Js(FCs.secretLook(h5)) === Js({ color: TR, texture: '', clear: true })
                    && Js(FCs.secretLook(t9r)) === Js({ color: TR, texture: 'bricks', clear: false }) && seenT9.color === TR && seenT9.texture === 'bricks' && Js(FCs.secretLook(t1r)) === Js({ color: TR, texture: '', clear: true }) && seenT1.color === TR && !('texture' in seenT1) && seenT1.sightType === 'wall'
                    && Js(FCs.secretLook(t3r)) === Js({ color: TR, texture: '', clear: true, width: 4, opacity: 0.5, tip: 'round' }) && seenT3.color === TR && seenT3.strokeWidth === 4 && seenT3.opacity === 0.5 && seenT3.tip === 'round' && !SIX.some(k => k in seenT3)
                    && t18r.seenTexture === 'bricks' && Js(FCs.secretLook(t18r)) === Js({ color: TR, texture: '', clear: true }) && FCs.secretSeen(t18r).color === TR && !('texture' in FCs.secretSeen(t18r)),
                    Js([[rOw, mOw, gOw.map].map(m => [owOff(m), Js(own4(m)) === Js(wantOwn4)]), [mNoOw, rNoOw].map(m => [owNoOff(m), Js(own4(m)) === Js(wantOwn4)]), seenH1, seenH2, seenH5, FCs.secretLook(t9r), FCs.secretLook(t1r), FCs.secretLook(t3r)]));

                // 22. nothing else of a piece changes for the word, and a file cleaned twice is the file cleaned once
                const trMoved = [];
                [['Replace', repl, depsS], ['Merge', merg, depsS], ['Merge with a fog core from before round two', merg, before2], ['Merge with the tick\'s cleaners and not the look\'s', merg, core(SK)]].forEach(r => [['the file of doors', trMap], ['the file of spellings', tvMap], ['the file of a piece\'s own keys', owMap]].forEach(f => { const d = colDrift(r[1](f[1], r[2]), r[1](bareCol(f[1]), r[2])); if (d.length) trMoved.push(r[0] + ', ' + f[0] + ': ' + d.join(' ')); }));
                const trTwiceM = (() => { const ic = { items: { mSd: trMap(), mTv: Object.assign(tvMap(), { id: 'mTv' }), mOw: Object.assign(owMap(), { id: 'mOw' }) } }; cleanImportItems(ic, depsS); const once = Js(ic); cleanImportItems(ic, depsS); return once === Js(ic) && Js(colOf(ic.items.mSd)) === Js(wantTr) && Js(colOf(ic.items.mTv)) === Js(wantTv) && ic.items.mOw.whiteboard.length === OW_IDS.length; })();
                const trTwiceR = [rTr, rTv, rOw].every(m => { const again = cleanImport(JSON.parse(Js({ campaigns: { cSd: { id: 'cSd', name: 'S', items: { mSd: m } } } })), depsS); return !!again && Js(again.campaigns.cSd.items.mSd.whiteboard) === Js(wbOf(m)); });
                const trOddType = [mf => Object.assign(mf(), { type: 'board' }), mf => { const m = mf(); delete m.type; return m; }].every(alt => { const got = merg(() => alt(trMap), depsS); return !!got && got.type === 'map' && Js(wbOf(got)) === Js(wbOf(mTr)); });
                check('import: Match a wall, round two, the word changes nothing else: every piece of a file of doors, of a file of spellings and of a file of a piece\'s own keys, cleaned on Replace and on Merge, with the whole core, with a fog core from before round two and with the tick\'s cleaners alone, is key for key and in the same order the piece the same file gives with no seen colour named, but for the seen colour itself: no tick, pattern, width, opacity, nib, lock or open door follows the word, and the map around the pieces is the same; a file cleaned twice is the file cleaned once, on Merge and on Replace, the word still the word; a map under another type, or under none, is cleaned as the map it will be drawn as',
                    trMoved.length === 0 && trTwiceM && trTwiceR && trOddType, Js([trMoved, trTwiceM, trTwiceR, trOddType]));

                // 23. the import's Merge itself (main.js mergeAppState, sliced and run for real: mergeS above), the fog core as the app hands it
                // over (FCw above: fogcore.js run for real with a window), and a door as Properties' Match leaves it at a see-through wall
                const gTr = [mergeS(hereNew(), fileOf(trMap()), depsS), mergeS(hereOld(), fileOf(trMap()), depsS), mergeS(hereElse(), fileOf(trMap()), depsS), mergeS(hereNew(), fileOf(trMap()), depsS, true)];
                const gTv = [mergeS(hereNew(), fileOf(tvMap()), depsS), mergeS(hereNew(), fileOf(tvMap()), depsS, true)], gNoTr = mergeS(hereNew(), fileOf(trMap()), deps), gB2 = mergeS(hereNew(), fileOf(trMap()), before2, true);
                const wTr = FCw ? merg(trMap, { DR: DOC, sanitize, FC: FCw }) : null, wTv = FCw ? merg(tvMap, { DR: DOC, sanitize, FC: FCw }) : null, wOw = FCw ? merg(owMap, { DR: DOC, sanitize, FC: FCw }) : null;
                const ownTr = () => [ln('m1', { secret: true, seenColor: TR, seenWidth: 6, seenOpacity: 1, seenTip: 'round' }), ln('m2', { secret: true, locked: true, opacity: 0.6, w: 200, h: 12, seenColor: TR, seenWidth: 1.5, seenOpacity: 0.35, seenTip: 'flat' }),
                    lnLess('m3', ['blocksSight'], { barrier: true, hidden: true, color: 'transparent', secret: true, seenColor: TR, seenWidth: 10, seenOpacity: 0, seenTip: 'square' }), ln('m4', { doorOpen: true, seenColor: TR, seenWidth: 5, seenOpacity: 0.5, seenTip: 'square' }), wl('m5', { color: 'transparent', locked: true })];
                const ownTrMap = mapOf(ownTr, 'O'), rOwnTr = repl(ownTrMap, depsS), mOwnTr = merg(ownTrMap, depsS), gOwnTr = mergeS(hereNew(), fileOf(ownTrMap()), depsS);
                let ldTr = null, ldTrErr = '';
                try {
                    const migT = new Function('window', 'CATS', 'CURRENT_SCHEMA', 'createNewCampaign', '"use strict";\n' + ioSrc.slice(mi, mk) + '\nreturn function(d) { return migrateAppState(d).data; };')({ wpSystemCore: S, wpFormula: F, wpLibraryCore: LBC, wpFogCore: FCs }, { default: { label: 'Default', color: '#ccc' } }, 2, nm => ({ id: 'camp_v0', name: nm, items: {} }));
                    ldTr = [ownTrMap, owMap].map(mf => migT({ activeCampaignId: 'cSd', campaigns: { cSd: { id: 'cSd', name: 'S', activeItemId: 'mSd', items: { mSd: mf() } } } }).campaigns.cSd.items.mSd.whiteboard);
                } catch (e) { ldTrErr = String((e && e.message) || e); }
                check('import (main.js mergeAppState, sliced and run for real with the real cleanImport): a Merge brings a file\'s see-through doors in exactly as a Replace does, piece for piece, into a campaign that is here (the map new, or in the place of the map of that id), into a campaign that comes in new, and where the merge runs the item cleaners alone; a file of spellings alike; with no fog core at hand the merge brings in every piece and the word on none; with a fog core from before round two it brings in the ticks and the word on none; the fog core as the app hands it to the import (the object fogcore.js publishes as window.wpFogCore) says of every spelling what the module\'s own export says, the exact word kept and every other dropped, and brings the three files in exactly as the module\'s exports do; a door as Properties\' Match leaves it at a see-through wall (the word with a width, an opacity and a nib, on a shut door with its tick, a locked resized one, a hidden see-through barrier\'s and one that was found since) and the see-through wall itself, locked in place, come through a Replace, a Merge and main.js mergeAppState exactly as they were, key for key; and a load is no import: the load\'s own normaliser (io.js migrateAppState, run for real with the fog core at hand) leaves every piece of such a save as it stands, and with it a wall\'s and a door\'s own width, opacity, nib and lock under every odd value of the check above',
                    Js(gTr.map(g => g.r)) === Js([{ added: 1, updated: 0, newCamps: 0 }, { added: 0, updated: 1, newCamps: 0 }, { added: 0, updated: 0, newCamps: 1 }, { added: 1, updated: 0, newCamps: 0 }]) && wbOf(rTr).length === TR_IDS.length && gTr.every(g => Js(wbOf(g.map)) === Js(wbOf(rTr)) && Js(colOf(g.map)) === Js(wantTr) && Js(ticked(g.map)) === Js(TR_TICK))
                    && !byId(gTr[1].map, 'zz') && !byId(gTr[1].map, 'a1') && wbOf(rTv).length === TV_IDS.length && gTv.every(g => Js(wbOf(g.map)) === Js(wbOf(rTv)) && Js(colOf(g.map)) === Js(wantTv))
                    && Js(idsOf(gNoTr.map)) === Js(TR_IDS) && !wbOf(gNoTr.map).some(w => 'seenColor' in w) && Js(wbOf(gNoTr.map)) === Js(wbOf(rNoTr)) && Js(ticked(gNoTr.map)) === Js(trWordTrue) && Js(wbOf(gB2.map)) === Js(wbOf(mB2)) && Js(ticked(gB2.map)) === Js(TR_TICK)
                    && !fcErrS && !!FCw && saidC(FCw.cleanSeenColor) && COLS.every(c => FCw.cleanSeenColor(c[0]) === (c.length > 1 ? c[1] : null)) && wbOf(wTr).length === TR_IDS.length && Js(wbOf(wTr)) === Js(wbOf(mTr)) && Js(colOf(wTr)) === Js(wantTr) && Js(wbOf(wTv)) === Js(wbOf(mTv)) && Js(colOf(wTv)) === Js(wantTv) && Js(wbOf(wOw)) === Js(wbOf(mOw)) && wbOf(wOw).length === OW_IDS.length
                    && Js(wbOf(rOwnTr)) === Js(ownTr()) && Js(wbOf(mOwnTr)) === Js(ownTr()) && Js(wbOf(gOwnTr.map)) === Js(ownTr()) && Js(colOf(rOwnTr)) === Js([TR, TR, TR, TR, NOKEY]) && Js(seenOf(rOwnTr)) === Js([[6, 1, 'round'], [1.5, 0.35, 'flat'], [10, 0, 'square'], [5, 0.5, 'square'], NONE3]) && byId(rOwnTr, 'm2').locked === true && byId(rOwnTr, 'm5').locked === true
                    && !ldTrErr && !!ldTr && ldTr.length === 2 && Js(ldTr[0]) === Js(ownTr()) && Js(ldTr[1]) === Js(owBoard()),
                    ldTrErr || fcErrS || Js([gTr.map(g => [g.r, missCol(g.map, wantTr)]), gTv.map(g => missCol(g.map, wantTv)), colOf(gNoTr.map).filter(c => c !== NOKEY), !!FCw && saidC(FCw.cleanSeenColor), missCol(wTr, wantTr), missCol(wTv, wantTv), colOf(rOwnTr), seenOf(rOwnTr), ldTr && [Js(ldTr[0]) === Js(ownTr()), Js(ldTr[1]) === Js(owBoard())]]));

                // 24. Match a wall, rounds four and five: a colour that draws nothing with a blank beside it. No control of the app writes one, so a
                // file is how one comes, and the import leaves a piece's own colour exactly as the file had it (check 21). The board's own colour
                // rule (safecore cssColor) REFUSES such a text, and what the GM's board then draws depends on the KIND of piece. It writes a box's
                // fill as what the rule gives, which is nothing: a RECTANGLE and a CIRCLE get no fill at all, while a HEXAGON and a DIAMOND then
                // show the ground the style sheet gives them (var(--faint)). It writes a path's colour as that or ink: a LINE is stroked in ink
                // and a FILLED REGION is filled with it. So the players' copy of a secret door in ' transparent ' is see-through for a rectangle
                // and a circle ALONE. Round three read the text as written for every piece and gave such a box the Wall look (a brick box where
                // the GM's board shows none): flipped by round four. Round four read the text without its blanks for every piece that is no line,
                // so a hexagon, a diamond and a filled region were sent as nothing where the GM's board draws a piece: those three FLIP in round
                // five, to the Wall look. A door drawn as a line in such a colour takes the Wall colour, as in round four
                const SCc = await import(surl('safecore.js')), wbDraw = readSrc('whiteboard.js'), cssS = readSrc('../style.css');   // the board's colour rule, the two statements of the board that write a piece's colour, and the style sheet
                const ruleOf = sel => cssS.split('\n').filter(l => l.trim().indexOf(sel + ' {') === 0).join('\n');   // a shape's own rule in the style sheet
                const boxBare = ['.wb-item.rect', '.wb-item.circle'].every(s => ruleOf(s) !== '' && !/background/.test(ruleOf(s))), shapeGround = ['.wb-item.hexagon', '.wb-item.diamond'].every(s => ruleOf(s).includes(' background: var(--faint); }'));   // no ground of its own; a ground of its own
                const boardWrites = wbDraw.includes("? 'transparent' : cssColor(item.color);") && wbDraw.includes("_col = cssColor(item.color) || 'var(--ink)';");
                const PAD = [' transparent ', 'transparent ', ' transparent', '\ttransparent\n', ' Transparent ', ' #00000000 ', ' rgba(0, 0, 0, 0) '];   // each a colour that draws nothing once its blanks are off
                const shp = (id, type, extra) => Object.assign(bx(id, Object.assign({ secret: true }, extra)), { type });
                const rgn = (id, extra) => Object.assign(ln(id, Object.assign({ secret: true }, extra)), { tip: 'fill', pts: [[0, 0], [100, 0], [100, 6]] });   // a filled region that is a door
                const pdBoard = () => [].concat(
                    PAD.map((c, i) => bx('pb' + (i + 1), { secret: true, color: c })),   // a rectangle door in each spelling
                    PAD.map((c, i) => ln('pl' + (i + 1), { secret: true, color: c })),   // a door drawn as a line in each
                    [shp('ps1', 'circle', { color: PAD[0] }), shp('ps2', 'hexagon', { color: PAD[0] }), shp('ps3', 'diamond', { color: PAD[0] }), rgn('pr1', { color: PAD[0] }),   // the other kinds of piece that are no line
                        bx('pt1', { secret: true, color: PAD[0], texture: 'bricks' }),       // a pattern of its own: a look to hide
                        bx('pt4', { secret: true, color: PAD[0], texture: 'planks' }),       // another pattern of its own: hidden under the Wall's, never shown
                        bx('pt2', { secret: true, color: PAD[0], seenColor: '#445566' }),    // a colour named for it
                        bx('pt3', { secret: true, color: PAD[0], seenTexture: 'cobbles' }),  // a pattern named for it
                        bx('pc1', { secret: true, color: TR }), ln('pc2', { secret: true, color: TR }),   // the word itself, on a box and on a line: clear on both, as before
                        shp('pc4', 'hexagon', { color: TR }), shp('pc5', 'diamond', { color: TR }), rgn('pc6', { color: TR }),   // ... and on the three kinds that flipped: clear too, since the board draws the word as nothing on every kind
                        bx('pc3', { secret: true })]);                                       // a box in its own brown: the Wall look
                const pdMap = mapOf(pdBoard, 'P'), rPd = repl(pdMap, depsS), mPd = merg(pdMap, depsS), gPd = mergeS(hereNew(), fileOf(pdMap()), depsS), PD_IDS = pdBoard().map(w => w.id);
                const CLR = { color: TR, texture: '', clear: true }, WALLB = { color: '#3f3b47', texture: 'bricks', clear: false }, WALLL = { color: '#3f3b47', texture: '', clear: false };
                const pdWant = id => (/^pb\d$|^ps1$|^pc[12456]$/.test(id) ? CLR : /^pl\d$/.test(id) ? WALLL : id === 'pt2' ? { color: '#445566', texture: 'bricks', clear: false } : id === 'pt3' ? { color: '#3f3b47', texture: 'cobbles', clear: false } : WALLB);   // ps2, ps3 and pr1 (flipped by round five), pt1, pt4 and pc3: the Wall look
                const pdLooks = (m, core) => PD_IDS.filter(id => Js(core.secretLook(byId(m, id) || {})) !== Js(pdWant(id)));   // the pieces whose look is not the one above
                const pdSeen = m => PD_IDS.filter(id => { const w = byId(m, id) || {}, s = FCs.secretSeen(w), want = pdWant(id);
                    return !(s !== w && s.color === want.color && (want.texture ? s.texture === want.texture : !('texture' in s)) && s.sightType === 'wall' && !('secret' in s) && !('seenColor' in s) && !('seenTexture' in s) && w.secret === true); });
                const hexSeen = { id: 'ps2', type: 'hexagon', x: 100, y: 150, w: 50, h: 50, z: 10, layer: 'middle', color: '#3f3b47', blocksSight: true, sightType: 'wall', texture: 'bricks' };   // the players' copy of the hexagon, written out whole
                const rgnSeen = { id: 'pr1', type: 'path', x: 300, y: 100, w: 100, h: 6, baseW: 100, baseH: 6, z: 10, pts: [[0, 0], [100, 0], [100, 6]], strokeWidth: 6, tip: 'fill', color: '#3f3b47', layer: 'back-mid', blocksSight: true, sightType: 'wall', texture: 'bricks' };   // ... and of the filled region
                check('import: Match a wall, rounds four and five, a colour that draws nothing with blanks beside it: a file\'s own colour comes in exactly as written, blanks and all, on Replace, on Merge and through main.js mergeAppState, every piece key for key the file\'s own; the board\'s colour rule refuses each such text; the board writes a box\'s fill as what that rule gives and a path\'s colour as that or ink (its two statements pinned), and the style sheet gives a rectangle and a circle no ground of their own and a hexagon and a diamond one (their four rules pinned): so a rectangle and a circle draw nothing for it, a hexagon and a diamond their own ground, a line and a filled region ink; a secret door that is a rectangle or a circle in the word transparent with a blank before it, after it or on both sides, with a tab and a line break, in another case, or in a hex or an rgba colour of no opacity with blanks, is see-through to the players as it is on the GM\'s board: its copy is the word, with no pattern (round three gave it the Wall colour and bricks; flipped by round four, and kept by round five); a hexagon, a diamond and a filled region in such a text take the Wall look, colour and bricks, since the GM\'s board draws a piece there (round four sent them as nothing: flipped by round five), their copies written out whole; a door drawn as a line in each of the same texts takes the Wall colour, since the board draws that line in ink; such a box with a pattern of its own, or with a colour or a pattern named for it, is no see-through door and wears its look, and its own pattern is never the one shown; the word itself stays clear on every kind, the three that flipped among them, and a box in its own colour takes the Wall look; the fog core as the app hands it over reads every piece alike',
                    !!rPd && !!mPd && PD_IDS.length === 2 * PAD.length + 14 && PAD.length === 7 && Js(wbOf(rPd)) === Js(pdBoard()) && Js(wbOf(mPd)) === Js(pdBoard()) && Js(wbOf(gPd.map)) === Js(pdBoard()) && PAD.every((c, i) => byId(rPd, 'pb' + (i + 1)).color === c && byId(mPd, 'pl' + (i + 1)).color === c)
                    && PAD.every(c => SCc.cssColor(c) === '' && c.trim() !== c && SCc.cssColor(c.trim()) === c.trim()) && SCc.cssColor(TR) === TR && boardWrites && boxBare && shapeGround
                    && pdLooks(rPd, FCs).length === 0 && pdLooks(mPd, FCs).length === 0 && pdLooks(gPd.map, FCs).length === 0 && !!FCw && pdLooks(rPd, FCw).length === 0 && pdSeen(rPd).length === 0 && pdSeen(mPd).length === 0
                    && Js(FCs.secretLook(byId(rPd, 'pb1'))) === Js({ color: 'transparent', texture: '', clear: true }) && Js(FCs.secretLook(byId(rPd, 'ps1'))) === Js({ color: 'transparent', texture: '', clear: true }) && Js(FCs.secretLook(byId(rPd, 'pl1'))) === Js({ color: '#3f3b47', texture: '', clear: false })
                    && ['ps2', 'ps3', 'pr1'].every(id => Js(FCs.secretLook(byId(mPd, id))) === Js({ color: '#3f3b47', texture: 'bricks', clear: false })) && ['pc4', 'pc5', 'pc6'].every(id => Js(FCs.secretLook(byId(mPd, id))) === Js({ color: 'transparent', texture: '', clear: true }))
                    && Js(FCs.secretSeen(byId(mPd, 'ps2'))) === Js(hexSeen) && Js(FCs.secretSeen(byId(rPd, 'pr1'))) === Js(rgnSeen) && byId(mPd, 'ps2').color === ' transparent ' && byId(rPd, 'pr1').color === ' transparent ' && byId(rPd, 'pr1').secret === true
                    && FCs.secretSeen(byId(rPd, 'pb4')).color === 'transparent' && FCs.secretSeen(byId(rPd, 'pl4')).color === '#3f3b47' && byId(rPd, 'pb4').color === '\ttransparent\n' && FCs.secretSeen(byId(rPd, 'pt1')).texture === 'bricks' && FCs.secretSeen(byId(rPd, 'pt4')).texture === 'bricks',
                    Js([pdLooks(rPd, FCs), pdLooks(mPd, FCs), pdLooks(gPd.map, FCs), FCw ? pdLooks(rPd, FCw) : 'no core from the page', pdSeen(rPd), pdSeen(mPd), Js(wbOf(rPd)) === Js(pdBoard()), Js(wbOf(mPd)) === Js(pdBoard()), Js(wbOf(gPd.map)) === Js(pdBoard()), boardWrites, boxBare, shapeGround]));

                // 25. Match a wall, round five: every kind of secret door in every kind of colour text. Round five reads a piece's own colour as the
                // board's own rule reads the very text, and the rule is written out here in this suite's own words, in three classes:
                //   NONE     the board's rule takes the text and it draws nothing: the word transparent in any case, a hex colour of four or
                //            eight digits whose opacity digits are 0, or a lower-case rgba( or hsla( of four parts whose last is 0. Clear on EVERY kind
                //   INK      the board's rule takes it and it is anything else (a colour, a theme's name, three parts): the Wall look on every kind
                //   REFUSED  the board's rule does not take it (a blank or a no-break space beside it, RGBA in capitals, a slash, a 21st letter,
                //            a 41st character, a semicolon, no text at all). The GM's board then draws no fill on a rectangle and a circle, so those
                //            two are clear; a hexagon and a diamond show their own ground, a filled region is filled in ink and a line stroked in
                //            it, so those take the Wall look (a line the colour alone, as a line wears no pattern)
                // Against round four: a refused text that is no see-through colour once its blanks are off (' #7a5230 ', an empty text, a slash,
                // a 21st letter) FLIPS on a rectangle and a circle, from a brick box to clear, as the GM's board shows no fill there; RGBA in
                // capitals and a see-through colour of 41 characters FLIP on a line, a hexagon, a diamond and a region, from clear to the Wall look,
                // as the board draws those in ink or on their ground. Which class a text is in is written by hand below; the board's real rule
                // (safecore cssColor) and a reading of "draws nothing" in this suite's own words are held to those lists
                // Stated, not asserted (each needs a hand-made file; mw5/cleanupcheck-limits.mjs shows them): a colour that is NO TEXT at all (no colour key, a
                // number) is the Wall look on a rectangle too, though the board draws no fill for it; and a text the board's rule takes that a
                // browser reads as nothing drawn, or does not read at all (rgb( with a fourth part of 0, an opacity of 0%, the word none, a hex
                // colour of five digits), is the Wall look as any colour is
                const padTo = (head, tail, n) => head + ' '.repeat(n - head.length - tail.length) + tail;   // a text of exactly n characters, its blanks inside the brackets, where the board's rule allows them
                const P40C = padTo('rgba(0, 0, 0,', '0)', 40), P41C = padTo('rgba(0, 0, 0,', '0)', 41), P40R = padTo('rgb(255, 0, 0', ')', 40), P41R = padTo('rgb(255, 0, 0', ')', 41), W20 = 'abcdefghijklmnopqrst', W21 = W20 + 'u';
                const NONE_T = [TR, 'Transparent', 'TRANSPARENT', '#0000', '#FFF0', '#00000000', '#AbCdEf00', 'rgba(0,0,0,0)', 'rgba(12, 34, 56, 0.000)', 'hsla(120, 50%, 50%, 0)', 'rgba( 0 , 0 , 0 , 0 )', P40C];
                const INK_T = ['#7a5230', '#fff', '#ffff', '#0001', '#ffffffff', '#00000001', '#000000', 'red', 'rgba(255, 0, 0)', 'rgba(0, 0, 0, 0.5)', 'rgba(0,0,0,1)', 'rgb(1,2,3)', 'hsl(0, 0%, 0%)', 'var(--faint)', W20, P40R];
                const REF_T = PAD.concat([' #7a5230 ', '', 'RGBA(0,0,0,0)', 'HSLA(0, 0%, 0%, 0)', 'Rgba(0,0,0,0)', 'rgb(0 0 0 / 0)', W21, '#12', '#123456789', 'not a colour!', 'rgba(0,0,0,0);', P41C, P41R, 'transparent ']);
                const ruleTakes = c => SCc.cssColor(c, null) === c;   // the board's own rule, run for real: the very text, or the fallback handed in
                const noInk = c => c.toLowerCase() === TR
                    || (c.charAt(0) === '#' && (c.length === 5 || c.length === 9) && /^0+$/.test(c.slice(c.length === 5 ? 4 : 7)))
                    || ((c.indexOf('rgba(') === 0 || c.indexOf('hsla(') === 0) && c.charAt(c.length - 1) === ')' && (p => p.length === 4 && p.slice(0, 3).every(s => s.trim() !== '') && /^0(\.0+)?$/.test(p[3].trim()))(c.slice(5, -1).split(',')));
                const GK = [['rect', (id, c) => bx(id, { secret: true, color: c })], ['circle', (id, c) => shp(id, 'circle', { color: c })], ['hexagon', (id, c) => shp(id, 'hexagon', { color: c })], ['diamond', (id, c) => shp(id, 'diamond', { color: c })],
                    ['region', (id, c) => rgn(id, { color: c })], ['line', (id, c) => lnLess(id, ['tip'], { secret: true, color: c })], ['square line', (id, c) => ln(id, { secret: true, color: c })], ['flat line', (id, c) => ln(id, { secret: true, color: c, tip: 'flat' })]];
                const GT = NONE_T.map(c => [c, 'none']).concat(INK_T.map(c => [c, 'ink']), REF_T.map(c => [c, 'refused']));
                // ... and a rectangle in a refused text that has a look all the same: a pattern or a picture of its own, a colour or a pattern named for it
                const gxBoard = () => [bx('gx1', { secret: true, color: ' #7a5230 ', texture: 'planks' }), bx('gx2', { secret: true, color: '', texSrc: '/saves/images/m/door.png' }), bx('gx3', { secret: true, color: W21, seenColor: '#445566' }), bx('gx4', { secret: true, color: P41R, seenTexture: 'cobbles' })];
                const gdBoard = () => { const out = []; GK.forEach((k, ki) => GT.forEach((t, ti) => { out.push(k[1]('g' + ki + '_' + ti, t[0])); })); return out.concat(gxBoard()); };
                const gdMap = mapOf(gdBoard, 'G'), rGd = repl(gdMap, depsS), mGd = merg(gdMap, depsS), gGd = mergeS(hereNew(), fileOf(gdMap()), depsS);
                const isBox = ki => ki < 2, isLine = ki => ki > 4;   // a rectangle and a circle; a line of each nib
                const gdWant = (ki, cls) => (cls === 'none' || (cls === 'refused' && isBox(ki)) ? CLR : isLine(ki) ? WALLL : WALLB);
                const gdOff = (m, core) => { const off = []; GK.forEach((k, ki) => GT.forEach((t, ti) => { const w = byId(m, 'g' + ki + '_' + ti); if (!w || w.color !== t[0] || w.secret !== true || Js(core.secretLook(w)) !== Js(gdWant(ki, t[1]))) off.push(k[0] + ' in ' + Js(t[0]) + ': ' + (w ? Js(core.secretLook(w)) : 'no piece')); })); return off; };
                // the players' copy: the door less its tick, in the look's colour, typed a wall, with the look's pattern as its last key where the look has one
                const cpOf = (w, want) => { const s = {}; Object.keys(w).forEach(k => { if (k !== 'secret') s[k] = k === 'color' ? want.color : k === 'sightType' ? 'wall' : w[k]; }); if (want.texture) s.texture = want.texture; return s; };
                const gdSeenOff = (m, core) => { const off = []; GK.forEach((k, ki) => GT.forEach((t, ti) => { const w = byId(m, 'g' + ki + '_' + ti), s = w ? core.secretSeen(w) : null; if (!w || s === w || Js(s) !== Js(cpOf(w, gdWant(ki, t[1])))) off.push(k[0] + ' in ' + Js(t[0]) + ': ' + Js(s)); })); return off; };
                const lookAt = (m, kind, c) => { const ki = GK.findIndex(k => k[0] === kind), ti = GT.findIndex(t => t[0] === c), w = ki < 0 || ti < 0 ? null : byId(m, 'g' + ki + '_' + ti); return w ? Js(FCs.secretLook(w)) : 'no such piece'; };
                const sC = '{"color":"transparent","texture":"","clear":true}', sB = '{"color":"#3f3b47","texture":"bricks","clear":false}', sL = '{"color":"#3f3b47","texture":"","clear":false}';   // clear; the Wall look on a piece that wears a pattern; the Wall colour on a line
                const SPOT = [['hexagon', ' transparent ', sB], ['diamond', ' transparent ', sB], ['region', ' transparent ', sB], ['rect', ' transparent ', sC], ['circle', ' transparent ', sC], ['line', ' transparent ', sL],
                    ['rect', ' #7a5230 ', sC], ['circle', ' #7a5230 ', sC], ['hexagon', ' #7a5230 ', sB], ['flat line', ' #7a5230 ', sL], ['rect', '', sC], ['circle', '', sC], ['region', '', sB], ['line', '', sL],
                    ['rect', 'RGBA(0,0,0,0)', sC], ['line', 'RGBA(0,0,0,0)', sL], ['square line', 'RGBA(0,0,0,0)', sL], ['hexagon', 'RGBA(0,0,0,0)', sB], ['diamond', 'HSLA(0, 0%, 0%, 0)', sB], ['region', 'Rgba(0,0,0,0)', sB],
                    ['flat line', P41C, sL], ['flat line', P40C, sC], ['hexagon', P41C, sB], ['hexagon', P40C, sC], ['rect', P41C, sC], ['rect', P41R, sC], ['rect', P40R, sB], ['circle', P41R, sC], ['circle', P40R, sB],
                    ['diamond', W21, sB], ['rect', W21, sC], ['rect', W20, sB], ['rect', 'rgb(0 0 0 / 0)', sC], ['line', 'rgb(0 0 0 / 0)', sL], ['rect', 'transparent ', sC], ['hexagon', 'transparent ', sB],
                    ['square line', 'Transparent', sC], ['hexagon', 'TRANSPARENT', sC], ['region', TR, sC], ['line', '#0000', sC], ['diamond', '#AbCdEf00', sC], ['region', 'hsla(120, 50%, 50%, 0)', sC], ['circle', 'rgba( 0 , 0 , 0 , 0 )', sC],
                    ['region', '#7a5230', sB], ['line', '#7a5230', sL], ['rect', '#7a5230', sB], ['rect', 'rgba(255, 0, 0)', sB], ['rect', 'rgba(0, 0, 0, 0.5)', sB], ['rect', '#0001', sB], ['rect', '#00000001', sB], ['rect', '#ffff', sB], ['rect', '#fff', sB],
                    ['rect', 'var(--faint)', sB], ['rect', 'hsl(0, 0%, 0%)', sB], ['line', 'rgb(1,2,3)', sL], ['rect', '#12', sC], ['rect', '#123456789', sC], ['hexagon', '#123456789', sB], ['rect', 'rgba(0,0,0,0);', sC], ['line', 'rgba(0,0,0,0);', sL], ['circle', 'not a colour!', sC]];
                const spotOff = SPOT.filter(r => lookAt(rGd, r[0], r[1]) !== r[2] || lookAt(mGd, r[0], r[1]) !== r[2]).map(r => r[0] + ' in ' + Js(r[1]) + ': ' + lookAt(rGd, r[0], r[1]));
                const gxWant = { gx1: WALLB, gx2: WALLB, gx3: { color: '#445566', texture: 'bricks', clear: false }, gx4: { color: '#3f3b47', texture: 'cobbles', clear: false } };
                const gxOff = m => Object.keys(gxWant).filter(id => { const w = byId(m, id), s = w ? FCs.secretSeen(w) : null; return !(w && Js(FCs.secretLook(w)) === Js(gxWant[id]) && s !== w && s.color === gxWant[id].color && s.texture === gxWant[id].texture && !('texSrc' in s) && !('secret' in s) && !('seenColor' in s) && !('seenTexture' in s) && s.sightType === 'wall'); });
                const gdClear = m => wbOf(m).filter(w => /^g\d_\d+$/.test(w.id) && FCs.secretLook(w).clear === true).length;
                const rectSeen = { id: 'g0_' + GT.findIndex(t => t[0] === ' #7a5230 '), type: 'rect', x: 100, y: 150, w: 50, h: 50, z: 10, layer: 'middle', color: 'transparent', blocksSight: true, sightType: 'wall' };   // the players' copy of a rectangle in ' #7a5230 ', written out whole
                const lineSeen = { id: 'g5_' + GT.findIndex(t => t[0] === 'RGBA(0,0,0,0)'), type: 'path', x: 300, y: 100, w: 100, h: 6, baseW: 100, baseH: 6, z: 10, pts: [[0, 3], [100, 3]], strokeWidth: 6, color: '#3f3b47', layer: 'back-mid', blocksSight: true, sightType: 'wall' };   // ... and of a round line in RGBA(0,0,0,0)
                check('import: Match a wall, round five, every kind of secret door in every kind of colour text (' + GK.length + ' kinds: a rectangle, a circle, a hexagon, a diamond, a filled region and a line of each nib; ' + GT.length + ' texts): each comes in through a Replace, a Merge and main.js mergeAppState with its colour exactly as the file had it and its tick; the three lists of texts written by hand are what the board\'s own rule says of each text (safecore cssColor, run for real) and what a reading of "draws nothing" in this suite\'s own words says; a text the board\'s rule takes that draws nothing (the word in any case, a hex colour of four or eight digits with no opacity, rgba or hsla of four parts ending in 0, at 40 characters too) is clear on every kind; a text it takes that is a colour, a theme\'s name or anything else (three parts, an opacity of one in fifteen, a word of 20 letters, a colour of 40 characters) is the Wall look on every kind, a line the colour alone; a text it refuses (blanks, a no-break space, capitals in RGBA, a slash, a 21st letter, a 41st character, a semicolon, hex digits too few or too many, no text at all) is clear on a rectangle and a circle, which then draw no fill, and the Wall look on a hexagon, a diamond, a filled region and a line, which draw their own ground or ink; against round four a refused text that is no see-through colour flips on a rectangle and a circle (a brick box became clear), a see-through colour with a blank beside it flips on a hexagon, a diamond and a filled region, and RGBA in capitals and a see-through colour of 41 characters flip on those three and on a line of each nib (clear became the Wall look);' + SPOT.length + ' of the answers are written out one by one; the players\' copy of each door is the door less its tick, typed a wall, in the look\'s colour, with the look\'s pattern as its last key or no pattern at all, two of them written out whole; a rectangle in a refused text with a pattern or a picture of its own, or a colour or a pattern named for it, wears a look and never its own pattern or picture; the fog core as the app hands it over reads every piece alike',
                    !!rGd && !!mGd && GK.length === 8 && NONE_T.length === 12 && INK_T.length === 16 && REF_T.length === 21 && GT.length === 49 && new Set(GT.map(t => t[0])).size === 49 && P40C.length === 40 && P41C.length === 41 && P40R.length === 40 && P41R.length === 41 && W20.length === 20 && W21.length === 21
                    && NONE_T.every(c => ruleTakes(c) && noInk(c)) && INK_T.every(c => ruleTakes(c) && !noInk(c)) && REF_T.every(c => !ruleTakes(c) && SCc.cssColor(c) === '') && boardWrites && boxBare && shapeGround
                    && wbOf(rGd).length === 8 * 49 + 4 && Js(wbOf(rGd)) === Js(gdBoard()) && Js(wbOf(mGd)) === Js(gdBoard()) && Js(wbOf(gGd.map)) === Js(gdBoard())
                    && gdOff(rGd, FCs).length === 0 && gdOff(mGd, FCs).length === 0 && gdOff(gGd.map, FCs).length === 0 && !!FCw && gdOff(mGd, FCw).length === 0 && gdSeenOff(rGd, FCs).length === 0 && gdSeenOff(mGd, FCs).length === 0 && gdSeenOff(gGd.map, FCw).length === 0
                    && gdClear(rGd) === 12 * 8 + 21 * 2 && gdClear(mGd) === 138 && SPOT.length === 61 && spotOff.length === 0 && gxOff(rGd).length === 0 && gxOff(mGd).length === 0
                    && Js(FCs.secretSeen(byId(mGd, rectSeen.id))) === Js(rectSeen) && byId(mGd, rectSeen.id).color === ' #7a5230 ' && Js(FCs.secretSeen(byId(rGd, lineSeen.id))) === Js(lineSeen) && byId(rGd, lineSeen.id).color === 'RGBA(0,0,0,0)',
                    Js([gdOff(rGd, FCs).slice(0, 6), gdOff(mGd, FCs).slice(0, 3), FCw ? gdOff(mGd, FCw).slice(0, 3) : 'no core from the page', gdSeenOff(rGd, FCs).slice(0, 3), spotOff.slice(0, 6), gxOff(rGd), gdClear(rGd), wbOf(rGd).length, Js(wbOf(rGd)) === Js(gdBoard()), Js(wbOf(mGd)) === Js(gdBoard()), Js(wbOf(gGd.map)) === Js(gdBoard()),
                        NONE_T.filter(c => !(ruleTakes(c) && noInk(c))), INK_T.filter(c => !(ruleTakes(c) && !noInk(c))), REF_T.filter(c => ruleTakes(c))]));
            }
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
            const gi = ioSrc.indexOf('  function mergeLivePlayerState(snapC, live, acts, q) {'), gk = ioSrc.indexOf('  // Where the planner was being looked at', gi);
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
                // 127 (the owner, by prompt, 2026-10-06: the GM's Undo takes back what the GM did to a player's drawing, "and still never moves or erases
                // what the player did themselves"). The merge, run with the host's own count of what players did to their drawings (net.js, the
                // strokeacts slice run for real) and the count a state was taken at
                const saA = netSrc.indexOf('// [netcheck:strokeacts-start]'), saZ = netSrc.indexOf('// [netcheck:strokeacts-end]');
                const mkActs = () => { const net = {}; const api = new Function('net', '"use strict";\n' + (saA > 0 && saZ > saA ? netSrc.slice(saA, saZ) : 'throw new Error("no strokeacts slice");') + '\nreturn { note: strokeNote, acts: strokeActs, forget: strokeActsForget };')(net); api.net = net; return api; };
                const st = (id, more) => Object.assign({ id: id, type: 'path', byPlayer: true, ownerId: 'u_a', x: 10, y: 10, w: 20, h: 20, baseW: 20, baseH: 20, z: 35, pts: [[0, 0], [5, 5]], color: '#e9e9f0', strokeWidth: 3 }, more);
                const run = (snapB, liveB, acts, q) => { const snap = { whiteboard: cp(snapB) }, lv = { id: 'm', type: 'map', whiteboard: liveB }, was = jm(lv); merge(snap, lv, acts, q); const m = {}; snap.whiteboard.forEach(w => { m[w.id] = w; }); return { ids: snap.whiteboard.map(w => w.id).join(), m, liveSame: jm(lv) === was }; };
                const A1 = mkActs(); A1.note('c', 'm', 'added', 'a');
                const gmDid = { blocksSight: true, sightType: 'wall', locked: true, hidden: true, x: 99, color: '#ff0000' };
                const u1 = run([st('a')], [st('a', gmDid)], A1.acts('c', 'm'), 1), r1 = run([st('a', gmDid)], [st('a')], A1.acts('c', 'm'), 1);
                check('undo merge (127): what the GM did to a player\'s drawing is undone — a tick such as Blocks sight, Lock in place, Hide, a move and a colour all come back as the state had them, the drawing byte for byte the state\'s own — and a redo puts them back; the live map is left as it was',
                    jm(u1.m.a) === jm(st('a')) && u1.liveSame && jm(r1.m.a) === jm(st('a', gmDid)) && r1.liveSame, jm([u1.m.a, r1.m.a]));
                const A2 = mkActs(); A2.note('c', 'm', 'added', 'a'); A2.note('c', 'm', 'redrawn', 'a');   // added at 1, redrawn at 2
                const ownNow = { x: 50, y: 51, w: 9, h: 8, baseW: 7, baseH: 6, pts: [[0, 0], [9, 9]], color: '#112233', strokeWidth: 5, opacity: 0.5, tip: 'square' }, gmNow = { blocksSight: true, sightType: 'wall', locked: true, hidden: true, z: 99, rot: 45, name: 'A name of the GM\'s' };
                const liveRe = st('a', Object.assign({}, ownNow, gmNow)), u2 = run([st('a')], [liveRe], A2.acts('c', 'm'), 1), u2b = run([st('a')], [liveRe], A2.acts('c', 'm'), 2);
                const u2c = run([st('a', { opacity: 0.3 })], [st('a', { pts: [[0, 0], [9, 9]] })], A2.acts('c', 'm'), 1);   // a key their drawing no longer has
                check('undo merge (127): what its player redrew since the state was taken stays theirs — its points, place, size, colour, width, opacity and nib, each as a copy, and a key their drawing no longer has is dropped — while everything else comes back as the state had it: the GM\'s tick, lock, hiding, layer, turn and name are all undone; a redraw the state already holds (the state was taken at the redraw\'s number or after it) is no such thing: the drawing comes back byte for byte the state\'s own, the GM\'s move undone with the rest',
                    jm(u2.m.a) === jm(Object.assign({}, st('a'), ownNow)) && u2.m.a.pts !== liveRe.pts && u2.liveSame && jm(u2b.m.a) === jm(st('a')) && u2b.liveSame && !('opacity' in u2c.m.a) && jm(u2c.m.a.pts) === jm([[0, 0], [9, 9]]), jm([u2.m.a, u2b.m.a, u2c.m.a]));
                // Match a wall, round four (the third review, of io.js OWN: the GM's undo did not count the nib among what a player redrew). A player
                // hands the host the nib their line is drawn with (net.js playerStroke names it since round three, and a redraw lays it on the
                // host's line), so the nib is theirs as the points are: after a GM's Undo across a redraw the line has the nib it has NOW under
                // the points it has now, never the state's nib under the redraw's points. Each line below carries its nib as its last key, or
                // no nib key at all; the state's line is drawn with one, the line on the map has new points and another (or the same, or none)
                const NONIB = 'none', NIBS = [NONIB, 'round', 'square', 'flat'], P9 = [[0, 0], [9, 9]];
                const nibLine = (tip, more) => { const w = st('a', more); if (tip !== NONIB) w.tip = tip; return w; };
                const nibOf = w => (w && 'tip' in w ? String(w.tip) : NONIB);
                const nibRun = (sTip, lTip, acts, q) => run([nibLine(sTip)], [nibLine(lTip, { pts: P9 })], acts, q);
                const cannot = { addedAt: () => { throw new Error('x'); }, redrawnAt: () => { throw new Error('x'); }, erased: () => { throw new Error('x'); } };   // a count that cannot be asked
                const nibOff = [];
                NIBS.forEach(sTip => NIBS.forEach(lTip => {
                    const since = nibRun(sTip, lTip, A2.acts('c', 'm'), 1), held = nibRun(sTip, lTip, A2.acts('c', 'm'), 2), whole = nibRun(sTip, lTip), doubt = nibRun(sTip, lTip, cannot, 1);
                    const now = jm(nibLine(lTip, { pts: P9 })), then = jm(nibLine(sTip));   // the line as it is now, and the line as the state has it
                    if (jm(since.m.a) !== now || nibOf(since.m.a) !== lTip) nibOff.push('redrawn since, ' + sTip + ' then ' + lTip + ': ' + jm(since.m.a));
                    if (jm(held.m.a) !== then || nibOf(held.m.a) !== sTip) nibOff.push('the state holds the redraw, ' + sTip + ' then ' + lTip + ': ' + jm(held.m.a));
                    if (jm(whole.m.a) !== now) nibOff.push('no count, ' + sTip + ' then ' + lTip + ': ' + jm(whole.m.a));
                    if (jm(doubt.m.a) !== now) nibOff.push('a count that cannot be asked, ' + sTip + ' then ' + lTip + ': ' + jm(doubt.m.a));
                    if (!(since.liveSame && held.liveSame && whole.liveSame && doubt.liveSame)) nibOff.push('the live map changed, ' + sTip + ' then ' + lTip);
                }));
                const nibSay = (sTip, lTip, q) => nibOf(nibRun(sTip, lTip, A2.acts('c', 'm'), q).m.a);
                const nibBlank = run([nibLine('square')], [Object.assign(nibLine(NONIB, { pts: P9 }), { tip: undefined })], A2.acts('c', 'm'), 1).m.a;   // a nib key left on the line with no value
                check('undo merge (127), the nib (Match a wall, round four: the nib is among what a player hands the host, so it is among what they redrew): the nib of a line its player redrew since the state was taken comes back as the line has it NOW, under the points it has now — square, flat, or round by name, as the line\'s last key where the state\'s line named none — and with no nib key at all where the line names none now though the state\'s line did (a nib key left with no value is none); a redraw the state already holds brings the state\'s own line back, its nib with its points, whatever the line on the map says; with no count the line stays whole as it is now, as before; where the count cannot be asked the nib is its player\'s, as their points are; the state\'s nib and the line\'s nib are each tried as none, round, square and flat, sixteen pairs, and the live map is left as it was',
                    nibOff.length === 0 && NIBS.length === 4
                    && nibSay(NONIB, 'square', 1) === 'square' && nibSay(NONIB, 'flat', 1) === 'flat' && nibSay('flat', 'square', 1) === 'square' && nibSay('square', 'flat', 1) === 'flat' && nibSay('square', 'round', 1) === 'round'
                    && nibSay('square', NONIB, 1) === NONIB && nibSay('flat', NONIB, 1) === NONIB && nibSay(NONIB, NONIB, 1) === NONIB && !('tip' in nibBlank) && jm(nibBlank.pts) === jm(P9)
                    && nibSay('flat', 'square', 2) === 'flat' && nibSay(NONIB, 'square', 2) === NONIB && nibSay('square', NONIB, 2) === 'square'
                    && Object.keys(nibRun(NONIB, 'flat', A2.acts('c', 'm'), 1).m.a).pop() === 'tip', jm(nibOff.slice(0, 6)));
                // ... and no other key. What a player may hand the host is read from the host's own rule for a drawing handed to it (net.js
                // playerStroke, sliced and run for real, strict as the module runs, on a copy that names everything): every key of the drawing it
                // rebuilds, less the five that are the host's own word on every drawing (its id, its type, its level, its owner, and the mark that
                // a player drew it). Those keys are the line's as it is now after an Undo across a redraw, and every other key a piece may carry
                // is the state's. So a key the host's rule takes from a player later is one this check asks the undo for
                const psA = netSrc.indexOf('\nfunction playerStroke(w, pid) {'), psZ = psA > 0 ? netSrc.indexOf('\n}\n', psA) : -1;
                let PS = null, psErr = '';
                try { if (psA > 0 && psZ > psA) PS = new Function('"use strict";\n' + netSrc.slice(psA, psZ + 3) + '\nreturn playerStroke;')(); else psErr = 'net.js playerStroke was not found'; } catch (e) { psErr = String((e && e.message) || e); }
                const HOSTS = ['id', 'type', 'z', 'ownerId', 'byPlayer'], NOKEY2 = 'no key';
                // the keys that are the GM's on a piece, or a token's own: none is a drawing's player's to hand over
                const GMS = ['z', 'layer', 'rot', 'name', 'locked', 'hidden', 'blocksSight', 'sightType', 'barrier', 'blastStop', 'doorOpen', 'doorLock', 'secret', 'seenColor', 'seenTexture', 'seenWidth', 'seenOpacity', 'seenTip', 'texture', 'texSrc',
                    'texTile', 'fogHand', 'cover', 'terrain', 'height', 'ground', 'smoke', 'groupId', 'page', 'targetMapId', 'portalLock', 'fill', 'holes', 'aboveGrid', 'light', 'lightLock', 'front', 'elevation', 'posture'];
                const S0 = { x: 10, y: 11, w: 20, h: 21, baseW: 22, baseH: 23, pts: [[0, 0], [5, 5]], color: '#e9e9f0', strokeWidth: 3, opacity: 0.3, tip: 'flat' };          // a drawing's own keys as the state has them
                const L0 = { x: 50, y: 51, w: 9, h: 8, baseW: 7, baseH: 6, pts: [[0, 0], [9, 9], [4, 2]], color: '#112233', strokeWidth: 5, opacity: 0.5, tip: 'square' };   // ... and as the line on the map has them
                const sVal = k => (k in S0 ? cp(S0[k]) : 'the state\'s ' + k), lVal = k => (k in L0 ? cp(L0[k]) : 'the map\'s ' + k);
                const fullCopy = PS ? PS(Object.assign({ id: 'a', type: 'path', ownerId: 'u_a' }, GMS.reduce((o, k) => { o[k] = lVal(k); return o; }, {}), cp(L0), { byPlayer: 'no' }), 'u_a') : null;   // a copy that names everything
                const leastCopy = PS ? PS({ id: 'a', type: 'path', ownerId: 'u_a', pts: [[0, 0], [1, 1]] }, 'u_a') : null;                                                                             // ... and one that names as little as a drawing can
                const HANDED = fullCopy ? Object.keys(fullCopy).filter(k => HOSTS.indexOf(k) < 0) : [], HANDED0 = leastCopy ? Object.keys(leastCopy).filter(k => HOSTS.indexOf(k) < 0) : [], theirs = k => HANDED.indexOf(k) >= 0;
                const ALLK = HANDED.concat(GMS.filter(k => !theirs(k)));
                const bagOf = val => { const w = { id: 'a', type: 'path', byPlayer: true, ownerId: 'u_a' }; ALLK.forEach(k => { w[k] = val(k); }); return w; };   // a player's line that carries every key
                const less1 = (w, k) => { delete w[k]; return w; }, with1 = (w, k) => { w[k] = lVal(k); return w; };
                const sortd = w => jm(Object.keys(w).sort().map(k => [k, w[k]]));
                // the rule in this suite's own words: a key a player may hand the host is the line's as it is now (dropped where the line has none), any other is the state's
                const ruled = (s, l) => { const w = cp(s); HANDED.forEach(k => { if (l[k] !== undefined) w[k] = cp(l[k]); else delete w[k]; }); return w; };
                const sweepOff = []; let sweepN = 0;
                ALLK.forEach(k => {
                    // one key at a time, every other key the same on both sides: another value on the map; gone from the line on the map; on the map alone
                    [['another value', bagOf(sVal), with1(bagOf(sVal), k)], ['gone from the line', bagOf(sVal), less1(bagOf(sVal), k)], ['on the map alone', less1(bagOf(sVal), k), with1(bagOf(sVal), k)]].forEach(sc => {
                        const s = sc[1], l = sc[2], r1 = run([s], [l], A2.acts('c', 'm'), 1), r2 = run([s], [l], A2.acts('c', 'm'), 2), r0 = run([s], [l]), got = r1.m.a;
                        sweepN++;
                        const wantKey = theirs(k) ? (k in l ? jm(l[k]) : NOKEY2) : (k in s ? jm(s[k]) : NOKEY2), gotKey = k in got ? jm(got[k]) : NOKEY2;   // theirs: as the line has it now; the GM's: as the state has it
                        if (gotKey !== wantKey) sweepOff.push(k + ', ' + sc[0] + ': ' + gotKey + ' for ' + wantKey);
                        if (sortd(got) !== sortd(ruled(s, l))) sweepOff.push(k + ', ' + sc[0] + ': another key moved');
                        if (sortd(r2.m.a) !== sortd(s)) sweepOff.push(k + ', ' + sc[0] + ': a key moved though the state holds the redraw');
                        if (sortd(r0.m.a) !== sortd(l)) sweepOff.push(k + ', ' + sc[0] + ': not the line whole with no count');
                        if (!(r1.liveSame && r2.liveSame && r0.liveSame)) sweepOff.push(k + ', ' + sc[0] + ': the live map changed');
                    });
                });
                const allL = bagOf(lVal), all1 = run([bagOf(sVal)], [allL], A2.acts('c', 'm'), 1), allWant = bagOf(k => (theirs(k) ? lVal(k) : sVal(k)));   // every key at once
                const zero = run([st('a', { opacity: 0.3 })], [st('a', { x: 0, y: 0, opacity: 0, pts: P9 })], A2.acts('c', 'm'), 1).m.a;   // a value that is 0 is a value
                const signed = run([st('a')], [st('a', { byPlayer: 'u_a', pts: P9 })], A2.acts('c', 'm'), 1).m.a;                          // the mark that a player drew it is the state's
                check('undo merge (127), every key a player may hand the host and no other (Match a wall, round four): the host\'s own rule for a drawing handed to it (net.js playerStroke, run for real) rebuilds eleven keys beside the five that are the host\'s own word on every drawing (its id, type, level, owner and the mark that a player drew it): the place, the size and the base size, the points, the colour and the width, and the opacity and the nib where the copy names them; after a GM\'s Undo across a redraw exactly those eleven are the line\'s as it is now — another value is taken, a key the line no longer has is dropped, a key the state\'s line lacked is taken — one key at a time and all at once, each as a copy; and each of ' + GMS.length + ' other keys a piece may carry (its level, layer, turn, name, lock and hiding, what makes it a wall, a barrier, a door or a secret door and the look named for one, a pattern, a picture, a fog mark, cover, terrain, heights, smoke, a group, a page, a way through, a fill mark, holes, a light, a token\'s facing, elevation and posture) is the state\'s in all three cases, never taken from the line on the map; a place or an opacity of 0 is a value and is taken; a redraw the state already holds moves no key, and with no count the line stays whole as it is now',
                    !psErr && !!fullCopy && !!leastCopy && jm(HANDED.slice().sort()) === jm(['baseH', 'baseW', 'color', 'h', 'opacity', 'pts', 'strokeWidth', 'tip', 'w', 'x', 'y']) && jm(HANDED0.slice().sort()) === jm(['baseH', 'baseW', 'color', 'h', 'pts', 'strokeWidth', 'w', 'x', 'y'])
                    && jm(Object.keys(fullCopy).filter(k => HOSTS.indexOf(k) >= 0).sort()) === jm(HOSTS.slice().sort()) && fullCopy.z === 35 && fullCopy.byPlayer === true && fullCopy.ownerId === 'u_a' && fullCopy.tip === 'square' && fullCopy.opacity === 0.5 && jm(fullCopy.pts) === jm(L0.pts)
                    && GMS.length === 39 && ALLK.length === 50 && sweepN === 150 && sweepOff.length === 0
                    && sortd(all1.m.a) === sortd(allWant) && all1.m.a.tip === 'square' && all1.m.a.seenTip === 'the state\'s seenTip' && all1.m.a.pts !== allL.pts && all1.liveSame
                    && zero.x === 0 && zero.y === 0 && zero.opacity === 0 && signed.byPlayer === true && jm(signed.pts) === jm(P9),
                    psErr || jm([HANDED, HANDED0, sweepN, sweepOff.slice(0, 8), sortd(all1.m.a) === sortd(allWant), zero, signed.byPlayer]));
                const A3 = mkActs(); ['p', 'g'].forEach(id => A3.note('c', 'm', 'added', id)); A3.note('c', 'm', 'erased', 'p');
                const u3 = run([st('p'), st('g')], [], A3.acts('c', 'm'), 2);
                check('undo merge (127): a drawing its player erased stays erased, and one the GM removed comes back', u3.ids === 'g' && jm(u3.m.g) === jm(st('g')), u3.ids);
                const A4 = mkActs(); A4.note('c', 'm', 'added', 'old'); A4.note('c', 'm', 'added', 'n0'); A4.note('c', 'm', 'added', 'x1'); A4.note('c', 'm', 'added', 'x2'); A4.note('c', 'm', 'added', 'n1');
                const live4 = () => [st('old'), st('n0'), st('cut'), st('n1'), { id: 'tk', type: 'circle', isChar: true, ownerId: 'u_e', x: 1, y: 2 }];
                const u4 = run([st('old')], live4(), A4.acts('c', 'm'), 3), u4z = run([st('old')], live4(), A4.acts('c', 'm'), 0), u4n = run([st('old')], live4());
                check('undo merge (127): on the map only — a drawing a player added after the state was taken stays; one that was there when it was taken and is not in it (a later step of the GM\'s had removed it: a redo) goes; a piece that carries a player\'s marks but that no player added (the GM\'s eraser cut it, or the GM pasted it) goes; a player\'s token that arrived stays as ever; a state taken before any drawing was counted keeps every drawing a player added; with no count everything on the map stays, as before',
                    u4.ids === 'old,n1,tk' && u4z.ids === 'old,n0,n1,tk' && u4n.ids === 'old,n0,cut,n1,tk' && u4.liveSame, jm([u4.ids, u4z.ids, u4n.ids]));
                // on doubt, the player's work stays: a count that is not its three questions is no count, and a question that fails, or whose answer is
                // no answer, is answered for the player
                const bad = { addedAt: () => { throw new Error('x'); }, redrawnAt: () => { throw new Error('x'); }, erased: () => { throw new Error('x'); } };
                const dLive = () => [st('a', { x: 77, blocksSight: true }), st('n1')], dRun = (acts) => run([st('a'), st('p')], dLive(), acts, 1);
                const plain = () => ({ addedAt: () => 0, redrawnAt: () => 0, erased: () => false });   // every question answered plainly: all of it the GM's doing
                const dMiss = ['addedAt', 'redrawnAt', 'erased'].map(k => { const o = plain(); delete o[k]; return dRun(o); });   // one question missing, each in turn
                const d1 = dRun(bad), d2b = dRun({ addedAt: () => 0, redrawn: () => false, erased: () => false }), d3 = dRun('yes'), asBefore = d => d.ids === 'a,n1' && d.m.a.blocksSight === true && d.m.a.x === 77;
                const d4 = dRun({ addedAt: () => undefined, redrawnAt: () => 'x', erased: () => undefined }), d5 = dRun({ addedAt: () => NaN, redrawnAt: () => null, erased: () => 0 }), d6 = dRun(plain());
                const forThem = d => d.ids === 'a,n1' && d.m.a.x === 77 && !('blocksSight' in d.m.a);   // their erase an erase, their new line kept, their redraw kept — and the GM's tick undone all the same
                check('undo merge (127): on doubt the player\'s work stays — when a question cannot be asked, or is answered with what is no answer (no number for when, anything but a plain no for erased), their erase stays an erase, their drawing stays on the map and their redraw stays theirs, while the GM\'s tick is still undone; a count that is not its three questions (any one of them missing, one under another name), or no object at all, is no count, and every case is as it was before; with every question answered plainly the same map reads as the GM\'s doing throughout',
                    forThem(d1) && dMiss.length === 3 && dMiss.every(asBefore) && asBefore(d2b) && asBefore(d3) && forThem(d4) && forThem(d5) && d6.ids === 'a,p' && d6.m.a.x === 10 && !('blocksSight' in d6.m.a),
                    jm([d1.ids, d1.m.a, dMiss.map(d => [d.ids, d.m.a]), d2b.m.a, d3.m.a, d4.ids, d4.m.a, d5.ids, d5.m.a, d6.ids, d6.m.a]));
                // The owed review, 2026-10-09 (backlog 135): an id shared by a player's drawing and a piece that is no drawing names two things. A new
                // drawing can be handed in under the id of a piece the GM deleted; the merge matched the two by id alone and gave the GM's piece the
                // player as its owner, whose map copies then moved it
                const runBk = (snapB, liveB, acts, q) => { const snap = { whiteboard: cp(snapB) }, lv = { id: 'm', type: 'map', whiteboard: liveB }, back = merge(snap, lv, acts, q); return { wb: snap.whiteboard, back }; };
                const door = { id: 'X', type: 'rect', x: 5, y: 6, w: 40, h: 10, blocksSight: true, door: true }, tokS = { id: 'T', type: 'circle', isChar: true, charId: 'c1', x: 1, y: 2 }, mine = (id, more) => st(id, Object.assign({ ownerId: 'u_p' }, more));
                const A7 = mkActs(); A7.note('c', 'm', 'added', 'X'); A7.note('c', 'm', 'added', 'T');   // each handed in after the state was taken (at 0)
                const k1 = runBk([door], [mine('X')], A7.acts('c', 'm'), 0), k3 = runBk([door], [mine('X')]), k4 = runBk([tokS], [mine('T')], A7.acts('c', 'm'), 0);
                A7.note('c', 'm', 'redrawn', 'X'); const k2 = runBk([door], [mine('X', { x: 300, pts: [[0, 0], [9, 9]] })], A7.acts('c', 'm'), 0);   // ... and redrawn since
                const A8 = mkActs(); A8.note('c', 'm', 'added', 'S');   // the other way: the state holds a player's drawing, the map a piece that is none under its id
                const k5 = runBk([st('S')], [{ id: 'S', type: 'rect', x: 0, y: 0, w: 5, h: 5, ownerId: 'u_a' }], A8.acts('c', 'm'), 1);
                A8.note('c', 'm', 'erased', 'S'); const k6 = runBk([st('S')], [{ id: 'S', type: 'rect', x: 0, y: 0, w: 5, h: 5 }], A8.acts('c', 'm'), 1);
                check('undo merge, an id that names two things (the owed review of 2026-10-09): a player\'s line on the map under the id of a piece of the GM\'s in the state is no match for it — the GM\'s door comes back exactly as the state has it, with no owner, its place and its ticks its own, whether the line was redrawn since or not, and with no count too, and the line goes with the step; a token alike; the other way round, the state\'s drawing comes back as one the GM removed, or stays erased when its player erased it, and the piece on the map goes',
                    jm(k1.wb) === jm([door]) && jm(k2.wb) === jm([door]) && jm(k3.wb) === jm([door]) && jm(k4.wb) === jm([tokS]) && jm(k5.wb) === jm([st('S')]) && k6.wb.length === 0, jm([k1.wb, k2.wb, k3.wb, k4.wb, k5.wb, k6.wb]));
                // ... and two players' drawings under one id: the state's is u_a's, the one on the map was handed in later by another player
                const A10 = mkActs(); A10.note('c', 'm', 'added', 'X'); A10.note('c', 'm', 'added', 'q'); A10.note('c', 'm', 'added', 'X');   // u_a's at 1, and after the state (taken at 2) another player's at 3
                const mineA = st('X', { locked: true }), p1 = runBk([mineA], [mine('X', { x: 1, y: 1 })], A10.acts('c', 'm'), 2), p2 = runBk([mineA], [mine('X', { x: 1, y: 1 })]);
                const p3 = runBk([mineA], [st('X', { x: 77, ownerId: undefined })], A10.acts('c', 'm'), 2), p4 = runBk([st('S')], [{ id: 'S', type: 'rect', x: 0, y: 0, w: 5, h: 5, ownerId: 'u_a' }]);
                check('undo merge, two players\' drawings under one id (the owed review of 2026-10-09): a line on the map signed by another player than the state\'s drawing of that id is no match for it — the state\'s drawing comes back as its own player\'s, with the GM\'s lock, and is named as brought back, and the other line goes with the step; a drawing the host has taken its owner off is still matched, the host\'s word on its owner standing as before; and with no count the state\'s drawing is matched as it always was, so nothing is lost: the line on the map stays whole, and a piece that is no drawing lends the state\'s drawing its place',
                    jm(p1.wb) === jm([mineA]) && jm(p1.back) === jm([{ id: 'X', ownerId: 'u_a' }]) && jm(p2.wb) === jm([mine('X', { x: 1, y: 1 })]) && jm(p2.back) === '[]'
                    && p3.wb.length === 1 && !('ownerId' in p3.wb[0]) && p3.wb[0].locked === true && p3.wb[0].x === 10 && jm(p3.back) === '[]' && p4.wb.length === 1 && p4.wb[0].type === 'path' && p4.wb[0].x === 0, jm([p1.wb, p1.back, p2.wb, p3.wb, p4.wb]));
                // ... and the merge names the players' drawings a step brings back, so the host can tell a copy made before the restored map from an erase
                const A9 = mkActs(); ['g', 'p', 'k', 'n'].forEach(id => A9.note('c', 'm', 'added', id)); A9.note('c', 'm', 'erased', 'p');
                const bk1 = runBk([st('g'), st('p'), st('k'), st('n', { ownerId: 7 }), door, { id: 'tk', type: 'circle', isChar: true, ownerId: 'u_e', x: 1, y: 2 }], [st('k')], A9.acts('c', 'm'), 4), bk2 = runBk([st('g'), st('k')], [st('k')]), bk3 = runBk([st('k')], [st('k'), st('late')], A9.acts('c', 'm'), 4);
                check('undo merge, the drawings a step brings back (the owed review of 2026-10-09): the merge answers with each drawing of a player\'s that the state holds and the map did not, by its id and its player — one the GM had removed — and with no other: not one still on the map, not one its player erased, which stays erased, not a piece of the GM\'s, not a player\'s token the GM had deleted, not a drawing with no player to name; with no count nothing comes back, so nothing is named, and a step that brings nothing back names nothing',
                    jm(bk1.back) === jm([{ id: 'g', ownerId: 'u_a' }]) && bk1.wb.map(w => w.id).join() === 'g,k,n,X,tk' && jm(bk2.back) === '[]' && bk2.wb.map(w => w.id).join() === 'k' && jm(bk3.back) === '[]', jm([bk1.back, bk1.wb.map(w => w.id), bk2.back, bk3.back]));
                // the count itself (net.js, the strokeacts slice): three questions, a number that only goes up, an erase taking the id off the other two, a cap on the erased
                const C = mkActs(), qa = C.acts('c', 'm');
                C.note('c', 'm', 'added', 'a'); C.note('c', 'm', 'added', 'b'); C.note('c', 'm', 'redrawn', 'a'); C.note('c', 'm2', 'added', 'z');
                const c1 = [C.acts('c', 'm').addedAt('a'), C.acts('c', 'm').addedAt('b'), C.acts('c', 'm2').addedAt('z'), C.acts('c', 'm').addedAt('z'), C.acts('c', 'm').redrawnAt('a'), C.acts('c', 'm').redrawnAt('b'), C.acts('c', 'm').erased('a'), C.net.strokeSeq(), qa.addedAt('a')];
                C.note('c', 'm', 'erased', 'a'); const c2 = [C.acts('c', 'm').addedAt('a'), C.acts('c', 'm').redrawnAt('a'), C.acts('c', 'm').erased('a')];
                C.note('c', 'm', 'added', 'a'); const c3 = [C.acts('c', 'm').addedAt('a'), C.acts('c', 'm').erased('a'), C.net.strokeSeq()];
                [null, 5, {}, ''].forEach(v => { C.note(v, 'm', 'added', 'q'); C.note('c', v, 'added', 'q'); C.note('c', 'm', 'added', v); C.note('c', 'm', 'redrawn', v); }); C.note('c', 'm', 'nothing', 'b');
                ['__proto__', 'constructor', 'hasOwnProperty'].forEach(k => { C.note(k, k, 'added', k); C.note('c', 'm', 'erased', k); });
                const c4 = [C.net.strokeSeq(), C.acts('__proto__', '__proto__').addedAt('__proto__'), C.acts('c', 'm').erased('constructor'), ({}).added === undefined && Object.prototype.added === undefined, C.acts(null, 'm').addedAt('a'), C.acts('nope', 'nope').erased('a'), C.acts('nope', 'nope').redrawnAt('a')];
                const capSrc = saA > 0 ? netSrc.slice(saA, saZ) : '', capN = Number((capSrc.match(/STROKE_ERASED_CAP = (\d+);/) || [])[1]);
                for (let i = 0; i < capN + 3; i++) C.note('c', 'big', 'erased', 'e' + i);
                const c5 = [C.acts('c', 'big').erased('e0'), C.acts('c', 'big').erased('e2'), C.acts('c', 'big').erased('e3'), C.acts('c', 'big').erased('e' + (capN + 2))];
                C.note('c', 'big', 'erased', 'e3'); C.note('c', 'big', 'erased', 'fresh');   // the oldest kept, erased again, is the newest: the next to go is the one after it
                const c5b = [C.acts('c', 'big').erased('e3'), C.acts('c', 'big').erased('e4'), C.acts('c', 'big').erased('fresh')];
                C.forget('c', 'm'); const c6 = [C.acts('c', 'm').addedAt('b'), C.acts('c', 'm2').addedAt('z'), C.net.strokeSeq()];
                C.note('c', 'm2', 'redrawn', 'z'); const c7a = C.acts('c', 'm2').redrawnAt('z'); C.note('c', 'm2', 'redrawn', 'z'); const c7 = [c7a, C.acts('c', 'm2').redrawnAt('z'), C.acts('c', 'm2').addedAt('z'), C.net.strokeSeq()];
                C.note('null', 'm', 'added', 'k'); C.note('c', 'null', 'added', 'k2');   // a campaign or a map may be CALLED null; what is no text still names none
                const c8 = [C.acts(null, 'm').addedAt('k'), C.acts('null', 'm').addedAt('k'), C.acts('c', null).addedAt('k2'), C.acts('c', 'null').addedAt('k2')];
                check('undo merge (127) the count (net.js, the strokeacts slice run for real): a drawing a player added is numbered by a count that only goes up, per map of a campaign; a redraw takes a number of its own from the same count, a new one each time, and leaves the number the drawing was added at alone; an erase takes the id out of the added and the redrawn and into the erased, and adding it again takes it back out; a question asked before a note still reads the count as it is now; what is no text names nothing and counts nothing, in a note and in a question, and an id or a map called __proto__, constructor or hasOwnProperty is a key like any; the erased ids are the newest ' + capN + ' a map, the oldest going first, and one erased again is the newest again; a map\'s count goes with the map and the number never goes back; the undo is handed three questions and never the sets',
                    jm(c1) === jm([1, 2, 4, 0, 3, 0, false, 4, 1]) && jm(c2) === jm([0, 0, true]) && jm(c3) === jm([5, false, 5]) && jm(c4) === jm([8, 6, true, true, 0, false, 0]) && capN === 5000 && jm(c5) === jm([false, false, true, true]) && jm(c5b) === jm([true, false, true])
                    && jm(c6) === jm([0, 4, 8]) && jm(c7) === jm([9, 10, 4, 10]) && jm(c8) === jm([0, 11, 0, 12])
                    && jm(Object.keys(qa).sort()) === jm(['addedAt', 'erased', 'redrawnAt']) && /net\.strokeActs = strokeActs; net\.strokeSeq = function\(\) \{ return _strokeSeq; \};/.test(capSrc), jm([c1, c2, c3, c4, capN, c5, c5b, c6, c7, c8]));
                // end to end: io.js's own history, the merge and the undo, sliced and run for real on a hosted map, with the count beside them
                const slI = name => { const a = ioSrc.indexOf('  // [textcheck:' + name + '-start]'), z = ioSrc.indexOf('  // [textcheck:' + name + '-end]'); return a > 0 && z > a ? ioSrc.slice(a, z) : 'throw new Error("no slice ' + name + '");'; };
                const sbA = ioSrc.indexOf('  function setBaseline(item) {'), sbZ = ioSrc.indexOf('  function rebaseHistory(item) {', sbA);   // the baseline moved without a step
                const mkW = () => {
                    const S = mkActs(), map = { id: 'm1', type: 'map', meta: { title: 'M' }, whiteboard: [{ id: 'box', type: 'rect', x: 1, y: 1, w: 5, h: 5 }] }, camp = { id: 'c', activeItemId: 'm1', items: { m1: map } }, W = { S, map, camp, sent: 0, back: [] };
                    const net = Object.assign(S.net, { active: true, role: 'host', applyingRemote: false, sendItem: () => { W.sent++; }, strokesBack: (mid, list) => { W.back.push([mid, jm(list), W.sent]); } });
                    const names = ['window', 'state', 'getActiveCampaign', 'getActiveMap', 'localStorage', 'document', 'setTimeout', 'clearTimeout', 'Date', 'render', 'save', 'toast', 'saveTimeout'];
                    const api = new Function(...names, slI('history') + '\n' + (sbA > 0 && sbZ > sbA ? ioSrc.slice(sbA, sbZ) : 'throw new Error("no setBaseline");') + '\n' + ioSrc.slice(gi, gk) + '\n' + slI('steps') + '\nreturn { pushHistory, stepHistory, setBaseline, stack: function(k) { return histories[k || "c/m1"]; } };')(
                        { wpNet: net }, { appState: { campaigns: { c: camp } } }, () => camp, () => map, { getItem: () => null }, { getElementById: () => null, activeElement: null }, () => 0, () => {}, { now: () => 1000 }, () => {}, () => { api.pushHistory(); }, () => {}, undefined);
                    W.gm = fn => { fn(map.whiteboard, map); api.pushHistory(); };   // an edit of the GM's own, and its pass
                    W.land = fn => { fn(map.whiteboard, map); };                     // a player's change lands (no pass yet)
                    W.pass = () => { net.applyingRemote = true; api.pushHistory(); net.applyingRemote = false; };   // the save a player's change causes: the baseline moves, no step
                    W.draw = id => { W.land(wb => { wb.push(st(id)); }); S.note('c', 'm1', 'added', id); };
                    W.redraw = (id, more) => { W.land(() => { Object.assign(W.it(id), more); }); S.note('c', 'm1', 'redrawn', id); };   // its player draws it again (the host's gate notes it)
                    W.base = () => api.setBaseline(map);   // a render-time clean-up moves the baseline, with no step
                    W.undo = () => api.stepHistory('undo'); W.redo = () => api.stepHistory('redo');
                    W.ids = () => map.whiteboard.map(w => w.id).join(); W.it = id => map.whiteboard.find(w => w.id === id); W.stack = api.stack;
                    api.pushHistory();   // the first pass seeds the baseline
                    return W;
                };
                let e2e = null, e2eErr = '';
                try {
                    // (a) a tick: undone, redone; a drawing a player added after the step stays through both
                    const Wa = mkW(); Wa.draw('a'); Wa.pass(); Wa.gm(() => { Object.assign(Wa.it('a'), { blocksSight: true, sightType: 'wall' }); }); Wa.draw('n'); Wa.pass();
                    Wa.undo(); const a1 = [Wa.ids(), Wa.it('a').blocksSight === true]; Wa.redo(); const a2 = [Wa.ids(), Wa.it('a').blocksSight === true, Wa.it('a').sightType];
                    // (b) a delete: undone (it comes back), redone (it goes again)
                    const Wb = mkW(); Wb.draw('a'); Wb.pass(); Wb.gm(wb => { wb.splice(wb.findIndex(w => w.id === 'a'), 1); });
                    const b0 = Wb.ids(); Wb.undo(); const b1 = Wb.ids(); Wb.redo(); const b2 = Wb.ids(); Wb.undo(); const b3 = Wb.ids();
                    // (c) the GM's eraser cuts a player's line in two: undone (the line back, the pieces gone), redone (the pieces back, the line gone)
                    const Wc = mkW(); Wc.draw('a'); Wc.pass(); Wc.gm(wb => { const i = wb.findIndex(w => w.id === 'a'), a = wb[i]; wb.splice(i, 1, Object.assign({}, a, { id: 'a1', pts: [[0, 0], [2, 2]] }), Object.assign({}, a, { id: 'a2', pts: [[3, 3], [5, 5]] })); });
                    const c0 = Wc.ids(); Wc.undo(); const c1b = Wc.ids(); Wc.redo(); const c2b = Wc.ids();
                    // (d) a player's erase is never undone: the GM moves a piece of their own, the player erases their line, the GM undoes
                    const Wd = mkW(); Wd.draw('a'); Wd.pass(); Wd.gm(() => { Wd.it('box').x = 50; }); Wd.land(wb => { wb.splice(wb.findIndex(w => w.id === 'a'), 1); }); Wd.S.note('c', 'm1', 'erased', 'a'); Wd.pass();
                    Wd.undo(); const d1b = [Wd.ids(), Wd.it('box').x]; Wd.redo(); const d2b = [Wd.ids(), Wd.it('box').x];
                    // (e) a drawing that lands just before the GM's edit, with no pass between: the step holds the state without it, and an undo keeps it
                    const We = mkW(); We.draw('a'); We.pass(); We.draw('late'); We.gm(() => { We.it('box').x = 70; }); We.undo(); const e1 = [We.ids(), We.it('box').x];
                    // (f) the stamp: none on a state stored before a player has drawn anything, the count on one stored after
                    const Wf = mkW(); Wf.gm(() => { Wf.it('box').x = 2; }); const f0 = Wf.stack().undo[0]; Wf.draw('a'); Wf.pass(); Wf.gm(() => { Wf.it('box').x = 3; }); const f1 = Wf.stack().undo[1]; Wf.undo(); const f2 = Wf.stack().redo[0];
                    // (g) a player redraws their line, then the GM moves it: Undo takes the move back and leaves the redraw, Redo moves it again, Undo takes it back again
                    const Wg = mkW(); Wg.draw('a'); Wg.pass(); Wg.redraw('a', { pts: [[0, 0], [8, 8]] }); Wg.pass(); Wg.gm(() => { Wg.it('a').x = 300; });
                    Wg.undo(); const g1 = [Wg.it('a').x, jm(Wg.it('a').pts)]; Wg.redo(); const g2 = [Wg.it('a').x, jm(Wg.it('a').pts)]; Wg.undo(); const g3 = [Wg.it('a').x, jm(Wg.it('a').pts)];
                    // (h) the GM moves a player's line, then its player redraws it: Undo leaves the line as its player has it now
                    const Wh = mkW(); Wh.draw('a'); Wh.pass(); Wh.gm(() => { Wh.it('a').x = 300; }); Wh.redraw('a', { pts: [[0, 0], [8, 8]], x: 310 }); Wh.pass();
                    Wh.undo(); const h1 = [Wh.it('a').x, jm(Wh.it('a').pts)];
                    // (i) the count as io.js reads it: a whole number above 0 that a number holds exactly, or nothing — and what is stored always reads back
                    const stampOf = v => { const Wq = mkW(); Wq.S.net.strokeSeq = () => { if (v === 'throw') throw new Error('x'); return v; }; Wq.pass(); Wq.gm(() => { Wq.it('box').x = 9; }); const s = Wq.stack().undo[0]; JSON.parse(s); return /"q":/.test(s) ? JSON.parse(s).q : null; };
                    const qi = [NaN, Infinity, -5, 0, 'throw', undefined, 9007199254740993, 1.7, 3, 9007199254740991].map(stampOf);
                    // (j) a map first seen after players have drawn: its first step carries the count it was first seen at
                    const Wj = mkW(); Wj.draw('a'); Wj.pass(); Wj.camp.items.m2 = { id: 'm2', type: 'map', meta: { title: 'N' }, whiteboard: [{ id: 'b2', type: 'rect', x: 1, y: 1, w: 5, h: 5 }] }; Wj.pass();
                    Wj.gm(() => { Wj.camp.items.m2.whiteboard[0].x = 9; }); const j1 = JSON.parse(Wj.stack('c/m2').undo[0]).q;
                    // (k) a baseline moved without a step (a render-time clean-up) is taken at the count as it is then, and holds what players drew by then
                    const Wk = mkW(); Wk.draw('a'); Wk.base(); Wk.gm(() => { Wk.it('box').x = 4; }); const k1 = [JSON.parse(Wk.stack().undo[0]).q, /"id":"a"/.test(Wk.stack().undo[0])];
                    // (l) a redraw that lands just before the GM's Undo, with no pass between: the baseline that Undo leaves is taken at the count as it is then,
                    // so a move the GM makes next is undone like any other
                    const Wl = mkW(); Wl.draw('a'); Wl.pass(); Wl.gm(() => { Wl.it('box').x = 5; }); Wl.redraw('a', { pts: [[0, 0], [7, 7]] }); Wl.undo(); Wl.gm(() => { Wl.it('a').x = 300; }); Wl.undo();
                    const l1 = [Wl.it('a').x, jm(Wl.it('a').pts), Wl.it('box').x];
                    // (m) the owed review, 2026-10-09: the drawings a step brings back are told to the table's own module, before the map goes out
                    const Wm = mkW(); Wm.draw('a'); Wm.pass(); Wm.gm(wb => { wb.splice(wb.findIndex(w => w.id === 'a'), 1); }); Wm.undo(); const m1 = jm(Wm.back); Wm.redo(); const m2 = Wm.back.length; Wm.undo(); const m3 = jm(Wm.back[1]);
                    // (n) ... and an id shared by a piece of the GM's and a player's line: the GM deletes the box, a line lands under its id, Undo gives the box back as the GM's own
                    const Wn = mkW(); Wn.gm(wb => { wb.splice(wb.findIndex(w => w.id === 'box'), 1); }); Wn.land(wb => { wb.push(st('box', { ownerId: 'u_p' })); }); Wn.S.note('c', 'm1', 'added', 'box'); Wn.pass(); Wn.undo(); const n1 = [jm(Wn.map.whiteboard), Wn.back.length];
                    e2e = { m1, m2, m3, n1, a1, a2, b0, b1, b2, b3, c0, c1b, c2b, d1b, d2b, e1, g1, g2, g3, h1, qi, j1, k1, l1, f: [/"q":/.test(f0), JSON.parse(f0).q === undefined, JSON.parse(f1).q, JSON.parse(f2).q, f0.slice(0, 5), Wf.stack().lastQ], sent: Wa.sent };
                } catch (e) { e2eErr = String(e && e.stack || e).slice(0, 400); }
                check('undo merge (127) end to end (io.js\'s history, merge and undo, sliced and run for real on a hosted map with the host\'s count): the GM ticks a player\'s line and a player then draws another — Undo takes the tick off and keeps the new line, Redo puts the tick back and keeps it; the GM deletes a player\'s line — Undo brings it back, Redo takes it off again, Undo brings it back again; the GM\'s eraser cuts a player\'s line in two — Undo gives the line back whole and takes the pieces, Redo gives the pieces and takes the line; a line its player erased stays erased through the GM\'s undo and redo of a move of their own; a line that lands just before the GM\'s edit, with no pass between, stays when that edit is undone; a state stored before any player has drawn carries no count and is byte for byte as before, one stored after carries the count it was taken at, and the table is sent the map after a step',
                    !!e2e && jm(e2e.a1) === jm(['box,a,n', false]) && jm(e2e.a2) === jm(['box,a,n', true, 'wall']) && e2e.b0 === 'box' && e2e.b1 === 'box,a' && e2e.b2 === 'box' && e2e.b3 === 'box,a'
                    && e2e.c0 === 'box,a1,a2' && e2e.c1b === 'box,a' && e2e.c2b === 'box,a1,a2' && jm(e2e.d1b) === jm(['box', 1]) && jm(e2e.d2b) === jm(['box', 50]) && jm(e2e.e1) === jm(['box,a,late', 1])
                    && jm(e2e.f) === jm([false, true, 1, 1, '{"c":', 1]) && e2e.sent === 2, e2eErr || jm(e2e));
                check('undo merge (127) end to end, a redraw: a player redraws their line and the GM then moves it — Undo takes the move back and keeps the redraw, Redo moves it again, Undo takes it back again; the GM moves a line and its player then redraws it — Undo leaves it as its player has it now, where it is and as it is drawn; a redraw that lands just before an Undo of the GM\'s, with no pass between, is kept by that Undo, and a move the GM makes next is undone like any other',
                    !!e2e && jm(e2e.g1) === jm([10, '[[0,0],[8,8]]']) && jm(e2e.g2) === jm([300, '[[0,0],[8,8]]']) && jm(e2e.g3) === jm([10, '[[0,0],[8,8]]']) && jm(e2e.h1) === jm([310, '[[0,0],[8,8]]']) && jm(e2e.l1) === jm([10, '[[0,0],[7,7]]', 1]),
                    e2eErr || jm(e2e && [e2e.g1, e2e.g2, e2e.g3, e2e.h1, e2e.l1]));
                check('undo merge (127) end to end, the count as the history reads it: a whole number above 0 that a number holds exactly is the stamp (a fraction is cut to its whole part); no number, an endless one, one below 1, one past what a number holds exactly, nothing at all and a count that throws stamp nothing — and every state stored reads back; a map first seen after players have drawn carries the count it was first seen at on its first step; a baseline moved without a step is taken at the count as it is then, and holds what players drew by then',
                    !!e2e && jm(e2e.qi) === jm([null, null, null, null, null, null, null, 1, 3, 9007199254740991]) && e2e.j1 === 1 && jm(e2e.k1) === jm([1, true]), e2eErr || jm(e2e && [e2e.qi, e2e.j1, e2e.k1]));
                check('undo merge end to end, the owed review of 2026-10-09: a step that brings a player\'s drawing back tells the table\'s module which, by id and player, before the map goes out, and a step that brings none back tells nothing; a line a player handed in under the id of a piece the GM had deleted never makes that piece theirs — Undo gives the piece back exactly as the state had it, with no owner, and the line goes',
                    !!e2e && e2e.m1 === jm([['m1', jm([{ id: 'a', ownerId: 'u_a' }]), 0]]) && e2e.m2 === 1 && e2e.m3 === jm(['m1', jm([{ id: 'a', ownerId: 'u_a' }]), 2]) && jm(e2e.n1) === jm([jm([{ id: 'box', type: 'rect', x: 1, y: 1, w: 5, h: 5 }]), 0]), e2eErr || jm(e2e && [e2e.m1, e2e.m2, e2e.m3, e2e.n1]));
                // Match a wall, round four, end to end with the host's REAL gate where the scenes above write a redraw by hand: a player's copy of the
                // map goes through net.js applyClientItemFiltered (the patch slice with the real playerStroke and the real fog core, strict as the
                // module runs), which lays what the copy hands over on the host's line and notes it in the same real count; then io.js's own
                // history, merge and undo, as above. A copy names a drawing as st() makes one, which is how a player's app holds its own line
                const paA = netSrc.indexOf('// [netcheck:patch-start]'), paZ = netSrc.indexOf('// [netcheck:patch-end]');
                const netLine = start => { const i = netSrc.indexOf('\n' + start); return i >= 0 ? netSrc.slice(i + 1, netSrc.indexOf('\n', i + 1)) : 'throw new Error("no line of net.js begins: ' + start + '");'; };
                const FCu = await import(surl('fogcore.js'));
                const mkR = () => { const W = mkW();
                    const gate = new Function('state', 'window', 'strokeNote', '"use strict";\n' + [netLine('function own('), netLine('function validKey('), netLine('function campOf(')].join('\n') + '\n' + (psA > 0 && psZ > psA ? netSrc.slice(psA, psZ + 3) : 'throw new Error("no playerStroke");')
                        + '\n' + (paA > 0 && paZ > paA ? netSrc.slice(paA, paZ) : 'throw new Error("no patch slice");') + '\nreturn applyClientItemFiltered;')({ appState: { campaigns: { c: W.camp } } }, { wpFogCore: FCu }, W.S.note);
                    W.copy = list => gate({ campId: 'c', itemId: 'm1', item: { whiteboard: list } }, { id: 'u_a' }, {});   // the player u_a's copy of the map reaches the host: true where it changed the host's map
                    return W; };
                let rg = null, rgErr = '';
                try {
                    const P8 = [[0, 0], [8, 8]], seenAs = w => [nibOf(w), jm(w.pts), 'rot' in w ? w.rot : NONIB, 'name' in w ? w.name : NONIB];   // a line's nib, points, turn and name
                    // (o) drawn with the flat nib; the GM turns and names it; its player draws it again with the square nib; Undo, Redo, Undo
                    const Wo = mkR(), o0 = [Wo.copy([st('a', { tip: 'flat' })]), nibOf(Wo.it('a')), Wo.it('a').byPlayer, Wo.S.net.strokeSeq()]; Wo.pass();
                    Wo.gm(() => { Object.assign(Wo.it('a'), { rot: 45, name: 'Fence' }); });
                    const o1 = [Wo.copy([st('a', { pts: P8, tip: 'square' })]), Wo.S.net.strokeSeq()]; Wo.pass(); const o2 = seenAs(Wo.it('a'));
                    Wo.undo(); const o3 = seenAs(Wo.it('a')); Wo.redo(); const o4 = seenAs(Wo.it('a')); Wo.undo(); const o5 = seenAs(Wo.it('a'));
                    // (p) drawn with the square nib, or the flat one; the GM names it; its player draws it again and the copy names no nib (round on their screen); Undo, Redo
                    const roundAgain = from => { const W = mkR(); W.copy([st('a', { tip: from })]); W.pass(); W.gm(() => { W.it('a').name = 'Fence'; });
                        const drew = nibOf(W.it('a')), took = W.copy([st('a', { pts: P8 })]); W.pass(); const a1 = seenAs(W.it('a')); W.undo(); const a2 = seenAs(W.it('a')); W.redo(); const a3 = seenAs(W.it('a')); return [drew, took, a1, a2, a3]; };
                    const pSq = roundAgain('square'), pFl = roundAgain('flat');
                    // (q) a region the host holds under a player's name, as a file may have one: no copy of a player's can name the Fill tip, and a redraw takes none off
                    const Wq = mkR(); Wq.land(wb => { wb.push(st('r', { tip: 'fill', pts: [[0, 0], [9, 0], [9, 9]] })); }); Wq.pass();
                    const q1 = [Wq.copy([st('r', { pts: [[0, 0], [7, 0], [7, 7]], tip: 'fill' })]), nibOf(Wq.it('r')), jm(Wq.it('r').pts)], q2 = [Wq.copy([st('r', { pts: [[0, 0], [6, 0], [6, 6]] })]), nibOf(Wq.it('r')), jm(Wq.it('r').pts)];
                    rg = { o0, o1, o2, o3, o4, o5, pSq, pFl, q1, q2 };
                } catch (e) { rgErr = String(e && e.stack || e).slice(0, 400); }
                const P8s = '[[0,0],[8,8]]', roundWant = from => [from, true, [NONIB, P8s, NONIB, 'Fence'], [NONIB, P8s, NONIB, NONIB], [NONIB, P8s, NONIB, 'Fence']];
                check('undo merge (127) end to end with the host\'s own gate (Match a wall, round four; net.js applyClientItemFiltered with the real playerStroke and the real fog core, the real count, and io.js\'s history, merge and undo): a player draws a line with the flat nib and the host holds it so, as a player\'s drawing, counted once; the GM turns and names it, and its player draws it again with the square nib — the host\'s line takes the square nib and the redraw is counted, Undo takes the GM\'s turn and name off and leaves the line with the nib and the points it has now, Redo puts the turn and the name back, and Undo takes them off again; a line drawn with the square nib, or with the flat one, and drawn again by a copy that names no nib is round on the host as it is on its drawer\'s screen (no nib key), and the GM\'s Undo across that redraw does not bring the old nib back under the new points, nor does the Redo after it; a nib the host holds that no player\'s copy can name (the Fill tip of a region) is taken off by no redraw, whether the copy names it or names none',
                    !!rg && jm(rg.o0) === jm([true, 'flat', true, 1]) && jm(rg.o1) === jm([true, 2]) && jm(rg.o2) === jm(['square', P8s, 45, 'Fence']) && jm(rg.o3) === jm(['square', P8s, NONIB, NONIB]) && jm(rg.o4) === jm(['square', P8s, 45, 'Fence']) && jm(rg.o5) === jm(['square', P8s, NONIB, NONIB])
                    && jm(rg.pSq) === jm(roundWant('square')) && jm(rg.pFl) === jm(roundWant('flat')) && jm(rg.q1) === jm([true, 'fill', '[[0,0],[7,0],[7,7]]']) && jm(rg.q2) === jm([true, 'fill', '[[0,0],[6,0],[6,6]]']), rgErr || jm(rg));
                // Match a wall, round five (the round-four verifier, of the gate's redraw line): a filled region the host holds under a player's
                // name, as a file may have one, became a LINE when its player's copy drew it again, or only moved it, and named the square or the
                // flat nib, since a redraw lays the nib a copy names on the host's piece. The fog then read a wall of area as an open line. Round
                // five drops the nib a copy names for a piece whose tip is the Fill tip before anything is laid: a redraw never makes a region a
                // line. The same real gate, count and history as above. The region carries holes, which are the GM's key and stay as they were
                let rf = null, rfErr = '';
                try {
                    const T9 = [[0, 0], [9, 0], [9, 9]], T7 = [[0, 0], [7, 0], [7, 7]], HOLES = [[[2, 1], [3, 1], [3, 2]]];
                    const regAs = w => (w ? [nibOf(w), jm(w.pts), w.x, 'rot' in w ? w.rot : NONIB, 'name' in w ? w.name : NONIB, jm(w.holes), FCu.lineOf(w), w.byPlayer] : 'gone');   // its tip, points, place, turn, name and holes, whether the fog reads it as a line, and the mark that a player drew it
                    const Wr = mkR(); Wr.land(wb => { wb.push(st('r', { tip: 'fill', pts: T9, holes: HOLES })); }); Wr.pass();
                    const r0 = [regAs(Wr.it('r')), Wr.S.net.strokeSeq()];
                    Wr.gm(() => { Object.assign(Wr.it('r'), { rot: 45, name: 'Pond' }); });   // the GM turns and names it
                    const r1 = [Wr.copy([st('r', { pts: T7, tip: 'flat' })]), regAs(Wr.it('r')), Wr.S.net.strokeSeq()]; Wr.pass();   // its player's copy draws it again and names the flat nib
                    Wr.undo(); const r2 = regAs(Wr.it('r')); Wr.redo(); const r3 = regAs(Wr.it('r')); Wr.undo(); const r4 = regAs(Wr.it('r')); Wr.redo();
                    const r5 = [Wr.copy([st('r', { pts: T7, x: 60, tip: 'square' })]), regAs(Wr.it('r')), Wr.S.net.strokeSeq()]; Wr.pass();   // moved only, and the copy names the square nib
                    const r6 = [Wr.copy([st('r', { pts: T7, x: 60, tip: 'flat' })]), regAs(Wr.it('r')), Wr.S.net.strokeSeq()];                // the same points at the same place under another nib: no redraw at all
                    Wr.undo(); const r7 = regAs(Wr.it('r'));
                    // a line beside it: the statement is for a region alone. A line the host holds flat takes the square nib a redraw names, and the other way round
                    const lineTo = (from, to) => { const W = mkR(); W.copy([st('a', { tip: from })]); W.pass(); const took = W.copy([st('a', { pts: T7, tip: to })]); return [took, nibOf(W.it('a')), jm(W.it('a').pts), FCu.lineOf(W.it('a'))]; };
                    const l1 = lineTo('flat', 'square'), l2 = lineTo('square', 'flat'), l3 = lineTo('flat', 'flat');
                    // ... and a seeded walk: a region and a line of one player on each of twenty tables. A copy names both, as a player's app does, and
                    // names for the region whatever nib chance picks: none, square, flat, the Fill tip itself, round by name, a number. After EVERY
                    // step the region is a region with the points its player last handed over and its holes, and the line has its player's nib
                    let seedR = 20261013; const rndR = n => { seedR = (Math.imul(seedR, 1664525) + 1013904223) >>> 0; return Math.floor(seedR / 4294967296 * n); };
                    const NAMED = [NONIB, 'square', 'flat', 'fill', 'round', 7], TIPS3r = [NONIB, 'square', 'flat'], offR = []; let stepsR = 0, redrawsR = 0, nibNamed = 0, lineDrawn = 0, undosR = 0, backR = 0, serialR = 0;
                    for (let walk = 0; walk < 20; walk++) {
                        const W = mkR(), model = { r: { pts: T9 }, a: { tip: NONIB, pts: [[0, 0], [1, 1]] } };
                        W.land(wb => { wb.push(st('r', { tip: 'fill', pts: T9, holes: HOLES })); });
                        const send = named => W.copy(['r', 'a'].map(id => { const h = W.it(id), w = st(id, { pts: model[id].pts }), t = id === 'r' ? named : model.a.tip; if (h) { w.x = h.x; w.y = h.y; } if (t !== NONIB) w.tip = t; return w; }));
                        send(NONIB); W.pass();
                        for (let i = 0; i < 20; i++) {
                            const act = rndR(8), was = jm(W.map.whiteboard);
                            if (act < 3) { const named = NAMED[rndR(NAMED.length)]; model.r = { pts: [[0, 0], [3 + (++serialR), 0], [3, 1 + rndR(40)]] }; send(named); redrawsR++; if (named === 'square' || named === 'flat') nibNamed++; if (rndR(4)) W.pass(); }   // its player draws the region again
                            else if (act === 3) { model.a = { tip: TIPS3r[rndR(3)], pts: [[0, 0], [++serialR, 1 + rndR(40)]] }; send(NAMED[rndR(NAMED.length)]); lineDrawn++; if (rndR(4)) W.pass(); }                                                    // ... or the line, the region named under any nib
                            else if (act === 4) W.gm(() => { W.it('r').rot = 1 + rndR(359); });        // the GM turns the region,
                            else if (act === 5) W.gm(() => { W.it('r').name = 'Pond ' + rndR(9); });   // or names it
                            else if (act === 6) { W.undo(); undosR++; if (jm(W.map.whiteboard) !== was) backR++; }
                            else { W.redo(); undosR++; if (jm(W.map.whiteboard) !== was) backR++; }
                            stepsR++;
                            const h = W.it('r'), a = W.it('a');
                            if (offR.length < 6 && (!h || h.tip !== 'fill' || FCu.lineOf(h) !== false || jm(h.pts) !== jm(model.r.pts) || jm(h.holes) !== jm(HOLES) || !a || nibOf(a) !== model.a.tip || jm(a.pts) !== jm(model.a.pts)))
                                offR.push('walk ' + walk + ', step ' + i + ', act ' + act + ': ' + (h ? nibOf(h) + ' ' + jm(h.pts) : 'no region') + ' for fill ' + jm(model.r.pts) + '; ' + (a ? nibOf(a) + ' ' + jm(a.pts) : 'no line') + ' for ' + model.a.tip + ' ' + jm(model.a.pts));
                        }
                    }
                    rf = { r0, r1, r2, r3, r4, r5, r6, r7, l1, l2, l3, offR, stepsR, redrawsR, nibNamed, lineDrawn, undosR, backR };
                } catch (e) { rfErr = String(e && e.stack || e).slice(0, 400); }
                const T9s = '[[0,0],[9,0],[9,9]]', T7s = '[[0,0],[7,0],[7,7]]', HOLESs = '[[[2,1],[3,1],[3,2]]]';
                check('undo merge (127) end to end with the host\'s own gate, a filled region (Match a wall, round five; the same real gate, playerStroke, fog core, count and history): a filled region the host holds under a player\'s name, with holes, is no line to the fog; the GM turns and names it, and its player\'s copy draws it again and names the flat nib — the host\'s piece takes the new points, the redraw is counted, and it is STILL a region: the Fill tip, its holes, no line to the fog (round four laid the flat nib on it and made it an open line: flipped by round five); the GM\'s Undo across that redraw takes the turn and the name off and brings the region back a region, under the points its player gave it and with the tip and the holes the state held; Redo puts the turn and the name back and Undo takes them off again, a region each time; a copy that only moves it and names the square nib moves it and leaves it a region, counted as a redraw; one that names another nib and changes neither points nor place is no redraw, changes nothing and is not counted; and Undo after the move leaves it where its player put it, a region; the statement is for a region alone: a line the host holds flat takes the square nib a redraw names, a square one the flat nib, and a flat one stays flat; over twenty tables of a region and a line of one player, each twenty steps of a redraw of the region under a nib chance names (none, square, flat, the Fill tip, round by name, a number), a redraw of the line, a turn or a name of the GM\'s, an Undo or a Redo, the region is after every step a region with the points its player last handed over and its holes, and the line has its player\'s nib and points',
                    !!rf && jm(rf.r0) === jm([['fill', T9s, 10, NONIB, NONIB, HOLESs, false, true], 0]) && jm(rf.r1) === jm([true, ['fill', T7s, 10, 45, 'Pond', HOLESs, false, true], 1])
                    && jm(rf.r2) === jm(['fill', T7s, 10, NONIB, NONIB, HOLESs, false, true]) && jm(rf.r3) === jm(['fill', T7s, 10, 45, 'Pond', HOLESs, false, true]) && jm(rf.r4) === jm(rf.r2)
                    && jm(rf.r5) === jm([true, ['fill', T7s, 60, 45, 'Pond', HOLESs, false, true], 2]) && jm(rf.r6) === jm([false, ['fill', T7s, 60, 45, 'Pond', HOLESs, false, true], 2]) && jm(rf.r7) === jm(['fill', T7s, 60, NONIB, NONIB, HOLESs, false, true])
                    && jm(rf.l1) === jm([true, 'square', T7s, true]) && jm(rf.l2) === jm([true, 'flat', T7s, true]) && jm(rf.l3) === jm([true, 'flat', T7s, true])
                    && rf.offR.length === 0 && rf.stepsR === 400 && rf.redrawsR > 100 && rf.nibNamed > 30 && rf.lineDrawn > 30 && rf.undosR > 60 && rf.backR > 20, rfErr || jm(rf));
                // ... and a seeded walk through the same real gate, count and history. The GM has no control that sets a line's nib or its points, so
                // on the host's map a player's line has, after EVERY step, the nib and the points its player last handed over: whatever the GM turns,
                // names or moves between, and however many Undos and Redos follow, with the save a player's change causes or without it. Two lines
                // of one player; each copy names both, as a player's app does, at the place the host's line has
                let wk = null, wkErr = '';
                try {
                    let seed = 20261012; const rnd = n => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return Math.floor(seed / 4294967296 * n); };
                    const TIPS3 = [NONIB, 'square', 'flat'], LINES = ['a', 'b'], off = []; let steps = 0, undos = 0, redos = 0, redraws = 0, stepsBack = 0, serial = 0, nibMoved = 0;
                    for (let walk = 0; walk < 40; walk++) {
                        const W = mkR(), model = {};
                        const copyAll = () => W.copy(LINES.map(id => { const h = W.it(id), w = st(id, { pts: model[id].pts }); if (h) { w.x = h.x; w.y = h.y; } if (model[id].tip !== NONIB) w.tip = model[id].tip; return w; }));
                        const drawn = id => { const was = model[id] ? model[id].tip : null; model[id] = { tip: TIPS3[rnd(3)], pts: [[0, 0], [++serial, 1 + rnd(40)]] }; if (was !== null && was !== model[id].tip) nibMoved++; };
                        LINES.forEach(drawn); copyAll(); W.pass();
                        for (let i = 0; i < 30; i++) {
                            const act = rnd(8), id = LINES[rnd(2)], was = jm(W.map.whiteboard);
                            if (act < 3) { drawn(id); copyAll(); redraws++; if (rnd(4)) W.pass(); }                 // its player draws it again, with another nib or the same; one time in four the GM acts before the save
                            else if (act === 3) W.gm(() => { W.it(id).rot = 1 + rnd(359); });                          // the GM turns a line,
                            else if (act === 4) W.gm(() => { W.it(id).name = 'Line ' + rnd(9); });                     // names it,
                            else if (act === 5) W.gm(() => { W.it(rnd(2) ? id : 'box').x = rnd(500); });               // or moves it, or a piece of their own
                            else if (act === 6) { W.undo(); undos++; if (jm(W.map.whiteboard) !== was) stepsBack++; }
                            else { W.redo(); redos++; if (jm(W.map.whiteboard) !== was) stepsBack++; }
                            steps++;
                            LINES.forEach(k => { const h = W.it(k); if (off.length < 6 && (!h || nibOf(h) !== model[k].tip || jm(h.pts) !== jm(model[k].pts))) off.push('walk ' + walk + ', step ' + i + ', act ' + act + ', line ' + k + ': ' + (h ? nibOf(h) + ' ' + jm(h.pts) : 'gone') + ' for ' + model[k].tip + ' ' + jm(model[k].pts)); });
                        }
                    }
                    wk = { off, steps, undos, redos, redraws, stepsBack, nibMoved };
                } catch (e) { wkErr = String(e && e.stack || e).slice(0, 400); }
                check('undo merge (127) end to end with the host\'s own gate, a seeded walk (Match a wall, round four): over forty tables of two lines of one player, each thirty steps of a redraw with the round, the square or the flat nib (three times in four followed by the save it causes), a turn, a name or a move of the GM\'s, an Undo or a Redo, every line on the host\'s map has after every step the nib and the points its player last handed over — no Undo and no Redo of the GM\'s puts an older nib or older points back, and none takes a nib off; the walk holds hundreds of redraws that change the nib and hundreds of Undos and Redos that change the map',
                    !!wk && wk.off.length === 0 && wk.steps === 1200 && wk.redraws > 300 && wk.nibMoved > 200 && wk.undos > 100 && wk.redos > 100 && wk.stepsBack > 100, wkErr || jm(wk));
                // said, and wired: Help, both release notes and CLAUDE.md; the stamp read and written in the history's own places
                const rd127 = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8').replace(/\r\n/g, '\n'), ix127 = rd127('system/app/index.html'), cl127 = (() => { try { return rd127('CLAUDE.md'); } catch (e) { if (e && e.code === 'ENOENT') return null; throw e; } })();   // CLAUDE.md is kept on the maintainer's machine only (git-ignored): its pins run where it is there
                const note127 = "- In a session, Undo now takes back what you did to a player's\n  drawing: a tick such as Blocks sight, Lock in place or Hide, a move,\n  or a delete. It used to leave a player's drawing exactly as it was.\n  It still never erases or moves what the player did themselves.\n";
                const ioL = ioSrc.replace(/\n\n/g, '\n');   // io.js keeps a blank line between its lines
                check('undo merge (127) said and wired: Help says under Player drawings that Undo takes back what the GM did to a player\'s line and never what the player did; both release notes carry the same lines; CLAUDE.md names the count, its three questions and the stamp; io.js reads the count once a pass, stamps the state being left with the count it was taken at in the pass and in a step both ways, sets a baseline\'s count wherever a baseline is taken, and hands the merge the count and the state\'s own stamp',
                    ix127.includes('<li>Your <b>Undo</b> takes back what you did to a player&rsquo;s line, such as a tick, a move or a delete. It never erases or moves what the player did themselves.</li>')
                    && rd127('WHATSNEW.txt').includes(note127) && rd127('system/app/assets/whatsnew.txt').includes(note127)
                    && (cl127 === null || (cl127.includes('net.js `strokeNote`, called only from the patch gate') && cl127.includes('read as three questions through `strokeActs`') && cl127.includes('io.js `withQ`, the state\'s `q`')))
                    && ioL.includes("  function strokeSeq() { var n = window.wpNet, v = 0; try { v = n && typeof n.strokeSeq === 'function' ? Number(n.strokeSeq()) : 0; } catch (e) { v = 0; } return v > 0 && v <= Number.MAX_SAFE_INTEGER ? Math.floor(v) : 0; }\n  function withQ(snap, q) { return q > 0 ? snap.slice(0, -1) + ',\"q\":' + q + '}' : snap; }")
                    && ioL.includes('now = Date.now(), sq = strokeSeq();') && ioL.includes('if (cur === h.last) { if (sq) h.lastQ = sq; return; }') && ioL.includes('var wasQ = h.lastQ || 0; if (sq) h.lastQ = sq;') && ioL.includes('}), wasQ));')
                    && ioL.includes('var sqB = strokeSeq(); if (sqB) histories[key].lastQ = sqB;') && ioL.includes('var sqS = strokeSeq(); if (sqS) h.lastQ = sqS;') && (ioL.match(/withQ\(/g) || []).length === 4 && (ioL.match(/strokeSeq\(\)/g) || []).length === 5);
            }
            // where it is called: the host only, a map only, before the snapshot is applied
            const ui = ioSrc.indexOf('var parsed = JSON.parse(snap);'), ua = ioSrc.indexOf('applyContent(item, parsed);', ui), undoSrc = ui > 0 && ua > ui ? ioSrc.slice(ui, ua) : '';
            check('undo merge: called for a map only while hosting, on the snapshot before it is applied, and nowhere else',
                /var hosting = !!\(window\.wpNet && window\.wpNet\.active && window\.wpNet\.role === 'host'\);\n\s*var backS = hosting && item\.type === 'map' \? mergeLivePlayerState\(parsed\.c, item, typeof window\.wpNet\.strokeActs === 'function' \? window\.wpNet\.strokeActs\(camp\.id, item\.id\) : null, typeof parsed\.q === 'number' \? parsed\.q : 0\) : null;/.test(undoSrc) && ioSrc.includes("if (backS && backS.length && typeof window.wpNet.strokesBack === 'function') window.wpNet.strokesBack(item.id, backS); if (window.wpNet.sendItem) window.wpNet.sendItem(camp.id, item.id);") && (ioSrc.match(/mergeLivePlayerState\(/g) || []).length === 2, jm([ui, ua, (ioSrc.match(/mergeLivePlayerState\(/g) || []).length]));
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


    {   // 1.5.6 (the sweep of 2026-10-17, seen live): Backspace deletes nothing while a button or a link has the focus (io.js bkspHeld, run for real)

        const ioB = fs.readFileSync(path.join(__dirname, '..', 'system', 'app', 'scripts', 'io.js'), 'utf8').split('\r\n').join('\n');

        const bA = ioB.indexOf('  // [cleanupcheck:bkspheld-start]'), bZ = ioB.indexOf('  // [cleanupcheck:bkspheld-end]');

        const held = new Function("'use strict';\n" + ioB.slice(bA, bZ) + '\nreturn bkspHeld;')();

        const el = (tags) => ({ nodeType: 1, closest: sel => (sel.split(',').map(s => s.trim()).some(s => tags.indexOf(s) >= 0) ? {} : null) });

        const R = [held(el(['button'])), held(el(['a[href]'])), held(el(['[role="button"]'])), held(el([])), held(null), held({ nodeType: 3 }), held({ nodeType: 1 })];

        check('1.5.6 Backspace deletes nothing while a button or a link has the focus (io.js bkspHeld, run for real): the selection toolbar\'s trash, a link, anything that says it is a button; never the page, the board, a box that is no field or no element at all; the key handler asks it before its Delete and Backspace branch, so Delete still deletes',

            JSON.stringify(R) === JSON.stringify([true, true, true, false, false, false, false]) && ioB.includes("      if (e.key === 'Backspace' && bkspHeld(document.activeElement)) return;\n      // [cleanupcheck:bksp-end]\n      if (e.key === 'Delete' || e.key === 'Backspace') {"), JSON.stringify(R));

    }


    summed = true;
    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
