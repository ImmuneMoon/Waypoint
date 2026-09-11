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
import { createNewCampaign, createNewMap, createNewPlanner, getActiveCampaign } from './models.js';
import { save, toast } from './io.js';
import { updateCampaignSelect, updateSidebarNav, navigateToMap } from './sidebar.js';
import { showConfirm } from './dialogs.js';

var TUTORIAL_VERSION = '1.4.6';          // bump when STEPS or the demo campaign change
var TUTORIAL_CAMP_ID = 'camp_tutorial';  // one Tutorial campaign per save
var TUTORIAL_NAME = 'Tutorial';

function render() { if (window.appRender) window.appRender(); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function(c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/* ---------- the demo campaign ---------- */
// Ids are fixed so the tour can find its pieces and a rebuild replaces the old copy cleanly.
function buildTutorialCampaign() {
    var A = 'assets/tutorial/';                    // shipped with the app, so every install has it
    var camp = createNewCampaign(TUTORIAL_NAME);
    camp.id = TUTORIAL_CAMP_ID;
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
        { id: 'tut_r_fort', name: 'Old Fort', cat: 'danger', x: 15300, y: 15400, notes: 'A ruined hillfort the raiders use as a fallback. Something older than raiders lives in the walls.', characters: [], targetMapId: 'map_tut_fort', icon: 'Tower' }
    ];
    realm.links = [
        ['tut_r_eldara', 'tut_r_hills', 'route', { label: "Two days' ride", notes: 'Caravan road. A raid on a 1–2 each day.' }],
        ['tut_r_hills', 'tut_r_hideout', 'secret', { label: 'Goat path', notes: 'Hidden unless a captured raider talks or the party tracks a patrol (Survival 14).' }],
        ['tut_r_hideout', 'tut_r_fort', 'oneway', { label: 'Downriver', notes: 'The raiders flee to the fort by raft; the way back is on foot.' }],
        ['tut_r_eldara', 'tut_r_fort', '', { label: 'Old road' }]
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
        { id: 'tut_f_yard', name: 'Fort yard', cat: 'danger', x: 15000, y: 15000, notes: 'Walls still stand; the gate does not. The spriggan in the trees is not with the raiders.', characters: [] },
        { id: 'tut_f_wood', name: 'Tree line', cat: 'wild', x: 14700, y: 15100, notes: 'Cover, and something watching from it.', characters: [] }
    ];
    fort.links = [['tut_f_wood', 'tut_f_yard', 'oneway', { label: 'Charge across the open' }]];
    fort.whiteboard = [
        { id: 'tut_wb_fortmap', type: 'image', src: A + 'map_fort.jpg', x: O, y: O, w: 1024, h: 1024, color: 'transparent', layer: 'back', locked: true, name: 'Old Fort' },
        { id: 'tut_wb_fortlabel', type: 'text', x: O + 40, y: O - 60, w: 520, h: 40, color: 'transparent', text: '<b>Old Fort</b> (hex grid) \u2014 an outdoor battle map; the archer on the wall is at +3', fontSize: 14, layer: 'front' },
        hexTok(O + 830, O + 220, pic('minotaur_archer_hex.png', { id: 'tut_wb_wallarcher', charName: 'Wall archer', name: 'Wall archer', charStats: 'On the battlements: Elevation +3.', elevation: 3 })),
        hexTok(O + 500, O + 560, pic('minotaur_soldier_hex.png', { id: 'tut_wb_gateguard', charName: 'Gate guard', name: 'Gate guard', charStats: 'Minotaur soldier at the gate.' })),
        hexTok(O + 140, O + 300, pic('spriggan_hex.png', { id: 'tut_wb_spriggan', charName: 'Old Thornback', name: 'Old Thornback', charStats: 'Spriggan. Hidden in the trees until the party gets close.', hidden: true }))
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

    /* ---- Campaign Cast: raiders to drop by the handful (play map right-click → Cast) ---- */
    camp.cast = {
        tut_cast_raider: { id: 'tut_cast_raider', name: 'Raider', kind: 'image', src: A + 'orc_hex.png', w: 60, h: 52, color: 'transparent', charStats: 'A raider. Drop one, or five at once.', shape: '', savedAt: Date.now() },
        tut_cast_guard: { id: 'tut_cast_guard', name: 'Minotaur guard', kind: 'image', src: A + 'minotaur_soldier_hex.png', w: 60, h: 52, color: 'transparent', charStats: 'Hired muscle.', shape: '', savedAt: Date.now() },
        tut_cast_slime: { id: 'tut_cast_slime', name: 'Slime', kind: 'image', src: A + 'slime_hex.png', w: 60, h: 52, color: 'transparent', charStats: 'It divides when hit.', shape: '', savedAt: Date.now() }
    };
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
        { type: 'text', content: 'The survivors raft downriver to the <b>Old Fort</b>. Old Thornback the spriggan is nobody\'s friend.' }
    ];

    [realm, city, inn, throne, temple, forge, ground, basement, top, fort, road, plan].forEach(function(it) { camp.items[it.id] = it; });
    camp.activeItemId = realm.id;
    return camp;
}

function tutorialCampaign() { return state.appState.campaigns[TUTORIAL_CAMP_ID] || null; }

// Creates the Tutorial campaign (or rebuilds it when asked) and makes it active
function ensureTutorialCampaign(rebuild) {
    var camp = tutorialCampaign();
    if (!camp || rebuild) {
        camp = buildTutorialCampaign();
        state.appState.campaigns[TUTORIAL_CAMP_ID] = camp;
    }
    state.appState.activeCampaignId = TUTORIAL_CAMP_ID;
    state.selId = null; state.selWbId = null; state.selWbIds = []; state.linkStart = null;
    updateCampaignSelect(); updateSidebarNav(); render(); save(true);
    return camp;
}

function discardTutorialCampaign(done) {
    var camp = tutorialCampaign();
    if (!camp) { toast('There is no Tutorial campaign to discard.'); if (done) done(false); return; }
    showConfirm('Discard the Tutorial campaign? Everything in it is deleted — including anything you built on top of it. This cannot be undone.', function(yes) {
        if (!yes) { if (done) done(false); return; }
        delete state.appState.campaigns[TUTORIAL_CAMP_ID];
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
}

/* ---------- the tour ---------- */
// Each step: target (selector or null for a centred card), title, html, before() to put the
// app in the right state first. Targets are ids from index.html wherever possible.
function goView(mode) { var b = document.querySelector('#viewModeSelect .seg-btn[data-mode="' + mode + '"]'); if (b && !b.classList.contains('active')) b.click(); }
function openItem(id) { var camp = getActiveCampaign(); if (!camp || !camp.items[id]) return; if (camp.items[id].type === 'map') navigateToMap(id); else { camp.activeItemId = id; state.selId = null; state.selWbId = null; state.selWbIds = []; updateSidebarNav(); render(); } }
function openLeft() { var sb = document.getElementById('campaignSidebar'); if (sb && sb.classList.contains('collapsed')) { var t = document.getElementById('toggleLeftBtn'); if (t) t.click(); } }

var STEPS = [
    { target: null, title: 'Welcome to Waypoint',
      html: 'This tour uses a small campaign called <b>Tutorial</b> that was just added to your save: an elven realm with a city (throne room, temple, forge, inn), a hill road, a three-floor raiders\' hideout, an old fort, and a session plan \u2014 hex and square grids and no grid at all, drawn maps and maps built from shapes. It is a real campaign \u2014 <b>keep it and build on it</b>, or discard it at the end (or any time from Help \u2192 Tutorial). Use <b>Next</b> and <b>Back</b>; <b>Esc</b> leaves the tour.',
      before: function() { ensureTutorialCampaign(false); openLeft(); openItem('map_tut_realm'); goView('data'); } },
    { target: '#campaignSelect', title: 'Campaigns',
      html: 'Everything belongs to a campaign. This picker switches between them; the buttons beside it add, rename, search and delete campaigns. Your own campaigns are untouched by the tutorial.' },
    { target: '#mapNavList', title: 'Maps nest like places',
      html: '<b>Eldara Realm</b> holds the city <b>Eldara</b>, which holds <b>The Inn</b>; the <b>Raiders\' Hideout</b> holds its <b>Basement</b> and <b>Top Floor</b>. World \u2192 region \u2192 building \u2192 room, as deep as you like. Drag a map onto another to nest it. Right-click a map for <b>New Parent Map</b> (a new map that wraps it, with a portal node already placed) or <b>New Child Map</b> (a map inside it).' },
    { target: '#viewModeSelect', title: 'Two faces of every map',
      html: 'The <b>Data Map</b> is the node view for your notes and connections; the <b>Play Map</b> is the battle map with tokens. This switch flips between them, and each map remembers which face you left it on.',
      before: function() { openItem('map_tut_city'); goView('data'); } },
    { target: '#dataFloatingToolbar', title: 'Data map tools',
      html: '<b>Add Room</b> drops a node. <b>\u2194 Link Mode</b> connects two rooms \u2014 pick the line type first: a solid <b>path</b>, a dashed <b>route</b>, a dotted <b>secret</b> way or a <b>one-way</b> arrow. Hover a line and a small chip appears at its middle (a labelled line keeps its chip). Click the line or the chip to open it in <b>Properties</b>: a label that is drawn on the line (players see it), GM-only notes about the journey (never sent), the type, a swap for the direction, and Remove. <kbd>Delete</kbd> removes the selected link; right-click the chip for a quick type menu. Eldara\'s lines are already labelled \u2014 one of each type.' },
    { target: '#canvasWrap', title: 'Rooms and portals',
      html: 'Drag rooms around; click one to edit it on the right. The <b>Palace</b> carries a scene image and a king with a portrait; hover its shape on the Play Map to see both. <b>The Inn</b> carries a door icon because it is a <b>portal</b>: double-click it to travel into the inn\'s battle map, and use the breadcrumb at the top to climb back out. In multiplayer, players travel by dropping their token on a portal.',
      before: function() { openItem('map_tut_city'); goView('data'); } },
    { target: '#sidebar', title: 'The Properties panel',
      html: 'Whatever you select is edited here: a room\'s name, category colour, scene image, GM-only notes and the characters found there, each with a portrait. Room notes and character info are <b>never sent to players</b>. The panel opens with a selection and closes when it clears; the arrow on its edge toggles it by hand.',
      before: function() { openItem('map_tut_city'); goView('data'); state.selId = 'tut_palace'; render(); if (window.wpSyncRightPanel) window.wpSyncRightPanel(); } },
    { target: '#wbFloatingToolbar', title: 'Play map tools',
      html: 'Now inside the hideout, on its ground floor Play Map. Left to right: centre, undo, then <b>grid</b> (square, hex or none \u2014 each map remembers its own) and <b>snap</b>, then the tools \u2014 move, pan, draw, erase, <b>measure</b> (rulers; between two tokens at different heights it also prints the 3D figure) and <b>blast</b> (click a cell to drop a grenade radius: tokens in range light up with their distance, height included; drag a blast to move it, right-click it to remove it), then text, shapes, images and the picture library, and <b>Import Character</b> for a shadow-base.com sheet. <i>The blast button is a stopgap: blasts will be thrown from the VTT character sheets once those are in, and the preset explosive types are not permanent, names and radii alike \u2014 they will be set per campaign, from its own weapons, and customizable.</i>',
      before: function() { openItem('map_tut_ground'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); } },
    { target: '#whiteboardWrap', title: 'Tokens',
      html: 'Any shape or image with <b>Is Character</b> set is a token. On a <b>hex grid</b> the picture tokens are clipped to a hexagon, one cell wide (60&times;52), and they seat themselves in a cell when dropped. Hover a token for its name and stats; <b>right-click</b> one for conditions, posture and elevation \u2014 the chips at its foot show height (<b>+4</b>) and posture (<b>KNL</b>, <b>PRN</b>\u2026), and the switches for both live in Settings \u2192 Table. In a session a player can right-click <i>their own</i> token for the same rows, and your switches decide what they see. <b>Horn</b> behind the guard-room door is hidden from players \u2014 you see him dimmed \u2014 until you tick <b>Visible to players</b>. The gold hexes on the stairs are <b>portals</b>: double-click one to go up to the archers (at +4) or down to the basement. The hex trigger on the office door fires its message when a token is dropped on it. Right-click empty board for the <b>Campaign Cast</b> \u2014 saved tokens (a raider, a guard, a slime) to drop one at a time or five at once.',
      before: function() { openItem('map_tut_ground'); goView('visual'); } },
    { target: '#whiteboardWrap', title: 'Square grids, square tokens',
      html: '<b>The Inn</b> runs on a <b>square grid</b>: 50 px cells over a drawn tavern whose own squares line up with them, and the tokens are square pictures that fill one cell each. Drag one with Snap on and it seats in a cell; <b>&#8862; Fit to grid</b> in the selection toolbar sizes any selection to whole cells on either grid type. The square at the door is a trigger zone. Pick the grid per map with the grid button \u2014 the city map above uses none at all.',
      before: function() { openItem('map_tut_inn'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); } },
    { target: '#whiteboardWrap', title: 'No grid at all',
      html: '<b>Eldara</b> has no grid: an overview map where pictures, shapes and tokens sit wherever you drop them, at any size \u2014 region maps, city streets, ship decks, theatre-of-mind scenes. <b>Snap</b> still helps: in <b>Items</b> mode a dragged item glues flush to its neighbours instead of to cells. Rulers still work \u2014 set <b>Map Scale</b> in the measure options (1 cell = 100 yd, 2 km\u2026) so distances read right for the map. The tinted district shapes are linked to rooms: hover one for its card, double-click the Inn\'s to travel.',
      before: function() { openItem('map_tut_city'); goView('visual'); state.selWbId = null; state.selWbIds = []; render(); } },
    { target: '#imgLibBtn', title: 'The picture library',
      html: 'Every picture in your saves folder, filtered by name or map, grouped into categories you define (right-click a picture to tag it). Click one for a large preview \u2014 the arrows or <kbd>&larr;</kbd> <kbd>&rarr;</kbd> step through \u2014 then <b>Add to map</b>. The tutorial\'s own art ships with the app rather than in your saves, so it is not listed here; your pictures will be.',
      before: function() { openItem('map_tut_inn'); goView('visual'); } },
    { target: '#plannerNavList', title: 'Planners',
      html: 'Document pages for session plans, encounter tables, and flowcharts — nest them like maps. <b>Session 1</b> is marked as the <b>next scene</b>, so it shows up in the play map\'s right-click menu during a game. Planners are yours alone; players never receive them.',
      before: function() { openItem('plan_tut_session1'); } },
    { target: '#plannerTools', title: 'Writing a planner',
      html: 'Add blocks from the toolbar: headings, prose, callouts, titled tables and flowcharts. <b>Render</b> shows the finished page; <b>Export As</b> turns it into an image, PDF or HTML.',
      before: function() { openItem('plan_tut_session1'); } },
    { target: '#handoutsBtn', title: 'Handouts and the journal',
      html: 'Pictures and text to show your players \u2014 a letter, a face, a place. The Tutorial campaign has two ready: <b>Grukk\'s ledger</b> and <b>The hideout</b>. In a session you show one to everyone or to one player, and it lands in their <b>Journal</b> (the book icon beside this), where they keep notes on it and can share it with the party. A room can carry a handout that arrives when a player reaches it.' },
    { target: '#saveAsBtn', title: 'Export and import',
      html: 'Share or back up at any scope: this map or planner, all maps, all play maps, all planners, this campaign, or everything. Exports that use pictures arrive as a <b>.zip</b> with the pictures bundled; <b>Import</b> takes those zips or plain .json and <b>merges by id</b> or replaces. Merging is how another author hands you a module without touching the rest of your campaign.' },
    { target: '#searchMapsSidebarBtn', title: 'Finding things',
      html: 'The search buttons beside Planners and Maps filter their lists. <kbd>Ctrl</kbd> + <kbd>K</kbd> is faster: type any map, planner or room name from any campaign and press Enter to go straight there. The <b>Recent</b> chips above the Maps tree remember where you have been, and a pinned map (right-click the play map) stays at the top.' },
    { target: '#netBtn', title: 'Multiplayer',
      html: 'Host a table from here: players join with a room code, follow the map you are on, move only their own tokens, and receive a <b>sanitised</b> copy of the campaign — no notes, no planners, no hidden items. Pause, whisper, summon, run combat and hand out handouts from the same place.' },
    { target: '#settingsBtn', title: 'Settings',
      html: 'Your name and table picture, light or dark theme, measurement units, the minimap and rulers, the <b>Token elevation</b> and <b>Token posture</b> switches, journal options and updates. Table settings travel with your saves folder.' },
    { target: '#helpBtn', title: 'Help is always here',
      html: 'Every topic in more depth, keyboard shortcuts, and this tour again whenever you want it. <b>Ctrl + K</b> jumps to any map, planner or room by name.' },
    { target: null, title: 'That\'s the tour', finish: true,
      html: 'The <b>Tutorial</b> campaign stays in your save so you can keep building on it — rename it, add maps, run a session. Or discard it now; your other campaigns are untouched either way.' }
];

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
    while (i >= 0 && i < STEPS.length && STEPS[i].target && !document.querySelector(STEPS[i].target)) {
        console.warn('[tutorial] step target missing, skipped:', STEPS[i].target);
        i += dir;
    }
    if (i < 0) i = 0;
    if (i >= STEPS.length) { endTour(); return; }
    tour.i = i;
    var step = STEPS[i];
    try { if (step.before) step.before(); } catch (e) { console.warn('[tutorial] step setup failed', e); }
    var html = '<div class="tour-step">Step ' + (i + 1) + ' of ' + STEPS.length + '</div><h3>' + esc(step.title) + '</h3><div class="tour-body">' + step.html + '</div><div class="tour-btns">';
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
    var el = targetEl(step);
    if (el && el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
    // two passes: the card's height is only known once its content is in the DOM
    place(); setTimeout(place, 30); setTimeout(place, 250);
}
function next(dir) { show(tour.i + dir, dir); }

function startTour() {
    if (window.wpNet && window.wpNet.active && window.wpNet.role === 'client') { toast('The tutorial runs on your own campaigns — leave the session first.'); return; }
    ensureDom();
    try { localStorage.setItem('wp_tourSeen', '1'); } catch (e) {}
    var hm = document.getElementById('helpModal'); if (hm) hm.style.display = 'none';
    tour.active = true;
    tour.overlay.style.display = 'block';
    document.body.classList.add('tour-on');
    show(0, 1);
}
function endTour() {
    if (!tour.active) return;
    tour.active = false; tour.i = -1;
    if (tour.overlay) tour.overlay.style.display = 'none';
    document.body.classList.remove('tour-on');
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
    var v = document.getElementById('tourVersion'); if (v) v.textContent = 'Tour version ' + TUTORIAL_VERSION + ' · ' + STEPS.length + ' steps';
}
(function wire() {
    var s = document.getElementById('tourStartBtn'); if (s) s.addEventListener('click', startTour);
    var o = document.getElementById('tourOpenBtn'); if (o) o.addEventListener('click', function() { ensureTutorialCampaign(false); var hm = document.getElementById('helpModal'); if (hm) hm.style.display = 'none'; toast('Tutorial campaign opened.'); });
    var r = document.getElementById('tourRebuildBtn'); if (r) r.addEventListener('click', function() {
        showConfirm('Rebuild the Tutorial campaign from scratch? Anything you added to it is lost.', function(yes) { if (!yes) return; ensureTutorialCampaign(true); syncPane(); toast('Tutorial campaign rebuilt.'); });
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
(function autoStart() {
    if (/[?&]stream=1/.test(location.search)) return;
    var seen = false; try { seen = localStorage.getItem('wp_tourSeen') === '1'; } catch (e) {}
    if (seen) return;
    var tries = 0;
    var t = setInterval(function() {
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

window.wpTutorial = { start: startTour, fresh: saveIsFresh, end: endTour, steps: STEPS, version: TUTORIAL_VERSION, ensure: ensureTutorialCampaign, discard: discardTutorialCampaign, build: buildTutorialCampaign };
