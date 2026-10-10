/* Interactive tutorial: builds a "Tutorial" campaign the user can keep and build on (or
   discard), then walks through the app step by step with a spotlight and a card.

   KEEP THIS IN STEP WITH THE APP. Every step names the element it points at (`target`,
   a CSS selector — an id from index.html wherever possible). `node tools/tutorialcheck.js`
   verifies each static target still exists and the release script refuses to build when
   one is missing; at run time a step whose target is absent is skipped with a console
   warning, so a renamed button never strands the user.

   THE TOUR IS SHORT. A step says what a thing is and the few things you do with it, in short
   plain sentences: no brackets, no dashes, no semicolons, nothing run on (tutorialcheck holds
   every step to it). The detail lives in Help, and a step names the Help entry that holds it
   (`help: [pane, name]`), which the card offers as More in Help. A new feature goes into Help;
   it gets a sentence here only where a newcomer needs it. When something a step names moves,
   edit STEPS (and the demo content in buildTutorialCampaign) in the same change.
   TUTORIAL_VERSION is shown on the Help pane so a stale tour is easy to spot. */

import { state } from './state.js';
import { createNewCampaign, createNewMap, createNewPlanner, createNewDoc, getActiveCampaign } from './models.js';
import { save, toast, canPersistLocal, resetHistory, takeSafetyCopy, withoutHistory } from './io.js';
import { updateCampaignSelect, updateSidebarNav, navigateToMap } from './sidebar.js';
import { showConfirm } from './dialogs.js';

var TUTORIAL_VERSION = '1.5.4';          // bump when STEPS or the demo campaign change
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
        combat: { blastAuto: 'full', blastRoller: 'owner', hpResource: 'f_tut_hp', light: { names: { dim: 'Dim light', dark: 'Darkness' }, presets: [{ name: 'Torch', bright: 3, dim: 7, pick: true }, { name: 'Brazier', bright: 2, dim: 4 }] }, senses: tutorialSenses() },   // lighting (L6): what the rules call a dim and a dark place, and two lights in yards — the torch one a player may pick; senses (S8): Hearing
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
        if (!camp.system.combat || typeof camp.system.combat !== 'object') { camp.system.combat = tutorialSystem().combat; changed = true; }   // the whole block a new Tutorial has, its light rules included (as ensureTutorialLights gives one)
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
        { id: 'tut_library', name: 'Library', cat: 'civic', x: 15300, y: 15100, notes: 'Maps of the hills, if anyone asks nicely. Maelis has no portrait: her token shows her initials until you give her one.', characters: [{ id: 'tut_c_maelis', name: 'Archivist Maelis', info: 'Keeps the hill surveys. Will trade a map for the return of an overdue book.' }] },
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

