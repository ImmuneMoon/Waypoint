# Waypoint — Improvement Notes

Running list of usability and operability problems worth fixing. Each entry: what happens, why it matters, where it lives in the code, and a suggested direction. Started 2026-09-16 against app version 1.4.8.

Sources are marked **[user]** (reported from ordinary use) or **[automation]** (hit while driving the app headlessly through the built-in browser pane; these bite a human less but still point at real gaps).

---

## 1. Hover info boxes can be larger than the window **[user]** — ✅ FIXED 2026-09-17

**What happens.** Hovering a linked play-map item (or a token) pops an info card. When the underlying room carries a scene image, long GM notes, or several characters, the card grows past the edges of the window and gets clipped, so it is useless — you cannot read the part that ran off screen.

**Why it matters.** The hover card is the fastest way to check what a node is without selecting it. A card that overflows defeats the feature and looks broken.

**Root cause.**
- The card is a full `.room` (or character) card built in `system/app/scripts/whiteboard.js` on `pointerenter` (~line 285 onward) and shown via `#wbTooltip`.
- `#wbTooltip .room` (`system/app/style.css:443`) resets the card to `position: relative` and scales it `1.05`, but nothing caps its **height**, and the base `.room` only caps width at `max-width: 190px` (`style.css:186`) — the scene image and notes stretch it vertically without limit.
- The `pointermove` handler (`whiteboard.js` ~line 429) repositions the card to keep it on screen (flip left when near the right edge, flip up when near the bottom), but that is **position only** — a card taller than the viewport still overflows, and flipping it "above" the pointer pushes its top (the name/header) off the top edge.
- `#wbTooltipContainer` is `overflow: hidden` (`style.css:525`) so the excess is clipped, and the tooltip is `pointer-events: none`, so it cannot be scrolled either.

**Suggested direction.**
- Cap the tooltip: `max-width` ~320–360px and `max-height: calc(100vh - 24px)`; thumbnail the scene image (`max-height` ~160px, `object-fit: cover`) and clamp notes (a few lines with a fade, or a fixed max-height).
- After the flip logic runs, clamp final `top`/`left` into the viewport so the header is never pushed off-screen (`top = max(8, ...)`), for the case where the card is simply bigger than the space in that direction.
- Consider a compact hover summary — name, category chip, small thumbnail, first line or two of notes — and leave the full detail to the Properties panel, which already shows everything on select.

**Fixed 2026-09-17.** `#wbTooltip .room` now caps `max-width:320px`, `max-height:calc(100vh - 120px)`, `overflow:hidden`, `overflow-wrap:anywhere`, plus the scene image `max-height:120px; object-fit:cover` (`style.css:444`). The `pointermove` positioner (`whiteboard.js` ~440-441) now flips near the right/bottom edge **and** clamps the final `left`/`top` into the *visible content range* — accounting for `#whiteboardWrap.scrollLeft/scrollTop`, which the board actually uses to pan — then caps the card's height to the space below its top, so a tall card (or one whose thumbnail hasn't loaded yet) can never spill past the board. (The earlier "`#wbTooltipContainer` clips the excess" was a red herring: that selector is an orphan with no matching element; the real clip box is `#whiteboardWrap`, `overflow:hidden`.) Verified in the sandbox: the card stays fully inside the board at all four corners and centre.

---

## 2. No zoom-to-fit / frame-content control **[automation]** — ✅ FIXED 2026-09-17

**What happens.** There is no "fit all" or "frame selection" action. On a large map (e.g. the new Ahto City area overview) it is impossible to see the whole thing at once; you zoom out one click at a time and still cannot frame it.

**Why it matters.** Any map bigger than the viewport — overview maps especially — is awkward to review or screenshot. This is the single biggest navigation gap.

**Suggested direction.** Add a "Fit to content" button (and a keyboard shortcut, e.g. `Shift+1`) that computes the bounding box of all items and sets zoom/pan to frame it with a margin; optionally a "Frame selection" for the current selection. The minimap already knows the content bounds, so the math is available.

