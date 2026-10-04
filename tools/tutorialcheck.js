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
    // (b) the text: cut only between sentences, never inside a tag or a bracket; every step's words, tags and their order exactly its own
    const B = new Function('"use strict";' + nl + cut('blocks') + nl + 'return { blocks: tourBlocks, pieces: tourPieces, len: tourLen };')();
    const piecesOk = JSON.stringify(B.pieces('One. Two (a. B) three. <b>Four. Five</b> six. Seven e.g. this. Eight', false)) === JSON.stringify(['One.', 'Two (a. B) three.', '<b>Four. Five</b> six.', 'Seven e.g. this.', 'Eight'])
        && JSON.stringify(B.pieces('A &amp; b; c. &#9654; D; e', true)) === JSON.stringify(['A &amp; b;', 'c.', '&#9654; D;', 'e'])
        && JSON.stringify(B.pieces('A; b. C', false)) === JSON.stringify(['A; b.', 'C']) && B.pieces('', false).length === 0 && B.len('<b>a&amp;b</b> c') === 5;
    const shortOk = B.blocks('One. Two. Three.') === '<p>One. Two. Three.</p>' && B.blocks(null) === '<p></p>';
    const xs = 'X' + 'x'.repeat(199), ys = 'Y' + 'y'.repeat(199), zs = 'Z' + 'z'.repeat(199), ws = 'w'.repeat(200);   // the fourth sentence is too long for one point: cut at its semicolon, its second half given a capital
    const longOut = B.blocks('Lead sentence here. ' + xs + '. ' + ys + '. ' + zs + '; ' + ws + '. Tail one. Tail two.');
    const longOk = longOut === '<p class="tour-lead">Lead sentence here.</p><ul class="tour-pts"><li>' + xs + '.</li><li>' + ys + '.</li><li>' + zs + '</li></ul><details class="tour-more"><summary>More about this (3)</summary><ul class="tour-pts"><li>W' + ws.slice(1) + '.</li><li>Tail one.</li><li>Tail two.</li></ul></details>';
    const lits = [...lf.matchAll(/^\s*html: ('(?:[^'\\]|\\.)*')/gm)].map(m => new Function('return ' + m[1] + ';')());
    const stepCount = (lf.match(/^\s*\{ (?:section: '[^']*', )?target: /gm) || []).length;
    const norm = h => h.replace(/<summary>[^<]*<\/summary>/g, ' ').replace(/<[^>]*>/g, ' ').replace(/[;.]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
    const inline = h => (h.replace(/<summary>[^<]*<\/summary>/g, '').match(/<\/?(?!p\b|ul\b|li\b|details\b)[a-z]+[^>]*>/gi) || []).join('');
    const formed = h => { const st = []; for (const m of h.matchAll(/<(\/?)([a-z0-9]+)[^>]*>/gi)) { const t = m[2].toLowerCase(); if (t === 'br') continue; if (m[1]) { if (st.pop() !== t) return false; } else st.push(t); } return st.length === 0; };
    const wrong = [];
    lits.forEach((h, i) => { const o = B.blocks(h); if (norm(o) !== norm(h) || inline(o) !== inline(h) || !formed(o) || /<(script|style|iframe|img|a)\b|\son[a-z]+\s*=/i.test(o)) wrong.push(i); });
    const laidOut = lits.filter(h => /^<p class="tour-lead">/.test(B.blocks(h))).length, longest = Math.max(...lits.map(h => B.len(B.blocks(h).replace(/<details[\s\S]*$/, ''))));
    const blocksOk = piecesOk && shortOk && longOk && lits.length === stepCount && stepCount >= 39 && wrong.length === 0 && laidOut >= 30 && longest <= 1400;
    // (c) the stage: what a step's setup opens is told by its target, everything else is put away first — and every real step that opens the
    // System editor, a sheet or Settings is recognised (else its own stage would be closed under it)
    const S = new Function('"use strict";' + nl + cut('stage') + nl + 'return stageFor;')();
    const all = o => JSON.stringify(S(o));
    const stageOk = all({ target: '#sysLayout' }) === all({ target: '#sysItems' }) && S({ target: '#sysCombatBox' }).editor === true && S({ target: '#systemBtn' }).editor === false && S({ target: '#sheetPanel' }).sheet === true && S({ target: '#hudLayer .hud-panel', opens: true }).sheet === true
        && S({ target: '#setVttCampBlock' }).settings === true && S({ target: '#diceBtn' }).chat === true && S({ target: '#fogModeBtn' }).fog === true && all({ target: null }) === JSON.stringify({ editor: false, sheet: false, settings: false, chat: false, fog: false, right: false }) && S({ target: '#sidebar' }).right === true && all({ target: '#whiteboardWrap' }) === all({ target: null });
    const lines = lf.split(nl), steps = [];
    lines.forEach((l, i) => { const m = /^\s*\{ (?:section: '[^']*', )?target: (null|'[^']*'),( opens: true,)? title: /.exec(l); if (m) steps.push({ target: m[1] === 'null' ? null : m[1].slice(1, -1), opens: !!m[2], from: i }); });
    steps.forEach((s, k) => { s.text = lines.slice(s.from, k + 1 < steps.length ? steps[k + 1].from : s.from + 4).join(nl); const b = s.text.indexOf('before: function()'); s.before = b < 0 ? '' : s.text.slice(b); });
    const unknown = steps.filter(s => { const n = S(s); return (/wpSheets\.open\(/.test(s.before) && !n.editor) || (/wpSheets\.openSheet\(/.test(s.before) && !n.sheet) || (/openSettingsForTour\(\)/.test(s.before) && !n.settings) || (/setPreview\('party'\)/.test(s.before) && !n.fog) || (/chatBtn/.test(s.before) && !n.chat) || (/openRightForTour\(\)/.test(s.before) && !n.right); }).map(s => s.target);
    const dataStep = steps.find(s => s.target === '#dataFloatingToolbar');
    const stagePinned = /try \{ clearStage\(step\); \} catch \(e\) \{[^\n]*\n[^\n]*closeHuds\(\);[^\n]*\n\s*try \{ if \(step\.before\) step\.before\(\); \}/.test(lf) && /function clearStage\(step\) \{\n\s*var need = stageFor\(step\);\n[^\n]*ensureTutorialCampaign\(false\);\n\s*openLeft\(\);/.test(lf)
        && /if \(!need\.settings\) closeSettingsForTour\(\);\n\s*if \(!need\.right\) closeRightForTour\(\);/.test(lf) && /window\.wpSyncRightPanel\(\); openRightForTour\(\); \} \},/.test(lf) && /\{ target: '#mapNavList', title: 'Finding things',/.test(lf) && /if \(!need\.editor\) window\.wpSheets\.close\(true\); if \(!need\.sheet\) window\.wpSheets\.closeSheet\(\);/.test(lf) && /if \(!need\.fog && window\.wpFog\) window\.wpFog\.setPreview\('off'\);/.test(lf)
        && steps.length === stepCount && unknown.length === 0 && !!dataStep && /openItem\('map_tut_city'\); goView\('data'\);/.test(dataStep.before);
    // (d) the card, the shield, Try it yourself and Resume, pinned
    const wiredOk = /window\.addEventListener\(t, function\(e\) \{ if \(tour\.active && !tour\.paused && e\.target === tour\.shield\) \{ e\.stopPropagation\(\); e\.preventDefault\(\); \} \}, true\);/.test(lf)
        && /ov\.innerHTML = '<div id="tourShield"><\/div><div id="tourSpot"><\/div><div id="tourCard"/.test(lf)
        && /\[ov, chip\]\.forEach\(function\(n\) \{ n\.addEventListener\(t, function\(e\) \{ e\.stopPropagation\(\); \}\); \}\);/.test(lf) && /window\.addEventListener\('click', function\(\) \{ if \(tour\.active\) setTimeout\(heal, 0\); \}, true\);/.test(lf)
        && /if \(q\('tourTry'\)\) q\('tourTry'\)\.addEventListener\('click', pauseTour\);/.test(lf) && /chip\.querySelector\('#tourResume'\)\.addEventListener\('click', resumeTour\);/.test(lf) && /if \(q\('tourEndNow'\)\) q\('tourEndNow'\)\.addEventListener\('click', endTour\);/.test(lf)
        && /tour\.i = i; tour\.asking = false;\n\s*rememberAt\(i\);/.test(lf) && /if \(!wasPaused\) \{/.test(lf) && /if \(partWay\) toast\(/.test(lf) && /<div class="tour-body">' \+ tourBlocks\(step\.html\) \+ '<\/div><div class="tour-btns"><\/div>'/.test(lf)
        && /if \(tour\.pos\) \{ x = tour\.pos\.x; y = tour\.pos\.y; \}[^\n]*\n\s*x = Math\.max\(12, Math\.min\(x, W - cw - 12\)\); y = Math\.max\(12, Math\.min\(y, H - ch - 12\)\);/.test(lf)
        && /rs\.addEventListener\('click', function\(\) \{ startTour\(tourAt\(\)\); \}\);/.test(lf) && page.includes('id="tourResumeBtn"')
        && /#tourShield \{ position:fixed; inset:0; pointer-events:auto; \}/.test(css) && /#tourCard \{ position:fixed; pointer-events:auto; display:flex; flex-direction:column; max-height:calc\(100vh - 24px\);/.test(css) && /#tourCard \.tour-body \{ flex:1 1 auto; min-height:56px; overflow-y:auto;/.test(css) && /#tourCard > \* \{ flex:0 0 auto; \}/.test(css);
    const wordsOk = page.includes('Press <b>Try it yourself</b> to put the card away and use the app') && page.includes('<kbd>Esc</kbd> asks before it ends the tour') && page.includes('keeps its place')
        && lf.includes('<b>Try it yourself</b> puts the card away') && lf.includes('<b>Esc</b> asks before it ends the tour, and your place is kept.') && lf.includes('Hover over a line and a small chip appears') && page.includes('Hover over a line and a small chip appears');
    if (placeOk && blocksOk && stageOk && stagePinned && wiredOk && wordsOk) console.log('ok        the tour\'s engine: where a tour ended part-way is kept (a whole step past the first and before the last; anything else stored reads as the start; a store that throws is no error); a step\'s text is laid out as a lead, points and a fold with every word, tag and their order its own (' + lits.length + ' steps, ' + laidOut + ' laid out, at most ' + longest + ' characters before the fold), cut only between sentences and never inside a tag or a bracket; what a step\'s setup opens is told by its target and everything else is put away first, every real step recognised; the shield, Try it yourself, Resume, the question before the end, the card that fits the window and Help\'s words pinned');
    else { bad++; console.log('FAIL      the tour\'s engine', JSON.stringify({ placeOk, kept, first, last, word, hostile, quiet, blocksOk, piecesOk, shortOk, longOk, lits: lits.length, stepCount, wrong, laidOut, longest, stageOk, stagePinned, unknown, wiredOk, wordsOk })); }
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
