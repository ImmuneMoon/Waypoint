# Waypoint — Campaign Integration Guide

Briefing for anyone (human or AI) generating campaign content for the Waypoint app in this folder. Waypoint is a local-first Electron app for TTRPG campaign management: node-based **data maps**, freeform **play maps** that mirror them, and document-style **planners**. All state lives in one JSON file.

**Current app version: 1.1.1** (2026-09-04, first tester-feedback release). What changed for authoring since 1.1.0 — details in the marked sections below:
- **Hex grid is FLAT-TOP** (changed 2026-09-05): a flat side faces up. A cell is **60 px wide × 52 px tall** (s = 30; columns 45 px apart, rows 52 px apart); cell centres sit at `x = 45q + 15, y = 52(r + q/2)` for integer q, r. Hex-sized items/tokens: `w: 60, h: 52`, positioned so their centre is a cell centre. Items saved at the old point-up size (`52 × 60`) are resized and re-seated automatically when the save loads, so old drops still work, but new drops should use the new size and lattice.
- **Tokens follow rooms**: dropping a character token on a `nodeId`-linked shape moves its `room.characters` entry into that room (see the caveat for hidden-presence NPCs).
- **Naming (1.1.1):** the app now calls the drawn scene the **Play Map** (it was "Whiteboard" in the UI). The save key is unchanged: map items still carry their scene in `whiteboard: [...]`. Player tokens also gained an optional `front` (0 top / 90 right / 180 bottom / 270 left — which side of the art is forward; a small gold arrow marks it) and turn in grid steps while a grid is on.
- Token extras (1.1.1): `status` = omitted (alive) | `"down"` (red X overlay) | `"dead"` (skull, darkened); `faceMode` = omitted (art turns with the facing) | `"arrow"` (only the front arrow turns).
- New play map fields: `lockRatio`; `color` on `text` items is the text color.
- Camera fallback for maps without `homeX/homeY` is the true center (15000, 15000).
- Rulers, grid opacity, minimap, units, zoom are per-user local prefs — never in `data.json`.
- The eraser now splits `path` items instead of deleting them, so a live board may hold many small `path` fragments; preserve them like any other item.

## Where things live

```
<this folder>/
  Waypoint.exe                     launcher (starts system\Waypoint-Core.exe)
  saves/data.json                  THE ENTIRE APP STATE — this is your integration target
  saves/images/<mapId>/<file>      images placed on whiteboards
  saves/backups/                   automatic launch snapshots of data.json (newest 10) — read-only for you
  system/app/                      frontend source (index.html, style.css, scripts/*.js)
  system/resources/app/main.js     Electron shell: HTTP server on port 3000 + /api endpoints
  system/userdata/                 Chromium profile + single-instance lock — never touch
```

## How to get data into the app

1. **Edit `saves/data.json` directly while the app is closed** (recommended for bulk work). The app loads it once at startup and autosaves over it (debounced ~500ms) constantly while running — anything you write while the app is open **will be clobbered**. The app enforces one instance per install (newest launch wins), so "closed" is easy to guarantee: check no `Waypoint-Core.exe` is running.
2. **POST the full state to `http://localhost:3000/api/data`** while the app runs — but the UI won't reload it until restart, and the app's next autosave overwrites you. Only useful with a restart right after.
3. **The in-app Import button** now offers **Merge or Replace**. Merge works by id: campaigns matched by id have their items merged (imported items overwrite same-id items, new items are added, everything else is kept); unknown campaign ids are added whole. This makes module-by-module handoffs possible: a merge file only needs `{activeCampaignId, campaigns: {<campId>: {id, name, activeItemId, items: {<only the new/changed items>}}}}`. Replace still discards all current data. Images still need to be placed in `saves/images/` manually.

   **Merge granularity is the whole item.** An item present in a merge file replaces the live item of that id *entirely* — do NOT emit sparse/partial items (e.g., a map whose rooms carry only `id` + `image`): everything the file omits inside that item would be lost. Every item in a merge file must be complete, built from a freshly re-staged copy of the live `saves/data.json`. (The app-side validation pass additionally applies union semantics for `image`/`portrait`/`ref` — a missing one of those never blanks a live value — but that backstop covers only those three fields.) Items you don't include are untouched, so the right way to keep a merge small is fewer items, not thinner ones.

   **The whole-item rule now also protects multiplayer state.** Live map items can carry player-assigned token ownership (`ownerId` on play map items, see below). Because you always build merge items from freshly staged live data, those fields ride along automatically — never strip fields you don't recognize from a live item.

