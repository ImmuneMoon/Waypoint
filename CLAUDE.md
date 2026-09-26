# Waypoint — working in this repository

Waypoint is an Electron virtual tabletop: a GM's campaign (maps, tokens, handbook pages, character sheets, sound, music, fog,
dice) hosted from one machine, with players joining peer-to-peer. This file is the build, test and house-rules reference for
anyone (or any tool) changing the code. The README covers installing and using the app.

## Layout

- `system/app/` — the application. `index.html`, `style.css`, and `scripts/*.js` as ES modules. Modules talk through
  `window.wp*` globals (`wpNet`, `wpSheets`, `wpSystemCore`, `wpDocRender`, `wpVtt`, …) and the shared `state.appState`.
  `assets/` holds the bundled presets, sounds and the tutorial campaign's art; `assets/fonts/` and `assets/icons/` hold a fixed, licensed list
  (Inter, Font Awesome Free — licence texts beside them): a new glyph needs its file, a `GLYPHS` entry in systemcore.js, its attribution
  comment and the bundled-files test. `version.json` is written at build time.
- `system/resources/app/` — the Electron shell: `main.js` (a small local HTTP server that serves `system/app` and a handful of
  JSON endpoints over the saves folder, loopback only, own-origin only), `updater.js`, `package.json` (the app version).
- `tools/` — `dev-server.js` (run from source in a browser), `release.js` (build), and the offline test suites `*check.js`.
- `saves/`, `dev-saves/`, `dist/`, `docs/*.md`, `.claude/` are git-ignored: a table's data, scratch data, build output, local
  planning notes and machine-specific launch configs never enter the repository.
- `CAMPAIGN_INTEGRATION.md` documents the save-file schema for tooling that generates content.

## Running from source

```bash
node tools/dev-server.js [savesDir] [port]
```

Defaults: `./dev-saves` and port 3999. The dev server mirrors the shell's HTTP API, so the front end runs unchanged in an
ordinary browser. **Never point it at a real saves folder** — use a scratch folder per instance.

Multiplayer is verified with two instances on different ports and different saves folders (a GM at one, a player at the
other), joined through the real Host / Join screens. `.claude/launch.json` (local, ignored) names such a pair
(`waypoint-gm`, `waypoint-player`) for the Claude Code browser pane; recreate it on a new machine with scratch paths.

An installed Waypoint (`Programs\Waypoint`) is never touched from here: changes reach users through releases only.

## Tests

Every suite is plain Node, no dependencies, exits 1 on any failure:

| Suite | Covers |
| --- | --- |
| `tools/parsecheck.js` | every module in `system/app/scripts` loads — run after **every** script edit |
| `tools/tutorialcheck.js` | every tour step's `target` exists in `index.html` |
| `tools/doccheck.js` | handbook renderer, rich-text sanitiser, Markdown, document theming |
| `tools/formulacheck.js` | the formula engine |
| `tools/systemcheck.js` | the character system + sheet model (`systemcore.js`): cleaners, GM-view stripping, layout, band |
| `tools/dicecheck.js` | dice engine, modifiers, advantage |
| `tools/itemcheck.js` | item library |
| `tools/vttcheck.js` | VTT feature toggles |
| `tools/fogcheck.js` | fog of war |
| `tools/soundcheck.js`, `fxcheck.js`, `musiccheck.js` | sound, effects, music playlists |
| `tools/cleanupcheck.js` | save cleanup classifier, the import cleaner (`cleanImport`, run on the real `migrateAppState` sliced from `io.js`), the dev reload gate + the asset gate (slices the real code out of `net.js`) |
| `tools/netcheck.js` | host-side wire gates: admission, identity, rate limits, chat, the patch/pos/threat gates (a locked token), stage and summons (admitted peers only), travel, Forget, the GM's own roll privacy and a thrown blast's name, the combat roster (players get the order, never a number; run with the roster's Roll and Start from `whiteboard.js`), an apply action (`char-apply`: the owner's own view, all or nothing; the card's audience, the late joiner's history), a roll's consequences (the host rebuilds the formula from the entry; success, failure, always) (slices `net.js` by `[netcheck:*]` markers) |
| `tools/sinkcheck.js` | the GM's own renderers against a campaign from a file: `safecore.js` (esc, cssColor, num, picRef), the planner preview and editor boxes, room inspector, pictures, ruler, music fetch, category-file deletion, the mermaid label config in `index.html` (slices by `[sinkcheck:*]` markers) |

