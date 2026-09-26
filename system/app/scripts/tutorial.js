/* Interactive tutorial: builds a "Tutorial" campaign the user can keep and build on (or
   discard), then walks through the app step by step with a spotlight and a card.

   KEEP THIS IN STEP WITH THE APP. Every step names the element it points at (`target`,
   a CSS selector — an id from index.html wherever possible). `node tools/tutorialcheck.js`
   verifies each static target still exists and the release script refuses to build when
   one is missing; at run time a step whose target is absent is skipped with a console
   warning, so a renamed button never strands the user. When a feature moves or a new one
   ships, edit STEPS (and the demo content in buildTutorialCampaign) in the same change.
   TUTORIAL_VERSION is shown on the Help pane so a stale tour is easy to spot. */

import { state } from './state.js';
import { createNewCampaign, createNewMap, createNewPlanner, createNewDoc, getActiveCampaign } from './models.js';
import { save, toast, canPersistLocal, resetHistory, takeSafetyCopy } from './io.js';
import { updateCampaignSelect, updateSidebarNav, navigateToMap } from './sidebar.js';
import { showConfirm } from './dialogs.js';

var TUTORIAL_VERSION = '1.5.0';          // bump when STEPS or the demo campaign change
var TUTORIAL_CAMP_ID = 'camp_tutorial';  // one Tutorial campaign per save
var TUTORIAL_NAME = 'Tutorial';
var TUTORIAL_ART_CAT = 'Default';   // the category every tutorial picture sits in (its own shelf, not under All)
var TUTORIAL_ART_URL = '/saves/images/tutorial/';   // the pictures the demo uses, copied from assets/tutorial into the saves folder
var TUTORIAL_ART_FILES = ["bren_hex.png","bren_sq.jpg","chef_hex.png","chef_sq.jpg","golems_hex.png","golems_sq.jpg","innkeeper_hex.png","innkeeper_sq.jpg","king_hex.png","king_sq.jpg","liriel_hex.png","liriel_sq.jpg","map_basement.jpg","map_eldara.jpg","map_fort.jpg","map_ground.jpg","map_inn.jpg","map_top.jpg","minotaur_archer_hex.png","minotaur_archer_sq.jpg","minotaur_soldier_hex.png","minotaur_soldier_sq.jpg","orc_hex.png","orc_sq.jpg","priestess_hex.png","priestess_sq.jpg","sage_hex.png","sage_sq.jpg","scene_eldara.jpg","scene_emporium.jpg","scene_forge.jpg","scene_hideout.jpg","scene_inn.jpg","scene_temple.jpg","scene_throne.jpg","slime_hex.png","slime_sq.jpg","smith_hex.png","smith_sq.jpg","spriggan_hex.png","spriggan_sq.jpg","tharic_hex.png","tharic_sq.jpg"];
/* The tour's pictures ship inside the app (assets/tutorial) but the demo campaign uses copies in
   saves/images/tutorial: that way they sit in the Image Library like any other picture — tagged
   "Tutorial art" on its own shelf (not under All) — and can be deleted, one by one or with the
   category, when the user is done with them. Rebuilding the campaign restores any that are missing. */
function installTutorialArt(done) {
    fetch('/api/list-images').then(function(r) { return r.json(); }).catch(function() { return []; }).then(function(list) {
        var have = {}; (list || []).forEach(function(i) { have[i.path] = true; });
        var missing = TUTORIAL_ART_FILES.filter(function(f) { return !have[TUTORIAL_ART_URL + f]; });
        var copy = function(f) {
            return fetch('assets/tutorial/' + f).then(function(r) { return r.ok ? r.blob() : null; }).then(function(b) {
                if (!b) return;
                return fetch('/api/upload-exact?path=' + encodeURIComponent('images/tutorial/' + f), { method: 'POST', body: b });
            }).catch(function() {});
        };
        // a few at a time keeps the shell's file API happy
        var i = 0;
        function next() { if (i >= missing.length) return Promise.resolve(); var batch = missing.slice(i, i + 4); i += 4; return Promise.all(batch.map(copy)).then(next); }
        return next().then(function() {
            if (window.wpImgCatEnsure) window.wpImgCatEnsure(TUTORIAL_ART_CAT, TUTORIAL_ART_FILES.map(function(f) { return TUTORIAL_ART_URL + f; }), true, 'shared');   // Default is a shared category: every campaign sees it under Shared
            if (done) done(missing.length);
        });
    });
}

