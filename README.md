# Waypoint

Current release: **1.2.4** — see [Releases](https://github.com/ImmuneMoon/Waypoint/releases) for downloads and notes.

A portable desktop companion for tabletop RPG campaigns: linked data maps for the GM, hex-grid play maps with tokens and scene art for the table, planners for notes, and peer-to-peer multiplayer so a GM can host a session and players can join with a room code. Built on Electron. Every campaign lives in a plain `saves` folder beside the app, so backups and hand-offs are file copies.

## What it does

**Data map.** Each map is a set of rooms (nodes) linked by routes, grouped by colour-coded categories, with GM notes, a roster of characters per room, and scene art. Rooms can warp to other maps, so a whole campaign is a tree: a world map, its cities, their buildings, their rooms.

**Play map.** A whiteboard for the same map: a flat-top hex grid (or square, or none) with tokens that seat into cells, drawings, shapes, text, measurement rulers, portals and triggers, and images of any size. Tokens dropped on a room's floor move that character's roster entry with them. Hidden items exist for the GM and are invisible to players until revealed.

**Planners.** Document pages with headed blocks and tables for session notes, run scripts, and reference material, kept in the same campaign tree.

**Multiplayer.** The GM hosts a campaign over the internet with a six-character room code. Players join from their own copy of Waypoint or a browser, land on the map the GM chooses, see only what the GM shares (GM notes and hidden items never leave the host), move the tokens they own, draw on the map, chat, and receive images on demand. The GM can pause the table, summon everyone or a single player, approve or ban players, and end the session for all. A dropped connection reconnects on its own; a crashed host can resume with the same code. Connections are direct where the networks allow it; for players behind carrier-grade NAT the GM configures a TURN relay of their own under **Settings ▸ Relay server** (the app ships with none). Step-by-step instructions are in the app under Help ▸ Multiplayer: Hosting ▸ *Setting up a relay server*, and the Relay server box links straight to them. A **Stream window** (Settings) shows only the play map as players see it, for screen-sharing to a spectator without the app.

**Character sheets.** Tokens can carry a character JSON from the ShadowBase character-sheet site: attach one to a token, view it in the inspector, export it back with the token's art as the portrait, or import a sheet as a ready-made token.

**Assets.** Images dropped on a map are stored under `saves/images/<map>/`. An in-app library lists everything the campaign holds. Portraits and tokens are shared between maps.

**Settings that stay put.** Units, snap, pen, eraser, opacities, minimap, rulers, and panel layout are remembered, and mirrored into `saves/preferences.json` so they follow the campaign folder rather than one machine.

## Installing (players and GMs)

Download `Waypoint_Setup.exe` from the latest release and run it. Windows will probably show a blue SmartScreen screen because the installer isn't code-signed; click **More info**, then **Run anyway**. The installer puts Waypoint in your user folder, needs no admin rights, and offers a Start Menu and desktop shortcut.

New versions install over old ones. Saves and settings are kept, and older saves are upgraded automatically after a backup is taken.

Requirements: Windows 10 or 11. An internet connection is needed for multiplayer only.

**Joining a table.** Get the room code from your GM, open Waypoint, click the globe button, type your name and the code, and press Join. No account is needed. The in-app Help (the question-mark button) has a full tutorial for playing at a hosted table.

**Portable use.** The installed folder is self-contained. Copy it anywhere, including a USB stick, and it runs from there.

## Data and backups

Everything about a campaign is in the `saves` folder next to the app:

| Path | Contents |
|---|---|
| `saves/data.json` | every campaign, map, planner, room, and play-map item |
| `saves/images/` | scene art, tokens, and dropped images, one folder per map |
| `saves/preferences.json` | your settings, app-managed |
| `saves/backups/` | a dated snapshot taken at each launch (newest ten kept) |

To back up, copy `saves`. To restore or move to another computer, paste it back beside the app. The app never phones home and needs nothing online except for multiplayer.

## Running from source

The front end is plain HTML and JavaScript modules in `system/app/`. The Electron shell in `system/resources/app/main.js` is a small local HTTP server that serves the front end and a handful of JSON endpoints for the saves folder. Nothing is bundled or transpiled.

To work on the app without the Electron runtime:

```bash
node tools/dev-server.js
```

This serves `system/app` at `http://localhost:3999` with the same API as the shell, against a scratch `dev-saves` folder so your real campaign is never touched. Pass another saves folder and port as arguments if you want them. Multiplayer works from the dev server too, since it runs peer to peer.

To run the real thing from source, unpack the latest release and replace its `system/app` and `system/resources/app` folders with the ones from this repository.

## Releases and updates

Players update from inside the app: **Settings ▸ Check for Updates** looks at this repository's latest GitHub Release. If only the front end changed, **Update Now** downloads the app zip, verifies its checksum, swaps `system/app` in place and reloads. If the release changed the Electron shell, the same panel offers the installer instead. A quiet check runs shortly after launch; when it finds a newer version a gold **Update** button appears in the top bar and stays until the update is applied, and a dismissable notice appears once per launch. Nothing installs without the user pressing the button.

To cut a release:

1. Bump the version in `system/resources/app/package.json` and `installer.iss`, and add a section at the top of `WHATSNEW.txt` and `system/app/assets/whatsnew.txt`. The release script writes `system/app/version.json` from `package.json` and the "Current release" line at the top of this README; that file ships inside the app zip and is what an updated copy reports as its version. If `main.js` or `updater.js` changed, set `MIN_SHELL` in `tools/release.js` to the new version so older shells are steered to the installer.
2. Build:

   ```bash
   node tools/release.js
   ```

   This zips `system/app` as `waypoint-app-<version>.zip` with a `.sha256`, writes `manifest.json`, compiles the installer with [Inno Setup 6](https://jrsoftware.org/isinfo.php), and collects everything under `dist/<version>/` with the release notes. The notes are the top section of `WHATSNEW.txt` rendered as markdown; `--notes-only` regenerates just that file.
3. Publish: create a GitHub Release tagged with the version and attach the four files, or run `node tools/release.js --publish` with a `GITHUB_TOKEN` that can write releases.

The repository the app checks is the `UPDATE_REPO` constant at the top of `system/resources/app/main.js`.

## Repository layout

```
system/app/               the application (index.html, scripts/, assets/, style.css)
system/resources/app/     the Electron shell: main.js, updater.js, package.json, icons
tools/dev-server.js       run the app from source in a browser
tools/release.js          build (and optionally publish) a release
installer.iss             Inno Setup script
CAMPAIGN_INTEGRATION.md   the save-file schema and authoring rules for generated content
WHATSNEW.txt              release notes
```

The rest of `system/` (the Electron binary, DLLs, locales) and the `saves` folder are intentionally not in the repository.

## For campaign authors and tooling

`CAMPAIGN_INTEGRATION.md` documents the save schema, the coordinate system, the hex lattice, what multiplayer hides from players, and the conventions the app expects. It is written for anyone generating maps, rosters, and tokens outside the app and merging them in.

## Licence and contact

See `license.txt` for the terms of use and privacy policy. Questions and problems: fulllioncreativeworks@gmail.com.
