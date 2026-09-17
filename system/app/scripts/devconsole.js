// In-app developer console. OFF by default — enable it in Settings ▸ Advanced (which sets wp_devconsole=on);
// then press ~ (backtick) anywhere outside a text field to drop it down. Type a JavaScript expression or
// statement and Enter runs it, with the page's globals in scope — window.wpDebug.getState(),
// window.wpReloadFromDisk(), window.wpFitView(), window.wpNet, and the rest. Meta-commands: /help (or /?)
// lists the pertinent app commands, /clear clears. Up/Down walk the history (localStorage), Esc — or ~ on an
// empty line — closes it. A power/dev tool: it only runs what YOU type, matching the other sandbox hooks.
// Self-contained: no imports, no app state touched beyond the window globals. The wpDevConsole.* API stays
// callable from scripts even when the ~ key is gated off.
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

    // /help — the pertinent app commands, plus any other wp* globals detected live so the list can't go stale.
    function help() {
        var CMDS = [
            ['/help  or  /?', 'this list'],
            ['/clear', 'clear the console (also wpDevConsole.clear())'],
            ['wpDebug.getState()', 'read-only snapshot: active campaign/item, map & planner ids, view, zoom, selection, net role, version'],
            ['wpReloadFromDisk()', 'drop the pending autosave and re-read data.json from disk (an external rebuild shows up)'],
            ['wpFitView(sel)', 'zoom + pan to frame every item — or just the selection when sel is true (same as Shift+1)'],
            ['wpNet', 'multiplayer state — wpNet.active, wpNet.role ("host" / "client")'],
            ['wpAppVersion', 'the running app version string'],
            ['wpDevConsole', 'open() · close() · toggle() · clear() this console']
        ];
        addLine('Commands (this is a real JS console — any window global works too):', 'dc-note');
        var w = 0; CMDS.forEach(function (c) { if (c[0].length > w) w = c[0].length; });
        CMDS.forEach(function (c) { addLine('  ' + c[0] + new Array(w - c[0].length + 3).join(' ') + c[1], 'dc-out'); });
        try {
            var known = { wpDebug: 1, wpReloadFromDisk: 1, wpFitView: 1, wpNet: 1, wpAppVersion: 1, wpDevConsole: 1 };
            var others = Object.keys(window).filter(function (k) { return /^wp[A-Z]/.test(k) && !known[k]; }).sort();
            if (others.length) addLine('Other app globals: ' + others.join(', '), 'dc-note');
        } catch (e) {}
    }

    function open() {
        if (!ready()) return;
        panel.style.display = 'flex';
        if (!seeded) {
            addLine('Waypoint dev console — runs JavaScript with the page globals in scope.', 'dc-note');
            addLine('Type  /help  for the command list.   Esc — or ~ on an empty line — closes.', 'dc-note');
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
        var slash = /^\/(help|clear|\?)\s*$/i.exec(cmd.trim());   // meta-commands, not JS — a regex literal like /x/.test(y) still evals
        if (slash) { if (slash[1].toLowerCase() === 'clear') clear(); else help(); return; }
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

    window.wpDevConsole = { open: open, close: close, toggle: toggle, clear: clear, help: help };
})();