function render() { if (window.appRender) window.appRender(); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/* ---------- the demo campaign ---------- */
// Ids are fixed so the tour can find its pieces and a rebuild replaces the old copy cleanly.
/* ---- the demo system and character (character sheets, 1.5.0): a tiny ruleset so the tour can open a real sheet ---- */
function tutorialSystem() {
    return { v: 1, name: 'Tutorial rules', preset: '', updated: 1,
        fields: [
            { id: 'f_tut_str', key: 'STR', label: 'Strength', kind: 'number', def: 10, min: 1, max: 20, step: 1, edit: 'owner', vis: 'all', hover: false, roll: 'd20 + STRmod' },
            { id: 'f_tut_dex', key: 'DEX', label: 'Dexterity', kind: 'number', def: 10, min: 1, max: 20, step: 1, edit: 'owner', vis: 'all', hover: false },
            { id: 'f_tut_con', key: 'CON', label: 'Constitution', kind: 'number', def: 10, min: 1, max: 20, step: 1, edit: 'owner', vis: 'all', hover: false },
            { id: 'f_tut_class', key: 'Class', label: 'Class', kind: 'text', def: 'Fighter', max: 60, edit: 'owner', vis: 'all', hover: false },   // an identity row for the header block (Stage 5d)
            { id: 'f_tut_strmod', key: 'STRmod', label: 'STR modifier', kind: 'formula', formula: 'floor((STR - 10) / 2)', vis: 'all', hover: false },
            { id: 'f_tut_hp', key: 'HP', label: 'Hit points', kind: 'resource', maxFormula: '10 + CON', def: 'max', min: 0, edit: 'owner', vis: 'all', hover: true },
            { id: 'f_tut_ac', key: 'AC', label: 'Armour class', kind: 'formula', formula: '10 + floor((DEX - 10) / 2)', vis: 'all', hover: true },
            { id: 'f_tut_sword', key: 'Skill.Sword', label: 'Sword', kind: 'skill', base: 'STRmod', def: 0, min: 0, max: 10, step: 1, edit: 'owner', vis: 'all', hover: false, roll: 'd20 + Skill.Sword' },
            { id: 'f_tut_sight', key: 'Sight', label: 'Sight (yards)', kind: 'number', def: 6, min: 0, max: 120, step: 1, edit: 'owner', vis: 'all', hover: false },
            { id: 'f_tut_prone', key: 'Prone', label: 'Prone', kind: 'toggle', def: false, edit: 'owner', vis: 'all', hover: true },
            { id: 'f_tut_notes', key: 'Notes', label: 'Notes', kind: 'notes', edit: 'owner', vis: 'all', hover: false },
            { id: 'f_tut_gm', key: 'GMnotes', label: 'GM notes', kind: 'notes', edit: 'gm', vis: 'gm', hover: false },
            { id: 'f_tut_kit', key: 'Kit', label: 'Kit', kind: 'item-list', edit: 'owner', vis: 'all', hover: false },
            { id: 'f_tut_fx', key: 'Effects', label: 'Effects', kind: 'effects', edit: 'owner', vis: 'all', hover: true }   // status effects (5h)
        ],
        rolls: [{ id: 'r_tut_init', label: 'Initiative', formula: 'd20 + floor((DEX - 10) / 2)', vis: 'all', init: true }, { id: 'r_tut_atk', label: 'Attack (sword)', formula: 'd20 + Skill.Sword', vis: 'all' }],
        items: [{ id: 'i_tut_firepot', name: 'Firepot', category: 'Thrown', icon: '🔥', notes: 'A thrown clay pot of alchemist\'s fire.', vis: 'all', area: { ft: 10, shape: 'circle', name: 'Firepot' }, damage: '2d6', cost: '', throwSkill: '' }],
        effects: tutorialEffects(),
        combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: 'f_tut_hp' },
        sheet: { sections: [], identity: [{ id: 'f_tut_class' }], ledger: [{ id: 'f_tut_strmod' }, { id: 'f_tut_sight' }], band: [{ id: 'f_tut_hp' }, { id: 'f_tut_ac' }, { id: 'f_tut_prone' }, { roll: 'r_tut_init' }], hud: tutorialHud() } };   // the automatic layout, with a header block (Stage 5d), a pinned band (Stage 5c) and a HUD (Stage 6) so the tour shows them
}
// the HUD (Stage 6): Bren's compact second window — checks and his attack on one tab, his condition on the other
function tutorialHud() {
    return { title: 'Combat HUD', tabs: [{ id: 't_tut_hact', label: 'Actions', icon: 'icon:dice' }, { id: 't_tut_hstat', label: 'Status', icon: 'icon:heart-pulse' }], band: [{ id: 'f_tut_hp' }, { id: 'f_tut_ac' }, { id: 'f_tut_prone' }],
        sections: [{ id: 's_tut_hchk', title: 'Checks', tab: 't_tut_hact', cols: 1, inline: true, fields: [{ id: 'f_tut_str', w: 1 }, { id: 'f_tut_sword', w: 1 }, { roll: 'r_tut_atk', w: 1 }] }, { id: 's_tut_hfx', title: 'Condition', tab: 't_tut_hstat', cols: 1, resetAll: true, fields: [{ id: 'f_tut_hp', w: 1 }, { id: 'f_tut_fx', w: 'row' }] }] };
}
// status effects (5h): Blessed (+1 to the Sword total) and Poisoned (−2 STR, so everything built on STR follows)
function tutorialEffects() {
    return [{ id: 'e_tut_bless', name: 'Blessed', icon: '\u2728', tone: 'buff', dur: 'until dawn', notes: 'A priest\u2019s blessing on the blade.', vis: 'all', mods: [{ f: 'f_tut_sword', op: 'add', v: 1 }] },
            { id: 'e_tut_poison', name: 'Poisoned', icon: '\uD83E\uDD22', tone: 'debuff', dur: 'an hour', notes: 'Raider\u2019s dart poison.', vis: 'all', mods: [{ f: 'f_tut_str', op: 'add', v: -2 }] }];
}
function tutorialCharacter(A) {
    return { id: 'c_tut_bren', name: 'Bren of Hollowvale', ownerId: '', portrait: A + 'bren_sq.jpg', npc: false, updated: 1,
        values: { f_tut_str: 14, f_tut_dex: 12, f_tut_con: 13, f_tut_hp: { cur: 9 }, f_tut_sword: 3, f_tut_sight: 6, f_tut_fx: [{ id: 'x_tut_bless', ref: 'e_tut_bless', on: true }], f_tut_notes: 'Shield and a short temper. Owes Paethorin for the door.', f_tut_gm: 'Secretly the heir of Hollowvale; the raiders know.', f_tut_kit: [{ defId: 'i_tut_firepot', qty: 1 }] } };
}
// Bren's tokens on every map point at the character (one HP total across maps); idempotent, so an older Tutorial campaign gains it too
function ensureTutorialSheet(camp) {
    if (!camp) return false;
    var changed = false;
    if (!camp.system || typeof camp.system !== 'object') { camp.system = tutorialSystem(); changed = true; }
    if (!camp.chars || typeof camp.chars !== 'object') camp.chars = {};
    if (!camp.chars.c_tut_bren) { camp.chars.c_tut_bren = tutorialCharacter(TUTORIAL_ART_URL); changed = true; }
    // item library (1.5.0): a demo Firepot, a Kit field, full-auto blasts, and Bren carrying it — added to an older Tutorial too
    if (camp.system && typeof camp.system === 'object') {
        if (!Array.isArray(camp.system.items)) camp.system.items = [];
        if (!camp.system.items.some(function(i) { return i && i.id === 'i_tut_firepot'; })) { camp.system.items.push({ id: 'i_tut_firepot', name: 'Firepot', category: 'Thrown', icon: '🔥', notes: 'A thrown clay pot of alchemist\'s fire.', vis: 'all', area: { ft: 10, shape: 'circle', name: 'Firepot' }, damage: '2d6', cost: '', throwSkill: '' }); changed = true; }
        if (!camp.system.combat || typeof camp.system.combat !== 'object') { camp.system.combat = { blastAuto: 'full', blastRoller: 'owner', hpResource: 'f_tut_hp' }; changed = true; }
        if (Array.isArray(camp.system.fields) && !camp.system.fields.some(function(f) { return f && f.id === 'f_tut_kit'; })) { camp.system.fields.push({ id: 'f_tut_kit', key: 'Kit', label: 'Kit', kind: 'item-list', edit: 'owner', vis: 'all', hover: false }); changed = true; }
        // status effects (5h): the field, the two library effects, added to an older Tutorial too (idempotent)
        if (Array.isArray(camp.system.fields) && !camp.system.fields.some(function(f) { return f && f.id === 'f_tut_fx'; })) { camp.system.fields.push({ id: 'f_tut_fx', key: 'Effects', label: 'Effects', kind: 'effects', edit: 'owner', vis: 'all', hover: true }); changed = true; }
        if (!Array.isArray(camp.system.effects)) camp.system.effects = [];
        tutorialEffects().forEach(function(d) { if (!camp.system.effects.some(function(x) { return x && x.id === d.id; })) { camp.system.effects.push(d); changed = true; } });
        // the pinned band (Stage 5c): seeded only onto an untouched layout (no sections, tabs or band of the owner's own), so a layout someone built here is left alone
        var tsh = camp.system.sheet;
        if (tsh && typeof tsh === 'object' && !Array.isArray(tsh.band) && !(Array.isArray(tsh.sections) && tsh.sections.length) && !(Array.isArray(tsh.tabs) && tsh.tabs.length)) { tsh.band = [{ id: 'f_tut_hp' }, { id: 'f_tut_ac' }, { id: 'f_tut_prone' }, { roll: 'r_tut_init' }]; changed = true; }
        // the header block (Stage 5d): Bren's Class field, then identity rows + ledger figures — seeded onto an untouched layout only, with its own guard
        if (Array.isArray(camp.system.fields) && !camp.system.fields.some(function(f) { return f && f.id === 'f_tut_class'; })) { camp.system.fields.push({ id: 'f_tut_class', key: 'Class', label: 'Class', kind: 'text', def: 'Fighter', max: 60, edit: 'owner', vis: 'all', hover: false }); changed = true; }
        if (tsh && typeof tsh === 'object' && !Array.isArray(tsh.identity) && !Array.isArray(tsh.ledger) && !(Array.isArray(tsh.sections) && tsh.sections.length) && !(Array.isArray(tsh.tabs) && tsh.tabs.length)) { tsh.identity = [{ id: 'f_tut_class' }]; tsh.ledger = [{ id: 'f_tut_strmod' }, { id: 'f_tut_sight' }]; changed = true; }
        if (tsh && typeof tsh === 'object' && JSON.stringify(tsh.identity) === JSON.stringify([{ id: 'f_tut_class' }, { id: 'f_tut_str' }, { id: 'f_tut_dex' }, { id: 'f_tut_con' }])) { tsh.identity = [{ id: 'f_tut_class' }]; changed = true; }   // Stage 6: the header now edits its rows in place — the abilities stay tiles, Class moves up
        // the HUD (Stage 6 HUD frame): seeded onto an untouched layout only (no HUD, sections or tabs of the owner's own), with its own guard
        if (tsh && typeof tsh === 'object' && !tsh.hud && !(Array.isArray(tsh.sections) && tsh.sections.length) && !(Array.isArray(tsh.tabs) && tsh.tabs.length)) { tsh.hud = tutorialHud(); changed = true; }
        // HUD frame (HF4a): the HUD's Checks as inline rows — ONCE (camp.tutorialSeed), and only on the untouched HF2a seed (in either key order:
        // as seeded, or as a Save cleaned it), so a Checks section someone changed, or later set back to Stacked fields, is left alone
        if (!(camp.tutorialSeed >= 1)) {
            var tHchk = tsh && typeof tsh === 'object' && tsh.hud && Array.isArray(tsh.hud.sections) ? tsh.hud.sections.find(function(s) { return s && s.id === 's_tut_hchk'; }) : null;
            if (tHchk && tHchk.inline === undefined && Object.keys(tHchk).sort().join() === 'cols,fields,id,tab,title' && tHchk.title === 'Checks' && tHchk.tab === 't_tut_hact' && tHchk.cols === 1 && JSON.stringify(tHchk.fields) === JSON.stringify([{ id: 'f_tut_str', w: 1 }, { id: 'f_tut_sword', w: 1 }, { roll: 'r_tut_atk', w: 1 }])) tHchk.inline = true;
            camp.tutorialSeed = 1; changed = true;
        }
        // HUD frame (HF4b): the HUD's Condition section gets Reset all (HP back to full) — ONCE (camp.tutorialSeed 2), only on the untouched HF2a seed
        if (!(camp.tutorialSeed >= 2)) {
            var tHfx = tsh && typeof tsh === 'object' && tsh.hud && Array.isArray(tsh.hud.sections) ? tsh.hud.sections.find(function(s) { return s && s.id === 's_tut_hfx'; }) : null;
            if (tHfx && tHfx.resetAll === undefined && Object.keys(tHfx).sort().join() === 'cols,fields,id,tab,title' && tHfx.title === 'Condition' && tHfx.tab === 't_tut_hstat' && tHfx.cols === 1 && JSON.stringify(tHfx.fields) === JSON.stringify([{ id: 'f_tut_hp', w: 1 }, { id: 'f_tut_fx', w: 'row' }])) tHfx.resetAll = true;
            camp.tutorialSeed = 2; changed = true;
        }
    }
    if (camp.chars && camp.chars.c_tut_bren && camp.chars.c_tut_bren.values && !camp.chars.c_tut_bren.values.f_tut_fx) { camp.chars.c_tut_bren.values.f_tut_fx = [{ id: 'x_tut_bless', ref: 'e_tut_bless', on: true }]; changed = true; }   // 5h: Bren is Blessed
    if (camp.chars && camp.chars.c_tut_bren && camp.chars.c_tut_bren.values && !camp.chars.c_tut_bren.values.f_tut_kit) { camp.chars.c_tut_bren.values.f_tut_kit = [{ defId: 'i_tut_firepot', qty: 1 }]; changed = true; }
    Object.values(camp.items || {}).forEach(function(m) { if (!m || m.type !== 'map') return; (m.whiteboard || []).forEach(function(w) { if (w && /^tut_wb_bren[0-9]*$/.test(w.id) && w.charId !== 'c_tut_bren') { w.charId = 'c_tut_bren'; changed = true; } }); });
    return changed;
}
function buildTutorialCampaign() {
    var A = TUTORIAL_ART_URL;                       // copies of the shipped art in the saves folder (see installTutorialArt)
    var camp = createNewCampaign(TUTORIAL_NAME);
    camp.id = TUTORIAL_CAMP_ID;
    camp.tutorialSeed = 2;   // HUD frame (HF4a, HF4b): the seed migrations this build already carries (ensureTutorialSheet runs each once, on an older tutorial)
    camp.vtt = tutorialVtt();   // every VTT feature on: the tour points at chips and the minimap, so they must render
    camp.fog = { fields: { sight: 'f_tut_sight' }, defaults: { sight: 3 } };   // fog of war (1.5.0): Bren's Sight field drives vision; 3 yd default for a token with no character
    // Hex-cell items sit on the flat-top lattice (cell centres x = 45q + 15, y = 52(r + q/2)); the same
    // rounding the app's own seating uses, so nothing needs re-seating on load.
    function hexCentre(x, y) {
        var sz = 30, h = 52, q = (x - sz / 2) / (1.5 * sz), r = y / h - q / 2;
        var rx = Math.round(q), ry = Math.round(r), rz = Math.round(-q - r);
        var dx = Math.abs(rx - q), dy = Math.abs(ry - r), dz = Math.abs(rz - (-q - r));
        if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz;
        return { x: 1.5 * sz * rx + sz / 2, y: h * (ry + rx / 2) };
    }
    function hexTok(x, y, props) { var c = hexCentre(x, y); return Object.assign({ x: c.x - 30, y: c.y - 26, w: 60, h: 52, layer: 'middle' }, props); }
    function sqTok(x, y, props) { return Object.assign({ x: Math.round(x / 50) * 50, y: Math.round(y / 50) * 50, w: 50, h: 50, layer: 'middle' }, props); }
    function pic(file, extra) { return Object.assign({ type: 'image', src: A + file, color: 'transparent', isChar: true }, extra); }
    function stairs(x, y, target, up, label) { return hexTok(x, y, { id: 'tut_wb_' + target.replace('map_tut_', '') + (up ? '_up' : '_down'), type: 'hexagon', color: 'rgba(224,165,79,0.35)', layer: 'back-mid', name: label, targetMapId: target, portalIcon: up ? 'Stairs Up' : 'Stairs Down' }); }
    var O = 14488;                                 // a 1024 px map placed here is centred on (15000, 15000)

    /* ---- Eldara Realm: the top of the tree ---- */
    var realm = createNewMap('Eldara Realm');
    realm.id = 'map_tut_realm';
    realm.meta.homeX = 15300; realm.meta.homeY = 15200; realm.meta.lastView = 'data';
    realm.cats = { city: { label: 'City', color: '#e0a54f' }, wild: { label: 'Wilderness', color: '#5cb87a' }, danger: { label: 'Danger', color: '#d9534f' } };
    realm.rooms = [
        { id: 'tut_r_eldara', name: 'Eldara', cat: 'city', x: 15000, y: 15200, notes: 'The elven city under the great tree. The party starts at its inn.\nDouble-click to open the city map.', characters: [], targetMapId: 'map_tut_city', icon: 'Gate', image: A + 'scene_eldara.jpg' },
        { id: 'tut_r_hills', name: 'Rugged Hills', cat: 'wild', x: 15300, y: 15040, notes: 'Two days of bad road. The raiders who have been hitting the caravans hole up somewhere in here. Double-click for the hill road battle map (the ambush).', characters: [], targetMapId: 'map_tut_hillroad', icon: 'Camp' },
        { id: 'tut_r_hideout', name: "Raiders' Hideout", cat: 'danger', x: 15560, y: 15200, notes: 'A timber house on a rock shelf with a cellar and a lookout floor. Double-click to open the ground floor; the stairs inside lead to the other floors.', characters: [{ id: 'tut_c_grukk', name: 'Grukk', info: 'Orc. Runs the raiders. Keeps the ledger in the office.', portrait: A + 'orc_sq.jpg' }], targetMapId: 'map_tut_ground', icon: 'Door', image: A + 'scene_hideout.jpg' },
        { id: 'tut_r_fort', name: 'Old Fort', cat: 'danger', x: 15300, y: 15400, notes: 'A ruined hillfort the raiders use as a fallback. Something older than raiders lives in the walls.', characters: [], targetMapId: 'map_tut_fort', icon: 'Tower', image: A + 'map_fort.jpg' }
    ];
    realm.links = [
        ['tut_r_eldara', 'tut_r_hills', 'route', { label: "Two days' ride", notes: 'Caravan road. A raid on a 1–2 each day.' }],
        ['tut_r_hills', 'tut_r_hideout', 'secret', { label: 'Goat path', notes: 'Hidden unless a captured raider talks or the party tracks a patrol (Survival 14).' }],
        ['tut_r_hideout', 'tut_r_fort', 'oneway', { label: 'Downriver', notes: 'The raiders flee to the fort by raft; the way back is on foot.' }],
        ['tut_r_eldara', 'tut_r_fort', '', { label: 'Old road' }]
    ];

    // The realm's play map is a scene, not a battle map: the painting of Eldara, no grid, nothing to seat
    realm.meta.gridType = 'off';
    realm.whiteboard = [
        { id: 'tut_wb_realmscene', type: 'image', src: A + 'scene_eldara.jpg', x: O + 62, y: O + 62, w: 900, h: 900, color: 'transparent', layer: 'back', locked: true, name: 'Eldara under the great tree' },
        { id: 'tut_wb_realmlabel', type: 'text', x: O + 62, y: O, w: 640, h: 40, color: 'transparent', text: '<b>Eldara Realm</b> (no grid) \u2014 a scene to set the mood; the maps below it are where play happens', fontSize: 14, layer: 'front' }
    ];

    /* ---- Eldara: the city, with scene images and portraits ---- */
    var city = createNewMap('Eldara');
    city.id = 'map_tut_city';
    city.meta.parentId = realm.id;
    city.meta.homeX = 15000; city.meta.homeY = 15000; city.meta.lastView = 'data'; city.meta.gridType = 'off';
    city.cats = { civic: { label: 'Civic', color: '#e0a54f' }, holy: { label: 'Temple', color: '#b98cff' }, trade: { label: 'Trade', color: '#4db3d3' } };
    city.rooms = [
        { id: 'tut_palace', name: 'Palace', cat: 'civic', x: 14980, y: 14840, notes: 'The court of King Thalindor sits in the roots of the great tree. He wants the raiders gone before the harvest caravans roll.\nThis room has a scene image and a character with a portrait: hover its play-map shape.', characters: [{ id: 'tut_c_king', name: 'King Thalindor Starseeker', info: 'Patient, proud, and short of soldiers. Pays in favours before gold.', portrait: A + 'king_sq.jpg' }, { id: 'tut_c_golems', name: 'The Wardens', info: 'Two elven golems that never leave the throne room.', portrait: A + 'golems_sq.jpg' }], image: A + 'scene_throne.jpg', targetMapId: 'map_tut_throne', icon: 'Gate' },
        { id: 'tut_temple', name: 'Temple', cat: 'holy', x: 15300, y: 14840, notes: 'Crystal-lit hall of the Moon. Healing for a donation; blessings for a promise.', characters: [{ id: 'tut_c_priestess', name: 'High Priestess Elandra Moonshadow', info: 'Knows the fort is older than the city and what sleeps under it.', portrait: A + 'priestess_sq.jpg' }], image: A + 'scene_temple.jpg', targetMapId: 'map_tut_temple', icon: 'Door' },
        { id: 'tut_smith', name: 'Blacksmith', cat: 'trade', x: 14800, y: 15220, notes: 'Elion will reforge anything the party brings back from the hideout.', characters: [{ id: 'tut_c_smith', name: 'Master Blacksmith Elion Flameheart', info: 'Grumbles. Sold the raiders their axes without knowing.', portrait: A + 'smith_sq.jpg' }], image: A + 'scene_forge.jpg', targetMapId: 'map_tut_forge', icon: 'Door' },
        { id: 'tut_library', name: 'Library', cat: 'civic', x: 15300, y: 15100, notes: 'Maps of the hills, if anyone asks nicely. Maelis has no portrait: her token on any map is a circle with her initials until you give her one.', characters: [{ id: 'tut_c_maelis', name: 'Archivist Maelis', info: 'Keeps the hill surveys. Will trade a map for the return of an overdue book.' }] },
        { id: 'tut_emporium', name: 'Emporium', cat: 'trade', x: 15560, y: 14980, notes: 'Everything the caravans still bring in, at raid prices. Liriel buys the raiders\' loot through a third hand \u2014 the ledger in the hideout names her.', characters: [{ id: 'tut_c_liriel', name: 'Liriel Aurethiel', info: 'Charming, rich, and the Emporium buyer on Grukk\'s ledger. Never in the shop when trouble arrives.', portrait: A + 'liriel_sq.jpg' }], image: A + 'scene_emporium.jpg' },
        { id: 'tut_inn', name: 'The Inn', cat: 'trade', x: 15000, y: 15400, notes: 'Where the party meets. Double-click to open its battle map (a square grid).', characters: [{ id: 'tut_c_innkeeper', name: 'Paethorin Baethelor', info: 'Innkeeper. Owes the Emporium money and knows it is dirty.', portrait: A + 'innkeeper_sq.jpg' }, { id: 'tut_c_chef', name: 'Nessa', info: 'Wood-elf cook. Hears everything the caravan drivers say.', portrait: A + 'chef_sq.jpg' }], targetMapId: 'map_tut_inn', icon: 'Door', image: A + 'scene_inn.jpg' }
    ];
    city.links = [
        ['tut_inn', 'tut_smith', '', { label: 'Up the lane' }],
        ['tut_inn', 'tut_library', 'route', { label: 'Across town' }],
        ['tut_library', 'tut_temple', '', { label: 'Temple steps' }],
        ['tut_palace', 'tut_temple', 'oneway', { label: "King's walk", notes: 'Only the court uses it; the gate is guarded on the temple side.' }],
        ['tut_emporium', 'tut_library', '', { label: 'Market street' }],
        ['tut_smith', 'tut_palace', 'secret', { label: 'Root tunnel', notes: 'An old service tunnel into the palace cellars. Elion knows.' }]
    ];
    // Play map: the city seen from above, no grid; shapes over the districts are linked to the rooms
    function district(id, room, px, py, w, h) { return { id: id, type: 'rect', x: O + px - w / 2, y: O + py - h / 2, w: w, h: h, color: 'rgba(224,165,79,0.14)', layer: 'middle', nodeId: room, name: room.replace('tut_', '') }; }
    city.whiteboard = [
        { id: 'tut_wb_citymap', type: 'image', src: A + 'map_eldara.jpg', x: O, y: O, w: 1024, h: 1024, color: 'transparent', layer: 'back', locked: true, name: 'Eldara from above' },
        district('tut_wb_d_palace', 'tut_palace', 410, 250, 220, 120),
        district('tut_wb_d_temple', 'tut_temple', 710, 250, 200, 120),
        district('tut_wb_d_emporium', 'tut_emporium', 780, 510, 220, 110),
        district('tut_wb_d_library', 'tut_library', 670, 660, 200, 110),
        district('tut_wb_d_smith', 'tut_smith', 290, 680, 240, 110),
        district('tut_wb_d_inn', 'tut_inn', 250, 900, 160, 110),
        { id: 'tut_wb_citylabel', type: 'text', x: O, y: O - 60, w: 640, h: 40, color: 'transparent', text: '<b>Eldara</b> (no grid) \u2014 tokens go wherever you drop them; hover a district for its room', fontSize: 14, layer: 'front' },
        // Free placement: no cell to seat in, so any size and any spot works
        pic('bren_sq.jpg', { id: 'tut_wb_bren6', x: O + 330, y: O + 880, w: 44, h: 44, charName: 'Bren of Hollowvale', name: 'Bren', charStats: 'Fighter. On a gridless map a token is any size you like \u2014 these are 44 px.', layer: 'middle' }),
        pic('tharic_sq.jpg', { id: 'tut_wb_tharic6', x: O + 372, y: O + 896, w: 44, h: 44, charName: 'Tharic Ironfist', name: 'Tharic', charStats: 'Knight.', layer: 'middle' }),
        pic('sage_sq.jpg', { id: 'tut_wb_sage6', x: O + 350, y: O + 936, w: 44, h: 44, charName: 'Elandra the Sage', name: 'Elandra', charStats: 'Wizard.', layer: 'middle' }),
        pic('liriel_sq.jpg', { id: 'tut_wb_liriel', x: O + 690, y: O + 560, w: 44, h: 44, charName: 'Liriel Aurethiel', name: 'Liriel', charStats: 'Emporium keeper. NPC, out on the market street.', layer: 'middle', charRef: 'tut_c_liriel' })
    ];

    /* ---- The Inn: SQUARE grid over a drawn tavern (its own 50 px squares line up with the app's) ---- */
    var inn = createNewMap('The Inn');
    inn.id = 'map_tut_inn';
    inn.meta.parentId = city.id;
    inn.meta.homeX = 15450; inn.meta.homeY = 15300; inn.meta.lastView = 'visual'; inn.meta.gridType = 'square';
    inn.cats = { room: { label: 'Room', color: '#e0a54f' } };
    inn.rooms = [
        { id: 'tut_inn_common', name: 'Common room', cat: 'room', x: 15000, y: 15100, notes: 'Seven tables, a hearth, and a door that bangs. The party sits by the window.', characters: [] },
        { id: 'tut_inn_bar', name: 'Bar', cat: 'room', x: 15300, y: 15100, notes: 'Nessa runs it when the innkeeper is out, which is always.', characters: [] }
    ];
    inn.links = [['tut_inn_common', 'tut_inn_bar', '', { label: 'Three steps' }]];
    var IX = 14868, IY = 14773;   // places the drawing's grid lines on multiples of 50
    inn.whiteboard = [
        { id: 'tut_wb_innmap', type: 'image', src: A + 'map_inn.jpg', x: IX, y: IY, w: 1198, h: 1089, color: 'transparent', layer: 'back', locked: true, name: 'The Inn' },
        { id: 'tut_wb_innfloor', type: 'rect', x: 15000, y: 15000, w: 800, h: 600, color: 'transparent', layer: 'back-mid', nodeId: 'tut_inn_common', name: 'Common room floor', opacity: 0.1 },
        { id: 'tut_wb_innlabel', type: 'text', x: 14880, y: 14700, w: 520, h: 40, color: 'transparent', text: '<b>The Inn</b> (square grid) \u2014 square picture tokens, one 50 px cell each', fontSize: 14, layer: 'front' },
        sqTok(15250, 15400, pic('bren_sq.jpg', { id: 'tut_wb_bren', charName: 'Bren of Hollowvale', name: 'Bren', charStats: 'Fighter. Shield and a short temper. Your character \u2014 drag me; Snap seats me in a cell.' })),
        sqTok(15300, 15400, pic('tharic_sq.jpg', { id: 'tut_wb_tharic', charName: 'Tharic Ironfist', name: 'Tharic', charStats: 'Knight. Says little, hits hard.' })),
        sqTok(15250, 15450, pic('sage_sq.jpg', { id: 'tut_wb_sage', charName: 'Elandra the Sage', name: 'Elandra', charStats: 'Wizard. Reads everything, including the raiders\' ledger.' })),
        sqTok(15350, 14950, pic('innkeeper_sq.jpg', { id: 'tut_wb_innkeeper', charName: 'Paethorin Baethelor', name: 'Paethorin', charStats: 'Innkeeper. An NPC token behind the bar.', charRef: 'tut_c_innkeeper' })),
        sqTok(15450, 14950, pic('chef_sq.jpg', { id: 'tut_wb_chef', charName: 'Nessa', name: 'Nessa', charStats: 'Wood-elf cook. An NPC token: only the GM moves it.', charRef: 'tut_c_chef' })),
        { id: 'tut_wb_inndoor', type: 'trigger', x: 15450, y: 15750, w: 50, h: 50, color: 'transparent', eventMessage: 'The door bangs open. A caravan driver stumbles in, bleeding: \u201cRaiders. On the hill road.\u201d', name: 'The door' }
    ];

    /* ---- Raiders' Hideout: three floors on HEX grids, stairs as portals ---- */
    var ground = createNewMap("Hideout \u2014 Ground Floor");
    ground.id = 'map_tut_ground';
    ground.meta.parentId = realm.id;
    ground.meta.homeX = 15000; ground.meta.homeY = 15000; ground.meta.lastView = 'visual'; ground.meta.gridType = 'hex';
    ground.cats = { room: { label: 'Room', color: '#e0a54f' }, danger: { label: 'Danger', color: '#d9534f' } };
    ground.rooms = [
        { id: 'tut_g_guard', name: 'Guard room', cat: 'danger', x: 14900, y: 15000, notes: 'Grukk\'s desk and two guards. The ledger is in the office behind.', characters: [] },
        { id: 'tut_g_office', name: 'Office', cat: 'room', x: 15150, y: 14800, notes: 'The ledger names the Emporium\'s buyer. Locked (DC 12).', characters: [] },
        { id: 'tut_g_armory', name: 'Armory', cat: 'room', x: 14800, y: 15300, notes: 'Elion\'s axes. He will want them back.', characters: [] },
        { id: 'tut_g_cell', name: 'Jail cell', cat: 'room', x: 14800, y: 14800, notes: 'A caravan guard, alive, if the party is quick.', characters: [] }
    ];
    ground.links = [['tut_g_guard', 'tut_g_office', '', { label: 'Door' }], ['tut_g_guard', 'tut_g_armory', '', { label: 'Door' }], ['tut_g_guard', 'tut_g_cell', 'secret', { label: 'Barred hatch' }]];
    ground.whiteboard = [
        { id: 'tut_wb_groundmap', type: 'image', src: A + 'map_ground.jpg', x: O, y: O, w: 1024, h: 1024, color: 'transparent', layer: 'back', locked: true, name: 'Ground floor plan' },
        { id: 'tut_wb_guardfloor', type: 'rect', x: O + 60, y: O + 190, w: 640, h: 640, color: 'transparent', layer: 'back-mid', nodeId: 'tut_g_guard', name: 'Guard room floor', opacity: 0.1 },
        { id: 'tut_wb_groundlabel', type: 'text', x: O + 40, y: O - 60, w: 620, h: 40, color: 'transparent', text: '<b>Hideout \u2014 Ground Floor</b> (hex grid) \u2014 hex picture tokens; the stairs are portals: double-click them', fontSize: 14, layer: 'front' },
        // On a hex grid the picture tokens are clipped to a hexagon and fill one cell (60\u00d752)
        hexTok(O + 420, O + 470, pic('orc_hex.png', { id: 'tut_wb_grukk', charName: 'Grukk', name: 'Grukk', charStats: 'Orc raider chief. NPC \u2014 right-click for conditions, posture, elevation.', charRef: 'tut_c_grukk' })),
        hexTok(O + 560, O + 300, pic('minotaur_soldier_hex.png', { id: 'tut_wb_horn', charName: 'Horn', name: 'Horn', charStats: 'Minotaur guard. Hidden from players until they open the door.', hidden: true })),
        hexTok(O + 300, O + 600, pic('bren_hex.png', { id: 'tut_wb_bren2', charName: 'Bren of Hollowvale', name: 'Bren', charStats: 'Your character, in hex form for a hex map.' })),
        hexTok(O + 360, O + 640, pic('tharic_hex.png', { id: 'tut_wb_tharic2', charName: 'Tharic Ironfist', name: 'Tharic', charStats: 'Knight.' })),
        hexTok(O + 300, O + 690, pic('sage_hex.png', { id: 'tut_wb_sage2', charName: 'Elandra the Sage', name: 'Elandra', charStats: 'Wizard.' })),
        stairs(O + 935, O + 760, 'map_tut_basement', false, 'Stairs down'),
        stairs(O + 700, O + 420, 'map_tut_top', true, 'Stairs up'),
        hexTok(O + 480, O + 300, { id: 'tut_wb_officedoor', type: 'trigger', shape: 'hexagon', color: 'transparent', eventMessage: 'The office door is locked. Grukk\'s ledger is inside \u2014 DC 12 to pick it, or ask Grukk nicely.', name: 'Office door' })
    ];

    var basement = createNewMap('Hideout \u2014 Basement');
    basement.id = 'map_tut_basement';
    basement.meta.parentId = ground.id;
    basement.meta.homeX = 15000; basement.meta.homeY = 15000; basement.meta.lastView = 'visual'; basement.meta.gridType = 'hex';
    basement.cats = { room: { label: 'Room', color: '#e0a54f' }, danger: { label: 'Danger', color: '#d9534f' } };
    basement.rooms = [
        { id: 'tut_b_hall', name: 'Cellar', cat: 'room', x: 14900, y: 15000, notes: 'Barrels, damp, and a corridor around the vault.', characters: [] },
        { id: 'tut_b_vault', name: 'Locked vault', cat: 'danger', x: 15200, y: 15000, notes: 'The raiders\' takings \u2014 and the thing they feed. The slime is hidden from players until the door opens.', characters: [] }
    ];
    basement.links = [['tut_b_hall', 'tut_b_vault', 'secret', { label: 'Vault door', notes: 'Iron, barred from outside. Grukk has the key.' }]];
    basement.whiteboard = [
        { id: 'tut_wb_basemap', type: 'image', src: A + 'map_basement.jpg', x: O, y: O, w: 1024, h: 1024, color: 'transparent', layer: 'back', locked: true, name: 'Basement plan' },
        { id: 'tut_wb_baselabel', type: 'text', x: O + 40, y: O - 60, w: 520, h: 40, color: 'transparent', text: '<b>Hideout \u2014 Basement</b> (hex grid) \u2014 the vault holds a hidden token and a trap', fontSize: 14, layer: 'front' },
        hexTok(O + 497, O + 470, pic('slime_hex.png', { id: 'tut_wb_slime', charName: 'Vault Slime', name: 'Vault Slime', charStats: 'Fed on whatever the raiders did not want. Hidden until revealed.', hidden: true, posture: 'lying-prone' })),
        hexTok(O + 560, O + 610, { id: 'tut_wb_vaultdoor', type: 'trigger', shape: 'hexagon', color: 'transparent', eventMessage: 'The vault door swings in. Something green and heavy shifts in the dark.', name: 'Vault door' }),
        stairs(O + 300, O + 230, 'map_tut_ground', true, 'Stairs up')
    ];

    var top = createNewMap('Hideout \u2014 Top Floor');
    top.id = 'map_tut_top';
    top.meta.parentId = ground.id;
    top.meta.homeX = 14800; top.meta.homeY = 15000; top.meta.lastView = 'visual'; top.meta.gridType = 'hex';
    top.cats = { room: { label: 'Room', color: '#e0a54f' }, danger: { label: 'Danger', color: '#d9534f' } };
    top.rooms = [
        { id: 'tut_t_dock', name: 'Dock', cat: 'room', x: 14900, y: 14800, notes: 'A loading dock over the drop. The raft rope runs from here.', characters: [] },
        { id: 'tut_t_gallery', name: 'Archers\' gallery', cat: 'danger', x: 14900, y: 15100, notes: 'Two loopholes over the approach. Anyone here is 4 yards above the ground: Elevation +4 on the tokens, so shots down to the yard measure the height too.', characters: [] }
    ];
    top.links = [['tut_t_dock', 'tut_t_gallery', '', { label: 'Ladder' }]];
    top.whiteboard = [
        { id: 'tut_wb_topmap', type: 'image', src: A + 'map_top.jpg', x: O, y: O, w: 1024, h: 1024, color: 'transparent', layer: 'back', locked: true, name: 'Top floor plan' },
        { id: 'tut_wb_toplabel', type: 'text', x: O + 40, y: O - 60, w: 560, h: 40, color: 'transparent', text: '<b>Hideout \u2014 Top Floor</b> (hex grid) \u2014 the archers stand 4 yards up: note the +4 chips', fontSize: 14, layer: 'front' },
        hexTok(O + 100, O + 385, pic('minotaur_archer_hex.png', { id: 'tut_wb_fletch1', charName: 'Fletch', name: 'Fletch', charStats: 'Minotaur archer at the north loophole. Elevation +4.', elevation: 4 })),
        hexTok(O + 100, O + 700, pic('minotaur_archer_hex.png', { id: 'tut_wb_fletch2', charName: 'Second archer', name: 'Second archer', charStats: 'Minotaur archer at the south loophole. Elevation +4, kneeling.', elevation: 4, posture: 'kneeling' })),
        stairs(O + 330, O + 340, 'map_tut_ground', false, 'Stairs down')
    ];

    /* ---- Old Fort: an outdoor hex map ---- */
    var fort = createNewMap('Old Fort');
    fort.id = 'map_tut_fort';
    fort.meta.parentId = realm.id;
    fort.meta.homeX = 15000; fort.meta.homeY = 15000; fort.meta.lastView = 'visual'; fort.meta.gridType = 'hex';
    fort.cats = { wild: { label: 'Wilderness', color: '#5cb87a' }, danger: { label: 'Danger', color: '#d9534f' } };
    fort.rooms = [
        { id: 'tut_f_yard', name: 'Fort yard', cat: 'danger', x: 15000, y: 15000, notes: 'Walls still stand; the gate does not. The lone orc in the trees is not with the raiders.', characters: [] },
        { id: 'tut_f_wood', name: 'Tree line', cat: 'wild', x: 14700, y: 15100, notes: 'Cover, and something watching from it.', characters: [] }
    ];
    fort.links = [['tut_f_wood', 'tut_f_yard', 'oneway', { label: 'Charge across the open' }]];
    fort.whiteboard = [
        { id: 'tut_wb_fortmap', type: 'image', src: A + 'map_fort.jpg', x: O, y: O, w: 1024, h: 1024, color: 'transparent', layer: 'back', locked: true, name: 'Old Fort' },
        { id: 'tut_wb_fortlabel', type: 'text', x: O + 40, y: O - 60, w: 520, h: 40, color: 'transparent', text: '<b>Old Fort</b> (hex grid) \u2014 an outdoor battle map; the archer on the wall is at +3', fontSize: 14, layer: 'front' },
        hexTok(O + 830, O + 220, pic('minotaur_archer_hex.png', { id: 'tut_wb_wallarcher', charName: 'Wall archer', name: 'Wall archer', charStats: 'On the battlements: Elevation +3.', elevation: 3 })),
        hexTok(O + 500, O + 560, pic('minotaur_soldier_hex.png', { id: 'tut_wb_gateguard', charName: 'Gate guard', name: 'Gate guard', charStats: 'Minotaur soldier at the gate.' })),
        hexTok(O + 140, O + 300, pic('orc_hex.png', { id: 'tut_wb_grimtusk', charName: 'Old Grimtusk', name: 'Old Grimtusk', charStats: 'Orc — a cast-out loner, no friend of the raiders. Hidden in the trees until the party gets close.', hidden: true }))
    ];

    /* ---- Palace throne room: an indoor hex map built from shapes (no picture needed) ---- */
    var throne = createNewMap('Palace \u2014 Throne Room');
    throne.id = 'map_tut_throne';
    throne.meta.parentId = city.id;
    throne.meta.homeX = 15000; throne.meta.homeY = 15000; throne.meta.lastView = 'visual'; throne.meta.gridType = 'hex';
    throne.cats = { civic: { label: 'Civic', color: '#e0a54f' } };
    throne.rooms = [
        { id: 'tut_th_hall', name: 'Throne room', cat: 'civic', x: 15000, y: 15000, notes: 'Roots for pillars, a dais one yard up, and two golems that do not blink. The king hears the party here.', characters: [] },
        { id: 'tut_th_ante', name: 'Antechamber', cat: 'civic', x: 14700, y: 15000, notes: 'Where petitioners wait. Weapons stay here.', characters: [] }
    ];
    throne.links = [['tut_th_ante', 'tut_th_hall', 'oneway', { label: 'The doors open inward' }]];
    throne.whiteboard = [
        { id: 'tut_wb_thfloor', type: 'rect', x: 14640, y: 14740, w: 720, h: 520, color: '#232331', layer: 'back', nodeId: 'tut_th_hall', name: 'Hall floor' },
        { id: 'tut_wb_thante', type: 'rect', x: 14440, y: 14880, w: 200, h: 240, color: '#1e1e29', layer: 'back', nodeId: 'tut_th_ante', name: 'Antechamber floor' },
        { id: 'tut_wb_thdais', type: 'rect', x: 15140, y: 14880, w: 200, h: 240, color: 'rgba(224,165,79,0.22)', layer: 'back-mid', name: 'Dais (1 yd up)' },
        { id: 'tut_wb_thlabel', type: 'text', x: 14640, y: 14680, w: 620, h: 40, color: 'transparent', text: '<b>Palace \u2014 Throne Room</b> (hex grid, built from shapes) \u2014 the dais is a yard up: the king\'s +1', fontSize: 14, layer: 'front' },
        { id: 'tut_wb_thp1', type: 'circle', x: 14800, y: 14800, w: 40, h: 40, color: '#3a3a4a', layer: 'back-mid', name: 'Root pillar' },
        { id: 'tut_wb_thp2', type: 'circle', x: 14800, y: 15160, w: 40, h: 40, color: '#3a3a4a', layer: 'back-mid', name: 'Root pillar' },
        { id: 'tut_wb_thp3', type: 'circle', x: 15000, y: 14800, w: 40, h: 40, color: '#3a3a4a', layer: 'back-mid', name: 'Root pillar' },
        { id: 'tut_wb_thp4', type: 'circle', x: 15000, y: 15160, w: 40, h: 40, color: '#3a3a4a', layer: 'back-mid', name: 'Root pillar' },
        hexTok(15240, 15000, pic('king_hex.png', { id: 'tut_wb_king', charName: 'King Thalindor Starseeker', name: 'King Thalindor', charStats: 'On the dais: Elevation +1. An NPC \u2014 the GM moves him.', charRef: 'tut_c_king', elevation: 1, posture: 'sitting' })),
        hexTok(15240, 14900, pic('golems_hex.png', { id: 'tut_wb_warden1', charName: 'Warden', name: 'Warden', charStats: 'Elven golem. Does not move unless the king does.', elevation: 1 })),
        hexTok(15240, 15100, pic('golems_hex.png', { id: 'tut_wb_warden2', charName: 'Second Warden', name: 'Second Warden', charStats: 'Elven golem.', elevation: 1 })),
        hexTok(14700, 14950, pic('bren_hex.png', { id: 'tut_wb_bren3', charName: 'Bren of Hollowvale', name: 'Bren', charStats: 'Fighter.' })),
        hexTok(14700, 15050, pic('tharic_hex.png', { id: 'tut_wb_tharic3', charName: 'Tharic Ironfist', name: 'Tharic', charStats: 'Knight.' })),
        hexTok(14760, 15000, pic('sage_hex.png', { id: 'tut_wb_sage3', charName: 'Elandra the Sage', name: 'Elandra', charStats: 'Wizard.' })),
        hexTok(15100, 15000, { id: 'tut_wb_thsteps', type: 'trigger', shape: 'hexagon', color: 'transparent', eventMessage: 'The Wardens turn their heads as one. \u201cKneel,\u201d says nobody, and everyone does.', name: 'Dais steps' })
    ];

    /* ---- Temple: a square-grid hall from shapes ---- */
    var temple = createNewMap('Temple \u2014 Crystal Hall');
    temple.id = 'map_tut_temple';
    temple.meta.parentId = city.id;
    temple.meta.homeX = 15000; temple.meta.homeY = 15000; temple.meta.lastView = 'visual'; temple.meta.gridType = 'square';
    temple.cats = { holy: { label: 'Temple', color: '#b98cff' } };
    temple.rooms = [
        { id: 'tut_te_hall', name: 'Crystal hall', cat: 'holy', x: 15000, y: 15000, notes: 'Moonlight through crystal. A donation at the altar buys healing; a promise buys a blessing.', characters: [] }
    ];
    temple.links = [];
    temple.whiteboard = [
        { id: 'tut_wb_tefloor', type: 'rect', x: 14700, y: 14750, w: 600, h: 500, color: '#26233a', layer: 'back', nodeId: 'tut_te_hall', name: 'Hall floor' },
        { id: 'tut_wb_telabel', type: 'text', x: 14700, y: 14690, w: 600, h: 40, color: 'transparent', text: '<b>Temple \u2014 Crystal Hall</b> (square grid, built from shapes) \u2014 the altar is a trigger zone', fontSize: 14, layer: 'front' },
        { id: 'tut_wb_tealtar', type: 'trigger', x: 15200, y: 14950, w: 100, h: 100, color: 'transparent', eventMessage: 'The crystals brighten. Whoever stands here feels the Moon\'s regard \u2014 healed of one wound, or bound to one promise.', name: 'Altar' },
        { id: 'tut_wb_tec1', type: 'circle', x: 14750, y: 14800, w: 30, h: 30, color: '#e0a54f', layer: 'back-mid', name: 'Candle stand', opacity: 0.7 },
        { id: 'tut_wb_tec2', type: 'circle', x: 14750, y: 15170, w: 30, h: 30, color: '#e0a54f', layer: 'back-mid', name: 'Candle stand', opacity: 0.7 },
        sqTok(15150, 14950, pic('priestess_sq.jpg', { id: 'tut_wb_priestess', charName: 'High Priestess Elandra Moonshadow', name: 'Elandra Moonshadow', charStats: 'High Priestess. NPC.', charRef: 'tut_c_priestess' })),
        sqTok(14800, 15000, pic('bren_sq.jpg', { id: 'tut_wb_bren4', charName: 'Bren of Hollowvale', name: 'Bren', charStats: 'Fighter.' })),
        sqTok(14850, 15000, pic('sage_sq.jpg', { id: 'tut_wb_sage4', charName: 'Elandra the Sage', name: 'Elandra', charStats: 'Wizard. Two Elandras in one room \u2014 charName tells them apart.' }))
    ];

    /* ---- The forge ---- */
    var forge = createNewMap("Blacksmith's Forge");
    forge.id = 'map_tut_forge';
    forge.meta.parentId = city.id;
    forge.meta.homeX = 15000; forge.meta.homeY = 15000; forge.meta.lastView = 'visual'; forge.meta.gridType = 'square';
    forge.cats = { trade: { label: 'Trade', color: '#4db3d3' } };
    forge.rooms = [
        { id: 'tut_fo_floor', name: 'Forge floor', cat: 'trade', x: 15000, y: 15000, notes: 'Two anvils, one fire, and Elion between them. Anything from the hideout can be reforged here.', characters: [] }
    ];
    forge.links = [];
    forge.whiteboard = [
        { id: 'tut_wb_fofloor', type: 'rect', x: 14750, y: 14800, w: 500, h: 400, color: '#2c2622', layer: 'back', nodeId: 'tut_fo_floor', name: 'Forge floor' },
        { id: 'tut_wb_folabel', type: 'text', x: 14750, y: 14740, w: 500, h: 40, color: 'transparent', text: '<b>Blacksmith\'s Forge</b> (square grid) \u2014 the fire is a trigger zone; the anvils are plain shapes', fontSize: 14, layer: 'front' },
        { id: 'tut_wb_fofire', type: 'trigger', x: 15150, y: 14850, w: 100, h: 100, color: 'transparent', eventMessage: 'The forge fire roars up. Elion: \u201cMind your eyebrows.\u201d', name: 'Forge fire' },
        { id: 'tut_wb_fofireshape', type: 'rect', x: 15150, y: 14850, w: 100, h: 100, color: 'rgba(217,83,79,0.35)', layer: 'back-mid', name: 'Fire' },
        { id: 'tut_wb_foanvil1', type: 'rect', x: 14900, y: 14950, w: 50, h: 30, color: '#6a6a7d', layer: 'back-mid', name: 'Anvil' },
        { id: 'tut_wb_foanvil2', type: 'rect', x: 15000, y: 15100, w: 50, h: 30, color: '#6a6a7d', layer: 'back-mid', name: 'Anvil' },
        sqTok(15050, 14950, pic('smith_sq.jpg', { id: 'tut_wb_smith', charName: 'Master Blacksmith Elion Flameheart', name: 'Elion', charStats: 'Blacksmith. NPC.', charRef: 'tut_c_smith' })),
        sqTok(14800, 15050, pic('tharic_sq.jpg', { id: 'tut_wb_tharic4', charName: 'Tharic Ironfist', name: 'Tharic', charStats: 'Knight, here about a dent.' }))
    ];

    /* ---- Hill road: an outdoor hex map from shapes, with the ambush ---- */
    var road = createNewMap('Hill Road');
    road.id = 'map_tut_hillroad';
    road.meta.parentId = realm.id;
    road.meta.homeX = 15000; road.meta.homeY = 15000; road.meta.lastView = 'visual'; road.meta.gridType = 'hex';
    road.cats = { wild: { label: 'Wilderness', color: '#5cb87a' }, danger: { label: 'Danger', color: '#d9534f' } };
    road.rooms = [
        { id: 'tut_hr_ford', name: 'The ford', cat: 'wild', x: 14800, y: 15000, notes: 'Knee-deep, cold, loud. Nobody hears an ambush being set.', characters: [] },
        { id: 'tut_hr_bend', name: 'Ambush bend', cat: 'danger', x: 15200, y: 15000, notes: 'Rocks above the road on both sides. The archer is 2 yards up on the left; the raiders come from the trees on the right.', characters: [] }
    ];
    road.links = [['tut_hr_ford', 'tut_hr_bend', 'route', { label: 'Half a mile uphill' }]];
    road.whiteboard = [
        { id: 'tut_wb_hrgrass', type: 'rect', x: 14500, y: 14700, w: 1000, h: 600, color: '#243424', layer: 'back', name: 'Hillside' },
        { id: 'tut_wb_hrroad', type: 'rect', x: 14500, y: 14960, w: 1000, h: 80, color: '#5a4a3a', layer: 'back-mid', nodeId: 'tut_hr_bend', name: 'The road', rot: -8 },
        { id: 'tut_wb_hrford', type: 'rect', x: 14560, y: 14900, w: 120, h: 200, color: 'rgba(77,179,211,0.35)', layer: 'back-mid', nodeId: 'tut_hr_ford', name: 'The ford' },
        { id: 'tut_wb_hrlabel', type: 'text', x: 14500, y: 14640, w: 620, h: 40, color: 'transparent', text: '<b>Hill Road</b> (hex grid, outdoors, built from shapes) \u2014 the ambush waits at the bend', fontSize: 14, layer: 'front' },
        { id: 'tut_wb_hrrock', type: 'hexagon', x: 15150, y: 14780, w: 120, h: 104, color: '#4a4a5a', layer: 'back-mid', name: 'Rock (2 yd up)' },
        { id: 'tut_wb_hrtree1', type: 'circle', x: 15300, y: 15120, w: 90, h: 90, color: '#2f5a33', layer: 'back-mid', name: 'Trees' },
        { id: 'tut_wb_hrtree2', type: 'circle', x: 15380, y: 15180, w: 110, h: 110, color: '#2f5a33', layer: 'back-mid', name: 'Trees' },
        hexTok(15210, 14832, pic('minotaur_archer_hex.png', { id: 'tut_wb_hrarcher', charName: 'Rock archer', name: 'Rock archer', charStats: 'On the rock above the bend: Elevation +2. Hidden until the first arrow.', elevation: 2, hidden: true })),
        hexTok(15330, 15140, pic('orc_hex.png', { id: 'tut_wb_hrgrukk', charName: 'Grukk', name: 'Grukk', charStats: 'Leads the ambush in person. Hidden in the trees.', hidden: true, charRef: 'tut_c_grukk' })),
        hexTok(15390, 15190, pic('minotaur_soldier_hex.png', { id: 'tut_wb_hrhorn', charName: 'Horn', name: 'Horn', charStats: 'Hidden in the trees.', hidden: true })),
        hexTok(14700, 15000, pic('bren_hex.png', { id: 'tut_wb_bren5', charName: 'Bren of Hollowvale', name: 'Bren', charStats: 'Fighter, wet to the knee.' })),
        hexTok(14760, 15030, pic('tharic_hex.png', { id: 'tut_wb_tharic5', charName: 'Tharic Ironfist', name: 'Tharic', charStats: 'Knight.' })),
        hexTok(14700, 15060, pic('sage_hex.png', { id: 'tut_wb_sage5', charName: 'Elandra the Sage', name: 'Elandra', charStats: 'Wizard.' })),
        hexTok(15100, 15000, { id: 'tut_wb_hrambush', type: 'trigger', shape: 'hexagon', color: 'transparent', eventMessage: 'An arrow from the rock above. Grukk and Horn come out of the trees. Reveal the three hidden tokens (select each \u2192 Visible to players) and start combat from the right-click menu.', name: 'Ambush point' })
    ];

    /* ---- Handouts: what the GM can show players (they land in each player's Journal) ---- */
    camp.handouts = {
        tut_h_ledger: { id: 'tut_h_ledger', kind: 'text', title: "Grukk's ledger", caption: 'Found in the hideout office', text: 'Caravan of the 3rd \u2014 12 bales, 4 casks, to L.A. at the Emporium, paid in silver.\nCaravan of the 9th \u2014 the Ironfist wagon. Keep the swords.\nHorn owes me two nights.', createdAt: Date.now() },
        tut_h_hideout: { id: 'tut_h_hideout', kind: 'image', title: 'The hideout', caption: 'What the caravan driver saw from the road', src: A + 'scene_hideout.jpg', createdAt: Date.now() }
    };

    /* ---- the session plan ---- */
    var plan = createNewPlanner('Session 1 \u2014 The Hill Road');
    plan.id = 'plan_tut_session1';
    plan.meta.status = 'next';
    plan.blocks = [
        { type: 'h1', title: 'Session 1 \u2014 The Hill Road', sub: 'A one-evening tutorial adventure' },
        { type: 'lede', content: 'Raiders are bleeding the caravans between Eldara and the hills. King Thalindor wants it stopped before harvest; the party starts at The Inn, where a wounded driver names the hill road.' },
        { type: 'h2', title: 'Beats' },
        { type: 'node', title: 'The driver at the inn', tag: 'social', must: 'The party learns where the raiders strike.', cols: ['Check', 'DC', 'On success'], rows: [{ col1: 'Medicine', col2: '10', col3: 'He lives and describes the goat path.' }, { col1: 'Insight', col2: '13', col3: 'He is hiding that he sold the route.' }] },
        { type: 'node', title: 'The hideout', tag: 'combat', must: 'Grukk\'s ledger changes hands.', cols: ['Where', 'Who', 'Note'], rows: [{ col1: 'Ground floor', col2: 'Grukk, Horn', col3: 'Horn is hidden behind the guard-room door.' }, { col1: 'Top floor', col2: 'Two archers', col3: 'Elevation +4 \u2014 use the ruler for the 3D figure.' }, { col1: 'Basement', col2: 'Vault slime', col3: 'Only if they open the vault.' }] },
        { type: 'callout', content: 'Planners are yours alone \u2014 players never receive them, so put the twist (the Emporium buyer) here, not in a room name.' },
        { type: 'h2', title: 'If they chase the raiders' },
        { type: 'text', content: 'The survivors raft downriver to the <b>Old Fort</b>. Old Grimtusk the outcast orc is nobody\'s friend.' }
    ];

    /* ---- the handbook page: what players read at the table ---- */
    var book = tutorialHandbookPage();

    [realm, city, inn, throne, temple, forge, ground, basement, top, fort, road, buildTutorialFogMap(), plan, book].forEach(function(it) { camp.items[it.id] = it; });
    ensureTutorialSheet(camp);   // the demo system and Bren's character (character sheets, 1.5.0)
    camp.activeItemId = realm.id;
    return camp;
}