// The pre-fogged demo map (fog of war, 1.5.0): a square-grid cellar, dark, where Bren sees as far as his Sight field and a
// monster in the dark is dropped from players' copies. Standalone (like tutorialHandbookPage) so an older Tutorial
// gains it on its next ensure. Sight resolves through camp.fog.fields.sight -> the character's Sight field.
// Lighting (L6): Bren carries the system's Torch, and a Brazier burns in the far corner, past his sight and his torch's light:
// he sees its pool of light from across the room because it is lit, and the Lurker, nearer but in the dark, stays unseen.
function tutorialBrazier() { return { id: 'tut_wb_brazier', type: 'light', x: 15455, y: 14755, w: 40, h: 40, color: 'transparent', layer: 'middle', name: 'Brazier', light: { bright: 2, dim: 4, name: 'Brazier' } }; }   // the north-east corner's cell: 10 yd from Bren, 5 from the Lurker
// Senses (S8, the owner's answer "Hearing + smoke demo"): every character hears 10 yd, through walls, all round, as a nameless mark — so in the
// Dark Cellar Bren's player hears the unseen Lurker, 8 yd off; and a patch of smoke near the brazier hides part of its glow from Bren (the
// brazier itself and the top of its pool stay in view from where he starts)
function tutorialSenses() { return { list: [{ id: 'sn_tuthear1', name: 'Hearing', range: { by: 'n', n: 10 }, grade: 'mark', walls: 'pass', arc: 'all', glyph: 'sound' }] }; }
function tutorialSmoke() { return { id: 'tut_wb_smoke', type: 'rect', x: 15250, y: 14900, w: 50, h: 100, color: '#8e939c', opacity: 0.5, layer: 'back-mid', name: 'Smoke', smoke: true }; }
function tutorialTorch() { return { bright: 3, dim: 7, name: 'Torch' }; }   // the system's Torch, by value (as a light's Properties copy a preset): its outer edge ends a yard short of the Lurker
// The cellar's texts that speak of light, each beside the text it replaces on an older Tutorial (only where that one still reads as it was seeded)
function tutorialCellarTexts() {
    return {
        room: { name: 'Torchlight', notes: 'As far as Bren’s torch and his own sight reach. In a session each player sees only what their own tokens see: this disc, and whatever a light shows them further off (the brazier in the corner).',
            wasName: 'Lantern light', wasNotes: 'As far as Bren’s lantern reaches. In a session each player sees only this disc around their own tokens.' },
        bren: { now: 'Your character. He carries a torch (Carries a light, in his Properties) and sees 6 yd in the dark (his Sight field) — drag him and both follow.',
            was: 'Your character. His Sight field (6 yd) lights the fog — drag him and the lit disc follows.' },
        lurker: { now: 'A monster in the dark, 8 yd off — outside Bren’s sight and past his torch’s light, so players never receive it. Move a token or a light close, or use the reveal brush, to bring it into view.',
            was: 'A monster in the dark, 8 yd off — outside Bren’s sight, so players never receive it. Move a token close, or use the reveal brush, to bring it into view.' }
    };
}
function buildTutorialFogMap() {
    var CT = tutorialCellarTexts();
    var A = TUTORIAL_ART_URL;
    function sqTok(x, y, props) { return Object.assign({ x: Math.round(x / 50) * 50, y: Math.round(y / 50) * 50, w: 50, h: 50, layer: 'middle' }, props); }
    function pic(file, extra) { return Object.assign({ type: 'image', src: A + file, color: 'transparent', isChar: true }, extra); }
    var fm = createNewMap('Fog Demo — The Dark Cellar');
    fm.id = 'map_tut_fog';
    fm.meta.parentId = 'map_tut_realm';
    fm.meta.homeX = 15000; fm.meta.homeY = 15000; fm.meta.lastView = 'visual'; fm.meta.gridType = 'square';
    fm.meta.cellUnit = 'yd'; fm.meta.cellValue = 1;   // 1 cell = 1 yard = 50 px, so a sight in yards reads straight off as cells
    fm.fog = { on: true, mode: 'auto', light: 'dark', manual: { adds: [], cuts: [] } };   // lighting (1.5.0): a dark cellar, so Bren's sight in the dark is what shows; fog ON; vision + manual; all-around vision (the square-grid default, resolved at read time)
    fm.cats = { room: { label: 'Room', color: '#e0a54f' }, danger: { label: 'Danger', color: '#d9534f' } };
    fm.rooms = [
        { id: 'tut_fog_lit', name: CT.room.name, cat: 'room', x: 15000, y: 15000, notes: CT.room.notes, characters: [] },
        { id: 'tut_fog_dark', name: 'The dark', cat: 'danger', x: 15400, y: 15000, notes: 'Beyond the light. A creature here is dropped from every player’s copy until a token’s vision (or your reveal brush) reaches it.', characters: [] }
    ];
    fm.links = [['tut_fog_lit', 'tut_fog_dark', 'oneway', { label: 'Into the dark' }]];
    fm.whiteboard = [
        { id: 'tut_wb_fogfloor', type: 'rect', x: 14700, y: 14750, w: 800, h: 500, color: '#201d28', layer: 'back', nodeId: 'tut_fog_lit', name: 'Cellar floor' },
        { id: 'tut_wb_fogpillar1', type: 'circle', x: 14900, y: 14850, w: 40, h: 40, color: '#3a3a4a', layer: 'back-mid', name: 'Pillar', blocksSight: true, sightType: 'wall' },
        { id: 'tut_wb_fogpillar2', type: 'circle', x: 15300, y: 15150, w: 40, h: 40, color: '#3a3a4a', layer: 'back-mid', name: 'Pillar', blocksSight: true, sightType: 'wall' },
        sqTok(15000, 15000, pic('bren_sq.jpg', { id: 'tut_wb_bren7', charName: 'Bren of Hollowvale', name: 'Bren', charStats: CT.bren.now, charId: 'c_tut_bren', light: tutorialTorch() })),
        sqTok(15400, 15000, pic('slime_sq.jpg', { id: 'tut_wb_lurker', charName: 'Cellar Lurker', name: 'Cellar Lurker', charStats: CT.lurker.now })),
        tutorialBrazier(),
        tutorialSmoke()
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
function tutorialVtt() { return window.wpVtt ? window.wpVtt.allOn() : { v: 1, master: true, features: { elevation: true, posture: true, minimap: true, sound: true, dice: true, sheets: true, fx: true, fog: true, turning: true, lighting: true } }; }
// A session is exactly one campaign: opening, rebuilding or discarding the Tutorial while hosting is a campaign switch,
// so it asks first and ends the session on yes (net.js guardCampaignSwitch). Off a session it simply runs.
function guardSwitch(switching, fn) { if (switching && window.wpConfirmCampaignSwitch) window.wpConfirmCampaignSwitch(fn); else fn(); }
function hosting() { var n = window.wpNet; return !!(n && n.active && n.role === 'host'); }

// Lighting (L6), once per Tutorial (camp.tutorialLight 2): the cellar's brazier, Bren's torch, the system's light rules and the texts that
// speak of them, each only where an older Tutorial holds nothing of its own — a light someone placed, a rule they wrote, a text they changed stays.
// The brazier only where the cellar is still Dark: on a map set back to Auto a light source placed on it would turn the map dark (fog.js
// mapLevel), and the map's light is the GM's choice
function ensureTutorialLights(camp) {
    if (!camp || typeof camp !== 'object') return;
    var sys = camp.system, fm = camp.items && camp.items.map_tut_fog, T = tutorialCellarTexts();
    if (sys && typeof sys === 'object') {
        if (!sys.combat || typeof sys.combat !== 'object') sys.combat = tutorialSystem().combat;
        else if (sys.combat.light == null) sys.combat.light = tutorialSystem().combat.light;   // none, or one a file left empty (null)
    }
    if (!fm || typeof fm !== 'object') return;
    if (Array.isArray(fm.whiteboard)) {
        fm.whiteboard.forEach(function(w) {
            if (!w || typeof w !== 'object') return;
            if (w.id === 'tut_wb_bren7' && w.isChar && w.light == null) w.light = tutorialTorch();
            if (w.id === 'tut_wb_bren7' && w.charStats === T.bren.was) w.charStats = T.bren.now;
            if (w.id === 'tut_wb_lurker' && w.charStats === T.lurker.was) w.charStats = T.lurker.now;
        });
        var dark = !!fm.fog && typeof fm.fog === 'object' && fm.fog.light === 'dark';
        if (dark && !fm.whiteboard.some(function(w) { return w && (w.id === 'tut_wb_brazier' || w.type === 'light'); })) fm.whiteboard.push(tutorialBrazier());
    }
    if (Array.isArray(fm.rooms)) fm.rooms.forEach(function(r) { if (r && r.id === 'tut_fog_lit' && r.name === T.room.wasName && r.notes === T.room.wasNotes) { r.name = T.room.name; r.notes = T.room.notes; } });
}
// Senses (S8), once per Tutorial (camp.tutorialSenses 1): the system's Hearing and the cellar's smoke, each only where an older Tutorial holds
// nothing of its own — senses someone wrote (or a file left empty: an empty block stays), a piece they made smoke, stay
function ensureTutorialSenses(camp) {
    if (!camp || typeof camp !== 'object') return;
    var sys = camp.system, fm = camp.items && camp.items.map_tut_fog;
    if (sys && typeof sys === 'object') {
        if (!sys.combat || typeof sys.combat !== 'object') sys.combat = tutorialSystem().combat;
        else if (sys.combat.senses == null) sys.combat.senses = tutorialSenses();   // none, or one a file left empty (null)
    }
    if (!fm || typeof fm !== 'object' || !Array.isArray(fm.whiteboard)) return;
    if (!fm.whiteboard.some(function(w) { return w && typeof w === 'object' && (w.id === 'tut_wb_smoke' || w.smoke === true); })) fm.whiteboard.push(tutorialSmoke());
}
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
    else if (camp.items.map_tut_fog.whiteboard) camp.items.map_tut_fog.whiteboard.forEach(function(w) { if (w && typeof w.id === 'string' && w.id.indexOf('tut_wb_fogpillar') === 0 && !w.blocksSight) { w.blocksSight = true; w.sightType = 'wall'; } });   // 1.5.0 sight-blocking: the demo pillars block
    // lighting, its once-only stages: never a step of the GM's undo (one Undo on the cellar would take the lights away while the mark stays)
    var litNow = !(camp.tutorialLight >= 2), senseNow = !(camp.tutorialSenses >= 1);
    if (litNow || senseNow) withoutHistory(camp.items.map_tut_fog, function() {
        if (litNow && !camp.tutorialLight) { var tfog = camp.items.map_tut_fog.fog; if (tfog && typeof tfog === 'object' && tfog.light === undefined) tfog.light = 'dark'; camp.tutorialLight = 1; }   // lighting (1.5.0), once: the demo cellar is dark, so Bren's sight in the dark is what shows (a GM's own later choice stays)
        if (litNow) { ensureTutorialLights(camp); camp.tutorialLight = 2; }   // lighting (L6), once: the cellar's brazier, Bren's torch and the system's light rules, where an older Tutorial has none of its own
        if (senseNow) { ensureTutorialSenses(camp); camp.tutorialSenses = 1; }   // senses (S8), once: the system's Hearing and the cellar's smoke, where an older Tutorial has none of its own
    });
    if (window.wpVtt && !window.wpVtt.locked()) camp.vtt = tutorialVtt();   // an older or flat-default copy: the tour never teaches chips that do not draw
    state.appState.activeCampaignId = TUTORIAL_CAMP_ID;
    state.selId = null; state.selWbId = null; state.selWbIds = []; state.linkStart = null;
    updateCampaignSelect(); updateSidebarNav(); render(); save(true);
    // a hosted Tutorial: that save sends the open item alone, so the cellar just changed goes to the table here, to each player through their own fog
    if ((litNow || senseNow) && hosting() && camp.activeItemId !== 'map_tut_fog' && window.wpNet.broadcastItemFiltered) window.wpNet.broadcastItemFiltered(camp.id, 'map_tut_fog');
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
// The Properties step spotlights the right panel: unfold it when it is folded away, and fold it again when the tour moves on or ends.
var _rightWasFolded = false;
function openRightForTour() { var sb = document.getElementById('sidebar'), t = document.getElementById('toggleRightBtn'); if (sb && t && sb.classList.contains('collapsed')) { t.click(); _rightWasFolded = true; } }
function closeRightForTour() { if (!_rightWasFolded) return; _rightWasFolded = false; var sb = document.getElementById('sidebar'), t = document.getElementById('toggleRightBtn'); if (sb && t && !sb.classList.contains('collapsed')) t.click(); }
function openLeft() { var sb = document.getElementById('campaignSidebar'); if (sb && sb.classList.contains('collapsed')) { var t = document.getElementById('toggleLeftBtn'); if (t) t.click(); } }

var STEPS = [
    { section: 'Getting started', target: null, title: 'Welcome to Waypoint',
      html: 'This tour uses a small campaign called <b>Tutorial</b> that was just added to your save. It is a real campaign: keep it and build on it, or discard it at the end. Use <b>Next</b> and <b>Back</b>. <b>Try it yourself</b> puts the card away so you can use what it describes, and <b>Resume tour</b> brings the step back. <b>Esc</b> asks before it ends the tour, and your place is kept. <b>More in Help</b> under a card opens the part of Help that says the rest.',
      help: ['tutorial', 'Interactive tutorial'],
      before: function() { ensureTutorialCampaign(false); openLeft(); openItem('map_tut_realm'); goView('data'); } },
    { target: '#campMenuBtn', title: 'Campaigns',
      html: 'Everything belongs to a campaign. Press its name here for the list of your campaigns. The same menu searches, adds, renames and deletes them. Your own campaigns are untouched by the tutorial. The <b>Waypoint</b> logo at the top left opens the <b>Welcome</b> screen. There you start, import or continue a campaign, or <b>Join a game</b>.',
      help: ['start', 'The welcome screen'] },
    { target: '#mapNavList', title: 'Maps nest like places',
      html: '<b>Eldara Realm</b> holds the city <b>Eldara</b>, which holds <b>The Inn</b>. World, region, building, room: as deep as you like. Drag a map onto another to nest it. Drop it near the top or bottom of another row to re-order it instead. Right-click a map for more, such as a new parent or child map.',
      help: ['start', 'Your first map'] },
    { target: '#viewModeSelect', title: 'Two faces of every map',
      html: 'Every map has two faces. The <b>Data Map</b> is the node view for your notes and connections. The <b>Play Map</b> is the battle map with tokens. This switch flips between them, and each map remembers which face you left it on.',
      help: ['start', 'What Waypoint is'],
      before: function() { openItem('map_tut_city'); goView('data'); } },
    { section: 'The data map', target: '#dataFloatingToolbar', title: 'Data map tools',
      html: '<b>Add Room</b> drops a node. <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h6v6H3zM15 14h6v6h-6zM9 10l6 4"/></svg> <b>Link Mode</b> connects two rooms: pick a line type, then click one room and the other. Click a line to open it in <b>Properties</b>. Its label is drawn on the line for players too, and its notes stay with you. Eldara&rsquo;s lines are already labelled, one of each type.',
      help: ['datamap', 'Connections'],
      before: function() { openItem('map_tut_city'); goView('data'); } },
    { target: '#canvasWrap', title: 'Rooms and portals',
      html: 'Drag rooms around, and click one to edit it on the right. <b>The Inn</b> carries a door icon because it is a <b>portal</b>. Double-click it to travel into the inn&rsquo;s map, and use the breadcrumb at the top to climb back out. In a session players travel by dropping their token on a portal. You can lock one portal, one map or all travel for players.',
      help: ['datamap', 'Linked maps: doors, stairs and warps'],
      before: function() { openItem('map_tut_city'); goView('data'); } },
    { target: '#sidebar', title: 'The Properties panel',
      html: 'Whatever you select is edited here. For a room that is its name, color, scene image, notes and the characters found there. Room notes and character info are <b>never sent to players</b>. The panel opens with a selection and closes when it clears. The arrow on its edge toggles it by hand.',
      help: ['datamap', 'Rooms'],
      before: function() { openItem('map_tut_city'); goView('data'); state.selId = 'tut_palace'; render(); if (window.wpSyncRightPanel) window.wpSyncRightPanel(); openRightForTour(); } },
    { section: 'Play map & VTT features', target: '#wbFloatingToolbar', title: 'Play map tools',
      html: 'Now inside the hideout, on its Play Map. From the left: undo and redo for this map, then move and pan, the pen, eraser and fill. Next come shapes and <b>+ Add</b> for text and pictures, then <b>measure</b>, <b>radius</b>, fog and <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11h18v9H3zM3 11l-.5-3.5 17.5-3 .6 3.4L3 11zM7.5 6.6l1.8 3.3M12.5 5.8l1.8 3.3"/></svg> <b>Scene</b>. Centre, the <b>grid</b> and <b>snap</b> stand at the map&rsquo;s right edge. Hold <kbd>Space</kbd> and drag to pan from any tool.',
      help: ['whiteboard', 'Placing things'],
      before: function() { openItem('map_tut_ground'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); } },
    { target: '#soundBtn', title: 'Sound',
      html: 'Under the <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11h18v9H3zM3 11l-.5-3.5 17.5-3 .6 3.4L3 11zM7.5 6.6l1.8 3.3M12.5 5.8l1.8 3.3"/></svg> <b>Scene</b> button. Ambient loops and one-shot cues, heard by every player at the table. Click a loop to <b>crossfade</b> to it, or a cue to fire it. <b>Master</b> sets the table&rsquo;s volume, and <b>Mute mine</b> silences your own speakers. <b>Library&hellip;</b> holds this campaign&rsquo;s sounds and a bundled set, and takes your own files.',
      help: ['whiteboard', 'Sound'],
      before: function() { openItem('map_tut_ground'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); if (window.wpSound) window.wpSound.closePanel(); var m = document.getElementById('sceneFxMenu'); if (m) m.classList.add('show'); } },   // Sound lives in the Scene flyout now — open it so the step points at it
    { target: '#musicBtn', title: 'Music',
      html: 'Under <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11h18v9H3zM3 11l-.5-3.5 17.5-3 .6 3.4L3 11zM7.5 6.6l1.8 3.3M12.5 5.8l1.8 3.3"/></svg> <b>Scene</b> too, apart from Sound. <b>Add music&hellip;</b> uploads songs, and you build <b>playlists</b> from them. <b>Remember on this map</b> gives the open map a playlist or a song, and it starts for each player who opens that map. The panel plays, pauses, skips, seeks, loops and shuffles. Music has its own volume and mute, so a cue can play over it.',
      help: ['whiteboard', 'Music'],
      before: function() { openItem('map_tut_ground'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); if (window.wpMusic) window.wpMusic.closePanel(); var m = document.getElementById('sceneFxMenu'); if (m) m.classList.add('show'); } },
    { target: '#fxBtn', title: 'Visual effects',
      html: 'Under <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11h18v9H3zM3 11l-.5-3.5 17.5-3 .6 3.4L3 11zM7.5 6.6l1.8 3.3M12.5 5.8l1.8 3.3"/></svg> <b>Scene</b> too. The <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3l1.9 5.1L17 10l-5.1 1.9L10 17l-1.9-5.1L3 10l5.1-1.9L10 3zM18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14z"/></svg> panel fires flashes, screen shake, color washes, bursts, weather and banners. The players on that map see them, and so does the stream window. Pick a burst, then click the map. A lit button is on: press it again to put it away.',
      help: ['whiteboard', 'Visual effects'],
      before: function() { openItem('map_tut_ground'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); if (window.wpSound) window.wpSound.closePanel(); if (window.wpFx) window.wpFx.closePanel(); var m = document.getElementById('sceneFxMenu'); if (m) m.classList.add('show'); } },   // Visual effects lives in the Scene flyout now
    { target: '#videoBtn', title: 'Video',
      html: 'Under <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11h18v9H3zM3 11l-.5-3.5 17.5-3 .6 3.4L3 11zM7.5 6.6l1.8 3.3M12.5 5.8l1.8 3.3"/></svg> <b>Scene</b> too: the campaign&rsquo;s <b>videos</b>, such as a cutscene or a reveal. <b>Add videos&hellip;</b> copies MP4 or WebM files into your saves folder. <b>&#9654;</b> plays one here. While you host, <b>Show to players</b> sends it live to everyone or to the players you tick. You play, pause and seek for all of them.',
      help: ['whiteboard', 'Video'],
      before: function() { openItem('map_tut_ground'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); if (window.wpVideo) window.wpVideo.close(); var m = document.getElementById('sceneFxMenu'); if (m) m.classList.add('show'); } },
    { target: '#whiteboardWrap', title: 'Ping',
      html: 'Point your players at a spot. Hold <kbd>Alt</kbd> and click the play map, and a ring marks that cell for a moment for everyone on the map. It is drawn over the fog and is never saved. The <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M10 3l1.9 5.1L17 10l-5.1 1.9L10 17l-1.9-5.1L3 10l5.1-1.9L10 3zM18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14z"/></svg> panel&rsquo;s <b>Ping</b> row does the same, or pings one player.',
      help: ['whiteboard', 'Visual effects'],
      before: function() { openItem('map_tut_ground'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); if (window.wpFx) window.wpFx.closePanel(); var m = document.getElementById('sceneFxMenu'); if (m) m.classList.remove('show'); } },
    { target: '#fogModeBtn', title: 'Fog of war',
      html: 'Each player sees only what their own tokens see. The <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 14a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.6 1.2A3.5 3.5 0 0 1 17.5 14H7zM5 17.5h14M8 21h8"/></svg> button opens the fog menu, and <b>Fog on this map</b> is the switch. On your screen the fog is a see-through veil. A player&rsquo;s fog is opaque, and a creature they cannot see is not on their map at all. This cellar is dark. Bren carries a <b>Torch</b>, and the <b>Cellar Lurker</b> stands in the dark, out of his sight. To make a wall, tick <b>Blocks sight</b> in the Properties of a shape or a pen line.',
      help: ['whiteboard', 'Fog of war'],
      before: function() { openItem('map_tut_fog'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); if (window.wpSound) window.wpSound.closePanel(); if (window.wpFx) window.wpFx.closePanel(); if (window.wpFog) window.wpFog.setPreview('party'); } },
    { target: '#whiteboardWrap', title: 'Tokens',
      html: 'Any shape or picture with <b>Is Character</b> set is a token. Hover one for its name and stats. <b>Right-click</b> one for its conditions, posture, elevation and light. The chips at its foot show its height and posture. <b>Horn</b>, behind the guard-room door, is hidden from players until you tick <b>Visible to players</b>. The gold hexes on the stairs are <b>portals</b>: double-click one to change floors.',
      help: ['whiteboard', 'The right-click menu'],
      before: function() { openItem('map_tut_ground'); goView('visual'); } },
    { target: '#whiteboardWrap', title: 'Square grids, square tokens',
      html: '<b>The Inn</b> runs on a <b>square grid</b>, and its tokens are square pictures that fill one cell each. Drag one with <b>Snap</b> on and it seats in a cell. <b>&#8862; Fit to grid</b> sizes a selection to whole cells. Tokens the app places take the grid&rsquo;s shape: a hexagon, a square, or a circle with no grid. Right-click a picture token for <b>Frame picture&hellip;</b> to choose the part that shows.',
      help: ['grids', 'Grids'],
      before: function() { openItem('map_tut_inn'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); } },
    { target: '#whiteboardWrap', title: 'No grid at all',
      html: '<b>Eldara</b> has no grid. Pictures, shapes and tokens sit wherever you drop them, at any size. That suits region maps, city streets and theatre-of-mind scenes. Rulers still work: set <b>Map Scale</b> in the measure options so distances read right. The tinted district shapes are linked to rooms: hover one for its card.',
      help: ['grids', 'Measuring'],
      before: function() { openItem('map_tut_city'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); } },
    { target: '#imgLibBtn', title: 'The picture library',
      html: 'Under the <b>+ Add</b> button. It holds this campaign&rsquo;s pictures: the ones uploaded from its maps, planners and pages, and any you bring in from another campaign. Filter by name or map, and group pictures into categories. Click one for a large preview, then <b>Add to map</b>. The tutorial&rsquo;s art is under <b>Shared</b>, in the <b>Default</b> category.',
      help: ['whiteboard', 'Image Library'],
      before: function() { openItem('map_tut_inn'); goView('visual'); var am = document.getElementById('addMenu'); if (am) am.classList.add('show'); } },   // the library lives in the Add flyout now — open it so the step points at it
    { section: 'Planners & handbook', target: '#plannerNavList', title: 'Planners',
      html: 'Pages for session plans, encounter tables and flowcharts. They nest and re-order like maps. <b>Session 1</b> is marked as the <b>next scene</b>, so it shows up in the play map&rsquo;s right-click menu during a game. Planners are yours alone: players never receive them.',
      help: ['planners', 'Building pages'],
      before: function() { openItem('plan_tut_session1'); } },
    { target: '#plannerTools', title: 'Writing a planner',
      html: 'Add blocks from the toolbar: headings, prose, callouts, tables and flowcharts. Click into a title, a table cell or a flowchart label and <b>a bar appears on the box</b> to style it. The <b>&#8617; &#8618;</b> buttons are this planner&rsquo;s own undo and redo. <b>Render</b> shows the finished page, and <b>Export As</b> turns it into an image, a PDF or HTML. The <b>&#127912;</b> button sets its font, colors and background.',
      help: ['planners', 'Text style'],
      before: function() { openItem('plan_tut_session1'); } },
    { target: '#docNavList', title: 'Handbook',
      html: 'Rules and reference pages <b>your players can read</b> at the table, written in the same editor as a planner. Every player at your table gets them and reads them in a panel over the map. The <b>&#128065; Players can read</b> switch keeps a page to yourself. Right-click a page for <b>&#128203; Open over the map</b>, a floating panel with a search across every page. The Tutorial has one page, <b>House rules</b>, open now.',
      help: ['handbook', 'What a page is'],
      before: function() { openLeft(); openItem('doc_tut_handbook'); } },
    { target: '#handoutsBtn', title: 'Handouts and the journal',
      html: 'Pictures and text to show your players: a letter, a face, a place. The Tutorial has two ready, <b>Grukk&rsquo;s ledger</b> and <b>The hideout</b>. In a session you show one to everyone or to one player. It lands in their <b>Journal</b>, the book icon beside this, where they keep notes on it. A room can carry a handout that arrives when a player reaches it.',
      help: ['mp-gm', 'Handouts'] },
    { section: 'Sharing & finding', target: '#saveAsBtn', title: 'Export and import',
      html: 'Share or back up at any scope: one map or planner, a whole campaign, or everything. An export that uses pictures arrives as a <b>.zip</b> with the pictures inside. <b>Import</b> takes those files and <b>merges by id</b> or replaces. Merging is how another author hands you a module without touching the rest of your campaign. A <b>Markdown</b> file becomes a planner or a handbook page. Both are under <b>More</b> in the top row.',
      help: ['start', 'Export As'],
      before: function() { if (window.wpTopRow) window.wpTopRow.open('moreMenu'); } },   // Export As is a row of More: the menu is opened, so the row can be seen
    { target: '#mapNavList', title: 'Finding things',
      html: '<kbd>Ctrl</kbd> + <kbd>K</kbd> jumps anywhere: type a map, planner or room name from any campaign and press Enter. Right-click <b>Planners</b> or <b>Maps</b> for a search that filters its list. The <b>Recent</b> chips above the Maps tree remember where you have been.',
      help: ['start', 'Getting around fast'] },
    { section: 'Character system', target: '#systemBtn', title: 'The system',
      html: 'Your game&rsquo;s rules, with no code. The <b>System</b> editor holds the campaign&rsquo;s <b>fields</b>: attributes, formulas worked out from them, pools such as HP, skills, toggles and text. It also holds its <b>rolls</b>, such as <code>d20 + STRmod</code>. <b>Start from&hellip;</b> gives you Basic d20 or Basic 3d6 to edit. Players get every field you leave visible, and GM-only fields never leave your machine.',
      help: ['sheets', 'The system'],
      before: function() { if (window.wpSheets) { window.wpSheets.close(true); window.wpSheets.closeSheet(); } if (window.wpTopRow) window.wpTopRow.open('campMenu'); } },   // System is a row of the campaign's menu: the menu is opened, so the row can be seen
    { target: '#sysLayout', title: 'Designing the sheet',
      html: 'The <b>Layout</b> tab is where you build the sheet. Arrange it into <b>sections</b> of one to four columns, then add fields, roll buttons, headings and the portrait. <b>Tabs</b> at the top split a bigger sheet into pages. Drag rows to reorder them, and the <b>preview</b> shows a real character as you build. Leave Layout alone and the sheet arranges itself. The <b>Sheet | HUD</b> switch lays out the character&rsquo;s HUD window the same way.',
      help: ['sheets', 'Layout'],
      before: function() { var camp = tutorialCampaign(); if (camp && ensureTutorialSheet(camp)) save(true); if (window.wpSheets) { window.wpSheets.closeSheet(); window.wpSheets.open('layout'); } } },
    { target: '#sysLayoutPreview', title: 'The sheet\u2019s look',
      html: 'The <b>Sheet look</b> box at the top of Layout dresses the whole sheet, and the preview shows it as you go. A <b>palette</b> recolours every part at once: start from a <b>preset</b> and change any swatch. The box also sets the font, the shape of titles and tabs, and how effects, numbers and items are drawn. Nothing changes until you pick it.',
      help: ['sheets', 'Sheet look and palette'],
      before: function() { var camp = tutorialCampaign(); if (camp && ensureTutorialSheet(camp)) save(true); if (window.wpSheets) { window.wpSheets.closeSheet(); window.wpSheets.open('layout'); } } },
    { target: '#sysItems', title: 'Items & throwing',
      html: 'The <b>Items</b> tab is the campaign&rsquo;s library of weapons, gear and explosives. An item has a name, a category, a <b>damage</b> roll and an optional <b>blast area</b>. A character carries items through an <b>Item list</b> field on the sheet. An item with a blast area shows a &#128165; <b>Throw</b> button: press it, then click the map. The card at the top holds your game&rsquo;s combat rules, such as range, cover, light and turns.',
      help: ['sheets', 'Items and blasts from the sheet'],
      before: function() { var camp = tutorialCampaign(); if (camp && ensureTutorialSheet(camp)) save(true); if (window.wpSheets) { window.wpSheets.closeSheet(); window.wpSheets.open('items'); } } },
    { target: '#sysCombatBox', title: 'Senses',
      html: 'On the same Combat card, <b>Senses</b> are your game&rsquo;s senses besides the eyes, for fogged maps: darkvision, blindsight, hearing. Each has a range, from a field of the character or a number everyone has. You pick whether walls stop it and whether it sees all round. A sense can also be <b>a nameless mark</b>: a glyph where a creature is, never the creature itself. Each row ends in a sentence saying what it does.',
      help: ['sheets', 'Senses'],
      before: function() { var camp = tutorialCampaign(); if (camp && ensureTutorialSheet(camp)) save(true); if (window.wpSheets) { window.wpSheets.closeSheet(); window.wpSheets.open('items'); } var sb = document.querySelector('#sysCombatBox .sys-senses'); if (sb && sb.scrollIntoView) sb.scrollIntoView({ block: 'center' }); } },
    { target: '#sysLists', title: 'Lists',
      html: 'The <b>Lists</b> tab shapes each <b>Item list</b> field. It sets the item categories its picker offers, and whether a row has a quantity, a <b>level</b> or a <b>switch</b> such as Equipped. A list can carry <b>stats</b> for its items, <b>columns</b> worked out for each row, <b>rolls</b> on each row and <b>counters</b> such as a weapon&rsquo;s charges. That is how one sheet holds skills, powers, weapons and gear.',
      help: ['sheets', 'Lists'],
      before: function() { var camp = tutorialCampaign(); if (camp && ensureTutorialSheet(camp)) save(true); if (window.wpSheets) { window.wpSheets.closeSheet(); window.wpSheets.open('lists'); } } },
    { target: '#sysEffects', title: 'Status effects',
      html: 'The <b>Effects</b> tab is a library of <b>status effects</b>. Each has the numbers it changes, or a toggle it switches on. A <b>Status effects</b> field on the sheet carries them: add one from the library in a click. The change reaches every formula built on that field, and the sheet shows where each number came from. An effect that is on shows as a small icon on the token. Right-click a token &#9656; <b>Effects&hellip;</b> adds or ends one from the map.',
      help: ['sheets', 'Status effects'],
      before: function() { var camp = tutorialCampaign(); if (camp && ensureTutorialSheet(camp)) save(true); if (window.wpSheets) { window.wpSheets.closeSheet(); window.wpSheets.open('effects'); } } },
    { target: '#sheetPanel', title: 'A character sheet',
      html: 'Bren&rsquo;s sheet, over the play map. To open one, select the token and press <b>&#128203;</b> on its toolbar, or right-click it &#9656; <b>Sheet&hellip;</b>. The roll buttons roll at the table with the sheet&rsquo;s values. A sheet opens <b>locked</b>: rolls, pools and switches work, and <b>Edit sheet</b> in its head lets you change its stats. Bren&rsquo;s <b>Kit</b> holds a <b>Firepot</b> with a &#128165; <b>Throw</b>. A player opens their own the same way and edits what you left editable.',
      help: ['sheets', 'The sheet panel'],
      before: function() { if (window.wpSheets) window.wpSheets.close(true); var camp = tutorialCampaign(); if (camp && ensureTutorialSheet(camp)) save(true); openItem('map_tut_inn'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); if (window.wpSheets) window.wpSheets.openSheet('c_tut_bren'); } },
    { target: '#hudLayer .hud-panel', opens: true, title: 'The HUD',
      html: 'A <b>HUD</b> is a second, compact window for the same character, laid out by you on the Layout tab. Open it from <b>HUD</b> in the sheet&rsquo;s title bar, or from a token&rsquo;s right-click menu. Several can be open at once, and each remembers its place and size. A change made in either shows in both. The HUD is for play: it never changes a character&rsquo;s stats.',
      help: ['sheets', 'The HUD'],
      before: function() { if (window.wpSheets) window.wpSheets.close(true); var camp = tutorialCampaign(); if (camp && ensureTutorialSheet(camp)) save(true); openItem('map_tut_inn'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); if (window.wpSheets) { window.wpSheets.openSheet('c_tut_bren'); if (window.wpSheets.openHud) window.wpSheets.openHud('c_tut_bren'); } } },
    { section: 'Multiplayer & the table', target: '#netBtn', title: 'Multiplayer',
      html: 'Host a table from here. Players join with a <b>room code</b> and come back to where they were last. They move only their own tokens, and their copy of the campaign leaves out your notes, planners and hidden items. From the same panel you pause, whisper, summon players to a map and run combat. A player who joins with no character gets a <b>waiting token</b> until you give them one. Your name, color and picture are in <b>Settings &#9656; Profile</b>.',
      help: ['mp-gm', 'Host a session'],
      before: function() { if (window.wpSheets) window.wpSheets.closeSheet(); } },
    { target: '#diceBtn', title: 'Dice',
      html: 'Roll from <b>Table Chat</b>: type <b>/roll 2d6 + 3</b>, or open this roller. At a table the GM&rsquo;s machine makes every roll, and everyone sees the same card. <b>Private</b> keeps a roll between you and the GM. Pick a <b>character</b> in the roller and names like <b>STR</b> come from its sheet. <b>Shift-click</b> a sheet&rsquo;s roll button for a bonus or a penalty before the roll.',
      help: ['dice', 'Rolling at the table'],
      before: function() { if (window.wpChat && window.wpChat.openPanel) window.wpChat.openPanel(); } },   // the chat's own opener: closed or put away with another view, it comes up here (1.5.4)
    { target: '#settingsBtn', title: 'Settings',
      html: 'Your name and table picture, the light or dark theme, measurement units, and the <b>VTT features</b>, which come next. <b>Check for Updates</b> looks for a newer Waypoint, and <b>Restore the previous version</b> puts the app back as it was. <b>Developer mode</b> is off unless you switch it on. Table settings travel with your saves folder.',
      help: ['start', 'Updates'],
      before: function() { closeSettingsForTour(); var cp = document.getElementById('chatPanel'); if (cp) cp.style.display = 'none'; if (window.wpDice) window.wpDice.closePanel(); } },
    { target: '#setVttCampBlock', title: 'VTT features, per campaign',
      html: 'The table features of the campaign on screen are switched here. They are token elevation, token posture, token facing, the minimap, sound, music and dice. Then come character sheets, visual effects, fog of war, lighting, turn-based combat, the calendar and video. Every one is on for a new campaign until you switch it off. Below them is the <b>default for new campaigns</b>. In a session your campaign&rsquo;s settings are the most your players see.',
      help: ['grids', 'VTT settings'],
      before: function() { openSettingsForTour(); } },
    { target: '#helpBtn', title: 'Help is always here',
      html: 'Every topic in more depth, the keyboard shortcuts, and this tour again whenever you want it. The <b>search box</b> at the top of Help finds any topic by keyword and jumps straight to it.',
      before: function() { closeSettingsForTour(); } },
    { target: null, title: 'That\'s the tour', finish: true,
      html: 'The <b>Tutorial</b> campaign stays in your save so you can keep building on it. Or discard it now. Your other campaigns are untouched either way. Its pictures stay in the Image Library under <b>Shared</b>, in the <b>Default</b> category, until you delete them there.' }
];

// The tour is one flow grouped into labelled sections (a step carries `section` to open one). Used for the card's
// progress line and the "jump to a section" menu, so a returning player can skip straight to a feature area.
function sectionSpans() { var out = []; STEPS.forEach(function(s, i) { if (s.section) out.push({ label: s.section, start: i }); }); return out; }
function sectionAt(i) { var sp = sectionSpans(), idx = 0; for (var k = 0; k < sp.length; k++) if (sp[k].start <= i) idx = k; return { spans: sp, idx: idx }; }

var tour = { i: -1, overlay: null, spot: null, card: null, shield: null, chip: null, active: false, paused: false, asking: false, pos: null };

// [tutorialcheck:place-start]
// Where a tour ended part-way is kept on this computer, so it can be picked up there (Help's Resume): a step past the first and before the
// last. Anything else stored reads as "from the start".
function tourAt() {
    try { var o = JSON.parse(localStorage.getItem('wp_tourAt') || 'null'); return (o && typeof o.i === 'number' && Math.floor(o.i) === o.i && o.i > 0 && o.i < STEPS.length - 1) ? o.i : 0; } catch (e) { return 0; }
}
function rememberAt(i) {
    try { if (typeof i === 'number' && i > 0 && i < STEPS.length - 1) localStorage.setItem('wp_tourAt', JSON.stringify({ v: TUTORIAL_VERSION, i: i })); else localStorage.removeItem('wp_tourAt'); } catch (e) {}
}
// [tutorialcheck:place-end]

// [tutorialcheck:blocks-start]
// A step's text, laid out to be read: a short one as it stands, a longer one as a lead and one point for each sentence after it. The text
// itself is never changed: it is cut only between sentences, and never inside a tag.
function tourLen(html) { return String(html).replace(/<[^>]*>/g, '').replace(/&[#\w]{1,8};/g, 'x').length; }
function tourPieces(html) {
    var out = [], cur = '', tag = 0, i = 0, n = html.length;
    var opens = function(k) { var c = html.charAt(k); return (c >= 'A' && c <= 'Z') || c === '&' || (c === '<' && html.charAt(k + 1) !== '/'); };   // a sentence begins: a capital, a symbol's entity, a tag that opens
    while (i < n) {
        var c = html.charAt(i);
        if (c === '<') {
            var j = html.indexOf('>', i); if (j < 0) j = n - 1;
            var t = html.slice(i, j + 1);
            if (t.charAt(1) === '/') tag = Math.max(0, tag - 1); else if (!/^<br\b/i.test(t) && t.slice(-2) !== '/>') tag++;
            cur += t; i = j + 1; continue;
        }
        if (c === '&') { var s = html.indexOf(';', i); if (s > i && s - i <= 9) { cur += html.slice(i, s + 1); i = s + 1; continue; } }
        cur += c; i++;
        if (tag || html.charAt(i) !== ' ') continue;
        if ((c === '.' || c === '?' || c === '!') && opens(i + 1)) { out.push(cur); cur = ''; i++; }
    }
    if (cur.trim()) out.push(cur);
    return out;
}
function tourBlocks(html) {
    var whole = String(html == null ? '' : html), sents = tourPieces(whole);
    if (tourLen(whole) <= 380 || sents.length < 3) return '<p>' + whole + '</p>';
    return '<p class="tour-lead">' + sents[0].trim() + '</p><ul class="tour-pts">' + sents.slice(1).map(function(p) { return '<li>' + p.trim() + '</li>'; }).join('') + '</ul>';
}
// [tutorialcheck:blocks-end]

// [tutorialcheck:helpat-start]
// A step may name the entry of Help that holds the rest of it: help: [pane, name]. An entry's name is a heading's own words, or the first
// bold words of a list entry, a paragraph or a tip, read without a leading symbol and a closing colon or full stop. A heading of that name
// is taken before an entry of it. The suite holds every step's pointer against Help as it is written.
function helpName(text) { return String(text == null ? '' : text).replace(/\s+/g, ' ').replace(/^[^A-Za-z0-9]+/, '').replace(/[\s:.]+$/, ''); }
function helpFind(pane, name) {
    var box = document.querySelector('#helpModal .help-pane[data-pane="' + pane + '"]'), want = helpName(name), hit = null;
    if (!box || !want) return null;
    box.querySelectorAll('h4, li, p, .help-tip').forEach(function(el) {
        var head = el.tagName === 'H4', lead = head ? el : el.querySelector('b');
        if (!lead || helpName(lead.textContent) !== want) return;
        if (head ? (!hit || hit.tagName !== 'H4') : !hit) hit = el;
    });
    return hit;
}
// More in Help: the card goes away as it does for Try it yourself, whatever the step had open is put away (the System editor and Settings
// sit over Help), and Help opens at the entry the step names. Resume tour sets the step up again.
function tourHelp() {
    var step = STEPS[tour.i], at = step && step.help;
    if (!at || !tour.active || tour.paused) return;
    pauseTour();
    try { clearStage({}); } catch (e) { console.warn('[tutorial] stage reset failed', e); }
    if (typeof window.wpOpenHelp === 'function') window.wpOpenHelp(at[0]);
    var el = helpFind(at[0], at[1]); if (!el) return;
    setTimeout(function() {
        try { el.scrollIntoView({ block: 'start', behavior: 'auto' }); } catch (e) {}
        el.classList.remove('help-hit'); void el.offsetWidth; el.classList.add('help-hit');
        setTimeout(function() { el.classList.remove('help-hit'); }, 1800);
    }, 60);
}
// [tutorialcheck:helpat-end]

function ensureDom() {
    if (tour.overlay) return;
    var ov = document.createElement('div'); ov.id = 'tourOverlay';
    ov.innerHTML = '<div id="tourShield"></div><div id="tourSpot"></div><div id="tourCard" role="dialog" aria-label="Tutorial"></div>';
    document.body.appendChild(ov);
    tour.overlay = ov; tour.shield = ov.querySelector('#tourShield'); tour.spot = ov.querySelector('#tourSpot'); tour.card = ov.querySelector('#tourCard');
    // the chip a paused tour leaves on screen: Resume puts the step back as it was
    var chip = document.createElement('div'); chip.id = 'tourChip'; chip.style.display = 'none';
    chip.innerHTML = '<span class="tour-chip-txt"></span><button class="tool" id="tourResume">&#9654; Resume tour</button><button class="tool ghost" id="tourChipEnd" title="End the tour. Help &#9656; Tutorial resumes it at this step.">End</button>';
    document.body.appendChild(chip); tour.chip = chip;
    chip.querySelector('#tourResume').addEventListener('click', resumeTour);
    chip.querySelector('#tourChipEnd').addEventListener('click', endTour);
    // The shield: while a card is up the pointer reaches the card and nothing else, so a stray click cannot put away what the step set up
    // (a toolbar flyout closes on any click anywhere) nor wander off its map. Seen first, at the window: no handler of the page's runs for a
    // press on the shield. A press on the card stays in the tour too (the page's own click handlers never hear it). Try it yourself lifts it.
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu'].forEach(function(t) {
        window.addEventListener(t, function(e) { if (tour.active && !tour.paused && e.target === tour.shield) { e.stopPropagation(); e.preventDefault(); } }, true);
        [ov, chip].forEach(function(n) { n.addEventListener(t, function(e) { e.stopPropagation(); }); });   // the chip too: Resume's own click must not reach the page (it would close the flyout the step just opened)
    });
    window.addEventListener('click', function() { if (tour.active) setTimeout(heal, 0); }, true);   // judged when it runs: a click that resumes the tour heals too
    window.addEventListener('keyup', function() { if (tour.active) setTimeout(heal, 0); }, true);
    // the card is dragged by its heading (never by a button in it); it goes back beside its target at the next step
    tour.card.addEventListener('pointerdown', function(e) {
        if (e.button || !e.target.closest || !e.target.closest('.tour-grip') || e.target.closest('button')) return;
        var r = tour.card.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
        var move = function(ev) { tour.pos = { x: ev.clientX - dx, y: ev.clientY - dy }; place(); };
        var up = function() { window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', up, true); };
        window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', up, true);
        e.preventDefault();
    });
    window.addEventListener('resize', function() { if (tour.active && !tour.paused) place(); });
    document.addEventListener('keydown', tourKey, true);
}

// [tutorialcheck:keys-start]
// The tour's keys, seen before any handler of the page's: Esc asks whether to end the tour (its place is kept either way), and Esc again
// keeps going; Right arrow and Enter go on, Left arrow goes back — never from a field, where those keys are the field's: the caret moves,
// Enter is a new line in a flowchart label. A field is an input, a textarea, a list, or anything being edited in place — told by the
// element itself (isContentEditable), since a planner's boxes are editable as plain text only and no one word of the attribute names them
// all. While the question is up the arrows and Enter move nothing (Enter is its focused button's), and while the tour is paused (Try it
// yourself) every key is the app's.
function tourField(t) { return !!t && (t.isContentEditable === true || !!(t.closest && t.closest('input, textarea, select'))); }
// The owed review, 2026-10-09: while a question or a prompt of the app's own is up (a join request while the tour runs at a hosted table)
// every key is its, Escape included; and Enter on a focused button of the card's own (Back, Skip, Try it yourself) is that button's press
function appAsking() { if (typeof document === 'undefined' || !document.getElementById) return false; var q = document.getElementById('customConfirm'), p = document.getElementById('customPrompt'); return !!((q && q.style && q.style.display === 'flex') || (p && p.style && p.style.display === 'flex')); }
// The card is drawn again at every step, which took the focus off the button it was on: after Enter on Back the next Enter was the page's and
// went forward (the review of 2026-10-09). cardFocusOf says which of the card's own buttons has the focus, by its id, before the card is drawn
// again, and cardRefocus puts the focus back on it, or on Next where that button is no longer there. A pointer's press keeps no focus to put back
function cardFocusOf(card, active) {
    if (!card || !active || typeof card.contains !== 'function' || !card.contains(active)) return '';
    var id = typeof active.id === 'string' ? active.id : '';
    if (!id && active.classList && active.classList.contains('tour-secitem')) id = 'tourSecBtn';
    return /^tour[A-Za-z]{1,24}$/.test(id) ? id : '';
}
function cardRefocus(card, keep) {
    if (!card || !keep || !/^tour[A-Za-z]{1,24}$/.test(keep)) return false;
    var f = card.querySelector('#' + keep) || card.querySelector('#tourNext');
    if (!f) return false;
    try { f.focus(); } catch (e) {}
    return true;
}
function tourButton(t) { return !!(t && t.closest && t.closest('button, a[href]') && t.closest('#tourCard')); }   // a button of the page under the card still moves the tour, so that Enter presses nothing there
function tourKey(e) {
    if (!tour.active || tour.paused) return;
    if (appAsking()) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); askEnd(); return; }
    if (e.key !== 'ArrowRight' && e.key !== 'Enter' && e.key !== 'ArrowLeft') return;
    if (tourField(e.target)) return;
    if (tour.asking) return;
    if (e.key === 'Enter' && tourButton(e.target)) return;
    e.preventDefault();
    next(e.key === 'ArrowLeft' ? -1 : 1);
}
// [tutorialcheck:keys-end]

function targetEl(step) { return step.target ? document.querySelector(step.target) : null; }
function shownRect(el) { var r = el ? el.getBoundingClientRect() : null; return (r && (r.width || r.height)) ? r : null; }   // null: not on screen now

function place() {
    var step = STEPS[tour.i]; if (!step) return;
    var card = tour.card, spot = tour.spot, r = shownRect(targetEl(step));
    var W = window.innerWidth, H = window.innerHeight, pad = 6, cw = Math.min(r ? 380 : 460, W - 24), x, y;
    card.style.width = cw + 'px';   // before its height is read: the text wraps to this width
    var ch = card.offsetHeight || 200;
    if (r) {
        spot.style.display = 'block'; spot.className = '';
        spot.style.left = (r.left - pad) + 'px'; spot.style.top = (r.top - pad) + 'px';
        spot.style.width = (r.width + pad * 2) + 'px'; spot.style.height = (r.height + pad * 2) + 'px';
        // the card sits beside the target on whichever side has room
        if (r.right + 16 + cw <= W) { x = r.right + 16; y = r.top; }
        else if (r.left - 16 - cw >= 0) { x = r.left - 16 - cw; y = r.top; }
        else if (r.bottom + 16 + ch <= H) { x = r.left; y = r.bottom + 16; }
        else { x = r.left; y = r.top - 16 - ch; }
    } else {
        // no target (or one that is not on screen): a zero-size spot in the middle still dims the whole screen
        spot.style.display = 'block'; spot.className = 'nospot';
        spot.style.left = Math.round(W / 2) + 'px'; spot.style.top = Math.round(H / 2) + 'px'; spot.style.width = '0px'; spot.style.height = '0px';
        x = (W - cw) / 2; y = (H - ch) / 2;
    }
    if (tour.pos) { x = tour.pos.x; y = tour.pos.y; }   // moved by hand: where it was put, kept on screen
    x = Math.max(12, Math.min(x, W - cw - 12)); y = Math.max(12, Math.min(y, H - ch - 12));
    card.style.left = Math.round(x) + 'px'; card.style.top = Math.round(y) + 'px';
}

// [tutorialcheck:stage-start]
// What a step's own setup opens, told by its target: the System editor, a sheet (or a HUD), Settings, Table Chat, the fog preview, a menu of the top row.
function stageFor(step) { var t = step.target || ''; return { editor: /^#sys(?!temBtn)/.test(t), sheet: t === '#sheetPanel' || !!step.opens, settings: t === '#setVttCampBlock', chat: t === '#diceBtn', fog: t === '#fogModeBtn', right: t === '#sidebar', row: t === '#systemBtn' || t === '#saveAsBtn' }; }
// [tutorialcheck:stage-end]
// Before a step's setup runs, everything another step (or the user, in Try it yourself) may have left open is put away, the Tutorial
// campaign is the one on screen and the left panel is open — so a step reads the same wherever it is reached from: Next, Back, a jump to
// another part, or Resume. Only what this step itself needs is left as it is.
function clearStage(step) {
    var need = stageFor(step);
    if (!hosting() && (state.appState.activeCampaignId !== TUTORIAL_CAMP_ID || !tutorialCampaign())) ensureTutorialCampaign(false);
    openLeft();
    var hm = document.getElementById('helpModal'); if (hm) hm.style.display = 'none';
    if (!need.row && window.wpTopRow) window.wpTopRow.close();   // a menu of the top row
    if (!need.settings) closeSettingsForTour();
    if (!need.right) closeRightForTour();
    if (!need.chat) { var cp = document.getElementById('chatPanel'); if (cp) cp.style.display = 'none'; if (window.wpDice) window.wpDice.closePanel(); }
    if (window.wpSheets) { if (!need.editor) window.wpSheets.close(true); if (!need.sheet) window.wpSheets.closeSheet(); }
    if (!need.fog && window.wpFog) window.wpFog.setPreview('off');
    if (window.wpSound) window.wpSound.closePanel(); if (window.wpMusic) window.wpMusic.closePanel(); if (window.wpFx) window.wpFx.closePanel();
}
// A step whose target is no longer on screen (something put it away) has its setup run again.
function heal() {
    if (!tour.active || tour.paused) return;
    var step = STEPS[tour.i]; if (!step || !step.target || shownRect(targetEl(step))) return;
    try { if (step.before) step.before(); } catch (e) { console.warn('[tutorial] step setup failed', e); }
    place(); setTimeout(place, 250);
}

function drawButtons() {
    var box = tour.card.querySelector('.tour-btns'), step = STEPS[tour.i]; if (!box || !step) return;
    var html = '';
    if (tour.asking) {
        html = '<span class="tour-ask">End the tour here? Your place is kept: <b>Help &#9656; Tutorial</b> resumes it at this step.</span><span style="flex:1"></span><button class="tool" id="tourStay">Keep going</button><button class="tool ghost" id="tourEndNow">End the tour</button>';
    } else if (step.finish) {
        html = '<button class="tool ghost" id="tourDiscardEnd">Discard the Tutorial campaign</button><button class="tool" id="tourKeepEnd">Keep it &amp; finish</button>';
    } else {
        html = '<button class="tool ghost" id="tourSkip">Skip tour</button><button class="tool ghost" id="tourTry" title="Put this card away and use the app yourself. Resume tour brings this step back, set up as it is now.">Try it yourself</button><span style="flex:1"></span>' + (tour.i > 0 ? '<button class="tool ghost" id="tourBack">&larr; Back</button>' : '') + '<button class="tool" id="tourNext">Next &rarr;</button>';
    }
    box.innerHTML = html;
    var q = function(id) { return tour.card.querySelector('#' + id); };
    if (q('tourNext')) q('tourNext').addEventListener('click', function() { next(1); });
    if (q('tourBack')) q('tourBack').addEventListener('click', function() { next(-1); });
    if (q('tourSkip')) q('tourSkip').addEventListener('click', endTour);
    if (q('tourTry')) q('tourTry').addEventListener('click', pauseTour);
    if (q('tourStay')) { q('tourStay').addEventListener('click', askEnd); try { q('tourStay').focus(); } catch (e) {} }
    if (q('tourEndNow')) q('tourEndNow').addEventListener('click', endTour);
    if (q('tourKeepEnd')) q('tourKeepEnd').addEventListener('click', function() { endTour(); toast('The Tutorial campaign is yours to build on. Help → Tutorial can discard or rebuild it.'); });
    if (q('tourDiscardEnd')) q('tourDiscardEnd').addEventListener('click', function() { endTour(); discardTutorialCampaign(); });
}
// Esc (or the question's own Keep going): ask whether to end, or take the question away again.
function askEnd() { if (!tour.active || tour.paused) return; tour.asking = !tour.asking; drawButtons(); place(); }

function show(i, dir) {
    dir = dir || 1;
    // skip steps whose target has gone missing (the app moved on; tutorialcheck.js should have caught it)
    while (i >= 0 && i < STEPS.length && STEPS[i].target && !STEPS[i].opens && !document.querySelector(STEPS[i].target)) {   // opens: the step's setup makes its target (a HUD window)
        console.warn('[tutorial] step target missing, skipped:', STEPS[i].target);
        i += dir;
    }
    if (i < 0) i = 0;
    if (i >= STEPS.length) { endTour(); return; }
    if (i !== tour.i) tour.pos = null;   // a card moved by hand goes back beside its next step
    tour.i = i; tour.asking = false;
    rememberAt(i);
    var step = STEPS[i];
    document.querySelectorAll('#wbFloatingToolbar .shape-menu.show, #wbEdgeTools .shape-menu.show').forEach(function(m) { m.classList.remove('show'); });   // each step re-opens a toolbar flyout only if it needs it
    try { clearStage(step); } catch (e) { console.warn('[tutorial] stage reset failed', e); }
    if (!step.opens && window.wpSheets && window.wpSheets.closeHuds) window.wpSheets.closeHuds();   // no HUD left floating on another step (Back, a section jump)
    try { if (step.before) step.before(); } catch (e) { console.warn('[tutorial] step setup failed', e); }
    var sec = sectionAt(i), sp = sec.spans, secLabel = sp[sec.idx] ? sp[sec.idx].label : '';
    // Progress reads by PART, never as "step 1 of 32": the position inside the current part on the right, and a slim
    // bar under the header with one segment per part (weighted by its length) — parts done are filled, the current
    // one fills as you go. The part jump on the left already carries the 1/7.
    var secStart = sp[sec.idx] ? sp[sec.idx].start : 0, secEnd = sp[sec.idx + 1] ? sp[sec.idx + 1].start : STEPS.length, inSec = i - secStart + 1, secLen = Math.max(1, secEnd - secStart);
    var html = '<div class="tour-step tour-grip"><button class="tour-secbtn" id="tourSecBtn" title="Jump to a section">' + esc(secLabel) + ' · ' + (sec.idx + 1) + '/' + sp.length + ' ▾</button><span class="tour-stepn">' + inSec + ' of ' + secLen + ' in this part</span></div>';
    html += '<div class="tour-bar" aria-hidden="true">' + sp.map(function(s, k) {
        var len = Math.max(1, (sp[k + 1] ? sp[k + 1].start : STEPS.length) - s.start), pct = k < sec.idx ? 100 : k > sec.idx ? 0 : Math.round(100 * inSec / secLen);
        return '<span class="tour-seg' + (k < sec.idx ? ' done' : k === sec.idx ? ' on' : '') + '" style="flex:' + len + '" title="' + esc(s.label) + '"><i style="width:' + pct + '%"></i></span>';
    }).join('') + '</div>';
    html += '<div class="tour-secmenu" id="tourSecMenu" style="display:none;">' + sp.map(function(s, k) { return '<button class="tour-secitem' + (k === sec.idx ? ' on' : '') + '" data-secstart="' + s.start + '">' + esc(s.label) + '</button>'; }).join('') + '</div>';
    html += '<h3 class="tour-grip" title="Drag to move this card">' + esc(step.title) + '</h3><div class="tour-body">' + tourBlocks(step.html) + '</div>' + (step.help ? '<button class="tour-help" id="tourHelp" title="Put this card away and open Help at this entry. Resume tour brings the step back.">More in Help &#9656; ' + esc(step.help[1]) + '</button>' : '') + '<div class="tour-btns"></div>';
    var keepF = cardFocusOf(tour.card, document.activeElement);
    tour.card.innerHTML = html;
    drawButtons();
    cardRefocus(tour.card, keepF);
    var q = function(id) { return tour.card.querySelector('#' + id); };
    if (q('tourSecBtn')) q('tourSecBtn').addEventListener('click', function(e) { e.stopPropagation(); var m = q('tourSecMenu'); if (m) { m.style.display = m.style.display === 'none' ? 'flex' : 'none'; place(); } });
    if (q('tourSecMenu')) q('tourSecMenu').querySelectorAll('.tour-secitem').forEach(function(b) { b.addEventListener('click', function() { var s = parseInt(b.dataset.secstart, 10); if (s >= 0 && s < STEPS.length) show(s, 1); }); });
    if (q('tourHelp')) q('tourHelp').addEventListener('click', tourHelp);
    var el = targetEl(step);
    if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
    // two passes: the card's height is only known once its content is in the DOM
    place(); setTimeout(place, 30); setTimeout(place, 250);
}
function next(dir) { show(tour.i + dir, dir); }

// Try it yourself: the card, the dimming and the shield go, the app is the user's, and a chip stays to come back by. Resume shows the same
// step again from its setup, so whatever was opened, closed or travelled to meanwhile, the step reads as it did.
function pauseTour() {
    if (!tour.active || tour.paused) return;
    var step = STEPS[tour.i];
    tour.paused = true; tour.asking = false;
    tour.overlay.style.display = 'none';
    document.body.classList.remove('tour-on');
    var t = tour.chip.querySelector('.tour-chip-txt'); if (t) t.textContent = 'Tour paused' + (step ? ' at “' + step.title + '”' : '');
    tour.chip.style.display = 'flex';
}
function resumeTour() {
    if (!tour.active || !tour.paused) return;
    if (!canPersistLocal()) { toast('The tutorial runs on your own campaigns — leave the session first.'); return; }
    guardSwitch(hosting() && state.appState.activeCampaignId !== TUTORIAL_CAMP_ID, function() {   // the step opens the Tutorial campaign again
        if (state.appState.activeCampaignId !== TUTORIAL_CAMP_ID || !tutorialCampaign()) ensureTutorialCampaign(false);
        tour.paused = false;
        tour.chip.style.display = 'none';
        tour.overlay.style.display = 'block';
        document.body.classList.add('tour-on');
        show(tour.i, 1);
    });
}

function startTour(at) {
    var start = (typeof at === 'number' && at > 0 && at < STEPS.length) ? at : 0;   // Help can start at a section, or resume where a tour ended
    if (!canPersistLocal()) { toast('The tutorial runs on your own campaigns — leave the session first.'); return; }
    guardSwitch(hosting() && state.appState.activeCampaignId !== TUTORIAL_CAMP_ID, function() {   // the tour opens the Tutorial campaign
        ensureDom();
        ensureTutorialCampaign(false);   // starting at a section needs the demo campaign present (Welcome usually does this first)
        try { localStorage.setItem('wp_tourSeen', '1'); } catch (e) {}
        var hm = document.getElementById('helpModal'); if (hm) hm.style.display = 'none';
        tour.active = true; tour.paused = false; tour.asking = false; tour.pos = null;
        tour.chip.style.display = 'none';
        tour.overlay.style.display = 'block';
        document.body.classList.add('tour-on');
        show(start, 1);
    });
}
function endTour() {
    if (!tour.active) return;
    var at = tour.i, wasPaused = tour.paused, partWay = at > 0 && at < STEPS.length - 1;   // ended part-way: its place is kept (rememberAt) and said
    tour.active = false; tour.paused = false; tour.asking = false; tour.pos = null; tour.i = -1;
    if (tour.overlay) tour.overlay.style.display = 'none';
    if (tour.chip) tour.chip.style.display = 'none';
    document.body.classList.remove('tour-on');
    if (!wasPaused) {   // ended from Try it yourself: what is open is the user's own, and stays
        closeRightForTour();   // the Properties step may have unfolded the right panel
        closeSettingsForTour();   // the VTT step may have left Settings open
        var cp = document.getElementById('chatPanel'); if (cp) cp.style.display = 'none'; if (window.wpDice) window.wpDice.closePanel();   // and the Dice step the chat panel
        if (window.wpSheets) { window.wpSheets.closeSheet(); if (window.wpSheets.closeHuds) window.wpSheets.closeHuds(); window.wpSheets.close(true); }   // and the sheet step Bren's sheet (and the HUD step his HUD) + the layout step's System editor
        if (window.wpFog) window.wpFog.setPreview('off');   // and the fog step its player-view preview
        document.querySelectorAll('#wbFloatingToolbar .shape-menu.show, #wbEdgeTools .shape-menu.show').forEach(function(m) { m.classList.remove('show'); });   // and any toolbar flyout a step opened (Add, Scene)
        if (window.wpTopRow) window.wpTopRow.close();   // and the System step or the Export step a menu of the top row
    }
    if (partWay) toast('The tour stopped at “' + STEPS[at].title + '”. Help ▸ Tutorial resumes it there.');
    syncPane();
    if (window.wpLeftRail && window.wpLeftRail.settle) window.wpLeftRail.settle();   // the left panel as an arrival at this view leaves it: the tour opened it for its steps
    if (window.wpCampaignAfterTour === true) { window.wpCampaignAfterTour = false; var nbT = document.getElementById('newCampBtn'), awayT = !!(window.wpNet && window.wpNet.foreign); if (nbT && !awayT) setTimeout(function() { nbT.click(); }, 300); }   // the welcome's Start a campaign on a fresh save: the naming prompt now, after the tour or its Skip (the owner's word, 2026-10-01)
}

/* ---------- Help → Tutorial pane wiring ---------- */
function syncPane() {
    var has = !!tutorialCampaign();
    var st = document.getElementById('tourState');
    if (st) st.innerHTML = has
        ? 'The <b>Tutorial</b> campaign is in your save' + (state.appState.activeCampaignId === TUTORIAL_CAMP_ID ? ' and open now' : '') + '. Keep building on it, run the tour again, rebuild it fresh, or discard it.'
        : 'Starting the tour adds a small <b>Tutorial</b> campaign to your save. Your own campaigns are not touched.';
    var d = document.getElementById('tourDiscardBtn'); if (d) d.style.display = has ? '' : 'none';
    var r = document.getElementById('tourRebuildBtn'); if (r) r.style.display = has ? '' : 'none';
    var o = document.getElementById('tourOpenBtn'); if (o) o.style.display = has ? '' : 'none';
    var rs = document.getElementById('tourResumeBtn'), at = tourAt(); if (rs) { rs.style.display = at ? '' : 'none'; if (at) rs.textContent = '\u25b6 Resume at \u201c' + STEPS[at].title + '\u201d'; }   // a tour ended part-way: its place
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
    var rs = document.getElementById('tourResumeBtn'); if (rs) rs.addEventListener('click', function() { startTour(tourAt()); });
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
   yet (no rooms, no play-map items, no planners — however many empty campaigns). It starts in
   Waypoint proper (the owner's word, 2026-10-01: "before the first campaign is made — technically
   the tutorial campaign would be the first unless they skip it"): never over the welcome screen;
   as soon as the welcome is closed and no dialog is up. The welcome's "Start a campaign" on such a
   save just enters the app (main.js asks wpTutorial.pending), the tour's own Tutorial campaign
   is the first, and the prompt naming their own campaign follows the tour's end or its Skip
   (wpCampaignAfterTour, endTour); an import from the welcome holds it until the import is settled. A join from the
   welcome never starts it (a table is never fresh to a player). wp_tourSeen is a table
   preference, so it lives in saves/preferences.json and follows the saves folder — an existing
   campaign updated to this version never sees the pop-up. Everyone else finds the tour under
   Help → Tutorial. */
function saveIsFresh() {
    var camps = Object.values(state.appState.campaigns || {});
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
// [tutorialcheck:autostart-start]
// the welcome screen is up (shown with display flex; the stylesheet hides it otherwise), one of the app's dialogs is open (a prompt, a
// question, the import's choice) or an import picked from the welcome is still being chosen: the tour waits
function welcomeUp() { var w = document.getElementById('welcomeScreen'); return !!(w && w.style.display && w.style.display !== 'none'); }
function dialogUp() { return window.wpWelcomeImporting === true || ['customPrompt', 'customConfirm', 'importChoiceModal'].some(function(id) { var d = document.getElementById(id); return !!(d && d.style.display === 'flex'); }); }
// the tour is still owed to this save: not seen, nothing in the save yet, not at a table (the welcome's Start a campaign asks before it names one)
function tourPending() { var seen = false; try { seen = localStorage.getItem('wp_tourSeen') === '1'; } catch (e) {} return !seen && !(window.wpNet && window.wpNet.active) && Object.keys(state.appState.campaigns || {}).length > 0 && saveIsFresh(); }
(function autoStart() {
    if (/[?&]stream=1/.test(location.search)) return;
    var seen = false; try { seen = localStorage.getItem('wp_tourSeen') === '1'; } catch (e) {}
    if (seen) return;
    var tries = 0;
    var t = setInterval(function() {
        if (window.__wpCleanupBusy) return;   // the cleanup is deciding what the save holds: keep waiting
        tries++;
        var loaded = Object.keys(state.appState.campaigns || {}).length > 0;
        if (!loaded) { if (tries >= 40) clearInterval(t); return; }   // wait for load() (up to ~12 s), then give up quietly
        if (window.wpNet && window.wpNet.active) { clearInterval(t); return; }   // at a table (a join from the welcome): never
        if (welcomeUp() || dialogUp()) return;   // in Waypoint proper: once the welcome is closed and nothing is asked — keep waiting
        clearInterval(t);
        if (!saveIsFresh()) { try { localStorage.setItem('wp_tourSeen', '1'); } catch (e) {} return; }   // an existing table (or one just imported): never pop up, Help → Tutorial has it
        try { localStorage.setItem('wp_tourSeen', '1'); } catch (e) {}
        setTimeout(startTour, 600);
    }, 300);
})();
// [tutorialcheck:autostart-end]

window.wpTutorial = { start: startTour, fresh: saveIsFresh, pending: tourPending, end: endTour, pause: pauseTour, resume: resumeTour, at: tourAt, blocks: tourBlocks, steps: STEPS, version: TUTORIAL_VERSION, ensure: ensureTutorialCampaign, discard: discardTutorialCampaign, build: buildTutorialCampaign, system: tutorialSystem, ensureSheet: ensureTutorialSheet };
