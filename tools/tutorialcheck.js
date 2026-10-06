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
        const world = () => { const calls = [], tour = { active: true }, tourKey = new Function('tour', 'next', 'askEnd', '"use strict";' + nl + lf.slice(a, z) + nl + 'return tourKey;')(tour, d => { calls.push('next ' + d); }, () => { calls.push('ask'); }); return { calls, tour, tourKey }; };
        // an element as the page has it: the selectors it answers to itself, whether it is being edited in place, what it lies in
        const el = (own, editable, parent) => ({ own, parent: parent || null, isContentEditable: !!editable, closest(sel) { const alts = sel.split(',').map(s => s.trim()); for (let n = this; n; n = n.parent) if (alts.some(x => n.own.indexOf(x) >= 0)) return n; return null; } });
        const box = el(['div', '.ts-box', '[contenteditable]', '[contenteditable="plaintext-only"]'], true), run = el(['span', '.tsr'], true, box), rte = el(['div', '.rte-body', '[contenteditable]', '[contenteditable="true"]'], true), bold = el(['b'], true, rte);
        const input = el(['input'], false), area = el(['textarea'], false), list = el(['select'], false), button = el(['button'], false), page = el(['body'], false);
        const press = (w, key, target) => { const e = { key, target, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } }; w.tourKey(e); return e; };
        const w1 = world(), spared = [box, run, rte, bold, input, area, list].every(t => ['ArrowRight', 'Enter', 'ArrowLeft', 'a', 'Home'].every(k => !press(w1, k, t).prevented)) && w1.calls.length === 0;
        const w2 = world(), moved = [press(w2, 'ArrowRight', page), press(w2, 'Enter', button), press(w2, 'ArrowLeft', page), press(w2, 'ArrowLeft', button)].every(e => e.prevented) && !press(w2, 'a', page).prevented && JSON.stringify(w2.calls) === JSON.stringify(['next 1', 'next 1', 'next -1', 'next -1']);
        // Esc never ends the tour by itself: it asks (from a field too), and the tour is ended only by the question's own button
        const w3 = world(), esc = press(w3, 'Escape', box), asked = esc.prevented && esc.stopped && JSON.stringify(w3.calls) === JSON.stringify(['ask']) && !/endTour/.test(lf.slice(a, z));
        const w4 = world(); w4.tour.active = false; const off = ['Escape', 'ArrowRight', 'Enter', 'ArrowLeft'].every(k => !press(w4, k, page).prevented) && w4.calls.length === 0;
        // paused (Try it yourself): every key is the app's
        const w5 = world(); w5.tour.paused = true; const paused = ['Escape', 'ArrowRight', 'Enter', 'ArrowLeft'].every(k => { const e = press(w5, k, page); return !e.prevented && !e.stopped; }) && w5.calls.length === 0;
        // the question up: the arrows and Enter move nothing and are left to the focused button; Esc asks again, which takes the question away
        const w6 = world(); w6.tour.asking = true; const asking = ['ArrowRight', 'Enter', 'ArrowLeft'].every(k => !press(w6, k, button).prevented) && w6.calls.length === 0 && press(w6, 'Escape', page).prevented && JSON.stringify(w6.calls) === JSON.stringify(['ask']);
        const wired = /document\.addEventListener\('keydown', tourKey, true\);/.test(lf);
        res = spared && moved && asked && off && paused && asking && wired; why = JSON.stringify({ spared, moved, asked, off, paused, asking, wired, calls: w1.calls });
    }
    if (res) console.log('ok        the tour\'s keys (run for real): while the tour is up, Right arrow, Enter and Left arrow pressed in a field are the field\'s — a planner\'s box (editable as plain text only) and a run inside it, a text block, an input, a textarea, a list — and the tour does not move; anywhere else they go on and back; Esc asks before the tour ends, from anywhere, and never ends it by itself; while the question is up the arrows and Enter move nothing and Esc takes it away; while the tour is paused (Try it yourself) and with the tour off no key is touched');
    else { bad++; console.log('FAIL      the tour\'s keys: Right arrow, Enter and Left arrow in a field (a planner\'s box among them) must be left to the field', why); }
}
// The tour's engine (1.5.1): where a tour ended is kept, a step's text is laid out to be read without a word of it changing, each step's
// stage is reset before its own setup, and the card, the shield and Try it yourself are wired. Slices run for real; the rest pinned.
// The short tour (1.5.4): every step is held to the plain-words rule, names the Help entry that holds the rest of it (More in Help, run
// for real), and sets nothing in bold that Help does not know.
{
    const nl = String.fromCharCode(10), lf = src.replace(/\r\n/g, nl), css = fs.readFileSync(path.join(app, 'style.css'), 'utf8').replace(/\r\n/g, nl), page = html.replace(/\r\n/g, nl);
    const cut = name => { const a = lf.indexOf('// [tutorialcheck:' + name + '-start]'), z = lf.indexOf('// [tutorialcheck:' + name + '-end]'); if (a < 0 || z < a) throw new Error('tutorialcheck: the ' + name + ' slice is not marked in tutorial.js'); return lf.slice(a, z); };
    // (a) the place: only a whole step past the first and before the last is kept or read; a store that throws is never an error
    const store = {}, ls = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
    const mk = l => new Function('localStorage', 'STEPS', 'TUTORIAL_VERSION', '"use strict";' + nl + cut('place') + nl + 'return { tourAt: tourAt, rememberAt: rememberAt };')(l, { length: 10 }, '9.9.9');
    const P = mk(ls), at = v => { if (v === undefined) delete store.wp_tourAt; else store.wp_tourAt = v; return P.tourAt(); };
    P.rememberAt(4); const kept = P.tourAt() === 4 && JSON.parse(store.wp_tourAt).v === '9.9.9';
    P.rememberAt(0); const first = !('wp_tourAt' in store); P.rememberAt(5); P.rememberAt(9); const last = !('wp_tourAt' in store); P.rememberAt(5); P.rememberAt('3'); const word = !('wp_tourAt' in store);
    const hostile = [undefined, '', 'x', 'null', '7', '{"i":0}', '{"i":9}', '{"i":-2}', '{"i":2.5}', '{"i":"3"}', '{"i":99}', '[3]', '{"i":null}'].every(v => at(v) === 0) && at('{"i":8}') === 8 && at('{"i":1,"v":"old"}') === 1;
    const thrower = mk({ getItem() { throw new Error('no'); }, setItem() { throw new Error('no'); }, removeItem() { throw new Error('no'); } });
    let quiet = true; try { quiet = thrower.tourAt() === 0; thrower.rememberAt(3); thrower.rememberAt(0); } catch (e) { quiet = false; }
    const placeOk = kept && first && last && word && hostile && quiet;
    // (b) the text: a short step stands as it is, a longer one is a lead and one point a sentence, cut only between sentences and never inside a
    // tag; every step's words, tags and their order exactly its own; no fold (no step is long enough for one: see the plain-words rule below)
    const J = JSON.stringify, B = new Function('"use strict";' + nl + cut('blocks') + nl + 'return { blocks: tourBlocks, pieces: tourPieces, len: tourLen };')();
    const piecesOk = J(B.pieces('One. Two three. <b>Four. Five</b> six. Seven e.g. this. Eight')) === J(['One.', 'Two three.', '<b>Four. Five</b> six.', 'Seven e.g. this.', 'Eight'])
        && J(B.pieces('A &amp; b. &#9654; D. e')) === J(['A &amp; b.', '&#9654; D. e']) && J(B.pieces('Is it? Yes! Done: a, b.')) === J(['Is it?', 'Yes!', 'Done: a, b.']) && B.pieces('').length === 0 && B.len('<b>a&amp;b</b> c') === 5;
    const shortOk = B.blocks('One. Two. Three.') === '<p>One. Two. Three.</p>' && B.blocks(null) === '<p></p>';
    const xs = 'X' + 'x'.repeat(149), ys = 'Y' + 'y'.repeat(149), zs = 'Z' + 'z'.repeat(149), at380 = 'A' + 'a'.repeat(124) + '. B' + 'b'.repeat(124) + '. C' + 'c'.repeat(124) + '.';
    const longOk = B.blocks('Lead sentence here. ' + xs + '. ' + ys + '. ' + zs + '.') === '<p class="tour-lead">Lead sentence here.</p><ul class="tour-pts"><li>' + xs + '.</li><li>' + ys + '.</li><li>' + zs + '.</li></ul>'
        && B.blocks(' Lead sentence here. ' + xs + '. ' + ys + '. ' + zs + '. ') === '<p class="tour-lead">Lead sentence here.</p><ul class="tour-pts"><li>' + xs + '.</li><li>' + ys + '.</li><li>' + zs + '.</li></ul>'      // a space before or after the text is no part of a point
        && B.blocks(xs + xs + '. ' + ys + ys + '.') === '<p>' + xs + xs + '. ' + ys + ys + '.</p>'      // long, but two sentences: one paragraph
        && B.len(at380) === 380 && B.blocks(at380) === '<p>' + at380 + '</p>' && B.blocks('A' + at380).indexOf('<p class="tour-lead">') === 0      // 380 characters stand, 381 are a lead and points
        && !/details|summary|More about/.test(cut('blocks'));
    const lits = [...lf.matchAll(/^\s*html: ('(?:[^'\\]|\\.)*')/gm)].map(m => new Function('return ' + m[1] + ';')());
    const stepCount = (lf.match(/^\s*\{ (?:section: '[^']*', )?target: /gm) || []).length;
    const norm = h => h.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
    const inline = h => (h.match(/<\/?(?!p\b|ul\b|li\b)[a-z]+[^>]*>/gi) || []).join('');
    const formed = h => { const st = []; for (const m of h.matchAll(/<(\/?)([a-z0-9]+)[^>]*>/gi)) { const t = m[2].toLowerCase(); if (t === 'br') continue; if (m[1]) { if (st.pop() !== t) return false; } else st.push(t); } return st.length === 0; };
    const wrong = [];
    lits.forEach((h, i) => { const o = B.blocks(h); if (norm(o) !== norm(h) || inline(o) !== inline(h) || !formed(o) || /<(script|style|iframe|img|a|details)\b|\son[a-z]+\s*=/i.test(o)) wrong.push(i); });
    const laidOut = lits.filter(h => /^<p class="tour-lead">/.test(B.blocks(h))).length;
    const blocksOk = piecesOk && shortOk && longOk && lits.length === stepCount && stepCount >= 39 && wrong.length === 0;
    // the plain-words rule (the owner, 2026-10-04, of a tour card: "too many parenthesis, em dashes, its just a bunch of run on information"; by
    // prompt: "Short tour, detail in Help"). A step says what a thing is and the few things you do with it: no bracket, no dash, no semicolon,
    // at most 450 characters and seven sentences, no sentence past 140. The rule is tried first on text that breaks it, one way at a time.
    const plain = h => { const v = h.replace(/<[^>]*>/g, ''), out = [], ss = B.pieces(h);
        if (/[()\[\]]/.test(v)) out.push('bracket');
        if (/[\u2012-\u2015]|&[mn]dash;|&#821[0-3];|&#x201[2-5];| - | -- /i.test(v)) out.push('dash');
        if (/;/.test(v.replace(/&[#\w]{1,8};/g, ''))) out.push('semicolon');
        if (B.len(h) > 450) out.push('long');
        if (ss.length > 7) out.push('sentences');
        if (ss.some(s => B.len(s.trim()) > 140)) out.push('run-on');
        return out; };
    const ruleOk = plain('A plain step. It says two things.').length === 0 && plain('Press <b>Go</b> &#9656; <kbd>Ctrl</kbd> + <kbd>K</kbd>, a right-click, then wait&hellip; It&rsquo;s done: all of it.').length === 0
        && J(plain('A step (with an aside).')) === J(['bracket']) && J(plain('A step [so].')) === J(['bracket']) && J(plain('A step \u2014 with a dash.')) === J(['dash']) && J(plain('A step \u2013 so.')) === J(['dash']) && J(plain('A step &mdash; so.')) === J(['dash'])
        && J(plain('A step &ndash; so.')) === J(['dash']) && J(plain('A step &#8212; so.')) === J(['dash']) && J(plain('A step &#x2014; so.')) === J(['dash']) && J(plain('A step - so.')) === J(['dash']) && J(plain('One thing; another.')) === J(['semicolon'])
        && J(plain('A' + 'a'.repeat(140) + '.')) === J(['run-on']) && plain('A' + 'a'.repeat(138) + '.').length === 0 && J(plain('Ab cd ef. '.repeat(8))) === J(['sentences']) && plain('Ab cd ef. '.repeat(7)).length === 0
        && J(plain(('L' + 'l'.repeat(118) + '. ').repeat(4))) === J(['long']) && plain(('L' + 'l'.repeat(109) + '. ').repeat(4)).length === 0 && B.len(('L' + 'l'.repeat(109) + '. ').repeat(4)) === 448;
    const rough = lits.map((h, i) => i + ' ' + plain(h).join('+')).filter(x => / ./.test(x));
    const longest = Math.max(...lits.map(h => B.len(h))), longestS = Math.max(...lits.map(h => Math.max(...B.pieces(h).map(s => B.len(s.trim())))));
    const plainOk = ruleOk && rough.length === 0 && lits.length >= 39;
    // (c) the stage: what a step's setup opens is told by its target, everything else is put away first — and every real step that opens the
    // System editor, a sheet or Settings is recognised (else its own stage would be closed under it)
    const S = new Function('"use strict";' + nl + cut('stage') + nl + 'return stageFor;')();
    const all = o => JSON.stringify(S(o));
    const stageOk = all({ target: '#sysLayout' }) === all({ target: '#sysItems' }) && S({ target: '#sysCombatBox' }).editor === true && S({ target: '#systemBtn' }).editor === false && S({ target: '#sheetPanel' }).sheet === true && S({ target: '#hudLayer .hud-panel', opens: true }).sheet === true
        && S({ target: '#setVttCampBlock' }).settings === true && S({ target: '#diceBtn' }).chat === true && S({ target: '#fogModeBtn' }).fog === true && all({ target: null }) === JSON.stringify({ editor: false, sheet: false, settings: false, chat: false, fog: false, right: false }) && S({ target: '#sidebar' }).right === true && all({ target: '#whiteboardWrap' }) === all({ target: null });
    const lines = lf.split(nl), steps = [];
    lines.forEach((l, i) => { const m = /^\s*\{ (?:section: '[^']*', )?target: (null|'[^']*'),( opens: true,)? title: /.exec(l); if (m) steps.push({ target: m[1] === 'null' ? null : m[1].slice(1, -1), opens: !!m[2], from: i }); });
    steps.forEach((s, k) => { s.text = lines.slice(s.from, k + 1 < steps.length ? steps[k + 1].from : s.from + 4).join(nl); const b = s.text.indexOf('before: function()'); s.before = b < 0 ? '' : s.text.slice(b); });
    const OPENS_CHAT = /chatBtn|wpChat\.openPanel/;   // a step's setup opens Table Chat: by its button, or through the chat's own opener (1.5.4)
    const unknown = steps.filter(s => { const n = S(s); return (/wpSheets\.open\(/.test(s.before) && !n.editor) || (/wpSheets\.openSheet\(/.test(s.before) && !n.sheet) || (/openSettingsForTour\(\)/.test(s.before) && !n.settings) || (/setPreview\('party'\)/.test(s.before) && !n.fog) || (OPENS_CHAT.test(s.before) && !n.chat) || (/openRightForTour\(\)/.test(s.before) && !n.right); }).map(s => s.target);
    const dataStep = steps.find(s => s.target === '#dataFloatingToolbar');
    const stagePinned = /try \{ clearStage\(step\); \} catch \(e\) \{[^\n]*\n[^\n]*closeHuds\(\);[^\n]*\n\s*try \{ if \(step\.before\) step\.before\(\); \}/.test(lf) && /function clearStage\(step\) \{\n\s*var need = stageFor\(step\);\n[^\n]*ensureTutorialCampaign\(false\);\n\s*openLeft\(\);/.test(lf)
        && /if \(!need\.settings\) closeSettingsForTour\(\);\n\s*if \(!need\.right\) closeRightForTour\(\);/.test(lf) && /window\.wpSyncRightPanel\(\); openRightForTour\(\); \} \},/.test(lf) && /\{ target: '#mapNavList', title: 'Finding things',/.test(lf) && /if \(!need\.editor\) window\.wpSheets\.close\(true\); if \(!need\.sheet\) window\.wpSheets\.closeSheet\(\);/.test(lf) && /if \(!need\.fog && window\.wpFog\) window\.wpFog\.setPreview\('off'\);/.test(lf)
        && steps.length === stepCount && unknown.length === 0 && steps.some(s => s.target === '#diceBtn' && OPENS_CHAT.test(s.before)) && !!dataStep && /openItem\('map_tut_city'\); goView\('data'\);/.test(dataStep.before);
    // (d) the card, the shield, Try it yourself and Resume, pinned
    const wiredOk = /window\.addEventListener\(t, function\(e\) \{ if \(tour\.active && !tour\.paused && e\.target === tour\.shield\) \{ e\.stopPropagation\(\); e\.preventDefault\(\); \} \}, true\);/.test(lf)
        && /ov\.innerHTML = '<div id="tourShield"><\/div><div id="tourSpot"><\/div><div id="tourCard"/.test(lf)
        && /\[ov, chip\]\.forEach\(function\(n\) \{ n\.addEventListener\(t, function\(e\) \{ e\.stopPropagation\(\); \}\); \}\);/.test(lf) && /window\.addEventListener\('click', function\(\) \{ if \(tour\.active\) setTimeout\(heal, 0\); \}, true\);/.test(lf)
        && /if \(q\('tourTry'\)\) q\('tourTry'\)\.addEventListener\('click', pauseTour\);/.test(lf) && /chip\.querySelector\('#tourResume'\)\.addEventListener\('click', resumeTour\);/.test(lf) && /if \(q\('tourEndNow'\)\) q\('tourEndNow'\)\.addEventListener\('click', endTour\);/.test(lf)
        && /tour\.i = i; tour\.asking = false;\n\s*rememberAt\(i\);/.test(lf) && /if \(!wasPaused\) \{/.test(lf) && /if \(partWay\) toast\(/.test(lf) && /<div class="tour-body">' \+ tourBlocks\(step\.html\) \+ '<\/div>'/.test(lf)
        && /cw = Math\.min\(r \? 380 : 460, W - 24\), x, y;/.test(lf) && /if \(tour\.pos\) \{ x = tour\.pos\.x; y = tour\.pos\.y; \}[^\n]*\n\s*x = Math\.max\(12, Math\.min\(x, W - cw - 12\)\); y = Math\.max\(12, Math\.min\(y, H - ch - 12\)\);/.test(lf)
        && /rs\.addEventListener\('click', function\(\) \{ startTour\(tourAt\(\)\); \}\);/.test(lf) && page.includes('id="tourResumeBtn"')
        && /#tourShield \{ position:fixed; inset:0; pointer-events:auto; \}/.test(css) && /#tourCard \{ position:fixed; pointer-events:auto; display:flex; flex-direction:column; max-height:calc\(100vh - 24px\);/.test(css) && /#tourCard \.tour-body \{ flex:1 1 auto; min-height:56px; overflow-y:auto;/.test(css) && /#tourCard > \* \{ flex:0 0 auto; \}/.test(css);
    const wordsOk = page.includes('Press <b>Try it yourself</b> to put the card away and use the app') && page.includes('<kbd>Esc</kbd> asks before it ends the tour') && page.includes('keeps its place') && page.includes('<b>More in Help</b> under a card puts the card away and opens the part of Help that holds the rest.')
        && lf.includes('<b>Try it yourself</b> puts the card away') && lf.includes('<b>Esc</b> asks before it ends the tour, and your place is kept.') && lf.includes('<b>More in Help</b> under a card opens the part of Help that says the rest.') && !/More about this/.test(page + lf + css) && !/tour\.wide/.test(lf);
    if (placeOk && blocksOk && stageOk && stagePinned && wiredOk && wordsOk) console.log('ok        the tour\'s engine: where a tour ended part-way is kept (a whole step past the first and before the last; anything else stored reads as the start; a store that throws is no error); a step\'s text stands as it is, or as a lead and one point a sentence when it is long, with every word, tag and their order its own (' + lits.length + ' steps, ' + laidOut + ' as points), cut only between sentences and never inside a tag, and never folded; what a step\'s setup opens is told by its target and everything else is put away first, every real step recognised; the shield, Try it yourself, Resume, the question before the end, the card that fits the window and Help\'s words pinned');
    else { bad++; console.log('FAIL      the tour\'s engine', JSON.stringify({ placeOk, kept, first, last, word, hostile, quiet, blocksOk, piecesOk, shortOk, longOk, lits: lits.length, stepCount, wrong, laidOut, stageOk, stagePinned, unknown, wiredOk, wordsOk })); }
    if (plainOk) console.log('ok        the tour is short and plain (the owner, 2026-10-04): no step has a bracket, a dash or a semicolon, none is past 450 characters or seven sentences, and no sentence is past 140 (the longest step ' + longest + ', the longest sentence ' + longestS + '); the rule is tried on text that breaks it each way, and on text that is at each limit');
    else { bad++; console.log('FAIL      the tour is short and plain: a step breaks the rule (step number from 0, and how) ' + JSON.stringify({ ruleOk, rough, longest, longestS }) + ' — say it in short sentences and move the detail to Help'); }
    // More in Help: a step names the Help entry that holds the rest of it, and the card offers it. helpName, helpFind and tourHelp (the helpat
    // slice) run for real: on made-up panes for the rule, and on Help as index.html writes it for every pointer the steps hold.
    const ENT = { amp: '&', rsquo: '\u2019', lsquo: '\u2018', hellip: '\u2026', mdash: '\u2014', ndash: '\u2013', nbsp: ' ', times: '\u00d7', rarr: '\u2192', larr: '\u2190', lt: '<', gt: '>', quot: '"', middot: '\u00b7', minus: '\u2212', plusmn: '\u00b1', ldquo: '\u201c', rdquo: '\u201d', deg: '\u00b0', frac12: '\u00bd', frac34: '\u00be', sup2: '\u00b2', divide: '\u00f7', radic: '\u221a', bull: '\u2022', rsaquo: '\u203a', uarr: '\u2191', darr: '\u2193', Omega: '\u03a9' };
    const dec = s => s.replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&([a-z][a-z0-9]*);/gi, (m, n) => (n in ENT ? ENT[n] : m));
    const textOf = s => dec(s.replace(/<[^>]*>/g, ''));
    const helpA = page.indexOf('id="helpModal"'), helpZ = page.indexOf('<div class="layout-wrapper">', helpA), helpSrc = helpA > 0 && helpZ > helpA ? page.slice(helpA, helpZ) : '', panes = {};
    helpSrc.split('<div class="help-pane" data-pane="').slice(1).forEach(p => {
        const id = p.slice(0, p.indexOf('"')), opens = [], re = /<(h4|li|p|div class="help-tip")\b[^>]*>/g; let m;
        while ((m = re.exec(p))) opens.push({ tag: m[1] === 'h4' ? 'H4' : m[1] === 'li' ? 'LI' : m[1] === 'p' ? 'P' : 'DIV', at: m.index, end: m.index + m[0].length });
        panes[id] = opens.map((o, i) => { const body = p.slice(o.end, i + 1 < opens.length ? opens[i + 1].at : p.length), b = /<b>([\s\S]*?)<\/b>/.exec(body);
            return { tagName: o.tag, textContent: textOf(o.tag === 'H4' ? body.slice(0, body.indexOf('</h4>')) : body), querySelector: q => (q === 'b' && b ? { textContent: textOf(b[1]) } : null) }; });
    });
    const docOf = map => ({ querySelector: sel => { const m = /^#helpModal \.help-pane\[data-pane="([^"]*)"\]$/.exec(sel), list = m && Object.prototype.hasOwnProperty.call(map, m[1]) ? map[m[1]] : null; return list ? { querySelectorAll: q => (q === 'h4, li, p, .help-tip' ? list : []) } : null; } });
    const mkH = (doc, STEPS, tour, pause, clear, win, later) => new Function('document', 'STEPS', 'tour', 'pauseTour', 'clearStage', 'window', 'setTimeout', 'console', '"use strict";' + nl + cut('helpat') + nl + 'return { name: helpName, find: helpFind, go: tourHelp };')(doc, STEPS || [], tour || {}, pause || (() => {}), clear || (() => {}), win || {}, later || (() => {}), { warn() {} });
    const h0 = mkH(docOf(panes));
    const nameOk = h0.name('\ud83c\udfb5 Sound') === 'Sound' && h0.name('Layout:') === 'Layout' && h0.name('  The   HUD. ') === 'The HUD' && h0.name('Edit sheet and Lock sheet.') === 'Edit sheet and Lock sheet' && h0.name(null) === '' && h0.name('Linked maps (doors, stairs, warps)') === 'Linked maps (doors, stairs, warps)' && h0.name('2 x 4') === '2 x 4';
    const mkEl = (tag, text, bold) => ({ tagName: tag, textContent: text, querySelector: q => (q === 'b' && bold !== undefined ? { textContent: bold } : null) });
    const fake = [mkEl('LI', 'Sound: an entry', 'Sound:'), mkEl('H4', 'Other'), mkEl('LI', 'x', 'Twice'), mkEl('LI', 'y', 'Twice'), mkEl('H4', 'Sound'), mkEl('P', 'no bold here'), mkEl('LI', 'z', '\u2728 Sparks.'), mkEl('H4', 'Sound'), mkEl('LI', 'a bullet for its bold words', '\u2022')], hf = mkH(docOf({ p: fake }));
    const findOk = hf.find('p', 'Sound') === fake[4] && hf.find('p', 'Twice') === fake[2] && hf.find('p', 'Sparks') === fake[6] && hf.find('p', 'Other') === fake[1] && hf.find('p', 'Nothing') === null && hf.find('q', 'Sound') === null && hf.find('p', '') === null && hf.find('p', 'no bold here') === null && hf.find('__proto__', 'Sound') === null;
    // the press, run for real: the card goes as for Try it yourself, the stage is cleared as for a step that needs nothing, Help opens at the pane, the entry is brought into view and marked
    const press = (step, st, win) => { const calls = [], el = { tagName: 'H4', textContent: 'Fog of war', offsetWidth: 1, classList: { add: c => calls.push('add ' + c), remove: c => calls.push('remove ' + c) }, scrollIntoView: () => calls.push('scroll') }, tour = Object.assign({ i: 0, active: true, paused: false }, st);
        mkH(docOf({ whiteboard: [el] }), [step], tour, () => { calls.push('pause'); tour.paused = true; }, s => calls.push('clear ' + J(s)), win === undefined ? { wpOpenHelp: p => calls.push('open ' + p) } : win, fn => { calls.push('later'); fn(); }).go(); return calls; };
    const fogAt = { help: ['whiteboard', 'Fog of war'] };
    const goOk = J(press(fogAt)) === J(['pause', 'clear {}', 'open whiteboard', 'later', 'scroll', 'remove help-hit', 'add help-hit', 'later', 'remove help-hit'])
        && press({}).length === 0 && press(fogAt, { active: false }).length === 0 && press(fogAt, { paused: true }).length === 0 && press(fogAt, { i: 3 }).length === 0
        && J(press({ help: ['whiteboard', 'Not there'] })) === J(['pause', 'clear {}', 'open whiteboard']) && J(press({ help: ['nopane', 'Fog of war'] })) === J(['pause', 'clear {}', 'open nopane']) && J(press(fogAt, {}, {}).slice(0, 3)) === J(['pause', 'clear {}', 'later']);
    // every pointer the steps hold, against Help as written: found, in one place only (one heading of that name; with none, one entry), and every step has one but the Help step and the last.
    // A heading's name leads no entry of its part: with both, a renamed heading left the pointer landing on the entry, and nothing failed
    const helps = [...lf.matchAll(/^\s*help: \['([^']*)', '([^']*)'\]/gm)].map(m => [m[1], m[2]]);
    const countIn = (map, p, n, head) => (map[p] || []).filter(e => (e.tagName === 'H4') === head && (head ? h0.name(e.textContent) : (e.querySelector('b') ? h0.name(e.querySelector('b').textContent) : null)) === h0.name(n)).length;
    // what is wrong with a pointer, or '': no such part, no place, a name on two headings or on two entries, or on a heading and an entry
    const pointerBad = (map, p, n) => { if (!/^[a-z-]+$/.test(p) || !Object.prototype.hasOwnProperty.call(map, p)) return 'no part'; const h = countIn(map, p, n, true), e = countIn(map, p, n, false); return h + e === 0 ? 'no place' : h > 1 || (h === 0 && e > 1) ? 'twice' : h === 1 && e > 0 ? 'both' : ''; };
    const ptrFake = { p: [mkEl('H4', 'Solo'), mkEl('LI', 'x', 'Entry:'), mkEl('H4', 'Pair'), mkEl('LI', 'y', 'Pair'), mkEl('H4', 'Two'), mkEl('H4', 'Two'), mkEl('LI', 'z', 'Twin'), mkEl('P', 'w', 'Twin.'), mkEl('LI', 'no bold')] };
    const ptrOk = pointerBad(ptrFake, 'p', 'Solo') === '' && pointerBad(ptrFake, 'p', 'Entry') === '' && pointerBad(ptrFake, 'p', 'Pair') === 'both' && pointerBad(ptrFake, 'p', 'Two') === 'twice' && pointerBad(ptrFake, 'p', 'Twin') === 'twice'
        && pointerBad(ptrFake, 'p', 'Nowhere') === 'no place' && pointerBad(ptrFake, 'q', 'Solo') === 'no part' && pointerBad(ptrFake, 'P!', 'Solo') === 'no part' && pointerBad(ptrFake, 'p', 'no bold') === 'no place';
    const lost = helps.map(([p, n]) => [p, n, pointerBad(panes, p, n) || (h0.find(p, n) ? '' : 'not found')]).filter(x => x[2]).map(x => x[0] + ' > ' + x[1] + ' (' + x[2] + ')');
    const bare = steps.filter(s => !/^\s*help: \[/m.test(s.text)).map(s => s.target), paneIds = Object.keys(panes);
    const cardOk = /'<\/h3><div class="tour-body">' \+ tourBlocks\(step\.html\) \+ '<\/div>' \+ \(step\.help \? '<button class="tour-help" id="tourHelp"[^\n]*>More in Help &#9656; ' \+ esc\(step\.help\[1\]\) \+ '<\/button>' : ''\) \+ '<div class="tour-btns"><\/div>';/.test(lf)
        && /if \(q\('tourHelp'\)\) q\('tourHelp'\)\.addEventListener\('click', tourHelp\);/.test(lf) && /#tourCard \.tour-help \{[^}]*cursor:pointer;[^}]*\}/.test(css) && /#tourChip \{[^}]*z-index:100001;/.test(css) && /id="helpModal" style="[^"]*z-index:99999;/.test(page);
    const helpOk = nameOk && findOk && goOk && ptrOk && paneIds.length >= 12 && helps.length === stepCount - 2 && lost.length === 0 && J(bare) === J(['#helpBtn', null]) && cardOk;
    if (helpOk) console.log('ok        More in Help (the helpat slice run for real): a step names the Help entry that holds the rest of it — a heading by its own words, any other entry by its first bold words, read without a leading symbol and a closing colon or full stop; a heading is taken before an entry, the first entry before a later one — and all ' + helps.length + ' pointers land on Help as index.html writes it, each in one place only (a heading, or one entry, never a heading and an entry of the same name: that rule is tried on a made-up part each way); every step has one but the Help step and the last; the card shows the button only for such a step; its press puts the card away as Try it yourself does, clears the stage as for a step that needs nothing (the System editor and Settings sit over Help), opens Help at the pane and brings the entry into view, marked; nothing for a step with no pointer, a tour that is off or paused; an entry or a pane that is not there still opens Help; the chip sits over Help');
    else { bad++; console.log('FAIL      More in Help', JSON.stringify({ nameOk, findOk, goOk, ptrOk, panes: paneIds.length, helps: helps.length, stepCount, lost, bare, cardOk })); }
    // nothing the tour names has gone stale: every name a step sets in bold is in Help's own text, or is one of the Tutorial campaign's own
    // names (what this file builds and says outside its steps)
    const flat = s => textOf(s).replace(/[\u2019\u2018']/g, "'").replace(/\u2026/g, '...').replace(/\s+/g, ' ').trim().toLowerCase();
    const stepsA = lf.indexOf('var STEPS = ['), stepsZ = lf.indexOf(nl + '];', stepsA), helpFlat = flat(helpSrc), demoFlat = flat(lf.slice(0, stepsA) + lf.slice(stepsZ));
    const names = [], strange = []; lits.forEach((h, i) => { for (const m of h.matchAll(/<b>([\s\S]*?)<\/b>/g)) { const t = flat(m[1]).replace(/\.\.\.$/, ''); if (t.length < 2) continue; names.push(t); if (helpFlat.indexOf(t) < 0 && demoFlat.indexOf(t) < 0) strange.push(i + ' ' + t); } });
    if (stepsA > 0 && stepsZ > stepsA && helpFlat.length > 50000 && names.length > 100 && strange.length === 0) console.log('ok        nothing the tour names is unknown: every name a step sets in bold (' + names.length + ' of them) is in Help\'s own text, or is one of the Tutorial campaign\'s own names — so a control that is renamed, or a feature Help no longer tells of, fails here until its step is put right');
    else { bad++; console.log('FAIL      the tour names something Help does not (step number from 0, and the name): ' + JSON.stringify(strange) + ' — Help holds every feature, so name it as Help does, or tell of it in Help'); }
    // Help in plain words (backlog 121; the owner, 2026-10-04, of a tour card: "too many parenthesis, em dashes, its just a bunch of run on
    // information", and by prompt, 2026-10-05: "A part at a time"). A part of Help that has had its reading is held to the rule from then
    // on: no bracket, no dash, no semicolon, no sentence past 160 characters, no entry past 800. What is set as code or as a key (a formula,
    // Ctrl + K) is no prose and is not judged. HELP_PLAIN names the parts done so far (the count below is raised with each part, so that a
    // part cannot drop out of the list unseen). The rule is tried first on text that breaks it.
    // A named entity is read as its character (a half, a degree sign); one the decoder does not know is said as such, for its closing
    // mark would otherwise read as a semicolon and send the writer after the wrong thing. A sentence is measured as it is read (hLen):
    // an entry's lead is followed by a line break, indentation and its nested list's tag, and none of that is the sentence's length.
    const HELP_PLAIN = ['start', 'whiteboard', 'mp-gm', 'grids', 'sheets', 'planners', 'handbook', 'dice', 'mp-player'];
    const proseOf = h => h.replace(/<(code|kbd)\b[^>]*>[\s\S]*?<\/\1>/g, '<i>x</i>');
    const hLen = s => B.len(s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim());   // a sentence as it is read: no tag, and the line break and indentation before a nested list are not its length
    const helpRule = h => { const p = proseOf(h), v = dec(p.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim(), out = [];
        if (/[()\[\]]/.test(v)) out.push('bracket');
        if (/[\u2012-\u2015]| - | -- /.test(v)) out.push('dash');
        if (/;/.test(v)) out.push('semicolon');
        if (v.length > 800) out.push('long');
        if (B.pieces(p).some(s => hLen(s) > 160)) out.push('run-on');
        if (/&[a-z][a-z0-9]*;/i.test(v)) out.push('entity');   // one the decoder does not know: add it to ENT
        return out; };
    const entriesOf = id => { const a = helpSrc.indexOf('<div class="help-pane" data-pane="' + id + '"'); if (a < 0) return null; const z = helpSrc.indexOf('<div class="help-pane" data-pane="', a + 10), p = helpSrc.slice(a, z < 0 ? helpSrc.length : z), opens = [], re = /<(h4|li|p)\b[^>]*>|<(div) class="help-tip">/g; let m;
        while ((m = re.exec(p))) opens.push([m.index, m.index + m[0].length, m[1] || m[2]]);
        return opens.map((o, i) => { const body = p.slice(o[1], i + 1 < opens.length ? opens[i + 1][0] : p.length), end = body.indexOf('</' + o[2] + '>'); return end < 0 ? body : body.slice(0, end); }); };   // each entry up to its own closing tag
    const hRuleOk = helpRule('A plain entry. It says two things: one, and the other.').length === 0 && helpRule('Press <kbd>Ctrl + K</kbd>, then read <code>max(a; b) - (c)</code>. It&rsquo;s done &#9656; next.').length === 0
        && J(helpRule('An entry (with an aside).')) === J(['bracket']) && J(helpRule('An entry [so].')) === J(['bracket']) && J(helpRule('An entry &mdash; so.')) === J(['dash']) && J(helpRule('An entry \u2013 so.')) === J(['dash']) && J(helpRule('An entry &#8212; so.')) === J(['dash']) && J(helpRule('An entry - so.')) === J(['dash'])
        && J(helpRule('One thing; another.')) === J(['semicolon']) && J(helpRule('A' + 'a'.repeat(160) + '.')) === J(['run-on']) && helpRule('A' + 'a'.repeat(158) + '.').length === 0
        && J(helpRule(('L' + 'l'.repeat(97) + '. ').repeat(8) + 'Tail.')) === J(['long']) && helpRule(('L' + 'l'.repeat(97) + '. ').repeat(8)).length === 0 && J(helpRule('<code>(x)</code> and (y).')) === J(['bracket'])
        && helpRule('Half is &frac12;, a quarter turn 90&deg;, a floor of 5 m&sup2;, up &uarr; and 6 &divide; 2.').length === 0 && J(helpRule('A sign &nosuchname; here.')) === J(['semicolon', 'entity'])
        && helpRule('L' + 'l'.repeat(158) + '.' + nl + ' '.repeat(30) + '<ul>' + nl + ' '.repeat(34)).length === 0 && J(helpRule('L' + 'l'.repeat(160) + '.' + nl + ' '.repeat(30) + '<ul>' + nl)) === J(['run-on']) && hLen('  A <b>bold</b>   word &amp; one.  ') === 18;
    const hRough = [], hSizes = []; let hLongS = 0, hLongE = 0;
    HELP_PLAIN.forEach(id => { const es = entriesOf(id); if (!es || es.length < 3) { hRough.push(id + ': the part was not found'); return; } hSizes.push(id + ' ' + es.length);
        es.forEach((h, i) => { const r = helpRule(h), t = dec(proseOf(h).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim(); hLongE = Math.max(hLongE, t.length); B.pieces(proseOf(h)).forEach(s => { hLongS = Math.max(hLongS, hLen(s)); }); if (r.length) hRough.push(id + ' entry ' + i + ' ' + r.join('+') + ': ' + t.slice(0, 70)); }); });
    if (hRuleOk && hRough.length === 0 && HELP_PLAIN.length >= 9 && new Set(HELP_PLAIN).size === HELP_PLAIN.length && HELP_PLAIN.every(id => paneIds.indexOf(id) >= 0)) console.log('ok        Help in plain words, a part at a time (the owner, by prompt): each part that has had its reading (' + hSizes.join(', ') + ' entries) has no bracket, no dash and no semicolon outside what is set as code or as a key, no sentence past 160 characters and no entry past 800 (the longest sentence ' + hLongS + ', the longest entry ' + hLongE + '); the rule is tried on text that breaks it each way, and on text at each limit; a named entity is read as its character, and one the decoder does not know is said as such');
    else { bad++; console.log('FAIL      Help in plain words: a part that has had its reading breaks the rule (the part, the entry counted from 0, how, and its first words) ' + JSON.stringify({ hRuleOk, hRough }) + ' — say it in short plain sentences, and split a long entry into points'); }
    // Help's own search, now that an entry may hold points nested under its lead: helpOwnText and helpWhere (whiteboard.js, the helpsearch
    // slice) run for real on a tree of plain objects. An entry is found by its own words, so one match is one result; a point's result
    // names the entry it stands under. Help as written: an entry has a lead before its points, and points are nested one level only.
    const hsWb = fs.readFileSync(path.join(app, 'scripts', 'whiteboard.js'), 'utf8').replace(/\r\n/g, nl), hsA = hsWb.indexOf('// [tutorialcheck:helpsearch-start]'), hsZ = hsWb.indexOf('// [tutorialcheck:helpsearch-end]');
    const HS = hsA > 0 && hsZ > hsA ? new Function('"use strict";' + nl + hsWb.slice(hsA, hsZ) + nl + 'return { own: helpOwnText, where: helpWhere };')() : null;
    const hsTx = s => ({ nodeType: 3, nodeValue: s }), hsEl = (tag, ...kids) => { kids.forEach((k, i) => { k.nextSibling = kids[i + 1] || null; }); return { nodeType: 1, tagName: tag, firstChild: kids[0] || null, nextSibling: null }; };
    const hsPt1 = hsEl('LI', hsTx('Point one.')), hsPt2 = hsEl('LI', hsTx('Point '), hsEl('B', hsTx('two')), hsTx('.')), hsEntry = hsEl('LI', hsEl('B', hsTx('* Sound')), hsTx(' is the panel. '), hsEl('UL', hsPt1, hsPt2), hsTx('tail')), hsGt = String.fromCharCode(0x203a);
    const hsOwnOk = !!HS && HS.own(hsEntry) === '* Sound is the panel. tail' && HS.own(hsPt1) === 'Point one.' && HS.own(hsPt2) === 'Point two.' && HS.own(hsEl('P', hsTx('a '), hsEl('I', hsTx('b')), hsTx(' c'))) === 'a b c'
        && HS.own(hsEl('LI', hsEl('OL', hsEl('LI', hsTx('x'))))) === '' && HS.own(hsEl('DIV')) === '' && HS.own(hsEl('LI', hsTx('1'), { nodeType: 8, nodeValue: 'a comment' }, hsTx('2'))) === '12';
    const hsWhereOk = !!HS && HS.where('Placing things', '* Sound') === 'Placing things ' + hsGt + ' Sound' && HS.where('Fog of war', ' Light   sources: ') === 'Fog of war ' + hsGt + ' Light sources' && HS.where('H', '') === 'H' && HS.where('H', null) === 'H' && HS.where('H', '***') === 'H' && HS.where('H', 'Three locks on travel.') === 'H ' + hsGt + ' Three locks on travel';
    const hsWiredOk = /\n {18}var text = helpOwnText\(el\)\.replace\(\/\\s\+\/g, ' '\)\.trim\(\);\n/.test(hsWb) && !/el\.textContent \|\| ''\)\.replace/.test(hsWb.slice(hsZ, hsZ + 1500))
        && /var up = el\.tagName === 'LI' && el\.parentElement \? el\.parentElement\.closest\('li'\) : null, lead = up \? up\.querySelector\('b'\) : null;\n {18}if \(lead && lead\.closest\('li'\) !== up\) lead = null;/.test(hsWb)
        && /where: helpWhere\(heading, lead \? lead\.textContent : ''\), el: el, text: text,/.test(hsWb) && /esc\(e\.where\) \+ '<\/span><div class="hr-snip">'/.test(hsWb) && /e\.heading\.toLowerCase\(\)\.indexOf\(phrase\) >= 0 \? 0 : 8/.test(hsWb);
    // Help as written: the depth of lists under each entry, read tag by tag. The rule is tried first on markup that breaks it each way.
    const hsShape = s => { let d = 0, deepest = 0, lists = 0; const out = []; for (const m of s.matchAll(/<(\/?)(ul|ol)\b[^>]*>/g)) { if (m[1]) d--; else { d++; if (d > 1) lists++; deepest = Math.max(deepest, d); } }
        if (d !== 0) out.push('unbalanced'); if (deepest > 2) out.push('deep'); if (/<li>\s*<(ul|ol)\b/.test(s)) out.push('no lead'); if (/<\/(ul|ol)>\s*[^<\s]/.test(s)) out.push('words after'); return { out, lists, deepest }; };
    const hsGood = '<ul><li><b>Lead.</b> Words.' + nl + '  <ul>' + nl + '    <li>Point.</li>' + nl + '  </ul>' + nl + '</li><li>Plain.</li></ul><ol><li>One.</li></ol>';
    const hsRuleOk = J(hsShape(hsGood)) === J({ out: [], lists: 1, deepest: 2 }) && J(hsShape(hsGood.replace('<li>Point.</li>', '<li>Point.<ul><li>Deeper.</li></ul></li>'))) === J({ out: ['deep'], lists: 2, deepest: 3 })
        && J(hsShape(hsGood.replace('<b>Lead.</b> Words.', '')).out) === J(['no lead']) && J(hsShape(hsGood.replace('  </ul>' + nl, '  </ul> And more.' + nl)).out) === J(['words after']) && J(hsShape(hsGood.replace('</ul><ol>', '<ol>')).out) === J(['unbalanced'])
        && J(hsShape('<p>No list at all.</p>')) === J({ out: [], lists: 0, deepest: 0 });
    const hsHelp = hsShape(helpSrc), hsShapeOk = hsRuleOk && hsHelp.out.length === 0 && hsHelp.deepest === 2 && hsHelp.lists >= 10, hsLists = hsHelp.lists;
    if (hsOwnOk && hsWhereOk && hsWiredOk && hsShapeOk) console.log('ok        Help search with nested points (whiteboard.js, run for real on plain objects): an entry is found by its own words, never by the words of the points nested under it, so one match is one result; a point\'s result names its heading and the entry it stands under, read without a leading symbol or a closing colon; the ranking still reads the heading alone; Help as written nests points one level and no deeper (' + hsLists + ' nested lists), every entry has a lead before its points and no words after them; that rule is tried on markup that breaks it each way');
    else { bad++; console.log('FAIL      Help search with nested points', JSON.stringify({ hsOwnOk, hsWhereOk, hsWiredOk, hsRuleOk, hsShapeOk, hsHelp })); }
}
const ver = (src.match(/TUTORIAL_VERSION = '([^']+)'/) || [])[1];
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'system', 'resources', 'app', 'package.json'), 'utf8')).version;
// The tour's version is the app's version of the release its STEPS last changed in, and Help shows it ("Tour version …"): it is a version, and never
// ahead of the app that carries it. A branch cut while a later number was open and folded into an earlier one (1.5.1 opened, then the changes went
// out as 1.5.0 again) would otherwise say "Tour version 1.5.1" inside a 1.5.0 app. Behind the app stays a note: the tour may not have changed.
{
    const parts = v => (/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(String(v)) ? String(v).split('.').map(Number) : null);
    const ahead = (a, b) => { for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] > b[i]; } return false; };
    const isAhead = (a, b) => ahead(parts(a), parts(b));
    // the comparison itself, by number and not by text (1.10.0 is ahead of 1.9.9), an equal version never ahead
    const cmpOk = isAhead('1.5.1', '1.5.0') && !isAhead('1.5.0', '1.5.0') && !isAhead('1.4.9', '1.5.0') && isAhead('1.10.0', '1.9.9') && !isAhead('1.9.9', '1.10.0') && isAhead('2.0.0', '1.99.99') && !isAhead('1.5.0', '1.5.1')
        && parts('1.5') === null && parts('1.5.x') === null && parts(undefined) === null && parts('1.5.0 ') === null;
    const tv = parts(ver), pv = parts(String(pkg).split('-')[0]);
    if (!cmpOk) { bad++; console.log('FAIL      the tour\'s version: the comparison of two versions is wrong'); }
    else if (!tv || !pv) { bad++; console.log('FAIL      the tour\'s version: TUTORIAL_VERSION (' + ver + ') and the app\'s version (' + pkg + ') must each be three numbers, as 1.5.0'); }
    else if (ahead(tv, pv)) { bad++; console.log('FAIL      the tour\'s version ' + ver + ' is ahead of the app\'s ' + pkg + ' — Help would say "Tour version ' + ver + '" inside Waypoint ' + pkg + ': set TUTORIAL_VERSION in scripts/tutorial.js to ' + pkg + ' (the number this change goes out under)'); }
    else console.log('ok        the tour\'s version (' + ver + ') is a version and not ahead of the app\'s (' + pkg + '), compared by number');
}
if (ver !== pkg) console.log('note      tutorial version ' + ver + ' vs app ' + pkg + ' — bump TUTORIAL_VERSION if the tour or demo changed this release');
if (bad) { console.log('\n' + bad + ' tutorial target(s) missing.'); process.exit(1); }
console.log('\nTutorial targets all present (' + targets.length + ' steps checked).');
