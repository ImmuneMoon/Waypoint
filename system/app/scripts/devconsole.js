// In-app developer console. OFF by default — enable it in Settings ▸ Advanced (which sets wp_devconsole=on);
// then press ~ (backtick) anywhere outside a text field to drop it down. Type JavaScript and Enter runs it,
// with the page's globals in scope — window.wpDebug.getState(), window.wpReloadFromDisk(), window.wpFitView(),
// window.wpNet, and the rest. Meta-commands: /help (or /help <name>), /roll 2d6+3 (the full formula syntax, via wpFormula), /state, /fit, /reload,
// /save, /find <name>, /clear. Up/Down walk the history (localStorage), Esc — or ~ on an empty line — closes.
// A power/dev tool: it only runs what YOU type, matching the other sandbox hooks. Self-contained: no imports,
// no app state touched beyond window globals. The wpDevConsole.* API stays callable even when ~ is gated off.
(function () {
    var panel = null, logEl = null, input = null, seeded = false;
    var hist = [], histIdx = 0;
    try { var h = JSON.parse(localStorage.getItem('wp_devconsole_hist') || '[]'); if (Array.isArray(h)) hist = h; } catch (e) {}
    histIdx = hist.length;

    function enabled() { try { return localStorage.getItem('wp_devconsole') === 'on'; } catch (e) { return false; } }

    function ready() {
        if (panel) return true;
        panel = document.getElementById('devConsole');
        logEl = document.getElementById('devConsoleLog');
        input = document.getElementById('devConsoleInput');
        if (!panel || !logEl || !input) { panel = null; return false; }
        input.addEventListener('keydown', onInputKey);
        return true;
    }
    function isOpen() { return !!panel && panel.style.display === 'flex'; }

    function addLine(text, cls) {
        var d = document.createElement('div');
        d.className = 'dc-line ' + (cls || 'dc-out');
        d.textContent = text;
        logEl.appendChild(d);
        logEl.scrollTop = logEl.scrollHeight;
    }
    function fmt(v) {
        if (v === undefined) return 'undefined';
        if (v === null) return 'null';
        if (typeof v === 'string') return v;
        if (typeof v === 'function') return String(v);
        try { return JSON.stringify(v, null, 2); } catch (e) { return String(v); }   // circular / non-serialisable
    }

    // The headline commands get a full multi-line detail (shown by /help and /help <name>).
    var HELP = [
        { name: '/help', short: 'this list, or  /help <name>  for detail on one command or global',
          detail: '/help            list the headline commands.\n/help <name>     explain one command or wp* global in full, e.g.  /help wpFitView  or  /help seathex\n/?               same as /help.' },
        { name: '/roll <expr>', short: 'roll dice with the full formula syntax, e.g.  /roll 2d20kh1 + 5 >= 16   (also /r)',
          detail: 'Roll a formula and show every die, the total and, for a check, the margin. Spreadsheet-style, case-insensitive:\n  /roll 2d6+3            /roll d20 + 5 >= 16        /roll 4d6kh3 (keep the highest 3)\n  /roll 2d20kh1 + 5      /roll 3d6 <= 12 (roll-under)   /roll 10d6cs>=5 (count the 5s and 6s)\n  /roll 2d6! + 3 (exploding)   /roll d20r1 (reroll 1s once)   /roll 4dF   /roll d%\nAlso kl / dh / dl, rr (reroll until), (Level)d6, d(Faces), floor / ceil / round / abs / min / max / clamp / mod / if, and / or / not.\nPut a space after /roll. Names like STR are not set in the console yet — they come with the character sheets.\nBare /roll rolls a d20. /roll stays private to this console; /table posts to the table.' },
        { name: '/table <expr>', short: 'roll at the table (chat card for everyone, like /roll in Table Chat)',
          detail: 'Rolls through the table dice (wpDice.roll): at a hosted table everyone gets the card and the session log a line; at a joined table the GM rolls it for you; solo it is a local card in the chat panel. Same syntax as /roll.' },
        { name: '/state', short: 'print wpDebug.getState()',
          detail: 'Pretty-prints the app state snapshot — the same object as typing  wpDebug.getState().' },
        { name: '/fit [sel]', short: 'frame everything, or  /fit sel  for the selection',
          detail: '/fit        frame every item on the map   (wpFitView(false)).\n/fit sel    frame the current selection          (wpFitView(true)).' },
        { name: '/reload', short: 're-read data.json from disk',
          detail: 'Drops the pending autosave and reloads data.json (wpReloadFromDisk) — see  /help wpReloadFromDisk.' },
        { name: '/save', short: 'force an immediate save',
          detail: 'Writes the current state to disk now (io.js save(true)), skipping the ~500ms autosave debounce.' },
        { name: '/find <name>', short: 'open the quick-jump, filtered to <name>',
          detail: 'Closes the console and opens the Ctrl+K quick-jump prefilled with your text — pick a map, planner\nor room and press Enter to go there.' },
        { name: '/clear', short: 'clear the console log (history is kept)',
          detail: 'Clears everything printed so far — same as wpDevConsole.clear(). Your Up/Down command history is untouched.' },
        { name: 'wpDebug.getState()', short: 'read-only snapshot of what the app is showing now',
          detail: 'Returns a plain object (ids and primitives only — no live refs to mutate):\n  activeCampaignId, activeItemId   the campaign, and the open map or planner\n  mapIds, plannerIds               ids in the active campaign\n  viewMode, zoomLevel              "data" | "visual", and the current zoom\n  selId / selWbId / selWbIds       the current selection (data map / play map)\n  netRole                          "host" | "client" | "offline"\n  vtt                              { mode, campaign, global, ceiling, tableKey, localOff, effective, sig, seen, pending }\n  version                          the running app version\nExample:  wpDebug.getState().mapIds.length' },
        { name: 'wpReloadFromDisk()', short: 're-read data.json from disk, dropping the pending autosave',
          detail: 'Clears the ~500ms autosave debounce, then reloads data.json through the app’s normal load path and\nre-renders. Use it when something outside the app rebuilt the save, so the open tab picks up the new\nfile instead of overwriting it on the next autosave. Any unsaved in-memory edit is discarded.' },
        { name: 'wpFitView(sel)', short: 'zoom + pan to frame everything, or just the selection',
          detail: 'wpFitView(false)   frame every item on the active map.\nwpFitView(true)    frame only the current selection.\nComputes a fit-zoom (clamped 0.1–4, with an 80-unit margin) then centres. Same as the Fit to Content\nmenu item and the Shift+1 shortcut.' },
        { name: 'wpNet', short: 'the multiplayer object',
          detail: 'wpNet.active   true while you are hosting or joined.\nwpNet.role     "host" | "client".\nAlso holds the P2P internals (peers, snapshot, broadcast helpers). Reading is safe; calling internals\ncan affect a live session, so be careful mid-game.' },
        { name: 'wpAppVersion', short: 'the running app version string',
          detail: 'e.g.  "1.4.8"  in the packaged app, or  "1.4.8-dev"  on the dev server.' },
        { name: 'wpDevConsole', short: 'control this console from code',
          detail: 'wpDevConsole.open() · .close() · .toggle() · .clear() · .help()\nThe ~ key is gated by Settings ▸ Advanced, but these methods work whether or not the toggle is on.' }
    ];

    // One-liners for every other wp* global, so /help <name> explains it. Anything here but absent at runtime
    // is simply never shown; anything present but missing here falls back to a live type+arity description.
    var DESC = {
        wpApplyGridOpacity: 'Apply the current grid-opacity setting to the board grid.',
        wpApplyRememberedView: "Restore a map's remembered face (Data vs Play) - item.meta.lastView.",
        wpApplyTips: 'Re-attach the fast hover tooltips (scripts/tips.js).',
        wpAutoRoom: 'Auto-create/seat a room node on the data map (datamap.js).',
        wpBlasts: 'Return the current blast (area-of-effect) templates on the play map. [sandbox hook]',
        wpBuildExport: 'Build an export payload (this map / all maps / campaign / everything) - io.js buildExport.',
        wpCastSaveCharacter: 'Save a character/token into the campaign Cast.',
        wpCheckShell: 'Check whether the Electron core (shell) is older than SHELL_WANTED and needs the installer.',
        wpCheckUpdates: 'Run the app update check (GitHub latest vs the running version).',
        wpClampMenu: 'Position a fixed pop-up menu so it stays on-screen (flips near the right/bottom edge).',
        wpCloseImgPreview: "Close the Image Library's large preview.",
        wpCmdkOpen: 'Open the Ctrl+K quick-jump palette.',
        wpCreateMapFromRoomImage: "Build a new map from a room's scene image.",
        wpDice: 'Dice at the table (scripts/dice.js): roll(expr, {priv, charId, label}), rollFor(charId, expr, label) from a sheet, syncChars() the character picker, openPanel / closePanel, renderCard(entry), line(entry), history(); onDeny / onRolled / landed are the hooks net.js calls.',
        wpDiceCore: 'The dice validators and maths (scripts/dicecore.js): cleanRollReq, cleanRoll, cleanDeny, replay, checkTableRoll, parseCommand, verdictOf, critOf, cardText, RateLimit, LIMITS.',
        wpDiceSync: 'Re-check the Dice feature for the campaign or table on screen: shows or hides the roller (called by the VTT toggle fan-out).',
        wpDocForeign: 'Handbook reader: (on) closes the reader and switches mermaid to strict while someone else\'s campaign is on screen; (off) restores the app\'s own mode (handbook.js).',
        wpDocGone: "Handbook reader: (campId, itemId) closes the reader with a toast when the GM hid or deleted the page on screen.",
        wpDocImport: 'Markdown in and out (scripts/docimport.js): openImport({kind, mode, parentId, files}), importFile(file), exportMarkdown(item), detectBundle(entries), TEMPLATE.',
        wpDocMd: 'The pure Markdown half (scripts/docmd.js): markdownToBlocks(text, {kind, items}), docToMarkdown(item, {items}), htmlToMarkdown, flowchartFromMermaid, parseAttrs, detectBundle, LIMITS. No DOM.',
        wpDocReaderOpenId: 'Handbook reader: the id of the page open in the reader, or null.',
        wpDocReaderRefresh: 'Handbook reader: (campId, itemId) re-renders the reader when that page changed (keeps the scroll position).',
        wpDocRender: 'The handbook renderer and sanitizer (scripts/docrender.js): sanitizeHtml(html), cleanDoc(doc, {keepHidden}), renderDoc(doc, {src, mermaid}), proseHtml, compileFlowchart, LIMITS. Pure — no state, no DOM.',
        wpDuplicateWb: 'Duplicate the selected play-map items (same as Ctrl+D).',
        wpEditTextBox: 'Open the in-place editor for a text box, by id.',
        wpEraserCursorHide: "Hide the eraser's circle cursor.",
        wpFcPostProcess: "Handbook reader: (root, doc) applies a page's flowchart zoom, sizes and nudges inside root without wiring the editor's handles (planner.js).",
        wpFilePrefs: 'The shared table preferences backed by saves/preferences.json.',
        wpFitToGrid: 'Size the selection to whole grid cells and seat it (square or hex).',
        wpFocusCharacter: 'Jump the camera to a character token and select it (the party-strip action).',
        wpFormula: 'The formula and dice engine (scripts/formula.js): evaluate(text, options), parse(text), describe(result, opts), names(text), fromDraws(draws), LIMITS. Pure — no state, no DOM; /roll is its first consumer.',
        wpHandoutList: "List the current campaign's handouts.",
        wpHandoutPayload: "Build a handout's wire payload for sending to players.",
        wpHideTooltip: 'Hide the play-map hover card (#wbTooltip).',
        wpHist: 'Per-item undo picture: wpHist.peek() lists { undo, redo, bytes } per "campId/itemId" (dev-only, like wpDebug).',
        wpHistBarrier: 'Wipe the undo/redo of the given item ids and re-baseline them - called after a write that spans two maps (net.js, whiteboard.js).',
        wpHistFlush: 'Record a pending debounced edit as its own undo step and save it now - net.js calls it before a player\'s change lands in a map.',
        wpAdoptTags: "Picture categories: (camp, sourceCats, data) copies a safety copy's app-level tags for pictures this campaign owns or uses into camp.imageCats (cleanup recovery).",
        wpImgCatEnsure: "Ensure an Image Library category exists and tags paths with it: (name, paths, shelf, store) — store = 'shared' or a campaign id.",
        wpImgCatRename: "Rename an Image Library category in one store: (oldName, newName, store).",
        wpImgScope: "(list, campId) → the pictures of that campaign from a /api/list-images answer (folder ownership or reference; tutorial/ is Shared).",
        wpMigratePictures: 'One-time move of the app-wide picture categories into the campaigns that own or use their pictures (io.js load repair; marker _picsV).',
        wpReleaseCampaignTags: "(camp, data) moves a campaign's picture categories into the shared store before the campaign is deleted.",
        wpJournalAddNote: 'Add a note to your Journal (title + text).',
        wpJournalDefaultPage: "The Journal's default landing-page setting.",
        wpJournalReceive: 'Receive a revealed handout into the Journal.',
        wpLinkTypes: 'The data-map link styles - path / route / secret / one-way.',
        wpMeasureKind: "The measure sub-mode - 'ruler' or 'blast'.",
        wpMermaidConfig: 'The full mermaid config the app initialises with (index.html); handbook.js re-initialises from it with securityLevel strict for a joined player.',
        wpNewOpacityProps: 'The default opacity props applied to newly placed items.',
        wpOpenDoc: 'Handbook reader: open a page of the campaign on screen in the panel over the map (id). wpCloseDoc() closes it.',
        wpOpenCombat: 'Open the combat / turn-order roster for a map.',
        wpOpenHelp: 'Open the Help modal (optionally to a pane + anchor).',
        wpPickImage: 'Open the Image Library to pick a picture.',
        wpPlace: 'The current shape/image placement state (the armed placement tool).',
        wpPlaceCommit: 'Commit a placement at the given box (px, py, pw, ph, sx, sy).',
        wpPlaceDisarm: 'Cancel placement mode.',
        wpPlannerFind: 'Find text within the open planner.',
        wpPrefsPush: 'Push the wp_* settings to saves/preferences.json.',
        wpRefreshBlasts: 'Recompute and redraw the blast templates (e.g. after an elevation/posture change).',
        wpRenderCombatStrip: 'Render the bottom combat turn strip.',
        wpRenderHandouts: 'Render the GM Handouts list.',
        wpRenderNotepad: 'Render the shared table notepad.',
        wpRenderPartyStrip: 'Render the party strip (player character tokens).',
        wpRenderRulers: 'Redraw the coordinate rulers.',
        wpSeatFacings: 'Re-seat token facings (hex facing snapping).',
        wpSeatHex: 'Seat a token into its hex cell.',
        wpSelKey: "The current selection's camera key, e.g. 'r:<id>' (data) or 'w:<id>' (play).",
        wpSelectLink: 'Select a data-map link line by index.',
        wpSettingsSync: 'Refresh the open Settings panel and the Multiplayer panel\'s VTT line from the live state (net.js and vtt.js call it after every change).',
        wpShowInstallerSteps: 'Open the installer-steps dialog (the core-update walk-through).',
        wpShowVttNotice: 'Show the queued VTT join notice for the table on screen, if one is pending (wp_vtt_local). Returns true when it opened.',
        wpShowWhatsNew: 'Open the What’s New view.',
        wpSnapFacing: "Snap a token's rotation to its facing step.",
        wpSnapNewHexItem: 'Seat a newly placed item on a hex grid.',
        wpSheets: 'Character sheets (scripts/sheets.js): open(tab) / close() the System editor, playerSystem(camp) = the view players receive, systemOf, charsOf / charList / charById, newCharacter, deleteCharacter, linkToken, newFromToken, syncOwners, openSheet(id) / closeSheet / canOpen, hoverLinesForToken, fromShadowBase(token), rollInit(charId); charChanged / charGone / editResult are the hooks net.js calls.',
        wpSheetsSync: 'Re-check the Character sheets feature for the campaign or table on screen (called by the VTT toggle fan-out).',
        wpSound: 'The sound engine (sound.js): play(id | entry), stop("ambient" | "all", fade), setVolume(0-1), setMaster(0-1), mute(bool), now(), onChange(fn), openPanel / closePanel / openLib, defaults(); listMessage / onList / onCue and the session hooks net.js calls.',
        wpSoundCore: 'The sound validators and maths (soundcore.js): cleanSoundList, cleanSoundCue, cleanEntry, isUploadPath, mixGain, seamBlend, LIMITS.',
        wpSoundSync: 'Re-check the Sound feature for the campaign or table on screen and stop playback if it is off (called by the VTT toggle fan-out).',
        wpSpacePan: 'Flag - true while Space is held to pan the board from any tool.',
        wpSpawnTokenForCharacter: 'Drop a play-map token for a character. [sandbox hook]',
        wpStance: 'The token-stance API (whiteboard.js): POSTURES, tokenElevation / tokenPosture, setElevation / setPosture, fmtElev, and on(feature) — which delegates to wpVtt.on.',
        wpSyncRightPanel: 'Open/close the right Properties panel to match the current selection.',
        wpTurnToken: "Rotate a token's facing by N steps (+1 = clockwise).",
        wpUploadBlob: 'Upload a picture into an item\'s folder: (mapId, name, blob) → Promise of the /saves/images/… URL (whiteboard.js; the play-map drop, the planner Upload button and the Markdown importer all use it).',
        wpSystemCore: 'The rules model, pure (scripts/systemcore.js): cleanSystem / cleanChar / cleanCharEdit, validateSystem, makeResolver (a vars function for wpFormula), resolveAll, hoverLines, charFor, applyEdit, autoLayout, aliasFromShadowBase, LIMITS, KINDS.',
        wpTutorial: 'The interactive tutorial controller (ensure / start / rebuild / discard).',
        wpUpdateHandles: 'Reposition the resize/rotate handles on the current selection.',
        wpUpdateSelToolbar: 'Re-render and counter-scale the floating selection toolbar.',
        wpUploadImage: 'Upload an image file into the saves folder.',
        wpVersionReady: 'Promise that resolves with the newest known app version.',
        wpVtt: 'VTT feature settings (vtt.js): on(id) is the one gate; mode(), locked(), campaignOn / setCampaign / setMaster (camp.vtt), globalVtt / setGlobal (the default, wp_vtt_global), localOff / setLocal (off-for-me at a table, wp_vtt_local), ceiling() (the GM\'s flags while joined), hostFlags / hostCamps / hostSig (the wire), pushTo(ids), debug().',
        wpWithAlpha: 'Apply an alpha to a color (text / background opacity).',
        wpWithRenderedPlanner: 'Run a callback with a planner fully rendered (used by exports).'
    };

    function norm(s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); }

    // /help — list the headline commands; /help <name> — explain the matching command(s) or wp* global(s) in
    // full. Any real wp* global with no hand-written entry falls back to a live type + arg-count description.
    function help(query) {
        query = (query || '').trim();
        if (query) {
            var q = norm(query), out = [];
            HELP.forEach(function (c) { if (norm(c.name).indexOf(q) >= 0) out.push({ name: c.name, body: c.detail }); });
            Object.keys(DESC).forEach(function (k) { if (norm(k).indexOf(q) >= 0) out.push({ name: k, body: DESC[k] }); });
            if (!out.length) {
                var live = Object.keys(window).filter(function (k) { return /^wp[A-Z]/.test(k) && norm(k).indexOf(q) >= 0; }).sort();
                if (live.length) {
                    live.forEach(function (k) {
                        var v = window[k], kind = typeof v === 'function' ? ('function, ' + v.length + ' arg(s)') : typeof v;
                        addLine(k, 'dc-cmd'); addLine('  ' + kind + ' — internal app global (no note yet). Inspect it by typing:  ' + k, 'dc-out');
                    });
                    return;
                }
                addLine('No command or global matches “' + query + '”. Type /help for the list.', 'dc-err'); return;
            }
            out.forEach(function (c) { addLine(c.name, 'dc-cmd'); addLine('  ' + String(c.body).replace(/\n/g, '\n  '), 'dc-out'); });
            return;
        }
        addLine('Commands (a real JS console — any window global works too).  /help <name> explains one:', 'dc-note');
        var w = 0; HELP.forEach(function (c) { if (c.name.length > w) w = c.name.length; });
        HELP.forEach(function (c) { addLine('  ' + c.name + new Array(w - c.name.length + 3).join(' ') + c.short, 'dc-out'); });
        try {
            var known = { wpDebug: 1, wpReloadFromDisk: 1, wpFitView: 1, wpNet: 1, wpAppVersion: 1, wpDevConsole: 1 };
            var others = Object.keys(window).filter(function (k) { return /^wp[A-Z]/.test(k) && !known[k]; }).sort();
            if (others.length) addLine('Other app globals (each explained by /help <name>): ' + others.join(', '), 'dc-note');
        } catch (e) {}
    }

    // /roll goes through the formula engine (scripts/formula.js): the full syntax, one breakdown, no local roller.
    function rollDice(expr) {
        if (!window.wpFormula) return { ok: false, error: { message: 'wpFormula is not available.', pos: 0, len: 0 } };
        return window.wpFormula.evaluate((expr || '').trim() || 'd20');
    }
    function doRoll(arg) {
        var res = rollDice(arg);
        if (!res.ok) {
            addLine(res.error.message, 'dc-err');
            var src = ((arg || '').trim() || 'd20').replace(/\t/g, ' '), pos = res.error.pos || 0, len = res.error.len || 0;
            if (len) addLine('  ' + src + '\n  ' + new Array(pos + 1).join(' ') + new Array(len + 1).join('^'), 'dc-err');
            return;
        }
        addLine('🎲 ' + window.wpFormula.describe(res), 'dc-out');
    }
    function doTable(arg) {
        if (!window.wpDice) { addLine('wpDice is not available.', 'dc-err'); return; }
        var r = window.wpDice.roll(arg, { source: 'chat' });
        addLine(r.error ? r.error : (r.pending ? 'Sent to the GM.' : 'Rolled at the table.'), r.error ? 'dc-err' : 'dc-note');
    }
    function doState() {
        if (!window.wpDebug) { addLine('wpDebug is not available yet.', 'dc-err'); return; }
        addLine(fmt(window.wpDebug.getState()), 'dc-out');
    }
    function doFind(arg) {
        arg = (arg || '').trim();
        if (!window.wpCmdkOpen) { addLine('Quick-jump (wpCmdkOpen) is not available.', 'dc-err'); return; }
        close();                                         // the palette sits below the console — step out of its way
        window.wpCmdkOpen();
        if (arg) setTimeout(function () {
            var inp = document.getElementById('cmdkInput');
            if (inp) { inp.value = arg; inp.dispatchEvent(new Event('input', { bubbles: true })); }
        }, 40);
    }

    // Slash meta-commands (not JS). Only these exact words are intercepted, so a regex literal like
    // /foo/.test(x) still evaluates normally.
    var CMDS = {
        help: function (a) { help(a); }, '?': function (a) { help(a); },
        clear: function () { clear(); },
        roll: function (a) { doRoll(a); }, r: function (a) { doRoll(a); },
        table: function (a) { doTable(a); },
        state: function () { doState(); },
        fit: function (a) { if (window.wpFitView) window.wpFitView(/^s/i.test(a)); else addLine('wpFitView is not available.', 'dc-err'); },
        reload: function () { if (window.wpReloadFromDisk) { window.wpReloadFromDisk(); addLine('Reloaded from disk.', 'dc-note'); } else addLine('wpReloadFromDisk is not available.', 'dc-err'); },
        save: function () { if (window.wpSave) { window.wpSave(true); addLine('Saved.', 'dc-note'); } else addLine('wpSave is not available.', 'dc-err'); },
        find: function (a) { doFind(a); }
    };

    function open() {
        if (!ready()) return;
        panel.style.display = 'flex';
        if (!seeded) {
            addLine('Waypoint dev console — JavaScript with the page globals in scope.', 'dc-note');
            addLine('Commands: /help  /roll 2d6+3  /state  /fit  /reload  /save  /find  ·  /help <name> explains one  ·  Esc closes.', 'dc-note');
            seeded = true;
        }
        setTimeout(function () { if (input) input.focus(); }, 0);
    }
    function close() { if (panel) panel.style.display = 'none'; }
    function toggle() { isOpen() ? close() : open(); }
    function clear() { if (logEl) logEl.innerHTML = ''; seeded = false; }

    function run(cmd) {
        addLine('› ' + cmd, 'dc-cmd');
        if (cmd !== hist[hist.length - 1]) {
            hist.push(cmd); if (hist.length > 100) hist.shift();
            try { localStorage.setItem('wp_devconsole_hist', JSON.stringify(hist)); } catch (e) {}
        }
        histIdx = hist.length;
        var slash = /^\/([a-z?]+)(?:\s+([\s\S]*))?$/i.exec(cmd.trim());   // only the words in CMDS are intercepted; /foo/.test(y) still evals
        if (slash && CMDS[slash[1].toLowerCase()]) { CMDS[slash[1].toLowerCase()](slash[2] || ''); return; }
        var r;
        try { r = (0, eval)(cmd); } catch (e) { addLine(String((e && e.stack) || e), 'dc-err'); return; }   // indirect eval → global scope, so window.* is reachable
        if (r && typeof r.then === 'function') {
            addLine('(pending…)', 'dc-note');
            r.then(function (v) { addLine(fmt(v), 'dc-out'); }, function (e) { addLine('Rejected: ' + String((e && e.stack) || e), 'dc-err'); });
        } else {
            addLine(fmt(r), 'dc-out');
        }
    }

    function onInputKey(e) {
        if (e.key === 'Enter') { e.preventDefault(); var v = input.value; if (v.trim()) run(v); input.value = ''; histIdx = hist.length; return; }
        if (e.key === 'Escape') { e.preventDefault(); close(); return; }
        if (e.code === 'Backquote' && input.value === '') { e.preventDefault(); close(); return; }   // ~ on an empty line closes; with text typed it inserts a backtick (template literals)
        if (e.key === 'ArrowUp') {
            if (!hist.length) return; e.preventDefault();
            histIdx = Math.max(0, histIdx - 1); input.value = hist[histIdx] || '';
            setTimeout(function () { try { input.setSelectionRange(input.value.length, input.value.length); } catch (_) {} }, 0);
            return;
        }
        if (e.key === 'ArrowDown') {
            if (!hist.length) return; e.preventDefault();
            histIdx = Math.min(hist.length, histIdx + 1); input.value = histIdx < hist.length ? (hist[histIdx] || '') : '';
            return;
        }
    }

    // ~ toggles the console — but only when enabled in Settings, and never from a text field (so backticks
    // still type normally in inputs, text boxes and the planner). When the console input is focused, its own
    // handler owns the key.
    window.addEventListener('keydown', function (e) {
        if (e.code !== 'Backquote' || e.ctrlKey || e.metaKey || e.altKey) return;
        if (!enabled()) return;                          // gated behind the Settings ▸ Advanced toggle (off by default)
        var t = e.target;
        if (t && t.id === 'devConsoleInput') return;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
        e.preventDefault();
        toggle();
    });

    window.wpDevConsole = { open: open, close: close, toggle: toggle, clear: clear, help: help, roll: rollDice };
})();
