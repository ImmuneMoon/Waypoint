// In-app developer console. Press ~ (backtick) anywhere outside a text field to drop it down; type a
// JavaScript expression or statement and press Enter to run it, with the page's globals in scope —
// window.wpDebug.getState(), window.wpReloadFromDisk(), window.wpNet, window.wpFitView, and the rest.
// Up/Down walk the history (kept in localStorage), Esc — or ~ on an empty line — closes it. A power/dev
// tool: no button, hidden until summoned. It only runs what YOU type, so it is harmless to ship, matching
// the other sandbox hooks. Self-contained: no imports, no app state touched beyond the window globals.
(function () {
    var panel = null, logEl = null, input = null, seeded = false;
    var hist = [], histIdx = 0;
    try { var h = JSON.parse(localStorage.getItem('wp_devconsole_hist') || '[]'); if (Array.isArray(h)) hist = h; } catch (e) {}
    histIdx = hist.length;

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

    function open() {
        if (!ready()) return;
        panel.style.display = 'flex';
        if (!seeded) {
            addLine('Waypoint dev console — runs JavaScript with the page globals in scope.', 'dc-note');
            addLine('Try:  wpDebug.getState()   ·   wpReloadFromDisk()   ·   wpDevConsole.clear()   ·   Esc closes.', 'dc-note');
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

    // ~ toggles the console from anywhere that isn't a text field (so backticks still type normally in
    // inputs, text boxes and the planner). When the console input is focused, its own handler owns the key.
    window.addEventListener('keydown', function (e) {
        if (e.code !== 'Backquote' || e.ctrlKey || e.metaKey || e.altKey) return;
        var t = e.target;
        if (t && t.id === 'devConsoleInput') return;
        if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
        e.preventDefault();
        toggle();
    });

    window.wpDevConsole = { open: open, close: close, toggle: toggle, clear: clear };
})();
