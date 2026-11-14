/* Section & field tooltips.

   Hovering a heading or a field label anywhere in the app explains what that
   section is for. Headings are matched by their text (with button text
   stripped) and labels by the id they point at, so the same dictionary covers
   static HTML and everything the inspector renders on the fly. A mutation
   observer re-applies after every render. Existing titles are left alone,
   except the sidebar section titles, whose collapse hint is appended. */

var BY_ID = {
    // data node (room)
    fName: 'What this place is called. Players see room names, so keep spoilers out of them.',
    fCat: 'The kind of place this is. Categories give nodes their color and are per map — manage them under Categories below.',
    fTargetMap: 'Turns this node into a portal: pick another map and double-clicking it (or dropping a player token on its play map item) travels there.',
    fIcon: 'A badge drawn on the node — door, stairs, gate… — hinting at what kind of exit or place it is.',
    fNotes: 'GM-only text: read-alouds, secrets, DCs. Never sent to players in multiplayer.',
    fCatColor: 'Color of the selected category.',
    // whiteboard item
    wbName: 'Optional label shown in the Elements list and this header. Cosmetic only.',
    wbEventMsg: 'Pops up when a character token is dropped inside this zone.',
    wbIsChar: 'Makes this item a character token: a name and stats line on hover, a player owner in multiplayer, and automatic room tracking.',
    wbCharName: 'Shown on hover and used to match this token to its player and to room character lists — spell it the same everywhere.',
    wbCharStats: 'Player-safe line shown on hover (species, points…). Everyone at the table can read it.',
    wbCharSel: 'The campaign character this token stands for: its sheet, values and player. New character from this token makes one named after it; several tokens may share a character.',
    wbOwner: 'The player allowed to drag this token in multiplayer. Their moves are mirrored to everyone.',
    wbElev: 'Height above the ground, in yards or in meters as you chose under Measuring — a ledge at +3 yd, a catwalk at +5, a pit at −2. Its arrows step one yard. Shown as a chip on the token; the Radius tool measures straight-line, height included.',
    wbPosture: 'Standing, crouching, sitting, kneeling, crawling, lying prone or lying face up. Shown as a chip on the token.',
    blastFt: 'The size of the shape, in the ruler\'s unit on this map. For a circle it is read as a radius or as a diameter.',
    blastElev: 'The height the last shape or blast is measured from. It starts at the height of the token in its cell, else the ground. Its arrows step one yard.',
    blastDmg: 'The damage of the explosion. It is a number or a roll, and you type it each time.',
    blastDmgType: 'The type of the damage, a word. It is named on the roll\'s card and changes no number.',
    wbNodeLink: 'Ties this item to a data-map room: hovering shows the room, a room with a Linked Map makes this a portal, and tokens dropped on it move into that room.',
    lkType: 'How the line is drawn: a plain path, a dashed route, a dotted secret way, or a one-way arrow.',
    lkLabel: 'A short name for this connection, drawn on the line. Players see it.',
    lkNotes: 'What traveling this way involves. GM only — never sent to players.',
    wbTextOpacity: 'How solid the words are, from 10% to fully opaque. The background keeps its own setting.',
    wbBgOpacity: 'How solid the box behind the words is, from invisible to fully opaque. The words keep their own setting.',
    wbLockRatio: 'Keep width and height in proportion when resizing. On by default: Shift while dragging reshapes it freely, and unticking frees it for good.',
    wbStrokeWidth: 'Thickness of the stroke, in board pixels.',
    wbStrokeWidthNum: 'Thickness of the stroke, in board pixels.',
    wbRot: 'Rotate the item. Dragging the blue handle above it on the canvas does the same.',
    wbRotNum: 'Rotation in degrees.',
    wbStatus: 'Alive shows nothing; Incapacitated puts a red X over the token; Dead adds a skull and darkens the art. Also in the right-click menu.',
    wbFaceMode: 'Turning a token can rotate the whole picture, or just move the arrow around an upright picture.',
    wbFront: 'Which side of the art is the token\'s front. The small arrow marks it and always points across a cell face at a neighboring cell.',
    wbLayer: 'Which of the five stacking layers this sits on — Back is drawn first, Front last.',
    wbLock: 'Locked items can’t be moved or resized, and clicks pass through them to whatever is beneath.',
    wbTextFont: 'Typeface for this text box, from the fonts Windows ships with.',
    wbTextSize: 'Text size in pixels.',
    wbTextSizeNum: 'Text size in pixels.',
    wbVisible: 'Whether players at your table can see this item. Hidden items are dimmed for you and invisible to them.',
    // settings / net
    setNameInput: 'How other players see you in the roster and chat.',
    setGridOpacity: 'How strongly the square/hex grid draws over the map. Only on this computer.',
    setOpacity: 'Transparency new shapes, drawings and images are created with.',
    netCampSelect: 'The campaign players will join. Changing it switches your app to that campaign.',
    netStageSelect: 'Where joining players land. Player\'s last location sends each player back to the map they were last on, to stay put until they travel or you summon; Follow me keeps the table on whatever map you are viewing.',
    netStageFallbackSelect: 'Where a player joining this campaign for the first time lands: with you (Follow me) or parked on a map of your choice.',
    netPassInput: 'Optional extra lock: players must type this along with the room code.',
    netCodeInput: 'The room code your GM gave you: ten characters, shown as XXXXX-XXXXX. Type or paste it with or without the hyphen.',
    netJoinPassInput: 'Only needed if the GM set a session password.',
    elementSearchInput: 'Filter the list by name.',
    newDocBtn: 'A new handbook page: rules or reference your players can read at the table.',
    searchDocsBtn: 'Find a page by its name or its text — type a word and it searches every page’s content, with a snippet of the match.',
    collapseAllDocsBtn: 'Collapse or expand every nested page.',
    docPlayersBtn: 'Whether players at your table receive this page. Off while hosting removes it from them at once.',
    exportDocsBtn: 'Every handbook page in this campaign as one file (pictures bundled).',
    plannerFromFileBtn: 'A new planner from a Markdown file (pick its pictures with it, or a zip of both). A preview shows every block first.',
    docFromFileBtn: 'A new handbook page from a Markdown file (pick its pictures with it, or a zip of both). A preview shows every block first.',
    plannerImportBtn: 'Append a Markdown file to this document, with a preview of every block first.',
    exportMdBtn: 'The open planner or page as Markdown; with pictures, a zip.',
    helpMdTemplateBtn: 'A page in the import format to start from.',
    imgLibBtn: 'This campaign\'s pictures, with Shared, Unfiled and every campaign\'s a chip away; Import from another campaign… brings pictures in without copying them.',
    imgLibSource: 'Whose pictures to pick from: another campaign, Shared (the tutorial art) or Unfiled.',
    fxPingTo: 'Who sees your pings: everyone on this map, or one player on it. Alt+click on the map follows this choice; it goes back to everyone when that player leaves the map.'
};

