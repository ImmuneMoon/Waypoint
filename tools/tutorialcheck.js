/* Keeps the interactive tutorial honest: every static target in scripts/tutorial.js STEPS
   (a "#id" selector) must still exist in index.html. Run it directly or let release.js run
   it — a missing target fails the build, because a tour that points at nothing is worse
   than no tour. Usage: node tools/tutorialcheck.js */
'use strict';
const fs = require('fs');
const path = require('path');
const app = path.join(__dirname, '..', 'system', 'app');
const html = fs.readFileSync(path.join(app, 'index.html'), 'utf8');
const src = fs.readFileSync(path.join(app, 'scripts', 'tutorial.js'), 'utf8');
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
const targets = [...src.matchAll(/target:\s*'([^']+)'/g)].map(m => m[1]);
let bad = 0;
for (const t of targets) {
    const m = /^#([A-Za-z0-9_-]+)$/.exec(t);
    const mc = /^#([A-Za-z0-9_-]+) \.([A-Za-z0-9_-]+)$/.exec(t);   // "#layer .cls": a window the step's own setup opens (opens: true), cloned from a template
    if (mc) {
        const opens = src.includes("target: '" + t + "', opens: true"), cls = new RegExp('class="[^"]*\\b' + mc[2] + '\\b').test(html);
        if (ids.has(mc[1]) && cls && opens) console.log('ok       ', t, '(opened by its step)');
        else { bad++; console.log('MISSING  ', t, '— needs #' + mc[1] + ' in index.html, class ' + mc[2] + ' in its template, and opens: true on the step'); }
        continue;
    }
    if (!m) { console.log('skip     ', t, '(not a plain id — checked at run time only)'); continue; }
    if (ids.has(m[1])) console.log('ok       ', t);
    else { bad++; console.log('MISSING  ', t, '— that element is gone from index.html; update STEPS in scripts/tutorial.js'); }
}
// The first launch (the owner's word, 2026-10-01: the tour starts in Waypoint proper, before the first campaign is made — the Tutorial campaign is
// the first unless they skip the tour, and the prompt naming their own comes when the tour ends or is skipped — never over the welcome screen):
// the autostart slice and saveIsFresh run for real on a page of plain objects with fake timers. Each case fails without its gate.
{
    const nl = String.fromCharCode(10), lf = src.replace(/\r\n/g, nl), mainLf = fs.readFileSync(path.join(app, 'scripts', 'main.js'), 'utf8').replace(/\r\n/g, nl);
    const cut = (a, b) => { const i = lf.indexOf(a), k = lf.indexOf(b, i); if (i < 0 || k < 0) throw new Error('tutorialcheck: ' + a + ' not found'); return lf.slice(i, k); };
    const freshSrc = cut('function saveIsFresh() {', nl + '}' + nl) + nl + '}' + nl, autoSrc = cut('// [tutorialcheck:autostart-start]', '// [tutorialcheck:autostart-end]');
    const scenario = (o) => {
        const timers = [], store = {}, started = [], els = { welcomeScreen: { style: { display: o.welcome ? 'flex' : '' } }, customPrompt: { style: { display: o.prompt ? 'flex' : 'none' } }, customConfirm: { style: { display: 'none' } }, importChoiceModal: { style: { display: 'none' } } };
        const env = {
            state: { appState: { campaigns: o.campaigns === undefined ? { c1: { items: { m1: { type: 'map', rooms: [], whiteboard: [] } } } } : o.campaigns } },
            document: { getElementById: id => els[id] || null }, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
            window: { wpNet: { active: !!o.net }, __wpCleanupBusy: false }, location: { search: o.stream ? '?stream=1' : '' },
            setInterval: (fn, ms) => { const h = { fn, ms, on: true }; timers.push(h); return h; }, clearInterval: h => { if (h) h.on = false; },
            setTimeout: (fn, ms) => { started.push(ms); fn(); }, startTour: () => { started.push('tour'); },
        };
        if (o.seen) store.wp_tourSeen = '1';
        const api = new Function('state', 'document', 'localStorage', 'window', 'location', 'setInterval', 'clearInterval', 'setTimeout', 'startTour', '"use strict";' + nl + freshSrc + autoSrc + nl + 'return { pending: tourPending };')(env.state, env.document, env.localStorage, env.window, env.location, env.setInterval, env.clearInterval, env.setTimeout, env.startTour);
        const tick = n => { for (let i = 0; i < n; i++) timers.forEach(h => { if (h.on) h.fn(); }); };
        return { tick, els, env, started, store, timers, api };
    };
    const tourStarted = s => s.started.indexOf('tour') >= 0;
    // in Waypoint proper from the start (the welcome off): the tour starts once, the mark set, no campaign of the user's needed first
    const plain = scenario({}); const plainPending = plain.api.pending(); plain.tick(2);
    // the welcome up: it waits as long as the welcome shows (60 ticks and more), starts the tick after it closes — before any campaign is made — and never twice
    const wc = scenario({ welcome: true }); wc.tick(60); const wcWaited = !tourStarted(wc) && !('wp_tourSeen' in wc.store) && wc.api.pending() === true;
    wc.els.welcomeScreen.style.display = 'none'; wc.tick(1); const wcThen = tourStarted(wc) && wc.store.wp_tourSeen === '1' && wc.api.pending() === false; wc.tick(5);
    // a dialog up as the welcome closes (a prompt, the import's choice): the tour waits for it; a save that still holds nothing starts it after
    const pr = scenario({ welcome: true }); pr.tick(3); pr.els.welcomeScreen.style.display = 'none'; pr.els.customPrompt.style.display = 'flex'; pr.tick(10); const prWaited = !tourStarted(pr);
    pr.els.customPrompt.style.display = 'none'; pr.els.importChoiceModal.style.display = 'flex'; pr.tick(5); const prWaited2 = !tourStarted(pr);
    pr.els.importChoiceModal.style.display = 'none'; pr.env.window.wpWelcomeImporting = true; pr.tick(5); const prWaited3 = !tourStarted(pr);
    pr.env.window.wpWelcomeImporting = false; pr.env.state.appState.campaigns.c2 = { items: {} }; pr.tick(1); const prThen = tourStarted(pr);
    // a join from the welcome: at a table, never — and the mark not set, so the next launch alone may offer it
    const joined = scenario({ welcome: true }); joined.tick(2); joined.env.window.wpNet.active = true; const joinedPending = joined.api.pending(); joined.els.welcomeScreen.style.display = 'none'; joined.tick(3);
    // an existing table (a campaign with a room, or a planner), judged when the welcome closes: never, and marked seen; one imported while the welcome was up alike
    const old = scenario({ welcome: true, campaigns: { c1: { items: { m1: { type: 'map', rooms: [{ id: 'r' }], whiteboard: [] } } } } }); const oldPending = old.api.pending(); old.tick(2); old.els.welcomeScreen.style.display = 'none'; old.tick(2);
    const imp = scenario({ welcome: true }); imp.tick(2); imp.env.state.appState.campaigns.c9 = { items: { p: { type: 'planner' } } }; imp.els.welcomeScreen.style.display = 'none'; imp.tick(2);
    // seen already, the stream window, or a save that never loads: nothing (and pending false for a seen or empty save)
    const seen = scenario({ seen: true }); seen.tick(3); const strm = scenario({ stream: true }); strm.tick(3);
    const never = scenario({ campaigns: {} }); never.tick(45);
    const ok = plainPending === true && tourStarted(plain) && plain.started.filter(x => x === 'tour').length === 1 && plain.store.wp_tourSeen === '1'
        && wcWaited && wcThen && wc.started.filter(x => x === 'tour').length === 1
        && prWaited && prWaited2 && prWaited3 && prThen
        && joinedPending === false && !tourStarted(joined) && !('wp_tourSeen' in joined.store) && joined.timers.every(h => !h.on)
        && oldPending === false && !tourStarted(old) && old.store.wp_tourSeen === '1' && !tourStarted(imp) && imp.store.wp_tourSeen === '1'
        && seen.api.pending() === false && !tourStarted(seen) && seen.timers.length === 0 && !tourStarted(strm) && strm.timers.length === 0 && never.api.pending() === false && !tourStarted(never) && never.timers.every(h => !h.on) && !('wp_tourSeen' in never.store);
    if (ok) console.log('ok        first launch (run for real): the tour starts in Waypoint proper — the tick after the welcome screen closes, before any campaign is made, waiting for a prompt, the import choice or an import picked from the welcome; never over the welcome, never at a table joined from it (not marked seen then), never for an existing or imported table (marked seen), never when seen, in the stream window or when nothing loads; wpTutorial.pending true only for a fresh, unseen save off a table');
    else { bad++; console.log('FAIL      first launch (run for real): the tour starts in Waypoint proper, the tick after the welcome closes, before any campaign is made; waits for a dialog; never over the welcome, at a table, or for an existing table', JSON.stringify({ plainPending, plain: plain.started, wcWaited, wcThen, wc: wc.started, prWaited, prWaited2, prWaited3, prThen, joinedPending, joined: joined.started, joinedStore: joined.store, oldPending, old: old.store, imp: imp.store, seen: seen.timers.length, strm: strm.timers.length, never: never.store })); }
    // the welcome's Start a campaign: on a save the tour is owed to it enters and notes that the naming prompt is owed (wpCampaignAfterTour), the prompt
    // not opened; else the prompt as ever. Import from the welcome holds the tour (wpWelcomeImporting) until the file is chosen or dropped. endTour opens
    // the owed prompt once, after the tour or its Skip
    const startPinned = /wcStartBtn'\); if \(startBtn\) startBtn\.addEventListener\('click', function\(\) \{ saveWcProfile\(\); hideWelcome\(\); if \(window\.wpTutorial && window\.wpTutorial\.pending && window\.wpTutorial\.pending\(\)\) \{ window\.wpCampaignAfterTour = true; return; \} var b = document\.getElementById\('newCampBtn'\); if \(b\) b\.click\(\); \}\);/.test(mainLf);
    const importPinned = /wcLoadBtn'\); if \(loadBtn\) loadBtn\.addEventListener\('click', function\(\) \{ saveWcProfile\(\); hideWelcome\(\); window\.wpWelcomeImporting = true;[^\n]*fi\.addEventListener\('change', done, \{ once: true \}\); fi\.addEventListener\('cancel', done, \{ once: true \}\);[^\n]*importBtn'\); if \(b\) b\.click\(\); \}\);/.test(mainLf);
    const endPinned = /function endTour\(\) \{\n[\s\S]*?if \(window\.wpCampaignAfterTour === true\) \{ window\.wpCampaignAfterTour = false; var nbT = document\.getElementById\('newCampBtn'\); if \(nbT\) setTimeout\(function\(\) \{ nbT\.click\(\); \}, 300\); \}[^\n]*\n\}/.test(lf)
        && /if \(q\('tourSkip'\)\) q\('tourSkip'\)\.addEventListener\('click', endTour\);/.test(lf) && /q\('tourKeepEnd'\)\.addEventListener\('click', function\(\) \{ endTour\(\);/.test(lf) && /q\('tourDiscardEnd'\)\.addEventListener\('click', function\(\) \{ endTour\(\); discardTutorialCampaign\(\); \}\);/.test(lf)
        && /pending: tourPending,/.test(lf);
    // a fresh Waypoint lists no campaign to continue: the seeded Default Campaign with nothing in it stays off the welcome's list (wcSeedOnly, run for real)
    const seedSrc = (m => { const i = mainLf.indexOf(m[0]), k = mainLf.indexOf(m[1], i); if (i < 0 || k < 0) throw new Error('tutorialcheck: wcseed markers not found'); return mainLf.slice(i, k); })(['// [tutorialcheck:wcseed-start]', '// [tutorialcheck:wcseed-end]']);
    const wcSeedOnly = new Function('"use strict";' + nl + seedSrc + nl + 'return wcSeedOnly;')();
    const emptyMap = () => ({ type: 'map', rooms: [], whiteboard: [] });
    const seedOk = wcSeedOnly({ name: 'Default Campaign', items: { m: emptyMap() } }) === true && wcSeedOnly({ name: 'Default Campaign', items: {} }) === true
        && wcSeedOnly({ name: 'Default Campaign', items: { m: emptyMap(), p: { type: 'planner', blocks: [] } } }) === false && wcSeedOnly({ name: 'Default Campaign', items: { m: { type: 'map', rooms: [{ id: 'r' }], whiteboard: [] } } }) === false
        && wcSeedOnly({ name: 'Default Campaign', items: { m: { type: 'map', rooms: [], whiteboard: [{ id: 'w' }] } } }) === false && wcSeedOnly({ name: 'My New Campaign', items: {} }) === false && wcSeedOnly({ name: 'Tutorial', items: { m: emptyMap() } }) === false
        && wcSeedOnly(null) === false && wcSeedOnly({ name: 'Default Campaign' }) === true
        && /var ids = Object\.keys\(camps\)\.filter\(function\(id\) \{ return !wcSeedOnly\(camps\[id\]\); \}\);\n\s*if \(!ids\.length\) \{ box\.style\.display = 'none'; return; \}/.test(mainLf);
    if (seedOk) console.log('ok        a fresh Waypoint lists no campaign to continue: the seeded Default Campaign with nothing in it (no room, no drawing, no planner or page) is left off the welcome\'s list and the box hidden, run for real; one with anything in it, or under any other name, is listed');
    else { bad++; console.log('FAIL      a fresh Waypoint lists no campaign to continue (wcSeedOnly)'); }
    // "Show this on launch" is set once from the welcome: the wclaunch slice run for real on a stub page — the row shown while nothing is stored, the first
    // leaving storing the select's word (a word that is none reads as Every time) and the Settings select following, a stored choice hiding the row and never overwritten
    const launchSrc = (m => { const i = mainLf.indexOf(m[0]), k = mainLf.indexOf(m[1], i); if (i < 0 || k < 0) throw new Error('tutorialcheck: wclaunch markers not found'); return mainLf.slice(i, k); })(['// [tutorialcheck:wclaunch-start]', '// [tutorialcheck:wclaunch-end]']);
    const launchPage = (stored, sel) => { const store = {}; if (stored !== null) store.wp_welcome = stored; const row = { style: { display: '' } }, s1 = { value: sel }, s2 = { value: 'x' };
        const api = new Function('localStorage', 'document', '"use strict";' + nl + launchSrc + nl + 'return { set: welcomePrefSet, row: wcLaunchRow, once: wcLaunchStoreOnce };')({ getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }, { querySelector: q => (q === '#welcomeScreen .wc-launch' ? row : null), getElementById: id => (id === 'wcLaunchPref' ? s1 : id === 'setWelcomePref' ? s2 : null) });
        return { api, store, row, s1, s2 }; };
    const L1 = launchPage(null, 'first'); const l1a = L1.api.set() === false; L1.api.row(!L1.api.set()); const l1b = L1.row.style.display === ''; L1.api.once(); const l1c = L1.store.wp_welcome === 'first' && L1.s2.value === 'first' && L1.api.set() === true; L1.api.row(!L1.api.set()); const l1d = L1.row.style.display === 'none';
    const L2 = launchPage('never', 'always'); L2.api.once(); const l2 = L2.store.wp_welcome === 'never' && L2.s2.value === 'x' && L2.api.set() === true;
    const L3 = launchPage(null, 'junk'); L3.api.once(); const l3 = L3.store.wp_welcome === 'always';
    const launchWired = /function hideWelcome\(\) \{ wcLaunchStoreOnce\(\); var w = document\.getElementById\('welcomeScreen'\);/.test(mainLf) && /wcLaunchRow\(!welcomePrefSet\(\)\);/.test(mainLf) && /id="setWelcomePref"/.test(html);
    if (l1a && l1b && l1c && l1d && l2 && l3 && launchWired) console.log('ok        "Show this on launch" is a one-time choice on the welcome (run for real): the row shows while nothing is stored, the first leaving of the welcome stores the select\'s word (a word that is none reads as Every time) and the Settings select follows, a stored choice hides the row and is never overwritten by the welcome; wired into hideWelcome and showWelcome, with Settings\' own select on the page');
    else { bad++; console.log('FAIL      "Show this on launch" is a one-time choice on the welcome', JSON.stringify({ l1a, l1b, l1c, l1d, l2, l3, launchWired })); }
    if (startPinned && importPinned && endPinned) console.log('ok        the welcome\'s Start a campaign on a fresh, unseen save enters Waypoint and owes the naming prompt (wpCampaignAfterTour) instead of opening it; endTour — the last step, Keep, Discard, Skip and Esc all go through it — opens that prompt once, after the tour; Import from the welcome holds the tour until the file is chosen or dropped; wpTutorial.pending published');
    else { bad++; console.log('FAIL      the welcome\'s Start a campaign / the prompt after the tour / Import\'s hold pinned', JSON.stringify({ startPinned, importPinned, endPinned })); }
}
// The tour's keys (the keys slice run for real): while the tour is up Right arrow and Enter go on and Left arrow goes back — never from a field. A
// planner's boxes are editable as plain text only, so a field is told by the element itself (isContentEditable), not by one word of an attribute.
{
    const nl = String.fromCharCode(10), lf = src.replace(/\r\n/g, nl), a = lf.indexOf('// [tutorialcheck:keys-start]'), z = lf.indexOf('// [tutorialcheck:keys-end]');
    let res = null, why = '';
    if (a < 0 || z < a) why = 'the keys slice is not marked in tutorial.js';
    else {
        const world = () => { const calls = [], tour = { active: true }, tourKey = new Function('tour', 'next', 'endTour', '"use strict";' + nl + lf.slice(a, z) + nl + 'return tourKey;')(tour, d => { calls.push('next ' + d); }, () => { calls.push('end'); }); return { calls, tour, tourKey }; };
        // an element as the page has it: the selectors it answers to itself, whether it is being edited in place, what it lies in
        const el = (own, editable, parent) => ({ own, parent: parent || null, isContentEditable: !!editable, closest(sel) { const alts = sel.split(',').map(s => s.trim()); for (let n = this; n; n = n.parent) if (alts.some(x => n.own.indexOf(x) >= 0)) return n; return null; } });
        const box = el(['div', '.ts-box', '[contenteditable]', '[contenteditable="plaintext-only"]'], true), run = el(['span', '.tsr'], true, box), rte = el(['div', '.rte-body', '[contenteditable]', '[contenteditable="true"]'], true), bold = el(['b'], true, rte);
        const input = el(['input'], false), area = el(['textarea'], false), list = el(['select'], false), button = el(['button'], false), page = el(['body'], false);
        const press = (w, key, target) => { const e = { key, target, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }; w.tourKey(e); return e; };
        const w1 = world(), spared = [box, run, rte, bold, input, area, list].every(t => ['ArrowRight', 'Enter', 'ArrowLeft', 'a', 'Home'].every(k => !press(w1, k, t).prevented)) && w1.calls.length === 0;
        const w2 = world(), moved = [press(w2, 'ArrowRight', page), press(w2, 'Enter', button), press(w2, 'ArrowLeft', page), press(w2, 'ArrowLeft', button)].every(e => e.prevented) && !press(w2, 'a', page).prevented && JSON.stringify(w2.calls) === JSON.stringify(['next 1', 'next 1', 'next -1', 'next -1']);
        const w3 = world(), esc = press(w3, 'Escape', box), ended = esc.prevented && esc.stopped && JSON.stringify(w3.calls) === JSON.stringify(['end']);
        const w4 = world(); w4.tour.active = false; const off = ['Escape', 'ArrowRight', 'Enter', 'ArrowLeft'].every(k => !press(w4, k, page).prevented) && w4.calls.length === 0;
        const wired = /document\.addEventListener\('keydown', tourKey, true\);/.test(lf);
        res = spared && moved && ended && off && wired; why = JSON.stringify({ spared, moved, ended, off, wired, calls: w1.calls });
    }
    if (res) console.log('ok        the tour\'s keys (run for real): while the tour is up, Right arrow, Enter and Left arrow pressed in a field are the field\'s — a planner\'s box (editable as plain text only) and a run inside it, a text block, an input, a textarea, a list — and the tour does not move; anywhere else they go on and back; Esc ends the tour from anywhere; with the tour off no key is touched');
    else { bad++; console.log('FAIL      the tour\'s keys: Right arrow, Enter and Left arrow in a field (a planner\'s box among them) must be left to the field', why); }
}
const ver = (src.match(/TUTORIAL_VERSION = '([^']+)'/) || [])[1];
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'system', 'resources', 'app', 'package.json'), 'utf8')).version;
if (ver !== pkg) console.log('note      tutorial version ' + ver + ' vs app ' + pkg + ' — bump TUTORIAL_VERSION if the tour or demo changed this release');
if (bad) { console.log('\n' + bad + ' tutorial target(s) missing.'); process.exit(1); }
console.log('\nTutorial targets all present (' + targets.length + ' steps checked).');
