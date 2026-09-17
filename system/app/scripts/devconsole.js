// In-app developer console. OFF by default — enable it in Settings ▸ Advanced (which sets wp_devconsole=on);
// then press ~ (backtick) anywhere outside a text field to drop it down. Type JavaScript and Enter runs it,
// with the page's globals in scope — window.wpDebug.getState(), window.wpReloadFromDisk(), window.wpFitView(),
// window.wpNet, and the rest. Meta-commands: /help (or /help <name>), /roll 2d6+3, /state, /fit, /reload,
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
        { name: '/roll <expr>', short: 'roll dice, e.g.  /roll 2d6+3   (also /r)',
          detail: 'Roll a dice expression and show the breakdown + total. NdM with + and -, several terms:\n  /roll 2d6+3      /roll d20+5      /roll 4d6-2      /roll d20\nUp to 100dN with N up to 1000; bare /roll rolls d20. A LOCAL roll printed here only — the full\nrules-aware dice that post to chat and the session log come with the VTT system.' },
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
          detail: 'Returns a plain object (ids and primitives only — no live refs to mutate):\n  activeCampaignId, activeItemId   the campaign, and the open map or planner\n  mapIds, plannerIds               ids in the active campaign\n  viewMode, zoomLevel              "data" | "visual", and the current zoom\n  selId / selWbId / selWbIds       the current selection (data map / play map)\n  netRole                          "host" | "client" | "offline"\n  version                          the running app version\nExample:  wpDebug.getState().mapIds.length' },
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
        wpDuplicateWb: 'Duplicate the selected play-map items (same as Ctrl+D).',
        wpEditTextBox: 'Open the in-place editor for a text box, by id.',
        wpEraserCursorHide: "Hide the eraser's circle cursor.",
        wpFilePrefs: 'The shared table preferences backed by saves/preferences.json.',
        wpFitToGrid: 'Size the selection to whole grid cells and seat it (square or hex).',
        wpFocusCharacter: 'Jump the camera to a character token and select it (the party-strip action).',
        wpHandoutList: "List the current campaign's handouts.",
        wpHandoutPayload: "Build a handout's wire payload for sending to players.",
        wpHideTooltip: 'Hide the play-map hover card (#wbTooltip).',
        wpImgCatEnsure: 'Ensure an Image Library category exists.',
        wpImgCatRename: 'Rename an Image Library category.',
        wpJournalAddNote: 'Add a note to your Journal (title + text).',
        wpJournalDefaultPage: "The Journal's default landing-page setting.",
        wpJournalReceive: 'Receive a revealed handout into the Journal.',
        wpLinkTypes: 'The data-map link styles - path / route / secret / one-way.',
        wpMeasureKind: "The measure sub-mode - 'ruler' or 'blast'.",
        wpNewOpacityProps: 'The default opacity props applied to newly placed items.',
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
        wpShowInstallerSteps: 'Open the installer-steps dialog (the core-update walk-through).',
        wpShowWhatsNew: 'Open the What’s New view.',
        wpSnapFacing: "Snap a token's rotation to its facing step.",
        wpSnapNewHexItem: 'Seat a newly placed item on a hex grid.',
        wpSpacePan: 'Flag - true while Space is held to pan the board from any tool.',
        wpSpawnTokenForCharacter: 'Drop a play-map token for a character. [sandbox hook]',
        wpStance: "On clients, the GM's elevation/posture visibility flags.",
        wpSyncRightPanel: 'Open/close the right Properties panel to match the current selection.',
        wpTurnToken: "Rotate a token's facing by N steps (+1 = clockwise).",
        wpTutorial: 'The interactive tutorial controller (ensure / start / rebuild / discard).',
        wpUpdateHandles: 'Reposition the resize/rotate handles on the current selection.',
        wpUpdateSelToolbar: 'Re-render and counter-scale the floating selection toolbar.',
        wpUploadImage: 'Upload an image file into the saves folder.',
        wpVersionReady: 'Promise that resolves with the newest known app version.',
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

    // Local dice roll: NdM terms with + / - constants. A convenience print, not the rules-aware VTT dice.
    function rollDice(expr) {
        var s = (expr || '').replace(/\s+/g, '');
        if (!s) s = 'd20';
        if (!/^[0-9dD+\-]+$/.test(s)) return { error: 'Only NdM with + and - is supported, e.g.  /roll 2d6+3' };
        var terms = s.match(/[+-]?[^+-]+/g);
        if (!terms) return { error: 'nothing to roll' };
        var total = 0, parts = [];
        for (var i = 0; i < terms.length; i++) {
            var t = terms[i], sign = 1, body = t;
            if (t.charAt(0) === '+') body = t.slice(1);
            else if (t.charAt(0) === '-') { sign = -1; body = t.slice(1); }
            var m = /^(\d*)d(\d+)$/i.exec(body);
            if (m) {
                var n = m[1] ? parseInt(m[1], 10) : 1, faces = parseInt(m[2], 10);
                if (n < 1 || n > 100 || faces < 1 || faces > 1000) return { error: 'dice out of range (up to 100dN, N up to 1000)' };
                var rolls = [];
                for (var j = 0; j < n; j++) { var r = 1 + Math.floor(Math.random() * faces); rolls.push(r); total += sign * r; }
                parts.push((sign < 0 ? '- ' : (parts.length ? '+ ' : '')) + body + ' [' + rolls.join(', ') + ']');
            } else if (/^\d+$/.test(body)) {
                var c = parseInt(body, 10); total += sign * c;
                parts.push((sign < 0 ? '- ' : (parts.length ? '+ ' : '')) + c);
            } else { return { error: 'cannot parse “' + t + '”' }; }
        }
        return { total: total, breakdown: parts.join(' '), expr: s };
    }
    function doRoll(arg) {
        var res = rollDice(arg);
        if (res.error) { addLine(res.error, 'dc-err'); return; }
        addLine('🎲 ' + res.expr + '   →   ' + res.breakdown + '   =   ' + res.total, 'dc-out');
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
