# Waypoint VTT™

[![Checks](https://github.com/ImmuneMoon/Waypoint/actions/workflows/checks.yml/badge.svg)](https://github.com/ImmuneMoon/Waypoint/actions/workflows/checks.yml)
[![Release](https://img.shields.io/github/v/release/ImmuneMoon/Waypoint?include_prereleases&color=blue&logo=github)](https://github.com/ImmuneMoon/Waypoint/releases/latest)
![Windows 10 | 11](https://img.shields.io/badge/Windows-10%20%7C%2011-0078D4?logo=windows&logoColor=white)
![Built with Electron](https://img.shields.io/badge/Built%20with-Electron-47848F?logo=electron&logoColor=white)
![Multiplayer: peer-to-peer WebRTC](https://img.shields.io/badge/Multiplayer-peer--to--peer%20%28WebRTC%29-333333?logo=webrtc&logoColor=white)
[![License: Terms of Use](https://img.shields.io/badge/License-Terms%20of%20Use-lightgrey)](license.txt)

Current release: **Waypoint VTT Alpha 1.6.4**. Downloads and release notes are on [GitHub Releases](https://github.com/ImmuneMoon/Waypoint/releases).

Drag a map in, drop your tokens, and your players only see what you reveal. Waypoint VTT is a desktop app for running tabletop RPG campaigns, and you prep in it as well as play in it. Every campaign lives in a plain `saves` folder beside the app, so a backup is a folder copy.

Waypoint VTT™ is made by Nucleus Studio™ and published by Fulllion Creative Works, LLC.

## What it does

A world map holds its cities, and somewhere down that chain a tavern holds its cellar. Each of those is a set of rooms linked by routes, with color-coded categories, GM notes, scene art and the people you expect to find there. That's the **Data Map**. A room can lead to another map, so a campaign grows into a tree, and a room also lists who is standing in it right now, read from the tokens on the map.

Tokens move, fog lifts and dice roll on the **Play Map**. It has a flat-top hex grid (or square, or none), tokens that seat into cells, drawings, shapes, text, rulers, portals, trigger zones and pictures of any size. Fog of war follows each player's own tokens, so a player whose token stands in the cellar doesn't see the inn upstairs. Anything you hide stays on your screen until you show it.

Session notes live in **planners** in the same campaign tree. A planner holds cards for scenes, people, places and clues, and the **Prep column** beside the map lists tonight's scenes and clues and the cards that belong to the map you're on. Handbook pages sit there too, and players can read the ones you share with them, part by part if you like.

Every character has a **sheet** built from the campaign's own game system, which you lay out in the **System editor** out of fields, formulas, rolls and lists. Players fill theirs in at the table. A sheet downloads as a character file or a readable page, and prints or saves as a PDF.

**Pictures and sound.** Pictures dropped on a map are stored under `saves/images/<map>/`, and the Image Library lists everything the campaign holds, with tags you set. Sounds, music playlists and videos are kept with the campaign too.

**Settings that stay put.** Units, snap, the pen and eraser, opacities, rulers and the panel layout are remembered and mirrored into `saves/preferences.json`, so they follow the saves folder to any computer. Table features such as fog of war or turn-based combat are set per campaign and live in the save itself.

## Playing together

You host from your own computer and your players join with a room code. A code looks like `AB2CD-EF3GH`. A table on Waypoint's own signaling server has a WP mark in front, like `WP-AB2CD-EF3GH`. **Copy invite** in the Multiplayer window copies a line with the code and a waypointvtt.com/join link, ready to paste into your group chat.

Players join from their own copy of Waypoint VTT. They can also play in a browser at waypointvtt.com with a player account there, but only when your code is a WP code, since the website finds tables on Waypoint's own server alone. Tick **Own signaling server** under Settings ▸ Multiplayer if anyone at your table plays in a browser.

A player at their first table lands on the map you're on. After that they come back where they last were, and you move them by summoning them, or by setting the stage, which brings everyone to one map. They see only what you share, move their own tokens, draw, chat, roll and talk in voice chat. You can pause the table, summon everyone or one player, approve or ban people, and end the session for all. A player whose connection drops reconnects by themselves for five minutes. If your own Waypoint crashes, open it again within 15 minutes and press **Resume your table** to get the same code back.

Connections go straight between computers where the networks allow it. Mobile data, many providers outside the US and EU, and campus and hotel networks often don't, and a player on one of those needs a relay. A host on a Waypoint GM plan gets the website's relay once this computer is linked to the account under Profile. A relay server of your own, under **Settings ▸ Multiplayer ▸ Relay server**, comes first if you set one. In Help, the Multiplayer: Hosting pane has the steps under "Setting up a relay server".

**Open stream window**, under Settings ▸ Multiplayer or in the Multiplayer window's Host a table part, opens a second window with only the play map, as the players' tokens see it together. Screen-share it to someone watching who doesn't have the app.

## Installing (players and GMs)

Download `Waypoint_Setup.exe` from the latest release and run it. The installer puts Waypoint VTT in your user folder, needs no admin rights, and offers a Start menu and desktop shortcut.

### The Windows warning

Windows may warn that it does not recognize the publisher, because Waypoint's installer is not code-signed yet. Only run a `Waypoint_Setup.exe` you downloaded from Waypoint's own releases page, or through the app's own update button. If it came from anywhere else, do not run it.

One-click updates inside the app are signed with Waypoint's own update key. Your copy takes an update only when its signature checks against the key the installer put there, and **Settings ▸ Updates and about ▸ Restore the previous version** puts the app back as it was before the last update. An update that changes Waypoint's core installs itself the same way: the app downloads the installer, checks its signature, closes, updates and opens again.

New versions install over old ones. Saves and settings are kept, and older saves are upgraded automatically after a backup is taken. When Setup finds a copy already installed it asks what to do. Updating in place is the usual choice. A clean install rebuilds the program files and keeps your saves and settings unless you tick the box to delete them. You can also put a separate copy in a new folder and leave the existing one alone.

Requirements: Windows 10 or 11. You'll want an internet connection to play together, and Waypoint uses it to look for updates.

**What the app does not do.** No account is needed and there are no ads. The app collects nothing about how you use it. Your campaigns are files on your own computer, in the saves folder. No AI service runs inside the app, and your notes and maps are never sent to one. That's the desktop app. A website account comes in only for playing in a browser, your plan's relay and cloud saves. Linking a website account to the desktop app is your choice, in the Profile window, which opens from your picture in the top row.

**Joining a table.** Get the room code from your GM, and the session password if they set one. Open Waypoint VTT and press **Join a game** on the welcome screen, or at any other time press the globe button in the top row and then **Join a table**. Type your name and the code, and the password if there is one, and press Join. The Multiplayer: Joining pane of the in-app Help (the question-mark button) walks through the rest.

**Portable use.** The installed folder is self-contained. Copy it anywhere, a USB stick included, and it runs from there.

## Data and backups

Everything about a campaign is in the `saves` folder next to the app:

| Path | Contents |
|---|---|
| `saves/data.json` | every campaign, map, planner, room, character and play-map piece |
| `saves/images/` | scene art, tokens and dropped pictures, one folder per map; sounds under `images/audio/<campaign>/`, videos under `images/video/<campaign>/`, the tutorial's art under `images/tutorial/` and received handouts under `images/journal/` |
| `saves/library/` | each campaign's item library packs |
| `saves/record/` | the Game Record, a log of each session's rolls, moves and chat, one file per session |
| `saves/preferences.json` | your settings and multiplayer profile, app-managed |
| `saves/backups/` | a snapshot taken at each launch (newest ten kept) and any you take by hand |
| `saves/error.log` | what went wrong, for a bug report; it stays on your computer |
| `saves/account.json`, `saves/cloud.json` | only if you link a website account or turn on cloud saves |

To back up, copy `saves`. To restore or move to another computer, paste it back beside the app. Your own relay server's address and password stay behind. They're kept in `system/userdata/` on that computer only, so you enter them again on the new one. `preferences.json` holds the keys that let tables recognize you, and if you host it holds your table's signing key too. Anyone with a copy of it can join other GMs' tables as you, and if you host, pass as your table to your players.

## What leaves your computer

Each time Waypoint starts, it asks GitHub whether there's a new release.

Playing together goes through servers outside your computer. Tables are found through the public PeerJS signaling server, or Waypoint's own for a WP code or with Own signaling server ticked, and Google's STUN servers help two computers find a route to each other. Those servers see your network address. On a direct connection, anyone who dials your room code can see it too, even if you never let them in, which is why the code is best shared privately. A relay, yours or your plan's, carries the table for players who can't connect directly.

Linking a waypointvtt.com account sends the website this computer's system name and the app's version, and keeps your multiplayer profile in step there so you're the same player on every computer you link. While linked it also keeps your table keys, the GMs' public signing keys and the room codes you've joined in step.

Cloud saves, on plans that include them, upload your campaigns, pictures, library and Game Record once you switch them on. The Game Record logs rolls, moves and chat, whispers included, and a campaign holds Player History, the names and table keys of the people who joined your table.

**Report a problem** in the app's About panel opens a new issue on GitHub in your browser, with Waypoint's version and the kind of computer filled in. Nothing is sent until you press that page's own button.

## Running from source

The front end is plain HTML and JavaScript modules in `system/app/`. The Electron shell in `system/resources/app/main.js` is a small local HTTP server that serves the front end and a handful of JSON endpoints for the saves folder, on the loopback address only. Nothing is bundled or transpiled.

To work on the app without the Electron runtime:

```bash
node tools/dev-server.js [savesDir] [port]
```

This serves `system/app` at `http://localhost:3999` with the same API as the shell, against a scratch `dev-saves` folder, so your real campaign is never touched. Point it only at scratch folders. Multiplayer works from the dev server too, since it runs peer to peer: start two copies on different ports with different saves folders, host in one and join from the other.

To run the real thing from source, take an installed copy and replace its `system/app` and `system/resources/app` folders with the ones from this repository. A release ships its app folder with the comments stripped out, so a swapped-in folder from here is easier to read.

## Tests

Every suite in `tools/*check.js` is plain Node with no dependencies, and exits 1 on any failure. Run them all before a commit:

```bash
for f in tools/*check.js; do node "$f" | tail -1; done
```

`tools/parsecheck.js` checks that every module loads and is worth running after every script edit. `tools/fuzzcheck.js` fires hostile messages at the multiplayer code and is diagnostic. It has no CI step of its own, and `tools/splitcheck.js` runs it as part of its checks. CI (`.github/workflows/checks.yml`) runs every suite on Node 22 and 24 on each push and pull request.

## Releases and updates

Players update from inside the app. **Settings ▸ Updates and about ▸ Check for updates** looks at this repository's latest GitHub Release, and fetches from GitHub's own hosts and nowhere else. If only the front end changed, **Update now** downloads the app zip, checks it, swaps `system/app` in place and reloads. If the release changed the core, the same panel installs the new installer instead. A quiet check runs shortly after launch, and when it finds a newer version a gold **Update** button stays in the top row until the update is applied. Nothing installs until you press the button. Updates still come from GitHub for now. The app can also read them from waypointvtt.com, a list signed with Waypoint's update key and the files on Waypoint's own download host, once that is live.

To cut a release:

1. Raise the version in `system/resources/app/package.json`, before the first change to the core if the release has one. Add this version's section at the top of `WHATSNEW.txt`, and the same section at the top of `system/app/assets/whatsnew.txt`, or nothing builds. If anything under `system/resources/app/` or `installer.iss` changed, run `node tools/shellrev.js` and commit `tools/shellrev.json`, and set `SHELL_WANTED` in `system/app/scripts/settings.js` to the same version. Installs whose core is older are then sent to the installer. If the tour's steps or its demo campaign changed, raise `TUTORIAL_VERSION` in `system/app/scripts/tutorial.js` to the release's version. `node tools/tutorialcheck.js` checks every tour target still exists, and the build runs it.
2. Build:

   ```bash
   node tools/release.js
   ```

   The build needs `WAYPOINT_SIGNING_KEY`, naming the update signing key's private half, which is kept outside this repository (`node tools/signkey.js --check <path>` says whether a file is the right one). Every install checks a release against that key before it takes it. `ISCC` names [Inno Setup 6](https://jrsoftware.org/isinfo.php) if it isn't at the path release.js names. `WAYPOINT_SIGNTOOL` is the command that code-signs the installer, with `{file}` where the installer's path goes. There is no code-signing certificate yet, so for now leave it unset: the build says the installer is not code-signed and goes on.

   The build writes `system/app/version.json` and the "Current release" line at the top of this README, copies what an install needs and nothing else into `dist/<version>/stage`, strips comments from that copy, and zips it as `waypoint-app-<version>.zip` with its `.sha256` and `.sig`. It compiles the installer from the stage, signs it, and writes `manifest.json`, `envelope.json` (the signed list the website serves) and the release notes, all under `dist/<version>/`. `--notes-only` makes just the notes.
3. Publish to GitHub, then check it as an install reads it:

   ```bash
   node tools/release.js --github
   node tools/ghlive.js
   ```

   `--github` builds as step 2 does and then makes the GitHub Release with the [GitHub command line tool](https://cli.github.com) (`gh`), signed in on this machine with `gh auth login`. The release is tagged with the version, made as a draft first, given its six files (`waypoint-app-<version>.zip` with its `.sha256` and `.sig`, `manifest.json`, `Waypoint_Setup.exe` and its `.sig`), and only then published. It refuses before it builds where `gh` is missing or not signed in, or where GitHub already holds that version. `tools/ghlive.js` reads the latest release exactly as an install of 1.6.3 does, needs no token and writes nothing: it says whether the release is this version, whether older installs are sent to the installer and can run it by themselves, and whether both signatures are there.

Where the app looks for updates is the `UPDATE_SOURCE` constant near the top of `system/resources/app/updater.js`: `'github'` reads the repository named by `UPDATE_REPO` at the top of `system/resources/app/main.js`, and `'site'` reads the website named by `UPDATE_SITE` beside it. 1.6.4 ships with `'github'`, which is why a release goes to GitHub. Changing the constant is a change to the core (step 1). Every install keeps reading the source its own copy names, so while any install still reads GitHub, every release must go to GitHub too.

Later, once the source is `'site'` and there is a code-signing certificate, a release goes to the website as well:

   ```bash
   node tools/release.js --publish --github
   node tools/sitepub.js --check
   ```

   `--publish` puts the files and the signed list on Waypoint's download host and tells the website a release is there. It needs the download host's `WAYPOINT_R2_*` settings, `WAYPOINT_DISPATCH_TOKEN` and `WAYPOINT_SIGNTOOL`. With it, `--github` also makes the GitHub Release, with a `GITHUB_TOKEN` that can write releases, for the installs that still read GitHub. If a run stops partway, run the same command again and it finishes what's missing without rebuilding. `tools/sitepub.js --check` then confirms the live site names the new version, before the release is announced.

## Repository layout

```
system/app/               the application: index.html, style.css, scripts/, assets/
system/resources/app/     the Electron shell: main.js, updater.js, account.js, cloudsync.js and the rest of the local server
tools/dev-server.js       run the app from source in a browser
tools/release.js          build and publish a release (with sitepub.js, signkey.js, shellrev.js, stripcore.js)
tools/ghlive.js           read only: is the latest GitHub release one an install takes?
tools/*check.js           the test suites
installer.iss             Inno Setup script
CAMPAIGN_INTEGRATION.md   the save-file schema and authoring rules for generated content
WHATSNEW.txt              release notes
```

The rest of `system/` (the Electron binary, DLLs, locales) and the `saves` folder are left out of the repository on purpose.

## For campaign authors and tooling

`CAMPAIGN_INTEGRATION.md` documents the save schema, the coordinate system, the hex lattice, what multiplayer hides from players, and the conventions the app expects. It's written for anyone generating maps, rosters and tokens outside the app and merging them in.

## License and contact

`license.txt` holds the terms of use and privacy policy. Questions and problems go to fulllioncreativeworks@gmail.com, or use **Report a problem** in the app's About panel.

Waypoint VTT includes the Inter typeface (SIL Open Font License 1.1, `system/app/assets/fonts/inter/LICENSE`) and Font Awesome Free icons by Fonticons, Inc. (CC BY 4.0, `system/app/assets/icons/fa/LICENSE.txt`). It includes 23 more typefaces for text on maps: Lora, Crimson Text, Comic Neue, Atkinson Hyperlegible, Cinzel, IM Fell English, Almendra, MedievalSharp, Uncial Antiqua, UnifrakturCook, Pirata One, Caveat, Great Vibes, Orbitron, Audiowide, Black Ops One, Share Tech Mono, Cutive Mono, JetBrains Mono, Rye, Bangers, Nosifer and Noto Sans Runic. Each is under the SIL Open Font License 1.1, is carried as its makers published it, and has its license text with its copyright notice beside it; `system/app/assets/fonts/FONTS.txt` lists them all. The same typefaces are offered in pages, notes and the table notepad, and as the app font in Settings. Waypoint VTT also includes PeerJS, Mermaid and html2canvas (MIT License; each file's license text is beside it in `system/app/assets/vendor/`).

## Support the project

If Waypoint VTT helps your table and you'd like to chip in toward its development, tips go to Fulllion Creative Works:

* [Donate via PayPal](https://www.paypal.com/donate/?hosted_button_id=LCDZX75HR4CLC)
* [Support on Ko-fi](https://ko-fi.com/fulllion)

---
© 2026 Fulllion Creative Works, LLC. All rights reserved.