// The pre-fogged demo map (fog of war, 1.5.0): a square-grid cellar where Bren's Sight field lights a disc and a
// monster in the dark is dropped from players' copies. Standalone (like tutorialHandbookPage) so an older Tutorial
// gains it on its next ensure. Sight resolves through camp.fog.fields.sight -> the character's Sight field.
function buildTutorialFogMap() {
    var A = TUTORIAL_ART_URL;
    function sqTok(x, y, props) { return Object.assign({ x: Math.round(x / 50) * 50, y: Math.round(y / 50) * 50, w: 50, h: 50, layer: 'middle' }, props); }
    function pic(file, extra) { return Object.assign({ type: 'image', src: A + file, color: 'transparent', isChar: true }, extra); }
    var fm = createNewMap('Fog Demo — The Dark Cellar');
    fm.id = 'map_tut_fog';
    fm.meta.parentId = 'map_tut_realm';
    fm.meta.homeX = 15000; fm.meta.homeY = 15000; fm.meta.lastView = 'visual'; fm.meta.gridType = 'square';
    fm.meta.cellUnit = 'yd'; fm.meta.cellValue = 1;   // 1 cell = 1 yard = 50 px, so a sight in yards reads straight off as cells
    fm.fog = { on: true, mode: 'auto', manual: { adds: [], cuts: [] } };   // fog ON; vision + manual; all-around vision (the square-grid default, resolved at read time)
    fm.cats = { room: { label: 'Room', color: '#e0a54f' }, danger: { label: 'Danger', color: '#d9534f' } };
    fm.rooms = [
        { id: 'tut_fog_lit', name: 'Lantern light', cat: 'room', x: 15000, y: 15000, notes: 'As far as Bren’s lantern reaches. In a session each player sees only this disc around their own tokens.', characters: [] },
        { id: 'tut_fog_dark', name: 'The dark', cat: 'danger', x: 15400, y: 15000, notes: 'Beyond the light. A creature here is dropped from every player’s copy until a token’s vision (or your reveal brush) reaches it.', characters: [] }
    ];
    fm.links = [['tut_fog_lit', 'tut_fog_dark', 'oneway', { label: 'Into the dark' }]];
    fm.whiteboard = [
        { id: 'tut_wb_fogfloor', type: 'rect', x: 14700, y: 14750, w: 800, h: 500, color: '#201d28', layer: 'back', nodeId: 'tut_fog_lit', name: 'Cellar floor' },
        { id: 'tut_wb_fogpillar1', type: 'circle', x: 14900, y: 14850, w: 40, h: 40, color: '#3a3a4a', layer: 'back-mid', name: 'Pillar', blocksSight: true, sightType: 'wall' },
        { id: 'tut_wb_fogpillar2', type: 'circle', x: 15300, y: 15150, w: 40, h: 40, color: '#3a3a4a', layer: 'back-mid', name: 'Pillar', blocksSight: true, sightType: 'wall' },
        sqTok(15000, 15000, pic('bren_sq.jpg', { id: 'tut_wb_bren7', charName: 'Bren of Hollowvale', name: 'Bren', charStats: 'Your character. His Sight field (6 yd) lights the fog — drag him and the lit disc follows.', charId: 'c_tut_bren' })),
        sqTok(15400, 15000, pic('slime_sq.jpg', { id: 'tut_wb_lurker', charName: 'Cellar Lurker', name: 'Cellar Lurker', charStats: 'A monster in the dark, 8 yd off — outside Bren’s sight, so players never receive it. Move a token close, or use the reveal brush, to bring it into view.' }))
    ];
    return fm;
}

