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
    wbElev: 'Height above the ground in yards — a ledge at +3, a catwalk at +5, a pit at −2. Shown as a chip on the token; the blast tool measures straight-line, height included.',
    wbPosture: 'Standing, crouching, sitting, kneeling, crawling, lying prone or lying face up (handbook ch. 9). Shown as a chip on the token; an attached ShadowBase sheet seeds it.',
    blastFt: 'The weapon\'s area-effect radius in feet (handbook ch. 11); divided by three for yards on the map.',
    blastElev: 'How high the blast goes off, in yards. Starts at the height of the token in the landing cell, else the ground.',
    wbNodeLink: 'Ties this item to a data-map room: hovering shows the room, a room with a Linked Map makes this a portal, and tokens dropped on it move into that room.',
    lkType: 'How the line is drawn: a plain path, a dashed route, a dotted secret way, or a one-way arrow.',
    lkLabel: 'A short name for this connection, drawn on the line. Players see it.',
    lkNotes: 'What travelling this way involves. GM only — never sent to players.',
    wbTextOpacity: 'How solid the words are, from 10% to fully opaque. The background keeps its own setting.',
    wbBgOpacity: 'How solid the box behind the words is, from invisible to fully opaque. The words keep their own setting.',
    wbLockRatio: 'Keep width and height in proportion when resizing (Shift while dragging does the same).',
    wbStrokeWidth: 'Thickness of the stroke, in board pixels.',
    wbStrokeWidthNum: 'Thickness of the stroke, in board pixels.',
    wbRot: 'Rotate the item. Dragging the blue handle above it on the canvas does the same.',
    wbRotNum: 'Rotation in degrees.',
    wbStatus: 'Alive shows nothing; Incapacitated puts a red X over the token; Dead adds a skull and darkens the art. Also in the right-click menu.',
    wbFaceMode: 'Turning a token can rotate the whole picture, or just move the arrow around an upright picture.',
    wbFront: 'Which side of the art is the token\'s front. The small arrow marks it and always points across a cell face at a neighbouring cell.',
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
    netCodeInput: 'The six-character code your GM gave you.',
    netJoinPassInput: 'Only needed if the GM set a session password.',
    elementSearchInput: 'Filter the list by name.',
    newDocBtn: 'A new handbook page: rules or reference your players can read at the table.',
    searchDocsBtn: 'Find a page by name.',
    collapseAllDocsBtn: 'Collapse or expand every nested page.',
    docPlayersBtn: 'Whether players at your table receive this page. Off while hosting removes it from them at once.',
    exportDocsBtn: 'Every handbook page in this campaign as one file (pictures bundled).',
    plannerFromFileBtn: 'A new planner from a Markdown file (pick its pictures with it, or a zip of both). A preview shows every block first.',
    docFromFileBtn: 'A new handbook page from a Markdown file (pick its pictures with it, or a zip of both). A preview shows every block first.',
    plannerImportBtn: 'Append a Markdown file to this document, with a preview of every block first.',
    exportMdBtn: 'The open planner or page as Markdown; with pictures, a zip.',
    helpMdTemplateBtn: 'A page in the import format to start from.',
    imgLibBtn: 'This campaign\'s pictures, with Shared, Unfiled and every campaign\'s a chip away; Import from another campaign… brings pictures in without copying them.',
    imgLibSource: 'Whose pictures to pick from: another campaign, Shared (the tutorial art) or Unfiled.'
};