var BY_TEXT = {
    'data node': 'A room, location, or scene on the data map. Everything below describes it.',
    'categories': 'The color-coded kinds of place on this map, such as surface, detention or exchange. Add your own. The same colors on every map keep things easy to read.',
    'characters': 'Who is here. Players see the names and portraits. The info and reference fields stay the GM\'s. A token dropped on a floor shape linked to this room moves its character in by itself.',
    'multiple items selected': 'Actions that apply to everything selected. Ctrl or Shift and a click adds to the selection. A box dragged on empty ground selects an area.',
    'layering all selected': 'The stacking order for the whole selection, in five layers from Back to Front.',
    'text box': 'A block of text on the board. Double-click it on the board to edit the words, and style it below.',
    'image': 'An image on the board. Tick Is Character to turn it into a token.',
    'drawing': 'A freehand or straight-line stroke. The eraser removes just the parts you pass over.',
    'trigger zone': 'An invisible zone: when a character token is dropped inside, its Event Message pops up.',
    'hex trigger': 'A hex-shaped trigger zone: drop a character token inside and its Event Message pops up.',
    'rect': 'A rectangle. Link it to a room to make it a floor that tracks who stands on it, or a portal.',
    'rectangle': 'A rectangle. Link it to a room to make it a floor that tracks who stands on it, or a portal.',
    'circle': 'A circle. Tick Is Character to make it a simple token.',
    'diamond': 'A diamond shape.',
    'hexagon': 'A hexagon that centers itself on hex-grid cells. Resizes like any other shape.',
    'visual shapes': 'Every item on this play map, grouped by layer from front to back. Click to jump to one, double-click to rename, ▲▼ to move it a layer.',
    'data nodes': 'Every room on this data map. Click to jump to one, double-click to rename.',
    'text color': 'Ink color for the text. The palette plus a custom color wheel.',
    'pen color': 'Color of the stroke. The pen palette plus a custom color wheel.',
    'fill color': 'The fill of the shape. A tint lets the map show through. The color wheel is at the end.',
    'alignment': 'Where the text sits inside its box: left / center / right / justified, and top / middle / bottom.',
    'text alignment': 'Where the text sits inside its box. Horizontal: left / center / right / justified. Vertical: top / middle / bottom.',
    'box background': 'A backdrop behind the text so it reads over busy art. None keeps it transparent.',
    'player owner can move this token': 'The player allowed to drag this token in multiplayer.',
    // sidebar
    'planners': 'Document pages: session plans, encounter tables, flowcharts, notes. Nest them under each other. Never sent to players.',
    'handbook': 'Rules and reference pages for your table. Players read the pages you leave open to them, in a panel over the map. A page can be the GM\'s alone.',
    'maps': 'Your locations. Each map has a data view of rooms and links, and a play map with the drawn scene. Drag one onto another to nest it.',
    'campaigns': 'Separate games, each with its own maps and planners.',
    // settings
    'profile': 'How you appear to others at a multiplayer table.',
    'table': 'Board preferences, such as units, rulers and grid opacity. They are yours alone, since every player keeps their own. The VTT features have a section of their own below, set per campaign. They are elevation, posture, token facing, minimap, sound, music, dice, character sheets, visual effects, fog of war, lighting, turn-based combat, the calendar, video and table trackers.',
    'vtt features': 'Elevation, posture, token facing, the minimap, sound, music, dice, character sheets, visual effects, fog of war, lighting, turn-based combat, the calendar, video, table trackers, personal looks and turn to movement are set per campaign, each on until the GM switches it off. At a table a player sees at most what the GM\'s campaign has on, and may switch a feature off for themselves there, never on. Fog of war, token facing, lighting, turn-based combat and table trackers are the GM\'s for the whole table.',
    'vtt integration': 'The master switch for this campaign. Off means the plain whiteboard, with every VTT feature off and hidden. The choice for each feature is kept for when it goes back on.',
    'this campaign': 'The VTT features of the campaign on screen. They are saved with the campaign. While you host, a change reaches the table at once.',
    'this table': 'What the GM runs this table with. Turn a feature off for yourself here. You cannot turn on one the GM has off, and nothing here changes your own defaults.',
    'token elevation': 'A height in yards on every character token, shown as a chip. The Radius tool and the rulers then measure in a straight line, height included. Off hides the chips and keeps the heights.',
    'token posture': 'Standing, crouching, sitting, kneeling, crawling, prone or face up on every character token, shown as a chip. Off hides the chips and keeps the values.',
    'default for new campaigns': 'What a campaign starts with when you make it. Changing this touches no campaign you have. Apply to existing campaigns copies it onto the ones you tick.',
    'advanced': 'Defaults for new items, Developer mode, snapshots and resets. Developer mode gives the ~ console and the developer tools, and is off unless you switch it on. Nothing here touches your campaigns. Reset local preferences clears your VTT default and your choices at each table, never a campaign\'s own settings.',
    'display name': 'How other players see you in the roster and chat.',
    'measurement system': 'Units for the measure tool: yards/feet/miles or meters/kilometers.',
    'minimap': 'The small overview map in the corner of the board. It is a VTT feature, set per campaign. The arrow on the box itself only folds it away.',
    'sound': 'Ambient loops and one-shot cues from the Sound panel on the play map, heard by every player at the table. Off silences the table for this campaign and hides the panel. The library keeps its files.',
    'dice': 'Rolls at the table: /roll in Table Chat and the roller beside it. The GM\'s machine makes every roll and everyone sees the same card. Off for the campaign, nobody rolls at its table.',
    'character sheets': 'The campaign\'s system of attributes, formulas and rolls, and the sheets built on it. Off for the campaign, the system stays yours to edit, but nothing of it shows at the table.',
    'visual effects': 'The GM\'s Effects panel. It gives flashes, screen shake, color washes, bursts on the map, weather and banners, seen by the players on that map. Alt and a click on the play map rings a cell for a moment. Off for the campaign hides the panel, and a player can switch it off for themselves.',
    'fog of war': 'Each player sees only the cells their characters can see. The fog is painted and previewed from the Fog tool on the play map\'s toolbar. Off for the campaign lifts the fog for everyone. The GM runs it for the whole table, so there is no per-player off.',
    'table trackers': 'Counters, countdowns and clocks in a strip at the top left of the play map. The GM may keep them from chosen players: Who sees on the Trackers bar, a player\'s menu, or the ticks under the switch in Settings. The GM runs it for the whole table, so there is no per-player off.',
    'lighting': 'Light and darkness on fogged maps: a map is lit until the GM places a light source, a token can carry a light, and a token\'s sight is how far it sees in the dark. Off for the campaign, a token sees only as far as its sight. The GM runs it for the whole table, so there is no per-player off.',
    'music': 'Named playlists from the Music panel, and a song or playlist a map starts by itself, with a volume of its own. Off for the campaign silences the music and hides the panel. The playlists and files are kept.',
    'senses': 'Your system\'s senses besides the eyes. A full sense sees every cell in its range. A mark sense shows its token\'s player a mark with no name where a creature is. Blindness, smoke and null areas can stop them. They are set on the System editor\'s Combat tab, and Edit opens it.',
    'turn based combat':'While a combat runs, turns are taken in the roster\'s order: the player whose token has the turn ends it. On by default. The GM runs it for the whole table, so there is no per-player off.',
    'stream window': 'A second window with only the play map, as players see it, for screen-sharing. Silent unless the box below is ticked.',
    'coordinate rulers': 'The number strips along the top and left edges of the board.',
    'grid opacity': 'How strongly the grid draws over the map. It is only on this computer, since every player picks their own.',
    'default opacity for new items': 'Transparency new shapes, drawings and images start with.',
    // multiplayer modal
    'host be the gm': 'Run the table from this computer. Players connect to you with a room code. Your planners, notes and dossiers never leave this machine.',
    'join be a player': 'Enter a GM’s room code to sit at their table. You see their map and move only the tokens they assign you.',
    'campaign being hosted': 'The campaign players will join.',
    'players arrive at': 'Where joining players land. Player\'s last location takes them to their own last map, Follow me to the map you are on, and a pinned map to that map.',
    'new players start at': 'Where someone joining this campaign for the first time lands, with you or on a map of your choice.',
    'session password optional': 'An extra lock in case the room code leaks.',
    'room code': 'The code your GM sent you. Capitals and the hyphen do not matter.',
    'player history bans': 'Everyone who has ever joined this campaign, and who is banned from it.',
    // tool menus
    'pen style': 'Freehand sketching, or straight lines from point to point.',
    'pen color': 'Color for new strokes.',
    'stroke size': 'Thickness of new strokes.',
    'opacity': 'Transparency of new strokes.',
    'eraser size': 'The radius of the eraser. The circle around your pointer shows it.',
    'eraser mode': 'Precise cuts a line where the eraser passes. Segments takes away each piece of a line it touches, from one point to the next.',
    'map scale per grid cell': 'What one grid cell stands for on this map, such as 5 ft for a dungeon, 100 yd for a battlefield or 2 km for a region.',
    'new shape size': 'Free: click for the default size, drag for an exact box. Grid cell: every new shape is exactly one cell and seats into it.',
    'new item opacity': 'Transparency new shapes, drawings and images are created with.',
    'font': 'Typeface for this text box.',
    'text size': 'Text size in pixels.',
    'pen size': 'Thickness of the stroke.',
    'layer': 'Which of the five stacking layers this sits on. Back is drawn first and Front last.',
    'rotation': 'Turns the item. The blue handle on the board does the same.',
    'link node': 'Ties this item to a room of the data map, for its hover card, a portal and where tokens are.',
    'name': 'The name shown in lists and on hover.',
    'category': 'The kind of place this is. A category gives a node its color.',
    'linked map': 'Makes this node a portal to another map.',
    'node icon': 'A badge hinting at what kind of exit or place this is.',
    'notes room details': 'GM-only text. Never sent to players.'
};