// The Tutorial's one handbook page (1.5.0). Built apart from the campaign so an older Tutorial gains it on
// its next ensure — every install that ran a 1.4.x tour has a Tutorial without one, and the tour step
// points at it.
function tutorialHandbookPage() {
    var book = createNewDoc('House rules');
    book.id = 'doc_tut_handbook';
    book.blocks = [
        { id: 'b_tut_h1', type: 'h1', title: 'House rules', sub: 'What the table agreed on' },
        { id: 'b_tut_lede', type: 'lede', content: 'A handbook page is for the things every player should be able to look up mid-game: rules, a quick reference, the setting primer. Players read it from their own Handbook tree while the map keeps running.' },
        { id: 'b_tut_h2', type: 'h2', title: 'At the table' },
        { id: 'b_tut_t1', type: 'text', content: '<p><b>Inspiration</b> is spent, never banked: use it on the roll you earned it for or lose it at the end of the scene.</p><p>A natural 20 on a save also shrugs off one lingering effect of your choice.</p>' },
        { id: 'b_tut_tbl', type: 'table', title: 'Travel pace', cols: ['Pace', 'Per hour', 'Effect'], rows: [{ col1: 'Fast', col2: '4 miles', col3: '\u22125 to passive Perception' }, { col1: 'Normal', col2: '3 miles', col3: '\u2014' }, { col1: 'Slow', col2: '2 miles', col3: 'Able to use stealth' }] },
        { id: 'b_tut_call', type: 'callout', content: 'Only pages left on <b>Players can read</b> reach the table. Try the switch in the toolbar: this page vanishes from every player at once, and comes back when you turn it on again.' }
    ];
    return book;
}

