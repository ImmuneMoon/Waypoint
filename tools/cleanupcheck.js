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

(async () => {
    const url = 'file:///' + path.resolve(mod).replace(/\\/g, '/');
    const { classifyState, fileVerdict, pickRecovery, inspectCampaign, removeCampaign, unmovePlanners, runSweep, cleanImport, cleanImportItems } = await import(url);
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
        tier([{ id: 'w_b', defId: 'i_x', qty: 1, paid: 500 }, { id: 'w_c', qty: 1, paid: 0, def: { name: 'C', stats: { Acc: 1 } } }, { id: 'w_i', qty: 1, def: { name: 'R', vis: 'gm', stats: { Acc: 5 } }, lnk: 1 }]) === 'CERTAIN' && classifyState(ls, KNOWN).tiers.camp_a === 'CERTAIN', tiersOf(classifyState(ls, KNOWN))); }

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
        '', 42, null, '/saves/images/' + 'a'.repeat(400) + '.png'
    ];
    refused.forEach(p => check('asset gate refuses ' + String(JSON.stringify(p)).slice(0, 60), assetPathOk(p) === '', JSON.stringify(assetPathOk(p))));
    const served = [   // raw stored path -> the pathname the host fetches -> the on-disk name main.js resolves it to (null = not asserted)
        ['/saves/images/c1/plain.png', '/saves/images/c1/plain.png', '/saves/images/c1/plain.png'],
        ['saves/images/c1/plain.png', '/saves/images/c1/plain.png', '/saves/images/c1/plain.png'],   // assetSrc tolerates a missing leading slash
        ["/saves/images/c1/Ror'Chiir — token (v2).png", "/saves/images/c1/Ror'Chiir%20%E2%80%94%20token%20(v2).png", "/saves/images/c1/Ror'Chiir — token (v2).png"],
        ['/saves/images/audio/c1/日本語 ♪.mp3', '/saves/images/audio/c1/%E6%97%A5%E6%9C%AC%E8%AA%9E%20%E2%99%AA.mp3', '/saves/images/audio/c1/日本語 ♪.mp3'],
        ['/saves/images/c1/a[1] b|c^d "q".png', '/saves/images/c1/a[1]%20b|c%5Ed%20%22q%22.png', '/saves/images/c1/a[1] b|c^d "q".png'],
        ['/saves/images/c1/pic%20already.png', '/saves/images/c1/pic%20already.png', null],   // pre-encoded: kept as is, never doubled to %2520
        ['/saves/images/audio/c1/100% rock.mp3', '/saves/images/audio/c1/100%25%20rock.mp3', '/saves/images/audio/c1/100% rock.mp3']   // a lone % re-encoded, as encodeURI did for the host's own playback
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
        const S = await import(surl('systemcore.js')), F = await import(surl('formula.js'));
        // the REAL load normaliser (io.js migrateAppState) and the REAL rich-text sanitiser (net.js; under node it keeps text only), sliced, never copied
        const mi = ioSrc.indexOf('  function hexCenterFlat('), mk = ioSrc.indexOf('  // What the cleanup (scripts/cleanup.js) may do');
        const migrate = new Function('window', 'CATS', 'CURRENT_SCHEMA', 'createNewCampaign', ioSrc.slice(mi, mk) + '\nreturn function(d) { return migrateAppState(d).data; };')(
            { wpSystemCore: S, wpFormula: F }, { default: { label: 'Default', color: '#ccc' } }, 2, nm => ({ id: 'camp_v0', name: nm, items: {} }));
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
        const outR = cleanImport({ campaigns: { cO: { id: 'cO', name: 'O', items: { op: oldPlan() } } } }, deps);
        const icN = { items: { op: oldPlan() } }; cleanImportItems(icN, {});
        const rawOf = it => it && Array.isArray(it.blocks) && it.blocks.length === 1 && it.blocks[0].type === 'raw' ? it.blocks[0].content : null;
        check('import: a planner from before blocks (its text one string) comes in as a raw block that has been through the sanitiser — on Merge and on Replace — and fails closed with no sanitiser; the old string never stays',
            /old notes/.test(rawOf(icM.items.op) || '') && !/[<>]/.test(rawOf(icM.items.op) || '<') && /old notes/.test(rawOf(outR && outR.campaigns.cO.items.op) || '') && !/[<>]/.test(rawOf(outR && outR.campaigns.cO.items.op) || '<')
            && rawOf(icN.items.op) === '' && !('content' in icM.items.op) && !('content' in outR.campaigns.cO.items.op), JSON.stringify([icM.items.op, outR && outR.campaigns.cO.items.op, icN.items.op]));
        check('import: a file with nothing but prototype-key campaigns brings nothing in', cleanImport(JSON.parse('{"campaigns":{"__proto__":{"id":"x","items":{}},"constructor":{"items":{}}}}'), deps) === null && cleanImport(null, deps) === null && cleanImport({ campaigns: 5 }, deps) === null);
        // the app routes every whole-file import through it, before the state is replaced or the modal is even closed
        const repl = mainSrc.slice(mainSrc.indexOf("_el_importReplaceBtn.addEventListener('click'"), mainSrc.indexOf('var _el_importCancelBtn'));
        const legacy = mainSrc.slice(mainSrc.indexOf('// Legacy single-campaign format'), mainSrc.indexOf('} else if (data.campaigns) {'));
        check('import (main.js): Replace cleans first (cleanImport with the app\'s real normaliser, docrender and the wire\'s sanitiser) and only then may replace the state; the raw file never becomes the state',
            /var cleanR = cleanImport\(pendingImport, importDeps\(\)\);[\s\S]*if \(!cleanR\) \{ importNothing\(\); return; \}[\s\S]*var guard = [\s\S]*state\.appState = cleanR;/.test(repl) && !/state\.appState = pendingImport/.test(mainSrc)
            && /function importDeps\(\) \{ return \{ migrate: function\(d\) \{ return migrateAppState\(d\)\.data; \}, DR: window\.wpDocRender, sanitize: window\.wpNet && window\.wpNet\.sanitizeRichText \}; \}/.test(mainSrc) && /\n    migrateAppState   \/\/ main\.js/.test(ioSrc));
        check('import (main.js): a legacy single-campaign file is wrapped and cleaned the same way before it joins the campaigns; Merge cleans its items with the same cleaner',
            /var cleanL = cleanImport\(wrapL, importDeps\(\)\);[\s\S]*var guardL = [\s\S]*state\.appState\.campaigns\[defaultCamp\.id\] = cleanL\.campaigns\[defaultCamp\.id\];/.test(legacy) && !/state\.appState\.campaigns\[defaultCamp\.id\] = defaultCamp;/.test(legacy)
            && /function cleanImportedItems\(ic\) \{ cleanImportItems\(ic, importDeps\(\)\); \}/.test(mainSrc) && /cleanImportedItems\(ic\);/.test(mainSrc));
        // the dev console's reload: never under a table, the GM's or someone else's
        const ri = ioSrc.indexOf('window.wpReloadFromDisk = function() {'), rk = ioSrc.indexOf('\n};', ri);
        const reload = (n) => { const calls = { load: 0, cleared: 0, toasts: [] }; const w = { wpNet: n };
            new Function('window', 'toast', 'load', 'clearTimeout', 'saveTimeout', ioSrc.slice(ri, rk + 3))(w, m => calls.toasts.push(m), () => { calls.load++; }, () => { calls.cleared++; }, 1);
            calls.ret = w.wpReloadFromDisk(); return calls; };
        const rHost = reload({ active: true, role: 'host' }), rClient = reload({ active: true, role: 'client' }), rOff = reload({ active: false, role: null }), rNone = reload(undefined);
        check('reload from disk: refused while hosting (the load\'s normaliser and cleanup never run under the live table) and while joined; allowed otherwise',
            ri > 0 && rHost.load === 0 && rHost.ret === false && /hosting/.test(rHost.toasts[0] || '') && rClient.load === 0 && rClient.ret === false && rOff.load === 1 && rOff.cleared === 1 && rOff.ret === true && rNone.load === 1, JSON.stringify([rHost, rClient, rOff]));
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

    console.log('\n' + pass + ' passed, ' + fail + ' failed.');
    if (fail) process.exit(1);
})();
