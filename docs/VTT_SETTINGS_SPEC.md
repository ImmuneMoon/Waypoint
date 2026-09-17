# VTT Settings & Feature Toggles — spec + session handoff

Status: **NOT STARTED** (spec only, written 2026-09-17). No code exists for this framework yet. This document is the brief for the next session. Companion to [`VTT_SYSTEM_BUILDER_PLAN.md`](VTT_SYSTEM_BUILDER_PLAN.md) (the larger VTT roadmap) and its "Feature toggles — baseline vs optional" note, which this expands.

---

## 1. Goal

Build a unified **VTT settings** framework. The whiteboard and core features (maps, tokens, planners, handouts, multiplayer) are the always-on **baseline**. Every higher VTT operation is an **optional, individually-toggleable VTT feature**.

**Reclassification:** the existing standalone toggles — **Token elevation, Token posture, Minimap** (and consider **Rulers**) — move under this VTT framework as VTT sub-toggles. Future VTT features (sound & effects, fog of war / vision, dice rolls, character sheets, the rules engine) join the same set as they are built. The framework should list only implemented features (or show planned ones clearly marked as unavailable).

---

## 2. The toggle structure

### 2.1 Master toggle — "VTT integration"
- Any user can set VTT integration **per campaign**.
- A **master toggle**, **default ON**. While ON, it exposes all the individual VTT feature toggles and lets the user set them for each campaign (by loading the campaign they want and setting them there).
- While OFF: the VTT features are hidden and inactive for that scope — the plain whiteboard experience only. *(Confirm exact master-OFF semantics with the user; assumed here to hide the sub-toggles and force baseline.)*

### 2.2 Three preference tiers
1. **Global default** — a global VTT preference set that applies to campaigns by default. A user sets, once, the VTT features they want new campaigns to start with.
2. **Per-campaign** — each campaign can toggle features on/off independently of the global default. Set by loading that campaign and changing them. Changing a campaign's settings does **not** change the global default, and making a new campaign does not disturb existing campaigns.
3. **Player-local** (multiplayer only, see §3) — a per-client further-disable that never leaves that client.

### 2.3 Global → campaign propagation
- Changing the **global** settings affects **only campaigns created after** the change.
- **Existing campaigns are not changed automatically.**
- Provide an **option to select which existing campaigns** to auto-push the new global settings to (opt-in, per campaign, at the time of the change).

---

## 3. Multiplayer — a player joining a campaign

The campaign's GM-set VTT settings are the **ceiling** while a player is joined.

### 3.1 Rules while joined
- A player **cannot enable** a feature the GM has turned **off** for the campaign.
- A player **can still disable** features that are on (further-disable, for their own instance).
- The GM's per-campaign settings **must not modify the player's personal/global app settings** — being joined is a temporary constraint; the player's own preferences persist unchanged and return when they leave.

### 3.2 Join notification
Shown when the player joins **and** their personal settings differ from the campaign's (see cadence below). It must:
- List settings the **GM has enabled that the player does not have** (in their global/personal settings).
- List settings the **player has enabled that the GM has disabled** for the campaign — i.e. the ones that **will be disabled** for them while joined.
- Offer to **sync** the player's mismatched "off" settings to the campaign's settings — which they may **decline**.
- Make clear which of their enabled settings will be turned off for the campaign.

### 3.3 Notification cadence
- Shown on the **first join**.
- Shown again **only when the GM changes the campaign's settings** — i.e. the next join after a change.
- **Not** shown every join. (Track the settings signature the player last acknowledged per campaign; re-fire only when it changes.)

### 3.4 Session settings visibility
- The **session settings** UI must clearly show which VTT features the GM has **enabled and disabled** for that campaign, so the player always knows the current constraints.

---

## 4. Proposed data model (for the next session — not final)

- **Global default:** a `wp_*` localStorage key mirrored to `preferences.json`, e.g. `wp_vtt_global` = JSON `{ feature: bool, ... }`. (Reuses the existing wp_* mirror.)
- **Per-campaign:** on the campaign object, e.g. `camp.vtt = { master: true, features: { elevation: true, posture: true, minimap: true, ... } }`. Travels with the save and rides the multiplayer snapshot, sanitized like the rest.
- **Player-local disables:** per-client only, e.g. `wp_vtt_local` (a set of features the player has switched off for themselves), **never sent**.
- **Effective while joined** = for each feature, ON iff `camp.vtt.features[f]` AND not in the player's local disables. The player can never exceed the campaign's set.
- **Effective solo** = the campaign's own set (with the user's own per-campaign choices), master-gated.
- **Acknowledged-signature** for notifications: e.g. `wp_vtt_seen_<campId>` = a hash/version of the campaign's VTT settings the player last saw, so §3.3 re-fires only on change.
- **New-campaign creation** copies the current `wp_vtt_global` into `camp.vtt`; later global changes do not touch existing `camp.vtt` unless the GM opts that campaign into a push.

---

## 5. Existing pieces to reuse (code pointers, verified 2026-09-17)