function tutorialCampaign() { return state.appState.campaigns[TUTORIAL_CAMP_ID] || null; }
function tutorialVtt() { return window.wpVtt ? window.wpVtt.allOn() : { v: 1, master: true, features: { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true, fog: true, turning: true } }; }
// A session is exactly one campaign: opening, rebuilding or discarding the Tutorial while hosting is a campaign switch,
// so it asks first and ends the session on yes (net.js guardCampaignSwitch). Off a session it simply runs.
function guardSwitch(switching, fn) { if (switching && window.wpConfirmCampaignSwitch) window.wpConfirmCampaignSwitch(fn); else fn(); }
function hosting() { var n = window.wpNet; return !!(n && n.active && n.role === 'host'); }

// Creates the Tutorial campaign (or rebuilds it when asked) and makes it active
function ensureTutorialCampaign(rebuild) {
    var camp = tutorialCampaign();
    if (!camp || rebuild) {
        camp = buildTutorialCampaign();
        state.appState.campaigns[TUTORIAL_CAMP_ID] = camp;
        resetHistory(TUTORIAL_CAMP_ID);   // fixed ids: no stack from an earlier copy may attach to the fresh one
    }
    if (!camp.items.doc_tut_handbook) camp.items.doc_tut_handbook = tutorialHandbookPage();   // a Tutorial from before 1.5.0: the page the tour points at
    // a Tutorial from before fog of war (1.5.0): the Sight field, Bren's value, the campaign mapping and the pre-fogged demo map
    if (camp.system && Array.isArray(camp.system.fields) && !camp.system.fields.some(function(f) { return f.id === 'f_tut_sight'; })) camp.system.fields.push({ id: 'f_tut_sight', key: 'Sight', label: 'Sight (yards)', kind: 'number', def: 6, min: 0, max: 120, step: 1, edit: 'owner', vis: 'all', hover: false });
    if (camp.chars && camp.chars.c_tut_bren && camp.chars.c_tut_bren.values && camp.chars.c_tut_bren.values.f_tut_sight == null) camp.chars.c_tut_bren.values.f_tut_sight = 6;
    if (!camp.fog || !camp.fog.fields || camp.fog.fields.sight !== 'f_tut_sight') camp.fog = { fields: { sight: 'f_tut_sight' }, defaults: { sight: 3 } };
    if (!camp.items.map_tut_fog) camp.items.map_tut_fog = buildTutorialFogMap();
    else if (camp.items.map_tut_fog.whiteboard) camp.items.map_tut_fog.whiteboard.forEach(function(w) { if (w && typeof w.id === 'string' && w.id.indexOf('tut_wb_fogpillar') === 0 && !w.blocksSight) { w.blocksSight = true; w.sightType = 'wall'; } });   // 1.5.0 sight-blocking: the demo pillars block sight (patch an existing Tutorial)
    if (window.wpVtt && !window.wpVtt.locked()) camp.vtt = tutorialVtt();   // an older or flat-default copy: the tour never teaches chips that do not draw
    state.appState.activeCampaignId = TUTORIAL_CAMP_ID;
    state.selId = null; state.selWbId = null; state.selWbIds = []; state.linkStart = null;
    updateCampaignSelect(); updateSidebarNav(); render(); save(true);
    installTutorialArt(function(copied) { camp.tutorialArt = 'installed'; save(true); if (copied) render(); });
    return camp;
}

function discardTutorialCampaign(done) {
    var camp = tutorialCampaign();
    if (!camp) { toast('There is no Tutorial campaign to discard.'); if (done) done(false); return; }
    showConfirm('Discard the Tutorial campaign? Everything in it is deleted — including anything you built on top of it. This cannot be undone (a safety copy is taken first).', function(yes) {
        if (!yes) { if (done) done(false); return; }
        guardSwitch(hosting() && state.appState.activeCampaignId === TUTORIAL_CAMP_ID, function() {   // discarding the hosted campaign moves the app onto another
        takeSafetyCopy().then(function() {   // a campaign delete: the safety copy first, then the stacks go with it
            if (window.wpReleaseCampaignTags) window.wpReleaseCampaignTags(state.appState.campaigns[TUTORIAL_CAMP_ID], state.appState);
            delete state.appState.campaigns[TUTORIAL_CAMP_ID];
            resetHistory(TUTORIAL_CAMP_ID);
            var rest = Object.keys(state.appState.campaigns);
            if (!rest.length) {   // it was the only campaign: leave the user with a fresh one, never an empty app
                var fresh = createNewCampaign('New Campaign');
                var first = createNewMap('New Map');
                fresh.items[first.id] = first; fresh.activeItemId = first.id;
                state.appState.campaigns[fresh.id] = fresh;
                rest = [fresh.id];
            }
            if (state.appState.activeCampaignId === TUTORIAL_CAMP_ID || !state.appState.campaigns[state.appState.activeCampaignId]) state.appState.activeCampaignId = rest[0];
            state.selId = null; state.selWbId = null; state.selWbIds = []; state.linkStart = null;
            updateCampaignSelect(); updateSidebarNav(); render(); save(true);
            toast('Tutorial campaign discarded.');
            if (done) done(true);
        });
        });
    });
}

/* ---------- the tour ---------- */
// Each step: target (selector or null for a centred card), title, html, before() to put the
// app in the right state first. Targets are ids from index.html wherever possible.
function goView(mode) { var b = document.querySelector('#viewModeSelect .seg-btn[data-mode="' + mode + '"]'); if (b && !b.classList.contains('active')) b.click(); }
// The VTT step spotlights a block inside Settings: open the modal with the group unfolded, and put the group's
// remembered fold back when the tour moves on (either way) or ends. The spotlight sits above the modal.
var _vttGroupWas = null;
function vttGroup() { return document.querySelector('#settingsModal details.set-group[data-group="vtt"]'); }
function openSettingsForTour() {
    var sb = document.getElementById('settingsBtn'); if (sb) sb.click();   // syncs the panel and shows the modal
    var g = vttGroup(); if (!g) return;
    if (_vttGroupWas === null) { var saved = null; try { saved = JSON.parse(localStorage.getItem('wp_setGroups') || 'null'); } catch (e) {} _vttGroupWas = !!(saved && saved.vtt); }
    g.open = true;
}
function closeSettingsForTour() {
    var m = document.getElementById('settingsModal'); if (m) m.style.display = 'none';
    if (_vttGroupWas === null) return;
    var g = vttGroup(); if (g) g.open = _vttGroupWas;   // the toggle listener rewrites wp_setGroups
    _vttGroupWas = null;
}
function openItem(id) { var camp = getActiveCampaign(); if (!camp || !camp.items[id]) return; if (camp.items[id].type === 'map') navigateToMap(id); else { camp.activeItemId = id; state.selId = null; state.selWbId = null; state.selWbIds = []; updateSidebarNav(); render(); } }
function openLeft() { var sb = document.getElementById('campaignSidebar'); if (sb && sb.classList.contains('collapsed')) { var t = document.getElementById('toggleLeftBtn'); if (t) t.click(); } }