var BY_CONTAINS = {
    'data map': 'The node-and-link view of this map: rooms as cards, lines as connections. The play map is the drawn version of the same place.',
    'layer': 'Which of the five stacking layers this sits on. Back is drawn first and Front last.'
};

function norm(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function headingText(el) {
    var clone = el.cloneNode(true);
    clone.querySelectorAll('button, input, select, .muted, [data-tip-ignore]').forEach(function(n) { n.remove(); });
    return clone.textContent;
}
// A section title of the left panel that shares its words with another heading is known by its own name (data-section)
var BY_SECTION = { characters: 'The campaign\u2019s character sheets. Click a character to open its sheet. Right-click it for its HUD, to find its token or to delete the sheet.' };
function tipFor(el) {
    var forId = el.getAttribute && el.getAttribute('for');
    if (forId && BY_ID[forId]) return BY_ID[forId];
    var sec = el.classList && el.classList.contains('section-title') && el.dataset ? el.dataset.section : '';
    if (sec && Object.prototype.hasOwnProperty.call(BY_SECTION, sec)) return BY_SECTION[sec];
    var key = norm(headingText(el));
    if (!key) return null;
    if (BY_TEXT[key]) return BY_TEXT[key];
    var stripped = key.replace(/\s*\d+\s*$/, '').trim();   // "Multiple Items Selected 3"
    if (BY_TEXT[stripped]) return BY_TEXT[stripped];
    for (var k in BY_CONTAINS) if (key.indexOf(k) !== -1) return BY_CONTAINS[k];
    return null;
}
var SELECTOR = 'h2, h4, label, .section-title, .set-section-label, .set-field-label, #settingsModal details.set-group > summary, .draw-menu-label, .stc-title, #inspector h3, .net-section-label';
function applyTips(root) {
    (root || document).querySelectorAll(SELECTOR).forEach(function(el) {
        if (el.dataset.tipped) return;
        var tip = tipFor(el);
        if (!tip) return;
        if (el.classList.contains('section-title')) el.title = tip + (el.parentNode && el.parentNode.querySelector && el.parentNode.querySelector('.section-actions') ? ' (Click to collapse or expand · right-click for actions.)' : ' (Click to collapse or expand.)');   // a title with no actions promises none
        else if (!el.title) el.title = tip;
        else return;
        el.dataset.tipped = '1';
        el.classList.add('has-tip');
    });
    // Inputs the dictionary knows by id get the tip too, so hovering the field itself helps
    Object.keys(BY_ID).forEach(function(id) {
        var f = document.getElementById(id);
        if (f && !f.title) f.title = BY_ID[id];
    });
}
var pending = null;
function schedule() {
    if (pending) return;
    pending = setTimeout(function() { pending = null; applyTips(document); }, 60);
}
applyTips(document);
new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
window.wpApplyTips = applyTips;