4. **Zip bundle (new option): one file with images included.** The in-app Import also accepts a `.zip` containing `data.json` (a normal merge file) plus `images/<mapId>/<file>` entries. On Merge/Replace the app copies each image to `saves/images/<mapId>/<file>` at its exact path. For a drop that ships new art, you may deliver a single zip instead of a merge file + separate image placement instructions. Plain merge JSON handoffs remain fine.

Always keep a backup copy of `saves/data.json` before writing to it. (The app also snapshots it into `saves/backups/` on every launch, but make your own before a bulk write anyway.)

## Data schema (`saves/data.json`)

```jsonc
{
  "activeCampaignId": "camp_...",
  "campaigns": {
    "camp_...": {
      "id": "camp_...",
      "name": "Campaign Name",
      "activeItemId": "map_... or plan_...",   // which item opens on launch
      "players": {                              // OPTIONAL, app-managed multiplayer registry:
        "u_abc123": { "name": "Johann", "charName": "Johann Vekk" }
      },                                        // — carry it through untouched; never author or edit it
      "items": {                                // FLAT dict of maps and planners
        "<id>": { /* map or planner, below */ }
      }
    }
  }
}
```

**IDs**: any unique string works. The app generates `camp_<ms>`, `map_<ms>`, `plan_<ms>` (Date.now) and `r<6 random chars>` / `wb<...>` — when generating many items in one pass, do NOT use bare timestamps (collisions); use descriptive slugs like `map_manaan_ahto` — they're stable, readable, and valid.

### Map item

```jsonc
{
  "type": "map",
  "id": "map_...",
  "meta": {
    "title": "Ahto City — Living Map",
    "updated": 1788469008649,          // epoch ms
    "homeX": 15000, "homeY": 15000,    // camera spawn point (world coords)
    "parentId": "map_...",             // OPTIONAL: nests this map under another (any depth)
    "collapsed": false,                // sidebar tree fold state
    "gridType": "off",                 // whiteboard grid: "off" | "square" (50px) | "hex" — grids
                                       // always draw on top of content (gridFront is obsolete/ignored)
    "cellValue": 100, "cellUnit": "yd" // OPTIONAL measurement scale per grid cell (defaults: 1 yd/hex,
                                       // 5 ft/square; units: yd|ft|m|km|mi) — for space battles etc.
    // lastX/lastY/lastZoom, lastWbX/lastWbY/lastWbZoom: camera memory; omit, app fills them
  },
  "cats": {                            // node categories: key -> {label, color}
    "surface": { "label": "Surface · Public", "color": "#e0a54f" }
  },
  "rooms": [ /* data-map nodes, below */ ],
  "links": [ ["roomIdA","roomIdB"], ["roomIdC","roomIdD","route"] ],  // 3rd element "route" = dashed line
  "whiteboard": [ /* whiteboard items, below */ ]
}
```

### Room (data-map node)

```jsonc
{
  "id": "plaza",
  "name": "Central Plaza · Commerce Ring",
  "cat": "surface",                    // key into map.cats
  "x": 15357, "y": 15309,              // world coords (see coordinate system below)
  "notes": "GM-facing prose. Plain text (newlines ok, no HTML).",
  "characters": [ { "id": "c1", "name": "Drouth", "info": "Broker. Owes Gebbu.",
                    "portrait": "/saves/images/<mapId>/<file>",   // OPTIONAL: round thumbnail in the inspector + GM-note cards
                    "ref": "CAST/NPCs/Drouth.md" } ],             // OPTIONAL: free-text pointer to a dossier/sheet
  "targetMapId": "map_...",            // OPTIONAL: the warp target — dbl-click travels there
  "icon": "Stairs Down",               // OPTIONAL: one of "Stairs Up","Stairs Down","Door","Gate","Cave","Tower","Camp"
  "image": "/saves/images/<mapId>/<file>"  // OPTIONAL: per-room scene image — shown in the inspector,
                                           // as the GM-note card header, and as a hover-tooltip thumbnail
}
```