var STEPS = [
    { section: 'Getting started', target: null, title: 'Welcome to Waypoint',
      html: 'This tour uses a small campaign called <b>Tutorial</b> that was just added to your save: an elven realm with a city (throne room, temple, forge, inn), a hill road, a three-floor raiders\' hideout, an old fort, and a session plan \u2014 hex and square grids and no grid at all, drawn maps and maps built from shapes. It is a real campaign \u2014 <b>keep it and build on it</b>, or discard it at the end (or any time from Help \u2192 Tutorial). Use <b>Next</b> and <b>Back</b>; <b>Esc</b> leaves the tour.',
      before: function() { ensureTutorialCampaign(false); openLeft(); openItem('map_tut_realm'); goView('data'); } },
    { target: '#campaignSelect', title: 'Campaigns',
      html: 'Everything belongs to a campaign. This picker switches between them; the buttons beside it add, rename, search and delete campaigns. Your own campaigns are untouched by the tutorial. The <b>Waypoint</b> logo (top-left) opens the <b>Welcome</b> screen &mdash; start, import or continue a campaign, or <b>Join a game</b> (which opens its own screen for your name, color and picture, plus the GM&rsquo;s room code, and shows the connection); set your profile any time in <b>Settings &#9656; Profile</b>, and choose when the screen appears there too.' },
    { target: '#mapNavList', title: 'Maps nest like places',
      html: '<b>Eldara Realm</b> holds the city <b>Eldara</b>, which holds <b>The Inn</b>; the <b>Raiders\' Hideout</b> holds its <b>Basement</b> and <b>Top Floor</b>. World \u2192 region \u2192 building \u2192 room, as deep as you like. Drag a map onto another to nest it. Right-click a map for <b>New Parent Map</b> (a new map that wraps it, with a portal node already placed) or <b>New Child Map</b> (a map inside it). To re-order instead of nesting, drop a map on the top or bottom third of another (a gold line shows where it lands), or right-click and pick <b>↑ Move Up</b> / <b>↓ Move Down</b> to move it one step among its siblings — whatever is nested under it comes along. During a session each map here also shows a small face for the players on it — solid for who is there now, dim for where a player was last seen.' },
    { target: '#viewModeSelect', title: 'Two faces of every map',
      html: 'The <b>Data Map</b> is the node view for your notes and connections; the <b>Play Map</b> is the battle map with tokens. This switch flips between them, and each map remembers which face you left it on.',
      before: function() { openItem('map_tut_city'); goView('data'); } },
    { section: 'The data map', target: '#dataFloatingToolbar', title: 'Data map tools',
      html: '<b>Add Room</b> drops a node. <b>\u2194 Link Mode</b> connects two rooms \u2014 pick the line type first: a solid <b>path</b>, a dashed <b>route</b>, a dotted <b>secret</b> way or a <b>one-way</b> arrow. Hover a line and a small chip appears at its middle (a labelled line keeps its chip). Click the line or the chip to open it in <b>Properties</b>: a label that is drawn on the line (players see it), GM-only notes about the journey (never sent), the type, a swap for the direction, and Remove. <kbd>Delete</kbd> removes the selected link; right-click the chip for a quick type menu. Eldara\'s lines are already labelled \u2014 one of each type.' },
    { target: '#canvasWrap', title: 'Rooms and portals',
      html: 'Drag rooms around; click one to edit it on the right. The <b>Palace</b> carries a scene image and a king with a portrait; hover its shape on the Play Map to see both. <b>The Inn</b> carries a door icon because it is a <b>portal</b>: double-click it to travel into the inn\'s battle map, and use the breadcrumb at the top to climb back out. In multiplayer, players travel by dropping their token on a portal. Hide a portal and it goes inert; tick <b>Trap</b> in its Properties to arm a hidden tile that still teleports whoever steps on it (you see a red ⚠️ on it).',
      before: function() { openItem('map_tut_city'); goView('data'); } },
    { target: '#sidebar', title: 'The Properties panel',
      html: 'Whatever you select is edited here: a room\'s name, category color, scene image, GM-only notes and the characters found there, each with a portrait. Room notes and character info are <b>never sent to players</b>. The panel opens with a selection and closes when it clears; the arrow on its edge toggles it by hand.',
      before: function() { openItem('map_tut_city'); goView('data'); state.selId = 'tut_palace'; render(); if (window.wpSyncRightPanel) window.wpSyncRightPanel(); } },
    { section: 'Play map & VTT features', target: '#wbFloatingToolbar', title: 'Play map tools',
      html: 'Now inside the hideout, on its ground floor Play Map. Left to right: centre, <b>undo and redo for this map</b> (every map and planner keeps its own history — <kbd>Ctrl</kbd>+<kbd>Z</kbd> takes back the last edit on the one you are looking at, never a pan, a click or another map), then <b>grid</b> (square, hex or none \u2014 each map remembers its own) and <b>snap</b>, then the tools \u2014 move, pan, draw, erase, <b>fill</b> (&#129699; color grid cells beneath the tokens; turn on <b>Flood-fill inside lines</b> in its menu and one click fills the whole area your pen strokes enclose &mdash; grid cells on a grid, or a smooth freeform shape with the grid off), <b>measure</b> (rulers; between two tokens at different heights it also prints the 3D figure) and <b>blast</b> (click a cell to drop a grenade radius: tokens in range light up with their distance, height included; drag a blast to move it, right-click it to remove it), then text, shapes, images and the picture library, <b>Import Character</b> for a shadow-base.com sheet, and &#127925; <b>Sound</b> (next). <i>The blast button is a stopgap: blasts will be thrown from the VTT character sheets once those are in, and the preset explosive types are not permanent, names and radii alike \u2014 they will be set per campaign, from its own weapons, and customizable.</i> <b>Framing &amp; panning:</b> the &#127919; centre button includes <b>Fit to Content</b> (<kbd>Shift</kbd>+<kbd>1</kbd>) to zoom-and-pan the whole map into view &mdash; or just your selection when something is selected; hold <kbd>Space</kbd> and drag to pan from any tool, and middle-drag or the hand tool pan too.',
      before: function() { openItem('map_tut_ground'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); } },
    { target: '#soundBtn', title: 'Sound',
      html: 'Under the &#127916; <b>Scene</b> button on the play-map toolbar. Ambient loops and one-shot cues for the scene, heard by every player at the table. The button opens a small panel that stays open while you play: click a loop to <b>crossfade</b> to it, a cue to fire it (up to four overlap), <b>Master</b> for the table&rsquo;s volume and <b>Mute mine</b> for your own speakers. <b>Library&hellip;</b> holds this campaign&rsquo;s sounds: <b>Add sounds&hellip;</b> takes MP3, OGG, M4A or WebM files (4 MB each; loops up to two minutes), each with a name, a Loop / Cue switch, a gain, a preview and Delete; <b>Shared</b> is the bundled set (seven loops from rain to campfire, twelve cues from a door to a sword clash, all CC0); <b>Import from another campaign&hellip;</b> brings sounds in by reference. Sound is a VTT feature, per campaign (Settings &#9656; VTT features); players get the &#128266; speaker in the Table pill for their own volume, a mute, and <i>off for me at this table</i>.',
      before: function() { openItem('map_tut_ground'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); if (window.wpSound) window.wpSound.closePanel(); var m = document.getElementById('sceneFxMenu'); if (m) m.classList.add('show'); } },   // Sound lives in the Scene flyout now — open it so the step points at it
    { target: '#musicBtn', title: 'Music',
      html: 'Under &#127916; <b>Scene</b> too, separate from Sound &mdash; for the campaign&rsquo;s <b>music</b>. <b>Add music&hellip;</b> uploads songs (MP3 / OGG) into the library, then build named <b>playlists</b> from them and set a playlist or a single song to <b>remember on a map</b>: as each player opens that map their machine starts it, and moving to a map with the <b>same</b> music keeps it playing without a restart. The panel is a full transport &mdash; play/pause, previous/next, a seek bar to <b>fast-forward or rewind</b>, <b>loop</b> (off / one / whole list), <b>shuffle</b>, and a <b>speed</b> from 0.5&times; to 2&times;. Music has its own volume and mute in the Table pill (the &#127926; note), apart from Sound, so a cue can play over the music. In a session the GM can <b>take control</b> of everyone&rsquo;s music and later hand it back. A VTT feature, per campaign (Settings &#9656; VTT features).',
      before: function() { openItem('map_tut_ground'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); if (window.wpMusic) window.wpMusic.closePanel(); var m = document.getElementById('sceneFxMenu'); if (m) m.classList.add('show'); } },
    { target: '#fxBtn', title: 'Visual effects',
      html: 'Under the &#127916; <b>Scene</b> button too. Flashes, screen shake, color washes, bursts on the map, weather and banners &mdash; the &#10024; panel fires them and the players on that map (and the stream window) see them. Pick a burst look then click the map; a token can <b>Pulse</b> from its right-click menu; <b>Sound with it</b> fires a cue alongside. Off for the campaign, or <b>Reduce motion</b> for yourself, in &#9881; Settings &#9656; VTT features. A VTT feature, per campaign.',
      before: function() { openItem('map_tut_ground'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); if (window.wpSound) window.wpSound.closePanel(); if (window.wpFx) window.wpFx.closePanel(); var m = document.getElementById('sceneFxMenu'); if (m) m.classList.add('show'); } },   // Visual effects lives in the Scene flyout now
    { target: '#fogModeBtn', title: 'Fog of war',
      html: 'Per-player <b>token vision</b>. The &#127787; button turns fog on for <i>this</i> map, then you paint reveal/hide by hand or preview a player&rsquo;s view. In a session each player sees an <b>opaque</b> fog of only what their own tokens light, and the host <b>drops</b> from their copy any creature they cannot see &mdash; true absence, nothing to uncover. Sight comes from a <b>character-sheet field</b> you map in the fog menu (here Bren&rsquo;s <b>Sight</b>, 6&nbsp;yd), or a campaign <b>default</b> for tokens without one. Modes: <b>auto</b> (vision + your reveals), <b>Reveal all</b> (a lit scene) or <b>Cover all</b> (only what you paint); on a gridless map you pick a cell size so vision can be measured. <b>Vision</b> is <b>all around</b> or a <b>facing cone</b> whose width you choose and which turns with each token &mdash; set per map and <b>independent of the grid</b> (a square map can use a cone; a hex map can see all around), with a &ldquo;use for new maps&rdquo; default. Fog a whole campaign at once with <b>Fog on &middot; all maps</b> (and tick <b>New maps start with fog on</b> for later ones). Want fog on <i>only</i> the battlemap and not the scenes around it? Mark an image or shape as a <b>play area</b> (its Properties, or the <b>&#9635;</b> button on the selection toolbar) and fog covers <b>only</b> marked items &mdash; scenes and art stay lit; <b>When no play area is marked</b> chooses whole-map fog or none. This map is <b>already fogged</b> — Bren lights a disc (shown now as the party would see it) and the <b>Cellar Lurker</b> in the dark is hidden from players until a token or your reveal brush reaches it. Flag a <b>fill</b> or a <b>shape</b> (rect, hexagon, circle/pillar or diamond) as <b>Blocks sight</b> in its Properties to make a <b>wall or pillar</b> that vision stops at, or set its type to <b>Door</b> to open/close it (click a door in fog mode; a player can open one their token stands next to). Those same blockers give <b>cover</b>: turn on <b>Cover</b> in your system (&#9881; Settings &#9656; System &#9656; Items) and dragging the <b>ruler</b> between two character tokens shows the cover between them (half / three-quarters / total) &mdash; advisory, you apply it. Fog is a VTT feature, per campaign (&#9881; Settings &#9656; VTT features), on by default and GM-only &mdash; there is no player switch.',
      before: function() { openItem('map_tut_fog'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); if (window.wpSound) window.wpSound.closePanel(); if (window.wpFx) window.wpFx.closePanel(); if (window.wpFog) window.wpFog.setPreview('party'); } },
    { target: '#whiteboardWrap', title: 'Tokens',
      html: 'Any shape or image with <b>Is Character</b> set is a token. On a <b>hex grid</b> the picture tokens are clipped to a hexagon, one cell wide (60&times;52), and they seat themselves in a cell when dropped. Hover a token for its name and stats; <b>right-click</b> one for conditions, posture and elevation \u2014 the chips at its foot show height (<b>+4</b>) and posture (<b>KNL</b>, <b>PRN</b>\u2026), and the switches for both are VTT features, set per campaign in Settings \u25b8 VTT features. In a session a player can right-click <i>their own</i> token for the same rows, and your campaign\'s settings are the most they see. <b>Horn</b> behind the guard-room door is hidden from players \u2014 you see him dimmed \u2014 until you tick <b>Visible to players</b>. The gold hexes on the stairs are <b>portals</b>: double-click one to go up to the archers (at +4) or down to the basement. The hex trigger on the office door fires its message when a token is dropped on it. Right-click a token and <b>Save to Campaign Cast</b> keeps a copy you can drop again from the play map\'s right-click menu, one at a time, or several at once with the \u00d7 box in the flyout.',
      before: function() { openItem('map_tut_ground'); goView('visual'); } },
    { target: '#whiteboardWrap', title: 'Square grids, square tokens',
      html: '<b>The Inn</b> runs on a <b>square grid</b>: 50 px cells over a drawn tavern whose own squares line up with them, and the tokens are square pictures that fill one cell each. Drag one with Snap on and it seats in a cell; <b>&#8862; Fit to grid</b> in the selection toolbar sizes any selection to whole cells on either grid type. The square at the door is a trigger zone. Pick the grid per map with the grid button \u2014 the city map above uses none at all.',
      before: function() { openItem('map_tut_inn'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); } },
    { target: '#whiteboardWrap', title: 'No grid at all',
      html: '<b>Eldara</b> has no grid: an overview map where pictures, shapes and tokens sit wherever you drop them, at any size \u2014 region maps, city streets, ship decks, theatre-of-mind scenes. <b>Snap</b> still helps: in <b>Items</b> mode a dragged item glues flush to its neighbours instead of to cells. Rulers still work \u2014 set <b>Map Scale</b> in the measure options (1 cell = 100 yd, 2 km\u2026) so distances read right for the map. The tinted district shapes are linked to rooms: hover one for its card, double-click the Inn\'s to travel.',
      before: function() { openItem('map_tut_city'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); } },
    { target: '#imgLibBtn', title: 'The picture library',
      html: 'Under the <b>+ Add</b> button on the play-map toolbar. This campaign\'s pictures \u2014 uploaded from its maps, planners and pages, used by them, or brought in from another campaign with <b>Import from another campaign\u2026</b> (nothing is copied; a picture can belong to several). <b>Shared</b> holds the tutorial art, <b>Unfiled</b> pictures whose map is gone, <b>All campaigns</b> everything. Filter by name or map, group into categories you define per campaign (right-click a picture to tag it; a category can be made <b>shared</b> so every campaign sees it). Click one for a large preview \u2014 the arrows or <kbd>&larr;</kbd> <kbd>&rarr;</kbd> step through \u2014 then <b>Add to map</b>. The tutorial\'s art is here too, under <b>Default</b> \u2014 a category on its <b>own shelf</b>, so it stays out of All. Delete any picture from its preview, or the whole category, when you are done with it.',
      before: function() { openItem('map_tut_inn'); goView('visual'); var am = document.getElementById('addMenu'); if (am) am.classList.add('show'); } },   // the library lives in the Add flyout now — open it so the step points at it
    { section: 'Planners & handbook', target: '#plannerNavList', title: 'Planners',
      html: 'Document pages for session plans, encounter tables, and flowcharts — nest them like maps, and re-order them the same way (drag onto the top or bottom of a row, or right-click <b>↑ Move Up</b> / <b>↓ Move Down</b>). <b>Session 1</b> is marked as the <b>next scene</b>, so it shows up in the play map\'s right-click menu during a game. Planners are yours alone; players never receive them.',
      before: function() { openItem('plan_tut_session1'); } },
    { target: '#plannerTools', title: 'Writing a planner',
      html: 'Add blocks from the toolbar: headings, prose, callouts, titled tables and flowcharts. The <b>&#8617; &#8618;</b> buttons are this planner\'s own <b>undo and redo</b> — a deleted block, row or node comes back where it was; inside a text field <kbd>Ctrl</kbd>+<kbd>Z</kbd> first takes back your typing, then reaches the same history. <b>Render</b> shows the finished page; <b>Export As</b> turns it into an image, PDF or HTML. The <b>&#127912;</b> button sets a font, colors and an optional <b>background image</b> (from your picture library, with a <b>Dim</b> slider so text stays readable) for this page, or a look for the whole campaign (Handbook pages and sheets follow it too).',
      before: function() { openItem('plan_tut_session1'); } },
    { target: '#docNavList', title: 'Handbook',
      html: 'Rules and reference pages <b>your players can read</b> at the table \u2014 house rules, a quick reference, a setting primer. Written in the same editor as a planner and nested and re-ordered the same way, but sent to every player at your table who then reads it in a panel over the map. The <b>&#128065; Players can read</b> switch in the toolbar (or a right-click on the page) keeps a page to yourself; a locked page shows &#128274; in the tree and never leaves your machine. Pages have <b>layout</b>: pictures, callouts and tables take a width and float left or right with the text wrapping around them, a section heading splits what follows into columns, and in the preview you drag a picture to nudge it or its corner to resize it. Right-click a page (planner or handbook) &#8594; <b>&#128203; Open over the map</b> to pop it into a floating, resizable panel you keep open beside the play map while you play &mdash; with a <b>search</b> that finds across <i>every</i> page\'s text (click a result to open it) and highlights matches on the page you\'re reading. The Tutorial has one page, <b>House rules</b>, open now.',
      before: function() { openLeft(); openItem('doc_tut_handbook'); } },
    { target: '#handoutsBtn', title: 'Handouts and the journal',
      html: 'Pictures and text to show your players \u2014 a letter, a face, a place. The Tutorial campaign has two ready: <b>Grukk\'s ledger</b> and <b>The hideout</b>. In a session you show one to everyone or to one player, and it lands in their <b>Journal</b> (the book icon beside this), where they keep notes on it and can share it with the party. A room can carry a handout that arrives when a player reaches it.' },
    { section: 'Sharing & finding', target: '#saveAsBtn', title: 'Export and import',
      html: 'Share or back up at any scope: this map or planner, all maps, all play maps, all planners, this campaign, or everything. Exports that use pictures arrive as a <b>.zip</b> with the pictures bundled; <b>Import</b> takes those zips or plain .json and <b>merges by id</b> or replaces. It also takes a <b>Markdown</b> file (or a zip of one with its pictures) and turns it into a planner or a handbook page through a preview, and any planner or page saves back as Markdown from this menu. Merging is how another author hands you a module without touching the rest of your campaign.' },
    { target: '#searchMapsSidebarBtn', title: 'Finding things',
      html: 'The search buttons beside Planners and Maps filter their lists. <kbd>Ctrl</kbd> + <kbd>K</kbd> is faster: type any map, planner or room name from any campaign and press Enter to go straight there. The <b>Recent</b> chips above the Maps tree remember where you have been, and a pinned map (right-click the play map) stays at the top.' },
    { section: 'Character system', target: '#systemBtn', title: 'The system',
      html: 'Your game&rsquo;s rules, with no code: the <b>System</b> editor holds the campaign&rsquo;s <b>fields</b> &mdash; attributes with defaults and ranges (a ranged number can show as a <b>slider</b> on a two-colour track, for an alignment), formulas computed from them (<code>floor((STR - 10) / 2)</code>), resources with a formula for their max (HP), skills as ranks plus a base, toggles for conditions, text, notes and selects &mdash; and its <b>rolls</b> (<code>d20 + STRmod</code>), or <b>apply</b> buttons that move pools and numbers by an amount (<b>Apply costs</b>: FP &minus; 3; <b>Apply wounds</b>: HP &minus; Injury), and a roll can make changes after it lands (<b>On success</b>: Hits + 1), and malfunction at its <b>Malf</b>. Errors show under the field as you type, with a caret; <b>Start from&hellip;</b> gives you Basic d20 or Basic 3d6 to edit; Export and Import move a system between campaigns. Players get every field you leave visible; GM-only fields never leave your machine. The <b>Layout</b> tab <b>designs the sheet</b> (next); the <b>Characters</b> tab holds the campaign&rsquo;s characters; a token points at one through its Properties, and right-click &#9656; <b>Sheet&hellip;</b> opens the sheet over the play map &mdash; yours for any character, a player&rsquo;s for their own, where they fill in what you left editable.',
      before: function() { if (window.wpSheets) { window.wpSheets.close(true); window.wpSheets.closeSheet(); } } },
    { target: '#sysLayout', title: 'Designing the sheet',
      html: 'The <b>Layout</b> tab is where you build the sheet itself, for whatever system you wrote. Arrange it into <b>sections</b> of one to four columns, then add a <b>field</b>, a <b>roll button</b>, a <b>heading</b>, a <b>divider</b>, the <b>portrait</b> or a <b>Facing dial</b> (the token&rsquo;s facing on the sheet, with threat marks your formulas read as <b>Arc</b>) or a <b>Stance</b> control (the token&rsquo;s posture and elevation, read as <b>Posture</b> and <b>Elevation</b>) to a section &mdash; each set to one column or the full row. For a bigger sheet, add <b>Tabs</b> at the top of Layout and give each section a tab &mdash; the sheet then shows a tab strip; with no tabs the sections stack as one page, so simple sheets stay simple. A section can also be made <b>collapsible</b>, show a <b>count</b> (any field&rsquo;s value) in its header, and be <b>nested</b> under another as a sub-section. Give a section its own <b>colors</b> (accent, panel, border) and mark a numeric field as a <b>stat tile</b> (a boxed value) for an ability-score look &mdash; both optional; the <b>Sheet look</b> box at the top gives the whole sheet its own font, colors and background picture over the campaign default, and its shape &mdash; <b>headline</b> titles, <b>filled</b> tabs, an <b>accent</b> colour (<b>Theme accent</b> puts the gold back), the <b>portrait and name</b> in the header. Tabs and sections can carry an <b>icon</b>, a section&rsquo;s accent can colour its title alone (untick <b>Stripe</b>), a number, formula, skill or resource can show a <b>unit</b>, and a number, formula or skill a green/red <b>&plusmn; colour</b>; a ledger number can be changed right there in the header. On a field&rsquo;s row (Fields tab) any field can carry a <b>Caption</b> with {formula} values ({&plusmn;formula} adds the sign), a number or a formula <b>Value names</b> (a number becomes a dropdown of names, a formula shows the name for its value; formulas still read 0, 1, 2), and a resource an <b>Icon</b>, <b>&#8635; Reset</b> and no <b>Bar</b>; <b>Capital labels</b> in the Sheet look box sets labels in small capitals. The <b>Identity rows</b> and <b>Ledger figures</b> boxes write a header block under the name &mdash; labelled values in columns, then bold figures (Bren&rsquo;s class, changed right there, then his STR modifier and Sight); a <b>Pin button</b> beside a group of figures keeps them on the band while you scroll &mdash; and the <b>Pinned band</b> box keeps a few numbers, resources, toggles or rolls on every tab, staying put while the sheet scrolls (HP, AC, Prone and Initiative on Bren&rsquo;s). A section set <b>Above the tabs</b> stays on every tab too, like a dashboard, and a section can carry a <b>handbook chip</b> (or a <b>Handbook link</b> button) that opens a rules page over the map. Drag rows to reorder them or move them between sections, and the <b>preview</b> shows a real character&rsquo;s values as you build. Leave it and the sheet arranges itself (one section per kind, then the rolls); <b>Start from the automatic layout</b> drops that in as a base to tweak. A field left off the sheet stays defined &mdash; still rollable, still on the hover card. Save keeps the layout with the system, and every player&rsquo;s sheet follows at once. The <b>Sheet | HUD</b> switch at the top lays out the character&rsquo;s HUD window the same way.',
      before: function() { var camp = tutorialCampaign(); if (camp && ensureTutorialSheet(camp)) save(true); if (window.wpSheets) { window.wpSheets.closeSheet(); window.wpSheets.open('layout'); } } },
    { target: '#sysLayoutPreview', title: 'The sheet\u2019s look',
      html: 'The <b>Sheet look</b> box at the top of Layout dresses the whole sheet, and the preview shows it as you go. A <b>palette</b> recolours every part at once &mdash; text, muted labels, panel, cards, input fields, edges, a <b>primary</b> colour for the name, values and the open tab, and colours for danger, good and warning; start from a <b>preset</b> (Graphite or Parchment) and change any swatch. <b>Inter</b> is in the font list. Section titles can be <b>accordion</b> titles that <b>stay at the top</b> while their section scrolls, and tabs can be <b>angular</b>; status effects can show as <b>cards</b> with a pill per change, numbers can be <b>monospaced</b>, the band a row of <b>chips</b>, number boxes can carry their arrows <b>inside</b>, worked-out results can sit in <b>boxes</b>, and carried items can be <b>cards</b>. Every icon box &mdash; tabs, sections, pools, effects, items, rolls &mdash; takes an emoji or a <b>bundled icon</b> from the picker beside it (Icons and Emoji tabs), and a bundled icon is drawn in the sheet&rsquo;s own colours. A roll can be <b>filled</b>, <b>red</b> for damage, <b>grey</b> or an <b>outline</b>; a formula with value names can show as a coloured <b>badge</b>, and a resource can have its own <b>colour</b>. Nothing changes until you pick it.',
      before: function() { var camp = tutorialCampaign(); if (camp && ensureTutorialSheet(camp)) save(true); if (window.wpSheets) { window.wpSheets.closeSheet(); window.wpSheets.open('layout'); } } },
    { target: '#sysItems', title: 'Items & throwing',
      html: 'The <b>Items</b> tab is the campaign&rsquo;s library &mdash; weapons, gear, explosives. Each item has a name, a category, an optional <b>blast area</b> (a radius in feet), a <b>damage</b> roll, a Visible/GM-only flag and what a player&rsquo;s removal does &mdash; <b>Bound</b> (it stays, with your message) or <b>Curse on contact</b> (it leaves their sheet; you keep it on the character, out of their sight), a setting players never see; every pickup gets a moment&rsquo;s <b>Undo</b> &mdash; and if you delete an item, the characters carrying it keep a copy marked <b>not in library</b> (<b>Make custom</b> makes it theirs); the row on top sets the <b>blast automation</b> (full auto rolls and applies the damage), <b>who rolls</b>, and which resource damage subtracts from. A character carries items through an <b>Item list</b> field on the sheet &mdash; a plain list, or, with <b>Rich table</b> ticked on the field, a table of the columns you pick (category, cost, damage, area) with an expandable notes row, category chips and a totals footer; an item with a blast area shows a &#128165; <b>Throw</b> button &mdash; press it, click the map, and the blast lands attributed to the character and is shared with everyone on that map. The toolbar &#128165; stays a personal GM quick-tool. An item can also carry a <b>Key</b> (a short fixed name for formulas that read list rows) and, once a list has a level, a starting <b>Level</b>; once a list has a switch, what a player&rsquo;s switching it off does (<b>Bound</b>: it stays on; <b>Curse on contact</b>: you keep it on, out of their sight), and while it is on the lock covers dropping it too. Once a list has <b>stats</b>, an item it can be on gets a box for each (Acc, Wt, Cost&hellip;); formulas read them (Weapons.Wt totals a list, Weapons.Blaster.Acc reads one row). Bren carries a <b>Firepot</b> (you meet his sheet in a moment).',
      before: function() { var camp = tutorialCampaign(); if (camp && ensureTutorialSheet(camp)) save(true); if (window.wpSheets) { window.wpSheets.closeSheet(); window.wpSheets.open('items'); } } },
    { target: '#sysLists', title: 'Lists',
      html: 'The <b>Lists</b> tab shapes each <b>Item list</b> field: the item <b>categories</b> its picker offers, the <b>same item more than once</b>, <b>no quantity</b> (skills and powers), a <b>level</b> per row (with names from the lowest level up: Broken, Accented, Fluent&hellip;) and a <b>switch</b> per row (Readied, Equipped, Active). On the sheet each row shows its level and its switch, and &#128221; holds the item&rsquo;s notes and the row&rsquo;s own note; in Layout a list can show <b>only the rows switched on</b>. A list can carry up to ten <b>stats</b> (a key, a label, a default, value names; <b>On the row</b> shows one beside the name, and every stat reads in &#128221;) and a <b>price</b> stat: a row records what one cost when it is added (<b>Paid</b>, yours to correct on the row). A stat&rsquo;s key is its identity: renaming or removing it drops its values at Save. A stat can be a <b>choice</b> of named options (Strength = ST): an item picks one, and formulas read that option&rsquo;s value. <b>Columns</b> work a formula out for each row (Row.lvl, Row.&lt;stat&gt;: a skill&rsquo;s cost from its level) and can total under the list; any formula reads a list&rsquo;s totals (Skills.count, Weapons.on.Wt) and one row by its item&rsquo;s key (Skills.Karate.lvl). <b>Rolls</b> put a button on each row, rolled with the row&rsquo;s names (d20 + Row.Hit, 3d6 &lt;= Row.Skill); a list&rsquo;s <b>apply</b> actions move pools from the row (Apply costs: FP &minus; Row.FPCost). <b>Counters</b> keep a number on each row (a weapon&rsquo;s Charges, 12/20), with &minus; and +; a roll can spend one, and <b>need</b> one (Out of charges). <b>Item stats on players&rsquo; sheets</b>, at the top: GM only, or players may change their own copies&rsquo; stats. <b>Custom rows</b> lets players add rows of their own (you can on any shaped list).',
      before: function() { var camp = tutorialCampaign(); if (camp && ensureTutorialSheet(camp)) save(true); if (window.wpSheets) { window.wpSheets.closeSheet(); window.wpSheets.open('lists'); } } },
    { target: '#sysEffects', title: 'Status effects',
      html: 'The <b>Effects</b> tab is a library of <b>status effects</b>, each with the numbers it changes (+2 ST, HP max +5) or a toggle it switches on (Prone). On a sheet a <b>Status effects</b> field carries them: add one in a click from the library, or make one on the spot with <b>New&hellip;</b>. The change reaches every formula built on that field &mdash; Poisoned&rsquo;s &minus;2 STR moves the STR modifier and every roll that uses it &mdash; and the sheet shows where each number came from.',
      before: function() { var camp = tutorialCampaign(); if (camp && ensureTutorialSheet(camp)) save(true); if (window.wpSheets) { window.wpSheets.closeSheet(); window.wpSheets.open('effects'); } } },
    { target: '#sheetPanel', title: 'A character sheet',
      html: 'Bren&rsquo;s sheet, over the play map. Characters live in the editor&rsquo;s <b>Characters</b> tab and any token can point at one (right-click a token &#9656; <b>Sheet&hellip;</b>): numbers and skills with their totals, HP as a bar with &minus; and +, conditions, notes &mdash; the <b>header block</b> under the name says who Bren is (Fighter, his STR modifier, Sight) and the <b>band</b> keeps HP, AC, Prone and Initiative in reach on every tab &mdash; and the roll buttons roll at the table with the sheet&rsquo;s values. Drag its head to move it and its bottom-right corner to resize it; both are remembered. Text, select, number and yes/no rows under the name are changed right there by whoever may edit them, so a field is never on the sheet twice. Bren is <b>Blessed</b>: the &#9650; beside his Sword total is the effect &mdash; hover it for the source. A player opens their own the same way and edits what you left editable; fields marked <b>Hover</b> show on the hover card and in the party strip. Bren&rsquo;s <b>Kit</b> holds a <b>Firepot</b> with a &#128165; <b>Throw</b> &mdash; press it, then click the map. Rows show their stats and what was paid. On a list shaped in Lists, <b>&#9998;</b> opens a copy&rsquo;s own values: an empty box follows the library (its value shows faintly), a value you type is this copy&rsquo;s own (a dot marks it), <b>&#8634;</b> takes one back and <b>Follow the library</b> all of them; a copy can have its own removal and switch-off lock. Saving an item a character carries says how far it reaches. <b>+ Custom&hellip;</b> in a list&rsquo;s picker adds a row of your own &mdash; a name, an icon, a category, notes, stats and a key formulas read it by &mdash; and its &#9998; changes it.',
      before: function() { if (window.wpSheets) window.wpSheets.close(true); var camp = tutorialCampaign(); if (camp && ensureTutorialSheet(camp)) save(true); openItem('map_tut_inn'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); if (window.wpSheets) window.wpSheets.openSheet('c_tut_bren'); } },
    { target: '#hudLayer .hud-panel', opens: true, title: 'The HUD',
      html: 'A <b>HUD</b> is a second, compact window for the same character &mdash; laid out by you on the Layout tab (switch <b>Sheet</b> to <b>HUD</b>) with its own tabs, sections, band and ledger, so a value can sit on the sheet <em>and</em> in the HUD. Open it from <b>HUD</b> in the sheet&rsquo;s title bar. Each character has its own window and several can be open at once; drag its head, resize from its corner, and click one to bring it to the front &mdash; the place and size are remembered. A change made in either shows in both. A player opens their own character&rsquo;s; a system with no HUD shows no button. It also opens from a token&rsquo;s right-click menu, the party strip, Properties, the Characters tab, or a <b>HUD button</b> placed on the sheet (which can open it at one of its tabs). When the system has rolls, its <b>Roll history</b> drawer at the bottom lists this session&rsquo;s rolls made as the character, newest first (a roll with a target in green or red); <b>Clear</b> empties it for you. A section can show its fields as <b>inline rows</b> &mdash; label and value on the left, Roll on the right &mdash; and a number can be a <b>counter</b> with &minus; and + either side. A section can carry <b>Reset all</b> (or your own words, like <i>Long rest</i>) in its header: its pools back to full, its counters back to their start. A roll&rsquo;s label can show a value: <code>Attack ({&plusmn;AtkBonus})</code>. Formulas can read <b>CombatRound</b>, the round of the combat on the character&rsquo;s map. A section, or one placement, can <b>Show if</b> a formula is true (<code>Stun &gt; 0</code>): a stunned banner that comes and goes.',
      before: function() { if (window.wpSheets) window.wpSheets.close(true); var camp = tutorialCampaign(); if (camp && ensureTutorialSheet(camp)) save(true); openItem('map_tut_inn'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); if (window.wpSheets) { window.wpSheets.openSheet('c_tut_bren'); if (window.wpSheets.openHud) window.wpSheets.openHud('c_tut_bren'); } } },
    { section: 'Multiplayer & the table', target: '#netBtn', title: 'Multiplayer',
      html: 'Host a table from here: players join with a room code, follow the map you are on (or, once the campaign has had players, come back to their <b>last location</b> and stay put until they travel or you summon them, with a second choice for where first-timers start), move only their own tokens, and receive a <b>sanitised</b> copy of the campaign — no notes, no planners, no hidden items, only the handbook pages you leave open to them. Pause, whisper, summon (to the table&rsquo;s map, or &mdash; when you have it pinned elsewhere &mdash; to the map you&rsquo;re viewing), run combat and hand out handouts from the same place. Right-click a player&rsquo;s chip on the party strip &#9656; <b>Give a character&hellip;</b> to hand them a character: its token appears on their map, copied or made from the character. A player with several plays one at a time &mdash; <b>In play</b> in the Characters tab switches it; the others stay theirs, and you move those tokens. The <b>&#9208;&#65039;</b> button in the top bar pauses the whole table in one click; to freeze just one player, right-click their token and pick <b>Pause this player</b>. Your own <b>name</b> (required to host or join), plus a <b>color</b> and <b>picture</b>, live in <b>Settings &rsaquo; Profile</b> and follow you to every table. At a table, a player&rsquo;s top bar names the campaign and the map they are on (that map alone, not the maps it sits inside) and keeps up as they travel or are summoned. The table is the campaign you host: switching campaigns while hosting asks first and ends the session. Your campaign\'s <b>VTT features</b> are the most your players see; a player who joins a table that differs from their own defaults gets one notice listing what is on there but off for them, and what is off and hidden. Dice roll from Table Chat: <b>/roll 2d6 + 3</b>, or the &#127922; roller beside the message box (next).',
      before: function() { if (window.wpSheets) window.wpSheets.closeSheet(); } },
    { target: '#diceBtn', title: 'Dice',
      html: 'Roll from <b>Table Chat</b>: type <b>/roll 2d6 + 3</b>, or open this roller &mdash; quick dice buttons, <kbd>Enter</kbd> to roll, <kbd>&uarr;</kbd> for your last rolls. At a table the GM&rsquo;s machine makes every roll and everyone sees the same card: every die, what was kept or dropped, the total or the check&rsquo;s margin. <b>Private</b> keeps a roll to yourself (a player&rsquo;s goes to the GM), and every table roll lands in the session log. Pick a <b>character</b> in the roller and names like <b>STR</b> come from its sheet (the sheet&rsquo;s roll buttons do this for you). <b>Shift-click a sheet roll button</b> for a quick situational bonus or penalty before the roll &mdash; and, for a single-die roll, Advantage or Disadvantage. The full syntax is in Help &#9656; Dice. Dice is a VTT feature, per campaign.',
      before: function() { var cp = document.getElementById('chatPanel'); if (cp && cp.style.display === 'none') { var cb = document.getElementById('chatBtn'); if (cb) cb.click(); } } },
    { target: '#settingsBtn', title: 'Settings',
      html: 'Your name and table picture, light or dark theme, measurement units, rulers and grid opacity (also reachable from the grid button&rsquo;s &#9681; shortcut), undo history size, the <b>VTT features</b> (next), journal options and updates. Table settings travel with your saves folder.',
      before: function() { closeSettingsForTour(); var cp = document.getElementById('chatPanel'); if (cp) cp.style.display = 'none'; if (window.wpDice) window.wpDice.closePanel(); } },
    { target: '#setVttCampBlock', title: 'VTT features, per campaign',
      html: '<b>Token elevation</b>, <b>Token posture</b>, <b>Token facing</b> (the turn arrow and the fog facing cone), the <b>Minimap</b>, <b>Sound</b>, <b>Dice</b>, <b>Character sheets</b>, <b>Visual effects</b> and <b>Fog of war</b> are switched here for the campaign on screen and saved with it, under one <b>VTT integration</b> master (off = the plain whiteboard; the choices are kept). Below them, the <b>default for new campaigns</b>: changing it touches no existing campaign, and <b>Apply to existing campaigns…</b> copies it onto the ones you tick. In a session your campaign\'s settings are the most your players see; at someone else\'s table this same section shows the GM\'s settings and lets you switch a feature off for yourself.',
      before: function() { openSettingsForTour(); } },
    { target: '#helpBtn', title: 'Help is always here',
      html: 'Every topic in more depth, keyboard shortcuts, and this tour again whenever you want it. The <b>search box</b> at the top of Help finds any topic by keyword and jumps straight to it. <b>Ctrl + K</b> jumps to any map, planner or room by name.',
      before: function() { closeSettingsForTour(); } },
    { target: null, title: 'That\'s the tour', finish: true,
      html: 'The <b>Tutorial</b> campaign stays in your save so you can keep building on it — rename it, add maps, run a session. Or discard it now; your other campaigns are untouched either way. Its pictures stay in the Image Library under <b>Shared &rarr; Default</b> until you delete them there.' }
];