var BY_TEXT = {
    'data node': 'A room, location, or scene on the data map. Everything below describes it.',
    'categories': 'The color-coded kinds of place on this map (surface, detention, exchange…). Add your own; reusing the same palette across maps keeps things readable.',
    'characters': 'Who is here. Names (and portraits) are shown to players; the info and reference fields stay GM-only. Tokens dropped on a floor shape linked to this room move their character in automatically.',
    'multiple items selected': 'Actions that apply to everything selected. Ctrl/Shift-click adds to a selection; dragging a box on empty board selects an area.',
    'layering all selected': 'Stacking order for the whole selection — five layers from Back to Front.',
    'text box': 'A block of text on the board. Double-click it on the canvas to edit the words; style it below.',
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
    'fill color': 'Fill for the shape — tints let the map show through. Custom wheel at the end.',
    'alignment': 'Where the text sits inside its box: left / center / right / justified, and top / middle / bottom.',
    'text alignment': 'Where the text sits inside its box. Horizontal: left / center / right / justified. Vertical: top / middle / bottom.',
    'box background': 'A backdrop behind the text so it reads over busy art. None keeps it transparent.',
    'shadowbase sheet shadow base com': 'A character sheet from shadow-base.com attached to this token: view it at the table, or export a site-ready file with this token’s art as the portrait.',
    'player owner can move this token': 'The player allowed to drag this token in multiplayer.',
    // sidebar
    'planners': 'Document pages: session plans, encounter tables, flowcharts, notes. Nest them under each other. Never sent to players.',
    'handbook': 'Rules and reference pages for your table. Players read the pages you leave open to them, in a panel over the map; a page can be GM only.',
    'maps': 'Your locations. Each map has a data view (rooms and links) and a play map (the drawn scene). Drag one onto another to nest it.',
    'campaigns': 'Separate games, each with its own maps and planners.',
    // settings
    'profile': 'How you appear to others at a multiplayer table.',
    'table': 'Board preferences — units, rulers, grid opacity. Yours alone: in multiplayer every player keeps their own. The VTT features (elevation, posture, minimap, sound, dice, character sheets) have their own section below, set per campaign.',
    'vtt features': 'Elevation, posture, the minimap, sound, dice and character sheets, per campaign. In a session the GM\'s campaign settings are the most a player sees; a player can switch a feature off for themselves at that table, never on.',
    'vtt integration': 'The master switch for this campaign. Off means the plain whiteboard — every VTT feature is off and hidden; the per-feature choices are kept for when it goes back on.',
    'this campaign': 'The VTT features of the campaign on screen. Saved with the campaign; while hosting, a change reaches the table at once.',
    'this table': 'What the GM runs this table with. Turn a feature off for yourself here; you cannot turn on one the GM has off, and nothing here changes your own defaults.',
    'token elevation': 'A height in yards on every character token, shown as a chip; the blast tool and rulers then measure straight-line, height included. Off hides the chips and keeps the values.',
    'token posture': 'Standing, crouching, sitting, kneeling, crawling, prone or face up on every character token, shown as a chip. Off hides the chips and keeps the values.',
    'default for new campaigns': 'What a campaign starts with when you create it. Changing this touches no existing campaign — "Apply to existing campaigns…" copies it onto the ones you tick.',
    'advanced': 'Defaults for new items, the developer console, snapshots and resets. Nothing here touches your campaigns: Reset Local Preferences clears your VTT default and per-table choices, never a campaign\'s own settings.',
    'display name': 'How other players see you in the roster and chat.',
    'measurement system': 'Units for the measure tool: yards/feet/miles or meters/kilometers.',
    'minimap': 'The small overview map in the corner of the board — a VTT feature, set per campaign; the ▾ on the box itself only folds it away.',
    'sound': 'Ambient loops and one-shot cues from the Sound panel on the play map, heard by every player at the table. Off silences the table for this campaign and hides the panel; the library keeps its files.',
    'dice': 'Rolls at the table: /roll in Table Chat and the roller beside it. The GM\'s machine makes every roll and everyone sees the same card. Off for the campaign, nobody rolls at its table.',
    'character sheets': 'The campaign\'s system (attributes, formulas, rolls) and the sheets built on it. Off for the campaign, the system stays yours to edit but nothing of it shows at the table.',
    'stream window': 'A second window with only the play map, as players see it, for screen-sharing. Silent unless the box below is ticked.',
    'coordinate rulers': 'The number strips along the top and left edges of the board.',
    'grid opacity': 'How strongly the grid draws over the map. Only on this computer — other players pick their own.',
    'default opacity for new items': 'Transparency new shapes, drawings and images start with.',
    // multiplayer modal
    'host be the gm': 'Run the table from this computer. Players connect to you with a room code; your planners, notes, and dossiers never leave this machine.',
    'join be a player': 'Enter a GM’s room code to sit at their table. You see their map and move only the tokens they assign you.',
    'campaign being hosted': 'The campaign players will join.',
    'players arrive at': 'Where joining players land: their own last map (Player\'s last location), the map you are on (Follow me), or a pinned map.',
    'new players start at': 'Where someone joining this campaign for the first time lands — with you, or parked on a map of your choice.',
    'session password optional': 'An extra lock in case the room code leaks.',
    'room code': 'Send this to your players. It changes every session you end on purpose.',
    'player history bans': 'Everyone who has ever joined this campaign, and who is banned from it.',
    // tool menus
    'pen style': 'Freehand sketching, or straight lines from point to point.',
    'pen color': 'Color for new strokes.',
    'stroke size': 'Thickness of new strokes.',
    'opacity': 'Transparency of new strokes.',
    'eraser size': 'Radius of the eraser — the circle around your pointer shows it.',
    'eraser mode': 'Precise trims strokes exactly to the circle; Segments removes each point-to-point piece it touches.',
    'map scale per grid cell': 'What one grid cell represents on this map — 5 ft for a dungeon, 100 yd for a battlefield, 2 km for a region.',
    'new shape size': 'Free: click for the default size, drag for an exact box. Grid cell: every new shape is exactly one cell and seats into it.',
    'new item opacity': 'Transparency new shapes, drawings and images are created with.',
    'font': 'Typeface for this text box.',
    'text size': 'Text size in pixels.',
    'pen size': 'Thickness of the stroke.',
    'layer': 'Which of the five stacking layers this sits on.',
    'rotation': 'Rotate the item; the blue handle on the canvas does the same.',
    'link node': 'Tie this item to a data-map room (hover info, portals, room tracking).',
    'name': 'The name shown in lists and on hover.',
    'category': 'The kind of place this is; categories give nodes their color.',
    'linked map': 'Makes this node a portal to another map.',
    'node icon': 'A badge hinting at what kind of exit or place this is.',
    'notes room details': 'GM-only text. Never sent to players.'
};

var BY_CONTAINS = {
    'data map': 'The node-and-link view of this map: rooms as cards, lines as connections. The play map is the drawn version of the same place.',
    'layer': 'Which of the five stacking layers this sits on — Back is drawn first, Front last.'
};

function norm(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function headingText(el) {
    var clone = el.cloneNode(true);
    clone.querySelectorAll('button, input, select, .muted, [data-tip-ignore]').forEach(function(n) { n.remove(); });
    return clone.textContent;
}
function tipFor(el) {
    var forId = el.getAttribute && el.getAttribute('for');
    if (forId && BY_ID[forId]) return BY_ID[forId];
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
        if (el.classList.contains('section-title')) el.title = tip + ' (Click to collapse or expand.)';
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