In-app behaviour to know about (1.1.1): when the GM sets a room `image` on a node that has **no** `targetMapId`, Waypoint creates a child map (parentId = this map, the image as a locked back-layer play map item at natural size, centered) and sets `targetMapId` + `icon: "Door"` on the node. Nodes you author with a `targetMapId` already are left alone. So if a drop ships a node with `image` but intentionally no linked map, expect the GM's first re-upload of that picture to spawn one; set `targetMapId` yourself when you want to control where the node leads.

**Landing rooms (1.1.1).** A warp lands the traveller on a ROOM of the target map, not just the map: the node's optional `targetRoomId`, else a room on the target map with the **same `id`** as the source node, else one with the same name (case/punctuation-insensitive), else the map's home. Your existing convention already works — `belasoffice` on both the complex and the cellblock now lands on the office. Keep doing that (shared id or identical name), or set `targetRoomId` explicitly when the landing room is named differently. Direct item portals accept `targetRoomId` too. Players sent through a portal arrive (and spawn) at the landing room's linked play map item.

`targetMapId` + `icon` power the **warp system**: the node shows the icon badge, double-clicking it (or any play map item linked to it) travels to the target map, and linked play map items automatically display the icon as a portal marker. Warp targets can be any map — nested child, sibling, anything.

### Play Map item (common fields + per-type)

Common: `id`, `type`, `x`, `y`, `w`, `h`, `color` (CSS color or `"transparent"`), `layer` (`"back"|"back-mid"|"middle"|"front-mid"|"front"` — all five stack distinctly), `rot` (degrees), `locked` (bool), `groupId` (shared string groups items), `nodeId` (links the item to a room id → hover tooltip with room info, portal behavior if that room has targetMapId).