// The tour is one flow grouped into labelled sections (a step carries `section` to open one). Used for the card's
// progress line and the "jump to a section" menu, so a returning player can skip straight to a feature area.
function sectionSpans() { var out = []; STEPS.forEach(function(s, i) { if (s.section) out.push({ label: s.section, start: i }); }); return out; }
function sectionAt(i) { var sp = sectionSpans(), idx = 0; for (var k = 0; k < sp.length; k++) if (sp[k].start <= i) idx = k; return { spans: sp, idx: idx }; }

var tour = { i: -1, overlay: null, spot: null, card: null, active: false };

function ensureDom() {
    if (tour.overlay) return;
    var ov = document.createElement('div'); ov.id = 'tourOverlay';
    ov.innerHTML = '<div id="tourSpot"></div><div id="tourCard"></div>';
    document.body.appendChild(ov);
    tour.overlay = ov; tour.spot = ov.querySelector('#tourSpot'); tour.card = ov.querySelector('#tourCard');
    window.addEventListener('resize', function() { if (tour.active) place(); });
    document.addEventListener('keydown', function(e) {
        if (!tour.active) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTour(); }
        else if (e.key === 'ArrowRight' || e.key === 'Enter') { if (!e.target.closest || !e.target.closest('input, textarea, select, [contenteditable="true"]')) { e.preventDefault(); next(1); } }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); next(-1); }
    }, true);
}