**Fixed 2026-09-17.** The 🎯 Center menu already had *Center on Items*, but it only **panned** — it never changed zoom, so anything larger than the screen still ran off the edges. Added `fitView(selectionOnly)` in `system/app/scripts/main.js` (exposed as `window.wpFitView`): it walks the same item bounding box as Center-on-Items, computes a fit-zoom `min(clientW/(bw + 2·pad), clientH/(bh + 2·pad))` (pad = 80 world units, clamped 0.1–4), calls `setZoom`, then centres the box (scroll written **after** setZoom, which re-anchors on the old view). Wired to a new **Fit to Content** item in both the data and play Center menus (`dataFitBtn` / `wbFitBtn`) and to **Shift+1** in `io.js` — placed *above* the spectator guard so players can frame too, and matched via `e.code === 'Digit1'` because Shift makes `e.key` the shifted glyph (`!`). Frames the selection if there is one, else the whole map. Guards a 0-size viewport (leaves the camera alone). Verified in the sandbox: zoom 0.575 on a normal map from all three entry points (button, Shift+1, direct), and the correct 0.1 clamp on the 13382×7710 Ahto-City overview. Documented in the interactive tour and the Help modal.

---

## 3. Scroll zooms; panning needs the hand tool **[automation]** — ✅ FIXED 2026-09-17

**What happens.** Scrolling the canvas changes the zoom level instead of panning. To move around you must switch to the hand tool, and it is easy to instead start a drag that selects an item.

**Why it matters.** Scroll-to-pan is the reflex in most canvas apps; scroll-to-zoom with no easy pan makes moving around fiddly and error-prone.

**Suggested direction.** Support space-drag panning and/or middle-mouse panning that works regardless of the active tool, so you can pan without leaving select mode or risking a stray selection. (Keep scroll-to-zoom if preferred, but pair it with a modifier-free pan.)

**Fixed 2026-09-17.** The premise was partly stale: **middle-drag pan** and **Shift+wheel scroll** already existed (plus the hand tool), all in `datamap.js`'s `attachPanning`. The real remaining gap — a *left-button* pan for trackpads and two-button mice without leaving Select/Move — is now **hold-Space + drag** (Figma/Photoshop-style). Added in `datamap.js`: a `window.wpSpacePan` flag armed on `keydown`/disarmed on `keyup`+`blur` (guarded against typing, focused controls, and open modals so Space is never hijacked); an early pan-start in `attachPanning`'s pointerdown that reuses the existing pan closure (`isPanning/startX/startY/scrollLeft/scrollTop`); the item-drag guard extended to `if (window.isPanMode || window.wpSpacePan) return;`; and a `body.space-pan` grab/grabbing cursor in `style.css`. Verified in the sandbox: the pan scroll tracks the pointer delta exactly, an item under the pointer neither moves nor selects during a space-pan, and Space typed in an input does not arm it. Documented in the tour and Help.

---

## 4. Selecting an item reflows the canvas and shifts the toolbar **[automation]** — 🟡 DEFERRED (recommendation 2026-09-17)

**What happens.** Selecting anything opens the right Properties panel, which narrows the canvas and pushes the bottom toolbar sideways. A drag that was meant to pan can land on an item, select it, and trigger this shift.

**Why it matters.** For anything driven by screen coordinates, every selection invalidates the positions you just measured. For a human it is a layout jump mid-interaction.