More optional common fields:
- `opacity` — 0.1–1.0; below 1 renders translucent (fog, ghosts, terrain washes, spell areas).
- `hidden` — `true` shows players a grey placeholder cloud in multiplayer until the GM reveals it; the GM sees a ghosted version. Pre-hide ambushes, secret doors, and reveals when authoring.
- `aboveGrid` — `true` renders the item above the grid overlay (text items do this automatically).
- `gmNoteFor` (text items) — marks a GM-note card; never sent to players.
- `isChar` + `charName` + `charStats` — character token. `ownerId` (a player id) grants that player drag control in multiplayer; it is assigned by the GM in-app — don't author it, but DO preserve it on existing tokens (automatic if you build from staged live data).
- `lockRatio` — `true` keeps width/height proportional when the GM resizes (set it on portrait/token art you don't want squashed).
- `elevation` + `posture` — (1.4.6, character tokens) the token's height above the ground and its handbook ch. 9 posture. `elevation` is a free number in **yards** (a ledge at `3`, a catwalk at `5`, a pit at `-2`); `posture` is one of `"standing"` | `"crouching"` | `"sitting"` | `"kneeling"` | `"crawling"` | `"prone"` (lying prone) | `"supine"` (lying face up). **Omit both** for ground level / standing — the app deletes them when they are at the default, and a drop that omits them means exactly that. App-managed like `charStats`: the GM edits them in Properties or the token's right-click menu, a player may set them on their own token in a session (same permission line as moving it), and an attached ShadowBase sheet's `posture` seeds the token's. Whether they *show* is a viewer setting (⚙ Settings → Table: **Token elevation** and **Token posture**, both off by default, stored in `saves/preferences.json` — never authored in a drop); the values are kept either way. With Elevation on, the 💥 Blast tool measures each token's distance to a blast straight-line, height included (`d = √(h² + v²)`, h = hex distance in yards, one hex = one yard), and rulers between two tokens at different heights print the 3D figure too. Both fields are sent to players.
- `charRef` — (1.1.1) the `id` of a `room.characters[]` entry this token stands for. The app creates such tokens automatically when the GM adds a roster character (stand-in circle with initials, `type: "image"` once a portrait exists) and keeps name/portrait in sync through this id. When you author both a roster entry and its token, set `charRef` to the entry's id so the pairing survives renames; deleting the roster entry in-app deletes an unowned, sheetless token with that `charRef`.
- `name` — optional user label (≤60 chars) shown in the Elements list and Properties header; purely cosmetic (never used for matching — `charName` is what binds tokens). Author it on floors, walls, and props so the Elements list reads "Courtroom floor" instead of "Rect".
- On `text` items, `color` is the **text color** (not a fill) — `"transparent"`/unset renders the default light ink. Any CSS color works.
- `sheet` — an attached shadow-base.com character JSON (opaque to the app; never sent to players). Only set it by attaching in-app or copying from staged live data — never hand-edit its internals.

| type | extra fields |
|---|---|
| `rect` / `circle` / `diamond` | — |
| `hexagon` | flat-top hex; use `w: 60, h: 52` to fill exactly one hex grid cell (snaps by center to cells when Snap + hex grid are on). **Changed in 1.1.1** — the cell is now a whole 52 px wide (was 51.96; Chrome tiled the fractional grid with a cumulative drift). Existing 51.96-wide items still seat correctly by center; use 52 for anything new |
| `text` | `text` (HTML string, rendered raw); set `gmNoteFor: "<roomId>"` to mark it as a generated GM-note card (styled panel; regenerating updates in place). Styling (all optional, 1.1.1): `color` = text color; `bg` = box background (CSS color; omit for none); `font` = a standard Windows family name (e.g. `"Georgia"`, `"Consolas"`); `fontSize` px (default 16); `align` `"left"|"center"|"right"|"justify"` (default center); `valign` `"top"|"middle"|"bottom"` (default middle) |
| `image` | `src`: `"/saves/images/<mapId>/<filename>"` — put the file there yourself |
| `path` | freehand/line drawing: `pts` [[x,y],...] relative to item, `baseW`/`baseH` (set = w/h), `strokeWidth`, `color` |
| `trigger` | `eventMessage` — fires a dialog when an item with `isChar:true` is dropped inside its bounds. `shape` (1.1.1): `"rect"` (default) / `"circle"` / `"diamond"` / `"hexagon"`; hexagon with `w: 60, h: 52` fills exactly one hex grid cell |

Direct portals (1.1.1): any non-text item may carry `targetMapId` (a map id) and an optional `portalIcon` (`"Door"`, `"Stairs Up"`, `"Stairs Down"`, `"Gate"`, `"Cave"`, `"Tower"`, `"Camp"`). It then behaves exactly like an item linked to a warp room — portal marker, double-click travel, player drop-through — without needing a node. Prefer this for "back to the parent map" exits on nested maps; keep node-based portals where the room should also carry notes/characters.

Character tokens: any non-trigger item with `isChar: true`, `charName`, `charStats` (hover tooltip shows them). **Keep `charName` byte-identical for the same character everywhere** — multiplayer adopts/spawns a player's token by exact `charName` match against the campaign's `players` registry, so "Johann Vekk" and "Johann  Vekk" are different people to the app. Tokens imported from shadow-base.com JSON are `52×60` with the sheet's portrait as art.

**Tokens follow rooms (1.1.1).** When a character token is dropped so that its center lands inside a play map item that has a `nodeId`, the app moves the character's `room.characters` entry into that room — matched by `charName` against `characters[].name`, case-insensitive and whitespace-trimmed — removing it from any other room on the same map, or creating a bare `{ id, name, info: "" }` entry if none existed. This runs on the GM's own drops and on player drops that arrive over the network. Consequences for authoring:
- Give the floor of each room its own linked shape (`rect`/`path`/`image` with `nodeId`) and the data map will track who is where without GM bookkeeping. Nested linked shapes resolve to the **smallest** one containing the token's center.
- The room's `characters[].name` and the token's `charName` must agree (same spelling; case doesn't matter) or you'll get a duplicate entry with the token's spelling.
- **Hidden-presence pass caveat:** room `characters[].name` IS sent to players. If an NPC you moved into tagged notes (drop 7) also has a token on the board, dropping that token onto a linked floor re-creates a visible `characters` entry for it. Either keep such NPC tokens off linked floors until the reveal, or mark the token `hidden: true` — hidden tokens the GM drags still trigger the move, so prefer un-linked staging areas for lurking NPCs.
- Player-side dossier privacy is unchanged: only `name` (and `portrait`) travel; `info`/`ref` never do.

### Planner item (document pages)

```jsonc
{
  "type": "planner",
  "id": "plan_...",
  "meta": { "title": "Module 3 — Session Plan", "updated": 0,
            "parentId": "plan_..." },   // OPTIONAL: planners nest under planners, exactly like maps
                                        // (sidebar tree, drag-to-nest, breadcrumb, collapse state)
  "blocks": [ /* rendered top-to-bottom */ ]
}
```

Preferred structure: **break each module into small per-section planners nested under a module parent** (e.g., "Module 3" parent → "2.1 Arrest and Custody", "2.2 The Trial Opens", ... children) rather than one monolithic planner per module. Nesting is same-type only — a planner can't be parented to a map or vice versa.

Block types (exact fields):
- `{ "type": "h1", "title": "...", "sub": "..." }` — page title + subtitle
- `{ "type": "h2", "title": "..." }` — section header
- `{ "type": "lede" | "oneline" | "text" | "flare" | "callout", "content": "..." }` — prose; **HTML allowed** in `content` (`<b>`, `<br>`, etc.). `lede` = large intro, `oneline` = boxed summary, `flare` = violet-edged aside, `callout` = gold-edged italic box
- `{ "type": "raw", "content": "<any html>" }`
- `{ "type": "diagram", "content": "<mermaid code>" }` — rendered by mermaid 10.9.1 (**needs internet**; loaded from CDN)
- `{ "type": "node", "title": "...", "tag": "...", "must": "...", "cols": ["Check", "DC", "On success"], "rows": [{ "col1": "...", "col2": "...", "col3": "..." }] }` — titled table (the app's signature "node box"). `cols` is OPTIONAL (1–4 header strings; the table renders exactly that many columns, rows use col1..colN); omit it for the default Action / Why / Cost / Returns via
- `{ "type": "flowchart", "nodes": [{ "id": "n1", "text": "...", "shape": "rect|rounded|pill|diamond|hex", "color": "gold|blue|green|red|violet|neutral" }], "edges": [{ "from": "n1", "to": "n2", "text": "", "style": "solid|dotted" }] }` — builder that compiles to mermaid

## Multiplayer-aware authoring (what players can and cannot see)

Waypoint now runs GM-hosted P2P sessions: players join with a room code, follow the GM's map, and receive a **sanitized** copy of the campaign. The host strips GM-only content before anything leaves the machine. Author with this split in mind:

**Never sent to players** (safe for spoilers, secrets, GM prep):
- Planners — entire items, never transmitted.
- `room.notes` and `room.characters[].info` / `.ref`.
- Text items with `gmNoteFor`.
- The content of `hidden` play map items (players get a position-only grey stub until revealed).

**Sent to players** (player-safe wording only):
- Room **names**, categories, node layout, links, warp icons.
- All visible play map content: shapes, images, text items without `gmNoteFor`, token names and `charStats` tooltips, token `elevation` / `posture` (1.4.6; the GM's Settings → Table switches decide whether players see the chips), `room.image` scene art and character `portrait`s (shown in hover tooltips of linked items).

Practical rules: put twists and DC tables in `room.notes` or planners, never in a visible text item or a room name ("Ambush Corridor" spoils itself); pre-set `"hidden": true` on reveal items; give every PC token a consistent `charName` so player control binds correctly. In-session the GM can pause the table, whisper, and pin the table to a map — none of that needs authoring support.

## Coordinate system

Both canvases are 30,000 × 30,000 world units; **cluster content around the center (≈15,000, 15,000)** and set `meta.homeX/homeY` to the cluster's center so the camera opens on it (a map with no `homeX/homeY` now opens at the true center 15000,15000 rather than 0,0). Rooms are ~118–190px wide cards. The play map square grid is 50px cells (a 50×50 token fills one cell); the hex grid is a 52×90 px tile of flat-top hexes, radius 30: cell centers at `x = 52·(col + row/2)`, `y = 45·row + 15` (so row 0 centers at y=15, x=0/52/104…; row 1 at y=60, x=26/78/130…); vertices at x multiples of 26, y of 15. Place authored hex tokens by their **center** on that lattice: `x = cx − 26, y = cy − 30`. Room and play map coordinates are **independent spaces** — a play map is a freeform visual companion to its map's data view, typically a drawn floorplan with tokens.

## Conventions the app's features expect

- **Nesting**: build the location hierarchy with `meta.parentId` (world → region → city → building → room, any depth). The sidebar renders it as a tree; a breadcrumb appears on nested maps. Don't create parentId cycles (the UI prevents them; hand-written JSON must too).
- **Warping**: for every "exit" in a location, prefer a room with `targetMapId` + a fitting `icon`, then (optionally) a play map shape with `nodeId` pointing at that room — that gives the GM a clickable portal on the visual board.
- **Room notes & characters** feed the play map: selecting a linked item shows the room inspector, and a "Generate GM Notes" button builds a text card from `notes` + `characters`. Rich per-room content pays off. Linked shapes also drive the token→room tracking described under Play Map items.
- **Measuring rulers are not saved** — they're per-session overlays; don't try to author them.
- **Viewer preferences are not in the save**: grid opacity, rulers on/off, minimap, units, and zoom all live in each user's local storage. Never write them into `data.json`.
- **Data-map "Clear the board"** exists in-app now (rooms + links wiped with confirmation, undoable). If a manifest asks for a map to be emptied, the GM can do it in one click — you don't need to ship an empty-map merge.
- **Categories** are per-map. Reuse a consistent palette across maps for the same concepts. (1.1.1) The campaign object may carry `catLibrary: { "<libId>": { label, color } }` — the GM's saved palette, matched to map categories by label (case-insensitive). If you ship a consistent palette, also write it into `catLibrary` so the GM can add it to new maps with one click; never remove entries the GM saved.
- **Dark theme**: play map background is near-black (#15151c). Use light stroke colors for `path` items and legible colors for shapes.

## Suggested mapping for “Shadows of the Mandalorian War”

- Campaign **modules / session outlines** → planners (h1 + h2 sections, node blocks for encounter tables, flowcharts for branching outcomes, callouts for read-alouds).
- The **Campaign Story Map** HTML → a top-level data map ("The Long Arc") whose nodes warp into per-location maps.
- **Locations** (Ahto City, Kashyyyk, the Vertical Slum...) → nested map trees; the existing "Ahto City — Living Map" in `saves/data.json` is a good reference for tone and density.
- **CAST / Character Roster** → `characters` arrays on the rooms where they're found (name + a 1–3 sentence `info`).
- **Player Handouts** → images in `saves/images/` placed on play maps, or `raw` planner blocks.
- **Dialogue Trees** → `flowchart` planner blocks.

## Testing protocol

A second AI session works in this folder (see the app dev history). It tests candidate data against a sandboxed copy of the app without touching real saves. To hand off work for testing: write the generated state to a new file (e.g., `saves/candidate-data.json` or a path you announce) rather than overwriting `saves/data.json`, and it can be validated, screenshotted, and merged from there. A drop that includes new art may instead be a single `.zip` (merge-file `data.json` + `images/<mapId>/<file>` entries, per option 4 above) — announce the path the same way.