function targetEl(step) { return step.target ? document.querySelector(step.target) : null; }

function place() {
    var step = STEPS[tour.i]; if (!step) return;
    var el = targetEl(step), card = tour.card, spot = tour.spot;
    var W = window.innerWidth, H = window.innerHeight, pad = 6;
    if (el) {
        var r = el.getBoundingClientRect();
        spot.style.display = 'block'; spot.className = '';
        spot.style.left = (r.left - pad) + 'px'; spot.style.top = (r.top - pad) + 'px';
        spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';
        // the card sits beside the target on whichever side has room
        var cw = Math.min(380, W - 24), ch = card.offsetHeight || 200, x, y;
        if (r.right + 16 + cw <= W) { x = r.right + 16; y = r.top; }
        else if (r.left - 16 - cw >= 0) { x = r.left - 16 - cw; y = r.top; }
        else if (r.bottom + 16 + ch <= H) { x = r.left; y = r.bottom + 16; }
        else { x = r.left; y = r.top - 16 - ch; }
        x = Math.max(12, Math.min(x, W - cw - 12)); y = Math.max(12, Math.min(y, H - ch - 12));
        card.style.width = cw + 'px'; card.style.left = x + 'px'; card.style.top = y + 'px';
    } else {
        // no target: a zero-size spot in the middle still dims the whole screen
        spot.style.display = 'block'; spot.className = 'nospot';
        spot.style.left = Math.round(W / 2) + 'px'; spot.style.top = Math.round(H / 2) + 'px'; spot.style.width = '0px'; spot.style.height = '0px';
        var cw2 = Math.min(460, W - 24);
        card.style.width = cw2 + 'px';
        card.style.left = Math.round((W - cw2) / 2) + 'px';
        card.style.top = Math.round(Math.max(12, (H - (card.offsetHeight || 240)) / 2)) + 'px';
    }
}

function show(i, dir) {
    dir = dir || 1;
    // skip steps whose target has gone missing (the app moved on; tutorialcheck.js should have caught it)
    while (i >= 0 && i < STEPS.length && STEPS[i].target && !STEPS[i].opens && !document.querySelector(STEPS[i].target)) {   // opens: the step's setup makes its target (a HUD window)
        console.warn('[tutorial] step target missing, skipped:', STEPS[i].target);
        i += dir;
    }
    if (i < 0) i = 0;
    if (i >= STEPS.length) { endTour(); return; }
    tour.i = i;
    var step = STEPS[i];
    document.querySelectorAll('#wbFloatingToolbar .shape-menu.show').forEach(function(m) { m.classList.remove('show'); });   // each step re-opens a toolbar flyout only if it needs it
    if (!step.opens && window.wpSheets && window.wpSheets.closeHuds) window.wpSheets.closeHuds();   // no HUD left floating on another step (Back, a section jump)
    try { if (step.before) step.before(); } catch (e) { console.warn('[tutorial] step setup failed', e); }
    var sec = sectionAt(i), sp = sec.spans, secLabel = sp[sec.idx] ? sp[sec.idx].label : '';
    // Progress reads by PART, never as "step 1 of 32": the position inside the current part on the right, and a slim
    // bar under the header with one segment per part (weighted by its length) — parts done are filled, the current
    // one fills as you go. The part jump on the left already carries the 1/7.
    var secStart = sp[sec.idx] ? sp[sec.idx].start : 0, secEnd = sp[sec.idx + 1] ? sp[sec.idx + 1].start : STEPS.length, inSec = i - secStart + 1, secLen = Math.max(1, secEnd - secStart);
    var html = '<div class="tour-step"><button class="tour-secbtn" id="tourSecBtn" title="Jump to a section">' + esc(secLabel) + ' · ' + (sec.idx + 1) + '/' + sp.length + ' ▾</button><span class="tour-stepn">' + inSec + ' of ' + secLen + ' in this part</span></div>';
    html += '<div class="tour-bar" aria-hidden="true">' + sp.map(function(s, k) {
        var len = Math.max(1, (sp[k + 1] ? sp[k + 1].start : STEPS.length) - s.start), pct = k < sec.idx ? 100 : k > sec.idx ? 0 : Math.round(100 * inSec / secLen);
        return '<span class="tour-seg' + (k < sec.idx ? ' done' : k === sec.idx ? ' on' : '') + '" style="flex:' + len + '" title="' + esc(s.label) + '"><i style="width:' + pct + '%"></i></span>';
    }).join('') + '</div>';
    html += '<div class="tour-secmenu" id="tourSecMenu" style="display:none;">' + sp.map(function(s, k) { return '<button class="tour-secitem' + (k === sec.idx ? ' on' : '') + '" data-secstart="' + s.start + '">' + esc(s.label) + '</button>'; }).join('') + '</div>';
    html += '<h3>' + esc(step.title) + '</h3><div class="tour-body">' + step.html + '</div><div class="tour-btns">';
    if (step.finish) {
        html += '<button class="tool ghost" id="tourDiscardEnd">Discard the Tutorial campaign</button><button class="tool" id="tourKeepEnd">Keep it &amp; finish</button>';
    } else {
        html += '<button class="tool ghost" id="tourSkip">Skip tour</button><span style="flex:1"></span>' + (i > 0 ? '<button class="tool ghost" id="tourBack">&larr; Back</button>' : '') + '<button class="tool" id="tourNext">Next &rarr;</button>';
    }
    html += '</div>';
    tour.card.innerHTML = html;
    var q = function(id) { return tour.card.querySelector('#' + id); };
    if (q('tourNext')) q('tourNext').addEventListener('click', function() { next(1); });
    if (q('tourBack')) q('tourBack').addEventListener('click', function() { next(-1); });
    if (q('tourSkip')) q('tourSkip').addEventListener('click', endTour);
    if (q('tourKeepEnd')) q('tourKeepEnd').addEventListener('click', function() { endTour(); toast('The Tutorial campaign is yours to build on. Help → Tutorial can discard or rebuild it.'); });
    if (q('tourDiscardEnd')) q('tourDiscardEnd').addEventListener('click', function() { endTour(); discardTutorialCampaign(); });
    if (q('tourSecBtn')) q('tourSecBtn').addEventListener('click', function(e) { e.stopPropagation(); var m = q('tourSecMenu'); if (m) { m.style.display = m.style.display === 'none' ? 'flex' : 'none'; place(); } });
    if (q('tourSecMenu')) q('tourSecMenu').querySelectorAll('.tour-secitem').forEach(function(b) { b.addEventListener('click', function() { var s = parseInt(b.dataset.secstart, 10); if (s >= 0 && s < STEPS.length) show(s, 1); }); });
    var el = targetEl(step);
    if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
    // two passes: the card's height is only known once its content is in the DOM
    place(); setTimeout(place, 30); setTimeout(place, 250);
}
function next(dir) { show(tour.i + dir, dir); }

function startTour(at) {
    var start = (typeof at === 'number' && at > 0 && at < STEPS.length) ? at : 0;   // Help can start at a section
    if (!canPersistLocal()) { toast('The tutorial runs on your own campaigns — leave the session first.'); return; }
    guardSwitch(hosting() && state.appState.activeCampaignId !== TUTORIAL_CAMP_ID, function() {   // the tour opens the Tutorial campaign
        ensureDom();
        ensureTutorialCampaign(false);   // starting at a section needs the demo campaign present (Welcome usually does this first)
        try { localStorage.setItem('wp_tourSeen', '1'); } catch (e) {}
        var hm = document.getElementById('helpModal'); if (hm) hm.style.display = 'none';
        tour.active = true;
        tour.overlay.style.display = 'block';
        document.body.classList.add('tour-on');
        show(start, 1);
    });
}
function endTour() {
    if (!tour.active) return;
    tour.active = false; tour.i = -1;
    if (tour.overlay) tour.overlay.style.display = 'none';
    document.body.classList.remove('tour-on');
    closeSettingsForTour();   // the VTT step may have left Settings open
    var cp = document.getElementById('chatPanel'); if (cp) cp.style.display = 'none'; if (window.wpDice) window.wpDice.closePanel();   // and the Dice step the chat panel
    if (window.wpSheets) { window.wpSheets.closeSheet(); if (window.wpSheets.closeHuds) window.wpSheets.closeHuds(); window.wpSheets.close(true); }   // and the sheet step Bren's sheet (and the HUD step his HUD) + the layout step's System editor
    if (window.wpFog) window.wpFog.setPreview('off');   // and the fog step its player-view preview
    document.querySelectorAll('#wbFloatingToolbar .shape-menu.show').forEach(function(m) { m.classList.remove('show'); });   // and any toolbar flyout a step opened (Add, Scene)
}

/* ---------- Help → Tutorial pane wiring ---------- */
function syncPane() {
    var has = !!tutorialCampaign();
    var st = document.getElementById('tourState');
    if (st) st.innerHTML = has
        ? 'The <b>Tutorial</b> campaign is in your save' + (state.appState.activeCampaignId === TUTORIAL_CAMP_ID ? ' and open now' : '') + '. Keep building on it, run the tour again, rebuild it fresh, or discard it.'
        : 'Starting the tour adds a small <b>Tutorial</b> campaign to your save (a valley, a cave, a session plan). Your own campaigns are not touched.';
    var d = document.getElementById('tourDiscardBtn'); if (d) d.style.display = has ? '' : 'none';
    var r = document.getElementById('tourRebuildBtn'); if (r) r.style.display = has ? '' : 'none';
    var o = document.getElementById('tourOpenBtn'); if (o) o.style.display = has ? '' : 'none';
    var v = document.getElementById('tourVersion'); if (v) v.textContent = 'Tour version ' + TUTORIAL_VERSION + ' · ' + STEPS.length + ' steps · ' + sectionSpans().length + ' sections';
    var secWrap = document.getElementById('tourSections');
    if (secWrap) {
        secWrap.textContent = '';
        sectionSpans().forEach(function(sp, k) {
            var b = document.createElement('button'); b.className = 'tool ghost'; b.style.fontSize = '11px'; b.textContent = (k + 1) + '. ' + sp.label;
            b.addEventListener('click', function() { startTour(sp.start); });
            secWrap.appendChild(b);
        });
    }
}
(function wire() {
    var s = document.getElementById('tourStartBtn'); if (s) s.addEventListener('click', function() { startTour(); });
    var o = document.getElementById('tourOpenBtn'); if (o) o.addEventListener('click', function() {
        guardSwitch(hosting() && state.appState.activeCampaignId !== TUTORIAL_CAMP_ID, function() { ensureTutorialCampaign(false); var hm = document.getElementById('helpModal'); if (hm) hm.style.display = 'none'; toast('Tutorial campaign opened.'); });
    });
    var r = document.getElementById('tourRebuildBtn'); if (r) r.addEventListener('click', function() {
        showConfirm('Rebuild the Tutorial campaign from scratch? Anything you added to it is lost (a safety copy is taken first).', function(yes) {
            if (!yes) return;
            guardSwitch(hosting(), function() {   // a rebuild replaces the campaign and opens it: a switch while hosting either way
                takeSafetyCopy().then(function() { ensureTutorialCampaign(true); syncPane(); toast('Tutorial campaign rebuilt.'); });   // the safety copy first, like the discard
            });
        });
    });
    var d = document.getElementById('tourDiscardBtn'); if (d) d.addEventListener('click', function() { discardTutorialCampaign(function() { syncPane(); }); });
    var nav = document.getElementById('helpNav'); if (nav) nav.addEventListener('click', function(e) { var b = e.target.closest('[data-help]'); if (b && b.dataset.help === 'tutorial') syncPane(); });
    var hb = document.getElementById('helpBtn'); if (hb) hb.addEventListener('click', function() { setTimeout(syncPane, 0); });
    syncPane();
})();

/* ---------- first launch ----------
   The tour starts by itself exactly once, and only for a new user: a save with nothing in it
   yet (no rooms, no play-map items, no planners, one campaign at most). wp_tourSeen is a
   table preference, so it lives in saves/preferences.json and follows the saves folder — an
   existing campaign updated to this version never sees the pop-up. Everyone else finds the
   tour under Help → Tutorial. */
function saveIsFresh() {
    var camps = Object.values(state.appState.campaigns || {});
    if (camps.length > 1) return false;
    return camps.every(function(c) {
        return Object.values(c.items || {}).every(function(it) {
            if (it.type === 'planner') return false;
            return !((it.rooms || []).length || (it.whiteboard || []).length);
        });
    });
}
// A Tutorial campaign that exists but never had its art installed (made before 1.4.6's picture
// library changes) gets it on launch — once. Deleting the category afterwards is respected.
(function artOnLoad() {
    var tries = 0;
    var t = setInterval(function() {
        if (window.__wpCleanupBusy) return;   // the cleanup is deciding what the save holds: keep waiting
        tries++;
        var loaded = Object.keys(state.appState.campaigns || {}).length > 0;
        if (!loaded && tries < 40) return;
        clearInterval(t);
        if (window.wpImgCatRename && window.wpImgCatRename('Tutorial art', TUTORIAL_ART_CAT, 'shared')) save(true);   // the category's earlier name
        var tc = loaded && tutorialCampaign();
        if (!tc || tc.tutorialArt === 'installed') return;
        installTutorialArt(function() { tc.tutorialArt = 'installed'; save(true); render(); });
    }, 300);
})();
(function autoStart() {
    if (/[?&]stream=1/.test(location.search)) return;
    var seen = false; try { seen = localStorage.getItem('wp_tourSeen') === '1'; } catch (e) {}
    if (seen) return;
    var tries = 0;
    var t = setInterval(function() {
        if (window.__wpCleanupBusy) return;   // the cleanup is deciding what the save holds: keep waiting
        tries++;
        var loaded = Object.keys(state.appState.campaigns || {}).length > 0;
        if (!loaded && tries < 40) return;          // wait for load() (up to ~12 s), then give up quietly
        clearInterval(t);
        if (!loaded) return;
        if (window.wpNet && window.wpNet.active) return;
        if (!saveIsFresh()) { try { localStorage.setItem('wp_tourSeen', '1'); } catch (e) {} return; }   // an existing table: never pop up, Help → Tutorial has it
        try { localStorage.setItem('wp_tourSeen', '1'); } catch (e) {}
        setTimeout(startTour, 600);
    }, 300);
})();

window.wpTutorial = { start: startTour, fresh: saveIsFresh, end: endTour, steps: STEPS, version: TUTORIAL_VERSION, ensure: ensureTutorialCampaign, discard: discardTutorialCampaign, build: buildTutorialCampaign, system: tutorialSystem, ensureSheet: ensureTutorialSheet };