- **Toggle pattern** — `system/app/scripts/settings.js`: the Elevation/Posture toggle loop (~line 273), the Minimap toggle (~161), and the state-label refresh in `syncPanel()` (~66–85). These three are what get reclassified into the VTT group.
- **wp_\* → preferences.json mirror** — `settings.js:372` collects every `localStorage` key starting with `wp_` and POSTs them; the endpoint is `/api/prefs` in both `tools/dev-server.js` and `system/resources/app/main.js`. Any new `wp_vtt_*` key mirrors automatically; a per-client key like `wp_vtt_local` should be **excluded** from the campaign push if it must stay client-only (see the `turn_` exclusion precedent).
- **Settings modal groups** — `system/app/index.html`: `<details class="set-group" data-group="...">` (e.g. `advanced`, `updates`). Add a **VTT** group; move the elevation/posture/minimap rows into it.
- **Multiplayer wire + sanitize** — `system/app/scripts/net.js`: the snapshot and `sanitizeAppState` / `sanitizeItem`. The campaign VTT set rides the snapshot; the join notification hangs off the client's join/applySnapshot path. Roster/menu patterns and `logEvent` are here too.
- **Gated-feature toggle precedent** — the dev console added this session: `wp_devconsole` (Settings ▸ Advanced), gate in `system/app/scripts/devconsole.js`, wiring in `settings.js`. A clean, small example of a Settings toggle that gates a feature.
- **Tutorial-coverage rule** — VTT settings are user-facing, so when built they need the interactive tour (`tutorial.js` STEPS + `TUTORIAL_VERSION`) and the Help modal (`#helpModal`), per [[waypoint-tutorial-coverage]] / the standing rule.

---

## 6. Open questions to confirm before building

1. **Master-OFF semantics:** does the master toggle OFF hide all VTT sub-toggles and force the baseline whiteboard, or just collapse the section? (Assumed: hide + force baseline.)
2. **"Any user" setting per-campaign VTT:** solo users set their own campaign's VTT; in a session the host's set governs. Confirm a non-host cannot change a campaign's VTT while joined.
3. **Feature roster at launch:** start with elevation, posture, minimap (and rulers?). Show not-yet-built features (sound, fog of war, dice, sheets) as greyed "coming soon", or omit until implemented?
4. **Sync scope:** does "sync to the campaign" adjust only the mismatched features named in the notice, or replace the player's whole local set for that session?
5. **Where the session-settings view lives:** a panel in the existing Settings modal filtered to the joined campaign, or its own session dialog?

---

## 7. This session's wrap-up (context for the next chat)

Everything below is committed **locally into the unpushed 1.4.8** (source stays 1.4.8 per the user; he pushes/publishes — never push from a session). `main` was **14 commits ahead of origin** at handoff. The **first 7** commits (`901f9c0`…`a11242a`) predate this chat (sidebar reorder, Help modal search, handouts). **This chat added the last 7:**

- `9381e5e` — IMPROVEMENTS.md usability pass: **#2** Fit to Content (`window.wpFitView`, menu buttons, **Shift+1**), **#3** hold-**Space** pan, **#5** minimap rest-fade, **#6** `window.wpDebug.getState()`, **#7** `window.wpReloadFromDisk()`. **#4** (panel reflow) deferred with rationale; **#8** no-op. WHATSNEW updated in both copies; tour + Help updated for #2/#3.
- `b08a717` — in-app **developer console** (`system/app/scripts/devconsole.js`), press `~`.
- `ccf290b` — gated the console behind a **Settings ▸ Advanced toggle** (`wp_devconsole`, OFF by default) + `/help`.
- `28071fc` — `/help <name>` explains any command or `wp*` global (all 70 live globals covered).
- `52984c4` — VTT plan doc: fog-of-war/vision + sound & effects noted as related pillars.
- `d53da72` — console **slash-shortcuts**: `/roll` (dice), `/state`, `/fit`, `/reload`, `/save` (new `window.wpSave`), `/find`.
- `9214e4d` — VTT plan doc: the **feature-toggle model** (baseline vs optional, GM ceiling + player-local opt-out, security invariant) — the seed of THIS document.

Deferred / not started: **#4** panel-reflow (recommendation: defer, in `IMPROVEMENTS.md`); **fog of war** and **sound & effects** (roadmap pillars); this **VTT settings framework** (this doc).

**Working conventions to carry forward:** source files are uniformly CRLF — keep them CRLF (a new file: write then `sed -i 's/$/\r/'`). Run `node tools/parsecheck.js` after every script edit. Verify in the sandbox with `node tools/dev-server.js <a scratch saves dir> <port>` — do **not** touch the user's real save or another session's sandbox; port 3999 may be taken, so use another (4010 worked). Read `window.wpDebug.getState()` to inspect app state. Never deploy to his install, never `git push` — commit locally only.

See memory: [[waypoint-vtt-system-builder]], [[waypoint-tutorial-coverage]], [[waypoint-install-hands-off]], [[waypoint-no-push]], [[waypoint-patch-hygiene]], [[waypoint-release-state]].