**Suggested direction.** A non-destructive pan mode (see #3) removes most accidental selections. Separately, consider overlaying the Properties panel rather than reflowing the canvas, or animating it in without moving the toolbar, so the play surface stays put when a panel opens.

**Recommendation 2026-09-17 — defer.** The in-flow panel is load-bearing: it guarantees the selected item is never hidden behind the panel, and it keeps every board hit-test correct (they read `#whiteboardWrap`'s live `getBoundingClientRect`) with zero JS changes. Crucially, this note's own worst case — *a pan attempt lands on an item, selects it, and triggers the shift* — is exactly what **#3 just fixed** (hold-Space / middle-drag pan without selecting). For a *deliberate* selection the reflow is a standard pattern, and each alternative is worse: a full **overlay** covers the right ~320px of board on every selection (you'd routinely select a token near the right edge and lose it behind the panel — space-pan mitigates but doesn't eliminate); **animating** the 30000×30000 board's width/flex-basis risks per-frame relayout jank; **pinning** the bottom toolbar can leave it misaligned over the now-narrower canvas (today it tracks the visible board centre, which is arguably correct). So: lean on the pan fix and leave the panel. Revisit only if it still bites in real play — and if so, the overlay is now more palatable because space-pan can recover whatever it occludes.

---

## 5. Minimap overlay covers the top-left corner of the canvas **[automation]** — ✅ FIXED 2026-09-17

**What happens.** The minimap sits in the top-left corner on top of the canvas and covers whatever content is there (e.g. the north-most area thumbnail on the overview).

**Why it matters.** Content under the minimap is hidden and hard to reach without moving the camera.

**Suggested direction.** Let the minimap be repositioned or collapsed, and/or make it semi-transparent until hovered, so it never permanently hides a corner of the map.

**Fixed 2026-09-17.** Most of this already existed: the minimap is collapsible (`#minimapToggle`, persisted to `localStorage`, mirrored by a Settings → Table toggle) and it auto-repositions into the corner when rulers are off. The one genuine gap — *dim-at-rest so it stops opaquely hiding the corner* — is now a CSS-only fade in `style.css`: `#minimap { opacity:0.5; transition:opacity .15s ease; }`, returning to full opacity on `:hover` / `:active` (viewport drag) and while collapsed. Also corrected a stale Help line that called the minimap "bottom-right corner" when the CSS places it top-left. Verified in the sandbox: computed rest opacity 0.5, full on interaction.

---

## 6. No stable way to read app state from the page **[automation]** — ✅ FIXED 2026-09-17

**What happens.** There is no documented global for reading current state. `window.wpNet` is exposed (an object), but the campaign, active map, and item list are not reachable from the page in a predictable way.

**Why it matters.** Verifying that a change landed, or scripting checks, means falling back to reading `saves/data.json` off disk instead of asking the running app what it currently holds.

**Suggested direction.** Expose a read-only accessor, e.g. `window.wpDebug.getState()` returning the live app state (or at least `{ activeCampaignId, activeItemId, mapIds }`), gated behind the dev server / a debug flag so it does not ship enabled in the packaged app if that is a concern.

**Fixed 2026-09-17.** Added `window.wpDebug.getState()` in `system/app/scripts/main.js` (at the window-export tail), returning a read-only snapshot computed at call time: `activeCampaignId`, `activeItemId`, `mapIds`, `plannerIds`, `viewMode`, `zoomLevel`, `selId` / `selWbId` / `selWbIds` (copied), `netRole`, and `version` — ids and primitives only, no live object refs to mutate. Left **unconditional**, consistent with the existing sandbox testing hooks that already ship (`wpSpawnTokenForCharacter`, `wpCreateMapFromRoomImage`, …); it only reads, so it is harmless in the packaged app. Dev/automation-only, so no tour or Help entry. Verified live: returned an accurate snapshot (active campaign, active item, 35 map ids, 23 planner ids, view/zoom/selection) from the running app.

---

## 7. A running tab autosaves over on-disk writes, with no in-app reload **[automation]** — ✅ FIXED 2026-09-17

**What happens.** The dev server serves `data.json` fresh, but an open app tab autosaves (~500ms debounce) and clobbers any external write to that file. To swap in a rebuilt save you must stop the server, write the file, and restart so the UI loads the new data.

**Why it matters.** Scripted data swaps (bulk edits, merges, regenerated saves) are unsafe against a live tab; the stop/write/restart dance is the only reliable path.

**Suggested direction.** An in-app "Reload from disk" action (or an API endpoint that tells the open UI to re-read the on-disk `data.json` and re-render without a full restart), so a rebuilt save can be picked up without racing the autosave. The existing Import flow is close but goes through a file picker rather than re-reading the current save file.

**Fixed 2026-09-17.** No new endpoint was needed — `GET /api/data` and the front-end `load()` path already exist and are exercised at startup and on multiplayer disconnect. Added `window.wpReloadFromDisk()` in `system/app/scripts/io.js` = `clearTimeout(saveTimeout); load();`. Clearing the pending debounce **first** is the crux: it stops the queued in-memory POST from re-clobbering the file you just read, so disk wins. Shipped as a **dev accessor only** (no Settings button, by decision — invoke it from the console or a rebuild script). Verified end-to-end in the sandbox: an external write to `data.json` that the open tab ignored was picked up in-memory after `wpReloadFromDisk()`. A future user-facing "Reload from disk" button in Settings › Advanced (session-guarded) can wrap the same accessor if wanted.

---

## 8. (Environment, not the app) Image reads open stray tabs in the shared pane **[automation]**

**What happens.** When automated helpers read image files (e.g. the map diagrams), each opens as its own local-file tab in the same browser pane the app runs in, cluttering the view until closed.

**Why it matters.** Minor, and it is a harness/browser-pane behavior rather than a Waypoint bug — noted only because the app and those file reads share one pane during automated work.

**Suggested direction.** None on the app side; recorded for completeness.

---

## 9. Small token drags don't commit at high zoom **[user]** — ✅ FIXED 2026-09-17

**What happens.** At higher zoom (2x-4x) a character token feels hard to "grab": you pick it up and nudge it a little, but the move doesn't take — the token snaps back to feeling unmoved / unsaved. At default zoom it's fine.

**Why it matters.** Positioning tokens is the core play-map interaction; if small moves silently fail when zoomed in (exactly when you're placing precisely), the board feels broken.

**Root cause.** In `attachDrag` (`system/app/scripts/datamap.js`, pointermove ~line 790) the click-vs-drag "moved" threshold was tested against `dx`/`dy` that had **already been divided by `state.zoomLevel`** (i.e. world px). Since world = screen ÷ zoom, the effective slop was `3 × zoom` screen px: 3px at 1x but 12px at 4x. Any drag shorter than that stayed classified as a *click*, so on pointerup it skipped the whole commit path (snap/hex-seat/save/stream) and only re-selected — leaving the token nudged a few px off-cell, unseated and unsaved.

**Fixed 2026-09-17.** The threshold is now measured on the raw **screen** delta (`e.clientX - startX` / `e.clientY - startY`) so it stays a constant 3px at any zoom; `dx`/`dy` remain divided by zoom for the position math (1:1 pointer tracking is unchanged). Shared with data-map room drags too, which also benefit (fewer accidental room moves when zoomed out).

---

## 10. Tokens become ungrabbable at low zoom (~35% and below) **[user]** — ✅ FIXED 2026-09-17

**What happens.** Zoom out to about 35% or lower and tokens can no longer be moved — clicking a token to drag it does nothing.

**Why it matters.** Low zoom is exactly when you're arranging the board / seeing the whole map, so losing the ability to move tokens there is crippling.

**Root cause.** `attachDrag` pointerdown (`system/app/scripts/datamap.js:668`) reserved a **fixed 15 *screen*-px** bottom-right square as a resize-handle dead-zone (`if (e.clientX > rect.right - 15 && e.clientY > rect.bottom - 15) return;`). `rect` is post-transform, so at 35% a 60×52 token renders ~21×18px and that 15px zone covers most of it (verified: the token's *center* fell inside the dead-zone), so almost every click bailed out before starting a drag. Below ~29% the zone covers the token entirely.

**Fixed 2026-09-17.** The handle is now scaled to the item's on-screen size and capped: `var hz = Math.min(15, rect.width * 0.33, rect.height * 0.33);`. It stays 15px at normal/high zoom (unchanged resize affordance) and shrinks proportionally when the token is small, so the token stays grabbable. Verified at 0.35 zoom: a synthetic drag from the token's center now moves and commits (before it was blocked).
