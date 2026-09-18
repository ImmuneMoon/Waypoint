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
function sanitizeItem(item) {
    if (!item) return item;
    if (item.type === 'planner') return null;
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
    delete c._foreign; delete c._cleanup;
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
        Object.keys(camp.items).forEach(function(id) {
            var it = sanitizeItem(camp.items[id]);
            if (it === null) delete camp.items[id];
            else camp.items[id] = it;
        });
        if (!camp.items[camp.activeItemId]) camp.activeItemId = Object.keys(camp.items)[0] || null;
    });
    return c;
}

/* ---- fixtures ---- */
const clone = o => JSON.parse(JSON.stringify(o));
function room(id, notes) { return { id, x: 100, y: 100, name: id, notes: notes === undefined ? 'GM prep for ' + id : notes, characters: [{ name: 'Someone', info: 'dossier' }] }; }
function tok(id, extra) { return Object.assign({ id, type: 'image', src: '/saves/images/m1/' + id + '.png', x: 10, y: 10, w: 60, h: 52, z: 10, color: 'transparent', isChar: true }, extra); }
function playMap(id, title, rooms, wb, extra) { return Object.assign({ id, type: 'map', meta: { title, updated: 1000 }, rooms, links: [['r1', 'r2', 'road', { label: 'Road', notes: 'a GM link note' }]], whiteboard: wb, cats: {} }, extra); }
function planner(id) { return { id, type: 'planner', meta: { title: 'Notes ' + id, updated: 1000 }, blocks: [{ type: 'h1', title: 'Notes', sub: '' }] }; }
function gmCampaign(id, name) {
    return {
        id, name, activeItemId: 'm1',
        items: {
            m1: playMap('m1', 'Town', [room('r1'), room('r2')], [tok('t_pc', { ownerId: 'u_player' }), tok('t_npc'), tok('t_hidden', { hidden: true }), { id: 'shape', type: 'rect', x: 0, y: 0, w: 50, h: 50, z: 10, color: 'var(--panel2)' }]),
            m2: playMap('m2', 'Battle', [], [tok('t_a'), tok('t_b', { sheet: { hp: 10 } }), tok('t_h2', { hidden: true })]),   // a hidden monster: a battle map with none would read as local work (4.3, last local mark)
            p1: planner('p1')
        },
        players: { u_player: { name: 'Pat' } }, handouts: { h1: { title: 'Map' } }, cast: { c1: { name: 'Cast' } }
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
    const { classifyState, fileVerdict, pickRecovery, inspectCampaign, removeCampaign, unmovePlanners, runSweep } = await import(url);
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