Run them all before a commit:

```bash
for f in tools/*check.js; do node "$f" | tail -1; done
```

CI (`.github/workflows/checks.yml`) runs the same suites on every push and pull request, on Node 22 **and** 24. A test must
pass on both: never assert one runtime's exact output where runtimes differ (URL percent-encoding of `^` and `|` bit us).
Reproduce a runner difference locally with `npx -y -p node@22 node tools/<suite>.js`.

Live behaviour (the sheet panel, the play map, the wire) is verified in the browser against the dev server, two peers
for anything multiplayer, before a commit that touches it.

## Editing rules

- **Line endings are per file and per checkout.** `.gitattributes` normalises the index to LF; the working tree follows
  `core.autocrlf`, so on a Windows checkout with `autocrlf=true` a file comes out CRLF whenever git writes it (a checkout, a
  merge), while one git has not rewritten keeps what it had. Never trust a list: check `git ls-files --eol <file>` before
  editing and keep what you find (a patch script detects the EOL per file; a test normalises CRLF before a regex that expects a
  newline). `popout.js` and `docpanel.js` contain bare CRs and are binary to git (edit byte-exact or not at all). EOL
  churn never shows in `git diff`, so it is easy to break silently.
- Prefer a small Node patch script that does **exact-match, all-or-nothing, EOL-preserving** replacements over ad-hoc shell
  edits when a file needs several changes. Never build string literals through shell escaping (backslashes get lost);
  never append a `//` comment to a one-line handler (it comments out the tail). `node --check` on a `.mjs` copy pinpoints a
  syntax error that parsecheck attributes to every importer.
- Opt-in configuration renders exactly as before when absent (a system without a band, a page without a look, a section
  without colors is byte-for-byte unchanged). Keep default shapes stable — suites assert them.
- **Wire and file safety:** nothing from the wire, a save file, an import or another origin reaches `innerHTML`, an
  attribute, a URL or a disk path without a tested sanitiser; a client re-validates what a host sends; GM-only data
  (`vis: 'gm'`, `gmInfo`, table keys) never leaves the host. New host-side handlers get a `netcheck` case. The GM's own
  renderers show imported campaigns too: campaign data reaches markup through `esc` / docrender `sanitizeHtml`, a style
  through `safecore.js` `cssColor` / `num`, a picture through `picRef` (never a web address), with a `sinkcheck` case.
- Every user-facing feature is documented in **both** the tour (`tutorial.js` `STEPS`) and Help (`#helpModal` in
  `index.html`); fixes, passive visuals and security work need neither. Text stays brand-neutral.
- Put a design choice to the maintainer as a short multi-choice question with the recommended option first, then build.

## Git, versions and releases

- Commit locally with a message in the house style: `<version>: <area> — <what changed and why>`, body in prose.
- **Push `main` after a verified fold** (all suites green, live check done); CI runs on the push. **Never publish**: no
  GitHub Release, no tag, no `node tools/release.js --publish` — the maintainer publishes when a release is ready.
- Published numbers are frozen. Before folding a change in, run the release guard: compare the GitHub `/releases/latest`
  tag with `system/resources/app/package.json` (and `git fetch --tags`). If the package version is already published, the
  change takes the next number; otherwise it folds into the open one. Patches run to `.9` before a minor bump.
- `node tools/release.js` writes `system/app/version.json` and the README's release line from `package.json`, zips the
  app with a `.sha256`, and compiles the installer (Inno Setup 6) into `dist/<version>/`. Release notes go in
  `WHATSNEW.txt` and `system/app/assets/whatsnew.txt`.
